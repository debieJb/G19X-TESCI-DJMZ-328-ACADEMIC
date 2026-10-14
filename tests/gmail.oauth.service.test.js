const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
for (const [obj, metodo] of [[dotenv, 'config'], [mongoose, 'connect'], [mongoose, 'createConnection'], [mongoose.Connection.prototype, 'openUri']]) {
  mock.method(obj, metodo, () => { throw new Error('Acceso externo prohibido'); });
}
mock.method(global, 'fetch', () => { throw new Error('Sin llamadas externas'); });
const service = require('../services/gmailOAuthService');
const google = require('../services/googleOAuthClienteService');
const cifrado = require('../services/cifradoCredencialesService');
const { crearFixture, A, B, usuario } = require('./soporte/gmailOAuth');
let fixture;
beforeEach(t => { fixture = crearFixture(t); });
const empezar = async (empresa = A, sesion = 'sesion-pruebas') => {
  const url = new URL(await service.iniciar(usuario(empresa), sesion));
  return { state: url.searchParams.get('state'), code: 'codigo-exclusivo-de-pruebas' };
};
const conectar = async (empresa = A) => { await service.completar(usuario(empresa), 'sesion-pruebas', await empezar(empresa)); return fixture.conexiones.get(String(empresa)); };

test('OAuth: URL oficial, permisos mínimos, state opaco, PKCE y nonce; sin client secret', async () => {
  const url = new URL(await service.iniciar(usuario(), 'sesion-pruebas'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), google.SCOPES.join(' '));
  assert.equal(url.searchParams.get('include_granted_scopes'), 'false');
  assert.match(url.searchParams.get('prompt'), /consent/);
  assert.doesNotMatch(String(url), /secreto-exclusivo|refresh-solo|access-solo/);
  const state = url.searchParams.get('state');
  const registro = fixture.estados.get(google.hash(state));
  assert.equal(String(registro.empresa), String(A)); assert.equal(registro.sesionHash, google.hash('sesion-pruebas'));
  const verifier = cifrado.descifrar(registro.verifierCifrado, String(A), `pkce:${registro.hash}`);
  assert.equal(url.searchParams.get('code_challenge'), require('node:crypto').createHash('sha256').update(verifier).digest('base64url'));
  assert.equal(registro.nonceHash, google.hash(url.searchParams.get('nonce')));
  assert.ok(registro.expiraEn.getTime() > Date.now());
});

test('OAuth: callback guarda tokens cifrados y únicamente identidad verificada', async () => {
  const doc = await conectar();
  assert.equal(doc.estado, 'conectada'); assert.equal(doc.email, 'gmail-a@example.test');
  assert.equal(cifrado.descifrar(doc.accessTokenCifrado, String(A), 'access'), 'access-solo-pruebas');
  assert.equal(cifrado.descifrar(doc.refreshTokenCifrado, String(A), 'refresh'), 'refresh-solo-pruebas');
  assert.doesNotMatch(JSON.stringify(doc), /access-solo-pruebas|refresh-solo-pruebas|jwt-solo-pruebas/);
  assert.equal(fixture.estados.size, 0);
  assert.equal(doc.versionConexion, 1);
  assert.equal(doc.id_token, undefined);
});

test('OAuth: cada empresa tiene su conexión y cifrado independientes', async () => {
  const a = await conectar(A);
  fixture.provider.cuenta('google-pruebas-B', 'gmail-b@example.test');
  const b = await conectar(B);
  assert.equal(fixture.conexiones.size, 2);
  assert.notEqual(a.refreshTokenCifrado, b.refreshTokenCifrado);
  assert.equal((await service.obtenerEstado(usuario(A))).email, 'gmail-a@example.test');
  assert.equal((await service.obtenerEstado(usuario(B))).email, 'gmail-b@example.test');
  assert.throws(() => cifrado.descifrar(a.refreshTokenCifrado, String(B), 'refresh'), { codigo: 'CIFRADO' });
});

