// Main-process prompt glue (src/main/prompt.js): git status parsing, the
// prompt state and ANSI rendering against a real directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseGitStatus, gitStatus, gitStatusSync, refreshGitStatus, promptState, renderPrompt, PRESETS, renderPromptText } = require('../src/main/prompt.js');

test('parseGitStatus reads branch, upstream, ahead/behind, stash and file states', () => {
  const out = [
    '# branch.oid 0123456',
    '# branch.head feature/x',
    '# branch.upstream origin/feature/x',
    '# branch.ab +2 -1',
    '# stash 3',
    '1 M. N... 100644 100644 100644 abc def staged.js',
    '1 .M N... 100644 100644 100644 abc def changed.js',
    '1 MM N... 100644 100644 100644 abc def both.js',
    '2 R. N... 100644 100644 100644 abc def R100 new.js\told.js',
    'u UU N... 100644 100644 100644 100644 abc def ghi conflict.js',
    '? untracked.txt',
    '',
  ].join('\n');
  const st = parseGitStatus(out);
  assert.equal(st.repo, true);
  assert.equal(st.branch, 'feature/x');
  assert.equal(st.upstream, 'origin/feature/x');
  assert.equal(st.ahead, 2);
  assert.equal(st.behind, 1);
  assert.equal(st.stashes, 3);
  assert.equal(st.staged, 3); // staged.js, both.js, renamed
  assert.equal(st.changed, 2); // changed.js, both.js
  assert.equal(st.conflicts, 1);
  assert.equal(st.untracked, 1);
});

test('gitStatus never blocks: first call is pending, the background refresh fills the cache', async () => {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const first = gitStatus(here);
  assert.equal(first.repo, false);
  assert.equal(first.pending, true);
  const refreshed = await refreshGitStatus(here);
  if (refreshed.repo) {
    assert.ok(typeof refreshed.branch === 'string' && refreshed.branch.length > 0);
    assert.ok(refreshed.staged >= 0 && refreshed.changed >= 0);
    assert.equal(gitStatus(here).branch, refreshed.branch); // now served from the cache
  }
  const outside = gitStatusSync(os.tmpdir());
  assert.equal(typeof outside.repo, 'boolean');
  assert.equal(gitStatus(os.tmpdir()).pending, undefined); // cached by the sync call
});

test('promptState carries the machine context and honours the git mode', () => {
  const st = promptState({ cwd: os.tmpdir(), shell: 'cmd', rc: 2, ms: 1234, gitMode: 'off' });
  assert.equal(st.cwd, os.tmpdir());
  assert.equal(st.home, os.homedir());
  assert.equal(st.shell, 'cmd');
  assert.equal(st.rc, 2);
  assert.equal(st.ms, 1234);
  assert.equal(st.git.repo, false);
  assert.equal(st.platform, process.platform);
  assert.ok(st.now instanceof Date);
  assert.ok(typeof st.user === 'string' && st.user.length > 0);
});

test('renderPrompt produces ANSI for a preset against the home directory', () => {
  const ansi = renderPrompt(PRESETS.default.config, { cwd: os.homedir(), gitMode: 'off', theme: { accent: '#3b82f6', fg: '#ddd', bg: '#111' } });
  assert.ok(ansi.includes('\x1b[48;2;59;130;246m')); // accent background
  assert.ok(ansi.includes('~')); // home shown as ~
  assert.ok(ansi.endsWith(' '));
  const text = renderPromptText(PRESETS.classic.config, promptState({ cwd: os.homedir(), gitMode: 'off' }));
  assert.ok(text.includes('@'));
  assert.ok(text.endsWith('$ '));
});
