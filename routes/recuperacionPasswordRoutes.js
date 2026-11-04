'use strict';
const router = require('express').Router();
const controller = require('../controllers/recuperacionPasswordController');
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff'); res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Content-Security-Policy', "default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (!req.session) return res.redirect(303, '/recuperar');
  next();
});
router.use(require('../middlewares/csrf')({ campo: 'recuperacionCsrf', rechazar: (req, res) => res.status(403).render('recuperacion', {
  paso: req.path === '/restablecer' ? 'restablecer' : 'solicitud', mensaje: 'El formulario caducó. Vuelve a intentarlo desde esta página.'
}) }));
router.get('/', controller.mostrar);
router.post('/', controller.solicitar);
router.get('/restablecer', controller.mostrarRestablecer);
router.post('/restablecer', controller.restablecer);
module.exports = router;
