param([switch]$PermitirElevacion)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'rutasLocales.ps1')
$rsRoot = Get-PluriOnePath 'devRoot'
$rsBinary = Get-PluriOnePath 'mongod'
$rsCheck = Join-Path $PSScriptRoot 'verificarMongoDevRs.js'
$project = Split-Path $PSScriptRoot -Parent
$mutex = New-Object Threading.Mutex($false, 'Local\PluriOneMarketingDevRs27018')
$taken = $false
try {
    try { $taken = $mutex.WaitOne(60000) } catch [Threading.AbandonedMutexException] { $taken = $true }
    if (!$taken) { throw 'MONGODB_OTRO_ARRANQUE_EN_CURSO' }
    if ([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq 27018) {
        & node (Join-Path $PSScriptRoot 'iniciarDevLocal.js') --verificar
        if ($LASTEXITCODE -ne 0) { throw 'MONGODB_27018_IDENTIDAD_O_PRIMARY_INVALIDO' }
        Write-Output 'MONGODB_DEV: REUTILIZADO'
        exit 0
    }
    foreach ($rsDir in @($rsRoot, (Join-Path $rsRoot 'data'), (Join-Path $rsRoot 'logs'))) {
        $rsItem = Get-Item -LiteralPath $rsDir
        if (!$rsItem.PSIsContainer -or ($rsItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'DIRECTORIO_NO_SEGURO' }
        $parent = $rsItem.Parent
        while ($parent) {
            if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'DIRECTORIO_REDIRECCIONADO' }
            $parent = $parent.Parent
        }
    }
    if (!(Test-Path -LiteralPath (Join-Path $rsRoot 'original-baseline.json') -PathType Leaf) -or
        !(Test-Path -LiteralPath (Join-Path $rsRoot 'data\WiredTiger') -PathType Leaf)) { throw 'DATOS_EXISTENTES_Y_REFERENCIA_REQUERIDOS' }
    try {
        $ErrorActionPreference = 'Continue'
        $comparison = @(& node $rsCheck --comparar-original 2>&1 | ForEach-Object { "$_" })
        $comparisonExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($comparisonExit -ne 0) {
        $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        $permissionFailure = ($comparison -join "`n") -match 'IDENTIDAD_PROCESO_NO_LEGIBLE|COLECTOR_SERVICIO_ORIGINAL_FALLIDO|CONSULTA_TCP_ORIGINAL_FALLIDA'
        if (!$admin -and $PermitirElevacion -and $permissionFailure) {
            Write-Output 'ELEVACION_REQUERIDA: lectura protegida de identidad MongoDB 27017; acepta UAC para continuar.'
            $mutex.ReleaseMutex(); $taken = $false
            $out = Join-Path ([IO.Path]::GetTempPath()) ('plurione-mongo-' + [guid]::NewGuid().ToString('N') + '.log')
            $safeRoot = $rsRoot.Replace("'", "''"); $safeBinary = $rsBinary.Replace("'", "''")
            $safeScript = (Join-Path $PSScriptRoot 'iniciarMongoDevRsExistente.ps1').Replace("'", "''")
            $safeProject = $project.Replace("'", "''"); $safeOut = $out.Replace("'", "''")
            $code = "Set-Location '$safeProject'; `$env:PLURIONE_MONGO_DEV_ROOT='$safeRoot'; `$env:PLURIONE_MONGOD_PATH='$safeBinary'; try { & '$safeScript' *> '$safeOut'; exit `$LASTEXITCODE } catch { 'MONGODB_ARRANQUE_RECHAZADO' | Out-File '$safeOut' -Append; exit 1 }"
            $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
            $elevated = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','RemoteSigned','-EncodedCommand',$encoded) -PassThru
            # -Wait de Start-Process espera tambien a mongod: esperar solo el PowerShell padre.
            $elevated.WaitForExit()
            if (Test-Path -LiteralPath $out) { Get-Content -LiteralPath $out }
            if ($elevated.ExitCode -ne 0) { throw 'MONGODB_ELEVACION_O_IDENTIDAD_FALLIDA' }
            exit 0
        }
        $comparison | Write-Output
        throw 'MONGODB_ORIGINAL_NO_VALIDADO: se requieren permisos para leer su identidad; no se inicia otro proceso.'
    }
    $comparison | Write-Output
    # comparar-original autentica esta referencia antes de usarla.
    $expected = (Get-Content -LiteralPath (Join-Path $project 'docs\mongodb-reconciliacion-pid-v3.json') -Raw | ConvertFrom-Json).servicio
    if ((Resolve-Path -LiteralPath $rsBinary).ProviderPath -ine $expected.binary -or
        (Get-FileHash -LiteralPath $rsBinary -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected.binarySha256) { throw 'BINARIO_MONGO_NO_AUTORIZADO' }
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='mongod.exe'")
    $originalService = Get-CimInstance Win32_Service -Filter "Name='MongoDB'"
    if ($processes.Count -ne 1 -or $processes[0].ProcessId -ne $originalService.ProcessId) { throw 'OTRO_MONGOD_REQUIERE_REVISION: no se fuerza acceso a data.' }
    if ([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq 27018) { throw 'PUERTO_27018_CAMBIO_DURANTE_ARRANQUE' }
    $rsData = Join-Path $rsRoot 'data'
    $rsLog = Join-Path $rsRoot 'logs\mongod.log'
    $rsArgs = @('--replSet', 'marketingDevRs', '--port', '27018', '--bind_ip', '127.0.0.1', '--dbpath', ('"' + $rsData + '"'), '--logpath', ('"' + $rsLog + '"'), '--logappend', '--wiredTigerCacheSizeGB', '0.25', '--oplogSize', '128')
    $rsProcess = Start-Process -FilePath $rsBinary -ArgumentList $rsArgs -WorkingDirectory $rsRoot -WindowStyle Hidden -PassThru
    Write-Output ('MONGODB_DEV_PID: ' + $rsProcess.Id)
    & node $rsCheck --verificar
    if ($LASTEXITCODE -ne 0) { throw 'VERIFICACION_FALLIDA: revisar log; sin reparar ni detener otros procesos.' }
} finally {
    if ($taken) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
