// Two more simulation studies on the voxel model of fea.js:
//
// buckling(): linear (eigenvalue) buckling. The static study gives the stress σ of every element under the
//   applied loads; the geometric stiffness K_G(σ) is formed element by element (K_G^e = h·Σ_kl σ_kl ∫ ∂N_a/∂ξ_k
//   ∂N_b/∂ξ_l over the unit cube, the same block on x, y and z) and the load factors λ of K φ = λ (−K_G) φ are
//   found by subspace iteration (each step solves K Y = −K_G X with multigrid-preconditioned CG, then Rayleigh–Ritz
//   on the small problem). The smallest positive λ is the buckling load factor: the loads × λ make the part
//   buckle. A negative factor means the part would buckle if the loads were reversed.
//
// fatigue(): stress-life (S-N curve) fatigue from the static stress. The S-N curve is the usual estimate from the
//   ultimate strength Su (log-log straight line from 0.9·Su at 10³ cycles to the endurance limit Se at 10⁶ cycles;
//   steels and iron keep Se below which life is infinite, other materials keep falling with the same slope).
//   Loading: fully reversed (σa = σ) or zero-based (σa = σm = σ/2, Goodman correction σar = σa / (1 − σm/Su)).
//   Damage = cycles / N (Miner's rule with one load block). Units: MPa, cycles.
import { analyse, elementStiffness, FEA_INTERNALS } from './fea.js';

const { buildGrid, buildOperator, pcg, clamp, multigrid, vertexMap, interpolate, generalizedEigen, elasticity, strainMatrix, shapeGradients, GAUSS } = FEA_INTERNALS;

/** ∫ G_ak G_bl over the unit cube (2×2×2 Gauss): I[((a·8 + b)·3 + k)·3 + l]. */
function gradientProducts() {
  const I = new Float64Array(8 * 8 * 9), G = new Float64Array(24);
  for (const xi of GAUSS) for (const eta of GAUSS) for (const zeta of GAUSS) {
    shapeGradients(xi, eta, zeta, G);
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) I[((a * 8 + b) * 3 + k) * 3 + l] += (G[3 * a + k] * G[3 * b + l]) / 8;
  }
  return I;
}

function failedBuckling(error) {
  return { ok: false, error, loadFactors: [], loadFactor: 0, modes: [], elements: 0, elementSize: 0, iterations: 0, staticResult: null };
}

/**
 * Linear buckling load factors of a part under its static loads. Same mesh / fixtures / loads / material as
 * analyse(). Returns { ok, error, loadFactor (the smallest positive, or the smallest in size when none is positive),
 * loadFactors (by size), modes (per input vertex xyz, max |u| = 1, for each load factor), staticResult, elements,
 * elementSize, iterations }.
 */
