const { emailValido } = require('./elegibilidadEmailService');
const validarContenido = ({ asunto, cuerpoTexto }) => {
  if (typeof asunto !== 'string' || !asunto.trim() || [...asunto].length > 200 || /[\x00-\x1f\x7f]/.test(asunto)
    || typeof cuerpoTexto !== 'string' || !cuerpoTexto.trim() || Buffer.byteLength(cuerpoTexto) > 256 * 1024 || cuerpoTexto.includes('\0')) throw new Error('CONTENIDO_INVALIDO');
};
const asuntoMime = asunto => {
  const partes = []; let actual = '';
  for (const caracter of asunto) {
    if (Buffer.byteLength(actual + caracter) > 30) { partes.push(actual); actual = ''; }
    actual += caracter;
  }
  if (actual) partes.push(actual);
  return partes.map(p => `=?UTF-8?B?${Buffer.from(p).toString('base64')}?=`).join('\r\n ');
};
const construir = ({ remitente, destinatario, asunto, cuerpoTexto, mensajeId, fecha = new Date() }) => {
  validarContenido({ asunto, cuerpoTexto });
  if (!emailValido(remitente) || !emailValido(destinatario) || !/^[a-f0-9]{64}@[a-z0-9.-]+$/.test(mensajeId)
    || !(fecha instanceof Date) || !Number.isFinite(+fecha)) throw new Error('CABECERA_INVALIDA');
  const cuerpo = Buffer.from(cuerpoTexto.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
  const mime = [`From: ${remitente}`, `To: ${destinatario}`, `Subject: ${asuntoMime(asunto)}`,
    `Date: ${fecha.toUTCString()}`, `Message-ID: <${mensajeId}>`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', cuerpo, ''].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
};
module.exports = { construir, validarContenido };
