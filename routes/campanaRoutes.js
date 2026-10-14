const router = require('express').Router();
const controller = require('../controllers/campanaController');
const { requerirAutenticacion } = require('../middlewares/autenticacion');
const { accesoEmpresa } = require('../middlewares/accesoEmpresa');
const automatizacion = require('../controllers/automatizacionCampanaController');
router.use(requerirAutenticacion, accesoEmpresa);

router.get('/', controller.listarCampanas);
router.get('/nueva', controller.mostrarFormularioCreacion);
router.post('/', controller.crearCampana);
router.get('/:id/automatizacion', automatizacion.mostrar);
router.post('/:id/automatizacion', automatizacion.guardar);
router.post('/:id/automatizacion/imagen', automatizacion.guardarImagen);
router.post('/:id/automatizacion/confirmar', automatizacion.confirmar);
router.get('/:id/imagen', automatizacion.imagen);
router.get('/:id/editar', controller.mostrarFormularioEdicion);
router.post('/:id/editar', controller.actualizarCampana);
router.get('/:id/eliminar', controller.mostrarConfirmacionEliminacion);
router.post('/:id/eliminar', controller.eliminarCampana);
router.post('/:id/ejecutar', controller.ejecutarAutomatizacion);
router.get('/:id', controller.mostrarDetalle);

module.exports = router;
