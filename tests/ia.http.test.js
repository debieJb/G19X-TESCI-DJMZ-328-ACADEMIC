const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
process.env.SESSION_SECRET = 'solo-pruebas-http-ia';
const { crearContexto } = require('./soporte/sesion');
const Usuario = require('../models/Usuario');
const Empresa = require('../models/Empresa');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const proveedores = require('../services/ia/proveedores');
const limites = require('../services/ia/limitesIA');
const ErrorIA = require('../services/ia/ErrorIA');
const A = '507f1f77bcf86cd799439011', B = '507f1f77bcf86cd799439012', ID = '507f1f77bcf86cd799439013';
const datos = () => ({ producto: 'Producto local', categoria: 'software', objetivo: 'presentar', audiencia: 'empresas', tono: 'profesional', canal: 'email' });
const propuesta = () => ({ asunto: 'Conoce {{PRODUCTO}}', mensaje: 'Descubre las posibilidades de {{PRODUCTO}}.', llamadaAccion: 'Solicita información', segmentacion: ['Empresas interesadas'] });
let usuario, cliente, app, cookie, store, actor, empresa, generar, guardar, habilitado;
beforeEach(t => {
  usuario = { _id: ID, rol: 'admin_empresa', nombre: 'Usuario privado', email: 'privado@example.test', empresa: { _id: A, nombre: 'Empresa privada' } };
  actor = { ...usuario }; empresa = { estado: 'activa' }; habilitado = true;
  ({ cliente, app, cookie, store } = crearContexto(t, usuario));
  t.mock.method(mongoose, 'connect', () => { throw new Error('MongoDB original prohibido'); });
  t.mock.method(global, 'fetch', () => { throw new Error('Proveedor real prohibido en pruebas'); });
  t.mock.method(Usuario, 'findOne', () => ({ select: () => ({ lean: async () => actor }) }));
  t.mock.method(Empresa, 'findById', () => ({ select: () => ({ lean: async () => empresa }) }));
  t.mock.method(Contacto, 'find', filtro => {
    assert.equal(String(filtro.empresa), A);
    return { select: () => ({ sort: () => ({ lean: async () => [] }) }) };
  });
  generar = t.mock.fn(async () => propuesta());
  t.mock.method(proveedores, 'disponible', () => habilitado);
  t.mock.method(proveedores, 'crear', () => { if (!habilitado) throw new ErrorIA('DESHABILITADA'); return { nombre: 'Proveedor simulado solo para pruebas', generar }; });
  t.mock.method(limites, 'consumir', async () => {});
  t.mock.method(Campana, 'init', async () => {});
  t.mock.method(Campana.collection, 'listIndexes', () => ({ toArray: async () => [{ key: { empresa: 1, 'asistenciaIA.aprobacionHash': 1 }, unique: true,
    partialFilterExpression: { 'asistenciaIA.aprobacionHash': { $type: 'string' } } }] }));
  guardar = t.mock.method(Campana, 'create', async valores => { await new Campana(valores).validate(); return {}; });
});
const token = async () => (await cliente.get('/empresa/ia').expect(200)).text.match(/<form method="post" action="\/empresa\/ia\/generar"[^>]*>[\s\S]*?name="_csrf" value="([A-Za-z0-9_-]{43})"/)[1];
const crearPropuesta = async (cambios = {}) => {
  const csrf = await token();
  const respuesta = await cliente.post('/empresa/ia/generar').type('form').send({ _csrf: csrf, ...datos(), ...cambios }).expect(200);
  return { csrf, respuesta, ticket: respuesta.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1] };
};
const borrador = p => ({ _csrf: p.csrf, ticket: p.ticket, nombre: 'Borrador revisado', objetivo: 'Presentar producto', asunto: 'Asunto revisado',
  mensaje: 'Mensaje revisado por la persona.', llamadaAccion: 'Solicita información', segmentacion: 'Sugerencia sin aplicar' });

test('IA HTTP: formulario empresarial, privacidad, CSRF y respuestas no cacheables', async () => {
  const res = await cliente.get('/empresa/ia').expect(200).expect('Cache-Control', 'no-store').expect('Referrer-Policy', 'no-referrer');
  for (const name of ['producto', 'categoria', 'objetivo', 'audiencia', 'tono', 'canal', '_csrf']) assert.ok(res.text.includes(`name="${name}"`));
  assert.match(res.text, /No se envían contactos/);
  assert.doesNotMatch(res.text, /name="empresa"|name="rol"/);
});

