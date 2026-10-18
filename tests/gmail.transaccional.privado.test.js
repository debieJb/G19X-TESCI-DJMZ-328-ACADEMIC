const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomBytes } = require('node:crypto');
const { comprobar, codigoSeguro, codigosSeguros } = require('../scripts/comprobarGmailTransaccional');
const gmail = require('../services/gmailTransaccionalService');
const fixture = t => {
  t.mock.method(global, 'fetch', () => { throw Error('GOOGLE_PROHIBIDO'); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-transaccional-privado-test-'));
  const file = path.join(dir, 'credencial.cipher');
  t.after(() => { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); });
  const env = { TRANSACTIONAL_EMAIL_ENABLED: 'false', GMAIL_CAMPAIGNS_ENABLED: 'false', AI_ENABLED: 'false',
    TRANSACTIONAL_GOOGLE_CLIENT_ID: 'cliente-sintetico.apps.googleusercontent.com',
    TRANSACTIONAL_GOOGLE_CLIENT_SECRET: randomBytes(24).toString('base64url'),
    TRANSACTIONAL_GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3001/oauth/callback',
    TRANSACTIONAL_GMAIL_SENDER: 'fixture@example.test',
    TRANSACTIONAL_GMAIL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    TRANSACTIONAL_GMAIL_CREDENTIALS_FILE: file, TRANSACTIONAL_PUBLIC_ORIGIN: 'https://registro.example.test' };
  const guardar = () => {
    const config = gmail.configuracion(env);
    fs.writeFileSync(file, config.cifrado.cifrar(JSON.stringify({ version: 1, clienteHash: config.hash,
      email: config.remitente, sub: 'fixture', refreshToken: 'refresh-sintetico-no-valido' })), { flag: 'wx' });
  };
  return { env, file, guardar };
};
test('verificador privado: configuración real sin llamadas externas ni salida de secretos', t => {
  const { env } = fixture(t), result = comprobar({ env });
  assert.deepEqual(result, { configuracionValida: true, fueraDeGit: true, transporteDeshabilitado: true, credencialCifradaValidada: false, origenEnviosConfigurado: true });
  const output = JSON.stringify(result);
  assert.ok(!output.includes(env.TRANSACTIONAL_GOOGLE_CLIENT_SECRET));
  assert.ok(!output.includes(env.TRANSACTIONAL_GMAIL_ENCRYPTION_KEY));
  assert.equal(global.fetch.mock.callCount(), 0);
});
test('OAuth puede configurarse sin dominio ficticio; el transporte sigue exigiendo HTTPS', t => {
  const { env } = fixture(t); delete env.TRANSACTIONAL_PUBLIC_ORIGIN;
  assert.equal(comprobar({ env }).origenEnviosConfigurado, false);
  assert.doesNotThrow(() => gmail.configuracionOAuth(env));
  assert.throws(() => gmail.configuracion({ ...env, TRANSACTIONAL_EMAIL_ENABLED: 'true' }), /CONFIGURACION/);
  assert.throws(() => gmail.crearCorreo({ ...env, TRANSACTIONAL_EMAIL_ENABLED: 'true' }), /CONFIGURACION/);
  assert.equal(global.fetch.mock.callCount(), 0);
});
test('verificador privado: valida sobre e identidad solo en memoria y rechaza sobrescritura', t => {
  const { env, guardar } = fixture(t); guardar();
  assert.throws(() => comprobar({ env }), /NO_SE_SOBRESCRIBE/);
  assert.equal(comprobar({ env, credencial: true }).credencialCifradaValidada, true);
  assert.equal(global.fetch.mock.callCount(), 0);
});
test('verificador privado: cifrado alterado, clave o identidad incorrectos son rechazados', t => {
  const { env, file, guardar } = fixture(t); guardar();
  assert.throws(() => comprobar({ env: { ...env, TRANSACTIONAL_GMAIL_ENCRYPTION_KEY: randomBytes(32).toString('base64') }, credencial: true }), /CREDENCIAL/);
  assert.throws(() => comprobar({ env: { ...env, TRANSACTIONAL_GMAIL_SENDER: 'otra@example.test' }, credencial: true }), /CREDENCIAL/);
  const parts = fs.readFileSync(file, 'utf8').split('.'); parts[2] = randomBytes(16).toString('base64url');
  fs.writeFileSync(file, parts.join('.'));
  assert.throws(() => comprobar({ env, credencial: true }), /CREDENCIAL/);
});
test('verificador privado: banderas activas, callback alterado y secretos empresariales compartidos bloquean', t => {
  const { env } = fixture(t);
  for (const name of ['TRANSACTIONAL_EMAIL_ENABLED', 'GMAIL_CAMPAIGNS_ENABLED', 'AI_ENABLED']) {
    assert.throws(() => comprobar({ env: { ...env, [name]: 'true' } }), /APAGADOS/);
  }
  for (const changes of [{ TRANSACTIONAL_GOOGLE_REDIRECT_URI: 'http://localhost:3001/oauth/callback' },
    { GOOGLE_OAUTH_CLIENT_ID: env.TRANSACTIONAL_GOOGLE_CLIENT_ID },
    { GOOGLE_OAUTH_CLIENT_SECRET: env.TRANSACTIONAL_GOOGLE_CLIENT_SECRET },
    { GMAIL_TOKEN_ENCRYPTION_KEY: env.TRANSACTIONAL_GMAIL_ENCRYPTION_KEY }]) {
    assert.throws(() => comprobar({ env: { ...env, ...changes } }), /CONFIGURACION/);
  }
});
test('verificador privado: archivo dentro del repositorio y texto sin cifrar son rechazados', t => {
  const { env, file } = fixture(t);
  assert.throws(() => comprobar({ env: { ...env, TRANSACTIONAL_GMAIL_CREDENTIALS_FILE: path.join(__dirname, 'credencial.cipher') } }), /CONFIGURACION/);
  fs.writeFileSync(file, 'refresh-sintetico-no-valido');
  assert.throws(() => comprobar({ env, credencial: true }), /SOBRE_INVALIDO/);
});

test('diagnósticos: identifica credencial ya existente sin exponer valores privados', t => {
  const { env, guardar } = fixture(t); guardar();
  assert.throws(() => comprobar({ env }), e => codigoSeguro(e) === 'TX_CREDENCIAL_YA_EXISTE');
  assert.equal(comprobar({ env, credencial: true }).credencialCifradaValidada, true);
  assert.equal(global.fetch.mock.callCount(), 0);
});
test('diagnósticos: cada dato OAuth inválido tiene código fijo conservando el contrato anterior', t => {
  const { env } = fixture(t);
  const cases = [
    [{ TRANSACTIONAL_GOOGLE_CLIENT_ID: [] }, 'TX_CLIENT_ID_INVALIDO'],
    [{ TRANSACTIONAL_GOOGLE_CLIENT_SECRET: 'contiene espacios' }, 'TX_CLIENT_SECRET_INVALIDO'],
    [{ TRANSACTIONAL_GMAIL_SENDER: {} }, 'TX_REMITENTE_INVALIDO'],
    [{ TRANSACTIONAL_GOOGLE_REDIRECT_URI: 'http://localhost:3001/oauth/callback' }, 'TX_CALLBACK_INVALIDO'],
    [{ TRANSACTIONAL_GMAIL_CREDENTIALS_FILE: [] }, 'TX_RUTA_CREDENCIAL_INVALIDA'],
    [{ TRANSACTIONAL_GMAIL_ENCRYPTION_KEY: 'clave-no-valida' }, 'TX_CLAVE_CIFRADO_INVALIDA'],
    [{ GOOGLE_OAUTH_CLIENT_ID: env.TRANSACTIONAL_GOOGLE_CLIENT_ID }, 'TX_CLIENTE_EMPRESARIAL_COMPARTIDO'],
    [{ GMAIL_TOKEN_ENCRYPTION_KEY: env.TRANSACTIONAL_GMAIL_ENCRYPTION_KEY }, 'TX_CLAVE_EMPRESARIAL_COMPARTIDA'],
    [{ TRANSACTIONAL_PUBLIC_ORIGIN: 'http://sin-https.example.test' }, 'TX_ORIGEN_HTTPS_INVALIDO']
  ];
  for (const [changes, code] of cases) assert.throws(() => comprobar({ env: { ...env, ...changes } }), e =>
    e.codigo === 'CONFIGURACION_TRANSACCIONAL' && codigoSeguro(e) === code);
});
test('diagnósticos: excepciones desconocidas, mensajes privados y prototipos nunca pasan a la salida', () => {
  const privateValue = randomBytes(32).toString('base64url');
  for (const e of [Error(privateValue), { diagnostico: privateValue }, { code: 'constructor' }, { message: '__proto__' }]) {
    assert.equal(codigoSeguro(e), 'TX_ERROR_LOCAL_NO_CLASIFICADO');
    assert.ok(!codigoSeguro(e).includes(privateValue));
  }
  assert.ok(codigosSeguros.every(code => /^TX_[A-Z_]+$/.test(code)));
});
test('diagnósticos CLI: stderr expone solo código y nunca la configuración recibida', t => {
  const { env } = fixture(t);
  const result = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '../scripts/comprobarGmailTransaccional.js'), '--configuracion'], {
    env: { ...process.env, ...env, TRANSACTIONAL_GOOGLE_CLIENT_ID: 'invalido' }, encoding: 'utf8'
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), 'COMPROBACION_TRANSACCIONAL_RECHAZADA codigo=TX_CLIENT_ID_INVALIDO');
  assert.ok(!result.stderr.includes(env.TRANSACTIONAL_GOOGLE_CLIENT_SECRET));
  assert.ok(!result.stderr.includes(env.TRANSACTIONAL_GMAIL_ENCRYPTION_KEY));
});
