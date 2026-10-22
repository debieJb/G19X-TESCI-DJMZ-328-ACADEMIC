const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const google = require('./googleOAuthClienteService');
const { crearCifradoPlataforma } = require('./cifradoCredencialesService');
const mime = require('./gmailMimeService');
const { crearCorreoTransaccional } = require('./correoTransaccionalService');
const fallo = (codigo, definitivo = true) => Object.assign(new Error(codigo), { codigo, definitivo });
const falloConfiguracion = diagnostico => Object.assign(fallo('CONFIGURACION_TRANSACCIONAL'), { diagnostico });
const exigirConfiguracion = (condicion, diagnostico) => { if (!condicion) throw falloConfiguracion(diagnostico); };
const tokenValido = v => typeof v === 'string' && v.length > 0 && v.length <= 16384 && !/[\s\x00-\x1f\x7f]/.test(v);
const configuracionOAuth = (env = process.env) => {
  const clientId = env.TRANSACTIONAL_GOOGLE_CLIENT_ID, clientSecret = env.TRANSACTIONAL_GOOGLE_CLIENT_SECRET;
  const redirectUri = env.TRANSACTIONAL_GOOGLE_REDIRECT_URI;
  const remitente = env.TRANSACTIONAL_GMAIL_SENDER;
  const archivo = env.TRANSACTIONAL_GMAIL_CREDENTIALS_FILE;
  const key = env.TRANSACTIONAL_GMAIL_ENCRYPTION_KEY;
  exigirConfiguracion(typeof clientId === 'string' && /^[^\s]+\.apps\.googleusercontent\.com$/.test(clientId), 'TX_CLIENT_ID_INVALIDO');
  exigirConfiguracion(tokenValido(clientSecret), 'TX_CLIENT_SECRET_INVALIDO');
  exigirConfiguracion(clientId !== env.GOOGLE_OAUTH_CLIENT_ID && clientSecret !== env.GOOGLE_OAUTH_CLIENT_SECRET, 'TX_CLIENTE_EMPRESARIAL_COMPARTIDO');
  exigirConfiguracion(typeof remitente === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(remitente) && remitente.length <= 320, 'TX_REMITENTE_INVALIDO');
  // Este conector administrativo solo escucha loopback; no se publica en Express.
  exigirConfiguracion(redirectUri === 'http://127.0.0.1:3001/oauth/callback', 'TX_CALLBACK_INVALIDO');
  exigirConfiguracion(typeof archivo === 'string' && !!archivo && path.isAbsolute(archivo), 'TX_RUTA_CREDENCIAL_INVALIDA');
  const relativo = path.relative(path.resolve(__dirname, '..'), path.resolve(archivo));
  exigirConfiguracion(relativo.startsWith('..' + path.sep) || path.isAbsolute(relativo), 'TX_CREDENCIAL_DENTRO_REPOSITORIO');
  let cifrado;
  try { cifrado = crearCifradoPlataforma(key); } catch { throw falloConfiguracion('TX_CLAVE_CIFRADO_INVALIDA'); }
  exigirConfiguracion(key !== env.GMAIL_TOKEN_ENCRYPTION_KEY, 'TX_CLAVE_EMPRESARIAL_COMPARTIDA');
  return { clientId, clientSecret, redirectUri, remitente: remitente.toLowerCase(), archivo,
    hash: google.hash(`${clientId}\n${remitente.toLowerCase()}`), cifrado };
};
// Autorizar una identidad no necesita conocer la web. Enviar sí exige un origen HTTPS real.
const configuracion = (env = process.env) => {
  const config = configuracionOAuth(env);
  try {
    const origen = new URL(env.TRANSACTIONAL_PUBLIC_ORIGIN);
    if (origen.protocol !== 'https:' || origen.username || origen.password || origen.pathname !== '/' || origen.search || origen.hash) throw Error();
    return { ...config, origenPublico: origen.origin };
  } catch { throw falloConfiguracion('TX_ORIGEN_HTTPS_INVALIDO'); }
};
const iniciarOAuth = (config, crearCliente = google.crearCliente) => {
  const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url'), cliente = crearCliente(config);
  let consumido = false;
  const expira = Date.now() + 5 * 60000;
  const url = cliente.generateAuthUrl({ scope: google.SCOPES, access_type: 'offline', prompt: 'consent',
    state, nonce, login_hint: config.remitente, code_challenge_method: 'S256',
    code_challenge: Buffer.from(google.hash(verifier), 'hex').toString('base64url') });
  return { url, async completar(query) {
    const recibido = query.getAll('state');
    if (consumido || Date.now() >= expira || recibido.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(recibido[0])
      || !timingSafeEqual(Buffer.from(recibido[0]), Buffer.from(state))) throw fallo('ESTADO_OAUTH_INVALIDO');
    consumido = true;
    if (query.has('error') || query.getAll('code').length !== 1 || !tokenValido(query.get('code'))) throw fallo('OAUTH_RECHAZADO');
    try {
      const { tokens } = await cliente.getToken({ code: query.get('code'), codeVerifier: verifier, redirect_uri: config.redirectUri });
      const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
      const identidad = ticket.getPayload();
      if (!identidad || identidad.email_verified !== true || identidad.email?.toLowerCase() !== config.remitente
        || identidad.nonce !== nonce || typeof identidad.sub !== 'string' || !identidad.sub || identidad.sub.length > 255
        || !tokenValido(tokens.refresh_token) || !tokens.scope?.split(' ').includes(google.GMAIL_SEND)) throw Error();
      // Identidad y refresh token quedan autenticados y cifrados juntos.
      return config.cifrado.cifrar(JSON.stringify({ version: 1, clienteHash: config.hash, email: config.remitente,
        sub: identidad.sub, refreshToken: tokens.refresh_token }));
    } catch { throw fallo('AUTORIZACION_TRANSACCIONAL_INVALIDA'); }
  } };
};
const cargarCredencial = config => {
  try {
    const stat = fs.lstatSync(config.archivo);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) throw Error();
    const doc = JSON.parse(config.cifrado.descifrar(fs.readFileSync(config.archivo, 'utf8').trim()));
    if (doc.version !== 1 || doc.clienteHash !== config.hash || doc.email !== config.remitente || !tokenValido(doc.refreshToken)) throw Error();
    return doc;
  } catch { throw fallo('CREDENCIAL_TRANSACCIONAL_INVALIDA'); }
};
const crearTransporte = (config, { credencial = cargarCredencial(config), crearCliente = google.crearCliente, solicitar = fetch } = {}) => ({
  async enviar(mensaje, { signal } = {}) {
    if (mensaje.remitente !== config.remitente) throw fallo('REMITENTE_INVALIDO');
    let accessToken;
    try {
      const cliente = crearCliente(config);
      cliente.setCredentials({ refresh_token: credencial.refreshToken });
      const { credentials } = await cliente.refreshAccessToken();
      if (!tokenValido(credentials.access_token)) throw Error();
      accessToken = credentials.access_token;
    } catch { throw fallo('REAUTORIZAR_TRANSACCIONAL'); }
    // Un timeout durante OAuth jamás debe permitir iniciar un envío tardío.
    if (signal?.aborted) throw fallo('ENTREGA_CANCELADA');
    const raw = mime.construir({ remitente: config.remitente, destinatario: mensaje.destino, asunto: mensaje.asunto,
      cuerpoTexto: mensaje.texto, mensajeId: `${randomBytes(32).toString('hex')}@${config.remitente.split('@')[1]}` });
    let respuesta;
    try {
      respuesta = await solicitar('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', redirect: 'manual', signal,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
      if (!respuesta.ok) {
        await respuesta.body?.cancel().catch(() => {});
        throw Object.assign(fallo('GMAIL_TRANSACCIONAL_RECHAZADO', [400, 401, 403, 404, 413, 422, 429].includes(respuesta.status)),
          { requiereAutorizacion: [401, 403].includes(respuesta.status) });
      }
      const reader = respuesta.body?.getReader();
      if (!reader) throw Error();
      const bloques = []; let total = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break;
        total += value.length; if (total > 16384) throw Error(); bloques.push(Buffer.from(value)); }
      } finally { await reader.cancel().catch(() => {}); }
      const json = JSON.parse(Buffer.concat(bloques).toString('utf8'));
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(json.id || '')) throw Error();
      return { aceptado: true, mensajeId: json.id }; // Aceptacion no acredita recepcion.
    } catch (e) { if (e.codigo) throw e; throw fallo('ENTREGA_INCIERTA', false); }
  }
});
const crearCorreo = (env = process.env) => {
  if (env.TRANSACTIONAL_EMAIL_ENABLED !== 'true') return crearCorreoTransaccional();
  const config = configuracion(env);
  return crearCorreoTransaccional({ autorizado: true, remitente: config.remitente, origenPublico: config.origenPublico,
    transporte: crearTransporte(config), timeoutMs: 10000 });
};
module.exports = { configuracion, configuracionOAuth, iniciarOAuth, cargarCredencial, crearTransporte, crearCorreo };
