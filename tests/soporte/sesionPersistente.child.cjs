// Solo IPC de fixtures efimeras; no argumentos con claves, no archivos ni salida de datos.
if (!process.env.NODE_TEST_CONTEXT || !process.send) process.exit(1);
process.once('message', async entrada => {
  let c;
  try {
    const rs = require('../../scripts/mongoDevRsComun');
    if (!/^ma_tx_test_[a-f0-9]{32}$/.test(entrada.base)) throw Error('BASE');
    c = await rs.conectar(); await rs.verificar(c);
    const db = c.db(entrada.base);
    if ((await db.collection('control').findOne({ _id: 'fixture' }))?.marca !== entrada.marca) throw Error('FIXTURE');
    const { MongoSessionStore, COLECCION } = require('../../services/mongoSessionStore');
    const store = new MongoSessionStore({ coleccion: db.collection(COLECCION), clave: Buffer.from(entrada.clave, 'base64'), ambito: entrada.base });
    const encontrado = await new Promise((resolve, reject) => store.get(entrada.sid, (e, r) => e ? reject(e) : resolve(r)));
    process.send({ encontrada: encontrado?.prueba === 'sintetica' });
  } catch { process.send({ encontrada: false }); process.exitCode = 1; }
  finally { if (c) await c.close(); process.disconnect(); }
});
