const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exigir = valor => { if (!valor) throw Error('RECONCILIACION_NO_AUTORIZADA'); };
const validarReconciliacion = ({ antes, referencia, v3, actual, servicioAntes, servicioDespues, baselineBytes, v2Bytes }) => {
  // El llamador ejecuta además validarReferencia(antes, referencia), sin cambios.
  exigir(v3.version === 3 && v3.tipo === 'RECONCILIACION_PID_UNICA');
  exigir(hash(baselineBytes) === v3.historicaSha256 && hash(v2Bytes) === v3.referenciaV2Sha256);
  exigir(isDeepStrictEqual(JSON.parse(baselineBytes), antes));
  exigir(isDeepStrictEqual(JSON.parse(v2Bytes), referencia));
  exigir(antes.pid === 5648 && referencia.actual.pid === 5648);
  exigir(isDeepStrictEqual(v3.anterior, referencia.actual));
  exigir(isDeepStrictEqual(v3.actual, { ...referencia.actual, pid: 6160 }));
  exigir(isDeepStrictEqual(actual, v3.actual));
  exigir(v3.servicio.name === 'MongoDB' && v3.servicio.state === 'Running');
  exigir(v3.servicio.pid === 6160 && v3.servicio.ownerPid === 6160);
  exigir(v3.servicio.port === 27017 && v3.servicio.address === '127.0.0.1');
  exigir(isDeepStrictEqual(servicioAntes, v3.servicio));
  exigir(isDeepStrictEqual(servicioDespues, v3.servicio));
};
const leerServicio = () => {
  // No shell, argumentos fijos, sin cambios de política de ejecución.
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'verificarServicioMongoOriginal.ps1')],
    { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output.replace(/^\uFEFF/, ''));
};
module.exports = { validarReconciliacion, leerServicio };
