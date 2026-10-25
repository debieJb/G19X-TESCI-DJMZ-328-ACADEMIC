'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');

const crearEntornoPiloto = env => {
  if (env.NODE_ENV !== undefined && env.NODE_ENV !== 'development') throw Error('PILOTO_REQUIERE_DEVELOPMENT');
  if (env.AI_QUOTA_BACKEND !== undefined && env.AI_QUOTA_BACKEND !== 'piloto_local') throw Error('PILOTO_BACKEND_EN_CONFLICTO');
  return { ...env, NODE_ENV: 'development', AI_QUOTA_BACKEND: 'piloto_local' };
};

const iniciar = () => {
  const root = path.resolve(__dirname, '..');
  const entorno = { ...process.env };
  require('dotenv').config({ path: path.join(root, '.env'), processEnv: entorno, quiet: true });
  const env = crearEntornoPiloto(entorno);
  // Reutiliza nodemon y server.js: sus validaciones y controles no cambian.
  const child = spawn(process.execPath, [require.resolve('nodemon/bin/nodemon.js'), 'server.js'], {
    cwd: root, env, stdio: 'inherit', shell: false
  });
  child.once('error', () => { console.error('PILOTO_NO_SE_PUDO_INICIAR'); process.exitCode = 1; });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
};

if (require.main === module) {
  try { iniciar(); }
  catch (error) {
    console.error(['PILOTO_REQUIERE_DEVELOPMENT', 'PILOTO_BACKEND_EN_CONFLICTO'].includes(error.message)
      ? error.message : 'PILOTO_NO_SE_PUDO_INICIAR');
    process.exitCode = 1;
  }
}
module.exports = { crearEntornoPiloto };
