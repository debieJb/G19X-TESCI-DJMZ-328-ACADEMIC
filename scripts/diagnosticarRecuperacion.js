'use strict';
// Operaciones explícitas de diagnóstico: jamás sendMail, reclamar, actualizar o borrar.
const mongoose = require('mongoose');
const smtp = require('../services/smtpTransaccionalService');
const worker = require('../services/trabajadorVerificacionService');
const codigos = ['REAUTORIZAR_TRANSACCIONAL', 'SMTP_RECHAZADO', 'SMTP_CUOTA', 'CONFIGURACION_SMTP', 'ORIGEN_SMTP_INVALIDO',
  'CORREO_DESHABILITADO', 'LIMITES_TRABAJADOR_INVALIDOS', 'DESPACHO_NO_DISPONIBLE', 'ENTREGA_CANCELADA', 'ENTREGA_INCIERTA', 'MENSAJE_SMTP_INVALIDO', 'MENSAJE_INVALIDO', 'CUOTA_ENVIO_AGOTADA'];
const codigoSeguro = e => codigos.includes(e?.codigo || e?.message) ? (e.codigo || e.message) : 'DIAGNOSTICO_NO_DISPONIBLE';
const validar = fn => { try { fn(); return 'valida'; } catch (e) { return codigoSeguro(e); } };
const principal = async (args = process.argv.slice(2), { env = process.env, conectar = (uri, opciones) => mongoose.createConnection(uri, opciones).asPromise() } = {}) => {
  if (args.length !== 1 || !['--solo-lectura', '--comprobar-smtp'].includes(args[0])) throw Error('MODO_DIAGNOSTICO_REQUERIDO');
  if (args[0] === '--comprobar-smtp') {
    try {
      return { ok: true, ...await smtp.crearTransporte(smtp.configuracion(env, { verificar: true })).verificar() };
    } catch (e) { return { ok: false, codigo: codigoSeguro(e), ...smtp.detalleSeguro(e), correosEnviados: 0 }; }
  }
  const configuracion = { transaccionalHabilitado: env.TRANSACTIONAL_EMAIL_ENABLED === 'true',
    trabajadorHabilitado: env.TRANSACTIONAL_WORKER_ENABLED === 'true',
    smtp: validar(() => smtp.configuracion(env)), limites: validar(() => worker.configuracion(env)),
    origen: validar(() => require('../services/origenTransaccionalService').validarOrigen(env.TRANSACTIONAL_PUBLIC_ORIGIN, { entorno: env.NODE_ENV })) };
  let conexion;
  try {
    if (!env.MONGODB_URI) return { ok: false, configuracion, codigo: 'CONEXION_NO_CONFIGURADA' };
    conexion = await conectar(env.MONGODB_URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 8000 });
    const usuarios = conexion.db.collection(mongoose.pluralize()('Usuario'));
    const grupos = await usuarios.aggregate([
      { $match: { 'recuperacion.estado': { $exists: true } } },
      { $group: { _id: '$recuperacion.estado', cantidad: { $sum: 1 },
        conToken: { $sum: { $cond: [{ $eq: [{ $type: '$recuperacion.tokenHash' }, 'string'] }, 1, 0] } },
        conAceptacionProveedor: { $sum: { $cond: [{ $eq: [{ $type: '$recuperacion.proveedorMensajeId' }, 'string'] }, 1, 0] } } } }
    ], { maxTimeMS: 5000 }).toArray();
    const fallos = await usuarios.aggregate([
      { $match: { 'recuperacion.correoError': { $exists: true } } },
      { $group: { _id: { codigo: '$recuperacion.correoError', faseSmtp: '$recuperacion.faseSmtp', respuestaSmtp: '$recuperacion.respuestaSmtp', estadoSmtp: '$recuperacion.estadoSmtp' }, cantidad: { $sum: 1 } } }
    ], { maxTimeMS: 5000 }).toArray();
    return { ok: true, configuracion, recuperacion: grupos.map(g => ({
      estado: ['pendiente', 'procesando', 'fallida', 'enviada', 'incierta', 'consumida'].includes(g._id) ? g._id : 'DESCONOCIDO',
      cantidad: g.cantidad, conToken: g.conToken, conAceptacionProveedor: g.conAceptacionProveedor })),
      fallos: fallos.map(g => ({ codigo: codigoSeguro(g._id), ...smtp.detalleSeguro(g._id), cantidad: g.cantidad })) };
  } finally { if (conexion) await conexion.close(); }
};
if (require.main === module) principal().then(resultado => {
  console.log(JSON.stringify(resultado)); if (!resultado.ok) process.exitCode = 1;
}).catch(() => { console.error('DIAGNOSTICO_LECTURA_NO_DISPONIBLE'); process.exitCode = 1; });
module.exports = { principal };
