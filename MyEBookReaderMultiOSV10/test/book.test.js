import { describe, it, expect } from 'vitest';
import {
  openBook, detectFormat, FORMATS, BOOK_EXTENSIONS, LIBRARY_EXT, formatById,
  extensionOf, isBookName, isLibraryName, positionLabel, flattenToc, tocEntryForSection,
} from '../src/lib/book.js';
import { sampleBytes } from './helpers/samples.mjs';

describe('detectFormat', () => {
  it('detects every sample from its bytes', () => {
    expect(detectFormat(sampleBytes('sample.epub'), 'sample.epub')).toBe('epub');
    expect(detectFormat(sampleBytes('sample.pdf'), 'sample.pdf')).toBe('pdf');
    expect(detectFormat(sampleBytes('sample.mobi'), 'sample.mobi')).toBe('mobi');
    expect(detectFormat(sampleBytes('sample.fb2'), 'sample.fb2')).toBe('fb2');
    expect(detectFormat(sampleBytes('sample.cbz'), 'sample.cbz')).toBe('cbz');
  });

  it('trusts the bytes over a wrong extension', () => {
    // A PDF that someone named .epub is still a PDF.
    expect(detectFormat(sampleBytes('sample.pdf'), 'mislabelled.epub')).toBe('pdf');
    expect(detectFormat(sampleBytes('sample.mobi'), 'mislabelled.txt')).toBe('mobi');
  });

  it('uses the extension to tell EPUB from CBZ', () => {
    const zipBytes = sampleBytes('sample.cbz');
    expect(detectFormat(zipBytes, 'comic.cbz')).toBe('cbz');
    expect(detectFormat(zipBytes, 'book.epub')).toBe('epub');
  });

  it('detects Markdown, HTML and text by extension', () => {
    expect(detectFormat(sampleBytes('sample.md'), 'sample.md')).toBe('md');
    expect(detectFormat(sampleBytes('sample.html'), 'sample.html')).toBe('html');
    expect(detectFormat(sampleBytes('sample.txt'), 'sample.txt')).toBe('txt');
  });

  it('spots HTML with no extension at all', () => {
    expect(detectFormat(new TextEncoder().encode('<!doctype html><html></html>'), 'noext')).toBe('html');
  });

  it('falls back to text', () => {
    expect(detectFormat(new TextEncoder().encode('plain words'), 'noext')).toBe('txt');
  });
});

describe('format catalogue', () => {
  it('offers every format the app claims to read', () => {
    expect(FORMATS.map((f) => f.id)).toEqual(['epub', 'pdf', 'djvu', 'mobi', 'fb2', 'cbz', 'md', 'html', 'txt', 'image']);
  });

  it('counts pictures as fixed-layout pages', () => {
    expect(formatById('image').reflowable).toBe(false);
    expect(formatById('image').ext).toContain('jpg');
    expect(formatById('image').ext).toContain('tiff');
    expect(formatById('image').ext).toContain('dcm');
  });

  it('marks PDF and comics as fixed-layout', () => {
    expect(formatById('pdf').reflowable).toBe(false);
    expect(formatById('djvu').reflowable).toBe(false);
    expect(formatById('djvu').ext).toEqual(['djvu', 'djv']);
    expect(formatById('cbz').reflowable).toBe(false);
    expect(formatById('epub').reflowable).toBe(true);
  });

  it('lists the extensions used by the open dialog', () => {
    expect(BOOK_EXTENSIONS).toContain('djvu');
    expect(BOOK_EXTENSIONS).toContain('epub');
    expect(BOOK_EXTENSIONS).toContain('azw3');
    expect(BOOK_EXTENSIONS).not.toContain(LIBRARY_EXT);
  });

  it('recognises book and reading-file names', () => {
    expect(isBookName('a/b/c.epub')).toBe(true);
    expect(isBookName('a/b/c.docx')).toBe(false);
    expect(isLibraryName('x.ebkr')).toBe(true);
    expect(extensionOf('X.EPUB')).toBe('epub');
  });
});

