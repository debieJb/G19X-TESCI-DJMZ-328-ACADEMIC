const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const { crearSuperadmin } = require('../scripts/crearSuperadmin');
const env = { SUPERADMIN_NOMBRE: ' Persona ', SUPERADMIN_EMAIL: ' PERSONA@EXAMPLE.TEST ', SUPERADMIN_PASSWORD: 'contraseña-de-prueba' };
let desconectar, conectar, insertado, existe;
beforeEach(t => {
  process.env.MONGODB_URI = 'mongodb://localhost/base-exclusiva-pruebas-sin-conexion';
  conectar = t.mock.method(mongoose, 'connect', async () => {});
  desconectar = t.mock.method(mongoose, 'disconnect', async () => {});
  t.mock.method(Usuario, 'init', async () => {});
  existe = t.mock.method(Usuario, 'exists', async filtro => { assert.deepEqual(filtro, { email: 'persona@example.test' }); return null; });
  insertado = null;
  t.mock.method(Usuario.collection, 'insertOne', async datos => { insertado = { ...datos }; return { insertedId: datos._id }; });
});

test('superadmin: crea con hash, rol fijo y sin empresa; cierra conexión', async () => {
  assert.deepEqual(await crearSuperadmin(env), { creado: true });
  assert.equal(insertado.nombre, 'Persona');
  assert.equal(insertado.email, 'persona@example.test');
  assert.equal(insertado.rol, 'superadmin');
  assert.equal(insertado.empresa, undefined);
  assert.notEqual(insertado.password, env.SUPERADMIN_PASSWORD);
  assert.equal(await bcrypt.compare(env.SUPERADMIN_PASSWORD, insertado.password), true);
  assert.equal(desconectar.mock.callCount(), 1);
});

test('superadmin: no sobrescribe usuario existente', async () => {
  existe.mock.mockImplementation(async () => ({ _id: 'existente' }));
  assert.deepEqual(await crearSuperadmin(env), { creado: false });
  assert.equal(insertado, null);
  assert.equal(desconectar.mock.callCount(), 1);
});

test('superadmin: exige las tres variables antes de conectar', async () => {
  for (const campo of Object.keys(env)) {
    await assert.rejects(crearSuperadmin({ ...env, [campo]: '' }), new RegExp(campo));
  }
  assert.equal(conectar.mock.callCount(), 0);
  assert.equal(desconectar.mock.callCount(), 3);
});

test('superadmin: cierra conexión también ante fallo de MongoDB', async () => {
  conectar.mock.mockImplementation(async () => { throw new Error('No disponible'); });
  await assert.rejects(crearSuperadmin(env));
  assert.equal(desconectar.mock.callCount(), 1);
});

test('superadmin: duplicado concurrente no sobrescribe y desconecta', async t => {
  t.mock.method(Usuario, 'create', async () => { throw Object.assign(new Error('Duplicado'), { code: 11000 }); });
  assert.deepEqual(await crearSuperadmin(env), { creado: false });
  assert.equal(desconectar.mock.callCount(), 1);
});
