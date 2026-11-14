'use strict';
// Nodemon conserva la recarga; IPC permite cerrar exclusivamente este supervisor y su hijo.
const path = require('node:path');
const supervisar = ({ monitor = require('nodemon'), runtime = process } = {}) => {
  let terminando = false, codigoSalida = 0;
  const finalizar = (codigo = 0) => { if (!terminando) { terminando = true; codigoSalida = codigo; monitor.emit('quit'); } };
  monitor({ script: path.resolve(__dirname, '../server.js'), cwd: path.resolve(__dirname, '..'),
    stdout: true, stdin: false, exitcrash: true });
  monitor.on('message', mensaje => { if (mensaje?.tipo === 'PLURIONE_DEV_DETENIDO') finalizar(); });
  // Nodemon emite exit tambien durante recargas. Solo cerrar tras una parada explicita.
  monitor.on('exit', () => { if (terminando) runtime.exit(codigoSalida); });
  monitor.on('crash', () => finalizar(1)); monitor.on('error', () => finalizar(1));
  runtime.on('message', mensaje => { if (mensaje?.tipo === 'PLURIONE_DEV_CANCELAR') finalizar(); });
  runtime.once('disconnect', () => finalizar());
  runtime.once('SIGINT', () => finalizar()); runtime.once('SIGTERM', () => finalizar());
};
if (require.main === module) supervisar();
module.exports = { supervisar };
