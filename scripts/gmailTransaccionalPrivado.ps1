param([Parameter(Mandatory=$true)][ValidateSet('Configurar','Autorizar','Comprobar','Validar','ConfigurarOrigen')][string]$Accion)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$privateRoot = Join-Path $env:LOCALAPPDATA 'PluriOne\marketing-automation\gmail-transaccional'
$configFile = Join-Path $privateRoot 'config.dpapi'
$credentialFile = Join-Path $privateRoot 'credencial.cipher'
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$node = (Get-Command node -CommandType Application -ErrorAction Stop).Source
$oldDirectory = Get-Location
$savedEnv = @{}
$names = @('TRANSACTIONAL_EMAIL_ENABLED','TRANSACTIONAL_GOOGLE_CLIENT_ID','TRANSACTIONAL_GOOGLE_CLIENT_SECRET',
  'TRANSACTIONAL_GOOGLE_REDIRECT_URI','TRANSACTIONAL_GMAIL_SENDER','TRANSACTIONAL_GMAIL_ENCRYPTION_KEY',
  'TRANSACTIONAL_GMAIL_CREDENTIALS_FILE','TRANSACTIONAL_PUBLIC_ORIGIN','GMAIL_CAMPAIGNS_ENABLED','AI_ENABLED','AI_FREE_TIER_CONFIRMED')
