const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const rs = require('./mongoDevRsComun');
const manifest = path.join(rs.ROOT, 'prueba-persistencia.json');
const opciones = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000, timeoutMS: 15000 };
rs.ejecutar(async () => {
  const modo = process.argv[2];
  rs.exigir(process.argv.length === 3 && ['--crear', '--persistencia-y-limpiar'].includes(modo), 'MODO_INVALIDO');
  const client = await rs.conectar();
  try {
    await rs.verificar(client);
    await rs.compararOriginal();
    if (modo === '--persistencia-y-limpiar') {
      const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      rs.exigir(/^ma_tx_test_[a-f0-9]{32}$/.test(meta.base) && typeof meta.marca === 'string', 'BASE_NO_AUTORIZADA');
      const db = client.db(meta.base);
      assert.deepEqual(await db.collection('control').findOne({ _id: 'identidad' }), { _id: 'identidad', marca: meta.marca });
      assert.equal(await db.collection('empresas_ficticias').countDocuments(), 2);
      assert.equal(await db.collection('usuarios_ficticios').countDocuments(), 2);
      assert.equal(await db.collection('empresas_ficticias').countDocuments({ _id: { $in: ['rollback', 'duplicado'] } }), 0);
      console.log('PERSISTENCIA_TRAS_REINICIO: APROBADA');
      // Se borra exclusivamente la base creada por esta ejecución y marcada por ella.
      await rs.verificar(client);
      await db.dropDatabase();
      fs.unlinkSync(manifest);
      await rs.compararOriginal();
      console.log('LIMPIEZA_BASE_DESECHABLE: APROBADA');
      return;
    }
    rs.exigir(!fs.existsSync(manifest), 'PRUEBA_ANTERIOR_PENDIENTE');
    const base = 'ma_tx_test_' + randomUUID().replaceAll('-', '');
    const marca = randomUUID();
    const db = client.db(base);
    await db.createCollection('control');
    await db.createCollection('empresas_ficticias');
    await db.createCollection('usuarios_ficticios');
    await db.collection('control').insertOne({ _id: 'identidad', marca });
    const empresas = db.collection('empresas_ficticias');
    const usuarios = db.collection('usuarios_ficticios');
    await usuarios.createIndex({ email: 1 }, { unique: true });
    await usuarios.insertOne({ _id: 'previo', email: 'duplicado@example.test' });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await empresas.insertOne({ _id: 'commit', nombre: 'Empresa ficticia' }, { session });
        await usuarios.insertOne({ _id: 'commit', empresa: 'commit', email: 'commit@example.test' }, { session });
      }, opciones);
      assert.equal(await empresas.countDocuments({ _id: 'commit' }), 1);
      assert.equal(await usuarios.countDocuments({ _id: 'commit' }), 1);
      console.log('COMMIT_MULTIDOCUMENTO: APROBADO');

      await assert.rejects(session.withTransaction(async () => {
        await empresas.insertOne({ _id: 'rollback' }, { session });
        throw new Error('ABORTO_FICTICIO_ESPERADO');
      }, opciones), /ABORTO_FICTICIO_ESPERADO/);
      assert.equal(await empresas.countDocuments({ _id: 'rollback' }), 0);
      console.log('ROLLBACK_EXPLICITO: APROBADO');

      await assert.rejects(session.withTransaction(async () => {
        await empresas.insertOne({ _id: 'duplicado' }, { session });
        await usuarios.insertOne({ _id: 'duplicado', email: 'duplicado@example.test' }, { session });
      }, opciones), error => error.code === 11000);
      assert.equal(await empresas.countDocuments({ _id: 'duplicado' }), 0);
      assert.equal(await usuarios.countDocuments({ _id: 'previo' }), 1);
      assert.equal(await usuarios.countDocuments({ _id: 'duplicado' }), 0);
      console.log('ROLLBACK_POR_DUPLICADO: APROBADO');

      const lector = client.startSession();
      try {
        await session.withTransaction(async () => {
          await empresas.insertOne({ _id: 'aislamiento' }, { session });
          assert.equal(await empresas.countDocuments({ _id: 'aislamiento' }, { session }), 1);
          assert.equal(await empresas.countDocuments({ _id: 'aislamiento' }, { session: lector, maxTimeMS: 3000 }), 0);
        }, opciones);
        assert.equal(await empresas.countDocuments({ _id: 'aislamiento' }, { session: lector }), 1);
      } finally { await lector.endSession(); }
      console.log('AISLAMIENTO_ENTRE_SESIONES: APROBADO');
    } finally { await session.endSession(); }
    await rs.compararOriginal();
    fs.writeFileSync(manifest, JSON.stringify({ base, marca }), { flag: 'wx' });
    console.log('PERSISTENCIA: PREPARADA_PARA_REINICIO_ORDENADO');
  } finally { await client.close(); }
});
