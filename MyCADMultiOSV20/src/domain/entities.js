// Drawing entities. Each entity is plain JSON data (saved as is in .mcad
// files). Everything that needs geometry — drawing, hit tests, boxes, snaps,
// export, printing — works on the primitives an entity expands to:
//   line { a, b } · poly { points, closed } · circle { c, r } · arc { c, r, start, end }
//   text { p, text, size, angle, align, font, bold, italic } · fill { points } (arrow heads)
// Primitives may carry `lineType` ('center', 'hidden', …) and `thin`.
import {
  add, angleOf, angleOnArc, arcFrom3, arcPoints, bboxOf, boxesOverlap, boxContains, clean, closestOnArc, closestOnCircle, closestOnSegment, cross, deg, dist,
  dot, ellipsePerimeter, ellipsePoints, intersectLines, len, mid, mirrorPoint, mul, norm, normDeg, perp, pointInPolygon, polar, polygonArea,
  polylineLength, rad, rotate, scaleAt, segmentHitsBox, sub, sweep, unionBox,
} from './geometry.js';
import { generatePart, normalizeParams, PARTS } from './parts.js';
import { HATCH_PATTERN_NAMES, hatchArea, hatchPrimitives } from './hatch.js';
import { normalizeClone } from './clones.js';
import { normalizeBind } from './spreadsheet.js';
import { normalizeMaterial } from './materials.js';
import { normalizeAttach } from './partops.js';
import { annotationPrimitives, BALLOON_SHAPES, balloonDot, GDT_MODIFIERS, GDT_SYMBOLS, LEADER_STYLES } from './annotate.js';
import { sampleCurve } from './nurbs.js';
import { displayUnit, toUnit } from './units.js';
import { flattenTriangles, normalizeSolidData, partInParent, solidFootprint, solidMesh, solidProperties } from './solids.js';

export const ENTITY_TYPES = ['line', 'polyline', 'rect', 'circle', 'arc', 'ellipse', 'polygon', 'text', 'dim', 'part', 'solid', 'point', 'spline', 'hatch', 'leader'];
export const DIM_KINDS = ['aligned', 'horizontal', 'vertical', 'radius', 'diameter', 'angle'];
export const LINE_TYPES = ['continuous', 'dashed', 'center', 'hidden', 'phantom', 'dotted'];
export const LINE_WIDTHS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4];
/** Dash patterns in mm (scaled with the drawing). */
export const DASHES = { continuous: [], dashed: [6, 3], center: [12, 3, 2, 3], hidden: [3, 2], phantom: [12, 3, 2, 3, 2, 3], dotted: [0.6, 2] };

