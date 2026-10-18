const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'secreto-exclusivo-pruebas-admin';
const { crearApp } = require('../app');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const adminService = require('../services/adminService');
const id = '507f1f77bcf86cd799439011';
const empresaId = '507f1f77bcf86cd799439012';
const empresa = { _id: empresaId, nombre: 'Empresa ejemplo', estado: 'activa', fechaRegistro: new Date('2026-01-01') };
const password = 'PASSWORD_PRIVADO_PRUEBA';
const entrada = { nombre: ' Nueva persona ', email: ' NUEVA@EXAMPLE.TEST ', password, rol: 'operador', empresa: empresaId };
let app, store, usuarioActual, dashboard, detalle, guardarEmpresa, guardarUsuario, existeEmpresa, obtenerDetalle;
beforeEach(t => {
  t.mock.method(require('../services/loginLimitesService'), 'consumir', async () => {});
  t.mock.method(require('../services/empresaService'), 'obtenerPanel', async actual => ({ empresa: actual.empresa, campanas: [], usuarios: [], operadores: [], totalUsuarios: 0, totalCampanas: 0 }));
  store = new session.MemoryStore();
  app = crearApp({ secret: process.env.SESSION_SECRET, store });
  usuarioActual = { _id: id, nombre: 'Admin', email: 'admin@example.test', rol: 'superadmin', empresa: null };
  t.mock.method(mongoose, 'connect', () => { throw new Error('Conexión real prohibida'); });
  t.mock.method(Usuario, 'findOne', () => ({ select: async () => ({ _id: id, compararPassword: async () => true }) }));
  t.mock.method(Usuario, 'findById', () => ({ select: () => ({ populate: () => ({ lean: async () => usuarioActual }) }) }));
  dashboard = {
    totales: { empresas: 2, usuarios: 3, campanas: 5 },
    empresas: [{ ...empresa, totalUsuarios: 1, totalCampanas: 4, usuarios: [{ nombre: 'Persona agrupada', email: 'persona@example.test', rol: 'operador', password }] }],
    usuariosSinEmpresa: [usuarioActual, { nombre: 'Huérfano', email: 'h@example.test', rol: 'operador' }],
    usuariosEmpresaInexistente: [],
    campanasSinEmpresa: [{ _id: id, nombre: 'Campaña antigua', estado: 'borrador' }]
  };
  detalle = { empresa, usuarios: [{ nombre: 'Persona agrupada', email: 'persona@example.test', rol: 'operador', password }], campanas: [
    { _id: id, nombre: 'Campaña con autor', estado: 'activa', canal: 'email', creadoPor: { nombre: 'Autor existente', password } },
    { _id: id, nombre: 'Campaña sin campo', estado: 'borrador' },
    { _id: id, nombre: 'Campaña null', estado: 'borrador', creadoPor: null }
  ] };
  t.mock.method(adminService, 'obtenerDashboard', async () => dashboard);
  obtenerDetalle = t.mock.method(adminService, 'obtenerDetalleEmpresa', async () => detalle);
  t.mock.method(adminService, 'listarEmpresas', async () => [empresa]);
  existeEmpresa = t.mock.method(Empresa, 'exists', async filtro => filtro._id === empresaId ? { _id: empresaId } : null);
  guardarEmpresa = t.mock.method(Empresa.collection, 'insertOne', async datos => ({ insertedId: datos._id }));
  guardarUsuario = t.mock.method(Usuario.collection, 'insertOne', async datos => ({ insertedId: datos._id }));
});
afterEach(() => store.clear());
const autenticar = async () => {
  const agente = request.agent(app);
  const pagina = await agente.get('/login');
  const _csrf = pagina.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await agente.post('/login').send({ email: 'admin@example.test', password: 'solo-login-prueba', _csrf }).expect(303);
  if (usuarioActual.rol === 'superadmin') {
    const formulario = await agente.get('/admin/empresas/nueva').expect(200);
    const token = formulario.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)[1];
    const post = agente.post.bind(agente);
    agente.post = ruta => post(ruta).set('X-CSRF-Token', token);
  }
  return agente;
};

