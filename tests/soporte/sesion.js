const session = require('express-session');
const { createHmac, randomBytes } = require('node:crypto');
const supertest = require('supertest');
const Usuario = require('../../models/Usuario');

// Sesión real en MemoryStore; la autenticación del login tiene su propia suite.
const crearContexto = (t, usuario) => {
  const secret = 'secreto-exclusivo-fixture-multiempresa';
  const store = new session.MemoryStore();
  const app = require('../../app').crearApp({ secret, store });
  const sid = randomBytes(24).toString('hex');
  store.set(sid, { cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000), httpOnly: true, path: '/' }, usuarioId: String(usuario._id) });
  const firma = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `marketing.sid=${encodeURIComponent(`s:${sid}.${firma}`)}`;
  t.mock.method(Usuario, 'findById', () => ({ select: () => ({ populate: () => ({ lean: async () => usuario }) }) }));
  t.after(() => store.clear());
  const cliente = Object.fromEntries(['get', 'post'].map(metodo => [metodo, ruta => supertest(app)[metodo](ruta).set('Cookie', cookie)]));
  return { app, cliente, store };
};
module.exports = { crearContexto };
