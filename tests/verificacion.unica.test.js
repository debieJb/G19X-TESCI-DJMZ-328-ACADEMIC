const { test } = require('node:test');
const assert = require('node:assert/strict');
const local = require('../services/httpsPilotoLocalService');
const cli = require('../scripts/verificacionLocal');
test('correo unico: preparacion privada exige destinatario e intento cero sin enviar ni escribir', async t => {
  const previos = Object.fromEntries(['MONGODB_URI', 'TRANSACTIONAL_EMAIL_ENABLED', 'GMAIL_CAMPAIGNS_ENABLED', 'AI_ENABLED', 'PILOT_TEST_RECIPIENT'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { MONGODB_URI: cli.URI, TRANSACTIONAL_EMAIL_ENABLED: 'false', GMAIL_CAMPAIGNS_ENABLED: 'false',
    AI_ENABLED: 'false', PILOT_TEST_RECIPIENT: 'controlado@example.test' });
  t.after(() => { for (const [k,v] of Object.entries(previos)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const id = 'a'.repeat(24);let doc = { _id: id, estado: 'pendiente_correo', correoEstado: 'pendiente_configuracion', correo: 'controlado@example.test', versionEnvio: 0 };
  t.mock.method(local, 'configuracion', () => ({}));t.mock.method(local, 'comprobarOrigen', async () => ({}));
  t.mock.method(require('../config/manifiestoPiloto'), 'cargarManifiesto', () => ({}));
  const infra = require('../services/infraestructuraPilotoService');
  t.mock.method(infra, 'validarDestinoPiloto', async () => {});t.mock.method(infra, 'revisarIndices', async () => ({ completos: true }));
  const conexion = { db: { collection: () => ({ findOne: async filtro => { assert.equal(String(filtro._id), id);return doc; } }) }, close: async () => {} };
  t.mock.method(require('mongoose'), 'createConnection', () => ({ asPromise: async () => conexion }));
  const supervisor = t.mock.method(require('../services/supervisorTrabajadorGmailService'), 'crearSupervisor', () => { throw Error('ENVIO_PROHIBIDO'); });
  const r = await cli.principal(['--preparar', id]);
  assert.deepEqual(r, { solicitud: id, buzonCoincide: true, intentos: 0, elegible: true, envioHabilitado: false });
  assert.ok(!JSON.stringify(r).includes(doc.correo));
  doc = { ...doc, versionEnvio: 1 };await assert.rejects(cli.principal(['--preparar', id]), /SOLICITUD_NO_ES_UN_ENVIO_NUEVO/);
  doc = { ...doc, versionEnvio: 0, correo: 'otro@example.test' };await assert.rejects(cli.principal(['--preparar', id]), /BUZON_NO_COINCIDE/);
  assert.equal(supervisor.mock.callCount(), 0);
});
