// Exclusivamente bases temporales propias en 27018; Gmail siempre simulado.
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const rs = require('../scripts/mongoDevRsComun');
const { crearMotor } = require('../services/motorEnviosGmailService');
const { obtenerPolitica } = require('../config/enviosGmail');
const google = require('../services/googleOAuthClienteService');
const cifrado = require('../services/cifradoCredencialesService');
const api = require('../services/gmailApiTransporteService');
const { passwordSintetica } = require('../tests/soporte/registroFixture');
mock.method(global, 'fetch', () => { throw Error('RED_REAL_PROHIBIDA'); });
before(async () => { const c = await rs.conectar(); try { await rs.verificar(c); await rs.compararOriginal(); } finally { await c.close(); } });
after(async () => { await rs.compararOriginal(); assert.equal(mongoose.connection.readyState, 0); });
const fixture = async (t, manual = false) => {
  const base = 'ma_tx_test_' + randomUUID().replaceAll('-', ''), marca = randomUUID();
  const conexion = await mongoose.createConnection(rs.URI, { dbName: base, autoIndex: false, autoCreate: false }).asPromise();
  t.after(async () => {
    try {
      const c = await rs.conectar(); try { await rs.verificar(c); } finally { await c.close(); }
      assert.match(conexion.name, /^ma_tx_test_[a-f0-9]{32}$/);
      assert.ok((await conexion.db.collection('control').findOne({ _id: 'fixture' }))?.marca === marca);
      await conexion.dropDatabase();
    } finally { await conexion.close(); }
  });
  await conexion.db.collection('control').insertOne({ _id: 'fixture', marca });
  const m = {};
  for (const n of ['Empresa', 'Usuario', 'Contacto', 'Campana', 'ConexionGmail', 'EjecucionGmail', 'EnvioGmail', 'ControlEnvioGmail', 'AutorizacionPilotoGmail']) {
    m[n] = conexion.model(n, require(`../models/${n}`).schema.clone().set('autoCreate', false).set('autoIndex', false));
    await m[n].createCollection(); await m[n].createIndexes();
  }
  const anterior = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  t.after(() => { if (anterior === undefined) delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY; else process.env.GMAIL_TOKEN_ENCRYPTION_KEY = anterior; });
  const config = { hash: google.hash(randomUUID()), clientId: 'cliente-sintetico.apps.googleusercontent.com' };
  t.mock.method(google, 'configuracion', () => config);
  const renovacion = { llamadas: 0, ejecutar: async () => ({ credentials: { access_token: randomBytes(32).toString('base64url'),
    token_type: 'Bearer', expiry_date: Date.now() + 7200000 } }) };
  t.mock.method(google, 'crearCliente', () => ({ setCredentials: () => {}, refreshAccessToken: async () => {
    renovacion.llamadas++; return renovacion.ejecutar();
  } }));
  const empresa = new m.Empresa({ ...(manual ? { _id: require('../services/pilotoManualGmailService').EMPRESA } : {}), nombre: 'Empresa de prueba', estado: 'activa', estadoActivacion: 'verificada',
    correoAutomatizaciones: 'empresa@example.test', versionAlta: 1 }); await empresa.save();
  const usuario = new m.Usuario({ nombre: 'Administrador', email: 'admin@example.test', password: passwordSintetica(),
    rol: 'admin_empresa', empresa: empresa._id, estadoAcceso: 'activo', emailVerificadoEn: new Date(Date.now() - 1000) }); await usuario.save();
  const contacto = new m.Contacto({ nombre: 'Destinatario', email: 'destinatario@example.test', empresa: empresa._id,
    activo: true, canales: { email: true }, consentimientoMarketing: { estado: 'otorgado', fecha: new Date(Date.now() - 1000), fuente: 'Formulario de prueba',
      registradoPor: usuario._id, registradoEn: new Date(Date.now() - 1000), emailHash: require('../services/consentimientoContactoService').huellaEmail('destinatario@example.test') } }); await contacto.save();
  const campana = new m.Campana({ nombre: 'Campaña de prueba', objetivo: 'Prueba sin envío real', empresa: empresa._id, creadoPor: usuario._id,
    canal: 'email', estado: 'borrador', versionFlujo: 2, asunto: 'Asunto ágil', cuerpoTexto: 'Contenido de prueba',
    destinatarios: { tipo: 'contactos', contactos: [contacto._id] }, automatizacion: { modo: 'inmediato', estado: 'preparada', revision: 1 } }); await campana.save();
  campana.estado = 'activa'; await campana.save();
  const cuenta = new m.ConexionGmail({ empresa: empresa._id, googleSub: randomUUID(), email: empresa.correoAutomatizaciones,
    estado: 'conectada', scopes: [google.GMAIL_SEND], clienteOAuthHash: config.hash, versionConexion: 1, expiraEn: new Date(Date.now() + 7200000),
    accessTokenCifrado: cifrado.cifrar(randomBytes(32).toString('base64url'), String(empresa._id), 'access'),
    refreshTokenCifrado: cifrado.cifrar(randomBytes(32).toString('base64url'), String(empresa._id), 'refresh') }); await cuenta.save();
  let ahora = new Date(); const llamadas = [];
  const simulador = { enviar: async datos => { llamadas.push(datos); return { gmailId: `gmail-${llamadas.length}`, threadId: `thread-${llamadas.length}` }; } };
  const politica = { ...obtenerPolitica(), habilitado: true, empresas: [String(empresa._id)], intervaloEmpresaMs: 0, intervaloGlobalMs: 0 };
  if (manual) t.mock.method(require('../services/pilotoManualGmailService'), 'verificar', async () => {});
  const motor = crearMotor({ conexion, manualSupervisado: manual, politica: () => politica, simulador, reloj: () => ahora });
  const entrada = { actorId: String(usuario._id), campanaId: String(campana._id), claveIdempotencia: randomBytes(24).toString('base64url') };
  await motor.autorizarPiloto(entrada);
  const encolar = async () => { await motor.encolar(entrada); return m.EnvioGmail.findOne({}).lean(); };
  return { conexion, m, empresa, usuario, contacto, campana, cuenta, motor, entrada, encolar, llamadas, simulador, renovacion, politica,
    avanzar: ms => { ahora = new Date(+ahora + ms); } };
};

const fixtureAutomatico = async t => {
  const f = await fixture(t);
  f.politica.automatico = true; f.politica.maxDestinatarios = 50;
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  return f;
};

test('Gmail DB: borrador nunca encola y pausa posterior cancela antes de red', async t => {
  const f = await fixtureAutomatico(t);
  await f.m.Campana.updateOne({ _id: f.campana._id }, { estado: 'borrador' });
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'CAMPANA_NO_PREPARADA' });
  assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
  await f.m.Campana.updateOne({ _id: f.campana._id }, { estado: 'activa' });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  await f.motor.encolar(f.entrada);
  await f.m.Campana.updateOne({ _id: f.campana._id }, { estado: 'pausada' });
  await f.motor.procesarPendientes();
  assert.equal(f.llamadas.length, 0); assert.equal((await f.m.EnvioGmail.findOne()).estado, 'cancelado');
});

