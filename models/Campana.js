const mongoose = require('mongoose');

const transiciones = {
  borrador: ['programada', 'activa'],
  programada: ['activa'],
  activa: ['pausada', 'finalizada'],
  pausada: ['activa', 'finalizada'],
  finalizada: []
};

const campanaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  objetivo: { type: String, required: true, trim: true },
  asunto: { type: String, trim: true },
  cuerpoTexto: { type: String },
  canal: {
    type: String,
    enum: ['email', 'redes_sociales', 'sms', 'otro']
  },
  estado: {
    type: String,
    required: true,
    enum: ['borrador', 'programada', 'activa', 'pausada', 'finalizada'],
    default: 'borrador',
    validate: {
      validator: function (estado) { return !this.isNew || estado === 'borrador'; },
      message: 'Toda campaña nueva debe comenzar en borrador.'
    }
  },
  fechaInicio: {
    type: Date,
    required: [function () { return this.estado === 'programada'; }, 'Una campaña programada debe tener fecha de inicio.']
  },
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

// El controlador compara el estado persistido con el solicitado antes de modificar el documento.
campanaSchema.statics.estadosPermitidos = function (estado) {
  return Object.hasOwn(transiciones, estado) ? [estado, ...transiciones[estado]] : [];
};

module.exports = mongoose.model('Campana', campanaSchema);
