const mongoose = require('mongoose');
const { randomUUID, randomBytes } = require('node:crypto');
const rs = require('../../scripts/mongoDevRsComun');
const { crearModelo } = require('../../models/UsoIA');
const BASE = /^ma_ia_test_[a-f0-9]{32}$/;
const MARCA = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const EMPRESA = /^f17e1a[a-f0-9]{18}$/;
const CONTROL = 'cuotas-ia-fixture-v1';
const exigir = condicion => { if (!condicion) throw new Error('CUOTAS_DEV_NO_AUTORIZADAS'); };
const configuracion = (env = process.env) => {
  exigir(['development', 'test'].includes(env.NODE_ENV));
  exigir(typeof env.AI_QUOTA_DEV_DB === 'string' && typeof env.AI_QUOTA_DEV_MARKER === 'string'
    && BASE.test(env.AI_QUOTA_DEV_DB) && MARCA.test(env.AI_QUOTA_DEV_MARKER));
  return { base: env.AI_QUOTA_DEV_DB, marca: env.AI_QUOTA_DEV_MARKER };
};
const identidad = async conexion => {
  exigir(conexion !== mongoose.connection && conexion.readyState === 1 && BASE.test(conexion.name));
  const opciones = conexion.getClient().options;
  exigir(opciones.hosts.length === 1 && opciones.hosts[0].host === '127.0.0.1'
    && opciones.hosts[0].port === 27018 && opciones.replicaSet === rs.SET);
  rs.rutasSeguras();
  const { parsed } = await conexion.db.admin().command({ getCmdLineOpts: 1 });
  rs.validarOpciones(parsed);
  await rs.verificar(conexion.getClient());
};
const conectar = async config => {
  exigir(['development', 'test'].includes(process.env.NODE_ENV));
  exigir(BASE.test(config.base) && MARCA.test(config.marca));
  const conexion = mongoose.createConnection(rs.URI, { dbName: config.base, replicaSet: rs.SET,
    autoCreate: false, autoIndex: false, bufferCommands: false,
    serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000, socketTimeoutMS: 10000 });
  try { await conexion.asPromise(); await identidad(conexion); return conexion; }
  catch (error) { await conexion.close().catch(() => {}); throw error; }
};
const marcador = async (conexion, config) => {
  exigir(conexion.name === config.base);
  const doc = await conexion.db.collection('control').findOne({ _id: CONTROL });
  exigir(doc && doc.marca === config.marca && doc.base === config.base && doc.version === 1
    && doc.proposito === 'cuotas-ia-solo-fixtures' && Array.isArray(doc.empresas) && doc.empresas.length === 2
    && new Set(doc.empresas).size === 2 && doc.empresas.every(e => typeof e === 'string' && EMPRESA.test(e)));
  return doc;
};
const validarIndices = indices => {
  exigir(indices.length === 3);
  const unico = indices.find(i => i.name === 'empresa_1_ventana_1');
  const ttl = indices.find(i => i.name === 'expiraEn_1');
  exigir(unico?.unique === true && JSON.stringify(unico.key) === JSON.stringify({ empresa: 1, ventana: 1 })
    && !unico.sparse && !unico.partialFilterExpression && unico.expireAfterSeconds === undefined);
  exigir(ttl && JSON.stringify(ttl.key) === JSON.stringify({ expiraEn: 1 }) && ttl.expireAfterSeconds === 0
    && !ttl.unique && !ttl.sparse && !ttl.partialFilterExpression);
  exigir(indices.some(i => i.name === '_id_' && JSON.stringify(i.key) === JSON.stringify({ _id: 1 })));
};
let pendiente, claveActual;
const cerrar = async () => {
  const actual = pendiente; pendiente = undefined; claveActual = undefined;
  if (actual) { const almacen = await actual.catch(() => null); if (almacen) await almacen.conexion.close(); }
};
const abrir = async () => {
  const config = configuracion();
  const clave = JSON.stringify(config);
  if (pendiente && claveActual !== clave) throw new Error('CUOTAS_CONFIGURACION_CAMBIADA');
  if (!pendiente) {
    claveActual = clave;
    pendiente = (async () => {
      const conexion = await conectar(config);
      try { await marcador(conexion, config); return { conexion, config, Uso: crearModelo(conexion) }; }
      catch (error) { await conexion.close(); throw error; }
    })();
  }
  const almacen = await pendiente;
  await identidad(almacen.conexion);
  return almacen;
};
const obtener = async empresa => {
  exigir(typeof empresa === 'string' && EMPRESA.test(empresa));
  const { conexion, config, Uso } = await abrir();
  const control = await marcador(conexion, config);
  exigir(control.empresas.includes(empresa));
  validarIndices(await Uso.collection.listIndexes().toArray());
  return Uso;
};
const aprovisionar = async () => {
  exigir(['development', 'test'].includes(process.env.NODE_ENV));
  const config = { base: 'ma_ia_test_' + randomUUID().replaceAll('-', ''), marca: randomUUID() };
  await rs.compararOriginal();
  const conexion = await conectar(config);
  try {
    const existentes = await conexion.db.admin().command({ listDatabases: 1, nameOnly: true, filter: { name: config.base } });
    exigir(existentes.databases.length === 0);
    exigir((await conexion.db.listCollections({}, { nameOnly: true }).toArray()).length === 0);
    const empresas = [0, 1].map(() => 'f17e1a' + randomBytes(9).toString('hex'));
    await conexion.db.createCollection('control');
    await conexion.db.collection('control').insertOne({ _id: CONTROL, ...config, version: 1,
      proposito: 'cuotas-ia-solo-fixtures', empresas });
    await marcador(conexion, config); // DDL de cuotas solo tras validar su marcador.
    const Uso = crearModelo(conexion);
    await Uso.createCollection(); await Uso.createIndexes();
    validarIndices(await Uso.collection.listIndexes().toArray());
    await rs.compararOriginal();
    return { ...config, empresas };
  } finally { await conexion.close(); }
};
module.exports = { configuracion, identidad, conectar, marcador, validarIndices, obtener, cerrar, aprovisionar, CONTROL };