test('IA HTTP: proveedor deshabilitado no simula resultados ni guarda campañas', async () => {
  habilitado = false;
  const res = await cliente.get('/empresa/ia').expect(200);
  assert.match(res.text, /Generación real deshabilitada/); assert.match(res.text, /disabled/);
  const error = await cliente.post('/empresa/ia/generar').send({ _csrf: await token(), ...datos() }).expect(503);
  assert.doesNotMatch(error.text, /name="ticket"/); assert.equal(generar.mock.callCount(), 0); assert.equal(guardar.mock.callCount(), 0);
});

test('IA HTTP: solicitudes anónimas y superadmin no acceden a recursos empresariales', async () => {
  for (const ruta of ['/empresa/ia/generar', '/empresa/ia/borrador']) await request(app).post(ruta).expect(302).expect('Location', '/login');
  await request(app).get('/empresa/ia').expect(302);
  usuario.rol = actor.rol = 'superadmin';
  await cliente.get('/empresa/ia').expect(403);
});

test('IA HTTP: ambos POST rechazan CSRF ausente, ajeno, Unicode o manipulado', async () => {
  await token();
  for (const ruta of ['/empresa/ia/generar', '/empresa/ia/borrador']) {
    for (const csrf of [undefined, 'x'.repeat(43), 'é'.repeat(43), ['x'.repeat(43)]]) {
      await cliente.post(ruta).send({ _csrf: csrf, ...datos() }).expect(403);
    }
  }
  assert.equal(generar.mock.callCount(), 0); assert.equal(guardar.mock.callCount(), 0);
});

test('IA HTTP: resultados editables no guardan hasta confirmación humana', async () => {
  const p = await crearPropuesta();
  assert.match(p.respuesta.text, /Revisar propuesta generada por IA/);
  for (const campo of ['asunto', 'mensaje', 'llamadaAccion', 'segmentacion']) assert.ok(p.respuesta.text.includes(`name="${campo}"`));
  assert.equal(guardar.mock.callCount(), 0);
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(303).expect('Location', '/campanas');
  const guardado = guardar.mock.calls[0].arguments[0];
  assert.equal(guardado.estado, 'borrador'); assert.equal(guardado.canal, 'email');
  assert.equal(String(guardado.empresa), A); assert.equal(String(guardado.creadoPor), ID);
  assert.equal(guardado.asunto, 'Asunto revisado'); assert.match(guardado.cuerpoTexto, /Solicita información/);
  assert.equal(guardado.segmentacion, undefined); assert.equal(guardado.llamadaAccion, undefined);
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(409);
  assert.equal(guardar.mock.callCount(), 1);
});

test('IA HTTP: no acepta empresa, estado activo, rol ni canal manipulados', async () => {
  const csrf = await token();
  for (const cambio of [{ empresa: B }, { contactos: [B] }, { canal: 'whatsapp' }]) {
    await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...datos(), ...cambio }).expect(422);
  }
  const p = await crearPropuesta();
  for (const cambio of [{ empresa: B }, { rol: 'superadmin' }, { estado: 'activa' }]) {
    await cliente.post('/empresa/ia/borrador').send({ ...borrador(p), ...cambio }).expect(422);
  }
  assert.equal(guardar.mock.callCount(), 0);
});

test('IA HTTP: una propuesta de otra sesión no puede guardarse', async () => {
  const p = await crearPropuesta();
  await request(app).post('/empresa/ia/borrador').set('Cookie', cookie).send({ ...borrador(p), ticket: 'x'.repeat(43) }).expect(409);
  // Una sesión nueva carece del ticket aunque use la misma cuenta.
  await new Promise((resolve, reject) => store.all((err, sesiones) => {
    if (err) return reject(err);
    const sid = Object.keys(sesiones)[0]; delete sesiones[sid].iaPropuesta;
    store.set(sid, sesiones[sid], e => e ? reject(e) : resolve());
  }));
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(409);
  assert.equal(guardar.mock.callCount(), 0);
});

test('IA HTTP: cambio de empresa después de generar impide trasladar el borrador', async () => {
  const p = await crearPropuesta();
  usuario.empresa = actor.empresa = { _id: B, nombre: 'Otra empresa' };
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(409);
  assert.equal(guardar.mock.callCount(), 0);
});

