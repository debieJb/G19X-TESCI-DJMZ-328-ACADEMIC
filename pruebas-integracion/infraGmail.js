// Ejecucion explicita. Datos sinteticos propios; envio permanece apagado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
const rs = require('../scripts/mongoDevRsComun');
const infra = require('../services/infraestructuraPilotoService');
const { MongoSessionStore, COLECCION } = require('../services/mongoSessionStore');
const sesion = require('../config/session');
before(async () => { infra.asegurarEnvioApagado(); const c = await rs.conectar(); try { await rs.verificar(c); await rs.compararOriginal(); } finally { await c.close(); } });
after(async () => { await rs.compararOriginal(); infra.asegurarEnvioApagado(); });
const fixture = async t => {
  const nombre = 'ma_tx_test_' + randomUUID().replaceAll('-', ''), marca = randomUUID();
  const conexion = await mongoose.createConnection(rs.URI, { dbName: nombre, autoCreate: false, autoIndex: false }).asPromise();
  try { assert.ok(!(await conexion.db.admin().listDatabases()).databases.some(d => d.name === nombre)); }
  catch (e) { await conexion.close();throw e; }
  t.after(async () => {
    try {
      const c = await rs.conectar(); try { await rs.verificar(c); } finally { await c.close(); }
      rs.validarOpciones((await conexion.db.admin().command({ getCmdLineOpts: 1 })).parsed);
      assert.match(conexion.name, /^ma_tx_test_[a-f0-9]{32}$/);
      assert.ok((await conexion.db.collection('control').findOne({ _id: 'fixture' }))?.marca === marca);
      await conexion.dropDatabase();
    } finally { await conexion.close(); }
  });
  await conexion.db.collection('control').insertOne({ _id: 'fixture', marca });
  return { conexion, marca };
};
const almacen = async t => {
  const f = await fixture(t); assert.ok((await infra.provisionarPruebas(f)).completos);
  let ahora = new Date(); const clave = randomBytes(32), ambito = f.conexion.name;
  const nuevo = () => new MongoSessionStore({ coleccion: f.conexion.db.collection(COLECCION), clave, ambito, reloj: () => ahora });
  return { ...f, clave, store: nuevo(), nuevo, avanzar: ms => { ahora = new Date(+ahora + ms); } };
};
const llamar = (store, metodo, ...args) => new Promise((resolve, reject) => store[metodo](...args, (e, r) => e ? reject(e) : resolve(r)));
const datos = () => ({ cookie: { maxAge: 3600000, expires: new Date(Date.now() + 3600000) }, prueba: 'sintetica' });

