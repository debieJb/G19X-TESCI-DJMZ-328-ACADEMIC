const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const almacen = require('../services/ia/almacenCuotasProtegido');
const modelo = require('../models/UsoIA');
const uri = 'mongodb://quota-db.example.test/plurione_ai_quota?tls=true';
const env = () => ({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://app-db.example.test/marketing_automation',
  AI_QUOTA_MONGODB_URI: uri });
const indices = () => [{ name: '_id_', key: { _id: 1 } },
  { name: 'empresa_1_ventana_1', key: { empresa: 1, ventana: 1 }, unique: true },
  { name: 'expiraEn_1', key: { expiraEn: 1 }, expireAfterSeconds: 0 }];
const identidad = cambios => ({
  conexion: { readyState: 1, name: almacen.BASE, getClient: () => ({ options: { hosts: [{ host: 'quota-db.example.test', port: 27017 }] } }) },
  hello: { isWritablePrimary: true },
  estado: { authInfo: {
    authenticatedUsers: [{ user: 'runtime', db: almacen.BASE }],
    authenticatedUserRoles: [{ role: almacen.ROL, db: almacen.BASE }],
    authenticatedUserPrivileges: [{ resource: { db: almacen.BASE, collection: 'usoias' }, actions: [...almacen.ACCIONES] }]
  } }, tls: true, ...cambios
});

test('cuotas protegidas: exige URI separada y base fija sin leer ni alterar la conexión principal', () => {
  assert.deepEqual(almacen.configuracion(env()), { uri, base: almacen.BASE, srv: false });
  for (const cambios of [
    { AI_QUOTA_MONGODB_URI: undefined },
    { AI_QUOTA_MONGODB_URI: 'mongodb://quota-db.example.test/marketing_automation' },
    { AI_QUOTA_MONGODB_URI: 'mongodb://quota-db.example.test/otra' },
    { MONGODB_URI: 'mongodb://app-db.example.test/plurione_ai_quota' },
    { NODE_ENV: 'production', AI_QUOTA_MONGODB_URI: undefined }
  ]) assert.throws(() => almacen.configuracion({ ...env(), ...cambios }), /NO_AUTORIZADAS/);
  assert.equal(modelo.schema.options.autoCreate, false);
  assert.equal(modelo.schema.options.autoIndex, false);
  assert.equal(mongoose.connection.models.UsoIA, undefined);
});

test('cuotas protegidas: requiere autenticación con rol y privilegios mínimos en la colección exacta', () => {
  assert.doesNotThrow(() => almacen.validarIdentidad(identidad()));
  for (const cambios of [
    { estado: { authInfo: { authenticatedUsers: [], authenticatedUserRoles: [], authenticatedUserPrivileges: [] } } },
    { estado: { authInfo: { authenticatedUsers: [{ user: 'x', db: almacen.BASE }], authenticatedUserRoles: [{ role: 'readWrite', db: almacen.BASE }], authenticatedUserPrivileges: [] } } },
    { estado: { authInfo: { authenticatedUsers: [{ user: 'x', db: almacen.BASE }], authenticatedUserRoles: [{ role: almacen.ROL, db: almacen.BASE }], authenticatedUserPrivileges: [{ resource: { db: almacen.BASE, collection: '' }, actions: [...almacen.ACCIONES] }] } } },
    { hello: { setName: 'marketingDevRs' } },
    { tls: false }
  ]) assert.throws(() => almacen.validarIdentidad(identidad(cambios)), /NO_AUTORIZADAS/);
  const conexionPrincipal = identidad().conexion;
  conexionPrincipal.readyState = 1;
  assert.throws(() => modelo.crearModeloProtegido(mongoose.connection), /NO_AUTORIZADA/);
  assert.throws(() => modelo.crearModeloProtegido({ ...conexionPrincipal, name: 'marketing_automation' }), /NO_AUTORIZADA/);
});

test('cuotas protegidas: exige índices únicos y TTL exactos y nunca los crea automáticamente', () => {
  assert.doesNotThrow(() => almacen.validarIndices(indices()));
  for (const cambiar of [
    x => x.pop(),
    x => { x[1].unique = false; },
    x => { x[1].partialFilterExpression = { empresa: { $exists: true } }; },
    x => { x[2].expireAfterSeconds = 60; },
    x => x.push({ name: 'extra', key: { otro: 1 } })
  ]) { const copia = indices(); cambiar(copia); assert.throws(() => almacen.validarIndices(copia), /NO_AUTORIZADAS/); }
});
