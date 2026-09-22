const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Instalar las protecciones antes de importar Express. No se lee .env.
const conexiones = [];
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  conexiones.push(mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido en pruebas'); }));
}
const app = require('../app');
const request = require('supertest');
const Campana = require('../models/Campana');
const id = '507f1f77bcf86cd799439011';
const ausente = '507f1f77bcf86cd799439012';
const base = { nombre: 'Conservar', objetivo: 'Objetivo', estado: 'pausada' };
let documento, crear, guardar, borrar, buscar, listar;

beforeEach(() => {
  documento = new Campana({
    _id: id, nombre: '<script>alert(1)</script>', objetivo: 'Objetivo', canal: 'email', estado: 'activa',
    fechaInicio: '2026-09-21', fechaFin: '2026-09-22', createdAt: '2026-09-20', updatedAt: '2026-09-20'
  });
  guardar = mock.method(documento, 'save', async () => documento);
  buscar = mock.method(Campana, 'findById', async valor => valor === ausente ? null : documento);
  listar = mock.method(Campana, 'find', () => ({ sort: orden => {
    assert.deepEqual(orden, { createdAt: -1, _id: -1 });
    return { lean: async () => [documento.toObject()] };
  } }));
  crear = mock.method(Campana, 'create', async valores => {
    const nuevo = new Campana(valores);
    await nuevo.validate();
    return nuevo;
  });
  borrar = mock.method(Campana, 'deleteOne', async () => ({ deletedCount: 1 }));
});

afterEach(() => {
  for (const metodo of [guardar, buscar, listar, crear, borrar]) metodo.mock.restore();
  for (const metodo of conexiones) assert.equal(metodo.mock.callCount(), 0, 'No debe cargar .env ni conectar MongoDB');
  assert.equal(mongoose.connection.readyState, 0);
});

const post = (ruta, datos) => request(app).post(ruta).type('form').send(datos);
const editar = datos => post(`/campanas/${id}/editar`, datos);

test('listado vacío/con datos y formulario nuevo; salida escapada', async () => {
  const respuesta = await request(app).get('/campanas').expect(200).expect('Content-Type', /html/);
  assert.match(respuesta.text, /&lt;script&gt;/);
  assert.ok(!respuesta.text.includes('<script>'));
  assert.ok(respuesta.text.includes(`/campanas/${id}/editar`));
  listar.mock.mockImplementation(() => ({ sort: () => ({ lean: async () => [] }) }));
  assert.match((await request(app).get('/campanas').expect(200)).text, /Aún no hay campañas/);
  assert.match((await request(app).get('/campanas/nueva').expect(200)).text, /value="borrador" selected/);
  assert.equal(buscar.mock.callCount(), 0);
});

test('crear: 303, campos permitidos, borrador y opcionales vacíos', async () => {
  await post('/campanas', { nombre: ' Nueva ', objetivo: ' Objetivo ', canal: '', fechaInicio: '', fechaFin: '', admin: 'true', _id: ausente })
    .expect(303).expect('Location', '/campanas');
  const valores = crear.mock.calls[0].arguments[0];
  assert.deepEqual(Object.keys(valores).sort(), ['nombre', 'objetivo', 'canal', 'estado', 'fechaInicio', 'fechaFin'].sort());
  assert.equal(valores.nombre, 'Nueva');
  assert.equal(valores.objetivo, 'Objetivo');
  assert.equal(valores.estado, 'borrador');
  for (const campo of ['canal', 'fechaInicio', 'fechaFin']) assert.equal(valores[campo], undefined);
});

test('crear/editar: 422, sin persistencia y datos conservados', async () => {
  for (const cambios of [{ objetivo: '' }, { canal: 'invalid' }, { estado: 'invalid' }, { fechaInicio: '2026-02-30' }, { fechaInicio: '2026-09-23', fechaFin: '2026-09-22' }, { 'canal[]': 'email' }]) {
    for (const ruta of ['/campanas', `/campanas/${id}/editar`]) {
      const respuesta = await post(ruta, { ...base, ...cambios }).expect(422);
      assert.match(respuesta.text, /value="Conservar"/);
      assert.match(respuesta.text, /Corrige los campos/);
    }
  }
  for (const estado of [undefined, '']) await editar({ ...base, estado }).expect(422);
  const respuesta = await post('/campanas', { nombre: '<script>"</script>', objetivo: '', fechaInicio: 'no-fecha' }).expect(422);
  assert.ok(!respuesta.text.includes('<script>'));
  assert.match(respuesta.text, /value="no-fecha"/);
  assert.equal(crear.mock.callCount(), 0);
  assert.equal(guardar.mock.callCount(), 0);
});

