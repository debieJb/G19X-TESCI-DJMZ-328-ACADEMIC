const net = require('node:net');
const rs = require('./mongoDevRsComun');
rs.ejecutar(async () => {
  rs.exigir(process.argv.length === 2, 'ARGUMENTOS_NO_PERMITIDOS');
  const client = await rs.conectar();
  try {
    await rs.verificar(client);
    await rs.compararOriginal();
    try { await client.db('admin').command({ shutdown: 1 }); }
    catch (error) {
      if (!['MongoNetworkError', 'MongoServerSelectionError'].includes(error.name)) throw error;
    }
  } finally { await client.close(); }
  for (let intento = 0; intento < 40; intento++) {
    const libre = await new Promise(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port: 27018 });
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(false); });
      socket.once('error', error => { socket.destroy(); resolve(error.code === 'ECONNREFUSED'); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (libre) { await rs.compararOriginal(); console.log('REPLICA_SET: APAGADO_ORDENADO'); return; }
    await rs.sleep(500);
  }
  throw new Error('APAGADO_NO_CONFIRMADO');
});
