$ErrorActionPreference = 'Stop'
$version = '100.19.1'
$toolsRoot = Join-Path $env:LOCALAPPDATA 'PluriOne\MongoDBDatabaseTools'
$install = Join-Path $toolsRoot $version
$names = @('mongodump.exe', 'mongorestore.exe')
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$systemSid = 'S-1-5-18'
$writeBits = [int]([Security.AccessControl.FileSystemRights]::WriteData -bor [Security.AccessControl.FileSystemRights]::AppendData -bor [Security.AccessControl.FileSystemRights]::WriteAttributes -bor [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership)
function Assert-ReadOnlyAcl([string]$path) {
    $acl = Get-Acl -LiteralPath $path -ErrorAction Stop
    $ownerSid = (New-Object Security.Principal.NTAccount($acl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value
    if ($ownerSid -ne $sid) { throw 'El propietario de Database Tools no coincide con el usuario actual.' }
    if ($acl.Access | Where-Object AccessControlType -eq Deny) { throw 'Database Tools contiene una ACL Deny que requiere revisión manual.' }
    $userFound = $false
    $systemFound = $false
    foreach ($rule in $acl.Access | Where-Object AccessControlType -eq Allow) {
        $ruleSid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($ruleSid -notin @($sid, $systemSid)) { throw 'ACL de Database Tools incluye una identidad inesperada.' }
        if ($ruleSid -eq $sid) { $userFound = $true; if (([int]$rule.FileSystemRights -band $writeBits) -ne 0) { throw 'El usuario actual tiene escritura sobre Database Tools.' } }
        if ($ruleSid -eq $systemSid) { $systemFound = $true; if (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq 0) { throw 'SYSTEM debe conservar FullControl.' } }
    }
    if (!$userFound -or !$systemFound) { throw 'La ACL no concede los permisos mínimos esperados al usuario y a SYSTEM.' }
}
if (!(Test-Path -LiteralPath $toolsRoot -PathType Container) -or !(Test-Path -LiteralPath $install -PathType Container)) { throw 'Database Tools no están en el destino local esperado; detenerse.' }
Assert-ReadOnlyAcl $toolsRoot
foreach ($path in @($toolsRoot, $install)) {
    if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'El destino está redirigido; detenerse.' }
    Assert-ReadOnlyAcl $path
}
foreach ($name in $names) {
    $matches = @(Get-ChildItem -LiteralPath $install -Filter $name -Recurse -File -ErrorAction Stop)
    if ($matches.Count -ne 1) { throw 'Falta una herramienta o hay rutas ambiguas; detenerse.' }
    $exe = $matches[0]
    Assert-ReadOnlyAcl $exe.FullName
    $versionOutput = (& $exe.FullName --version 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch [regex]::Escape($version)) { throw 'La versión de Database Tools no coincide.' }
    $null = Get-Acl -LiteralPath $exe.FullName -ErrorAction Stop
}
Write-Output "DATABASE_TOOLS_PRESENTES_Y_VERSION_VALIDADA $version; no se descargaron ni modificaron archivos o ACL"
