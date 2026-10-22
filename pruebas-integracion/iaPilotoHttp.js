// Ejecución explícita: empresa y MongoDB reales, Gemini simulado, cero correo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHmac, createHash } = require('node:crypto');
const mongoose = require('mongoose');
const session = require('express-session');
const request = require('supertest');
test('IA HTTP real: sesión, cuotas persistentes, Gemini simulado y borrador editable', { timeout: 90000 }, async t => {
  assert.equal(process.env.IA_HTTP_REAL_COMPANY_TEST, 'true', 'Prueba real requiere habilitación explícita');
  require('dotenv').config({ quiet: true });
  assert.equal(process.env.AI_QUOTA_BACKEND, 'piloto_local');
  const almacen = require('../services/ia/almacenCuotasPilotoLocal');
  const empresa = new mongoose.Types.ObjectId(almacen.EMPRESA);
  let creado, hashAprobacion;
  const store = new session.MemoryStore();
  // El token de sesión es propio de esta aplicación efímera; no se modifica login.
  const secret = randomBytes(32).toString('hex'), sid = randomBytes(24).toString('hex');
  let conexion;
  t.after(async () => {
    try {
      if (creado) {
        const r = await mongoose.connection.db.collection('campanas').deleteOne({ _id: creado, empresa,
          estado: 'borrador', nombre: '[Prueba HTTP IA] Nickki Velas', 'asistenciaIA.aprobacionHash': hashAprobacion });
        assert.equal(r.deletedCount, 1, 'Limpiar solo el borrador propio, sin tocar campañas existentes');
      }
    } finally { store.clear(); await almacen.cerrar(); if (conexion) await mongoose.disconnect(); }
  });
  conexion = await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
  const Usuario = require('../models/Usuario');
  const usuario = await Usuario.findOne({ empresa, rol: 'admin_empresa', estadoAcceso: 'activo' }).lean();
  assert.ok(usuario);
  const app = require('../appFactory').crearApp({ secret, store, entorno: 'development' });
  const arranque = await require('../services/ia/arranqueIA').preparar(app);
  assert.equal(arranque.backend, 'piloto_local'); assert.equal(arranque.cuotasVerificadas, true);
  await new Promise((resolve, reject) => store.set(sid, { cookie: { maxAge: 600000 }, usuarioId: String(usuario._id), versionSesion: usuario.versionSesion || 0 }, e => e ? reject(e) : resolve()));
  const firma = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `marketing.sid=${encodeURIComponent(`s:${sid}.${firma}`)}`;
  const cliente = request(app);
  const gemini = t.mock.method(global, 'fetch', async (url, opciones) => {
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[a-z0-9.-]+:generateContent$/);
    assert.equal(opciones.method, 'POST');
    const entrada = JSON.parse(JSON.parse(opciones.body).contents[0].parts[0].text);
    assert.equal(entrada.modo, 'crear'); assert.match(entrada.instrucciones, /Nickki Velas/);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
      asunto: 'Conoce Nickki Velas', mensaje: 'Descubre nuestra colección de velas.', llamadaAccion: 'Conoce la colección',
      segmentacion: ['Personas interesadas en velas con consentimiento'] }) }] } }] }));
  });
  const snapshots = async () => {
    const envios = await mongoose.connection.db.collection('enviogmails').find({ empresa }).sort({ _id: 1 }).toArray();
    const ejecuciones = await mongoose.connection.db.collection('ejecuciongmails').find({ empresa }).sort({ _id: 1 }).toArray();
    return createHash('sha256').update(require('bson').serialize({ envios, ejecuciones })).digest('hex');
  };
  const antes = await snapshots();
  const formulario = await cliente.get('/empresa/ia').set('Cookie', cookie).expect(200);
  const csrf = formulario.text.match(/<form method="post" action="\/empresa\/ia\/generar"[^>]*>[\s\S]*?name="_csrf" value="([A-Za-z0-9_-]{43})"/)[1];
  const datos = { nombreCampana: '[Prueba HTTP IA] Nickki Velas', producto: 'Nickki Velas',
    instrucciones: 'Crea una campaña de presentación de Nickki Velas sin inventar descuentos.', confirmacionPrivacidad: 'CONFIRMO' };
  await cliente.post('/empresa/ia/generar').set('Cookie', cookie).send(datos).expect(403);
  assert.equal(gemini.mock.callCount(), 0);
  // Reproducir el entorno observado en el servidor antiguo: backend ausente.
  const backend = process.env.AI_QUOTA_BACKEND, registros = [];
  const log = t.mock.method(console, 'error', (...args) => {
    if (args[0] === '[IA_DIAGNOSTICO]') registros.push(JSON.parse(args[1]));
  });
  try {
    delete process.env.AI_QUOTA_BACKEND;
    const fallo = await cliente.post('/empresa/ia/generar').set('Cookie', cookie).send({ ...datos, _csrf: csrf }).expect(503);
    assert.match(fallo.text, /control de cuotas no está disponible/);
    assert.ok(registros.some(r => r.etapa === 'CUOTA_ALMACEN' && r.codigo === 'FIXTURE_NO_AUTORIZADA'));
    assert.ok(registros.some(r => r.etapa === 'CUOTA' && r.codigo === 'PROVEEDOR'));
    assert.equal(gemini.mock.callCount(), 0);
    console.log('IA_HTTP_FALLO_REPRODUCIDO: backend ausente -> fixture rechaza empresa real; cero llamadas Gemini');
  } finally { process.env.AI_QUOTA_BACKEND = backend; log.mock.restore(); }
  await cliente.get('/empresa/ia/diagnostico').expect(302);
  const diagnostico = await cliente.get('/empresa/ia/diagnostico').set('Cookie', cookie).expect(200);
  assert.equal(diagnostico.body.backend, 'piloto_local'); assert.equal(diagnostico.body.cuotasVerificadas, true);
  assert.equal(diagnostico.body.pid, process.pid);
  const respuesta = await cliente.post('/empresa/ia/generar').set('Cookie', cookie).send({ ...datos, _csrf: csrf }).expect(200);
  assert.match(respuesta.text, /Conoce Nickki Velas/);
  const ticket = respuesta.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1];
  hashAprobacion = createHash('sha256').update(ticket).digest('hex');
  assert.equal(await mongoose.connection.db.collection('campanas').countDocuments({ empresa, 'asistenciaIA.aprobacionHash': hashAprobacion }), 0);
  const body = { _csrf: csrf, ticket, nombre: datos.nombreCampana, objetivo: 'Presentar colección', asunto: 'Nickki Velas: revisión humana',
    mensaje: 'Mensaje revisado por el administrador.', llamadaAccion: 'Conoce la colección', segmentacion: 'Personas interesadas en velas con consentimiento' };
  const guardado = await cliente.post('/empresa/ia/borrador').set('Cookie', cookie).send(body).expect(303);
  const documento = await mongoose.connection.db.collection('campanas').findOne({ empresa, 'asistenciaIA.aprobacionHash': hashAprobacion });
  assert.ok(documento); creado = documento._id;
  assert.equal(documento.estado, 'borrador'); assert.equal(documento.destinatarios, undefined);
  await cliente.get(guardado.headers.location).set('Cookie', cookie).expect(200);
  const edicion = await cliente.get(`/campanas/${creado}/editar`).set('Cookie', cookie).expect(200);
  assert.match(edicion.text, /Nickki Velas: revisión humana/);
  await cliente.post('/empresa/ia/borrador').set('Cookie', cookie).send(body).expect(409);
  assert.equal(gemini.mock.callCount(), 1);
  assert.equal(await snapshots(), antes);
  console.log('IA_HTTP_REAL_OK: MongoDB/empresa/sesión/cuotas/borrador reales; Gemini simulado; Gmail intacto');
});