let counter = 0;
export function newId(prefix = 'e') {
  counter = (counter + 1) % 1679616;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
const point = (p) => ({ x: finite(p?.x), y: finite(p?.y) });

/** Repairs an entity read from a file; returns null for something unusable. */
export function normalizeEntity(raw) {
  if (!raw || typeof raw !== 'object' || !ENTITY_TYPES.includes(raw.type)) return null;
  const base = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    type: raw.type,
    layer: typeof raw.layer === 'string' ? raw.layer : '0',
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : null,
    lineType: LINE_TYPES.includes(raw.lineType) ? raw.lineType : null,
    lineWidth: Number.isFinite(raw.lineWidth) && raw.lineWidth > 0 ? raw.lineWidth : null,
  };
  // Draft Clone: follows another object (see clones.js).
  const clone = normalizeClone(raw.clone);
  if (clone) base.clone = clone;
  // Sketcher construction geometry: drawn and snapped to, but not part of any output.
  if (raw.construction) base.construction = true;
  // Sketcher: external geometry (projected / intersected from solids) and internal alignment geometry (of an ellipse or B-spline).
  if (raw.external) base.external = true;
  if (typeof raw.internal === 'string' && raw.internal) base.internal = raw.internal;
  // TechDraw: cosmetic geometry (added on the page, not from a view); a template text's field name (FillTemplateFields).
  if (raw.cosmetic) base.cosmetic = true;
  if (raw.type === 'text' && typeof raw.field === 'string' && raw.field) base.field = raw.field.slice(0, 40);
  // Draft_ToggleDisplayMode: a solid shown as wireframe. Assembly_ToggleGrounded: a part joints never move.
  if (raw.type === 'solid' && raw.wireframe) base.wireframe = true;
  if (raw.type === 'solid' && raw.grounded) base.grounded = true;
  // Std_HideSelection, Std_ToggleSelectability, Std_ToggleTransparency / appearance, Std_Group, Std_ToggleFreeze.
  if (raw.hidden) base.hidden = true;
  if (raw.unselectable) base.unselectable = true;
  if (raw.frozen) base.frozen = true;
  if (Number.isFinite(raw.transparency) && raw.transparency > 0) base.transparency = Math.min(100, Math.max(0, Math.round(raw.transparency)));
  if (typeof raw.group === 'string' && raw.group) base.group = raw.group;
  if (Number.isFinite(raw.pointSize) && raw.pointSize > 0) base.pointSize = raw.pointSize;
  // Part_ToleranceSet: the healing / sewing tolerance of a solid (mm).
  if (raw.type === 'solid' && Number.isFinite(raw.tolerance) && raw.tolerance > 0) base.tolerance = Math.min(10, raw.tolerance);
  // Part_EditAttachment: placed from faces, edges or vertices of other solids (and kept there).
  const attach = raw.type === 'solid' ? normalizeAttach(raw.attach) : null;
  if (attach) base.attach = attach;
  // Per-face colours (Part_ColorPerFace): [{ signature, color }].
  if (raw.type === 'solid' && Array.isArray(raw.faceColors)) {
    const faceColors = raw.faceColors.filter((f) => f?.signature && typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color)).slice(0, 500);
    if (faceColors.length) base.faceColors = faceColors;
  }
  // Std_SetMaterial: the physical material (density, modulus …); Std_TextureMapping: an image on a solid.
  const physical = raw.physical ? normalizeMaterial(raw.physical) : null;
  if (physical) base.physical = physical;
  if (raw.texture && typeof raw.texture.data === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(raw.texture.data) && raw.texture.data.length < 6_000_000) {
    base.texture = { data: raw.texture.data, scale: Number.isFinite(raw.texture.scale) && raw.texture.scale > 0 ? raw.texture.scale : 50 };
  }
  // Values bound to spreadsheet expressions (FreeCAD expressions).
  const bind = normalizeBind(raw.bind);
  if (bind) base.bind = bind;
  switch (raw.type) {
    case 'line':
      return { ...base, x1: finite(raw.x1), y1: finite(raw.y1), x2: finite(raw.x2), y2: finite(raw.y2) };
    case 'polyline': {
      const points = Array.isArray(raw.points) ? raw.points.map(point) : [];
      return points.length >= 2 ? { ...base, points, closed: Boolean(raw.closed) } : null;
    }
    case 'rect':
      return { ...base, x: finite(raw.x), y: finite(raw.y), width: positive(raw.width, 1), height: positive(raw.height, 1), angle: finite(raw.angle), radius: Math.max(0, finite(raw.radius)) };
    case 'circle':
      return { ...base, cx: finite(raw.cx), cy: finite(raw.cy), r: positive(raw.r, 1), centerMark: Boolean(raw.centerMark) };
    case 'arc':
      return { ...base, cx: finite(raw.cx), cy: finite(raw.cy), r: positive(raw.r, 1), start: normDeg(finite(raw.start)), end: normDeg(finite(raw.end, 90)) };
    case 'ellipse': {
      // start / end: parameter angles (degrees) of an elliptical arc; 0…360 is the whole ellipse.
      const start = finite(raw.start, 0);
      let end = finite(raw.end, 360);
      if (end <= start) end += 360 * Math.ceil((start - end) / 360 + 1e-12);
      return { ...base, cx: finite(raw.cx), cy: finite(raw.cy), rx: positive(raw.rx, 1), ry: positive(raw.ry, 1), angle: finite(raw.angle), start, end: Math.min(end, start + 360) };
    }
    case 'point':
      return { ...base, x: finite(raw.x), y: finite(raw.y), size: positive(raw.size, 2) };
    case 'spline': {
      const points = Array.isArray(raw.points) ? raw.points.map(point) : [];
      if (points.length < 2) return null;
      const degree = Math.max(1, Math.min(5, Math.round(finite(raw.degree, 3)), points.length - 1));
      const knots = Array.isArray(raw.knots) && raw.knots.length === points.length + degree + 1 && raw.knots.every((k, i, a) => Number.isFinite(Number(k)) && (!i || Number(k) >= Number(a[i - 1]))) ? raw.knots.map(Number) : null;
      const weights = Array.isArray(raw.weights) && raw.weights.length === points.length && raw.weights.every((w) => Number(w) > 0) ? raw.weights.map(Number) : null;
      return { ...base, points, degree, knots, weights, closed: Boolean(raw.closed) };
    }
    case 'hatch': {
      const loops = (Array.isArray(raw.loops) ? raw.loops : []).map((loop) => (Array.isArray(loop) ? loop.map(point) : [])).filter((loop) => loop.length >= 3);
      if (!loops.length) return null;
      return { ...base, loops, pattern: HATCH_PATTERN_NAMES.includes(raw.pattern) ? raw.pattern : 'ansi31', angle: finite(raw.angle), scale: positive(raw.scale, 1) };
    }
    case 'leader': {
      const points = Array.isArray(raw.points) ? raw.points.map(point) : [];
      if (points.length < 2) return null;
      const style = LEADER_STYLES.includes(raw.style) ? raw.style : 'note';
      const out = { ...base, points, text: String(raw.text ?? ''), size: positive(raw.size, 3.5) };
      // Balloons, GD&T frames and datum symbols (TechDraw) are leaders with another head.
      if (style === 'balloon') Object.assign(out, { style, shape: BALLOON_SHAPES.includes(raw.shape) ? raw.shape : 'circle' });
      if (style === 'gdt') Object.assign(out, { style, symbol: GDT_SYMBOLS.includes(raw.symbol) ? raw.symbol : 'position', diameter: Boolean(raw.diameter), modifier: GDT_MODIFIERS.includes(raw.modifier) ? raw.modifier : 'none', datums: String(raw.datums ?? '') });
      if (style === 'datum') Object.assign(out, { style });
      return out;
    }
    case 'polygon':
      return { ...base, cx: finite(raw.cx), cy: finite(raw.cy), r: positive(raw.r, 1), sides: Math.max(3, Math.min(64, Math.round(finite(raw.sides, 6)))), angle: finite(raw.angle, 90) };
    case 'text':
      return {
        ...base, x: finite(raw.x), y: finite(raw.y), text: String(raw.text ?? ''), size: positive(raw.size, 3.5), angle: finite(raw.angle),
        font: typeof raw.font === 'string' ? raw.font : '', bold: Boolean(raw.bold), italic: Boolean(raw.italic), align: ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'left',
      };
    case 'dim':
      return {
        ...base, kind: DIM_KINDS.includes(raw.kind) ? raw.kind : 'aligned',
        x1: finite(raw.x1), y1: finite(raw.y1), x2: finite(raw.x2), y2: finite(raw.y2), ox: finite(raw.ox), oy: finite(raw.oy),
        cx: finite(raw.cx), cy: finite(raw.cy), r: positive(raw.r, 10), angle: finite(raw.angle, 45), start: normDeg(finite(raw.start)), end: normDeg(finite(raw.end, 90)),
        size: positive(raw.size, 3.5), precision: Math.max(0, Math.min(4, Math.round(finite(raw.precision, 1)))), text: String(raw.text ?? ''),
      };
    case 'part': {
      if (!PARTS[raw.kind]) return null;
      return { ...base, kind: raw.kind, x: finite(raw.x), y: finite(raw.y), angle: finite(raw.angle), scale: positive(raw.scale, 1), flip: Boolean(raw.flip), params: normalizeParams(raw.kind, raw.params) };
    }
    case 'solid': {
      const data = normalizeSolidData(raw);
      if (!data) return null;
      const { color, ...rest } = data;
      return { ...base, ...rest };
    }
    default:
      return null;
  }
}

/** A new entity of `type` with `data` (missing fields get defaults). */
export function createEntity(type, data = {}) {
  const entity = normalizeEntity({ ...data, type, id: data.id ?? newId() });
  if (!entity) throw new Error(`invalid ${type}`);
  return entity;
}

// ───────────────────────── text measuring (approximate, font independent)

