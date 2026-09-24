const ErrorAutomatizacion = require('./ErrorAutomatizacion');

const ejecutarCampana = async (campana) => {
  if (campana.canal !== 'email') throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  if (['asunto', 'cuerpoTexto'].some(campo => typeof campana[campo] !== 'string' || !campana[campo].trim())) {
    throw new ErrorAutomatizacion('CONTENIDO_EMAIL_INCOMPLETO');
  }
  let url;
  const timeout = Number(process.env.N8N_WEBHOOK_TIMEOUT_MS ?? 10000);
  try {
    url = new URL(process.env.N8N_WEBHOOK_URL);
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
