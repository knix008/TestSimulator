import { describe, it, expect } from 'vitest';
import { measureBook, pageAt, pagesUnknown, CHARS_PER_PAGE } from '../src/lib/pages.js';

// How many pages a book has.
//
// The point of measuring reflowable text in characters is that the answer
// belongs to the book: it must be the same number whatever size the window is
// and however big the letters are. These tests are mostly about that.

/** A book of chapters of a given length in characters. */
function textBook(lengths) {
  return {
    reflowable: true,
    sectionCount: lengths.length,
    sections: lengths.map((_, i) => ({ label: String(i + 1) })),
    sectionText: (i) => 'x'.repeat(lengths[i] ?? 0),
  };
}

/** A book whose pages are its own — a PDF, a comic, a picture. */
function pageBook(count) {
  return {
    reflowable: false,
    sectionCount: count,
    sections: new Array(count).fill(0).map((_, i) => ({ label: String(i + 1) })),
    sectionText: () => '',
  };
}

describe('counting the pages of a book', () => {
  it('counts a fixed-layout book exactly — its pages are its own', async () => {
    const map = await measureBook(pageBook(7));
    expect(map.pages).toBe(7);
    expect(map.estimated).toBe(false);
    // And a section of it *is* a page.
    expect(pageAt(map, { section: 0 })).toBe(1);
    expect(pageAt(map, { section: 6 })).toBe(7);
  });

  it('never reads a fixed-layout book to count it', async () => {
    let asked = 0;
    const book = pageBook(400);
    book.sectionText = () => { asked += 1; return ''; };
    await measureBook(book);
    expect(asked).toBe(0);
  });

  it('measures reflowable text in characters', async () => {
    const map = await measureBook(textBook([CHARS_PER_PAGE, CHARS_PER_PAGE, CHARS_PER_PAGE]));
    expect(map.estimated).toBe(true);
    expect(map.total).toBe(CHARS_PER_PAGE * 3);
    expect(map.pages).toBe(3);
  });

  it('gives a short book at least a page for every chapter', async () => {
    // Three chapters of a sentence each are three pages, not one: a chapter
    // starts on a new page, and "page 1 of 1" while the reader is in chapter 3
    // would be nonsense.
    const map = await measureBook(textBook([40, 40, 40]));
    expect(map.pages).toBe(3);
  });

  it('says which page the reader is on from how far through they are', async () => {
    const map = await measureBook(textBook([CHARS_PER_PAGE * 4]));
    expect(map.pages).toBe(4);
    expect(pageAt(map, { section: 0, fracY: 0 })).toBe(1);
    expect(pageAt(map, { section: 0, fracY: 0.5 })).toBe(3);
    expect(pageAt(map, { section: 0, fracY: 1 })).toBe(4);
  });

  it('counts the chapters behind the reader, not only the one they are in', async () => {
    const map = await measureBook(textBook([CHARS_PER_PAGE * 2, CHARS_PER_PAGE * 2]));
    expect(pageAt(map, { section: 1, fracY: 0 })).toBe(3);
    expect(pageAt(map, { section: 1, fracY: 1 })).toBe(4);
  });

  it('never answers with a page the book does not have', async () => {
    const map = await measureBook(textBook([100, 100]));
    expect(pageAt(map, { section: 99, fracY: 9 })).toBeLessThanOrEqual(map.pages);
    expect(pageAt(map, { section: -5, fracY: -5 })).toBeGreaterThanOrEqual(1);
  });

  it('has nothing to say about no book at all', async () => {
    const map = await measureBook(null);
    expect(map.pages).toBe(0);
    expect(pageAt(map, { section: 0 })).toBe(0);
    expect(pageAt(null, { section: 0 })).toBe(0);
  });

  it('survives a chapter it cannot read', async () => {
    const book = textBook([CHARS_PER_PAGE, CHARS_PER_PAGE]);
    book.sectionText = (i) => { if (i === 1) throw new Error('damaged'); return 'x'.repeat(CHARS_PER_PAGE); };
    const map = await measureBook(book);
    expect(map.pages).toBeGreaterThanOrEqual(2);
  });

  it('can be given up on, so closing a book does not leave it counting', async () => {
    const signal = { cancelled: true };
    expect(await measureBook(textBook([100, 100, 100]), { signal })).toBeNull();
  });

  it('lets the window breathe while a long book is counted', async () => {
    // Nothing to assert about timing that would not be flaky; what matters is
    // that a book of many chapters is counted at all, and correctly.
    const map = await measureBook(textBook(new Array(120).fill(CHARS_PER_PAGE)));
    expect(map.pages).toBe(120);
    expect(pageAt(map, { section: 60, fracY: 0 })).toBe(61);
  });

  it('has a shape to show while the counting is still going on', () => {
    const waiting = pagesUnknown({ sectionCount: 9 });
    expect(waiting.pages).toBe(0);
    expect(waiting.lengths).toHaveLength(9);
  });
});
