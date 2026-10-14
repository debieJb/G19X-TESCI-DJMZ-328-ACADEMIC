const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'solo-pruebas-csrf-admin';
const { crearContexto } = require('./soporte/sesion');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const empresa = '507f1f77bcf86cd799439012';
const usuario = { _id: '507f1f77bcf86cd799439011', rol: 'superadmin', nombre: 'Pruebas', empresa: null };
const rutas = ['/admin/empresas', '/admin/usuarios', `/admin/empresas/${empresa}/automatizaciones`,
  '/campanas', `/campanas/${empresa}/editar`, `/campanas/${empresa}/eliminar`, `/campanas/${empresa}/ejecutar`,
  '/contactos', `/contactos/${empresa}/editar`, `/contactos/${empresa}/eliminar`, '/logout'];

const contexto = t => {
  t.mock.method(mongoose, 'connect', () => { throw new Error('MongoDB real prohibido'); });
  const accesos = [];
  for (const modelo of [Empresa, Usuario, Campana, Contacto]) {
    for (const metodo of ['insertOne', 'updateOne', 'deleteOne', 'findOne']) {
      accesos.push(t.mock.method(modelo.collection, metodo, () => { throw new Error('Persistencia no permitida'); }));
    }
  }
  return { ...crearContexto(t, usuario, { csrf: false }), accesos };
};

for (const ruta of rutas) {
  test(`CSRF superadmin: ${ruta} bloquea tokens ausentes, inválidos y manipulados antes de persistencia`, async t => {
    const { cliente, adminCsrf, accesos } = contexto(t);
    for (const token of [undefined, null, '', 'incorrecto', 'x'.repeat(43), ['x'.repeat(43)], { valor: adminCsrf }, 'é'.repeat(43), adminCsrf + '\n']) {
      const respuesta = await cliente.post(ruta).send({ _csrf: token, nombre: 'No guardar' }).expect(403);
      assert.doesNotMatch(respuesta.text, /No guardar/);
    }
    for (const acceso of accesos) assert.equal(acceso.mock.callCount(), 0);
  });
}

test('CSRF superadmin: formulario genera token estable, privado por sesión y aceptado en creación', async t => {
  const { cliente, adminCsrf } = contexto(t);
  const insercion = t.mock.method(Empresa.collection, 'insertOne', async doc => ({ insertedId: doc._id }));
  const formulario = await cliente.get('/admin/empresas/nueva').expect(200).expect('Cache-Control', 'no-store');
  assert.ok(formulario.text.includes(`name="_csrf" value="${adminCsrf}"`));
  const repetido = await cliente.get('/admin/empresas/nueva').expect(200);
  assert.ok(repetido.text.includes(adminCsrf));
  await cliente.post('/admin/empresas').type('form').send({ _csrf: adminCsrf, nombre: 'Prueba', estado: 'activa' }).expect(303);
  assert.equal(insercion.mock.callCount(), 1);
  assert.equal(insercion.mock.calls[0].arguments[0]._csrf, undefined);
});

test('CSRF superadmin: genera un token nuevo si la sesión no lo tiene o contiene un formato inválido', async t => {
  const { cliente, store } = contexto(t);
  const sesiones = await new Promise((resolve, reject) => store.all((err, values) => err ? reject(err) : resolve(values)));
  const sid = Object.keys(sesiones)[0];
  for (const valor of [undefined, 'inválido']) {
    const actual = sesiones[sid];
    actual.adminCsrf = valor;
    await new Promise((resolve, reject) => store.set(sid, actual, err => err ? reject(err) : resolve()));
    const respuesta = await cliente.get('/admin/empresas/nueva').expect(200);
    assert.match(respuesta.text, /name="_csrf" value="[A-Za-z0-9_-]{43}"/);
  }
});

test('CSRF superadmin: no acepta token de otra sesión, query ni cabecera si el cuerpo es inválido', async t => {
  const primero = contexto(t);
  const segundo = crearContexto(t, usuario, { csrf: false });
  assert.notEqual(primero.adminCsrf, segundo.adminCsrf);
  await segundo.cliente.post('/admin/empresas').send({ _csrf: primero.adminCsrf }).expect(403);
  await primero.cliente.post(`/admin/empresas?_csrf=${primero.adminCsrf}`).send({}).expect(403);
  await primero.cliente.post('/admin/empresas').set('X-CSRF-Token', primero.adminCsrf).send({ _csrf: 'incorrecto' }).expect(403);
});

test('CSRF superadmin: cabecera válida llega a validación de negocio y error conserva token en formulario', async t => {
  const { cliente, adminCsrf } = contexto(t);
  const respuesta = await cliente.post('/admin/empresas').set('X-CSRF-Token', adminCsrf).send({ nombre: '', estado: 'activa' }).expect(422);
  assert.ok(respuesta.text.includes(`name="_csrf" value="${adminCsrf}"`));
});

test('CSRF superadmin: PUT, PATCH y DELETE tampoco omiten validación', async t => {
  const { app, cookie } = contexto(t);
  for (const metodo of ['put', 'patch', 'delete']) {
    await request(app)[metodo]('/admin/empresas').set('Cookie', cookie).send({}).expect(403);
  }
});

test('CSRF superadmin: un token válido no concede rol ni autenticación', async t => {
  const { app, cliente, adminCsrf } = contexto(t);
  await request(app).post('/admin/empresas').send({ _csrf: adminCsrf }).expect(302).expect('Location', '/login');
  usuario.rol = 'operador';
  try {
    await cliente.post('/admin/empresas').send({ _csrf: adminCsrf, rol: 'superadmin' }).expect(403);
  } finally { usuario.rol = 'superadmin'; }
});

test('CSRF superadmin: logout válido destruye sesión y el token anterior no autentica', async t => {
  const { cliente, adminCsrf } = contexto(t);
  await cliente.post('/logout').send({ _csrf: adminCsrf }).expect(303);
  await cliente.post('/admin/empresas').send({ _csrf: adminCsrf }).expect(302).expect('Location', '/login');
});
