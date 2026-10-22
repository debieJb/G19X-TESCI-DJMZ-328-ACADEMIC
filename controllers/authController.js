const Usuario = require('../models/Usuario');
const { destruirSesion, limpiarCookie } = require('../middlewares/autenticacion');
const bcrypt = require('bcryptjs');
// Mismo trabajo de bcrypt para cuentas inexistentes; nunca usar una contraseña real.
const hashInexistente = bcrypt.hash(require('node:crypto').randomBytes(32).toString('base64url'), 12);

const mostrarLogin = (req, res) => {
  if (res.locals.usuarioActual) return res.redirect('/panel');
  res.set('Cache-Control', 'no-store');
  return res.render('login', { titulo: 'Iniciar sesión', anio: new Date().getFullYear(), error: '' });
};

const iniciarSesion = async (req, res, next) => {
  if (res.locals.usuarioActual) return res.redirect(303, '/panel');
  if (!req.session) return res.redirect(303, '/login');
  res.set('Cache-Control', 'no-store');
  const rechazar = () => res.status(401).render('login', {
    titulo: 'Iniciar sesión', anio: new Date().getFullYear(), error: 'Correo o contraseña incorrectos'
  });
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || email.length > 320 || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) return rechazar();
    try { await require('../services/loginLimitesService').consumir({ ip: req.ip || 'sin-ip', email: email.trim().toLowerCase() }); }
    catch (e) {
      const limitado = e.codigo === 'LIMITE_LOGIN';
      if (limitado) res.set('Retry-After', '900');
      return res.status(limitado ? 429 : 503).render('login', { titulo: 'Iniciar sesión', anio: new Date().getFullYear(),
        error: limitado ? 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' : 'El acceso no está disponible temporalmente. Inténtalo más tarde.' });
    }
    const usuario = await Usuario.findOne({ email: email.trim().toLowerCase() }).select('+password');
    const coincide = usuario ? await usuario.compararPassword(password) : await bcrypt.compare(password, await hashInexistente);
    if (!usuario || !coincide) return rechazar();
    // Los usuarios históricos sin estado conservan compatibilidad. Los estados
    // nuevos deben estar explícitamente activos para iniciar sesión.
    if (usuario.estadoAcceso !== undefined && usuario.estadoAcceso !== 'activo') return rechazar();
    const versionSesion = usuario.versionSesion === undefined ? 0 : usuario.versionSesion;
    if (!Number.isSafeInteger(versionSesion) || versionSesion < 0) return rechazar();
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.usuarioId = usuario._id.toString();
    req.session.versionSesion = versionSesion;
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
