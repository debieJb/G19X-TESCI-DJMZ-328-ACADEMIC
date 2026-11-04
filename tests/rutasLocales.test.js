const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { PROJECT_ROOT, paths } = require('../scripts/rutasLocales');
const resolver = path.join(PROJECT_ROOT, 'scripts/rutasLocales.js');
const overrides = {
 PLURIONE_MONGO_DEV_ROOT: 'tmp/dev con espacios', PLURIONE_MONGO_PILOT_ROOT: 'tmp/pilot',
 PLURIONE_MONGO_QUOTA_ROOT: 'tmp/cuotas', PLURIONE_MONGO_GEMINI_ROOT: 'tmp/gemini',
 PLURIONE_MONGOD_PATH: process.execPath, PLURIONE_MONGOSH_PATH: process.execPath
};
const env = { ...process.env, ...overrides };
const run = (exe,args) => {
 const result = spawnSync(exe,args,{env,cwd:os.tmpdir(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr); return result.stdout.trim();
};
test('integración PowerShell/Node: mismas rutas y ejecutables configurados desde otro cwd sin ejecutar MongoDB', () => {
 for (const key of ['devRoot','pilotRoot','quotaRoot','geminiRoot','mongod','mongosh']) {
  const expected = run(process.execPath,[resolver,key]);
  const helper = path.join(PROJECT_ROOT,'scripts/rutasLocales.ps1').replaceAll("'","''");
  if (process.platform === 'win32') assert.equal(run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`. '${helper}'; Get-PluriOnePath '${key}'`]),expected);
  assert.ok(path.isAbsolute(expected));
 }
 assert.equal(run(process.execPath,[resolver,'devRoot']),path.join(PROJECT_ROOT,'tmp/dev con espacios'));
});
test('consumidores Node usan las mismas rutas configuradas sin conexiones', () => {
 const source = `const assert=require('node:assert/strict'); const p=require('./scripts/rutasLocales').paths;
 assert.equal(require('./scripts/mongoDevRsComun').ROOT,p.devRoot);
 assert.equal(require('./scripts/ia/quotaTarget').targetByName('gemini').root,p.geminiRoot);
 assert.equal(require('./scripts/ia/quotaTarget').targetByName().root,p.quotaRoot);`;
 const r=spawnSync(process.execPath,['-e',source],{env,cwd:PROJECT_ROOT,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('Gmail acepta solo identidad configurada y rechaza dbPath ajeno sin DB real', async () => {
 const { verificarInstancia } = require('../scripts/prepararEntornoGmailLocal');
 const manifest = require('../infra/gmail-preparacion.local.json');
 // The service validates hello before getCmdLineOpts; use its expected deployment identity.
 const service = require('../services/infraestructuraPilotoService');
 const original = service.validarDestinoPiloto;
 service.validarDestinoPiloto = async () => {};
 try {
  for (const valid of [true,false]) {
   const connection={db:{admin:()=>({command:async cmd=>cmd.getCmdLineOpts ? {parsed:{net:{port:27019,bindIp:'127.0.0.1'},storage:{dbPath:valid?path.join(paths.pilotRoot,'data'):os.tmpdir()},replication:{replSet:manifest.replicaSet}}} : {ttlMonitorEnabled:false}})}};
   if(valid) await verificarInstancia(connection);
   else await assert.rejects(verificarInstancia(connection),/IDENTIDAD_LOCAL_INVALIDA/);
  }
 } finally { service.validarDestinoPiloto=original; }
});

test('valores predeterminados y overrides absolutos no dependen del usuario ni del cwd', () => {
 const cleanEnv = {...process.env};
 for (const key of Object.keys(overrides)) delete cleanEnv[key];
 const expected = {devRoot:'marketing-automation-dev-mongo-rs',pilotRoot:'marketing-automation-pilot-mongo-rs',quotaRoot:'marketing-automation-cuota-mongo',geminiRoot:'marketing-automation-cuota-mongo-gemini'};
 for (const [key, directory] of Object.entries(expected)) {
  const result=spawnSync(process.execPath,[resolver,key],{env:cleanEnv,cwd:os.tmpdir(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,path.resolve(PROJECT_ROOT,'..',directory));
 }
 const absolute=path.join(os.tmpdir(),'plurione explicit root');
 const result=spawnSync(process.execPath,[resolver,'devRoot'],{env:{...cleanEnv,PLURIONE_MONGO_DEV_ROOT:absolute},cwd:os.tmpdir(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr); assert.equal(result.stdout,absolute);
});
test('ejecutable configurado inexistente y selector desconocido fallan sin fallback', () => {
 for (const key of ['mongod','unknown']) {
  const result=spawnSync(process.execPath,[resolver,key],{env:{...env,PLURIONE_MONGOD_PATH:path.join(os.tmpdir(),'plurione-not-installed.exe')},encoding:'utf8'});
  assert.notEqual(result.status,0); assert.equal(result.stdout,'');
 }
});
