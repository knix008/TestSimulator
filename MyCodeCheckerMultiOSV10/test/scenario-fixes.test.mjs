// Fixes from the usage-scenario review: changes made during an analysis are
// kept, the last administrator cannot be removed, issue values are checked,
// analysis jobs belong to their user, cancelled analyses are not failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const { merge3 } = require('../core/merge.js');
const users = require('../core/platform/users.js');

const SAMPLE = path.resolve('samples/cpp-sensor');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-fix-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rejects = (promise, code) => assert.rejects(promise, (err) => err.code === code);

async function finish(api, jobId, ctx) {
  for (let i = 0; i < 600; i++) {
    const job = await api.call('scan.job', { jobId }, ctx);
    if (job.status !== 'running') return job;
    await sleep(50);
  }
  throw new Error('analysis did not finish');
}

async function securedApi() {
  const api = createApi({ configDir: tmp() });
  await api.call('project.scan', { path: SAMPLE, name: 'Sensor' });
  const ws = api.store.load();
  users.ensureSecurity(ws);
  users.setPassword(ws, 'admin', 'admin-password-1');
  users.createUser(ws, { login: 'dev', name: 'Developer', password: 'developer-pw' });
  users.grantGlobal(ws, 'scan', { user: 'dev' });
  users.setEnabled(ws, true);
  api.store.save(ws);
  const admin = { token: (await api.call('security.login', { login: 'admin', password: 'admin-password-1' })).token };
  const dev = { token: (await api.call('security.login', { login: 'dev', password: 'developer-pw' })).token };
  return { api, admin, dev, projectId: ws.projects[0].id };
}

test('merge3 keeps both sides and lets the operation win only where it changed', () => {
  const base = { settings: { a: 1, b: 1 }, projects: [{ id: 'p', name: 'P', issueState: {} }], tasks: [] };
  const mine = { settings: { a: 1, b: 2 }, projects: [{ id: 'p', name: 'P', issueState: {}, latest: 1 }], tasks: [{ id: 't2', submittedAt: '2026-02' }] };
  const theirs = { settings: { a: 5, b: 1 }, projects: [{ id: 'p', name: 'P', issueState: { k: 'CONFIRMED' } }, { id: 'q' }], tasks: [{ id: 't1', submittedAt: '2026-01' }] };
  const out = merge3(base, mine, theirs);
  assert.deepEqual(out.settings, { a: 5, b: 2 });
  assert.deepEqual(out.projects[0], { id: 'p', name: 'P', issueState: { k: 'CONFIRMED' }, latest: 1 });
  assert.equal(out.projects[1].id, 'q');
  assert.deepEqual(out.tasks.map((t) => t.id), ['t2', 't1'], 'tasks stay newest first');
  assert.deepEqual(merge3({ x: [{ id: 1 }, { id: 2 }] }, { x: [{ id: 1 }, { id: 2 }] }, { x: [{ id: 1 }] }).x, [{ id: 1 }], 'their deletion is kept');
});

test('issue changes and settings saved during an analysis survive it', async () => {
  const api = createApi({ configDir: tmp() });
  const first = await api.call('project.scan', { path: SAMPLE });
  const key = first.analysis.issues[0].key;
  const projectId = first.project.id;
  const { jobId } = await api.call('scan.start', { path: SAMPLE });
  await api.call('issue.update', { projectId, keys: [key], patch: { status: 'CONFIRMED', comment: 'during the scan' } });
  const ws = await api.call('workspace.load');
  ws.settings.maxFiles = 1234;
  await api.call('workspace.save', ws);
  assert.equal((await finish(api, jobId)).status, 'done');
  const after = await api.call('workspace.load');
  const project = after.projects.find((p) => p.id === projectId);
  assert.equal(project.issueState[key].status, 'CONFIRMED');
  assert.equal(project.issueState[key].comments.at(-1).text, 'during the scan');
  assert.equal(after.settings.maxFiles, 1234);
  assert.equal(project.branches.main.snapshot, 2, 'the analysis itself was saved');
});

test('a cancelled analysis is recorded as CANCELED, not as a failure', async () => {
  const api = createApi({ configDir: tmp() });
  const { jobId } = await api.call('scan.start', { path: SAMPLE });
  await sleep(50);
  await api.call('scan.cancel', { jobId });
  await sleep(400);
  const ws = await api.call('workspace.load');
  assert.equal(ws.tasks[0].status, 'CANCELED');
});

test('a second start for the same project joins the running analysis', async () => {
  const api = createApi({ configDir: tmp() });
  const a = await api.call('scan.start', { path: SAMPLE });
  const b = await api.call('scan.start', { path: SAMPLE });
  assert.equal(b.jobId, a.jobId);
  assert.equal(b.joined, true);
  await finish(api, a.jobId);
});

test('issue.update rejects unknown values, keys and projects', async () => {
  const api = createApi({ configDir: tmp() });
  const first = await api.call('project.scan', { path: SAMPLE });
  const projectId = first.project.id;
  const key = first.analysis.issues[0].key;
  await rejects(api.call('issue.update', { projectId, keys: [key], patch: { status: 'FOO' } }), 'BAD_REQUEST');
  await rejects(api.call('issue.update', { projectId, keys: [key], patch: { resolution: 'MAYBE' } }), 'BAD_REQUEST');
  await rejects(api.call('issue.update', { projectId, keys: [key], patch: { classification: 'Nice' } }), 'BAD_REQUEST');
  await rejects(api.call('issue.update', { projectId, keys: ['no-such-key'], patch: { status: 'CONFIRMED' } }), 'NOT_FOUND');
  await rejects(api.call('issue.update', { projectId: 'nope', keys: [key], patch: { status: 'CONFIRMED' } }), 'NOT_FOUND');
  const ok = await api.call('issue.update', { projectId, keys: [key], patch: { status: 'RESOLVED', resolution: 'FIXED' } });
  assert.ok(ok);
});