test('Gmail DB: límite unitario rechaza varios contactos antes de crear trabajos', async t => {
  const f = await fixtureAutomatico(t); f.politica.maxDestinatarios = 1;
  const otro = await f.m.Contacto.create({ ...f.contacto.toObject(), _id: new mongoose.Types.ObjectId(), email: 'otro@example.test' });
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'destinatarios.contactos': [f.contacto._id, otro._id] });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'PILOTO_REQUIERE_UN_CONTACTO' });
  await f.m.Campana.updateOne({ _id: f.campana._id }, { destinatarios: { tipo: 'todos', contactos: [], etiquetas: [] } });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'PILOTO_REQUIERE_UN_CONTACTO' });
  assert.equal(await f.m.EnvioGmail.countDocuments(), 0); assert.equal(f.llamadas.length, 0);
});

test('automático DB: trabajador residente consume sin llamada manual y termina ordenadamente', async t => {
  const f = await fixtureAutomatico(t); await f.motor.encolar(f.entrada);
  let completar; const procesado = new Promise(r => { completar = r; });
  const enviar = f.simulador.enviar;
  f.simulador.enviar = async d => { const r = await enviar(d); completar(); return r; };
  const worker = require('../services/trabajadorCampanasService').iniciar({ motor: f.motor, intervaloMs: 10 });
  try {
    const limite = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('WORKER_NO_CONSUMIO')), 5000); t.after(() => clearTimeout(timer)); });
    await Promise.race([procesado, limite]);
  } finally { await worker.detener(); }
  assert.equal((await f.m.EnvioGmail.findOne()).estado, 'aceptado'); assert.equal(f.llamadas.length, 1);
});

test('automático DB: límite por campaña rechaza 51 contactos antes de persistir', async t => {
  const f = await fixtureAutomatico(t);
  const contactos = await f.m.Contacto.insertMany(Array.from({ length: 51 }, (_, i) => ({ empresa: f.empresa._id,
    nombre: `Sintético ${i}`, email: `sintetico${i}@example.test`, activo: true, canales: { email: true },
    consentimientoMarketing: { estado: 'otorgado', fuente: 'Prueba', fecha: new Date(Date.now() - 1000) } })));
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'destinatarios.contactos': contactos.map(c => c._id) });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'DESTINATARIOS_INVALIDOS' }); assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
});

test('automático DB: varios contactos, duplicados, inactivos y fallo parcial quedan separados', async t => {
  const f = await fixtureAutomatico(t), ids = [f.contacto._id, f.contacto._id];
  for (const [email, activo, estado] of [['segundo@example.test', true, 'otorgado'], ['inactivo@example.test', false, 'otorgado'], ['baja@example.test', true, 'revocado']]) {
    const c = await f.m.Contacto.create({ empresa: f.empresa._id, nombre: 'Contacto sintético', email, activo, canales: { email: true },
      consentimientoMarketing: { estado, fuente: 'Prueba', fecha: new Date(Date.now() - 1000) } }); ids.push(c._id);
  }
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'destinatarios.contactos': ids });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  assert.equal((await f.motor.encolar(f.entrada)).total, 2);
  f.simulador.enviar = async datos => { f.llamadas.push(datos); if (f.llamadas.length === 2) throw new api.ErrorEnvioGmail('RECHAZO_PROVEEDOR', false); return { gmailId: 'primero', threadId: 'primero' }; };
  await f.motor.procesarPendientes();
  const estados = (await f.motor.consultar(f.entrada)).envios.map(e => e.estado).sort();
  assert.deepEqual(estados, ['aceptado', 'rechazado']); assert.equal(f.llamadas.length, 2);
});

test('automático DB: contacto de otra empresa en selección mixta rechaza toda confirmación', async t => {
  const f = await fixtureAutomatico(t);
  const ajeno = await f.m.Contacto.create({ empresa: new mongoose.Types.ObjectId(), nombre: 'Ajeno', email: 'ajeno@example.test' });
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'destinatarios.contactos': [f.contacto._id, ajeno._id] });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'DESTINATARIOS_INVALIDOS' }); assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
});

test('automático DB: recuperación de reserva anterior a red y modo piloto nunca se mezcla', async t => {
  const f = await fixtureAutomatico(t); await f.motor.encolar(f.entrada);
  await f.m.EnvioGmail.updateOne({}, { estado: 'reservado', reservaHasta: new Date(0), reservaHash: 'reserva-prueba' });
  await f.motor.recuperarInciertos(); assert.equal((await f.m.EnvioGmail.findOne()).estado, 'pendiente');
  await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 1);
  f.politica.automatico = false; f.politica.maxDestinatarios = 1;
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'IDEMPOTENCIA_CONFLICTO' });
});

test('automático DB: Gmail distinto al correo de registro, inmediato e historial persistente', async t => {
  const f = await fixtureAutomatico(t);
  await f.m.Empresa.updateOne({ _id: f.empresa._id }, { correoAutomatizaciones: 'registro@example.test' });
  await f.motor.encolar(f.entrada);
  assert.equal(f.llamadas.length, 0);
  assert.equal((await f.motor.procesarPendientes()).procesados, 1);
  const historial = await f.motor.consultar(f.entrada);
  assert.equal(historial.envios[0].estado, 'aceptado'); assert.equal(f.llamadas.length, 1);
  await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 1);
});

test('automático DB: fecha futura sobrevive reinicio de motor y doble consumidor no duplica', async t => {
  const f = await fixtureAutomatico(t), fecha = new Date(Date.now() + 3600000);
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'automatizacion.modo': 'programado', 'automatizacion.fechaProgramada': fecha });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  await f.motor.encolar(f.entrada); await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 0);
  f.avanzar(3601000);
  const nuevo = crearMotor({ conexion: f.conexion, politica: () => f.politica, simulador: f.simulador, reloj: () => new Date(+fecha + 1000) });
  await Promise.all([f.motor.procesarPendientes(), nuevo.procesarPendientes()]);
  assert.equal(f.llamadas.length, 1);
});

test('automático DB: revisión antigua y otra empresa no confirman', async t => {
  const f = await fixtureAutomatico(t);
  await assert.rejects(f.motor.encolar({ ...f.entrada, revision: 'a'.repeat(64) }), { codigo: 'IDEMPOTENCIA_CONFLICTO' });
  await f.m.Usuario.collection.updateOne({ _id: f.usuario._id }, { $set: { empresa: new mongoose.Types.ObjectId() } });
  await assert.rejects(f.motor.encolar(f.entrada)); assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
});

test('automático DB: desconexión suspende cola y reconexión de misma identidad permite continuar', async t => {
  const f = await fixtureAutomatico(t); await f.motor.encolar(f.entrada);
  await f.m.ConexionGmail.updateOne({ empresa: f.empresa._id }, { estado: 'requiere_reconexion' });
  await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 0);
  assert.equal((await f.m.EnvioGmail.findOne()).estado, 'pendiente');
  await f.m.ConexionGmail.updateOne({ empresa: f.empresa._id }, { estado: 'conectada' });
  await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 1);
});

