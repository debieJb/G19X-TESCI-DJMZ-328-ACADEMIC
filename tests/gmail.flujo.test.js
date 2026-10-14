const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
process.env.SESSION_SECRET = 'gmail-flujo-solo-pruebas';
const { crearContexto } = require('./soporte/sesion');
const Campana = require('../models/Campana');
const Empresa = require('../models/Empresa');
const Contacto = require('../models/Contacto');
const whatsapp = require('../services/whatsappService');
const empresa = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
const usuario = new mongoose.Types.ObjectId('507f1f77bcf86cd799439013');
const sesiones = store => new Promise((resolve, reject) => store.all((error, datos) => error ? reject(error) : resolve(datos)));

test('Gmail: únicas opciones nuevas, POST manipulado rechazado e históricas conservadas', async t => {
  const { cliente } = crearContexto(t, { _id: usuario, rol: 'operador', empresa: { _id: empresa } });
  t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [] }));
  const crear = t.mock.method(Campana, 'create', () => { throw new Error('No debe guardar'); });
  for (const canal of ['whatsapp', 'sms', 'facebook', 'linkedin', 'redes_sociales', 'otro']) {
    const form = await cliente.get(`/campanas/nueva?canal=${canal}`).expect(200);
    assert.ok(!form.text.includes('<select id="canal"'));
    assert.match(form.text, /Correo electrónico \(Gmail\)/);
    assert.ok(!form.text.includes('name="canal"'));
    const rechazo = await cliente.post('/campanas').send({ nombre: 'Nueva', objetivo: 'Objetivo', canal }).expect(422);
    assert.match(rechazo.text, /Solo el canal email/);
    assert.ok(!rechazo.text.includes('<select id="canal"'));
  }
  assert.equal(crear.mock.callCount(), 0);
  const id = new mongoose.Types.ObjectId();
  for (const canal of ['whatsapp', 'sms', 'redes_sociales', 'otro', undefined]) {
    const historica = { _id: id, empresa, nombre: 'Histórica', objetivo: 'Objetivo', canal, estado: 'activa', publicacion: 'Texto anterior' };
    const anterior = JSON.stringify(historica);
    t.mock.method(Campana.collection, 'findOne', async () => ({ ...historica }));
    await cliente.get(`/campanas/${id}/editar`).expect(200);
    const guardar = t.mock.method(Campana.collection, 'updateOne', async (filtro, cambios) => {
      assert.equal(cambios.$set.canal, undefined);
      assert.equal(cambios.$set.publicacion, undefined);
      assert.equal(cambios.$set.empresa, undefined);
      return { matchedCount: 1, modifiedCount: 1 };
    });
    await cliente.post(`/campanas/${id}/editar`).send({ nombre: 'Histórica editada', objetivo: 'Objetivo', estado: 'activa' }).expect(303);
    assert.equal(guardar.mock.callCount(), 1);
    for (const manipulado of ['email', 'whatsapp', 'sms', 'redes_sociales', 'otro', '', null, ['email'], { $ne: null }]) {
      await cliente.post(`/campanas/${id}/editar`).send({ nombre: 'Manipulada', objetivo: 'Objetivo', estado: 'activa', canal: manipulado }).expect(422);
    }
    assert.equal(guardar.mock.callCount(), 1);
    const detalle = await cliente.get(`/campanas/${id}`).expect(200);
    assert.ok(!detalle.text.includes(`action="/campanas/${id}/ejecutar"`));
    await cliente.post(`/campanas/${id}/ejecutar`).send({ canal: 'email' }).expect(422);
    assert.equal(JSON.stringify(historica), anterior);
  }
});

