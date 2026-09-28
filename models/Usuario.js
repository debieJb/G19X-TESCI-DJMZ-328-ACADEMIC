const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../services/permisos');

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  password: {
    type: String, required: true, select: false,
    validate: {
      validator: valor => typeof valor === 'string' && Buffer.byteLength(valor, 'utf8') <= 72,
      message: 'La contraseña no debe superar 72 bytes.'
    }
  },
  rol: { type: String, required: true, enum: ROLES },
  empresa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empresa',
    required: function () { return ['admin_empresa', 'operador'].includes(this.rol); }
  }
});

usuarioSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});

usuarioSchema.methods.compararPassword = async function (password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) return false;
  let hash = this.password;
  if (hash === undefined && !this.isNew) {
    const usuario = await this.constructor.findById(this._id).select('+password');
    hash = usuario?.password;
  }
  // Nunca comparar directamente con texto plano heredado.
  if (typeof hash !== 'string' || !/^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) return false;
  return bcrypt.compare(password, hash);
};

// Guardar usuarios mediante create/save para ejecutar siempre el hash del documento.
// Bloquear vías masivas y reemplazos que pueden omitir middleware de save.
for (const operacion of ['insertMany', 'bulkWrite', 'replaceOne', 'findOneAndReplace']) {
  usuarioSchema.pre(operacion, function () { throw new Error('Usa Usuario.create o documento.save para guardar usuarios.'); });
}
for (const operacion of ['updateOne', 'updateMany', 'findOneAndUpdate']) {
  usuarioSchema.pre(operacion, function () {
    const update = this.getUpdate() || {};
    const contienePassword = objeto => objeto && typeof objeto === 'object' && Object.entries(objeto).some(([clave, valor]) =>
      clave === 'password' || clave.startsWith('password.') || valor === 'password' || contienePassword(valor));
    if (Array.isArray(update) || this.getOptions().upsert || contienePassword(update)) {
      throw new Error('Usa documento.save para cambiar la contraseña o crear usuarios.');
    }
  });
}
const sinPassword = (doc, objeto) => { delete objeto.password; return objeto; };
usuarioSchema.set('toJSON', { transform: sinPassword });
usuarioSchema.set('toObject', { transform: sinPassword });

module.exports = mongoose.model('Usuario', usuarioSchema);
