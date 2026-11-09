'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
test('contrato limpio contiene exclusivamente configuracion publica esperada', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'infra/mongodb-clean.profile.json'), 'utf8'));
  assert.deepEqual(profile, {
    schemaVersion: 1, id: 'plurione-clean-v1', port: 27030, bindIp: '127.0.0.1',
    replicaSet: 'pluriOneCleanRs', member: 'localhost:27030', database: 'plurione_clean',
    rootEnvironmentVariable: 'PLURIONE_MONGO_CLEAN_ROOT', defaultRoot: '../plurione-clean-mongo',
    directories: ['data', 'logs', 'config', 'secrets', 'state']
  });
});
test('preflight PowerShell con adaptadores completamente sinteticos y AST de lectura', { skip: process.platform !== 'win32' }, t => {
  // This fixture imports function ASTs only and supplies every OS adapter.
  // Never runs production main, CIM, ACL, listener discovery or Mongo executables.
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const command = `& ([scriptblock]::Create([IO.File]::ReadAllText(${quote(path.join(__dirname, 'mongoClean.preflight.fixture.ps1'))}))) -Repository ${quote(root)}`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /ISOLATED_CASES_PASSED=\d+; AST_READ_ONLY_OK/);
  t.diagnostic(result.stdout.trim());
});

