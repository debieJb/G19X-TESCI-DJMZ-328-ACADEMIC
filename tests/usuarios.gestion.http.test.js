const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'secreto-solo-pruebas-gestion';
const { crearContexto } = require('./soporte/sesion');
const Usuario = require('../models/Usuario');
const Empresa = require('../models/Empresa');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2), objetivo = id(3);
let usuario, escrituras, empresa;
beforeEach(t => {
  usuario = { _id: objetivo, nombre: 'Operador', email: 'op@example.test', empresa: A, rol: 'operador', estadoAcceso: 'activo' };
  empresa = { _id: A, estado: 'activa', versionAlta: 1, estadoActivacion: 'verificada' };
  escrituras = [];
  t.mock.method(Usuario.collection, 'findOne', async filtro => {
    if (String(filtro._id) !== String(usuario._id)) return null;
    if (filtro.empresa && String(filtro.empresa) !== String(usuario.empresa)) return null;
    if (typeof filtro.rol === 'string' && filtro.rol !== usuario.rol) return null;
    return { ...usuario };
  });
  t.mock.method(Usuario.collection, 'updateOne', async (filtro, update) => {
    escrituras.push({ filtro, update }); Object.assign(usuario, update.$set); return { matchedCount: 1 };
  });
  t.mock.method(Empresa.collection, 'findOne', async () => empresa);
});
const contexto = (t, rol = 'admin_empresa', opciones) => crearContexto(t, {
  _id: id(9), nombre: 'Responsable', rol, empresa: { _id: A, nombre: 'Empresa' }
}, opciones);
test('administrador edita solo campos autorizados y bloquea/reactiva al operador', async t => {
  const { cliente } = contexto(t);
  await cliente.get(`/empresa/usuarios/${objetivo}/editar`).expect(200);
  await cliente.get(`/empresa/usuarios/${objetivo}`).expect(200);
  await cliente.post(`/empresa/usuarios/${objetivo}`).send({ nombre: 'Nuevo nombre', email: 'nuevo@example.test', rol: 'superadmin', empresa: String(B), estadoAcceso: 'activo' }).expect(303);
  assert.equal(usuario.rol, 'operador'); assert.equal(String(usuario.empresa), String(A));
  assert.equal(usuario.nombre, 'Nuevo nombre');
  for (const estadoAcceso of ['bloqueado', 'activo']) {
    await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso }).expect(303);
    assert.equal(usuario.estadoAcceso, estadoAcceso);
  }
});
test('aislamiento: no edita ni cambia acceso de otra empresa o administrador', async t => {
  const { cliente } = contexto(t);
  for (const cambio of [{ empresa: B }, { empresa: A, rol: 'admin_empresa' }]) {
    Object.assign(usuario, cambio);
    await cliente.get(`/empresa/usuarios/${objetivo}`).expect(404);
    await cliente.get(`/empresa/usuarios/${objetivo}/editar`).expect(404);
    await cliente.post(`/empresa/usuarios/${objetivo}`).send({ nombre: 'Intruso' }).expect(404);
    await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'bloqueado' }).expect(404);
  }
  assert.equal(escrituras.length, 0);
});
test('operador no administra usuarios por ninguna ruta', async t => {
  const { cliente } = contexto(t, 'operador');
  for (const prefijo of ['/empresa', '/admin']) {
    await cliente.get(`${prefijo}/usuarios/${objetivo}`).expect(403);
    await cliente.get(`${prefijo}/usuarios/${objetivo}/editar`).expect(403);
    await cliente.post(`${prefijo}/usuarios/${objetivo}`).send({}).expect(403);
    await cliente.post(`${prefijo}/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'activo' }).expect(403);
  }
  assert.equal(escrituras.length, 0);
});
test('CSRF obligatorio para editar y bloquear', async t => {
  const { cliente } = contexto(t, 'admin_empresa', { csrf: false });
  await cliente.post(`/empresa/usuarios/${objetivo}`).send({}).expect(403);
  await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'bloqueado' }).expect(403);
  assert.equal(escrituras.length, 0);
});
test('no elude verificación pendiente ni reactiva empresa inactiva', async t => {
  const { cliente } = contexto(t);
  usuario.estadoAcceso = 'pendiente_verificacion';
  empresa.estadoActivacion = 'pendiente_verificacion';
  await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'activo' }).expect(403);
  await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'bloqueado' }).expect(303);
  assert.equal(usuario.estadoAcceso, 'bloqueado');
  empresa.estado = 'inactiva';
  await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'activo' }).expect(403);
  assert.equal(escrituras.length, 1);
});
test('superadmin edita usuarios empresariales y cambia acceso globalmente', async t => {
  const { cliente } = contexto(t, 'superadmin'); usuario.empresa = B;
  await cliente.get(`/admin/usuarios/${objetivo}/editar`).expect(200);
  await cliente.post(`/admin/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'bloqueado' }).expect(303);
  assert.equal(usuario.estadoAcceso, 'bloqueado');
});

