// Solo configuración e índices: jamás imprime URI, correos, tokens ni secretos.
const principal = async ({ mongo = false } = {}) => {
  const google = require('../services/googleOAuthClienteService');
  const politica = require('../config/enviosGmail').obtenerPolitica();
  const requeridas = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI', 'GMAIL_TOKEN_ENCRYPTION_KEY', 'MONGODB_URI', 'SESSION_SECRET'];
  const resultado = { faltanVariables: requeridas.filter(k => !process.env[k]), oauthConfigurado: google.estaConfigurado(),
    modoAutomatico: politica.automatico, envioHabilitado: politica.habilitado, empresasHabilitadas: politica.empresas.length,
    limitePorCampana: politica.maxDestinatarios, mongo: 'NO_CONSULTADO', pruebaReal: 'PENDIENTE_AUTORIZACION_REMITENTE_DESTINATARIO_CONTENIDO' };
  if (mongo && process.env.MONGODB_URI) {
    const mongoose = require('mongoose'); let conexion;
    try {
      conexion = await mongoose.createConnection(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 3000 }).asPromise();
      await require('../services/registroEmpresarialService').validarTopologia(conexion);
      await require('../services/motorEnviosGmailService').preparar(conexion);
      resultado.mongo = 'TRANSACCIONES_E_INDICES_DISPONIBLES';
    } catch (e) { resultado.mongo = ['TRANSACCIONES_REQUERIDAS', 'INDICES_REQUERIDOS'].includes(e.codigo) ? e.codigo : e.code === 26 ? 'INDICES_REQUERIDOS' : 'CONEXION_NO_DISPONIBLE'; }
    finally { await conexion?.close(); }
  }
  return resultado;
};
if (require.main === module) {
  require('dotenv').config({ quiet: true });
  principal({ mongo: process.argv.includes('--mongo') }).then(r => console.log(JSON.stringify(r, null, 2))).catch(() => { console.error('DIAGNOSTICO_NO_DISPONIBLE'); process.exitCode = 1; });
}
module.exports = { principal };
