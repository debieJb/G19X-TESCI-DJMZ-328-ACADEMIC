const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function interfaz(total, seleccion = [], limite = 2, segmentos = false) {
  const elemento = () => ({ checked: false, eventos: {}, addEventListener(n, fn) { this.eventos[n] = fn; } });
  const contactos = Array.from({ length: total }, (_, i) => Object.assign(elemento(), { checked: seleccion.includes(i) }));
  const formulario = Object.assign(elemento(), { dataset: { maxDestinatarios: String(limite) }, querySelectorAll: () => contactos });
  const todos = elemento(), contador = {}, aviso = {}, guardar = {};
  const elementos = { formularioDestinatarios: formulario, seleccionarTodosContactos: todos, contadorContactos: contador, avisoLimiteContactos: aviso, guardarPreparacion: guardar };
  const tipo = Object.assign(elemento(), { value: 'contactos' });
  const etiquetas = Object.assign(elemento(), { selectedOptions: [{ value: 'clientes' }] });
  if (segmentos) {
    elementos['tipo-envio'] = tipo; elementos['etiquetas-envio'] = etiquetas;
    contactos.forEach((c, i) => { c.dataset = { etiquetas: JSON.stringify(i % 2 ? ['clientes'] : []) }; });
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/seleccionContactos.js'), 'utf8'), { document: { getElementById: id => elementos[id] } });
  return { contactos, todos, contador, aviso, guardar, formulario, tipo, etiquetas,
    todosCambiar(checked) { todos.checked = checked; todos.eventos.change(); },
    individual(i, checked) { contactos[i].checked = checked; contactos[i].eventos.change(); },
    bloqueado() { let impedido = false; formulario.eventos.submit({ preventDefault() { impedido = true; } }); return impedido; } };
}
test('selección total de dos, desmarcado e individual actualizan contador y guardado', () => {
  const ui = interfaz(2);
  assert.equal(ui.guardar.disabled, true);
  ui.todosCambiar(true);
  assert.ok(ui.contactos.every(c => c.checked));
  assert.equal(ui.contador.textContent, '2 de 2 contactos seleccionados');
  assert.equal(ui.bloqueado(), false);
  ui.individual(0, false);
  assert.equal(ui.todos.indeterminate, true);
  ui.individual(0, true);
  assert.equal(ui.todos.checked, true);
  ui.todosCambiar(false);
  assert.ok(ui.contactos.every(c => !c.checked));
  assert.equal(ui.bloqueado(), true);
});
test('seleccionar diez conserva selección y bloquea hasta reducir a dos', () => {
  const ui = interfaz(10);
  ui.todosCambiar(true);
  assert.ok(ui.contactos.every(c => c.checked));
  assert.equal(ui.todos.checked, true);
  assert.equal(ui.contador.textContent, '10 de 10 contactos seleccionados');
  assert.equal(ui.aviso.textContent, 'Has superado el límite de destinatarios permitido para esta campaña. Máximo: 2. Seleccionados: 10');
  assert.equal(ui.guardar.disabled, true);
  assert.equal(ui.bloqueado(), true);
  for (let i = 2; i < 10; i++) ui.individual(i, false);
  assert.equal(ui.aviso.hidden, true);
  assert.equal(ui.bloqueado(), false);
  ui.individual(2, true);
  assert.equal(ui.contactos[2].checked, true);
  assert.equal(ui.bloqueado(), true);
});
test('selección persistida, sin elegibles y límite inválido se validan al cargar', () => {
  assert.equal(interfaz(3, [0, 1, 2]).guardar.disabled, true);
  const vacio = interfaz(0);
  assert.equal(vacio.todos.disabled, true);
  assert.equal(vacio.contador.textContent, '0 de 0 contactos seleccionados');
  assert.equal(vacio.bloqueado(), true);
  assert.equal(interfaz(2, [0], 0).bloqueado(), true);
});

test('revisión Gmail: todos y etiquetas sincronizan casillas, selección individual cambia a contactos', () => {
  const ui = interfaz(6, [], 5, true);
  ui.tipo.value = 'todos'; ui.tipo.eventos.change();
  assert.ok(ui.contactos.every(c => c.checked));
  assert.equal(ui.guardar.disabled, true);
  ui.tipo.value = 'etiquetas'; ui.tipo.eventos.change();
  assert.deepEqual(ui.contactos.map(c => c.checked), [false, true, false, true, false, true]);
  assert.equal(ui.contador.textContent, '3 de 6 contactos seleccionados');
  ui.individual(0, true);
  assert.equal(ui.tipo.value, 'contactos');
  assert.equal(ui.bloqueado(), false);
  ui.todosCambiar(false);
  assert.equal(ui.tipo.value, 'contactos');
  assert.ok(ui.contactos.every(c => !c.checked));
  ui.todosCambiar(true);
  assert.equal(ui.bloqueado(), true);
});
