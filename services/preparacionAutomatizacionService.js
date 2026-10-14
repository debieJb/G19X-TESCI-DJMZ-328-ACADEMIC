const Contacto = require('../models/Contacto');
const Conexion = require('../models/ConexionGmail');
const Empresa = require('../models/Empresa');
const google = require('./googleOAuthClienteService');
const { normalizarEmpresaId } = require('./accesoEmpresaService');
const consentimiento = contacto => contacto.activo === true && contacto.canales?.email === true
  && typeof contacto.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto.email)
  && contacto.consentimientoMarketing?.estado === 'otorgado'
  && contacto.consentimientoMarketing.fecha instanceof Date && Number.isFinite(contacto.consentimientoMarketing.fecha.getTime())
  && contacto.consentimientoMarketing.fecha.getTime() <= Date.now()
  && typeof contacto.consentimientoMarketing.fuente === 'string' && !!contacto.consentimientoMarketing.fuente.trim();
const opciones = async empresa => {
  const docs = await Contacto.find({ empresa, activo: true, 'canales.email': true, 'consentimientoMarketing.estado': 'otorgado' })
    .select('empresa nombre email activo canales.email consentimientoMarketing').sort({ _id: 1 }).lean();
  const unicos = new Map();
  for (const c of docs) if (normalizarEmpresaId(c.empresa) === empresa && consentimiento(c)) {
    const email = c.email.trim().toLowerCase(); if (!unicos.has(email)) unicos.set(email, c);
  }
  return [...unicos.values()];
};
const evaluar = async campana => {
  const empresa = normalizarEmpresaId(campana.empresa);
  const doc = await Empresa.findById(empresa).select('correoAutomatizaciones').lean();
  const conexion = await Conexion.findOne({ empresa }).select('email estado scopes').lean();
  const esperado = doc?.correoAutomatizaciones;
  return { canalValido: campana.canal === 'email', gmailConfigurado: google.estaConfigurado(),
    correoPrevisto: esperado || '', correoAutorizado: conexion?.email || '', estadoGmail: conexion?.estado || 'desconectada',
    identidadCoincide: typeof esperado === 'string' && !!esperado && conexion?.email?.toLowerCase() === esperado.toLowerCase(),
    permisoEnvio: conexion?.estado === 'conectada' && conexion.scopes?.includes(google.GMAIL_SEND) === true,
    envioDisponible: false, motivo: 'El envío empresarial mediante Gmail OAuth y n8n todavía no está integrado. Guardar esta preparación no envía ni programa mensajes.' };
};
module.exports = { opciones, evaluar, consentimiento };
