$ErrorActionPreference = 'Stop'
$pilotRoot = 'C:\Users\jocam\Documents\marketing-automation-pilot-mongo-rs'
$pilotBinary = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'
foreach ($pilotPath in @($pilotRoot, (Join-Path $pilotRoot 'data'), (Join-Path $pilotRoot 'logs'))) {
  $pilotItem = Get-Item -LiteralPath $pilotPath
  if (!$pilotItem.PSIsContainer -or ($pilotItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'DIRECTORIO_PILOTO_INVALIDO' }
}
if (!(Test-Path -LiteralPath (Join-Path $pilotRoot 'data\WiredTiger'))) { throw 'DATOS_EXISTENTES_REQUERIDOS_NO_SE_INICIALIZA_OTRA_REPLICA' }
$pilotListening = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq 27019
if (!$pilotListening) {
  $pilotArguments = @('--replSet','marketingPilotLocalRs','--port','27019','--bind_ip','127.0.0.1','--dbpath',('"'+(Join-Path $pilotRoot 'data')+'"'),'--logpath',('"'+(Join-Path $pilotRoot 'logs\mongod.log')+'"'),'--logappend','--wiredTigerCacheSizeGB','0.25','--oplogSize','128','--setParameter','ttlMonitorEnabled=false')
  Start-Process -FilePath $pilotBinary -ArgumentList $pilotArguments -WorkingDirectory $pilotRoot -WindowStyle Hidden | Out-Null
}
$pilotCheck = Join-Path $PSScriptRoot 'prepararEntornoGmailLocal.js'
for ($pilotAttempt = 0; $pilotAttempt -lt 20; $pilotAttempt++) {
  & node $pilotCheck --instancia
  if ($LASTEXITCODE -eq 0) { exit 0 }
  Start-Sleep -Milliseconds 500
}
throw 'INSTANCIA_PILOTO_NO_VERIFICADA_NO_SE_RECONFIGURA'
