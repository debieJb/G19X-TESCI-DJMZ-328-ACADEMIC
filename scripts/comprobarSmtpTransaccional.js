'use strict';
// verify() solo TLS y AUTH: jamás MAIL FROM, RCPT TO, DATA, colas ni MongoDB.
const principal = async () => {
  if (process.env.TRANSACTIONAL_EMAIL_ENABLED === 'true' || process.env.TRANSACTIONAL_WORKER_ENABLED === 'true') throw Error('APAGAR_ENVIOS_ANTES_DE_COMPROBAR');
  const smtp = require('../services/smtpTransaccionalService');
  return smtp.crearTransporte(smtp.configuracion(process.env, { verificar: true })).verificar();
};
if (require.main === module) principal().then(r => console.log(JSON.stringify(r))).catch(e => {
  const codigo = ['CONFIGURACION_SMTP', 'REAUTORIZAR_TRANSACCIONAL', 'SMTP_RECHAZADO', 'APAGAR_ENVIOS_ANTES_DE_COMPROBAR'].includes(e.codigo || e.message) ? (e.codigo || e.message) : 'SMTP_NO_DISPONIBLE';
  console.error(codigo); process.exitCode = 1;
});
module.exports = { principal };
