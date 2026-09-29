import { describe, it, expect } from 'vitest';
import {
  ZOOM_STEPS, TOOLS, HIGHLIGHT_COLOR, MIN_CAPTURE, PAGE_PAD_X, PAGE_PAD_Y,
  nextZoom, clampPage, normalizeRotation, cycleTool,
  stripRemoteError, failMessage, windowTitle, bookmarkLabel, isHttpUrl,
  computeScale, centerOverflowX, centerOverflowY, shouldCenterSheet, pagePlaceholderSize, mergeRectsIntoLines,
  hitTestRegion, normalizeDragRect, isMeaningfulCapture, regionToFrac, regionMarkStyle,
  visibleRegionBox, nextSidebar, PAGE_LAYOUTS, SPREAD_GAP,
  normalizePageLayout, isPagedLayout, usesDocumentScroll, sheetCountForScroll,
  sheetIndexForScroll, sheetSlotHeight, pageFromDocumentScroll, documentScrollTopForPage,
  documentScrollTail, spreadStart, pagesForLayout, stepPage, sameSheet, spreadLonePage, paintsEagerly,
  pinDocumentScrollTop, centerDocumentSheetTop, documentSheetScrollTop, shiftDocumentScrollTop, wheelPageStep, FIT_ZOOM_MODES, normalizeZoomMode, zoomModeLabelKey,
  PAGE_EFFECTS, PAGE_TURN_MS, TURN_SETTLE_MS, normalizePageEffect, nextPageEffect, pageTurnDir,
  pageTurnLeafDir,
  prefersReducedMotion, shouldPlayPageTurn, snapshotPageCanvases, captureOutgoingSheet,
  outgoingSheetPages, sheetIsPainted, planPageTurn, turnSpacerPage, sheetOverlapsViewport, overlayBoxForSheet, applyOverlayBox, isTurnBusy, leafFrontShot, leafBackPage, leafBackShot, leafStayShot, leafStayBlank, leafStaySide, turnLeafSize,
  sheetShotBox,
  clampPopupPos, pickCopyText, paintedSelectionToRects,
  bookmarkRecord, bookmarkAnchorY, bookmarkPaintRects, locFromTop, hasPageLoc, clamp01,
} from '../src/lib/view.js';

describe('zoom steps', () => {
  it('spans 25% to 800% and includes 100%', () => {
    expect(ZOOM_STEPS[0]).toBe(0.25);
    expect(ZOOM_STEPS.at(-1)).toBe(8);
    expect(ZOOM_STEPS).toContain(1);
    expect(ZOOM_STEPS).toEqual([...ZOOM_STEPS].sort((a, b) => a - b));
  });

  it('zooms in to the next listed step', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1.1, 1)).toBe(1.25);
    expect(nextZoom(0.25, 1)).toBe(0.33);
  });

  it('zooms out to the previous listed step', () => {
    expect(nextZoom(1.1, -1)).toBe(1);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(8, -1)).toBe(6);
  });

  it('clamps at both ends', () => {
    expect(nextZoom(8, 1)).toBe(8);
    expect(nextZoom(0.25, -1)).toBe(0.25);
    expect(nextZoom(100, 1)).toBe(8);
    expect(nextZoom(0.01, -1)).toBe(0.25);
  });

  it('from a value between two steps, zooms in to the next and out to the previous listed step', () => {
    // 1.05 sits between 1 and 1.1. The implementation finds the first step
    // above current and then walks one step back (in) or two (out).
    expect(nextZoom(1.05, 1)).toBe(1.1);
    expect(nextZoom(1.05, -1)).toBe(0.9);
  });
});

describe('pages / rotation / tools', () => {
  it('clamps page numbers to 1..numPages', () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-4, 10)).toBe(1);
    expect(clampPage(3, 10)).toBe(3);
    expect(clampPage(99, 10)).toBe(10);
    expect(clampPage(2.6, 10)).toBe(3);
    expect(clampPage('4', 10)).toBe(4);
    expect(clampPage('x', 10)).toBe(1);
    expect(clampPage(5, 0)).toBe(1);
    expect(clampPage(5, null)).toBe(1);
  });

  it('normalizes rotation into 0..359', () => {
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-450)).toBe(270);
    expect(normalizeRotation(undefined)).toBe(0);
  });

  it('cycles text → image → region → text', () => {
    expect(TOOLS).toEqual(['text', 'image', 'region']);
    expect(cycleTool('text')).toBe('image');
    expect(cycleTool('image')).toBe('region');
    expect(cycleTool('region')).toBe('text');
    expect(cycleTool('unknown')).toBe('text');
    expect(cycleTool(cycleTool(cycleTool('text')))).toBe('text');
  });

  it('toggles the sidebar with F9 semantics', () => {
    expect(nextSidebar('none')).toBe('thumbnails');
    expect(nextSidebar('thumbnails')).toBe('none');
    expect(nextSidebar('search')).toBe('none');
  });
});

