const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const crearSesion = require('../config/session');

// Doble en memoria únicamente para probar HTTP; no es infraestructura desplegable.
class StoreSimulado extends session.Store {
  get(id, cb) { cb(null, null); }
  set(id, datos, cb) { cb(null); }
  touch(id, datos, cb) { cb(null); }
}
const appSesion = (opciones = {}) => {
  const app = express();
  crearSesion.configurarProxy(app, opciones);
  app.use(crearSesion({ secret: randomBytes(32).toString('hex'), ...opciones }));
  app.get('/', (req, res) => { req.session.visita = true; res.sendStatus(200); });
  return app;
};

test('sesión local permite HTTP y mantiene HttpOnly y SameSite=Lax', async () => {
  const res = await request(appSesion({ entorno: 'development' })).get('/');
  const cookie = res.headers['set-cookie'].join(';');
  assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax'));
  assert.ok(!cookie.includes('; Secure'));
});

test('producción rechaza almacén ausente, MemoryStore y secreto corto', () => {
  for (const store of [undefined, new session.MemoryStore()]) {
    assert.throws(() => appSesion({ entorno: 'production', store }), /MemoryStore/);
  }
  assert.throws(() => appSesion({ entorno: 'production', store: new StoreSimulado(), secret: randomBytes(4).toString('hex') }), /32 bytes/);
});

test('producción solo emite cookie Secure tras HTTPS reconocido de proxy explícito', async () => {
  const opciones = { entorno: 'production', store: new StoreSimulado() };
  const directo = await request(appSesion(opciones)).get('/').set('X-Forwarded-Proto', 'https');
  assert.equal(directo.headers['set-cookie'], undefined);
  const confiable = appSesion({ ...opciones, trustProxy: ['127.0.0.1/32', '::1/128'] });
  const http = await request(confiable).get('/').set('X-Forwarded-Proto', 'http');
  assert.equal(http.headers['set-cookie'], undefined);
  const https = await request(confiable).get('/').set('X-Forwarded-Proto', 'https');
  const cookie = https.headers['set-cookie'].join(';');
  assert.ok(cookie.includes('; Secure') && cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax'));
  const ajeno = await request(appSesion({ ...opciones, trustProxy: ['192.0.2.1/32'] })).get('/').set('X-Forwarded-Proto', 'https');
  assert.equal(ajeno.headers['set-cookie'], undefined);
});

test('trust proxy rechaza confianza global, saltos y redes inválidas', () => {
  for (const trustProxy of [true, 1, 'loopback', ['0.0.0.0/0'], ['::/0'], ['127.0.0.1/33'], ['invalid']]) {
    assert.throws(() => appSesion({ trustProxy }), /trustProxy/);
  }
});
