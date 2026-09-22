import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { renderPage, renderTextLayer, cropCanvas, getPageImageRegions, getPageLinks, getPageComments } from '../lib/pdf.js';
import { commentCardPos, workspaceNoteToComment, workspaceAttachmentToComment } from '../lib/comments.js';
import { matchOutlineTitle, lineTextNearPoint } from '../lib/nav.js';
import {
  computeScale, mergeRectsIntoLines, pagePlaceholderSize,
  hitTestRegion, normalizeDragRect, isMeaningfulCapture, regionToFrac, visibleRegionBox,
  pickCopyText, paintedSelectionToRects, locFromTop, hasPageLoc, bookmarkPaintRects,
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

// Turning pages with the wheel in the single-page layout.
const REST_MS = 200;     // a scrollable page must sit at its edge this long first
const TURN_GAP_MS = 400; // …and one flick of the wheel never skips two pages

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
  const scrollRef = useRef(null);
  const pageRefs = useRef(new Map());   // page number → { wrapper, canvas, textLayer }
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

  // ── Container measurement (drives fit-width / fit-page) ──
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    () => computeScale({ baseSize, viewport, zoomMode, zoom, rotation }),
    [baseSize, viewport, zoomMode, zoom, rotation],
  );

  useEffect(() => { onScaleChange?.(scale); }, [scale, onScaleChange]);

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
    if (layout === 'single') {
      root.scrollTo({ top: Math.max(0, fromTop * pageH - 24), behavior });
    } else {
      const delta = entry.wrapper.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top: Math.max(0, root.scrollTop + delta - 12 + fromTop * pageH), behavior });
    }
    return true;
  }, [layout]);

  const registerPage = useCallback((num, entry) => {
    if (entry) pageRefs.current.set(num, entry);
    else pageRefs.current.delete(num);
    const pending = pendingLoc.current;
    if (pending && pending.page === num && entry?.wrapper && (pending.loc?.fracY != null || entry?.pdfHeight > 0)) {
      pendingLoc.current = null;
      applyPageLoc(entry, pending.loc, scrollRef.current, 'auto');
    }
  }, [applyPageLoc]);

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
    if (layout === 'single') return [pageNumber];
    return Array.from({ length: doc.numPages }, (_, i) => i + 1);
  }, [doc, layout, pageNumber]);

  // In continuous layout the current page follows the scroll position.
  const suppressScrollSync = useRef(false);

  // ── Keeping your place across a zoom ────────────────────
  // Scaling changes every page's height, so the raw scroll offset would land
  // somewhere else entirely. The page currently at the top of the viewport and
  // how far into it we are get recorded on every scroll, and restored once the
  // new layout is in place.
  const anchor = useRef({ page: 1, ratio: 0 });

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
    const entry = pageRefs.current.get(anchor.current.page);
    if (!root || !entry?.wrapper) return;
    const rootRect = root.getBoundingClientRect();
    const r = entry.wrapper.getBoundingClientRect();
    suppressScrollSync.current = true;
    root.scrollTop += (r.top - rootRect.top) + anchor.current.ratio * r.height;
    setTimeout(() => { suppressScrollSync.current = false; }, 250);
  }, []);

  // Re-anchor after every zoom / rotation, once the new sizes are laid out.
  const lastGeometry = useRef({ scale, rotation });
  useLayoutEffect(() => {
    if (lastGeometry.current.scale === scale && lastGeometry.current.rotation === rotation) return;
    lastGeometry.current = { scale, rotation };
    restoreAnchor();
  }, [scale, rotation, restoreAnchor]);


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
      if (best && bestRatio > 0) onPageChange?.(best);
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

  // In the single-page layout only one page is mounted, so the wheel would stop
  // dead at the bottom of it. Rolling on past either edge turns to the
  // neighbouring page and lands on the edge you came from, so the document
  // still reads straight through — the same as scrolling the continuous layout.
  const landEdge = useRef(null);    // where scrollToPage should put the next page
  const turn = useRef({ edge: null, since: 0, last: 0 });

  const wheelTurnPage = useCallback((e) => {
    const el = scrollRef.current;
    if (!el || layout !== 'single' || !doc) return;
    const down = e.deltaY > 0;
    const edge = down
      ? (el.scrollTop + el.clientHeight >= el.scrollHeight - 1 ? 'bottom' : null)
      : (el.scrollTop <= 1 ? 'top' : null);

    const state = turn.current;
    if (!edge) { state.edge = null; return; }

    const now = Date.now();
    if (state.edge !== edge) { state.edge = edge; state.since = now; }

    // A page that fits entirely has no edge to arrive at, so it turns at once;
    // one you were scrolling through waits, or overshooting the end of a page
    // would carry you into the next one.
    const scrollable = el.scrollHeight > el.clientHeight + 1;
    if (scrollable && now - state.since < REST_MS) return;
    if (now - state.last < TURN_GAP_MS) return;

    const next = down ? pageNumber + 1 : pageNumber - 1;
    if (next < 1 || next > doc.numPages) return;

    e.preventDefault();
    state.last = now;
    state.edge = null;
    landEdge.current = down ? 'top' : 'bottom';
    onPageChange?.(next);
  }, [doc, layout, pageNumber, onPageChange]);

  // Ctrl + wheel zooms, as it does in every other document viewer. The listener
  // has to be a non-passive native one: React's synthetic wheel handler is
  // passive, so preventDefault() there would not stop the browser's own zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) { if (e.deltaY !== 0) wheelTurnPage(e); return; }
      e.preventDefault();
      if (e.deltaY === 0) return;
      captureAnchor();
      onZoomStep?.(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [captureAnchor, onZoomStep, wheelTurnPage]);

  // Scroll a page into view when the page number changes from outside.
  //
  // This scrolls the page container itself rather than calling scrollIntoView:
  // scrollIntoView also scrolls every scrollable ancestor, which pushes the
  // toolbar and title bar off the top of the window.
  const scrollToPage = useCallback((num, behavior = 'auto', loc = null) => {
    const entry = pageRefs.current.get(num);
    const root = scrollRef.current;
    if (!entry?.wrapper || !root) {
      if (hasPageLoc(loc)) pendingLoc.current = { page: num, loc };
      return;
    }
    if (layout === 'single') {
      // Turning back with the wheel should show the foot of the previous page,
      // not its head — otherwise scrolling up jumps over a screenful of text.
      const edge = landEdge.current;
      landEdge.current = null;
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
    setTimeout(() => { suppressScrollSync.current = false; }, behavior === 'smooth' ? 700 : 250);
  }, [applyPageLoc, layout]);

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

  useEffect(() => {
    if (!doc) return;
    scrollToPage(pageNumber);
    // Only react to an externally driven page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, layout, doc]);

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

  return (
    <div
      className={`pageview tool-${tool}${invert ? ' invert' : ''}`}
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
      <div className="pagestack">
        {pages.map((num) => (
          <PageView
            key={num}
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
          />
        ))}
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
  bookmarks, activeBookmarkId, activeCommentId,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [visible, setVisible] = useState(false);
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

  useEffect(() => {
    register(num, { wrapper: wrapRef.current, canvas: canvasRef.current, textLayer: textRef.current });
    return () => register(num, null);
  }, [num, register]);

  // Render only while near the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { root: el.closest('.pageview'), rootMargin: `${NEAR} 0px` }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      <canvas className="page-canvas" ref={canvasRef} />

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
