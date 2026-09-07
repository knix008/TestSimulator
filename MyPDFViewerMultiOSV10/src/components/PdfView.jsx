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

  // Ctrl + wheel zooms, as it does in every other document viewer. The listener
  // has to be a non-passive native one: React's synthetic wheel handler is
  // passive, so preventDefault() there would not stop the browser's own zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY === 0) return;
      captureAnchor();
      onZoomStep?.(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [captureAnchor, onZoomStep]);

  // Scroll a page into view when the page number changes from outside.
  //
  // This scrolls the page container itself rather than calling scrollIntoView:
  // scrollIntoView also scrolls every scrollable ancestor, which pushes the
  // toolbar and title bar off the top of the window.
  const scrollToPage = useCallback((num, behavior = 'auto') => {
    const entry = pageRefs.current.get(num);
    const root = scrollRef.current;
    if (!entry?.wrapper || !root) return;
    if (layout === 'single') { root.scrollTo({ top: 0, behavior }); return; }
    // Ignore the scroll-driven page updates this programmatic scroll causes.
    suppressScrollSync.current = true;
    const delta = entry.wrapper.getBoundingClientRect().top - root.getBoundingClientRect().top;
    root.scrollTo({ top: Math.max(0, root.scrollTop + delta - 12), behavior });
    setTimeout(() => { suppressScrollSync.current = false; }, behavior === 'smooth' ? 700 : 250);
  }, [layout]);

  // ── Text selection: report it and paint it as solid blocks ──
  const refreshSelection = useCallback(() => {
    const sel = window.document.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString() : '';
    onSelectionChange?.(text);

    if (!text || sel.rangeCount === 0) { setSelection(null); return; }
    let page = 0;
    let entry = null;
    for (const [num, e] of pageRefs.current) {
      if (e?.textLayer && (e.textLayer.contains(sel.anchorNode) || e.textLayer.contains(sel.focusNode))) {
        page = num; entry = e; break;
      }
    }
    if (!entry) { setSelection(null); return; }

    const box = entry.textLayer.getBoundingClientRect();
    const lines = mergeRectsIntoLines([...sel.getRangeAt(0).getClientRects()]).map((l) => ({
      left: l.left - box.left,
      top: l.top - box.top,
      width: l.right - l.left,
      height: l.bottom - l.top,
    }));
    setSelection(lines.length ? { page, lines } : null);
  }, [onSelectionChange]);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshSelection);
    return () => document.removeEventListener('selectionchange', refreshSelection);
  }, [refreshSelection]);

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
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(entry.textLayer);
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
      setSelection(null);
      onSelectionChange?.('');
    },
  }), [scrollToPage, refreshSelection, onSelectionChange]);

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
