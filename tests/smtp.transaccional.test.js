const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const nodemailer = require('nodemailer');
const smtp = require('../services/smtpTransaccionalService');
const env = () => ({ EMAIL_USER: 'plataforma@example.test', EMAIL_PASS: 'clave-sintetica-no-real', TRANSACTIONAL_PUBLIC_ORIGIN: 'https://localhost:3100' });
const mensaje = () => ({ remitente: 'plataforma@example.test', destino: 'destino@example.test', asunto: 'Verifica', texto: 'Enlace sintético' });
const cliente = cambios => ({ verify: async () => true, sendMail: async () => ({ accepted: ['destino@example.test'], rejected: [], messageId: '<sintetico@example.test>' }), close() {}, ...cambios });

test('SMTP: contraseña de aplicación Gmail agrupada se normaliza al conectar sin modificar el origen', async t => {
  const valores = { ...env(), EMAIL_PASS: 'abcd efgh ijkl mnop' };
  let autenticacion;
  t.mock.method(nodemailer, 'createTransport', opciones => {
    autenticacion = opciones.auth;
    return cliente({ sendMail: () => assert.fail('verify no debe enviar correos') });
  });
  const config = smtp.configuracion(valores, { verificar: true });
  await smtp.crearTransporte(config).verificar();
  assert.equal(autenticacion.pass, 'abcdefghijklmnop');
  assert.equal(valores.EMAIL_PASS, 'abcd efgh ijkl mnop');
  assert.equal(smtp.configuracion({ ...env(), EMAIL_PASS: 'clave con espacios propios' }).password, 'clave con espacios propios');
});

test('SMTP: apagado no exige credenciales ni crea conexiones; configuración ausente o inválida se rechaza', t => {
  const crear = t.mock.method(nodemailer, 'createTransport', () => { throw Error('NO_CONECTAR'); });
  assert.equal(smtp.crearCorreo({}).disponible, false);
  for (const cambios of [{ EMAIL_USER: undefined }, { EMAIL_PASS: undefined }, { EMAIL_USER: 'a\r\nb@example.test' }, { EMAIL_PASS: '\nsecreto' }, { TRANSACTIONAL_PUBLIC_ORIGIN: 'http://externo.test' }]) {
    assert.throws(() => smtp.crearCorreo({ ...env(), ...cambios, TRANSACTIONAL_EMAIL_ENABLED: 'true' }));
  }
  assert.equal(crear.mock.callCount(), 0);
});

test('SMTP verify: Gmail 465 TLS validado, autenticación login y cero llamadas sendMail', async t => {
  let opciones, verificaciones = 0;
  t.mock.method(nodemailer, 'createTransport', o => { opciones = o; return cliente({ verify: async () => { verificaciones++; }, sendMail: () => { throw Error('NO_ENVIAR'); } }); });
  assert.deepEqual(await smtp.crearTransporte(smtp.configuracion(env())).verificar(), { conexionTLS: true, autenticacionSMTP: true, correosEnviados: 0 });
  assert.equal(verificaciones, 1); assert.equal(opciones.host, 'smtp.gmail.com'); assert.equal(opciones.port, 465);
  assert.equal(opciones.auth.type, 'login'); assert.equal(opciones.auth.pass, env().EMAIL_PASS);
  assert.equal(opciones.tls.rejectUnauthorized, true); assert.equal(opciones.debug, false); assert.equal(opciones.logger, false); assert.equal(opciones.pool, false);
});

