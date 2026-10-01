const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [objeto, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(objeto, metodo, () => { throw new Error('Acceso externo prohibido en pruebas'); });
}
const Contacto = require('../models/Contacto');
const Campana = require('../models/Campana');
const service = require('../services/destinatariosService');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const empresa = id(1), otra = id(2);
let contactos, filtros;
const coincide = (doc, filtro) => Object.entries(filtro).every(([campo, valor]) => {
  if (valor?.$in) return (Array.isArray(doc[campo]) ? doc[campo] : [doc[campo]]).some(actual => valor.$in.some(v => String(v) === String(actual)));
  if (valor?.$type) return typeof doc[campo] === valor.$type;
  return String(doc[campo]) === String(valor);
});
beforeEach(t => {
  contactos = [
    { _id: id(10), empresa, nombre: 'Uno', activo: true, email: 'uno@example.test', telefono: '111', etiquetas: ['vip', 'ventas'], privado: 'SECRETO' },
    { _id: id(11), empresa, nombre: 'Dos', activo: true, email: 'dos@example.test', etiquetas: ['ventas'] },
    { _id: id(12), empresa, nombre: 'Teléfono', activo: true, telefono: '222', etiquetas: ['vip'] },
    { _id: id(13), empresa, nombre: 'Inactivo', activo: false, email: 'inactivo@example.test', telefono: '333', etiquetas: ['vip', 'inactivos'] },
    { _id: id(14), empresa, nombre: 'Inválido', activo: true, email: 'incorrecto', telefono: ' ', etiquetas: [] },
    { _id: id(15), empresa: otra, nombre: 'Ajeno', activo: true, email: 'ajeno@example.test', telefono: '444', etiquetas: ['vip', 'ajena'] }
  ];
  filtros = [];
  t.mock.method(Contacto.collection, 'find', filtro => {
    filtros.push(filtro);
    return { toArray: async () => contactos.filter(contacto => coincide(contacto, filtro)) };
  });
});
const campana = (destinatarios = { tipo: 'todos' }, canal = 'email') => ({ empresa, canal, destinatarios });

