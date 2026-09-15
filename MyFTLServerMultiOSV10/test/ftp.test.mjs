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
  try { await c.access({ host: '127.0.0.1', port, user: 'bob', password: 'pw', ...opts }); }
  catch (err) { c.close(); throw err; }
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

test('FTP: paths cannot escape the shares, share roots cannot be removed', async () => {
  const other = path.join(tmp, 'other');
  fs.mkdirSync(other, { recursive: true });
  const s = server({ vfs: new VirtualFileSystem([{ virtualName: 'data', physicalPath: share }, { virtualName: 'other', physicalPath: other }]) });
  await s.start();
  const c = await client(s.port);
  // ".." is clamped at the virtual root: the shares' parent folders never show.
  assert.deepEqual((await c.list('/data/../../')).map((e) => e.name), ['data', 'other']);
  await assert.rejects(c.list('/data/../nope'), /550/);
  await assert.rejects(c.removeEmptyDir('/data'), /550/);
  // Nothing can be written into the virtual root itself.
  await assert.rejects(c.uploadFrom(path.join(tmp, 'up.bin'), '/x.bin'), /55[03]/);
  await assert.rejects(c.ensureDir('/newshare'), /55[03]/);
  assert.equal(fs.existsSync(path.join(share, 'x.bin')), false);
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

// ── A hand-driven control connection for what basic-ftp never sends ──
// send(line) resolves with the complete reply (multi-line replies included);
// next() waits for the following unsolicited one (the 226 after a 150).
function rawSession(port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let buf = '';
    const waiters = [];
    const pump = () => {
      if (!waiters.length) return;
      const m = buf.match(/^(\d{3})[ -]/);
      if (!m) return;
      const end = buf.match(new RegExp(`(^|\\r\\n)${m[1]} [^\\r\\n]*\\r\\n`));
      if (!end) return;
      const cut = end.index + end[0].length;
      const text = buf.slice(0, cut);
      buf = buf.slice(cut);
      waiters.shift()(text.trimEnd());
      pump();
    };
    sock.setEncoding('utf8');
    sock.on('data', (d) => { buf += d; pump(); });
    sock.on('error', reject);
    const next = () => new Promise((r) => { waiters.push(r); pump(); });
    const send = (line) => { sock.write(`${line}\r\n`); return next(); };
    next().then((banner) => resolve({ sock, banner, send, next, close: () => sock.destroy() }));
  });
}

// An active-mode data listener: the server dials us. `payload` is sent to the
// server (STOR); whatever the server sends arrives in `received`.
async function activeListener(payload = null) {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const received = new Promise((resolve) => srv.once('connection', (s) => {
    const chunks = [];
    s.on('data', (d) => chunks.push(d));
    s.on('close', () => { srv.close(); resolve(Buffer.concat(chunks)); });
    if (payload) s.end(payload); else s.on('end', () => s.end());
  }));
  const port = srv.address().port;
  return { port, received, eprt: `|1|127.0.0.1|${port}|`, portArg: `127,0,0,1,${port >> 8},${port & 255}` };
}

async function login(port, user = 'bob', pw = 'pw') {
  const r = await rawSession(port);
  assert.match(r.banner, /^220 /);
  assert.match(await r.send(`USER ${user}`), /^331 /);
  assert.match(await r.send(`PASS ${pw}`), /^230 /);
  return r;
}

