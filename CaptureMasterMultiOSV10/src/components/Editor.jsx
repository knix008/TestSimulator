import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { loadImage, cachedImage } from '../lib/image.js';
import {
  drawAnnotation, boundsOf, hitTest, handlesOf, moveAnnotation, resizeAnnotation, cursorForHandle,
  normRect, BOX_TYPES, LINE_TYPES, fontString, measureText,
} from '../lib/render.js';
import { newId } from '../lib/document.js';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
const ZOOM_STEPS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

export function nextZoom(z, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-6) || ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) || ZOOM_MIN;
}

// Chromium refuses canvases past ~16k a side; keep the backing store sane.
function backingScale(zoom, w, h) {
  const dpr = window.devicePixelRatio || 1;
  let s = zoom * dpr;
  const maxSide = 16000;
  const maxArea = 120e6;
  if (w * s > maxSide) s = maxSide / w;
  if (h * s > maxSide) s = Math.min(s, maxSide / h);
  if (w * h * s * s > maxArea) s = Math.sqrt(maxArea / (w * h));
  return s;
}

/**
 * The annotation editor. Draws the document at `zoom`, handles every mouse
 * interaction (draw, select, move, resize, marquee, text entry) and reports
 * finished edits through `onCommit` — one history entry per gesture.
 */
