// Large analyses: issue lists live in issues/*.ndjson (a big project's JSON
// outgrows one JavaScript string), snapshots are read on demand, HTTP bodies
// stream, and a workspace that cannot be read is moved aside, never overwritten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createStore } = require('../core/store.js');
const { createApi } = require('../core/api.js');
const { jsonChunks, sameJson } = require('../core/json.js');
const { merge3 } = require('../core/merge.js');

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `mcc-${name}-`));
const issue = (n) => ({ key: `k${n}`, rule: 'r', message: { en: `line\nbreak ${n}`, ko: '한글' }, line: n, tags: [] });

function sampleProject(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.js'), 'var a = 1;\neval(a);\n');
  return dir;
}

test('jsonChunks gives the JSON.stringify text in pieces', () => {
  const big = Array.from({ length: 3000 }, (_, i) => ({ i, s: 'x'.repeat(500), u: undefined, f: () => 1 }));
  const value = { a: [1, undefined, null, 'é"\n'], n: NaN, d: new Date(0), big, nested: { e: {}, l: [] } };
  const pieces = [...jsonChunks(value)];
  assert.ok(pieces.length > 1);
  assert.equal(pieces.join(''), JSON.stringify(value));
  assert.equal([...jsonChunks(undefined)].join(''), 'null');
});

test('sameJson answers like comparing JSON.stringify texts', () => {
  const cases = [
    [{ a: 1, b: undefined }, { a: 1 }, true],
    [{ a: 1, b: 2 }, { b: 2, a: 1 }, false],
    [[1, undefined], [1, null], true],
    [{ n: NaN }, { n: null }, true],
    [{ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] }, true],
    [{ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] }, false],
    [null, undefined, false],
    ['1', 1, false],
  ];
  for (const [a, b, want] of cases) {
    assert.equal(sameJson(a, b), want, JSON.stringify([a, b]));
    assert.equal(JSON.stringify(a) === JSON.stringify(b), want, JSON.stringify([a, b]));
  }
  // merge3 still prefers the side that changed.
  assert.deepEqual(merge3({ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 3 }), { x: 2, y: 3 });
});

test('issue lists and snapshots are stored apart and come back intact', () => {
  const dir = tmp('store');
  const store = createStore(dir);
  const ws = store.load();
  const issues = Array.from({ length: 500 }, (_, i) => issue(i));
  ws.projects.push({
    id: 'p1', name: 'p', branches: { main: { latest: { issues, keys: ['k0'] }, snapshots: [{ snapshot: 1, at: 't1', issues: issues.slice(0, 10) }] } },
    desktop: { issues: issues.slice(0, 3) },
  });
  store.save(ws);
  const saved = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  const main = saved.projects[0].branches.main;
  assert.equal(main.latest.issues.count, 500);
  assert.match(main.latest.issues.$file, /^issues\/p1-\w+\.ndjson$/);
  assert.equal(main.snapshots[0].issues.count, 10);
  assert.equal(fs.readdirSync(path.join(dir, 'issues')).length, 3);

  const back = createStore(dir).load();
  assert.deepEqual(back.projects[0].branches.main.latest.issues, issues);
  assert.deepEqual(back.projects[0].desktop.issues, issues.slice(0, 3));
  // Snapshots stay references until asked for.
  const snap = back.projects[0].branches.main.snapshots[0];
  assert.equal(Array.isArray(snap.issues), false);
  assert.deepEqual(store.issuesOf(snap.issues), issues.slice(0, 10));

  // Removing the project removes its files.
  back.projects = [];
  store.save(back);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'issues')), []);
});

test('an issue changed in place is written on the next save once touched; untouched lists are not rewritten', () => {
  const dir = tmp('inplace');
  const store = createStore(dir);
  const ws = store.load();
  ws.projects.push({ id: 'p1', branches: { main: { latest: { issues: [issue(1), issue(2)] } } } });
  store.save(ws);
  const a = store.load();
  const file = path.join(dir, 'issues', fs.readdirSync(path.join(dir, 'issues'))[0]);
  const before = fs.statSync(file).mtimeMs;
  store.save(a);
  assert.equal(fs.statSync(file).mtimeMs, before, 'unchanged list not written again');
  a.projects[0].branches.main.latest.issues[1].status = 'RESOLVED';
  store.touch(a.projects[0].branches.main.latest.issues);
  store.save(a);
  assert.equal(createStore(dir).load().projects[0].branches.main.latest.issues[1].status, 'RESOLVED');
});

test('an unreadable workspace is moved aside, not overwritten', () => {
  const dir = tmp('broken');
  fs.writeFileSync(path.join(dir, 'workspace.json'), '{"version":1, broken');
  const store = createStore(dir);
  const ws = store.load();
  assert.deepEqual(ws.projects, []);
  const aside = fs.readdirSync(dir).filter((f) => f.startsWith('workspace.json.broken-'));
  assert.equal(aside.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, aside[0]), 'utf8'), '{"version":1, broken');
});

