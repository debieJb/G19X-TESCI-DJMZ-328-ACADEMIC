const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const session = require('express-session');
process.env.SESSION_SECRET = 'recuperacion-http-solo-pruebas-sin-servicios-reales';
const recuperacion = require('../services/recuperacionPasswordService');
const { fixture } = require('./soporte/recuperacionFixture.cjs');
const crearApp = require('../appFactory').crearApp;
const campo = html => html.match(/name="_csrf" value="([^"]+)"/)[1];
const espera = async condicion => {
  for (let i = 0; i < 100; i++) { if (condicion()) return; await new Promise(r => setTimeout(r, 5)); }
  assert.fail('La tarea simulada no terminó');
};
async function preparar(t) {
  const f = await fixture(t), original = recuperacion.crearServicio;
  t.mock.method(recuperacion, 'crearServicio', opciones => original({ ...opciones, conexion: f.conexion, reloj: f.reloj }));
  t.mock.method(require('../services/smtpTransaccionalService'), 'crearCorreo', () => f.correo);
  t.mock.method(require('../services/trabajadorVerificacionService'), 'configuracion', () => ({ limitesEnvio: { minuto: 10, dia: 100 } }));
  t.mock.method(require('../services/loginLimitesService'), 'consumir', async () => {});
  const store = new session.MemoryStore(), app = crearApp({ secret: process.env.SESSION_SECRET, store });
  t.after(() => store.clear());
  return { ...f, store, app, agente: request.agent(app),
    async pedir(email = 'persona@example.test') {
      const pagina = await this.agente.get('/recuperar').expect(200);
      return this.agente.post('/recuperar').type('form').send({ _csrf: campo(pagina.text), email });
    },
    async entrar(agente, password = f.PASSWORD, status = 303) {
      const pagina = await agente.get('/login').expect(200);
      return agente.post('/login').type('form').send({ _csrf: campo(pagina.text), email: 'persona@example.test', password }).expect(status);
    }
  };
}
const sesiones = store => new Promise((resolve, reject) => store.all((e, s) => e ? reject(e) : resolve(s)));

test('recuperación HTTP: respuesta idéntica existente/inexistente/limitada y envío fuera de la respuesta', async t => {
  const f = await preparar(t);
  const existente = await f.pedir(' PERSONA@EXAMPLE.TEST '); assert.equal(existente.status, 202);
  await espera(() => f.datos[0].recuperacion?.estado === 'enviada');
  const ausente = await f.pedir('ausente@example.test'); assert.equal(ausente.status, 202);
  assert.equal(existente.text, ausente.text);
  assert.match(ausente.text, /Si existe una cuenta asociada a este correo, recibirás instrucciones para recuperar el acceso/);
  assert.doesNotMatch(existente.text, /persona@example.test|ausente@example.test|tokenHash|solicitudHash/);
  assert.equal(f.mensajes.length, 1);
  for (let i = 0; i < 4; i++) {
    const limitada = await f.pedir(); assert.equal(limitada.status, 202); assert.equal(limitada.text, existente.text);
  }
  assert.equal(f.mensajes.length, 1);
  assert.ok(Object.values(await sesiones(f.store)).every(s => !s.usuarioId));
});

test('recuperación HTTP: CSRF, campos estrictos, origen fijo y ningún token en HTML o sesión', async t => {
  const f = await preparar(t), pagina = await f.agente.get('/recuperar').expect(200);
  assert.equal(pagina.headers['referrer-policy'], 'no-referrer'); assert.equal(pagina.headers['cache-control'], 'no-store');
  assert.match(pagina.headers['content-security-policy'], /form-action 'self'/);
  for (const body of [{}, { _csrf: 'x'.repeat(43) }]) await f.agente.post('/recuperar').send({ email: 'persona@example.test', ...body }).expect(403);
  await f.agente.post('/recuperar').send({ _csrf: campo(pagina.text), email: { $ne: '' } }).expect(422);
  await f.agente.post('/recuperar').send({ _csrf: campo(pagina.text), email: 'persona@example.test', origen: 'https://ajeno.test' }).expect(422);
  assert.equal(f.datos[0].recuperacion, undefined);
  const token = await f.emitir();
  const form = await f.agente.get('/recuperar/restablecer').expect(200);
  assert.ok(!form.text.includes(token));
  await f.agente.post('/recuperar/restablecer').send({ token, password: f.NUEVA, confirmacionPassword: f.NUEVA }).expect(403);
  for (const campoExtra of ['empresa', 'rol', 'email', 'credencial']) {
    await f.agente.post('/recuperar/restablecer').send({ _csrf: campo(form.text), token, password: f.NUEVA, confirmacionPassword: f.NUEVA, [campoExtra]: 'manipulado' }).expect(422);
  }
  assert.equal(f.datos[0].versionSesion, 0);
  assert.ok(!JSON.stringify(await sesiones(f.store)).includes(token));
});

