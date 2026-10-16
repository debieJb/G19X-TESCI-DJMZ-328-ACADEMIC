const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  campana: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  contacto: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  actor: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  contenidoHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  emailHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  consentimientoHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  expiraEn: { type: Date, required: true, immutable: true },
  estado: { type: String, enum: ['autorizada', 'consumida', 'revocada'], required: true },
  consumidaEn: Date, revocadaEn: Date, envio: mongoose.Schema.Types.ObjectId
}, { timestamps: true, autoCreate: false, autoIndex: false, strict: 'throw' });
// Retener evidencia: la caducidad se valida logicamente; no borrar autorizaciones con TTL.
schema.index({ empresa: 1, campana: 1 }, { unique: true });
module.exports = mongoose.model('AutorizacionPilotoGmail', schema);
