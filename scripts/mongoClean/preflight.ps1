[CmdletBinding()]
param()

# Dot-sourcing defines functions only. No .env, external executable or DB driver.
function Resolve-CleanPath([string]$Value, [string]$Base) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '[\x00-\x1f*?"<>|%]' -or
        $Value -match '^[\\/]{2}' -or
        $Value -match '(^|[\\/])(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|[\\/]|$)') { throw 'RUTA_INVALIDA' }
    foreach ($segment in ($Value -split '[\\/]')) {
        if (($segment -notin @('.', '..') -and $segment -match '[ .]$') -or $segment -match '~[0-9]') { throw 'RUTA_INVALIDA' }
    }
    if ($Value -match ':' -and $Value -notmatch '^[A-Za-z]:[\\/][^:]*$') { throw 'RUTA_INVALIDA' }
    if ($Value -match '^[\\/]' -or $Value -match '^[A-Za-z]:[^\\/]') { throw 'RUTA_INVALIDA' }
    $candidate = if ([IO.Path]::IsPathRooted($Value)) { $Value } else { [IO.Path]::Combine($Base, $Value) }
    return [IO.Path]::GetFullPath($candidate).TrimEnd('\', '/')
}

function Test-CleanOverlap([string]$A, [string]$B) {
    return $A.Equals($B, [StringComparison]::OrdinalIgnoreCase) -or
        $A.StartsWith($B.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $B.StartsWith($A.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-CleanChain([string]$Target, [hashtable]$IO) {
    $cursor = $Target
    $nearest = $null
    while ($cursor) {
        $item = & $IO.Item $cursor
        if ($null -ne $item) {
            if ($item.Reparse -or !$item.Canonical) { throw 'RUTA_NO_CANONICA' }
            if (!$nearest) { $nearest = $item }
            if ($cursor -ne $Target -and !$item.Directory) { throw 'PADRE_NO_DIRECTORIO' }
        } elseif ($nearest) { throw 'CADENA_INCONSISTENTE' }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    if (!$nearest) { throw 'PADRE_NO_VERIFICABLE' }
    return $nearest
}

function Test-CleanPermissionRules($Rules, $AllowSids, $DenySids) {
    $allow = 0
    foreach ($rule in $Rules) {
        if ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) { continue }
        $sid = $rule.IdentityReference.Value
        if ($rule.AccessControlType -eq 'Deny' -and $DenySids -contains $sid) { return $false }
        if ($rule.AccessControlType -eq 'Allow' -and $AllowSids -contains $sid) { $allow = $allow -bor [int]$rule.FileSystemRights }
    }
    $required = [int][Security.AccessControl.FileSystemRights]::Modify
    return ($allow -band $required) -eq $required
}

function Invoke-CleanPreflight([object]$Profile, [string]$Repository, [hashtable]$Environment, [hashtable]$IO) {
    if (!(& $IO.Platform)) { throw 'WINDOWS_POWERSHELL_REQUERIDO' }
    if ($Profile.schemaVersion -ne 1 -or $Profile.id -cne 'plurione-clean-v1' -or
        $Profile.port -ne 27030 -or $Profile.bindIp -cne '127.0.0.1' -or
        $Profile.replicaSet -cne 'pluriOneCleanRs' -or $Profile.member -cne 'localhost:27030' -or
        $Profile.database -cne 'plurione_clean' -or
        $Profile.rootEnvironmentVariable -cne 'PLURIONE_MONGO_CLEAN_ROOT' -or
        $Profile.defaultRoot -cne '../plurione-clean-mongo' -or
        ($Profile.directories -join ',') -cne 'data,logs,config,secrets,state') { throw 'PERFIL_INVALIDO' }
    $value = $Profile.defaultRoot
    if ($Environment.ContainsKey('PLURIONE_MONGO_CLEAN_ROOT')) { $value = $Environment.PLURIONE_MONGO_CLEAN_ROOT }
    $root = Resolve-CleanPath $value $Repository
    $protected = @($Repository, 'C:\data\db')
    foreach ($pair in @(
        @('PLURIONE_MONGO_DEV_ROOT', '../marketing-automation-dev-mongo-rs'),
        @('PLURIONE_MONGO_PILOT_ROOT', '../marketing-automation-pilot-mongo-rs'),
        @('PLURIONE_MONGO_QUOTA_ROOT', '../marketing-automation-cuota-mongo'),
        @('PLURIONE_MONGO_GEMINI_ROOT', '../marketing-automation-cuota-mongo-gemini'))) {
        # Protect both defaults and overrides, without accessing their contents.
        $protected += Resolve-CleanPath $pair[1] $Repository
        if ($Environment.ContainsKey($pair[0])) { $protected += Resolve-CleanPath $Environment[$pair[0]] $Repository }
    }
    $protected += @(& $IO.Protected)
    foreach ($p in $protected) {
        if (!$p) { throw 'PROTECCION_NO_VERIFICABLE' }
        $safe = Resolve-CleanPath $p $Repository
        if (Test-CleanOverlap $root $safe) { throw 'SOLAPAMIENTO_PROTEGIDO' }
    }
    if ($root -match '^[A-Za-z]:$') { throw 'RAIZ_PELIGROSA' }
    # Reject user-profile and Users roots themselves, but permit a private child.
    foreach ($p in @($Environment.USERPROFILE, $Environment.PUBLIC)) {
        if ($p -and (Resolve-CleanPath $p $Repository) -ieq $root) { throw 'RAIZ_PELIGROSA' }
    }
    if ($Environment.USERPROFILE -and $root -ieq [IO.Path]::GetDirectoryName($Environment.USERPROFILE)) { throw 'RAIZ_PELIGROSA' }
    $parent = Assert-CleanChain $root $IO
    if (& $IO.Item $root) { throw 'RAIZ_YA_EXISTE' }
    if (!$parent.Directory -or !(& $IO.Permission $parent.Path)) { throw 'PERMISOS_NO_DEMOSTRADOS' }
    foreach ($binary in @(@('PLURIONE_MONGOD_PATH', 'mongod.exe'), @('PLURIONE_MONGOSH_PATH', 'mongosh.exe'))) {
        if (!$Environment.ContainsKey($binary[0])) { throw 'BINARIO_EXPLICITO_REQUERIDO' }
        $file = Resolve-CleanPath $Environment[$binary[0]] $Repository
        if ([IO.Path]::GetFileName($file) -ine $binary[1]) { throw 'BINARIO_INVALIDO' }
        $item = Assert-CleanChain $file $IO
        if ($item.Path -ine $file -or $item.Directory -or !(& $IO.Readable $file)) { throw 'BINARIO_NO_LEGIBLE' }
    }
    if (@(& $IO.Listeners | Where-Object { $_ -eq $Profile.port }).Count) { throw 'PUERTO_OCUPADO' }
    [pscustomobject]@{ profile = $Profile.id; root = $root; port = $Profile.port; result = 'PREFLIGHT_READ_ONLY_OK'; identityValidated = $false; installationValidated = $false }
}

function Get-CleanReadOnlyAdapters {
    @{
        Platform = { [Environment]::OSVersion.Platform -eq 'Win32NT' -and $PSVersionTable.PSVersion -ge [version]'5.1' }
        Item = {
            param($p)
            try { $i = Get-Item -LiteralPath $p -Force -ErrorAction Stop }
            catch [System.Management.Automation.ItemNotFoundException] { return $null }
            $resolved = Resolve-Path -LiteralPath $p -ErrorAction Stop
            [pscustomobject]@{ Path = $p; Directory = $i.PSIsContainer; Reparse = [bool]($i.Attributes -band [IO.FileAttributes]::ReparsePoint); Canonical = ($resolved.Provider.Name -eq 'FileSystem' -and $resolved.ProviderPath.TrimEnd('\') -ieq $p.TrimEnd('\')) }
        }
        Readable = {
            param($p)
            $stream = [IO.File]::Open($p, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
            $stream.Dispose()
            return $true
        }
        Permission = {
            param($p)
            $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
            $sids = @($identity.User.Value) + @($identity.Groups | ForEach-Object { $_.Value })
            $principal = [Security.Principal.WindowsPrincipal]::new($identity)
            # Deny-only token groups must never contribute Allow permissions.
            $enabled = @($identity.User.Value)
            foreach ($group in $identity.Groups) { if ($principal.IsInRole($group)) { $enabled += $group.Value } }
            $acl = Get-Acl -LiteralPath $p -ErrorAction Stop
            return Test-CleanPermissionRules ($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) $enabled $sids
        }
        Listeners = { [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port } }
        Protected = {
            foreach ($p in @($env:SystemRoot, $env:ProgramFiles, $env:ProgramData)) {
                if (!$p) { throw 'SISTEMA_NO_VERIFICABLE' }
                $p
            }
            if (${env:ProgramFiles(x86)}) { ${env:ProgramFiles(x86)} }
            # Discover running mongod and registered Mongo services without DB access.
            $commands = @(Get-CimInstance Win32_Process -Filter "Name = 'mongod.exe'" -ErrorAction Stop | ForEach-Object { $_.CommandLine })
            $commands += @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -match 'mongo' -or $_.PathName -match 'mongod' } | ForEach-Object { $_.PathName })
            foreach ($command in $commands) {
                # Config-file or ambiguous invocations require a separate audit, never guessing dbPath.
                if (!$command -or $command -match '(?i)(?:^|\s)(?:--config|-f)(?:\s|=)' -or
                    $command -notmatch '(?i)(?:^|\s)--dbpath(?:\s+|=)(?:"([^"\r\n]+)"|([^\s"]+))(?:\s|$)') { throw 'DIRECTORIO_HISTORICO_NO_DEMOSTRADO' }
                $data = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
                if ($data -notmatch '^[A-Za-z]:[\\/]') { throw 'DIRECTORIO_HISTORICO_NO_DEMOSTRADO' }
                $data
            }
        }
    }
}

function Get-CleanFailure([string]$Message) {
    $guards = @('RUTA_INVALIDA','RUTA_NO_CANONICA','PADRE_NO_DIRECTORIO','CADENA_INCONSISTENTE','PADRE_NO_VERIFICABLE',
        'WINDOWS_POWERSHELL_REQUERIDO','PERFIL_INVALIDO','PROTECCION_NO_VERIFICABLE','SOLAPAMIENTO_PROTEGIDO',
        'RAIZ_PELIGROSA','RAIZ_YA_EXISTE','PERMISOS_NO_DEMOSTRADOS','BINARIO_EXPLICITO_REQUERIDO',
        'BINARIO_INVALIDO','BINARIO_NO_LEGIBLE','PUERTO_OCUPADO','SISTEMA_NO_VERIFICABLE','DIRECTORIO_HISTORICO_NO_DEMOSTRADO')
    if ($guards -ccontains $Message) {
        return [pscustomobject]@{ result = 'PREFLIGHT_REJECTED'; stage = 'PREFLIGHT'; code = $Message }
    }
    return [pscustomobject]@{ result = 'PREFLIGHT_EXECUTION_ERROR'; stage = 'EXECUTION'; code = 'INTERNAL_EXECUTION_ERROR' }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try {
        $repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
        $profile = Get-Content -LiteralPath (Join-Path $repository 'infra/mongodb-clean.profile.json') -Raw | ConvertFrom-Json
        $environment = @{}
        foreach ($entry in [Environment]::GetEnvironmentVariables().GetEnumerator()) { $environment[$entry.Key] = $entry.Value }
        Invoke-CleanPreflight $profile $repository $environment (Get-CleanReadOnlyAdapters) | ConvertTo-Json -Compress
    } catch {
        # Structured diagnostics only; never serialize the raw exception.
        Get-CleanFailure $_.Exception.Message | ConvertTo-Json -Compress
        exit 1
    }
}
