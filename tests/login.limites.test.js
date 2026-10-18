const { test } = require('node:test');
const assert = require('node:assert/strict');
const Limite = require('../models/LimiteRegistro');
const { consumir } = require('../services/loginLimitesService');
test('login: contadores persistentes por correo/IP, sin datos personales ni dependencia de TTL', async t => {
  const docs = new Map();
  t.mock.method(Limite.collection, 'listIndexes', () => ({ toArray: async () => [{ key: { expiraEn: 1 }, expireAfterSeconds: 0 }] }));
  t.mock.method(Limite, 'findOneAndUpdate', async (filtro, cambio) => {
    assert.match(filtro._id, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(filtro).includes('persona'));
    const doc = { cantidad: (docs.get(filtro._id)?.cantidad || 0) + 1, expiraEn: cambio.$setOnInsert.expiraEn };
    docs.set(filtro._id, doc); return doc;
  });
  const entrada = { ip: '127.0.0.1', email: 'persona@example.test', ahora: 1000000 };
  for (let i = 0; i < 10; i++) await consumir(entrada);
  await assert.rejects(consumir(entrada), { codigo: 'LIMITE_LOGIN' });
  await consumir({ ...entrada, email: 'otra@example.test' });
  await consumir({ ...entrada, ahora: entrada.ahora + 15 * 60000 });
  assert.ok([...docs.values()].every(d => d.expiraEn instanceof Date));
});
test('login: falta de índices o backend falla cerrado y no hace DDL', async t => {
  let escrituras = 0;
  t.mock.method(Limite.collection, 'listIndexes', () => ({ toArray: async () => [] }));
  t.mock.method(Limite, 'findOneAndUpdate', () => { escrituras++; });
  await assert.rejects(consumir({ ip: 'local', email: 'persona@example.test' }), /INDICES_LOGIN_REQUERIDOS/);
  assert.equal(escrituras, 0);
});
