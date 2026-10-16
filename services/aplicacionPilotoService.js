const { MongoSessionStore, COLECCION } = require('./mongoSessionStore');
const infra = require('./infraestructuraPilotoService');
// Conexion establecida por el operador. Sin DDL, sin dotenv, sin cambiar flags.
const crearAplicacionPiloto = async ({ conexion, manifiesto, secret, claveStore }) => {
  infra.asegurarEnvioApagado();
  await infra.validarDestinoPiloto(conexion, manifiesto);
  if (!(await infra.revisarIndices(conexion)).completos) throw Error('INDICES_PILOTO_INCOMPLETOS');
  if (conexion !== require('mongoose').connection) throw Error('CONEXION_GLOBAL_REQUERIDA_POR_MODELOS_EXISTENTES');
  const store = new MongoSessionStore({ coleccion: conexion.db.collection(COLECCION), clave: claveStore, ambito: manifiesto.base });
  await store.comprobar();
  const app = require('../appFactory').crearApp({ secret, entorno: 'production', store, trustProxy: manifiesto.trustProxy });
  // Marca exclusivamente interna: el arranque normal con MemoryStore no prepara pilotos.
  app.locals.pilotoInfraValidada = true;
  return app;
};
module.exports = { crearAplicacionPiloto };
