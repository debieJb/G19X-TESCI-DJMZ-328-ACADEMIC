const mongoose = require('mongoose');
const { validarFormatoUrl } = require('../services/validacionWebhookService');
const configuracionCanal = habilitada => new mongoose.Schema({
  habilitada: { type: Boolean, default: habilitada },
  webhookUrl: { type: String, default: '', select: false, validate: {
    validator: valor => {
      if (valor === '') return true;
      try { validarFormatoUrl(valor); return true; }
      catch { return false; }
    }, message: 'Webhook inválido.'
  } }
}, { _id: false });

const empresaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  correoAutomatizaciones: { type: String, trim: true, lowercase: true, maxlength: 320,
    required: function () { return this.versionAlta === 1; },
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  estadoActivacion: { type: String, enum: ['pendiente_verificacion', 'verificada'],
    required: function () { return this.versionAlta === 1; },
    default: function () { return this.isNew ? 'pendiente_verificacion' : undefined; } },
  versionAlta: { type: Number, enum: [1] },
  estado: { type: String, required: true, enum: ['activa', 'inactiva'], default: 'activa' },
  fechaRegistro: { type: Date, required: true, default: Date.now },
  automatizaciones: {
    email: { type: configuracionCanal(true), default: () => ({}) },
    whatsapp: { type: configuracionCanal(false), default: () => ({}) },
    facebook: { type: configuracionCanal(false), default: () => ({}) }
  }
});

module.exports = mongoose.model('Empresa', empresaSchema);
