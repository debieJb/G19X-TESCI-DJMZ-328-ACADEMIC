'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const diagnostic = require('../scripts/mongoClean/diagnostico');
const source = fs.readFileSync(path.join(__dirname, '../scripts/mongoClean/registro.js'), 'utf8');
const directory = 'C:\\synthetic\\private-logs';
const capture = { status: 1, stdout: 'SYNTHETIC_PRIVATE_OUTPUT', stderr: '' };
const expectedDiagnostic = diagnostic.resumir(capture).diagnostic;
const normalize = value => JSON.parse(JSON.stringify(value));

// Execute the actual writer in a VM with Windows path semantics on every OS.
// All filesystem, process environment, ACL subprocess and writes are doubles.
function writer(options = {}) {
  const parentEnv = options.parentEnv || Object.freeze({
    SystemRoot: 'C:\\synthetic\\Windows',
    MONGO_RECORD_CHECK: 'PARENT_SENTINEL',
    SYNTHETIC_SENTINEL: 'unchanged'
  });
  const calls = { checks: [], writes: [], stats: [], diagnostic: 0 };
  const fileSystem = {
    lstatSync(component) {
      calls.stats.push(component);
      if (options.stat) return options.stat(component);
      return { isDirectory: () => true, isSymbolicLink: () => false };
    },
    realpathSync: { native: root => options.realpath ? options.realpath(root) : root },
    writeFileSync(destination, data, flags) {
      calls.writes.push({ destination, data, flags });
      if (options.write) return options.write(destination, data, flags);
    }
  };
  const processDouble = { platform: 'win32', env: parentEnv,
    argv: ['node', 'registro.js', ...(options.args || [])], stdout: { write: value => { calls.output = (calls.output || '') + value; } } };
  const moduleDouble = { exports: {} };
  const requireDouble = name => {
    if (name === 'node:fs') return fileSystem;
    if (name === 'node:path') return path.win32;
    if (name === 'node:child_process') return { execFileSync(executable, args, settings) {
      calls.checks.push({ executable, args, settings });
      return options.check ? options.check(executable, args, settings) : 'PRIVATE\r\n';
    } };
    if (name === './diagnostico') return { resumir: diagnostic.resumir,
      ejecutarDetallado: options.realDiagnostic ? diagnostic.ejecutarDetallado : () => { calls.diagnostic++; return diagnostic.resumir(capture); } };
    throw Error('UNEXPECTED_IMPORT');
  };
  requireDouble.main = options.main ? moduleDouble : {};
  vm.runInNewContext(source, { require: requireDouble, module: moduleDouble, process: processDouble, Buffer }, { timeout: 1000 });
  return { ...moduleDouble.exports, calls, parentEnv, processDouble };
}
function save(instance) { return normalize(instance.guardarCaptura(capture, 'synthetic.log', { directory })); }
function commandFrom(instance) {
  const call = instance.calls.checks[0];
  assert.deepEqual(normalize(call.args.slice(0, 3)), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  return Buffer.from(call.args[3], 'base64').toString('utf16le');
}

test('ACL sintética: valida el comando real con usuario SYSTEM administradores, rechazos y AST', { skip: process.platform !== 'win32' }, t => {
  const instance = writer();
  assert.equal(save(instance).record, 'SAVED');
  const command = commandFrom(instance);
  const fixture = path.join(__dirname, 'mongoClean.registro.acl.fixture.ps1');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const invocation = '& ([scriptblock]::Create([IO.File]::ReadAllText(' + quote(fixture) + '))) -ValidationBase64 ' + quote(Buffer.from(command, 'utf16le').toString('base64'));
  const result = spawnSync(path.win32.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(invocation, 'utf16le').toString('base64')],
    { encoding: 'utf8', timeout: 20000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /ACL_SYNTHETIC_CASES_PASSED=32; AST_READ_ONLY_OK; PARENT_ACL_LIMIT_CONFIRMED/);
  t.diagnostic(result.stdout.trim());
});

test('doble Windows guarda proyección saneada con creación exclusiva y sin datos privados', () => {
  const instance = writer();
  assert.deepEqual(save(instance), { diagnostic: expectedDiagnostic, record: 'SAVED' });
  const persisted = instance.calls.writes[0];
  assert.equal(persisted.destination, path.win32.join(directory, 'synthetic.log'));
  assert.deepEqual(normalize(persisted.flags), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  assert.equal(persisted.data.includes('SYNTHETIC_PRIVATE_OUTPUT'), false);
  assert.deepEqual(Object.keys(JSON.parse(persisted.data)), ['schemaVersion', 'diagnostic', 'process', 'stdout', 'stderr']);
});

test('hijo ACL recibe copia de entorno y su ruta interna no modifica al padre', () => {
  const instance = writer({ check(executable, args, settings) {
    assert.equal(executable, 'C:\\synthetic\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.equal(settings.env.MONGO_RECORD_CHECK, directory);
    assert.equal(settings.env.SYNTHETIC_SENTINEL, 'unchanged');
    assert.equal(settings.windowsHide, true);
    assert.equal(settings.timeout, 10000);
    assert.deepEqual(normalize(settings.stdio), ['ignore', 'pipe', 'pipe']);
    settings.env.SYNTHETIC_SENTINEL = 'child-only';
    return 'PRIVATE';
  } });
  assert.equal(save(instance).record, 'SAVED');
  assert.notEqual(instance.calls.checks[0].settings.env, instance.parentEnv);
  assert.equal(instance.parentEnv.MONGO_RECORD_CHECK, 'PARENT_SENTINEL');
  assert.equal(instance.parentEnv.SYNTHETIC_SENTINEL, 'unchanged');
});

test('errores de consulta ACL/volumen o lanzamiento no escriben ni filtran excepciones', () => {
  for (const code of ['EACCES', 'EPERM', 'ENOENT', 'ETIMEDOUT']) {
    const instance = writer({ check() { throw Object.assign(Error('SYNTHETIC_PRIVATE_ACL_PATH'), { code }); } });
    assert.deepEqual(save(instance), { diagnostic: expectedDiagnostic, record: 'WRITE_FAILED' });
    assert.equal(instance.calls.writes.length, 0);
  }
  for (const output of ['', 'UNKNOWN', 'PRIVATE\nSYNTHETIC_PRIVATE_PATH', 'PUBLIC']) {
    const instance = writer({ check: () => output });
    assert.deepEqual(save(instance), { diagnostic: expectedDiagnostic, record: 'WRITE_FAILED' });
    assert.equal(instance.calls.writes.length, 0);
  }
});

test('fallo de ACL en CLI rechaza antes del diagnóstico', () => {
  const instance = writer({ main: true, args: ['valid.log'], parentEnv: Object.freeze({
    SystemRoot: 'C:\\synthetic\\Windows', MONGO_PREFLIGHT_LOG_DIRECTORY: directory
  }), check() { throw Error('SYNTHETIC_PRIVATE_ACL'); } });
  assert.equal(instance.processDouble.exitCode, 2);
  assert.deepEqual(JSON.parse(instance.calls.output), { record: 'INVALID_ARGUMENTS' });
  assert.equal(instance.calls.diagnostic, 0);
  assert.equal(instance.calls.writes.length, 0);
});

test('metadatos inaccesibles, enlaces y alias rechazan antes de consultar ACL', () => {
  for (const options of [
    { stat() { throw Object.assign(Error('SYNTHETIC_PRIVATE_STAT'), { code: 'EACCES' }); } },
    { stat: () => ({ isDirectory: () => true, isSymbolicLink: () => true }) },
    { stat: () => ({ isDirectory: () => false, isSymbolicLink: () => false }) },
    { realpath: () => 'C:\\synthetic\\redirected' }
  ]) {
    const instance = writer(options);
    assert.equal(save(instance).record, 'WRITE_FAILED');
    assert.equal(instance.calls.checks.length, 0);
    assert.equal(instance.calls.writes.length, 0);
  }
});

test('fallo de escritura con ACL válida conserva clasificación original', () => {
  for (const code of ['EEXIST', 'EACCES', 'ENOSPC', 'EIO']) {
    const instance = writer({ write() { throw Object.assign(Error('SYNTHETIC_PRIVATE_WRITE'), { code }); } });
    assert.deepEqual(save(instance), { diagnostic: expectedDiagnostic, record: 'WRITE_FAILED' });
    assert.equal(instance.calls.checks.length, 1);
    assert.equal(instance.calls.writes.length, 1);
  }
});

test('entorno explícito del diagnóstico se copia al hijo sin modificar al llamador', () => {
  const environment = Object.freeze({ SystemRoot: 'C:\\synthetic\\Windows', SYNTHETIC_CHILD_ONLY: 'requested', MONGO_PREFLIGHT_LOG_DIRECTORY: directory });
  let runs = 0;
  const report = diagnostic.ejecutarDetallado((exe, args, options) => {
    runs++;
    assert.notEqual(options.env, environment);
    assert.deepEqual(options.env, environment);
    assert.equal(options.shell, false);
    options.env.SYNTHETIC_CHILD_ONLY = 'mutated-in-double';
    options.env.MONGO_RECORD_CHECK = 'child-only';
    return capture;
  }, environment);
  assert.equal(runs, 1);
  assert.deepEqual(report.diagnostic, expectedDiagnostic);
  assert.equal(environment.SYNTHETIC_CHILD_ONLY, 'requested');
  assert.equal(Object.hasOwn(environment, 'MONGO_RECORD_CHECK'), false);
});

test('la ruta interna del verificador ACL no pasa al entorno del preflight', () => {
  const environment = Object.freeze({ SystemRoot: 'C:\\synthetic\\Windows', MONGO_RECORD_CHECK: 'ORIGINAL_SENTINEL', SYNTHETIC_CHILD_ONLY: 'requested' });
  const instance = writer({ realDiagnostic: true, parentEnv: environment });
  let observed;
  const result = normalize(instance.ejecutarConRegistro('synthetic.log', { directory }, (exe, args, options) => {
    observed = options.env;
    assert.equal(options.env.MONGO_RECORD_CHECK, 'ORIGINAL_SENTINEL');
    return capture;
  }, environment));
  assert.deepEqual(result, { diagnostic: expectedDiagnostic, record: 'SAVED' });
  assert.equal(instance.calls.checks[0].settings.env.MONGO_RECORD_CHECK, directory);
  assert.equal(environment.MONGO_RECORD_CHECK, 'ORIGINAL_SENTINEL');
  assert.notEqual(observed, instance.calls.checks[0].settings.env);
});

test('LÍMITE TOCTOU: sustitución simulada tras validar puede llegar al escritor', () => {
  let replacement = false;
  const instance = writer({ check() { replacement = true; return 'PRIVATE'; }, write() {
    // In-memory demonstration only. No real directories, links or writes.
    assert.equal(replacement, true);
  } });
  assert.equal(save(instance).record, 'SAVED');
  assert.equal(instance.calls.writes.length, 1);
  // This success explicitly demonstrates a limitation; it is not race protection.
});


test('CLI con diagnostico doble conserva entorno padre y no publica rutas', () => {
  const parentEnv = Object.freeze({ SystemRoot: 'C:\\synthetic\\Windows', MONGO_PREFLIGHT_LOG_DIRECTORY: directory, MONGO_RECORD_CHECK: 'PARENT_SENTINEL' });
  const instance = writer({ main: true, args: ['synthetic.log'], parentEnv });
  assert.equal(instance.processDouble.exitCode, 1); // Synthetic failed diagnosis, saved record.
  assert.deepEqual(JSON.parse(instance.calls.output), { diagnostic: expectedDiagnostic, record: 'SAVED' });
  assert.equal(instance.calls.diagnostic, 1);
  assert.equal(instance.calls.checks.length, 2); // Before diagnosis and before write.
  assert.notEqual(instance.calls.checks[0].settings.env, instance.calls.checks[1].settings.env);
  assert.equal(parentEnv.MONGO_RECORD_CHECK, 'PARENT_SENTINEL');
  assert.equal(instance.calls.output.includes(directory), false);
});


test('control: nombres con terminadores de linea nunca validan ni lanzan diagnostico', () => {
  for (const suffix of [String.fromCodePoint(10), String.fromCodePoint(13), String.fromCodePoint(13, 10), String.fromCodePoint(0x2028), String.fromCodePoint(0x2029)]) {
    const name = 'synthetic.log' + suffix;
    const instance = writer();
    const result = normalize(instance.guardarCaptura(capture, name, { directory }));
    assert.deepEqual(result, { diagnostic: expectedDiagnostic, record: 'WRITE_FAILED' });
    assert.equal(instance.calls.checks.length, 0);
    assert.equal(instance.calls.writes.length, 0);
    const cli = writer({ main: true, args: [name], parentEnv: Object.freeze({
      SystemRoot: 'C:\\synthetic\\Windows', MONGO_PREFLIGHT_LOG_DIRECTORY: directory
    }) });
    assert.equal(cli.calls.diagnostic, 0);
    assert.deepEqual(JSON.parse(cli.calls.output), { record: 'INVALID_ARGUMENTS' });
  }
});

test('regresion: SystemRoot invalido no ejecuta el verificador ACL', () => {
  for (const SystemRoot of [undefined, '', 'relative', '\\Windows', 'C:Windows', '\\\\synthetic\\share', '\\\\?\\C:\\Windows', 42]) {
    const instance = writer({ parentEnv: Object.freeze({ SystemRoot }) });
    assert.deepEqual(save(instance), { diagnostic: expectedDiagnostic, record: 'WRITE_FAILED' });
    assert.equal(instance.calls.checks.length, 0);
    assert.equal(instance.calls.writes.length, 0);
  }
});

test('regresion: entorno invalido o getter fallido conserva PROCESS_FAILED saneado', () => {
  const invalid = [null, [], 42, 'invalid', {}, { SystemRoot: 42 }, { SystemRoot: 'relative' }, { SystemRoot: '\\Windows' }, { SystemRoot: '\\\\synthetic\\share' }];
  invalid.push(Object.defineProperty({}, 'SystemRoot', { enumerable: true, get() { throw Object.assign(Error('SYNTHETIC_PRIVATE_ENV_SECRET'), { code: 'EACCES' }); } }));
  for (const environment of invalid) {
    let runs = 0;
    const report = diagnostic.ejecutarDetallado(() => { runs++; throw Error('MUST_NOT_RUN'); }, environment);
    assert.equal(runs, 0);
    assert.equal(report.diagnostic.code, 'PROCESS_FAILED');
    assert.equal(JSON.stringify(report).includes('SYNTHETIC_PRIVATE_ENV_SECRET'), false);
  }
});

test('regresion: entorno se captura una vez y coincide con el ejecutable elegido', () => {
  let reads = 0;
  const environment = Object.freeze({
    get SystemRoot() { reads++; return 'C:\\synthetic\\Windows'; },
    SYNTHETIC_SECRET: 'SYNTHETIC_PRIVATE_ENV_SECRET'
  });
  let runs = 0;
  const report = diagnostic.ejecutarDetallado((exe, args, options) => {
    runs++;
    assert.equal(exe, path.win32.join(options.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'));
    return { status: 1, stdout: options.env.SYNTHETIC_SECRET, stderr: '' };
  }, environment);
  assert.equal(runs, 1);
  assert.equal(reads, 1);
  assert.equal(JSON.stringify(report).includes('SYNTHETIC_PRIVATE_ENV_SECRET'), false);
});

test('regresion: entorno por defecto usa copia de process.env sin modificarlo', () => {
  const environment = Object.freeze({ SystemRoot: 'C:\\synthetic\\Windows', SYNTHETIC_SECRET: 'SYNTHETIC_PRIVATE_ENV_SECRET' });
  const moduleDouble = { exports: {} };
  let runs = 0;
  const requireDouble = name => {
    if (name === 'node:path') return path.win32;
    if (name === 'node:util') return require('node:util');
    if (name === 'node:child_process') return { spawnSync(exe, args, options) {
      runs++;
      assert.notEqual(options.env, environment);
      assert.deepEqual(normalize(options.env), environment);
      options.env.SYNTHETIC_SECRET = 'child-only';
      return capture;
    } };
    throw Error('UNEXPECTED_IMPORT');
  };
  requireDouble.main = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/mongoClean/diagnostico.js'), 'utf8'), {
    require: requireDouble, module: moduleDouble, process: { env: environment }, Buffer, __dirname: 'C:\\synthetic\\mongoClean'
  }, { timeout: 1000 });
  const report = normalize(moduleDouble.exports.ejecutarDetallado());
  assert.equal(runs, 1);
  assert.equal(environment.SYNTHETIC_SECRET, 'SYNTHETIC_PRIVATE_ENV_SECRET');
  assert.equal(JSON.stringify(report).includes('SYNTHETIC_PRIVATE_ENV_SECRET'), false);
});


test('regresion: verificador captura SystemRoot una vez y sanea errores de getters', () => {
  let reads = 0;
  const parentEnv = Object.freeze({ get SystemRoot() { reads++; return 'C:\\synthetic\\Windows'; } });
  const instance = writer({ parentEnv });
  assert.equal(save(instance).record, 'SAVED');
  assert.equal(reads, 1);
  assert.equal(instance.calls.checks[0].executable, path.win32.join(instance.calls.checks[0].settings.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'));
  const throwing = writer({ parentEnv: Object.freeze({ get SystemRoot() { throw Error('SYNTHETIC_PRIVATE_ENV_SECRET'); } }) });
  assert.deepEqual(save(throwing), { diagnostic: expectedDiagnostic, record: 'WRITE_FAILED' });
  assert.equal(throwing.calls.checks.length, 0);
  assert.equal(throwing.calls.writes.length, 0);
});
