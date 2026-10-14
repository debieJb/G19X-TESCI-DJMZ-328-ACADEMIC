// No lee .env. El marcador y los IDs emitidos son metadatos ficticios, no secretos.
const almacen = require('../services/ia/almacenCuotasDev');
if (require.main === module) {
  (async () => {
    if (process.argv.length !== 3 || process.argv[2] !== '--crear-fixture') throw Error();
    const fixture = await almacen.aprovisionar();
    console.log(JSON.stringify({ estado: 'CUOTAS_DEV_APROVISIONADAS', ...fixture }));
  })().catch(() => { console.error('ERROR: preparación detenida; no se intentan reparaciones.'); process.exitCode = 1; });
}