test('operadores pendientes históricos se activan explícitamente tras verificar empresa', async t => {
  const { cliente } = contexto(t);
  usuario.estadoAcceso = 'pendiente_verificacion';
  await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'activo' }).expect(303);
  assert.equal(usuario.estadoAcceso, 'activo');
});

test('superadmin no activa administrador pendiente eludiendo su correo', async t => {
  const { cliente } = contexto(t, 'superadmin');
  usuario.rol = 'admin_empresa'; usuario.estadoAcceso = 'pendiente_verificacion';
  await cliente.post(`/admin/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'activo' }).expect(403);
  await cliente.post(`/admin/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'bloqueado' }).expect(403);
  assert.equal(escrituras.length, 0);
});
test('contraseña nueva débil se rechaza sin devolverla ni guardar', async t => {
  const { cliente } = contexto(t);
  const respuesta = await cliente.post(`/empresa/usuarios/${objetivo}`).send({ nombre: 'Operador', email: usuario.email, password: 'debil' }).expect(422);
  assert.doesNotMatch(respuesta.text, /value="debil"/); assert.equal(escrituras.length, 0);
});

test('superadmin no sustituye el correo verificado ni omite CSRF', async t => {
  const { cliente } = contexto(t, 'superadmin', { csrf: false });
  await cliente.post(`/admin/usuarios/${objetivo}/estado`).send({ estadoAcceso: 'bloqueado' }).expect(403);
  assert.equal(escrituras.length, 0);
});

test('edición de administrador conserva su correo verificado', async t => {
  const { cliente } = contexto(t, 'superadmin');
  usuario.rol = 'admin_empresa'; usuario.emailVerificadoEn = new Date();
  await cliente.post(`/admin/usuarios/${objetivo}`).send({ nombre: 'Administrador', email: 'otro@example.test' }).expect(422);
  assert.equal(escrituras.length, 0);
});

test('nuevas rutas rechazan IDs y estados inválidos sin guardar', async t => {
  const { cliente } = contexto(t);
  await cliente.get('/empresa/usuarios/invalido/editar').expect(400);
  await cliente.post(`/empresa/usuarios/${objetivo}/estado`).send({ estadoAcceso: { $ne: 'activo' } }).expect(400);
  await cliente.post(`/empresa/usuarios/${objetivo}`).expect(422);
  assert.equal(escrituras.length, 0);
});

test('cambio de contraseña guarda hash bcrypt y filtra empresa y rol en escritura', async t => {
  const { cliente } = contexto(t);
  const password = 'frase-nueva-segura';
  await cliente.post(`/empresa/usuarios/${objetivo}`).send({ nombre: usuario.nombre, email: usuario.email, password }).expect(303);
  assert.notEqual(usuario.password, password);
  assert.equal(await require('bcryptjs').compare(password, usuario.password), true);
  assert.equal(String(escrituras[0].filtro.empresa), String(A));
  assert.equal(escrituras[0].filtro.rol, 'operador');
});

test('confirmación accesible se muestra una vez tras guardar', async t => {
  const { cliente } = contexto(t);
  t.mock.method(require('../services/empresaService'), 'obtenerPanel', async () => ({ empresa: { nombre: 'Empresa' }, usuarios: [], operadores: [], campanas: [], totalUsuarios: 0, totalCampanas: 0 }));
  await cliente.post(`/empresa/usuarios/${objetivo}`).send({ nombre: usuario.nombre, email: usuario.email }).expect(303);
  const panel = await cliente.get('/panel').expect(200);
  assert.match(panel.text, /role="status">Los datos del usuario se guardaron correctamente/);
  const siguiente = await cliente.get('/panel').expect(200);
  assert.doesNotMatch(siguiente.text, /Los datos del usuario se guardaron correctamente/);
});
