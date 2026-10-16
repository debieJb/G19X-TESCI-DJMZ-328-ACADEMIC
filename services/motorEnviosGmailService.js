const { createHash, randomBytes } = require('node:crypto');
const { normalizarEmpresaId: id } = require('./accesoEmpresaService');
const { puede } = require('./permisos');
const { validarTopologia, opcionesTransaccion } = require('./registroEmpresarialService');
const { resolverDestinatarios } = require('./destinatariosService');
const elegibilidad = require('./elegibilidadEmailService');
const mime = require('./gmailMimeService');
const google = require('./googleOAuthClienteService');
const oauth = require('./gmailOAuthService');
const api = require('./gmailApiTransporteService');
const { obtenerPolitica } = require('../config/enviosGmail');
const piloto = require('./autorizacionPilotoGmailService');
const hash = valor => createHash('sha256').update(valor).digest('hex');
class ErrorMotor extends Error { constructor(codigo) { super(codigo); this.codigo = codigo; } }
const exigir = (ok, codigo) => { if (!ok) throw new ErrorMotor(codigo); };
const nombres = ['Empresa', 'Usuario', 'Contacto', 'Campana', 'ConexionGmail', 'EjecucionGmail', 'EnvioGmail', 'ControlEnvioGmail', 'AutorizacionPilotoGmail'];
const preparar = async conexion => {
  await validarTopologia(conexion);
  const m = Object.fromEntries(nombres.map(n => [n, conexion.models[n] || conexion.model(n,
    require(`../models/${n}`).schema.clone().set('autoCreate', false).set('autoIndex', false))]));
  for (const n of nombres) {
    const actuales = await m[n].collection.listIndexes().toArray();
    for (const [key, opts] of m[n].schema.indexes()) exigir(actuales.some(i => JSON.stringify(i.key) === JSON.stringify(key)
      && !!i.unique === !!opts.unique && !i.sparse
      && JSON.stringify(i.partialFilterExpression) === JSON.stringify(opts.partialFilterExpression)), 'INDICES_REQUERIDOS');
  }
  return m;
};
const huella = c => hash(JSON.stringify({ asunto: c.asunto, cuerpoTexto: c.cuerpoTexto, seleccion: c.destinatarios,
  automatizacion: c.automatizacion, updatedAt: c.updatedAt, imagen: !!c.imagenLocal }));
