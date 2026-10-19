const { passwordValida, mensajePassword } = require('../services/passwordService');
const { estadoAlta } = require('../services/usuariosGestionService');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const adminService = require('../services/adminService');

const texto = valor => typeof valor === 'string' ? valor.trim() : '';
const idValido = id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
const baseVista = titulo => ({ titulo, anio: new Date().getFullYear() });
const errorRecurso = (res, status) => res.status(status).render('error', {
  titulo: status === 400 ? 'Identificador inválido' : 'Empresa no encontrada',
  mensaje: status === 400 ? 'El identificador de empresa no es válido.' : 'La empresa no existe o fue eliminada.'
});

const mostrarDetalleEmpresa = async (req, res, next) => {
  if (!idValido(req.params.id)) return errorRecurso(res, 400);
  try {
    const detalle = await adminService.obtenerDetalleEmpresa(req.params.id);
    if (!detalle) return errorRecurso(res, 404);
    return res.render('admin/empresaDetalle', { ...baseVista('Detalle de empresa'), ...detalle });
  } catch (error) { next(error); }
};

const formularioEmpresa = (res, datos = { nombre: '', estado: 'activa' }, errores = [], status = 200) =>
  res.status(status).render('admin/empresaNueva', { ...baseVista('Nueva empresa'), datos, errores });
const mostrarEmpresaNueva = (req, res) => formularioEmpresa(res);
const crearEmpresa = async (req, res, next) => {
  // Lista blanca: nunca persistir req.body completo.
  const datos = { nombre: texto(req.body?.nombre), estado: texto(req.body?.estado) };
  const errores = [];
  if (!datos.nombre) errores.push('El nombre es obligatorio.');
  if (!['activa', 'inactiva'].includes(datos.estado)) errores.push('Selecciona un estado válido.');
  if (errores.length) return formularioEmpresa(res, datos, errores, 422);
  try {
    const empresa = await Empresa.create(datos);
    return res.redirect(303, `/admin/empresas/${empresa._id}`);
  } catch (error) {
    if (error.name === 'ValidationError') return formularioEmpresa(res, datos, ['Revisa los datos de la empresa.'], 422);
    next(error);
  }
};

