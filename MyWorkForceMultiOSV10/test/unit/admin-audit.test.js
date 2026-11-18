import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { isWorkspaceAdmin } from '../../src/domain/permissions.js';
import { ensureAdmin, setAdmin, setLogin, setUserActive, upgradeWorkspace } from '../../src/domain/store.js';
import { workspaceChanges } from '../../server/audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Administrators', () => {
  test('a workspace from before the mark makes the account with the ID admin its administrator', () => {
    const ws = upgradeWorkspace({ users: [{ id: 'a', login: 'admin', name: 'Boss' }, { id: 'k', login: 'kim', name: 'Kim' }] });
    assert.equal(ws.users.find((user) => user.id === 'a').admin, true);
    assert.equal(ws.users.find((user) => user.id === 'k').admin, false);
    assert.equal(ws.users.length, 2, 'no second admin account is made');
  });

  test('the administrator changes their own ID and stays administrator; no new admin / admin appears', () => {
    const ws = upgradeWorkspace({});
    const admin = ws.users.find((user) => isWorkspaceAdmin(user));
    setLogin(ws, admin.id, 'boss', admin.id);
    assert.equal(admin.login, 'boss');
    assert.equal(isWorkspaceAdmin(admin), true);
    assert.equal(ensureAdmin(ws), false);
    assert.equal(ws.users.length, 1);
    assert.equal(isWorkspaceAdmin({ id: 'x', login: 'admin', admin: false }), false, 'the ID admin alone is not administrator');
  });

  test('an administrator makes someone administrator; the last one cannot be removed or turned off', () => {
    const ws = upgradeWorkspace({});
    const admin = ws.users.find((user) => isWorkspaceAdmin(user));
    ws.users.push({ id: 'k', login: 'kim', name: 'Kim', active: true, admin: false });
    assert.throws(() => setAdmin(ws, admin.id, true, 'k'), /permission/);
    setAdmin(ws, 'k', true, admin.id);
    assert.equal(isWorkspaceAdmin(ws.users.find((user) => user.id === 'k')), true);
    setAdmin(ws, admin.id, false, 'k');
    assert.throws(() => setAdmin(ws, 'k', false, 'k'), /admin-required/);
    assert.throws(() => setUserActive(ws, 'k', false), /admin-required/);
  });

  test('a save is turned into account events and a summary of the work', () => {
    const before = { users: [{ id: 'a', login: 'admin', admin: true }, { id: 'k', login: 'kim', admin: false }], projects: [{ id: 'p', key: 'P', issues: [{ id: 'i1', key: 'P-1', updated: '1' }] }], articles: [] };
    const after = structuredClone(before);
    after.users[1].admin = true;
    after.users[1].login = 'kim2';
    after.users.push({ id: 'n', login: 'new', admin: false });
    after.projects[0].issues[0].updated = '2';
    after.projects[0].issues.push({ id: 'i2', key: 'P-2' });
    after.articles.push({ id: 'pg', title: 'Notes' });
    const changes = workspaceChanges(before, after);
    assert.deepEqual(changes.admin.map((item) => item.action).sort(), ['admin-grant', 'login-change', 'user-create']);
    assert.deepEqual(changes.user.issues.created.items, ['P-2']);
    assert.deepEqual(changes.user.issues.changed.items, ['P-1']);
    assert.deepEqual(changes.user.pages.created.items, ['Notes']);
    assert.equal(workspaceChanges(after, after).user, null, 'nothing changed, nothing to log');
  });
});

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

