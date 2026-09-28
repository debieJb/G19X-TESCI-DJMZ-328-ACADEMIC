const { test } = require('node:test');
const assert = require('node:assert/strict');
const Empresa = require('../models/Empresa');

test('empresa: nombre normalizado, estado y fecha automáticos', async () => {
  const inicio = Date.now();
  const empresa = new Empresa({ nombre: ' Empresa ' });
  await empresa.validate();
  assert.equal(empresa.nombre, 'Empresa');
  assert.equal(empresa.estado, 'activa');
  assert.ok(empresa.fechaRegistro.getTime() >= inicio && empresa.fechaRegistro.getTime() <= Date.now());
});

test('empresa: nombre obligatorio, estados válidos y fecha válida', async () => {
  for (const nombre of [undefined, null, '', '   ']) {
    await assert.rejects(new Empresa({ nombre }).validate(), e => !!e.errors.nombre);
  }
  for (const estado of ['activa', 'inactiva']) await new Empresa({ nombre: 'Empresa', estado }).validate();
  for (const estado of ['otro', '', null]) {
    await assert.rejects(new Empresa({ nombre: 'Empresa', estado }).validate(), e => !!e.errors.estado);
  }
  await assert.rejects(new Empresa({ nombre: 'Empresa', fechaRegistro: 'inválida' }).validate(), e => !!e.errors.fechaRegistro);
});
