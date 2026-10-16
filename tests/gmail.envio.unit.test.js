const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mime = require('../services/gmailMimeService');
const api = require('../services/gmailApiTransporteService');
const { consentimiento } = require('../services/elegibilidadEmailService');
const { obtenerPolitica } = require('../config/enviosGmail');
const { crearMotor } = require('../services/motorEnviosGmailService');
const empresa = '507f1f77bcf86cd799439011';
beforeEach(t => {
  const claves = ['GMAIL_CAMPAIGNS_ENABLED', 'GMAIL_CAMPAIGNS_PILOT_COMPANIES'];
  const antes = claves.map(k => process.env[k]);
  t.after(() => claves.forEach((k, i) => { if (antes[i] === undefined) delete process.env[k]; else process.env[k] = antes[i]; }));
  delete process.env.GMAIL_CAMPAIGNS_ENABLED; delete process.env.GMAIL_CAMPAIGNS_PILOT_COMPANIES;
});
const mensaje = () => ({ remitente: 'empresa@example.test', destinatario: 'persona@example.test', asunto: 'Información: campaña ágil',
  cuerpoTexto: 'Primera línea\nSegunda línea', mensajeId: randomBytes(32).toString('hex') + '@example.test' });
const activar = () => { process.env.GMAIL_CAMPAIGNS_ENABLED = 'true'; process.env.GMAIL_CAMPAIGNS_PILOT_COMPANIES = empresa; };
test('MIME: Unicode, cuerpo base64 y base64url exterior sin destinatarios adicionales', () => {
  const datos = mensaje(), raw = mime.construir(datos), texto = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(raw, /^[A-Za-z0-9_-]+$/); assert.match(texto, /MIME-Version: 1.0/);
  assert.match(texto, /Subject: =\?UTF-8\?B\?/); assert.doesNotMatch(texto, /\r\n(?:Bcc|Cc):/);
  const cuerpo = texto.split('\r\n\r\n')[1].replace(/\s/g, '');
  assert.ok(Buffer.from(cuerpo, 'base64').toString('utf8').includes('Segunda línea'));
});
test('MIME: rechaza inyección de cabeceras, contenido excesivo y asunto inválido', () => {
  for (const cambio of [{ remitente: 'a@example.test\r\nBcc:b@example.test' }, { destinatario: 'a@example.test,b@example.test' },
    { asunto: 'Asunto\r\nBcc: a@example.test' }, { asunto: '' }, { cuerpoTexto: 'a'.repeat(256 * 1024 + 1) }]) {
    assert.throws(() => mime.construir({ ...mensaje(), ...cambio }));
  }
});
test('consentimiento único: ausente, revocado, futuro o sin fuente no habilita email', () => {
  const c = { activo: true, email: 'a@example.test', canales: { email: true }, consentimientoMarketing: { estado: 'otorgado', fecha: new Date(0), fuente: 'Formulario' } };
  assert.equal(consentimiento(c), true);
  for (const cambio of [{ consentimientoMarketing: undefined }, { canales: {} }, { activo: false },
    { consentimientoMarketing: { ...c.consentimientoMarketing, estado: 'revocado' } },
    { consentimientoMarketing: { ...c.consentimientoMarketing, fuente: '' } },
    { consentimientoMarketing: { ...c.consentimientoMarketing, fecha: new Date(Date.now() + 60000) } }]) assert.equal(consentimiento({ ...c, ...cambio }), false);
});
test('bandera y lista de empresas: cierre predeterminado antes de DB y transporte', async t => {
  assert.equal(obtenerPolitica().habilitado, false); let llamadas = 0;
  t.mock.method(global, 'fetch', () => { llamadas++; throw Error(); });
  await assert.rejects(api.enviar({ accessToken: randomBytes(32).toString('hex'), raw: mime.construir(mensaje()), empresa }), { codigo: 'ENVIOS_BLOQUEADOS' });
  await assert.rejects(crearMotor({ conexion: {} }).encolar({}), { codigo: 'ENVIOS_BLOQUEADOS' });
  assert.equal(llamadas, 0);
  process.env.GMAIL_CAMPAIGNS_ENABLED = 'true'; assert.equal(obtenerPolitica().habilitado, false);
});
test('Gmail API: POST fijo, sin redirects ni retry; aceptación no es entrega', async t => {
  activar(); let llamadas = 0;
  const token = randomBytes(32).toString('hex');
  t.mock.method(global, 'fetch', async (url, opciones) => {
    llamadas++; assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(opciones.method, 'POST'); assert.equal(opciones.redirect, 'manual');
    assert.ok(opciones.headers.Authorization === `Bearer ${token}`);
    return new Response(JSON.stringify({ id: 'gmail-1', threadId: 'thread-1' }));
  });
  const r = await api.enviar({ accessToken: token, raw: mime.construir(mensaje()), empresa });
  assert.equal(r.gmailId, 'gmail-1'); assert.equal(r.entregado, undefined); assert.equal(llamadas, 1);
});
for (const [status, codigo, incierto] of [[401, 'REAUTORIZAR', false], [403, 'PERMISO_PROVEEDOR', false], [429, 'CUOTA_PROVEEDOR', false], [408, 'RECHAZO_PROVEEDOR', true], [503, 'RECHAZO_PROVEEDOR', true]]) {
  test(`Gmail API: HTTP ${status} se clasifica sin reintentar`, async t => {
    activar(); let llamadas = 0;
    t.mock.method(global, 'fetch', async () => { llamadas++; return new Response('', { status }); });
    await assert.rejects(api.enviar({ accessToken: randomBytes(32).toString('hex'), raw: mime.construir(mensaje()), empresa }), e => e.codigo === codigo && e.incierto === incierto);
    assert.equal(llamadas, 1);
  });
}
test('Gmail API: 403 por cuota se distingue de revocación sin exponer respuesta', async t => {
  activar();
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }), { status: 403 }));
  await assert.rejects(api.enviar({ accessToken: randomBytes(32).toString('hex'), raw: mime.construir(mensaje()), empresa }), { codigo: 'CUOTA_PROVEEDOR', incierto: false });
});
test('Gmail API: respuesta ilegible o incompleta y corte de conexión son inciertos', async t => {
  activar();
  const entrada = { accessToken: randomBytes(32).toString('hex'), raw: mime.construir(mensaje()), empresa };
  for (const respuesta of ['invalido', '{}', JSON.stringify({ id: 'id' })]) {
    const mock = t.mock.method(global, 'fetch', async () => new Response(respuesta));
    await assert.rejects(api.enviar(entrada), e => e.incierto === true);
    mock.mock.restore();
  }
  t.mock.method(global, 'fetch', async () => { throw Error(); });
  await assert.rejects(api.enviar(entrada), { codigo: 'CONEXION', incierto: true });
});
