// Terminal sessions (bottom dock): shell round trip, cwd tracking, non-ASCII
// input, git status for the prompt, and the API dispatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTerminals } = require('../core/terminal.js');
const { createApi } = require('../core/api.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tmpdir(name) { return fs.mkdtempSync(path.join(os.tmpdir(), `cc-term-${name}-`)); }
// A killed shell releases its working directory a moment after taskkill returns.
async function rmrf(dir) {
  for (let i = 0; ; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch (err) { if (i > 40) throw err; }
    await sleep(250);
  }
}

// Polls until the session's transcript satisfies `pred` (or times out).
async function waitFor(terms, id, pred, ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    const r = await terms.read({ id });
    const text = r.chunks.map((c) => c.text).join('');
    if (pred(text, r)) return { text, r };
    if (Date.now() - t0 > ms) throw new Error(`timeout; transcript so far: ${JSON.stringify(text)} cwd=${r.cwd}`);
    await sleep(100);
  }
}

test('shells: at least one shell is offered, each with id and label', () => {
  const terms = createTerminals();
  const list = terms.shells();
  assert.ok(list.length >= 1);
  for (const s of list) { assert.ok(s.id); assert.ok(s.label); }
});

test('session: echo (non-ASCII), cd updates cwd, markers are stripped, kill', async () => {
  const terms = createTerminals();
  const root = tmpdir('sess');
  const sub = path.join(root, '한글 폴더');
  fs.mkdirSync(sub);
  const s = terms.create({ cwd: root });
  assert.equal(path.resolve(s.cwd), path.resolve(root));
  await sleep(process.platform === 'win32' ? 1200 : 300);
  assert.ok(terms.run({ id: s.id, line: 'echo 한글 테스트' }));
  const { text } = await waitFor(terms, s.id, (t) => t.includes('한글'));
  assert.ok(text.includes('한글'));
  assert.ok(!text.includes('__CC_'), 'markers must not leak into the transcript');
  await waitFor(terms, s.id, (_t, rr) => rr.idle);   // the marker after the command makes the shell idle again
  assert.ok(terms.run({ id: s.id, line: `cd "${sub}"` }));
  const { r } = await waitFor(terms, s.id, (_t, rr) => rr.cwd !== s.cwd);
  assert.equal(path.basename(r.cwd), '한글 폴더');
  assert.equal(r.idle, true);
  // A program reading stdin gets the next line typed while the shell is busy, not the marker.
  const ask = process.platform === 'win32' ? '$n = Read-Host; echo "got:$n"' : 'read n; echo "got:$n"';
  assert.ok(terms.run({ id: s.id, line: ask }));
  await sleep(600);
  assert.equal((await terms.read({ id: s.id })).idle, false, 'busy while waiting for input');
  assert.ok(terms.run({ id: s.id, line: '홍길동' }));
  const { r: r2 } = await waitFor(terms, s.id, (t, rr) => t.includes('got:홍길동') && rr.idle);
  assert.equal(r2.idle, true);
  // Tab completion: files of the current directory, commands for the first word.
  const c = terms.complete({ id: s.id, line: 'cd ../한', cursor: 7 });   // the shell is inside '한글 폴더' now
  assert.equal(c.start, 3);
  assert.ok(c.items.some((it) => it.dir && it.text.startsWith('../한글 폴더')));
  const c2 = terms.complete({ id: s.id, line: 'ech', cursor: 3 });
  assert.ok(c2.items.some((it) => it.cmd && it.text === 'echo'));
  // Shell state set by a command survives (the script is sourced, not run in a child).
  assert.ok(terms.run({ id: s.id, line: process.platform === 'win32' ? '$v = 7; echo "v=$v"' : 'v=7; echo "v=$v"' }));
  await waitFor(terms, s.id, (t) => t.includes('v=7'));
  assert.ok(terms.run({ id: s.id, line: 'echo "again:$v"' }));
  await waitFor(terms, s.id, (t) => t.includes('again:7'));
  // The exit code of the last command travels with the marker (prompt status segment); the cwd stays clean.
  assert.ok(terms.run({ id: s.id, line: process.platform === 'win32' ? 'cmd /c exit 3' : 'sh -c "exit 3"' }));
  const { r: r3 } = await waitFor(terms, s.id, (_t, rr) => rr.idle && rr.rc === 3);
  assert.equal(r3.rc, 3);
  assert.ok(!String(r3.cwd).includes(';'));
  assert.ok(terms.run({ id: s.id, line: 'echo ok' }));
  const { r: r4 } = await waitFor(terms, s.id, (t, rr) => t.includes('ok') && rr.idle && rr.rc === 0);
  assert.equal(r4.rc, 0);
  // Incremental reads only return new chunks.
  const all = await terms.read({ id: s.id });
  const none = await terms.read({ id: s.id, since: all.seq });
  assert.equal(none.chunks.length, 0);
  assert.ok(terms.list().some((x) => x.id === s.id));
  assert.ok(terms.kill({ id: s.id }));
  assert.equal(await terms.read({ id: s.id }), null);
  assert.ok(!terms.list().some((x) => x.id === s.id));
  await rmrf(root);
});

test('git: status for the prompt (repo / not a repo)', async () => {
  const terms = createTerminals();
  const root = tmpdir('git');
  const plain = await terms.git({ cwd: root });
  assert.equal(plain.repo, false);
  let hasGit = true;
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { hasGit = false; }
  if (hasGit) {
    const g = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    g('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(root, 'a.txt'), 'a');
    g('add', 'a.txt');
    g('commit', '-q', '-m', 'first');
    fs.writeFileSync(path.join(root, 'a.txt'), 'changed');
    fs.writeFileSync(path.join(root, 'new.txt'), 'n');
    const st = await terms.git({ cwd: root });
    assert.equal(st.repo, true);
    assert.equal(st.branch, 'main');
    assert.equal(st.changed, 1);
    assert.equal(st.untracked, 1);
    assert.equal(st.staged, 0);
  }
  await rmrf(root);
});

test('api: term.* and git.status are dispatched; shutdown kills sessions', async () => {
  const root = tmpdir('api');
  const api = createApi({ configDir: path.join(root, 'cfg'), name: 'test' });
  const shells = await api.call('term.shells', {});
  assert.ok(shells.length >= 1);
  const s = await api.call('term.create', { cwd: root });
  assert.ok(s.id);
  const list = await api.call('term.list', {});
  assert.equal(list.length, 1);
  const st = await api.call('git.status', { cwd: root });
  assert.equal(st.repo, false);
  const r = await api.call('term.read', { id: s.id, since: 0 });
  assert.equal(r.id, s.id);
  // long poll: held back while nothing happens, answered at once when output arrives
  const t0 = Date.now();
  const held = await api.call('term.read', { id: s.id, since: r.seq, idle: true, wait: 400 });
  assert.ok(Date.now() - t0 >= 350, 'waited for the timeout');
  assert.equal(held.chunks.length, 0);
  const pending = api.call('term.read', { id: s.id, since: r.seq, idle: true, wait: 5000 });
  await new Promise((res) => setTimeout(res, 100));
  await api.call('term.run', { id: s.id, line: 'echo woken' });
  const woken = await pending;
  assert.ok(Date.now() - t0 < 4000, 'woken by the command, not the timeout');
  assert.equal(woken.idle, false);
  api.shutdown();
  assert.equal((await api.call('term.list', {})).length, 0);
  await rmrf(root);
});
