// Herramienta de mantenimiento preparada; nunca ejecutarla en modo aplicar
// sin aprobación del propietario. El modo predeterminado es solo lectura.
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');

const validarDestino = uri => {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'mongodb:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.pathname !== '/marketing_automation') throw new Error();
  } catch { throw new Error('DESTINO_INVALIDO'); }
};
const actualizarPasswordSuperadmin = async (env = process.env, { aplicar = false, confirmacion = '', hashEsperado } = {}) => {
  validarDestino(env.MONGODB_URI);
  if (typeof env.SUPERADMIN_EMAIL !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPERADMIN_EMAIL.trim())) {
    throw new Error('USUARIO_INVALIDO');
  }
  if (aplicar && confirmacion !== 'CAMBIAR_PASSWORD_SUPERADMIN') throw new Error('CONFIRMACION_REQUERIDA');
  if (aplicar && (typeof env.SUPERADMIN_PASSWORD_NUEVA !== 'string' || !env.SUPERADMIN_PASSWORD_NUEVA.trim()
    || Buffer.byteLength(env.SUPERADMIN_PASSWORD_NUEVA, 'utf8') < 16
    || Buffer.byteLength(env.SUPERADMIN_PASSWORD_NUEVA, 'utf8') > 72)) throw new Error('PASSWORD_NUEVA_INVALIDA');
  try {
    // No usar conectarDatabase: sus opciones normales pueden inicializar índices.
    await mongoose.connect(env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 4000 });
    const usuario = await Usuario.findOne({ email: env.SUPERADMIN_EMAIL.trim().toLowerCase(), rol: 'superadmin' }).select('+password');
    if (!usuario) throw new Error('SUPERADMIN_NO_ENCONTRADO');
    if (hashEsperado !== undefined && usuario.password !== hashEsperado) throw new Error('PASSWORD_CAMBIO_CONCURRENTE');
    if (!aplicar) return { superadmin: 'CONFIGURADO', cambioPassword: 'PENDIENTE' };
    if (await usuario.compararPassword(env.SUPERADMIN_PASSWORD_NUEVA)) throw new Error('PASSWORD_SIN_CAMBIO');
    const hashAnterior = usuario.password;
    // Compare-and-save: no sobrescribir una contraseña o un rol cambiado mientras
    // la herramienta esperaba. save() ejecuta el hash del modelo; no hay upsert.
    usuario.$where = { ...usuario.$where, rol: 'superadmin', password: hashAnterior };
    usuario.password = env.SUPERADMIN_PASSWORD_NUEVA;
    await usuario.save();
    return { superadmin: 'CONFIGURADO', cambioPassword: 'CONFIGURADO' };
  } finally { await mongoose.disconnect(); }
};

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const argumentos = process.argv.slice(2);
  const permitidos = ['--verificar', '--aplicar', '--confirmar=CAMBIAR_PASSWORD_SUPERADMIN'];
  if (argumentos.some(arg => !permitidos.includes(arg)) || (argumentos.includes('--verificar') && argumentos.includes('--aplicar'))) {
    console.error(JSON.stringify({ cambioPassword: 'ERROR' })); process.exitCode = 1;
  } else {
    actualizarPasswordSuperadmin(process.env, { aplicar: argumentos.includes('--aplicar'),
      confirmacion: argumentos.includes('--confirmar=CAMBIAR_PASSWORD_SUPERADMIN') ? 'CAMBIAR_PASSWORD_SUPERADMIN' : '' })
      .then(resultado => console.log(JSON.stringify(resultado)))
      .catch(() => { console.error(JSON.stringify({ cambioPassword: 'ERROR' })); process.exitCode = 1; });
  }
}
module.exports = { validarDestino, actualizarPasswordSuperadmin };
