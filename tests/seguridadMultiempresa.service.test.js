const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido'); });
}
const Empresa = require('../models/Empresa');
const Contacto = require('../models/Contacto');
const Campana = require('../models/Campana');
const email = require('../services/emailService');
const destinatarios = require('../services/destinatariosService');
const { normalizarEmpresaId, obtenerEmpresaParaEjecucion } = require('../services/accesoEmpresaService');
const { validarFormatoUrl, validarUrl } = require('../services/validacionWebhookService');
const { resolverWebhook } = require('../services/configuracionAutomatizacionesService');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2), autor = id(3), campanaId = id(4);
const campana = { _id: campanaId, empresa: A, canal: 'email', estado: 'activa', nombre: 'Campaña', objetivo: 'Objetivo',
  asunto: 'Asunto', cuerpoTexto: 'Texto', destinatarios: { tipo: 'todos' } };
const configurarEntorno = (t, valores) => {
  const anteriores = Object.fromEntries(Object.keys(valores).map(clave => [clave, process.env[clave]]));
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === undefined) delete process.env[clave]; else process.env[clave] = valor;
  }
  t.after(() => {
    for (const [clave, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[clave]; else process.env[clave] = valor;
    }
  });
};
let empresa, consultarEmpresa, consultarContactos, enviar;
beforeEach(t => {
  configurarEntorno(t, { NODE_ENV: 'test', N8N_WEBHOOK_URL: 'https://n8n.example.test/webhook', N8N_WEBHOOK_ORIGENES_PERMITIDOS: undefined });
  empresa = { _id: A, estado: 'activa', automatizaciones: { email: { habilitada: true, webhookUrl: '' } } };
  consultarEmpresa = t.mock.method(Empresa, 'findById', valor => {
    assert.equal(String(valor), String(A));
    return { select: async seleccion => { assert.match(seleccion, /estado/); return empresa; } };
  });
  consultarContactos = t.mock.method(Contacto.collection, 'find', (filtro, opciones) => {
    assert.equal(String(filtro.empresa), String(A));
    assert.equal(opciones.projection['canales.email'], 1);
    return { toArray: async () => [{ _id: id(10), nombre: 'Propio', email: 'propio@example.test', activo: true }] };
  });
  enviar = t.mock.method(global, 'fetch', async () => new Response(null, { status: 204 }));
});

for (const rol of ['operador', 'admin_empresa', 'superadmin']) {
  test(`seguridad empresarial: ${rol} no ejecuta empresa inactiva aunque la sesión diga activa`, async () => {
    empresa.estado = 'inactiva';
    await assert.rejects(email.ejecutarCampana(campana, { rol, empresa: { _id: A, estado: 'activa' } }), { codigo: 'EMPRESA_INACTIVA' });
    assert.equal(consultarContactos.mock.callCount(), 0);
    assert.equal(enviar.mock.callCount(), 0);
  });
}

test('seguridad empresarial: reconsulta el estado y bloquea la siguiente ejecución tras desactivar', async () => {
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: A }), { codigo: 'ENVIOS_BLOQUEADOS' });
  empresa.estado = 'inactiva';
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: A }), { codigo: 'EMPRESA_INACTIVA' });
  assert.equal(enviar.mock.callCount(), 0);
  assert.equal(consultarEmpresa.mock.callCount(), 2);
});

test('seguridad empresarial: empresa inexistente o con estado corrupto no usa fallback', async () => {
  for (const valor of [null, { estado: null }, { estado: 'desconocido' }]) {
    empresa = valor;
    await assert.rejects(email.ejecutarCampana(campana, { rol: 'superadmin' }), { codigo: 'CONFIGURACION' });
  }
  assert.equal(consultarContactos.mock.callCount(), 0);
  assert.equal(enviar.mock.callCount(), 0);
});

