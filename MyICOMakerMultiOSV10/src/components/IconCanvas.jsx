// The design canvas: draws the objects, creates them with the drawing tools and moves, resizes
// and rotates the selected one. All coordinates are in the 512 × 512 design space.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOX_TYPES, CANVAS, backgroundSvg, gridSteps, bbox, createObject, moveObject, normalizeBox, objToSvg, objectDefs, resizeObject, snap, transformOf,
} from '../lib/iconCanvas.js';
import { t } from '../i18n.js';

const HANDLES = [
  ['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'],
  ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize'],
];
const CREATE_BY_DRAG = ['rect', 'roundRect', 'ellipse', 'line', 'arrowLine'];
const FREEHAND = ['pen', 'brush'];

const rotatePoint = ([x, y], deg, [cx, cy]) => {
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
};

export default function IconCanvas({
  design, selectedId, onSelect, tool, setTool, zoom, setZoom, pan, setPan, view, style,
  apply, record, onContextMenu, onDropFiles, onPickColor, onCursor,
}) {
  const svgRef = useRef(null);
  const drag = useRef(null);
  const [draft, setDraft] = useState(null); // polygon being drawn: { id }
  const objects = design.objects;

  const toDesign = useCallback((e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS, ((e.clientY - r.top) / r.height) * CANVAS];
  }, []);
  const grid = gridSteps(zoom);
  const step = view.snap ? grid.minor : 0;
  const snapped = (p) => [snap(p[0], step), snap(p[1], step)];

  const patch = useCallback((id, fn) => apply((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? fn(o) : o)) }), { record: false }), [apply]);

  const finishPoly = useCallback(() => {
    if (!draft) return;
    const id = draft.id;
    setDraft(null);
    apply((d) => {
      const o = d.objects.find((x) => x.id === id);
      if (!o) return d;
      // The last point follows the pointer; a polygon needs three real points, a line two.
      const points = o.points.slice(0, -1);
      if (points.length < 2) return { ...d, objects: d.objects.filter((x) => x.id !== id) };
      return { ...d, objects: d.objects.map((x) => (x.id === id ? { ...x, points, closed: points.length > 2 } : x)) };
    }, { record: false });
    onSelect(id);
    setTool('select');
  }, [draft, apply, onSelect, setTool]);

  useEffect(() => {
    if (tool !== 'poly' && draft) finishPoly();
  }, [tool, draft, finishPoly]);

  useEffect(() => {
    const key = (e) => {
      if (!draft) return;
      if (e.key === 'Enter') { e.preventDefault(); finishPoly(); }
      if (e.key === 'Escape') { e.preventDefault(); apply((d) => ({ ...d, objects: d.objects.filter((x) => x.id !== draft.id) }), { record: false }); setDraft(null); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [draft, finishPoly, apply]);

  const moveImpl = (e) => {
    const d = drag.current;
    if (!d) return;
    const raw = toDesign(e);
    const [x, y] = d.free ? raw : snapped(raw);
    if (d.mode === 'pan') {
      setPan({ x: d.pan.x + e.clientX - d.cx, y: d.pan.y + e.clientY - d.cy });
    } else if (d.mode === 'create') {
      if (d.otype === 'line') {
        let [x2, y2] = [x, y];
        if (e.shiftKey) { // 45° steps
          const a = Math.round(Math.atan2(y - d.sy, x - d.sx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(x - d.sx, y - d.sy);
          x2 = d.sx + len * Math.cos(a); y2 = d.sy + len * Math.sin(a);
        }
        patch(d.id, (o) => ({ ...o, x2, y2 }));
      } else {
        let w = x - d.sx;
        let h = y - d.sy;
        if (e.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
        patch(d.id, (o) => ({ ...o, w, h }));
      }
    } else if (d.mode === 'draw') {
      patch(d.id, (o) => ({ ...o, points: [...o.points, raw] }));
    } else if (d.mode === 'move') {
      let dx = x - d.sx;
      let dy = y - d.sy;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      patch(d.id, () => moveObject(d.orig, dx, dy));
    } else if (d.mode === 'resize') {
      const o = d.orig;
      const b = d.box;
      const c = [b.x + b.w / 2, b.y + b.h / 2];
      const [lx, ly] = o.rotate ? rotatePoint([x, y], -o.rotate, c) : [x, y];
      let x0 = b.x; let y0 = b.y; let x1 = b.x + b.w; let y1 = b.y + b.h;
      if (d.handle.includes('w')) x0 = Math.min(lx, x1 - 2);
      if (d.handle.includes('e')) x1 = Math.max(lx, x0 + 2);
      if (d.handle.includes('n')) y0 = Math.min(ly, y1 - 2);
      if (d.handle.includes('s')) y1 = Math.max(ly, y0 + 2);
      if (e.shiftKey && b.w > 0 && b.h > 0 && d.handle.length === 2) { // keep the proportions
        const ratio = b.w / b.h;
        const w = x1 - x0;
        const h = y1 - y0;
        if (w / h > ratio) { const nw = h * ratio; if (d.handle.includes('w')) x0 = x1 - nw; else x1 = x0 + nw; } else { const nh = w / ratio; if (d.handle.includes('n')) y0 = y1 - nh; else y1 = y0 + nh; }
      }
      patch(d.id, () => resizeObject(o, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
    } else if (d.mode === 'rotate') {
      const b = d.box;
      const c = [b.x + b.w / 2, b.y + b.h / 2];
      let deg = (Math.atan2(raw[1] - c[1], raw[0] - c[0]) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = Math.round(((deg % 360) + 360) % 360);
      patch(d.id, (o) => ({ ...o, rotate: deg }));
    } else if (d.mode === 'p1') {
      patch(d.id, (o) => ({ ...o, x1: x, y1: y }));
    } else if (d.mode === 'p2') {
      patch(d.id, (o) => ({ ...o, x2: x, y2: y }));
    } else if (d.mode === 'erase') {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-obj]');
      const id = hit?.getAttribute('data-obj');
      if (id && !d.erased.has(id)) {
        d.erased.add(id);
        apply((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== id || o.locked) }), { record: false });
      }
    }
  };

  const upImpl = (e) => {
    // The release point counts as the last move: when the page is busy, pointer moves are
    // coalesced and the last one handled can be well behind where the button was let go.
    if (drag.current && e && Number.isFinite(e.clientX) && drag.current.mode !== 'erase') moveImpl(e);
    const d = drag.current;
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (!d) return;
    if (d.mode === 'create') {
      apply((s) => ({
        ...s,
        objects: s.objects.map((o) => {
          if (o.id !== d.id) return o;
          if (o.type === 'line') return Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 4 ? { ...o, x2: o.x1 + 160, y2: o.y1 } : o;
          const small = Math.abs(o.w) < 6 && Math.abs(o.h) < 6;
          return normalizeBox(small ? { ...o, x: o.x - 80, y: o.y - 80, w: 160, h: 160 } : o);
        }),
      }), { record: false });
      setTool('select');
    }
  };
  // The window listeners are stable; they call the handlers of the latest render.
  const handlers = useRef({});
  handlers.current = { move: moveImpl, up: upImpl };
  const onMove = useCallback((e) => handlers.current.move(e), []);
  const onUp = useCallback((e) => handlers.current.up(e), []);
  useEffect(() => () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove, onUp]);

  const begin = (meta) => {
    drag.current = meta;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const addObject = (o) => {
    record();
    apply((d) => ({ ...d, objects: [...d.objects, o] }), { record: false });
    onSelect(o.id);
  };

  const onPointerDown = (e) => {
    if (e.button === 1 || (e.button === 0 && (tool === 'hand' || e.altKey))) {
      e.preventDefault();
      begin({ mode: 'pan', cx: e.clientX, cy: e.clientY, pan });
      return;
    }
    if (e.button !== 0) return;
    const raw = toDesign(e);
    const [x, y] = snapped(raw);
    if (tool === 'select' || tool === 'eyedropper' || tool === 'bucket') { onSelect(null); return; }
    if (tool === 'eraser') { record(); begin({ mode: 'erase', erased: new Set() }); return; }
    if (tool === 'text') {
      const o = createObject('text', x, y - 58, style);
      addObject(o);
      setTool('select');
      return;
    }
    if (tool === 'poly') {
      if (draft) {
        patch(draft.id, (o) => ({ ...o, points: [...o.points.slice(0, -1), [x, y], [x, y]] }));
      } else {
        const o = createObject('poly', x, y, style);
        o.points = [[x, y], [x, y]];
        addObject(o);
        setDraft({ id: o.id });
      }
      return;
    }
    const kind = tool;
    const o = createObject(kind, x, y, style);
    addObject(o);
    begin({ mode: FREEHAND.includes(kind) ? 'draw' : 'create', id: o.id, otype: o.type, sx: x, sy: y, free: FREEHAND.includes(kind) });
  };

  const onPointerMove = (e) => {
    const p = toDesign(e);
    onCursor?.(p);
    if (draft && !drag.current) {
      const [x, y] = snapped(p);
      patch(draft.id, (o) => ({ ...o, points: [...o.points.slice(0, -1), [x, y]] }));
    }
  };

  const onObjectDown = (e, o) => {
    if (e.button !== 0) return;
    if (tool === 'hand' || e.altKey) return; // panning starts on the canvas
    if (tool === 'eyedropper') { e.stopPropagation(); onPickColor?.(o); return; }
    if (tool === 'bucket') {
      e.stopPropagation();
      if (o.locked) return;
      record();
      patch(o.id, (x) => (x.type === 'line' || (x.type === 'pen') ? { ...x, stroke: style.fill, hasStroke: true } : { ...x, fill: style.fill, fill2: style.fill2, hasFill: true }));
      onSelect(o.id);
      return;
    }
    if (tool === 'eraser') {
      e.stopPropagation();
      if (o.locked) return;
      record();
      apply((d) => ({ ...d, objects: d.objects.filter((x) => x.id !== o.id) }), { record: false });
      begin({ mode: 'erase', erased: new Set([o.id]) });
      return;
    }
    if (tool !== 'select' || o.locked) return;
    e.stopPropagation();
    onSelect(o.id);
    record();
    const [sx, sy] = snapped(toDesign(e));
    begin({ mode: 'move', id: o.id, sx, sy, orig: o });
  };

  const startHandle = (e, o, mode, handle = '') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    record();
    const [sx, sy] = toDesign(e);
    begin({ mode, handle, id: o.id, sx, sy, orig: o, box: bbox(o), free: mode === 'rotate' });
  };

  const onWheel = (e) => {
    if (e.ctrlKey || !e.shiftKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom((z) => Math.min(8, Math.max(0.2, z * factor)));
    }
  };

  const handleContext = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (id) onSelect(id);
    onContextMenu?.(e, id ?? null);
  };


  const px = CANVAS * zoom;
  const hs = 9 / zoom; // handle size: constant on screen
  const sw = 1.4 / zoom;
  const sel = objects.find((o) => o.id === selectedId && !o.hidden);
  const sb = sel ? bbox(sel) : null;
  const defs = objects.filter((o) => !o.hidden).map(objectDefs).join('');
  const cursorFor = { select: 'default', hand: 'grab', eyedropper: 'copy', bucket: 'cell', eraser: 'not-allowed', text: 'text' }[tool] ?? 'crosshair';
  const selTransform = sel ? transformOf({ ...sel, flipX: false, flipY: false }) : '';

  return (
    <div className="canvas-wrap" onWheel={onWheel}
      onContextMenu={(e) => handleContext(e, null)} onPointerDown={(e) => { if (e.target === e.currentTarget) onPointerDown(e); }}
      onDoubleClick={() => { if (draft) finishPoly(); }} onPointerMove={onPointerMove} onPointerLeave={() => onCursor?.(null)} data-testid="canvas">
      <div className="canvas-stage" style={{ width: px, height: px, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
        <div className="canvas-checker" />
        <svg ref={svgRef} className={`icon-canvas tool-${tool}`} width={px} height={px} viewBox={`0 0 ${CANVAS} ${CANVAS}`}
          style={{ cursor: cursorFor }} onPointerDown={onPointerDown} aria-label={t('canvas.label')}>
          <defs dangerouslySetInnerHTML={{ __html: defs }} />
          <g dangerouslySetInnerHTML={{ __html: backgroundSvg(design) }} pointerEvents="none" />
          <g opacity={(design.exportOpacity ?? 100) / 100}>
            {objects.map((o) => (
              <g key={o.id} data-obj={o.id} className={o.locked ? 'locked' : ''}
                style={{ cursor: tool === 'select' && !o.locked ? 'move' : undefined }}
                onPointerDown={(e) => onObjectDown(e, o)}
                onContextMenu={(e) => handleContext(e, o.locked ? null : o.id)}
                dangerouslySetInnerHTML={{ __html: objToSvg(o) }} />
            ))}
          </g>
          {view.grid && (
            <g pointerEvents="none" className="grid-lines" data-major={grid.major} data-minor={grid.minor}>
              {Array.from({ length: Math.round(CANVAS / grid.minor) - 1 }, (_, i) => (i + 1) * grid.minor).map((v) => {
                const major = Math.abs(v / grid.major - Math.round(v / grid.major)) < 1e-6;
                const cls = major ? 'major' : 'minor';
                const w = (major ? 1 : 0.6) / zoom;
                return (
                  <g key={v} className={cls}>
                    <line x1={v} y1={0} x2={v} y2={CANVAS} strokeWidth={w} />
                    <line x1={0} y1={v} x2={CANVAS} y2={v} strokeWidth={w} />
                  </g>
                );
              })}
            </g>
          )}
          {view.guides && (
            <g pointerEvents="none" className="guide-lines" strokeWidth={sw * 1.2} strokeDasharray={`${6 / zoom} ${5 / zoom}`} fill="none">
              <rect x={CANVAS * 0.0625} y={CANVAS * 0.0625} width={CANVAS * 0.875} height={CANVAS * 0.875} rx={CANVAS * 0.18} />
              <circle cx={CANVAS / 2} cy={CANVAS / 2} r={CANVAS * 0.42} />
            </g>
          )}
          {sel && sb && (
            <g transform={selTransform || undefined} className="selection">
              <rect x={sb.x} y={sb.y} width={sb.w} height={sb.h} fill="none" stroke="#3b82f6" strokeWidth={sw} strokeDasharray={`${5 / zoom} ${3 / zoom}`} pointerEvents="none" />
              {sel.type === 'line' ? (
                <>
                  <circle cx={sel.x1} cy={sel.y1} r={hs * 0.7} className="handle" strokeWidth={sw} style={{ cursor: 'move' }} onPointerDown={(e) => startHandle(e, sel, 'p1')} />
                  <circle cx={sel.x2} cy={sel.y2} r={hs * 0.7} className="handle" strokeWidth={sw} style={{ cursor: 'move' }} onPointerDown={(e) => startHandle(e, sel, 'p2')} />
                </>
              ) : !sel.locked && (
                <>
                  <line x1={sb.x + sb.w / 2} y1={sb.y} x2={sb.x + sb.w / 2} y2={sb.y - 26 / zoom} stroke="#3b82f6" strokeWidth={sw} pointerEvents="none" />
                  <circle cx={sb.x + sb.w / 2} cy={sb.y - 26 / zoom} r={hs * 0.65} className="handle rotate-handle" strokeWidth={sw} style={{ cursor: 'grab' }}
                    onPointerDown={(e) => startHandle(e, sel, 'rotate')}><title>{t('canvas.rotate')}</title></circle>
                  {(BOX_TYPES.includes(sel.type) || sel.type === 'pen' || sel.type === 'poly') && HANDLES.map(([h, fx, fy, cursor]) => (
                    <rect key={h} className="handle" x={sb.x + sb.w * fx - hs / 2} y={sb.y + sb.h * fy - hs / 2} width={hs} height={hs} strokeWidth={sw}
                      style={{ cursor }} onPointerDown={(e) => startHandle(e, sel, 'resize', h)} />
                  ))}
                </>
              )}
            </g>
          )}
        </svg>
      </div>
      <div className="canvas-zoom-badge">{Math.round(zoom * 100)}%</div>
      {draft && <div className="canvas-hint">{t('canvas.polyHint')}</div>}
    </div>
  );
}
