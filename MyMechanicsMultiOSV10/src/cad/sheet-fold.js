// The geometry of one sheet-metal bend as a map between its flat pattern and its formed shape (no kernel).
//
// Every bend is described in its own right-handed frame { o, x, y, z }:
//   o — on the bend line, on the bend's INNER sheet face (the one on the inside of the bend);
//   x — across the bend line, away from the side that stays put (the flange side);
//   y — the side the bend turns toward (perpendicular to the sheet); the material is at y ∈ [−t, 0];
//   z — along the bend line (x × y), the bend running from z = zLo to z = zHi.
// Formed, the bend's inner face is a cylinder of radius r about the line (x = 0, y = r). The flat pattern lays
// the bend out as a strip x ∈ [0, BA] (BA = θ (r + k t), the neutral line's length) and the flange after it
// as x ∈ [BA, BA + L]. A flat point (x, y) in the strip sits at the angle φ = θ · x / BA on the radius r − y;
// past the strip the flange is turned rigidly by θ. The near side (x < 0) does not move.
//
// The flat and the formed run of a part each record the bend's frame (both runs push the same bends in the
// same order), so a point of the flat pattern maps to the formed part by: flat frame → local → folded local →
// formed frame. sheet-extra.js uses this for Unfold / Fold.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? mul(a, 1 / l) : [0, 0, 0]; };

/** A bend frame from its origin and its x / y directions (z = x × y), with the bend's extent along z. */
export function bendFrame(o, x, y, zLo = -1e6, zHi = 1e6) {
  const X = unit(x);
  const Y = unit(sub(y, mul(X, dot(y, X))));
  return { o: [...o], x: X, y: Y, z: cross(X, Y), zLo, zHi };
}

/** The extent along the frame's z of the segment a → b (an edge, lengthened before / after). */
export function zRange(F, a, b) {
  const za = dot(sub(a, F.o), F.z); const zb = dot(sub(b, F.o), F.z);
  return [Math.min(za, zb), Math.max(za, zb)];
}

export const toLocal = (F, p) => { const d = sub(p, F.o); return [dot(d, F.x), dot(d, F.y), dot(d, F.z)]; };
export const toWorld = (F, q) => add(F.o, add(mul(F.x, q[0]), add(mul(F.y, q[1]), mul(F.z, q[2]))));

/**
 * A flat local point mapped to the formed local point of the bend { r, theta (degrees), BA }.
 * x < 0: unchanged; 0 ≤ x ≤ BA: wrapped on the bend; x > BA: the flange turned by θ.
 */
export function foldLocal(bend, [x, y, z]) {
  const th = (bend.theta * Math.PI) / 180; const r = bend.r; const BA = bend.BA;
  if (x <= 0) return [x, y, z];
  const rho = r - y;
  if (x <= BA) {
    const phi = BA > 1e-12 ? (th * x) / BA : th;
    return [rho * Math.sin(phi), r - rho * Math.cos(phi), z];
  }
  const l = x - BA;
  return [rho * Math.sin(th) + l * Math.cos(th), r - rho * Math.cos(th) + l * Math.sin(th), z];
}

/** The inverse of foldLocal for a formed local point (used by the tests and the strip check). */
export function unfoldLocal(bend, [X, Y, z]) {
  const th = (bend.theta * Math.PI) / 180; const r = bend.r; const BA = bend.BA;
  // Angle about the bend's axis (0, r), measured from −y toward +x.
  const vx = X; const vy = Y - r;
  const phi = Math.atan2(vx, -vy);
  if (phi <= 0 && X <= 0) return [X, Y, z];
  if (phi >= 0 && phi <= th) return [(BA * phi) / Math.max(th, 1e-12), r - Math.hypot(vx, vy), z];
  // On the flange: rotate back by θ.
  const c = Math.cos(th); const s = Math.sin(th);
  const ux = c * vx + s * vy; const uy = -s * vx + c * vy; // (vx, vy) turned by −θ
  return [BA + ux, r + uy, z];
}

/** A flat world point mapped to the formed part through one bend (its flat and formed frames). */
export function foldPoint(bend, flatF, formF, p) {
  return toWorld(formF, foldLocal(bend, toLocal(flatF, p)));
}

/**
 * The rigid map of the flange past the bend, flat world → formed world: { R (3 × 3, rows), T } with
 * p' = R p + T. Both frames are right-handed and orthonormal, so R is a rotation.
 */
