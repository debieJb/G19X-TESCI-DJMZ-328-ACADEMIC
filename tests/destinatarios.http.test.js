const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido en pruebas'); });
}
process.env.SESSION_SECRET = 'secreto-exclusivo-destinatarios';
const { crearContexto } = require('./soporte/sesion');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const empresa = id(1), otra = id(2), autor = id(3), campanaId = id(10);
let cliente, usuario, campanas, contactos, guardados, cambios, solicitudes, filtros;
const coincide = (doc, filtro) => Object.entries(filtro).every(([campo, valor]) => {
  if (valor?.$in) return (Array.isArray(doc[campo]) ? doc[campo] : [doc[campo]]).some(actual => valor.$in.some(v => String(v) === String(actual)));
  if (valor?.$type) return typeof doc[campo] === valor.$type;
  return String(doc[campo]) === String(valor);
});
beforeEach(t => {
  usuario = { _id: autor, nombre: 'Operador', rol: 'operador', empresa: { _id: empresa, nombre: 'Empresa A' } };
  ({ cliente } = crearContexto(t, usuario));
  campanas = [{ _id: campanaId, empresa, creadoPor: autor, nombre: 'Campaña', objetivo: 'Objetivo', estado: 'activa', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Mensaje', destinatarios: { tipo: 'todos', contactos: [], etiquetas: [] } },
    { _id: id(11), empresa: otra, nombre: 'Campaña ajena', objetivo: 'Objetivo', estado: 'activa', canal: 'email' },
    { _id: id(12), nombre: 'Histórica', objetivo: 'Objetivo', estado: 'activa', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Mensaje' }];
  contactos = [{ _id: id(20), empresa, nombre: 'Cliente <seguro>', email: 'cliente@example.test', activo: true, etiquetas: ['vip', 'ventas'] },
    { _id: id(21), empresa, nombre: 'Sin email', telefono: '555', activo: true, etiquetas: ['ventas'] },
    { _id: id(22), empresa, nombre: 'Inactivo', email: 'inactivo@example.test', activo: false, etiquetas: ['vip'] },
    { _id: id(23), empresa: otra, nombre: 'CONTACTO SECRETO', email: 'secreto@example.test', activo: true, etiquetas: ['ajena'] }];
  guardados = []; cambios = []; solicitudes = []; filtros = [];
  t.mock.method(Campana.collection, 'findOne', async filtro => campanas.find(doc => coincide(doc, filtro)) || null);
  t.mock.method(Campana.collection, 'insertOne', async doc => { guardados.push(doc); return { insertedId: doc._id }; });
  t.mock.method(Campana.collection, 'updateOne', async (filtro, update) => { cambios.push({ filtro, update }); return { matchedCount: 1 }; });
  t.mock.method(Contacto.collection, 'find', filtro => {
    filtros.push(filtro);
    return { toArray: async () => contactos.filter(doc => coincide(doc, filtro)) };
  });
  const empresas = [{ _id: empresa, nombre: 'Empresa A' }, { _id: otra, nombre: 'Empresa B' }];
  t.mock.method(Empresa.collection, 'find', () => ({ toArray: async () => empresas }));
  t.mock.method(Empresa.collection, 'findOne', async filtro => empresas.find(doc => coincide(doc, filtro)) || null);
  t.mock.method(global, 'fetch', async (url, opciones) => { solicitudes.push({ url: String(url), payload: JSON.parse(opciones.body) }); return new Response(null, { status: 204 }); });
  const anteriores = [process.env.N8N_WEBHOOK_URL, process.env.N8N_WEBHOOK_TIMEOUT_MS];
  process.env.N8N_WEBHOOK_URL = 'https://n8n.example.test/webhook'; delete process.env.N8N_WEBHOOK_TIMEOUT_MS;
  t.after(() => ['N8N_WEBHOOK_URL', 'N8N_WEBHOOK_TIMEOUT_MS'].forEach((clave, i) => {
    if (anteriores[i] === undefined) delete process.env[clave]; else process.env[clave] = anteriores[i];
  }));
});
const base = { nombre: 'Campaña', objetivo: 'Objetivo', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Mensaje' };
const editar = datos => cliente.post(`/campanas/${campanaId}/editar`).send({ ...base, estado: 'activa', ...datos });

test('destinatarios HTTP: formularios muestran solo contactos y etiquetas propios', async () => {
  for (const ruta of ['/campanas/nueva', `/campanas/${campanaId}/editar`]) {
    const respuesta = await cliente.get(ruta).expect(200);
    assert.match(respuesta.text, /<h2>Destinatarios/);
    assert.match(respuesta.text, /Cliente &lt;seguro&gt;/);
    assert.match(respuesta.text, /name="destinatarios\[contactos\]"/);
    assert.match(respuesta.text, /name="destinatarios\[etiquetas\]"/);
    assert.doesNotMatch(respuesta.text, /CONTACTO SECRETO|secreto@example.test|value="ajena"/);
    assert.match(respuesta.text, /destinatariosFormulario.js/);
  }
  assert.ok(filtros.every(filtro => String(filtro.empresa) === String(empresa)));
});
test('destinatarios HTTP: crear por defecto todos y guardar selección específica sin duplicados', async () => {
  await cliente.post('/campanas').send(base).expect(303);
  assert.equal(guardados[0].destinatarios.tipo, 'todos');
  await cliente.post('/campanas').type('form').send({ ...base, destinatarios: { tipo: 'contactos', contactos: [String(id(20)), String(id(20))] } }).expect(303);
  assert.deepEqual(guardados[1].destinatarios.contactos.map(String), [String(id(20))]);
});
test('destinatarios HTTP: editar selección específica y por etiquetas', async () => {
  await editar({ destinatarios: { tipo: 'contactos', contactos: [String(id(20))] } }).expect(303);
  assert.equal(cambios[0].update.$set.destinatarios.tipo, 'contactos');
  await editar({ destinatarios: { tipo: 'etiquetas', etiquetas: ['vip', 'ventas'] } }).expect(303);
  assert.deepEqual(cambios[1].update.$set.destinatarios.etiquetas, ['vip', 'ventas']);
  assert.ok(cambios.every(cambio => String(cambio.filtro.empresa) === String(empresa)));
});
for (const rol of ['operador', 'admin_empresa', 'superadmin']) {
  test(`destinatarios HTTP: ${rol} no selecciona contactos/etiquetas de otra empresa`, async () => {
    usuario.rol = rol;
    if (rol === 'superadmin') usuario.empresa = null;
    for (const destinatarios of [{ tipo: 'contactos', contactos: [String(id(23))] }, { tipo: 'etiquetas', etiquetas: ['ajena'] }]) {
      const creado = await cliente.post('/campanas').send({ ...base, empresa: String(empresa), destinatarios }).expect(422);
      const editado = await editar({ empresa: String(otra), destinatarios }).expect(422);
      for (const respuesta of [creado, editado]) {
        assert.match(respuesta.text, /únicamente/); assert.doesNotMatch(respuesta.text, /CONTACTO SECRETO|secreto@example.test/);
      }
    }
    assert.equal(guardados.length, 0); assert.equal(cambios.length, 0);
  });
}
test('destinatarios HTTP: superadmin carga empresa seleccionada y al editar usa la empresa persistida', async () => {
  usuario.rol = 'superadmin'; usuario.empresa = null;
  const otraEmpresa = await cliente.get(`/campanas/nueva?empresa=${otra}`).expect(200);
  assert.match(otraEmpresa.text, /CONTACTO SECRETO/); assert.doesNotMatch(otraEmpresa.text, /Cliente &lt;seguro&gt;/);
  filtros = [];
  const edicion = await cliente.get(`/campanas/${campanaId}/editar?empresa=${otra}`).expect(200);
  assert.doesNotMatch(edicion.text, /CONTACTO SECRETO/);
  assert.ok(filtros.every(filtro => String(filtro.empresa) === String(empresa)));
  await cliente.post('/campanas').send({ ...base, empresa: String(otra), destinatarios: { tipo: 'contactos', contactos: [String(id(23))] } }).expect(303);
  assert.equal(String(guardados[0].empresa), String(otra));
});
test('destinatarios HTTP: empresa manipulada en GET no modifica opciones de operador', async () => {
  const respuesta = await cliente.get(`/campanas/nueva?empresa=${otra}`).expect(200);
  assert.doesNotMatch(respuesta.text, /CONTACTO SECRETO/);
  assert.ok(filtros.every(filtro => String(filtro.empresa) === String(empresa)));
});
test('destinatarios HTTP: rechaza estructuras malformadas y selecciones vacías sin guardar', async () => {
  for (const destinatarios of [null, [], 'todos', { tipo: 'otro' }, { tipo: '' }, { tipo: 'contactos', contactos: [] },
    { tipo: 'contactos', contactos: ['incorrecto'] }, { tipo: 'contactos', contactos: { $ne: null } },
    { tipo: 'etiquetas', etiquetas: [] }, { tipo: 'etiquetas', etiquetas: [{}] }]) {
    await cliente.post('/campanas').send({ ...base, destinatarios }).expect(422);
    await editar({ destinatarios }).expect(422);
  }
  assert.equal(guardados.length, 0); assert.equal(cambios.length, 0);
});
test('destinatarios HTTP: detalle muestra tipo, cantidad válida, contactos y etiquetas', async () => {
  let respuesta = await cliente.get(`/campanas/${campanaId}`).expect(200);
  assert.match(respuesta.text, /Todos los contactos activos/);
  assert.match(respuesta.text, /Cantidad estimada de destinatarios: <strong>1/);
  campanas[0].destinatarios = { tipo: 'contactos', contactos: [id(20), id(21), id(23)], etiquetas: [] };
  respuesta = await cliente.get(`/campanas/${campanaId}`).expect(200);
  assert.match(respuesta.text, /Contactos seleccionados/); assert.match(respuesta.text, /Cliente &lt;seguro&gt;/);
  assert.doesNotMatch(respuesta.text, /CONTACTO SECRETO/);
  campanas[0].destinatarios = { tipo: 'etiquetas', etiquetas: ['ventas', 'vip'], contactos: [] };
  respuesta = await cliente.get(`/campanas/${campanaId}`).expect(200);
  assert.match(respuesta.text, /Etiquetas seleccionadas: ventas, vip/);
});
test('destinatarios HTTP: ejecución usa selección persistida, un solo webhook y payload compatible', async () => {
  await cliente.post(`/campanas/${campanaId}/ejecutar`).send({ destinatarios: { tipo: 'contactos', contactos: [String(id(23))] }, empresa: String(otra) }).expect(503);
  assert.equal(solicitudes.length, 0);
  assert.equal(cambios.length, 0);
});
test('destinatarios HTTP: no hay destinatarios válidos bloquea webhook con error claro 422', async () => {
  contactos[0].activo = false;
  const respuesta = await cliente.post(`/campanas/${campanaId}/ejecutar`).send({}).expect(503);
  assert.match(respuesta.text, /temporalmente bloqueados/); assert.match(respuesta.text, /role="alert"/);
  assert.equal(solicitudes.length, 0);
});
test('destinatarios HTTP: se recalculan después de editar/inactivar/eliminar contactos', async () => {
  campanas[0].destinatarios = { tipo: 'contactos', contactos: [id(20)], etiquetas: [] };
  await cliente.get(`/campanas/${campanaId}`).expect(200);
  contactos = contactos.filter(doc => String(doc._id) !== String(id(20)));
  await cliente.post(`/campanas/${campanaId}/ejecutar`).send({}).expect(503);
  assert.equal(solicitudes.length, 0);
});
test('destinatarios HTTP: campañas antiguas se conservan, pero no ejecutan sin selección autorizada', async () => {
  delete campanas[0].destinatarios;
  const respuesta = await cliente.get(`/campanas/${campanaId}/editar`).expect(200);
  assert.match(respuesta.text, /Selecciona destinatarios antes de ejecutar/);
  await editar({ nombre: 'Editada' }).expect(303);
  assert.equal(cambios[0].update.$set.destinatarios, undefined);
  await editar({ nombre: 'Otra edición', destinatarios: { tipo: '' } }).expect(303);
  assert.equal(cambios[1].update.$set.destinatarios, undefined);
  await cliente.post(`/campanas/${campanaId}/ejecutar`).send({}).expect(503);
  assert.equal(solicitudes.length, 0);
  usuario.rol = 'superadmin'; usuario.empresa = null;
  await cliente.post(`/campanas/${id(12)}/ejecutar`).send({}).expect(503);
  assert.equal(solicitudes.length, 0);
});
test('destinatarios HTTP: formularios antiguos no borran una selección configurada', async () => {
  await editar({ nombre: 'Editada' }).expect(303);
  assert.equal(cambios[0].update.$set.destinatarios, undefined);
  await editar({ destinatarios: { tipo: '' } }).expect(422);
});
test('destinatarios HTTP: permisos existentes y campañas ajenas siguen protegidos', async () => {
  await cliente.get(`/campanas/${id(11)}`).expect(404);
  await cliente.get(`/campanas/${id(11)}/editar`).expect(404);
  await cliente.post(`/campanas/${id(11)}/ejecutar`).send({}).expect(404);
  await cliente.post(`/campanas/${campanaId}/eliminar`).send({ confirmacion: 'eliminar' }).expect(403);
  assert.equal(solicitudes.length, 0);
});
test('destinatarios HTTP: fallo de consulta de contactos no filtra información ni envía webhook', async t => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(Contacto.collection, 'find', () => { throw Object.assign(new Error('SECRETO'), { name: 'MongoNetworkError' }); });
  const respuesta = await cliente.post(`/campanas/${campanaId}/ejecutar`).send({}).expect(503);
  assert.doesNotMatch(respuesta.text, /SECRETO/); assert.equal(solicitudes.length, 0);
});
