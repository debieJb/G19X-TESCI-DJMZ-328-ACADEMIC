param([switch]$ValidarAlmacen,[switch]$AlmacenGemini)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (!$ValidarAlmacen) {
    $port3000 = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq 3000 }
    if ($port3000) { throw 'Express ya escucha en 3000; no se inicia una segunda instancia. Detén el servidor actual de forma controlada antes de usar este lanzador.' }
}
$fileName = if ($AlmacenGemini) { 'quota-uri-gemini.dpapi' } else { 'quota-uri.dpapi' }
$file = Join-Path (Join-Path $env:LOCALAPPDATA 'PluriOne\marketing-automation\secrets') $fileName
if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw 'No existe el archivo DPAPI de cuotas.' }
if ((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'El archivo DPAPI está redirigido.' }
$cipher = [IO.File]::ReadAllText($file)
$secure = ConvertTo-SecureString -String $cipher
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$oldUri = $env:AI_QUOTA_MONGODB_URI
$oldBackend = $env:AI_QUOTA_BACKEND
try {
    $env:AI_QUOTA_MONGODB_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $env:AI_QUOTA_BACKEND = 'protected'
    Set-Location $projectRoot
    if ($ValidarAlmacen) { & node (Join-Path $projectRoot 'scripts\ia\validarAlmacenCuotas.js') }
    else { & node (Join-Path $projectRoot 'server.js') }
    if ($LASTEXITCODE -ne 0) { throw 'Express terminó con error.' }
} finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $env:AI_QUOTA_MONGODB_URI = $oldUri
    $env:AI_QUOTA_BACKEND = $oldBackend
    $cipher = $null; $secure = $null
}
