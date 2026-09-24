const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const script = readFileSync(join(__dirname, '../public/js/campanaFormulario.js'), 'utf8');

test('formulario: cambia visibilidad sin borrar ni deshabilitar valores escritos', () => {
  for (const inicial of ['', 'email', 'redes_sociales']) {
    const canal = Object.assign(new EventTarget(), { value: inicial });
    const asunto = Object.freeze({ value: 'Asunto escrito', disabled: false });
    const cuerpoTexto = Object.freeze({ value: 'Mensaje\ncon saltos', disabled: false });
    const contenido = Object.seal({ hidden: false, children: [asunto, cuerpoTexto] });
    const publicacion = Object.freeze({ value: 'Publicación\ncon saltos', disabled: false });
    const contenidoRedes = Object.seal({ hidden: false, children: [publicacion] });
    const elementos = { canal, 'contenido-email': contenido, 'contenido-redes': contenidoRedes, asunto, cuerpoTexto, publicacion };
    const ventana = new EventTarget();
    runInNewContext(script, { document: { getElementById: id => elementos[id] }, window: ventana });
    assert.equal(contenido.hidden, inicial !== 'email');
    assert.equal(contenidoRedes.hidden, inicial !== 'redes_sociales');
    for (const valor of ['email', 'redes_sociales', 'sms', 'otro', '', 'desconocido', 'email']) {
      canal.value = valor;
      canal.dispatchEvent(new Event('change'));
      assert.equal(contenido.hidden, valor !== 'email');
      assert.equal(contenidoRedes.hidden, valor !== 'redes_sociales');
      assert.equal(publicacion.value, 'Publicación\ncon saltos');
      assert.equal(publicacion.disabled, false);
      assert.equal(elementos.asunto.value, 'Asunto escrito');
      assert.equal(elementos.cuerpoTexto.value, 'Mensaje\ncon saltos');
      assert.equal(elementos.asunto.disabled, false);
      assert.equal(elementos.cuerpoTexto.disabled, false);
    }
    canal.value = 'sms';
    ventana.dispatchEvent(new Event('pageshow'));
    assert.equal(contenido.hidden, true);
  }
});
