'use strict';

// Ejecutar solo desde recuperarAlmacenCuotas.ps1, que valida el proceso Windows.
const { MongoClient, ObjectId } = require('mongoose').mongo;
const { leerSecretoOculto } = require('./entradaSecreta');
const { runProvisioning } = require('./cuotasProvisioningCore');

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args.length === 0 ? 'legacy' : args.length === 1 && args[0] === '--target=gemini' ? 'gemini' : null;
  if (!target) {
    console.error('APROVISIONAMIENTO_FALLIDO stage=arguments code=TARGET_INVALIDO');
    process.exitCode = 2;
  } else runProvisioning({ MongoClient, ObjectId, prompt: leerSecretoOculto, mode: 'recovery', target })
    .catch(() => { process.exitCode = 1; });
}

module.exports = { runProvisioning };