test('seguridad empresarial: referencias malformadas se rechazan antes de consultar MongoDB', async () => {
  for (const valor of ['incorrecto', '', null, { $ne: null }, { _id: { $ne: null } }, [A]]) {
    assert.equal(normalizarEmpresaId(valor), null);
    await assert.rejects(obtenerEmpresaParaEjecucion(valor), { codigo: 'CONFIGURACION' });
  }
  assert.equal(consultarEmpresa.mock.callCount(), 0);
  for (const valor of [A, String(A), { _id: A }]) assert.equal(normalizarEmpresaId(valor), String(A));
});

test('seguridad empresarial: una referencia malformada en campaña no inicia consultas ni webhook', async () => {
  await assert.rejects(email.ejecutarCampana({ ...campana, empresa: { $ne: null } }, { rol: 'superadmin' }), { codigo: 'CONFIGURACION' });
  assert.equal(consultarEmpresa.mock.callCount(), 0);
  assert.equal(consultarContactos.mock.callCount(), 0);
  assert.equal(enviar.mock.callCount(), 0);
});

test('seguridad empresarial: permisos ajenos se verifican antes de consultar empresa', async () => {
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: B }), { codigo: 'ACCESO_DENEGADO' });
  assert.equal(consultarEmpresa.mock.callCount(), 0);
  assert.equal(consultarContactos.mock.callCount(), 0);
  assert.equal(enviar.mock.callCount(), 0);
});

test('seguridad empresarial: proyección real conserva el bloqueo del canal deshabilitado', async t => {
  t.mock.method(Empresa, 'findById', valor => Empresa.findOne({ _id: valor }));
  t.mock.method(Empresa.collection, 'findOne', async (filtro, opciones) => {
    assert.equal(String(filtro._id), String(A));
    assert.equal(opciones.projection.estado, 1);
    assert.equal(opciones.projection['automatizaciones.email.habilitada'], 1);
    assert.equal(opciones.projection['automatizaciones.email.webhookUrl'], 1);
    return { _id: A, estado: 'activa', automatizaciones: { email: { habilitada: false, webhookUrl: '' } } };
  });
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: A }), { codigo: 'DESHABILITADA' });
  assert.equal(enviar.mock.callCount(), 0);
});

test('compatibilidad: empresa antigua sin estado conserva el default activo', async () => {
  delete empresa.estado;
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: A }), { codigo: 'ENVIOS_BLOQUEADOS' });
  assert.equal(enviar.mock.callCount(), 0);
});

test('compatibilidad: histórica sin empresa conserva datos y resolución global, nunca ejecuta', async () => {
  const historica = { ...campana, empresa: undefined };
  const antes = JSON.stringify(historica);
  assert.equal(String(await resolverWebhook(historica, { rol: 'superadmin' })), 'https://n8n.example.test/webhook');
  await assert.rejects(email.ejecutarCampana(historica, { rol: 'superadmin' }), { codigo: 'DESTINATARIOS_INVALIDOS' });
  assert.equal(JSON.stringify(historica), antes);
  assert.equal(consultarEmpresa.mock.callCount(), 0);
  assert.equal(consultarContactos.mock.callCount(), 0);
  assert.equal(enviar.mock.callCount(), 0);
});

test('campaña: save conserva empresa y autor frente a asignación, set y unset', async t => {
  const doc = Campana.hydrate({ ...campana, creadoPor: autor });
  doc.empresa = B; doc.creadoPor = B;
  doc.set({ empresa: null, creadoPor: undefined, nombre: 'Editada' });
  const guardar = t.mock.method(Campana.collection, 'updateOne', async (filtro, update) => {
    assert.equal(String(filtro._id), String(campanaId));
    assert.equal(update.$set.empresa, undefined);
    assert.equal(update.$set.creadoPor, undefined);
    assert.equal(update.$unset, undefined);
    return { matchedCount: 1 };
  });
  await doc.save();
  assert.ok(doc.empresa.equals(A)); assert.ok(doc.creadoPor.equals(autor));
  assert.equal(guardar.mock.callCount(), 1);
});

