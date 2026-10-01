const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Contacto = require('../models/Contacto');
const base = { nombre: ' Cliente ', empresa: new mongoose.Types.ObjectId(), email: ' CLIENTE@EXAMPLE.TEST ' };
test('contacto: normalización, relaciones, canales, activo y timestamps', async () => {
  const contacto = new Contacto(base);
  await contacto.validate();
  assert.equal(contacto.nombre, 'Cliente');
  assert.equal(contacto.email, 'cliente@example.test');
  assert.equal(contacto.activo, true);
  assert.deepEqual(contacto.etiquetas, []);
  for (const canal of ['email', 'whatsapp', 'sms']) assert.equal(contacto.canales[canal], false);
  assert.equal(Contacto.schema.options.timestamps, true);
  assert.equal(Contacto.schema.path('empresa').options.ref, 'Empresa');
  assert.equal(Contacto.schema.path('creadoPor').options.ref, 'Usuario');
});
test('contacto: nombre y empresa obligatorios y al menos email o teléfono', async () => {
  for (const cambios of [{ nombre: ' ' }, { empresa: undefined }, { empresa: 'inválida' }, { email: 'incorrecto' }, { email: undefined }, { email: ' ', telefono: ' ' }]) {
    await assert.rejects(new Contacto({ ...base, ...cambios }).validate(), { name: 'ValidationError' });
  }
  const contacto = new Contacto({ ...base, email: ' ', telefono: ' 5551234 ' });
  await contacto.validate();
  assert.equal(contacto.email, undefined);
  assert.equal(contacto.telefono, '5551234');
});
test('contacto: índices únicos parciales por empresa para email y teléfono', () => {
  const indices = Contacto.schema.indexes();
  for (const campo of ['email', 'telefono']) {
    const indice = indices.find(([claves]) => claves[campo] === 1);
    assert.deepEqual(indice[0], { empresa: 1, [campo]: 1 });
    assert.equal(indice[1].unique, true);
    assert.deepEqual(indice[1].partialFilterExpression, { [campo]: { $type: 'string' } });
  }
});
