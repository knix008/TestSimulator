// Dimensions and centre geometry placed in the views of a drawing (no DOM; the kernel only for the centre marks
// and model items):
//   view geometry — a view's projected paths split into lines, arcs / circles and curves (model 2D, y up), and
//     picking the vertex or edge nearest a point;
//   smart dimensions — horizontal, vertical, aligned, radial, diameter, angular, ordinate and chamfer, built from
//     the picked edges and vertices, with precision and tolerances (symmetric, deviation, limits, ISO 286 fits,
//     basic, reference) and their primitives on the sheet;
//   model items — the part's sketch dimensions (and blind extrude depths) brought into the views that show them;
//   centre marks and centre lines — inserted from the model's cylindrical faces (end-on: a mark, side-on: a line).
// A dimension is an annotation { kind: 'drwDim', view, dtype, … } whose geometry is in the view's model 2D
// coordinates (it follows the view when the view moves or the scale changes); its text sits at (x, y) sheet mm
// from the view's centre on the sheet (dragging the annotation moves the text).
import { rep } from './kernel.js';
import { layoutViews, viewBasis } from './drawing.js';
import { isCylinder } from './refs.js';
import { toWorld } from './features.js';

export const DIM_TYPES = ['auto', 'horizontal', 'vertical', 'aligned', 'radial', 'diameter', 'angular', 'ordinate', 'chamfer'];
export const TOL_TYPES = ['none', 'symmetric', 'bilateral', 'limits', 'fit', 'basic', 'reference'];

const EPS = 1e-6;
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add2 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const len2 = (a) => Math.hypot(a[0], a[1]);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit2 = (a) => { const l = len2(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : [1, 0]; };
const perp = (a) => [-a[1], a[0]];
const pt = (p) => (Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])) ? [Number(p[0]), Number(p[1])] : null);
const TAU = Math.PI * 2;
const normAngle = (a) => { let x = a % TAU; if (x < 0) x += TAU; return x; };

// ───────────────────────── view geometry

/**
 * The entities of one SVG path of a projection (absolute M, L, H, V, A, C, Q, Z; y down), in model 2D (y up):
 * { t: 'line', a, b } (runs of collinear segments merged), { t: 'arc', c, r, start, sweep } (radians, CCW > 0;
 * consecutive arcs on one circle merged; |sweep| ≈ 2π is a full circle) and { t: 'curve', pts }.
 */
export function pathEntities(d, hidden = false) {
  const tok = String(d ?? '').match(/[MLHVCQAZmlhvcqaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out = [];
  let i = 0; let cmd = null; let cur = null; let start = null;
  const num = () => Number(tok[i++]);
  const M = (x, y) => [x + 0, -y + 0];
  const pushLine = (a, b) => {
    if (dist2(a, b) < EPS) return;
    const last = out.at(-1);
    if (last?.t === 'line' && dist2(last.b, a) < 1e-6) {
      const u = unit2(sub2(last.b, last.a)); const w = unit2(sub2(b, a));
      if (Math.abs(cross2(u, w)) < 1e-6 && dot2(u, w) > 0) { last.b = b; return; }
    }
    out.push({ t: 'line', a, b, hidden });
  };
  const pushArc = (a, b, rx, ry, large, sweep) => {
    if (Math.abs(rx - ry) > 1e-6 * Math.max(1, rx)) { out.push({ t: 'curve', pts: [a, b], hidden }); return; }
    // The centre in SVG coordinates (y down), from the end points and the flags (SVG implementation notes F.6.5).
    const s1 = [a[0], -a[1]]; const s2 = [b[0], -b[1]];
    const dx2 = (s1[0] - s2[0]) / 2; const dy2 = (s1[1] - s2[1]) / 2;
    const d2 = dx2 * dx2 + dy2 * dy2;
    if (d2 < 1e-18) return;
    let r = Math.abs(rx);
    if (d2 > r * r) r = Math.sqrt(d2);
    const k = Math.sqrt(Math.max(0, (r * r - d2) / d2)) * (large === sweep ? -1 : 1);
    const cs = [k * dy2 + (s1[0] + s2[0]) / 2, -k * dx2 + (s1[1] + s2[1]) / 2];
    const c = [cs[0], -cs[1]];
    const ta = Math.atan2(a[1] - c[1], a[0] - c[0]); const tb = Math.atan2(b[1] - c[1], b[0] - c[0]);
    // SVG's positive sweep turns clockwise once y points up.
    let sw = sweep ? -normAngle(ta - tb) : normAngle(tb - ta);
    if (Math.abs(sw) < 1e-9) sw = sweep ? -TAU : TAU;
    const last = out.at(-1);
    if (last?.t === 'arc' && dist2(last.c, c) < 1e-5 * Math.max(1, r) && Math.abs(last.r - r) < 1e-5 * Math.max(1, r) && Math.sign(last.sweep) === Math.sign(sw)) {
      last.sweep = Math.max(-TAU, Math.min(TAU, last.sweep + sw));
      return;
    }
    out.push({ t: 'arc', c, r, start: ta, sweep: sw, hidden });
  };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++].toUpperCase();
    switch (cmd) {
      case 'M': cur = M(num(), num()); start = cur; cmd = 'L'; break;
      case 'L': { const p = M(num(), num()); if (cur) pushLine(cur, p); cur = p; break; }
      case 'H': { const p = [num(), cur?.[1] ?? 0]; if (cur) pushLine(cur, p); cur = p; break; }
      case 'V': { const p = [cur?.[0] ?? 0, -num()]; if (cur) pushLine(cur, p); cur = p; break; }
      case 'A': { const rx = num(); const ry = num(); num(); const large = num() ? 1 : 0; const sweep = num() ? 1 : 0; const p = M(num(), num()); if (cur) pushArc(cur, p, rx, ry, large, sweep); cur = p; break; }
      case 'C': { const pts = [cur, M(num(), num()), M(num(), num()), M(num(), num())]; if (cur) out.push({ t: 'curve', pts: [pts[0], pts[3]], ctrl: pts, hidden }); cur = pts[3]; break; }
      case 'Q': { const pts = [cur, M(num(), num()), M(num(), num())]; if (cur) out.push({ t: 'curve', pts: [pts[0], pts[2]], hidden }); cur = pts[2]; break; }
      case 'Z': if (cur && start) pushLine(cur, start); cur = start; cmd = null; break;
      default: i++;
    }
  }
  // Runs of tiny segments along one straight line (the kernel's flattening) are one line too.
  return out;
}

