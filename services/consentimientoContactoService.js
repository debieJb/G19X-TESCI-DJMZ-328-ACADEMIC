const { createHash } = require('node:crypto');
const { emailNormalizado, emailValido } = require('./elegibilidadEmailService');
const huellaEmail = email => createHash('sha256').update(emailNormalizado(email)).digest('hex');
const validarCambio = (entrada, ahora = new Date()) => {
  const accion = entrada.accionConsentimiento ?? 'conservar';
  if (!['conservar', 'otorgar', 'revocar'].includes(accion)) throw Error('CONSENTIMIENTO_INVALIDO');
  if (accion === 'conservar') return { accion };
  const fuente = entrada.fuenteConsentimiento;
  if (typeof fuente !== 'string' || !fuente.trim() || fuente.trim().length > 300 || /[\r\n\x00-\x1f]/.test(fuente)
    || entrada.confirmarConsentimiento !== 'true') throw Error('EVIDENCIA_CONSENTIMIENTO_REQUERIDA');
  const fecha = accion === 'revocar' ? ahora : new Date(entrada.fechaConsentimiento);
  if (accion === 'otorgar' && (typeof entrada.fechaConsentimiento !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(entrada.fechaConsentimiento))) throw Error('FECHA_CONSENTIMIENTO_INVALIDA');
  if (!Number.isFinite(+fecha) || +fecha > +ahora) throw Error('FECHA_CONSENTIMIENTO_INVALIDA');
  return { accion, fuente: fuente.trim(), fecha };
};
const aplicarCambio = (contacto, cambio, { actorId, email, ahora = new Date() }) => {
  const cambioEmail = emailNormalizado(contacto.email) !== emailNormalizado(email);
  if (cambio.accion === 'conservar' && (!cambioEmail || contacto.consentimientoMarketing?.estado !== 'otorgado')) return;
  if (cambio.accion === 'otorgar' && !emailValido(emailNormalizado(email))) throw Error('EMAIL_CONSENTIMIENTO_INVALIDO');
  const automatico = cambio.accion === 'conservar';
  const registro = { estado: cambio.accion === 'otorgar' ? 'otorgado' : 'revocado',
    fecha: automatico ? ahora : cambio.fecha, fuente: automatico ? 'Revocacion automatica por cambio de email' : cambio.fuente,
    registradoPor: actorId, registradoEn: ahora, emailHash: huellaEmail(email) };
  contacto.consentimientoMarketing = registro;
  contacto.historialConsentimiento.push(registro);
};
module.exports = { validarCambio, aplicarCambio, huellaEmail };
