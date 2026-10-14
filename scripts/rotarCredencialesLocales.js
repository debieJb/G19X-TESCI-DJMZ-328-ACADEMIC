// Solo ejecutar tras aprobación explícita. Contraseña por stdin privado desde
// el diálogo de Windows; nunca mediante argumentos, historial o salida.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { actualizarPasswordSuperadmin, validarDestino } = require('./actualizarPasswordSuperadmin');
const nombres = ['SESSION_SECRET', 'SUPERADMIN_PASSWORD', 'GMAIL_TOKEN_ENCRYPTION_KEY'];
const formatoClave = clave => typeof clave === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(clave)
  && Buffer.from(clave, 'base64').length === 32 && Buffer.from(clave, 'base64').toString('base64') === clave;
const validarPassword = valor => {
  if (typeof valor !== 'string' || !valor.trim() || valor.length < 16 || Buffer.byteLength(valor, 'utf8') > 72 || /[\x22\x27\x60\\\r\n]/.test(valor)) {
    throw new Error('PASSWORD_INVALIDA');
  }
};
const prepararArchivo = (texto, password) => {
  validarPassword(password);
  const antes = dotenv.parse(texto);
  const valores = { SESSION_SECRET: crypto.randomBytes(48).toString('base64url'), SUPERADMIN_PASSWORD: password,
    GMAIL_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
  for (const nombre of nombres) {
    const patron = new RegExp('^[ \\t]*(?:export[ \\t]+)?' + nombre + '[ \\t]*=[^\\r\\n]*', 'gm');
    const coincidencias = [...texto.matchAll(patron)];
    if (coincidencias.length !== 1 || dotenv.parse(coincidencias[0][0])[nombre] !== antes[nombre]) throw new Error('ARCHIVO_INVALIDO');
    texto = texto.replace(patron, () => `${nombre}="${valores[nombre]}"`);
  }
  const despues = dotenv.parse(texto);
  for (const [nombre, valor] of Object.entries(antes)) if (!nombres.includes(nombre) && despues[nombre] !== valor) throw new Error('ARCHIVO_INVALIDO');
  for (const nombre of nombres) if (despues[nombre] !== valores[nombre]) throw new Error('ARCHIVO_INVALIDO');
  if (despues.SESSION_SECRET === antes.SESSION_SECRET || despues.GMAIL_TOKEN_ENCRYPTION_KEY === antes.GMAIL_TOKEN_ENCRYPTION_KEY) throw new Error('SIN_ROTACION');
  return { texto, valores };
};
const impedirExpress = async puerto => {
  const servidores = [];
  try {
    for (const host of ['127.0.0.1', '::1']) {
      const server = net.createServer();
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ port: puerto, host, exclusive: true }, resolve); });
      servidores.push(server);
    }
    return servidores;
  } catch (error) { await Promise.all(servidores.map(s => new Promise(resolve => s.close(resolve)))); throw error; }
};
const contarCredenciales = async db => {
  const tokens = await db.collection(require('../models/ConexionGmail').collection.collectionName).countDocuments({
    $or: ['accessTokenCifrado', 'refreshTokenCifrado', 'revocacionTokenCifrado'].map(nombre => ({ [nombre]: { $exists: true } }))
  }, { maxTimeMS: 4000 });
  const pendientes = await db.collection(require('../models/EstadoOAuth').collection.collectionName).countDocuments({ expiraEn: { $gt: new Date() } }, { maxTimeMS: 4000 });
  if (tokens || pendientes) throw new Error('TOKENS_EXISTENTES');
};

