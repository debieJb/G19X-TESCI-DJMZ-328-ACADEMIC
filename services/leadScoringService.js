'use strict';
const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const EventoMarketing = require('../models/EventoMarketing');
const Contacto = require('../models/Contacto');
const { buscarContacto } = require('./accesoContactosService');
const { filtroEmpresa } = require('./accesoCampanasService');
const CONFIG = require('./configLeadScoring');
const PUNTOS = CONFIG.puntos;
const ORIGENES = ['formulario_propio', 'integracion_verificada', 'registro_administrativo'];
const VENTANA_DIAS = CONFIG.ventanaDias;
const idValido = v => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const fallo = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const nivelDe = puntos => puntos >= CONFIG.prioridadAlta ? 'alto' : puntos >= CONFIG.prioridadMedia ? 'medio' : 'bajo';
function valido(e, ahora, ventana = true) {
  return e && typeof e.tipo === 'string' && Object.hasOwn(PUNTOS, e.tipo) && e.verificado === true && typeof e.evidencia === 'string'
    && e.evidencia.trim().length >= 8 && e.evidencia.length <= 500 && !/[\x00-\x1f]/.test(e.evidencia) && idValido(typeof e.registradoPor === 'string' ? e.registradoPor : e.registradoPor?.toHexString?.())
    && ORIGENES.includes(e.origen) && typeof e.referenciaExterna === 'string' && !!e.referenciaExterna.trim()
    && e.referenciaExterna.length <= 180 && !/[\x00-\x1f]/.test(e.referenciaExterna) && e.ocurridoEn != null && Number.isFinite(+new Date(e.ocurridoEn))
    && +new Date(e.ocurridoEn) <= +ahora && (!ventana || +new Date(e.ocurridoEn) >= +ahora - VENTANA_DIAS * 86400000);
}
function calcularPuntuacion(eventos, ahora = new Date()) {
  if (!Array.isArray(eventos) || !(ahora instanceof Date) || !Number.isFinite(+ahora)) throw new TypeError('Argumentos inválidos');
  const vistos = new Set(); let total = 0, contabilizados = 0;
  const ordenados = eventos.filter(e => valido(e, ahora)).sort((a, b) =>
    +new Date(b.ocurridoEn) - +new Date(a.ocurridoEn) || String(b._id || '').localeCompare(String(a._id || '')) || a.tipo.localeCompare(b.tipo));
  for (const e of ordenados) {
    const clave = `${e.origen}:${e.referenciaExterna}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave); total += PUNTOS[e.tipo]; contabilizados++;
  }
  const puntos = Math.min(100, total);
  return { puntos, nivel: nivelDe(puntos), eventosContabilizados: contabilizados, ventanaDias: VENTANA_DIAS,
    metodo: CONFIG.metodo, esPrediccionConversion: false };
}
async function historial(contacto, ahora = new Date()) {
  const eventos = await EventoMarketing.find({ empresa: contacto.empresa, contacto: contacto._id, verificado: true })
    .sort({ ocurridoEn: -1, _id: -1 }).lean();
  const vistos = new Set();
  const verificados = eventos.filter(e => {
    const clave = e.origen + ':' + e.referenciaExterna;
    if (!valido(e, ahora) || vistos.has(clave)) return false;
    vistos.add(clave); return true;
  });
  const desglose = Object.entries(PUNTOS).map(([tipo, puntos]) => ({ tipo, puntos,
    cantidad: calcularPuntuacion(verificados.filter(e => e.tipo === tipo), ahora).eventosContabilizados }));
  return { ...calcularPuntuacion(eventos, ahora), eventos: eventos.filter(e => valido(e, ahora, false)), desglose,
    ultimaInteraccion: eventos.find(e => valido(e, ahora, false))?.ocurridoEn || null };
}
async function obtenerPuntuacion({ empresaId, contactoId, ahora = new Date() }) {
  if (!idValido(empresaId) || !idValido(contactoId)) throw fallo(400, 'Identificador inválido.');
  if (!await Contacto.exists({ _id: contactoId, empresa: empresaId })) throw fallo(404, 'Contacto no encontrado.');
  const eventos = await EventoMarketing.find({ empresa: empresaId, contacto: contactoId, ocurridoEn: { $gte: new Date(+ahora - VENTANA_DIAS * 86400000), $lte: ahora } })
    .select('tipo origen referenciaExterna ocurridoEn verificado evidencia registradoPor').lean();
  return { contactoId, ...calcularPuntuacion(eventos, ahora) };
}
function validarEntrada(body, ahora = new Date()) {
  const permitidos = ['tipo', 'referenciaExterna', 'ocurridoEn', 'evidencia', 'confirmar', '_csrf'];
  if (!body || Object.keys(body).some(k => !permitidos.includes(k)) || typeof body.tipo !== 'string' || !Object.hasOwn(PUNTOS, body.tipo)
    || body.confirmar !== 'true') throw fallo(400, 'Confirma un tipo de interacción válido y su evidencia.');
  for (const [campo, min, max] of [['evidencia', 8, 500], ['referenciaExterna', 1, 180]]) {
    if (typeof body[campo] !== 'string' || body[campo].trim().length < min || body[campo].length > max || /[\x00-\x1f]/.test(body[campo]))
      throw fallo(400, 'La evidencia y la referencia son obligatorias y deben ser textos válidos.');
  }
  if (typeof body.ocurridoEn !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(body.ocurridoEn)
    || !Number.isFinite(+new Date(body.ocurridoEn)) || +new Date(body.ocurridoEn) > +ahora)
    throw fallo(400, 'Introduce una fecha ISO válida, con zona horaria y no futura.');
  const fecha = body.ocurridoEn;
  const [anio, mes, dia, hora, minuto, segundo] = fecha.match(/\d+/g).slice(0, 6).map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    || hora > 23 || minuto > 59 || segundo > 59) throw fallo(400, 'La fecha no existe en el calendario.');
  return { tipo: body.tipo, referenciaExterna: body.referenciaExterna.trim(), evidencia: body.evidencia.trim(), ocurridoEn: new Date(body.ocurridoEn) };
}
async function registrarEvento({ usuario, contactoId, entrada }) {
  const contacto = await buscarContacto(contactoId, usuario);
  if (!['admin_empresa', 'superadmin'].includes(usuario.rol)) throw fallo(403, 'Solo los administradores pueden verificar interacciones con evidencia.');
  const datos = validarEntrada(entrada);
  const empresa = contacto.empresa, origen = 'registro_administrativo';
  // _id tiene índice único aun cuando autoIndex está desactivado: dos solicitudes concurrentes no suman dos veces.
  const _id = createHash('sha256').update(`${empresa}:${origen}:${datos.referenciaExterna}`).digest('hex').slice(0, 24);
  let duplicado = false;
  try { await EventoMarketing.create({ _id, empresa, contacto: contacto._id, origen, ...datos, verificado: true, registradoPor: usuario._id }); }
  catch (e) {
    if (e.code !== 11000) throw e;
    const previo = await EventoMarketing.findOne({ _id, empresa, contacto: contacto._id }).lean();
    if (!previo || ['tipo', 'referenciaExterna', 'evidencia'].some(k => previo[k] !== datos[k]) || +previo.ocurridoEn !== +datos.ocurridoEn)
      throw fallo(409, 'La referencia ya corresponde a otra interacción.');
    duplicado = true;
  }
  return { duplicado, ...await historial(contacto) };
}
function filtros(query = {}) {
  if (Object.keys(query).some(k => /[\[\]$]/.test(k))) throw fallo(400, 'Filtros inv?lidos.');
  const resultado = {};
  for (const clave of ['prioridad', 'min', 'max', 'etiqueta', 'activo', 'pagina']) {
    if (query[clave] !== undefined && typeof query[clave] !== 'string') throw fallo(400, 'Filtros inválidos.');
    resultado[clave] = query[clave] || '';
  }
  if (resultado.prioridad && !['alto', 'medio', 'bajo'].includes(resultado.prioridad)) throw fallo(400, 'Prioridad inválida.');
  for (const k of ['min', 'max']) if (resultado[k] && (!/^\d{1,3}$/.test(resultado[k]) || +resultado[k] > 100)) throw fallo(400, 'Rango inválido.');
  if (resultado.min && resultado.max && +resultado.min > +resultado.max) throw fallo(400, 'Rango inválido.');
  if (resultado.activo && !['true', 'false'].includes(resultado.activo)) throw fallo(400, 'Estado inválido.');
  if (resultado.etiqueta.length > 100 || (resultado.pagina && (!/^\d{1,6}$/.test(resultado.pagina) || +resultado.pagina < 1))) throw fallo(400, 'Filtros inválidos.');
  return resultado;
}
async function listar(usuario, query, ahora = new Date()) {
  const f = filtros(query), base = filtroEmpresa(usuario);
  if (base.empresa) base.empresa = new mongoose.Types.ObjectId(base.empresa);
  if (f.etiqueta) base.etiquetas = f.etiqueta;
  if (f.activo) base.activo = f.activo === 'true';
  const rango = { $gte: f.min ? +f.min : 0, $lte: f.max ? +f.max : 100 };
  if (f.prioridad) { const [min, max] = { bajo: [0,CONFIG.prioridadMedia - 1], medio: [CONFIG.prioridadMedia,CONFIG.prioridadAlta - 1], alto: [CONFIG.prioridadAlta,100] }[f.prioridad]; rango.$gte = Math.max(rango.$gte,min); rango.$lte = Math.min(rango.$lte,max); }
  const pagina = +(f.pagina || 1), limite = 30;
  const contactos = await Contacto.aggregate([
    { $match: base },
    { $lookup: { from: EventoMarketing.collection.name, let: { contacto: '$_id', empresa: '$empresa' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$contacto','$$contacto'] }, { $eq: ['$empresa','$$empresa'] }] },
        verificado: true, evidencia: { $type: 'string', $regex: /^[^\x00-\x1f]{8,500}$/ }, registradoPor: { $type: 'objectId' },
        origen: { $in: ORIGENES }, referenciaExterna: { $type: 'string', $regex: /^[^\x00-\x1f]{1,180}$/ }, tipo: { $in: Object.keys(PUNTOS) },
        ocurridoEn: { $gte: new Date(+ahora - VENTANA_DIAS * 86400000), $lte: ahora } } },
      { $match: { $expr: { $and: [
        { $eq: ['$verificado', true] },
        ...['tipo', 'origen'].map(campo => ({ $eq: [{ $type: '$' + campo }, 'string'] })),
        { $eq: [{ $type: '$registradoPor' }, 'objectId'] },
        { $eq: [{ $type: '$ocurridoEn' }, 'date'] },
        { $gte: [{ $strLenCP: { $trim: { input: { $cond: [{ $eq: [{ $type: '$evidencia' }, 'string'] }, '$evidencia', ''] } } } }, 8] },
        { $gt: [{ $strLenCP: { $trim: { input: { $cond: [{ $eq: [{ $type: '$referenciaExterna' }, 'string'] }, '$referenciaExterna', ''] } } } }, 0] }
      ] } } },
      { $sort: { ocurridoEn: -1, _id: -1 } },
      { $group: { _id: { origen: '$origen', referencia: '$referenciaExterna' }, tipo: { $first: '$tipo' } } },
      { $group: { _id: null, total: { $sum: { $switch: { branches: Object.entries(PUNTOS).map(([tipo, puntos]) => ({ case: { $eq: ['$tipo', tipo] }, then: puntos })), default: 0 } } } } }
    ], as: 'actividad' } },
    { $set: { puntos: { $min: [100, { $ifNull: [{ $arrayElemAt: ['$actividad.total',0] },0] }] } } },
    { $match: { puntos: rango } }, { $sort: { createdAt: -1, _id: -1 } }, { $skip: (pagina - 1) * limite }, { $limit: limite + 1 }, { $unset: 'actividad' }
  ]);
  return { contactos: contactos.slice(0,limite).map(c => ({ ...c, nivel: nivelDe(c.puntos) })), filtros: f, pagina, ventanaDias: VENTANA_DIAS, hayMas: contactos.length > limite };
}
module.exports = { PUNTOS, calcularPuntuacion, obtenerPuntuacion, historial, registrarEvento, validarEntrada, filtros, listar };