describe('openBook', () => {
  it('opens an EPUB and reports the unified shape', async () => {
    const book = await openBook({ data: sampleBytes('sample.epub'), name: 'sample.epub', path: '/books/sample.epub' });
    expect(book.format).toBe('epub');
    expect(book.formatLabel).toBe('EPUB');
    expect(book.reflowable).toBe(true);
    expect(book.sectionCount).toBe(3);
    expect(book.meta.title).toContain('샘플');
    expect(book.filePath).toBe('/books/sample.epub');
    expect(book.fileSize).toBeGreaterThan(0);
  });

  it('opens a comic and marks it fixed-layout', async () => {
    const book = await openBook({ data: sampleBytes('sample.cbz'), name: 'sample.cbz' });
    expect(book.reflowable).toBe(false);
    expect(book.sectionCount).toBe(6);
  });

  it('opens MOBI, FB2, Markdown, HTML and text', async () => {
    for (const [name, format] of [
      ['sample.mobi', 'mobi'], ['sample.fb2', 'fb2'],
      ['sample.md', 'md'], ['sample.html', 'html'], ['sample.txt', 'txt'],
    ]) {
      const book = await openBook({ data: sampleBytes(name), name });
      expect(book.format).toBe(format);
      expect(book.sectionCount).toBeGreaterThan(0);
    }
  });

  it('says what kind of content each section is', async () => {
    // The reading view switches on this; a reader that left it out once made
    // the pane try to draw a chapter as a picture.
    for (const [name, kind] of [
      ['sample.epub', 'html'], ['sample.fb2', 'html'], ['sample.md', 'html'],
      ['sample.txt', 'html'], ['sample.mobi', 'html'], ['sample.cbz', 'image'],
    ]) {
      const book = await openBook({ data: sampleBytes(name), name });
      expect(book.loadSection(0).kind, name).toBe(kind);
    }
  });

  it('resolves images to URLs the view can use', async () => {
    const book = await openBook({ data: sampleBytes('sample.epub'), name: 'sample.epub' });
    const loaded = book.loadSection(2);
    expect(loaded.html).toMatch(/src="(blob:|data:)/);
    expect(book.cover()).toMatch(/^(blob:|data:)/);
  });

  it('reads a section as text through the unified interface', async () => {
    const book = await openBook({ data: sampleBytes('sample.fb2'), name: 'sample.fb2' });
    expect(await book.readSectionText(0)).toContain('MyEBookReader');
  });

  it('releases its resources when closed', async () => {
    const book = await openBook({ data: sampleBytes('sample.epub'), name: 'sample.epub' });
    book.cover();
    expect(() => book.destroy()).not.toThrow();
  });

  it('refuses an empty file', async () => {
    await expect(openBook({ data: new Uint8Array(0), name: 'x.epub' })).rejects.toThrow(/nothing to open/i);
  });

  it('explains that a RAR comic cannot be read', async () => {
    const rar = new Uint8Array(40);
    rar.set([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
    await expect(openBook({ data: rar, name: 'x.cbr' })).rejects.toThrow(/RAR/i);
  });

  it('falls back to the file name when the book has no title', async () => {
    const book = await openBook({ data: new TextEncoder().encode('no headings'), name: 'Untitled Book.txt' });
    expect(book.meta.title).toBe('Untitled Book');
  });
});

describe('contents helpers', () => {
  const toc = [
    { label: 'A', section: 0, children: [{ label: 'A.1', section: 1, children: [] }] },
    { label: 'B', section: 4, children: [] },
  ];

  it('flattens the tree with a depth for each row', () => {
    expect(flattenToc(toc).map((r) => [r.label, r.depth])).toEqual([['A', 0], ['A.1', 1], ['B', 0]]);
  });

  it('finds the entry covering a section', () => {
    expect(tocEntryForSection(toc, 0).label).toBe('A');
    expect(tocEntryForSection(toc, 2).label).toBe('A.1');
    expect(tocEntryForSection(toc, 9).label).toBe('B');
  });

  it('describes the position', () => {
    expect(positionLabel({ sectionCount: 12 }, 3)).toBe('4 / 12');
    expect(positionLabel(null, 0)).toBe('');
  });
});