export const Editor = forwardRef(function Editor(props, ref) {
  const {
    doc, zoom, tool, toolProps, selectedId, checkerboard,
    onZoomChange, onSelect, onCommit, onSelectionChange, onCursor, onContextMenu, onFitDone, onStatus,
  } = props;
  const present = doc.history.present;

  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const latest = useRef({});
  const [img, setImg] = useState(() => cachedImage(present.image.dataUrl));
  const [textEdit, setTextEdit] = useState(null);   // { a, isNew }
  const [cursorStyle, setCursorStyle] = useState('default');
  const pendingScroll = useRef(null);
  const raf = useRef(0);

  latest.current = { present, zoom, tool, toolProps, selectedId, selection: doc.selection, img, textEdit };

  // Decode the base image (cached by data URL, so undo/redo is instant).
  useEffect(() => {
    let alive = true;
    const cached = cachedImage(present.image.dataUrl);
    if (cached) { setImg(cached); return undefined; }
    loadImage(present.image.dataUrl).then((im) => { if (alive) setImg(im); }).catch(() => {});
    return () => { alive = false; };
  }, [present.image.dataUrl]);

  // ── Drawing ──
  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const { present: p, zoom: z, selectedId: sel, selection, img: im } = latest.current;
    const W = p.image.width;
    const H = p.image.height;
    const s = backingScale(z, W, H);
    const bw = Math.max(1, Math.round(W * s));
    const bh = Math.max(1, Math.round(H * s));
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    c.style.width = `${Math.round(W * z)}px`;
    c.style.height = `${Math.round(H * z)}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (im) ctx.drawImage(im, 0, 0);

    const d = drag.current;
    const override = d && (d.mode === 'move' || d.mode === 'resize') ? d.preview : null;
    for (const a of p.annotations) {
      if (latest.current.textEdit && latest.current.textEdit.a.id === a.id) continue;   // the textarea shows it
      drawAnnotation(ctx, override && override.id === a.id ? override : a, im);
    }
    if (d && (d.mode === 'draw' || d.mode === 'pen') && d.draft) drawAnnotation(ctx, d.draft, im);

    // Overlay: 1px lines in screen space.
    const px = 1 / z;
    const selA = sel ? p.annotations.find((a) => a.id === sel) : null;
    const shown = override && selA && override.id === selA.id ? override : selA;
    if (shown) {
      const b = boundsOf(shown);
      ctx.save();
      ctx.strokeStyle = '#4cc9f0';
      ctx.lineWidth = px;
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.strokeRect(b.x - 2 * px, b.y - 2 * px, b.w + 4 * px, b.h + 4 * px);
      ctx.setLineDash([]);
      const hs = 8 * px;
      for (const h of handlesOf(shown)) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      }
      ctx.restore();
    }
    const marquee = d && d.mode === 'marquee' ? d.rect : selection;
    if (marquee && marquee.w > 0 && marquee.h > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = px;
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.restore();
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => { raf.current = 0; draw(); });
  }, [draw]);

  useLayoutEffect(() => { draw(); }, [draw, present, zoom, selectedId, doc.selection, img, textEdit]);

  // Keep the point under the cursor fixed while zooming.
  useLayoutEffect(() => {
    const ps = pendingScroll.current;
    const el = scrollRef.current;
    if (!ps || !el) return;
    pendingScroll.current = null;
    el.scrollLeft = ps.ix * zoom + ps.padX - ps.cx;
    el.scrollTop = ps.iy * zoom + ps.padY - ps.cy;
  }, [zoom]);

  // ── Fit to view ──
  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const W = present.image.width;
    const H = present.image.height;
    const avail = { w: el.clientWidth - 48, h: el.clientHeight - 48 };
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(avail.w / W, avail.h / H, 1)));
    onZoomChange(Number.isFinite(z) && z > 0 ? z : 1);
  }, [present.image.width, present.image.height, onZoomChange]);

  useEffect(() => {
    if (doc.fitRequested) { fit(); onFitDone(); }
  }, [doc.fitRequested, fit, onFitDone]);

  // ── Coordinates ──
  const toImage = useCallback((e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / latest.current.zoom, y: (e.clientY - r.top) / latest.current.zoom };
  }, []);

  const clampPt = (pt) => ({
    x: Math.max(0, Math.min(latest.current.present.image.width, pt.x)),
    y: Math.max(0, Math.min(latest.current.present.image.height, pt.y)),
  });

  const handleAt = (a, pt) => {
    const hs = 7 / latest.current.zoom;
    for (const h of handlesOf(a)) if (Math.abs(h.x - pt.x) <= hs && Math.abs(h.y - pt.y) <= hs) return h.id;
    return null;
  };

  // ── Text editing ──
  const beginText = useCallback((a, isNew) => setTextEdit({ a, isNew }), []);

  const finishText = useCallback((value, cancel) => {
    const te = latest.current.textEdit;
    if (!te) return;
    setTextEdit(null);
    const p = latest.current.present;
    const text = cancel ? (te.isNew ? '' : te.a.text) : String(value || '');
    if (!text.trim()) {
      if (!te.isNew) onCommit({ ...p, annotations: p.annotations.filter((x) => x.id !== te.a.id) });
      onSelect(null);
      return;
    }
    const updated = { ...te.a, text };
    const exists = p.annotations.some((x) => x.id === te.a.id);
    const annotations = exists ? p.annotations.map((x) => (x.id === te.a.id ? updated : x)) : [...p.annotations, updated];
    onCommit({ ...p, annotations });
    onSelect(updated.id);
  }, [onCommit, onSelect]);

  useImperativeHandle(ref, () => ({
    fit,
    editText(id) {
      const a = latest.current.present.annotations.find((x) => x.id === id);
      if (a && a.type === 'text') beginText(a, false);
    },
    zoomBy(dir) {
      const el = scrollRef.current;
      const z = nextZoom(latest.current.zoom, dir);
      if (el) {
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        const inner = el.firstElementChild;
        const padX = inner ? parseFloat(getComputedStyle(inner).paddingLeft) || 0 : 0;
        const padY = inner ? parseFloat(getComputedStyle(inner).paddingTop) || 0 : 0;
        pendingScroll.current = { ix: (el.scrollLeft + cx - padX) / latest.current.zoom, iy: (el.scrollTop + cy - padY) / latest.current.zoom, cx, cy, padX, padY };
      }
      onZoomChange(z);
    },
    isEditingText: () => !!latest.current.textEdit,
  }), [fit, beginText, onZoomChange]);

  // ── Wheel: Ctrl+wheel zooms around the pointer ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const z = latest.current.zoom;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor));
      if (Math.abs(nz - z) < 1e-4) return;
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const inner = el.firstElementChild;
      const padX = inner ? parseFloat(getComputedStyle(inner).paddingLeft) || 0 : 0;
      const padY = inner ? parseFloat(getComputedStyle(inner).paddingTop) || 0 : 0;
      pendingScroll.current = { ix: (el.scrollLeft + cx - padX) / z, iy: (el.scrollTop + cy - padY) / z, cx, cy, padX, padY };
      onZoomChange(nz);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onZoomChange]);

  // ── Mouse ──
  const onPointerDown = (e) => {
    if (e.button === 2) return;          // context menu handled separately
    if (e.button === 1) return;
    if (latest.current.textEdit) return; // the textarea's blur commits first
    const { tool: tl, toolProps: tp, present: p, selectedId: sel } = latest.current;
    const pt = toImage(e);
    const cpt = clampPt(pt);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tl === 'select') {
      const selA = sel ? p.annotations.find((a) => a.id === sel) : null;
      const h = selA ? handleAt(selA, pt) : null;
      if (selA && h) { drag.current = { mode: 'resize', id: selA.id, handle: h, start: pt, orig: selA, preview: selA }; return; }
      const hit = hitTest(p.annotations, pt.x, pt.y, 6 / latest.current.zoom);
      if (hit) {
        if (hit.id !== sel) onSelect(hit.id);
        drag.current = { mode: 'move', id: hit.id, start: pt, orig: hit, preview: hit, moved: false };
        return;
      }
      if (sel) onSelect(null);
      drag.current = { mode: 'marquee', start: cpt, rect: null };
      return;
    }
    if (tl === 'crop') { drag.current = { mode: 'marquee', start: cpt, rect: null }; return; }

    if (tl === 'text') {
      const hit = hitTest(p.annotations, pt.x, pt.y, 4 / latest.current.zoom);
      if (hit && hit.type === 'text') { onSelect(hit.id); beginText(hit, false); return; }
      const a = { id: newId('a'), type: 'text', x: cpt.x, y: cpt.y, text: '', color: tp.color, font: { ...tp.font }, bg: false };
      onSelect(null);
      beginText(a, true);
      return;
    }
    if (tl === 'number') {
      const size = Math.max(22, tp.font.size);
      const a = { id: newId('a'), type: 'number', x: cpt.x, y: cpt.y, n: doc.nextNumber || 1, color: tp.color, size };
      onCommit({ ...p, annotations: [...p.annotations, a] }, { nextNumber: (doc.nextNumber || 1) + 1 });
      onSelect(a.id);
      return;
    }
    if (tl === 'pen') {
      drag.current = { mode: 'pen', draft: { id: newId('a'), type: 'pen', points: [cpt], color: tp.color, strokeWidth: tp.strokeWidth } };
      scheduleDraw();
      return;
    }
    const base = { id: newId('a'), type: tl, color: tp.color, strokeWidth: tp.strokeWidth };
    if (LINE_TYPES.has(tl)) drag.current = { mode: 'draw', start: cpt, draft: { ...base, x1: cpt.x, y1: cpt.y, x2: cpt.x, y2: cpt.y } };
    else drag.current = { mode: 'draw', start: cpt, draft: { ...base, x: cpt.x, y: cpt.y, w: 0, h: 0, fill: (tl === 'rect' || tl === 'ellipse') ? tp.fill : undefined } };
  };

  const onPointerMove = (e) => {
    const pt = toImage(e);
    onCursor({ x: Math.round(pt.x), y: Math.round(pt.y) });
    const d = drag.current;
    if (!d) {
      // Hover cursor.
      const { tool: tl, present: p, selectedId: sel } = latest.current;
      if (tl === 'select') {
        const selA = sel ? p.annotations.find((a) => a.id === sel) : null;
        const h = selA ? handleAt(selA, pt) : null;
        if (h) setCursorStyle(cursorForHandle(h));
        else setCursorStyle(hitTest(p.annotations, pt.x, pt.y, 6 / latest.current.zoom) ? 'move' : 'default');
      } else if (tl === 'text') setCursorStyle('text');
      else setCursorStyle('crosshair');
      return;
    }
    const cpt = clampPt(pt);
    const shift = e.shiftKey;
    if (d.mode === 'draw') {
      let { x, y } = cpt;
      if (LINE_TYPES.has(d.draft.type)) {
        if (shift) {   // snap to 45°
          const dx = x - d.start.x; const dy = y - d.start.y;
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          x = d.start.x + Math.cos(ang) * len; y = d.start.y + Math.sin(ang) * len;
        }
        d.draft = { ...d.draft, x2: x, y2: y };
      } else {
        if (shift) {   // square
          const side = Math.max(Math.abs(x - d.start.x), Math.abs(y - d.start.y));
          x = d.start.x + Math.sign(x - d.start.x || 1) * side; y = d.start.y + Math.sign(y - d.start.y || 1) * side;
        }
        d.draft = { ...d.draft, ...normRect(d.start.x, d.start.y, x, y) };
      }
    } else if (d.mode === 'pen') {
      const last = d.draft.points[d.draft.points.length - 1];
      if (Math.hypot(cpt.x - last.x, cpt.y - last.y) >= 1.5 / latest.current.zoom) d.draft = { ...d.draft, points: [...d.draft.points, cpt] };
    } else if (d.mode === 'move') {
      const dx = pt.x - d.start.x; const dy = pt.y - d.start.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) d.moved = true;
      d.preview = moveAnnotation(d.orig, dx, dy);
    } else if (d.mode === 'resize') {
      d.preview = resizeAnnotation(d.orig, d.handle, pt.x - d.start.x, pt.y - d.start.y);
    } else if (d.mode === 'marquee') {
      d.rect = normRect(d.start.x, d.start.y, cpt.x, cpt.y);
      onStatus && onStatus({ marquee: d.rect });
    }
    scheduleDraw();
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = latest.current.present;
    const minSize = 3 / latest.current.zoom;
    if (d.mode === 'draw') {
      const a = d.draft;
      const b = boundsOf(a);
      if (b.w < minSize && b.h < minSize) { scheduleDraw(); return; }
      onCommit({ ...p, annotations: [...p.annotations, a] });
      onSelect(a.id);
    } else if (d.mode === 'pen') {
      if (d.draft.points.length < 2) { scheduleDraw(); return; }
      onCommit({ ...p, annotations: [...p.annotations, d.draft] });
      onSelect(d.draft.id);
    } else if (d.mode === 'move') {
      if (d.moved) onCommit({ ...p, annotations: p.annotations.map((a) => (a.id === d.id ? d.preview : a)) });
      else scheduleDraw();
    } else if (d.mode === 'resize') {
      onCommit({ ...p, annotations: p.annotations.map((a) => (a.id === d.id ? d.preview : a)) });
    } else if (d.mode === 'marquee') {
      const r = d.rect;
      if (r && r.w >= minSize && r.h >= minSize) onSelectionChange({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
      else onSelectionChange(null);
    }
  };

  const onDoubleClick = (e) => {
    const { tool: tl, present: p } = latest.current;
    if (tl !== 'select') return;
    const pt = toImage(e);
    const hit = hitTest(p.annotations, pt.x, pt.y, 6 / latest.current.zoom);
    if (hit && hit.type === 'text') { onSelect(hit.id); beginText(hit, false); }
  };

  const onCtx = (e) => {
    e.preventDefault();
    const pt = toImage(e);
    const p = latest.current.present;
    const hit = hitTest(p.annotations, pt.x, pt.y, 6 / latest.current.zoom);
    if (hit) onSelect(hit.id);
    onContextMenu(e, { annotation: hit, point: pt });
  };

  const W = present.image.width;
  const H = present.image.height;
  const te = textEdit;
  const teMeasure = te ? measureText({ ...te.a, text: te.a.text || 'M' }) : null;

  return (
    <div
      ref={scrollRef}
      className="editor"
      data-cursor={cursorStyle}
      style={{ cursor: cursorStyle }}
      onContextMenu={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('editor-inner')) { e.preventDefault(); onContextMenu(e, { annotation: null, point: null }); } }}
    >
      <div className="editor-inner">
        <div
          ref={stageRef}
          className={`editor-stage${checkerboard ? ' checker' : ''}`}
          style={{ width: Math.round(W * zoom), height: Math.round(H * zoom) }}
        >
          <canvas
            ref={canvasRef}
            className="editor-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => onCursor(null)}
            onDoubleClick={onDoubleClick}
            onContextMenu={onCtx}
          />
          {te ? (
            <TextEditor
              key={te.a.id}
              a={te.a}
              zoom={zoom}
              minW={teMeasure.w}
              onDone={finishText}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
});

// The in-place textarea for a text annotation. Commits on blur or Ctrl+Enter,
// cancels on Escape; Enter alone inserts a new line.
function TextEditor({ a, zoom, minW, onDone }) {
  const ref = useRef(null);
  const [value, setValue] = useState(a.text || '');
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.focus(); el.select(); }
  }, []);
  const m = measureText({ ...a, text: value || 'M' });
  const finish = (cancel) => { if (done.current) return; done.current = true; onDone(value, cancel); };
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); finish(true); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(false); }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        left: a.x * zoom,
        top: a.y * zoom,
        width: Math.max(minW, m.w + 12) * zoom,
        height: m.h * zoom,
        padding: m.pad * zoom,
        font: fontString({ ...a.font, size: (a.font.size || 24) * zoom }),
        color: a.color,
      }}
    />
  );
}

export default Editor;
