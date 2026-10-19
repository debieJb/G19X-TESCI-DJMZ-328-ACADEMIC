// Persistencia sintética; rutas, controladores, Mongoose, bcrypt y sesiones reales.
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Usuario = require('../../models/Usuario');
const Empresa = require('../../models/Empresa');
const Campana = require('../../models/Campana');
const Contacto = require('../../models/Contacto');
const Conexion = require('../../models/ConexionGmail');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const password = 'frase-solo-fixture-sesiones';
const coincide = (fila, filtro) => Object.entries(filtro).every(([campo, valor]) => {
  if (valor?.$in) return valor.$in.some(v => String(v) === String(fila[campo]));
  if (valor?.$type) return typeof fila[campo] === valor.$type;
  if (valor?.$exists !== undefined) return (fila[campo] !== undefined) === valor.$exists;
  if (valor === null) return fila[campo] == null;
  return String(fila[campo]) === String(valor);
});
const crearFixture = async t => {
  const hash = await bcrypt.hash(password, 4);
  const empresas = [1, 2].map(n => ({ _id: id(n), nombre: 'Empresa ' + n, estado: 'activa', versionAlta: 1,
    estadoActivacion: 'verificada', correoAutomatizaciones: `admin${n}@example.test`, fechaRegistro: new Date() }));
  const usuarios = [
    { _id: id(10), nombre: 'Persona global', email: 'superadmin@example.test', rol: 'superadmin' },
    { _id: id(11), nombre: 'Admin uno', email: 'admin_empresa@example.test', rol: 'admin_empresa', empresa: id(1) },
    { _id: id(12), nombre: 'Operador uno', email: 'operador@example.test', rol: 'operador', empresa: id(1) },
    { _id: id(13), nombre: 'Admin dos', email: 'admin2@example.test', rol: 'admin_empresa', empresa: id(2) },
    { _id: id(14), nombre: 'Operador dos', email: 'operador2@example.test', rol: 'operador', empresa: id(2) }
  ].map(u => ({ ...u, password: hash, estadoAcceso: 'activo', emailVerificadoEn: new Date() }));
  const campanas = [1, 2].map(n => ({ _id: id(20 + n), empresa: id(n), nombre: 'Campaña empresa ' + n,
    objetivo: 'Contenido sintético', canal: 'email', estado: 'borrador', asunto: 'Asunto de prueba', cuerpoTexto: 'Texto de prueba',
    destinatarios: { tipo: 'todos', contactos: [], etiquetas: [] }, creadoPor: usuarios[n]._id, createdAt: new Date(), updatedAt: new Date() }));
  const contactos = [1, 2].map(n => ({ _id: id(30 + n), empresa: id(n), nombre: 'Contacto empresa ' + n,
    email: `contacto${n}@example.test`, activo: true, canales: { email: true }, etiquetas: [], historialConsentimiento: [], createdAt: new Date() }));
  const store = new session.MemoryStore();
  t.after(() => store.clear());
  for (const metodo of ['connect', 'createConnection']) t.mock.method(mongoose, metodo, () => { throw Error('MongoDB real prohibido'); });
  t.mock.method(global, 'fetch', () => { throw Error('Proveedor real prohibido'); });
  t.mock.method(require('../../services/loginLimitesService'), 'consumir', async () => {});
  t.mock.method(require('../../services/ia/proveedores'), 'disponible', () => false);
  t.mock.method(require('../../services/googleOAuthClienteService'), 'estaConfigurado', () => false);
  t.mock.method(Conexion.collection, 'findOne', async () => null);
  for (const [modelo, filas] of [[Usuario, usuarios], [Empresa, empresas], [Campana, campanas], [Contacto, contactos]]) {
    t.mock.method(modelo.collection, 'findOne', async filtro => { const fila = filas.find(f => coincide(f, filtro)); return fila ? { ...fila } : null; });
    t.mock.method(modelo.collection, 'find', filtro => ({ toArray: async () => filas.filter(f => coincide(f, filtro)).map(f => ({ ...f })) }));
    t.mock.method(modelo.collection, 'countDocuments', async filtro => filas.filter(f => coincide(f, filtro)).length);
    t.mock.method(modelo.collection, 'aggregate', () => ({ toArray: async () => empresas.map(e => ({ _id: e._id, total: filas.filter(f => String(f.empresa) === String(e._id)).length })) }));
    t.mock.method(modelo.collection, 'updateOne', async (filtro, update) => {
      const fila = filas.find(f => coincide(f, filtro)); if (!fila) return { matchedCount: 0 };
      Object.assign(fila, update.$set); return { matchedCount: 1 };
    });
  }
  const app = require('../../appFactory').crearApp({ secret: 'secreto-sintetico-sesiones-navegador', store, entorno: 'test' });
  const sesiones = () => new Promise((resolve, reject) => store.all((e, datos) => e ? reject(e) : resolve(datos)));
  const expirar = async usuario => {
    for (const [sid, datos] of Object.entries(await sesiones())) if (!usuario || datos.usuarioId === String(usuario._id)) {
      datos.cookie.expires = new Date(Date.now() - 10000).toISOString();
      await new Promise((resolve, reject) => store.set(sid, datos, e => e ? reject(e) : resolve()));
    }
  };
  return { app, store, usuarios, empresas, campanas, contactos, password, sesiones, expirar };
};
module.exports = { crearFixture };
