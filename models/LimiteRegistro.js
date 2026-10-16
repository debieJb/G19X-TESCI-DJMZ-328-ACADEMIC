const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: String, match: /^[a-f0-9]{64}$/ },
  cantidad: { type: Number, required: true },
  expiraEn: { type: Date, required: true }
}, { autoIndex: false, autoCreate: false, strict: 'throw' });
schema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('LimiteRegistro', schema);
