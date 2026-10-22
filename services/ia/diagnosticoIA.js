// Solo vocabulario cerrado: nunca serializar errores, peticiones o respuestas.
const etapas = new Set(['ACCESO', 'ENTRADA', 'CONFIGURACION', 'CUOTA', 'CUOTA_ALMACEN', 'CUOTA_ESCRITURA', 'GENERACION', 'VALIDAR_SALIDA', 'SOLICITUD', 'HTTP', 'LEER_RESPUESTA', 'FORMATO', 'MODELO']);
const codigos = new Set(['INTERNO', 'RED', 'TIMEOUT', 'RESPUESTA', 'ACCESO', 'ENTRADA', 'DESHABILITADA', 'LIMITE', 'PROVEEDOR', 'CUOTAS_NO_DISPONIBLES', 'PRIVACIDAD', 'TEXTO_PROTEGIDO',
  'HTTP_400', 'HTTP_401', 'HTTP_403', 'HTTP_404', 'HTTP_408', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504', 'HTTP_OTRO',
  'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EACCES', 'EPERM', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN',
  'FIXTURE_NO_AUTORIZADA', 'PILOTO_NO_AUTORIZADO', 'PROTEGIDO_NO_AUTORIZADO', 'MONGO_AUTENTICACION', 'MONGO_PERMISOS', 'MONGO_SIN_COLECCION',
  'MONGO_INDICES_INCOMPATIBLES', 'MONGO_NO_DISPONIBLE', 'VALIDACION_CUOTA', 'BACKEND_PILOTO_LOCAL', 'BACKEND_PROTECTED', 'BACKEND_DEV_FIXTURE', 'BACKEND_INVALIDO']);
module.exports = (etapa, codigo) => {
  console.error('[IA_DIAGNOSTICO]', JSON.stringify({ etapa: etapas.has(etapa) ? etapa : 'GENERACION', codigo: codigos.has(codigo) ? codigo : 'INTERNO' }));
};
module.exports.codigoCuota = error => {
  const locales = { CUOTAS_DEV_NO_AUTORIZADAS: 'FIXTURE_NO_AUTORIZADA', CUOTAS_PILOTO_NO_AUTORIZADAS: 'PILOTO_NO_AUTORIZADO',
    CUOTAS_PROTEGIDAS_NO_AUTORIZADAS: 'PROTEGIDO_NO_AUTORIZADO' };
  if (Object.hasOwn(locales, error?.message || '')) return locales[error.message];
  const mongo = { 18: 'MONGO_AUTENTICACION', 13: 'MONGO_PERMISOS', 26: 'MONGO_SIN_COLECCION', 85: 'MONGO_INDICES_INCOMPATIBLES', 86: 'MONGO_INDICES_INCOMPATIBLES', 11000: 'LIMITE' };
  if (Object.hasOwn(mongo, error?.code)) return mongo[error.code];
  if (['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoNotConnectedError'].includes(error?.name)) return 'MONGO_NO_DISPONIBLE';
  if (['ValidationError', 'CastError'].includes(error?.name)) return 'VALIDACION_CUOTA';
  return codigos.has(error?.cause?.code) ? error.cause.code : 'INTERNO';
};
