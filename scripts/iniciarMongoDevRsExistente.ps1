$ErrorActionPreference = 'Stop'
$rsRoot = & node -e "process.stdout.write(require(process.argv[1]).ROOT)" (Join-Path $PSScriptRoot 'mongoDevRsComun.js')
if ($LASTEXITCODE -ne 0 -or !$rsRoot) { throw 'No se pudo leer el directorio autorizado.' }
$rsBinary = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'
$rsCheck = Join-Path $PSScriptRoot 'verificarMongoDevRs.js'
if (!(Test-Path -LiteralPath $rsBinary -PathType Leaf)) { throw 'No se encuentra el ejecutable previsto.' }
if ([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq 27018) { throw 'Puerto 27018 ocupado; no se inicia otro proceso.' }
foreach ($rsDir in @($rsRoot, (Join-Path $rsRoot 'data'), (Join-Path $rsRoot 'logs'))) {
    $rsItem = Get-Item -LiteralPath $rsDir
    if (!$rsItem.PSIsContainer -or ($rsItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Directorio inexistente o redirigido.' }
}
if (!(Test-Path -LiteralPath (Join-Path $rsRoot 'original-baseline.json') -PathType Leaf)) { throw 'Falta referencia de seguridad.' }
if (!(Test-Path -LiteralPath (Join-Path $rsRoot 'data\WiredTiger') -PathType Leaf)) { throw 'DATOS_EXISTENTES_REQUERIDOS' }
& node $rsCheck --comparar-original
if ($LASTEXITCODE -ne 0) { throw 'La instancia original no coincide; no se inicia MongoDB.' }
$rsData = Join-Path $rsRoot 'data'
$rsLog = Join-Path $rsRoot 'logs\mongod.log'
$rsArgs = @('--replSet', 'marketingDevRs', '--port', '27018', '--bind_ip', '127.0.0.1', '--dbpath', ('"' + $rsData + '"'), '--logpath', ('"' + $rsLog + '"'), '--logappend', '--wiredTigerCacheSizeGB', '0.25', '--oplogSize', '128')
$rsProcess = Start-Process -FilePath $rsBinary -ArgumentList $rsArgs -WorkingDirectory $rsRoot -WindowStyle Hidden -PassThru
Write-Output ('MONGODB_DEV_PID: ' + $rsProcess.Id)
& node $rsCheck --verificar
if ($LASTEXITCODE -ne 0) { throw 'Inicialización/verificación fallida; no se intenta reparar ni detener otro proceso. Revisar el log local.' }
