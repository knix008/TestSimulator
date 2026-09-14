// SFTP round trips with the ssh2 client against the real server class, and
// the server manager running every protocol together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

async function server(extra = {}) {
  const log = new Log(null);
  const vfs = new VirtualFileSystem([{ virtualName: 'data', physicalPath: share }, { virtualName: 'other', physicalPath: tmp }]);
  const s = new SftpServer({ port: 0, vfs, auth: { allowAnonymous: true, users }, hostKey: fs.readFileSync(keyFile, 'utf8'), log, lang: 'en', ...extra });
  await s.start();
  return s;
}

function connect(port, opts) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => c.sftp((err, sftp) => (err ? reject(err) : resolve({ c, sftp, call: (m, ...a) => new Promise((res, rej) => sftp[m](...a, (e, r) => (e ? rej(e) : res(r)))) }))));
    c.on('error', reject);
    c.connect({ host: '127.0.0.1', port, ...opts });
  });
}

test('SFTP: realpath, readdir, transfer, mkdir/rename/unlink/rmdir', async () => {
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

test('SFTP: anonymous without password is read-only; bad password refused', async () => {
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

test('SFTP: shell / exec requests are refused', async () => {
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

test('manager: FTP + FTPS + SFTP together through the API', async () => {
  const cfg = path.join(tmp, 'cfg');
  const api = createApi({ name: 'test', configDir: cfg });
  const cert = await api.call('cert.generate', { commonName: '127.0.0.1', validityYears: 1 });
  const free = async () => { const net = await import('node:net'); return new Promise((r) => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => r(p)); }); }); };
  const [p1, p2, p3] = [await free(), await free(), await free()];
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

test('manager: a failing listener rolls everything back', async () => {
  const api = createApi({ name: 'test', configDir: path.join(tmp, 'cfg2') });
  const s = await server();  // holds a port
  await assert.rejects(api.call('server.start', { settings: { sharedFolders: [{ virtualName: 'data', physicalPath: share }], protocols: { enableFtp: true, ftpPort: 0, enableSftp: true, sftpPort: s.port } } }), /already in use/);
  const st = await api.call('server.state');
  assert.equal(st.state.running, false);
  assert.equal(st.state.protocols.length, 0);
  await s.stop();
  await api.shutdown();
});