test('automático DB: cuota rechazada reintenta con espera; timeout queda incierto sin segundo POST', async t => {
  const f = await fixtureAutomatico(t); await f.motor.encolar(f.entrada);
  f.simulador.enviar = async () => { f.llamadas.push({}); throw new api.ErrorEnvioGmail('CUOTA_PROVEEDOR', false); };
  await f.motor.procesarPendientes(); assert.equal((await f.m.EnvioGmail.findOne()).estado, 'pendiente');
  await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 1);
  f.avanzar(16 * 60000);
  f.simulador.enviar = async () => { f.llamadas.push({}); throw new api.ErrorEnvioGmail('TIMEOUT', true); };
  await f.motor.procesarPendientes(); assert.equal((await f.m.EnvioGmail.findOne()).estado, 'incierto');
  f.avanzar(3600000); await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 2);
  const envio = await f.m.EnvioGmail.findOne(); assert.equal(envio.historial.length, 2);
  assert.deepEqual(envio.historial.map(h => h.codigo), ['CUOTA_PROVEEDOR', 'TIMEOUT']);
});

test('automático DB: baja posterior a confirmación impide envío y operador conserva permisos efectivos', async t => {
  const f = await fixtureAutomatico(t);
  await f.m.Usuario.collection.updateOne({ _id: f.usuario._id }, { $set: { rol: 'operador' } });
  await f.motor.encolar(f.entrada);
  await f.m.Contacto.updateOne({ _id: f.contacto._id }, { 'consentimientoMarketing.estado': 'revocado' });
  await f.motor.procesarPendientes(); assert.equal(f.llamadas.length, 0);
  assert.equal((await f.m.EnvioGmail.findOne()).estado, 'cancelado');
});
test('Gmail real DB: éxito guarda aceptación e identificadores sin declarar entrega ni persistir MIME/tokens', async t => {
  const f = await fixture(t), envio = await f.encolar();
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'aceptado');
  const guardado = await f.m.EnvioGmail.findById(envio._id).lean();
  assert.equal(guardado.gmailId, 'gmail-1'); assert.equal(guardado.codigo, 'ACEPTADO_API'); assert.equal(guardado.intentos, 1);
  assert.equal(guardado.entregado, undefined); assert.equal(guardado.raw, undefined); assert.equal(guardado.accessToken, undefined);
  const texto = Buffer.from(f.llamadas[0].raw, 'base64url').toString('utf8');
  assert.ok(texto.includes('From: empresa@example.test')); assert.ok(texto.includes('To: destinatario@example.test'));
});
test('Gmail real DB: encolado concurrente e idempotente y claves distintas no duplican', async t => {
  const f = await fixture(t);
  const r = await Promise.all([f.motor.encolar(f.entrada), f.motor.encolar(f.entrada)]);
  assert.equal(r[0].ejecucion, r[1].ejecucion);
  await assert.rejects(f.motor.encolar({ ...f.entrada, claveIdempotencia: randomBytes(24).toString('base64url') }), { codigo: 'IDEMPOTENCIA_CONFLICTO' });
  assert.equal(await f.m.EnvioGmail.countDocuments(), 1);
});
test('Gmail real DB: concurrencia de consumidores y repetición después de aceptar producen un único POST', async t => {
  const f = await fixture(t), envio = await f.encolar(), id = String(envio._id);
  await Promise.allSettled([f.motor.procesarUno(id), f.motor.procesarUno(id)]);
  await f.motor.procesarUno(id);
  assert.equal(f.llamadas.length, 1); assert.equal((await f.m.EnvioGmail.findById(id)).intentos, 1);
});
test('Gmail real DB: bloqueo predeterminado y empresa no autorizada no escriben ejecución', async t => {
  const f = await fixture(t); f.politica.habilitado = false;
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'ENVIOS_BLOQUEADOS' });
  f.politica.habilitado = true; f.politica.empresas = [];
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'ENVIOS_BLOQUEADOS' });
  assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
});
test('Gmail real DB: identidad remitente debe coincidir y quedar fijada a la autorización', async t => {
  const f = await fixture(t);
  await f.m.Empresa.updateOne({ _id: f.empresa._id }, { correoAutomatizaciones: 'otra@example.test' });
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'REMITENTE_NO_COINCIDE' });
  await f.m.Empresa.updateOne({ _id: f.empresa._id }, { correoAutomatizaciones: 'empresa@example.test' });
  const envio = await f.encolar();
  await f.m.ConexionGmail.updateOne({ empresa: f.empresa._id }, { googleSub: randomUUID() });
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'cancelado'); assert.equal(f.llamadas.length, 0);
});
test('Gmail real DB: campaña, contacto y actor de otra empresa no autorizan escrituras ni envío', async t => {
  const f = await fixture(t), otra = new mongoose.Types.ObjectId();
  await f.m.Usuario.collection.updateOne({ _id: f.usuario._id }, { $set: { empresa: otra } });
  await assert.rejects(f.motor.encolar(f.entrada));
  await f.m.Usuario.collection.updateOne({ _id: f.usuario._id }, { $set: { empresa: f.empresa._id } });
  const envio = await f.encolar();
  await f.m.Contacto.collection.updateOne({ _id: f.contacto._id }, { $set: { empresa: otra } });
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'cancelado'); assert.equal(f.llamadas.length, 0);
});
for (const campo of ['consentimiento', 'inactivo', 'actor', 'empresa', 'contenido', 'revocacion']) {
  test(`Gmail real DB: revalidación de ${campo} tras encolar cancela antes de red`, async t => {
    const f = await fixture(t), envio = await f.encolar();
    if (campo === 'consentimiento') await f.m.Contacto.updateOne({ _id: f.contacto._id }, { 'consentimientoMarketing.estado': 'revocado' });
    if (campo === 'inactivo') await f.m.Contacto.updateOne({ _id: f.contacto._id }, { activo: false });
    if (campo === 'actor') await f.m.Usuario.updateOne({ _id: f.usuario._id }, { estadoAcceso: 'bloqueado' });
    if (campo === 'empresa') await f.m.Empresa.updateOne({ _id: f.empresa._id }, { estado: 'inactiva' });
    if (campo === 'contenido') await f.m.Campana.updateOne({ _id: f.campana._id }, { cuerpoTexto: 'Modificado' });
    if (campo === 'revocacion') await f.m.ConexionGmail.updateOne({ _id: f.cuenta._id }, { estado: 'revocacion_pendiente' });
    assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'cancelado'); assert.equal(f.llamadas.length, 0);
  });
}
test('Gmail real DB: renovación controlada revalida consentimiento después de esperar Google', async t => {
  const f = await fixture(t), envio = await f.encolar();
  await f.m.ConexionGmail.updateOne({ _id: f.cuenta._id }, { expiraEn: new Date(0) });
  f.renovacion.ejecutar = async () => {
    await f.m.Contacto.updateOne({ _id: f.contacto._id }, { 'consentimientoMarketing.estado': 'revocado' });
    return { credentials: { access_token: randomBytes(32).toString('base64url'), token_type: 'Bearer', expiry_date: Date.now() + 7200000 } };
  };
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'cancelado');
  assert.equal(f.renovacion.llamadas, 1); assert.equal(f.llamadas.length, 0);
});
test('Gmail real DB: invalid_grant exige reconexión y no intenta envío', async t => {
  const f = await fixture(t), envio = await f.encolar();
  await f.m.ConexionGmail.updateOne({ _id: f.cuenta._id }, { expiraEn: new Date(0) });
  f.renovacion.ejecutar = async () => { throw { response: { data: { error: 'invalid_grant' } } }; };
  const r = await f.motor.procesarUno(String(envio._id));
  assert.equal(r.codigo, 'REAUTORIZAR'); assert.equal(f.llamadas.length, 0);
  assert.equal((await f.m.ConexionGmail.findById(f.cuenta._id)).estado, 'requiere_reconexion');
});
test('Gmail real DB: token próximo a caducar se renueva una vez y se persiste cifrado', async t => {
  const f = await fixture(t), envio = await f.encolar();
  await f.m.ConexionGmail.updateOne({ _id: f.cuenta._id }, { expiraEn: new Date(0) });
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'aceptado');
  assert.equal(f.renovacion.llamadas, 1); assert.equal(f.llamadas.length, 1);
  const cuenta = await f.m.ConexionGmail.findById(f.cuenta._id).select('+accessTokenCifrado');
  assert.ok(cuenta.accessTokenCifrado !== f.llamadas[0].accessToken);
  assert.ok(cuenta.renovadoEn instanceof Date);
});
test('Gmail real DB: 401 atrasado no deshabilita una autorización más reciente', async t => {
  const f = await fixture(t), envio = await f.encolar();
  f.simulador.enviar = async () => {
    await f.m.ConexionGmail.updateOne({ _id: f.cuenta._id }, { $inc: { versionConexion: 1 } });
    throw new api.ErrorEnvioGmail('REAUTORIZAR', false);
  };
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'rechazado');
  assert.equal((await f.m.ConexionGmail.findById(f.cuenta._id)).estado, 'conectada');
});
test('Gmail real DB: dos campanas unitarias comparten exclusion y cuota empresarial', async t => {
  const f = await fixture(t);
  await f.m.Contacto.create({ nombre: 'Segundo', email: 'segundo@example.test', empresa: f.empresa._id, activo: true, canales: { email: true },
    consentimientoMarketing: { estado: 'otorgado', fecha: new Date(0), fuente: 'Formulario de prueba' } });
  const segunda = await f.m.Campana.create({ ...f.campana.toObject(), _id: new mongoose.Types.ObjectId(), nombre: 'Segunda', estado: 'borrador' });
  segunda.estado = 'activa'; await segunda.save();
  const entradaSegunda = { ...f.entrada, campanaId: String(segunda._id), claveIdempotencia: randomBytes(24).toString('base64url') };
  await f.motor.autorizarPiloto(entradaSegunda); await f.motor.encolar(entradaSegunda);
  await f.motor.encolar(f.entrada); const envios = await f.m.EnvioGmail.find({}).lean();
  let avisar, liberar;
  const iniciado = new Promise(resolve => { avisar = resolve; }), barrera = new Promise(resolve => { liberar = resolve; });
  f.simulador.enviar = async datos => { f.llamadas.push(datos); avisar(); await barrera; return { gmailId: 'gmail-exclusion', threadId: 'thread-exclusion' }; };
  const primero = f.motor.procesarUno(String(envios[0]._id)); await iniciado;
  try { await assert.rejects(f.motor.procesarUno(String(envios[1]._id)), { codigo: 'OCUPADO' }); }
  finally { liberar(); }
  await primero;
  assert.equal(f.llamadas.length, 1);
  assert.equal((await f.m.ControlEnvioGmail.findById(`empresa:${f.empresa._id}`)).usadosDia, 1);
});
for (const [codigo, incierto, estado] of [['REAUTORIZAR', false, 'rechazado'], ['CUOTA_PROVEEDOR', false, 'rechazado'], ['TIMEOUT', true, 'incierto'], ['RECHAZO_PROVEEDOR', true, 'incierto']]) {
  test(`Gmail real DB: ${codigo} queda ${estado} sin reintento`, async t => {
    const f = await fixture(t), envio = await f.encolar(); let llamadas = 0;
    f.simulador.enviar = async () => { llamadas++; throw new api.ErrorEnvioGmail(codigo, incierto); };
    assert.equal((await f.motor.procesarUno(String(envio._id))).estado, estado);
    assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'sin_accion'); assert.equal(llamadas, 1);
  });
}
test('Gmail real DB: cuota local persistente y velocidad bloquean otro trabajo sin perderlo', async t => {
  const f = await fixture(t);
  await f.m.Contacto.create({ nombre: 'Segundo', email: 'segundo@example.test', empresa: f.empresa._id, activo: true, canales: { email: true },
    consentimientoMarketing: { estado: 'otorgado', fecha: new Date(0), fuente: 'Formulario de prueba' } });
  const segunda = await f.m.Campana.create({ ...f.campana.toObject(), _id: new mongoose.Types.ObjectId(), nombre: 'Segunda', estado: 'borrador' });
  segunda.estado = 'activa'; await segunda.save();
  const entradaSegunda = { ...f.entrada, campanaId: String(segunda._id), claveIdempotencia: randomBytes(24).toString('base64url') };
  await f.motor.autorizarPiloto(entradaSegunda); await f.motor.encolar(entradaSegunda);
  f.politica.cuotaDiaEmpresa = 1; f.politica.intervaloEmpresaMs = 2000;
  await f.motor.encolar(f.entrada); const envios = await f.m.EnvioGmail.find({}).lean();
  await f.motor.procesarUno(String(envios[0]._id));
  await assert.rejects(f.motor.procesarUno(String(envios[1]._id)), { codigo: 'VELOCIDAD' });
  f.avanzar(3000);
  await assert.rejects(f.motor.procesarUno(String(envios[1]._id)), { codigo: 'CUOTA_LOCAL' });
  assert.equal((await f.m.EnvioGmail.findById(envios[1]._id)).estado, 'pendiente'); assert.equal(f.llamadas.length, 1);
});
test('Gmail real DB: reserva abandonada se marca incierta y jamás se vuelve a enviar', async t => {
  const f = await fixture(t), envio = await f.encolar();
  await f.m.EnvioGmail.updateOne({ _id: envio._id }, { estado: 'enviando', reservaHasta: new Date(0), intentos: 1 });
  assert.equal((await f.motor.recuperarInciertos()).inciertos, 1);
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'sin_accion'); assert.equal(f.llamadas.length, 0);
});
test('Gmail real DB: fallo persistiendo aceptación no repite POST y se recupera como incierto', async t => {
  const f = await fixture(t), envio = await f.encolar(), update = f.m.EnvioGmail.updateOne.bind(f.m.EnvioGmail);
  const falla = t.mock.method(f.m.EnvioGmail, 'updateOne', (filtro, cambios, opciones) => {
    if (cambios.$set?.estado === 'aceptado') throw Error('FALLO_SINTETICO'); return update(filtro, cambios, opciones);
  });
  await assert.rejects(f.motor.procesarUno(String(envio._id))); falla.mock.restore();
  assert.equal(f.llamadas.length, 1); f.avanzar(180000); await f.motor.recuperarInciertos();
  await f.motor.procesarUno(String(envio._id)); assert.equal(f.llamadas.length, 1);
  assert.equal((await f.m.EnvioGmail.findById(envio._id)).estado, 'incierto');
});
test('Gmail real DB: estado consultable tras revocar cuenta y apagar bandera', async t => {
  const f = await fixture(t), envio = await f.encolar(); await f.motor.procesarUno(String(envio._id));
  f.politica.habilitado = false;
  await f.m.ConexionGmail.updateOne({ _id: f.cuenta._id }, { estado: 'desconectada' });
  const estado = await f.motor.consultar(f.entrada); assert.equal(estado.envios[0].estado, 'aceptado');
});
test('piloto DB: preparacion con envio apagado no permite procesar hasta habilitacion independiente', async t => {
  const f = await fixture(t); f.politica.habilitado = false; f.politica.preparacionPiloto = true;
  const a = await f.motor.autorizarPiloto(f.entrada), b = await f.motor.autorizarPiloto(f.entrada);
  assert.equal(a.autorizacion, b.autorizacion); assert.equal(+a.expiraEn, +b.expiraEn);
  const envio = await f.encolar();
  await assert.rejects(f.motor.procesarUno(String(envio._id)), { codigo: 'ENVIOS_BLOQUEADOS' });
  assert.equal(f.llamadas.length, 0); assert.equal((await f.m.AutorizacionPilotoGmail.findOne({})).estado, 'autorizada');
});
test('piloto DB: caducidad no se renueva ni permite POST', async t => {
  const f = await fixture(t), envio = await f.encolar(); f.avanzar(600001);
  await assert.rejects(f.motor.autorizarPiloto(f.entrada), { codigo: 'AUTORIZACION_PILOTO_INVALIDA' });
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'cancelado'); assert.equal(f.llamadas.length, 0);
});
test('piloto DB: concurrencia consume una autorizacion y un solo intento', async t => {
  const f = await fixture(t), envio = await f.encolar();
  await Promise.allSettled([1, 2, 3].map(() => f.motor.procesarUno(String(envio._id))));
  const a = await f.m.AutorizacionPilotoGmail.findOne({});
  assert.equal(a.estado, 'consumida'); assert.ok(String(a.envio) === String(envio._id)); assert.equal(f.llamadas.length, 1);
  await assert.rejects(f.motor.autorizarPiloto(f.entrada), { codigo: 'AUTORIZACION_PILOTO_INVALIDA' });
});
test('piloto DB: sin autorizacion persistida o revocada no envia', async t => {
  const f = await fixture(t), envio = await f.encolar();
  await f.motor.revocarPiloto(f.entrada);
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'cancelado'); assert.equal(f.llamadas.length, 0);
});
test('piloto DB: operador y administrador ajeno no autorizan', async t => {
  const f = await fixture(t); await f.m.Usuario.updateOne({ _id: f.usuario._id }, { rol: 'operador' });
  await assert.rejects(f.motor.autorizarPiloto(f.entrada), { codigo: 'ACCESO_DENEGADO' });
  await f.m.Usuario.collection.updateOne({ _id: f.usuario._id }, { $set: { rol: 'admin_empresa', empresa: new mongoose.Types.ObjectId() } });
  await assert.rejects(f.motor.autorizarPiloto(f.entrada)); assert.equal(f.llamadas.length, 0);
});
test('piloto DB: todos, etiquetas y multiples contactos quedan rechazados antes de encolar', async t => {
  const f = await fixture(t);
  for (const d of [{ tipo: 'todos' }, { tipo: 'etiquetas', etiquetas: ['prueba'] },
    { tipo: 'contactos', contactos: [f.contacto._id, new mongoose.Types.ObjectId()] }]) {
    await f.m.Campana.updateOne({ _id: f.campana._id }, { destinatarios: d });
    await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'PILOTO_REQUIERE_UN_CONTACTO' });
    await assert.rejects(f.motor.autorizarPiloto(f.entrada), { codigo: 'PILOTO_REQUIERE_UN_CONTACTO' });
  }
  assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
});
test('piloto DB: incierto consume permiso y nunca habilita nuevo intento', async t => {
  const f = await fixture(t), envio = await f.encolar();
  f.simulador.enviar = async () => { f.llamadas.push({}); throw new api.ErrorEnvioGmail('TIMEOUT', true); };
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'incierto');
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'sin_accion');
  await assert.rejects(f.motor.autorizarPiloto(f.entrada));
  assert.equal((await f.m.AutorizacionPilotoGmail.findOne({})).estado, 'consumida'); assert.equal(f.llamadas.length, 1);
});
test('piloto DB: revocacion durante renovacion impide POST aunque permiso ya este consumido', async t => {
  const f = await fixture(t), envio = await f.encolar();
  await f.m.ConexionGmail.updateOne({ _id: f.cuenta._id }, { expiraEn: new Date(0) });
  f.renovacion.ejecutar = async () => {
    await f.motor.revocarPiloto(f.entrada);
    return { credentials: { access_token: randomBytes(32).toString('base64url'), token_type: 'Bearer', expiry_date: Date.now() + 7200000 } };
  };
  assert.equal((await f.motor.procesarUno(String(envio._id))).estado, 'cancelado'); assert.equal(f.llamadas.length, 0);
});
test('consentimiento DB: captura por CRUD, conflicto concurrente y revocacion persisten en la empresa propia', async t => {
  const f = await fixture(t), anterior = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  t.after(() => { if (anterior === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = anterior; });
  const Contacto = require('../models/Contacto');
  t.mock.method(Contacto, 'findOne', filtro => f.m.Contacto.findOne(filtro));
  const usuario = { ...f.usuario.toObject(), empresa: f.empresa.toObject() };
  const c = require('../tests/soporte/sesion').crearContexto(t, usuario), ruta = `/contactos/${f.contacto._id}/editar`;
  const datos = { nombre: 'Destinatario', email: f.contacto.email, canales: { email: 'true' }, accionConsentimiento: 'otorgar',
    fechaConsentimiento: new Date(Date.now() - 1000).toISOString(), fuenteConsentimiento: 'Acta sintetica HTTP', confirmarConsentimiento: 'true' };
  await c.cliente.post(ruta).send(datos).expect(303);
  const doc = await f.m.Contacto.findById(f.contacto._id);
  assert.equal(doc.historialConsentimiento.length, 1); assert.ok(String(doc.consentimientoMarketing.registradoPor) === String(f.usuario._id));
  const atrasado = await f.m.Contacto.findById(f.contacto._id);
  await c.cliente.post(ruta).send({ ...datos, accionConsentimiento: 'revocar', fuenteConsentimiento: 'Revocacion sintetica' }).expect(303);
  atrasado.nombre = 'Escritura atrasada'; await assert.rejects(atrasado.save(), { name: 'VersionError' });
  const revocado = await f.m.Contacto.findById(f.contacto._id);
  assert.equal(revocado.consentimientoMarketing.estado, 'revocado'); assert.equal(revocado.historialConsentimiento.length, 2);
  const ajeno = await f.m.Contacto.create({ nombre: 'Ajeno', empresa: new mongoose.Types.ObjectId(), email: 'ajeno@example.test' });
  await c.cliente.post(`/contactos/${ajeno._id}/editar`).send(datos).expect(404);
  assert.equal((await f.m.Contacto.findById(ajeno._id)).historialConsentimiento.length, 0);
});

for (const estado of ['aceptado', 'rechazado', 'incierto']) {
  test('manual navegador DB: ' + estado + ' persiste y repetir no vuelve a enviar', async t => {
    const f = await fixture(t, true);
    if (estado !== 'aceptado') f.simulador.enviar = async () => {
      f.llamadas.push({}); throw new api.ErrorEnvioGmail(estado === 'rechazado' ? 'RECHAZO_PROVEEDOR' : 'TIMEOUT', estado === 'incierto');
    };
    const r = await f.motor.despacharManual(f.entrada);
    assert.equal(r.envios[0].estado, estado);
    assert.equal(r.envios[0].intentos, 1);
    assert.equal(r.envios[0].historial.at(-1).estado, estado);
    await f.motor.despacharManual(f.entrada);
    assert.equal(f.llamadas.length, 1);
    assert.ok(await f.m.ControlEnvioGmail.findById('piloto-manual:' + f.empresa._id));
    const otra = f.campana.toObject(); delete otra._id; delete otra.createdAt; delete otra.updatedAt;
    otra.estado = 'borrador';
    const c = await f.m.Campana.create(otra); c.estado = 'activa'; await c.save();
    const entrada = { ...f.entrada, campanaId: String(c._id), claveIdempotencia: randomBytes(24).toString('base64url') };
    await assert.rejects(f.motor.autorizarPiloto(entrada), { codigo: 'PILOTO_AGOTADO' });
    assert.equal(f.llamadas.length, 1);
  });
}
test('manual navegador DB: confirmaciones simultaneas reservan un solo POST', async t => {
  const f = await fixture(t, true);
  await Promise.allSettled([f.motor.despacharManual(f.entrada), f.motor.despacharManual(f.entrada)]);
  assert.equal(f.llamadas.length, 1);
  assert.equal(await f.m.EnvioGmail.countDocuments(), 1);
});
test('manual navegador DB: empresa distinta bloqueada antes de persistir', async t => {
  const f = await fixture(t, true);
  f.politica.empresas = [String(new mongoose.Types.ObjectId())];
  await assert.rejects(f.motor.despacharManual(f.entrada), { codigo: 'ENVIOS_BLOQUEADOS' });
  assert.equal(f.llamadas.length, 0);
});

test('manual navegador DB: consulta tras fallo de persistencia registra incierto sin reenviar', async t => {
  const f = await fixture(t, true), update = f.m.EnvioGmail.updateOne.bind(f.m.EnvioGmail);
  const falla = t.mock.method(f.m.EnvioGmail, 'updateOne', (filtro, cambios, opciones) => {
    if (cambios.$set?.estado === 'aceptado') throw Error('FALLO_SINTETICO'); return update(filtro, cambios, opciones);
  });
  await assert.rejects(f.motor.despacharManual(f.entrada)); falla.mock.restore();
  f.avanzar(180000);
  const r = await f.motor.consultar(f.entrada);
  assert.equal(r.envios[0].estado, 'incierto');
  assert.equal(r.envios[0].historial.at(-1).codigo, 'RESERVA_VENCIDA');
  await f.motor.despacharManual(f.entrada);
  assert.equal(f.llamadas.length, 1);
});

test('sucesivas DB: nueva campana autorizada envia una vez y conserva el control historico', async t => {
  const f = await fixture(t, true);
  await f.motor.despacharManual(f.entrada);
  const historico = (await f.m.ControlEnvioGmail.findById('piloto-manual:' + f.empresa._id)).toObject();
  f.politica.campanasSucesivas = true;
  const otra = f.campana.toObject(); delete otra._id; delete otra.createdAt; delete otra.updatedAt;
  otra.estado = 'borrador'; const c = await f.m.Campana.create(otra); c.estado = 'activa'; await c.save();
  const entrada = { ...f.entrada, campanaId: String(c._id), claveIdempotencia: randomBytes(24).toString('base64url') };
  await f.motor.autorizarPiloto(entrada);
  const r = await f.motor.despacharManual(entrada); assert.equal(r.envios[0].estado, 'aceptado');
  await f.motor.despacharManual(entrada); await f.motor.despacharManual(f.entrada);
  await assert.rejects(f.motor.despacharManual({ ...entrada, claveIdempotencia: randomBytes(24).toString('base64url') }), { codigo: 'IDEMPOTENCIA_CONFLICTO' });
  assert.equal(f.llamadas.length, 2);
  assert.deepEqual((await f.m.ControlEnvioGmail.findById('piloto-manual:' + f.empresa._id)).toObject(), historico);
  assert.ok(await f.m.ControlEnvioGmail.findById('piloto-campana:' + f.empresa._id + ':' + c._id));
});
test('sucesivas DB: resultado incierto anterior bloquea nueva campana sin reintentar', async t => {
  const f = await fixture(t, true);
  f.simulador.enviar = async () => { f.llamadas.push({}); throw new api.ErrorEnvioGmail('TIMEOUT', true); };
  await f.motor.despacharManual(f.entrada); f.politica.campanasSucesivas = true;
  const otra = f.campana.toObject(); delete otra._id; delete otra.createdAt; delete otra.updatedAt; otra.estado = 'borrador';
  const c = await f.m.Campana.create(otra); c.estado = 'activa'; await c.save();
  const entrada = { ...f.entrada, campanaId: String(c._id), claveIdempotencia: randomBytes(24).toString('base64url') };
  await f.motor.autorizarPiloto(entrada);
  await assert.rejects(f.motor.despacharManual(entrada), { codigo: 'RESULTADO_PREVIO_PENDIENTE' });
  assert.equal(f.llamadas.length, 1);
  assert.equal((await f.motor.consultar(f.entrada)).envios[0].estado, 'incierto');
});

const recorridoHttpCompleto = async (t, supervisado = false) => {
  const f = await fixture(t, !supervisado), anterior = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  t.after(() => { if (anterior === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = anterior; });
  if (supervisado) { f.politica.supervisado = true; f.politica.maxDestinatarios = 2; }
  const segundo = supervisado ? await f.m.Contacto.create({ ...f.contacto.toObject(), _id: new mongoose.Types.ObjectId(), email: 'segundo@example.test', consentimientoMarketing: { ...f.contacto.consentimientoMarketing.toObject(), emailHash: require('../services/consentimientoContactoService').huellaEmail('segundo@example.test') } }) : null;
  const modelos = ['Empresa', 'Usuario', 'Contacto', 'Campana', 'ConexionGmail', 'EjecucionGmail', 'EnvioGmail', 'AutorizacionPilotoGmail', 'ControlEnvioGmail'];
  for (const n of modelos) {
    for (const metodo of ['findOne', 'findById', 'find', 'exists']) t.mock.method(require('../models/' + n), metodo, (...args) => f.m[n][metodo](...args));
  }
  const principalCampana = require('../models/Campana');
  t.mock.method(principalCampana, 'create', (...args) => f.m.Campana.create(...args));
  t.mock.method(principalCampana, 'init', async () => {});
  t.mock.method(principalCampana.collection, 'listIndexes', () => f.m.Campana.collection.listIndexes());
  t.mock.method(mongoose.connection, 'transaction', (...args) => f.conexion.transaction(...args));
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => f.politica);
  t.mock.method(require('../services/motorEnviosGmailService'), 'crearMotor', () => f.motor);
  t.mock.method(require('../services/ia/proveedores'), 'disponible', () => true);
  const generarIA = t.mock.method(require('../services/ia/proveedores'), 'crear', () => ({ nombre: 'Gemini simulado', generar: async () => ({ asunto: 'Velas de prueba', mensaje: 'Descubre la coleccion de prueba.', llamadaAccion: 'Conoce la coleccion', segmentacion: ['Personas con consentimiento'] }) }));
  t.mock.method(require('../services/ia/limitesIA'), 'consumir', async () => {});
  const ctx = require('../tests/soporte/sesion').crearContexto(t, { ...f.usuario.toObject(), empresa: f.empresa.toObject() });
  ctx.app.locals.gmailManualValidado = !supervisado; ctx.app.locals.gmailSupervisadoValidado = supervisado;
  const manual = await f.m.Campana.create({ nombre: 'Manual HTTP', objetivo: 'Prueba', canal: 'email', estado: 'borrador', empresa: f.empresa._id, creadoPor: f.usuario._id, versionFlujo: 2, asunto: 'Manual', cuerpoTexto: 'Contenido manual' });
  const enviar = async id => {
    const previa = await f.m.Campana.findById(id);
    const r = await ctx.cliente.get('/campanas/' + id + '/enviar').expect(200);
    assert.match(r.text, /Activar y preparar/);
    await ctx.cliente.post('/campanas/' + id + '/activar-preparar').send({ contactos: supervisado ? [String(f.contacto._id), String(segundo._id)] : String(f.contacto._id), revisionCampana: previa.updatedAt.toISOString() }).expect(303);
    assert.equal(f.llamadas.length, String(id) === String(manual._id) ? 0 : supervisado ? 2 : 1);
    const review = await ctx.cliente.get('/campanas/' + id + '/enviar').expect(200);
    assert.match(review.text, /Confirmar y enviar/);
    if (supervisado) {
      const c = await f.m.Campana.findById(id).lean();
      const body = { confirmacion: 'ENVIAR', revisionDestinatarios: require('../services/revisionEnvioCampanaService').huellaDestinatarios(await f.m.Contacto.find({empresa:f.empresa._id,_id:{$in:c.destinatarios.contactos}}).lean()), idempotencia: randomBytes(24).toString('base64url'), revision: require('../services/motorEnviosGmailService').huella(c) };
      await ctx.cliente.post('/campanas/' + id + '/gmail/confirmar').send({ ...body, _csrf: 'invalido' }).expect(403);
      const queued = await ctx.cliente.post('/campanas/' + id + '/gmail/confirmar').send(body).expect(202);
      assert.equal(queued.body.total, 2);
      const paso = { confirmacion: 'PROCESAR_CAMPANA_CONFIRMADA', ejecucion: queued.body.ejecucion };
      for (let i=0;i<2;i++) await ctx.cliente.post('/campanas/' + id + '/gmail/supervisado/paso').send(paso).expect(200);
      await ctx.cliente.post('/campanas/' + id + '/gmail/supervisado/paso').send(paso).expect(200);
      await ctx.cliente.post('/campanas/' + id + '/gmail/confirmar').send(body).expect(202);
    } else {
    await ctx.cliente.post('/campanas/' + id + '/gmail/piloto/autorizar').send({ confirmacion: 'AUTORIZAR_UN_ENVIO' }).expect(201);
    const body = { confirmacion: 'ENVIAR_UN_CORREO_REAL', idempotencia: randomBytes(24).toString('base64url') };
    const enviado = await ctx.cliente.post('/campanas/' + id + '/gmail/piloto/despachar').send(body).expect(200);
    assert.equal(enviado.body.envios[0].estado, 'aceptado');
    await ctx.cliente.post('/campanas/' + id + '/gmail/piloto/despachar').send(body).expect(200);
    }
    const historial = await ctx.cliente.get('/campanas/' + id + '/historial').expect(200); assert.match(historial.text, /Enviada a Gmail/);
  };
  await enviar(manual._id);
  f.politica.campanasSucesivas = true;
  const formulario = await ctx.cliente.get('/empresa/ia').expect(200);
  const csrf = formulario.text.match(/<form method="post" action="\/empresa\/ia\/generar"[^>]*>[\s\S]*?name="_csrf" value="([A-Za-z0-9_-]{43})"/)[1];
  const propuesta = await ctx.cliente.post('/empresa/ia/generar').send({ _csrf: csrf, nombreCampana: 'IA HTTP', instrucciones: 'Crea una campana de velas sin inventar descuentos.', confirmacionPrivacidad: 'CONFIRMO' }).expect(200);
  const ticket = propuesta.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1];
  const guardado = await ctx.cliente.post('/empresa/ia/borrador').send({ _csrf: csrf, ticket, nombre: 'IA HTTP', objetivo: 'Presentar velas', asunto: 'Velas de prueba', mensaje: 'Descubre la coleccion.', llamadaAccion: 'Conoce mas', segmentacion: 'Personas con consentimiento' }).expect(303);
  assert.ok(guardado.headers.location.includes('/campanas/'));
  const ia = await f.m.Campana.findOne({ nombre: 'IA HTTP' }); assert.equal(ia.estado, 'borrador'); assert.equal(ia.destinatarios, undefined);
  await enviar(ia._id);
  assert.equal(f.llamadas.length, supervisado ? 4 : 2); assert.equal(generarIA.mock.callCount(), 1);
  assert.equal(await f.m.EnvioGmail.countDocuments({ estado: 'aceptado' }), supervisado ? 4 : 2);
};

