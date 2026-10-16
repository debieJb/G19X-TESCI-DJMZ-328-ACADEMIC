const proteger = require('./csrf')({ campo: 'contactoCsrf', permitirCabecera: true,
  aplica: req => req.path.toLowerCase() === '/contactos' || req.path.toLowerCase().startsWith('/contactos/'),
  rechazar: (req, res) => res.status(403).render('error', { titulo: 'Formulario invalido', mensaje: 'Recarga el formulario de contacto antes de continuar.' }) });
module.exports = (req, res, next) => {
  res.locals.contactoCsrf = null;
  if (!res.locals.usuarioActual || res.locals.usuarioActual.rol === 'superadmin') return next();
  return proteger(req, res, next);
};