test('recuperación HTTP: cambio completo, validación, sesiones anteriores revocadas y login nuevo', async t => {
  const f = await preparar(t), primera = request.agent(f.app), segunda = request.agent(f.app);
  await f.entrar(primera); await f.entrar(segunda);
  await primera.get('/login').expect(302); await segunda.get('/login').expect(302);
  const token = await f.emitir(), form = await f.agente.get('/recuperar/restablecer').expect(200);
  const invalida = await f.agente.post('/recuperar/restablecer').send({ _csrf: campo(form.text), token, password: 'corta', confirmacionPassword: 'corta' }).expect(422);
  assert.match(invalida.text, /Confirma la misma contraseña/);
  assert.ok(!invalida.text.includes(token)); assert.ok(!invalida.text.includes('value="corta"'));
  assert.ok(!JSON.stringify(await sesiones(f.store)).includes(token));
  // Reintentar conserva solo el hash del código en la sesión, nunca contraseña ni token original.
  const cambio = await f.agente.post('/recuperar/restablecer').send({ _csrf: campo(invalida.text), password: f.NUEVA, confirmacionPassword: f.NUEVA }).expect(200);
  assert.match(cambio.text, /Contraseña actualizada/); assert.match(cambio.text, /sesiones anteriores se cerraron/);
  assert.match(cambio.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  assert.equal(f.datos[0].versionSesion, 1);
  await primera.get('/login').expect(303).expect('Location', '/login');
  await segunda.get('/login').expect(303).expect('Location', '/login');
  await primera.get('/login').expect(200); await segunda.get('/login').expect(200);
  await f.entrar(request.agent(f.app), f.PASSWORD, 401);
  await f.entrar(request.agent(f.app), f.NUEVA);
  const nuevo = await f.agente.get('/recuperar/restablecer').expect(200);
  await f.agente.post('/recuperar/restablecer').send({ _csrf: campo(nuevo.text), token, password: f.NUEVA, confirmacionPassword: f.NUEVA }).expect(422);
});

test('recuperación HTTP: caducidad, token manipulado y cruce de empresa no alteran ninguna cuenta', async t => {
  const f = await preparar(t), token = await f.emitir();
  const otro = { ...structuredClone(f.datos[0]), _id: '507f1f77bcf86cd799439099', empresa: '507f1f77bcf86cd799439098', email: 'otro@example.test' };
  f.datos.push(otro);
  const form = await f.agente.get('/recuperar/restablecer').expect(200), _csrf = campo(form.text);
  const cruzado = otro._id + token.slice(24);
  await f.agente.post('/recuperar/restablecer').send({ _csrf, token: cruzado, password: f.NUEVA, confirmacionPassword: f.NUEVA }).expect(422);
  f.avanzar(15 * 60000);
  const r = await f.agente.post('/recuperar/restablecer').send({ _csrf, token, password: f.NUEVA, confirmacionPassword: f.NUEVA }).expect(422);
  assert.match(r.text, /ya fue utilizado o ha caducado/);
  assert.equal(f.datos[0].versionSesion, 0); assert.equal(otro.versionSesion, 0);
});

test('recuperación HTTP: límite por IP y falla de infraestructura no revelan existencia', async t => {
  const f = await preparar(t), limite = require('../services/limitesRecuperacionService');
  t.mock.method(limite, 'consumir', async () => { throw { codigo: 'LIMITE_RECUPERACION' }; });
  const existe = await f.pedir(); const ausente = await f.pedir('ausente@example.test');
  assert.equal(existe.status, 429); assert.equal(existe.text, ausente.text); assert.equal(existe.headers['retry-after'], '900');
  assert.equal(f.mensajes.length, 0);
  limite.consumir.mock.mockImplementation(async () => { throw Error('DETALLE_PRIVADO'); });
  const error = await f.pedir(); assert.equal(error.status, 503); assert.ok(!error.text.includes('DETALLE_PRIVADO'));
});
