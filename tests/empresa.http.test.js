const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
process.env.SESSION_SECRET = 'secreto-exclusivo-empresa';
const { crearContexto } = require('./soporte/sesion');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const Campana = require('../models/Campana');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2), actor = id(3);
let empresas, consultasUsuarios, consultasCampanas, insertados, cambios;
const configuracion = {
  emailHabilitada: 'true', emailWebhookUrl: 'https://empresa.example.test/SECRETO',
  whatsappHabilitada: 'false', whatsappWebhookUrl: '', facebookHabilitada: 'false', facebookWebhookUrl: ''
};
beforeEach(t => {
  empresas = [
    { _id: A, nombre: 'Empresa A', estado: 'activa', automatizaciones: {
      email: { habilitada: true, webhookUrl: 'https://a.example.test/SECRETO' },
      whatsapp: { habilitada: true, webhookUrl: 'https://historica.example.test/whatsapp' },
      facebook: { habilitada: true, webhookUrl: 'https://historica.example.test/facebook' }
    } },
    { _id: B, nombre: 'Empresa B', estado: 'activa' }
  ];
  consultasUsuarios = []; consultasCampanas = []; insertados = []; cambios = [];
  t.mock.method(Empresa.collection, 'findOne', async filtro => empresas.find(e => String(e._id) === String(filtro._id)) || null);
  t.mock.method(Empresa.collection, 'updateOne', async (filtro, update) => { cambios.push({ filtro, update }); return { matchedCount: 1 }; });
  t.mock.method(Usuario.collection, 'find', (filtro, opciones) => {
    consultasUsuarios.push(filtro);
    assert.equal(opciones.projection.password, undefined);
    return { toArray: async () => [
      { _id: actor, nombre: 'Admin A', email: 'admin@a.test', rol: 'admin_empresa', empresa: A },
      { _id: id(4), nombre: 'Operador A', email: 'operador@a.test', rol: 'operador', empresa: A },
      { _id: id(5), nombre: 'Persona B', email: 'persona@b.test', rol: 'operador', empresa: B }
    ].filter(u => String(u.empresa) === String(filtro.empresa)) };
  });
  t.mock.method(Campana.collection, 'find', filtro => {
    consultasCampanas.push(filtro);
    return { toArray: async () => [
      { _id: id(6), nombre: 'Campaña A', empresa: A, estado: 'activa', canal: 'email' },
      { _id: id(7), nombre: 'Campaña B', empresa: B, estado: 'activa', canal: 'email' }
    ].filter(c => String(c.empresa) === String(filtro.empresa)) };
  });
  t.mock.method(Usuario.collection, 'insertOne', async datos => { insertados.push(datos); return { insertedId: datos._id }; });
});
const contexto = (t, rol) => crearContexto(t, { _id: actor, nombre: 'Persona A', email: 'persona@a.test', rol, empresa: rol === 'superadmin' ? null : { _id: A, nombre: 'Empresa A' } });

test('admin_empresa: panel con usuarios, operadores y conteos solo de su empresa', async t => {
  const { cliente } = contexto(t, 'admin_empresa');
  const { text } = await cliente.get('/panel').expect(200);
  for (const valor of ['Empresa A', 'Admin A', 'Operador A', 'Campaña A', 'Nuevo operador']) assert.ok(text.includes(valor));
  assert.match(text, /class="total-admin">2<\/p>/); assert.match(text, /class="total-admin">1<\/p>/);
  assert.doesNotMatch(text, /Empresa B|Persona B|Campaña B|SECRETO/);
  for (const consulta of [...consultasUsuarios, ...consultasCampanas]) assert.equal(String(consulta.empresa), String(A));
});

test('operador: panel solo con empresa, campañas y acciones permitidas sin consultar usuarios', async t => {
  const { cliente } = contexto(t, 'operador');
  const { text } = await cliente.get('/panel').expect(200);
  for (const valor of ['Empresa A', 'Campaña A', 'Crear campaña', 'Editar', 'Ejecutar campaña']) assert.ok(text.includes(valor));
  assert.doesNotMatch(text, /Empresa B|Campaña B|Nuevo operador|Usuarios de tu empresa|Automatizaciones|Nueva empresa/);
  assert.equal(consultasUsuarios.length, 0);
  assert.equal(String(consultasCampanas[0].empresa), String(A));
});

