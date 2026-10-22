const session = require('express-session');
const { createHmac, randomBytes } = require('node:crypto');
const supertest = require('supertest');
const Usuario = require('../../models/Usuario');

// Sesión real en MemoryStore; la autenticación del login tiene su propia suite.
const crearContexto = (t, usuario, { csrf = true } = {}) => {
  // Los recorridos HTTP de esta fixture no consultan ejecuciones en MongoDB real.
  t.mock.method(require('../../models/EjecucionGmail').collection, 'findOne', async () => null);
  const secret = 'secreto-exclusivo-fixture-multiempresa';
  const store = new session.MemoryStore();
  const app = require('../../app').crearApp({ secret, store });
  const sid = randomBytes(24).toString('hex');
  const adminCsrf = randomBytes(32).toString('base64url');
  const campanaCsrf = randomBytes(32).toString('base64url');
  const contactoCsrf = randomBytes(32).toString('base64url');
  store.set(sid, { cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000), httpOnly: true, path: '/' }, usuarioId: String(usuario._id), adminCsrf, campanaCsrf, contactoCsrf });
  const firma = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `marketing.sid=${encodeURIComponent(`s:${sid}.${firma}`)}`;
  t.mock.method(Usuario, 'findById', () => ({ select: () => ({ populate: () => ({ lean: async () => usuario }) }) }));
  t.after(() => store.clear());
  const cliente = Object.fromEntries(['get', 'post'].map(metodo => [metodo, ruta => {
    const peticion = supertest(app)[metodo](ruta).set('Cookie', cookie);
    if (csrf && metodo === 'post' && usuario.rol === 'superadmin') peticion.set('X-CSRF-Token', adminCsrf);
    if (csrf && metodo === 'post' && usuario.rol !== 'superadmin' && /^\/campanas(?:\/|$)/.test(ruta)) peticion.set('X-CSRF-Token', campanaCsrf);
    if (csrf && metodo === 'post' && usuario.rol === 'admin_empresa' && /^\/empresa\/usuarios(?:\/|$)/.test(ruta)) peticion.set('X-CSRF-Token', campanaCsrf);
    if (csrf && metodo === 'post' && usuario.rol !== 'superadmin' && /^\/contactos(?:\/|$)/.test(ruta)) peticion.set('X-CSRF-Token', contactoCsrf);
    if (csrf && metodo === 'post' && /^\/campanas\/[^/]+\/ejecutar$/.test(ruta)) peticion.set('X-Confirmacion-Envio', 'ENVIAR');
    return peticion;
  }]));
  return { app, cliente, store, cookie, adminCsrf, campanaCsrf, contactoCsrf };
};
module.exports = { crearContexto };
