const { randomBytes, timingSafeEqual } = require('node:crypto');
const formato = valor => typeof valor === 'string' && valor.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(valor);
// Token sincronizado con la sesión; nunca se acepta desde la URL.
const crearCsrf = ({ campo, rechazar, permitirCabecera = false }) => (req, res, next) => {
  if (!formato(req.session[campo])) req.session[campo] = randomBytes(32).toString('base64url');
  res.locals[campo] = req.session[campo];
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const recibido = Object.hasOwn(req.body || {}, '_csrf')
      ? req.body._csrf : (permitirCabecera ? req.get('X-CSRF-Token') : undefined);
    const esperado = req.session[campo];
    if (!formato(recibido) || !timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))) return rechazar(req, res);
  }
  next();
};
module.exports = crearCsrf;