test('IA HTTP: estados persistidos pendientes bloquean generar y guardar', async () => {
  const csrf = await token(); actor.estadoAcceso = 'pendiente_verificacion';
  await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...datos() }).expect(403);
  await cliente.post('/empresa/ia/borrador').send({ _csrf: csrf }).expect(403);
  assert.equal(generar.mock.callCount(), 0);
});

test('IA HTTP: propuesta caducada no guarda y campos editados respetan límites', async () => {
  const p = await crearPropuesta();
  for (const cambio of [{ nombre: '' }, { asunto: 'a'.repeat(221) }, { mensaje: 'a'.repeat(5001) }, { llamadaAccion: {} }, { asunto: 'Asunto\nBcc: no permitido' }]) {
    await cliente.post('/empresa/ia/borrador').send({ ...borrador(p), ...cambio }).expect(422);
  }
  await new Promise((resolve, reject) => store.all((err, sesiones) => {
    if (err) return reject(err);
    const sid = Object.keys(sesiones)[0]; sesiones[sid].iaPropuesta.expiraEn = Date.now() - 1;
    store.set(sid, sesiones[sid], e => e ? reject(e) : resolve());
  }));
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(409);
  assert.equal(guardar.mock.callCount(), 0);
});

test('IA HTTP: escape de producto local y errores remotos sin filtración', async () => {
  const p = await crearPropuesta({ producto: '</textarea><script>alert(1)</script>' });
  assert.match(p.respuesta.text, /&lt;script&gt;/); assert.doesNotMatch(p.respuesta.text, /<script>alert\(1\)/);
  generar.mock.mockImplementation(async () => { throw new Error('SECRETO_NO_MOSTRAR'); });
  const error = await cliente.post('/empresa/ia/generar').send({ _csrf: p.csrf, ...datos() }).expect(503);
  assert.doesNotMatch(error.text, /SECRETO_NO_MOSTRAR/);
});

test('IA HTTP: límites y tamaño inválido nunca producen guardado', async t => {
  const csrf = await token();
  await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...datos(), producto: 'a'.repeat(101) }).expect(422);
  t.mock.method(limites, 'consumir', async () => { throw new ErrorIA('LIMITE'); });
  await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...datos() }).expect(429);
  assert.equal(generar.mock.callCount(), 0); assert.equal(guardar.mock.callCount(), 0);
});

test('IA flujo: crear campaña ofrece manual o asistida y captura nombre e imagen', async () => {
  const pagina = await cliente.get('/campanas/nueva').expect(200);
  assert.match(pagina.text, /Creación manual/); assert.match(pagina.text, /Creación asistida por IA/);
  const asistente = await cliente.get('/empresa/ia').expect(200);
  assert.match(asistente.text, /name="nombreCampana"/); assert.match(asistente.text, /type="file"/);
});

test('IA flujo: regeneración real conserva datos locales, consume cuota y rota aprobación', async () => {
  const imagen = require('./soporte/imagenPNG').uri();
  const p = await crearPropuesta({ nombreCampana: 'Campaña local privada', imagen });
  const consumo = limites.consumir.mock.callCount();
  generar.mock.mockImplementation(async () => ({ ...propuesta(), asunto: 'Otra propuesta para {{PRODUCTO}}' }));
  const siguiente = await cliente.post('/empresa/ia/regenerar').send(borrador(p)).expect(200);
  const nuevo = siguiente.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1];
  assert.notEqual(nuevo, p.ticket); assert.equal(limites.consumir.mock.callCount(), consumo + 1);
  assert.match(siguiente.text, /Otra propuesta/); assert.match(siguiente.text, /Imagen PNG validada/);
  assert.deepEqual(generar.mock.calls[0].arguments[0], generar.mock.calls[1].arguments[0]);
  assert.doesNotMatch(JSON.stringify(generar.mock.calls.map(c => c.arguments)), /Campaña local|base64|Producto local/);
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(409);
});

test('IA flujo: cuota o proveedor deshabilitado en regeneración conservan la propuesta previa sin fingir otra', async t => {
  const p = await crearPropuesta();
  const cantidad = generar.mock.callCount();
  t.mock.method(limites, 'consumir', async () => { throw new ErrorIA('LIMITE'); });
  const limitada = await cliente.post('/empresa/ia/regenerar').send(borrador(p)).expect(429);
  assert.ok(limitada.text.includes(p.ticket)); assert.match(limitada.text, /Se alcanzó el límite/);
  habilitado = false;
  const deshabilitada = await cliente.post('/empresa/ia/regenerar').send(borrador(p)).expect(503);
  assert.match(deshabilitada.text, /deshabilitada/); assert.equal(generar.mock.callCount(), cantidad);
});

