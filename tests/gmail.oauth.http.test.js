const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [obj, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(obj, metodo, () => { throw new Error('Acceso externo prohibido'); });
}
mock.method(global, 'fetch', () => { throw new Error('Sin llamadas externas'); });
process.env.SESSION_SECRET = 'oauth-http-exclusivo-pruebas';
const { crearContexto } = require('./soporte/sesion');
const { crearFixture, A, B, actor } = require('./soporte/gmailOAuth');
const service = require('../services/gmailOAuthService');
let fixture, usuario, cliente;
beforeEach(t => {
  fixture = crearFixture(t);
  usuario = { _id: actor, nombre: 'Admin', email: 'admin@example.test', rol: 'admin_empresa', empresa: { _id: A, nombre: 'Empresa A' } };
  ({ cliente } = crearContexto(t, usuario));
});
const csrf = async () => {
  const res = await cliente.get('/empresa/gmail').expect(200);
  return res.text.match(/name="_csrf" value="([^"]+)"/)[1];
};
const iniciar = async () => {
  const res = await cliente.post('/empresa/gmail/conectar').send({ _csrf: await csrf(), empresa: String(B), rol: 'superadmin' }).expect(303);
  const url = new URL(res.headers.location);
  return { state: url.searchParams.get('state'), code: 'codigo-solo-pruebas' };
};
const conectar = async () => {
  await cliente.get('/empresa/gmail/callback').query(await iniciar()).expect(303).expect('Location', '/empresa/gmail');
};

test('Gmail HTTP: configuración ausente informa y nunca simula una conexión', async () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const res = await cliente.get('/empresa/gmail').expect(200);
  assert.match(res.text, /necesita configurar Google OAuth/); assert.match(res.text, /Desconectada/);
  assert.doesNotMatch(res.text, /action="\/empresa\/gmail\/conectar"/);
  await cliente.post('/empresa/gmail/conectar').send({ _csrf: 'invalido' }).expect(403);
  assert.equal(fixture.conexiones.size, 0);
});

test('Gmail HTTP: conexión completa, empresa derivada de sesión y sin tokens en respuesta', async () => {
  await conectar();
  const res = await cliente.get('/empresa/gmail?empresa=' + B).expect(200);
  assert.match(res.text, /Conectada/); assert.match(res.text, /gmail-a@example.test/);
  assert.equal(res.headers['cache-control'], 'no-store'); assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.doesNotMatch(res.text, /access-solo|refresh-solo|jwt-solo|secreto-exclusivo|v1\./);
  assert.ok(fixture.conexiones.has(String(A))); assert.ok(!fixture.conexiones.has(String(B)));
  assert.ok(fixture.consultas.filter(c => c.tipo === 'conexion').every(c => String(c.filtro.empresa) === String(A)));
});

for (const rol of ['operador', 'superadmin']) {
  test(`Gmail HTTP: ${rol} no consulta ni administra conexiones empresariales`, async () => {
    usuario.rol = rol;
    for (const ruta of ['/empresa/gmail', '/empresa/gmail/callback', '/empresa/gmail/resultado']) await cliente.get(ruta).expect(403);
    for (const ruta of ['conectar', 'desconectar', 'renovar']) await cliente.post('/empresa/gmail/' + ruta).send({ empresa: String(B) }).expect(403);
    assert.equal(fixture.consultas.length, 0); assert.equal(fixture.escrituras.length, 0);
  });
}

test('Gmail HTTP: todas las rutas exigen sesión, callback no propaga código al login', async t => {
  const request = require('supertest');
  const app = require('../app').crearApp({ secret: 'solo-pruebas-anonimo' });
  for (const ruta of ['/empresa/gmail', '/empresa/gmail/callback?code=NO_PROPAGAR', '/empresa/gmail/resultado']) {
    await request(app).get(ruta).expect(302).expect('Location', '/login').expect('Referrer-Policy', 'no-referrer');
  }
  for (const ruta of ['conectar', 'desconectar', 'renovar']) await request(app).post('/empresa/gmail/' + ruta).expect(302).expect('Location', '/login');
});

test('Gmail HTTP: CSRF bloquea POST sin token, manipulado, objeto y Unicode sin error 500', async () => {
  await csrf();
  for (const token of [undefined, '', 'x'.repeat(43), { $ne: null }, 'é'.repeat(43)]) {
    for (const ruta of ['conectar', 'desconectar', 'renovar']) await cliente.post('/empresa/gmail/' + ruta).send({ _csrf: token }).expect(403);
  }
  assert.equal(fixture.conexiones.size, 0); assert.equal(fixture.escrituras.length, 0);
});