test('FTP: command replies (RFC 959 house-keeping, errors, pre-login gate)', async () => {
  const s = server();
  await s.start();
  const r = await rawSession(s.port);
  assert.match(await r.send('LIST'), /^530 /);              // nothing but the open set before login
  assert.match(await r.send('SYST'), /^215 UNIX/);
  assert.match(await r.send('PASS x'), /^530 /);            // PASS without USER
  assert.match(await r.send('USER bob'), /^331 /);
  assert.match(await r.send('PASS pw'), /^230 User logged in \(read\+write\)/);
  const feat = await r.send('FEAT');
  assert.match(feat, /^211-Features:/);
  for (const f of ['MLST', 'MLSD', 'SIZE', 'MDTM', 'REST STREAM', 'UTF8', 'EPSV', 'EPRT']) assert.ok(feat.includes(f), f);
  assert.equal(feat.includes('AUTH TLS'), false);           // no certificate on this listener
  assert.match(await r.send('OPTS UTF8 ON'), /^200 UTF8/);
  assert.match(await r.send('TYPE A'), /^200 Type set to A/);
  assert.match(await r.send('TYPE I'), /^200 /);
  assert.match(await r.send('MODE S'), /^200 /);
  assert.match(await r.send('MODE B'), /^504 /);
  assert.match(await r.send('STRU F'), /^200 /);
  assert.match(await r.send('STRU R'), /^504 /);
  assert.match(await r.send('NOOP'), /^200 /);
  assert.match(await r.send('HELP'), /^214 /);
  assert.match(await r.send('ALLO 100'), /^202 /);
  assert.match(await r.send('STAT'), /^211-[\s\S]*Logged in as bob[\s\S]*211 End$/);
  assert.match(await r.send('PWD'), /^257 "\/"/);
  assert.match(await r.send('CWD /nope'), /^550 /);
  assert.match(await r.send('CWD /data/hello.txt'), /^550 /);
  assert.match(await r.send('CWD data'), /^250 /);
  assert.match(await r.send('PWD'), /^257 "\/data"/);
  assert.match(await r.send('CDUP'), /^250 Directory changed to \//);
  assert.match(await r.send('CDUP'), /^250 Directory changed to \/$/);   // stays at the root
  assert.match(await r.send('RNTO x'), /^503 /);
  assert.match(await r.send('RNFR /data/nope'), /^550 /);
  assert.match(await r.send('PORT 1,2,3'), /^501 /);
  assert.match(await r.send('EPRT |9|x|0|'), /^501 /);
  assert.match(await r.send('SIZE /data/sub'), /^550 /);
  assert.match(await r.send('SIZE /data/hello.txt'), /^213 5$/);
  assert.match(await r.send('MDTM /data/hello.txt'), /^213 \d{14}$/);
  assert.match(await r.send('MDTM /data/nope'), /^550 /);
  assert.match(await r.send('MLST /data/hello.txt'), /^250-Listing\r\n type=file;size=5;modify=\d{14};perm=r; \/data\/hello.txt\r\n250 End$/);
  assert.match(await r.send('MLST /data/nope'), /^550 /);
  assert.match(await r.send('RETR /data/sub'), /^550 /);
  assert.match(await r.send('RETR /data/nope'), /^550 /);
  assert.match(await r.send('DELE /data/sub'), /^550 /);
  assert.match(await r.send('RMD /data/nope'), /^550 /);
  assert.match(await r.send('MKD /data/sub'), /^550 Already exists/);
  assert.match(await r.send('STOR /data/nodir/x.bin'), /^553 /);
  assert.match(await r.send('SITE CHMOD 644 x'), /^500 /);
  assert.match(await r.send('FOO'), /^502 /);
  assert.match(await r.send('AUTH TLS'), /^502 /);
  assert.match(await r.send('PBSZ 0'), /^503 /);
  assert.match(await r.send('PROT P'), /^503 /);
  assert.match(await r.send('LIST'), /^150 /);              // without PASV/PORT the data phase fails cleanly
  assert.match(await r.next(), /^425 /);
  assert.match(await r.send('QUIT'), /^221 /);
  r.close();
  await s.stop();
});

test('FTP: active mode (PORT / EPRT), NLST, REST + STOR resume, APPE', async () => {
  const s = server();
  await s.start();
  const r = await login(s.port);

  const a = await activeListener();
  assert.match(await r.send(`PORT ${a.portArg}`), /^200 /);
  assert.match(await r.send('LIST /data'), /^150 /);
  assert.match(await r.next(), /^226 /);
  assert.match((await a.received).toString(), /drwxr-xr-x .* sub\r\n-rw-r--r-- .* hello.txt\r\n$/);

  const b = await activeListener();
  assert.match(await r.send(`EPRT ${b.eprt}`), /^200 /);
  assert.match(await r.send('NLST /data'), /^150 /);
  assert.match(await r.next(), /^226 /);
  assert.equal((await b.received).toString(), 'sub\r\nhello.txt\r\n');

  // STOR over an active connection, then REST + STOR overwrites from an offset.
  const c = await activeListener(Buffer.alloc(1000, 1));
  assert.match(await r.send(`EPRT ${c.eprt}`), /^200 /);
  assert.match(await r.send('STOR /data/active.bin'), /^150 /);
  assert.match(await r.next(), /^226 /);
  await c.received;
  assert.equal(fs.statSync(path.join(share, 'active.bin')).size, 1000);
  const d = await activeListener(Buffer.alloc(500, 2));
  assert.match(await r.send('REST 500'), /^350 Restarting at 500/);
  assert.match(await r.send(`EPRT ${d.eprt}`), /^200 /);
  assert.match(await r.send('STOR /data/active.bin'), /^150 /);
  assert.match(await r.next(), /^226 /);
  await d.received;
  const resumed = fs.readFileSync(path.join(share, 'active.bin'));
  assert.equal(resumed.length, 1000);
  assert.deepEqual([resumed[0], resumed[499], resumed[500], resumed[999]], [1, 1, 2, 2]);

  // APPE adds to the end; a following STOR without REST truncates.
  const e = await activeListener(Buffer.alloc(10, 3));
  assert.match(await r.send(`EPRT ${e.eprt}`), /^200 /);
  assert.match(await r.send('APPE /data/active.bin'), /^150 /);
  assert.match(await r.next(), /^226 /);
  await e.received;
  assert.equal(fs.statSync(path.join(share, 'active.bin')).size, 1010);
  const f = await activeListener(Buffer.alloc(3, 4));
  assert.match(await r.send(`EPRT ${f.eprt}`), /^200 /);
  assert.match(await r.send('STOR /data/active.bin'), /^150 /);
  assert.match(await r.next(), /^226 /);
  await f.received;
  assert.equal(fs.statSync(path.join(share, 'active.bin')).size, 3);
  assert.match(await r.send('DELE /data/active.bin'), /^250 /);
  r.close();
  await s.stop();
});

test('FTP: PASV port range and the address announced to a LAN peer', async () => {
  const s = server({ pasvPortMin: 47100, pasvPortMax: 47120, pasvAddress: '203.0.113.9' });
  await s.start();
  const r = await login(s.port);
  for (let i = 0; i < 3; i++) {
    const pasv = await r.send('PASV');
    const m = pasv.match(/^227 .*\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    assert.ok(m, pasv);
    assert.equal(m.slice(1, 5).join('.'), '127.0.0.1');            // loopback peer → local address, not the NAT one
    const port = Number(m[5]) * 256 + Number(m[6]);
    assert.ok(port >= 47100 && port <= 47120, String(port));
    const epsv = await r.send('EPSV');
    const p2 = Number(epsv.match(/\|\|\|(\d+)\|/)[1]);
    assert.ok(p2 >= 47100 && p2 <= 47120, String(p2));
  }
  // The passive listener is really usable in that range.
  const epsv = await r.send('EPSV');
  const port = Number(epsv.match(/\|\|\|(\d+)\|/)[1]);
  const data = new Promise((resolve) => { const ds = net.connect(port, '127.0.0.1'); let t = ''; ds.setEncoding('utf8'); ds.on('data', (d) => { t += d; }); ds.on('close', () => resolve(t)); });
  assert.match(await r.send('NLST /data'), /^150 /);
  assert.match(await r.next(), /^226 /);
  assert.equal(await data, 'sub\r\nhello.txt\r\n');
  r.close();
  await s.stop();
});

test('FTP: UTF-8 file and folder names round-trip', async () => {
  const s = server();
  await s.start();
  const c = await client(s.port);
  const local = path.join(tmp, '한글 파일.txt');
  fs.writeFileSync(local, '안녕하세요');
  await c.ensureDir('/data/문서 폴더');
  await c.uploadFrom(local, '/data/문서 폴더/한글 파일.txt');
  assert.deepEqual((await c.list('/data/문서 폴더')).map((e) => [e.name, e.size]), [['한글 파일.txt', Buffer.byteLength('안녕하세요')]]);
  assert.ok(fs.existsSync(path.join(share, '문서 폴더', '한글 파일.txt')));
  await c.downloadTo(path.join(tmp, 'back.txt'), '/data/문서 폴더/한글 파일.txt');
  assert.equal(fs.readFileSync(path.join(tmp, 'back.txt'), 'utf8'), '안녕하세요');
  await c.rename('/data/문서 폴더/한글 파일.txt', '/data/문서 폴더/이름 변경.txt');
  await c.remove('/data/문서 폴더/이름 변경.txt');
  await c.removeEmptyDir('/data/문서 폴더');
  c.close();
  await s.stop();
});

test('FTP: write-only user, log events, stop() disconnects clients, bind address', async () => {
  const log = new Log(null);
  const keys = [];
  log.on('line', (l) => { if (l.key) keys.push(l.key); });
  const s = server({ log, host: '127.0.0.1', auth: { allowAnonymous: true, users: [...users, { username: 'wo', password: 'wo', canRead: false, canWrite: true }] } });
  await s.start();
  assert.equal(s.server.address().address, '127.0.0.1');
  const w = await client(s.port, { user: 'wo', password: 'wo' });
  await assert.rejects(w.list('/data'), /550/);
  await assert.rejects(w.size('/data/hello.txt'), /550/);
  await w.uploadFrom(path.join(tmp, 'up.bin'), '/data/wo.bin');
  assert.equal(fs.statSync(path.join(share, 'wo.bin')).size, 300_000);
  await w.remove('/data/wo.bin');
  w.close();
  await assert.rejects(client(s.port, { user: 'wo', password: 'nope' }), /530/);
  const a = await client(s.port, { user: 'anonymous', password: 'x' });
  await assert.rejects(a.ensureDir('/data/no'), /550/);
  a.close();
  await new Promise((r) => setTimeout(r, 100));
  for (const k of ['ftp_started', 'client_connected', 'login_ok', 'denied_read', 'upload_done', 'file_deleted', 'login_failed', 'denied_write', 'client_closed']) assert.ok(keys.includes(k), k);

  // Stopping the listener drops the sessions still connected.
  const c = await client(s.port);
  await s.stop();
  assert.ok(keys.includes('ftp_stopped'));
  await assert.rejects(c.list('/'));
  c.close();
});
