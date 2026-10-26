// External software detection and consent-based installation (no real installs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const tools = require('../core/platform/tools.js');

const probeNone = () => ({ ok: false, out: '' });
const missing = { locate: () => null, probe: probeNone };

test('status lists every tool with why/without texts and the install command', () => {
  const s = tools.status({}, { ...missing, platform: 'win32', managers: ['winget'] });
  const git = s.tools.find((t) => t.id === 'git');
  assert.equal(git.installed, false);
  assert.equal(git.canInstall, true);
  assert.match(git.command, /^winget install --id Git\.Git -e/);
  for (const t of s.tools) assert.ok(t.why.ko && t.why.en && t.without.ko && t.url);
});

test('install commands per package manager, Linux goes through pkexec or sudo -n', () => {
  const git = tools.TOOLS.find((t) => t.id === 'git');
  assert.deepEqual(tools.installCommand(git, 'brew', 'darwin', probeNone), ['brew', 'install', 'git']);
  assert.deepEqual(tools.installCommand(git, 'apt', 'linux', (c) => ({ ok: c === 'pkexec' })), ['pkexec', 'apt-get', 'install', '-y', 'git']);
  assert.deepEqual(tools.installCommand(git, 'dnf', 'linux', probeNone), ['sudo', '-n', 'dnf', 'install', '-y', 'git']);
  assert.equal(tools.installCommand(git, 'brew', 'win32', probeNone), null);
});

test('start-up offers skip installed, declined, not recommended and when asking is off', () => {
  const opts = { ...missing, platform: 'linux', managers: ['apt'] };
  assert.deepEqual(tools.offers({}, opts).map((t) => t.id), ['git']);
  assert.deepEqual(tools.offers({ tools: { declined: ['git'] } }, opts), []);
  assert.deepEqual(tools.offers({ tools: { askOnStart: false } }, opts), []);
  assert.deepEqual(tools.offers({}, { ...opts, locate: () => '/usr/bin/git' }), []);
  assert.deepEqual(tools.offers({}, { ...opts, managers: [] }), [], 'nothing to offer without a package manager');
});

test('an install job streams output and reports failure from the exit code', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let seen;
  const job = tools.startInstall('clang', { platform: 'linux', managers: ['apt'], spawn: (cmd, args) => { seen = [cmd, ...args]; return child; } });
  assert.equal(job.status, 'running');
  assert.ok(seen.includes('clang'));
  assert.throws(() => tools.startInstall('git', { platform: 'linux', managers: ['apt'], spawn: () => child }), (e) => e.code === 'BUSY');
  child.stdout.emit('data', 'Reading package lists...\nDone\n');
  child.emit('close', 100);
  const done = tools.job(job.id);
  assert.equal(done.status, 'failed');
  assert.equal(done.exitCode, 100);
  assert.deepEqual(done.log.slice(0, 2), ['Reading package lists...', 'Done']);
});

test('unknown tools and missing package managers are explained', () => {
  assert.throws(() => tools.startInstall('nope'), (e) => e.code === 'NOT_FOUND');
  assert.throws(() => tools.startInstall('git', { platform: 'darwin', managers: [] }), (e) => e.code === 'NO_MANAGER' && /git-scm\.com/.test(e.message));
});
