// HTTP, sesiones, controladores, modelos y bcrypt reales; solo persistencia y
// limitador de login usan dobles locales. Sin MongoDB, .env ni proveedores.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { crearApp } = require('../appFactory');
const Usuario = require('../models/Usuario');
const Empresa = require('../models/Empresa');
const Campana = require('../models/Campana');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2);
const password = 'frase-privada-solo-fixture';
let app, usuarios, empresas;
const coincide = (fila, filtro) => Object.entries(filtro).every(([campo, valor]) => {
  if (valor?.$in) return valor.$in.some(v => String(v) === String(fila[campo]));
  if (valor?.$exists !== undefined) return (fila[campo] !== undefined) === valor.$exists;
  return String(fila[campo]) === String(valor);
});
beforeEach(async t => {
  const hash = await bcrypt.hash(password, 4);
  usuarios = [
    { _id: id(10), nombre: 'Admin Alfa', email: 'admin@alfa.test', password: hash, empresa: A, rol: 'admin_empresa', estadoAcceso: 'activo', emailVerificadoEn: new Date() },
    { _id: id(11), nombre: 'Admin Beta', email: 'admin@beta.test', password: hash, empresa: B, rol: 'admin_empresa', estadoAcceso: 'activo', emailVerificadoEn: new Date() }
  ];
  empresas = [
    { _id: A, nombre: 'Empresa Alfa', estado: 'activa', versionAlta: 1, estadoActivacion: 'verificada' },
    { _id: B, nombre: 'Empresa Beta', estado: 'activa', versionAlta: 1, estadoActivacion: 'verificada' }
  ];
  t.mock.method(require('../services/loginLimitesService'), 'consumir', async () => {});
  t.mock.method(mongoose, 'connect', () => { throw Error('Conexión real prohibida'); });
  for (const [modelo, filas] of [[Usuario, usuarios], [Empresa, empresas]]) {
    t.mock.method(modelo.collection, 'findOne', async filtro => {
      const fila = filas.find(f => coincide(f, filtro)); return fila ? { ...fila } : null;
    });
    t.mock.method(modelo.collection, 'find', filtro => ({ toArray: async () => filas.filter(f => coincide(f, filtro)).map(f => ({ ...f })) }));
  }
  t.mock.method(Campana.collection, 'find', () => ({ toArray: async () => [] }));
  t.mock.method(Usuario.collection, 'insertOne', async datos => {
    usuarios.push({ ...datos }); return { insertedId: datos._id };
  });
  t.mock.method(Usuario.collection, 'updateOne', async (filtro, update) => {
    const fila = usuarios.find(u => coincide(u, filtro));
    if (!fila) return { matchedCount: 0 };
    Object.assign(fila, update.$set); return { matchedCount: 1 };
  });
  const store = new session.MemoryStore(); t.after(() => store.clear());
  app = crearApp({ secret: 'secreto-local-ciclo-operadores', store, entorno: 'test' });
});
const token = pagina => {
  const campo = pagina.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/);
  assert.ok(campo, 'token CSRF en formulario'); return campo[1];
};
const entrar = async (agente, email, status = 303) => {
  const pagina = await agente.get('/login').expect(200);
  return agente.post('/login').send({ email, password, _csrf: token(pagina) }).expect(status);
};
const crear = async admin => {
  const formulario = await admin.get('/empresa/usuarios/nuevo').expect(200);
  const csrf = token(formulario);
  await admin.post('/empresa/usuarios').send({ nombre: 'Operador Alfa', email: 'operador@alfa.test', password, rol: 'superadmin', empresa: String(B), estadoAcceso: 'activo', _csrf: csrf }).expect(303);
  const operador = usuarios.find(u => u.email === 'operador@alfa.test');
  assert.ok(operador); assert.equal(operador.rol, 'operador');
  assert.equal(String(operador.empresa), String(A));
  assert.equal(operador.estadoAcceso, 'pendiente_verificacion');
  return { operador, csrf };
};
test('ciclo real HTTP: crear pendiente, activar, login, bloqueo revoca sesión y reactivar', async () => {
  const admin = request.agent(app); await entrar(admin, 'admin@alfa.test');
  const { operador, csrf } = await crear(admin);
  const ruta = `/empresa/usuarios/${operador._id}`;
  const panel = await admin.get('/panel').expect(200);
  for (const texto of ['Empresa Alfa', 'Operador Alfa', 'operador@alfa.test', 'Pendiente de activación', 'Activar operador', 'Consultar']) assert.ok(panel.text.includes(texto));
  const detalle = await admin.get(ruta).expect(200);
  assert.match(detalle.text, /Empresa Alfa/); assert.doesNotMatch(detalle.text, /\$2[ab]\$/);
  await entrar(request.agent(app), operador.email, 401);
  // Ni token ausente ni de otra sesión permite activar.
  await admin.post(`${ruta}/estado`).send({ estadoAcceso: 'activo' }).expect(403);
  const otraSesion = request.agent(app); await entrar(otraSesion, 'admin@alfa.test');
  const otroCsrf = token(await otraSesion.get('/empresa/usuarios/nuevo').expect(200));
  await admin.post(`${ruta}/estado`).send({ estadoAcceso: 'activo', _csrf: otroCsrf }).expect(403);
  assert.equal(operador.estadoAcceso, 'pendiente_verificacion');
  await admin.post(`${ruta}/estado`).send({ estadoAcceso: 'activo', _csrf: csrf }).expect(303);
  const agente = request.agent(app); await entrar(agente, operador.email);
  const propio = await agente.get('/panel').expect(200);
  assert.doesNotMatch(propio.text, /Activar operador|Nuevo operador|Gmail empresarial/);
  await agente.get(ruta).expect(403);
  await admin.post(ruta).send({ nombre: 'Operador editado', email: operador.email, empresa: String(B), rol: 'admin_empresa', _csrf: csrf }).expect(303);
  assert.equal(operador.nombre, 'Operador editado'); assert.equal(operador.rol, 'operador'); assert.equal(String(operador.empresa), String(A));
  await admin.post(`${ruta}/estado`).send({ estadoAcceso: 'bloqueado', _csrf: csrf }).expect(303);
  await agente.get('/panel').expect(302).expect('Location', '/login');
  await entrar(request.agent(app), operador.email, 401);
  await admin.post(`${ruta}/estado`).send({ estadoAcceso: 'activo', _csrf: csrf }).expect(303);
  // Una sesión destruida no resucita con la reactivación.
  await agente.get('/panel').expect(302).expect('Location', '/login');
  await entrar(agente, operador.email); await agente.get('/panel').expect(200);
});
test('ciclo HTTP: verificación y estado empresarial condicionan activación y reactivación', async () => {
  const admin = request.agent(app); await entrar(admin, 'admin@alfa.test');
  empresas[0].estadoActivacion = 'pendiente_verificacion';
  const { operador, csrf } = await crear(admin);
  const ruta = `/empresa/usuarios/${operador._id}/estado`;
  await admin.post(ruta).send({ estadoAcceso: 'activo', _csrf: csrf }).expect(403);
  await entrar(request.agent(app), operador.email, 401);
  empresas[0].estadoActivacion = 'verificada'; empresas[0].estado = 'inactiva';
  await admin.post(ruta).send({ estadoAcceso: 'activo', _csrf: csrf }).expect(403);
  empresas[0].estado = 'activa';
  await admin.post(ruta).send({ estadoAcceso: 'activo', _csrf: csrf }).expect(303);
  await admin.post(ruta).send({ estadoAcceso: 'bloqueado', _csrf: csrf }).expect(303);
  empresas[0].estado = 'inactiva';
  await admin.post(ruta).send({ estadoAcceso: 'activo', _csrf: csrf }).expect(403);
  await entrar(request.agent(app), operador.email, 401);
});
test('ciclo HTTP: administrador ajeno no lista, consulta, edita ni activa operador', async () => {
  const admin = request.agent(app); await entrar(admin, 'admin@alfa.test');
  const { operador } = await crear(admin);
  const ajeno = request.agent(app); await entrar(ajeno, 'admin@beta.test');
  const csrf = token(await ajeno.get('/empresa/usuarios/nuevo').expect(200));
  const panel = await ajeno.get('/panel').expect(200);
  assert.doesNotMatch(panel.text, /operador@alfa.test|Operador Alfa/);
  const ruta = `/empresa/usuarios/${operador._id}`;
  await ajeno.get(ruta).expect(404); await ajeno.get(`${ruta}/editar`).expect(404);
  await ajeno.post(ruta).send({ nombre: 'Intruso', email: operador.email, _csrf: csrf }).expect(404);
  for (const estadoAcceso of ['activo', 'bloqueado']) await ajeno.post(`${ruta}/estado`).send({ estadoAcceso, _csrf: csrf }).expect(404);
  assert.equal(operador.estadoAcceso, 'pendiente_verificacion'); assert.equal(operador.nombre, 'Operador Alfa');
});
