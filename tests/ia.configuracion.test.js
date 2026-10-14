const { test } = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../services/ia/geminiProveedor');
const proveedores = require('../services/ia/proveedores');
// Tokens sintéticos, nunca credenciales del proyecto ni copias de .env.
const base = () => ({ AI_ENABLED: 'true', AI_PROVIDER: 'gemini', AI_FREE_TIER_CONFIRMED: 'true',
  GEMINI_API_KEY: 'fixture-sintetica.segmento_1-segmento_2', AI_MODEL: 'gemini-3.5-flash-lite' });
const anteriores = new WeakMap();
const entorno = (t, cambios) => {
  if (!anteriores.has(t)) {
    const guardados = new Map();
    anteriores.set(t, guardados);
    t.after(() => { for (const [k, v] of guardados) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  }
  for (const [k, v] of Object.entries(cambios)) {
    if (!anteriores.get(t).has(k)) anteriores.get(t).set(k, process.env[k]);
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};

test('Gemini configuración: admite tokens simples y segmentados sin normalizarlos', () => {
  for (const clave of ['fixture-sintetica-sin-puntos', base().GEMINI_API_KEY]) {
    assert.equal(gemini.configuracion({ ...base(), GEMINI_API_KEY: clave }).apiKey, clave);
  }
});

test('Gemini configuración: rechaza espacios, controles, URL, comillas y segmentos vacíos', () => {
  const clave = base().GEMINI_API_KEY;
  for (const valor of [` ${clave}`, `${clave} `, `${clave}\r\nX-Cabecera: otra`, `${clave}\n`,
    `${clave}\t`, `${clave}\0`, `${clave}\x7f`, `"${clave}"`, `https://${clave}`, `${clave}.`,
    `.${clave}`, clave.replace('.', '..'), `${clave}é`, null, {}, '', 'x'.repeat(19), 'x'.repeat(201)]) {
    assert.throws(() => gemini.configuracion({ ...base(), GEMINI_API_KEY: valor }), e =>
      e.codigo === 'DESHABILITADA' && !e.message.includes(clave));
  }
});

for (const variable of ['AI_ENABLED', 'AI_FREE_TIER_CONFIRMED']) {
  test(`Gemini configuración: ${variable} exige exactamente true textual sin llamar a la red`, t => {
    const fetch = t.mock.method(global, 'fetch', () => { throw Error('Red prohibida'); });
    for (const valor of [undefined, null, false, true, 'TRUE', '1', ' true', 'true ', 'false', '']) {
      assert.throws(() => gemini.configuracion({ ...base(), [variable]: valor }), { codigo: 'DESHABILITADA' });
    }
    assert.equal(fetch.mock.callCount(), 0);
  });
}

test('Gemini configuración: ambas banderas no sustituyen proveedor, clave y modelo válidos', t => {
  const fetch = t.mock.method(global, 'fetch', () => { throw Error('Red prohibida'); });
  for (const cambio of [{ AI_PROVIDER: 'otro' }, { GEMINI_API_KEY: '' }, { AI_MODEL: '' },
    { AI_MODEL: 'models/gemini-3.5-flash-lite' }, { AI_MODEL: '../otro' }, { AI_MODEL: 'modelo?key=valor' }]) {
    entorno(t, { ...base(), ...cambio });
    assert.equal(proveedores.disponible(), false);
    assert.throws(() => proveedores.crear(), { codigo: 'DESHABILITADA' });
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('Gemini configuración: disponible no autentica ni consume cuota con configuración completa', t => {
  entorno(t, base());
  const fetch = t.mock.method(global, 'fetch', () => { throw Error('Red prohibida'); });
  assert.equal(proveedores.disponible(), true);
  assert.equal(proveedores.crear().nombre, 'Gemini');
  assert.equal(fetch.mock.callCount(), 0);
});

test('Gemini transporte simulado: token segmentado llega intacto solo a la cabecera', async t => {
  entorno(t, base());
  const fetch = t.mock.method(global, 'fetch', async (url, opciones) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(opciones.headers['x-goog-api-key'], base().GEMINI_API_KEY);
    assert.ok(!url.includes(base().GEMINI_API_KEY));
    assert.ok(!opciones.body.includes(base().GEMINI_API_KEY));
    assert.equal(opciones.redirect, 'manual');
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: {
      parts: [{ text: JSON.stringify({ asunto: 'Prueba', mensaje: 'Prueba', llamadaAccion: 'Prueba', segmentacion: ['Empresas'] }) }]
    } }] }));
  });
  const contexto = require('../services/ia/contratoIA').contextoPublico({ categoria: 'software', objetivo: 'presentar', audiencia: 'empresas', tono: 'profesional', canal: 'email' });
  await proveedores.crear().generar(contexto);
  assert.equal(fetch.mock.callCount(), 1);
});

test('Gemini deshabilitado: el servicio no consume cuota persistente ni genera con banderas o clave incompletas', async t => {
  const Usuario = require('../models/Usuario'), Empresa = require('../models/Empresa');
  const limites = require('../services/ia/limitesIA');
  const servicio = require('../services/iaService');
  const empresa = '507f1f77bcf86cd799439011', usuario = { _id: '507f1f77bcf86cd799439012', empresa, rol: 'admin_empresa' };
  t.mock.method(Usuario, 'findOne', () => ({ select: () => ({ lean: async () => ({ ...usuario, estadoAcceso: 'activo' }) }) }));
  t.mock.method(Empresa, 'findById', () => ({ select: () => ({ lean: async () => ({ estado: 'activa', estadoActivacion: 'verificada' }) }) }));
  const cuota = t.mock.method(limites, 'consumir', () => { throw Error('No tocar persistencia'); });
  const fetch = t.mock.method(global, 'fetch', () => { throw Error('Red prohibida'); });
  for (const cambio of [{ AI_ENABLED: 'false' }, { AI_FREE_TIER_CONFIRMED: 'false' }, { GEMINI_API_KEY: '' }]) {
    entorno(t, { ...base(), ...cambio });
    await assert.rejects(servicio.generar(usuario, { producto: 'Prueba local', categoria: 'software', objetivo: 'presentar',
      audiencia: 'empresas', tono: 'profesional', canal: 'email' }), { codigo: 'DESHABILITADA' });
  }
  assert.equal(cuota.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});
