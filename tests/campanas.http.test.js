const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Instalar las protecciones antes de importar Express. No se lee .env.
const conexiones = [];
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  conexiones.push(mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido en pruebas'); }));
}
const app = require('../app');
const request = require('supertest');
const Campana = require('../models/Campana');
const automatizacion = require('../services/automatizacionService');
const id = '507f1f77bcf86cd799439011';
const ausente = '507f1f77bcf86cd799439012';
const base = { nombre: 'Conservar', objetivo: 'Objetivo', estado: 'pausada' };
let documento, crear, guardar, borrar, buscar, listar;

beforeEach(() => {
  documento = Campana.hydrate({
    _id: id, nombre: '<script>alert(1)</script>', objetivo: 'Objetivo', canal: 'email', estado: 'activa',
    asunto: 'Asunto guardado', cuerpoTexto: 'Texto guardado',
    fechaInicio: '2026-09-21', fechaFin: '2026-09-22', createdAt: '2026-09-20', updatedAt: '2026-09-20'
  });
  guardar = mock.method(documento, 'save', async () => documento);
  buscar = mock.method(Campana, 'findById', async valor => valor === ausente ? null : documento);
  listar = mock.method(Campana, 'find', () => ({ sort: orden => {
    assert.deepEqual(orden, { createdAt: -1, _id: -1 });
    return { lean: async () => [documento.toObject()] };
  } }));
  crear = mock.method(Campana, 'create', async valores => {
    const nuevo = new Campana(valores);
    await nuevo.validate();
    return nuevo;
  });
  borrar = mock.method(Campana, 'deleteOne', async () => ({ deletedCount: 1 }));
});

afterEach(() => {
  for (const metodo of [guardar, buscar, listar, crear, borrar]) metodo.mock.restore();
  for (const metodo of conexiones) assert.equal(metodo.mock.callCount(), 0, 'No debe cargar .env ni conectar MongoDB');
  assert.equal(mongoose.connection.readyState, 0);
});

const post = (ruta, datos) => request(app).post(ruta).type('form').send(datos);
const editar = datos => post(`/campanas/${id}/editar`, datos);

test('automatización: botón POST solo para activas; GET no ejecuta', async t => {
  const ejecutar = t.mock.method(automatizacion, 'ejecutarCampana', async () => {});
  for (const estado of ['borrador', 'programada', 'activa', 'pausada', 'finalizada']) {
    documento.estado = estado;
    const respuesta = await request(app).get(`/campanas/${id}`).expect(200);
    assert.equal(respuesta.text.includes('Ejecutar automatización'), estado === 'activa');
    if (estado === 'activa') assert.ok(respuesta.text.includes(`action="/campanas/${id}/ejecutar" method="post"`));
  }
  await request(app).get(`/campanas/${id}/ejecutar`).expect(404);
  assert.equal(ejecutar.mock.callCount(), 0);
});

test('automatización: usa datos persistidos, ignora el cuerpo y no guarda cambios', async t => {
  const ejecutar = t.mock.method(automatizacion, 'ejecutarCampana', async () => {});
  const anterior = documento.toObject();
  const respuesta = await post(`/campanas/${id}/ejecutar`, {
    nombre: 'MANIPULADO', estado: 'finalizada', canal: 'redes_sociales', _id: ausente, N8N_WEBHOOK_URL: 'http://malicioso.invalid'
  }).expect(303).expect('Location', `/campanas/${id}?automatizacion=enviada`);
  assert.equal(ejecutar.mock.callCount(), 1);
  assert.equal(ejecutar.mock.calls[0].arguments[0], documento);
  assert.deepEqual(documento.toObject(), anterior);
  for (const metodo of [guardar, crear, borrar]) assert.equal(metodo.mock.callCount(), 0);
  const detalle = await request(app).get(respuesta.headers.location).expect(200);
  assert.match(detalle.text, /Solicitud enviada a la automatización/);
  assert.ok(!detalle.text.includes('malicioso.invalid'));
  assert.equal(ejecutar.mock.callCount(), 1);
});