foreach($name in $names){$savedEnv[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$etapa='INICIO';$checkCode=$null
$safeNodeCodes=@(& $node -e "console.log(require(process.argv[1]).codigosSeguros.join('\n'))" (Join-Path $PSScriptRoot 'comprobarGmailTransaccional.js'))
if($LASTEXITCODE -ne 0){Write-Host 'OPERACION_DETENIDA codigo=TX_CATALOGO_DIAGNOSTICOS_NO_DISPONIBLE';exit 1}

function Read-PrivateValue([string]$label) {
  $secret = Read-Host $label -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
}
function Assert-PrivateDirectory {
  $item = Get-Item -LiteralPath $privateRoot -Force
  while($item){
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'RUTA_REDIRECTA_NO_PERMITIDA'}
    $item=$item.Parent
  }
  $acl = Get-Acl -LiteralPath $privateRoot
  if(!$acl.AreAccessRulesProtected){throw 'DIRECTORIO_SIN_ACL_PRIVADA'}
  foreach($entry in @($privateRoot,$configFile,$credentialFile)){
    if(!(Test-Path -LiteralPath $entry)){continue}
    if((Get-Item -LiteralPath $entry -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'ARCHIVO_REDIRECTO_NO_PERMITIDO'}
    foreach($rule in (Get-Acl -LiteralPath $entry).Access){
      if($rule.AccessControlType -eq 'Allow'){
        $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if($sid -notin @($currentSid.Value,'S-1-5-18')){throw 'DIRECTORIO_CON_ACCESO_ADICIONAL'}
      }
    }
  }
}
function Set-ConfigEnvironment($config) {
  foreach($name in $names){
    if($config.PSObject.Properties.Name -contains $name){[Environment]::SetEnvironmentVariable($name,[string]$config.$name,'Process')}
  }
  # Se fuerza apagado solo en este proceso/hijos; no se edita .env ni el servidor existente.
  $env:TRANSACTIONAL_EMAIL_ENABLED='false'; $env:GMAIL_CAMPAIGNS_ENABLED='false'
  $env:AI_ENABLED='false'; $env:AI_FREE_TIER_CONFIRMED='false'
}
function Invoke-LocalCheck([string]$mode) {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node
  $info.Arguments='--env-file=.env "'+(Join-Path $PSScriptRoot 'comprobarGmailTransaccional.js')+'" '+$mode
  $info.WorkingDirectory=$projectRoot;$info.UseShellExecute=$false
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.CreateNoWindow=$true
  $check=New-Object Diagnostics.Process;$check.StartInfo=$info
  try {
    $null=$check.Start()
    if(!$check.WaitForExit(15000)){$check.Kill();$check.WaitForExit();throw 'TX_VERIFICADOR_TIEMPO_AGOTADO'}
    $stdout=$check.StandardOutput.ReadToEnd();$stderr=$check.StandardError.ReadToEnd()
    if($check.ExitCode -ne 0){
      $script:checkCode='TX_VERIFICADOR_RECHAZADO'
      if($stderr -match '(?:^|\r?\n)COMPROBACION_TRANSACCIONAL_RECHAZADA codigo=(TX_[A-Z_]+)(?:\r?\n|$)' -and $Matches[1] -cin $safeNodeCodes){$script:checkCode=$Matches[1]}
      throw 'CONFIGURACION_O_CREDENCIAL_NO_VALIDA'
    }
    Write-Host $stdout.Trim()
  } finally {$check.Dispose()}
}
try {
  Set-Location $projectRoot
  $etapa='ACL'
  if($Accion -eq 'Configurar'){
    $newDirectory=!(Test-Path -LiteralPath $privateRoot)
    if(!$newDirectory){
      Assert-PrivateDirectory
      if(@(Get-ChildItem -LiteralPath $privateRoot -Force).Count){throw 'DIRECTORIO_PRIVADO_YA_CONTIENE_ARCHIVOS_NO_SE_SOBRESCRIBE'}
    }
    # Crear únicamente el directorio nuevo, nunca cambiar ACL de directorios existentes.
    $ancestor = Split-Path $privateRoot -Parent
    while(!(Test-Path -LiteralPath $ancestor)){ $ancestor=Split-Path $ancestor -Parent }
    $item=Get-Item -LiteralPath $ancestor -Force
    while($item){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'RUTA_REDIRECTA_NO_PERMITIDA'}; $item=$item.Parent}
    if($newDirectory){
      New-Item -ItemType Directory -Path $privateRoot | Out-Null
      $acl=New-Object Security.AccessControl.DirectorySecurity
      $acl.SetOwner($currentSid); $acl.SetAccessRuleProtection($true,$false)
      foreach($sid in @($currentSid.Value,'S-1-5-18')){
        $identity=New-Object Security.Principal.SecurityIdentifier($sid)
        $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
      }
      Set-Acl -LiteralPath $privateRoot -AclObject $acl
    }
    Assert-PrivateDirectory
    Write-Host 'Introduce los datos en esta ventana local. No se mostraran ni se guardaran en el historial.'
    $clientId=Read-PrivateValue 'Client ID del cliente transaccional (oculto)'
    $clientSecret=Read-PrivateValue 'Client secret transaccional (oculto)'
    $sender=Read-PrivateValue 'Cuenta Gmail remitente exacta (oculta)'
    $origin=Read-PrivateValue 'Origen HTTPS real de registro (opcional para OAuth; Enter si aun no esta definido)'
    $bytes=New-Object byte[] 32
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try {$rng.GetBytes($bytes)} finally {$rng.Dispose()}
    $config=[pscustomobject]@{
      TRANSACTIONAL_EMAIL_ENABLED='false'; TRANSACTIONAL_GOOGLE_CLIENT_ID=$clientId
      TRANSACTIONAL_GOOGLE_CLIENT_SECRET=$clientSecret
      TRANSACTIONAL_GOOGLE_REDIRECT_URI='http://127.0.0.1:3001/oauth/callback'
      TRANSACTIONAL_GMAIL_SENDER=$sender; TRANSACTIONAL_GMAIL_ENCRYPTION_KEY=[Convert]::ToBase64String($bytes)
      TRANSACTIONAL_GMAIL_CREDENTIALS_FILE=$credentialFile; TRANSACTIONAL_PUBLIC_ORIGIN=$origin
    }
    [Array]::Clear($bytes,0,$bytes.Length)
    $etapa='VARIABLES';Set-ConfigEnvironment $config
    $etapa='CONFIGURACION'
    Invoke-LocalCheck '--configuracion'
    $etapa='DPAPI_GUARDADO';$serialized=$config | ConvertTo-Json -Compress
    $secure=ConvertTo-SecureString -String $serialized -AsPlainText -Force
    try {$cipher=ConvertFrom-SecureString -SecureString $secure} finally {$secure.Dispose()}
    $file=[IO.File]::Open($configFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$encoded=[Text.Encoding]::UTF8.GetBytes($cipher);$file.Write($encoded,0,$encoded.Length)} finally {$file.Dispose()}
    Write-Host 'CONFIGURACION_DPAPI_GUARDADA: compatible, privada y con transporte apagado. La cuenta aun no esta autorizada.'
  } else {
    Assert-PrivateDirectory
    $etapa='DPAPI_LECTURA';$item=Get-Item -LiteralPath $configFile -Force
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CONFIGURACION_REDIRECTA_NO_PERMITIDA'}
    $etapa='DPAPI_DESCIFRADO';$secure=ConvertTo-SecureString -String ([IO.File]::ReadAllText($configFile))
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {$etapa='JSON_CONFIGURACION';$config=([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json)}
    finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose()}
    if($config.TRANSACTIONAL_GMAIL_CREDENTIALS_FILE -ne $credentialFile){throw 'RUTA_CREDENCIAL_INESPERADA'}
    $etapa='VARIABLES';Set-ConfigEnvironment $config
    $credentialExists=Test-Path -LiteralPath $credentialFile -PathType Leaf
    if($Accion -eq 'ConfigurarOrigen'){
      # Solo se actualiza un dato no secreto solicitado por el usuario. No cambia
      # cliente, secreto, clave AES ni el archivo de credencial existente.
      $origin=Read-PrivateValue 'Origen HTTPS real de registro (sin ruta, consulta ni credenciales)'
      if([string]::IsNullOrEmpty($origin)){throw 'ORIGEN_HTTPS_REQUERIDO'}
      $config | Add-Member -NotePropertyName 'TRANSACTIONAL_PUBLIC_ORIGIN' -NotePropertyValue $origin -Force
      Set-ConfigEnvironment $config
      $etapa='CONFIGURACION'
      if($credentialExists){Invoke-LocalCheck '--credencial'}else{Invoke-LocalCheck '--configuracion'}
      $etapa='DPAPI_GUARDADO'
      $serialized=$config | ConvertTo-Json -Compress
      $secure=ConvertTo-SecureString -String $serialized -AsPlainText -Force
      try{$cipher=ConvertFrom-SecureString -SecureString $secure}finally{$secure.Dispose()}
      $temporary=Join-Path $privateRoot ('config-'+[Guid]::NewGuid().ToString('N')+'.dpapi.tmp')
      $file=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      try{$encoded=[Text.Encoding]::UTF8.GetBytes($cipher);$file.Write($encoded,0,$encoded.Length)}finally{$file.Dispose()}
      [IO.File]::Replace($temporary,$configFile,$null)
      Assert-PrivateDirectory
      Write-Host 'ORIGEN_HTTPS_GUARDADO: cliente, secreto, clave y token conservados. Transporte apagado.'
      return
    }
    if($Accion -eq 'Autorizar' -and !$credentialExists){
      $etapa='CONFIGURACION'
      Invoke-LocalCheck '--configuracion'
      $etapa='CALLBACK'
      if(@([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq 3001).Count){throw 'PUERTO_3001_OCUPADO'}
      $info=New-Object Diagnostics.ProcessStartInfo
      $info.FileName=$node
      $info.Arguments='--env-file=.env "'+(Join-Path $PSScriptRoot 'autorizarGmailTransaccional.js')+'" --autorizar'
      $info.WorkingDirectory=$projectRoot; $info.UseShellExecute=$false
      $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true; $info.CreateNoWindow=$true
      $child=New-Object Diagnostics.Process; $child.StartInfo=$info
      $etapa='OAUTH';$null=$child.Start()
      Write-Host 'Se abrira Google en el navegador local. Elige la cuenta remitente y concede los permisos. No compartas la URL.'
      while(($line=$child.StandardOutput.ReadLine()) -ne $null){
        if($line.StartsWith('https://accounts.google.com/')){
          $url=[Uri]$line
          if($url.Scheme -ne 'https' -or $url.Host -ne 'accounts.google.com' -or $url.UserInfo){throw 'URL_OAUTH_INESPERADA'}
          Start-Process -FilePath $line | Out-Null
        }
      }
      $stderr=$child.StandardError.ReadToEnd(); $child.WaitForExit()
      if($child.ExitCode -ne 0){
        if($stderr -match '(?:^|\r?\n)AUTORIZACION_TRANSACCIONAL_RECHAZADA codigo=(TX_[A-Z_]+)(?:\r?\n|$)' -and $Matches[1] -cin $safeNodeCodes){$checkCode=$Matches[1]}
        throw 'OAUTH_NO_COMPLETADO'
      }
      $child.Dispose();$child=$null
    }
    $etapa='ACL';Assert-PrivateDirectory
    $etapa='CREDENCIAL'
    if($Accion -eq 'Validar' -and !$credentialExists){
      Invoke-LocalCheck '--configuracion'
      Write-Host 'CONFIGURACION_VALIDA_TOKEN_PENDIENTE: no se inicio OAuth.'
    } else {
      Invoke-LocalCheck '--credencial'
      if($Accion -eq 'Autorizar' -and $credentialExists){Write-Host 'CREDENCIAL_EXISTENTE_VALIDADA: no se inicio otro OAuth ni se sobrescribio el archivo.'}
      Write-Host 'CREDENCIAL_CIFRADA_VERIFICADA: identidad y cliente coinciden. Transporte apagado; sin envios en esta operacion.'
    }
  }
} catch {
  # Nunca interpolar excepcion, linea, URL, variables, JSON o salida de Google.
  $code='TX_OPERACION_LOCAL_RECHAZADA'
  if($checkCode){$code=$checkCode}
  elseif($_.Exception.Message -eq 'PUERTO_3001_OCUPADO'){$code='TX_CALLBACK_OCUPADO'}
  elseif($_.Exception.Message -eq 'TX_VERIFICADOR_TIEMPO_AGOTADO'){$code='TX_VERIFICADOR_TIEMPO_AGOTADO'}
  elseif($etapa -eq 'DPAPI_DESCIFRADO'){$code='TX_DPAPI_NO_DESCIFRABLE'}
  elseif($etapa -eq 'DPAPI_LECTURA'){$code='TX_DPAPI_NO_LEIBLE'}
  elseif($etapa -eq 'JSON_CONFIGURACION'){$code='TX_CONFIGURACION_JSON_INVALIDA'}
  elseif($_.Exception.Message -eq 'ORIGEN_HTTPS_REQUERIDO'){$code='TX_ORIGEN_HTTPS_FALTANTE'}
  elseif($etapa -eq 'DPAPI_GUARDADO'){$code='TX_DPAPI_GUARDADO_RECHAZADO'}
  elseif($etapa -eq 'ACL'){$code='TX_ACL_O_RUTA_INVALIDA'}
  elseif($etapa -eq 'OAUTH'){$code='TX_OAUTH_NO_COMPLETADO'}
  Write-Host ('OPERACION_DETENIDA codigo={0} etapa={1}. Valores privados omitidos; credenciales conservadas.' -f $code,$etapa)
  exit 1
} finally {
  if($child -and !$child.HasExited){$child.Kill();$child.WaitForExit();$child.Dispose()}
  foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$savedEnv[$name],'Process')}
  $config=$null;$clientId=$null;$clientSecret=$null;$sender=$null;$origin=$null;$serialized=$null;$cipher=$null;$encoded=$null
  Set-Location $oldDirectory
}
