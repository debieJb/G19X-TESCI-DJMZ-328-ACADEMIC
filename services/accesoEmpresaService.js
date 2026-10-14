const Empresa = require('../models/Empresa');
const ErrorAutomatizacion = require('./ErrorAutomatizacion');

const normalizarEmpresaId = referencia => {
  const id = referencia?._id ?? referencia;
  const texto = typeof id === 'string' ? id : id?.toHexString?.();
  return typeof texto === 'string' && /^[a-f\d]{24}$/i.test(texto) ? texto.toLowerCase() : null;
};

// Consultar siempre el estado persistido, nunca el de la sesión o el formulario.
const obtenerEmpresaParaEjecucion = async (referencia, seleccion = 'estado') => {
  const id = normalizarEmpresaId(referencia);
  if (!id) throw new ErrorAutomatizacion('CONFIGURACION');
  const empresa = await Empresa.findById(id).select(seleccion);
  if (!empresa) throw new ErrorAutomatizacion('CONFIGURACION');
  // Los documentos anteriores sin estado conservan el default histórico activa.
  if (empresa.estado === 'inactiva') throw new ErrorAutomatizacion('EMPRESA_INACTIVA');
  if (empresa.estado !== undefined && empresa.estado !== 'activa') throw new ErrorAutomatizacion('CONFIGURACION');
  return empresa;
};

module.exports = { normalizarEmpresaId, obtenerEmpresaParaEjecucion };