test('automatización: valida id, existencia y estado sin llamar al servicio', async t => {
  const ejecutar = t.mock.method(automatizacion, 'ejecutarCampana', async () => {});
  await post('/campanas/invalido/ejecutar', {}).expect(400);
  assert.equal(buscar.mock.callCount(), 0);
  await post(`/campanas/${ausente}/ejecutar`, {}).expect(404);
  for (const estado of ['borrador', 'programada', 'pausada', 'finalizada']) {
    documento.estado = estado;
    const respuesta = await post(`/campanas/${id}/ejecutar`, { estado: 'activa' }).expect(422);
    assert.match(respuesta.text, /Solo puedes ejecutar campañas activas/);
  }
  assert.equal(ejecutar.mock.callCount(), 0);
});

test('automatización: rechaza canales distintos de email sin llamar al webhook', async t => {
  const ejecutar = t.mock.method(automatizacion, 'ejecutarCampana', async () => {});
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('Webhook externo prohibido en esta prueba'); });
  for (const canal of ['redes_sociales', 'sms', 'otro', undefined, null, '', 'desconocido', 'constructor', '__proto__']) {
    documento.canal = canal;
    const respuesta = await post(`/campanas/${id}/ejecutar`, { canal: 'email' }).expect(422);
    assert.match(respuesta.text, canal === 'redes_sociales' ? /Conecta Facebook y LinkedIn para publicar/ : canal ? /Canal aún no disponible/ : /Selecciona un canal/);
    assert.match(respuesta.text, /role="alert"/);
  }
  assert.equal(ejecutar.mock.callCount(), 0);
  assert.equal(webhook.mock.callCount(), 0);
  assert.equal(guardar.mock.callCount(), 0);
});

test('automatización: detalle indica canales no disponibles y no ofrece ejecutar', async t => {
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('Acceso externo prohibido'); });
  for (const estado of ['activa', 'borrador', 'pausada', 'finalizada']) {
    documento.estado = estado;
    for (const canal of ['redes_sociales', 'sms', 'otro', undefined, null, '', 'desconocido']) {
      documento.canal = canal;
      const respuesta = await request(app).get(`/campanas/${id}`).expect(200);
      assert.match(respuesta.text, canal === 'redes_sociales' ? /Conecta Facebook y LinkedIn para publicar/ : canal ? /Canal aún no disponible/ : /Selecciona un canal/);
      assert.ok(!respuesta.text.includes('Ejecutar automatización'));
      assert.ok(!respuesta.text.includes(`action="/campanas/${id}/ejecutar"`));
    }
  }
  assert.equal(webhook.mock.callCount(), 0);
});

test('automatización: errores del servicio se muestran sin filtrar detalles externos', async t => {
  const ejecutar = t.mock.method(automatizacion, 'ejecutarCampana', async () => {});
  const anterior = documento.toObject();
  for (const [codigo, status, mensaje] of [
    ['CONFIGURACION', 503, 'no está configurada'], ['CONEXION', 502, 'No se pudo confirmar'],
    ['TIMEOUT', 504, 'no respondió a tiempo'], ['RESPUESTA', 502, 'devolvió un error']
  ]) {
    ejecutar.mock.mockImplementation(async () => {
      const error = new automatizacion.ErrorAutomatizacion(codigo);
      error.message = 'https://secreto.invalid/webhook';
      throw error;
    });
    const respuesta = await post(`/campanas/${id}/ejecutar`, {}).expect(status);
    assert.ok(respuesta.text.includes(mensaje));
    assert.ok(!respuesta.text.includes('secreto.invalid'));
    assert.match(respuesta.text, /role="alert"/);
  }
  assert.deepEqual(documento.toObject(), anterior);
  assert.equal(guardar.mock.callCount(), 0);
});

test('automatización: fallos de MongoDB e inesperados mantienen el manejo existente', async t => {
  t.mock.method(console, 'error', () => {});
  const ejecutar = t.mock.method(automatizacion, 'ejecutarCampana', async () => { throw new Error('SECRETO'); });
  const respuesta = await post(`/campanas/${id}/ejecutar`, {}).expect(500);
  assert.ok(!respuesta.text.includes('SECRETO'));
  buscar.mock.mockImplementation(async () => { throw Object.assign(new Error(), { name: 'MongoNetworkError' }); });
  await post(`/campanas/${id}/ejecutar`, {}).expect(503);
  assert.equal(ejecutar.mock.callCount(), 1);
});

