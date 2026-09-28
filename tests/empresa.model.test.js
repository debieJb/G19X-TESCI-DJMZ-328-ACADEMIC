const { test } = require('node:test');
const assert = require('node:assert/strict');
const Empresa = require('../models/Empresa');

test('empresa: automatizaciones independientes con defaults y URLs excluidas de consultas', async () => {
  const primera = new Empresa({ nombre: 'A' });
  const segunda = new Empresa({ nombre: 'B' });
  await primera.validate();
  assert.equal(primera.automatizaciones.email.habilitada, true);
  assert.equal(primera.automatizaciones.whatsapp.habilitada, false);
  assert.equal(primera.automatizaciones.facebook.habilitada, false);
  for (const canal of ['email', 'whatsapp', 'facebook']) {
    assert.equal(primera.automatizaciones[canal].webhookUrl, '');
    assert.equal(Empresa.schema.path(`automatizaciones.${canal}`).schema.path('webhookUrl').options.select, false);
  }
  primera.automatizaciones.email.webhookUrl = 'https://a.example.test/hook';
  assert.equal(segunda.automatizaciones.email.webhookUrl, '');
  await primera.validate();
  primera.automatizaciones.email.webhookUrl = 'javascript:alert(1)';
  await assert.rejects(primera.validate());
});

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