test('IA flujo: aprobación conserva selecciones e imagen como borrador sin destinatarios ni envíos', async () => {
  const imagen = require('./soporte/imagenPNG').uri();
  const p = await crearPropuesta({ nombreCampana: 'Campaña elegida', imagen });
  const id = '507f1f77bcf86cd799439099';
  guardar.mock.mockImplementation(async valores => { const doc = new Campana({ ...valores, _id: id }); await doc.validate(); return doc; });
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(303).expect('Location', `/campanas/${id}/automatizacion`);
  const r = guardar.mock.calls[0].arguments[0];
  assert.equal(r.versionFlujo, 2); assert.equal(r.estado, 'borrador'); assert.equal(r.destinatarios, undefined);
  assert.equal(r.asistenciaIA.producto, datos().producto); assert.equal(r.asistenciaIA.audiencia, datos().audiencia);
  assert.deepEqual(r.asistenciaIA.segmentacion, ['Sugerencia sin aplicar']); assert.equal(r.imagenLocal.mime, 'image/png');
  assert.match(r.asistenciaIA.aprobacionHash, /^[a-f0-9]{64}$/); assert.ok(!r.asistenciaIA.aprobacionHash.includes(p.ticket));
});

test('IA flujo: PNG inválido y regeneración sin CSRF no contactan al proveedor', async () => {
  const csrf = await token();
  await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...datos(), imagen: 'data:image/png;base64,bm8=' }).expect(422);
  await cliente.post('/empresa/ia/regenerar').send({ ticket: 'x'.repeat(43) }).expect(403);
  assert.equal(generar.mock.callCount(), 0);
});

test('IA flujo: sin índice de aprobación no guarda y una carrera duplicada recupera borrador propio', async t => {
  const p = await crearPropuesta();
  const indices = Campana.collection.listIndexes;
  t.mock.method(Campana.collection, 'listIndexes', () => ({ toArray: async () => [] }));
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(503);
  assert.equal(guardar.mock.callCount(), 0);
  Campana.collection.listIndexes = indices;
  guardar.mock.mockImplementation(async () => { throw Object.assign(new Error('Duplicado'), { code: 11000 }); });
  t.mock.method(Campana, 'findOne', filtro => {
    assert.equal(String(filtro.empresa), A); assert.match(filtro['asistenciaIA.aprobacionHash'], /^[a-f0-9]{64}$/);
    return { select: () => ({ lean: async () => ({ _id: B }) }) };
  });
  await cliente.post('/empresa/ia/borrador').send(borrador(p)).expect(303).expect('Location', `/campanas/${B}/automatizacion`);
});

test('IA flujo completo: crear, regenerar, aprobar, editar y preparar mantiene la misma campaña sin envío', async t => {
  let documento;
  guardar.mock.mockImplementation(async valores => { documento = new Campana(valores); await documento.validate(); return documento; });
  t.mock.method(Campana, 'findOne', async filtro => documento && String(filtro._id) === String(documento._id) && String(filtro.empresa) === A ? documento : null);
  t.mock.method(require('../models/ConexionGmail'), 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
  await cliente.get('/campanas/nueva').expect(200);
  const p = await crearPropuesta({ nombreCampana: 'Campaña de recorrido' });
  const otra = await cliente.post('/empresa/ia/regenerar').send(borrador(p)).expect(200);
  const actual = { ...p, ticket: otra.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1] };
  const guardada = await cliente.post('/empresa/ia/borrador').send(borrador(actual)).expect(303);
  assert.equal(guardada.headers.location, `/campanas/${documento._id}/automatizacion`);
  const configuracion = await cliente.get(guardada.headers.location).expect(200);
  assert.match(configuracion.text, /Envío real no disponible/);
  await cliente.get(`/campanas/${documento._id}/editar`).expect(200);
  assert.equal(documento.estado, 'borrador'); assert.equal(documento.destinatarios, undefined);
  assert.equal(guardar.mock.callCount(), 1); assert.equal(generar.mock.callCount(), 2);
});

const libreDatos = () => ({ nombreCampana: 'Promoción libre', instrucciones: 'Redacta una promoción con tono elegante. No inventes descuentos.',
  textoProtegido: 'Descuento exacto: 25%.', confirmacionPrivacidad: 'CONFIRMO' });
