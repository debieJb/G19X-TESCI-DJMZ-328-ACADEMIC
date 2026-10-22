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
  t.mock.method(require('../services/loginLimitesService'), 'consumir', async () => {});
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
      assert.equal(seleccion, 'nombre email rol empresa estadoAcceso versionSesion');
      return { populate: (campo, campos) => {
        assert.equal(campo, 'empresa'); assert.equal(campos, 'nombre');
        return { lean: async () => usuario ? { ...usuario.toObject(), empresa: usuario.empresa, password: hash } : null };
      } };
    } };
  });
});
afterEach(() => store.clear());
const entrar = async (agente, status = 303, datos = { email: ' PERSONA@EXAMPLE.TEST ', password, rol: 'operador', empresa: id }) => {
  const pagina = await agente.get('/login');
  const _csrf = pagina.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const r = await agente.post('/login').type('form').send({ ...datos, _csrf }).expect(status);
  if (status === 303) assert.equal(r.headers.location, '/panel');
  return r;
};
const sesiones = () => new Promise((resolve, reject) => store.all((error, datos) => error ? reject(error) : resolve(datos)));

test('auth: sesión con ID y versión de acceso, cookie segura para desarrollo y panel', async () => {
  const agente = request.agent(app);
  const respuesta = await entrar(agente);
  const cookie = respuesta.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.doesNotMatch(cookie, /Secure/);
  const datos = Object.values(await sesiones())[0];
  assert.deepEqual(Object.keys(datos).sort(), ['cookie', 'usuarioId', 'versionSesion']);
  assert.equal(datos.versionSesion, 0);
  assert.equal(datos.usuarioId, id);
  assert.ok(!JSON.stringify(datos).includes(password)); assert.ok(!JSON.stringify(datos).includes(hash));
  const panel = await agente.get('/panel').expect(200);
  for (const texto of ['Persona', 'persona@example.test', 'superadmin', 'Cerrar sesión']) assert.ok(panel.text.includes(texto));
  assert.ok(!panel.text.includes(hash)); assert.ok(!panel.text.includes(password));
  assert.match(panel.headers['cache-control'], /no-store/);
  await agente.get('/login').expect(302).expect('Location', '/panel');
  assert.equal(consultas, 2);
});

test('auth: usuario anónimo redirigido y GET login crea solo sesión CSRF', async () => {
  await request(app).get('/panel').expect(302).expect('Location', '/login');
  await request(app).get('/login').expect(200);
  assert.deepEqual(Object.keys(Object.values(await sesiones())[0]).sort(), ['authCsrf', 'cookie']);
});

test('auth: errores genéricos para contraseña incorrecta, usuario inexistente y datos inválidos', async () => {
  for (const datos of [
    { email: 'persona@example.test', password: 'incorrecta' },
    { email: 'ausente@example.test', password },
    { email: { $ne: null }, password }, {}, { email: 'persona@example.test', password: 'á'.repeat(37) }
  ]) {
    const respuesta = await entrar(request.agent(app), 401, datos);
    assert.match(respuesta.text, /Correo o contraseña incorrectos/);
    assert.ok(!respuesta.text.includes(hash));
    assert.equal(respuesta.headers['set-cookie'], undefined);
  }
  assert.ok(Object.values(await sesiones()).every(s => !s.usuarioId));
});

test('auth: login rechaza usuarios pendientes y bloqueados sin revelar el estado', async () => {
  for (const estadoAcceso of ['pendiente_verificacion', 'bloqueado']) {
    usuario.estadoAcceso = estadoAcceso;
    const respuesta = await entrar(request.agent(app), 401);
    assert.match(respuesta.text, /Correo o contraseña incorrectos/);
    assert.equal(respuesta.headers['set-cookie'], undefined);
    assert.ok(Object.values(await sesiones()).every(s => !s.usuarioId));
  }
  usuario.estadoAcceso = undefined;
});

test('auth: revoca una sesión existente al bloquear al usuario y conserva acceso histórico sin estado', async () => {
  const agente = request.agent(app);
  await entrar(agente);
  usuario.estadoAcceso = 'bloqueado';
  await agente.get('/panel').expect(302).expect('Location', '/login');
  assert.equal(Object.keys(await sesiones()).length, 0);

  usuario.estadoAcceso = undefined;
  const historico = request.agent(app);
  await entrar(historico);
  await historico.get('/panel').expect(200);
});

test('auth: contraseña en texto plano heredada no permite acceso', async () => {
  usuario.password = password;
  await entrar(request.agent(app), 401);
});

test('auth: los tres roles acceden al panel y los datos se recargan', async () => {
  for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
    usuario.rol = rol;
    usuario.empresa = new mongoose.Types.ObjectId(id);
    const agente = request.agent(app);
    await entrar(agente);
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
  await entrar(agente);
  const panel = await agente.get('/panel').expect(200);
  assert.match(panel.text, /Empresa &lt;script&gt;/);
  assert.match(panel.text, /&lt;script&gt;Nombre/);
});

