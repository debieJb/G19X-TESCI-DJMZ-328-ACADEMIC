const { createHash } = require('node:crypto');
const { normalizarEmpresaId } = require('./accesoEmpresaService');
const hash = valor => createHash('sha256').update(valor).digest('hex');
class ErrorRegistro extends Error {
  constructor(codigo) { super(codigo); this.name = 'ErrorRegistro'; this.codigo = codigo; }
}
const exigir = (ok, codigo) => { if (!ok) throw new ErrorRegistro(codigo); };
const texto = valor => typeof valor === 'string' ? valor.trim() : '';
const validar = (datos, clave) => {
  const campos = ['nombreEmpresa', 'correoAutomatizaciones', 'nombreAdministrador', 'correoAdministrador', 'password'];
  exigir(datos && typeof datos === 'object' && !Array.isArray(datos) && Object.keys(datos).every(k => campos.includes(k)), 'DATOS_INVALIDOS');
  exigir(typeof clave === 'string' && clave.length >= 16 && clave.length <= 128 && !/[^A-Za-z0-9_-]/.test(clave), 'IDEMPOTENCIA_INVALIDA');
  const limpio = Object.fromEntries(campos.filter(k => k !== 'password').map(k => [k, texto(datos[k])]));
  for (const k of ['nombreEmpresa', 'nombreAdministrador']) exigir(limpio[k].length > 0 && limpio[k].length <= 200, 'DATOS_INVALIDOS');
  for (const k of ['correoAutomatizaciones', 'correoAdministrador']) {
    exigir(typeof datos[k] === 'string' && limpio[k].length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio[k]), 'DATOS_INVALIDOS');
    limpio[k] = limpio[k].toLowerCase();
  }
  exigir(typeof datos.password === 'string' && [...datos.password].length >= 16
    && Buffer.byteLength(datos.password, 'utf8') <= 72 && new Set(datos.password).size >= 4, 'PASSWORD_INSEGURA');
  return { limpio, password: datos.password, idempotenciaHash: hash(clave), solicitudHash: hash(JSON.stringify(limpio)) };
};
const modelos = conexion => Object.fromEntries(['Empresa', 'Usuario', 'TareaCorreo'].map(nombre => {
  const schema = require(`../models/${nombre}`).schema.clone().set('autoIndex', false).set('autoCreate', false);
  return [nombre, conexion.models[nombre] || conexion.model(nombre, schema)];
}));
const preparar = async conexion => {
  exigir(conexion?.readyState === 1 && conexion.db, 'CONEXION_REQUERIDA');
  const hello = await conexion.db.admin().command({ hello: 1 });
  exigir(hello.isWritablePrimary === true && hello.logicalSessionTimeoutMinutes !== undefined
    && ((hello.setName && hello.maxWireVersion >= 7) || (hello.msg === 'isdbgrid' && hello.maxWireVersion >= 8)), 'TRANSACCIONES_REQUERIDAS');
  const m = modelos(conexion);
  // El servicio nunca crea índices ni colecciones. Deben provisionarse antes de habilitarlo.
  for (const [modelo, campos] of [[m.Usuario, { email: 1 }], [m.TareaCorreo, { creadoPor: 1, idempotenciaHash: 1 }],
    [m.TareaCorreo, { empresa: 1, tipo: 1, versionAlta: 1 }]]) {
    const indices = await modelo.collection.listIndexes().toArray();
    exigir(indices.some(i => i.unique && !i.sparse && !i.partialFilterExpression && JSON.stringify(i.key) === JSON.stringify(campos)), 'INDICES_REQUERIDOS');
  }
  return m;
};
const salida = (tarea, empresa) => ({ empresaId: String(tarea.empresa), usuarioId: String(tarea.usuario), tareaId: String(tarea._id),
  estadoActivacion: empresa.estadoActivacion });
const registrar = async ({ conexion, actorId, datos, claveIdempotencia }) => {
  const actor = normalizarEmpresaId(actorId);
  exigir(actor, 'ACCESO_DENEGADO');
  const entrada = validar(datos, claveIdempotencia);
  let m;
  try {
    m = await preparar(conexion);
    const autorizar = async session => {
      const usuario = await m.Usuario.findById(actor).select('rol estadoAcceso').session(session || null).lean();
      exigir(usuario?.rol === 'superadmin' && !['pendiente_verificacion', 'bloqueado'].includes(usuario.estadoAcceso), 'ACCESO_DENEGADO');
    };
    await autorizar();
    const filtro = { creadoPor: actor, idempotenciaHash: entrada.idempotenciaHash };
    const recuperar = async session => {
      const tarea = await m.TareaCorreo.findOne(filtro).select('+solicitudHash').session(session || null);
      if (!tarea) return null;
      exigir(tarea.solicitudHash === entrada.solicitudHash, 'IDEMPOTENCIA_CONFLICTO');
      const usuario = await m.Usuario.findOne({ _id: tarea.usuario, empresa: tarea.empresa, rol: 'admin_empresa' }).select('+password').session(session || null);
      const empresa = await m.Empresa.findById(tarea.empresa).session(session || null);
      exigir(empresa && empresa.versionAlta === 1 && empresa.correoAutomatizaciones === entrada.limpio.correoAutomatizaciones
        && usuario?.email === entrada.limpio.correoAdministrador && await usuario.compararPassword(entrada.password), 'IDEMPOTENCIA_CONFLICTO');
      return salida(tarea, empresa);
    };
    try {
      return await conexion.transaction(async session => {
        await autorizar(session);
        const previa = await recuperar(session);
        if (previa) return previa;
        const empresa = new m.Empresa({ nombre: entrada.limpio.nombreEmpresa, correoAutomatizaciones: entrada.limpio.correoAutomatizaciones,
          estado: 'activa', estadoActivacion: 'pendiente_verificacion', versionAlta: 1 });
        await empresa.save({ session });
        const usuario = new m.Usuario({ nombre: entrada.limpio.nombreAdministrador, email: entrada.limpio.correoAdministrador,
          password: entrada.password, rol: 'admin_empresa', empresa: empresa._id, estadoAcceso: 'pendiente_verificacion' });
        await usuario.save({ session });
        const tarea = new m.TareaCorreo({ empresa: empresa._id, usuario: usuario._id, creadoPor: actor, tipo: 'verificar_acceso',
          versionAlta: 1, correoDestino: usuario.email, estado: 'pendiente_configuracion',
          idempotenciaHash: entrada.idempotenciaHash, solicitudHash: entrada.solicitudHash });
        await tarea.save({ session });
        return salida(tarea, empresa);
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000, timeoutMS: 20000 });
    } catch (error) {
      if (error.code === 11000) {
        await autorizar();
        const previa = await recuperar();
        if (previa) return previa;
        throw new ErrorRegistro('EMAIL_DUPLICADO');
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof ErrorRegistro) throw error;
    throw new ErrorRegistro('REGISTRO_NO_COMPLETADO');
  }
};
module.exports = { registrar, ErrorRegistro, validar };
