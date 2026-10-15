// FreeCAD TechDraw helpers on the 2D drawing (the page): views from any
// direction, broken and detail views, chain / coordinate / chamfer / extent
// dimensions and their cascading, ISO 286 hole/shaft fits, cosmetic
// centrelines and threads, surface finish and weld symbols, page templates
// with their title block fields, and spreadsheet tables. No DOM.

import { joinSegments, meshBox, projectEdges } from './solids.js';
import { pathPoints } from './draft.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

// ───────────────────────── views

/** The drawing axes of a view looking along −dir (dir towards the viewer), with "up" kept upward. */
export function viewFrame(dir, up = [0, 0, 1]) {
  const d = unit3(dir);
  let u = cross3(up, d);
  if (Math.hypot(...u) < 1e-9) u = cross3([0, 1, 0], d);
  u = unit3(u);
  const v = cross3(d, u);
  return { dir: d, u, v };
}

/**
 * TechDraw_ActiveView / TechDraw_ProjectShape: the lines of solids seen along
 * a direction, placed with their lower left at (x0, y0), hidden lines marked.
 * Returns raw 2D entities.
 */
export function directionView(triangles, dir, { x0 = 0, y0 = 0, scale = 1, hiddenLayer = null, up = [0, 0, 1] } = {}) {
  if (!triangles.length) return [];
  const frame = viewFrame(dir, up);
  const segments = projectEdges(triangles, frame, { hidden: true });
  let minX = Infinity; let minY = Infinity;
  for (const seg of segments) for (const p of seg) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
  const move = (p) => ({ x: x0 + (p.x - minX) * scale, y: y0 + (p.y - minY) * scale });
  const size = Math.max(...meshBox(triangles).size);
  const out = [];
  for (const hidden of [false, true]) {
    const chains = joinSegments(segments.filter((s) => Boolean(s.hidden) === hidden).map(([a, b]) => [move(a), move(b)]), 1e-4);
    for (const c of chains) {
      const pts = c.points ?? c;
      if (pts.length < 2) continue;
      let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
      if (L < size * scale * 4e-3) continue;
      out.push({ type: 'polyline', points: pts, closed: Boolean(c.closed), ...(hidden ? (hiddenLayer ? { layer: hiddenLayer } : { lineType: 'hidden' }) : {}) });
    }
  }
  return out;
}