export function buckling(mesh, { material, fixtures = [], loads = [], resolution = 20, modes = 1, maxIter = 40, tol = 1e-4, onProgress = null } = {}) {
  const stat = analyse(mesh, { material, fixtures, loads, resolution, onProgress: onProgress && ((f) => onProgress(0.4 * f)) });
  if (stat.error && stat.error !== 'not-converged') return { ...failedBuckling(stat.error), staticResult: stat };
  const grid = buildGrid(mesh, resolution);
  if (!grid) return failedBuckling('empty');
  const { h, nn, ne, conn } = grid, ndof = 3 * nn, u = stat.displacement;
  const { fixed } = clamp(mesh, fixtures, grid);

  // Element stresses (centre of each voxel), as the symmetric 3×3 tensor.
  const Bc = strainMatrix(0.5, 0.5, 0.5).map((x) => x / h), D = elasticity(material.E, material.nu);
  const sigma = new Float64Array(9 * ne), ue = new Float64Array(24), eps = new Float64Array(6), s = new Float64Array(6);
  for (let el = 0; el < ne; el++) {
    for (let a = 0; a < 8; a++) { const d = 3 * conn[8 * el + a]; ue[3 * a] = u[d]; ue[3 * a + 1] = u[d + 1]; ue[3 * a + 2] = u[d + 2]; }
    for (let i = 0; i < 6; i++) { let t = 0; for (let m = 0; m < 24; m++) t += Bc[i * 24 + m] * ue[m]; eps[i] = t; }
    for (let i = 0; i < 6; i++) { let t = 0; for (let m = 0; m < 6; m++) t += D[i * 6 + m] * eps[m]; s[i] = t; }
    const o = 9 * el;   // xx yy zz xy yz zx → tensor
    sigma[o] = s[0]; sigma[o + 4] = s[1]; sigma[o + 8] = s[2];
    sigma[o + 1] = sigma[o + 3] = s[3]; sigma[o + 5] = sigma[o + 7] = s[4]; sigma[o + 2] = sigma[o + 6] = s[5];
  }
  // Scalar coupling g_ab of each element (K_G^e = g ⊗ I3), stored per element: 64 numbers.
  const I = gradientProducts(), gab = new Float64Array(64 * ne);
  for (let el = 0; el < ne; el++) {
    const o = 9 * el;
    for (let ab = 0; ab < 64; ab++) { let t = 0; for (let kl = 0; kl < 9; kl++) t += sigma[o + kl] * I[ab * 9 + kl]; gab[64 * el + ab] = h * t; }
  }
  /** out = −K_G p (fixed dofs 0). */
  const applyG = (p, out) => {
    out.fill(0);
    for (let el = 0; el < ne; el++) {
      const base = 8 * el, g = 64 * el;
      for (let a = 0; a < 8; a++) {
        let x = 0, y = 0, z = 0;
        for (let b = 0; b < 8; b++) { const c = gab[g + a * 8 + b], d = 3 * conn[base + b]; x += c * p[d]; y += c * p[d + 1]; z += c * p[d + 2]; }
        const d = 3 * conn[base + a];
        out[d] -= x; out[d + 1] -= y; out[d + 2] -= z;
      }
    }
    for (let d = 0; d < ndof; d++) if (fixed[d]) out[d] = 0;
  };

  const op = buildOperator(grid, elementStiffness(material.E, material.nu, h), 3);
  const precond = multigrid(grid, op, 3, fixed);
  const p = Math.max(1, Math.min(4, Math.round(modes))), q = Math.min(ndof, p + 4);
  let seed = 4242;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  const X = Array.from({ length: q }, (_, j) => { const x = new Float64Array(ndof); for (let d = 0; d < ndof; d++) x[d] = fixed[d] ? 0 : j === 0 ? u[d] + 1e-3 * rand() : rand(); return x; });
  const Y = Array.from({ length: q }, () => new Float64Array(ndof)), KY = Array.from({ length: q }, () => new Float64Array(ndof)), GY = Array.from({ length: q }, () => new Float64Array(ndof));
  const r = new Float64Array(ndof);
  const dot = (a, b) => { let t = 0; for (let d = 0; d < ndof; d++) t += a[d] * b[d]; return t; };
  let factors = null, prev = null, iter = 0, converged = false, chosen = [];
  for (; iter < maxIter; iter++) {
    for (let j = 0; j < q; j++) {
      applyG(X[j], r);
      let rn = 0; for (let d = 0; d < ndof; d++) rn += r[d] * r[d];
      Y[j].fill(0);
      if (rn > 0) pcg(op.apply, precond, r, Y[j], { mask: fixed, tol: 1e-6, ref: Math.sqrt(rn), maxIter: 3000 });
    }
    // Rayleigh–Ritz: Gr z = μ Kr z (Kr = YᵀKY positive definite), λ = 1/μ.
    const Kr = new Float64Array(q * q), Gr = new Float64Array(q * q);
    for (let j = 0; j < q; j++) { op.apply(Y[j], KY[j], fixed); applyG(Y[j], GY[j]); }
    for (let j = 0; j < q; j++) for (let i = 0; i <= j; i++) {
      Kr[i * q + j] = Kr[j * q + i] = (dot(Y[i], KY[j]) + dot(Y[j], KY[i])) / 2;
      Gr[i * q + j] = Gr[j * q + i] = (dot(Y[i], GY[j]) + dot(Y[j], GY[i])) / 2;
    }
    const eig = generalizedEigen(Gr, Kr, q);
    if (!eig.values) { for (let d = 0; d < ndof; d++) X[eig.failedAt][d] = fixed[d] ? 0 : rand(); continue; }
    for (let j = 0; j < q; j++) {
      const x = X[j]; x.fill(0);
      for (let i = 0; i < q; i++) { const c = eig.Q[i * q + j]; if (c) for (let d = 0; d < ndof; d++) x[d] += c * Y[i][d]; }
    }
    // Wanted: the largest |μ| (smallest |λ|), positive first.
    const order = eig.values.map((mu, i) => ({ mu, i })).filter((x) => Math.abs(x.mu) > 1e-300).sort((a, b) => Math.abs(b.mu) - Math.abs(a.mu));
    chosen = order.slice(0, p);
    factors = chosen.map((x) => 1 / x.mu);
    onProgress?.(0.4 + 0.55 * Math.min(1, (iter + 1) / 15));
    const change = prev ? Math.max(...factors.map((f, i) => Math.abs(f - (prev[i] ?? 0)) / Math.max(Math.abs(f), 1e-30))) : 1;
    prev = factors;
    if (change < tol && iter > 1) { converged = true; iter++; break; }
  }
  if (!factors?.length) return { ...failedBuckling('not-converged'), staticResult: stat };
  const positive = factors.filter((f) => f > 0);
  const loadFactor = positive.length ? Math.min(...positive) : factors.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  const map = vertexMap(mesh.vertices, grid);
  const shapes = chosen.map(({ i }) => {
    const vert = interpolate(map, X[i], 3);
    let big = 0; for (let v = 0; v < map.nv; v++) big = Math.max(big, Math.hypot(vert[3 * v], vert[3 * v + 1], vert[3 * v + 2]));
    if (big > 0) for (let k = 0; k < vert.length; k++) vert[k] /= big;
    return vert;
  });
  const byFactor = factors.map((f, i) => ({ f, m: shapes[i] }));
  const first = byFactor.findIndex((x) => x.f === loadFactor);
  if (first > 0) byFactor.unshift(...byFactor.splice(first, 1));
  onProgress?.(1);
  return {
    ok: converged && stat.ok, error: converged ? (stat.ok ? null : stat.error) : 'not-converged',
    loadFactor, loadFactors: byFactor.map((x) => x.f), modes: byFactor.map((x) => x.m),
    staticResult: stat, elements: ne, elementSize: h, iterations: iter,
  };
}

