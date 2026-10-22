const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  ejecucion: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  contacto: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  emailHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  modoMotor: { type: String, enum: ['piloto', 'automatico', 'supervisado'], default: function () { return this.isNew ? 'piloto' : undefined; }, immutable: true },
  estado: { type: String, required: true, enum: ['pendiente', 'reservado', 'enviando', 'aceptado', 'rechazado', 'cancelado', 'incierto'] },
  codigo: { type: String, enum: ['ACEPTADO_API', 'REVALIDACION', 'REAUTORIZAR', 'CUOTA_PROVEEDOR', 'PERMISO_PROVEEDOR', 'RECHAZO_PROVEEDOR', 'RESPUESTA_INVALIDA', 'TIMEOUT', 'CONEXION', 'RESERVA_VENCIDA', 'PREPARACION_FALLIDA', 'PERSISTENCIA_INCIERTA'] },
  consentimientoHash: { type: String, immutable: true, match: /^[a-f0-9]{64}$/ },
  reservaHash: { type: String, select: false }, reservaHasta: Date,
  mensajeId: { type: String, required: true }, gmailId: String, threadId: String,
  disponibleEn: Date,
  historial: { type: [new mongoose.Schema({ fecha: { type: Date, required: true },
    estado: { type: String, required: true }, codigo: { type: String, required: true }
  }, { _id: false })], default: [] },
  aceptadoEn: Date, intentos: { type: Number, default: 0, min: 0, max: 3 }
}, { timestamps: true, autoCreate: false, autoIndex: false, strict: 'throw' });
schema.index({ empresa: 1, ejecucion: 1, emailHash: 1 }, { unique: true });
schema.index({ estado: 1, createdAt: 1 });
schema.index({ empresa: 1, modoMotor: 1, estado: 1, disponibleEn: 1 });
schema.index({ empresa: 1, gmailId: 1 }, { unique: true, partialFilterExpression: { gmailId: { $type: 'string' } } });
module.exports = mongoose.model('EnvioGmail', schema);
