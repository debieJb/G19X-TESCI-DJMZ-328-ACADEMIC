const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const script = readFileSync(join(__dirname, '../public/js/destinatariosFormulario.js'), 'utf8');

test('destinatarios formulario: cuenta por modo/canal sin duplicar etiquetas y detecta cambio de empresa', () => {
  const tipo = Object.assign(new EventTarget(), { value: 'todos' });
  const canal = Object.assign(new EventTarget(), { value: 'email' });
  const empresa = Object.assign(new EventTarget(), { value: 'empresa-a' });
  const lista = [
    { value: 'uno', checked: true, dataset: { emailValido: 'true', telefono: 'true', etiquetas: '["vip","ventas"]' } },
    { value: 'dos', checked: false, dataset: { emailValido: 'true', telefono: 'false', etiquetas: '["ventas"]' } },
    { value: 'tres', checked: false, dataset: { emailValido: 'false', telefono: 'true', etiquetas: '["vip"]' } }
  ];
  const elegidas = [{ value: 'vip' }, { value: 'ventas' }];
  const contactos = Object.assign(new EventTarget(), { hidden: false, querySelectorAll: () => lista });
  const etiquetas = Object.assign(new EventTarget(), { hidden: false, querySelectorAll: () => elegidas });
  const estimacion = { textContent: '' };
  const elementos = { 'destinatarios-tipo': tipo, canal, empresa, 'destinatarios-contactos': contactos,
    'destinatarios-etiquetas': etiquetas, 'destinatarios-estimacion': estimacion };
  const ventana = new EventTarget();
  runInNewContext(script, { document: { getElementById: id => elementos[id] }, window: ventana });
  assert.match(estimacion.textContent, /destinatarios: 2/);
  assert.equal(contactos.hidden, true); assert.equal(etiquetas.hidden, true);
  tipo.value = 'contactos'; tipo.dispatchEvent(new Event('change'));
  assert.match(estimacion.textContent, /destinatarios: 1/); assert.equal(contactos.hidden, false);
  tipo.value = 'etiquetas'; tipo.dispatchEvent(new Event('change'));
  assert.match(estimacion.textContent, /destinatarios: 2/); assert.equal(etiquetas.hidden, false);
  for (const valor of ['sms', 'whatsapp']) {
    canal.value = valor; canal.dispatchEvent(new Event('change'));
    assert.match(estimacion.textContent, /destinatarios: 0/);
  }
  canal.value = 'email';
  tipo.value = ''; tipo.dispatchEvent(new Event('change'));
  assert.match(estimacion.textContent, /flujo anterior/);
  empresa.value = 'empresa-b'; empresa.dispatchEvent(new Event('change'));
  assert.match(estimacion.textContent, /Carga los contactos/);
  empresa.value = 'empresa-a'; tipo.value = 'contactos'; ventana.dispatchEvent(new Event('pageshow'));
  assert.match(estimacion.textContent, /destinatarios: 1/);
  assert.equal(lista[0].checked, true); assert.equal(lista[1].checked, false);
});
