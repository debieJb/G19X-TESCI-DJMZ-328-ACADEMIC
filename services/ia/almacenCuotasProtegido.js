const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const { crearModeloProtegido } = require('../../models/UsoIA');
const BASE = 'plurione_ai_quota';
const ROL = 'plurione_ia_quota_runtime';
const ACCIONES = ['find', 'insert', 'listIndexes', 'update'];
const exigir = condicion => { if (!condicion) throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS'); };

const uriInfo = uri => {
  exigir(typeof uri === 'string' && uri.length > 0 && !/[\r\n\0]/.test(uri));
  let url;
  try { url = new URL(uri); } catch { throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS'); }
  exigir(['mongodb:', 'mongodb+srv:'].includes(url.protocol));
  let base;
  try { base = decodeURIComponent(url.pathname.replace(/^\//, '')); } catch { throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS'); }
  exigir(base === BASE);
  return { base, srv: url.protocol === 'mongodb+srv:' };
};

const configuracion = (env = process.env) => {
  exigir(['development', 'test', 'production'].includes(env.NODE_ENV));
  const uri = uriInfo(env.AI_QUOTA_MONGODB_URI);
  const principal = uriInfoPrincipal(env.MONGODB_URI);
  exigir(principal !== BASE);
  return { uri: env.AI_QUOTA_MONGODB_URI, base: uri.base, srv: uri.srv };
};
const uriInfoPrincipal = uri => {
  if (typeof uri !== 'string' || !uri) throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS');
  let url;
  try { url = new URL(uri); } catch { throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS'); }
  let base;
  try { base = decodeURIComponent(url.pathname.replace(/^\//, '')); } catch { throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS'); }
  return base;
};

const validarPrivilegios = privilegios => {
  exigir(Array.isArray(privilegios) && privilegios.length === 1);
  const p = privilegios[0];
  exigir(p?.resource?.db === BASE && p.resource.collection === 'usoias'
    && Array.isArray(p.actions) && p.actions.length === ACCIONES.length
    && [...p.actions].sort().join(',') === [...ACCIONES].sort().join(','));
};
const validarIdentidad = ({ conexion, hello, estado, tls } = {}) => {
  exigir(conexion && conexion !== mongoose.connection && conexion.readyState === 1 && conexion.name === BASE);
  exigir(hello && hello.msg !== 'isdbgrid' && hello.setName !== 'marketingDevRs');
  const hosts = conexion.getClient()?.options?.hosts;
  exigir(Array.isArray(hosts) && hosts.length > 0);
  const loopback = hosts.every(h => ['localhost', '127.0.0.1', '::1'].includes(h.host));
  if (!loopback) exigir(tls === true);
  const usuarios = estado?.authInfo?.authenticatedUsers || [];
  const roles = estado?.authInfo?.authenticatedUserRoles || [];
  exigir(usuarios.length === 1 && roles.length === 1
    && roles[0].role === ROL && roles[0].db === BASE);
  validarPrivilegios(estado.authInfo.authenticatedUserPrivileges);
};
const validarIndices = indices => {
  exigir(Array.isArray(indices) && indices.length === 3);
  const unico = indices.find(i => i.name === 'empresa_1_ventana_1');
  const ttl = indices.find(i => i.name === 'expiraEn_1');
  exigir(unico?.unique === true && JSON.stringify(unico.key) === JSON.stringify({ empresa: 1, ventana: 1 })
    && !unico.sparse && !unico.partialFilterExpression && unico.expireAfterSeconds === undefined);
  exigir(ttl && JSON.stringify(ttl.key) === JSON.stringify({ expiraEn: 1 }) && ttl.expireAfterSeconds === 0
    && !ttl.unique && !ttl.sparse && !ttl.partialFilterExpression);
  exigir(indices.some(i => i.name === '_id_' && JSON.stringify(i.key) === JSON.stringify({ _id: 1 })));
};

const identidadActual = async conexion => {
  exigir(conexion?.readyState === 1 && conexion.name === BASE);
  const admin = conexion.db.admin();
  const [hello, estado] = await Promise.all([
    admin.command({ hello: 1 }),
    admin.command({ connectionStatus: 1, showPrivileges: true })
  ]);
  validarIdentidad({ conexion, hello, estado, tls: conexion.getClient().options.tls === true });
};

let pendiente, claveActual;
const cerrar = async () => {
  const conexion = pendiente;
  pendiente = undefined; claveActual = undefined;
  if (conexion) await conexion.then(c => c.close()).catch(() => {});
};
const abrir = async () => {
  const config = configuracion();
  const huella = createHash('sha256').update(config.uri).digest('hex');
  if (pendiente && claveActual !== huella) throw new Error('CUOTAS_PROTEGIDAS_CONFIGURACION_CAMBIADA');
  if (!pendiente) {
    claveActual = huella;
    pendiente = (async () => {
      const conexion = mongoose.createConnection(config.uri, {
        dbName: BASE, autoCreate: false, autoIndex: false, bufferCommands: false,
        serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000, socketTimeoutMS: 10000
      });
      try {
        await conexion.asPromise();
        await identidadActual(conexion);
        const Uso = crearModeloProtegido(conexion);
        return { conexion, Uso };
      } catch {
        await conexion.close().catch(() => {});
        throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS');
      }
    })();
  }
  let almacen;
  try { almacen = await pendiente; await identidadActual(almacen.conexion); }
  catch { await cerrar(); throw new Error('CUOTAS_PROTEGIDAS_NO_AUTORIZADAS'); }
  return almacen;
};
const obtener = async empresa => {
  exigir(typeof empresa === 'string' && /^[a-f\d]{24}$/i.test(empresa));
  const { Uso } = await abrir();
  validarIndices(await Uso.collection.listIndexes().toArray());
  return Uso;
};

module.exports = { BASE, ROL, ACCIONES, configuracion, validarPrivilegios, validarIdentidad,
  validarIndices, identidadActual, obtener, cerrar };
