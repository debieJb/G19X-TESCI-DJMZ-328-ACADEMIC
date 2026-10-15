const mongoose = require('mongoose');
require('dotenv').config({ quiet: true });
const almacen = require('../../services/ia/almacenCuotasProtegido');

(async () => {
  try {
    process.env.NODE_ENV ||= 'development';
    const Uso = await almacen.obtener('64b000000000000000000001');
    const indexes = await Uso.collection.listIndexes().toArray();
    almacen.validarIndices(indexes);
    console.log('ALMACEN_PROTEGIDO_OK: identidad, autenticación, privilegios e índices validados');
  } catch {
    console.error('ALMACEN_PROTEGIDO_ERROR: validación rechazada; detalles sensibles omitidos');
    process.exitCode = 1;
  } finally {
    await almacen.cerrar();
    await mongoose.disconnect().catch(() => {});
  }
})();
