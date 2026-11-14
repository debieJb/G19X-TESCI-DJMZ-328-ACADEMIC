'use strict';
// Creación aditiva: nunca usa syncIndexes, borra índices ni reescribe eventos.
async function prepararIndices(conexion) {
  const original = require('../models/EventoMarketing');
  const modelo = conexion.models.EventoMarketing || conexion.model('EventoMarketing', original.schema.clone());
  await modelo.createCollection();
  await modelo.createIndexes();
}
if (require.main === module) {
  (async () => {
    const { prepararYVerificar } = require('./iniciarDevLocal');
    const env = await prepararYVerificar(); // Exige el replica set local existente en 27018.
    const mongoose = require('mongoose');
    const conexion = await mongoose.createConnection(env.MONGODB_URI, { autoIndex: false, autoCreate: false }).asPromise();
    try { await prepararIndices(conexion); console.log('INDICES_LEAD_SCORING_LISTOS'); }
    finally { await conexion.close(); }
  })().catch(() => { console.error('NO_SE_PUDIERON_PREPARAR_INDICES_LEAD_SCORING: revisa el entorno local y posibles referencias duplicadas. No se eliminaron datos ni indices.'); process.exitCode = 1; });
}
module.exports = { prepararIndices };