test('crear: rechaza estados distintos de borrador sin guardar', async () => {
  for (const estado of ['programada', 'activa', 'pausada', 'finalizada', 'desconocido']) {
    const respuesta = await post('/campanas', { ...base, estado, fechaInicio: '2026-09-21' }).expect(422);
    assert.match(respuesta.text, /Toda campaña nueva debe comenzar en borrador/);
  }
  assert.equal(crear.mock.callCount(), 0);
  await post('/campanas', { ...base, estado: 'borrador' }).expect(303);
  assert.equal(crear.mock.calls[0].arguments[0].estado, 'borrador');
});

const destinos = {
  borrador: ['borrador', 'programada', 'activa'],
  programada: ['programada', 'activa'],
  activa: ['activa', 'pausada', 'finalizada'],
  pausada: ['pausada', 'activa', 'finalizada'],
  finalizada: ['finalizada']
};

for (const [origen, permitidos] of Object.entries(destinos)) {
  for (const destino of Object.keys(destinos)) {
    test(`ciclo de vida: ${origen} → ${destino}`, async () => {
      documento.estado = origen;
      const anterior = documento.toObject();
      const valido = permitidos.includes(destino);
      const respuesta = await editar({ ...base, estado: destino, fechaInicio: '2026-09-21' }).expect(valido ? 303 : 422);
      if (valido) {
        assert.equal(guardar.mock.callCount(), 1);
        assert.equal(documento.estado, destino);
        assert.equal(documento.nombre, base.nombre);
      } else {
        assert.equal(guardar.mock.callCount(), 0);
        assert.deepEqual(documento.toObject(), anterior);
        assert.ok(respuesta.text.includes(`No puedes pasar de ${origen} a ${destino}.`));
        assert.match(respuesta.text, /value="Conservar"/);
        const selector = respuesta.text.match(/<select id="estado"[^>]*>([\s\S]*?)<\/select>/);
        if (selector) assert.ok(!selector[1].includes(`value="${destino}"`));
      }
    });
  }
}

test('ciclo de vida: borrador → activa sin fechaInicio', async () => {
  documento.estado = 'borrador';
  documento.fechaInicio = undefined;
  documento.fechaFin = undefined;
  await editar({ ...base, estado: 'activa' })
    .expect(303).expect('Location', `/campanas/${id}`);
  assert.equal(guardar.mock.callCount(), 1);
  assert.equal(documento.estado, 'activa');
  assert.equal(documento.fechaInicio, undefined);
});

test('programar: exige inicio al entrar y al conservar el estado, sin cambios parciales', async () => {
  for (const origen of ['borrador', 'programada']) {
    documento.estado = origen;
    const anterior = documento.toObject();
    for (const fechaInicio of ['', undefined, '2026-02-30']) {
      const respuesta = await editar({ ...base, estado: 'programada', fechaInicio }).expect(422);
      assert.match(respuesta.text, /fecha de inicio|fecha válida/);
      assert.deepEqual(documento.toObject(), anterior);
    }
  }
  assert.equal(guardar.mock.callCount(), 0);
});

test('edición: solo ofrece el estado actual y sus transiciones válidas', async () => {
  for (const [origen, permitidos] of Object.entries(destinos)) {
    documento.estado = origen;
    const respuesta = await request(app).get(`/campanas/${id}/editar`).expect(200);
    const selector = respuesta.text.match(/<select id="estado"[^>]*>([\s\S]*?)<\/select>/);
    if (origen === 'finalizada') {
      assert.equal(selector, null);
      assert.match(respuesta.text, /no puede volver a otro estado/);
      assert.match(respuesta.text, /name="estado" value="finalizada"/);
    } else {
      assert.ok(selector);
      const opciones = [...selector[1].matchAll(/<option value="([^"]+)"/g)].map(coincidencia => coincidencia[1]);
      assert.deepEqual(opciones, permitidos);
    }
  }
});

test('listado vacío/con datos y formulario nuevo; salida escapada', async () => {
  const respuesta = await request(app).get('/campanas').expect(200).expect('Content-Type', /html/);
  assert.match(respuesta.text, /&lt;script&gt;/);
  assert.ok(!respuesta.text.includes('<script>'));
  assert.ok(respuesta.text.includes(`/campanas/${id}/editar`));
  listar.mock.mockImplementation(() => ({ sort: () => ({ lean: async () => [] }) }));
  assert.match((await request(app).get('/campanas').expect(200)).text, /Aún no hay campañas/);
  const formulario = (await request(app).get('/campanas/nueva').expect(200)).text;
  assert.match(formulario, /Estado inicial: Borrador/);
  assert.ok(!formulario.includes('name="estado"'));
  assert.equal(buscar.mock.callCount(), 0);
});

