// Core tests: profiles + session persistence, the local file-system layer and
// a full FTP round trip against the in-process test server (test/ftp-server.mjs).
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
const { Profiles, hide, reveal } = require('../core/profiles');
const local = require('../core/local');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-test-'));
const serverRoot = path.join(tmp, 'server');
const localRoot = path.join(tmp, 'local');
const configDir = path.join(tmp, 'config');
fs.mkdirSync(serverRoot, { recursive: true });
fs.mkdirSync(localRoot, { recursive: true });

let ftp;
let api;

before(async () => {
  ftp = await startFtpServer({ root: serverRoot });
  api = createApi({ name: 'test', version: '0.0.0', configDir });
});

after(async () => {
  await api.shutdown();
  await ftp.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Follows a job until it finishes; `onConflict` answers conflict questions.
async function waitJob(snap, onConflict) {
  let s = snap;
  for (let i = 0; i < 2000 && s.status === 'running'; i++) {
    if (s.conflict && onConflict) {
      const { answer, applyAll } = onConflict(s.conflict);
      await api.call('jobs.resolveConflict', { id: s.id, answer, applyAll });
    }
    await new Promise((r) => setTimeout(r, 10));
    s = await api.call('jobs.get', { id: s.id });
  }
  return s;
}

test('profiles: save / replace / delete, password obfuscated on disk', async () => {
  const p = new Profiles(configDir);
  p.load();
  assert.equal(p.list().length, 0);
  p.save({ name: 'a', protocol: 'sftp', host: 'h', port: '22', user: 'u', password: 'pw' });
  p.save({ name: 'b', protocol: 'FTP', host: 'h2', port: '', user: '', password: '' });
  const r = p.save({ name: 'a', protocol: 'FTPS', host: 'h3', port: '990', user: 'u', password: 'pw2' });
  assert.equal(r.replaced, true);
  assert.equal(p.list().length, 2);
  assert.equal(p.list()[0].protocol, 'FTPS');
  const raw = JSON.parse(fs.readFileSync(path.join(configDir, 'profiles.json'), 'utf-8'));
  assert.ok(raw[0].password.startsWith('b64:'));
  assert.equal(reveal(raw[0].password), 'pw2');
  assert.equal(reveal(hide('한글')), '한글');
  assert.equal(reveal('plain'), 'plain');   // a file from an earlier build
  const p2 = new Profiles(configDir);
  p2.load();
  assert.equal(p2.list().find((x) => x.name === 'a').password, 'pw2');
  assert.equal(p2.remove(['a', 'zzz']).removed, 1);
  assert.equal(p2.list().length, 1);
});

test('session: defaults, save, missing folder falls back to home', async () => {
  const s = await api.call('session.load');
  assert.equal(s.language, 'ko');
  assert.equal(s.lastLocalPath, os.homedir());
  await api.call('session.save', { patch: { lastLocalPath: localRoot, language: 'en' } });
  const s2 = await api.call('session.load');
  assert.equal(s2.lastLocalPath, localRoot);
  assert.equal(s2.language, 'en');
  await api.call('session.save', { patch: { lastLocalPath: path.join(tmp, 'gone') } });
  assert.equal((await api.call('session.load')).lastLocalPath, os.homedir());
});

test('local: roots, listing order, mkdir / rename / delete', async () => {
  const { roots } = await api.call('local.roots');
  assert.ok(roots.length >= 1);
  assert.ok(roots.every((r) => r.isDir && r.path && r.name));
  fs.writeFileSync(path.join(localRoot, 'b.txt'), 'bb');
  fs.writeFileSync(path.join(localRoot, 'A.txt'), 'a');
  fs.mkdirSync(path.join(localRoot, 'zdir'));
  const { entries } = await api.call('local.list', { path: localRoot });
  assert.deepEqual(entries.map((e) => e.name), ['zdir', 'A.txt', 'b.txt']);
  assert.equal(entries[2].size, 2);
  const { path: made } = await api.call('local.mkdir', { dir: localRoot, name: 'new' });
  assert.ok(fs.existsSync(made));
  await assert.rejects(api.call('local.mkdir', { dir: localRoot, name: 'new' }), /already exists/);
  await assert.rejects(api.call('local.mkdir', { dir: localRoot, name: 'a/b' }), /Invalid name/);
  const { path: renamed } = await api.call('local.rename', { path: made, newName: 'renamed' });
  assert.ok(fs.existsSync(renamed));
  await api.call('local.delete', { paths: [renamed, path.join(localRoot, 'zdir')] });
  assert.ok(!fs.existsSync(renamed));
  assert.equal((await local.exists(path.join(localRoot, 'zdir'))).exists, false);
});

test('ftp: connect job, bad password, listing', async () => {
  const bad = await waitJob(await api.call('remote.connect', { protocol: 'FTP', host: '127.0.0.1', port: ftp.port, user: 'test', password: 'wrong' }));
  assert.equal(bad.status, 'error');
  assert.match(bad.error, /Login incorrect/);

  const snap = await api.call('remote.connect', { protocol: 'FTP', host: '127.0.0.1', port: ftp.port, user: ftp.user, password: ftp.password });
  const done = await waitJob(snap);
  assert.equal(done.status, 'done', done.error);
  const id = done.result.id;
  assert.equal(done.result.protocol, 'FTP');

  fs.mkdirSync(path.join(serverRoot, 'pub'));
  fs.writeFileSync(path.join(serverRoot, 'pub', 'readme.txt'), 'hello');
  fs.writeFileSync(path.join(serverRoot, 'root.bin'), Buffer.alloc(1000, 1));
  const l = await api.call('remote.list', { id, path: '/' });
  assert.equal(l.parent, null);
  assert.deepEqual(l.entries.map((e) => [e.name, e.isDir, e.size]), [['pub', true, 0], ['root.bin', false, 1000]]);
  const sub = await api.call('remote.list', { id, path: '/pub' });
  assert.equal(sub.parent, '/');
  assert.equal(sub.entries[0].name, 'readme.txt');
  assert.ok(sub.entries[0].mtime > 0, 'MLSD gives a date');
  globalThis.__id = id;
});

test('ftp: upload a folder tree with progress, then download it back', async () => {
  const id = globalThis.__id;
  const src = path.join(localRoot, 'tree');
  fs.mkdirSync(path.join(src, 'sub', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(src, 'one.txt'), 'one');
  fs.writeFileSync(path.join(src, 'sub', 'big.bin'), Buffer.alloc(300_000, 7));
  fs.writeFileSync(path.join(src, 'sub', 'deep', 'empty.txt'), '');

  const up = await waitJob(await api.call('transfer.upload', { id, items: [{ path: src, isDir: true }, { path: path.join(localRoot, 'A.txt'), isDir: false }], remoteDir: '/pub' }));
  assert.equal(up.status, 'done', up.error);
  assert.equal(up.total, 4);
  assert.equal(up.current, 4);
  assert.equal(up.bytes, 300_004);
  assert.equal(up.bytesTotal, 300_004);
  assert.equal(fs.readFileSync(path.join(serverRoot, 'pub', 'tree', 'sub', 'big.bin')).length, 300_000);
  assert.equal(fs.readFileSync(path.join(serverRoot, 'pub', 'A.txt'), 'utf8'), 'a');
  assert.ok(fs.existsSync(path.join(serverRoot, 'pub', 'tree', 'sub', 'deep', 'empty.txt')));

  const dest = path.join(localRoot, 'down');
  fs.mkdirSync(dest);
  const down = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/pub/tree', isDir: true }, { path: '/root.bin', isDir: false, size: 1000 }], localDir: dest }));
  assert.equal(down.status, 'done', down.error);
  assert.equal(down.result.done, 4);
  assert.equal(down.bytes, 301_003);
  assert.equal(fs.readFileSync(path.join(dest, 'tree', 'sub', 'big.bin')).length, 300_000);
  assert.equal(fs.readFileSync(path.join(dest, 'root.bin')).length, 1000);
});

test('ftp: conflicts — skip, overwrite (apply to all), cancel', async () => {
  const id = globalThis.__id;
  const dest = path.join(localRoot, 'down');
  fs.writeFileSync(path.join(dest, 'root.bin'), 'stale');

  const skip = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/root.bin', isDir: false }], localDir: dest }), () => ({ answer: 'skip' }));
  assert.equal(skip.status, 'done');
  assert.equal(skip.result.skipped, 1);
  assert.equal(fs.readFileSync(path.join(dest, 'root.bin'), 'utf8'), 'stale');

  let asked = 0;
  const over = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/root.bin', isDir: false }, { path: '/pub/tree', isDir: true }], localDir: dest }), () => { asked++; return { answer: 'overwrite', applyAll: true }; });
  assert.equal(over.status, 'done', over.error);
  assert.equal(asked, 1, 'apply-to-all answers the rest');
  assert.equal(fs.readFileSync(path.join(dest, 'root.bin')).length, 1000);

  const cancel = await waitJob(await api.call('transfer.upload', { id, items: [{ path: path.join(localRoot, 'A.txt'), isDir: false }], remoteDir: '/pub' }), () => ({ answer: 'cancel' }));
  assert.equal(cancel.status, 'cancelled');
});

test('ftp: mkdir / rename / delete on the server', async () => {
  const id = globalThis.__id;
  await api.call('remote.mkdir', { id, dir: '/pub', name: 'made' });
  assert.ok(fs.existsSync(path.join(serverRoot, 'pub', 'made')));
  await assert.rejects(api.call('remote.mkdir', { id, dir: '/pub', name: 'x/y' }), /Invalid name/);
  await api.call('remote.rename', { id, path: '/pub/made', newName: 'moved' });
  assert.ok(fs.existsSync(path.join(serverRoot, 'pub', 'moved')));
  const del = await waitJob(await api.call('remote.delete', { id, items: [{ path: '/pub/tree', isDir: true }, { path: '/pub/moved', isDir: true }, { path: '/pub/A.txt', isDir: false }] }));
  assert.equal(del.status, 'done', del.error);
  assert.ok(!fs.existsSync(path.join(serverRoot, 'pub', 'tree')));
  assert.ok(!fs.existsSync(path.join(serverRoot, 'pub', 'A.txt')));
  const l = await api.call('remote.list', { id, path: '/pub' });
  assert.deepEqual(l.entries.map((e) => e.name), ['readme.txt']);
});

test('ftp: cancelling a transfer keeps the session usable', async () => {
  const id = globalThis.__id;
  fs.writeFileSync(path.join(serverRoot, 'huge.bin'), Buffer.alloc(40 * 1024 * 1024, 3));
  const dest = path.join(localRoot, 'down');
  const snap = await api.call('transfer.download', { id, items: [{ path: '/huge.bin', isDir: false }], localDir: dest });
  await new Promise((r) => setTimeout(r, 30));
  await api.call('jobs.cancel', { id: snap.id });
  const s = await waitJob(snap);
  assert.equal(s.status, 'cancelled');
  // The control connection was reopened behind the scenes.
  const l = await api.call('remote.list', { id, path: '/' });
  assert.ok(l.entries.some((e) => e.name === 'huge.bin'));
  fs.unlinkSync(path.join(serverRoot, 'huge.bin'));
});

test('ftp: disconnect, then calls fail with NOT_CONNECTED', async () => {
  const id = globalThis.__id;
  assert.equal((await api.call('remote.disconnect', { id })).ok, true);
  await assert.rejects(api.call('remote.list', { id, path: '/' }), (e) => e.code === 'NOT_CONNECTED');
  await assert.rejects(api.call('remote.connect', { protocol: 'FTP', host: '' }), /Host is required/);
});

test('connect: unreachable host reports an error, cancel aborts', async () => {
  // Port 1 on loopback: refused immediately.
  const refused = await waitJob(await api.call('remote.connect', { protocol: 'SFTP', host: '127.0.0.1', port: 1, user: 'u', password: 'p' }));
  assert.equal(refused.status, 'error');
  assert.match(refused.error, /ECONNREFUSED|refused|closed/i);
  const snap = await api.call('remote.connect', { protocol: 'SFTP', host: '10.255.255.1', port: 22, user: 'u', password: 'p' });
  await api.call('jobs.cancel', { id: snap.id });
  const s = await waitJob(snap);
  assert.equal(s.status, 'cancelled');
});

test('history: every successful connection is remembered without a profile, newest first, no password', async () => {
  const ok = await waitJob(await api.call('remote.connect', { protocol: 'FTP', host: '127.0.0.1', port: ftp.port, user: ftp.user, password: ftp.password }));
  assert.equal(ok.status, 'done', ok.error);
  await api.call('remote.disconnect', { id: ok.result.id });
  const again = await waitJob(await api.call('remote.connect', { protocol: 'ftp', host: `ftp://127.0.0.1:${ftp.port}/`, user: ftp.user, password: ftp.password }));
  assert.equal(again.status, 'done', again.error);
  await api.call('remote.disconnect', { id: again.result.id });
  const { history } = await api.call('history.list');
  const mine = history.filter((h) => h.port === ftp.port);
  assert.equal(mine.length, 1, 'same server collapses into one entry');
  assert.ok(mine[0].count >= 2);
  assert.equal(history[0].host, '127.0.0.1');
  assert.equal(history[0].user, ftp.user);
  assert.equal(history[0].password, undefined);
  const raw = JSON.parse(fs.readFileSync(path.join(configDir, 'history.json'), 'utf-8'));
  assert.ok(!JSON.stringify(raw).includes(ftp.password), 'password never written');
  // A failed connection is not recorded.
  await waitJob(await api.call('remote.connect', { protocol: 'FTP', host: '127.0.0.1', port: ftp.port, user: 'nobody', password: 'x' }));
  assert.ok(!(await api.call('history.list')).history.some((h) => h.user === 'nobody'));
  const del = await api.call('history.delete', { entry: mine[0] });
  assert.ok(!del.history.some((h) => h.port === ftp.port));
  assert.deepEqual((await api.call('history.clear')).history, []);
});

test('transfer notes: one record per file (done or skipped) rides in the snapshot', async () => {
  const ok = await waitJob(await api.call('remote.connect', { protocol: 'FTP', host: '127.0.0.1', port: ftp.port, user: ftp.user, password: ftp.password }));
  const id = ok.result.id;
  fs.mkdirSync(path.join(serverRoot, 'notes', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(serverRoot, 'notes', 'a.txt'), 'aaa');
  fs.writeFileSync(path.join(serverRoot, 'notes', 'sub', 'b.bin'), Buffer.alloc(2048, 1));
  const dest = path.join(localRoot, 'notes-dl');
  fs.mkdirSync(path.join(dest, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'notes', 'a.txt'), 'old');
  const snap = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/notes', isDir: true }], localDir: dest }), () => ({ answer: 'skip' }));
  assert.equal(snap.status, 'done', snap.error);
  const notes = snap.notes.filter((n) => n.type === 'file');
  assert.deepEqual(notes.map((n) => [n.dir, n.src, n.size, n.skipped]), [['download', '/notes/a.txt', 3, true], ['download', '/notes/sub/b.bin', 2048, false]]);
  assert.deepEqual(notes.map((n) => n.seq), [1, 2]);
  assert.ok(notes[1].ms >= 0 && notes[1].dest.endsWith(path.join('notes', 'sub', 'b.bin')));
  await api.call('remote.disconnect', { id });
});
