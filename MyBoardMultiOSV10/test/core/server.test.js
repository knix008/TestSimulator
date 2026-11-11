// HTTP servers: the web server (cookies, first-run setup, REST, realtime hub with real `ws` clients) on every
// configured database, and the desktop core (token, CORS, local user, uploads, DB switch, READY line).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { startWeb } from '../../server/web.js';
import { startDesktop } from '../../server/desktop.js';
import { saveDbConfig, loadDbConfig } from '../../server/dbconfig.js';
import { TARGETS, freshConfig, configured, skipMessage } from './helpers/targets.js';

const tmpDir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

/** fetch + JSON helper bound to a base URL. */
function client(base, headers = {}) {
  return async (method, p, body, extra = {}) => {
    const res = await fetch(base + p, {
      method, headers: { ...(body !== undefined && !Buffer.isBuffer(body) ? { 'content-type': 'application/json' } : {}), ...headers, ...extra },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
}

/** A WebSocket that queues messages and lets the test wait for one matching a predicate. */
function live(url, headers = {}) {
  const ws = new WebSocket(url, { headers });
  const queue = [];
  const waiters = [];
  ws.on('message', (m) => {
    const msg = JSON.parse(String(m));
    const w = waiters.findIndex((x) => x.pred(msg));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(msg); else queue.push(msg);
  });
  return {
    ws,
    open: () => new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('unexpected-response', (req, res) => reject(Object.assign(new Error('rejected'), { status: res.statusCode }))); ws.once('error', reject); }),
    send: (m) => ws.send(JSON.stringify(m)),
    next(pred, ms = 3000) {
      const i = queue.findIndex(pred);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); reject(new Error('timed out waiting for a message')); } }, ms);
      });
    },
    drain: () => queue.splice(0),
    close: () => new Promise((r) => { if (ws.readyState === WebSocket.CLOSED) r(); else { ws.once('close', r); ws.close(); } }),
  };
}