const WIDE = /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/** Approximate width of a line of text at height `size`. */
export function textWidth(text, size) {
  let width = 0;
  for (const ch of String(text)) width += WIDE.test(ch) ? size : ch === ' ' ? size * 0.35 : /[il.,:;'|!]/.test(ch) ? size * 0.3 : /[A-Z0-9mwMW%@]/.test(ch) ? size * 0.68 : size * 0.56;
  return width;
}

export const LINE_GAP = 1.5;

/**
 * Local y of the first line's baseline relative to the insertion point
 * (y up). Normal texts sit on it; vertically centred texts (dimension values)
 * put the middle of their block on it.
 */
export function firstBaseline(prim) {
  const lines = String(prim.text).split('\n').length;
  return prim.valign === 'middle' ? ((lines - 1) * LINE_GAP * prim.size) / 2 - 0.35 * prim.size : 0;
}

/** Corners of a text primitive's box (rotated), for hit tests and boxes. */
export function textCorners(prim, pad = 0) {
  const lines = String(prim.text).split('\n');
  const width = Math.max(prim.size * 0.3, ...lines.map((line) => textWidth(line, prim.size)));
  const baseline = firstBaseline(prim);
  const top = baseline + prim.size * 0.8;
  const bottom = baseline - (lines.length - 1) * LINE_GAP * prim.size - prim.size * 0.25;
  const left = (prim.align === 'center' ? -width / 2 : prim.align === 'right' ? -width : 0) - prim.size * 0.05;
  const right = left + width + prim.size * 0.1;
  return [{ x: left - pad, y: bottom - pad }, { x: right + pad, y: bottom - pad }, { x: right + pad, y: top + pad }, { x: left - pad, y: top + pad }]
    .map((corner) => rotate(add(prim.p, corner), prim.p, prim.angle));
}

// ───────────────────────── outlines

export function rectCorners(e) {
  const o = { x: e.x, y: e.y };
  return [o, { x: e.x + e.width, y: e.y }, { x: e.x + e.width, y: e.y + e.height }, { x: e.x, y: e.y + e.height }].map((p) => rotate(p, o, e.angle));
}

export function rectOutline(e) {
  const r = Math.min(e.radius ?? 0, e.width / 2, e.height / 2);
  if (r <= 1e-9) return rectCorners(e);
  const o = { x: e.x, y: e.y };
  const { x, y, width: w, height: h } = e;
  const points = [
    ...arcPoints(x + w - r, y + r, r, 270, 360, 10), ...arcPoints(x + w - r, y + h - r, r, 0, 90, 10),
    ...arcPoints(x + r, y + h - r, r, 90, 180, 10), ...arcPoints(x + r, y + r, r, 180, 270, 10),
  ];
  return points.map((p) => rotate(p, o, e.angle));
}

export const polygonPoints = (e) => Array.from({ length: e.sides }, (_, i) => polar({ x: e.cx, y: e.cy }, e.r, e.angle + (i * 360) / e.sides));

// ───────────────────────── dimensions

export function formatNumber(value, precision = 1) {
  const fixed = clean(value, 8).toFixed(precision);
  return precision > 0 ? fixed.replace(/\.?0+$/, '') || '0' : fixed;
}

/** Measured value of a dimension (mm, or degrees for angles). */
export function dimValue(e) {
  switch (e.kind) {
    case 'horizontal': return Math.abs(e.x2 - e.x1);
    case 'vertical': return Math.abs(e.y2 - e.y1);
    case 'radius': return e.r;
    case 'diameter': return e.r * 2;
    case 'angle': return sweep(e.start, e.end) % 360 || 360;
    default: return dist({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 });
  }
}

/** Dimension text; lengths are shown in the display unit (inches and feet with their marks). */
export function dimText(e, unit = displayUnit()) {
  const raw = dimValue(e);
  let value = formatNumber(e.kind === 'angle' ? raw : toUnit(raw, unit), e.precision);
  if (e.kind !== 'angle') value += unit === 'in' ? '"' : unit === 'ft' ? "'" : '';
  const auto = e.kind === 'radius' ? `R${value}` : e.kind === 'diameter' ? `Ø${value}` : e.kind === 'angle' ? `${value}°` : value;
  if (!e.text) return auto;
  return e.text.includes('<>') ? e.text.replace(/<>/g, auto) : e.text;
}

/** Text direction that reads left-to-right or bottom-to-top. */
function readableAngle(angle) {
  const a = normDeg(angle);
  return a > 90 + 1e-6 && a <= 270 + 1e-6 ? normDeg(a - 180) : a;
}

function arrow(tip, direction, size) {
  const d = norm(direction);
  const n = perp(d);
  const back = sub(tip, mul(d, size));
  return { kind: 'fill', points: [tip, add(back, mul(n, size / 6)), sub(back, mul(n, size / 6))] };
}

function dimPrimitives(e) {
  const h = e.size;
  const arrowSize = h;
  const text = dimText(e);
  const prims = [];
  const label = (p, angle, extra = {}) => ({ kind: 'text', p, text, size: h, angle, align: 'center', valign: 'middle', dim: true, ...extra });
  if (e.kind === 'radius' || e.kind === 'diameter') {
    const c = { x: e.cx, y: e.cy };
    const dir = { x: Math.cos(rad(e.angle)), y: Math.sin(rad(e.angle)) };
    const edge = add(c, mul(dir, e.r));
    if (e.kind === 'radius') {
      prims.push({ kind: 'line', a: c, b: edge }, arrow(edge, dir, arrowSize));
      const landing = add(edge, mul(dir, h * 1.2));
      const width = textWidth(text, h);
      const side = dir.x >= 0 ? 1 : -1;
      const end = add(landing, { x: side * (width + h * 0.6), y: 0 });
      prims.push({ kind: 'line', a: edge, b: landing }, { kind: 'line', a: landing, b: end });
      prims.push({ kind: 'text', p: { x: (landing.x + end.x) / 2, y: landing.y + h * 0.75 }, text, size: h, angle: 0, align: 'center', valign: 'middle', dim: true });
    } else {
      const other = sub(c, mul(dir, e.r));
      prims.push({ kind: 'line', a: other, b: edge }, arrow(edge, dir, arrowSize), arrow(other, mul(dir, -1), arrowSize));
      const angle = readableAngle(e.angle);
      const up = { x: -Math.sin(rad(angle)), y: Math.cos(rad(angle)) };
      prims.push(label(add(c, mul(up, h * 0.8)), angle));
    }
    return prims;
  }
  if (e.kind === 'angle') {
    const c = { x: e.cx, y: e.cy };
    const r = e.r;
    prims.push({ kind: 'arc', c, r, start: e.start, end: e.end });
    const a = polar(c, r, e.start);
    const b = polar(c, r, e.end);
    prims.push({ kind: 'line', a: c, b: polar(c, r + h * 0.6, e.start) }, { kind: 'line', a: c, b: polar(c, r + h * 0.6, e.end) });
    prims.push(arrow(a, { x: Math.sin(rad(e.start)), y: -Math.cos(rad(e.start)) }, arrowSize), arrow(b, { x: -Math.sin(rad(e.end)), y: Math.cos(rad(e.end)) }, arrowSize));
    const middle = e.start + sweep(e.start, e.end) / 2;
    prims.push(label(polar(c, r + h * 0.9, middle), readableAngle(middle - 90)));
    return prims;
  }
  const p1 = { x: e.x1, y: e.y1 };
  const p2 = { x: e.x2, y: e.y2 };
  const o = { x: e.ox, y: e.oy };
  let A;
  let B;
  if (e.kind === 'horizontal') { A = { x: p1.x, y: o.y }; B = { x: p2.x, y: o.y }; }
  else if (e.kind === 'vertical') { A = { x: o.x, y: p1.y }; B = { x: o.x, y: p2.y }; }
  else {
    const n = perp(norm(sub(p2, p1)));
    const offset = dot(sub(o, p1), n);
    A = add(p1, mul(n, offset));
    B = add(p2, mul(n, offset));
  }
  const gap = h * 0.25;
  const over = h * 0.5;
  for (const [from, to] of [[p1, A], [p2, B]]) {
    const d = sub(to, from);
    const length = len(d);
    if (length > gap) {
      const u = norm(d);
      prims.push({ kind: 'line', a: add(from, mul(u, gap)), b: add(to, mul(u, over)) });
    }
  }
  const along = sub(B, A);
  if (len(along) > 1e-9) {
    const u = norm(along);
    prims.push({ kind: 'line', a: A, b: B });
    if (len(along) > arrowSize * 2.2) prims.push(arrow(A, mul(u, -1), arrowSize), arrow(B, u, arrowSize));
    else {
      // Too short: arrows outside, pointing in.
      prims.push(arrow(A, u, arrowSize), arrow(B, mul(u, -1), arrowSize), { kind: 'line', a: sub(A, mul(u, arrowSize * 2)), b: A }, { kind: 'line', a: B, b: add(B, mul(u, arrowSize * 2)) });
    }
    const angle = readableAngle(deg(Math.atan2(u.y, u.x)));
    const up = { x: -Math.sin(rad(angle)), y: Math.cos(rad(angle)) };
    prims.push(label(add(mid(A, B), mul(up, h * 0.95)), angle));
  }
  return prims;
}

// ───────────────────────── primitives

function partTransform(e) {
  const origin = { x: e.x, y: e.y };
  const s = e.scale ?? 1;
  return (p) => rotate(add(origin, { x: p.x * s, y: (e.flip ? -p.y : p.y) * s }), origin, e.angle);
}

function transformPrimitive(prim, map, angleDelta, flip, factor) {
  switch (prim.kind) {
    case 'line': return { ...prim, a: map(prim.a), b: map(prim.b) };
    case 'poly': return { ...prim, points: prim.points.map(map) };
    case 'fill': return { ...prim, points: prim.points.map(map) };
    case 'circle': return { ...prim, c: map(prim.c), r: prim.r * factor };
    case 'arc': {
      const [start, end] = flip ? [-prim.end, -prim.start] : [prim.start, prim.end];
      return { ...prim, c: map(prim.c), r: prim.r * factor, start: normDeg(start + angleDelta), end: normDeg(end + angleDelta) };
    }
    default: return prim;
  }
}

export const isFullEllipse = (e) => Math.abs((e.end ?? 360) - (e.start ?? 0)) >= 360 - 1e-9;

/** Points along an elliptical arc (parameter angles start…end, degrees). */
export function ellipseArcPoints(e, step = 3.75) {
  const c = Math.cos(rad(e.angle));
  const s = Math.sin(rad(e.angle));
  const n = Math.max(2, Math.ceil((e.end - e.start) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = rad(e.start + ((e.end - e.start) * i) / n);
    const x = e.rx * Math.cos(t);
    const y = e.ry * Math.sin(t);
    return { x: e.cx + x * c - y * s, y: e.cy + x * s + y * c };
  });
}

/** Points along a spline (NURBS through its control points). */
export function splinePoints(e) {
  return sampleCurve({ degree: e.degree, points: e.points.map((p) => [p.x, p.y]), knots: e.knots, weights: e.weights }).map(([x, y]) => ({ x, y }));
}

/** The primitives an entity draws, in drawing coordinates. */
export function primitives(e) {
  switch (e.type) {
    case 'line': return [{ kind: 'line', a: { x: e.x1, y: e.y1 }, b: { x: e.x2, y: e.y2 } }];
    case 'polyline': return [{ kind: 'poly', points: e.points, closed: e.closed }];
    case 'rect': return [{ kind: 'poly', points: rectOutline(e), closed: true }];
    case 'circle': {
      const prims = [{ kind: 'circle', c: { x: e.cx, y: e.cy }, r: e.r }];
      if (e.centerMark) {
        const m = e.r * 1.15;
        prims.push({ kind: 'line', a: { x: e.cx - m, y: e.cy }, b: { x: e.cx + m, y: e.cy }, lineType: 'center' }, { kind: 'line', a: { x: e.cx, y: e.cy - m }, b: { x: e.cx, y: e.cy + m }, lineType: 'center' });
      }
      return prims;
    }
    case 'arc': return [{ kind: 'arc', c: { x: e.cx, y: e.cy }, r: e.r, start: e.start, end: e.end }];
    case 'ellipse': {
      if (isFullEllipse(e)) return [{ kind: 'poly', points: ellipsePoints(e.cx, e.cy, e.rx, e.ry, e.angle), closed: true, ellipse: true }];
      return [{ kind: 'poly', points: ellipseArcPoints(e), closed: false, ellipse: true }];
    }
    case 'point': {
      const s = e.size / 2;
      return [
        { kind: 'line', a: { x: e.x - s, y: e.y }, b: { x: e.x + s, y: e.y }, point: true },
        { kind: 'line', a: { x: e.x, y: e.y - s }, b: { x: e.x, y: e.y + s }, point: true },
        { kind: 'circle', c: { x: e.x, y: e.y }, r: s * 0.4, point: true },
      ];
    }
    case 'spline': return [{ kind: 'poly', points: splinePoints(e), closed: e.closed, spline: true }];
    case 'hatch': return hatchPrimitives(e.loops, e.pattern, e.angle, e.scale);
    case 'leader': {
      const pts = e.points;
      const end = pts[pts.length - 1];
      const before = pts[pts.length - 2];
      const right = end.x >= before.x;
      if (e.style && e.style !== 'note') {
        const tip = e.style === 'balloon' ? balloonDot(e) : e.style === 'gdt' ? arrow(pts[0], norm(sub(pts[0], pts[1])), e.size) : null;
        return [{ kind: 'poly', points: pts, closed: false }, ...(tip ? [tip] : []), ...annotationPrimitives(e)];
      }
      const prims = [{ kind: 'poly', points: pts, closed: false }, arrow(pts[0], norm(sub(pts[0], pts[1])), e.size)];
      if (e.text) prims.push({ kind: 'text', p: { x: end.x + (right ? 1 : -1) * e.size * 0.5, y: end.y }, text: e.text, size: e.size, angle: 0, align: right ? 'left' : 'right', valign: 'middle' });
      return prims;
    }
    case 'polygon': return [{ kind: 'poly', points: polygonPoints(e), closed: true }];
    case 'text': return [{ kind: 'text', p: { x: e.x, y: e.y }, text: e.text, size: e.size, angle: e.angle, align: e.align, font: e.font, bold: e.bold, italic: e.italic }];
    case 'dim': return dimPrimitives(e);
    case 'part': {
      const map = partTransform(e);
      const factor = e.scale ?? 1;
      const angleDelta = e.angle;
      return generatePart(e.kind, e.params).map((prim) => transformPrimitive(prim, map, angleDelta, e.flip, factor));
    }
    case 'solid': return solidFootprint(e);
    default: return [];
  }
}

// ───────────────────────── boxes & hit tests

export function primitiveBox(prim) {
  switch (prim.kind) {
    case 'line': return bboxOf([prim.a, prim.b]);
    case 'poly': case 'fill': return bboxOf(prim.points);
    case 'circle': return { minX: prim.c.x - prim.r, minY: prim.c.y - prim.r, maxX: prim.c.x + prim.r, maxY: prim.c.y + prim.r };
    case 'arc': {
      const points = [polar(prim.c, prim.r, prim.start), polar(prim.c, prim.r, prim.end)];
      for (const quadrant of [0, 90, 180, 270]) if (angleOnArc(quadrant, prim.start, prim.end)) points.push(polar(prim.c, prim.r, quadrant));
      return bboxOf(points);
    }
    case 'text': return bboxOf(textCorners(prim));
    default: return null;
  }
}

export function entityBox(e) {
  return primitives(e).reduce((box, prim) => unionBox(box, primitiveBox(prim)), null);
}

export function boxOfEntities(list) {
  return list.reduce((box, e) => unionBox(box, entityBox(e)), null);
}

/** Distance from p to a primitive's outline (0 inside filled shapes and text). */
export function primitiveDistance(prim, p) {
  switch (prim.kind) {
    case 'line': return dist(p, closestOnSegment(p, prim.a, prim.b).point);
    case 'poly': {
      let best = Infinity;
      const pts = prim.points;
      const count = prim.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < count; i++) best = Math.min(best, dist(p, closestOnSegment(p, pts[i], pts[(i + 1) % pts.length]).point));
      return best;
    }
    case 'circle': return Math.abs(dist(p, prim.c) - prim.r);
    case 'arc': return dist(p, closestOnArc(p, prim.c, prim.r, prim.start, prim.end));
    case 'fill': return pointInPolygon(p, prim.points) ? 0 : Math.min(...prim.points.map((q, i) => dist(p, closestOnSegment(p, q, prim.points[(i + 1) % prim.points.length]).point)));
    case 'text': {
      const corners = textCorners(prim);
      return pointInPolygon(p, corners) ? 0 : Math.min(...corners.map((q, i) => dist(p, closestOnSegment(p, q, corners[(i + 1) % 4]).point)));
    }
    default: return Infinity;
  }
}

