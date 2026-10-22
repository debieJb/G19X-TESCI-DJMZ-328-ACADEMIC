const { test } = require('node:test');
const assert = require('node:assert/strict');
const Limite = require('../models/LimiteRegistro');
const { consumir } = require('../services/limitesRecuperacionService');

test('recuperación límites: cuenta/IP/ventana persistentes, normalización externa y sin datos privados', async t => {
  const datos = new Map();
  t.mock.method(Limite.collection, 'listIndexes', () => ({ toArray: async () => [{ key: { expiraEn: 1 }, expireAfterSeconds: 0 }] }));
  t.mock.method(Limite, 'findOneAndUpdate', async (f, cambio) => {
    assert.match(f._id, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(f).includes('persona@example.test'));
    const d = datos.get(f._id) || { cantidad: 0, expiraEn: cambio.$setOnInsert?.expiraEn };
    d.cantidad++; datos.set(f._id, d); return d;
  });
  const entrada = { ip: '127.0.0.1', identificador: 'persona@example.test', ahora: 1000000 };
  for (let i = 0; i < 3; i++) await consumir(entrada);
  await assert.rejects(consumir(entrada), { codigo: 'CUENTA_LIMITADA' });
  // Otra IP no reinicia el contador de la cuenta.
  await assert.rejects(consumir({ ...entrada, ip: '127.0.0.2' }), { codigo: 'CUENTA_LIMITADA' });
  await consumir({ ...entrada, ahora: entrada.ahora + 3600000 });
  for (let i = 0; i < 26; i++) await consumir({ ...entrada, identificador: `otro${i}@example.test` });
  await assert.rejects(consumir({ ...entrada, identificador: 'nuevo@example.test' }), { codigo: 'LIMITE_RECUPERACION' });
  assert.ok([...datos.values()].every(d => d.expiraEn instanceof Date));
});

test('recuperación límites: reset tiene ventana por cuenta, no se evita variando el secreto del enlace', async t => {
  const datos = new Map();
  t.mock.method(Limite.collection, 'listIndexes', () => ({ toArray: async () => [{ key: { expiraEn: 1 }, expireAfterSeconds: 0 }] }));
  t.mock.method(Limite, 'findOneAndUpdate', async f => { const cantidad = (datos.get(f._id) || 0) + 1; datos.set(f._id, cantidad); return { cantidad }; });
  const entrada = { ip: '127.0.0.1', identificador: '507f1f77bcf86cd799439011', accion: 'restablecer', ahora: 1000000 };
  for (let i = 0; i < 10; i++) await consumir(entrada);
  await assert.rejects(consumir(entrada), { codigo: 'CUENTA_LIMITADA' });
  await consumir({ ...entrada, ahora: entrada.ahora + 900000 });
});

test('recuperación límites: índices ausentes bloquean sin DDL ni escrituras', async t => {
  t.mock.method(Limite.collection, 'listIndexes', () => ({ toArray: async () => [] }));
  const escribir = t.mock.method(Limite, 'findOneAndUpdate', () => assert.fail('No escribir'));
  await assert.rejects(consumir({ ip: 'local', identificador: 'persona@example.test' }), /INDICES_RECUPERACION_REQUERIDOS/);
  assert.equal(escribir.mock.callCount(), 0);
});
