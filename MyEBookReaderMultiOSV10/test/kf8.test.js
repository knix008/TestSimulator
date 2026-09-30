import { describe, it, expect } from 'vitest';
import { openBook, detectFormat } from '../src/lib/book.js';
import { sampleBytes } from './helpers/samples.mjs';

// KF8 — the format inside an .azw3.
//
// The sample is written by scripts/make-samples.mjs the way the format writes
// one: the frame of each part and the pieces that go inside it are interleaved
// in one stream, and two index tables say how to thread them back together. A
// reader that gets any of that wrong produces text that is visibly wrong rather
// than nearly right, which is what these tests look for.

const data = () => sampleBytes('sample.azw3');

describe('opening an AZW3', () => {
  it('is recognised as the MOBI family', () => {
    expect(detectFormat(data(), 'sample.azw3')).toBe('mobi');
  });

  it('opens, with one section per part of the book', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    expect(book.format).toBe('mobi');
    expect(book.sectionCount).toBe(3);
  });

  it('reads the metadata out of its EXTH block', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    expect(book.meta.title).toContain('AZW3');
    expect(book.meta.author).toBe('SHKWON');
    expect(book.meta.publisher).toBe('TestSimulator');
  });

  it('threads each part back together in the right order', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    const first = book.loadSection(0);
    // The heading belongs inside the body of the frame, before the paragraphs —
    // which is only true if the pieces went back where they came from.
    const heading = first.html.indexOf('첫 장');
    const body = first.html.indexOf('MyEBookReader 는');
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(body).toBeGreaterThan(heading);
  });

  it('keeps each part to itself', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    const second = book.loadSection(1);
    expect(second.html).toContain('둘째 장');
    // A part must not carry another part's text: that is exactly what happens
    // when a KF8 stream is read as though it were one MOBI 6 document.
    expect(second.html).not.toContain('첫 장');
    expect(second.html).not.toContain('셋째 장');
  });

  it('leaves the stylesheet flow out of the text', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    for (let i = 0; i < book.sectionCount; i += 1) {
      expect(book.loadSection(i).html).not.toContain('font-family: serif');
    }
  });

  it('builds a contents list from the parts', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    expect(book.toc).toHaveLength(3);
    expect(book.toc[0].label).toContain('첫 장');
    expect(book.toc.map((row) => row.section)).toEqual([0, 1, 2]);
  });

  it('gives the plain text of a part, for searching and exporting', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    expect(book.sectionText(0)).toContain('MyEBookReader');
    expect(book.sectionText(0)).not.toContain('<p');
  });

  it('resolves a picture the markup asks for by its embed number', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    // kindle:embed:0001 is base 32 for resource 1, and the book turns that into
    // a URL for the bytes it holds.
    const resource = book.source.resource('embed:1');
    expect(resource?.mime).toBe('image/png');
    expect(resource.bytes.length).toBeGreaterThan(8);

    const html = book.loadSection(1).html;
    // The kindle: URI is gone and something the browser can load is in its place.
    expect(html).toContain('<img');
    expect(html).not.toContain('kindle:embed');
    expect(/src="(blob:|data:)/.test(html)).toBe(true);
  });

  it('asks the book for the resource by the key the markup named', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    const asked = [];
    // The source is driven directly here: the book wrapper supplies its own
    // resolver, so this is the only way to see what key it is given.
    book.source.loadSection(1, { resolveSrc: (key) => { asked.push(key); return `x:${key}`; } });
    expect(asked).toContain('embed:1');
  });

  it('follows a link from one part into another', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    const first = book.loadSection(0);
    // kindle:pos:fid:0002 — the link is turned into a section to go to.
    expect(first.html).toContain('data-section');
    expect(first.html).not.toContain('kindle:pos');
  });
});

