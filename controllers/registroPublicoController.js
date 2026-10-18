const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const autoservicio = require('../services/autoservicioEmpresarialService');
const servicio = () => autoservicio.crearServicio({ conexion: mongoose.connection });
const guardarSesion = req => new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
const regenerar = req => new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
const mensajeGenerico = 'Solicitud recibida. Si el registro puede continuar, se procesará la verificación cuando el servicio de correo esté disponible. Esta respuesta no confirma el envío ni la entrega de un mensaje.';
const pagina = (res, paso, status = 200, mensaje = '') => res.status(status).render('registro', { paso, mensaje });
const error = (res, e, paso) => {
  if (e.codigo === 'LIMITE_SOLICITUDES') {
    res.set('Retry-After', '900');
    return pagina(res, paso, 429, 'Demasiadas solicitudes. Espera antes de intentarlo de nuevo.');
  }
  if (['DATOS_INVALIDOS', 'PASSWORD_INSEGURA'].includes(e.codigo)) return pagina(res, paso, 422,
    paso === 'administrador' ? 'Revisa los datos y confirma la contraseña: al menos 16 caracteres, cuatro diferentes y hasta 72 bytes.'
      : 'Revisa el nombre de la empresa y escribe un correo electrónico válido.');
  if (['ENLACE_INVALIDO', 'IDEMPOTENCIA_CONFLICTO'].includes(e.codigo)) return pagina(res, 'invalido', 422,
    'El enlace o la sesión no es válido, ya se utilizó o ha caducado. Solicita otro enlace.');
  // Nunca registrar e.message, cuerpo, correo, contraseñas ni queries.
  return pagina(res, paso, 503, 'El registro no está disponible temporalmente. Inténtalo más tarde.');
};
const limitar = (req, accion, maximo) => servicio().limitar({ accion, identificador: req.ip || 'sin-ip', maximo });
const mostrar = (req, res) => {
  if (!req.session.registroIdempotencia) req.session.registroIdempotencia = randomBytes(24).toString('base64url');
  res.locals.idempotencia = req.session.registroIdempotencia;
  return pagina(res, 'solicitud');
};
const solicitud = async (req, res) => {
  const inicio = Date.now();
  try {
    await limitar(req, 'solicitud', 10);
    if (Object.keys(req.body || {}).some(k => !['_csrf', 'idempotencia', 'nombreEmpresa', 'correo'].includes(k))) throw { codigo: 'DATOS_INVALIDOS' };
    const datos = autoservicio.validarSolicitud({ nombreEmpresa: req.body.nombreEmpresa, correo: req.body.correo });
    if (!req.session.registroIdempotencia || req.body.idempotencia !== req.session.registroIdempotencia) throw { codigo: 'DATOS_INVALIDOS' };
    await servicio().limitar({ accion: 'correo', identificador: datos.correo, maximo: 5, ventanaMs: 3600000 });
    try {
      await servicio().solicitar({ datos, claveIdempotencia: req.session.registroIdempotencia, ambito: req.sessionID });
    } catch (e) { if (e.codigo !== 'IDEMPOTENCIA_CONFLICTO') throw e; }
    // No hay envío síncrono; misma respuesta para correo existente, nuevo o repetido.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 250 - (Date.now() - inicio))));
    req.session.registroRecibido = true;
    return pagina(res, 'aceptada', 202, mensajeGenerico);
  } catch (e) { return error(res, e, 'solicitud'); }
};
const mostrarReenvio = (req, res) => pagina(res, 'reenvio');
const reenviar = async (req, res) => {
  const inicio = Date.now();
  try {
    await limitar(req, 'reenvio', 10);
    if (Object.keys(req.body || {}).some(k => !['_csrf', 'correo'].includes(k))) throw { codigo: 'DATOS_INVALIDOS' };
    const destino = autoservicio.validarSolicitud({ nombreEmpresa: 'Solicitud', correo: req.body.correo }).correo;
    await servicio().limitar({ accion: 'correo', identificador: destino, maximo: 5, ventanaMs: 3600000 });
    await servicio().reenviar(destino);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 250 - (Date.now() - inicio))));
    req.session.registroRecibido = true;
    return pagina(res, 'aceptada', 202, mensajeGenerico);
  } catch (e) { return error(res, e, 'reenvio'); }
};
const enlace = async (req, res) => {
  try {
    if (Object.hasOwn(req.query, 'token')) {
      // No consumir en GET: escáneres de correo no deben activar la solicitud.
      delete req.session.registroEnlaceHash;
      req.session.registroEnlaceHash = autoservicio.tokenHash(req.query.token);
      await guardarSesion(req);
      return res.redirect(303, '/registro/verificar');
    }
    if (req.session.registroEnlaceUsadoHash && req.session.registroEnlaceHash === req.session.registroEnlaceUsadoHash) return pagina(res, 'usado', 422);
    if (!req.session.registroEnlaceHash) throw { codigo: 'ENLACE_INVALIDO' };
    await limitar(req, 'verificacion', 30);
    const estado = await servicio().consultarEnlace({ hashEnlace: req.session.registroEnlaceHash });
    if (estado === 'caducado') return pagina(res, 'caducado', 422);
    if (estado !== 'vigente') throw { codigo: 'ENLACE_INVALIDO' };
    return pagina(res, 'verificacion');
  } catch (e) { return error(res, e, 'invalido'); }
};
const verificar = async (req, res) => {
  try {
    await limitar(req, 'verificacion', 30);
    const hashEnlace = req.session.registroEnlaceHash;
    if (req.session.registroEnlaceUsadoHash && (!hashEnlace || hashEnlace === req.session.registroEnlaceUsadoHash)) return pagina(res, 'usado', 422);
    const estado = await servicio().consultarEnlace({ hashEnlace });
    if (estado === 'caducado') return pagina(res, 'caducado', 422);
    if (estado !== 'vigente') throw { codigo: 'ENLACE_INVALIDO' };
    // La sesión nueva evita fijación y acota la configuración a quien consumió el enlace.
    await regenerar(req);
    const resultado = await servicio().verificar({ hashEnlace, sesion: req.sessionID });
    req.session.registroSolicitud = resultado.solicitud;
    req.session.registroEnlaceUsadoHash = hashEnlace;
    await guardarSesion(req);
    return res.redirect(303, '/registro/administrador');
  } catch (e) { return error(res, e, 'invalido'); }
};
const mostrarAdministrador = async (req, res) => {
  try {
    if (!req.session.registroSolicitud) return pagina(res, 'invalido', 422, 'Verifica primero tu correo mediante el enlace recibido.');
    const estado = await servicio().consultarConfiguracion({ solicitud: req.session.registroSolicitud, sesion: req.sessionID });
    if (estado === 'caducada') return pagina(res, 'configuracion_caducada', 422);
    if (estado === 'completada') return pagina(res, 'completada');
    if (estado !== 'vigente') return pagina(res, 'invalido', 422, 'La sesión de configuración no es válida. Solicita un nuevo enlace.');
    return pagina(res, 'administrador');
  } catch (e) { return error(res, e, 'invalido'); }
};
const pendiente = (req, res) => req.session.registroRecibido ? pagina(res, 'pendiente') : res.redirect(303, '/registro');
const configurar = async (req, res) => {
  try {
    await limitar(req, 'configuracion', 10);
    const datos = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => k !== '_csrf'));
    await servicio().configurar({ solicitud: req.session.registroSolicitud, sesion: req.sessionID, datos });
    await regenerar(req);
    return pagina(res, 'completada', 200, 'Registro completado. Ya puedes iniciar sesión con el correo verificado.');
  } catch (e) { return error(res, e, 'administrador'); }
};
module.exports = { mostrar, solicitud, mostrarReenvio, reenviar, enlace, verificar, mostrarAdministrador, configurar, pendiente };
