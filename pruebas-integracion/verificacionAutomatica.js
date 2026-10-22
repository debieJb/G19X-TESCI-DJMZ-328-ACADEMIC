// Solo ejecucion explicita. Google simulado; fixtures nuevas verificadas en 27018.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const rs = require('../scripts/mongoDevRsComun');
const auto = require('../services/autoservicioEmpresarialService');
const worker = require('../services/trabajadorVerificacionService');
const creadas = new Set();
let anteriores;
const inventario = async c => {
  const dbs = (await c.db('admin').admin().listDatabases()).databases.filter(d => !['admin', 'local', 'config'].includes(d.name));
  const datos = {};
  for (const d of dbs) if (!creadas.has(d.name)) {
    const db = c.db(d.name), indices = {};
    for (const col of await db.listCollections({}, { nameOnly: true }).toArray()) indices[col.name] = await db.collection(col.name).listIndexes().toArray();
    datos[d.name] = { datos: (await db.command({ dbHash: 1 })).collections, indices };
  }
  return datos;
};
before(async () => { const c = await rs.conectar();try { await rs.verificar(c);await rs.compararOriginal();anteriores = await inventario(c); }finally { await c.close(); } });
after(async () => { const c = await rs.conectar();try { await rs.verificar(c);assert.deepEqual(await inventario(c), anteriores);await rs.compararOriginal(); }finally { await c.close(); } });
const fixture = async t => {
  const nombre = 'ma_tx_test_' + randomUUID().replaceAll('-', ''), marca = randomUUID();
  const c = await rs.conectar();
  try { await rs.verificar(c);assert.ok(!(await c.db('admin').admin().listDatabases()).databases.some(d => d.name === nombre)); }
  finally { await c.close(); }
  const conexion = await mongoose.createConnection(rs.URI, { dbName: nombre, autoCreate: false, autoIndex: false }).asPromise();
  t.after(async () => { await conexion.close(); });
  await conexion.db.collection('control').insertOne({ _id: 'fixture', marca });creadas.add(nombre);
  t.after(async () => {
    const c = await rs.conectar();
    try {
      await rs.verificar(c);assert.ok(creadas.has(nombre));assert.match(nombre, /^ma_tx_test_[a-f0-9]{32}$/);
      assert.equal((await c.db(nombre).collection('control').findOne({ _id: 'fixture' }))?.marca, marca);
      await c.db(nombre).dropDatabase();
    } finally { await c.close(); }
  });
  const m = {};
  for (const n of ['Empresa', 'Usuario', 'SolicitudRegistro', 'LimiteRegistro', 'AuditoriaRegistro']) {
    m[n] = conexion.model(n, require(`../models/${n}`).schema.clone().set('autoCreate', false).set('autoIndex', false));
    await m[n].createCollection();await m[n].createIndexes();
  }
  const mensajes = [];let ahora = new Date();
  const transporte = { enviar: async mensaje => { mensajes.push(mensaje);return { aceptado: true, mensajeId: 'gmail-simulado' }; } };
  const correo = require('../services/correoTransaccionalService').crearCorreoTransaccional({ autorizado: true, simulado: true,
    transporte, remitente: 'plataforma@example.test', origenPublico: 'https://plataforma.example.test' });
  const servicio = limitesEnvio => auto.crearServicio({ conexion, correo, limitesEnvio, reloj: () => ahora });
  const entrada = (n = 0) => ({ datos: { nombreEmpresa: `Empresa ${n}`, correo: `empresa${n}@example.test` },
    claveIdempotencia: randomBytes(24).toString('base64url'), ambito: randomUUID() });
  const ejecutar = async (cantidad = 1) => {
    const cancelar = new AbortController();
    await worker.ejecutar({ conexion, correo, signal: cancelar.signal, intervaloMs: 1,
      informar: codigo => { if (mensajes.length >= cantidad || ['ENTREGA_FALLIDA', 'ENTREGA_INCIERTA'].includes(codigo)) cancelar.abort(); },
      esperar: async () => { throw Error('SIN_TRABAJO_INESPERADO'); } });
  };
  return { conexion, m, mensajes, transporte, correo, servicio, entrada, ejecutar, nombre, marca, avanzar: ms => { ahora = new Date(+ahora + ms); } };
};
test('SMTP Mongo: solicitud, token, primer administrador y credencial de login conservan flujo completo', async t => {
  const f = await fixture(t); let texto;
  t.mock.method(require('nodemailer'), 'createTransport', () => ({ close() {}, sendMail: async d => {
    texto = d.text; return { accepted: [d.to], rejected: [], messageId: '<registro@example.test>' };
  } }));
  const smtp = require('../services/smtpTransaccionalService');
  f.transporte.enviar = smtp.crearTransporte(smtp.configuracion({ EMAIL_USER: 'plataforma@example.test', EMAIL_PASS: 'sintetica', TRANSACTIONAL_PUBLIC_ORIGIN: 'https://localhost:3100' })).enviar;
  await f.servicio().solicitar(f.entrada()); await f.servicio().despachar();
  const token = new URL(texto.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  assert.ok(!JSON.stringify(await f.m.SolicitudRegistro.collection.findOne({})).includes(token));
  const sesion = randomUUID(), grant = await f.servicio().verificar({ hashEnlace: auto.tokenHash(token), sesion });
  const password = require('../tests/soporte/registroFixture').passwordSintetica();
  await f.servicio().configurar({ ...grant, sesion, datos: { nombreEmpresa: 'Empresa SMTP sintética', nombreAdministrador: 'Administrador', password, confirmacionPassword: password } });
  const usuario = await f.m.Usuario.findOne().select('+password');
  assert.equal(usuario.estadoAcceso, 'activo'); assert.equal(usuario.rol, 'admin_empresa'); assert.ok(await usuario.compararPassword(password));
  assert.equal((await f.m.Empresa.findById(usuario.empresa)).estadoActivacion, 'verificada');
  await assert.rejects(f.servicio().verificar({ hashEnlace: auto.tokenHash(token), sesion }), { codigo: 'ENLACE_INVALIDO' });
});

test('SMTP Mongo: credenciales rechazadas no reintentan; reenvío explícito permite nuevo intento', async t => {
  const f = await fixture(t); let llamadas = 0, autorizado = false;
  t.mock.method(require('nodemailer'), 'createTransport', () => ({ close() {}, sendMail: async d => {
    llamadas++; if (!autorizado) throw Object.assign(Error('privado'), { code: 'EAUTH', responseCode: 535 });
    return { accepted: [d.to], rejected: [], messageId: '<reenvio@example.test>' };
  } }));
  const smtp = require('../services/smtpTransaccionalService');
  f.transporte.enviar = smtp.crearTransporte(smtp.configuracion({ EMAIL_USER: 'plataforma@example.test', EMAIL_PASS: 'sintetica', TRANSACTIONAL_PUBLIC_ORIGIN: 'https://localhost:3100' })).enviar;
  const entrada = f.entrada(); await f.servicio().solicitar(entrada);
  assert.equal((await f.servicio().despachar()).estado, 'fallida'); assert.equal((await f.servicio().despachar()).estado, 'sin_trabajo');
  assert.equal((await f.m.SolicitudRegistro.findOne()).correoError, 'REAUTORIZAR_TRANSACCIONAL');
  f.avanzar(61000); autorizado = true; await f.servicio().reenviar(entrada.datos.correo);
  assert.equal((await f.servicio().despachar()).estado, 'enviada'); assert.equal(llamadas, 2);
});

test('SMTP Mongo: consumidores concurrentes no duplican y persisten aceptación saneada', async t => {
  const f = await fixture(t);
  let llamadas = 0;
  t.mock.method(require('nodemailer'), 'createTransport', () => ({ close() {}, sendMail: async d => {
    llamadas++; return { accepted: [d.to], rejected: [], messageId: '<smtp-prueba@example.test>' };
  } }));
  const smtp = require('../services/smtpTransaccionalService');
  f.transporte.enviar = smtp.crearTransporte(smtp.configuracion({ EMAIL_USER: 'plataforma@example.test', EMAIL_PASS: 'sintetica', TRANSACTIONAL_PUBLIC_ORIGIN: 'https://localhost:3100' })).enviar;
  await f.servicio().solicitar(f.entrada());
  await Promise.all([f.servicio().despachar(), f.servicio().despachar()]);
  assert.equal(llamadas, 1); const doc = await f.m.SolicitudRegistro.findOne();
  assert.equal(doc.correoEstado, 'enviada'); assert.match(doc.proveedorMensajeId, /^[a-f0-9]{64}$/);
  await f.servicio().despachar(); assert.equal(llamadas, 1);
});

test('SMTP Mongo: timeout incierto no se reintenta tras reiniciar servicio', async t => {
  const f = await fixture(t); let llamadas = 0;
  t.mock.method(require('nodemailer'), 'createTransport', () => ({ close() {}, sendMail: async () => { llamadas++; throw Object.assign(Error('privado'), { code: 'ETIMEDOUT' }); } }));
  const smtp = require('../services/smtpTransaccionalService');
  f.transporte.enviar = smtp.crearTransporte(smtp.configuracion({ EMAIL_USER: 'plataforma@example.test', EMAIL_PASS: 'sintetica', TRANSACTIONAL_PUBLIC_ORIGIN: 'https://localhost:3100' })).enviar;
  await f.servicio().solicitar(f.entrada()); assert.equal((await f.servicio().despachar()).estado, 'incierta');
  f.avanzar(180000); await f.servicio().recuperarIncierta(); await f.servicio().despachar(); assert.equal(llamadas, 1);
});

test('automatico Mongo: tarea persistida atomicamente; residente envia sin ID ni despacho manual', async t => {
  const f = await fixture(t), entrada = f.entrada();await f.servicio().solicitar(entrada);
  assert.equal(await f.m.SolicitudRegistro.countDocuments({ correoEstado: 'pendiente' }), 1);
  assert.equal(await f.m.AuditoriaRegistro.countDocuments({ evento: 'solicitada' }), 1);
  assert.equal(f.mensajes.length, 0);await f.ejecutar();
  assert.equal(f.mensajes.length, 1);const doc = await f.m.SolicitudRegistro.findOne({});
  assert.equal(doc.correoEstado, 'enviada');assert.equal(doc.proveedorMensajeId, 'gmail-simulado');
});
test('primer intento Mongo: destinatario privado e ID exactos, concurrencia y maximo un intento', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());await f.servicio().solicitar(f.entrada(1));
  const doc = await f.m.SolicitudRegistro.findOne({ correo: 'empresa0@example.test' });
  const opciones = { solicitudId: String(doc._id), primerIntento: true, destinatarioEsperado: doc.correo };
  assert.equal((await f.servicio().despachar({ ...opciones, destinatarioEsperado: 'ajeno@example.test' })).estado, 'sin_trabajo');
  assert.equal(f.mensajes.length, 0);
  await Promise.all([f.servicio().despachar(opciones), f.servicio().despachar(opciones)]);
  assert.equal(f.mensajes.length, 1);assert.equal(f.mensajes[0].destino, doc.correo);
  assert.equal((await f.m.SolicitudRegistro.findById(doc._id)).versionEnvio, 1);
  f.avanzar(61000);await f.servicio().reenviar(doc.correo);
  assert.equal((await f.servicio().despachar(opciones)).estado, 'sin_trabajo');assert.equal(f.mensajes.length, 1);
  assert.equal((await f.m.SolicitudRegistro.findOne({ correo: 'empresa1@example.test' })).versionEnvio, 0);
});
test('primer intento Mongo: error de proveedor consume intento y no autoriza repeticion', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());
  const doc = await f.m.SolicitudRegistro.findOne({});let llamadas = 0;
  f.transporte.enviar = async () => { llamadas++;throw Object.assign(Error('sintetico'), { definitivo: true }); };
  const opciones = { solicitudId: String(doc._id), primerIntento: true, destinatarioEsperado: doc.correo };
  assert.equal((await f.servicio().despachar(opciones)).estado, 'fallida');
  f.avanzar(61000);await f.servicio().reenviar(doc.correo);
  assert.equal((await f.servicio().despachar(opciones)).estado, 'sin_trabajo');assert.equal(llamadas, 1);
});
test('automatico Mongo: rollback de auditoria no deja solicitud ni tarea enviable', async t => {
  const f = await fixture(t);t.mock.method(f.m.AuditoriaRegistro.collection, 'insertOne', async () => { throw Error('FALLO_SINTETICO'); });
  await assert.rejects(f.servicio().solicitar(f.entrada()));assert.equal(await f.m.SolicitudRegistro.countDocuments(), 0);
});
test('automatico Mongo: registros repetidos concurrentes y dos consumidores no duplican', async t => {
  const f = await fixture(t), entrada = f.entrada();
  await Promise.all(Array.from({ length: 5 }, () => f.servicio().solicitar(entrada)));
  assert.equal(await f.m.SolicitudRegistro.countDocuments(), 1);
  await Promise.all([f.servicio().despachar(), f.servicio().despachar()]);assert.equal(f.mensajes.length, 1);
  assert.equal((await f.servicio().despachar()).estado, 'sin_trabajo');
});
test('automatico Mongo: reinicio conserva pendientes y no repite ya enviadas', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());await f.ejecutar();
  await f.servicio().solicitar(f.entrada(1));await f.ejecutar(2);
  assert.equal(f.mensajes.length, 2);assert.equal(await f.m.SolicitudRegistro.countDocuments({ correoEstado: 'enviada' }), 2);
});
test('automatico Mongo: proceso interrumpido queda incierto, con token vigente y sin reenvio', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());
  await f.m.SolicitudRegistro.updateOne({}, { correoEstado: 'procesando', entregaHasta: new Date(0), tokenHash: 'a'.repeat(64), expiraEn: new Date(Date.now() + 60000) });
  assert.equal((await f.servicio().recuperarIncierta()).estado, 'incierta');
  assert.equal((await f.servicio().recuperarIncierta()).estado, 'sin_trabajo');
  assert.equal((await f.servicio().despachar()).estado, 'sin_trabajo');assert.equal(f.mensajes.length, 0);
  assert.equal(await f.servicio().consultarEnlace({ hashEnlace: 'a'.repeat(64) }), 'vigente');
});
test('automatico Mongo: error incierto no se reintenta; rechazo definitivo queda fallido', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());
  f.transporte.enviar = async () => { throw Error('DATO_PRIVADO_NO_REGISTRAR'); };await f.ejecutar();
  assert.equal((await f.m.SolicitudRegistro.findOne({})).correoError, 'ENTREGA_INCIERTA');
  assert.equal((await f.servicio().despachar()).estado, 'sin_trabajo');
  await f.servicio().solicitar(f.entrada(1));
  f.transporte.enviar = async () => { throw Object.assign(Error('privado'), { definitivo: true }); };await f.ejecutar();
  assert.equal(await f.m.SolicitudRegistro.countDocuments({ correoEstado: 'fallida' }), 1);
});
test('automatico Mongo: cuota global concurrente conserva tareas, reinicia ventana sin TTL', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());await f.servicio().solicitar(f.entrada(1));
  const crear = () => f.servicio({ minuto: 1, dia: 2 });await Promise.all([crear().despachar(), crear().despachar()]);
  assert.equal(f.mensajes.length, 1);assert.equal((await crear().despachar()).estado, 'limitada');
  assert.equal(await f.m.SolicitudRegistro.countDocuments({ correoEstado: 'pendiente' }), 1);
  f.avanzar(61000);assert.equal((await crear().despachar()).estado, 'enviada');
  await f.servicio().solicitar(f.entrada(2));assert.equal((await crear().despachar()).estado, 'limitada');
});
test('automatico Mongo: autorizacion Google rechazada pausa trabajador y conserva resto pendiente', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());await f.servicio().solicitar(f.entrada(1));
  let llamadas = 0;
  f.transporte.enviar = async () => { llamadas++;throw Object.assign(Error('privado'), {
    definitivo: true, codigo: 'GMAIL_TRANSACCIONAL_RECHAZADO', requiereAutorizacion: true
  }); };
  await assert.rejects(worker.ejecutar({ conexion: f.conexion, correo: f.correo }), /REAUTORIZAR_TRANSACCIONAL/);
  assert.equal(llamadas, 1);assert.equal(await f.m.SolicitudRegistro.countDocuments({ correoEstado: 'pendiente' }), 1);
  assert.equal(await f.m.SolicitudRegistro.countDocuments({ correoEstado: 'fallida', correoError: 'REAUTORIZAR_TRANSACCIONAL' }), 1);
});
test('automatico Mongo: transporte ausente conserva tarea y activacion posterior la recupera', async t => {
  const f = await fixture(t);const sin = auto.crearServicio({ conexion: f.conexion });await sin.solicitar(f.entrada());
  assert.equal((await f.m.SolicitudRegistro.findOne({})).correoEstado, 'pendiente_configuracion');
  assert.equal((await sin.despachar()).estado, 'deshabilitado');await f.ejecutar();assert.equal(f.mensajes.length, 1);
});
test('automatico Mongo: supervisor reinicia proceso hijo real y procesa cola persistida', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());
  const cancelar = new AbortController();let hijos = 0, aceptados = 0;
  const watchdog = setTimeout(() => cancelar.abort(), 10000);t.after(() => clearTimeout(watchdog));
  const r = await require('../services/supervisorVerificacionResidenteService').ejecutar({ signal: cancelar.signal,
    esperar: async () => {}, crearHijo: () => {
      const h = require('node:child_process').fork(require('node:path').join(__dirname, '../tests/soporte/trabajadorVerificacionFixture.cjs'),
        [f.nombre, f.marca, ++hijos === 1 ? 'fallar' : 'procesar'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      h.on('message', mensaje => { if (mensaje === 'aceptado') { aceptados++;cancelar.abort(); } });return h;
    } });
  assert.equal(r.estado, 'detenido');assert.equal(hijos, 2);assert.equal(aceptados, 1);
  assert.equal((await f.m.SolicitudRegistro.findOne({})).proveedorMensajeId, 'id-hijo-simulado');
});
test('automatico Mongo: dos empresas verificadas, administradores aislados y sesion ajena rechazada', async t => {
  const f = await fixture(t);await f.servicio().solicitar(f.entrada());await f.servicio().solicitar(f.entrada(1));await f.ejecutar(2);
  const grants = [];
  for (const mensaje of f.mensajes) {
    const token = new URL(mensaje.texto.match(/https:\/\/\S+/)[0]).searchParams.get('token'), sesion = randomUUID();
    const grant = await f.servicio().verificar({ hashEnlace: auto.tokenHash(token), sesion });grants.push({ ...grant, sesion });
    await assert.rejects(f.servicio().verificar({ hashEnlace: auto.tokenHash(token), sesion }), { codigo: 'ENLACE_INVALIDO' });
    const password = require('../tests/soporte/registroFixture').passwordSintetica();
    await f.servicio().configurar({ ...grant, sesion, datos: { nombreEmpresa: 'Empresa', nombreAdministrador: 'Admin', password, confirmacionPassword: password } });
    const usuario = await f.m.Usuario.findOne({ email: mensaje.destino }).select('+password');
    assert.equal(usuario.estadoAcceso, 'activo');assert.ok(await usuario.compararPassword(password));
  }
  assert.equal(await f.servicio().consultarConfiguracion({ ...grants[0], sesion: grants[1].sesion }), 'invalida');
  const usuarios = await f.m.Usuario.find({});assert.notEqual(String(usuarios[0].empresa), String(usuarios[1].empresa));
});
