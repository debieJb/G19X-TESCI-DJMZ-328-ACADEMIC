'use strict';
const mongoose = require('mongoose');
const { buscarCampana } = require('../services/accesoCampanasService');
const { normalizarEmpresaId } = require('../services/accesoEmpresaService');
const revision = require('../services/revisionEnvioCampanaService');
const Campana = require('../models/Campana');
const Contacto = require('../models/Contacto');
const Ejecucion = require('../models/EjecucionGmail');
const Envio = require('../models/EnvioGmail');
const Autorizacion = require('../models/AutorizacionPilotoGmail');
const Control = require('../models/ControlEnvioGmail');
const fallar = (status, mensaje) => { throw Object.assign(Error(mensaje), { status }); };
const error = (res, e) => res.status([403, 404, 409, 422].includes(e.status) ? e.status : 503).render('error', {
  titulo: 'No se pudo preparar la campaña', mensaje: e.status ? e.message : 'No se pudo comprobar la campaña. Vuelve a su detalle antes de continuar.' });
const mostrar = async (req, res) => {
  try {
    const actor = res.locals.usuarioActual;
    const campana = await buscarCampana(req.params.id, actor, 'campanas.consultar');
    const empresa = normalizarEmpresaId(campana.empresa);
    const contactos = await Contacto.find({ empresa }).select('empresa nombre email activo canales consentimientoMarketing etiquetas').lean();
    const evaluacion = revision.evaluarContactos(campana, contactos);
    const ejecucion = await Ejecucion.findOne({ empresa, campana: campana._id }).lean();
    const envios = ejecucion ? await Envio.find({ empresa, ejecucion: ejecucion._id }).select('estado codigo aceptadoEn historial gmailId').lean() : [];
    const autorizacion = await Autorizacion.findOne({ empresa, campana: campana._id }).lean();
    const p = require('../config/enviosGmail').obtenerPolitica();
    const estado = await require('../services/preparacionAutomatizacionService').evaluar(campana);
    const supervisado = p.supervisado === true;
    const bloqueos = [], agregar = (mensaje, accion, href) => bloqueos.push({ mensaje, accion, href });
    const programada = campana.estado === 'programada' || campana.automatizacion?.modo === 'programado';
    if (actor.rol !== 'admin_empresa') agregar('El envío manual requiere un administrador de empresa.', 'Volver al detalle', `/campanas/${campana._id}`);
    if (!p.habilitado) agregar('El envío está apagado o la lista de empresas autorizadas no es válida en este servidor.', 'Consultar configuración de envío', '#politica-envio');
    if (!p.empresas.includes(empresa)) agregar('Esta empresa no está incluida en la política de envío del servidor.', 'Consultar configuración de envío', '#politica-envio');
    if ((supervisado ? req.app.locals.gmailSupervisadoValidado !== true : req.app.locals.gmailManualValidado !== true)) agregar('La infraestructura de este modo no se validó al arrancar. Se requieren transacciones e índices únicos; solicita revisar el arranque del servidor.', 'Consultar Gmail empresarial', '/empresa/gmail');
    if (p.automatico) agregar('El servidor está en modo automático. Esta pantalla de envío inmediato requiere modo supervisado; no inicia trabajadores.', 'Ver programación', `/campanas/${campana._id}/automatizacion`);
    if (programada) agregar('Esta campaña está programada. No se enviará de inmediato ni se iniciará un trabajador desde esta pantalla.', 'Ver programación guardada', `/campanas/${campana._id}/automatizacion`);
    if (!ejecucion && campana.estado !== 'activa') agregar('Activa y prepara la campaña con el destinatario autorizado; esta acción todavía no envía.', 'Elegir destinatario', '#preparar-envio');
    if (!campana.asunto?.trim() || !campana.cuerpoTexto?.trim() || campana.imagenLocal) agregar('El envío actual requiere asunto y mensaje de texto, sin imagen adjunta.', 'Editar contenido', `/campanas/${campana._id}/editar`);
    if (!estado.permisoEnvio || !estado.identidadCoincide) agregar('Conecta el Gmail autorizado de la empresa antes de enviar.', 'Configurar Gmail', '/empresa/gmail');
    if (!supervisado && !ejecucion && (campana.destinatarios?.tipo !== 'contactos' || (campana.destinatarios?.contactos || []).length !== 1 || evaluacion.validos.length !== 1 || evaluacion.excluidos.length)) agregar('El piloto admite exactamente un destinatario autorizado. Revisa la selección y las exclusiones.', 'Corregir destinatario', '#preparar-envio');
    if (!ejecucion && campana.automatizacion?.estado !== 'preparada') agregar('Falta guardar la preparación del envío.', 'Preparar revisión', '#preparar-envio');
    if (!supervisado && !ejecucion && autorizacion && (autorizacion.estado !== 'autorizada' || +autorizacion.expiraEn <= Date.now())) agregar('Esta autorización ya no es utilizable. No se renueva un intento consumido, revocado o vencido.', 'Consultar historial', '#historial');
    if (!supervisado && !ejecucion && p.campanasSucesivas !== true && await Control.exists({ _id: 'piloto-manual:' + empresa })) agregar('El piloto de un único envío por empresa ya se consumió. La administración debe habilitar expresamente la política de campañas sucesivas; el historial anterior se conserva.', 'Consultar historial', '#historial');
    if (!ejecucion && await Envio.exists({ empresa, estado: { $in: ['incierto', 'reservado', 'enviando'] } })) agregar('Hay un envío anterior en curso o con resultado incierto. Debe conciliarse antes de otra campaña.', 'Consultar campañas', '/campanas');
    if (!ejecucion && supervisado && (!Number.isSafeInteger(p.maxDestinatarios) || p.maxDestinatarios < 1 || p.maxDestinatarios > 50 || !evaluacion.validos.length || evaluacion.validos.length > p.maxDestinatarios)) agregar('Destinatarios seleccionados: ' + evaluacion.validos.length + '. Selecciona entre 1 y ' + p.maxDestinatarios + ' correos autorizados y guarda la preparación.', 'Seleccionar contactos', '#preparar-envio');
    if (supervisado) {
      const empresaActual = await require('../models/Empresa').findById(empresa).select('estado estadoActivacion automatizaciones').lean();
      const cuenta = await require('../models/ConexionGmail').findOne({ empresa }).select('googleSub clienteOAuthHash').lean();
      if (empresaActual?.estado !== 'activa' || empresaActual.estadoActivacion !== 'verificada' || empresaActual.automatizaciones?.email?.habilitada !== true) agregar('La empresa debe estar activa, verificada y con el canal email habilitado.', 'Revisar empresa', '/empresa');
      try {
        if (!cuenta?.googleSub || cuenta.clienteOAuthHash !== require('../services/googleOAuthClienteService').configuracion().hash) agregar('La conexión Gmail pertenece a otra configuración OAuth o falta su identidad. Conecta nuevamente la cuenta.', 'Conectar Gmail', '/empresa/gmail');
      } catch { agregar('La configuración OAuth o la clave de cifrado del servidor no está disponible. Solicita revisar la configuración antes de conectar Gmail.', 'Conectar Gmail', '/empresa/gmail'); }
      const controles = await Control.find({ _id: { $in: ['global', 'empresa:' + empresa] } }).lean();
      for (const control of controles) {
        const global = control._id === 'global';
        if (control.dia === new Date().toISOString().slice(0,10) && control.usadosDia >= (global ? p.cuotaDiaGlobal : p.cuotaDiaEmpresa)
          || !global && control.hora === new Date().toISOString().slice(0,13) && control.usadosHora >= p.cuotaHoraEmpresa) agregar('Cuota local agotada. Espera al siguiente período; no vuelvas a confirmar una campaña registrada.', 'Ver historial', '#historial');
        if (control.siguienteEn > new Date()) agregar('Límite de velocidad o pausa del proveedor vigente hasta ' + control.siguienteEn.toISOString() + '. Actualiza la revisión después de esa hora.', 'Actualizar revisión', '/campanas/' + campana._id + '/enviar');
      }
    }
    // Explain pilot restrictions without blocking an otherwise valid legacy single delivery.
    const avisosPolitica = !supervisado ? [{ mensaje: 'El piloto manual fuerza un destinatario. Para campañas múltiples se requiere habilitar explícitamente el modo supervisado y su límite en el despliegue.' }] : [];
    res.render('campanas/enviar', { titulo: 'Revisar y enviar campaña', campana, contactos: evaluacion.validos, evaluacion,
      contactosNoElegibles: contactos.filter(c => String(c.empresa) === empresa && revision.motivo(c)).map(c => ({ nombre: c.nombre, motivo: revision.motivo(c) })),
      revisionDestinatarios: revision.huellaDestinatarios(evaluacion.validos),
      supervisado, maxDestinatarios: p.maxDestinatarios, avisosPolitica, revisionEnvio: require('../services/motorEnviosGmailService').huella(campana.toObject ? campana.toObject() : campana),
      estado, bloqueos, bloqueosEnvio: bloqueos.map(b => b.mensaje), ejecucion, envios, autorizacion, programada,
      estadoVisible: !ejecucion && campana.estado === 'activa' && bloqueos.length && !programada ? 'Revisión pendiente' : revision.estadoVisible(campana, envios), puedePreparar: actor.rol === 'admin_empresa' && !ejecucion && !autorizacion && !programada && ['borrador', 'activa'].includes(campana.estado) });
  } catch (e) { error(res, e); }
};
const activarPreparar = async (req, res) => {
  try {
    if (res.locals.usuarioActual.rol !== 'admin_empresa') fallar(403, 'El envío manual requiere un administrador de empresa.');
    await require('../services/iaService').autorizar(res.locals.usuarioActual);
    const c = await buscarCampana(req.params.id, res.locals.usuarioActual, 'campanas.ejecutar');
    if (Object.keys(req.body || {}).some(k => !['_csrf', 'contactos', 'tipo', 'etiquetas', 'revisionCampana'].includes(k))) fallar(422, 'Revisa el destinatario y la versión de la campaña.');
    if (!['borrador', 'activa'].includes(c.estado) || c.automatizacion?.modo === 'programado') fallar(409, 'La programación y el estado actuales no se pueden modificar desde el envío inmediato.');
    const politica = require('../config/enviosGmail').obtenerPolitica();
    const lote = politica.supervisado === true;
    if (lote && (!Number.isSafeInteger(politica.maxDestinatarios) || politica.maxDestinatarios < 1 || politica.maxDestinatarios > 50)) fallar(422, 'El límite de destinatarios no es válido. Debe estar entre 1 y 50.');
    const contacto = req.body?.contactos;
    if (!lote && (typeof contacto !== 'string' || !/^[a-f0-9]{24}$/.test(contacto))) fallar(422, 'Selecciona un único destinatario autorizado.');
    const version = c.updatedAt?.toISOString() || '0';
    if (req.body.revisionCampana !== version) fallar(409, 'La campaña cambió. Recarga la revisión antes de continuar.');
    const empresa = normalizarEmpresaId(c.empresa);
    await mongoose.connection.transaction(async session => {
      if (await Ejecucion.exists({ empresa, campana: c._id }).session(session) || await Autorizacion.exists({ empresa, campana: c._id }).session(session)) fallar(409, 'Esta campaña ya tiene una autorización o ejecución. Consulta su historial.');
      let ids = [contacto];
      if (lote) {
        const seleccion = require('../services/destinatariosService').validarSeleccion({ tipo: req.body.tipo || 'contactos', contactos: contacto, etiquetas: req.body.etiquetas });
        if (seleccion.error || !seleccion.seleccion || (seleccion.seleccion.contactos || []).length > 50) fallar(422, seleccion.error || 'Selecciona hasta 50 contactos.');
        const docs = await Contacto.find({ empresa }).session(session).limit(10001).lean();
        if (docs.length >= 10001) fallar(422, 'La selección requiere segmentar los contactos de esta empresa.');
        if (seleccion.seleccion.tipo === 'contactos' && seleccion.seleccion.contactos.some(id => !docs.some(c => String(c._id) === id))) fallar(422, 'Selecciona únicamente contactos de tu empresa.');
        const evaluacion = revision.evaluarContactos({ empresa, destinatarios: seleccion.seleccion }, docs);
        if (!evaluacion.validos.length || evaluacion.validos.length > politica.maxDestinatarios) fallar(422, 'La selección contiene ' + evaluacion.validos.length + ' correos válidos. El límite configurado es ' + politica.maxDestinatarios + '.');
        ids = evaluacion.validos.map(c => String(c._id));
      }
      const destinatario = !lote && await Contacto.findOne({ _id: contacto, empresa }).session(session).lean();
      if (!lote && revision.motivo(destinatario)) fallar(422, 'El contacto no tiene consentimiento documentado, está inactivo o no pertenece a la empresa.');
      try { require('../services/gmailMimeService').validarContenido(c); } catch { fallar(422, 'Completa un asunto y mensaje válidos antes de preparar el envío.'); }
      if (c.canal !== 'email' || c.imagenLocal) fallar(422, 'El envío inmediato solo admite campañas email de texto sin imagen adjunta.');
      c.$where = { empresa: c.empresa._id || c.empresa, estado: c.estado, updatedAt: c.updatedAt || { $exists: false } };
      c.estado = 'activa'; c.versionFlujo = 2;
      c.destinatarios = { tipo: 'contactos', contactos: ids, etiquetas: [] };
      c.automatizacion = { modo: 'inmediato', estado: 'preparada', revision: (c.automatizacion?.revision || 0) + 1 };
      await c.save({ session });
    }, require('../services/registroEmpresarialService').opcionesTransaccion);
    res.redirect(303, `/campanas/${c._id}/enviar`);
  } catch (e) { if (e.name === 'DocumentNotFoundError') { e.status = 409; e.message = 'La campaña cambió. Recarga antes de continuar.'; } error(res, e); }
};
module.exports = { mostrar, activarPreparar };
