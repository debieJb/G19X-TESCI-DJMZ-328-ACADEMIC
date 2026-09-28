const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const base = { nombre: ' Usuario ', email: ' USUARIO@Ejemplo.COM ', password: ' contraseña ', rol: 'superadmin' };

test('usuario: normaliza nombre y email, conserva password sin hash y declara índice único', async () => {
  const usuario = new Usuario(base);
  await usuario.validate();
  assert.equal(usuario.nombre, 'Usuario');
  assert.equal(usuario.email, 'usuario@ejemplo.com');
  assert.equal(usuario.password, base.password);
  assert.ok(Usuario.schema.indexes().some(([campos, opciones]) => campos.email === 1 && opciones.unique));
});

test('usuario: campos requeridos y roles inválidos', async () => {
  for (const campo of ['nombre', 'email', 'password', 'rol']) {
    for (const valor of [undefined, null, '']) {
      await assert.rejects(new Usuario({ ...base, [campo]: valor }).validate(), e => !!e.errors[campo]);
    }
  }
  for (const campo of ['nombre', 'email']) {
    await assert.rejects(new Usuario({ ...base, [campo]: '   ' }).validate(), e => !!e.errors[campo]);
  }
  for (const rol of ['admin', 'SUPERADMIN', 'desconocido']) {
    await assert.rejects(new Usuario({ ...base, rol }).validate(), e => e.errors.rol.kind === 'enum');
  }
});

test('usuario: roles válidos, empresa obligatoria para admin_empresa y operador', async () => {
  assert.equal(Usuario.schema.path('empresa').options.ref, 'Empresa');
  for (const rol of ['admin_empresa', 'operador']) {
    for (const empresa of [undefined, null]) {
      await assert.rejects(new Usuario({ ...base, rol, empresa }).validate(), e => e.errors.empresa.kind === 'required');
    }
    const empresa = new mongoose.Types.ObjectId();
    const usuario = new Usuario({ ...base, rol, empresa });
    await usuario.validate();
    assert.ok(usuario.empresa.equals(empresa));
  }
});

test('usuario: superadmin con y sin empresa; valida referencias y cambios de rol', async () => {
  for (const empresa of [undefined, null, new mongoose.Types.ObjectId()]) {
    await new Usuario({ ...base, empresa }).validate();
  }
  await assert.rejects(new Usuario({ ...base, empresa: 'inválida' }).validate(), e => !!e.errors.empresa);
  const usuario = Usuario.hydrate(base);
  usuario.rol = 'operador';
  await assert.rejects(usuario.validate(), e => !!e.errors.empresa);
});
