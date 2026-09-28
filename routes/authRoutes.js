const router = require('express').Router();
const controller = require('../controllers/authController');
router.get('/login', controller.mostrarLogin);
router.post('/login', controller.iniciarSesion);
router.post('/logout', controller.cerrarSesion);
module.exports = router;
