const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function interfaz() {
  const eventos = {}, lectores = [];
  const formulario = { addEventListener: (nombre, fn) => { eventos[nombre] = fn; } };
  const archivo = { files: [], value: '', form: formulario, validationMessage: '',
    setCustomValidity(valor) { this.validationMessage = valor; },
    addEventListener: (nombre, fn) => { eventos[nombre] = fn; },
    focus() { this.enfocado = true; } };
  const campo = { value: '' }, estado = { textContent: '' };
  const quitar = { hidden: true, addEventListener: (nombre, fn) => { eventos[nombre] = fn; } };
  const elementos = { imagenArchivo: archivo, imagen: campo, imagenEstado: estado, quitarImagen: quitar };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/imagenCampana.js'), 'utf8'), {
    document: { getElementById: id => elementos[id] },
    FileReader: class { constructor() { lectores.push(this); } readAsDataURL() {} }
  });
  return { archivo, campo, estado, quitar, eventos, lectores,
    seleccionar(file) { archivo.files = [file]; archivo.value = 'imagen.png'; eventos.change(); } };
}

test('imagen: seleccionar y quitar un archivo excesivo libera la validación sin enviar el formulario', () => {
  const ui = interfaz();
  assert.equal(ui.quitar.hidden, true);
  ui.seleccionar({ type: 'image/png', size: 49153 });
  assert.equal(ui.quitar.hidden, false);
  assert.ok(ui.archivo.validationMessage);
  assert.equal(ui.lectores.length, 0);
  ui.eventos.click();
  assert.equal(ui.archivo.value, '');
  assert.equal(ui.campo.value, '');
  assert.equal(ui.archivo.validationMessage, '');
  assert.equal(ui.quitar.hidden, true);
  assert.equal(ui.archivo.enfocado, true);
  assert.equal(ui.estado.textContent, 'Sin imagen.');
  ui.eventos.submit({ preventDefault() { assert.fail('Debe permitir continuar sin imagen'); } });
});

test('imagen: quitar durante la lectura impide que la imagen reaparezca y permite continuar', () => {
  const ui = interfaz();
  ui.seleccionar({ type: 'image/png', size: 48 });
  let bloqueado = false;
  ui.eventos.submit({ preventDefault() { bloqueado = true; } });
  assert.equal(bloqueado, true);
  ui.eventos.click();
  ui.lectores[0].result = 'data:image/png;base64,anterior';
  ui.lectores[0].onload();
  assert.equal(ui.campo.value, '');
  assert.equal(ui.estado.textContent, 'Sin imagen.');
  ui.eventos.submit({ preventDefault() { assert.fail('Lectura cancelada no debe impedir generar'); } });
});

test('imagen: quitar una imagen preparada limpia el contenido enviado', () => {
  const ui = interfaz();
  ui.seleccionar({ type: 'image/png', size: 49152 });
  ui.lectores[0].result = 'data:image/png;base64,preparada';
  ui.lectores[0].onload();
  assert.ok(ui.campo.value);
  ui.eventos.click();
  assert.equal(ui.campo.value, '');
  assert.equal(ui.archivo.value, '');
});
