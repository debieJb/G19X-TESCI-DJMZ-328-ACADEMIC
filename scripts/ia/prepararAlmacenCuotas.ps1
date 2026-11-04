$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\rutasLocales.ps1')
$root = (Get-PluriOnePath 'quotaRoot')
$data = Join-Path $root 'data'
$logs = Join-Path $root 'logs'
$mongod = (Get-PluriOnePath 'mongod')
$provision = Join-Path $PSScriptRoot 'aprovisionarCuotas.mongo.js'
$baselineCheck = Join-Path $PSScriptRoot '..\..\scripts\verificarMongoDevRs.js'

if (Test-Path -LiteralPath $root) { throw 'El directorio autorizado ya existe; se detiene sin reutilizarlo.' }
if (!(Test-Path -LiteralPath $mongod -PathType Leaf)) { throw 'Falta mongod previamente verificado.' }
$version = (& $mongod --version | Select-Object -First 1)
if ($version -notmatch 'v8\.2\.6') { throw 'La versión del servidor no es la autorizada 8.2.6.' }
$listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
if ($listeners | Where-Object { $_.Port -eq 27019 }) { throw 'El puerto 27019 ya está ocupado; no se inicia otra instancia.' }
& node $baselineCheck --verificar
if ($LASTEXITCODE -ne 0) { throw 'Falló la comprobación de identidad/referencia de las instancias originales.' }

New-Item -ItemType Directory -Path $root | Out-Null
New-Item -ItemType Directory -Path $data, $logs | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($path in @($root, $data, $logs)) {
    & icacls.exe $path /inheritance:r /grant:r "*$sid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir ACL NTFS del almacén.' }
}
if ((Get-ChildItem -LiteralPath $data -Force).Count -ne 0) { throw 'El directorio de datos no está vacío.' }

$logPath = Join-Path $logs 'mongod.log'
$mongodArguments = @('--dbpath', ('"' + $data + '"'), '--port', '27019', '--bind_ip', '127.0.0.1', '--auth', '--logpath', ('"' + $logPath + '"'), '--logappend')
$proc = Start-Process -FilePath $mongod -ArgumentList $mongodArguments -WorkingDirectory $root -WindowStyle Hidden -PassThru
Set-Content -LiteralPath (Join-Path $root 'mongod.pid') -Value $proc.Id -NoNewline
& icacls.exe (Join-Path $root 'mongod.pid') /inheritance:r /grant:r "*$sid`:(F)" '*S-1-5-18:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir el archivo PID.' }

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    if (!$proc.HasExited -and (Test-NetConnection 127.0.0.1 -Port 27019 -WarningAction SilentlyContinue).TcpTestSucceeded) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}
if (!$ready) { throw 'MongoDB no alcanzó disponibilidad; detenerse y revisar el log protegido.' }
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction Stop
$listener = @(Get-NetTCPConnection -State Listen -LocalPort 27019 -ErrorAction Stop)
$expectedData = (Resolve-Path -LiteralPath $data).Path
$processCommandLine = [string]$processInfo.CommandLine
if ($processInfo.ExecutablePath -ne $mongod -or
    $processCommandLine -notmatch '--dbpath\s+"([^"]+)"' -or $Matches[1] -ine $expectedData -or
    $processCommandLine -notmatch '(?:^|\s)--port\s+27019(?:\s|$)' -or
    $processCommandLine -notmatch '(?:^|\s)--bind_ip\s+127\.0\.0\.1(?:\s|$)' -or
    $processCommandLine -notmatch '(?:^|\s)--auth(?:\s|$)' -or $listener.Count -ne 1 -or
    $listener[0].OwningProcess -ne $proc.Id -or $listener[0].LocalAddress -ne '127.0.0.1') {
    throw 'El proceso iniciado no coincide con la identidad autorizada; no se aprovisiona.'
}
& node $provision
if ($LASTEXITCODE -ne 0) { throw 'Falló el aprovisionamiento interactivo; no se intenta reparar.' }
& node $baselineCheck --verificar
if ($LASTEXITCODE -ne 0) { throw 'Cambió la comprobación de identidad de las instancias originales.' }
Write-Output 'ALMACEN_CUOTAS_INICIADO; ACL RESTRINGIDA; APROVISIONAMIENTO REALIZADO'
