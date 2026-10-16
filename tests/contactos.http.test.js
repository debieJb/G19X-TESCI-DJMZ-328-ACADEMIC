const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido en pruebas'); });
}
process.env.SESSION_SECRET = 'secreto-exclusivo-de-pruebas-contactos';
const { crearContexto } = require('./soporte/sesion');
const Contacto = require('../models/Contacto');
const Empresa = require('../models/Empresa');
const { puede } = require('../services/permisos');
const empresa = '507f1f77bcf86cd799439011';
const otra = '507f1f77bcf86cd799439012';
const autor = '507f1f77bcf86cd799439013';
const id = '507f1f77bcf86cd799439014';
const ajeno = '507f1f77bcf86cd799439015';
let usuario, cliente, documentos, crear, buscar, borrar, guardar;
beforeEach(t => {
  usuario = { _id: autor, nombre: 'Operador', email: 'operador@example.test', rol: 'operador', empresa: { _id: empresa, nombre: 'Empresa' } };
  ({ cliente } = crearContexto(t, usuario));
  documentos = [Contacto.hydrate({ _id: id, empresa, creadoPor: autor, nombre: '<script>Cliente</script>', email: 'cliente@example.test' }),
    Contacto.hydrate({ _id: ajeno, empresa: otra, nombre: 'CONTACTO SECRETO', email: 'secreto@example.test' })];
  const coincide = (doc, filtro) => Object.entries(filtro).every(([campo, valor]) => String(doc[campo]) === String(valor));
  const duplicado = doc => {
    for (const campo of ['email', 'telefono']) {
      if (doc[campo] && documentos.some(actual => String(actual._id) !== String(doc._id) && String(actual.empresa) === String(doc.empresa) && actual[campo] === doc[campo])) {
        throw Object.assign(new Error('Detalle privado de Mongo'), { code: 11000, keyPattern: { empresa: 1, [campo]: 1 } });
      }
    }
  };
  guardar = t.mock.method(documentos[0], 'save', async function () { await this.validate(); duplicado(this); return this; });
  buscar = t.mock.method(Contacto, 'findOne', async filtro => documentos.find(doc => coincide(doc, filtro)) || null);
  t.mock.method(Contacto, 'find', filtro => ({ sort: orden => {
    assert.deepEqual(orden, { createdAt: -1, _id: -1 });
    return { lean: async () => documentos.filter(doc => coincide(doc, filtro)).map(doc => doc.toObject()) };
  } }));
  crear = t.mock.method(Contacto, 'create', async valores => {
    const doc = new Contacto(valores); await doc.validate(); duplicado(doc); documentos.push(doc); return doc;
  });
  borrar = t.mock.method(Contacto, 'deleteOne', async filtro => {
    const indice = documentos.findIndex(doc => coincide(doc, filtro));
    if (indice === -1) return { deletedCount: 0 };
    documentos.splice(indice, 1); return { deletedCount: 1 };
  });
  t.mock.method(Empresa, 'find', () => ({ select: () => ({ sort: () => ({ lean: async () => [{ _id: empresa, nombre: 'Empresa' }, { _id: otra, nombre: 'Otra' }] }) }) }));
  t.mock.method(Empresa, 'exists', async filtro => [empresa, otra].includes(filtro._id) ? { _id: filtro._id } : null);
});
const post = (ruta, datos) => cliente.post(ruta).type('form').send(datos);
test('contactos: crear normaliza y fija empresa/autor ignorando relaciones manipuladas', async () => {
  await post('/contactos', { nombre: ' Nuevo ', email: ' NUEVO@EXAMPLE.TEST ', empresa: otra, creadoPor: ajeno,
    etiquetas: 'cliente, vip', canales: { email: 'true', whatsapp: 'false', sms: 'true' } }).expect(303).expect('Location', '/contactos');
  const valores = crear.mock.calls[0].arguments[0];
  assert.equal(valores.empresa, empresa); assert.equal(valores.creadoPor, autor);
  assert.equal(valores.email, 'nuevo@example.test'); assert.equal(valores.nombre, 'Nuevo');
  assert.deepEqual(valores.etiquetas, ['cliente', 'vip']);
  assert.deepEqual(valores.canales, { email: true });
  assert.equal(valores.activo, true);
});
test('contactos: listar con aislamiento multiempresa, salida escapada y listado vacío', async () => {
  const respuesta = await cliente.get('/contactos').expect(200);
  assert.match(respuesta.text, /&lt;script&gt;Cliente/); assert.ok(!respuesta.text.includes('<script>'));
  assert.ok(!respuesta.text.includes('CONTACTO SECRETO')); assert.ok(!respuesta.text.includes('secreto@example.test'));
  documentos = [];
  assert.match((await cliente.get('/contactos').expect(200)).text, /Aún no hay contactos/);
});
test('contactos: detalle y formularios nuevo/editar', async () => {
  for (const ruta of ['/contactos/nuevo', `/contactos/${id}`, `/contactos/${id}/editar`]) await cliente.get(ruta).expect(200);
  assert.equal(buscar.mock.calls[0].arguments[0].empresa, empresa);
});
test('contactos: editar conserva empresa/autor y limita el filtro de guardado', async () => {
  await post(`/contactos/${id}/editar`, { nombre: 'Editado', telefono: ' 555 ', activo: 'false', empresa: otra, creadoPor: ajeno }).expect(303).expect('Location', `/contactos/${id}`);
  const doc = documentos[0];
  assert.equal(doc.nombre, 'Editado'); assert.equal(doc.telefono, '555'); assert.equal(doc.email, undefined);
  assert.equal(doc.activo, false); assert.equal(String(doc.empresa), empresa); assert.equal(String(doc.creadoPor), autor);
  assert.deepEqual(doc.$where, { empresa: new mongoose.Types.ObjectId(empresa) }); assert.equal(guardar.mock.callCount(), 1);
});
test('contactos: eliminar usa filtro de empresa y conserva contactos ajenos', async () => {
  await post(`/contactos/${id}/eliminar`, {}).expect(303).expect('Location', '/contactos');
  assert.deepEqual(borrar.mock.calls[0].arguments[0], { _id: new mongoose.Types.ObjectId(id), empresa });
  assert.equal(documentos.length, 1); assert.equal(String(documentos[0]._id), ajeno);
});
test('contactos: impedir lectura, edición y eliminación de otra empresa sin revelar datos', async () => {
  for (const ruta of [`/contactos/${ajeno}`, `/contactos/${ajeno}/editar`]) {
    const respuesta = await cliente.get(ruta).expect(404); assert.ok(!respuesta.text.includes('CONTACTO SECRETO'));
  }
  await post(`/contactos/${ajeno}/editar`, { nombre: 'Intruso', email: 'intruso@example.test' }).expect(404);
  await post(`/contactos/${ajeno}/eliminar`, {}).expect(404);
  assert.equal(guardar.mock.callCount(), 0); assert.equal(borrar.mock.callCount(), 0);
});
test('contactos: email duplicado dentro de empresa devuelve 422 y conserva formulario', async () => {
  const respuesta = await post('/contactos', { nombre: 'Duplicado', email: ' CLIENTE@EXAMPLE.TEST ' }).expect(422);
  assert.match(respuesta.text, /Ya existe un contacto/); assert.match(respuesta.text, /value="Duplicado"/);
  assert.ok(!respuesta.text.includes('Detalle privado')); assert.equal(documentos.length, 2);
});
test('contactos: permite mismo email en empresas distintas', async () => {
  await post('/contactos', { nombre: 'Mismo email', email: 'secreto@example.test' }).expect(303);
  assert.equal(documentos.filter(doc => doc.email === 'secreto@example.test').length, 2);
});