describe('page layouts', () => {
  it('keeps single, continuous and two-page spread', () => {
    expect(PAGE_LAYOUTS).toEqual(['single', 'continuous', 'spread']);
    expect(normalizePageLayout('spread')).toBe('spread');
    expect(normalizePageLayout('facing')).toBe('continuous');
    expect(isPagedLayout('single')).toBe(true);
    expect(isPagedLayout('spread')).toBe(true);
    expect(isPagedLayout('continuous')).toBe(false);
    expect(paintsEagerly('single')).toBe(true);
    expect(paintsEagerly('spread')).toBe(true);
    expect(paintsEagerly('continuous')).toBe(false);
    expect(FIT_ZOOM_MODES).toEqual(['fit-page', 'fit-width', 'fit-height', 'actual']);
    expect(normalizeZoomMode('fit-height')).toBe('fit-height');
    expect(normalizeZoomMode('stretch')).toBe('fit-width');
    expect(zoomModeLabelKey('fit-page')).toBe('fitPage');
    expect(zoomModeLabelKey('fit-height')).toBe('fitHeight');
  });

  it('pairs pages as 1–2, 3–4 and mounts only that pair in spread', () => {
    expect(spreadStart(1, 5)).toBe(1);
    expect(spreadStart(2, 5)).toBe(1);
    expect(spreadStart(4, 5)).toBe(3);
    expect(spreadStart(5, 5)).toBe(5);
    expect(pagesForLayout('single', 3, 5)).toEqual([3]);
    expect(pagesForLayout('spread', 2, 5)).toEqual([1, 2]);
    expect(pagesForLayout('spread', 5, 5)).toEqual([5]);
    expect(spreadLonePage('spread', [5])).toBe(true);
    expect(spreadLonePage('spread', [5, 6])).toBe(false);
    expect(spreadLonePage('single', [5])).toBe(false);
    expect(pagesForLayout('continuous', 3, 4)).toEqual([1, 2, 3, 4]);
    expect(pagesForLayout('single', 1, 0)).toEqual([]);
  });

  it('steps one page, or a whole spread, and stops at the ends', () => {
    expect(stepPage('single', 2, 1, 5)).toBe(3);
    expect(stepPage('continuous', 2, -1, 5)).toBe(1);
    expect(stepPage('spread', 1, 1, 5)).toBe(3);
    expect(stepPage('spread', 2, 1, 5)).toBe(3);
    expect(stepPage('spread', 4, -1, 5)).toBe(1);
    expect(stepPage('spread', 1, -1, 5)).toBe(1);
    expect(stepPage('spread', 2, -1, 5)).toBe(2);
    expect(stepPage('spread', 5, 1, 5)).toBe(5);
    expect(stepPage('spread', 5, 1, 6)).toBe(5);
    expect(stepPage('spread', 6, 1, 6)).toBe(6);
    expect(sameSheet('spread', 1, 2, 6)).toBe(true);
    expect(sameSheet('spread', 1, 3, 6)).toBe(false);
    expect(sameSheet('spread', 5, 6, 6)).toBe(true);
    expect(sameSheet('single', 2, 2, 6)).toBe(true);
    expect(sameSheet('single', 2, 3, 6)).toBe(false);
    expect(stepPage('single', 1, -1, 5)).toBe(1);
  });

  it('gives single and two-page view a scrollbar over the whole document', () => {
    expect(usesDocumentScroll('single')).toBe(true);
    expect(usesDocumentScroll('spread')).toBe(true);
    expect(usesDocumentScroll('continuous')).toBe(false);
    expect(sheetCountForScroll('single', 5)).toBe(5);
    expect(sheetCountForScroll('spread', 5)).toBe(3);
    expect(sheetIndexForScroll('single', 3, 5)).toBe(2);
    expect(sheetIndexForScroll('spread', 4, 5)).toBe(1);
    expect(sheetSlotHeight({ pageHeight: 800, gap: 18 })).toBe(818);
    expect(sheetSlotHeight({ pageHeight: 400, viewportHeight: 900, fillViewport: true })).toBe(900);
    const metrics = { slot: 800, sheets: 5, layout: 'single', numPages: 5 };
    expect(pageFromDocumentScroll(0, metrics)).toBe(1);
    expect(pageFromDocumentScroll(800, metrics)).toBe(2);
    expect(pageFromDocumentScroll(3999, metrics)).toBe(5);
    expect(documentScrollTopForPage(3, metrics)).toBe(1600);
    expect(documentScrollTail(3, metrics)).toBe(1600);
    expect(documentScrollTail(5, metrics)).toBe(0);
    // Overlay next/prev pins scrollTop from page + slot only — a missing
    // canvas wrapper must not delay that pin until after the turn cover lifts.
    expect(pageFromDocumentScroll(documentScrollTopForPage(4, metrics), metrics)).toBe(4);
    expect(documentScrollTopForPage(1, metrics)).toBe(0);
    const spread = { slot: 900, sheets: 4, layout: 'spread', numPages: 8 };
    expect(pinDocumentScrollTop(1, spread)).toBe(0);
    expect(pinDocumentScrollTop(3, spread)).toBe(900);
    expect(pinDocumentScrollTop(3, { ...spread, slot: 400 })).toBe(400);
    expect(pageFromDocumentScroll(pinDocumentScrollTop(5, spread), spread)).toBe(5);
    const zoomed = { slot: 1200, sheets: 3, layout: 'single', numPages: 3 };
    expect(centerDocumentSheetTop(1, zoomed, 800)).toBe(200);
    expect(centerDocumentSheetTop(2, zoomed, 800)).toBe(1400);
    expect(centerDocumentSheetTop(1, { slot: 800, sheets: 1, layout: 'single', numPages: 1 }, 800)).toBe(0);
    expect(documentSheetScrollTop(1, zoomed, 800)).toBe(0);
    expect(documentSheetScrollTop(1, zoomed, 800, 'top')).toBe(0);
    expect(documentSheetScrollTop(1, zoomed, 800, 'bottom')).toBe(400);
    expect(documentSheetScrollTop(1, { slot: 800, sheets: 1, layout: 'single', numPages: 1 }, 800)).toBe(0);
    expect(shiftDocumentScrollTop(1, 2, 9, { slot: 800, layout: 'single', numPages: 5 })).toBe(809);
    expect(shiftDocumentScrollTop(2, 1, 809, { slot: 800, layout: 'single', numPages: 5 })).toBe(9);
    expect(wheelPageStep(80, { scrollTop: 0, scrollHeight: 800, clientHeight: 800 })).toBe(1);
    expect(wheelPageStep(-80, { scrollTop: 0, scrollHeight: 800, clientHeight: 800 })).toBe(-1);
    expect(wheelPageStep(80, { scrollTop: 100, scrollHeight: 1400, clientHeight: 800 })).toBe(0);
    expect(wheelPageStep(80, { scrollTop: 599, scrollHeight: 1400, clientHeight: 800 })).toBe(1);
    expect(wheelPageStep(-80, { scrollTop: 40, scrollHeight: 1400, clientHeight: 800 })).toBe(0);
    expect(wheelPageStep(-80, { scrollTop: 0, scrollHeight: 1400, clientHeight: 800 })).toBe(-1);
    expect(wheelPageStep(0, { scrollTop: 0, scrollHeight: 800, clientHeight: 800 })).toBe(0);
    // A fitted sheet in a long document still turns — do not treat the
    // remaining pages' spacers as overflow of this page.
    expect(wheelPageStep(80, {
      scrollTop: 1600, clientHeight: 800, slot: 800, pageTop: 1600,
    })).toBe(1);
    expect(wheelPageStep(80, {
      scrollTop: 1700, clientHeight: 800, slot: 1200, pageTop: 1600,
    })).toBe(0);
    expect(wheelPageStep(80, {
      scrollTop: 1999, clientHeight: 800, slot: 1200, pageTop: 1600,
    })).toBe(1);
    expect(wheelPageStep(-80, {
      scrollTop: 1600, clientHeight: 800, slot: 1200, pageTop: 1600,
    })).toBe(-1);
  });
});

