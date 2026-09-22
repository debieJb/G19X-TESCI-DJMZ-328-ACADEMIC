const { test } = require('node:test');
const assert = require('node:assert/strict');
const Campana = require('../models/Campana');

const base = { nombre: ' Campaña ', objetivo: ' Objetivo ' };

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
    await new Campana({ ...base, estado }).validate();
  }
  for (const campo of ['canal', 'estado']) {
    await assert.rejects(new Campana({ ...base, [campo]: 'desconocido' }).validate(), error => error.errors[campo].kind === 'enum');
  }
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