for (const rol of ['operador', 'admin_empresa']) {
  test(`contactos: ${rol} normaliza duplicados y permite el mismo email únicamente en otra empresa`, async () => {
    usuario.rol = rol;
    await post('/contactos', { nombre: 'Duplicado A', email: ' CLIENTE@EXAMPLE.TEST ', empresa: otra }).expect(422);
    usuario.empresa = { _id: otra, nombre: 'Empresa B' };
    await post('/contactos', { nombre: 'Contacto B', email: ' CLIENTE@EXAMPLE.TEST ', empresa }).expect(303);
    assert.equal(crear.mock.calls[1].arguments[0].empresa, otra);
    await post('/contactos', { nombre: 'Duplicado B', email: 'cliente@example.test' }).expect(422);
    assert.equal(documentos.filter(doc => doc.email === 'cliente@example.test').length, 2);
  });
}

test('contactos: conflicto de versión devuelve 409 sin detalles internos', async t => {
  guardar.mock.mockImplementation(async () => { throw Object.assign(new Error('SECRETO'), { name: 'VersionError' }); });
  const respuesta = await post(`/contactos/${id}/editar`, { nombre: 'Cambio', email: 'cliente@example.test' }).expect(409);
  assert.match(respuesta.text, /cambió durante el guardado/);
  assert.doesNotMatch(respuesta.text, /SECRETO/);
});
test('contactos: teléfono duplicado solo se rechaza dentro de la misma empresa', async () => {
  documentos[1].telefono = '555';
  await post('/contactos', { nombre: 'Teléfono', telefono: ' 555 ' }).expect(303);
  await post('/contactos', { nombre: 'Duplicado', telefono: '555' }).expect(422);
});
test('contactos: edición captura email/teléfono duplicados', async () => {
  documentos.push(Contacto.hydrate({ empresa, nombre: 'Otro', email: 'otro@example.test', telefono: '555' }));
  await post(`/contactos/${id}/editar`, { nombre: 'Duplicado', email: 'otro@example.test' }).expect(422);
  await post(`/contactos/${id}/editar`, { nombre: 'Duplicado', telefono: '555' }).expect(422);
});
test('contactos: email o teléfono requerido, validación estricta sin guardar cambios', async () => {
  for (const ruta of ['/contactos', `/contactos/${id}/editar`]) {
    for (const datos of [{ nombre: 'Vacío' }, { nombre: 'Vacío', email: ' ', telefono: ' ' }, { nombre: 'Inválido', email: 'incorrecto' },
      { nombre: ['Inyección'], email: 'nuevo@example.test' }, { nombre: 'Cliente', email: 'nuevo@example.test', etiquetas: [{}] },
      { nombre: 'Cliente', email: 'nuevo@example.test', canales: { email: 'inválido' } }]) await cliente.post(ruta).send(datos).expect(422);
  }
  assert.equal(crear.mock.callCount(), 0); assert.equal(guardar.mock.callCount(), 0);
  await post('/contactos', { nombre: 'Solo teléfono', telefono: '123' }).expect(303);
});
test('contactos: superadmin global selecciona empresa válida y mantiene relaciones al editar', async () => {
  usuario.rol = 'superadmin'; usuario.empresa = null;
  assert.match((await cliente.get('/contactos').expect(200)).text, /CONTACTO SECRETO/);
  await cliente.get(`/contactos/${ajeno}`).expect(200);
  await cliente.get('/contactos/nuevo').expect(200);
  await post('/contactos', { nombre: 'Sin empresa', email: 'nuevo@example.test' }).expect(422);
  await post('/contactos', { nombre: 'Inexistente', email: 'nuevo@example.test', empresa: autor }).expect(422);
  await post('/contactos', { nombre: 'Global', email: 'cliente@example.test', empresa: otra }).expect(303);
  assert.equal(String(documentos.at(-1).empresa), otra);
  await post(`/contactos/${id}/editar`, { nombre: 'Global editado', email: 'cliente@example.test', empresa: otra }).expect(303);
  assert.equal(String(documentos[0].empresa), empresa);
  await post(`/contactos/${ajeno}/eliminar`, {}).expect(303);
});
test('contactos: autenticación, empresa válida y errores HTTP existentes', async t => {
  const supertest = require('supertest');
  const app = require('../app');
  await supertest(app).get('/contactos').expect(302).expect('Location', '/login');
  await cliente.get('/contactos/inválido').expect(400);
  usuario.empresa = null;
  await cliente.get('/contactos').expect(403);
  usuario.empresa = { _id: empresa };
  t.mock.method(console, 'error', () => {});
  buscar.mock.mockImplementation(async () => { throw Object.assign(new Error('privado'), { name: 'MongoNetworkError' }); });
  await cliente.get(`/contactos/${id}`).expect(503);
  buscar.mock.mockImplementation(async () => { throw new Error('privado'); });
  const respuesta = await cliente.get(`/contactos/${id}`).expect(500); assert.ok(!respuesta.text.includes('privado'));
});
test('contactos: permisos para ambos roles empresariales y superadmin', () => {
  for (const accion of ['contactos.crear', 'contactos.consultar', 'contactos.editar', 'contactos.eliminar']) {
    for (const rol of ['admin_empresa', 'operador']) {
      assert.equal(puede({ rol, empresa }, accion, empresa), true);
      assert.equal(puede({ rol, empresa }, accion, otra), false);
    }
    assert.equal(puede({ rol: 'superadmin' }, accion, otra), true);
  }
});
test('contactos: admin_empresa administra contactos propios', async () => {
  usuario.rol = 'admin_empresa';
  await cliente.get('/contactos').expect(200);
  await post('/contactos', { nombre: 'Nuevo', email: 'nuevo@example.test' }).expect(303);
  await post(`/contactos/${id}/editar`, { nombre: 'Editado', email: 'cliente@example.test' }).expect(303);
  await post(`/contactos/${id}/eliminar`, {}).expect(303);
});
test('contactos: fallo de guardado conserva formulario sin revelar detalles', async t => {
  t.mock.method(console, 'error', () => {});
  for (const [error, status] of [[new Error('SECRETO'), 500], [Object.assign(new Error('SECRETO'), { name: 'MongoNetworkError' }), 503]]) {
    crear.mock.mockImplementation(async () => { throw error; });
    guardar.mock.mockImplementation(async () => { throw error; });
    for (const ruta of ['/contactos', `/contactos/${id}/editar`]) {
      const respuesta = await post(ruta, { nombre: 'Conservar', email: 'nuevo@example.test' }).expect(status);
      assert.match(respuesta.text, /value="Conservar"/); assert.ok(!respuesta.text.includes('SECRETO'));
    }
  }
});
test('contactos: eliminación concurrente devuelve 404', async () => {
  borrar.mock.mockImplementation(async () => ({ deletedCount: 0 }));
  await post(`/contactos/${id}/eliminar`, {}).expect(404);
});
const evidencia = () => ({ accionConsentimiento: 'otorgar', fechaConsentimiento: new Date(Date.now() - 1000).toISOString(),
  fuenteConsentimiento: 'Acta sintetica numero 1', confirmarConsentimiento: 'true' });
