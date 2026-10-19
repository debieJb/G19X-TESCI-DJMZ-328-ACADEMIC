'use strict';
const EMPRESA = '6ad574f460d35245e124c9ee';
const NOMBRES = ['Campana', 'EjecucionGmail', 'EnvioGmail', 'ControlEnvioGmail', 'AutorizacionPilotoGmail'];
const exigir = (ok, codigo) => { if (!ok) throw Object.assign(Error(codigo), { codigo }); };
const permitido = () => {
  const p = require('../config/enviosGmail').obtenerPolitica();
  return p.habilitado && !p.automatico && !p.supervisado && p.empresas.length === 1 && p.empresas[0] === EMPRESA;
};
const destino = async conexion => {
  await require('./registroEmpresarialService').validarTopologia(conexion);
  const h = await conexion.db.admin().command({ hello: 1 });
  exigir(conexion.name === 'marketing_automation' && h.setName === 'marketingDevRs'
    && h.isWritablePrimary === true && h.hosts?.length === 1 && h.hosts[0] === 'localhost:27018', 'DESTINO_MANUAL_NO_COINCIDE');
  exigir(await conexion.db.collection('empresas').findOne({ _id: new (require('mongoose').Types.ObjectId)(EMPRESA) }), 'EMPRESA_PILOTO_NO_EXISTE');
};
const plan = conexion => require('./infraestructuraPilotoService').planIndices(conexion).filter(p => NOMBRES.includes(p.modelo));
const igual = (a, i) => JSON.stringify(a.key) === JSON.stringify(i.key)
  && !!a.unique === !!i.options.unique && !a.sparse && !a.hidden && !a.collation
  && JSON.stringify(a.partialFilterExpression) === JSON.stringify(i.options.partialFilterExpression)
  && a.expireAfterSeconds === i.options.expireAfterSeconds;
const inspeccionar = async conexion => {
  await destino(conexion);
  const faltantes = [], conflictos = [];
  for (const p of plan(conexion)) {
    let actuales;
    try { actuales = await conexion.db.collection(p.coleccion).listIndexes().toArray(); }
    catch (e) { if (e.code !== 26) throw e; actuales = []; }
    if (!actuales.length) faltantes.push({ coleccion: p.coleccion, tipo: 'coleccion' });
    for (const i of p.indices) {
      if (actuales.some(a => igual(a, i))) continue;
      const nombre = i.options.name || Object.entries(i.key).map(([k, v]) => `${k}_${v}`).join('_');
      if (actuales.some(a => a.name === nombre || JSON.stringify(a.key) === JSON.stringify(i.key))) conflictos.push(p.coleccion);
      faltantes.push({ coleccion: p.coleccion, tipo: 'indice', ...i });
    }
  }
  exigir(!conflictos.length, 'INDICES_INCOMPATIBLES');
  return faltantes;
};
const verificar = async conexion => exigir(!(await inspeccionar(conexion)).length, 'INDICES_REQUERIDOS');
const migrar = async conexion => {
  // DDL aditivo explícito; nunca se llama desde una petición ni desde el arranque web.
  const faltantes = await inspeccionar(conexion);
  // Comprobar duplicados antes del primer DDL, también en colecciones existentes.
  for (const f of faltantes.filter(f => f.tipo === 'indice' && f.options.unique)) {
    const grupo = Object.fromEntries(Object.keys(f.key).map(k => [k.replaceAll('.', '_'), '$' + k]));
    const duplicados = await conexion.db.collection(f.coleccion).aggregate([
      ...(f.options.partialFilterExpression ? [{ $match: f.options.partialFilterExpression }] : []),
      { $group: { _id: grupo, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $limit: 1 }
    ]).toArray();
    exigir(!duplicados.length, 'DATOS_DUPLICADOS_NO_SE_MODIFICAN');
  }
  for (const f of faltantes) {
    if (f.tipo === 'coleccion') {
      try { await conexion.db.createCollection(f.coleccion); } catch (e) { if (e.code !== 48) throw e; }
    } else await conexion.db.collection(f.coleccion).createIndex(f.key, { ...f.options, writeConcern: { w: 'majority' } });
  }
  await verificar(conexion); // listIndexes real, no confiar en el retorno de createIndex.
  return { coleccionesCreadas: faltantes.filter(f => f.tipo === 'coleccion').length,
    indicesCreados: faltantes.filter(f => f.tipo === 'indice').length, indicesVerificados: true };
};
const prepararArranque = async ({ app, conexion }) => {
  if (!permitido()) return false;
  await verificar(conexion);
  await require('./motorEnviosGmailService').preparar(conexion);
  app.locals.gmailManualValidado = true;
  return true;
};
module.exports = { EMPRESA, permitido, destino, inspeccionar, verificar, migrar, prepararArranque };
