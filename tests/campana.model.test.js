const { test } = require('node:test');
const assert = require('node:assert/strict');
const Campana = require('../models/Campana');

const base = { nombre: ' Campaña ', objetivo: ' Objetivo ' };

test('modelo: referencias opcionales a Empresa y Usuario', async () => {
  const mongoose = require('mongoose');
  for (const [campo, referencia] of [['empresa', 'Empresa'], ['creadoPor', 'Usuario']]) {
    assert.equal(Campana.schema.path(campo).options.ref, referencia);
    const id = new mongoose.Types.ObjectId();
    const campana = new Campana({ ...base, [campo]: id.toHexString() });
    await campana.validate();
    assert.ok(campana[campo].equals(id));
    await assert.rejects(new Campana({ ...base, [campo]: 'inválido' }).validate(), e => !!e.errors[campo]);
  }
});

test('modelo: campañas antiguas y nuevas sin relaciones siguen siendo válidas', async () => {
  for (const campana of [new Campana(base), Campana.hydrate({ ...base, estado: 'activa' })]) {
    await campana.validate();
    assert.equal(campana.empresa, undefined);
    assert.equal(campana.creadoPor, undefined);
  }
});

test('modelo: trim, estado predeterminado y campos opcionales', async () => {
  const documento = new Campana(base);
  await documento.validate();
  assert.equal(documento.nombre, 'Campaña');
  assert.equal(documento.objetivo, 'Objetivo');
  assert.equal(documento.estado, 'borrador');
  assert.equal(documento.canal, undefined);
  assert.equal(documento.fechaInicio, undefined);
  assert.equal(documento.fechaFin, undefined);
  assert.equal(Campana.schema.options.timestamps, true);
});

test('modelo: email permite borradores incompletos y documentos existentes sin contenido', async () => {
  for (const contenido of [{}, { asunto: 'Asunto' }, { cuerpoTexto: 'Texto' }, { asunto: '', cuerpoTexto: '' }]) {
    await new Campana({ ...base, canal: 'email', ...contenido }).validate();
  }
  const existente = Campana.hydrate({ ...base, canal: 'email', estado: 'activa' });
  await existente.validate();
  assert.equal(existente.asunto, undefined);
  assert.equal(existente.cuerpoTexto, undefined);
  const documento = new Campana({ ...base, asunto: ' Asunto ', cuerpoTexto: ' Hola\n\n  Adiós\n' });
  await documento.validate();
  assert.equal(documento.asunto, 'Asunto');
  assert.equal(documento.cuerpoTexto, ' Hola\n\n  Adiós\n');
});

test('modelo: nombre y objetivo son obligatorios incluso con espacios', async () => {
  for (const campo of ['nombre', 'objetivo']) {
    for (const valor of [undefined, '', '   ']) {
      await assert.rejects(new Campana({ ...base, [campo]: valor }).validate(), error => {
        assert.equal(error.errors[campo].kind, 'required');
        return true;
      });
    }
  }
});

test('modelo: enums de canal y estado', async () => {
  for (const canal of ['email', 'redes_sociales', 'sms', 'otro']) {
    await new Campana({ ...base, canal }).validate();
  }
  for (const estado of ['borrador', 'programada', 'activa', 'pausada', 'finalizada']) {
    await Campana.hydrate({ ...base, estado, fechaInicio: new Date('2026-09-21') }).validate();
  }
  for (const campo of ['canal', 'estado']) {
    await assert.rejects(new Campana({ ...base, [campo]: 'desconocido' }).validate(), error => error.errors[campo].kind === 'enum');
  }
});

test('modelo: un documento nuevo solo puede comenzar en borrador', async () => {
  for (const estado of ['programada', 'activa', 'pausada', 'finalizada', null, '']) {
    await assert.rejects(new Campana({ ...base, estado }).validate(), error => !!error.errors.estado);
  }
});

test('modelo: una campaña programada requiere y conserva fechaInicio', async () => {
  const documento = Campana.hydrate({ ...base, estado: 'programada' });
  await assert.rejects(documento.validate(), error => error.errors.fechaInicio.kind === 'required');
  documento.fechaInicio = new Date('2026-09-21');
  await documento.validate();
  documento.fechaInicio = undefined;
  await assert.rejects(documento.validate(), error => error.errors.fechaInicio.kind === 'required');
});

test('modelo: fechas opcionales, iguales, posteriores e inválidas', async () => {
  for (const fechas of [
    { fechaInicio: '2026-09-21' }, { fechaFin: '2026-09-21' },
    { fechaInicio: '2026-09-21', fechaFin: '2026-09-21' },
    { fechaInicio: '2026-09-21', fechaFin: '2026-09-22' }
  ]) await new Campana({ ...base, ...fechas }).validate();
  await assert.rejects(new Campana({ ...base, fechaInicio: '2026-09-22', fechaFin: '2026-09-21' }).validate(), error => !!error.errors.fechaFin);
  for (const campo of ['fechaInicio', 'fechaFin']) {
    await assert.rejects(new Campana({ ...base, [campo]: 'no-fecha' }).validate(), error => error.errors[campo].name === 'CastError');
  }
});
