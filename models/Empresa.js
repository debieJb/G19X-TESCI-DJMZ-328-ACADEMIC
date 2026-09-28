const mongoose = require('mongoose');

const empresaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  estado: { type: String, required: true, enum: ['activa', 'inactiva'], default: 'activa' },
  fechaRegistro: { type: Date, required: true, default: Date.now }
});

module.exports = mongoose.model('Empresa', empresaSchema);
