const mongoose = require('mongoose');
const motorService = require('../services/motorEnviosGmailService');
const crearMotor = req => motorService.crearMotor({ conexion: mongoose.connection,
  manualSupervisado: req.app.locals.gmailManualValidado === true && !require('../config/enviosGmail').obtenerPolitica().supervisado });
const responderError = (res, e) => {
  const conocidos = ['DESTINATARIOS_CAMBIARON', 'ENVIOS_BLOQUEADOS', 'CONFIGURACION', 'EMPRESA_NO_HABILITADA', 'REAUTORIZAR', 'CUOTA_LOCAL', 'OCUPADO', 'VELOCIDAD', 'RESULTADO_PREVIO_PENDIENTE', 'CONSENTIMIENTO_NO_DOCUMENTADO', 'REMITENTE_NO_COINCIDE', 'DESTINATARIOS_INVALIDOS', 'CAMPANA_NO_PREPARADA'];
  if (conocidos.includes(e.codigo)) return res.status(['ENVIOS_BLOQUEADOS','CONFIGURACION'].includes(e.codigo) ? 503 : ['CUOTA_LOCAL','VELOCIDAD','OCUPADO'].includes(e.codigo) ? 429 : 409).json({ error: e.codigo });
  const status = ['ACCESO_DENEGADO'].includes(e.codigo) ? 403 : e.codigo === 'NO_ENCONTRADA' ? 404
    : ['IDEMPOTENCIA_CONFLICTO', 'AUTORIZACION_PILOTO_INVALIDA', 'PILOTO_AGOTADO', 'RESULTADO_PREVIO_PENDIENTE'].includes(e.codigo) ? 409
      : ['DATOS_INVALIDOS', 'IDEMPOTENCIA_INVALIDA', 'DESTINATARIOS_INVALIDOS', 'CAMPANA_NO_PREPARADA', 'REMITENTE_NO_COINCIDE', 'PILOTO_REQUIERE_UN_CONTACTO', 'CONSENTIMIENTO_NO_DOCUMENTADO'].includes(e.codigo) ? 422 : 503;
  return res.status(status).json({ error: status === 503 ? 'ENVIO_NO_DISPONIBLE' : status === 404 ? 'NO_ENCONTRADA'
    : status === 403 ? 'ACCESO_DENEGADO' : status === 409 ? e.codigo : 'REVISA_PREPARACION' });
};
const autorizar = async (req, res) => {
  try {
    if (req.app.locals.pilotoInfraValidada !== true && req.app.locals.gmailManualValidado !== true) return res.status(503).json({ error: 'INFRAESTRUCTURA_PILOTO_NO_VALIDADA' });
    if (req.body?.confirmacion !== 'AUTORIZAR_UN_ENVIO' || Object.keys(req.body || {}).some(k => !['_csrf', 'confirmacion'].includes(k))) return res.status(422).json({ error: 'CONFIRMACION_INVALIDA' });
    return res.status(201).json(await crearMotor(req).autorizarPiloto({
      campanaId: req.params.id, actorId: String(res.locals.usuarioActual._id) }));
  } catch (e) { return responderError(res, e); }
};
const revocar = async (req, res) => {
  try { return res.json(await crearMotor(req).revocarPiloto({
    campanaId: req.params.id, actorId: String(res.locals.usuarioActual._id) }));
  } catch (e) { return responderError(res, e); }
};
const confirmar = async (req, res) => {
  try {
    const p = require('../config/enviosGmail').obtenerPolitica(), automatico = p.automatico || p.supervisado;
    if ((p.supervisado ? req.app.locals.gmailSupervisadoValidado : automatico ? req.app.locals.gmailAutomaticoValidado : req.app.locals.pilotoInfraValidada) !== true) return res.status(503).json({ error: 'INFRAESTRUCTURA_PILOTO_NO_VALIDADA' });
    if (req.body?.confirmacion !== 'ENVIAR' || Object.keys(req.body || {}).some(k => !['_csrf', 'confirmacion', 'idempotencia', ...(automatico ? ['revision'] : []), ...(p.supervisado ? ['revisionDestinatarios'] : [])].includes(k))) return res.status(422).json({ error: 'CONFIRMACION_INVALIDA' });
    const resultado = await crearMotor(req).encolar({ campanaId: req.params.id,
      actorId: String(res.locals.usuarioActual._id), claveIdempotencia: req.body.idempotencia, ...(automatico ? { revision: req.body.revision } : {}), ...(p.supervisado ? { revisionDestinatarios: req.body.revisionDestinatarios } : {}) });
    return res.status(202).json({ ...resultado, mensaje: 'Ejecución registrada. Ningún destinatario se considera entregado por registrar la ejecución.' });
  } catch (e) { return responderError(res, e); }
};
const consultar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { return res.json(await crearMotor(req).consultar({ campanaId: req.params.id,
    actorId: String(res.locals.usuarioActual._id) })); } catch (e) { return responderError(res, e); }
};
const despachar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (req.app.locals.gmailManualValidado !== true || !require('../services/pilotoManualGmailService').permitido()) return res.status(503).json({ error: 'ENVIO_NO_DISPONIBLE' });
    if (req.body?.confirmacion !== 'ENVIAR_UN_CORREO_REAL' || Object.keys(req.body || {}).some(k => !['_csrf', 'confirmacion', 'idempotencia'].includes(k))) return res.status(422).json({ error: 'CONFIRMACION_INVALIDA' });
    return res.json(await crearMotor(req).despacharManual({ campanaId: req.params.id,
      actorId: String(res.locals.usuarioActual._id), claveIdempotencia: req.body.idempotencia }));
  } catch (e) { return responderError(res, e); }
};
const pasoSupervisado = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (req.app.locals.gmailSupervisadoValidado !== true || !require('../config/enviosGmail').obtenerPolitica().supervisado) return res.status(503).json({ error: 'ENVIOS_BLOQUEADOS' });
    if (req.body?.confirmacion !== 'PROCESAR_CAMPANA_CONFIRMADA' || typeof req.body.ejecucion !== 'string' || !/^[a-f0-9]{24}$/.test(req.body.ejecucion)
      || Object.keys(req.body).some(k => !['_csrf', 'confirmacion', 'ejecucion'].includes(k))) return res.status(422).json({ error: 'CONFIRMACION_INVALIDA' });
    return res.json(await crearMotor(req).procesarPasoSupervisado({ campanaId: req.params.id, actorId: String(res.locals.usuarioActual._id), ejecucionId: req.body.ejecucion }));
  } catch (e) { return responderError(res, e); }
};
module.exports = { pasoSupervisado, autorizar, revocar, confirmar, consultar, despachar };
