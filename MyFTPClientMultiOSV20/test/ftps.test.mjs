// FTPS (explicit TLS) round trip against the test server started with
// `tls: true` (self-signed certificate in test/certs/): AUTH TLS on the
// control connection, PROT P on every data connection, listing, folder tree
// upload / download, conflicts, cancel, remote delete. Also checks that a
// plain-FTP server refuses an FTPS client with a readable error, and that a
// URL pasted into the Host field is normalised.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFtpServer } from './ftp-server.mjs';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api');
const { normalizeHost } = require('../core/remote');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-ftps-'));
const serverRoot = path.join(tmp, 'server');
const localRoot = path.join(tmp, 'local');
fs.mkdirSync(serverRoot, { recursive: true });
fs.mkdirSync(localRoot, { recursive: true });

let ftps, plain;
let api;
let id;

before(async () => {
  ftps = await startFtpServer({ root: serverRoot, tls: true });
  plain = await startFtpServer({ root: serverRoot });
  api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'config') });
});

after(async () => {
  await api.shutdown();
  await ftps.close();
  await plain.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function waitJob(snap, onConflict) {
  let s = snap;
  for (let i = 0; i < 3000 && s.status === 'running'; i++) {
    if (s.conflict && onConflict) {
      const { answer, applyAll } = onConflict(s.conflict);
      await api.call('jobs.resolveConflict', { id: s.id, answer, applyAll });
    }
    await new Promise((r) => setTimeout(r, 10));
    s = await api.call('jobs.get', { id: s.id });
  }
  return s;
}

test('host input: URLs, credentials and ports pasted into Host are normalised', () => {
  assert.deepEqual(normalizeHost({ host: 'ftp://ftp.sogang.ac.kr/', protocol: 'FTP' }), { host: 'ftp.sogang.ac.kr', protocol: 'FTP', port: undefined });
  assert.deepEqual(normalizeHost({ host: 'sftp://user:pw@example.com:2222/home/x', protocol: 'FTP', port: '21' }), { host: 'example.com', protocol: 'SFTP', port: '2222' });
  assert.deepEqual(normalizeHost({ host: 'ftps://a.b.c', protocol: 'FTP' }), { host: 'a.b.c', protocol: 'FTPS', port: undefined });
  assert.deepEqual(normalizeHost({ host: ' host.example:990 ', protocol: 'ftps' }), { host: 'host.example', protocol: 'FTPS', port: '990' });
  assert.deepEqual(normalizeHost({ host: '[::1]:21', protocol: 'FTP' }), { host: '::1', protocol: 'FTP', port: '21' });
  assert.deepEqual(normalizeHost({ host: 'plain.host', protocol: 'SFTP', port: 22 }), { host: 'plain.host', protocol: 'SFTP', port: 22 });
});

test('ftps: a server without TLS refuses the FTPS client; the TLS server accepts it', async () => {
  const refused = await waitJob(await api.call('remote.connect', { protocol: 'FTPS', host: '127.0.0.1', port: plain.port, user: plain.user, password: plain.password }));
  assert.equal(refused.status, 'error');
  assert.match(refused.error, /TLS|502/i);

  const bad = await waitJob(await api.call('remote.connect', { protocol: 'FTPS', host: '127.0.0.1', port: ftps.port, user: ftps.user, password: 'wrong' }));
  assert.equal(bad.status, 'error');
  assert.match(bad.error, /Login incorrect/);

  // The host given as a URL with the scheme: the scheme wins over the form's protocol.
  const ok = await waitJob(await api.call('remote.connect', { protocol: 'FTP', host: `ftps://127.0.0.1:${ftps.port}/pub`, user: ftps.user, password: ftps.password }));
  assert.equal(ok.status, 'done', ok.error);
  assert.equal(ok.result.protocol, 'FTPS');
  assert.equal(ok.result.host, '127.0.0.1');
  assert.equal(ok.result.port, ftps.port);
  id = ok.result.id;
  const info = await api.call('remote.info', { id });
  assert.equal(info.connected, true);
});

test('ftps: listing over a protected data connection (PROT P)', async () => {
  fs.mkdirSync(path.join(serverRoot, 'pub'));
  fs.writeFileSync(path.join(serverRoot, 'pub', 'hello.txt'), 'hello over tls');
  fs.writeFileSync(path.join(serverRoot, 'top.bin'), Buffer.alloc(4096, 5));
  const l = await api.call('remote.list', { id, path: '/' });
  assert.deepEqual(l.entries.map((e) => [e.name, e.isDir, e.size]), [['pub', true, 0], ['top.bin', false, 4096]]);
  const sub = await api.call('remote.list', { id, path: '/pub' });
  assert.equal(sub.entries[0].name, 'hello.txt');
  assert.ok(sub.entries[0].mtime > 0);
});

test('ftps: folder tree upload / download with byte progress', async () => {
  const src = path.join(localRoot, 'tree');
  fs.mkdirSync(path.join(src, 'a', 'b'), { recursive: true });
  const big = Buffer.alloc(1_500_000);
  for (let i = 0; i < big.length; i += 4096) big.writeUInt32LE(i, i);
  fs.writeFileSync(path.join(src, 'big.bin'), big);
  fs.writeFileSync(path.join(src, 'a', 'one.txt'), 'one');
  fs.writeFileSync(path.join(src, 'a', 'b', 'empty.txt'), '');

  const up = await waitJob(await api.call('transfer.upload', { id, items: [{ path: src, isDir: true }], remoteDir: '/pub' }));
  assert.equal(up.status, 'done', up.error);
  assert.equal(up.current, 3);
  assert.equal(up.bytes, big.length + 3);
  assert.ok(fs.readFileSync(path.join(serverRoot, 'pub', 'tree', 'big.bin')).equals(big), 'uploaded bytes identical');
  assert.equal(fs.statSync(path.join(serverRoot, 'pub', 'tree', 'a', 'b', 'empty.txt')).size, 0);

  const dest = path.join(localRoot, 'down');
  fs.mkdirSync(dest);
  const down = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/pub/tree', isDir: true }, { path: '/top.bin', isDir: false, size: 4096 }], localDir: dest }));
  assert.equal(down.status, 'done', down.error);
  assert.equal(down.result.done, 4);
  assert.equal(down.bytes, big.length + 3 + 4096);
  assert.ok(fs.readFileSync(path.join(dest, 'tree', 'big.bin')).equals(big), 'downloaded bytes identical');
});

test('ftps: conflict skip / overwrite-all, cancel reconnects over TLS', async () => {
  const dest = path.join(localRoot, 'down');
  fs.writeFileSync(path.join(dest, 'top.bin'), 'stale');
  const skip = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/top.bin', isDir: false }], localDir: dest }), () => ({ answer: 'skip' }));
  assert.equal(skip.result.skipped, 1);
  let asked = 0;
  const over = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/top.bin', isDir: false }, { path: '/pub/tree', isDir: true }], localDir: dest }), () => { asked++; return { answer: 'overwrite', applyAll: true }; });
  assert.equal(over.status, 'done', over.error);
  assert.equal(asked, 1);
  assert.equal(fs.statSync(path.join(dest, 'top.bin')).size, 4096);

  fs.writeFileSync(path.join(serverRoot, 'huge.bin'), Buffer.alloc(40 * 1024 * 1024, 3));
  const snap = await api.call('transfer.download', { id, items: [{ path: '/huge.bin', isDir: false }], localDir: dest });
  await new Promise((r) => setTimeout(r, 40));
  await api.call('jobs.cancel', { id: snap.id });
  const s = await waitJob(snap);
  assert.equal(s.status, 'cancelled');
  const l = await api.call('remote.list', { id, path: '/' });
  assert.ok(l.entries.some((e) => e.name === 'huge.bin'), 'session reconnected over TLS');
});

test('ftps: mkdir / rename / delete, disconnect', async () => {
  await api.call('remote.mkdir', { id, dir: '/pub', name: 'made' });
  await api.call('remote.rename', { id, path: '/pub/made', newName: 'moved' });
  assert.ok(fs.existsSync(path.join(serverRoot, 'pub', 'moved')));
  const del = await waitJob(await api.call('remote.delete', { id, items: [{ path: '/pub/tree', isDir: true }, { path: '/pub/moved', isDir: true }, { path: '/huge.bin', isDir: false }] }));
  assert.equal(del.status, 'done', del.error);
  assert.ok(!fs.existsSync(path.join(serverRoot, 'pub', 'tree')));
  assert.ok(!fs.existsSync(path.join(serverRoot, 'huge.bin')));
  assert.equal((await api.call('remote.disconnect', { id })).ok, true);
  await assert.rejects(api.call('remote.list', { id, path: '/' }), (e) => e.code === 'NOT_CONNECTED');
});
