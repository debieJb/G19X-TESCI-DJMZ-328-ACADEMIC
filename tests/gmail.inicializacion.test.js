const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparar } = require('../services/motorEnviosGmailService');

test('Gmail: inicialización aditiva crea colecciones e índices antes de validarlos sin borrar', async () => {
  const llamadas = [], models = {};
  for (const nombre of ['Empresa', 'Usuario', 'Contacto', 'Campana', 'ConexionGmail', 'EjecucionGmail', 'EnvioGmail', 'ControlEnvioGmail', 'AutorizacionPilotoGmail']) {
    const schema = require(`../models/${nombre}`).schema;
    let creada = false, indices = false;
    models[nombre] = { schema,
      createCollection: async () => { creada = true; llamadas.push(nombre); },
      createIndexes: async () => { assert.equal(creada, true); indices = true; },
      collection: { listIndexes: () => { assert.equal(indices, true); return { toArray: async () => schema.indexes().map(([key, opts]) => ({ key, unique: opts.unique, partialFilterExpression: opts.partialFilterExpression })) }; } }
    };
  }
  const conexion = { readyState: 1, models, db: { admin: () => ({ command: async () => ({ isWritablePrimary: true, setName: 'rsPrueba', maxWireVersion: 25, logicalSessionTimeoutMinutes: 30 }) }) } };
  await preparar(conexion, { inicializar: true });
  assert.equal(llamadas.length, 9);
});
