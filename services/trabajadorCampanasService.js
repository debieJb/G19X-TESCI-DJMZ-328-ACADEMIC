// Un único consumidor lógico: las reservas transaccionales del motor coordinan procesos.
const iniciar = ({ motor, intervaloMs = 5000, informar = () => {} }) => {
  let detenido = false, timer, actual;
  const ciclo = async () => {
    if (detenido) return;
    actual = Promise.resolve().then(() => motor.procesarPendientes());
    try { await actual; } catch (error) { informar(error.codigo || 'TRABAJADOR_NO_DISPONIBLE'); }
    finally {
      actual = null;
      if (!detenido) { timer = setTimeout(ciclo, intervaloMs); timer.unref?.(); }
    }
  };
  timer = setTimeout(ciclo, 0);
  return { detener: async () => { detenido = true; clearTimeout(timer); if (actual) await actual.catch(() => {}); } };
};
const prepararArranque = async ({ app, conexion, informar }) => {
  const politica = require('../config/enviosGmail').obtenerPolitica();
  if (!politica.habilitado || !politica.automatico) return null;
  require('./googleOAuthClienteService').configuracion();
  const servicio = require('./motorEnviosGmailService');
  await servicio.preparar(conexion, { inicializar: true });
  app.locals.gmailAutomaticoValidado = true;
  return iniciar({ motor: servicio.crearMotor({ conexion }), informar });
};
module.exports = { iniciar, prepararArranque };
