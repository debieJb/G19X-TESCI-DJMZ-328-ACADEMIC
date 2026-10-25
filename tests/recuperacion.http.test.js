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

// Ruta/controlador/servicio/fábrica SMTP reales; solo MongoDB y la red son dobles.
async function prepararSmtp(t, { errorSmtp } = {}) {
  const f = await preparar(t);
  require('../services/smtpTransaccionalService').crearCorreo.mock.restore();
  const valores = { NODE_ENV: 'development', TRANSACTIONAL_EMAIL_ENABLED: 'true',
    TRANSACTIONAL_WORKER_ENABLED: 'false', EMAIL_USER: 'plataforma@example.test',
    EMAIL_PASS: 'credencial-sintetica-solo-pruebas', TRANSACTIONAL_PUBLIC_ORIGIN: 'http://localhost:3000' };
  const anteriores = Object.fromEntries(Object.keys(valores).map(k => [k, process.env[k]]));
  Object.assign(process.env, valores);
  t.after(() => { for (const [k, v] of Object.entries(anteriores)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  } });
  t.mock.method(require('node:tls'), 'connect', () => assert.fail('TLS_REAL_PROHIBIDO'));
  const mensajesSmtp = [];
  const transporte = require('nodemailer').createTransport;
  transporte.mock.mockImplementation(opciones => {
    assert.equal(opciones.host, 'smtp.gmail.com');
    assert.equal(opciones.port, 465);
    assert.equal(opciones.secure, true);
    assert.equal(opciones.auth.user, valores.EMAIL_USER);
    assert.equal(opciones.auth.pass, valores.EMAIL_PASS);
    assert.equal(opciones.tls.rejectUnauthorized, true);
    return {
      verify: () => assert.fail('La ruta debe despachar, no limitarse a verificar AUTH'),
      sendMail: async mensaje => {
        mensajesSmtp.push(mensaje);
        if (errorSmtp) throw errorSmtp;
        return { accepted: [mensaje.to], rejected: [], messageId: '<recuperacion-simulada@example.test>' };
      },
      close() {}
    };
  });
  const logs = t.mock.method(console, 'error', () => {});
  return { ...f, mensajesSmtp, transporte, logs };
}

test('recuperación HTTP SMTP: worker apagado despacha token por fábrica real sin usar plantilla de verificación', async t => {
  const f = await prepararSmtp(t);
  const respuesta = await f.pedir();
  assert.equal(respuesta.status, 202);
  await espera(() => f.datos[0].recuperacion?.estado === 'enviada');
  assert.equal(process.env.TRANSACTIONAL_WORKER_ENABLED, 'false');
  assert.equal(f.transporte.mock.callCount(), 1);
  assert.equal(f.mensajesSmtp.length, 1);
  assert.equal(f.mensajes.length, 0); // No pasó por la fábrica de correo sustituida del fixture.
  const mensaje = f.mensajesSmtp[0];
  assert.equal(mensaje.to, f.datos[0].email);
  assert.equal(mensaje.subject, 'Recupera tu contraseña de PluriOne');
  assert.deepEqual(mensaje.envelope, { from: 'plataforma@example.test', to: [f.datos[0].email] });
  const enlace = new URL(mensaje.text.match(/http:\/\/\S+/)[0]);
  assert.equal(enlace.pathname, '/recuperar/restablecer');
  assert.equal(enlace.search, '');
  const token = new URLSearchParams(enlace.hash.slice(1)).get('token');
  assert.match(token, /^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(f.datos[0].recuperacion.tokenHash, require('node:crypto').createHash('sha256').update(token).digest('hex'));
  assert.equal(+f.datos[0].recuperacion.expiraEn - +f.reloj(), 15 * 60000);
  assert.match(f.datos[0].recuperacion.proveedorMensajeId, /^[a-f0-9]{64}$/);
  assert.ok(!respuesta.text.includes(token));
  assert.ok(!JSON.stringify(await sesiones(f.store)).includes(token));
});

test('recuperación HTTP SMTP: AUTH 535 queda fallido y trazado, sin fingir aceptación ni revelar la cuenta', async t => {
  const f = await prepararSmtp(t, { errorSmtp: Object.assign(Error('DETALLE_SMTP_PRIVADO'), {
    code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535,
    response: '535 5.7.8 DETALLE_SMTP_PRIVADO'
  }) });
  const respuesta = await f.pedir();
  assert.equal(respuesta.status, 202);
  await espera(() => f.datos[0].recuperacion?.estado === 'fallida');
  const estado = f.datos[0].recuperacion;
  assert.equal(estado.correoError, 'REAUTORIZAR_TRANSACCIONAL');
  assert.equal(estado.faseSmtp, 'AUTH');
  assert.equal(estado.respuestaSmtp, 535);
  assert.equal(estado.estadoSmtp, '5.7.8');
  assert.match(estado.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(estado.proveedorMensajeId, undefined);
  assert.equal(f.mensajesSmtp.length, 1);
  const ausente = await f.pedir('ausente@example.test');
  assert.equal(ausente.status, 202);
  assert.equal(ausente.text, respuesta.text);
  assert.equal(f.mensajesSmtp.length, 1);
  assert.ok(!JSON.stringify(f.logs.mock.calls.map(c => c.arguments)).includes('DETALLE_SMTP_PRIVADO'));
  await f.servicio.despachar();
  assert.equal(f.mensajesSmtp.length, 1); // Una tarea fallida no se reenvía automáticamente.
});

test('recuperación HTTP SMTP: configuración inválida conserva pendiente con diagnóstico antes de SMTP', async t => {
  const f = await prepararSmtp(t);
  process.env.EMAIL_PASS = '';
  const respuesta = await f.pedir();
  assert.equal(respuesta.status, 202);
  await espera(() => f.datos[0].recuperacion?.correoError === 'CONFIGURACION_SMTP');
  assert.equal(f.datos[0].recuperacion.estado, 'pendiente');
  assert.equal(f.datos[0].recuperacion.tokenHash, undefined);
  assert.equal(f.transporte.mock.callCount(), 0);
  assert.equal(f.mensajesSmtp.length, 0);
  assert.doesNotMatch(respuesta.text, /CONFIGURACION_SMTP|persona@example\.test/);
});

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
