const router = require('express').Router();
const crearCsrf = require('../middlewares/csrf');
const controller = require('../controllers/registroPublicoController');
router.use((req, res, next) => {
  if (res.locals.usuarioActual) return res.redirect(303, '/panel');
  if (!req.session) return res.redirect(303, '/registro');
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.locals.idempotencia = req.session.registroIdempotencia || '';
  next();
});
router.use(crearCsrf({ campo: 'registroCsrf', rechazar: (req, res) => res.status(403).render('registro', {
  paso: 'invalido', mensaje: 'El formulario caducó. Vuelve a abrir la página e inténtalo de nuevo.'
}) }));
router.get('/', controller.mostrar);
router.post('/', controller.solicitud);
router.get('/estado', controller.pendiente);
router.get('/reenviar', controller.mostrarReenvio);
router.post('/reenviar', controller.reenviar);
router.get('/verificar', controller.enlace);
router.post('/verificar', controller.verificar);
router.get('/administrador', controller.mostrarAdministrador);
router.post('/administrador', controller.configurar);
module.exports = router;
