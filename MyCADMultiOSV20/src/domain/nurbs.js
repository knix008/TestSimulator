// NURBS curves and surfaces (B-splines with weights): evaluation, clamped
// knots, Bézier chains, interpolation through points, and point inversion on
// surfaces. Used by spline entities and by the STEP / IGES / BREP readers.

/** Knot span index (The NURBS Book, A2.1). */
export function findSpan(n, p, u, knots) {
  if (u >= knots[n + 1]) return n;
  if (u <= knots[p]) return p;
  let low = p;
  let high = n + 1;
  let mid = (low + high) >> 1;
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) high = mid; else low = mid;
    mid = (low + high) >> 1;
  }
  return mid;
}

/** B-spline basis functions at u (A2.2). */
export function basisFunctions(span, u, p, knots) {
  const N = [1];
  const left = [];
  const right = [];
  for (let j = 1; j <= p; j++) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denominator = right[r + 1] + left[j - r];
      const temp = denominator === 0 ? 0 : N[r] / denominator;
      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

/** Clamped uniform knots for `count` control points of degree p. */
export function clampedKnots(count, p) {
  const inner = count - p - 1;
  return [...Array(p + 1).fill(0), ...Array.from({ length: inner }, (_, i) => (i + 1) / (inner + 1)), ...Array(p + 1).fill(1)];
}

/**
 * A point on a NURBS curve. points: arrays [x, y(, z)], weights optional.
 * knots default clamped uniform.
 */
export function curvePoint({ degree, points, knots = null, weights = null }, u) {
  const p = Math.min(degree, points.length - 1);
  const K = knots ?? clampedKnots(points.length, p);
  const n = points.length - 1;
  const span = findSpan(n, p, u, K);
  const N = basisFunctions(span, u, p, K);
  const dim = points[0].length;
  const out = new Array(dim).fill(0);
  let w = 0;
  for (let j = 0; j <= p; j++) {
    const index = span - p + j;
    const weight = weights ? weights[index] : 1;
    const factor = N[j] * weight;
    for (let k = 0; k < dim; k++) out[k] += points[index][k] * factor;
    w += factor;
  }
  return out.map((v) => v / (w || 1));
}

/** Parameter range of a curve. */
export function curveRange({ degree, points, knots = null }) {
  const p = Math.min(degree, points.length - 1);
  const K = knots ?? clampedKnots(points.length, p);
  return [K[p], K[K.length - 1 - p]];
}

/** Points along a curve: `segments` steps, more for more control points. */
export function sampleCurve(curve, segments = null) {
  const [u0, u1] = curveRange(curve);
  const count = segments ?? Math.max(16, Math.min(2000, curve.points.length * 12));
  return Array.from({ length: count + 1 }, (_, i) => curvePoint(curve, u0 + ((u1 - u0) * i) / count));
}

/**
 * Cubic Bézier segments ([p0, c1, c2, p3] each, sharing ends) as one
 * B-spline: degree 3, control points chained, inner knots tripled.
 */
export function bezierChain(segments) {
  const points = [segments[0][0]];
  for (const [, c1, c2, p3] of segments) points.push(c1, c2, p3);
  const knots = [0, 0, 0, 0];
  for (let i = 1; i < segments.length; i++) knots.push(i, i, i);
  knots.push(segments.length, segments.length, segments.length, segments.length);
  return { degree: 3, points, knots: knots.map((k) => k / segments.length) };
}

/** A smooth cubic curve through points (Catmull-Rom tangents), as a Bézier chain. */
export function throughPoints(pts, closed = false) {
  if (pts.length < 2) return { degree: 1, points: pts.slice(), knots: null };
  const P = closed ? [...pts, pts[0]] : pts;
  const at = (i) => (closed ? P[(i + P.length - 1) % (P.length - 1)] : P[Math.max(0, Math.min(P.length - 1, i))]);
  const segments = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i];
    const p3 = P[i + 1];
    const before = i === 0 && !closed ? p0 : at(i - 1);
    const after = i === P.length - 2 && !closed ? p3 : at(i + 2);
    const c1 = p0.map((v, k) => v + (p3[k] - before[k]) / 6);
    const c2 = p3.map((v, k) => v - (after[k] - p0[k]) / 6);
    segments.push([p0, c1, c2, p3]);
  }
  return bezierChain(segments);
}

