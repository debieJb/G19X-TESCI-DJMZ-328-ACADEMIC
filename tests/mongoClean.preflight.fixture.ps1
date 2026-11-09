param([Parameter(Mandatory=$true)][string]$Repository)
$ErrorActionPreference = 'Stop'
$tokens=$null; $errors=$null
$sourcePath = Join-Path $Repository 'scripts/mongoClean/preflight.ps1'
$sourceAst = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'SINTAXIS_INVALIDA' }
# Evaluate function declarations only, never main or system adapters.
foreach ($definition in $sourceAst.EndBlock.Statements) {
    if ($definition -is [Management.Automation.Language.FunctionDefinitionAst]) { . ([scriptblock]::Create($definition.Extent.Text)) }
}
$profilePath = Join-Path $Repository 'infra/mongodb-clean.profile.json'
$repo = 'C:\workspace\repo'
$script:cases = 0
function Run-Case([string]$Expected, [scriptblock]$Change) {
    $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
    $environment = @{ PLURIONE_MONGOD_PATH = 'C:\tools\mongod.exe'; PLURIONE_MONGOSH_PATH = 'C:\tools\mongosh.exe'; USERPROFILE = 'C:\Users\synthetic'; PUBLIC = 'C:\Users\Public' }
    $io = @{
        Platform = { $true }
        Protected = { 'C:\Windows'; 'C:\Program Files'; 'C:\ProgramData'; 'C:\legacy\data' }
        Item = {
            param($p)
            if ($p -ieq 'C:\workspace\plurione-clean-mongo') { return $null }
            [pscustomobject]@{ Path = $p; Directory = !$p.EndsWith('.exe'); Reparse = $false; Canonical = $true }
        }
        Permission = { $true }
        Readable = { $true }
        Listeners = { 27017; 27018; 27019; 27020 }
    }
    & $Change
    $actual = 'OK'
    try {
        $result = Invoke-CleanPreflight $profile $repo $environment $io
        if ($result.identityValidated -or $result.installationValidated -or $result.root -cne 'C:\workspace\plurione-clean-mongo') { throw 'RESULTADO_INCORRECTO' }
    } catch { $actual = $_.Exception.Message }
    if ($actual -cne $Expected) { throw "Expected $Expected, received $actual" }
    $script:cases++
}
Run-Case 'OK' {}
Run-Case 'PERFIL_INVALIDO' { $profile.port = 27018 }
Run-Case 'PERFIL_INVALIDO' { $profile.database = 'marketing_automation' }
Run-Case 'PERFIL_INVALIDO' { $profile.replicaSet = 'marketingDevRs' }
Run-Case 'PERFIL_INVALIDO' { $profile.directories = @('data', '../escape') }
Run-Case 'WINDOWS_POWERSHELL_REQUERIDO' { $io.Platform = { $false } }
Run-Case 'PUERTO_OCUPADO' { $io.Listeners = { 27030 } }
Run-Case 'INVENTARIO_DENEGADO' { $io.Protected = { throw 'INVENTARIO_DENEGADO' } }
Run-Case 'LISTENERS_DENEGADOS' { $io.Listeners = { throw 'LISTENERS_DENEGADOS' } }
Run-Case 'PERMISOS_NO_DEMOSTRADOS' { $io.Permission = { $false } }
Run-Case 'ACL_DENEGADA' { $io.Permission = { throw 'ACL_DENEGADA' } }
Run-Case 'BINARIO_EXPLICITO_REQUERIDO' { $environment.Remove('PLURIONE_MONGOD_PATH') }
Run-Case 'BINARIO_INVALIDO' { $environment.PLURIONE_MONGOD_PATH = 'C:\tools\node.exe' }
Run-Case 'BINARIO_NO_LEGIBLE' { $io.Readable = { $false } }
Run-Case 'RUTA_NO_CANONICA' { $io.Item = { param($p) [pscustomobject]@{ Path=$p; Directory=$true; Reparse=$true; Canonical=$true } } }
Run-Case 'RUTA_NO_CANONICA' { $io.Item = { param($p) [pscustomobject]@{ Path=$p; Directory=$true; Reparse=$false; Canonical=$false } } }
Run-Case 'PADRE_NO_VERIFICABLE' { $io.Item = { $null } }
Run-Case 'RAIZ_YA_EXISTE' { $io.Item = { param($p) [pscustomobject]@{ Path=$p; Directory=$true; Reparse=$false; Canonical=$true } } }
foreach ($danger in @('C:\Windows\new', 'C:\Program Files\new', 'C:\ProgramData\new', 'C:\legacy', 'C:\legacy\data\new', 'C:\workspace\repo\new', '../marketing-automation-dev-mongo-rs', '../marketing-automation-pilot-mongo-rs', '../marketing-automation-cuota-mongo', '../marketing-automation-cuota-mongo-gemini')) {
    Run-Case 'SOLAPAMIENTO_PROTEGIDO' { $environment.PLURIONE_MONGO_CLEAN_ROOT = $danger }
}
foreach ($danger in @('\\server\share', '\\?\C:\data', 'C:relative', '\relative', 'C:\data:stream', 'C:\bad.\new', 'C:\NUL\new', 'C:\bad*', 'C:\PROGRA~1\new', '')) {
    Run-Case 'RUTA_INVALIDA' { $environment.PLURIONE_MONGO_CLEAN_ROOT = $danger }
}
Run-Case 'RAIZ_PELIGROSA' { $environment.PLURIONE_MONGO_CLEAN_ROOT = 'C:\Users\synthetic' }
Run-Case 'SOLAPAMIENTO_PROTEGIDO' { $environment.PLURIONE_MONGO_DEV_ROOT = 'C:\workspace\plurione-clean-mongo\data' }
Run-Case 'SOLAPAMIENTO_PROTEGIDO' { $environment.PLURIONE_MONGO_CLEAN_ROOT = 'C:\data\db\new' }
Run-Case 'RAIZ_PELIGROSA' { $environment.PLURIONE_MONGO_CLEAN_ROOT = 'C:\Users' }
Run-Case 'SOLAPAMIENTO_PROTEGIDO' { $environment.PLURIONE_MONGO_CLEAN_ROOT = 'C:\' }
Run-Case 'SOLAPAMIENTO_PROTEGIDO' { $environment.PLURIONE_MONGO_CLEAN_ROOT = '../repo/../repo/new' }
Run-Case 'BINARIO_NO_LEGIBLE' { $io.Item = { param($p) if ($p -match 'plurione-clean-mongo|mongod.exe') { return $null }; [pscustomobject]@{ Path=$p; Directory=$true; Reparse=$false; Canonical=$true } } }
Run-Case 'PADRE_NO_DIRECTORIO' { $io.Item = { param($p) if ($p -match 'plurione-clean-mongo') { return $null }; [pscustomobject]@{ Path=$p; Directory=$false; Reparse=$false; Canonical=$true } } }
if (Test-CleanOverlap 'C:\safe' 'C:\safety') { throw 'PREFIJO_NO_ES_SOLAPAMIENTO' }
if (!(Test-CleanOverlap 'C:\SAFE' 'c:\safe\data')) { throw 'SOLAPAMIENTO_CASE_INSENSITIVE' }
function Rule($sid, $type, $rights, $propagation = 0) {
    [pscustomobject]@{ IdentityReference = [pscustomobject]@{Value=$sid}; AccessControlType=$type; FileSystemRights=$rights; PropagationFlags=$propagation }
}
$modify = [int][Security.AccessControl.FileSystemRights]::Modify
if (!(Test-CleanPermissionRules @((Rule 'user' 'Allow' $modify)) @('user') @('user'))) { throw 'MODIFY_RECHAZADO' }
if (Test-CleanPermissionRules @((Rule 'user' 'Allow' $modify), (Rule 'group' 'Deny' 1)) @('user') @('user','group')) { throw 'DENY_ACEPTADO' }
if (Test-CleanPermissionRules @((Rule 'denyOnly' 'Allow' $modify)) @('user') @('user','denyOnly')) { throw 'GRUPO_DENY_ONLY_ACEPTADO' }
if (Test-CleanPermissionRules @((Rule 'user' 'Allow' 1)) @('user') @('user')) { throw 'PERMISOS_PARCIALES_ACEPTADOS' }
if (Test-CleanPermissionRules @((Rule 'user' 'Allow' $modify 2)) @('user') @('user')) { throw 'INHERIT_ONLY_ACEPTADO' }
$script:cases += 5
# All inventory values below are synthetic. Even adapter queries must hit this
# local double; no production CIM, filesystem, ACL or listeners are invoked.
# Synthetic system roots are confined to this disposable test process.
$env:SystemRoot='C:\synthetic\Windows'
$env:ProgramFiles='C:\synthetic\Programs'
$env:ProgramData='C:\synthetic\SystemData'
${env:ProgramFiles(x86)}='C:\synthetic\Programs32'
$script:processCommands = @()
$script:serviceCommands = @()
$script:cimFailure = $false
$script:cimFailClass = ''
$script:cimCalls = 0
function Get-CimInstance {
    param($ClassName, $Filter, $ErrorAction)
    $script:cimCalls++
    if ($script:cimFailure -or $ClassName -eq $script:cimFailClass) { throw 'SYNTHETIC_PRIVATE_CIM_ERROR' }
    if ($ClassName -eq 'Win32_Process') {
        if ($Filter -cne "Name = 'mongod.exe'") { throw 'FILTRO_INESPERADO' }
        foreach ($command in $script:processCommands) { [pscustomobject]@{CommandLine=$command} }
    } elseif ($ClassName -eq 'Win32_Service') {
        foreach ($command in $script:serviceCommands) { [pscustomobject]@{Name='SyntheticMongo'; PathName=$command} }
        [pscustomobject]@{Name='Unrelated'; PathName='C:\synthetic\unrelated.exe'}
    } else { throw 'CLASE_INESPERADA' }
}
# Tripwires: classifiers and the Protected adapter must not inspect config/data.
function Get-Content {
    param($LiteralPath, [switch]$Raw)
    if ($LiteralPath -cne $profilePath -or !$Raw) { throw 'CONFIG_READ_NO_AUTORIZADO' }
    [IO.File]::ReadAllText($profilePath)
}
function Get-Item { throw 'FILESYSTEM_NO_AUTORIZADO' }
function Get-Acl { throw 'ACL_NO_AUTORIZADA' }
function Resolve-Path { throw 'RESOLVE_NO_AUTORIZADO' }
function Check-Entry([string]$Command, [string]$Expected, [string]$Reason, [string]$Source='PROCESS') {
    $entry = Get-CleanHistoricalEntry $Command $Source 'C:\synthetic\clean'
    if ($entry.Classification -cne $Expected -or $entry.Reason -cne $Reason -or $entry.Source -cne $Source) {
        throw "CLASIFICACION_INCORRECTA: $Expected/$Reason"
    }
    if ($Expected -ne 'IDENTIFIED' -and $null -ne $entry.DataPath) { throw 'RUTA_NO_DEMOSTRADA_PUBLICADA' }
    if ($Expected -eq 'IDENTIFIED' -and $entry.DataPath -ine 'C:\synthetic data\db') { throw 'RUTA_IDENTIFICADA_INCORRECTA' }
    $script:cases++
}
foreach ($source in @('PROCESS','SERVICE')) {
    foreach ($command in @(
        '"C:\synthetic tools\mongod.exe" --dbpath "C:\synthetic data\db" --port 27018',
        'mongod.exe --dbpath="C:\synthetic data\db" --service',
        'mongod.exe "--dbpath" "C:\synthetic data\db"',
        'mongod.exe --dbpath "C:\synthetic data\other\..\db"')) {
        Check-Entry $command 'IDENTIFIED' 'EXPLICIT_ABSOLUTE_DBPATH' $source
    }
    foreach ($command in @('', ' ')) { Check-Entry $command 'INFORMATION_INCOMPLETE' 'COMMAND_UNAVAILABLE' $source }
    Check-Entry 'wrapper.exe --dbpath C:\synthetic\data' 'INFORMATION_INCOMPLETE' 'EXECUTABLE_UNVERIFIED' $source
    Check-Entry 'mongod.exe --port 27018' 'INFORMATION_INCOMPLETE' 'DBPATH_MISSING' $source
    foreach ($command in @('mongod.exe --dbpath C:\synthetic\data --port', 'mongod.exe --dbpath C:\synthetic\data --logpath=', 'mongod.exe --dbpath', 'mongod.exe --dbpath=', 'mongod.exe --dbpath ""', 'mongod.exe --dbpath --port 27018', 'mongod.exe --config', 'mongod.exe -f=')) {
        Check-Entry $command 'INFORMATION_INCOMPLETE' 'ARGUMENT_VALUE_MISSING' $source
    }
    foreach ($value in @('relative','C:relative','\\synthetic\share','C:\synthetic\x:stream','C:\synthetic\NUL','C:\synthetic\bad.','C:\SYNTH~1\db')) {
        Check-Entry ('mongod.exe --dbpath ' + $value) 'INFORMATION_INCOMPLETE' 'DBPATH_UNRESOLVED' $source
    }
    foreach ($command in @('mongod.exe --dbpath "C:\synthetic\db', 'mongod.exe --dbpath "C:\synthetic\db"suffix', 'mongod.exe --dbpath "C:\synthetic\db\"', 'mongod.exe --dbpath C:\synthetic\one --dbpath C:\synthetic\two', 'mongod.exe -fC:\synthetic\cfg', 'mongod.exe --dbpathUnknown C:\synthetic\data')) {
        Check-Entry $command 'INFORMATION_INCOMPLETE' 'ARGUMENTS_AMBIGUOUS' $source
    }
    foreach ($command in @('mongod.exe --dbpath C:\synthetic\unquoted data', 'mongod.exe --dbpath C:\synthetic\data --unknown', 'mongod.exe --dbpath C:\synthetic\data --PORT 27018')) {
        Check-Entry $command 'INFORMATION_INCOMPLETE' 'UNSUPPORTED_ARGUMENT' $source
    }
    foreach ($option in @('--config','-f','--config=')) {
        $separator=if ($option -match '=$') { '' } else { ' ' }
        Check-Entry ('mongod.exe ' + $option + $separator + '"C:\synthetic config\mongod.cfg"') 'CONFIGURATION_UNVERIFIABLE' 'CONFIG_CONTENT_NOT_VERIFIED' $source
    }
    foreach ($value in @('relative.cfg','C:relative.cfg','\\synthetic\share\mongod.cfg','C:\synthetic\config:stream')) {
        Check-Entry ('mongod.exe --config ' + $value) 'CONFIGURATION_UNVERIFIABLE' 'CONFIG_PATH_UNRESOLVED' $source
    }
    # Explicit dbpath never overrides rejection of an unverified config.
    Check-Entry 'mongod.exe --dbpath C:\synthetic\data --config C:\synthetic\missing.cfg' 'CONFIGURATION_UNVERIFIABLE' 'CONFIG_CONTENT_NOT_VERIFIED' $source
    Check-Entry 'mongod.exe --dbpath C:\synthetic\data "--config" C:\synthetic\mongod.cfg' 'CONFIGURATION_UNVERIFIABLE' 'CONFIG_CONTENT_NOT_VERIFIED' $source
    Check-Entry 'mongod.exe --config C:\synthetic\one.cfg -f C:\synthetic\two.cfg' 'CONFIGURATION_UNVERIFIABLE' 'CONFIG_ARGUMENTS_AMBIGUOUS' $source
    foreach ($value in @('C:\synthetic\clean','C:\synthetic\clean\data','C:\synthetic','C:\SYNTHETIC\CLEAN\data')) {
        Check-Entry ('mongod.exe --dbpath ' + $value) 'CONFLICT_CONFIRMED' 'DECLARED_PATH_OVERLAP' $source
    }
}
$entry=Get-CleanHistoricalEntry 'mongod.exe --dbpath C:\synthetic\cleaner' 'PROCESS' 'C:\synthetic\clean'
if ($entry.Classification -ne 'IDENTIFIED') { throw 'PREFIJO_NO_ES_CONFLICTO' }; $script:cases++
function Check-Inventory([string]$Expected, [string[]]$Processes, [string[]]$Services) {
    $script:processCommands=$Processes; $script:serviceCommands=$Services
    $inventory=(Get-CleanReadOnlyAdapters).Protected
    $before=$script:cimCalls
    $actual='OK'
    try {
        $paths=@(& $inventory 'C:\synthetic\clean')
        foreach ($p in $paths) { if ($p -match 'SYNTHETIC_PRIVATE|--config|mongod.exe') { throw 'INVENTARIO_CRUDO_PUBLICADO' } }
    } catch { $actual=$_.Exception.Message }
    if ($actual -cne $Expected) { throw "INVENTARIO_INCORRECTO: $Expected/$actual" }
    if ($script:cimCalls -le $before) { throw 'DOBLE_CIM_NO_INVOCADO' }
    $script:cases++
}
Check-Inventory 'OK' @() @()
Check-Inventory 'OK' @('mongod.exe --dbpath C:\synthetic\old') @('mongod.exe --dbpath C:\synthetic\other --service')
Check-Inventory 'INVENTARIO_INFORMACION_INCOMPLETA' @('') @()
Check-Inventory 'INVENTARIO_INFORMACION_INCOMPLETA' @() @('mongod.exe --service')
Check-Inventory 'INVENTARIO_INFORMACION_INCOMPLETA' @('mongod.exe --dbpath C:\synthetic\old', '') @()
Check-Inventory 'INVENTARIO_CONFIGURACION_NO_VERIFICABLE' @() @('mongod.exe --config C:\synthetic\mongod.cfg --service')
Check-Inventory 'INVENTARIO_CONFIGURACION_NO_VERIFICABLE' @('') @('mongod.exe --config C:\synthetic\mongod.cfg')
Check-Inventory 'INVENTARIO_CONFLICTO_CONFIRMADO' @('mongod.exe --dbpath C:\synthetic\clean\data') @('mongod.exe --config C:\synthetic\mongod.cfg')
Check-Inventory 'INVENTARIO_CONFLICTO_CONFIRMADO' @('') @('mongod.exe --dbpath C:\synthetic\clean --service')
$script:cimFailure=$true
Check-Inventory 'INVENTARIO_INFORMACION_INCOMPLETA' @() @()
$script:cimFailure=$false
$script:cimFailClass='Win32_Service'
Check-Inventory 'INVENTARIO_INFORMACION_INCOMPLETA' @('mongod.exe --dbpath C:\synthetic\old') @()
$script:cimFailClass=''
# End-to-end rejection integration still uses only synthetic adapters.
Run-Case 'INVENTARIO_CONFLICTO_CONFIRMADO' { $io.Protected={ param($root) $e=Get-CleanHistoricalEntry ('mongod.exe --dbpath ' + $root + '\data') 'PROCESS' $root; if ($e.Classification -eq 'CONFLICT_CONFIRMED') { throw 'INVENTARIO_CONFLICTO_CONFIRMADO' }; throw 'CONFLICTO_IGNORADO' } }
foreach ($guard in @('INVENTARIO_INFORMACION_INCOMPLETA','INVENTARIO_CONFIGURACION_NO_VERIFICABLE','INVENTARIO_CONFLICTO_CONFIRMADO')) {
    $failure=Get-CleanFailure $guard
    if ($failure.result -cne 'PREFLIGHT_REJECTED' -or $failure.code -cne $guard) { throw 'CLASIFICACION_NO_SANEADA' }
    $script:cases++
}
Run-Case 'INVENTARIO_INFORMACION_INCOMPLETA' { $io.Protected={ throw 'INVENTARIO_INFORMACION_INCOMPLETA' } }
Run-Case 'INVENTARIO_CONFIGURACION_NO_VERIFICABLE' { $io.Protected={ throw 'INVENTARIO_CONFIGURACION_NO_VERIFICABLE' } }
Run-Case 'INVENTARIO_CONFLICTO_CONFIRMADO' { $io.Protected={ throw 'INVENTARIO_CONFLICTO_CONFIRMADO' } }
# Production adapter wired to full preflight, with every other OS adapter fake.
Run-Case 'OK' { $script:processCommands=@('mongod.exe --dbpath C:\synthetic\old'); $script:serviceCommands=@(); $io.Protected=(Get-CleanReadOnlyAdapters).Protected }
Run-Case 'INVENTARIO_CONFIGURACION_NO_VERIFICABLE' { $script:processCommands=@(); $script:serviceCommands=@('mongod.exe --config C:\synthetic\mongod.cfg --service'); $io.Protected=(Get-CleanReadOnlyAdapters).Protected }
Run-Case 'INVENTARIO_INFORMACION_INCOMPLETA' { $script:processCommands=@(''); $script:serviceCommands=@(); $io.Protected=(Get-CleanReadOnlyAdapters).Protected }
Run-Case 'INVENTARIO_CONFLICTO_CONFIRMADO' { $script:processCommands=@('mongod.exe --dbpath C:\workspace\plurione-clean-mongo\data'); $script:serviceCommands=@(); $io.Protected=(Get-CleanReadOnlyAdapters).Protected }
# Parse the production file and restrict its command surface to read-only commands.
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'SINTAXIS_INVALIDA' }
$allowed = @('Get-CleanHistoricalEntry','Resolve-CleanPath','Test-CleanOverlap','Assert-CleanChain','Test-CleanPermissionRules','Invoke-CleanPreflight','Get-CleanReadOnlyAdapters','Get-CleanFailure','Where-Object','ForEach-Object','Get-Item','Resolve-Path','Get-Acl','Get-CimInstance','Join-Path','Get-Content','ConvertFrom-Json','ConvertTo-Json','Write-Error')
foreach ($command in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
    $name = $command.GetCommandName()
    if ($name -and $allowed -notcontains $name) { throw "COMANDO_NO_AUTORIZADO: $name" }
    if (!$name -and $command.Extent.Text -notmatch '^&\s+\$IO\.(Item|Platform|Protected|Permission|Readable|Listeners)\b') { throw 'INVOCACION_DINAMICA_NO_AUTORIZADA' }
}
$allowedMethods = @('IsNullOrWhiteSpace','IsPathRooted','Combine','GetFullPath','TrimEnd','Equals','StartsWith','GetDirectoryName','ContainsKey','GetFileName','Open','Dispose','GetCurrent','new','IsInRole','GetAccessRules','GetIPGlobalProperties','GetActiveTcpListeners','GetEnvironmentVariables','GetEnumerator','Matches','Substring','Trim')
foreach ($method in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.InvokeMemberExpressionAst] }, $true)) {
    if ($allowedMethods -notcontains $method.Member.Value) { throw 'METODO_NO_AUTORIZADO' }
    if ($method.Member.Value -eq 'Open' -and $method.Extent.Text -notmatch 'FileMode\]::Open,\s*\[IO.FileAccess\]::Read,') { throw 'APERTURA_NO_ES_LECTURA' }
}
foreach ($guard in @('PUERTO_OCUPADO', 'BINARIO_EXPLICITO_REQUERIDO', 'DIRECTORIO_HISTORICO_NO_DEMOSTRADO')) {
    $failure = Get-CleanFailure $guard
    if ($failure.result -ne 'PREFLIGHT_REJECTED' -or $failure.code -cne $guard) { throw 'GUARD_DIAGNOSTIC_FAILED' }
    $script:cases++
}
$failure = Get-CleanFailure 'SYNTHETIC_PRIVATE_DETAIL'
if ($failure.result -ne 'PREFLIGHT_EXECUTION_ERROR' -or ($failure | ConvertTo-Json) -match 'SYNTHETIC_PRIVATE_DETAIL') { throw 'UNSAFE_DIAGNOSTIC' }
$script:cases++
Write-Output "ISOLATED_CASES_PASSED=$script:cases; AST_READ_ONLY_OK"
