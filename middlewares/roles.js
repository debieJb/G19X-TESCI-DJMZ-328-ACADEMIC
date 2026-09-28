const requiereRol = rol => (req, res, next) => {
  if (!res.locals.usuarioActual) return res.redirect('/login');
  if (res.locals.usuarioActual.rol !== rol) {
    return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'No tienes permiso para acceder a esta sección.' });
  }
  next();
};

module.exports = { requiereRol };
