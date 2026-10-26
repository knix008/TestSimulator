// Permission enforcement through the API and the HTTP handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const { createHandler } = require('../server/handle.js');
const users = require('../core/platform/users.js');

const SAMPLE = path.resolve('samples/demo');

function tempApi() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-perm-'));
  return { api: createApi({ configDir: dir }), dir };
}

async function securedApi() {
  const { api, dir } = tempApi();
  await api.call('project.scan', { path: SAMPLE, name: 'Demo' });
  const ws = api.store.load();
  users.ensureSecurity(ws);
  users.setPassword(ws, 'admin', 'admin-password-1');
  users.createUser(ws, { login: 'dev', name: 'Developer', password: 'developer-pw' });
  users.setEnabled(ws, true);
  api.store.save(ws);
  const admin = (await api.call('security.login', { login: 'admin', password: 'admin-password-1' })).token;
  const dev = (await api.call('security.login', { login: 'dev', password: 'developer-pw' })).token;
  return { api, dir, admin, dev, projectId: ws.projects[0].id };
}

async function rejects(promise, code) {
  await assert.rejects(promise, (err) => err.code === code);
}

test('with permissions off every call works without a token', async () => {
  const { api } = tempApi();
  const ws = await api.call('workspace.load');
  assert.equal(ws.security, undefined);
  const me = await api.call('security.me');
  assert.equal(me.enabled, false);
});

test('with permissions on, calls need a signed-in user', async () => {
  const { api, dev } = await securedApi();
  await rejects(api.call('workspace.load'), 'UNAUTHORIZED');
  await rejects(api.call('workspace.load', {}, { token: 'mcu_forged' }), 'UNAUTHORIZED');
  assert.ok((await api.call('app.info')).rules > 0, 'public calls stay open');
  const ws = await api.call('workspace.load', {}, { token: dev });
  assert.equal(ws.projects.length, 1, 'default template lets Anyone browse');
  assert.equal(ws.security.users, undefined, 'non-admins do not get the user list');
  const me = await api.call('security.me', {}, { token: dev });
  assert.equal(me.login, 'dev');
  assert.ok(!me.permissions.global.includes('admin'));
});

test('workspace.load never returns password or token hashes', async () => {
  const { api, admin } = await securedApi();
  const ws = await api.call('workspace.load', {}, { token: admin });
  assert.ok(ws.security.users.every((u) => u.password === undefined));
  assert.ok(ws.security.tokens.every((t) => t.hash === undefined));
});

test('admin-only calls and sections are refused for plain users', async () => {
  const { api, dev, admin, projectId } = await securedApi();
  await rejects(api.call('security.get', {}, { token: dev }), 'FORBIDDEN');
  await rejects(api.call('webhook.list', {}, { token: dev }), 'FORBIDDEN');
  await rejects(api.call('project.remove', { projectId }, { token: dev }), 'FORBIDDEN');
  const ws = await api.call('workspace.load', {}, { token: dev });
  await rejects(api.call('workspace.save', { workspace: { ...ws, gates: [] } }, { token: dev }), 'FORBIDDEN');
  await rejects(api.call('workspace.save', { workspace: { ...ws, profiles: [] } }, { token: dev }), 'FORBIDDEN');
  await rejects(api.call('workspace.save', { workspace: { ...ws, settings: { ...ws.settings, exclusions: [] } } }, { token: dev }), 'FORBIDDEN');
  // Display preferences are personal.
  const saved = await api.call('workspace.save', { workspace: { ...ws, settings: { ...ws.settings, theme: 'paper' } } }, { token: dev });
  assert.equal(saved.settings.theme, 'paper');
  assert.ok((await api.call('security.get', {}, { token: admin })).users.length >= 2);
});

test('a client cannot overwrite the security section or analysis data', async () => {
  const { api, admin } = await securedApi();
  const ws = await api.call('workspace.load', {}, { token: admin });
  const forged = { ...ws, security: { enabled: false }, projects: ws.projects.map((p) => ({ ...p, branches: {} })) };
  await api.call('workspace.save', { workspace: forged }, { token: admin });
  const stored = api.store.load();
  assert.equal(stored.security.enabled, true);
  assert.ok(stored.security.users[0].password.startsWith('scrypt$'));
  assert.ok(Object.keys(stored.projects[0].branches).length > 0);
});

test('issue status changes need issue admin, comments only browse', async () => {
  const { api, dev, admin, projectId } = await securedApi();
  const ws = api.store.load();
  const issue = ws.projects[0].branches.main.latest.issues.find((i) => i.type !== 'SECURITY_HOTSPOT');
  await api.call('issue.update', { projectId, keys: [issue.key], patch: { comment: 'looks real' } }, { token: dev });
  await rejects(api.call('issue.update', { projectId, keys: [issue.key], patch: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' } }, { token: dev }), 'FORBIDDEN');
  await api.call('issue.update', { projectId, keys: [issue.key], patch: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' } }, { token: admin });
  const state = api.store.load().projects[0].issueState[issue.key];
  assert.equal(state.comments[0].author, 'dev');
  assert.equal(state.changelog.at(-1).by, 'admin');
});

test('users manage their own tokens, analysis tokens can only scan', async () => {
  const { api, dev, projectId } = await securedApi();
  const res = await api.call('security.call', { fn: 'generateToken', args: { login: 'dev', name: 'ci', type: 'PROJECT_ANALYSIS', projectId } }, { token: dev });
  const scanToken = res.result.token;
  await rejects(api.call('security.call', { fn: 'generateToken', args: { login: 'admin', name: 'steal' } }, { token: dev }), 'FORBIDDEN');
  await rejects(api.call('workspace.load', {}, { token: scanToken }), 'FORBIDDEN');
  const scanned = await api.call('project.scan', { path: SAMPLE, projectId }, { token: scanToken });
  assert.ok(scanned.analysis.issues.length > 0);
  await rejects(api.call('report.build', { projectId }, { token: scanToken }), 'FORBIDDEN');
});

test('sign out revokes the session token', async () => {
  const { api, dev } = await securedApi();
  await api.call('security.logout', {}, { token: dev });
  await rejects(api.call('workspace.load', {}, { token: dev }), 'UNAUTHORIZED');
});

test('the HTTP handler passes the user token header and maps 401 / 403', async () => {
  const { dir, dev } = await securedApi();
  const { handle } = createHandler({ configDir: dir });
  const server = http.createServer((req, res) => { handle(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const post = async (name, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
    return res.status;
  };
  try {
    assert.equal(await post('workspace.load'), 401);
    assert.equal(await post('workspace.load', { 'x-mcc-user-token': dev }), 200);
    assert.equal(await post('security.get', { 'x-mcc-user-token': dev }), 403);
  } finally {
    server.close();
  }
});
