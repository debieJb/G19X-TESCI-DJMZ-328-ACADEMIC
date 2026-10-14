const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const cifrado = require('../services/cifradoCredencialesService');
const Conexion = require('../models/ConexionGmail');
const Estado = require('../models/EstadoOAuth');
const google = require('../services/googleOAuthClienteService');
const { entorno, A, B } = require('./soporte/gmailOAuth');
beforeEach(t => {
  entorno(t, { NODE_ENV: 'test', GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    GOOGLE_OAUTH_CLIENT_ID: 'solo-pruebas.apps.googleusercontent.com', GOOGLE_OAUTH_CLIENT_SECRET: 'solo-pruebas-no-real',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/empresa/gmail/callback' });
});

test('cifrado: GCM usa IV diferente y se vincula a empresa y propósito', () => {
  const a = cifrado.cifrar('token-exclusivo-fixture', String(A), 'refresh');
  const b = cifrado.cifrar('token-exclusivo-fixture', String(A), 'refresh');
  assert.notEqual(a, b); assert.doesNotMatch(a, /token-exclusivo/);
  assert.equal(cifrado.descifrar(a, String(A), 'refresh'), 'token-exclusivo-fixture');
  assert.throws(() => cifrado.descifrar(a, String(B), 'refresh'), { codigo: 'CIFRADO' });
  assert.throws(() => cifrado.descifrar(a, String(A), 'access'), { codigo: 'CIFRADO' });
});

test('cifrado: rechaza manipulación, versión desconocida y clave incorrecta', () => {
  const valor = cifrado.cifrar('token-fixture', String(A), 'access');
  const partes = valor.split('.'); partes[2] = 'x'.repeat(22);
  for (const corrupto of [partes.join('.'), valor.replace('v1.', 'v2.'), 'texto-plano', '', null]) {
    assert.throws(() => cifrado.descifrar(corrupto, String(A), 'access'), { codigo: 'CIFRADO' });
  }
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
  assert.throws(() => cifrado.descifrar(valor, String(A), 'access'), { codigo: 'CIFRADO' });
});

test('configuración: no genera claves, credenciales ni conexiones si faltan variables', () => {
  for (const clave of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI', 'GMAIL_TOKEN_ENCRYPTION_KEY']) {
    const antes = process.env[clave]; delete process.env[clave];
    assert.equal(google.estaConfigurado(), false); assert.throws(() => google.configuracion(), { codigo: 'CONFIGURACION' });
    assert.equal(process.env[clave], undefined); process.env[clave] = antes;
  }
});

test('configuración: valida clave de 32 bytes base64 sin fallback', () => {
  for (const clave of ['', 'secreto', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64')]) {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = clave;
    assert.throws(() => cifrado.cifrar('fixture', String(A), 'refresh'), { codigo: 'CONFIGURACION' });
  }
});

test('configuración: callback fijo, HTTPS en producción y HTTP solo para loopback de desarrollo', () => {
  for (const url of ['http://externo.example.test/empresa/gmail/callback', 'https://example.test/otro',
    'https://usuario:secreto@example.test/empresa/gmail/callback', 'https://example.test/empresa/gmail/callback?x=1',
    'https://example.test/empresa/gmail/callback#x', 'https:\\example.test\\empresa/gmail/callback']) {
    process.env.GOOGLE_OAUTH_REDIRECT_URI = url;
    assert.throws(() => google.configuracion(), { codigo: 'CONFIGURACION' });
  }
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/empresa/gmail/callback';
  assert.ok(google.configuracion());
  process.env.NODE_ENV = 'production'; assert.throws(() => google.configuracion(), { codigo: 'CONFIGURACION' });
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.test/empresa/gmail/callback'; assert.ok(google.configuracion());
});

test('modelo Gmail: índices únicos empresariales y de identidad, tokens excluidos de serialización', async () => {
  const token = cifrado.cifrar('solo-pruebas', String(A), 'access');
  const doc = new Conexion({ empresa: A, accessTokenCifrado: token, refreshTokenCifrado: token,
    revocacionTokenCifrado: token, bloqueoRenovacion: 'privado', bloqueoHasta: new Date() });
  await doc.validate();
  for (const campo of ['accessTokenCifrado', 'refreshTokenCifrado', 'revocacionTokenCifrado', 'bloqueoRenovacion', 'bloqueoHasta']) {
    assert.equal(Conexion.schema.path(campo).options.select, false);
    assert.equal(doc.toJSON()[campo], undefined); assert.equal(doc.toObject()[campo], undefined);
  }
  assert.ok(Conexion.schema.indexes().some(([k, o]) => k.empresa === 1 && o.unique));
  assert.ok(Conexion.schema.indexes().some(([k, o]) => k.googleSub === 1 && o.unique && o.partialFilterExpression.googleSub.$type === 'string'));
  const existente = Conexion.hydrate({ empresa: A }); existente.empresa = B; assert.ok(existente.empresa.equals(A));
});

test('modelo Gmail: no admite empresa ausente, estado inválido o tokens en texto plano', async () => {
  for (const campos of [{}, { empresa: 'invalida' }, { empresa: A, estado: 'inventado' }, { empresa: A, refreshTokenCifrado: 'refresh-plano' }]) {
    await assert.rejects(new Conexion(campos).validate(), { name: 'ValidationError' });
  }
});

test('modelo estado: TTL, unicidad y secretos no serializables', async () => {
  const doc = new Estado({ hash: 'a'.repeat(64), empresa: A, usuario: B, sesionHash: 'b'.repeat(64), nonceHash: 'c'.repeat(64),
    verifierCifrado: 'secreto-fixture', clienteOAuthHash: 'd'.repeat(64), versionConexion: 0, expiraEn: new Date() });
  await doc.validate();
  assert.ok(Estado.schema.indexes().some(([k, o]) => k.expiraEn === 1 && o.expireAfterSeconds === 0));
  assert.ok(Estado.schema.indexes().some(([k, o]) => k.hash === 1 && o.unique));
  for (const campo of ['sesionHash', 'nonceHash', 'verifierCifrado']) {
    assert.equal(doc.toJSON()[campo], undefined); assert.equal(doc.toObject()[campo], undefined);
  }
  assert.equal(mongoose.connection.readyState, 0);
});
