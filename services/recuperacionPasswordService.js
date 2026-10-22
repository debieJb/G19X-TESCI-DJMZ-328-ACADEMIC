'use strict';
const { createHash, randomBytes } = require('node:crypto');
const { incrementar } = require('./limitesRecuperacionService');
const { validarPassword, opcionesTransaccion } = require('./registroEmpresarialService');
const hash = valor => createHash('sha256').update(valor).digest('hex');
const DURACION_MS = 15 * 60000;
const fallo = codigo => Object.assign(Error(codigo), { codigo });
const codigosCorreo = ['REAUTORIZAR_TRANSACCIONAL', 'SMTP_RECHAZADO', 'SMTP_CUOTA', 'CONFIGURACION_SMTP', 'ORIGEN_SMTP_INVALIDO',
  'CORREO_DESHABILITADO', 'LIMITES_TRABAJADOR_INVALIDOS', 'DESPACHO_NO_DISPONIBLE', 'ENTREGA_CANCELADA', 'ENTREGA_INCIERTA', 'MENSAJE_SMTP_INVALIDO', 'MENSAJE_INVALIDO', 'CUOTA_ENVIO_AGOTADA'];
const codigoSeguro = e => codigosCorreo.includes(e?.codigo || e?.message) ? (e.codigo || e.message) : 'DESPACHO_NO_DISPONIBLE';
const normalizarCorreo = valor => {
  if (typeof valor !== 'string') throw fallo('DATOS_INVALIDOS');
  const correo = valor.trim().toLowerCase();
  if (correo.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(correo)) throw fallo('DATOS_INVALIDOS');
  return correo;
};
const analizarToken = token => {
  if (typeof token !== 'string' || !/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token)) throw fallo('ENLACE_INVALIDO');
  const [usuario, secreto] = token.split('.');
  if (Buffer.from(secreto, 'base64url').toString('base64url') !== secreto) throw fallo('ENLACE_INVALIDO');
  return { usuario, tokenHash: hash(token) };
};
const acceso = { $or: [{ estadoAcceso: 'activo' }, { estadoAcceso: { $exists: false } }] };
const versionFiltro = version => version === 0
  ? { $or: [{ versionSesion: 0 }, { versionSesion: { $exists: false } }] } : { versionSesion: version };
