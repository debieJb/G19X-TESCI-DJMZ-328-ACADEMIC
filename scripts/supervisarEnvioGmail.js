const { crearSupervisor } = require('../services/supervisorTrabajadorGmailService');
const args = process.argv.slice(2), abortar = new AbortController();
process.once('SIGINT', () => abortar.abort());
process.once('SIGTERM', () => abortar.abort());
const comprobar = args.length === 1 && args[0] === '--comprobar';
if (!comprobar && !(args.length === 1 && /^[a-f0-9]{24}$/.test(args[0]))) {
  console.error('Argumentos invalidos.'); process.exitCode = 1;
} else crearSupervisor().ejecutar({ comprobar, envioId: args[0], signal: abortar.signal }).then(r => {
  console.log(JSON.stringify(r)); if (!['comprobacion_sin_envios', 'finalizado_revisar_persistencia'].includes(r.estado)) process.exitCode = 1;
}).catch(() => { console.error('Supervisor bloqueado; sin reintentos.'); process.exitCode = 1; });
