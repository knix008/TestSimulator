// SFTP round trips with the ssh2 client against the real server class, and
// the server manager running every protocol together.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const { Client } = require('ssh2');
const ftp = require('basic-ftp');
const { SftpServer } = require('../core/sftp-server');
const { VirtualFileSystem } = require('../core/vfs');
const { Log } = require('../core/log');
const hostkey = require('../core/hostkey');
const { createApi } = require('../core/api');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfs-sftp-'));
const share = path.join(tmp, 'share');
fs.mkdirSync(path.join(share, 'sub'), { recursive: true });
fs.writeFileSync(path.join(share, 'hello.txt'), 'hello');
fs.writeFileSync(path.join(tmp, 'up.bin'), Buffer.alloc(1_500_000, 9));
const keyFile = path.join(tmp, 'host.pem');
await hostkey.ensureKey(keyFile);

const users = [{ username: 'bob', password: 'pw', canRead: true, canWrite: true }];

// The API refuses port 0 (normalize → default port), so tests pick a free one.
function freePort() {
  return new Promise((r) => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => r(p)); }); });
}

// Every listener is remembered so a failing test cannot leave one open (the
// runner would then wait forever for the process to exit).
const openServers = new Set();
after(async () => { for (const s of openServers) await s.stop(); });

async function server(extra = {}) {
  const log = new Log(null);
  const vfs = new VirtualFileSystem([{ virtualName: 'data', physicalPath: share }, { virtualName: 'other', physicalPath: tmp }]);
  const s = new SftpServer({ port: 0, vfs, auth: { allowAnonymous: true, users }, hostKey: fs.readFileSync(keyFile, 'utf8'), log, lang: 'en', ...extra });
  await s.start();
  openServers.add(s);
  return s;
}

function connect(port, opts) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => c.sftp((err, sftp) => (err ? reject(err) : resolve({ c, sftp, call: (m, ...a) => new Promise((res, rej) => sftp[m](...a, (e, r) => (e ? rej(e) : res(r)))) }))));
    c.on('error', reject);
    c.on('close', () => reject(new Error('connection closed before ready')));   // e.g. refused by the connection limit
    c.connect({ host: '127.0.0.1', port, ...opts });
  });
}

