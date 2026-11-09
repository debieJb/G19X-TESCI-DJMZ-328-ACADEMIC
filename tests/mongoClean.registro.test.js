'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { resumir } = require('../scripts/mongoClean/diagnostico');
const { guardarCaptura, ejecutarConRegistro } = require('../scripts/mongoClean/registro');
const privateText = 'SYNTHETIC_SECRET_TOKEN C:\\Users\\synthetic-private\\document.txt user@example.invalid';
const capture = (stdout = '', stderr = '', status = 1) => ({ stdout, stderr, status });

function privado(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plurione-record-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('plurione-record-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  if (process.platform === 'win32') {
    const script = "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; $d=$env:MONGO_RECORD_TEST; $me=[Security.Principal.WindowsIdentity]::GetCurrent().User; $a=Get-Acl -LiteralPath $d; $a.SetAccessRuleProtection($true,$false); foreach($r in @($a.Access)){$a.RemoveAccessRuleSpecific($r)}; $a.SetOwner($me); $a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($me,'FullControl','ContainerInherit,ObjectInherit','None','Allow')); Set-Acl -LiteralPath $d -AclObject $a";
    execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env: { ...process.env, MONGO_RECORD_TEST: directory }, windowsHide: true });
  } else fs.chmodSync(directory, 0o700);
  return { directory };
}

test('registro proyecta exclusivamente campos permitidos y elimina datos privados', t => {
  const config = privado(t);
  const input = { ...capture(JSON.stringify({ result: 'PREFLIGHT_REJECTED', stage: 'PREFLIGHT', code: 'PUERTO_OCUPADO', private: privateText }), privateText), private: privateText };
  let persisted;
  guardarCaptura(input, 'synthetic.log', config, (destination, data, options) => {
    assert.equal(destination, path.join(config.directory, 'synthetic.log'));
    assert.deepEqual(options, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    persisted = JSON.parse(data);
  });
  assert.deepEqual(Object.keys(persisted), ['schemaVersion', 'diagnostic', 'process', 'stdout', 'stderr']);
  assert.deepEqual(Object.keys(persisted.stdout), ['size', 'bom', 'validUtf8', 'alternatingNul', 'legacyCandidates', 'blank', 'json', 'authorizationEvidence']);
  assert.equal(persisted.diagnostic.code, 'UNEXPECTED_STDERR');
  for (const text of ['SYNTHETIC_SECRET_TOKEN', 'synthetic-private', 'example.invalid', 'private']) assert.ok(!JSON.stringify(persisted).includes(text));
});

test('salida vacia, espacios, JSON roto y JSON incompatible conservan estructura sin texto', () => {
  for (const input of [capture(), capture(' \r\n'), capture('{broken ' + privateText), capture('null'), capture('[]'), capture('42')]) {
    const report = resumir(input);
    assert.equal(report.diagnostic.result, 'PREFLIGHT_EXECUTION_ERROR');
    assert.ok(!JSON.stringify(report).includes('SYNTHETIC_SECRET_TOKEN'));
  }
  assert.equal(resumir(capture()).diagnostic.code, 'EMPTY_OUTPUT');
  assert.equal(resumir(capture('{broken')).diagnostic.code, 'UNSTRUCTURED_OUTPUT');
  assert.equal(resumir(capture('null')).diagnostic.code, 'INVALID_DIAGNOSTIC');
  assert.equal(resumir(capture()).stdout.size, 'EMPTY');
  assert.equal(resumir(capture('x'.repeat(1025))).stdout.size, 'MEDIUM');
  assert.equal(resumir(capture('x'.repeat(65537))).stdout.size, 'LARGE');
});

test('evidencia distingue BOM, UTF16 sin BOM y candidatos ANSI/OEM sin afirmar codificacion exacta', () => {
  const message = 'running scripts is disabled ' + privateText;
  const encodings = [
    [Buffer.from(message), 'NONE', false, false],
    [Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(message)]), 'UTF8', false, false],
    [Buffer.from(message, 'utf16le'), 'NONE', true, false],
    [Buffer.from(message, 'utf16le').swap16(), 'NONE', true, false],
    [Buffer.concat([Buffer.from([255, 254]), Buffer.from(message, 'utf16le')]), 'UTF16LE', true, false],
    [Buffer.concat([Buffer.from([254, 255]), Buffer.from(message, 'utf16le').swap16()]), 'UTF16BE', true, false],
    [Buffer.concat([Buffer.from(message), Buffer.from([0xe9])]), 'NONE', false, true],
    [Buffer.concat([Buffer.from(message), Buffer.from([0x82])]), 'NONE', false, true]
  ];
  for (const [bytes, bom, alternatingNul, legacyCandidates] of encodings) {
    const report = resumir(capture('', bytes));
    assert.equal(report.stderr.bom, bom);
    assert.equal(report.stderr.alternatingNul, alternatingNul);
    assert.equal(report.stderr.legacyCandidates, legacyCandidates);
    assert.equal(report.stderr.authorizationEvidence, true);
    assert.equal(report.diagnostic.result, 'PREFLIGHT_POLICY_BLOCKED');
    assert.ok(!JSON.stringify(report).includes('SYNTHETIC_SECRET_TOKEN'));
  }
});

