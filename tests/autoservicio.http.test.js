const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const service = require('../services/autoservicioEmpresarialService');
const { crearAppRegistro, campo } = require('./soporte/registroPublicoHttp');
let agente, llamadas, doble;
beforeEach(t => {
  const { app, store } = crearAppRegistro();
  t.after(() => store.clear());
  agente = request.agent(app); llamadas = [];
  doble = { limitar: async () => {}, solicitar: async datos => llamadas.push(datos), reenviar: async () => {},
    verificar: async () => ({ solicitud: '507f1f77bcf86cd799439011' }), configurar: async () => {} };
  t.mock.method(service, 'crearServicio', () => doble);
  for (const metodo of ['connect', 'createConnection']) t.mock.method(mongoose, metodo, () => { throw Error('SIN_BASE_REAL'); });
  t.mock.method(global, 'fetch', () => { throw Error('SIN_RED'); });
});
const formulario = async () => {
  const res = await agente.get('/registro').expect(200);
  return { _csrf: campo(res.text, '_csrf'), idempotencia: campo(res.text, 'idempotencia'), nombreEmpresa: 'Empresa', correo: 'persona@example.test' };
};
test('HTTP registro: formulario accesible sin contraseña ni efectos de persistencia', async () => {
  const res = await agente.get('/registro').expect(200);
  assert.match(res.text, /lang="es"/); assert.match(res.text, /for="correo"/);
  assert.doesNotMatch(res.text, /type="password"/);
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(llamadas.length, 0);
});
test('HTTP registro: CSRF ausente y de otra sesión no permiten solicitar', async () => {
  const datos = await formulario();
  await agente.post('/registro').type('form').send({ ...datos, _csrf: randomBytes(32).toString('base64url') }).expect(403);
  delete datos._csrf;
  await agente.post('/registro').type('form').send(datos).expect(403);
  assert.equal(llamadas.length, 0);
});
test('HTTP registro: respuesta idéntica para solicitud nueva y conflicto idempotente', async () => {
  const datos = await formulario();
  const primera = await agente.post('/registro').type('form').send(datos).expect(202);
  doble.solicitar = async () => { throw { codigo: 'IDEMPOTENCIA_CONFLICTO' }; };
  const segunda = await agente.post('/registro').type('form').send(datos).expect(202);
  assert.equal(primera.text, segunda.text);
  assert.doesNotMatch(primera.text, /persona@example.test/);
});
test('HTTP registro: rate limit y backend no disponible fallan cerrados', async () => {
  const datos = await formulario();
  doble.limitar = async () => { throw { codigo: 'LIMITE_SOLICITUDES' }; };
  await agente.post('/registro').type('form').send(datos).expect(429);
  doble.limitar = async () => { throw Error('SIN_BASE_REAL'); };
  await agente.post('/registro').type('form').send(datos).expect(503);
  assert.equal(llamadas.length, 0);
});
test('HTTP registro: rechaza campos manipulados y contraseña inicial', async () => {
  const datos = await formulario();
  await agente.post('/registro').type('form').send({ ...datos, password: randomBytes(32).toString('hex') }).expect(422);
  assert.equal(llamadas.length, 0);
});
test('HTTP verificación: GET limpia URL sin consumir, POST requiere CSRF y regenera sesión', async () => {
  const token = randomBytes(32).toString('base64url'); let consumos = 0;
  doble.verificar = async ({ hashEnlace }) => { assert.ok(hashEnlace === service.tokenHash(token)); consumos++; return { solicitud: '507f1f77bcf86cd799439011' }; };
  await agente.get('/registro/verificar').query({ token }).expect(303).expect('Location', '/registro/verificar');
  assert.equal(consumos, 0);
  const pagina = await agente.get('/registro/verificar').expect(200);
  assert.ok(!pagina.text.includes(token));
  await agente.post('/registro/verificar').expect(403);
  await agente.post('/registro/verificar').type('form').send({ _csrf: campo(pagina.text, '_csrf') }).expect(303).expect('Location', '/registro/administrador');
  const siguiente = await agente.get('/registro/administrador').expect(200);
  assert.ok(campo(siguiente.text, '_csrf') !== campo(pagina.text, '_csrf'));
  assert.equal(consumos, 1);
});
test('HTTP administrador: acceso sin sesión verificada rechazado', async () => {
  await agente.get('/registro/administrador').expect(422);
});
test('HTTP reenvío: respuesta genérica y CSRF obligatorio', async () => {
  const res = await agente.get('/registro/reenviar').expect(200);
  await agente.post('/registro/reenviar').type('form').send({ correo: 'persona@example.test' }).expect(403);
  await agente.post('/registro/reenviar').type('form').send({ correo: 'persona@example.test', _csrf: campo(res.text, '_csrf') }).expect(202);
});
