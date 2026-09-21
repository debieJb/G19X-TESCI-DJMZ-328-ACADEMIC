const mongoose = require('mongoose');

const campanaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  objetivo: { type: String, required: true, trim: true },
  canal: {
    type: String,
    enum: ['email', 'redes_sociales', 'sms', 'otro']
  },
  estado: {
    type: String,
    enum: ['borrador', 'programada', 'activa', 'pausada', 'finalizada'],
    default: 'borrador'
  },
  fechaInicio: { type: Date },
  fechaFin: {
    type: Date,
    validate: {
      validator: function (fechaFin) {
        return !fechaFin || !this.fechaInicio || fechaFin >= this.fechaInicio;
      },
      message: 'La fecha de fin no puede ser anterior a la fecha de inicio.'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Campana', campanaSchema);
