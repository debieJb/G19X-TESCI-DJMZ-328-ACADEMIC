'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const https = require('node:https'), tls = require('node:tls');
const ORIGEN = 'https://localhost:3100';
const exigir = (condition, code) => { if (!condition) throw Error(code); };
const validarDestino = (env, manifiesto) => {
  exigir(env.PILOT_LOCAL_HTTPS === 'true' && env.NODE_ENV === 'production', 'TLS_LOCAL_NO_EXPLICITO');
  exigir(manifiesto.base === 'marketing_piloto_mvp' && manifiesto.replicaSet === 'marketingPilotLocalRs'
    && manifiesto.miembros?.length === 1 && manifiesto.miembros[0] === '127.0.0.1:27019'
    && manifiesto.host === '127.0.0.1' && manifiesto.puerto === 3100 && manifiesto.trustProxy?.length === 0, 'TLS_LOCAL_DESTINO_INVALIDO');
  exigir(env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS_NO_PERMITE_OMITIR_VERIFICACION');
};
const validarCertificado = (cert, ahora = Date.now()) => {
  exigir(cert.subjectAltName === 'DNS:localhost' && cert.checkHost('localhost', { subject: 'never' }) === 'localhost'
    && cert.ca === false && cert.keyUsage?.length === 1 && cert.keyUsage[0] === '1.3.6.1.5.5.7.3.1'
    && cert.verify(cert.publicKey) === true && +new Date(cert.validFrom) <= ahora
    && +new Date(cert.validTo) > ahora && +new Date(cert.validTo) - ahora <= 31 * 86400000, 'TLS_CERTIFICADO_LOCAL_INVALIDO');
};
const archivoPrivado = file => {
  exigir(typeof file === 'string' && path.isAbsolute(file), 'TLS_ARCHIVO_INVALIDO');
  const real = fs.realpathSync(file), stat = fs.lstatSync(file);
  exigir(!stat.isSymbolicLink() && stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= 65536
    && real.toLowerCase() === path.resolve(file).toLowerCase(), 'TLS_ARCHIVO_INVALIDO');
  const relativo = path.relative(path.resolve(__dirname, '..'), real);
  exigir(relativo.startsWith('..' + path.sep) || path.isAbsolute(relativo), 'TLS_ARCHIVO_DENTRO_REPOSITORIO');
  return fs.readFileSync(real);
};
const configuracion = (env, manifiesto) => {
  validarDestino(env, manifiesto);
  const certificado = new crypto.X509Certificate(archivoPrivado(env.PILOT_TLS_CERT_FILE));
  validarCertificado(certificado);
  // Export-Certificate produce DER; Node espera PEM en la opcion ca.
  const cert = certificado.toString();
  exigir(typeof env.PILOT_TLS_PFX_PASSPHRASE === 'string' && env.PILOT_TLS_PFX_PASSPHRASE.length >= 32, 'TLS_CLAVE_PFX_INVALIDA');
  const opciones = { pfx: archivoPrivado(env.PILOT_TLS_PFX_FILE), passphrase: env.PILOT_TLS_PFX_PASSPHRASE, minVersion: 'TLSv1.2' };
  tls.createSecureContext(opciones); // PFX y clave deben ser utilizables; jamás fallback a HTTP.
  return { opciones, cert };
};
const crearServidor = (app, config) => https.createServer(config.opciones, (req, res) => {
  if (req.headers.host !== 'localhost:3100') { res.writeHead(421).end(); return; }
  res.setHeader('X-PluriOne-Local-Pilot', '1');
  app(req, res);
});
const comprobarOrigen = config => new Promise((resolve, reject) => {
  const request = https.get({ hostname: '127.0.0.1', port: 3100, servername: 'localhost', path: '/',
    headers: { Host: 'localhost:3100' }, ca: config.cert, rejectUnauthorized: true, minVersion: 'TLSv1.2', timeout: 4000 }, res => {
    res.resume();
    if (res.statusCode === 200 && res.headers['x-plurione-local-pilot'] === '1') resolve({ origen: ORIGEN, tlsVerificado: true });
    else reject(Error('TLS_WEB_LOCAL_NO_VALIDADA'));
  });
  request.on('timeout', () => request.destroy(Error('TLS_WEB_LOCAL_NO_DISPONIBLE')));
  request.on('error', () => reject(Error('TLS_WEB_LOCAL_NO_DISPONIBLE')));
});
module.exports = { ORIGEN, validarDestino, validarCertificado, configuracion, crearServidor, comprobarOrigen };