/** A point on a NURBS surface: controls[i][j] (i along u), weights the same shape or null. */
export function surfacePoint({ degreeU, degreeV, controls, knotsU, knotsV, weights = null }, u, v) {
  const nu = controls.length - 1;
  const nv = controls[0].length - 1;
  const spanU = findSpan(nu, degreeU, u, knotsU);
  const spanV = findSpan(nv, degreeV, v, knotsV);
  const Nu = basisFunctions(spanU, u, degreeU, knotsU);
  const Nv = basisFunctions(spanV, v, degreeV, knotsV);
  const out = [0, 0, 0];
  let w = 0;
  for (let a = 0; a <= degreeU; a++) {
    for (let b = 0; b <= degreeV; b++) {
      const i = spanU - degreeU + a;
      const j = spanV - degreeV + b;
      const weight = weights ? weights[i][j] : 1;
      const factor = Nu[a] * Nv[b] * weight;
      const P = controls[i][j];
      out[0] += P[0] * factor;
      out[1] += P[1] * factor;
      out[2] += P[2] * factor;
      w += factor;
    }
  }
  return out.map((x) => x / (w || 1));
}

/**
 * (u, v) on a parametric surface nearest to a 3D point: a coarse grid search,
 * then Newton steps with numerical derivatives. `evaluate(u, v)` → [x, y, z].
 */
export function invertSurface(evaluate, point, [u0, u1], [v0, v1], { guess = null, grid = 12 } = {}) {
  const d2 = (q) => (q[0] - point[0]) ** 2 + (q[1] - point[1]) ** 2 + (q[2] - point[2]) ** 2;
  let best = guess;
  let bestD = guess ? d2(evaluate(...guess)) : Infinity;
  if (!guess || bestD > 1e-6) {
    for (let i = 0; i <= grid; i++) {
      for (let j = 0; j <= grid; j++) {
        const uv = [u0 + ((u1 - u0) * i) / grid, v0 + ((v1 - v0) * j) / grid];
        const d = d2(evaluate(...uv));
        if (d < bestD) { bestD = d; best = uv; }
      }
    }
  }
  let [u, v] = best;
  const hu = (u1 - u0) * 1e-6 || 1e-9;
  const hv = (v1 - v0) * 1e-6 || 1e-9;
  for (let k = 0; k < 30; k++) {
    const S = evaluate(u, v);
    const Su = evaluate(Math.min(u1, u + hu), v).map((x, m) => (x - S[m]) / hu);
    const Sv = evaluate(u, Math.min(v1, v + hv)).map((x, m) => (x - S[m]) / hv);
    const r = S.map((x, m) => x - point[m]);
    // Solve the 2×2 normal equations J^T J Δ = −J^T r.
    const a = Su[0] * Su[0] + Su[1] * Su[1] + Su[2] * Su[2];
    const b = Su[0] * Sv[0] + Su[1] * Sv[1] + Su[2] * Sv[2];
    const c = Sv[0] * Sv[0] + Sv[1] * Sv[1] + Sv[2] * Sv[2];
    const e = -(Su[0] * r[0] + Su[1] * r[1] + Su[2] * r[2]);
    const g = -(Sv[0] * r[0] + Sv[1] * r[1] + Sv[2] * r[2]);
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-30) break;
    const du = (e * c - b * g) / det;
    const dv = (a * g - b * e) / det;
    u = Math.min(u1, Math.max(u0, u + du));
    v = Math.min(v1, Math.max(v0, v + dv));
    if (Math.abs(du) < (u1 - u0) * 1e-10 && Math.abs(dv) < (v1 - v0) * 1e-10) break;
  }
  return [u, v];
}
