const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'scripts', 'ia');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('preparación de cuotas solo reserva 27019 y comprueba identidades originales antes y después', () => {
  const script = read('prepararAlmacenCuotas.ps1');
  assert.match(script, /\.Port -eq 27019/);
  assert.doesNotMatch(script, /\.Port -in @\(27017,\s*27018/);
  assert.doesNotMatch(script, /\.Port -eq 27017|\.Port -eq 27018/);
  assert.equal((script.match(/& node \$baselineCheck --verificar/g) || []).length, 2);
  assert.match(script, /--bind_ip', '127\.0\.0\.1'/);
  assert.match(script, /'--auth'/);
});

test('el nuevo despliegue Gemini usa puerto y dbPath exclusivos y compara procesos 27017-27019', () => {
  const script = read('prepararNuevoAlmacenCuotas.ps1');
  assert.match(script, /Get-PluriOnePath 'geminiRoot'/);
  assert.match(script, /27020/);
  assert.match(script, /127\.0\.0\.1/);
  assert.match(script, /--auth/);
  assert.match(script, /\$protectedPorts = @\(3000,5678,27017,27018,27019\)/);
  assert.match(script, /oldQuotaItems\[0\]\.CommandLine -notmatch '--dbpath/);
  assert.match(script, /if \(\$before -cne \$after\)/);
  assert.match(script, /node \$provision '--target=gemini'/);
  assert.match(script, /ConfirmarEjecucion/);
  assert.doesNotMatch(script, /LocalPort\s+27017|LocalPort\s+27018|LocalPort\s+27019/);
});

test('DPAPI, launcher, apagado ordenado y backup pueden apuntar al DPAPI Gemini independiente', () => {
  assert.match(read('guardarUriCuotasDpapi.ps1'), /quota-uri-gemini\.dpapi/);
  assert.match(read('guardarUriCuotasDpapi.ps1'), /if \(\$AlmacenGemini\) \{ 27020 \}/);
  assert.match(read('iniciarExpressConCuotas.ps1'), /quota-uri-gemini\.dpapi/);
  assert.match(read('detenerAlmacenCuotas.ps1'), /Get-PluriOnePath 'geminiRoot'/);
  assert.match(read('detenerAlmacenCuotas.ps1'), /if \(\$AlmacenGemini\) \{ 27020 \}/);
  assert.match(read('probarRespaldoCuotas.ps1'), /if \(\$AlmacenGemini\) \{ 27020 \}/);
});

test('aprovisionamiento usa un prompt TTY oculto y diagnósticos sin mensaje sensible', () => {
  const script = read('aprovisionarCuotas.mongo.js');
  const core = read('cuotasProvisioningCore.js');
  const prompt = read('entradaSecreta.js');
  assert.match(script, /leerSecretoOculto/);
  assert.match(prompt, /setRawMode\(true\)/);
  assert.match(prompt, /output\.write\(etiqueta\)/);
  assert.doesNotMatch(prompt, /output\.write\(character/);
  assert.match(core, /stage=\$\{failure\.stage\} code=\$\{failure\.code\}/);
  assert.match(core, /No se imprimieron mensajes del driver/);
  assert.match(core, /dropUser: BOOTSTRAP/);
  assert.match(core, /validatePassword/);
  assert.doesNotMatch(script + core, /passwordPrompt\(/);
  assert.doesNotMatch(script, /--password(?:\s|=)/i);
  assert.match(core, /\[RUNTIME, \[\{ role: RUNTIME, db: DB \}\]\]/);
  assert.match(core, /admin\.command\(\{ createRole: MAINTENANCE_SHUTDOWN, privileges: shutdownPrivileges, roles: \[\] \}\)/);
  assert.doesNotMatch(core, /db\.command\(\{ createRole: MAINTENANCE, privileges: \[[^\]]*cluster/);
  assert.match(core, /find', 'insert', 'listIndexes', 'update/);
});

test('Database Tools 100.19.1 solo se verifican y nunca se reinstalan ni cambian ACL', () => {
  const script = read('instalarMongoDatabaseTools.ps1');
  assert.match(script, /100\.19\.1/);
  assert.match(script, /--version/);
  assert.match(script, /New-Object Security\.Principal\.NTAccount/);
  assert.match(script, /Get-Acl/);
  assert.doesNotMatch(script, /Invoke-WebRequest|Start-Process|msiexec|icacls|Remove-Item/i);
});

test('recuperación autentica y valida versión, puerto, loopback, autenticación y dbpath antes de borrar bootstrap', () => {
  const script = read('recuperarAlmacenCuotas.ps1');
  for (const expected of ['Get-CimInstance Win32_Process', 'Get-NetTCPConnection', '27019', '127\\.0\\.0\\.1', '--auth',
    '--dbpath', 'v8\\.2\\.6', 'recuperarCuentaTemporal.mongo.js']) {
    assert.ok(script.includes(expected), `Falta el control: ${expected}`);
  }
  const runner = read('recuperarCuentaTemporal.mongo.js');
  const core = read('cuotasProvisioningCore.js');
  assert.match(runner, /mode: 'recovery'/);
  assert.match(core, /UNEXPECTED_USER_OR_ROLE/);
  assert.match(core, /UNEXPECTED_DATA/);
  assert.doesNotMatch(runner, /passwordPrompt\(|--password(?:\s|=)/i);
});

test('recuperación existente selecciona Gemini explícitamente y no reutiliza aprovisionamiento inicial', () => {
  const script = read('recuperarAlmacenCuotas.ps1');
  const runner = read('recuperarCuentaTemporal.mongo.js');
  assert.match(script, /param\(\[switch\]\$AlmacenGemini\)/);
  assert.match(script, /Get-PluriOnePath 'geminiRoot'/);
  assert.match(script, /if \(\$AlmacenGemini\) \{ 27020 \}/);
  assert.match(script, /runnerArguments \+= '--target=gemini'/);
  assert.match(runner, /mode: 'recovery', target/);
  assert.match(runner, /--target=gemini/);
  assert.doesNotMatch(script + runner, /prepararNuevoAlmacenCuotas\.ps1|mode: 'initial'/);
});

test('respaldo restaura solo fixture no vencido a namespace aleatorio previamente libre', () => {
  const script = read('probarRespaldoCuotas.ps1');
  assert.match(script, /restoreCollection = "usoias_restore_\$id"/);
  assert.match(script, /getCollectionInfos\(\{name:/);
  assert.match(script, /src\.countDocuments\(\{\}\)!==1/);
  assert.match(script, /64b000000000000000000002/);
  assert.match(script, /_pruebaInfraestructura:true/);
  assert.match(script, /--nsFrom=/);
  assert.match(script, /--nsTo=/);
  assert.match(script, /Test-Path -LiteralPath \$archive/);
  assert.match(read('cuotasProvisioningCore.js'), /2099/);
  assert.doesNotMatch(script, /--drop(?:\s|=)/i);
  assert.doesNotMatch(script, /--password(?:\s|=)/i);
  assert.match(script, /c\.drop\(\)/);
  assert.match(script, /src\.deleteOne\(/);
});

test('lanzador de Express rehúsa duplicar puerto 3000 y ofrece validación sin arrancar el servidor', () => {
  const script = read('iniciarExpressConCuotas.ps1');
  assert.match(script, /param\(\[switch\]\$ValidarAlmacen,\[switch\]\$AlmacenGemini\)/);
  assert.match(script, /if \(!\$ValidarAlmacen\)/);
  assert.match(script, /\.Port -eq 3000/);
  assert.match(script, /no se inicia una segunda instancia/);
  assert.match(script, /validarAlmacenCuotas\.js/);
  assert.match(script, /else \{ & node \(Join-Path \$projectRoot 'server\.js'\) \}/);
  assert.doesNotMatch(script, /AI_ENABLED\s*=/);
});

test('almacenamiento DPAPI no sobrescribe ni muestra el URI y usa entrada oculta', () => {
  const script = read('guardarUriCuotasDpapi.ps1');
  assert.match(script, /Read-Host .* -AsSecureString/);
  assert.match(script, /ConvertFrom-SecureString/);
  assert.match(script, /\[IO\.File\]::Move\(\$tmp, \$file\)/);
  assert.match(script, /Ya existe una URI DPAPI; no se sobrescribe/);
  assert.match(script, /URI_CIFRADA_CON_DPAPI; valor no mostrado/);
  assert.doesNotMatch(script, /Write-Output\s+\$(?:plain|uri|cipher|encoded)/i);
});

test('comprobación de Database Tools es solo lectura y no reinstala ni cambia ACL', () => {
  const script = read('instalarMongoDatabaseTools.ps1');
  assert.match(script, /--version/);
  assert.match(script, /Get-Acl/);
  assert.doesNotMatch(script, /Invoke-WebRequest|Start-Process|msiexec|icacls|Remove-Item/i);
});

test('apagado verifica listener, PID y argumentos autorizados sin poner contraseñas en argv', () => {
  const script = read('detenerAlmacenCuotas.ps1');
  assert.match(script, /Get-NetTCPConnection/);
  assert.match(script, /Get-CimInstance Win32_Process/);
  assert.match(script, /--auth/);
  assert.match(script, /--port \$port/);
  assert.match(script, /shutdownServer/);
  assert.doesNotMatch(script, /--password(?:\s|=)/i);
});

test('validación Node usa el almacén protegido sin invocar Gemini ni ejecutar escritura', () => {
  const script = fs.readFileSync(path.join(root, 'validarAlmacenCuotas.js'), 'utf8');
  assert.match(script, /almacen\.obtener\(/);
  assert.match(script, /listIndexes\(\)/);
  assert.match(script, /almacen\.cerrar\(\)/);
  assert.doesNotMatch(script, /generar|Gemini|\.save\(|insertOne|updateOne/i);
});

test('los scripts no pasan contraseñas como argumentos ni las imprimen', () => {
  const scripts = ['prepararAlmacenCuotas.ps1', 'probarRespaldoCuotas.ps1', 'detenerAlmacenCuotas.ps1',
    'guardarUriCuotasDpapi.ps1', 'iniciarExpressConCuotas.ps1', 'recuperarAlmacenCuotas.ps1',
    'aprovisionarCuotas.mongo.js', 'recuperarCuentaTemporal.mongo.js', 'cuotasProvisioningCore.js', 'entradaSecreta.js'];
  for (const name of scripts) {
    const source = read(name);
    assert.doesNotMatch(source, /--password(?:\s|=)/i, `${name}: opción de contraseña visible`);
    assert.doesNotMatch(source, /Write-Output\s+\$(?:password|secret|uri|plain)|print\([^\n]*(?:Password|secret|uri)/i,
      `${name}: posible salida de secreto`);
  }
  assert.match(read('aprovisionarCuotas.mongo.js'), /leerSecretoOculto/);
  assert.match(read('recuperarCuentaTemporal.mongo.js'), /leerSecretoOculto/);
});
