// Command shells (src/main/shells.js): detection per platform, defaults,
// custom programs and how one command line is spawned in each shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectShells, defaultShellId, kindOfProgram, resolveShell, buildShellSpawn } = require('../src/main/shells.js');

const WIN_ENV = {
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  PATH: 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd',
};
const existsIn = (files) => (p) => files.has(String(p).toLowerCase());

test('windows: cmd / powershell / git bash / wsl are found, pwsh only when installed', () => {
  const files = new Set(
    [
      'C:\\Windows\\System32\\cmd.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Windows\\System32\\wsl.exe',
    ].map((p) => p.toLowerCase())
  );
  const shells = detectShells({ platform: 'win32', env: WIN_ENV, exists: existsIn(files) });
  assert.deepEqual(
    shells.map((s) => s.id),
    ['cmd', 'powershell', 'gitbash', 'wsl']
  );
  assert.equal(shells[0].kind, 'cmd');
  assert.equal(shells[2].kind, 'posix');
  assert.equal(shells[3].kind, 'wsl');
  assert.equal(defaultShellId('win32', shells), 'cmd');
  files.add('C:\\Program Files\\PowerShell\\7\\pwsh.exe'.toLowerCase());
  const withPwsh = detectShells({ platform: 'win32', env: WIN_ENV, exists: existsIn(files) });
  assert.ok(withPwsh.some((s) => s.id === 'pwsh' && s.kind === 'powershell'));
});

test('windows: git bash is derived from git on PATH', () => {
  const files = new Set(['C:\\Windows\\System32\\cmd.exe', 'D:\\Tools\\Git\\bin\\bash.exe'].map((p) => p.toLowerCase()));
  const env = { ...WIN_ENV, PATH: 'C:\\Windows\\System32;D:\\Tools\\Git\\cmd' };
  const shells = detectShells({ platform: 'win32', env, exists: existsIn(files) });
  assert.equal(shells.find((s) => s.id === 'gitbash')?.path, 'D:\\Tools\\Git\\bin\\bash.exe');
});

test('posix: login shell first, bash/zsh/fish by presence; zsh default on macOS, bash on Linux', () => {
  const files = new Set(['/bin/bash', '/bin/zsh', '/usr/local/bin/fish', '/bin/sh']);
  const shells = detectShells({ platform: 'darwin', env: { SHELL: '/bin/zsh' }, exists: (p) => files.has(p) });
  assert.deepEqual(
    shells.map((s) => s.id),
    ['system', 'bash', 'zsh', 'fish', 'sh']
  );
  assert.equal(shells[0].label, 'Login shell (zsh)');
  assert.equal(defaultShellId('darwin', shells), 'zsh');
  assert.equal(defaultShellId('linux', shells), 'bash');
  const noBash = shells.filter((s) => s.id !== 'bash');
  assert.equal(defaultShellId('linux', noBash), 'system');
  assert.equal(defaultShellId('linux', []), 'sh');
});

test('resolveShell: configured id, custom path, fallbacks', () => {
  const shells = [
    { id: 'cmd', label: 'cmd', path: 'C:\\W\\cmd.exe', kind: 'cmd' },
    { id: 'powershell', label: 'ps', path: 'C:\\W\\powershell.exe', kind: 'powershell' },
  ];
  assert.equal(resolveShell({ shellId: 'powershell' }, { platform: 'win32', shells }).id, 'powershell');
  assert.equal(resolveShell({ shellId: 'nope' }, { platform: 'win32', shells }).id, 'cmd');
  assert.equal(resolveShell({}, { platform: 'win32', shells }).id, 'cmd');
  const custom = resolveShell(
    { shellId: 'custom', shellCustomPath: 'D:\\nu\\nu.exe' },
    { platform: 'win32', shells, exists: () => true }
  );
  assert.equal(custom.id, 'custom');
  assert.equal(custom.kind, 'posix');
  assert.equal(custom.label, 'nu.exe');
  // a custom path that does not exist falls back to the default
  assert.equal(resolveShell({ shellId: 'custom', shellCustomPath: 'D:\\x.exe' }, { platform: 'win32', shells, exists: () => false }).id, 'cmd');
  // nothing detected at all
  assert.equal(resolveShell({}, { platform: 'linux', shells: [] }).path, '/bin/sh');
  assert.equal(resolveShell({}, { platform: 'win32', shells: [] }).kind, 'cmd');
});

test('kindOfProgram from the file name', () => {
  assert.equal(kindOfProgram('C:\\Windows\\System32\\cmd.exe', 'win32'), 'cmd');
  assert.equal(kindOfProgram('C:\\x\\pwsh.exe', 'win32'), 'powershell');
  assert.equal(kindOfProgram('C:\\Windows\\System32\\wsl.exe', 'win32'), 'wsl');
  assert.equal(kindOfProgram('C:\\Git\\bin\\bash.exe', 'win32'), 'posix');
  assert.equal(kindOfProgram('/bin/zsh', 'linux'), 'posix');
});

test('buildShellSpawn: one command line per shell kind', () => {
  const line = 'echo "hi there" & dir';
  const cmd = buildShellSpawn({ path: 'cmd.exe', kind: 'cmd' }, line);
  assert.deepEqual(cmd.args, ['/d', '/s', '/c', `"${line}"`]);
  assert.equal(cmd.options.windowsVerbatimArguments, true);
  const ps = buildShellSpawn({ path: 'powershell.exe', kind: 'powershell' }, line);
  assert.deepEqual(ps.args.slice(-2), ['-Command', line]);
  assert.ok(ps.args.includes('-NoProfile'));
  const bash = buildShellSpawn({ path: '/bin/bash', kind: 'posix' }, line);
  assert.deepEqual(bash.args, ['-c', line]);
  const wsl = buildShellSpawn({ path: 'wsl.exe', kind: 'wsl' }, line);
  assert.deepEqual(wsl.args, ['-e', 'sh', '-c', line]);
  assert.equal(wsl.file, 'wsl.exe');
});
