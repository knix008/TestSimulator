// Core units: virtual file system, authentication, settings / profiles,
// certificates, host keys, the API table (no sockets here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { VirtualFileSystem, normalizePath } = require('../core/vfs');
const { authenticate, permissionSummary } = require('../core/auth');
const { Settings, normalize, toFile } = require('../core/settings');
const { generateSelfSigned, writeSelfSigned, loadCertificate, inspectCertificate } = require('../core/x509');
const hostkey = require('../core/hostkey');
const { createApi, serializeError } = require('../core/api');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfs-core-'));
const shareA = path.join(tmp, 'a');
const shareB = path.join(tmp, 'b');
fs.mkdirSync(path.join(shareA, 'sub'), { recursive: true });
fs.mkdirSync(shareB, { recursive: true });
fs.writeFileSync(path.join(shareA, 'hello.txt'), 'hello');
fs.writeFileSync(path.join(shareA, 'sub', 'x.bin'), Buffer.alloc(10));

test('normalizePath collapses . / .. and backslashes', () => {
  assert.equal(normalizePath(''), '/');
  assert.equal(normalizePath('a/b/../c/./d'), '/a/c/d');
  assert.equal(normalizePath('/../../etc'), '/etc');
  assert.equal(normalizePath('a\\b'), '/a/b');
});

test('VirtualFileSystem maps virtual names and refuses escapes', () => {
  const vfs = new VirtualFileSystem([{ virtualName: 'data', physicalPath: shareA }, { virtualName: 'other', physicalPath: shareB }, { virtualName: 'missing', physicalPath: path.join(tmp, 'nope') }]);
  assert.deepEqual(vfs.virtualNames, ['data', 'other']);
  assert.equal(vfs.skipped.length, 1);
  assert.equal(vfs.resolve('/'), null);
  assert.equal(vfs.resolve('/data'), shareA);
  assert.equal(vfs.resolve('/DATA/sub'), path.join(shareA, 'sub'));
  assert.equal(vfs.resolve('/data/../other'), shareB);
  assert.equal(vfs.resolve('/unknown'), null);
  assert.equal(vfs.directoryExists('/'), true);
  assert.equal(vfs.directoryExists('/data/sub'), true);
  assert.equal(vfs.directoryExists('/data/hello.txt'), false);
  assert.deepEqual(vfs.list('/').map((e) => e.name), ['data', 'other']);
  assert.deepEqual(vfs.list('/data').map((e) => e.name), ['sub', 'hello.txt']);
  assert.equal(vfs.stat('/data/hello.txt').size, 5);
  assert.equal(vfs.stat('/').isDir, true);
});

test('single share accepts the bare form too', () => {
  const vfs = new VirtualFileSystem([{ virtualName: 'data', physicalPath: shareA }]);
  assert.equal(vfs.isSingleMount, true);
  assert.equal(vfs.resolve('/sub'), path.join(shareA, 'sub'));
  assert.equal(vfs.resolve('/data/sub'), path.join(shareA, 'sub'));
  assert.deepEqual(vfs.list('/').map((e) => e.name), ['data']);
});

test('authenticate: anonymous read-only, users case-insensitive, rights required', () => {
  const opts = { allowAnonymous: true, users: [{ username: 'Bob', password: 'pw', canRead: true, canWrite: true }, { username: 'none', password: '', canRead: false, canWrite: false }] };
  assert.deepEqual(authenticate('anonymous', 'anything', opts), { canRead: true, canWrite: false, anonymous: true, user: 'anonymous' });
  assert.equal(authenticate('anonymous', '', { ...opts, allowAnonymous: false }), null);
  assert.equal(authenticate('bob', 'pw', opts).canWrite, true);
  assert.equal(authenticate('bob', 'PW', opts), null);
  assert.equal(authenticate('none', '', opts), null);
  assert.equal(authenticate('', '', opts), null);
  assert.equal(permissionSummary({ canRead: true, canWrite: true }), '읽기+쓰기');
  assert.equal(permissionSummary({ canRead: true, canWrite: false }, 'en'), 'read');
});

test('settings normalize: defaults, PascalCase import, obfuscated secrets', () => {
  const s = normalize({});
  assert.equal(s.protocols.ftpPort, 21);
  assert.equal(s.allowAnonymous, true);
  // A file written by the WinForms original.
  const legacy = normalize({ SharedFolders: [{ VirtualName: 'Data', PhysicalPath: 'D:\\x' }], AllowAnonymous: false, UserId: 'u', UserPassword: 'p', BufferSizeKb: 65, MaxThreads: 10, Protocols: { EnableFtp: true, EnableSftp: true, SftpPort: 2222 } });
  assert.equal(legacy.sharedFolders[0].virtualName, 'Data');
  assert.equal(legacy.users[0].username, 'u');
  assert.equal(legacy.maxConnections, 10);
  assert.equal(legacy.protocols.sftpPort, 2222);
  const file = toFile({ users: [{ username: 'a', password: 'secret' }], certPassword: 'cp' });
  assert.equal(file.users[0].password, 'b64:' + Buffer.from('secret').toString('base64'));
  assert.equal(normalize(file).users[0].password, 'secret');
  assert.equal(normalize(file).certPassword, 'cp');
  assert.equal(normalize({ protocols: { ftpPort: 99999 } }).protocols.ftpPort, 21);
});

