import { describe, it, expect } from 'vitest';
import {
  APP_NAME, ZOOM_STEPS, nextZoom, nextFontScale, clampSection, clamp01, normalizeRotation,
  stripRemoteError, failMessage, errorReport, windowTitle,
  clampPopupPos, computePageScale, readingStyle, nextPanel, columnPageCount, columnPageAt,
  bookProgress, pickText, parseRange, pagesForScope, clampPreviewIndex, READING_WIDTHS,
  FIT_TO_WINDOW, pageModeKey, pageModeOf, bookPageEdge,
  viewLayoutOf, viewLayoutSettings, effectiveZoomMode,
  textColumnsOf, columnSettings, columnChoice, screenColumnsOf,
  ebookSheet, ebookFitScale, EBOOK_PAGE_WIDTH, EBOOK_PAGE_HEIGHT,
} from '../src/lib/view.js';

describe('an ebook page fitted to the window', () => {
  it('gives one page a fixed size, and two pages that same page twice', () => {
    expect(ebookSheet('single')).toEqual({
      pageWidth: EBOOK_PAGE_WIDTH,
      pageHeight: EBOOK_PAGE_HEIGHT,
      width: EBOOK_PAGE_WIDTH,
      height: EBOOK_PAGE_HEIGHT,
    });
    expect(ebookSheet('double').width).toBe(EBOOK_PAGE_WIDTH * 2);
    expect(ebookSheet('double').height).toBe(EBOOK_PAGE_HEIGHT);
  });

  it('enlarges the page to the window without stretching it', () => {
    const page = ebookSheet('single');
    // A wide window is limited by the page's height, so the page stays tall.
    expect(ebookFitScale(page, { width: 2000, height: 780 })).toBe(1);
    // A tall window is limited by the page's width.
    expect(ebookFitScale(page, { width: 520, height: 2000 })).toBe(1);
    expect(ebookFitScale(page, { width: 1040, height: 1560 })).toBe(2);
    expect(ebookFitScale(ebookSheet('double'), { width: 1040, height: 1560 })).toBe(1);
  });
});

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

  it('stops an ebook at its first page and its last', () => {
    expect(bookPageEdge(0, 12, { atStart: true, atEnd: false })).toEqual({ atBookStart: true, atBookEnd: false });
    expect(bookPageEdge(0, 12, { atStart: false, atEnd: false })).toEqual({ atBookStart: false, atBookEnd: false });
    expect(bookPageEdge(11, 12, { atStart: false, atEnd: true })).toEqual({ atBookStart: false, atBookEnd: true });
    expect(bookPageEdge(11, 12, { atStart: false, atEnd: false })).toEqual({ atBookStart: false, atBookEnd: false });
    expect(bookPageEdge(4, 12, { atStart: true, atEnd: true })).toEqual({ atBookStart: false, atBookEnd: false });
    expect(bookPageEdge(0, 8, { fixed: true })).toEqual({ atBookStart: true, atBookEnd: false });
    expect(bookPageEdge(7, 8, { fixed: true })).toEqual({ atBookStart: false, atBookEnd: true });
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

describe('how a file is shown when it is opened', () => {
  it('fits the whole page in the window, upright and unzoomed', () => {
    expect(FIT_TO_WINDOW).toEqual({ zoomMode: 'fit-page', zoom: 1, rotation: 0 });
  });

  it('cannot be changed by accident', () => {
    expect(Object.isFrozen(FIT_TO_WINDOW)).toBe(true);
  });

  it('overrides whatever the last file was left at', () => {
    const left = { zoomMode: 'custom', zoom: 3, rotation: 90, spread: 'double', theme: 'night' };
    const shown = { ...left, ...FIT_TO_WINDOW };
    expect(shown.zoomMode).toBe('fit-page');
    expect(shown.zoom).toBe(1);
    expect(shown.rotation).toBe(0);
    // What the reader chose about the reading itself is theirs, and stays.
    expect(shown.spread).toBe('double');
    expect(shown.theme).toBe('night');
  });
});

describe('one page at a time, or a run to scroll', () => {
  const settings = { pageMode: 'scroll', pageFlow: 'paged' };

  it('asks a reflowable book its own setting', () => {
    expect(pageModeKey({ reflowable: true })).toBe('pageMode');
    expect(pageModeOf(settings, { reflowable: true })).toBe('scroll');
  });

  it('asks a fixed-layout book the other one', () => {
    expect(pageModeKey({ reflowable: false })).toBe('pageFlow');
    expect(pageModeOf(settings, { reflowable: false })).toBe('paged');
  });

  it('treats no book as text, which is what the toolbar shows before one is open', () => {
    expect(pageModeKey(null)).toBe('pageMode');
    expect(pageModeOf(settings, null)).toBe('scroll');
  });

  it('never answers with anything but the two modes', () => {
    // A fixed book with no usable flow is one page in the window, not a run.
    expect(pageModeOf({ pageFlow: 'nonsense' }, { reflowable: false })).toBe('paged');
    expect(pageModeOf({}, { reflowable: false })).toBe('paged');
  });
});

describe('one view at a time, for every format', () => {
  it('keeps a stored layout, whichever format is open', () => {
    const settings = { viewLayout: 'double', pageMode: 'scroll', pageFlow: 'scroll' };
    expect(viewLayoutOf(settings, { reflowable: true })).toBe('double');
    expect(viewLayoutOf(settings, { reflowable: false })).toBe('double');
  });

  it('writes one layout and clears the other two', () => {
    expect(viewLayoutSettings('single')).toMatchObject({
      viewLayout: 'single', pageMode: 'paged', pageFlow: 'paged', spread: 'single', zoomMode: 'fit-page',
    });
    expect(viewLayoutSettings('single').twoColumns).toBeUndefined();
    expect(viewLayoutSettings('double')).toMatchObject({
      viewLayout: 'double', spread: 'double', pageFlow: 'paged',
    });
    expect(viewLayoutSettings('double').columns).toBeUndefined();
    expect(viewLayoutSettings('continuous')).toMatchObject({
      viewLayout: 'continuous', pageMode: 'scroll', pageFlow: 'scroll', spread: 'single',
    });
  });

  it('keeps the text columns when the view changes, and the view when the columns change', () => {
    expect(columnSettings(2)).toEqual({ columns: 2, twoColumns: true });
    expect(columnSettings(1)).toEqual({ columns: 1, twoColumns: false });
    expect(columnChoice({ viewLayout: 'single', pageMode: 'paged' }, { reflowable: true }, 2)).toMatchObject({
      viewLayout: 'single', columns: 2, twoColumns: true,
    });
    // 다단 is only one page. A continuous run and two facing pages stay as they are.
    expect(columnChoice({ viewLayout: 'continuous' }, { reflowable: true }, 2)).toEqual({});
    expect(columnChoice({ viewLayout: 'double', columns: 1 }, { reflowable: true }, 2)).toEqual({});
    expect(textColumnsOf({ twoColumns: true })).toBe(2);
    expect(textColumnsOf({ columns: 3 })).toBe(2);
    expect(screenColumnsOf({ columns: 2 }, 'single')).toBe(2);
    expect(screenColumnsOf({ columns: 2 }, 'double')).toBe(2);
    expect(screenColumnsOf({ columns: 1 }, 'double')).toBe(2);
    expect(screenColumnsOf({ columns: 2 }, 'continuous')).toBe(1);
  });

  it('fits a single page to the window, and keeps a zoom', () => {
    expect(effectiveZoomMode({ zoomMode: 'fit-width' }, 'single')).toBe('fit-page');
    expect(effectiveZoomMode({ zoomMode: 'custom' }, 'single')).toBe('custom');
    expect(effectiveZoomMode({ zoomMode: 'fit-width' }, 'double')).toBe('fit-width');
    expect(effectiveZoomMode({ zoomMode: 'fit-height' }, 'continuous')).toBe('fit-height');
  });
});

describe('reading a chapter a page at a time', () => {
  it('counts the last part-page as a page of its own', () => {
    // A chapter 2.4 screens wide takes three pages to read to the end. Rounding
    // to the nearest said two, and the last two fifths could not be reached.
    expect(columnPageCount(2400, 1000)).toBe(3);
    expect(columnPageCount(2600, 1000)).toBe(3);
    expect(columnPageCount(1001, 1000)).toBe(1);
    expect(columnPageCount(3000, 1000)).toBe(3);
    expect(columnPageCount(1, 1000)).toBe(1);
  });

  it('counts a chapter that fits on one screen as one page', () => {
    expect(columnPageCount(1000, 1000)).toBe(1);
    expect(columnPageCount(400, 1000)).toBe(1);
    expect(columnPageCount(0, 1000)).toBe(1);
  });

  it('counts one facing page when two are on the screen', () => {
    // A sheet of 1000 shows two pages of 500. 2400px of text stops 1400 along,
    // which is four pages to turn, not two spreads.
    expect(columnPageCount(2400, 1000, 500)).toBe(4);
    expect(columnPageAt(0, 1000, 2400, 500)).toBe(0);
    expect(columnPageAt(500, 1000, 2400, 500)).toBe(1);
    expect(columnPageAt(1400, 1000, 2400, 500)).toBe(3);
  });

  it('calls the far end of a chapter its last page', () => {
    // 2.4 screens: the pane can only scroll to 1400, which is not a whole
    // number of pages — but it is the last page, and has to be reported as one
    // or "next page" could never leave the chapter.
    expect(columnPageAt(1400, 1000, 2400)).toBe(2);
    expect(columnPageAt(1000, 1000, 2400)).toBe(1);
    expect(columnPageAt(0, 1000, 2400)).toBe(0);
  });

  it('never reports a page the chapter does not have', () => {
    expect(columnPageAt(99999, 1000, 2400)).toBe(2);
    expect(columnPageAt(500, 1000, 1000)).toBe(0);
  });

  it('still answers without being told where the end is', () => {
    expect(columnPageAt(2000, 1000)).toBe(2);
    expect(columnPageAt(0, 0)).toBe(0);
  });
});

describe('the page margin', () => {
  it('hands the reader’s two margins to the stylesheet', () => {
    const style = readingStyle({ pageMarginX: 40, pageMarginY: 10 });
    expect(style['--read-pad-x']).toBe('40px');
    expect(style['--read-pad-y']).toBe('10px');
  });

  it('falls back to the standard margin when nothing is set', () => {
    const style = readingStyle({});
    expect(style['--read-pad-x']).toBe('18px');
    expect(style['--read-pad-y']).toBe('28px');
  });
});
