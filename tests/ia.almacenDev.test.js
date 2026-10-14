const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const almacen = require('../services/ia/almacenCuotasDev');
const modelo = require('../models/UsoIA');
const indices = () => [{ name: '_id_', key: { _id: 1 } },
  { name: 'empresa_1_ventana_1', key: { empresa: 1, ventana: 1 }, unique: true },
  { name: 'expiraEn_1', key: { expiraEn: 1 }, expireAfterSeconds: 0 }];
const env = () => ({ NODE_ENV: 'development', AI_QUOTA_DEV_DB: 'ma_ia_test_' + 'a'.repeat(32),
  AI_QUOTA_DEV_MARKER: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

test('cuotas dev: esquema no crea modelos en la conexión principal ni estructuras automáticas', () => {
  assert.equal(modelo.schema.options.autoCreate, false); assert.equal(modelo.schema.options.autoIndex, false);
  assert.equal(modelo.schema.options.bufferCommands, false);
  assert.equal(mongoose.connection.models.UsoIA, undefined);
  assert.throws(() => modelo.crearModelo(mongoose.connection), /NO_AUTORIZADA/);
});
test('cuotas dev: configuración solo permite entorno de desarrollo/test y base ficticia explícita', () => {
  assert.equal(almacen.configuracion(env()).base, env().AI_QUOTA_DEV_DB);
  for (const cambio of [{ NODE_ENV: 'production' }, { NODE_ENV: undefined }, { AI_QUOTA_DEV_DB: 'marketing_automation' },
    { AI_QUOTA_DEV_DB: 'admin' }, { AI_QUOTA_DEV_DB: undefined }, { AI_QUOTA_DEV_MARKER: '' }]) {
    assert.throws(() => almacen.configuracion({ ...env(), ...cambio }), /NO_AUTORIZADAS/);
  }
});
test('cuotas dev: no acepta IDs empresariales normales ni conecta al fallar la validación de fixture', async t => {
  const conectar = t.mock.method(mongoose, 'createConnection', () => { throw Error('No conectar'); });
  for (const empresa of ['507f1f77bcf86cd799439011', 'empresa-a', undefined, { $ne: null }]) {
    await assert.rejects(almacen.obtener(empresa), /NO_AUTORIZADAS/);
  }
  assert.equal(conectar.mock.callCount(), 0);
});
test('cuotas dev: índices únicos y TTL exactos, sin sparse, parcial ni índices adicionales', () => {
  assert.doesNotThrow(() => almacen.validarIndices(indices()));
  for (const cambiar of [x => x.pop(), x => { x[1].unique = false; }, x => { x[1].sparse = true; },
    x => { x[1].partialFilterExpression = { empresa: { $exists: true } }; },
    x => { x[2].expireAfterSeconds = 60; }, x => { x[2].partialFilterExpression = {}; },
    x => x.push({ name: 'extra', key: { otro: 1 } })]) {
    const copia = indices(); cambiar(copia); assert.throws(() => almacen.validarIndices(copia), /NO_AUTORIZADAS/);
  }
});
test('cuotas dev: identidad rechaza conexión empresarial y destino de puerto diferente', async () => {
  await assert.rejects(almacen.identidad(mongoose.connection), /NO_AUTORIZADAS/);
  const falsa = { readyState: 1, name: env().AI_QUOTA_DEV_DB, getClient: () => ({ options: {
    hosts: [{ host: '127.0.0.1', port: 27017 }], replicaSet: 'marketingDevRs' } }) };
  await assert.rejects(almacen.identidad(falsa), /NO_AUTORIZADAS/);
  assert.throws(() => modelo.crearModelo(falsa), /NO_AUTORIZADA/);
});
