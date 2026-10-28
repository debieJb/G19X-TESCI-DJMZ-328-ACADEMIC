'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validarHistoria, validarReconciliacion, validarArranqueOriginal } = require('../scripts/mongoDevRsReconciliacion');
const referencia = require('../docs/mongodb-indices-autorizados-v2.json');
const v3Bytes = fs.readFileSync(path.join(__dirname, '../docs/mongodb-reconciliacion-pid-v3.json'));
const v2Bytes = fs.readFileSync(path.join(__dirname, '../docs/mongodb-indices-autorizados-v2.json'));
const v3 = JSON.parse(v3Bytes);
const fixture = (pid = 6040) => {
  const servicio = { ...v3.servicio, pid, ownerPid: pid, processCreatedUtc: '2026-10-26T08:25:29.0000000Z',
    processBinary: v3.servicio.binary, processCommand: v3.servicio.command,
    binaryCanonical: v3.servicio.binary, configCanonical: v3.servicio.config, dbPathCanonical: v3.servicio.dbPath };
  return { antes: structuredClone(referencia.anterior), referencia: structuredClone(referencia), v3: structuredClone(v3),
    baselineBytes: Buffer.from(JSON.stringify(referencia.anterior)), v2Bytes, v3Bytes,
    actual: { ...v3.actual, pid }, servicioAntes: servicio, servicioDespues: structuredClone(servicio) };
};
test('historia: conserva anclajes, PID 5648, reconciliacion unica 6160 y sus bytes', () => {
  const f = fixture(); validarHistoria(f);
  validarReconciliacion({ ...f, actual: v3.actual, servicioAntes: v3.servicio, servicioDespues: v3.servicio });
  assert.throws(() => validarReconciliacion(f), /RECONCILIACION_NO_AUTORIZADA/);
});
for (const pid of [6040, 6160, 9900]) test(`arranque: admite PID legitimo ${pid} con identidad persistente y nueva fecha`, () => {
  assert.doesNotThrow(() => validarArranqueOriginal(fixture(pid)));
});
for (const campo of ['baselineBytes', 'v2Bytes', 'v3Bytes']) test(`historia: rechaza bytes alterados de ${campo}`, () => {
  const f=fixture(); f[campo]=Buffer.concat([f[campo],Buffer.from('\n')]);
  assert.throws(() => validarArranqueOriginal(f), /RECONCILIACION_NO_AUTORIZADA/);
});
for (const campo of ['antes', 'referencia', 'v3']) test(`historia: rechaza objeto sustituido de ${campo}`, () => {
  const f=fixture(); f[campo].alterado=true;
  assert.throws(() => validarArranqueOriginal(f), /RECONCILIACION_NO_AUTORIZADA/);
});
for (const campo of ['configuracion', 'datos', 'indices']) test(`arranque: bloquea discrepancia de ${campo}`, () => {
  const f=fixture();f.actual[campo]='otra-huella';
  assert.throws(() => validarArranqueOriginal(f), new RegExp('HUELLA_ORIGINAL_DIFIERE_'+campo.toUpperCase()));
});
for (const [campo,valor] of Object.entries({name:'OtroServicio',state:'Stopped',startMode:'Manual',command:'otro comando',
 address:'0.0.0.0',port:27018,binary:'D:\\otro\\mongod.exe',binarySha256:'otro-binario',config:'D:\\otro.cfg',configSha256:'otra-configuracion',dbPath:'D:\\otros-datos'})) {
 test(`arranque: rechaza sustitucion de servicio/${campo}`, () => {
  const f=fixture();f.servicioAntes[campo]=valor;f.servicioDespues[campo]=valor;
  assert.throws(() => validarArranqueOriginal(f), /IDENTIDAD_SERVICIO_ORIGINAL_INCORRECTA/);
 });
}
for (const [nombre,mutar,codigo] of [
 ['PID listener',f=>{f.servicioAntes.ownerPid=1;},'PID_SERVICIO_LISTENER_MONGO_NO_COINCIDE'],
 ['PID cero',f=>{f.servicioAntes.pid=0;},'PID_SERVICIO_LISTENER_MONGO_NO_COINCIDE'],
 ['fecha ausente',f=>{delete f.servicioAntes.processCreatedUtc;},'FECHA_PROCESO_ORIGINAL_INVALIDA'],
 ['imagen ajena',f=>{f.servicioAntes.processBinary='D:\\otro\\mongod.exe';},'PROCESO_ORIGINAL_NO_COINCIDE'],
 ['imagen no legible',f=>{delete f.servicioAntes.processBinary;},'PROCESO_ORIGINAL_NO_COINCIDE'],
 ['comando del proceso',f=>{f.servicioAntes.processCommand='otro';},'PROCESO_ORIGINAL_NO_COINCIDE'],
 ...['binaryCanonical','configCanonical','dbPathCanonical'].map(c=>[c,f=>{f.servicioAntes[c]='D:\\redireccion';},'RUTA_ORIGINAL_NO_CANONICA'])
]) test(`arranque: falla cerrado ante ${nombre}`, () => {
 const f=fixture();mutar(f);f.servicioDespues=structuredClone(f.servicioAntes);
 assert.throws(() => validarArranqueOriginal(f),new RegExp(codigo));
});
test('arranque: PID reportado por Mongo debe coincidir con servicio y listener', () => {
 const f=fixture();f.actual.pid=6160;
 assert.throws(() => validarArranqueOriginal(f),/PID_SERVICIO_LISTENER_MONGO_NO_COINCIDE/);
});
for(const campo of ['pid','processCreatedUtc','binarySha256','configSha256']) test(`arranque: rechaza cambio de ${campo} entre capturas`,()=>{
 const f=fixture();f.servicioDespues[campo]='cambio';
 assert.throws(()=>validarArranqueOriginal(f),/SERVICIO_CAMBIO_DURANTE_COMPROBACION/);
});
test('PowerShell/Node: colector simulado toma PID del servicio y conserva controles, sin Mongo real', {skip:process.platform!=='win32'}, () => {
 const script=path.join(__dirname,'soporte/servicioMongoOriginal.fixture.ps1');
 for(const [caso,codigo] of [['valido',null],['imagenNoLegible','IDENTIDAD_PROCESO_NO_LEGIBLE'],['imagenAjena','PROCESO_ORIGINAL_NO_COINCIDE'],
 ['servicioSustituido','COMANDO_SERVICIO_NO_COINCIDE'],['listenerAjeno','LISTENER_ORIGINAL_NO_COINCIDE'],['rutaRedirigida','RUTA_ORIGINAL_REDIRECCIONADA'],['huellaAlterada','HUELLA_ARCHIVO_ORIGINAL_DIFIERE']]) {
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Caso',caso],{encoding:'utf8',timeout:20000});
  if(codigo){ assert.notEqual(r.status,0,caso);assert.match(r.stderr,new RegExp(codigo)); }
  else { assert.equal(r.status,0,r.stderr); const f=fixture(); f.servicioAntes=JSON.parse(r.stdout.replace(/^\uFEFF/,'')); f.servicioDespues=structuredClone(f.servicioAntes); validarArranqueOriginal(f); }
 }
});

