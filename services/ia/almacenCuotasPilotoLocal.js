'use strict';
// Opt-in de desarrollo, conexión y base separadas; jamás sustituye producción.
const mongoose = require('mongoose');
const BASE = 'plurione_ai_quota_piloto_local';
const EMPRESA = '6ad574f460d35245e124c9ee';
const MARCA = 'cuotas-ia-nickki-v1';
const exigir = ok => { if (!ok) throw Error('CUOTAS_PILOTO_NO_AUTORIZADAS'); };
const configuracion = (env = process.env) => {
  exigir(env.NODE_ENV === 'development' && env.AI_QUOTA_BACKEND === 'piloto_local');
  let uri; try { uri = new URL(env.MONGODB_URI); } catch { exigir(false); }
  exigir(uri.protocol === 'mongodb:' && ['localhost:27018', '127.0.0.1:27018'].includes(uri.host)
    && uri.pathname === '/marketing_automation');
  return { uri: env.MONGODB_URI };
};
const identidad = async conexion => {
  exigir(conexion !== mongoose.connection && conexion.readyState === 1 && conexion.name === BASE);
  const h = await conexion.db.admin().command({ hello: 1 });
  exigir(h.setName === 'marketingDevRs' && h.isWritablePrimary === true
    && h.hosts?.length === 1 && h.hosts[0] === 'localhost:27018');
  const { parsed } = await conexion.db.admin().command({ getCmdLineOpts: 1 });
  require('../../scripts/mongoDevRsComun').validarOpciones(parsed);
};
const indices = async conexion => {
  const actuales = await conexion.db.collection('usoias').listIndexes().toArray();
  require('./almacenCuotasProtegido').validarIndices(actuales);
  exigir(actuales.every(i => !i.hidden && !i.collation));
};
const marcador = async conexion => {
  const m = await conexion.db.collection('control').findOne({ _id: MARCA });
  exigir(m?.empresa === EMPRESA && m.base === BASE && m.proposito === 'piloto-local-gemini');
};
let pendiente;
const cerrar = async () => { const p = pendiente; pendiente = undefined; if (p) await p.then(c => c.close()).catch(() => {}); };
const conectar = async () => {
  const config = configuracion();
  const c = mongoose.createConnection(config.uri, { dbName: BASE, replicaSet: 'marketingDevRs',
    autoCreate: false, autoIndex: false, bufferCommands: false, serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000, socketTimeoutMS: 10000, writeConcern: { w: 'majority' } });
  try { await c.asPromise(); await identidad(c); return c; }
  catch (e) { await c.close(); throw e; }
};
const obtener = async empresa => {
  configuracion(); exigir(empresa === EMPRESA);
  if (!pendiente) pendiente = conectar();
  try {
    const c = await pendiente;
    await identidad(c); await marcador(c); await indices(c);
    return c.models.UsoIAPiloto || c.model('UsoIAPiloto', require('../../models/UsoIA').schema.clone(), 'usoias');
  } catch (e) { await cerrar(); throw e; }
};
const preparar = async () => {
  const c = await conectar();
  try {
    const colecciones = await c.db.listCollections({}, { nameOnly: true }).toArray();
    exigir(colecciones.every(x => ['control', 'usoias'].includes(x.name)));
    const existe = await c.db.collection('control').findOne({ _id: MARCA });
    if (colecciones.length) await marcador(c);
    if (!existe) {
      exigir(colecciones.length === 0);
      await c.db.createCollection('control');
      await c.db.collection('control').insertOne({ _id: MARCA, empresa: EMPRESA, base: BASE,
        proposito: 'piloto-local-gemini', creadoEn: new Date() }, { writeConcern: { w: 'majority' } });
    }
    // Preflight completo: no intentar reparar índices incompatibles ni eliminar datos.
    let actuales = [];
    try { actuales = await c.db.collection('usoias').listIndexes().toArray(); } catch (e) { if (e.code !== 26) throw e; }
    const plan = require('../../models/UsoIA').schema.indexes();
    for (const [key, opts] of plan) {
      const nombre = Object.entries(key).map(([k, v]) => `${k}_${v}`).join('_');
      for (const i of actuales.filter(i => i.name === nombre || JSON.stringify(i.key) === JSON.stringify(key))) {
        exigir(JSON.stringify(i.key) === JSON.stringify(key) && !!i.unique === !!opts.unique
          && i.expireAfterSeconds === opts.expireAfterSeconds && !i.sparse && !i.partialFilterExpression && !i.hidden && !i.collation);
      }
    }
    if (!actuales.length) await c.db.createCollection('usoias');
    for (const [key, options] of plan) await c.db.collection('usoias').createIndex(key, { ...options, writeConcern: { w: 'majority' } });
    await indices(c);
    return { base: BASE, indicesVerificados: true, empresa: EMPRESA, datosEliminados: false };
  } finally { await c.close(); }
};
module.exports = { BASE, EMPRESA, configuracion, identidad, obtener, cerrar, preparar };
