const { test } = require('node:test');
const assert = require('node:assert/strict');
test('consulta de cola: solo lectura, proyeccion cerrada y ningun dato de destinatario', async t => {
  const cli = require('../scripts/verificacionLocal');
  const env = { MONGODB_URI: cli.URI, TRANSACTIONAL_EMAIL_ENABLED: 'false', GMAIL_CAMPAIGNS_ENABLED: 'false', AI_ENABLED: 'false' };
  const anterior = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));Object.assign(process.env, env);
  t.after(() => { for (const [k,v] of Object.entries(anterior)) { if (v === undefined) delete process.env[k];else process.env[k] = v; } });
  t.mock.method(require('../services/httpsPilotoLocalService'), 'configuracion', () => ({}));
  t.mock.method(require('../services/httpsPilotoLocalService'), 'comprobarOrigen', async () => ({}));
  t.mock.method(require('../config/manifiestoPiloto'), 'cargarManifiesto', () => ({ base: 'fixture' }));
  const infra = require('../services/infraestructuraPilotoService');
  t.mock.method(infra, 'validarDestinoPiloto', async () => {});
  t.mock.method(infra, 'revisarIndices', async () => ({ completos: true }));
  let cerrada = false;
  t.mock.method(require('mongoose'), 'createConnection', () => ({ asPromise: async () => ({
    close: async () => { cerrada = true; }, db: { collection: nombre => {
      assert.equal(nombre, 'solicitudregistros');return { find: (filtro, opciones) => {
        assert.deepEqual(filtro, {});
        assert.deepEqual(opciones.projection, { _id: 1, estado: 1, correoEstado: 1, versionEnvio: 1 });
        return { toArray: async () => [
          { _id: 'id-1', estado: 'pendiente_correo', correoEstado: 'pendiente_configuracion', versionEnvio: 0, correo: 'privado@example.test', tokenHash: 'privado' },
          { _id: 'id-2', estado: 'pendiente_correo', correoEstado: 'incierta', versionEnvio: 1 },
          { _id: 'id-3', estado: 'completada', correoEstado: 'cancelada', versionEnvio: 1 }
        ] };
      } };
    } }
  }) }));
  const supervisor = t.mock.method(require('../services/supervisorTrabajadorGmailService'), 'crearSupervisor', () => { throw Error('ENVIO_PROHIBIDO'); });
  const r = await cli.principal(['--cola']);
  assert.equal(r.elegibles, 1);assert.equal(r.inciertas, 1);assert.equal(r.procesando, 0);
  assert.equal(r.envioHabilitado, false);assert.equal(cerrada, true);
  assert.ok(!JSON.stringify(r).includes('privado'));assert.equal(supervisor.mock.callCount(), 0);
});
