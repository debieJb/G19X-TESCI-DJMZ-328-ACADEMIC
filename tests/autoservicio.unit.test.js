const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const autoservicio = require('../services/autoservicioEmpresarialService');
const correo = require('../services/correoTransaccionalService');
const Solicitud = require('../models/SolicitudRegistro');
const Auditoria = require('../models/AuditoriaRegistro');

test('autoservicio: no acepta contraseña, rol ni empresa en la solicitud inicial', () => {
  for (const campo of ['password', 'rol', 'empresa', 'estado']) {
    assert.throws(() => autoservicio.validarSolicitud({ nombreEmpresa: 'Empresa', correo: 'persona@example.test', [campo]: 'dato' }), { codigo: 'DATOS_INVALIDOS' });
  }
  assert.equal(autoservicio.validarSolicitud({ nombreEmpresa: ' Empresa ', correo: ' PERSONA@EXAMPLE.TEST ' }).correo, 'persona@example.test');
});
test('autoservicio: enlace exige 256 bits aleatorios en formato canónico y devuelve hash', () => {
  const token = randomBytes(32).toString('base64url');
  assert.ok(/^[a-f0-9]{64}$/.test(autoservicio.tokenHash(token)));
  assert.ok(autoservicio.tokenHash(token) !== token);
  for (const dato of [undefined, {}, 'breve', token + '\n']) assert.throws(() => autoservicio.tokenHash(dato), { codigo: 'ENLACE_INVALIDO' });
});

test('autoservicio: trabajador dirigido rechaza IDs inválidos antes de acceder a MongoDB', async () => {
  const servicio = autoservicio.crearServicio({ conexion: null });
  for (const solicitudId of ['', {}, 'otra-base', 'f'.repeat(25)]) {
    await assert.rejects(servicio.despachar({ solicitudId }), { codigo: 'DATOS_INVALIDOS' });
  }
});
test('autoservicio: esquema rechaza secretos recuperables y no provisiona índices automáticamente', () => {
  for (const campo of ['password', 'token', 'enlace']) assert.throws(() => new Solicitud({ [campo]: 'dato' }), /strict/i);
  assert.equal(Solicitud.schema.options.autoIndex, false);
  assert.equal(Solicitud.schema.options.autoCreate, false);
  assert.throws(() => new Auditoria({ correo: 'persona@example.test' }), /strict/i);
});
test('autoservicio: standalone se rechaza antes de compilar modelos o escribir', async () => {
  let escrituras = 0;
  const conexion = { readyState: 1, db: { admin: () => ({ command: async () => ({ isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 27 }) }) },
    model: () => { escrituras++; } };
  await assert.rejects(autoservicio.preparar(conexion), { codigo: 'TRANSACCIONES_REQUERIDAS' });
  assert.equal(escrituras, 0);
});
test('correo transaccional: deshabilitado sin autorización incluso si se pasa transporte', () => {
  let llamadas = 0;
  assert.equal(correo.predeterminado.disponible, false);
  assert.equal(correo.crearCorreoTransaccional({ transporte: { enviar: () => { llamadas++; } } }).disponible, false);
  assert.equal(llamadas, 0);
});
test('correo transaccional: no acepta origen arbitrario ni remitente con inyección', () => {
  const base = { transporte: { enviar: async () => {} }, autorizado: true, simulado: true, remitente: 'registro@example.test', origenPublico: 'https://plataforma.example.test' };
  for (const origenPublico of ['http://plataforma.example.test', 'https://plataforma.example.test/ruta', 'https://plataforma.example.test/?x=1']) {
    assert.throws(() => correo.crearCorreoTransaccional({ ...base, origenPublico }), /ORIGEN_PUBLICO_INVALIDO/);
  }
  assert.throws(() => correo.crearCorreoTransaccional({ ...base, remitente: 'a@example.test\r\nBcc: b@example.test' }), /PROVEEDOR_INVALIDO/);
});
test('correo transaccional: simulación entrega únicamente al adaptador de prueba', async () => {
  const mensajes = [], token = randomBytes(32).toString('base64url');
  const adaptador = correo.crearCorreoTransaccional({ transporte: { enviar: async m => mensajes.push(m) }, autorizado: true, simulado: true,
    remitente: 'registro@example.test', origenPublico: 'https://plataforma.example.test' });
  await adaptador.enviarVerificacion({ correo: 'persona@example.test', token });
  assert.equal(mensajes.length, 1);
  assert.ok(mensajes[0].texto.includes('/registro/verificar?token='));
  assert.ok(mensajes[0].texto.includes(token));
});
test('correo transaccional: timeout aborta transporte y no afirma rechazo definitivo', async () => {
  let signal;
  const adaptador = correo.crearCorreoTransaccional({ transporte: { enviar: async (mensaje, opciones) => {
    signal = opciones.signal; return new Promise(() => {});
  } }, autorizado: true, simulado: true, timeoutMs: 5,
  remitente: 'registro@example.test', origenPublico: 'https://plataforma.example.test' });
  await assert.rejects(adaptador.enviarVerificacion({ correo: 'persona@example.test', token: randomBytes(32).toString('base64url') }), /ENTREGA_INCIERTA/);
  assert.equal(signal.aborted, true);
});

test('autoservicio: correo ya vinculado a usuario o solicitud no crea registros y no revela causa', async t => {
  const nombres = ['Empresa', 'Usuario', 'SolicitudRegistro', 'LimiteRegistro', 'AuditoriaRegistro'];
  let usuarioExiste = true, solicitudExiste = false, escrituras = 0;
  const consultas = [];
  const q = dato => ({ select() { return this; }, session: async () => dato });
  const modelos = Object.fromEntries(nombres.map(nombre => {
    const original = require('../models/' + nombre);
    return [nombre, class {
      static schema = original.schema;
      static collection = { listIndexes: () => ({ toArray: async () => original.schema.indexes().map(([key, opts]) => ({ key, ...opts })) }) };
      static findOne() { return q(null); }
      static exists(filtro) { consultas.push({ nombre, filtro }); return q(nombre === 'Usuario' ? usuarioExiste : solicitudExiste); }
      constructor() { escrituras++; throw Error('NO_CREAR_DUPLICADOS'); }
    }];
  }));
  const conexion = { models: modelos, readyState: 1, db: { admin: () => ({ command: async () => ({ isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, setName: 'simulado', maxWireVersion: 9 }) }) }, transaction: async fn => fn(null) };
  const enviarVerificacion = t.mock.fn(async () => assert.fail('No enviar a cuentas o solicitudes existentes'));
  const servicio = autoservicio.crearServicio({ conexion, correo: { disponible: true, enviarVerificacion } });
  const datos = { nombreEmpresa: 'Empresa', correo: ' PERSONA@EXAMPLE.TEST ' };
  const entrada = { datos, claveIdempotencia: 'clave-idempotente-solo-pruebas', ambito: 'sesion-de-prueba' };
  assert.equal(await servicio.solicitar(entrada), null);
  usuarioExiste = false; solicitudExiste = true;
  assert.equal(await servicio.solicitar(entrada), null);
  assert.equal(escrituras, 0);
  assert.equal(enviarVerificacion.mock.callCount(), 0);
  assert.ok(consultas.every(c => Object.values(c.filtro)[0] === 'persona@example.test'));
  assert.ok(consultas.some(c => c.nombre === 'SolicitudRegistro'));
});