const { clasificar, ejecutar, GUARDS } = require('../scripts/mongoClean/diagnostico');
const capture = (value, status = 1, stderr = '') => ({ status, stdout: JSON.stringify(value), stderr });
test('captura separada distingue politica y errores de ejecucion sin revelar stderr', () => {
  for (const stderr of ['PSSecurityException; FullyQualifiedErrorId: UnauthorizedAccess; PRIVATE', 'running scripts is disabled: PRIVATE', 'no esta firmado digitalmente: PRIVATE']) {
    assert.equal(clasificar({ status: 1, stdout: '', stderr }).result, 'PREFLIGHT_POLICY_BLOCKED');
  }
  for (const input of [{ error: Error('PRIVATE') }, { status: null, signal: 'SIGTERM' }, { status: 1, stdout: '', stderr: 'AccessDenied PRIVATE' }, { status: 1, stdout: '{broken', stderr: '' }]) {
    const result = clasificar(input);
    assert.equal(result.result, 'PREFLIGHT_EXECUTION_ERROR');
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});
test('diagnosticos internos usan lista permitida y verifican codigo de retorno', () => {
  for (const code of GUARDS) {
    const value = { result: 'PREFLIGHT_REJECTED', stage: 'PREFLIGHT', code, private: 'PRIVATE' };
    assert.deepEqual(clasificar(capture(value)), { result: value.result, stage: value.stage, code });
    assert.equal(clasificar(capture(value, 0)).result, 'PREFLIGHT_EXECUTION_ERROR');
  }
  assert.equal(clasificar(capture({ result: 'PREFLIGHT_REJECTED', stage: 'PREFLIGHT', code: 'PRIVATE' })).code, 'INVALID_DIAGNOSTIC');
  assert.equal(clasificar(capture({ result: 'PREFLIGHT_EXECUTION_ERROR', stage: 'EXECUTION', code: 'INTERNAL_EXECUTION_ERROR' })).code, 'INTERNAL_EXECUTION_ERROR');
  const success = { result: 'PREFLIGHT_READ_ONLY_OK', root: 'PRIVATE', identityValidated: false, installationValidated: false };
  assert.deepEqual(clasificar(capture(success, 0)), { result: success.result, identityValidated: false, installationValidated: false });
  assert.equal(clasificar(capture(success, 0, 'unexpected')).result, 'PREFLIGHT_EXECUTION_ERROR');
  assert.equal(clasificar(capture({ ...success, identityValidated: true }, 0)).result, 'PREFLIGHT_EXECUTION_ERROR');
});
test('lanzador se prueba solo con doble: sin shell, sin politica alternativa y flujos separados', () => {
  let calls = 0;
  const result = ejecutar((exe, args, options) => {
    calls++;
    assert.equal(exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-File']);
    assert.equal(args.at(-1), path.join(root, 'scripts/mongoClean/preflight.ps1'));
    assert.equal(options.shell, false);
    assert.equal(options.encoding, 'buffer');
    return { status: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('PSSecurityException; FullyQualifiedErrorId: UnauthorizedAccess; PRIVATE') };
  }, { SystemRoot: 'C:\\Windows' });
  assert.equal(calls, 1);
  assert.equal(result.result, 'PREFLIGHT_POLICY_BLOCKED');
  assert.equal(ejecutar(() => { throw Error('PRIVATE'); }, { SystemRoot: 'C:\\Windows' }).code, 'PROCESS_FAILED');
  assert.equal(ejecutar(() => { throw Error('MUST_NOT_RUN'); }, {}).code, 'PROCESS_FAILED');
});

const oemSpanish = text => Buffer.from(Array.from(text, char => ({ 'ó': 0xa2, 'í': 0xa1, 'á': 0xa0, 'é': 0x82, 'ñ': 0xa4 }[char] ?? char.charCodeAt(0))));
const utf16be = text => Buffer.from(text, 'utf16le').swap16();
const encodings = {
  utf8: text => Buffer.from(text, 'utf8'),
  utf8BOM: text => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]),
  utf16le: text => Buffer.from(text, 'utf16le'),
  utf16leBOM: text => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
  utf16be: utf16be,
  utf16beBOM: text => Buffer.concat([Buffer.from([0xfe, 0xff]), utf16be(text)]),
  windows1252: text => Buffer.from(text, 'latin1'),
  cp850: oemSpanish
};
test('mensajes concretos ES/EN, ANSI/OEM/Unicode y saltos de linea identifican autorizacion', () => {
  const messages = [
    'File SYNTHETIC.ps1 cannot be loaded because running scripts is disabled on this system. PRIVATE',
    'No se puede cargar el archivo SYNTHETIC.ps1 porque la ejecución de scripts está\r\ndeshabilitada en este sistema. PRIVATE',
    'No se puede cargar el archivo SYNTHETIC.ps1 porque se ha deshabilitado la ejecución de scripts en este sistema. PRIVATE',
    'SYNTHETIC.ps1 is not digitally signed. PRIVATE',
    'SYNTHETIC.ps1 no está firmado digitalmente. PRIVATE',
    'CategoryInfo: SecurityError: (:) [], PSSecurityException\r\nFullyQualifiedErrorId: UnauthorizedAccess PRIVATE'
  ];
  for (const encode of Object.values(encodings)) for (const message of messages) {
    const expected = { result: 'PREFLIGHT_POLICY_BLOCKED', stage: 'AUTHORIZATION', code: 'POWERSHELL_POLICY_BLOCKED' };
    assert.deepEqual(clasificar({ status: 1, stdout: Buffer.alloc(0), stderr: encode(message) }), expected);
    // A failed host can place its unstructured authorization message in stdout.
    assert.deepEqual(clasificar({ status: 1, stdout: encode(message), stderr: Buffer.alloc(0) }), expected);
  }
  const xml = '#< CLIXML\r\n<Objs><S S="Error">running scripts is_x000D__x000A_disabled on this system</S></Objs>';
  assert.equal(clasificar({ status: 1, stdout: '', stderr: xml }).result, 'PREFLIGHT_POLICY_BLOCKED');
});
test('JSON con BOM y UTF16 se acepta sin publicar campos privados', () => {
  const value = { result: 'PREFLIGHT_REJECTED', stage: 'PREFLIGHT', code: 'PUERTO_OCUPADO', private: 'PRIVATE' };
  for (const encode of Object.values(encodings)) {
    assert.deepEqual(clasificar({ status: 1, stdout: encode(JSON.stringify(value)), stderr: Buffer.alloc(0) }), {
      result: value.result, stage: value.stage, code: value.code
    });
  }
});
test('Restricted, errores genericos, salida vacia y texto desconocido nunca prueban bloqueo', () => {
  for (const text of ['', 'Restricted', 'AccessDenied', 'UnauthorizedAccess', 'PSSecurityException', 'PRIVATE unknown failure', 'ParserError PRIVATE', 'not JSON PRIVATE']) {
    for (const stream of ['stdout', 'stderr']) {
      const input = { status: 1, stdout: '', stderr: '', effectivePolicy: 'Restricted', [stream]: Buffer.from(text) };
      const result = clasificar(input);
      assert.equal(result.result, 'PREFLIGHT_EXECUTION_ERROR');
      assert.equal(result.code, text ? 'UNSTRUCTURED_OUTPUT' : 'EMPTY_OUTPUT');
      assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    }
  }
  assert.equal(clasificar({ status: 0, stdout: '', stderr: 'running scripts is disabled' }).result, 'PREFLIGHT_EXECUTION_ERROR');
  assert.equal(clasificar(capture({ result: 'other', private: 'running scripts is disabled' })).code, 'INVALID_DIAGNOSTIC');
});
test('errores del hijo tienen prioridad sobre texto, no se revelan y no causan reintentos', () => {
  for (const code of ['ENOENT', 'EACCES', 'ETIMEDOUT', 'ENOBUFS']) {
    let calls = 0;
    const result = ejecutar(() => { calls++; return { status: 1, error: Object.assign(Error('PRIVATE'), { code }), stderr: Buffer.from('running scripts is disabled') }; }, { SystemRoot: 'C:\\Windows' });
    assert.equal(calls, 1);
    assert.deepEqual(result, { result: 'PREFLIGHT_EXECUTION_ERROR', stage: 'EXECUTION', code: 'PROCESS_FAILED' });
  }
  for (const input of [{ status: null }, { status: 1, signal: 'SIGTERM' }, { status: undefined }]) {
    assert.equal(clasificar(input).code, 'PROCESS_FAILED');
  }
});
test('regresiones sinteticas demuestran perdidas previas sin atribuirles el intento real', () => {
  const spanish = 'se ha deshabilitado la ejecución de scripts en este sistema';
  const oldPattern = /PSSecurityException|running scripts is disabled|execution of scripts is disabled|ejecuci[oó]n de scripts est[aá] deshabilitada|not digitally signed|no est[aá] firmado digitalmente/i;
  assert.equal(oldPattern.test(spanish), false);
  assert.equal(clasificar({ status: 1, stdout: '', stderr: spanish }).result, 'PREFLIGHT_POLICY_BLOCKED');
  const json = JSON.stringify({ result: 'PREFLIGHT_REJECTED', stage: 'PREFLIGHT', code: 'PUERTO_OCUPADO' });
  const bytes = Buffer.from(json, 'utf16le');
  assert.throws(() => JSON.parse(bytes.toString('utf8')));
  assert.equal(clasificar({ status: 1, stdout: bytes, stderr: '' }).result, 'PREFLIGHT_REJECTED');
});
