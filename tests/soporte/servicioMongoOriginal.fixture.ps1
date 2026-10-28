param([string]$Caso = 'valido')
$ErrorActionPreference = 'Stop'
# Dobles de Windows: ningun acceso a procesos, puertos ni bases reales.
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$referencePath = Join-Path $repo 'docs\mongodb-reconciliacion-pid-v3.json'
$historica = [IO.File]::ReadAllText($referencePath) | ConvertFrom-Json
$expected = $historica.servicio
function Get-CimInstance($ClassName, $Filter) {
    if ($ClassName -eq 'Win32_Service' -and $Filter -eq "Name = 'MongoDB'") {
        return [pscustomobject]@{ Name='MongoDB'; State='Running'; StartMode='Auto'; ProcessId=6040;
            PathName=$(if($Caso -eq 'servicioSustituido'){'otro'}else{$expected.command}) }
    }
    if ($ClassName -eq 'Win32_Process' -and $Filter -eq 'ProcessId = 6040') {
        return [pscustomobject]@{ Name='mongod.exe'; CreationDate=[datetime]'2026-10-26T08:25:29Z';
            ExecutablePath=$(if($Caso -eq 'imagenNoLegible'){''}elseif($Caso -eq 'imagenAjena'){'D:\otro\mongod.exe'}else{$expected.binary}); CommandLine=$expected.command }
    }
    throw 'CONSULTA_NO_PREVISTA'
}
function Get-NetTCPConnection($State, $LocalPort) {
    if ($State -ne 'Listen' -or $LocalPort -ne 27017) { throw 'PUERTO_NO_PREVISTO' }
    [pscustomobject]@{ LocalAddress='127.0.0.1'; LocalPort=27017; OwningProcess=$(if($Caso -eq 'listenerAjeno'){1}else{6040}) }
}
function Get-Item($LiteralPath) {
    if ($LiteralPath -notin @($expected.binary,$expected.config,$expected.dbPath)) { throw 'RUTA_NO_PREVISTA' }
    [pscustomobject]@{ Attributes=$(if($Caso -eq 'rutaRedirigida'){[IO.FileAttributes]::ReparsePoint}else{[IO.FileAttributes]::Normal});
        PSIsContainer=($LiteralPath -eq $expected.dbPath); Parent=$null; Directory=$null }
}
function Resolve-Path($LiteralPath) {
    [pscustomobject]@{ Provider=[pscustomobject]@{Name='FileSystem'}; ProviderPath=$LiteralPath }
}
function Get-FileHash($LiteralPath,$Algorithm) {
    if($Algorithm -ne 'SHA256'){throw 'ALGORITMO_NO_PREVISTO'}
    $value = if($LiteralPath -eq $referencePath) {
        $sha=[Security.Cryptography.SHA256]::Create()
        try { ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($referencePath)))).Replace('-','') } finally {$sha.Dispose()}
    } elseif($LiteralPath -eq $expected.binary) {$expected.binarySha256}
    elseif($LiteralPath -eq $expected.config) {if($Caso -eq 'huellaAlterada'){'alterada'}else{$expected.configSha256}}
    else {throw 'ARCHIVO_NO_PREVISTO'}
    [pscustomobject]@{Hash=$value}
}
. (Join-Path $repo 'scripts\verificarServicioMongoOriginal.ps1')