const libreSalida = () => ({ asunto: 'Una promoción especial', mensaje: 'Descubre nuestra oferta. Descuento exacto: 25%.',
  llamadaAccion: 'Conoce la promoción', segmentacion: ['Personas interesadas'] });
const iniciarLibre = async () => {
  generar.mock.mockImplementation(async () => libreSalida());
  return crearPropuesta(libreDatos());
};

test('IA libre: formulario amplio obligatorio, preferencias opcionales y advertencia con confirmación', async () => {
  const r = await cliente.get('/empresa/ia').expect(200);
  assert.match(r.text, /name="instrucciones" rows="10" maxlength="4000" required/);
  assert.match(r.text, /name="confirmacionPrivacidad" value="CONFIRMO" required/);
  assert.doesNotMatch(r.text, /<select[^>]+required/);
  for (const name of ['textoProtegido', 'indicacionesAdicionales']) assert.ok(r.text.includes(`name="${name}"`));
});

test('IA libre: instrucciones llegan al proveedor sin contactos, nombre empresarial ni plantillas', async () => {
  const p = await iniciarLibre();
  const contexto = generar.mock.calls[0].arguments[0];
  assert.equal(contexto.instrucciones, libreDatos().instrucciones);
  assert.equal(contexto.textoProtegido, libreDatos().textoProtegido);
  assert.doesNotMatch(JSON.stringify(contexto), /Usuario privado|Empresa privada|privado@example.test|507f1f/);
  for (const accion of ['Editar', 'Pedir cambios', 'Generar otra propuesta', 'Me gusta / Continuar']) assert.ok(p.respuesta.text.includes(accion));
  assert.equal(guardar.mock.callCount(), 0);
});

test('IA libre: sin campos estructurados se puede generar; instrucciones vacías o sin consentimiento no consumen cuota', async t => {
  const csrf = await token();
  const cuota = t.mock.method(limites, 'consumir', async () => {});
  for (const cambio of [{ instrucciones: '' }, { instrucciones: 'x'.repeat(4001) }, { confirmacionPrivacidad: undefined }, { confirmacionPrivacidad: 'true' }]) {
    await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...libreDatos(), ...cambio }).expect(422);
  }
  assert.equal(cuota.mock.callCount(), 0); assert.equal(generar.mock.callCount(), 0);
  generar.mock.mockImplementation(async () => libreSalida());
  await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...libreDatos() }).expect(200);
  assert.equal(cuota.mock.callCount(), 1);
});

test('IA libre: detecta emails, teléfonos y posibles secretos antes de consultar al proveedor', async () => {
  const csrf = await token();
  for (const instrucciones of ['Escribe a persona@example.test', 'Llama al +52 555 123 4567', 'api_key=valor-privado']) {
    await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...libreDatos(), instrucciones }).expect(422);
  }
  assert.equal(generar.mock.callCount(), 0);
});

test('IA libre: no acepta respuesta que cambie el descuento protegido ni permite aprobarlo alterado', async () => {
  const csrf = await token();
  generar.mock.mockImplementation(async () => ({ ...libreSalida(), mensaje: 'Descuento exacto: 30%.' }));
  const error = await cliente.post('/empresa/ia/generar').send({ _csrf: csrf, ...libreDatos() }).expect(422);
  assert.match(error.text, /no conserva literalmente/);
  const p = await iniciarLibre();
  await cliente.post('/empresa/ia/borrador').send({ ...borrador(p), mensaje: 'Descuento exacto: 30%.' }).expect(422);
  assert.equal(guardar.mock.callCount(), 0);
  await cliente.post('/empresa/ia/borrador').send({ ...borrador(p), mensaje: libreSalida().mensaje }).expect(303);
  assert.equal(guardar.mock.calls[0].arguments[0].estado, 'borrador');
});

test('IA libre: revisión envía propuesta editada y cambios, variante usa modo distinto y cada llamada consume cuota', async t => {
  const cuota = t.mock.method(limites, 'consumir', async () => {});
  const p = await iniciarLibre();
  const datosRevision = { ...borrador(p), mensaje: 'Edición humana. Descuento exacto: 25%.',
    cambios: 'Hazlo más elegante.', confirmacionPrivacidad: 'CONFIRMO' };
  const r = await cliente.post('/empresa/ia/revisar').send(datosRevision).expect(200);
  const contexto = generar.mock.calls[1].arguments[0];
  assert.equal(contexto.modo, 'revision'); assert.equal(contexto.cambios, datosRevision.cambios);
  assert.equal(contexto.propuestaActual.mensaje, datosRevision.mensaje);
  const ticket = r.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1];
  await cliente.post('/empresa/ia/regenerar').send({ ...datosRevision, ticket, cambios: '' }).expect(200);
  assert.equal(generar.mock.calls[2].arguments[0].modo, 'variante');
  assert.equal(cuota.mock.callCount(), 3); assert.equal(guardar.mock.callCount(), 0);
  await cliente.post('/empresa/ia/revisar').send(datosRevision).expect(409);
});

