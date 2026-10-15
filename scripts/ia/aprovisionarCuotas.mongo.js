'use strict';

// Conserva el nombre historico, pero se ejecuta con Node, no con mongosh.
const { MongoClient, ObjectId } = require('mongoose').mongo;
const { leerSecretoOculto } = require('./entradaSecreta');
const { runProvisioning } = require('./cuotasProvisioningCore');

if (require.main === module) {
  const target = process.argv.slice(2).filter(arg => arg.startsWith('--target='));
  if (process.argv.slice(2).some(arg => !arg.startsWith('--target=')) || target.length > 1) {
    console.error('APROVISIONAMIENTO_FALLIDO stage=arguments code=TARGET_INVALIDO');
    process.exitCode = 2;
  } else runProvisioning({ MongoClient, ObjectId, prompt: leerSecretoOculto, mode: 'initial',
    target: target.length ? target[0].slice('--target='.length) : 'legacy' })
    .catch(() => { process.exitCode = 1; });
}

module.exports = { runProvisioning };
