// Saving results to a database: real SQLite, SQL shapes for the server kinds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const db = require('../core/dbsink.js');
const { createApi } = require('../core/api.js');
const { DatabaseSync } = require('node:sqlite');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('settings: defaults per kind, masked password, validation', () => {
  const ws = { settings: {} };
  assert.equal(db.settingsOf(ws, '/cfg').file, path.join('/cfg', 'mycodechecker.db'));
  db.saveSettings(ws, { kind: 'postgres', password: 'pw' }, '/cfg');
  assert.equal(db.settingsOf(ws).port, 5432);
  const pub = db.publicSettings(ws);
  assert.equal(pub.password, db.MASK);
  db.saveSettings(ws, { ...pub, port: 6543 });
  assert.equal(ws.settings.database.password, 'pw');
  assert.throws(() => db.saveSettings(ws, { kind: 'oracle' }), /Unknown/);
  assert.throws(() => db.saveSettings(ws, { schema: 'x; drop' }), /prefix/);
});

test('dialect SQL: create statements, placeholders, chunk sizes', () => {
  const [projects] = db.tableDefs('mcc');
  assert.match(db.createSql('postgres', projects), /^CREATE TABLE IF NOT EXISTS "mcc_projects" \("id" VARCHAR\(200\) NOT NULL/);
  assert.match(db.createSql('mysql', projects), /`mcc_projects`.*LONGTEXT/);
  assert.match(db.createSql('mssql', projects), /^IF OBJECT_ID\(N'mcc_projects', N'U'\) IS NULL CREATE TABLE \[mcc_projects\]/);
  assert.equal(db.placeholders('postgres', 'a=? and b=?'), 'a=$1 and b=$2');
  assert.equal(db.placeholders('mssql', 'a=? and b=?'), 'a=@p1 and b=@p2');
  assert.ok(db.chunkSize('mssql', 19) * 19 <= 2100);
});

test('SQLite export creates tables and is idempotent', async () => {
  const api = createApi({ configDir: tmp('mcc-db-') });
  const r = await api.call('project.scan', { path: path.resolve('samples/demo') });
  const file = path.join(tmp('mcc-dbf-'), 'out.db');
  await api.call('db.save', { db: { enabled: true, kind: 'sqlite', file } });
  const t = await api.call('db.test', {});
  assert.match(t.version, /^SQLite /);
  assert.equal(t.file, path.join(path.dirname(file), 'out-<project>.db'), 'the test names the per-project files');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [], 'the test leaves no file behind');
  const first = await api.call('db.export', { projectId: r.project.id });
  await api.call('db.export', { projectId: r.project.id });
  assert.equal(first.file, db.fileFor({ kind: 'sqlite', file }, r.project));
  assert.ok(!fs.existsSync(file), 'one file per project, not the chosen file');
  const d = new DatabaseSync(first.file);
  try {
    assert.equal(d.prepare('select count(*) c from mcc_analyses').get().c, 1, 'same analysis replaces itself');
    assert.equal(d.prepare('select count(*) c from mcc_issues').get().c, first.issues);
    const row = d.prepare('select gate, bugs, vulnerabilities from mcc_analyses').get();
    assert.equal(row.bugs, r.analysis.measures.bugs);
    assert.ok(['OK', 'ERROR'].includes(row.gate));
    assert.ok(d.prepare("select message_ko from mcc_issues where message_ko <> '' limit 1").get().message_ko.length > 0, 'Korean messages kept');
  } finally {
    d.close();
  }
});

