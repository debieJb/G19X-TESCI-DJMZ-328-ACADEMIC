param([switch]$ConfirmarEjecucion)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\rutasLocales.ps1')
$root = (Get-PluriOnePath 'geminiRoot')
$data = Join-Path $root 'data'
$logs = Join-Path $root 'logs'
$mongod = (Get-PluriOnePath 'mongod')
$port = 27020
$baselineCheck = Join-Path $PSScriptRoot '..\..\scripts\verificarMongoDevRs.js'
$provision = Join-Path $PSScriptRoot 'aprovisionarCuotas.mongo.js'

if (!$ConfirmarEjecucion) { throw 'Preparado para revisión. La puesta en marcha requiere -ConfirmarEjecucion y las verificaciones manuales documentadas.' }
if (Test-Path -LiteralPath $root) { throw 'El directorio nuevo ya existe; no se reutiliza ni modifica.' }
if (!(Test-Path -LiteralPath $mongod -PathType Leaf)) { throw 'Falta mongod previamente instalado.' }
if ((& $mongod --version | Select-Object -First 1) -notmatch 'v8\.2\.6') { throw 'La versión MongoDB no es 8.2.6.' }

function Get-PortIdentity([int[]]$Ports) {
    foreach ($p in $Ports) {
        foreach ($item in @(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.OwningProcess)" -ErrorAction Stop
            [pscustomobject]@{ Port=$p; Address=$item.LocalAddress; Pid=$item.OwningProcess; Executable=$process.ExecutablePath; CommandLine=$process.CommandLine }
        }
    }
}
$protectedPorts = @(3000,5678,27017,27018,27019)
$beforeItems = @(Get-PortIdentity $protectedPorts | Sort-Object Port,Address,Pid)
$oldQuotaItems = @($beforeItems | Where-Object Port -eq 27019)
$oldQuotaRoot = (Get-PluriOnePath 'quotaRoot')
$oldQuotaData = (Join-Path $oldQuotaRoot 'data')
if ($oldQuotaItems.Count -ne 1 -or $oldQuotaItems[0].Address -ne '127.0.0.1' -or
    $oldQuotaItems[0].Executable -ne $mongod -or $oldQuotaItems[0].CommandLine -notmatch '--port\s+27019(?:\s|$)' -or
    $oldQuotaItems[0].CommandLine -notmatch '(?:^|\s)--auth(?:\s|$)' -or
    $oldQuotaItems[0].CommandLine -notmatch '--dbpath\s+"([^"]+)"' -or $Matches[1] -ine $oldQuotaData) {
    throw 'La instancia preexistente 27019 no coincide con la identidad registrada; no se inicia la nueva.'
}
$before = $beforeItems | ConvertTo-Json -Depth 4 -Compress
if (@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count) { throw 'El puerto nuevo 27020 está ocupado; no se inicia otra instancia.' }
& node $baselineCheck --verificar
if ($LASTEXITCODE -ne 0) { throw 'La identidad/referencia de 27017 o 27018 no se validó.' }

New-Item -ItemType Directory -Path $root | Out-Null
New-Item -ItemType Directory -Path $data,$logs | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($path in @($root,$data,$logs)) {
    & icacls.exe $path /inheritance:r /grant:r "*$sid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir ACL del nuevo almacén.' }
}
if (@(Get-ChildItem -LiteralPath $data -Force).Count -ne 0) { throw 'El dbPath nuevo no está vacío.' }

$log = Join-Path $logs 'mongod.log'
$mongodArguments = @('--dbpath',('"'+$data+'"'),'--port',[string]$port,'--bind_ip','127.0.0.1','--auth','--logpath',('"'+$log+'"'),'--logappend')
$process = Start-Process -FilePath $mongod -ArgumentList $mongodArguments -WorkingDirectory $root -WindowStyle Hidden -PassThru
Set-Content -LiteralPath (Join-Path $root 'mongod.pid') -Value $process.Id -NoNewline
& icacls.exe (Join-Path $root 'mongod.pid') /inheritance:r /grant:r "*$sid`:(F)" '*S-1-5-18:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir el PID file.' }

$ready = $false
for ($i=0; $i -lt 40; $i++) {
    if (!$process.HasExited -and (Test-NetConnection 127.0.0.1 -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded) { $ready=$true; break }
    Start-Sleep -Milliseconds 500
}
if (!$ready) { throw 'MongoDB nuevo no está listo; conserva el directorio y revisa el log protegido.' }
$info = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction Stop
$listener = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop)
$expectedData = (Resolve-Path -LiteralPath $data).Path
if ($info.ExecutablePath -ne $mongod -or $info.CommandLine -notmatch '--dbpath\s+"([^"]+)"' -or $Matches[1] -ine $expectedData -or
    $info.CommandLine -notmatch '--port\s+27020(?:\s|$)' -or $info.CommandLine -notmatch '--bind_ip\s+127\.0\.0\.1(?:\s|$)' -or
    $info.CommandLine -notmatch '(?:^|\s)--auth(?:\s|$)' -or $listener.Count -ne 1 -or $listener[0].OwningProcess -ne $process.Id -or $listener[0].LocalAddress -ne '127.0.0.1') {
    throw 'Identidad del nuevo mongod distinta; no se aprovisiona.'
}
& node $provision '--target=gemini'
if ($LASTEXITCODE -ne 0) { throw 'Aprovisionamiento fallido; no repetir primer arranque ni borrar el dbPath.' }

& node $baselineCheck --verificar
if ($LASTEXITCODE -ne 0) { throw 'Falló la verificación posterior de 27017/27018.' }
$after = @(Get-PortIdentity $protectedPorts | Sort-Object Port,Address,Pid) | ConvertTo-Json -Depth 4 -Compress
if ($before -cne $after) { throw 'Cambió el proceso/listener de 27017, 27018 o 27019; detenerse para revisión.' }
Write-Output 'NUEVO_ALMACEN_CUOTAS_APROVISIONADO; autenticación obligatoria; 27017-27019 sin cambios detectados'
