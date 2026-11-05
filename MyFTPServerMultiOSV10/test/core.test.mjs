// Core units: virtual file system, authentication, settings / profiles,
// certificates, host keys, the API table (no sockets here).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { formatSize, timeStamp, fileStamp, formatUptime, permSummary, baseName, dirName, joinPath } from '../src/lib/format.js';

const require = createRequire(import.meta.url);
const { VirtualFileSystem, normalizePath, posixJoin, posixParent, posixBase } = require('../core/vfs');
const { authenticate, permissionSummary, ANONYMOUS, DENY } = require('../core/auth');
const { Settings, normalize, toFile, DEFAULTS: SETTINGS_DEFAULTS, DEFAULT_PORTS, SETTINGS_VERSION, encodeSecret, decodeSecret } = require('../core/settings');
const { generateSelfSigned, writeSelfSigned, loadCertificate, inspectCertificate } = require('../core/x509');
const hostkey = require('../core/hostkey');
const { createApi, serializeError } = require('../core/api');
const { Log, stamp } = require('../core/log');
const { render, dicts } = require('../core/messages');
const { Session, DEFAULTS: SESSION_DEFAULTS } = require('../core/session');
const { ServerManager } = require('../core/manager');
const local = require('../core/local');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfs-core-'));

// normalize() turns port 0 into the protocol default, so listeners get a real free port.
function freePort() {
  return new Promise((r) => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => r(p)); }); });
}
const shareA = path.join(tmp, 'a');
const shareB = path.join(tmp, 'b');
fs.mkdirSync(path.join(shareA, 'sub'), { recursive: true });
fs.mkdirSync(shareB, { recursive: true });
fs.writeFileSync(path.join(shareA, 'hello.txt'), 'hello');
fs.writeFileSync(path.join(shareA, 'sub', 'x.bin'), Buffer.alloc(10));

describe('Virtual file system', () => {
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

  test('list of a file, skipped shares, trimmed names', () => {
    const vfs = new VirtualFileSystem([{ virtualName: ' /Data/ ', physicalPath: shareA }, { virtualName: 'a/b', physicalPath: shareB }, { virtualName: '', physicalPath: shareB }]);
    assert.deepEqual(vfs.virtualNames, ['Data']);
    assert.deepEqual(vfs.skipped.map((s) => s.reason), ['name', 'name']);
    // Listing a file path yields that one entry (LIST <file>).
    assert.deepEqual(vfs.list('/data/hello.txt').map((e) => [e.name, e.isDir, e.size]), [['hello.txt', false, 5]]);
    assert.throws(() => vfs.list('/nope/x'), (e) => e.code === 'ENOENT');   // single share: bare form → disk ENOENT
    assert.throws(() => new VirtualFileSystem([{ virtualName: 'a', physicalPath: shareA }, { virtualName: 'b', physicalPath: shareB }]).list('/nope'), /No such directory/);
    assert.equal(vfs.stat('/data/nope'), null);
    assert.equal(vfs.mountOf('/data/sub').rest, '/sub');
    assert.equal(vfs.mountOf('/'), null);
  });

  test('posix helpers (join / parent / base) and normalizePath corner cases', () => {
    assert.equal(posixJoin('/', 'a'), '/a');
    assert.equal(posixJoin('', 'a'), '/a');
    assert.equal(posixJoin('/data/', 'x.txt'), '/data/x.txt');
    assert.equal(posixParent('/data/sub/x'), '/data/sub');
    assert.equal(posixParent('/data'), '/');
    assert.equal(posixParent('/'), '/');
    assert.equal(posixParent('data/sub/'), '/data');
    assert.equal(posixBase('/data/sub/x.txt'), 'x.txt');
    assert.equal(posixBase('/data/'), 'data');
    assert.equal(posixBase('/'), '');
    assert.equal(normalizePath('//data///sub//'), '/data/sub');
    assert.equal(normalizePath('..'), '/');
    assert.equal(normalizePath('./a/./b/'), '/a/b');
    assert.equal(normalizePath(null), '/');
  });

  test('missing shares are skipped, names are case-insensitive, natural sort, empty VFS', () => {
    const vfs = new VirtualFileSystem([{ virtualName: 'Data', physicalPath: shareA }, { virtualName: 'gone', physicalPath: path.join(tmp, 'gone') }]);
    assert.deepEqual(vfs.skipped.map((s) => [s.virtualName, s.reason]), [['gone', 'missing']]);
    assert.equal(vfs.hasMounts, true);
    assert.equal(vfs.isSingleMount, true);
    assert.equal(vfs.mountOf('/DATA/sub').mount.name, 'Data');
    assert.deepEqual(vfs.virtualNames, ['Data']);                 // the name keeps its spelling
    assert.equal(vfs.isRoot('/'), true);
    assert.equal(vfs.isRoot('/data/..'), true);
    assert.equal(vfs.isRoot('/data'), false);
    // Folders first, then names in natural order (file2 before file10), case-insensitive.
    const nat = path.join(tmp, 'nat');
    fs.mkdirSync(path.join(nat, 'zdir'), { recursive: true });
    for (const f of ['file10.txt', 'file2.txt', 'B.txt', 'a.txt']) fs.writeFileSync(path.join(nat, f), '');
    const v2 = new VirtualFileSystem([{ virtualName: 'n', physicalPath: nat }]);
    assert.deepEqual(v2.list('/n').map((e) => e.name), ['zdir', 'a.txt', 'B.txt', 'file2.txt', 'file10.txt']);
    assert.deepEqual(v2.list('/n').map((e) => e.isDir), [true, false, false, false, false]);
    const empty = new VirtualFileSystem([]);
    assert.equal(empty.hasMounts, false);
    assert.deepEqual(empty.list('/'), []);
    assert.equal(empty.resolve('/x'), null);
    assert.equal(empty.directoryExists('/'), true);
    assert.equal(empty.stat('/').isDir, true);
    assert.equal(empty.stat('/x'), null);
  });
});

