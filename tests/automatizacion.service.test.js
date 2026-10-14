const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ejecutarCampana: ejecutarConUsuario, ErrorAutomatizacion } = require('../services/automatizacionService');
const ejecutarCampana = campana => ejecutarConUsuario(campana, { rol: 'superadmin' });
const emailService = require('../services/emailService');
const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');

const campana = {
  empresa: '507f1f77bcf86cd799439012', destinatarios: { tipo: 'todos' },
  _id: '507f1f77bcf86cd799439011', nombre: 'Campaña', objetivo: 'Objetivo',
  canal: 'email', estado: 'activa', fechaInicio: new Date('2026-10-01'),
  asunto: 'Asunto de prueba', cuerpoTexto: 'Hola,\n\nContenido de prueba.',
  fechaFin: new Date('2026-10-05'), privado: 'NO ENVIAR'
};
const destinatario = { id: '507f1f77bcf86cd799439013', nombre: 'Cliente', email: 'cliente@example.test', telefono: null };
beforeEach(t => {
  t.mock.method(Empresa, 'findById', () => ({ select: async () => ({ automatizaciones: { email: { habilitada: true } } }) }));
  t.mock.method(Contacto.collection, 'find', filtro => {
    assert.equal(String(filtro.empresa), campana.empresa);
    assert.equal(filtro.activo, true);
    return { toArray: async () => [{ _id: destinatario.id, nombre: destinatario.nombre, email: destinatario.email, activo: true }] };
  });
});

const configurar = (t, url, timeout) => {
  const anteriores = [process.env.N8N_WEBHOOK_URL, process.env.N8N_WEBHOOK_TIMEOUT_MS];
  for (const [clave, valor] of [['N8N_WEBHOOK_URL', url], ['N8N_WEBHOOK_TIMEOUT_MS', timeout]]) {
    if (valor === undefined) delete process.env[clave]; else process.env[clave] = valor;
  }
  t.after(() => {
    for (const [i, clave] of ['N8N_WEBHOOK_URL', 'N8N_WEBHOOK_TIMEOUT_MS'].entries()) {
      if (anteriores[i] === undefined) delete process.env[clave]; else process.env[clave] = anteriores[i];
    }
  });
};