test('admin: dashboard muestra totales, agrupaciones, recursos antiguos y navegación', async () => {
  const agente = await autenticar();
  const { text } = await agente.get('/panel').expect(200);
  for (const contenido of ['Total empresas', 'Total usuarios', 'Total campañas', 'Empresa ejemplo', 'Persona agrupada', 'Usuarios sin empresa', 'Superadministrador', 'Huérfano', 'Usuario sin empresa asignada', 'Campañas sin empresa', 'Campaña antigua', 'Nueva empresa', 'Nuevo usuario', 'Ver campañas', 'Cerrar sesión']) assert.ok(text.includes(contenido), contenido);
  for (const total of [2, 3, 5]) assert.ok(text.includes(`class="total-admin">${total}</p>`));
  assert.match(text, /<td>1<\/td><td>4<\/td>/);
  assert.ok(!text.includes(password));
});

test('admin: detalle con autores y referencias ausentes, sin passwords', async () => {
  const agente = await autenticar();
  const { text } = await agente.get(`/admin/empresas/${empresaId}`).expect(200);
  assert.match(text, /Empresa ejemplo/); assert.match(text, /Persona agrupada/);
  assert.match(text, /Autor existente/);
  assert.equal((text.match(/Sin autor disponible/g) || []).length, 2);
  assert.ok(!text.includes(password));
  assert.equal(obtenerDetalle.mock.calls[0].arguments[0], empresaId);
});

test('admin: empresa vacía y dashboard vacío muestran mensajes', async () => {
  detalle.usuarios = []; detalle.campanas = [];
  const agente = await autenticar();
  const { text } = await agente.get(`/admin/empresas/${empresaId}`).expect(200);
  assert.match(text, /No hay usuarios registrados/); assert.match(text, /No hay campañas registradas/);
  dashboard = { totales: { empresas: 0, usuarios: 0, campanas: 0 }, empresas: [], usuariosSinEmpresa: [], usuariosEmpresaInexistente: [], campanasSinEmpresa: [] };
  await agente.get('/panel').expect(200);
});

test('admin: identificador inválido 400 antes de consultar; inexistente 404', async () => {
  const agente = await autenticar();
  for (const valor of ['invalido', 'z'.repeat(24), empresaId + '%0A']) await agente.get(`/admin/empresas/${valor}`).expect(400);
  assert.equal(obtenerDetalle.mock.callCount(), 0);
  detalle = null;
  await agente.get(`/admin/empresas/${empresaId}`).expect(404);
});

test('admin: todas las rutas exigen sesión y rol obtenido del servidor', async () => {
  const rutas = [['get', '/admin/empresas/nueva'], ['post', '/admin/empresas'], ['get', `/admin/empresas/${empresaId}`], ['get', '/admin/usuarios/nuevo'], ['post', '/admin/usuarios']];
  for (const [metodo, ruta] of rutas) await request(app)[metodo](ruta).expect(302).expect('Location', '/login');
  for (const rol of ['admin_empresa', 'operador']) {
    usuarioActual.rol = rol;
    usuarioActual.empresa = { _id: empresaId, nombre: 'Empresa' };
    const agente = await autenticar();
    for (const [metodo, ruta] of rutas) {
      await agente[metodo](ruta).send({ ...entrada, rol: 'superadmin', usuarioActual: { rol: 'superadmin' } }).expect(403);
    }
    const panel = await agente.get('/panel').expect(200);
    assert.ok(!panel.text.includes('Total empresas'));
  }
  assert.equal(guardarEmpresa.mock.callCount(), 0); assert.equal(guardarUsuario.mock.callCount(), 0);
  assert.equal(obtenerDetalle.mock.callCount(), 0);
});

test('admin: formularios disponibles, empresa inicial activa y roles limitados', async () => {
  const agente = await autenticar();
  const nueva = await agente.get('/admin/empresas/nueva').expect(200);
  assert.match(nueva.text, /value="activa" selected/);
  assert.match(nueva.text, /name="_csrf" value="[A-Za-z0-9_-]{43}"/);
  const nuevo = await agente.get('/admin/usuarios/nuevo').expect(200);
  assert.match(nuevo.text, /value="admin_empresa"/); assert.match(nuevo.text, /value="operador"/);
  assert.ok(!nuevo.text.includes('value="superadmin"'));
  assert.match(nuevo.text, /autocomplete="new-password"/);
  assert.match(nuevo.text, /name="_csrf" value="[A-Za-z0-9_-]{43}"/);
});

