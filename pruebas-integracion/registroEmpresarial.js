// Ejecución explícita: node --test pruebas-integracion/registroEmpresarial.js
// No carga .env ni comparte la conexión de Express.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const rs = require('../scripts/mongoDevRsComun');
const { registrar } = require('../services/registroEmpresarialService');
const entrada = () => ({ nombreEmpresa: 'Empresa ficticia', correoAutomatizaciones: 'auto@example.test', nombreAdministrador: 'Admin ficticio',
  correoAdministrador: 'acceso@example.test', password: 'Frase-ficticia-larga-2026' });
before(async () => { const c = await rs.conectar(); try { await rs.verificar(c); await rs.compararOriginal(); } finally { await c.close(); } });
after(async () => { await rs.compararOriginal(); assert.equal(mongoose.connection.readyState, 0); });

const fixture = async t => {
  const base = 'ma_tx_test_' + randomUUID().replaceAll('-', '');
  const marca = randomUUID();
  const conexion = await mongoose.createConnection(rs.URI, { dbName: base, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 }).asPromise();
  t.after(async () => {
    try {
      const c = await rs.conectar(); try { await rs.verificar(c); } finally { await c.close(); }
      assert.match(conexion.name, /^ma_tx_test_[a-f0-9]{32}$/);
      assert.equal((await conexion.db.collection('control').findOne({ _id: 'fixture' }))?.marca, marca);
      await conexion.dropDatabase();
    } finally { await conexion.close(); }
  });
  await conexion.db.collection('control').insertOne({ _id: 'fixture', marca });
  const m = {};
  for (const nombre of ['Empresa', 'Usuario', 'TareaCorreo', 'VerificacionCorreo']) {
    m[nombre] = conexion.model(nombre, require(`../models/${nombre}`).schema.clone());
    await m[nombre].createCollection(); await m[nombre].createIndexes();
  }
  const actor = new m.Usuario({ nombre: 'Superadmin ficticio', email: 'super@example.test', rol: 'superadmin', password: 'Super-ficticio-largo-2026', estadoAcceso: 'activo' });
  await actor.save();
  const ejecutar = (cambios = {}) => registrar({ conexion, actorId: actor._id, datos: entrada(), claveIdempotencia: 'clave-ficticia-idempotente-1', ...cambios });
  const conteos = async () => [await m.Empresa.countDocuments(), await m.Usuario.countDocuments({ rol: 'admin_empresa' }), await m.TareaCorreo.countDocuments()];
  return { conexion, m, actor, ejecutar, conteos };
};

test('integración alta: commit de empresa, administrador bcrypt y tarea sin token', async t => {
  const { m, ejecutar, conteos } = await fixture(t);
  const resultado = await ejecutar();
  assert.deepEqual(await conteos(), [1, 1, 1]);
  const empresa = await m.Empresa.findById(resultado.empresaId).lean();
  const usuario = await m.Usuario.findById(resultado.usuarioId).select('+password');
  const tarea = await m.TareaCorreo.findById(resultado.tareaId).lean();
  assert.equal(empresa.versionAlta, 1); assert.equal(empresa.estadoActivacion, 'pendiente_verificacion');
  assert.equal(empresa.correoAutomatizaciones, 'auto@example.test');
  assert.equal(usuario.estadoAcceso, 'pendiente_verificacion'); assert.equal(usuario.emailVerificadoEn, undefined);
  assert.equal(String(usuario.empresa), resultado.empresaId); assert.equal(usuario.rol, 'admin_empresa');
  assert.match(usuario.password, /^\$2[ab]\$12\$/); assert.equal(await bcrypt.compare(entrada().password, usuario.password), true);
  assert.equal(tarea.correoDestino, usuario.email); assert.equal(tarea.estado, 'pendiente_configuracion');
  const raw = JSON.stringify(await m.TareaCorreo.collection.findOne({ _id: tarea._id }));
  assert.ok(!raw.includes(entrada().password)); assert.equal(tarea.token, undefined);
  assert.equal(await m.VerificacionCorreo.countDocuments(), 0);
});

for (const fase of ['Usuario', 'TareaCorreo']) {
  test(`integración alta: fallo al guardar ${fase} revierte todas las escrituras`, async t => {
    const { m, ejecutar, conteos } = await fixture(t);
    const original = m[fase].collection.insertOne;
    m[fase].collection.insertOne = async () => { throw new Error('FALLO_FICTICIO'); };
    try { await assert.rejects(ejecutar(), /REGISTRO_NO_COMPLETADO/); }
    finally { m[fase].collection.insertOne = original; }
    assert.deepEqual(await conteos(), [0, 0, 0]);
  });
}

test('integración alta: email duplicado revierte empresa y no crea tarea', async t => {
  const { ejecutar, conteos } = await fixture(t);
  await ejecutar();
  await assert.rejects(ejecutar({ claveIdempotencia: 'otra-clave-ficticia-2' }), /EMAIL_DUPLICADO/);
  assert.deepEqual(await conteos(), [1, 1, 1]);
});

