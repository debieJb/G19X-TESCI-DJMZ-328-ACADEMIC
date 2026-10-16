const { test } = require('node:test');
const assert = require('node:assert/strict');
const infra = require('../services/infraestructuraPilotoService');
const { crearSupervisor } = require('../services/supervisorTrabajadorGmailService');
const base = () => ({ aprobado: true, base: 'piloto_aislado', replicaSet: 'pilotoRs', miembros: ['db.example.invalid:27019'], trustProxy: [], host: '127.0.0.1', puerto: 3100 });
test('infra: manifiesto explicito; ejemplo pendiente rechazado', () => {
  assert.doesNotThrow(() => infra.validarManifiesto(base()));
  assert.throws(() => infra.validarManifiesto(require('../infra/piloto.example.json')));
});
test('infra: rechaza principal, replica set temporal y bases reservadas', () => {
  for (const cambio of [{ replicaSet: 'marketingDevRs' }, { miembros: ['127.0.0.1:27017'] }, { miembros: ['localhost:27018'] },
    { base: 'admin' }, { base: 'ma_tx_test_' + 'a'.repeat(32) }, { trustProxy: true }, { host: '0.0.0.0' }]) {
    assert.throws(() => infra.validarManifiesto({ ...base(), ...cambio }));
  }
});
test('infra: supervisor arranca proceso real en comprobacion, sin DB ni correo', async () => {
  infra.asegurarEnvioApagado();
  const s = crearSupervisor(), pendiente = s.ejecutar();
  await assert.rejects(s.ejecutar(), /TRABAJADOR_YA_ACTIVO/);
  const r = await pendiente;
  assert.equal(r.estado, 'comprobacion_sin_envios'); assert.equal(r.codigo, 0);
  assert.ok(r.pid > 0); assert.equal(r.reinicios, 0);
});
test('infra: supervisor bloquea trabajo real, cancela y no reinicia al agotar plazo', async () => {
  const s = crearSupervisor();
  await assert.rejects(s.ejecutar({ comprobar: false, envioId: 'a'.repeat(24) }), /BLOQUEADA/);
  const c = new AbortController(); c.abort();
  assert.equal((await s.ejecutar({ signal: c.signal })).estado, 'cancelado_antes_del_arranque');
  const r = await s.ejecutar({ timeoutMs: 1 });
  assert.equal(r.estado, 'plazo_agotado_resultado_por_conciliar'); assert.equal(r.reinicios, 0);
});
test('sesiones: fallo de almacenamiento no entrega detalles internos', async () => {
  const { MongoSessionStore } = require('../services/mongoSessionStore');
  const store = new MongoSessionStore({ coleccion: { findOne: async () => { throw Error('diagnostico interno'); } }, clave: require('node:crypto').randomBytes(32), ambito: 'sintetico' });
  await assert.rejects(new Promise((resolve, reject) => store.get('sid-sintetico', (e, r) => e ? reject(e) : resolve(r))), { message: 'ALMACEN_SESION_NO_DISPONIBLE' });
});
test('supervisor: ID_ENVIO obligatorio; parametro anterior no identifica destinatario', async t => {
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => ({ habilitado: true }));
  const s = crearSupervisor();
  await assert.rejects(s.ejecutar({ comprobar: false, ejecucion: 'a'.repeat(24) }), /EJECUCION_BLOQUEADA/);
  await assert.rejects(s.ejecutar({ comprobar: false, envioId: 'invalido' }), /EJECUCION_BLOQUEADA/);
});
