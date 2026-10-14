// Persistencia y proveedor exclusivos de pruebas; nunca autorizan Google real.
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Empresa = require('../../models/Empresa');
const Conexion = require('../../models/ConexionGmail');
const Estado = require('../../models/EstadoOAuth');
const google = require('../../services/googleOAuthClienteService');
const { OAuth2Client } = require('google-auth-library');
const id = n => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
const A = id(1), B = id(2), actor = id(3);
const usuario = empresa => ({ _id: actor, rol: 'admin_empresa', empresa: empresa || A });
const entorno = (t, valores) => {
  const antes = Object.fromEntries(Object.keys(valores).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(valores)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  t.after(() => { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
};
const copiar = doc => doc && ({ ...doc, ...(doc.scopes ? { scopes: [...doc.scopes] } : {}) });
const coincide = (doc, filtro) => !!doc && Object.entries(filtro).every(([k, v]) => {
  if (k === '$or') return v.some(f => coincide(doc, f));
  if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
    if ('$gt' in v) return doc[k] > v.$gt;
    if ('$lte' in v) return doc[k] <= v.$lte;
    if ('$exists' in v) return (doc[k] !== undefined) === v.$exists;
    if ('$ne' in v) return String(doc[k]) !== String(v.$ne);
  }
  return String(doc[k]) === String(v);
});
const consulta = doc => ({
  select() { return this; }, lean: async () => copiar(doc),
  then(resolve, reject) { return Promise.resolve(copiar(doc)).then(resolve, reject); }
});
const crearFixture = t => {
  entorno(t, { NODE_ENV: 'test', GOOGLE_OAUTH_CLIENT_ID: 'solo-pruebas.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secreto-exclusivo-fixture-no-real', GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/empresa/gmail/callback',
    GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
  const empresas = new Map([[String(A), { _id: A, estado: 'activa', nombre: 'Empresa A' }], [String(B), { _id: B, estado: 'activa', nombre: 'Empresa B' }]]);
  const conexiones = new Map(), estados = new Map(), consultas = [], escrituras = [];
  t.mock.method(Empresa, 'findById', empresa => { consultas.push({ tipo: 'empresa', empresa: String(empresa) }); return consulta(empresas.get(String(empresa))); });
  t.mock.method(Conexion, 'findOne', filtro => {
    assert.ok(filtro.empresa); consultas.push({ tipo: 'conexion', filtro });
    return consulta([...conexiones.values()].find(d => coincide(d, filtro)));
  });
  const actualizar = (doc, update) => {
    if (update.$set?.googleSub && [...conexiones.values()].some(c => c !== doc && c.googleSub === update.$set.googleSub)) {
      throw Object.assign(new Error('Índice único simulado'), { code: 11000 });
    }
    Object.assign(doc, update.$set);
    for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
    for (const k of Object.keys(update.$unset || {})) delete doc[k];
  };
  t.mock.method(Conexion, 'findOneAndUpdate', async (filtro, update, opciones) => {
    assert.ok(filtro.empresa); escrituras.push({ filtro, update });
    let doc = [...conexiones.values()].find(d => coincide(d, filtro));
    if (!doc && opciones?.upsert) {
      doc = { ...update.$setOnInsert };
      await new Conexion(doc).validate(); conexiones.set(String(filtro.empresa), doc);
    }
    if (doc) actualizar(doc, update);
    return copiar(doc);
  });
  t.mock.method(Conexion, 'updateOne', async (filtro, update) => {
    assert.ok(filtro.empresa); escrituras.push({ filtro, update });
    const doc = [...conexiones.values()].find(d => coincide(d, filtro));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    actualizar(doc, update); return { matchedCount: 1, modifiedCount: 1 };
  });
  t.mock.method(Estado, 'create', async datos => {
    const doc = new Estado(datos); await doc.validate();
    estados.set(datos.hash, { ...datos }); return doc;
  });
  t.mock.method(Estado, 'findOneAndDelete', filtro => {
    assert.ok(filtro.empresa && filtro.usuario && filtro.sesionHash && filtro.expiraEn.$gt);
    consultas.push({ tipo: 'estado', filtro });
    const doc = [...estados.values()].find(d => coincide(d, filtro));
    if (doc) estados.delete(doc.hash);
    return consulta(doc);
  });
  t.mock.method(Estado, 'deleteMany', async filtro => {
    assert.ok(filtro.empresa);
    for (const [k, doc] of estados) if (coincide(doc, filtro)) estados.delete(k);
    return { acknowledged: true };
  });
  let nonce, identidadSub = 'google-pruebas-A', identidadEmail = 'gmail-a@example.test';
  const provider = { canjes: [], renovaciones: 0, revocaciones: [],
    tokens: () => ({ access_token: 'access-solo-pruebas', refresh_token: 'refresh-solo-pruebas', id_token: 'jwt-solo-pruebas',
      token_type: 'Bearer', expiry_date: Date.now() + 3600000, scope: google.SCOPES.join(' ') }),
    identidad: () => ({ sub: identidadSub, email: identidadEmail, email_verified: true, nonce }),
    generar: null, canjear: null, verificar: null, renovar: null, revocar: null,
    cuenta(sub, email) { identidadSub = sub; identidadEmail = email; }
  };
  const cliente = {
    generateAuthUrl(opciones) {
      nonce = opciones.nonce;
      if (provider.generar) return provider.generar(opciones);
      return new OAuth2Client({ clientId: google.configuracion().clientId, redirectUri: google.configuracion().redirectUri }).generateAuthUrl(opciones);
    },
    async getToken(opciones) { provider.canjes.push(opciones); return provider.canjear ? provider.canjear(opciones) : { tokens: provider.tokens() }; },
    async verifyIdToken(opciones) { if (provider.verificar) return provider.verificar(opciones); return { getPayload: () => provider.identidad() }; },
    setCredentials(credenciales) { this.credentials = credenciales; },
    async refreshAccessToken() { provider.renovaciones++; return provider.renovar ? provider.renovar() : { credentials: provider.tokens() }; },
    async revokeToken(token) { provider.revocaciones.push(token); if (provider.revocar) return provider.revocar(token); return { status: 200 }; }
  };
  const crearClienteMock = t.mock.method(google, 'crearCliente', () => cliente);
  return { empresas, conexiones, estados, consultas, escrituras, provider, cliente, crearClienteMock };
};
module.exports = { crearFixture, entorno, id, A, B, actor, usuario };
