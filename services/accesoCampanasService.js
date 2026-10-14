const Campana = require('../models/Campana');
const { puede, ROLES } = require('./permisos');
const { normalizarEmpresaId } = require('./accesoEmpresaService');
const error = (status, message) => Object.assign(new Error(message), { status });
const idEmpresa = usuario => normalizarEmpresaId(usuario?.empresa) || '';
const filtroEmpresa = usuario => {
  if (!usuario || !ROLES.includes(usuario.rol)) throw error(403, 'Acceso denegado.');
  if (usuario.rol === 'superadmin') return {};
  const empresa = idEmpresa(usuario);
  if (!/^[a-f\d]{24}$/i.test(empresa)) throw error(403, 'Necesitas una empresa válida.');
  return { empresa };
};
const buscarCampana = async (id, usuario, accion = 'campanas.consultar') => {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw error(400, 'Identificador inválido.');
  const filtro = filtroEmpresa(usuario);
  const campana = usuario.rol === 'superadmin' ? await Campana.findById(id) : await Campana.findOne({ _id: id, ...filtro });
  // Buscar primero dentro de la empresa evita revelar una campaña ajena incluso si la acción está prohibida.
  if (!campana) throw error(404, 'La campaña no existe o fue eliminada.');
  if (!puede(usuario, accion, campana.empresa)) throw error(403, 'No tienes permiso para esta acción.');
  // Mongoose aplica $where directamente al filtro de save(), sin hacer cast.
  // Usar el ObjectId ya convertido del documento conserva el aislamiento BSON.
  if (usuario.rol !== 'superadmin') campana.$where = { ...campana.$where, empresa: campana.empresa._id || campana.empresa };
  return campana;
};
module.exports = { filtroEmpresa, idEmpresa, buscarCampana };
