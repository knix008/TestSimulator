// File operations: listing, copy/move with conflicts, delete, search, rename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fsops = require('../core/fsops.js');
const { JobRegistry } = require('../core/jobs.js');
const { createApi } = require('../core/api.js');

function tmpdir(name) { return fs.mkdtempSync(path.join(os.tmpdir(), `cc-fs-${name}-`)); }

function waitJob(job) {
  return new Promise((resolve) => job.on('update', (s) => { if (s.status !== 'running') resolve(s); }));
}

test('listDirectory returns sorted-able entries with metadata', async () => {
  const root = tmpdir('list');
  fs.mkdirSync(path.join(root, 'dir'));
  fs.writeFileSync(path.join(root, 'b.txt'), 'hello');
  fs.writeFileSync(path.join(root, '.hidden'), 'x');
  const r = await fsops.listDirectory(root);
  assert.equal(r.path, path.resolve(root));
  assert.deepEqual(r.entries.map((e) => e.name).sort(), ['b.txt', 'dir']);
  const f = r.entries.find((e) => e.name === 'b.txt');
  assert.equal(f.size, 5);
  assert.equal(f.isDir, false);
  assert.equal(f.ext, '.txt');
  assert.match(f.date, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  const withHidden = await fsops.listDirectory(root, { showHidden: true });
  assert.equal(withHidden.entries.length, 3);
  fs.rmSync(root, { recursive: true, force: true });
});

test('copy asks about conflicts; skip / overwrite / apply-to-all', async () => {
  const root = tmpdir('copy');
  const src = path.join(root, 'src');
  const dst = path.join(root, 'dst');
  fs.mkdirSync(src); fs.mkdirSync(dst);
  fs.writeFileSync(path.join(src, 'a.txt'), 'new a');
  fs.writeFileSync(path.join(src, 'b.txt'), 'new b');
  fs.writeFileSync(path.join(src, 'c.txt'), 'new c');
  fs.writeFileSync(path.join(dst, 'a.txt'), 'old a');
  fs.writeFileSync(path.join(dst, 'b.txt'), 'old b');

  const jobs = new JobRegistry();
  const job = jobs.run('copy', {}, (j) => fsops.transfer([path.join(src, 'a.txt'), path.join(src, 'b.txt'), path.join(src, 'c.txt')], dst, { job: j }));
  const asked = [];
  job.on('update', (s) => {
    if (s.conflict) {
      asked.push(s.conflict.name);
      // first conflict: skip; second: overwrite + apply to all
      if (asked.length === 1) job.resolveConflict('skip', false);
      else job.resolveConflict('overwrite', true);
    }
  });
  const s = await waitJob(job);
  assert.equal(s.status, 'done');
  assert.deepEqual(asked, ['a.txt', 'b.txt']);
  assert.equal(fs.readFileSync(path.join(dst, 'a.txt'), 'utf8'), 'old a');
  assert.equal(fs.readFileSync(path.join(dst, 'b.txt'), 'utf8'), 'new b');
  assert.equal(fs.readFileSync(path.join(dst, 'c.txt'), 'utf8'), 'new c');
  assert.equal(s.result.copied, 2);
  assert.equal(s.result.skipped, 1);
  // Per-item results for undo: the skipped one is absent, the overwrite is flagged.
  assert.deepEqual(s.result.items.map((it) => [path.basename(it.dest), it.existed]), [['b.txt', true], ['c.txt', false]]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('move a directory tree and refuse moving into itself', async () => {
  const root = tmpdir('move');
  const src = path.join(root, 'tree');
  const dst = path.join(root, 'dest');
  fs.mkdirSync(path.join(src, 'inner'), { recursive: true });
  fs.mkdirSync(dst);
  fs.writeFileSync(path.join(src, 'inner', 'f.txt'), 'content');
  const jobs = new JobRegistry();
  const s = await waitJob(jobs.run('move', {}, (j) => fsops.transfer([src], dst, { move: true, job: j })));
  assert.equal(s.status, 'done');
  assert.equal(fs.existsSync(src), false);
  assert.equal(fs.readFileSync(path.join(dst, 'tree', 'inner', 'f.txt'), 'utf8'), 'content');

  const bad = await waitJob(jobs.run('move', {}, (j) => fsops.transfer([path.join(dst, 'tree')], path.join(dst, 'tree', 'inner'), { move: true, job: j })));
  assert.equal(bad.status, 'error');
  assert.match(bad.error, /into itself/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('cancelling a copy mid-way', async () => {
  const root = tmpdir('cancel');
  const src = path.join(root, 'many');
  const dst = path.join(root, 'dst');
  fs.mkdirSync(src); fs.mkdirSync(dst);
  for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(src, `f${i}.txt`), 'x'.repeat(1000));
  const jobs = new JobRegistry();
  const job = jobs.run('copy', {}, (j) => fsops.transfer([src], dst, { job: j }));
  job.on('update', (s) => { if (s.current > 10 && s.status === 'running') job.cancel(); });
  const s = await waitJob(job);
  assert.equal(s.status, 'cancelled');
  assert.ok(fs.readdirSync(path.join(dst, 'many')).length < 200);
  fs.rmSync(root, { recursive: true, force: true });
});

test('delete, mkdir, createFile, rename', async () => {
  const root = tmpdir('mut');
  const dir = await fsops.makeDirectory(root, '새 폴더');
  assert.ok(fs.statSync(dir).isDirectory());
  const file = await fsops.createFile(dir, '새 파일.txt');
  assert.equal(fs.readFileSync(file, 'utf8'), '');
  await assert.rejects(() => fsops.createFile(dir, '새 파일.txt'), /EXISTS/);
  await assert.rejects(() => fsops.makeDirectory(dir, '../x'), /Invalid/);
  const renamed = await fsops.renamePath(file, 'renamed.txt');
  assert.equal(path.basename(renamed), 'renamed.txt');
  assert.equal(fs.existsSync(file), false);
  const jobs = new JobRegistry();
  const s = await waitJob(jobs.run('delete', {}, (j) => fsops.deletePaths([dir], j)));
  assert.equal(s.status, 'done');
  assert.equal(fs.existsSync(dir), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('search by name glob and by content', async () => {
  const root = tmpdir('search');
  fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(root, 'a', 'notes.txt'), 'The quick brown fox');
  fs.writeFileSync(path.join(root, 'a', 'b', 'Report.TXT'), 'nothing here');
  fs.writeFileSync(path.join(root, 'a', 'b', 'image.png'), 'binary');
  const jobs = new JobRegistry();
  let s = await waitJob(jobs.run('search', {}, (j) => fsops.search(root, { pattern: '*.txt' }, j)));
  assert.deepEqual(s.result.found.map((e) => path.basename(e.path)).sort(), ['Report.TXT', 'notes.txt']);
  assert.ok(s.result.found.every((e) => e.isDir === false && e.size > 0));
  // folders match a name pattern too
  s = await waitJob(jobs.run('search', {}, (j) => fsops.search(root, { pattern: 'b' }, j)));
  assert.deepEqual(s.result.found.map((e) => [path.basename(e.path), e.isDir]), [['b', true]]);
  s = await waitJob(jobs.run('search', {}, (j) => fsops.search(root, { pattern: '*', matchContent: true, content: 'BROWN' }, j)));
  assert.deepEqual(s.result.found.map((e) => path.basename(e.path)), ['notes.txt']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('api dispatch: jobs are followed through snapshots; session round trip', async () => {
  const root = tmpdir('api');
  const api = createApi({ configDir: path.join(root, 'cfg'), name: 'test' });
  fs.writeFileSync(path.join(root, 'x.txt'), 'x');
  fs.mkdirSync(path.join(root, 'to'));
  const snap = await api.call('ops.transfer', { sources: [path.join(root, 'x.txt')], dest: path.join(root, 'to') });
  assert.equal(snap.kind, 'copy');
  let last;
  for (let i = 0; i < 100; i++) {
    last = await api.call('jobs.get', { id: snap.id });
    if (last.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(last.status, 'done');
  assert.equal(fs.existsSync(path.join(root, 'to', 'x.txt')), true);

  const info = await api.call('app.info', {});
  assert.equal(info.platform, process.platform);
  const saved = await api.call('session.save', { patch: { left: root, language: 'en' } });
  assert.equal(saved.left, root);
  const again = createApi({ configDir: path.join(root, 'cfg') });
  const loaded = await again.call('session.load', {});
  assert.equal(loaded.language, 'en');
  assert.equal(loaded.left, root);
  await assert.rejects(() => api.call('nope.method', {}), /Unknown API method/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('renameMany: swaps and shifts through temp names; rollback on a clash', async () => {
  const root = tmpdir("mrn");
  for (const n of ['a.txt', 'b.txt', 'c.txt', 'x.txt']) fs.writeFileSync(path.join(root, n), n);
  const r = await fsops.renameMany([
    { path: path.join(root, 'a.txt'), newName: 'b.txt' },
    { path: path.join(root, 'b.txt'), newName: 'a.txt' },
  ]);
  assert.equal(r.length, 2);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'b.txt');
  assert.equal(fs.readFileSync(path.join(root, 'b.txt'), 'utf8'), 'a.txt');
  await assert.rejects(fsops.renameMany([{ path: path.join(root, 'c.txt'), newName: 'x.txt' }]), /EXISTS/);
  await assert.rejects(fsops.renameMany([{ path: path.join(root, 'c.txt'), newName: 'd' }, { path: path.join(root, 'x.txt'), newName: 'd' }]), /Duplicate/);
  assert.ok(fs.existsSync(path.join(root, 'c.txt')));
  assert.deepEqual(fs.readdirSync(root).filter((n) => n.startsWith('.mrn-')), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('readFile: text with BOM / utf-16, binary as hex source, image as base64; writeText', async () => {
  const root = tmpdir("mrn");
  fs.writeFileSync(path.join(root, 'bom.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('한글 text')]));
  fs.writeFileSync(path.join(root, 'u16.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]));
  fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.from([0, 1, 2, 3, 65, 66]));
  fs.writeFileSync(path.join(root, 'i.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  let r = await fsops.readFile(path.join(root, 'bom.txt'));
  assert.deepEqual([r.kind, r.text, r.encoding], ['text', '한글 text', 'UTF-8 BOM']);
  r = await fsops.readFile(path.join(root, 'u16.txt'));
  assert.deepEqual([r.kind, r.text, r.encoding], ['text', 'hi', 'UTF-16 LE']);
  r = await fsops.readFile(path.join(root, 'bin.dat'));
  assert.deepEqual([r.kind, Buffer.from(r.base64, 'base64').length], ['binary', 6]);
  r = await fsops.readFile(path.join(root, 'i.png'));
  assert.deepEqual([r.kind, r.mime, r.base64], ['image', 'image/png', 'iVBORw=='] );
  await fsops.writeText(path.join(root, 'new.txt'), 'written');
  assert.equal(fs.readFileSync(path.join(root, 'new.txt'), 'utf8'), 'written');
  await assert.rejects(fsops.readFile(root), /EISDIR/);
  fs.rmSync(root, { recursive: true, force: true });
});
