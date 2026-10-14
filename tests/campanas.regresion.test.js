const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
process.env.SESSION_SECRET = 'regresion-solo-pruebas';
const { crearContexto } = require('./soporte/sesion');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');
const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const empresa = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
const sesiones = store => new Promise((resolve, reject) => store.all((error, datos) => error ? reject(error) : resolve(datos)));

for (const rol of ['operador', 'admin_empresa', 'superadmin']) {
  test(`regresión: ${rol} activa, persiste y navega con la misma sesión y filtro BSON`, async t => {
    const { cliente, store } = crearContexto(t, { _id: id, nombre: 'Persona', rol, empresa: { _id: empresa } });
    let persistido = { _id: id, empresa, nombre: 'Campaña', objetivo: 'Objetivo', estado: 'borrador', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Texto' };
    t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [] }));
    t.mock.method(Campana.collection, 'findOne', async filtro => {
      assert.ok(filtro._id instanceof mongoose.Types.ObjectId);
      return persistido && String(filtro._id) === String(id) ? { ...persistido } : null;
    });
    t.mock.method(Campana.collection, 'updateOne', async (filtro, cambios) => {
      // MongoDB distingue string y ObjectId; no convertirlos a texto para comparar.
      const coincide = persistido && (!filtro.empresa || (filtro.empresa instanceof mongoose.Types.ObjectId && filtro.empresa.equals(persistido.empresa)));
      if (!coincide) return { matchedCount: 0, modifiedCount: 0 };
      if (rol !== 'superadmin') assert.ok(filtro.empresa.equals(empresa));
      Object.assign(persistido, cambios.$set);
      for (const campo of Object.keys(cambios.$unset || {})) delete persistido[campo];
      return { matchedCount: 1, modifiedCount: 1 };
    });
    const antes = await sesiones(store);
    const formulario = await cliente.get(`/campanas/${id}/editar`).expect(200);
    assert.ok(formulario.text.includes(`href="/campanas/${id}"`));
    const resultado = await cliente.post(`/campanas/${id}/editar`).type('form').send({ nombre: 'Editada', objetivo: 'Objetivo', estado: 'activa', canal: 'email' }).expect(303);
    assert.equal(resultado.headers.location, `/campanas/${id}`);
    assert.equal(persistido.estado, 'activa');
    assert.equal(persistido.asunto, 'Asunto');
    assert.equal(resultado.headers['set-cookie'], undefined);
    const detalle = await cliente.get(resultado.headers.location).expect(200);
    assert.match(detalle.text, /Editada/);
    assert.ok(detalle.text.includes('href="/campanas"'));
    if (rol !== 'superadmin') {
      // Un cambio de empresa entre lectura y escritura no permite guardar.
      t.mock.method(Campana.collection, 'updateOne', async filtro => {
        assert.ok(filtro.empresa instanceof mongoose.Types.ObjectId);
        return { matchedCount: 0, modifiedCount: 0 };
      });
      await cliente.post(`/campanas/${id}/editar`).send({ nombre: 'Bloqueada', objetivo: 'Objetivo', estado: 'pausada' }).expect(404);
      assert.equal(persistido.estado, 'activa');
      assert.equal(persistido.nombre, 'Editada');
    }
    persistido = null;
    const error = await cliente.get(`/campanas/${id}`).expect(404);
    assert.match(error.text, /href="\/campanas">Volver al listado/);
    assert.deepEqual(Object.keys(await sesiones(store)), Object.keys(antes));
    assert.equal(Object.values(await sesiones(store))[0].usuarioId, String(id));
    await cliente.get('/login').expect(302).expect('Location', '/panel');
  });
}

