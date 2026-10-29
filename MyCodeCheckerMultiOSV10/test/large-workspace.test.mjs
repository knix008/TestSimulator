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

test('issue lists and snapshots are stored in the local database and come back intact', () => {
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
  assert.match(main.latest.issues.$db, /^p1-\w+$/);
  assert.equal(main.snapshots[0].issues.count, 10);
  // One file per list, in the project's folder.
  const files = fs.readdirSync(path.join(dir, 'projects', 'p1')).filter((n) => n.endsWith('.db')).sort();
  assert.equal(files.length, 3);
  assert.ok(files.includes('desktop.db'));
  assert.ok(files.some((n) => /^branch-[0-9a-f]{12}\.db$/.test(n)));
  assert.ok(files.some((n) => /^snap-[0-9a-f]{12}\.db$/.test(n)));
  assert.ok(!fs.existsSync(path.join(dir, 'issues.db')));
  assert.ok(!fs.existsSync(path.join(dir, 'issues')) || !fs.readdirSync(path.join(dir, 'issues')).some((n) => n.endsWith('.ndjson')), 'no list files');

  const backStore = createStore(dir);
  const back = backStore.load();
  assert.deepEqual(back.projects[0].branches.main.latest.issues, issues);
  assert.deepEqual(back.projects[0].desktop.issues, issues.slice(0, 3));
  // Snapshots stay references until asked for.
  const snap = back.projects[0].branches.main.snapshots[0];
  assert.equal(Array.isArray(snap.issues), false);
  assert.deepEqual(store.issuesOf(snap.issues), issues.slice(0, 10));

  // A search runs on the list's own file.
  const page = backStore.searchIssues(back.projects[0], back.projects[0].branches.main.latest, { q: 'break 499' }, { limit: 5 });
  return page.then((p) => {
    assert.equal(p.total, 1);
    assert.equal(p.issues[0].key, 'k499');
    // Removing the project removes its folder.
    back.projects = [];
    backStore.save(back);
    assert.ok(!fs.existsSync(path.join(dir, 'projects', 'p1')));
  });
});

test('a rewritten list replaces its file; a snapshot dropped from the workspace loses its file', () => {
  const dir = tmp('replace');
  const store = createStore(dir);
  const ws = store.load();
  ws.projects.push({ id: 'p1', branches: { main: { latest: { issues: [issue(1)] }, snapshots: [{ snapshot: 1, at: 't1', issues: [issue(1)] }] } } });
  store.save(ws);
  const folder = path.join(dir, 'projects', 'p1');
  assert.equal(fs.readdirSync(folder).filter((n) => n.endsWith('.db')).length, 2);
  const next = [issue(5), issue(6)];
  ws.projects[0].branches.main.latest = { issues: next };
  ws.projects[0].branches.main.snapshots = [];
  store.save(ws);
  const left = fs.readdirSync(folder);
  assert.deepEqual(left.filter((n) => n.endsWith('.db')).map((n) => n.replace(/[0-9a-f]{12}/, 'H')), ['branch-H.db']);
  assert.ok(!left.some((n) => n.includes('.new')), 'no temporary files left');
  assert.deepEqual(createStore(dir).load().projects[0].branches.main.latest.issues, next);
});

test('the lists of an older issues.db move to their own files and issues.db goes', () => {
  const dir = tmp('legacydb');
  const issuedb = require('../core/issuedb.js');
  const issues = Array.from({ length: 40 }, (_, i) => issue(i));
  const old = issuedb.open(path.join(dir, 'issues.db'));
  old.write('p1-0123456789ab', issues);
  old.write('p1-desktop', issues.slice(0, 4));
  old.write('gone-0123456789ab', issues.slice(0, 2));
  old.close();
  fs.writeFileSync(path.join(dir, 'workspace.json'), JSON.stringify({
    version: 1,
    projects: [{ id: 'p1', name: 'p', branches: { main: { latest: { issues: { $db: 'p1-0123456789ab', count: 40 } } } }, desktop: { issues: { $db: 'p1-desktop', count: 4 } } }],
  }));
  const store = createStore(dir);
  const ws = store.load();
  // Read before any save: moved on first use.
  assert.deepEqual(ws.projects[0].desktop.issues, issues.slice(0, 4));
  assert.ok(fs.existsSync(path.join(dir, 'projects', 'p1', 'desktop.db')));
  store.save(ws);
  assert.ok(!fs.existsSync(path.join(dir, 'issues.db')), 'issues.db goes on the save');
  assert.ok(fs.existsSync(path.join(dir, 'projects', 'p1', 'branch-0123456789ab.db')));
  assert.ok(!fs.existsSync(path.join(dir, 'projects', 'gone')), 'a list nobody refers to is not moved');
  const back = createStore(dir).load();
  assert.deepEqual(back.projects[0].branches.main.latest.issues, issues);
  assert.deepEqual(back.projects[0].desktop.issues, issues.slice(0, 4));
});