for (const rol of ['superadmin', 'admin_empresa', 'operador']) test(`navegacion Mongo ${rol}: sesion cifrada, Inicio, aislamiento, logout y caducidad`, async t => {
  const f = await almacen(t), modelos = infra.modelos(f.conexion);
  const a = new mongoose.Types.ObjectId(), b = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId();
  await modelos.Empresa.collection.insertMany([{ _id: a, nombre: 'Empresa fixture A' }, { _id: b, nombre: 'Empresa fixture B' }]);
  await modelos.Usuario.collection.insertOne({ _id: uid, nombre: 'Persona fixture', email: 'persona@example.test', rol,
    ...(rol !== 'superadmin' ? { empresa: a } : {}), estadoAcceso: 'activo' });
  const ca = new mongoose.Types.ObjectId(), cb = new mongoose.Types.ObjectId();
  await modelos.Campana.collection.insertMany([{ _id: ca, empresa: a, nombre: 'Campana fixture A', canal: 'email', estado: 'borrador' },
    { _id: cb, empresa: b, nombre: 'Campana fixture B', canal: 'email', estado: 'borrador' }]);
  for (const metodo of ['findById', 'findOne', 'find']) t.mock.method(require('../models/Usuario'), metodo, (...args) => modelos.Usuario[metodo](...args));
  for (const metodo of ['findById', 'findOne', 'find']) t.mock.method(require('../models/Campana'), metodo, (...args) => modelos.Campana[metodo](...args));
  t.mock.method(require('../services/adminService'), 'obtenerDashboard', async () => ({ totales: { empresas: 2, usuarios: 1, campanas: 2 },
    empresas: [], usuariosSinEmpresa: [], usuariosEmpresaInexistente: [], campanasSinEmpresa: [] }));
  const sid = randomUUID(), secret = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('base64url');
  const firma = require('node:crypto').createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  const cookie = `marketing.piloto.sid=${encodeURIComponent(`s:${sid}.${firma}`)}`;
  const cargar = () => llamar(f.store, 'set', sid, { ...datos(), usuarioId: String(uid), adminCsrf: csrf, campanaCsrf: csrf, contactoCsrf: csrf });
  await cargar();
  const app = require('../appFactory').crearApp({ secret, store: f.nuevo(), entorno: 'test', nombreCookie: 'marketing.piloto.sid' });
  const get = ruta => request(app).get(ruta).set('Cookie', cookie);
  await get('/panel').expect(200);
  const inicio = await get('/').expect(200);assert.match(inicio.text, /Ir a mi panel/);assert.doesNotMatch(inicio.text, /href="\/login"/);
  const lista = await get('/campanas').expect(200);assert.match(lista.text, /Campana fixture A/);
  if (rol !== 'superadmin') { assert.doesNotMatch(lista.text, /Campana fixture B/);await get(`/campanas/${cb}`).expect(404); }
  if (rol !== 'superadmin') await get('/admin/usuarios/nuevo').expect(403);
  if (rol !== 'admin_empresa') await get('/empresa/usuarios/nuevo').expect(403);
  const salida = await request(app).post('/logout').set('Cookie', cookie).type('form').send({ _csrf: csrf }).expect(303);
  assert.match(salida.headers['set-cookie'][0], /^marketing\.piloto\.sid=;/);
  assert.equal(await llamar(f.nuevo(), 'get', sid), null);await get('/panel').expect(302).expect('Location', '/login');
  const sid2 = randomUUID(), firma2 = require('node:crypto').createHmac('sha256', secret).update(sid2).digest('base64').replace(/=+$/, '');
  await llamar(f.store, 'set', sid2, { ...datos(), usuarioId: String(uid) });f.avanzar(2 * 3600000);
  const app2 = require('../appFactory').crearApp({ secret, store: f.nuevo(), entorno: 'test', nombreCookie: 'marketing.piloto.sid' });
  await request(app2).get('/panel').set('Cookie', `marketing.piloto.sid=${encodeURIComponent(`s:${sid2}.${firma2}`)}`).expect(302).expect('Location', '/login');
  assert.equal((await infra.revisarIndices(f.conexion)).completos, true);
});
test('infra real: detecta faltantes, provisiona e identifica indices y TTL sin DDL posterior', async t => {
  const f = await fixture(t);
  assert.equal((await infra.revisarIndices(f.conexion)).completos, false);
  assert.ok((await infra.provisionarPruebas(f)).completos);
  assert.ok((await infra.provisionarPruebas(f)).completos);
  const store = new MongoSessionStore({ coleccion: f.conexion.db.collection(COLECCION), clave: randomBytes(32), ambito: 'test' });
  await store.comprobar();
});
test('infra real: rechaza marcador ajeno y datos existentes antes del aprovisionamiento', async t => {
  const f = await fixture(t);
  await assert.rejects(infra.provisionarPruebas({ ...f, marca: randomUUID() }), /FIXTURE_NO_PROPIA/);
  const plan = infra.planIndices(f.conexion);
  await f.conexion.db.collection(plan[0].coleccion).insertOne({ prueba: true });
  await assert.rejects(infra.provisionarPruebas(f), /FIXTURE_CONTIENE_DATOS/);
  assert.equal((await f.conexion.db.listCollections({}, { nameOnly: true }).toArray()).length, 2);
});
test('infra real: replica set temporal no puede constituir destino de piloto', async t => {
  const f = await fixture(t);
  await assert.rejects(infra.validarDestinoPiloto(f.conexion, { aprobado: true, base: 'piloto', replicaSet: 'pilotoRs', miembros: ['db.example.invalid:27019'], trustProxy: [], host: '127.0.0.1', puerto: 3100 }), /DESTINO_PILOTO_NO_COINCIDE/);
});
test('infra real: migracion dedicada rechaza 27018 sin DDL ni escrituras', async t => {
  const f = await fixture(t);
  const antes = await f.conexion.db.listCollections({}, { nameOnly: true }).toArray();
  await assert.rejects(require('../services/migracionIndicesPilotoService').migrarIndicesDedicados({ conexion: f.conexion,
    manifiesto: { aprobado: true, base: 'piloto', replicaSet: 'marketingDevRs', miembros: ['localhost:27018'], trustProxy: [], host: '127.0.0.1', puerto: 3100 }, confirmarBase: 'piloto' }));
  assert.deepEqual(await f.conexion.db.listCollections({}, { nameOnly: true }).toArray(), antes);
});
test('infra real: transaccion abortada no deja escrituras', async t => {
  const f = await fixture(t), session = await f.conexion.startSession();
  try { await assert.rejects(session.withTransaction(async () => {
    await f.conexion.db.collection('control').insertOne({ _id: 'rollback' }, { session }); throw Error('ABORTAR');
  }), /ABORTAR/); } finally { await session.endSession(); }
  assert.equal(await f.conexion.db.collection('control').countDocuments({ _id: 'rollback' }), 0);
});
test('sesiones reales: persisten entre instancias, cifradas y sin SID en claro', async t => {
  const f = await almacen(t), sid = randomUUID();
  await llamar(f.store, 'set', sid, datos());
  assert.equal((await llamar(f.nuevo(), 'get', sid)).prueba, 'sintetica');
  const doc = await f.conexion.db.collection(COLECCION).findOne({});
  assert.ok(!JSON.stringify(doc).includes(sid)); assert.ok(!JSON.stringify(doc).includes('sintetica'));
});
test('sesiones reales: expiracion inmediata logica sin depender del barrido TTL', async t => {
  const f = await almacen(t), sid = randomUUID();
  await llamar(f.store, 'set', sid, datos()); f.avanzar(3600001);
  assert.equal(await llamar(f.store, 'get', sid), null);
  await assert.rejects(llamar(f.store, 'set', sid, datos()), /ALMACEN_SESION_NO_DISPONIBLE/);
});
test('sesiones reales: sobreviven al reinicio del proceso de aplicacion', async t => {
  const f = await almacen(t), sid = randomUUID(); await llamar(f.store, 'set', sid, datos());
  const { fork } = require('node:child_process');
  const leer = () => new Promise((resolve, reject) => {
    const hijo = fork(require('node:path').join(__dirname, '../tests/soporte/sesionPersistente.child.cjs'), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const timer = setTimeout(() => { hijo.kill(); reject(Error('PLAZO_HIJO')); }, 10000);
    let encontrada = false;
    hijo.on('message', r => { encontrada = r.encontrada === true; });
    hijo.once('error', () => { clearTimeout(timer); reject(Error('ARRANQUE_HIJO')); });
    hijo.once('exit', codigo => { clearTimeout(timer); resolve(codigo === 0 && encontrada); });
    hijo.send({ base: f.conexion.name, marca: f.marca, sid, clave: f.clave.toString('base64') });
  });
  assert.ok(await leer()); assert.ok(await leer());
});
test('sesiones reales: logout impide resurreccion por escritura atrasada', async t => {
  const f = await almacen(t), sid = randomUUID();
  await llamar(f.store, 'set', sid, datos()); await llamar(f.store, 'destroy', sid);
  await assert.rejects(llamar(f.store, 'set', sid, datos()), /ALMACEN_SESION_NO_DISPONIBLE/);
  await llamar(f.store, 'touch', sid, datos()); assert.equal(await llamar(f.store, 'get', sid), null);
});
test('sesiones reales: alteracion del cifrado falla cerrada sin detalles', async t => {
  const f = await almacen(t), sid = randomUUID(); await llamar(f.store, 'set', sid, datos());
  await f.conexion.db.collection(COLECCION).updateOne({}, { $set: { 'datos.tag': randomBytes(16).toString('base64') } });
  await assert.rejects(llamar(f.store, 'get', sid), { message: 'ALMACEN_SESION_NO_DISPONIBLE' });
});
test('infra real: falta TTL bloquea comprobacion sin crearlo automaticamente', async t => {
  const f = await fixture(t);
  await f.conexion.db.createCollection(COLECCION);
  const store = new MongoSessionStore({ coleccion: f.conexion.db.collection(COLECCION), clave: randomBytes(32), ambito: 'sintetico' });
  await assert.rejects(store.comprobar(), /INDICE_SESION_REQUERIDO/);
  assert.equal((await f.conexion.db.collection(COLECCION).listIndexes().toArray()).length, 1);
});
test('sesiones reales: dos aplicaciones comparten sesion y cookie segura; HTTPS simulado', async t => {
  const f = await almacen(t), secret = randomBytes(48).toString('base64url');
  const app = () => { const a = express(); sesion.configurarProxy(a, { trustProxy: ['127.0.0.1/32', '::1/128'] });
    a.use(sesion({ secret, store: f.nuevo(), entorno: 'production' }));
    a.get('/crear', (req, res) => { req.session.prueba = 'sintetica'; res.sendStatus(204); });
    a.get('/leer', (req, res) => res.json({ encontrada: req.session.prueba === 'sintetica' })); return a; };
  const r = await request(app()).get('/crear').set('X-Forwarded-Proto', 'https');
  assert.equal(r.status, 204); const cookie = r.headers['set-cookie']?.[0]; assert.ok(cookie);
  for (const atributo of ['HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(cookie.includes(atributo));
  const lectura = await request(app()).get('/leer').set('X-Forwarded-Proto', 'https').set('Cookie', cookie.split(';')[0]);
  assert.equal(lectura.body.encontrada, true);
  assert.equal((await request(app()).get('/crear')).headers['set-cookie'], undefined);
});
