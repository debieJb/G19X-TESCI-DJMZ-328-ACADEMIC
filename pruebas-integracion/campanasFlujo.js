const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const rs = require('../scripts/mongoDevRsComun');
const { png } = require('../tests/soporte/imagenPNG');
const { validar } = require('../services/imagenCampanaService');
before(async () => { const c = await rs.conectar(); try { await rs.verificar(c); await rs.compararOriginal(); } finally { await c.close(); } });
after(async () => { await rs.compararOriginal(); assert.equal(mongoose.connection.readyState, 0); });
const fixture = async t => {
  const nombre = 'ma_tx_test_' + randomUUID().replaceAll('-', ''), marca = randomUUID();
  const conexion = await mongoose.createConnection(rs.URI, { dbName: nombre, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 }).asPromise();
  t.after(async () => {
    try {
      const c = await rs.conectar(); try { await rs.verificar(c); } finally { await c.close(); }
      assert.match(conexion.name, /^ma_tx_test_[a-f0-9]{32}$/);
      assert.equal((await conexion.db.collection('control').findOne({ _id: 'fixture' }))?.marca, marca);
      await conexion.dropDatabase();
    } finally { await conexion.close(); }
  });
  await conexion.db.collection('control').insertOne({ _id: 'fixture', marca });
  const Campana = conexion.model('Campana', require('../models/Campana').schema.clone());
  await Campana.createCollection(); await Campana.createIndexes();
  return Campana;
};
const datos = empresa => ({ empresa, nombre: 'Borrador ficticio', objetivo: 'Probar flujo', canal: 'email', estado: 'borrador', versionFlujo: 2,
  asistenciaIA: { producto: 'Producto ficticio', aprobacionHash: 'a'.repeat(64) } });

test('campañas reales ficticias: índice impide aprobación duplicada y mantiene aislamiento entre empresas', async t => {
  const Campana = await fixture(t), A = new mongoose.Types.ObjectId(), B = new mongoose.Types.ObjectId();
  const resultados = await Promise.allSettled([Campana.create(datos(A)), Campana.create(datos(A))]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.code, 11000);
  await Campana.create(datos(B)); assert.equal(await Campana.countDocuments(), 2);
});

test('campañas reales ficticias: imagen y selecciones sobreviven guardado sin destinatarios o estado activo', async t => {
  const Campana = await fixture(t), empresa = new mongoose.Types.ObjectId();
  const doc = await Campana.create({ ...datos(empresa), imagenLocal: validar('data:image/png;base64,' + png().toString('base64')) });
  const lectura = await Campana.findById(doc._id).lean();
  assert.equal(lectura.imagenLocal.datos, undefined); assert.equal(lectura.asistenciaIA.aprobacionHash, undefined);
  assert.equal(lectura.destinatarios, undefined); assert.equal(lectura.estado, 'borrador');
  const privada = await Campana.findById(doc._id).select('+imagenLocal.datos').lean();
  const raw = privada.imagenLocal.datos, bytes = Buffer.isBuffer(raw) ? raw : raw.value();
  assert.deepEqual(Buffer.from(bytes), png()); assert.equal(lectura.asistenciaIA.producto, 'Producto ficticio');
});
