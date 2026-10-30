// Tab completion: commands, paths, longest common prefix, double-Tab list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  getCompletionContext,
  completeCommands,
  completePaths,
  longestCommonPrefix,
  suggestCompletion,
  formatCompletionToken,
} = require('../core/complete');

test('complete: first token is a command, later tokens are paths', () => {
  assert.equal(getCompletionContext('ec').isCommand, true);
  assert.equal(getCompletionContext('echo hi').isCommand, false);
  assert.equal(getCompletionContext('echo hi').token, 'hi');
  assert.equal(getCompletionContext('cd "My Docs').token, 'My Docs');
  assert.equal(getCompletionContext('cd "My Docs').quoteChar, '"');
});

test('complete: command names match the shell', () => {
  const cmd = completeCommands('ec', { kind: 'cmd' });
  assert.ok(cmd.includes('echo'));
  const ps = completeCommands('get-ch', { kind: 'powershell' });
  assert.ok(ps.some((n) => n.toLowerCase() === 'get-childitem'));
  const posix = completeCommands('un', { kind: 'posix' });
  assert.ok(posix.includes('uname'));
});

test('complete: unique file and directory paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfc-comp-'));
  try {
    fs.writeFileSync(path.join(dir, 'unique-complete.txt'), 'x');
    fs.mkdirSync(path.join(dir, 'onlydir'));
    const files = completePaths('unique-com', dir, { kind: 'cmd' });
    assert.deepEqual(files, ['unique-complete.txt']);
    const folders = completePaths('only', dir, { kind: 'cmd' });
    assert.equal(folders.length, 1);
    assert.match(folders[0], /onlydir[\\/]$/);
    const posix = completePaths('only', dir, { kind: 'posix' });
    assert.ok(posix[0].endsWith('/'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('complete: longest common prefix is case-insensitive on Windows', () => {
  const items = ['Documents\\', 'Downloads\\'];
  assert.equal(longestCommonPrefix(items, true), 'Do');
  assert.equal(longestCommonPrefix(['alpha.txt', 'alpine.txt']), 'alp');
});

test('complete: exit and quit are command completions', () => {
  const cmd = completeCommands('exi', { kind: 'cmd' });
  assert.ok(cmd.includes('exit'));
  const quit = completeCommands('qui', { kind: 'powershell' });
  assert.ok(quit.includes('quit'));
  const posix = completeCommands('log', { kind: 'posix' });
  assert.ok(posix.includes('logout'));
});

test('complete: no matches, hidden files, and first-token path fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfc-comp3-'));
  try {
    fs.writeFileSync(path.join(dir, 'unique-complete.txt'), 'x');
    fs.writeFileSync(path.join(dir, '.secret'), 'x');
    fs.writeFileSync(path.join(dir, 'shown.txt'), 'x');
    assert.equal(suggestCompletion({
      line: 'zzzzznomatch', cwd: dir, shell: { kind: 'cmd' }, completionKey: '',
    }).type, 'none');
    const visible = completePaths('', dir, { kind: 'cmd' });
    assert.equal(visible.some((n) => n.startsWith('.')), false);
    assert.ok(visible.some((n) => n.includes('shown')));
    const hidden = completePaths('.se', dir, { kind: 'cmd' });
    assert.ok(hidden.some((n) => n.includes('.secret')));
    const first = suggestCompletion({
      line: 'unique-com', cwd: dir, shell: { kind: 'cmd' }, completionKey: '',
    });
    assert.equal(first.type, 'apply');
    assert.match(first.completion, /unique-complete\.txt/);
    assert.deepEqual(completePaths('nope', dir, { kind: 'cmd' }), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('complete: suggest unique command, LCP, then list on second Tab', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfc-comp2-'));
  try {
    fs.writeFileSync(path.join(dir, 'alpha.txt'), 'a');
    fs.writeFileSync(path.join(dir, 'alpine.txt'), 'b');
    const cmd = suggestCompletion({ line: 'ech', cwd: dir, shell: { kind: 'cmd' }, completionKey: '' });
    assert.equal(cmd.type, 'apply');
    assert.equal(cmd.completion, 'echo ');

    const first = suggestCompletion({ line: 'type al', cwd: dir, shell: { kind: 'cmd' }, completionKey: '' });
    assert.equal(first.type, 'apply');
    assert.equal(first.pending, true);
    assert.ok(first.completion.toLowerCase().startsWith('alp'));

    const line = `type ${first.completion}`;
    const second = suggestCompletion({
      line,
      cwd: dir,
      shell: { kind: 'cmd' },
      completionKey: line,
    });
    assert.equal(second.type, 'list');
    assert.ok(second.items.some((n) => n.includes('alpha')));
    assert.ok(second.items.some((n) => n.includes('alpine')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
