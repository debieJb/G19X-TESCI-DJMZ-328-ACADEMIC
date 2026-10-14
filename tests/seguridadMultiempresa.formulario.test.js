const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const script = readFileSync(join(__dirname, '../public/js/destinatariosFormulario.js'), 'utf8');

test('estimación empresarial: email deshabilitado no cuenta en ninguno de los modos', () => {
  const tipo = Object.assign(new EventTarget(), { value: 'todos' });
  const canal = Object.assign(new EventTarget(), { value: 'email' });
  const lista = [
    { value: 'habilitado', checked: true, dataset: { emailValido: 'true', emailHabilitado: 'true', etiquetas: '["vip"]' } },
    { value: 'deshabilitado', checked: true, dataset: { emailValido: 'true', emailHabilitado: 'false', etiquetas: '["vip"]' } },
    { value: 'historico', checked: true, dataset: { emailValido: 'true', etiquetas: '["vip"]' } }
  ];
  const contactos = Object.assign(new EventTarget(), { querySelectorAll: () => lista });
  const etiquetas = Object.assign(new EventTarget(), { querySelectorAll: () => [{ value: 'vip' }] });
  const estimacion = { textContent: '' };
  const elementos = { 'destinatarios-tipo': tipo, canal, 'destinatarios-contactos': contactos,
    'destinatarios-etiquetas': etiquetas, 'destinatarios-estimacion': estimacion };
  runInNewContext(script, { document: { getElementById: id => elementos[id] }, window: new EventTarget() });
  for (const modo of ['todos', 'contactos', 'etiquetas']) {
    tipo.value = modo; tipo.dispatchEvent(new Event('change'));
    assert.match(estimacion.textContent, /destinatarios: 2/);
  }
  lista[0].dataset.emailHabilitado = 'false';
  contactos.dispatchEvent(new Event('change'));
  assert.match(estimacion.textContent, /destinatarios: 1/);
});
