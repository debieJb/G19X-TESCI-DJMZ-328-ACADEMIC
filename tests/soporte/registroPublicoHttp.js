const express = require('express');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const session = require('express-session');
const crearAppRegistro = () => {
  const app = express(), store = new session.MemoryStore();
  app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, '../../views'));
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.use(session({ secret: randomBytes(32).toString('hex'), store, resave: false, saveUninitialized: false }));
  app.use((req, res, next) => { res.locals.usuarioActual = null; next(); });
  app.use('/registro', require('../../routes/registroPublicoRoutes'));
  app.use(require('../../routes/authRoutes'));
  app.get('/sesion-prueba', (req, res) => res.json({ autenticada: !!req.session.usuarioId }));
  return { app, store };
};
const campo = (html, nombre) => {
  const m = html.match(new RegExp(`name="${nombre}" value="([^"]*)"`));
  return m?.[1];
};
module.exports = { crearAppRegistro, campo };
