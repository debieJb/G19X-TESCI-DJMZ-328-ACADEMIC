const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'auditoria-solo-pruebas';
const { crearContexto } = require('./soporte/sesion');
const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');
const email = require('../services/emailService');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2), actor = id(3), propio = id(4), ajeno = id(5);
const coincide = (doc, filtro) => Object.entries(filtro).every(([campo, valor]) => valor instanceof mongoose.Types.ObjectId
  ? doc[campo] instanceof mongoose.Types.ObjectId && valor.equals(doc[campo]) : doc[campo] === valor);

for (const rol of ['operador', 'admin_empresa', 'superadmin']) {
  test(`contactos BSON: ${rol} guarda, conserva relaciones y bloquea cambios concurrentes de empresa`, async t => {
    const { cliente } = crearContexto(t, { _id: actor, rol, empresa: { _id: A } });
    let persistido = { _id: propio, empresa: A, creadoPor: actor, nombre: 'Contacto', email: 'propio@example.test', activo: true };
    t.mock.method(Contacto.collection, 'findOne', async filtro => coincide(persistido, filtro) ? { ...persistido } : null);
    t.mock.method(Contacto.collection, 'updateOne', async (filtro, cambios) => {
      const ok = coincide(persistido, filtro);
      if (ok && rol !== 'superadmin') assert.ok(filtro.empresa instanceof mongoose.Types.ObjectId);
      if (ok) Object.assign(persistido, cambios.$set);
      return { matchedCount: ok ? 1 : 0, modifiedCount: ok ? 1 : 0 };
    });
    await cliente.post(`/contactos/${propio}/editar`).send({ nombre: 'Editado', email: 'propio@example.test', empresa: String(B), creadoPor: String(ajeno) }).expect(303);
    assert.equal(persistido.nombre, 'Editado');
    assert.ok(persistido.empresa.equals(A));
    assert.ok(persistido.creadoPor.equals(actor));
    if (rol !== 'superadmin') {
      t.mock.method(Contacto.collection, 'updateOne', async filtro => {
        persistido.empresa = B;
        return { matchedCount: coincide(persistido, filtro) ? 1 : 0 };
      });
      await cliente.post(`/contactos/${propio}/editar`).send({ nombre: 'No guardar', email: 'propio@example.test' }).expect(404);
      assert.equal(persistido.nombre, 'Editado');
    }
  });
}

for (const rol of ['operador', 'admin_empresa']) {
  test(`contactos HTTP: ${rol} no accede a ajenos con IDs, query, cuerpo ni operadores Mongo`, async t => {
    const { cliente } = crearContexto(t, { _id: actor, rol, empresa: { _id: A } });
    const extranjero = { _id: ajeno, empresa: B, nombre: 'PRIVADO', email: 'privado@example.test' };
    t.mock.method(Contacto.collection, 'findOne', async filtro => coincide(extranjero, filtro) ? extranjero : null);
    t.mock.method(Contacto.collection, 'find', filtro => ({ toArray: async () => coincide(extranjero, filtro) ? [extranjero] : [] }));
    const guardar = t.mock.method(Contacto.collection, 'updateOne', () => { throw new Error('No guardar'); });
    const borrar = t.mock.method(Contacto.collection, 'deleteOne', () => { throw new Error('No borrar'); });
    for (const ruta of [`/contactos/${ajeno}?empresa=${B}`, `/contactos/${ajeno}/editar?empresa=${B}`]) {
      const resultado = await cliente.get(ruta).expect(404);
      assert.doesNotMatch(resultado.text, /PRIVADO|privado@example.test/);
    }
    await cliente.get(`/contactos?empresa=${B}`).expect(200).then(res => assert.doesNotMatch(res.text, /PRIVADO/));
    for (const sufijo of ['editar', 'eliminar']) {
      await cliente.post(`/contactos/${ajeno}/${sufijo}`).send({ empresa: String(B), rol: 'superadmin', nombre: 'Intruso', email: 'intruso@example.test' }).expect(404);
      await cliente.post(`/contactos/invalido/${sufijo}`).send({ _id: { $ne: null }, empresa: { $ne: null } }).expect(400);
    }
    assert.equal(guardar.mock.callCount(), 0);
    assert.equal(borrar.mock.callCount(), 0);
  });
}

test('email: sin selección explícita nunca entrega el control de destinatarios al workflow', async t => {
  t.mock.method(Empresa, 'findById', () => ({ select: async () => ({ automatizaciones: { email: { habilitada: true, webhookUrl: 'https://n8n.example.test/local' } } }) }));
  const fetch = t.mock.method(global, 'fetch', async () => new Response(null, { status: 204 }));
  await assert.rejects(email.ejecutarCampana({ _id: propio, empresa: A, canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Texto' }, { rol: 'operador', empresa: A }), { codigo: 'DESTINATARIOS_INVALIDOS' });
  assert.equal(fetch.mock.callCount(), 0);
});
