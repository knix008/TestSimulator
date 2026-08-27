import React, { useCallback, useEffect, useRef } from 'react';
import { CANVAS, createObject, objToSvg, filterDef, bbox, normalizeBox, bgRect } from '../lib/iconCanvas.js';

export default function IconCanvas({
  objects, setObjects, selectedId, setSelectedId,
  tool, setTool, background, bgPad, zoom, setZoom,
  onContextMenu, onImageDrop,
}) {
  const svgRef = useRef(null);
  const drag = useRef(null);

  const pt = useCallback((e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * CANVAS,
      ((e.clientY - r.top) / r.height) * CANVAS,
    ];
  }, []);

  const patch = useCallback((id, p) =>
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o))), [setObjects]);

  // Stable window listeners (avoid stale-closure over `objects`).
  const onMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = pt(e);
    if (d.mode === 'create') {
      if (d.otype === 'line') patch(d.id, { x2: x, y2: y });
      else patch(d.id, { w: x - d.sx, h: y - d.sy });
    } else if (d.mode === 'draw') {
      setObjects((prev) => prev.map((o) => (o.id === d.id ? { ...o, points: [...o.points, [x, y]] } : o)));
    } else if (d.mode === 'move') {
      const dx = x - d.sx, dy = y - d.sy;
      const g = d.orig;
      if (g.type === 'line') patch(d.id, { x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy });
      else if (g.type === 'pen') patch(d.id, { points: g.points.map((p) => [p[0] + dx, p[1] + dy]) });
      else patch(d.id, { x: g.x + dx, y: g.y + dy });
    } else if (d.mode === 'resize') {
      patch(d.id, { w: Math.max(4, x - d.orig.x), h: Math.max(4, y - d.orig.y) });
    } else if (d.mode === 'p1') {
      patch(d.id, { x1: x, y1: y });
    } else if (d.mode === 'p2') {
      patch(d.id, { x2: x, y2: y });
    }
  }, [pt, patch, setObjects]);

  const onUp = useCallback(() => {
    const d = drag.current;
    if (d && d.mode === 'create') {
      setObjects((prev) => prev.map((o) => {
        if (o.id !== d.id || o.type === 'line') return o;
        let next = o;
        if (Math.abs(o.w) < 6 && Math.abs(o.h) < 6) next = { ...o, w: 160, h: 160 };
        return normalizeBox(next);
      }));
      setTool('select');
    }
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove, setObjects, setTool]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove, onUp]);

  const beginDrag = useCallback((meta) => {
    drag.current = meta;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [onMove, onUp]);

  // ── Create / interaction on empty canvas ────────────────
  const onSvgPointerDown = (e) => {
    if (e.button !== 0) return;
    const [x, y] = pt(e);

    if (tool === 'select') { setSelectedId(null); return; }
    if (tool === 'text') {
      const o = createObject('text', x, y - 48);
      setObjects((prev) => [...prev, o]);
      setSelectedId(o.id);
      setTool('select');
      return;
    }
    const o = createObject(tool, x, y);
    setObjects((prev) => [...prev, o]);
    setSelectedId(o.id);
    beginDrag({ mode: tool === 'pen' ? 'draw' : 'create', id: o.id, otype: o.type, sx: x, sy: y });
  };

  // ── Select / move existing object ───────────────────────
  const onObjectPointerDown = (e, o) => {
    if (tool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    setSelectedId(o.id);
    beginDrag({ mode: 'move', id: o.id, sx: pt(e)[0], sy: pt(e)[1], orig: JSON.parse(JSON.stringify(o)) });
  };

  const startHandle = (e, o, handle) => {
    e.stopPropagation();
    beginDrag({ mode: handle, id: o.id, sx: pt(e)[0], sy: pt(e)[1], orig: JSON.parse(JSON.stringify(o)) });
  };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((z) => Math.min(6, Math.max(0.25, z * factor)));
  };

  const handleContext = (e, objId) => {
    e.preventDefault();
    e.stopPropagation();
    if (objId) setSelectedId(objId);
    onContextMenu?.(e, objId || null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) onImageDrop?.(files);
  };

  const px = CANVAS * zoom;
  const hpx = 10 / zoom;            // handle size in user units (constant on screen)
  const sw = 1.5 / zoom;           // selection stroke width
  const defs = objects.map(filterDef).filter(Boolean).join('');
  const sel = objects.find((o) => o.id === selectedId);
  const sb = sel ? bbox(sel) : null;

  return (
    <div className="canvas-wrap" onWheel={onWheel}
      onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      onContextMenu={(e) => handleContext(e, null)}>
      <div className="canvas-shadow" style={{ width: px, height: px }}>
        <svg
          ref={svgRef}
          className={`icon-canvas tool-${tool}`}
          width={px}
          height={px}
          viewBox={`0 0 ${CANVAS} ${CANVAS}`}
          onPointerDown={onSvgPointerDown}
        >
          <defs dangerouslySetInnerHTML={{ __html: defs }} />
          <g dangerouslySetInnerHTML={{ __html: bgRect(background, bgPad) }} />
          {objects.map((o) => (
            <g
              key={o.id}
              style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
              onPointerDown={(e) => onObjectPointerDown(e, o)}
              onContextMenu={(e) => handleContext(e, o.id)}
              dangerouslySetInnerHTML={{ __html: objToSvg(o) }}
            />
          ))}

          {/* Selection overlay */}
          {sel && sel.type !== 'line' && sb && (
            <g pointerEvents="none">
              <rect x={sb.x} y={sb.y} width={sb.w} height={sb.h}
                fill="none" stroke="#3b82f6" strokeWidth={sw} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />
            </g>
          )}
          {sel && ['rect', 'ellipse', 'image', 'text', 'shape'].includes(sel.type) && sb && (
            <rect className="handle" x={sb.x + sb.w - hpx / 2} y={sb.y + sb.h - hpx / 2}
              width={hpx} height={hpx} fill="#3b82f6" stroke="#fff" strokeWidth={sw}
              style={{ cursor: 'nwse-resize' }}
              onPointerDown={(e) => startHandle(e, sel, 'resize')} />
          )}
          {sel && sel.type === 'line' && (
            <>
              <circle cx={sel.x1} cy={sel.y1} r={hpx / 1.5} fill="#3b82f6" stroke="#fff" strokeWidth={sw}
                onPointerDown={(e) => startHandle(e, sel, 'p1')} style={{ cursor: 'move' }} />
              <circle cx={sel.x2} cy={sel.y2} r={hpx / 1.5} fill="#3b82f6" stroke="#fff" strokeWidth={sw}
                onPointerDown={(e) => startHandle(e, sel, 'p2')} style={{ cursor: 'move' }} />
            </>
          )}
        </svg>
      </div>
      <div className="canvas-zoom-badge">{Math.round(zoom * 100)}%</div>
    </div>
  );
}
