const { validarTopologia } = require('./registroEmpresarialService');
const { obtenerPolitica } = require('../config/enviosGmail');
const { COLECCION } = require('./mongoSessionStore');
const MODELOS = Object.freeze(['Empresa', 'Usuario', 'Contacto', 'Campana', 'ConexionGmail', 'EstadoOAuth',
  'EjecucionGmail', 'EnvioGmail', 'ControlEnvioGmail', 'AutorizacionPilotoGmail', 'SolicitudRegistro', 'LimiteRegistro', 'AuditoriaRegistro', 'TareaCorreo', 'VerificacionCorreo']);
const exigir = (ok, codigo) => { if (!ok) throw Error(codigo); };
const asegurarEnvioApagado = () => exigir(!obtenerPolitica().habilitado
  && process.env.GMAIL_CAMPAIGNS_ENABLED !== 'true', 'PREPARACION_REQUIERE_ENVIO_APAGADO');
const modelos = conexion => Object.fromEntries(MODELOS.map(n => {
  if (conexion.models[n]) return [n, conexion.models[n]];
  // require registra el modelo en la conexion global. Comprobar de nuevo antes
  // de clonar: registrar otro schema en esa misma conexion produce OverwriteModelError.
  const original = require(`../models/${n}`);
  return [n, conexion.models[n] || conexion.model(n,
    original.schema.clone().set('autoIndex', false).set('autoCreate', false))];
}));
const planIndices = conexion => {
  const m = modelos(conexion);
  return [...MODELOS.map(n => ({ modelo: n, coleccion: m[n].collection.name,
    indices: m[n].schema.indexes().map(([key, options]) => ({ key, options })) })),
  { modelo: 'Sesiones', coleccion: COLECCION, indices: [{ key: { expiraEn: 1 }, options: { expireAfterSeconds: 0 } }] }];
};
const mismos = (actual, requerido) => JSON.stringify(actual.key) === JSON.stringify(requerido.key)
  && !!actual.unique === !!requerido.options.unique && !actual.sparse
  && JSON.stringify(actual.partialFilterExpression) === JSON.stringify(requerido.options.partialFilterExpression)
  && actual.expireAfterSeconds === requerido.options.expireAfterSeconds;
const revisarIndices = async conexion => {
  await validarTopologia(conexion);
  const faltantes = [];
  for (const p of planIndices(conexion)) {
    let actuales;
    try { actuales = await conexion.db.collection(p.coleccion).listIndexes().toArray(); }
    catch (e) { if (e.code !== 26) throw Error('NO_SE_PUDIERON_COMPROBAR_INDICES'); actuales = []; }
    if (!actuales.length) faltantes.push({ modelo: p.modelo, requisito: 'coleccion' });
    for (const i of p.indices) if (!actuales.some(a => mismos(a, i))) faltantes.push({ modelo: p.modelo, requisito: 'indice', campos: Object.keys(i.key) });
  }
  return { completos: faltantes.length === 0, faltantes };
};
const validarManifiesto = datos => {
  const campos = ['aprobado', 'base', 'replicaSet', 'miembros', 'trustProxy', 'host', 'puerto'];
  exigir(datos && Object.keys(datos).every(k => campos.includes(k)) && datos.aprobado === true, 'MANIFIESTO_NO_APROBADO');
  exigir(typeof datos.base === 'string' && /^[A-Za-z0-9_-]{1,63}$/.test(datos.base)
    && !['admin', 'config', 'local', 'marketing_automation'].includes(datos.base) && !datos.base.startsWith('ma_tx_test_'), 'BASE_PILOTO_NO_PERMITIDA');
  exigir(typeof datos.replicaSet === 'string' && !!datos.replicaSet && datos.replicaSet !== 'marketingDevRs', 'REPLICA_SET_DE_PRUEBAS_NO_ES_PILOTO');
  exigir(Array.isArray(datos.miembros) && datos.miembros.length > 0 && datos.miembros.every(m => typeof m === 'string'
    && /^[A-Za-z0-9.-]+:\d{1,5}$/.test(m) && Number(m.split(':')[1]) > 0 && Number(m.split(':')[1]) <= 65535
    && !/^(localhost|127\.0\.0\.1):2701[78]$/i.test(m))
    && new Set(datos.miembros).size === datos.miembros.length, 'MIEMBROS_NO_APROBADOS');
  exigir(datos.host === '127.0.0.1' && Number.isInteger(datos.puerto) && datos.puerto >= 1024 && datos.puerto <= 65535, 'ESCUCHA_NO_APROBADA');
  // Reutilizar la validación exacta de proxy sin crear aplicación ni servidor.
  exigir(Array.isArray(datos.trustProxy), 'PROXY_DEBE_SER_EXPLICITO');
  require('../config/session').configurarProxy({ set: () => {} }, { trustProxy: datos.trustProxy });
  return datos;
};
const validarDestinoPiloto = async (conexion, manifiesto) => {
  validarManifiesto(manifiesto); await validarTopologia(conexion);
  const h = await conexion.db.admin().command({ hello: 1 });
  exigir(conexion.name === manifiesto.base && h.setName === manifiesto.replicaSet && h.setName !== 'marketingDevRs'
    && Array.isArray(h.hosts) && h.hosts.length === manifiesto.miembros.length
    && h.hosts.every(m => manifiesto.miembros.includes(m)), 'DESTINO_PILOTO_NO_COINCIDE');
};
// Única función DDL de esta fase: exclusivamente una fixture vacía, propia, en 27018.
const provisionarPruebas = async ({ conexion, marca }) => {
  asegurarEnvioApagado();
  const rs = require('../scripts/mongoDevRsComun');
  const c = await rs.conectar(); try { await rs.verificar(c); await rs.compararOriginal(); } finally { await c.close(); }
  const h = await conexion.db.admin().command({ hello: 1 });
  const { parsed } = await conexion.db.admin().command({ getCmdLineOpts: 1 }); rs.validarOpciones(parsed);
  exigir(h.setName === rs.SET && h.isWritablePrimary === true && /^ma_tx_test_[a-f0-9]{32}$/.test(conexion.name), 'DESTINO_NO_ES_FIXTURE');
  exigir(typeof marca === 'string' && /^[a-f0-9-]{36}$/.test(marca)
    && (await conexion.db.collection('control').findOne({ _id: 'fixture' }))?.marca === marca, 'FIXTURE_NO_PROPIA');
  const plan = planIndices(conexion);
  const colecciones = await conexion.db.listCollections({}, { nameOnly: true }).toArray();
  exigir(colecciones.every(c => c.name === 'control' || plan.some(p => p.coleccion === c.name)), 'FIXTURE_COLECCION_DESCONOCIDA');
  for (const p of plan) exigir(await conexion.db.collection(p.coleccion).countDocuments({}) === 0, 'FIXTURE_CONTIENE_DATOS');
  for (const p of plan) {
    const existe = await conexion.db.listCollections({ name: p.coleccion }, { nameOnly: true }).hasNext();
    if (!existe) await conexion.db.createCollection(p.coleccion);
    for (const i of p.indices) await conexion.db.collection(p.coleccion).createIndex(i.key, i.options);
  }
  return revisarIndices(conexion);
};
module.exports = { MODELOS, modelos, planIndices, revisarIndices, validarManifiesto, validarDestinoPiloto, provisionarPruebas, asegurarEnvioApagado };
