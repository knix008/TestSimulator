// The Rust core through WebAssembly, the way the web build uses it: documents, editing and undo, search,
// replace, hashes, inspector, operations, transforms, export / import round trips, strings, carving, compare,
// templates and the disassembler — on the sample files the start page makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64, createCore, unb64 } from './helpers/core.mjs';
import { SAMPLES, sampleBytes, crc32 } from '../../src/domain/samples.js';

const core = createCore();
const read = (id, offset = 0, length = 64) => unb64(core('read', { id, offset, length }).data);

test('a document over raw bytes reads back, edits and undoes', () => {
  const info = core.open(Uint8Array.from([1, 2, 3, 4, 5]));
  assert.equal(info.len, 5);
  core('write', { id: info.id, offset: 1, data: b64([0xAA, 0xBB]) });
  core('insert', { id: info.id, offset: 0, data: b64([0xFF]) });
  core('delete', { id: info.id, offset: 5, length: 1 });
  assert.deepEqual([...read(info.id)], [0xFF, 1, 0xAA, 0xBB, 4]);
  const r = core('read', { id: info.id, offset: 0, length: 5 });
  assert.deepEqual(r.modified, [[0, 1], [2, 4]]);
  for (let i = 0; i < 3; i += 1) core('undo', { id: info.id });
  assert.deepEqual([...read(info.id)], [1, 2, 3, 4, 5]);
  assert.equal(core('info', { id: info.id }).modified, false);
  assert.deepEqual([...core.bytes(info.id, 1, 3)], [2, 3, 4]);
});

test('typing merges into one undo step (both nibbles and following bytes)', () => {
  const { id } = core('new', { name: 't' });
  core('insert', { id, offset: 0, data: b64([0x40]), kind: 'type', merge: true });
  core('write', { id, offset: 0, data: b64([0x4D]), kind: 'type', merge: true });
  core('insert', { id, offset: 1, data: b64([0x50]), kind: 'type', merge: true });
  core('write', { id, offset: 1, data: b64([0x5A]), kind: 'type', merge: true });
  assert.equal(core('history', { id }).undo.length, 1);
  assert.deepEqual([...read(id)], [0x4D, 0x5A]);
});

test('search: hex wildcards, text in encodings, numbers, find all, replace all', () => {
  const text = new TextEncoder().encode('MZ..PE\0\0 Hello hello ');
  const { id } = core.open(text);
  assert.equal(core('search', { id, pattern: { kind: 'hex', value: '50 45 ?? 00' }, from: 0 }).match.offset, 4);
  assert.equal(core('findAll', { id, pattern: { kind: 'text', value: 'HELLO', caseSensitive: false } }).count, 2);
  assert.equal(core('findAll', { id, pattern: { kind: 'regex', value: '[Hh]ello' } }).count, 2);
  const n = core('replaceAll', { id, pattern: { kind: 'text', value: 'hello' }, replacement: { kind: 'text', value: 'bye' } });
  assert.equal(n.count, 1);
  assert.equal(new TextDecoder().decode(read(id)).trim(), 'MZ..PE\0\0 Hello bye');
  const num = core.open(Uint8Array.from([0, 0x39, 0x30, 0, 0]));
  assert.equal(core('search', { id: num.id, pattern: { kind: 'int', value: '12345', width: 4 } }).match.offset, 1);
});

test('hashes match known values', () => {
  const { id } = core.open(new TextEncoder().encode('123456789'));
  const r = core('hash', { id, algorithms: ['crc32', 'md5', 'sha256', 'adler32'] }).results;
  const v = Object.fromEntries(r.map((x) => [x.id, x.value]));
  assert.equal(v.crc32, 'cbf43926');
  assert.equal(v.md5, '25f9e794323b453885f5181f1b624d0b');
  assert.equal(v.sha256, '15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225');
  assert.equal(v.adler32, '091e01de');
  assert.ok(core('hashList').length >= 30);
});

test('inspector reads and encodes values', () => {
  const { id } = core.open(Uint8Array.from([0x78, 0x56, 0x34, 0x12, 0, 0, 0x80, 0x3F]));
  const fields = Object.fromEntries(core('inspect', { id, offset: 0, endian: 'le' }).fields.map((f) => [f.id, f.value]));
  assert.equal(fields.uint32, '305419896');
  assert.equal(fields.uint16, '22136');
  const be = Object.fromEntries(core('inspect', { id, offset: 0, endian: 'be' }).fields.map((f) => [f.id, f.value]));
  assert.equal(be.uint32, '2018915346');
  const f = core('inspect', { id, offset: 4, endian: 'le' }).fields.find((x) => x.id === 'float32');
  assert.equal(f.value, '1');
  assert.deepEqual([...unb64(core('encodeValue', { type: 'uint16', text: '0x1234', endian: 'be' }).data)], [0x12, 0x34]);
});

