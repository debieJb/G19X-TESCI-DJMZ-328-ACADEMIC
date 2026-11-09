'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearEntornoLocal, verificarReplicaActiva } = require('../scripts/iniciarDevLocal');

const conEnvTemporal = fn => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plurione-dev-launcher-'));
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
};

test('launcher carga .env local en copia y conserva las banderas de workers', () => conEnvTemporal(root => {
  fs.writeFileSync(path.join(root, '.env'), [
    'NODE_ENV=development', 'AI_ENABLED=true', 'AI_QUOTA_BACKEND=piloto_local',
    'PLURIONE_MONGO_DEV_ROOT=C:\\mongo-fixture',
    'MONGODB_URI=mongodb://127.0.0.1:27018/marketing_automation?replicaSet=marketingDevRs',
    'TRANSACTIONAL_WORKER_ENABLED=true', 'GMAIL_CAMPAIGNS_ENABLED=false'
  ].join('\n'));
  const source = { SENTINEL: 'kept' };
  const env = crearEntornoLocal(source, root);
  assert.equal(source.PLURIONE_MONGO_DEV_ROOT, undefined);
  assert.equal(env.SENTINEL, 'kept');
  assert.equal(env.TRANSACTIONAL_WORKER_ENABLED, 'true');
  assert.equal(env.GMAIL_CAMPAIGNS_ENABLED, 'false');
  assert.equal(env.MONGODB_URI, 'mongodb://127.0.0.1:27018/marketing_automation?replicaSet=marketingDevRs');
}));

test('launcher rechaza URI ajena y configuración Gemini incompleta', () => conEnvTemporal(root => {
  fs.writeFileSync(path.join(root, '.env'), [
    'NODE_ENV=development', 'AI_ENABLED=true', 'AI_QUOTA_BACKEND=piloto_local',
    'PLURIONE_MONGO_DEV_ROOT=C:\\mongo-fixture', 'MONGODB_URI=mongodb://127.0.0.1:27017/app'
  ].join('\n'));
  assert.throws(() => crearEntornoLocal({}, root), /MONGODB_URI_NO_AUTORIZADA/);
  fs.writeFileSync(path.join(root, '.env'), 'NODE_ENV=development\n');
  assert.throws(() => crearEntornoLocal({}, root), /CONFIGURACION_LOCAL_INCOMPLETA/);
}));

test('launcher reutiliza solo replica cuya conexión e identidad PRIMARY pasan guardias', async () => {
  let closed = false;
  const client = { close: async () => { closed = true; } };
  await verificarReplicaActiva({ conectar: async () => client, verificar: async got => assert.equal(got, client) });
  assert.equal(closed, true);
  closed = false;
  await assert.rejects(verificarReplicaActiva({ conectar: async () => client, verificar: async () => { throw Error('RS_NO_ES_PRIMARIO'); } }));
  assert.equal(closed, true);
  await assert.rejects(verificarReplicaActiva({ conectar: async () => { throw Error('CONNECTION_FAILED'); }, verificar: async () => {} }));
});
