'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const PROJECT_ROOT = path.resolve(__dirname, '..');
// Relative overrides always use the repository, never the caller's cwd. No .env loading.
const configured = (key, fallback) => path.resolve(PROJECT_ROOT, process.env[key] || fallback);
const paths = Object.freeze({
  devRoot: configured('PLURIONE_MONGO_DEV_ROOT', '../marketing-automation-dev-mongo-rs'),
  pilotRoot: configured('PLURIONE_MONGO_PILOT_ROOT', '../marketing-automation-pilot-mongo-rs'),
  quotaRoot: configured('PLURIONE_MONGO_QUOTA_ROOT', '../marketing-automation-cuota-mongo'),
  geminiRoot: configured('PLURIONE_MONGO_GEMINI_ROOT', '../marketing-automation-cuota-mongo-gemini')
});
function executable(name) {
  const keys = { mongod: 'PLURIONE_MONGOD_PATH', mongosh: 'PLURIONE_MONGOSH_PATH' };
  if (!Object.hasOwn(keys, name)) throw Error('EJECUTABLE_NO_AUTORIZADO');
  const override = process.env[keys[name]];
  const candidate = override ? configured(keys[name], '') : execFileSync(
    process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8' }
  ).trim().split(/\r?\n/)[0];
  if (!candidate || !path.isAbsolute(candidate) || !fs.statSync(candidate).isFile()) throw Error('EJECUTABLE_NO_ENCONTRADO');
  return fs.realpathSync(candidate);
}
if (require.main === module) {
  const key = process.argv[2];
  if (Object.hasOwn(paths, key)) process.stdout.write(paths[key]);
  else process.stdout.write(executable(key));
}
module.exports = { PROJECT_ROOT, paths, executable };
