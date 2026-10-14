const ErrorIA = require('./ErrorIA');
const almacen = require('./almacenCuotasDev');
const ocupadas = new Set();
const reservar = empresa => {
  if (ocupadas.size >= 2 || ocupadas.has(empresa)) throw new ErrorIA('LIMITE');
  ocupadas.add(empresa);
  return () => ocupadas.delete(empresa);
};
const consumir = async (empresa, ahora = Date.now()) => {
  let Uso;
  try {
    Uso = await almacen.obtener(empresa);
  } catch { throw new ErrorIA('PROVEEDOR'); }
  for (const [tipo, duracion, maximo] of [['minuto', 60000, 3], ['dia', 86400000, 20]]) {
    const inicio = Math.floor(ahora / duracion);
    try {
      await Uso.findOneAndUpdate({ empresa, ventana: `${tipo}:${inicio}`, cantidad: { $lt: maximo } },
        { $inc: { cantidad: 1 }, $setOnInsert: { expiraEn: new Date((inicio + 2) * duracion) } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false });
    } catch (error) { if (error.code === 11000) throw new ErrorIA('LIMITE'); throw new ErrorIA('PROVEEDOR'); }
  }
};
module.exports = { reservar, consumir };
