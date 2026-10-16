// Unidad de trabajo supervisable. No carga .env ni se inicia con Express.
const mongoose = require('mongoose');
const { obtenerPolitica } = require('../config/enviosGmail');
const { crearMotor } = require('../services/motorEnviosGmailService');
const principal = async (argumentos = process.argv.slice(2)) => {
  if (argumentos.length === 1 && argumentos[0] === '--comprobar') {
    require('../services/infraestructuraPilotoService').asegurarEnvioApagado();
    return { estado: 'comprobacion_sin_envios' };
  }
  if (!obtenerPolitica().habilitado) throw Error('ENVIOS_BLOQUEADOS');
  if (argumentos.length !== 1 || !/^[a-f0-9]{24}$/.test(argumentos[0])) throw Error('ARGUMENTO_INVALIDO');
  // Un manifiesto separado identifica el destino aprobado; nunca el replica set de desarrollo.
  const manifiesto = require('../config/manifiestoPiloto').cargarManifiesto();
  if (!process.env.MONGODB_URI) throw Error('CONFIGURACION');
  const conexion = await mongoose.createConnection(process.env.MONGODB_URI,
    { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    const infra = require('../services/infraestructuraPilotoService');
    await infra.validarDestinoPiloto(conexion, manifiesto);
    if (!(await infra.revisarIndices(conexion)).completos) throw Error('INDICES_REQUERIDOS');
    const resultado = await crearMotor({ conexion }).procesarUno(argumentos[0]);
    // Resultado propio y enumerado; no imprimir respuesta del proveedor ni datos.
    return { estado: resultado.estado };
  } finally { await conexion.close(); }
};
if (require.main === module) principal().then(resultado => console.log(JSON.stringify(resultado))).catch(() => {
  console.error('Trabajo detenido; revisar estado persistido antes de actuar. Sin reintento automatico.'); process.exitCode = 1;
});
module.exports = { principal };
