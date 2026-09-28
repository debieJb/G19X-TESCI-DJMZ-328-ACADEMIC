const adminService = require('../services/adminService');
const empresaService = require('../services/empresaService');
const { filtroEmpresa } = require('../services/accesoCampanasService');
const mostrarPanel = async (req, res, next) => {
  const vista = { titulo: 'Panel', anio: new Date().getFullYear() };
  try {
    if (res.locals.usuarioActual.rol === 'superadmin') {
      return res.render('admin/dashboard', { ...vista, ...await adminService.obtenerDashboard() });
    }
    filtroEmpresa(res.locals.usuarioActual);
    const datos = await empresaService.obtenerPanel(res.locals.usuarioActual);
    return res.render(res.locals.usuarioActual.rol === 'admin_empresa' ? 'empresa/panelAdmin' : 'empresa/panelOperador', { ...vista, ...datos });
  } catch (error) { next(error); }
};

module.exports = { mostrarPanel };
