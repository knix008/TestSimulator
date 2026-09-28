import { describe, it, expect } from 'vitest';
import {
  APP_NAME, ZOOM_STEPS, nextZoom, nextFontScale, clampSection, clamp01, normalizeRotation,
  stripRemoteError, failMessage, errorReport, windowTitle,
  clampPopupPos, computePageScale, readingStyle, nextPanel, columnPageCount, columnPageAt,
  bookProgress, pickText, parseRange, pagesForScope, clampPreviewIndex, READING_WIDTHS,
} from '../src/lib/view.js';

describe('zoom and text size', () => {
  it('steps up and down through the zoom stops', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
  });

  it('stops at the ends', () => {
    expect(nextZoom(ZOOM_STEPS.at(-1), 1)).toBe(ZOOM_STEPS.at(-1));
    expect(nextZoom(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0]);
  });

  it('steps the reading text size in tenths', () => {
    expect(nextFontScale(1, 1)).toBe(1.1);
    expect(nextFontScale(1, -1)).toBe(0.9);
  });

  it('keeps the text size within its limits', () => {
    expect(nextFontScale(3, 1)).toBe(3);
    expect(nextFontScale(0.6, -1)).toBe(0.6);
    expect(nextFontScale('nonsense', 1)).toBe(1.1);
  });
});

describe('clamps', () => {
  it('clamps a section to the book', () => {
    expect(clampSection(-3, 5)).toBe(0);
    expect(clampSection(99, 5)).toBe(4);
    expect(clampSection(2, 5)).toBe(2);
    expect(clampSection(2, 0)).toBe(0);
  });

  it('clamps a fraction', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01('x')).toBe(0);
  });

  it('normalises rotation', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
  });

  it('clamps a preview index', () => {
    expect(clampPreviewIndex(5, 3)).toBe(2);
    expect(clampPreviewIndex(-1, 3)).toBe(0);
    expect(clampPreviewIndex(1, 0)).toBe(0);
  });
});

describe('error text', () => {
  it('strips the Electron IPC wrapper', () => {
    expect(stripRemoteError("Error invoking remote method 'fs:readBinary': Error: File not found"))
      .toBe('File not found');
  });

  it('reads a message off anything', () => {
    expect(failMessage(new Error('boom'))).toBe('boom');
    expect(failMessage('plain string')).toBe('plain string');
    expect(failMessage(null)).toBe('null');
  });

  it('builds a copyable report', () => {
    const text = errorReport({ context: 'opening a book', message: 'bad', details: 'stack', file: 'a.epub', at: 0 });
    expect(text).toContain('MyEBookReader');
    expect(text).toContain('bad');
    expect(text).toContain('a.epub');
    expect(text).toContain('stack');
  });
});

describe('window title', () => {
  it('is the app name with no book', () => {
    expect(windowTitle('', false)).toBe(APP_NAME);
  });

  it('names the book, and marks unsaved work', () => {
    expect(windowTitle('a.epub', false)).toBe('a.epub — MyEBookReader');
    expect(windowTitle('a.epub', true)).toBe('a.epub • — MyEBookReader');
  });
});

describe('clampPopupPos', () => {
  it('leaves a popup that fits where it is', () => {
    expect(clampPopupPos({ x: 10, y: 10, width: 100, height: 100, viewW: 800, viewH: 600 }))
      .toEqual({ x: 10, y: 10 });
  });

  it('pulls a popup back from the right edge', () => {
    expect(clampPopupPos({ x: 780, y: 10, width: 100, height: 50, viewW: 800, viewH: 600 }).x)
      .toBe(694);
  });

  it('flips a popup above the anchor when it would run off the bottom', () => {
    expect(clampPopupPos({ x: 10, y: 580, width: 100, height: 200, viewW: 800, viewH: 600 }).y)
      .toBe(380);
  });

  it('never positions a popup off the top', () => {
    expect(clampPopupPos({ x: 0, y: 5, width: 10, height: 1000, viewW: 800, viewH: 600 }).y)
      .toBeGreaterThanOrEqual(6);
  });
});

describe('computePageScale', () => {
  const pageSize = { width: 600, height: 800 };
  const viewport = { width: 856, height: 1000 };

  it('fits the width', () => {
    expect(computePageScale({ pageSize, viewport, zoomMode: 'fit-width' })).toBeCloseTo(1.333, 2);
  });

  it('fits the page', () => {
    expect(computePageScale({ pageSize, viewport, zoomMode: 'fit-page' })).toBeCloseTo(1.18, 2);
  });

  it('honours actual size and a custom zoom', () => {
    expect(computePageScale({ pageSize, viewport, zoomMode: 'actual' })).toBe(1);
    expect(computePageScale({ pageSize, viewport, zoomMode: 'custom', zoom: 2.5 })).toBe(2.5);
  });

  it('swaps the sides when the page is rotated', () => {
    const upright = computePageScale({ pageSize, viewport, zoomMode: 'fit-width' });
    const turned = computePageScale({ pageSize, viewport, zoomMode: 'fit-width', rotation: 90 });
    expect(turned).toBeLessThan(upright);
  });

  it('copes with no measurements yet', () => {
    expect(computePageScale({ pageSize: null, viewport: null, zoomMode: 'fit-width' })).toBe(1);
  });
});

