const principal = async (args = process.argv.slice(2)) => {
  if (args.length === 2 && args[0] === '--residente') {
    require('../services/trabajadorVerificacionService').validarActivacion(process.env, args.slice(1));
    const cancelar = new AbortController(), parar = () => cancelar.abort();
    process.once('SIGINT', parar); process.once('SIGTERM', parar);
    try { return await require('../services/supervisorVerificacionResidenteService').ejecutar({ signal: cancelar.signal,
      informar: codigo => console.log(codigo) }); }
    finally { process.removeListener('SIGINT', parar); process.removeListener('SIGTERM', parar); }
  }
  const comprobar = args.length === 1 && args[0] === '--comprobar';
  if (!comprobar && (args.length !== 3 || args[0] !== '--solicitud' || !/^[a-f0-9]{24}$/.test(args[1]) || args[2] !== '--autorizar-envio')) throw Error('ARGUMENTOS_INVALIDOS');
  return require('../services/supervisorTrabajadorGmailService').crearSupervisor({ transaccional: true })
    .ejecutar({ comprobar, envioId: comprobar ? undefined : args[1] });
};
if (require.main === module) principal().then(r => {
  console.log(JSON.stringify(r));
  if (r.codigo !== undefined && r.codigo !== 0) process.exitCode = 1;
}).catch(() => { console.error('Supervisor detenido; sin reinicio automatico.'); process.exitCode = 1; });
module.exports = { principal };