test('operations and transforms (xor, swap, base64, zlib, AES) round trip', () => {
  const { id } = core.open(new TextEncoder().encode('ABCDEFGH'));
  core('operation', { id, op: 'xor', operand: 'FF', width: 1 });
  core('operation', { id, op: 'xor', operand: '0xFF', width: 1 });
  core('operation', { id, op: 'swap', width: 4 });
  assert.equal(new TextDecoder().decode(read(id, 0, 8)), 'DCBAHGFE');
  const enc = core('transform', { id, kind: 'base64Encode', target: 'new' });
  assert.equal(new TextDecoder().decode(core.bytes(enc.id, 0, enc.len)), btoa('DCBAHGFE'));
  for (const [e, d, extra] of [['zlibCompress', 'zlibDecompress', {}], ['gzipCompress', 'gzipDecompress', {}], ['aesEncrypt', 'aesDecrypt', { key: '000102030405060708090a0b0c0d0e0f', iv: '0f0e0d0c0b0a09080706050403020100', mode: 'cbc' }], ['rc4', 'rc4', { key: 'secret', keyText: true }]]) {
    const a = core('transform', { id, kind: e, target: 'new', ...extra });
    const b = core('transform', { id: a.id, kind: d, target: 'new', ...extra });
    assert.equal(new TextDecoder().decode(core.bytes(b.id, 0, b.len)), 'DCBAHGFE', e);
  }
});

test('export and import round trips (hex, base64, Intel HEX, S-record, C)', () => {
  const data = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 255);
  const { id } = core.open(data);
  for (const format of ['hex', 'base64', 'intelhex', 'srec', 'c', 'base85', 'uuencode']) {
    const text = core('export', { id, format, name: 'x' }).text;
    const back = unb64(core('import', { format, text }).data);
    assert.deepEqual([...back], [...data], format);
  }
  assert.match(core('export', { id, format: 'hexdump', length: 32 }).text, /^00000000 {2}00 07 0E/);
});

test('every sample opens, is detected, and its template parses without errors', async () => {
  const expect = { png: 'png', bmp: 'bmp', gif: 'gif', wav: 'wav', zip: 'zip', elf: 'elf', pe: 'pe', disk: 'mbr' };
  for (const s of SAMPLES) {
    const bytes = await sampleBytes(s.id);
    const info = core.open(bytes, s.file);
    const det = core('detect', { id: info.id });
    if (expect[s.id]) {
      assert.equal(det.template, expect[s.id], `${s.id} detected as ${det.id}`);
      const t = core('template', { id: info.id, template: det.template });
      assert.deepEqual(t.errors.filter((e) => !e.warning), [], s.id);
      assert.ok(t.count > 5, `${s.id}: ${t.count} nodes`);
    }
  }
});

test('the PNG sample has valid chunk CRCs', async () => {
  const png = await sampleBytes('png');
  let at = 8;
  while (at < png.length) {
    const len = (png[at] << 24) | (png[at + 1] << 16) | (png[at + 2] << 8) | png[at + 3];
    const body = png.subarray(at + 4, at + 8 + len);
    const crc = ((png[at + 8 + len] << 24) | (png[at + 9 + len] << 16) | (png[at + 10 + len] << 8) | png[at + 11 + len]) >>> 0;
    assert.equal(crc32(body), crc);
    at += 12 + len;
  }
});

test('firmware sample: strings, carving, entropy, disassembly', async () => {
  const info = core.open(await sampleBytes('mixed'), 'firmware.bin');
  const strings = core('strings', { id: info.id, minLength: 6, encodings: ['ascii', 'utf8', 'utf16le'] }).items.map((x) => x.text);
  assert.ok(strings.some((x) => x.includes('Copyright')));
  assert.ok(strings.some((x) => x.includes('설정 메뉴')));
  const carved = core('carve', { id: info.id }).items.map((x) => x.id);
  for (const id of ['png', 'gif', 'zip']) assert.ok(carved.includes(id), `carve ${id}`);
  const stats = core('stats', { id: info.id, blocks: 64 });
  assert.equal(stats.blockEntropy.length, 64);
  assert.ok(Math.max(...stats.blockEntropy) > 7.5);
  const asm = core('disasm', { id: info.id, offset: 0x5000, length: 40, arch: 'x86-64' }).items.map((x) => x.text);
  assert.equal(asm[0], 'mov rax, 1');
  assert.ok(asm.includes('syscall'));
});

test('compare finds the differences, also with an insertion', () => {
  const a = core.open(new TextEncoder().encode('ABCDEFGH'));
  const b = core.open(new TextEncoder().encode('ABXDEFGHI'));
  const bytes = core('compare', { a: a.id, b: b.id, mode: 'bytes' });
  assert.equal(bytes.equal, false);
  const c = core.open(new TextEncoder().encode('ABCZDEFGH'));
  const sync = core('compare', { a: a.id, b: c.id, mode: 'sync' });
  assert.deepEqual(sync.diffs.map((d) => [d.kind, d.aOffset, d.bLength]), [['insert', 3, 1]]);
});

test('calculator', () => {
  const r = core('evaluate', { expr: '0x1F * 4 + (1 << 8)', width: 32 });
  assert.equal(r.value, '380');
  assert.match(r.hex, /17C$/i);
});