test('destinatarios: todos solo activos, email válido y misma empresa', async () => {
  const resultado = await service.resolverDestinatarios(campana());
  assert.deepEqual(resultado.map(contacto => contacto.id), [String(id(10)), String(id(11))]);
  assert.deepEqual(filtros[0], { empresa, activo: true, email: { $type: 'string' } });
  assert.ok(resultado.every(contacto => !Object.hasOwn(contacto, 'privado') && !Object.hasOwn(contacto, 'empresa')));
});
test('destinatarios: selección específica admite ObjectId del modelo y excluye inactivos/ajenos', async () => {
  const doc = Campana.hydrate({ empresa, canal: 'email', destinatarios: { tipo: 'contactos', contactos: [id(11), id(13), id(15)] } });
  const resultado = await service.resolverDestinatarios(doc);
  assert.deepEqual(resultado.map(contacto => contacto.id), [String(id(11))]);
  assert.equal(String(filtros[0].empresa), String(empresa));
});
test('destinatarios: etiquetas usan cualquiera y no duplican coincidencias múltiples', async () => {
  const resultado = await service.resolverDestinatarios(campana({ tipo: 'etiquetas', etiquetas: ['vip', 'ventas', 'vip'] }));
  assert.deepEqual(resultado.map(contacto => contacto.id), [String(id(10)), String(id(11))]);
  assert.deepEqual(filtros[0].etiquetas, { $in: ['vip', 'ventas'] });
});
test('destinatarios: elimina documentos repetidos por id', async () => {
  contactos.push(contactos[0]);
  const resultado = await service.resolverDestinatarios(campana({ tipo: 'contactos', contactos: [String(id(10)), String(id(10))] }));
  assert.equal(resultado.length, 1);
});
for (const canal of ['whatsapp', 'sms']) {
  test(`destinatarios: ${canal} excluye contactos sin teléfono, vacíos, inactivos y ajenos`, async () => {
    const resultado = await service.resolverDestinatarios(campana({ tipo: 'todos' }, canal));
    assert.deepEqual(resultado.map(contacto => contacto.id), [String(id(10)), String(id(12))]);
    assert.deepEqual(filtros[0].telefono, { $type: 'string' });
  });
}
test('destinatarios: campañas antiguas no consultan contactos ni hacen consultas globales', async () => {
  for (const doc of [{ canal: 'email' }, { empresa, canal: 'email' }, Campana.hydrate({ empresa, canal: 'email' })]) {
    assert.deepEqual(await service.resolverDestinatarios(doc), []);
    assert.equal((await service.resumenCampana(doc)).cantidad, null);
  }
  assert.equal(filtros.length, 0);
});
test('destinatarios: selección configurada sin empresa o con estructura inválida se rechaza sin consultar', async () => {
  for (const doc of [{ destinatarios: { tipo: 'todos' } }, { empresa: 'inválida', destinatarios: { tipo: 'todos' } },
    campana({ tipo: 'desconocido' }), campana({ tipo: 'contactos', contactos: [] }), campana({ tipo: 'etiquetas', etiquetas: [] })]) {
    await assert.rejects(service.resolverDestinatarios(doc), error => error.codigo === 'DESTINATARIOS_INVALIDOS');
  }
  assert.equal(filtros.length, 0);
});
test('destinatarios: valida pertenencia con consultas limitadas a empresa', async () => {
  const valido = { tipo: 'contactos', contactos: [String(id(10))] };
  assert.equal(await service.validarPertenencia(valido, empresa), '');
  assert.match(await service.validarPertenencia({ ...valido, contactos: [String(id(15))] }, empresa), /únicamente contactos/);
  assert.match(await service.validarPertenencia({ ...valido, contactos: [String(id(99))] }, empresa), /existentes/);
  assert.equal(await service.validarPertenencia({ tipo: 'etiquetas', etiquetas: ['ventas'] }, empresa), '');
  assert.match(await service.validarPertenencia({ tipo: 'etiquetas', etiquetas: ['ajena'] }, empresa), /únicamente etiquetas/);
  assert.ok(filtros.every(filtro => String(filtro.empresa) === String(empresa)));
});
test('destinatarios: opciones activas y etiquetas propias sin exponer empresa ajena', async () => {
  const opciones = await service.opcionesEmpresa(empresa);
  assert.deepEqual(opciones.contactos.map(contacto => contacto.nombre), ['Uno', 'Dos', 'Teléfono', 'Inválido']);
  assert.deepEqual(opciones.etiquetas, ['inactivos', 'ventas', 'vip']);
  assert.equal(String(filtros[0].empresa), String(empresa));
  assert.deepEqual(await service.opcionesEmpresa(null), { contactos: [], etiquetas: [] });
});
test('destinatarios: sin coincidencias devuelve lista vacía', async () => {
  assert.deepEqual(await service.resolverDestinatarios(campana({ tipo: 'etiquetas', etiquetas: ['ausente'] })), []);
});
test('destinatarios: resumen muestra contactos seleccionados propios y cuenta solo válidos', async () => {
  const resumen = await service.resumenCampana(campana({ tipo: 'contactos', contactos: [String(id(10)), String(id(12)), String(id(15))] }));
  assert.equal(resumen.cantidad, 1);
  assert.deepEqual(resumen.contactos, ['Uno', 'Teléfono']);
  assert.ok(!resumen.contactos.includes('Ajeno'));
});
test('destinatarios: formulario rechaza tipos/ids/listas inválidos y normaliza duplicados', () => {
  for (const entrada of [null, [], 'todos', {}, { tipo: 'constructor' }, { tipo: {} }, { tipo: 'contactos', contactos: { $ne: null } },
    { tipo: 'contactos', contactos: ['inválido'] }, { tipo: 'etiquetas', etiquetas: [{}] }, { tipo: 'etiquetas', etiquetas: [' '] }]) {
    assert.ok(service.validarSeleccion(entrada).error);
  }
  const resultado = service.validarSeleccion({ tipo: 'contactos', contactos: [String(id(10)).toUpperCase(), String(id(10))] });
  assert.equal(resultado.error, ''); assert.deepEqual(resultado.seleccion.contactos, [String(id(10))]);
  assert.deepEqual(service.validarSeleccion({ tipo: 'etiquetas', etiquetas: [' vip ', 'vip'] }).seleccion.etiquetas, ['vip']);
});
test('campana: modelo admite los tres modos y conserva documentos antiguos', async () => {
  const base = { nombre: 'Campaña', objetivo: 'Objetivo', empresa };
  for (const destinatarios of [{ tipo: 'todos' }, { tipo: 'contactos', contactos: [id(10)] }, { tipo: 'etiquetas', etiquetas: [' vip '] }]) {
    await new Campana({ ...base, destinatarios }).validate();
  }
  for (const destinatarios of [{ tipo: 'otro' }, { tipo: 'contactos', contactos: [] }, { tipo: 'contactos', contactos: ['inválido'] },
    { tipo: 'etiquetas', etiquetas: [] }, { tipo: 'etiquetas', etiquetas: [' '] }]) {
    await assert.rejects(new Campana({ ...base, destinatarios }).validate(), { name: 'ValidationError' });
  }
  const anterior = Campana.hydrate(base);
  assert.equal(anterior.destinatarios, undefined); await anterior.validate();
});