/** Every entity of a projection's visible (and hidden) paths. */
export function viewEntities(p, { hidden = true } = {}) {
  if (!p) return [];
  const list = [];
  for (const d of p.visible ?? []) list.push(...pathEntities(d, false));
  if (hidden) for (const d of p.hidden ?? []) list.push(...pathEntities(d, true));
  return list;
}

const arcEnd = (e) => [e.c[0] + e.r * Math.cos(e.start + e.sweep), e.c[1] + e.r * Math.sin(e.start + e.sweep)];
const arcStart = (e) => [e.c[0] + e.r * Math.cos(e.start), e.c[1] + e.r * Math.sin(e.start)];
const isFull = (e) => e.t === 'arc' && Math.abs(e.sweep) >= TAU - 1e-4;
/** True when angle `a` is within the arc's span. */
function onArc(e, a) {
  if (isFull(e)) return true;
  const s = e.sweep >= 0 ? e.start : e.start + e.sweep;
  return normAngle(a - s) <= Math.abs(e.sweep) + 1e-9;
}

function segDist(q, a, b) {
  const ab = sub2(b, a); const L2 = dot2(ab, ab);
  const t = L2 > 1e-18 ? Math.max(0, Math.min(1, dot2(sub2(q, a), ab) / L2)) : 0;
  return dist2(q, add2(a, ab, t));
}

/**
 * The vertex (end point, arc centre) or edge nearest `q` within `tol` (model units):
 * { kind: 'point', p, of } · { kind: 'line', a, b } · { kind: 'arc', c, r, full, start, sweep } · null.
 * Vertices win over edges when both are close.
 */
export function pickEntity(entities, q, tol) {
  let best = null; let bestD = tol;
  const tryPoint = (p, of) => { const dd = dist2(p, q); if (dd <= bestD) { bestD = dd; best = { kind: 'point', p, of }; } };
  for (const e of entities) {
    if (e.t === 'line') { tryPoint(e.a, 'end'); tryPoint(e.b, 'end'); }
    else if (e.t === 'arc') { tryPoint(e.c, 'center'); if (!isFull(e)) { tryPoint(arcStart(e), 'end'); tryPoint(arcEnd(e), 'end'); } }
    else if (e.t === 'curve') { tryPoint(e.pts[0], 'end'); tryPoint(e.pts.at(-1), 'end'); }
  }
  if (best) return best;
  bestD = tol;
  for (const e of entities) {
    let dd = Infinity;
    if (e.t === 'line') dd = segDist(q, e.a, e.b);
    else if (e.t === 'arc') { const a = Math.atan2(q[1] - e.c[1], q[0] - e.c[0]); if (onArc(e, a)) dd = Math.abs(dist2(q, e.c) - e.r); }
    else if (e.t === 'curve') for (let k = 1; k < e.pts.length; k++) dd = Math.min(dd, segDist(q, e.pts[k - 1], e.pts[k]));
    if (dd <= bestD) {
      bestD = dd;
      best = e.t === 'arc' ? { kind: 'arc', c: e.c, r: e.r, full: isFull(e), start: e.start, sweep: e.sweep } : e.t === 'line' ? { kind: 'line', a: e.a, b: e.b } : { kind: 'line', a: e.pts[0], b: e.pts.at(-1) };
    }
  }
  return best;
}

// ───────────────────────── smart dimensions from picks

const foot = (p, a, b) => { const u = unit2(sub2(b, a)); return add2(a, u, dot2(sub2(p, a), u)); };
const pointOf = (pick) => (pick.kind === 'point' ? pick.p : pick.kind === 'arc' ? pick.c : null);
const parallel = (l1, l2) => Math.abs(cross2(unit2(sub2(l1.b, l1.a)), unit2(sub2(l2.b, l2.a)))) < 1e-4;

