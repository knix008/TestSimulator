// Sparrow-style exception requests and SonarQube Accept / tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const users = require('../core/platform/users.js');

async function setup(settings = {}) {
  const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-rv-')) });
  await api.call('project.scan', { path: path.resolve('samples/demo') });
  const ws = api.store.load();
  Object.assign(ws.settings, settings);
  api.store.save(ws);
  const project = ws.projects[0];
  const issue = project.branches.main.latest.issues.find((i) => i.type === 'BUG');
  return { api, projectId: project.id, key: issue.key };
}

const latest = (api, key) => api.store.load().projects[0].branches.main.latest.issues.find((i) => i.key === key);

test('request then approve closes the issue with the requested resolution', async () => {
  const { api, projectId, key } = await setup();
  await assert.rejects(api.call('issue.review', { projectId, keys: [key], action: 'request', reason: ' ' }), /reason/);
  await api.call('issue.review', { projectId, keys: [key], action: 'request', resolution: 'FALSE-POSITIVE', reason: 'test code only' });
  assert.equal(latest(api, key).review.state, 'REQUESTED');
  assert.equal(latest(api, key).resolution ?? null, null);
  const pending = await api.call('issue.reviews', { projectId, state: 'REQUESTED' });
  assert.deepEqual(pending.map((p) => p.key), [key]);
  await api.call('issue.review', { projectId, keys: [key], action: 'approve', reason: 'ok' });
  const done = latest(api, key);
  assert.equal(done.review.state, 'APPROVED');
  assert.equal(done.status, 'RESOLVED');
  assert.equal(done.resolution, 'FALSE-POSITIVE');
  assert.deepEqual(done.review.history.map((h) => h.action), ['request', 'approve']);
});

test('reject keeps the issue open and needs a reason; approving twice fails', async () => {
  const { api, projectId, key } = await setup();
  await api.call('issue.review', { projectId, keys: [key], action: 'request', resolution: 'WONTFIX', reason: 'legacy' });
  await api.call('issue.review', { projectId, keys: [key], action: 'reject', reason: 'fix it' });
  const r = latest(api, key);
  assert.equal(r.review.state, 'REJECTED');
  assert.ok(!r.resolution);
  assert.ok(r.comments.some((c) => c.text.includes('fix it')));
  await assert.rejects(api.call('issue.review', { projectId, keys: [key], action: 'approve' }), (e) => e.code === 'NOT_FOUND');
});

test('with approval required, direct false positive / accept is refused', async () => {
  const { api, projectId, key } = await setup({ approval: { required: true, selfApproval: false } });
  await assert.rejects(api.call('issue.update', { projectId, keys: [key], patch: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' } }), (e) => e.code === 'APPROVAL_REQUIRED');
  await assert.rejects(api.call('issue.update', { projectId, keys: [key], patch: { status: 'ACCEPTED' } }), (e) => e.code === 'APPROVAL_REQUIRED');
  await api.call('issue.update', { projectId, keys: [key], patch: { status: 'CONFIRMED' } });
  await api.call('issue.review', { projectId, keys: [key], action: 'request', reason: 'r', by: 'dev' });
  await assert.rejects(api.call('issue.review', { projectId, keys: [key], action: 'approve', by: 'dev' }), (e) => e.code === 'FORBIDDEN');
  await api.call('issue.review', { projectId, keys: [key], action: 'approve', by: 'lead' });
  assert.equal(latest(api, key).resolution, 'FALSE-POSITIVE');
});

test('only issue admins approve when permissions are on', async () => {
  const { api, projectId, key } = await setup();
  const ws = api.store.load();
  users.ensureSecurity(ws);
  users.setPassword(ws, 'admin', 'admin-password-1');
  users.createUser(ws, { login: 'dev', name: 'Dev', password: 'developer-pw' });
  users.setEnabled(ws, true);
  api.store.save(ws);
  const dev = (await api.call('security.login', { login: 'dev', password: 'developer-pw' })).token;
  const admin = (await api.call('security.login', { login: 'admin', password: 'admin-password-1' })).token;
  await api.call('issue.review', { projectId, keys: [key], action: 'request', reason: 'generated code' }, { token: dev });
  assert.equal(latest(api, key).review.requestedBy, 'dev');
  await assert.rejects(api.call('issue.review', { projectId, keys: [key], action: 'approve' }, { token: dev }), (e) => e.code === 'FORBIDDEN');
  await api.call('issue.review', { projectId, keys: [key], action: 'approve' }, { token: admin });
  assert.equal(latest(api, key).review.decidedBy, 'admin');
});

test('Accept status, editable tags and both survive a rescan', async () => {
  const { api, projectId, key } = await setup();
  await api.call('issue.update', { projectId, keys: [key], patch: { status: 'ACCEPTED' } });
  await api.call('issue.update', { projectId, keys: [key], patch: { tags: ['Legacy', 'q3 '] } });
  let i = latest(api, key);
  assert.equal(i.status, 'ACCEPTED');
  assert.equal(i.resolution, 'WONTFIX');
  assert.deepEqual(i.tags, ['legacy', 'q3']);
  await api.call('project.scan', { path: path.resolve('samples/demo') });
  i = latest(api, key);
  assert.equal(i.status, 'ACCEPTED');
  assert.deepEqual(i.tags, ['legacy', 'q3']);
});
