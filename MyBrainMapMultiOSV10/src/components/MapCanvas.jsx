// The map view: the laid-out map as SVG (src/lib/render.js markup put in a
// <g>), with an overlay drawn by React on top of it — selection, drop
// targets, the marquee, relationship handles and the link being drawn.
//
// Mouse: click selects (Ctrl / Shift add), double-click edits (on the empty
// canvas: a floating topic there), drag a topic to move it (onto a topic:
// child; at its upper / lower edge: sibling before / after; empty space:
// floating), drag the canvas to pan (Shift / Ctrl + drag: marquee), wheel
// scrolls (Ctrl + wheel zooms), middle button pans.
//
// Keyboard: one textarea follows the selected topic. While not editing it is
// invisible and turns the keys into map commands; typing a character (or
// starting an IME composition — Korean works the same) turns it into the
// topic's editor without losing the first character.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderMapBody } from '../lib/render';
import { relationshipGeometry } from '../lib/layout';
import { measureText } from '../lib/measure';
import { isWithin, findTopic } from '../lib/model';
import { fontFamily } from '../lib/render';
import { t } from '../lib/i18n';
import { gridLines, rulerLabel } from '../lib/canvasgrid';

const MIN_K = 0.1, MAX_K = 4;
const clampK = (k) => Math.max(MIN_K, Math.min(MAX_K, k));
const DRAG_START = 5;
const DBL_MS = 420;

function nodeAt(L, x, y, exclude) {
  let best = null;
  for (const n of L.nodes.values()) {
    if (exclude && exclude(n)) continue;
    if (x >= n.x - 4 && x <= n.x + n.w + 4 && y >= n.y - 4 && y <= n.y + n.h + 4) {
      // the topmost (last drawn) wins
      best = n;
    }
  }
  return best;
}

// How a drop onto `n` at world y / x reads: child, or a sibling before / after.
function dropZone(n, x, y) {
  if (n.kind === 'root' || n.kind === 'floating' || n.kind === 'callout') return 'child';
  const pdir = n.parent ? n.parent.dir : 'right';
  const across = pdir === 'down' || pdir === 'up' || pdir === 'timeline';
  const f = across ? (x - n.x) / n.w : (y - n.y) / n.h;
  if (f < 0.27) return 'before';
  if (f > 0.73) return 'after';
  return 'child';
}

const RULER = 22;

// the grid's tones, as in MyCAD: the map's background with a little of its text colour mixed in
// (more for the block lines, more again for the axis; a little stronger on a dark background)
function gridTones(ms) {
  const fg = ms.dark ? '#ffffff' : '#000000';
  const mix = (p) => `color-mix(in srgb, ${fg} ${p}%, ${ms.bg})`;
  return { '--grid': mix(ms.dark ? 12 : 8), '--grid-major': mix(ms.dark ? 22 : 17), '--grid-axis': mix(30) };
}

// The grid behind the map (drawn as in MyCAD): thin cell lines, stronger block lines every 5th,
// and the axis through map 0 — from the same gridLines() as the rulers, so every ruler tick sits
// on a grid line.
function GridLayer({ v, size, from }) {
  const xs = gridLines(v.x, v.k, size.w, from);
  const ys = gridLines(v.y, v.k, size.h, from);
  const lines = (list, cls) => list.map((l) => (cls === 'x'
    ? <line key={`x${l.px}`} x1={l.px} x2={l.px} y1={0} y2={size.h} />
    : <line key={`y${l.px}`} y1={l.px} y2={l.px} x1={0} x2={size.w} />));
  return (
    <svg className="grid-layer" width={size.w} height={size.h} aria-hidden="true">
      <g className="grid-cells">{lines(xs.filter((l) => !l.major), 'x')}{lines(ys.filter((l) => !l.major), 'y')}</g>
      <g className="grid-blocks">{lines(xs.filter((l) => l.major && !l.axis), 'x')}{lines(ys.filter((l) => l.major && !l.axis), 'y')}</g>
      <g className="grid-axis">{lines(xs.filter((l) => l.axis), 'x')}{lines(ys.filter((l) => l.axis), 'y')}</g>
    </svg>
  );
}