// The export runs after the analysis, in the background (db.exportJob).
async function dbJobEnd(api, jobId) {
  const t0 = Date.now();
  for (;;) {
    const j = await api.call('db.exportJob', { jobId });
    if (j.status !== 'running') return j;
    if (Date.now() - t0 > 30000) throw new Error('DB job still running');
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('with a database set up, results go there in the background after each analysis; failures become task warnings', async () => {
  const api = createApi({ configDir: tmp('mcc-dba-') });
  const file = path.join(tmp('mcc-dbf-'), 'auto.db');
  await api.call('db.save', { db: { enabled: true, kind: 'sqlite', file } });
  const r = await api.call('project.scan', { path: path.resolve('samples/demo') });
  assert.ok(r.task.dbJobId, 'the analysis does not wait for the database');
  assert.equal((await dbJobEnd(api, r.task.dbJobId)).status, 'done');
  assert.ok(api.store.load().tasks[0].db.analysisId, 'the outcome is added to the task');
  const d = new DatabaseSync(db.fileFor({ kind: 'sqlite', file }, r.project));
  assert.equal(d.prepare('select count(*) c from mcc_analyses').get().c, 1);
  d.close();
  await api.call('db.save', { db: { kind: 'postgres', host: '127.0.0.1', port: 1, user: 'x', password: 'y' } });
  const r2 = await api.call('project.scan', { path: path.resolve('samples/demo') });
  assert.equal((await dbJobEnd(api, r2.task.dbJobId)).status, 'failed');
  const task = api.store.load().tasks[0];
  assert.ok(task.warnings.some((w) => /^DB: /.test(w)), 'connection failure reported, scan still succeeds');
  assert.equal(task.status, 'SUCCESS');
});

test('server kinds run the same statements through their driver (fake)', async () => {
  for (const kind of ['postgres', 'mysql', 'mssql']) {
    const seen = [];
    const driver = { kind, async query(sql, params = []) { seen.push({ sql, params }); return []; }, async version() { return 'fake'; }, async close() {} };
    const analysis = { finishedAt: '2026-10-26T00:00:00Z', qualityGate: { status: 'OK' }, measures: { bugs: 2, ncloc: 10 }, issues: [{ key: 'k', rule: 'r', type: 'BUG', severity: 'MAJOR', file: 'a.js', line: 3, message: { en: 'm', ko: '메' }, tags: ['t'] }] };
    const out = await db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind }, { project: { id: 'p', key: 'k', name: 'n', path: '/p' }, branch: 'main', analysis }, { driver });
    assert.equal(out.issues, 1);
    assert.equal(seen.filter((q) => /CREATE TABLE/.test(q.sql)).length, 5, kind);
    assert.ok(seen.some((q) => /^(BEGIN|START TRANSACTION|BEGIN TRANSACTION)$/.test(q.sql)), kind);
    assert.ok(seen.some((q) => /^COMMIT/.test(q.sql)), kind);
    const ins = seen.find((q) => q.sql.includes('_issues') && q.sql.startsWith('INSERT'));
    assert.ok(ins.params.includes('메'), kind);
  }
});

test('a failed write rolls back', async () => {
  const seen = [];
  const driver = { kind: 'postgres', async query(sql) { seen.push(sql); if (sql.includes('INSERT') && sql.includes('_analyses')) throw new Error('boom'); return []; }, async version() { return 'x'; }, async close() {} };
  await assert.rejects(db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'postgres' }, { project: { id: 'p' }, branch: 'main', analysis: { finishedAt: 'x', measures: {}, issues: [] } }, { driver }), /boom/);
  assert.ok(seen.includes('ROLLBACK'));
  await assert.rejects(db.exportAnalysis({ ...db.DEFAULTS }, { project: { id: 'p' }, branch: 'main', analysis: {} }, { driver }), (e) => e.code === 'DB_NOT_CONFIGURED');
});

