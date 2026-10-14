const mongoose = require('mongoose');
const ocultos = ['accessTokenCifrado', 'refreshTokenCifrado', 'revocacionTokenCifrado', 'bloqueoRenovacion', 'bloqueoHasta'];
const tokenCifrado = () => ({ type: String, select: false, maxlength: 24000,
  match: /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/ });
const schema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, immutable: true },
  googleSub: { type: String, maxlength: 255 },
  email: { type: String, trim: true, lowercase: true, maxlength: 320 },
  estado: { type: String, enum: ['desconectada', 'conectada', 'requiere_reconexion', 'revocacion_pendiente'], default: 'desconectada', required: true },
  scopes: { type: [String], default: [] },
  accessTokenCifrado: tokenCifrado(),
  refreshTokenCifrado: tokenCifrado(),
  revocacionTokenCifrado: tokenCifrado(),
  expiraEn: Date,
  conectadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  conectadoEn: Date,
  renovadoEn: Date,
  clienteOAuthHash: String,
  versionConexion: { type: Number, default: 0, required: true },
  bloqueoRenovacion: { type: String, select: false },
  bloqueoHasta: { type: Date, select: false }
}, { timestamps: true });
schema.index({ empresa: 1 }, { unique: true });
// Revocar el mismo grant de Google puede afectar a otras autorizaciones de esa
// cuenta: no permitir que una identidad Google pertenezca a dos empresas.
schema.index({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } });
const limpiar = (doc, objeto) => { for (const campo of ocultos) delete objeto[campo]; return objeto; };
schema.set('toJSON', { transform: limpiar }); schema.set('toObject', { transform: limpiar });
module.exports = mongoose.model('ConexionGmail', schema);