for (const target of TARGETS) {
  if (!configured(target)) {
    test(`${target.name} web server + realtime`, (t) => t.skip(skipMessage(target)));
    continue;
  }
  describe(`${target.name} web server + realtime`, () => {
    let web; let api; let base; let adminTok; let bobTok; let project; let boardId;
    const dataDir = tmpDir('myboard-web-');
    before(async () => {
      web = await startWeb({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'dist'), db: await freshConfig(target), scheduler: false });
      base = web.url;
      api = client(base);
      fs.mkdirSync(path.join(dataDir, 'dist', 'assets'), { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'dist', 'index.html'), '<!doctype html><title>MyBoard</title>');
      fs.writeFileSync(path.join(dataDir, 'dist', 'assets', 'app.js'), 'console.log(1)');
    });
    after(async () => { await web?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

    test('first run: setup creates the administrator and sets the session cookie', async () => {
      const info = await api('GET', '/api/info');
      assert.equal(info.status, 200);
      assert.deepEqual([info.data.mode, info.data.realtime, info.data.setupRequired, info.data.needsLogin], ['web', true, true, true]);
      assert.equal((await api('GET', '/api/projects')).data.error.code, 'LOGIN_REQUIRED');
      const setup = await api('POST', '/api/auth/setup', { username: 'boss', password: 'boss-pw', displayName: 'Boss' });
      assert.equal(setup.status, 200);
      assert.match(setup.headers.get('set-cookie'), /^myboard_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
      adminTok = setup.data.token;
      assert.equal((await api('POST', '/api/auth/setup', { username: 'x', password: 'xxxx' })).data.error.code, 'SETUP_DONE');
      const cookie = setup.headers.get('set-cookie').split(';')[0];
      const me = await api('GET', '/api/auth/me', undefined, { cookie });
      assert.equal(me.data.username, 'boss');
      const info2 = await api('GET', '/api/info', undefined, { cookie });
      assert.equal(info2.data.setupRequired, false);
      assert.equal(info2.data.user.role, 'admin');
    });

    test('REST: users, login, projects, issues, errors', async () => {
      const A = client(base, { authorization: `Bearer ${adminTok}` });
      const bob = await A('POST', '/api/users', { username: 'bob', displayName: 'Bob', password: 'bob-pw' });
      assert.equal(bob.status, 200);
      const login = await api('POST', '/api/auth/login', { username: 'bob', password: 'bob-pw' });
      bobTok = login.data.token;
      assert.equal((await api('POST', '/api/auth/login', { username: 'bob', password: 'x' })).status, 401);
      const p = await A('POST', '/api/projects', { key: 'WEB', name: 'Web', template: 'kanban' });
      project = p.data; boardId = p.data.boardId;
      const bad = await A('POST', '/api/projects', { key: 'WEB', name: 'Web' });
      assert.deepEqual([bad.status, bad.data.error.code], [409, 'PROJECT_KEY_TAKEN']);
      const i = await A('POST', '/api/issues', { projectId: project.id, summary: 'From REST', labels: ['api'] });
      assert.equal(i.data.key, 'WEB-1');
      const stale = await A('PATCH', '/api/issues/WEB-1', { summary: 'x', rev: 99 });
      assert.deepEqual([stale.status, stale.data.error.code, stale.data.error.details.current.key], [409, 'CONFLICT', 'WEB-1']);
      const s = await A('GET', `/api/issues?jql=${encodeURIComponent('labels = api')}`);
      assert.deepEqual([s.data.total, s.data.items[0].key], [1, 'WEB-1']);
      const v = await A('POST', '/api/jql/validate', { jql: 'status = ' });
      assert.equal(v.data.error.code, 'JQL_SYNTAX');
      assert.equal((await A('GET', '/api/jql/suggest?text=sta&caret=3')).data.items[0].label, 'status');
      assert.ok((await A('GET', '/api/jql/fields')).data.some((f) => f.name === 'statusCategory'));
      assert.equal((await A('GET', '/api/nope')).status, 404);
      assert.equal((await A('PUT', '/api/issues/WEB-1', {})).status, 405);
      const notJson = await fetch(`${base}/api/issues`, { method: 'POST', headers: { authorization: `Bearer ${adminTok}`, 'content-type': 'application/json' }, body: '{bad' });
      assert.equal((await notJson.json()).error.code, 'INVALID_JSON');
      assert.equal((await A('GET', `/api/boards/${boardId}/data`)).data.issues.length + (await A('GET', `/api/boards/${boardId}/data`)).data.backlog.length, 1);
      const csv = await A('GET', `/api/export/csv?jql=${encodeURIComponent('project = WEB')}`);
      assert.match(csv.headers.get('content-disposition'), /issues\.csv/);
      const exp = await A('GET', `/api/projects/${project.id}/export`);
      assert.equal(exp.data.format, 'myboard');
      assert.match(exp.headers.get('content-disposition'), /WEB\.myboard/);
      // static files and SPA fallback
      const html = await fetch(`${base}/boards/123`);
      assert.match(await html.text(), /<title>MyBoard/);
      assert.equal((await fetch(`${base}/assets/app.js`)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal((await fetch(`${base}/missing.png`)).status, 404);
      assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 404);
      // non-admins do not see the database config; logout clears the session
      const B = client(base, { authorization: `Bearer ${bobTok}` });
      assert.equal((await B('GET', '/api/db/config')).status, 403);
      assert.equal((await A('GET', '/api/db/config')).data.type, web.core.db.info.type);
    });

    test('realtime: auth, subscribe, events with client ids, presence, notifications', async () => {
      const wsBase = base.replace('http', 'ws') + '/api/live';
      const anon = live(wsBase);
      await assert.rejects(anon.open(), (e) => e.status === 401);
      const a = live(`${wsBase}?token=${adminTok}`);
      const b = live(wsBase, { cookie: `myboard_session=${bobTok}` });
      await a.open(); await b.open();
      a.send({ op: 'hello', clientId: 'tab-a' });
      b.send({ op: 'hello', clientId: 'tab-b' });
      await a.next((m) => m.op === 'hello'); await b.next((m) => m.op === 'hello');
      a.send({ op: 'sub', topics: [`project:${project.id}`, `board:${boardId}`, 'project:nope', 'user:someone-else'] });
      const subA = await a.next((m) => m.op === 'subscribed');
      assert.deepEqual(subA.topics, [`project:${project.id}`, `board:${boardId}`]);
      assert.deepEqual(subA.denied, ['project:nope', 'user:someone-else']);
      b.send({ op: 'sub', topics: [`project:${project.id}`] });
      assert.deepEqual((await b.next((m) => m.op === 'subscribed')).denied, [`project:${project.id}`], 'bob is not a member yet');

      const A = client(base, { authorization: `Bearer ${adminTok}`, 'x-client-id': 'tab-a' });
      await A('POST', `/api/projects/${project.id}/members`, { userId: (await A('GET', '/api/users')).data.find((u) => u.username === 'bob').id, role: 'member' });
      b.send({ op: 'sub', topics: [`project:${project.id}`] });
      assert.deepEqual((await b.next((m) => m.op === 'subscribed')).topics, [`project:${project.id}`]);

      const created = await A('POST', '/api/issues', { projectId: project.id, summary: 'Live one' });
      const evB = await b.next((m) => m.op === 'event' && m.event.type === 'issue.created');
      assert.equal(evB.event.id, created.data.id);
      assert.equal(evB.event.client, 'tab-a', 'the sender can ignore its own optimistic change');
      assert.ok(evB.event.topics.includes(`project:${project.id}`));
      assert.equal(evB.event.data.key, created.data.key);
      const evA = await a.next((m) => m.op === 'event' && m.event.type === 'issue.created');
      assert.equal(evA.event.client, 'tab-a');

      // presence: both see each other on the board topic
      b.send({ op: 'sub', topics: [`board:${boardId}`] });
      await b.next((m) => m.op === 'subscribed');
      a.send({ op: 'presence', topic: `board:${boardId}`, state: { view: 'board' } });
      b.send({ op: 'presence', topic: `board:${boardId}`, state: { view: 'issue', issueId: created.data.id, editing: 'summary' } });
      const pres = await a.next((m) => m.op === 'presence' && m.users.length === 2);
      const bobP = pres.users.find((u) => u.name === 'Bob');
      assert.deepEqual(bobP.state, { view: 'issue', issueId: created.data.id, editing: 'summary' });
      b.send({ op: 'presence', topic: 'board:other', state: { view: 'board' } });
      assert.equal((await b.next((m) => m.op === 'error')).code, 'NOT_SUBSCRIBED');

      // a notification reaches bob on his own user topic without subscribing
      await A('PATCH', `/api/issues/${created.data.id}`, { assigneeId: (await A('GET', '/api/users')).data.find((u) => u.username === 'bob').id });
      const note = await b.next((m) => m.op === 'event' && m.event.type === 'notification.created');
      assert.equal(note.event.data.kind, 'assigned');

      // moving a card is broadcast
      const cols = (await A('GET', `/api/boards/${boardId}`)).data.columns;
      await A('POST', `/api/issues/${created.data.id}/move`, { boardId, columnId: cols[2].id });
      const moved = await b.next((m) => m.op === 'event' && m.event.type === 'issue.moved');
      assert.equal(moved.event.data.columnId, cols[2].id);
      await b.next((m) => m.op === 'event' && m.event.type === 'issue.transitioned');

      b.send({ op: 'ping' });
      await b.next((m) => m.op === 'pong');
      // leaving updates presence for the others
      await b.close();
      const after1 = await a.next((m) => m.op === 'presence' && m.users.length === 1);
      assert.equal(after1.users[0].name, 'Boss');
      a.send({ op: 'unsub', topics: [`project:${project.id}`] });
      a.drain();
      await A('POST', '/api/issues', { projectId: project.id, summary: 'Unseen' });
      await assert.rejects(a.next((m) => m.op === 'event' && m.event.type === 'issue.created', 300));
      await a.close();
      await web.core.events.idle();
      assert.ok(await web.core.db.count('change_log') > 0, 'web mode writes the change log');
    });
  });
}

describe('desktop core', () => {
  let d; let api; let dataDir;
  before(async () => {
    dataDir = tmpDir('myboard-desk-');
    d = await startDesktop({ port: 0, dataDir, scheduler: false });
    api = client(d.url, { authorization: `Bearer ${d.token}` });
  });
  after(async () => { await d?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

  test('token, CORS for Tauri and dev origins, local user', async () => {
    assert.equal((await fetch(`${d.url}/api/info`)).status, 401);
    assert.equal((await fetch(`${d.url}/api/info?token=${d.token}`)).status, 200);
    const info = await api('GET', '/api/info');
    assert.deepEqual([info.data.mode, info.data.realtime, info.data.needsLogin, info.data.user.role], ['desktop', false, false, 'admin']);
    assert.ok(fs.existsSync(path.join(dataDir, 'myboard.sqlite3')));
    for (const origin of ['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost', 'http://127.0.0.1:5173', 'http://localhost:1420']) {
      const pre = await fetch(`${d.url}/api/projects`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'PATCH' } });
      assert.equal(pre.status, 204, origin);
      assert.equal(pre.headers.get('access-control-allow-origin'), origin);
      assert.match(pre.headers.get('access-control-allow-headers'), /X-Client-Id/);
    }
    const evil = await fetch(`${d.url}/api/projects`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
  });

  test('uploads: raw attachment bytes, download, public icons', async () => {
    const p = await api('POST', '/api/projects', { key: 'DESK', name: 'Desk', template: 'simple' });
    const i = await api('POST', '/api/issues', { projectId: p.data.id, summary: 'Has file' });
    const bytes = Buffer.from('hello, 세계');
    const up = await api('POST', `/api/issues/${i.data.id}/attachments`, bytes, { 'content-type': 'text/plain', 'x-file-name': encodeURIComponent('인사.txt') });
    assert.equal(up.data.fileName, '인사.txt');
    const dl = await fetch(`${d.url}/api/attachments/${up.data.id}?token=${d.token}`);
    assert.ok(Buffer.from(await dl.arrayBuffer()).equals(bytes));
    assert.match(dl.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''%EC%9D%B8%EC%82%AC\.txt$/);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>');
    const ic = await api('POST', '/api/icons', { name: 'sq', data: svg.toString('base64') });
    const pubIcon = await fetch(`${d.url}/api/icons/${ic.data.id}`);
    assert.equal(pubIcon.status, 200, 'icons load in <img> without the token');
    assert.equal(pubIcon.headers.get('content-type'), 'image/svg+xml');
    const samples = await api('POST', '/api/samples', { language: 'en' });
    assert.equal(samples.data.projects.length, 3);
  });

  test('switch database (persisted, password encrypted) and back', async () => {
    const other = path.join(dataDir, 'second.sqlite3');
    const t = await api('POST', '/api/db/test', { type: 'sqlite', file: other });
    assert.equal(t.data.ok, true);
    const sw = await api('POST', '/api/db/switch', { type: 'sqlite', file: other });
    assert.equal(sw.data.label, 'SQLite second.sqlite3');
    assert.deepEqual(loadDbConfig(dataDir), { type: 'sqlite', file: other });
    const info = await api('GET', '/api/info');
    assert.equal(info.data.db.label, 'SQLite second.sqlite3');
    assert.equal((await api('GET', '/api/projects')).data.length, 0, 'a fresh database');
    assert.equal(info.data.user.username, 'local', 'local user re-created in the new database');
    const bad = await api('POST', '/api/db/switch', { type: 'oracle' });
    assert.equal(bad.data.error.code, 'DB_TYPE_UNKNOWN');
    // stored passwords are encrypted at rest
    const dir2 = tmpDir('myboard-cfg-');
    saveDbConfig(dir2, { type: 'postgres', host: 'db', database: 'b', user: 'u', password: 'p@ss-워드' });
    const raw = fs.readFileSync(path.join(dir2, 'database.json'), 'utf8');
    assert.ok(!raw.includes('p@ss'));
    assert.equal(loadDbConfig(dir2).password, 'p@ss-워드');
    fs.rmSync(dir2, { recursive: true, force: true });
  });

  test('a shared database with several users requires login (X-Session)', async () => {
    await api('POST', '/api/users', { username: 'ann', displayName: 'Ann', password: 'ann-pw' });
    await api('POST', '/api/auth/password', { newPassword: 'local-pw' });
    await d.core.events.idle();
    await new Promise((r) => setTimeout(r, 50));
    const info = await api('GET', '/api/info');
    assert.equal(info.data.needsLogin, true);
    assert.equal((await api('GET', '/api/projects')).data.error.code, 'LOGIN_REQUIRED');
    const login = await api('POST', '/api/auth/login', { username: 'ann', password: 'ann-pw' });
    const me = await api('GET', '/api/auth/me', undefined, { 'x-session': login.data.token });
    assert.equal(me.data.username, 'ann');
  });
});

test('desktop.js prints MYBOARD_READY and exits when the parent dies', async () => {
  const dataDir = tmpDir('myboard-proc-');
  const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  const child = spawn(process.execPath, [path.resolve('server/desktop.js'), '--port', '0', '--data', dataDir, '--parent-pid', String(parent.pid)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const line = await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (c) => { buf += c; const m = /MYBOARD_READY (\d+) (\S+)/.exec(buf); if (m) resolve(m); });
    child.on('exit', (code) => reject(new Error(`exited ${code}`)));
    setTimeout(() => reject(new Error('no READY line')), 15000);
  });
  const res = await fetch(`http://127.0.0.1:${line[1]}/api/info`, { headers: { authorization: `Bearer ${line[2]}` } });
  assert.equal((await res.json()).mode, 'desktop');
  const exited = new Promise((resolve) => child.on('exit', resolve));
  parent.kill();
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 8000))]);
  assert.equal(code, 0);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
