const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarOpciones, DATA } = require('../scripts/mongoDevRsComun');
const opciones = () => ({ net: { port: 27018, bindIp: '127.0.0.1' },
  replication: { replSet: 'marketingDevRs', oplogSizeMB: 128 }, storage: { dbPath: DATA } });

test('MongoDB 8.2.6: identidad acepta replication.replSet de getCmdLineOpts', () => {
  assert.doesNotThrow(() => validarOpciones(opciones()));
});

test('MongoDB dev: no confunde replSetName con el formato real requerido', () => {
  const entrada = opciones();
  entrada.replication = { replSetName: 'marketingDevRs' };
  assert.throws(() => validarOpciones(entrada), /IDENTIDAD_NODO_INCORRECTA/);
});

for (const [nombre, cambiar] of [
  ['puerto ajeno', o => { o.net.port = 27017; }],
  ['bind público', o => { o.net.bindIp = '0.0.0.0'; }],
  ['otro replica set', o => { o.replication.replSet = 'otro'; }],
  ['datos ajenos', o => { o.storage.dbPath = 'C:\\datos-ajenos'; }],
  ['ruta ausente', o => { delete o.storage.dbPath; }],
  ['replicación ausente', o => { delete o.replication; }]
]) {
  test(`MongoDB dev: rechaza ${nombre}`, () => {
    const entrada = opciones(); cambiar(entrada);
    assert.throws(() => validarOpciones(entrada), /IDENTIDAD_NODO_INCORRECTA/);
  });
}
