// Exclusivo del runner node:test; nunca utilizado por el arranque operativo.
const principal = async () => {
  const [base, marca, modo] = process.argv.slice(2);
  if (!process.env.NODE_TEST_CONTEXT || !/^ma_tx_test_[a-f0-9]{32}$/.test(base || '') || !/^[a-f0-9-]{36}$/.test(marca || '')) throw Error('FIXTURE_REQUERIDA');
  global.fetch = () => { throw Error('GOOGLE_PROHIBIDO'); };
  const rs = require('../../scripts/mongoDevRsComun'), m = require('mongoose');
  const c = await rs.conectar();try { await rs.verificar(c); } finally { await c.close(); }
  const conexion = await m.createConnection(rs.URI, { dbName: base, autoCreate: false, autoIndex: false }).asPromise();
  const cancelar = new AbortController();
  process.on('message', mensaje => { if (mensaje === 'detener') cancelar.abort(); });
  try {
    if ((await conexion.db.collection('control').findOne({ _id: 'fixture' }))?.marca !== marca) throw Error('FIXTURE_NO_PROPIA');
    if (modo === 'fallar') { process.exitCode = 1;return; }
    const correo = require('../../services/correoTransaccionalService').crearCorreoTransaccional({ autorizado: true, simulado: true,
      remitente: 'plataforma@example.test', origenPublico: 'https://plataforma.example.test', transporte: {
        enviar: async () => ({ aceptado: true, mensajeId: 'id-hijo-simulado' })
      } });
    await require('../../services/trabajadorVerificacionService').ejecutar({ conexion, correo, signal: cancelar.signal,
      informar: codigo => { if (codigo === 'CORREO_ACEPTADO_PROVEEDOR') { process.send('aceptado');cancelar.abort(); } } });
  } finally { await conexion.close();if (process.connected) process.disconnect(); }
};
if (require.main === module) principal().catch(() => { process.exitCode = 1;if (process.connected) process.disconnect(); });
