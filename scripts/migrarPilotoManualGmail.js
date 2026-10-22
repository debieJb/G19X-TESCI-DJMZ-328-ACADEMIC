'use strict';
const principal = async args => {
  if (args.length !== 1 || !['--plan', '--aplicar'].includes(args[0])) throw Error('ARGUMENTOS_INVALIDOS');
  require('dotenv').config({ quiet: true });
  const mongoose = require('mongoose');
  const conexion = await mongoose.createConnection(process.env.MONGODB_URI,
    { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 3000 }).asPromise();
  try {
    const servicio = require('../services/pilotoManualGmailService');
    return args[0] === '--aplicar' ? await servicio.migrar(conexion) : { faltantes: await servicio.inspeccionar(conexion) };
  } finally { await conexion.close(); }
};
if (require.main === module) principal(process.argv.slice(2)).then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => { console.error(/^[A-Z_]+$/.test(e.message) ? e.message : 'MIGRACION_NO_COMPLETADA'); process.exitCode = 1; });
module.exports = { principal };