describe('page-turn effects', () => {
  it('cycles none → fade → slide → flip → none', () => {
    expect(PAGE_EFFECTS).toEqual(['none', 'fade', 'slide', 'flip']);
    expect(PAGE_TURN_MS).toBe(640);
    expect(TURN_SETTLE_MS).toBe(120);
    expect(isTurnBusy({ id: '1' }, 0, 1000)).toBe(true);
    expect(isTurnBusy(null, 1100, 1000)).toBe(true);
    expect(isTurnBusy(null, 900, 1000)).toBe(false);
    expect(normalizePageEffect('flip')).toBe('flip');
    expect(normalizePageEffect('curl')).toBe('none');
    expect(nextPageEffect('none')).toBe('fade');
    expect(nextPageEffect('flip')).toBe('none');
    expect(pageTurnDir(2, 4)).toBe('next');
    expect(pageTurnDir(4, 2)).toBe('prev');
    expect(pageTurnLeafDir('next')).toBe('forward');
    expect(pageTurnLeafDir('prev')).toBe('back');
  });

  it('plays only in single-page and two-page view, not while scrolling continuously', () => {
    expect(shouldPlayPageTurn({ effect: 'flip', layout: 'single', fromPage: 1, toPage: 2 })).toBe(true);
    expect(shouldPlayPageTurn({ effect: 'slide', layout: 'spread', fromPage: 1, toPage: 3 })).toBe(true);
    expect(shouldPlayPageTurn({ effect: 'flip', layout: 'continuous', fromPage: 1, toPage: 2 })).toBe(false);
    expect(shouldPlayPageTurn({ effect: 'none', layout: 'single', fromPage: 1, toPage: 2 })).toBe(false);
    expect(shouldPlayPageTurn({ effect: 'flip', layout: 'single', fromPage: 2, toPage: 2 })).toBe(false);
    expect(shouldPlayPageTurn({
      effect: 'flip', layout: 'single', fromPage: 1, toPage: 2, reducedMotion: true,
    })).toBe(false);
  });

  it('snapshots one page, or a facing pair, as the outgoing sheet', () => {
    expect(outgoingSheetPages('single', 3, 10)).toEqual([3]);
    expect(outgoingSheetPages('continuous', 3, 10)).toEqual([3]);
    expect(outgoingSheetPages('spread', 3, 10)).toEqual([3, 4]);
    expect(outgoingSheetPages('spread', 2, 10)).toEqual([1, 2]);
  });

  it('picks the turning leaf and the page it lands as', () => {
    const left = { num: 1, src: 'a' };
    const right = { num: 2, src: 'b' };
    expect(leafFrontShot([left, right], 'next')).toEqual(right);
    expect(leafFrontShot([left, right], 'prev')).toEqual(left);
    expect(leafFrontShot([left], 'next')).toEqual(left);
    expect(leafStayShot([left, right], 'next')).toEqual(left);
    expect(leafStayShot([left, right], 'prev')).toEqual(right);
    expect(leafStayShot([left], 'next')).toBe(null);
    expect(leafStayBlank('spread', [left], 'prev')).toBe(true);
    expect(leafStayBlank('spread', [left, right], 'prev')).toBe(false);
    expect(leafStayBlank('single', [left], 'prev')).toBe(false);
    expect(leafStaySide('next')).toBe('left');
    expect(leafStaySide('prev')).toBe('right');
    expect(leafBackPage('spread', 'next', 3, 10)).toBe(3);
    expect(leafBackPage('spread', 'prev', 1, 10)).toBe(2);
    expect(leafBackPage('single', 'next', 2, 10)).toBe(0);
    expect(leafBackPage('single', 'prev', 1, 10)).toBe(0);
    expect(leafBackShot(new Map(), 'single', 'next', 2, 10)).toBe(null);
    expect(turnLeafSize('spread', 2)).toBe('half');
    expect(turnLeafSize('spread', 1)).toBe('half');
    expect(turnLeafSize('single', 1)).toBe('whole');
    expect(sheetShotBox([{ width: 200, height: 300 }, { width: 180, height: 290 }])).toEqual({
      width: 380, height: 300,
    });
    expect(sheetShotBox([])).toBe(null);
  });

  it('knows when every page on a sheet has a painted canvas', () => {
    const canvas = { width: 40, height: 50 };
    const map = new Map([[1, { canvas, painted: true }], [2, { canvas, painted: true }]]);
    expect(sheetIsPainted(map, [1, 2])).toBe(true);
    expect(sheetIsPainted(map, [1, 3])).toBe(false);
    expect(sheetIsPainted(map, [])).toBe(false);
    expect(sheetIsPainted(new Map([[1, { canvas, painted: false }]]), [1])).toBe(false);
  });

  it('covers the incoming sheet until it is painted', () => {
    expect(planPageTurn({
      effect: 'flip', layout: 'single', fromPage: 1, toPage: 2,
      hasShots: true, incomingPainted: false,
    })).toMatchObject({ effect: 'flip', dir: 'next', ready: false });
    expect(planPageTurn({
      effect: 'none', layout: 'single', fromPage: 1, toPage: 2,
      hasShots: true, incomingPainted: false,
    })).toMatchObject({ effect: 'none', ready: false });
    expect(planPageTurn({
      effect: 'none', layout: 'single', fromPage: 1, toPage: 2,
      hasShots: true, incomingPainted: true,
    })).toBe(null);
    expect(planPageTurn({
      effect: 'flip', layout: 'single', fromPage: 1, toPage: 2,
      fromScroll: true, hasShots: true,
    })).toBe(null);
    expect(planPageTurn({
      effect: 'flip', layout: 'continuous', fromPage: 1, toPage: 2,
      hasShots: true, incomingPainted: false,
    })).toBe(null);
    expect(turnSpacerPage({ fromPage: 3 }, 5)).toBe(3);
    expect(turnSpacerPage(null, 5)).toBe(5);
    expect(turnSpacerPage({}, 5)).toBe(5);
    expect(turnSpacerPage(null, 5, 2)).toBe(2);
    expect(turnSpacerPage({ fromPage: 3 }, 5, 2)).toBe(2);
  });

  it('pins a turn overlay to the live sheet box', () => {
    const box = (top, left, bottom, right) => ({
      getBoundingClientRect: () => ({ top, left, bottom, right, width: right - left, height: bottom - top }),
    });
    expect(overlayBoxForSheet(box(10, 20, 810, 620), box(50, 80, 700, 500))).toEqual({
      top: 40, left: 60, width: 420, height: 650,
    });
    expect(overlayBoxForSheet(null, box(0, 0, 10, 10))).toBe(null);
    const style = {};
    applyOverlayBox({ style }, { top: 12, left: 8, width: 200, height: 300 });
    expect(style.top).toBe('12px');
    expect(style.left).toBe('8px');
    expect(style.width).toBe('200px');
    expect(style.height).toBe('300px');
    expect(style.padding).toBe('0px');
    applyOverlayBox({ style }, null);
    expect(style.top).toBe('');
  });

  it('knows whether the sheet is still in the pane', () => {
    const box = (top, left, bottom, right) => ({
      getBoundingClientRect: () => ({ top, left, bottom, right }),
    });
    expect(sheetOverlapsViewport(box(0, 0, 800, 600), box(40, 80, 700, 500))).toBe(true);
    expect(sheetOverlapsViewport(box(0, 0, 800, 600), box(900, 80, 1600, 500))).toBe(false);
    expect(sheetOverlapsViewport(null, box(0, 0, 10, 10))).toBe(false);
  });

  it('reads reduced-motion from matchMedia', () => {
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
    expect(prefersReducedMotion(() => { throw new Error('no'); })).toBe(false);
  });

  it('snapshots every page canvas or gives up', () => {
    const canvas = {
      width: 40, height: 50,
      toDataURL: () => 'data:image/jpeg;base64,xx',
    };
    const map = new Map([
      [1, { canvas, wrapper: { offsetWidth: 20, offsetHeight: 25 } }],
      [2, { canvas, wrapper: { offsetWidth: 20, offsetHeight: 25 } }],
    ]);
    expect(snapshotPageCanvases(map, [1, 2])).toEqual([
      { num: 1, src: 'data:image/jpeg;base64,xx', width: 20, height: 25 },
      { num: 2, src: 'data:image/jpeg;base64,xx', width: 20, height: 25 },
    ]);
    expect(snapshotPageCanvases(map, [1, 3])).toEqual([]);
    expect(snapshotPageCanvases(new Map([[1, { canvas: { width: 0, height: 0 } }]]), [1])).toEqual([]);
    expect(captureOutgoingSheet(map, 'single', 1, 2)).toEqual([
      { num: 1, src: 'data:image/jpeg;base64,xx', width: 20, height: 25 },
    ]);
    expect(captureOutgoingSheet(map, 'spread', 1, 2)).toEqual([
      { num: 1, src: 'data:image/jpeg;base64,xx', width: 20, height: 25 },
      { num: 2, src: 'data:image/jpeg;base64,xx', width: 20, height: 25 },
    ]);
  });
});