test('admin: empresa válida usa lista blanca y fecha automática', async () => {
  const agente = await autenticar();
  for (const estado of ['activa', 'inactiva']) {
    const respuesta = await agente.post('/admin/empresas').send({ nombre: ' Nueva empresa ', estado, _id: id, fechaRegistro: '2000-01-01', rol: 'superadmin' }).expect(303);
    assert.match(respuesta.headers.location, /^\/admin\/empresas\/[a-f\d]{24}$/);
  }
  const datos = guardarEmpresa.mock.calls[0].arguments[0];
  assert.equal(datos.nombre, 'Nueva empresa'); assert.notEqual(String(datos._id), id);
  assert.ok(datos.fechaRegistro.getFullYear() !== 2000); assert.equal(datos.rol, undefined);
});

test('admin: empresa inválida rechazada sin escrituras', async () => {
  const agente = await autenticar();
  for (const datos of [{ nombre: '', estado: 'activa' }, { nombre: '   ', estado: 'activa' }, { nombre: 'Empresa', estado: 'otro' }, { nombre: { $ne: null }, estado: 'activa' }, { nombre: 'Empresa', estado: ['activa'] }]) {
    await agente.post('/admin/empresas').send(datos).expect(422);
  }
  assert.equal(guardarEmpresa.mock.callCount(), 0);
});

for (const rol of ['admin_empresa', 'operador']) {
  test(`admin: crear ${rol} aplica hash y lista blanca`, async () => {
    const agente = await autenticar();
    const respuesta = await agente.post('/admin/usuarios').send({ ...entrada, rol, _id: id, admin: true, usuario: { rol: 'superadmin' } }).expect(303).expect('Location', `/admin/empresas/${empresaId}`);
    const datos = guardarUsuario.mock.calls[0].arguments[0];
    assert.equal(datos.rol, rol); assert.equal(String(datos.empresa), empresaId);
    assert.equal(datos.nombre, 'Nueva persona'); assert.equal(datos.email, 'nueva@example.test');
    assert.equal(datos.admin, undefined); assert.equal(datos.usuario, undefined); assert.notEqual(String(datos._id), id);
    assert.notEqual(datos.password, password); assert.equal(await bcrypt.compare(password, datos.password), true);
    assert.ok(!respuesta.text.includes(password)); assert.ok(!respuesta.text.includes(datos.password));
  });
  test(`admin: ${rol} exige empresa válida y existente`, async () => {
    const agente = await autenticar();
    for (const empresa of [undefined, '', null, 'invalida', id, { _id: empresaId }, [empresaId]]) {
      const respuesta = await agente.post('/admin/usuarios').send({ ...entrada, rol, empresa }).expect(422);
      assert.ok(!respuesta.text.includes(password));
    }
    assert.equal(guardarUsuario.mock.callCount(), 0);
  });
}

test('admin: superadmin y roles manipulados rechazados sin mostrar contraseña', async () => {
  const agente = await autenticar();
  for (const rol of ['superadmin', 'otro', ['operador'], { valor: 'operador' }, undefined]) {
    const respuesta = await agente.post('/admin/usuarios').send({ ...entrada, rol }).expect(422);
    assert.ok(!respuesta.text.includes(password));
    assert.doesNotMatch(respuesta.text, /type="password"[^>]*value=/);
  }
  assert.equal(guardarUsuario.mock.callCount(), 0);
});

test('admin: valida nombre, email y password sin devolver secretos', async () => {
  const agente = await autenticar();
  for (const cambios of [{ nombre: '' }, { email: 'invalido' }, { password: '' }, { password: 'á'.repeat(37) }, { password: { texto: password } }]) {
    const respuesta = await agente.post('/admin/usuarios').send({ ...entrada, ...cambios }).expect(422);
    assert.ok(!respuesta.text.includes(password));
  }
  assert.equal(guardarUsuario.mock.callCount(), 0);
});

test('admin: duplicados y errores no exponen contraseña ni detalles internos', async t => {
  const agente = await autenticar();
  const logs = t.mock.method(console, 'error', () => {});
  for (const [code, status] of [[11000, 422], [undefined, 500]]) {
    guardarUsuario.mock.mockImplementation(async () => { throw Object.assign(new Error(password), { code }); });
    const respuesta = await agente.post('/admin/usuarios').send(entrada).expect(status);
    assert.ok(!respuesta.text.includes(password));
  }
  assert.ok(!JSON.stringify(logs.mock.calls.map(llamada => llamada.arguments)).includes(password));
});
