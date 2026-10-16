const mongoose = require('mongoose');
const motorService = require('../services/motorEnviosGmailService');
const responderError = (res, e) => {
  const status = ['ACCESO_DENEGADO'].includes(e.codigo) ? 403 : e.codigo === 'NO_ENCONTRADA' ? 404
    : ['IDEMPOTENCIA_CONFLICTO', 'AUTORIZACION_PILOTO_INVALIDA'].includes(e.codigo) ? 409
      : ['DATOS_INVALIDOS', 'IDEMPOTENCIA_INVALIDA', 'DESTINATARIOS_INVALIDOS', 'CAMPANA_NO_PREPARADA', 'REMITENTE_NO_COINCIDE', 'PILOTO_REQUIERE_UN_CONTACTO', 'CONSENTIMIENTO_NO_DOCUMENTADO'].includes(e.codigo) ? 422 : 503;
  return res.status(status).json({ error: status === 503 ? 'ENVIO_NO_DISPONIBLE' : status === 404 ? 'NO_ENCONTRADA'
    : status === 403 ? 'ACCESO_DENEGADO' : status === 409 ? e.codigo : 'REVISA_PREPARACION' });
};
const autorizar = async (req, res) => {
  try {
    if (req.app.locals.pilotoInfraValidada !== true) return res.status(503).json({ error: 'INFRAESTRUCTURA_PILOTO_NO_VALIDADA' });
    if (req.body?.confirmacion !== 'AUTORIZAR_UN_ENVIO' || Object.keys(req.body || {}).some(k => !['_csrf', 'confirmacion'].includes(k))) return res.status(422).json({ error: 'CONFIRMACION_INVALIDA' });
    return res.status(201).json(await motorService.crearMotor({ conexion: mongoose.connection }).autorizarPiloto({
      campanaId: req.params.id, actorId: String(res.locals.usuarioActual._id) }));
  } catch (e) { return responderError(res, e); }
};
const revocar = async (req, res) => {
  try { return res.json(await motorService.crearMotor({ conexion: mongoose.connection }).revocarPiloto({
    campanaId: req.params.id, actorId: String(res.locals.usuarioActual._id) }));
  } catch (e) { return responderError(res, e); }
};
const confirmar = async (req, res) => {
  try {
    if (req.app.locals.pilotoInfraValidada !== true) return res.status(503).json({ error: 'INFRAESTRUCTURA_PILOTO_NO_VALIDADA' });
    if (req.body?.confirmacion !== 'ENVIAR' || Object.keys(req.body || {}).some(k => !['_csrf', 'confirmacion', 'idempotencia'].includes(k))) return res.status(422).json({ error: 'CONFIRMACION_INVALIDA' });
    const resultado = await motorService.crearMotor({ conexion: mongoose.connection }).encolar({ campanaId: req.params.id,
      actorId: String(res.locals.usuarioActual._id), claveIdempotencia: req.body.idempotencia });
    return res.status(202).json({ ...resultado, mensaje: 'Ejecución registrada. Ningún destinatario se considera entregado por registrar la ejecución.' });
  } catch (e) { return responderError(res, e); }
};
const consultar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { return res.json(await motorService.crearMotor({ conexion: mongoose.connection }).consultar({ campanaId: req.params.id,
    actorId: String(res.locals.usuarioActual._id) })); } catch (e) { return responderError(res, e); }
};
module.exports = { autorizar, revocar, confirmar, consultar };
