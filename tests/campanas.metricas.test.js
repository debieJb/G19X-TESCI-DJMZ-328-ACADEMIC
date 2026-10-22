const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'secreto-sintetico-exclusivo-metricas-test';
for (const [obj, metodo] of [[require('dotenv'), 'config'], [mongoose, 'connect'],
  [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(obj, metodo, () => { throw Error('CONEXION_REAL_PROHIBIDA'); });
}
const { crearContexto } = require('./soporte/sesion');
const Campana = require('../models/Campana');
const Ejecucion = require('../models/EjecucionGmail');
const Envio = require('../models/EnvioGmail');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const empresa = id(1), campana = id(2), ejecucion = id(3);
let cliente, ejecuciones, filas, lecturas, escrituras, redes;

beforeEach(t => {
  ({ cliente } = crearContexto(t, { _id: id(4), nombre: 'Administrador', rol: 'admin_empresa',
    estadoAcceso: 'activo', empresa: { _id: empresa, nombre: 'Empresa' } }));
  ejecuciones = []; filas = []; lecturas = []; escrituras = 0; redes = 0;
  t.mock.method(Campana.collection, 'findOne', async filtro => {
    if (String(filtro.empresa) !== String(empresa) || String(filtro._id) !== String(campana)) return null;
    return { _id: campana, empresa, nombre: '<script>Campaña</script>', objetivo: 'Objetivo',
      canal: 'email', estado: 'borrador', asunto: 'Asunto', cuerpoTexto: 'Texto' };
  });
  t.mock.method(Ejecucion.collection, 'findOne', async (filtro, opciones) => {
    lecturas.push({ tipo: 'ejecucion', filtro, opciones });
    assert.equal(String(filtro.empresa), String(empresa));
    assert.equal(String(filtro.campana), String(campana));
    assert.deepEqual(opciones.sort, { createdAt: -1, _id: -1 });
    return [...ejecuciones].sort((a, b) => +b.createdAt - +a.createdAt || String(b._id).localeCompare(String(a._id)))[0] || null;
  });
  t.mock.method(Envio.collection, 'find', (filtro, opciones) => {
    lecturas.push({ tipo: 'envio', filtro, opciones });
    assert.equal(String(filtro.empresa), String(empresa));
    assert.equal(String(filtro.ejecucion), String(ejecucion));
    assert.deepEqual(opciones.projection, { emailHash: 1, estado: 1, intentos: 1 });
    assert.deepEqual(opciones.sort, { updatedAt: -1, _id: -1 });
    return { toArray: async () => [...filas].filter(f => String(f.empresa) === String(filtro.empresa)
      && String(f.ejecucion) === String(filtro.ejecucion)).sort((a, b) => +b.updatedAt - +a.updatedAt
        || String(b._id).localeCompare(String(a._id))) };
  });
  for (const modelo of [Campana, Ejecucion, Envio]) {
    for (const metodo of ['insertOne', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'bulkWrite', 'findOneAndUpdate']) {
      t.mock.method(modelo.collection, metodo, () => { escrituras++; throw Error('ESCRITURA_PROHIBIDA'); });
    }
  }
  t.mock.method(globalThis, 'fetch', () => { redes++; throw Error('RED_PROHIBIDA'); });
  t.mock.method(require('../services/motorEnviosGmailService'), 'crearMotor', () => {
    redes++; throw Error('MOTOR_PROHIBIDO');
  });
  t.after(() => { assert.equal(escrituras, 0); assert.equal(redes, 0); assert.equal(mongoose.connection.readyState, 0); });
});
const iniciar = () => { ejecuciones = [{ _id: ejecucion, createdAt: new Date('2026-10-19') }]; };
const fila = (n, estado, intentos, extra = {}) => ({ _id: id(100 + n), empresa, ejecucion,
  emailHash: n.toString(16).padStart(64, '0'), estado, intentos, updatedAt: new Date('2026-10-19'), ...extra });
const comprobar = (html, etiqueta, valor) => assert.ok(html.includes(`<dt>${etiqueta}</dt><dd>${valor}</dd>`), etiqueta);

test('métricas: sin ejecución conserva detalle, acciones y escape sin consultar envíos', async () => {
  const r = await cliente.get(`/campanas/${campana}`).expect(200);
  assert.match(r.text, /todavía no tiene ejecuciones/);
  assert.match(r.text, /&lt;script&gt;Campaña&lt;\/script&gt;/);
  assert.ok(r.text.includes(`href="/campanas/${campana}/enviar"`));
  assert.equal(lecturas.length, 1);
});

test('métricas: estados mixtos, reintentos, cancelados e inciertos separados', async () => {
  iniciar();
  filas = [fila(1, 'aceptado', 3), fila(2, 'rechazado', 2), fila(3, 'cancelado', 0),
    fila(4, 'incierto', 1), fila(5, 'pendiente', 0), fila(6, 'enviando', 1), fila(7, 'reservado', 0)];
  const r = await cliente.get(`/campanas/${campana}`).expect(200);
  for (const [etiqueta, valor] of [['Destinatarios con intento registrado', 4], ['Aceptados por Gmail', 1],
    ['Rechazados', 1], ['Cancelados', 1], ['Inciertos', 1]]) comprobar(r.text, etiqueta, valor);
  assert.match(r.text, /no acredita recepción/);
  assert.doesNotMatch(r.text, /emailHash|0000000000000000000000000000000000000000000000000000000000000001/);
});

test('métricas: última ejecución y deduplicación por dirección, con estado más reciente', async () => {
  iniciar();
  ejecuciones.push({ _id: id(8), createdAt: new Date('2026-10-18') });
  filas = [fila(1, 'rechazado', 2), fila(2, 'aceptado', 1, { emailHash: fila(1).emailHash,
    updatedAt: new Date('2026-10-20') }), fila(3, 'aceptado', 1, { ejecucion: id(8) })];
  const r = await cliente.get(`/campanas/${campana}`).expect(200);
  comprobar(r.text, 'Destinatarios con intento registrado', 1);
  comprobar(r.text, 'Aceptados por Gmail', 1);
  comprobar(r.text, 'Rechazados', 0);
  assert.match(r.text, /Última ejecución registrada/);
});

test('métricas: duplicados con empate conservan desempate estable y cualquier intento', async () => {
  iniciar();
  filas = [fila(1, 'rechazado', 2), fila(2, 'cancelado', 0, { emailHash: fila(1).emailHash })];
  const r = await cliente.get(`/campanas/${campana}`).expect(200);
  comprobar(r.text, 'Destinatarios con intento registrado', 1);
  comprobar(r.text, 'Cancelados', 1);
  comprobar(r.text, 'Rechazados', 0);
});

test('métricas: aislamiento de empresa y ejecución sin sumar resultados ajenos', async () => {
  iniciar();
  filas = [fila(1, 'aceptado', 1), fila(2, 'rechazado', 1, { empresa: id(9) }),
    fila(3, 'rechazado', 1, { ejecucion: id(9) })];
  const r = await cliente.get(`/campanas/${campana}`).expect(200);
  comprobar(r.text, 'Aceptados por Gmail', 1);
  comprobar(r.text, 'Rechazados', 0);
});

test('métricas: campaña inaccesible o ID inválido no consulta ejecuciones', async () => {
  await cliente.get(`/campanas/${id(9)}`).expect(404);
  await cliente.get('/campanas/invalido').expect(400);
  assert.equal(lecturas.length, 0);
});

test('métricas: permiso denegado no consulta resultados; operador autorizado sí', async t => {
  // Incluso si una lectura devolviera una relación ajena, el permiso se revalida.
  const bloqueo = t.mock.method(Campana.collection, 'findOne', async () => ({
    _id: campana, empresa: id(9), nombre: 'Ajena', objetivo: 'Objetivo', estado: 'borrador', canal: 'email'
  }));
  await cliente.get(`/campanas/${campana}`).expect(403);
  assert.equal(lecturas.length, 0);
  bloqueo.mock.restore();
  const contexto = crearContexto(t, { _id: id(5), nombre: 'Operador', rol: 'operador', empresa: { _id: empresa } });
  // crearContexto instala el doble por defecto; restituir la lectura de esta prueba.
  t.mock.method(Ejecucion.collection, 'findOne', async () => { lecturas.push({ tipo: 'operador' }); return null; });
  await contexto.cliente.get(`/campanas/${campana}`).expect(200);
  assert.equal(lecturas.length, 1);
});

test('métricas: error de lectura mantiene HTTP 200 y no inventa ceros', async t => {
  t.mock.method(Ejecucion.collection, 'findOne', async () => { throw Error('ERROR_PRIVADO'); });
  const r = await cliente.get(`/campanas/${campana}`).expect(200);
  assert.match(r.text, /Resultados no disponibles/);
  assert.doesNotMatch(r.text, /ERROR_PRIVADO|<dt>Aceptados por Gmail<\/dt>/);
});

test('métricas: ejecución sin trabajos muestra conteos cero sin crear documentos', async () => {
  iniciar();
  const r = await cliente.get(`/campanas/${campana}`).expect(200);
  comprobar(r.text, 'Destinatarios con intento registrado', 0);
  comprobar(r.text, 'Aceptados por Gmail', 0);
});