test('lists of older versions (issues/*.ndjson) are read and move into the database on the next save', () => {
  const dir = tmp('legacy');
  fs.mkdirSync(path.join(dir, 'issues'), { recursive: true });
  const issues = Array.from({ length: 30 }, (_, i) => issue(i));
  fs.writeFileSync(path.join(dir, 'issues', 'p1-old.ndjson'), issues.map((i) => JSON.stringify(i)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'workspace.json'), JSON.stringify({ version: 1, projects: [{ id: 'p1', name: 'p', branches: { main: { latest: { issues: { $file: 'issues/p1-old.ndjson', count: 30 } } } } }] }));
  const store = createStore(dir);
  const ws = store.load();
  assert.deepEqual(ws.projects[0].branches.main.latest.issues, issues);
  store.save(ws);
  const saved = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  assert.ok(saved.projects[0].branches.main.latest.issues.$db);
  assert.ok(!fs.existsSync(path.join(dir, 'issues', 'p1-old.ndjson')), 'the old file goes');
  assert.deepEqual(createStore(dir).load().projects[0].branches.main.latest.issues, issues);
});
test('an issue changed in place is written as one row; a list touched as a whole is written again', () => {
  const dir = tmp('inplace');
  // Count whole-list writes and row updates of the database.
  const issuedb = require('../core/issuedb.js');
  const open = issuedb.open;
  const calls = { write: 0, update: 0 };
  issuedb.open = (f) => {
    const db = open(f);
    return { ...db, write: (...x) => { calls.write++; return db.write(...x); }, update: (...x) => { calls.update++; return db.update(...x); } };
  };
  try {
    const store = createStore(dir);
    const ws = store.load();
    ws.projects.push({ id: 'p1', branches: { main: { latest: { issues: [issue(1), issue(2)] } } } });
    store.save(ws);
    assert.deepEqual(calls, { write: 1, update: 0 });
    const a = store.load();
    store.save(a);
    assert.deepEqual(calls, { write: 1, update: 0 }, 'unchanged list not written again');
    const list = a.projects[0].branches.main.latest.issues;
    list[1].status = 'RESOLVED';
    store.changed(list, [list[1]]);
    store.save(a);
    assert.deepEqual(calls, { write: 1, update: 1 }, 'one row updated in place');
    assert.equal(createStore(dir).load().projects[0].branches.main.latest.issues[1].status, 'RESOLVED');
    list[0].status = 'CONFIRMED';
    store.touch(list);
    store.save(a);
    assert.equal(calls.write, 2, 'written again');
    assert.equal(createStore(dir).load().projects[0].branches.main.latest.issues[0].status, 'CONFIRMED');
  } finally {
    issuedb.open = open;
  }
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

test('an issue list is read only when used; the slim workspace and saves leave it in the database', async () => {
  const dir = tmp('lazy');
  const first = createStore(dir);
  const ws = first.load();
  const issues = Array.from({ length: 300 }, (_, i) => issue(i));
  ws.projects.push({ id: 'p1', name: 'p', branches: { main: { latest: { issues, measures: { ncloc: 10 } }, history: [{ at: 't', cids: [1, 2, 3] }] } } });
  first.save(ws);

  // A fresh process: nothing read yet.
  const store = createStore(dir);
  const back = store.load();
  const latest = back.projects[0].branches.main.latest;
  assert.ok(store.pendingIssues(latest));
  assert.equal(store.issueCount(latest), 300);
  store.save(back); // keeps the list, does not read it
  assert.ok(store.pendingIssues(latest));
  const api = createApi({ configDir: dir });
  const slim = await api.call('workspace.load', { slim: true });
  assert.equal(slim.projects[0].branches.main.latest.issueCount, 300);
  assert.equal(slim.projects[0].branches.main.history[0].cids, undefined, 'history CIDs stay in the service');
  assert.equal(slim.projects[0].branches.main.history[0].cidCount, 3);
  assert.equal(createStore(dir).load().projects[0].branches.main.latest.issues.length, 300);
  // Reading it gives the list.
  assert.deepEqual(store.load().projects[0].branches.main.latest.issues, issues);
});
test('the window pages a list by severity from the database, without reading the whole list', async () => {
  const dir = tmp('head');
  const sev = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
  const issues = Array.from({ length: 5000 }, (_, i) => ({ key: `k${i}`, rule: 'r', severity: sev[i % 5], line: i }));
  const store = createStore(dir);
  const ws = store.load();
  ws.projects.push({ id: 'p1', name: 'p', branches: { main: { latest: { issues } } } });
  store.save(ws);

  const api = createApi({ configDir: dir });
  const page = await api.call('project.issues', { projectId: 'p1', branch: 'main', offset: 0, limit: 5, order: 'severity' });
  assert.equal(page.total, 5000);
  assert.deepEqual(page.issues.map((i) => i.key), ['k4', 'k9', 'k14', 'k19', 'k24']); // BLOCKER first, in list order
  assert.ok(api.store.pendingIssues(api.store.load().projects[0].branches.main.latest), 'the list was not read');
  const late = await api.call('project.issues', { projectId: 'p1', branch: 'main', offset: 4998, limit: 5, order: 'severity' });
  assert.deepEqual(late.issues.map((i) => i.key), ['k4990', 'k4995'], 'the end of the order: the last INFO issues');
});

test('issue.search finds issues in the whole analysis: words, filters, sort, pages and counts', async () => {
  const dir = tmp('search');
  const store = createStore(dir);
  const ws = store.load();
  const sev = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
  const issues = Array.from({ length: 3000 }, (_, i) => ({
    key: `k${i}`, rule: `c:R${i % 7}`, type: i % 10 === 0 ? 'SECURITY_HOTSPOT' : i % 3 ? 'CODE_SMELL' : 'BUG', severity: sev[i % 5], status: i % 11 ? 'OPEN' : 'CONFIRMED',
    file: `src/m${i % 4}/f${i % 9}.${i % 2 ? 'c' : 'java'}`, line: i, isNew: i % 6 === 0, engine: i % 5 ? undefined : 'taint',
    message: { en: `Buffer buf${i % 13} overflows`, ko: `버퍼 buf${i % 13} 넘침` }, standards: i % 8 ? undefined : { misraC2012: ['17.3'] },
  }));
  ws.projects.push({ id: 'p1', name: 'p', branches: { main: { latest: { issues } } } });
  store.save(ws);
  const api = createApi({ configDir: dir });
  const want = (pred) => issues.filter((i) => i.type !== 'SECURITY_HOTSPOT' && pred(i));
  const run = (filter, extra = {}) => api.call('issue.search', { projectId: 'p1', branch: 'main', filter, ...extra });

  const words = await run({ q: 'BUF7 overflows' }, { limit: 10, facets: true });
  assert.equal(words.total, want((i) => /buf7 /i.test(i.message.en)).length, 'words in any case, hotspots left out');
  assert.equal(words.issues.length, 10);
  assert.ok(words.issues.every((i) => i.message.en.includes('buf7 ')));
  assert.equal(Object.values(words.facets.severity).reduce((a, b) => a + b, 0), words.total);
  assert.equal((await run({ q: '넘침 buf12' })).total, want((i) => i.message.ko.includes('buf12 ')).length, 'Korean text');
  assert.equal((await run({ q: 'm2/' })).total, want((i) => i.file.includes('m2/')).length, 'part of a path');
  assert.equal((await run({ severity: 'BLOCKER', status: 'CONFIRMED' })).total, want((i) => i.severity === 'BLOCKER' && i.status === 'CONFIRMED').length);
  assert.equal((await run({ newOnly: true, engine: 'taint' })).total, want((i) => i.isNew && i.engine === 'taint').length);
  assert.equal((await run({ lang: ['.java'] })).total, want((i) => i.file.endsWith('.java')).length);
  assert.equal((await run({ standard: 'misraC' })).total, want((i) => !!i.standards).length);
  assert.equal((await run({ hotspots: true })).total, issues.filter((i) => i.type === 'SECURITY_HOTSPOT').length);
  assert.equal((await run({ rules: ['c:R3'] })).total, issues.filter((i) => i.rule === 'c:R3').length, 'a drill-down includes hotspots');
  // Sort and pages: the pages together are the whole result in order.
  const all = [];
  for (let offset = 0; ; offset += 700) {
    const r = await run({ type: 'BUG' }, { offset, limit: 700, sort: 'file' });
    all.push(...r.issues);
    if (offset + 700 >= r.total) break;
  }
  const bugs = want((i) => i.type === 'BUG').sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  assert.deepEqual(all.map((i) => i.key), bugs.map((i) => i.key));
  // A triage change is found by the next search.
  await api.call('issue.update', { projectId: 'p1', keys: ['k1'], patch: { status: 'CONFIRMED' } });
  assert.ok((await run({ status: 'CONFIRMED' })).issues.some((i) => i.key === 'k1'));
});
test('heavy read results are reused until the project changes, not when only window settings do', async () => {
  const dir = tmp('readcache');
  const src = sampleProject(path.join(dir, 'src'));
  const api = createApi({ configDir: dir });
  const scanned = await api.call('project.scan', { path: src });
  const projectId = scanned.project ? scanned.project.id : (await api.call('workspace.load', { slim: true })).projects[0].id;
  const a = await api.call('arch.graph', { projectId });
  assert.equal(await api.call('arch.graph', { projectId }), a, 'the same result again');
  await api.call('settings.patch', { patch: { tabs: ['issues', 'arch'], theme: 'midnight' } });
  assert.equal(await api.call('arch.graph', { projectId }), a, 'window settings do not matter');
  assert.notEqual(await api.call('arch.graph', { projectId, fresh: true }), a, 'Refresh computes again');
  const b = await api.call('arch.graph', { projectId });
  await api.call('settings.patch', { patch: { exclusions: ['**/x/**'] } });
  assert.notEqual(await api.call('arch.graph', { projectId }), b, 'analysis settings do');
});

test('a large issue list is read a piece at a time, so other work runs meanwhile', async () => {
  const dir = tmp('async');
  const first = createStore(dir);
  const ws = first.load();
  const pad = 'x'.repeat(400);
  const issues = Array.from({ length: 60000 }, (_, i) => ({ key: `k${i}`, rule: 'r', severity: 'MAJOR', line: i, message: { en: pad, ko: pad } }));
  ws.projects.push({ id: 'p1', name: 'p', branches: { main: { latest: { issues } } } });
  first.save(ws);

  const store = createStore(dir);
  const latest = store.load().projects[0].branches.main.latest;
  assert.ok(store.pendingIssues(latest));
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 0);
  const progress = [];
  const [a, b] = await Promise.all([store.loadIssues(latest, (done, total) => progress.push([done, total])), store.loadIssues(latest)]);
  clearInterval(timer);
  assert.equal(a, b, 'two readers share one parse');
  assert.equal(a.length, 60000);
  assert.deepEqual(a[59999], issues[59999]);
  assert.ok(progress.length > 2 && progress.at(-1)[0] === progress.at(-1)[1], 'progress up to the whole file');
  assert.ok(ticks > 0, 'timers ran while the file was read');
  assert.equal(store.pendingIssues(latest), null);
  assert.equal(store.load().projects[0].branches.main.latest.issues, a, 'later loads use the parsed list');
});
