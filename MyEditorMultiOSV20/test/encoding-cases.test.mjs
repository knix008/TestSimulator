// Encoding round trips, line endings and lossy-save guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enc = require('../core/encoding');

const ASCII = 'Hello 123\nline 2';
const KOREAN = '안녕하세요 Hello\n두 번째 줄';

for (const { id } of enc.ENCODINGS) {
  test(`ASCII round-trips through ${id}`, () => {
    const buf = enc.encode(ASCII, id, 'lf');
    assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
    const d = enc.decode(buf, { encoding: id });
    assert.equal(d.binary, false);
    assert.equal(d.text, ASCII);
    assert.equal(enc.canEncode(ASCII, id), true);
  });
}

for (const id of ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'cp949']) {
  test(`Korean round-trips through ${id}`, () => {
    const buf = enc.encode(KOREAN, id, 'crlf');
    const d = enc.decode(buf, { encoding: id });
    assert.equal(d.text, enc.normalizeEol(KOREAN));
    assert.equal(enc.canEncode(KOREAN, id), true);
  });
}

test('Korean cannot be saved as Western single-byte encodings', () => {
  assert.equal(enc.canEncode(KOREAN, 'windows1252'), false);
  assert.equal(enc.canEncode(KOREAN, 'iso88591'), false);
  assert.equal(enc.canEncode(KOREAN, 'koi8r'), false);
});

test('café survives Windows-1252 and Latin-1', () => {
  assert.equal(enc.canEncode('café', 'windows1252'), true);
  assert.equal(enc.canEncode('café', 'iso88591'), true);
  const d = enc.decode(enc.encode('café', 'windows1252', 'lf'), { encoding: 'windows1252' });
  assert.equal(d.text, 'café');
});

test('unknown encoding id falls back to UTF-8', () => {
  assert.equal(enc.encodingInfo('nope').id, 'utf8');
  const buf = enc.encode('ok', 'nope', 'lf');
  assert.equal(enc.decode(buf).text, 'ok');
});

test('BOM bytes are prepended only for BOM encodings', () => {
  const u8 = enc.encode('x', 'utf8', 'lf');
  assert.notEqual(u8[0], 0xef);
  const bom = enc.encode('x', 'utf8bom', 'lf');
  assert.deepEqual([...bom.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const le = enc.encode('x', 'utf16le', 'lf');
  assert.deepEqual([...le.subarray(0, 2)], [0xff, 0xfe]);
  const be = enc.encode('x', 'utf16be', 'lf');
  assert.deepEqual([...be.subarray(0, 2)], [0xfe, 0xff]);
});

test('detectEol prefers the majority break and keeps the fallback when none', () => {
  assert.equal(enc.detectEol('a\r\nb\r\nc\r\n'), 'crlf');
  assert.equal(enc.detectEol('a\nb\nc\n'), 'lf');
  assert.equal(enc.detectEol('a\rb\rc'), 'cr');
  assert.equal(enc.detectEol('a\r\nb\nc\nd\n'), 'lf');
  assert.equal(enc.detectEol('plain', 'crlf'), 'crlf');
  assert.equal(enc.detectEol('plain', 'lf'), 'lf');
  assert.equal(enc.EOL_CHARS.crlf, '\r\n');
  assert.equal(enc.EOL_CHARS.lf, '\n');
  assert.equal(enc.EOL_CHARS.cr, '\r');
});

test('applyEol unknown id leaves LF, normalizeEol accepts mixed breaks', () => {
  assert.equal(enc.applyEol('a\nb\n', 'nope'), 'a\nb\n');
  assert.equal(enc.applyEol('a\nb\n', 'cr'), 'a\rb\r');
  assert.equal(enc.normalizeEol('a\r\nb\rc\n'), 'a\nb\nc\n');
});

test('legacyEncoding returns a known encoding id', () => {
  assert.ok(enc.ENCODINGS.some((e) => e.id === enc.legacyEncoding()));
});
