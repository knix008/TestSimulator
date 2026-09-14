// FTP / FTPS round trips with basic-ftp against the real server classes:
// listing, up/download (with REST), rename, delete, permissions, login
// failures, connection limit, explicit AUTH TLS + PROT P and implicit TLS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const ftp = require('basic-ftp');
const { FtpServer } = require('../core/ftp-server');
const { VirtualFileSystem } = require('../core/vfs');
const { Log } = require('../core/log');
const { generateSelfSigned } = require('../core/x509');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfs-ftp-'));
const share = path.join(tmp, 'share');
fs.mkdirSync(path.join(share, 'sub'), { recursive: true });
fs.writeFileSync(path.join(share, 'hello.txt'), 'hello');
fs.writeFileSync(path.join(tmp, 'up.bin'), Buffer.alloc(300_000, 7));

const users = [{ username: 'bob', password: 'pw', canRead: true, canWrite: true }, { username: 'ro', password: 'ro', canRead: true, canWrite: false }];
const auth = { allowAnonymous: true, users };

function server(extra = {}) {
  const log = new Log(null);
  const vfs = new VirtualFileSystem([{ virtualName: 'data', physicalPath: share }]);
  return new FtpServer({ proto: 'FTP', port: 0, vfs, auth, log, lang: 'en', ...extra });
}

async function client(port, opts = {}) {
  const c = new ftp.Client(10_000);
  await c.access({ host: '127.0.0.1', port, user: 'bob', password: 'pw', ...opts });
  return c;
}

test('FTP: list, transfer, rename, delete, mkdir', async () => {
  const s = server();
  await s.start();
  const c = await client(s.port);
  assert.deepEqual((await c.list('/')).map((e) => e.name), ['data']);
  assert.deepEqual((await c.list('/data')).map((e) => e.name), ['sub', 'hello.txt']);
  await c.cd('/data');
  assert.equal(await c.pwd(), '/data');
  const transfers = [];
  s.on('transfer', (t) => transfers.push(t));
  await c.uploadFrom(path.join(tmp, 'up.bin'), 'up.bin');
  await c.downloadTo(path.join(tmp, 'down.bin'), 'up.bin');
  assert.ok(fs.readFileSync(path.join(tmp, 'down.bin')).equals(fs.readFileSync(path.join(tmp, 'up.bin'))));
  assert.equal(await c.size('up.bin'), 300_000);
  assert.deepEqual(transfers.map((t) => [t.dir, t.bytes]), [['up', 300_000], ['down', 300_000]]);
  assert.ok(await c.lastMod('up.bin'));
  await c.ensureDir('/data/newdir');
  await c.rename('/data/up.bin', '/data/newdir/moved.bin');
  assert.deepEqual((await c.list('/data/newdir')).map((e) => e.name), ['moved.bin']);
  await c.remove('/data/newdir/moved.bin');
  await c.removeEmptyDir('/data/newdir');
  assert.deepEqual((await c.list('/data')).map((e) => e.name), ['sub', 'hello.txt']);
  c.close();
  await s.stop();
});

test('FTP: REST resumes a download', async () => {
  const s = server();
  await s.start();
  const c = await client(s.port);
  const dest = path.join(tmp, 'partial.bin');
  fs.writeFileSync(dest, Buffer.alloc(100_000, 7));
  await c.uploadFrom(path.join(tmp, 'up.bin'), '/data/up.bin');
  await c.downloadTo(dest, '/data/up.bin', 100_000);
  assert.ok(fs.readFileSync(dest).equals(fs.readFileSync(path.join(tmp, 'up.bin'))));
  await c.remove('/data/up.bin');
  c.close();
  await s.stop();
});

test('FTP: anonymous is read-only, wrong password refused, unknown user refused', async () => {
  const s = server();
  await s.start();
  const a = await client(s.port, { user: 'anonymous', password: 'x' });
  assert.deepEqual((await a.list('/data')).map((e) => e.name), ['sub', 'hello.txt']);
  await assert.rejects(a.uploadFrom(path.join(tmp, 'up.bin'), '/data/nope.bin'), /550/);
  await assert.rejects(a.ensureDir('/data/x'), /550/);
  a.close();
  const ro = await client(s.port, { user: 'ro', password: 'ro' });
  await assert.rejects(ro.remove('/data/hello.txt'), /550/);
  ro.close();
  await assert.rejects(client(s.port, { password: 'wrong' }), /530/);
  await assert.rejects(client(s.port, { user: 'nobody', password: '' }), /530/);
  const s2 = server({ auth: { allowAnonymous: false, users } });
  await s2.start();
  await assert.rejects(client(s2.port, { user: 'anonymous', password: '' }), /530/);
  await s2.stop();
  await s.stop();
});

test('FTP: paths cannot escape the share, share roots cannot be removed', async () => {
  const s = server();
  await s.start();
  const c = await client(s.port);
  await assert.rejects(c.list('/data/../../'), /550/);
  await assert.rejects(c.removeEmptyDir('/data'), /550/);
  await assert.rejects(c.uploadFrom(path.join(tmp, 'up.bin'), '/x.bin'), /55[03]/);
  c.close();
  await s.stop();
});

test('FTP: connection limit and client counter', async () => {
  const s = server({ maxConnections: 1 });
  await s.start();
  const counts = [];
  s.on('clients', (n) => counts.push(n));
  const c = await client(s.port);
  assert.equal(s.clientCount, 1);
  const refused = await new Promise((resolve) => {
    const sock = net.connect(s.port, '127.0.0.1');
    let buf = '';
    sock.on('data', (d) => { buf += d; });
    sock.on('close', () => resolve(buf));
    sock.on('error', () => resolve(buf));
  });
  assert.match(refused, /421/);
  c.close();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(s.clientCount, 0);
  assert.equal(s.totalConnections, 1);
  assert.deepEqual(counts, [1, 0]);
  await s.stop();
});

test('FTPS: explicit AUTH TLS + PROT P, and implicit TLS', async () => {
  const cert = generateSelfSigned({ commonName: '127.0.0.1' });
  const tlsOpts = { cert: cert.cert, key: cert.key };
  const s = server({ tls: tlsOpts, explicit: true });
  await s.start();
  const c = await client(s.port, { secure: true, secureOptions: { rejectUnauthorized: false } });
  assert.deepEqual((await c.list('/data')).map((e) => e.name), ['sub', 'hello.txt']);
  await c.uploadFrom(path.join(tmp, 'up.bin'), '/data/tls.bin');
  await c.downloadTo(path.join(tmp, 'tls-down.bin'), '/data/tls.bin');
  assert.equal(fs.statSync(path.join(tmp, 'tls-down.bin')).size, 300_000);
  await c.remove('/data/tls.bin');
  c.close();
  // Without a certificate AUTH TLS is refused.
  const plain = server();
  await plain.start();
  await assert.rejects(client(plain.port, { secure: true }), /502/);
  await plain.stop();
  await s.stop();

  const imp = server({ proto: 'FTPS', tls: tlsOpts, implicit: true });
  await imp.start();
  const i = await client(imp.port, { secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
  assert.deepEqual((await i.list('/')).map((e) => e.name), ['data']);
  await i.uploadFrom(path.join(tmp, 'up.bin'), '/data/imp.bin');
  assert.equal(await i.size('/data/imp.bin'), 300_000);
  await i.remove('/data/imp.bin');
  i.close();
  await imp.stop();
});

test('FTP: port in use gives a readable error', async () => {
  const s = server();
  await s.start();
  const dup = server({ port: s.port });
  await assert.rejects(dup.start(), /already in use/);
  await s.stop();
});
