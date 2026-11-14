'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const coord = require('../scripts/coordinarDevLocal');
const identidad = require('../services/estadoDevLocal');
const estadoGemini = require('../services/ia/estadoGemini');
const proveedor = require('../services/ia/geminiProveedor');
const ErrorIA = require('../services/ia/ErrorIA');

test('dev: supervisor conserva recargas y termina solo tras cierre explicito de su hijo', () => {
  const { EventEmitter } = require('node:events');
  const eventos = new EventEmitter(); const runtime = new EventEmitter(); const salidas = [];
  runtime.exit = code => salidas.push(code);
  const monitor = () => {}; monitor.on = eventos.on.bind(eventos); monitor.emit = eventos.emit.bind(eventos);
  require('../scripts/supervisarDevLocal').supervisar({ monitor, runtime });
  monitor.emit('restart'); monitor.emit('exit'); assert.deepEqual(salidas, []);
  monitor.on('quit', () => monitor.emit('exit'));
  monitor.emit('message', { tipo: 'PLURIONE_DEV_DETENIDO' }); assert.deepEqual(salidas, [0]);
});

test('dev: detecta listener real IPv4 y puerto libre sin depender de bind dual de Windows', async () => {
  const server = require('node:net').createServer(s => s.destroy());
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try { assert.equal(await coord.ocupado(port), true); }
  finally { await new Promise(r => server.close(r)); }
  assert.equal(await coord.ocupado(port), false);
});

