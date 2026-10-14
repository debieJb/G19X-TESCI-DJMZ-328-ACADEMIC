const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const ErrorGmail = require('./ErrorGmail');

const obtenerClave = () => {
  const valor = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) throw new ErrorGmail('CONFIGURACION');
  const clave = Buffer.from(valor, 'base64');
  if (clave.length !== 32 || clave.toString('base64') !== valor) throw new ErrorGmail('CONFIGURACION');
  return clave;
};
const contexto = (empresa, proposito) => {
  if (typeof empresa !== 'string' || !/^[a-f\d]{24}$/i.test(empresa)
    || typeof proposito !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(proposito)) throw new ErrorGmail('CIFRADO');
  return Buffer.from(`gmail:v1:${empresa.toLowerCase()}:${proposito}`);
};
const cifrar = (valor, empresa, proposito) => {
  const clave = obtenerClave();
  try {
    if (typeof valor !== 'string' || !valor || valor.length > 16384) throw new Error();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', clave, iv);
    cipher.setAAD(contexto(empresa, proposito));
    const datos = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), datos.toString('base64url')].join('.');
  } catch { throw new ErrorGmail('CIFRADO'); }
};
const descifrar = (valor, empresa, proposito) => {
  const clave = obtenerClave();
  try {
    if (typeof valor !== 'string' || valor.length > 24000) throw new Error();
    const partes = valor.split('.');
    if (partes.length !== 4 || partes[0] !== 'v1' || !partes.slice(1).every(p => /^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
    const [iv, tag, datos] = partes.slice(1).map(p => Buffer.from(p, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', clave, iv);
    cipher.setAAD(contexto(empresa, proposito)); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(datos), cipher.final()]).toString('utf8');
  } catch { throw new ErrorGmail('CIFRADO'); }
};
module.exports = { obtenerClave, cifrar, descifrar };