export function entityDistance(e, p) {
  let best = Infinity;
  for (const prim of primitives(e)) best = Math.min(best, primitiveDistance(prim, p));
  return best;
}

export const hitTest = (e, p, tolerance) => entityDistance(e, p) <= tolerance;

function primitiveSegments(prim) {
  switch (prim.kind) {
    case 'line': return [[prim.a, prim.b]];
    case 'poly': case 'fill': {
      const pts = prim.points;
      const closed = prim.kind === 'fill' || prim.closed;
      const out = [];
      for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) out.push([pts[i], pts[(i + 1) % pts.length]]);
      return out;
    }
    case 'circle': {
      const pts = arcPoints(prim.c.x, prim.c.y, prim.r, 0, 360, 6);
      return pts.slice(1).map((q, i) => [pts[i], q]);
    }
    case 'arc': {
      const pts = arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, 6);
      return pts.slice(1).map((q, i) => [pts[i], q]);
    }
    case 'text': {
      const c = textCorners(prim);
      return c.map((q, i) => [q, c[(i + 1) % 4]]);
    }
    default: return [];
  }
}

/**
 * Box selection. `crossing` (drawn right-to-left): anything touching the box;
 * otherwise (window, left-to-right) only entities entirely inside it.
 */
export function inBox(e, box, crossing) {
  const ebox = entityBox(e);
  if (!ebox) return false;
  if (boxContains(box, ebox)) return true;
  if (!crossing || !boxesOverlap(box, ebox)) return false;
  return primitives(e).some((prim) => primitiveSegments(prim).some(([a, b]) => segmentHitsBox(a, b, box))
    || ((prim.kind === 'text' || prim.kind === 'fill') && pointInPolygon({ x: box.minX, y: box.minY }, prim.kind === 'text' ? textCorners(prim) : prim.points)));
}

