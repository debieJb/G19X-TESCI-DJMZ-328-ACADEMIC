const mensajes = {
  PRIVACIDAD: [422, 'Confirma el envío de texto a Gemini y retira datos personales, enlaces y posibles secretos. No incluyas información sensible.'],
  TEXTO_PROTEGIDO: [422, 'La propuesta no conserva literalmente el texto intocable. Revísala o pide otra propuesta antes de continuar.'],
  ACCESO: [403, 'No tienes acceso al asistente de esta empresa.'],
  ENTRADA: [422, 'Revisa los campos y sus límites. Solo se admite el canal email.'],
  DESHABILITADA: [503, 'La generación con IA está deshabilitada. Falta configurar y autorizar un proveedor real.'],
  LIMITE: [429, 'Se alcanzó el límite del asistente. Intenta más tarde.'],
  PROVEEDOR: [503, 'El proveedor de IA no pudo completar la solicitud. No se guardó ninguna campaña.'],
  CUOTAS_NO_DISPONIBLES: [503, 'El asistente no puede generar porque su control de cuotas no está disponible. Solicita al administrador revisar la configuración de IA. No se llamó a Gemini.'],
  RESPUESTA: [502, 'La IA no devolvió una propuesta válida. No se guardó ninguna campaña.'],
  PROPUESTA: [409, 'La propuesta caducó o pertenece a otra sesión. Genera una nueva propuesta.']
};
module.exports = class ErrorIA extends Error {
  constructor(codigo = 'PROVEEDOR') {
    const [status, mensaje] = mensajes[codigo] || mensajes.PROVEEDOR;
    super(mensaje); this.codigo = codigo; this.status = status;
  }
};
