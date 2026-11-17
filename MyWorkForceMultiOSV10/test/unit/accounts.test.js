import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let child;
let base = '';
let data = '';

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function call(pathname, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const signIn = (account, password) => call('/api/session', { method: 'POST', body: { account, password } });

describe('Accounts and first passwords', () => {
  before(async () => {
    const port = await freePort();
    data = mkdtempSync(path.join(os.tmpdir(), 'mwf-accounts-'));
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
    setTimeout(() => { try { rmSync(data, { recursive: true, force: true }); } catch { /* still held a moment */ } }, 300);
  });

  let adminToken = '';

  test('a fresh install signs in as admin, then must choose a new password before anything else', async () => {
    const first = await signIn('admin', 'admin');
    assert.equal(first.status, 200);
    assert.equal(first.body.user.mustChangePassword, true);
    adminToken = first.body.token;
    assert.equal((await call('/api/workspace', { token: adminToken })).body.error, 'password-change');
    assert.equal((await call('/api/schema', { token: adminToken })).status, 403);
    const weak = await call('/api/account/password', { method: 'POST', token: adminToken, body: { current: 'admin', next: 'abc' } });
    assert.equal(weak.body.error, 'password-weak');
    const same = await call('/api/account/password', { method: 'POST', token: adminToken, body: { current: 'admin', next: 'admin' } });
    assert.ok(['password-same', 'password-weak'].includes(same.body.error));
    const wrong = await call('/api/account/password', { method: 'POST', token: adminToken, body: { current: 'nope', next: 'Secret-123' } });
    assert.equal(wrong.body.error, 'password');
    const changed = await call('/api/account/password', { method: 'POST', token: adminToken, body: { current: 'admin', next: 'Secret-123' } });
    assert.equal(changed.status, 200);
    assert.equal((await call('/api/workspace', { token: adminToken })).status, 200);
    assert.equal((await signIn('admin', 'admin')).status, 403);
    assert.equal((await signIn('admin', 'Secret-123')).body.user.mustChangePassword, false);
  });

  test('the administrator adds a user with an ID and a first password; the user must replace it', async () => {
    const loaded = await call('/api/workspace', { token: adminToken });
    const ws = loaded.body.workspace;
    ws.users.push({ id: 'u-kim', name: 'Kim', login: 'kim', email: '', active: true });
    const saved = await call('/api/workspace', { method: 'PUT', token: adminToken, body: { workspace: ws, revision: ws.revision } });
    assert.equal(saved.status, 200);
    const given = await call('/api/users/password', { method: 'POST', token: adminToken, body: { userId: 'u-kim', password: 'first-pass', mustChange: true } });
    assert.equal(given.status, 200);
    const kim = await signIn('kim', 'first-pass');
    assert.equal(kim.body.user.mustChangePassword, true);
    assert.equal((await call('/api/workspace', { token: kim.body.token })).body.error, 'password-change');
    assert.equal((await call('/api/account/password', { method: 'POST', token: kim.body.token, body: { current: 'first-pass', next: 'kims-own-pass' } })).status, 200);
    assert.equal((await signIn('kim', 'kims-own-pass')).status, 200);
  });

  test('a regular user cannot change logins, passwords, or make themselves administrator by saving', async () => {
    const kim = (await signIn('kim', 'kims-own-pass')).body.token;
    const ws = (await call('/api/workspace', { token: kim })).body.workspace;
    const me = ws.users.find((user) => user.id === 'u-kim');
    const admin = ws.users.find((user) => user.login === 'admin');
    me.login = 'admin';
    admin.passwordHash = 'deadbeef:deadbeef';
    admin.login = 'old-admin';
    await call('/api/workspace', { method: 'PUT', token: kim, body: { workspace: ws, revision: ws.revision } });
    assert.equal((await signIn('admin', 'Secret-123')).status, 200);
    const after = (await call('/api/workspace', { token: kim })).body.workspace;
    assert.equal(after.users.find((user) => user.id === 'u-kim').login, 'kim');
    assert.equal((await call('/api/users/password', { method: 'POST', token: kim, body: { userId: admin.id, password: 'taken-over' } })).status, 403);
  });
});