test('detalle y edición: precarga, escape y fechas UTC', async () => {
  const anterior = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const detalle = await request(app).get(`/campanas/${id}`).expect(200);
    assert.match(detalle.text, /21\/9\/2026/);
    assert.match(detalle.text, /&lt;script&gt;/);
    const formulario = await request(app).get(`/campanas/${id}/editar`).expect(200);
    assert.match(formulario.text, /value="2026-09-21"/);
    assert.match(formulario.text, /value="activa" selected/);
    await editar({ ...base, fechaInicio: '2026-09-21', fechaFin: '2026-09-21' }).expect(303).expect('Location', `/campanas/${id}`);
    assert.equal(documento.fechaInicio.toISOString(), '2026-09-21T00:00:00.000Z');
    assert.equal(documento.fechaFin.toISOString(), '2026-09-21T00:00:00.000Z');
  } finally {
    if (anterior === undefined) delete process.env.TZ; else process.env.TZ = anterior;
  }
});

test('editar: borrar opcionales y proteger campos ajenos al formulario', async () => {
  await editar({ ...base, canal: '', fechaInicio: '', fechaFin: '', _id: ausente, createdAt: '2000-01-01', admin: 'true' }).expect(303);
  for (const campo of ['canal', 'fechaInicio', 'fechaFin']) assert.equal(documento[campo], undefined);
  assert.equal(String(documento._id), id);
  assert.equal(documento.createdAt.toISOString(), '2026-09-20T00:00:00.000Z');
  assert.equal(documento.admin, undefined);
  assert.equal(guardar.mock.callCount(), 1);
});

test('eliminar: GET nunca borra; POST exige confirmación explícita', async () => {
  const pagina = await request(app).get(`/campanas/${id}/eliminar`).expect(200);
  assert.match(pagina.text, /name="confirmacion"/);
  assert.match(pagina.text, /method="post"/);
  assert.equal(borrar.mock.callCount(), 0);
  for (const datos of [{}, { confirmacion: 'no' }, { 'confirmacion[]': 'eliminar' }]) {
    await post(`/campanas/${id}/eliminar`, datos).expect(422);
  }
  assert.equal(borrar.mock.callCount(), 0);
  await post(`/campanas/${id}/eliminar`, { confirmacion: 'eliminar' }).expect(303).expect('Location', '/campanas');
  assert.equal(borrar.mock.callCount(), 1);
  assert.equal(String(borrar.mock.calls[0].arguments[0]._id), id);
});

test('identificadores: 400 antes de consultar y 404 para inexistentes', async () => {
  for (const sufijo of ['', '/editar', '/eliminar']) {
    for (const valor of ['bad', 'z'.repeat(24), id + '%0A']) await request(app).get(`/campanas/${valor}${sufijo}`).expect(400);
  }
  for (const sufijo of ['/editar', '/eliminar']) await post(`/campanas/bad${sufijo}`, base).expect(400);
  assert.equal(buscar.mock.callCount(), 0);
  for (const sufijo of ['', '/editar', '/eliminar']) await request(app).get(`/campanas/${ausente}${sufijo}`).expect(404);
  for (const sufijo of ['/editar', '/eliminar']) await post(`/campanas/${ausente}${sufijo}`, base).expect(404);
  await request(app).get('/no-existe').expect(404);
});

test('campaña eliminada entre lectura y escritura: 404', async () => {
  guardar.mock.mockImplementation(async () => { throw Object.assign(new Error(), { name: 'DocumentNotFoundError' }); });
  await editar(base).expect(404);
  borrar.mock.mockImplementation(async () => ({ deletedCount: 0 }));
  await post(`/campanas/${id}/eliminar`, { confirmacion: 'eliminar' }).expect(404);
});

test('fallos de persistencia: 500/503, sin detalles internos y conservando formulario', async t => {
  t.mock.method(console, 'error', () => {});
  for (const [nombre, status] of [['Error', 500], ['MongoNetworkError', 503]]) {
    const fallar = () => { throw Object.assign(new Error('SECRETO INTERNO'), { name: nombre }); };
    crear.mock.mockImplementation(fallar);
    guardar.mock.mockImplementation(fallar);
    borrar.mock.mockImplementation(fallar);
    listar.mock.mockImplementation(fallar);
    for (const ruta of ['/campanas', `/campanas/${id}/editar`]) {
      const respuesta = await post(ruta, base).expect(status);
      assert.match(respuesta.text, /value="Conservar"/);
      assert.ok(!respuesta.text.includes('SECRETO INTERNO'));
    }
    await post(`/campanas/${id}/eliminar`, { confirmacion: 'eliminar' }).expect(status);
    buscar.mock.mockImplementation(fallar);
    for (const ruta of ['/campanas', `/campanas/${id}`, `/campanas/${id}/editar`, `/campanas/${id}/eliminar`]) {
      const respuesta = await request(app).get(ruta).expect(status);
      assert.ok(!respuesta.text.includes('SECRETO INTERNO'));
    }
    buscar.mock.mockImplementation(async () => documento);
  }
});
