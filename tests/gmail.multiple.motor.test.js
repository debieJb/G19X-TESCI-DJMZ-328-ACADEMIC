const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const google = require('../services/googleOAuthClienteService');
const oauth = require('../services/gmailOAuthService');
const { crearMotor, huella } = require('../services/motorEnviosGmailService');
const { huellaDestinatarios } = require('../services/revisionEnvioCampanaService');
const { huellaEmail } = require('../services/consentimientoContactoService');
const id = n => n.toString(16).padStart(24, '0');
const hash = s => createHash('sha256').update(s).digest('hex');

// Almacenamiento en memoria: ejecuta el motor real sin conexiones ni escrituras MongoDB.
function fixture(t, cantidad = 4) {
  t.mock.method(mongoose, 'connect', () => { throw Error('MONGO_PROHIBIDO'); });
  t.mock.method(mongoose, 'createConnection', () => { throw Error('MONGO_PROHIBIDO'); });
  t.mock.method(global, 'fetch', () => { throw Error('RED_PROHIBIDA'); });
  t.mock.method(google, 'configuracion', () => ({ hash: 'cliente-prueba' }));
  let ahora = new Date('2026-10-22T12:00:00Z');
  const empresa = id(1), actor = id(2), campanaId = id(3);
  const tablas = {}, modelos = {};
  const coincide = (doc, filtro) => Object.entries(filtro).every(([campo, valor]) => {
    const actual = doc[campo];
    if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
      if ('$in' in valor) return valor.$in.some(v => String(v) === String(actual));
      if ('$ne' in valor) return String(actual) !== String(valor.$ne);
      if ('$gt' in valor) return actual > valor.$gt;
      if ('$lte' in valor) return actual <= valor.$lte;
    }
    return String(actual) === String(valor);
  });
  const consulta = resultado => ({
    select() { return this; }, session() { return this; },
    lean: async () => resultado,
    then(resolve, reject) { return Promise.resolve(resultado).then(resolve, reject); }
  });
  let secuencia = 1000;
  for (const nombre of ['Empresa', 'Usuario', 'Contacto', 'Campana', 'ConexionGmail', 'EjecucionGmail', 'EnvioGmail', 'ControlEnvioGmail', 'AutorizacionPilotoGmail']) {
    const tabla = tablas[nombre] = [];
    const schema = require('../models/' + nombre).schema;
    modelos[nombre] = class {
      static schema = schema;
      static collection = { listIndexes: () => ({ toArray: async () => schema.indexes().map(([key, opts]) => ({ key, ...opts })) }) };
      constructor(datos) { Object.assign(this, { _id: id(secuencia++), intentos: 0, usadosDia: 0, usadosHora: 0, historial: [] }, datos); }
      async save() { if (!tabla.includes(this)) tabla.push(this); return this; }
      toObject() { return { ...this }; }
      static find(f = {}) { return consulta(tabla.filter(d => coincide(d, f))); }
      static findOne(f) { return consulta(tabla.find(d => coincide(d, f)) || null); }
      static findById(_id) { return this.findOne({ _id }); }
      static countDocuments(f) { return consulta(tabla.filter(d => coincide(d, f)).length); }
      static exists(f) { return this.findOne(f); }
      static async updateOne(f, cambios) {
        const doc = tabla.find(d => coincide(d, f));
        if (!doc) return { matchedCount: 0 };
        Object.assign(doc, cambios.$set);
        for (const k of Object.keys(cambios.$unset || {})) delete doc[k];
        for (const [k, v] of Object.entries(cambios.$inc || {})) doc[k] = (doc[k] || 0) + v;
        for (const [k, v] of Object.entries(cambios.$max || {})) if (!doc[k] || doc[k] < v) doc[k] = v;
        if (cambios.$push?.historial) doc.historial.push(...cambios.$push.historial.$each);
        return { matchedCount: 1 };
      }
      static async updateMany(f, cambios) {
        for (const d of tabla.filter(d => coincide(d, f))) await this.updateOne({ _id: d._id }, cambios);
      }
    };
  }
  const agregar = (n, datos) => { const d = new modelos[n](datos); tablas[n].push(d); return d; };
  agregar('Usuario', { _id: actor, empresa, rol: 'admin_empresa', estadoAcceso: 'activo', emailVerificadoEn: new Date(0) });
  agregar('Empresa', { _id: empresa, estado: 'activa', estadoActivacion: 'verificada', automatizaciones: { email: { habilitada: true } } });
  const cuenta = agregar('ConexionGmail', { empresa, estado: 'conectada', email: 'empresa@example.test', googleSub: 'google-prueba', clienteOAuthHash: 'cliente-prueba', versionConexion: 1, scopes: [google.GMAIL_SEND] });
  const contactos = Array.from({ length: cantidad }, (_, i) => {
    const email = `persona${i}@example.test`;
    return agregar('Contacto', { _id: id(i + 10), empresa, nombre: 'Persona ' + i, email, activo: true, canales: { email: true },
      consentimientoMarketing: { estado: 'otorgado', fuente: 'Prueba', fecha: new Date(0), registradoPor: actor, registradoEn: new Date(0), emailHash: huellaEmail(email) } });
  });
  const campana = agregar('Campana', { _id: campanaId, empresa, estado: 'activa', versionFlujo: 2, canal: 'email', asunto: 'Campaña', cuerpoTexto: 'Mensaje de prueba',
    automatizacion: { estado: 'preparada', modo: 'inmediato' }, destinatarios: { tipo: 'contactos', contactos: contactos.map(c => c._id), etiquetas: [] } });
  const politica = { habilitado: true, supervisado: true, automatico: false, empresas: [empresa], maxDestinatarios: 50,
    cuotaDiaEmpresa: 100, cuotaHoraEmpresa: 30, cuotaDiaGlobal: 500, reservaMs: 120000, intervaloEmpresaMs: 2000, intervaloGlobalMs: 1000 };
  const conexion = { models: modelos, readyState: 1, db: { admin: () => ({ command: async () => ({ isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, setName: 'simulado', maxWireVersion: 9 }) }) }, transaction: async fn => fn(null) };
  t.mock.method(oauth, 'obtenerAccessToken', async () => ({ accessToken: 'token-ficticio', googleSub: cuenta.googleSub, email: cuenta.email, versionConexion: cuenta.versionConexion }));
  const mensajes = [];
  const motor = crearMotor({ conexion, politica: () => politica, reloj: () => ahora, simulador: { enviar: async d => { mensajes.push(d); return { gmailId: 'gmail-' + mensajes.length, threadId: 'thread-' + mensajes.length }; } } });
  const entrada = () => ({ campanaId, actorId: actor, claveIdempotencia: 'clave-idempotente-prueba', revision: huella(campana), revisionDestinatarios: huellaDestinatarios(contactos) });
  return { motor, tablas, politica, contactos, campana, mensajes, entrada, avanzar() { ahora = new Date(+ahora + 2200); } };
}

