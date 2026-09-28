import { describe, it, expect } from 'vitest';
import {
  openMobi, readPalmRecords, palmDocDecompress, splitMobiText, sectionForFilepos, looksLikeMobi,
} from '../src/lib/mobi.js';
import { sampleBytes } from './helpers/samples.mjs';

const bytes = () => sampleBytes('sample.mobi');

describe('readPalmRecords', () => {
  it('reads the record table of a real MOBI', () => {
    const records = readPalmRecords(bytes());
    expect(records.length).toBeGreaterThan(1);
    expect(records[0].bytes.length).toBeGreaterThan(200);
  });

  it('refuses a file too small to be a Palm database', () => {
    expect(() => readPalmRecords(new Uint8Array(10))).toThrow(/too small/i);
  });
});

describe('palmDocDecompress', () => {
  it('passes literal bytes through', () => {
    expect([...palmDocDecompress(new Uint8Array([0x41, 0x42]))]).toEqual([0x41, 0x42]);
  });

  it('expands a "space + letter" pair', () => {
    // 0xE1 = 'a' | 0x80 → a space followed by 'a'.
    expect([...palmDocDecompress(new Uint8Array([0xe1]))]).toEqual([0x20, 0x61]);
  });

  it('copies a literal run announced by a length byte', () => {
    expect([...palmDocDecompress(new Uint8Array([0x02, 0x01, 0x02]))]).toEqual([0x01, 0x02]);
  });

  it('follows a back-reference', () => {
    // "ab" then a 2-byte reference: distance 2, length 3 → "ababa".
    const pair = 0x8000 | (2 << 3) | (3 - 3);
    const input = new Uint8Array([0x61, 0x62, pair >> 8, pair & 0xff]);
    expect(Buffer.from(palmDocDecompress(input)).toString()).toBe('ababa');
  });

  it('stops cleanly on a truncated reference', () => {
    expect(() => palmDocDecompress(new Uint8Array([0x90]))).not.toThrow();
  });
});

describe('openMobi', () => {
  it('reads the title and the EXTH metadata', () => {
    const book = openMobi(bytes());
    expect(book.meta.title).toContain('MOBI');
    expect(book.meta.author).toBe('SHKWON');
    expect(book.meta.publisher).toBe('TestSimulator');
  });

  it('splits the text stream into chapters at its page breaks', () => {
    const book = openMobi(bytes());
    expect(book.sectionCount ?? book.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('decompresses the text and sanitizes it', () => {
    const book = openMobi(bytes());
    const loaded = book.loadSection(0);
    expect(loaded.html).toContain('MyEBookReader');
    expect(loaded.html).not.toMatch(/<script/i);
  });

  it('gives every chapter a contents entry with its heading', () => {
    const book = openMobi(bytes());
    expect(book.toc.length).toBe(book.sections.length);
    expect(book.toc[0].label).toContain('첫 장');
  });

  it('reports the plain text of a chapter', () => {
    expect(openMobi(bytes()).sectionText(0)).toContain('MyEBookReader');
  });

  it('reports HUFF/CDIC compression as unsupported', () => {
    const data = bytes().slice();
    const record0 = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // Record 0 starts after the header + record table; its first field is the
    // compression type. 17480 is HUFF/CDIC.
    const start = record0.getUint32(78);
    record0.setUint16(start, 17480);
    expect(() => openMobi(data)).toThrow(/HUFF\/CDIC/);
  });

  it('reports a DRM-protected book rather than showing noise', () => {
    const data = bytes().slice();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const start = view.getUint32(78);
    view.setUint16(start + 12, 2);
    expect(() => openMobi(data)).toThrow(/DRM/i);
  });
});

describe('splitMobiText', () => {
  it('starts a chapter at each page break', () => {
    const parts = splitMobiText('<p>a</p><mbp:pagebreak/><p>b</p><mbp:pagebreak/><p>c</p>');
    expect(parts.length).toBe(3);
    expect(parts[1].html.startsWith('<mbp:pagebreak/>')).toBe(true);
  });

  it('keeps a book without page breaks in one piece', () => {
    expect(splitMobiText('<p>only</p>').length).toBe(1);
  });

  it('splits a very long stream into readable blocks', () => {
    const parts = splitMobiText('<p>x</p>'.repeat(40000));
    expect(parts.length).toBeGreaterThan(1);
  });

  it('records where each piece began in the stream', () => {
    const parts = splitMobiText('<p>a</p><mbp:pagebreak/><p>b</p>');
    expect(parts[0].start).toBe(0);
    expect(parts[1].start).toBe('<p>a</p>'.length);
  });
});

describe('sectionForFilepos', () => {
  const parts = [{ start: 0 }, { start: 100 }, { start: 250 }];

  it('finds the piece containing a position', () => {
    expect(sectionForFilepos(parts, 0)).toBe(0);
    expect(sectionForFilepos(parts, 150)).toBe(1);
    expect(sectionForFilepos(parts, 9999)).toBe(2);
  });

  it('returns null with nothing to search', () => {
    expect(sectionForFilepos([], 10)).toBeNull();
  });
});

describe('looksLikeMobi', () => {
  it('recognises the BOOKMOBI type', () => {
    expect(looksLikeMobi(bytes())).toBe(true);
  });

  it('recognises the extension', () => {
    expect(looksLikeMobi(new Uint8Array(0), 'book.azw3')).toBe(true);
  });

  it('rejects an EPUB', () => {
    expect(looksLikeMobi(sampleBytes('sample.epub'))).toBe(false);
  });
});
