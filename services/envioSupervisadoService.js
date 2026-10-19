'use strict';
// Infrastructure validation only: no timer, queue consumer or network delivery.
const prepararArranque = async ({ app, conexion }) => {
  const p = require('../config/enviosGmail').obtenerPolitica();
  if (!p.supervisado || !p.habilitado) return false;
  require('./googleOAuthClienteService').configuracion();
  await require('./motorEnviosGmailService').preparar(conexion);
  app.locals.gmailSupervisadoValidado = true;
  return true;
};
module.exports = { prepararArranque };
