const router = require('express').Router();
const controller = require('../controllers/campanaController');

router.get('/', controller.listarCampanas);
router.get('/nueva', controller.mostrarFormularioCreacion);
router.post('/', controller.crearCampana);

module.exports = router;
