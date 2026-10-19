const mongoose = require('mongoose');
const worker = require('../services/trabajadorVerificacionService');
const principal = async (args = process.argv.slice(2)) => {
  if (args.length === 1 && args[0] === '--comprobar') return { estado: 'sin_envios' };
  worker.validarActivacion(process.env, args);
  const cancelar = new AbortController(), parar = () => cancelar.abort();
  const mensaje = valor => { if (valor === 'detener') parar(); };
  process.once('SIGINT', parar); process.once('SIGTERM', parar);
  process.once('disconnect', parar); process.on('message', mensaje);
  let conexion;
  try {
    const manifiesto = require('../config/manifiestoPiloto').cargarManifiesto();
    const opciones = worker.configuracion();
    const correo = require('../services/smtpTransaccionalService').crearCorreo(); // No conecta SMTP hasta despachar.
    if (process.env.PILOT_LOCAL_HTTPS === 'true') {
      const tls = require('../services/httpsPilotoLocalService');
      if (process.env.TRANSACTIONAL_PUBLIC_ORIGIN !== tls.ORIGEN) throw Error('ORIGEN_LOCAL_NO_COINCIDE');
      await tls.comprobarOrigen(tls.configuracion(process.env, manifiesto));
    }
    conexion = await mongoose.createConnection(process.env.MONGODB_URI,
      { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 15000 }).asPromise();
    const infra = require('../services/infraestructuraPilotoService');
    await infra.validarDestinoPiloto(conexion, manifiesto);
    if (!(await infra.revisarIndices(conexion)).completos) throw Error('INDICES_REQUERIDOS');
    return await worker.ejecutar({ conexion, correo, signal: cancelar.signal, ...opciones,
      informar: codigo => { if (codigo !== 'COLA_EN_ESPERA') console.log(codigo); } });
  } finally {
    process.removeListener('SIGINT', parar); process.removeListener('SIGTERM', parar);
    process.removeListener('disconnect', parar); process.removeListener('message', mensaje);
    if (conexion) await conexion.close();
    if (process.connected) process.disconnect();
  }
};
if (require.main === module) principal().then(r => console.log(JSON.stringify(r))).catch(e => {
  const bloqueado = ['REAUTORIZAR_TRANSACCIONAL', 'CONFIGURACION_TRANSACCIONAL', 'CREDENCIAL_TRANSACCIONAL_INVALIDA',
    'CONFIGURACION_SMTP', 'ORIGEN_SMTP_INVALIDO', 'ACTIVACION_TRANSACCIONAL_REQUERIDA', 'INDICES_REQUERIDOS', 'DESTINO_PILOTO_NO_COINCIDE',
    'ORIGEN_LOCAL_NO_COINCIDE', 'LIMITES_TRABAJADOR_INVALIDOS', 'TRANSPORTE_NO_CONFIGURADO'].includes(e.codigo || e.message);
  console.error(bloqueado ? 'TRABAJADOR_BLOQUEADO_CONFIGURACION_O_AUTORIZACION' : 'TRABAJADOR_INTERRUMPIDO_ESTADO_PERSISTIDO');
  process.exitCode = bloqueado ? 78 : 1;
  if (process.connected) process.disconnect();
});
module.exports = { principal };
