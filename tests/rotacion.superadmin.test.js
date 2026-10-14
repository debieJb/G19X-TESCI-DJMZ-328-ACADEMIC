const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const { actualizarPasswordSuperadmin, validarDestino } = require('../scripts/actualizarPasswordSuperadmin');
const env = { MONGODB_URI: 'mongodb://127.0.0.1:27017/marketing_automation', SUPERADMIN_EMAIL: 'ADMIN@EXAMPLE.TEST',
  SUPERADMIN_PASSWORD_NUEVA: 'nueva-clave-exclusiva-fixture' };
let doc, escritura, conectar, desconectar;
beforeEach(async t => {
  const hash = await bcrypt.hash('anterior-exclusiva-fixture', 4);
  doc = Usuario.hydrate({ _id: new mongoose.Types.ObjectId(), nombre: 'Admin', email: 'admin@example.test', rol: 'superadmin', password: hash });
  conectar = t.mock.method(mongoose, 'connect', async (uri, opciones) => {
    assert.equal(opciones.autoIndex, false); assert.equal(opciones.autoCreate, false);
  });
  desconectar = t.mock.method(mongoose, 'disconnect', async () => {});
  t.mock.method(Usuario, 'findOne', filtro => {
    assert.deepEqual(filtro, { email: 'admin@example.test', rol: 'superadmin' });
    return { select: async campo => { assert.equal(campo, '+password'); return doc; } };
  });
  escritura = t.mock.method(Usuario.collection, 'updateOne', async (filtro, update) => {
    assert.equal(filtro.rol, 'superadmin');
    assert.match(filtro.password, /^\$2/);
    assert.match(update.$set.password, /^\$2[ab]\$12\$/);
    assert.equal(await bcrypt.compare(env.SUPERADMIN_PASSWORD_NUEVA, update.$set.password), true);
    return { matchedCount: 1 };
  });
});

test('rotación preparada: modo predeterminado consulta y no guarda contraseña ni crea usuarios', async t => {
  const crear = t.mock.method(Usuario, 'create', () => { throw new Error('No crear'); });
  assert.deepEqual(await actualizarPasswordSuperadmin(env), { superadmin: 'CONFIGURADO', cambioPassword: 'PENDIENTE' });
  assert.equal(escritura.mock.callCount(), 0); assert.equal(crear.mock.callCount(), 0); assert.equal(desconectar.mock.callCount(), 1);
});

test('rotación preparada: aplicar requiere confirmación antes de conectar o escribir', async () => {
  await assert.rejects(actualizarPasswordSuperadmin(env, { aplicar: true }), /CONFIRMACION_REQUERIDA/);
  assert.equal(conectar.mock.callCount(), 0); assert.equal(escritura.mock.callCount(), 0);
});

test('rotación preparada: save calcula bcrypt y conserva email, rol y pertenencia', async () => {
  const antes = doc.toObject();
  const resultado = await actualizarPasswordSuperadmin(env, { aplicar: true, confirmacion: 'CAMBIAR_PASSWORD_SUPERADMIN' });
  assert.equal(resultado.cambioPassword, 'CONFIGURADO');
  assert.equal(doc.email, antes.email); assert.equal(doc.rol, antes.rol); assert.equal(doc.empresa, antes.empresa);
  assert.equal(escritura.mock.callCount(), 1); assert.equal(desconectar.mock.callCount(), 1);
  assert.doesNotMatch(JSON.stringify(resultado), /fixture|password.*\$2/);
});

test('rotación preparada: nunca modifica un usuario inexistente ni lo recrea', async t => {
  t.mock.method(Usuario, 'findOne', () => ({ select: async () => null }));
  await assert.rejects(actualizarPasswordSuperadmin(env, { aplicar: true, confirmacion: 'CAMBIAR_PASSWORD_SUPERADMIN' }), /SUPERADMIN_NO_ENCONTRADO/);
  assert.equal(escritura.mock.callCount(), 0); assert.equal(desconectar.mock.callCount(), 1);
});

test('rotación preparada: contraseña débil, ausente o mayor de 72 bytes no inicia conexión', async () => {
  for (const password of [undefined, '', 'corta', 'á'.repeat(37)]) {
    await assert.rejects(actualizarPasswordSuperadmin({ ...env, SUPERADMIN_PASSWORD_NUEVA: password },
      { aplicar: true, confirmacion: 'CAMBIAR_PASSWORD_SUPERADMIN' }), /PASSWORD_NUEVA_INVALIDA/);
  }
  assert.equal(conectar.mock.callCount(), 0);
});

test('rotación preparada: rechaza reutilizar la contraseña anterior', async () => {
  await assert.rejects(actualizarPasswordSuperadmin({ ...env, SUPERADMIN_PASSWORD_NUEVA: 'anterior-exclusiva-fixture' },
    { aplicar: true, confirmacion: 'CAMBIAR_PASSWORD_SUPERADMIN' }), /PASSWORD_SIN_CAMBIO/);
  assert.equal(escritura.mock.callCount(), 0);
});

test('rotación preparada: snapshot de hash evita sobrescribir un cambio anterior al save', async () => {
  await assert.rejects(actualizarPasswordSuperadmin(env, { aplicar: true, confirmacion: 'CAMBIAR_PASSWORD_SUPERADMIN', hashEsperado: 'hash-distinto-fixture' }), /PASSWORD_CAMBIO_CONCURRENTE/);
  assert.equal(escritura.mock.callCount(), 0); assert.equal(desconectar.mock.callCount(), 1);
});

test('rotación preparada: escritura concurrente no confirmada produce error, sin informar éxito', async t => {
  t.mock.method(Usuario.collection, 'updateOne', async () => ({ matchedCount: 0 }));
  await assert.rejects(actualizarPasswordSuperadmin(env, { aplicar: true, confirmacion: 'CAMBIAR_PASSWORD_SUPERADMIN' }), { name: 'DocumentNotFoundError' });
  assert.equal(desconectar.mock.callCount(), 1);
});

test('rotación preparada: limita destino a la base local y cierra conexión ante errores', async t => {
  for (const uri of ['mongodb://remoto.example.test/marketing_automation', 'mongodb+srv://remoto.example.test/marketing_automation',
    'mongodb://localhost/otra_base', '', undefined]) assert.throws(() => validarDestino(uri), /DESTINO_INVALIDO/);
  t.mock.method(mongoose, 'connect', async () => { throw new Error('Error de conexión'); });
  await assert.rejects(actualizarPasswordSuperadmin(env)); assert.equal(desconectar.mock.callCount(), 1);
});
