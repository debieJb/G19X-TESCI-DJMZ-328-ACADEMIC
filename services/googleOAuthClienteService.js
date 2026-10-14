const { OAuth2Client } = require('google-auth-library');
const { createHash } = require('node:crypto');
const { obtenerClave } = require('./cifradoCredencialesService');
const ErrorGmail = require('./ErrorGmail');
const GMAIL_SEND = 'https://www.googleapis.com/auth/gmail.send';
const SCOPES = Object.freeze(['openid', 'email', GMAIL_SEND]);
const hash = valor => createHash('sha256').update(valor).digest('hex');
const configuracion = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  try {
    if (typeof clientId !== 'string' || !/^[^\s]+\.apps\.googleusercontent\.com$/.test(clientId)
      || typeof clientSecret !== 'string' || !clientSecret.trim() || clientSecret.length > 2048
      || typeof redirectUri !== 'string' || /[\s\\]/.test(redirectUri)) throw new Error();
    const url = new URL(redirectUri);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production'))
      || url.username || url.password || url.search || url.hash || url.pathname !== '/empresa/gmail/callback') throw new Error();
    obtenerClave();
    return { clientId, clientSecret, redirectUri, hash: hash(`${clientId}\n${redirectUri}`) };
  } catch { throw new ErrorGmail('CONFIGURACION'); }
};
const crearCliente = config => {
  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri });
  // La biblioteca incluye políticas de retry propias. Limitarlas también al
  // verificar firmas y revocar, sin reenviar códigos de autorización.
  const request = client.transporter.request.bind(client.transporter);
  client.transporter.request = opciones => {
    const peticion = { ...opciones, timeout: 10000, retry: false, maxRedirects: 0 };
    const url = new URL(String(peticion.url));
    // La biblioteca construye la revocación con token en query. Pasarlo en el
    // cuerpo reduce su exposición en registros de infraestructura de salida.
    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/revoke' && url.searchParams.has('token')) {
      peticion.url = `${url.origin}${url.pathname}`;
      peticion.data = new URLSearchParams({ token: url.searchParams.get('token') });
      peticion.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    }
    return request(peticion);
  };
  return client;
};
const estaConfigurado = () => { try { configuracion(); return true; } catch { return false; } };
module.exports = { configuracion, crearCliente, estaConfigurado, hash, GMAIL_SEND, SCOPES };