const servidor = async (t, handler) => {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}/webhook`;
};

const codigo = esperado => error => {
  assert.ok(error instanceof ErrorAutomatizacion);
  assert.equal(error.codigo, esperado);
  assert.ok(!error.message.includes('http'));
  return true;
};

test('selector y manejador email: canales no disponibles nunca hacen peticiones', async t => {
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('Acceso externo prohibido'); });
  const email = t.mock.method(emailService, 'ejecutarCampana');
  for (const canal of ['whatsapp', 'facebook', 'linkedin', 'redes_sociales', 'sms', 'otro', undefined, null, '', 'desconocido', 'constructor', '__proto__']) {
    await assert.rejects(ejecutarCampana({ ...campana, canal }), codigo('CANAL_NO_DISPONIBLE'));
  }
  assert.equal(email.mock.callCount(), 0);
  for (const canal of ['whatsapp', 'facebook', 'linkedin', 'redes_sociales', 'sms', 'otro', undefined, null, '', 'desconocido']) {
    await assert.rejects(emailService.ejecutarCampana({ ...campana, canal }), codigo('CANAL_NO_DISPONIBLE'));
  }
  assert.equal(webhook.mock.callCount(), 0);
});

test('bloqueo temporal: transporte 204 no recibe solicitudes', async t => {
  let recibidas = 0;
  const url = await servidor(t, (req, res) => { recibidas++; res.writeHead(204).end(); });
  configurar(t, url);
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  for (const ejecutar of [ejecutarCampana, c => emailService.ejecutarCampana(c, { rol: 'superadmin' })]) {
    await assert.rejects(ejecutar(campana), codigo('ENVIOS_BLOQUEADOS'));
  }
  assert.equal(recibidas, 0);
  assert.equal(webhook.mock.callCount(), 0);
});

test('bloqueo temporal: transporte 202 no recibe solicitudes', async t => {
  let recibidas = 0;
  const url = await servidor(t, (req, res) => { recibidas++; res.writeHead(202).end(); });
  configurar(t, url);
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  for (const ejecutar of [ejecutarCampana, c => emailService.ejecutarCampana(c, { rol: 'superadmin' })]) {
    await assert.rejects(ejecutar(campana), codigo('ENVIOS_BLOQUEADOS'));
  }
  assert.equal(recibidas, 0);
  assert.equal(webhook.mock.callCount(), 0);
});

test('email: contenido ausente, vacío o inválido impide peticiones incluso al invocar el manejador directamente', async t => {
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('Acceso externo prohibido'); });
  for (const ejecutar of [ejecutarCampana, emailService.ejecutarCampana]) {
    for (const campo of ['asunto', 'cuerpoTexto']) {
      for (const valor of [undefined, null, '', ' \n\t ', 12, {}]) {
        await assert.rejects(ejecutar({ ...campana, [campo]: valor }), codigo('CONTENIDO_EMAIL_INCOMPLETO'));
      }
    }
  }
  assert.equal(webhook.mock.callCount(), 0);
});

test('servicio: configuración inválida impide cualquier petición', async t => {
  configurar(t, undefined);
  const fetchMock = t.mock.method(global, 'fetch', () => { throw new Error('No debe llamarse'); });
  for (const url of [undefined, '', 'invalida', 'ftp://localhost/webhook', 'file:///tmp/webhook', 'http://user:pass@localhost/']) {
    if (url === undefined) delete process.env.N8N_WEBHOOK_URL; else process.env.N8N_WEBHOOK_URL = url;
    await assert.rejects(ejecutarCampana(campana), codigo('CONFIGURACION'));
  }
  process.env.N8N_WEBHOOK_URL = 'https://example.invalid/webhook';
  for (const timeout of ['', 'abc', '0', '-1', '1.5', '2147483648']) {
    process.env.N8N_WEBHOOK_TIMEOUT_MS = timeout;
    await assert.rejects(ejecutarCampana(campana), codigo('CONFIGURACION'));
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('bloqueo temporal: transporte 200 no recibe solicitudes', async t => {
  let recibidas = 0;
  const url = await servidor(t, (req, res) => { recibidas++; res.writeHead(200).end(); });
  configurar(t, url);
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  for (const ejecutar of [ejecutarCampana, c => emailService.ejecutarCampana(c, { rol: 'superadmin' })]) {
    await assert.rejects(ejecutar(campana), codigo('ENVIOS_BLOQUEADOS'));
  }
  assert.equal(recibidas, 0);
  assert.equal(webhook.mock.callCount(), 0);
});

test('bloqueo temporal: transporte 302 no recibe solicitudes', async t => {
  let recibidas = 0;
  const url = await servidor(t, (req, res) => { recibidas++; res.writeHead(302).end(); });
  configurar(t, url);
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  for (const ejecutar of [ejecutarCampana, c => emailService.ejecutarCampana(c, { rol: 'superadmin' })]) {
    await assert.rejects(ejecutar(campana), codigo('ENVIOS_BLOQUEADOS'));
  }
  assert.equal(recibidas, 0);
  assert.equal(webhook.mock.callCount(), 0);
});

test('bloqueo temporal: transporte 500 no recibe solicitudes', async t => {
  let recibidas = 0;
  const url = await servidor(t, (req, res) => { recibidas++; res.writeHead(500).end(); });
  configurar(t, url);
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  for (const ejecutar of [ejecutarCampana, c => emailService.ejecutarCampana(c, { rol: 'superadmin' })]) {
    await assert.rejects(ejecutar(campana), codigo('ENVIOS_BLOQUEADOS'));
  }
  assert.equal(recibidas, 0);
  assert.equal(webhook.mock.callCount(), 0);
});

test('bloqueo temporal: transporte 429 no recibe solicitudes', async t => {
  let recibidas = 0;
  const url = await servidor(t, (req, res) => { recibidas++; res.writeHead(429).end(); });
  configurar(t, url);
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  for (const ejecutar of [ejecutarCampana, c => emailService.ejecutarCampana(c, { rol: 'superadmin' })]) {
    await assert.rejects(ejecutar(campana), codigo('ENVIOS_BLOQUEADOS'));
  }
  assert.equal(recibidas, 0);
  assert.equal(webhook.mock.callCount(), 0);
});

test('bloqueo temporal: transporte 307 no recibe solicitudes', async t => {
  let recibidas = 0;
  const url = await servidor(t, (req, res) => { recibidas++; res.writeHead(307).end(); });
  configurar(t, url);
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  for (const ejecutar of [ejecutarCampana, c => emailService.ejecutarCampana(c, { rol: 'superadmin' })]) {
    await assert.rejects(ejecutar(campana), codigo('ENVIOS_BLOQUEADOS'));
  }
  assert.equal(recibidas, 0);
  assert.equal(webhook.mock.callCount(), 0);
});

test('email: acceso empresarial se valida antes de resolver destinatarios', async t => {
  const empresa = '507f1f77bcf86cd799439012';
  const contactos = t.mock.method(Contacto, 'find', () => { throw new Error('No debe consultar contactos'); });
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No debe enviar'); });
  await assert.rejects(emailService.ejecutarCampana({ ...campana, empresa, destinatarios: { tipo: 'todos' } },
    { rol: 'operador', empresa: campana._id }), codigo('ACCESO_DENEGADO'));
  assert.equal(contactos.mock.callCount(), 0); assert.equal(webhook.mock.callCount(), 0);
});