/** Intersection of two infinite lines (null when parallel). */
export function lineIntersection(a1, b1, a2, b2) {
  const d1 = sub2(b1, a1); const d2 = sub2(b2, a2);
  const den = cross2(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross2(sub2(a2, a1), d2) / den;
  return add2(a1, d1, t);
}

/** Two points measured horizontally, vertically or along their line ('auto': horizontal / vertical when aligned so). */
function linearOf(p1, p2, dtype) {
  if (dist2(p1, p2) < EPS) return { error: 'zero' };
  let t = dtype;
  if (t === 'auto') t = Math.abs(p1[1] - p2[1]) < 1e-6 ? 'horizontal' : Math.abs(p1[0] - p2[0]) < 1e-6 ? 'vertical' : 'aligned';
  if (t === 'horizontal' && Math.abs(p1[0] - p2[0]) < EPS) return { error: 'zero' };
  if (t === 'vertical' && Math.abs(p1[1] - p2[1]) < EPS) return { error: 'zero' };
  return { dtype: t, p1, p2 };
}

/** The far end of a line from a point (the ray of an angle). */
const farEnd = (l, v) => (dist2(l.a, v) > dist2(l.b, v) ? l.a : l.b);

/**
 * Dimension geometry from the picks (pickEntity() results) and the type wanted ('auto' chooses as a smart
 * dimension does): { dtype, … } or { error } ('more' when more picks are needed). Ordinate dimensions are built
 * with ordinateFromPicks().
 */
export function dimensionFromPicks(picks, dtype = 'auto') {
  const [A, B] = picks;
  if (!A) return { error: 'more' };
  if (dtype === 'radial' || dtype === 'diameter') {
    if (A.kind !== 'arc') return { error: 'needArc' };
    return { dtype, c: A.c, r: A.r, full: A.full };
  }
  if (dtype === 'angular' || dtype === 'chamfer') {
    if (A.kind !== 'line') return { error: 'needLines' };
    if (!B) return { error: 'more' };
    if (B.kind !== 'line') return { error: 'needLines' };
    if (parallel(A, B)) return { error: 'parallel' };
    const v = lineIntersection(A.a, A.b, B.a, B.b);
    if (dtype === 'chamfer') return { dtype, l1: [A.a, A.b], l2: [B.a, B.b], v };
    return { dtype, l1: [A.a, A.b], l2: [B.a, B.b], v, r1: farEnd(A, v), r2: farEnd(B, v) };
  }
  if (!B) {
    if (A.kind === 'line') return linearOf(A.a, A.b, dtype);
    if (A.kind === 'arc' && dtype === 'auto') return { dtype: A.full ? 'diameter' : 'radial', c: A.c, r: A.r, full: A.full };
    return { error: 'more' };
  }
  if (A.kind === 'line' && B.kind === 'line') {
    if (!parallel(A, B)) {
      if (dtype !== 'auto') return { error: 'notParallel' };
      const v = lineIntersection(A.a, A.b, B.a, B.b);
      return { dtype: 'angular', l1: [A.a, A.b], l2: [B.a, B.b], v, r1: farEnd(A, v), r2: farEnd(B, v) };
    }
    const m = [(A.a[0] + A.b[0]) / 2, (A.a[1] + A.b[1]) / 2];
    const f = foot(m, B.a, B.b);
    const r = linearOf(m, f, dtype === 'auto' ? 'aligned' : dtype);
    return r.error || dtype !== 'auto' ? r : { ...r, dtype: Math.abs(m[1] - f[1]) < 1e-6 ? 'horizontal' : Math.abs(m[0] - f[0]) < 1e-6 ? 'vertical' : 'aligned' };
  }
  const lineOf = A.kind === 'line' ? A : B.kind === 'line' ? B : null;
  const other = lineOf === A ? B : A;
  if (lineOf && pointOf(other)) {
    const p = pointOf(other);
    const f = foot(p, lineOf.a, lineOf.b);
    return linearOf(p, f, dtype === 'auto' ? 'auto' : dtype);
  }
  const p1 = pointOf(A); const p2 = pointOf(B);
  if (p1 && p2) return linearOf(p1, p2, dtype);
  return { error: 'more' };
}

/** An ordinate dimension set: the first pick is the origin (0), every other one adds a point. */
export function ordinateFromPicks(picks, axis = 'x') {
  const pts = picks.map(pointOf).filter(Boolean);
  if (pts.length < 2) return { error: 'more' };
  return { dtype: 'ordinate', axis: axis === 'y' ? 'y' : 'x', origin: pts[0], pts: pts.slice(1) };
}

const angleOf = (a, v, b) => {
  const u = unit2(sub2(a, v)); const w = unit2(sub2(b, v));
  return (Math.acos(Math.max(-1, Math.min(1, dot2(u, w)))) * 180) / Math.PI;
};

/** The measured value(s) of a dimension (model units; degrees for angles): a number, or a list for ordinates. */
export function dimValue(a) {
  switch (a?.dtype) {
    case 'horizontal': return Math.abs(a.p2[0] - a.p1[0]);
    case 'vertical': return Math.abs(a.p2[1] - a.p1[1]);
    case 'aligned': return dist2(a.p1, a.p2);
    case 'radial': return Number(a.r);
    case 'diameter': return 2 * Number(a.r);
    case 'angular': return angleOf(a.r1, a.v, a.r2);
    case 'chamfer': {
      // l1 is the chamfer, l2 the face it leaves: the distance along l2 and the angle between them.
      const [c1, c2] = a.l1; const u = unit2(sub2(a.l2[1], a.l2[0]));
      const along = Math.abs(dot2(sub2(c2, c1), u));
      let ang = (Math.acos(Math.min(1, Math.abs(dot2(unit2(sub2(c2, c1)), u)))) * 180) / Math.PI;
      if (ang > 90) ang = 180 - ang;
      return { distance: along, angle: ang };
    }
    case 'ordinate': return a.pts.map((p) => Math.abs(a.axis === 'y' ? p[1] - a.origin[1] : p[0] - a.origin[0]));
    default: return NaN;
  }
}

// ───────────────────────── values, precision and tolerances

/** A number with `precision` decimals (null: up to two, trailing zeros dropped). */
export function formatNumber(v, precision = null) {
  if (!Number.isFinite(v)) return '?';
  if (precision == null || precision === '' || !Number.isFinite(Number(precision))) {
    const r = Math.round(v * 100) / 100;
    return String(Object.is(r, -0) ? 0 : r);
  }
  const p = Math.max(0, Math.min(6, Math.round(Number(precision))));
  const s = v.toFixed(p);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}
const signed = (v, p) => (Math.abs(v) < 1e-12 ? '0' : `${v > 0 ? '+' : '−'}${formatNumber(Math.abs(v), p)}`);

// ISO 286-1: the standard tolerance grades (µm) of the size ranges up to 500 mm, and fundamental deviations.
const SIZE_STEPS = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
const IT = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
};
// Shafts: f, g, h give the upper deviation es; k, n, p the lower one ei (µm).
const SHAFT_ES = { f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68], g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20], h: Array(13).fill(0) };
const SHAFT_EI = { k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5], n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40], p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68] };
export const FIT_CLASSES = ['H6', 'H7', 'H8', 'H9', 'H11', 'G7', 'F8', 'JS7', 'h6', 'h7', 'h9', 'h11', 'g6', 'f7', 'js6', 'k6', 'n6', 'p6'];

