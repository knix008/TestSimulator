// FTP in the host: server/ftp-client.js behind POST /api/ftp/<op> (server/fs-api.js)
// against the in-memory test server (test/helpers/ftp-server.mjs), the listing
// parsers, and the whole chain M code → engine ftp class → src/lib/ftpHost.js →
// HTTP host API → FTP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Worker } from 'node:worker_threads';
import { createFsApi } from '../server/fs-api.js';
import { parseListLine, parseMlsdLine, parse257 } from '../server/ftp-client.js';
import { installFtpHost } from '../src/lib/ftpHost.js';
import { createChannel, createReplyWriter } from '../src/engine/protocol.js';
import { startFtpServer } from './helpers/ftp-server.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'msm-ftp-'));
const b64 = (s) => Buffer.from(s).toString('base64');

async function withApi(srvOpts, fn) {
  const srv = await startFtpServer(srvOpts);
  const root = tmp();
  const api = createFsApi({ root, configDir: root, ftpOptions: { timeoutMs: 5000 } });
  try { await fn(srv, (name, args) => api.call(name, args), api); } finally {
    await api.ftp.closeAll();
    await srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('listing parsers: Unix, Windows/IIS, MLSD, 257', () => {
  const now = new Date(2024, 5, 15, 12, 0);
  const u = parseListLine('-rw-r--r--   1 owner    group      1234 Mar  5 09:07 my file.txt', now);
  assert.deepEqual({ ...u, mtimeMs: new Date(u.mtimeMs).toISOString() }, { name: 'my file.txt', isDir: false, size: 1234, mtimeMs: new Date(2024, 2, 5, 9, 7).toISOString() });
  // a "hh:mm" date later than now is last year's
  assert.equal(new Date(parseListLine('-rw-r--r-- 1 a b 1 Dec 24 10:00 x', now).mtimeMs).getFullYear(), 2023);
  assert.deepEqual(parseListLine('drwxr-xr-x  2 0 0 4096 Jan  2  2020 sub', now), { name: 'sub', isDir: true, size: 0, mtimeMs: new Date(2020, 0, 2).getTime() });
  assert.equal(parseListLine('lrwxrwxrwx 1 a b 7 Jan  2  2020 link -> target', now).name, 'link');
  assert.equal(parseListLine('-rw-r--r-- 1 owner 55 Jan  2  2020 nogroup.txt', now).size, 55);
  assert.equal(parseListLine('total 12', now), null);
  const w = parseListLine('01-15-24  01:30PM       <DIR>          Program Files', now);
  assert.deepEqual(w, { name: 'Program Files', isDir: true, size: 0, mtimeMs: new Date(2024, 0, 15, 13, 30).getTime() });
  const w2 = parseListLine('12-31-2023  12:05AM             42 a.bin', now);
  assert.deepEqual(w2, { name: 'a.bin', isDir: false, size: 42, mtimeMs: new Date(2023, 11, 31, 0, 5).getTime() });
  assert.deepEqual(parseMlsdLine('type=file;size=7;modify=20240102030405.5; a b.txt'), { name: 'a b.txt', isDir: false, size: 7, mtimeMs: Date.UTC(2024, 0, 2, 3, 4, 5, 500) });
  assert.equal(parseMlsdLine('Type=dir;Modify=20240102030405; sub').isDir, true);
  assert.equal(parseMlsdLine('type=cdir; .'), null);
  assert.equal(parse257('"/a ""q"" b" is current'), '/a "q" b');
});

for (const variant of [{ mlsd: true }, { mlsd: false, listStyle: 'unix' }, { mlsd: false, listStyle: 'windows', noPasv: true }, { noEpsv: true }]) {
  test(`api /ftp: open, list, cd, put/get, rename, delete, mkdir/rmdir (${JSON.stringify(variant)})`, async () => {
    await withApi(variant, async (srv, call) => {
      srv.addDir('/pub');
      srv.addFile('/pub/readme.txt', 'hello\r\n');
      const { session, path: start } = await call('ftp/open', { host: '127.0.0.1', port: srv.port, user: 'user', password: 'pw' });
      assert.equal(typeof session, 'string');
      assert.equal(start, '/');
      assert.deepEqual((await call('ftp/list', { session, path: '/' })).entries.map((e) => [e.name, e.isDir]), [['pub', true]]);
      const pub = (await call('ftp/list', { session, path: '/pub' })).entries;
      assert.equal(pub.length, 1);
      assert.equal(pub[0].name, 'readme.txt');
      assert.equal(pub[0].size, 7);
      assert.ok(Number.isFinite(pub[0].mtimeMs));
      assert.deepEqual(await call('ftp/cd', { session, path: '/pub' }), { path: '/pub' });
      assert.deepEqual(await call('ftp/pwd', { session }), { path: '/pub' });
      // binary round trip (every byte value)
      const bytes = Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 7) & 255));
      assert.deepEqual(await call('ftp/put', { session, path: '/pub/data.bin', bodyBase64: bytes.toString('base64'), mode: 'binary' }), { ok: true });
      assert.ok(srv.files.get('/pub/data.bin').data.equals(bytes));
      const got = await call('ftp/get', { session, path: '/pub/data.bin', mode: 'binary' });
      assert.ok(Buffer.from(got.bodyBase64, 'base64').equals(bytes));
      assert.equal(Buffer.from((await call('ftp/get', { session, path: 'readme.txt', mode: 'ascii' })).bodyBase64, 'base64').toString(), 'hello\r\n');
      // empty file
      await call('ftp/put', { session, path: '/pub/empty', bodyBase64: '', mode: 'binary' });
      assert.equal((await call('ftp/get', { session, path: '/pub/empty' })).bodyBase64, '');
      await call('ftp/rename', { session, from: '/pub/data.bin', to: '/pub/moved.bin' });
      assert.ok(srv.files.has('/pub/moved.bin') && !srv.files.has('/pub/data.bin'));
      await call('ftp/delete', { session, path: '/pub/moved.bin' });
      assert.ok(!srv.files.has('/pub/moved.bin'));
      await call('ftp/mkdir', { session, path: '/pub/new dir' });
      assert.equal(srv.files.get('/pub/new dir').dir, true);
      await call('ftp/rmdir', { session, path: '/pub/new dir' });
      assert.ok(!srv.files.has('/pub/new dir'));
      // errors
      await assert.rejects(call('ftp/get', { session, path: '/nope.txt' }), (e) => e.code === 'ENOENT' && /550/.test(e.message));
      await assert.rejects(call('ftp/cd', { session, path: '/nowhere' }), /550/);
      await assert.rejects(call('ftp/rename', { session, from: '/x', to: '/y' }), /550/);
      await assert.rejects(call('ftp/rmdir', { session, path: '/' }), /550/);
      // the session still works after errors
      assert.equal((await call('ftp/list', { session, path: '/pub' })).entries.length, 2);
      assert.deepEqual(await call('ftp/close', { session }), { ok: true });
      await assert.rejects(call('ftp/pwd', { session }), /closed or timed out/);
      const verbs = new Set(srv.log.map((l) => l.split(' ')[0]));
      assert.equal(verbs.has('MLSD'), variant.mlsd !== false);
      assert.equal(verbs.has('LIST'), variant.mlsd === false);
      if (variant.noPasv) assert.ok(verbs.has('EPSV'), 'falls back to EPSV');
      assert.ok(verbs.has('QUIT'));
    });
  });
}