test('consentimiento HTTP: captura, conserva historia y revoca con autor del servidor', async () => {
  await post(`/contactos/${id}/editar`, { nombre: 'Cliente', email: 'cliente@example.test', ...evidencia(), registradoPor: ajeno }).expect(303);
  assert.equal(documentos[0].consentimientoMarketing.estado, 'otorgado');
  assert.equal(String(documentos[0].consentimientoMarketing.registradoPor), autor);
  await post(`/contactos/${id}/editar`, { nombre: 'Cliente', email: 'cliente@example.test', accionConsentimiento: 'revocar',
    fuenteConsentimiento: 'Solicitud sintetica del titular', confirmarConsentimiento: 'true' }).expect(303);
  assert.equal(documentos[0].consentimientoMarketing.estado, 'revocado'); assert.equal(documentos[0].historialConsentimiento.length, 2);
});
test('consentimiento HTTP: evidencia incompleta, futura o manipulada no guarda', async () => {
  for (const cambio of [{ fuenteConsentimiento: '' }, { confirmarConsentimiento: 'false' },
    { fechaConsentimiento: new Date(Date.now() + 3600000).toISOString() }, { fechaConsentimiento: {} }, { accionConsentimiento: ['otorgar'] }]) {
    await cliente.post(`/contactos/${id}/editar`).send({ nombre: 'Cliente', email: 'cliente@example.test', ...evidencia(), ...cambio }).expect(422);
  }
  assert.equal(guardar.mock.callCount(), 0);
});
test('consentimiento HTTP: cambio de email revoca consentimiento previo; no cruza empresas', async () => {
  await post(`/contactos/${id}/editar`, { nombre: 'Cliente', email: 'cliente@example.test', ...evidencia() }).expect(303);
  await post(`/contactos/${id}/editar`, { nombre: 'Cliente', email: 'otro@example.test' }).expect(303);
  assert.equal(documentos[0].consentimientoMarketing.estado, 'revocado');
  await post(`/contactos/${ajeno}/editar`, { nombre: 'Ajeno', email: 'ajeno@example.test', ...evidencia() }).expect(404);
});
test('consentimiento HTTP: falta CSRF bloquea otorgamiento y revocacion', async () => {
  const request = require('supertest'), c = await cliente.get(`/contactos/${id}/editar`).expect(200);
  assert.ok(c.text.includes('Consentimiento de marketing'));
  for (const accionConsentimiento of ['otorgar', 'revocar']) await request(require('../app')).post(`/contactos/${id}/editar`).send({ ...evidencia(), accionConsentimiento }).expect(302);
  await cliente.post(`/contactos/${id}/editar`).send({ nombre: 'Cliente', email: 'cliente@example.test', ...evidencia(), _csrf: 'invalido' }).expect(403);
  assert.equal(guardar.mock.callCount(), 0);
});
