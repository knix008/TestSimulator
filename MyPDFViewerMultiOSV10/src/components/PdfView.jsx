import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { renderPage, renderTextLayer, cropCanvas, getPageImageRegions } from '../lib/pdf.js';

// The page area: renders pages to canvases, lays a real (selectable) text layer
// over each one, paints highlights and the current text selection, and hosts
// the region/image picking tool.
//
// Pages are only rasterized while they are near the viewport; everything else
// keeps its correct size as an empty placeholder, so scrolling stays accurate
// and memory stays bounded on large documents.

const NEAR = '900px'; // how far outside the viewport a page starts rendering

// Turning pages with the wheel in the single-page layout.
const REST_MS = 200;     // a scrollable page must sit at its edge this long first
const TURN_GAP_MS = 400; // …and one flick of the wheel never skips two pages

// The browser paints a text selection span by span, which looks speckled on a
// PDF text layer. Merging the selection's client rectangles into one block per
// line gives the solid, unmistakable selection users expect.
function mergeRectsIntoLines(rects) {
  const items = rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const lines = [];
  for (const r of items) {
    const mid = (r.top + r.bottom) / 2;
    // Same line when this rect's vertical centre falls inside an existing line.
    const line = lines.find((l) => mid >= l.top - 1 && mid <= l.bottom + 1);
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ ...r });
    }
  }
  return lines;
}

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
  onContextMenu,
  onScaleChange,
  onZoomStep,
  onError,
  emptyState,
}, ref) {
  const scrollRef = useRef(null);
  const pageRefs = useRef(new Map());   // page number → { wrapper, canvas, textLayer }
  const [baseSize, setBaseSize] = useState(null); // intrinsic size of page 1 at scale 1
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selection, setSelection] = useState(null); // { page, lines: [{left,top,width,height}] }

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
    setSelection(null);
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
  const scale = useMemo(() => {
    if (!baseSize || !viewport.width) return zoomMode === 'custom' ? zoom : 1;
    const rotated = (rotation / 90) % 2 !== 0;
    const w = rotated ? baseSize.height : baseSize.width;
    const h = rotated ? baseSize.width : baseSize.height;
    const padX = 56;   // page margins inside the scroller
    const padY = 48;
    switch (zoomMode) {
      case 'fit-width': return Math.max(0.1, (viewport.width - padX) / w);
      case 'fit-page': return Math.max(0.1, Math.min((viewport.width - padX) / w, (viewport.height - padY) / h));
      case 'actual': return 1;
      default: return zoom;
    }
  }, [baseSize, viewport, zoomMode, zoom, rotation]);

  useEffect(() => { onScaleChange?.(scale); }, [scale, onScaleChange]);

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
  const scrollToPage = useCallback((num, behavior = 'auto') => {
    const entry = pageRefs.current.get(num);
    const root = scrollRef.current;
    if (!entry?.wrapper || !root) return;
    if (layout === 'single') {
      // Turning back with the wheel should show the foot of the previous page,
      // not its head — otherwise scrolling up jumps over a screenful of text.
      const edge = landEdge.current;
      landEdge.current = null;
      root.scrollTo({
        top: edge === 'bottom' ? root.scrollHeight : 0,
        behavior: edge ? 'auto' : behavior,
      });
      return;
    }
    // Ignore the scroll-driven page updates this programmatic scroll causes.
    suppressScrollSync.current = true;
    const delta = entry.wrapper.getBoundingClientRect().top - root.getBoundingClientRect().top;
    root.scrollTo({ top: Math.max(0, root.scrollTop + delta - 12), behavior });
    setTimeout(() => { suppressScrollSync.current = false; }, behavior === 'smooth' ? 700 : 250);
  }, [layout]);

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

  // A descendant search, not a child one: parking puts the block back as a
  // direct child, but positioning it moves it in beside the anchor, which in a
  // tagged PDF sits inside a .markedContent wrapper. A child-only query stops
  // finding it there, and a block that can no longer be found is a block left
  // covering the page — which is what makes a drag swallow the whole of it.
  const endBlockOf = (layer) => layer.querySelector('.endOfContent');

  const parkEndBlock = useCallback((layer) => {
    const end = endBlockOf(layer);
    if (end) {
      layer.append(end);
      end.style.width = '';
      end.style.height = '';
    }
    layer.classList.remove('selecting');
  }, []);

  const parkAllEndBlocks = useCallback(() => {
    for (const [, entry] of pageRefs.current) {
      if (entry?.textLayer) parkEndBlock(entry.textLayer);
    }
  }, [parkEndBlock]);

  const syncEndBlocks = useCallback(() => {
    const sel = window.document.getSelection();
    if (!sel || sel.rangeCount === 0) { parkAllEndBlocks(); prevRange.current = null; return; }

    // Only the pages the selection actually touches need the guard.
    const active = new Set();
    for (let i = 0; i < sel.rangeCount; i += 1) {
      const r = sel.getRangeAt(i);
      for (const [, entry] of pageRefs.current) {
        const layer = entry?.textLayer;
        if (layer && !active.has(layer) && r.intersectsNode(layer)) active.add(layer);
      }
    }
    for (const [, entry] of pageRefs.current) {
      const layer = entry?.textLayer;
      if (!layer) continue;
      if (active.has(layer)) layer.classList.add('selecting');
      else parkEndBlock(layer);
    }

    const range = sel.getRangeAt(0);
    const prev = prevRange.current;
    // Which end of the selection is being dragged: if the far end has not
    // moved since last time, it is the start that is on the move.
    const modifyStart = prev
      && (range.compareBoundaryPoints(Range.END_TO_END, prev) === 0
        || range.compareBoundaryPoints(Range.START_TO_END, prev) === 0);
    let anchor = modifyStart ? range.startContainer : range.endContainer;
    if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
    prevRange.current = range.cloneRange();

    const layer = anchor.parentElement?.closest('.textLayer');
    const end = layer && endBlockOf(layer);
    if (!end) return;

    // Firefox puts the caret in empty space by itself, and moving the block
    // there fights it — the same exception pdf.js makes, using pdf.js's own
    // test: only Gecko reports a computed value for the -moz-user-select the
    // block's stylesheet sets. Asking CSS.supports() instead is not the same
    // question, and answering it wrong leaves the block parked over the page.
    if (isGecko.current === null) {
      isGecko.current = getComputedStyle(end).getPropertyValue('-moz-user-select') === 'none';
    }
    if (isGecko.current) return;

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
  }, [parkAllEndBlocks, parkEndBlock]);

  // A drag that ends outside the window still has to release the guard.
  useEffect(() => {
    const release = () => parkAllEndBlocks();
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
  // the very same rectangles, so the value is committed only when it actually
  // differs — an identical object would repaint for nothing, and that reads as
  // a flicker.
  const selectionSig = useRef('');

  const refreshSelection = useCallback(() => {
    const sel = window.document.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString() : '';
    onSelectionChange?.(text);

    const commit = (next) => {
      const sig = next
        ? `${next.page}:${next.lines.map((l) => `${Math.round(l.left)},${Math.round(l.top)},${Math.round(l.width)},${Math.round(l.height)}`).join('|')}`
        : '';
      if (sig === selectionSig.current) return;
      selectionSig.current = sig;
      setSelection(next);
    };

    if (!text || sel.rangeCount === 0) { commit(null); return; }
    let page = 0;
    let entry = null;
    for (const [num, e] of pageRefs.current) {
      if (e?.textLayer && (e.textLayer.contains(sel.anchorNode) || e.textLayer.contains(sel.focusNode))) {
        page = num; entry = e; break;
      }
    }
    if (!entry) { commit(null); return; }

    const box = entry.textLayer.getBoundingClientRect();
    const lines = mergeRectsIntoLines([...sel.getRangeAt(0).getClientRects()]).map((l) => ({
      left: l.left - box.left,
      top: l.top - box.top,
      width: l.right - l.left,
      height: l.bottom - l.top,
    }));
    commit(lines.length ? { page, lines } : null);
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
  useEffect(() => { refreshSelection(); }, [scale, rotation, layout, refreshSelection]);

  // ── Imperative API used by the toolbar / menus ──────────
  useImperativeHandle(ref, () => ({
    scrollToPage,

    // Selects every text node of one page (Ctrl+A / "Select page").
    selectPageText(num) {
      const entry = pageRefs.current.get(num);
      if (!entry?.textLayer) return false;
      const layer = entry.textLayer;
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
      refreshSelection();
      return true;
    },

    getPageCanvas(num) {
      return pageRefs.current.get(num)?.canvas || null;
    },

    // Current selection as page-relative rectangles (0..1), so a highlight
    // keeps its place at any zoom or rotation.
    getSelectionRects() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const text = sel.toString();
      let page = 0;
      let entry = null;
      for (const [num, e] of pageRefs.current) {
        if (e?.textLayer && (e.textLayer.contains(sel.anchorNode) || e.textLayer.contains(sel.focusNode))) {
          page = num; entry = e; break;
        }
      }
      if (!entry) return null;
      const box = entry.textLayer.getBoundingClientRect();
      const rects = mergeRectsIntoLines([...sel.getRangeAt(0).getClientRects()]).map((r) => ({
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        w: (r.right - r.left) / box.width,
        h: (r.bottom - r.top) / box.height,
      }));
      if (!rects.length) return null;
      return { page, rects, text };
    },

    clearSelection() {
      window.getSelection()?.removeAllRanges();
      parkAllEndBlocks();
      selectionSig.current = '';
      setSelection(null);
      onSelectionChange?.('');
    },
  }), [scrollToPage, refreshSelection, onSelectionChange, parkAllEndBlocks, parkEndBlock]);

  useEffect(() => {
    if (!doc) return;
    scrollToPage(pageNumber);
    // Only react to an externally driven page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, layout, doc]);

  if (!doc) {
    return <div className="pageview empty" ref={scrollRef}>{emptyState}</div>;
  }

  return (
    <div
      className={`pageview tool-${tool}${invert ? ' invert' : ''}`}
      ref={scrollRef}
      onContextMenu={(e) => onContextMenu?.(e, {})}
      onMouseDown={(e) => {
        // Arm the guard as the drag starts. Until the first selectionchange the
        // block still sits at the foot of the layer, and arming it there would
        // mean a quick drag into empty space selects everything down to it — so
        // move it beside the span being pressed first, and if the press landed
        // in empty space leave it disarmed for the one tick until the selection
        // reports where the caret actually went.
        const layer = e.target.closest?.('.textLayer');
        if (!layer) return;
        const span = e.target.closest('.textLayer span');
        const end = endBlockOf(layer);
        if (!end || !span || span === end) return;
        end.style.width = layer.style.width;
        end.style.height = layer.style.height;
        if (span.nextSibling !== end) span.parentElement.insertBefore(end, span.nextSibling);
        layer.classList.add('selecting');
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
            annotations={annotations.filter((a) => a.page === num)}
            selection={selection && selection.page === num ? selection.lines : null}
            tool={tool}
            onRegionCapture={onRegionCapture}
            onImagePick={onImagePick}
            selectedImage={selectedImage && selectedImage.page === num ? selectedImage : null}
            onContextMenuAt={onContextMenu}
            onError={onError}
            register={(entry) => {
              if (entry) pageRefs.current.set(num, entry);
              else pageRefs.current.delete(num);
            }}
          />
        ))}
      </div>
    </div>
  );
});

// ── A single page ─────────────────────────────────────────
function PageView({
  doc, num, scale, rotation, baseSize, annotations, selection,
  tool, onRegionCapture, onImagePick, selectedImage, onContextMenuAt, onError, register,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [size, setSize] = useState(null);
  const [drag, setDrag] = useState(null);        // rectangle being dragged
  const [regions, setRegions] = useState([]);    // embedded image rectangles
  const [hover, setHover] = useState(null);      // image under the pointer

  const regionTool = tool === 'region';   // drag a rectangle out of the page
  const imageTool = tool === 'image';     // click a picture to select it

  // Placeholder geometry before the real page is measured.
  const placeholder = useMemo(() => {
    const src = size || baseSize;
    if (!src) return { width: 600, height: 850 };
    const rotated = (rotation / 90) % 2 !== 0;
    return {
      width: Math.round((rotated ? src.height : src.width) * scale),
      height: Math.round((rotated ? src.width : src.height) * scale),
    };
  }, [size, baseSize, scale, rotation]);

  useEffect(() => {
    register({ wrapper: wrapRef.current, canvas: canvasRef.current, textLayer: textRef.current });
    return () => register(null);
  });

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

        const canvas = canvasRef.current;
        if (!canvas) return;
        const res = await renderPage({ page, canvas, scale, rotation });
        task = res.task;
        await task.promise;
        if (cancelled) return;
        setRendered(true);

        if (textRef.current) {
          textRef.current.style.width = `${Math.floor(res.width)}px`;
          textRef.current.style.height = `${Math.floor(res.height)}px`;
          await renderTextLayer({ page, container: textRef.current, viewport: res.viewport });
        }
        if (cancelled) return;

        // Image rectangles, so a picture can be picked with a single click.
        try {
          const found = await getPageImageRegions(page, res.viewport);
          if (!cancelled) setRegions(found);
        } catch { /* picking simply stays unavailable for this page */ }
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

  // ── Pointer handling for the region / image tool ────────
  const localPoint = (e, el) => {
    const box = el.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const regionAt = useCallback((pt) => regions.find((r) => (
    pt.x >= r.rect.x && pt.x <= r.rect.x + r.rect.width
    && pt.y >= r.rect.y && pt.y <= r.rect.y + r.rect.height
  )) || null, [regions]);

  const startDrag = (e) => {
    // The image tool never drags: a click on a picture is handled on mouse-up.
    if (!regionTool || e.button !== 0) return;
    e.preventDefault();
    const p = localPoint(e, e.currentTarget);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const moveDrag = (e) => {
    const p = localPoint(e, e.currentTarget);
    if (drag) { setDrag((d) => ({ ...d, x1: p.x, y1: p.y })); return; }
    if (imageTool) setHover(regionAt(p));
  };

  // Image tool: a plain click selects whichever picture is under the pointer.
  // Selecting does not copy — the context menu offers copy / save / keep.
  const pickImage = (e) => {
    if (!imageTool || e.button !== 0) return;
    const hit = regionAt(localPoint(e, e.currentTarget));
    onImagePick?.(hit ? { page: num, id: hit.id, inline: hit.inline, rect: hit.rect } : null);
  };

  // A right-click on a picture reports the hit alongside the event, so the menu
  // can offer image actions for exactly the picture that was clicked.
  const onContextMenu = (e) => {
    const hit = imageTool ? regionAt(localPoint(e, e.currentTarget)) : null;
    e.stopPropagation();
    onContextMenuAt?.(e, hit ? { page: num, imageHit: { id: hit.id, inline: hit.inline, rect: hit.rect } } : {});
  };

  const endDrag = () => {
    if (!drag) return;
    const rect = {
      x: Math.min(drag.x0, drag.x1),
      y: Math.min(drag.y0, drag.y1),
      width: Math.abs(drag.x1 - drag.x0),
      height: Math.abs(drag.y1 - drag.y0),
    };
    setDrag(null);

    // Too small to be a deliberate rectangle — treat it as a stray click.
    if (rect.width < 6 || rect.height < 6) return;
    if (!canvasRef.current) return;
    try {
      const shot = cropCanvas(canvasRef.current, rect);
      onRegionCapture?.({ ...shot, page: num });
    } catch (err) {
      onError?.(err, 'copy');
    }
  };

  const dragRect = drag ? {
    left: Math.min(drag.x0, drag.x1),
    top: Math.min(drag.y0, drag.y1),
    width: Math.abs(drag.x1 - drag.x0),
    height: Math.abs(drag.y1 - drag.y0),
  } : null;

  const overImage = imageTool && !!hover;

  return (
    <div
      className={`page${rendered ? ' rendered' : ''}${overImage ? ' over-image' : ''}`}
      ref={wrapRef}
      data-page={num}
      style={{ width: placeholder.width, height: placeholder.height }}
      onMouseDown={startDrag}
      onMouseMove={moveDrag}
      onMouseUp={(e) => { endDrag(); pickImage(e); }}
      onMouseLeave={() => { endDrag(); setHover(null); }}
      onContextMenu={onContextMenu}
    >
      <canvas className="page-canvas" ref={canvasRef} />

      {/* Painted selection sits under the text layer so the text stays hit-testable. */}
      {selection ? (
        <div className="sel-layer">
          {selection.map((l, i) => (
            <div key={i} className="sel-block" style={{ left: l.left, top: l.top, width: l.width, height: l.height }} />
          ))}
        </div>
      ) : null}

      <div className="textLayer" ref={textRef} />

      <div className="annots">
        {annotations.map((a) => (
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

      {dragRect ? <div className="marquee" style={dragRect} /> : null}
      {!rendered ? <div className="page-skeleton"><span>{num}</span></div> : null}
    </div>
  );
}

export default PdfView;
