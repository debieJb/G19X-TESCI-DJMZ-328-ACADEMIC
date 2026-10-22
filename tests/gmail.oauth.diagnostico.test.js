const { test } = require('node:test');
const assert = require('node:assert/strict');
const diagnostico = require('../services/diagnosticoGmailOAuthService');
const service = require('../services/gmailOAuthService');
const { crearFixture, usuario, A } = require('./soporte/gmailOAuth');

test('diagnóstico OAuth: lista cerrada no serializa secretos, códigos, URL ni respuestas', t => {
  const salida = [];
  t.mock.method(console, 'error', (...args) => salida.push(args));
  const secreto = 'NO_PUBLICAR_DATO_SINTETICO';
  diagnostico.registrar(secreto, { message: secreto, code: secreto, codigo: secreto,
    response: { status: 400, data: { error: secreto, error_description: secreto, access_token: secreto } },
    request: { headers: { cookie: secreto } }, toJSON() { throw Error('NO_SERIALIZAR'); } });
  assert.deepEqual(JSON.parse(salida[0][1]), { etapa: 'NO_CLASIFICADA', codigo: 'HTTP_400' });
  assert.ok(!JSON.stringify(salida).includes(secreto));
  for (const codigo of ['invalid_client', 'invalid_grant', 'redirect_uri_mismatch']) {
    assert.equal(diagnostico.codigoSeguro({ response: { data: { error: codigo } } }), codigo.toUpperCase());
  }
  assert.equal(diagnostico.codigoSeguro({ cause: { code: 'ETIMEDOUT' } }), 'ETIMEDOUT');
});

for (const caso of ['canje_cliente', 'canje_grant', 'certificados', 'firma', 'id_token_ausente', 'persistencia', 'exito']) {
  test(`diagnóstico OAuth: etapa exacta y estado preservado (${caso})`, async t => {
    const fixture = crearFixture(t), lineas = [];
    t.mock.method(console, 'error', (...args) => lineas.push(JSON.parse(args[1])));
    const url = new URL(await service.iniciar(usuario(), 'sesion-sintetica'));
    const query = { state: url.searchParams.get('state'), code: 'codigo-sintetico-de-un-solo-uso' };
    const privado = 'NO_PUBLICAR_DATO_SINTETICO';
    if (caso.startsWith('canje_')) fixture.provider.canjear = async () => { throw { message: privado,
      response: { data: { error: caso === 'canje_cliente' ? 'invalid_client' : 'invalid_grant', error_description: privado } } }; };
    if (caso === 'certificados') fixture.provider.verificar = async () => { throw Object.assign(Error(privado), { code: 'ECONNRESET' }); };
    if (caso === 'firma') fixture.provider.verificar = async () => { throw Error(privado); };
    if (caso === 'id_token_ausente') { const tokens = fixture.provider.tokens(); delete tokens.id_token; fixture.provider.tokens = () => tokens; }
    if (caso === 'persistencia') t.mock.method(require('../models/ConexionGmail'), 'updateOne', async () => { throw Error(privado); });
    if (caso === 'exito') {
      await service.completar(usuario(), 'sesion-sintetica', query);
      assert.equal(fixture.conexiones.get(String(A)).estado, 'conectada'); assert.deepEqual(lineas, []); return;
    }
    await assert.rejects(service.completar(usuario(), 'sesion-sintetica', query), { codigo: ['firma', 'id_token_ausente'].includes(caso) ? 'IDENTIDAD' : 'GOOGLE' });
    const etapas = { canje_cliente: 'CANJE_TOKENS', canje_grant: 'CANJE_TOKENS', certificados: 'VERIFICAR_ID_TOKEN',
      firma: 'VERIFICAR_ID_TOKEN', id_token_ausente: 'VALIDAR_TOKENS', persistencia: 'GUARDAR_CONEXION' };
    assert.equal(lineas.length, 1); assert.equal(lineas[0].etapa, etapas[caso]);
    assert.equal(fixture.conexiones.get(String(A)).estado, 'desconectada');
    assert.ok(!JSON.stringify(lineas).includes(privado));
    // State consumido: ni siquiera un fallo de canje permite reutilizar el código.
    const canjes = fixture.provider.canjes.length;
    await assert.rejects(service.completar(usuario(), 'sesion-sintetica', query), { codigo: 'ESTADO_INVALIDO' });
    assert.equal(fixture.provider.canjes.length, canjes);
  });
}
