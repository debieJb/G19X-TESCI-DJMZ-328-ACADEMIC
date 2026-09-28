const Usuario = require('../models/Usuario');
const { destruirSesion, limpiarCookie } = require('../middlewares/autenticacion');

const mostrarLogin = (req, res) => {
  if (res.locals.usuarioActual) return res.redirect('/panel');
  res.set('Cache-Control', 'no-store');
  return res.render('login', { titulo: 'Iniciar sesión', anio: new Date().getFullYear(), error: '' });
};

const iniciarSesion = async (req, res, next) => {
  if (!req.session) return res.redirect(303, '/login');
  res.set('Cache-Control', 'no-store');
  const rechazar = () => res.status(401).render('login', {
    titulo: 'Iniciar sesión', anio: new Date().getFullYear(), error: 'Correo o contraseña incorrectos'
  });
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) return rechazar();
    const usuario = await Usuario.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!usuario || !(await usuario.compararPassword(password))) return rechazar();
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.usuarioId = usuario._id.toString();
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    return res.redirect(303, '/panel');
  } catch (error) { next(error); }
};

const cerrarSesion = async (req, res, next) => {
  try {
    if (req.session) await destruirSesion(req);
    limpiarCookie(res);
    res.redirect(303, '/');
  } catch (error) { next(error); }
};

module.exports = { mostrarLogin, iniciarSesion, cerrarSesion };