for (const caso of ['otra_sesion', 'otra_empresa', 'otro_usuario', 'caducado', 'state_manipulado']) {
  test(`OAuth: rechaza ${caso} antes de canjear el código`, async () => {
    const query = await empezar();
    const actor = usuario(); let sesion = 'sesion-pruebas';
    if (caso === 'otra_sesion') sesion = 'otra-sesion';
    if (caso === 'otra_empresa') actor.empresa = B;
    if (caso === 'otro_usuario') actor._id = B;
    if (caso === 'caducado') [...fixture.estados.values()][0].expiraEn = new Date(Date.now() - 1);
    if (caso === 'state_manipulado') query.state = 'x'.repeat(43);
    await assert.rejects(service.completar(actor, sesion, query), { codigo: 'ESTADO_INVALIDO' });
    assert.equal(fixture.provider.canjes.length, 0);
  });
}

test('OAuth: state se consume una sola vez incluso con callbacks concurrentes', async () => {
  const query = await empezar();
  const resultados = await Promise.allSettled([service.completar(usuario(), 'sesion-pruebas', query), service.completar(usuario(), 'sesion-pruebas', query)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'ESTADO_INVALIDO');
  assert.equal(fixture.provider.canjes.length, 1);
});

test('OAuth: autorización denegada consume state y conserva conexión anterior', async () => {
  const doc = await conectar(); const antes = JSON.stringify(doc);
  const query = await empezar(); query.error = 'access_denied';
  await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo: 'RECHAZADA' });
  assert.equal(JSON.stringify(doc), antes);
  assert.equal(fixture.provider.canjes.length, 1);
  await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo: 'ESTADO_INVALIDO' });
});

for (const fallo of ['nonce', 'email_verificado', 'sub', 'id_token', 'scope', 'refresh', 'token_type', 'expiracion']) {
  test(`OAuth: rechaza respuesta inválida de Google (${fallo}) sin marcar conectada`, async () => {
    const query = await empezar();
    const originalTokens = fixture.provider.tokens, originalIdentidad = fixture.provider.identidad;
    fixture.provider.tokens = () => {
      const tokens = originalTokens();
      if (fallo === 'id_token') delete tokens.id_token;
      if (fallo === 'scope') tokens.scope = 'openid email';
      if (fallo === 'refresh') delete tokens.refresh_token;
      if (fallo === 'token_type') tokens.token_type = 'otro';
      if (fallo === 'expiracion') tokens.expiry_date = Date.now() - 1;
      return tokens;
    };
    fixture.provider.identidad = () => ({ ...originalIdentidad(), ...(fallo === 'nonce' ? { nonce: 'manipulado' }
      : fallo === 'email_verificado' ? { email_verified: false } : fallo === 'sub' ? { sub: '' } : {}) });
    const codigo = fallo === 'scope' ? 'SCOPES' : fallo === 'refresh' ? 'REFRESH_AUSENTE' : 'IDENTIDAD';
    await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo });
    assert.equal(fixture.conexiones.get(String(A)).estado, 'desconectada');
    assert.equal(fixture.conexiones.get(String(A)).accessTokenCifrado, undefined);
  });
}

test('OAuth: cuenta Google no puede conectarse a dos empresas', async () => {
  await conectar(A);
  await assert.rejects(conectar(B), { codigo: 'CUENTA_OCUPADA' });
  assert.equal(fixture.conexiones.get(String(A)).estado, 'conectada');
  assert.equal(fixture.conexiones.get(String(B)).estado, 'desconectada');
});

test('OAuth: reconexión de la misma identidad conserva refresh si Google lo omite', async () => {
  await conectar();
  fixture.provider.tokens = () => ({ access_token: 'access-nuevo-pruebas', id_token: 'jwt-solo-pruebas', token_type: 'Bearer',
    expiry_date: Date.now() + 3600000, scope: google.SCOPES.join(' ') });
  const doc = await conectar();
  assert.equal(cifrado.descifrar(doc.refreshTokenCifrado, String(A), 'refresh'), 'refresh-solo-pruebas');
  assert.equal(cifrado.descifrar(doc.accessTokenCifrado, String(A), 'access'), 'access-nuevo-pruebas');
});

test('OAuth: cambiar identidad exige desconectar antes y no hereda refresh', async () => {
  const doc = await conectar(); const antes = JSON.stringify(doc);
  fixture.provider.cuenta('otra-identidad', 'otra@example.test');
  await assert.rejects(conectar(), { codigo: 'CUENTA_DISTINTA' });
  assert.equal(JSON.stringify(doc), antes);
});

