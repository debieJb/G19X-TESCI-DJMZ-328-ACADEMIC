const session = require('express-session');

const crearSesion = ({ secret = process.env.SESSION_SECRET, entorno = process.env.NODE_ENV, store } = {}) => {
  if (typeof secret !== 'string' || !secret.trim()) throw new Error('Configura SESSION_SECRET antes de iniciar la aplicación.');
  if (entorno === 'production') throw new Error('MemoryStore no está permitido en producción. Configura un almacén persistente antes de desplegar.');
  return session({
    name: 'marketing.sid', secret, store,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
  });
};

module.exports = crearSesion;
