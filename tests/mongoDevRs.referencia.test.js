const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarReferencia } = require('../scripts/mongoDevRsComun');
const referencia = require('../docs/mongodb-indices-autorizados-v2.json');

test('referencia v2: acepta exclusivamente el índice aprobado conservando la referencia anterior', () => {
  assert.doesNotThrow(() => validarReferencia(referencia.anterior, referencia));
});

for (const campo of ['pid', 'configuracion', 'datos', 'indices']) {
  test(`referencia v2: rechaza diferencias adicionales de ${campo}`, () => {
    const copia = structuredClone(referencia);
    copia.actual[campo] = 'diferencia-no-autorizada';
    assert.throws(() => validarReferencia(referencia.anterior, copia), /REFERENCIA_NO_AUTORIZADA/);
  });
}
test('referencia v2: rechaza padre sustituido y definición alterada', () => {
  const padre = { ...referencia.anterior, indices: 'otra-referencia' };
  assert.throws(() => validarReferencia(padre, referencia), /REFERENCIA_NO_AUTORIZADA/);
  const copia = structuredClone(referencia);
  copia.indice.unique = false;
  assert.throws(() => validarReferencia(referencia.anterior, copia), /REFERENCIA_NO_AUTORIZADA/);
});
test('referencia v2: rechaza cualquier índice adicional en el inventario', () => {
  const copia = structuredClone(referencia);
  copia.inventario[0][1].push({ name: 'no-autorizado', key: { otro: 1 } });
  assert.throws(() => validarReferencia(referencia.anterior, copia), /REFERENCIA_NO_AUTORIZADA/);
});
