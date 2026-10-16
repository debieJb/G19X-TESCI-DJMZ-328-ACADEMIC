const URL_ENVIO = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
class ErrorEnvioGmail extends Error {
  constructor(codigo, incierto = false) { super(codigo); this.codigo = codigo; this.incierto = incierto; }
}
const leerJsonAcotado = async res => {
  const reader = res.body?.getReader(); if (!reader) throw new ErrorEnvioGmail('RESPUESTA_INVALIDA', true);
  const bloques = []; let total = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      total += value.length; if (total > 16384) throw new ErrorEnvioGmail('RESPUESTA_INVALIDA', true); bloques.push(Buffer.from(value)); }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(bloques).toString('utf8')); } catch { throw new ErrorEnvioGmail('RESPUESTA_INVALIDA', true); }
};
const enviar = async ({ accessToken, raw, empresa }) => {
  const politica = require('../config/enviosGmail').obtenerPolitica();
  if (!politica.habilitado || !politica.empresas.includes(String(empresa))) throw new ErrorEnvioGmail('ENVIOS_BLOQUEADOS');
  if (typeof accessToken !== 'string' || !accessToken || /[\r\n]/.test(accessToken)
    || typeof raw !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw) || raw.length > 600000) throw new ErrorEnvioGmail('SOLICITUD_INVALIDA');
  // fetch sin renovación/retry automático; jamás OAuth2Client.request para enviar.
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
  try {
    const res = await fetch(URL_ENVIO, { method: 'POST', redirect: 'manual', signal: abort.signal,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
    if (!res.ok) {
      let cuota403 = false;
      if (res.status === 403) {
        try { const detalle = await leerJsonAcotado(res); cuota403 = detalle?.error?.errors?.some(e =>
          ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded'].includes(e.reason)) === true; } catch { /* rechazo HTTP confirmado */ }
      } else if (res.body) await res.body.cancel();
      const codigo = res.status === 401 ? 'REAUTORIZAR' : res.status === 429 || cuota403 ? 'CUOTA_PROVEEDOR'
        : res.status === 403 ? 'PERMISO_PROVEEDOR' : 'RECHAZO_PROVEEDOR';
      throw new ErrorEnvioGmail(codigo, ![400, 401, 403, 404, 413, 422, 429].includes(res.status));
    }
    // Lectura acotada: una respuesta truncada o ilegible deja el resultado incierto.
    const datos = await leerJsonAcotado(res);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(datos.id || '') || !/^[a-zA-Z0-9_-]{1,128}$/.test(datos.threadId || '')) throw new ErrorEnvioGmail('RESPUESTA_INVALIDA', true);
    return { gmailId: datos.id, threadId: datos.threadId };
  } catch (e) {
    if (e instanceof ErrorEnvioGmail) throw e;
    throw new ErrorEnvioGmail(abort.signal.aborted ? 'TIMEOUT' : 'CONEXION', true);
  } finally { clearTimeout(timer); }
};
module.exports = { enviar, ErrorEnvioGmail };
