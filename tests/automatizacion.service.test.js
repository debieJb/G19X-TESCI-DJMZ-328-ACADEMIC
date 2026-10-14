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

test('servicio: POST JSON real con payload explícito y fechas UTC; acepta 204', async t => {
  const peticiones = [];
  const url = await servidor(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    peticiones.push({ method: req.method, type: req.headers['content-type'], body: JSON.parse(body) });
    res.writeHead(204).end();
  });
  configurar(t, url);
  await ejecutarCampana(campana);
  assert.deepEqual(peticiones, [{ method: 'POST', type: 'application/json', body: {
    id: campana._id, nombre: 'Campaña', objetivo: 'Objetivo', canal: 'email', estado: 'activa',
    asunto: campana.asunto, cuerpoTexto: campana.cuerpoTexto,
    fechaInicio: '2026-10-01T00:00:00.000Z', fechaFin: '2026-10-05T00:00:00.000Z',
    destinatarios: [destinatario], totalDestinatarios: 1, tipoDestinatarios: 'todos'
  } }]);
});

test('servicio: opcionales ausentes se envían como null y acepta 202 sin JSON', async t => {
  let recibido;
  const url = await servidor(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    recibido = JSON.parse(body);
    res.writeHead(202).end('Recibido');
  });
  configurar(t, url);
  await ejecutarCampana({ ...campana, fechaInicio: undefined, fechaFin: undefined });
  assert.equal(recibido.canal, 'email');
  for (const campo of ['fechaInicio', 'fechaFin']) assert.equal(recibido[campo], null);
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

test('servicio: acepta HTTPS y usa timeout de 10000 ms por defecto', async t => {
  configurar(t, 'https://example.invalid/webhook');
  let espera;
  t.mock.method(global, 'setTimeout', (callback, ms) => { espera = ms; return undefined; });
  const fetchMock = t.mock.method(global, 'fetch', async (url, opciones) => {
    assert.equal(url.protocol, 'https:');
    assert.equal(opciones.redirect, 'manual');
    return new Response(null, { status: 200 });
  });
  await ejecutarCampana(campana);
  assert.equal(espera, 10000);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('servicio: errores HTTP y redirecciones no generan reintentos ni seguimiento', async t => {
  let llamadas = 0;
  let status = 500;
  const url = await servidor(t, (req, res) => {
    llamadas++;
    res.writeHead(status, { Location: '/otro' }).end('DETALLE INTERNO');
  });
  configurar(t, url);
  for (status of [400, 401, 403, 404, 405, 429, 500, 503, 302, 307]) await assert.rejects(ejecutarCampana(campana), codigo('RESPUESTA'));
  assert.equal(llamadas, 10);
});

test('servicio: conexión interrumpida se clasifica sin reintentar', async t => {
  let llamadas = 0;
  const url = await servidor(t, (req) => { llamadas++; req.socket.destroy(); });
  configurar(t, url);
  await assert.rejects(ejecutarCampana(campana), codigo('CONEXION'));
  assert.equal(llamadas, 1);
});

test('servicio: timeout interrumpe la espera sin reintentar', async t => {
  let llamadas = 0;
  const url = await servidor(t, () => { llamadas++; });
  configurar(t, url, '150');
  await assert.rejects(ejecutarCampana(campana), codigo('TIMEOUT'));
  assert.equal(llamadas, 1);
});

test('email: webhook HTTP real conserva campos y agrega destinatarios sin solicitudes individuales', async t => {
  const empresa = '507f1f77bcf86cd799439012';
  const contactoId = '507f1f77bcf86cd799439013';
  const peticiones = [];
  const url = await servidor(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    peticiones.push(JSON.parse(body));
    res.writeHead(204).end();
  });
  configurar(t, url);
  t.mock.method(Empresa, 'findById', () => ({ select: async () => ({ automatizaciones: { email: { habilitada: true } } }) }));
  t.mock.method(Contacto.collection, 'find', filtro => {
    assert.equal(String(filtro.empresa), empresa); assert.equal(filtro.activo, true);
    return { toArray: async () => [{ _id: contactoId, nombre: 'Cliente', email: 'cliente@example.test', activo: true, privado: 'NO ENVIAR' }] };
  });
  await ejecutarCampana({ ...campana, empresa, destinatarios: { tipo: 'todos' } });
  assert.equal(peticiones.length, 1);
  const { destinatarios, totalDestinatarios, tipoDestinatarios, ...historico } = peticiones[0];
  assert.deepEqual(historico, { id: campana._id, nombre: campana.nombre, objetivo: campana.objetivo,
    asunto: campana.asunto, cuerpoTexto: campana.cuerpoTexto, canal: 'email', estado: 'activa',
    fechaInicio: '2026-10-01T00:00:00.000Z', fechaFin: '2026-10-05T00:00:00.000Z' });
  assert.deepEqual(destinatarios, [{ id: contactoId, nombre: 'Cliente', email: 'cliente@example.test', telefono: null }]);
  assert.equal(totalDestinatarios, 1); assert.equal(tipoDestinatarios, 'todos');
});

test('email: acceso empresarial se valida antes de resolver destinatarios', async t => {
  const empresa = '507f1f77bcf86cd799439012';
  const contactos = t.mock.method(Contacto, 'find', () => { throw new Error('No debe consultar contactos'); });
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('No debe enviar'); });
  await assert.rejects(emailService.ejecutarCampana({ ...campana, empresa, destinatarios: { tipo: 'todos' } },
    { rol: 'operador', empresa: campana._id }), codigo('ACCESO_DENEGADO'));
  assert.equal(contactos.mock.callCount(), 0); assert.equal(webhook.mock.callCount(), 0);
});