test('crear: 303, campos permitidos, borrador y opcionales vacíos', async () => {
  await post('/campanas', { nombre: ' Nueva ', objetivo: ' Objetivo ', canal: '', fechaInicio: '', fechaFin: '', admin: 'true', _id: ausente })
    .expect(303).expect('Location', '/campanas');
  const valores = crear.mock.calls[0].arguments[0];
  assert.deepEqual(Object.keys(valores).sort(), ['nombre', 'objetivo', 'canal', 'estado', 'fechaInicio', 'fechaFin', 'asunto', 'cuerpoTexto', 'publicacion'].sort());
  assert.equal(valores.nombre, 'Nueva');
  assert.equal(valores.objetivo, 'Objetivo');
  assert.equal(valores.estado, 'borrador');
  for (const campo of ['canal', 'fechaInicio', 'fechaFin']) assert.equal(valores[campo], undefined);
});

test('formulario: visibilidad inicial y tras errores depende del canal, conservando contenido', async () => {
  const verificar = (html, canal) => {
    const seccion = html.match(/<section id="contenido-email"[^>]*>/);
    assert.ok(seccion);
    assert.equal(/\bhidden\b/.test(seccion[0]), canal !== 'email');
    assert.match(html, /<label for="cuerpoTexto">Mensaje/);
    assert.match(html, /<script src="\/js\/campanaFormulario.js" defer><\/script>/);
    assert.ok(!/<(?:input|textarea)[^>]*name="(?:asunto|cuerpoTexto)"[^>]*disabled/.test(html));
  };
  verificar((await request(app).get('/campanas/nueva').expect(200)).text, '');
  await request(app).get('/js/campanaFormulario.js').expect(200).expect('Content-Type', /javascript/);
  for (const canal of ['email', 'redes_sociales', 'sms', 'otro', '']) {
    documento.canal = canal || undefined;
    const edicion = await request(app).get(`/campanas/${id}/editar`).expect(200);
    verificar(edicion.text, canal);
    assert.match(edicion.text, /value="Asunto guardado"/);
    assert.match(edicion.text, />Texto guardado<\/textarea>/);
    for (const ruta of ['/campanas', `/campanas/${id}/editar`]) {
      const error = await post(ruta, { nombre: 'Conservar', objetivo: '', estado: 'borrador', canal, asunto: 'Escrito', cuerpoTexto: 'Mensaje\nEscrito' }).expect(422);
      verificar(error.text, canal);
      assert.match(error.text, /value="Escrito"/);
      assert.ok(error.text.includes('Mensaje\nEscrito</textarea>'));
    }
    const detalle = await request(app).get(`/campanas/${id}`).expect(200);
    assert.equal(detalle.text.includes('<dt>Asunto</dt>'), canal === 'email');
    assert.equal(detalle.text.includes('<dt>Mensaje</dt>'), canal === 'email');
  }
  assert.equal(guardar.mock.callCount(), 0);
  assert.equal(crear.mock.callCount(), 0);
});

test('formulario: guardar cambios de canal conserva el contenido de email', async () => {
  for (const canal of ['redes_sociales', 'email']) {
    await editar({ ...base, estado: 'activa', canal, asunto: 'Asunto guardado', cuerpoTexto: 'Texto guardado' }).expect(303);
    assert.equal(documento.asunto, 'Asunto guardado');
    assert.equal(documento.cuerpoTexto, 'Texto guardado');
  }
});

