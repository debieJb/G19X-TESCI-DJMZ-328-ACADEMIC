const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  hash: { type: String, required: true },
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  sesionHash: { type: String, required: true, select: false },
  nonceHash: { type: String, required: true, select: false },
  verifierCifrado: { type: String, required: true, select: false },
  clienteOAuthHash: { type: String, required: true },
  versionConexion: { type: Number, required: true },
  expiraEn: { type: Date, required: true }
}, { timestamps: true });
schema.index({ hash: 1 }, { unique: true });
schema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });
const limpiar = (doc, objeto) => {
  for (const campo of ['sesionHash', 'nonceHash', 'verifierCifrado']) delete objeto[campo];
  return objeto;
};
schema.set('toJSON', { transform: limpiar }); schema.set('toObject', { transform: limpiar });
module.exports = mongoose.model('EstadoOAuth', schema);
