const { buscarCampana } = require('../services/accesoCampanasService');
const { normalizarEmpresaId } = require('../services/accesoEmpresaService');
const ia = require('../services/iaService');
const preparacion = require('../services/preparacionAutomatizacionService');
const cargar = async (req, res) => {
  const empresa = await ia.autorizar(res.locals.usuarioActual);
  const campana = await buscarCampana(req.params.id, res.locals.usuarioActual, 'campanas.editar');
  if (normalizarEmpresaId(campana.empresa) !== empresa || campana.estado !== 'borrador') throw Object.assign(new Error(), { status: 403 });
  return { empresa, campana };
};
const fallo = (res, error) => {
  const status = [400, 403, 404, 409, 422, 503].includes(error.status) ? error.status : 503;
  return res.status(status).render('error', { titulo: 'Automatización no disponible', mensaje: status === 422
    ? 'Revisa destinatarios autorizados, modalidad, fecha UTC futura y revisión del formulario.'
    : status === 409 ? 'La campaña cambió. Recarga la configuración antes de continuar.'
      : 'No se pudo completar esta operación. No se enviaron mensajes ni se activó un workflow.' });
};
const mostrar = async (req, res) => {
  try {
    const { empresa, campana } = await cargar(req, res);
    const contactos = await preparacion.opciones(empresa), estado = await preparacion.evaluar(campana);
    res.render('campanas/automatizacion', { titulo: 'Configurar automatización', campana, contactos, estado,
      guardado: req.query.guardado === '1' });
  } catch (error) { fallo(res, error); }
};
const guardarImagen = async (req, res) => {
  try {
    const { campana } = await cargar(req, res);
    if (!req.body || Object.keys(req.body).some(k => !['_csrf', 'imagen', 'revisionImagen'].includes(k))) throw Object.assign(new Error(), { status: 422 });
    const revision = campana.updatedAt ? campana.updatedAt.toISOString() : '0';
    if (req.body.revisionImagen !== revision) throw Object.assign(new Error(), { status: 409 });
    const imagen = require('../services/imagenCampanaService').validar(req.body.imagen);
    if (!imagen) throw Object.assign(new Error(), { status: 422 });
    campana.$where = { ...campana.$where, empresa: campana.empresa._id || campana.empresa,
      estado: 'borrador', updatedAt: campana.updatedAt || { $exists: false } };
    campana.imagenLocal = imagen;
    await campana.save();
    res.redirect(303, `/campanas/${campana._id}/automatizacion`);
  } catch (error) { if (error.name === 'DocumentNotFoundError') error.status = 409; fallo(res, error); }
};
const guardar = async (req, res) => {
  try {
    const { empresa, campana } = await cargar(req, res);
    if (Object.keys(req.body || {}).some(k => !['_csrf', 'contactos', 'modo', 'fechaProgramada', 'revision'].includes(k))) throw Object.assign(new Error(), { status: 422 });
    const { modo, fechaProgramada, revision } = req.body || {};
    const ids = typeof req.body.contactos === 'string' ? [req.body.contactos] : req.body.contactos;
    if (!['inmediato', 'programado'].includes(modo) || typeof revision !== 'string' || !/^\d{1,9}$/.test(revision)
      || !Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id))) throw Object.assign(new Error(), { status: 422 });
    const actuales = await preparacion.opciones(empresa), permitidos = new Set(actuales.map(c => String(c._id)));
    if (ids.some(id => !permitidos.has(id)) || campana.canal !== 'email' || !campana.asunto?.trim() || !campana.cuerpoTexto?.trim()) throw Object.assign(new Error(), { status: 422 });
    const previa = campana.automatizacion?.revision || 0;
    if (Number(revision) !== previa) throw Object.assign(new Error(), { status: 409 });
    let fecha;
    if (modo === 'programado') {
      if (typeof fechaProgramada !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fechaProgramada)) throw Object.assign(new Error(), { status: 422 });
      fecha = new Date(fechaProgramada + ':00.000Z');
      if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 16) !== fechaProgramada || fecha.getTime() < Date.now() + 60000) throw Object.assign(new Error(), { status: 422 });
    }
    campana.$where = { ...campana.$where, empresa: campana.empresa._id || campana.empresa,
      $or: previa ? [{ 'automatizacion.revision': previa }] : [{ 'automatizacion.revision': { $exists: false } }, { 'automatizacion.revision': 0 }] };
    campana.destinatarios = { tipo: 'contactos', contactos: [...new Set(ids)], etiquetas: [] };
    campana.versionFlujo = 2;
    campana.automatizacion = { modo, fechaProgramada: fecha, revision: previa + 1, estado: 'preparada' };
    await campana.save();
    res.redirect(303, `/campanas/${campana._id}/automatizacion?guardado=1`);
  } catch (error) { if (error.name === 'DocumentNotFoundError') error.status = 409; fallo(res, error); }
};
const confirmar = async (req, res) => {
  try {
    await cargar(req, res);
    if (req.body?.confirmacion !== 'ENVIAR') throw Object.assign(new Error(), { status: 422 });
    res.status(503).render('error', { titulo: 'Envío deshabilitado', mensaje: 'La confirmación no puede ejecutarse: Gmail OAuth empresarial, el motor de envíos y el contrato seguro con n8n todavía no están integrados. No se envió ni programó ningún mensaje.' });
  } catch (error) { fallo(res, error); }
};
const imagen = async (req, res) => {
  try {
    const { campana } = await cargar(req, res);
    const doc = await campana.constructor.findOne({ _id: campana._id, empresa: campana.empresa._id || campana.empresa }).select('+imagenLocal.datos').lean();
    if (!doc?.imagenLocal?.datos) return res.sendStatus(404);
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    const raw = doc.imagenLocal.datos;
    const bytes = Buffer.isBuffer(raw) ? raw : raw?._bsontype === 'Binary' ? raw.value() : null;
    if (!(bytes instanceof Uint8Array)) return res.sendStatus(404);
    const buffer = Buffer.from(bytes);
    const validada = require('../services/imagenCampanaService').validar('data:image/png;base64,' + buffer.toString('base64'));
    res.type('image/png').send(validada.datos);
  } catch (error) { fallo(res, error); }
};
module.exports = { mostrar, guardar, guardarImagen, confirmar, imagen };
