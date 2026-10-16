const { passwordSintetica } = require('./soporte/registroFixture');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const Verificacion = require('../models/VerificacionCorreo');
const Tarea = require('../models/TareaCorreo');
const politica = require('../services/compatibilidadAltaService');
const { registrar, validar } = require('../services/registroEmpresarialService');
const id = () => new mongoose.Types.ObjectId();
const entrada = () => ({ nombreEmpresa: 'Empresa ficticia', correoAutomatizaciones: 'auto@example.test',
  nombreAdministrador: 'Administrador ficticio', correoAdministrador: 'acceso@example.test', password: passwordSintetica() });

test('alta: históricos conservan ausencia de metadatos y no acreditan verificación', () => {
  const empresa = Empresa.hydrate({ _id: id(), nombre: 'Histórica' });
  const usuario = Usuario.hydrate({ _id: id(), nombre: 'Histórico', rol: 'admin_empresa', empresa: empresa._id });
  assert.equal(empresa.estadoActivacion, undefined);
  assert.equal(empresa.versionAlta, undefined);
  assert.equal(usuario.estadoAcceso, undefined);
  assert.equal(usuario.emailVerificadoEn, undefined);
  assert.equal(politica.estadoEmpresa(empresa), 'historico_no_verificado');
  assert.equal(politica.estadoUsuario(usuario), 'historico_no_verificado');
  assert.equal(politica.correoVerificado(usuario), false);
});

test('alta: documentos nuevos nacen pendientes, nunca con email verificado', () => {
  const empresa = new Empresa({ nombre: 'Nueva' });
  const usuario = new Usuario({ nombre: 'Nuevo' });
  assert.equal(empresa.estadoActivacion, 'pendiente_verificacion');
  assert.equal(usuario.estadoAcceso, 'pendiente_verificacion');
  assert.equal(politica.correoVerificado(usuario), false);
  assert.equal(usuario.emailVerificadoEn, undefined);
});

test('alta v1: empresa requiere correo válido y estados explícitos', async () => {
  for (const correoAutomatizaciones of [undefined, '', 'invalido']) {
    await assert.rejects(new Empresa({ nombre: 'Nueva', versionAlta: 1, correoAutomatizaciones }).validate());
  }
  await assert.rejects(new Empresa({ nombre: 'Nueva', versionAlta: 2 }).validate());
  const e = new Empresa({ nombre: 'Nueva', versionAlta: 1, correoAutomatizaciones: ' AUTO@EXAMPLE.TEST ' });
  await e.validate(); assert.equal(e.correoAutomatizaciones, 'auto@example.test');
});

test('alta: validación normaliza correos y permite acceso igual o diferente a automatizaciones', () => {
  for (const correoAdministrador of ['AUTO@example.test', 'otro@example.test']) {
    const r = validar({ ...entrada(), correoAutomatizaciones: ' AUTO@EXAMPLE.TEST ', correoAdministrador }, 'idempotencia-ficticia-123');
    assert.equal(r.limpio.correoAutomatizaciones, 'auto@example.test');
    assert.equal(r.limpio.correoAdministrador, correoAdministrador.toLowerCase());
  }
});

for (const cambio of [{ rol: 'superadmin' }, { empresa: String(id()) }, { estadoAcceso: 'activo' }, { emailVerificadoEn: new Date() }]) {
  test(`alta: rechaza campo manipulable ${Object.keys(cambio)[0]}`, () => {
    assert.throws(() => validar({ ...entrada(), ...cambio }, 'idempotencia-ficticia-123'), /DATOS_INVALIDOS/);
  });
}

test('alta: contraseñas débiles y mayores que el límite bcrypt se rechazan', () => {
  for (const password of ['', 'corta', 'a'.repeat(20), ' '.repeat(20), 'á'.repeat(37), {}, undefined]) {
    assert.throws(() => validar({ ...entrada(), password }, 'idempotencia-ficticia-123'), /PASSWORD_INSEGURA/);
  }
});

test('alta: identificador idempotente y correos exigen tipos y formatos seguros', () => {
  for (const clave of [undefined, '', {}, 'a'.repeat(129), 'no válido en URL', 'a'.repeat(16) + '\n']) assert.throws(() => validar(entrada(), clave), /IDEMPOTENCIA_INVALIDA/);
  for (const correoAdministrador of ['sin-arroba', {}, ['a@example.test']]) assert.throws(() => validar({ ...entrada(), correoAdministrador }, 'idempotencia-ficticia-123'), /DATOS_INVALIDOS/);
});

test('alta: conexión standalone se rechaza antes de registrar modelos o escribir', async () => {
  let escrituras = 0;
  const conexion = { readyState: 1, db: { admin: () => ({ command: async () => ({ isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 27 }) }) },
    model: () => { escrituras++; }, transaction: () => { escrituras++; } };
  await assert.rejects(registrar({ conexion, actorId: id(), datos: entrada(), claveIdempotencia: 'idempotencia-ficticia-123' }), /TRANSACCIONES_REQUERIDAS/);
  assert.equal(escrituras, 0);
});

test('alta: modelos de correo rechazan secretos y solo admiten hash no recuperable', async () => {
  const base = { empresa: id(), usuario: id(), correoDestino: 'a@example.test', proposito: 'verificar_acceso',
    tokenHash: 'a'.repeat(64), version: 1, expiraEn: new Date(Date.now() + 60000) };
  const verificacion = new Verificacion(base); await verificacion.validate();
  assert.equal(verificacion.toJSON().tokenHash, undefined);
  assert.throws(() => new Verificacion({ ...base, token: 'no-permitido' }), /strict/i);
  await assert.rejects(new Verificacion({ ...base, tokenHash: 'texto-recuperable' }).validate());
  await assert.rejects(new Verificacion({ ...base, tokenHash: 'a'.repeat(64) + '\n' }).validate());
  const tarea = { empresa: id(), usuario: id(), creadoPor: id(), correoDestino: 'a@example.test', tipo: 'verificar_acceso',
    versionAlta: 1, idempotenciaHash: 'b'.repeat(64), solicitudHash: 'c'.repeat(64) };
  await new Tarea(tarea).validate();
  assert.throws(() => new Tarea({ ...tarea, password: passwordSintetica() }), /strict/i);
  assert.throws(() => new Tarea({ ...tarea, token: 'prohibido' }), /strict/i);
  assert.equal(new Tarea(tarea).estado, 'pendiente_configuracion');
  assert.equal(new Tarea(tarea).toJSON().solicitudHash, undefined);
});

test('alta: índices de verificación y tarea soportan exclusión e idempotencia', () => {
  assert.ok(Verificacion.schema.indexes().some(([key, opts]) => key.tokenHash && opts.unique));
  assert.ok(Verificacion.schema.indexes().some(([key, opts]) => key.expiraEn && opts.expireAfterSeconds === 0));
  assert.ok(Tarea.schema.indexes().some(([key, opts]) => key.creadoPor && key.idempotenciaHash && opts.unique));
});