const crearServicio = ({ conexion = require('mongoose').connection,
  correo = require('./correoTransaccionalService').predeterminado, reloj = () => new Date(),
  limitesEnvio = { minuto: 10, dia: 100 }, diagnostico = () => {} } = {}) => {
  const Usuario = conexion.models?.Usuario || require('../models/Usuario');
  const Limite = conexion.models?.LimiteRegistro || require('../models/LimiteRegistro');
  for (const [k, max] of [['minuto', 100], ['dia', 1000]]) {
    if (!Number.isInteger(limitesEnvio[k]) || limitesEnvio[k] < 1 || limitesEnvio[k] > max) throw fallo('LIMITES_ENVIO_INVALIDOS');
  }
  const solicitar = async valor => {
    const email = normalizarCorreo(valor), ahora = reloj();
    const solicitudHash = hash(randomBytes(32));
    // Una petición simultánea/repetida no sustituye una tarea reclamada ni su enlace.
    const doc = await Usuario.findOneAndUpdate({ email, ...acceso, $and: [
      { $or: [{ 'recuperacion.proximoEn': { $exists: false } }, { 'recuperacion.proximoEn': { $lte: ahora } }] },
      { $or: [{ 'recuperacion.estado': { $ne: 'procesando' } }, { 'recuperacion.entregaHasta': { $lte: ahora } }] }
    ] }, { $set: { recuperacion: { solicitudHash, estado: 'pendiente', solicitadaEn: ahora, proximoEn: new Date(+ahora + 60000) } } }, { new: true }).select('_id');
    return doc ? { usuarioId: String(doc._id), solicitudHash } : null;
  };
  const recuperarInciertas = async () => Usuario.updateMany({ 'recuperacion.estado': 'procesando', 'recuperacion.entregaHasta': { $lte: reloj() } },
    { $set: { 'recuperacion.estado': 'incierta', 'recuperacion.correoError': 'ENTREGA_INCIERTA' }, $unset: { 'recuperacion.entregaHash': 1, 'recuperacion.entregaHasta': 1 } });
  const registrarBloqueo = async ({ usuarioId, solicitudHash }, error) => {
    if (!/^[a-f0-9]{24}$/.test(usuarioId || '') || !/^[a-f0-9]{64}$/.test(solicitudHash || '')) throw fallo('DATOS_INVALIDOS');
    await Usuario.updateOne({ _id: usuarioId, 'recuperacion.solicitudHash': solicitudHash, 'recuperacion.estado': 'pendiente' },
      { $set: { 'recuperacion.correoError': codigoSeguro(error) } });
  };
  const despachar = async ({ usuarioId, solicitudHash } = {}) => {
    if (!correo.disponible || typeof correo.enviarRecuperacion !== 'function') {
      if (usuarioId && solicitudHash) await registrarBloqueo({ usuarioId, solicitudHash }, { codigo: 'CORREO_DESHABILITADO' });
      return { estado: 'deshabilitado' };
    }
    const ahora = reloj(), secreto = randomBytes(32).toString('base64url'), entregaHash = hash(randomBytes(32));
    let doc, token;
    try {
      doc = await conexion.transaction(async session => {
        const candidato = await Usuario.findOne({ ...(usuarioId ? { _id: usuarioId } : {}), ...acceso,
          'recuperacion.estado': 'pendiente', 'recuperacion.solicitadaEn': { $gt: new Date(+ahora - DURACION_MS) },
          ...(solicitudHash ? { 'recuperacion.solicitudHash': solicitudHash } : {}) })
          .select('email versionSesion +recuperacion').session(session);
        if (!candidato) return null;
        const version = candidato.versionSesion ?? 0;
        if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) throw fallo('VERSION_INVALIDA');
        token = `${candidato._id}.${secreto}`;
        const tomado = await Usuario.findOneAndUpdate({ _id: candidato._id, email: candidato.email, ...acceso,
          $and: [versionFiltro(version)], 'recuperacion.estado': 'pendiente', 'recuperacion.solicitudHash': candidato.recuperacion.solicitudHash },
          { $set: { 'recuperacion.estado': 'procesando', 'recuperacion.tokenHash': hash(token), 'recuperacion.expiraEn': new Date(+ahora + DURACION_MS),
            'recuperacion.entregaHash': entregaHash, 'recuperacion.entregaHasta': new Date(+ahora + 120000),
            'recuperacion.versionSesion': version, 'recuperacion.correo': candidato.email },
            $unset: { 'recuperacion.correoError': 1, 'recuperacion.faseSmtp': 1, 'recuperacion.respuestaSmtp': 1, 'recuperacion.estadoSmtp': 1 } }, { new: true, session }).select('email');
        if (!tomado) return null;
        // Mismas claves y cuotas que la cola de verificación: no ampliar el cupo del remitente.
        for (const [periodo, maximo] of [[60000, limitesEnvio.minuto], [86400000, limitesEnvio.dia]]) {
          await incrementar({ modelo: Limite, clave: `gmail-transaccional:${periodo}`, ventanaMs: periodo, maximo, ahora: +ahora, session, codigo: 'CUOTA_ENVIO_AGOTADA' });
        }
        return tomado;
      }, opcionesTransaccion);
    } catch (e) {
      if (e.codigo === 'CUOTA_ENVIO_AGOTADA' || e.code === 11000) {
        if (e.codigo === 'CUOTA_ENVIO_AGOTADA' && usuarioId && solicitudHash) await registrarBloqueo({ usuarioId, solicitudHash }, e);
        return { estado: 'limitada' };
      }
      throw e;
    }
    if (!doc) return { estado: 'sin_trabajo' };
    let estado = 'incierta', proveedorMensajeId, errorCorreo = { codigo: 'ENTREGA_INCIERTA' };
    try {
      const resultado = await correo.enviarRecuperacion({ correo: doc.email, token });
      if (resultado?.aceptado === true && /^[A-Za-z0-9_-]{1,128}$/.test(resultado.mensajeId || '')) {
        estado = 'enviada'; proveedorMensajeId = resultado.mensajeId;
      }
    } catch (e) {
      errorCorreo = e;
      estado = e.definitivo === true ? 'fallida' : 'incierta';
      if (e.requiereAutorizacion === true) diagnostico('REAUTORIZAR_TRANSACCIONAL');
    }
    // Una entrega incierta no se reintenta. El token puede haber llegado al buzón.
    const detalle = require('./smtpTransaccionalService').detalleSeguro(errorCorreo);
    await Usuario.updateOne({ _id: doc._id, 'recuperacion.entregaHash': entregaHash, 'recuperacion.estado': 'procesando' },
      { $set: { 'recuperacion.estado': estado, ...(proveedorMensajeId ? { 'recuperacion.proveedorMensajeId': proveedorMensajeId }
        : { 'recuperacion.correoError': codigoSeguro(errorCorreo), ...Object.fromEntries(Object.entries(detalle).map(([k, v]) => ['recuperacion.' + k, v])) }) },
        $unset: { 'recuperacion.entregaHash': 1, 'recuperacion.entregaHasta': 1 } });
    return { estado, ...(estado !== 'enviada' ? { codigo: codigoSeguro(errorCorreo), ...detalle } : {}) };
  };
  const restablecer = async ({ token, credencial, password, confirmacionPassword }) => {
    validarPassword(password);
    if (password !== confirmacionPassword) throw fallo('PASSWORD_NO_COINCIDE');
    const { usuario, tokenHash } = credencial || analizarToken(token), ahora = reloj();
    if (!/^[a-f0-9]{24}$/.test(usuario || '') || !/^[a-f0-9]{64}$/.test(tokenHash || '')) throw fallo('ENLACE_INVALIDO');
    const doc = await Usuario.findById(usuario).select('+password +recuperacion');
    const r = doc?.recuperacion, version = doc?.versionSesion ?? 0;
    if (!doc || !r || r.tokenHash !== tokenHash || !(r.expiraEn instanceof Date) || +r.expiraEn <= +ahora
      || !['procesando', 'enviada', 'incierta'].includes(r.estado) || r.correo !== doc.email
      || !Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER || version !== r.versionSesion
      || (doc.estadoAcceso !== undefined && doc.estadoAcceso !== 'activo')) throw fallo('ENLACE_INVALIDO');
    // El único write guarda bcrypt, consume el token e invalida sesiones de forma atómica.
    doc.$where = { ...doc.$where, email: doc.email, ...acceso, $and: [versionFiltro(version)],
      'recuperacion.tokenHash': tokenHash, 'recuperacion.expiraEn': { $gt: ahora },
      'recuperacion.estado': { $in: ['procesando', 'enviada', 'incierta'] },
      $expr: { $gt: ['$recuperacion.expiraEn', '$$NOW'] } };
    doc.password = password;
    doc.versionSesion = version + 1;
    doc.recuperacion.estado = 'consumida'; doc.recuperacion.consumidaEn = ahora;
    doc.recuperacion.tokenHash = undefined;
    doc.recuperacion.entregaHash = undefined; doc.recuperacion.entregaHasta = undefined;
    try { await doc.save(); }
    catch (e) { if (e.name === 'DocumentNotFoundError' || e.name === 'VersionError') throw fallo('ENLACE_INVALIDO'); throw e; }
  };
  return { solicitar, despachar, recuperarInciertas, registrarBloqueo, restablecer };
};
module.exports = { crearServicio, normalizarCorreo, analizarToken, DURACION_MS };
