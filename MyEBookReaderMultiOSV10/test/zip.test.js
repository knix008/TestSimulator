import { describe, it, expect } from 'vitest';
import {
  readZip, readEntry, readEntryText, findEntry, resolveZipPath, looksLikeZip,
} from '../src/lib/zip.js';
import { sampleBytes } from './helpers/samples.mjs';

describe('readZip', () => {
  const epub = sampleBytes('sample.epub');

  it('lists every entry of a real EPUB', () => {
    const zip = readZip(epub);
    const names = zip.entries.map((e) => e.name);
    expect(names).toContain('mimetype');
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names.filter((n) => n.startsWith('OEBPS/text/')).length).toBe(3);
  });

  it('reads a stored entry', () => {
    const zip = readZip(epub);
    expect(readEntryText(zip, 'mimetype')).toBe('application/epub+zip');
  });

  it('reads a deflated entry', () => {
    const zip = readZip(epub);
    const opf = readEntryText(zip, 'OEBPS/content.opf');
    expect(opf).toContain('<dc:title>MyEBookReader 샘플 책</dc:title>');
  });

  it('reports the uncompressed size of an entry', () => {
    const zip = readZip(epub);
    const entry = zip.byName.get('OEBPS/content.opf');
    const bytes = readEntry(zip, entry);
    expect(bytes.length).toBe(entry.uncompressedSize);
  });

  it('reads a binary entry unchanged (PNG magic intact)', () => {
    const zip = readZip(epub);
    const png = readEntry(zip, 'OEBPS/images/plate.png');
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('refuses something that is not a ZIP', () => {
    expect(() => readZip(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2,
      3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4]))).toThrow(/not a ZIP|end-of-central/i);
  });

  it('names the missing entry when one is asked for', () => {
    const zip = readZip(epub);
    expect(() => readEntry(zip, 'nope.txt')).toThrow(/nope\.txt/);
  });
});

describe('findEntry', () => {
  const zip = readZip(sampleBytes('sample.epub'));

  it('finds an entry by its exact name', () => {
    expect(findEntry(zip, 'OEBPS/nav.xhtml')?.name).toBe('OEBPS/nav.xhtml');
  });

  it('finds an entry whose case does not match the manifest', () => {
    expect(findEntry(zip, 'oebps/NAV.xhtml')?.name).toBe('OEBPS/nav.xhtml');
  });

  it('finds an entry whose href was percent-escaped', () => {
    // EPUB manifests routinely escape characters the archive stores literally.
    expect(findEntry(zip, 'OEBPS/text/ch1%2Exhtml')?.name).toBe('OEBPS/text/ch1.xhtml');
  });

  it('returns null for an entry the archive does not have', () => {
    expect(findEntry(zip, 'OEBPS/text/ch9.xhtml')).toBeNull();
  });

  it('returns null rather than throwing for nothing', () => {
    expect(findEntry(zip, '')).toBeNull();
  });
});

describe('resolveZipPath', () => {
  it('resolves a sibling file', () => {
    expect(resolveZipPath('OEBPS/text/ch1.xhtml', 'ch2.xhtml')).toBe('OEBPS/text/ch2.xhtml');
  });

  it('walks up with ..', () => {
    expect(resolveZipPath('OEBPS/text/ch1.xhtml', '../images/a.png')).toBe('OEBPS/images/a.png');
  });

  it('drops a fragment and a query', () => {
    expect(resolveZipPath('OEBPS/text/ch1.xhtml', 'ch2.xhtml#part2')).toBe('OEBPS/text/ch2.xhtml');
  });

  it('treats a leading slash as archive-absolute', () => {
    expect(resolveZipPath('OEBPS/text/ch1.xhtml', '/OEBPS/x.png')).toBe('OEBPS/x.png');
  });

  it('leaves an absolute URL alone', () => {
    expect(resolveZipPath('OEBPS/a.xhtml', 'https://example.com/x.png')).toBe('https://example.com/x.png');
  });
});

describe('looksLikeZip', () => {
  it('recognises the local-header magic', () => {
    expect(looksLikeZip(sampleBytes('sample.epub'))).toBe(true);
    expect(looksLikeZip(sampleBytes('sample.cbz'))).toBe(true);
  });

  it('rejects a PDF and plain text', () => {
    expect(looksLikeZip(sampleBytes('sample.pdf'))).toBe(false);
    expect(looksLikeZip(sampleBytes('sample.txt'))).toBe(false);
  });
});
