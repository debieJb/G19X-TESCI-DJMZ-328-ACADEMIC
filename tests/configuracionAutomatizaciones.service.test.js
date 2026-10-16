const { consentimientoPrueba } = require('./soporte/consentimiento');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Empresa = require('../models/Empresa');
const Contacto = require('../models/Contacto');
const { resolverWebhook } = require('../services/configuracionAutomatizacionesService');
const automatizacion = require('../services/automatizacionService');
const empresaId = '507f1f77bcf86cd799439011';
const usuario = { rol: 'operador', empresa: empresaId };
const campana = { _id: empresaId, empresa: empresaId, destinatarios: { tipo: 'todos' }, nombre: 'Campaña', objetivo: 'Objetivo', estado: 'activa', canal: 'email', asunto: 'Asunto', cuerpoTexto: 'Texto' };
let empresa, peticiones, payloads;
beforeEach(t => {
  t.mock.method(Contacto.collection, 'find', () => ({ toArray: async () => [{ _id: empresaId, empresa: empresaId, ...consentimientoPrueba(), activo: true, email: 'prueba@example.test' }] }));
  empresa = new Empresa({ nombre: 'Empresa' }); peticiones = []; payloads = [];
  t.mock.method(Empresa, 'findById', id => {
    assert.equal(String(id), empresaId);
    return { select: async seleccion => { assert.match(seleccion, /\+automatizaciones.email.webhookUrl/); return empresa; } };
  });
  t.mock.method(global, 'fetch', async (url, opciones) => { peticiones.push(String(url)); payloads.push(opciones.body); return new Response(null, { status: 204 }); });
  const anterior = process.env.N8N_WEBHOOK_URL;
  process.env.N8N_WEBHOOK_URL = 'https://global.example.test/webhook';
  t.after(() => { if (anterior === undefined) delete process.env.N8N_WEBHOOK_URL; else process.env.N8N_WEBHOOK_URL = anterior; });
});
const codigo = esperado => error => error.codigo === esperado;

test('webhooks: empresarial válido tiene prioridad y nunca se envía configuración en payload', async () => {
  empresa.automatizaciones.email.webhookUrl = 'https://empresa.example.test/secreto';
  await assert.rejects(automatizacion.ejecutarCampana(campana, usuario), codigo('ENVIOS_BLOQUEADOS'));
  assert.equal(String(await resolverWebhook(campana, usuario)), 'https://empresa.example.test/secreto');
  assert.deepEqual(peticiones, []);
  assert.deepEqual(payloads, []);
});

test('webhooks: empresarial vacío usa fallback global; configuración heredada también', async () => {
  await assert.rejects(automatizacion.ejecutarCampana(campana, usuario), codigo('ENVIOS_BLOQUEADOS'));
  empresa = { nombre: 'Empresa antigua' };
  await assert.rejects(automatizacion.ejecutarCampana(campana, usuario), codigo('ENVIOS_BLOQUEADOS'));
  assert.equal(String(await resolverWebhook(campana, usuario)), 'https://global.example.test/webhook');
  assert.deepEqual(peticiones, []);
});

test('webhooks: deshabilitada bloquea aun con URL empresarial y global', async () => {
  empresa.automatizaciones.email.habilitada = false;
  empresa.automatizaciones.email.webhookUrl = 'https://empresa.example.test/webhook';
  await assert.rejects(automatizacion.ejecutarCampana(campana, usuario), codigo('DESHABILITADA'));
  assert.equal(peticiones.length, 0);
});

test('webhooks: URL empresarial inválida nunca recurre al global', async () => {
  for (const url of ['invalida', ' ', 'ftp://example.test/hook', 'http://usuario:secreto@example.test/']) {
    empresa.automatizaciones.email.webhookUrl = url;
    await assert.rejects(automatizacion.ejecutarCampana(campana, usuario), codigo('CONFIGURACION'));
  }
  assert.equal(peticiones.length, 0);
});

test('webhooks: empresa inexistente bloquea sin fallback', async () => {
  empresa = null;
  await assert.rejects(automatizacion.ejecutarCampana(campana, usuario), codigo('CONFIGURACION'));
  assert.equal(peticiones.length, 0);
});

test('webhooks: ausencia de ambas configuraciones devuelve error', async () => {
  delete process.env.N8N_WEBHOOK_URL;
  await assert.rejects(automatizacion.ejecutarCampana(campana, usuario), codigo('CONFIGURACION'));
  assert.equal(peticiones.length, 0);
});

test('webhooks: histórica usa global solo para superadmin, nunca para empresa o anónimo', async () => {
  const antigua = { ...campana, empresa: undefined };
  for (const actor of [usuario, { rol: 'admin_empresa', empresa: empresaId }, undefined]) {
    await assert.rejects(automatizacion.ejecutarCampana(antigua, actor), codigo('ACCESO_DENEGADO'));
  }
  assert.equal(String(await resolverWebhook(antigua, { rol: 'superadmin' })), 'https://global.example.test/webhook');
  await assert.rejects(automatizacion.ejecutarCampana(antigua, { rol: 'superadmin' }), codigo('DESTINATARIOS_INVALIDOS'));
  assert.deepEqual(peticiones, []);
});

test('webhooks: usuarios de otra empresa no resuelven configuración', async () => {
  await assert.rejects(resolverWebhook(campana, { rol: 'operador', empresa: '507f1f77bcf86cd799439012' }), codigo('ACCESO_DENEGADO'));
  assert.equal(peticiones.length, 0);
});

test('webhooks: canales retirados no ejecutan aunque la configuración los habilite', async () => {
  empresa.automatizaciones.whatsapp.habilitada = true;
  empresa.automatizaciones.facebook.habilitada = true;
  for (const canal of ['whatsapp', 'sms', 'facebook', 'linkedin', 'redes_sociales', 'otro']) {
    await assert.rejects(automatizacion.ejecutarCampana({ ...campana, canal }, usuario), codigo('CANAL_NO_DISPONIBLE'));
  }
  assert.equal(peticiones.length, 0);
});