test('HTTP completo: manual y Gemini guardada, activar, revisar y enviar sucesivamente con Gmail simulado', t => recorridoHttpCompleto(t));
test('HTTP supervisado: manual y Gemini, seleccionar dos, revisar, CSRF, confirmar, pasos e historial sin duplicados', t => recorridoHttpCompleto(t, true));

const fixtureSupervisado = async (t, cantidad = 3) => {
  const f = await fixture(t);
  f.politica.supervisado = true; f.politica.maxDestinatarios = 5;
  const contactos = [f.contacto];
  for (let i = 1; i < cantidad; i++) {
    const email = `contacto-${i}@example.test`;
    contactos.push(await f.m.Contacto.create({ ...f.contacto.toObject(), _id: new mongoose.Types.ObjectId(), email,
      consentimientoMarketing: { ...f.contacto.consentimientoMarketing.toObject(), emailHash: require('../services/consentimientoContactoService').huellaEmail(email) } }));
  }
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'destinatarios.contactos': contactos.map(c => c._id) });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  f.entrada.revisionDestinatarios = require('../services/revisionEnvioCampanaService').huellaDestinatarios(await f.m.Contacto.find({ _id: { $in: contactos.map(c => c._id) } }).lean());
  f.contactos = contactos;
  f.paso = async () => f.motor.procesarPasoSupervisado({ ...f.entrada, ejecucionId: (await f.motor.consultar(f.entrada)).ejecucion });
  return f;
};