export function flangeMap(bend, flatF, formF) {
  const th = (bend.theta * Math.PI) / 180; const c = Math.cos(th); const s = Math.sin(th);
  const { r, BA } = bend;
  // Local: X = c x − s y + (r s − BA c); Y = s x + c y + (r − r c − BA s); Z = z.
  const K = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  const k = [r * s - BA * c, r - r * c - BA * s, 0];
  const A = [flatF.x, flatF.y, flatF.z]; // rows: world → flat local
  const B = [formF.x, formF.y, formF.z]; // rows; B^T maps formed local → world
  const KA = K.map((row) => [0, 1, 2].map((j) => row[0] * A[0][j] + row[1] * A[1][j] + row[2] * A[2][j]));
  const Rm = [0, 1, 2].map((i) => [0, 1, 2].map((j) => B[0][i] * KA[0][j] + B[1][i] * KA[1][j] + B[2][i] * KA[2][j]));
  const Bk = [0, 1, 2].map((i) => B[0][i] * k[0] + B[1][i] * k[1] + B[2][i] * k[2]);
  const Ro = Rm.map((row) => dot(row, flatF.o));
  const T = [0, 1, 2].map((i) => formF.o[i] + Bk[i] - Ro[i]);
  return { R: Rm, T };
}

export const applyMap = (M, p) => [0, 1, 2].map((i) => dot(M.R[i], p) + M.T[i]);

/** A frame moved by a rigid map (a later bend turning the flange this bend lies on). */
export function mapFrame(M, F) {
  const rot = (v) => [0, 1, 2].map((i) => dot(M.R[i], v));
  return { ...F, o: applyMap(M, F.o), x: rot(F.x), y: rot(F.y), z: rot(F.z) };
}

/** A rotation by `deg` about the axis through `p` along `axis`, as { R, T }. */
export function rotationMap(p, axis, deg) {
  const a = unit(axis); const th = (deg * Math.PI) / 180; const c = Math.cos(th); const s = Math.sin(th); const C = 1 - c;
  const [x, y, z] = a;
  const R = [
    [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
  ];
  const Rp = R.map((row) => dot(row, p));
  return { R, T: [p[0] - Rp[0], p[1] - Rp[1], p[2] - Rp[2]] };
}

export const translationMap = (v) => ({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], T: [...v] });

/**
 * Splits triangles until no edge spans more than `maxDx` across a bend (in the bend's flat local x), so the
 * wrapped mesh follows the cylinder. Shared edges are split once (the mesh stays closed).
 */
export function refineAcross(verts, tris, dxOf, maxDx, limit = 200000) {
  const V = verts.map((p) => [...p]);
  let T = tris.map((t) => [...t]);
  for (let pass = 0; pass < 24; pass++) {
    const mids = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let m = mids.get(key);
      if (m === undefined) { m = V.length; V.push(mul(add(V[a], V[b]), 0.5)); mids.set(key, m); }
      return m;
    };
    const long = (a, b) => Math.abs(dxOf(V[a]) - dxOf(V[b])) > maxDx;
    // Mark every long edge first, then split each triangle by how many of its edges are marked.
    const marked = new Set();
    for (const [a, b, c] of T) for (const [p, q] of [[a, b], [b, c], [c, a]]) if (long(p, q)) marked.add(p < q ? `${p},${q}` : `${q},${p}`);
    if (!marked.size) break;
    const isM = (p, q) => marked.has(p < q ? `${p},${q}` : `${q},${p}`);
    const out = [];
    for (const [a, b, c] of T) {
      const ab = isM(a, b); const bc = isM(b, c); const ca = isM(c, a);
      const n = ab + bc + ca;
      if (n === 0) { out.push([a, b, c]); continue; }
      if (n === 3) {
        const x = mid(a, b); const y = mid(b, c); const z = mid(c, a);
        out.push([a, x, z], [x, b, y], [z, y, c], [x, y, z]);
        continue;
      }
      // Rotate so the first marked edge is (p, q).
      let [p, q, w] = ab ? [a, b, c] : bc ? [b, c, a] : [c, a, b];
      const m1 = mid(p, q);
      if (n === 1) { out.push([p, m1, w], [m1, q, w]); continue; }
      // Two marked edges: (p, q) and one of (q, w) / (w, p).
      if (isM(q, w)) { const m2 = mid(q, w); out.push([p, m1, w], [m1, q, m2], [m1, m2, w]); }
      else { const m2 = mid(w, p); out.push([p, m1, m2], [m1, q, w], [m1, w, m2]); }
    }
    T = out;
    if (T.length > limit) break;
  }
  return { verts: V, tris: T };
}
