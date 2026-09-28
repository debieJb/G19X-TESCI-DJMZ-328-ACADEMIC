const Campana = require('../models/Campana');
const automatizacionService = require('../services/automatizacionService');
const Empresa = require('../models/Empresa');
const { filtroEmpresa, buscarCampana } = require('../services/accesoCampanasService');

const canales = { email: 'Correo electrónico', redes_sociales: 'Redes sociales', sms: 'SMS', otro: 'Otro' };
const estados = { borrador: 'Borrador', programada: 'Programada', activa: 'Activa', pausada: 'Pausada', finalizada: 'Finalizada' };
const campos = ['nombre', 'objetivo', 'canal', 'estado', 'fechaInicio', 'fechaFin', 'asunto', 'cuerpoTexto', 'publicacion'];
const etiquetas = { nombre: 'Nombre', objetivo: 'Objetivo', canal: 'Canal', estado: 'Estado', fechaInicio: 'Fecha de inicio', fechaFin: 'Fecha de fin', asunto: 'Asunto', cuerpoTexto: 'Cuerpo de texto', publicacion: 'Publicación' };

const mostrarFormulario = (res, datos, errores = {}, mensaje = '', status = 200, id = null, estadoActual = null) =>
  res.status(status).render(id ? 'campanas/editar' : 'campanas/nueva', {
    titulo: id ? 'Editar campaña' : 'Nueva campaña', datos, errores, mensaje, canales, estados,
    estadoActual, estadosPermitidos: estadoActual ? Campana.estadosPermitidos(estadoActual) : [],
    accion: id ? `/campanas/${id}/editar` : '/campanas',
    cancelar: id ? `/campanas/${id}` : '/campanas'
  });

const formatearFecha = (fecha) => fecha
  ? new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC' }).format(new Date(fecha)) : 'Sin definir';

const errorRecurso = (status, message) => Object.assign(new Error(message), { status });

const responderErrorRecurso = (res, error) => res.status(error.status).render('error', {
  titulo: error.status === 404 ? 'Campaña no encontrada' : error.status === 403 ? 'Acceso denegado' : 'Identificador inválido', mensaje: error.message
});

const esErrorConexion = (error) => ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoTopologyClosedError', 'MongoNotConnectedError'].includes(error.name)
  || /buffering timed out/i.test(error.message || '');

const listarCampanas = async (req, res, next) => {
  try {
    const campanas = await Campana.find(filtroEmpresa(res.locals.usuarioActual)).sort({ createdAt: -1, _id: -1 }).lean();
    res.render('campanas/index', {
      titulo: 'Campañas', campanas, canales, estados,
      formatearFecha
    });
  } catch (error) {
    if (esErrorConexion(error)) error.status = 503;
    next(error);
  }
};

const cargarEmpresas = async res => {
  res.locals.empresasDisponibles = res.locals.usuarioActual.rol === 'superadmin'
    ? await Empresa.find().select('nombre').sort({ nombre: 1 }).lean() : [];
};
const mostrarFormularioCreacion = async (req, res, next) => {
  try {
    await cargarEmpresas(res);
    return mostrarFormulario(res, { nombre: '', objetivo: '', canal: '', estado: 'borrador', fechaInicio: '', fechaFin: '', asunto: '', cuerpoTexto: '', publicacion: '', empresa: '' });
  } catch (error) { next(error); }
};

