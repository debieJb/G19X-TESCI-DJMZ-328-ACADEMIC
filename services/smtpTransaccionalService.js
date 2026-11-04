'use strict';
const { createHash } = require('node:crypto');
const nodemailer = require('nodemailer');
const tls = require('node:tls');
const { crearCorreoTransaccional } = require('./correoTransaccionalService');
class ErrorSmtp extends Error {
  constructor(codigo, definitivo, requiereAutorizacion) { super(codigo); Object.assign(this, { codigo, definitivo, requiereAutorizacion }); }
}
const fallo = (codigo, definitivo = true, requiereAutorizacion = false) => new ErrorSmtp(codigo, definitivo, requiereAutorizacion);
const direccion = v => typeof v === 'string' && v.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(v);
const configuracion = (env = process.env, { verificar = false } = {}) => {
  const usuario = typeof env.EMAIL_USER === 'string' ? env.EMAIL_USER.trim().toLowerCase() : '';
  const original = env.EMAIL_PASS;
  // Gmail presenta sus 16 letras en cuatro grupos; los espacios son separadores
  // visuales, no parte de la contraseña enviada por AUTH. No reescribir .env ni
  // eliminar espacios de contraseñas con otro formato.
  const password = typeof original === 'string' && /^[a-z]{4}(?: [a-z]{4}){3}$/i.test(original)
    ? original.replace(/ /g, '') : original;
  if (!direccion(usuario) || typeof password !== 'string' || !password.trim() || /[\r\n]/.test(password) || password.length > 256) throw fallo('CONFIGURACION_SMTP');
  const origen = env.TRANSACTIONAL_PUBLIC_ORIGIN;
  if (!verificar) {
    try { require('./origenTransaccionalService').validarOrigen(origen, { entorno: env.NODE_ENV }); }
    catch { throw fallo('ORIGEN_SMTP_INVALIDO'); }
  }
  return { usuario, password, origen };
};
const fases = ['AUTH', 'CONN', 'EHLO', 'HELO', 'STARTTLS', 'MAIL FROM', 'RCPT TO', 'DATA'];
const detalleSeguro = e => ({
  ...(fases.includes(e?.faseSmtp) ? { faseSmtp: e.faseSmtp } : {}),
  ...(Number.isInteger(e?.respuestaSmtp) && e.respuestaSmtp >= 400 && e.respuestaSmtp <= 599 ? { respuestaSmtp: e.respuestaSmtp } : {}),
  ...(typeof e?.estadoSmtp === 'string' && /^[245]\.\d{1,3}\.\d{1,3}$/.test(e.estadoSmtp) ? { estadoSmtp: e.estadoSmtp } : {})
});
const clasificar = e => {
  if (e instanceof ErrorSmtp) return e;
  const estado = typeof e?.response === 'string' ? e.response.match(/\b([245]\.\d{1,3}\.\d{1,3})\b/)?.[1] : undefined;
  const error = e?.code === 'EAUTH' || [530, 534, 535].includes(e?.responseCode)
    ? fallo('REAUTORIZAR_TRANSACCIONAL', true, true)
    : Number.isInteger(e?.responseCode) && e.responseCode >= 400 && e.responseCode < 600
      ? fallo([421, 452, 454].includes(e.responseCode) || estado === '5.4.5' ? 'SMTP_CUOTA' : 'SMTP_RECHAZADO')
      : fallo('ENTREGA_INCIERTA', false);
  const fase = typeof e?.command === 'string' ? fases.find(f => e.command === f || e.command.startsWith(f + ' ')) : undefined;
  return Object.assign(error, detalleSeguro({ faseSmtp: fase, respuestaSmtp: e?.responseCode, estadoSmtp: estado }));
};
const crearTransporte = config => {
  const operar = async (mensaje, signal, soloVerificar = false) => {
    if (signal?.aborted) throw fallo('ENTREGA_CANCELADA');
    let socket, cliente;
    const cancelar = () => socket?.destroy();
    signal?.addEventListener('abort', cancelar, { once: true });
    try {
      cliente = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, pool: false,
        auth: { type: 'login', user: config.usuario, pass: config.password },
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'smtp.gmail.com' },
        logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
        // Conservar el socket permite abortar también durante TLS/AUTH y evita un envío tardío.
        getSocket(options, callback) {
          if (signal?.aborted) return callback(fallo('ENTREGA_CANCELADA'));
          let entregado = false;
          const timer = setTimeout(() => socket?.destroy(Error('SMTP_TIEMPO_AGOTADO')), 8000);
          socket = tls.connect({ host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com', rejectUnauthorized: true, minVersion: 'TLSv1.2' });
          socket.once('secureConnect', () => { clearTimeout(timer); if (entregado || signal?.aborted) { socket.destroy(); return; } entregado = true; callback(null, { connection: socket, secured: true }); });
          socket.once('error', () => { clearTimeout(timer); if (!entregado) { entregado = true; callback(fallo('ENTREGA_INCIERTA', false)); } });
          socket.once('close', () => { clearTimeout(timer); if (!entregado) { entregado = true; callback(fallo('ENTREGA_CANCELADA')); } });
          if (signal?.aborted) cancelar();
        } });
      if (soloVerificar) { await cliente.verify(); return { conexionTLS: true, autenticacionSMTP: true, correosEnviados: 0 }; }
      const resultado = await cliente.sendMail({ from: config.usuario, to: mensaje.destino,
        envelope: { from: config.usuario, to: [mensaje.destino] }, subject: mensaje.asunto, text: mensaje.texto,
        messageId: `<${createHash('sha256').update(mensaje.texto).digest('hex')}@${config.usuario.split('@')[1]}>`,
        disableFileAccess: true, disableUrlAccess: true });
      if (resultado.accepted?.length !== 1 || String(resultado.accepted[0]).toLowerCase() !== mensaje.destino.toLowerCase()
        || resultado.rejected?.length || typeof resultado.messageId !== 'string' || !resultado.messageId || resultado.messageId.length > 998) throw fallo('ENTREGA_INCIERTA', false);
      return { aceptado: true, mensajeId: createHash('sha256').update(resultado.messageId).digest('hex') };
    } catch (e) { throw clasificar(e); }
    finally { signal?.removeEventListener('abort', cancelar); socket?.destroy(); try { cliente?.close(); } catch { /* Nunca exponer respuestas o credenciales al cerrar. */ } }
  };
  return { async enviar(mensaje, { signal } = {}) {
    if (mensaje?.remitente !== config.usuario || !direccion(mensaje.destino) || typeof mensaje.asunto !== 'string' || /[\r\n]/.test(mensaje.asunto)
      || typeof mensaje.texto !== 'string' || !mensaje.texto || mensaje.texto.length > 16384) throw fallo('MENSAJE_SMTP_INVALIDO');
    return operar(mensaje, signal);
  }, async verificar() {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 12000);
    try { return await operar(null, abort.signal, true); } finally { clearTimeout(timer); }
  } };
};
const crearCorreo = (env = process.env) => {
  if (env.TRANSACTIONAL_EMAIL_ENABLED !== 'true') return crearCorreoTransaccional();
  const config = configuracion(env);
  return crearCorreoTransaccional({ autorizado: true, remitente: config.usuario, origenPublico: config.origen,
    transporte: crearTransporte(config), timeoutMs: 10000, entorno: env.NODE_ENV });
};
module.exports = { configuracion, crearTransporte, crearCorreo, detalleSeguro };
