'use strict';
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ejecutar = promisify(execFile);
const pausa = ms => new Promise(r => setTimeout(r, ms));
const ocupado = async puerto => {
  for (const host of ['127.0.0.1', '::1']) {
    const conectado = await new Promise((resolve, reject) => {
      const socket = net.connect({ host, port: puerto });
      socket.setTimeout(1500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', e => ['ECONNREFUSED', 'EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(e.code) ? resolve(false) : reject(e));
      socket.once('timeout', () => { socket.destroy(); reject(Error('PUERTO_NO_VERIFICABLE')); });
    });
    if (conectado) return true;
  }
  // El bind completo detecta tambien listeners en otras interfaces, sin elegir otro puerto.
  for (const host of ['0.0.0.0', '::']) {
    const conflicto = await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', e => e.code === 'EADDRINUSE' ? resolve(true)
        : ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(e.code) ? resolve(false) : reject(e));
      probe.listen({ port: puerto, host, ipv6Only: host === '::', exclusive: true }, () => probe.close(() => resolve(false)));
    });
    if (conflicto) return true;
  }
  return false;
};
const asegurarMongo = async ({ comun, puerto = ocupado, arrancar, esperar = pausa, intentos = 60 }) => {
  if (!await puerto(27018)) await arrancar();
  for (let i = 0; i < intentos; i++) {
    let client;
    try { client = await comun.conectar(); await comun.verificar(client); return; }
    catch (e) {
      if (!['RS_NO_ES_PRIMARIO'].includes(e.message)) throw Error('MONGODB_27018_IDENTIDAD_O_CONEXION_INVALIDA');
      if (i === intentos - 1) throw Error('MONGODB_PRIMARY_TIMEOUT');
    } finally { await client?.close(); }
    await esperar(500);
  }
};
const arrancarMongo = async env => {
  if (process.platform !== 'win32') throw Error('ARRANQUE_MONGO_REQUIERE_WINDOWS');
  try {
    const { stdout } = await ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File',
      path.join(__dirname, 'iniciarMongoDevRsExistente.ps1'), '-PermitirElevacion'], {
      env, windowsHide: true, timeout: 180000, maxBuffer: 16384
    });
    // El script emite solo estados, nunca el entorno ni credenciales.
    for (const line of stdout.split(/\r?\n/).filter(l => /^(MONGODB_DEV|REPLICA_SET|STANDALONE_ORIGINAL|ELEVACION_)/.test(l))) console.log(line);
  } catch { throw Error('MONGODB_ARRANQUE_RECHAZADO: revisa permisos/UAC y la identidad del servicio original; no se omitieron controles.'); }
};
const bloquear = async (root, { esperar = pausa, intentos = 360 } = {}) => {
  const nombre = 'plurione-dev-' + createHash('sha256').update(fs.realpathSync(root).toLowerCase()).digest('hex').slice(0, 32);
  // El SO libera el pipe al salir: sin locks obsoletos ni borrados por carreras de PID.
  const archivo = process.platform === 'win32' ? '\\\\.\\pipe\\' + nombre : path.join(os.tmpdir(), nombre + '.sock');
  for (let i = 0; i < intentos; i++) {
    const guard = net.createServer(socket => socket.destroy());
    try {
      await new Promise((resolve, reject) => {
        guard.once('error', reject); guard.listen({ path: archivo, readableAll: false, writableAll: false }, resolve);
      });
      return () => new Promise(resolve => guard.close(resolve));
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw Error('DEV_BLOQUEO_SIN_PERMISOS');
      await esperar(500);
    }
  }
  throw Error('DEV_OTRO_ARRANQUE_EN_CURSO');
};
const estadoWeb = async ({ puerto = ocupado, consultar }) => {
  if (!await puerto(3000)) return null;
  try { return await consultar(); }
  catch { throw Error('PUERTO_3000_IDENTIDAD_NO_CONFIRMADA: no se detuvo el proceso existente.'); }
};
const esperarWeb = async ({ consultar, vivo, esperar = pausa, intentos = 60 }) => {
  for (let i = 0; i < intentos; i++) {
    if (!vivo()) throw Error('PLURIONE_TERMINO_ANTES_DE_RESPONDER');
    try { return await consultar(); } catch {}
    await esperar(500);
  }
  throw Error('PLURIONE_HTTP_TIMEOUT');
};
module.exports = { ocupado, asegurarMongo, arrancarMongo, bloquear, estadoWeb, esperarWeb };
