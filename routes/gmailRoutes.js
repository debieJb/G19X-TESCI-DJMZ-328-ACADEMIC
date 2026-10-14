const router = require('express').Router();
const { requerirAutenticacion } = require('../middlewares/autenticacion');
const { requiereRol } = require('../middlewares/roles');
const csrfGmail = require('../middlewares/csrfGmail');
const controller = require('../controllers/gmailController');
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  next();
}, requerirAutenticacion, requiereRol('admin_empresa'), csrfGmail);
router.get('/', controller.mostrar);
router.post('/conectar', controller.conectar);
router.get('/callback', controller.callback);
router.get('/resultado', controller.resultado);
router.post('/desconectar', controller.desconectar);
router.post('/renovar', controller.renovar);
module.exports = router;