test('admin_empresa: crea únicamente operador propio pese a rol y empresa manipulados', async t => {
  const { cliente } = contexto(t, 'admin_empresa');
  const formulario = await cliente.get('/empresa/usuarios/nuevo').expect(200);
  assert.doesNotMatch(formulario.text, /name="rol"|name="empresa"/);
  for (const rol of ['superadmin', 'admin_empresa']) {
    await cliente.post('/empresa/usuarios').send({ nombre: ' Nuevo ', email: ' NUEVO@A.TEST ', password: 'clave-privada', rol, empresa: String(B), _id: String(id(99)) }).expect(303).expect('Location', '/panel');
  }
  for (const usuario of insertados) {
    assert.equal(usuario.rol, 'operador'); assert.equal(String(usuario.empresa), String(A));
    assert.equal(usuario.email, 'nuevo@a.test'); assert.equal(usuario.nombre, 'Nuevo');
    assert.notEqual(usuario.password, 'clave-privada'); assert.equal(await bcrypt.compare('clave-privada', usuario.password), true);
    assert.notEqual(String(usuario._id), String(id(99)));
  }
});

test('operador: no administra usuarios, empresas ni automatizaciones', async t => {
  const { cliente } = contexto(t, 'operador');
  for (const [metodo, ruta] of [
    ['get', '/empresa/usuarios/nuevo'], ['post', '/empresa/usuarios'],
    ['get', '/admin/usuarios/nuevo'], ['post', '/admin/usuarios'],
    ['get', '/admin/empresas/nueva'], ['post', '/admin/empresas'],
    ['get', `/admin/empresas/${A}/automatizaciones`], ['post', `/admin/empresas/${A}/automatizaciones`],
    ['post', `/admin/empresas/${B}/automatizaciones`]
  ]) await cliente[metodo](ruta).send({ ...configuracion, rol: 'superadmin' }).expect(403);
  assert.equal(insertados.length, 0); assert.equal(cambios.length, 0);
});

test('admin_empresa: no accede a administración global ni edita automatizaciones propias o ajenas', async t => {
  const { cliente } = contexto(t, 'admin_empresa');
  for (const empresa of [A, B]) {
    await cliente.get(`/admin/empresas/${empresa}`).expect(403);
    await cliente.get(`/admin/empresas/${empresa}/automatizaciones`).expect(403);
    await cliente.post(`/admin/empresas/${empresa}/automatizaciones`).send(configuracion).expect(403);
  }
  assert.equal(cambios.length, 0);
});

test('superadmin: visualiza estados sin URLs y edita configuración solo de empresa seleccionada', async t => {
  const { cliente } = contexto(t, 'superadmin');
  const detalle = await cliente.get(`/admin/empresas/${A}`).expect(200);
  assert.match(detalle.text, /Automatizaciones/); assert.doesNotMatch(detalle.text, /https:|SECRETO/);
  const editor = await cliente.get(`/admin/empresas/${A}/automatizaciones`).expect(200);
  assert.match(editor.text, /name="emailWebhookUrl"/);
  await cliente.post(`/admin/empresas/${A}/automatizaciones`).send({ ...configuracion, empresa: String(B), nombre: 'Manipulada', token: 'NO_GUARDAR' }).expect(303).expect('Location', `/admin/empresas/${A}`);
  assert.equal(String(cambios[0].filtro._id), String(A));
  const guardado = cambios[0].update.$set;
  assert.equal(guardado['automatizaciones.email'].webhookUrl, configuracion.emailWebhookUrl);
  assert.equal(guardado['automatizaciones.facebook'], undefined);
  assert.equal(guardado.automatizaciones, undefined);
  assert.equal(guardado.nombre, undefined); assert.equal(guardado.token, undefined);
});

test('superadmin: editor valida IDs, URLs y tipos sin guardar ni repetir entradas inválidas', async t => {
  const { cliente } = contexto(t, 'superadmin');
  await cliente.get('/admin/empresas/invalido/automatizaciones').expect(400);
  await cliente.get(`/admin/empresas/${id(99)}/automatizaciones`).expect(404);
  for (const cambiosEntrada of [{ emailWebhookUrl: 'javascript:SECRETO_MALICIOSO' }, { emailHabilitada: ['true'] }, { emailWebhookUrl: { url: 'http://example.test' } }]) {
    const respuesta = await cliente.post(`/admin/empresas/${A}/automatizaciones`).send({ ...configuracion, ...cambiosEntrada }).expect(422);
    assert.doesNotMatch(respuesta.text, /SECRETO_MALICIOSO/);
  }
  assert.equal(cambios.length, 0);
});

test('admin_empresa: validación de operador no devuelve password ni cambia relaciones', async t => {
  const { cliente } = contexto(t, 'admin_empresa');
  const respuesta = await cliente.post('/empresa/usuarios').send({ nombre: '', email: 'invalido', password: 'SECRETO_NUNCA_DEVOLVER', rol: 'superadmin', empresa: String(B) }).expect(422);
  assert.doesNotMatch(respuesta.text, /SECRETO_NUNCA_DEVOLVER|value="superadmin"/);
  assert.equal(insertados.length, 0);
});
