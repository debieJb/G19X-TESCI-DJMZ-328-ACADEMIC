'use strict';
const mensajes = Object.freeze({
  CLAVE_AUSENTE: 'Falta GEMINI_API_KEY. No se solicito ninguna generacion.',
  CONFIGURACION_INVALIDA: 'Revisa la habilitacion, clave y modelo de Gemini.',
  CLAVE_INVALIDA: 'Gemini rechazo la clave API. Solicita revisar la credencial.',
  ACCESO_DENEGADO: 'Gemini rechazo el acceso (HTTP 403). Revisa permisos y restricciones de la clave.',
  MODELO_NO_DISPONIBLE: 'El modelo configurado no esta disponible para esta operacion.',
  CUOTA_AGOTADA: 'Gemini informo una cuota agotada. No se reintenta automaticamente.',
  LIMITE_PROVEEDOR: 'Gemini respondio HTTP 429: cuota o tasa limitada. No se reintenta automaticamente.',
  TIMEOUT: 'Gemini no respondio dentro del tiempo limite.',
  CONEXION: 'No se pudo conectar con Gemini. Revisa la conexion.',
  PROVEEDOR: 'Gemini no pudo completar la solicitud.',
  CUOTAS_NO_DISPONIBLES: 'El backend local de cuotas no esta disponible. No se llamo a Gemini.',
  METADATOS_OK: 'Modelo accesible; generacion NO comprobada. No se consumio cuota de generacion.'
});
const detalleRed = error => ['AbortError', 'TimeoutError'].includes(error?.name)
  || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(error?.cause?.code) ? 'TIMEOUT' : 'CONEXION';
const falloHttp = async res => {
  let data;
  try { data = await require('./geminiProveedor').leerLimitado(res); } catch { /* Nunca publicar el cuerpo del proveedor. */ }
  const reasons = Array.isArray(data?.error?.details) ? data.error.details.map(d => d?.reason) : [];
  const clave = reasons.includes('API_KEY_INVALID') || reasons.includes('API_KEY_EXPIRED');
  const cuota = data?.error?.status === 'RESOURCE_EXHAUSTED' && data?.error?.details?.some(d =>
    d?.['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' && Array.isArray(d.violations) && d.violations.length);
  return clave || res.status === 401 ? 'CLAVE_INVALIDA' : res.status === 403 ? 'ACCESO_DENEGADO'
    : res.status === 404 ? 'MODELO_NO_DISPONIBLE' : res.status === 429 ? cuota ? 'CUOTA_AGOTADA' : 'LIMITE_PROVEEDOR'
      : [408, 504].includes(res.status) ? 'TIMEOUT' : 'PROVEEDOR';
};
const comprobar = async ({ env = process.env, proveedor = require('./geminiProveedor') } = {}) => {
  if (!env.GEMINI_API_KEY) return { codigo: 'CLAVE_AUSENTE', mensaje: mensajes.CLAVE_AUSENTE };
  let config;
  try { config = proveedor.configuracion(env); }
  catch { return { codigo: 'CONFIGURACION_INVALIDA', mensaje: mensajes.CONFIGURACION_INVALIDA }; }
  try {
    await proveedor.verificarModelo(config);
    return { codigo: 'METADATOS_OK', mensaje: mensajes.METADATOS_OK };
  } catch (e) {
    const codigo = Object.hasOwn(mensajes, e.detalle) ? e.detalle : 'PROVEEDOR';
    return { codigo, mensaje: mensajes[codigo] };
  }
};
module.exports = { mensajes, detalleRed, falloHttp, comprobar };
