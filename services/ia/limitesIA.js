const ErrorIA = require('./ErrorIA');
const almacenDev = require('./almacenCuotasDev');
const almacenProtegido = require('./almacenCuotasProtegido');
const diagnostico = require('./diagnosticoIA');
const ocupadas = new Set();
const seleccionarAlmacen = (env = process.env) => {
  if (env.NODE_ENV === 'production') {
    if (env.AI_QUOTA_BACKEND !== undefined && env.AI_QUOTA_BACKEND !== 'protected') throw new ErrorIA('PROVEEDOR');
    return almacenProtegido;
  }
  if (env.AI_QUOTA_BACKEND === 'protected') return almacenProtegido;
  if (env.NODE_ENV === 'development' && env.AI_QUOTA_BACKEND === 'piloto_local') return require('./almacenCuotasPilotoLocal');
  if (env.AI_QUOTA_BACKEND === undefined || env.AI_QUOTA_BACKEND === 'dev_fixture') return almacenDev;
  throw new ErrorIA('PROVEEDOR');
};
const reservar = empresa => {
  if (ocupadas.size >= 2 || ocupadas.has(empresa)) throw new ErrorIA('LIMITE');
  ocupadas.add(empresa);
  return () => ocupadas.delete(empresa);
};
const consumir = async (empresa, ahora = Date.now()) => {
  let Uso;
  try {
    Uso = await seleccionarAlmacen().obtener(empresa);
  } catch (error) { diagnostico('CUOTA_ALMACEN', diagnostico.codigoCuota(error)); throw new ErrorIA('PROVEEDOR'); }
  for (const [tipo, duracion, maximo] of [['minuto', 60000, 3], ['dia', 86400000, 20]]) {
    const inicio = Math.floor(ahora / duracion);
    try {
      await Uso.findOneAndUpdate({ empresa, ventana: `${tipo}:${inicio}`, cantidad: { $lt: maximo } },
        { $inc: { cantidad: 1 }, $setOnInsert: { expiraEn: new Date((inicio + 2) * duracion) } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false });
    } catch (error) { diagnostico('CUOTA_ESCRITURA', diagnostico.codigoCuota(error)); if (error.code === 11000) throw new ErrorIA('LIMITE'); throw new ErrorIA('PROVEEDOR'); }
  }
};
module.exports = { reservar, consumir, seleccionarAlmacen };
