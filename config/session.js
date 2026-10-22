const session = require('express-session');
const { isIP } = require('node:net');

// Solo direcciones o redes explícitas; nunca confiar globalmente ni por saltos.
const configurarProxy = (app, { trustProxy = [] } = {}) => {
  if (!Array.isArray(trustProxy) || trustProxy.some(red => {
    if (typeof red !== 'string') return true;
    const [ip, bits, extra] = red.split('/');
    const version = isIP(ip);
    return !version || extra !== undefined || (bits !== undefined &&
      (!/^\d+$/.test(bits) || Number(bits) < 1 || Number(bits) > (version === 4 ? 32 : 128)));
  })) throw new Error('trustProxy requiere direcciones IP o CIDR explícitos de la infraestructura.');
  app.set('trust proxy', trustProxy.length ? trustProxy : false);
};

const crearSesion = ({ secret = process.env.SESSION_SECRET, entorno = process.env.NODE_ENV, store, nombreCookie = 'marketing.sid' } = {}) => {
  if (!['marketing.sid', 'marketing.piloto.sid'].includes(nombreCookie)) throw new Error('Nombre de cookie de sesión no permitido.');
  if (typeof secret !== 'string' || !secret.trim()) throw new Error('Configura SESSION_SECRET antes de iniciar la aplicación.');
  const produccion = entorno === 'production';
  if (produccion && (!store || store instanceof session.MemoryStore)) throw new Error('MemoryStore no está permitido en producción. Configura un almacén persistente antes de desplegar.');
  if (produccion && Buffer.byteLength(secret, 'utf8') < 32) throw new Error('SESSION_SECRET requiere al menos 32 bytes en producción, generados aleatoriamente.');
  return session({
    name: nombreCookie, secret, store,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: produccion, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
  });
};

module.exports = crearSesion;
module.exports.configurarProxy = configurarProxy;