test('Settings: save / load / profiles', () => {
  const dir = path.join(tmp, 'cfg');
  const st = new Settings(dir);
  st.save({ sharedFolders: [{ virtualName: 'x', physicalPath: shareA }], users: [{ username: 'u', password: 'p' }] });
  const again = new Settings(dir);
  assert.equal(again.load().sharedFolders[0].virtualName, 'x');
  assert.deepEqual(st.saveProfile('Home', st.get()), ['Home']);
  assert.deepEqual(st.saveProfile('Office', { allowAnonymous: false }), ['Home', 'Office']);
  assert.equal(st.loadProfile('Office').allowAnonymous, false);
  assert.deepEqual(st.deleteProfile('Home'), ['Office']);
  assert.throws(() => st.saveProfile('../evil', {}), /Invalid profile name/);
});

test('x509: self-signed certificate is valid and loads for TLS', () => {
  const g = generateSelfSigned({ commonName: '192.168.1.10', validityYears: 2 });
  assert.match(g.cert, /BEGIN CERTIFICATE/);
  assert.match(g.key, /BEGIN PRIVATE KEY/);
  assert.equal(g.subject, 'CN=192.168.1.10');
  const file = path.join(tmp, 'cert.pem');
  const w = writeSelfSigned(file, { commonName: 'myhost', validityYears: 1 });
  assert.equal(w.keyPath, path.join(tmp, 'cert_key.pem'));
  const loaded = loadCertificate({ certPath: file });
  assert.ok(loaded.options.cert && loaded.options.key);
  assert.equal(loaded.summary.subject, 'CN=myhost');
  assert.equal(inspectCertificate(file).ok, true);
  assert.equal(inspectCertificate(path.join(tmp, 'nope.pem')).ok, false);
  assert.throws(() => loadCertificate({ certPath: path.join(tmp, 'nope.pem') }), /not found/);
});

test('hostkey: generate, inspect, OpenSSH-style fingerprint', async () => {
  const file = path.join(tmp, 'keys', 'host.pem');
  assert.equal(hostkey.inspectKey(file).exists, false);
  await hostkey.ensureKey(file);
  const info = hostkey.inspectKey(file);
  assert.equal(info.type, 'ssh-rsa');
  assert.equal(info.bits, 2048);
  assert.match(info.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.equal(hostkey.resolveKeyPath('/cfg', ''), path.join('/cfg', 'ssh_host_rsa.pem'));
  assert.equal(hostkey.resolveKeyPath('/cfg', ' /x/k.pem '), '/x/k.pem');
});

test('api: info, settings round trip, validation, poll, errors', async () => {
  const api = createApi({ name: 'test', configDir: path.join(tmp, 'api') });
  const info = await api.call('app.info');
  assert.equal(info.host, 'test');
  assert.ok(info.defaultHostKeyPath.endsWith('ssh_host_rsa.pem'));
  const saved = await api.call('settings.save', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }] } });
  assert.equal(saved.sharedFolders.length, 1);
  assert.equal((await api.call('settings.validate', { settings: {} })).code, 'no_shares');
  assert.equal((await api.call('settings.validate', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }], protocols: { enableFtp: false } } })).code, 'no_protocol');
  assert.equal((await api.call('settings.validate', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }], protocols: { enableFtps: true } } })).code, 'cert_missing');
  assert.equal((await api.call('settings.validate', { settings: saved })).ok, true);
  const r = await api.call('profiles.save', { name: 'P1', settings: saved });
  assert.deepEqual(r.profiles, ['P1']);
  const poll = await api.call('server.poll', { seq: 0 });
  assert.equal(poll.state.running, false);
  assert.ok(poll.lines.some((l) => /P1/.test(l.text)));
  const after = await api.call('server.poll', { seq: poll.seq });
  assert.equal(after.lines.length, 0);
  await assert.rejects(api.call('nope.method'), /Unknown API method/);
  const e = serializeError(Object.assign(new Error('x'), { code: 'EX', detail: 'd' }));
  assert.deepEqual([e.code, e.message, e.detail], ['EX', 'x', 'd']);
  await api.shutdown();
});