/**
 * Limit deviations (mm) of an ISO 286 tolerance class at a nominal size: { upper, lower } or null (unknown class or
 * size over 500 mm). Holes: H, G, F, JS; shafts: h, g, f, js, k, n, p; grades IT5–IT11.
 */
export function fitDeviations(fit, size) {
  const m = /^([A-Za-z]{1,2})(\d{1,2})$/.exec(String(fit ?? '').trim());
  if (!m || !(size > 0) || size > 500) return null;
  const [, letter, g] = m; const grade = Number(g);
  if (!IT[grade]) return null;
  const i = SIZE_STEPS.findIndex((s) => size <= s);
  const it = IT[grade][i];
  const hole = letter[0] === letter[0].toUpperCase();
  const L = letter.toLowerCase();
  let lo; let hi;
  if (L === 'js') { lo = -it / 2; hi = it / 2; }
  else if (SHAFT_ES[L]) {
    const es = SHAFT_ES[L][i];
    if (hole) { lo = -es; hi = -es + it; } else { hi = es; lo = es - it; }
  } else if (SHAFT_EI[L] && !hole) {
    const ei = L === 'k' && (grade > 7 || grade < 4) ? 0 : SHAFT_EI[L][i];
    lo = ei; hi = ei + it;
  } else return null;
  return { upper: hi / 1000 + 0, lower: lo / 1000 + 0 };
}

/**
 * The text of a dimension: { main, upper?, lower?, box?, paren? } — main is the value with its prefix (Ø, R) or
 * suffix (°); upper / lower are stacked tolerance texts. `value` is the measured value.
 */
export function dimText(a, value) {
  const p = a.precision ?? null;
  const tp = a.tolPrecision ?? (p == null ? 2 : Math.max(Number(p), 2));
  const prefix = a.dtype === 'diameter' ? 'Ø' : a.dtype === 'radial' ? 'R' : '';
  const suffix = a.dtype === 'angular' ? '°' : '';
  const tol = a.tol ?? { type: 'none' };
  const up = Number(tol.upper) || 0; const low = Number(tol.lower) || 0;
  const base = a.text != null && a.text !== '' ? String(a.text) : `${prefix}${formatNumber(value, p)}${suffix}`;
  const out = { main: base };
  switch (tol.type) {
    case 'symmetric': out.main = `${base} ±${formatNumber(Math.abs(up), tp)}${suffix}`; break;
    case 'bilateral': out.upper = signed(up, tp); out.lower = signed(-Math.abs(low), tp); if (low === 0) out.lower = '0'; break;
    case 'limits': out.main = ''; out.upper = `${prefix}${formatNumber(value + up, tp)}${suffix}`; out.lower = `${prefix}${formatNumber(value - Math.abs(low), tp)}${suffix}`; break;
    case 'fit': {
      const cls = String(tol.fit ?? 'H7');
      out.main = `${base} ${cls}`;
      const dv = fitDeviations(cls, value);
      if (dv && tol.showValues !== false) { out.upper = signed(dv.upper, 3); out.lower = signed(dv.lower, 3); }
      break;
    }
    case 'basic': out.box = true; break;
    case 'reference': out.paren = true; out.main = `(${base})`; break;
    default: break;
  }
  return out;
}

/** Every text of a dimension as one string (for lists, tests and the DXF). */
export function dimLabel(a) {
  const v = dimValue(a);
  if (a.dtype === 'chamfer') return `${formatNumber(v.distance, a.precision ?? null)} × ${formatNumber(v.angle, 0)}°`;
  if (a.dtype === 'ordinate') return v.map((x) => formatNumber(x, a.precision ?? null)).join(' ');
  const t = dimText(a, v);
  return [t.main, t.upper, t.lower].filter(Boolean).join(' ');
}

// ───────────────────────── the views on the sheet

/**
 * Where every view of the sheet drawing is: Map viewId → { v, p, place, s, toSheet(X, Y), fromSheet(x, y) }
 * (model 2D ↔ sheet mm, y down). Detail views are left out (they have no geometry of their own).
 */
export function viewFrames(sd, projections) {
  const out = new Map();
  if (!projections?.size) return { scale: 1, frames: out };
  const { scale, places } = layoutViews(sd, projections);
  for (const v of sd.views ?? []) {
    const p = projections.get(v.id); const place = places.get(v.id);
    if (!p || !place || v.kind === 'detail') continue;
    const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
    const s = scale;
    out.set(v.id, {
      v, p, place, s, cx, cy,
      toSheet: (X, Y) => [place.cx + (X - cx) * s, place.cy + (cy - Y) * s],
      fromSheet: (x, y) => [cx + (x - place.cx) / s, cy - (y - place.cy) / s],
    });
  }
  return { scale, frames: out };
}

/** The view under a sheet point (its box with a margin), the nearest one when several overlap. */
export function viewAt(frames, x, y, margin = 6) {
  let best = null; let bd = Infinity;
  for (const fr of frames.values()) {
    const { p, s, place } = fr;
    const w = ((p.box.x1 - p.box.x0) * s) / 2 + margin; const h = ((p.box.y1 - p.box.y0) * s) / 2 + margin;
    const dx = Math.abs(x - place.cx); const dy = Math.abs(y - place.cy);
    if (dx <= w && dy <= h) { const dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = fr; } }
  }
  return best;
}

/** True for the isometric and dimetric views (their projected lengths are not true lengths). */
export const isPictorial = (v) => v?.type === 'iso' || v?.type === 'dimetric';