test('campaña: actualizaciones de Mongoose no transfieren ni eliminan relaciones', async t => {
  const guardar = t.mock.method(Campana.collection, 'updateOne', async (filtro, update) => {
    assert.equal(update.$set.empresa, undefined); assert.equal(update.$set.creadoPor, undefined);
    assert.equal(update.$unset, undefined);
    assert.equal(update.$rename, undefined);
    return { matchedCount: 1 };
  });
  await Campana.updateOne({ _id: campanaId, empresa: A }, { $set: { nombre: 'Editada', empresa: B, creadoPor: B } });
  await Campana.updateOne({ _id: campanaId, empresa: A }, { $set: { nombre: 'Otra' }, $unset: { empresa: 1, creadoPor: 1 } });
  await Campana.updateOne({ _id: campanaId, empresa: A }, { $set: { nombre: 'Otra' }, $rename: { empresa: 'anterior', creadoPor: 'autorAnterior' } });
  assert.equal(guardar.mock.callCount(), 3);
});

test('compatibilidad: históricas se guardan sin rellenar ni migrar relaciones', async t => {
  const doc = Campana.hydrate({ _id: campanaId, nombre: 'Histórica', objetivo: 'Objetivo', estado: 'activa' });
  doc.nombre = 'Histórica editada';
  t.mock.method(Campana.collection, 'updateOne', async (filtro, update) => {
    assert.equal(update.$set.empresa, undefined); assert.equal(update.$set.creadoPor, undefined);
    return { matchedCount: 1 };
  });
  await doc.save();
  assert.equal(doc.empresa, undefined); assert.equal(doc.creadoPor, undefined);
});

test('compatibilidad: una asignación explícita de relaciones ausentes no permite transferirlas después', () => {
  const doc = Campana.hydrate({ nombre: 'Histórica', objetivo: 'Objetivo' });
  doc.empresa = A; doc.creadoPor = autor;
  doc.empresa = B; doc.creadoPor = B;
  assert.ok(doc.empresa.equals(A)); assert.ok(doc.creadoPor.equals(autor));
});

for (const tipo of ['todos', 'contactos', 'etiquetas']) {
  test(`canales.email: ${tipo} excluye deshabilitados y conserva ausentes sin mezclar empresas`, async t => {
    const contactos = [
      { _id: id(10), empresa: A, activo: true, email: 'habilitado@example.test', canales: { email: true }, etiquetas: ['vip'] },
      { _id: id(11), empresa: A, activo: true, email: 'deshabilitado@example.test', canales: { email: false }, etiquetas: ['vip'] },
      { _id: id(12), empresa: A, activo: true, email: 'historico@example.test', etiquetas: ['vip'] },
      { _id: id(13), empresa: B, activo: true, email: 'ajeno@example.test', canales: { email: true }, etiquetas: ['vip'] },
      { _id: id(14), empresa: A, activo: false, email: 'inactivo@example.test', canales: { email: true }, etiquetas: ['vip'] },
      { _id: id(15), empresa: A, activo: true, email: 'corrupto@example.test', canales: { email: 'true' }, etiquetas: ['vip'] }
    ];
    for (const contacto of contactos) contacto.nombre = 'Contacto de prueba';
    t.mock.method(Contacto.collection, 'find', (filtro, opciones) => {
      assert.equal(String(filtro.empresa), String(A));
      assert.equal(opciones.projection['canales.email'], 1);
      return { toArray: async () => contactos.filter(c => String(c.empresa) === String(filtro.empresa) && c.activo === filtro.activo) };
    });
    const doc = { ...campana, destinatarios: { tipo, contactos: contactos.map(c => c._id), etiquetas: ['vip'] } };
    const resultado = await destinatarios.resolverDestinatarios(doc);
    assert.deepEqual(resultado.map(c => c.email), ['habilitado@example.test', 'historico@example.test']);
    await assert.rejects(email.ejecutarCampana(doc, { rol: 'operador', empresa: A }), { codigo: 'ENVIOS_BLOQUEADOS' });
    assert.equal(enviar.mock.callCount(), 0);
  });
}

