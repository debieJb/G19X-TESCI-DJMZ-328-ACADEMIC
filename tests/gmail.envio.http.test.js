const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const motorService = require('../services/motorEnviosGmailService');
const original = motorService.crearMotor;
const anterior = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
after(() => { if (anterior === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = anterior; });
const { crearContexto } = require('./soporte/sesion');
const actor = '507f1f77bcf86cd799439011', empresa = '507f1f77bcf86cd799439012', campana = '507f1f77bcf86cd799439013';
let contexto, llamados;
beforeEach(t => {
  contexto = crearContexto(t, { _id: actor, rol: 'admin_empresa', empresa: { _id: empresa } }); llamados = [];
  // Solo fixture HTTP: las comprobaciones reales de destino/indices se prueban aparte.
  contexto.app.locals.pilotoInfraValidada = true;
  t.mock.method(mongoose, 'connect', () => { throw Error('SIN_BASE_REAL'); });
  t.mock.method(mongoose, 'createConnection', () => { throw Error('SIN_BASE_REAL'); });
  t.mock.method(global, 'fetch', () => { throw Error('SIN_RED_REAL'); });
});
const datos = () => ({ confirmacion: 'ENVIAR', idempotencia: randomBytes(24).toString('base64url') });
test('Gmail HTTP: bandera predeterminada bloquea antes de persistir', async t => {
  // Usar motor real con política cerrada, sin depender del entorno del ejecutor.
  t.mock.method(motorService, 'crearMotor', () => original({ conexion: {}, politica: () => ({ habilitado: false }) }));
  await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send(datos()).expect(503);
  assert.equal(llamados.length, 0);
});
test('Gmail HTTP: CSRF y confirmación obligatorios', async t => {
  t.mock.method(motorService, 'crearMotor', () => ({ encolar: async d => { llamados.push(d); return {}; } }));
  await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send({ ...datos(), _csrf: randomBytes(32).toString('base64url') }).expect(403);
  await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send({ idempotencia: randomBytes(24).toString('base64url') }).expect(422);
  assert.equal(llamados.length, 0);
});
test('Gmail HTTP: solo pasa actor de sesión y campaña de ruta; nunca acepta remitente o empresa', async t => {
  t.mock.method(motorService, 'crearMotor', () => ({ encolar: async d => { llamados.push(d); return { ejecucion: campana, total: 1 }; } }));
  await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send({ ...datos(), empresa, remitente: 'otra@example.test' }).expect(422);
  const res = await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send(datos()).expect(202);
  assert.equal(llamados.length, 1); assert.equal(llamados[0].actorId, actor); assert.equal(llamados[0].campanaId, campana);
  assert.equal(res.body.entregado, undefined);
});
test('Gmail HTTP: conflicto idempotente y acceso denegado se presentan sin detalles externos', async t => {
  const doble = { encolar: async () => { throw { codigo: 'IDEMPOTENCIA_CONFLICTO' }; } };
  t.mock.method(motorService, 'crearMotor', () => doble);
  await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send(datos()).expect(409);
  doble.encolar = async () => { throw { codigo: 'ACCESO_DENEGADO' }; };
  await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send(datos()).expect(403);
});
test('Gmail HTTP: estado usa identidad de sesión y no contiene payloads', async t => {
  t.mock.method(motorService, 'crearMotor', () => ({ consultar: async d => { llamados.push(d); return { envios: [{ estado: 'aceptado' }] }; } }));
  const res = await contexto.cliente.get(`/campanas/${campana}/gmail/ejecucion`).expect(200);
  assert.equal(res.body.envios[0].estado, 'aceptado'); assert.equal(llamados[0].actorId, actor);
  assert.equal(res.headers['cache-control'], 'no-store');
});
test('piloto HTTP: autorizacion exige CSRF, confirmacion y campos estrictos', async t => {
  t.mock.method(motorService, 'crearMotor', () => ({ autorizarPiloto: async d => { llamados.push(d); return { autorizacion: campana }; } }));
  const ruta = `/campanas/${campana}/gmail/piloto/autorizar`;
  await contexto.cliente.post(ruta).send({ confirmacion: 'AUTORIZAR_UN_ENVIO', _csrf: 'invalido' }).expect(403);
  await contexto.cliente.post(ruta).send({ confirmacion: 'ENVIAR' }).expect(422);
  await contexto.cliente.post(ruta).send({ confirmacion: 'AUTORIZAR_UN_ENVIO', empresa }).expect(422);
  await contexto.cliente.post(ruta).send({ confirmacion: 'AUTORIZAR_UN_ENVIO' }).expect(201);
  assert.equal(llamados.length, 1); assert.equal(llamados[0].actorId, actor);
});
test('piloto HTTP: revocacion exige CSRF y empresa se deriva de actor', async t => {
  t.mock.method(motorService, 'crearMotor', () => ({ revocarPiloto: async d => { llamados.push(d); return { revocada: true }; } }));
  const ruta = `/campanas/${campana}/gmail/piloto/revocar`;
  await contexto.cliente.post(ruta).send({ _csrf: 'invalido' }).expect(403);
  await contexto.cliente.post(ruta).send({}).expect(200); assert.equal(llamados[0].actorId, actor);
});
test('piloto HTTP: arranque normal sin infraestructura validada no autoriza ni encola', async t => {
  delete contexto.app.locals.pilotoInfraValidada;
  t.mock.method(motorService, 'crearMotor', () => { llamados.push({}); throw Error('NO_LLAMAR'); });
  await contexto.cliente.post(`/campanas/${campana}/gmail/piloto/autorizar`).send({ confirmacion: 'AUTORIZAR_UN_ENVIO' }).expect(503);
  await contexto.cliente.post(`/campanas/${campana}/gmail/confirmar`).send(datos()).expect(503);
  assert.equal(llamados.length, 0);
});
