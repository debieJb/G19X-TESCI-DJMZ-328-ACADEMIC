const { test } = require('node:test');
const assert = require('node:assert/strict');
const { passwordValida } = require('../services/passwordService');
test('contraseñas nuevas: longitud, diversidad y tipos', () => {
  for (const valor of [undefined, null, {}, ['clave-segura'], '', 'corta', 'a'.repeat(20), 'abc'.repeat(8)]) assert.equal(passwordValida(valor), false);
  for (const valor of ['clave-segura-nueva', 'Una frase extensa para recordar']) assert.equal(passwordValida(valor), true);
});
test('contraseñas nuevas: límite bcrypt medido en bytes UTF-8', () => {
  assert.equal(passwordValida('Abcd' + 'x'.repeat(68)), true);
  assert.equal(passwordValida('Abcd' + 'x'.repeat(69)), false);
  assert.equal(passwordValida('Abcd' + 'ñ'.repeat(34)), true);
  assert.equal(passwordValida('Abcd' + 'ñ'.repeat(35)), false);
});
