const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, immutable: true },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, immutable: true },
  tipo: { type: String, enum: ['verificar_acceso'], required: true, immutable: true },
  versionAlta: { type: Number, enum: [1], required: true, immutable: true },
  correoDestino: { type: String, required: true, trim: true, lowercase: true, maxlength: 320, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  estado: { type: String, enum: ['pendiente_configuracion', 'pendiente', 'procesando', 'enviada', 'fallida', 'cancelada'],
    default: 'pendiente_configuracion', required: true },
  intentos: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  idempotenciaHash: { type: String, required: true, immutable: true, select: false, minlength: 64, maxlength: 64, match: /^[a-f0-9]{64}$/ },
  solicitudHash: { type: String, required: true, immutable: true, select: false, minlength: 64, maxlength: 64, match: /^[a-f0-9]{64}$/ }
}, { timestamps: true, strict: 'throw' });
schema.index({ creadoPor: 1, idempotenciaHash: 1 }, { unique: true });
schema.index({ empresa: 1, tipo: 1, versionAlta: 1 }, { unique: true });
schema.index({ estado: 1, createdAt: 1 });
const limpiar = (doc, objeto) => { delete objeto.idempotenciaHash; delete objeto.solicitudHash; return objeto; };
schema.set('toJSON', { transform: limpiar }); schema.set('toObject', { transform: limpiar });
module.exports = mongoose.model('TareaCorreo', schema);
