const mongoose = require('mongoose');
const hash = { type: String, match: /^[a-f0-9]{64}$/, select: false };
const schema = new mongoose.Schema({
  nombreEmpresa: { type: String, required: true, maxlength: 200 },
  correo: { type: String, required: true, lowercase: true, immutable: true, maxlength: 320 },
  estado: { type: String, required: true, enum: ['pendiente_correo', 'correo_verificado', 'completada'] },
  idempotenciaHash: { ...hash, required: true, immutable: true },
  solicitudHash: { ...hash, required: true, immutable: true },
  tokenHash: hash,
  expiraEn: Date,
  verificadoEn: Date,
  configuracionSesionHash: hash,
  configuracionExpiraEn: Date,
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa' },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  correoEstado: { type: String, required: true, enum: ['pendiente_configuracion', 'pendiente', 'procesando', 'enviada', 'fallida', 'incierta', 'cancelada'] },
  solicitudesEnvio: { type: Number, default: 1, min: 1, max: 5 },
  ventanaEnvioEn: { type: Date, required: true },
  proximoEnvioEn: { type: Date, required: true },
  entregaHash: hash,
  entregaHasta: Date,
  versionEnvio: { type: Number, default: 0 },
  correoError: { type: String, enum: ['TRABAJADOR_INTERRUMPIDO', 'REAUTORIZAR_TRANSACCIONAL',
    'GMAIL_TRANSACCIONAL_RECHAZADO', 'ENTREGA_CANCELADA', 'ENTREGA_INCIERTA', 'PROVEEDOR_RECHAZADO'] },
  proveedorMensajeId: { type: String, match: /^[a-zA-Z0-9_-]{1,128}$/ }
}, { timestamps: true, strict: 'throw', autoIndex: false, autoCreate: false });
schema.index({ correo: 1 }, { unique: true });
schema.index({ idempotenciaHash: 1 }, { unique: true });
schema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } });
schema.index({ correoEstado: 1, createdAt: 1 });
const limpiar = (doc, objeto) => {
  for (const campo of ['tokenHash', 'idempotenciaHash', 'solicitudHash', 'configuracionSesionHash', 'entregaHash']) delete objeto[campo];
  return objeto;
};
schema.set('toJSON', { transform: limpiar }); schema.set('toObject', { transform: limpiar });
module.exports = mongoose.model('SolicitudRegistro', schema);
