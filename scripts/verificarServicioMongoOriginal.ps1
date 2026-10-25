$ErrorActionPreference = 'Stop'
# Solo lectura: sin iniciar/detener servicios ni escribir archivos.
$service = Get-CimInstance Win32_Service -Filter "Name = 'MongoDB'"
if (!$service -or $service.State -ne 'Running' -or $service.ProcessId -ne 6160) { throw 'SERVICIO_ORIGINAL_NO_COINCIDE' }
$binary = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'
$config = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg'
$expectedCommand = '"' + $binary + '" --config "' + $config + '" --service'
if ($service.PathName -cne $expectedCommand) { throw 'COMANDO_SERVICIO_NO_COINCIDE' }
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 27017)
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $listeners[0].OwningProcess -ne $service.ProcessId) { throw 'LISTENER_ORIGINAL_NO_COINCIDE' }
$process = Get-CimInstance Win32_Process -Filter "ProcessId = 6160"
if (!$process -or $process.Name -ne 'mongod.exe' -or !$process.CreationDate) { throw 'PROCESO_ORIGINAL_NO_COINCIDE' }
foreach ($target in @($binary, $config, 'C:\Program Files\MongoDB\Server\8.2\data')) {
    $item = Get-Item -LiteralPath $target
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'RUTA_ORIGINAL_REDIRECCIONADA' }
    if ($item.PSIsContainer) { $parent = $item.Parent } else { $parent = $item.Directory }
    while ($parent) {
        if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'RUTA_ORIGINAL_REDIRECCIONADA' }
        $parent = $parent.Parent
    }
}
[ordered]@{
    name = $service.Name
    state = $service.State
    startMode = $service.StartMode
    pid = [int]$service.ProcessId
    command = $service.PathName
    processCreatedUtc = $process.CreationDate.ToUniversalTime().ToString('o')
    address = $listeners[0].LocalAddress
    port = [int]$listeners[0].LocalPort
    ownerPid = [int]$listeners[0].OwningProcess
    binary = $binary
    binarySha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
    config = $config
    configSha256 = (Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash.ToLowerInvariant()
    dbPath = 'C:\Program Files\MongoDB\Server\8.2\data'
} | ConvertTo-Json -Compress
