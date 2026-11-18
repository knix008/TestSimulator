import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import {
  clampLockMinutes, createLockout, formatCountdown, formatLockMinutes, LOCK_ATTEMPTS, LOCK_CHOICES, LOCK_MIN_MINUTES, lockPolicy,
} from '../../src/domain/signin-lock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Sign-in lock rules', () => {
  test('five failures in a row lock the account for the chosen wait; fewer tell the tries left', () => {
    const lock = createLockout();
    const policy = { attempts: LOCK_ATTEMPTS, minutes: 10 };
    const t0 = 1_000_000;
    for (let i = 1; i < LOCK_ATTEMPTS; i += 1) {
      const step = lock.fail('Admin', policy, t0 + i);
      assert.equal(step.locked, false);
      assert.equal(step.remaining, LOCK_ATTEMPTS - i);
    }
    const fifth = lock.fail('admin', policy, t0 + 10);
    assert.equal(fifth.locked, true);
    assert.equal(fifth.until, t0 + 10 + 10 * 60_000);
    assert.equal(lock.check(' ADMIN ', t0 + 20).locked, true, 'the account is matched without case or spaces');
    assert.equal(lock.check('admin', fifth.until - 1).locked, true);
    assert.equal(lock.check('admin', fifth.until).locked, false, 'the wait ends on time');
    assert.equal(lock.fail('admin', policy, fifth.until + 1).remaining, LOCK_ATTEMPTS - 1, 'after the wait the count starts again');
  });

  test('a good sign-in clears the count, and accounts are counted apart', () => {
    const lock = createLockout();
    lock.fail('kim');
    lock.fail('kim');
    lock.fail('lee');
    lock.succeed('kim');
    assert.equal(lock.check('kim').fails, 0);
    assert.equal(lock.check('lee').fails, 1);
  });

  test('the wait is never shorter than 10 minutes and never longer than 30 days', () => {
    assert.equal(LOCK_MIN_MINUTES, 10);
    assert.equal(clampLockMinutes(3), 10);
    assert.equal(clampLockMinutes('abc'), 10);
    assert.equal(clampLockMinutes(90), 90);
    assert.equal(clampLockMinutes(10 ** 9), 30 * 24 * 60);
    assert.deepEqual(lockPolicy({}), { attempts: 5, minutes: 10 });
    assert.deepEqual(lockPolicy({ security: { lockMinutes: 1440 } }), { attempts: 5, minutes: 1440 });
    for (const minutes of [10, 20, 30, 60, 1440]) assert.ok(LOCK_CHOICES.includes(minutes), `${minutes} minutes is offered`);
  });

  test('waits and countdowns read as words', () => {
    assert.equal(formatLockMinutes(10, 'ko'), '10분');
    assert.equal(formatLockMinutes(60, 'ko'), '1시간');
    assert.equal(formatLockMinutes(1440, 'ko'), '1일');
    assert.equal(formatLockMinutes(90, 'en'), '1 hour 30 minutes');
    assert.equal(formatCountdown(599_001), '10:00', 'a part of a second rounds up');
    assert.equal(formatCountdown(65_000), '1:05');
    assert.equal(formatCountdown(3_723_000), '1:02:03');
    assert.equal(formatCountdown(86_400_000 + 3_723_000, 'en'), '1 day 1:02:03');
  });
});

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

