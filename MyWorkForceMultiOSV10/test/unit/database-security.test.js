import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { listMessages, openRoom, postMessage } from '../../server/chat.mjs';
import { openEngine, tlsProblem } from '../../server/engine.mjs';
import { keyFingerprint, openValue, parseKey } from '../../server/privacy.mjs';
import { keyState, openRepository } from '../../server/repository.mjs';
import { sampleWorkspace } from '../../src/domain/sample.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'mwf-dbsec-'));

describe('Encrypted database', () => {
  test('the first connection writes a key check; the same key opens it again', async () => {
    const dir = temp();
    const file = path.join(dir, 'a.sqlite');
    const key = randomBytes(32);
    const first = await openRepository({ engine: 'sqlite', file, privacyKey: key });
    await first.writeWorkspace(sampleWorkspace(Date.parse('2026-11-18T00:00:00Z')), 0);
    await first.close();
    const engine = await openEngine({ engine: 'sqlite', file, schema: false });
    assert.equal(await keyState(engine, key), 'match');
    assert.equal(await keyState(engine, randomBytes(32)), 'mismatch');
    await engine.close();
    const again = await openRepository({ engine: 'sqlite', file, privacyKey: key });
    assert.equal(again.cached.projects.length, 2);
    await again.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('another key is refused instead of writing what nobody could read', async () => {
    const dir = temp();
    const file = path.join(dir, 'b.sqlite');
    const key = randomBytes(32);
    const first = await openRepository({ engine: 'sqlite', file, privacyKey: key });
    await first.writeWorkspace(sampleWorkspace(Date.parse('2026-11-18T00:00:00Z')), 0);
    await first.close();
    const other = randomBytes(32);
    await assert.rejects(() => openRepository({ engine: 'sqlite', file, privacyKey: other }), (error) => error.message === 'key-mismatch' && error.detail === keyFingerprint(other));
    rmSync(dir, { recursive: true, force: true });
  });

  test('a database from before encryption is sealed at its first connection', async () => {
    const dir = temp();
    const file = path.join(dir, 'c.sqlite');
    const engine = await openEngine({ engine: 'sqlite', file });
    const ws = sampleWorkspace(Date.parse('2026-11-18T00:00:00Z'));
    ws.revision = 3;
    await engine.query('INSERT INTO workspace_document (id, body, saved_at) VALUES (?, ?, ?)', ['main', JSON.stringify(ws), 'x']);
    await engine.query('INSERT INTO chat_messages (id, room_id, user_id, kind, body, file_id, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ['m1', 'r1', 'u1', 'text', 'plain hello', '', '', 'x']);
    await engine.close();
    const key = randomBytes(32);
    const repo = await openRepository({ engine: 'sqlite', file, privacyKey: key });
    const body = (await repo.engine.query('SELECT body FROM workspace_document', []))[0].body;
    assert.ok(body.startsWith('mwf1:'));
    const message = (await repo.engine.query('SELECT body FROM chat_messages', []))[0].body;
    assert.equal(openValue(message, key), 'plain hello');
    assert.ok(message.startsWith('mwf1:'));
    assert.equal(await keyState(repo.engine, key), 'match');
    await repo.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('chat messages are sealed in the table and read back as written', async () => {
    const repo = await openRepository({ engine: 'sqlite', file: ':memory:' });
    const people = [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }];
    const room = await openRoom(repo.engine, 'u1', { kind: 'direct', members: ['u2'] }, people);
    await postMessage(repo.engine, 'u1', room.id, '비밀 회의 안건');
    const raw = (await repo.engine.query('SELECT body FROM chat_messages', []))[0].body;
    assert.ok(raw.startsWith('mwf1:') && !raw.includes('비밀'));
    assert.equal((await listMessages(repo.engine, 'u2', room.id))[0].body, '비밀 회의 안건');
    await repo.close();
  });

  test('TLS failures are told apart: no TLS at the server, TLS required, an untrusted certificate', () => {
    assert.equal(tlsProblem(new Error('The server does not support SSL connections')), 'tls-unsupported');
    assert.equal(tlsProblem({ code: 'HANDSHAKE_NO_SSL_SUPPORT', message: '' }), 'tls-unsupported');
    assert.equal(tlsProblem(new Error('no pg_hba.conf entry for host "10.0.0.2", user "wf", database "work", SSL off')), 'tls-required');
    assert.equal(tlsProblem(new Error('self-signed certificate in certificate chain')), 'tls-certificate');
    assert.equal(tlsProblem(new Error('connect ECONNREFUSED 127.0.0.1:5432')), '');
  });

  test('a key is accepted as base64 or hex and nothing else', () => {
    const key = randomBytes(32);
    assert.deepEqual(parseKey(key.toString('base64')), key);
    assert.deepEqual(parseKey(key.toString('hex')), key);
    assert.throws(() => parseKey('short'), /key-invalid/);
  });
});

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

describe('Database settings in the data service', () => {
  let child;
  let base = '';
  let data = '';

  before(async () => {
    const port = await freePort();
    data = temp();
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

  let token = '';
  const post = async (pathname, body, as = token) => {
    const response = await fetch(`${base}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${as}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  /** Signs in as the administrator of whichever database is open (a new one still has admin / admin). */
  async function signInAdmin() {
    let signed = await post('/api/session', { account: 'admin', password: 'Secret-123' }, '');
    if (signed.status !== 200) {
      signed = await post('/api/session', { account: 'admin', password: 'admin' }, '');
      await post('/api/account/password', { current: 'admin', next: 'Secret-123' }, signed.body.token);
    }
    token = signed.body.token;
  }

  test('signed out, the status tells nothing about the database, and nothing can be changed', async () => {
    const status = await (await fetch(`${base}/api/status`)).json();
    assert.equal(status.connected, true);
    assert.equal(status.database, undefined);
    assert.equal(status.saved, undefined);
    assert.equal(status.encryption, undefined);
    assert.equal((await post('/api/connect', { engine: 'sqlite', file: path.join(data, 'x.sqlite') }, '')).status, 403);
    assert.equal((await post('/api/connect/test', { engine: 'sqlite' }, '')).status, 403);
    assert.equal((await post('/api/disconnect', {}, '')).status, 403);
    assert.equal((await post('/api/unlock', { userId: 'x', password: 'y' }, '')).status, 401);
    assert.equal((await fetch(`${base}/api/schema/sql?engine=mysql`)).status, 403);
    assert.equal((await fetch(`${base}/api/workspace`)).status, 401);
    assert.equal((await fetch(`${base}/api/audit`)).status, 403);
  });

  test('signed in as the administrator, the status says the stored data is encrypted', async () => {
    await signInAdmin();
    const status = await (await fetch(`${base}/api/status`, { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(status.encryption.algorithm, 'AES-256-GCM');
    assert.match(status.encryption.fingerprint, /^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
  });

  test('testing a new SQLite file reports the tables to be made at the first connection, and makes nothing', async () => {
    const file = path.join(data, 'other.sqlite');
    const tested = await post('/api/connect/test', { engine: 'sqlite', file });
    assert.equal(tested.body.ok, true);
    assert.equal(tested.body.schema.ready, false);
    assert.ok(tested.body.schema.missing.includes('workspace_document'));
    assert.equal(tested.body.key.state, 'new');
    assert.equal(tested.body.current, false);
    const again = await post('/api/connect/test', { engine: 'sqlite', file });
    assert.ok(again.body.schema.missing.includes('workspace_document'), 'a test leaves the database as it was');
  });

  test('testing the open database says it is current, ready, and sealed with this key', async () => {
    const tested = await post('/api/connect/test', { engine: 'sqlite' });
    assert.equal(tested.body.ok, true);
    assert.equal(tested.body.current, true);
    assert.equal(tested.body.schema.ready, true);
    assert.equal(tested.body.key.state, 'match');
  });

  test('a server that does not answer is reported, not thrown', async () => {
    const port = await freePort();
    const tested = await post('/api/connect/test', { engine: 'postgres', host: '127.0.0.1', port, database: 'x', user: 'x', password: 'x' });
    assert.equal(tested.body.ok, false);
    assert.ok(['connect', 'driver-missing'].includes(tested.body.error));
    assert.ok(tested.body.detail);
  });

  test('a database sealed by another data service is refused until its key is brought', async () => {
    const file = path.join(data, 'shared.sqlite');
    const theirs = randomBytes(32);
    const elsewhere = await openRepository({ engine: 'sqlite', file, privacyKey: theirs });
    await elsewhere.writeWorkspace(sampleWorkspace(Date.parse('2026-11-18T00:00:00Z')), 0);
    await elsewhere.close();
    const tested = await post('/api/connect/test', { engine: 'sqlite', file });
    assert.equal(tested.body.key.state, 'mismatch');
    const refused = await post('/api/connect', { engine: 'sqlite', file });
    assert.equal(refused.body.error, 'key-mismatch');
    const withKey = await post('/api/connect/test', { engine: 'sqlite', file, encryptionKey: theirs.toString('base64') });
    assert.equal(withKey.body.key.state, 'match');
    const joined = await post('/api/connect', { engine: 'sqlite', file, encryptionKey: theirs.toString('base64') });
    assert.equal(joined.status, 200);
    // Another database has its own people: sign in there, then back again.
    await signInAdmin();
    assert.equal((await post('/api/connect', { engine: 'sqlite' })).status, 200);
    await signInAdmin();
    // The key is kept for that database: the next connection needs no key typed.
    assert.equal((await post('/api/connect', { engine: 'sqlite', file })).status, 200);
    await signInAdmin();
    assert.equal((await post('/api/connect/test', { engine: 'sqlite', file })).body.key.state, 'match');
    await post('/api/connect', { engine: 'sqlite' });
    await signInAdmin();
  });
});
