'use strict';
const elegibilidad = require('./elegibilidadEmailService');
const { huellaEmail } = require('./consentimientoContactoService');
const huellaDestinatarios = contactos => require('node:crypto').createHash('sha256').update(JSON.stringify(contactos.map(c => ({
  id: String(c._id), email: elegibilidad.emailNormalizado(c.email), consentimiento: require('./autorizacionPilotoGmailService').hashConsentimiento(c)
})).sort((a, b) => a.id.localeCompare(b.id)))).digest('hex');
const motivo = c => {
  if (!c) return 'Contacto no disponible para esta empresa';
  if (c.activo !== true) return 'Contacto inactivo';
  if (!elegibilidad.emailValido(c.email)) return 'Correo no válido';
  if (c.canales?.email !== true) return 'Canal email deshabilitado';
  if (!elegibilidad.consentimiento(c)) return 'Consentimiento de marketing ausente, revocado o no vigente';
  const a = c.consentimientoMarketing;
  if (!/^[a-f0-9]{24}$/i.test(String(a.registradoPor || '')) || !(a.registradoEn instanceof Date) || !Number.isFinite(+a.registradoEn) || +a.registradoEn > Date.now()
    || a.emailHash !== huellaEmail(c.email)) return 'Consentimiento sin evidencia documentada para este correo';
  return '';
};
const evaluarContactos = (campana, contactos) => {
  const propios = contactos.filter(c => String(c.empresa) === String(campana.empresa?._id || campana.empresa));
  const opciones = propios.filter(c => !motivo(c));
  const d = campana.destinatarios;
  const ids = d?.tipo === 'contactos' ? [...new Set((d.contactos || []).map(String))]
    : propios.filter(c => d?.tipo === 'todos' || d?.tipo === 'etiquetas' && c.etiquetas?.some(e => d.etiquetas.includes(e))).map(c => String(c._id));
  const validos = [], excluidos = [], emails = new Set();
  for (const id of ids) {
    const c = propios.find(c => String(c._id) === id), razon = motivo(c);
    if (razon) excluidos.push({ nombre: c?.nombre || 'Contacto no disponible', motivo: razon });
    else if (emails.has(elegibilidad.emailNormalizado(c.email))) excluidos.push({ nombre: c.nombre, motivo: 'Correo duplicado en la selección; recibirá un solo mensaje' });
    else { emails.add(elegibilidad.emailNormalizado(c.email)); validos.push(c); }
  }
  return { opciones, validos, excluidos };
};
const estadoVisible = (campana, envios = []) => {
  if (envios.some(e => e.estado === 'incierto')) return 'Resultado incierto';
  if (envios.some(e => ['reservado', 'enviando', 'pendiente'].includes(e.estado))) return 'Enviando';
  if (envios.length && envios.every(e => e.estado === 'aceptado')) return 'Enviada a Gmail';
  if (envios.length) return 'Error';
  if (campana.automatizacion?.modo === 'programado' || campana.estado === 'programada') return 'Programada';
  return campana.estado === 'activa' && campana.automatizacion?.estado === 'preparada' ? 'Lista para enviar' : 'Borrador';
};
module.exports = { huellaDestinatarios, motivo, evaluarContactos, estadoVisible };
