const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const gmail = require('../services/gmailTransaccionalService');
const google = require('../services/googleOAuthClienteService');
const envFixture = () => ({ TRANSACTIONAL_GOOGLE_CLIENT_ID: 'transaccional-fixture.apps.googleusercontent.com',
  TRANSACTIONAL_GOOGLE_CLIENT_SECRET: randomBytes(24).toString('base64url'),
  TRANSACTIONAL_GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3001/oauth/callback',
  TRANSACTIONAL_GMAIL_SENDER: 'plataforma@example.test',
  TRANSACTIONAL_GMAIL_CREDENTIALS_FILE: path.join(os.tmpdir(), 'gmail-transaccional-fixture.cipher'),
  TRANSACTIONAL_GMAIL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), TRANSACTIONAL_PUBLIC_ORIGIN: 'https://plataforma.example.test' });
const mensaje = { remitente: 'plataforma@example.test', destino: 'destino@example.test', asunto: 'Verifica tu empresa', texto: 'Enlace ficticio de prueba' };
const clienteFalso = () => ({ setCredentials() {}, refreshAccessToken: async () => ({ credentials: { access_token: 'access-fixture' } }) });
const transporte = (solicitar, cliente = clienteFalso) => gmail.crearTransporte(gmail.configuracion(envFixture()), {
  credencial: { refreshToken: 'refresh-fixture' }, crearCliente: cliente, solicitar });