test('redes: publicación se guarda, se conserva al cambiar canal y se muestra solo para redes', async () => {
  const publicacion = ' Hola\n</textarea><script>texto</script>';
  await post('/campanas', { nombre: 'Redes', objetivo: 'Objetivo', canal: 'redes_sociales', publicacion }).expect(303);
  assert.equal(crear.mock.calls[0].arguments[0].publicacion, publicacion);
  await editar({ ...base, canal: 'redes_sociales', publicacion }).expect(303);
  assert.equal(documento.publicacion, publicacion);
  for (const canal of ['email', 'sms', 'redes_sociales']) {
    await editar({ ...base, canal }).expect(303);
    assert.equal(documento.publicacion, publicacion);
    const detalle = await request(app).get(`/campanas/${id}`).expect(200);
    assert.equal(detalle.text.includes('<dt>Publicación</dt>'), canal === 'redes_sociales');
    assert.ok(!detalle.text.includes('<script>'));
    const formulario = await request(app).get(`/campanas/${id}/editar`).expect(200);
    assert.equal(/hidden/.test(formulario.text.match(/<section id="contenido-redes"[^>]*>/)[0]), canal !== 'redes_sociales');
    assert.ok(formulario.text.includes(' Hola\n&lt;/textarea&gt;&lt;script&gt;texto&lt;/script&gt;</textarea>'));
  }
  const nuevo = await request(app).get('/campanas/nueva').expect(200);
  assert.match(nuevo.text, /<section id="contenido-redes"[^>]*hidden/);
  for (const canal of ['email', 'redes_sociales', 'sms']) {
    for (const ruta of ['/campanas', `/campanas/${id}/editar`]) {
      const error = await post(ruta, { nombre: 'Redes', objetivo: '', canal, publicacion }).expect(422);
      assert.equal(/hidden/.test(error.text.match(/<section id="contenido-redes"[^>]*>/)[0]), canal !== 'redes_sociales');
      assert.ok(error.text.includes(' Hola\n&lt;/textarea&gt;&lt;script&gt;texto&lt;/script&gt;</textarea>'));
    }
  }
  await editar({ ...base, canal: 'redes_sociales', 'publicacion[]': 'inválido' }).expect(422);
  assert.equal(documento.publicacion, publicacion);
});

test('email: crear y editar guardan contenido y permiten borradores incompletos', async () => {
  const cuerpoTexto = ' Hola\n\n  Segunda línea\n';
  await post('/campanas', { nombre: 'Nueva', objetivo: 'Objetivo', canal: 'email', asunto: ' Asunto ', cuerpoTexto }).expect(303);
  assert.equal(crear.mock.calls[0].arguments[0].asunto, 'Asunto');
  assert.equal(crear.mock.calls[0].arguments[0].cuerpoTexto, cuerpoTexto);
  for (const contenido of [{}, { asunto: 'Solo asunto' }, { cuerpoTexto: 'Solo texto' }, { asunto: '', cuerpoTexto: '' }]) {
    await post('/campanas', { nombre: 'Nueva', objetivo: 'Objetivo', canal: 'email', ...contenido }).expect(303);
  }
  documento.estado = 'borrador';
  await editar({ ...base, estado: 'borrador', canal: 'email', asunto: ' Editado ', cuerpoTexto }).expect(303);
  assert.equal(documento.asunto, 'Editado');
  assert.equal(documento.cuerpoTexto, cuerpoTexto);
  await editar({ ...base, estado: 'borrador', canal: 'email', asunto: '', cuerpoTexto: '' }).expect(303);
  assert.equal(documento.asunto, undefined);
  assert.equal(documento.cuerpoTexto, undefined);
});

test('email: formularios y detalle escapan contenido y conservan entradas tras errores', async () => {
  documento.asunto = '<script>asunto</script>';
  documento.cuerpoTexto = '</textarea><script>texto</script>\nOtra línea';
  for (const ruta of [`/campanas/${id}`, `/campanas/${id}/editar`]) {
    const respuesta = await request(app).get(ruta).expect(200);
    assert.ok(respuesta.text.includes('&lt;script&gt;asunto&lt;/script&gt;'));
    assert.ok(respuesta.text.includes('&lt;/textarea&gt;&lt;script&gt;texto&lt;/script&gt;\nOtra línea'));
    assert.ok(!respuesta.text.includes('<script>'));
  }
  const formulario = await request(app).get('/campanas/nueva').expect(200);
  for (const campo of ['asunto', 'cuerpoTexto']) {
    const elemento = formulario.text.match(new RegExp(`<[^>]+name="${campo}"[^>]*>`))[0];
    assert.ok(!elemento.includes('required'));
  }
  for (const ruta of ['/campanas', `/campanas/${id}/editar`]) {
    const respuesta = await post(ruta, { ...base, objetivo: '', asunto: documento.asunto, cuerpoTexto: documento.cuerpoTexto }).expect(422);
    assert.ok(respuesta.text.includes('&lt;script&gt;asunto&lt;/script&gt;'));
    assert.ok(respuesta.text.includes('&lt;/textarea&gt;&lt;script&gt;texto&lt;/script&gt;\nOtra línea'));
    for (const campo of ['asunto', 'cuerpoTexto']) {
      const invalida = await post(ruta, { ...base, estado: ruta === '/campanas' ? 'borrador' : base.estado, [`${campo}[]`]: 'No es texto' }).expect(422);
      assert.match(invalida.text, /debe contener un valor de texto/);
    }
  }
  assert.equal(crear.mock.callCount(), 0);
  assert.equal(guardar.mock.callCount(), 0);
});

