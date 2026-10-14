const mongoose = require('mongoose');
const opcional = valor => typeof valor === 'string' ? valor.trim() || undefined : valor;
const contactoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, set: opcional, validate: {
    validator: valor => !valor || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor), message: 'Introduce un email válido.'
  } },
  telefono: { type: String, trim: true, set: opcional },
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true },
  etiquetas: { type: [String], default: [] },
  canales: {
    email: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    sms: { type: Boolean, default: false }
  },
  activo: { type: Boolean, default: true },
  // Ausente en históricos: nunca inferir consentimiento desde canales.email.
  consentimientoMarketing: { type: new mongoose.Schema({
    estado: { type: String, enum: ['otorgado', 'revocado'], required: true }, fecha: { type: Date, required: true },
    fuente: { type: String, required: true, trim: true, maxlength: 300 }
  }, { _id: false }), default: undefined },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', immutable: true }
}, { timestamps: true });
contactoSchema.pre('validate', function () {
  if (!this.email && !this.telefono) this.invalidate('email', 'Introduce al menos email o teléfono.');
});
for (const campo of ['email', 'telefono']) {
  contactoSchema.index({ empresa: 1, [campo]: 1 }, {
    unique: true, partialFilterExpression: { [campo]: { $type: 'string' } }
  });
}
module.exports = mongoose.model('Contacto', contactoSchema);
