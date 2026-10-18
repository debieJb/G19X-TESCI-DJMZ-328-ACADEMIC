const { createHash } = require('node:crypto');
const Limite = require('../models/LimiteRegistro');
const consumir = async ({ ip, email, ahora = Date.now() }) => {
  const indices = await Limite.collection.listIndexes().toArray();
  if (!indices.some(i => i.key?.expiraEn === 1 && Object.keys(i.key).length === 1 && i.expireAfterSeconds === 0)) throw Error('INDICES_LOGIN_REQUERIDOS');
  const ventanaMs = 15 * 60000, ventana = Math.floor(ahora / ventanaMs);
  for (const [tipo, valor, maximo] of [['ip', ip, 40], ['correo', email, 10]]) {
    const _id = createHash('sha256').update(`login:${tipo}:${valor}:${ventana}`).digest('hex');
    let doc;
    try { doc = await Limite.findOneAndUpdate({ _id }, { $inc: { cantidad: 1 },
      $setOnInsert: { expiraEn: new Date((ventana + 1) * ventanaMs) } }, { upsert: true, new: true }); }
    catch (e) { if (e.code !== 11000) throw e; doc = await Limite.findOneAndUpdate({ _id }, { $inc: { cantidad: 1 } }, { new: true }); }
    if (!doc || doc.cantidad > maximo) throw Object.assign(Error('LIMITE_LOGIN'), { codigo: 'LIMITE_LOGIN' });
  }
};
module.exports = { consumir };
