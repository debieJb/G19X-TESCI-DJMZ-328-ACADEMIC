param([switch]$AlmacenGemini)
$ErrorActionPreference = 'Stop'
$root = if ($AlmacenGemini) { 'C:\Users\jocam\Documents\marketing-automation-cuota-mongo-gemini' } else { 'C:\Users\jocam\Documents\marketing-automation-cuota-mongo' }
$port = if ($AlmacenGemini) { 27020 } else { 27019 }
$pidFile = Join-Path $root 'mongod.pid'
$mongosh = Join-Path $env:LOCALAPPDATA 'Programs\mongosh\mongosh.exe'
if (!(Test-Path -LiteralPath $pidFile)) { throw 'Falta el PID autorizado; no se detiene ningún proceso.' }
$expectedPid = [int][IO.File]::ReadAllText($pidFile)
$proc = Get-Process -Id $expectedPid -ErrorAction Stop
$procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $expectedPid" -ErrorAction Stop
if (($proc.ProcessName -ne 'mongod') -or ($proc.Path -ne 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe') -or
    (!$procInfo.CommandLine.Contains('--auth')) -or (!$procInfo.CommandLine.Contains("--port $port")) -or
    (!$procInfo.CommandLine.Contains('127.0.0.1')) -or (!$procInfo.CommandLine.Contains((Join-Path $root 'data')))) { throw 'El PID no corresponde al mongod autorizado.' }
$owner = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Select-Object -First 1
if (!$owner -or $owner.OwningProcess -ne $expectedPid -or $owner.LocalAddress -ne '127.0.0.1') { throw 'La identidad del listener no coincide; no se detiene.' }
& $mongosh --host 127.0.0.1 --port $port --username plurione_ia_quota_maintenance --authenticationDatabase plurione_ai_quota --quiet --eval "db.getSiblingDB('admin').shutdownServer()"
if ($LASTEXITCODE -ne 0) { throw 'El apagado ordenado no fue confirmado; no se fuerza el proceso.' }
for ($i = 0; $i -lt 20 -and (Get-Process -Id $expectedPid -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
if (Get-Process -Id $expectedPid -ErrorAction SilentlyContinue) { throw 'MongoDB no terminó tras solicitar el apagado ordenado.' }
Write-Output 'MONGODB_CUOTAS_APAGADO_ORDENADAMENTE'
