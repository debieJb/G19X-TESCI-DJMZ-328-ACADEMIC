const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Usuario = require('../../models/Usuario');
const Limite = require('../../models/LimiteRegistro');
const recuperacion = require('../../services/recuperacionPasswordService');
const { crearCorreoTransaccional } = require('../../services/correoTransaccionalService');
const ID = '507f1f77bcf86cd799439011', EMPRESA = '507f1f77bcf86cd799439012';
const PASSWORD = 'Anterior segura para pruebas 2026';
const NUEVA = 'Nueva contraseña privada de pruebas 2026';
const copiar = valor => structuredClone(valor);
const valor = (d, k) => k.split('.').reduce((v, p) => v?.[p], d);
const poner = (d, k, v) => { const campos = k.split('.'); const ultimo = campos.pop(); let actual = d; for (const c of campos) actual = actual[c] ||= {}; actual[ultimo] = v; };
const quitar = (d, k) => { const campos = k.split('.'); const ultimo = campos.pop(); const padre = campos.reduce((v, p) => v?.[p], d); if (padre) delete padre[ultimo]; };
const coincide = (d, f) => Object.entries(f).every(([k, v]) => {
  if (k === '$or') return v.some(x => coincide(d, x));
  if (k === '$and') return v.every(x => coincide(d, x));
  if (k === '$expr') return +d.recuperacion.expiraEn > Date.now();
  const actual = valor(d, k);
  if (v && typeof v === 'object' && !(v instanceof Date) && !v._bsontype) return Object.entries(v).every(([op, argumento]) => {
    if (op === '$exists') return (actual !== undefined) === argumento;
    if (op === '$ne') return String(actual) !== String(argumento);
    if (op === '$in') return argumento.some(x => String(actual) === String(x));
    if (op === '$lte') return actual !== undefined && actual <= argumento;
    if (op === '$gt') return actual !== undefined && actual > argumento;
    throw Error('Operador no cubierto: ' + op);
  });
  return String(actual) === String(v);
});
function actualizar(d, cambio) {
  for (const [k, v] of Object.entries(cambio.$set || {})) poner(d, k, copiar(v));
  for (const k of Object.keys(cambio.$unset || {})) quitar(d, k);
  for (const [k, v] of Object.entries(cambio.$inc || {})) poner(d, k, (valor(d, k) || 0) + v);
}
const consulta = d => ({ select() { return this; }, session() { return this; }, populate() { return this; },
  async lean() { return d?.toObject ? { ...d.toObject(), empresa: d.empresa } : d; },
  then(resolve, reject) { return Promise.resolve(d).then(resolve, reject); } });
async function fixture(t) {
  const datos = [{ _id: ID, empresa: EMPRESA, nombre: 'Persona autorizada', email: 'persona@example.test',
    rol: 'admin_empresa', estadoAcceso: 'activo', versionSesion: 0, password: await bcrypt.hash(PASSWORD, 4) }];
  const contadores = new Map(), mensajes = [], escrituras = [];
  let ahora = new Date();
  for (const metodo of ['connect', 'createConnection']) t.mock.method(mongoose, metodo, () => { throw Error('MONGO_REAL_PROHIBIDO'); });
  t.mock.method(global, 'fetch', () => { throw Error('RED_REAL_PROHIBIDA'); });
  t.mock.method(require('nodemailer'), 'createTransport', () => { throw Error('SMTP_REAL_PROHIBIDO'); });
  const leer = f => { const d = datos.find(d => coincide(d, f)); return d ? Usuario.hydrate(copiar(d)) : null; };
  t.mock.method(Usuario, 'findById', id => consulta(leer({ _id: id })));
  t.mock.method(Usuario, 'findOne', f => consulta(leer(f)));
  t.mock.method(Usuario, 'findOneAndUpdate', (f, cambio) => {
    const d = datos.find(d => coincide(d, f)); if (d) actualizar(d, cambio); return consulta(d ? Usuario.hydrate(copiar(d)) : null);
  });
  t.mock.method(Usuario, 'updateOne', async (f, cambio) => { const d = datos.find(d => coincide(d, f)); if (d) actualizar(d, cambio); return { matchedCount: d ? 1 : 0 }; });
  t.mock.method(Usuario, 'updateMany', async (f, cambio) => { let modificados = 0; for (const d of datos) if (coincide(d, f)) { actualizar(d, cambio); modificados++; } return { modifiedCount: modificados }; });
  // save real de Mongoose: ejecuta validadores y bcrypt antes del CAS en la colección simulada.
  t.mock.method(Usuario.collection, 'updateOne', async (f, cambio) => {
    const d = datos.find(d => coincide(d, f)); escrituras.push({ filtro: f, cambio });
    if (d) actualizar(d, cambio);
    return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 };
  });
  t.mock.method(Limite.collection, 'listIndexes', () => ({ toArray: async () => [{ key: { expiraEn: 1 }, expireAfterSeconds: 0 }] }));
  t.mock.method(Limite, 'findOneAndUpdate', async (f, cambio) => {
    const d = contadores.get(f._id) || { cantidad: 0, expiraEn: cambio.$setOnInsert?.expiraEn };
    d.cantidad++; contadores.set(f._id, d); return { ...d };
  });
  const conexion = { models: { Usuario, LimiteRegistro: Limite }, transaction: async fn => {
    const antes = copiar(datos), limitesAntes = copiar(contadores);
    try { return await fn(null); } catch (e) { datos.splice(0, datos.length, ...antes); contadores.clear(); for (const [k, v] of limitesAntes) contadores.set(k, v); throw e; }
  } };
  const correo = crearCorreoTransaccional({ autorizado: true, simulado: true, remitente: 'plataforma@example.test',
    origenPublico: 'https://plurione.example.test', transporte: { enviar: async mensaje => { mensajes.push(mensaje); return { aceptado: true, mensajeId: 'simulado-' + mensajes.length }; } } });
  const servicio = recuperacion.crearServicio({ conexion, correo, reloj: () => ahora });
  const emitir = async () => { const tarea = await servicio.solicitar(datos[0].email); await servicio.despachar(tarea); return new URL(mensajes.at(-1).texto.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length); };
  return { datos, contadores, mensajes, escrituras, conexion, correo, servicio, emitir, reloj: () => ahora,
    avanzar(ms) { ahora = new Date(+ahora + ms); }, ID, EMPRESA, PASSWORD, NUEVA };
}
module.exports = { fixture, ID, EMPRESA, PASSWORD, NUEVA, copiar };
