'use strict';
// Solo inspección local: nunca renueva tokens, consulta Google o conecta MongoDB.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const gmail = require('../services/gmailTransaccionalService');
const diagnosticos = Object.freeze(['TX_CLIENT_ID_INVALIDO', 'TX_CLIENT_SECRET_INVALIDO',
  'TX_CLIENTE_EMPRESARIAL_COMPARTIDO', 'TX_REMITENTE_INVALIDO', 'TX_CALLBACK_INVALIDO',
  'TX_RUTA_CREDENCIAL_INVALIDA', 'TX_CREDENCIAL_DENTRO_REPOSITORIO', 'TX_CLAVE_CIFRADO_INVALIDA',
  'TX_CLAVE_EMPRESARIAL_COMPARTIDA', 'TX_ORIGEN_HTTPS_INVALIDO']);
const codigos = Object.freeze({ TRANSPORTES_DEBEN_PERMANECER_APAGADOS: 'TX_TRANSPORTES_ACTIVOS',
  DIRECTORIO_NO_VALIDADO: 'TX_DIRECTORIO_INVALIDO', DIRECTORIO_GIT_NO_PERMITIDO: 'TX_DIRECTORIO_GIT_NO_PERMITIDO',
  CREDENCIAL_EXISTENTE_NO_SE_SOBRESCRIBE: 'TX_CREDENCIAL_YA_EXISTE', ARCHIVO_ENLAZADO: 'TX_ARCHIVO_ENLAZADO',
  SOBRE_INVALIDO: 'TX_SOBRE_CIFRADO_INVALIDO', CREDENCIAL_TRANSACCIONAL_INVALIDA: 'TX_CREDENCIAL_INVALIDA',
  ARGUMENTOS_INVALIDOS: 'TX_ARGUMENTOS_INVALIDOS', ENOENT: 'TX_ARCHIVO_O_DIRECTORIO_AUSENTE',
  EACCES: 'TX_ACCESO_DENEGADO', EPERM: 'TX_ACCESO_DENEGADO', CONFIGURACION_TRANSACCIONAL: 'TX_CONFIGURACION_INVALIDA',
  GIT_NO_DISPONIBLE: 'TX_GIT_NO_DISPONIBLE', CONFIRMACION_REQUERIDA: 'TX_CONFIRMACION_REQUERIDA',
  EADDRINUSE: 'TX_CALLBACK_OCUPADO', ESCUCHA_NO_DISPONIBLE: 'TX_CALLBACK_NO_DISPONIBLE',
  OAUTH_CADUCADO: 'TX_OAUTH_CADUCADO', ESTADO_OAUTH_INVALIDO: 'TX_OAUTH_STATE_INVALIDO',
  OAUTH_RECHAZADO: 'TX_OAUTH_RECHAZADO', AUTORIZACION_TRANSACCIONAL_INVALIDA: 'TX_OAUTH_IDENTIDAD_O_TOKEN_INVALIDO' });
const codigoSeguro = error => {
  if (diagnosticos.includes(error?.diagnostico)) return error.diagnostico;
  for (const key of [error?.codigo, error?.code, error?.message]) if (Object.hasOwn(codigos, key)) return codigos[key];
  return 'TX_ERROR_LOCAL_NO_CLASIFICADO';
};
const codigosSeguros = Object.freeze([...new Set([...diagnosticos, ...Object.values(codigos), 'TX_ERROR_LOCAL_NO_CLASIFICADO'])]);
const comprobar = ({ env = process.env, credencial = false } = {}) => {
  if (env.TRANSACTIONAL_EMAIL_ENABLED !== 'false' || env.GMAIL_CAMPAIGNS_ENABLED === 'true'
    || env.AI_ENABLED === 'true') throw Error('TRANSPORTES_DEBEN_PERMANECER_APAGADOS');
  const config = env.TRANSACTIONAL_PUBLIC_ORIGIN ? gmail.configuracion(env) : gmail.configuracionOAuth(env);
  const dir = path.dirname(config.archivo);
  const statDir = fs.lstatSync(dir);
  if (!statDir.isDirectory() || statDir.isSymbolicLink() || fs.realpathSync(dir).toLowerCase() !== path.resolve(dir).toLowerCase()) throw Error('DIRECTORIO_NO_VALIDADO');
  const git = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (git.error?.code === 'ENOENT') throw Object.assign(Error(), { diagnostico: undefined, code: 'GIT_NO_DISPONIBLE' });
  if (git.error || (git.status !== 0 && git.status !== 128) || git.stdout.trim() === 'true') throw Error('DIRECTORIO_GIT_NO_PERMITIDO');
  if (!credencial && fs.existsSync(config.archivo)) throw Error('CREDENCIAL_EXISTENTE_NO_SE_SOBRESCRIBE');
  if (credencial) {
    const stat = fs.lstatSync(config.archivo);
    if (stat.nlink !== 1) throw Error('ARCHIVO_ENLAZADO');
    const sobre = fs.readFileSync(config.archivo, 'utf8');
    if (!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sobre)) throw Error('SOBRE_INVALIDO');
    // Descifrado únicamente en memoria y validación de identidad/cliente; sin salida del documento.
    gmail.cargarCredencial(config);
  }
  return { configuracionValida: true, fueraDeGit: true, transporteDeshabilitado: true,
    credencialCifradaValidada: credencial, origenEnviosConfigurado: !!env.TRANSACTIONAL_PUBLIC_ORIGIN };
};
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !['--configuracion', '--credencial'].includes(args[0])) throw Error('ARGUMENTOS_INVALIDOS');
    console.log(JSON.stringify(comprobar({ credencial: args[0] === '--credencial' })));
  } catch (e) { console.error(`COMPROBACION_TRANSACCIONAL_RECHAZADA codigo=${codigoSeguro(e)}`); process.exitCode = 1; }
}
module.exports = { comprobar, codigoSeguro, codigosSeguros };
