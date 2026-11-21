// Tetrahedral elements (no kernel, no DOM): linear (T4) and quadratic (T10) isoparametric tetrahedra and
// their faces (T3 / T6), shape functions, Gauss rules, stiffness / mass / conduction / geometric stiffness.
//
// Node order of a T10: corners 0–3, then mid-edge nodes 4:(0,1) 5:(1,2) 6:(2,0) 7:(0,3) 8:(1,3) 9:(2,3).
// Natural coordinates: barycentric L0…L3 (sum 1), independent ξ = (L1, L2, L3). A positively oriented tet has
// det[x1−x0, x2−x0, x3−x0] > 0; its faces opposite each corner, wound outwards, are FACES.
//
// Voigt order of strains / stresses: xx yy zz xy yz zx (engineering shear strains).

export const TET_EDGES = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
/** Faces opposite corner 0…3, counter-clockwise seen from outside a positive tet. */
export const FACES = [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]];
const EDGE_OF = (() => { const m = Array.from({ length: 4 }, () => new Array(4).fill(-1)); TET_EDGES.forEach(([a, b], e) => { m[a][b] = m[b][a] = 4 + e; }); return m; })();
/** Local T10 node of the edge between corners a and b. */
export const edgeNode = (a, b) => EDGE_OF[a][b];
/** The 6 local nodes of face f of a T10 (corners, then mid-edges (0,1) (1,2) (2,0) of the face). */
export const FACE_NODES10 = FACES.map(([a, b, c]) => [a, b, c, EDGE_OF[a][b], EDGE_OF[b][c], EDGE_OF[c][a]]);

// ───────────────────────── Gauss rules (barycentric points, weights summing to the reference volume 1/6)

const GA = 0.5854101966249685, GB = 0.1381966011250105;
export const GAUSS1 = { points: [[0.25, 0.25, 0.25, 0.25]], weights: [1 / 6] };
export const GAUSS4 = { points: [[GA, GB, GB, GB], [GB, GA, GB, GB], [GB, GB, GA, GB], [GB, GB, GB, GA]], weights: [1 / 24, 1 / 24, 1 / 24, 1 / 24] };
/** Linear extrapolation from the 4 Gauss points to the corners: corner i = (σ_i − b Σσ) / (a − b). */
export function gaussToCorners(values, stride, out) {
  for (let c = 0; c < stride; c++) {
    let s = 0;
    for (let g = 0; g < 4; g++) s += values[g * stride + c];
    for (let i = 0; i < 4; i++) out[i * stride + c] = (values[i * stride + c] - GB * s) / (GA - GB);
  }
  return out;
}
/** Triangle rules on area coordinates (weights sum to the reference area 1/2). */
export const TRI3 = { points: [[2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]], weights: [1 / 6, 1 / 6, 1 / 6] };
const TA = 0.816847572980459, TB = 0.091576213509771, TC = 0.108103018168070, TD = 0.445948490915965;
export const TRI6 = {
  points: [[TA, TB, TB], [TB, TA, TB], [TB, TB, TA], [TC, TD, TD], [TD, TC, TD], [TD, TD, TC]],
  weights: [0.109951743655322 / 2, 0.109951743655322 / 2, 0.109951743655322 / 2, 0.223381589678011 / 2, 0.223381589678011 / 2, 0.223381589678011 / 2],
};

// ───────────────────────── shape functions

/** Shape function values at barycentric L (T4: 4, T10: 10) into out. */
export function shapeValues(order, L, out = new Float64Array(order === 2 ? 10 : 4)) {
  if (order !== 2) { for (let i = 0; i < 4; i++) out[i] = L[i]; return out; }
  for (let i = 0; i < 4; i++) out[i] = L[i] * (2 * L[i] - 1);
  for (let e = 0; e < 6; e++) { const [a, b] = TET_EDGES[e]; out[4 + e] = 4 * L[a] * L[b]; }
  return out;
}

/** Derivatives dN_a/dξ_j (ξ = L1, L2, L3) at barycentric L: out[3a + j]. */
export function shapeDerivatives(order, L, out = new Float64Array(order === 2 ? 30 : 12)) {
  if (order !== 2) {
    out.fill(0);
    for (let j = 0; j < 3; j++) { out[j] = -1; out[3 * (j + 1) + j] = 1; }
    return out;
  }
  // ∂N/∂L_k, then dN/dξ_j = ∂N/∂L_j − ∂N/∂L_0.
  const dL = [0, 0, 0, 0];
  for (let a = 0; a < 10; a++) {
    dL[0] = dL[1] = dL[2] = dL[3] = 0;
    if (a < 4) dL[a] = 4 * L[a] - 1;
    else { const [p, q] = TET_EDGES[a - 4]; dL[p] = 4 * L[q]; dL[q] = 4 * L[p]; }
    for (let j = 0; j < 3; j++) out[3 * a + j] = dL[j + 1] - dL[0];
  }
  return out;
}

