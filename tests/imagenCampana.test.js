const { test } = require('node:test');
const assert = require('node:assert/strict');
const imagen = require('../services/imagenCampanaService');
const { png, uri, chunk } = require('./soporte/imagenPNG');
test('imagen local: PNG estructural válido con CRC, dimensiones y píxeles limitados', () => {
  const r = imagen.validar(uri()); assert.equal(r.mime, 'image/png');
  assert.equal(r.ancho, 1); assert.equal(r.alto, 1); assert.deepEqual(r.datos, png());
  assert.equal(imagen.validar(''), undefined); assert.equal(imagen.validar(undefined), undefined);
});
test('imagen local: rechaza SVG, PDF, falso MIME, tamaños y base64 inválido', () => {
  for (const valor of ['data:image/svg+xml;base64,PHN2Zy8+', 'data:application/pdf;base64,JVBERg==',
    'data:image/png;base64,' + Buffer.from('no PNG').toString('base64'), 'data:image/png;base64,' + 'a'.repeat(65537), {}, uri() + '\n']) {
    assert.throws(() => imagen.validar(valor), e => e.status === 422);
  }
});
test('imagen local: CRC alterado y bytes añadidos se rechazan', () => {
  const roto = png(); roto[roto.length - 1] ^= 1;
  for (const buffer of [roto, Buffer.concat([png(), Buffer.from('<script>')])]) assert.throws(() => imagen.validar('data:image/png;base64,' + buffer.toString('base64')));
});
test('imagen local: no admite animación ni metadatos auxiliares arbitrarios', () => {
  const b = png(); const r = Buffer.concat([b.subarray(0, b.length - 12), chunk('acTL', Buffer.alloc(8)), b.subarray(b.length - 12)]);
  assert.throws(() => imagen.validar('data:image/png;base64,' + r.toString('base64')));
});