describe('Authentication', () => {
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

  test('constants, name trimming, password compared as text, users without rights, no user list', () => {
    assert.deepEqual(ANONYMOUS, { canRead: true, canWrite: false, anonymous: true });
    assert.deepEqual(DENY, { canRead: false, canWrite: false });
    const opts = { allowAnonymous: true, users: [{ username: 'Num', password: 1234, canRead: true, canWrite: false }, { username: 'w', password: '', canWrite: true, canRead: false }] };
    assert.equal(authenticate('  ANONYMOUS ', 'x', opts).anonymous, true);
    assert.equal(authenticate(' num ', '1234', opts).user, 'Num');          // name as stored, password as text
    assert.equal(authenticate('num', 1234, opts).canWrite, false);
    assert.deepEqual(authenticate('w', '', opts), { canRead: false, canWrite: true, anonymous: false, user: 'w' });
    assert.equal(authenticate('w', undefined, opts).canWrite, true);        // missing password == empty
    assert.equal(authenticate('num', '1234'), null);                        // no user list at all
    assert.equal(authenticate('anonymous', ''), null);                      // anonymous off by default
    assert.equal(authenticate(null, 'x', opts), null);
    assert.equal(permissionSummary({ canRead: false, canWrite: true }), '쓰기');
    assert.equal(permissionSummary({ canRead: false, canWrite: false }, 'en'), 'none');
    assert.equal(permissionSummary(DENY), '없음');
    assert.equal(permissionSummary(ANONYMOUS, 'en'), 'read');
  });
});