test('OAuth: desconexión durante un callback impide que el callback reactive la cuenta', async () => {
  await conectar();
  const query = await empezar(); const tokens = fixture.provider.tokens();
  fixture.provider.canjear = async () => { await service.desconectar(usuario()); return { tokens }; };
  await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo: 'CONFLICTO' });
  assert.equal(fixture.conexiones.get(String(A)).estado, 'desconectada');
});

test('OAuth: desactivación durante intercambio no permite guardar conexión', async () => {
  const query = await empezar();
  fixture.provider.canjear = async () => { fixture.empresas.get(String(A)).estado = 'inactiva'; return { tokens: fixture.provider.tokens() }; };
  await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo: 'EMPRESA_INACTIVA' });
  assert.equal(fixture.conexiones.get(String(A)).estado, 'desconectada');
});

test('OAuth: cambio de client ID invalida autorizaciones pendientes', async () => {
  const query = await empezar(); process.env.GOOGLE_OAUTH_CLIENT_ID = 'otro-pruebas.apps.googleusercontent.com';
  await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo: 'ESTADO_INVALIDO' });
  assert.equal(fixture.provider.canjes.length, 0);
});

test('OAuth: errores del proveedor no revelan código, tokens o secretos', async () => {
  const query = await empezar();
  fixture.provider.canjear = async () => { throw new Error('SECRETO codigo refresh access'); };
  await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), error => {
    assert.equal(error.codigo, 'GOOGLE'); assert.doesNotMatch(error.message, /SECRETO|refresh|codigo/); return true;
  });
});

test('renovación: token vigente se devuelve solo al servicio, sin llamada a Google', async () => {
  await conectar();
  assert.equal(await service.obtenerAccessToken(usuario()), 'access-solo-pruebas');
  assert.equal(fixture.provider.renovaciones, 0);
});

test('renovación: token vencido renueva y preserva refresh cuando Google no devuelve uno nuevo', async () => {
  const doc = await conectar(); doc.expiraEn = new Date(0);
  fixture.provider.renovar = async () => ({ credentials: { access_token: 'renovado-pruebas', token_type: 'Bearer', expiry_date: Date.now() + 3600000 } });
  assert.equal(await service.obtenerAccessToken(usuario()), 'renovado-pruebas');
  assert.equal(cifrado.descifrar(doc.refreshTokenCifrado, String(A), 'refresh'), 'refresh-solo-pruebas');
  assert.equal(doc.bloqueoRenovacion, undefined); assert.equal(doc.versionConexion, 2);
});

test('renovación: invalid_grant marca reconexión solamente en la empresa afectada', async () => {
  const a = await conectar(A); fixture.provider.cuenta('google-pruebas-B', 'b@example.test'); const b = await conectar(B);
  a.expiraEn = new Date(0);
  fixture.provider.renovar = async () => { throw { response: { data: { error: 'invalid_grant', error_description: 'SECRETO' } } }; };
  await assert.rejects(service.obtenerAccessToken(usuario(A)), { codigo: 'RECONEXION' });
  assert.equal(a.estado, 'requiere_reconexion'); assert.equal(a.accessTokenCifrado, undefined);
  assert.equal(b.estado, 'conectada');
});

test('renovación: error temporal conserva conexión y libera bloqueo', async () => {
  const doc = await conectar(); doc.expiraEn = new Date(0);
  fixture.provider.renovar = async () => { throw new Error('Error temporal SECRETO'); };
  await assert.rejects(service.obtenerAccessToken(usuario()), { codigo: 'GOOGLE' });
  assert.equal(doc.estado, 'conectada'); assert.ok(doc.refreshTokenCifrado); assert.equal(doc.bloqueoRenovacion, undefined);
});

test('renovación: bloqueo persistido evita renovaciones concurrentes', async () => {
  const doc = await conectar(); doc.expiraEn = new Date(0); doc.bloqueoHasta = new Date(Date.now() + 45000);
  await assert.rejects(service.obtenerAccessToken(usuario()), { codigo: 'CONFLICTO' });
  assert.equal(fixture.provider.renovaciones, 0);
});

