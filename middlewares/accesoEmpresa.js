const { filtroEmpresa } = require('../services/accesoCampanasService');
const { puede } = require('../services/permisos');
const accesoEmpresa = (req, res, next) => {
  try {
    filtroEmpresa(res.locals.usuarioActual);
    res.locals.puedeCampana = (accion, campana) => puede(res.locals.usuarioActual, accion, campana?.empresa);
    next();
  } catch (error) { next(error); }
};
module.exports = { accesoEmpresa };
