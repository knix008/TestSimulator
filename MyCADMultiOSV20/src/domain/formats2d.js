// 2D exchange beyond DXF: SVG import (paths, shapes, texts, transforms, units)
// and HP-GL/2 plotter files (.plt / .hpgl) both ways.
import { AUTO, createDrawing, isVisible, styleOf } from './drawing.js';
import { primitives } from './entities.js';
import { arcPoints, sweep } from './geometry.js';
import { bezierChain } from './nurbs.js';
import { cssColor, flattenSegments, parseSvg } from './svgparse.js';

// ───────────────────────── SVG → drawing

/** Subpaths of segments: [{ segments (starting with M), closed }]. */
function subpaths(segments) {
  const out = [];
  let current = null;
  for (const s of segments) {
    if (s[0] === 'M') { current = { segments: [s], closed: false }; out.push(current); } else if (s[0] === 'Z') { if (current) current.closed = true; current = null; } else {
      if (!current) { current = { segments: [['M', ...(out.at(-1)?.segments.at(-1)?.slice(-2) ?? [0, 0])]], closed: false }; out.push(current); }
      current.segments.push(s);
    }
  }
  return out.filter((sub) => sub.segments.length >= 2);
}

/**
 * Reads an SVG file into a new drawing (mm, y up). Straight paths become
 * lines / polylines / rectangles, curved ones splines, circles and ellipses
 * stay circles and ellipses, filled shapes also get a solid hatch, texts stay
 * texts. Returns { drawing, imported, skipped }.
 */
