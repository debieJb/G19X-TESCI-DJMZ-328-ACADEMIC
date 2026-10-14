const mongoose = require('mongoose');

const transiciones = {
  borrador: ['programada', 'activa'],
  programada: ['activa'],
  activa: ['pausada', 'finalizada'],
  pausada: ['activa', 'finalizada'],
  finalizada: []
};

const destinatariosSchema = new mongoose.Schema({
  tipo: { type: String, required: true, enum: ['todos', 'contactos', 'etiquetas'] },
  contactos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contacto' }],
  etiquetas: [{ type: String, trim: true }]
}, { _id: false });
destinatariosSchema.pre('validate', function () {
  if (this.tipo === 'contactos' && !this.contactos.length) this.invalidate('contactos', 'Selecciona al menos un contacto.');
  if (this.tipo === 'etiquetas' && (!this.etiquetas.length || this.etiquetas.some(valor => !valor))) this.invalidate('etiquetas', 'Selecciona al menos una etiqueta.');
});

const campanaSchema = new mongoose.Schema({
  // Opcionales por compatibilidad histórica. Una relación asignada no se cambia;
  // documentos sin relación pueden completarla explícitamente, nunca por HTTP.
  // Los controladores exigen empresa al crear; la ejecución valida su existencia.
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', immutable: function () { return !(this instanceof mongoose.Document) || this.empresa != null; } },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', immutable: function () { return !(this instanceof mongoose.Document) || this.creadoPor != null; } },
  nombre: { type: String, required: true, trim: true },
  objetivo: { type: String, required: true, trim: true },
  asunto: { type: String, trim: true },
  cuerpoTexto: { type: String },
  publicacion: { type: String },
  // Sin default: los documentos antiguos conservan el flujo previo de n8n.
  destinatarios: { type: destinatariosSchema, default: undefined },
  canal: {
    type: String,
    enum: ['email', 'redes_sociales', 'whatsapp', 'sms', 'otro']
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
