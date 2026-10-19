const router = require('express').Router();
const { requerirAutenticacion } = require('../middlewares/autenticacion');
const crearCsrf = require('../middlewares/csrf');
const service = require('../services/iaService');
const ErrorIA = require('../services/ia/ErrorIA');
const controller = require('../controllers/iaController');
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); }, requerirAutenticacion);
router.use((req, res, next) => {
  if (!['admin_empresa', 'operador'].includes(res.locals.usuarioActual.rol)) return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: 'El asistente requiere un usuario empresarial autorizado.' });
  next();
});
router.use(crearCsrf({ campo: 'iaCsrf', rechazar: (req, res) => res.status(403).render('error', {
  titulo: 'Formulario inválido', mensaje: 'El formulario caducó. Recarga la página.'
}) }));
router.use(async (req, res, next) => {
  try { await service.autorizar(res.locals.usuarioActual); next(); }
  catch (error) { const seguro = error instanceof ErrorIA ? error : new ErrorIA('PROVEEDOR'); res.status(seguro.status).render('error', { titulo: 'Asistente no disponible', mensaje: seguro.message }); }
});
router.get('/', controller.mostrar);
router.get('/diagnostico', controller.diagnosticar);
router.post('/generar', controller.generar);
router.post('/regenerar', controller.regenerar);
router.post('/revisar', controller.regenerar);
router.post('/borrador', controller.guardar);
module.exports = router;
