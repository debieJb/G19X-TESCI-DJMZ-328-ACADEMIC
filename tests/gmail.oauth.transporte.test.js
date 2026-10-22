const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const google = require('../services/googleOAuthClienteService');
const { entorno } = require('./soporte/gmailOAuth');
beforeEach(t => {
  entorno(t, { NODE_ENV: 'test', GOOGLE_OAUTH_CLIENT_ID: 'solo-pruebas.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secreto-solo-pruebas', GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/empresa/gmail/callback',
    GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
});

test('transporte Google: canje real de biblioteca con timeout, sin retries ni redirects', async t => {
  const transporte = Object.getPrototypeOf(google.crearCliente(google.configuracion()).transporter);
  const llamada = t.mock.method(transporte, 'request', async opciones => {
    assert.equal(opciones.url, 'https://oauth2.googleapis.com/token');
    assert.equal(opciones.method, 'POST'); assert.equal(opciones.timeout, 10000);
    assert.equal(opciones.retry, false); assert.equal(opciones.maxRedirects, 0);
    assert.equal(opciones.data.get('grant_type'), 'authorization_code');
    assert.equal(opciones.data.get('code_verifier'), 'verifier-solo-pruebas');
    assert.equal(opciones.data.get('client_id'), google.configuracion().clientId);
    assert.equal(opciones.data.get('client_secret'), google.configuracion().clientSecret);
    assert.equal(opciones.data.get('redirect_uri'), google.configuracion().redirectUri);
    return { data: { access_token: 'token-solo-pruebas', expires_in: 3600 }, headers: new Headers() };
  });
  const cliente = google.crearCliente(google.configuracion());
  const res = await cliente.getToken({ code: 'codigo-solo-pruebas', codeVerifier: 'verifier-solo-pruebas' });
  assert.equal(res.tokens.access_token, 'token-solo-pruebas');
  assert.equal(llamada.mock.callCount(), 1);
});

test('transporte Google: revocación no expone token en URL y sigue siendo POST oficial', async t => {
  const transporte = Object.getPrototypeOf(google.crearCliente(google.configuracion()).transporter);
  const llamada = t.mock.method(transporte, 'request', async opciones => {
    assert.equal(opciones.url, 'https://oauth2.googleapis.com/revoke');
    assert.equal(opciones.method, 'POST'); assert.equal(opciones.retry, false); assert.equal(opciones.maxRedirects, 0);
    assert.equal(opciones.data.get('token'), 'refresh-solo-pruebas');
    assert.equal(opciones.headers['Content-Type'], 'application/x-www-form-urlencoded');
    return { data: {}, status: 200, headers: new Headers() };
  });
  await google.crearCliente(google.configuracion()).revokeToken('refresh-solo-pruebas');
  assert.equal(llamada.mock.callCount(), 1);
});
