const ErrorAutomatizacion = require('./ErrorAutomatizacion');

const mensajeNoDisponible = 'Conecta Facebook y LinkedIn para publicar';
const redes = ['facebook', 'linkedin'];

// Una solicitud comparte texto; cada destino conserva su resultado independiente.
const prepararPublicacion = (campana) => {
  if (campana.canal !== 'redes_sociales') throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  return {
    campanaId: String(campana._id),
    texto: campana.publicacion || '',
    destinos: redes.map(red => ({ red, cuentaId: null }))
  };
};

const ejecutarCampana = async (campana) => {
  const solicitud = prepararPublicacion(campana);
  // Todavía no existe conexión de cuentas. Nunca simular éxito ni llamar a email.
  const error = new ErrorAutomatizacion('CUENTAS_REDES_NO_CONECTADAS');
  error.resultados = solicitud.destinos.map(({ red, cuentaId }) => ({
    campanaId: solicitud.campanaId, red, cuentaId,
    estado: 'bloqueada', publicacionId: null,
    codigo: 'CUENTA_NO_CONECTADA'
  }));
  throw error;
};

module.exports = { prepararPublicacion, ejecutarCampana, mensajeNoDisponible };