test('api /ftp: login and connection errors', async () => {
  await withApi({}, async (srv, call) => {
    await assert.rejects(call('ftp/open', { host: '127.0.0.1', port: srv.port, user: 'user', password: 'wrong' }), (e) => e.code === 'EACCES' && /530/.test(e.message));
    const closed = await startFtpServer();
    const port = closed.port;
    await closed.close();
    await assert.rejects(call('ftp/open', { host: '127.0.0.1', port, user: 'user', password: 'pw' }), (e) => e.code === 'ECONNREFUSED');
    await assert.rejects(call('ftp/open', {}), (e) => e.code === 'EINVAL');
  });
});

test('api /ftp over HTTP with the token; allowFtp: false has no /ftp calls', async () => {
  const srv = await startFtpServer();
  const root = tmp();
  const api = createFsApi({ root, configDir: root, token: 'secret' });
  const server = http.createServer((req, res) => { api.handle(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const post = async (name, body) => (await fetch(`http://127.0.0.1:${server.address().port}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer secret' }, body: JSON.stringify(body) })).json();
  try {
    const open = await post('ftp/open', { host: '127.0.0.1', port: srv.port, user: 'user', password: 'pw' });
    assert.equal(open.ok, true);
    const bad = await post('ftp/get', { session: open.data.session, path: '/none' });
    assert.equal(bad.ok, false);
    assert.equal(bad.error.code, 'ENOENT');
    assert.equal((await post('ftp/close', { session: open.data.session })).ok, true);
    const off = createFsApi({ root, configDir: root, allowFtp: false });
    assert.throws(() => off.call('ftp/open', {}), /Unknown call/);
  } finally {
    await new Promise((r) => server.close(r));
    await api.ftp.closeAll();
    await srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ftpHost: engine requests become /api/ftp calls; failures become { error }', async () => {
  let handler = null;
  const calls = [];
  const engine = { onRequest(type, fn) { assert.equal(type, 'ftp'); handler = fn; return () => { handler = null; }; } };
  const off = installFtpHost(engine, { call: async (name, args) => { calls.push([name, args]); if (name === 'ftp/get') throw Object.assign(new Error('550 gone'), { code: 'ENOENT' }); return { path: '/x' }; } });
  assert.deepEqual(await handler({ type: 'ftp', op: 'cd', session: 's1', path: '/x' }), { path: '/x' });
  assert.deepEqual(calls[0], ['ftp/cd', { session: 's1', path: '/x' }]);
  assert.deepEqual(await handler({ type: 'ftp', op: 'get', session: 's1', path: '/y' }), { error: '550 gone' });
  assert.match((await handler({ type: 'ftp', op: 'format' })).error, /Unknown FTP operation/);
  off();
  assert.equal(handler, null);
});

test('chain: ftp/mput/dir/mget/close in M code → engine → ftpHost → HTTP API → FTP server', async () => {
  const srv = await startFtpServer();
  const root = tmp();
  const work = tmp();
  const api = createFsApi({ root, configDir: root });
  const server = http.createServer((req, res) => { api.handle(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  // backend.js api() in miniature: the JSON envelope over fetch
  const call = async (name, args) => {
    const body = await (await fetch(base + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })).json();
    if (!body.ok) throw Object.assign(new Error(body.error.message), { code: body.error.code });
    return body.data;
  };
  const handlers = new Map();
  const engine = { onRequest(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); } };
  installFtpHost(engine, { call });
  const channel = createChannel();
  const writer = createReplyWriter(channel);
  const cwd = work.replace(/\\/g, '/');
  const worker = new Worker(new URL('./helpers/session-worker.mjs', import.meta.url), { workerData: { cwd, channel } });
  const requests = [];
  let done = null;
  worker.on('message', async (m) => {
    if (m.type === 'request') {
      requests.push(m.msg.op);
      const fn = handlers.get(m.msg.type);
      let v = null;
      try { v = fn ? await fn(m.msg) : null; } catch (e) { v = { error: e.message }; }
      writer.reply(m.id, v);
    } else if (m.type === 'more') writer.more(m.id);
    else if (m.type === 'result' && done) done(m);
  });
  const run = (code) => new Promise((resolve) => { done = resolve; worker.postMessage({ code }); });
  try {
    fs.writeFileSync(path.join(work, 'a.txt'), 'line1\nline2\n');
    fs.writeFileSync(path.join(work, 'b.bin'), Buffer.from([0, 255, 13, 10, 7]));
    fs.mkdirSync(path.join(work, 'down'));
    const r = await run(`f = ftp('127.0.0.1:${srv.port}', 'user', 'pw');
mkdir(f, 'up');
cd(f, 'up');
mput(f, 'a.txt');
mput(f, 'b.bin');
d = dir(f);
names = sort({d.name});
fprintf('%s,', names{:}); fprintf('\\n');
fprintf('%d\\n', sum([d.bytes]));
dir(f)
ascii(f);
mput(f, 'a.txt');
binary(f);
mget(f, '*.bin', 'down');
rename(f, 'b.bin', 'c.bin');
delete(f, 'c.bin');
p = cd(f);
fprintf('%s\\n', p);
close(f);`);
    assert.ok(r.ok, r.error);
    assert.match(r.output, /a\.txt,b\.bin,/);
    assert.match(r.output, /^17$/m);                // 12 + 5 bytes
    assert.match(r.output, /a\.txt\s+b\.bin/);
    assert.match(r.output, /^\/up$/m);
    // ascii upload: CRLF line ends on the server
    assert.equal(srv.files.get('/up/a.txt').data.toString(), 'line1\r\nline2\r\n');
    assert.deepEqual([...fs.readFileSync(path.join(work, 'down', 'b.bin'))], [0, 255, 13, 10, 7]);
    assert.ok(!srv.files.has('/up/b.bin') && !srv.files.has('/up/c.bin'));
    assert.equal(requests[0], 'open');
    assert.equal(requests.at(-1), 'close');
    assert.equal(api.ftp.size, 0);
    // a failing remote call is an M error carrying the server's reply
    const e = await run(`f = ftp('127.0.0.1:${srv.port}', 'user', 'pw'); try, mget(f, 'missing.txt'); catch err, disp(err.message); end; close(f);`);
    assert.ok(e.ok, e.error);
    assert.match(e.output, /FTP .* failed: .*550/);
  } finally {
    await worker.terminate();
    await new Promise((r) => server.close(r));
    await api.ftp.closeAll();
    await srv.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
});