test('regresión: cookie expirada y almacén perdido requieren login, sin consultar campañas', async t => {
  const { app, cliente, store } = crearContexto(t, { _id: id, rol: 'operador', empresa: { _id: empresa } });
  const consulta = t.mock.method(Campana, 'findOne', () => { throw new Error('No debe consultar'); });
  const [sid, sesion] = Object.entries(await sesiones(store))[0];
  sesion.cookie.expires = new Date(Date.now() - 1000);
  await new Promise(resolve => store.set(sid, sesion, resolve));
  await cliente.get(`/campanas/${id}/editar`).expect(302).expect('Location', '/login');
  await new Promise(resolve => store.clear(resolve));
  await cliente.post(`/campanas/${id}/editar`).send({ estado: 'activa' }).expect(302).expect('Location', '/login');
  await request(app).get('/campanas').expect(302).expect('Location', '/login');
  assert.equal(consulta.mock.callCount(), 0);
});

test('regresión: 403 de permisos mantiene sesión y permite regresar a la campaña', async t => {
  const { cliente, store } = crearContexto(t, { _id: id, rol: 'operador', empresa: { _id: empresa } });
  t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [] }));
  t.mock.method(Campana.collection, 'findOne', async () => ({ _id: id, empresa, nombre: 'Campaña', objetivo: 'Objetivo', estado: 'borrador' }));
  const antes = Object.keys(await sesiones(store));
  const respuesta = await cliente.post(`/campanas/${id}/eliminar`).send({ confirmacion: 'eliminar' }).expect(403);
  assert.equal(respuesta.headers.location, undefined);
  assert.equal(respuesta.headers['set-cookie'], undefined);
  await cliente.get(`/campanas/${id}/editar`).expect(200);
  assert.deepEqual(Object.keys(await sesiones(store)), antes);
});

test('regresión: activar no envía; ejecutar email usa destinatarios propios y clasifica HTTP sin cerrar sesión', async t => {
  const { cliente, store } = crearContexto(t, { _id: id, rol: 'operador', empresa: { _id: empresa } });
  const persistido = { _id: id, empresa, nombre: 'Correo', objetivo: 'Objetivo', estado: 'borrador', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Mensaje', destinatarios: { tipo: 'todos', contactos: [], etiquetas: [] } };
  t.mock.method(Campana.collection, 'findOne', async () => ({ ...persistido }));
  t.mock.method(Campana.collection, 'updateOne', async (filtro, cambios) => {
    assert.ok(filtro.empresa instanceof mongoose.Types.ObjectId && filtro.empresa.equals(empresa));
    Object.assign(persistido, cambios.$set);
    return { matchedCount: 1, modifiedCount: 1 };
  });
  t.mock.method(Empresa.collection, 'findOne', async () => ({ _id: empresa, automatizaciones: { email: { habilitada: true, webhookUrl: 'https://n8n.example.test/webhook/prueba' } } }));
  t.mock.method(Contacto.collection, 'find', filtro => {
    assert.equal(String(filtro.empresa), String(empresa));
    return { toArray: async () => [{ _id: id, empresa, nombre: 'Contacto', email: 'correo@example.test', activo: true }] };
  });
  let status = 202;
  const webhook = t.mock.method(global, 'fetch', async (url, opciones) => {
    assert.equal(String(url), 'https://n8n.example.test/webhook/prueba');
    assert.equal(opciones.method, 'POST');
    assert.equal(opciones.headers['Content-Type'], 'application/json');
    const payload = JSON.parse(opciones.body);
    assert.equal(payload.estado, 'activa');
    assert.equal(payload.asunto, 'Asunto');
    assert.equal(payload.totalDestinatarios, 1);
    assert.equal(payload.destinatarios[0].email, 'correo@example.test');
    return new Response(null, { status });
  });
  const antes = Object.keys(await sesiones(store));
  await cliente.post(`/campanas/${id}/editar`).send({ nombre: 'Correo', objetivo: 'Objetivo', estado: 'activa', canal: 'email' }).expect(303);
  assert.equal(webhook.mock.callCount(), 0);
  for (const [http, esperado] of [[202, 303], [401, 502], [404, 502], [500, 502]]) {
    status = http;
    await cliente.post(`/campanas/${id}/ejecutar`).send({ asunto: 'Manipulado' }).expect(503);
  }
  assert.equal(webhook.mock.callCount(), 0);
  await cliente.get(`/campanas/${id}/editar`).expect(200);
  assert.deepEqual(Object.keys(await sesiones(store)), antes);
});