export function importSvg(text, { title = 'SVG', language = 'ko' } = {}) {
  const { height, items } = parseSvg(text);
  const drawing = createDrawing({ title, language });
  const flip = (x, y) => ({ x, y: height - y });
  const entities = [];
  for (const item of items) {
    if (item.kind === 'text') {
      const p = flip(item.x, item.y);
      const color = cssColor(item.fill);
      entities.push({ type: 'text', x: p.x, y: p.y, text: item.text, size: item.size, angle: item.angle, align: item.anchor === 'middle' ? 'center' : item.anchor === 'end' ? 'right' : 'left', bold: Number.parseInt(item.weight, 10) >= 600 || item.weight === 'bold', italic: item.italic, ...(color && color !== '#000000' ? { color } : {}) });
      continue;
    }
    const stroke = cssColor(item.stroke);
    const style = { ...(stroke && stroke !== '#000000' ? { color: stroke } : {}), ...(item.dash.length ? { lineType: 'dashed' } : {}) };
    const subs = subpaths(item.segments);
    const outlined = Boolean(item.stroke) || !item.fill;
    // Circles and ellipses (four Bézier quarters).
    if ((item.shape === 'circle' || item.shape === 'ellipse') && subs.length === 1) {
      const anchors = subs[0].segments.slice(0, 4).map((s) => (s[0] === 'M' ? [s[1], s[2]] : [s[5], s[6]]));
      const c = { x: (anchors[0][0] + anchors[2][0]) / 2, y: (anchors[0][1] + anchors[2][1]) / 2 };
      const rx = Math.hypot(anchors[0][0] - c.x, anchors[0][1] - c.y);
      const ry = Math.hypot(anchors[1][0] - c.x, anchors[1][1] - c.y);
      const centre = flip(c.x, c.y);
      if (outlined) {
        if (Math.abs(rx - ry) < 1e-6 * Math.max(rx, 1)) entities.push({ type: 'circle', cx: centre.x, cy: centre.y, r: rx, ...style });
        else entities.push({ type: 'ellipse', cx: centre.x, cy: centre.y, rx, ry, angle: (-Math.atan2(anchors[0][1] - c.y, anchors[0][0] - c.x) * 180) / Math.PI, ...style });
      }
      if (item.fill && item.fillExplicit) entities.push({ type: 'hatch', pattern: 'solid', loops: flattenSegments(item.segments).map((sub) => sub.points.map(([x, y]) => flip(x, y))), ...(cssColor(item.fill) !== '#000000' ? { color: cssColor(item.fill) } : {}) });
      continue;
    }
    if (outlined) {
      for (const sub of subs) {
        const curved = sub.segments.some((s) => s[0] === 'C');
        const points = sub.segments.map((s) => (s[0] === 'C' ? [s[5], s[6]] : [s[1], s[2]]));
        if (!curved) {
          const pts = points.map(([x, y]) => flip(x, y));
          if (sub.closed && pts.length > 2 && Math.hypot(pts[0].x - pts.at(-1).x, pts[0].y - pts.at(-1).y) < 1e-9) pts.pop();
          const axisRect = sub.closed && pts.length === 4 && pts.every((p, i) => { const q = pts[(i + 1) % 4]; return Math.abs(p.x - q.x) < 1e-9 || Math.abs(p.y - q.y) < 1e-9; });
          if (axisRect) {
            const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
            entities.push({ type: 'rect', x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), ...style });
          } else if (pts.length === 2 && !sub.closed) entities.push({ type: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, ...style });
          else entities.push({ type: 'polyline', points: pts, closed: sub.closed, ...style });
          continue;
        }
        // Curves: one cubic B-spline through the segments (straight pieces as straight cubics).
        const pieces = [];
        let at = [sub.segments[0][1], sub.segments[0][2]];
        const segs = sub.segments.slice(1);
        if (sub.closed) {
          const start = [sub.segments[0][1], sub.segments[0][2]];
          const end = points.at(-1);
          if (Math.hypot(end[0] - start[0], end[1] - start[1]) > 1e-9) segs.push(['L', ...start]);
        }
        for (const s of segs) {
          const to = s[0] === 'C' ? [s[5], s[6]] : [s[1], s[2]];
          const c1 = s[0] === 'C' ? [s[1], s[2]] : [at[0] + (to[0] - at[0]) / 3, at[1] + (to[1] - at[1]) / 3];
          const c2 = s[0] === 'C' ? [s[3], s[4]] : [at[0] + ((to[0] - at[0]) * 2) / 3, at[1] + ((to[1] - at[1]) * 2) / 3];
          pieces.push([at, c1, c2, to]);
          at = to;
        }
        const curve = bezierChain(pieces);
        entities.push({ type: 'spline', degree: 3, knots: curve.knots, points: curve.points.map(([x, y]) => flip(x, y)), ...style });
      }
    }
    if (item.fill && item.fillExplicit) {
      const loops = flattenSegments(item.segments).filter((sub) => sub.points.length >= 3).map((sub) => sub.points.map(([x, y]) => flip(x, y)));
      if (loops.length) entities.push({ type: 'hatch', pattern: 'solid', loops, ...(cssColor(item.fill) !== '#000000' ? { color: cssColor(item.fill) } : {}) });
    }
  }
  drawing.entities = entities;
  return { drawing, imported: entities.length, skipped: {} };
}

// ───────────────────────── HP-GL/2

const PLU = 40; // plotter units per mm

/**
 * HP-GL/2 of a drawing: one pen per layer (SP), pen up/down moves, circles
 * (CI), arcs (AA) and labels (LB, ASCII). Units: 1/40 mm.
 */
