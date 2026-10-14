const crearCsrf = require('./csrf');
const proteger = crearCsrf({ campo: 'adminCsrf', permitirCabecera: true,
  rechazar: (req, res) => res.status(403).render('error', {
    titulo: 'Formulario inválido', mensaje: 'El formulario no es válido o ha caducado. Vuelve a cargar la página.'
  }) });
module.exports = (req, res, next) => {
  res.locals.adminCsrf = null;
  if (res.locals.usuarioActual?.rol !== 'superadmin') return next();
  // El login tiene su propio ciclo de regeneración; no es una escritura del panel.
  if (req.path === '/login') return next();
  res.set('Cache-Control', 'no-store');
  return proteger(req, res, next);
};
