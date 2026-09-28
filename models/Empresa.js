const mongoose = require('mongoose');
const configuracionCanal = habilitada => new mongoose.Schema({
  habilitada: { type: Boolean, default: habilitada },
  webhookUrl: { type: String, default: '', select: false, validate: {
    validator: valor => {
      if (valor === '') return true;
      try { const url = new URL(valor); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
      catch { return false; }
    }, message: 'Webhook inválido.'
  } }
}, { _id: false });

const empresaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  estado: { type: String, required: true, enum: ['activa', 'inactiva'], default: 'activa' },
  fechaRegistro: { type: Date, required: true, default: Date.now },
  automatizaciones: {
    email: { type: configuracionCanal(true), default: () => ({}) },
    whatsapp: { type: configuracionCanal(false), default: () => ({}) },
    facebook: { type: configuracionCanal(false), default: () => ({}) }
  }
});

module.exports = mongoose.model('Empresa', empresaSchema);
