const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const session = require('express-session');
process.env.SESSION_SECRET = 'secreto-exclusivo-fixture-navegacion';
const { crearContexto } = require('./soporte/sesion');
const Usuario = require('../models/Usuario');
const id = '507f1f77bcf86cd799439011', empresa = { _id: '507f1f77bcf86cd799439012', nombre: 'Empresa fixture' };
const actor = rol => ({ _id: id, nombre: 'Persona fixture', email: 'persona@example.test', rol, empresa: rol === 'superadmin' ? null : empresa });
for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
  test(`navegacion ${rol}: Inicio conserva identidad, no ofrece login/registro y logout revoca`, async t => {
    const c = crearContexto(t, actor(rol));
    const inicio = await c.cliente.get('/').expect(200);
    assert.match(inicio.text, /Ir a mi panel/);assert.match(inicio.text, /Cerrar sesión/);
    assert.doesNotMatch(inicio.text, /href="\/(login|registro)"/);
    assert.match(inicio.headers['cache-control'], /no-store/);
    await c.cliente.get('/login').expect(302).expect('Location', '/panel');
    await c.cliente.get('/registro').expect(303).expect('Location', '/panel');
    const salida = await c.cliente.post('/logout').type('form').send({ _csrf: rol === 'superadmin' ? c.adminCsrf : c.campanaCsrf }).expect(303);
    assert.match(salida.headers['set-cookie'][0], /^marketing\.sid=;/);
    await c.cliente.get('/panel').expect(302).expect('Location', '/login');
    const anonimo = await c.cliente.get('/').expect(200);assert.match(anonimo.text, /Iniciar sesión/);
    assert.equal(anonimo.headers['set-cookie'], undefined);
  });
  test(`navegacion ${rol}: menu interno segun rol sin ampliar privilegios`, async t => {
    t.mock.method(require('../services/adminService'), 'obtenerDashboard', async () => ({ totales: { empresas: 0, usuarios: 0, campanas: 0 }, empresas: [], usuariosSinEmpresa: [], usuariosEmpresaInexistente: [], campanasSinEmpresa: [] }));
    t.mock.method(require('../services/empresaService'), 'obtenerPanel', async () => ({ empresa, campanas: [], usuarios: [], operadores: [], totalUsuarios: 0, totalCampanas: 0 }));
    const c = crearContexto(t, actor(rol)), panel = await c.cliente.get('/panel').expect(200);
    assert.match(panel.text, /css\/interno.css/);assert.match(panel.text, /aria-current="page"/);
    assert.equal(panel.text.includes('href="/empresa/gmail"'), rol === 'admin_empresa');
    assert.equal(panel.text.includes('href="/admin/empresas/nueva"'), rol === 'superadmin');
    assert.equal(panel.text.includes('href="/empresa/usuarios/nuevo"'), rol === 'admin_empresa');
    if (rol !== 'superadmin') await c.cliente.get('/admin/empresas/nueva').expect(403);
    if (rol !== 'admin_empresa') await c.cliente.get('/empresa/gmail').expect(403);
  });
}
test('navegacion anonima: Inicio no crea sesiones; caducada vuelve a login sin recrear al visitar inicio', async t => {
  const c = crearContexto(t, actor('operador'));await new Promise(resolve => c.store.clear(resolve));
  const inicio = await c.cliente.get('/').expect(200);assert.match(inicio.text, /Iniciar sesión/);
  assert.equal(inicio.headers['set-cookie'], undefined);await c.cliente.get('/panel').expect(302).expect('Location', '/login');
  const datos = await new Promise(resolve => c.store.all((e,r) => resolve(r)));assert.equal(Object.keys(datos).length, 0);
});
test('usuarios empresa: CSRF ausente o ajeno bloquea antes de escribir; formulario contiene su token', async t => {
  const c = crearContexto(t, actor('admin_empresa'), { csrf: false });
  const guardar = t.mock.method(Usuario, 'create', () => { throw Error('NO_DEBE_ESCRIBIR'); });
  const pagina = await c.cliente.get('/empresa/usuarios/nuevo').expect(200);
  assert.match(pagina.text, new RegExp(`name="_csrf" value="${c.campanaCsrf}"`));
  for (const _csrf of [undefined, 'a'.repeat(43)]) await c.cliente.post('/empresa/usuarios').send({ nombre: 'Persona', email: 'persona@example.test', password: 'fixture', _csrf }).expect(403);
  assert.equal(guardar.mock.callCount(), 0);
});
test('logout piloto: invalida la sesion y expira la cookie configurada, sin tocar marketing.sid', async t => {
  const store = new session.MemoryStore();t.after(() => store.clear());
  const app = require('../appFactory').crearApp({ secret: 'secreto-aislado-cookie-piloto', entorno: 'test', store, nombreCookie: 'marketing.piloto.sid' });
  t.mock.method(require('../services/loginLimitesService'), 'consumir', async () => {});
  t.mock.method(Usuario, 'findOne', () => ({ select: async () => ({ _id: id, compararPassword: async () => true }) }));
  t.mock.method(Usuario, 'findById', () => ({ select: () => ({ populate: () => ({ lean: async () => actor('operador') }) }) }));
  const agente = request.agent(app), login = await agente.get('/login').expect(200);
  const campo = html => html.match(/name="_csrf" value="([^"]+)"/)[1];
  await agente.post('/login').type('form').send({ email: 'persona@example.test', password: 'fixture-no-productiva', _csrf: campo(login.text) }).expect(303);
  const inicio = await agente.get('/').expect(200);
  const salida = await agente.post('/logout').type('form').send({ _csrf: campo(inicio.text) }).expect(303);
  assert.match(salida.headers['set-cookie'][0], /^marketing\.piloto\.sid=;/);
  assert.doesNotMatch(salida.headers['set-cookie'].join(' '), /(?:^| )marketing\.sid=/);
  await agente.get('/panel').expect(302).expect('Location', '/login');
});
