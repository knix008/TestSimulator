import { describe, it, expect } from 'vitest';
import {
  collapseSearchText, normalizeNeedle, mapCollapsedToOriginal,
  findNeedleOffsets, locateQuery, pageOccurrence, isSameSearchHit,
  scrollOffsetForHit, collectLayerChars, collectLayerSearchHits,
} from '../src/lib/search.js';

describe('collapse / locate', () => {
  it('folds runs of whitespace the same way searchDocument does', () => {
    expect(collapseSearchText('The  Quick\nBrown')).toBe('The Quick Brown');
    expect(normalizeNeedle('  FOX  ')).toBe('fox');
    expect(normalizeNeedle('   ')).toBe('');
  });

  it('maps collapsed offsets back onto the original string', () => {
    const { hay, map } = mapCollapsedToOriginal('A  B\nC');
    expect(hay).toBe('A B C');
    expect(map).toEqual([0, 1, 3, 4, 5]);
  });

  it('finds every non-overlapping occurrence, case-insensitively', () => {
    expect(findNeedleOffsets('The Fox and the fox', 'FOX')).toEqual([
      { index: 4, length: 3 },
      { index: 16, length: 3 },
    ]);
    expect(findNeedleOffsets('aaa', 'aa')).toEqual([{ index: 0, length: 2 }]);
    expect(findNeedleOffsets('hello', '')).toEqual([]);
  });

  it('locates a query in raw text after whitespace folding', () => {
    const hits = locateQuery('The  Quick\nBrown Fox', 'brown fox');
    expect(hits).toHaveLength(1);
    expect('The  Quick\nBrown Fox'.slice(hits[0].start, hits[0].end)).toBe('Brown Fox');
  });
});

describe('hit identity', () => {
  const results = [
    { page: 1, index: 4, pageHit: 0 },
    { page: 1, index: 20, pageHit: 1 },
    { page: 2, index: 0, pageHit: 0 },
  ];

  it('uses pageHit when present and otherwise counts earlier hits on the page', () => {
    expect(pageOccurrence(results, results[1])).toBe(1);
    expect(pageOccurrence(results, { page: 1, index: 20 })).toBe(1);
    expect(pageOccurrence(results, results[2])).toBe(0);
    expect(pageOccurrence(results, null)).toBe(-1);
  });

  it('matches the active sidebar row to the clicked hit', () => {
    expect(isSameSearchHit({ page: 1, index: 20 }, results[1])).toBe(true);
    expect(isSameSearchHit({ page: 1, index: 4 }, results[1])).toBe(false);
    expect(isSameSearchHit(null, results[0])).toBe(false);
  });
});

describe('scrollOffsetForHit', () => {
  const view = {
    rootTop: 0, wrapTop: 100, rootScroll: 0, rootHeight: 400,
    hitTop: 20, hitHeight: 16, margin: 48,
  };

  it('returns null when the hit is already inside the viewport', () => {
    expect(scrollOffsetForHit(view)).toBe(null);
  });

  it('scrolls so a hit below the fold sits near the top margin', () => {
    expect(scrollOffsetForHit({ ...view, hitTop: 500 })).toBe(552);
  });
});

describe('text-layer collection', () => {
  it('walks text nodes once and inserts a newline between stacked spans', () => {
    const layer = document.createElement('div');
    const a = document.createElement('span');
    a.textContent = 'Fox';
    a.getBoundingClientRect = () => ({ top: 10, left: 0, bottom: 22, right: 30, width: 30, height: 12 });
    const b = document.createElement('span');
    b.textContent = 'jumps';
    b.getBoundingClientRect = () => ({ top: 28, left: 0, bottom: 40, right: 40, width: 40, height: 12 });
    const end = document.createElement('div');
    end.className = 'endOfContent';
    end.textContent = 'ignore';
    layer.append(a, b, end);

    const chars = collectLayerChars(layer);
    expect(chars.map((c) => c.ch).join('')).toBe('Fox\njumps');
    expect(chars.some((c) => c.ch !== '\n' && c.node?.textContent === 'ignore')).toBe(false);

    const hits = locateQuery(chars.map((c) => c.ch).join(''), 'fox jumps');
    expect(hits).toHaveLength(1);
  });

  it('does not double-count nested markedContent spans', () => {
    const layer = document.createElement('div');
    const wrap = document.createElement('span');
    wrap.className = 'markedContent';
    const inner = document.createElement('span');
    inner.textContent = 'Fox';
    wrap.append(inner);
    layer.append(wrap);
    expect(collectLayerChars(layer).map((c) => c.ch).join('')).toBe('Fox');
  });

  it('collects layer hits for a query', () => {
    const layer = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = 'The Quick Brown Fox';
    layer.append(span);
    const hits = collectLayerSearchHits(layer, 'fox');
    expect(hits).toHaveLength(1);
    expect(hits[0].end - hits[0].start).toBe(3);
  });
});