test('motor supervisado: varios mensajes individuales, resultados, historial e idempotencia sin red', async t => {
  const f = fixture(t);
  // Dos contactos con la misma dirección reciben un solo mensaje.
  f.contactos[3].email = f.contactos[0].email;
  f.contactos[3].consentimientoMarketing.emailHash = huellaEmail(f.contactos[0].email);
  const resultado = await f.motor.encolar(f.entrada());
  assert.equal(resultado.total, 3);
  assert.equal(f.mensajes.length, 0);
  assert.deepEqual(await f.motor.encolar(f.entrada()), resultado);
  assert.equal(f.tablas.EnvioGmail.length, 3);
  for (const envio of f.tablas.EnvioGmail) {
    assert.equal((await f.motor.procesarUno(envio._id)).estado, 'aceptado');
    f.avanzar();
    assert.equal((await f.motor.procesarUno(envio._id)).estado, 'sin_accion');
    assert.equal(envio.historial.length, 1);
    assert.equal(envio.historial[0].codigo, 'ACEPTADO_API');
  }
  assert.equal(f.mensajes.length, 3);
  const direcciones = new Set();
  for (const m of f.mensajes) {
    const texto = Buffer.from(m.raw, 'base64url').toString('utf8');
    assert.doesNotMatch(texto, /\r\n(?:Cc|Bcc):/);
    const to = texto.match(/\r\nTo: ([^\r\n]+)/)[1];
    assert.ok(!to.includes(',')); direcciones.add(to);
  }
  assert.equal(direcciones.size, 3);
  assert.equal(new Set(f.tablas.EnvioGmail.map(e => e.mensajeId)).size, 3);
  assert.ok(f.tablas.EnvioGmail.every(e => e.emailHash === hash(f.contactos.find(c => c._id === e.contacto).email)));
});

test('motor supervisado: máximo 50, cuotas y exceso se verifican antes de enviar', async t => {
  const f = fixture(t, 50);
  assert.equal((await f.motor.encolar(f.entrada())).total, 50);
  const g = fixture(t, 3); g.politica.maxDestinatarios = 2;
  await assert.rejects(g.motor.encolar(g.entrada()), { codigo: 'DESTINATARIOS_INVALIDOS' });
  assert.equal(g.tablas.EjecucionGmail.length, 0);
  assert.equal(g.mensajes.length, 0);
  f.politica.cuotaHoraEmpresa = 1;
  await f.motor.procesarUno(f.tablas.EnvioGmail[0]._id); f.avanzar();
  await assert.rejects(f.motor.procesarUno(f.tablas.EnvioGmail[1]._id), { codigo: 'CUOTA_LOCAL' });
  assert.equal(f.mensajes.length, 1);
});

for (const cambio of ['revocado', 'inactivo', 'ajeno']) test(`motor supervisado: rechaza contacto ${cambio} sin crear trabajos`, async t => {
  const f = fixture(t);
  if (cambio === 'revocado') f.contactos[0].consentimientoMarketing.estado = 'revocado';
  if (cambio === 'inactivo') f.contactos[0].activo = false;
  if (cambio === 'ajeno') f.contactos[0].empresa = id(999);
  await assert.rejects(f.motor.encolar(f.entrada()), { codigo: 'CONSENTIMIENTO_NO_DOCUMENTADO' });
  assert.equal(f.tablas.EnvioGmail.length, 0);
  assert.equal(f.mensajes.length, 0);
});

test('motor: consentimiento se revalida antes de cada mensaje y operador no autoriza', async t => {
  const f = fixture(t, 3);
  await f.motor.encolar(f.entrada());
  await f.motor.procesarUno(f.tablas.EnvioGmail[0]._id); f.avanzar();
  f.contactos[1].consentimientoMarketing.estado = 'revocado';
  assert.equal((await f.motor.procesarUno(f.tablas.EnvioGmail[1]._id)).estado, 'cancelado');
  assert.equal(f.mensajes.length, 1);
  assert.equal(f.tablas.EnvioGmail[1].historial[0].codigo, 'REVALIDACION');
  const g = fixture(t, 3); g.politica.supervisado = false; g.politica.automatico = true;
  g.tablas.Usuario[0].rol = 'operador';
  await assert.rejects(g.motor.encolar(g.entrada()), { codigo: 'ACCESO_DENEGADO' });
  assert.equal(g.mensajes.length, 0);
});
