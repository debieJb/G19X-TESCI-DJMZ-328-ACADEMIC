'use strict';
// No carga .env, no llama Google y nunca inicia trabajadores.
const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const manifiesto = require('../infra/gmail-preparacion.local.json');
const URI = `mongodb://127.0.0.1:27019/${manifiesto.base}?replicaSet=marketingPilotLocalRs`;
const infra = require('../services/infraestructuraPilotoService');
const exigir = (ok, codigo) => { if (!ok) throw Error(codigo); };
const verificarInstancia = async conexion => {
  await infra.validarDestinoPiloto(conexion, manifiesto);
  const { parsed } = await conexion.db.admin().command({ getCmdLineOpts: 1 });
  exigir(parsed.net?.port === 27019 && parsed.net.bindIp === '127.0.0.1'
    && parsed.storage?.dbPath?.replaceAll('\\', '/').toLowerCase() === 'c:/users/jocam/documents/marketing-automation-pilot-mongo-rs/data'
    && parsed.replication?.replSet === manifiesto.replicaSet, 'IDENTIDAD_LOCAL_INVALIDA');
  const parametro = await conexion.db.admin().command({ getParameter: 1, ttlMonitorEnabled: 1 });
  exigir(parametro.ttlMonitorEnabled === false, 'TTL_PREEXISTENTE_NO_PAUSADO');
};
const inventario = async (conexion, excluir) => {
  const { databases } = await conexion.db.admin().listDatabases({ nameOnly: true });
  const resumen = {};
  for (const { name } of databases.filter(d => !['admin', 'config', 'local', excluir].includes(d.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const db = conexion.getClient().db(name), hash = createHash('sha256');
    for (const coleccion of (await db.listCollections({}, { nameOnly: true }).toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
      hash.update(coleccion.name);
      hash.update(JSON.stringify((await db.collection(coleccion.name).listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name))));
      for await (const doc of db.collection(coleccion.name).find({}).sort({ _id: 1 })) hash.update(require('bson').serialize(doc));
    }
    resumen[name] = hash.digest('hex');
  }
  return resumen;
};
const principal = async (modo = '--diagnostico') => {
  exigir(['--instancia', '--preparar', '--diagnostico'].includes(modo), 'ARGUMENTOS_INVALIDOS');
  infra.asegurarEnvioApagado();
  exigir(!['TRANSACTIONAL_EMAIL_ENABLED', 'TRANSACTIONAL_WORKER_ENABLED', 'AI_ENABLED'].some(k => process.env[k] === 'true'), 'PROVEEDORES_DEBEN_ESTAR_APAGADOS');
  const conexion = await mongoose.createConnection(URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 1500 }).asPromise();
  try {
    await verificarInstancia(conexion);
    if (modo === '--instancia') return { instancia: 'VERIFICADA', puerto: 27019, replicaSet: manifiesto.replicaSet, primaria: true, ttlAnteriorConservado: true };
    let nuevas = false, conservadas = true;
    if (modo === '--preparar') {
      const bases = await conexion.db.admin().listDatabases({ nameOnly: true });
      const existe = bases.databases.some(d => d.name === manifiesto.base);
      if (existe) {
        exigir(await conexion.db.collection('_migracionesPiloto').findOne({ _id: 'gmail-preparacion-local-v1', base: manifiesto.base }), 'BASE_EXISTENTE_NO_SE_MODIFICA');
      } else {
        const antes = await inventario(conexion, manifiesto.base);
        await require('../services/migracionIndicesPilotoService').migrarIndicesDedicados({ conexion, manifiesto, confirmarBase: manifiesto.base });
        const session = await conexion.startSession();
        try {
          await conexion.transaction(async s => {
            await conexion.db.collection('_migracionesPiloto').insertOne({ _id: 'gmail-preparacion-local-v1', base: manifiesto.base, creadaEn: new Date() }, { session: s });
          });
          try {
            await session.withTransaction(async () => {
              await conexion.db.collection('_migracionesPiloto').insertOne({ _id: 'prueba-transaccion-revertida' }, { session });
              throw Error('ABORTO_CONTROLADO');
            });
          } catch (e) { exigir(e.message === 'ABORTO_CONTROLADO', 'TRANSACCION_FALLIDA'); }
          exigir(!await conexion.db.collection('_migracionesPiloto').findOne({ _id: 'prueba-transaccion-revertida' }), 'ROLLBACK_FALLIDO');
        } finally { await session.endSession(); }
        conservadas = JSON.stringify(antes) === JSON.stringify(await inventario(conexion, manifiesto.base));
        exigir(conservadas, 'COMPARACION_PREEXISTENTES_DIFIERE'); nuevas = true;
      }
    }
    const indices = await infra.revisarIndices(conexion);
    const { MongoSessionStore, COLECCION } = require('../services/mongoSessionStore');
    if (indices.completos) await new MongoSessionStore({ coleccion: conexion.db.collection(COLECCION), clave: Buffer.alloc(32, 1), ambito: manifiesto.base }).comprobar();
    const contar = nombre => conexion.db.collection(nombre).countDocuments({});
    let web = 'NO_CONSULTADA';
    if (modo === '--diagnostico' && process.env.PILOT_PREPARATION_PROFILE === 'gmail') {
      exigir(process.env.MONGODB_URI === URI, 'URI_DEL_PROCESO_NO_COINCIDE');
      const tls = require('../services/httpsPilotoLocalService').configuracion(process.env, manifiesto);
      web = await require('../services/diagnosticoWebGmailLocalService').principal(tls);
      exigir(await require('../services/trabajadorCampanasService').prepararArranque({ app: { locals: {} }, conexion }) === null, 'TRABAJADOR_NO_DEBE_INICIARSE');
    }
    return { base: manifiesto.base, replicaSet: manifiesto.replicaSet, puerto: 27019, nuevaBaseCreada: nuevas,
      basesPreexistentesConservadas: modo === '--preparar' && nuevas ? conservadas : 'NO_COMPARADAS_EN_ESTA_CONSULTA',
      indicesCompletos: indices.completos, faltantes: indices.faltantes, sesionesConIndiceTTL: indices.completos,
      persistenciaMarcador: !!await conexion.db.collection('_migracionesPiloto').findOne({ _id: 'gmail-preparacion-local-v1' }),
      empresas: await contar('empresas'), usuarios: await contar('usuarios'), conexionesGmail: await contar('conexiongmails'),
      ejecuciones: await contar('ejecuciongmails'), envios: await contar('enviogmails'),
      enviosHabilitados: false, trabajadorIniciado: false, web, oauthConfigurado: require('../services/googleOAuthClienteService').estaConfigurado(),
      callbackCorrecto: process.env.GOOGLE_OAUTH_REDIRECT_URI === 'https://localhost:3100/empresa/gmail/callback',
      pendiente: 'AUTORIZACION_INTERACTIVA_GOOGLE_Y_CONFIRMACION_INDEPENDIENTE_DE_UN_ENVIO' };
  } finally { await conexion.close(); }
};
if (require.main === module) principal(process.argv[2]).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => {
  console.error(['BASE_EXISTENTE_NO_SE_MODIFICA', 'COMPARACION_PREEXISTENTES_DIFIERE'].includes(e.message) ? e.message : 'PREPARACION_GMAIL_LOCAL_NO_DISPONIBLE'); process.exitCode = 1;
});
module.exports = { principal, verificarInstancia, URI };
