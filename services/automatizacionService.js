
const emailService = require('./emailService');
const ErrorAutomatizacion = require('./ErrorAutomatizacion');

const integraciones = new Map([
  ['email', emailService]
]);

const mensajeCanalNoDisponible = (canal) => {
  if (integraciones.has(canal)) {
    return integraciones.get(canal).mensajeNoDisponible || '';
  }

  return 'Canal fuera del alcance del MVP actual. Esta campaña no puede ejecutarse.';
};

const ejecutarCampana = async (campana, usuario) => {
  const integracion = integraciones.get(campana.canal);

  if (!integracion) {
    throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  }

  return integracion.ejecutarCampana(campana, usuario);
};

module.exports = {
  ejecutarCampana,
  mensajeCanalNoDisponible,
  ErrorAutomatizacion
};
