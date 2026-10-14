const { puede } = require('./permisos');
const ErrorAutomatizacion = require('./ErrorAutomatizacion');
const { obtenerEmpresaParaEjecucion } = require('./accesoEmpresaService');
const { validarUrl } = require('./validacionWebhookService');
const canales = Object.freeze(['email']);
const seleccionWebhooks = canales.map(canal => `+automatizaciones.${canal}.webhookUrl`).join(' ');
// campana debe ser el documento persistido obtenido mediante accesoCampanasService.
const resolverWebhook = async (campana, usuario) => {
  if (!puede(usuario, 'campanas.ejecutar', campana.empresa)) throw new ErrorAutomatizacion('ACCESO_DENEGADO');
  if (campana.canal !== 'email') throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  if (!campana.empresa) return validarUrl(process.env.N8N_WEBHOOK_URL);
  const empresa = await obtenerEmpresaParaEjecucion(campana.empresa, `estado automatizaciones.email.habilitada ${seleccionWebhooks}`);
  if (!canales.includes(campana.canal)) throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  const configuracion = empresa.automatizaciones?.[campana.canal];
  const habilitada = configuracion?.habilitada ?? (campana.canal === 'email');
  if (habilitada === false) throw new ErrorAutomatizacion('DESHABILITADA');
  const empresarial = configuracion?.webhookUrl;
  return validarUrl(empresarial !== undefined && empresarial !== null && empresarial !== '' ? empresarial : process.env.N8N_WEBHOOK_URL);
};
module.exports = { resolverWebhook, validarUrl, canales, seleccionWebhooks };
