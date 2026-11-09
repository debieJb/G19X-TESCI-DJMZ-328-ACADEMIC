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
# Exercise the production inventory adapter with a CIM double. No CIM call occurs.
function Get-CimInstance {
    param($ClassName, $Filter, $ErrorAction)
    if ($ClassName -eq 'Win32_Process') { [pscustomobject]@{ CommandLine = $script:syntheticCommand } }
    elseif ($ClassName -ne 'Win32_Service') { throw 'CLASE_INESPERADA' }
}
$inventory = (Get-CleanReadOnlyAdapters).Protected
$script:syntheticCommand = '"C:\tools\mongod.exe" --dbpath "C:\legacy data\db" --port 27018'
if (@(& $inventory) -notcontains 'C:\legacy data\db') { throw 'DBPATH_NO_DESCUBIERTO' }
foreach ($command in @('', 'mongod.exe --config C:\private\mongod.cfg', 'mongod.exe -f=C:\private\mongod.cfg', 'mongod.exe --dbpath relative', 'mongod.exe --port 27018')) {
    $script:syntheticCommand = $command
    $rejected = $false
    try { $null = @(& $inventory) } catch { $rejected = $_.Exception.Message -eq 'DIRECTORIO_HISTORICO_NO_DEMOSTRADO' }
    if (!$rejected) { throw 'INVENTARIO_AMBIGUO_ACEPTADO' }
    $script:cases++
}
# Parse the production file and restrict its command surface to read-only commands.
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'SINTAXIS_INVALIDA' }
$allowed = @('Resolve-CleanPath','Test-CleanOverlap','Assert-CleanChain','Test-CleanPermissionRules','Invoke-CleanPreflight','Get-CleanReadOnlyAdapters','Get-CleanFailure','Where-Object','ForEach-Object','Get-Item','Resolve-Path','Get-Acl','Get-CimInstance','Join-Path','Get-Content','ConvertFrom-Json','ConvertTo-Json','Write-Error')
foreach ($command in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true)) {
    $name = $command.GetCommandName()
    if ($name -and $allowed -notcontains $name) { throw "COMANDO_NO_AUTORIZADO: $name" }
    if (!$name -and $command.Extent.Text -notmatch '^&\s+\$IO\.(Item|Platform|Protected|Permission|Readable|Listeners)\b') { throw 'INVOCACION_DINAMICA_NO_AUTORIZADA' }
}
$allowedMethods = @('IsNullOrWhiteSpace','IsPathRooted','Combine','GetFullPath','TrimEnd','Equals','StartsWith','GetDirectoryName','ContainsKey','GetFileName','Open','Dispose','GetCurrent','new','IsInRole','GetAccessRules','GetIPGlobalProperties','GetActiveTcpListeners','GetEnvironmentVariables','GetEnumerator')
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