test('integración alta: doble envío secuencial recupera los mismos identificadores', async t => {
  const { ejecutar, conteos } = await fixture(t);
  assert.deepEqual(await ejecutar(), await ejecutar());
  assert.deepEqual(await conteos(), [1, 1, 1]);
});

test('integración alta: doble envío concurrente tiene un único commit lógico', async t => {
  const { ejecutar, conteos } = await fixture(t);
  const resultados = await Promise.all([ejecutar(), ejecutar()]);
  assert.deepEqual(resultados[0], resultados[1]);
  assert.deepEqual(await conteos(), [1, 1, 1]);
});

test('integración alta: claves diferentes concurrentes respetan email único', async t => {
  const { ejecutar, conteos } = await fixture(t);
  const resultados = await Promise.allSettled([ejecutar(), ejecutar({ claveIdempotencia: 'segunda-clave-ficticia-2' })]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'EMAIL_DUPLICADO');
  assert.deepEqual(await conteos(), [1, 1, 1]);
});

test('integración alta: misma clave con otro correo o password produce conflicto', async t => {
  const { ejecutar, conteos } = await fixture(t); await ejecutar();
  for (const cambio of [{ correoAdministrador: 'otra@example.test' }, { password: 'Otra-frase-ficticia-2026' }]) {
    await assert.rejects(ejecutar({ datos: { ...entrada(), ...cambio } }), /IDEMPOTENCIA_CONFLICTO/);
  }
  assert.deepEqual(await conteos(), [1, 1, 1]);
});

test('integración alta: sin índices obligatorios se rechaza sin alta parcial', async t => {
  const { m, ejecutar, conteos } = await fixture(t);
  await m.TareaCorreo.collection.dropIndex('creadoPor_1_idempotenciaHash_1');
  await assert.rejects(ejecutar(), /INDICES_REQUERIDOS/);
  assert.deepEqual(await conteos(), [0, 0, 0]);
});

test('integración alta: aislamiento no expone empresa ni usuario antes de guardar tarea', async t => {
  const { m, ejecutar, conteos } = await fixture(t);
  const original = m.TareaCorreo.collection.insertOne;
  m.TareaCorreo.collection.insertOne = async function (...args) {
    assert.deepEqual(await conteos(), [0, 0, 0]);
    return original.apply(this, args);
  };
  try { await ejecutar(); } finally { m.TareaCorreo.collection.insertOne = original; }
  assert.deepEqual(await conteos(), [1, 1, 1]);
});

test('integración alta: rol se obtiene del actor persistido y no del cliente', async t => {
  const { m, actor, ejecutar, conteos } = await fixture(t);
  await m.Usuario.collection.updateOne({ _id: actor._id }, { $set: { rol: 'operador' } });
  await assert.rejects(ejecutar(), /ACCESO_DENEGADO/);
  assert.deepEqual(await conteos(), [0, 0, 0]);
});

test('integración alta: histórico sin metadatos no se modifica al registrar otra empresa', async t => {
  const { m, ejecutar } = await fixture(t);
  const id = new mongoose.Types.ObjectId();
  await m.Empresa.collection.insertOne({ _id: id, nombre: 'Histórica ficticia', estado: 'activa' });
  const usuarioId = new mongoose.Types.ObjectId();
  await m.Usuario.collection.insertOne({ _id: usuarioId, nombre: 'Usuario histórico ficticio', email: 'historico@example.test',
    rol: 'operador', empresa: id, password: await bcrypt.hash('Clave-historica-ficticia', 4) });
  const antes = await m.Empresa.collection.findOne({ _id: id });
  const usuarioAntes = await m.Usuario.collection.findOne({ _id: usuarioId });
  await ejecutar();
  assert.deepEqual(await m.Empresa.collection.findOne({ _id: id }), antes);
  assert.deepEqual(await m.Usuario.collection.findOne({ _id: usuarioId }), usuarioAntes);
});

test('integración alta: correos iguales son válidos y el administrador queda pendiente', async t => {
  const { ejecutar, m } = await fixture(t);
  const r = await ejecutar({ datos: { ...entrada(), correoAdministrador: 'auto@example.test' } });
  const empresa = await m.Empresa.findById(r.empresaId);
  const usuario = await m.Usuario.findById(r.usuarioId);
  assert.equal(empresa.correoAutomatizaciones, usuario.email);
  assert.equal(usuario.estadoAcceso, 'pendiente_verificacion');
});

test('integración alta: actor bloqueado no registra y los campos de rol/empresa se rechazan', async t => {
  const { m, actor, ejecutar, conteos } = await fixture(t);
  for (const datos of [{ ...entrada(), rol: 'superadmin' }, { ...entrada(), empresa: String(actor._id) }]) {
    await assert.rejects(ejecutar({ datos }), /DATOS_INVALIDOS/);
  }
  await m.Usuario.collection.updateOne({ _id: actor._id }, { $set: { estadoAcceso: 'bloqueado' } });
  await assert.rejects(ejecutar(), /ACCESO_DENEGADO/);
  assert.deepEqual(await conteos(), [0, 0, 0]);
});
