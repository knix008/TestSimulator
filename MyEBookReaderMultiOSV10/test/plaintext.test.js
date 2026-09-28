import { describe, it, expect } from 'vitest';
import { openTextBook, splitPlainText, decodeText } from '../src/lib/plaintext.js';
import { sampleBytes } from './helpers/samples.mjs';

describe('decodeText', () => {
  it('reads UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('한글 text'))).toBe('한글 text');
  });

  it('skips a UTF-8 byte-order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61]);
    expect(decodeText(bytes)).toBe('a');
  });

  it('reads UTF-16 with a BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);
    expect(decodeText(bytes)).toBe('ab');
  });

  it('returns an empty string for nothing', () => {
    expect(decodeText(new Uint8Array(0))).toBe('');
  });
});

describe('splitPlainText', () => {
  it('splits at chapter headings', () => {
    const chunks = splitPlainText('제1장 시작\n내용\n\n제2장 다음\n내용');
    expect(chunks.length).toBe(2);
    expect(chunks[0].label).toContain('제1장');
  });

  it('splits English chapter headings too', () => {
    const chunks = splitPlainText('Chapter 1\ntext\n\nChapter 2\ntext');
    expect(chunks.length).toBe(2);
  });

  it('keeps a short text in one piece', () => {
    expect(splitPlainText('just a line').length).toBe(1);
  });

  it('splits a very long text by size', () => {
    const long = ('line of text\n\n').repeat(4000);
    expect(splitPlainText(long).length).toBeGreaterThan(1);
  });
});

describe('openTextBook — plain text', () => {
  const book = () => openTextBook(sampleBytes('sample.txt'), { kind: 'txt', name: 'sample.txt' });

  it('finds the chapters of the sample, with the front matter first', () => {
    // The lines before the first chapter heading are their own block, so
    // nothing in the file is lost.
    expect(book().sections.length).toBe(5);
  });

  it('labels the chapters from their headings', () => {
    expect(book().toc[0].label).toContain('MyEBookReader');
    expect(book().toc[1].label).toContain('제1장');
  });

  it('renders the text as paragraphs', () => {
    const html = book().loadSection(1).html;
    expect(html).toContain('<p>');
    expect(html).toContain('평문 텍스트');
  });

  it('reports the plain text back', () => {
    expect(book().sectionText(1)).toContain('평문');
  });
});

describe('openTextBook — Markdown', () => {
  const book = () => openTextBook(sampleBytes('sample.md'), { kind: 'md', name: 'sample.md' });

  it('splits at the top-level headings', () => {
    expect(book().sections.length).toBeGreaterThanOrEqual(3);
  });

  it('takes the title from the first heading', () => {
    expect(book().meta.title).toContain('Markdown');
  });

  it('renders Markdown to HTML', () => {
    const html = book().loadSection(0).html;
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>굵게</strong>');
  });

  it('keeps a table', () => {
    const all = book().sections.map((_, i) => book().loadSection(i).html).join('');
    expect(all).toContain('<th>형식</th>');
  });
});

describe('openTextBook — HTML', () => {
  const book = () => openTextBook(sampleBytes('sample.html'), { kind: 'html', name: 'sample.html' });

  it('splits a standalone HTML book at its headings', () => {
    expect(book().sections.length).toBe(2);
    expect(book().toc[0].label).toContain('첫째');
  });

  it('sanitizes the markup', () => {
    const withScript = openTextBook('<h1>t</h1><script>bad()</script><p>x</p>', { kind: 'html' });
    expect(withScript.loadSection(0).html).not.toContain('script');
  });
});

describe('openTextBook — edge cases', () => {
  it('opens an empty file without throwing', () => {
    const book = openTextBook(new Uint8Array(0), { kind: 'txt', name: 'empty.txt' });
    expect(book.sections.length).toBe(1);
    expect(book.loadSection(0).html).toBe('');
  });

  it('falls back to the file name for the title', () => {
    const book = openTextBook('no headings here', { kind: 'txt', name: 'named.txt' });
    expect(book.meta.title).toBe('named');
  });

  it('names the section that does not exist', () => {
    const book = openTextBook('x', { kind: 'txt' });
    expect(() => book.loadSection(3)).toThrow(/section 4/);
  });
});