/**
 * Physical gradients at one point: G[3a + k] = dN_a/dx_k; returns det J (6 × the volume for a straight T4).
 * X: node coordinates of the element (3 per node, element order), dN from shapeDerivatives.
 */
export function gradients(n, X, dN, G) {
  let j00 = 0, j01 = 0, j02 = 0, j10 = 0, j11 = 0, j12 = 0, j20 = 0, j21 = 0, j22 = 0;
  for (let a = 0; a < n; a++) {
    const x = X[3 * a], y = X[3 * a + 1], z = X[3 * a + 2], d0 = dN[3 * a], d1 = dN[3 * a + 1], d2 = dN[3 * a + 2];
    j00 += x * d0; j01 += x * d1; j02 += x * d2;
    j10 += y * d0; j11 += y * d1; j12 += y * d2;
    j20 += z * d0; j21 += z * d1; j22 += z * d2;
  }
  const det = j00 * (j11 * j22 - j12 * j21) - j01 * (j10 * j22 - j12 * j20) + j02 * (j10 * j21 - j11 * j20);
  const id = 1 / det;
  // (J⁻¹)_{jk}: dξ_j/dx_k
  const i00 = (j11 * j22 - j12 * j21) * id, i01 = (j02 * j21 - j01 * j22) * id, i02 = (j01 * j12 - j02 * j11) * id;
  const i10 = (j12 * j20 - j10 * j22) * id, i11 = (j00 * j22 - j02 * j20) * id, i12 = (j02 * j10 - j00 * j12) * id;
  const i20 = (j10 * j21 - j11 * j20) * id, i21 = (j01 * j20 - j00 * j21) * id, i22 = (j00 * j11 - j01 * j10) * id;
  for (let a = 0; a < n; a++) {
    const d0 = dN[3 * a], d1 = dN[3 * a + 1], d2 = dN[3 * a + 2];
    G[3 * a] = d0 * i00 + d1 * i10 + d2 * i20;
    G[3 * a + 1] = d0 * i01 + d1 * i11 + d2 * i21;
    G[3 * a + 2] = d0 * i02 + d1 * i12 + d2 * i22;
  }
  return det;
}

/** Precomputed derivatives at the Gauss points of a rule. */
export function ruleDerivatives(order, rule) {
  return rule.points.map((L) => shapeDerivatives(order, L));
}

export const nodesPerElement = (order) => (order === 2 ? 10 : 4);
export const ruleOf = (order) => (order === 2 ? GAUSS4 : GAUSS1);

// ───────────────────────── material

/** Lamé constants of E, ν. */
export const lame = (E, nu) => ({ lambda: (E * nu) / ((1 + nu) * (1 - 2 * nu)), mu: E / (2 * (1 + nu)) });

/** Isotropic elasticity matrix D (6×6 row-major, engineering shear strains). */
export function elasticityMatrix(E, nu) {
  const { lambda, mu } = lame(E, nu), D = new Float64Array(36);
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) D[i * 6 + j] = lambda; D[i * 6 + i] = lambda + 2 * mu; D[(i + 3) * 6 + i + 3] = mu; }
  return D;
}

export const vonMises = (s, o = 0) => Math.sqrt(0.5 * ((s[o] - s[o + 1]) ** 2 + (s[o + 1] - s[o + 2]) ** 2 + (s[o + 2] - s[o]) ** 2) + 3 * (s[o + 3] ** 2 + s[o + 4] ** 2 + s[o + 5] ** 2));

/** Principal stresses (descending) of a Voigt stress (xx yy zz xy yz zx) by the trigonometric method. */
export function principal(s, o = 0) {
  const a = s[o], b = s[o + 1], c = s[o + 2], d = s[o + 3], e = s[o + 4], f = s[o + 5];
  const p1 = d * d + e * e + f * f;
  if (p1 < 1e-30 * (a * a + b * b + c * c + 1e-300)) return [a, b, c].sort((x, y) => y - x);
  const q = (a + b + c) / 3, p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1, p = Math.sqrt(p2 / 6);
  const B = [(a - q) / p, d / p, f / p, d / p, (b - q) / p, e / p, f / p, e / p, (c - q) / p];
  const det = B[0] * (B[4] * B[8] - B[5] * B[7]) - B[1] * (B[3] * B[8] - B[5] * B[6]) + B[2] * (B[3] * B[7] - B[4] * B[6]);
  const r = Math.max(-1, Math.min(1, det / 2)), phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  return [e1, 3 * q - e1 - e3, e3];
}

// ───────────────────────── element matrices