// ───────────────────────── fatigue

/** Material groups (materials.js) that keep an endurance limit (life is infinite below it). */
const ENDURANCE_GROUPS = new Set(['steel', 'iron', 'titanium']);

/**
 * The S-N curve of a material: { su, se, points: [[N, S], …] (log-log straight segments), endurance (bool) }.
 * `material` = { yield, ultimate?, group? } (MPa). Without an ultimate strength it is taken as 1.25 × yield.
 */
export function snCurve(material = {}) {
  const su = Number(material.ultimate) > 0 ? Number(material.ultimate) : 1.25 * (Number(material.yield) || 250);
  const endurance = material.group ? ENDURANCE_GROUPS.has(material.group) : true;
  const se = (endurance ? 0.5 : 0.35) * su;
  return { su, se, endurance, points: [[1e3, 0.9 * su], [1e6, se]] };
}

/** Cycles to failure at alternating stress `sa` (MPa) on the curve: Infinity below the endurance limit. */
export function lifeAt(sa, curve) {
  const [[n1, s1], [n2, s2]] = curve.points;
  if (!(sa > 0)) return Infinity;
  if (sa >= curve.su) return 1;
  if (sa <= s2 && curve.endurance) return Infinity;
  if (sa >= s1) {
    // From 1 cycle at Su to 10³ at 0.9 Su (the low-cycle end).
    const b0 = Math.log10(s1 / curve.su) / Math.log10(n1);
    return Math.max(1, 10 ** (Math.log10(sa / curve.su) / b0));
  }
  const b = Math.log10(s2 / s1) / Math.log10(n2 / n1);   // slope (negative)
  return n1 * 10 ** (Math.log10(sa / s1) / b);
}

/** Equivalent fully reversed alternating stress of a peak stress σ (MPa) for the loading type. */
export function equivalentAlternating(stress, loading, su) {
  const s = Math.abs(stress);
  if (loading === 'zeroBased') {
    const sa = s / 2, sm = s / 2;
    return sm >= su ? Infinity : sa / (1 - sm / su);
  }
  return s;
}

/**
 * Fatigue of a static result: per mesh vertex and in total. `staticResult` from analyse() (vertexStress, nodeStress);
 * options { material: { yield, ultimate?, group? }, loading: 'reversed' | 'zeroBased', cycles, scale (load multiplier) }.
 * Returns { curve, minLife, maxDamage, vertexLife (Float64Array), vertexDamage (Float32Array), factorOfSafety
 * (endurance limit / largest alternating stress, Infinity without load) }.
 */
export function fatigue(staticResult, { material = {}, loading = 'reversed', cycles = 1e6, scale = 1 } = {}) {
  const curve = snCurve(material);
  const vs = staticResult?.vertexStress ?? new Float32Array(0);
  const vertexLife = new Float64Array(vs.length), vertexDamage = new Float32Array(vs.length);
  let minLife = Infinity, maxDamage = 0, maxSa = 0;
  for (let i = 0; i < vs.length; i++) {
    const sa = equivalentAlternating(vs[i] * scale, loading, curve.su);
    maxSa = Math.max(maxSa, sa);
    const life = lifeAt(sa, curve);
    vertexLife[i] = life;
    const dmg = Number.isFinite(life) ? cycles / life : 0;
    vertexDamage[i] = dmg;
    if (life < minLife) minLife = life;
    if (dmg > maxDamage) maxDamage = dmg;
  }
  return { curve, cycles, loading, minLife, maxDamage, vertexLife, vertexDamage, factorOfSafety: maxSa > 0 ? curve.se / maxSa : Infinity };
}

/** Colour of a damage value: green (none) → yellow → red at 1 (failure) and above, on a log scale from 1e-4. */
export function damageColor(d) {
  const t = d <= 1e-4 ? 0 : d >= 1 ? 1 : (Math.log10(d) + 4) / 4;
  return t < 0.5 ? [0.2 + 1.5 * t, 0.75, 0.25] : [0.95, 0.75 - 1.3 * (t - 0.5), 0.2];
}