const formularioUsuario = async (res, datos = { nombre: '', email: '', rol: 'operador', empresa: '' }, errores = [], status = 200) => {
  const empresas = await adminService.listarEmpresas();
  return res.status(status).render('admin/usuarioNuevo', { ...baseVista('Nuevo usuario'), datos, empresas, errores });
};
const mostrarUsuarioNuevo = async (req, res, next) => {
  try { return await formularioUsuario(res); } catch (error) { next(error); }
};
const crearUsuario = async (req, res, next) => {
  // password nunca forma parte de los datos que se devuelven a la vista.
  const datos = {
    nombre: texto(req.body?.nombre), email: texto(req.body?.email).toLowerCase(),
    rol: texto(req.body?.rol), empresa: texto(req.body?.empresa)
  };
  const password = req.body?.password;
  const errores = [];
  if (!datos.nombre) errores.push('El nombre es obligatorio.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) errores.push('Introduce un email válido.');
  if (!['admin_empresa', 'operador'].includes(datos.rol)) errores.push('Selecciona admin_empresa u operador.');
  if (!passwordValida(password)) errores.push(mensajePassword);
  if (!idValido(datos.empresa)) errores.push('Selecciona una empresa válida.');
  try {
    if (idValido(datos.empresa) && !(await Empresa.exists({ _id: datos.empresa }))) errores.push('La empresa seleccionada no existe.');
    if (errores.length) return await formularioUsuario(res, datos, errores, 422);
    const estadoEmpresa = await estadoAlta(datos.empresa);
    const estadoAcceso = datos.rol === 'operador' ? 'pendiente_verificacion' : estadoEmpresa;
    await Usuario.create({ nombre: datos.nombre, email: datos.email, rol: datos.rol, empresa: datos.empresa, password, estadoAcceso });
    req.session.avisoOperacion = datos.rol === 'operador' ? 'Operador creado pendiente de activación explícita desde la tabla.' : estadoAcceso === 'activo' ? 'Usuario creado correctamente.' : 'Usuario creado pendiente de verificación empresarial.';
    return res.redirect(303, `/admin/empresas/${datos.empresa}`);
  } catch (error) {
    if (error.code === 11000 || error.name === 'ValidationError') {
      try {
        return await formularioUsuario(res, datos, [error.code === 11000 ? 'El email ya está registrado.' : 'Revisa los datos del usuario.'], 422);
      } catch (errorVista) { return next(errorVista); }
    }
    // El manejador global registra un mensaje fijo, nunca error.message ni req.body.
    next(error);
  }
};

module.exports = { mostrarDetalleEmpresa, mostrarEmpresaNueva, crearEmpresa, mostrarUsuarioNuevo, crearUsuario };

const configuracionService = require('../services/configuracionAutomatizacionesService');
const { puede } = require('../services/permisos');
const cargarEmpresaAutomatizaciones = async (req, res) => {
  if (!puede(res.locals.usuarioActual, 'automatizaciones.editar')) throw Object.assign(new Error('Acceso denegado'), { status: 403 });
  if (!idValido(req.params.id)) { errorRecurso(res, 400); return null; }
  const empresa = await Empresa.findById(req.params.id).select(configuracionService.seleccionWebhooks);
  if (!empresa) errorRecurso(res, 404);
  return empresa;
};
const mostrarAutomatizaciones = async (req, res, next) => {
  try {
    const empresa = await cargarEmpresaAutomatizaciones(req, res);
    if (!empresa) return;
    res.render('admin/automatizacionesEditar', { ...baseVista('Automatizaciones'), empresa, canales: configuracionService.canales, error: '' });
  } catch (error) { next(error); }
};
const guardarAutomatizaciones = async (req, res, next) => {
  try {
    const empresa = await cargarEmpresaAutomatizaciones(req, res);
    if (!empresa) return;
    const configuraciones = {};
    try {
      for (const canal of configuracionService.canales) {
        const habilitada = req.body?.[`${canal}Habilitada`];
        const webhookUrl = req.body?.[`${canal}WebhookUrl`];
        if (!['true', 'false'].includes(habilitada) || typeof webhookUrl !== 'string') throw new Error();
        if (webhookUrl !== '') configuracionService.validarUrl(webhookUrl);
        configuraciones[canal] = { habilitada: habilitada === 'true', webhookUrl };
      }
    } catch {
      return res.status(422).render('admin/automatizacionesEditar', { ...baseVista('Automatizaciones'), empresa, canales: configuracionService.canales, error: 'Revisa los estados y las URLs de automatización. No se guardaron cambios.' });
    }
    // Actualizar solo email; conservar la configuración histórica de los demás canales.
    empresa.set('automatizaciones.email', configuraciones.email);
    await empresa.save();
    res.redirect(303, `/admin/empresas/${empresa._id}`);
  } catch (error) { next(error); }
};
module.exports.mostrarAutomatizaciones = mostrarAutomatizaciones;
module.exports.guardarAutomatizaciones = guardarAutomatizaciones;

const editarEmpresa = async (req, res, next) => {
  if (!idValido(req.params.id)) return errorRecurso(res, 400);
  try {
    const empresa = await Empresa.findById(req.params.id).select('nombre estado');
    if (!empresa) return errorRecurso(res, 404);
    res.render('admin/empresaEditar', { ...baseVista('Editar empresa'), empresa, errores: [] });
  } catch (e) { next(e); }
};
const actualizarEmpresa = async (req, res, next) => {
  if (!idValido(req.params.id)) return errorRecurso(res, 400);
  try {
    const empresa = await Empresa.findById(req.params.id).select('nombre estado');
    if (!empresa) return errorRecurso(res, 404);
    const nombre = texto(req.body?.nombre), estado = texto(req.body?.estado);
    if (!nombre || !['activa', 'inactiva'].includes(estado)) return res.status(422).render('admin/empresaEditar', {
      ...baseVista('Editar empresa'), empresa, errores: ['Introduce un nombre y un estado válidos.']
    });
    empresa.nombre = nombre; empresa.estado = estado;
    await empresa.save();
    req.session.avisoOperacion = 'Empresa actualizada correctamente.';
    res.redirect(303, `/admin/empresas/${empresa._id}`);
  } catch (e) { next(e); }
};
module.exports.editarEmpresa = editarEmpresa;
module.exports.actualizarEmpresa = actualizarEmpresa;
