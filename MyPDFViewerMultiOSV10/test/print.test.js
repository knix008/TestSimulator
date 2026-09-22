import { describe, it, expect, vi } from 'vitest';
import {
  PRINT_SCOPES, PRINT_DPI, parsePageList, pagesForScope, toContiguousRanges, buildPrintHtml,
  clampPreviewIndex, renderPreviewPage,
} from '../src/lib/print.js';

describe('print constants', () => {
  it('supports all / current / custom at 150 DPI', () => {
    expect(PRINT_SCOPES).toEqual(['all', 'current', 'custom']);
    expect(PRINT_DPI).toBe(150);
  });
});

describe('parsePageList', () => {
  it('parses comma and whitespace separated pages', () => {
    expect(parsePageList('1, 3, 5', 10).pages).toEqual([1, 3, 5]);
    expect(parsePageList('1 3 5', 10).pages).toEqual([1, 3, 5]);
  });

  it('expands ranges with hyphen or tilde, including reversed ones', () => {
    expect(parsePageList('1-5', 10).pages).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageList('11-13', 20).pages).toEqual([11, 12, 13]);
    expect(parsePageList('5-1', 10).pages).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageList('3~5', 10).pages).toEqual([3, 4, 5]);
    expect(parsePageList('1-5, 8, 11-13', 20).pages).toEqual([1, 2, 3, 4, 5, 8, 11, 12, 13]);
  });

  it('de-duplicates overlapping ranges', () => {
    expect(parsePageList('1-4, 3-6, 2', 10).pages).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('returns rangeEmpty for blank input', () => {
    expect(parsePageList('', 10)).toEqual({ pages: [], error: 'print.rangeEmpty' });
    expect(parsePageList('   ', 10)).toEqual({ pages: [], error: 'print.rangeEmpty' });
    expect(parsePageList(null, 10)).toEqual({ pages: [], error: 'print.rangeEmpty' });
  });

  it('returns rangeInvalid for junk tokens or zero', () => {
    expect(parsePageList('abc', 10).error).toBe('print.rangeInvalid');
    expect(parsePageList('1-x', 10).error).toBe('print.rangeInvalid');
    expect(parsePageList('0', 10).error).toBe('print.rangeInvalid');
    expect(parsePageList('0-3', 10).error).toBe('print.rangeInvalid');
    expect(parsePageList('1, foo, 3', 10).error).toBe('print.rangeInvalid');
  });

  it('returns rangeOutside when a page exceeds the document', () => {
    expect(parsePageList('9', 5).error).toBe('print.rangeOutside');
    expect(parsePageList('1-6', 5).error).toBe('print.rangeOutside');
    expect(parsePageList('1, 99', 10).error).toBe('print.rangeOutside');
  });

  it('accepts the last page of the document', () => {
    expect(parsePageList('5', 5).pages).toEqual([5]);
    expect(parsePageList('1-5', 5).pages).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('pagesForScope', () => {
  it('returns every page for the default / all scope', () => {
    expect(pagesForScope({ scope: 'all', pageNumber: 2, numPages: 4 }).pages).toEqual([1, 2, 3, 4]);
    expect(pagesForScope({ scope: 'unknown', pageNumber: 2, numPages: 3 }).pages).toEqual([1, 2, 3]);
  });

  it('returns only the current page', () => {
    expect(pagesForScope({ scope: 'current', pageNumber: 7, numPages: 20 }).pages).toEqual([7]);
  });

  it('delegates custom text to parsePageList', () => {
    const ok = pagesForScope({ scope: 'custom', custom: '2-4', pageNumber: 1, numPages: 10 });
    expect(ok.pages).toEqual([2, 3, 4]);
    const bad = pagesForScope({ scope: 'custom', custom: '', pageNumber: 1, numPages: 10 });
    expect(bad.error).toBe('print.rangeEmpty');
  });

  it('returns an empty list when the document has no pages', () => {
    expect(pagesForScope({ scope: 'all', numPages: 0 }).pages).toEqual([]);
  });
});

describe('toContiguousRanges', () => {
  it('collapses consecutive numbers', () => {
    expect(toContiguousRanges([1, 2, 3, 7, 8])).toEqual([
      { from: 1, to: 3 },
      { from: 7, to: 8 },
    ]);
  });

  it('keeps isolated pages as single-page ranges', () => {
    expect(toContiguousRanges([1, 3, 5])).toEqual([
      { from: 1, to: 1 },
      { from: 3, to: 3 },
      { from: 5, to: 5 },
    ]);
  });

  it('handles empty and singleton lists', () => {
    expect(toContiguousRanges([])).toEqual([]);
    expect(toContiguousRanges([4])).toEqual([{ from: 4, to: 4 }]);
  });
});

describe('clampPreviewIndex', () => {
  it('keeps the index inside the selection', () => {
    expect(clampPreviewIndex(0, 4)).toBe(0);
    expect(clampPreviewIndex(3, 4)).toBe(3);
    expect(clampPreviewIndex(-2, 4)).toBe(0);
    expect(clampPreviewIndex(99, 4)).toBe(3);
    expect(clampPreviewIndex(1, 0)).toBe(0);
    expect(clampPreviewIndex('2', 5)).toBe(2);
  });
});

describe('renderPreviewPage', () => {
  it('scales the page to fit the preview box', async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    const page = {
      rotate: 0,
      getViewport: ({ scale = 1 } = {}) => ({ width: 600 * scale, height: 800 * scale, scale }),
      render,
    };
    const doc = { getPage: vi.fn(async () => page) };
    const canvas = { getContext: () => ({}), style: {} };
    const res = await renderPreviewPage({
      doc, pageNumber: 2, canvas, rotation: 0, maxWidth: 240, maxHeight: 300,
    });
    expect(doc.getPage).toHaveBeenCalledWith(2);
    expect(res.page).toBe(2);
    expect(res.width).toBeLessThanOrEqual(240);
    expect(res.height).toBeLessThanOrEqual(300);
    expect(render).toHaveBeenCalled();
  });
});

describe('buildPrintHtml', () => {
  it('emits one sheet per image and escapes the title', () => {
    const html = buildPrintHtml(
      [{ src: 'data:image/jpeg;base64,AAA' }, { src: 'data:image/jpeg;base64,BBB' }],
      'A & B <report>',
    );
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('A &amp; B &lt;report&gt;');
    expect(html).not.toContain('A & B <report>');
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).toContain('src="data:image/jpeg;base64,AAA"');
    expect(html).toContain('page-break-after: always');
    expect(html).toContain('.sheet:last-child');
  });

  it('falls back to Print when the title is missing', () => {
    expect(buildPrintHtml([], null)).toContain('<title>Print</title>');
    expect(buildPrintHtml([], undefined)).toContain('<title>Print</title>');
  });

  it('escapes quotes in the title', () => {
    expect(buildPrintHtml([], 'say "hi"')).toContain('say &quot;hi&quot;');
  });
});