describe('File operations', () => {
  test('realpath, readdir, transfer, mkdir/rename/unlink/rmdir', async () => {
    const s = await server();
    const { c, call } = await connect(s.port, { username: 'bob', password: 'pw' });
    assert.equal(await call('realpath', '.'), '/');
    assert.deepEqual((await call('readdir', '/')).map((e) => e.filename), ['data', 'other']);
    const data = await call('readdir', '/data');
    assert.deepEqual(data.map((e) => e.filename), ['sub', 'hello.txt']);
    assert.match(data[0].longname, /^drwx/);
    assert.equal((await call('stat', '/data/hello.txt')).size, 5);
    const transfers = [];
    s.on('transfer', (t) => transfers.push(t));
    await call('fastPut', path.join(tmp, 'up.bin'), '/data/up.bin');
    await call('fastGet', '/data/up.bin', path.join(tmp, 'down.bin'));
    assert.ok(fs.readFileSync(path.join(tmp, 'down.bin')).equals(fs.readFileSync(path.join(tmp, 'up.bin'))));
    assert.deepEqual(transfers.map((t) => [t.dir, t.bytes]), [['up', 1_500_000], ['down', 1_500_000]]);
    await call('mkdir', '/data/d1');
    await call('rename', '/data/up.bin', '/data/d1/m.bin');
    assert.deepEqual((await call('readdir', '/data/d1')).map((e) => e.filename), ['m.bin']);
    await call('unlink', '/data/d1/m.bin');
    await call('rmdir', '/data/d1');
    await assert.rejects(call('rmdir', '/data'), /share root/);
    await assert.rejects(call('stat', '/data/nope'), /No such file/);
    c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });

  test('big folders page through READDIR, setstat/fsetstat keep mtime, UTF-8 names', async () => {
    const big = path.join(share, 'big');
    fs.mkdirSync(big, { recursive: true });
    for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(big, `f${String(i).padStart(3, '0')}.txt`), 'x');
    const s = await server();
    const { c, call } = await connect(s.port, { username: 'bob', password: 'pw' });
    const names = (await call('readdir', '/data/big')).map((e) => e.filename);
    assert.equal(names.length, 120);                                    // 48 + 48 + 24 batches, then EOF
    assert.equal(names[0], 'f000.txt');
    assert.equal(names[119], 'f119.txt');

    const when = Math.floor(new Date('2020-05-06T07:08:09Z').getTime() / 1000);
    await call('setstat', '/data/big/f000.txt', { atime: when, mtime: when });
    assert.equal((await call('stat', '/data/big/f000.txt')).mtime, when);
    assert.equal(Math.floor(fs.statSync(path.join(big, 'f000.txt')).mtimeMs / 1000), when);
    await call('fastPut', path.join(tmp, 'up.bin'), '/data/한글 이름.bin');
    assert.ok((await call('readdir', '/data')).some((e) => e.filename === '한글 이름.bin'));
    await call('mkdir', '/data/폴더');
    await call('rename', '/data/한글 이름.bin', '/data/폴더/옮김.bin');
    assert.equal(fs.statSync(path.join(share, '폴더', '옮김.bin')).size, 1_500_000);
    await call('unlink', '/data/폴더/옮김.bin');
    await call('rmdir', '/data/폴더');
    c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
    fs.rmSync(big, { recursive: true, force: true });
  });

  test('handles: write at offsets, fstat / fsetstat, read the tail, EOF, append, truncate, exists', async () => {
    const s = await server();
    const { c, sftp, call } = await connect(s.port, { username: 'bob', password: 'pw' });
    const exists = (p) => new Promise((res) => sftp.exists(p, res));     // exists() reports the answer, not an error
    const transfers = [];
    s.on('transfer', (t) => transfers.push([t.dir, t.bytes]));
    const h = await call('open', '/data/h.bin', 'w');
    await call('write', h, Buffer.alloc(10, 1), 0, 10, 0);
    await call('write', h, Buffer.alloc(5, 2), 0, 5, 10);
    assert.equal((await call('fstat', h)).size, 15);
    const when = Math.floor(new Date('2021-01-02T03:04:05Z').getTime() / 1000);
    await call('fsetstat', h, { atime: when, mtime: when });
    await call('close', h);
    assert.equal(Math.floor(fs.statSync(path.join(share, 'h.bin')).mtimeMs / 1000), when);
    assert.deepEqual(transfers, [['up', 15]]);                              // one event per closed handle
    const r = await call('open', '/data/h.bin', 'r');
    const buf = Buffer.alloc(100);
    assert.equal(await call('read', r, buf, 0, 100, 10), 5);
    assert.deepEqual([...buf.subarray(0, 5)], [2, 2, 2, 2, 2]);
    assert.equal(await call('read', r, buf, 0, 100, 15), 0);               // EOF
    await call('close', r);
    assert.deepEqual(transfers, [['up', 15], ['down', 5]]);
    await call('appendFile', '/data/h.bin', Buffer.alloc(3, 3));
    assert.equal(fs.statSync(path.join(share, 'h.bin')).size, 18);
    await call('writeFile', '/data/h.bin', Buffer.alloc(2, 4));            // 'w' truncates
    assert.deepEqual([...fs.readFileSync(path.join(share, 'h.bin'))], [4, 4]);
    assert.deepEqual([...(await call('readFile', '/data/h.bin'))], [4, 4]);
    assert.equal(await exists('/data/h.bin'), true);
    assert.equal(await exists('/data/nope'), false);
    assert.equal(await exists('/'), true);
    await call('unlink', '/data/h.bin');
    c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });

  test('streams: createWriteStream / createReadStream round trip, lstat equals stat', async () => {
    const s = await server();
    const { c, sftp, call } = await connect(s.port, { username: 'bob', password: 'pw' });
    const payload = Buffer.alloc(200_000, 5);
    await new Promise((resolve, reject) => { const ws = sftp.createWriteStream('/data/stream.bin'); ws.on('close', resolve); ws.on('error', reject); ws.end(payload); });
    assert.ok(fs.readFileSync(path.join(share, 'stream.bin')).equals(payload));
    const chunks = [];
    await new Promise((resolve, reject) => { const rs = sftp.createReadStream('/data/stream.bin', { start: 199_990 }); rs.on('data', (d) => chunks.push(d)); rs.on('close', resolve); rs.on('error', reject); });
    assert.equal(Buffer.concat(chunks).length, 10);
    const a = await call('stat', '/data/stream.bin');
    const b = await call('lstat', '/data/stream.bin');
    assert.deepEqual([a.size, a.mtime, a.isFile()], [b.size, b.mtime, b.isFile()]);
    assert.equal(a.size, 200_000);
    await call('unlink', '/data/stream.bin');
    c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });
});