test('renovación: bloqueo vencido se recupera y no reactiva una desconexión concurrente', async () => {
  const doc = await conectar(); doc.expiraEn = new Date(0); doc.bloqueoHasta = new Date(0);
  fixture.provider.renovar = async () => { await service.desconectar(usuario()); return { credentials: fixture.provider.tokens() }; };
  await assert.rejects(service.obtenerAccessToken(usuario()), { codigo: 'CONFLICTO' });
  assert.equal(doc.estado, 'desconectada'); assert.equal(doc.accessTokenCifrado, undefined);
});

test('desconexión: borra tokens de uso, invalida state, revoca y conserva otra empresa', async () => {
  const a = await conectar(A); fixture.provider.cuenta('google-pruebas-B', 'b@example.test'); const b = await conectar(B);
  await empezar(A);
  assert.deepEqual(await service.desconectar(usuario(A)), { revocada: true });
  assert.equal(a.estado, 'desconectada'); assert.equal(a.googleSub, undefined); assert.equal(a.refreshTokenCifrado, undefined);
  assert.equal(a.accessTokenCifrado, undefined); assert.equal(a.revocacionTokenCifrado, undefined);
  assert.equal(b.estado, 'conectada'); assert.equal(fixture.estados.size, 0);
  assert.deepEqual(fixture.provider.revocaciones, ['refresh-solo-pruebas']);
});

test('desconexión: fallo de revocación deshabilita localmente y permite reintentar', async () => {
  const doc = await conectar(); fixture.provider.revocar = async () => { throw new Error('Google no disponible'); };
  assert.deepEqual(await service.desconectar(usuario()), { revocada: false });
  assert.equal(doc.estado, 'revocacion_pendiente'); assert.equal(doc.refreshTokenCifrado, undefined); assert.ok(doc.revocacionTokenCifrado);
  await assert.rejects(service.obtenerAccessToken(usuario()), { codigo: 'SIN_CONEXION' });
  await assert.rejects(service.iniciar(usuario(), 'sesion-pruebas'), { codigo: 'CONFLICTO' });
  fixture.provider.revocar = null;
  assert.deepEqual(await service.desconectar(usuario()), { revocada: true }); assert.equal(doc.revocacionTokenCifrado, undefined);
});

test('desconexión: una empresa inactiva puede revocar pero no conectar o renovar', async () => {
  await conectar(); fixture.empresas.get(String(A)).estado = 'inactiva';
  await assert.rejects(service.iniciar(usuario(), 'sesion-pruebas'), { codigo: 'EMPRESA_INACTIVA' });
  await assert.rejects(service.obtenerAccessToken(usuario()), { codigo: 'EMPRESA_INACTIVA' });
  assert.deepEqual(await service.desconectar(usuario()), { revocada: true });
});

test('desconexión: también cancela la primera autorización pendiente sin llamar a Google', async () => {
  const query = await empezar();
  assert.deepEqual(await service.desconectar(usuario()), { revocada: true });
  await assert.rejects(service.completar(usuario(), 'sesion-pruebas', query), { codigo: 'ESTADO_INVALIDO' });
  assert.equal(fixture.provider.canjes.length, 0); assert.equal(fixture.provider.revocaciones.length, 0);
});

test('desconexión: token ya revocado en Google completa la limpieza idempotente', async () => {
  const doc = await conectar();
  fixture.provider.revocar = async () => { throw { response: { data: { error: 'invalid_token' } } }; };
  assert.deepEqual(await service.desconectar(usuario()), { revocada: true });
  assert.equal(doc.estado, 'desconectada'); assert.equal(doc.revocacionTokenCifrado, undefined);
  assert.deepEqual(await service.desconectar(usuario()), { revocada: true });
});

test('permisos: operador, superadmin, empresa inexistente o IDs inválidos nunca administran Gmail', async () => {
  for (const actor of [{ ...usuario(), rol: 'operador' }, { ...usuario(), rol: 'superadmin' }, { ...usuario(), empresa: null },
    { ...usuario(), empresa: { $ne: null } }, { ...usuario(), _id: 'invalido' }]) {
    for (const metodo of ['obtenerEstado', 'desconectar', 'obtenerAccessToken']) await assert.rejects(service[metodo](actor), { codigo: 'ACCESO_DENEGADO' });
  }
  fixture.empresas.delete(String(A)); await assert.rejects(service.obtenerEstado(usuario()), { codigo: 'ACCESO_DENEGADO' });
  assert.equal(fixture.provider.canjes.length, 0);
});
