// Única política de marketing: habilitación técnica nunca implica consentimiento.
const emailNormalizado = valor => typeof valor === 'string' ? valor.trim().toLowerCase() : '';
const emailValido = valor => typeof valor === 'string' && valor.length <= 254
  && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(valor)
  && !valor.startsWith('.') && !valor.includes('..') && !valor.includes('.@');
const consentimiento = (contacto, ahora = new Date()) => contacto?.activo === true && contacto.canales?.email === true
  && emailValido(emailNormalizado(contacto.email)) && contacto.consentimientoMarketing?.estado === 'otorgado'
  && contacto.consentimientoMarketing.fecha instanceof Date && Number.isFinite(+contacto.consentimientoMarketing.fecha)
  && +contacto.consentimientoMarketing.fecha <= +ahora
  && typeof contacto.consentimientoMarketing.fuente === 'string' && !!contacto.consentimientoMarketing.fuente.trim()
  && (!contacto.consentimientoMarketing.emailHash || contacto.consentimientoMarketing.emailHash === require('node:crypto').createHash('sha256').update(emailNormalizado(contacto.email)).digest('hex'));
module.exports = { consentimiento, emailValido, emailNormalizado };
