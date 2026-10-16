const infra = require('./infraestructuraPilotoService');
const exigir = (ok, codigo) => { if (!ok) throw Error(codigo); };
// Verificacion previa independiente del DDL. No inicia ni reconfigura MongoDB.
const validarDestinoMigracion = async (conexion, manifiesto) => {
  infra.validarManifiesto(manifiesto);
  exigir(manifiesto.miembros.every(m => !/:2701[78]$/.test(m)), 'PUERTO_MIGRACION_PROHIBIDO');
  await infra.validarDestinoPiloto(conexion, manifiesto);
  const h = await conexion.db.admin().command({ hello: 1 });
  const { parsed } = await conexion.db.admin().command({ getCmdLineOpts: 1 });
  exigir(parsed?.net?.port && ![27017, 27018].includes(parsed.net.port)
    && parsed.replication?.replSet === manifiesto.replicaSet
    && h.me && manifiesto.miembros.includes(h.me)
    && Number(h.me.split(':').at(-1)) === parsed.net.port, 'IDENTIDAD_MIGRACION_NO_COINCIDE');
};
const migrarIndicesDedicados = async ({ conexion, manifiesto, confirmarBase }) => {
  infra.asegurarEnvioApagado();
  await validarDestinoMigracion(conexion, manifiesto);
  exigir(confirmarBase === manifiesto.base, 'CONFIRMACION_MIGRACION_REQUERIDA');
  const plan = infra.planIndices(conexion);
  const existentes = await conexion.db.listCollections({}, { nameOnly: true }).toArray();
  exigir(existentes.every(c => c.name === '_migracionesPiloto' || plan.some(p => p.coleccion === c.name)), 'BASE_NO_ES_NUEVA');
  // Preflight completo antes de cualquier DDL: solo una base nueva sin datos de aplicacion.
  for (const p of plan) {
    exigir(await conexion.db.collection(p.coleccion).countDocuments({}) === 0, 'BASE_CONTIENE_DATOS');
    if (!existentes.some(c => c.name === p.coleccion)) continue;
    const indices = await conexion.db.collection(p.coleccion).listIndexes().toArray();
    for (const i of p.indices) {
      const igual = indices.find(a => JSON.stringify(a.key) === JSON.stringify(i.key));
      exigir(!igual || (!!igual.unique === !!i.options.unique && !igual.sparse
        && JSON.stringify(igual.partialFilterExpression) === JSON.stringify(i.options.partialFilterExpression)
        && igual.expireAfterSeconds === i.options.expireAfterSeconds), 'INDICE_EXISTENTE_INCOMPATIBLE');
    }
  }
  for (const p of plan) {
    if (!existentes.some(c => c.name === p.coleccion)) await conexion.db.createCollection(p.coleccion);
    const actuales = await conexion.db.collection(p.coleccion).listIndexes().toArray();
    for (const i of p.indices) if (!actuales.some(a => JSON.stringify(a.key) === JSON.stringify(i.key))) await conexion.db.collection(p.coleccion).createIndex(i.key, i.options);
  }
  const resultado = await infra.revisarIndices(conexion);
  exigir(resultado.completos, 'MIGRACION_INCOMPLETA');
  await conexion.db.collection('_migracionesPiloto').updateOne({ _id: 'indices-piloto-v1' },
    { $setOnInsert: { version: 1, aplicadaEn: new Date(), base: manifiesto.base, replicaSet: manifiesto.replicaSet } },
    { upsert: true, writeConcern: { w: 'majority' } });
  return { completos: true, version: 1 };
};
module.exports = { validarDestinoMigracion, migrarIndicesDedicados };
