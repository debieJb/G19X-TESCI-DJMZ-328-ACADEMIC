const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'solo-fixture-revision-envio-campanas';
const revision = require('../services/revisionEnvioCampanaService');
const { huellaEmail } = require('../services/consentimientoContactoService');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const E = '6ad574f460d35245e124c9ee', U = '507f1f77bcf86cd799439011', C = '507f1f77bcf86cd799439012', D = '507f1f77bcf86cd799439013';
let doc, contacto, cliente, actor, app, ejecucion, envios, autorizacion, piloto;
beforeEach(t => {
  actor = { _id: U, rol: 'admin_empresa', empresa: { _id: E, nombre: 'Empresa de prueba' } };
  ({ cliente, app } = require('./soporte/sesion').crearContexto(t, actor));
  app.locals.gmailManualValidado = true;
  ejecucion = null; envios = []; autorizacion = null; piloto = false;
  doc = Campana.hydrate({ _id: C, empresa: E, nombre: 'Revisión', objetivo: 'Presentación', estado: 'borrador', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Mensaje', updatedAt: new Date(1000) });
  contacto = { _id: D, empresa: E, nombre: 'Autorizado', email: 'persona@example.test', activo: true, canales: { email: true },
    consentimientoMarketing: { estado: 'otorgado', fecha: new Date(0), fuente: 'Registro de prueba', registradoPor: U, registradoEn: new Date(0), emailHash: huellaEmail('persona@example.test') } };
  t.mock.method(require('../models/Usuario'), 'findOne', () => ({ select: () => ({ lean: async () => ({ ...actor, estadoAcceso: 'activo' }) }) }));
  t.mock.method(require('../models/Empresa'), 'findById', () => ({ select: () => ({ lean: async () => ({ estado: 'activa', estadoActivacion: 'verificada', correoAutomatizaciones: 'empresa@example.test' }) }) }));
  t.mock.method(require('../models/ConexionGmail'), 'findOne', () => ({ select: () => ({ lean: async () => ({ estado: 'conectada', email: 'empresa@example.test', scopes: [require('../services/googleOAuthClienteService').GMAIL_SEND] }) }) }));
  t.mock.method(Campana, 'findOne', f => String(f._id) === C && String(f.empresa) === E ? doc : null);
  t.mock.method(Contacto, 'find', () => ({ select: () => ({ lean: async () => [contacto] }) }));
  t.mock.method(Contacto, 'findOne', f => ({ session: () => ({ lean: async () => String(f._id) === D && String(f.empresa) === E ? contacto : null }) }));
  for (const [modelo, valor] of [['EjecucionGmail', () => ejecucion], ['AutorizacionPilotoGmail', () => autorizacion]]) {
    t.mock.method(require('../models/' + modelo), 'findOne', () => ({ lean: async () => valor() }));
    t.mock.method(require('../models/' + modelo), 'exists', () => ({ session: async () => valor() }));
  }
  t.mock.method(require('../models/EnvioGmail'), 'find', () => ({ select: () => ({ lean: async () => envios }) }));
  t.mock.method(require('../models/EnvioGmail'), 'exists', async () => null);
  t.mock.method(require('../models/ControlEnvioGmail'), 'exists', async () => piloto);
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => ({ habilitado: true, automatico: false, empresas: [E], maxDestinatarios: 1 }));
  t.mock.method(mongoose.connection, 'transaction', fn => fn(null));
  t.mock.method(doc, 'save', async () => { await doc.validate(); doc.updatedAt = new Date(2000); return doc; });
  t.mock.method(global, 'fetch', () => { throw Error('RED_PROHIBIDA'); });
});
const ruta = () => `/campanas/${C}/enviar`;
const datos = () => ({ contactos: D, revisionCampana: doc.updatedAt.toISOString() });
test('revisión: activar y preparar guarda selección válida sin enviar, con conflicto optimista y CSRF', async () => {
  const r = await cliente.get(ruta()).expect(200);
  assert.match(r.text, /Activar y preparar envío/); assert.match(r.text, /Destinatarios válidos/);
  const body = datos();
  await cliente.post(`/campanas/${C}/activar-preparar`).send({ ...body, _csrf: 'invalido' }).expect(403);
  await cliente.post(`/campanas/${C}/activar-preparar`).send(body).expect(303).expect('Location', ruta());
  assert.equal(doc.estado, 'activa'); assert.equal(doc.automatizacion.estado, 'preparada'); assert.equal(doc.destinatarios.contactos.length, 1);
  await cliente.post(`/campanas/${C}/activar-preparar`).send(body).expect(409);
  const lista = await cliente.get(ruta()).expect(200); assert.match(lista.text, /Lista para enviar/); assert.match(lista.text, /Confirmar y enviar/);
  assert.equal(global.fetch.mock.callCount(), 0);
});
test('revisión: piloto agotado explica el bloqueo, ejecución existente conserva resultado e impide preparar', async () => {
  piloto = true;
  const r = await cliente.get(ruta()).expect(200); assert.match(r.text, /ya se consumió/);
  ejecucion = { _id: U }; envios = [{ estado: 'aceptado' }];
  const historial = await cliente.get(`/campanas/${C}/historial`).expect(200); assert.match(historial.text, /Enviada a Gmail/);
  assert.doesNotMatch(historial.text, /action="[^\"]*activar-preparar/);
  await cliente.post(`/campanas/${C}/activar-preparar`).send(datos()).expect(409);
});
test('revisión: falta de consentimiento, más de un destinatario y empresa ajena se rechazan', async () => {
  contacto.consentimientoMarketing.estado = 'revocado';
  doc.destinatarios = { tipo: 'contactos', contactos: [D] };
  const r = await cliente.get(ruta()).expect(200); assert.match(r.text, /Consentimiento de marketing/);
  await cliente.post(`/campanas/${C}/activar-preparar`).send(datos()).expect(422);
  await cliente.post(`/campanas/${C}/activar-preparar`).send({ ...datos(), contactos: [D, U] }).expect(422);
  await cliente.post(`/campanas/${C}/activar-preparar`).send({ ...datos(), contactos: U }).expect(422);
  await cliente.get(`/campanas/${U}/enviar`).expect(404);
});
test('revisión: programación se conserva y nunca ofrece activación inmediata', async () => {
  doc.automatizacion = { modo: 'programado', fechaProgramada: new Date(Date.now() + 86400000), estado: 'preparada', revision: 1 };
  const r = await cliente.get(ruta()).expect(200); assert.match(r.text, /Esta campaña está programada/);
  assert.doesNotMatch(r.text, /action="[^\"]*activar-preparar/);
  await cliente.post(`/campanas/${C}/activar-preparar`).send(datos()).expect(409);
  assert.equal(doc.automatizacion.modo, 'programado'); assert.equal(global.fetch.mock.callCount(), 0);
});
test('revisión: exclusiones no filtran contacto ajeno y estados persistidos se entienden', () => {
  const otro = { ...contacto, empresa: U };
  doc.destinatarios = { tipo: 'contactos', contactos: [D] };
  const r = revision.evaluarContactos(doc, [otro]);
  assert.equal(r.validos.length, 0); assert.equal(r.excluidos[0].nombre, 'Contacto no disponible');
  assert.equal(revision.estadoVisible(doc, [{ estado: 'incierto' }]), 'Resultado incierto');
  assert.equal(revision.estadoVisible(doc, [{ estado: 'rechazado' }]), 'Error');
  assert.equal(revision.estadoVisible(doc, [{ estado: 'enviando' }]), 'Enviando');
});

test('supervisado: contactos, todos y etiquetas fijan solo correos propios autorizados sin enviar', async t => {
  const segundo = { ...contacto, _id: U, email: 'segundo@example.test', etiquetas: ['clientes'], consentimientoMarketing: { ...contacto.consentimientoMarketing, emailHash: huellaEmail('segundo@example.test') } };
  contacto.etiquetas = ['clientes'];
  const inactivo = { ...contacto, _id: '507f1f77bcf86cd799439014', activo: false };
  const sinPermiso = { ...contacto, _id: '507f1f77bcf86cd799439015', consentimientoMarketing: { estado: 'revocado' } };
  const ajeno = { ...contacto, _id: '507f1f77bcf86cd799439016', empresa: U };
  const docs = [contacto, segundo, inactivo, sinPermiso, ajeno];
  const politica = { ...require('../config/enviosGmail').obtenerPolitica(), supervisado: true, automatico: false, maxDestinatarios: 5 };
  t.mock.method(require('../config/enviosGmail'), 'obtenerPolitica', () => politica);
  app.locals.gmailSupervisadoValidado = true;
  t.mock.method(require('../models/ControlEnvioGmail'), 'find', () => ({ lean: async () => [] }));
  t.mock.method(Contacto, 'find', () => ({ select: () => ({ lean: async () => docs }), session: () => ({ limit: () => ({ lean: async () => docs }) }) }));
  for (const tipo of ['contactos', 'todos', 'etiquetas']) {
    const body = { revisionCampana: doc.updatedAt.toISOString(), tipo, ...(tipo === 'contactos' ? { contactos: [D, U, inactivo._id, sinPermiso._id] } : tipo === 'etiquetas' ? { etiquetas: 'clientes' } : {}) };
    await cliente.post(`/campanas/${C}/activar-preparar`).send(body).expect(303);
    assert.deepEqual(doc.destinatarios.contactos.map(String).sort(), [D, U].sort());
    const revisada = await cliente.get(ruta()).expect(200);
    assert.match(revisada.text, /data-supervisado="true"/);
    assert.match(revisada.text, /Todos los contactos válidos/);
  }
  await cliente.post(`/campanas/${C}/activar-preparar`).send({ revisionCampana: doc.updatedAt.toISOString(), contactos: ajeno._id }).expect(422);
  assert.equal(global.fetch.mock.callCount(), 0);
});

test('revisión: direcciones repetidas se explican y cuentan una sola vez', () => {
  doc.destinatarios = { tipo: 'todos', contactos: [], etiquetas: [] };
  const r = revision.evaluarContactos(doc, [contacto, { ...contacto, _id: U }]);
  assert.equal(r.validos.length, 1);
  assert.match(r.excluidos[0].motivo, /duplicado/);
});