test('email: documentos antiguos y formularios sin campos nuevos conservan sus datos', async () => {
  await editar({ ...base, canal: 'redes_sociales' }).expect(303);
  assert.equal(documento.asunto, 'Asunto guardado');
  assert.equal(documento.cuerpoTexto, 'Texto guardado');
  documento.asunto = undefined;
  documento.cuerpoTexto = undefined;
  documento.canal = 'email';
  for (const ruta of [`/campanas/${id}`, `/campanas/${id}/editar`]) await request(app).get(ruta).expect(200);
  await editar({ ...base, canal: 'email' }).expect(303);
  assert.equal(documento.asunto, undefined);
  assert.equal(documento.cuerpoTexto, undefined);
  assert.equal(String(documento._id), id);
  assert.equal(documento.objetivo, base.objetivo);
});

test('email: ejecutar sin contenido guardado devuelve 422 y no llama al webhook', async t => {
  const webhook = t.mock.method(global, 'fetch', () => { throw new Error('Acceso externo prohibido'); });
  for (const campo of ['asunto', 'cuerpoTexto']) {
    for (const valor of [undefined, null, '', ' \n\t ']) {
      documento.asunto = 'Asunto';
      documento.cuerpoTexto = 'Texto';
      documento[campo] = valor;
      const anterior = documento.toObject();
      const respuesta = await post(`/campanas/${id}/ejecutar`, { asunto: 'No usar', cuerpoTexto: 'No usar' }).expect(422);
      assert.match(respuesta.text, /Completa el asunto y el cuerpo de texto/);
      assert.match(respuesta.text, /role="alert"/);
      assert.deepEqual(documento.toObject(), anterior);
    }
  }
  for (const canal of ['redes_sociales', 'sms', 'otro']) {
    documento.canal = canal;
    const respuesta = await post(`/campanas/${id}/ejecutar`, {}).expect(422);
    assert.match(respuesta.text, canal === 'redes_sociales' ? /Conecta Facebook y LinkedIn para publicar/ : /Canal aún no disponible/);
  }
  assert.equal(webhook.mock.callCount(), 0);
  assert.equal(guardar.mock.callCount(), 0);
});

test('crear/editar: 422, sin persistencia y datos conservados', async () => {
  for (const cambios of [{ objetivo: '' }, { canal: 'invalid' }, { estado: 'invalid' }, { fechaInicio: '2026-02-30' }, { fechaInicio: '2026-09-23', fechaFin: '2026-09-22' }, { 'canal[]': 'email' }]) {
    for (const ruta of ['/campanas', `/campanas/${id}/editar`]) {
      const respuesta = await post(ruta, { ...base, estado: ruta === '/campanas' ? 'borrador' : base.estado, ...cambios }).expect(422);
      assert.match(respuesta.text, /value="Conservar"/);
      assert.match(respuesta.text, /Corrige los campos/);
    }
  }
  for (const estado of [undefined, '']) await editar({ ...base, estado }).expect(422);
  const respuesta = await post('/campanas', { nombre: '<script>"</script>', objetivo: '', fechaInicio: 'no-fecha' }).expect(422);
  assert.ok(!respuesta.text.includes('<script>'));
  assert.match(respuesta.text, /value="no-fecha"/);
  assert.equal(crear.mock.callCount(), 0);
  assert.equal(guardar.mock.callCount(), 0);
});

test('detalle y edición: precarga, escape y fechas UTC', async () => {
  const anterior = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const detalle = await request(app).get(`/campanas/${id}`).expect(200);
    assert.match(detalle.text, /21\/9\/2026/);
    assert.match(detalle.text, /&lt;script&gt;/);
    const formulario = await request(app).get(`/campanas/${id}/editar`).expect(200);
    assert.match(formulario.text, /value="2026-09-21"/);
    assert.match(formulario.text, /value="activa" selected/);
    await editar({ ...base, fechaInicio: '2026-09-21', fechaFin: '2026-09-21' }).expect(303).expect('Location', `/campanas/${id}`);
    assert.equal(documento.fechaInicio.toISOString(), '2026-09-21T00:00:00.000Z');
    assert.equal(documento.fechaFin.toISOString(), '2026-09-21T00:00:00.000Z');
  } finally {
    if (anterior === undefined) delete process.env.TZ; else process.env.TZ = anterior;
  }
});

