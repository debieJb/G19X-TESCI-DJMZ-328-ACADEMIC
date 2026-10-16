const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  solicitud: { type: mongoose.Schema.Types.ObjectId, ref: 'SolicitudRegistro' },
  evento: { type: String, required: true, enum: ['solicitada', 'reenvio', 'correo_emitido', 'correo_fallido', 'correo_incierto', 'verificada', 'completada'] },
  fecha: { type: Date, required: true, default: Date.now }
}, { autoIndex: false, autoCreate: false, strict: 'throw' });
schema.index({ solicitud: 1, fecha: 1 });
module.exports = mongoose.model('AuditoriaRegistro', schema);