/** The pieces of a polyline inside a region: its crossings of the border put in, then the runs of inside points. */
function cutPolyline(points, inside, splitAt) {
  const fine = [points[0]];
  for (let i = 1; i < points.length; i++) fine.push(...splitAt(points[i - 1], points[i]), points[i]);
  const out = [];
  let cur = [];
  for (const p of fine) {
    if (inside(p)) cur.push(p);
    else { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Where segment ab crosses x = c (vertical) or y = c, as points. */
const crossLine = (axis, c) => (a, b) => {
  const k = axis === 'x' ? 'x' : 'y';
  if ((a[k] - c) * (b[k] - c) >= 0 || a[k] === b[k]) return [];
  const t = (c - a[k]) / (b[k] - a[k]);
  return [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }];
};

/**
 * TechDraw_BrokenView: the band between `from` and `to` along an axis taken
 * out, the far side moved up to leave `gap`, with zigzag break lines.
 * Returns { entities: raw 2D (paths), breaks: raw break lines }.
 */
export function brokenView(entities, axis, from, to, gap = 6) {
  const [a, b] = [Math.min(from, to), Math.max(from, to)];
  const shift = -(b - a) + gap;
  const k = axis === 'x' ? 'x' : 'y';
  const out = [];
  let lo = Infinity; let hi = -Infinity;
  for (const e of entities) {
    const path = pathPoints(e);
    if (!path) continue;
    for (const p of path.points) { const o = axis === 'x' ? p.y : p.x; lo = Math.min(lo, o); hi = Math.max(hi, o); }
    const pts = path.points;
    const before = cutPolyline(pts, (p) => p[k] <= a + 1e-9, crossLine(axis, a));
    const after = cutPolyline(pts, (p) => p[k] >= b - 1e-9, crossLine(axis, b)).map((piece) => piece.map((p) => (axis === 'x' ? { x: p.x + shift, y: p.y } : { x: p.x, y: p.y + shift })));
    for (const piece of [...before, ...after]) out.push({ type: 'polyline', points: piece, closed: false, layer: e.layer, ...(e.lineType ? { lineType: e.lineType } : {}) });
  }
  // Zigzag break lines on both cut edges.
  const zig = (c) => {
    const n = 6; const amp = gap * 0.25;
    return Array.from({ length: n + 1 }, (_, i) => { const o = lo - gap / 2 + ((hi - lo + gap) * i) / n; const w = i % 2 ? amp : -amp; return axis === 'x' ? { x: c + w, y: o } : { x: o, y: c + w }; });
  };
  const breaks = Number.isFinite(lo) ? [{ type: 'polyline', points: zig(a), closed: false }, { type: 'polyline', points: zig(b + shift), closed: false }] : [];
  return { entities: out, breaks, shift };
}

/** TechDraw_DetailView: what lies inside a circle, magnified `scale` times and placed at `at` (its centre). */
export function detailView(entities, centre, radius, scale, at) {
  const inside = (p) => dist(p, centre) <= radius * (1 + 1e-9) + 1e-9;
  const splitAt = (p, q) => {
    // Circle–segment crossings.
    const d = { x: q.x - p.x, y: q.y - p.y }; const f = { x: p.x - centre.x, y: p.y - centre.y };
    const A = d.x * d.x + d.y * d.y; const B = 2 * (f.x * d.x + f.y * d.y); const C = f.x * f.x + f.y * f.y - radius * radius;
    const disc = B * B - 4 * A * C;
    if (disc < 0 || A < 1e-24) return [];
    return [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)].filter((t) => t > 1e-9 && t < 1 - 1e-9).sort((x, y) => x - y).map((t) => ({ x: p.x + d.x * t, y: p.y + d.y * t }));
  };
  const map = (p) => ({ x: at.x + (p.x - centre.x) * scale, y: at.y + (p.y - centre.y) * scale });
  const out = [];
  for (const e of entities) {
    const path = pathPoints(e);
    if (!path) continue;
    for (const piece of cutPolyline(path.points, inside, splitAt)) out.push({ type: 'polyline', points: piece.map(map), closed: false, layer: e.layer, ...(e.lineType ? { lineType: e.lineType } : {}) });
  }
  out.push({ type: 'circle', cx: at.x, cy: at.y, r: radius * scale, lineType: 'phantom' });
  return out;
}

// ───────────────────────── dimensions

/** The corner points of the selection that dimensions can measure: line ends, polyline vertices, points, circle centres. */
export function vertexPoints(entities) {
  const pts = [];
  for (const e of entities) {
    if (e.type === 'point') pts.push({ x: e.x, y: e.y });
    else if (e.type === 'circle' || e.type === 'arc') pts.push({ x: e.cx, y: e.cy });
    else { const p = pathPoints(e); if (p) pts.push(...(p.closed ? p.points.slice(0, -1) : p.points)); }
  }
  const seen = new Set();
  return pts.filter((p) => { const k = `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * Chain (each to the next) or coordinate (all from the first) dimensions of
 * points, horizontal, vertical or oblique (along the first two points), with
 * their dimension line `offset` away (coordinate ones cascade by `spacing`).
 */
export function chainDimensions(points, { direction = 'horizontal', coordinate = false, offset = 10, spacing = 7, size = 3.5, precision = 1 } = {}) {
  if (points.length < 2) return [];
  const along = direction === 'horizontal' ? { x: 1, y: 0 } : direction === 'vertical' ? { x: 0, y: 1 } : (() => { const d = { x: points[1].x - points[0].x, y: points[1].y - points[0].y }; const l = Math.hypot(d.x, d.y) || 1; return { x: d.x / l, y: d.y / l }; })();
  const sorted = points.slice().sort((p, q) => (p.x * along.x + p.y * along.y) - (q.x * along.x + q.y * along.y));
  const normal = { x: -along.y, y: along.x };
  // The dimension line beyond every point (on the normal's side).
  const far = Math.max(...sorted.map((p) => p.x * normal.x + p.y * normal.y));
  const kind = direction === 'oblique' ? 'aligned' : direction;
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = coordinate ? sorted[0] : sorted[i - 1];
    const b = sorted[i];
    const level = far + offset + (coordinate ? (i - 1) * spacing : 0);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const shiftBy = level - (mid.x * normal.x + mid.y * normal.y);
    out.push({ type: 'dim', kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, ox: mid.x + normal.x * shiftBy, oy: mid.y + normal.y * shiftBy, size, precision });
  }
  return out;
}

/** TechDraw_ExtensionCascade*: the dimensions' lines stacked `spacing` apart, in order of their length. */
export function cascadeDimensions(dims, spacing = 7) {
  if (!dims.length) return [];
  const normalOf = (d) => (d.kind === 'horizontal' ? { x: 0, y: 1 } : d.kind === 'vertical' ? { x: 1, y: 0 } : (() => { const l = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1; return { x: -(d.y2 - d.y1) / l, y: (d.x2 - d.x1) / l }; })());
  const n = normalOf(dims[0]);
  const level = (d) => d.ox * n.x + d.oy * n.y;
  const sorted = dims.slice().sort((a, b) => Math.hypot(a.x2 - a.x1, a.y2 - a.y1) - Math.hypot(b.x2 - b.x1, b.y2 - b.y1));
  const base = Math.min(...dims.map(level));
  return sorted.map((d, i) => { const by = base + i * spacing - level(d); return { ...d, ox: d.ox + n.x * by, oy: d.oy + n.y * by }; });
}

/** TechDraw_ExtensionPos*ChainDimension: the dimensions' lines all on one line (the first one's). */
export function alignDimensions(dims) {
  if (dims.length < 2) return dims;
  const d0 = dims[0];
  const n = d0.kind === 'horizontal' ? { x: 0, y: 1 } : d0.kind === 'vertical' ? { x: 1, y: 0 } : (() => { const l = Math.hypot(d0.x2 - d0.x1, d0.y2 - d0.y1) || 1; return { x: -(d0.y2 - d0.y1) / l, y: (d0.x2 - d0.x1) / l }; })();
  const level = d0.ox * n.x + d0.oy * n.y;
  return dims.map((d) => { const by = level - (d.ox * n.x + d.oy * n.y); return { ...d, ox: d.ox + n.x * by, oy: d.oy + n.y * by }; });
}

/** TechDraw_HorizontalExtentDimension / VerticalExtentDimension: the overall size of the selection. */
export function extentDimension(entities, direction, { offset = 10, size = 3.5, precision = 1 } = {}) {
  const pts = vertexPoints(entities);
  for (const e of entities) if (e.type === 'circle') pts.push({ x: e.cx - e.r, y: e.cy - e.r }, { x: e.cx + e.r, y: e.cy + e.r });
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  if (direction === 'horizontal') {
    const y = Math.max(...ys);
    return { type: 'dim', kind: 'horizontal', x1: Math.min(...xs), y1: y, x2: Math.max(...xs), y2: y, ox: (Math.min(...xs) + Math.max(...xs)) / 2, oy: y + offset, size, precision };
  }
  const x = Math.max(...xs);
  return { type: 'dim', kind: 'vertical', x1: x, y1: Math.min(...ys), x2: x, y2: Math.max(...ys), ox: x + offset, oy: (Math.min(...ys) + Math.max(...ys)) / 2, size, precision };
}

/** TechDraw_ExtensionCreate*ChamferDimension: a chamfer line's run (horizontal or vertical) with its angle in the text. */
export function chamferDimension(line, direction, { offset = 8, size = 3.5, precision = 1 } = {}) {
  const dx = Math.abs(line.x2 - line.x1); const dy = Math.abs(line.y2 - line.y1);
  const angle = (Math.atan2(direction === 'horizontal' ? dy : dx, direction === 'horizontal' ? dx : dy) * 180) / Math.PI;
  const text = `<>×${Number(angle.toFixed(1))}°`;
  if (direction === 'horizontal') { const y = Math.max(line.y1, line.y2) + offset; return { type: 'dim', kind: 'horizontal', x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2, ox: (line.x1 + line.x2) / 2, oy: y, size, precision, text }; }
  const x = Math.max(line.x1, line.x2) + offset;
  return { type: 'dim', kind: 'vertical', x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2, ox: x, oy: (line.y1 + line.y2) / 2, size, precision, text };
}

// ───────────────────────── ISO 286 fits (TechDraw_HoleShaftFit)

const RANGES = [[0, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50], [50, 80], [80, 120], [120, 180], [180, 250], [250, 315], [315, 400], [400, 500]];
const IT_FACTOR = { 5: 7, 6: 10, 7: 16, 8: 25, 9: 40, 10: 64, 11: 100 };

/** The standard tolerance IT (µm) of a grade at a nominal size (ISO 286 formula over its size range). */
export function itTolerance(size, grade) {
  const [lo, hi] = RANGES.find(([a, b]) => size > a && size <= b) ?? RANGES[RANGES.length - 1];
  const D = Math.sqrt(Math.max(1, lo) * hi);
  const i = 0.45 * Math.cbrt(D) + 0.001 * D;
  return Math.round(IT_FACTOR[grade] * i);
}

/**
 * Upper and lower deviations (µm) of a hole (capital letter) or shaft (small)
 * for a letter and grade, by the ISO 286 fundamental-deviation formulas.
 */
export function deviations(size, letter, grade) {
  const it = itTolerance(size, grade);
  const [lo, hi] = RANGES.find(([a, b]) => size > a && size <= b) ?? RANGES[RANGES.length - 1];
  const D = Math.sqrt(Math.max(1, lo) * hi);
  const shaft = letter === letter.toLowerCase();
  const l = letter.toLowerCase();
  if (l === 'js') return { upper: it / 2, lower: -it / 2 };
  // Shaft fundamental deviations (es for a–h, ei for k–zc), µm.
  const es = { d: -16 * D ** 0.44, e: -11 * D ** 0.41, f: -5.5 * D ** 0.41, g: -2.5 * D ** 0.34, h: 0 }[l];
  const ei = { k: grade >= 4 && grade <= 7 ? 0.6 * Math.cbrt(D) : 0, m: itTolerance(size, 7) - itTolerance(size, 6), n: 5 * D ** 0.34, p: itTolerance(size, 7) + 2, s: itTolerance(size, 8) + D * 0.4 }[l];
  let upper; let lower;
  if (es !== undefined) { upper = Math.round(es); lower = upper - it; } else if (ei !== undefined) { lower = Math.round(ei); upper = lower + it; } else return null;
  // A hole is the shaft's mirror (EI = −es, ES = −ei).
  const z = (v) => (Object.is(v, -0) ? 0 : v);
  return shaft ? { upper: z(upper), lower: z(lower) } : { upper: z(-lower), lower: z(-upper) };
}

/** The text a diameter dimension gets for a fit, e.g. "<> H7/g6 (+0.021/0 · −0.007/−0.020)". */
export function fitText(size, hole, holeGrade, shaft, shaftGrade) {
  const h = deviations(size, hole, holeGrade); const s = deviations(size, shaft, shaftGrade);
  if (!h || !s) return null;
  const mm = (v) => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${(Math.abs(v) / 1000).toFixed(3)}`);
  const clearance = { max: h.upper - s.lower, min: h.lower - s.upper };
  return { text: `<> ${hole}${holeGrade}/${shaft}${shaftGrade} (${mm(h.upper)}/${mm(h.lower)} · ${mm(s.upper)}/${mm(s.lower)})`, hole: h, shaft: s, clearance, kind: clearance.min >= 0 ? 'clearance' : clearance.max <= 0 ? 'interference' : 'transition' };
}

// ───────────────────────── cosmetic geometry

/** TechDraw_2LineCenterLine: the centreline half-way between two lines (over their common length, a little beyond). */
export function centreLineBetween(l1, l2, extend = 3) {
  const a = { x: (l1.x1 + l2.x1) / 2, y: (l1.y1 + l2.y1) / 2 };
  const flip = Math.hypot(l1.x1 - l2.x1, l1.y1 - l2.y1) > Math.hypot(l1.x1 - l2.x2, l1.y1 - l2.y2);
  const b = flip ? { x: (l1.x2 + l2.x1) / 2, y: (l1.y2 + l2.y1) / 2 } : { x: (l1.x2 + l2.x2) / 2, y: (l1.y2 + l2.y2) / 2 };
  const a2 = flip ? { x: (l1.x1 + l2.x2) / 2, y: (l1.y1 + l2.y2) / 2 } : a;
  const d = { x: b.x - a2.x, y: b.y - a2.y }; const l = Math.hypot(d.x, d.y) || 1;
  return { x1: a2.x - (d.x / l) * extend, y1: a2.y - (d.y / l) * extend, x2: b.x + (d.x / l) * extend, y2: b.y + (d.y / l) * extend };
}

/** TechDraw_ExtensionCircleCenterLines: the two crossing centrelines of a circle, `extend` beyond it. */
export const circleCentreLines = (c, extend = 2) => [
  { x1: c.cx - c.r - extend, y1: c.cy, x2: c.cx + c.r + extend, y2: c.cy },
  { x1: c.cx, y1: c.cy - c.r - extend, x2: c.cx, y2: c.cy + c.r + extend },
];

/** TechDraw_ExtensionHoleCircle: the bolt circle through the holes' centres, and a radial centreline to each. */
export function boltCircle(circles, extend = 2) {
  if (circles.length < 3) return null;
  const c = { x: circles.reduce((s, k) => s + k.cx, 0) / circles.length, y: circles.reduce((s, k) => s + k.cy, 0) / circles.length };
  const R = circles.reduce((s, k) => s + Math.hypot(k.cx - c.x, k.cy - c.y), 0) / circles.length;
  const radial = circles.map((k) => { const a = Math.atan2(k.cy - c.y, k.cx - c.x); const r1 = R - k.r - extend; const r2 = R + k.r + extend; return { x1: c.x + r1 * Math.cos(a), y1: c.y + r1 * Math.sin(a), x2: c.x + r2 * Math.cos(a), y2: c.y + r2 * Math.sin(a) }; });
  return { circle: { cx: c.x, cy: c.y, r: R }, radial };
}

/**
 * Cosmetic threads (ISO convention: thin lines at the thread's minor / major diameter):
 * side views between two parallel edges, bottom views as a ¾ circle.
 */
export function threadSide(l1, l2, { hole = false, ratio = 0.85 } = {}) {
  // Each thin line between the two edges, moved in (bolt: to the minor diameter) or out (hole: to the major).
  const k = hole ? 1 / ratio : ratio;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const p = [{ x: l1.x1, y: l1.y1 }, { x: l1.x2, y: l1.y2 }]; const flip = Math.hypot(l1.x1 - l2.x1, l1.y1 - l2.y1) > Math.hypot(l1.x1 - l2.x2, l1.y1 - l2.y2);
  const q = flip ? [{ x: l2.x2, y: l2.y2 }, { x: l2.x1, y: l2.y1 }] : [{ x: l2.x1, y: l2.y1 }, { x: l2.x2, y: l2.y2 }];
  const m = [mid(p[0], q[0]), mid(p[1], q[1])];
  const scale = (pt, c) => ({ x: c.x + (pt.x - c.x) * k, y: c.y + (pt.y - c.y) * k });
  return [{ x1: scale(p[0], m[0]).x, y1: scale(p[0], m[0]).y, x2: scale(p[1], m[1]).x, y2: scale(p[1], m[1]).y }, { x1: scale(q[0], m[0]).x, y1: scale(q[0], m[0]).y, x2: scale(q[1], m[1]).x, y2: scale(q[1], m[1]).y }];
}
export const threadBottom = (c, { hole = false, ratio = 0.85 } = {}) => ({ cx: c.cx, cy: c.cy, r: hole ? c.r / ratio : c.r * ratio, start: 0, end: 270 });

// ───────────────────────── symbols

/** TechDraw_SurfaceFinishSymbols: the ISO 1302 tick (removal of material required), its roughness text, at a point. */
export function surfaceFinish(at, { text = 'Ra 3.2', size = 3.5, removal = 'required' } = {}) {
  const h = size * 1.4;
  const left = { x: at.x - h * 0.6, y: at.y + h }; const right = { x: at.x + h * 1.6, y: at.y + h * 2 };
  const out = [{ type: 'polyline', points: [left, at, right], closed: false }];
  if (removal === 'required') out.push({ type: 'line', x1: left.x, y1: left.y, x2: at.x + h * 0.6, y2: left.y });
  if (removal === 'prohibited') out.push({ type: 'circle', cx: at.x, cy: at.y + h * 0.45, r: h * 0.35 });
  out.push({ type: 'line', x1: right.x, y1: right.y, x2: right.x + h * 2.5, y2: right.y });
  out.push({ type: 'text', x: at.x + h * 0.9, y: at.y + h * 2 + size * 0.4, text, size });
  return out;
}

/** TechDraw_WeldSymbol: an arrow line, the reference line, the weld sign (fillet, V, square), its size, all-round circle and field flag. */
export function weldSymbol(tip, elbow, { kind = 'fillet', size = '5', allAround = false, field = false, textHeight = 3.5, otherSide = false } = {}) {
  const L = textHeight * 8;
  const end = { x: elbow.x + L, y: elbow.y };
  const out = [{ type: 'leader', points: [tip, elbow, end], text: '', size: textHeight }];
  const s = textHeight * 1.2; const x = elbow.x + L * 0.45; const y = elbow.y; const dir = otherSide ? 1 : -1;
  if (kind === 'fillet') out.push({ type: 'polyline', points: [{ x, y }, { x, y: y + dir * s }, { x: x + s, y }], closed: false });
  else if (kind === 'v') out.push({ type: 'polyline', points: [{ x: x - s / 2, y: y + dir * s }, { x, y }, { x: x + s / 2, y: y + dir * s }], closed: false });
  else out.push({ type: 'line', x1: x - s / 3, y1: y, x2: x - s / 3, y2: y + dir * s }, { type: 'line', x1: x + s / 3, y1: y, x2: x + s / 3, y2: y + dir * s });
  out.push({ type: 'text', x: x - s * 2.2, y: y + dir * s * 0.8 - (dir > 0 ? 0 : textHeight), text: String(size), size: textHeight });
  if (allAround) out.push({ type: 'circle', cx: elbow.x, cy: elbow.y, r: textHeight * 0.6 });
  if (field) out.push({ type: 'polyline', points: [elbow, { x: elbow.x, y: elbow.y + textHeight * 2.5 }, { x: elbow.x + textHeight * 1.5, y: elbow.y + textHeight * 2 }, { x: elbow.x, y: elbow.y + textHeight * 1.5 }], closed: false });
  return out;
}

// ───────────────────────── page templates and tables

export const PAGE_SIZES = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
/** The title block fields a template carries (TechDraw_FillTemplateFields fills them). */
export const TEMPLATE_FIELDS = ['title', 'author', 'date', 'scale', 'sheet', 'company'];

/**
 * TechDraw_PageTemplate: a landscape page — border, frame, and a title block
 * whose text fields carry their name (`field`), for FillTemplateFields.
 */
export function pageTemplate(size = 'A4', at = { x: 0, y: 0 }, values = {}) {
  const [W, H] = PAGE_SIZES[size] ?? PAGE_SIZES.A4;
  const m = 10; const bw = 180; const bh = 32;
  const x0 = at.x; const y0 = at.y;
  const r = (x, y, w, h) => ({ type: 'rect', x, y, width: w, height: h });
  const out = [r(x0, y0, W, H), r(x0 + m, y0 + m, W - 2 * m, H - 2 * m)];
  const bx = x0 + W - m - bw; const by = y0 + m;
  out.push(r(bx, by, bw, bh), { type: 'line', x1: bx, y1: by + bh / 2, x2: bx + bw, y2: by + bh / 2 }, { type: 'line', x1: bx + bw / 2, y1: by, x2: bx + bw / 2, y2: by + bh / 2 }, { type: 'line', x1: bx + bw * 0.75, y1: by, x2: bx + bw * 0.75, y2: by + bh / 2 });
  const cells = { title: [bx + 3, by + bh / 2 + 5, 6], company: [bx + 3, by + bh - 6, 3], author: [bx + 3, by + 4, 3], date: [bx + bw / 2 + 3, by + 4, 3], scale: [bx + bw * 0.75 + 3, by + 9, 3], sheet: [bx + bw * 0.75 + 3, by + 4, 3] };
  for (const [field, [x, y, s]] of Object.entries(cells)) out.push({ type: 'text', x, y, text: String(values[field] ?? field.toUpperCase()), size: s, field });
  return out;
}

/** TechDraw_SpreadsheetView: the sheet's used cells as a table (lines and texts) with its lower left at `at`. */
export function sheetTable(cells, values, at = { x: 0, y: 0 }, { cellW = 25, cellH = 8, size = 3 } = {}) {
  const names = Object.keys(cells);
  if (!names.length) return [];
  const pos = (n) => { const m = /^([A-Z])(\d+)$/.exec(n); return { c: m[1].charCodeAt(0) - 65, r: Number(m[2]) }; };
  const cols = Math.max(...names.map((n) => pos(n).c)) + 1; const rows = Math.max(...names.map((n) => pos(n).r));
  const out = [];
  const top = at.y + rows * cellH;
  for (let r = 0; r <= rows; r++) out.push({ type: 'line', x1: at.x, y1: top - r * cellH, x2: at.x + cols * cellW, y2: top - r * cellH });
  for (let c = 0; c <= cols; c++) out.push({ type: 'line', x1: at.x + c * cellW, y1: at.y, x2: at.x + c * cellW, y2: top });
  for (const n of names) {
    const { c, r } = pos(n);
    const v = values[n];
    const text = v === undefined ? cells[n] : typeof v === 'object' ? '#ERR' : typeof v === 'number' ? String(Number(v.toFixed(6))) : String(v);
    out.push({ type: 'text', x: at.x + c * cellW + 1.5, y: top - r * cellH + (cellH - size) / 2, text, size });
  }
  return out;
}

/** TechDraw_AreaDimension: the area (mm²) inside a closed outline with its holes. */
export function regionArea(loops) {
  const area = (loop) => loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
  const [outer, ...holes] = loops;
  return Math.abs(area(outer)) - holes.reduce((s, h) => s + Math.abs(area(h)), 0);
}

/** TechDraw_ExtensionArcLengthAnnotation: an arc's length. */
export const arcLength = (e) => (e.r * Math.PI * ((((e.end - e.start) % 360) + 360) % 360 || 360)) / 180;

/** TechDraw_ExtensionExtendLine / ShortenLine: a line longer (or shorter, delta < 0) by delta at each end. */
export function extendLine(l, delta) {
  const L = Math.hypot(l.x2 - l.x1, l.y2 - l.y1) || 1;
  const ux = (l.x2 - l.x1) / L; const uy = (l.y2 - l.y1) / L;
  const d = Math.max(-L / 2 + 1e-6, delta);
  return { x1: l.x1 - ux * d, y1: l.y1 - uy * d, x2: l.x2 + ux * d, y2: l.y2 + uy * d };
}