test('integracion de arranque: historia antes de consultar y dos capturas alrededor de huellas', async () => {
 const { comprobarArranqueOriginal } = require('../scripts/mongoDevRsReconciliacion');
 const f=fixture(); const orden=[];
 const deps={capturarServicio:()=>{orden.push('servicio');return structuredClone(f.servicioAntes);},leerOriginal:async()=>{orden.push('mongo');return structuredClone(f.actual);}};
 assert.deepEqual(await comprobarArranqueOriginal(f,deps),f.actual);
 assert.deepEqual(orden,['servicio','mongo','servicio']);
 orden.length=0;
 await assert.rejects(comprobarArranqueOriginal({...f,v3Bytes:Buffer.from('{}')},deps),/RECONCILIACION_NO_AUTORIZADA/);
 assert.deepEqual(orden,[]);
});
test('integracion de arranque: una captura posterior distinta o huellas discrepantes nunca aprueban', async () => {
 const { comprobarArranqueOriginal } = require('../scripts/mongoDevRsReconciliacion');
 const f=fixture();let calls=0;
 await assert.rejects(comprobarArranqueOriginal(f,{leerOriginal:async()=>f.actual,capturarServicio:()=>{calls++;return {...f.servicioAntes,pid:calls===1?6040:9900};}}),/SERVICIO_CAMBIO_DURANTE_COMPROBACION/);
 await assert.rejects(comprobarArranqueOriginal(f,{leerOriginal:async()=>({...f.actual,datos:'discrepantes'}),capturarServicio:()=>structuredClone(f.servicioAntes)}),/HUELLA_ORIGINAL_DIFIERE_DATOS/);
});
