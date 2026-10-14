const ErrorAutomatizacion = require('./ErrorAutomatizacion');
const { resolverWebhook } = require('./configuracionAutomatizacionesService');
const destinatariosService = require('./destinatariosService');

const ejecutarCampana = async (campana, usuario) => {
  if (campana.versionFlujo === 2 || campana.asistenciaIA || campana.automatizacion) throw new ErrorAutomatizacion('CONFIGURACION');
  if (campana.canal !== 'email') throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  if (['asunto', 'cuerpoTexto'].some(campo => typeof campana[campo] !== 'string' || !campana[campo].trim())) {
    throw new ErrorAutomatizacion('CONTENIDO_EMAIL_INCOMPLETO');
  }
  const url = await resolverWebhook(campana, usuario);
  // Validar permisos antes de la selección. Nunca delegar destinatarios al workflow.
  if (!campana.destinatarios) throw new ErrorAutomatizacion('DESTINATARIOS_INVALIDOS');
  const timeout = Number(process.env.N8N_WEBHOOK_TIMEOUT_MS ?? 10000);
  try {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || !Number.isInteger(timeout) || timeout <= 0 || timeout > 2147483647) throw new Error();
  } catch {
    throw new ErrorAutomatizacion('CONFIGURACION');
  }

  const payload = {
    id: String(campana._id),
    nombre: campana.nombre,
    objetivo: campana.objetivo,
    asunto: campana.asunto,
    cuerpoTexto: campana.cuerpoTexto,
    canal: campana.canal || null,
    estado: campana.estado,
    fechaInicio: campana.fechaInicio ? campana.fechaInicio.toISOString() : null,
    fechaFin: campana.fechaFin ? campana.fechaFin.toISOString() : null
  };
  {
    const destinatarios = await destinatariosService.resolverDestinatarios(campana);
    if (!destinatarios.length) throw new ErrorAutomatizacion('SIN_DESTINATARIOS');
    // Un solo webhook; los campos históricos mantienen su forma y significado.
    payload.destinatarios = destinatarios;
    payload.totalDestinatarios = destinatarios.length;
    payload.tipoDestinatarios = campana.destinatarios.tipo;
  }
  // Bloqueo obligatorio, independiente de variables de entorno y datos del cliente.
  throw new ErrorAutomatizacion('ENVIOS_BLOQUEADOS');
  // Transporte conservado hasta integrar Gmail, consentimiento e historial.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abort.signal,
      redirect: 'manual'
    });
    // Solo interesa el código HTTP; no exponer ni almacenar la respuesta externa.
    if (respuesta.body) await respuesta.body.cancel();
    if (!respuesta.ok) throw new ErrorAutomatizacion('RESPUESTA');
  } catch (error) {
    if (error instanceof ErrorAutomatizacion) throw error;
    throw new ErrorAutomatizacion(abort.signal.aborted ? 'TIMEOUT' : 'CONEXION');
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { ejecutarCampana, ErrorAutomatizacion };
