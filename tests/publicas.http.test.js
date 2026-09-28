const { test, mock, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const protecciones = [];
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  protecciones.push(mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido en pruebas'); }));
}
const request = require('supertest');
process.env.SESSION_SECRET = 'secreto-exclusivo-de-pruebas-publicas';
const app = require('../app');
const Campana = require('../models/Campana');

after(() => {
  for (const proteccion of protecciones) {
    assert.equal(proteccion.mock.callCount(), 0);
    proteccion.mock.restore();
  }
});

test('públicas: inicio responde 200 con marca y enlaces de acceso en navbar y hero', async () => {
  const respuesta = await request(app).get('/').expect(200);
  assert.match(respuesta.text, /Marketing Automation/);
  assert.equal((respuesta.text.match(/href="\/login">Iniciar sesión<\/a>/g) || []).length, 2);
  assert.match(respuesta.text, new RegExp(`&copy; ${new Date().getFullYear()}`));
  assert.equal(respuesta.headers['set-cookie'], undefined);
});

test('públicas: inicio presenta las seis funcionalidades y los tres niveles', async () => {
  const { text } = await request(app).get('/').expect(200);
  for (const contenido of ['Gestión de campañas', 'Automatización de procesos', 'Campañas por correo electrónico', 'Gestión de empresas', 'Usuarios con diferentes niveles de acceso', 'Integraciones y automatización con servicios externos', 'Superadministrador', 'Administrador de empresa', 'Operador', 'No puede acceder a otras empresas', 'No administra usuarios ni empresas']) {
    assert.ok(text.includes(contenido), contenido);
  }
});

test('públicas: login responde 200 con campos etiquetados y regreso al inicio', async () => {
  const respuesta = await request(app).get('/login').expect(200);
  assert.match(respuesta.text, /<h1[^>]*>Iniciar sesión<\/h1>/);
  for (const campo of ['email', 'password']) {
    assert.match(respuesta.text, new RegExp(`<input[^>]*id="${campo}"[^>]*name="${campo}"[^>]*type="${campo}"`));
    assert.match(respuesta.text, new RegExp(`<label for="${campo}">`));
  }
  assert.match(respuesta.text, /href="\/">← Volver al inicio/);
  assert.equal(respuesta.headers['set-cookie'], undefined);
});

test('públicas: acceso mediante formulario POST y sin credenciales prellenadas', async () => {
  const { text } = await request(app).get('/login').expect(200);
  assert.match(text, /<button type="submit"[^>]*>Iniciar sesión<\/button>/);
  assert.match(text, /<form[^>]*action="\/login"[^>]*method="post"/);
  assert.doesNotMatch(text, /<script\b|\bdisabled\b|\bonclick\s*=|\bvalue\s*=/i);
  await request(app).post('/login').expect(401);
});

test('campañas: exige sesión y conserva navegación para usuario autenticado', async t => {
  await request(app).get('/campanas').expect(302).expect('Location', '/login');
  const { cliente } = require('./soporte/sesion').crearContexto(t, { _id: '507f1f77bcf86cd799439011', rol: 'superadmin' });
  const consulta = t.mock.method(Campana, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  const { text } = await cliente.get('/campanas').expect(200);
  assert.match(text, /Campañas/);
  assert.match(text, /href="\/campanas\/nueva"/);
  assert.equal(consulta.mock.callCount(), 1);
});