// ───────────────────────── transforms

/**
 * Applies a transform to an entity and returns the moved copy.
 * op: { type: 'move', dx, dy } | { type: 'rotate', cx, cy, angle } | { type: 'scale', cx, cy, factor } | { type: 'mirror', a, b }
 */
export function transformEntity(e, op) {
  const c = { x: op.cx ?? 0, y: op.cy ?? 0 };
  const map = op.type === 'move' ? (p) => ({ x: p.x + op.dx, y: p.y + op.dy })
    : op.type === 'rotate' ? (p) => rotate(p, c, op.angle)
      : op.type === 'scale' ? (p) => scaleAt(p, c, op.factor)
        : (p) => mirrorPoint(p, op.a, op.b);
  const turn = op.type === 'rotate' ? op.angle : 0;
  const factor = op.type === 'scale' ? op.factor : 1;
  const axis = op.type === 'mirror' ? angleOf(op.a, op.b) : 0;
  const reflect = (angle) => normDeg(2 * axis - angle);
  const out = structuredClone(e);
  const mapXY = (xKey, yKey) => {
    const q = map({ x: e[xKey], y: e[yKey] });
    out[xKey] = q.x;
    out[yKey] = q.y;
  };
  switch (e.type) {
    case 'line': mapXY('x1', 'y1'); mapXY('x2', 'y2'); break;
    case 'polyline': out.points = e.points.map(map); break;
    case 'rect': {
      if (op.type === 'mirror') {
        const o = { x: e.x, y: e.y };
        const u = { x: Math.cos(rad(e.angle)), y: Math.sin(rad(e.angle)) };
        const v = perp(u);
        const o2 = map(o);
        const u2 = sub(map(add(o, u)), o2);
        const v2 = sub(map(add(o, v)), o2);
        const corner = add(o2, mul(v2, e.height));
        out.x = corner.x;
        out.y = corner.y;
        out.angle = normDeg(deg(Math.atan2(u2.y, u2.x)));
      } else {
        mapXY('x', 'y');
        out.angle = normDeg(e.angle + turn);
        out.width = e.width * factor;
        out.height = e.height * factor;
        out.radius = (e.radius ?? 0) * factor;
      }
      break;
    }
    case 'circle': mapXY('cx', 'cy'); out.r = e.r * factor; break;
    case 'arc':
      mapXY('cx', 'cy');
      out.r = e.r * factor;
      if (op.type === 'mirror') { out.start = reflect(e.end); out.end = reflect(e.start); }
      else { out.start = normDeg(e.start + turn); out.end = normDeg(e.end + turn); }
      break;
    case 'ellipse':
      mapXY('cx', 'cy');
      out.rx = e.rx * factor;
      out.ry = e.ry * factor;
      out.angle = op.type === 'mirror' ? reflect(e.angle) : normDeg(e.angle + turn);
      // A mirrored arc runs the other way round its (reflected) axis.
      if (op.type === 'mirror' && !isFullEllipse(e)) { out.start = -e.end; out.end = -e.start; }
      break;
    case 'point':
      mapXY('x', 'y');
      break;
    case 'spline':
      out.points = e.points.map(map);
      break;
    case 'leader':
      out.points = e.points.map(map);
      if (op.type === 'scale') out.size = e.size * factor;
      break;
    case 'hatch':
      out.loops = e.loops.map((loop) => loop.map(map));
      out.scale = e.scale * factor;
      out.angle = op.type === 'mirror' ? reflect(e.angle) : normDeg(e.angle + turn);
      break;
    case 'polygon':
      mapXY('cx', 'cy');
      out.r = e.r * factor;
      out.angle = op.type === 'mirror' ? reflect(e.angle) : normDeg(e.angle + turn);
      break;
    case 'text':
      mapXY('x', 'y');
      out.size = e.size * factor;
      if (op.type !== 'mirror') out.angle = normDeg(e.angle + turn);
      break;
    case 'dim':
      mapXY('x1', 'y1'); mapXY('x2', 'y2'); mapXY('ox', 'oy'); mapXY('cx', 'cy');
      out.r = e.r * factor;
      if (op.type === 'scale') out.size = e.size * factor;
      if (op.type === 'mirror') {
        out.angle = reflect(e.angle);
        out.start = reflect(e.end);
        out.end = reflect(e.start);
      } else if (op.type === 'rotate') {
        out.angle = normDeg(e.angle + turn);
        out.start = normDeg(e.start + turn);
        out.end = normDeg(e.end + turn);
        // Horizontal/vertical dimensions stay horizontal/vertical only for quarter turns.
        if ((e.kind === 'horizontal' || e.kind === 'vertical') && Math.abs(normDeg(turn) % 90) > 1e-6) out.kind = 'aligned';
        else if ((e.kind === 'horizontal' || e.kind === 'vertical') && Math.round(normDeg(turn) / 90) % 2 === 1) out.kind = e.kind === 'horizontal' ? 'vertical' : 'horizontal';
      }
      break;
    case 'part':
      mapXY('x', 'y');
      out.scale = (e.scale ?? 1) * factor;
      if (op.type === 'mirror') { out.flip = !e.flip; out.angle = reflect(e.angle); }
      else out.angle = normDeg(e.angle + turn);
      break;
    case 'solid':
      mapXY('x', 'y');
      if (op.type === 'scale') { out.scale = (e.scale ?? 1) * factor; out.z = e.z * factor; }
      if (op.type === 'rotate') out.rz = normDeg(e.rz + turn);
      if (op.type === 'mirror') {
        if (!(e.rx % 360) && !(e.ry % 360)) {
          // Reflection about a line at `axis` = rotation by 2·axis after a mirror in y.
          out.flip = !e.flip;
          out.rz = normDeg(2 * axis - e.rz);
        } else {
          // A tilted solid: bake the mirrored mesh.
          const mirrored = solidMesh(e).map((tri) => tri.map(([x, y, z]) => { const q = map({ x, y }); return [q.x, q.y, z]; }).reverse());
          Object.assign(out, { kind: 'mesh', params: {}, shape: { tris: flattenTriangles(mirrored) }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false });
        }
      }
      break;
    default: break;
  }
  return out;
}

