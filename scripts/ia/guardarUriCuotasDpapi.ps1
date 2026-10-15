param([switch]$AlmacenGemini)
$ErrorActionPreference = 'Stop'
$appRoot = Join-Path $env:LOCALAPPDATA 'PluriOne'
$projectRoot = Join-Path $appRoot 'marketing-automation'
$root = Join-Path $projectRoot 'secrets'
$fileName = if ($AlmacenGemini) { 'quota-uri-gemini.dpapi' } else { 'quota-uri.dpapi' }
$file = Join-Path $root $fileName
foreach ($path in @($appRoot, $projectRoot, $root)) {
    if (Test-Path -LiteralPath $path) {
        if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Ruta DPAPI redirigida; se detiene.' }
    } else { New-Item -ItemType Directory -Path $path | Out-Null }
}
if (Test-Path -LiteralPath $file) { throw 'Ya existe una URI DPAPI; no se sobrescribe.' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $root /inheritance:r /grant:r "*$sid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir ACL del almacén DPAPI.' }
$secret = Read-Host 'Contraseña runtime MongoDB (entrada oculta)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ($plain.Length -lt 24 -or $plain -notmatch '^[A-Za-z0-9._~-]+$') { throw 'La contraseña debe tener al menos 24 caracteres URI-seguros.' }
    $encoded = [Uri]::EscapeDataString($plain)
    $port = if ($AlmacenGemini) { 27020 } else { 27019 }
    $uri = "mongodb://plurione_ia_quota_runtime:$encoded@127.0.0.1:$port/plurione_ai_quota?authSource=plurione_ai_quota&directConnection=true"
    $secureUri = ConvertTo-SecureString -String $uri -AsPlainText -Force
    $cipher = ConvertFrom-SecureString -SecureString $secureUri
    $tmp = "$file.tmp"
    [IO.File]::WriteAllText($tmp, $cipher)
    & icacls.exe $tmp /inheritance:r /grant:r "*$sid`:(F)" '*S-1-5-18:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir ACL del archivo DPAPI.' }
    [IO.File]::Move($tmp, $file)
} finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $plain = $null; $uri = $null; $encoded = $null
    if ($secureUri) { $secureUri.Dispose() }
    if ($secret) { $secret.Dispose() }
}
Write-Output 'URI_CIFRADA_CON_DPAPI; valor no mostrado'