describe('Settings & profiles', () => {
  test('normalize: defaults, PascalCase import, obfuscated secrets', () => {
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

  test('normalize: clamps, trimming, dropped entries', () => {
    const s = normalize({
      sharedFolders: [{ virtualName: '/x/', physicalPath: ' C:\\x ' }, { virtualName: '', physicalPath: 'C:\\y' }, { virtualName: 'z', physicalPath: '' }],
      users: [{ username: ' a ', password: 'p' }, { username: '', password: 'p' }, { username: 'b' }],
      bufferSizeKb: 1, maxConnections: -5, pasvPortMin: 70000, pasvPortMax: 'x', protocols: { sftpPort: 0 },
    });
    assert.deepEqual(s.sharedFolders, [{ virtualName: 'x', physicalPath: 'C:\\x' }]);
    assert.deepEqual(s.users.map((u) => [u.username, u.password, u.canRead, u.canWrite]), [['a', 'p', true, true], ['b', '', true, true]]);
    assert.equal(s.bufferSizeKb, 4);
    assert.equal(s.maxConnections, 0);
    assert.equal(s.pasvPortMin, 65535);
    assert.equal(s.pasvPortMax, 0);
    assert.equal(s.protocols.sftpPort, 22);
    assert.equal(s.protocols.explicitTls, true);
    assert.equal(normalize({ protocols: { explicitTls: false } }).protocols.explicitTls, false);
    assert.equal(normalize(null).allowAnonymous, true);
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

  test('secrets: encode / decode round trip, plain text passes through, bad input is empty', () => {
    assert.equal(encodeSecret(''), '');
    assert.equal(decodeSecret(''), '');
    assert.equal(decodeSecret(undefined), '');
    assert.equal(decodeSecret(42), '');
    assert.equal(decodeSecret('plain'), 'plain');
    for (const s of ['pw', '비밀번호 🔑', 'a:b:c', ' spaced ']) assert.equal(decodeSecret(encodeSecret(s)), s);
    assert.match(encodeSecret('x'), /^b64:/);
    assert.equal(encodeSecret('x').includes('x'), false);
  });

  test('toFile stamps the version and hides every secret; a broken file falls back to the defaults', () => {
    const f = toFile({ users: [{ username: 'a', password: 'one' }, { username: 'b', password: '' }], certPassword: 'cp' });
    assert.equal(f.settingsVersion, SETTINGS_VERSION);
    assert.equal(f.users[1].password, '');
    assert.equal(f.certPassword, encodeSecret('cp'));
    assert.equal(JSON.stringify(f).includes('one'), false);
    assert.deepEqual(DEFAULT_PORTS, { ftp: 21, ftps: 990, sftp: 22 });
    assert.equal(normalize({}).settingsVersion, SETTINGS_VERSION);
    assert.deepEqual(normalize({}), { ...SETTINGS_DEFAULTS, protocols: { ...SETTINGS_DEFAULTS.protocols } });
    const dir = path.join(tmp, 'cfg-broken');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'server_settings.json'), '{ not json');
    const st = new Settings(dir);
    assert.deepEqual(st.load(), normalize({}));
    assert.deepEqual(st.profileNames(), []);                                // no profiles folder yet
    assert.equal(new Settings(path.join(tmp, 'never-written')).load().allowAnonymous, true);
  });

  test('profiles: sorted case-insensitively, invalid names refused, deleting a missing one is fine', () => {
    const st = new Settings(path.join(tmp, 'cfg-prof'));
    st.saveProfile('beta', {});
    st.saveProfile('Alpha', {});
    st.saveProfile('gamma 2', { allowAnonymous: false });
    assert.deepEqual(st.profileNames(), ['Alpha', 'beta', 'gamma 2']);
    for (const bad of ['', 'a/b', 'a\\b', 'x:y', 'q?', 'a'.repeat(81)]) assert.throws(() => st.saveProfile(bad, {}), (e) => e.code === 'EINVAL', bad);
    assert.deepEqual(st.deleteProfile('nope'), ['Alpha', 'beta', 'gamma 2']);
    assert.throws(() => st.loadProfile('nope'), /ENOENT/);
    assert.equal(st.loadProfile('gamma 2').allowAnonymous, false);
    assert.equal(st.loadProfile('beta').allowAnonymous, true);
    // get() hands out a fresh copy: mutating it does not touch the stored settings.
    const copy = st.get();
    copy.allowAnonymous = false;
    assert.equal(st.get().allowAnonymous, true);
  });
});

describe('Certificates (x509)', () => {
  test('self-signed certificate is valid and loads for TLS', () => {
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

  test('SAN + validity, explicit key file, missing key is a clear error', () => {
    const g = generateSelfSigned({ commonName: '10.0.0.5', validityYears: 3 });
    const x = new crypto.X509Certificate(g.cert);
    assert.match(x.subjectAltName, /IP Address:10\.0\.0\.5/);
    assert.equal(x.checkIP('10.0.0.5'), '10.0.0.5');
    assert.ok(Math.abs(new Date(x.validTo).getFullYear() - (new Date().getFullYear() + 3)) <= 1);
    const dns = new crypto.X509Certificate(generateSelfSigned({ commonName: 'nas.local' }).cert);
    assert.equal(dns.checkHost('nas.local'), 'nas.local');
    // Certificate alone + key given explicitly, and the failure when neither is found.
    const certOnly = path.join(tmp, 'only.crt');
    const keyElsewhere = path.join(tmp, 'k', 'private.pem');
    fs.mkdirSync(path.dirname(keyElsewhere), { recursive: true });
    fs.writeFileSync(certOnly, g.cert);
    fs.writeFileSync(keyElsewhere, g.key);
    assert.ok(loadCertificate({ certPath: certOnly, keyPath: keyElsewhere }).options.key);
    assert.throws(() => loadCertificate({ certPath: certOnly }), (e) => e.code === 'EKEY' && /Private key not found/.test(e.message));
    fs.writeFileSync(path.join(tmp, 'junk.pem'), 'not a cert');
    assert.throws(() => loadCertificate({ certPath: path.join(tmp, 'junk.pem') }), /Not a PEM certificate/);
    assert.throws(() => loadCertificate({ certPath: '' }), /No certificate/);
  });

  test('inspectCertificate fields, pfx is only checked for existence, key size option', () => {
    const file = path.join(tmp, 'insp.pem');
    writeSelfSigned(file, { commonName: 'inspect.me', validityYears: 1 });
    const info = inspectCertificate(file);
    assert.equal(info.ok, true);
    assert.equal(info.kind, 'pem');
    assert.equal(info.subject, 'CN=inspect.me');
    assert.match(info.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    assert.ok(new Date(info.validTo) > new Date(info.validFrom));
    assert.deepEqual(inspectCertificate(path.join(tmp, 'nope.pfx')), { ok: false, kind: 'pfx' });
    fs.writeFileSync(path.join(tmp, 'some.p12'), 'x');
    assert.deepEqual(inspectCertificate(path.join(tmp, 'some.p12')), { ok: true, kind: 'pfx' });
    assert.equal(inspectCertificate(path.join(tmp, 'junk.pem')).ok, false);
    // The key pair of a certificate written next to its key really matches.
    const loaded = loadCertificate({ certPath: file });
    const x = new crypto.X509Certificate(loaded.options.cert);
    assert.equal(x.checkPrivateKey(crypto.createPrivateKey(loaded.options.key)), true);
  });
});

describe('SSH host key', () => {
  test('generate, inspect, OpenSSH-style fingerprint', async () => {
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

  test('unreadable key reports an error instead of throwing', () => {
    const bad = path.join(tmp, 'bad.pem');
    fs.writeFileSync(bad, 'garbage');
    const info = hostkey.inspectKey(bad);
    assert.equal(info.exists, true);
    assert.ok(info.error);
  });

  test('ensureKey is idempotent, generateKey replaces the key, defaultKeyPath', async () => {
    const file = path.join(tmp, 'keys2', 'k.pem');
    const a = await hostkey.ensureKey(file);
    const b = await hostkey.ensureKey(file);
    assert.equal(a, b);
    assert.match(a, /BEGIN (RSA )?PRIVATE KEY/);
    const fpA = hostkey.inspectKey(file).fingerprint;
    await hostkey.generateKey(file);
    const after = hostkey.inspectKey(file);
    assert.notEqual(after.fingerprint, fpA);
    assert.equal(after.bits, 2048);
    assert.match(after.md5, /^MD5:([0-9a-f]{2}:){15}[0-9a-f]{2}$/);
    assert.match(after.publicKey, /^ssh-rsa [A-Za-z0-9+/=]+$/);
    assert.equal(hostkey.defaultKeyPath('/cfg'), path.join('/cfg', 'ssh_host_rsa.pem'));
    assert.equal(hostkey.resolveKeyPath('/cfg', undefined), path.join('/cfg', 'ssh_host_rsa.pem'));
  });
});

describe('Log & messages', () => {
  test('templates in both languages, unknown keys verbatim', () => {
    assert.equal(render('ko', 'listen_in_use', { proto: 'FTP', port: 21 }).includes('FTP 포트 21'), true);
    assert.match(render('en', 'listen_in_use', { proto: 'FTP', port: 21 }), /FTP port 21 is already in use/);
    assert.equal(render('en', 'not_a_key', {}), 'not_a_key');
    assert.equal(render('xx', 'allow'), '허용');   // unknown language → Korean
  });

  test('ring buffer, sequence polling, file gets events but not traces', () => {
    const file = path.join(tmp, 'logs', 'test.log');
    const log = new Log(file);
    const seen = [];
    log.on('line', (l) => seen.push(l.level));
    log.setLanguage('en');
    log.info('server_stopped');
    log.trace('FTP 1.2.3.4:5 > NOOP');
    log.warn('client_limit', { proto: 'FTP', max: 3, peer: 'x' });
    log.error('server_start_failed', { msg: 'boom' });
    assert.deepEqual(seen, ['info', 'trace', 'warn', 'error']);
    assert.equal(log.lines[0].text, 'Server stopped');
    assert.equal(log.after(2).length, 2);
    assert.equal(log.after(log.seq).length, 0);
    log.flush();
    const written = fs.readFileSync(file, 'utf-8');
    assert.match(written, /\] Server stopped\n/);
    assert.match(written, /ERROR Server start failed: boom/);
    assert.equal(written.includes('NOOP'), false);
    assert.match(log.text(), /^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\] Server stopped/);
    log.clear();
    assert.equal(log.lines.length, 0);
    for (let i = 0; i < 3100; i++) log.trace(`t${i}`);
    assert.equal(log.lines.length, 3000);
    assert.equal(log.lines[0].text, 't100');
  });

  test('both languages define the same keys with the same placeholders', () => {
    const keys = (d) => Object.keys(d).sort();
    assert.deepEqual(keys(dicts.en), keys(dicts.ko));
    const holes = (s) => (String(s).match(/\{[a-zA-Z_]+\}/g) || []).sort();
    for (const k of Object.keys(dicts.ko)) assert.deepEqual(holes(dicts.en[k]), holes(dicts.ko[k]), k);
    assert.ok(Object.keys(dicts.ko).length > 40);
    for (const k of Object.keys(dicts.ko)) assert.ok(String(dicts.ko[k]).length && String(dicts.en[k]).length, k);
  });

  test('stamp() format, raw strings as messages, language switch, levels, params with braces', () => {
    assert.equal(stamp(new Date(2024, 0, 2, 3, 4, 5)), '2024-01-02 03:04:05');
    const log = new Log(null);
    log.info('just text');                                    // not a key → verbatim
    assert.equal(log.lines[0].text, 'just text');
    log.setLanguage('en');
    log.ok('server_stopped');
    log.setLanguage('nope');                                  // unknown → Korean
    log.warn('server_stopped');
    assert.equal(log.lines[1].text, 'Server stopped');
    assert.equal(log.lines[2].text, render('ko', 'server_stopped'));
    assert.deepEqual(log.lines.map((l) => l.level), ['info', 'ok', 'warn']);
    assert.deepEqual(log.lines.map((l) => l.seq), [1, 2, 3]);
    assert.equal(render('en', 'log_saved', { path: 'C:\\a {b}' }), 'Log saved: C:\\a {b}');
    assert.equal(render('en', 'listen_in_use', { proto: 'FTP' }).includes('{port}'), true);   // missing params stay visible
    assert.equal(log.after(2).length, 1);
    assert.equal(log.file, null);
    log.flush();                                              // no file: nothing to do, nothing thrown
    assert.equal(log.text([]), '');
  });

  test('verbose mode writes the protocol chatter to the file too', () => {
    const file = path.join(tmp, 'logs', 'verbose.log');
    const log = new Log(file);
    log.verbose = true;
    log.trace('FTP 1.2.3.4:5 > NOOP');
    log.flush();
    assert.match(fs.readFileSync(file, 'utf-8'), /> NOOP\n$/);
  });
});

describe('Session', () => {
  test('defaults, patch, persistence', () => {
    const dir = path.join(tmp, 'sess');
    const a = new Session(dir);
    assert.equal(a.load().theme, 'midnight');
    assert.equal(a.save({ language: 'en', logHeight: 240 }).language, 'en');
    const b = new Session(dir);
    const loaded = b.load();
    assert.equal(loaded.language, 'en');
    assert.equal(loaded.logHeight, 240);
    assert.equal(loaded.confirmStop, true);   // untouched keys keep their defaults
  });

  test('DEFAULTS, a corrupt file falls back, windowBounds round trip, get() is a copy, save(null)', () => {
    const dir = path.join(tmp, 'sess2');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'session.json'), 'garbage');
    const s = new Session(dir);
    assert.deepEqual(s.load(), SESSION_DEFAULTS);
    const bounds = { x: 10, y: 20, width: 1200, height: 800, maximized: false };
    s.save({ windowBounds: bounds });
    assert.deepEqual(new Session(dir).load().windowBounds, bounds);
    const got = s.get();
    got.theme = 'changed';
    assert.equal(s.get().theme, SESSION_DEFAULTS.theme);
    assert.equal(s.save(null).theme, SESSION_DEFAULTS.theme);
    assert.equal(s.save({ fontSize: 15 }).fontSize, 15);
    assert.equal(new Session(dir).load().fontSize, 15);
    assert.equal(s.configDir, dir);
    assert.equal(typeof new Session().configDir, 'string');   // falls back to the platform config folder
  });
});

describe('Local file system', () => {
  test('roots, folder listing (folders first, extension filter), mkdir, stat', async () => {
    const roots = await local.listRoots();
    assert.ok(roots.length >= 1 && roots.every((r) => r.path && r.isDir));
    fs.writeFileSync(path.join(shareA, 'cert.pem'), 'x');
    const all = await local.listDirectory(shareA, { filesToo: true });
    assert.deepEqual(all.entries.map((e) => e.name), ['sub', 'cert.pem', 'hello.txt']);
    assert.equal(all.parent, path.dirname(shareA));
    const dirsOnly = await local.listDirectory(shareA);
    assert.deepEqual(dirsOnly.entries.map((e) => e.name), ['sub']);
    const pems = await local.listDirectory(shareA, { filesToo: true, extensions: ['.pem'] });
    assert.deepEqual(pems.entries.map((e) => e.name), ['sub', 'cert.pem']);
    assert.equal((await local.listDirectory(path.parse(shareA).root)).parent, null);
    await assert.rejects(local.listDirectory(path.join(tmp, 'nope')), /ENOENT/);
    const made = await local.makeDirectory(shareA, 'made');
    assert.deepEqual(local.statPath(made), { exists: true, isDir: true, size: 0 });
    assert.deepEqual(local.statPath(path.join(shareA, 'hello.txt')), { exists: true, isDir: false, size: 5 });
    assert.equal(local.statPath(path.join(tmp, 'nope')).exists, false);
    fs.rmSync(made, { recursive: true });
    fs.unlinkSync(path.join(shareA, 'cert.pem'));
  });

  test('isDirectory, symlink-free listing hides nothing else, mkdir into a missing parent fails, access errors carry a code', async () => {
    assert.equal(await local.isDirectory(shareA), true);
    assert.equal(await local.isDirectory(path.join(shareA, 'hello.txt')), false);
    assert.equal(await local.isDirectory(path.join(tmp, 'nope')), false);
    const r = await local.listDirectory(shareA, { filesToo: true, extensions: ['.TXT'] });
    assert.deepEqual(r.entries.map((e) => e.name), ['sub']);            // extension filter is lower-cased by the caller
    const r2 = await local.listDirectory(shareA, { filesToo: true, extensions: ['.txt'] });
    assert.deepEqual(r2.entries.map((e) => [e.name, e.isDir, e.size]), [['sub', true, 0], ['hello.txt', false, 5]]);
    assert.equal(r2.entries[1].path, path.join(shareA, 'hello.txt'));
    await assert.rejects(local.makeDirectory(path.join(tmp, 'nope'), 'x'), /ENOENT/);
    await assert.rejects(local.makeDirectory(shareA, 'sub'), /EEXIST/);
    await assert.rejects(local.listDirectory(path.join(shareA, 'hello.txt')), /ENOTDIR|ENOENT/);
    assert.deepEqual(local.statPath(''), { exists: false, isDir: false, size: 0 });
  });
});

describe('Server manager', () => {
  test('manager.validate: every refusal has a code and a readable message', () => {
    const m = new ServerManager({ log: new Log(null), configDir: tmp, lang: 'en' });
    const base = { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }] };
    const missing = m.validate(normalize({ sharedFolders: [{ virtualName: 'd', physicalPath: path.join(tmp, 'gone') }] }));
    assert.equal(missing.code, 'no_shares');
    assert.match(missing.detail, /\/d → /);
    // One missing share out of two is only a warning at start time.
    assert.equal(m.validate(normalize({ sharedFolders: [...base.sharedFolders, { virtualName: 'g', physicalPath: path.join(tmp, 'gone') }] })).ok, true);
    const notFound = m.validate(normalize({ ...base, protocols: { enableFtps: true }, certPath: path.join(tmp, 'no.pem') }));
    assert.equal(notFound.code, 'cert_not_found');
    assert.match(notFound.message, /no\.pem/);
    const clash = m.validate(normalize({ ...base, protocols: { enableFtp: true, ftpPort: 2121, enableSftp: true, sftpPort: 2121 } }));
    assert.equal(clash.code, 'port_clash');
    assert.match(clash.message, /same port/);
    m.setLanguage('ko');
    assert.match(m.validate(normalize({})).message, /공유 폴더/);
  });

  test('idle snapshot, stop() is a no-op, start() refuses bad settings, start/stop emit updates and log keys', async () => {
    const log = new Log(null);
    const keys = [];
    log.on('line', (l) => { if (l.key) keys.push(l.key); });
    const m = new ServerManager({ log, configDir: path.join(tmp, 'mgr'), lang: 'en' });
    assert.deepEqual(m.snapshot(), { state: { running: false, starting: false, startedAt: 0, protocols: [], bind: '' }, stats: { clients: 0, totalClients: 0, uploads: 0, uploadBytes: 0, downloads: 0, downloadBytes: 0 } });
    assert.deepEqual(await m.stop(), m.snapshot());
    assert.equal(keys.includes('server_stopped'), false);              // nothing was running
    await assert.rejects(m.start(normalize({})), (e) => e.code === 'no_shares');
    assert.equal(keys.includes('server_start_failed'), false);         // validation failures do not reach the log
    const updates = [];
    m.on('update', (s) => updates.push(s.state.running));
    const port = await freePort();
    const s = normalize({ sharedFolders: [{ virtualName: 'd', physicalPath: shareA }, { virtualName: 'g', physicalPath: path.join(tmp, 'gone') }], protocols: { enableFtp: true, ftpPort: port }, bindAddress: '127.0.0.1' });
    const snap = await m.start(s);
    assert.equal(snap.state.running, true);
    assert.ok(snap.state.startedAt > 0);
    assert.equal(snap.state.bind, '127.0.0.1');
    assert.deepEqual(snap.state.protocols, [{ proto: 'FTP', port, clients: 0, total: 0 }]);
    assert.deepEqual(await m.start(s), m.snapshot());                  // already running → same snapshot
    await new Promise((r) => setTimeout(r, 100));                       // let the throttled 'update' through
    for (const k of ['server_starting', 'share_skipped', 'ftp_started', 'server_started']) assert.ok(keys.includes(k), k);
    m.setLanguage('ko');
    const stopped = await m.stop();
    assert.equal(stopped.state.running, false);
    assert.equal(stopped.state.startedAt, 0);
    assert.ok(keys.includes('server_stopped'));
    assert.equal(log.lines.at(-1).text, render('ko', 'server_stopped'));
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(updates.includes(true) && updates.at(-1) === false);
  });
});

describe('API', () => {
  test('info, settings round trip, validation, poll, errors', async () => {
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

  test('language, log methods, profiles, host key + certificate, unsupported host features', async () => {
    const cfg = path.join(tmp, 'api2');
    const api = createApi({ name: 'test', configDir: cfg });
    assert.deepEqual(await api.call('app.setLanguage', { lang: 'en' }), { lang: 'en' });
    await api.call('settings.save', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }] } });
    assert.match((await api.call('log.text')).text, /Settings saved/);
    const out = path.join(cfg, 'export.log');
    assert.deepEqual(await api.call('log.save', { path: out }), { path: out });
    assert.match(fs.readFileSync(out, 'utf-8'), /Settings saved/);
    await assert.rejects(api.call('log.save', {}), (e) => e.code === 'EINVAL');
    await api.call('log.clear');
    assert.equal((await api.call('log.lines', { seq: 0 })).lines.length, 0);

    // Profiles: save → list → load (becomes the current settings) → delete.
    await api.call('profiles.save', { name: 'Lab', settings: { sharedFolders: [{ virtualName: 'lab', physicalPath: shareB }], allowAnonymous: false } });
    assert.deepEqual((await api.call('profiles.list')).profiles, ['Lab']);
    await api.call('settings.save', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }] } });
    const loaded = await api.call('profiles.load', { name: 'Lab' });
    assert.equal(loaded.sharedFolders[0].virtualName, 'lab');
    assert.equal((await api.call('settings.get')).allowAnonymous, false);
    assert.equal((await api.call('settings.reload')).sharedFolders[0].virtualName, 'lab');
    assert.deepEqual((await api.call('profiles.delete', { name: 'Lab' })).profiles, []);
    await assert.rejects(api.call('profiles.load', { name: 'Lab' }), /ENOENT/);

    // Host key and certificate through the API.
    assert.equal((await api.call('hostkey.info', {})).exists, false);
    const gen = await api.call('hostkey.generate', {});
    assert.equal(gen.path, path.join(cfg, 'ssh_host_rsa.pem'));
    assert.match(gen.fingerprint, /^SHA256:/);
    assert.equal((await api.call('hostkey.info', { path: gen.path })).fingerprint, gen.fingerprint);
    const cert = await api.call('cert.generate', { commonName: 'box', validityYears: 1 });
    assert.equal(cert.certPath, path.join(cfg, 'server_cert.pem'));
    assert.equal((await api.call('cert.inspect', { path: cert.certPath })).subject, 'CN=box');
    assert.equal((await api.call('settings.validate', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }], protocols: { enableFtps: true }, certPath: cert.certPath } })).ok, true);

    // Local FS + session + features the web host lacks.
    assert.equal((await api.call('local.stat', { path: shareA })).isDir, true);
    assert.equal((await api.call('session.save', { patch: { theme: 'nord' } })).theme, 'nord');
    assert.equal((await api.call('session.load')).theme, 'nord');
    await assert.rejects(api.call('host.pickFolder', {}), (e) => e.code === 'UNSUPPORTED');
    await assert.rejects(api.call('host.reveal', { path: shareA }), (e) => e.code === 'UNSUPPORTED');
    assert.deepEqual(await api.call('clipboard.write', { text: 'x' }), { ok: true });   // no clipboard → silently ignored
    const info = await api.call('app.info');
    assert.deepEqual(info.capabilities, { pickFolder: false, pickFile: false, saveFile: false, reveal: false, open: false, clipboard: false });
    await api.shutdown();
  });

  test('method table, quiet save, addresses, local FS methods, serializeError shapes', async () => {
    const api = createApi({ name: 'test', configDir: path.join(tmp, 'api3') });
    for (const m of ['app.info', 'app.setLanguage', 'app.addresses', 'settings.get', 'settings.save', 'settings.reload', 'settings.validate', 'profiles.list', 'profiles.save', 'profiles.load', 'profiles.delete', 'server.state', 'server.start', 'server.stop', 'server.poll', 'log.lines', 'log.clear', 'log.text', 'log.save', 'cert.generate', 'cert.inspect', 'hostkey.info', 'hostkey.generate', 'local.roots', 'local.list', 'local.mkdir', 'local.stat', 'host.pickFolder', 'host.pickFile', 'host.saveFile', 'host.reveal', 'host.open', 'clipboard.write', 'session.load', 'session.save']) assert.ok(api.methods.includes(m), m);
    const before = api.log.seq;
    await api.call('settings.save', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }] }, quiet: true });
    assert.equal(api.log.seq, before);                                 // quiet: nothing logged
    await api.call('settings.save', { settings: { sharedFolders: [{ virtualName: 'd', physicalPath: shareA }] } });
    assert.equal(api.log.seq, before + 1);
    assert.ok(Array.isArray((await api.call('app.addresses')).addresses));
    assert.ok((await api.call('local.roots')).roots.length >= 1);
    const listed = await api.call('local.list', { path: shareA, filesToo: true, extensions: ['.txt'] });
    assert.deepEqual(listed.entries.map((e) => e.name), ['sub', 'hello.txt']);
    const made = await api.call('local.mkdir', { dir: shareA, name: 'viaapi' });
    assert.equal((await api.call('local.stat', { path: made.path })).isDir, true);
    fs.rmSync(made.path, { recursive: true });
    assert.equal((await api.call('server.state')).state.running, false);
    assert.equal((await api.call('server.stop')).state.running, false);
    await assert.rejects(api.call('host.pickFile', {}), (e) => e.code === 'UNSUPPORTED');
    await assert.rejects(api.call('host.saveFile', {}), (e) => e.code === 'UNSUPPORTED');
    await assert.rejects(api.call('host.open', { path: shareA }), (e) => e.code === 'UNSUPPORTED');
    await assert.rejects(api.call('local.list', { path: path.join(tmp, 'nope') }), /ENOENT/);
    assert.deepEqual(serializeError(null), { code: 'UNKNOWN', message: 'Unknown error' });
    assert.equal(serializeError(new Error('plain')).code, 'ERROR');
    assert.equal(serializeError('str').message, 'str');
    assert.equal(serializeError(Object.assign(new Error('p'), { path: '/x' })).path, '/x');
    await api.shutdown();
  });

  test('host callbacks are used when provided (desktop capabilities)', async () => {
    const calls = [];
    const api = createApi({
      name: 'electron', version: '9.9', buildInfo: { commit: 'abc' }, configDir: path.join(tmp, 'api4'),
      pickFolder: async (o) => { calls.push(['folder', o.title]); return 'C:\\picked'; },
      pickFile: async () => null,
      saveFile: async (o) => o.defaultPath,
      openPath: async (p) => (p === 'bad' ? 'cannot open' : ''),
      revealPath: async (p) => { calls.push(['reveal', p]); },
      clipboard: { readText: () => 'clip', writeText: (t) => calls.push(['clip', t]) },
    });
    const info = await api.call('app.info');
    assert.equal(info.version, '9.9');
    assert.equal(info.host, 'electron');
    assert.deepEqual(info.buildInfo, { commit: 'abc' });
    assert.deepEqual(info.capabilities, { pickFolder: true, pickFile: true, saveFile: true, reveal: true, open: true, clipboard: true });
    assert.deepEqual(await api.call('host.pickFolder', { title: 'T' }), { path: 'C:\\picked' });
    assert.deepEqual(await api.call('host.pickFile', {}), { path: null });
    assert.deepEqual(await api.call('host.saveFile', { defaultPath: 'x.log' }), { path: 'x.log' });
    assert.deepEqual(await api.call('host.open', { path: 'ok' }), { ok: true });
    await assert.rejects(api.call('host.open', { path: 'bad' }), /cannot open/);
    assert.deepEqual(await api.call('host.reveal', { path: 'p' }), { ok: true });
    await api.call('clipboard.write', { text: 'hello' });
    await api.call('clipboard.write', {});
    assert.deepEqual(calls, [['folder', 'T'], ['reveal', 'p'], ['clip', 'hello'], ['clip', '']]);
    await api.shutdown();
  });
});

