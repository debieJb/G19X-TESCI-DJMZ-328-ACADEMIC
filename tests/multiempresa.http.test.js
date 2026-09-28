const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
process.env.SESSION_SECRET = 'secreto-exclusivo-multiempresa';
const { crearContexto } = require('./soporte/sesion');
const Campana = require('../models/Campana');
const Empresa = require('../models/Empresa');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const empresaA = id(1), empresaB = id(2), autor = id(3);
let documentos, guardados, escrituras, borrados, llamadasWebhook, empresas;
const coincide = (documento, filtro) => Object.entries(filtro).every(([campo, valor]) => String(documento[campo]) === String(valor));
beforeEach(t => {
  documentos = [
    { _id: id(10), empresa: empresaA, creadoPor: autor, nombre: 'Campaña A', objetivo: 'Objetivo', estado: 'activa', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Texto' },
    { _id: id(11), empresa: empresaB, creadoPor: autor, nombre: 'Campaña B', objetivo: 'Objetivo', estado: 'activa', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Texto' },
    { _id: id(12), nombre: 'Campaña histórica', objetivo: 'Objetivo', estado: 'activa', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Texto' }
  ];
  empresas = [{ _id: empresaA, nombre: 'Empresa A' }, { _id: empresaB, nombre: 'Empresa B' }];
  guardados = []; escrituras = []; borrados = []; llamadasWebhook = [];
  t.mock.method(Campana.collection, 'find', filtro => ({ toArray: async () => documentos.filter(doc => coincide(doc, filtro)) }));
  t.mock.method(Campana.collection, 'findOne', async filtro => documentos.find(doc => coincide(doc, filtro)) || null);
  t.mock.method(Campana.collection, 'insertOne', async datos => { guardados.push(datos); return { insertedId: datos._id }; });
  t.mock.method(Campana.collection, 'updateOne', async (filtro, cambios) => { escrituras.push({ filtro, cambios }); return { matchedCount: 1 }; });
  t.mock.method(Campana.collection, 'deleteOne', async filtro => { borrados.push(filtro); return { deletedCount: 1 }; });
  t.mock.method(Empresa.collection, 'find', () => ({ toArray: async () => empresas }));
  t.mock.method(Empresa.collection, 'findOne', async filtro => empresas.find(empresa => String(empresa._id) === String(filtro._id)) || null);
  t.mock.method(global, 'fetch', async (url, opciones) => { llamadasWebhook.push({ url: String(url), opciones }); return new Response(null, { status: 204 }); });
  const anterior = process.env.N8N_WEBHOOK_URL;
  process.env.N8N_WEBHOOK_URL = 'https://global.example.test/hook';
  t.after(() => { if (anterior === undefined) delete process.env.N8N_WEBHOOK_URL; else process.env.N8N_WEBHOOK_URL = anterior; });
});
const contexto = (t, rol, empresa = { _id: empresaA, nombre: 'Empresa A' }) => crearContexto(t, { _id: autor, nombre: 'Persona', email: 'persona@example.test', rol, empresa });

for (const rol of ['admin_empresa', 'operador']) {
  test(`aislamiento: ${rol} solo lista campañas de A`, async t => {
    const { cliente } = contexto(t, rol);
    const { text } = await cliente.get('/campanas').expect(200);
    assert.match(text, /Campaña A/); assert.doesNotMatch(text, /Campaña B|Campaña histórica/);
  });
  for (const [accion, metodo, sufijo] of [['consultar', 'get', ''], ['editar', 'post', '/editar'], ['ejecutar', 'post', '/ejecutar'], ['eliminar', 'post', '/eliminar']]) {
    test(`aislamiento: ${rol} no puede ${accion} campaña ajena ni histórica`, async t => {
      const { cliente } = contexto(t, rol);
      for (const recurso of [id(11), id(12)]) {
        await cliente[metodo](`/campanas/${recurso}${sufijo}`).send({ nombre: 'Manipulada', objetivo: 'Objetivo', estado: 'pausada', confirmacion: 'eliminar', empresa: empresaA, creadoPor: autor }).expect(404);
      }
      assert.equal(escrituras.length, 0); assert.equal(borrados.length, 0); assert.equal(llamadasWebhook.length, 0);
    });
  }
  test(`aislamiento: ${rol} crea con empresa y autor del servidor`, async t => {
    const { cliente } = contexto(t, rol);
    await cliente.post('/campanas').send({ nombre: 'Nueva', objetivo: 'Objetivo', empresa: String(empresaB), creadoPor: String(id(99)) }).expect(303);
    assert.equal(String(guardados[0].empresa), String(empresaA));
    assert.equal(String(guardados[0].creadoPor), String(autor));
    const form = await cliente.get('/campanas/nueva').expect(200);
    assert.doesNotMatch(form.text, /name="empresa"|name="creadoPor"/);
  });
  test(`aislamiento: ${rol} edita campaña propia sin cambiar relaciones`, async t => {
    const { cliente } = contexto(t, rol);
    await cliente.get(`/campanas/${id(10)}/editar`).expect(200);
    await cliente.post(`/campanas/${id(10)}/editar`).send({ nombre: 'Editada', objetivo: 'Objetivo', estado: 'pausada', empresa: String(empresaB), creadoPor: String(id(99)) }).expect(303);
    assert.equal(String(escrituras[0].filtro.empresa), String(empresaA));
    assert.equal(escrituras[0].cambios.$set.empresa, undefined);
    assert.equal(escrituras[0].cambios.$set.creadoPor, undefined);
  });
  test(`aislamiento: ${rol} ejecuta propia sin aceptar webhook del navegador`, async t => {
    const { cliente } = contexto(t, rol);
    await cliente.post(`/campanas/${id(10)}/ejecutar`).send({ empresa: String(empresaB), webhookUrl: 'https://evil.example.test', N8N_WEBHOOK_URL: 'https://evil.example.test' }).expect(303);
    assert.equal(llamadasWebhook[0].url, 'https://global.example.test/hook');
  });
}

test('operador: eliminar propia devuelve 403, incluida confirmación GET; botones ausentes', async t => {
  const { cliente } = contexto(t, 'operador');
  await cliente.post(`/campanas/${id(10)}/eliminar`).send({ confirmacion: 'eliminar' }).expect(403);
  await cliente.get(`/campanas/${id(10)}/eliminar`).expect(403);
  const detalle = await cliente.get(`/campanas/${id(10)}`).expect(200);
  const listado = await cliente.get('/campanas').expect(200);
  assert.doesNotMatch(detalle.text, /\/eliminar/); assert.doesNotMatch(listado.text, /\/eliminar/);
  assert.equal(borrados.length, 0);
});

test('admin_empresa: puede eliminar propia con filtro de empresa', async t => {
  const { cliente } = contexto(t, 'admin_empresa');
  await cliente.post(`/campanas/${id(10)}/eliminar`).send({ confirmacion: 'eliminar' }).expect(303);
  assert.equal(String(borrados[0].empresa), String(empresaA));
});

test('superadmin: selecciona empresa válida y fija autor; rechaza IDs manipulados o inexistentes', async t => {
  const { cliente } = contexto(t, 'superadmin', null);
  const form = await cliente.get('/campanas/nueva').expect(200);
  assert.match(form.text, /name="empresa"/);
  assert.match(form.text, /Empresa A/); assert.match(form.text, /Empresa B/);
  for (const empresa of [undefined, 'invalida', String(id(99)), { $ne: null }, [String(empresaA)]]) {
    await cliente.post('/campanas').send({ nombre: 'Nueva', objetivo: 'Objetivo', empresa }).expect(422);
  }
  assert.equal(guardados.length, 0);
  await cliente.post('/campanas').send({ nombre: 'Nueva', objetivo: 'Objetivo', empresa: String(empresaB), creadoPor: String(id(99)) }).expect(303);
  assert.equal(String(guardados[0].empresa), String(empresaB)); assert.equal(String(guardados[0].creadoPor), String(autor));
});

test('superadmin: administra históricas sin migrarlas y las ejecuta con global', async t => {
  const { cliente } = contexto(t, 'superadmin', null);
  const antes = JSON.stringify(documentos[2]);
  const listado = await cliente.get('/campanas').expect(200);
  assert.match(listado.text, /Campaña A/); assert.match(listado.text, /Campaña B/); assert.match(listado.text, /Campaña histórica/);
  await cliente.get(`/campanas/${id(12)}`).expect(200);
  await cliente.post(`/campanas/${id(12)}/ejecutar`).send({ empresa: String(empresaA) }).expect(303);
  assert.equal(llamadasWebhook[0].url, 'https://global.example.test/hook');
  await cliente.post(`/campanas/${id(12)}/editar`).send({ nombre: 'Histórica editada', objetivo: 'Objetivo', estado: 'pausada', empresa: String(empresaA), creadoPor: String(autor) }).expect(303);
  assert.equal(escrituras[0].cambios.$set.empresa, undefined); assert.equal(escrituras[0].cambios.$set.creadoPor, undefined);
  assert.equal(JSON.stringify(documentos[2]), antes);
});

test('sin empresa válida o rol reconocido nunca se obtiene acceso global', async t => {
  const usuario = { _id: autor, rol: 'operador', empresa: null };
  const { cliente } = crearContexto(t, usuario);
  await cliente.get('/campanas').expect(403);
  await cliente.get('/panel').expect(403);
  usuario.empresa = { _id: empresaA, nombre: 'Empresa A' }; usuario.rol = 'inventado';
  await cliente.get('/campanas').expect(403);
});

test('campañas: todas las rutas requieren autenticación', async () => {
  const app = require('../app');
  for (const [metodo, ruta] of [['get', '/campanas'], ['get', '/campanas/nueva'], ['post', '/campanas'], ['get', `/campanas/${id(10)}`], ['get', `/campanas/${id(10)}/editar`], ['post', `/campanas/${id(10)}/editar`], ['get', `/campanas/${id(10)}/eliminar`], ['post', `/campanas/${id(10)}/eliminar`], ['post', `/campanas/${id(10)}/ejecutar`]]) {
    await request(app)[metodo](ruta).expect(302).expect('Location', '/login');
  }
});