test('JSON Unicode conserva solo diagnostico permitido, autorizacion no implica siempre bloqueo', () => {
  const json = JSON.stringify({ result: 'PREFLIGHT_READ_ONLY_OK', identityValidated: false, installationValidated: false, root: privateText });
  for (const bytes of [Buffer.from(json), Buffer.from(json, 'utf16le'), Buffer.from(json, 'utf16le').swap16()]) {
    const report = resumir(capture(bytes, '', 0));
    assert.equal(report.stdout.json, true);
    assert.equal(report.diagnostic.result, 'PREFLIGHT_READ_ONLY_OK');
    assert.ok(!JSON.stringify(report).includes('SYNTHETIC_SECRET_TOKEN'));
  }
  const report = resumir(capture('', 'running scripts is disabled', 0));
  assert.equal(report.stderr.authorizationEvidence, true);
  assert.equal(report.diagnostic.result, 'PREFLIGHT_EXECUTION_ERROR');
  for (const text of ['Restricted', 'PSSecurityException', 'UnauthorizedAccess']) assert.equal(resumir(capture('', text)).stderr.authorizationEvidence, false);
});

test('fallos del hijo tienen prioridad y codigos desconocidos no se serializan', () => {
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS', privateText]) {
    const report = resumir({ ...capture('', 'running scripts is disabled'), error: { code, message: privateText, stack: privateText } });
    assert.equal(report.diagnostic.code, 'PROCESS_FAILED');
    assert.equal(report.process.error, code === privateText ? 'OTHER' : code);
    assert.ok(!JSON.stringify(report).includes('SYNTHETIC_SECRET_TOKEN'));
  }
  const report = resumir({ ...capture('', '', 9876), signal: privateText });
  assert.deepEqual(report.process, { exit: 'OTHER', error: 'NONE', signaled: true });
  assert.equal(report.diagnostic.code, 'PROCESS_FAILED');
});

test('integracion usa doble del hijo una vez y no confunde fallo de escritura con diagnostico', t => {
  const config = privado(t);
  let runs = 0;
  let writes = 0;
  const result = ejecutarConRegistro('synthetic.log', config, (exe, args, options) => {
    runs++;
    assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-File']);
    assert.equal(options.shell, false);
    return capture(privateText);
  }, { SystemRoot: 'C:\\Windows' }, (destination, data) => {
    writes++;
    assert.ok(!data.includes('SYNTHETIC_SECRET_TOKEN'));
    throw Error(privateText);
  });
  assert.equal(runs, 1);
  assert.equal(writes, 1);
  assert.deepEqual(result, { diagnostic: { result: 'PREFLIGHT_EXECUTION_ERROR', stage: 'EXECUTION', code: 'UNSTRUCTURED_OUTPUT' }, record: 'WRITE_FAILED' });
  assert.equal(ejecutarConRegistro('synthetic.log', config, () => { throw Error(privateText); }, { SystemRoot: 'C:\\Windows' }, () => {}).diagnostic.code, 'PROCESS_FAILED');
  let thrownReport;
  ejecutarConRegistro('synthetic.log', config, () => { throw Object.assign(Error(privateText), { code: 'EACCES' }); }, { SystemRoot: 'C:\\Windows' }, (destination, data) => { thrownReport = JSON.parse(data); });
  assert.equal(thrownReport.process.error, 'EACCES');
  assert.ok(!JSON.stringify(thrownReport).includes('SYNTHETIC_SECRET_TOKEN'));
});

test('escritura real solo de captura sintetica: archivo nuevo, sin sobrescribir ni crear padres', t => {
  const config = privado(t);
  const directory = config.directory;
  const destination = path.join(directory, 'synthetic.log');
  assert.equal(guardarCaptura(capture(privateText), 'synthetic.log', config).record, 'SAVED');
  const original = fs.readFileSync(destination, 'utf8');
  assert.ok(!original.includes('SYNTHETIC_SECRET_TOKEN'));
  assert.equal(JSON.parse(original).diagnostic.code, 'UNSTRUCTURED_OUTPUT');
  assert.equal(guardarCaptura(capture(), 'synthetic.log', config).record, 'WRITE_FAILED');
  assert.equal(fs.readFileSync(destination, 'utf8'), original);
  assert.equal(guardarCaptura(capture(), 'missing/record.log', config).record, 'WRITE_FAILED');
});

