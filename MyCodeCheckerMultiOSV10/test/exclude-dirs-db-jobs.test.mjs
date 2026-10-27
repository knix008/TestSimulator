// Excluded folders (project.excludeDirs, project.dirs) and database exports
// with progress, a per-statement time limit, cancelling, and jobs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const db = require('../core/dbsink.js');
const { createApi } = require('../core/api.js');
const { walk, analyzeSources } = require('../core/analyze.js');
const projectfile = require('../core/projectfile.js');
const { DatabaseSync } = require('node:sqlite');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const JS = 'var a = 1;\neval(a);\n';

function tree() {
  const root = tmp('mcc-xd-');
  for (const rel of ['src/a.js', 'gen/b.js', 'src/gen/c.js', 'src/Deep/x/d.js', 'node_modules/m/e.js']) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), JS);
  }
  return root;
}
const rels = (root, files) => files.map((f) => path.relative(root, f).replace(/\\/g, '/')).sort();

test('excluded folders are skipped at their place in the tree only', () => {
  const root = tree();
  assert.deepEqual(rels(root, walk(root, {})), ['gen/b.js', 'src/Deep/x/d.js', 'src/a.js', 'src/gen/c.js']);
  assert.deepEqual(rels(root, walk(root, { excludeDirs: ['gen'] })), ['src/Deep/x/d.js', 'src/a.js', 'src/gen/c.js']);
  assert.deepEqual(rels(root, walk(root, { excludeDirs: ['src/gen', './src/deep/'] })), ['gen/b.js', 'src/a.js']);
  const res = analyzeSources([{ path: 'gen/b.js', text: JS }, { path: 'src/a.js', text: JS }], { root, excludeDirs: ['gen'] });
  assert.deepEqual([...new Set(res.issues.map((i) => i.file))], ['src/a.js']);
});

test('project.dirs lists sub-folders; scans honour project.excludeDirs; .mccp keeps them', async () => {
  const root = tree();
  const api = createApi({ configDir: tmp('mcc-xd-ws-') });
  const top = await api.call('project.dirs', { path: root });
  assert.deepEqual(top.map((d) => [d.rel, d.hasChildren, d.skipped]), [['gen', false, false], ['node_modules', true, true], ['src', true, false]]);
  assert.deepEqual((await api.call('project.dirs', { path: root, sub: 'src' })).map((d) => d.rel), ['src/Deep', 'src/gen']);
  await assert.rejects(api.call('project.dirs', { path: root, sub: '../..' }), (e) => e.code === 'BAD_REQUEST');
  await assert.rejects(api.call('project.dirs', { path: path.join(root, 'none') }), (e) => e.code === 'NOT_FOUND');

  const first = await api.call('project.scan', { path: root });
  assert.equal(first.analysis.measures.files, 4);
  const ws = await api.call('workspace.load', {});
  const projects = ws.projects.map(({ branches, desktop, ...p }) => ({ ...p, excludeDirs: ['gen', 'src/Deep'] }));
  await api.call('workspace.save', { workspace: { ...ws, projects } });
  const second = await api.call('project.scan', { path: root });
  assert.equal(second.analysis.measures.files, 2);
  assert.ok(second.analysis.issues.every((i) => !/^(gen|src\/Deep)\//.test(i.file)));

  const file = path.join(tmp('mcc-xd-pf-'), 'p.mccp');
  projectfile.writeProjectFile(file, { name: 'p', source: root, settings: { excludeDirs: ['gen'] } });
  assert.deepEqual(projectfile.readProjectFile(file).settings.excludeDirs, ['gen']);
});

const ANALYSIS = { finishedAt: '2026-10-27T00:00:00Z', qualityGate: { status: 'OK' }, measures: { bugs: 1 }, issues: Array.from({ length: 1200 }, (_, i) => ({ key: `k${i}`, rule: 'r', type: 'BUG', severity: 'MAJOR', file: 'a.js', line: i, message: 'm' })) };
const PROJECT = { id: 'p', key: 'k', name: 'n', path: '/p' };

test('exports report progress up to every row', async () => {
  const file = path.join(tmp('mcc-dbp-'), 'p.db');
  const seen = [];
  const out = await db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'sqlite', file }, { project: PROJECT, branch: 'main', analysis: ANALYSIS }, { onProgress: (p) => seen.push(p) });
  assert.equal(out.issues, 1200);
  assert.deepEqual([...new Set(seen.map((p) => p.phase))], ['connect', 'schema', 'write', 'commit']);
  const last = seen.filter((p) => p.phase === 'write').pop();
  assert.equal(last.done, last.total);
  assert.equal(last.total, 3 + 1 + 1200);
});

