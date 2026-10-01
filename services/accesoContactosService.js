const Contacto = require('../models/Contacto');
const { filtroEmpresa } = require('./accesoCampanasService');
const { puede } = require('./permisos');
const error = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const buscarContacto = async (id, usuario, accion = 'contactos.consultar') => {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw error(400, 'Identificador inválido.');
  const filtro = filtroEmpresa(usuario);
  const contacto = await Contacto.findOne({ _id: id, ...filtro });
  if (!contacto) throw error(404, 'El contacto no existe o fue eliminado.');
  if (!puede(usuario, accion, contacto.empresa)) throw error(403, 'No tienes permiso para esta acción.');
  if (usuario.rol !== 'superadmin') contacto.$where = filtro;
  return contacto;
};
module.exports = { buscarContacto };
