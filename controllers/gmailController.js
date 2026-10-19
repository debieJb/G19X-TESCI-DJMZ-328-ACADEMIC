const service = require('../services/gmailOAuthService');
const google = require('../services/googleOAuthClienteService');
const ErrorGmail = require('../services/ErrorGmail');
const avisos = Object.freeze({
  conectada: 'Tu cuenta Gmail quedó conectada a esta empresa. No se enviaron correos.',
  desconectada: 'La cuenta Gmail quedó desconectada y su autorización fue revocada.',
  revocacion_pendiente: 'La cuenta quedó deshabilitada en la aplicación. Google no confirmó la revocación; pulsa Reintentar revocación.'
});
const renderizar = async (req, res, status = 200, mensaje = '', esError = false) => {
  const conexion = await service.obtenerEstado(res.locals.usuarioActual);
  res.status(status).render('empresa/gmail', { titulo: 'Configuración Gmail', anio: new Date().getFullYear(),
    conexion, configurado: google.estaConfigurado(), mensaje, esError });
};
const responderError = async (req, res, error) => {
  const seguro = error instanceof ErrorGmail ? error : new ErrorGmail('GOOGLE');
  if (seguro.status === 403) return res.status(403).render('error', { titulo: 'Acceso denegado', mensaje: seguro.message });
  try { return await renderizar(req, res, seguro.status, seguro.message, true); }
  catch { return res.status(503).render('error', { titulo: 'Gmail no disponible', mensaje: 'No se pudo consultar la conexión Gmail. Intenta de nuevo más tarde.' }); }
};
const guardarSesion = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
const mostrar = async (req, res) => {
  try {
    const aviso = avisos[req.session.gmailAviso] || '';
    delete req.session.gmailAviso;
    await renderizar(req, res, 200, aviso);
  } catch (error) { await responderError(req, res, error); }
};
const conectar = async (req, res) => {
  try {
    const email = req.body?.email;
    if (email !== undefined && (typeof email !== 'string' || !require('../services/elegibilidadEmailService').emailValido(email.trim().toLowerCase()))) throw new ErrorGmail('IDENTIDAD');
    const url = await service.iniciar(res.locals.usuarioActual, req.sessionID, email?.trim().toLowerCase());
    await guardarSesion(req);
    res.redirect(303, url);
  } catch (error) { await responderError(req, res, error); }
};
const callback = async (req, res) => {
  // Tanto éxitos como errores terminan en una URL local sin códigos OAuth.
  try {
    await service.completar(res.locals.usuarioActual, req.sessionID, req.query);
    req.session.gmailAviso = 'conectada';
    await guardarSesion(req);
    res.redirect(303, '/empresa/gmail');
  } catch (error) {
    // completar() ya registra su propia etapa; aquí solo diagnosticar errores de sesión posteriores.
    if (!(error instanceof ErrorGmail)) require('../services/diagnosticoGmailOAuthService').registrar('CALLBACK_SESION', error);
    const seguro = error instanceof ErrorGmail ? error : new ErrorGmail('GOOGLE');
    req.session.gmailError = seguro.codigo;
    try { await guardarSesion(req); res.redirect(303, '/empresa/gmail/resultado'); }
    catch { res.status(503).render('error', { titulo: 'Gmail no disponible', mensaje: 'No se pudo completar la autorización.' }); }
  }
};
const resultado = async (req, res) => {
  const codigo = req.session.gmailError;
  delete req.session.gmailError;
  if (!codigo) return res.redirect(303, '/empresa/gmail');
  await responderError(req, res, new ErrorGmail(codigo));
};
const desconectar = async (req, res) => {
  try {
    const resultado = await service.desconectar(res.locals.usuarioActual);
    req.session.gmailAviso = resultado.revocada ? 'desconectada' : 'revocacion_pendiente';
    await guardarSesion(req);
    res.redirect(303, '/empresa/gmail');
  } catch (error) { await responderError(req, res, error); }
};
const renovar = async (req, res) => {
  try {
    await service.obtenerAccessToken(res.locals.usuarioActual);
    await renderizar(req, res, 200, 'La autorización está disponible. No se enviaron correos.');
  } catch (error) { await responderError(req, res, error); }
};
module.exports = { mostrar, conectar, callback, resultado, desconectar, renovar };
