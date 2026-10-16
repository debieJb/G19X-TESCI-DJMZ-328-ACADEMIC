// Nunca carga .env. --plan no conecta. --aplicar requiere identidad dedicada y confirmacion.
const mongoose = require('mongoose');
const infra = require('../services/infraestructuraPilotoService');
const principal = async (args = process.argv.slice(2)) => {
  infra.asegurarEnvioApagado();
  if (args.length === 1 && args[0] === '--plan') {
    const c = mongoose.createConnection();
    try { return { plan: infra.planIndices(c) }; } finally { await c.close(); }
  }
  if (args.length !== 3 || args[0] !== '--aplicar' || args[1] !== '--confirmar-base') throw Error('ARGUMENTOS_INVALIDOS');
  const manifiesto = require('../config/manifiestoPiloto').cargarManifiesto();
  if (args[2] !== manifiesto.base || manifiesto.miembros.some(m => /:2701[78]$/.test(m))) throw Error('DESTINO_PROHIBIDO');
  const uri = process.env.MONGODB_URI;
  // No aceptar endpoints prohibidos siquiera como semillas de conexion.
  if (typeof uri !== 'string' || !uri.startsWith('mongodb://')) throw Error('URI_EXPLICITA_REQUERIDA');
  const semillas = uri.slice('mongodb://'.length).split('/')[0].split('@').at(-1).split(',');
  if (semillas.some(s => !/^[A-Za-z0-9.-]+:\d+$/.test(s) || /:2701[78]$/.test(s))
    || semillas.length !== manifiesto.miembros.length || semillas.some(s => !manifiesto.miembros.includes(s))) throw Error('SEMILLAS_NO_APROBADAS');
  const c = await mongoose.createConnection(uri, { dbName: manifiesto.base, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
  try { return await require('../services/migracionIndicesPilotoService').migrarIndicesDedicados({ conexion: c, manifiesto, confirmarBase: args[2] }); }
  finally { await c.close(); }
};
if (require.main === module) principal().then(r => console.log(JSON.stringify(r))).catch(() => {
  console.error('Migracion detenida; sin reparacion ni eliminacion de indices.'); process.exitCode = 1;
});
module.exports = { principal };
