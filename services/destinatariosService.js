const Contacto = require('../models/Contacto');
const ErrorAutomatizacion = require('./ErrorAutomatizacion');
const { normalizarEmpresaId } = require('./accesoEmpresaService');
const { consentimiento, emailNormalizado } = require('./elegibilidadEmailService');
const tipos = Object.freeze({ todos: 'Todos los contactos activos', contactos: 'Contactos específicos', etiquetas: 'Por etiquetas' });
const idValido = valor => typeof valor === 'string' && /^[a-f\d]{24}$/i.test(valor);
const empresaDe = campana => normalizarEmpresaId(campana.empresa);
const emailValido = valor => typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
const aptoParaCanal = (contacto, canal) => contacto.activo === true && (canal === 'email'
  ? consentimiento(contacto)
  : ['whatsapp', 'sms'].includes(canal) ? typeof contacto.telefono === 'string' && !!contacto.telefono.trim() : true);

// Validar el cuerpo explícitamente antes de permitir casts de Mongoose.
const validarSeleccion = entrada => {
  if (entrada === undefined) return { seleccion: undefined, error: '' };
  const invalida = () => ({ seleccion: undefined, error: 'Selecciona destinatarios válidos.' });
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return invalida();
  if (entrada.tipo === '') return { seleccion: undefined, error: '' };
  if (typeof entrada.tipo !== 'string' || !Object.hasOwn(tipos, entrada.tipo)) return invalida();
  const lista = valor => valor === undefined ? [] : typeof valor === 'string' ? [valor] : valor;
  const contactos = lista(entrada.contactos), etiquetas = lista(entrada.etiquetas);
  if (!Array.isArray(contactos) || !contactos.every(idValido)
    || !Array.isArray(etiquetas) || !etiquetas.every(valor => typeof valor === 'string' && !!valor.trim())) return invalida();
  const seleccion = { tipo: entrada.tipo,
    contactos: entrada.tipo === 'contactos' ? [...new Set(contactos.map(id => id.toLowerCase()))] : [],
    etiquetas: entrada.tipo === 'etiquetas' ? [...new Set(etiquetas.map(valor => valor.trim()))] : [] };
  if (seleccion.tipo !== 'todos' && !seleccion[seleccion.tipo].length) return {
    seleccion, error: seleccion.tipo === 'contactos' ? 'Selecciona al menos un contacto.' : 'Selecciona al menos una etiqueta.'
  };
  return { seleccion, error: '' };
};

const opcionesEmpresa = async empresa => {
  if (!idValido(String(empresa || ''))) return { contactos: [], etiquetas: [] };
  const contactos = await Contacto.find({ empresa }).select('nombre email telefono etiquetas activo canales.email').sort({ nombre: 1, _id: 1 }).lean();
  return { contactos: contactos.filter(contacto => contacto.activo === true),
    etiquetas: [...new Set(contactos.flatMap(contacto => contacto.etiquetas || []))].sort() };
};
const validarPertenencia = async (seleccion, empresa) => {
  if (!seleccion) return '';
  if (!idValido(String(empresa || ''))) return 'La campaña necesita una empresa válida para seleccionar destinatarios.';
  if (seleccion.tipo === 'todos') return '';
  if (seleccion.tipo === 'contactos') {
    const contactos = await Contacto.find({ empresa, _id: { $in: seleccion.contactos } }).select('_id').lean();
    const propios = new Set(contactos.map(contacto => String(contacto._id)));
    if (seleccion.contactos.some(id => !propios.has(id))) return 'Selecciona únicamente contactos existentes de la empresa de la campaña.';
  } else {
    const contactos = await Contacto.find({ empresa, etiquetas: { $in: seleccion.etiquetas } }).select('etiquetas').lean();
    const existentes = new Set(contactos.flatMap(contacto => contacto.etiquetas || []));
    if (seleccion.etiquetas.some(etiqueta => !existentes.has(etiqueta))) return 'Selecciona únicamente etiquetas existentes de la empresa de la campaña.';
  }
  return '';
};

const resolverDestinatarios = async (campana, { modelo = Contacto, session, maximo } = {}) => {
  // No convertir campañas históricas en consultas globales ni migrarlas implícitamente.
  if (!campana.destinatarios) return [];
  const empresa = empresaDe(campana);
  if (!Array.isArray(campana.destinatarios.contactos || []) || !Array.isArray(campana.destinatarios.etiquetas || [])) {
    throw new ErrorAutomatizacion('DESTINATARIOS_INVALIDOS');
  }
  const seleccion = validarSeleccion({ tipo: campana.destinatarios.tipo,
    contactos: (campana.destinatarios.contactos || []).map(id => String(id)), etiquetas: campana.destinatarios.etiquetas || [] });
  if (!empresa || seleccion.error || !seleccion.seleccion) throw new ErrorAutomatizacion('DESTINATARIOS_INVALIDOS');
  const filtro = { empresa, activo: true };
  if (seleccion.seleccion.tipo === 'contactos') filtro._id = { $in: seleccion.seleccion.contactos };
  if (seleccion.seleccion.tipo === 'etiquetas') filtro.etiquetas = { $in: seleccion.seleccion.etiquetas };
  if (campana.canal === 'email') filtro.email = { $type: 'string' };
  if (['whatsapp', 'sms'].includes(campana.canal)) filtro.telefono = { $type: 'string' };
  let consulta = modelo.find(filtro).select('empresa nombre email telefono activo canales.email consentimientoMarketing').sort({ _id: 1 });
  if (session) consulta = consulta.session(session);
  if (maximo) consulta = consulta.limit(maximo);
  const contactos = await consulta.lean();
  if (maximo && contactos.length >= maximo) throw new ErrorAutomatizacion('DESTINATARIOS_INVALIDOS');
  const unicos = new Map();
  for (const contacto of contactos) {
    if (!aptoParaCanal(contacto, campana.canal)) continue;
    const id = String(contacto._id);
    if (normalizarEmpresaId(contacto.empresa) !== empresa) continue;
    unicos.set(campana.canal === 'email' ? emailNormalizado(contacto.email) : id, { id, nombre: contacto.nombre,
      email: emailValido(contacto.email) ? contacto.email.trim().toLowerCase() : null,
      telefono: typeof contacto.telefono === 'string' && contacto.telefono.trim() ? contacto.telefono.trim() : null });
  }
  return [...unicos.values()];
};
const resumenCampana = async campana => {
  if (campana.canal !== 'email') return null;
  if (!campana.destinatarios) return { tipo: 'Sin configurar (flujo anterior)', cantidad: null, contactos: [], etiquetas: [] };
  const destinatarios = await resolverDestinatarios(campana);
  const contactos = campana.destinatarios.tipo === 'contactos' && empresaDe(campana)
    ? await Contacto.find({ empresa: empresaDe(campana), _id: { $in: campana.destinatarios.contactos } }).select('nombre').lean() : [];
  return { tipo: tipos[campana.destinatarios.tipo], cantidad: destinatarios.length,
    contactos: contactos.map(contacto => contacto.nombre), etiquetas: campana.destinatarios.etiquetas || [] };
};
module.exports = { tipos, validarSeleccion, validarPertenencia, opcionesEmpresa, resolverDestinatarios, resumenCampana };