test('Gmail HTTP: GET no inicia conexión, desconexión ni renovación', async () => {
  for (const ruta of ['conectar', 'desconectar', 'renovar']) await cliente.get('/empresa/gmail/' + ruta).expect(404);
  assert.equal(fixture.escrituras.length, 0);
});

test('Gmail HTTP: cambio de empresa durante OAuth impide usar el state de otra empresa', async () => {
  const query = await iniciar(); usuario.empresa = { _id: B, nombre: 'Empresa B' };
  await cliente.get('/empresa/gmail/callback').query(query).expect(303).expect('Location', '/empresa/gmail/resultado');
  const res = await cliente.get('/empresa/gmail/resultado').expect(400);
  assert.match(res.text, /no corresponde a tu sesión/);
  assert.equal(fixture.provider.canjes.length, 0); assert.equal(fixture.conexiones.get(String(A)).estado, 'desconectada');
});

test('Gmail HTTP: callback rechazado limpia URL y no refleja errores de Google', async () => {
  const query = await iniciar(); query.error = 'access_denied'; query.error_description = '<script>SECRETO</script>';
  await cliente.get('/empresa/gmail/callback').query(query).expect(303).expect('Location', '/empresa/gmail/resultado');
  const res = await cliente.get('/empresa/gmail/resultado').expect(422);
  assert.match(res.text, /No autorizaste/); assert.doesNotMatch(res.text, /SECRETO|codigo-solo-pruebas/);
});

test('Gmail HTTP: callback repetido y códigos malformados no autorizan conexión', async () => {
  const query = await iniciar(); query.code = { $ne: null };
  await cliente.get('/empresa/gmail/callback').query(query).expect(303).expect('Location', '/empresa/gmail/resultado');
  await cliente.get('/empresa/gmail/resultado').expect(400);
  assert.equal(fixture.provider.canjes.length, 0);
});

test('Gmail HTTP: renovación no devuelve token y desconexión ignora empresa del cuerpo', async () => {
  await conectar();
  const res = await cliente.post('/empresa/gmail/renovar').send({ _csrf: await csrf(), empresa: String(B) }).expect(200);
  assert.doesNotMatch(res.text, /access-solo|refresh-solo|v1\./);
  await cliente.post('/empresa/gmail/desconectar').send({ _csrf: await csrf(), empresa: String(B) }).expect(303);
  assert.equal(fixture.conexiones.get(String(A)).estado, 'desconectada'); assert.ok(!fixture.conexiones.has(String(B)));
});

test('Gmail HTTP: revocación pendiente tiene estado y acción de reintento reales', async () => {
  await conectar(); fixture.provider.revocar = async () => { throw new Error('SECRETO'); };
  await cliente.post('/empresa/gmail/desconectar').send({ _csrf: await csrf() }).expect(303);
  const res = await cliente.get('/empresa/gmail').expect(200);
  assert.match(res.text, /Reintentar revocación/); assert.match(res.text, /revocación pendiente/); assert.doesNotMatch(res.text, /SECRETO|refresh-solo/);
});

test('Gmail HTTP: empresa inactiva consulta y desconecta pero no inicia autorización', async () => {
  fixture.empresas.get(String(A)).estado = 'inactiva';
  await cliente.get('/empresa/gmail').expect(200);
  const res = await cliente.post('/empresa/gmail/conectar').send({ _csrf: await csrf() }).expect(422);
  assert.match(res.text, /empresa está inactiva/);
  await cliente.post('/empresa/gmail/desconectar').send({ _csrf: await csrf() }).expect(303);
});

test('Gmail HTTP: metadata tiene lista blanca incluso si persistencia entrega campos secretos', async () => {
  fixture.conexiones.set(String(A), { empresa: A, estado: 'conectada', email: '<script>@example.test',
    accessTokenCifrado: 'NO_MOSTRAR', refreshTokenCifrado: 'NO_MOSTRAR', revocacionTokenCifrado: 'NO_MOSTRAR', googleSub: 'NO_MOSTRAR' });
  const estado = await service.obtenerEstado(usuario);
  assert.deepEqual(Object.keys(estado).sort(), ['conectadoEn', 'email', 'estado', 'expiraEn', 'renovadoEn'].sort());
  const res = await cliente.get('/empresa/gmail').expect(200);
  assert.doesNotMatch(res.text, /NO_MOSTRAR|<script>/); assert.match(res.text, /&lt;script&gt;@example.test/);
});
