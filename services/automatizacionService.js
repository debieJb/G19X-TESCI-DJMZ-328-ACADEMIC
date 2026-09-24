const emailService = require('./emailService');
const ErrorAutomatizacion = require('./ErrorAutomatizacion');

// Solo los canales registrados pueden ejecutar una integración. No hay alternativa por defecto.
const integraciones = new Map([['email', emailService]]);

const mensajeCanalNoDisponible = (canal) => {
  if (integraciones.has(canal)) return '';
  return canal == null || canal === ''
    ? 'Selecciona un canal para ejecutar la campaña.'
    : 'Canal aún no disponible.';
};

const ejecutarCampana = async (campana) => {
  const integracion = integraciones.get(campana.canal);
  if (!integracion) throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  return integracion.ejecutarCampana(campana);
};

module.exports = { ejecutarCampana, mensajeCanalNoDisponible, ErrorAutomatizacion };
