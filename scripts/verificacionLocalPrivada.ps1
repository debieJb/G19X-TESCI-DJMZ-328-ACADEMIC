param(
  [Parameter(Mandatory=$true)][ValidateSet('Preparar','Web','Comprobar','Cola','Estado','PrepararUnCorreo','EnviarUnCorreo','Trabajador','PrepararGmail','WebGmail','DiagnosticoGmail')][string]$Accion,
  [switch]$ConfiarCertificadoLocal,
  [ValidatePattern('^[a-f0-9]{24}$')][string]$Solicitud,
  [switch]$AutorizarUnCorreo,
  [switch]$AutorizarEnviosAutomaticos,
  [switch]$PerfilGmail
)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$root=Join-Path $env:LOCALAPPDATA 'PluriOne\marketing-automation\verificacion-local'
$configFile=Join-Path $root 'web.dpapi'
$pfxFile=Join-Path $root 'localhost.pfx'
$certFile=Join-Path $root 'localhost.cer'
$node=(Get-Command node -CommandType Application).Source
$saved=@{};$oldDirectory=Get-Location;$stage='INICIO'
function Set-PrivateEnv([string]$name,[string]$value){
  if(!$saved.ContainsKey($name)){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
  [Environment]::SetEnvironmentVariable($name,$value,'Process')
}
function Read-Dpapi([string]$file){
  if((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'RUTA_REDIRECTA'}
  $secure=ConvertTo-SecureString -String ([IO.File]::ReadAllText($file))
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)|ConvertFrom-Json)}
  finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose()}
}
function Assert-Acl([string]$directory){
  $item=Get-Item -LiteralPath $directory -Force
  while($item){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'RUTA_REDIRECTA'};$item=$item.Parent}
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if(!(Get-Acl -LiteralPath $directory).AreAccessRulesProtected){throw 'ACL_NO_PRIVADA'}
  foreach($entry in @((Get-Item -LiteralPath $directory -Force)) + @(Get-ChildItem -LiteralPath $directory -Force)){
    if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'RUTA_REDIRECTA'}
    foreach($rule in (Get-Acl -LiteralPath $entry.FullName).Access){
      if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18')){throw 'ACL_NO_PRIVADA'}
    }
  }
}
function Random-Key {
  $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($bytes);return [Convert]::ToBase64String($bytes)}finally{[Array]::Clear($bytes,0,$bytes.Length);$rng.Dispose()}
}
function Load-WebEnvironment($config){
  if($config.PILOT_TLS_PFX_FILE -ne $pfxFile -or $config.PILOT_TLS_CERT_FILE -ne $certFile){throw 'ARCHIVO_TLS_INESPERADO'}
  $allowed=@('NODE_ENV','PILOT_LOCAL_HTTPS','PILOT_TLS_PFX_FILE','PILOT_TLS_CERT_FILE','PILOT_TLS_PFX_PASSPHRASE','SESSION_SECRET','SESSION_STORE_KEY')
  if(@($config.PSObject.Properties).Count -ne $allowed.Count){throw 'CONFIGURACION_LOCAL_INVALIDA'}
  foreach($property in $config.PSObject.Properties){
    if($property.Name -notin $allowed -or $property.Value -isnot [string]){throw 'CONFIGURACION_LOCAL_INVALIDA'}
    Set-PrivateEnv $property.Name $property.Value
  }
  Set-PrivateEnv 'NODE_ENV' 'production';Set-PrivateEnv 'PILOT_LOCAL_HTTPS' 'true'
  Set-PrivateEnv 'MONGODB_URI' 'mongodb://127.0.0.1:27019/marketing_piloto_mvp?replicaSet=marketingPilotLocalRs'
  foreach($name in @('TRANSACTIONAL_EMAIL_ENABLED','TRANSACTIONAL_WORKER_ENABLED','GMAIL_CAMPAIGNS_ENABLED','AI_ENABLED','AI_FREE_TIER_CONFIRMED')){Set-PrivateEnv $name 'false'}
}
function Invoke-Check([string]$mode){
  & $node '--env-file=.env' (Join-Path $PSScriptRoot 'verificacionLocal.js') $mode
  if($LASTEXITCODE -ne 0){throw 'COMPROBACION_LOCAL_FALLIDA'}
}
try{
  Set-Location $projectRoot
  if($AutorizarUnCorreo -and $Accion -ne 'EnviarUnCorreo'){throw 'AUTORIZACION_FUERA_DE_ACCION'}
  if($AutorizarEnviosAutomaticos -and $Accion -ne 'Trabajador'){throw 'AUTORIZACION_FUERA_DE_ACCION'}
  if($Accion -eq 'Trabajador' -and !$AutorizarEnviosAutomaticos){throw 'AUTORIZACION_EXPRESA_REQUERIDA'}
  if($Accion -eq 'EnviarUnCorreo' -and (!$AutorizarUnCorreo -or !$Solicitud)){throw 'AUTORIZACION_EXPRESA_REQUERIDA'}
  if($Accion -eq 'Preparar' -and !(Test-Path -LiteralPath $configFile)){
    if(!$ConfiarCertificadoLocal){throw 'CONFIANZA_LOCAL_REQUIERE_AUTORIZACION'}
    if(Test-Path -LiteralPath $root){throw 'DIRECTORIO_EXISTENTE_NO_SE_RECREA'}
    $stage='DIRECTORIO_PRIVADO'
    $ancestor=Split-Path $root -Parent
    while(!(Test-Path -LiteralPath $ancestor)){$ancestor=Split-Path $ancestor -Parent}
    $item=Get-Item -LiteralPath $ancestor -Force
    while($item){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'RUTA_REDIRECTA'};$item=$item.Parent}
    New-Item -ItemType Directory -Path $root | Out-Null
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
    foreach($value in @($sid.Value,'S-1-5-18')){
      $identity=New-Object Security.Principal.SecurityIdentifier($value)
      $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    }
    Set-Acl -LiteralPath $root -AclObject $acl;Assert-Acl $root
    $stage='CERTIFICADO_LOCAL'
    $cert=New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'PluriOne localhost verificacion (30 dias)' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.1') -NotBefore (Get-Date).AddMinutes(-5) -NotAfter (Get-Date).AddDays(30)
    $password=Random-Key
    $securePassword=ConvertTo-SecureString -String $password -AsPlainText -Force
    try{Export-PfxCertificate -Cert $cert -FilePath $pfxFile -Password $securePassword -CryptoAlgorithmOption AES256_SHA256 | Out-Null}finally{$securePassword.Dispose()}
    Export-Certificate -Cert $cert -FilePath $certFile -Type CERT | Out-Null
    $sessionKey=Random-Key
    $config=[pscustomobject]@{NODE_ENV='production';PILOT_LOCAL_HTTPS='true';PILOT_TLS_PFX_FILE=$pfxFile;PILOT_TLS_CERT_FILE=$certFile;PILOT_TLS_PFX_PASSPHRASE=$password;SESSION_SECRET=(Random-Key);SESSION_STORE_KEY=([BitConverter]::ToString([Convert]::FromBase64String($sessionKey)).Replace('-','').ToLowerInvariant())}
    Load-WebEnvironment $config
    Invoke-Check '--certificado'
    $stage='DPAPI'
    $secure=ConvertTo-SecureString -String ($config|ConvertTo-Json -Compress) -AsPlainText -Force
    try{$cipher=ConvertFrom-SecureString -SecureString $secure}finally{$secure.Dispose()}
    $stream=[IO.File]::Open($configFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.Encoding]::UTF8.GetBytes($cipher);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
  }
  $stage='CONFIGURACION_PRIVADA';Assert-Acl $root;$config=Read-Dpapi $configFile;Load-WebEnvironment $config
  if($PerfilGmail -or $Accion -in @('PrepararGmail','WebGmail','DiagnosticoGmail')){
    Set-PrivateEnv 'PILOT_PREPARATION_PROFILE' 'gmail'
    Set-PrivateEnv 'MONGODB_URI' 'mongodb://127.0.0.1:27019/marketing_gmail_preparacion_local?replicaSet=marketingPilotLocalRs'
    Set-PrivateEnv 'GOOGLE_OAUTH_REDIRECT_URI' 'https://localhost:3100/empresa/gmail/callback'
    Set-PrivateEnv 'GMAIL_CAMPAIGNS_MODE' 'automatico'
    Set-PrivateEnv 'GMAIL_CAMPAIGNS_PILOT_COMPANIES' ''
  }
  Invoke-Check '--certificado'
  $cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2($certFile)
  $trustedPath='Cert:\CurrentUser\Root\'+$cert.Thumbprint
  if(!(Test-Path -LiteralPath $trustedPath)){
    if($Accion -ne 'Preparar' -or !$ConfiarCertificadoLocal){throw 'CERTIFICADO_AUN_NO_CONFIADO'}
    $stage='CONFIANZA_EXPLICITA';Import-Certificate -FilePath $certFile -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  }
  if($Accion -eq 'Preparar'){
    Write-Host 'ORIGEN_LOCAL_PREPARADO: certificado localhost, confianza solo del usuario y claves nuevas del piloto protegidas. Sin envios.'
  }elseif($Accion -in @('PrepararGmail','DiagnosticoGmail')){
    $mode=if($Accion -eq 'PrepararGmail'){'--preparar'}else{'--diagnostico'}
    & $node '--env-file=.env' (Join-Path $PSScriptRoot 'prepararEntornoGmailLocal.js') $mode
    if($LASTEXITCODE -ne 0){throw 'DIAGNOSTICO_GMAIL_RECHAZADO'}
    if($Accion -eq 'DiagnosticoGmail'){Invoke-Check '--web'}
  }elseif($Accion -in @('Web','WebGmail')){
    $stage='WEB_HTTPS'
    & $node '--env-file=.env' (Join-Path $PSScriptRoot 'iniciarWebPiloto.js')
    if($LASTEXITCODE -ne 0){throw 'ARRANQUE_LOCAL_RECHAZADO'}
  }elseif($Accion -eq 'Comprobar'){
    Invoke-Check '--web'
  }elseif($Accion -eq 'Cola'){
    Invoke-Check '--cola'
  }elseif($Accion -in @('Estado','PrepararUnCorreo')){
    $stage='BUZON_CONTROLADO';$secret=Read-Host 'Correo de la solicitud ficticia (oculto)' -AsSecureString
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try{Set-PrivateEnv 'PILOT_TEST_RECIPIENT' ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}
    if($Accion -eq 'PrepararUnCorreo'){
      if(!$Solicitud){throw 'SOLICITUD_REQUERIDA'}
      & $node '--env-file=.env' (Join-Path $PSScriptRoot 'verificacionLocal.js') '--preparar' $Solicitud
      if($LASTEXITCODE -ne 0){throw 'COMPROBACION_LOCAL_FALLIDA'}
    }else{Invoke-Check '--estado'}
  }else{
    # Solo esta accion, con el switch explicito, puede alcanzar Google en una prueba futura.
    $stage='CONFIGURACION_SMTP_TRANSACCIONAL'
    Set-PrivateEnv 'TRANSACTIONAL_PUBLIC_ORIGIN' 'https://localhost:3100';Set-PrivateEnv 'TRANSACTIONAL_EMAIL_ENABLED' 'false'
    & $node '--env-file=.env' '-e' "try { require('./services/smtpTransaccionalService').configuracion(); console.log('SMTP_CONFIGURADO_SIN_CONECTAR'); } catch { console.error('CONFIGURACION_SMTP_INVALIDA'); process.exitCode=1; }"
    if($LASTEXITCODE -ne 0){throw 'CONFIGURACION_SMTP_INVALIDA'}
    Invoke-Check '--web'
    Set-PrivateEnv 'TRANSACTIONAL_EMAIL_ENABLED' 'true'
    if($Accion -eq 'Trabajador'){
      Set-PrivateEnv 'TRANSACTIONAL_WORKER_ENABLED' 'true'
      $stage='TRABAJADOR_AUTOMATICO_AUTORIZADO'
      & $node '--env-file=.env' (Join-Path $PSScriptRoot 'supervisarVerificacion.js') '--residente' '--autorizar-trabajador'
    }else{
      $stage='BUZON_CONTROLADO'
      $secret=Read-Host 'Buzon propio autorizado para esta solicitud (oculto)' -AsSecureString
      $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
      try{Set-PrivateEnv 'PILOT_TEST_RECIPIENT' ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}
      $stage='UN_CORREO_AUTORIZADO'
      & $node '--env-file=.env' (Join-Path $PSScriptRoot 'verificacionLocal.js') '--enviar' $Solicitud '--autorizar-un-correo'
    }
    if($LASTEXITCODE -ne 0){throw 'REVISAR_ESTADO_NO_REINTENTAR'}
  }
}catch{
  Write-Host ('PREPARACION_LOCAL_DETENIDA etapa={0}. Archivos existentes conservados; no reintentar envios sin revisar estado.' -f $stage)
  exit 1
}finally{
  foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
  $config=$null;$gmail=$null;$password=$null;$sessionKey=$null;$cipher=$null;$bytes=$null
  Set-Location $oldDirectory
}
