const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'preparacion-automatizacion-pruebas';
const { crearContexto } = require('./soporte/sesion');
const Usuario = require('../models/Usuario'), Empresa = require('../models/Empresa'), Campana = require('../models/Campana');
const Contacto = require('../models/Contacto'), Conexion = require('../models/ConexionGmail');
const google = require('../services/googleOAuthClienteService');
const preparacion = require('../services/preparacionAutomatizacionService');
const A = '507f1f77bcf86cd799439011', B = '507f1f77bcf86cd799439012', ID = '507f1f77bcf86cd799439013', C = '507f1f77bcf86cd799439014', D = '507f1f77bcf86cd799439015';
let usuario, actor, cliente, app, cookie, csrf, doc, contactos, conexion, guardar, fetch, empresa;
beforeEach(t => {
  usuario = { _id: ID, rol: 'admin_empresa', empresa: { _id: A, nombre: 'Empresa A' } }; actor = { ...usuario };
  ({ cliente, app, cookie, campanaCsrf: csrf } = crearContexto(t, usuario));
  empresa = { estado: 'activa', correoAutomatizaciones: 'gmail-a@example.test' };
  doc = Campana.hydrate({ _id: C, empresa: A, nombre: 'Borrador', objetivo: 'Objetivo', estado: 'borrador', canal: 'email',
    asunto: 'Asunto', cuerpoTexto: 'Contenido', versionFlujo: 2 });
  conexion = { estado: 'conectada', email: 'gmail-a@example.test', scopes: [google.GMAIL_SEND] };
  contactos = [
    { _id: D, empresa: A, nombre: 'Autorizado', email: 'autorizado@example.test', activo: true, canales: { email: true }, consentimientoMarketing: { estado: 'otorgado', fecha: new Date(Date.now() - 10000), fuente: 'Autorización ficticia' } },
    { _id: B, empresa: A, nombre: 'Sin consentimiento', email: 'no-autorizado@example.test', activo: true, canales: { email: true } },
    { _id: ID, empresa: B, nombre: 'Contacto ajeno', email: 'ajeno@example.test', activo: true, canales: { email: true }, consentimientoMarketing: { estado: 'otorgado', fecha: new Date(), fuente: 'Otra empresa' } }
  ];
  t.mock.method(Usuario, 'findOne', () => ({ select: () => ({ lean: async () => actor }) }));
  t.mock.method(Empresa, 'findById', id => { assert.equal(String(id), A); return { select: () => ({ lean: async () => empresa }) }; });
  t.mock.method(Campana, 'findOne', async filtro => String(filtro._id) === C && String(filtro.empresa) === A ? doc : null);
  t.mock.method(Conexion, 'findOne', filtro => { assert.equal(String(filtro.empresa), A); return { select: () => ({ lean: async () => conexion }) }; });
  t.mock.method(Contacto, 'find', filtro => { assert.equal(String(filtro.empresa), A); return { select: () => ({ sort: () => ({ lean: async () => contactos }) }) }; });
  t.mock.method(google, 'estaConfigurado', () => true);
  guardar = t.mock.method(doc, 'save', async () => { await doc.validate(); return doc; });
  fetch = t.mock.method(global, 'fetch', () => { throw new Error('Ningún envío permitido'); });
  t.mock.method(mongoose, 'connect', () => { throw new Error('MongoDB original prohibido'); });
});
const url = () => `/campanas/${C}/automatizacion`;
const datos = () => ({ contactos: [D, D], modo: 'inmediato', revision: '0', fechaProgramada: '' });

