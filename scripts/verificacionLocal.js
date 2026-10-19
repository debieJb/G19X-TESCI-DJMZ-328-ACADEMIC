'use strict';
// Preparación/consulta locales. El único envío futuro reutiliza el supervisor existente.
const mongoose = require('mongoose');
const tlsLocal = require('../services/httpsPilotoLocalService');
const URI = 'mongodb://127.0.0.1:27019/marketing_piloto_mvp?replicaSet=marketingPilotLocalRs';
const validar = () => {
  const manifiesto = require('../config/manifiestoPiloto').cargarManifiesto();
  const config = tlsLocal.configuracion(process.env, manifiesto);
  const uri = process.env.PILOT_PREPARATION_PROFILE === 'gmail' ? require('./prepararEntornoGmailLocal').URI : URI;
  if (process.env.MONGODB_URI !== uri || process.env.GMAIL_CAMPAIGNS_ENABLED === 'true' || process.env.AI_ENABLED === 'true') throw Error('ENSAYO_LOCAL_NO_AUTORIZADO');
  return { manifiesto, config, uri };
};
const principal = async (args = process.argv.slice(2)) => {
  const { manifiesto, config, uri } = validar();
  if (args.length === 1 && args[0] === '--certificado') return { certificadoLocalValido: true };
  if (args.length === 1 && args[0] === '--web') return tlsLocal.comprobarOrigen(config);
  const estado = args.length === 1 && args[0] === '--estado';
  const cola = args.length === 1 && args[0] === '--cola';
  const preparar = args.length === 2 && args[0] === '--preparar' && /^[a-f0-9]{24}$/.test(args[1]);
  const envio = args.length === 3 && args[0] === '--enviar' && /^[a-f0-9]{24}$/.test(args[1]) && args[2] === '--autorizar-un-correo';
  if (!estado && !envio && !preparar && !cola) throw Error('ARGUMENTOS_INVALIDOS');
  if (process.env.TRANSACTIONAL_EMAIL_ENABLED !== (envio ? 'true' : 'false')) throw Error('BANDERA_NO_AUTORIZADA');
  await tlsLocal.comprobarOrigen(config);
  const conexion = await mongoose.createConnection(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 4000 }).asPromise();
  let solicitud;
  try {
    const infra = require('../services/infraestructuraPilotoService');
    await infra.validarDestinoPiloto(conexion, manifiesto);
    if (!(await infra.revisarIndices(conexion)).completos) throw Error('INDICES_REQUERIDOS');
    if (cola) {
      const solicitudes = await conexion.db.collection('solicitudregistros').find({},
        { projection: { _id: 1, estado: 1, correoEstado: 1, versionEnvio: 1 } }).toArray();
      return { base: manifiesto.base, envioHabilitado: false,
        elegibles: solicitudes.filter(d => d.estado === 'pendiente_correo'
          && ['pendiente', 'pendiente_configuracion'].includes(d.correoEstado)).length,
        inciertas: solicitudes.filter(d => d.correoEstado === 'incierta').length,
        procesando: solicitudes.filter(d => d.correoEstado === 'procesando').length,
        solicitudes: solicitudes.map(d => ({ solicitud: String(d._id), estado: d.estado,
          correoEstado: d.correoEstado, intentos: d.versionEnvio })) };
    }
    const filtro = envio || preparar ? { _id: new mongoose.Types.ObjectId(args[1]) } : { correo: process.env.PILOT_TEST_RECIPIENT?.trim().toLowerCase() };
    if (estado && (typeof filtro.correo !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(filtro.correo))) throw Error('BUZON_CONTROLADO_REQUERIDO');
    const doc = await conexion.db.collection('solicitudregistros').findOne(filtro, { projection: { _id: 1, estado: 1, correoEstado: 1, correo: 1, versionEnvio: 1 } });
    if (!doc) {
      if (envio || preparar) throw Error('SOLICITUD_NO_ENCONTRADA');
      return { solicitudEncontrada: false };
    }
    if (estado) return { solicitud: String(doc._id), estado: doc.estado, correoEstado: doc.correoEstado, intentos: doc.versionEnvio };
    if (typeof process.env.PILOT_TEST_RECIPIENT !== 'string'
      || doc.correo !== process.env.PILOT_TEST_RECIPIENT.trim().toLowerCase()) throw Error('BUZON_NO_COINCIDE');
    if (doc.estado !== 'pendiente_correo' || !['pendiente', 'pendiente_configuracion'].includes(doc.correoEstado)
      || doc.versionEnvio !== 0) throw Error('SOLICITUD_NO_ES_UN_ENVIO_NUEVO');
    if (preparar) return { solicitud: String(doc._id), buzonCoincide: true, intentos: 0, elegible: true, envioHabilitado: false };
    solicitud = String(doc._id);
  } finally { await conexion.close(); }
  // No se ejecuta desde la web ni desde las comprobaciones anteriores.
  const resultado = await require('../services/supervisorTrabajadorGmailService').crearSupervisor({ transaccional: true })
    .ejecutar({ comprobar: false, envioId: solicitud });
  if (resultado.codigo !== 0) throw Error('TRABAJADOR_DETENIDO_CONCILIAR_ESTADO');
  return resultado;
};
if (require.main === module) principal().then(r => console.log(JSON.stringify(r))).catch(() => {
  console.error('VERIFICACION_LOCAL_DETENIDA: revisar estado; sin reintento automatico ni salida privada.'); process.exitCode = 1;
});
module.exports = { principal, URI };
