const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, createSign } = require('node:crypto');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [obj, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(obj, metodo, () => { throw new Error('Acceso externo prohibido'); });
}
mock.method(global, 'fetch', () => { throw new Error('Sin llamadas externas'); });
const google = require('../services/googleOAuthClienteService');
const service = require('../services/gmailOAuthService');
const { crearFixture, A, usuario } = require('./soporte/gmailOAuth');
// Claves efímeras de prueba, nunca se escriben ni representan a Google real.
const claves = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otras = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwt = (payload, clave = claves.privateKey) => {
  const datos = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'solo-pruebas' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url')].join('.');
  const firmador = createSign('RSA-SHA256'); firmador.update(datos); firmador.end();
  return `${datos}.${firmador.sign(clave).toString('base64url')}`;
};
let fixture;
beforeEach(t => { fixture = crearFixture(t); });

for (const caso of ['valida', 'firma_incorrecta', 'audiencia', 'emisor', 'expirado', 'nonce']) {
  test(`OAuth identidad: biblioteca oficial verifica firma y claims (${caso}) sin red`, async t => {
    const url = new URL(await service.iniciar(usuario(), 'sesion-pruebas'));
    const query = { state: url.searchParams.get('state'), code: 'codigo-solo-pruebas' };
    const ahora = Math.floor(Date.now() / 1000);
    const payload = { sub: 'identidad-pruebas', email: 'firma@example.test', email_verified: true,
      nonce: url.searchParams.get('nonce'), aud: google.configuracion().clientId, iss: 'https://accounts.google.com', iat: ahora, exp: ahora + 3600 };
    if (caso === 'audiencia') payload.aud = 'otra-app';
    if (caso === 'emisor') payload.iss = 'https://intruso.example.test';
    if (caso === 'expirado') { payload.iat = ahora - 7200; payload.exp = ahora - 3600; }
    if (caso === 'nonce') payload.nonce = 'otro-nonce';
    const firmado = jwt(payload, caso === 'firma_incorrecta' ? otras.privateKey : claves.privateKey);
    fixture.crearClienteMock.mock.restore();
    const cliente = google.crearCliente(google.configuracion());
    t.mock.method(cliente, 'getToken', async () => ({ tokens: { ...fixture.provider.tokens(), id_token: firmado } }));
    const certificados = t.mock.method(cliente.transporter, 'request', async opciones => {
      assert.match(String(opciones.url), /googleapis.com|accounts.google.com/);
      return { data: { 'solo-pruebas': claves.publicKey.export({ type: 'spki', format: 'pem' }) }, headers: new Headers({ 'cache-control': 'max-age=3600' }) };
    });
    t.mock.method(google, 'crearCliente', () => cliente);
    if (caso === 'valida') {
      await service.completar(usuario(), 'sesion-pruebas', query);
      assert.equal(fixture.conexiones.get(String(A)).estado, 'conectada');
    } else {
      await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo: 'IDENTIDAD' });
      assert.equal(fixture.conexiones.get(String(A)).estado, 'desconectada');
    }
    assert.equal(certificados.mock.callCount(), 1);
  });
}