/**
 * Linear elastic stiffness of one element (isotropic): K[(3a+k)(3n)+(3b+l)] = Σ_g w det (λ G_ak G_bl + μ G_al G_bk + μ δ_kl G_a·G_b).
 * Returns the volume. dNs: ruleDerivatives; scratch G length 3n.
 */
export function elasticStiffness(order, X, lambda, mu, K, dNs = null, G = null) {
  const n = nodesPerElement(order), rule = ruleOf(order), m = 3 * n;
  dNs ??= ruleDerivatives(order, rule);
  G ??= new Float64Array(3 * n);
  K.fill(0, 0, m * m);
  let vol = 0;
  for (let g = 0; g < rule.weights.length; g++) {
    const det = gradients(n, X, dNs[g], G), w = rule.weights[g] * det;
    vol += w;
    for (let a = 0; a < n; a++) {
      const ax = G[3 * a], ay = G[3 * a + 1], az = G[3 * a + 2];
      for (let b = a; b < n; b++) {
        const bx = G[3 * b], by = G[3 * b + 1], bz = G[3 * b + 2];
        const dot = mu * (ax * bx + ay * by + az * bz), wl = w * lambda, wm = w * mu, wd = w * dot;
        const r0 = (3 * a) * m + 3 * b, r1 = r0 + m, r2 = r1 + m;
        const v00 = wl * ax * bx + wm * ax * bx + wd, v01 = wl * ax * by + wm * ay * bx, v02 = wl * ax * bz + wm * az * bx;
        const v10 = wl * ay * bx + wm * ax * by, v11 = wl * ay * by + wm * ay * by + wd, v12 = wl * ay * bz + wm * az * by;
        const v20 = wl * az * bx + wm * ax * bz, v21 = wl * az * by + wm * ay * bz, v22 = wl * az * bz + wm * az * bz + wd;
        K[r0] += v00; K[r0 + 1] += v01; K[r0 + 2] += v02;
        K[r1] += v10; K[r1 + 1] += v11; K[r1 + 2] += v12;
        K[r2] += v20; K[r2 + 1] += v21; K[r2 + 2] += v22;
        if (b !== a) {
          const s0 = (3 * b) * m + 3 * a, s1 = s0 + m, s2 = s1 + m;
          K[s0] += v00; K[s0 + 1] += v10; K[s0 + 2] += v20;
          K[s1] += v01; K[s1 + 1] += v11; K[s1 + 2] += v21;
          K[s2] += v02; K[s2 + 1] += v12; K[s2 + 2] += v22;
        }
      }
    }
  }
  return vol;
}

/** Isotropic conduction matrix k ∫ ∇N_a·∇N_b (n×n). Returns the volume. */
export function conductionMatrix(order, X, k, C, dNs = null, G = null) {
  const n = nodesPerElement(order), rule = ruleOf(order);
  dNs ??= ruleDerivatives(order, rule);
  G ??= new Float64Array(3 * n);
  C.fill(0, 0, n * n);
  let vol = 0;
  for (let g = 0; g < rule.weights.length; g++) {
    const det = gradients(n, X, dNs[g], G), w = rule.weights[g] * det;
    vol += w;
    for (let a = 0; a < n; a++) for (let b = a; b < n; b++) {
      const v = w * k * (G[3 * a] * G[3 * b] + G[3 * a + 1] * G[3 * b + 1] + G[3 * a + 2] * G[3 * b + 2]);
      C[a * n + b] += v; if (b !== a) C[b * n + a] += v;
    }
  }
  return vol;
}

// Exact ∫ N_a N_b dV / V for straight elements, from ∫ L^α dV = 6V α!/(|α|+3)!.
function polyOf(order, a) {
  // polynomial: list of [coef, exps[4]]
  if (order !== 2) { const e = [0, 0, 0, 0]; e[a] = 1; return [[1, e]]; }
  if (a < 4) { const e2 = [0, 0, 0, 0], e1 = [0, 0, 0, 0]; e2[a] = 2; e1[a] = 1; return [[2, e2], [-1, e1]]; }
  const [p, q] = TET_EDGES[a - 4], e = [0, 0, 0, 0]; e[p] = 1; e[q] = 1;
  return [[4, e]];
}
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
function massCoefficients(order) {
  const n = nodesPerElement(order), M = new Float64Array(n * n);
  const polys = Array.from({ length: n }, (_, a) => polyOf(order, a));
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    let s = 0;
    for (const [ca, ea] of polys[a]) for (const [cb, eb] of polys[b]) {
      const e = ea.map((x, i) => x + eb[i]);
      s += ca * cb * 6 * e.reduce((t, x) => t * fact(x), 1) / fact(e[0] + e[1] + e[2] + e[3] + 3);
    }
    M[a * n + b] = s;
  }
  return M;
}
export const MASS_COEF = { 1: massCoefficients(1), 2: massCoefficients(2) };
/** Integral of each shape function over the element / V (consistent nodal share of a uniform body force). */
export const SHAPE_INTEGRAL = {
  1: Float64Array.from({ length: 4 }, () => 0.25),
  2: Float64Array.from({ length: 10 }, (_, a) => (a < 4 ? -0.05 : 0.2)),
};
/** Row-sum-free lumped (HRZ) mass shares / V: diagonal of the consistent mass scaled to the total. */
export const LUMPED_SHARE = Object.fromEntries([1, 2].map((o) => {
  const n = nodesPerElement(o), M = MASS_COEF[o];
  let tr = 0; for (let a = 0; a < n; a++) tr += M[a * n + a];
  return [o, Float64Array.from({ length: n }, (_, a) => M[a * n + a] / tr)];
}));