describe('UI format helpers', () => {
  test('formatSize, formatUptime, time stamps', () => {
    assert.equal(formatSize(0), '0 B');
    assert.equal(formatSize(1023), '1023 B');
    assert.equal(formatSize(1536), '1.5 KB');
    assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB');
    assert.equal(formatSize(3 * 1024 ** 3), '3.00 GB');
    assert.equal(formatSize(NaN), '');
    assert.equal(formatSize(undefined), '');
    assert.equal(formatUptime(0), '');
    assert.equal(formatUptime(Date.now() - 65_000), '00:01:05');
    assert.match(formatUptime(Date.now() - 2 * 86_400_000 - 3_600_000), /^2d 01:00:0\d$/);
    assert.equal(formatUptime(Date.now() + 10_000), '00:00:00');    // clock skew never goes negative
    assert.equal(timeStamp(new Date(2024, 0, 1, 9, 8, 7).getTime()), '09:08:07');
    assert.equal(fileStamp(new Date(2024, 11, 31, 23, 59, 58)), '20241231_235958');
  });

  test('baseName / dirName / joinPath on Windows and POSIX paths, permSummary', () => {
    assert.equal(baseName('C:\\a\\b\\'), 'b');
    assert.equal(baseName('/x/y/z.txt'), 'z.txt');
    assert.equal(baseName('name'), 'name');
    assert.equal(baseName(''), '');
    assert.equal(baseName(null), '');
    assert.equal(dirName('C:\\a\\b'), 'C:\\a');
    assert.equal(dirName('C:\\a'), 'C:\\');
    assert.equal(dirName('/x/y'), '/x');
    assert.equal(dirName('/x'), '/');
    assert.equal(dirName('name'), '');
    assert.equal(joinPath('', 'f', '\\'), 'f');
    assert.equal(joinPath('C:\\a', 'f', '\\'), 'C:\\a\\f');
    assert.equal(joinPath('C:\\a\\', 'f', '\\'), 'C:\\a\\f');
    assert.equal(joinPath('/x/', 'f', '/'), '/x/f');
    assert.equal(joinPath('/x', 'f', '/'), '/x/f');
    const tr = (k) => k;
    assert.equal(permSummary({ canRead: true, canWrite: true }, tr), 'perm_rw');
    assert.equal(permSummary({ canRead: true }, tr), 'perm_r');
    assert.equal(permSummary({ canWrite: true }, tr), 'perm_w');
    assert.equal(permSummary({}, tr), 'perm_none');
  });
});
