const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { diagnosticoSeguro } = require('../scripts/iniciarWebPiloto');

test('piloto: plan de indices con modelos sin cargar en conexion global, sin conectar ni DDL', () => {
  // Proceso fresco reproduce el arranque real: otros tests no deben precargar modelos.
  const r = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict'), m = require('mongoose');
    m.set('autoCreate', false); m.set('autoIndex', false);
    const infra = require('./services/infraestructuraPilotoService');
    assert.ok(infra.MODELOS.some(n => !m.connection.models[n]));
    const primero = infra.planIndices(m.connection);
    assert.equal(primero.length, infra.MODELOS.length + 1);
    const modelos = { ...m.connection.models };
    assert.deepEqual(infra.planIndices(m.connection), primero);
    for (const n of infra.MODELOS) assert.equal(m.connection.models[n], modelos[n]);
    const aislada = m.createConnection();
    const normalizar = plan => JSON.parse(JSON.stringify(plan, (k,v) => k === '_autoIndex' ? undefined : v));
    assert.deepEqual(normalizar(infra.planIndices(aislada)), normalizar(primero));
    for (const n of infra.MODELOS) {
      assert.notEqual(aislada.models[n], modelos[n]);
      assert.equal(aislada.models[n].schema.options.autoCreate, false);
      assert.equal(aislada.models[n].schema.options.autoIndex, false);
    }
    assert.equal(m.connection.readyState, 0); assert.equal(aislada.readyState, 0);
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
});

test('piloto: diagnosticos especificos para indices, sesiones, modelos y puerto', () => {
  for (const codigo of ['INDICES_PILOTO_INCOMPLETOS', 'INDICE_SESION_REQUERIDO', 'SESSION_STORE_KEY_INVALIDA', 'SESSION_SECRET_REQUERIDO'])
    assert.ok(diagnosticoSeguro(Error(codigo), 'INDICES').endsWith(`codigo=${codigo}`));
  assert.match(diagnosticoSeguro({ name: 'OverwriteModelError' }, 'INDICES'), /MODELO_REGISTRADO_DOS_VECES$/);
  assert.match(diagnosticoSeguro({ code: 'EADDRINUSE' }, 'ESCUCHA_HTTPS'), /PUERTO_OCUPADO$/);
});

test('piloto: diagnostico no publica mensajes internos, credenciales o causas', () => {
  const r = diagnosticoSeguro({ message: 'mongodb://usuario:secreto@privado', code: 'token-privado', cause: Error('privado') }, 'CONEXION_MONGODB');
  assert.equal(r, 'PILOTO_ARRANQUE_RECHAZADO etapa=CONEXION_MONGODB codigo=CONEXION_MONGODB_RECHAZADO');
});
