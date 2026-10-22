const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarOrigen, validarServidorLocal } = require('../services/origenTransaccionalService');
const smtp = require('../services/smtpTransaccionalService');
test('origen transaccional: HTTP solo loopback en development; producción siempre HTTPS', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(validarOrigen(`http://${host}:3000`, { entorno: 'development' }).protocol, 'http:');
    assert.throws(() => validarOrigen(`http://${host}:3000`, { entorno: 'production', simulado: true }));
  }
  for (const url of ['http://externo.test:3000', 'http://localhost.evil.test', 'http://user:pass@localhost:3000', 'http://localhost:3000/ruta', 'http://localhost:3000/?token=dato']) assert.throws(() => validarOrigen(url, { entorno: 'development' }));
  assert.throws(() => validarOrigen('http://localhost:3000', { entorno: undefined }));
  assert.equal(validarOrigen('https://plataforma.example.test', { entorno: 'production' }).protocol, 'https:');
});
test('origen transaccional: arranque local detecta enlace hacia instancia HTTPS de otro puerto', () => {
  const env = { NODE_ENV: 'development', TRANSACTIONAL_EMAIL_ENABLED: 'true', PORT: '3000' };
  assert.throws(() => validarServidorLocal({ ...env, TRANSACTIONAL_PUBLIC_ORIGIN: 'https://localhost:3100' }), /ORIGEN_NO_COINCIDE/);
  assert.doesNotThrow(() => validarServidorLocal({ ...env, TRANSACTIONAL_PUBLIC_ORIGIN: 'http://localhost:3000' }));
});
test('SMTP: configuración y generador de enlaces comparten la política local sin modificar secretos', () => {
  const env = { NODE_ENV: 'development', TRANSACTIONAL_EMAIL_ENABLED: 'true', EMAIL_USER: 'prueba@example.test', EMAIL_PASS: 'sintetica', TRANSACTIONAL_PUBLIC_ORIGIN: 'http://localhost:3000' };
  assert.equal(smtp.crearCorreo(env).disponible, true);
  assert.throws(() => smtp.crearCorreo({ ...env, NODE_ENV: 'production' }), { codigo: 'ORIGEN_SMTP_INVALIDO' });
});