test('workspace.save without analyses keeps the stored ones; snapshots answer from files', async () => {
  const dir = tmp('api');
  const src = sampleProject(path.join(tmp('src'), 'proj'));
  const api = createApi({ configDir: dir });
  const res = await api.call('project.scan', { path: src });
  await api.call('project.scan', { path: src });
  const id = res.project.id;
  const ws = await api.call('workspace.load', {});
  const count = ws.projects[0].branches.main.latest.issues.length;
  assert.ok(count > 0);
  const projects = ws.projects.map(({ branches, desktop, ...p }) => ({ ...p, name: 'renamed' }));
  await api.call('workspace.save', { workspace: { ...ws, projects } });
  const after = await api.call('workspace.load', {});
  assert.equal(after.projects[0].name, 'renamed');
  assert.equal(after.projects[0].branches.main.latest.issues.length, count);
  const list = await api.call('snapshot.list', { projectId: id });
  assert.deepEqual(list.map((s) => s.count), [count, count]);
  const cmp = await api.call('snapshot.compare', { projectId: id });
  assert.equal(cmp.newlyDetected.length, 0);
});

test('large HTTP bodies are streamed and parse back', async () => {
  const { send } = require('../server/handle.js');
  const parts = [];
  const res = {
    headers: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(c) { parts.push(c); },
    end(c) { if (c) parts.push(c); },
  };
  const body = { ok: true, data: Array.from({ length: 30000 }, (_, i) => issue(i)) };
  send(res, 200, body);
  assert.equal(res.headers['content-length'], undefined);
  assert.deepEqual(JSON.parse(parts.join('')), body);
  parts.length = 0;
  send(res, 200, { ok: true });
  assert.equal(res.headers['content-length'], Buffer.byteLength('{"ok":true}'));
  assert.equal(parts.join(''), '{"ok":true}');
});

test('new-code baselines are stored apart, shared between fields and written once', () => {
  const dir = tmp('blobs');
  const store = createStore(dir);
  const ws = store.load();
  const keys = Array.from({ length: 1500 }, (_, i) => `k${i}`);
  const lines = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`f${i}.c`, 'ab']));
  ws.projects.push({ id: 'p1', branches: { main: { keys, lineHashes: lines, latest: { finishedAt: 't1', keys, issues: [issue(1)] }, history: [{ at: 't1', keys, cids: [1, 2] }] } } });
  store.save(ws);
  const json = fs.readFileSync(store.file, 'utf8');
  assert.ok(!json.includes('k1499') && !json.includes('f149.c'), 'workspace.json holds references only');
  const blobs = fs.readdirSync(path.join(dir, 'issues')).filter((f) => f.endsWith('.json'));
  assert.equal(blobs.length, 2, 'one file for the shared keys array, one for the line hashes');
  const back = createStore(dir).load();
  const b = back.projects[0].branches.main;
  assert.deepEqual(b.keys, keys);
  assert.deepEqual(b.latest.keys, keys);
  assert.deepEqual(b.history[0].keys, keys);
  assert.deepEqual(b.history[0].cids, [1, 2], 'short lists stay inline');
  assert.deepEqual(b.lineHashes, lines);
  const stamp = blobs.map((f) => fs.statSync(path.join(dir, 'issues', f)).mtimeMs);
  const again = createStore(dir);
  again.save(again.load());
  assert.deepEqual(blobs.map((f) => fs.statSync(path.join(dir, 'issues', f)).mtimeMs), stamp, 'not written again');
});

test('slim responses leave issues out; settings.patch merges into the stored settings', async () => {
  const dir = tmp('slim');
  const api = createApi({ configDir: dir });
  const src = sampleProject(path.join(tmp('slim-src'), 'proj'));
  const r = await api.call('project.scan', { path: src });
  const slim = await api.call('workspace.load', { slim: true });
  assert.equal(slim.slim, true);
  const latest = slim.projects[0].branches.main.latest;
  assert.equal(latest.issues, undefined);
  assert.equal(latest.issueCount, r.analysis.issues.length);
  assert.ok(latest.qualityGate && latest.measures);
  const saved = await api.call('workspace.save', { workspace: { settings: { ...slim.settings, assignee: 'kim' } }, slim: true });
  assert.equal(saved.projects[0].branches.main.latest.issues, undefined);
  const out = await api.call('settings.patch', { patch: { theme: 'nord' } });
  assert.equal(out.settings.theme, 'nord');
  assert.equal(out.settings.assignee, 'kim', 'other settings kept');
  const full = await api.call('workspace.load', {});
  assert.equal(full.projects[0].branches.main.latest.issues.length, r.analysis.issues.length, 'issues untouched');
});

test('issue.update reaches the disk (the list is marked and written)', async () => {
  const dir = tmp('touch');
  const api = createApi({ configDir: dir });
  const src = sampleProject(path.join(tmp('touch-src'), 'proj'));
  const r = await api.call('project.scan', { path: src });
  const key = r.analysis.issues[0].key;
  await api.call('issue.update', { projectId: r.project.id, keys: [key], patch: { status: 'CONFIRMED' } });
  const fresh = createStore(dir).load();
  assert.equal(fresh.projects[0].branches.main.latest.issues.find((i) => i.key === key).status, 'CONFIRMED');
});