test('SMTP: remitente fijo, un destinatario y aceptación persistible sin respuesta privada', async t => {
  let datos;
  t.mock.method(nodemailer, 'createTransport', () => cliente({ sendMail: async d => { datos = d; return { accepted: [d.to], rejected: [], messageId: '<id@example.test>', response: 'NO_PUBLICAR' }; } }));
  const transporte = smtp.crearTransporte(smtp.configuracion(env())), r = await transporte.enviar(mensaje());
  assert.equal(r.aceptado, true); assert.match(r.mensajeId, /^[a-f0-9]{64}$/); assert.equal(r.response, undefined);
  assert.deepEqual(datos.envelope, { from: env().EMAIL_USER, to: [mensaje().destino] });
  assert.equal(datos.disableFileAccess, true); assert.equal(datos.disableUrlAccess, true);
  await assert.rejects(transporte.enviar({ ...mensaje(), remitente: 'ajeno@example.test' }), { codigo: 'MENSAJE_SMTP_INVALIDO' });
  await assert.rejects(transporte.enviar({ ...mensaje(), destino: 'a@example.test,b@example.test' }), { codigo: 'MENSAJE_SMTP_INVALIDO' });
});

for (const error of [{ code: 'EAUTH', responseCode: 535 }, { code: 'ESOCKET' }, { code: 'ETIMEDOUT', command: 'DATA' }, { responseCode: 550 }]) {
  test(`SMTP: error ${error.code || error.responseCode} saneado y ningún reintento interno`, async t => {
    let intentos = 0;
    t.mock.method(nodemailer, 'createTransport', () => cliente({ sendMail: async () => { intentos++; throw Object.assign(Error('SECRETO_NO_PUBLICAR'), error); } }));
    await assert.rejects(smtp.crearTransporte(smtp.configuracion(env())).enviar(mensaje()), e => {
      assert.ok(!e.message.includes('SECRETO')); assert.equal(e.definitivo, error.code === 'EAUTH' || error.responseCode === 550);
      assert.equal(e.requiereAutorizacion, error.code === 'EAUTH'); return true;
    }); assert.equal(intentos, 1);
  });
}

test('SMTP: timeout durante TLS destruye socket y no permite continuar hacia envío', async t => {
  let destruido = false, enviado = false;
  const socket = new EventEmitter(); socket.destroy = () => { destruido = true; socket.emit('close'); };
  t.mock.method(require('node:tls'), 'connect', () => socket);
  t.mock.method(nodemailer, 'createTransport', opciones => cliente({ sendMail: () => new Promise((resolve, reject) => {
    opciones.getSocket({}, (e) => { if (e) reject(e); else { enviado = true; resolve({}); } });
  }) }));
  const abort = new AbortController();
  const pendiente = smtp.crearTransporte(smtp.configuracion(env())).enviar(mensaje(), { signal: abort.signal });
  abort.abort(); await assert.rejects(pendiente); assert.equal(destruido, true); assert.equal(enviado, false);
});

test('SMTP: respuesta ambigua no declara entrega; señal previamente abortada no conecta', async t => {
  const crear = t.mock.method(nodemailer, 'createTransport', () => cliente({ sendMail: async () => ({ accepted: [], messageId: 'dato' }) }));
  const transporte = smtp.crearTransporte(smtp.configuracion(env()));
  await assert.rejects(transporte.enviar(mensaje()), { codigo: 'ENTREGA_INCIERTA', definitivo: false });
  const abort = new AbortController(); abort.abort(); await assert.rejects(transporte.enviar(mensaje(), { signal: abort.signal }));
  assert.equal(crear.mock.callCount(), 1);
});

test('SMTP: comprobación independiente rechaza bandera activa antes de autenticar', async t => {
  const previo = process.env.TRANSACTIONAL_EMAIL_ENABLED; process.env.TRANSACTIONAL_EMAIL_ENABLED = 'true';
  t.after(() => { if (previo === undefined) delete process.env.TRANSACTIONAL_EMAIL_ENABLED; else process.env.TRANSACTIONAL_EMAIL_ENABLED = previo; });
  await assert.rejects(require('../scripts/comprobarSmtpTransaccional').principal(), /APAGAR_ENVIOS_ANTES_DE_COMPROBAR/);
});

