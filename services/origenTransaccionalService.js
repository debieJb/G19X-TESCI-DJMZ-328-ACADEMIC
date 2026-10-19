'use strict';
// Nunca inferir enlaces de Host/X-Forwarded-Host ni aceptar un origen desde HTTP.
const validarOrigen = (valor, { entorno = process.env.NODE_ENV, simulado = false } = {}) => {
  const url = new URL(valor);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local && (entorno === 'development' || (simulado && entorno !== 'production'))))
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('ORIGEN_PUBLICO_INVALIDO');
  return url;
};
const validarServidorLocal = (env = process.env) => {
  if (env.TRANSACTIONAL_EMAIL_ENABLED !== 'true' || env.NODE_ENV !== 'development') return;
  const url = validarOrigen(env.TRANSACTIONAL_PUBLIC_ORIGIN, { entorno: env.NODE_ENV });
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && (url.protocol !== 'http:' || Number(url.port || 80) !== Number(env.PORT || 3000))) throw Error('ORIGEN_NO_COINCIDE_CON_SERVIDOR_LOCAL');
};
module.exports = { validarOrigen, validarServidorLocal };