// ───────────────────────── grips (editable handles)

/** Handles shown on a selected entity: [{ id, x, y }]. */
export function grips(e) {
  const g = (id, p) => ({ id, x: p.x, y: p.y });
  // A clone takes its shape from its source: no handles to reshape it.
  if (e.clone) return [];
  switch (e.type) {
    case 'line': return [g('p1', { x: e.x1, y: e.y1 }), g('p2', { x: e.x2, y: e.y2 }), g('mid', mid({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }))];
    case 'polyline': return e.points.map((p, i) => g(`v${i}`, p));
    case 'rect': return [...rectCorners(e).map((p, i) => g(`c${i}`, p)), g('center', mid(rectCorners(e)[0], rectCorners(e)[2]))];
    case 'circle': return [g('center', { x: e.cx, y: e.cy }), ...[0, 90, 180, 270].map((a) => g(`q${a}`, polar({ x: e.cx, y: e.cy }, e.r, a)))];
    case 'arc': {
      const c = { x: e.cx, y: e.cy };
      return [g('center', c), g('start', polar(c, e.r, e.start)), g('end', polar(c, e.r, e.end)), g('mid', polar(c, e.r, e.start + sweep(e.start, e.end) / 2))];
    }
    case 'ellipse': {
      const c = { x: e.cx, y: e.cy };
      return [g('center', c), g('rx', polar(c, e.rx, e.angle)), g('ry', polar(c, e.ry, e.angle + 90))];
    }
    case 'polygon': return [g('center', { x: e.cx, y: e.cy }), g('vertex', polar({ x: e.cx, y: e.cy }, e.r, e.angle))];
    case 'text': return [g('insert', { x: e.x, y: e.y })];
    case 'dim':
      if (e.kind === 'radius' || e.kind === 'diameter') return [g('center', { x: e.cx, y: e.cy }), g('leader', polar({ x: e.cx, y: e.cy }, e.r, e.angle))];
      if (e.kind === 'angle') return [g('center', { x: e.cx, y: e.cy }), g('start', polar({ x: e.cx, y: e.cy }, e.r, e.start)), g('end', polar({ x: e.cx, y: e.cy }, e.r, e.end))];
      return [g('p1', { x: e.x1, y: e.y1 }), g('p2', { x: e.x2, y: e.y2 }), g('line', { x: e.ox, y: e.oy })];
    case 'part': return [g('insert', { x: e.x, y: e.y })];
    case 'solid': return [g('insert', { x: e.x, y: e.y })];
    case 'point': return [g('insert', { x: e.x, y: e.y })];
    case 'spline': case 'leader': return e.points.map((p, i) => g(`v${i}`, p));
    default: return [];
  }
}