describe('Authentication & rights', () => {
  test('anonymous without password is read-only; bad password refused', async () => {
    const s = await server();
    const a = await connect(s.port, { username: 'anonymous', password: '' });
    assert.deepEqual((await a.call('readdir', '/data')).map((e) => e.filename), ['sub', 'hello.txt']);
    await assert.rejects(a.call('mkdir', '/data/x'), /Write not allowed/);
    await assert.rejects(a.call('unlink', '/data/hello.txt'), /Write not allowed/);
    a.c.end();
    await assert.rejects(connect(s.port, { username: 'bob', password: 'bad' }), /authentication/i);
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });

  test('rights per user (read-only / write-only), anonymous upload refused, anonymous off', async () => {
    const extra = [...users, { username: 'ro', password: 'ro', canRead: true, canWrite: false }, { username: 'wo', password: 'wo', canRead: false, canWrite: true }];
    const s = await server({ auth: { allowAnonymous: true, users: extra } });
    const ro = await connect(s.port, { username: 'RO', password: 'ro' });     // name is case-insensitive
    assert.deepEqual((await ro.call('readdir', '/data')).map((e) => e.filename), ['sub', 'hello.txt']);
    await assert.rejects(ro.call('fastPut', path.join(tmp, 'up.bin'), '/data/ro.bin'), /Write not allowed/);
    await assert.rejects(ro.call('rename', '/data/hello.txt', '/data/h2.txt'), /Write not allowed/);
    await assert.rejects(ro.call('setstat', '/data/hello.txt', { mtime: 1 }), /Write not allowed/);
    ro.c.end();
    const wo = await connect(s.port, { username: 'wo', password: 'wo' });
    await assert.rejects(wo.call('readdir', '/data'), /Read not allowed/);
    await assert.rejects(wo.call('stat', '/data/hello.txt'), /Read not allowed/);
    await wo.call('fastPut', path.join(tmp, 'up.bin'), '/data/wo.bin');
    assert.equal(fs.statSync(path.join(share, 'wo.bin')).size, 1_500_000);
    await wo.call('unlink', '/data/wo.bin');
    wo.c.end();
    const anon = await connect(s.port, { username: 'anonymous', password: '' });
    await assert.rejects(anon.call('fastPut', path.join(tmp, 'up.bin'), '/data/anon.bin'), /Write not allowed/);
    assert.equal(fs.existsSync(path.join(share, 'anon.bin')), false);
    anon.c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();

    const closed = await server({ auth: { allowAnonymous: false, users } });
    await assert.rejects(connect(closed.port, { username: 'anonymous', password: '' }), /authentication/i);
    await assert.rejects(connect(closed.port, { username: 'anonymous', password: 'x' }), /authentication/i);
    const ok = await connect(closed.port, { username: 'bob', password: 'pw' });
    ok.c.end();
    await new Promise((r) => setTimeout(r, 100));
    await closed.stop();
  });
});

