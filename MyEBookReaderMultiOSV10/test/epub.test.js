import { describe, it, expect } from 'vitest';
import { openEpub, looksLikeEpub, mimeForPath } from '../src/lib/epub.js';
import { sampleBytes } from './helpers/samples.mjs';

const epub = () => openEpub(sampleBytes('sample.epub'));

describe('openEpub — metadata', () => {
  it('reads the title, author and publisher from the package document', () => {
    const book = epub();
    expect(book.meta.title).toBe('MyEBookReader 샘플 책');
    expect(book.meta.author).toBe('SHKWON');
    expect(book.meta.publisher).toBe('TestSimulator');
  });

  it('reads the language, identifier, date and description', () => {
    const book = epub();
    expect(book.meta.language).toBe('ko');
    expect(book.meta.identifier).toContain('myebookreader-sample');
    expect(book.meta.date).toBe('2026-01-01');
    expect(book.meta.description).toContain('샘플');
  });

  it('finds the cover image', () => {
    expect(epub().coverPath).toBe('OEBPS/images/cover.png');
  });
});

describe('openEpub — structure', () => {
  it('lists the spine in reading order', () => {
    const book = epub();
    expect(book.sections.map((s) => s.href)).toEqual([
      'OEBPS/text/ch1.xhtml',
      'OEBPS/text/ch2.xhtml',
      'OEBPS/text/ch3.xhtml',
    ]);
  });

  it('reads the EPUB 3 navigation document as the contents list', () => {
    const toc = epub().toc;
    expect(toc.length).toBe(3);
    expect(toc[0].label).toContain('첫 장');
    expect(toc[0].section).toBe(0);
    expect(toc[2].section).toBe(2);
  });

  it('reports the format', () => {
    expect(epub().format).toBe('epub');
  });
});

describe('openEpub — chapters', () => {
  it('returns sanitized HTML for a chapter', () => {
    const loaded = epub().loadSection(0);
    expect(loaded.html).toContain('<h1');
    expect(loaded.html).toContain('MyEBookReader');
    expect(loaded.html).not.toMatch(/<script|onclick=/i);
  });

  it('resolves a chapter image through the resource resolver', () => {
    const seen = [];
    const loaded = epub().loadSection(2, {
      resolveSrc: (path) => { seen.push(path); return `blob:x/${path}`; },
    });
    expect(seen).toContain('OEBPS/images/plate.png');
    expect(loaded.html).toContain('blob:x/OEBPS/images/plate.png');
  });

  it('turns a link between chapters into a section index', () => {
    const loaded = epub().loadSection(1);
    expect(loaded.html).toContain('data-section="2"');
  });

  it('reads the resource bytes of an image', () => {
    const resource = epub().resource('OEBPS/images/plate.png');
    expect(resource.mime).toBe('image/png');
    expect(resource.bytes.length).toBeGreaterThan(100);
  });

  it('gives the plain text of a chapter', () => {
    expect(epub().sectionText(0)).toContain('MyEBookReader');
  });

  it('names the section that does not exist', () => {
    expect(() => epub().loadSection(99)).toThrow(/section 100/);
  });

  it('collects the chapter headings', () => {
    expect(epub().loadSection(0).headings[0].text).toContain('첫 장');
  });
});

describe('openEpub — bad input', () => {
  it('reports a ZIP that is not an EPUB', () => {
    expect(() => openEpub(sampleBytes('sample.cbz'))).toThrow(/container\.xml|package/i);
  });

  it('reports something that is not a ZIP at all', () => {
    expect(() => openEpub(sampleBytes('sample.txt'))).toThrow();
  });
});

describe('looksLikeEpub / mimeForPath', () => {
  it('recognises the mimetype entry', () => {
    expect(looksLikeEpub(sampleBytes('sample.epub'))).toBe(true);
    expect(looksLikeEpub(sampleBytes('sample.cbz'))).toBe(false);
  });

  it('recognises the extension', () => {
    expect(looksLikeEpub(new Uint8Array(0), 'book.EPUB')).toBe(true);
  });

  it('maps extensions to media types', () => {
    expect(mimeForPath('a/b.png')).toBe('image/png');
    expect(mimeForPath('a/b.xhtml')).toBe('application/xhtml+xml');
    expect(mimeForPath('a/b.unknown')).toBe('application/octet-stream');
  });
});
