'use strict';
const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(objeto, metodo, () => { throw Error('Conexión externa prohibida en pruebas'); });
}
process.env.SESSION_SECRET = 'pruebas-lead-scoring-sin-servicios-externos';
const { crearContexto } = require('./soporte/sesion');
const Contacto = require('../models/Contacto');
const Evento = require('../models/EventoMarketing');
const scoring = require('../services/leadScoringService');
const empresa = '507f1f77bcf86cd799439011', otra = '507f1f77bcf86cd799439012';
const actor = '507f1f77bcf86cd799439013', id = '507f1f77bcf86cd799439014', ajeno = '507f1f77bcf86cd799439015';
const entrada = (tipo = 'solicitud_contacto', referenciaExterna = 'folio-123') => ({ tipo, referenciaExterna,
  evidencia: 'Documento de solicitud comprobado', ocurridoEn: new Date(Date.now() - 3600000).toISOString(), confirmar: 'true' });
let usuario, cliente, eventos, documentos, crear, agregar;
const coincide = (doc, filtro) => Object.entries(filtro).every(([k,v]) => String(doc[k]) === String(v));
beforeEach(t => {
  usuario = { _id: actor, rol: 'admin_empresa', nombre: 'Admin', empresa: { _id: empresa } };
  ({ cliente } = crearContexto(t, usuario));
  eventos = [];
  documentos = [Contacto.hydrate({ _id: id, empresa, nombre: 'Prospecto', email: 'prospecto@example.test' }),
    Contacto.hydrate({ _id: ajeno, empresa: otra, nombre: 'SECRETO', email: 'secreto@example.test' })];
  t.mock.method(Contacto, 'findOne', async filtro => documentos.find(c => coincide(c, filtro)) || null);
  crear = t.mock.method(Evento, 'create', async datos => {
    const doc = new Evento(datos); await doc.validate();
    if (eventos.some(e => String(e._id) === String(doc._id))) throw Object.assign(Error('duplicado'), { code: 11000 });
    eventos.push(doc.toObject()); return doc;
  });
  t.mock.method(Evento, 'findOne', filtro => ({ lean: async () => eventos.find(e => coincide(e,filtro)) || null }));
  t.mock.method(Evento, 'find', filtro => ({ sort: orden => {
    assert.deepEqual(orden, { ocurridoEn: -1, _id: -1 });
    return { lean: async () => eventos.filter(e => coincide(e,filtro)).sort((a,b) => +b.ocurridoEn - +a.ocurridoEn) };
  } }));
  agregar = t.mock.method(Contacto, 'aggregate', async pipeline => {
    const base = pipeline[0].$match;
    assert.ok(!base.empresa || base.empresa instanceof mongoose.Types.ObjectId);
    const lookup = pipeline.find(p => p.$lookup).$lookup;
    assert.deepEqual(lookup.let, { contacto: '$_id', empresa: '$empresa' });
    assert.deepEqual(lookup.pipeline[0].$match.$expr.$and, [{ $eq: ['$contacto','$$contacto'] }, { $eq: ['$empresa','$$empresa'] }]);
    assert.equal(lookup.pipeline[0].$match.verificado, true);
    const rango = pipeline.find(p => p.$match?.puntos).$match.puntos;
    const skip = pipeline.find(p => '$skip' in p).$skip;
    const limit = pipeline.find(p => p.$limit).$limit;
    // Doble de persistencia: las pruebas también comprueban el contrato de la consulta BSON.
    return documentos.filter(c => coincide(c,base)).map(c => ({ ...c.toObject(), ...scoring.calcularPuntuacion(eventos.filter(e => String(e.contacto) === String(c._id) && String(e.empresa) === String(c.empresa))) }))
      .filter(c => c.puntos >= rango.$gte && c.puntos <= rango.$lte).slice(skip, skip + limit);
  });
});
test('scoring HTTP: registra evidencia, actor y empresa del servidor, recalcula y renderiza escapado', async () => {
  const datos = entrada(); datos.evidencia = '<script>evidencia real</script>';
  await cliente.post(`/contactos/${id}/eventos`).send(datos).expect(303);
  assert.equal(eventos.length, 1); assert.equal(String(eventos[0].empresa), empresa);
  assert.equal(String(eventos[0].registradoPor), actor); assert.equal(eventos[0].origen, 'registro_administrativo');
  const res = await cliente.get(`/contactos/${id}`).expect(200);
  assert.match(res.text, /25\/100/); assert.match(res.text, /&lt;script&gt;evidencia real/);
  assert.doesNotMatch(res.text, /<script>evidencia/); assert.match(res.text, /name="_csrf"/);
  await cliente.post(`/contactos/${id}/eventos`).send(entrada('conversion_confirmada', 'venta-1')).expect(303);
  assert.match((await cliente.get(`/contactos/${id}`).expect(200)).text, /65\/100/);
});
test('scoring HTTP: reintentos y concurrencia no duplican; referencia conflictiva devuelve 409', async () => {
  const datos = entrada();
  await Promise.all([cliente.post(`/contactos/${id}/eventos`).send(datos).expect(303), cliente.post(`/contactos/${id}/eventos`).send(datos).expect(303)]);
  assert.equal(eventos.length, 1);
  await cliente.post(`/contactos/${id}/eventos`).send({ ...datos, tipo: 'conversion_confirmada' }).expect(409);
  assert.equal(eventos.length, 1);
});
test('scoring HTTP: todos los roles consultan; operador no registra ni conversiones ni otros eventos', async () => {
  usuario.rol = 'operador';
  const res = await cliente.get(`/contactos/${id}`).expect(200);
  assert.doesNotMatch(res.text, /action="[^\"]+\/eventos"/);
  for (const tipo of Object.keys(scoring.PUNTOS)) await cliente.post(`/contactos/${id}/eventos`).send(entrada(tipo)).expect(403);
  assert.equal(crear.mock.callCount(),0);
  usuario.rol = 'superadmin'; usuario.empresa = null;
  await cliente.post(`/contactos/${ajeno}/eventos`).send(entrada()).expect(303);
  assert.equal(String(eventos[0].empresa), otra);
});
test('scoring HTTP: contacto ajeno, IDs inválidos y sesión ausente se rechazan', async () => {
  await cliente.post(`/contactos/${ajeno}/eventos`).send(entrada()).expect(404);
  await cliente.post('/contactos/no-es-id/eventos').send(entrada()).expect(400);
  await require('supertest')(require('../app')).post(`/contactos/${id}/eventos`).send(entrada()).expect(302);
  assert.equal(crear.mock.callCount(),0);
});
test('scoring HTTP: CSRF obligatorio para administrador empresarial y superadmin', async t => {
  for (const rol of ['admin_empresa','superadmin']) {
    usuario.rol = rol;
    const { cliente: sinCsrf } = crearContexto(t, usuario, { csrf: false });
    await sinCsrf.post(`/contactos/${id}/eventos`).send(entrada()).expect(403);
  }
  assert.equal(crear.mock.callCount(),0);
});
test('scoring HTTP: rechaza manipulación, campos extra, eventos sin evidencia y fechas inválidas', async () => {
  for (const cambio of [{ puntos: 100 }, { empresa: otra }, { registradoPor: actor }, { origen: 'integracion_verificada' },
    { verificado: true }, { tipo: 'gmail_aceptado' }, { tipo: ['clic_verificado'] }, { tipo: { $ne: '' } },
    { evidencia: '' }, { evidencia: ['documento'] }, { evidencia: '1234567' }, { confirmar: 'false' },
    { ocurridoEn: '2099-01-01T00:00:00Z' }, { ocurridoEn: '2026-02-30T00:00:00Z' }, { ocurridoEn: '2026-01-01' },
    { referenciaExterna: { $gt: '' } }]) {
    await cliente.post(`/contactos/${id}/eventos`).send({ ...entrada(), ...cambio }).expect(400);
  }
  assert.equal(crear.mock.callCount(),0);
});
test('scoring HTTP: sin eventos y registros antiguos muestran cero e historial vacío', async () => {
  const res = await cliente.get(`/contactos/${id}`).expect(200);
  assert.match(res.text, /0\/100/); assert.match(res.text, /Sin historial verificado/);
  const lista = await cliente.get('/contactos').expect(200);
  assert.match(lista.text, /0\/100/); assert.doesNotMatch(lista.text, /SECRETO/);
});
test('scoring HTTP: filtros por prioridad, puntuación, etiquetas y activo en consulta empresarial paginada', async () => {
  await cliente.post(`/contactos/${id}/eventos`).send(entrada('conversion_confirmada','v1')).expect(303);
  await cliente.post(`/contactos/${id}/eventos`).send(entrada('conversion_confirmada','v2')).expect(303);
  assert.match((await cliente.get('/contactos?prioridad=alto&min=75&max=90').expect(200)).text, /80\/100/);
  assert.doesNotMatch((await cliente.get('/contactos?prioridad=bajo').expect(200)).text, /prospecto@example.test/);
  assert.doesNotMatch((await cliente.get('/contactos?prioridad=medio').expect(200)).text, /prospecto@example.test/);
  await cliente.get('/contactos?etiqueta=vip&activo=true&pagina=2').expect(200);
  const pipeline = agregar.mock.calls.at(-1).arguments[0];
  assert.equal(pipeline[0].$match.etiquetas, 'vip'); assert.equal(pipeline[0].$match.activo,true);
  assert.equal(pipeline.find(p => '$skip' in p).$skip,30); assert.equal(pipeline.find(p => p.$limit).$limit,31);
  for (const query of ['prioridad=urgente','min=101','min=80&max=20','activo[$ne]=false','etiqueta[$ne]=x','pagina=0']) await cliente.get('/contactos?'+query).expect(400);
});
test('scoring HTTP: indisponibilidad Mongo en listado, detalle y registro produce 503 sin secretos', async t => {
  t.mock.method(console,'error',()=>{});
  const error = () => { throw Object.assign(Error('SECRETO_INTERNO'), { name: 'MongoNetworkError' }); };
  agregar.mock.mockImplementation(error);
  const lista = await cliente.get('/contactos').expect(503); assert.doesNotMatch(lista.text,/SECRETO_INTERNO/);
  crear.mock.mockImplementation(error);
  await cliente.post(`/contactos/${id}/eventos`).send(entrada()).expect(503);
  t.mock.method(Evento,'find',error);
  await cliente.get(`/contactos/${id}`).expect(503);
});
test('scoring HTTP: misma referencia en empresas diferentes es independiente', async () => {
  const datos = entrada();
  await cliente.post(`/contactos/${id}/eventos`).send(datos).expect(303);
  usuario.empresa = { _id: otra };
  await cliente.post(`/contactos/${ajeno}/eventos`).send(datos).expect(303);
  assert.equal(eventos.length,2); assert.notEqual(String(eventos[0]._id),String(eventos[1]._id));
});