describe('Path safety & protocol', () => {
  test('virtual root is synthetic, paths cannot escape, unsupported requests', async () => {
    const s = await server();
    const { c, call } = await connect(s.port, { username: 'bob', password: 'pw' });
    assert.equal(await call('realpath', '/data/../..'), '/');
    assert.equal(await call('realpath', '/data/sub/..'), '/data');
    assert.equal(await call('realpath', 'data/sub'), '/data/sub');
    assert.deepEqual((await call('readdir', '/data/../../')).map((e) => e.filename), ['data', 'other']);
    assert.equal((await call('stat', '/')).isDirectory(), true);
    assert.equal((await call('stat', '/data')).isDirectory(), true);
    assert.equal((await call('stat', '/data/hello.txt')).isFile(), true);
    await assert.rejects(call('readdir', '/nope'), /No such/);
    await assert.rejects(call('readdir', '/data/hello.txt/x'), /No such|not a directory/i);
    await assert.rejects(call('mkdir', '/newshare'), /Cannot create/);
    await assert.rejects(call('unlink', '/data'), /EPERM|EISDIR|EACCES|Failure|denied/i);
    await assert.rejects(call('rename', '/data', '/data2'), /Path not found/);
    await assert.rejects(call('fastGet', '/data/sub', path.join(tmp, 'dir.bin')), /Is a directory/);
    await assert.rejects(call('fastGet', '/', path.join(tmp, 'root.bin')), /Not a file/);
    await assert.rejects(call('readlink', '/data/hello.txt'), /unsupported/i);
    await assert.rejects(call('symlink', '/data/hello.txt', '/data/link'), /unsupported/i);
    c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });

  test('shell / exec requests are refused', async () => {
    const s = await server();
    const refused = await new Promise((resolve, reject) => {
      const c = new Client();
      c.on('ready', () => c.exec('ls', (err) => { c.end(); resolve(!!err); }));
      c.on('error', reject);
      c.connect({ host: '127.0.0.1', port: s.port, username: 'bob', password: 'pw' });
    });
    assert.equal(refused, true);
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });

  test('bad handles, opening folders / the root, mkdir on an existing folder, rmdir of a full folder, remove of a folder', async () => {
    const s = await server();
    const { c, call } = await connect(s.port, { username: 'bob', password: 'pw' });
    const buf = Buffer.alloc(10);
    const bogus = Buffer.from([0, 0, 0, 99]);
    await assert.rejects(call('read', bogus, buf, 0, 10, 0), /Bad handle/);
    await assert.rejects(call('write', bogus, buf, 0, 10, 0), /Bad handle/);
    await assert.rejects(call('fstat', bogus), /Bad handle/);
    await assert.rejects(call('fsetstat', bogus, { mtime: 1 }), /Bad handle/);
    await assert.rejects(call('readdir', bogus), /Bad handle/);
    await call('close', bogus);                                             // closing an unknown handle is harmless
    await assert.rejects(call('open', '/data/sub', 'r'), /Is a directory/);
    await assert.rejects(call('open', '/', 'w'), /Not a file/);
    await assert.rejects(call('open', '/data/nodir/x', 'w'), /no such file/i);
    await assert.rejects(call('open', '/data/nope', 'r'), /no such file/i);
    await assert.rejects(call('mkdir', '/data/sub'), /EEXIST|exists/i);
    await call('mkdir', '/data/full');
    fs.writeFileSync(path.join(share, 'full', 'f'), 'x');
    await assert.rejects(call('rmdir', '/data/full'), /ENOTEMPTY|not empty/i);
    await assert.rejects(call('unlink', '/data/full'), /EPERM|EISDIR|EACCES|Failure|denied/i);
    await assert.rejects(call('unlink', '/data/nope'), /no such file/i);
    await assert.rejects(call('rename', '/data/nope', '/data/x'), /no such file/i);
    await assert.rejects(call('rename', '/data/full', '/'), /Path not found/);
    await assert.rejects(call('rmdir', '/nope'), /Cannot remove a share root|No such/);
    fs.rmSync(path.join(share, 'full'), { recursive: true, force: true });
    // OPENDIR of a file and of a missing folder both fail; the root lists the shares.
    await assert.rejects(call('opendir', '/data/hello.txt'), /No such folder/);
    await assert.rejects(call('opendir', '/missing'), /No such/);
    const dh = await call('opendir', '/');
    assert.deepEqual((await call('readdir', dh)).map((e) => e.filename), ['data', 'other']);
    await assert.rejects(call('readdir', dh), /End of file/);               // a second READDIR on the handle → EOF
    await call('close', dh);
    c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });

  test('a second SFTP session on one connection works; a shell request is refused but the connection stays', async () => {
    const s = await server();
    const { c, call } = await connect(s.port, { username: 'bob', password: 'pw' });
    const second = await new Promise((resolve, reject) => c.sftp((err, sftp) => (err ? reject(err) : resolve(sftp))));
    const names = await new Promise((resolve, reject) => second.readdir('/data', (err, list) => (err ? reject(err) : resolve(list.map((e) => e.filename)))));
    assert.deepEqual(names, ['sub', 'hello.txt']);
    await assert.rejects(new Promise((resolve, reject) => c.shell((err, stream) => (err ? reject(err) : resolve(stream)))));
    assert.equal((await call('stat', '/data/hello.txt')).size, 5);         // still usable afterwards
    c.end();
    await new Promise((r) => setTimeout(r, 100));
    await s.stop();
  });
});

