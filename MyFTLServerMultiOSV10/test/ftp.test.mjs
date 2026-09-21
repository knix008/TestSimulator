// FTP / FTPS round trips with basic-ftp against the real server classes:
// listing, up/download (with REST), rename, delete, permissions, login
// failures, connection limit, explicit AUTH TLS + PROT P and implicit TLS.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const ftp = require('basic-ftp');
const { FtpServer, listLine, mlsxLine, mlsdTime, formatBytes } = require('../core/ftp-server');
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

function freePort() {
  return new Promise((r) => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => r(p)); }); });
}

// Every listener is remembered so a failing test cannot leave one open (the
// runner would then wait forever for the process to exit).
const openServers = new Set();
after(async () => { for (const s of openServers) await s.stop(); });

function server(extra = {}) {
  const log = new Log(null);
  const vfs = new VirtualFileSystem([{ virtualName: 'data', physicalPath: share }]);
  const s = new FtpServer({ proto: 'FTP', port: 0, vfs, auth, log, lang: 'en', ...extra });
  openServers.add(s);
  return s;
}

async function client(port, opts = {}) {
  const c = new ftp.Client(10_000);
  try { await c.access({ host: '127.0.0.1', port, user: 'bob', password: 'pw', ...opts }); }
  catch (err) { c.close(); throw err; }
  return c;
}

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