/** The entity with grip `id` moved to point p. */
export function moveGrip(e, id, p) {
  const out = structuredClone(e);
  const c = { x: e.cx, y: e.cy };
  const moveBy = (from) => transformEntity(e, { type: 'move', dx: p.x - from.x, dy: p.y - from.y });
  switch (e.type) {
    case 'line':
      if (id === 'p1') { out.x1 = p.x; out.y1 = p.y; }
      else if (id === 'p2') { out.x2 = p.x; out.y2 = p.y; }
      else return moveBy(mid({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }));
      return out;
    case 'polyline': case 'spline': case 'leader': {
      const index = Number(id.slice(1));
      if (out.points[index]) out.points[index] = { x: p.x, y: p.y };
      return out;
    }
    case 'point': out.x = p.x; out.y = p.y; return out;
    case 'rect': {
      if (id === 'center') return moveBy(mid(rectCorners(e)[0], rectCorners(e)[2]));
      const index = Number(id.slice(1));
      const o = { x: e.x, y: e.y };
      const local = sub(rotate(p, o, -e.angle), o);
      const corners = [{ x: 0, y: 0 }, { x: e.width, y: 0 }, { x: e.width, y: e.height }, { x: 0, y: e.height }];
      const opposite = corners[(index + 2) % 4];
      const minX = Math.min(local.x, opposite.x);
      const minY = Math.min(local.y, opposite.y);
      out.width = Math.max(1e-3, Math.abs(local.x - opposite.x));
      out.height = Math.max(1e-3, Math.abs(local.y - opposite.y));
      const corner = rotate(add(o, { x: minX, y: minY }), o, e.angle);
      out.x = corner.x;
      out.y = corner.y;
      return out;
    }
    case 'circle':
      if (id === 'center') { out.cx = p.x; out.cy = p.y; }
      else out.r = Math.max(1e-3, dist(c, p));
      return out;
    case 'arc':
      if (id === 'center') { out.cx = p.x; out.cy = p.y; }
      else if (id === 'start') { out.start = angleOf(c, p); out.r = Math.max(1e-3, dist(c, p)); }
      else if (id === 'end') { out.end = angleOf(c, p); out.r = Math.max(1e-3, dist(c, p)); }
      else {
        const arc = arcFrom3(polar(c, e.r, e.start), p, polar(c, e.r, e.end));
        if (arc) Object.assign(out, arc);
      }
      return out;
    case 'ellipse':
      if (id === 'center') { out.cx = p.x; out.cy = p.y; }
      else if (id === 'rx') { out.rx = Math.max(1e-3, dist(c, p)); out.angle = angleOf(c, p); }
      else out.ry = Math.max(1e-3, dist(c, p));
      return out;
    case 'polygon':
      if (id === 'center') { out.cx = p.x; out.cy = p.y; }
      else { out.r = Math.max(1e-3, dist(c, p)); out.angle = angleOf(c, p); }
      return out;
    case 'text': out.x = p.x; out.y = p.y; return out;
    case 'part': out.x = p.x; out.y = p.y; return out;
    case 'solid': out.x = p.x; out.y = p.y; return out;
    case 'dim':
      if (id === 'p1') { out.x1 = p.x; out.y1 = p.y; }
      else if (id === 'p2') { out.x2 = p.x; out.y2 = p.y; }
      else if (id === 'line') { out.ox = p.x; out.oy = p.y; }
      else if (id === 'center') { out.cx = p.x; out.cy = p.y; }
      else if (id === 'leader') out.angle = angleOf(c, p);
      else if (id === 'start') { out.start = angleOf(c, p); out.r = Math.max(1e-3, dist(c, p)); }
      else if (id === 'end') { out.end = angleOf(c, p); out.r = Math.max(1e-3, dist(c, p)); }
      return out;
    default: return out;
  }
}

// ───────────────────────── offset

/** Offset of a polyline: positive distance = left of the direction of travel. */
export function offsetPoints(points, closed, distance) {
  const n = points.length;
  const segments = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const normal = perp(norm(sub(b, a)));
    segments.push([add(a, mul(normal, distance)), add(b, mul(normal, distance))]);
  }
  if (!segments.length) return points;
  const out = [];
  for (let i = 0; i < n; i++) {
    const before = closed ? segments[(i - 1 + segments.length) % segments.length] : segments[i - 1];
    const after = segments[i] ?? null;
    if (before && after) out.push(intersectLines(before[0], before[1], after[0], after[1], true) ?? after[0]);
    else if (after) out.push(after[0]);
    else out.push(before[1]);
  }
  return out;
}

/** Copy of `e` offset by `distance` towards `side` (a point), or null if it cannot be offset. */
export function offsetEntity(e, distance, side) {
  const d = Math.abs(distance);
  if (!(d > 0)) return null;
  const copy = { ...structuredClone(e), id: newId() };
  switch (e.type) {
    case 'line': {
      const a = { x: e.x1, y: e.y1 };
      const b = { x: e.x2, y: e.y2 };
      const n = perp(norm(sub(b, a)));
      const sign = cross(sub(b, a), sub(side, a)) >= 0 ? 1 : -1;
      return { ...copy, x1: a.x + n.x * d * sign, y1: a.y + n.y * d * sign, x2: b.x + n.x * d * sign, y2: b.y + n.y * d * sign };
    }
    case 'circle': case 'arc': {
      const outward = dist(side, { x: e.cx, y: e.cy }) > e.r;
      const r = outward ? e.r + d : e.r - d;
      return r > 1e-9 ? { ...copy, r } : null;
    }
    case 'polygon': case 'rect': case 'polyline': case 'ellipse': {
      const pts = e.type === 'polyline' ? e.points : primitives(e)[0].points;
      const closed = e.type === 'polyline' ? e.closed : true;
      let sign;
      if (closed) {
        const ccw = polygonArea(pts) > 0;
        const inside = pointInPolygon(side, pts);
        sign = (ccw ? 1 : -1) * (inside ? 1 : -1);
      } else {
        let best = Infinity;
        sign = 1;
        for (let i = 0; i < pts.length - 1; i++) {
          const distance2 = dist(side, closestOnSegment(side, pts[i], pts[i + 1]).point);
          if (distance2 < best) { best = distance2; sign = cross(sub(pts[i + 1], pts[i]), sub(side, pts[i])) >= 0 ? 1 : -1; }
        }
      }
      const points = offsetPoints(pts, closed, d * sign);
      const { cx, cy, rx, ry, angle, sides, r, x, y, width, height, radius, ...rest } = copy;
      return { ...rest, type: 'polyline', points, closed };
    }
    default: return null;
  }
}

