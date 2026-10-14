const crearCsrf = require('./csrf');
const proteger = crearCsrf({ campo: 'campanaCsrf', permitirCabecera: true,
  aplica: req => req.path.toLowerCase() === '/campanas' || req.path.toLowerCase().startsWith('/campanas/'),
  rechazar: (req, res) => res.status(403).render('error', { titulo: 'Formulario inválido', mensaje: 'Recarga el formulario de campaña antes de continuar.' }) });
module.exports = (req, res, next) => {
  res.locals.campanaCsrf = null;
  if (!['admin_empresa', 'operador'].includes(res.locals.usuarioActual?.rol)) return next();
  return proteger(req, res, next);
};
