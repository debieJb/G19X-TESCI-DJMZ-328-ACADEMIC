const { createHash, randomBytes } = require('node:crypto');
const registro = require('./registroEmpresarialService');
const correoPredeterminado = require('./correoTransaccionalService').predeterminado;
const hash = valor => createHash('sha256').update(valor).digest('hex');
const aleatorio = () => randomBytes(32).toString('base64url');
const DURACION_ENLACE = 30 * 60 * 1000;
const DURACION_CONFIGURACION = 20 * 60 * 1000;
const DIA = 24 * 60 * 60 * 1000;
const nombres = ['Empresa', 'Usuario', 'SolicitudRegistro', 'LimiteRegistro', 'AuditoriaRegistro'];
const fallo = codigo => { throw new registro.ErrorRegistro(codigo); };
const exigir = (ok, codigo) => { if (!ok) fallo(codigo); };
const email = valor => {
  exigir(typeof valor === 'string', 'DATOS_INVALIDOS');
  const limpio = valor.trim().toLowerCase();
  exigir(limpio.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio), 'DATOS_INVALIDOS');
  return limpio;
};
const texto = valor => typeof valor === 'string' ? valor.trim() : '';
const validarSolicitud = datos => {
  exigir(datos && Object.keys(datos).every(k => ['nombreEmpresa', 'correo'].includes(k)), 'DATOS_INVALIDOS');
  const nombreEmpresa = texto(datos.nombreEmpresa);
  exigir(nombreEmpresa.length > 0 && nombreEmpresa.length <= 200, 'DATOS_INVALIDOS');
  return { nombreEmpresa, correo: email(datos.correo) };
};
const tokenHash = token => {
  exigir(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
    && Buffer.from(token, 'base64url').toString('base64url') === token, 'ENLACE_INVALIDO');
  return hash(token);
};
const preparar = async conexion => {
  await registro.validarTopologia(conexion);
  const m = Object.fromEntries(nombres.map(nombre => [nombre, conexion.models[nombre]
    || conexion.model(nombre, require(`../models/${nombre}`).schema.clone().set('autoIndex', false).set('autoCreate', false))]));
  // Fallar cerrado: jamás provisionar colecciones/índices en una petición pública.
  for (const nombre of nombres) {
    const indices = await m[nombre].collection.listIndexes().toArray();
    for (const [key, options] of m[nombre].schema.indexes()) {
      exigir(indices.some(i => JSON.stringify(i.key) === JSON.stringify(key)
        && !!i.unique === !!options.unique && !i.sparse
        && JSON.stringify(i.partialFilterExpression) === JSON.stringify(options.partialFilterExpression)
        && i.expireAfterSeconds === options.expireAfterSeconds), 'INDICES_REQUERIDOS');
    }
  }
  return m;
};
const evento = (m, solicitud, nombre, session) => new m.AuditoriaRegistro({ solicitud, evento: nombre }).save({ session });
const crearServicio = ({ conexion, correo = correoPredeterminado, reloj = () => new Date() }) => {
  const transaccion = fn => conexion.transaction(fn, registro.opcionesTransaccion);
  const solicitar = async ({ datos, claveIdempotencia, ambito }) => {
    const limpio = validarSolicitud(datos);
    exigir(typeof claveIdempotencia === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(claveIdempotencia)
      && typeof ambito === 'string' && ambito.length > 0, 'IDEMPOTENCIA_INVALIDA');
    const m = await preparar(conexion), ahora = reloj();
    const idempotenciaHash = hash(`${hash(ambito)}:${claveIdempotencia}`), solicitudHash = hash(JSON.stringify(limpio));
    try {
      return await transaccion(async session => {
        const previa = await m.SolicitudRegistro.findOne({ idempotenciaHash }).select('+solicitudHash').session(session);
        if (previa) {
          exigir(previa.solicitudHash === solicitudHash, 'IDEMPOTENCIA_CONFLICTO');
          return;
        }
        // Ninguna cuenta existente se altera, ni se revela su presencia por HTTP.
        if (await m.Usuario.exists({ email: limpio.correo }).session(session)
          || await m.SolicitudRegistro.exists({ correo: limpio.correo }).session(session)) return;
        const doc = new m.SolicitudRegistro({ ...limpio, estado: 'pendiente_correo', idempotenciaHash, solicitudHash,
          correoEstado: correo.disponible ? 'pendiente' : 'pendiente_configuracion',
          ventanaEnvioEn: ahora, proximoEnvioEn: new Date(+ahora + 60000) });
        await doc.save({ session });
        await evento(m, doc._id, 'solicitada', session);
      });
    } catch (e) { if (e.code !== 11000) throw e; }
  };
  const reenviar = async valor => {
    const destino = email(valor), m = await preparar(conexion), ahora = reloj();
    await transaccion(async session => {
      const doc = await m.SolicitudRegistro.findOne({ correo: destino }).session(session);
      if (!doc || doc.estado === 'completada' || doc.proximoEnvioEn > ahora
        || (doc.estado === 'correo_verificado' && doc.configuracionExpiraEn > ahora)
        || (doc.correoEstado === 'procesando' && doc.entregaHasta > ahora)) return;
      const ventanaNueva = +ahora - +doc.ventanaEnvioEn >= DIA;
      if (!ventanaNueva && doc.solicitudesEnvio >= 5) return;
      doc.solicitudesEnvio = ventanaNueva ? 1 : doc.solicitudesEnvio + 1;
      if (ventanaNueva) doc.ventanaEnvioEn = ahora;
      doc.proximoEnvioEn = new Date(+ahora + 60000);
      doc.estado = 'pendiente_correo';
      doc.configuracionSesionHash = undefined; doc.configuracionExpiraEn = undefined;
      doc.tokenHash = undefined; doc.expiraEn = undefined; doc.verificadoEn = undefined;
      doc.entregaHash = undefined; doc.entregaHasta = undefined;
      doc.correoEstado = correo.disponible ? 'pendiente' : 'pendiente_configuracion';
      await doc.save({ session });
      await evento(m, doc._id, 'reenvio', session);
    });
  };
  // Consumidor explícito, nunca llamado por HTTP ni dentro de una transacción.
  // El despliegue debe inyectar un proveedor autorizado y ejecutar este consumidor.
  const despachar = async ({ solicitudId } = {}) => {
    if (solicitudId !== undefined) exigir(typeof solicitudId === 'string' && /^[a-f0-9]{24}$/.test(solicitudId), 'DATOS_INVALIDOS');
    if (!correo.disponible) return { estado: 'deshabilitado' };
    const m = await preparar(conexion), ahora = reloj(), token = aleatorio(), entrega = hash(aleatorio());
    const doc = await transaccion(async session => {
      const tomado = await m.SolicitudRegistro.findOneAndUpdate({ ...(solicitudId ? { _id: solicitudId } : {}), estado: 'pendiente_correo',
        correoEstado: { $in: ['pendiente', 'pendiente_configuracion'] } }, {
        $set: { correoEstado: 'procesando', tokenHash: hash(token), expiraEn: new Date(+ahora + DURACION_ENLACE),
          entregaHash: entrega, entregaHasta: new Date(+ahora + 120000) }, $inc: { versionEnvio: 1 }
      }, { new: true, session, sort: { createdAt: 1 } });
      return tomado;
    });
    if (!doc) return { estado: 'sin_trabajo' };
    let estado = 'enviada';
    try { await correo.enviarVerificacion({ correo: doc.correo, token }); }
    catch (e) { estado = e?.definitivo === true ? 'fallida' : 'incierta'; }
    await transaccion(async session => {
      const resultado = await m.SolicitudRegistro.updateOne({ _id: doc._id, entregaHash: entrega, correoEstado: 'procesando' },
        { $set: { correoEstado: estado }, $unset: { entregaHash: 1, entregaHasta: 1,
          ...(estado === 'fallida' ? { tokenHash: 1, expiraEn: 1 } : {}) } }, { session });
      if (resultado.matchedCount) await evento(m, doc._id,
        estado === 'enviada' ? 'correo_emitido' : estado === 'fallida' ? 'correo_fallido' : 'correo_incierto', session);
    });
    return { estado };
  };
  const verificar = async ({ hashEnlace, sesion }) => {
    exigir(typeof hashEnlace === 'string' && /^[a-f0-9]{64}$/.test(hashEnlace)
      && typeof sesion === 'string' && sesion.length > 0, 'ENLACE_INVALIDO');
    const m = await preparar(conexion), ahora = reloj();
    return transaccion(async session => {
      const doc = await m.SolicitudRegistro.findOneAndUpdate({ tokenHash: hashEnlace, estado: 'pendiente_correo', expiraEn: { $gt: ahora } },
        { $set: { estado: 'correo_verificado', verificadoEn: ahora, configuracionSesionHash: hash(sesion),
          configuracionExpiraEn: new Date(+ahora + DURACION_CONFIGURACION) }, $unset: { tokenHash: 1, expiraEn: 1 } }, { new: true, session });
      exigir(doc, 'ENLACE_INVALIDO');
      await evento(m, doc._id, 'verificada', session);
      return { solicitud: String(doc._id) };
    });
  };
  // Consultas sin consumo: la vista nunca infiere validez del formato del token.
  const consultarEnlace = async ({ hashEnlace }) => {
    exigir(typeof hashEnlace === 'string' && /^[a-f0-9]{64}$/.test(hashEnlace), 'ENLACE_INVALIDO');
    const m = await preparar(conexion);
    const doc = await m.SolicitudRegistro.findOne({ tokenHash: hashEnlace }).select('estado expiraEn').lean();
    if (!doc || doc.estado !== 'pendiente_correo') return 'invalido';
    return doc.expiraEn instanceof Date && +doc.expiraEn > +reloj() ? 'vigente' : 'caducado';
  };
  const consultarConfiguracion = async ({ solicitud, sesion }) => {
    if (typeof solicitud !== 'string' || !/^[a-f0-9]{24}$/.test(solicitud) || typeof sesion !== 'string' || !sesion) return 'invalida';
    const m = await preparar(conexion);
    const doc = await m.SolicitudRegistro.findOne({ _id: solicitud, configuracionSesionHash: hash(sesion) })
      .select('estado configuracionExpiraEn').lean();
    if (!doc) return 'invalida';
    if (!(doc.configuracionExpiraEn instanceof Date) || +doc.configuracionExpiraEn <= +reloj()) return 'caducada';
    return doc.estado === 'correo_verificado' ? 'vigente' : doc.estado === 'completada' ? 'completada' : 'invalida';
  };
  const configurar = async ({ solicitud, sesion, datos }) => {
    exigir(typeof solicitud === 'string' && /^[a-f0-9]{24}$/.test(solicitud)
      && typeof sesion === 'string' && !!sesion, 'ENLACE_INVALIDO');
    exigir(datos && Object.keys(datos).every(k => ['nombreEmpresa', 'nombreAdministrador', 'password', 'confirmacionPassword'].includes(k)), 'DATOS_INVALIDOS');
    const nombreEmpresa = texto(datos.nombreEmpresa), nombreAdministrador = texto(datos.nombreAdministrador);
    exigir(nombreEmpresa && nombreEmpresa.length <= 200 && nombreAdministrador && nombreAdministrador.length <= 200, 'DATOS_INVALIDOS');
    registro.validarPassword(datos.password);
    exigir(datos.password === datos.confirmacionPassword, 'PASSWORD_INSEGURA');
    const m = await preparar(conexion), ahora = reloj();
    return transaccion(async session => {
      const filtro = { _id: solicitud, configuracionSesionHash: hash(sesion) };
      const previa = await m.SolicitudRegistro.findOne({ ...filtro, estado: 'completada', configuracionExpiraEn: { $gt: ahora } }).session(session);
      if (previa) {
        const usuario = await m.Usuario.findOne({ _id: previa.usuario, empresa: previa.empresa, email: previa.correo, estadoAcceso: 'activo' }).select('+password').session(session);
        exigir(usuario && usuario.nombre === nombreAdministrador && previa.nombreEmpresa === nombreEmpresa
          && await usuario.compararPassword(datos.password), 'IDEMPOTENCIA_CONFLICTO');
        return;
      }
      const doc = await m.SolicitudRegistro.findOneAndUpdate({ ...filtro, estado: 'correo_verificado', configuracionExpiraEn: { $gt: ahora } },
        { $set: { estado: 'completada' } }, { new: true, session });
      exigir(doc, 'ENLACE_INVALIDO');
      const entrada = registro.validar({ nombreEmpresa, nombreAdministrador, correoAutomatizaciones: doc.correo,
        correoAdministrador: doc.correo, password: datos.password }, 'autoservicio-interno-validacion');
      const { empresa, usuario } = await registro.crearEmpresaAdministrador(m, entrada, session, doc.verificadoEn);
      doc.empresa = empresa._id; doc.usuario = usuario._id; doc.nombreEmpresa = nombreEmpresa; doc.correoEstado = 'cancelada';
      await doc.save({ session });
      await evento(m, doc._id, 'completada', session);
    });
  };
  const limitar = async ({ accion, identificador, maximo, ventanaMs = 15 * 60000 }) => {
    exigir(['solicitud', 'reenvio', 'verificacion', 'configuracion', 'correo'].includes(accion)
      && typeof identificador === 'string' && identificador.length > 0, 'DATOS_INVALIDOS');
    const m = await preparar(conexion), ahora = reloj(), ventana = Math.floor(+ahora / ventanaMs);
    const _id = hash(`${accion}:${identificador}:${ventana}`);
    let limite;
    try {
      limite = await m.LimiteRegistro.findOneAndUpdate({ _id }, { $inc: { cantidad: 1 },
        $setOnInsert: { expiraEn: new Date((ventana + 1) * ventanaMs) } }, { upsert: true, new: true });
    } catch (e) {
      if (e.code !== 11000) throw e;
      limite = await m.LimiteRegistro.findOneAndUpdate({ _id }, { $inc: { cantidad: 1 } }, { new: true });
    }
    exigir(limite && limite.cantidad <= maximo, 'LIMITE_SOLICITUDES');
  };
  return { solicitar, reenviar, despachar, verificar, consultarEnlace, consultarConfiguracion, configurar, limitar };
};
module.exports = { crearServicio, preparar, validarSolicitud, tokenHash, hash, DURACION_ENLACE, DURACION_CONFIGURACION };
