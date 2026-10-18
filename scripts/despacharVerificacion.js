// Una solicitud explícita; no carga .env, no hace DDL y no reintenta automáticamente.
const mongoose = require('mongoose');
const principal = async (args = process.argv.slice(2)) => {
  const infra = require('../services/infraestructuraPilotoService');
  infra.asegurarEnvioApagado();
  if (args.length === 1 && args[0] === '--comprobar') return { estado: 'sin_envios' };
  if (args.length !== 3 || args[0] !== '--solicitud' || !/^[a-f0-9]{24}$/.test(args[1]) || args[2] !== '--autorizar-envio') throw Error('ARGUMENTOS_INVALIDOS');
  if (process.env.TRANSACTIONAL_EMAIL_ENABLED !== 'true' || !process.env.MONGODB_URI) throw Error('ENVIO_NO_AUTORIZADO');
  const manifiesto = require('../config/manifiestoPiloto').cargarManifiesto();
  const correo = require('../services/gmailTransaccionalService').crearCorreo();
  const conexion = await mongoose.createConnection(process.env.MONGODB_URI,
    { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    await infra.validarDestinoPiloto(conexion, manifiesto);
    if (!(await infra.revisarIndices(conexion)).completos) throw Error('INDICES_REQUERIDOS');
    return await require('../services/autoservicioEmpresarialService').crearServicio({ conexion, correo }).despachar({ solicitudId: args[1] });
  } finally { await conexion.close(); }
};
if (require.main === module) principal().then(r => console.log(JSON.stringify(r))).catch(() => {
  console.error('Verificacion detenida. Revisar estado persistido; no reintentar entregas inciertas.'); process.exitCode = 1;
});
module.exports = { principal };