const crearMotor = ({ conexion, politica = obtenerPolitica, simulador, reloj = () => new Date() }) => {
  if (simulador && !process.env.NODE_TEST_CONTEXT) throw new ErrorMotor('SIMULACION_SOLO_PRUEBAS');
  const prepararSeguro = async () => {
    if (!simulador) {
      const infra = require('./infraestructuraPilotoService');
      await infra.validarDestinoPiloto(conexion, require('../config/manifiestoPiloto').cargarManifiesto());
      exigir((await infra.revisarIndices(conexion)).completos, 'INDICES_REQUERIDOS');
    }
    return preparar(conexion);
  };
  const gate = (empresa, preparacion = false) => {
    const p = politica();
    exigir((p.habilitado === true || (preparacion && p.preparacionPiloto === true)) && Array.isArray(p.empresas)
      && p.empresas.length > 0 && (!empresa || p.empresas.includes(String(empresa))), 'ENVIOS_BLOQUEADOS');
    for (const k of ['maxDestinatarios', 'cuotaDiaEmpresa', 'cuotaHoraEmpresa', 'cuotaDiaGlobal', 'reservaMs']) exigir(Number.isInteger(p[k]) && p[k] > 0, 'CONFIGURACION');
    exigir(p.maxDestinatarios === 1 && p.reservaMs >= 60000 && p.reservaMs <= 300000
      && Number.isInteger(p.intervaloEmpresaMs) && p.intervaloEmpresaMs >= (simulador ? 0 : 1000)
      && Number.isInteger(p.intervaloGlobalMs) && p.intervaloGlobalMs >= (simulador ? 0 : 1000), 'CONFIGURACION');
    return p;
  };
  const contexto = async (m, empresa, actorId, campanaId, session, preparacion = false) => {
    gate(empresa, preparacion);
    const usuario = await m.Usuario.findOne({ _id: actorId, empresa }).session(session || null).lean();
    exigir(usuario && usuario.rol === 'admin_empresa' && usuario.estadoAcceso === 'activo'
      && usuario.emailVerificadoEn instanceof Date && +usuario.emailVerificadoEn <= +reloj()
      && puede(usuario, 'campanas.ejecutar', empresa), 'ACCESO_DENEGADO');
    const campana = await m.Campana.findOne({ _id: campanaId, empresa }).session(session || null).lean();
    exigir(campana, 'NO_ENCONTRADA');
    exigir(campana.canal === 'email' && campana.versionFlujo === 2 && campana.estado === 'borrador'
      && campana.automatizacion?.estado === 'preparada' && campana.automatizacion.modo === 'inmediato' && !campana.imagenLocal, 'CAMPANA_NO_PREPARADA');
    mime.validarContenido(campana);
    const emp = await m.Empresa.findOne({ _id: empresa }).session(session || null).lean();
    exigir(emp?.estado === 'activa' && emp.estadoActivacion === 'verificada'
      && emp.automatizaciones?.email?.habilitada === true, 'EMPRESA_NO_HABILITADA');
    const cuenta = await m.ConexionGmail.findOne({ empresa }).select('email googleSub estado scopes clienteOAuthHash versionConexion').session(session || null).lean();
    exigir(cuenta?.estado === 'conectada' && Array.isArray(cuenta.scopes) && cuenta.scopes.includes(google.GMAIL_SEND)
      && typeof cuenta.googleSub === 'string' && !!cuenta.googleSub, 'REAUTORIZAR');
    exigir(elegibilidad.emailValido(emp.correoAutomatizaciones) && cuenta.email === emp.correoAutomatizaciones, 'REMITENTE_NO_COINCIDE');
    exigir(cuenta.clienteOAuthHash === google.configuracion().hash, 'REAUTORIZAR');
    return { usuario, campana, cuenta };
  };
  const validarAutorizacion = async (m, ejecucion, campana, contacto, session, consumida = false, envioId) => {
    exigir(piloto.seleccionUnica(campana) === String(contacto._id), 'PILOTO_REQUIERE_UN_CONTACTO');
    const a = await m.AutorizacionPilotoGmail.findOne({ empresa: ejecucion.empresa, campana: ejecucion.campana,
      actor: ejecucion.actor, contacto: contacto._id, estado: consumida ? 'consumida' : 'autorizada',
      expiraEn: { $gt: reloj() } }).session(session || null).lean();
    exigir(a && a.contenidoHash === huella(campana) && a.emailHash === hash(elegibilidad.emailNormalizado(contacto.email))
      && a.consentimientoHash === piloto.hashConsentimiento(contacto)
      && (!consumida || String(a.envio) === String(envioId)), 'AUTORIZACION_PILOTO_INVALIDA');
    return a;
  };
  const autorizarPiloto = async ({ campanaId, actorId }) => {
    gate(undefined, true); exigir(id(campanaId) && id(actorId), 'DATOS_INVALIDOS');
    const m = await prepararSeguro();
    try { return await conexion.transaction(async session => {
      const actor = await m.Usuario.findById(actorId).session(session).lean();
      const empresa = id(actor?.empresa); exigir(empresa && actor.rol === 'admin_empresa', 'ACCESO_DENEGADO');
      const { campana } = await contexto(m, empresa, actorId, campanaId, session, true);
      const contactoId = piloto.seleccionUnica(campana);
      const contacto = await m.Contacto.findOne({ _id: contactoId, empresa }).session(session).lean();
      exigir(elegibilidad.consentimiento(contacto, reloj()), 'DESTINATARIOS_INVALIDOS');
      exigir(contacto.consentimientoMarketing.emailHash === hash(elegibilidad.emailNormalizado(contacto.email))
        && id(contacto.consentimientoMarketing.registradoPor)
        && contacto.consentimientoMarketing.registradoEn instanceof Date
        && +contacto.consentimientoMarketing.registradoEn <= +reloj(), 'CONSENTIMIENTO_NO_DOCUMENTADO');
      const previa = await m.AutorizacionPilotoGmail.findOne({ empresa, campana: campanaId }).session(session).lean();
      if (previa) {
        await validarAutorizacion(m, { empresa, campana: campanaId, actor: actorId }, campana, contacto, session);
        return { autorizacion: String(previa._id), expiraEn: previa.expiraEn };
      }
      const [a] = await m.AutorizacionPilotoGmail.create([{ empresa, campana: campanaId, actor: actorId, contacto: contactoId,
        contenidoHash: huella(campana), emailHash: hash(elegibilidad.emailNormalizado(contacto.email)),
        consentimientoHash: piloto.hashConsentimiento(contacto), expiraEn: new Date(+reloj() + piloto.DURACION_MS), estado: 'autorizada' }], { session });
      return { autorizacion: String(a._id), expiraEn: a.expiraEn };
    }, opcionesTransaccion); } catch (e) { if (e.code === 11000) throw new ErrorMotor('AUTORIZACION_PILOTO_INVALIDA'); throw e; }
  };
  const revocarPiloto = async ({ campanaId, actorId }) => {
    exigir(id(campanaId) && id(actorId), 'DATOS_INVALIDOS');
    const m = await prepararSeguro(), actor = await m.Usuario.findById(actorId).lean();
    exigir(actor?.rol === 'admin_empresa' && actor.estadoAcceso === 'activo' && id(actor.empresa)
      && puede(actor, 'campanas.ejecutar', id(actor.empresa)), 'ACCESO_DENEGADO');
    const r = await m.AutorizacionPilotoGmail.updateOne({ empresa: actor.empresa, campana: campanaId, estado: { $in: ['autorizada', 'consumida'] } },
      { $set: { estado: 'revocada', revocadaEn: reloj() } }, { writeConcern: { w: 'majority' } });
    return { revocada: r.matchedCount === 1 };
  };
  const encolar = async ({ campanaId, actorId, claveIdempotencia }) => {
    gate(undefined, true); exigir(id(campanaId) && id(actorId), 'DATOS_INVALIDOS');
    exigir(typeof claveIdempotencia === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(claveIdempotencia), 'IDEMPOTENCIA_INVALIDA');
    const m = await prepararSeguro(), claveHash = hash(claveIdempotencia);
    const ejecutar = () => conexion.transaction(async session => {
      const actor = await m.Usuario.findById(actorId).session(session).lean();
      const empresa = id(actor?.empresa); exigir(empresa, 'ACCESO_DENEGADO');
      const { campana, cuenta } = await contexto(m, empresa, actorId, campanaId, session, true);
      piloto.seleccionUnica(campana);
      const contenidoHash = huella(campana);
      const previa = await m.EjecucionGmail.findOne({ empresa, campana: campanaId }).select('+claveHash').session(session);
      if (previa) {
        exigir(previa.claveHash === claveHash && previa.contenidoHash === contenidoHash && String(previa.actor) === actorId, 'IDEMPOTENCIA_CONFLICTO');
        return { ejecucion: String(previa._id), total: previa.total };
      }
      const candidatos = await resolverDestinatarios(campana, { modelo: m.Contacto, session, maximo: 51 });
      exigir(candidatos.length === 1, 'DESTINATARIOS_INVALIDOS');
      const contacto = await m.Contacto.findOne({ _id: candidatos[0].id, empresa }).session(session).lean();
      await validarAutorizacion(m, { empresa, campana: campanaId, actor: actorId }, campana, contacto, session);
      const ejecucion = new m.EjecucionGmail({ empresa, campana: campanaId, actor: actorId, claveHash, contenidoHash,
        googleSub: cuenta.googleSub, remitente: cuenta.email, total: candidatos.length });
      await ejecucion.save({ session });
      for (const c of candidatos) {
        const envio = new m.EnvioGmail({ empresa, ejecucion: ejecucion._id, contacto: c.id,
          emailHash: hash(c.email), estado: 'pendiente', mensajeId: `${hash(`${ejecucion._id}:${c.email}`)}@${cuenta.email.split('@')[1]}` });
        await envio.save({ session });
      }
      return { ejecucion: String(ejecucion._id), total: ejecucion.total };
    }, opcionesTransaccion);
    try { return await ejecutar(); } catch (e) {
      if (e.code === 11000) { try { return await ejecutar(); } catch { throw new ErrorMotor('IDEMPOTENCIA_CONFLICTO'); } }
      throw e;
    }
  };
  const reservar = async (m, envioId) => conexion.transaction(async session => {
    const envio = await m.EnvioGmail.findById(envioId).session(session);
    exigir(envio, 'NO_ENCONTRADA'); const p = gate(envio.empresa), ahora = reloj();
    if (envio.estado !== 'pendiente') return null;
    const ejecucion = await m.EjecucionGmail.findOne({ _id: envio.ejecucion, empresa: envio.empresa }).session(session).lean();
    exigir(ejecucion?.total === 1, 'AUTORIZACION_PILOTO_INVALIDA');
    const campana = await m.Campana.findOne({ _id: ejecucion.campana, empresa: envio.empresa }).session(session).lean();
    const contacto = await m.Contacto.findOne({ _id: envio.contacto, empresa: envio.empresa }).session(session).lean();
    exigir(contacto && elegibilidad.consentimiento(contacto, ahora), 'AUTORIZACION_PILOTO_INVALIDA');
    const a = await validarAutorizacion(m, ejecucion, campana, contacto, session);
    const consumida = await m.AutorizacionPilotoGmail.updateOne({ _id: a._id, estado: 'autorizada', expiraEn: { $gt: ahora } },
      { $set: { estado: 'consumida', consumidaEn: ahora, envio: envio._id } }, { session });
    exigir(consumida.matchedCount === 1, 'AUTORIZACION_PILOTO_INVALIDA');
    const bloqueo = hash(randomBytes(32));
    for (const llave of ['global', `empresa:${envio.empresa}`]) {
      let control = await m.ControlEnvioGmail.findById(llave).session(session);
      if (!control) control = new m.ControlEnvioGmail({ _id: llave });
      exigir(!control.envio && (!control.reservaHasta || control.reservaHasta <= ahora), 'OCUPADO');
      exigir(!control.siguienteEn || control.siguienteEn <= ahora, 'VELOCIDAD');
      const dia = ahora.toISOString().slice(0, 10), hora = ahora.toISOString().slice(0, 13);
      if (control.dia !== dia) { control.dia = dia; control.usadosDia = 0; }
      if (control.hora !== hora) { control.hora = hora; control.usadosHora = 0; }
      exigir(control.usadosDia < (llave === 'global' ? p.cuotaDiaGlobal : p.cuotaDiaEmpresa)
        && (llave === 'global' || control.usadosHora < p.cuotaHoraEmpresa), 'CUOTA_LOCAL');
      control.usadosDia++; control.usadosHora++;
      control.envio = envio._id; control.reservaHash = bloqueo; control.reservaHasta = new Date(+ahora + p.reservaMs);
      control.siguienteEn = new Date(+ahora + (llave === 'global' ? p.intervaloGlobalMs : p.intervaloEmpresaMs));
      await control.save({ session });
    }
    envio.estado = 'reservado'; envio.reservaHash = bloqueo; envio.reservaHasta = new Date(+ahora + p.reservaMs);
    await envio.save({ session });
    return { envio: envio.toObject(), bloqueo };
  }, opcionesTransaccion);
  const terminar = async (m, envio, bloqueo, resultado) => conexion.transaction(async session => {
    const r = await m.EnvioGmail.updateOne({ _id: envio._id, empresa: envio.empresa, reservaHash: bloqueo,
      estado: { $in: ['reservado', 'enviando'] } }, { $set: resultado, $unset: { reservaHash: 1, reservaHasta: 1 } }, { session });
    exigir(r.matchedCount === 1, 'PERSISTENCIA_INCIERTA');
    if (['CUOTA_PROVEEDOR', 'PERMISO_PROVEEDOR'].includes(resultado.codigo)) {
      await m.ControlEnvioGmail.updateMany({ envio: envio._id, reservaHash: bloqueo },
        { $max: { siguienteEn: new Date(+reloj() + 15 * 60000) } }, { session });
    }
    await m.ControlEnvioGmail.updateMany({ envio: envio._id, reservaHash: bloqueo }, { $unset: { envio: 1, reservaHash: 1, reservaHasta: 1 } }, { session });
  }, opcionesTransaccion);
  const procesarUno = async envioId => {
    gate(); exigir(id(envioId), 'DATOS_INVALIDOS');
    const m = await prepararSeguro();
    let reserva;
    try { reserva = await reservar(m, envioId); } catch (e) {
      if (e.code === 11000) throw new ErrorMotor('OCUPADO');
      if (['AUTORIZACION_PILOTO_INVALIDA', 'PILOTO_REQUIERE_UN_CONTACTO'].includes(e.codigo)) {
        await m.EnvioGmail.updateOne({ _id: envioId, estado: 'pendiente' }, { $set: { estado: 'cancelado', codigo: 'REVALIDACION' } }, { writeConcern: { w: 'majority' } });
        return { estado: 'cancelado', codigo: 'REVALIDACION' };
      }
      throw e;
    }
    if (!reserva) return { estado: 'sin_accion' };
    const { envio, bloqueo } = reserva; let enRed = false, resultado, credencialUsada;
    try {
      const ejecucion = await m.EjecucionGmail.findOne({ _id: envio.ejecucion, empresa: envio.empresa }).select('+googleSub +remitente').lean();
      exigir(ejecucion, 'REVALIDACION');
      const comprobar = async () => {
        const ctx = await contexto(m, id(envio.empresa), String(ejecucion.actor), String(ejecucion.campana));
        exigir(huella(ctx.campana) === ejecucion.contenidoHash && ctx.cuenta.googleSub === ejecucion.googleSub
          && ctx.cuenta.email === ejecucion.remitente, 'REVALIDACION');
        const contacto = await m.Contacto.findOne({ _id: envio.contacto, empresa: envio.empresa }).lean();
        exigir(contacto, 'REVALIDACION');
        await validarAutorizacion(m, ejecucion, ctx.campana, contacto, null, true, envio._id);
        const seleccion = ctx.campana.destinatarios;
        exigir(contacto && elegibilidad.consentimiento(contacto, reloj())
          && (seleccion.tipo === 'todos' || (seleccion.tipo === 'contactos' && seleccion.contactos.some(c => String(c) === String(contacto._id)))
            || (seleccion.tipo === 'etiquetas' && contacto.etiquetas?.some(e => seleccion.etiquetas.includes(e))))
          && hash(elegibilidad.emailNormalizado(contacto.email)) === envio.emailHash, 'REVALIDACION');
        const destinatario = { email: elegibilidad.emailNormalizado(contacto.email) };
        return { ...ctx, destinatario };
      };
      const inicial = await comprobar();
      const credencial = await oauth.obtenerAccessToken(inicial.usuario, { Conexion: m.ConexionGmail, conIdentidad: true,
        acceso: async () => { await comprobar(); return id(envio.empresa); } });
      credencialUsada = credencial;
      // La renovación pudo tardar o coincidir con revocación, cambios o baja de contacto.
      const actual = await comprobar();
      exigir(actual.cuenta.googleSub === credencial.googleSub && actual.cuenta.email === credencial.email
        && actual.cuenta.versionConexion === credencial.versionConexion, 'REVALIDACION');
      const raw = mime.construir({ remitente: actual.cuenta.email, destinatario: actual.destinatario.email,
        asunto: actual.campana.asunto, cuerpoTexto: actual.campana.cuerpoTexto, mensajeId: envio.mensajeId, fecha: reloj() });
      const tomado = await m.EnvioGmail.updateOne({ _id: envio._id, empresa: envio.empresa, estado: 'reservado', reservaHash: bloqueo,
        reservaHasta: { $gt: reloj() } }, { $set: { estado: 'enviando' }, $inc: { intentos: 1 } });
      exigir(tomado.matchedCount === 1, 'REVALIDACION');
      gate(envio.empresa); enRed = true;
      const respuesta = await (simulador || api).enviar({ accessToken: credencial.accessToken, raw, empresa: id(envio.empresa) });
      exigir(/^[A-Za-z0-9_-]{1,128}$/.test(respuesta?.gmailId || '') && /^[A-Za-z0-9_-]{1,128}$/.test(respuesta?.threadId || ''), 'RESPUESTA_INVALIDA');
      resultado = { estado: 'aceptado', codigo: 'ACEPTADO_API', gmailId: respuesta.gmailId, threadId: respuesta.threadId, aceptadoEn: reloj() };
    } catch (e) {
      const codigos = ['REAUTORIZAR', 'CUOTA_PROVEEDOR', 'PERMISO_PROVEEDOR', 'RECHAZO_PROVEEDOR', 'RESPUESTA_INVALIDA', 'TIMEOUT', 'CONEXION'];
      const codigo = codigos.includes(e.codigo) ? e.codigo : enRed ? 'RESPUESTA_INVALIDA' : e.codigo === 'RECONEXION' ? 'REAUTORIZAR' : 'REVALIDACION';
      resultado = { estado: enRed ? (e.incierto !== false || codigo === 'RESPUESTA_INVALIDA' ? 'incierto' : 'rechazado') : 'cancelado', codigo };
      if (['REAUTORIZAR', 'PERMISO_PROVEEDOR'].includes(codigo) && credencialUsada) await m.ConexionGmail.updateOne({ empresa: envio.empresa,
        estado: 'conectada', googleSub: credencialUsada.googleSub, versionConexion: credencialUsada.versionConexion }, {
        $set: { estado: 'requiere_reconexion' }, $inc: { versionConexion: 1 } });
    }
    // Si esto falla después del POST no se vuelve a enviar: reserva vencida => incierto.
    await terminar(m, envio, bloqueo, resultado);
    return { estado: resultado.estado, codigo: resultado.codigo };
  };
  const recuperarInciertos = async () => {
    // Clasificar una reserva vencida no envía: debe ser posible tras apagar la bandera.
    const p = politica();
    exigir(Array.isArray(p.empresas) && p.empresas.every(e => /^[a-f0-9]{24}$/.test(e)), 'CONFIGURACION');
    if (!p.empresas.length) return { inciertos: 0 };
    const m = await prepararSeguro(), ahora = reloj();
    return conexion.transaction(async session => {
      const vencidos = await m.EnvioGmail.find({ empresa: { $in: p.empresas }, estado: { $in: ['reservado', 'enviando'] }, reservaHasta: { $lte: ahora } }).select('+reservaHash').session(session);
      for (const doc of vencidos) await terminarEnSesion(doc);
      async function terminarEnSesion(doc) {
        await m.EnvioGmail.updateOne({ _id: doc._id, estado: doc.estado, reservaHasta: { $lte: ahora } },
          { $set: { estado: 'incierto', codigo: 'RESERVA_VENCIDA' }, $unset: { reservaHash: 1, reservaHasta: 1 } }, { session });
        await m.ControlEnvioGmail.updateMany({ envio: doc._id, reservaHash: doc.reservaHash }, { $unset: { envio: 1, reservaHash: 1, reservaHasta: 1 } }, { session });
      }
      return { inciertos: vencidos.length };
    }, opcionesTransaccion);
  };
  const consultar = async ({ campanaId, actorId }) => {
    exigir(id(campanaId) && id(actorId), 'DATOS_INVALIDOS'); const m = await prepararSeguro();
    const actor = await m.Usuario.findById(actorId).lean(), empresa = id(actor?.empresa); exigir(empresa, 'ACCESO_DENEGADO');
    exigir(['admin_empresa', 'operador'].includes(actor.rol) && actor.estadoAcceso === 'activo'
      && puede(actor, 'campanas.consultar', empresa), 'ACCESO_DENEGADO');
    exigir(await m.Campana.exists({ _id: campanaId, empresa }), 'NO_ENCONTRADA');
    const ejecucion = await m.EjecucionGmail.findOne({ empresa, campana: campanaId }).lean();
    if (!ejecucion) return { ejecucion: null, envios: [] };
    const envios = await m.EnvioGmail.find({ empresa, ejecucion: ejecucion._id }).select('contacto estado codigo gmailId threadId aceptadoEn intentos').lean();
    return { ejecucion: String(ejecucion._id), envios };
  };
  return { autorizarPiloto, revocarPiloto, encolar, procesarUno, recuperarInciertos, consultar };
};
module.exports = { crearMotor, preparar, ErrorMotor, huella };
