const Empresa = require('../models/Empresa');
const estadoAlta = async id => {
  const empresa = await Empresa.findById(id).select('estado versionAlta estadoActivacion').lean();
  if (!empresa) throw Object.assign(new Error('Empresa no encontrada'), { status: 404 });
  const activa = empresa.estado === 'activa' || (empresa.versionAlta === undefined && empresa.estado === undefined);
  const verificada = empresa.versionAlta === undefined || (empresa.versionAlta === 1 && empresa.estadoActivacion === 'verificada');
  return activa && verificada
    ? 'activo' : 'pendiente_verificacion';
};
module.exports = { estadoAlta };
