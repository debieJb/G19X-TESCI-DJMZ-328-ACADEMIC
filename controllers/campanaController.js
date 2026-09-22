const Campana = require('../models/Campana');

const canales = { email: 'Correo electrónico', redes_sociales: 'Redes sociales', sms: 'SMS', otro: 'Otro' };
const estados = { borrador: 'Borrador', programada: 'Programada', activa: 'Activa', pausada: 'Pausada', finalizada: 'Finalizada' };
const campos = ['nombre', 'objetivo', 'canal', 'estado', 'fechaInicio', 'fechaFin'];
const etiquetas = { nombre: 'Nombre', objetivo: 'Objetivo', canal: 'Canal', estado: 'Estado', fechaInicio: 'Fecha de inicio', fechaFin: 'Fecha de fin' };

const mostrarFormulario = (res, datos, errores = {}, mensaje = '', status = 200) =>
  res.status(status).render('campanas/nueva', { titulo: 'Nueva campaña', datos, errores, mensaje, canales, estados });

const esErrorConexion = (error) => ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoTopologyClosedError', 'MongoNotConnectedError'].includes(error.name)
  || /buffering timed out/i.test(error.message || '');

const listarCampanas = async (req, res, next) => {
  try {
    const campanas = await Campana.find().sort({ createdAt: -1, _id: -1 }).lean();
    res.render('campanas/index', {
      titulo: 'Campañas', campanas, canales, estados,
      formatearFecha: (fecha) => fecha ? new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC' }).format(new Date(fecha)) : 'Sin definir'
    });
  } catch (error) {
    if (esErrorConexion(error)) error.status = 503;
    next(error);
  }
};

const mostrarFormularioCreacion = (req, res) => mostrarFormulario(res, {
  nombre: '', objetivo: '', canal: '', estado: 'borrador', fechaInicio: '', fechaFin: ''
});

const crearCampana = async (req, res) => {
  const datos = {};
  const errores = {};
  const entrada = req.body || {};
  for (const campo of campos) {
    const valor = Object.hasOwn(entrada, campo) ? entrada[campo] : undefined;
    datos[campo] = typeof valor === 'string' ? valor : '';
    if (valor !== undefined && typeof valor !== 'string') errores[campo] = `${etiquetas[campo]} debe contener un valor de texto.`;
  }
  const valores = {
    nombre: datos.nombre.trim(), objetivo: datos.objetivo.trim(),
    canal: datos.canal || undefined, estado: datos.estado || 'borrador'
  };
  datos.estado ||= 'borrador';
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
  if (Object.keys(errores).length) return mostrarFormulario(res, datos, errores, '', 422);

  try {
    await Campana.create(valores);
    return res.redirect(303, '/campanas');
  } catch (error) {
    if (error.name === 'ValidationError') {
      for (const campo of campos) {
        if (error.errors[campo]) errores[campo] = campo === 'fechaFin'
          ? 'La fecha de fin debe ser válida y no anterior a la fecha de inicio.'
          : `Revisa el campo ${etiquetas[campo].toLowerCase()}: su valor no es válido.`;
      }
      return mostrarFormulario(res, datos, errores, 'Revisa los datos de la campaña.', 422);
    }
    // No registrar el cuerpo del formulario ni mensajes que puedan incluir credenciales.
    console.error('Error al crear una campaña.');
    const status = esErrorConexion(error) ? 503 : 500;
    return mostrarFormulario(res, datos, {}, status === 503
      ? 'La base de datos no está disponible. Tus datos se conservan en el formulario; intenta más tarde.'
      : 'No se pudo confirmar el guardado. Consulta el listado antes de volver a intentarlo.', status);
  }
};

module.exports = { listarCampanas, mostrarFormularioCreacion, crearCampana };