const replica = (verificar = async () => {}) => {
  let cierres = 0;
  return { conectar: async () => ({ close: async () => { cierres++; } }), verificar, cierres: () => cierres };
};
test('dev: Mongo apagado arranca una vez y valida identidad; nunca inicializa la replica', async () => {
  let inicios = 0; const comun = replica();
  await coord.asegurarMongo({ comun, puerto: async () => false, arrancar: async () => { inicios++; } });
  assert.equal(inicios, 1); assert.equal(comun.cierres(), 1);
});
test('dev: Mongo activo se reutiliza en arranques repetidos sin escrituras ni otro proceso', async () => {
  const comun = replica();
  for (let i = 0; i < 2; i++) await coord.asegurarMongo({ comun, puerto: async () => true, arrancar: () => assert.fail('No arrancar') });
  assert.equal(comun.cierres(), 2);
});
test('dev: instancia incorrecta o puerto ajeno detienen arranque y cierran cliente', async () => {
  for (const fallo of ['IDENTIDAD_NODO_INCORRECTA', 'CONFIGURACION_RS_INCORRECTA']) {
    const comun = replica(async () => { throw Error(fallo); });
    await assert.rejects(coord.asegurarMongo({ comun, puerto: async () => true, arrancar: () => assert.fail() }), /IDENTIDAD/);
    assert.equal(comun.cierres(), 1);
  }
});
test('dev: espera PRIMARY con limite; no reconfigura ni reinicia por falta de PRIMARY', async () => {
  let n = 0; const comun = replica(async () => { if (++n < 3) throw Error('RS_NO_ES_PRIMARIO'); });
  await coord.asegurarMongo({ comun, puerto: async () => true, esperar: async () => {}, intentos: 3 });
  assert.equal(comun.cierres(), 3);
  await assert.rejects(coord.asegurarMongo({ comun: replica(async () => { throw Error('RS_NO_ES_PRIMARIO'); }),
    puerto: async () => true, esperar: async () => {}, intentos: 2 }), /PRIMARY_TIMEOUT/);
});
test('dev: fallo de permisos no se convierte en un arranque permitido', async () => {
  const error = Object.assign(Error('denegado'), { code: 'EACCES' });
  await assert.rejects(coord.asegurarMongo({ comun: replica(), puerto: async () => false, arrancar: async () => { throw error; } }), { code: 'EACCES' });
});
test('dev: 3000 libre permite iniciar; ocupado exige prueba de identidad y no mata procesos', async () => {
  assert.equal(await coord.estadoWeb({ puerto: async () => false, consultar: () => assert.fail() }), null);
  const actual = { pid: 123 };
  assert.equal(await coord.estadoWeb({ puerto: async () => true, consultar: async () => actual }), actual);
  await assert.rejects(coord.estadoWeb({ puerto: async () => true, consultar: async () => { throw Error('ajeno'); } }), /IDENTIDAD_NO_CONFIRMADA/);
});
test('dev: HTTP debe responder antes del exito; salida prematura y timeout fallan', async () => {
  let n = 0;
  assert.deepEqual(await coord.esperarWeb({ vivo: () => true, esperar: async () => {}, consultar: async () => { if (++n < 2) throw Error(); return { pid: 7 }; } }), { pid: 7 });
  await assert.rejects(coord.esperarWeb({ vivo: () => false }), /TERMINO/);
  await assert.rejects(coord.esperarWeb({ vivo: () => true, consultar: async () => { throw Error(); }, esperar: async () => {}, intentos: 2 }), /TIMEOUT/);
});
test('dev: bloqueo serializa dos arranques y libera despues del primero', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plurione-lock-test-'));
  try {
    const liberar = await coord.bloquear(root);
    await assert.rejects(coord.bloquear(root, { intentos: 1, esperar: async () => {} }), /OTRO_ARRANQUE/);
    await liberar();
    await (await coord.bloquear(root))();
  } finally { fs.rmdirSync(root); }
});
test('dev: firma autentica raiz, PID, nonce y entorno; rechaza replay, clave ajena y cuotas no verificadas', async () => {
  const env = { NODE_ENV: 'development', SESSION_SECRET: 'secreto-fixture', AI_ENABLED: 'true' };
  const fetcher = (cambiar = d => d, clave = env.SESSION_SECRET) => async url => {
    const datos = cambiar({ aplicacion: 'plurione-dev-v1', raiz: identidad.raiz(), pid: 123,
      reto: new URL(url).searchParams.get('reto'), entorno: identidad.huellaEntorno(env), cuotasVerificadas: true });
    return new Response(JSON.stringify({ datos, firma: identidad.firmar(datos, clave) }));
  };
  assert.equal((await identidad.consultar(env, fetcher())).pid, 123);
  for (const modificar of [d => ({ ...d, raiz: 'otro' }), d => ({ ...d, reto: 'a'.repeat(64) }),
    d => ({ ...d, cuotasVerificadas: false }), d => ({ ...d, entorno: 'otro' })]) {
    await assert.rejects(identidad.consultar(env, fetcher(modificar)), /IDENTIDAD/);
  }
  await assert.rejects(identidad.consultar(env, fetcher(d => d, 'ajena')), /IDENTIDAD/);
});
test('dev: endpoint real solo se publica en desarrollo y responde sin secretos', async t => {
  const env = { NODE_ENV: 'development', SESSION_SECRET: 'secreto-fixture' };
  const servidor = http.createServer(identidad.middleware({ locals: { iaArranque: { cuotasVerificadas: true } } }, (_req, res) => { res.writeHead(404); res.end(); }, env));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => servidor.close(r)));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const res = await fetch(base + identidad.ruta + '?reto=' + 'a'.repeat(64));
  const body = await res.text();
  assert.equal(res.status, 200); assert.ok(!body.includes(env.SESSION_SECRET));
  assert.equal((await fetch(base + identidad.ruta)).status, 404);
  env.NODE_ENV = 'production';
  assert.equal((await fetch(base + identidad.ruta + '?reto=' + 'a'.repeat(64))).status, 404);
});

