const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido'); });
}
process.env.SESSION_SECRET = 'seguridad-etapa1-solo-pruebas';
const { crearContexto } = require('./soporte/sesion');
const Empresa = require('../models/Empresa');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2), actor = id(3), campanaId = id(4);

for (const rol of ['operador', 'admin_empresa', 'superadmin']) {
  test(`HTTP seguridad: ${rol} conserva acceso a datos propios pero no ejecuta empresa inactiva`, async t => {
    const { cliente } = crearContexto(t, { _id: actor, rol, empresa: { _id: A, estado: 'activa' } });
    const campana = { _id: campanaId, empresa: A, nombre: 'Campaña', objetivo: 'Objetivo', estado: 'activa', canal: 'email',
      asunto: 'Asunto', cuerpoTexto: 'Texto', destinatarios: { tipo: 'todos' } };
    t.mock.method(Campana.collection, 'findOne', async filtro => String(filtro._id) === String(campanaId)
      && (!filtro.empresa || String(filtro.empresa) === String(A)) ? { ...campana } : null);
    t.mock.method(Contacto.collection, 'find', filtro => {
      assert.equal(String(filtro.empresa), String(A));
      return { toArray: async () => [{ _id: id(10), nombre: 'Propio', activo: true, email: 'propio@example.test', canales: { email: true } }] };
    });
    t.mock.method(Empresa.collection, 'findOne', async filtro => {
      assert.equal(String(filtro._id), String(A));
      return { _id: A, nombre: 'Empresa', estado: 'inactiva', automatizaciones: { email: { webhookUrl: 'https://n8n.example.test/webhook' } } };
    });
    const fetch = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
    const guardar = t.mock.method(Campana.collection, 'updateOne', () => { throw new Error('No guardar'); });
    const borrar = t.mock.method(Campana.collection, 'deleteOne', () => { throw new Error('No borrar'); });
    await cliente.get(`/campanas/${campanaId}`).expect(200);
    const respuesta = await cliente.post(`/campanas/${campanaId}/ejecutar`).send({ empresa: String(B), estado: 'activa', rol: 'superadmin' }).expect(503);
    assert.match(respuesta.text, /temporalmente bloqueados/);
    assert.doesNotMatch(respuesta.text, /webhook|n8n.example.test/);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(guardar.mock.callCount(), 0);
    assert.equal(borrar.mock.callCount(), 0);
  });
}

test('HTTP seguridad: habilitación de email cambia la estimación y se recalcula al ejecutar', async t => {
  const { cliente } = crearContexto(t, { _id: actor, rol: 'operador', empresa: { _id: A } });
  const campana = { _id: campanaId, empresa: A, nombre: 'Campaña', objetivo: 'Objetivo', canal: 'email', estado: 'activa',
    asunto: 'Asunto', cuerpoTexto: 'Texto', destinatarios: { tipo: 'todos' } };
  const contactos = [{ _id: id(10), nombre: 'Propio', activo: true, email: 'propio@example.test', etiquetas: [], canales: { email: false } }];
  t.mock.method(Campana.collection, 'findOne', async () => campana);
  t.mock.method(Contacto.collection, 'find', filtro => {
    assert.equal(String(filtro.empresa), String(A));
    return { toArray: async () => contactos };
  });
  t.mock.method(Empresa.collection, 'findOne', async () => ({ _id: A, estado: 'activa', automatizaciones: { email: { webhookUrl: 'https://n8n.example.test/hook' } } }));
  const fetch = t.mock.method(global, 'fetch', async () => new Response(null, { status: 204 }));
  const formulario = await cliente.get(`/campanas/${campanaId}/editar`).expect(200);
  assert.match(formulario.text, /data-email-habilitado="false"/);
  assert.match(formulario.text, /no acredita consentimiento/);
  const detalle = await cliente.get(`/campanas/${campanaId}`).expect(200);
  assert.match(detalle.text, /Cantidad estimada de destinatarios: <strong>0/);
  await cliente.post(`/campanas/${campanaId}/ejecutar`).send({ canales: { email: true } }).expect(503);
  assert.equal(fetch.mock.callCount(), 0);
  contactos[0].canales.email = true;
  await cliente.post(`/campanas/${campanaId}/ejecutar`).send({}).expect(503);
  assert.equal(fetch.mock.callCount(), 0);
});

test('HTTP seguridad: editor de webhook rechaza formato ambiguo sin guardar ni exponer valores', async t => {
  const { cliente } = crearContexto(t, { _id: actor, rol: 'superadmin', empresa: null });
  const empresa = Empresa.hydrate({ _id: A, nombre: 'Empresa', estado: 'activa' });
  t.mock.method(Empresa, 'findById', () => ({ select: async () => empresa }));
  const guardar = t.mock.method(empresa, 'save', () => { throw new Error('No guardar'); });
  const respuesta = await cliente.post(`/admin/empresas/${A}/automatizaciones`).send({ emailHabilitada: 'true', emailWebhookUrl: 'https://n8n.example.test/#SECRETO' }).expect(422);
  assert.doesNotMatch(respuesta.text, /SECRETO/);
  assert.equal(guardar.mock.callCount(), 0);
});
