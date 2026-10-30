// Copy · cut · paste and drag between the panels: local → local copy / move,
// server → server move (rename, folders merged) and copy (through a temporary
// folder), cut & paste across the two sides (upload / download, then the
// source goes), on FTP and SFTP.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFtpServer } from './ftp-server.mjs';
import { startSftpServer } from './sftp-server.mjs';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api');
const { uniqueName } = require('../core/transfer');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-copymove-'));
const localRoot = path.join(tmp, 'local');
fs.mkdirSync(localRoot, { recursive: true });

let api;
const servers = {};

before(async () => {
  api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'config') });
  for (const protocol of ['FTP', 'SFTP']) {
    const root = path.join(tmp, `server-${protocol}`);
    fs.mkdirSync(root, { recursive: true });
    const srv = protocol === 'FTP' ? await startFtpServer({ root }) : await startSftpServer({ root });
    const ok = await waitJob(await api.call('remote.connect', { protocol, host: '127.0.0.1', port: srv.port, user: srv.user, password: srv.password }));
    assert.equal(ok.status, 'done', ok.error);
    servers[protocol] = { srv, root, id: ok.result.id };
  }
});

after(async () => {
  await api.shutdown();
  for (const s of Object.values(servers)) await s.srv.close();
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

function writeTree(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
}

const names = (dir) => fs.readdirSync(dir).sort();

test('uniqueName: a copy pasted into its own folder gets a free name', () => {
  assert.equal(uniqueName('a.txt', ['b.txt']), 'a.txt');
  assert.equal(uniqueName('a.txt', ['A.TXT']), 'a (2).txt');
  assert.equal(uniqueName('a.txt', ['a.txt', 'a (2).txt']), 'a (3).txt');
  assert.equal(uniqueName('v1.2', ['v1.2'], true), 'v1.2 (2)');
  assert.equal(uniqueName('.env', ['.env']), '.env (2)');
});

test('local: copy files and folders, keep the date, same folder makes "name (2)"', async () => {
  const src = path.join(localRoot, 'c-src');
  const dst = path.join(localRoot, 'c-dst');
  writeTree(src, { 'a.txt': 'a', 'tree/x.bin': Buffer.alloc(5000, 1), 'tree/deep/y.txt': 'y' });
  fs.mkdirSync(dst);
  const old = new Date('2020-01-02T03:04:05Z');
  fs.utimesSync(path.join(src, 'a.txt'), old, old);

  const s = await waitJob(await api.call('local.copy', { items: [{ path: path.join(src, 'a.txt'), isDir: false }, { path: path.join(src, 'tree'), isDir: true }], destDir: dst }));
  assert.equal(s.status, 'done', s.error);
  assert.equal(s.result.done, 3);
  assert.equal(s.bytesTotal, 5002);
  assert.deepEqual(names(dst), ['a.txt', 'tree']);
  assert.equal(fs.readFileSync(path.join(dst, 'tree', 'deep', 'y.txt'), 'utf8'), 'y');
  assert.equal(Math.round(fs.statSync(path.join(dst, 'a.txt')).mtimeMs / 1000), Math.round(old.getTime() / 1000));
  assert.ok(fs.existsSync(path.join(src, 'tree', 'x.bin')), 'a copy keeps the source');

  const twice = await waitJob(await api.call('local.copy', { items: [{ path: path.join(dst, 'a.txt'), isDir: false }, { path: path.join(dst, 'tree'), isDir: true }], destDir: dst }));
  assert.equal(twice.status, 'done', twice.error);
  assert.deepEqual(names(dst), ['a (2).txt', 'a.txt', 'tree', 'tree (2)']);
  assert.ok(fs.existsSync(path.join(dst, 'tree (2)', 'deep', 'y.txt')));
});

test('local: move renames, merges into an existing folder with conflicts, never into itself', async () => {
  const src = path.join(localRoot, 'm-src');
  const dst = path.join(localRoot, 'm-dst');
  writeTree(src, { 'one.txt': '1', 'box/a.txt': 'new-a', 'box/b.txt': 'b' });
  writeTree(dst, { 'box/a.txt': 'old-a' });

  let asked = 0;
  const s = await waitJob(await api.call('local.copy', { items: [{ path: path.join(src, 'one.txt'), isDir: false }, { path: path.join(src, 'box'), isDir: true }], destDir: dst, move: true }),
    (c) => { asked++; assert.equal(c.kind, 'move'); assert.equal(c.name, 'a.txt'); return { answer: 'skip' }; });
  assert.equal(s.status, 'done', s.error);
  assert.equal(asked, 1);
  assert.equal(fs.readFileSync(path.join(dst, 'one.txt'), 'utf8'), '1');
  assert.equal(fs.readFileSync(path.join(dst, 'box', 'a.txt'), 'utf8'), 'old-a', 'skipped');
  assert.equal(fs.readFileSync(path.join(dst, 'box', 'b.txt'), 'utf8'), 'b');
  assert.deepEqual(names(src), ['box'], 'moved files are gone, the folder with the skipped file stays');
  assert.deepEqual(names(path.join(src, 'box')), ['a.txt']);

  const into = await waitJob(await api.call('local.copy', { items: [{ path: dst, isDir: true }], destDir: path.join(dst, 'box'), move: true }));
  assert.equal(into.status, 'error');
  assert.match(into.error, /into itself/);
  const same = await waitJob(await api.call('local.copy', { items: [{ path: path.join(dst, 'one.txt'), isDir: false }], destDir: dst, move: true }));
  assert.equal(same.status, 'done');
  assert.ok(fs.existsSync(path.join(dst, 'one.txt')), 'moving into its own folder changes nothing');
});

for (const protocol of ['FTP', 'SFTP']) {
  test(`${protocol}: server move (rename) merges folders and asks on a file conflict`, async () => {
    const { root, id } = servers[protocol];
    writeTree(root, { 'mv/src/a.txt': 'a', 'mv/src/sub/b.txt': 'b', 'mv/dest/src/b0.txt': 'keep', 'mv/f.txt': 'new', 'mv/dest/f.txt': 'old', 'mv/g.txt': 'g' });
    let asked = 0;
    const s = await waitJob(await api.call('remote.move', { id, items: [{ path: '/mv/src', isDir: true }, { path: '/mv/f.txt', isDir: false }, { path: '/mv/g.txt', isDir: false }], destDir: '/mv/dest' }),
      (c) => { asked++; assert.equal(c.destPath, '/mv/dest/f.txt'); return { answer: 'overwrite' }; });
    assert.equal(s.status, 'done', s.error);
    assert.equal(asked, 1);
    assert.deepEqual(names(path.join(root, 'mv')), ['dest']);
    assert.deepEqual(names(path.join(root, 'mv', 'dest')), ['f.txt', 'g.txt', 'src']);
    assert.deepEqual(names(path.join(root, 'mv', 'dest', 'src')), ['a.txt', 'b0.txt', 'sub']);
    assert.equal(fs.readFileSync(path.join(root, 'mv', 'dest', 'f.txt'), 'utf8'), 'new');

    const into = await waitJob(await api.call('remote.move', { id, items: [{ path: '/mv/dest', isDir: true }], destDir: '/mv/dest/src' }));
    assert.equal(into.status, 'error');
    assert.match(into.error, /into itself/);
  });

  test(`${protocol}: server copy goes through a temp folder; into its own folder it is "name (2)"`, async () => {
    const { root, id } = servers[protocol];
    writeTree(root, { 'cp/doc.txt': 'doc', 'cp/dir/x.bin': Buffer.alloc(3000, 2), 'cp/out/.keep': '' });
    const s = await waitJob(await api.call('remote.copy', { id, items: [{ path: '/cp/doc.txt', isDir: false }, { path: '/cp/dir', isDir: true }], destDir: '/cp/out' }));
    assert.equal(s.status, 'done', s.error);
    assert.equal(s.result.done, 2);
    assert.equal(s.current, 2, 'progress restarts for the upload phase');
    assert.equal(fs.readFileSync(path.join(root, 'cp', 'out', 'dir', 'x.bin')).length, 3000);
    assert.ok(fs.existsSync(path.join(root, 'cp', 'doc.txt')), 'the source stays');
    assert.ok(!s.notes.some((n) => n.dir === 'download'), 'the temp download is not logged');

    const same = await waitJob(await api.call('remote.copy', { id, items: [{ path: '/cp/doc.txt', isDir: false }, { path: '/cp/dir', isDir: true }], destDir: '/cp' }));
    assert.equal(same.status, 'done', same.error);
    assert.deepEqual(names(path.join(root, 'cp')), ['dir', 'dir (2)', 'doc (2).txt', 'doc.txt', 'out']);
    assert.equal(fs.readFileSync(path.join(root, 'cp', 'dir (2)', 'x.bin')).length, 3000);
  });

  test(`${protocol}: cut & paste across the sides removes the source after the transfer`, async () => {
    const { root, id } = servers[protocol];
    writeTree(root, { 'cut/down/a.txt': 'a', 'cut/down/sub/b.txt': 'b', 'cut/up/.keep': '' });
    const dl = path.join(localRoot, `cut-${protocol}`);
    fs.mkdirSync(dl);
    const down = await waitJob(await api.call('transfer.download', { id, items: [{ path: '/cut/down', isDir: true }], localDir: dl, move: true }));
    assert.equal(down.status, 'done', down.error);
    assert.equal(fs.readFileSync(path.join(dl, 'down', 'sub', 'b.txt'), 'utf8'), 'b');
    assert.deepEqual(names(path.join(root, 'cut')), ['up'], 'the server folder went with its files');

    const up = await waitJob(await api.call('transfer.upload', { id, items: [{ path: path.join(dl, 'down'), isDir: true }], remoteDir: '/cut/up', move: true }));
    assert.equal(up.status, 'done', up.error);
    assert.equal(fs.readFileSync(path.join(root, 'cut', 'up', 'down', 'sub', 'b.txt'), 'utf8'), 'b');
    assert.deepEqual(names(dl), [], 'the local folder went too');
  });
}

test('drag temp: a fresh folder per drag under the app temp folder', async () => {
  const a = await api.call('local.dragTemp');
  const b = await api.call('local.dragTemp');
  assert.notEqual(a.path, b.path);
  assert.ok(fs.statSync(a.path).isDirectory());
  assert.equal(path.basename(path.dirname(a.path)), 'myftpclient-drag');
  fs.rmSync(a.path, { recursive: true }); fs.rmSync(b.path, { recursive: true });
});
