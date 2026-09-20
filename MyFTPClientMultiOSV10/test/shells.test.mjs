// Installed-shell discovery and one-shot spawn shapes (cmd /c, PS -Command, bash -c, WSL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { listShells, resolveShell, buildShellSpawn, spawnKind, shortName } = require('../core/shells');
const { utf8LocaleEnv } = require('../core/encoding');

test('shells: listShells returns at least one installed shell with kind and path', () => {
  const shells = listShells();
  assert.ok(shells.length >= 1);
  assert.ok(shells.every((s) => s.id && s.label && s.path && s.kind));
  assert.ok(shells.some((s) => s.preferred));
  const kinds = new Set(shells.map((s) => s.kind));
  if (process.platform === 'win32') {
    assert.ok(shells.some((s) => s.id === 'cmd'));
    assert.ok(kinds.has('cmd'));
  }
});

test('shells: resolveShell finds a listed id and rejects a missing one', () => {
  const listed = listShells();
  const hit = resolveShell(listed[0].id);
  assert.equal(hit.id, listed[0].id);
  assert.ok(hit.file);
  assert.throws(() => resolveShell('__no_such_shell__'), /not installed/i);
});

test('shells: spawnKind and shortName', () => {
  assert.equal(spawnKind('cmd', 'cmd.exe'), 'cmd');
  assert.equal(spawnKind('powershell', 'powershell.exe'), 'powershell');
  assert.equal(spawnKind('pwsh', 'pwsh.exe'), 'powershell');
  assert.equal(spawnKind('wsl:Ubuntu', 'wsl.exe'), 'wsl');
  assert.equal(spawnKind('git-bash', 'bash.exe'), 'posix');
  assert.equal(shortName({ id: 'cmd' }), 'cmd');
  assert.equal(shortName({ id: 'powershell' }), 'PowerShell');
  assert.equal(shortName({ id: 'git-bash' }), 'bash');
  assert.equal(shortName({ id: 'wsl:Ubuntu' }), 'Ubuntu');
  assert.equal(shortName({ id: '/bin/zsh', file: '/bin/zsh' }), 'zsh');
});

test('shells: buildShellSpawn one-shot argv for cmd, powershell, posix, wsl', () => {
  const cmd = buildShellSpawn({ file: 'cmd.exe', kind: 'cmd' }, 'echo hi');
  assert.deepEqual(cmd.args, ['/d', '/s', '/c', '"echo hi"']);
  assert.equal(cmd.options.windowsVerbatimArguments, true);

  const ps = buildShellSpawn({ file: 'powershell.exe', kind: 'powershell' }, 'Get-Date');
  assert.deepEqual(ps.args, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Get-Date']);

  const bash = buildShellSpawn({ file: 'bash', kind: 'posix' }, 'echo hi');
  assert.deepEqual(bash.args, ['-c', 'echo hi']);

  const wsl = buildShellSpawn({ file: 'wsl.exe', kind: 'wsl', args: ['-d', 'Ubuntu'] }, 'uname');
  assert.deepEqual(wsl.args, ['-d', 'Ubuntu', '-e', 'sh', '-c', 'uname']);
});

test('shells: utf8LocaleEnv always sets PYTHONIOENCODING', () => {
  const env = utf8LocaleEnv();
  assert.equal(env.PYTHONIOENCODING, 'utf-8');
});
