import { describe, it, expect } from 'vitest';
import { openCbz, naturalCompare, looksLikeCbz, isCbr } from '../src/lib/cbz.js';
import { sampleBytes } from './helpers/samples.mjs';
import { makeZip } from './helpers/zip.mjs';

const cbz = () => openCbz(sampleBytes('sample.cbz'), { name: 'sample.cbz' });

describe('naturalCompare', () => {
  it('sorts page 2 before page 10', () => {
    expect(naturalCompare('page2.jpg', 'page10.jpg')).toBeLessThan(0);
  });

  it('sorts folders and names sensibly', () => {
    const names = ['ch10/p1.png', 'ch2/p2.png', 'ch2/p10.png', 'ch1/p1.png'];
    expect([...names].sort(naturalCompare)).toEqual([
      'ch1/p1.png', 'ch2/p2.png', 'ch2/p10.png', 'ch10/p1.png',
    ]);
  });

  it('ignores case', () => {
    expect(naturalCompare('A.png', 'a.png')).toBe(0);
  });
});

describe('openCbz', () => {
  it('makes one page per image, in order', () => {
    const book = cbz();
    expect(book.sections.length).toBe(6);
    expect(book.sections[0].href).toBe('page1.png');
    expect(book.sections[5].href).toBe('page6.png');
  });

  it('says the pages are images, not reflowable text', () => {
    expect(cbz().sections[0].kind).toBe('image');
    expect(cbz().format).toBe('cbz');
  });

  it('uses the file name as the title and the first page as the cover', () => {
    const book = cbz();
    expect(book.meta.title).toBe('sample');
    expect(book.coverPath).toBe('page1.png');
    expect(book.meta.pages).toBe(6);
  });

  it('hands the page image to the resolver', () => {
    const loaded = cbz().loadSection(2, { resolveSrc: (path) => `blob:${path}` });
    expect(loaded.kind).toBe('image');
    expect(loaded.src).toBe('blob:page3.png');
    expect(loaded.html).toContain('blob:page3.png');
  });

  it('reads the bytes of a page', () => {
    const resource = cbz().resource('page1.png');
    expect(resource.mime).toBe('image/png');
    expect([...resource.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('lists every page in the contents', () => {
    expect(cbz().toc.length).toBe(6);
  });

  it('names the page that does not exist', () => {
    expect(() => cbz().loadSection(9)).toThrow(/page 10/);
  });

  it('reports an archive that holds no images', () => {
    const textOnly = makeZip([{ name: 'readme.txt', data: 'no pictures here' }]);
    expect(() => openCbz(textOnly, { name: 'x.cbz' })).toThrow(/no images/i);
  });

  it('ignores the __MACOSX noise Finder adds to an archive', () => {
    const archive = makeZip([
      { name: '__MACOSX/._page1.png', data: 'junk' },
      { name: 'page1.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    expect(openCbz(archive, { name: 'x.cbz' }).sections.length).toBe(1);
  });
});

describe('looksLikeCbz / isCbr', () => {
  it('recognises the comic extensions', () => {
    expect(looksLikeCbz(new Uint8Array(0), 'x.cbz')).toBe(true);
    expect(looksLikeCbz(new Uint8Array(0), 'x.cbr')).toBe(true);
    expect(looksLikeCbz(new Uint8Array(0), 'x.epub')).toBe(false);
  });

  it('spots a RAR archive by its magic', () => {
    const rar = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0x00]);
    expect(isCbr(rar)).toBe(true);
  });

  it('accepts a .cbr that is really a ZIP', () => {
    expect(isCbr(sampleBytes('sample.cbz'), 'x.cbr')).toBe(false);
  });
});
