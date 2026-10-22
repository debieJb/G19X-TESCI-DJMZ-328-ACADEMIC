const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const script = readFileSync(require('node:path').join(__dirname, '../public/js/envioCampanaManual.js'), 'utf8');
class Elemento {
  constructor() { this.children = []; this.handlers = {}; this.disabled = false; this.hidden = false; this.textContent = ''; }
  addEventListener(nombre, fn) { this.handlers[nombre] = fn; }
  async evento(nombre) { return this.handlers[nombre]?.({ preventDefault() {} }); }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const vacio = { ejecucion: null, envios: [] };
const aprobado = { ejecucion: 'ejecucion', envios: [{ estado: 'aceptado', codigo: 'ACEPTADO_API', gmailId: 'gmail-existente', aceptadoEn: '2026-10-18T18:00:00Z' }] };
const tick = () => new Promise(resolve => setImmediate(resolve));
const fixture = async ({ inicial = vacio, storage = new Map(), bloqueado = false, supervisado = false, responder } = {}) => {
  const selectores = ['data-continuar-envio', 'data-abrir-envio', 'data-confirmacion-envio', 'data-enviar-campana', 'data-cancelar-envio', 'data-actualizar-historial', 'data-estado-campana', 'data-historial-campana'];
  const elementos = Object.fromEntries(selectores.map(s => [s, new Elemento()]));
  elementos['data-enviar-campana'].querySelector = () => new Elemento();
  const panel = { dataset: { envioCampana: 'campana', bloqueado: String(bloqueado), supervisado: String(supervisado), revision: 'a'.repeat(64), destinatarios: 'b'.repeat(64) }, querySelector: s => elementos[s.slice(1, -1)] };
  const peticiones = [];
  const documento = { querySelector: () => panel, createElement: () => new Elemento() };
  runInNewContext(script, { document: documento, URLSearchParams, Uint8Array, Date, setTimeout: fn => fn(),
    FormData: class { *[Symbol.iterator]() { yield ['_csrf', 'csrf-fixture']; } },
    crypto: { getRandomValues: a => a.fill(3) },
    sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    fetch: async (url, opts) => {
      peticiones.push({ url, opts });
      const datos = await (responder ? responder(url, opts, peticiones.length) : inicial);
      if (datos instanceof Error) throw datos;
      return { ok: datos !== false, json: async () => datos };
    }
  });
  await tick();
  return { elementos, peticiones, storage, abrir: elementos['data-abrir-envio'], dialogo: elementos['data-confirmacion-envio'],
    form: elementos['data-enviar-campana'], estado: elementos['data-estado-campana'], historial: elementos['data-historial-campana'],
    actualizar: elementos['data-actualizar-historial'] };
};
const texto = e => [e.textContent, ...e.children.map(texto)].join(' ');

test('supervisado interfaz: una confirmación, dos pasos y huellas, sin autorizar piloto ni reenviar', async () => {
  let registrada = false, aceptados = 0;
  const resultado = () => ({ ejecucion: 'ejecucion', modoMotor: 'supervisado', envios: [1, 2].map(i => ({ estado: i <= aceptados ? 'aceptado' : 'pendiente', destinatario: 'Contacto ' + i })) });
  const f = await fixture({ supervisado: true, responder: (url, opts) => {
    if (url.endsWith('/confirmar')) { registrada = true; return { ejecucion: 'ejecucion' }; }
    if (url.endsWith('/paso')) { aceptados++; return resultado(); }
    return registrada ? resultado() : vacio;
  } });
  await f.abrir.evento('click'); await f.form.evento('submit');
  assert.equal(aceptados, 2);
  const posts = f.peticiones.filter(p => p.opts.method === 'POST');
  assert.equal(posts.length, 3);
  assert.equal(posts[0].opts.body.get('revisionDestinatarios'), 'b'.repeat(64));
  assert.ok(posts.every(p => p.opts.body.get('_csrf') === 'csrf-fixture'));
  await f.actualizar.evento('click'); await f.form.evento('submit');
  assert.equal(f.peticiones.filter(p => p.opts.method === 'POST').length, 3);
});

test('supervisado interfaz: recargar pendientes no envía y un resultado incierto oculta continuar', async () => {
  const inicial = { ejecucion: 'ejecucion', modoMotor: 'supervisado', envios: [{ estado: 'pendiente' }, { estado: 'incierto' }] };
  const f = await fixture({ supervisado: true, inicial });
  assert.equal(f.peticiones.length, 1); assert.equal(f.peticiones[0].opts.method, 'GET');
  assert.equal(f.elementos['data-continuar-envio'].hidden, true);
  assert.match(f.estado.textContent, /concilia/);
});

test('interfaz: campaña aceptada carga resultado sin POST y bloquea repetir tras recargar', async () => {
  for (let i = 0; i < 2; i++) {
    const f = await fixture({ inicial: aprobado });
    assert.equal(f.abrir.disabled, true); assert.equal(f.abrir.hidden, true);
    assert.match(texto(f.historial), /Aceptado por Gmail/);
    assert.match(texto(f.historial), /gmail-existente/);
    await f.form.evento('submit'); await f.abrir.evento('click');
    assert.equal(f.peticiones.length, 1); assert.equal(f.peticiones[0].opts.method, 'GET');
  }
});
test('interfaz: revisar y cancelar no autoriza ni envía', async () => {
  const f = await fixture(); assert.equal(f.abrir.disabled, false);
  await f.abrir.evento('click'); assert.equal(f.dialogo.open, true);
  await f.elementos['data-cancelar-envio'].evento('click');
  assert.equal(f.dialogo.open, false); assert.equal(f.peticiones.length, 1);
});
test('interfaz: una confirmación conserva CSRF y ordena autorización antes del despacho', async () => {
  const f = await fixture({ responder: (url, opts) => opts.method === 'GET' ? vacio : url.endsWith('/autorizar') ? { autorizacion: 'permiso' } : aprobado });
  await f.abrir.evento('click');
  await Promise.all([f.form.evento('submit'), f.form.evento('submit')]);
  assert.equal(f.peticiones.length, 3);
  const [autorizacion, despacho] = f.peticiones.slice(1);
  assert.ok(autorizacion.url.endsWith('/piloto/autorizar'));
  assert.equal(autorizacion.opts.body.get('confirmacion'), 'AUTORIZAR_UN_ENVIO');
  assert.ok(despacho.url.endsWith('/piloto/despachar'));
  assert.equal(despacho.opts.body.get('confirmacion'), 'ENVIAR_UN_CORREO_REAL');
  assert.match(despacho.opts.body.get('idempotencia'), /^[a-f0-9]{48}$/);
  for (const p of [autorizacion, despacho]) { assert.equal(p.opts.body.get('_csrf'), 'csrf-fixture'); assert.equal(p.opts.credentials, 'same-origin'); }
  assert.equal(f.abrir.disabled, true); assert.equal(f.abrir.hidden, true);
});
test('interfaz: fallo de autorización impide despacho y requiere consultar', async () => {
  const f = await fixture({ responder: (_, opts) => opts.method === 'GET' ? vacio : false });
  await f.abrir.evento('click'); await f.form.evento('submit');
  assert.equal(f.peticiones.length, 2); assert.equal(f.abrir.disabled, true);
  assert.match(f.estado.textContent, /Actualiza el historial/);
});
test('interfaz: pérdida de respuesta no repite ni habilita el envío al recargar', async () => {
  const f = await fixture({ responder: (url, opts) => opts.method === 'GET' ? vacio : url.endsWith('/autorizar') ? {} : Error('TIMEOUT') });
  await f.abrir.evento('click'); await f.form.evento('submit');
  assert.equal(f.peticiones.length, 3);
  const recarga = await fixture({ storage: f.storage });
  assert.equal(recarga.abrir.disabled, true);
  await recarga.form.evento('submit'); assert.equal(recarga.peticiones.length, 1);
});
test('interfaz: historial no disponible o requisitos pendientes mantienen cerrado el envío', async () => {
  const error = await fixture({ inicial: false }); assert.equal(error.abrir.disabled, true);
  const bloqueado = await fixture({ bloqueado: true }); assert.equal(bloqueado.abrir.disabled, true);
});
test('interfaz: rechazo e incertidumbre muestran resultados comprensibles sin reintento', async () => {
  for (const estado of ['rechazado', 'incierto', 'enviando']) {
    const f = await fixture({ inicial: { ejecucion: 'ejecucion', envios: [{ estado, historial: [{ estado, fecha: '2026-10-18T18:00:00Z' }] }] } });
    assert.equal(f.abrir.disabled, true); assert.equal(f.abrir.hidden, true);
    assert.doesNotMatch(texto(f.historial), /undefined|ACEPTADO_API/);
    assert.equal(f.peticiones.length, 1);
  }
});