const validarFormulario = (entrada = {}, editar = false) => {
  const datos = {};
  const errores = {};
  entrada ||= {};
  for (const campo of campos) {
    const valor = Object.hasOwn(entrada, campo) ? entrada[campo] : undefined;
    datos[campo] = typeof valor === 'string' ? valor : '';
    if (valor !== undefined && typeof valor !== 'string') errores[campo] = `${etiquetas[campo]} debe contener un valor de texto.`;
  }
  const valores = {
    nombre: datos.nombre.trim(), objetivo: datos.objetivo.trim(),
    canal: datos.canal || undefined, estado: editar ? datos.estado : 'borrador',
    fechaInicio: undefined, fechaFin: undefined,
    asunto: datos.asunto.trim() || undefined, cuerpoTexto: datos.cuerpoTexto || undefined,
    publicacion: datos.publicacion || undefined
  };
  if (!editar) {
    if (datos.estado && datos.estado !== 'borrador') errores.estado = 'Toda campaña nueva debe comenzar en borrador.';
    datos.estado = 'borrador';
  }
  for (const campo of ['nombre', 'objetivo']) {
    if (!valores[campo]) errores[campo] = `${etiquetas[campo]} es obligatorio.`;
  }
  if (datos.canal && !Object.hasOwn(canales, datos.canal)) errores.canal = 'Selecciona un canal válido.';
  if (!Object.hasOwn(estados, datos.estado)) errores.estado = 'Selecciona un estado válido.';

  for (const campo of ['fechaInicio', 'fechaFin']) {
    if (!datos[campo]) continue;
    // Las fechas de calendario se guardan a medianoche UTC y se muestran en UTC.
    const fecha = new Date(`${datos[campo]}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos[campo]) || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== datos[campo]) {
      errores[campo] = 'Introduce una fecha válida con formato AAAA-MM-DD.';
    } else {
      valores[campo] = fecha;
    }
  }
  if (valores.fechaInicio && valores.fechaFin && valores.fechaFin < valores.fechaInicio) {
    errores.fechaFin = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
  }
  if (valores.estado === 'programada' && !valores.fechaInicio && !errores.fechaInicio) {
    errores.fechaInicio = 'Una campaña programada debe tener fecha de inicio.';
  }
  return { datos, errores, valores };
};

const responderErrorFormulario = (res, error, datos, id = null, estadoActual = null) => {
  const errores = {};
  if (error.name === 'ValidationError') {
    for (const campo of campos) {
      if (error.errors[campo]) errores[campo] = campo === 'fechaFin'
        ? 'La fecha de fin debe ser válida y no anterior a la fecha de inicio.'
        : `Revisa el campo ${etiquetas[campo].toLowerCase()}: su valor no es válido.`;
    }
    return mostrarFormulario(res, datos, errores, 'Revisa los datos de la campaña.', 422, id, estadoActual);
  }
  // No registrar el cuerpo del formulario ni mensajes que puedan incluir credenciales.
  console.error('Error al guardar una campaña.');
  const status = esErrorConexion(error) ? 503 : 500;
  return mostrarFormulario(res, datos, {}, status === 503
    ? 'La base de datos no está disponible. Tus datos se conservan en el formulario; intenta más tarde.'
    : 'No se pudo confirmar el guardado. Consulta el listado antes de volver a intentarlo.', status, id, estadoActual);
};

const crearCampana = async (req, res) => {
  const { datos, errores, valores } = validarFormulario(req.body);
  try {
    await cargarEmpresas(res);
    const usuario = res.locals.usuarioActual;
    if (usuario.rol === 'superadmin') {
      datos.empresa = typeof req.body?.empresa === 'string' ? req.body.empresa : '';
      if (!/^[a-f\d]{24}$/i.test(datos.empresa) || !(await Empresa.exists({ _id: datos.empresa }))) {
        errores.empresa = 'Selecciona una empresa válida y existente.';
      } else valores.empresa = datos.empresa;
    } else valores.empresa = filtroEmpresa(usuario).empresa;
    valores.creadoPor = usuario._id;
    if (Object.keys(errores).length) return mostrarFormulario(res, datos, errores, '', 422);
    await Campana.create(valores);
    return res.redirect(303, '/campanas');
  } catch (error) {
    return responderErrorFormulario(res, error, datos);
  }
};

const consultarCampana = (vista, titulo) => async (req, res, next) => {
  try {
    const campana = await buscarCampana(req.params.id, res.locals.usuarioActual, vista === 'eliminar' ? 'campanas.eliminar' : vista === 'editar' ? 'campanas.editar' : 'campanas.consultar');
    if (vista === 'editar') {
      const datos = {};
      for (const campo of campos) {
        datos[campo] = campo.startsWith('fecha')
          ? (campana[campo] ? campana[campo].toISOString().slice(0, 10) : '')
          : (campana[campo] || '');
      }
      return mostrarFormulario(res, datos, {}, '', 200, req.params.id, campana.estado);
    }
    const mensaje = vista === 'detalle' && req.query.automatizacion === 'enviada'
      ? 'Solicitud enviada a la automatización. Esto confirma la recepción, no la finalización del flujo.' : '';
    return res.render(`campanas/${vista}`, { titulo, campana, canales, estados, formatearFecha, mensaje, errorAutomatizacion: false,
      mensajeCanal: automatizacionService.mensajeCanalNoDisponible(campana.canal) });
  } catch (error) {
    if ([400, 403, 404].includes(error.status)) return responderErrorRecurso(res, error);
    if (esErrorConexion(error)) error.status = 503;
    return next(error);
  }
};

const mostrarDetalle = consultarCampana('detalle', 'Detalle de campaña');
const mostrarFormularioEdicion = consultarCampana('editar', 'Editar campaña');
const mostrarConfirmacionEliminacion = consultarCampana('eliminar', 'Eliminar campaña');

const actualizarCampana = async (req, res) => {
  const { datos, errores, valores } = validarFormulario(req.body, true);
  let estadoActual = null;
  try {
    const campana = await buscarCampana(req.params.id, res.locals.usuarioActual, 'campanas.editar');
    estadoActual = campana.estado;
    // Formularios anteriores que omitan estos campos no deben borrar contenido guardado.
    for (const campo of ['asunto', 'cuerpoTexto', 'publicacion']) {
      if (!Object.hasOwn(req.body || {}, campo)) {
        valores[campo] = campana[campo];
        datos[campo] = campana[campo] || '';
      }
    }
    if (!errores.estado && !Campana.estadosPermitidos(estadoActual).includes(valores.estado)) {
      errores.estado = `No puedes pasar de ${estadoActual} a ${valores.estado}.`;
    }
    if (Object.keys(errores).length) return mostrarFormulario(res, datos, errores, '', 422, req.params.id, estadoActual);
    for (const campo of campos) campana[campo] = valores[campo];
    // Validar el documento completo, incluso cuando solo cambia fechaInicio.
    await campana.validate();
    await campana.save();
    return res.redirect(303, `/campanas/${req.params.id}`);
  } catch (error) {
    if (error.name === 'DocumentNotFoundError') error.status = 404;
    if (error.status === 404) return responderErrorRecurso(res, errorRecurso(404, 'La campaña no existe o fue eliminada.'));
    if ([400, 403].includes(error.status)) return responderErrorRecurso(res, error);
    return responderErrorFormulario(res, error, datos, req.params.id, estadoActual);
  }
};

const eliminarCampana = async (req, res, next) => {
  try {
    const campana = await buscarCampana(req.params.id, res.locals.usuarioActual, 'campanas.eliminar');
    if (req.body?.confirmacion !== 'eliminar') {
      return res.status(422).render('campanas/eliminar', {
        titulo: 'Eliminar campaña', campana, mensaje: 'Debes confirmar explícitamente la eliminación.'
      });
    }
    const resultado = await Campana.deleteOne({ _id: campana._id, ...filtroEmpresa(res.locals.usuarioActual) });
    if (!resultado.deletedCount) throw errorRecurso(404, 'La campaña no existe o fue eliminada.');
    return res.redirect(303, '/campanas');
  } catch (error) {
    if ([400, 403, 404].includes(error.status)) return responderErrorRecurso(res, error);
    if (esErrorConexion(error)) error.status = 503;
    return next(error);
  }
};

const ejecutarAutomatizacion = async (req, res, next) => {
  let campana;
  const mostrarError = (status, mensaje) => res.status(status).render('campanas/detalle', {
    titulo: 'Detalle de campaña', campana, canales, estados, formatearFecha, mensaje, errorAutomatizacion: true,
    mensajeCanal: automatizacionService.mensajeCanalNoDisponible(campana.canal)
  });
  try {
    campana = await buscarCampana(req.params.id, res.locals.usuarioActual, 'campanas.ejecutar');
    if (campana.estado !== 'activa') return mostrarError(422, 'Solo puedes ejecutar campañas activas.');
    const mensajeCanal = automatizacionService.mensajeCanalNoDisponible(campana.canal);
    if (mensajeCanal) return mostrarError(422, mensajeCanal);
    // Los datos y el destino nunca se toman del cuerpo del formulario.
    await automatizacionService.ejecutarCampana(campana, res.locals.usuarioActual);
    return res.redirect(303, `/campanas/${req.params.id}?automatizacion=enviada`);
  } catch (error) {
    if ([400, 403, 404].includes(error.status)) return responderErrorRecurso(res, error);
    if (error instanceof automatizacionService.ErrorAutomatizacion) {
      const errores = {
        CANAL_NO_DISPONIBLE: [422, 'Canal aún no disponible.'],
        CUENTAS_REDES_NO_CONECTADAS: [422, 'Conecta Facebook y LinkedIn para publicar'],
        CONTENIDO_EMAIL_INCOMPLETO: [422, 'Completa el asunto y el cuerpo de texto antes de ejecutar la campaña de email.'],
        CONFIGURACION: [503, 'La automatización no está configurada correctamente.'],
        DESHABILITADA: [422, 'La automatización está deshabilitada para esta empresa.'],
        ACCESO_DENEGADO: [403, 'No tienes permiso para ejecutar esta campaña.'],
        CONEXION: [502, 'No se pudo confirmar la recepción de la solicitud. Revisa n8n antes de repetir.'],
        TIMEOUT: [504, 'La automatización no respondió a tiempo. Revisa n8n antes de repetir.'],
        RESPUESTA: [502, 'La automatización devolvió un error. Revisa n8n antes de repetir.']
      };
      if (errores[error.codigo]) return mostrarError(...errores[error.codigo]);
    }
    if (esErrorConexion(error)) error.status = 503;
    return next(error);
  }
};

module.exports = {
  listarCampanas, mostrarFormularioCreacion, crearCampana, mostrarDetalle,
  mostrarFormularioEdicion, actualizarCampana, mostrarConfirmacionEliminacion, eliminarCampana, ejecutarAutomatizacion
};
