const ErrorAutomatizacion = require('./ErrorAutomatizacion');
const mensajeNoDisponible = 'Canal fuera del alcance del MVP actual. Esta campaña no puede ejecutarse.';
// Bloquear también las llamadas directas, sin consultar contactos ni enviar mensajes.
const ejecutarCampana = async () => {
  throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
};
module.exports = { ejecutarCampana, mensajeNoDisponible };