const rotar = async password => {
  validarPassword(password);
  const root = path.resolve(__dirname, '..');
  const archivo = path.join(root, '.env');
  const original = fs.readFileSync(archivo);
  const env = dotenv.parse(original);
  validarDestino(env.MONGODB_URI);
  if (!formatoClave(env.GMAIL_TOKEN_ENCRYPTION_KEY)) throw new Error('CLAVE_INVALIDA');
  if (!env.SUPERADMIN_EMAIL || env.PORT && env.PORT !== '3000' || env.NODE_ENV === 'production') throw new Error('CONFIGURACION_INVALIDA');
  const bloqueos = await impedirExpress(3000);
  let cliente, candidato, respaldo, usuarioAnterior, escribiendoPassword = false;
  try {
    cliente = new mongoose.mongo.MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 4000, connectTimeoutMS: 3000 });
    await cliente.connect();
    const db = cliente.db();
    await contarCredenciales(db);
    const usuarios = db.collection(require('../models/Usuario').collection.collectionName);
    usuarioAnterior = await usuarios.findOne({ email: env.SUPERADMIN_EMAIL.trim().toLowerCase(), rol: 'superadmin' }, { projection: { password: 1 }, maxTimeMS: 4000 });
    if (!usuarioAnterior || typeof usuarioAnterior.password !== 'string'
      || !await bcrypt.compare(env.SUPERADMIN_PASSWORD || '', usuarioAnterior.password)) throw new Error('ESTADO_ANTERIOR_INVALIDO');
    if (await bcrypt.compare(password, usuarioAnterior.password)) throw new Error('PASSWORD_SIN_CAMBIO');
    const preparado = prepararArchivo(original.toString('utf8'), password);
    // Recuperación cifrada y ligada al usuario de Windows; fuera del repositorio.
    respaldo = path.join(os.tmpdir(), `marketing-automation-recovery-${crypto.randomBytes(12).toString('hex')}.dpapi`);
    const protegido = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'rotarCredencialesLocales.ps1'), '-Proteger', '-Archivo', respaldo], {
      input: JSON.stringify({ proyecto: root, env: original.toString('base64'), usuario: String(usuarioAnterior._id), hash: usuarioAnterior.password }),
      encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024
    });
    if (protegido.status !== 0 || protegido.stdout !== 'CONFIGURADO') throw new Error('RESPALDO_INVALIDO');
    candidato = path.join(root, `.env.rotation-${crypto.randomBytes(12).toString('hex')}.tmp`);
    fs.writeFileSync(candidato, preparado.texto, { flag: 'wx', mode: 0o600 });
    if (!fs.readFileSync(archivo).equals(original)) throw new Error('ARCHIVO_CAMBIO_CONCURRENTE');
    await contarCredenciales(db);
    escribiendoPassword = true;
    await actualizarPasswordSuperadmin({ ...env, SUPERADMIN_PASSWORD_NUEVA: password }, {
      aplicar: true, confirmacion: 'CAMBIAR_PASSWORD_SUPERADMIN', hashEsperado: usuarioAnterior.password
    });
    if (!fs.readFileSync(archivo).equals(original)) throw new Error('ARCHIVO_CAMBIO_CONCURRENTE');
    await contarCredenciales(db);
    const nuevoUsuario = await usuarios.findOne({ _id: usuarioAnterior._id, rol: 'superadmin' }, { projection: { password: 1 } });
    if (!nuevoUsuario || !await bcrypt.compare(password, nuevoUsuario.password)) throw new Error('VERIFICACION_PASSWORD');
    // rename conserva el .env original hasta confirmar MongoDB y reemplaza el
    // archivo en el mismo volumen, sin una ventana de contenido parcial.
    fs.renameSync(candidato, archivo);
    candidato = null;
    const actual = dotenv.parse(fs.readFileSync(archivo));
    for (const nombre of nombres) if (actual[nombre] !== preparado.valores[nombre]) throw new Error('VERIFICACION_ARCHIVO');
    if (!formatoClave(actual.GMAIL_TOKEN_ENCRYPTION_KEY) || actual.SESSION_SECRET.length < 64) throw new Error('VERIFICACION_FORMATO');
    dotenv.populate(process.env, actual, { override: true });
    if (!require('../services/googleOAuthClienteService').estaConfigurado()) throw new Error('VERIFICACION_OAUTH');
    return { fase: 'COMPLETADO', SESSION_SECRET: 'CONFIGURADO', SUPERADMIN_PASSWORD: 'CONFIGURADO', GMAIL_TOKEN_ENCRYPTION_KEY: 'CONFIGURADO' };
  } catch (error) {
    let recuperacion = 'SIN_CAMBIOS';
    if (escribiendoPassword && usuarioAnterior && cliente) {
      try {
        const usuarios = cliente.db().collection(require('../models/Usuario').collection.collectionName);
        const actual = await usuarios.findOne({ _id: usuarioAnterior._id, rol: 'superadmin' }, { projection: { password: 1 } });
        if (!actual) throw new Error();
        if (actual.password !== usuarioAnterior.password) {
          if (!await bcrypt.compare(password, actual.password)) throw new Error();
          // Restaurar el hash existente es una operación de recuperación, no un
          // password en texto plano ni un save que vuelva a hashear el hash.
          const restaurado = await usuarios.updateOne({ _id: usuarioAnterior._id, rol: 'superadmin', password: actual.password }, { $set: { password: usuarioAnterior.password } });
          if (restaurado.matchedCount !== 1) throw new Error();
        }
        if (candidato === null && fs.existsSync(archivo) && !fs.readFileSync(archivo).equals(original)) fs.writeFileSync(archivo, original);
        recuperacion = 'RESTAURADO';
      } catch { recuperacion = 'REVISION_MANUAL'; }
    }
    return { fase: 'ERROR', SESSION_SECRET: 'ERROR', SUPERADMIN_PASSWORD: 'ERROR', GMAIL_TOKEN_ENCRYPTION_KEY: 'ERROR',
      motivo: error.message === 'TOKENS_EXISTENTES' ? 'TOKENS_EXISTENTES' : 'OPERACION_FALLIDA', recuperacion,
      ...(recuperacion === 'REVISION_MANUAL' && respaldo ? { respaldo } : {}) };
  } finally {
    if (candidato && path.dirname(candidato) === root && path.basename(candidato).startsWith('.env.rotation-')) {
      try { fs.unlinkSync(candidato); } catch {}
    }
    if (cliente) await cliente.close();
    await Promise.all(bloqueos.map(s => new Promise(resolve => s.close(resolve))));
    // Mantener la copia DPAPI por recuperación; nunca contiene texto legible.
  }
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !args.includes('--aplicar') || !args.includes('--confirmar=ROTAR_CREDENCIALES_LOCALES')) {
    console.log(JSON.stringify({ fase: 'ERROR', recuperacion: 'SIN_CAMBIOS' })); process.exitCode = 1;
  } else {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', fragmento => { input += fragmento; if (input.length > 2048) { input = ''; process.stdin.destroy(); } });
    process.stdin.on('end', async () => {
      try {
        const password = JSON.parse(input.trim()).password;
        input = '';
        const resultado = await rotar(password);
        console.log(JSON.stringify(resultado));
        if (resultado.fase !== 'COMPLETADO') process.exitCode = 1;
      } catch { console.log(JSON.stringify({ fase: 'ERROR', SESSION_SECRET: 'ERROR', SUPERADMIN_PASSWORD: 'ERROR', GMAIL_TOKEN_ENCRYPTION_KEY: 'ERROR', recuperacion: 'SIN_CAMBIOS' })); process.exitCode = 1; }
    });
  }
}
module.exports = { validarPassword, prepararArchivo, formatoClave, contarCredenciales };
