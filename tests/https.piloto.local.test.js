const { test } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const local = require('../services/httpsPilotoLocalService');
const manifiesto = () => ({ base: 'marketing_piloto_mvp', replicaSet: 'marketingPilotLocalRs',
  miembros: ['127.0.0.1:27019'], host: '127.0.0.1', puerto: 3100, trustProxy: [] });
const env = () => ({ PILOT_LOCAL_HTTPS: 'true', NODE_ENV: 'production' });
const cert = () => ({ subjectAltName: 'DNS:localhost', checkHost: () => 'localhost', ca: false,
  keyUsage: ['1.3.6.1.5.5.7.3.1'], verify: () => true, publicKey: {},
  validFrom: new Date(Date.now() - 60000).toISOString(), validTo: new Date(Date.now() + 86400000).toISOString() });

test('TLS local: convierte CER binario a PEM antes de usarlo como CA del sondeo', t => {
  const fs = require('node:fs'), crypto = require('node:crypto'), tls = require('node:tls');
  const path = require('node:path');
  const archivo = path.join(require('node:os').tmpdir(), 'fixture-certificado-local.cer');
  const binario = Buffer.from([0x30, 0x82, 0x01]);
  t.mock.method(fs, 'realpathSync', p => p);
  t.mock.method(fs, 'lstatSync', () => ({ isSymbolicLink: () => false, isFile: () => true, nlink: 1, size: 3 }));
  t.mock.method(fs, 'readFileSync', () => binario);
  t.mock.method(crypto, 'X509Certificate', class {
    constructor(datos) {
      assert.equal(datos, binario);
      return { ...cert(), toString: () => '-----BEGIN CERTIFICATE-----\nfixture-publica\n-----END CERTIFICATE-----' };
    }
  });
  t.mock.method(tls, 'createSecureContext', () => ({}));
  const config = local.configuracion({ ...env(), PILOT_TLS_CERT_FILE: archivo, PILOT_TLS_PFX_FILE: archivo,
    PILOT_TLS_PFX_PASSPHRASE: 'sintetica-exclusiva-prueba-'.repeat(2) }, manifiesto());
  assert.match(config.cert, /^-----BEGIN CERTIFICATE-----/);
  assert.equal(config.opciones.pfx, binario);
});
test('TLS local: exige configuración explícita, destino dedicado, loopback y producción', () => {
  assert.doesNotThrow(() => local.validarDestino(env(), manifiesto()));
  for (const cambio of [{ NODE_ENV: 'development' }, { PILOT_LOCAL_HTTPS: undefined }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }])
    assert.throws(() => local.validarDestino({ ...env(), ...cambio }, manifiesto()));
  for (const cambio of [{ base: 'marketing_automation' }, { replicaSet: 'marketingDevRs' }, { miembros: ['127.0.0.1:27018'] },
    { host: '0.0.0.0' }, { puerto: 3000 }, { trustProxy: ['127.0.0.1'] }])
    assert.throws(() => local.validarDestino(env(), { ...manifiesto(), ...cambio }));
});
test('TLS local: cookie propia evita interferir con el servidor habitual de localhost', async () => {
  const app = require('express')();
  app.use(require('../config/session')({ secret: 'fixture-exclusiva-cookie-local', entorno: 'test', nombreCookie: 'marketing.piloto.sid' }));
  app.get('/', (req,res) => { req.session.fixture = true; res.sendStatus(200); });
  const res = await require('supertest')(app).get('/').expect(200);
  assert.match(res.headers['set-cookie'][0], /^marketing\.piloto\.sid=/);
  assert.throws(() => require('../config/session')({ secret: 'fixture', nombreCookie: 'arbitrario' }), /no permitido/);
});
test('TLS local: solo certificado localhost, servidor, sin CA, vigente y de duración acotada', () => {
  assert.doesNotThrow(() => local.validarCertificado(cert()));
  for (const cambio of [{ subjectAltName: 'DNS:localhost, DNS:otro.example.test' }, { ca: true }, { keyUsage: [] },
    { keyUsage: ['1.3.6.1.5.5.7.3.1', '1.3.6.1.5.5.7.3.2'] }, { checkHost: () => undefined }, { verify: () => false },
    { validFrom: new Date(Date.now() + 86400000).toISOString() }, { validTo: new Date(Date.now() - 1).toISOString() },
    { validTo: new Date(Date.now() + 90 * 86400000).toISOString() }]) assert.throws(() => local.validarCertificado({ ...cert(), ...cambio }));
});
test('TLS local: valida archivos antes de arrancar y no convierte errores en HTTP', () => {
  assert.throws(() => local.configuracion(env(), manifiesto()), /TLS_ARCHIVO_INVALIDO/);
});
test('TLS local: autoridad Host exacta; las solicitudes ajenas no llegan a Express', t => {
  let atender, llamadas = 0, status, header;
  t.mock.method(https, 'createServer', (opciones, handler) => { atender = handler; return { opciones }; });
  const config = { opciones: { minVersion: 'TLSv1.2' } };
  assert.deepEqual(local.crearServidor(() => { llamadas++; }, config).opciones, config.opciones);
  const res = { writeHead: s => { status = s; return { end() {} }; }, setHeader: (k, v) => { header = [k, v]; } };
  atender({ headers: { host: 'otro.example.test:3100' } }, res); assert.equal(status, 421); assert.equal(llamadas, 0);
  atender({ headers: { host: 'localhost:3100' } }, res); assert.equal(llamadas, 1);
  assert.deepEqual(header, ['X-PluriOne-Local-Pilot', '1']);
});
test('TLS local: sondeo autentica certificado y nombre, sin desactivar TLS ni consultar Google', async t => {
  let opciones;
  t.mock.method(https, 'get', (o, callback) => {
    opciones = o;
    queueMicrotask(() => callback({ statusCode: 200, headers: { 'x-plurione-local-pilot': '1' }, resume() {} }));
    return new EventEmitter();
  });
  assert.deepEqual(await local.comprobarOrigen({ cert: 'certificado-sintetico' }), { origen: local.ORIGEN, tlsVerificado: true });
  assert.equal(opciones.hostname, '127.0.0.1');assert.equal(opciones.servername, 'localhost');
  assert.equal(opciones.rejectUnauthorized, true);assert.equal(opciones.ca, 'certificado-sintetico');assert.equal(opciones.path, '/');
});
test('TLS local: rechaza servidor distinto o respuesta inesperada', async t => {
  t.mock.method(https, 'get', (o, callback) => {
    queueMicrotask(() => callback({ statusCode: 200, headers: {}, resume() {} }));return new EventEmitter();
  });
  await assert.rejects(local.comprobarOrigen({ cert: 'fixture' }), /TLS_WEB_LOCAL_NO_VALIDADA/);
});
test('CLI local: certificado y argumentos no habilitan envío ni abren MongoDB', async t => {
  const mongoose = require('mongoose');
  const uri = require('../scripts/verificacionLocal').URI;
  const old = Object.fromEntries(['MONGODB_URI', 'GMAIL_CAMPAIGNS_ENABLED', 'AI_ENABLED'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { MONGODB_URI: uri, GMAIL_CAMPAIGNS_ENABLED: 'false', AI_ENABLED: 'false' });
  t.after(() => { for (const [k,v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  t.mock.method(local, 'configuracion', () => ({ cert: 'fixture' }));
  t.mock.method(require('../config/manifiestoPiloto'), 'cargarManifiesto', manifiesto);
  const mongo = t.mock.method(mongoose, 'createConnection', () => { throw Error('MONGO_PROHIBIDO'); });
  const web = t.mock.method(local, 'comprobarOrigen', () => { throw Error('RED_PROHIBIDA'); });
  assert.deepEqual(await require('../scripts/verificacionLocal').principal(['--certificado']), { certificadoLocalValido: true });
  await assert.rejects(require('../scripts/verificacionLocal').principal(['--enviar', '507f1f77bcf86cd799439011']), /ARGUMENTOS_INVALIDOS/);
  assert.equal(mongo.mock.callCount(), 0);assert.equal(web.mock.callCount(), 0);
});