/** A text place a little off the geometry (sheet mm from the view's centre), away from the view's middle. */
export function autoTextOffset(g, fr, gap = 9) {
  const S = (p) => fr.toSheet(p[0], p[1]);
  const mid = [fr.place.cx, fr.place.cy];
  let at;
  if (['horizontal', 'vertical', 'aligned'].includes(g.dtype)) {
    const A = S(g.p1); const B = S(g.p2);
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    let n = g.dtype === 'horizontal' ? [0, 1] : g.dtype === 'vertical' ? [1, 0] : perp(unit2(sub2(B, A)));
    if (dot2(n, sub2(m, mid)) < 0) n = [-n[0], -n[1]];
    // Horizontal / vertical: from the outer of the two points.
    if (g.dtype === 'horizontal') at = [m[0], (n[1] > 0 ? Math.max(A[1], B[1]) : Math.min(A[1], B[1])) + n[1] * gap];
    else if (g.dtype === 'vertical') at = [(n[0] > 0 ? Math.max(A[0], B[0]) : Math.min(A[0], B[0])) + n[0] * gap, m[1]];
    else at = add2(m, n, gap);
  } else if (g.dtype === 'radial' || g.dtype === 'diameter') {
    const C = S(g.c); const R = g.r * fr.s;
    const ang = g.full ? -Math.PI / 4 : -(g.start + g.sweep / 2);
    at = add2(C, [Math.cos(ang), Math.sin(ang)], R + gap);
  } else if (g.dtype === 'angular') {
    const V = S(g.v); const A = S(g.r1); const B = S(g.r2);
    const u = unit2(add2(unit2(sub2(A, V)), unit2(sub2(B, V))));
    at = add2(V, u, Math.min(dist2(A, V), dist2(B, V)) * 0.6 + 4);
  } else if (g.dtype === 'chamfer') {
    const A = S(g.l1[0]); const B = S(g.l1[1]);
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    let n = perp(unit2(sub2(B, A)));
    if (dot2(n, sub2(m, mid)) < 0) n = [-n[0], -n[1]];
    at = add2(m, n, gap + 3);
  } else if (g.dtype === 'ordinate') {
    const P = [g.origin, ...g.pts].map(S);
    at = g.axis === 'y' ? [Math.max(...P.map((q) => q[0])) + gap, P[0][1]] : [P[0][0], Math.max(...P.map((q) => q[1])) + gap];
  } else at = [fr.place.cx, fr.place.cy];
  return [Math.round((at[0] - fr.place.cx) * 100) / 100, Math.round((at[1] - fr.place.cy) * 100) / 100];
}

// ───────────────────────── primitives (sheet mm, y down)

const textW = (s, size) => String(s ?? '').length * size * 0.6;

function arrow(tip, dir, L = 2.5, w = 0.8) {
  const d = unit2(dir); const n = perp(d);
  return { t: 'fill', pts: [tip, add2(add2(tip, d, -L), n, w), add2(add2(tip, d, -L), n, -w)] };
}

/** A readable text angle (degrees, sheet clockwise) of a direction: never upside down. */
function readable(u) {
  let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  if (ang > 90.001) ang -= 180; else if (ang <= -90.001) ang += 180;
  return Math.abs(ang) < 1e-9 ? 0 : ang;
}

/**
 * The dimension text at `at` (sheet mm: the bottom middle of the main text), turned `rot` degrees: the main text,
 * stacked tolerances to its right, a frame (basic) — as text / poly primitives.
 */
function textPrims(tx, at, rot, size) {
  const out = [];
  const r = (rot * Math.PI) / 180; const ux = [Math.cos(r), Math.sin(r)]; const uy = [-Math.sin(r), Math.cos(r)];
  const P = (dx, dy) => add2(add2(at, ux, dx), uy, dy);
  const mw = textW(tx.main, size);
  const small = size * 0.62;
  const sw = Math.max(textW(tx.upper, small), textW(tx.lower, small));
  const total = mw + (tx.upper || tx.lower ? sw + (tx.main ? 0.8 : 0) : 0);
  const x0 = -total / 2;
  if (tx.main) { const q = P(x0 + mw / 2, 0); out.push({ t: 'text', x: q[0], y: q[1], text: tx.main, size, anchor: 'middle', rot }); }
  if (tx.upper || tx.lower) {
    const sx = x0 + mw + (tx.main ? 0.8 : 0);
    const big = !tx.main;
    const sz = big ? size * 0.8 : small;
    if (tx.upper) { const q = P(sx, big ? -sz * 1.05 : -size * 0.45); out.push({ t: 'text', x: q[0], y: q[1], text: tx.upper, size: sz, anchor: 'start', rot }); }
    if (tx.lower) { const q = P(sx, big ? 0.15 : 0.25); out.push({ t: 'text', x: q[0], y: q[1], text: tx.lower, size: sz, anchor: 'start', rot }); }
  }
  if (tx.box) out.push({ t: 'poly', pts: [P(x0 - 0.8, 0.9), P(x0 + total + 0.8, 0.9), P(x0 + total + 0.8, -size - 0.4), P(x0 - 0.8, -size - 0.4)], closed: true, cls: 'dx-thin' });
  return { prims: out, width: total };
}