describe('Lifecycle, limits & log', () => {
  test('connection limit, counters, stop() ends clients', async () => {
    const log = new Log(null);
    const keys = [];
    log.on('line', (l) => { if (l.key) keys.push(l.key); });
    const s = await server({ maxConnections: 1, log });
    const counts = [];
    s.on('clients', (n) => counts.push(n));
    const first = await connect(s.port, { username: 'bob', password: 'pw' });
    assert.equal(s.clientCount, 1);
    await assert.rejects(connect(s.port, { username: 'bob', password: 'pw' }), /closed|ECONNRESET|reset|end/i);
    assert.ok(keys.includes('client_limit'));
    first.c.end();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(s.clientCount, 0);
    assert.equal(s.totalConnections, 1);
    assert.deepEqual(counts.slice(0, 2), [1, 0]);

    const again = await connect(s.port, { username: 'bob', password: 'pw' });
    const gone = new Promise((resolve) => again.c.on('close', resolve));
    await s.stop();
    await gone;
    assert.ok(keys.includes('sftp_stopped'));
    for (const k of ['sftp_started', 'client_connected', 'login_ok', 'sftp_subsystem', 'client_closed']) assert.ok(keys.includes(k), k);
  });

  test('maxConnections 0 is unlimited, totals count every session, transfer events carry user and peer', async () => {
    const s = await server({ maxConnections: 0 });
    const all = await Promise.all([1, 2, 3].map(() => connect(s.port, { username: 'bob', password: 'pw' })));
    assert.equal(s.clientCount, 3);
    assert.equal(s.totalConnections, 3);
    const events = [];
    s.on('transfer', (t) => events.push(t));
    await all[0].call('fastPut', path.join(tmp, 'up.bin'), '/data/ev.bin');
    assert.equal(events.length, 1);
    assert.equal(events[0].user, 'bob');
    assert.match(events[0].peer, /^127\.0\.0\.1:\d+$/);
    assert.equal(events[0].name, '/data/ev.bin');
    await all[0].call('unlink', '/data/ev.bin');
    for (const x of all) x.c.end();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(s.clientCount, 0);
    assert.equal(s.totalConnections, 3);
    await s.stop();
    await s.stop();                                                         // twice is harmless
    await assert.rejects(connect(s.port, { username: 'bob', password: 'pw' }), /ECONNREFUSED/);
  });
});

