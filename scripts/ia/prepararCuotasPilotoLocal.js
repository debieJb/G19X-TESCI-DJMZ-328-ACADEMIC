'use strict';
if (process.argv.length !== 3 || process.argv[2] !== '--aplicar') {
  console.error('REQUIERE_APLICACION_EXPLICITA'); process.exitCode = 1;
} else {
  require('dotenv').config({ quiet: true });
  require('../../services/ia/almacenCuotasPilotoLocal').preparar()
    .then(r => console.log(JSON.stringify(r)))
    .catch(() => { console.error('CUOTAS_PILOTO_NO_PREPARADAS'); process.exitCode = 1; });
}
