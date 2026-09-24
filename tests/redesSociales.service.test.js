const { test } = require('node:test');
const assert = require('node:assert/strict');
const redes = require('../services/redesSocialesService');
const email = require('../services/emailService');
const automatizacion = require('../services/automatizacionService');

test('redes: mismo texto para Facebook y LinkedIn, resultados independientes bloqueados y ninguna petición', async t => {
  const fetch = t.mock.method(global, 'fetch', () => { throw new Error('Acceso externo prohibido'); });
  const correo = t.mock.method(email, 'ejecutarCampana', () => { throw new Error('Email prohibido'); });
  const campana = { _id: 'campana-1', canal: 'redes_sociales', publicacion: ' Hola\nFacebook y LinkedIn ', asunto: 'No usar', cuerpoTexto: 'No usar' };
  assert.deepEqual(redes.prepararPublicacion(campana), {
    campanaId: 'campana-1', texto: campana.publicacion,
    destinos: [{ red: 'facebook', cuentaId: null }, { red: 'linkedin', cuentaId: null }]
  });
  for (const ejecutar of [redes.ejecutarCampana, automatizacion.ejecutarCampana]) {
    await assert.rejects(ejecutar(campana), error => {
      assert.equal(error.codigo, 'CUENTAS_REDES_NO_CONECTADAS');
      assert.deepEqual(error.resultados, ['facebook', 'linkedin'].map(red => ({
        campanaId: 'campana-1', red, cuentaId: null, estado: 'bloqueada', publicacionId: null, codigo: 'CUENTA_NO_CONECTADA'
      })));
      assert.notEqual(error.resultados[0], error.resultados[1]);
      return true;
    });
  }
  await assert.rejects(redes.ejecutarCampana({ ...campana, canal: 'email' }), { codigo: 'CANAL_NO_DISPONIBLE' });
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(correo.mock.callCount(), 0);
});
