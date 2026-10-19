const { test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar } = require('../services/trabajadorCampanasService');

test('arranque automático: apagado o piloto no inicia trabajador ni consulta Mongo/Google', async t => {
  const politica = require('../config/enviosGmail');
  const servicio = require('../services/motorEnviosGmailService');
  const preparar = t.mock.method(servicio, 'preparar', () => { throw Error('NO_CONSULTAR'); });
  for (const p of [{ habilitado: false, automatico: true }, { habilitado: true, automatico: false }]) {
    t.mock.method(politica, 'obtenerPolitica', () => p);
    const app = { locals: {} };
    assert.equal(await require('../services/trabajadorCampanasService').prepararArranque({ app }), null);
    assert.equal(app.locals.gmailAutomaticoValidado, undefined);
  }
  assert.equal(preparar.mock.callCount(), 0);
});

test('arranque automático: transacciones/índices ausentes impiden habilitar confirmación', async t => {
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => ({ habilitado: true, automatico: true }));
  t.mock.method(require('../services/googleOAuthClienteService'), 'configuracion', () => ({}));
  t.mock.method(require('../services/motorEnviosGmailService'), 'preparar', async () => { throw { codigo: 'INDICES_REQUERIDOS' }; });
  const app = { locals: {} };
  await assert.rejects(require('../services/trabajadorCampanasService').prepararArranque({ app }), { codigo: 'INDICES_REQUERIDOS' });
  assert.equal(app.locals.gmailAutomaticoValidado, undefined);
});

test('arranque automático: configuración validada habilita interfaz y arranca consumo', async t => {
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => ({ habilitado: true, automatico: true }));
  t.mock.method(require('../services/googleOAuthClienteService'), 'configuracion', () => ({}));
  t.mock.method(require('../services/motorEnviosGmailService'), 'preparar', async (conexion, opciones) => {
    assert.deepEqual(opciones, { inicializar: true }); return {};
  });
  let consumido; const listo = new Promise(r => { consumido = r; });
  t.mock.method(require('../services/motorEnviosGmailService'), 'crearMotor', () => ({ procesarPendientes: async () => consumido() }));
  const app = { locals: {} };
  const worker = await require('../services/trabajadorCampanasService').prepararArranque({ app });
  await listo; await worker.detener(); assert.equal(app.locals.gmailAutomaticoValidado, true);
});

test('worker automático: no solapa ciclos y espera un envío en curso durante parada', async () => {
  let liberar, arrancado, llamadas = 0;
  const inicio = new Promise(r => { arrancado = r; });
  const espera = new Promise(r => { liberar = r; });
  const worker = iniciar({ intervaloMs: 1, motor: { procesarPendientes: async () => { llamadas++; arrancado(); await espera; } } });
  await inicio;
  let termino = false; const parada = worker.detener().then(() => { termino = true; });
  await new Promise(r => setTimeout(r, 10)); assert.equal(termino, false); assert.equal(llamadas, 1);
  liberar(); await parada; assert.equal(termino, true);
});

test('worker automático: informa códigos seguros y recupera siguiente ciclo tras error', async () => {
  let resolver, llamadas = 0; const listo = new Promise(r => { resolver = r; }); const avisos = [];
  const worker = iniciar({ intervaloMs: 1, informar: c => avisos.push(c), motor: { procesarPendientes: async () => {
    if (++llamadas === 1) throw { codigo: 'REAUTORIZAR' }; resolver();
  } } });
  // Mantener vivo el runner mientras el temporizador de producción usa unref.
  const mantener = setTimeout(() => resolver(), 2000);
  await listo; clearTimeout(mantener); await worker.detener();
  assert.ok(llamadas >= 2); assert.deepEqual(avisos, ['REAUTORIZAR']);
});