test('editar: borrar opcionales y proteger campos ajenos al formulario', async () => {
  await editar({ ...base, canal: '', fechaInicio: '', fechaFin: '', _id: ausente, createdAt: '2000-01-01', admin: 'true' }).expect(303);
  for (const campo of ['canal', 'fechaInicio', 'fechaFin']) assert.equal(documento[campo], undefined);
  assert.equal(String(documento._id), id);
  assert.equal(documento.createdAt.toISOString(), '2026-09-20T00:00:00.000Z');
  assert.equal(documento.admin, undefined);
  assert.equal(guardar.mock.callCount(), 1);
});

test('eliminar: GET nunca borra; POST exige confirmación explícita', async () => {
  const pagina = await request(app).get(`/campanas/${id}/eliminar`).expect(200);
  assert.match(pagina.text, /name="confirmacion"/);
  assert.match(pagina.text, /method="post"/);
  assert.equal(borrar.mock.callCount(), 0);
  for (const datos of [{}, { confirmacion: 'no' }, { 'confirmacion[]': 'eliminar' }]) {
    await post(`/campanas/${id}/eliminar`, datos).expect(422);
  }
  assert.equal(borrar.mock.callCount(), 0);
  await post(`/campanas/${id}/eliminar`, { confirmacion: 'eliminar' }).expect(303).expect('Location', '/campanas');
  assert.equal(borrar.mock.callCount(), 1);
  assert.equal(String(borrar.mock.calls[0].arguments[0]._id), id);
});

test('identificadores: 400 antes de consultar y 404 para inexistentes', async () => {
  for (const sufijo of ['', '/editar', '/eliminar']) {
    for (const valor of ['bad', 'z'.repeat(24), id + '%0A']) await request(app).get(`/campanas/${valor}${sufijo}`).expect(400);
  }
  for (const sufijo of ['/editar', '/eliminar']) await post(`/campanas/bad${sufijo}`, base).expect(400);
  assert.equal(buscar.mock.callCount(), 0);
  for (const sufijo of ['', '/editar', '/eliminar']) await request(app).get(`/campanas/${ausente}${sufijo}`).expect(404);
  for (const sufijo of ['/editar', '/eliminar']) await post(`/campanas/${ausente}${sufijo}`, base).expect(404);
  await request(app).get('/no-existe').expect(404);
});

test('campaña eliminada entre lectura y escritura: 404', async () => {
  guardar.mock.mockImplementation(async () => { throw Object.assign(new Error(), { name: 'DocumentNotFoundError' }); });
  await editar(base).expect(404);
  borrar.mock.mockImplementation(async () => ({ deletedCount: 0 }));
  await post(`/campanas/${id}/eliminar`, { confirmacion: 'eliminar' }).expect(404);
});

test('fallos de persistencia: 500/503, sin detalles internos y conservando formulario', async t => {
  t.mock.method(console, 'error', () => {});
  for (const [nombre, status] of [['Error', 500], ['MongoNetworkError', 503]]) {
    const fallar = () => { throw Object.assign(new Error('SECRETO INTERNO'), { name: nombre }); };
    crear.mock.mockImplementation(fallar);
    guardar.mock.mockImplementation(fallar);
    borrar.mock.mockImplementation(fallar);
    listar.mock.mockImplementation(fallar);
    for (const ruta of ['/campanas', `/campanas/${id}/editar`]) {
      const respuesta = await post(ruta, { ...base, estado: ruta === '/campanas' ? 'borrador' : base.estado }).expect(status);
      assert.match(respuesta.text, /value="Conservar"/);
      assert.ok(!respuesta.text.includes('SECRETO INTERNO'));
    }
    await post(`/campanas/${id}/eliminar`, { confirmacion: 'eliminar' }).expect(status);
    buscar.mock.mockImplementation(fallar);
    for (const ruta of ['/campanas', `/campanas/${id}`, `/campanas/${id}/editar`, `/campanas/${id}/eliminar`]) {
      const respuesta = await request(app).get(ruta).expect(status);
      assert.ok(!respuesta.text.includes('SECRETO INTERNO'));
    }
    buscar.mock.mockImplementation(async () => documento);
  }
});