test('supervisado DB: varios correos individuales, concurrencia y ninguna cola automatica antigua', async t => {
  const f = await fixtureSupervisado(t);
  const cola = await Promise.all([f.motor.encolar(f.entrada), f.motor.encolar(f.entrada)]);
  assert.equal(cola[0].ejecucion, cola[1].ejecucion);
  await Promise.allSettled([f.paso(), f.paso()]);
  assert.equal(f.llamadas.length, 1);
  await f.paso(); await f.paso(); await f.paso();
  assert.equal(f.llamadas.length, 3);
  for (const llamada of f.llamadas) {
    const mensaje = Buffer.from(llamada.raw, 'base64url').toString();
    assert.match(mensaje, /From: empresa@example.test/);
    assert.equal((mensaje.match(/^To:/gm) || []).length, 1);
    assert.doesNotMatch(mensaje, /^Bcc:|^Cc:/m);
  }
  f.politica.supervisado = false; f.politica.automatico = true;
  await f.motor.procesarPendientes();
  assert.equal(f.llamadas.length, 3);
  await assert.rejects(f.motor.procesarUno(String((await f.m.EnvioGmail.findOne())._id)), { codigo: 'ENVIOS_BLOQUEADOS' });
});

test('supervisado DB: consentimiento documentado y pertenencia se revalidan antes de confirmar y enviar', async t => {
  const f = await fixtureSupervisado(t, 2);
  await f.m.Contacto.updateOne({ _id: f.contactos[1]._id }, { 'consentimientoMarketing.registradoPor': null });
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'CONSENTIMIENTO_NO_DOCUMENTADO' });
  await f.m.Contacto.updateOne({ _id: f.contactos[1]._id }, { 'consentimientoMarketing.registradoPor': f.usuario._id });
  await f.motor.encolar(f.entrada);
  await f.m.Contacto.updateOne({ _id: f.contacto._id }, { activo: false });
  await f.paso();
  assert.equal(f.llamadas.length, 0);
  assert.equal(await f.m.EnvioGmail.countDocuments({ estado: 'cancelado' }), 1);
});