describe('errors / titles / urls', () => {
  it('strips the Electron IPC prefix', () => {
    expect(stripRemoteError("Error invoking remote method 'fs:readBinary': Error: ENOENT"))
      .toBe('ENOENT');
    expect(stripRemoteError("Error invoking remote method 'dialog:openPdf': no such file"))
      .toBe('no such file');
    expect(stripRemoteError('plain message')).toBe('plain message');
  });

  it('failMessage reads Error.message and falls back to String()', () => {
    expect(failMessage(new Error("Error invoking remote method 'x': Error: boom"))).toBe('boom');
    expect(failMessage('just text')).toBe('just text');
    expect(HIGHLIGHT_COLOR).toMatch(/^rgba\(/);
  });

  it('builds the window title with a dirty marker', () => {
    expect(windowTitle(undefined, false)).toBe('MyPDFViewer');
    expect(windowTitle('', false)).toBe('MyPDFViewer');
    expect(windowTitle('report.pdf', false)).toBe('report.pdf — MyPDFViewer');
    expect(windowTitle('report.pdf', true)).toBe('report.pdf • — MyPDFViewer');
  });

  it('trims a bookmark label to 60 characters', () => {
    expect(bookmarkLabel('  Hello  ', 'p.1')).toBe('Hello');
    expect(bookmarkLabel('', '페이지 3')).toBe('페이지 3');
    expect(bookmarkLabel('   ', '페이지 3')).toBe('페이지 3');
    const long = 'x'.repeat(80);
    expect(bookmarkLabel(long, 'p')).toHaveLength(60);
  });

  it('records a bookmark at the selected text, otherwise at the reading position', () => {
    const withSel = bookmarkRecord({
      page: 2,
      label: 'Fox',
      selection: { text: 'Fox', rects: [{ x: 0.1, y: 0.4, w: 0.2, h: 0.03 }] },
      viewY: 0.1,
    });
    expect(withSel.page).toBe(2);
    expect(withSel.y).toBe(0.4);
    expect(withSel.rects).toHaveLength(1);
    expect(withSel.text).toBe('Fox');

    const atView = bookmarkRecord({ page: 1, label: '페이지 1', viewY: 0.55 });
    expect(atView.y).toBe(0.55);
    expect(atView.rects).toBeUndefined();
    expect(bookmarkAnchorY(atView)).toBe(0.55);
    expect(bookmarkAnchorY({ page: 3 })).toBe(0);
    expect(clamp01(1.4)).toBe(1);
    expect(bookmarkPaintRects(withSel)).toEqual([{ x: 0.1, y: 0.4, w: 0.2, h: 0.03 }]);
    expect(bookmarkPaintRects(atView)).toEqual([]);
    expect(bookmarkPaintRects({
      rects: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.02 }],
    })).toEqual([{ x: 0.2, y: 0.3, w: 0.4, h: 0.02 }]);
  });

  it('lands a page location from fracY or a PDF destination', () => {
    expect(locFromTop({ fracY: 0.25 }, 800)).toBe(0.25);
    expect(locFromTop({ pdfTop: 200 }, 800)).toBe(0.75);
    expect(locFromTop({}, 800)).toBe(null);
    expect(hasPageLoc({ fracY: 0 })).toBe(true);
    expect(hasPageLoc({ pdfTop: 10 })).toBe(true);
    expect(hasPageLoc(null)).toBe(false);
  });

  it('accepts only http(s) URLs', () => {
    expect(isHttpUrl('https://example.com/a.pdf')).toBe(true);
    expect(isHttpUrl('HTTP://x')).toBe(true);
    expect(isHttpUrl('  https://x  ')).toBe(true);
    expect(isHttpUrl('ftp://x')).toBe(false);
    expect(isHttpUrl('example.com')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});

describe('computeScale / placeholder', () => {
  it('centres a wide sheet in the visible viewport', () => {
    const wide = { scrollWidth: 1200, clientWidth: 800, scrollLeft: 0 };
    expect(centerOverflowX(wide)).toBe(200);
    expect(wide.scrollLeft).toBe(200);
    const fits = { scrollWidth: 800, clientWidth: 800, scrollLeft: 40 };
    expect(centerOverflowX(fits)).toBe(0);
    expect(fits.scrollLeft).toBe(0);
    expect(centerOverflowX(null)).toBe(0);
  });

  it('centres actual-size single page on both axes', () => {
    expect(shouldCenterSheet({ zoomMode: 'actual', layout: 'single' })).toBe(true);
    expect(shouldCenterSheet({ zoomMode: 'actual', layout: 'continuous' })).toBe(false);
    expect(shouldCenterSheet({ zoomMode: 'fit-width', layout: 'single' })).toBe(true);
    expect(shouldCenterSheet({ zoomMode: 'fit-page', layout: 'single' })).toBe(true);
    expect(shouldCenterSheet({ zoomMode: 'custom', layout: 'single' })).toBe(true);
    const tall = { scrollHeight: 1400, clientHeight: 800, scrollTop: 0 };
    expect(centerOverflowY(tall)).toBe(300);
    expect(tall.scrollTop).toBe(300);
    expect(centerOverflowY(null)).toBe(0);
  });

  it('keeps two-page view on the middle of the pane at every zoom', () => {
    expect(shouldCenterSheet({ zoomMode: 'actual', layout: 'spread' })).toBe(true);
    expect(shouldCenterSheet({ zoomMode: 'fit-width', layout: 'spread' })).toBe(true);
    expect(shouldCenterSheet({ zoomMode: 'fit-page', layout: 'spread' })).toBe(true);
    expect(shouldCenterSheet({ zoomMode: 'custom', layout: 'spread' })).toBe(true);
  });

  const base = { width: 600, height: 800 };
  const viewport = { width: 656, height: 848 };

  it('returns 1 before the page or viewport is known (except custom zoom)', () => {
    expect(computeScale({ baseSize: null, viewport, zoomMode: 'fit-width', zoom: 2, rotation: 0 })).toBe(1);
    expect(computeScale({ baseSize: base, viewport: { width: 0, height: 0 }, zoomMode: 'fit-width', zoom: 2, rotation: 0 })).toBe(1);
    expect(computeScale({ baseSize: null, viewport, zoomMode: 'custom', zoom: 1.5, rotation: 0 })).toBe(1.5);
  });

  it('fits two pages side by side in spread layout', () => {
    const row = 600 * 2 + SPREAD_GAP;
    const fitPage = Math.min((656 - PAGE_PAD_X) / row, (848 - PAGE_PAD_Y) / 800);
    expect(computeScale({
      baseSize: base, viewport, zoomMode: 'fit-width', zoom: 9, rotation: 0, layout: 'spread',
    })).toBeCloseTo(fitPage);
    expect(computeScale({
      baseSize: base, viewport, zoomMode: 'fit-page', zoom: 9, rotation: 0, layout: 'spread',
    })).toBeCloseTo(fitPage);
    expect(computeScale({
      baseSize: base, viewport, zoomMode: 'actual', zoom: 9, rotation: 0, layout: 'spread',
    })).toBeCloseTo(fitPage);
    expect(computeScale({
      baseSize: base, viewport, zoomMode: 'custom', zoom: 4, rotation: 0, layout: 'spread',
    })).toBeCloseTo(fitPage);
  });

  it('fits a single page to the pane until the user zooms', () => {
    const fitPage = Math.min((656 - PAGE_PAD_X) / 600, (848 - PAGE_PAD_Y) / 800);
    expect(computeScale({
      baseSize: base, viewport, zoomMode: 'fit-page', zoom: 9, rotation: 0, layout: 'single',
    })).toBeCloseTo(fitPage);
    expect(computeScale({
      baseSize: base, viewport, zoomMode: 'custom', zoom: 2, rotation: 0, layout: 'single',
    })).toBe(2);
  });

  it('fits width / page / height / actual / custom', () => {
    expect(computeScale({ baseSize: base, viewport, zoomMode: 'fit-width', zoom: 9, rotation: 0 }))
      .toBeCloseTo((656 - PAGE_PAD_X) / 600);
    expect(computeScale({ baseSize: base, viewport, zoomMode: 'fit-page', zoom: 9, rotation: 0 }))
      .toBeCloseTo(Math.min((656 - PAGE_PAD_X) / 600, (848 - PAGE_PAD_Y) / 800));
    expect(computeScale({ baseSize: base, viewport, zoomMode: 'fit-height', zoom: 9, rotation: 0 }))
      .toBeCloseTo((848 - PAGE_PAD_Y) / 800);
    expect(computeScale({ baseSize: base, viewport, zoomMode: 'actual', zoom: 9, rotation: 0 })).toBe(1);
    expect(computeScale({ baseSize: base, viewport, zoomMode: 'custom', zoom: 2.5, rotation: 0 })).toBe(2.5);
  });

  it('swaps width and height when the page is rotated 90°', () => {
    const fit = computeScale({ baseSize: base, viewport, zoomMode: 'fit-width', zoom: 1, rotation: 90 });
    expect(fit).toBeCloseTo((656 - PAGE_PAD_X) / 800);
  });

  it('never goes below 0.1', () => {
    const tiny = computeScale({
      baseSize: { width: 10000, height: 10000 },
      viewport: { width: 100, height: 100 },
      zoomMode: 'fit-width',
      zoom: 1,
      rotation: 0,
    });
    expect(tiny).toBe(0.1);
  });

  it('placeholder uses 600×850 until a page size is known', () => {
    expect(pagePlaceholderSize({ size: null, baseSize: null, scale: 1, rotation: 0 }))
      .toEqual({ width: 600, height: 850 });
  });

  it('placeholder scales and swaps for rotation', () => {
    expect(pagePlaceholderSize({ size: { width: 100, height: 200 }, scale: 2, rotation: 0 }))
      .toEqual({ width: 200, height: 400 });
    expect(pagePlaceholderSize({ size: { width: 100, height: 200 }, scale: 2, rotation: 90 }))
      .toEqual({ width: 400, height: 200 });
    expect(pagePlaceholderSize({ baseSize: { width: 50, height: 80 }, scale: 1, rotation: 180 }))
      .toEqual({ width: 50, height: 80 });
  });
});

describe('selection / image hit / capture', () => {
  it('drops tiny rects and merges those on the same line', () => {
    const lines = mergeRectsIntoLines([
      { left: 10, top: 10, right: 40, bottom: 22, width: 30, height: 12 },
      { left: 42, top: 11, right: 80, bottom: 23, width: 38, height: 12 },
      { left: 10, top: 40, right: 50, bottom: 54, width: 40, height: 14 },
      { left: 0, top: 0, right: 0.2, bottom: 0.2, width: 0.2, height: 0.2 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].left).toBe(10);
    expect(lines[0].right).toBe(80);
    expect(lines[1].top).toBe(40);
  });

  it('returns an empty list for no usable rectangles', () => {
    expect(mergeRectsIntoLines([])).toEqual([]);
    expect(mergeRectsIntoLines([{ left: 0, top: 0, right: 1, bottom: 1, width: 0, height: 1 }])).toEqual([]);
  });

  it('hits the first region that contains the point', () => {
    const regions = [
      { id: 'top', rect: { x: 10, y: 10, width: 40, height: 40 } },
      { id: 'under', rect: { x: 0, y: 0, width: 100, height: 100 } },
    ];
    expect(hitTestRegion(regions, { x: 20, y: 20 }).id).toBe('top');
    expect(hitTestRegion(regions, { x: 5, y: 5 }).id).toBe('under');
    expect(hitTestRegion(regions, { x: 200, y: 200 })).toBe(null);
    expect(hitTestRegion([], { x: 0, y: 0 })).toBe(null);
  });

  it('normalizes a drag in any direction and rejects tiny captures', () => {
    expect(normalizeDragRect({ x0: 20, y0: 30, x1: 10, y1: 12 }))
      .toEqual({ x: 10, y: 12, width: 10, height: 18 });
    expect(isMeaningfulCapture({ width: MIN_CAPTURE, height: MIN_CAPTURE })).toBe(true);
    expect(isMeaningfulCapture({ width: 5, height: 20 })).toBe(false);
    expect(isMeaningfulCapture({ width: 20, height: 5 })).toBe(false);
    expect(isMeaningfulCapture(null)).toBe(false);
  });

  it('keeps a finished region as a page-relative rectangle', () => {
    const frac = regionToFrac({ x: 50, y: 100, width: 200, height: 80 }, 400, 800);
    expect(frac).toEqual({ x: 0.125, y: 0.125, w: 0.5, h: 0.1 });
    expect(regionMarkStyle(frac)).toEqual({
      left: '12.5%', top: '12.5%', width: '50%', height: '10%',
    });
    expect(regionToFrac({ x: 0, y: 0, width: 10, height: 10 }, 0, 10)).toBe(null);
    expect(regionToFrac(null, 400, 800)).toBe(null);
    expect(regionMarkStyle(null)).toBe(null);
    expect(regionMarkStyle({ x: 0.1, y: 0.2 })).toBe(null);
  });

  it('still paints the rectangle after the drag is released', () => {
    const drag = { x0: 40, y0: 80, x1: 200, y1: 160 };
    expect(visibleRegionBox(drag, null)).toEqual({ left: 40, top: 80, width: 160, height: 80 });
    const mark = regionToFrac(normalizeDragRect(drag), 400, 800);
    expect(visibleRegionBox(null, { page: 2, ...mark })).toEqual({
      left: '10%', top: '10%', width: '40%', height: '10%',
    });
    expect(visibleRegionBox(null, null)).toBe(null);
  });

  it('prefers the live drag over a previously committed mark', () => {
    const mark = { page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const live = visibleRegionBox({ x0: 8, y0: 8, x1: 48, y1: 28 }, mark);
    expect(live).toEqual({ left: 8, top: 8, width: 40, height: 20 });
    expect(visibleRegionBox(null, mark)).toEqual({
      left: '10%', top: '10%', width: '20%', height: '20%',
    });
  });

  it('keeps the committed box when zoom changes the page pixel size', () => {
    const mark = regionToFrac({ x: 100, y: 50, width: 100, height: 50 }, 400, 200);
    const at100 = regionMarkStyle(mark);
    const at200 = regionMarkStyle(mark);
    expect(at100).toEqual(at200);
    expect(at100).toEqual({ left: '25%', top: '25%', width: '25%', height: '25%' });
  });
});

describe('clampPopupPos', () => {
  const view = { viewW: 800, viewH: 600, width: 220, height: 180, pad: 6 };

  it('keeps a menu that already fits', () => {
    expect(clampPopupPos({ ...view, x: 40, y: 50 })).toEqual({ x: 40, y: 50 });
  });

  it('flips above the cursor when it would hang off the bottom', () => {
    expect(clampPopupPos({ ...view, x: 40, y: 500 })).toEqual({ x: 40, y: 320 });
  });

  it('shifts left when it would hang off the right edge', () => {
    expect(clampPopupPos({ ...view, x: 700, y: 40 })).toEqual({ x: 574, y: 40 });
  });

  it('stays inside the top-left padding', () => {
    expect(clampPopupPos({ ...view, x: -20, y: -10 })).toEqual({ x: 6, y: 6 });
  });
});

describe('pickCopyText / paintedSelectionToRects', () => {
  it('prefers the first non-empty snapshot over a later live range', () => {
    expect(pickCopyText('saved', 'later')).toBe('saved');
    expect(pickCopyText('', '  ', 'live')).toBe('live');
    expect(pickCopyText(null, undefined, '  x  ')).toBe('  x  ');
    expect(pickCopyText('', '   ')).toBe('');
  });

  it('normalises painted line blocks against the page box', () => {
    expect(paintedSelectionToRects(
      [{ left: 10, top: 20, width: 40, height: 10 }],
      { width: 100, height: 200 },
    )).toEqual([{ x: 0.1, y: 0.1, w: 0.4, h: 0.05 }]);
    expect(paintedSelectionToRects([], { width: 100, height: 100 })).toEqual([]);
    expect(paintedSelectionToRects([{ left: 0, top: 0, width: 1, height: 1 }], { width: 0, height: 10 })).toEqual([]);
  });
});
