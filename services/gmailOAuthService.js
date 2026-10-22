const { randomBytes, timingSafeEqual } = require('node:crypto');
const Empresa = require('../models/Empresa');
const Conexion = require('../models/ConexionGmail');
const EstadoOAuth = require('../models/EstadoOAuth');
const { normalizarEmpresaId } = require('./accesoEmpresaService');
const { puede } = require('./permisos');
const cifrado = require('./cifradoCredencialesService');
const google = require('./googleOAuthClienteService');
const ErrorGmail = require('./ErrorGmail');
const TOKENS = '+accessTokenCifrado +refreshTokenCifrado +revocacionTokenCifrado';
const camposTokens = ['accessTokenCifrado', 'refreshTokenCifrado', 'revocacionTokenCifrado', 'expiraEn', 'bloqueoRenovacion', 'bloqueoHasta'];
const sinTokens = () => Object.fromEntries(camposTokens.map(campo => [campo, 1]));
const aleatorio = () => randomBytes(32).toString('base64url');
const textoToken = valor => typeof valor === 'string' && !!valor && valor.length <= 16384;
const acceso = async (usuario, activa = false) => {
  const empresa = normalizarEmpresaId(usuario?.empresa);
  if (usuario?.rol !== 'admin_empresa' || !empresa || !puede(usuario, 'gmail.administrar', empresa)
    || !normalizarEmpresaId(usuario?._id)) throw new ErrorGmail('ACCESO_DENEGADO');
  const doc = await Empresa.findById(empresa).select('estado').lean();
  if (!doc) throw new ErrorGmail('ACCESO_DENEGADO');
  if (activa && doc.estado === 'inactiva') throw new ErrorGmail('EMPRESA_INACTIVA');
  if (doc.estado !== undefined && !['activa', 'inactiva'].includes(doc.estado)) throw new ErrorGmail('ACCESO_DENEGADO');
  return empresa;
};
const obtenerEstado = async usuario => {
  const empresa = await acceso(usuario);
  const doc = await Conexion.findOne({ empresa }).select('email estado conectadoEn renovadoEn expiraEn').lean();
  // Lista blanca independiente de select:false (también protege lean()).
  return { estado: doc?.estado || 'desconectada', email: doc?.email || '', conectadoEn: doc?.conectadoEn || null,
    renovadoEn: doc?.renovadoEn || null, expiraEn: doc?.expiraEn || null };
};
const iniciar = async (usuario, sesionId, emailEsperado) => {
  const empresa = await acceso(usuario, true);
  if (emailEsperado !== undefined && !require('./elegibilidadEmailService').emailValido(emailEsperado)) throw new ErrorGmail('IDENTIDAD');
  const config = google.configuracion();
  if (typeof sesionId !== 'string' || !sesionId) throw new ErrorGmail('ESTADO_INVALIDO');
  let conexion;
  try {
    conexion = await Conexion.findOneAndUpdate({ empresa }, { $setOnInsert: { empresa, estado: 'desconectada', versionConexion: 0 } },
      { upsert: true, new: true, runValidators: true });
  } catch (error) { if (error.code === 11000) throw new ErrorGmail('CONFLICTO'); throw error; }
  if (conexion.estado === 'revocacion_pendiente') throw new ErrorGmail('CONFLICTO');
  const state = aleatorio(), nonce = aleatorio(), verifier = aleatorio();
  const stateHash = google.hash(state);
  await EstadoOAuth.create({ hash: stateHash, empresa, usuario: usuario._id, sesionHash: google.hash(sesionId),
    nonceHash: google.hash(nonce), verifierCifrado: cifrado.cifrar(verifier, empresa, `pkce:${stateHash}`),
    clienteOAuthHash: config.hash, versionConexion: conexion.versionConexion, emailEsperado, expiraEn: new Date(Date.now() + 10 * 60 * 1000) });
  return google.crearCliente(config).generateAuthUrl({ access_type: 'offline', prompt: 'consent select_account',
    scope: google.SCOPES, include_granted_scopes: false, state, nonce, ...(emailEsperado ? { login_hint: emailEsperado } : {}),
    code_challenge: require('node:crypto').createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
};
const validarTokens = tokens => {
  if (!textoToken(tokens?.access_token) || tokens.token_type?.toLowerCase() !== 'bearer'
    || !Number.isFinite(tokens.expiry_date) || tokens.expiry_date <= Date.now()) throw new ErrorGmail('IDENTIDAD');
};
const validarScopes = scope => {
  if (typeof scope !== 'string') throw new ErrorGmail('SCOPES');
  const scopes = [...new Set(scope.split(/\s+/).filter(Boolean))];
  if (!scopes.includes(google.GMAIL_SEND) || !scopes.includes('openid')
    || !scopes.some(s => s === 'email' || s === 'https://www.googleapis.com/auth/userinfo.email')) throw new ErrorGmail('SCOPES');
  return scopes;
};
const completar = async (usuario, sesionId, query) => {
  let etapa = 'ACCESO';
  try {
  const empresa = await acceso(usuario, true);
  etapa = 'CONFIGURACION';
  const config = google.configuracion();
  etapa = 'ESTADO_OAUTH';
  if (typeof query?.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(query.state)
    || typeof sesionId !== 'string' || !sesionId) throw new ErrorGmail('ESTADO_INVALIDO');
  // Consumir con DELETE atómico; la caducidad se comprueba aunque TTL no haya corrido.
  const pendiente = await EstadoOAuth.findOneAndDelete({ hash: google.hash(query.state), empresa, usuario: usuario._id,
    sesionHash: google.hash(sesionId), expiraEn: { $gt: new Date() } }).select('+sesionHash +nonceHash +verifierCifrado');
  if (!pendiente || pendiente.clienteOAuthHash !== config.hash) throw new ErrorGmail('ESTADO_INVALIDO');
  if (query.error !== undefined) throw new ErrorGmail('RECHAZADA');
  if (typeof query.code !== 'string' || !query.code || query.code.length > 4096) throw new ErrorGmail('ESTADO_INVALIDO');
  etapa = 'CONEXION';
  const conexion = await Conexion.findOne({ empresa }).select(TOKENS);
  if (!conexion || conexion.versionConexion !== pendiente.versionConexion || conexion.estado === 'revocacion_pendiente') throw new ErrorGmail('CONFLICTO');
  const cliente = google.crearCliente(config);
  let tokens, identidad;
    etapa = 'PKCE';
    const codeVerifier = cifrado.descifrar(pendiente.verifierCifrado, empresa, `pkce:${pendiente.hash}`);
    etapa = 'CANJE_TOKENS';
    ({ tokens } = await cliente.getToken({ code: query.code, codeVerifier, redirect_uri: config.redirectUri }));
    etapa = 'VALIDAR_TOKENS';
    validarTokens(tokens);
    if (!textoToken(tokens.id_token)) throw new ErrorGmail('IDENTIDAD');
    etapa = 'VERIFICAR_ID_TOKEN';
    const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    identidad = ticket.getPayload();
  etapa = 'IDENTIDAD';
  if (!identidad || typeof identidad.sub !== 'string' || !identidad.sub || identidad.sub.length > 255
    || identidad.email_verified !== true || typeof identidad.email !== 'string'
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identidad.email) || identidad.email.length > 320
    || typeof identidad.nonce !== 'string'
    || typeof pendiente.nonceHash !== 'string' || !/^[a-f\d]{64}$/.test(pendiente.nonceHash)
    || !timingSafeEqual(Buffer.from(google.hash(identidad.nonce)), Buffer.from(pendiente.nonceHash))) throw new ErrorGmail('IDENTIDAD');
  etapa = 'SCOPES';
  const scopes = validarScopes(tokens.scope);
  etapa = 'IDENTIDAD';
  if (pendiente.emailEsperado && pendiente.emailEsperado !== identidad.email.toLowerCase()) throw new ErrorGmail('CUENTA_DISTINTA');
  if (conexion.googleSub && conexion.googleSub !== identidad.sub) throw new ErrorGmail('CUENTA_DISTINTA');
  etapa = 'REFRESH_TOKEN';
  let refresh = tokens.refresh_token;
  if (!textoToken(refresh) && conexion.googleSub === identidad.sub && conexion.refreshTokenCifrado && conexion.clienteOAuthHash === config.hash) {
    refresh = cifrado.descifrar(conexion.refreshTokenCifrado, empresa, 'refresh');
  }
  if (!textoToken(refresh)) throw new ErrorGmail('REFRESH_AUSENTE');
  // La empresa pudo desactivarse mientras se esperaba a Google.
  etapa = 'REVALIDAR_EMPRESA';
  await acceso(usuario, true);
  etapa = 'GUARDAR_CONEXION';
  try {
    const resultado = await Conexion.updateOne({ empresa, versionConexion: pendiente.versionConexion, estado: { $ne: 'revocacion_pendiente' } }, {
      $set: { googleSub: identidad.sub, email: identidad.email, estado: 'conectada', scopes, clienteOAuthHash: config.hash,
        accessTokenCifrado: cifrado.cifrar(tokens.access_token, empresa, 'access'), refreshTokenCifrado: cifrado.cifrar(refresh, empresa, 'refresh'),
        expiraEn: new Date(tokens.expiry_date), conectadoEn: new Date(), conectadoPor: usuario._id },
      $inc: { versionConexion: 1 }, $unset: { revocacionTokenCifrado: 1, bloqueoRenovacion: 1, bloqueoHasta: 1 }
    }, { runValidators: true });
    if (!resultado.matchedCount) throw new ErrorGmail('CONFLICTO');
  } catch (error) { if (error.code === 11000) throw new ErrorGmail('CUENTA_OCUPADA'); throw error; }
  } catch (error) {
    require('./diagnosticoGmailOAuthService').registrar(etapa, error);
    if (error instanceof ErrorGmail) throw error;
    throw new ErrorGmail(etapa === 'VERIFICAR_ID_TOKEN' && !error.response && !error.code ? 'IDENTIDAD' : 'GOOGLE');
  }
};

// contexto es exclusivamente interno; nunca se deriva de req.body.
const obtenerAccessToken = async (usuario, contexto = {}) => {
  const ModeloConexion = contexto.Conexion || Conexion;
  const comprobarAcceso = contexto.acceso || acceso;
  const salidaToken = (accessToken, doc, versionConexion = doc.versionConexion) => contexto.conIdentidad
    ? { accessToken, googleSub: doc.googleSub, email: doc.email, versionConexion } : accessToken;
  const empresa = await comprobarAcceso(usuario, true);
  const config = google.configuracion();
  const conexion = await ModeloConexion.findOne({ empresa }).select(TOKENS);
  if (!conexion || conexion.estado === 'desconectada' || conexion.estado === 'revocacion_pendiente') throw new ErrorGmail('SIN_CONEXION');
  if (conexion.estado !== 'conectada' || conexion.clienteOAuthHash !== config.hash) throw new ErrorGmail('RECONEXION');
  if (conexion.expiraEn?.getTime() > Date.now() + 60000 && conexion.accessTokenCifrado) {
    return salidaToken(cifrado.descifrar(conexion.accessTokenCifrado, empresa, 'access'), conexion);
  }
  if (!conexion.refreshTokenCifrado) throw new ErrorGmail('RECONEXION');
  const bloqueo = aleatorio();
  const filtro = { empresa, estado: 'conectada', versionConexion: conexion.versionConexion };
  const tomado = await ModeloConexion.updateOne({ ...filtro, $or: [{ bloqueoHasta: { $exists: false } }, { bloqueoHasta: { $lte: new Date() } }] },
    { $set: { bloqueoRenovacion: bloqueo, bloqueoHasta: new Date(Date.now() + 45000) } });
  if (!tomado.matchedCount) throw new ErrorGmail('CONFLICTO');
  const protegido = { ...filtro, bloqueoRenovacion: bloqueo };
  try {
    const cliente = google.crearCliente(config);
    cliente.setCredentials({ refresh_token: cifrado.descifrar(conexion.refreshTokenCifrado, empresa, 'refresh') });
    const { credentials: tokens } = await cliente.refreshAccessToken();
    validarTokens(tokens);
    if (tokens.scope !== undefined) validarScopes(tokens.scope);
    await comprobarAcceso(usuario, true);
    const resultado = await ModeloConexion.updateOne(protegido, { $set: {
      accessTokenCifrado: cifrado.cifrar(tokens.access_token, empresa, 'access'),
      refreshTokenCifrado: cifrado.cifrar(textoToken(tokens.refresh_token) ? tokens.refresh_token
        : cifrado.descifrar(conexion.refreshTokenCifrado, empresa, 'refresh'), empresa, 'refresh'),
      expiraEn: new Date(tokens.expiry_date), renovadoEn: new Date()
    }, $inc: { versionConexion: 1 }, $unset: { bloqueoRenovacion: 1, bloqueoHasta: 1 } }, { runValidators: true });
    if (!resultado.matchedCount) throw new ErrorGmail('CONFLICTO');
    return salidaToken(tokens.access_token, conexion, conexion.versionConexion + 1);
  } catch (error) {
    if (error.response?.data?.error === 'invalid_grant' || (error instanceof ErrorGmail && error.codigo === 'SCOPES')) {
      await ModeloConexion.updateOne(protegido, { $set: { estado: 'requiere_reconexion' }, $inc: { versionConexion: 1 }, $unset: { accessTokenCifrado: 1, expiraEn: 1, bloqueoRenovacion: 1, bloqueoHasta: 1 } });
      throw new ErrorGmail('RECONEXION');
    }
    if (error instanceof ErrorGmail) throw error;
    throw new ErrorGmail('GOOGLE');
  } finally {
    await ModeloConexion.updateOne(protegido, { $unset: { bloqueoRenovacion: 1, bloqueoHasta: 1 } });
  }
};

const desconectar = async usuario => {
  const empresa = await acceso(usuario); // Permitir limpieza aunque esté inactiva.
  const conexion = await Conexion.findOne({ empresa }).select(TOKENS);
  if (!conexion) { await EstadoOAuth.deleteMany({ empresa }); return { revocada: true }; }
  if (conexion.estado === 'desconectada') {
    const cancelada = await Conexion.updateOne({ empresa, versionConexion: conexion.versionConexion }, { $inc: { versionConexion: 1 } });
    if (!cancelada.matchedCount) throw new ErrorGmail('CONFLICTO');
    await EstadoOAuth.deleteMany({ empresa });
    return { revocada: true };
  }
  // Necesitamos descifrar antes de perder las credenciales. Un fallo de clave no
  // se presenta como desconexión exitosa y permite reparar la configuración.
  const config = google.configuracion();
  const token = conexion.revocacionTokenCifrado
    ? cifrado.descifrar(conexion.revocacionTokenCifrado, empresa, 'revocar')
    : cifrado.descifrar(conexion.refreshTokenCifrado || conexion.accessTokenCifrado, empresa, conexion.refreshTokenCifrado ? 'refresh' : 'access');
  const version = conexion.versionConexion + 1;
  const resultado = await Conexion.updateOne({ empresa, versionConexion: conexion.versionConexion }, {
    $set: { estado: 'revocacion_pendiente', revocacionTokenCifrado: cifrado.cifrar(token, empresa, 'revocar') },
    $inc: { versionConexion: 1 }, $unset: { accessTokenCifrado: 1, refreshTokenCifrado: 1, expiraEn: 1, bloqueoRenovacion: 1, bloqueoHasta: 1 }
  }, { runValidators: true });
  if (!resultado.matchedCount) throw new ErrorGmail('CONFLICTO');
  await EstadoOAuth.deleteMany({ empresa });
  try { await google.crearCliente(config).revokeToken(token); }
  catch (error) {
    // Google devuelve invalid_token cuando ya fue revocado: limpieza idempotente.
    if (error.response?.data?.error !== 'invalid_token') return { revocada: false };
  }
  const limpiado = await Conexion.updateOne({ empresa, versionConexion: version, estado: 'revocacion_pendiente' }, {
    $set: { estado: 'desconectada', scopes: [] }, $unset: { ...sinTokens(), googleSub: 1, email: 1, clienteOAuthHash: 1 }, $inc: { versionConexion: 1 }
  });
  if (!limpiado.matchedCount) throw new ErrorGmail('CONFLICTO');
  return { revocada: true };
};

module.exports = { acceso, obtenerEstado, iniciar, completar, obtenerAccessToken, desconectar };
