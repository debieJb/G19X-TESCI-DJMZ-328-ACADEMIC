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
const fixture = async t => {
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
  const empresa = new m.Empresa({ nombre: 'Empresa de prueba', estado: 'activa', estadoActivacion: 'verificada',
    correoAutomatizaciones: 'empresa@example.test', versionAlta: 1 }); await empresa.save();
  const usuario = new m.Usuario({ nombre: 'Administrador', email: 'admin@example.test', password: passwordSintetica(),
    rol: 'admin_empresa', empresa: empresa._id, estadoAcceso: 'activo', emailVerificadoEn: new Date(Date.now() - 1000) }); await usuario.save();
  const contacto = new m.Contacto({ nombre: 'Destinatario', email: 'destinatario@example.test', empresa: empresa._id,
    activo: true, canales: { email: true }, consentimientoMarketing: { estado: 'otorgado', fecha: new Date(Date.now() - 1000), fuente: 'Formulario de prueba',
      registradoPor: usuario._id, registradoEn: new Date(Date.now() - 1000), emailHash: require('../services/consentimientoContactoService').huellaEmail('destinatario@example.test') } }); await contacto.save();
  const campana = new m.Campana({ nombre: 'Campaña de prueba', objetivo: 'Prueba sin envío real', empresa: empresa._id, creadoPor: usuario._id,
    canal: 'email', estado: 'borrador', versionFlujo: 2, asunto: 'Asunto ágil', cuerpoTexto: 'Contenido de prueba',
    destinatarios: { tipo: 'contactos', contactos: [contacto._id] }, automatizacion: { modo: 'inmediato', estado: 'preparada', revision: 1 } }); await campana.save();
  const cuenta = new m.ConexionGmail({ empresa: empresa._id, googleSub: randomUUID(), email: empresa.correoAutomatizaciones,
    estado: 'conectada', scopes: [google.GMAIL_SEND], clienteOAuthHash: config.hash, versionConexion: 1, expiraEn: new Date(Date.now() + 7200000),
    accessTokenCifrado: cifrado.cifrar(randomBytes(32).toString('base64url'), String(empresa._id), 'access'),
    refreshTokenCifrado: cifrado.cifrar(randomBytes(32).toString('base64url'), String(empresa._id), 'refresh') }); await cuenta.save();
  let ahora = new Date(); const llamadas = [];
  const simulador = { enviar: async datos => { llamadas.push(datos); return { gmailId: `gmail-${llamadas.length}`, threadId: `thread-${llamadas.length}` }; } };
  const politica = { ...obtenerPolitica(), habilitado: true, empresas: [String(empresa._id)], intervaloEmpresaMs: 0, intervaloGlobalMs: 0 };
  const motor = crearMotor({ conexion, politica: () => politica, simulador, reloj: () => ahora });
  const entrada = { actorId: String(usuario._id), campanaId: String(campana._id), claveIdempotencia: randomBytes(24).toString('base64url') };
  await motor.autorizarPiloto(entrada);
  const encolar = async () => { await motor.encolar(entrada); return m.EnvioGmail.findOne({}).lean(); };
  return { conexion, m, empresa, usuario, contacto, campana, cuenta, motor, entrada, encolar, llamadas, simulador, renovacion, politica,
    avanzar: ms => { ahora = new Date(+ahora + ms); } };
};
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
  const segunda = await f.m.Campana.create({ ...f.campana.toObject(), _id: new mongoose.Types.ObjectId(), nombre: 'Segunda' });
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
  const segunda = await f.m.Campana.create({ ...f.campana.toObject(), _id: new mongoose.Types.ObjectId(), nombre: 'Segunda' });
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
