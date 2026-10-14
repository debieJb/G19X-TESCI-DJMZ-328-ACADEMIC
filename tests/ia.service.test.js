const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Usuario = require('../models/Usuario');
const Empresa = require('../models/Empresa');
const Contacto = require('../models/Contacto');
const Campana = require('../models/Campana');
const service = require('../services/iaService');
const proveedores = require('../services/ia/proveedores');
const limites = require('../services/ia/limitesIA');
const contrato = require('../services/ia/contratoIA');
const A = '507f1f77bcf86cd799439011', B = '507f1f77bcf86cd799439012', ID = '507f1f77bcf86cd799439013';
const entrada = () => ({ producto: 'Producto local privado', categoria: 'software', objetivo: 'presentar', audiencia: 'empresas', tono: 'profesional', canal: 'email' });
const salida = () => ({ asunto: 'Conoce {{PRODUCTO}}', mensaje: 'Descubre cómo {{PRODUCTO}} puede ayudarte.', llamadaAccion: 'Solicita información', segmentacion: ['Empresas interesadas en software'] });
let usuario, actor, empresa, generar, cuota, fabrica;
beforeEach(t => {
  usuario = { _id: ID, rol: 'admin_empresa', empresa: A };
  actor = { ...usuario }; empresa = { estado: 'activa' };
  t.mock.method(Usuario, 'findOne', filtro => { assert.equal(String(filtro._id), ID); return { select: () => ({ lean: async () => actor }) }; });
  t.mock.method(Empresa, 'findById', id => { assert.equal(String(id), A); return { select: () => ({ lean: async () => empresa }) }; });
  t.mock.method(Contacto, 'find', () => { throw new Error('Prohibido consultar contactos para IA'); });
  t.mock.method(Campana, 'create', () => { throw new Error('La generación no guarda campañas'); });
  generar = t.mock.fn(async () => salida());
  fabrica = t.mock.method(proveedores, 'crear', () => ({ nombre: 'Simulado exclusivamente en pruebas', generar }));
  cuota = t.mock.method(limites, 'consumir', async () => {});
});

test('IA: contexto externo contiene solo catálogo, nunca producto, actor, empresa o contactos', async () => {
  const datos = { ...entrada(), producto: 'Persona privada persona@example.test' };
  const r = await service.generar(usuario, datos);
  const contexto = generar.mock.calls[0].arguments[0];
  assert.deepEqual(contexto, contrato.contextoPublico(contrato.validarEntrada(datos)));
  assert.doesNotMatch(JSON.stringify(contexto), /Persona|persona@|507f1f/);
  assert.ok(r.asunto.includes(datos.producto));
  assert.equal(r.empresa, A); assert.equal(cuota.mock.calls[0].arguments[0], A);
});

test('IA: operadores propios autorizados y registros históricos conservan acceso', async () => {
  usuario.rol = actor.rol = 'operador';
  assert.equal((await service.generar(usuario, entrada())).empresa, A);
});

test('IA: impide suplantación de empresa, rol o usuario y no llama al proveedor', async () => {
  for (const cambio of [{ empresa: B }, { rol: 'superadmin' }, { empresa: null }, { _id: 'invalido' }]) {
    await assert.rejects(service.generar({ ...usuario, ...cambio }, entrada()), e => e.status === 403);
  }
  actor.empresa = B;
  await assert.rejects(service.generar(usuario, entrada()), e => e.status === 403);
  assert.equal(fabrica.mock.callCount(), 0);
});

test('IA: usuarios pendientes/bloqueados y empresas pendientes/inactivas no generan', async () => {
  for (const estadoAcceso of ['pendiente_verificacion', 'bloqueado', 'desconocido']) {
    actor.estadoAcceso = estadoAcceso; await assert.rejects(service.generar(usuario, entrada()), e => e.status === 403);
  }
  delete actor.estadoAcceso;
  for (const doc of [{ estado: 'inactiva' }, { estado: 'activa', estadoActivacion: 'pendiente_verificacion' }, null]) {
    empresa = doc; await assert.rejects(service.generar(usuario, entrada()), e => e.status === 403);
  }
  assert.equal(generar.mock.callCount(), 0);
});

test('IA: valida campos y rechaza instrucciones libres, contactos, canal ajeno y longitudes', async () => {
  for (const cambio of [{ producto: 'a'.repeat(101) }, { producto: {} }, { objetivo: 'Envía a persona@example.test' },
    { contactos: [ID] }, { empresa: B }, { canal: 'whatsapp' }, { tono: '__proto__' }, { audiencia: ['empresas'] }]) {
    await assert.rejects(service.generar(usuario, { ...entrada(), ...cambio }), e => e.status === 422);
  }
  assert.equal(fabrica.mock.callCount(), 0); assert.equal(cuota.mock.callCount(), 0);
});

test('IA: proveedor no configurado falla cerrado, sin cuota ni contenido simulado', async t => {
  t.mock.method(proveedores, 'crear', () => { throw new (require('../services/ia/ErrorIA'))('DESHABILITADA'); });
  await assert.rejects(service.generar(usuario, entrada()), e => e.status === 503 && /deshabilitada/.test(e.message));
  assert.equal(cuota.mock.callCount(), 0); assert.equal(generar.mock.callCount(), 0);
});

test('IA: resultado malformado, HTML, herramientas o enlaces no se aceptan', async () => {
  for (const valor of [null, { ...salida(), asunto: '<script>alert(1)</script>' }, { ...salida(), segmentacion: [] },
    { ...salida(), tools: ['enviar'] }, { ...salida(), llamadaAccion: 'https://malicioso.test' }, { ...salida(), mensaje: 'a'.repeat(3001) }]) {
    generar.mock.mockImplementation(async () => valor);
    await assert.rejects(service.generar(usuario, entrada()), e => e.codigo === 'RESPUESTA');
  }
});

test('IA: errores externos no exponen detalles ni secretos y liberan concurrencia', async () => {
  generar.mock.mockImplementation(async () => { throw new Error('SECRETO_INTERNO_NO_EXPONER'); });
  await assert.rejects(service.generar(usuario, entrada()), e => e.status === 503 && !e.message.includes('SECRETO'));
  generar.mock.mockImplementation(async () => salida());
  await service.generar(usuario, entrada());
});

test('IA: una solicitud simultánea por empresa y ninguna generación al exceder cuota', async () => {
  let liberar, iniciada;
  const inicio = new Promise(resolve => { iniciada = resolve; });
  generar.mock.mockImplementation(() => { iniciada(); return new Promise(resolve => { liberar = resolve; }); });
  const primera = service.generar(usuario, entrada()); await inicio;
  await assert.rejects(service.generar(usuario, entrada()), e => e.status === 429);
  liberar(salida()); await primera;
  cuota.mock.mockImplementation(async () => { throw new (require('../services/ia/ErrorIA'))('LIMITE'); });
  await assert.rejects(service.generar(usuario, entrada()), e => e.status === 429);
  assert.equal(generar.mock.callCount(), 1);
});
