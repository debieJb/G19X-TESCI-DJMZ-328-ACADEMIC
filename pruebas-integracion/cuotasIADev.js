// Integración real explícita, sin .env ni proveedor IA; solo marketingDevRs:27018.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const rs = require('../scripts/mongoDevRsComun');
const almacen = require('../services/ia/almacenCuotasDev');
const limites = require('../services/ia/limitesIA');
const { crearModelo } = require('../models/UsoIA');
process.env.NODE_ENV = 'test';
before(async () => { await rs.compararOriginal(); const c = await rs.conectar(); try { await rs.verificar(c); } finally { await c.close(); } });
after(async () => { await almacen.cerrar(); await rs.compararOriginal(); assert.equal(mongoose.connection.readyState, 0); });
const fixture = async t => {
  const f = await almacen.aprovisionar();
  const previos = { AI_QUOTA_DEV_DB: process.env.AI_QUOTA_DEV_DB, AI_QUOTA_DEV_MARKER: process.env.AI_QUOTA_DEV_MARKER };
  process.env.AI_QUOTA_DEV_DB = f.base; process.env.AI_QUOTA_DEV_MARKER = f.marca;
  t.after(async () => {
    await almacen.cerrar();
    const c = await almacen.conectar(f);
    try {
      await almacen.marcador(c, f);
      await c.dropDatabase(); // Solo la base nueva identificada y marcada de esta prueba.
    } finally {
      await c.close();
      for (const [k, v] of Object.entries(previos)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
  const ahora = Date.UTC(2030, 0, 1, 12); // Evita limpieza TTL durante la prueba.
  return { ...f, ahora };
};

test('cuotas reales: colección e índices explícitos, conexión independiente y aislamiento entre fixtures', async t => {
  const f = await fixture(t), [A, B] = f.empresas;
  const Uso = await almacen.obtener(A);
  assert.notEqual(Uso.db, mongoose.connection); assert.equal(Uso.db.name, f.base);
  assert.equal(mongoose.connection.readyState, 0); assert.equal(mongoose.connection.models.UsoIA, undefined);
  assert.equal(Uso.schema.options.autoCreate, false); assert.equal(Uso.schema.options.autoIndex, false);
  for (let i = 0; i < 3; i++) await limites.consumir(A, f.ahora);
  await assert.rejects(limites.consumir(A, f.ahora), { codigo: 'LIMITE' });
  await limites.consumir(B, f.ahora);
  assert.equal((await Uso.findOne({ empresa: A, ventana: `minuto:${Math.floor(f.ahora / 60000)}` }).lean()).cantidad, 3);
  assert.equal((await Uso.findOne({ empresa: B, ventana: `minuto:${Math.floor(f.ahora / 60000)}` }).lean()).cantidad, 1);
  const control = await almacen.marcador(Uso.db, f);
  assert.deepEqual(control.empresas, f.empresas);
  await assert.rejects(limites.consumir('507f1f77bcf86cd799439011', f.ahora), { codigo: 'PROVEEDOR' });
  await assert.rejects(limites.consumir('f17e1a' + '0'.repeat(18), f.ahora), { codigo: 'PROVEEDOR' });
});

test('cuotas reales: veinte solicitudes diarias persisten y la siguiente ventana no elude el máximo', async t => {
  const f = await fixture(t), A = f.empresas[0];
  for (let i = 0; i < 20; i++) await limites.consumir(A, f.ahora + i * 60000);
  await assert.rejects(limites.consumir(A, f.ahora + 21 * 60000), { codigo: 'LIMITE' });
  await almacen.cerrar();
  await assert.rejects(limites.consumir(A, f.ahora + 22 * 60000), { codigo: 'LIMITE' });
  await limites.consumir(A, f.ahora + 86400000);
});

test('cuotas reales: concurrencia de upserts nunca excede tres ni crea contadores duplicados', async t => {
  const f = await fixture(t), A = f.empresas[0];
  const r = await Promise.allSettled(Array.from({ length: 12 }, () => limites.consumir(A, f.ahora)));
  const aceptadas = r.filter(x => x.status === 'fulfilled').length;
  assert.ok(aceptadas >= 1 && aceptadas <= 3);
  for (const x of r.filter(x => x.status === 'rejected')) assert.equal(x.reason.codigo, 'LIMITE');
  const Uso = await almacen.obtener(A);
  const docs = await Uso.find({ empresa: A }).lean();
  assert.equal(docs.length, 2); assert.ok(docs.every(d => d.cantidad <= 3));
  assert.equal(await Uso.countDocuments({ empresa: A, ventana: `minuto:${Math.floor(f.ahora / 60000)}` }), 1);
});

for (const indice of ['empresa_1_ventana_1', 'expiraEn_1']) {
  test(`cuotas reales: falta ${indice}, rechaza y no repara índices ni escribe contadores`, async t => {
    const f = await fixture(t), Uso = await almacen.obtener(f.empresas[0]);
    await Uso.collection.dropIndex(indice); // Solo fixture propia desechable, nunca standalone.
    await assert.rejects(limites.consumir(f.empresas[0], f.ahora), { codigo: 'PROVEEDOR' });
    assert.equal(await Uso.countDocuments(), 0);
    assert.ok(!(await Uso.collection.listIndexes().toArray()).some(i => i.name === indice));
  });
}

test('cuotas reales: colección ausente no se recrea automáticamente', async t => {
  const f = await fixture(t), Uso = await almacen.obtener(f.empresas[0]);
  await Uso.collection.drop();
  await assert.rejects(limites.consumir(f.empresas[0], f.ahora), { codigo: 'PROVEEDOR' });
  assert.equal((await Uso.db.db.listCollections({ name: 'usoias' }).toArray()).length, 0);
});

test('cuotas reales: marcador o base manipulados impiden consumo sin fallback a conexión principal', async t => {
  const f = await fixture(t), c = await almacen.conectar(f);
  try {
    const falso = { ...f, marca: '00000000-0000-0000-0000-000000000000' };
    await assert.rejects(almacen.marcador(c, falso), /NO_AUTORIZADAS/);
    process.env.AI_QUOTA_DEV_MARKER = falso.marca;
    await assert.rejects(limites.consumir(f.empresas[0], f.ahora), { codigo: 'PROVEEDOR' });
    process.env.AI_QUOTA_DEV_MARKER = f.marca;
    await almacen.cerrar();
    const Uso = crearModelo(c); assert.equal(await Uso.countDocuments(), 0);
    process.env.AI_QUOTA_DEV_DB = 'marketing_automation';
    await assert.rejects(limites.consumir(f.empresas[0], f.ahora), { codigo: 'PROVEEDOR' });
    assert.equal(mongoose.connection.readyState, 0);
  } finally { await c.close(); process.env.AI_QUOTA_DEV_DB = f.base; process.env.AI_QUOTA_DEV_MARKER = f.marca; }
});

test('cuotas reales: desconexión y nuevo proceso conservan el límite; no dependen de memoria del servidor', async t => {
  const f = await fixture(t), A = f.empresas[0];
  for (let i = 0; i < 3; i++) await limites.consumir(A, f.ahora);
  await almacen.cerrar();
  const codigo = `const a=require('./services/ia/almacenCuotasDev'), l=require('./services/ia/limitesIA');
    l.consumir(process.argv[1],Number(process.argv[2])).then(()=>{process.exitCode=1;},e=>{
      if(e.codigo==='LIMITE')console.log('LIMITE_PERSISTENTE');else process.exitCode=1;
    }).finally(()=>a.cerrar());`;
  const hijo = spawnSync(process.execPath, ['-e', codigo, A, String(f.ahora)], { cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
    env: { NODE_ENV: 'test', AI_QUOTA_DEV_DB: f.base, AI_QUOTA_DEV_MARKER: f.marca, SystemRoot: process.env.SystemRoot } });
  assert.equal(hijo.status, 0); assert.equal(hijo.stdout.trim(), 'LIMITE_PERSISTENTE');
  await assert.rejects(limites.consumir(A, f.ahora), { codigo: 'LIMITE' });
});
