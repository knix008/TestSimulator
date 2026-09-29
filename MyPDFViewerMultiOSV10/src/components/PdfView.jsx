import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { IconPrev, IconNext } from './Icons.jsx';
import { renderPage, renderTextLayer, cropCanvas, getPageImageRegions, getPageLinks, getPageComments } from '../lib/pdf.js';
import { commentCardPos, workspaceNoteToComment, workspaceAttachmentToComment } from '../lib/comments.js';
import { matchOutlineTitle, lineTextNearPoint } from '../lib/nav.js';
import {
  computeScale, mergeRectsIntoLines, pagePlaceholderSize,
  hitTestRegion, normalizeDragRect, isMeaningfulCapture, regionToFrac, visibleRegionBox,
  pickCopyText, paintedSelectionToRects, locFromTop, hasPageLoc, bookmarkPaintRects,
  isPagedLayout, pagesForLayout, outgoingSheetPages, sheetIsPainted, planPageTurn, turnSpacerPage, sheetOverlapsViewport,
  overlayBoxForSheet, applyOverlayBox, sameSheet, isTurnBusy, TURN_SETTLE_MS, spreadLonePage,
  stepPage, PAGE_TURN_MS, captureOutgoingSheet, centerOverflowX, centerOverflowY,
  shouldCenterSheet, usesDocumentScroll, sheetCountForScroll, sheetSlotHeight,
  pageFromDocumentScroll, documentScrollTopForPage, documentScrollTail, SPREAD_GAP,
  paintsEagerly, pinDocumentScrollTop, centerDocumentSheetTop, documentSheetScrollTop, shiftDocumentScrollTop, wheelPageStep, leafFrontShot, leafBackShot, leafStayShot, leafStayBlank, leafStaySide, turnLeafSize,
  pageTurnLeafDir, sheetShotBox,
} from '../lib/view.js';
import { collectLayerSearchHits, scrollOffsetForHit } from '../lib/search.js';
import {
  MIN_TEXT_DRAG, rangeAtPoint, caretAtPoint, applyStreamSelection,
} from '../lib/text-select.js';

// The page area: renders pages to canvases, lays a real (selectable) text layer
// over each one, paints highlights and the current text selection, and hosts
// the region/image picking tool.
//
// Pages are only rasterized while they are near the viewport; everything else
// keeps its correct size as an empty placeholder, so scrolling stays accurate
// and memory stays bounded on large documents.

const NEAR = '900px'; // how far outside the viewport a page starts rendering
const NO_ANNOTATIONS = [];   // one shared instance, so the memo below holds
const NO_BOOKMARKS = [];
const NO_SELECTION = {};     // ditto, for the painted-selection lookup

// Turning pages with the wheel in single-page and two-page view.
const TURN_GAP_MS = 400; // one flick of the wheel never skips two pages

