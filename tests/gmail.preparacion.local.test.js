const { test } = require('node:test');
const assert = require('node:assert/strict');
const manifiestos = require('../config/manifiestoPiloto');
const tls = require('../services/httpsPilotoLocalService');

test('preparación Gmail: perfil cerrado separa base nueva del piloto anterior', t => {
  const anterior = process.env.PILOT_PREPARATION_PROFILE;
  t.after(() => { if (anterior === undefined) delete process.env.PILOT_PREPARATION_PROFILE; else process.env.PILOT_PREPARATION_PROFILE = anterior; });
  delete process.env.PILOT_PREPARATION_PROFILE;
  assert.equal(manifiestos.cargarManifiesto().base, 'marketing_piloto_mvp');
  process.env.PILOT_PREPARATION_PROFILE = 'gmail';
  const manifiesto = manifiestos.cargarManifiesto();
  assert.equal(manifiesto.base, 'marketing_gmail_preparacion_local');
  const env = { PILOT_PREPARATION_PROFILE: 'gmail', PILOT_LOCAL_HTTPS: 'true', NODE_ENV: 'production' };
  assert.doesNotThrow(() => tls.validarDestino(env, manifiesto));
  assert.throws(() => tls.validarDestino(env, { ...manifiesto, base: 'marketing_piloto_mvp' }));
  assert.throws(() => tls.validarDestino(env, { ...manifiesto, miembros: ['127.0.0.1:27017'] }));
  process.env.PILOT_PREPARATION_PROFILE = '../../.env';
  assert.equal(manifiestos.cargarManifiesto().base, 'marketing_piloto_mvp');
});

test('preparación Gmail: importar herramientas no conecta, migra ni solicita Google', t => {
  const m = require('mongoose');
  t.mock.method(m, 'createConnection', () => { throw Error('SIN_MONGO'); });
  t.mock.method(global, 'fetch', () => { throw Error('SIN_RED'); });
  const script = require('../scripts/prepararEntornoGmailLocal');
  assert.equal(script.URI, 'mongodb://127.0.0.1:27019/marketing_gmail_preparacion_local?replicaSet=marketingPilotLocalRs');
  assert.equal(m.connection.readyState, 0);
});

test('preparación Gmail: envío habilitado impide diagnóstico antes de conectar', async t => {
  const anterior = process.env.GMAIL_CAMPAIGNS_ENABLED;
  t.after(() => { if (anterior === undefined) delete process.env.GMAIL_CAMPAIGNS_ENABLED; else process.env.GMAIL_CAMPAIGNS_ENABLED = anterior; });
  process.env.GMAIL_CAMPAIGNS_ENABLED = 'true';
  const conectar = t.mock.method(require('mongoose'), 'createConnection', () => { throw Error('SIN_MONGO'); });
  await assert.rejects(require('../scripts/prepararEntornoGmailLocal').principal('--diagnostico'), /PREPARACION_REQUIERE_ENVIO_APAGADO/);
  assert.equal(conectar.mock.callCount(), 0);
});

test('preparación Gmail: consulta de registro usa URI del perfil nuevo y nunca el piloto anterior', async t => {
  const valores = { PILOT_PREPARATION_PROFILE: 'gmail', MONGODB_URI: require('../scripts/prepararEntornoGmailLocal').URI,
    GMAIL_CAMPAIGNS_ENABLED: 'false', AI_ENABLED: 'false', TRANSACTIONAL_EMAIL_ENABLED: 'false' };
  const antes = Object.fromEntries(Object.keys(valores).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(valores)) process.env[k] = v;
  t.after(() => { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  t.mock.method(tls, 'configuracion', () => ({})); t.mock.method(tls, 'comprobarOrigen', async () => ({}));
  let consultada;
  t.mock.method(require('mongoose'), 'createConnection', uri => { consultada = uri; throw Error('DETENER_ANTES_DE_CONECTAR'); });
  await assert.rejects(require('../scripts/verificacionLocal').principal(['--cola']), /DETENER_ANTES_DE_CONECTAR/);
  assert.equal(consultada, valores.MONGODB_URI);
});