export function exportHpgl(drawing, { entities = null } = {}) {
  const list = (entities ?? drawing.entities).filter((entity) => isVisible(drawing, entity) && !entity.construction);
  const pens = new Map(drawing.layers.map((layer, i) => [layer.id, (i % 8) + 1]));
  const u = (v) => Math.round(v * PLU);
  const out = ['IN;', 'PA;'];
  let pen = 0;
  for (const entity of list) {
    const p = pens.get(entity.layer) ?? 1;
    if (p !== pen) { out.push(`SP${p};`); pen = p; }
    const lineType = styleOf(drawing, entity).lineType;
    out.push(lineType === 'continuous' ? 'LT;' : lineType === 'center' ? 'LT4,6;' : lineType === 'dotted' ? 'LT1,2;' : 'LT2,4;');
    for (const prim of primitives(entity)) {
      switch (prim.kind) {
        case 'line': out.push(`PU${u(prim.a.x)},${u(prim.a.y)};PD${u(prim.b.x)},${u(prim.b.y)};`); break;
        case 'poly': case 'fill': {
          const pts = prim.closed || prim.kind === 'fill' ? [...prim.points, prim.points[0]] : prim.points;
          out.push(`PU${u(pts[0].x)},${u(pts[0].y)};PD${pts.slice(1).map((q) => `${u(q.x)},${u(q.y)}`).join(',')};`);
          break;
        }
        case 'circle': out.push(`PU${u(prim.c.x)},${u(prim.c.y)};CI${u(prim.r)};`); break;
        case 'arc': {
          const start = { x: prim.c.x + prim.r * Math.cos((prim.start * Math.PI) / 180), y: prim.c.y + prim.r * Math.sin((prim.start * Math.PI) / 180) };
          out.push(`PU${u(start.x)},${u(start.y)};PD;AA${u(prim.c.x)},${u(prim.c.y)},${Math.round(sweep(prim.start, prim.end) * 1000) / 1000};`);
          break;
        }
        case 'text': {
          const size = prim.size / 10; // cm
          const a = ((prim.angle ?? 0) * Math.PI) / 180;
          const ascii = String(prim.text).replace(/[^\x20-\x7e\n]/g, '?');
          out.push(`SI${(size * 0.6).toFixed(3)},${size.toFixed(3)};DI${Math.cos(a).toFixed(4)},${Math.sin(a).toFixed(4)};`);
          ascii.split('\n').forEach((line, i) => {
            const y = prim.p.y - i * prim.size * 1.5;
            out.push(`PU${u(prim.p.x)},${u(y)};LB${line}\u0003`);
          });
          break;
        }
        default: break;
      }
    }
  }
  out.push('PU;SP0;IN;');
  return `${out.join('\n')}\n`;
}

