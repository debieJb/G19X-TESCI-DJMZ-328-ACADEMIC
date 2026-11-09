'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TextDecoder } = require('node:util');

// CP850 high half, obtained from the Windows/.NET code-page mapping.
const CP850 = '\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u0131\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0';

function decodificar(raw) {
  if (!Buffer.isBuffer(raw)) return [String(raw || '').replace(/^\uFEFF/, '')];
  if (!raw.length) return [''];
  const clean = text => text.replace(/^\uFEFF/, '');
  const utf16 = raw[0] === 0xff && raw[1] === 0xfe ? 'utf-16le'
    : raw[0] === 0xfe && raw[1] === 0xff ? 'utf-16be' : null;
  if (utf16) return [clean(new TextDecoder(utf16).decode(raw))];
  // BOM-less UTF-16 is accepted only with a strong alternating-NUL signature.
  if (raw.length % 2 === 0 && raw.length >= 4) {
    let even = 0; let odd = 0;
    for (let i = 0; i < raw.length; i++) if (raw[i] === 0) { if (i % 2) odd++; else even++; }
    if (odd > raw.length / 4 && even === 0) return [new TextDecoder('utf-16le').decode(raw)];
    if (even > raw.length / 4 && odd === 0) return [new TextDecoder('utf-16be').decode(raw)];
  }
  try { return [clean(new TextDecoder('utf-8', { fatal: true }).decode(raw))]; } catch {
    // Encoding is unknown: inspect both common ANSI/OEM interpretations, never guess policy from encoding alone.
    return [new TextDecoder('windows-1252').decode(raw), Array.from(raw, b => b < 128 ? String.fromCharCode(b) : CP850[b - 128]).join('')];
  }
}

