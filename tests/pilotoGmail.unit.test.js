const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { seleccionUnica } = require('../services/autorizacionPilotoGmailService');
const consentimiento = require('../services/consentimientoContactoService');
const { migrarIndicesDedicados, validarDestinoMigracion } = require('../services/migracionIndicesPilotoService');
const infra = require('../services/infraestructuraPilotoService');
const manifiesto = () => ({ aprobado: true, base: 'piloto_dedicado', replicaSet: 'pilotoDedicadoRs',
  miembros: ['127.0.0.1:27019'], trustProxy: [], host: '127.0.0.1', puerto: 3100 });
test('piloto: seleccion estrictamente unitaria; duplicados tambien se rechazan', () => {
  const a = new mongoose.Types.ObjectId();
  assert.equal(seleccionUnica({ destinatarios: { tipo: 'contactos', contactos: [a] } }), String(a));
  for (const d of [{ tipo: 'todos' }, { tipo: 'etiquetas', etiquetas: ['x'] }, { tipo: 'contactos', contactos: [] },
    { tipo: 'contactos', contactos: [a, a] }, { tipo: 'contactos', contactos: [a], etiquetas: ['x'] }]) assert.throws(() => seleccionUnica({ destinatarios: d }));
});
test('consentimiento: fecha con zona, evidencia y confirmacion explicitas', () => {
  const entrada = { accionConsentimiento: 'otorgar', fechaConsentimiento: '2020-01-01T12:00:00Z', fuenteConsentimiento: 'Acta sintetica', confirmarConsentimiento: 'true' };
  assert.equal(consentimiento.validarCambio(entrada).accion, 'otorgar');
  for (const c of [{ fechaConsentimiento: '2020' }, { fuenteConsentimiento: ' ' }, { fuenteConsentimiento: 'x\ny' },
    { confirmarConsentimiento: false }, { fechaConsentimiento: '2999-01-01T12:00:00Z' }]) assert.throws(() => consentimiento.validarCambio({ ...entrada, ...c }));
});
// Adaptador Mongo en memoria: verifica algoritmo DDL sin ejecutar migracion en 27018.
const mongoSimulado = () => {
  const c = mongoose.createConnection(), tablas = new Map(); let escrituras = 0;
  const tabla = n => {
    const exigir = () => { if (!tablas.has(n)) throw Object.assign(Error('AUSENTE'), { code: 26 }); return tablas.get(n); };
    return { collectionName: n,
      countDocuments: async () => tablas.get(n)?.docs || 0,
      listIndexes: () => ({ toArray: async () => exigir().indices }),
      createIndex: async (key, options) => { escrituras++; exigir().indices.push({ key, ...options }); },
      updateOne: async () => { if (!tablas.has(n)) tablas.set(n, { docs: 1, indices: [{ key: { _id: 1 } }] }); }
    };
  };
  c.name = 'piloto_dedicado';
  c.db = { admin: () => ({ command: async cmd => cmd.hello ? { setName: 'pilotoDedicadoRs', hosts: ['127.0.0.1:27019'], me: '127.0.0.1:27019',
    isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 25 }
    : { parsed: { net: { port: 27019 }, replication: { replSet: 'pilotoDedicadoRs' } } } }),
    collection: tabla, listCollections: () => ({ toArray: async () => [...tablas.keys()].map(name => ({ name })) }),
    createCollection: async n => { escrituras++; tablas.set(n, { docs: 0, indices: [{ key: { _id: 1 } }] }); }
  };
  Object.defineProperty(c, 'readyState', { value: 1 });
  return { c, tablas, escrituras: () => escrituras };
};
test('migracion simulada: explicita, idempotente y sin borrar indices', async () => {
  const f = mongoSimulado(), m = manifiesto();
  await assert.rejects(migrarIndicesDedicados({ conexion: f.c, manifiesto: m }), /CONFIRMACION/); assert.equal(f.escrituras(), 0);
  const args = { conexion: f.c, manifiesto: m, confirmarBase: m.base };
  assert.ok((await migrarIndicesDedicados(args)).completos); const antes = f.escrituras();
  assert.ok((await migrarIndicesDedicados(args)).completos); assert.equal(f.escrituras(), antes);
});
test('migracion simulada: datos o indice incompatible bloquean todo DDL', async () => {
  for (const tipo of ['datos', 'indice']) {
    const f = mongoSimulado(), p = infra.planIndices(f.c).find(p => p.indices.length);
    f.tablas.set(p.coleccion, { docs: tipo === 'datos' ? 1 : 0,
      indices: tipo === 'indice' ? [{ key: p.indices[0].key, unique: !p.indices[0].options.unique }] : [] });
    await assert.rejects(migrarIndicesDedicados({ conexion: f.c, manifiesto: manifiesto(), confirmarBase: f.c.name })); assert.equal(f.escrituras(), 0);
  }
});
test('migracion: puertos principal y pruebas son rechazados antes de conectar', async () => {
  for (const puerto of [27017, 27018]) await assert.rejects(validarDestinoMigracion({}, { ...manifiesto(), miembros: [`db.example.invalid:${puerto}`] }), /PUERTO/);
  await assert.rejects(validarDestinoMigracion({}, { ...manifiesto(), replicaSet: 'marketingDevRs' }), /REPLICA_SET/);
});
