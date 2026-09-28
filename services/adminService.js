const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const Campana = require('../models/Campana');

const conteosPorEmpresa = () => [{ $group: { _id: '$empresa', total: { $sum: 1 } } }];
const mapaConteos = filas => new Map(filas.map(fila => [String(fila._id), fila.total]));

const obtenerDashboard = async () => {
  const [empresas, usuarios, campanasSinEmpresa, totalEmpresas, totalUsuarios, totalCampanas, conteosUsuarios, conteosCampanas] = await Promise.all([
    Empresa.find().select('nombre estado').sort({ nombre: 1, _id: 1 }).lean(),
    Usuario.find().select('nombre email rol empresa').sort({ nombre: 1, _id: 1 }).lean(),
    Campana.find({ empresa: null }).select('nombre canal estado').sort({ createdAt: -1, _id: -1 }).lean(),
    Empresa.countDocuments(), Usuario.countDocuments(), Campana.countDocuments(),
    Usuario.aggregate(conteosPorEmpresa()), Campana.aggregate(conteosPorEmpresa())
  ]);
  const usuariosPorEmpresa = new Map(empresas.map(empresa => [String(empresa._id), []]));
  const usuariosSinEmpresa = [];
  const usuariosEmpresaInexistente = [];
  for (const usuario of usuarios) {
    if (usuario.empresa == null) usuariosSinEmpresa.push(usuario);
    else if (usuariosPorEmpresa.has(String(usuario.empresa))) usuariosPorEmpresa.get(String(usuario.empresa)).push(usuario);
    else usuariosEmpresaInexistente.push(usuario);
  }
  const cantidadesUsuarios = mapaConteos(conteosUsuarios);
  const cantidadesCampanas = mapaConteos(conteosCampanas);
  return {
    totales: { empresas: totalEmpresas, usuarios: totalUsuarios, campanas: totalCampanas },
    empresas: empresas.map(empresa => ({
      ...empresa,
      totalUsuarios: cantidadesUsuarios.get(String(empresa._id)) || 0,
      totalCampanas: cantidadesCampanas.get(String(empresa._id)) || 0,
      usuarios: usuariosPorEmpresa.get(String(empresa._id))
    })),
    usuariosSinEmpresa, usuariosEmpresaInexistente, campanasSinEmpresa
  };
};

const obtenerDetalleEmpresa = async id => {
  const empresa = await Empresa.findById(id).select('nombre estado fechaRegistro automatizaciones.email.habilitada automatizaciones.whatsapp.habilitada automatizaciones.facebook.habilitada').lean();
  if (!empresa) return null;
  const [usuarios, campanas] = await Promise.all([
    Usuario.find({ empresa: id }).select('nombre email rol').sort({ nombre: 1, _id: 1 }).lean(),
    Campana.find({ empresa: id }).select('nombre canal estado creadoPor')
      .populate('creadoPor', 'nombre').sort({ createdAt: -1, _id: -1 }).lean()
  ]);
  return { empresa, usuarios, campanas };
};

const listarEmpresas = () => Empresa.find().select('nombre estado').sort({ nombre: 1, _id: 1 }).lean();
module.exports = { obtenerDashboard, obtenerDetalleEmpresa, listarEmpresas };