// ───────────────────────── explode

/** Breaks an entity into simple ones (lines, polylines, circles, arcs, texts). */
export function explode(e) {
  const style = { layer: e.layer, color: e.color, lineType: e.lineType, lineWidth: e.lineWidth };
  // A boolean solid gives back the solids it was made of (like deleting the boolean in FreeCAD).
  if (e.type === 'solid' && e.kind === 'boolean') return e.shape.parts.map((part) => createEntity('solid', { ...style, color: part.color ?? e.color, ...partInParent(part, e) }));
  // A fillet, chamfer, thickness or offset gives back the solid it was made on.
  if (e.type === 'solid' && ['fillet', 'chamfer', 'thickness', 'offset3d', 'draft'].includes(e.kind) && e.shape?.base) return [createEntity('solid', { ...style, color: e.shape.base.color ?? e.color, ...partInParent(e.shape.base, e) })];
  // Part shape operations give back what they were made of: the parts of a compound or fragments, the base (and tools) of the rest.
  if (e.type === 'solid' && ['compound', 'fragments'].includes(e.kind)) return (e.shape.parts ?? []).map((part) => createEntity('solid', { ...style, color: part.color ?? e.color, ...partInParent(part, e) }));
  if (e.type === 'solid' && ['slice', 'compoundFilter', 'mirror3d', 'scale3d', 'refine', 'reverse', 'pattern'].includes(e.kind) && e.shape?.base) return [e.shape.base, ...(e.shape.tools ?? [])].map((part) => createEntity('solid', { ...style, color: part.color ?? e.color, ...partInParent(part, e) }));
  const fromPrim = (prim) => {
    const own = { ...style, ...(prim.lineType ? { lineType: prim.lineType } : {}), ...(prim.thin ? { lineWidth: 0.18 } : {}) };
    switch (prim.kind) {
      case 'line': return createEntity('line', { ...own, x1: prim.a.x, y1: prim.a.y, x2: prim.b.x, y2: prim.b.y });
      case 'poly': return createEntity('polyline', { ...own, points: prim.points, closed: prim.closed });
      case 'fill': return createEntity('hatch', { ...own, loops: [prim.points, ...(prim.holes ?? [])], pattern: 'solid' });
      case 'circle': return createEntity('circle', { ...own, cx: prim.c.x, cy: prim.c.y, r: prim.r });
      case 'arc': return createEntity('arc', { ...own, cx: prim.c.x, cy: prim.c.y, r: prim.r, start: prim.start, end: prim.end });
      case 'text': {
        // Vertically centred (dimension) texts become normal texts on the same baseline.
        const p = prim.valign === 'middle' ? rotate({ x: prim.p.x, y: prim.p.y + firstBaseline(prim) }, prim.p, prim.angle) : prim.p;
        return createEntity('text', { ...own, x: p.x, y: p.y, text: prim.text, size: prim.size, angle: prim.angle, align: prim.align ?? 'left', font: prim.font ?? '', bold: prim.bold, italic: prim.italic });
      }
      default: return null;
    }
  };
  if (e.type === 'polyline') {
    const pts = e.points;
    const out = [];
    for (let i = 0; i < (e.closed ? pts.length : pts.length - 1); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push(createEntity('line', { ...style, x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
    return out;
  }
  if (['part', 'dim', 'rect', 'polygon', 'ellipse', 'spline', 'leader', 'hatch'].includes(e.type) || (e.type === 'circle' && e.centerMark)) return primitives(e).map(fromPrim).filter(Boolean);
  return [];
}

export const canExplode = (e) => ['part', 'dim', 'rect', 'polygon', 'ellipse', 'polyline', 'spline', 'leader', 'hatch'].includes(e.type) || (e.type === 'circle' && e.centerMark) || (e.type === 'solid' && ['boolean', 'fillet', 'chamfer', 'thickness', 'offset3d', 'draft', 'compound', 'fragments', 'slice', 'compoundFilter', 'mirror3d', 'scale3d', 'refine', 'reverse', 'pattern'].includes(e.kind));

// ───────────────────────── measurements

/** Length, area, perimeter… of an entity (whatever applies). */
export function measure(e) {
  switch (e.type) {
    case 'line': {
      const a = { x: e.x1, y: e.y1 };
      const b = { x: e.x2, y: e.y2 };
      return { length: dist(a, b), angle: angleOf(a, b), dx: e.x2 - e.x1, dy: e.y2 - e.y1 };
    }
    case 'polyline': return { length: polylineLength(e.points, e.closed), ...(e.closed ? { area: Math.abs(polygonArea(e.points)) } : {}), vertices: e.points.length };
    case 'rect': {
      const outline = rectOutline(e);
      return { area: Math.abs(polygonArea(outline)), perimeter: polylineLength(outline, true) };
    }
    case 'circle': return { diameter: e.r * 2, perimeter: 2 * Math.PI * e.r, area: Math.PI * e.r * e.r };
    case 'arc': {
      const s = sweep(e.start, e.end);
      return { sweep: s, length: (Math.PI * e.r * s) / 180, chord: dist(polar({ x: e.cx, y: e.cy }, e.r, e.start), polar({ x: e.cx, y: e.cy }, e.r, e.end)) };
    }
    case 'ellipse': return isFullEllipse(e) ? { area: Math.PI * e.rx * e.ry, perimeter: ellipsePerimeter(e.rx, e.ry) } : { length: polylineLength(ellipseArcPoints(e, 0.5), false) };
    case 'point': return { x: e.x, y: e.y };
    case 'spline': return { length: polylineLength(splinePoints(e), e.closed), vertices: e.points.length };
    case 'leader': return { length: polylineLength(e.points, false) };
    case 'hatch': return { area: hatchArea(e.loops) };
    case 'polygon': {
      const pts = polygonPoints(e);
      return { side: dist(pts[0], pts[1]), area: Math.abs(polygonArea(pts)), perimeter: polylineLength(pts, true) };
    }
    case 'dim': return { value: dimValue(e) };
    case 'solid': return solidProperties(e);
    default: return {};
  }
}

/** Total length of the outlines of several entities (for the status bar). */
export function totalLength(list) {
  let total = 0;
  for (const e of list) {
    for (const prim of primitives(e)) {
      if (prim.kind === 'line') total += dist(prim.a, prim.b);
      else if (prim.kind === 'poly') total += polylineLength(prim.points, prim.closed);
      else if (prim.kind === 'circle') total += 2 * Math.PI * prim.r;
      else if (prim.kind === 'arc') total += (Math.PI * prim.r * sweep(prim.start, prim.end)) / 180;
    }
  }
  return total;
}

export { arcFrom3, deg, dist, len };
