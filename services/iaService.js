const Usuario = require('../models/Usuario');
const Empresa = require('../models/Empresa');
const { normalizarEmpresaId } = require('./accesoEmpresaService');
const { puede } = require('./permisos');
const contrato = require('./ia/contratoIA');
const proveedores = require('./ia/proveedores');
const limites = require('./ia/limitesIA');
const ErrorIA = require('./ia/ErrorIA');
const libre = require('./ia/instruccionesIA');
const diagnostico = require('./ia/diagnosticoIA');
const disponible = () => proveedores.disponible();
const autorizar = async usuario => {
  const actor = normalizarEmpresaId(usuario?._id), empresaSesion = normalizarEmpresaId(usuario?.empresa);
  if (!actor || !empresaSesion || !['admin_empresa', 'operador'].includes(usuario?.rol)) throw new ErrorIA('ACCESO');
  const actual = await Usuario.findOne({ _id: actor }).select('rol empresa estadoAcceso').lean();
  const empresa = normalizarEmpresaId(actual?.empresa);
  if (!empresa || empresa !== empresaSesion || actual.rol !== usuario.rol || !puede(actual, 'campanas.crear', empresa)
    || (actual.estadoAcceso !== undefined && actual.estadoAcceso !== 'activo')) throw new ErrorIA('ACCESO');
  const doc = await Empresa.findById(empresa).select('estado estadoActivacion').lean();
  if (!doc || (doc.estado !== undefined && doc.estado !== 'activa')
    || (doc.estadoActivacion !== undefined && doc.estadoActivacion !== 'verificada')) throw new ErrorIA('ACCESO');
  return empresa;
};
const generar = async (usuario, entrada, revision) => {
  let etapa = 'ACCESO';
  try {
    const empresa = await autorizar(usuario);
    etapa = 'ENTRADA';
    const datos = contrato.validarEntrada(entrada);
    let contexto = contrato.contextoPublico(datos);
    if (revision) {
      if (!datos.instrucciones || !['revision', 'variante'].includes(revision.modo)) throw new ErrorIA('ENTRADA');
      contexto = { ...contexto, ...revision };
      libre.validarContexto(contexto, contrato.opciones);
    }
    etapa = 'CONFIGURACION';
    const proveedor = proveedores.crear();
    etapa = 'CUOTA';
    const liberar = limites.reservar(empresa);
    try {
      await limites.consumir(empresa);
      etapa = 'GENERACION';
      const respuesta = await proveedor.generar(contexto);
      etapa = 'VALIDAR_SALIDA';
      const salida = contrato.validarSalida(respuesta);
      libre.conservar(salida, datos.textoProtegido);
      return { ...(datos.instrucciones !== undefined ? salida : contrato.personalizarLocal(salida, datos.producto)), nombre: datos.producto,
        objetivo: contrato.opciones.objetivo[datos.objetivo] || 'Campaña creada con instrucciones', proveedor: proveedor.nombre, empresa };
    } finally { liberar(); }
  } catch (error) {
    // El adaptador registra su etapa específica durante la generación.
    if (etapa !== 'GENERACION') diagnostico(etapa, error instanceof ErrorIA ? error.codigo : 'INTERNO');
    if (etapa === 'CUOTA' && error?.codigo !== 'LIMITE') throw new ErrorIA('CUOTAS_NO_DISPONIBLES');
    if (error instanceof ErrorIA) throw error; throw new ErrorIA('PROVEEDOR');
  }
};
module.exports = { autorizar, generar, disponible };
