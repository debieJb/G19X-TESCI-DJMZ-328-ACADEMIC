const router = require('express').Router();
const controller = require('../controllers/campanaController');

router.get('/', controller.listarCampanas);
router.get('/nueva', controller.mostrarFormularioCreacion);
router.post('/', controller.crearCampana);
router.get('/:id/editar', controller.mostrarFormularioEdicion);
router.post('/:id/editar', controller.actualizarCampana);
router.get('/:id/eliminar', controller.mostrarConfirmacionEliminacion);
router.post('/:id/eliminar', controller.eliminarCampana);
router.get('/:id', controller.mostrarDetalle);

module.exports = router;
