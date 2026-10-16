// Arranque futuro sujeto a manifiesto aprobado. No carga archivos de entorno ni crea indices.
const mongoose = require('mongoose');
const infra = require('../services/infraestructuraPilotoService');
const principal = async () => {
  infra.asegurarEnvioApagado();
  const manifiesto = require('../config/manifiestoPiloto').cargarManifiesto();
  const uri = process.env.MONGODB_URI, secret = process.env.SESSION_SECRET;
  const codificada = process.env.SESSION_STORE_KEY;
  if (!uri || typeof secret !== 'string' || Buffer.byteLength(secret) < 32
    || typeof codificada !== 'string' || !/^[a-f0-9]{64}$/i.test(codificada)) throw Error('CONFIGURACION_REQUERIDA');
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
  await mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    const app = await require('../services/aplicacionPilotoService').crearAplicacionPiloto({ conexion: mongoose.connection,
      manifiesto, secret, claveStore: Buffer.from(codificada, 'hex') });
    const server = await new Promise((resolve, reject) => {
      const s = app.listen(manifiesto.puerto, manifiesto.host, () => resolve(s)); s.once('error', reject);
    });
    let cerrando = false;
    const cerrar = () => { if (cerrando) return; cerrando = true;
      const plazo = setTimeout(() => { server.closeAllConnections(); }, 10000);
      server.close(() => { clearTimeout(plazo); mongoose.disconnect().catch(() => { process.exitCode = 1; }); });
    };
    process.once('SIGINT', cerrar); process.once('SIGTERM', cerrar);
    console.log('Web de preparacion iniciada; envio Gmail deshabilitado. TLS externo pendiente de validacion.');
  } catch (e) { await mongoose.disconnect(); throw e; }
};
if (require.main === module) principal().catch(() => { console.error('Arranque bloqueado: comprobar manifiesto, destino, indices y sesiones.'); process.exitCode = 1; });
module.exports = { principal };