test('transaccional: permanece deshabilitado incluso con configuración completa', () => {
  assert.equal(gmail.crearCorreo(envFixture()).disponible, false);
  assert.equal(gmail.crearCorreo({ TRANSACTIONAL_EMAIL_ENABLED: 'false' }).disponible, false);
  assert.throws(() => gmail.crearCorreo({ TRANSACTIONAL_EMAIL_ENABLED: 'true' }), { codigo: 'CONFIGURACION_TRANSACCIONAL' });
});
test('transaccional: credenciales, clave y callback separados del OAuth empresarial', () => {
  const env = envFixture();
  for (const cambio of [{ GOOGLE_OAUTH_CLIENT_ID: env.TRANSACTIONAL_GOOGLE_CLIENT_ID },
    { GOOGLE_OAUTH_CLIENT_SECRET: env.TRANSACTIONAL_GOOGLE_CLIENT_SECRET },
    { GMAIL_TOKEN_ENCRYPTION_KEY: env.TRANSACTIONAL_GMAIL_ENCRYPTION_KEY },
    { TRANSACTIONAL_GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3001/otro' },
    { TRANSACTIONAL_GOOGLE_REDIRECT_URI: 'http://externo.example.test:3001/oauth/callback' },
    { TRANSACTIONAL_PUBLIC_ORIGIN: 'https://plataforma.example.test/?otro=1' },
    { TRANSACTIONAL_PUBLIC_ORIGIN: 'http://plataforma.example.test' },
    { TRANSACTIONAL_GMAIL_CREDENTIALS_FILE: path.join(__dirname, '../credencial.json') }]) {
    assert.throws(() => gmail.configuracion({ ...env, ...cambio }), { codigo: 'CONFIGURACION_TRANSACCIONAL' });
  }
});
test('transaccional: cifrado autenticado aleatorio y ajeno a la clave empresarial', () => {
  const config = gmail.configuracion(envFixture()), texto = JSON.stringify({ refreshToken: 'refresh-fixture' });
  const a = config.cifrado.cifrar(texto), b = config.cifrado.cifrar(texto);
  assert.notEqual(a, b); assert.equal(config.cifrado.descifrar(a), texto);
  const p = a.split('.'); p[2] = randomBytes(16).toString('base64url');
  assert.throws(() => config.cifrado.descifrar(p.join('.')));
  assert.throws(() => gmail.configuracion(envFixture()).cifrado.descifrar(a));
});
const flujoOAuth = (cambio = {}) => {
  const config = gmail.configuracion(envFixture()); let parametros, intercambios = 0;
  const cliente = { generateAuthUrl: p => { parametros = p; return 'https://accounts.google.com/o/oauth2/v2/auth'; },
    getToken: async p => { intercambios++; assert.ok(p.codeVerifier); return { tokens: { id_token: 'id-fixture', refresh_token: 'refresh-fixture', scope: google.SCOPES.join(' '), ...cambio.tokens } }; },
    verifyIdToken: async p => { assert.equal(p.audience, config.clientId); return { getPayload: () => ({ email: config.remitente,
      email_verified: true, sub: 'identidad-fixture', nonce: parametros.nonce, ...cambio.identidad }) }; } };
  const flujo = gmail.iniciarOAuth(config, () => cliente);
  const query = () => new URLSearchParams({ state: parametros.state, code: 'code-fixture' });
  return { flujo, parametros, query, config, intercambios: () => intercambios };
};
test('OAuth plataforma: PKCE, state, nonce, acceso offline y solo scope Gmail de envío', async () => {
  const f = flujoOAuth();
  assert.deepEqual(f.parametros.scope, ['openid', 'email', google.GMAIL_SEND]);
  assert.equal(f.parametros.code_challenge_method, 'S256'); assert.equal(f.parametros.access_type, 'offline');
  const cifrada = await f.flujo.completar(f.query());
  assert.ok(!cifrada.includes('refresh-fixture'));
  const doc = JSON.parse(f.config.cifrado.descifrar(cifrada));
  assert.equal(doc.email, f.config.remitente); assert.equal(doc.clienteHash, f.config.hash);
  await assert.rejects(f.flujo.completar(f.query()), { codigo: 'ESTADO_OAUTH_INVALIDO' });
  assert.equal(f.intercambios(), 1);
});
test('OAuth plataforma: state inválido o duplicado no intercambia el código', async () => {
  for (const duplicado of [false, true]) {
    const f = flujoOAuth(), query = f.query();
    if (duplicado) query.append('state', f.parametros.state); else query.set('state', 'x'.repeat(43));
    await assert.rejects(f.flujo.completar(query), { codigo: 'ESTADO_OAUTH_INVALIDO' }); assert.equal(f.intercambios(), 0);
  }
});
test('OAuth plataforma: autorización caducada no intercambia código', async t => {
  const f = flujoOAuth(), ahora = Date.now(); t.mock.method(Date, 'now', () => ahora + 6 * 60000);
  await assert.rejects(f.flujo.completar(f.query()), { codigo: 'ESTADO_OAUTH_INVALIDO' }); assert.equal(f.intercambios(), 0);
});
test('OAuth plataforma: rechaza identidad ajena/no verificada, nonce, scope y refresh ausentes', async () => {
  for (const cambio of [{ identidad: { email: 'otra@example.test' } }, { identidad: { email_verified: false } },
    { identidad: { nonce: 'otro' } }, { tokens: { scope: 'openid email' } }, { tokens: { refresh_token: undefined } }]) {
    const f = flujoOAuth(cambio);
    await assert.rejects(f.flujo.completar(f.query()), { codigo: 'AUTORIZACION_TRANSACCIONAL_INVALIDA' });
  }
});
test('OAuth plataforma: cancelar consume state sin intercambio ni reintento', async () => {
  const f = flujoOAuth(), query = f.query(); query.set('error', 'access_denied');
  await assert.rejects(f.flujo.completar(query), { codigo: 'OAUTH_RECHAZADO' });
  await assert.rejects(f.flujo.completar(f.query()), { codigo: 'ESTADO_OAUTH_INVALIDO' }); assert.equal(f.intercambios(), 0);
});
test('transaccional: lee solo credencial cifrada con identidad y cliente vinculados', t => {
  const config = gmail.configuracion(envFixture()), fs = require('node:fs');
  const doc = { version: 1, clienteHash: config.hash, email: config.remitente, refreshToken: 'refresh-fixture' };
  t.mock.method(fs, 'lstatSync', () => ({ isFile: () => true, isSymbolicLink: () => false, size: 100 }));
  const leer = t.mock.method(fs, 'readFileSync', () => config.cifrado.cifrar(JSON.stringify(doc)));
  assert.equal(gmail.cargarCredencial(config).email, config.remitente);
  doc.clienteHash = 'cliente-ajeno'; assert.throws(() => gmail.cargarCredencial(config), { codigo: 'CREDENCIAL_TRANSACCIONAL_INVALIDA' });
  assert.equal(leer.mock.callCount(), 2);
});
test('transporte plataforma: POST único MIME, remitente fijo y sin reintentos', async () => {
  let llamadas = 0;
  const t = transporte(async (url, opciones) => {
    llamadas++; assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(opciones.redirect, 'manual'); assert.equal(opciones.method, 'POST');
    const raw = Buffer.from(JSON.parse(opciones.body).raw, 'base64url').toString();
    assert.match(raw, /From: plataforma@example.test/); assert.match(raw, /To: destino@example.test/);
    return new Response(JSON.stringify({ id: 'id-fixture' }));
  });
  assert.deepEqual(await t.enviar(mensaje, { signal: new AbortController().signal }), { aceptado: true, mensajeId: 'id-fixture' });
  assert.equal(llamadas, 1);
  await assert.rejects(t.enviar({ ...mensaje, remitente: 'otra@example.test' }), { codigo: 'REMITENTE_INVALIDO' });
  assert.equal(llamadas, 1);
});
for (const status of [401, 403, 429, 500, 302]) {
  test(`transporte plataforma: HTTP ${status} clasifica sin reintento`, async () => {
    let llamadas = 0;
    const t = transporte(async () => { llamadas++; return new Response('', { status }); });
    await assert.rejects(t.enviar(mensaje), e => e.codigo === 'GMAIL_TRANSACCIONAL_RECHAZADO'
      && e.definitivo === [401, 403, 429].includes(status)
      && e.requiereAutorizacion === [401, 403].includes(status));
    assert.equal(llamadas, 1);
  });
}
test('transporte plataforma: desconexión y respuesta ilegible quedan inciertas', async () => {
  for (const solicitar of [async () => { throw Error('sin red'); }, async () => new Response('no json'), async () => new Response('x'.repeat(17000))]) {
    await assert.rejects(transporte(solicitar).enviar(mensaje), { codigo: 'ENTREGA_INCIERTA', definitivo: false });
  }
});
test('transporte plataforma: OAuth fallido o cancelado no produce POST tardío', async () => {
  let llamadas = 0; const solicitar = async () => { llamadas++; };
  await assert.rejects(transporte(solicitar, () => ({ setCredentials() {}, refreshAccessToken: async () => { throw Error('invalid_grant'); } })).enviar(mensaje), { codigo: 'REAUTORIZAR_TRANSACCIONAL' });
  const abort = new AbortController(); abort.abort();
  await assert.rejects(transporte(solicitar).enviar(mensaje, { signal: abort.signal }), { codigo: 'ENTREGA_CANCELADA' });
  assert.equal(llamadas, 0);
});
test('trabajador y autorizador: importación y comprobación no envían ni conectan MongoDB', async t => {
  t.mock.method(require('mongoose'), 'createConnection', () => { throw Error('CONEXION_REAL_PROHIBIDA'); });
  t.mock.method(global, 'fetch', () => { throw Error('RED_REAL_PROHIBIDA'); });
  assert.deepEqual(await require('../scripts/despacharVerificacion').principal(['--comprobar']), { estado: 'sin_envios' });
  await assert.rejects(require('../scripts/despacharVerificacion').principal([]));
  await assert.rejects(require('../scripts/autorizarGmailTransaccional').principal([]));
  const supervisor = await require('../scripts/supervisarVerificacion').principal(['--comprobar']);
  assert.equal(supervisor.codigo, 0); assert.equal(supervisor.reinicios, 0); assert.equal(supervisor.estado, 'comprobacion_sin_envios');
});
