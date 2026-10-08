const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');
const { filtroEmpresa } = require('../services/accesoCampanasService');
const { buscarContacto } = require('../services/accesoContactosService');
const conexion = error => ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoTopologyClosedError', 'MongoNotConnectedError'].includes(error.name) || /buffering timed out/i.test(error.message || '');
const formulario = (res, datos, errores = {}, status = 200, id = null) => res.status(status).render(id ? 'contactos/editar' : 'contactos/nuevo', {
  titulo: id ? 'Editar contacto' : 'Nuevo contacto', datos, errores,
  accion: id ? `/contactos/${id}/editar` : '/contactos', cancelar: id ? `/contactos/${id}` : '/contactos'
});
const cargarEmpresas = async res => {
  res.locals.empresasDisponibles = res.locals.usuarioActual.rol === 'superadmin'
    ? await Empresa.find().select('nombre').sort({ nombre: 1 }).lean() : [];
};
const responderError = (res, next, error) => {
  if (error.name === 'DocumentNotFoundError') error = Object.assign(new Error('El contacto no existe o fue eliminado.'), { status: 404 });
  if ([400, 403, 404].includes(error.status)) return res.status(error.status).render('error', { titulo: `Error ${error.status}`, mensaje: error.message });
  if (conexion(error)) error.status = 503;
  return next(error);
};
const validar = (entrada = {}) => {
  entrada ||= {};
  const datos = { canales: {} }, errores = {};
  for (const campo of ['nombre', 'email', 'telefono', 'empresa']) {
    datos[campo] = typeof entrada[campo] === 'string' ? entrada[campo].trim() : '';
    if (entrada[campo] !== undefined && typeof entrada[campo] !== 'string') errores[campo] = 'Introduce un valor de texto.';
  }
  datos.email = datos.email.toLowerCase();
  if (!datos.nombre) errores.nombre = 'El nombre es obligatorio.';
  if (!datos.email && !datos.telefono) errores.email = 'Introduce al menos email o teléfono.';
  if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) errores.email = 'Introduce un email válido.';
  const etiquetas = entrada.etiquetas ?? [];
  if (typeof etiquetas === 'string') datos.etiquetas = etiquetas.split(',').map(valor => valor.trim()).filter(Boolean);
  else if (Array.isArray(etiquetas) && etiquetas.every(valor => typeof valor === 'string')) datos.etiquetas = etiquetas.map(valor => valor.trim()).filter(Boolean);
  else { datos.etiquetas = []; errores.etiquetas = 'Las etiquetas deben ser textos.'; }
  const booleano = (valor, defecto, campo) => {
    if (valor === undefined) return defecto;
    if ([true, 'true', 'on', '1'].includes(valor)) return true;
    if ([false, 'false', '0', ''].includes(valor)) return false;
    errores[campo] = 'Selecciona un valor válido.';
    return defecto;
  };
  if (entrada.canales !== undefined && (!entrada.canales || typeof entrada.canales !== 'object' || Array.isArray(entrada.canales))) errores.canales = 'Selecciona canales válidos.';
  datos.canales.email = booleano(entrada.canales?.email, false, 'canales');
  datos.activo = booleano(entrada.activo, true, 'activo');
  const valores = { nombre: datos.nombre, email: datos.email || undefined, telefono: datos.telefono || undefined,
    etiquetas: datos.etiquetas, canales: datos.canales, activo: datos.activo };
  return { datos, errores, valores };
};
const listarContactos = async (req, res, next) => {
  try {
    const contactos = await Contacto.find(filtroEmpresa(res.locals.usuarioActual)).sort({ createdAt: -1, _id: -1 }).lean();
    res.render('contactos/index', { titulo: 'Contactos', contactos });
  } catch (error) { responderError(res, next, error); }
};
const mostrarFormularioCreacion = async (req, res, next) => {
  try { await cargarEmpresas(res); formulario(res, { nombre: '', email: '', telefono: '', empresa: '', etiquetas: [], canales: {}, activo: true }); }
  catch (error) { responderError(res, next, error); }
};
const mostrarDetalle = async (req, res, next) => {
  try { res.render('contactos/detalle', { titulo: 'Detalle de contacto', contacto: await buscarContacto(req.params.id, res.locals.usuarioActual) }); }
  catch (error) { responderError(res, next, error); }
};
const mostrarFormularioEdicion = async (req, res, next) => {
  try { formulario(res, await buscarContacto(req.params.id, res.locals.usuarioActual, 'contactos.editar'), {}, 200, req.params.id); }
  catch (error) { responderError(res, next, error); }
};
const guardar = editar => async (req, res, next) => {
  const { datos, errores, valores } = validar(req.body);
  const id = editar ? req.params.id : null;
  try {
    const usuario = res.locals.usuarioActual;
    const contacto = editar ? await buscarContacto(id, usuario, 'contactos.editar') : null;
    if (!editar) {
      await cargarEmpresas(res);
      if (usuario.rol === 'superadmin') {
        if (!/^[a-f\d]{24}$/i.test(datos.empresa) || !(await Empresa.exists({ _id: datos.empresa }))) errores.empresa = 'Selecciona una empresa válida y existente.';
        else valores.empresa = datos.empresa;
      } else valores.empresa = filtroEmpresa(usuario).empresa;
      valores.creadoPor = usuario._id;
    }
    if (Object.keys(errores).length) return formulario(res, datos, errores, 422, id);
    if (editar) {
      contacto.set('canales.email', valores.canales.email);
      delete valores.canales;
      Object.assign(contacto, valores);
      await contacto.save();
    }
    else await Contacto.create(valores);
    return res.redirect(303, editar ? `/contactos/${id}` : '/contactos');
  } catch (error) {
    if (error.code === 11000) return formulario(res, datos, { [error.keyPattern?.telefono ? 'telefono' : 'email']: 'Ya existe un contacto con ese email o teléfono en esta empresa.' }, 422, id);
    if (error.name === 'ValidationError') return formulario(res, datos, { datos: 'Revisa los datos del contacto.' }, 422, id);
    if (!error.status && error.name !== 'DocumentNotFoundError') {
      console.error('Error al guardar un contacto.');
      return formulario(res, datos, { datos: conexion(error)
        ? 'La base de datos no está disponible. Tus datos se conservan; intenta más tarde.'
        : 'No se pudo confirmar el guardado. Consulta el listado antes de volver a intentarlo.' }, conexion(error) ? 503 : 500, id);
    }
    return responderError(res, next, error);
  }
};
const eliminarContacto = async (req, res, next) => {
  try {
    const contacto = await buscarContacto(req.params.id, res.locals.usuarioActual, 'contactos.eliminar');
    const resultado = await Contacto.deleteOne({ _id: contacto._id, ...filtroEmpresa(res.locals.usuarioActual) });
    if (!resultado.deletedCount) throw Object.assign(new Error('El contacto no existe o fue eliminado.'), { status: 404 });
    return res.redirect(303, '/contactos');
  } catch (error) { responderError(res, next, error); }
};
module.exports = { listarContactos, mostrarFormularioCreacion, mostrarDetalle, mostrarFormularioEdicion,
  crearContacto: guardar(false), actualizarContacto: guardar(true), eliminarContacto };