test('automatización: solo muestra contactos propios con consentimiento y envío deshabilitado', async () => {
  const r = await cliente.get(url()).expect(200);
  assert.match(r.text, /autorizado@example.test/); assert.doesNotMatch(r.text, /no-autorizado@|ajeno@/);
  assert.match(r.text, /Envío real no disponible/); assert.match(r.text, /required disabled/);
  assert.match(r.text, /name="_csrf"/); assert.match(r.text, /Correo autorizado: gmail-a@example.test/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('automatización: guarda preparación inmediata sin activar, programar ni duplicar contactos', async () => {
  await cliente.post(url()).send(datos()).expect(303).expect('Location', url() + '?guardado=1');
  assert.equal(doc.estado, 'borrador'); assert.equal(doc.automatizacion.estado, 'preparada');
  assert.equal(doc.automatizacion.revision, 1); assert.equal(doc.destinatarios.contactos.length, 1);
  assert.equal(String(doc.$where.empresa), A); assert.ok(doc.$where.$or);
  assert.equal(guardar.mock.callCount(), 1); assert.equal(fetch.mock.callCount(), 0);
  await cliente.post(url()).send(datos()).expect(409);
  assert.equal(guardar.mock.callCount(), 1);
});

test('automatización: fecha futura UTC se conserva solo como intención', async () => {
  const fecha = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  await cliente.post(url()).send({ ...datos(), modo: 'programado', fechaProgramada: fecha }).expect(303);
  assert.equal(doc.automatizacion.fechaProgramada.toISOString().slice(0, 16), fecha);
  assert.equal(doc.estado, 'borrador'); assert.equal(fetch.mock.callCount(), 0);
});

test('automatización: selección ajena, sin consentimiento, fechas inválidas y campos manipulados no guardan', async () => {
  for (const cambio of [{ contactos: [B] }, { contactos: [ID] }, { contactos: [] }, { modo: 'otro' }, { empresa: B }, { estado: 'activa' },
    { revision: '1' }, { modo: 'programado', fechaProgramada: '2020-01-01T10:00' }, { modo: 'programado', fechaProgramada: '2030-02-31T10:00' }]) {
    await cliente.post(url()).send({ ...datos(), ...cambio }).expect(Object.hasOwn(cambio, 'revision') ? 409 : 422);
  }
  assert.equal(guardar.mock.callCount(), 0);
});

test('automatización: canal y contenido deben estar completos', async () => {
  doc.canal = 'whatsapp'; await cliente.post(url()).send(datos()).expect(422);
  doc.canal = 'email'; doc.asunto = ''; await cliente.post(url()).send(datos()).expect(422);
  assert.equal(guardar.mock.callCount(), 0);
});

test('automatización: revocación de consentimiento se comprueba nuevamente al guardar', async () => {
  await cliente.get(url()).expect(200);
  contactos[0].consentimientoMarketing.estado = 'revocado';
  await cliente.post(url()).send(datos()).expect(422);
  assert.equal(guardar.mock.callCount(), 0);
});

test('automatización: no confunde habilitación técnica o evidencia futura con consentimiento', () => {
  assert.equal(preparacion.consentimiento(contactos[0]), true);
  assert.equal(preparacion.consentimiento(contactos[1]), false);
  assert.equal(preparacion.consentimiento({ ...contactos[0], consentimientoMarketing: { estado: 'otorgado', fecha: new Date(Date.now() + 86400000), fuente: 'Futuro' } }), false);
});

test('automatización: Gmail desconectado o identidad equivocada se muestran sin simular habilitación', async () => {
  conexion.email = 'otro@example.test';
  const r = await cliente.get(url()).expect(200); assert.match(r.text, /Identidad coincidente: No/);
  conexion = null;
  const sin = await cliente.get(url()).expect(200); assert.match(sin.text, /desconectada/);
});

test('automatización: confirmación explícita sigue bloqueada y no llama n8n ni Gmail', async () => {
  await cliente.post(url() + '/confirmar').send({}).expect(422);
  const r = await cliente.post(url() + '/confirmar').send({ confirmacion: 'ENVIAR' }).expect(503);
  assert.match(r.text, /No se envió ni programó/); assert.equal(fetch.mock.callCount(), 0);
});

test('automatización: CSRF ausente o inválido bloquea configuración y confirmación', async () => {
  for (const ruta of [url(), url() + '/confirmar']) {
    await request(app).post(ruta).set('Cookie', cookie).send(datos()).expect(403);
    await request(app).post(ruta).set('Cookie', cookie).send({ ...datos(), _csrf: 'x'.repeat(43) }).expect(403);
  }
  assert.equal(guardar.mock.callCount(), 0);
  await request(app).post(url().replace('/campanas/', '/CAMPANAS/')).set('Cookie', cookie).send(datos()).expect(403);
});

test('automatización: navegación desde detalle y guardado mantienen borrador y selecciones', async () => {
  const detalle = await cliente.get(`/campanas/${C}`).expect(200);
  assert.match(detalle.text, /Configurar automatización/);
  await cliente.get(url()).expect(200);
  await cliente.post(url()).send(datos()).expect(303);
  const guardada = await cliente.get(url() + '?guardado=1').expect(200);
  assert.match(guardada.text, /La campaña sigue en borrador/);
  assert.ok(guardada.text.includes(`value="${D}" checked`));
  assert.equal(fetch.mock.callCount(), 0);
});

test('automatización: concurrencia al guardar devuelve conflicto sin reintentar ni duplicar tareas', async () => {
  guardar.mock.mockImplementation(async () => { throw Object.assign(new Error('Conflicto'), { name: 'DocumentNotFoundError' }); });
  await cliente.post(url()).send(datos()).expect(409);
  assert.equal(guardar.mock.callCount(), 1); assert.equal(fetch.mock.callCount(), 0);
});

test('automatización: imagen se sirve solo para empresa propia y sin bytes extra del Buffer', async t => {
  const png = require('./soporte/imagenPNG').png();
  const pool = Buffer.alloc(png.length + 64, 42); png.copy(pool, 16);
  const bytes = pool.subarray(16, 16 + png.length);
  t.mock.method(Campana, 'findOne', filtro => ({
    then: (resolve, reject) => Promise.resolve(String(filtro._id) === C && String(filtro.empresa) === A ? doc : null).then(resolve, reject),
    select: () => ({ lean: async () => ({ imagenLocal: { datos: bytes } }) })
  }));
  const r = await cliente.get(`/campanas/${C}/imagen`).expect(200).expect('Content-Type', /image\/png/).expect('X-Content-Type-Options', 'nosniff');
  assert.deepEqual(r.body, png); await cliente.get(`/campanas/${B}/imagen`).expect(404);
});

test('campañas: esquema no provisiona colecciones o índices automáticamente', () => {
  assert.equal(Campana.schema.options.autoIndex, false); assert.equal(Campana.schema.options.autoCreate, false);
});

test('automatización: IDs ajenos, usuario pendiente y empresa inactiva se rechazan', async () => {
  await cliente.get(`/campanas/${B}/automatizacion`).expect(404);
  actor.estadoAcceso = 'pendiente_verificacion'; await cliente.get(url()).expect(403);
  delete actor.estadoAcceso; empresa.estado = 'inactiva'; await cliente.get(url()).expect(403);
});

test('automatización: la ruta antigua no permite enviar campañas nuevas aunque estén activas', async () => {
  doc.estado = 'activa';
  const r = await cliente.post(`/campanas/${C}/ejecutar`).send({ confirmacion: 'ENVIAR' }).expect(503);
  assert.match(r.text, /todavía no está integrado/); assert.equal(fetch.mock.callCount(), 0);
});

test('automatización: historial exige confirmación explícita antes de cualquier llamada externa', async () => {
  doc.versionFlujo = undefined; doc.estado = 'activa';
  const r = await request(app).post(`/campanas/${C}/ejecutar`).set('Cookie', cookie).set('X-CSRF-Token', csrf).send({}).expect(422);
  assert.match(r.text, /confirmar explícitamente/); assert.equal(fetch.mock.callCount(), 0);
});

test('borrador: imagen PNG se puede añadir después de aprobar sin enviar ni asignar destinatarios', async () => {
  const imagen = 'data:image/png;base64,' + require('./soporte/imagenPNG').png().toString('base64');
  await cliente.post(url() + '/imagen').send({ imagen, revisionImagen: '0' }).expect(303);
  assert.equal(doc.imagenLocal.mime, 'image/png'); assert.equal(doc.estado, 'borrador');
  assert.equal(doc.destinatarios, undefined); assert.equal(doc.$where.estado, 'borrador');
  assert.equal(String(doc.$where.empresa), A); assert.equal(guardar.mock.callCount(), 1);
  assert.equal(fetch.mock.callCount(), 0);
});

test('borrador: imagen exige CSRF, pertenencia, revisión actual y PNG válido', async () => {
  const ruta = url() + '/imagen', imagen = 'data:image/png;base64,' + require('./soporte/imagenPNG').png().toString('base64');
  await request(app).post(ruta).set('Cookie', cookie).send({ imagen, revisionImagen: '0' }).expect(403);
  await cliente.post(ruta).send({ imagen, revisionImagen: 'anterior' }).expect(409);
  await cliente.post(ruta).send({ imagen: 'data:text/html;base64,aG9sYQ==', revisionImagen: '0' }).expect(422);
  await cliente.post(`/campanas/${B}/automatizacion/imagen`).send({ imagen, revisionImagen: '0' }).expect(404);
  doc.estado = 'activa'; await cliente.post(ruta).send({ imagen, revisionImagen: '0' }).expect(403);
  assert.equal(guardar.mock.callCount(), 0); assert.equal(fetch.mock.callCount(), 0);
});
