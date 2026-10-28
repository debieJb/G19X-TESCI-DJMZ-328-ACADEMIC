param([switch]$AlmacenGemini)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\rutasLocales.ps1')
$root = if ($AlmacenGemini) { (Get-PluriOnePath 'geminiRoot') } else { (Get-PluriOnePath 'quotaRoot') }
$port = if ($AlmacenGemini) { 27020 } else { 27019 }
$data = Join-Path $root 'data'
$pidFile = Join-Path $root 'mongod.pid'
$expectedExe = (Get-PluriOnePath 'mongod')
$runner = Join-Path $PSScriptRoot 'recuperarCuentaTemporal.mongo.js'

if (!(Test-Path -LiteralPath $pidFile -PathType Leaf) -or !(Test-Path -LiteralPath $data -PathType Container)) {
    throw 'Falta el PID o el directorio de datos autorizado; no se inicia ni modifica nada.'
}
if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint -or
    (Get-Item -LiteralPath $data -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'La ruta autorizada esta redirigida; detenerse.'
}
$expectedPid = [int][IO.File]::ReadAllText($pidFile)
$proc = Get-Process -Id $expectedPid -ErrorAction Stop
$procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $expectedPid" -ErrorAction Stop
$commandLine = [string]$procInfo.CommandLine
if (($proc.ProcessName -ne 'mongod') -or ($proc.Path -ne $expectedExe) -or
    ($commandLine -notmatch '--dbpath\s+"([^"]+)"') -or ($Matches[1] -ine $data) -or
    ($commandLine -notmatch "(?:^|\s)--port\s+$port(?:\s|`$)") -or
    ($commandLine -notmatch '(?:^|\s)--bind_ip\s+127\.0\.0\.1(?:\s|$)') -or
    ($commandLine -notmatch '(?:^|\s)--auth(?:\s|$)')) {
    throw 'El proceso no coincide exactamente con mongod 8.2.6, el puerto y el dbPath autorizados.'
}
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop)
if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $expectedPid -or
    $listeners[0].LocalAddress -ne '127.0.0.1') {
    throw "El listener $port no pertenece exclusivamente al PID autorizado en loopback."
}
$version = (& $expectedExe --version | Select-Object -First 1)
if ($version -notmatch 'v8\.2\.6') { throw 'La version del ejecutable no coincide; no se modifica nada.' }

Write-Output 'Preflight de proceso aprobado; Node verificara auth, identidad MongoDB e inventario antes de escribir.'
$runnerArguments = @()
if ($AlmacenGemini) { $runnerArguments += '--target=gemini' }
& node $runner @runnerArguments
if ($LASTEXITCODE -ne 0) { throw 'Recuperacion detenida; revisa el codigo de etapa sin compartir contrasenas.' }
