const Campana = require('../models/Campana');

const canales = { email: 'Correo electrónico', redes_sociales: 'Redes sociales', sms: 'SMS', otro: 'Otro' };
const estados = { borrador: 'Borrador', programada: 'Programada', activa: 'Activa', pausada: 'Pausada', finalizada: 'Finalizada' };
const campos = ['nombre', 'objetivo', 'canal', 'estado', 'fechaInicio', 'fechaFin'];
const etiquetas = { nombre: 'Nombre', objetivo: 'Objetivo', canal: 'Canal', estado: 'Estado', fechaInicio: 'Fecha de inicio', fechaFin: 'Fecha de fin' };

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
const buscarCampana = async (id) => {
  if (typeof id !== 'string' || id.length !== 24 || !/^[a-fA-F0-9]{24}$/.test(id)) throw errorRecurso(400, 'El identificador de la campaña no es válido.');
  const campana = await Campana.findById(id);
  if (!campana) throw errorRecurso(404, 'La campaña no existe o fue eliminada.');
  return campana;
};

const responderErrorRecurso = (res, error) => res.status(error.status).render('error', {
  titulo: error.status === 404 ? 'Campaña no encontrada' : 'Identificador inválido', mensaje: error.message
});

const esErrorConexion = (error) => ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoTopologyClosedError', 'MongoNotConnectedError'].includes(error.name)
  || /buffering timed out/i.test(error.message || '');

const listarCampanas = async (req, res, next) => {
  try {
    const campanas = await Campana.find().sort({ createdAt: -1, _id: -1 }).lean();
    res.render('campanas/index', {
      titulo: 'Campañas', campanas, canales, estados,
      formatearFecha
    });
  } catch (error) {
    if (esErrorConexion(error)) error.status = 503;
    next(error);
  }
};

const mostrarFormularioCreacion = (req, res) => mostrarFormulario(res, {
  nombre: '', objetivo: '', canal: '', estado: 'borrador', fechaInicio: '', fechaFin: ''
});

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
    fechaInicio: undefined, fechaFin: undefined
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
  if (Object.keys(errores).length) return mostrarFormulario(res, datos, errores, '', 422);
  try {
    await Campana.create(valores);
    return res.redirect(303, '/campanas');
  } catch (error) {
    return responderErrorFormulario(res, error, datos);
  }
};

const consultarCampana = (vista, titulo) => async (req, res, next) => {
  try {
    const campana = await buscarCampana(req.params.id);
    if (vista === 'editar') {
      const datos = {};
      for (const campo of campos) {
        datos[campo] = campo.startsWith('fecha')
          ? (campana[campo] ? campana[campo].toISOString().slice(0, 10) : '')
          : (campana[campo] || '');
      }
      return mostrarFormulario(res, datos, {}, '', 200, req.params.id, campana.estado);
    }
    return res.render(`campanas/${vista}`, { titulo, campana, canales, estados, formatearFecha, mensaje: '' });
  } catch (error) {
    if ([400, 404].includes(error.status)) return responderErrorRecurso(res, error);
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
    const campana = await buscarCampana(req.params.id);
    estadoActual = campana.estado;
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
    if (error.status === 400) return responderErrorRecurso(res, error);
    return responderErrorFormulario(res, error, datos, req.params.id, estadoActual);
  }
};

const eliminarCampana = async (req, res, next) => {
  try {
    const campana = await buscarCampana(req.params.id);
    if (req.body?.confirmacion !== 'eliminar') {
      return res.status(422).render('campanas/eliminar', {
        titulo: 'Eliminar campaña', campana, mensaje: 'Debes confirmar explícitamente la eliminación.'
      });
    }
    const resultado = await Campana.deleteOne({ _id: campana._id });
    if (!resultado.deletedCount) throw errorRecurso(404, 'La campaña no existe o fue eliminada.');
    return res.redirect(303, '/campanas');
  } catch (error) {
    if ([400, 404].includes(error.status)) return responderErrorRecurso(res, error);
    if (esErrorConexion(error)) error.status = 503;
    return next(error);
  }
};

module.exports = {
  listarCampanas, mostrarFormularioCreacion, crearCampana, mostrarDetalle,
  mostrarFormularioEdicion, actualizarCampana, mostrarConfirmacionEliminacion, eliminarCampana
};
