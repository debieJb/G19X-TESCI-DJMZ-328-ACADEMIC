const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const worker = require('../services/trabajadorVerificacionService');
const supervisor = require('../services/supervisorVerificacionResidenteService');
test('residente: exige autorizacion explicita, flags y produccion; limites acotados', () => {
  const env = { NODE_ENV: 'production', TRANSACTIONAL_EMAIL_ENABLED: 'true', TRANSACTIONAL_WORKER_ENABLED: 'true' };
  assert.doesNotThrow(() => worker.validarActivacion(env, ['--autorizar-trabajador']));
  for (const cambio of [{ NODE_ENV: 'development' }, { TRANSACTIONAL_EMAIL_ENABLED: 'false' }, { TRANSACTIONAL_WORKER_ENABLED: undefined }])
    assert.throws(() => worker.validarActivacion({ ...env, ...cambio }, ['--autorizar-trabajador']));
  assert.throws(() => worker.validarActivacion(env, []));
  for (const v of ['0', '101', 'NaN']) assert.throws(() => worker.configuracion({ TRANSACTIONAL_SENDS_PER_MINUTE: v }));
});
test('residente: importacion/comprobacion no conecta Mongo ni utiliza Google', async t => {
  t.mock.method(require('mongoose'), 'createConnection', () => { throw Error('MONGO_PROHIBIDO'); });
  t.mock.method(global, 'fetch', () => { throw Error('GOOGLE_PROHIBIDO'); });
  assert.deepEqual(await require('../scripts/trabajadorVerificacionResidente').principal(['--comprobar']), { estado: 'sin_envios' });
  await assert.rejects(require('../scripts/trabajadorVerificacionResidente').principal([]));
});
test('residente: parada durante entrega espera su finalizacion y no reclama otra', async t => {
  const cancelar = new AbortController(); let ciclos = 0, terminado = false;
  t.mock.method(require('../services/autoservicioEmpresarialService'), 'crearServicio', () => ({
    recuperarIncierta: async () => ({ estado: 'sin_trabajo' }), despachar: async () => {
      ciclos++; cancelar.abort(); await Promise.resolve(); terminado = true; return { estado: 'enviada' };
    }
  }));
  assert.deepEqual(await worker.ejecutar({ conexion: {}, correo: { disponible: true }, signal: cancelar.signal }), { estado: 'detenido' });
  assert.equal(ciclos, 1); assert.equal(terminado, true);
});
test('residente: autorizacion rechazada pausa cola sin vaciarla ni reintentar', async t => {
  t.mock.method(require('../services/autoservicioEmpresarialService'), 'crearServicio', opciones => ({
    recuperarIncierta: async () => ({ estado: 'sin_trabajo' }), despachar: async () => {
      opciones.diagnostico('REAUTORIZAR_TRANSACCIONAL'); return { estado: 'fallida' };
    }
  }));
  await assert.rejects(worker.ejecutar({ conexion: {}, correo: { disponible: true } }), /REAUTORIZAR_TRANSACCIONAL/);
  await assert.rejects(worker.ejecutar({ correo: { disponible: false } }), /TRANSPORTE_NO_CONFIGURADO/);
});
test('supervisor residente: recupera fallo con backoff y detiene configuracion invalida', async () => {
  const codigos = [1, 1, 78], pausas = [];
  const resultado = await supervisor.ejecutar({ crearHijo: () => {
    const hijo = new EventEmitter(); queueMicrotask(() => hijo.emit('exit', codigos.shift())); return hijo;
  }, esperar: async ms => { pausas.push(ms); } });
  assert.deepEqual(pausas, [1000, 2000]);
  assert.deepEqual(resultado, { estado: 'bloqueado_configuracion_o_autorizacion', reinicios: 2, codigo: 78 });
});
test('supervisor residente: maximo cinco reinicios; nunca bucle infinito', async () => {
  let hijos = 0;
  const r = await supervisor.ejecutar({ crearHijo: () => {
    hijos++;const h = new EventEmitter();queueMicrotask(() => h.emit('exit', 1));return h;
  }, esperar: async () => {} });
  assert.equal(hijos, 6); assert.equal(r.estado, 'reinicios_agotados');
});
test('supervisor residente: parada IPC ordenada espera salida del hijo', async () => {
  const cancelar = new AbortController();let orden;
  const r = await supervisor.ejecutar({ signal: cancelar.signal, crearHijo: () => {
    const h = new EventEmitter();h.connected = true;h.send = mensaje => { orden = mensaje;queueMicrotask(() => h.emit('exit', 0)); };
    queueMicrotask(() => cancelar.abort());return h;
  } });
  assert.equal(orden, 'detener');assert.equal(r.estado, 'detenido');
});

test('residente: procesa recuperación con el mismo transporte y límites de verificación', async t => {
  const cancelar = new AbortController(), llamadas = [];
  const correo = { disponible: true, enviarRecuperacion() {} }, limitesEnvio = { minuto: 8, dia: 80 };
  t.mock.method(require('../services/autoservicioEmpresarialService'), 'crearServicio', () => ({
    recuperarIncierta: async () => ({ estado: 'sin_trabajo' }), despachar: async () => ({ estado: 'sin_trabajo' })
  }));
  t.mock.method(require('../services/recuperacionPasswordService'), 'crearServicio', opciones => {
    assert.equal(opciones.correo, correo); assert.equal(opciones.limitesEnvio, limitesEnvio);
    return { recuperarInciertas: async () => llamadas.push('recuperar'), despachar: async () => { llamadas.push('despachar'); cancelar.abort(); return { estado: 'enviada' }; } };
  });
  const mensajes = [];
  await worker.ejecutar({ conexion: {}, correo, limitesEnvio, signal: cancelar.signal, informar: m => mensajes.push(m) });
  assert.deepEqual(llamadas, ['recuperar', 'despachar']);
  assert.ok(mensajes.includes('RECUPERACION_ACEPTADA_PROVEEDOR'));
});
