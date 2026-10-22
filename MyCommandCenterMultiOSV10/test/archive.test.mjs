// Archive round trips: tar.gz / tar.bz2 / zip, split volumes, Korean names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const archive = require('../core/archive.js');
const { JobRegistry } = require('../core/jobs.js');

function tmpdir(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `cc-test-${name}-`));
  return d;
}

function makeTree(root) {
  const src = path.join(root, '자료 폴더');
  fs.mkdirSync(path.join(src, 'sub', 'deeper'), { recursive: true });
  fs.writeFileSync(path.join(src, '한글 이름.txt'), '안녕하세요 Command Center\n'.repeat(50));
  fs.writeFileSync(path.join(src, 'sub', 'data.bin'), crypto.randomBytes(300_000));
  fs.writeFileSync(path.join(src, 'sub', 'deeper', 'x'.repeat(120) + '.txt'), 'long name');
  fs.writeFileSync(path.join(root, 'single.txt'), 'top-level file');
  return src;
}

function readTree(root) {
  const out = {};
  (function walk(dir, rel) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { out[r + '/'] = null; walk(path.join(dir, d.name), r); }
      else out[r] = fs.readFileSync(path.join(dir, d.name)).toString('base64');
    }
  })(root, '');
  return out;
}

async function runJob(jobs, kind, fn) {
  const job = jobs.run(kind, {}, fn);
  return new Promise((resolve, reject) => {
    job.on('update', (s) => {
      if (s.status === 'done') resolve(s.result);
      else if (s.status === 'error') reject(new Error(s.error));
      else if (s.status === 'cancelled') reject(new Error('cancelled'));
    });
  });
}

for (const format of ['tar.gz', 'zip', 'tar.bz2']) {
  test(`${format}: create + extract round trip`, async () => {
    const root = tmpdir(format.replace('.', ''));
    const src = makeTree(root);
    const jobs = new JobRegistry();
    const destBase = path.join(root, 'out');
    const created = await runJob(jobs, 'compress', (job) =>
      archive.create({ sources: [src, path.join(root, 'single.txt')], destBase, format, split: false }, job));
    assert.equal(created.archivePath, destBase + archive.formatExt(format));
    assert.ok(fs.statSync(created.archivePath).size > 0);

    const dest = path.join(root, 'extracted');
    const result = await runJob(jobs, 'extract', (job) => archive.extract({ archivePath: created.archivePath, destDir: dest }, job));
    assert.ok(result.entries >= 6);

    const expected = { ...readTree(path.join(root, '자료 폴더')) };
    const got = readTree(path.join(dest, '자료 폴더'));
    assert.deepEqual(got, expected);
    assert.equal(fs.readFileSync(path.join(dest, 'single.txt'), 'utf8'), 'top-level file');
    fs.rmSync(root, { recursive: true, force: true });
  });
}

for (const format of ['zip', 'tar.gz']) {
  test(`${format}: split volumes and joined extraction`, async () => {
    const root = tmpdir('split');
    const src = makeTree(root);
    const jobs = new JobRegistry();
    const destBase = path.join(root, 'parts');
    const created = await runJob(jobs, 'compress', (job) =>
      archive.create({ sources: [src], destBase, format, split: true, splitSize: 64 * 1024 }, job));
    assert.ok(created.parts.length >= 2, `expected several parts, got ${created.parts.length}`);
    if (format === 'zip') {
      assert.equal(created.parts[0], destBase + '.zip');
      assert.equal(created.parts[1], destBase + '.z01');
    } else {
      assert.equal(created.parts[0], destBase + '.tgz');
      assert.equal(created.parts[1], destBase + '.tgz.001');
    }
    for (const p of created.parts.slice(0, -1)) assert.equal(fs.statSync(p).size, 64 * 1024);

    const d1 = archive.describe(created.parts[0]);
    assert.equal(d1.isSplit, true);
    const d2 = archive.describe(created.parts[1]);
    assert.equal(d2.isSplit, true);
    assert.equal(archive.describe(path.join(root, 'nope.txt')).isArchive, false);

    // Extract from a later volume — the set is located from the base name.
    const dest = path.join(root, 'joined');
    await runJob(jobs, 'extract', (job) => archive.extract({ archivePath: created.parts[1], destDir: dest }, job));
    assert.deepEqual(readTree(path.join(dest, '자료 폴더')), readTree(src));
    fs.rmSync(root, { recursive: true, force: true });
  });
}

test('cancel stops a compression and leaves no archive behind', async () => {
  const root = tmpdir('cancel');
  const src = makeTree(root);
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(src, `f${i}.bin`), Buffer.alloc(200_000, i));
  const jobs = new JobRegistry();
  const destBase = path.join(root, 'cancelled');
  const job = jobs.run('compress', {}, (j) => archive.create({ sources: [src], destBase, format: 'tar.gz' }, j));
  const finished = new Promise((resolve) => job.on('update', (s) => { if (s.status !== 'running') resolve(s); }));
  job.on('update', (s) => { if (s.current >= 3 && s.status === 'running') job.cancel(); });
  const s = await finished;
  assert.equal(s.status, 'cancelled');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(fs.existsSync(destBase + '.tar.gz'), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('extension helpers', () => {
  assert.equal(archive.extFor({ format: 'zip', split: true, splitSize: 10 }), '.zip');
  assert.equal(archive.extFor({ format: 'tar.gz', split: true, splitSize: 10 }), '.tgz');
  assert.equal(archive.extFor({ format: 'tar.bz2', split: false }), '.tar.bz2');
  assert.equal(archive.stripArchiveExt('a.b.tar.gz'), 'a.b');
  assert.equal(archive.stripArchiveExt('x.zip'), 'x');
  assert.equal(archive.isArchive('photo.png'), false);
  assert.equal(archive.isArchive('backup.tbz2'), true);
});
