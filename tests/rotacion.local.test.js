const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const dotenv = require('dotenv');
const { prepararArchivo, validarPassword, formatoClave, contarCredenciales } = require('../scripts/rotarCredencialesLocales');
const password = 'nueva-fixture-Segura-123!';
const fuente = '# comentario\r\nSESSION_SECRET=sesion-fixture-anterior\r\nSUPERADMIN_PASSWORD=password-fixture-anterior\r\nGMAIL_TOKEN_ENCRYPTION_KEY=clave-fixture-anterior\r\nMONGODB_URI=mongodb://localhost/fixture\r\nGOOGLE_OAUTH_CLIENT_SECRET=secret-fixture\r\nN8N_WEBHOOK_URL=http://localhost/fixture\r\n';

test('rotación local: modifica solo tres valores y mantiene otras configuraciones y comentarios', () => {
  const preparado = prepararArchivo(fuente, password);
  const despues = dotenv.parse(preparado.texto), antes = dotenv.parse(fuente);
  assert.equal(despues.SUPERADMIN_PASSWORD, password);
  assert.notEqual(despues.SESSION_SECRET, antes.SESSION_SECRET); assert.equal(despues.SESSION_SECRET.length, 64);
  assert.ok(formatoClave(despues.GMAIL_TOKEN_ENCRYPTION_KEY));
  for (const nombre of ['MONGODB_URI', 'GOOGLE_OAUTH_CLIENT_SECRET', 'N8N_WEBHOOK_URL']) assert.equal(despues[nombre], antes[nombre]);
  assert.ok(preparado.texto.startsWith('# comentario\r\n')); assert.equal(preparado.texto.replace(/\r\n/g, '').includes('\n'), false);
});

test('rotación local: contraseña con caracteres de PowerShell y dotenv no se interpreta', () => {
  const valor = 'fixture # $() ; & ! seguro';
  assert.equal(dotenv.parse(prepararArchivo(fuente, valor).texto).SUPERADMIN_PASSWORD, valor);
});

test('rotación local: rechaza contraseñas fuera del formato privado sin preparar valores', () => {
  for (const valor of [undefined, '', ' '.repeat(20), 'corta', 'á'.repeat(37), 'fixture-con-"-comillas', 'fixture-con-\n-salto', 'fixture-con-\\-barra']) {
    assert.throws(() => validarPassword(valor), /PASSWORD_INVALIDA/);
  }
});

test('rotación local: variables duplicadas, ausentes o multilínea no se sustituyen', () => {
  for (const valor of [fuente + 'SESSION_SECRET=duplicado\r\n', fuente.replace('SESSION_SECRET=sesion-fixture-anterior\r\n', ''),
    fuente.replace('SESSION_SECRET=sesion-fixture-anterior', 'SESSION_SECRET="sesion-fixture\r\notra-linea"')]) {
    assert.throws(() => prepararArchivo(valor, password), /ARCHIVO_INVALIDO/);
  }
});

test('rotación local: nuevos secretos aleatorios independientes en cada preparación', () => {
  const a = prepararArchivo(fuente, password), b = prepararArchivo(fuente, password);
  assert.notEqual(a.valores.SESSION_SECRET, b.valores.SESSION_SECRET);
  assert.notEqual(a.valores.GMAIL_TOKEN_ENCRYPTION_KEY, b.valores.GMAIL_TOKEN_ENCRYPTION_KEY);
});

for (const caso of ['access', 'refresh', 'revocacion', 'oauth']) {
  test(`rotación local: bloquea modificación si hay credenciales ${caso}`, async () => {
    const db = { collection: nombre => ({ countDocuments: async filtro => {
      if (nombre.includes('conexion')) {
        assert.deepEqual(filtro.$or.map(f => Object.keys(f)[0]), ['accessTokenCifrado', 'refreshTokenCifrado', 'revocacionTokenCifrado']);
        assert.ok(filtro.$or.every(f => Object.values(f)[0].$exists === true));
        return caso === 'oauth' ? 0 : 1;
      }
      assert.ok(filtro.expiraEn.$gt instanceof Date); return caso === 'oauth' ? 1 : 0;
    } }) };
    await assert.rejects(contarCredenciales(db), /TOKENS_EXISTENTES/);
  });
}

test('rotación local: solo autoriza continuar si ambas colecciones están vacías', async () => {
  await contarCredenciales({ collection: () => ({ countDocuments: async () => 0 }) });
});

test('rotación local: CLI sin confirmación no lee contraseña ni aplica operaciones', () => {
  const resultado = spawnSync(process.execPath, [path.join(__dirname, '../scripts/rotarCredencialesLocales.js')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(resultado.status, 1); assert.deepEqual(JSON.parse(resultado.stdout), { fase: 'ERROR', recuperacion: 'SIN_CAMBIOS' });
  assert.equal(resultado.stderr, '');
});
