const principal = async (args = process.argv.slice(2)) => {
  const comprobar = args.length === 1 && args[0] === '--comprobar';
  if (!comprobar && (args.length !== 3 || args[0] !== '--solicitud' || !/^[a-f0-9]{24}$/.test(args[1]) || args[2] !== '--autorizar-envio')) throw Error('ARGUMENTOS_INVALIDOS');
  return require('../services/supervisorTrabajadorGmailService').crearSupervisor({ transaccional: true })
    .ejecutar({ comprobar, envioId: comprobar ? undefined : args[1] });
};
if (require.main === module) principal().then(r => {
  console.log(JSON.stringify(r));
  if (r.codigo !== 0) process.exitCode = 1;
}).catch(() => { console.error('Supervisor detenido; sin reinicio automatico.'); process.exitCode = 1; });
module.exports = { principal };