test('CLI rechaza argumentos invalidos sin lanzar PowerShell ni mostrar rutas', () => {
  for (const args of [[], [privateText], ['one.log', 'two.log'], ['valid.log'], ['../escape.log'], ['C:\\escape.log']]) {
    const module = { exports: {} };
    let output = '';
    const process = { env: {}, argv: ['node', 'registro.js', ...args], stdout: { write: value => { output += value; } } };
    const require = name => {
      if (name === 'node:path') return path;
      if (name === 'node:child_process') return {};
      if (name === 'node:fs') return { writeFileSync() { throw Error('MUST_NOT_WRITE'); } };
      if (name === './diagnostico') return { ejecutarDetallado() { throw Error('MUST_NOT_RUN'); }, resumir };
      throw Error('UNEXPECTED_IMPORT');
    };
    require.main = module;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/mongoClean/registro.js'), 'utf8'), { require, module, process }, { timeout: 1000 });
    assert.equal(process.exitCode, 2);
    assert.deepEqual(JSON.parse(output), { record: 'INVALID_ARGUMENTS' });
  }
});

test('rechaza nombres y configuraciones no autorizados antes de escribir', t => {
  const config = privado(t);
  for (const name of ['/tmp/x.log', 'C:\\x.log', 'C:x.log', '../x.log', 'a/../x.log', 'a/x.log', 'a\\x.log', '\\\\server\\x.log', 'x.txt', 'x.LOG', 'x.log:stream', '..log', 'CON.log', 'nul.log']) {
    let writes = 0;
    assert.equal(guardarCaptura(capture(), name, config, () => { writes++; }).record, 'WRITE_FAILED', name);
    assert.equal(writes, 0);
  }
  for (const invalid of [undefined, {}, { directory: 'relative' }, { directory: path.join(config.directory, 'missing') }]) {
    assert.equal(guardarCaptura(capture(), 'x.log', invalid).record, 'WRITE_FAILED');
  }
  assert.equal(fs.existsSync(path.join(config.directory, 'missing')), false);
});

test('componentes enlazados y junctions son rechazados', t => {
  const config = privado(t);
  const link = path.join(config.directory, 'link');
  fs.symlinkSync(config.directory, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(guardarCaptura(capture(), 'x.log', { directory: link }).record, 'WRITE_FAILED');
  fs.mkdirSync(path.join(config.directory, 'child'));
  assert.equal(guardarCaptura(capture(), 'x.log', { directory: path.join(link, 'child') }).record, 'WRITE_FAILED');
});

test('enlace final no sobrescribe el archivo original', t => {
  const config = privado(t);
  fs.writeFileSync(path.join(config.directory, 'original.log'), 'original');
  try { fs.symlinkSync(path.join(config.directory, 'original.log'), path.join(config.directory, 'final.log')); }
  catch (e) { if (e.code === 'EPERM') { t.skip('Symlink de archivo requiere privilegios; junction cubierta por separado'); return; } throw e; }
  assert.equal(guardarCaptura(capture(), 'final.log', config).record, 'WRITE_FAILED');
  assert.equal(fs.readFileSync(path.join(config.directory, 'original.log'), 'utf8'), 'original');
});

test('errores de permisos y escritura conservan clasificaciones originales', t => {
  const config = privado(t);
  for (const input of [capture(), capture('broken'), capture('', 'running scripts is disabled'), capture(JSON.stringify({result:'PREFLIGHT_READ_ONLY_OK',identityValidated:false,installationValidated:false}), '', 0)]) {
    for (const code of ['EACCES', 'EPERM', 'ENOSPC', 'EIO']) {
      let writes = 0;
      const result = guardarCaptura(input, 'x.log', config, () => { writes++; throw Object.assign(Error(privateText), { code }); });
      assert.equal(writes, 1);
      assert.equal(result.record, 'WRITE_FAILED');
      assert.deepEqual(result.diagnostic, resumir(input).diagnostic);
      assert.ok(!JSON.stringify(result).includes(privateText));
    }
  }
});

test('directorio sin privacidad verificable es rechazado', t => {
  const config = privado(t);
  if (process.platform === 'win32') execFileSync('icacls.exe', [config.directory, '/grant', '*S-1-1-0:(R)'], { windowsHide: true });
  else fs.chmodSync(config.directory, 0o755);
  assert.equal(guardarCaptura(capture(), 'x.log', config).record, 'WRITE_FAILED');
});