// The text tool selects in reading order: from a start column, through whole
// lines, to an end column. The highlight is one solid block per line.
const PdfView = forwardRef(function PdfView({
  doc,
  pageNumber,
  onPageChange,
  zoomMode,
  zoom,
  rotation,
  layout,
  pageEffect = 'none',
  invert,
  annotations,
  tool,                 // 'text' | 'image' | 'region'
  onRegionCapture,      // rectangle dragged out of the page → PNG
  onImagePick,          // an embedded image clicked → { page, id } (selects it)
  selectedImage,        // { page, id } currently selected, drawn highlighted
  onSelectionChange,
  autoCopyText = false,
  onContextMenu,
  onScaleChange,
  onZoomStep,
  onError,
  emptyState,
  outline,
  onFollowLink,
  onGoToPage,
  searchQuery = '',
  searchActive = null,
  bookmarks = NO_BOOKMARKS,
  activeBookmarkId = null,
  activeCommentId = null,
}, ref) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const pageRefs = useRef(new Map());   // page number → { wrapper, canvas, textLayer }
  const sheetShots = useRef([]);        // last painted sheet, used as the outgoing turn
  const paintedPages = useRef(new Set());
  const sheetNav = useRef({ layout, pageNumber, doc });
  sheetNav.current = { layout, pageNumber, doc };
  const pageTurnRef = useRef(null);
  const ignoreScrollTurn = useRef(false);
  const scrollPin = useRef({ page: 1, top: 0 });
  const spacerHold = useRef(0);
  const stageRef = useRef(null);
  const overlayRef = useRef(null);
  const overlayBoxHold = useRef(null);
  const turnBusyUntil = useRef(0);

  const captureSheetOverlayBox = () => {
    const { layout: lay, pageNumber: pg, doc: d } = sheetNav.current;
    const nums = d ? pagesForLayout(lay, pg, d.numPages) : [];
    const wraps = nums.map((n) => pageRefs.current.get(n)?.wrapper).filter(Boolean);
    const spreadEl = lay === 'spread' ? wraps[0]?.closest?.('.page-spread') : null;
    const box = overlayBoxForSheet(stageRef.current, spreadEl || wraps);
    if (box) overlayBoxHold.current = { id: 'pending', box };
  };

  const turnIsBusy = () => isTurnBusy(pageTurnRef.current, turnBusyUntil.current);

  const holdOutgoingSheet = (page) => {
    const n = Number(page);
    if (Number.isFinite(n) && n > 0) spacerHold.current = n;
  };
  const lastGeometry = useRef({ scale: 1, rotation: 0, primed: false });
  const anchor = useRef({ page: 1, ratio: 0 });
  const [baseSize, setBaseSize] = useState(null); // intrinsic size of page 1 at scale 1
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // Painted selection, keyed by page: { [page]: [{ left, top, width, height }] }.
  // A selection that runs across a page break paints on every page it covers.
  const [selection, setSelection] = useState(NO_SELECTION);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [regionMark, setRegionMark] = useState(null);

  useEffect(() => {
    if (tool !== 'region') setRegionMark(null);
  }, [tool]);
  useEffect(() => {
    setRegionMark(null);
  }, [doc]);

  // ── Container measurement (drives fit-width / fit-page / fit-height) ──
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  // ── Intrinsic page size (assume a uniform document, corrected per page) ──
  useEffect(() => {
    let cancelled = false;
    setBaseSize(null);
    setSelection(NO_SELECTION);
    if (!doc) return undefined;
    doc.getPage(1)
      .then((page) => {
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        setBaseSize({ width: vp.width, height: vp.height });
      })
      .catch((err) => onError?.(err, 'render'));
    return () => { cancelled = true; };
  }, [doc, onError]);

  // ── Effective scale ─────────────────────────────────────
  const scale = useMemo(
    () => computeScale({ baseSize, viewport, zoomMode, zoom, rotation, layout }),
    [baseSize, viewport, zoomMode, zoom, rotation, layout],
  );

  useEffect(() => { onScaleChange?.(scale); }, [scale, onScaleChange]);

  const centerSheet = shouldCenterSheet({ zoomMode, layout });
  const docScroll = usesDocumentScroll(layout);
  const pageBox = useMemo(
    () => pagePlaceholderSize({ baseSize, scale, rotation }),
    [baseSize, scale, rotation],
  );
  const scrollMetrics = useMemo(() => {
    const sheets = sheetCountForScroll(layout, doc?.numPages || 0);
    const slot = sheetSlotHeight({
      pageHeight: pageBox.height,
      viewportHeight: viewport.height,
      fillViewport: centerSheet,
      gap: SPREAD_GAP,
    });
    return { slot, sheets, layout, numPages: doc?.numPages || 0 };
  }, [layout, doc, pageBox.height, viewport.height, centerSheet]);
  const scrollMetricsRef = useRef(scrollMetrics);
  scrollMetricsRef.current = scrollMetrics;

  // After a resize / zoom the sheet can sit off the visible middle.
  // Only re-centre then: a later paint must not yank a page the user is
  // scrolling through back to the middle.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !viewport.width) return;
    // The pair (or the leftover last page) stays in the middle of the pane,
    // including when it is wider than the window — the binding is the centre.
    centerOverflowX(el);
    if (layout === 'single' && !pageTurnRef.current && !spacerHold.current) {
      const top = centerDocumentSheetTop(pageNumber, scrollMetricsRef.current, el.clientHeight);
      if (Math.abs((el.scrollTop || 0) - top) > 0.5) el.scrollTop = top;
    } else if (centerSheet && !docScroll) {
      centerOverflowY(el);
    }
  }, [viewport.width, viewport.height, scale, layout, rotation, doc, zoomMode, centerSheet, docScroll]);

  // Grouped once per change: filtering inside the page list would hand every
  // page a brand-new array on every render and defeat the memo below.
  const annotationsByPage = useMemo(() => {
    const map = new Map();
    for (const a of annotations) {
      const list = map.get(a.page);
      if (list) list.push(a);
      else map.set(a.page, [a]);
    }
    return map;
  }, [annotations]);

  const bookmarksByPage = useMemo(() => {
    const map = new Map();
    for (const b of bookmarks) {
      const list = map.get(b.page);
      if (list) list.push(b);
      else map.set(b.page, [b]);
    }
    return map;
  }, [bookmarks]);

  const pendingLoc = useRef(null); // { page, loc } until the target page reports pdfHeight

  const applyPageLoc = useCallback((entry, loc, root, behavior) => {
    const fromTop = locFromTop(loc, entry?.pdfHeight);
    if (fromTop == null || !entry?.wrapper || !root) return false;
    const pageH = entry.wrapper.offsetHeight || 1;
    if (usesDocumentScroll(layout)) {
      const base = documentScrollTopForPage(pageNumber, scrollMetricsRef.current);
      root.scrollTo({ top: Math.max(0, base + fromTop * pageH), behavior });
    } else if (isPagedLayout(layout)) {
      root.scrollTo({ top: Math.max(0, fromTop * pageH - 24), behavior });
    } else {
      const delta = entry.wrapper.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top: Math.max(0, root.scrollTop + delta - 12 + fromTop * pageH), behavior });
    }
    return true;
  }, [layout, pageNumber]);

  const markIncomingReady = useCallback(() => {
    const turn = pageTurnRef.current;
    if (!turn || turn.ready) return;
    const { layout: lay, pageNumber: pg, doc: d } = sheetNav.current;
    if (!d) return;
    if (sheetIsPainted(pageRefs.current, outgoingSheetPages(lay, pg, d.numPages))) {
      setPageTurn((cur) => {
        if (!cur || cur.ready) return cur;
        // Spread only: the back of the gutter leaf. A one-page leaf must keep
        // the outgoing snapshot on the front; the new page stays underneath.
        const back = cur.effect === 'flip' && lay === 'spread'
          ? leafBackShot(pageRefs.current, lay, cur.dir, pg, d.numPages)
          : cur.back;
        return { ...cur, ready: true, back: back || cur.back || null };
      });
    }
  }, []);

  const registerPage = useCallback((num, entry) => {
    if (entry) pageRefs.current.set(num, entry);
    else pageRefs.current.delete(num);
    if (entry?.painted) paintedPages.current.add(num);
    else paintedPages.current.delete(num);
    const pending = pendingLoc.current;
    if (pending && pending.page === num && entry?.wrapper && (pending.loc?.fracY != null || entry?.pdfHeight > 0)) {
      pendingLoc.current = null;
      applyPageLoc(entry, pending.loc, scrollRef.current, 'auto');
    }
    if (entry?.painted) {
      if (!pageTurnRef.current) {
        const { layout: lay, pageNumber: pg, doc: d } = sheetNav.current;
        const shots = d ? captureOutgoingSheet(pageRefs.current, lay, pg, d.numPages) : [];
        if (shots.length) sheetShots.current = shots;
      }
      markIncomingReady();
    }
  }, [applyPageLoc, markIncomingReady]);

  const lastSearchScroll = useRef('');
  const onSearchHit = useCallback((page, hit, stamp) => {
    const key = `${stamp || ''}:${page}:${hit?.start ?? ''}:${hit?.index ?? ''}`;
    if (lastSearchScroll.current === key) return;
    lastSearchScroll.current = key;
    const entry = pageRefs.current.get(page);
    const root = scrollRef.current;
    const rect = hit?.rects?.[0];
    if (!entry?.wrapper || !root || !rect) return;
    const rootBox = root.getBoundingClientRect();
    const wrapBox = entry.wrapper.getBoundingClientRect();
    const top = scrollOffsetForHit({
      rootTop: rootBox.top,
      wrapTop: wrapBox.top,
      rootScroll: root.scrollTop,
      rootHeight: root.clientHeight,
      hitTop: rect.top,
      hitHeight: rect.height,
    });
    if (top != null) root.scrollTo({ top, behavior: 'smooth' });
  }, []);

  // ── Which pages are mounted ─────────────────────────────
  const pages = useMemo(() => {
    if (!doc) return [];
    return pagesForLayout(layout, pageNumber, doc.numPages);
  }, [doc, layout, pageNumber]);

  // Paged layouts can keep the previous sheet as a snapshot while the new
  // page(s) come in — fade, slide, or a book-style flip.
  const [pageTurn, setPageTurn] = useState(null);
  pageTurnRef.current = pageTurn;
  // React-state form of "props changed": the cover is in the first committed
  // paint. A ref updated during render can lose the matching setState.
  const [nav, setNav] = useState({ doc, page: pageNumber });
  if (doc !== nav.doc) {
    setNav({ doc, page: pageNumber });
    sheetShots.current = [];
    ignoreScrollTurn.current = false;
    spacerHold.current = 0;
    lastGeometry.current = { scale, rotation, primed: false };
    anchor.current = { page: pageNumber || 1, ratio: 0 };
    if (pageTurn) setPageTurn(null);
  } else if (pageNumber !== nav.page) {
    holdOutgoingSheet(nav.page);
    const fromScroll = ignoreScrollTurn.current;
    ignoreScrollTurn.current = false;
    const shots = sheetShots.current;
    const planned = planPageTurn({
      effect: pageEffect,
      layout,
      fromPage: nav.page,
      toPage: pageNumber,
      fromScroll,
      hasShots: shots.length > 0,
      incomingPainted: !!(doc && sheetIsPainted(
        pageRefs.current,
        outgoingSheetPages(layout, pageNumber, doc.numPages),
      )),
    });
    setNav({ doc, page: pageNumber });
    setPageTurn(planned ? {
      ...planned,
      id: `${nav.page}-${pageNumber}`,
      fromPage: nav.page,
      shots,
      front: leafFrontShot(shots, planned.dir),
      stay: leafStayShot(shots, planned.dir),
      stayBlank: leafStayBlank(layout, shots, planned.dir),
      back: planned.effect === 'flip' && layout === 'spread'
        ? leafBackShot(pageRefs.current, layout, planned.dir, pageNumber, doc.numPages)
        : null,
    } : null);
  }

  // Snapshot the canvases in this frame — they still hold the page being
  // left. pdf.js paints the new page later; waiting for that made the leaf
  // show the incoming sheet, which is the page that should stay underneath.
  useLayoutEffect(() => {
    if (!pageTurn || pageTurn.held || pageTurn.effect === 'none') return undefined;
    const live = doc ? captureOutgoingSheet(pageRefs.current, layout, pageNumber, doc.numPages) : [];
    setPageTurn((cur) => {
      if (!cur || cur.held || cur.id !== pageTurn.id) return cur;
      // Prefer the snapshot taken before the page number changed. The live
      // canvas is only a fallback: in this layout pass it still holds the
      // outgoing page, but a later paint of the incoming one must not replace
      // the leaf.
      const shots = cur.shots?.length ? cur.shots : live;
      const front = cur.front || leafFrontShot(shots, cur.dir);
      const stay = cur.stay || leafStayShot(shots, cur.dir);
      const stayBlank = cur.stayBlank || leafStayBlank(layout, shots, cur.dir);
      return { ...cur, held: true, shots, front, stay, stayBlank };
    });
    return undefined;
  }, [doc, layout, pageNumber, pageTurn]);

  const turnClock = pageTurn ? pageTurn.id : null;

  useEffect(() => {
    if (!turnClock) return undefined;
    // Always lift the overlay. A flip without a front, or a fade that never
    // saw the incoming sheet paint, used to leave the pane on --page-bg.
    const ms = pageTurn?.effect === 'none' ? 0 : PAGE_TURN_MS;
    const id = window.setTimeout(() => setPageTurn(null), ms);
    return () => window.clearTimeout(id);
  }, [turnClock, pageTurn?.effect]);

  // After a turn the live sheet is the page that just arrived. Keep that as
  // the next outgoing snapshot so a later turn does not reuse the page before.
  useEffect(() => {
    if (pageTurn) return undefined;
    const { layout: lay, pageNumber: pg, doc: d } = sheetNav.current;
    if (!d) return undefined;
    const shots = captureOutgoingSheet(pageRefs.current, lay, pg, d.numPages);
    if (shots.length) sheetShots.current = shots;
    return undefined;
  }, [pageTurn]);

  // In continuous layout the current page follows the scroll position.
  const suppressScrollSync = useRef(false);

  // ── Keeping your place across a zoom ────────────────────
  // Scaling changes every page's height, so the raw scroll offset would land
  // somewhere else entirely. The page currently at the top of the viewport and
  // how far into it we are get recorded on every scroll, and restored once the
  // new layout is in place.

  const captureAnchor = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const rootTop = root.getBoundingClientRect().top;
    let chosen = null;
    for (const [num, entry] of pageRefs.current) {
      if (!entry?.wrapper) continue;
      const r = entry.wrapper.getBoundingClientRect();
      if (r.bottom <= rootTop) continue;              // entirely above the viewport
      if (!chosen || r.top < chosen.rect.top) chosen = { num, rect: r };
      if (r.top <= rootTop) { chosen = { num, rect: r }; break; }
    }
    if (!chosen || chosen.rect.height <= 0) return;
    anchor.current = {
      page: chosen.num,
      ratio: Math.min(1, Math.max(0, (rootTop - chosen.rect.top) / chosen.rect.height)),
    };
  }, []);

  const restoreAnchor = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const { layout: lay, pageNumber: pg } = sheetNav.current;
    const metrics = scrollMetricsRef.current;
    const page = anchor.current.page || pg;
    suppressScrollSync.current = true;
    if (usesDocumentScroll(lay)) {
      root.scrollTo({
        top: pinDocumentScrollTop(page, metrics, anchor.current.ratio),
        behavior: 'auto',
      });
    } else {
      const entry = pageRefs.current.get(page);
      if (!entry?.wrapper) {
        suppressScrollSync.current = false;
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const r = entry.wrapper.getBoundingClientRect();
      root.scrollTop += (r.top - rootRect.top) + anchor.current.ratio * r.height;
    }
    setTimeout(() => { suppressScrollSync.current = false; }, 250);
  }, []);

  // Re-anchor after every zoom / rotation, once the new sizes are laid out.
  // The first scale (viewport / page size becoming known after open) must pin
  // the current sheet — restoreAnchor would use a dummy { page: 1, ratio: 0 }
  // and jump the facing pair into empty spacer.
  useLayoutEffect(() => {
    if (lastGeometry.current.scale === scale && lastGeometry.current.rotation === rotation) return;
    const primed = lastGeometry.current.primed;
    lastGeometry.current = { scale, rotation, primed: true };
    if (layout === 'single') {
      const root = scrollRef.current;
      if (root && !pageTurnRef.current && !spacerHold.current) {
        suppressScrollSync.current = true;
        centerOverflowX(root);
        const top = centerDocumentSheetTop(pageNumber, scrollMetricsRef.current, root.clientHeight);
        if (Math.abs((root.scrollTop || 0) - top) > 0.5) root.scrollTop = top;
        setTimeout(() => { suppressScrollSync.current = false; }, 250);
      }
      return;
    }
    if (!primed) {
      const root = scrollRef.current;
      if (root && usesDocumentScroll(layout)) {
        suppressScrollSync.current = true;
        root.scrollTo({
          top: documentScrollTopForPage(pageNumber, scrollMetricsRef.current),
          behavior: 'auto',
        });
        setTimeout(() => { suppressScrollSync.current = false; }, 250);
      }
      return;
    }
    restoreAnchor();
    // Recentre only when the scale actually changes, never when the page turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, rotation, restoreAnchor, layout]);


  useEffect(() => {
    if (!doc || layout !== 'continuous') return undefined;
    const root = scrollRef.current;
    if (!root) return undefined;
    const ratios = new Map();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) ratios.set(Number(e.target.dataset.page), e.intersectionRatio);
      if (suppressScrollSync.current) return;
      let best = 0;
      let bestRatio = 0;
      for (const [num, r] of ratios) {
        if (r > bestRatio) { bestRatio = r; best = num; }
      }
      if (best && bestRatio > 0 && best !== sheetNav.current.pageNumber) {
        ignoreScrollTurn.current = true;
        onPageChange?.(best);
      }
    }, { root, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });

    // The anchor has to follow the scroll position, not just page changes.
    const onScroll = () => { if (!suppressScrollSync.current) captureAnchor(); };
    root.addEventListener('scroll', onScroll, { passive: true });

    for (const [, entry] of pageRefs.current) {
      if (entry?.wrapper) io.observe(entry.wrapper);
    }
    return () => {
      io.disconnect();
      root.removeEventListener('scroll', onScroll);
    };
  }, [doc, layout, pages.length, onPageChange, captureAnchor]);

  useEffect(() => {
    if (!doc || !usesDocumentScroll(layout)) return undefined;
    const root = scrollRef.current;
    if (!root) return undefined;
    const onScroll = () => {
      if (!suppressScrollSync.current) captureAnchor();
      // Cover / spacer updates must not be read as the user scrolling to another
      // sheet — that would change pageNumber again after the overlay buttons.
      if (suppressScrollSync.current || pageTurnRef.current) return;
      const next = pageFromDocumentScroll(root.scrollTop, scrollMetricsRef.current);
      if (next !== sheetNav.current.pageNumber) {
        ignoreScrollTurn.current = true;
        onPageChange?.(next);
      }
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [doc, layout, onPageChange, captureAnchor]);

  // In single-page and two-page view a sheet that still fits the pane is
  // turned with the wheel. A zoomed (or tall) page scrolls until that edge,
  // then the neighbouring page comes in.
  const landEdge = useRef(null);    // where scrollToPage should put the next page
  const turn = useRef({ last: 0 });

  const wheelTurnPage = useCallback((e) => {
    if (!isPagedLayout(layout) || !doc) return false;
    if (turnIsBusy()) {
      e.preventDefault();
      return true;
    }
    const root = scrollRef.current;
    const step = wheelPageStep(e.deltaY, {
      scrollTop: root?.scrollTop,
      scrollHeight: root?.scrollHeight,
      clientHeight: root?.clientHeight,
      slot: scrollMetricsRef.current.slot,
      pageTop: documentScrollTopForPage(pageNumber, scrollMetricsRef.current),
    });
    if (!step) return false;
    e.preventDefault();
    const now = Date.now();
    if (now - turn.current.last < TURN_GAP_MS) return true;

    const next = stepPage(layout, pageNumber, step, doc.numPages);
    if (next === pageNumber) return true;

    turn.current.last = now;
    const view = root?.clientHeight || 0;
    const slot = scrollMetricsRef.current.slot || 0;
    landEdge.current = slot > view + 1 ? (step > 0 ? 'top' : 'bottom') : null;
    scrollPin.current = { page: pageNumber, top: root?.scrollTop || 0 };
    holdOutgoingSheet(pageNumber);
    captureSheetOverlayBox();
    const shots = captureOutgoingSheet(pageRefs.current, layout, pageNumber, doc.numPages);
    if (shots.length) sheetShots.current = shots;
    ignoreScrollTurn.current = false;
    onPageChange?.(next);
    return true;
  }, [doc, layout, pageNumber, onPageChange]);

  // Ctrl + wheel zooms. Two-page view stays fitted to the pane; a single
  // page zooms around the centre of the window. The listener has to be a
  // non-passive native one: React's synthetic wheel handler is passive, so
  // preventDefault() there would not stop the browser's own zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) { wheelTurnPage(e); return; }
      e.preventDefault();
      if (layout === 'spread' || e.deltaY === 0) return;
      captureAnchor();
      onZoomStep?.(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [captureAnchor, layout, onZoomStep, wheelTurnPage]);

  // Scroll a page into view when the page number changes from outside.
  //
  // This scrolls the page container itself rather than calling scrollIntoView:
  // scrollIntoView also scrolls every scrollable ancestor, which pushes the
  // toolbar and title bar off the top of the window.
  const scrollSyncHold = useRef(0);
  const holdScrollSync = useCallback((behavior) => {
    if (scrollSyncHold.current) window.clearTimeout(scrollSyncHold.current);
    const hold = pageTurnRef.current
      ? PAGE_TURN_MS + 80
      : (behavior === 'smooth' ? 700 : 250);
    scrollSyncHold.current = window.setTimeout(() => {
      suppressScrollSync.current = false;
      scrollSyncHold.current = 0;
    }, hold);
  }, []);

  const scrollToPage = useCallback((num, behavior = 'auto', loc = null) => {
    const root = scrollRef.current;
    if (!root) {
      if (hasPageLoc(loc)) pendingLoc.current = { page: num, loc };
      return;
    }
    const entry = pageRefs.current.get(num);
    if (isPagedLayout(layout)) {
      // Turning back with the wheel should show the foot of the previous page,
      // not its head — otherwise scrolling up jumps over a screenful of text.
      const edge = landEdge.current;
      landEdge.current = null;
      // Spacer heights already match `num` in this commit. Pin scrollTop even
      // before the new PageView has registered a wrapper, otherwise the cover
      // lifts onto a sheet that then jumps into place.
      if (usesDocumentScroll(layout) && !hasPageLoc(loc)) {
        pendingLoc.current = null;
        suppressScrollSync.current = true;
        const metrics = scrollMetricsRef.current;
        const pin = scrollPin.current;
        const top = edge
          ? documentSheetScrollTop(num, metrics, root.clientHeight, edge)
          : (pin.page !== num
            ? shiftDocumentScrollTop(pin.page, num, pin.top, metrics)
            : documentSheetScrollTop(num, metrics, root.clientHeight));
        root.scrollTo({ top, behavior: 'auto' });
        holdScrollSync(behavior);
        return;
      }
      if (!entry?.wrapper) {
        if (hasPageLoc(loc)) pendingLoc.current = { page: num, loc };
        return;
      }
      if (shouldCenterSheet({ zoomMode, layout }) && !hasPageLoc(loc) && !usesDocumentScroll(layout)) {
        pendingLoc.current = null;
        centerOverflowX(root);
        centerOverflowY(root);
        return;
      }
      if (edge) {
        pendingLoc.current = null;
        root.scrollTo({ top: edge === 'bottom' ? root.scrollHeight : 0, behavior: 'auto' });
        return;
      }
      if (applyPageLoc(entry, loc, root, behavior)) {
        pendingLoc.current = null;
        return;
      }
      if (hasPageLoc(loc)) pendingLoc.current = { page: num, loc };
      else pendingLoc.current = null;
      root.scrollTo({ top: 0, behavior });
      return;
    }
    if (!entry?.wrapper) {
      if (hasPageLoc(loc)) pendingLoc.current = { page: num, loc };
      return;
    }
    // Ignore the scroll-driven page updates this programmatic scroll causes.
    suppressScrollSync.current = true;
    if (applyPageLoc(entry, loc, root, behavior)) {
      pendingLoc.current = null;
    } else {
      if (hasPageLoc(loc)) pendingLoc.current = { page: num, loc };
      else pendingLoc.current = null;
      const delta = entry.wrapper.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top: Math.max(0, root.scrollTop + delta - 12), behavior });
    }
    holdScrollSync(behavior);
  }, [applyPageLoc, holdScrollSync, layout, zoomMode]);

  // ── Keeping a drag from grabbing text elsewhere on the page ──
  // A PDF text layer is a scatter of absolutely positioned spans with wide
  // gaps between them. When a drag crosses one of those gaps — a margin, the
  // space between columns, the run-in before a heading — the browser looks for
  // the nearest selectable node in DOM order, which is often a paragraph
  // somewhere else entirely, and the selection jumps there.
  //
  // pdf.js's own viewer answers this with a blank block parked beside the end
  // of the selection that is moving, stretched over the rest of the page for
  // as long as the drag lasts: empty space then belongs to something harmless
  // instead of to distant text. renderTextLayer appends the block; everything
  // that moves it lives here.
  const prevRange = useRef(null);
  const isGecko = useRef(null);
  // The guard block may only be armed between a press inside a text layer and
  // the release that ends it. Armed at rest it is a page-sized, user-select:none
  // box sitting last in the layer, so the next press in empty space hit-tests
  // onto it and the caret lands at the end of the page — which is how a plain
  // click ends up selecting everything below itself. selectionchange fires long
  // after a drag is over (a click settling its caret, Ctrl+A, focus moving), so
  // "am I dragging" has to be tracked rather than inferred from the selection.
  const dragging = useRef(false);

  // A descendant search, not a child one: parking puts the block back as a
  // direct child, but positioning it moves it in beside the anchor, which in a
  // tagged PDF sits inside a .markedContent wrapper. A child-only query stops
  // finding it there, and a block that can no longer be found is a block left
  // covering the page — which is what makes a drag swallow the whole of it.
  const endBlockOf = (layer) => layer.querySelector('.endOfContent');

  // Back to the foot of the layer, disarmed. Parking is attempted on every page
  // on every selectionchange, so a block that is already parked must be left
  // alone: moving a node inside the selection's own container fires another
  // selectionchange, and doing that per page per event is a feedback loop.
  const parkEndBlock = useCallback((layer) => {
    const end = endBlockOf(layer);
    if (end) {
      if (end.parentElement !== layer || end.nextSibling) layer.append(end);
      if (end.style.width) end.style.width = '';
      if (end.style.height) end.style.height = '';
    }
    layer.classList.remove('selecting');
  }, []);

  const parkAllEndBlocks = useCallback(() => {
    for (const [, entry] of pageRefs.current) {
      if (entry?.textLayer) parkEndBlock(entry.textLayer);
    }
  }, [parkEndBlock]);

  // The element the guard block has to sit beside: whatever holds the end of the
  // range that is on the move. Resolving no further than pdf.js does is the
  // point — descending into childNodes to find "the span the caret is really
  // next to" can land on a text node, and inserting the block beside *that*
  // puts it inside a span, splitting its text. The split changes the selection,
  // which fires another selectionchange, which moves the block again: the
  // selection creeps a character at a time and never settles.
  const anchorElementOf = (range, modifyStart) => {
    const node = modifyStart ? range.startContainer : range.endContainer;
    return node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  };

  const syncEndBlocks = useCallback(() => {
    if (!dragging.current) { parkAllEndBlocks(); prevRange.current = null; return; }

    const sel = window.document.getSelection();
    if (!sel || sel.rangeCount === 0) { parkAllEndBlocks(); prevRange.current = null; return; }

    const range = sel.getRangeAt(0);
    const prev = prevRange.current;
    // Which end of the selection is being dragged: if the far end has not
    // moved since last time, it is the start that is on the move.
    const modifyStart = prev
      && (range.compareBoundaryPoints(Range.END_TO_END, prev) === 0
        || range.compareBoundaryPoints(Range.START_TO_END, prev) === 0);
    const anchor = anchorElementOf(range, modifyStart);
    prevRange.current = range.cloneRange();

    // The page holding the moving end, found from the anchor's parent — so an
    // anchor that is the layer itself (a caret in empty space) resolves to
    // nothing and the page stays unarmed, rather than the block being placed
    // somewhere it does not belong.
    const layer = anchor.nodeType === Node.ELEMENT_NODE
      ? anchor.parentElement?.closest('.textLayer') || null
      : null;
    const end = layer && endBlockOf(layer);

    // Every other page is parked. A layer left `selecting` while its block is
    // still at the foot of the page has a full-page catch-all as its last
    // child: the next press in empty space lands on it and takes the selection
    // all the way to the end of the page.
    for (const [, entry] of pageRefs.current) {
      const other = entry?.textLayer;
      if (other && other !== layer) parkEndBlock(other);
    }

    // Nowhere safe to put the block — leave the page unarmed rather than
    // stretched.
    if (!end || anchor === end || !layer.contains(anchor) || !anchor.parentElement) {
      if (layer) parkEndBlock(layer);
      return;
    }

    // Firefox puts the caret in empty space by itself, and moving the block
    // there fights it — the same exception pdf.js makes, using pdf.js's own
    // test: only Gecko reports a computed value for the -moz-user-select the
    // block's stylesheet sets. Asking CSS.supports() instead is not the same
    // question, and answering it wrong leaves the block parked over the page.
    if (isGecko.current === null) {
      isGecko.current = getComputedStyle(end).getPropertyValue('-moz-user-select') === 'none';
    }
    if (isGecko.current) { parkEndBlock(layer); return; }

    if (end.style.width !== layer.style.width) end.style.width = layer.style.width;
    if (end.style.height !== layer.style.height) end.style.height = layer.style.height;

    // Beside the anchor, never inside the range — so the block contributes no
    // rectangle of its own to the painted selection below. Moving it mutates
    // the selection's own container, which fires another selectionchange, so
    // skip the move when it already sits where it belongs.
    const inPlace = modifyStart ? end.nextSibling === anchor : anchor.nextSibling === end;
    if (!inPlace) {
      anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
    }

    // Armed only now that the block is beside the anchor instead of at the foot.
    layer.classList.add('selecting');
  }, [parkAllEndBlocks, parkEndBlock]);

  // A drag that ends outside the window still has to release the guard.
  useEffect(() => {
    const release = () => { dragging.current = false; parkAllEndBlocks(); };
    document.addEventListener('pointerup', release);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('pointerup', release);
      window.removeEventListener('blur', release);
    };
  }, [parkAllEndBlocks]);

  // ── Text selection: report it and paint it as solid blocks ──
  // The blocks are React state, so an update repaints them. A drag produces
  // several selectionchange events per pointer move and most of them describe
  // the very same rectangles, so a page's blocks are committed only when they
  // actually differ — and a page whose blocks are unchanged keeps the very same
  // array, so its memoised PageView does not repaint at all. Repainting a page
  // for nothing is exactly what reads as a flicker.
  const selectionSig = useRef('');
  const pageSigs = useRef(new Map());   // page → signature of the lines it holds

  const lastText = useRef('');
  const spatialRef = useRef(null); // { page, text, lines, layerBox } from a box-select

  const refreshSelection = useCallback(() => {
    const sel = window.document.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString() : '';
    // App re-renders on this, so only report a value that actually changed.
    if (text !== lastText.current) {
      lastText.current = text;
      onSelectionChange?.(text);
    }

    const lineSig = (lines) => lines
      .map((l) => `${Math.round(l.left)},${Math.round(l.top)},${Math.round(l.width)},${Math.round(l.height)}`)
      .join('|');

    const commit = (next) => {
      const sig = Object.keys(next).map((n) => `${n}:${lineSig(next[n])}`).join(';');
      if (sig === selectionSig.current) return;
      selectionSig.current = sig;
      setSelection(next);
    };

    if (!text || sel.rangeCount === 0) {
      pageSigs.current.clear();
      commit(NO_SELECTION);
      return;
    }

    const range = sel.getRangeAt(0);
    const raw = [...range.getClientRects()];

    // The guard block is a page-sized box that lives inside the text layer. It
    // is meant to sit beside the range, but for the one event where the dragged
    // end passes it, the range holds it — and its rectangle would paint as a
    // full-page highlight for that frame. That is the flash; drop its rectangle
    // rather than trusting it to always be out of the way.
    const guards = [];
    for (const [, e] of pageRefs.current) {
      const end = e?.textLayer && endBlockOf(e.textLayer);
      if (end) guards.push(end.getBoundingClientRect());
    }
    const isGuard = (r) => guards.some((g) => (
      Math.abs(r.left - g.left) < 1 && Math.abs(r.top - g.top) < 1
      && Math.abs(r.right - g.right) < 1 && Math.abs(r.bottom - g.bottom) < 1
    ));

    // Split the rectangles across the pages they land on, so a selection that
    // runs over a page break stays painted on both.
    const next = {};
    for (const [num, e] of pageRefs.current) {
      const layer = e?.textLayer;
      if (!layer || !range.intersectsNode(layer)) continue;
      const box = layer.getBoundingClientRect();
      const mine = raw.filter((r) => {
        if (isGuard(r)) return false;
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        return cx >= box.left - 1 && cx <= box.right + 1 && cy >= box.top - 1 && cy <= box.bottom + 1;
      });
      const lines = mergeRectsIntoLines(mine).map((l) => ({
        left: l.left - box.left,
        top: l.top - box.top,
        width: l.right - l.left,
        height: l.bottom - l.top,
      }));
      if (!lines.length) continue;
      // Same blocks as last time → hand back the same array, so this page's
      // PageView is skipped by React.memo instead of repainting identically.
      const sig = lineSig(lines);
      const held = pageSigs.current.get(num);
      if (held && held.sig === sig) { next[num] = held.lines; continue; }
      pageSigs.current.set(num, { sig, lines });
      next[num] = lines;
    }
    for (const num of [...pageSigs.current.keys()]) {
      if (!(num in next)) pageSigs.current.delete(num);
    }
    commit(next);
  }, [onSelectionChange]);

  // The guard block is repositioned first, so the rectangles measured below are
  // taken with it already parked outside the range. The repaint itself is held
  // to one per frame: the browser can fire selectionchange many times while a
  // single pointer move is being processed.
  const pendingPaint = useRef(0);
  useEffect(() => {
    const onSelectionChange = () => {
      syncEndBlocks();
      if (pendingPaint.current) return;
      pendingPaint.current = requestAnimationFrame(() => {
        pendingPaint.current = 0;
        refreshSelection();
      });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (pendingPaint.current) cancelAnimationFrame(pendingPaint.current);
      pendingPaint.current = 0;
    };
  }, [refreshSelection, syncEndBlocks]);

  // The painted selection is positioned in CSS pixels, so it has to be redrawn
  // whenever the page geometry changes.
  useEffect(() => {
    spatialRef.current = null;
    refreshSelection();
  }, [scale, rotation, layout, refreshSelection]);

  // ── Imperative API used by the toolbar / menus ──────────
  useImperativeHandle(ref, () => ({
    scrollToPage,

    // Call before changing pageNumber so the outgoing canvas is still mounted.
    preparePageTurn(nextPage, loc) {
      if (turnIsBusy()) return false;
      const { layout: lay, pageNumber: pg, doc: d } = sheetNav.current;
      scrollPin.current = { page: pg, top: scrollRef.current?.scrollTop || 0 };
      holdOutgoingSheet(pg);
      captureSheetOverlayBox();
      if (d) {
        const shots = captureOutgoingSheet(pageRefs.current, lay, pg, d.numPages);
        if (shots.length) sheetShots.current = shots;
      }
      if (hasPageLoc(loc)) pendingLoc.current = { page: nextPage, loc };
      ignoreScrollTurn.current = false;
      suppressScrollSync.current = true;
      return true;
    },

    // Selects every text node of one page (Ctrl+A / "Select page").
    selectPageText(num) {
      const entry = pageRefs.current.get(num);
      if (!entry?.textLayer) return false;
      const layer = entry.textLayer;
      dragging.current = false;
      spatialRef.current = null;
      parkEndBlock(layer);
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(layer);
      // Stop short of the guard block sitting at the foot of the layer: inside
      // the range it would contribute a page-sized rectangle to the painting.
      const end = endBlockOf(layer);
      if (end) range.setEndBefore(end);
      sel.removeAllRanges();
      sel.addRange(range);
      prevRange.current = null;
      refreshSelection();
      return true;
    },

    getPageCanvas(num) {
      return pageRefs.current.get(num)?.canvas || null;
    },

    // How far down the page the viewport currently sits (0 = top, 1 = bottom).
    getVisibleFracY(num) {
      const entry = pageRefs.current.get(num);
      const root = scrollRef.current;
      if (!entry?.wrapper || !root) return 0;
      const wrap = entry.wrapper.getBoundingClientRect();
      const rootBox = root.getBoundingClientRect();
      if (!(wrap.height > 0)) return 0;
      return Math.min(1, Math.max(0, (rootBox.top - wrap.top) / wrap.height));
    },

    // Current selection as page-relative rectangles (0..1), so a highlight
    // keeps its place at any zoom or rotation. Falls back to the painted
    // blocks when a click (context menu) has already cleared the native range.
    getSelectionRects() {
      const spatial = spatialRef.current;
      if (spatial?.lines?.length && spatial.layerBox?.width) {
        const { page, text, lines, layerBox } = spatial;
        return {
          page,
          text,
          rects: paintedSelectionToRects(lines, layerBox),
        };
      }
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const text = sel.toString();
        let page = 0;
        let entry = null;
        for (const [num, e] of pageRefs.current) {
          if (e?.textLayer && (e.textLayer.contains(sel.anchorNode) || e.textLayer.contains(sel.focusNode))) {
            page = num; entry = e; break;
          }
        }
        if (entry) {
          const box = entry.textLayer.getBoundingClientRect();
          const rects = mergeRectsIntoLines([...sel.getRangeAt(0).getClientRects()]).map((r) => ({
            x: (r.left - box.left) / box.width,
            y: (r.top - box.top) / box.height,
            w: (r.right - r.left) / box.width,
            h: (r.bottom - r.top) / box.height,
          }));
          if (rects.length) return { page, rects, text };
        }
      }
      const painted = selectionRef.current || NO_SELECTION;
      const pages = Object.keys(painted);
      if (!pages.length || !lastText.current) return null;
      const page = Number(pages[0]);
      const entry = pageRefs.current.get(page);
      const box = entry?.textLayer?.getBoundingClientRect();
      const rects = paintedSelectionToRects(painted[page], box);
      if (!rects.length) return null;
      return { page, rects, text: lastText.current };
    },

    clearSelection() {
      window.getSelection()?.removeAllRanges();
      dragging.current = false;
      spatialRef.current = null;
      parkAllEndBlocks();
      prevRange.current = null;
      selectionSig.current = '';
      pageSigs.current.clear();
      setSelection(NO_SELECTION);
      onSelectionChange?.('');
    },
  }), [scrollToPage, refreshSelection, onSelectionChange, parkAllEndBlocks, parkEndBlock]);

  useLayoutEffect(() => {
    if (!doc) return;
    // Spacers stay on the outgoing sheet while a turn covers it. Pinning
    // scrollTop to the incoming page here is what popped the page up.
    if (pageTurn) return;
    if (spacerHold.current && spacerHold.current !== pageNumber) return;
    scrollToPage(pageNumber);
    spacerHold.current = 0;
    // Only react to an externally driven page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, layout, doc, pageTurn]);

  // If a turn, a cancelled paint, or a spacer/slot change left the sheet
  // outside the pane, the viewer is just --page-bg. Pull it back.
  useLayoutEffect(() => {
    if (!doc || !docScroll) return;
    const root = scrollRef.current;
    if (!root) return;
    if (pageTurn || spacerHold.current) {
      const pin = scrollPin.current.top;
      if (Number.isFinite(pin) && Math.abs((root.scrollTop || 0) - pin) > 0.5) {
        root.scrollTop = pin;
      }
      return;
    }
    const wrap = pages.map((n) => pageRefs.current.get(n)?.wrapper).find(Boolean);
    if (!wrap || sheetOverlapsViewport(root, wrap)) return;
    suppressScrollSync.current = true;
    root.scrollTo({
      top: documentSheetScrollTop(pageNumber, scrollMetricsRef.current, root.clientHeight),
      behavior: 'auto',
    });
    holdScrollSync('auto');
  }, [doc, docScroll, layout, pageNumber, pageTurn, pages, scrollMetrics, holdScrollSync]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!pageTurn) {
      applyOverlayBox(overlay, null);
      overlayBoxHold.current = null;
      turnBusyUntil.current = Date.now() + TURN_SETTLE_MS;
      return;
    }
    // Use the box captured while the outgoing sheet was still in place.
    // Measuring after the incoming pages mount is what drew the turn low.
    if (overlayBoxHold.current?.box) {
      overlayBoxHold.current.id = pageTurn.id;
      applyOverlayBox(overlay, overlayBoxHold.current.box);
    }
  }, [pageTurn]);

  // When fit-width / page size lands, spacer heights change. Keep the current
  // sheet in the viewport instead of leaving scrollTop in empty tail space.
  // Single-page owns its offset (scroll, then the next page at the edge) so
  // this must not snap it back to the middle of the slot.
  useLayoutEffect(() => {
    if (!doc || !docScroll || layout === 'single') return;
    if (pageTurn || spacerHold.current) return;
    const root = scrollRef.current;
    if (!root) return;
    suppressScrollSync.current = true;
    root.scrollTo({
      top: pinDocumentScrollTop(pageNumber, scrollMetrics),
      behavior: 'auto',
    });
    holdScrollSync('auto');
  }, [doc, docScroll, layout, pageNumber, pageTurn, scrollMetrics, holdScrollSync]);

  const applySpatialSelect = useCallback(({ page, text, lines, layerBox }) => {
    spatialRef.current = lines.length ? { page, text, lines, layerBox } : null;
    lastText.current = text;
    onSelectionChange?.(text);
    if (!lines.length) {
      selectionSig.current = '';
      pageSigs.current.clear();
      setSelection(NO_SELECTION);
      return;
    }
    const next = { [page]: lines };
    selectionSig.current = `spatial:${page}:${lines.map((l) => `${Math.round(l.left)},${Math.round(l.top)}`).join('|')}`;
    pageSigs.current.clear();
    pageSigs.current.set(page, { sig: selectionSig.current, lines });
    setSelection(next);
  }, [onSelectionChange]);

  if (!doc) {
    return <div className="pageview empty" ref={scrollRef}>{emptyState}</div>;
  }

  if (!pageTurn && nav.page === pageNumber) spacerHold.current = 0;
  const spacerPage = turnSpacerPage(pageTurn, pageNumber, spacerHold.current);
  const flipLeaf = pageTurn?.effect === 'flip' && !!pageTurn.front;
  const flipBox = flipLeaf ? sheetShotBox(pageTurn.shots) : null;
  const leafSize = flipLeaf ? turnLeafSize(layout, pageTurn.shots.length) : 'whole';
  const sheetCover = pageTurn && pageTurn.effect !== 'flip';
  const prevPage = stepPage(layout, pageNumber, -1, doc.numPages);
  const nextPage = stepPage(layout, pageNumber, 1, doc.numPages);
  const turnTo = (next) => {
    if (next === pageNumber || turnIsBusy()) return;
    if (sameSheet(layout, pageNumber, next, doc.numPages)) return;
    scrollPin.current = { page: pageNumber, top: scrollRef.current?.scrollTop || 0 };
    holdOutgoingSheet(pageNumber);
    captureSheetOverlayBox();
    const shots = captureOutgoingSheet(pageRefs.current, layout, pageNumber, doc.numPages);
    if (shots.length) sheetShots.current = shots;
    if (onGoToPage) onGoToPage(next);
    else onPageChange?.(next);
  };

  return (
    <div
      ref={stageRef}
      className={`page-stage${pageTurn ? ' turning' : ''}${flipLeaf ? ' flip-turn' : ''}${centerSheet ? ' center-sheet' : ''}`}
      data-motion={pageEffect === 'none' ? 'system' : 'full'}
      style={{ '--turn-ms': `${PAGE_TURN_MS}ms` }}
    >
      {isPagedLayout(layout) ? (
        <>
          <button
            type="button"
            className="page-nav prev"
            onClick={() => turnTo(prevPage)}
            disabled={!!pageTurn || prevPage === pageNumber}
            title={t('toolbar.prevPage')}
            aria-label={t('toolbar.prevPage')}
          >
            <IconPrev size={22} />
          </button>
          <button
            type="button"
            className="page-nav next"
            onClick={() => turnTo(nextPage)}
            disabled={!!pageTurn || nextPage === pageNumber}
            title={t('toolbar.nextPage')}
            aria-label={t('toolbar.nextPage')}
          >
            <IconNext size={22} />
          </button>
        </>
      ) : null}
      {flipLeaf && flipBox ? (
        <div className="flip-overlay" ref={overlayRef} aria-hidden="true">
          <div
            className={`flip-spread${layout === 'spread' || pageTurn.shots.length > 1 ? ' two-up' : ''}`}
            style={{ width: '100%', height: '100%' }}
          >
            <div
              key={pageTurn.id}
              className={`turn-leaf ${pageTurnLeafDir(pageTurn.dir)} ${leafSize}`}
            >
              <div className="leaf-face front">
                <img src={pageTurn.front.src} alt="" draggable={false} />
              </div>
              {leafSize === 'half' ? (
                <div className="leaf-face back">
                  {pageTurn.back ? (
                    <img src={pageTurn.back.src} alt="" draggable={false} />
                  ) : <span className="leaf-paper" />}
                </div>
              ) : null}
            </div>
            {leafSize === 'half' && (pageTurn.stay || pageTurn.stayBlank) ? (
              <div className={`turn-stay ${leafStaySide(pageTurn.dir)}${pageTurn.stay ? '' : ' blank'}`}>
                {pageTurn.stay ? (
                  <img src={pageTurn.stay.src} alt="" draggable={false} />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {sheetCover ? (
        <div
          ref={overlayRef}
          className={`turn-cover turn-${pageTurn.effect} turn-${pageTurn.dir}${pageTurn.ready ? ' ready' : ''}${layout === 'spread' ? ' spread' : ''}`}
          aria-hidden="true"
        >
          {pageTurn.shots.map((shot) => (
            <div
              key={`out-${shot.num}`}
              className="page turn-shot"
              style={{ width: shot.width, height: shot.height }}
            >
              <img src={shot.src} alt="" draggable={false} />
            </div>
          ))}
          {layout === 'spread' && pageTurn.shots.length === 1 ? (
            <div
              className="turn-shot blank"
              aria-hidden="true"
              style={{ width: pageTurn.shots[0].width, height: pageTurn.shots[0].height }}
            />
          ) : null}
        </div>
      ) : null}
      <div
        className={`pageview tool-${tool}${invert ? ' invert' : ''}${layout === 'spread' ? ' spread' : ''}${centerSheet ? ' center-sheet' : ''}`}
        ref={scrollRef}
        onContextMenu={(e) => onContextMenu?.(e, {
          selectionText: pickCopyText(lastText.current, window.getSelection()?.toString()),
        })}
        onMouseDown={(e) => {
          const layer = e.target.closest?.('.textLayer');
          if (!layer) return;
          // A new drag knows nothing about the last one. Left behind, the old
          // range makes the very first move guess the wrong end as the moving
          // one, which parks the guard block inside the range — one frame of a
          // full-page highlight.
          prevRange.current = null;
          dragging.current = true;
          // The class, and nothing else — the guard block must not be *moved*
          // here. This runs before the browser resolves the caret for this very
          // press, and that resolution maps the box it already hit-tested back to
          // a DOM position: move the block now and the caret lands wherever the
          // block went. Parking it, in particular, sends the caret to the end of
          // the layer, and the first twitch of the drag then selects everything
          // from the press down to the foot of the page. Restyling is safe: the
          // hit test that picked the target has already happened.
          layer.classList.add('selecting');
        }}
        onMouseUp={(e) => {
          // A finished text drag offers its actions straight away. The menu is
          // opened from the release position, and only for a drag that actually
          // selected something — a plain click still just moves the caret.
          if (tool !== 'text' || e.button !== 0 || autoCopyText) return;
          if (!e.target.closest?.('.textLayer')) return;
          const { clientX, clientY } = e;
          // One tick, so the selection the menu asks about is the final one.
          setTimeout(() => {
            const live = window.getSelection()?.toString() || '';
            const text = pickCopyText(live, lastText.current);
            if (!text.trim()) return;
            onContextMenu?.({
              preventDefault() {}, stopPropagation() {}, clientX, clientY,
            }, { selectionText: text });
          }, 0);
        }}
      >
        <div className={`pagestack${layout === 'spread' ? ' spread' : ''}${docScroll ? ' doc-scroll' : ''}`}>
          {docScroll && scrollMetrics.sheets > 1 ? (
            <div
              className="doc-spacer"
              aria-hidden="true"
              style={{ height: documentScrollTopForPage(spacerPage, scrollMetrics) }}
            />
          ) : null}
          <div
            className={`turn-sheet incoming${docScroll ? ' doc-slot' : ' idle'}`}
            style={docScroll ? { minHeight: scrollMetrics.slot } : undefined}
          >
            <div
              className={`page-spread${layout === 'spread' ? ' two-up' : ''}${spreadLonePage(layout, pages) ? ' lonely' : ''}${layout === 'continuous' ? ' stacked' : ''}`}
              style={spreadLonePage(layout, pages) ? {
                '--lonely-page-w': `${pageBox.width}px`,
                '--lonely-page-h': `${pageBox.height}px`,
              } : undefined}
            >
            {pages.map((num, i) => (
              <PageView
                key={`slot-${i}`}
                doc={doc}
                num={num}
                scale={scale}
                rotation={rotation}
                baseSize={baseSize}
                annotations={annotationsByPage.get(num) || NO_ANNOTATIONS}
                selection={selection[num] || null}
                tool={tool}
                onRegionCapture={onRegionCapture}
                regionMark={regionMark?.page === num ? regionMark : null}
                onRegionMark={setRegionMark}
                onImagePick={onImagePick}
                selectedImage={selectedImage && selectedImage.page === num ? selectedImage : null}
                onContextMenuAt={onContextMenu}
                onError={onError}
                register={registerPage}
                outline={outline}
                onFollowLink={onFollowLink}
                onGoToPage={onGoToPage}
                searchQuery={searchQuery}
                searchActive={searchActive}
                onSearchHit={onSearchHit}
                bookmarks={bookmarksByPage.get(num) || NO_BOOKMARKS}
                activeBookmarkId={activeBookmarkId}
                activeCommentId={activeCommentId}
                eagerPaint={paintsEagerly(layout)}
              />
            ))}
            {spreadLonePage(layout, pages) ? (
              <div
                className="page page-blank"
                aria-hidden="true"
                style={{ width: pageBox.width, height: pageBox.height }}
              />
            ) : null}
            </div>
          </div>
          {docScroll && scrollMetrics.sheets > 1 ? (
            <div
              className="doc-spacer"
              aria-hidden="true"
              style={{ height: documentScrollTail(spacerPage, scrollMetrics) }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
});

// ── A single page ─────────────────────────────────────────
// Memoised: a text drag updates the selection many times a second, and without
// this every mounted page would re-render on each of those updates — which is
// what made the selection flicker on long documents.
const PageView = React.memo(function PageView({
  doc, num, scale, rotation, baseSize, annotations, selection,
  tool, onRegionCapture, onImagePick, selectedImage, onRegionMark, regionMark,
  onContextMenuAt, onError, register,
  outline, onFollowLink, onGoToPage, searchQuery, searchActive, onSearchHit,
  bookmarks, activeBookmarkId, activeCommentId, eagerPaint = false,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [visible, setVisible] = useState(eagerPaint);
  const [rendered, setRendered] = useState(false);
  const [size, setSize] = useState(null);
  const [drag, setDrag] = useState(null);        // rectangle being dragged
  const [textDrag, setTextDrag] = useState(null); // stream-select on the text tool
  const [cssSize, setCssSize] = useState(null);   // canvas / text-layer CSS px
  const [regions, setRegions] = useState([]);    // embedded image rectangles
  const [links, setLinks] = useState([]);        // in-page TOC / cross-ref links
  const [pdfComments, setPdfComments] = useState([]);
  const [hover, setHover] = useState(null);      // image under the pointer
  const [textReady, setTextReady] = useState(0);
  const [searchMarks, setSearchMarks] = useState([]);
  const pdfHeightRef = useRef(0);

  const regionTool = tool === 'region';   // drag a rectangle out of the page
  const imageTool = tool === 'image';     // click a picture to select it
  const textTool = tool === 'text';

  // Prefer the rendered viewport size so the wrapper, canvas and text layer
  // stay pixel-identical. `inset: 0` on a differently-sized wrapper stretched
  // the spans and made the caret miss the glyph the user clicked.
  const placeholder = cssSize || pagePlaceholderSize({ size, baseSize, scale, rotation });

  const lastPaintScale = useRef(scale);
  if (lastPaintScale.current !== scale) {
    lastPaintScale.current = scale;
    if (cssSize) setCssSize(null);
  }
  const paintedNum = useRef(num);
  if (paintedNum.current !== num) {
    paintedNum.current = num;
    if (rendered) setRendered(false);
  }

  useLayoutEffect(() => {
    register(num, {
      wrapper: wrapRef.current,
      canvas: canvasRef.current,
      textLayer: textRef.current,
      painted: false,
    });
    return () => register(num, null);
  }, [num, register]);

  // Render only while near the viewport. A facing pair can sit so wide that
  // only the gutter intersects, so paged layouts skip this and always paint.
  useEffect(() => {
    if (eagerPaint) {
      setVisible(true);
      return undefined;
    }
    const el = wrapRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { root: el.closest('.pageview'), rootMargin: `${NEAR} ${NEAR}` }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eagerPaint]);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    let task = null;

    (async () => {
      try {
        const page = await doc.getPage(num);
        if (cancelled) return;
        const intrinsic = page.getViewport({ scale: 1 });
        setSize({ width: intrinsic.width, height: intrinsic.height });
        pdfHeightRef.current = page.view ? (page.view[3] - page.view[1]) : intrinsic.height;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const res = await renderPage({ page, canvas, scale, rotation });
        task = res.task;
        await task.promise;
        task = null;
        if (cancelled) return;
        const cssW = Math.max(1, Math.floor(res.viewport.width));
        const cssH = Math.max(1, Math.floor(res.viewport.height));
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        setCssSize({ width: cssW, height: cssH });
        setRendered(true);

        if (textRef.current) {
          textRef.current.style.width = `${cssW}px`;
          textRef.current.style.height = `${cssH}px`;
          await renderTextLayer({ page, container: textRef.current, viewport: res.viewport });
          if (!cancelled) setTextReady((n) => n + 1);
        }
        if (cancelled) return;

        register(num, {
          wrapper: wrapRef.current,
          canvas: canvasRef.current,
          textLayer: textRef.current,
          pdfHeight: pdfHeightRef.current,
          painted: true,
        });

        try {
          const found = await getPageImageRegions(page, res.viewport);
          if (!cancelled) setRegions(found);
        } catch { /* picking simply stays unavailable for this page */ }

        try {
          const found = await getPageLinks(page, res.viewport);
          if (!cancelled) setLinks(found);
        } catch { if (!cancelled) setLinks([]); }

        try {
          const found = await getPageComments(page, res.viewport);
          if (!cancelled) setPdfComments(found);
        } catch { if (!cancelled) setPdfComments([]); }
      } catch (err) {
        if (cancelled || err?.name === 'RenderingCancelledException') return;
        onError?.(err, 'render');
      }
    })();

    return () => {
      cancelled = true;
      try { task?.cancel(); } catch { /* already finished */ }
    };
  }, [visible, doc, num, scale, rotation, onError]);

  // Paint every match of the current search on this page. The clicked hit
  // is marked active so it can be scrolled into view.
  useEffect(() => {
    if (!textReady || !searchQuery?.trim()) {
      setSearchMarks([]);
      return;
    }
    const layer = textRef.current;
    if (!layer) {
      setSearchMarks([]);
      return;
    }
    const hits = collectLayerSearchHits(layer, searchQuery);
    const active = searchActive?.page === num ? Number(searchActive.pageHit) : -1;
    setSearchMarks(hits.map((h, i) => ({ ...h, active: i === active })));
    if (active >= 0 && hits[active]) onSearchHit?.(num, hits[active], searchActive.stamp);
  }, [textReady, searchQuery, searchActive, num, onSearchHit]);

  // ── Pointer handling for the region / image tool ────────
  const localPoint = (e, el) => {
    const box = el.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const regionAt = useCallback((pt) => hitTestRegion(regions, pt), [regions]);

  const startDrag = (e) => {
    if (e.button !== 0) return;
    const p = localPoint(e, e.currentTarget);
    if (regionTool) {
      e.preventDefault();
      onRegionMark?.(null);
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (textTool) {
      e.preventDefault();
      const start = caretAtPoint(textRef.current, e.clientX, e.clientY);
      if (start) applyStreamSelection(start, start);
      setTextDrag({
        x0: p.x, y0: p.y, x1: p.x, y1: p.y,
        start,
        active: false,
      });
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    }
  };

  const moveDrag = (e) => {
    const p = localPoint(e, e.currentTarget);
    if (drag) { setDrag((d) => ({ ...d, x1: p.x, y1: p.y })); return; }
    if (textDrag) {
      const next = { ...textDrag, x1: p.x, y1: p.y };
      if (!next.active && (Math.abs(next.x1 - next.x0) >= MIN_TEXT_DRAG || Math.abs(next.y1 - next.y0) >= MIN_TEXT_DRAG)) {
        next.active = true;
      }
      if (next.start) {
        const end = caretAtPoint(textRef.current, e.clientX, e.clientY);
        if (end) applyStreamSelection(next.start, end);
      }
      setTextDrag(next);
      return;
    }
    if (imageTool) setHover(regionAt(p));
  };

  const finishTextDrag = (e) => {
    const dragState = textDrag;
    setTextDrag(null);
    const layer = textRef.current;
    if (!dragState || !layer) return;

    if (dragState.active && dragState.start && e) {
      const end = caretAtPoint(layer, e.clientX, e.clientY);
      if (end) applyStreamSelection(dragState.start, end);
      return;
    }

    if (e && !dragState.start) {
      const range = rangeAtPoint(layer, e.clientX, e.clientY);
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }

    // TOC pages that are just text (no Link annotations): a click on a line
    // that matches an outline title jumps to that section.
    if (e && outline?.length) {
      const line = lineTextNearPoint(layer, e.clientX, e.clientY);
      const hit = matchOutlineTitle(line, outline);
      if (hit?.page) onGoToPage?.(hit.page, hit.loc);
      else if (hit?.dest && onFollowLink) onFollowLink({ dest: hit.dest });
    }
  };

  // Image tool: a plain click selects whichever picture is under the pointer.
  // Selecting does not copy — the context menu offers copy / save / keep.
  const pickImage = (e) => {
    if (!imageTool || e.button !== 0) return;
    const hit = regionAt(localPoint(e, e.currentTarget));
    onImagePick?.(hit ? { page: num, id: hit.id, name: hit.name, inline: hit.inline, rect: hit.rect } : null);
    if (!hit) return;
    // Picking a picture offers what can be done with it straight away, at the
    // point it was clicked — the same menu a right-click on it would give.
    const { clientX, clientY } = e;
    setTimeout(() => {
      onContextMenuAt?.(
        { preventDefault() {}, stopPropagation() {}, clientX, clientY },
        { page: num, imageHit: { id: hit.id, name: hit.name, inline: hit.inline, rect: hit.rect } }
      );
    }, 0);
  };

  // A right-click on a picture reports the hit alongside the event, so the menu
  // can offer image actions for exactly the picture that was clicked.
  const onContextMenu = (e) => {
    const hit = imageTool ? regionAt(localPoint(e, e.currentTarget)) : null;
    e.stopPropagation();
    const selectionText = pickCopyText(window.getSelection()?.toString());
    onContextMenuAt?.(e, hit
      ? { page: num, imageHit: { id: hit.id, name: hit.name, inline: hit.inline, rect: hit.rect }, selectionText }
      : { selectionText });
  };

  const endDrag = (e) => {
    if (!drag) return;
    const at = e ? { clientX: e.clientX, clientY: e.clientY } : null;
    const rect = normalizeDragRect(drag);
    setDrag(null);

    // Too small to be a deliberate rectangle — treat it as a stray click.
    if (!isMeaningfulCapture(rect)) {
      onRegionMark?.(null);
      return;
    }
    const box = wrapRef.current?.getBoundingClientRect();
    const mark = regionToFrac(rect, box?.width || placeholder.width, box?.height || placeholder.height);
    if (mark) onRegionMark?.({ page: num, ...mark });
    if (!canvasRef.current) return;
    try {
      const shot = cropCanvas(canvasRef.current, rect);
      onRegionCapture?.({ ...shot, page: num, rect, ...at });
    } catch (err) {
      onError?.(err, 'copy');
    }
  };

  const dragRect = visibleRegionBox(drag, regionMark);

  const painted = selection;
  const overImage = imageTool && !!hover;
  const pageW = placeholder.width;
  const pageH = placeholder.height;
  const comments = useMemo(() => {
    const notes = (annotations || [])
      .filter((a) => a.kind === 'note')
      .map((a) => workspaceNoteToComment(a, pageW, pageH))
      .filter(Boolean);
    const files = (annotations || [])
      .filter((a) => a.kind === 'fileattachment')
      .map((a) => workspaceAttachmentToComment(a, pageW, pageH))
      .filter(Boolean);
    return [...pdfComments, ...notes, ...files];
  }, [annotations, pdfComments, pageW, pageH]);

  return (
    <div
      className={`page${rendered ? ' rendered' : ''}${overImage ? ' over-image' : ''}`}
      ref={wrapRef}
      data-page={num}
      style={{ width: placeholder.width, height: placeholder.height }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={(e) => { finishTextDrag(e); endDrag(e); pickImage(e); }}
      onPointerCancel={(e) => { finishTextDrag(e); endDrag(e); setHover(null); }}
      onPointerLeave={() => { setHover(null); }}
      onContextMenu={onContextMenu}
    >
      <canvas
        className="page-canvas"
        ref={canvasRef}
        style={rendered ? undefined : { visibility: 'hidden' }}
      />

      {/* One block per selected line, under the text layer. */}
      {painted ? (
        <div className="sel-layer">
          {painted.map((l, i) => (
            <div
              key={i}
              className="sel-block"
              style={{ left: l.left, top: l.top, width: l.width, height: l.height }}
            />
          ))}
        </div>
      ) : null}

      {searchMarks.length ? (
        <div className="search-layer" aria-hidden="true">
          {searchMarks.flatMap((m, i) => (m.rects || []).map((r, j) => (
            <div
              key={`${i}-${j}`}
              className={`search-block${m.active ? ' active' : ''}`}
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            />
          )))}
        </div>
      ) : null}

      <div className="textLayer" ref={textRef} />

      {links.length ? (
        <div className="pdf-links">
          {links.map((link) => (
            <a
              key={link.id}
              className="pdf-link"
              href={link.url || '#'}
              title={link.title || link.url || ''}
              style={{ left: link.rect.x, top: link.rect.y, width: link.rect.width, height: link.rect.height }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onFollowLink?.(link);
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="annots">
        {annotations.filter((a) => a.kind !== 'note').map((a) => (
          <div
            key={a.id}
            className={`annot ${a.kind}`}
            style={{
              left: `${a.rect.x * 100}%`,
              top: `${a.rect.y * 100}%`,
              width: `${a.rect.w * 100}%`,
              height: `${a.rect.h * 100}%`,
              background: a.color,
            }}
            title={a.text || ''}
          />
        ))}
      </div>

      {comments.length ? (
        <div className="comment-layer">
          {comments.map((c) => {
            const anchor = c.rects[0] || { x: 0, y: 0, width: 0, height: 0 };
            const card = commentCardPos(anchor, pageW, pageH);
            const body = [c.author, c.text].filter(Boolean).join(' — ');
            return (
              <div key={c.id} className={`comment-item kind-${c.kind}${activeCommentId === c.id ? ' active' : ''}`}>
                {c.rects.map((r, i) => (
                  <div
                    key={i}
                    className={`comment-mark ${c.kind}`}
                    style={{
                      left: r.x, top: r.y, width: r.width, height: r.height,
                      background: c.kind === 'underline' || c.kind === 'strikeout' || c.kind === 'squiggly'
                        ? 'transparent'
                        : c.color,
                    }}
                    title={body}
                  />
                ))}
                {c.text || c.author ? (
                  <div
                    className={`comment-card${activeCommentId === c.id ? ' active' : ''}`}
                    style={{ left: card.left, top: card.top }}
                    title={body}
                  >
                    {c.author ? <div className="comment-author">{c.author}</div> : null}
                    {c.text ? <div className="comment-text">{c.text}</div> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {bookmarks?.length ? (
        <div className="bm-layer" aria-hidden="true">
          {bookmarks.map((b) => {
            const marks = bookmarkPaintRects(b);
            if (!marks.length) return null;
            const on = activeBookmarkId === b.id;
            return (
              <div key={b.id}>
                {marks.map((r, i) => (
                  <div
                    key={i}
                    className={`bm-block${on ? ' active' : ''}`}
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                    }}
                    title={b.label}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Outline every picture while the image tool is active. */}
      {imageTool && regions.length ? (
        <div className="img-regions">
          {regions.map((r) => (
            <div
              key={r.id}
              className={`img-region${hover && hover.id === r.id ? ' hot' : ''}${selectedImage && selectedImage.id === r.id ? ' picked' : ''}`}
              style={{ left: r.rect.x, top: r.rect.y, width: r.rect.width, height: r.rect.height }}
            />
          ))}
        </div>
      ) : null}

      {dragRect ? (
        <div
          className={`marquee${regionMark && !drag ? ' picked' : ''}`}
          style={dragRect}
        />
      ) : null}
      {!rendered ? <div className="page-skeleton"><span>{num}</span></div> : null}
    </div>
  );
});

export default PdfView;
