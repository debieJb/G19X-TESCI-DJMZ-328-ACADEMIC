// Solo representaciones de estados; no concede permisos ni consume enlaces.
const pasos = ['solicitud', 'aceptada', 'pendiente', 'reenvio', 'verificacion', 'administrador', 'completada', 'invalido', 'caducado', 'usado', 'configuracion_caducada'];
const casos = ['inicio', 'login', 'login-error', 'error', ...pasos,
  ...['solicitud', 'aceptada', 'restablecer', 'completada', 'invalida'].map(paso => 'recuperacion-' + paso)];
const fixturePublico = caso => ({
  vista: caso === 'inicio' ? 'index' : caso.startsWith('login') ? 'login' : caso.startsWith('recuperacion-') ? 'recuperacion' : caso === 'error' ? 'error' : 'registro',
  datos: { titulo: 'Acceso no disponible', anio: 2026, usuarioActual: null,
    error: caso === 'login-error' ? 'Correo o contraseña incorrectos' : '',
    mensaje: caso === 'error' ? 'El recurso solicitado no está disponible.' : '',
    paso: caso.replace('recuperacion-', ''), authCsrf: 'a'.repeat(43), registroCsrf: 'b'.repeat(43), recuperacionCsrf: 'd'.repeat(43), idempotencia: 'c'.repeat(43) }
});
module.exports = { casos, fixturePublico };