test('a statement past the time limit fails with DB_TIMEOUT and rolls back', async () => {
  const seen = [];
  let closed = false;
  const driver = { kind: 'postgres', async query(sql) { seen.push(sql); if (sql.startsWith('INSERT') && sql.includes('_issues')) return new Promise(() => {}); return []; }, async version() { return 'x'; }, async close() { closed = true; } };
  const started = Date.now();
  await assert.rejects(db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'postgres', timeoutSec: 1 }, { project: PROJECT, branch: 'main', analysis: ANALYSIS }, { driver }), (e) => {
    assert.equal(e.code, 'DB_TIMEOUT');
    assert.match(e.text.ko, /1초 안에 응답하지 않았습니다/);
    return true;
  });
  assert.ok(Date.now() - started < 5000);
  assert.ok(seen.includes('ROLLBACK'));
  assert.ok(closed);
  // A connection that never comes up times out as well.
  await assert.rejects(db.testConnection({ ...db.DEFAULTS, kind: 'postgres', timeoutSec: 1 }, { driver: { kind: 'postgres', query: () => new Promise(() => {}), version: () => 'x', close: async () => {} } }), (e) => e.code === 'DB_TIMEOUT');
});

test('a cancelled export stops between statements and rolls back', async () => {
  const seen = [];
  let cancel = false;
  const driver = { kind: 'postgres', async query(sql) { seen.push(sql); if (sql.startsWith('INSERT')) cancel = true; return []; }, async version() { return 'x'; }, async close() {} };
  await assert.rejects(db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'postgres' }, { project: PROJECT, branch: 'main', analysis: ANALYSIS }, { driver, isCancelled: () => cancel }), (e) => e.code === 'CANCELLED');
  assert.equal(seen.filter((s) => s.startsWith('INSERT')).length, 1);
  assert.ok(seen.includes('ROLLBACK'));
});

test('db.exportStart runs as a job with progress; the time limit is a setting', async () => {
  const api = createApi({ configDir: tmp('mcc-dbj-') });
  const file = path.join(tmp('mcc-dbjf-'), 'j.db');
  const saved = await api.call('db.save', { db: { enabled: true, kind: 'sqlite', file, autoExport: false, timeoutSec: 2 } });
  assert.equal(saved.timeoutSec, 5, 'clamped to at least 5 s');
  const r = await api.call('project.scan', { path: path.resolve('samples/demo') });
  const { jobId } = await api.call('db.exportStart', { projectId: r.project.id });
  let job;
  // Up to 30 s: the suite runs files in parallel and a busy machine is slow.
  for (const until = Date.now() + 30000; Date.now() < until;) {
    job = await api.call('db.exportJob', { jobId });
    if (job.status !== 'running') break;
    await new Promise((res) => setTimeout(res, 20));
  }
  assert.equal(job.status, 'done', JSON.stringify(job.error));
  assert.equal(job.progress.percent, 100);
  assert.equal(job.timeoutSec, 5);
  assert.equal(job.result.issues, r.analysis.issues.length);
  const d = new DatabaseSync(file);
  assert.equal(d.prepare('select count(*) c from mcc_issues').get().c, r.analysis.issues.length);
  d.close();
  await assert.rejects(api.call('db.exportJob', { jobId: 'dbjob-none' }), (e) => e.code === 'NOT_FOUND');
});

test('an automatic export failure after a scan is reported with a coded error', async () => {
  const api = createApi({ configDir: tmp('mcc-dbe-') });
  await api.call('db.save', { db: { enabled: true, kind: 'postgres', host: '127.0.0.1', port: 1, user: 'x', password: 'y', autoExport: true } });
  const r = await api.call('project.scan', { path: path.resolve('samples/demo') });
  assert.equal(r.task.dbError.code, 'DB_CONNECT');
  assert.ok(r.task.dbError.text.ko.includes('연결할 수 없습니다'));
});

test('identical lines in one file get distinct issue keys; the first keeps its key', () => {
  const text = 'int f(void) {\n  // x = compute(y);\n  return 0;\n}\nint g(void) {\n  // x = compute(y);\n  return 1;\n}\n';
  const res = analyzeSources([{ path: 'a.c', text }], { root: '/r' });
  const same = res.issues.filter((i) => i.rule === 'common:commented-code');
  assert.equal(same.length, 2);
  assert.notEqual(same[0].key, same[1].key);
  assert.equal(new Set(res.issues.map((i) => i.key)).size, res.issues.length);
  const one = analyzeSources([{ path: 'a.c', text: text.split('int g')[0] }], { root: '/r' });
  assert.equal(one.issues.find((i) => i.rule === 'common:commented-code').key, same.find((i) => i.line === 2).key);
});

test('a repeated issue key still exports (rows get #2)', async () => {
  const file = path.join(tmp('mcc-dbdup-'), 'd.db');
  const issues = [{ key: 'same', rule: 'r', line: 1, message: 'a' }, { key: 'same', rule: 'r', line: 2, message: 'b' }];
  const out = await db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'sqlite', file }, { project: PROJECT, branch: 'main', analysis: { ...ANALYSIS, issues } });
  assert.equal(out.issues, 2);
  const d = new DatabaseSync(file);
  assert.deepEqual(d.prepare('select issue_key k from mcc_issues order by issue_key').all().map((r) => r.k), ['same', 'same#2']);
  d.close();
});
