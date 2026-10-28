# Shared resolver only; does not connect to MongoDB or load credentials.
function Get-PluriOnePath([string]$Name) {
    $value = & node (Join-Path $PSScriptRoot 'rutasLocales.js') $Name
    if ($LASTEXITCODE -ne 0 -or !$value) { throw 'RUTA_LOCAL_NO_RESUELTA' }
    return $value
}
