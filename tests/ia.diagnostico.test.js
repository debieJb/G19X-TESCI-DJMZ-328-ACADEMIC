const { test } = require('node:test');
const assert = require('node:assert/strict');
const proveedor = require('../services/ia/geminiProveedor');
const contrato = require('../services/ia/contratoIA');
const diagnostico = require('../services/ia/diagnosticoIA');
const config = { modelo: 'modelo-prueba', apiKey: 'secreto-no-registrar' };
const contexto = () => contrato.contextoPublico({ categoria: 'software', objetivo: 'presentar', audiencia: 'empresas', tono: 'profesional', canal: 'email' });

test('cuotas diagnóstico: identifica la excepción original sin serializar mensajes arbitrarios', () => {
  assert.equal(diagnostico.codigoCuota(Error('CUOTAS_DEV_NO_AUTORIZADAS')), 'FIXTURE_NO_AUTORIZADA');
  assert.equal(diagnostico.codigoCuota({ code: 18, message: 'secreto@example.test' }), 'MONGO_AUTENTICACION');
  assert.equal(diagnostico.codigoCuota({ code: 26, message: 'URI_PRIVADA' }), 'MONGO_SIN_COLECCION');
  assert.equal(diagnostico.codigoCuota({ name: 'CastError', message: 'ID_PRIVADO' }), 'VALIDACION_CUOTA');
  assert.equal(diagnostico.codigoCuota(Error('clave-privada-no-exponer')), 'INTERNO');
});

test('Gemini modelo: comprueba existencia y generateContent con cabecera privada sin generación', async t => {
  const fetch = t.mock.method(global, 'fetch', async (url, opciones) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/modelo-prueba');
    assert.equal(opciones.method, 'GET'); assert.equal(opciones.redirect, 'manual');
    assert.equal(opciones.headers['x-goog-api-key'], config.apiKey); assert.equal(opciones.body, undefined);
    return new Response(JSON.stringify({ name: 'models/modelo-prueba', supportedGenerationMethods: ['generateContent'] }));
  });
  assert.deepEqual(await proveedor.verificarModelo(config), { modelo: 'modelo-prueba', http: 200, admiteGeneracion: true });
  assert.equal(fetch.mock.callCount(), 1);
});
test('Gemini modelo: no encontrado, método ausente o clave rechazada no se consideran accesibles', async t => {
  t.mock.method(console, 'error', () => {});
  for (const [status, datos] of [[404, {}], [403, {}], [429, {}], [200, { name: 'models/modelo-prueba', supportedGenerationMethods: [] }]]) {
    const fetch = t.mock.method(global, 'fetch', async () => new Response(JSON.stringify(datos), { status }));
    await assert.rejects(proveedor.verificarModelo(config));
    assert.equal(fetch.mock.callCount(), 1); fetch.mock.restore();
  }
});

test('IA diagnóstico: HTTP distingue autenticación, permisos, modelo, cuota y disponibilidad sin exponer respuesta', async t => {
  const log = t.mock.method(console, 'error', () => {});
  for (const status of [400, 401, 403, 404, 429, 500, 503, 504]) {
    const fetch = t.mock.method(global, 'fetch', async () => new Response('privado@example.test secreto-no-registrar', { status }));
    await assert.rejects(proveedor.crear(config).generar(contexto()), { codigo: status === 429 ? 'LIMITE' : 'PROVEEDOR' });
    assert.deepEqual(log.mock.calls.at(-1).arguments, ['[IA_DIAGNOSTICO]', JSON.stringify({ etapa: 'HTTP', codigo: `HTTP_${status}` })]);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test('IA diagnóstico: red y timeout no registran mensaje, URL, clave ni contexto', async t => {
  const log = t.mock.method(console, 'error', () => {});
  for (const [error, codigo] of [[new Error('secreto-no-registrar'), 'RED'],
    [Object.assign(new Error('privado@example.test'), { name: 'AbortError' }), 'TIMEOUT'],
    [new Error('prompt privado', { cause: { code: 'ENOTFOUND' } }), 'ENOTFOUND']]) {
    const fetch = t.mock.method(global, 'fetch', async () => { throw error; });
    await assert.rejects(proveedor.crear(config).generar(contexto()), { codigo: 'PROVEEDOR' });
    assert.deepEqual(JSON.parse(log.mock.calls.at(-1).arguments[1]), { etapa: 'SOLICITUD', codigo });
    fetch.mock.restore();
  }
});

test('IA diagnóstico: JSON inválido y respuesta bloqueada conservan error seguro y etapa', async t => {
  const log = t.mock.method(console, 'error', () => {});
  for (const [body, etapa] of [['privado', 'LEER_RESPUESTA'], ['null', 'FORMATO'], ['{"promptFeedback":{"blockReason":"SAFETY"}}', 'FORMATO']]) {
    const fetch = t.mock.method(global, 'fetch', async () => new Response(body));
    await assert.rejects(proveedor.crear(config).generar(contexto()), { codigo: 'RESPUESTA' });
    assert.deepEqual(JSON.parse(log.mock.calls.at(-1).arguments[1]), { etapa, codigo: 'RESPUESTA' });
    fetch.mock.restore();
  }
});

test('IA diagnóstico: vocabulario cerrado descarta valores sensibles arbitrarios', t => {
  const log = t.mock.method(console, 'error', () => {});
  diagnostico('prompt privado', 'secreto-no-registrar');
  assert.deepEqual(log.mock.calls[0].arguments, ['[IA_DIAGNOSTICO]', '{"etapa":"GENERACION","codigo":"INTERNO"}']);
});
