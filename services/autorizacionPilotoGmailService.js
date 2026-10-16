const { createHash } = require('node:crypto');
const DURACION_MS = 10 * 60 * 1000;
const hashConsentimiento = contacto => createHash('sha256').update(JSON.stringify(contacto.consentimientoMarketing)).digest('hex');
const seleccionUnica = campana => {
  const d = campana?.destinatarios;
  if (d?.tipo !== 'contactos' || !Array.isArray(d.contactos) || d.contactos.length !== 1
    || (d.etiquetas?.length || 0) !== 0) throw Object.assign(Error('PILOTO_REQUIERE_UN_CONTACTO'), { codigo: 'PILOTO_REQUIERE_UN_CONTACTO' });
  return String(d.contactos[0]);
};
module.exports = { DURACION_MS, hashConsentimiento, seleccionUnica };