describe('File operations', () => {
  test('list, transfer, rename, delete, mkdir', async () => {
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

  test('REST resumes a download', async () => {
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

  test('UTF-8 file and folder names round-trip', async () => {
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
});

describe('Authentication & rights', () => {
  test('anonymous is read-only, wrong password refused, unknown user refused', async () => {
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

  test('read-only user: every writing command is refused with 550; write-only user: CWD and listings refused', async () => {
    const s = server({ auth: { allowAnonymous: false, users: [...users, { username: 'wo', password: 'wo', canRead: false, canWrite: true }] } });
    await s.start();
    const ro = await login(s.port, 'ro', 'ro');
    for (const cmd of ['STOR /data/x', 'APPE /data/x', 'DELE /data/hello.txt', 'MKD /data/x', 'RMD /data/sub', 'RNFR /data/hello.txt', 'RNTO /data/y']) {
      assert.match(await ro.send(cmd), /^550 Permission denied \(write not allowed\)/, cmd);
    }
    assert.match(await ro.send('SIZE /data/hello.txt'), /^213 5$/);
    assert.equal(fs.existsSync(path.join(share, 'x')), false);
    ro.close();
    const wo = await login(s.port, 'wo', 'wo');
    for (const cmd of ['CWD /data', 'LIST', 'NLST', 'MLSD', 'MLST /data', 'SIZE /data/hello.txt', 'MDTM /data/hello.txt', 'RETR /data/hello.txt']) {
      assert.match(await wo.send(cmd), /^550 Permission denied \(read not allowed\)/, cmd);
    }
    assert.match(await wo.send('MKD /data/wo-dir'), /^257 /);
    assert.match(await wo.send('RMD /data/wo-dir'), /^250 /);
    wo.close();
    // USER again after a login starts a fresh authentication.
    const r = await login(s.port);
    assert.match(await r.send('USER ro'), /^331 /);
    assert.match(await r.send('PASS ro'), /^230 User logged in \(read\)/);
    assert.match(await r.send('MKD /data/again'), /^550 /);
    assert.match(await r.send('USER anonymous'), /^331 /);
    assert.match(await r.send('PASS x'), /^530 /);                         // anonymous is off on this listener
    r.close();
    await s.stop();
  });
});

describe('Path safety', () => {
  test('paths cannot escape the shares, share roots cannot be removed', async () => {
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
});

describe('Protocol commands', () => {
  test('command replies (RFC 959 house-keeping, errors, pre-login gate)', async () => {
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

  test('active mode (PORT / EPRT), NLST, REST + STOR resume, APPE', async () => {
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

  test('PASV port range and the address announced to a LAN peer', async () => {
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

  test('MLSD, LIST of one file with options, ABOR, X-aliases, STAT after CWD, case-insensitive commands', async () => {
    const s = server();
    await s.start();
    const r = await login(s.port);
    const a = await activeListener();
    assert.match(await r.send(`EPRT ${a.eprt}`), /^200 /);
    assert.match(await r.send('MLSD /data'), /^150 /);
    assert.match(await r.next(), /^226 /);
    assert.match((await a.received).toString(), /^type=dir;modify=\d{14};perm=el; sub\r\ntype=file;size=5;modify=\d{14};perm=r; hello\.txt\r\n$/);
    const b = await activeListener();
    assert.match(await r.send(`EPRT ${b.eprt}`), /^200 /);
    assert.match(await r.send('LIST -la /data/hello.txt'), /^150 /);      // options are stripped, a file lists itself
    assert.match(await r.next(), /^226 /);
    assert.match((await b.received).toString(), /^-rw-r--r-- .* hello\.txt\r\n$/);
    const c = await activeListener();
    assert.match(await r.send(`EPRT ${c.eprt}`), /^200 /);
    assert.match(await r.send('LIST "/data/sub"'), /^150 /);              // quoted argument, empty folder
    assert.match(await r.next(), /^226 /);
    assert.equal((await c.received).length, 0);
    assert.match(await r.send('LIST /data/nope'), /^550 /);
    assert.match(await r.send('ABOR'), /^226 /);
    assert.match(await r.send('XPWD'), /^257 "\/"/);
    assert.match(await r.send('XCWD /data'), /^250 /);
    assert.match(await r.send('STAT'), /Working directory \/data/);
    assert.match(await r.send('XMKD alias'), /^257 "\/data\/alias" created/);
    assert.match(await r.send('XRMD alias'), /^250 /);
    assert.match(await r.send('TYPE'), /^200 Type set to I/);
    assert.match(await r.send('type a'), /^200 Type set to A/);
    assert.match(await r.send('CWD sub'), /^250 Directory changed to \/data\/sub/);   // relative to the cwd
    assert.match(await r.send('CWD ..'), /^250 Directory changed to \/data$/);
    assert.match(await r.send('CWD .'), /^250 Directory changed to \/data$/);
    assert.match(await r.send('MLST'), /^250-Listing\r\n type=dir;.* \/data\r\n250 End$/);   // no argument → cwd
    assert.match(await r.send('CDUP'), /^250 Directory changed to \/$/);
    r.close();
    await s.stop();
  });

  test('RNFR / RNTO of a folder, RMD of a non-empty folder, DELE of a folder, RNTO into the root', async () => {
    const s = server();
    await s.start();
    const r = await login(s.port);
    assert.match(await r.send('MKD /data/dir1'), /^257 "\/data\/dir1" created/);
    assert.match(await r.send('RNFR /data/dir1'), /^350 /);
    assert.match(await r.send('RNTO /data/dir2'), /^250 /);
    assert.ok(fs.existsSync(path.join(share, 'dir2')) && !fs.existsSync(path.join(share, 'dir1')));
    assert.match(await r.send('RNFR /data/dir2'), /^350 /);
    assert.match(await r.send('RNTO /'), /^553 /);
    assert.match(await r.send('RNTO /data/dir3'), /^503 /);               // the failed RNTO consumed the RNFR
    const c = await activeListener(Buffer.from('x'));
    assert.match(await r.send(`EPRT ${c.eprt}`), /^200 /);
    assert.match(await r.send('STOR /data/dir2/f.txt'), /^150 /);
    assert.match(await r.next(), /^226 /);
    await c.received;
    assert.match(await r.send('RMD /data/dir2'), /^550 Directory not empty/);
    assert.match(await r.send('DELE /data/dir2'), /^550 /);
    assert.match(await r.send('RMD /data/dir2/f.txt'), /^550 Not a directory/);
    assert.match(await r.send('RNFR /data/dir2/f.txt'), /^350 /);
    assert.match(await r.send('RNTO /data/dir2/g.txt'), /^250 /);
    assert.match(await r.send('DELE /data/dir2/g.txt'), /^250 /);
    assert.match(await r.send('RMD /data/dir2'), /^250 /);
    assert.match(await r.send('MKD /data/a/b/c'), /^550 /);               // no recursive mkdir
    r.close();
    await s.stop();
  });

  test('REST + RETR sends the tail once, a new EPSV replaces the previous listener, PORT to a closed port fails cleanly', async () => {
    const s = server();
    await s.start();
    const r = await login(s.port);
    const a = await activeListener();
    assert.match(await r.send(`EPRT ${a.eprt}`), /^200 /);
    assert.match(await r.send('REST 3'), /^350 /);
    assert.match(await r.send('RETR /data/hello.txt'), /^150 /);
    assert.match(await r.next(), /^226 /);
    assert.equal((await a.received).toString(), 'lo');
    const b = await activeListener();                                       // REST is consumed: back to offset 0
    assert.match(await r.send(`EPRT ${b.eprt}`), /^200 /);
    assert.match(await r.send('RETR /data/hello.txt'), /^150 /);
    assert.match(await r.next(), /^226 /);
    assert.equal((await b.received).toString(), 'hello');
    assert.match(await r.send('REST 999'), /^350 Restarting at 999/);
    const c = await activeListener();
    assert.match(await r.send(`EPRT ${c.eprt}`), /^200 /);
    assert.match(await r.send('RETR /data/hello.txt'), /^150 /);          // offset past the end → empty
    assert.match(await r.next(), /^226 /);
    assert.equal((await c.received).length, 0);
    assert.match(await r.send('REST -5'), /^350 Restarting at 0/);
    assert.match(await r.send('REST abc'), /^350 Restarting at 0/);

    const p1 = Number((await r.send('EPSV')).match(/\|\|\|(\d+)\|/)[1]);
    const p2 = Number((await r.send('EPSV')).match(/\|\|\|(\d+)\|/)[1]);
    if (p1 !== p2) {
      await assert.rejects(new Promise((res, rej) => { const d = net.connect(p1, '127.0.0.1'); d.on('connect', () => { d.destroy(); res(); }); d.on('error', rej); }), /ECONNREFUSED/);
    }
    const data = new Promise((resolve) => { const ds = net.connect(p2, '127.0.0.1'); let t = ''; ds.setEncoding('utf8'); ds.on('data', (d) => { t += d; }); ds.on('close', () => resolve(t)); });
    assert.match(await r.send('NLST /data'), /^150 /);
    assert.match(await r.next(), /^226 /);
    assert.equal(await data, 'sub\r\nhello.txt\r\n');

    const closed = await freePort();
    assert.match(await r.send(`PORT 127,0,0,1,${closed >> 8},${closed & 255}`), /^200 /);
    assert.match(await r.send('NLST /data'), /^150 /);
    assert.match(await r.next(), /^425 .*ECONNREFUSED/);
    assert.match(await r.send('NOOP'), /^200 /);                            // the control connection survives
    r.close();
    await s.stop();
  });
});

describe('FTPS (TLS)', () => {
  test('explicit AUTH TLS + PROT P, and implicit TLS', async () => {
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
});

describe('Lifecycle, limits & log', () => {
  test('connection limit and client counter', async () => {
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

  test('port in use gives a readable error', async () => {
    const s = server();
    await s.start();
    const dup = server({ port: s.port });
    await assert.rejects(dup.start(), /already in use/);
    await s.stop();
  });

  test('write-only user, log events, stop() disconnects clients, bind address', async () => {
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

  test('maxConnections 0 is unlimited, totals count every session, sessions log their peer', async () => {
    const log = new Log(null);
    const lines = [];
    log.on('line', (l) => lines.push(l));
    const s = server({ maxConnections: 0, log });
    await s.start();
    const clients = await Promise.all([1, 2, 3].map(() => client(s.port)));
    assert.equal(s.clientCount, 3);
    assert.equal(s.totalConnections, 3);
    for (const c of clients) c.close();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(s.clientCount, 0);
    assert.equal(s.totalConnections, 3);
    const connected = lines.filter((l) => l.key === 'client_connected');
    assert.equal(connected.length, 3);
    assert.match(connected[0].params.peer, /^127\.0\.0\.1:\d+$/);
    assert.equal(connected[0].params.proto, 'FTP');
    // The trace shows the commands but never the password.
    assert.ok(lines.some((l) => l.level === 'trace' && /> PASS \*\*\*\*$/.test(l.text)));
    assert.equal(lines.some((l) => /pw/.test(l.text) && l.level === 'trace'), false);
    await s.stop();
    // stop() twice is harmless; a stopped server refuses connections.
    await s.stop();
    await assert.rejects(client(s.port), /ECONNREFUSED/);
  });
});

describe('Listing formats', () => {
  test('formatBytes, mlsdTime (UTC), LIST and MLSx lines', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1023), '1023 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
    assert.equal(formatBytes(2 ** 30), '1.00 GB');
    const t = Date.UTC(2024, 4, 6, 7, 8, 9);
    assert.equal(mlsdTime(t), '20240506070809');
    assert.equal(mlsxLine({ name: 'f.txt', isDir: false, size: 12, mtime: t }), 'type=file;size=12;modify=20240506070809;perm=r; f.txt');
    assert.equal(mlsxLine({ name: 'd', isDir: true, size: 0, mtime: t }), 'type=dir;modify=20240506070809;perm=el; d');
    // Recent entries show the time, entries older than half a year the year.
    assert.match(listLine({ name: 'f.txt', isDir: false, size: 12, mtime: Date.now() - 1000 }), /^-rw-r--r-- 1 ftp ftp {11}12 [A-Z][a-z]{2} \d\d \d\d:\d\d f\.txt$/);
    assert.match(listLine({ name: 'd', isDir: true, size: 0, mtime: Date.now() - 400 * 86_400_000 }), /^drwxr-xr-x 1 ftp ftp {12}0 [A-Z][a-z]{2} \d\d {2}\d{4} d$/);
  });
});
