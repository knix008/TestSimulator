// FreeCAD Sketcher geometry that is not a plain drawing tool: B-spline editing
// (degree, knots, multiplicity, conversion of any curve to NURBS, joining,
// interpolation, periodic curves), conics (parabolic and hyperbolic arcs),
// the shapes the Sketcher builds out of lines and arcs with their constraints
// (rectangles, rounded rectangles, regular polygons, arc slots), splitting an
// edge, the B-spline overlays (control polygon, curvature comb, knots,
// weights), internal alignment geometry and the sketch validation.
//
// A NURBS here is { degree, points: [{ x, y }], knots (full vector), weights | null }.

import { addConstraint, pointsOf, entityPoint } from './constraints.js';
import { basisFunctions, clampedKnots, curvePoint, curveRange, findSpan, throughPoints } from './nurbs.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;

// ───────────────────────── NURBS basics

export const fullKnots = (s) => (Array.isArray(s.knots) && s.knots.length === s.points.length + s.degree + 1 ? s.knots : clampedKnots(s.points.length, Math.min(s.degree, s.points.length - 1)));
const asCurve = (s) => ({ degree: s.degree, points: s.points.map((p) => [p.x, p.y]), knots: fullKnots(s), weights: s.weights ?? null });
/** A point on the curve at parameter u. */
export const nurbsPoint = (s, u) => { const [x, y] = curvePoint(asCurve(s), u); return { x, y }; };
/** The parameter range [a, b]. */
export const nurbsRange = (s) => curveRange(asCurve(s));
/** Points along the curve. */
export function nurbsSample(s, count = 64) {
  const [a, b] = nurbsRange(s);
  return Array.from({ length: count + 1 }, (_, i) => nurbsPoint(s, a + ((b - a) * i) / count));
}

/** Homogeneous control points [xw, yw, w]. */
const toH = (s) => s.points.map((p, i) => { const w = s.weights?.[i] ?? 1; return [p.x * w, p.y * w, w]; });
function fromH(H, degree, knots) {
  const rational = H.some((h) => Math.abs(h[2] - 1) > 1e-9);
  return { degree, knots, points: H.map((h) => ({ x: h[0] / h[2], y: h[1] / h[2] })), weights: rational ? H.map((h) => h[2]) : null };
}
/** The homogeneous (polynomial) curve, as a 3D B-spline. */
const homogeneous = (s) => ({ degree: s.degree, points: toH(s), knots: fullKnots(s) });

/** Distinct inner knots with their multiplicities. */
export function knotInfo(s) {
  const K = fullKnots(s);
  const [a, b] = nurbsRange(s);
  const out = [];
  for (const k of K) {
    if (k <= a + 1e-12 || k >= b - 1e-12) continue;
    const last = out[out.length - 1];
    if (last && near(last.u, k)) last.mult += 1; else out.push({ u: k, mult: 1 });
  }
  return out;
}

/** Knot insertion (Boehm, The NURBS Book A5.1) — exact. A knot is never made more than `degree` times. */
export function insertKnot(s, u, times = 1) {
  const p = s.degree;
  const [a, b] = nurbsRange(s);
  if (!(u > a + 1e-12 && u < b - 1e-12)) return s;
  let K = fullKnots(s).slice();
  let H = toH(s);
  for (let t = 0; t < times; t++) {
    const n = H.length - 1;
    if (K.filter((k) => near(k, u)).length >= p) break;
    const k = findSpan(n, p, u, K);
    const Q = [];
    for (let i = 0; i <= n + 1; i++) {
      if (i <= k - p) Q.push(H[i]);
      else if (i > k) Q.push(H[i - 1]);
      else {
        const alpha = (u - K[i]) / (K[i + p] - K[i]);
        Q.push(H[i].map((v, j) => alpha * v + (1 - alpha) * H[i - 1][j]));
      }
    }
    K = [...K.slice(0, k + 1), u, ...K.slice(k + 1)];
    H = Q;
  }
  return fromH(H, p, K);
}

/** The same curve with clamped ends (a periodic / unclamped curve is cut to its range) — exact. */
export function clampNurbs(s) {
  const p = s.degree;
  const [a, b] = nurbsRange(s);
  let out = s;
  let K = fullKnots(out);
  if (!K.slice(0, p + 1).every((k) => near(k, a))) {
    // Insert a until it is there p times (Boehm cannot insert at the range end, so step in from the inside).
    let H = toH(out);
    K = fullKnots(out).slice();
    for (let guard = 0; guard < p + 2 && K.filter((k) => near(k, a)).length < p; guard++) {
      const n = H.length - 1;
      const k = findSpan(n, p, a, K);
      const Q = [];
      for (let i = 0; i <= n + 1; i++) {
        if (i <= k - p) Q.push(H[i]);
        else if (i > k) Q.push(H[i - 1]);
        else { const alpha = (a - K[i]) / (K[i + p] - K[i]); Q.push(H[i].map((v, j) => alpha * v + (1 - alpha) * H[i - 1][j])); }
      }
      K = [...K.slice(0, k + 1), a, ...K.slice(k + 1)];
      H = Q;
    }
    const f = K.findIndex((k) => near(k, a));
    H = H.slice(f - 1);
    K = [a, ...K.slice(f)];
    out = fromH(H, p, K);
  }
  K = fullKnots(out).slice();
  if (!K.slice(-(p + 1)).every((k) => near(k, b))) {
    let H = toH(out);
    for (let guard = 0; guard < p + 2 && K.filter((k) => near(k, b)).length < p; guard++) {
      const n = H.length - 1;
      // The span just below b.
      let k = p;
      for (let i = p; i < K.length - 1; i++) if (K[i] < b - 1e-12) k = i;
      const Q = [];
      for (let i = 0; i <= n + 1; i++) {
        if (i <= k - p) Q.push(H[i]);
        else if (i > k) Q.push(H[i - 1]);
        else { const alpha = (b - K[i]) / (K[i + p] - K[i]); Q.push(H[i].map((v, j) => alpha * v + (1 - alpha) * H[i - 1][j])); }
      }
      K = [...K.slice(0, k + 1), b, ...K.slice(k + 1)];
      H = Q;
    }
    const g = K.findIndex((k) => near(k, b));
    H = H.slice(0, g);
    K = [...K.slice(0, g + p), b];
    out = fromH(H, p, K);
  }
  return out;
}

