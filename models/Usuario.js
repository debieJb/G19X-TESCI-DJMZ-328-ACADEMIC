const mongoose = require('mongoose');
const { ROLES } = require('../services/permisos');

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  // Primera fase: campo requerido sin hash. Incorporar hash al implementar autenticación.
  password: { type: String, required: true },
  rol: { type: String, required: true, enum: ROLES },
  empresa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empresa',
    required: function () { return ['admin_empresa', 'operador'].includes(this.rol); }
  }
});

module.exports = mongoose.model('Usuario', usuarioSchema);
