const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: String }, dia: String, usadosDia: { type: Number, default: 0 },
  hora: String, usadosHora: { type: Number, default: 0 },
  siguienteEn: Date, envio: mongoose.Schema.Types.ObjectId,
  reservaHash: { type: String, select: false }, reservaHasta: Date
}, { autoCreate: false, autoIndex: false, strict: 'throw' });
module.exports = mongoose.model('ControlEnvioGmail', schema);
