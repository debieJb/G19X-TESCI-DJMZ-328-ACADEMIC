const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const almacen = require('../services/ia/almacenCuotasPilotoLocal');
const limites = require('../services/ia/limitesIA');
const config = () => ({ NODE_ENV: 'development', AI_QUOTA_BACKEND: 'piloto_local', MONGODB_URI: 'mongodb://127.0.0.1:27018/marketing_automation' });
test('cuotas piloto: opt-in exacto, desarrollo y destino fijo; nunca producción ni fixture', () => {
  assert.equal(almacen.configuracion(config()).uri, config().MONGODB_URI);
  assert.equal(limites.seleccionarAlmacen(config()), almacen);
  for (const cambio of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { AI_QUOTA_BACKEND: undefined },
    { MONGODB_URI: 'mongodb://127.0.0.1:27017/marketing_automation' }, { MONGODB_URI: 'mongodb://remoto:27018/marketing_automation' },
    { MONGODB_URI: 'mongodb://localhost:27018/otra' }, { MONGODB_URI: 'mongodb+srv://localhost/marketing_automation' }]) {
    assert.throws(() => almacen.configuracion({ ...config(), ...cambio }));
  }
  assert.throws(() => limites.seleccionarAlmacen({ NODE_ENV: 'production', AI_QUOTA_BACKEND: 'piloto_local' }));
});
const fixture = t => {
  const env = config();
  for (const [k, valor] of Object.entries(env)) {
    const anterior = process.env[k]; process.env[k] = valor;
    t.after(() => { if (anterior === undefined) delete process.env[k]; else process.env[k] = anterior; });
  }
  const indices = [{ name: '_id_', key: { _id: 1 } }, { name: 'empresa_1_ventana_1', key: { empresa: 1, ventana: 1 }, unique: true },
    { name: 'expiraEn_1', key: { expiraEn: 1 }, expireAfterSeconds: 0 }];
  const cantidades = new Map(), llamadas = [], colecciones = ['control', 'usoias'];
  let marca = { empresa: almacen.EMPRESA, base: almacen.BASE, proposito: 'piloto-local-gemini' };
  const Uso = { findOneAndUpdate: async (f, u) => {
    const n = cantidades.get(f.ventana) || 0;
    if (n >= f.cantidad.$lt) throw { code: 11000 };
    cantidades.set(f.ventana, n + u.$inc.cantidad);
  } };
  const c = { readyState: 1, name: almacen.BASE, models: {}, close: async () => {}, asPromise: async () => c,
    model: (nombre, schema, coleccion) => { assert.equal(coleccion, 'usoias'); assert.equal(schema.options.autoIndex, false); c.models[nombre] = Uso; return Uso; },
    db: {
      admin: () => ({ command: async cmd => cmd.hello ? { setName: 'marketingDevRs', isWritablePrimary: true, hosts: ['localhost:27018'] } : { parsed: {} } }),
      listCollections: () => ({ toArray: async () => colecciones.map(name => ({ name })) }),
      createCollection: async nombre => { llamadas.push('crear:' + nombre); colecciones.push(nombre); },
      collection: nombre => ({ findOne: async () => marca, insertOne: async doc => { marca = doc; },
        listIndexes: () => ({ toArray: async () => indices }), createIndex: async () => llamadas.push('indice') })
    }
  };
  const conexion = t.mock.method(mongoose, 'createConnection', () => c);
  t.mock.method(require('../scripts/mongoDevRsComun'), 'validarOpciones', () => {});
  t.after(() => almacen.cerrar());
  return { c, indices, cantidades, llamadas, conexion, quitarMarca: () => { marca = null; } };
};
test('cuotas piloto: otra empresa se rechaza antes de conectar', async t => {
  const f = fixture(t);
  await assert.rejects(almacen.obtener('507f1f77bcf86cd799439011'));
  assert.equal(f.conexion.mock.callCount(), 0);
});
test('cuotas piloto: runtime separado sin DDL conserva tres por minuto y veinte por día', async t => {
  const f = fixture(t), ahora = Date.UTC(2026, 9, 18);
  for (let i = 0; i < 3; i++) await limites.consumir(almacen.EMPRESA, ahora);
  await assert.rejects(limites.consumir(almacen.EMPRESA, ahora), { codigo: 'LIMITE' });
  for (let i = 1; i <= 17; i++) await limites.consumir(almacen.EMPRESA, ahora + i * 60000);
  await assert.rejects(limites.consumir(almacen.EMPRESA, ahora + 18 * 60000), { codigo: 'LIMITE' });
  assert.deepEqual(f.llamadas, []);
  assert.equal(f.conexion.mock.calls[0].arguments[1].dbName, almacen.BASE);
  assert.equal(f.conexion.mock.calls[0].arguments[1].autoCreate, false);
});
test('cuotas piloto: marcador ajeno, índice ausente o topología incorrecta fallan cerrado', async t => {
  const f = fixture(t); f.indices.pop();
  await assert.rejects(almacen.obtener(almacen.EMPRESA));
  f.quitarMarca(); await assert.rejects(almacen.obtener(almacen.EMPRESA));
  f.c.name = 'marketing_automation'; await assert.rejects(almacen.obtener(almacen.EMPRESA));
  assert.deepEqual(f.llamadas, []);
});
test('cuotas piloto: preparación incompatible no borra ni repara índices', async t => {
  const f = fixture(t); f.indices[1].unique = false;
  await assert.rejects(almacen.preparar());
  assert.deepEqual(f.llamadas, []);
});
