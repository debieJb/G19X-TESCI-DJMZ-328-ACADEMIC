const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MongoClient } = require('mongodb');
const ROOT = 'C:\\Users\\jocam\\Documents\\marketing-automation-dev-mongo-rs';
const DATA = path.join(ROOT, 'data');
const SET = 'marketingDevRs';
const URI = 'mongodb://127.0.0.1:27018/admin?directConnection=true';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exigir = (valor, mensaje) => { if (!valor) throw new Error(mensaje); };
const digest = valor => createHash('sha256').update(JSON.stringify(valor)).digest('hex');
const validarOpciones = parsed => {
  exigir(parsed?.net?.port === 27018 && parsed.net.bindIp === '127.0.0.1'
    && parsed.replication?.replSet === SET
    && path.resolve(parsed.storage?.dbPath || '').toLowerCase() === DATA.toLowerCase(), 'IDENTIDAD_NODO_INCORRECTA');
};
const rutasSeguras = () => {
  for (const dir of [ROOT, DATA, path.join(ROOT, 'logs')]) {
    exigir(fs.existsSync(dir) && fs.lstatSync(dir).isDirectory() && !fs.lstatSync(dir).isSymbolicLink(), 'DIRECTORIO_NO_SEGURO');
    exigir(path.resolve(fs.realpathSync(dir)).toLowerCase() === path.resolve(dir).toLowerCase(), 'DIRECTORIO_REDIRECCIONADO');
  }
};
const conectar = async () => {
  rutasSeguras();
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 2500, connectTimeoutMS: 2500, socketTimeoutMS: 10000 });
  try {
    await client.connect();
    const admin = client.db('admin');
    const { parsed } = await admin.command({ getCmdLineOpts: 1 });
    validarOpciones(parsed);
    return client;
  } catch (error) { await client.close(); throw error; }
};
const verificar = async client => {
  const admin = client.db('admin');
  const hello = await admin.command({ hello: 1 });
  const { config } = await admin.command({ replSetGetConfig: 1 });
  exigir(config._id === SET && config.members.length === 1 && config.members[0].host === 'localhost:27018', 'CONFIGURACION_RS_INCORRECTA');
  exigir(hello.setName === SET && hello.isWritablePrimary === true && hello.logicalSessionTimeoutMinutes !== undefined, 'RS_NO_ES_PRIMARIO');
  return hello;
};
const esperar = async () => {
  const limite = Date.now() + 30000;
  while (Date.now() < limite) {
    let client;
    try { client = await conectar(); return client; }
    catch (error) { if (error.message.startsWith('IDENTIDAD_') || error.message.startsWith('DIRECTORIO_')) throw error; }
    finally { /* El cliente válido se devuelve al llamador. */ }
    await sleep(500);
  }
  throw new Error('TIMEOUT_ARRANQUE');
};
const original = async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017/admin?directConnection=true', { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });
    exigir(!hello.setName && hello.msg !== 'isdbgrid', 'ORIGINAL_NO_ES_STANDALONE');
    const opts = await admin.command({ getCmdLineOpts: 1 });
    const status = await admin.command({ serverStatus: 1 });
    const db = client.db('marketing_automation');
    const hash = await db.command({ dbHash: 1 });
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const indices = [];
    for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
      indices.push([name, await db.collection(name).listIndexes().toArray()]);
    }
    return { pid: status.pid, configuracion: digest(opts.parsed), datos: digest(hash.collections), indices: digest(indices) };
  } finally { await client.close(); }
};
const compararOriginal = async () => {
  const antes = JSON.parse(fs.readFileSync(path.join(ROOT, 'original-baseline.json'), 'utf8'));
  const referencia = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/mongodb-indices-autorizados-v2.json'), 'utf8'));
  validarReferencia(antes, referencia);
  exigir(JSON.stringify(referencia.actual) === JSON.stringify(await original()), 'ORIGINAL_CAMBIO_DETECTADO');
  console.log('STANDALONE_ORIGINAL: SIN_CAMBIOS_DE_PROCESO_CONFIGURACION_DATOS_E_INDICES');
};
const validarReferencia = (antes, referencia) => {
  const indice = { v: 2, key: { empresa: 1, 'asistenciaIA.aprobacionHash': 1 },
    name: 'empresa_1_asistenciaIA.aprobacionHash_1', unique: true,
    partialFilterExpression: { 'asistenciaIA.aprobacionHash': { $type: 'string' } } };
  exigir(referencia.version === 2 && JSON.stringify(antes) === JSON.stringify(referencia.anterior), 'REFERENCIA_NO_AUTORIZADA');
  for (const campo of ['pid', 'configuracion', 'datos']) exigir(antes[campo] === referencia.actual[campo], 'REFERENCIA_NO_AUTORIZADA');
  exigir(referencia.coleccion === 'campanas' && JSON.stringify(referencia.indice) === JSON.stringify(indice), 'REFERENCIA_NO_AUTORIZADA');
  const inventario = referencia.inventario;
  exigir(digest(inventario) === referencia.actual.indices, 'REFERENCIA_NO_AUTORIZADA');
  const candidatos = inventario.find(([n]) => n === 'campanas')?.[1].filter(i => i.name === indice.name);
  exigir(candidatos?.length === 1 && JSON.stringify(candidatos[0]) === JSON.stringify(indice), 'REFERENCIA_NO_AUTORIZADA');
  const previo = inventario.map(([n, indices]) => [n, n === 'campanas' ? indices.filter(i => i.name !== indice.name) : indices]);
  exigir(digest(previo) === antes.indices, 'REFERENCIA_NO_AUTORIZADA');
};
const ejecutar = main => main().catch(() => {
  console.error('ERROR: comprobacion fallida; procedimiento detenido, sin reparaciones. Revisar el entorno y el log local.');
  process.exitCode = 1;
});
module.exports = { ROOT, DATA, SET, URI, sleep, exigir, validarOpciones, validarReferencia, rutasSeguras, conectar, verificar, esperar, original, compararOriginal, ejecutar };
