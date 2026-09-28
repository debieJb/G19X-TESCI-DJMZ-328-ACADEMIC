const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const base = { nombre: ' Usuario ', email: ' USUARIO@Ejemplo.COM ', password: ' contraseña ', rol: 'superadmin' };

test('usuario: normaliza nombre y email y declara índice único antes de persistir', async () => {
  const usuario = new Usuario(base);
  await usuario.validate();
  assert.equal(usuario.nombre, 'Usuario');
  assert.equal(usuario.email, 'usuario@ejemplo.com');
  assert.equal(usuario.password, base.password);
  assert.ok(Usuario.schema.indexes().some(([campos, opciones]) => campos.email === 1 && opciones.unique));
});

test('usuario: save guarda hash, compara y no vuelve a hashear al editar nombre', async t => {
  let almacenado;
  t.mock.method(Usuario.collection, 'insertOne', async datos => { almacenado = { ...datos }; return { insertedId: datos._id }; });
  const actualizar = t.mock.method(Usuario.collection, 'updateOne', async () => ({ matchedCount: 1 }));
  const usuario = new Usuario(base);
  await usuario.save();
  assert.notEqual(almacenado.password, base.password);
  assert.match(almacenado.password, /^\$2[ab]\$12\$/);
  assert.equal(await usuario.compararPassword(base.password), true);
  assert.equal(await usuario.compararPassword('incorrecta'), false);
  const hash = usuario.password;
  usuario.nombre = 'Otro';
  await usuario.save();
  assert.equal(usuario.password, hash);
  assert.equal(actualizar.mock.calls[0].arguments[1].$set.password, undefined);
  usuario.password = 'nueva contraseña';
  await usuario.save();
  assert.notEqual(usuario.password, hash);
  assert.equal(await usuario.compararPassword('nueva contraseña'), true);
});

test('usuario: password excluido de consultas y serialización, comparación con selección explícita', async t => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(base.password, 4);
  assert.equal(Usuario.schema.path('password').options.select, false);
  const usuario = Usuario.hydrate({ ...base, _id: new mongoose.Types.ObjectId(), password: hash });
  assert.equal(usuario.toObject().password, undefined);
  assert.equal(usuario.toJSON().password, undefined);
  assert.ok(!JSON.stringify(usuario).includes(hash));
  const sinPassword = Usuario.hydrate({ _id: usuario._id, nombre: base.nombre });
  t.mock.method(Usuario, 'findById', id => {
    assert.ok(id.equals(usuario._id));
    return { select: async seleccion => { assert.equal(seleccion, '+password'); return usuario; } };
  });
  assert.equal(await sinPassword.compararPassword(base.password), true);
});

test('usuario: rechaza password heredado y entradas inválidas o mayores de 72 bytes', async () => {
  const usuario = Usuario.hydrate(base);
  assert.equal(await usuario.compararPassword(base.password), false);
  for (const valor of [undefined, null, {}, '', 'á'.repeat(37)]) assert.equal(await usuario.compararPassword(valor), false);
  await assert.rejects(new Usuario({ ...base, password: 'á'.repeat(37) }).validate());
});

test('usuario: bloquea escrituras que evaden el hash de save', async () => {
  for (const ejecutar of [
    () => Usuario.updateOne({}, { $set: { password: 'texto' } }),
    () => Usuario.updateMany({}, { password: 'texto' }),
    () => Usuario.findOneAndUpdate({}, { $set: { password: 'texto' } }),
    () => Usuario.updateOne({}, { $rename: { nombre: 'password' } }),
    () => Usuario.updateOne({}, { nombre: 'Nombre' }, { upsert: true }),
    () => Usuario.replaceOne({}, base),
    () => Usuario.findOneAndReplace({}, base),
    () => Usuario.insertMany([base]),
    () => Usuario.bulkWrite([{ insertOne: { document: base } }])
  ]) await assert.rejects(async () => ejecutar(), /Usa /);
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
