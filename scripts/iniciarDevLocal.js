'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');

const crearEntornoLocal = (base, root) => {
  const env = { ...base };
  const resultado = dotenv.config({ path: path.join(root, '.env'), processEnv: env, quiet: true });
  if (resultado.error) throw Error('CONFIGURACION_LOCAL_NO_DISPONIBLE');
  if (env.NODE_ENV !== 'development' || env.AI_ENABLED !== 'true'
      || env.AI_QUOTA_BACKEND !== 'piloto_local' || !env.PLURIONE_MONGO_DEV_ROOT) {
    throw Error('CONFIGURACION_LOCAL_INCOMPLETA');
  }
  let uri;
  try { uri = new URL(env.MONGODB_URI); } catch { throw Error('MONGODB_URI_INVALIDA'); }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname)
      || uri.port !== '27018' || uri.searchParams.get('replicaSet') !== 'marketingDevRs') {
    throw Error('MONGODB_URI_NO_AUTORIZADA');
  }
  return env;
};

const verificarReplicaActiva = async comun => {
  const client = await comun.conectar();
  try { await comun.verificar(client); }
  finally { await client.close(); }
};

const prepararYVerificar = async ({ root = path.resolve(__dirname, '..'), baseEnv = process.env, comun } = {}) => {
  const env = crearEntornoLocal(baseEnv, root);
  // Valores solo en este proceso y su hijo; no se escriben en el entorno de Windows.
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try { await verificarReplicaActiva(comun || require('./mongoDevRsComun')); }
  catch {
    throw Error('MONGODB_DEV_NO_LISTO: inicia manualmente la instancia existente y verifica marketingDevRs PRIMARY en 27018; no se inició ni modificó MongoDB.');
  }
  return env;
};

const iniciar = async ({ root = path.resolve(__dirname, '..'), baseEnv = process.env, spawnChild = spawn, soloVerificar = false } = {}) => {
  const env = await prepararYVerificar({ root, baseEnv });
  if (soloVerificar) return { verificado: true };
  const child = spawnChild(process.execPath, [require.resolve('nodemon/bin/nodemon.js'), 'server.js'], {
    cwd: root, env, stdio: 'inherit', shell: false
  });
  child.once('error', () => { console.error('DEV_LOCAL_NO_SE_PUDO_INICIAR'); process.exitCode = 1; });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  return child;
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--verificar') || args.length > 1) {
    console.error('ARGUMENTO_NO_AUTORIZADO'); process.exitCode = 1;
  } else iniciar({ soloVerificar: args[0] === '--verificar' }).then(result => {
    if (result?.verificado) console.log('MONGODB_DEV: IDENTIDAD_VALIDADA; REPLICA_SET: marketingDevRs; ESTADO: PRIMARY; PUERTO: 27018');
  }).catch(error => {
    const allowed = ['CONFIGURACION_LOCAL_NO_DISPONIBLE', 'CONFIGURACION_LOCAL_INCOMPLETA', 'MONGODB_URI_INVALIDA', 'MONGODB_URI_NO_AUTORIZADA'];
    console.error(allowed.includes(error.message) || error.message.startsWith('MONGODB_DEV_NO_LISTO:') ? error.message : 'DEV_LOCAL_NO_SE_PUDO_INICIAR');
    process.exitCode = 1;
  });
}

module.exports = { crearEntornoLocal, verificarReplicaActiva, prepararYVerificar, iniciar };