// Rulers along the top and the left edge, in map units (0 is the central topic's centre), drawn as
// in MyCAD: ticks grow from the inner edge — a long, labelled one on every block line of the grid,
// a short one on every cell line — the left ruler's labels run upward, the corner names the unit,
// and an orange mark on each ruler follows the pointer.
function Rulers({ v, size, hostRef }) {
  const xs = gridLines(v.x, v.k, size.w, RULER);
  const ys = gridLines(v.y, v.k, size.h, RULER);
  const [cur, setCur] = useState(null);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const move = (e) => { const r = el.getBoundingClientRect(); setCur({ x: e.clientX - r.left, y: e.clientY - r.top }); };
    const leave = () => setCur(null);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [hostRef]);
  return (
    <>
      <svg className="ruler ruler-x" width={size.w} height={RULER} aria-hidden="true">
        {xs.map((tk) => (
          <g key={tk.px} className={tk.major ? 'major' : ''}>
            <line x1={tk.px} x2={tk.px} y1={RULER - (tk.major ? 12 : 5)} y2={RULER} />
            {tk.major && <text x={tk.px + 3} y={2}>{rulerLabel(tk.value)}</text>}
          </g>
        ))}
        {cur && cur.x > RULER && <line className="ruler-cursor" x1={cur.x} x2={cur.x} y1={0} y2={RULER} />}
      </svg>
      <svg className="ruler ruler-y" width={RULER} height={size.h} aria-hidden="true">
        {ys.map((tk) => (
          <g key={tk.px} className={tk.major ? 'major' : ''}>
            <line y1={tk.px} y2={tk.px} x1={RULER - (tk.major ? 12 : 5)} x2={RULER} />
            {tk.major && <text x={2} y={tk.px - 3} transform={`rotate(-90 2 ${tk.px - 3})`}>{rulerLabel(tk.value)}</text>}
          </g>
        ))}
        {cur && cur.y > RULER && <line className="ruler-cursor" y1={cur.y} y2={cur.y} x1={0} x2={RULER} />}
      </svg>
      <div className="ruler-corner" aria-hidden="true">px</div>
    </>
  );
}

