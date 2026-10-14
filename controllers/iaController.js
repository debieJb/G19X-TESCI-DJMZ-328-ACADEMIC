const { randomBytes, timingSafeEqual, createHash } = require('node:crypto');
const service = require('../services/iaService');
const { opciones, texto } = require('../services/ia/contratoIA');
const ErrorIA = require('../services/ia/ErrorIA');
const campanas = require('./campanaController');
const Campana = require('../models/Campana');
const imagen = require('../services/imagenCampanaService');
const libre = require('../services/ia/instruccionesIA');
const render = (res, datos = {}, mensaje = '', status = 200) => res.status(status).render('empresa/asistenteIA', {
  titulo: 'Asistente de campañas · PluriOne', anio: new Date().getFullYear(), opciones, datos, mensaje, disponible: service.disponible()
});
const errorSeguro = error => error instanceof ErrorIA ? error : new ErrorIA('PROVEEDOR');
const campos = (body, admitidos) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => ![...admitidos, '_csrf'].includes(k))) throw new ErrorIA('ENTRADA');
  return Object.fromEntries(admitidos.filter(k => Object.hasOwn(body, k)).map(k => [k, body[k]]));
};
const mostrar = (req, res) => render(res);
const camposResultado = ['ticket', 'nombre', 'objetivo', 'asunto', 'mensaje', 'llamadaAccion', 'segmentacion', 'cambios', 'confirmacionPrivacidad'];
const propuestaValida = async (req, res, ticket) => {
  const empresa = await service.autorizar(res.locals.usuarioActual), propuesta = req.session.iaPropuesta;
  if (!propuesta || propuesta.empresa !== empresa || propuesta.usuario !== String(res.locals.usuarioActual._id)
    || propuesta.expiraEn <= Date.now() || typeof ticket !== 'string' || ticket.length !== 43
    || !/^[A-Za-z0-9_-]{43}$/.test(ticket) || !timingSafeEqual(Buffer.from(ticket), Buffer.from(propuesta.ticket))) throw new ErrorIA('PROPUESTA');
  return propuesta;
};
const presentar = (req, res, propuesta, mensaje = '', status = 200) => res.status(status).render('empresa/resultadoIA', {
  titulo: 'Revisar propuesta de IA', anio: new Date().getFullYear(), resultado: propuesta.resultado,
  datos: propuesta.datos, tieneImagen: !!propuesta.imagen, ticket: propuesta.ticket, mensaje, disponible: service.disponible()
});
const guardarPropuesta = (req, res, resultado, datos, imagenLocal) => {
  const propuesta = { ticket: randomBytes(32).toString('base64url'), empresa: resultado.empresa,
    usuario: String(res.locals.usuarioActual._id), expiraEn: Date.now() + 30 * 60000,
    resultado: { ...resultado, nombre: datos.nombreCampana }, datos, imagen: imagenLocal };
  req.session.iaPropuesta = propuesta; return propuesta;
};
const generar = async (req, res) => {
  let datosFormulario = {};
  try {
    const entrada = campos(req.body, ['nombreCampana', 'imagen', 'producto', 'instrucciones', 'indicacionesAdicionales', 'textoProtegido', 'confirmacionPrivacidad', ...Object.keys(opciones)]);
    datosFormulario = Object.fromEntries(Object.entries(entrada).filter(([k, v]) => k !== 'imagen' && k !== 'confirmacionPrivacidad' && typeof v === 'string' && v.length <= 4000));
    imagen.validar(entrada.imagen);
    const nombreCampana = texto(entrada.nombreCampana || entrada.producto || 'Nueva campaña con IA', 100);
    if (/[\r\n]/.test(nombreCampana)) throw new ErrorIA('ENTRADA');
    const { imagen: archivo, nombreCampana: ignorado, ...contexto } = entrada;
    const resultado = await service.generar(res.locals.usuarioActual, contexto);
    presentar(req, res, guardarPropuesta(req, res, resultado, { ...contexto, nombreCampana }, archivo));
  } catch (error) { const seguro = errorSeguro(error); render(res, datosFormulario, seguro.message, seguro.status); }
};
const regenerar = async (req, res) => {
  let previa;
  try {
    const entrada = campos(req.body, camposResultado);
    previa = await propuestaValida(req, res, entrada.ticket);
    const nombreCampana = texto(entrada.nombre === undefined ? previa.datos.nombreCampana : entrada.nombre, 100);
    if (/[\r\n]/.test(nombreCampana)) throw new ErrorIA('ENTRADA');
    const { nombreCampana: anterior, ...contexto } = previa.datos;
    let revision;
    if (contexto.instrucciones !== undefined) {
      if (entrada.confirmacionPrivacidad !== 'CONFIRMO') throw new ErrorIA('PRIVACIDAD');
      const propuestaActual = {
        asunto: entrada.asunto === undefined ? previa.resultado.asunto : entrada.asunto,
        mensaje: entrada.mensaje === undefined ? previa.resultado.mensaje : entrada.mensaje,
        llamadaAccion: entrada.llamadaAccion === undefined ? previa.resultado.llamadaAccion : entrada.llamadaAccion,
        segmentacion: entrada.segmentacion === undefined ? previa.resultado.segmentacion : typeof entrada.segmentacion === 'string' ? entrada.segmentacion.split(/\r?\n/).filter(Boolean) : entrada.segmentacion
      };
      revision = { modo: req.path === '/revisar' ? 'revision' : 'variante', propuestaActual,
        cambios: libre.seguro(entrada.cambios, 1500, req.path === '/revisar') };
    } else if (req.path === '/revisar') throw new ErrorIA('ENTRADA');
    const resultado = await service.generar(res.locals.usuarioActual, contexto, revision);
    presentar(req, res, guardarPropuesta(req, res, resultado, { ...contexto, nombreCampana }, previa.imagen));
  } catch (error) {
    const seguro = errorSeguro(error);
    if (previa) return presentar(req, res, previa, seguro.message, seguro.status);
    render(res, {}, seguro.message, seguro.status);
  }
};
const guardar = async (req, res) => {
  let propuesta;
  try {
    const datos = campos(req.body, camposResultado);
    propuesta = await propuestaValida(req, res, datos.ticket);
    const nombre = texto(datos.nombre, 100), objetivo = texto(datos.objetivo, 500), asunto = texto(datos.asunto, 220);
    if (/[\r\n]/.test(nombre) || /[\r\n]/.test(asunto)) throw new ErrorIA('ENTRADA');
    const mensaje = texto(datos.mensaje, 5000), llamadaAccion = texto(datos.llamadaAccion, 300);
    libre.conservar({ mensaje }, propuesta.datos.textoProtegido);
    if (datos.segmentacion !== undefined && (typeof datos.segmentacion !== 'string' || datos.segmentacion.length > 1500)) throw new ErrorIA('ENTRADA');
    const segmentacion = (datos.segmentacion || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (segmentacion.length > 5 || segmentacion.some(s => s.length > 300)) throw new ErrorIA('ENTRADA');
    await Campana.init();
    const indices = await Campana.collection.listIndexes().toArray();
    if (!indices.some(i => i.unique && i.key.empresa === 1 && i.key['asistenciaIA.aprobacionHash'] === 1
      && i.partialFilterExpression?.['asistenciaIA.aprobacionHash']?.$type === 'string')) throw new ErrorIA('PROVEEDOR');
    // No persistir instrucciones libres, confirmaciones o historial en metadatos.
    const selecciones = Object.fromEntries(['producto', ...Object.keys(opciones)].filter(k => propuesta.datos[k]).map(k => [k, propuesta.datos[k]]));
    req.borradorIAValidado = { asistenciaIA: { ...selecciones, proveedor: propuesta.resultado.proveedor, llamadaAccion, segmentacion,
      aprobacionHash: createHash('sha256').update(datos.ticket).digest('hex') }, imagenLocal: imagen.validar(propuesta.imagen) };
    delete req.session.iaPropuesta;
    req.body = { nombre, objetivo, asunto, cuerpoTexto: `${mensaje}\n\n${llamadaAccion}`, canal: 'email', estado: 'borrador' };
    // Reutilizar listas blancas, autor/empresa, validación y persistencia actuales.
    return await campanas.crearCampana(req, res);
  } catch (error) {
    const seguro = errorSeguro(error);
    if (propuesta?.datos.instrucciones !== undefined && req.session.iaPropuesta) return presentar(req, res, propuesta, seguro.message, seguro.status);
    res.status(seguro.status).render('error', { titulo: 'No se pudo guardar la propuesta', mensaje: seguro.message });
  }
};
module.exports = { mostrar, generar, regenerar, guardar };
