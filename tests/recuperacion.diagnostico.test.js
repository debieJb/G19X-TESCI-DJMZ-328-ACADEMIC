const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const smtp = require('../services/smtpTransaccionalService');
const { principal } = require('../scripts/diagnosticarRecuperacion');
const env = { EMAIL_USER: 'plataforma@example.test', EMAIL_PASS: 'abcd efgh ijkl mnop', TRANSACTIONAL_PUBLIC_ORIGIN: 'https://plataforma.example.test', TRANSACTIONAL_EMAIL_ENABLED: 'true', TRANSACTIONAL_WORKER_ENABLED: 'true', MONGODB_URI: 'NO_IMPRIMIR_URI' };

test('diagnóstico: SMTP comprueba exclusivamente verify sin colas ni Mongo incluso con flags activos', async t => {
  t.mock.method(mongoose, 'createConnection', () => assert.fail('No conectar MongoDB'));
  const esperado = { codigo: 'REAUTORIZAR_TRANSACCIONAL', faseSmtp: 'AUTH', respuestaSmtp: 535, estadoSmtp: '5.7.8' };
  t.mock.method(smtp, 'crearTransporte', config => {
    assert.equal(config.password, 'abcdefghijklmnop');
    return { verificar: async () => { throw { ...esperado, message: 'SECRETO', response: 'RESPUESTA_PRIVADA' }; }, enviar: () => assert.fail('No enviar') };
  });
  const resultado = await principal(['--comprobar-smtp'], { env });
  assert.deepEqual(resultado, { ok: false, ...esperado, correosEnviados: 0 });
  assert.ok(!JSON.stringify(resultado).includes('PRIVADA'));
});

test('diagnóstico: solo lectura usa agregados y nunca inicializa, actualiza o imprime datos privados', async t => {
  const consultas = []; let cerrado = false;
  t.mock.method(smtp, 'crearTransporte', () => assert.fail('Sin SMTP'));
  const conectar = async (uri, opciones) => {
    assert.equal(uri, env.MONGODB_URI); assert.equal(opciones.autoCreate, false); assert.equal(opciones.autoIndex, false);
    return { close: async () => { cerrado = true; }, db: { collection: () => ({ aggregate: pipeline => {
      consultas.push(pipeline);
      return { toArray: async () => consultas.length === 1 ? [{ _id: 'fallida', cantidad: 1, conToken: 1, conAceptacionProveedor: 0 }]
        : [{ _id: { codigo: 'REAUTORIZAR_TRANSACCIONAL', faseSmtp: 'AUTH', respuestaSmtp: 535, estadoSmtp: '5.7.8', secreto: 'SECRETO' }, cantidad: 1 }] };
    } }) } };
  };
  const resultado = await principal(['--solo-lectura'], { env, conectar });
  assert.equal(resultado.recuperacion[0].estado, 'fallida'); assert.equal(resultado.fallos[0].respuestaSmtp, 535);
  assert.equal(cerrado, true); assert.equal(consultas.length, 2);
  assert.ok(consultas.every(p => p.every(etapa => !etapa.$out && !etapa.$merge)));
  assert.ok(!JSON.stringify(resultado).includes('SECRETO')); assert.ok(!JSON.stringify(resultado).includes('NO_IMPRIMIR_URI'));
});

test('diagnóstico: argumentos desconocidos no conectan ni despachan', async () => {
  for (const args of [[], ['--enviar'], ['--comprobar-smtp', '--reenviar']]) {
    await assert.rejects(principal(args, { env, conectar: () => assert.fail('No conectar') }), /MODO_DIAGNOSTICO_REQUERIDO/);
  }
});