test('SMTP: despacho real inicializa SMTP y no exige OAuth transaccional', async t => {
  const valores = { TRANSACTIONAL_EMAIL_ENABLED: 'true', GMAIL_CAMPAIGNS_ENABLED: 'false', MONGODB_URI: 'sintetica-no-conectar' };
  const previo = Object.fromEntries(Object.keys(valores).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(valores)) process.env[k] = v;
  t.after(() => { for (const [k, v] of Object.entries(previo)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const crear = t.mock.method(smtp, 'crearCorreo', () => ({ disponible: true }));
  const legado = t.mock.method(require('../services/gmailTransaccionalService'), 'crearCorreo', () => { throw Error('NO_OAUTH'); });
  t.mock.method(require('mongoose'), 'createConnection', () => { throw Error('DETENER_ANTES_DE_DB'); });
  await assert.rejects(require('../scripts/despacharVerificacion').principal(['--solicitud', 'a'.repeat(24), '--autorizar-envio']), /DETENER_ANTES_DE_DB/);
  assert.equal(crear.mock.callCount(), 1); assert.equal(legado.mock.callCount(), 0);
});

test('SMTP: recuperación reutiliza el remitente y transporte de verificación sin nuevas credenciales', async t => {
  const mensajes = [];
  t.mock.method(nodemailer, 'createTransport', () => cliente({ sendMail: async d => { mensajes.push(d); return { accepted: [d.to], rejected: [], messageId: '<simulado@example.test>' }; } }));
  const correo = smtp.crearCorreo({ ...env(), TRANSACTIONAL_EMAIL_ENABLED: 'true' });
  const crypto = require('node:crypto');
  const token = [crypto.randomBytes(12).toString('hex'), crypto.randomBytes(32).toString('base64url')].join('.');
  await correo.enviarVerificacion({ correo: 'destino@example.test', token: require('node:crypto').randomBytes(32).toString('base64url') });
  await correo.enviarRecuperacion({ correo: 'destino@example.test', token });
  assert.equal(mensajes.length, 2);
  assert.ok(mensajes.every(m => m.from === env().EMAIL_USER && m.envelope.to.length === 1));
  assert.equal(mensajes[0].subject, 'Verifica el correo de tu empresa');
  assert.equal(mensajes[1].subject, 'Recupera tu contraseña de PluriOne');
  assert.match(mensajes[1].text, /https:\/\/localhost:3100\/recuperar\/restablecer#token=/);
});

test('SMTP: diagnóstico de AUTH conserva solo fase y códigos, nunca la respuesta privada', async t => {
  t.mock.method(nodemailer, 'createTransport', () => cliente({ verify: async () => {
    throw Object.assign(Error('PASSWORD_Y_TOKEN_NO_PUBLICAR'), { code: 'EAUTH', command: 'AUTH LOGIN', responseCode: 535,
      response: '535 5.7.8 privado@example.test NO_PUBLICAR' });
  } }));
  await assert.rejects(smtp.crearTransporte(smtp.configuracion(env())).verificar(), e => {
    assert.equal(e.codigo, 'REAUTORIZAR_TRANSACCIONAL'); assert.equal(e.faseSmtp, 'AUTH');
    assert.equal(e.respuestaSmtp, 535); assert.equal(e.estadoSmtp, '5.7.8');
    assert.ok(!JSON.stringify(e).includes('NO_PUBLICAR')); assert.ok(!JSON.stringify(e).includes('@'));
    return true;
  });
});

for (const [respuesta, estado] of [[421, '4.7.0'], [452, '4.5.3'], [550, '5.4.5']]) test(`SMTP: cuota ${respuesta} se distingue sin reintentos`, async t => {
  let intentos = 0;
  t.mock.method(nodemailer, 'createTransport', () => cliente({ sendMail: async () => {
    intentos++; throw Object.assign(Error('PRIVADO'), { responseCode: respuesta, command: 'DATA', response: `${respuesta} ${estado} PRIVADO` });
  } }));
  await assert.rejects(smtp.crearTransporte(smtp.configuracion(env())).enviar(mensaje()), e => e.codigo === 'SMTP_CUOTA' && e.definitivo === true);
  assert.equal(intentos, 1);
});