test('the last active administrator cannot be removed', async () => {
  const { api, admin } = await securedApi();
  const call = (fn, ...args) => api.call('security.call', { fn, args }, admin);
  await rejects(call('removeMember', 'administrators', 'admin'), 'LAST_ADMIN');
  await rejects(call('revokeGlobal', 'admin', { group: 'administrators' }), 'LAST_ADMIN');
  await rejects(call('updateUser', 'admin', { active: false }), 'LAST_ADMIN');
  assert.ok(await api.call('security.get', {}, admin), 'the administrator still has access');
  // With a second administrator, the first may leave the group.
  await call('grantGlobal', 'admin', { user: 'dev' });
  await call('removeMember', 'administrators', 'admin');
});

test('users with scan permission can read DAST results', async () => {
  const { api, dev } = await securedApi();
  assert.ok(Array.isArray(await api.call('dast.results', {}, dev)));
});

test('analysis jobs belong to the user who started them', async () => {
  const { api, admin, dev } = await securedApi();
  const { jobId } = await api.call('scan.start', { path: SAMPLE }, admin);
  await rejects(api.call('scan.cancel', { jobId }, dev), 'FORBIDDEN');
  await rejects(api.call('scan.job', { jobId }, dev), 'FORBIDDEN');
  assert.equal((await finish(api, jobId, admin)).status, 'done');
});

test('creating a project on a registered folder needs confirmation', async () => {
  const api = createApi({ configDir: tmp() });
  const src = tmp();
  fs.writeFileSync(path.join(src, 'a.js'), 'export const a = 1;\n');
  await api.call('project.scan', { path: src, name: 'Demo' });
  await assert.rejects(api.call('project.create', { name: 'X', source: src }), (e) => e.code === 'CONFLICT' && e.projectName === 'Demo');
  assert.equal((await api.call('workspace.load')).projects[0].name, 'Demo', 'the existing project is unchanged');
  const made = await api.call('project.create', { name: 'X', source: src, replace: true });
  assert.equal(made.project.name, 'X');
});

test('saving a project file does not replace a file it was not opened from', async () => {
  const api = createApi({ configDir: tmp() });
  const src = tmp();
  fs.writeFileSync(path.join(src, 'a.js'), 'export const a = 1;\n');
  const r = await api.call('project.scan', { path: src, name: 'Demo' });
  const existing = path.join(src, `${r.project.key}.mccp`);
  fs.writeFileSync(existing, '{"keep":true}');
  await assert.rejects(api.call('project.saveFile', { projectId: r.project.id }), (e) => e.code === 'CONFLICT' && e.file === existing);
  assert.equal(fs.readFileSync(existing, 'utf8'), '{"keep":true}');
  await api.call('project.saveFile', { projectId: r.project.id, overwrite: true });
  // Once it is the project's own file, later saves just update it.
  await api.call('project.saveFile', { projectId: r.project.id });
  assert.match(fs.readFileSync(existing, 'utf8'), /mycodechecker-project/);
});

test('file.save writes only in the desktop app', async () => {
  const out = path.join(tmp(), 'r.txt');
  await rejects(createApi({ configDir: tmp() }).call('file.save', { path: out, text: 'x' }), 'NO_METHOD');
  const desktop = createApi({ configDir: tmp(), localFiles: true });
  assert.equal((await desktop.call('file.save', { path: out, text: '안녕' })).path, out);
  assert.equal(fs.readFileSync(out, 'utf8'), '안녕');
  await desktop.call('file.save', { path: out, base64: Buffer.from([1, 2, 3]).toString('base64') });
  assert.deepEqual([...fs.readFileSync(out)], [1, 2, 3]);
  await rejects(desktop.call('file.save', { path: path.join(tmp(), 'missing', 'x.txt'), text: '' }), 'BAD_REQUEST');
});

test('error answers carry the project of a CONFLICT', () => {
  const { serializeError } = require('../core/api.js');
  const e = serializeError(Object.assign(new Error('x'), { code: 'CONFLICT', projectId: 'p1', projectName: 'Demo' }));
  assert.equal(e.projectId, 'p1');
  assert.equal(e.projectName, 'Demo');
});

test('schedules hide DAST credentials from non-administrators', async () => {
  const { api, admin, dev } = await securedApi();
  await api.call('schedule.save', { schedule: { id: 's1', kind: 'dast', cron: '0 3 * * *', target: 'http://127.0.0.1:1', auth: { user: 'u', password: 'secret' } } }, admin);
  assert.equal((await api.call('schedule.list', {}, admin)).find((s) => s.id === 's1').auth.password, 'secret');
  const seen = await api.call('schedule.list', {}, dev).catch((e) => e);
  if (Array.isArray(seen)) assert.deepEqual(seen.find((s) => s.id === 's1').auth, { redacted: true });
  else assert.equal(seen.code, 'FORBIDDEN');
});

test('project.remove answers without secrets and drops the recent entry', async () => {
  const { api, admin, projectId } = await securedApi();
  const ws = await api.call('project.remove', { projectId }, admin);
  assert.equal(ws.projects.length, 0);
  assert.ok(!(ws.security && ws.security.users && ws.security.users.some((u) => u.password)), 'no password hashes');
  assert.ok(!(ws.recent || []).some((r) => r.projectId === projectId));
  await rejects(api.call('project.remove', { projectId }, admin), 'NOT_FOUND');
});
