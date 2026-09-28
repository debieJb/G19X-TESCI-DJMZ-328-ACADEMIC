const { test, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const request = require('supertest');
process.env.SESSION_SECRET = 'secreto-exclusivo-de-pruebas-auth';
const { crearApp } = require('../app');
const Usuario = require('../models/Usuario');
const crearSesion = require('../config/session');
const id = '507f1f77bcf86cd799439011';
const password = 'contraseña-solo-de-prueba';
let hash, usuario, store, app, consultas;
before(async () => { hash = await bcrypt.hash(password, 4); });
beforeEach(t => {
  t.mock.method(require('../services/empresaService'), 'obtenerPanel', async actual => ({ empresa: actual.empresa, campanas: [], usuarios: [], operadores: [], totalUsuarios: 0, totalCampanas: 0 }));
  t.mock.method(require('../services/adminService'), 'obtenerDashboard', async () => ({
    totales: { empresas: 0, usuarios: 1, campanas: 0 }, empresas: [], usuariosSinEmpresa: [], usuariosEmpresaInexistente: [], campanasSinEmpresa: []
  }));
  usuario = Usuario.hydrate({ _id: id, nombre: 'Persona', email: 'persona@example.test', rol: 'superadmin', password: hash });
  store = new session.MemoryStore();
  app = crearApp({ secret: process.env.SESSION_SECRET, store });
  consultas = 0;
  t.mock.method(mongoose, 'connect', () => { throw new Error('Sin conexiones reales'); });
  t.mock.method(Usuario, 'findOne', filtro => {
    assert.deepEqual(Object.keys(filtro), ['email']);
    return { select: async seleccion => {
      assert.equal(seleccion, '+password');
      return filtro.email === 'persona@example.test' ? usuario : null;
    } };
  });
  t.mock.method(Usuario, 'findById', valor => {
    assert.equal(valor, id);
    consultas++;
    return { select: seleccion => {
      assert.equal(seleccion, 'nombre email rol empresa');
      return { populate: (campo, campos) => {
        assert.equal(campo, 'empresa'); assert.equal(campos, 'nombre');
        return { lean: async () => usuario ? { ...usuario.toObject(), empresa: usuario.empresa, password: hash } : null };
      } };
    } };
  });
});
afterEach(() => store.clear());
const entrar = agente => agente.post('/login').type('form').send({ email: ' PERSONA@EXAMPLE.TEST ', password, rol: 'operador', empresa: id });
const sesiones = () => new Promise((resolve, reject) => store.all((error, datos) => error ? reject(error) : resolve(datos)));

test('auth: sesión solo con usuarioId, cookie segura para desarrollo y panel', async () => {
  const agente = request.agent(app);
  const respuesta = await entrar(agente).expect(303).expect('Location', '/panel');
  const cookie = respuesta.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.doesNotMatch(cookie, /Secure/);
  const datos = Object.values(await sesiones())[0];
  assert.deepEqual(Object.keys(datos).sort(), ['cookie', 'usuarioId']);
  assert.equal(datos.usuarioId, id);
  assert.ok(!JSON.stringify(datos).includes(password)); assert.ok(!JSON.stringify(datos).includes(hash));
  const panel = await agente.get('/panel').expect(200);
  for (const texto of ['Persona', 'persona@example.test', 'superadmin', 'Cerrar sesión']) assert.ok(panel.text.includes(texto));
  assert.ok(!panel.text.includes(hash)); assert.ok(!panel.text.includes(password));
  assert.match(panel.headers['cache-control'], /no-store/);
  await agente.get('/login').expect(302).expect('Location', '/panel');
  assert.equal(consultas, 2);
});

test('auth: usuario anónimo redirigido y GET login disponible sin crear sesión', async () => {
  await request(app).get('/panel').expect(302).expect('Location', '/login');
  await request(app).get('/login').expect(200);
  assert.equal(Object.keys(await sesiones()).length, 0);
});

test('auth: errores genéricos para contraseña incorrecta, usuario inexistente y datos inválidos', async () => {
  for (const datos of [
    { email: 'persona@example.test', password: 'incorrecta' },
    { email: 'ausente@example.test', password },
    { email: { $ne: null }, password }, {}, { email: 'persona@example.test', password: 'á'.repeat(37) }
  ]) {
    const respuesta = await request(app).post('/login').send(datos).expect(401);
    assert.match(respuesta.text, /Correo o contraseña incorrectos/);
    assert.ok(!respuesta.text.includes(hash));
    assert.equal(respuesta.headers['set-cookie'], undefined);
  }
  assert.equal(Object.keys(await sesiones()).length, 0);
});

test('auth: contraseña en texto plano heredada no permite acceso', async () => {
  usuario.password = password;
  await entrar(request.agent(app)).expect(401);
});

test('auth: los tres roles acceden al panel y los datos se recargan', async () => {
  for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
    usuario.rol = rol;
    usuario.empresa = new mongoose.Types.ObjectId(id);
    const agente = request.agent(app);
    await entrar(agente).expect(303);
    usuario.nombre = 'Nombre actualizado';
    const panel = await agente.get('/panel').expect(200);
    assert.ok(panel.text.includes(rol));
    assert.match(panel.text, /Nombre actualizado/);
  }
});

test('auth: panel muestra empresa poblada y escapa nombre', async () => {
  usuario = { _id: new mongoose.Types.ObjectId(id), empresa: { _id: id, nombre: 'Empresa <script>' },
    compararPassword: valor => bcrypt.compare(valor, hash),
    toObject: () => ({ nombre: '<script>Nombre</script>', email: 'persona@example.test', rol: 'operador' }) };
  const agente = request.agent(app);
  await entrar(agente).expect(303);
  const panel = await agente.get('/panel').expect(200);
  assert.match(panel.text, /Empresa &lt;script&gt;/);
  assert.match(panel.text, /&lt;script&gt;Nombre/);
});

test('auth: regenerar sesión invalida la anterior', async () => {
  const agente = request.agent(app);
  const primera = await entrar(agente).expect(303);
  const vieja = primera.headers['set-cookie'][0].split(';')[0];
  const segunda = await entrar(agente).expect(303);
  assert.notEqual(vieja, segunda.headers['set-cookie'][0].split(';')[0]);
  assert.equal(Object.keys(await sesiones()).length, 1);
  await request(app).get('/panel').set('Cookie', vieja).expect(302).expect('Location', '/login');
});

test('auth: usuario eliminado destruye sesión y pierde acceso', async () => {
  const agente = request.agent(app);
  await entrar(agente).expect(303);
  usuario = null;
  await agente.get('/panel').expect(302).expect('Location', '/login');
  assert.equal(Object.keys(await sesiones()).length, 0);
  await agente.get('/login').expect(200);
});

test('auth: logout POST destruye sesión; GET no cierra sesión', async () => {
  const agente = request.agent(app);
  await entrar(agente).expect(303);
  await agente.get('/logout').expect(404);
  await agente.get('/panel').expect(200);
  const salida = await agente.post('/logout').expect(303).expect('Location', '/');
  assert.match(salida.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  assert.equal(Object.keys(await sesiones()).length, 0);
  await agente.get('/panel').expect(302).expect('Location', '/login');
});

test('sesiones: exige secreto y prohíbe MemoryStore en producción', () => {
  assert.throws(() => crearSesion({ secret: '' }), /SESSION_SECRET/);
  assert.throws(() => crearSesion({ secret: 'prueba', entorno: 'production' }), /producción/);
});