/** Solves A X = B (A n×n, B n×m) by Gaussian elimination with partial pivoting; null when singular. */
export function solveSystem(A, B) {
  const n = A.length;
  const m = B[0].length;
  const M = A.map((row, i) => [...row, ...B[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-14) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (!f) continue;
      for (let k = col; k < n + m; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row.slice(n).map((v) => v / M[i][i]));
}

/** Basis row of a knot vector at u (all control points). */
function basisRow(count, p, K, u) {
  const row = new Array(count).fill(0);
  const span = findSpan(count - 1, p, u, K);
  const N = basisFunctions(span, u, p, K);
  for (let j = 0; j <= p; j++) row[span - p + j] = N[j];
  return row;
}

/**
 * The curve refitted into another space (degree, knots) by least squares on its
 * homogeneous form, ends kept. Exact when the space contains the curve
 * (degree elevation), the nearest curve otherwise (degree or knot reduction).
 */
export function fitInto(s, degree, knots) {
  const src = clampNurbs(s);
  const hom = homogeneous(src);
  const [a, b] = nurbsRange(src);
  const ka = knots[degree];
  const kb = knots[knots.length - 1 - degree];
  const count = knots.length - degree - 1;
  const samples = Math.max(240, count * 24);
  const A = Array.from({ length: count }, () => new Array(count).fill(0));
  const B = Array.from({ length: count }, () => [0, 0, 0]);
  for (let j = 0; j <= samples; j++) {
    const f = j / samples;
    const q = curvePoint(hom, a + (b - a) * f);
    const row = basisRow(count, degree, knots, ka + (kb - ka) * f);
    const w = j === 0 || j === samples ? 1e8 : 1;
    for (let r = 0; r < count; r++) {
      if (!row[r]) continue;
      for (let c = 0; c < count; c++) A[r][c] += w * row[r] * row[c];
      for (let k = 0; k < 3; k++) B[r][k] += w * row[r] * q[k];
    }
  }
  const X = solveSystem(A, B);
  if (!X) return null;
  // Weights must stay positive.
  return fromH(X.map((h) => (h[2] > 1e-6 ? h : [h[0] / h[2] * 1e-6, h[1] / h[2] * 1e-6, 1e-6])), degree, knots.slice());
}

/** Distinct knots with multiplicities of a full (clamped) vector, ends included. */
function knotRuns(K) {
  const runs = [];
  for (const k of K) {
    const last = runs[runs.length - 1];
    if (last && near(last.u, k)) last.mult += 1; else runs.push({ u: k, mult: 1 });
  }
  return runs;
}
const fromRuns = (runs) => runs.flatMap((r) => Array(r.mult).fill(r.u));

/** Sketcher_BSplineIncreaseDegree: one degree more, the same curve. */
export function elevateDegree(s) {
  const c = clampNurbs(s);
  if (c.degree >= 9) return c;
  const runs = knotRuns(fullKnots(c)).map((r) => ({ u: r.u, mult: r.mult + 1 }));
  return fitInto(c, c.degree + 1, fromRuns(runs)) ?? c;
}

/** Sketcher_BSplineDecreaseDegree: one degree less (the nearest such curve). */
export function reduceDegree(s) {
  const c = clampNurbs(s);
  if (c.degree <= 1) return c;
  const p = c.degree - 1;
  const runs = knotRuns(fullKnots(c));
  const [a, b] = [runs[0].u, runs[runs.length - 1].u];
  let inner = runs.slice(1, -1).map((r) => ({ u: r.u, mult: Math.min(r.mult, p) }));
  // Like FreeCAD's approximation: knots are added (each span halved) until the curve stays within a tolerance of the original.
  const pts = nurbsSample(c, 200);
  const size = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
  let best = c;
  for (let round = 0; round < 6; round++) {
    const knots = [...Array(p + 1).fill(a), ...fromRuns(inner), ...Array(p + 1).fill(b)];
    const fit = fitInto(c, p, knots);
    if (!fit) break;
    best = fit;
    const worst = Math.max(...pts.map((q, i) => Math.hypot(q.x - nurbsPoint(fit, a + ((b - a) * i) / 200).x, q.y - nurbsPoint(fit, a + ((b - a) * i) / 200).y)));
    if (worst <= size * 1e-3) break;
    const cuts = [a, ...inner.map((r) => r.u), b];
    inner = [...inner, ...cuts.slice(1).map((u, i) => ({ u: (u + cuts[i]) / 2, mult: 1 }))].sort((x, y) => x.u - y.u);
  }
  return best;
}

/** Sketcher_BSplineDecreaseKnotMultiplicity: a knot one time less (gone at 0) — the nearest curve. */
export function removeKnot(s, u) {
  const c = clampNurbs(s);
  const K = fullKnots(c);
  const i = K.findIndex((k, index) => near(k, u, 1e-9) && index > c.degree && index < K.length - 1 - c.degree);
  if (i < 0) return c;
  const knots = [...K.slice(0, i), ...K.slice(i + 1)];
  return fitInto(c, c.degree, knots) ?? c;
}

/** Sketcher_BSplineIncreaseKnotMultiplicity: a knot one time more (at most the degree). */
export const increaseMultiplicity = (s, u) => insertKnot(clampNurbs(s), u, 1);

/** The reversed curve. */
export function reverseNurbs(s) {
  const K = fullKnots(s);
  const sum = K[0] + K[K.length - 1];
  return { degree: s.degree, points: s.points.slice().reverse(), knots: K.map((k) => sum - k).reverse(), weights: s.weights ? s.weights.slice().reverse() : null };
}

/** The knots rescaled to [0, 1] (or [from, to]). */
export function rescaleKnots(s, from = 0, to = 1) {
  const K = fullKnots(s);
  const a = K[0];
  const span = K[K.length - 1] - a || 1;
  return { ...s, knots: K.map((k) => from + ((k - a) / span) * (to - from)) };
}

/** The curve parameter nearest to a point. */
export function nearestParameter(s, p) {
  const [a, b] = nurbsRange(s);
  const n = 400;
  let best = a;
  let bestD = Infinity;
  for (let i = 0; i <= n; i++) {
    const u = a + ((b - a) * i) / n;
    const d = dist(nurbsPoint(s, u), p);
    if (d < bestD) { bestD = d; best = u; }
  }
  // Refine by golden-section search around the best sample.
  let lo = Math.max(a, best - (b - a) / n);
  let hi = Math.min(b, best + (b - a) / n);
  for (let k = 0; k < 60; k++) {
    const m1 = lo + (hi - lo) * 0.382;
    const m2 = lo + (hi - lo) * 0.618;
    if (dist(nurbsPoint(s, m1), p) < dist(nurbsPoint(s, m2), p)) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}

/** Splits a curve at u into two (exact). */
export function splitNurbs(s, u) {
  const c = clampNurbs(s);
  const [a, b] = nurbsRange(c);
  if (!(u > a + 1e-9 && u < b - 1e-9)) return null;
  const p = c.degree;
  const full = insertKnot(c, u, p);
  const K = fullKnots(full);
  const f = K.findIndex((k) => near(k, u, 1e-12));
  const r = f - 1;
  const left = { degree: p, points: full.points.slice(0, r + 1), knots: [...K.slice(0, f + p), u], weights: full.weights?.slice(0, r + 1) ?? null };
  const right = { degree: p, points: full.points.slice(r), knots: [u, ...K.slice(f)], weights: full.weights?.slice(r) ?? null };
  return [rescaleKnots(left), rescaleKnots(right)];
}

/** Sketcher_JoinCurves: two curves meeting at an end, as one B-spline (C0 at the joint). */
export function joinNurbs(first, second, tolerance = 1e-3) {
  let s1 = clampNurbs(first);
  let s2 = clampNurbs(second);
  const ends = (s) => [s.points[0], s.points[s.points.length - 1]];
  // Turn them so the first one's end meets the second one's start.
  const options = [[false, false], [true, false], [false, true], [true, true]].map(([r1, r2]) => {
    const e1 = ends(s1)[r1 ? 0 : 1];
    const e2 = ends(s2)[r2 ? 1 : 0];
    return { r1, r2, d: dist(e1, e2) };
  }).sort((x, y) => x.d - y.d);
  const best = options[0];
  if (best.d > tolerance) return null;
  if (best.r1) s1 = reverseNurbs(s1);
  if (best.r2) s2 = reverseNurbs(s2);
  while (s1.degree < s2.degree) s1 = elevateDegree(s1);
  while (s2.degree < s1.degree) s2 = elevateDegree(s2);
  s1 = rescaleKnots(s1, 0, 1);
  s2 = rescaleKnots(s2, 1, 2);
  const p = s1.degree;
  const K1 = fullKnots(s1);
  const K2 = fullKnots(s2);
  // The second curve's weights scaled so both agree at the joint.
  const w1 = s1.weights ?? s1.points.map(() => 1);
  const w2raw = s2.weights ?? s2.points.map(() => 1);
  const scale = w1[w1.length - 1] / w2raw[0];
  const w2 = w2raw.map((w) => w * scale);
  const points = [...s1.points, ...s2.points.slice(1)];
  const weights = [...w1, ...w2.slice(1)];
  const knots = [...K1.slice(0, K1.length - (p + 1)), ...Array(p).fill(1), ...K2.slice(p + 1)];
  const rational = weights.some((w) => Math.abs(w - 1) > 1e-9);
  return rescaleKnots({ degree: p, points, knots, weights: rational ? weights : null }, 0, 1);
}

// ───────────────────────── conversion of drawn geometry to NURBS

/** An arc of an ellipse (rx, ry, rotated by `rotation` degrees) from start to end (parameter degrees), as rational quadratic pieces. */
export function arcNurbs(c, rx, ry, start, end, rotation = 0) {
  let sweep = end - start;
  if (sweep <= 1e-9) sweep += 360 * Math.ceil((1e-9 - sweep) / 360);
  sweep = Math.min(sweep, 360);
  const n = Math.max(1, Math.ceil(sweep / 90 - 1e-9));
  const d = sweep / n;
  const h = rad(d / 2);
  const [cr, sr] = [Math.cos(rad(rotation)), Math.sin(rad(rotation))];
  const map = (u, v) => ({ x: c.x + rx * u * cr - ry * v * sr, y: c.y + rx * u * sr + ry * v * cr });
  const at = (angle, f = 1) => map(Math.cos(rad(angle)) * f, Math.sin(rad(angle)) * f);
  const points = [at(start)];
  const weights = [1];
  for (let i = 0; i < n; i++) {
    const a0 = start + i * d;
    points.push(at(a0 + d / 2, 1 / Math.cos(h)), at(a0 + d));
    weights.push(Math.cos(h), 1);
  }
  const knots = [0, 0, 0];
  for (let i = 1; i < n; i++) knots.push(i / n, i / n);
  knots.push(1, 1, 1);
  return { degree: 2, points, knots, weights };
}

/** Sketcher_BSplineConvertToNURBS: an entity as a NURBS (null when it cannot be). */
export function toNurbs(e) {
  const lin = (pts) => ({ degree: 1, points: pts, knots: clampedKnots(pts.length, 1), weights: null });
  switch (e?.type) {
    case 'line': return lin([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]);
    case 'arc': return arcNurbs({ x: e.cx, y: e.cy }, e.r, e.r, e.start, e.end);
    case 'circle': return arcNurbs({ x: e.cx, y: e.cy }, e.r, e.r, 0, 360);
    case 'ellipse': return arcNurbs({ x: e.cx, y: e.cy }, e.rx, e.ry, e.start ?? 0, e.end ?? 360, e.angle ?? 0);
    case 'polyline': return e.points.length >= 2 ? lin(e.closed ? [...e.points, e.points[0]] : e.points.slice()) : null;
    case 'rect': {
      const a = rad(e.angle ?? 0);
      const corner = (dx, dy) => ({ x: e.x + dx * Math.cos(a) - dy * Math.sin(a), y: e.y + dx * Math.sin(a) + dy * Math.cos(a) });
      const pts = [corner(0, 0), corner(e.width, 0), corner(e.width, e.height), corner(0, e.height)];
      return lin([...pts, pts[0]]);
    }
    case 'polygon': {
      const pts = Array.from({ length: e.sides }, (_, i) => ({ x: e.cx + e.r * Math.cos(rad(e.angle + (i * 360) / e.sides)), y: e.cy + e.r * Math.sin(rad(e.angle + (i * 360) / e.sides)) }));
      return lin([...pts, pts[0]]);
    }
    case 'spline': return { degree: e.degree, points: e.points.map((p) => ({ x: p.x, y: p.y })), knots: fullKnots(e).slice(), weights: e.weights ? e.weights.slice() : null };
    default: return null;
  }
}

/** Entity data of a spline from a NURBS. */
export function splineData(s, extra = {}) {
  const closed = s.points.length > 2 && dist(nurbsPoint(s, nurbsRange(s)[0]), nurbsPoint(s, nurbsRange(s)[1])) < 1e-9;
  return { points: s.points.map((p) => ({ x: p.x, y: p.y })), degree: s.degree, knots: fullKnots(s).slice(), weights: s.weights ? s.weights.slice() : null, closed, ...extra };
}

// ───────────────────────── new curves

/** Sketcher_CreateBSplineByInterpolation: a B-spline through points (global interpolation, chord-length parameters). */
export function interpolate(points, degree = 3) {
  const n = points.length - 1;
  if (n < 1) return null;
  const p = Math.min(degree, n);
  const chords = points.slice(1).map((q, i) => dist(q, points[i]));
  const total = chords.reduce((s, v) => s + v, 0) || 1;
  const t = [0];
  for (const c of chords) t.push(t[t.length - 1] + c / total);
  t[n] = 1;
  const knots = [...Array(p + 1).fill(0)];
  for (let j = 1; j <= n - p; j++) {
    let sum = 0;
    for (let i = j; i <= j + p - 1; i++) sum += t[i];
    knots.push(sum / p);
  }
  knots.push(...Array(p + 1).fill(1));
  const A = t.map((u) => basisRow(n + 1, p, knots, u));
  const X = solveSystem(A, points.map((q) => [q.x, q.y]));
  if (!X) return null;
  return { degree: p, points: X.map(([x, y]) => ({ x, y })), knots, weights: null };
}

/** Sketcher_CreatePeriodicBSplineByInterpolation: a closed smooth curve through points. */
export function interpolatePeriodic(points) {
  const curve = throughPoints(points.map((q) => [q.x, q.y]), true);
  return { degree: curve.degree, points: curve.points.map(([x, y]) => ({ x, y })), knots: curve.knots, weights: null };
}

/** Sketcher_CreatePeriodicBSpline: a closed B-spline from control points (uniform, poles wrapped). */
export function periodicSpline(poles, degree = 3) {
  const p = Math.max(1, Math.min(degree, poles.length - 1));
  const points = [...poles, ...poles.slice(0, p)].map((q) => ({ x: q.x, y: q.y }));
  const m = points.length + p + 1;
  return { degree: p, points, knots: Array.from({ length: m }, (_, i) => i / (m - 1)), weights: null };
}

/** Sketcher_CreateArcOfParabola: vertex, focus, and where the arc starts and ends (projected across the axis). */
export function parabolaArc(vertex, focus, from, to) {
  const f = dist(vertex, focus);
  if (f < 1e-9) return null;
  const ax = { x: (focus.x - vertex.x) / f, y: (focus.y - vertex.y) / f };
  const nx = { x: -ax.y, y: ax.x };
  const world = (x, y) => ({ x: vertex.x + ax.x * x + nx.x * y, y: vertex.y + ax.y * x + nx.y * y });
  const across = (q) => (q.x - vertex.x) * nx.x + (q.y - vertex.y) * nx.y;
  let t0 = across(from);
  let t1 = across(to);
  if (Math.abs(t1 - t0) < 1e-9) return null;
  if (t1 < t0) [t0, t1] = [t1, t0];
  const P = (t) => world((t * t) / (4 * f), t);
  return { degree: 2, points: [P(t0), world((t0 * t1) / (4 * f), (t0 + t1) / 2), P(t1)], knots: [0, 0, 0, 1, 1, 1], weights: null };
}

/** Sketcher_CreateArcOfHyperbola: centre, vertex (a), a point fixing b, and the arc's ends (on the vertex's branch). */
export function hyperbolaArc(center, vertex, bPoint, from, to) {
  const a = dist(center, vertex);
  if (a < 1e-9) return null;
  const u = { x: (vertex.x - center.x) / a, y: (vertex.y - center.y) / a };
  const n = { x: -u.y, y: u.x };
  const local = (q) => ({ x: (q.x - center.x) * u.x + (q.y - center.y) * u.y, y: (q.x - center.x) * n.x + (q.y - center.y) * n.y });
  const lb = local(bPoint);
  const b = Math.abs(lb.x) > a * (1 + 1e-6) ? Math.abs(lb.y) / Math.sqrt((lb.x * lb.x) / (a * a) - 1) : Math.max(Math.abs(lb.y), a);
  if (!(b > 1e-9)) return null;
  const param = (q) => Math.asinh(local(q).y / b);
  let s0 = param(from);
  let s1 = param(to);
  if (Math.abs(s1 - s0) < 1e-9) return null;
  if (s1 < s0) [s0, s1] = [s1, s0];
  const world = (x, y) => ({ x: center.x + u.x * x + n.x * y, y: center.y + u.y * x + n.y * y });
  const H = (s) => world(a * Math.cosh(s), b * Math.sinh(s));
  const m = (s0 + s1) / 2;
  const h = (s1 - s0) / 2;
  return { degree: 2, points: [H(s0), world((a * Math.cosh(m)) / Math.cosh(h), (b * Math.sinh(m)) / Math.cosh(h)), H(s1)], knots: [0, 0, 0, 1, 1, 1], weights: [1, Math.cosh(h), 1], conic: { a, b } };
}

/** Sketcher_Create3PointCircle: the circle through three points (null when they are in a line). */
export function circleThrough(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p) => p.x * p.x + p.y * p.y;
  const cx = (s(a) * (b.y - c.y) + s(b) * (c.y - a.y) + s(c) * (a.y - b.y)) / d;
  const cy = (s(a) * (c.x - b.x) + s(b) * (a.x - c.x) + s(c) * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

/** Sketcher_CreateArc: centre, start point, end direction (counter-clockwise). */
export function arcFromCenter(c, start, end) {
  const r = dist(c, start);
  if (r < 1e-9) return null;
  const a0 = deg(Math.atan2(start.y - c.y, start.x - c.x));
  let a1 = deg(Math.atan2(end.y - c.y, end.x - c.x));
  const norm = (v) => ((v % 360) + 360) % 360;
  if (Math.abs(norm(a1) - norm(a0)) < 1e-9) return null;
  a1 = norm(a1);
  return { cx: c.x, cy: c.y, r, start: norm(a0), end: a1 };
}

/** Sketcher_CreateEllipseBy3Points: the two ends of the major axis, then a point on the ellipse. */
export function ellipseFrom3(p1, p2, q) {
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const rx = dist(p1, p2) / 2;
  if (rx < 1e-9) return null;
  const angle = deg(Math.atan2(p2.y - p1.y, p2.x - p1.x));
  const c = Math.cos(rad(angle));
  const s = Math.sin(rad(angle));
  const lx = (q.x - cx) * c + (q.y - cy) * s;
  const ly = -(q.x - cx) * s + (q.y - cy) * c;
  const f = 1 - (lx * lx) / (rx * rx);
  const ry = f > 1e-9 ? Math.abs(ly) / Math.sqrt(f) : Math.abs(ly);
  return ry > 1e-9 ? { cx, cy, rx, ry: Math.min(ry, rx * 1e3), angle } : null;
}

// ───────────────────────── shapes made of lines and arcs, with their constraints

/**
 * A shape: { entities: [{ key, type, data }], constraints: [{ type, refs: [{ key, at }], value }] }.
 * insertShape adds it to a drawing (ids made by addEntity) and returns the new entities.
 */
export function insertShape(drawing, shape, addEntity) {
  const ids = {};
  const made = shape.entities.map((item) => {
    const entity = addEntity(drawing, item.type, item.data);
    ids[item.key] = entity.id;
    return entity;
  });
  for (const c of shape.constraints) {
    addConstraint(drawing, c.type, c.refs.map((r) => ({ id: ids[r.key], ...(r.at ? { at: r.at } : {}) })), c.value ?? null);
  }
  return made;
}

const line = (key, a, b, extra = {}) => ({ key, type: 'line', data: { x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...extra } });
const coincident = (a, atA, b, atB) => ({ type: 'coincident', refs: [{ key: a, at: atA }, { key: b, at: atB }] });

/** Sketcher_CreateRegularPolygon / Triangle … Octagon: n lines, equal, with their corners on a construction circle. */
export function polygonShape(center, vertex, sides) {
  const r = dist(center, vertex);
  if (r < 1e-9 || sides < 3) return null;
  const a0 = Math.atan2(vertex.y - center.y, vertex.x - center.x);
  const v = Array.from({ length: sides }, (_, i) => ({ x: center.x + r * Math.cos(a0 + (i * 2 * Math.PI) / sides), y: center.y + r * Math.sin(a0 + (i * 2 * Math.PI) / sides) }));
  const entities = v.map((p, i) => line(`l${i}`, p, v[(i + 1) % sides]));
  entities.push({ key: 'circle', type: 'circle', data: { cx: center.x, cy: center.y, r, construction: true } });
  const constraints = [];
  for (let i = 0; i < sides; i++) {
    constraints.push(coincident(`l${i}`, 'p2', `l${(i + 1) % sides}`, 'p1'));
    constraints.push({ type: 'pointOnObject', refs: [{ key: `l${i}`, at: 'p1' }, { key: 'circle' }] });
    if (i) constraints.push({ type: 'equal', refs: [{ key: 'l0' }, { key: `l${i}` }] });
  }
  return { entities, constraints };
}

/** Sketcher_CreateRectangle (also centred and square): four lines, joined, horizontal and vertical. */
export function rectangleShape(a, b, { square = false } = {}) {
  let [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  let [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  if (square) {
    const side = Math.max(x1 - x0, y1 - y0);
    if (b.x < a.x) x0 = x1 - side; else x1 = x0 + side;
    if (b.y < a.y) y0 = y1 - side; else y1 = y0 + side;
  }
  if (x1 - x0 < 1e-9 || y1 - y0 < 1e-9) return null;
  const c = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const keys = ['bottom', 'right', 'top', 'left'];
  const entities = keys.map((k, i) => line(k, c[i], c[(i + 1) % 4]));
  const constraints = keys.map((k, i) => coincident(k, 'p2', keys[(i + 1) % 4], 'p1'));
  constraints.push({ type: 'horizontal', refs: [{ key: 'bottom' }] }, { type: 'horizontal', refs: [{ key: 'top' }] }, { type: 'vertical', refs: [{ key: 'right' }] }, { type: 'vertical', refs: [{ key: 'left' }] });
  if (square) constraints.push({ type: 'equal', refs: [{ key: 'bottom' }, { key: 'right' }] });
  return { entities, constraints };
}

/** Sketcher_CreateRectangle_Center: from the centre and a corner. */
export const centeredRectangleShape = (center, corner, options) => rectangleShape({ x: 2 * center.x - corner.x, y: 2 * center.y - corner.y }, corner, options);

/** Sketcher_CreateOblong: a rounded rectangle — four lines and four tangent arcs of equal radius. */
export function roundedRectangleShape(a, b, radius) {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  const r = Math.min(radius, (x1 - x0) / 2 - 1e-6, (y1 - y0) / 2 - 1e-6);
  if (!(r > 1e-6)) return rectangleShape(a, b);
  const P = (x, y) => ({ x, y });
  const arc = (key, cx, cy, start) => ({ key, type: 'arc', data: { cx, cy, r, start, end: start + 90 } });
  const entities = [
    line('bottom', P(x0 + r, y0), P(x1 - r, y0)), arc('br', x1 - r, y0 + r, 270),
    line('right', P(x1, y0 + r), P(x1, y1 - r)), arc('tr', x1 - r, y1 - r, 0),
    line('top', P(x1 - r, y1), P(x0 + r, y1)), arc('tl', x0 + r, y1 - r, 90),
    line('left', P(x0, y1 - r), P(x0, y0 + r)), arc('bl', x0 + r, y0 + r, 180),
  ];
  const order = [['bottom', 'br'], ['br', 'right'], ['right', 'tr'], ['tr', 'top'], ['top', 'tl'], ['tl', 'left'], ['left', 'bl'], ['bl', 'bottom']];
  const constraints = order.map(([from, to]) => coincident(from, from.length === 2 ? 'end' : 'p2', to, to.length === 2 ? 'start' : 'p1'));
  for (const [l, k] of [['bottom', 'br'], ['right', 'tr'], ['top', 'tl'], ['left', 'bl'], ['bottom', 'bl'], ['right', 'br'], ['top', 'tr'], ['left', 'tl']]) constraints.push({ type: 'tangent', refs: [{ key: l }, { key: k }] });
  constraints.push({ type: 'horizontal', refs: [{ key: 'bottom' }] }, { type: 'horizontal', refs: [{ key: 'top' }] }, { type: 'vertical', refs: [{ key: 'right' }] }, { type: 'vertical', refs: [{ key: 'left' }] });
  for (const k of ['tr', 'tl', 'bl']) constraints.push({ type: 'equal', refs: [{ key: 'br' }, { key: k }] });
  return { entities, constraints };
}

/** Sketcher_CreateArcSlot: a slot along an arc — two concentric arcs closed by two half circles. */
export function arcSlotShape(center, r, start, end, width) {
  const w = Math.min(width, r * 2 - 1e-6) / 2;
  if (!(w > 1e-9) || r < 1e-9) return null;
  let sweep = end - start;
  if (sweep <= 0) sweep += 360;
  if (sweep >= 359.999) return null;
  const e = start + sweep;
  const pol = (a, rr) => ({ x: center.x + rr * Math.cos(rad(a)), y: center.y + rr * Math.sin(rad(a)) });
  const ps = pol(start, r);
  const pe = pol(e, r);
  const entities = [
    { key: 'outer', type: 'arc', data: { cx: center.x, cy: center.y, r: r + w, start, end: e } },
    { key: 'inner', type: 'arc', data: { cx: center.x, cy: center.y, r: r - w, start, end: e } },
    { key: 'cap0', type: 'arc', data: { cx: ps.x, cy: ps.y, r: w, start: start + 180, end: start + 360 } },
    { key: 'cap1', type: 'arc', data: { cx: pe.x, cy: pe.y, r: w, start: e, end: e + 180 } },
  ];
  const constraints = [
    coincident('outer', 'start', 'cap0', 'end'), coincident('cap0', 'start', 'inner', 'start'),
    coincident('inner', 'end', 'cap1', 'end'), coincident('cap1', 'start', 'outer', 'end'),
    { type: 'concentric', refs: [{ key: 'outer' }, { key: 'inner' }] },
    { type: 'equal', refs: [{ key: 'cap0' }, { key: 'cap1' }] },
    ...['cap0', 'cap1'].flatMap((cap) => ['outer', 'inner'].map((k) => ({ type: 'tangent', refs: [{ key: k }, { key: cap }] }))),
  ];
  return { entities, constraints };
}

// ───────────────────────── splitting an edge

const norm360 = (v) => ((v % 360) + 360) % 360;

/**
 * Sketcher_Split: an edge cut at the point nearest p.
 * Returns { pieces: [{ type, data }], refMap(at) → { piece, at } | null } or null.
 */
export function splitEdge(e, p) {
  const keep = { layer: e.layer, color: e.color, lineType: e.lineType, lineWidth: e.lineWidth, ...(e.construction ? { construction: true } : {}), ...(e.group ? { group: e.group } : {}) };
  switch (e.type) {
    case 'line': {
      const dx = e.x2 - e.x1; const dy = e.y2 - e.y1;
      const t = ((p.x - e.x1) * dx + (p.y - e.y1) * dy) / (dx * dx + dy * dy || 1);
      if (!(t > 1e-6 && t < 1 - 1e-6)) return null;
      const q = { x: e.x1 + dx * t, y: e.y1 + dy * t };
      return { pieces: [{ type: 'line', data: { ...keep, x1: e.x1, y1: e.y1, x2: q.x, y2: q.y } }, { type: 'line', data: { ...keep, x1: q.x, y1: q.y, x2: e.x2, y2: e.y2 } }], refMap: (at) => (at === 'p1' ? { piece: 0, at: 'p1' } : at === 'p2' ? { piece: 1, at: 'p2' } : null) };
    }
    case 'arc': {
      const a = norm360(deg(Math.atan2(p.y - e.cy, p.x - e.cx)));
      const sweep = norm360(e.end - e.start) || 360;
      const into = norm360(a - e.start);
      if (!(into > 1e-6 && into < sweep - 1e-6)) return null;
      const arc = (start, end) => ({ type: 'arc', data: { ...keep, cx: e.cx, cy: e.cy, r: e.r, start: norm360(start), end: norm360(end) } });
      return { pieces: [arc(e.start, a), arc(a, e.end)], refMap: (at) => (at === 'start' ? { piece: 0, at: 'start' } : at === 'end' ? { piece: 1, at: 'end' } : at === 'c' ? { piece: 0, at: 'c' } : null) };
    }
    case 'circle': {
      const a = norm360(deg(Math.atan2(p.y - e.cy, p.x - e.cx)));
      const arc = (start, end) => ({ type: 'arc', data: { ...keep, cx: e.cx, cy: e.cy, r: e.r, start: norm360(start), end: norm360(end) } });
      return { pieces: [arc(a, a + 180), arc(a + 180, a + 360)], refMap: (at) => (at === 'c' ? { piece: 0, at: 'c' } : null) };
    }
    case 'ellipse': {
      const c = Math.cos(rad(e.angle)); const s = Math.sin(rad(e.angle));
      const lx = (p.x - e.cx) * c + (p.y - e.cy) * s;
      const ly = -(p.x - e.cx) * s + (p.y - e.cy) * c;
      const t = norm360(deg(Math.atan2(ly / e.ry, lx / e.rx)));
      const full = (e.end ?? 360) - (e.start ?? 0) >= 360 - 1e-9;
      const ell = (start, end) => ({ type: 'ellipse', data: { ...keep, cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, angle: e.angle, start, end } });
      if (full) return { pieces: [ell(t, t + 180), ell(t + 180, t + 360)], refMap: () => null };
      let tt = t;
      while (tt < e.start) tt += 360;
      if (!(tt > e.start + 1e-6 && tt < e.end - 1e-6)) return null;
      return { pieces: [ell(e.start, tt), ell(tt, e.end)], refMap: () => null };
    }
    case 'polyline': {
      const pts = e.closed ? [...e.points, e.points[0]] : e.points;
      let best = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]; const b = pts[i + 1];
        const dx = b.x - a.x; const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const q = { x: a.x + dx * t, y: a.y + dy * t };
        const d = dist(q, p);
        if (!best || d < best.d) best = { d, i, q };
      }
      if (!best) return null;
      const first = [...pts.slice(0, best.i + 1), best.q];
      const second = [best.q, ...pts.slice(best.i + 1)];
      if (e.closed) return { pieces: [{ type: 'polyline', data: { ...keep, points: [...second, ...first.slice(1)], closed: false } }], refMap: () => null };
      if (first.length < 2 || second.length < 2 || dist(best.q, pts[0]) < 1e-9 || dist(best.q, pts[pts.length - 1]) < 1e-9) return null;
      return { pieces: [{ type: 'polyline', data: { ...keep, points: first, closed: false } }, { type: 'polyline', data: { ...keep, points: second, closed: false } }], refMap: () => null };
    }
    case 'spline': {
      const s = toNurbs(e);
      const parts = splitNurbs(s, nearestParameter(s, p));
      if (!parts) return null;
      return { pieces: parts.map((part) => ({ type: 'spline', data: { ...keep, ...splineData(part) } })), refMap: (at) => (at === 'start' ? { piece: 0, at: 'start' } : at === 'end' ? { piece: 1, at: 'end' } : null) };
    }
    default: return null;
  }
}

// ───────────────────────── overlays (drawn on the canvas, not saved)

/** Curvature of a NURBS at u, with its point and unit normal. */
function curvatureAt(s, u, [a, b]) {
  const h = (b - a) * 1e-4;
  const u0 = Math.max(a, u - h);
  const u1 = Math.min(b, u + h);
  const p0 = nurbsPoint(s, u0); const p = nurbsPoint(s, u); const p1 = nurbsPoint(s, u1);
  const dt = (u1 - u0) / 2 || 1e-12;
  const d1 = { x: (p1.x - p0.x) / (2 * dt), y: (p1.y - p0.y) / (2 * dt) };
  const d2 = { x: (p1.x - 2 * p.x + p0.x) / (dt * dt), y: (p1.y - 2 * p.y + p0.y) / (dt * dt) };
  const speed = Math.hypot(d1.x, d1.y) || 1e-12;
  const k = (d1.x * d2.y - d1.y * d2.x) / speed ** 3;
  return { p, k, n: { x: -d1.y / speed, y: d1.x / speed } };
}

/**
 * The B-spline helpers FreeCAD toggles (Sketcher_BSplinePolygon, …Comb,
 * …Degree, …KnotMultiplicity, …PoleWeight): primitives for the canvas.
 */
export function splineOverlay(e, { polygon = false, comb = false, degree = false, knots = false, weights = false, size = 1 } = {}) {
  const s = toNurbs(e);
  if (!s) return [];
  const prims = [];
  const label = size * 3;
  if (polygon) prims.push({ kind: 'poly', points: s.points.map((p) => ({ x: p.x, y: p.y })), closed: false });
  if (comb) {
    const range = nurbsRange(s);
    const samples = Array.from({ length: 81 }, (_, i) => curvatureAt(s, range[0] + ((range[1] - range[0]) * i) / 80, range));
    const kmax = Math.max(...samples.map((x) => Math.abs(x.k))) || 1;
    const scale = (size * 12) / kmax;
    const tips = samples.map(({ p, k, n }) => ({ x: p.x - n.x * k * scale, y: p.y - n.y * k * scale }));
    samples.forEach(({ p }, i) => { if (i % 2 === 0) prims.push({ kind: 'line', a: p, b: tips[i] }); });
    prims.push({ kind: 'poly', points: tips, closed: false });
  }
  const text = (p, value) => ({ kind: 'text', p: { x: p.x + label * 0.4, y: p.y + label * 0.4 }, text: value, size: label, angle: 0, align: 'left' });
  if (degree) {
    const mid = nurbsPoint(s, (nurbsRange(s)[0] + nurbsRange(s)[1]) / 2);
    prims.push(text(mid, `(${s.degree})`));
  }
  if (knots) for (const k of knotInfo(s)) prims.push({ kind: 'circle', c: nurbsPoint(s, k.u), r: label * 0.25 }, text(nurbsPoint(s, k.u), String(k.mult)));
  if (weights) s.points.forEach((p, i) => prims.push(text(p, `[${Number((s.weights?.[i] ?? 1).toFixed(3))}]`)));
  return prims;
}

/** Sketcher_ArcOverlay: the full circle of each arc. */
export const arcOverlay = (e) => (e.type === 'arc' ? [{ kind: 'circle', c: { x: e.cx, y: e.cy }, r: e.r }] : []);

// ───────────────────────── internal alignment geometry

/** Sketcher_RestoreInternalAlignmentGeometry: an ellipse's axes and foci, a B-spline's control points (construction). */
export function internalGeometry(e) {
  if (e.type === 'ellipse') {
    const major = e.rx >= e.ry;
    const a = rad(e.angle + (major ? 0 : 90));
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const v = { x: -u.y, y: u.x };
    const [r1, r2] = major ? [e.rx, e.ry] : [e.ry, e.rx];
    const f = Math.sqrt(Math.max(0, r1 * r1 - r2 * r2));
    const c = { x: e.cx, y: e.cy };
    const at = (d, k) => ({ x: c.x + d.x * k, y: c.y + d.y * k });
    return [
      { type: 'line', data: { x1: at(u, -r1).x, y1: at(u, -r1).y, x2: at(u, r1).x, y2: at(u, r1).y }, role: 'major' },
      { type: 'line', data: { x1: at(v, -r2).x, y1: at(v, -r2).y, x2: at(v, r2).x, y2: at(v, r2).y }, role: 'minor' },
      { type: 'point', data: { x: at(u, f).x, y: at(u, f).y }, role: 'focus1' },
      { type: 'point', data: { x: at(u, -f).x, y: at(u, -f).y }, role: 'focus2' },
    ];
  }
  if (e.type === 'spline') {
    const xs = e.points.map((p) => p.x); const ys = e.points.map((p) => p.y);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    return e.points.map((p, i) => ({ type: 'circle', data: { cx: p.x, cy: p.y, r: size * 0.02 * (e.weights?.[i] ?? 1) }, role: `pole${i}` }));
  }
  return [];
}

// ───────────────────────── validation (Sketcher_ValidateSketch)

const ENDS = { line: ['p1', 'p2'], arc: ['start', 'end'], spline: ['start', 'end'], point: ['p'] };

/** Ends of geometry that meet without a coincident constraint, degenerate and duplicate geometry. */
export function validateSketch(drawing, tolerance = 1e-3) {
  const ents = drawing.entities.filter((e) => ENDS[e.type] || e.type === 'circle');
  const constraints = drawing.constraints ?? [];
  const joined = (a, b) => constraints.some((c) => c.type === 'coincident' && c.refs.some((r) => r.id === a.id && r.at === a.at) && c.refs.some((r) => r.id === b.id && r.at === b.at));
  const ends = ents.flatMap((e) => (ENDS[e.type] ?? []).map((at) => ({ id: e.id, at, p: entityPoint(e, at) })));
  const missing = [];
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i]; const b = ends[j];
      if (a.id === b.id) continue;
      if (dist(a.p, b.p) <= tolerance && !joined(a, b)) missing.push([{ id: a.id, at: a.at }, { id: b.id, at: b.at }]);
    }
  }
  const degenerate = ents.filter((e) => (e.type === 'line' && Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < tolerance)
    || ((e.type === 'circle' || e.type === 'arc') && e.r < tolerance)
    || (e.type === 'arc' && Math.abs(norm360(e.end - e.start)) < 1e-6)).map((e) => e.id);
  const key = (e) => {
    const r = (v) => Math.round(v / tolerance);
    if (e.type === 'line') { const [p, q] = [[r(e.x1), r(e.y1)], [r(e.x2), r(e.y2)]].sort(); return `line:${p}:${q}`; }
    if (e.type === 'circle') return `circle:${r(e.cx)}:${r(e.cy)}:${r(e.r)}`;
    if (e.type === 'arc') return `arc:${r(e.cx)}:${r(e.cy)}:${r(e.r)}:${Math.round(e.start * 1000)}:${Math.round(e.end * 1000)}`;
    if (e.type === 'point') return `point:${r(e.x)}:${r(e.y)}`;
    return `${e.type}:${e.id}`;
  };
  const seen = new Map();
  const duplicates = [];
  for (const e of ents) {
    const k = key(e);
    if (seen.has(k)) duplicates.push([seen.get(k), e.id]); else seen.set(k, e.id);
  }
  return { missing, degenerate, duplicates };
}

/** The endpoints of an entity that a coincident constraint can use. */
export const endsOf = (e) => (ENDS[e?.type] ?? []).filter((at) => pointsOf(e).includes(at));

// ───────────────────────── external geometry (Sketcher_Intersection)

/** Segments where triangles (world [x, y, z] points) cross the plane z = 0 of `toLocal`. */
export function sectionSegments(triangles, toLocal) {
  const out = [];
  for (const tri of triangles) {
    // A vertex exactly on the plane is nudged so each edge crosses at most once.
    const q = tri.map(toLocal).map(([x, y, z]) => [x, y, Math.abs(z) < 1e-9 ? 1e-9 : z]);
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = q[i];
      const b = q[(i + 1) % 3];
      if ((a[2] > 0) === (b[2] > 0)) continue;
      const f = a[2] / (a[2] - b[2]);
      pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f });
    }
    if (pts.length === 2 && dist(pts[0], pts[1]) > 1e-9) out.push(pts);
  }
  return out;
}

/** Segments joined end to end into polylines: [{ points, closed }]. */
export function chainSegments(segments, tolerance = 1e-6) {
  const key = (p) => `${Math.round(p.x / tolerance)},${Math.round(p.y / tolerance)}`;
  const ends = new Map();
  segments.forEach((s, i) => { for (const p of s) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
  const used = new Set();
  const out = [];
  const next = (p, from) => (ends.get(key(p)) ?? []).find((i) => i !== from && !used.has(i));
  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    used.add(start);
    const points = [segments[start][0], segments[start][1]];
    // Grow forward, then backward.
    for (const forward of [true, false]) {
      let at = forward ? start : start;
      for (let guard = 0; guard < segments.length; guard++) {
        const tip = forward ? points[points.length - 1] : points[0];
        const i = next(tip, at);
        if (i === undefined) break;
        used.add(i);
        const [a, b] = segments[i];
        const other = key(a) === key(tip) ? b : a;
        if (forward) points.push(other); else points.unshift(other);
        at = i;
      }
    }
    const closed = points.length > 3 && key(points[0]) === key(points[points.length - 1]);
    out.push({ points: closed ? points.slice(0, -1) : points, closed });
  }
  return out;
}
