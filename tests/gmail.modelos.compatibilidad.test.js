const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const id = () => new mongoose.Types.ObjectId();

test('cola Gmail: documentos nuevos e históricos hidratan sin asignar defaults inmutables a históricos', async () => {
  const Envio = require('../models/EnvioGmail'), Ejecucion = require('../models/EjecucionGmail');
  const datos = { empresa: id(), ejecucion: id(), contacto: id(), emailHash: 'a'.repeat(64), estado: 'pendiente', mensajeId: 'prueba@example.test' };
  const ejecucion = { empresa: id(), campana: id(), actor: id(), claveHash: 'a'.repeat(64), contenidoHash: 'b'.repeat(64), googleSub: 'prueba', remitente: 'prueba@example.test', total: 1 };
  for (const [Modelo, valores] of [[Envio, datos], [Ejecucion, ejecucion]]) {
    const nueva = new Modelo(valores); await nueva.validate(); assert.equal(nueva.modoMotor, 'piloto');
    const persistida = nueva.toObject(); await Modelo.hydrate(persistida).validate();
    delete persistida.modoMotor;
    const antigua = Modelo.hydrate(persistida); await antigua.validate(); assert.equal(antigua.modoMotor, undefined);
    const automatica = Modelo.hydrate({ ...persistida, modoMotor: 'automatico' }); await automatica.validate();
    automatica.modoMotor = 'piloto'; await assert.rejects(automatica.validate());
  }
});
