const { test } = require('node:test');
const assert = require('node:assert/strict');
const almacen = require('../services/ia/almacenCuotasDev');
const limites = require('../services/ia/limitesIA');
const fixture = t => {
  const cantidades = new Map();
  const Uso = { findOneAndUpdate: async (filtro, update, options) => {
    assert.equal(options.upsert, true); assert.equal(update.$inc.cantidad, 1);
    const key = `${filtro.empresa}:${filtro.ventana}`, actual = cantidades.get(key) || 0;
    if (actual >= filtro.cantidad.$lt) throw Object.assign(new Error('Duplicado'), { code: 11000 });
    cantidades.set(key, actual + 1); return {};
  } };
  t.mock.method(almacen, 'obtener', async () => Uso);
  return cantidades;
};
test('IA cuotas: tres intentos por minuto, persistidos por empresa', async t => {
  fixture(t); const ahora = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 3; i++) await limites.consumir('empresa-a', ahora);
  await assert.rejects(limites.consumir('empresa-a', ahora), e => e.status === 429);
  await limites.consumir('empresa-b', ahora); await limites.consumir('empresa-a', ahora + 60000);
});
test('IA cuotas: límite diario independiente de nuevas sesiones o ventanas por minuto', async t => {
  fixture(t); const ahora = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 20; i++) await limites.consumir('empresa-a', ahora + i * 60000);
  await assert.rejects(limites.consumir('empresa-a', ahora + 21 * 60000), e => e.status === 429);
  await limites.consumir('empresa-a', ahora + 86400000);
});
test('IA cuotas: fallo de índices impide consumir y falla cerrado', async t => {
  t.mock.method(almacen, 'obtener', async () => { throw new Error('INTERNO'); });
  await assert.rejects(limites.consumir('empresa-a'), e => e.status === 503 && !e.message.includes('INTERNO'));
});
test('IA cuotas: sin índice único no puede eludirse el límite mediante upsert', async t => {
  const consumir = t.mock.fn(async () => {});
  t.mock.method(almacen, 'obtener', async () => { almacen.validarIndices([]); return { findOneAndUpdate: consumir }; });
  await assert.rejects(limites.consumir('empresa-a'), e => e.status === 503);
  assert.equal(consumir.mock.callCount(), 0);
});
test('IA cuotas: concurrencia global máxima dos y liberación explícita', () => {
  const uno = limites.reservar('empresa-a'), dos = limites.reservar('empresa-b');
  try { assert.throws(() => limites.reservar('empresa-c'), e => e.status === 429); assert.throws(() => limites.reservar('empresa-a'), e => e.status === 429); }
  finally { uno(); dos(); }
  limites.reservar('empresa-c')();
});
