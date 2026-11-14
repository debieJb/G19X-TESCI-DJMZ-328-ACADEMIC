'use strict';
const path = require('node:path');
const { crearEntornoLocal } = require('./iniciarDevLocal');
const identidad = require('../services/estadoDevLocal');
const coord = require('./coordinarDevLocal');
const detener = async () => {
  const root = path.resolve(__dirname, '..');
  const env = crearEntornoLocal(process.env, root);
  const liberar = await coord.bloquear(root);
  try {
    if (!await coord.ocupado(3000)) { console.log('PLURIONE: YA_DETENIDA'); return; }
    const pid = await identidad.solicitarParada(env);
    for (let i = 0; i < 60; i++) {
      if (!await coord.ocupado(3000)) { console.log(`PLURIONE: DETENIDA; PID ${pid}; MongoDB permanece activo.`); return; }
      await new Promise(r => setTimeout(r, 250));
    }
    throw Error('PARADA_TIMEOUT');
  } finally { await liberar(); }
};
if (require.main === module) detener().catch(() => { console.error('PLURIONE_PARADA_NO_CONFIRMADA: no se mataron procesos.'); process.exitCode = 1; });
module.exports = { detener };
