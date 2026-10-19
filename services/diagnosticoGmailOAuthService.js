'use strict';
// Lista cerrada. No registrar mensajes, descripciones, cuerpos, URL ni contexto de petición.
const etapas = new Set(['ACCESO', 'CONFIGURACION', 'ESTADO_OAUTH', 'CONEXION', 'PKCE', 'CANJE_TOKENS',
  'VALIDAR_TOKENS', 'VERIFICAR_ID_TOKEN', 'IDENTIDAD', 'SCOPES', 'REFRESH_TOKEN', 'REVALIDAR_EMPRESA', 'GUARDAR_CONEXION', 'CALLBACK_SESION']);
const oauth = new Set(['invalid_client', 'invalid_grant', 'redirect_uri_mismatch', 'unauthorized_client',
  'invalid_request', 'invalid_scope', 'access_denied', 'temporarily_unavailable', 'server_error']);
const red = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT',
  'ERR_CANCELED', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_URL']);
const internos = new Set(['ACCESO_DENEGADO', 'EMPRESA_INACTIVA', 'CONFIGURACION', 'CIFRADO', 'ESTADO_INVALIDO',
  'RECHAZADA', 'IDENTIDAD', 'SCOPES', 'REFRESH_AUSENTE', 'CUENTA_DISTINTA', 'CUENTA_OCUPADA', 'CONFLICTO', 'GOOGLE']);
const codigoSeguro = error => {
  const proveedor = error?.response?.data?.error;
  if (oauth.has(proveedor)) return proveedor.toUpperCase();
  for (const causa of [error, error?.cause, error?.cause?.cause]) if (red.has(causa?.code)) return causa.code;
  if (internos.has(error?.codigo)) return error.codigo;
  if ([400, 401, 403, 429, 500, 502, 503, 504].includes(error?.response?.status)) return `HTTP_${error.response.status}`;
  if (error?.code === 11000) return 'INDICE_UNICO';
  return 'NO_CLASIFICADO';
};
const registrar = (etapa, error) => {
  console.error('[GMAIL_OAUTH]', JSON.stringify({ etapa: etapas.has(etapa) ? etapa : 'NO_CLASIFICADA', codigo: codigoSeguro(error) }));
};
module.exports = { registrar, codigoSeguro };
