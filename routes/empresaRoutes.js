const router = require('express').Router();
const { requerirAutenticacion } = require('../middlewares/autenticacion');
const { accesoEmpresa } = require('../middlewares/accesoEmpresa');
const { puede } = require('../services/permisos');
const controller = require('../controllers/empresaController');
router.use(requerirAutenticacion, accesoEmpresa, (req, res, next) => {
  const usuario = res.locals.usuarioActual;
  if (usuario.rol !== 'admin_empresa' || !puede(usuario, 'usuarios.administrar', usuario.empresa)) return next(Object.assign(new Error('Acceso denegado'), { status: 403 }));
  next();
});
router.get('/usuarios/nuevo', controller.mostrarUsuarioNuevo);
router.post('/usuarios', controller.crearOperador);
module.exports = router;
