import { describe, it, expect } from 'vitest';
import { coverPageOf } from '../src/lib/coverpage.js';

const bookWith = (over = {}) => ({
  sectionCount: 3,
  cover: () => '',
  loadSection: () => ({ kind: 'html', html: '<p>Chapter one</p>' }),
  pdf: null,
  ...over,
});

describe('the picture at the top of the properties panel', () => {
  it('is the book’s own cover when it has one', () => {
    const page = coverPageOf(bookWith({ cover: () => 'blob:cover' }));
    expect(page).toEqual({ source: 'cover', kind: 'image', src: 'blob:cover' });
  });

  it('falls back to the first page — a picture book’s first picture', () => {
    const page = coverPageOf(bookWith({
      loadSection: (i) => ({ kind: 'image', src: `blob:page-${i}`, html: '<img>' }),
    }));
    expect(page).toEqual({ source: 'first', kind: 'image', src: 'blob:page-0' });
  });

  it('keeps a MOBI first page whole, the picture with the words around it', () => {
    const page = coverPageOf(bookWith({
      format: 'mobi',
      loadSection: () => ({
        kind: 'html',
        html: '<p>Title</p><img src="blob:first">',
      }),
    }));
    expect(page).toMatchObject({ source: 'first', kind: 'html' });
    expect(page.html).toContain('Title');
    expect(page.html).toContain('blob:first');
  });

  it('falls back to the first chapter of a book of text', () => {
    const page = coverPageOf(bookWith());
    expect(page).toMatchObject({ source: 'first', kind: 'html' });
    expect(page.html).toContain('Chapter one');
  });

  it('falls back to page one of a PDF, which has to be painted', () => {
    const page = coverPageOf(bookWith({
      pdf: { numPages: 9 },
      loadSection: () => ({ kind: 'pdf', page: 1, html: '' }),
    }));
    expect(page).toEqual({ source: 'first', kind: 'pdf', page: 1 });
  });

  it('gives nothing at all rather than throwing', () => {
    expect(coverPageOf(null)).toBeNull();
    expect(coverPageOf(bookWith({ sectionCount: 0 }))).toBeNull();
    expect(coverPageOf(bookWith({ cover: () => { throw new Error('no'); } }))).toMatchObject({ kind: 'html' });
    expect(coverPageOf(bookWith({ loadSection: () => { throw new Error('no'); } }))).toBeNull();
    // A section that is neither a picture, a PDF page nor markup.
    expect(coverPageOf(bookWith({ loadSection: () => ({ kind: 'html', html: '' }) }))).toBeNull();
  });
});
