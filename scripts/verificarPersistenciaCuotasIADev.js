// Solo fixtures de cuotas: no lee .env, no llama a IA, no toca empresas.
const almacen = require('../services/ia/almacenCuotasDev');
const limites = require('../services/ia/limitesIA');
if (require.main === module) {
  (async () => {
    const [modo, empresa] = process.argv.slice(2);
    if (process.argv.length !== 4 || !['--llenar', '--verificar'].includes(modo)) throw Error();
    const ahora = Date.UTC(2030, 0, 1, 12); // Ventana exclusivamente ficticia estable al reiniciar.
    if (modo === '--llenar') for (let i = 0; i < 3; i++) await limites.consumir(empresa, ahora);
    let bloqueada = false;
    try { await limites.consumir(empresa, ahora); } catch (error) { if (error.codigo !== 'LIMITE') throw error; bloqueada = true; }
    if (!bloqueada) throw Error();
    const Uso = await almacen.obtener(empresa);
    const doc = await Uso.findOne({ empresa, ventana: `minuto:${Math.floor(ahora / 60000)}` }).lean();
    if (doc?.cantidad !== 3) throw Error();
    console.log(modo === '--llenar' ? 'CUOTA_FIXTURE_PERSISTIDA' : 'PERSISTENCIA_TRAS_REINICIO_VERIFICADA');
  })().catch(() => { console.error('ERROR: comprobación detenida, sin reparaciones.'); process.exitCode = 1; }).finally(() => almacen.cerrar());
}