test('supervisado DB: fallo parcial incierto detiene pendientes y nunca se reintenta', async t => {
  const f = await fixtureSupervisado(t);
  await f.motor.encolar(f.entrada); await f.paso();
  f.simulador.enviar = async () => { f.llamadas.push({}); throw { codigo: 'TIMEOUT', incierto: true }; };
  await f.paso();
  await assert.rejects(f.paso(), { codigo: 'RESULTADO_PREVIO_PENDIENTE' });
  f.avanzar(3600000);
  const estado = await f.motor.consultar(f.entrada);
  assert.equal(estado.envios.filter(e => e.estado === 'aceptado').length, 1);
  assert.equal(estado.envios.filter(e => e.estado === 'incierto').length, 1);
  assert.equal(estado.envios.filter(e => e.estado === 'pendiente').length, 1);
  assert.equal(f.llamadas.length, 2);
});

test('supervisado DB: cuotas, velocidad y rechazo Gmail dejan pendientes sin reintentos', async t => {
  const f = await fixtureSupervisado(t);
  f.politica.intervaloEmpresaMs = 2000; f.politica.cuotaHoraEmpresa = 1;
  await f.motor.encolar(f.entrada); await f.paso();
  await assert.rejects(f.paso(), { codigo: 'VELOCIDAD' });
  f.avanzar(3000); await assert.rejects(f.paso(), { codigo: 'CUOTA_LOCAL' });
  f.avanzar(3600000);
  f.simulador.enviar = async () => { f.llamadas.push({}); throw { codigo: 'CUOTA_PROVEEDOR', incierto: false }; };
  await f.paso();
  assert.equal(await f.m.EnvioGmail.countDocuments({ estado: 'rechazado' }), 1);
  assert.equal(await f.m.EnvioGmail.countDocuments({ estado: 'pendiente' }), 1);
  await assert.rejects(f.paso(), { codigo: 'VELOCIDAD' });
  assert.equal(f.llamadas.length, 2);
});

