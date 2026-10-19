const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  campana: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  actor: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  claveHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, select: false, immutable: true },
  contenidoHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  googleSub: { type: String, required: true, immutable: true, select: false },
  remitente: { type: String, required: true, immutable: true, select: false },
  total: { type: Number, required: true, min: 1, max: 50 },
  modoMotor: { type: String, enum: ['piloto', 'automatico', 'supervisado'], default: function () { return this.isNew ? 'piloto' : undefined; }, immutable: true },
  programadaPara: { type: Date, immutable: true }
}, { timestamps: true, autoCreate: false, autoIndex: false, strict: 'throw' });
schema.index({ empresa: 1, campana: 1 }, { unique: true });
schema.index({ empresa: 1, claveHash: 1 }, { unique: true });
module.exports = mongoose.model('EjecucionGmail', schema);
