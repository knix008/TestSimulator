// Small NURBS toolkit in plain JavaScript (no kernel): flat knot vectors, curve and surface points by de Boor in
// homogeneous coordinates, and the "unwrapped" form of a periodic B-spline — its first `degree` poles repeated at the
// end over a knot vector that runs on past the period — which is how Parasolid stores periodic curves and surfaces.

/** Expanded knot vector from distinct knots and their multiplicities. */
export function flatKnots(knots, mults) {
  const out = [];
  knots.forEach((k, i) => { for (let m = 0; m < mults[i]; m++) out.push(k); });
  return out;
}

/** Distinct knots and multiplicities of an expanded knot vector (values within `eps` are one knot). */
export function distinctKnots(flat, eps = 1e-12) {
  const knots = []; const mults = [];
  for (const k of flat) {
    if (knots.length && Math.abs(k - knots.at(-1)) <= eps * Math.max(1, Math.abs(k))) mults[mults.length - 1]++;
    else { knots.push(k); mults.push(1); }
  }
  return { knots, mults };
}

/** The knot span of t: k with flat[k] <= t < flat[k+1], kept inside [degree, n-1]. */
function span(flat, degree, n, t) {
  if (t >= flat[n]) return n - 1;
  if (t <= flat[degree]) return degree;
  let lo = degree; let hi = n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t < flat[mid]) hi = mid; else lo = mid; }
  return lo;
}

/** de Boor on homogeneous points [x·w, y·w, z·w, w]: the homogeneous point at t. */
function deBoor(degree, flat, hpoles, t) {
  const n = hpoles.length; const k = span(flat, degree, n, t);
  const d = []; for (let j = 0; j <= degree; j++) d.push(hpoles[k - degree + j].slice());
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j; const den = flat[i + degree - r + 1] - flat[i];
      const a = den === 0 ? 0 : (t - flat[i]) / den;
      for (let c = 0; c < 4; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
  }
  return d[degree];
}
const homogeneous = (p, w = 1) => [p[0] * w, p[1] * w, p[2] * w, w];
const project = (h) => [h[0] / h[3], h[1] / h[3], h[2] / h[3]];

/** Point of a NURBS curve: poles [[x,y,z]], weights (or null), flat knots. */
export function curvePoint(degree, flat, poles, weights, t) {
  return project(deBoor(degree, flat, poles.map((p, i) => homogeneous(p, weights ? weights[i] : 1)), t));
}

/** Point of a NURBS surface: poles[iu][iv] = [x,y,z], weights[iu][iv] (or null). */
export function surfacePoint(uDegree, uFlat, vDegree, vFlat, poles, weights, u, v) {
  const rows = poles.map((row, i) => deBoor(vDegree, vFlat, row.map((p, j) => homogeneous(p, weights ? weights[i][j] : 1)), v));
  return project(deBoor(uDegree, uFlat, rows, u));
}

/**
 * One period of an unwrapped periodic B-spline of `count` poles (`count − degree` distinct ones): its distinct knots
 * over the valid range and the multiplicities a periodic kernel wants (the end knots share the one multiplicity
 * that makes the period hold `count − degree` knots). Null when the data is not a whole period.
 */
export function rewrapPeriodic(knots, mults, degree, count) {
  const flat = flatKnots(knots, mults);
  const a = flat[degree]; const b = flat[count]; const n = count - degree;
  if (!(b > a) || n < 2) return null;
  const d = distinctKnots(flat.filter((k) => k >= a - 1e-12 && k <= b + 1e-12));
  if (d.knots.length < 2) return null;
  const interior = d.mults.slice(1, -1).reduce((s, m) => s + m, 0);
  const end = n - interior;
  if (!(end >= 1 && end <= degree + 1)) return null;
  return { knots: d.knots, mults: [end, ...d.mults.slice(1, -1), end], n };
}

/**
 * The unwrapped form of a periodic B-spline of `n` poles, given the distinct knots of one period (first and last
 * one period apart) and their multiplicities: `n + degree` poles taken as pole[(i + shift) mod n], over the expanded
 * knots F[i + off] (F the periodic knot sequence repeated by the period) so that the valid range [flat[degree],
 * flat[n + degree]] is the period. `shift` is where the kernel's first pole sits; callers find it by evaluation.
 */
export function unwrapPeriodic(knots, mults, degree, n, shift = 0) {
  const T = knots.at(-1) - knots[0];
  const one = []; for (let j = 0; j < knots.length - 1; j++) for (let m = 0; m < mults[j]; m++) one.push(knots[j]);
  if (one.length !== n) throw new Error(`periodic B-spline: ${one.length} knots in one period, ${n} poles`);
  const F = (i) => { const q = Math.floor(i / n); return one[i - q * n] + q * T; };
  const off = mults[0] - 1 - degree;
  const flat = []; for (let k = 0; k <= n + 2 * degree; k++) flat.push(F(k + off));
  const order = []; for (let i = 0; i < n + degree; i++) order.push((((i + off + shift) % n) + n) % n);
  return { flat, order };
}
