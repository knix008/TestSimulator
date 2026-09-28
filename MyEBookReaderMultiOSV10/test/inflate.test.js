import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { inflateRaw, inflate } from '../src/lib/inflate.js';

// The DEFLATE decoder is checked against Node's own compressor: anything zlib
// produces, the reader has to be able to read, because that is what real EPUB
// and CBZ writers use.
function roundTrip(text, options) {
  const raw = Buffer.from(text, 'utf8');
  const packed = zlib.deflateRawSync(raw, options);
  const out = inflateRaw(new Uint8Array(packed), { expectedSize: raw.length });
  return Buffer.from(out).toString('utf8');
}

describe('inflateRaw', () => {
  it('reads a short deflated string', () => {
    expect(roundTrip('Hello, MyEBookReader!')).toBe('Hello, MyEBookReader!');
  });

  it('reads highly repetitive data (long back-references)', () => {
    const text = 'abcabcabc'.repeat(4000);
    expect(roundTrip(text)).toBe(text);
  });

  it('reads Korean text (multi-byte UTF-8)', () => {
    const text = '한글 본문이 그대로 복원되어야 합니다.\n'.repeat(400);
    expect(roundTrip(text)).toBe(text);
  });

  it('reads a stored (uncompressed) block', () => {
    const text = 'stored block, level 0';
    expect(roundTrip(text, { level: 0 })).toBe(text);
  });

  it('reads fixed-Huffman output', () => {
    const text = 'x';
    expect(roundTrip(text, { strategy: zlib.constants.Z_FIXED })).toBe(text);
  });

  it('reads every compression level identically', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(200);
    for (let level = 0; level <= 9; level++) {
      expect(roundTrip(text, { level })).toBe(text);
    }
  });

  it('handles an empty payload', () => {
    const packed = zlib.deflateRawSync(Buffer.alloc(0));
    expect(inflateRaw(new Uint8Array(packed)).length).toBe(0);
  });

  it('reads binary data byte for byte', () => {
    const raw = new Uint8Array(5000);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 251;
    const packed = zlib.deflateRawSync(Buffer.from(raw));
    const out = inflateRaw(new Uint8Array(packed), { expectedSize: raw.length });
    expect(Buffer.from(out).equals(Buffer.from(raw))).toBe(true);
  });

  it('reports a truncated stream instead of returning junk', () => {
    const packed = zlib.deflateRawSync(Buffer.from('a'.repeat(500)));
    const cut = new Uint8Array(packed).subarray(0, 4);
    expect(() => inflateRaw(cut)).toThrow(/DEFLATE|ended/i);
  });

  it('refuses the reserved block type', () => {
    // 1 (final) + 11 (reserved type 3) in the low bits of the first byte.
    expect(() => inflateRaw(new Uint8Array([0x07, 0, 0, 0]))).toThrow(/reserved/i);
  });
});

describe('inflate (zlib wrapper)', () => {
  it('skips the 2-byte zlib header', () => {
    const raw = Buffer.from('wrapped in zlib');
    const packed = zlib.deflateSync(raw);
    expect(Buffer.from(inflate(new Uint8Array(packed))).toString()).toBe('wrapped in zlib');
  });

  it('still reads a raw stream', () => {
    const raw = Buffer.from('no wrapper here');
    const packed = zlib.deflateRawSync(raw);
    expect(Buffer.from(inflate(new Uint8Array(packed))).toString()).toBe('no wrapper here');
  });
});
