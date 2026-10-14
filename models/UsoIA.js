const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true },
  ventana: { type: String, required: true, match: /^(minuto|dia):\d+$/ },
  cantidad: { type: Number, required: true, min: 0 },
  expiraEn: { type: Date, required: true }
}, { autoCreate: false, autoIndex: false, bufferCommands: false });
schema.index({ empresa: 1, ventana: 1 }, { unique: true });
schema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });
// No registrar nunca este modelo en la conexión empresarial predeterminada.
const crearModelo = conexion => {
  if (!conexion || conexion === mongoose.connection || conexion.readyState !== 1
    || !/^ma_ia_test_[a-f0-9]{32}$/.test(conexion.name)) throw new Error('CUOTAS_CONEXION_NO_AUTORIZADA');
  const opciones = conexion.getClient().options;
  if (opciones.hosts.length !== 1 || opciones.hosts[0].host !== '127.0.0.1'
    || opciones.hosts[0].port !== 27018 || opciones.replicaSet !== 'marketingDevRs') throw new Error('CUOTAS_CONEXION_NO_AUTORIZADA');
  return conexion.models.UsoIA || conexion.model('UsoIA', schema.clone(), 'usoias');
};
module.exports = { schema, crearModelo };
