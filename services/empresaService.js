const Usuario = require('../models/Usuario');
const Campana = require('../models/Campana');
const { filtroEmpresa } = require('./accesoCampanasService');
const { puede } = require('./permisos');
const obtenerPanel = async usuario => {
  const filtro = filtroEmpresa(usuario);
  const campanas = await Campana.find(filtro).sort({ createdAt: -1, _id: -1 }).lean();
  let usuarios = [];
  if (puede(usuario, 'usuarios.administrar', usuario.empresa)) {
    usuarios = await Usuario.find(filtro).select('nombre email rol empresa estadoAcceso').sort({ nombre: 1 }).lean();
  }
  return { empresa: usuario.empresa, campanas, usuarios, operadores: usuarios.filter(u => u.rol === 'operador'), totalCampanas: campanas.length, totalUsuarios: usuarios.length };
};
module.exports = { obtenerPanel };
