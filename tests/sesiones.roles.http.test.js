const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const ejs = require('ejs');
const path = require('node:path');
const { crearFixture } = require('./soporte/sesionesFixture.cjs');
const { fixture, vistas } = require('./soporte/internoFixtures.cjs');
let c;
beforeEach(async t => { c = await crearFixture(t); });
const cookie = res => res.headers['set-cookie']?.[0].split(';')[0];
const csrf = html => html.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)[1];
const entrar = async (rol, agente = request.agent(c.app)) => {
  const login = await agente.get('/login').expect(200);
  const entrada = await agente.post('/login').send({ email: `${rol}@example.test`, password: c.password, _csrf: csrf(login.text), rol: 'superadmin', empresa: String(c.empresas[1]._id) }).expect(303).expect('Location', '/panel');
  return { agente, anterior: cookie(login), actual: cookie(entrada) };
};
const sinCache = res => {
  assert.match(res.headers['cache-control'], /no-store/);
  assert.equal(res.headers.pragma, 'no-cache'); assert.equal(res.headers.expires, '0');
  assert.match(res.headers.vary, /Cookie/);
};
const rutas = () => ['/panel', '/campanas', '/campanas/nueva', `/campanas/${c.campanas[0]._id}`, `/campanas/${c.campanas[0]._id}/editar`, '/contactos', '/contactos/nuevo', `/contactos/${c.contactos[0]._id}/editar`, '/empresa/ia'];
for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
  test(`sesión ${rol}: login regenera ID, panel real y formulario antiguo no sustituye identidad`, async () => {
    const { agente, anterior, actual } = await entrar(rol);
    assert.notEqual(anterior, actual);
    await request(c.app).get('/panel').set('Cookie', anterior).expect(302).expect('Location', '/login');
    const datos = Object.values(await c.sesiones()).find(s => s.usuarioId);
    assert.equal(datos.usuarioId, String(c.usuarios.find(u => u.rol === rol)._id));
    const panel = await agente.get('/panel').expect(200); sinCache(panel);
    assert.equal(panel.text.includes('Panel superadmin'), rol === 'superadmin');
    assert.equal(panel.text.includes('Usuarios de tu empresa'), rol === 'admin_empresa');
    const sesionesAntes = Object.keys(await c.sesiones());
    for (const metodo of ['get', 'head', 'post']) {
      const peticion = agente[metodo]('/login');
      if (metodo === 'post') peticion.send({ email: 'superadmin@example.test', password: c.password, rol: 'superadmin', _csrf: 'invalido' });
      const respuesta = await peticion.expect(metodo === 'post' ? 303 : 302).expect('Location', '/panel');
      assert.equal(cookie(respuesta), undefined); sinCache(respuesta);
    }
    assert.deepEqual(Object.keys(await c.sesiones()), sesionesAntes);
    assert.equal(Object.values(await c.sesiones()).find(s => s.usuarioId).usuarioId, datos.usuarioId);
    const inicio = await agente.get('/').expect(200);
    assert.doesNotMatch(inicio.text, /href="\/(login|registro)"/);
    assert.equal((inicio.text.match(/action="\/logout"/g) || []).length, 1);
  });
  test(`sesión ${rol}: navegación, CSRF de logout, cookie revocada y nuevo login`, async () => {
    const { agente, actual } = await entrar(rol);
    for (const ruta of rutas().filter(r => rol !== 'superadmin' || r !== '/empresa/ia')) {
      const res = await agente.get(ruta); assert.equal(res.status, 200, ruta); sinCache(res);
      assert.equal((res.text.match(/action="\/logout"/g) || []).length, 1, ruta);
    }
    const pagina = await agente.get('/contactos/nuevo').expect(200);
    await agente.get('/logout').expect(404);
    for (const _csrf of [undefined, 'a'.repeat(43)]) await agente.post('/logout').send({ _csrf }).expect(403);
    await agente.get('/panel').expect(200);
    const token = csrf(pagina.text);
    const salida = await agente.post('/logout').send({ _csrf: token }).expect(303).expect('Location', '/'); sinCache(salida);
    assert.match(salida.headers['set-cookie'].join(' '), /marketing\.sid=;.*Expires=Thu, 01 Jan 1970/);
    const protegidas = [...rutas(), '/admin/empresas/nueva', '/empresa/usuarios/nuevo', '/empresa/gmail', `/campanas/${c.campanas[0]._id}/automatizacion`];
    for (const ruta of protegidas) {
      const res = await request(c.app).get(ruta).set('Cookie', actual).expect(302).expect('Location', '/login'); sinCache(res);
    }
    assert.ok(!Object.values(await c.sesiones()).some(s => s.usuarioId));
    await agente.post('/logout').send({ _csrf: token }).expect(303);
    await entrar(rol, agente); await agente.get('/panel').expect(200);
  });
  test(`sesión ${rol}: caducidad y bloqueo se aplican en la siguiente solicitud`, async () => {
    const { agente, actual } = await entrar(rol);
    const usuario = c.usuarios.find(u => u.rol === rol);
    await c.expirar(usuario);
    await agente.get('/panel').expect(302).expect('Location', '/login');
    await entrar(rol, agente);
    usuario.estadoAcceso = 'bloqueado';
    await agente.get('/campanas').expect(302).expect('Location', '/login');
    usuario.estadoAcceso = 'activo';
    await agente.get('/panel').expect(302).expect('Location', '/login');
    await request(c.app).get('/panel').set('Cookie', actual).expect(302);
    for (const estado of ['pendiente_verificacion', 'bloqueado']) {
      usuario.estadoAcceso = estado;
      const login = await agente.get('/login').expect(200);
      await agente.post('/login').send({ email: usuario.email, password: c.password, _csrf: csrf(login.text) }).expect(401);
    }
  });
  test(`sesión ${rol}: revocación externa en almacén rechaza cookie válida firmada`, async () => {
    const { agente, actual } = await entrar(rol);
    const usuario = c.usuarios.find(u => u.rol === rol);
    const [sid] = Object.entries(await c.sesiones()).find(([,s]) => s.usuarioId === String(usuario._id));
    await new Promise((resolve, reject) => c.store.destroy(sid, e => e ? reject(e) : resolve()));
    await request(c.app).get('/panel').set('Cookie', actual).expect(302).expect('Location', '/login');
    await agente.get('/campanas').expect(302).expect('Location', '/login');
    await entrar(rol, agente);
  });
}
test('permisos persistidos: rol real cambia inmediatamente y datos/cookies manipulados no elevan privilegios', async () => {
  const { agente } = await entrar('admin_empresa');
  const usuario = c.usuarios[1]; usuario.rol = 'operador';
  const panel = await agente.get('/panel?rol=superadmin&empresa=otra').expect(200);
  assert.doesNotMatch(panel.text, /Usuarios de tu empresa|href="\/empresa\/gmail"/);
  await agente.get('/empresa/usuarios/nuevo').expect(403);
  await agente.get('/admin/empresas/nueva').expect(403);
  await agente.get('/empresa/gmail').expect(403);
  await request(c.app).get('/admin/empresas/nueva').set('Cookie', 'marketing.sid=s%3Amanipulada.firma-invalida; rol=superadmin').expect(302);
});
test('aislamiento HTTP: dos administradores no consultan ni modifican recursos ajenos', async () => {
  for (const [correo, otra] of [['admin_empresa', 1], ['admin2', 0]]) {
    const { agente } = await entrar(correo);
    const panel = await agente.get('/panel').expect(200);
    assert.ok(!panel.text.includes(c.usuarios[otra === 1 ? 4 : 2].email));
    const token = csrf(panel.text);
    for (const ruta of [`/campanas/${c.campanas[otra]._id}`, `/campanas/${c.campanas[otra]._id}/editar`, `/contactos/${c.contactos[otra]._id}`, `/empresa/usuarios/${c.usuarios[otra === 1 ? 4 : 2]._id}`]) await agente.get(ruta).expect(404);
    await agente.post(`/empresa/usuarios/${c.usuarios[otra === 1 ? 4 : 2]._id}/estado`).send({ estadoAcceso: 'activo', _csrf: token }).expect(404);
    await agente.post(`/campanas/${c.campanas[otra]._id}/editar`).send({ nombre: 'Intruso', rol: 'superadmin', _csrf: token }).expect(404);
  }
});
test('no-cache también cubre errores autenticados y redirecciones de sesiones revocadas', async () => {
  const { agente } = await entrar('operador');
  for (const ruta of ['/ruta-inexistente', '/admin/empresas/nueva', '/empresa/gmail']) {
    const res = await agente.get(ruta).expect(ruta === '/ruta-inexistente' ? 404 : 403); sinCache(res);
    assert.equal((res.text.match(/action="\/logout"/g) || []).length, 1);
  }
  c.usuarios[2].estadoAcceso = 'bloqueado';
  sinCache(await agente.get('/panel').expect(302));
});
test('bloquear y reactivar sin solicitudes intermedias revoca todas las sesiones anteriores', async () => {
  const admin = await entrar('admin_empresa');
  const primera = await entrar('operador'), segunda = await entrar('operador');
  const pagina = await admin.agente.get('/panel').expect(200), token = csrf(pagina.text);
  const usuario = c.usuarios[2], ruta = `/empresa/usuarios/${usuario._id}/estado`;
  await admin.agente.post(ruta).send({ estadoAcceso: 'bloqueado', _csrf: token }).expect(303);
  assert.equal(usuario.versionSesion, 1);
  await admin.agente.post(ruta).send({ estadoAcceso: 'activo', _csrf: token }).expect(303);
  for (const sesion of [primera, segunda]) await request(c.app).get('/panel').set('Cookie', sesion.actual).expect(302).expect('Location', '/login');
  const nueva = await entrar('operador'); await nueva.agente.get('/panel').expect(200);
  assert.ok(Object.values(await c.sesiones()).some(s => s.usuarioId === String(usuario._id) && s.versionSesion === 1));
});
test('todas las vistas internas renderizan exactamente un logout POST con CSRF y fuera de otros formularios', async () => {
  for (const vista of vistas) {
    const html = await ejs.renderFile(path.resolve(__dirname, '../views', vista + '.ejs'), fixture(vista));
    assert.equal((html.match(/action="\/logout"/g) || []).length, 1, vista);
    assert.match(html, /<form[^>]*action="\/logout"[^>]*method="post"[^>]*data-cerrar-sesion>[\s\S]*?name="_csrf" value="[A-Za-z0-9_-]{43}"[\s\S]*?Cerrar sesión[\s\S]*?<\/form>/);
    assert.ok(html.indexOf('action="/logout"') < html.indexOf('<main'), vista);
  }
});
