const Usuario = require('../models/Usuario');
require('../models/Empresa');

const destruirSesion = req => new Promise((resolve, reject) => {
  req.session.destroy(error => error ? reject(error) : resolve());
});
const limpiarCookie = res => res.clearCookie('marketing.sid', { httpOnly: true, secure: false, sameSite: 'lax', path: '/' });

const cargarUsuario = async (req, res, next) => {
  res.locals.usuarioActual = null;
  try {
    if (req.session.usuarioId) {
      const id = req.session.usuarioId;
      const usuario = typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)
        ? await Usuario.findById(id).select('nombre email rol empresa').populate('empresa', 'nombre').lean()
        : null;
      if (usuario) {
        // Lista explícita: incluso una consulta modificada no expone password a las vistas.
        res.locals.usuarioActual = {
          _id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol,
          empresa: usuario.empresa ? { _id: usuario.empresa._id, nombre: usuario.empresa.nombre } : null
        };
      } else {
        await destruirSesion(req);
        limpiarCookie(res);
      }
    }
    next();
  } catch (error) { next(error); }
};

const requerirAutenticacion = (req, res, next) => {
  if (!res.locals.usuarioActual) return res.redirect('/login');
  res.set('Cache-Control', 'no-store');
  next();
};

module.exports = { cargarUsuario, requerirAutenticacion, destruirSesion, limpiarCookie };
