const gemini = require('./geminiProveedor');
const ErrorIA = require('./ErrorIA');
// Solo adaptadores reales. Los dobles se inyectan exclusivamente en pruebas.
const adaptadores = Object.freeze({ gemini });
const seleccionado = () => {
  if (!Object.hasOwn(adaptadores, process.env.AI_PROVIDER || '')) throw new ErrorIA('DESHABILITADA');
  return adaptadores[process.env.AI_PROVIDER];
};
const crear = () => seleccionado().crear();
const disponible = () => { try { seleccionado().configuracion(); return true; } catch { return false; } };
module.exports = { crear, disponible };