/** Reads HP-GL / HP-GL/2: pen moves become polylines, CI circles, AA/AR arcs, LB texts; one layer per pen. */
export function importHpgl(text, { title = 'HPGL', language = 'ko' } = {}) {
  const drawing = createDrawing({ title, language });
  const entities = [];
  const skipped = {};
  let x = 0; let y = 0; let down = false; let relative = false; let pen = 1;
  let chain = null;
  let size = 3.75; let dir = 0;
  const layerFor = (n) => {
    const id = `pen${n}`;
    if (!drawing.layers.some((layer) => layer.id === id)) drawing.layers.push({ id, name: `Pen ${n}`, color: ['#000000', '#d62828', '#2a9d8f', '#1d4ed8', '#9333ea', '#ea580c', '#0891b2', '#65a30d'][(n - 1) % 8], lineType: 'continuous', lineWidth: 0.25, visible: true, locked: false });
    return id;
  };
  let lineType = null; // LT: 1 → dotted, 2–3 → dashed, 4–6 → centre line
  const penStyle = () => ({ layer: layerFor(pen), ...(lineType ? { lineType } : {}) });
  const flush = () => {
    if (chain && chain.length >= 2) entities.push(chain.length === 2 ? { type: 'line', x1: chain[0].x, y1: chain[0].y, x2: chain[1].x, y2: chain[1].y, ...penStyle() } : { type: 'polyline', points: chain, closed: false, ...penStyle() });
    chain = null;
  };
  const moveTo = (nx, ny) => {
    if (down) { if (!chain) chain = [{ x: x / PLU, y: y / PLU }]; chain.push({ x: nx / PLU, y: ny / PLU }); } else flush();
    x = nx; y = ny;
  };
  const source = String(text).replace(/\x1b%-?\d*[AB]/g, '');
  let terminator = '\u0003'; // label terminator (DT changes it)
  let i = 0;
  while (i < source.length) {
    const m = /^([A-Z]{2})/i.exec(source.slice(i, i + 2));
    if (!m) { i++; continue; }
    const cmd = m[1].toUpperCase();
    i += 2;
    if (cmd === 'DT') {
      // DTt[,mode]; — the next character is the new terminator (none: back to ETX).
      const c = source[i];
      terminator = !c || c === ';' ? '\u0003' : c;
      while (i < source.length && source[i] !== ';' && source[i] !== '\n') i++;
      continue;
    }
    if (cmd === 'LB') {
      const end = source.indexOf(terminator, i);
      const label = source.slice(i, end < 0 ? undefined : end);
      i = end < 0 ? source.length : end + 1;
      flush();
      if (label.trim()) entities.push({ type: 'text', x: x / PLU, y: y / PLU, text: label, size, angle: dir, ...penStyle() });
      continue;
    }
    let end = i;
    while (end < source.length && !/[;A-Z\n]/i.test(source[end])) end++;
    const args = source.slice(i, end).split(/[\s,]+/).filter(Boolean).map(Number);
    i = end;
    switch (cmd) {
      case 'IN': case 'DF': flush(); x = 0; y = 0; down = false; relative = false; break;
      case 'SP': flush(); pen = args[0] || 1; break;
      case 'PA': relative = false; for (let k = 0; k + 1 < args.length; k += 2) moveTo(args[k], args[k + 1]); break;
      case 'PR': relative = true; for (let k = 0; k + 1 < args.length; k += 2) moveTo(x + args[k], y + args[k + 1]); break;
      case 'PU': case 'PD':
        if (cmd === 'PU') { flush(); down = false; } else down = true;
        for (let k = 0; k + 1 < args.length; k += 2) moveTo(relative ? x + args[k] : args[k], relative ? y + args[k + 1] : args[k + 1]);
        break;
      case 'CI': flush(); if (args[0]) entities.push({ type: 'circle', cx: x / PLU, cy: y / PLU, r: Math.abs(args[0]) / PLU, ...penStyle() }); break;
      case 'AA': case 'AR': {
        flush();
        const cx = cmd === 'AR' ? x + args[0] : args[0];
        const cy = cmd === 'AR' ? y + args[1] : args[1];
        const angle = args[2] ?? 0;
        const r = Math.hypot(x - cx, y - cy);
        const a0 = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
        const a1 = a0 + angle;
        if (r > 0 && angle) entities.push({ type: 'arc', cx: cx / PLU, cy: cy / PLU, r: r / PLU, start: angle > 0 ? a0 : a1, end: angle > 0 ? a1 : a0, ...penStyle() });
        const endPoint = arcPoints(cx, cy, r, a0, a1, Math.abs(angle) || 1).at(angle > 0 ? -1 : 0);
        if (endPoint) { x = cx + r * Math.cos((a1 * Math.PI) / 180); y = cy + r * Math.sin((a1 * Math.PI) / 180); }
        break;
      }
      case 'SI': if (args[1]) size = args[1] * 10; break;
      case 'DI': if (args.length >= 2) dir = (Math.atan2(args[1], args[0]) * 180) / Math.PI; break;
      case 'LT': flush(); lineType = args.length && args[0] !== 0 ? (Math.abs(args[0]) === 1 ? 'dotted' : Math.abs(args[0]) >= 4 ? 'center' : 'dashed') : null; break;
      case 'PW': case 'VS': case 'IP': case 'SC': case 'RO': case 'PS': case 'BP': case 'PG': case 'NP': case 'WU': case 'FT': case 'PM': case 'EP': case 'FP': case 'CO': break;
      default: skipped[cmd] = (skipped[cmd] ?? 0) + 1;
    }
  }
  flush();
  drawing.entities = entities;
  return { drawing, imported: entities.length, skipped };
}

export const looksLikeHpgl = (text) => /^\s*(?:\x1b%-?\d*[AB])?\s*(IN|DF|SP|PU|PA)\s*[;\d]/i.test(String(text).slice(0, 64));
export { AUTO };
