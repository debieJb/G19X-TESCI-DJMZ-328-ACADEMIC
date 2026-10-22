const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const script = fs.readFileSync(require.resolve('../public/js/recuperacion.js'), 'utf8');

test('recuperación navegador: extrae fragmento en memoria, limpia historial y no realiza peticiones', () => {
  const token = [randomBytes(12).toString('hex'), randomBytes(32).toString('base64url')].join('.');
  const campo = { type: 'text', value: '' }, grupo = { hidden: false }, historial = [];
  vm.runInNewContext(script, { URLSearchParams,
    window: { location: { hash: '#token=' + token, pathname: '/recuperar/restablecer' }, history: { replaceState: (...args) => historial.push(args) } },
    document: { getElementById: id => id === 'token' ? campo : grupo }, fetch: () => assert.fail('No enviar ni consumir en GET') });
  assert.equal(campo.value, token); assert.equal(campo.type, 'hidden'); assert.equal(grupo.hidden, true);
  assert.equal(historial[0][2], '/recuperar/restablecer');
  assert.ok(!JSON.stringify(historial).includes(token));
});

test('recuperación navegador: fragmento inválido se elimina y permite introducir código manualmente', () => {
  const campo = { type: 'text', value: '' }, grupo = { hidden: false };
  vm.runInNewContext(script, { URLSearchParams,
    window: { location: { hash: '#token=manipulado', pathname: '/recuperar/restablecer' }, history: { replaceState() {} } },
    document: { getElementById: id => id === 'token' ? campo : grupo } });
  assert.equal(campo.value, ''); assert.equal(grupo.hidden, false);
});
