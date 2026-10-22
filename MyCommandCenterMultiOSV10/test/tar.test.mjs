// The tar writer and reader (core/tar.js): headers, pax long / Korean names, symlinks, sizes on the
// 512-byte boundary, files that change while archived, cancellation and broken input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tar = require('../core/tar.js');

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tar-'));

async function toBuffer(entries, opts) {
  const chunks = [];
  for await (const c of tar.readableFromEntries(entries, opts)) chunks.push(c);
  return Buffer.concat(chunks);
}
async function* chunked(buf, size = 700) { for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size); }
async function read(buf, chunkSize) {
  const out = [];
  await tar.readTar(chunked(buf, chunkSize), async (entry, body) => {
    const parts = [];
    for await (const c of body) parts.push(c);
    out.push({ ...entry, data: Buffer.concat(parts).toString('utf8') });
  });
  return out;
}
function fileEntry(dir, name, content, extra = {}) {
  const realPath = path.join(dir, name.replace(/\//g, '_'));
  fs.writeFileSync(realPath, content);
  return { name, realPath, size: Buffer.byteLength(content), mtime: 1700000000, mode: 0o644, ...extra };
}

test('toPosix turns the platform separator into /', () => {
  assert.equal(tar.toPosix(['a', 'b', 'c'].join(path.sep)), 'a/b/c');
});

test('cancelledError carries the CANCELLED code', () => {
  const e = tar.cancelledError();
  assert.equal(e.code, 'CANCELLED');
  assert.equal(e.message, 'cancelled');
});

test('the archive is whole 512-byte blocks and ends with two zero blocks', async () => {
  const d = tmpdir();
  const buf = await toBuffer([fileEntry(d, 'a.txt', 'hello')]);
  assert.equal(buf.length % 512, 0);
  assert.ok(buf.subarray(buf.length - 1024).every((b) => b === 0));
  assert.equal(buf.subarray(257, 262).toString(), 'ustar');
});

test('round trip: a folder, a file and their names, sizes, modes and times', async () => {
  const d = tmpdir();
  const buf = await toBuffer([
    { name: 'dir', isDir: true, size: 0, mtime: 1700000000, mode: 0o755 },
    fileEntry(d, 'dir/a.txt', 'hello world'),
  ]);
  const got = await read(buf);
  assert.deepEqual(got.map((e) => [e.name, e.type]), [['dir/', '5'], ['dir/a.txt', '0']]);
  assert.equal(got[1].data, 'hello world');
  assert.equal(got[1].size, 11);
  assert.equal(got[1].mode, 0o644);
  assert.equal(got[1].mtime, 1700000000);
});

test('round trip: a Korean name travels in a pax record', async () => {
  const d = tmpdir();
  const buf = await toBuffer([fileEntry(d, '문서/보고서.txt', '내용')]);
  assert.ok(buf.includes(Buffer.from('path=문서/보고서.txt')), 'pax path record');
  const [e] = await read(buf);
  assert.equal(e.name, '문서/보고서.txt');
  assert.equal(e.data, '내용');
});

test('round trip: a name longer than 100 bytes is kept whole', async () => {
  const d = tmpdir();
  const long = `${'deep/'.repeat(30)}file.txt`;
  const [e] = await read(await toBuffer([fileEntry(d, long, 'x')]));
  assert.equal(e.name, long);
});

test('round trip: a fractional modification time is kept via pax', async () => {
  const d = tmpdir();
  const [e] = await read(await toBuffer([fileEntry(d, 'a', 'x', { mtime: 1700000000.25 })]));
  assert.equal(e.mtime, 1700000000.25);
});

test('round trip: a symlink keeps its target and has no body', async () => {
  const got = await read(await toBuffer([{ name: 'link', isSymlink: true, target: '../real/file', size: 0, mtime: 1, mode: 0o777 }]));
  assert.equal(got[0].type, '2');
  assert.equal(got[0].linkname, '../real/file');
  assert.equal(got[0].data, '');
});

test('round trip: a symlink target longer than 100 bytes is kept via pax', async () => {
  const target = `/${'t'.repeat(150)}`;
  const [e] = await read(await toBuffer([{ name: 'l', isSymlink: true, target, size: 0, mtime: 1 }]));
  assert.equal(e.linkname, target);
});

for (const size of [0, 1, 511, 512, 513, 1024, 70000]) {
  test(`round trip: a file of ${size} bytes (block padding)`, async () => {
    const d = tmpdir();
    const content = 'z'.repeat(size);
    const got = await read(await toBuffer([fileEntry(d, 'f', content), fileEntry(d, 'after', 'next')]), 333);
    assert.equal(got[0].data.length, size);
    assert.equal(got[1].data, 'next', 'the next entry starts on its block');
  });
}

test('a file that grew after it was listed is cut at the recorded size', async () => {
  const d = tmpdir();
  const e = fileEntry(d, 'grow', 'abc');
  fs.writeFileSync(e.realPath, 'abcdefgh');
  const got = await read(await toBuffer([e, fileEntry(d, 'n', 'ok')]));
  assert.equal(got[0].data, 'abc');
  assert.equal(got[1].data, 'ok');
});

test('a file that shrank after it was listed is padded with zeros', async () => {
  const d = tmpdir();
  const e = fileEntry(d, 'shrink', 'abcdef');
  fs.writeFileSync(e.realPath, 'ab');
  const [got] = await read(await toBuffer([e]));
  assert.equal(got.size, 6);
  assert.equal(got.data, 'ab\0\0\0\0');
});

test('onEntry is told of each entry as it starts', async () => {
  const d = tmpdir();
  const seen = [];
  await toBuffer([fileEntry(d, 'a', '1'), fileEntry(d, 'b', '2')], { onEntry: (n) => seen.push(n) });
  assert.deepEqual(seen, ['a', 'b']);
});

test('writing stops with CANCELLED when cancelled', async () => {
  const d = tmpdir();
  await assert.rejects(toBuffer([fileEntry(d, 'a', '1')], { isCancelled: () => true }), { code: 'CANCELLED' });
});

test('reading stops with CANCELLED when cancelled', async () => {
  const d = tmpdir();
  const buf = await toBuffer([fileEntry(d, 'a', '1')]);
  await assert.rejects(tar.readTar(chunked(buf), async () => {}, { isCancelled: () => true }), { code: 'CANCELLED' });
});

test('a truncated archive is reported, not silently accepted', async () => {
  const d = tmpdir();
  const buf = await toBuffer([fileEntry(d, 'big', 'q'.repeat(5000))]);
  await assert.rejects(read(buf.subarray(0, 1536)), /Unexpected end of archive/);
});

test('a body the consumer does not read is skipped over', async () => {
  const d = tmpdir();
  const buf = await toBuffer([fileEntry(d, 'a', 'x'.repeat(2000)), fileEntry(d, 'b', 'second')]);
  const names = [];
  let last = '';
  await tar.readTar(chunked(buf), async (entry, body) => {
    names.push(entry.name);
    if (entry.name === 'b') { for await (const c of body) last += c.toString(); }
  });
  assert.deepEqual(names, ['a', 'b']);
  assert.equal(last, 'second');
});

test('collectEntries walks folders in name order with archive names relative to the parent', async () => {
  const d = tmpdir();
  const top = path.join(d, 'top');
  fs.mkdirSync(path.join(top, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(top, 'b.txt'), 'b');
  fs.writeFileSync(path.join(top, 'a.txt'), 'aa');
  fs.writeFileSync(path.join(top, 'sub', 'c.txt'), 'c');
  const entries = await tar.collectEntries([top]);
  assert.deepEqual(entries.map((e) => e.name), ['top', 'top/a.txt', 'top/b.txt', 'top/sub', 'top/sub/c.txt']);
  assert.equal(entries[0].isDir, true);
  assert.equal(entries[1].size, 2);
});

test('collectEntries stops with CANCELLED when cancelled', async () => {
  const d = tmpdir();
  await assert.rejects(tar.collectEntries([d], { isCancelled: () => true }), { code: 'CANCELLED' });
});
