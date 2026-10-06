// Archive names (core/archive.js): extensions per format, recognising archives, split-volume names
// and detecting a split set from any of its parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const archive = require('../core/archive.js');
const { formatExt, splitExt, extFor, isArchive, stripArchiveExt, splitDetect, describe, partPath, FORMATS } = archive;

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-arcname-'));
const touch = (p) => fs.writeFileSync(p, '');

test('the formats offered are tar.gz, tar.bz2 and zip', () => {
  assert.deepEqual(FORMATS, ['tar.gz', 'tar.bz2', 'zip']);
});

test('formatExt: the long extension of each format', () => {
  assert.equal(formatExt('zip'), '.zip');
  assert.equal(formatExt('tar.bz2'), '.tar.bz2');
  assert.equal(formatExt('tar.gz'), '.tar.gz');
  assert.equal(formatExt('anything else'), '.tar.gz');
});

test('splitExt: the short extension used for split sets', () => {
  assert.equal(splitExt('zip'), '.zip');
  assert.equal(splitExt('tar.bz2'), '.tbz2');
  assert.equal(splitExt('tar.gz'), '.tgz');
});

test('extFor: split only when a split size is given', () => {
  assert.equal(extFor({ format: 'tar.gz', split: true, splitSize: 1024 }), '.tgz');
  assert.equal(extFor({ format: 'tar.gz', split: true, splitSize: 0 }), '.tar.gz');
  assert.equal(extFor({ format: 'tar.bz2', split: false, splitSize: 1024 }), '.tar.bz2');
});

for (const name of ['a.zip', 'a.tar.gz', 'A.TGZ', 'a.tar.bz2', 'a.tbz2', 'a.tar.xz', 'a.txz', 'a.tar', 'a.gz', 'a.bz2']) {
  test(`isArchive: ${name} is an archive`, () => assert.equal(isArchive(name), true));
}

for (const name of ['a.txt', 'a.zip.txt', 'archive', 'a.7z', 'a.rar']) {
  test(`isArchive: ${name} is not an archive`, () => assert.equal(isArchive(name), false));
}

test('stripArchiveExt: the whole double extension goes, case kept', () => {
  assert.equal(stripArchiveExt('Photos.tar.gz'), 'Photos');
  assert.equal(stripArchiveExt('Photos.TAR.BZ2'), 'Photos');
  assert.equal(stripArchiveExt('data.json.gz'), 'data.json');
  assert.equal(stripArchiveExt('notes.txt'), 'notes.txt');
});

test('partPath: zip volumes are .zip, .z01, .z02 …', () => {
  assert.equal(partPath('/x/a', 'zip', 0), '/x/a.zip');
  assert.equal(partPath('/x/a', 'zip', 1), '/x/a.z01');
  assert.equal(partPath('/x/a', 'zip', 12), '/x/a.z12');
});

test('partPath: numbered volumes keep the base for the first, then .001 …', () => {
  assert.equal(partPath('/x/a.tgz', 'num', 0), '/x/a.tgz');
  assert.equal(partPath('/x/a.tgz', 'num', 1), '/x/a.tgz.001');
  assert.equal(partPath('/x/a.tgz', 'num', 123), '/x/a.tgz.123');
});

test('partPath: GNU split names run .aa, .ab … .az, .ba', () => {
  assert.equal(partPath('a.tgz', 'gnu', 0), 'a.tgz.aa');
  assert.equal(partPath('a.tgz', 'gnu', 1), 'a.tgz.ab');
  assert.equal(partPath('a.tgz', 'gnu', 25), 'a.tgz.az');
  assert.equal(partPath('a.tgz', 'gnu', 26), 'a.tgz.ba');
});

test('splitDetect: a zip set is found from its .zip and from a later volume', () => {
  const d = tmpdir();
  const base = path.join(d, 'set');
  touch(`${base}.zip`); touch(`${base}.z01`);
  assert.deepEqual(splitDetect(`${base}.zip`), { base, scheme: 'zip' });
  assert.deepEqual(splitDetect(`${base}.z01`), { base, scheme: 'zip' });
});

test('splitDetect: a numbered set is found from its first part and from .001', () => {
  const d = tmpdir();
  const base = path.join(d, 'set.tgz');
  touch(base); touch(`${base}.001`);
  assert.deepEqual(splitDetect(base), { base, scheme: 'num' });
  assert.deepEqual(splitDetect(`${base}.001`), { base, scheme: 'num' });
});

test('splitDetect: a GNU set is only recognised when its .aa exists', () => {
  const d = tmpdir();
  const base = path.join(d, 'set.tgz');
  assert.equal(splitDetect(`${base}.ab`), null, 'no .aa: not a set');
  touch(`${base}.aa`); touch(`${base}.ab`);
  assert.deepEqual(splitDetect(`${base}.ab`), { base, scheme: 'gnu' });
  assert.deepEqual(splitDetect(base), { base, scheme: 'gnu' });
});

test('splitDetect: a single archive or a plain file is not a split set', () => {
  const d = tmpdir();
  touch(path.join(d, 'one.zip')); touch(path.join(d, 'notes.txt.001'));
  assert.equal(splitDetect(path.join(d, 'one.zip')), null);
  assert.equal(splitDetect(path.join(d, 'notes.txt.001')), null, '.001 after a non-archive');
});

test('describe: archive / split flags and the base of the set', () => {
  const d = tmpdir();
  const base = path.join(d, 'big.tgz');
  touch(base); touch(`${base}.001`);
  assert.deepEqual(describe(`${base}.001`), { isArchive: true, isSplit: true, base });
  assert.deepEqual(describe(path.join(d, 'x.zip')), { isArchive: true, isSplit: false, base: null });
  assert.deepEqual(describe(path.join(d, 'x.txt')), { isArchive: false, isSplit: false, base: null });
});
