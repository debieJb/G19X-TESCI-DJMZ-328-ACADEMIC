'use strict';
const { createHash } = require('node:crypto');
const Limite = require('../models/LimiteRegistro');
const hash = texto => createHash('sha256').update(texto).digest('hex');
const incrementar = async ({ modelo = Limite, clave, maximo, ventanaMs, ahora = Date.now(), session, codigo = 'LIMITE_RECUPERACION' }) => {
  const ventana = Math.floor(ahora / ventanaMs), _id = hash(`${clave}:${ventana}`);
  let doc;
  try {
    doc = await modelo.findOneAndUpdate({ _id }, { $inc: { cantidad: 1 },
      $setOnInsert: { expiraEn: new Date((ventana + 1) * ventanaMs) } }, { upsert: true, new: true, session });
  } catch (e) {
    if (e.code !== 11000 || session) throw e;
    doc = await modelo.findOneAndUpdate({ _id }, { $inc: { cantidad: 1 } }, { new: true, session });
  }
  if (!doc || doc.cantidad > maximo) throw Object.assign(Error(codigo), { codigo });
};
const consumir = async ({ ip, identificador, accion = 'solicitud', ahora = Date.now() }) => {
  const indices = await Limite.collection.listIndexes().toArray();
  if (!indices.some(i => i.key?.expiraEn === 1 && Object.keys(i.key).length === 1 && i.expireAfterSeconds === 0)) throw Error('INDICES_RECUPERACION_REQUERIDOS');
  await incrementar({ clave: `recuperacion:${accion}:ip:${ip}`, maximo: 30, ventanaMs: 900000, ahora });
  await incrementar({ clave: `recuperacion:${accion}:cuenta:${identificador}`, maximo: accion === 'solicitud' ? 3 : 10,
    ventanaMs: accion === 'solicitud' ? 3600000 : 900000, ahora, codigo: 'CUENTA_LIMITADA' });
};
module.exports = { incrementar, consumir };