describe('Audit log in the data service', () => {
  let child;
  let base = '';
  let data = '';
  before(async () => {
    const port = await freePort();
    data = mkdtempSync(path.join(os.tmpdir(), 'mwf-audit-'));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [path.join(root, 'server', 'index.mjs'), '--data', data], {
      cwd: root,
      env: { ...process.env, MYWORKFORCE_DATA_PORT: String(port), MYWORKFORCE_DATA_HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the data service did not start')), 20000);
      let text = '';
      child.stdout.on('data', (chunk) => { text += chunk; if (text.includes('MYWORKFORCE_READY')) { clearTimeout(timer); resolve(); } });
    });
  });
  after(() => {
    child?.kill();
    setTimeout(() => { try { rmSync(data, { recursive: true, force: true }); } catch { /* still held */ } }, 300);
  });

  async function call(pathname, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${base}${pathname}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }
  const signIn = (account, password) => call('/api/session', { method: 'POST', body: { account, password } });
  const log = async (token, query = '') => (await call(`/api/audit${query}`, { token })).body.entries || [];
  let adminToken = '';

  test('a new installation signs in with admin / admin, then must choose a password', async () => {
    const first = await signIn('admin', 'admin');
    assert.equal(first.status, 200);
    assert.equal(first.body.user.mustChangePassword, true);
    assert.equal((await call('/api/account/password', { method: 'POST', token: first.body.token, body: { current: 'admin', next: 'Secret-123' } })).status, 200);
    adminToken = (await signIn('admin', 'Secret-123')).body.token;
    await signIn('admin', 'wrong');
  });

  test('the administrator changes their own ID; the old one no longer signs in', async () => {
    const ws = (await call('/api/workspace', { token: adminToken })).body.workspace;
    const me = ws.users.find((user) => user.login === 'admin');
    me.login = 'boss';
    ws.users.push({ id: 'u-kim', name: 'Kim', login: 'kim', email: '', active: true, admin: false });
    assert.equal((await call('/api/workspace', { method: 'PUT', token: adminToken, body: { workspace: ws, revision: ws.revision } })).status, 200);
    assert.equal((await signIn('admin', 'Secret-123')).body.error, 'not-registered');
    const boss = await signIn('boss', 'Secret-123');
    assert.equal(boss.status, 200);
    adminToken = boss.body.token;
    assert.equal((await call('/api/audit', { token: adminToken })).status, 200, 'still the administrator');
    await call('/api/users/password', { method: 'POST', token: adminToken, body: { userId: 'u-kim', password: 'kim-pass-1', mustChange: false } });
  });

  test('a user cannot make themselves administrator; the administrator can make them one', async () => {
    const kim = (await signIn('kim', 'kim-pass-1')).body.token;
    assert.equal((await call('/api/audit', { token: kim })).status, 403);
    let ws = (await call('/api/workspace', { token: kim })).body.workspace;
    ws.users.find((user) => user.id === 'u-kim').admin = true;
    await call('/api/workspace', { method: 'PUT', token: kim, body: { workspace: ws, revision: ws.revision } });
    assert.equal((await call('/api/audit', { token: kim })).status, 403, "a user's own save does not make them administrator");
    ws = (await call('/api/workspace', { token: adminToken })).body.workspace;
    ws.users.find((user) => user.id === 'u-kim').admin = true;
    assert.equal((await call('/api/workspace', { method: 'PUT', token: adminToken, body: { workspace: ws, revision: ws.revision } })).status, 200);
    assert.equal((await call('/api/audit', { token: kim })).status, 200);
  });

  test('every change to rights and accounts is in the log, with who did it', async () => {
    const entries = await log(adminToken, '?category=admin');
    const actions = entries.map((entry) => entry.action);
    for (const expected of ['admin-seed', 'login-change', 'user-create', 'password-set', 'admin-grant']) assert.ok(actions.includes(expected), `${expected} is logged`);
    const grant = entries.find((entry) => entry.action === 'admin-grant');
    assert.equal(grant.actorLogin, 'boss');
    assert.equal(grant.targetId, 'u-kim');
    const rename = entries.find((entry) => entry.action === 'login-change');
    assert.deepEqual(rename.detail, { from: 'admin', to: 'boss' });
    assert.equal(rename.actorLogin, 'admin', 'who acted, as they were before the change');
    assert.ok(entries.every((entry) => entry.category === 'admin'));
  });

  test('what people do is in the log too: sign-ins, failures, password changes, saves', async () => {
    const entries = await log(adminToken, '?category=user');
    const actions = new Set(entries.map((entry) => entry.action));
    for (const expected of ['signin', 'signin-failed', 'password-change']) assert.ok(actions.has(expected), `${expected} is logged`);
    const failed = entries.filter((entry) => entry.action === 'signin-failed');
    assert.ok(failed.some((entry) => entry.detail.account === 'admin' && entry.detail.reason === 'password'), 'a wrong password');
    assert.ok(failed.some((entry) => entry.detail.reason === 'not-registered'), 'an ID that no longer exists');
  });

  test('the log is searched by words, person, kind of event and time', async () => {
    assert.ok((await log(adminToken, '?q=boss')).length > 0);
    assert.ok((await log(adminToken, '?actor=kim')).every((entry) => entry.actorLogin === 'kim'));
    assert.ok((await log(adminToken, '?action=signin')).every((entry) => entry.action === 'signin'));
    assert.equal((await log(adminToken, '?to=2000-01-01')).length, 0);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok((await log(adminToken, `?from=${today}`)).length > 0);
  });

  test('who and what are sealed in the table', async () => {
    const db = new DatabaseSync(path.join(data, 'myworkforce.sqlite'));
    const rows = db.prepare('SELECT actor_login, detail, action, category FROM audit_log').all();
    db.close();
    assert.ok(rows.length > 5);
    const grant = rows.find((row) => row.action === 'admin-grant');
    assert.ok(grant.actor_login.startsWith('mwf1:') && grant.detail.startsWith('mwf1:'));
    assert.ok(!rows.some((row) => String(row.detail).includes('boss')));
  });
});