export const MapCanvas = forwardRef(function MapCanvas(props, ref) {
  const {
    doc, map, L, ms, lang, settings, editing, draftText, linkFrom, readonly,
    onSelect, onSelectRel, onAction, onEditStart, onEditChange, onEditCommit, onEditCancel, onKey,
    onMove, onFloat, onNudge, onRelControl, onLink, onViewChange, onContextMenu, onBadge, onToggleFold, onCreateFloating,
    dimIds, hitIds, presentationIds,
  } = props;
  const host = useRef(null);
  const layer = useRef(null);
  const editor = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setViewState] = useState(() => doc.view || null);
  const viewRef = useRef(view);
  const drag = useRef(null);
  const [overlay, setOverlay] = useState(null);   // { ghost, drop, marquee, linkTo, relEdit }
  const lastDown = useRef({ t: 0, id: null, x: 0, y: 0 });
  const anim = useRef(0);
  const composing = useRef(false);

  const setView = useCallback((v, { save = true } = {}) => {
    viewRef.current = v;
    setViewState(v);
    if (save && onViewChange) onViewChange(v);
  }, [onViewChange]);

  // ── size ──
  // `measured`: the real size is known (the first view must not be fitted to the 800 × 600 placeholder)
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    const el = host.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    setMeasured(true);
    return () => ro.disconnect();
  }, []);

  // ── camera helpers ──
  // The camera that shows `bounds` in the middle of the visible canvas (the rulers' strips left out).
  // keepK: the zoom stays as it is and the map is only moved to the centre.
  const fitView = useCallback((bounds = L.bounds, { maxK = 1, pad = 40, keepK = false } = {}) => {
    const inset = settings.showRulers ? RULER : 0;
    const aw = size.w - inset, ah = size.h - inset;
    const w = Math.max(50, aw - pad * 2), h = Math.max(50, ah - pad * 2);
    const bw = Math.max(1, bounds.x1 - bounds.x0), bh = Math.max(1, bounds.y1 - bounds.y0);
    const cur = viewRef.current;
    const k = keepK && cur ? cur.k : clampK(Math.min(maxK, w / bw, h / bh));
    return { k, x: inset + aw / 2 - (bounds.x0 + bw / 2) * k, y: inset + ah / 2 - (bounds.y0 + bh / 2) * k };
  }, [L, size, settings.showRulers]);

  const animateTo = useCallback((target) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    if (!settings.animate || !from) { setView(target); return; }
    const t0 = performance.now();
    const dur = 240;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - p) ** 3;
      const v = { k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      setView(v);
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [setView, settings.animate]);

  // first show: the saved camera, or the whole map centred
  useEffect(() => {
    if (!measured) return;
    if (!viewRef.current) setView(fitView(L.bounds, { maxK: 1 }));
    else if (onViewChange) onViewChange(viewRef.current);
  }, [measured]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ensureVisible = useCallback((id, { center = false } = {}) => {
    const n = L.nodes.get(id);
    const v = viewRef.current;
    if (!n || !v) return;
    const margin = 40;
    const sx = v.x + n.x * v.k, sy = v.y + n.y * v.k, sw = n.w * v.k, sh = n.h * v.k;
    if (center) { animateTo({ ...v, x: size.w / 2 - (n.x + n.w / 2) * v.k, y: size.h / 2 - (n.y + n.h / 2) * v.k }); return; }
    let dx = 0, dy = 0;
    if (sx < margin) dx = margin - sx; else if (sx + sw > size.w - margin) dx = Math.max(margin - sx, size.w - margin - (sx + sw));
    if (sy < margin) dy = margin - sy; else if (sy + sh > size.h - margin) dy = Math.max(margin - sy, size.h - margin - (sy + sh));
    if (dx || dy) animateTo({ ...v, x: v.x + dx, y: v.y + dy });
  }, [L, size, animateTo]);

  const zoomAt = useCallback((factor, px = size.w / 2, py = size.h / 2, animate = false) => {
    const v = viewRef.current;
    if (!v) return;
    const k = clampK(v.k * factor);
    const target = { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    if (animate) animateTo(target); else setView(target);
  }, [size, setView, animateTo]);

  useImperativeHandle(ref, () => ({
    fit: () => animateTo(fitView(L.bounds, { maxK: 1.5 })),
    // the whole map in the middle of the canvas, at the zoom it has
    centerMap: () => animateTo(fitView(L.bounds, { keepK: true })),
    fitSelection: (ids) => {
      let b = null;
      for (const id of ids) { const n = L.nodes.get(id); if (!n) continue; const nb = { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h }; b = b ? { x0: Math.min(b.x0, nb.x0), y0: Math.min(b.y0, nb.y0), x1: Math.max(b.x1, nb.x1), y1: Math.max(b.y1, nb.y1) } : nb; }
      if (b) animateTo(fitView(b, { maxK: 2, pad: 80 }));
    },
    fitBounds: (b, maxK = 2) => animateTo(fitView(b, { maxK, pad: 60 })),
    zoomIn: () => zoomAt(1.2, undefined, undefined, true),
    zoomOut: () => zoomAt(1 / 1.2, undefined, undefined, true),
    zoomTo: (k) => { const v = viewRef.current; if (v) zoomAt(k / v.k, undefined, undefined, true); },
    centerOn: (id) => ensureVisible(id, { center: true }),
    ensureVisible: (id) => ensureVisible(id),
    getView: () => viewRef.current,
    setView: (v) => setView(v),
    size: () => size,
    focus: () => { if (editor.current) editor.current.focus({ preventScroll: true }); },
    screenToWorld: (cx, cy) => { const r = host.current.getBoundingClientRect(); const v = viewRef.current; return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }; },
  }), [L, fitView, animateTo, zoomAt, ensureVisible, setView, size]);

  // ── the map markup ──
  const markup = useMemo(() => renderMapBody(map, L, ms, { dim: dimIds, hit: hitIds, measure: measureText }), [map, L, ms, dimIds, hitIds]);
  useLayoutEffect(() => { if (layer.current) layer.current.innerHTML = markup; }, [markup]);

  // ── wheel ──
  useEffect(() => {
    const el = host.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      if (!v) return;
      if (e.ctrlKey || e.metaKey || settings.wheelZoom) {
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
        zoomAt(f, e.clientX - r.left, e.clientY - r.top);
      } else {
        const unit = e.deltaMode === 1 ? 30 : 1;
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit, dy = (e.shiftKey ? 0 : e.deltaY) * unit;
        setView({ ...v, x: v.x - dx, y: v.y - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, setView, settings.wheelZoom]);

  // ── pointer ──
  const toWorld = (e) => {
    const r = host.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k, sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const focusEditor = () => { const el = editor.current; if (el && document.activeElement !== el) el.focus({ preventScroll: true }); };

  const onPointerDown = (e) => {
    if (!viewRef.current) return;
    if (e.button === 2) return;
    // no mouse-down default: it would take the focus from the key catcher / topic editor (and select text)
    e.preventDefault();
    const p = toWorld(e);
    let target = e.target.closest ? e.target.closest('[data-handle],[data-fold],[data-badge],[data-id],[data-rel]') : null;
    // a relationship drawn across a topic: the topic under the pointer wins (the line is picked where no topic is)
    if (target && target.dataset.rel && !target.dataset.handle) {
      const under = nodeAt(L, p.x, p.y);
      if (under) target = { dataset: { id: under.id } };
    }
    if (editing && !(target && target.dataset.id === editing.id && !target.dataset.badge && !target.dataset.fold)) {
      // a click elsewhere finishes the edit first
      onEditCommit();
    }
    if (e.button === 1) {
      e.preventDefault();
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, v: viewRef.current };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    focusEditor();
    if (target && target.dataset.handle) {
      drag.current = { mode: 'handle', which: target.dataset.handle, rel: target.dataset.relid, start: p };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (target && target.dataset.fold) { onToggleFold(target.dataset.fold); return; }
    if (target && target.dataset.badge) { onBadge(target.dataset.id, target.dataset.badge, e); return; }
    if (target && target.dataset.id) {
      const id = target.dataset.id;
      if (linkFrom) { onLink(id); return; }
      const now = Date.now();
      const ld = lastDown.current;
      const dbl = ld.id === id && now - ld.t < DBL_MS && Math.hypot(ld.x - e.clientX, ld.y - e.clientY) < 6;
      lastDown.current = { t: dbl ? 0 : now, id, x: e.clientX, y: e.clientY };
      if (dbl) { onSelect([id]); if (!readonly) onEditStart(id, 'all'); return; }
      const sel = doc.sel || [];
      if (e.ctrlKey || e.metaKey) onSelect(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id], id);
      else if (e.shiftKey) onSelect(sel.includes(id) ? sel : [...sel, id], id);
      else if (!sel.includes(id) || sel.length > 1) onSelect([id], id);
      drag.current = { mode: 'pendingTopic', id, sx: e.clientX, sy: e.clientY, p, keepSel: sel.includes(id) && sel.length > 1 && !e.ctrlKey && !e.shiftKey };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (target && target.dataset.rel) {
      onSelectRel(target.dataset.rel);
      return;
    }
    // a summary label: select its topic; double-click renames it
    const sum = e.target.closest ? e.target.closest('[data-summary]') : null;
    if (sum) {
      const sid = sum.dataset.summary;
      const now = Date.now();
      const ld = lastDown.current;
      const dbl = ld.id === `sum:${sid}` && now - ld.t < DBL_MS;
      lastDown.current = { t: dbl ? 0 : now, id: `sum:${sid}`, x: e.clientX, y: e.clientY };
      onSelect([sid], sid);
      if (dbl && !readonly) onAction('summaryLabel', sid);
      return;
    }
    // empty canvas
    if (linkFrom) { onLink(null); return; }
    const now = Date.now();
    const ld = lastDown.current;
    const dbl = ld.id === '#bg' && now - ld.t < DBL_MS && Math.hypot(ld.x - e.clientX, ld.y - e.clientY) < 6;
    lastDown.current = { t: dbl ? 0 : now, id: '#bg', x: e.clientX, y: e.clientY };
    if (dbl) { if (!readonly) onCreateFloating(p.x, p.y); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      drag.current = { mode: 'marquee', p0: p, add: [...(doc.sel || [])] };
      setOverlay({ marquee: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } });
    } else {
      drag.current = { mode: 'pendingPan', sx: e.clientX, sy: e.clientY, v: viewRef.current };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) {
      if (linkFrom) { const p = toWorld(e); setOverlay({ linkTo: p }); }
      return;
    }
    const p = toWorld(e);
    if (d.mode === 'pendingPan') {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) { d.mode = 'pan'; host.current.classList.add('panning'); }
    }
    if (d.mode === 'pan') {
      setView({ ...d.v, x: d.v.x + (e.clientX - d.sx), y: d.v.y + (e.clientY - d.sy) });
      return;
    }
    if (d.mode === 'marquee') {
      const m = { x0: Math.min(d.p0.x, p.x), y0: Math.min(d.p0.y, p.y), x1: Math.max(d.p0.x, p.x), y1: Math.max(d.p0.y, p.y) };
      setOverlay({ marquee: m });
      const ids = [...L.nodes.values()].filter((n) => n.x < m.x1 && n.x + n.w > m.x0 && n.y < m.y1 && n.y + n.h > m.y0).map((n) => n.id);
      onSelect([...new Set([...d.add, ...ids])]);
      return;
    }
    if (d.mode === 'handle') {
      setOverlay({ relEdit: { rel: d.rel, which: d.which, p } });
      return;
    }
    if (d.mode === 'pendingTopic') {
      if (readonly || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_START) return;
      const n = L.nodes.get(d.id);
      if (!n || n.kind === 'root') { d.mode = 'pan'; d.v = viewRef.current; d.sx = e.clientX; d.sy = e.clientY; host.current.classList.add('panning'); return; }
      const sel = doc.sel && doc.sel.includes(d.id) ? doc.sel : [d.id];
      const ids = sel.filter((id) => id !== map.root.id && L.nodes.has(id));
      d.mode = 'topic';
      d.ids = ids;
      d.off = { x: p.x - n.x, y: p.y - n.y };
      d.node = n;
      host.current.classList.add('dragging-topic');
    }
    if (d.mode === 'topic') {
      const n = d.node;
      const exclude = (o) => d.ids.some((id) => isWithin(map, o.id, id));
      const over = nodeAt(L, p.x, p.y, exclude);
      let drop = null;
      if (over) drop = { id: over.id, zone: dropZone(over, p.x, p.y) };
      else drop = { zone: 'floating' };
      setOverlay({ ghost: { x: p.x - d.off.x, y: p.y - d.off.y, w: n.w, h: n.h, n: d.ids.length }, drop });
      d.drop = drop;
      d.p = p;
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    host.current.classList.remove('panning', 'dragging-topic');
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!d) return;
    if (d.mode === 'pan') { if (onViewChange) onViewChange(viewRef.current); return; }
    if (d.mode === 'pendingPan') {
      // a plain click on the canvas: nothing selected but the central topic
      if (!e.shiftKey && !e.ctrlKey) onSelect([]);
      return;
    }
    if (d.mode === 'pendingTopic') {
      if (d.keepSel) onSelect([d.id], d.id);
      return;
    }
    if (d.mode === 'marquee') { setOverlay(null); return; }
    if (d.mode === 'handle') {
      const p = toWorld(e);
      setOverlay(null);
      onRelControl(d.rel, d.which, p);
      return;
    }
    if (d.mode === 'topic') {
      setOverlay(null);
      const drop = d.drop;
      if (!drop) return;
      if (drop.zone === 'floating') {
        const n = d.node;
        // a connected topic keeps its parent and only moves (its lines follow);
        // Alt + drop tears it off as a floating topic, a floating one just moves
        if (n.kind === 'floating' || e.altKey) onFloat(d.ids, { x: d.p.x - d.off.x + n.w / 2, y: d.p.y - d.off.y + n.h / 2 });
        else onNudge(d.ids, d.p.x - d.off.x - n.x, d.p.y - d.off.y - n.y);
        return;
      }
      onMove(d.ids, drop.id, drop.zone);
    }
  };

  const onContext = (e) => {
    e.preventDefault();
    let target = e.target.closest ? e.target.closest('[data-id],[data-rel]') : null;
    const p = toWorld(e);
    if (target && target.dataset.rel) { const under = nodeAt(L, p.x, p.y); if (under) target = { dataset: { id: under.id } }; }
    if (target && target.dataset.id) {
      const id = target.dataset.id;
      if (!(doc.sel || []).includes(id)) onSelect([id], id);
      onContextMenu({ kind: 'topic', id, x: e.clientX, y: e.clientY });
    } else if (target && target.dataset.rel) {
      onSelectRel(target.dataset.rel);
      onContextMenu({ kind: 'rel', id: target.dataset.rel, x: e.clientX, y: e.clientY });
    } else onContextMenu({ kind: 'canvas', x: e.clientX, y: e.clientY, world: p });
  };

  // ── the editor textarea ──
  const primary = doc.sel && doc.sel.length ? doc.sel[doc.sel.length - 1] : null;
  const edNode = editing ? L.nodes.get(editing.id) : (primary ? L.nodes.get(primary) : null);
  const v = view || { x: size.w / 2, y: size.h / 2, k: 1 };

  useLayoutEffect(() => {
    const el = editor.current;
    if (!el) return;
    if (editing) {
      if (el.value !== draftText) el.value = draftText ?? '';
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
    } else if (!composing.current && el.value) el.value = '';
  });

  // a new edit: where the caret goes
  const editSeq = editing ? editing.seq : 0;
  useEffect(() => {
    const el = editor.current;
    if (!el || !editing) return;
    if (editing.mode === 'all') el.select();
    else if (editing.mode === 'end') { const n = el.value.length; el.setSelectionRange(n, n); }
  }, [editSeq]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onEditorKeyDown = (e) => {
    lastDown.current = { t: 0, id: null, x: 0, y: 0 };   // typing in between: the next click is not a double-click
    if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); onEditCancel(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); onEditCommit(e.ctrlKey || e.metaKey ? null : 'enter'); return; }
      if (e.key === 'Tab') { e.preventDefault(); onEditCommit(e.shiftKey ? 'shiftTab' : 'tab'); return; }
      if (e.key === 'Insert') { e.preventDefault(); onEditCommit('tab'); return; }
      e.stopPropagation();   // typing stays in the editor (no map shortcuts)
      return;
    }
    onKey(e);
  };

  const onEditorInput = (e) => {
    const value = e.target.value;
    if (!editing) {
      if (readonly || !primary || composing.current) return;
      onEditStart(primary, 'replace', value);
      return;
    }
    onEditChange(value);
  };

  const onCompositionStart = () => {
    composing.current = true;
    lastDown.current = { t: 0, id: null, x: 0, y: 0 };
    if (!editing && primary && !readonly) onEditStart(primary, 'replace', editor.current ? editor.current.value : '');
  };
  const onCompositionEnd = (e) => {
    composing.current = false;
    if (editing) onEditChange(e.target.value);
  };

  // paste / copy / cut while not editing go to the map
  const onClipboard = (e) => {
    if (editing) return;
    e.preventDefault();
    onAction(`clip:${e.type}`, e.clipboardData);
  };

  const edStyle = (() => {
    if (!edNode) return { left: -9999, top: 0 };
    const m = edNode.m, st = edNode.st;
    if (!editing) return { left: v.x + (edNode.x + m.textX) * v.k, top: v.y + (edNode.y + m.textY) * v.k, width: 4, height: 4 };
    const fs = m.fontSize * v.k;
    const minW = Math.max(m.textW, 60) * v.k + 8;
    const w = Math.max(minW, edNode.w * v.k);
    const cx = v.x + (edNode.x + edNode.w / 2) * v.k;
    const left = m.align === 'left' ? v.x + (edNode.x + m.textX) * v.k - 4 : m.align === 'right' ? v.x + (edNode.x + m.textX + m.textW) * v.k - w + 4 : cx - w / 2;
    const bg = st.fill && st.fill !== 'none' ? st.fill : ms.bg;
    return {
      left, top: v.y + (edNode.y + m.textY) * v.k - 3, width: w,
      font: `${st.italic ? 'italic ' : ''}${st.bold ? 700 : 400} ${fs}px/${(m.lineH * v.k).toFixed(2)}px ${fontFamily(st)}`,
      color: st.color, background: bg, textAlign: m.align === 'left' ? 'left' : m.align === 'right' ? 'right' : 'center',
    };
  })();

  // ── overlay pieces ──
  const selected = (doc.sel || []).map((id) => L.nodes.get(id)).filter(Boolean);
  const selRel = doc.selRel ? (map.relationships || []).find((r) => r.id === doc.selRel) : null;
  let relHandles = null;
  if (selRel && L.nodes.get(selRel.from) && L.nodes.get(selRel.to)) {
    // a relationship with the layout's automatic bend: its handles start from that bend
    let rel = !selRel.c1 && !selRel.c2 && L.relBends && L.relBends.get(selRel.id) ? { ...selRel, ...L.relBends.get(selRel.id) } : selRel;
    if (overlay && overlay.relEdit && overlay.relEdit.rel === selRel.id) {
      const a = L.nodes.get(rel.from), b = L.nodes.get(rel.to);
      const p = overlay.relEdit.p;
      if (overlay.relEdit.which === 'c1') rel = { ...rel, c1: { x: p.x - (a.x + a.w / 2), y: p.y - (a.y + a.h / 2) } };
      else rel = { ...rel, c2: { x: p.x - (b.x + b.w / 2), y: p.y - (b.y + b.h / 2) } };
    }
    const g = relationshipGeometry(rel, L.nodes.get(rel.from), L.nodes.get(rel.to), L.relBends);
    relHandles = { g, rel };
  }
  const hideText = editing ? `.tm-layer [data-id="${CSS.escape(editing.id)}"] .tm-text{opacity:0}` : '';
  const showFold = (doc.sel || []).map((id) => `.tm-layer [data-id="${CSS.escape(id)}"] .tm-fold.open{opacity:1}`).join('');
  const presentCss = presentationIds ? `.tm-layer .tm-topic,.tm-layer .tm-line,.tm-layer .tm-rel,.tm-layer .tm-boundary{opacity:.1}${[...presentationIds].map((id) => `.tm-layer [data-id="${CSS.escape(id)}"],.tm-layer [data-line="${CSS.escape(id)}"],.tm-layer [data-boundary="${CSS.escape(id)}"]`).join(',')}{opacity:1}` : '';
  const k = v.k;
  const dropNode = overlay && overlay.drop && overlay.drop.id ? L.nodes.get(overlay.drop.id) : null;
  const linkSource = linkFrom ? L.nodes.get(linkFrom) : null;

  return (
    <div className={`map-canvas ${settings.showGrid ? 'grid' : ''} ${settings.showRulers ? 'rulers' : ''} ${linkFrom ? 'linking' : ''}`} ref={host}
      style={{ backgroundColor: ms.bg, ...gridTones(ms) }}
      onContextMenu={onContext}>
      {settings.showGrid && <GridLayer v={v} size={size} from={0} />}
      <svg className="map-svg" width={size.w} height={size.h} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        style={{ '--sel': ms.dark ? '#7cc4ff' : '#1a73e8' }}>
        <style>{`${hideText}${showFold}${presentCss}`}</style>
        <g transform={`translate(${v.x} ${v.y}) scale(${k})`}>
          <g className="tm-layer" ref={layer} />
          <g className="tm-overlay">
            {selected.map((n) => (
              <rect key={n.id} className={`tm-sel ${n.id === primary ? 'primary' : ''}`} x={n.x - 4} y={n.y - 4} width={n.w + 8} height={n.h + 8} rx={8} style={{ strokeWidth: 2 / k }} />
            ))}
            {relHandles && (
              <g className="tm-relsel">
                <path d={relHandles.g.d} className="tm-relsel-path" style={{ strokeWidth: 6 / k }} />
                <path d={`M${relHandles.g.p0.x} ${relHandles.g.p0.y} L${relHandles.g.c1.x} ${relHandles.g.c1.y} M${relHandles.g.p3.x} ${relHandles.g.p3.y} L${relHandles.g.c2.x} ${relHandles.g.c2.y}`} className="tm-relsel-arm" style={{ strokeWidth: 1 / k }} />
                <circle data-handle="c1" data-relid={relHandles.rel.id} cx={relHandles.g.c1.x} cy={relHandles.g.c1.y} r={7 / k} className="tm-handle" style={{ strokeWidth: 2 / k }} />
                <circle data-handle="c2" data-relid={relHandles.rel.id} cx={relHandles.g.c2.x} cy={relHandles.g.c2.y} r={7 / k} className="tm-handle" style={{ strokeWidth: 2 / k }} />
              </g>
            )}
            {dropNode && (
              overlay.drop.zone === 'child'
                ? <rect className="tm-drop" x={dropNode.x - 5} y={dropNode.y - 5} width={dropNode.w + 10} height={dropNode.h + 10} rx={9} style={{ strokeWidth: 3 / k }} />
                : (() => {
                  const pdir = dropNode.parent ? dropNode.parent.dir : 'right';
                  const across = pdir === 'down' || pdir === 'up' || pdir === 'timeline';
                  const before = overlay.drop.zone === 'before';
                  return across
                    ? <line className="tm-drop-line" x1={before ? dropNode.x - 6 : dropNode.x + dropNode.w + 6} x2={before ? dropNode.x - 6 : dropNode.x + dropNode.w + 6} y1={dropNode.y - 4} y2={dropNode.y + dropNode.h + 4} style={{ strokeWidth: 4 / k }} />
                    : <line className="tm-drop-line" x1={dropNode.x - 4} x2={dropNode.x + dropNode.w + 4} y1={before ? dropNode.y - 6 : dropNode.y + dropNode.h + 6} y2={before ? dropNode.y - 6 : dropNode.y + dropNode.h + 6} style={{ strokeWidth: 4 / k }} />;
                })()
            )}
            {overlay && overlay.ghost && (
              <g className={`tm-ghost ${overlay.drop && overlay.drop.zone === 'floating' ? 'floating' : ''}`}>
                <rect x={overlay.ghost.x} y={overlay.ghost.y} width={overlay.ghost.w} height={overlay.ghost.h} rx={6} style={{ strokeWidth: 2 / k }} />
                {overlay.ghost.n > 1 && <text x={overlay.ghost.x + overlay.ghost.w + 6 / k} y={overlay.ghost.y} style={{ fontSize: 12 / k }}>{`×${overlay.ghost.n}`}</text>}
              </g>
            )}
            {overlay && overlay.marquee && (
              <rect className="tm-marquee" x={overlay.marquee.x0} y={overlay.marquee.y0} width={overlay.marquee.x1 - overlay.marquee.x0} height={overlay.marquee.y1 - overlay.marquee.y0} style={{ strokeWidth: 1 / k }} />
            )}
            {linkSource && overlay && overlay.linkTo && (
              <path className="tm-linking" d={`M${linkSource.x + linkSource.w / 2} ${linkSource.y + linkSource.h / 2} L${overlay.linkTo.x} ${overlay.linkTo.y}`} style={{ strokeWidth: 2 / k }} />
            )}
          </g>
        </g>
      </svg>
      <textarea ref={editor} className={`tm-editor ${editing ? 'editing' : 'sink'}`} style={edStyle} spellCheck={!!(editing && settings.spellCheck)}
        aria-label={t('topic_text')} rows={1} wrap="soft"
        onKeyDown={onEditorKeyDown} onInput={onEditorInput} onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd}
        onCopy={onClipboard} onCut={onClipboard} onPaste={onClipboard}
        onBlur={() => { if (editing && !composing.current) setTimeout(() => { if (document.activeElement !== editor.current) onEditCommit(); }, 0); }} />
      {settings.showRulers && <Rulers v={v} size={size} hostRef={host} />}
      {linkFrom && <div className="map-hint">{t('link_hint')}</div>}
      {doc.focusId && findTopic(map, doc.focusId) && <button type="button" className="map-hint focus" onClick={() => onAction('focusOff')}>{t('focus_hint')}</button>}
    </div>
  );
});

export default MapCanvas;