test('WhatsApp: llamada directa deshabilitada sin consultas ni peticiones', async t => {
  const contactos = t.mock.method(Contacto, 'find', () => { throw new Error('No consultar'); });
  const fetch = t.mock.method(global, 'fetch', () => { throw new Error('No enviar'); });
  await assert.rejects(whatsapp.ejecutarCampana({ canal: 'whatsapp', estado: 'activa', cuerpoTexto: 'Texto', destinatarios: { tipo: 'todos' } }), { codigo: 'CANAL_NO_DISPONIBLE' });
  assert.equal(contactos.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

for (const rol of ['operador', 'admin_empresa', 'superadmin']) {
  test(`Gmail completo: ${rol} crea, activa, guarda y ejecuta POST local conservando sesión`, async t => {
    const peticiones = [];
    let status = 202;
    const server = http.createServer(async (req, res) => {
      let texto = '';
      for await (const chunk of req) texto += chunk;
      peticiones.push({ method: req.method, ruta: req.url, type: req.headers['content-type'], payload: JSON.parse(texto) });
      res.writeHead(status, { Location: '/no-seguir' }).end(status === 204 ? undefined : 'Respuesta local');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const url = `http://127.0.0.1:${server.address().port}/webhook/gmail`;
    const { cliente, store } = crearContexto(t, { _id: usuario, rol, empresa: rol === 'superadmin' ? null : { _id: empresa } });
    const antes = Object.keys(await sesiones(store));
    let persistido;
    const compania = { _id: empresa, nombre: 'Empresa', automatizaciones: { email: { habilitada: true, webhookUrl: url } } };
    t.mock.method(Empresa.collection, 'find', () => ({ toArray: async () => [compania] }));
    t.mock.method(Empresa.collection, 'findOne', async () => compania);
    t.mock.method(Contacto.collection, 'find', filtro => {
      assert.equal(String(filtro.empresa), String(empresa));
      return { toArray: async () => [{ _id: usuario, empresa, nombre: 'Contacto de prueba', email: 'prueba@example.test', activo: true }] };
    });
    t.mock.method(Campana.collection, 'insertOne', async datos => {
      persistido = { ...datos };
      return { insertedId: datos._id };
    });
    t.mock.method(Campana.collection, 'findOne', async filtro => {
      if (filtro.empresa) assert.ok(filtro.empresa.equals(empresa));
      return persistido && filtro._id.equals(persistido._id) ? { ...persistido } : null;
    });
    t.mock.method(Campana.collection, 'updateOne', async (filtro, cambios) => {
      if (rol !== 'superadmin') assert.ok(filtro.empresa instanceof mongoose.Types.ObjectId && filtro.empresa.equals(empresa));
      Object.assign(persistido, cambios.$set);
      for (const campo of Object.keys(cambios.$unset || {})) delete persistido[campo];
      return { matchedCount: 1, modifiedCount: 1 };
    });
    const campos = { nombre: 'Gmail de prueba', objetivo: 'Verificar flujo', asunto: 'Asunto de prueba', cuerpoTexto: 'Mensaje de prueba' };
    await cliente.post('/campanas').type('form').send({ ...campos, empresa: String(empresa) }).expect(303).expect('Location', '/campanas');
    assert.equal(persistido.estado, 'borrador');
    assert.equal(persistido.canal, 'email');
    assert.equal(String(persistido.empresa), String(empresa));
    assert.equal(String(persistido.creadoPor), String(usuario));
    await cliente.get(`/campanas/${persistido._id}/editar`).expect(200);
    await cliente.post(`/campanas/${persistido._id}/ejecutar`).send({}).expect(422);
    await cliente.post(`/campanas/${persistido._id}/editar`).type('form').send({ ...campos, estado: 'activa' }).expect(303);
    assert.equal(persistido.estado, 'activa');
    assert.equal(peticiones.length, 0);
    assert.equal(persistido.versionFlujo, 2);
    await cliente.post(`/campanas/${persistido._id}/ejecutar`).send({}).expect(503);
    assert.equal(peticiones.length, 0);
    // La matriz de respuestas siguiente verifica el contrato de documentos
    // históricos, representados solo en esta fixture sin versionFlujo.
    delete persistido.versionFlujo;
    const snapshot = JSON.stringify(persistido);
    for (const [respuesta, esperado] of [[202, 303], [204, 303], [401, 502], [403, 502], [404, 502], [405, 502], [500, 502], [302, 502]]) {
      status = respuesta;
      const resultado = await cliente.post(`/campanas/${persistido._id}/ejecutar`).send({ asunto: 'Manipulado', webhookUrl: 'https://externo.invalid' }).expect(503);
      assert.equal(resultado.headers['set-cookie'], undefined);
      assert.match(resultado.text, /temporalmente bloqueados/);
    }
    assert.equal(peticiones.length, 0);
    for (const peticion of peticiones) {
      assert.equal(peticion.method, 'POST');
      assert.equal(peticion.ruta, '/webhook/gmail');
      assert.equal(peticion.type, 'application/json');
      assert.equal(peticion.payload.estado, 'activa');
      assert.equal(peticion.payload.asunto, campos.asunto);
      assert.equal(peticion.payload.cuerpoTexto, campos.cuerpoTexto);
      assert.equal(peticion.payload.totalDestinatarios, 1);
      assert.equal(peticion.payload.destinatarios[0].email, 'prueba@example.test');
    }
    assert.equal(JSON.stringify(persistido), snapshot);
    await cliente.get(`/campanas/${persistido._id}/editar`).expect(200);
    await cliente.get('/login').expect(302).expect('Location', '/panel');
    assert.deepEqual(Object.keys(await sesiones(store)), antes);
    assert.equal(Object.values(await sesiones(store))[0].usuarioId, String(usuario));
  });
}
