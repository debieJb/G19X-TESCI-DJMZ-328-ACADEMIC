const fs = require('node:fs');
const path = require('node:path');
const rs = require('./mongoDevRsComun');
rs.ejecutar(async () => {
  const modo = process.argv[2];
  rs.exigir(process.argv.length === 3 && ['--capturar-original', '--comparar-original', '--inicializar', '--verificar'].includes(modo), 'MODO_INVALIDO');
  if (modo === '--comparar-original') { await rs.compararOriginal(); return; }
  if (modo === '--capturar-original') {
    rs.rutasSeguras();
    fs.writeFileSync(path.join(rs.ROOT, 'original-baseline.json'), JSON.stringify(await rs.original()), { flag: 'wx' });
    console.log('STANDALONE_ORIGINAL: REFERENCIA_GUARDADA');
    return;
  }
  const client = await rs.esperar();
  try {
    if (modo === '--inicializar') {
      try { await client.db('admin').command({ replSetGetConfig: 1 }); }
      catch (error) {
        if (error.code !== 94) throw error;
        await client.db('admin').command({ replSetInitiate: { _id: rs.SET, members: [{ _id: 0, host: 'localhost:27018' }] } });
        console.log('RS: INICIALIZADO_POR_PRIMERA_VEZ');
      }
    }
    for (let intento = 0; ; intento++) {
      try { await rs.verificar(client); break; }
      catch (error) { if (error.message !== 'RS_NO_ES_PRIMARIO' || intento >= 60) throw error; await rs.sleep(500); }
    }
    await rs.compararOriginal();
    console.log('REPLICA_SET: marketingDevRs; PUERTO: 27018; ESTADO: PRIMARY; MIEMBROS: 1');
  } finally { await client.close(); }
});