test('IA libre: revisión exige CSRF, ticket, cambios y nueva confirmación; no filtra errores ni pierde propuesta ante cuota', async t => {
  const p = await iniciarLibre();
  await cliente.post('/empresa/ia/revisar').send({ ...borrador(p), _csrf: undefined }).expect(403);
  await cliente.post('/empresa/ia/revisar').send({ ...borrador(p), cambios: 'Revisa' }).expect(422);
  await cliente.post('/empresa/ia/revisar').send({ ...borrador(p), confirmacionPrivacidad: 'CONFIRMO' }).expect(422);
  t.mock.method(limites, 'consumir', async () => { throw new ErrorIA('LIMITE'); });
  const r = await cliente.post('/empresa/ia/revisar').send({ ...borrador(p), cambios: 'Revisa', confirmacionPrivacidad: 'CONFIRMO' }).expect(429);
  assert.ok(r.text.includes(p.ticket)); assert.match(r.text, /Descuento exacto: 25%/);
  assert.equal(generar.mock.callCount(), 1); assert.equal(guardar.mock.callCount(), 0);
});

test('IA libre: revisión de otra empresa o pendiente no consulta proveedor y el proveedor deshabilitado no simula cambios', async () => {
  const p = await iniciarLibre();
  const body = { ...borrador(p), cambios: 'Revisa', confirmacionPrivacidad: 'CONFIRMO' };
  actor.empresa = B;
  await cliente.post('/empresa/ia/revisar').send(body).expect(403);
  actor.empresa = usuario.empresa; actor.estadoAcceso = 'pendiente_verificacion';
  await cliente.post('/empresa/ia/revisar').send(body).expect(403);
  delete actor.estadoAcceso; habilitado = false;
  await cliente.post('/empresa/ia/revisar').send(body).expect(503);
  assert.equal(generar.mock.callCount(), 1);
});

test('IA libre completo: crear, revisar, generar variante y continuar abre preparación de un único borrador', async t => {
  let documento;
  guardar.mock.mockImplementation(async valores => { documento = new Campana(valores); await documento.validate(); return documento; });
  t.mock.method(Campana, 'findOne', async filtro => documento && String(filtro._id) === String(documento._id) && String(filtro.empresa) === A ? documento : null);
  t.mock.method(require('../models/ConexionGmail'), 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
  await cliente.get('/campanas/nueva').expect(200).then(r => assert.ok(r.text.includes('/empresa/ia')));
  const p = await iniciarLibre();
  const revision = await cliente.post('/empresa/ia/revisar').send({ ...borrador(p), mensaje: libreSalida().mensaje,
    cambios: 'Usa tono elegante', confirmacionPrivacidad: 'CONFIRMO' }).expect(200);
  const t1 = revision.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1];
  const variante = await cliente.post('/empresa/ia/regenerar').send({ ...borrador(p), ticket: t1,
    mensaje: libreSalida().mensaje, confirmacionPrivacidad: 'CONFIRMO' }).expect(200);
  const t2 = variante.text.match(/name="ticket" value="([A-Za-z0-9_-]{43})"/)[1];
  const r = await cliente.post('/empresa/ia/borrador').send({ ...borrador(p), ticket: t2, mensaje: libreSalida().mensaje }).expect(303);
  await cliente.get(r.headers.location).expect(200).then(res => {
    assert.match(res.text, /Guardar imagen sin enviar/); assert.match(res.text, /Env[ií]o real no disponible/);
  });
  assert.equal(documento.estado, 'borrador'); assert.equal(documento.destinatarios, undefined);
  assert.equal(documento.asistenciaIA.instrucciones, undefined);
  assert.equal(documento.asistenciaIA.textoProtegido, undefined);
  assert.equal(generar.mock.callCount(), 3); assert.equal(guardar.mock.callCount(), 1);
  await cliente.post('/empresa/ia/borrador').send({ ...borrador(p), ticket: t2, mensaje: libreSalida().mensaje }).expect(409);
});
