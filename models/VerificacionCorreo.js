const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, immutable: true },
  correoDestino: { type: String, required: true, trim: true, lowercase: true, maxlength: 320, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  proposito: { type: String, enum: ['verificar_acceso'], required: true },
  tokenHash: { type: String, required: true, select: false, minlength: 64, maxlength: 64, match: /^[a-f0-9]{64}$/ },
  estado: { type: String, enum: ['pendiente', 'consumida', 'invalidada'], default: 'pendiente', required: true },
  version: { type: Number, required: true, min: 1, validate: Number.isInteger },
  expiraEn: { type: Date, required: true },
  consumidaEn: Date
}, { timestamps: true, strict: 'throw' });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ usuario: 1, proposito: 1 }, { unique: true, partialFilterExpression: { estado: 'pendiente' } });
schema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });
const limpiar = (doc, objeto) => { delete objeto.tokenHash; return objeto; };
schema.set('toJSON', { transform: limpiar }); schema.set('toObject', { transform: limpiar });
module.exports = mongoose.model('VerificacionCorreo', schema);
