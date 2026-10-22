const { MongoSessionStore, COLECCION } = require('./mongoSessionStore');
const infra = require('./infraestructuraPilotoService');
// Conexion establecida por el operador. Sin DDL, sin dotenv, sin cambiar flags.
const crearAplicacionPiloto = async ({ conexion, manifiesto, secret, claveStore, diagnostico = () => {} }) => {
  diagnostico('POLITICA');
  infra.asegurarEnvioApagado();
  diagnostico('DESTINO_MONGODB');
  await infra.validarDestinoPiloto(conexion, manifiesto);
  diagnostico('INDICES');
  if (!(await infra.revisarIndices(conexion)).completos) throw Error('INDICES_PILOTO_INCOMPLETOS');
  if (conexion !== require('mongoose').connection) throw Error('CONEXION_GLOBAL_REQUERIDA_POR_MODELOS_EXISTENTES');
  diagnostico('SESIONES_PERSISTENTES');
  const store = new MongoSessionStore({ coleccion: conexion.db.collection(COLECCION), clave: claveStore, ambito: manifiesto.base });
  await store.comprobar();
  diagnostico('APLICACION');
  const app = require('../appFactory').crearApp({ secret, entorno: 'production', store, trustProxy: manifiesto.trustProxy,
    nombreCookie: process.env.PILOT_LOCAL_HTTPS === 'true' ? 'marketing.piloto.sid' : 'marketing.sid' });
  // Marca exclusivamente interna: el arranque normal con MemoryStore no prepara pilotos.
  app.locals.pilotoInfraValidada = true;
  return app;
};
module.exports = { crearAplicacionPiloto };