test('supervisado DB: revisión fija destinatarios, límites y consentimiento anterior a confirmar', async t => {
  const f = await fixtureSupervisado(t, 2);
  await assert.rejects(f.motor.encolar({ ...f.entrada, revisionDestinatarios: '0'.repeat(64) }), { codigo: 'DESTINATARIOS_CAMBIARON' });
  f.politica.maxDestinatarios = 1;
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'DESTINATARIOS_INVALIDOS' });
  assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
  f.politica.maxDestinatarios = 2;
  await f.motor.encolar(f.entrada);
  await f.m.Contacto.updateOne({ _id: f.contacto._id }, { 'consentimientoMarketing.fuente': 'Evidencia sustituida' });
  await f.paso();
  assert.equal(f.llamadas.length, 0);
  assert.equal(await f.m.EnvioGmail.countDocuments({ estado: 'cancelado' }), 1);
});

test('supervisado DB: no convierte programación ni procesa campaña o actor de otra empresa', async t => {
  const f = await fixtureSupervisado(t, 2);
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'automatizacion.modo': 'programado', 'automatizacion.fechaProgramada': new Date(Date.now() + 86400000) });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  await assert.rejects(f.motor.encolar(f.entrada), { codigo: 'CAMPANA_NO_PREPARADA' });
  assert.equal(await f.m.EnvioGmail.countDocuments(), 0);
  await f.m.Campana.updateOne({ _id: f.campana._id }, { 'automatizacion.modo': 'inmediato' });
  f.entrada.revision = require('../services/motorEnviosGmailService').huella(await f.m.Campana.findById(f.campana._id).lean());
  const cola = await f.motor.encolar(f.entrada);
  const ajeno = await f.m.Usuario.create({ ...f.usuario.toObject(), _id: new mongoose.Types.ObjectId(), password: passwordSintetica(), email: 'otro-admin@example.test', empresa: new mongoose.Types.ObjectId() });
  await assert.rejects(f.motor.procesarPasoSupervisado({ ...f.entrada, actorId: String(ajeno._id), ejecucionId: cola.ejecucion }), { codigo: 'NO_ENCONTRADA' });
  assert.equal(f.llamadas.length, 0);
});
