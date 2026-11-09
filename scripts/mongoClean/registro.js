'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ejecutarDetallado, resumir } = require('./diagnostico');

function nombreValido(name) {
  // A single portable filename: no streams, drive paths, separators or traversal.
  return typeof name === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.log$/.test(name) && !name.includes('..')
    && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name);
}
function destino(name, configuration) {
  if (!nombreValido(name)) throw Error('INVALID_NAME');
  const directory = configuration?.directory;
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.split(/[\\/]/).includes('..')) throw Error('INVALID_DIRECTORY');
  if (process.platform === 'win32' && (!/^[A-Za-z]:\\/.test(directory) || directory.slice(2).includes(':'))) throw Error('INVALID_DIRECTORY');
  const root = path.resolve(directory);
  let component = path.parse(root).root;
  for (const part of root.slice(component.length).split(path.sep).filter(Boolean)) {
    component = path.join(component, part);
    const stat = fs.lstatSync(component);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('INVALID_COMPONENT');
  }
  const canonical = fs.realpathSync.native(root);
  if (process.platform === 'win32' ? canonical.toLowerCase() !== root.toLowerCase() : canonical !== root) throw Error('ALIASED_DIRECTORY');
  if (process.platform === 'win32') {
    // Fail closed if ACL/reparse inspection is unavailable. No policy overrides.
    const command = `$ErrorActionPreference='Stop'
$drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($env:MONGO_RECORD_CHECK))
if ($drive.DriveType -ne 'Fixed' -or $drive.DriveFormat -notin @('NTFS','ReFS')) { throw 'unsupported volume' }
$d=Get-Item -LiteralPath $env:MONGO_RECORD_CHECK -Force
$p=$d
while ($null -ne $p) {
 if (($p.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
 $p=$p.Parent
}
$a=Get-Acl -LiteralPath $d.FullName
$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $me -or !$a.AreAccessRulesProtected) { throw 'owner/inheritance' }
$allowed=@($me,'S-1-5-18','S-1-5-32-544')
$privateInheritance=$false
foreach ($r in $a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
 if ($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin $allowed) { throw 'public ACL' }
 if ($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -eq $me -and
     ($r.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl -and
     ($r.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ObjectInherit) -ne 0 -and
     $r.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None) { $privateInheritance=$true }
}
if (!$privateInheritance) { throw 'file ACL inheritance' }
'PRIVATE'`;
    const executable = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const output = execFileSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
      env: { ...process.env, MONGO_RECORD_CHECK: root }, encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe']
    });
    if (output.trim() !== 'PRIVATE') throw Error('UNVERIFIED_ACL');
  } else {
    const stat = fs.statSync(root);
    if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw Error('PUBLIC_DIRECTORY');
  }
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root) throw Error('OUTSIDE_DIRECTORY');
  return target;
}
// Only the allowlisted projection reaches the writer. Configuration is trusted,
// explicit, and never obtained from the filename. No directories are created.
function guardarCaptura(capture, name, configuration, write = fs.writeFileSync) {
  return guardarResumen(resumir(capture), name, configuration, write);
}
function guardarResumen(report, name, configuration, write) {
  try {
    write(destino(name, configuration), JSON.stringify(report) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return { diagnostic: report.diagnostic, record: 'SAVED' };
  } catch {
    return { diagnostic: report.diagnostic, record: 'WRITE_FAILED' };
  }
}
function ejecutarConRegistro(name, configuration, run, environment, write = fs.writeFileSync) {
  return guardarResumen(ejecutarDetallado(run, environment), name, configuration, write);
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const configuration = { directory: process.env.MONGO_PREFLIGHT_LOG_DIRECTORY };
  let valid = false;
  try { if (args.length === 1) { destino(args[0], configuration); valid = true; } } catch {}
  if (!valid) {
    process.stdout.write('{"record":"INVALID_ARGUMENTS"}\n');
    process.exitCode = 2;
  } else {
    const result = ejecutarConRegistro(args[0], configuration);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.record !== 'SAVED' ? 2 : result.diagnostic.result === 'PREFLIGHT_READ_ONLY_OK' ? 0 : 1;
  }
}
module.exports = { guardarCaptura, ejecutarConRegistro };
