const { test } = require('node:test');
const assert = require('node:assert/strict');
const arranque = require('../services/ia/arranqueIA');
const limites = require('../services/ia/limitesIA');
const entorno = (t, valores) => {
  for (const [k, v] of Object.entries(valores)) {
    const anterior = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v;
    t.after(() => { if (anterior === undefined) delete process.env[k]; else process.env[k] = anterior; });
  }
};
test('IA web: piloto explícito valida cuotas antes de anunciar disponibilidad sin consumir ni generar', async t => {
  entorno(t, { NODE_ENV: 'development', AI_QUOTA_BACKEND: 'piloto_local', AI_ENABLED: 'true' });
  const obtener = t.mock.fn(async empresa => { assert.equal(empresa, '6ad574f460d35245e124c9ee'); return {}; });
  t.mock.method(limites, 'seleccionarAlmacen', () => ({ obtener }));
  const consumir = t.mock.method(limites, 'consumir', () => { throw Error('NO_CONSUMIR'); });
  const fetch = t.mock.method(global, 'fetch', () => { throw Error('NO_RED'); });
  const app = { locals: {} }, estado = await arranque.preparar(app);
  assert.equal(estado.backend, 'piloto_local'); assert.equal(estado.cuotasVerificadas, true);
  assert.equal(estado.pid, process.pid); assert.equal(app.locals.iaArranque, estado);
  assert.equal(obtener.mock.callCount(), 1); assert.equal(consumir.mock.callCount(), 0); assert.equal(fetch.mock.callCount(), 0);
});
test('IA web: cuotas inválidas impiden anunciar arranque listo', async t => {
  entorno(t, { NODE_ENV: 'development', AI_QUOTA_BACKEND: 'piloto_local', AI_ENABLED: 'true' });
  t.mock.method(limites, 'seleccionarAlmacen', () => ({ obtener: async () => { throw { code: 26 }; } }));
  const app = { locals: {} };
  await assert.rejects(arranque.preparar(app), { codigo: 'CUOTAS_NO_DISPONIBLES' });
  assert.equal(app.locals.iaArranque, undefined);
});
test('IA web: estado efectivo con backend ausente identifica fixture sin exponer entorno', async t => {
  entorno(t, { NODE_ENV: 'development', AI_QUOTA_BACKEND: undefined, AI_ENABLED: 'false' });
  const r = await arranque.preparar({ locals: {} });
  assert.equal(r.backend, 'dev_fixture'); assert.equal(r.cuotasVerificadas, false);
  assert.deepEqual(Object.keys(r).sort(), ['backend', 'cuotasVerificadas', 'entorno', 'pid']);
});
