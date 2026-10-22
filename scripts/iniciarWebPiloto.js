// Arranque futuro sujeto a manifiesto aprobado. No carga archivos de entorno ni crea indices.
const mongoose = require('mongoose');
const infra = require('../services/infraestructuraPilotoService');
const diagnosticoSeguro = (error, etapa) => {
  // Lista cerrada: nunca publicar mensajes, URI, configuraciones ni causas originales.
  const codigos = ['MANIFIESTO_INVALIDO', 'MANIFIESTO_NO_APROBADO', 'DESTINO_PILOTO_NO_COINCIDE',
    'INDICES_PILOTO_INCOMPLETOS', 'INDICE_SESION_REQUERIDO', 'ALMACEN_SESION_INVALIDO',
    'PREPARACION_REQUIERE_ENVIO_APAGADO', 'SESSION_SECRET_REQUERIDO', 'SESSION_STORE_KEY_INVALIDA', 'MONGODB_URI_REQUERIDA'];
  const codigo = codigos.includes(error?.message) ? error.message
    : error?.name === 'OverwriteModelError' ? 'MODELO_REGISTRADO_DOS_VECES'
      : error?.name === 'MongoServerSelectionError' ? 'MONGODB_NO_DISPONIBLE'
        : error?.code === 'EADDRINUSE' ? 'PUERTO_OCUPADO' : `${etapa}_RECHAZADO`;
  return `PILOTO_ARRANQUE_RECHAZADO etapa=${etapa} codigo=${codigo}`;
};
const principal = async () => {
  let etapa = 'POLITICA';
  try {
  infra.asegurarEnvioApagado();
  etapa = 'MANIFIESTO';
  const manifiesto = require('../config/manifiestoPiloto').cargarManifiesto();
  etapa = 'HTTPS';
  const local = process.env.PILOT_LOCAL_HTTPS === 'true'
    ? require('../services/httpsPilotoLocalService').configuracion(process.env, manifiesto) : null;
  const uri = process.env.MONGODB_URI, secret = process.env.SESSION_SECRET;
  const codificada = process.env.SESSION_STORE_KEY;
  etapa = 'CONFIGURACION_SESIONES';
  if (!uri) throw Error('MONGODB_URI_REQUERIDA');
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Error('SESSION_SECRET_REQUERIDO');
  if (typeof codificada !== 'string' || !/^[a-f0-9]{64}$/i.test(codificada)) throw Error('SESSION_STORE_KEY_INVALIDA');
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
  etapa = 'CONEXION_MONGODB';
  await mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    const app = await require('../services/aplicacionPilotoService').crearAplicacionPiloto({ conexion: mongoose.connection,
      manifiesto, secret, claveStore: Buffer.from(codificada, 'hex'), diagnostico: valor => { etapa = valor; } });
    etapa = 'ESCUCHA_HTTPS';
    const server = await new Promise((resolve, reject) => {
      const s = local ? require('../services/httpsPilotoLocalService').crearServidor(app, local) : require('node:http').createServer(app);
      s.once('error', reject); s.listen(manifiesto.puerto, manifiesto.host, () => resolve(s));
    });
    let cerrando = false;
    const cerrar = () => { if (cerrando) return; cerrando = true;
      const plazo = setTimeout(() => { server.closeAllConnections(); }, 10000);
      server.close(() => { clearTimeout(plazo); mongoose.disconnect().catch(() => { process.exitCode = 1; }); });
    };
    process.once('SIGINT', cerrar); process.once('SIGTERM', cerrar);
    console.log(local ? 'Web local HTTPS iniciada en https://localhost:3100; proveedores apagados.'
      : 'Web de preparacion iniciada; envio Gmail deshabilitado. TLS externo pendiente de validacion.');
  } catch (e) { await mongoose.disconnect(); throw e; }
  } catch (e) {
    const seguro = new Error(diagnosticoSeguro(e, etapa));
    seguro.diagnosticoPiloto = true;
    throw seguro;
  }
};
if (require.main === module) principal().catch(e => { console.error(e.diagnosticoPiloto ? e.message : 'PILOTO_ARRANQUE_RECHAZADO codigo=ERROR_INTERNO'); process.exitCode = 1; });
module.exports = { principal, diagnosticoSeguro };
