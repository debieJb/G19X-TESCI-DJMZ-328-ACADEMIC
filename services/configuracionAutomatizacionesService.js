const Empresa = require('../models/Empresa');
const { puede } = require('./permisos');
const ErrorAutomatizacion = require('./ErrorAutomatizacion');
const canales = Object.freeze(['email', 'whatsapp', 'facebook']);
const seleccionWebhooks = canales.map(canal => `+automatizaciones.${canal}.webhookUrl`).join(' ');
const validarUrl = valor => {
  try {
    if (typeof valor !== 'string' || !valor.trim()) throw new Error();
    const url = new URL(valor);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url;
  } catch { throw new ErrorAutomatizacion('CONFIGURACION'); }
};
// campana debe ser el documento persistido obtenido mediante accesoCampanasService.
const resolverWebhook = async (campana, usuario) => {
  if (!puede(usuario, 'campanas.ejecutar', campana.empresa)) throw new ErrorAutomatizacion('ACCESO_DENEGADO');
  if (!campana.empresa) return validarUrl(process.env.N8N_WEBHOOK_URL);
  const empresa = await Empresa.findById(campana.empresa._id || campana.empresa).select(seleccionWebhooks);
  if (!empresa) throw new ErrorAutomatizacion('CONFIGURACION');
  if (!canales.includes(campana.canal)) throw new ErrorAutomatizacion('CANAL_NO_DISPONIBLE');
  const configuracion = empresa.automatizaciones?.[campana.canal];
  const habilitada = configuracion?.habilitada ?? (campana.canal === 'email');
  if (habilitada === false) throw new ErrorAutomatizacion('DESHABILITADA');
  const empresarial = configuracion?.webhookUrl;
  return validarUrl(empresarial !== undefined && empresarial !== null && empresarial !== '' ? empresarial : process.env.N8N_WEBHOOK_URL);
};
module.exports = { resolverWebhook, validarUrl, canales, seleccionWebhooks };