test('canales.email: todos deshabilitados impide webhook sin modificar contactos', async t => {
  t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [
    { _id: id(10), activo: true, email: 'propio@example.test', canales: { email: false } }
  ] }));
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: A }), { codigo: 'SIN_DESTINATARIOS' });
  assert.equal(enviar.mock.callCount(), 0);
});

test('webhook: esquema y servicio rechazan URLs ambiguas y errores no exponen destino', async () => {
  for (const url of ['https://n8n.example.test/#secreto', 'https://n8n.example.test/#',
    'https://usuario:secreto@n8n.example.test/', 'https:\\n8n.example.test\\webhook',
    'https://n8n.example.test/\nsecreto', ' https://n8n.example.test/', 'https://', 'file:///secreto', '//n8n.example.test/']) {
    assert.throws(() => validarFormatoUrl(url), error => error.codigo === 'CONFIGURACION' && error.message === 'CONFIGURACION');
    await assert.rejects(new Empresa({ nombre: 'A', automatizaciones: { email: { webhookUrl: url } } }).validate(), { name: 'ValidationError' });
  }
});

test('webhook: desarrollo mantiene HTTP local y el contrato de redirecciones bloqueadas', async () => {
  empresa.automatizaciones.email.webhookUrl = 'http://127.0.0.1:5678/webhook';
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: A }), { codigo: 'ENVIOS_BLOQUEADOS' });
  assert.equal(String(await resolverWebhook(campana, { rol: 'operador', empresa: A })), 'http://127.0.0.1:5678/webhook');
  assert.equal(enviar.mock.callCount(), 0);
});

test('webhook: producción autoriza solo HTTPS del origen global si no hay lista explícita', () => {
  process.env.NODE_ENV = 'production';
  assert.equal(validarUrl('https://n8n.example.test/empresa').origin, 'https://n8n.example.test');
  for (const url of ['http://n8n.example.test/webhook', 'https://otro.example.test/',
    'https://n8n.example.test.evil.test/', 'https://n8n.example.test:8443/', 'https://127.0.0.1/']) {
    assert.throws(() => validarUrl(url), { codigo: 'CONFIGURACION' });
  }
  delete process.env.N8N_WEBHOOK_URL;
  assert.throws(() => validarUrl('https://n8n.example.test/'), { codigo: 'CONFIGURACION' });
});

test('webhook: lista explícita usa orígenes exactos y no permite el global implícitamente', () => {
  process.env.NODE_ENV = 'production';
  process.env.N8N_WEBHOOK_ORIGENES_PERMITIDOS = 'https://empresa.example.test, https://otro.example.test:8443';
  assert.equal(validarUrl('https://empresa.example.test/hook?version=1').origin, 'https://empresa.example.test');
  assert.equal(validarUrl('https://otro.example.test:8443/hook').port, '8443');
  for (const url of ['https://n8n.example.test/', 'https://empresa.example.test.evil.test/', 'https://otro.example.test/']) {
    assert.throws(() => validarUrl(url), { codigo: 'CONFIGURACION' });
  }
});

test('webhook: lista malformada falla cerrada sin consultas externas', () => {
  process.env.NODE_ENV = 'production';
  for (const lista of ['', 'https://n8n.example.test/hook', 'https://n8n.example.test/?x=1',
    'https://n8n.example.test,', '*', 'http://n8n.example.test', 'https://usuario:secreto@n8n.example.test']) {
    process.env.N8N_WEBHOOK_ORIGENES_PERMITIDOS = lista;
    assert.throws(() => validarUrl('https://n8n.example.test/'), { codigo: 'CONFIGURACION' });
  }
  assert.equal(enviar.mock.callCount(), 0);
});

test('webhook: destino empresarial no autorizado bloquea y no recurre al global', async () => {
  process.env.NODE_ENV = 'production';
  empresa.automatizaciones.email.webhookUrl = 'https://intruso.example.test/webhook';
  await assert.rejects(email.ejecutarCampana(campana, { rol: 'operador', empresa: A }), { codigo: 'CONFIGURACION' });
  assert.equal(consultarContactos.mock.callCount(), 0);
  assert.equal(enviar.mock.callCount(), 0);
});
