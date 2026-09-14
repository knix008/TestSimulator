// SFTP round trip against the in-process test server (test/sftp-server.mjs):
// the pipelined download/upload in core/remote.js, folders, conflicts,
// cancel, mkdir / rename / delete.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startSftpServer } from './sftp-server.mjs';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-sftp-'));
const serverRoot = path.join(tmp, 'server');
const localRoot = path.join(tmp, 'local');
fs.mkdirSync(serverRoot, { recursive: true });
fs.mkdirSync(localRoot, { recursive: true });

let sftp;
let api;
let id;

before(async () => {
  sftp = await startSftpServer({ root: serverRoot });
  api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'config') });
});

after(async () => {
  await api.shutdown();
  await sftp.close();
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

test('sftp: wrong password fails, right one connects (default port applies when blank)', async () => {
  const bad = await waitJob(await api.call('remote.connect', { protocol: 'SFTP', host: '127.0.0.1', port: sftp.port, user: sftp.user, password: 'nope' }));
  assert.equal(bad.status, 'error');
  assert.match(bad.error, /authentication/i);
  const ok = await waitJob(await api.call('remote.connect', { protocol: 'sftp', host: '127.0.0.1', port: String(sftp.port), user: sftp.user, password: sftp.password }));
  assert.equal(ok.status, 'done', ok.error);
  assert.equal(ok.result.protocol, 'SFTP');
  id = ok.result.id;
});

test('sftp: listing with sizes and dates', async () => {
  fs.mkdirSync(path.join(serverRoot, 'dir'));
  fs.writeFileSync(path.join(serverRoot, 'file.bin'), Buffer.alloc(12345, 9));
  const l = await api.call('remote.list', { id, path: '/' });
  assert.deepEqual(l.entries.map((e) => [e.name, e.isDir, e.size]), [['dir', true, 0], ['file.bin', false, 12345]]);
  assert.ok(l.entries[1].mtime > 0);
});

test('sftp: pipelined download and upload of large + empty files, folder trees', async () => {
  // > SFTP_CHUNK * SFTP_CONCURRENCY so several pipeline rounds happen.
  const big = Buffer.alloc(5 * 1024 * 1024 + 123);
  for (let i = 0; i < big.length; i += 4096) big.writeUInt32LE(i, i);
  fs.mkdirSync(path.join(serverRoot, 'dir', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(serverRoot, 'dir', 'big.bin'), big);
  fs.writeFileSync(path.join(serverRoot, 'dir', 'sub', 'empty.txt'), '');
  fs.writeFileSync(path.join(serverRoot, 'dir', 'sub', 'small.txt'), 'small');

  const down = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/dir', isDir: true }], localDir: localRoot }));
  assert.equal(down.status, 'done', down.error);
  assert.equal(down.total, 3);
  assert.equal(down.bytes, big.length + 5);
  assert.ok(fs.readFileSync(path.join(localRoot, 'dir', 'big.bin')).equals(big), 'downloaded bytes identical');
  assert.equal(fs.statSync(path.join(localRoot, 'dir', 'sub', 'empty.txt')).size, 0);

  fs.renameSync(path.join(localRoot, 'dir'), path.join(localRoot, 'copy'));
  const up = await waitJob(await api.call('transfer.upload', { id, items: [{ path: path.join(localRoot, 'copy'), isDir: true }], remoteDir: '/' }));
  assert.equal(up.status, 'done', up.error);
  assert.equal(up.current, 3);
  assert.ok(fs.readFileSync(path.join(serverRoot, 'copy', 'big.bin')).equals(big), 'uploaded bytes identical');
  assert.equal(fs.statSync(path.join(serverRoot, 'copy', 'sub', 'empty.txt')).size, 0);
});

test('sftp: conflict skip / overwrite, cancel mid-transfer keeps the session', async () => {
  fs.writeFileSync(path.join(localRoot, 'file.bin'), 'old');
  const skip = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/file.bin', isDir: false }], localDir: localRoot }), () => ({ answer: 'skip' }));
  assert.equal(skip.result.skipped, 1);
  assert.equal(fs.readFileSync(path.join(localRoot, 'file.bin'), 'utf8'), 'old');
  const over = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/file.bin', isDir: false }], localDir: localRoot }), () => ({ answer: 'overwrite' }));
  assert.equal(over.status, 'done', over.error);
  assert.equal(fs.statSync(path.join(localRoot, 'file.bin')).size, 12345);

  fs.writeFileSync(path.join(serverRoot, 'huge.bin'), Buffer.alloc(60 * 1024 * 1024, 1));
  const snap = await api.call('transfer.download', { id, items: [{ path: '/huge.bin', isDir: false }], localDir: localRoot });
  await new Promise((r) => setTimeout(r, 40));
  await api.call('jobs.cancel', { id: snap.id });
  const s = await waitJob(snap);
  assert.equal(s.status, 'cancelled');
  assert.ok(s.bytes < 60 * 1024 * 1024, 'stopped early');
  const l = await api.call('remote.list', { id, path: '/' });
  assert.ok(l.entries.some((e) => e.name === 'huge.bin'), 'connection still usable');
});

test('sftp: mkdir / rename / delete tree, then disconnect', async () => {
  await api.call('remote.mkdir', { id, dir: '/', name: 'made' });
  await api.call('remote.rename', { id, path: '/made', newName: 'moved' });
  assert.ok(fs.existsSync(path.join(serverRoot, 'moved')));
  const del = await waitJob(await api.call('remote.delete', { id, items: [{ path: '/copy', isDir: true }, { path: '/moved', isDir: true }, { path: '/huge.bin', isDir: false }] }));
  assert.equal(del.status, 'done', del.error);
  assert.ok(!fs.existsSync(path.join(serverRoot, 'copy')));
  assert.ok(!fs.existsSync(path.join(serverRoot, 'huge.bin')));
  assert.equal((await api.call('remote.disconnect', { id })).ok, true);
  await assert.rejects(api.call('remote.list', { id, path: '/' }), (e) => e.code === 'NOT_CONNECTED');
});