test('Gemini arranque: ausencia/configuracion invalida sin red; metadatos no prueban generacion', async () => {
  const nunca = { configuracion: () => assert.fail(), verificarModelo: () => assert.fail() };
  assert.equal((await estadoGemini.comprobar({ env: {}, proveedor: nunca })).codigo, 'CLAVE_AUSENTE');
  assert.equal((await estadoGemini.comprobar({ env: { GEMINI_API_KEY: 'invalida' }, proveedor })).codigo, 'CONFIGURACION_INVALIDA');
  let n = 0;
  const p = { configuracion: () => ({}), verificarModelo: async () => { n++; } };
  const res = await estadoGemini.comprobar({ env: { GEMINI_API_KEY: 'fixture' }, proveedor: p });
  assert.equal(res.codigo, 'METADATOS_OK'); assert.match(res.mensaje, /NO comprobada/); assert.equal(n, 1);
});

test('dev: cierre por HTTP exige firma de accion, PID y tiempo; un POST ajeno no detiene nada', async t => {
  const env = { NODE_ENV: 'development', SESSION_SECRET: 'secreto-fixture' }; let paradas = 0;
  const servidor = http.createServer(identidad.middleware({ locals: { iaArranque: { cuotasVerificadas: true } } }, (_req, res) => res.end(), env,
    async () => { paradas++; }));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => servidor.close(r)));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const fetcher = (url, opciones) => { const u = new URL(url); return fetch(base + u.pathname + u.search, opciones); };
  const falso = await fetch(base + identidad.ruta + '?reto=' + 'a'.repeat(64), { method: 'POST' });
  assert.equal(falso.status, 403); assert.equal(paradas, 0);
  assert.equal(await identidad.solicitarParada(env, fetcher), process.pid); assert.equal(paradas, 1);
  const tiempo = Date.now() - 10000; const reto = 'a'.repeat(64);
  const r = await fetch(base + identidad.ruta + '?reto=' + reto, { method: 'POST', headers: {
    'x-plurione-dev-tiempo': String(tiempo), 'x-plurione-dev-firma': identidad.firmar({ accion: 'detener', pid: process.pid, reto, tiempo }, env.SESSION_SECRET)
  } });
  assert.equal(r.status, 403); assert.equal(paradas, 1);
});
test('Gemini: clasifica HTTP, clave invalida, cuota agotada y red sin divulgar el cuerpo', async () => {
  for (const [status, codigo] of [[401, 'CLAVE_INVALIDA'], [403, 'ACCESO_DENEGADO'], [404, 'MODELO_NO_DISPONIBLE'],
    [429, 'LIMITE_PROVEEDOR'], [503, 'PROVEEDOR'], [504, 'TIMEOUT']]) {
    assert.equal(await estadoGemini.falloHttp(new Response('secreto-remoto', { status })), codigo);
  }
  assert.equal(await estadoGemini.falloHttp(new Response(JSON.stringify({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 })), 'CLAVE_INVALIDA');
  assert.equal(await estadoGemini.falloHttp(new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{}] }] } }), { status: 429 })), 'CUOTA_AGOTADA');
  assert.equal(estadoGemini.detalleRed({ name: 'TimeoutError' }), 'TIMEOUT');
  assert.equal(estadoGemini.detalleRed(Error('privado')), 'CONEXION');
  const e = new ErrorIA('PROVEEDOR', 'CLAVE_INVALIDA'); assert.match(e.message, /datos del formulario se conservan/);
  assert.ok(!new ErrorIA('PROVEEDOR', 'secreto arbitrario').message.includes('arbitrario'));
});
test('dev: script existente conserva las guardias de datos, binario, original y procesos; sin reparacion ni DDL', () => {
  const ps = fs.readFileSync(path.join(__dirname, '../scripts/iniciarMongoDevRsExistente.ps1'), 'utf8');
  for (const guard of ['--comparar-original', 'WiredTiger', 'original-baseline.json', 'Get-FileHash', 'ReparsePoint', 'Get-CimInstance', 'Threading.Mutex']) assert.ok(ps.includes(guard));
  assert.doesNotMatch(ps, /--repair|--inicializar|replSetInitiate|rs\.initiate|rs\.reconfig|Stop-Process|Remove-Item|dropDatabase/);
});
