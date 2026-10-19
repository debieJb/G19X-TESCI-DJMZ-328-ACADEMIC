const { test } = require('node:test');
const assert = require('node:assert/strict');
const servicio = require('../services/pilotoManualGmailService');
const infra = require('../services/infraestructuraPilotoService');

const fixture = t => {
  const indices = new Map(), llamadas = [];
  const conexion = require('mongoose').createConnection();
  conexion.name = 'marketing_automation';
  const plan = infra.planIndices(conexion).filter(p => ['Campana', 'EjecucionGmail', 'EnvioGmail', 'ControlEnvioGmail', 'AutorizacionPilotoGmail'].includes(p.modelo));
  // Colección Campana preexistente, solo falta su índice de aprobación.
  indices.set('campanas', [{ key: { _id: 1 }, name: '_id_' },
    ...plan.find(p => p.modelo === 'Campana').indices.filter(i => !i.key['asistenciaIA.aprobacionHash']).map(i => ({ key: i.key, ...i.options }))]);
  conexion.db = {
    admin: () => ({ command: async () => ({ setName: 'marketingDevRs', isWritablePrimary: true, hosts: ['localhost:27018'] }) }),
    createCollection: async nombre => { llamadas.push('coleccion'); indices.set(nombre, [{ key: { _id: 1 }, name: '_id_' }]); },
    collection: nombre => ({
      findOne: async () => ({ _id: servicio.EMPRESA }),
      listIndexes: () => ({ toArray: async () => { if (!indices.has(nombre)) throw { code: 26 }; return indices.get(nombre); } }),
      aggregate: () => ({ toArray: async () => [] }),
      createIndex: async (key, options) => { llamadas.push('indice'); indices.get(nombre).push({ key, ...options }); }
    })
  };
  t.mock.method(require('../services/registroEmpresarialService'), 'validarTopologia', async () => {});
  return { conexion, llamadas, indices };
};
test('migración manual: cuatro colecciones, ocho índices verificados e idempotencia sin borrar', async t => {
  const f = fixture(t);
  assert.deepEqual(await servicio.migrar(f.conexion), { coleccionesCreadas: 4, indicesCreados: 8, indicesVerificados: true });
  assert.equal(f.llamadas.length, 12);
  assert.deepEqual(await servicio.migrar(f.conexion), { coleccionesCreadas: 0, indicesCreados: 0, indicesVerificados: true });
  assert.equal(f.llamadas.length, 12);
});
test('migración manual: destino equivocado y conflicto impiden todo DDL', async t => {
  const f = fixture(t);
  f.conexion.name = 'otra';
  await assert.rejects(servicio.migrar(f.conexion), { codigo: 'DESTINO_MANUAL_NO_COINCIDE' });
  f.conexion.name = 'marketing_automation';
  f.indices.get('campanas').push({ key: { empresa: 1, 'asistenciaIA.aprobacionHash': 1 }, unique: false });
  await assert.rejects(servicio.migrar(f.conexion), { codigo: 'INDICES_INCOMPATIBLES' });
  assert.equal(f.llamadas.length, 0);
});
test('migración manual: un createIndex sin índice real no se declara exitoso', async t => {
  const f = fixture(t), coleccion = f.conexion.db.collection;
  f.conexion.db.collection = n => ({ ...coleccion(n), createIndex: async () => {} });
  await assert.rejects(servicio.migrar(f.conexion), { codigo: 'INDICES_REQUERIDOS' });
});
test('manual: política cerrada no prepara infraestructura ni inicia consumidor', async t => {
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => ({ habilitado: true, automatico: true, empresas: [servicio.EMPRESA] }));
  assert.equal(await servicio.prepararArranque({ app: { locals: {} }, conexion: {} }), false);
});
