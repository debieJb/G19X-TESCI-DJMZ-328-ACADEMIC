const Contacto = require('../models/Contacto');
const Conexion = require('../models/ConexionGmail');
const Empresa = require('../models/Empresa');
const google = require('./googleOAuthClienteService');
const { normalizarEmpresaId } = require('./accesoEmpresaService');
const { consentimiento } = require('./elegibilidadEmailService');
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
    envioDisponible: false, motivo: 'El envío real por Gmail requiere validación y autorización de un piloto independiente. Guardar esta preparación no envía ni programa mensajes.' };
};
module.exports = { opciones, evaluar, consentimiento };
