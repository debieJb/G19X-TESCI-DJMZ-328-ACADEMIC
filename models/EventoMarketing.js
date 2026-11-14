'use strict';
const mongoose = require('mongoose');

// Los eventos deben proceder de fuentes verificadas, no de un campo editable por el contacto.
const eventoMarketingSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true },
  contacto: { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto', required: true, immutable: true },
  campana: { type: mongoose.Schema.Types.ObjectId, ref: 'Campana', immutable: true },
  tipo: { type: String, required: true, enum: ['clic_verificado', 'formulario_enviado', 'solicitud_contacto', 'conversion_confirmada'] },
  origen: { type: String, required: true, enum: ['formulario_propio', 'integracion_verificada', 'registro_administrativo'] },
  referenciaExterna: { type: String, required: true, trim: true, maxlength: 180 },
  ocurridoEn: { type: Date, required: true, validate: { validator: v => v <= new Date(), message: 'El evento no puede ser futuro.' } },
  verificado: { type: Boolean, required: true, default: false },
  evidencia: { type: String, required: true, trim: true, minlength: 8, maxlength: 500 },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true }
}, { timestamps: true, autoIndex: false, autoCreate: false });
// Referencia unica por fuente y empresa; una referencia identifica una sola interaccion.
eventoMarketingSchema.index({ empresa: 1, origen: 1, referenciaExterna: 1 }, { unique: true });
eventoMarketingSchema.index({ empresa: 1, contacto: 1, ocurridoEn: -1 });
module.exports = mongoose.model('EventoMarketing', eventoMarketingSchema);
