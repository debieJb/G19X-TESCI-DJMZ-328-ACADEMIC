const { consentimientoPrueba } = require('./soporte/consentimiento');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'payload-solo-pruebas';
const { crearContexto } = require('./soporte/sesion');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2), actor = id(3), campanaId = id(4);
const coincide = (doc, filtro) => Object.entries(filtro).every(([campo, valor]) => {
  if (valor?.$in) return (Array.isArray(doc[campo]) ? doc[campo] : [doc[campo]]).some(actual => valor.$in.some(v => String(v) === String(actual)));
  if (valor?.$type) return typeof doc[campo] === valor.$type;
  return String(doc[campo]) === String(valor);
});

for (const rol of ['operador', 'admin_empresa', 'superadmin']) {
  test(`payload n8n local: ${rol} solo envía selección persistida activa de A en los tres modos`, async t => {
    const recibidos = [];
    const servidor = http.createServer(async (req, res) => {
      let texto = '';
      for await (const parte of req) texto += parte;
      assert.equal(req.method, 'POST');
      recibidos.push(JSON.parse(texto));
      res.writeHead(204).end();
    });
    await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { servidor.close(resolve); servidor.closeAllConnections(); }));
    const url = `http://127.0.0.1:${servidor.address().port}/webhook`;
    const { cliente } = crearContexto(t, { _id: actor, rol, empresa: rol === 'superadmin' ? null : { _id: A } });
    const contactos = [
      { _id: id(10), empresa: A, nombre: 'Propio', activo: true, email: 'igual@example.test', etiquetas: ['compartida'], privado: 'PRIVADO' },
      { _id: id(11), empresa: B, nombre: 'Ajeno', activo: true, email: 'igual@example.test', etiquetas: ['compartida'] },
      { _id: id(12), empresa: A, nombre: 'Inactivo', activo: false, email: 'inactivo@example.test', etiquetas: ['compartida'] },
      { _id: id(13), empresa: A, nombre: 'Inválido', activo: true, email: 'invalido', etiquetas: ['compartida'] }
    ].map(contacto => ({ ...consentimientoPrueba(), ...contacto }));
    const campana = { _id: campanaId, empresa: A, nombre: 'Correo', objetivo: 'Objetivo', canal: 'email', estado: 'activa', asunto: 'Asunto', cuerpoTexto: 'Mensaje' };
    t.mock.method(Campana.collection, 'findOne', async filtro => coincide(campana, filtro) ? { ...campana } : null);
    t.mock.method(Contacto.collection, 'find', filtro => {
      assert.equal(String(filtro.empresa), String(A));
      return { toArray: async () => contactos.filter(doc => coincide(doc, filtro)) };
    });
    t.mock.method(Empresa.collection, 'findOne', async filtro => {
      assert.ok(filtro._id.equals(A));
      return { _id: A, automatizaciones: { email: { habilitada: true, webhookUrl: url } } };
    });
    const guardar = t.mock.method(Campana.collection, 'updateOne', () => { throw new Error('No modificar campaña'); });
    const selecciones = [{ tipo: 'todos' }, { tipo: 'contactos', contactos: [id(10), id(11), id(12)] }, { tipo: 'etiquetas', etiquetas: ['compartida'] }];
    for (const destinatarios of selecciones) {
      campana.destinatarios = destinatarios;
      await cliente.post(`/campanas/${campanaId}/ejecutar`).send({ empresa: String(B), rol: 'superadmin', destinatarios: { tipo: 'contactos', contactos: [String(id(11))] }, email: 'ajeno@example.test' }).expect(503);
      const propios = await require('../services/destinatariosService').resolverDestinatarios(campana);
      assert.deepEqual(propios.map(c => c.email), ['igual@example.test']);
      assert.equal(recibidos.length, 0);
    }
    contactos[0].activo = false;
    await cliente.post(`/campanas/${campanaId}/ejecutar`).send({}).expect(503);
    assert.equal(recibidos.length, 0);
    assert.equal(guardar.mock.callCount(), 0);
  });
}