describe('Server manager (all protocols)', () => {
  test('FTP + FTPS + SFTP together through the API', async () => {
    const cfg = path.join(tmp, 'cfg');
    const api = createApi({ name: 'test', configDir: cfg });
    const cert = await api.call('cert.generate', { commonName: '127.0.0.1', validityYears: 1 });
    const [p1, p2, p3] = [await freePort(), await freePort(), await freePort()];
    const settings = {
      sharedFolders: [{ virtualName: 'data', physicalPath: share }],
      protocols: { enableFtp: true, enableFtps: true, enableSftp: true, ftpPort: p1, ftpsPort: p2, sftpPort: p3, explicitTls: true },
      certPath: cert.certPath, allowAnonymous: true, users,
    };
    const snap = await api.call('server.start', { settings });
    assert.equal(snap.state.running, true);
    assert.deepEqual(snap.state.protocols.map((p) => p.proto), ['FTP', 'FTPS', 'SFTP']);
    // Starting twice is a no-op.
    assert.equal((await api.call('server.start', {})).state.running, true);

    const f = new ftp.Client(); await f.access({ host: '127.0.0.1', port: p1, user: 'bob', password: 'pw', secure: true, secureOptions: { rejectUnauthorized: false } });
    await f.uploadFrom(path.join(tmp, 'up.bin'), '/data/via-ftp.bin'); f.close();
    const i = new ftp.Client(); await i.access({ host: '127.0.0.1', port: p2, user: 'anonymous', password: 'x', secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
    await i.downloadTo(path.join(tmp, 'via-ftps.bin'), '/data/via-ftp.bin'); i.close();
    const sf = await connect(p3, { username: 'bob', password: 'pw' });
    assert.ok((await sf.call('readdir', '/data')).some((e) => e.filename === 'via-ftp.bin'));
    await sf.call('unlink', '/data/via-ftp.bin');
    sf.c.end();
    await new Promise((r) => setTimeout(r, 300));

    const poll = await api.call('server.poll', { seq: 0 });
    assert.equal(poll.stats.uploads, 1);
    assert.equal(poll.stats.downloads, 1);
    assert.equal(poll.stats.totalClients, 3);
    assert.ok(poll.lines.some((l) => /Explicit|AUTH TLS/.test(l.text)));
    assert.ok(fs.existsSync(path.join(cfg, 'ssh_host_rsa.pem')));
    assert.ok(fs.existsSync(path.join(cfg, 'ftpserver.log')));
    const stopped = await api.call('server.stop');
    assert.equal(stopped.state.running, false);
    assert.equal(stopped.stats.uploads, 0);
    await api.shutdown();
  });

  test('a failing listener rolls everything back', async () => {
    const api = createApi({ name: 'test', configDir: path.join(tmp, 'cfg2') });
    const s = await server();  // holds a port
    await assert.rejects(api.call('server.start', { settings: { sharedFolders: [{ virtualName: 'data', physicalPath: share }], protocols: { enableFtp: true, ftpPort: await freePort(), enableSftp: true, sftpPort: s.port } } }), /SFTP.*(already in use|사용 중)/);
    const st = await api.call('server.state');
    assert.equal(st.state.running, false);
    assert.equal(st.state.protocols.length, 0);
    await s.stop();
    await api.shutdown();
  });

  test('settings errors carry codes, a bad certificate stops FTPS but not FTP', async () => {
    const cfg = path.join(tmp, 'cfg3');
    const api = createApi({ name: 'test', configDir: cfg });
    await assert.rejects(api.call('server.start', { settings: {} }), (e) => e.code === 'no_shares');
    const shares = [{ virtualName: 'data', physicalPath: share }];
    await assert.rejects(api.call('server.start', { settings: { sharedFolders: shares, protocols: { enableFtp: false } } }), (e) => e.code === 'no_protocol');
    await assert.rejects(api.call('server.start', { settings: { sharedFolders: shares, protocols: { enableFtp: true, ftpPort: 2121, enableSftp: true, sftpPort: 2121 } } }), (e) => e.code === 'port_clash');
    const junk = path.join(tmp, 'junk.pem');
    fs.writeFileSync(junk, 'not a certificate');
    // FTPS needs the certificate: refused with the file in the detail.
    await assert.rejects(api.call('server.start', { settings: { sharedFolders: shares, protocols: { enableFtp: false, enableFtps: true, ftpsPort: await freePort() }, certPath: junk } }), (e) => /SSL|certificate|인증서/i.test(e.message) && String(e.detail).includes(junk));
    assert.equal((await api.call('server.state')).state.running, false);
    // Plain FTP with "allow AUTH TLS" only loses the upgrade — it still starts, with a warning in the log.
    const snap = await api.call('server.start', { settings: { sharedFolders: shares, protocols: { enableFtp: true, ftpPort: await freePort(), explicitTls: true }, certPath: junk } });
    assert.equal(snap.state.running, true);
    assert.deepEqual(snap.state.protocols.map((p) => p.proto), ['FTP']);
    const poll = await api.call('server.poll', { seq: 0 });
    assert.ok(poll.lines.some((l) => l.key === 'cert_load_failed' && l.level === 'warn'));
    const port = snap.state.protocols[0].port;
    const f = new ftp.Client();
    await f.access({ host: '127.0.0.1', port, user: 'anonymous', password: 'x' });
    await assert.rejects(f.send('AUTH TLS'), /502/);
    f.close();
    // Stopping resets everything; stop() when already stopped is a no-op.
    assert.equal((await api.call('server.stop')).state.protocols.length, 0);
    assert.equal((await api.call('server.stop')).state.running, false);
    await api.shutdown();
  });

  test('restart with new settings, per-protocol counters and byte totals in the snapshot', async () => {
    const cfg = path.join(tmp, 'cfg4');
    const api = createApi({ name: 'test', configDir: cfg });
    const shares = [{ virtualName: 'data', physicalPath: share }];
    const p1 = await freePort();
    await api.call('server.start', { settings: { sharedFolders: shares, protocols: { enableFtp: true, ftpPort: p1 }, users } });
    const f = new ftp.Client();
    await f.access({ host: '127.0.0.1', port: p1, user: 'bob', password: 'pw' });
    await f.uploadFrom(path.join(tmp, 'up.bin'), '/data/bytes.bin');
    await f.downloadTo(path.join(tmp, 'bytes-down.bin'), '/data/bytes.bin');
    await f.downloadTo(path.join(tmp, 'bytes-down.bin'), '/data/bytes.bin');
    let st = await api.call('server.state');
    assert.deepEqual([st.stats.uploads, st.stats.uploadBytes, st.stats.downloads, st.stats.downloadBytes], [1, 1_500_000, 2, 3_000_000]);
    assert.equal(st.stats.clients, 1);
    assert.deepEqual(st.state.protocols.map((p) => [p.proto, p.port, p.clients, p.total]), [['FTP', p1, 1, 1]]);
    await f.remove('/data/bytes.bin');
    f.close();
    // Stop, then start again on another port with SFTP added: fresh counters, new listeners.
    await api.call('server.stop');
    const [p2, p3] = [await freePort(), await freePort()];
    const snap = await api.call('server.start', { settings: { sharedFolders: shares, protocols: { enableFtp: true, ftpPort: p2, enableSftp: true, sftpPort: p3 }, users } });
    assert.deepEqual(snap.state.protocols.map((p) => [p.proto, p.port]), [['FTP', p2], ['SFTP', p3]]);
    assert.equal(snap.stats.uploads, 0);
    assert.equal((await api.call('settings.get')).protocols.sftpPort, p3);  // start() saved the settings it used
    const sf = await connect(p3, { username: 'bob', password: 'pw' });
    assert.deepEqual((await sf.call('readdir', '/')).map((e) => e.filename), ['data']);
    sf.c.end();
    await new Promise((r) => setTimeout(r, 150));
    st = await api.call('server.state');
    assert.equal(st.stats.totalClients, 1);
    await api.shutdown();
    assert.equal((await api.call('server.state')).state.running, false);    // shutdown stops the servers
  });
});