describe('a file that carries two books at once', () => {
  const data = () => sampleBytes('sample-dual.azw3');

  it('prefers the KF8 half over the MOBI 6 one', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample-dual.azw3', size: bytes.length });
    // The MOBI 6 half of the same book is one stream cut at its page breaks and
    // would come out as three sections too — so what tells them apart is the
    // markup: only the KF8 half has real XHTML parts with their own <head>.
    expect(book.sectionCount).toBe(3);
    const first = book.loadSection(0).html;
    expect(first).toContain('첫 장');
    expect(first).not.toContain('mbp:pagebreak');
  });

  it('reads the KF8 half from where EXTH 121 says it begins', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample-dual.azw3', size: bytes.length });
    // Each part keeps to itself, which is only true of the reassembled halves.
    expect(book.loadSection(1).html).not.toContain('첫 장');
    expect(book.loadSection(2).html).toContain('셋째 장');
  });

  it('falls back to the older half when the newer one cannot be read', async () => {
    // EXTH 121 is made to point at a record that is not a KF8 header at all.
    const bytes = Uint8Array.from(data());
    const at = findExth121(bytes);
    expect(at).toBeGreaterThan(0);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(at, 0xfffe);

    const book = await openBook({ data: bytes, name: 'broken-dual.azw3', size: bytes.length });
    // The book still opens: the MOBI 6 half is there and is read instead.
    expect(book.sectionCount).toBeGreaterThan(0);
    expect(book.loadSection(0).html).toContain('첫 장');
  });
});

/** Where the value of EXTH field 121 sits in the bytes, or -1. */
function findExth121(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at + 8 < bytes.length; at += 1) {
    if (view.getUint32(at) === 121 && view.getUint32(at + 4) === 12) return at + 8;
  }
  return -1;
}

describe('a MOBI compressed with HUFF/CDIC', () => {
  const data = () => sampleBytes('sample-huff.mobi');

  it('opens and reads its text', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample-huff.mobi', size: bytes.length });
    expect(book.sectionCount).toBe(3);
    expect(book.loadSection(0).html).toContain('첫 장');
    expect(book.meta.author).toBe('SHKWON');
  });

  it('decodes every chapter, not only the first record', async () => {
    const bytes = data();
    const book = await openBook({ data: bytes, name: 'sample-huff.mobi', size: bytes.length });
    expect(book.loadSection(1).html).toContain('둘째 장');
    expect(book.loadSection(2).html).toContain('셋째 장');
    // The filler paragraphs are past the first 4 KB record, so reaching them
    // means the records were decoded and joined in order.
    expect(book.loadSection(2).html).toContain('단락 12');
  });

  it('says so plainly when the tables are damaged', async () => {
    const bytes = Uint8Array.from(data());
    // The HUFF *record*, not the word in the book's title: the record is the one
    // whose magic is followed by its own header length.
    const at = findHuffRecord(bytes);
    expect(at).toBeGreaterThan(0);
    bytes[at] = 0x58;
    await expect(openBook({ data: bytes, name: 'broken.mobi', size: bytes.length }))
      .rejects.toThrow(/HUFF/i);
  });
});

/** Where the HUFF record begins — its magic followed by a header length of 24. */
function findHuffRecord(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at + 8 <= bytes.length; at += 1) {
    if (bytes[at] === 0x48 && bytes[at + 1] === 0x55 && bytes[at + 2] === 0x46
      && bytes[at + 3] === 0x46 && view.getUint32(at + 4) === 24) return at;
  }
  return -1;
}

describe('what the reader calls the format', () => {
  it('says KF8, not MOBI, for a book that is one', async () => {
    const bytes = sampleBytes('sample.azw3');
    const book = await openBook({ data: bytes, name: 'sample.azw3', size: bytes.length });
    expect(book.formatLabel).toContain('KF8');
  });

  it('still says MOBI for a MOBI', async () => {
    const bytes = sampleBytes('sample.mobi');
    const book = await openBook({ data: bytes, name: 'sample.mobi', size: bytes.length });
    expect(book.formatLabel).toBe('MOBI');
  });
});