function evidenciaPolitica(text) {
  // Normalize line wrapping and CLIXML separators; no XML execution or raw output.
  const message = text.replace(/_x000[AD]_/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  return /(?:running|execution of) scripts is disabled|ejecuci[oó]n de scripts (?:est[aá]|se encuentra) deshabilitada|se ha deshabilitado la ejecuci[oó]n de scripts|not digitally signed|no est[aá] firmado digitalmente/i.test(message)
    || (/\bPSSecurityException\b/.test(message) && /UnauthorizedAccess|AuthorizationManager|execution polic|pol[ií]tica|directiva/i.test(message));
}

// Importing this module never launches PowerShell. Only CLI/explicit ejecutar does.
function clasificar(capture) {
  const failure = code => ({ result: 'PREFLIGHT_EXECUTION_ERROR', stage: 'EXECUTION', code });
  if (capture.error || capture.signal || !Number.isInteger(capture.status)) return failure('PROCESS_FAILED');
  const stderr = decodificar(capture.stderr);
  const stdout = decodificar(capture.stdout);
  let value;
  let structured = false;
  for (const text of stdout) {
    try { value = JSON.parse(text); structured = true; break; } catch { /* inspect other supported decoding */ }
  }
  // No effective-policy lookup: concrete error evidence and a failed child are required.
  if (capture.status !== 0 && (stderr.some(evidenciaPolitica) || (!structured && stdout.some(evidenciaPolitica)))) {
    return { result: 'PREFLIGHT_POLICY_BLOCKED', stage: 'AUTHORIZATION', code: 'POWERSHELL_POLICY_BLOCKED' };
  }
  if (!structured) return failure(stdout.every(s => !s.trim()) && stderr.every(s => !s.trim()) ? 'EMPTY_OUTPUT' : 'UNSTRUCTURED_OUTPUT');
  if (stderr.some(s => s.trim())) return failure('UNEXPECTED_STDERR');
  if (capture.status === 0 && value?.result === 'PREFLIGHT_READ_ONLY_OK' && value.identityValidated === false && value.installationValidated === false) {
    return { result: value.result, identityValidated: false, installationValidated: false };
  }
  if (capture.status === 1 && value?.result === 'PREFLIGHT_REJECTED' && value.stage === 'PREFLIGHT' && GUARDS.has(value.code)) {
    return { result: value.result, stage: value.stage, code: value.code };
  }
  if (capture.status === 1 && value?.result === 'PREFLIGHT_EXECUTION_ERROR' && value.stage === 'EXECUTION' && value.code === 'INTERNAL_EXECUTION_ERROR') return failure(value.code);
  return failure('INVALID_DIAGNOSTIC');
}
const GUARDS = new Set(['RUTA_INVALIDA','RUTA_NO_CANONICA','PADRE_NO_DIRECTORIO','CADENA_INCONSISTENTE','PADRE_NO_VERIFICABLE',
  'WINDOWS_POWERSHELL_REQUERIDO','PERFIL_INVALIDO','PROTECCION_NO_VERIFICABLE','SOLAPAMIENTO_PROTEGIDO',
  'RAIZ_PELIGROSA','RAIZ_YA_EXISTE','PERMISOS_NO_DEMOSTRADOS','BINARIO_EXPLICITO_REQUERIDO',
  'BINARIO_INVALIDO','BINARIO_NO_LEGIBLE','PUERTO_OCUPADO','SISTEMA_NO_VERIFICABLE','DIRECTORIO_HISTORICO_NO_DEMOSTRADO',
  'INVENTARIO_INFORMACION_INCOMPLETA','INVENTARIO_CONFIGURACION_NO_VERIFICABLE','INVENTARIO_CONFLICTO_CONFIRMADO']);
function resumir(capture) {
  const stream = raw => {
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : '');
    const texts = decodificar(bytes);
    let utf8 = true;
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { utf8 = false; }
    let even = 0; let odd = 0;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) { if (i % 2) odd++; else even++; }
    return {
      size: bytes.length === 0 ? 'EMPTY' : bytes.length <= 1024 ? 'SMALL' : bytes.length <= 65536 ? 'MEDIUM' : 'LARGE',
      bom: bytes[0] === 0xff && bytes[1] === 0xfe ? 'UTF16LE' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'UTF16BE'
        : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'UTF8' : 'NONE',
      validUtf8: utf8,
      alternatingNul: bytes.length >= 4 && bytes.length % 2 === 0 && ((odd > bytes.length / 4 && even === 0) || (even > bytes.length / 4 && odd === 0)),
      legacyCandidates: texts.length === 2,
      blank: texts.every(text => !text.trim()),
      json: texts.some(text => { try { JSON.parse(text); return true; } catch { return false; } }),
      authorizationEvidence: texts.some(evidenciaPolitica)
    };
  };
  const knownErrors = ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS'];
  return {
    schemaVersion: 1,
    diagnostic: clasificar(capture),
    process: {
      exit: capture.status === 0 ? 'ZERO' : capture.status === 1 ? 'ONE' : Number.isInteger(capture.status) ? 'OTHER' : 'UNAVAILABLE',
      error: !capture.error ? 'NONE' : knownErrors.includes(capture.error.code) ? capture.error.code : 'OTHER',
      signaled: Boolean(capture.signal)
    },
    stdout: stream(capture.stdout), stderr: stream(capture.stderr)
  };
}

function ejecutarDetallado(run = spawnSync, environment = process.env) {
  if (!environment.SystemRoot || !path.win32.isAbsolute(environment.SystemRoot)) return resumir({ error: true });
  const executable = path.win32.join(environment.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    return resumir(run(executable, ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'preflight.ps1')], {
      encoding: 'buffer', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024
    }));
  } catch (error) { return resumir({ error: error || true }); }
}
function ejecutar(run = spawnSync, environment = process.env) {
  return ejecutarDetallado(run, environment).diagnostic;
}
if (require.main === module) {
  const result = ejecutar();
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.result === 'PREFLIGHT_READ_ONLY_OK' ? 0 : 1;
}
module.exports = { clasificar, ejecutar, ejecutarDetallado, resumir, GUARDS };
