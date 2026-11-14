'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const Contacto = require('../models/Contacto');
const EventoMarketing = require('../models/EventoMarketing');
const { calcularPuntuacion, obtenerPuntuacion } = require('../services/leadScoringService');
const ahora = new Date('2026-11-13T12:00:00Z');
const empresa = '507f1f77bcf86cd799439011';
const contacto = '507f1f77bcf86cd799439012';
const evento = (tipo, referenciaExterna, dias = 1) => ({ tipo, referenciaExterna,
  origen: 'integracion_verificada', verificado: true, evidencia: 'Documento comprobado', registradoPor: empresa, ocurridoEn: new Date(+ahora - dias * 86400000) });

test('puntúa eventos únicos verificados y limita el máximo a 100', () => {
  const eventos = [evento('formulario_enviado', 'a'), evento('solicitud_contacto', 'b'),
    evento('conversion_confirmada', 'c'), evento('conversion_confirmada', 'd')];
  assert.deepEqual(calcularPuntuacion(eventos, ahora), {
    puntos: 100, nivel: 'alto', eventosContabilizados: 4, ventanaDias: 90,
    metodo: 'reglas_v1', esPrediccionConversion: false
  });
});
test('excluye eventos viejos, futuros, desconocidos y duplicados', () => {
  const eventos = [evento('clic_verificado', 'a'), evento('clic_verificado', 'a'),
    evento('conversion_confirmada', 'viejo', 91), evento('solicitud_contacto', 'futuro', -1),
    evento('apertura', 'sin-medicion'), { ...evento('conversion_confirmada', 'sinf'), origen: 'desconocido' }];
  assert.equal(calcularPuntuacion(eventos, ahora).puntos, 5);
});
test('verifica pertenencia empresarial antes de consultar eventos', async t => {
  const existe = t.mock.method(Contacto, 'exists', async filtro => {
    assert.deepEqual(filtro, { _id: contacto, empresa }); return null;
  });
  const buscar = t.mock.method(EventoMarketing, 'find', () => { throw Error('No debe buscar eventos'); });
  await assert.rejects(obtenerPuntuacion({ empresaId: empresa, contactoId: contacto, ahora }), { status: 404 });
  assert.equal(existe.mock.callCount(), 1);
  assert.equal(buscar.mock.callCount(), 0);
});
test('consulta solo eventos del contacto y su empresa', async t => {
  t.mock.method(Contacto, 'exists', async () => ({ _id: contacto }));
  const buscar = t.mock.method(EventoMarketing, 'find', filtro => {
    assert.equal(filtro.empresa, empresa);
    assert.equal(filtro.contacto, contacto);
    return { select: () => ({ lean: async () => [evento('formulario_enviado', 'a')] }) };
  });
  const resultado = await obtenerPuntuacion({ empresaId: empresa, contactoId: contacto, ahora });
  assert.equal(resultado.puntos, 15);
  assert.equal(resultado.nivel, 'bajo');
  assert.equal(buscar.mock.callCount(), 1);
});
test('rechaza IDs malformados antes de acceder a MongoDB', async () => {
  await assert.rejects(obtenerPuntuacion({ empresaId: 'bad', contactoId: contacto }), { status: 400 });
});

for (const [tipo, puntos] of Object.entries(require('../services/leadScoringService').PUNTOS)) {
  test(`regla individual reproducible: ${tipo} suma ${puntos}`, () => {
    assert.equal(calcularPuntuacion([evento(tipo,'individual')], ahora).puntos,puntos);
  });
}
test('sin historial, umbrales de prioridad y exclusión estricta de evidencia no verificada', () => {
  assert.equal(calcularPuntuacion([],ahora).puntos,0);
  assert.equal(calcularPuntuacion([],ahora).nivel,'bajo');
  assert.equal(calcularPuntuacion([evento('solicitud_contacto','1'),evento('clic_verificado','2')],ahora).nivel,'medio');
  assert.equal(calcularPuntuacion([evento('conversion_confirmada','1'),evento('solicitud_contacto','2'),evento('clic_verificado','3')],ahora).nivel,'alto');
  for (const cambio of [{ verificado: false }, { verificado: undefined }, { evidencia: undefined }, { evidencia: '        ' },
    { registradoPor: null }, { ocurridoEn: null }, { ocurridoEn: 'invalida' }, { referenciaExterna: {} }]) {
    assert.equal(calcularPuntuacion([{ ...evento('conversion_confirmada','x'), ...cambio }],ahora).puntos,0);
  }
  assert.equal(calcularPuntuacion([evento('clic_verificado','limite',90)],ahora).puntos,5);
});
test('historial empresarial ordenado, desglose, ventana y última fecha preservan eventos históricos', async t => {
  const lista = [evento('conversion_confirmada','reciente',1), evento('solicitud_contacto','anterior',2), evento('clic_verificado','viejo',91)];
  t.mock.method(EventoMarketing,'find', filtro => {
    assert.deepEqual(filtro,{ empresa, contacto, verificado:true });
    return { sort: orden => {
      assert.deepEqual(orden,{ ocurridoEn:-1,_id:-1 }); return { lean: async () => lista };
    } };
  });
  const resultado = await require('../services/leadScoringService').historial({ _id: contacto, empresa },ahora);
  assert.equal(resultado.puntos,65); assert.equal(resultado.eventos.length,3);
  assert.deepEqual(resultado.ultimaInteraccion,lista[0].ocurridoEn);
  assert.equal(resultado.desglose.find(e => e.tipo === 'clic_verificado').cantidad,0);
  assert.equal(resultado.desglose.find(e => e.tipo === 'conversion_confirmada').cantidad,1);
});
test('modelo exige tipos, fechas, evidencia y actor; índices incluyen empresa', async () => {
  const base = { empresa, contacto, ...evento('clic_verificado','folio') };
  await new EventoMarketing(base).validate();
  for (const cambio of [{ tipo:'apertura' },{ ocurridoEn: new Date(Date.now()+86400000) },{ evidencia:undefined },{ registradoPor:undefined },{ empresa:undefined }]) {
    await assert.rejects(new EventoMarketing({ ...base,...cambio }).validate(),{ name:'ValidationError' });
  }
  const indices = EventoMarketing.schema.indexes();
  assert.ok(indices.some(([campos,opciones]) => campos.empresa && campos.referenciaExterna && opciones.unique));
  assert.ok(indices.some(([campos]) => campos.empresa && campos.contacto && campos.ocurridoEn));
});

test('deduplicación reproducible aunque el historial de entrada cambie de orden', () => {
  const anteriores = evento('clic_verificado','mismo',2);
  const recientes = evento('solicitud_contacto','mismo',1);
  assert.equal(calcularPuntuacion([anteriores,recientes],ahora).puntos,25);
  assert.deepEqual(calcularPuntuacion([anteriores,recientes],ahora),calcularPuntuacion([recientes,anteriores],ahora));
  assert.equal(calcularPuntuacion([{ ...recientes, registradoPor: [empresa] }],ahora).puntos,0);
});
