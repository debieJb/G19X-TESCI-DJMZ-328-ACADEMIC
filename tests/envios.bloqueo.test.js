const { consentimientoPrueba } = require('./soporte/consentimiento');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'fixture-bloqueo-envios-no-utilizar-en-produccion';
const Campana = require('../models/Campana');
const Empresa = require('../models/Empresa');
const Contacto = require('../models/Contacto');
const { crearContexto } = require('./soporte/sesion');
const selector = require('../services/automatizacionService');
const email = require('../services/emailService');
const A = new mongoose.Types.ObjectId(), actor = new mongoose.Types.ObjectId(), id = new mongoose.Types.ObjectId();

for (const rol of ['superadmin', 'admin_empresa', 'operador']) {
  test(`bloqueo total: ${rol}, campañas históricas y nuevas, cuerpo y cabecera no habilitan envíos`, async t => {
    const { cliente, adminCsrf, campanaCsrf } = crearContexto(t, { _id: actor, rol, empresa: { _id: A } });
    const doc = { _id: id, empresa: A, nombre: 'Prueba', objetivo: 'Prueba', canal: 'email', estado: 'activa',
      asunto: 'Prueba', cuerpoTexto: 'Prueba', destinatarios: { tipo: 'todos' } };
    t.mock.method(Campana.collection, 'findOne', async () => ({ ...doc }));
    t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [] }));
    const delegar = t.mock.method(selector, 'ejecutarCampana', () => { throw Error('No delegar'); });
    const fetch = t.mock.method(global, 'fetch', () => { throw Error('No enviar'); });
    const guardar = t.mock.method(Campana.collection, 'updateOne', () => { throw Error('No modificar'); });
    for (const version of [undefined, 2]) {
      if (version) doc.versionFlujo = version; else delete doc.versionFlujo;
      for (const ruta of [`/campanas/${id}/ejecutar`, `/CAMPANAS/${id}/EJECUTAR/`]) {
        await cliente.post(ruta).set('X-CSRF-Token', rol === 'superadmin' ? adminCsrf : campanaCsrf)
          .send({ confirmacion: 'ENVIAR', habilitada: true, versionFlujo: 1 }).expect(503);
      }
      await cliente.get(`/campanas/${id}`).expect(200).then(r => {
        assert.doesNotMatch(r.text, /action="[^\"]*\/ejecutar"/);
      });
    }
    assert.equal(delegar.mock.callCount(), 0);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(guardar.mock.callCount(), 0);
  });
}

test('bloqueo directo: selector y email rechazan antes del transporte aunque toda la configuración histórica sea válida', async t => {
  t.mock.method(Empresa, 'findById', () => ({ select: async () => ({ estado: 'activa',
    automatizaciones: { email: { habilitada: true, webhookUrl: 'http://127.0.0.1:27018/no-enviar' } } }) }));
  t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [{ _id: actor, empresa: A, ...consentimientoPrueba(), activo: true, email: 'ficticio@example.test' }] }));
  const fetch = t.mock.method(global, 'fetch', () => { throw Error('No enviar'); });
  const doc = { _id: id, empresa: A, canal: 'email', asunto: 'Prueba', cuerpoTexto: 'Prueba', destinatarios: { tipo: 'todos' } };
  for (const servicio of [selector, email]) {
    await assert.rejects(servicio.ejecutarCampana(doc, { rol: 'superadmin' }), { codigo: 'ENVIOS_BLOQUEADOS' });
  }
  assert.equal(fetch.mock.callCount(), 0);
});
