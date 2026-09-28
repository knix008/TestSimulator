import { describe, it, expect } from 'vitest';
import { openFb2, looksLikeFb2, decodeFb2 } from '../src/lib/fb2.js';
import { sampleBytes, sampleText } from './helpers/samples.mjs';

const fb2 = () => openFb2(sampleBytes('sample.fb2'));

describe('openFb2', () => {
  it('reads the book title and the author name', () => {
    const book = fb2();
    expect(book.meta.title).toBe('MyEBookReader FB2 샘플');
    expect(book.meta.author).toBe('Suho Kwon');
  });

  it('reads the publisher, language and annotation', () => {
    const book = fb2();
    expect(book.meta.publisher).toBe('TestSimulator');
    expect(book.meta.language).toBe('ko');
    expect(book.meta.description).toContain('FictionBook');
  });

  it('makes one section per top-level <section>', () => {
    expect(fb2().sections.length).toBe(3);
  });

  it('uses each section title as its contents entry', () => {
    const toc = fb2().toc;
    expect(toc[0].label).toContain('첫 장');
    expect(toc[1].section).toBe(1);
  });

  it('converts FB2 tags into HTML', () => {
    const loaded = fb2().loadSection(0);
    expect(loaded.html).toContain('<p>');
    expect(loaded.html).toContain('MyEBookReader');
  });

  it('turns <empty-line/> into a blank paragraph', () => {
    const book = openFb2('<FictionBook><body><section><p>a</p><empty-line/></section></body></FictionBook>');
    expect(book.loadSection(0).html).toContain('fb2-empty');
  });

  it('renders emphasis and verse markup', () => {
    const book = openFb2(`<FictionBook><body><section>
      <p><emphasis>em</emphasis><strong>st</strong></p>
      <poem><stanza><v>line</v></stanza></poem>
    </section></body></FictionBook>`);
    const html = book.loadSection(0).html;
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<strong>st</strong>');
    expect(html).toContain('fb2-verse');
  });

  it('renders an inline picture from a <binary> element', () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AH/AAAAAElFTkSuQmCC';
    const book = openFb2(`<FictionBook xmlns:l="http://www.w3.org/1999/xlink"><body><section>
      <p><image l:href="#pic1"/></p></section></body>
      <binary id="pic1" content-type="image/png">${png}</binary></FictionBook>`);
    const loaded = book.loadSection(0, { resolveSrc: (href) => `blob:${href}` });
    expect(loaded.html).toContain('blob:fb2:pic1');
    expect(book.resource('fb2:pic1').bytes.length).toBeGreaterThan(20);
  });

  it('reports the plain text of a section', () => {
    expect(fb2().sectionText(1)).toContain('형광펜');
  });

  it('refuses a document that is not FictionBook', () => {
    expect(() => openFb2('<html><body>no</body></html>')).toThrow(/FictionBook/i);
  });

  it('names the section that does not exist', () => {
    expect(() => fb2().loadSection(50)).toThrow(/section 51/);
  });
});

describe('looksLikeFb2 / decodeFb2', () => {
  it('recognises the root element', () => {
    expect(looksLikeFb2(sampleBytes('sample.fb2'))).toBe(true);
    expect(looksLikeFb2(sampleBytes('sample.txt'))).toBe(false);
  });

  it('recognises the extension', () => {
    expect(looksLikeFb2(new Uint8Array(0), 'book.fb2')).toBe(true);
  });

  it('decodes a UTF-8 document', () => {
    expect(decodeFb2(sampleBytes('sample.fb2'))).toBe(sampleText('sample.fb2'));
  });

  it('honours the encoding named in the XML declaration', () => {
    const latin = Buffer.from('<?xml version="1.0" encoding="windows-1252"?><FictionBook><body><section><p>caf\xe9</p></section></body></FictionBook>', 'latin1');
    expect(decodeFb2(new Uint8Array(latin))).toContain('café');
  });
});