test('project information goes with the analysis; tables from older versions get the new columns', async () => {
  const file = path.join(tmp('mcc-dbproj-'), 'p.db');
  // A table as the previous version made it.
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE mcc_projects (id TEXT NOT NULL, project_key TEXT, name TEXT, path TEXT, updated_at TEXT, PRIMARY KEY (id))');
  old.exec("INSERT INTO mcc_projects VALUES ('old', 'k', 'n', '/p', 'x')");
  old.close();
  const project = { id: 'p1', key: 'pm', name: 'PM', path: '/src', description: 'Power board', mainBranch: 'main', tags: ['fw'], createdAt: '2026-10-01T00:00:00Z', excludeDirs: ['apis'], includeDirs: ['include'], defines: { A: '1' }, gateId: 'checker-way' };
  const analysis = {
    finishedAt: '2026-10-27T00:00:00Z', languages: { c: 3 }, measures: { files: 3, ncloc: 120, bugs: 1 },
    qualityGate: { name: 'Checker way', status: 'ERROR', conditions: [{ metric: 'bugs', op: 'GT', threshold: 0, actual: 1, status: 'ERROR' }, { metric: 'coverage', op: 'LT', threshold: 80, actual: null, status: 'OFF', enabled: false }] },
    issues: [{ key: 'k', rule: 'r', type: 'BUG', severity: 'MAJOR', file: 'a.c', line: 1, message: 'm' }],
  };
  const settings = { exclusions: ['**/gen/**'], checks: { misraC2004: false, cert: true }, theme: 'nord', ai: { apiKey: 'secret' } };
  const out = await db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'sqlite', file, perProject: false }, { project, branch: 'main', analysis, settings });
  const d = new DatabaseSync(file);
  const p = d.prepare("select * from mcc_projects where id = 'p1'").get();
  assert.equal(p.description, 'Power board');
  assert.equal(p.main_branch, 'main');
  assert.equal(p.last_gate, 'ERROR');
  assert.equal(p.last_analysis_id, out.analysisId);
  assert.deepEqual(JSON.parse(p.tags), ['fw']);
  const det = d.prepare('select * from mcc_project_details').get();
  assert.equal(det.project_id, 'p1');
  assert.equal(det.quality_gate, 'Checker way');
  const cfg = JSON.parse(det.config_json);
  assert.deepEqual(cfg.excludeDirs, ['apis']);
  assert.deepEqual(cfg.exclusions, ['**/gen/**']);
  assert.deepEqual(JSON.parse(det.checks_off), ['misraC2004']);
  assert.equal(JSON.parse(det.gate_json)[1].enabled, false);
  assert.equal(det.ncloc, 120);
  // Program settings never reach the database.
  const all = JSON.stringify(d.prepare('select * from mcc_project_details').all()) + JSON.stringify(d.prepare('select * from mcc_projects').all());
  assert.ok(!all.includes('secret') && !all.includes('nord'));
  d.close();
});

test('SQLite saves each project in a file of its own; perProject off keeps them in one file', async () => {
  const folder = tmp('mcc-dbper-');
  const file = path.join(folder, 'mycodechecker.db');
  const analysis = { finishedAt: '2026-10-29T00:00:00Z', qualityGate: { status: 'OK' }, measures: { bugs: 1 }, issues: [{ key: 'k', rule: 'r', type: 'BUG', severity: 'MAJOR', file: 'a.c', line: 1, message: 'm' }] };
  const projects = [{ id: 'p1', key: 'alpha' }, { id: 'p2', key: 'beta/2' }, { id: 'p3' }];
  for (const project of projects) {
    const out = await db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'sqlite', file }, { project, branch: 'main', analysis });
    assert.equal(out.file, db.fileFor({ kind: 'sqlite', file }, project));
  }
  assert.deepEqual(fs.readdirSync(folder).filter((n) => n.endsWith('.db')).sort(), ['mycodechecker-alpha.db', 'mycodechecker-beta_2.db', 'mycodechecker-p3.db']);
  const d = new DatabaseSync(path.join(folder, 'mycodechecker-alpha.db'));
  assert.deepEqual(d.prepare('select id from mcc_projects').all().map((r) => r.id), ['p1'], 'only its own project');
  d.close();
  for (const project of projects) await db.exportAnalysis({ ...db.DEFAULTS, enabled: true, kind: 'sqlite', file, perProject: false }, { project, branch: 'main', analysis });
  const one = new DatabaseSync(file);
  assert.equal(one.prepare('select count(*) c from mcc_projects').get().c, 3);
  one.close();
  assert.equal(db.settingsOf({ settings: {} }, folder).perProject, true, 'on by default');
});
