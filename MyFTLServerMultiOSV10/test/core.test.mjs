// Core units: virtual file system, authentication, settings / profiles,
// certificates, host keys, the API table (no sockets here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { VirtualFileSystem, normalizePath } = require('../core/vfs');
const { authenticate, permissionSummary } = require('../core/auth');
const { Settings, normalize, toFile } = require('../core/settings');
const { generateSelfSigned, writeSelfSigned, loadCertificate, inspectCertificate } = require('../core/x509');
const hostkey = require('../core/hostkey');
const { createApi, serializeError } = require('../core/api');
const { Log } = require('../core/log');
const { render } = require('../core/messages');
const { Session } = require('../core/session');
const { ServerManager } = require('../core/manager');
const local = require('../core/local');

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

test('vfs: list of a file, skipped shares, trimmed names', () => {
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

test('settings normalize: clamps, trimming, dropped entries', () => {
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

test('Session: defaults, patch, persistence', () => {
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

test('messages: templates in both languages, unknown keys verbatim', () => {
  assert.equal(render('ko', 'listen_in_use', { proto: 'FTP', port: 21 }).includes('FTP 포트 21'), true);
  assert.match(render('en', 'listen_in_use', { proto: 'FTP', port: 21 }), /FTP port 21 is already in use/);
  assert.equal(render('en', 'not_a_key', {}), 'not_a_key');
  assert.equal(render('xx', 'allow'), '허용');   // unknown language → Korean
});

test('Log: ring buffer, sequence polling, file gets events but not traces', () => {
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

test('local: roots, folder listing (folders first, extension filter), mkdir, stat', async () => {
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

test('x509: SAN + validity, explicit key file, missing key is a clear error', () => {
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

test('hostkey: unreadable key reports an error instead of throwing', () => {
  const bad = path.join(tmp, 'bad.pem');
  fs.writeFileSync(bad, 'garbage');
  const info = hostkey.inspectKey(bad);
  assert.equal(info.exists, true);
  assert.ok(info.error);
});

test('api: language, log methods, profiles, host key + certificate, unsupported host features', async () => {
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