describe('Sign-in lock in the data service', () => {
  let child;
  let base = '';
  let data = '';
  let port = 0;

  async function start() {
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
  }
  async function stop() {
    if (!child) return;
    const done = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await done;
    child = null;
  }
  async function call(pathname, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${base}${pathname}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.json().catch(() => ({})) };
  }
  const signIn = (account, password) => call('/api/session', { method: 'POST', body: { account, password } });

  before(async () => {
    port = await freePort();
    data = mkdtempSync(path.join(os.tmpdir(), 'mwf-lock-'));
    base = `http://127.0.0.1:${port}`;
    await start();
  });

  after(async () => {
    await stop();
    setTimeout(() => { try { rmSync(data, { recursive: true, force: true }); } catch { /* still held a moment */ } }, 300);
  });

  let adminToken = '';

  test('a failed sign-in says why and how many tries are left', async () => {
    const first = await signIn('admin', 'admin');
    adminToken = first.body.token;
    assert.equal((await call('/api/account/password', { method: 'POST', token: adminToken, body: { current: 'admin', next: 'Secret-123' } })).status, 200);
    const wrong = await signIn('admin', 'nope');
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error, 'password');
    assert.equal(wrong.body.remaining, 4);
    assert.equal(wrong.body.minutes, 10);
    const stranger = await signIn('nobody', 'x');
    assert.equal(stranger.body.error, 'not-registered');
    assert.equal(stranger.body.remaining, 4, 'unknown accounts are counted too');
    assert.equal((await signIn('admin', 'Secret-123')).status, 200, 'a good sign-in clears the count');
  });

  test('five failures in a row lock the account; even the right password waits', async () => {
    for (let i = 1; i < 5; i += 1) assert.equal((await signIn('admin', `bad-${i}`)).body.remaining, 5 - i);
    const fifth = await signIn('admin', 'bad-5');
    assert.equal(fifth.status, 429);
    assert.equal(fifth.body.error, 'locked');
    assert.ok(fifth.body.seconds > 9 * 60 && fifth.body.seconds <= 10 * 60, `waits about 10 minutes (${fifth.body.seconds} s)`);
    assert.ok(Number(fifth.retryAfter) > 0);
    const right = await signIn('ADMIN', 'Secret-123');
    assert.equal(right.status, 429);
    assert.equal(right.body.error, 'locked');
  });

  test('a lock outlives a restart of the data service', async () => {
    await stop();
    const saved = JSON.parse(readFileSync(path.join(data, 'lockouts.json'), 'utf8'));
    assert.ok(saved.admin?.until > Date.now());
    await start();
    assert.equal((await signIn('admin', 'Secret-123')).body.error, 'locked');
  });

  test('the administrator chooses the wait and releases a locked account', async () => {
    // Shorten the stored lock so the administrator can sign in again, the way the wait running out would.
    await stop();
    const saved = JSON.parse(readFileSync(path.join(data, 'lockouts.json'), 'utf8'));
    saved.admin.until = Date.now() - 1;
    writeFileSync(path.join(data, 'lockouts.json'), JSON.stringify(saved));
    await start();
    const admin = await signIn('admin', 'Secret-123');
    assert.equal(admin.status, 200);
    adminToken = admin.body.token;

    const ws = (await call('/api/workspace', { token: adminToken })).body.workspace;
    ws.security = { lockMinutes: 60 };
    ws.users.push({ id: 'u-kim', name: 'Kim', login: 'kim', email: '', active: true });
    assert.equal((await call('/api/workspace', { method: 'PUT', token: adminToken, body: { workspace: ws, revision: ws.revision } })).status, 200);
    assert.equal((await call('/api/users/password', { method: 'POST', token: adminToken, body: { userId: 'u-kim', password: 'kim-pass-1', mustChange: false } })).status, 200);

    for (let i = 1; i < 5; i += 1) assert.equal((await signIn('kim', 'wrong')).body.minutes, 60);
    const locked = await signIn('kim', 'wrong');
    assert.equal(locked.body.error, 'locked');
    assert.ok(locked.body.seconds > 59 * 60 && locked.body.seconds <= 60 * 60, `waits about an hour (${locked.body.seconds} s)`);

    const list = await call('/api/lockouts', { token: adminToken });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.locked.map((item) => item.account), ['kim']);
    assert.equal(list.body.policy.minutes, 60);

    const released = await call('/api/lockouts', { method: 'POST', token: adminToken, body: { account: 'kim' } });
    assert.deepEqual(released.body.locked, []);
    assert.equal((await signIn('kim', 'kim-pass-1')).status, 200);
  });

  test('only the administrator may see locks or change the wait', async () => {
    const kim = (await signIn('kim', 'kim-pass-1')).body.token;
    assert.equal((await call('/api/lockouts', { token: kim })).status, 403);
    const ws = (await call('/api/workspace', { token: kim })).body.workspace;
    ws.security = { lockMinutes: 10 };
    assert.equal((await call('/api/workspace', { method: 'PUT', token: kim, body: { workspace: ws, revision: ws.revision } })).status, 200);
    const after = (await call('/api/workspace', { token: adminToken })).body.workspace;
    assert.equal(after.security.lockMinutes, 60, "someone else's save keeps the administrator's wait");
  });
});
