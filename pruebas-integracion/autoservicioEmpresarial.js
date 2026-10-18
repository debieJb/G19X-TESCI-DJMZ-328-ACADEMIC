// Solo ejecución explícita. Sin .env ni conexiones globales; correo simulado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const rs = require('../scripts/mongoDevRsComun');
const autoservicio = require('../services/autoservicioEmpresarialService');
const { crearCorreoTransaccional } = require('../services/correoTransaccionalService');
const { passwordSintetica } = require('../tests/soporte/registroFixture');
const { crearAppRegistro, campo } = require('../tests/soporte/registroPublicoHttp');
const nombres = ['Empresa', 'Usuario', 'SolicitudRegistro', 'LimiteRegistro', 'AuditoriaRegistro'];
before(async () => { const c = await rs.conectar(); try { await rs.verificar(c); await rs.compararOriginal(); } finally { await c.close(); } });
after(async () => { await rs.compararOriginal(); assert.equal(mongoose.connection.readyState, 0); });
const fixture = async t => {
  const nombre = 'ma_tx_test_' + randomUUID().replaceAll('-', ''), marca = randomUUID();
  const conexion = await mongoose.createConnection(rs.URI, { dbName: nombre, autoCreate: false, autoIndex: false }).asPromise();
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
  for (const n of nombres) {
    m[n] = conexion.model(n, require(`../models/${n}`).schema.clone().set('autoIndex', false).set('autoCreate', false));
    await m[n].createCollection(); await m[n].createIndexes();
  }
  let ahora = new Date(); const mensajes = [];
  const transporte = { enviar: async mensaje => { mensajes.push(mensaje); } };
  const correo = crearCorreoTransaccional({ autorizado: true, simulado: true, transporte,
    remitente: 'registro@example.test', origenPublico: 'https://plataforma.example.test' });
  const servicio = autoservicio.crearServicio({ conexion, correo, reloj: () => ahora });
  const entrada = { datos: { nombreEmpresa: 'Empresa sintética', correo: 'administracion@example.test' },
    claveIdempotencia: randomBytes(24).toString('base64url'), ambito: randomUUID() };
  const configurarDatos = () => { const password = passwordSintetica(); return { nombreEmpresa: 'Empresa confirmada', nombreAdministrador: 'Administrador', password, confirmacionPassword: password }; };
  const token = () => new URL(mensajes.at(-1).texto.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  const iniciar = async () => { await servicio.solicitar(entrada); await servicio.despachar(); return token(); };
  const verificar = async (sesion = randomUUID()) => {
    const valor = await iniciar(); const resultado = await servicio.verificar({ hashEnlace: autoservicio.tokenHash(valor), sesion });
    return { ...resultado, sesion };
  };
  return { m, conexion, servicio, entrada, mensajes, transporte, token, iniciar, verificar, configurarDatos,
    avanzar: ms => { ahora = new Date(+ahora + ms); } };
};
test('autoservicio real: reserva sin usuario; verificación y configuración crean empresa activa y contraseña bcrypt', async t => {
  const f = await fixture(t), token = await f.iniciar();
  assert.equal(await f.m.Empresa.countDocuments(), 0); assert.equal(await f.m.Usuario.countDocuments(), 0);
  const raw = JSON.stringify(await f.m.SolicitudRegistro.collection.findOne({}));
  assert.ok(!raw.includes(token)); assert.ok(!raw.includes('password'));
  const sesion = randomUUID(), grant = await f.servicio.verificar({ hashEnlace: autoservicio.tokenHash(token), sesion });
  const datos = f.configurarDatos();
  await f.servicio.configurar({ ...grant, sesion, datos });
  const usuario = await f.m.Usuario.findOne({}).select('+password'), empresa = await f.m.Empresa.findOne({});
  assert.equal(usuario.estadoAcceso, 'activo'); assert.ok(usuario.emailVerificadoEn instanceof Date);
  assert.ok(await usuario.compararPassword(datos.password)); assert.ok(usuario.password !== datos.password);
  assert.ok(String(usuario.empresa) === String(empresa._id)); assert.equal(empresa.estadoActivacion, 'verificada');
  assert.equal((await f.m.SolicitudRegistro.findOne({})).estado, 'completada');
  assert.equal(await f.servicio.consultarConfiguracion({ ...grant, sesion }), 'completada');
  assert.deepEqual((await f.m.AuditoriaRegistro.find({}).sort({ fecha: 1 }).lean()).map(e => e.evento), ['solicitada', 'correo_emitido', 'verificada', 'completada']);
});
test('autoservicio real: solicitud idempotente secuencial y concurrente no duplica ni reenvía', async t => {
  const f = await fixture(t);
  await Promise.all([f.servicio.solicitar(f.entrada), f.servicio.solicitar(f.entrada)]);
  await f.servicio.solicitar(f.entrada);
  assert.equal(await f.m.SolicitudRegistro.countDocuments(), 1);
  assert.equal(await f.m.AuditoriaRegistro.countDocuments({ evento: 'solicitada' }), 1);
  assert.equal(f.mensajes.length, 0);
  await assert.rejects(f.servicio.solicitar({ ...f.entrada, datos: { ...f.entrada.datos, nombreEmpresa: 'Otro' } }), { codigo: 'IDEMPOTENCIA_CONFLICTO' });
});

test('autoservicio real: trabajador dirigido solo reclama la solicitud autorizada', async t => {
  const f = await fixture(t);
  await f.servicio.solicitar(f.entrada);
  await f.servicio.solicitar({ datos: { nombreEmpresa: 'Segunda empresa', correo: 'segunda@example.test' },
    claveIdempotencia: randomBytes(24).toString('base64url'), ambito: randomUUID() });
  const elegida = await f.m.SolicitudRegistro.findOne({ correo: 'segunda@example.test' });
  assert.deepEqual(await f.servicio.despachar({ solicitudId: new mongoose.Types.ObjectId().toString() }), { estado: 'sin_trabajo' });
  assert.equal(f.mensajes.length, 0);
  assert.deepEqual(await f.servicio.despachar({ solicitudId: String(elegida._id) }), { estado: 'enviada' });
  assert.equal(f.mensajes.length, 1); assert.equal(f.mensajes[0].destino, 'segunda@example.test');
  assert.equal((await f.m.SolicitudRegistro.findOne({ correo: f.entrada.datos.correo })).correoEstado, 'pendiente');
  assert.deepEqual(await f.servicio.despachar({ solicitudId: String(elegida._id) }), { estado: 'sin_trabajo' });
  assert.equal(f.mensajes.length, 1);
});

test('autoservicio real: consulta de enlace valida vigencia y caducidad sin consumir ni escribir auditoría', async t => {
  const f = await fixture(t), token = await f.iniciar(), hashEnlace = autoservicio.tokenHash(token);
  const antes = await f.m.AuditoriaRegistro.countDocuments();
  assert.equal(await f.servicio.consultarEnlace({ hashEnlace }), 'vigente');
  assert.equal(await f.servicio.consultarEnlace({ hashEnlace: autoservicio.tokenHash(randomBytes(32).toString('base64url')) }), 'invalido');
  assert.equal(await f.m.AuditoriaRegistro.countDocuments(), antes);
  f.avanzar(autoservicio.DURACION_ENLACE);
  assert.equal(await f.servicio.consultarEnlace({ hashEnlace }), 'caducado');
  await assert.rejects(f.servicio.verificar({ hashEnlace, sesion: randomUUID() }), { codigo: 'ENLACE_INVALIDO' });
  assert.equal(await f.m.Empresa.countDocuments(), 0);
});

test('autoservicio real: vista de administrador exige permiso vigente ligado a la sesión', async t => {
  const f = await fixture(t), grant = await f.verificar();
  assert.equal(await f.servicio.consultarConfiguracion(grant), 'vigente');
  assert.equal(await f.servicio.consultarConfiguracion({ ...grant, sesion: randomUUID() }), 'invalida');
  assert.equal(await f.servicio.consultarConfiguracion({ solicitud: 'no-valida', sesion: randomUUID() }), 'invalida');
  f.avanzar(autoservicio.DURACION_CONFIGURACION);
  assert.equal(await f.servicio.consultarConfiguracion(grant), 'caducada');
  assert.equal(await f.m.Empresa.countDocuments(), 0); assert.equal(await f.m.Usuario.countDocuments(), 0);
});
test('autoservicio real: token caducado y reutilizado no verifican', async t => {
  const f = await fixture(t), token = await f.iniciar();
  f.avanzar(autoservicio.DURACION_ENLACE);
  await assert.rejects(f.servicio.verificar({ hashEnlace: autoservicio.tokenHash(token), sesion: randomUUID() }), { codigo: 'ENLACE_INVALIDO' });
  await f.servicio.reenviar(f.entrada.datos.correo); await f.servicio.despachar();
  const nuevo = f.token(), sesion = randomUUID();
  await f.servicio.verificar({ hashEnlace: autoservicio.tokenHash(nuevo), sesion });
  await assert.rejects(f.servicio.verificar({ hashEnlace: autoservicio.tokenHash(nuevo), sesion }), { codigo: 'ENLACE_INVALIDO' });
});
test('autoservicio real: dos consumos concurrentes conceden una única sesión', async t => {
  const f = await fixture(t), token = await f.iniciar();
  const resultados = await Promise.allSettled([1, 2].map(() => f.servicio.verificar({ hashEnlace: autoservicio.tokenHash(token), sesion: randomUUID() })));
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await f.m.AuditoriaRegistro.countDocuments({ evento: 'verificada' }), 1);
});
test('autoservicio real: configuración ligada a sesión, vencida y sin verificación se rechaza', async t => {
  const f = await fixture(t), grant = await f.verificar();
  await assert.rejects(f.servicio.configurar({ ...grant, sesion: randomUUID(), datos: f.configurarDatos() }), { codigo: 'ENLACE_INVALIDO' });
  f.avanzar(autoservicio.DURACION_CONFIGURACION);
  await assert.rejects(f.servicio.configurar({ ...grant, datos: f.configurarDatos() }), { codigo: 'ENLACE_INVALIDO' });
  assert.equal(await f.m.Usuario.countDocuments(), 0);
});
test('autoservicio real: configuración caducada se recupera con enlace nuevo y sin reactivar sesión anterior', async t => {
  const f = await fixture(t), anterior = await f.verificar();
  f.avanzar(autoservicio.DURACION_CONFIGURACION + 1);
  await f.servicio.reenviar(f.entrada.datos.correo); await f.servicio.despachar();
  const sesion = randomUUID(), siguiente = await f.servicio.verificar({ hashEnlace: autoservicio.tokenHash(f.token()), sesion });
  await assert.rejects(f.servicio.configurar({ ...anterior, datos: f.configurarDatos() }), { codigo: 'ENLACE_INVALIDO' });
  await f.servicio.configurar({ ...siguiente, sesion, datos: f.configurarDatos() });
  assert.equal(await f.m.Usuario.countDocuments(), 1);
});
test('autoservicio real: completar concurrentemente e idempotencia conservan un solo administrador', async t => {
  const f = await fixture(t), grant = await f.verificar(), datos = f.configurarDatos();
  await Promise.all([f.servicio.configurar({ ...grant, datos }), f.servicio.configurar({ ...grant, datos })]);
  await f.servicio.configurar({ ...grant, datos });
  assert.equal(await f.m.Empresa.countDocuments(), 1); assert.equal(await f.m.Usuario.countDocuments(), 1);
  await assert.rejects(f.servicio.configurar({ ...grant, datos: f.configurarDatos() }), { codigo: 'IDEMPOTENCIA_CONFLICTO' });
});
test('autoservicio real: aislamiento entre solicitudes y empresas', async t => {
  const f = await fixture(t), primero = await f.verificar();
  await f.servicio.solicitar({ ...f.entrada, datos: { nombreEmpresa: 'Segunda', correo: 'segunda@example.test' }, claveIdempotencia: randomBytes(24).toString('base64url') });
  const segunda = await f.m.SolicitudRegistro.findOne({ correo: 'segunda@example.test' });
  await assert.rejects(f.servicio.configurar({ ...primero, solicitud: String(segunda._id), datos: f.configurarDatos() }), { codigo: 'ENLACE_INVALIDO' });
  await f.servicio.configurar({ ...primero, datos: f.configurarDatos() });
  assert.equal(await f.m.Usuario.countDocuments(), 1);
  assert.equal((await f.m.SolicitudRegistro.findById(segunda._id)).estado, 'pendiente_correo');
});
test('autoservicio real: sin proveedor conserva bandeja y no genera token ni envía', async t => {
  const f = await fixture(t), servicio = autoservicio.crearServicio({ conexion: f.conexion });
  await servicio.solicitar(f.entrada);
  assert.equal((await servicio.despachar()).estado, 'deshabilitado');
  const doc = await f.m.SolicitudRegistro.findOne({}).select('+tokenHash');
  assert.equal(doc.correoEstado, 'pendiente_configuracion'); assert.equal(doc.tokenHash, undefined);
  assert.equal(f.mensajes.length, 0);
});
test('autoservicio real: fallo definitivo y timeout de transporte no se reintentan automáticamente', async t => {
  const f = await fixture(t); let intentos = 0;
  await f.servicio.solicitar(f.entrada);
  f.transporte.enviar = async () => { intentos++; throw Object.assign(Error(), { definitivo: true }); };
  assert.equal((await f.servicio.despachar()).estado, 'fallida');
  assert.equal((await f.servicio.despachar()).estado, 'sin_trabajo');
  assert.equal((await f.m.SolicitudRegistro.findOne({}).select('+tokenHash')).tokenHash, undefined);
  f.avanzar(61000); await f.servicio.reenviar(f.entrada.datos.correo);
  f.transporte.enviar = async () => { intentos++; throw Error(); };
  assert.equal((await f.servicio.despachar()).estado, 'incierta');
  assert.equal((await f.servicio.despachar()).estado, 'sin_trabajo');
  assert.equal(intentos, 2);
});
test('autoservicio real: dos consumidores no entregan dos veces la misma versión', async t => {
  const f = await fixture(t); await f.servicio.solicitar(f.entrada);
  const r = await Promise.all([f.servicio.despachar(), f.servicio.despachar()]);
  assert.equal(r.filter(e => e.estado === 'enviada').length, 1); assert.equal(f.mensajes.length, 1);
});
test('autoservicio real: una caída durante entrega requiere reenvío explícito tras vencer reserva', async t => {
  const f = await fixture(t); await f.servicio.solicitar(f.entrada);
  await f.m.SolicitudRegistro.updateOne({}, { $set: { correoEstado: 'procesando', entregaHasta: new Date(Date.now() + 120000) } });
  await f.servicio.reenviar(f.entrada.datos.correo);
  assert.equal((await f.servicio.despachar()).estado, 'sin_trabajo');
  f.avanzar(180000); await f.servicio.reenviar(f.entrada.datos.correo);
  assert.equal((await f.servicio.despachar()).estado, 'enviada'); assert.equal(f.mensajes.length, 1);
});
test('autoservicio real: reenvío limitado invalida enlace anterior y reinicia ventana diaria', async t => {
  const f = await fixture(t), anterior = await f.iniciar();
  await f.servicio.reenviar(f.entrada.datos.correo); await f.servicio.despachar();
  assert.equal(f.mensajes.length, 1);
  for (let i = 0; i < 5; i++) { f.avanzar(61000); await f.servicio.reenviar(f.entrada.datos.correo); await f.servicio.despachar(); }
  assert.equal(f.mensajes.length, 5);
  await assert.rejects(f.servicio.verificar({ hashEnlace: autoservicio.tokenHash(anterior), sesion: randomUUID() }), { codigo: 'ENLACE_INVALIDO' });
  f.avanzar(24 * 3600000); await f.servicio.reenviar(f.entrada.datos.correo); await f.servicio.despachar();
  assert.equal(f.mensajes.length, 6);
});
test('autoservicio real: limitador persistente concurrente no depende de TTL para reiniciar', async t => {
  const f = await fixture(t), opciones = { accion: 'solicitud', identificador: '127.0.0.1', maximo: 3 };
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => f.servicio.limitar(opciones)));
  assert.equal(r.filter(e => e.status === 'fulfilled').length, 3);
  f.avanzar(16 * 60000); await f.servicio.limitar(opciones);
});
test('autoservicio real: fallo creando usuario revierte empresa, estado y auditoría', async t => {
  const f = await fixture(t), grant = await f.verificar();
  t.mock.method(f.m.Usuario.collection, 'insertOne', async () => { throw Error('FALLO_SINTETICO'); });
  await assert.rejects(f.servicio.configurar({ ...grant, datos: f.configurarDatos() }));
  assert.equal(await f.m.Empresa.countDocuments(), 0);
  assert.equal((await f.m.SolicitudRegistro.findOne({})).estado, 'correo_verificado');
  assert.equal(await f.m.AuditoriaRegistro.countDocuments({ evento: 'completada' }), 0);
});
test('autoservicio real: índice ausente bloquea antes de crear solicitud', async t => {
  const f = await fixture(t); await f.m.SolicitudRegistro.collection.dropIndex('correo_1');
  await assert.rejects(f.servicio.solicitar(f.entrada), { codigo: 'INDICES_REQUERIDOS' });
  assert.equal(await f.m.SolicitudRegistro.countDocuments(), 0);
});
test('autoservicio real: registro repetido de cuenta existente no crea ni modifica usuario o empresa', async t => {
  const f = await fixture(t), grant = await f.verificar(), datos = f.configurarDatos();
  await f.servicio.configurar({ ...grant, datos });
  const usuarioAntes = await f.m.Usuario.collection.findOne({});
  const empresaAntes = await f.m.Empresa.collection.findOne({});
  await f.servicio.solicitar({ ...f.entrada, ambito: randomUUID(), claveIdempotencia: randomBytes(24).toString('base64url') });
  await f.servicio.reenviar(f.entrada.datos.correo);
  assert.ok(JSON.stringify(await f.m.Usuario.collection.findOne({})) === JSON.stringify(usuarioAntes));
  assert.ok(JSON.stringify(await f.m.Empresa.collection.findOne({})) === JSON.stringify(empresaAntes));
  assert.equal(await f.m.SolicitudRegistro.countDocuments(), 1);
});
test('autoservicio real HTTP: solicitud, enlace, contraseña e inicio de sesión con MongoDB temporal', async t => {
  const f = await fixture(t), crear = autoservicio.crearServicio;
  const datos = f.configurarDatos();
  t.mock.method(autoservicio, 'crearServicio', () => crear({ conexion: f.conexion }));
  const Usuario = require('../models/Usuario');
  t.mock.method(Usuario, 'findOne', filtro => f.m.Usuario.findOne(filtro));
  const { app, store } = crearAppRegistro(); t.after(() => store.clear());
  const agente = request.agent(app), pagina = await agente.get('/registro').expect(200);
  const login = async status => {
    const pagina = await agente.get('/login').expect(200);
    return agente.post('/login').type('form').send({ email: 'administracion@example.test', password: datos.password,
      _csrf: campo(pagina.text, '_csrf') }).expect(status);
  };
  const Limite = require('../models/LimiteRegistro');
  t.mock.method(Limite.collection, 'listIndexes', () => f.m.LimiteRegistro.collection.listIndexes());
  t.mock.method(Limite, 'findOneAndUpdate', (...args) => f.m.LimiteRegistro.findOneAndUpdate(...args));
  await agente.post('/registro').type('form').send({ _csrf: campo(pagina.text, '_csrf'), idempotencia: campo(pagina.text, 'idempotencia'),
    nombreEmpresa: 'Empresa HTTP', correo: 'administracion@example.test' }).expect(202);
  assert.equal(await f.m.Usuario.countDocuments(), 0);
  await login(401);
  // Solo el consumidor con transporte simulado emite el enlace de esta prueba.
  await f.servicio.despachar();
  await agente.get('/registro/verificar').query({ token: f.token() }).expect(303);
  const confirmacion = await agente.get('/registro/verificar').expect(200);
  await agente.post('/registro/verificar').type('form').send({ _csrf: campo(confirmacion.text, '_csrf') }).expect(303);
  await login(401);
  const formulario = await agente.get('/registro/administrador').expect(200);
  await agente.post('/registro/administrador').type('form').send({ ...datos, _csrf: campo(formulario.text, '_csrf') }).expect(200);
  await agente.get('/sesion-prueba').expect(200).then(r => assert.equal(r.body.autenticada, false));
  await login(303);
  await agente.get('/sesion-prueba').expect(200).then(r => assert.equal(r.body.autenticada, true));
});
