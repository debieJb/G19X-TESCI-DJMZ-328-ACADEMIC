const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const V3_SHA256 = '9958ed6eeabf1cfd651aba11c108817b7d095510059a0da8dec7e4395b57353d';
const exigir = valor => { if (!valor) throw Error('RECONCILIACION_NO_AUTORIZADA'); };
const validarHistoria = ({ antes, referencia, v3, baselineBytes, v2Bytes, v3Bytes }) => {
  // El llamador ejecuta además validarReferencia(antes, referencia), sin cambios.
  exigir(hash(v3Bytes) === V3_SHA256 && isDeepStrictEqual(JSON.parse(v3Bytes), v3));
  exigir(v3.version === 3 && v3.tipo === 'RECONCILIACION_PID_UNICA');
  exigir(hash(baselineBytes) === v3.historicaSha256 && hash(v2Bytes) === v3.referenciaV2Sha256);
  exigir(isDeepStrictEqual(JSON.parse(baselineBytes), antes));
  exigir(isDeepStrictEqual(JSON.parse(v2Bytes), referencia));
  exigir(antes.pid === 5648 && referencia.actual.pid === 5648);
  exigir(isDeepStrictEqual(v3.anterior, referencia.actual));
  exigir(isDeepStrictEqual(v3.actual, { ...referencia.actual, pid: 6160 }));
  exigir(v3.servicio.name === 'MongoDB' && v3.servicio.state === 'Running');
  exigir(v3.servicio.pid === 6160 && v3.servicio.ownerPid === 6160);
  exigir(v3.servicio.port === 27017 && v3.servicio.address === '127.0.0.1');
};
// Reproduccion de la reconciliacion unica de 2026: no es una politica de arranque.
const validarReconciliacion = args => {
  validarHistoria(args);
  exigir(isDeepStrictEqual(args.actual, args.v3.actual));
  exigir(isDeepStrictEqual(args.servicioAntes, args.v3.servicio));
  exigir(isDeepStrictEqual(args.servicioDespues, args.v3.servicio));
};
const validarArranqueOriginal = args => {
  validarHistoria(args);
  const { v3, actual, servicioAntes, servicioDespues } = args;
  const comprobar = (ok, codigo) => { if (!ok) throw Error(codigo); };
  comprobar(servicioAntes && servicioDespues && isDeepStrictEqual(servicioAntes, servicioDespues), 'SERVICIO_CAMBIO_DURANTE_COMPROBACION');
  const servicio = servicioAntes;
  // Solo PID y fecha de creacion son volatiles. La identidad restante sigue anclada a v3.
  for (const campo of ['name', 'state', 'startMode', 'command', 'address', 'port',
    'binary', 'binarySha256', 'config', 'configSha256', 'dbPath']) {
    comprobar(servicio[campo] === v3.servicio[campo], 'IDENTIDAD_SERVICIO_ORIGINAL_INCORRECTA');
  }
  comprobar(Number.isSafeInteger(servicio.pid) && servicio.pid > 0
    && servicio.ownerPid === servicio.pid && actual?.pid === servicio.pid, 'PID_SERVICIO_LISTENER_MONGO_NO_COINCIDE');
  comprobar(typeof servicio.processCreatedUtc === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,7}Z$/.test(servicio.processCreatedUtc)
    && Number.isFinite(Date.parse(servicio.processCreatedUtc)), 'FECHA_PROCESO_ORIGINAL_INVALIDA');
  const mismaRuta = (a, b) => typeof a === 'string' && path.win32.isAbsolute(a) && a.toLowerCase() === b.toLowerCase();
  comprobar(mismaRuta(servicio.processBinary, v3.servicio.binary)
    && servicio.processCommand === v3.servicio.command, 'PROCESO_ORIGINAL_NO_COINCIDE');
  for (const [campo, canonica] of [['binary', 'binaryCanonical'], ['config', 'configCanonical'], ['dbPath', 'dbPathCanonical']]) {
    comprobar(mismaRuta(servicio[canonica], v3.servicio[campo]), 'RUTA_ORIGINAL_NO_CANONICA');
  }
  for (const campo of ['configuracion', 'datos', 'indices']) {
    comprobar(actual[campo] === v3.actual[campo], `HUELLA_ORIGINAL_DIFIERE_${campo.toUpperCase()}`);
  }
};
const leerServicio = () => {
  // No shell, argumentos fijos, sin cambios de política de ejecución.
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'verificarServicioMongoOriginal.ps1')],
    { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output.replace(/^\uFEFF/, ''));
};
const comprobarArranqueOriginal = async (historia, { leerOriginal, capturarServicio = leerServicio }) => {
  validarHistoria(historia);
  const servicioAntes = capturarServicio();
  const actual = await leerOriginal();
  const servicioDespues = capturarServicio();
  validarArranqueOriginal({ ...historia, actual, servicioAntes, servicioDespues });
  return actual;
};
module.exports = { V3_SHA256, validarHistoria, validarReconciliacion, validarArranqueOriginal, comprobarArranqueOriginal, leerServicio };