function circlePoly(c, r, a0 = 0, a1 = TAU, n = 64) {
  const k = Math.max(8, Math.ceil((n * Math.abs(a1 - a0)) / TAU));
  return Array.from({ length: k + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / k; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
}

/** The primitives of a dimension in its view (`fr` from viewFrames()); `size` text height (mm). */
export function dimPrimitives(a, fr, { size = 3.2 } = {}) {
  const S = (p) => fr.toSheet(p[0], p[1]);
  const T = [fr.place.cx + (Number(a.x) || 0), fr.place.cy + (Number(a.y) || 0)];
  const out = [];
  const value = dimValue(a);
  const lift = 1.0;
  switch (a.dtype) {
    case 'horizontal': case 'vertical': case 'aligned': {
      const A = S(a.p1); const B = S(a.p2);
      const u = a.dtype === 'horizontal' ? [B[0] >= A[0] ? 1 : -1, 0] : a.dtype === 'vertical' ? [0, B[1] >= A[1] ? 1 : -1] : unit2(sub2(B, A));
      const n = perp(u);
      const D1 = add2(A, n, dot2(sub2(T, A), n)); const D2 = add2(B, n, dot2(sub2(T, B), n));
      const ext = (P, D) => { const v = sub2(D, P); const L = len2(v); if (L < 1e-6) return null; const w = unit2(v); return { t: 'poly', pts: [add2(P, w, Math.min(1.2, L)), add2(D, w, 1.8)], cls: 'dx-thin' }; };
      for (const e of [ext(A, D1), ext(B, D2)]) if (e) out.push(e);
      const along = dot2(sub2(T, D1), u); const span = dot2(sub2(D2, D1), u);
      const tx = dimText(a, value);
      const rot = readable(u);
      const tw = textPrims(tx, [0, 0], rot, size).width;
      const tight = Math.abs(span) < 2 * 2.5 + 1;
      // The dimension line reaches the text when it stands outside the extension lines.
      const lo = Math.min(0, span, along - (along < 0 ? tw / 2 : 0)); const hi = Math.max(0, span, along + (along > span ? tw / 2 : 0));
      out.push({ t: 'poly', pts: [add2(D1, u, lo), add2(D1, u, hi)], cls: 'dx-thin' });
      const s = Math.sign(span) || 1;
      if (tight) out.push(arrow(D1, [u[0] * s, u[1] * s]), arrow(D2, [-u[0] * s, -u[1] * s]));
      else out.push(arrow(D1, [-u[0] * s, -u[1] * s]), arrow(D2, [u[0] * s, u[1] * s]));
      const r = (rot * Math.PI) / 180; const up = [Math.sin(r), -Math.cos(r)];
      const base = add2(add2(D1, u, along), up, lift);
      out.push(...textPrims(tx, base, rot, size).prims);
      break;
    }
    case 'radial': case 'diameter': {
      const C = S(a.c); const R = a.r * fr.s;
      const w = unit2(sub2(T, C));
      const Pa = add2(C, w, R);
      const tx = dimText(a, value);
      const outside = dist2(T, C) > R;
      const tw = textPrims(tx, [0, 0], 0, size).width;
      const shoulder = w[0] >= 0 ? 1 : -1;
      const S1 = add2(T, [shoulder * (tw + 1.5), 0]);
      if (a.dtype === 'diameter') {
        const Pb = add2(C, w, -R);
        out.push({ t: 'poly', pts: outside ? [Pb, T, S1] : [Pb, Pa], cls: 'dx-thin' });
        out.push(arrow(Pa, outside ? [-w[0], -w[1]] : w), arrow(Pb, outside ? w : [-w[0], -w[1]]));
      } else {
        out.push({ t: 'poly', pts: outside ? [C, T, S1] : [C, Pa], cls: 'dx-thin' });
        out.push(arrow(Pa, w));
      }
      const textAt = outside ? [T[0] + (shoulder * (tw + 1.5)) / 2, T[1] - lift] : [T[0], T[1] - lift];
      out.push(...textPrims(tx, textAt, 0, size).prims);
      break;
    }
    case 'angular': {
      const V = S(a.v); const A = S(a.r1); const B = S(a.r2);
      const rho = Math.max(3, dist2(T, V));
      const ta = Math.atan2(A[1] - V[1], A[0] - V[0]); let tb = Math.atan2(B[1] - V[1], B[0] - V[0]);
      let d = tb - ta; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; tb = ta + d;
      out.push({ t: 'poly', pts: circlePoly(V, rho, ta, tb), cls: 'dx-thin' });
      const pa = add2(V, [Math.cos(ta), Math.sin(ta)], rho); const pb = add2(V, [Math.cos(tb), Math.sin(tb)], rho);
      const sgn = Math.sign(d) || 1;
      out.push(arrow(pa, [Math.sin(ta) * sgn, -Math.cos(ta) * sgn]), arrow(pb, [-Math.sin(tb) * sgn, Math.cos(tb) * sgn]));
      // Extension lines where the arc runs past the drawn lines.
      for (const [E, P, ang] of [[A, pa, ta], [B, pb, tb]]) if (dist2(E, V) < rho) out.push({ t: 'poly', pts: [add2(E, [Math.cos(ang), Math.sin(ang)], 1), add2(P, [Math.cos(ang), Math.sin(ang)], 1.5)], cls: 'dx-thin' });
      const mid = ta + d / 2; const tp = add2(V, [Math.cos(mid), Math.sin(mid)], rho + 1.2);
      out.push(...textPrims(dimText(a, value), tp, 0, size).prims);
      break;
    }
    case 'chamfer': {
      const A = S(a.l1[0]); const B = S(a.l1[1]);
      const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const txt = a.text ? String(a.text) : `${formatNumber(value.distance, a.precision ?? null)} × ${formatNumber(value.angle, 0)}°`;
      const tw = textW(txt, size);
      const dir = T[0] >= M[0] ? 1 : -1;
      out.push({ t: 'poly', pts: [M, T, add2(T, [dir * (tw + 1.5), 0])], cls: 'dx-thin' }, arrow(M, sub2(M, T)));
      out.push({ t: 'text', x: T[0] + (dir * (tw + 1.5)) / 2, y: T[1] - lift, text: txt, size, anchor: 'middle' });
      break;
    }
    case 'ordinate': {
      const O = S(a.origin); const P = a.pts.map(S);
      const vals = [0, ...value];
      [O, ...P].forEach((Q, i) => {
        const txt = formatNumber(vals[i], a.precision ?? null);
        if (a.axis === 'y') {
          const x = T[0];
          out.push({ t: 'poly', pts: [[Q[0] + (x > Q[0] ? 1.2 : -1.2), Q[1]], [x, Q[1]]], cls: 'dx-thin' });
          out.push({ t: 'text', x: x + (x >= Q[0] ? 1 : -1), y: Q[1] + size * 0.35, text: txt, size, anchor: x >= Q[0] ? 'start' : 'end' });
        } else {
          const y = T[1];
          out.push({ t: 'poly', pts: [[Q[0], Q[1] + (y > Q[1] ? 1.2 : -1.2)], [Q[0], y]], cls: 'dx-thin' });
          out.push({ t: 'text', x: Q[0] + size * 0.35, y: y + (y >= Q[1] ? 1 : -1), text: txt, size, anchor: y >= Q[1] ? 'start' : 'end', rot: -90 });
        }
      });
      break;
    }
    default: break;
  }
  return out;
}

/** Centre mark (end-on cylinder) or centre line (side-on) primitives. */
export function centerPrimitives(a, fr) {
  const S = (p) => fr.toSheet(p[0], p[1]);
  if (a.ctype === 'mark') {
    const C = S(a.c); const R = Math.max(0.5, a.r * fr.s);
    const h = R + 2.5; const g = Math.min(1.5, R * 0.3); const k = Math.min(1.5, R * 0.25);
    return [
      { t: 'poly', pts: [[C[0] - k, C[1]], [C[0] + k, C[1]]], cls: 'dx-thin' }, { t: 'poly', pts: [[C[0], C[1] - k], [C[0], C[1] + k]], cls: 'dx-thin' },
      { t: 'poly', pts: [[C[0] - h, C[1]], [C[0] - k - g, C[1]]], cls: 'dx-thin' }, { t: 'poly', pts: [[C[0] + k + g, C[1]], [C[0] + h, C[1]]], cls: 'dx-thin' },
      { t: 'poly', pts: [[C[0], C[1] - h], [C[0], C[1] - k - g]], cls: 'dx-thin' }, { t: 'poly', pts: [[C[0], C[1] + k + g], [C[0], C[1] + h]], cls: 'dx-thin' },
    ];
  }
  const A = S(a.a); const B = S(a.b);
  const u = unit2(sub2(B, A));
  return [{ t: 'poly', pts: [add2(A, u, -3), add2(B, u, 3)], cls: 'dx-center', linetype: 'CENTER' }];
}

// ───────────────────────── centre marks and centre lines from the model

/** Axis, radius and angular span of a cylindrical face (null for other faces). */
function cylinderAxis(face) {
  const R = rep(); const oc = R.getOC();
  if (!isCylinder(face.geomType)) return null;
  let ad = null;
  try {
    ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
    const cy = ad.Cylinder(); const ax = cy.Axis(); const l = ax.Location(); const d = ax.Direction();
    const uv = face.UVBounds;
    return { point: [l.X(), l.Y(), l.Z()], dir: [d.X(), d.Y(), d.Z()], r: cy.Radius(), span: Math.abs(uv.uMax - uv.uMin) };
  } catch { return null; } finally { ad?.delete?.(); }
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Centre marks and centre lines of a view from the shape's cylinders whose faces go at least 3/4 round:
 * [{ ctype: 'mark', c, r } | { ctype: 'line', a, b }] in the view's model 2D. Concentric cylinders give one mark
 * (the largest); collinear lines merge.
 */
export function centerItems(shape, view) {
  const b = viewBasis(view);
  if (!b || !shape) return [];
  const groups = [];
  for (const face of shape.faces) {
    const ax = cylinderAxis(face);
    if (!ax) continue;
    const dir = ax.dir; const k = dot3(dir, b.dir);
    // Where the face runs along the axis: its bounding box corners projected onto it.
    let lo = Infinity; let hi = -Infinity;
    try {
      const [p0, p1] = face.boundingBox.bounds;
      for (const x of [p0[0], p1[0]]) for (const y of [p0[1], p1[1]]) for (const z of [p0[2], p1[2]]) { const s = dot3([x - ax.point[0], y - ax.point[1], z - ax.point[2]], dir); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    } catch { continue; }
    const g = groups.find((x) => x.r === undefined ? false : Math.abs(Math.abs(dot3(x.dir, dir)) - 1) < 1e-6 && (() => { const d = [ax.point[0] - x.point[0], ax.point[1] - x.point[1], ax.point[2] - x.point[2]]; const along = dot3(d, x.dir); return Math.hypot(d[0] - x.dir[0] * along, d[1] - x.dir[1] * along, d[2] - x.dir[2] * along) < 1e-5; })() && Math.abs(x.r - ax.r) < 1e-5);
    if (g) { g.span += ax.span; const s0 = dot3([ax.point[0] - g.point[0], ax.point[1] - g.point[1], ax.point[2] - g.point[2]], g.dir) * Math.sign(dot3(dir, g.dir)); g.lo = Math.min(g.lo, lo + s0); g.hi = Math.max(g.hi, hi + s0); }
    else groups.push({ ...ax, lo, hi, k });
  }
  const P = (p) => [dot3(p, b.x), dot3(p, b.y)];
  const marks = []; const lines = [];
  for (const g of groups) {
    if (g.span < Math.PI * 1.5 - 1e-6) continue;
    if (Math.abs(g.k) > 0.999) {
      const c = P(g.point);
      const same = marks.find((m) => dist2(m.c, c) < 1e-4);
      if (same) same.r = Math.max(same.r, g.r); else marks.push({ ctype: 'mark', c, r: g.r });
    } else if (Math.abs(g.k) < 1e-3) {
      const A = g.point.map((v, i) => v + g.dir[i] * g.lo); const B = g.point.map((v, i) => v + g.dir[i] * g.hi);
      const a = P(A); const bb = P(B);
      const u = unit2(sub2(bb, a));
      const line = lines.find((l) => Math.abs(cross2(unit2(sub2(l.b, l.a)), u)) < 1e-6 && Math.abs(cross2(sub2(a, l.a), unit2(sub2(l.b, l.a)))) < 1e-4);
      if (line) {
        const w = unit2(sub2(line.b, line.a)); const s = [dot2(sub2(a, line.a), w), dot2(sub2(bb, line.a), w), 0, dot2(sub2(line.b, line.a), w)];
        const lo = Math.min(...s); const hi = Math.max(...s); const base = line.a;
        line.a = add2(base, w, lo); line.b = add2(base, w, hi);
      } else lines.push({ ctype: 'line', a, b: bb });
    }
  }
  return [...marks, ...lines];
}

// ───────────────────────── model items: the part's sketch dimensions

const ORDER = ['front', 'top', 'right', 'left', 'back', 'bottom'];

/**
 * The part's sketch dimensions (and blind extrude depths), each in the first view that shows it true size:
 * [{ view, dtype, …geometry, model: true, source }] (no text place yet — autoTextOffset() gives one). `part` the
 * part document, `results` the rebuild's results (feature id → { frame }), `views` the sheet's views.
 */
export function modelItemDims(part, results, views) {
  const candidates = [...views].filter((v) => v.kind !== 'detail' && !isPictorial(v)).sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99));
  const bases = candidates.map((v) => ({ v, b: viewBasis(v) })).filter((x) => x.b);
  const out = [];
  const P2 = (b, p) => [dot3(p, b.x), dot3(p, b.y)];
  for (const f of part?.features ?? []) {
    if (f.type !== 'sketch' || f.suppressed) continue;
    const fr = results?.get?.(f.id)?.frame;
    if (!fr) continue;
    const view = bases.find((x) => Math.abs(Math.abs(dot3(x.b.dir, fr.normal)) - 1) < 1e-6);
    if (!view) continue;
    const map = new Map(f.entities.map((e) => [e.id, e]));
    const W = (id) => { const e = map.get(id); return e ? toWorld(fr, [e.x, e.y]) : null; };
    const V = (p3) => (p3 ? P2(view.b, p3) : null);
    const pointOfEnt = (e) => (e?.type === 'point' ? V(W(e.id)) : e?.type === 'circle' || e?.type === 'arc' ? V(W(e.c)) : null);
    const lineOfEnt = (e) => (e?.type === 'line' ? { a: V(W(e.p1)), b: V(W(e.p2)) } : null);
    for (const c of f.constraints ?? []) {
      const ea = map.get(c.a); const eb = c.b ? map.get(c.b) : null;
      let g = null;
      try {
        if (c.type === 'radius' || c.type === 'diameter') {
          const C = pointOfEnt(ea); if (!C) continue;
          const r = ea.type === 'circle' ? ea.r : Math.hypot(map.get(ea.p1).x - map.get(ea.c).x, map.get(ea.p1).y - map.get(ea.c).y);
          g = { dtype: c.type === 'radius' ? 'radial' : 'diameter', c: C, r, full: ea.type === 'circle', start: 0, sweep: TAU };
        } else if (c.type === 'angle') {
          const l1 = lineOfEnt(ea); const l2 = lineOfEnt(eb);
          if (!l1 || !l2) continue;
          const v = lineIntersection(l1.a, l1.b, l2.a, l2.b); if (!v) continue;
          g = { dtype: 'angular', l1: [l1.a, l1.b], l2: [l2.a, l2.b], v, r1: farEnd(l1, v), r2: farEnd(l2, v) };
        } else if (c.type === 'distance' || c.type === 'hdistance' || c.type === 'vdistance') {
          let p1; let p2;
          if (!eb && ea?.type === 'line') { const l = lineOfEnt(ea); p1 = l.a; p2 = l.b; }
          else if (eb) {
            const la = lineOfEnt(ea); const lb = lineOfEnt(eb);
            const pa = pointOfEnt(ea); const pb = pointOfEnt(eb);
            if (c.type !== 'distance') { p1 = pa ?? la?.a; p2 = pb ?? lb?.a; }
            else if (la && lb) { p1 = [(la.a[0] + la.b[0]) / 2, (la.a[1] + la.b[1]) / 2]; p2 = foot(p1, lb.a, lb.b); }
            else if (la && pb) { p1 = pb; p2 = foot(pb, la.a, la.b); }
            else if (lb && pa) { p1 = pa; p2 = foot(pa, lb.a, lb.b); }
            else { p1 = pa; p2 = pb; }
          }
          if (!p1 || !p2 || dist2(p1, p2) < EPS) continue;
          let dtype = 'aligned';
          if (c.type !== 'distance') {
            // The sketch's x (or y) axis as the view shows it.
            const axis = c.type === 'hdistance' ? fr.xDir : fr.yDir;
            const ax2 = P2(view.b, axis);
            dtype = Math.abs(ax2[0]) > Math.abs(ax2[1]) ? 'horizontal' : 'vertical';
          } else if (Math.abs(p1[1] - p2[1]) < 1e-6) dtype = 'horizontal';
          else if (Math.abs(p1[0] - p2[0]) < 1e-6) dtype = 'vertical';
          g = { dtype, p1, p2 };
        }
      } catch { g = null; }
      if (g) out.push({ view: view.v.id, ...g, model: true, source: `${f.id}:${c.id ?? out.length}` });
    }
    // A blind extrude of this sketch: its depth in a view that shows the extrusion side-on.
    for (const ex of part.features) {
      if (ex.type !== 'extrude' || ex.sketch !== f.id || ex.suppressed || ex.end !== 'blind' || !(Number(ex.depth) > 0)) continue;
      const side = bases.find((x) => Math.abs(dot3(x.b.dir, fr.normal)) < 1e-6);
      if (!side) continue;
      const pts = f.entities.filter((e) => e.type === 'point').map((e) => toWorld(fr, [e.x, e.y]));
      if (!pts.length) continue;
      // The profile point furthest along the view's x axis: the depth is shown at the side of the view.
      const q = pts.reduce((m, p) => (dot3(p, side.b.x) > dot3(m, side.b.x) ? p : m), pts[0]);
      const sgn = ex.reverse ? -1 : 1;
      const q2 = q.map((v, i) => v + fr.normal[i] * Number(ex.depth) * sgn);
      const p1 = P2(side.b, q); const p2 = P2(side.b, q2);
      out.push({ view: side.v.id, dtype: Math.abs(p1[1] - p2[1]) < 1e-6 ? 'horizontal' : Math.abs(p1[0] - p2[0]) < 1e-6 ? 'vertical' : 'aligned', p1, p2, model: true, source: `${ex.id}:depth` });
    }
  }
  return out;
}