test('auth: regenerar sesión invalida la anterior', async () => {
  const agente = request.agent(app);
  const paginaLogin = await agente.get('/login').expect(200);
  const vieja = paginaLogin.headers['set-cookie'][0].split(';')[0];
  const _csrf = paginaLogin.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const segunda = await agente.post('/login').send({ email: 'persona@example.test', password, _csrf }).expect(303);
  assert.notEqual(vieja, segunda.headers['set-cookie'][0].split(';')[0]);
  assert.equal(Object.keys(await sesiones()).length, 1);
  await request(app).get('/panel').set('Cookie', vieja).expect(302).expect('Location', '/login');
  await agente.get('/panel').expect(200);
  assert.notEqual(Object.values(await sesiones())[0].adminCsrf, _csrf);
  await agente.post('/logout').send({ _csrf }).expect(403);
});

test('auth: usuario eliminado destruye sesión y pierde acceso', async () => {
  const agente = request.agent(app);
  await entrar(agente);
  usuario = null;
  await agente.get('/panel').expect(302).expect('Location', '/login');
  assert.equal(Object.keys(await sesiones()).length, 0);
  await agente.get('/login').expect(200);
});

test('auth: logout POST destruye sesión; GET no cierra sesión', async () => {
  const agente = request.agent(app);
  await entrar(agente);
  await agente.get('/logout').expect(404);
  await agente.get('/panel').expect(200);
  const token = Object.values(await sesiones())[0].adminCsrf;
  const salida = await agente.post('/logout').send({ _csrf: token }).expect(303).expect('Location', '/');
  assert.match(salida.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  assert.equal(Object.keys(await sesiones()).length, 0);
  await agente.get('/panel').expect(302).expect('Location', '/login');
});

test('sesiones: exige secreto y prohíbe MemoryStore en producción', () => {
  assert.throws(() => crearSesion({ secret: '' }), /SESSION_SECRET/);
  assert.throws(() => crearSesion({ secret: 'prueba', entorno: 'production' }), /producción/);
});

test('auth: CSRF ausente y de otra sesión no consultan credenciales', async t => {
  const consulta = t.mock.method(Usuario, 'findOne', () => { throw Error('NO_DEBE_CONSULTAR'); });
  await request(app).post('/login').send({ email: 'persona@example.test', password }).expect(403);
  const pagina = await request.agent(app).get('/login');
  const _csrf = pagina.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await request.agent(app).post('/login').send({ email: 'persona@example.test', password, _csrf }).expect(403);
  assert.equal(consulta.mock.callCount(), 0);
});
test('auth: límite y backend no disponible no autentican ni consultan usuario', async t => {
  const consulta = t.mock.method(Usuario, 'findOne', () => { throw Error('NO_DEBE_CONSULTAR'); });
  for (const limitado of [true, false]) {
    t.mock.method(require('../services/loginLimitesService'), 'consumir', async () => { throw Object.assign(Error('fallo'), limitado ? { codigo: 'LIMITE_LOGIN' } : {}); });
    const r = await entrar(request.agent(app), limitado ? 429 : 503);
    if (limitado) assert.equal(r.headers['retry-after'], '900');
  }
  assert.equal(consulta.mock.callCount(), 0);
  assert.ok(Object.values(await sesiones()).every(s => !s.usuarioId));
});

test('auth: una sesión caducada en el almacén pierde acceso y puede volver al login', async () => {
  const agente = request.agent(app);
  await entrar(agente);
  const datos = await sesiones(), sid = Object.keys(datos)[0];
  const sesionCaducada = datos[sid]; sesionCaducada.cookie.expires = new Date(Date.now() - 1000);
  await new Promise((resolve, reject) => store.set(sid, sesionCaducada, e => e ? reject(e) : resolve()));
  await agente.get('/panel').expect(302).expect('Location', '/login');
  const login = await agente.get('/login').expect(200);
  assert.match(login.text, /Si tu sesión caducó/); assert.ok(!login.text.includes(password));
});

test('auth: logout empresarial exige CSRF propio del panel', async () => {
  usuario.rol = 'admin_empresa'; usuario.empresa = new mongoose.Types.ObjectId(id);
  const agente = request.agent(app); await entrar(agente);
  const panel = await agente.get('/panel').expect(200);
  const _csrf = panel.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await agente.post('/logout').send({}).expect(403);
  await agente.post('/logout').send({ _csrf: 'a'.repeat(43) }).expect(403);
  await agente.get('/panel').expect(200);
  await agente.post('/logout').send({ _csrf }).expect(303).expect('Location', '/');
  await agente.get('/panel').expect(302).expect('Location', '/login');
});
