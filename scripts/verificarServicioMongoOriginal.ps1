$ErrorActionPreference = 'Stop'
# Solo lectura. La evidencia v3 fija la identidad persistente, nunca el PID actual.
$referencePath = Join-Path $PSScriptRoot '..\docs\mongodb-reconciliacion-pid-v3.json'
if ((Get-FileHash -LiteralPath $referencePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne '9958ed6eeabf1cfd651aba11c108817b7d095510059a0da8dec7e4395b57353d') { throw 'RECONCILIACION_NO_AUTORIZADA' }
$expected = (Get-Content -LiteralPath $referencePath -Raw | ConvertFrom-Json).servicio
$service = Get-CimInstance Win32_Service -Filter "Name = 'MongoDB'"
if (!$service -or $service.Name -cne $expected.name -or $service.State -cne $expected.state -or
    $service.StartMode -cne $expected.startMode -or $service.ProcessId -le 0) { throw 'SERVICIO_ORIGINAL_NO_COINCIDE' }
$binary = $expected.binary
$config = $expected.config
$dbPath = $expected.dbPath
if ($service.PathName -cne $expected.command) { throw 'COMANDO_SERVICIO_NO_COINCIDE' }
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $expected.port)
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne $expected.address -or
    $listeners[0].OwningProcess -ne $service.ProcessId) { throw 'LISTENER_ORIGINAL_NO_COINCIDE' }
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($service.ProcessId)"
if (!$process -or $process.Name -cne 'mongod.exe' -or !$process.CreationDate) { throw 'PROCESO_ORIGINAL_NO_COINCIDE' }
# No aceptar campos vacios: Windows puede ocultarlos por falta de permisos.
if (!$process.ExecutablePath -or !$process.CommandLine) { throw 'IDENTIDAD_PROCESO_NO_LEGIBLE' }
if ($process.ExecutablePath -ine $binary -or $process.CommandLine -cne $expected.command) { throw 'PROCESO_ORIGINAL_NO_COINCIDE' }
function Get-OriginalCanonicalPath([string]$Target) {
    $item = Get-Item -LiteralPath $Target
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'RUTA_ORIGINAL_REDIRECCIONADA' }
    if ($item.PSIsContainer) { $parent = $item.Parent } else { $parent = $item.Directory }
    while ($parent) {
        if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'RUTA_ORIGINAL_REDIRECCIONADA' }
        $parent = $parent.Parent
    }
    $resolved = Resolve-Path -LiteralPath $Target
    if ($resolved.Provider.Name -ne 'FileSystem' -or $resolved.ProviderPath -ine $Target) { throw 'RUTA_ORIGINAL_NO_CANONICA' }
    return $resolved.ProviderPath
}
$binaryCanonical = Get-OriginalCanonicalPath $binary
$configCanonical = Get-OriginalCanonicalPath $config
$dataCanonical = Get-OriginalCanonicalPath $dbPath
if ((Get-Item -LiteralPath $binary).PSIsContainer -or (Get-Item -LiteralPath $config).PSIsContainer -or
    !(Get-Item -LiteralPath $dbPath).PSIsContainer) { throw 'TIPO_RUTA_ORIGINAL_INCORRECTO' }
$binaryHash = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
$configHash = (Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash.ToLowerInvariant()
if ($binaryHash -cne $expected.binarySha256 -or $configHash -cne $expected.configSha256) { throw 'HUELLA_ARCHIVO_ORIGINAL_DIFIERE' }
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
    binarySha256 = $binaryHash
    config = $config
    configSha256 = $configHash
    dbPath = $dbPath
    processBinary = $process.ExecutablePath
    processCommand = $process.CommandLine
    binaryCanonical = $binaryCanonical
    configCanonical = $configCanonical
    dbPathCanonical = $dataCanonical
} | ConvertTo-Json -Compress