/** Volume of an element from its corners (straight) — positive for a positive tet. */
export function tetVolume(X) {
  const ax = X[3] - X[0], ay = X[4] - X[1], az = X[5] - X[2], bx = X[6] - X[0], by = X[7] - X[1], bz = X[8] - X[2], cx = X[9] - X[0], cy = X[10] - X[1], cz = X[11] - X[2];
  return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
}

/** Volume of an element by its Gauss rule (curved T10 included). */
export function elementVolume(order, X, dNs = null, G = null) {
  const n = nodesPerElement(order), rule = ruleOf(order);
  dNs ??= ruleDerivatives(order, rule);
  G ??= new Float64Array(3 * n);
  let v = 0;
  for (let g = 0; g < rule.weights.length; g++) v += rule.weights[g] * gradients(n, X, dNs[g], G);
  return v;
}

// ───────────────────────── faces (T3 / T6)

/** Triangle shape values at area coordinates l (T3: 3, T6: 6 — corners, mids (0,1) (1,2) (2,0)). */
export function faceShape(order, l, out = new Float64Array(order === 2 ? 6 : 3)) {
  if (order !== 2) { out[0] = l[0]; out[1] = l[1]; out[2] = l[2]; return out; }
  for (let i = 0; i < 3; i++) out[i] = l[i] * (2 * l[i] - 1);
  out[3] = 4 * l[0] * l[1]; out[4] = 4 * l[1] * l[2]; out[5] = 4 * l[2] * l[0];
  return out;
}

/** dN/ds, dN/dt (s = l1, t = l2, l0 = 1 − s − t) at area coordinates l. */
function faceDerivs(order, l, ds, dt) {
  if (order !== 2) { ds[0] = -1; ds[1] = 1; ds[2] = 0; dt[0] = -1; dt[1] = 0; dt[2] = 1; return; }
  // ∂N/∂l_k
  const d = (a, k) => {
    if (a < 3) return a === k ? 4 * l[a] - 1 : 0;
    const [p, q] = [[0, 1], [1, 2], [2, 0]][a - 3];
    return k === p ? 4 * l[q] : k === q ? 4 * l[p] : 0;
  };
  for (let a = 0; a < 6; a++) { ds[a] = d(a, 1) - d(a, 0); dt[a] = d(a, 2) - d(a, 0); }
}

/**
 * Integrates over a face: calls visit(N, areaVector[3], weight) at each Gauss point, where areaVector = (∂x/∂s × ∂x/∂t)·w
 * (its length the area share, direction the outward normal for an outward-wound face). X: face node coordinates.
 */
export function integrateFace(order, X, visit, rule = order === 2 ? TRI6 : TRI3) {
  const n = order === 2 ? 6 : 3, N = new Float64Array(n), ds = new Float64Array(n), dt = new Float64Array(n), A = [0, 0, 0];
  for (let g = 0; g < rule.weights.length; g++) {
    const l = rule.points[g];
    faceShape(order, l, N); faceDerivs(order, l, ds, dt);
    let sx = 0, sy = 0, sz = 0, tx = 0, ty = 0, tz = 0;
    for (let a = 0; a < n; a++) { sx += ds[a] * X[3 * a]; sy += ds[a] * X[3 * a + 1]; sz += ds[a] * X[3 * a + 2]; tx += dt[a] * X[3 * a]; ty += dt[a] * X[3 * a + 1]; tz += dt[a] * X[3 * a + 2]; }
    const w = rule.weights[g];
    A[0] = (sy * tz - sz * ty) * w; A[1] = (sz * tx - sx * tz) * w; A[2] = (sx * ty - sy * tx) * w;
    visit(N, A, w);
  }
}

/** Area of a face (curved T6 by its rule). */
export function faceArea(order, X) {
  let a = 0;
  integrateFace(order, X, (N, A) => { a += Math.hypot(A[0], A[1], A[2]); });
  return a;
}
