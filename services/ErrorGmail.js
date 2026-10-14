const mensajes = Object.freeze({
  ACCESO_DENEGADO: [403, 'No tienes permiso para administrar esta conexión Gmail.'],
  EMPRESA_INACTIVA: [422, 'La empresa está inactiva. No puede conectar ni renovar Gmail.'],
  CONFIGURACION: [503, 'Gmail OAuth no está configurado correctamente. Contacta al administrador de la plataforma.'],
  CIFRADO: [503, 'No se pudieron proteger o recuperar las credenciales de Gmail.'],
  ESTADO_INVALIDO: [400, 'La autorización caducó o no corresponde a tu sesión. Inicia la conexión nuevamente.'],
  RECHAZADA: [422, 'No autorizaste la conexión con Google. La conexión anterior se conserva.'],
  IDENTIDAD: [422, 'Google no confirmó una identidad válida para esta autorización.'],
  SCOPES: [422, 'Debes autorizar el permiso de envío de Gmail y la identificación de tu cuenta.'],
  REFRESH_AUSENTE: [422, 'Google no concedió acceso sin conexión. Vuelve a conectar y autoriza el acceso solicitado.'],
  CUENTA_DISTINTA: [422, 'Para cambiar la cuenta Gmail, desconecta primero la cuenta actual.'],
  CUENTA_OCUPADA: [409, 'Esta cuenta Google ya está asociada a otra empresa. Utiliza una cuenta independiente.'],
  SIN_CONEXION: [422, 'No hay una cuenta Gmail conectada.'],
  RECONEXION: [422, 'La autorización de Google dejó de ser válida. Vuelve a conectar Gmail.'],
  CONFLICTO: [409, 'La conexión cambió o hay otra operación en curso. Consulta su estado antes de repetir.'],
  GOOGLE: [503, 'Google no pudo completar la operación. Intenta de nuevo más tarde.'],
  CSRF: [403, 'El formulario caducó o no pertenece a tu sesión. Vuelve a cargar la página.']
});

class ErrorGmail extends Error {
  constructor(codigo) {
    const entrada = mensajes[codigo] || mensajes.GOOGLE;
    super(entrada[1]);
    this.name = 'ErrorGmail'; this.codigo = codigo; this.status = entrada[0];
  }
}
module.exports = ErrorGmail;