describe('readingStyle', () => {
  it('turns the reading settings into CSS variables', () => {
    const style = readingStyle({
      readerFont: 'Nanum Myeongjo', fontScale: 2, lineHeight: 1.9, readingWidth: 640,
      justify: true, paragraphIndent: true, paragraphGap: 1.2, letterSpacing: 0.5,
      readerBold: true, readerItalic: true, readerUnderline: true,
    });
    expect(style['--read-font']).toBe("'Nanum Myeongjo'");
    expect(style['--read-size']).toBe('34px');
    expect(style['--read-line']).toBe('1.9');
    // The page grows with the text: 640px of paper at twice the size is a
    // page twice as wide, so a line still holds about as many words.
    expect(style['--read-width']).toBe('1280px');
    expect(style['--read-align']).toBe('justify');
    expect(style['--read-indent']).toBe('1.4em');
    expect(style['--read-gap']).toBe('1.2em');
    expect(style['--read-letter']).toBe('0.5px');
    expect(style['--read-weight']).toBe('600');
    expect(style['--read-style']).toBe('italic');
    expect(style['--read-decoration']).toBe('underline');
  });

  it('keeps the page in proportion to the text', () => {
    const small = readingStyle({ readingWidth: 700, fontScale: 0.8 });
    const large = readingStyle({ readingWidth: 700, fontScale: 1.5 });
    expect(small['--read-width']).toBe('560px');
    expect(large['--read-width']).toBe('1050px');
  });

  it('fills the pane when the width is zero', () => {
    expect(readingStyle({ readingWidth: 0 })['--read-width']).toBe('100%');
    expect(READING_WIDTHS).toContain(0);
  });
});

describe('panels and pagination', () => {
  it('toggles a panel to and from none', () => {
    expect(nextPanel('none', 'contents')).toBe('contents');
    expect(nextPanel('bookmarks')).toBe('none');
  });

  it('counts the column pages of a chapter', () => {
    expect(columnPageCount(3000, 1000)).toBe(3);
    expect(columnPageCount(0, 0)).toBe(1);
  });

  it('says which column page is showing', () => {
    expect(columnPageAt(2000, 1000)).toBe(2);
    expect(columnPageAt(0, 0)).toBe(0);
  });

  it('measures progress through the whole book', () => {
    expect(bookProgress({ section: 0, sectionCount: 4, fracY: 0 })).toBe(0);
    expect(bookProgress({ section: 2, sectionCount: 4, fracY: 0 })).toBe(0.5);
    expect(bookProgress({ section: 3, sectionCount: 4, fracY: 1 })).toBe(1);
  });
});

describe('pickText', () => {
  it('takes the first non-empty candidate', () => {
    expect(pickText('', '   ', 'third', 'fourth')).toBe('third');
    expect(pickText(null, undefined)).toBe('');
  });
});

describe('print ranges', () => {
  it('parses single pages, ranges and open ranges', () => {
    expect(parseRange('1-3, 7, 9-', 10).pages).toEqual([1, 2, 3, 7, 9, 10]);
  });

  it('removes duplicates and sorts', () => {
    expect(parseRange('5,1,1,2', 10).pages).toEqual([1, 2, 5]);
  });

  it('reports an empty range', () => {
    expect(parseRange('', 10).error).toBe('print.rangeEmpty');
  });

  it('reports a malformed range', () => {
    expect(parseRange('abc', 10).error).toBe('print.rangeBad');
  });

  it('reports a range outside the book', () => {
    expect(parseRange('1-99', 10).error).toBe('print.rangeOutside');
    expect(parseRange('9-3', 10).error).toBe('print.rangeOutside');
  });

  it('turns a scope into the list of pages', () => {
    expect(pagesForScope({ scope: 'all', count: 3 }).pages).toEqual([1, 2, 3]);
    expect(pagesForScope({ scope: 'current', current: 2, count: 3 }).pages).toEqual([2]);
    expect(pagesForScope({ scope: 'custom', custom: '2-3', count: 3 }).pages).toEqual([2, 3]);
  });

  it('clamps the current page to the book', () => {
    expect(pagesForScope({ scope: 'current', current: 99, count: 3 }).pages).toEqual([3]);
  });
});
