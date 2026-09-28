import { describe, it, expect, vi } from 'vitest';
import { findInText, searchBook, stepHit, groupHits, markHtml, MAX_HITS } from '../src/lib/search.js';
import { openBook } from '../src/lib/book.js';
import { sampleBytes } from './helpers/samples.mjs';

describe('findInText', () => {
  it('finds every occurrence with a snippet', () => {
    const hits = findInText('one two one two one', 'one');
    expect(hits).toHaveLength(3);
    expect(hits[0].snippet).toContain('one');
    expect(hits[1].index).toBe(8);
  });

  it('ignores case but reports the text as written', () => {
    const hits = findInText('Reading is Reading', 'reading');
    expect(hits).toHaveLength(2);
    expect(hits[0].match).toBe('Reading');
  });

  it('finds Korean text', () => {
    expect(findInText('형광펜으로 칠한 형광펜', '형광펜')).toHaveLength(2);
  });

  it('returns nothing for an empty query', () => {
    expect(findInText('text', '')).toEqual([]);
  });

  it('honours the limit', () => {
    expect(findInText('a'.repeat(100), 'a', { limit: 5 })).toHaveLength(5);
  });
});

describe('searchBook', () => {
  it('searches every chapter of a real EPUB', async () => {
    const book = await openBook({ data: sampleBytes('sample.epub'), name: 'sample.epub' });
    const hits = await searchBook(book, 'MyEBookReader');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ section: expect.any(Number), snippet: expect.any(String) });
  });

  it('reports progress as it goes', async () => {
    const book = await openBook({ data: sampleBytes('sample.fb2'), name: 'sample.fb2' });
    const onProgress = vi.fn();
    await searchBook(book, '형광펜', { onProgress });
    expect(onProgress).toHaveBeenCalled();
    const last = onProgress.mock.calls.at(-1)[0];
    expect(last.done).toBe(last.total);
  });

  it('finds nothing for a word the book does not contain', async () => {
    const book = await openBook({ data: sampleBytes('sample.txt'), name: 'sample.txt' });
    expect(await searchBook(book, 'zzzzznotthere')).toEqual([]);
  });

  it('can be cancelled', async () => {
    const book = await openBook({ data: sampleBytes('sample.epub'), name: 'sample.epub' });
    const controller = new AbortController();
    controller.abort();
    await expect(searchBook(book, 'a', { signal: controller.signal })).rejects.toThrow(/cancel/i);
  });

  it('returns nothing without a book or a query', async () => {
    expect(await searchBook(null, 'x')).toEqual([]);
    expect(await searchBook({ sectionCount: 1 }, '   ')).toEqual([]);
  });

  it('caps the number of hits', () => {
    expect(MAX_HITS).toBeGreaterThan(100);
  });
});

describe('stepHit / groupHits', () => {
  const results = [{ section: 0 }, { section: 0 }, { section: 3 }];

  it('walks forward and wraps', () => {
    expect(stepHit(results, -1, 1)).toBe(0);
    expect(stepHit(results, 2, 1)).toBe(0);
  });

  it('walks backward and wraps', () => {
    expect(stepHit(results, 0, -1)).toBe(2);
    expect(stepHit(results, -1, -1)).toBe(2);
  });

  it('has nothing to step through when there are no results', () => {
    expect(stepHit([], 0, 1)).toBe(-1);
  });

  it('groups hits by section', () => {
    const grouped = groupHits(results);
    expect(grouped.get(0)).toHaveLength(2);
    expect(grouped.get(3)).toHaveLength(1);
  });
});

describe('markHtml', () => {
  it('wraps the matches in a mark element', () => {
    expect(markHtml('<p>find me</p>', 'find')).toBe('<p><mark class="find-hit">find</mark> me</p>');
  });

  it('never touches text inside a tag', () => {
    // "p" appears in the tag name and in the attribute, but only the body text
    // may be marked.
    const out = markHtml('<p title="pp">pp</p>', 'pp');
    expect(out).toBe('<p title="pp"><mark class="find-hit">pp</mark></p>');
  });

  it('marks every occurrence', () => {
    expect(markHtml('<p>a a a</p>', 'a').match(/<mark/g)).toHaveLength(3);
  });

  it('keeps the original case of the text', () => {
    expect(markHtml('<p>Reading</p>', 'reading')).toContain('>Reading<');
  });

  it('returns the html unchanged for an empty query', () => {
    expect(markHtml('<p>x</p>', '')).toBe('<p>x</p>');
  });

  it('survives unbalanced markup', () => {
    expect(() => markHtml('<p>x', 'x')).not.toThrow();
  });
});
