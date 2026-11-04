const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoPiloto } = require('../scripts/iniciarDevPiloto');
const limites = require('../services/ia/limitesIA');
const piloto = require('../services/ia/almacenCuotasPilotoLocal');

test('launcher piloto: selecciona el almacén explícito sin mutar el entorno recibido', () => {
  const env = Object.freeze({ PORT: '3000', SESSION_SECRET: 'solo-prueba-no-es-credencial' });
  const child = crearEntornoPiloto(env);
  assert.equal(child.NODE_ENV, 'development');
  assert.equal(child.AI_QUOTA_BACKEND, 'piloto_local');
  assert.equal(child.PORT, env.PORT);
  assert.equal(child.SESSION_SECRET, env.SESSION_SECRET);
  assert.equal(env.AI_QUOTA_BACKEND, undefined);
  assert.equal(limites.seleccionarAlmacen(child), piloto);
});

test('launcher piloto: rechaza producción/test y backends explícitos incompatibles', () => {
  for (const NODE_ENV of ['production', 'test', '']) assert.throws(() => crearEntornoPiloto({ NODE_ENV }), /PILOTO_REQUIERE_DEVELOPMENT/);
  for (const AI_QUOTA_BACKEND of ['protected', 'dev_fixture', '', 'desconocido']) {
    assert.throws(() => crearEntornoPiloto({ NODE_ENV: 'development', AI_QUOTA_BACKEND }), /PILOTO_BACKEND_EN_CONFLICTO/);
  }
  assert.equal(crearEntornoPiloto({ NODE_ENV: 'development', AI_QUOTA_BACKEND: 'piloto_local' }).AI_QUOTA_BACKEND, 'piloto_local');
});

test('launcher piloto: conserva validación del destino y el comportamiento genérico de dev', () => {
  const env = crearEntornoPiloto({ MONGODB_URI: 'mongodb://localhost:27017/marketing_automation' });
  assert.throws(() => piloto.configuracion(env), /CUOTAS_PILOTO_NO_AUTORIZADAS/);
  const scripts = require('../package.json').scripts;
  assert.equal(scripts.dev, 'nodemon server.js');
  assert.equal(scripts['dev:piloto'], 'node scripts/iniciarDevPiloto.js');
  assert.equal(limites.seleccionarAlmacen({ NODE_ENV: 'development' }), require('../services/ia/almacenCuotasDev'));
});
