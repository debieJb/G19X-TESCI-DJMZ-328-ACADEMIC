const router = require('express').Router();
const controller = require('../controllers/authController');
const csrf = require('../middlewares/csrf')({ campo: 'authCsrf', rechazar: (req, res) => res.status(403).render('login', {
  titulo: 'Iniciar sesión', anio: new Date().getFullYear(), error: 'El formulario caducó. Vuelve a intentarlo desde esta página.'
}) });
router.use('/login', (req, res, next) => {
  if (!req.session) return res.redirect(303, '/login');
  res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  csrf(req, res, next);
});
router.get('/login', controller.mostrarLogin);
router.post('/login', controller.iniciarSesion);
const csrfSalida = require('../middlewares/csrf')({ campo: 'campanaCsrf', rechazar: (req, res) =>
  res.status(403).render('error', { titulo: 'Formulario inválido', mensaje: 'Recarga el panel para cerrar sesión de forma segura.' }) });
router.post('/logout', (req, res, next) => res.locals.usuarioActual && res.locals.usuarioActual.rol !== 'superadmin'
  ? csrfSalida(req, res, next) : next(), controller.cerrarSesion);
module.exports = router;
