// Warpage (no DOM): how the moulded part deforms after ejection, on the part's tetrahedral mesh (fem/model.js),
// from the residual (initial) strains the moulding leaves, split by cause as moulding analysis reports it:
//   differential shrinkage   ε = −(s_v / 3) I        s_v the volumetric shrinkage of the node (packing result)
//   differential cooling     ε = −α (T_w(x) − T̄_w) I  the side against the warmer mould steel shrinks more
//   orientation              ε = (s_v / 3) c (3/2)(A − I/3)   A the fiber orientation tensor (c ≈ 2.7 · fiber weight
//                            fraction: the fibers hold the shrinkage along them); unfilled resins: the flow
//                            direction with c = −0.15 (chains stretched by the flow shrink more along it)
// Each cause is a load case f = ∫ Bᵀ D ε dV on one factorisation; the part is held statically determinate (3-2-1:
// three nodes far apart, six components), so the result is the free shape. Reported: displacement per cause and
// in total, and the warpage proper — the displacement left after the best-fit rigid motion and uniform scaling are
// taken out (a part that only shrinks evenly does not warp).
import { buildModel, stiffnessMatrix, elementX, surfaceField } from './fem/model.js';
import { gradients, ruleDerivatives, ruleOf } from './fem/elements.js';
import { applyDirichlet, solveSystem, cloneMatrix, setMultigrid } from './fem/sparse.js';
import { smoothedAggregation } from './fem/amg.js';
import { nodeAt, nearestNode } from './plastics.js';
import { flowVelocity } from './plastics-fiber.js';

setMultigrid((A, o) => smoothedAggregation(A, o));

/** Solid resin properties: modulus MPa, Poisson's ratio, linear thermal expansion 1/K. */
export const RESIN_SOLID = {
  abs: { E: 2300, nu: 0.35, cte: 9e-5 }, pp: { E: 1500, nu: 0.4, cte: 1.5e-4 }, pc: { E: 2350, nu: 0.37, cte: 6.8e-5 }, pa66: { E: 3000, nu: 0.35, cte: 8e-5 },
  pom: { E: 2900, nu: 0.35, cte: 1.1e-4 }, hdpe: { E: 1000, nu: 0.42, cte: 1.5e-4 }, ps: { E: 3200, nu: 0.34, cte: 7e-5 }, pmma: { E: 3000, nu: 0.37, cte: 7e-5 },
  pbt: { E: 2500, nu: 0.38, cte: 1e-4 }, pcabs: { E: 2400, nu: 0.36, cte: 7.5e-5 },
};
export const CAUSES = ['shrinkage', 'cooling', 'orientation'];

/** The solid properties of a resin family with glass fibers (weight fraction w): stiffer, expanding less. */
export function solidOf(family, fiber = 0) {
  const b = RESIN_SOLID[family] ?? RESIN_SOLID.abs;
  return { E: b.E * (1 + 4 * fiber), nu: b.nu, cte: b.cte * (1 - 0.6 * fiber) };
}

const ISO = [1, 1, 1, 0, 0, 0];
/** A tensor (9 numbers) as an engineering strain vector [xx, yy, zz, γxy, γyz, γzx]. */
const voigt = (T) => [T[0], T[4], T[8], T[1] + T[3], T[5] + T[7], T[2] + T[6]];

/**
 * The strain sampler for a moulding: (p) → { shrinkage, cooling, orientation } (each an engineering strain vector)
 * at a point of the part. fill: the flow result (shrinkage % per node); cooling: a cooling result with wallAt
 * (optional); fibers: a fiber orientation result (optional); fiber: the weight fraction of fibers.
 */
export function mouldingStrains({ domain, fill, cooling = null, fibers = null, family = 'abs', fiber = 0, shrinkFallback = 0.5 }) {
  const n = domain.nodes.length;
  const sv = new Float64Array(n);
  const packed = fill?.shrinkage && fill.shrinkage.some((v) => v !== 0);
  for (let i = 0; i < n; i++) sv[i] = packed ? fill.shrinkage[i] / 100 : (3 * shrinkFallback) / 100;
  const solid = solidOf(family, fiber);
  const dirs = fibers ? null : fill?.fillTime ? flowVelocity(domain, fill.fillTime).map((v) => { const s = Math.hypot(...v); return s > 0 ? v.map((x) => x / s) : null; }) : null;
  const c = fibers ? Math.min(0.85, 2.7 * fiber) : -0.15;
  const node = (p) => { let i = nodeAt(domain, p); if (i < 0) i = nearestNode(domain, p); return i; };
  return (p) => {
    const i = node(p);
    const sl = sv[i] / 3;
    let A = null;
    if (fibers) A = Array.from(fibers.tensor.subarray(9 * i, 9 * i + 9));
    else if (dirs?.[i]) { const e = dirs[i]; A = [0, 1, 2].flatMap((a) => [0, 1, 2].map((b) => e[a] * e[b])); }
    const orientation = A ? voigt(A.map((v, k) => sl * c * 1.5 * (v - (k % 4 === 0 ? 1 / 3 : 0)))) : [0, 0, 0, 0, 0, 0];
    return {
      shrinkage: ISO.map((v) => -sl * v),
      orientation,
      coolingT: cooling?.wallAt ? cooling.wallAt(p) : null,
      cte: solid.cte,
    };
  };
}

/** Three nodes far apart and six dof components that hold the body without restraining it (3-2-1). */
function threeTwoOne(model) {
  const X = (n) => [model.nodes[3 * n], model.nodes[3 * n + 1], model.nodes[3 * n + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let A = 0; for (let n = 1; n < model.nn; n++) if (X(n)[0] + X(n)[1] + X(n)[2] < X(A)[0] + X(A)[1] + X(A)[2]) A = n;
  let B = A, bd = -1; for (let n = 0; n < model.nn; n++) { const d = Math.hypot(...sub(X(n), X(A))); if (d > bd) { bd = d; B = n; } }
  const ab = sub(X(B), X(A));
  let C = A, cd = -1; for (let n = 0; n < model.nn; n++) { const d = Math.hypot(...cross(ab, sub(X(n), X(A)))); if (d > cd) { cd = d; C = n; } }
  const big = (v) => [0, 1, 2].sort((p, q) => Math.abs(v[q]) - Math.abs(v[p]));
  const fixed = new Uint8Array(3 * model.nn);
  for (let k = 0; k < 3; k++) fixed[3 * A + k] = 1;
  // B may slide along AB (its largest component free) — the other two held.
  const ob = big(ab); fixed[3 * B + ob[1]] = 1; fixed[3 * B + ob[2]] = 1;
  // C held against turning about AB: the component along AB × AC.
  const nrm = cross(ab, sub(X(C), X(A))); fixed[3 * C + big(nrm)[0]] = 1;
  return { fixed, nodes: [A, B, C] };
}

/** Least-squares rigid motion and uniform scale of a displacement field: u ≈ t + ω × (x − c) + s (x − c). */
export function bestFitSimilarity(nodes, u, nn) {
  const c = [0, 0, 0]; for (let n = 0; n < nn; n++) for (let k = 0; k < 3; k++) c[k] += nodes[3 * n + k] / nn;
  const M = Array.from({ length: 7 }, () => new Float64Array(7)), r = new Float64Array(7);
  const row = new Float64Array(7);
  for (let n = 0; n < nn; n++) {
    const x = [nodes[3 * n] - c[0], nodes[3 * n + 1] - c[1], nodes[3 * n + 2] - c[2]];
    // rows for components 0..2: [t (3), ω (3), s]
    const rows = [
      [1, 0, 0, 0, x[2], -x[1], x[0]],
      [0, 1, 0, -x[2], 0, x[0], x[1]],
      [0, 0, 1, x[1], -x[0], 0, x[2]],
    ];
    for (let k = 0; k < 3; k++) {
      row.set(rows[k]);
      for (let a = 0; a < 7; a++) { r[a] += row[a] * u[3 * n + k]; for (let b = 0; b < 7; b++) M[a][b] += row[a] * row[b]; }
    }
  }
  // Gaussian elimination (7 × 7).
  const A = M.map((x) => Array.from(x)), b = Array.from(r);
  for (let col = 0; col < 7; col++) {
    let p = col; for (let q = col + 1; q < 7; q++) if (Math.abs(A[q][col]) > Math.abs(A[p][col])) p = q;
    [A[col], A[p]] = [A[p], A[col]]; [b[col], b[p]] = [b[p], b[col]];
    for (let q = col + 1; q < 7; q++) { const f = A[q][col] / A[col][col]; for (let k = col; k < 7; k++) A[q][k] -= f * A[col][k]; b[q] -= f * b[col]; }
  }
  const p = new Array(7).fill(0);
  for (let q = 6; q >= 0; q--) { let s = b[q]; for (let k = q + 1; k < 7; k++) s -= A[q][k] * p[k]; p[q] = s / A[q][q]; }
  const out = new Float64Array(3 * nn);
  for (let n = 0; n < nn; n++) {
    const x = [nodes[3 * n] - c[0], nodes[3 * n + 1] - c[1], nodes[3 * n + 2] - c[2]];
    const w = [p[3], p[4], p[5]];
    const rot = [w[1] * x[2] - w[2] * x[1], w[2] * x[0] - w[0] * x[2], w[0] * x[1] - w[1] * x[0]];
    for (let k = 0; k < 3; k++) out[3 * n + k] = u[3 * n + k] - (p[k] + rot[k] + p[6] * x[k]);
  }
  return { residual: out, translation: p.slice(0, 3), rotation: p.slice(3, 6), scale: p[6], centre: c };
}

/**
 * The warpage of a part. mesh: the part's surface mesh; strains: a sampler from mouldingStrains; solid: { E, nu };
 * meshOptions: { size, order }. Returns { ok, model, cases: { shrinkage, cooling, orientation, total } each
 * { displacement, max, warp (after the best-fit similarity), warpMax, vertexDisplacement }, dominant, held }.
 */
export function warpage({ mesh, strains, solid, meshOptions = {}, onProgress = null }) {
  const model = buildModel([{ mesh, material: { E: solid.E, nu: solid.nu } }], { order: 1, resolution: 24, ...meshOptions });
  if (!model.ok) return { ok: false, error: model.error ?? 'warp-mesh' };
  onProgress?.(0.2);
  const K0 = stiffnessMatrix(model);
  const { fixed, nodes: held } = threeTwoOne(model);
  const npe = model.npe, rule = ruleOf(model.order), dNs = ruleDerivatives(model.order, rule);
  const X = new Float64Array(3 * npe), G = new Float64Array(3 * npe);
  // Sample the strains at every Gauss point once (cooling: the wall temperature, made relative to its mean).
  const ng = rule.weights.length;
  const samples = new Array(model.ne * ng); const vol = new Float64Array(model.ne * ng);
  let Tsum = 0, Vsum = 0, anyT = false;
  for (let e = 0; e < model.ne; e++) {
    elementX(model, e, X);
    for (let g = 0; g < ng; g++) {
      const L = rule.points[g];
      const p = [0, 0, 0];
      // The Gauss point: linear (corner) interpolation is enough to find the cavity node.
      for (let a = 0; a < 4; a++) for (let k = 0; k < 3; k++) p[k] += L[a] * X[3 * a + k];
      const s = strains(p);
      const det = gradients(npe, X, dNs[g], G);
      const w = rule.weights[g] * Math.abs(det);
      samples[e * ng + g] = s; vol[e * ng + g] = w;
      if (s.coolingT != null) { anyT = true; Tsum += s.coolingT * w; Vsum += w; }
    }
  }
  const Tmean = anyT ? Tsum / Vsum : 0;
  onProgress?.(0.4);
  const loads = Object.fromEntries(CAUSES.map((c) => [c, new Float64Array(3 * model.nn)]));
  for (let e = 0; e < model.ne; e++) {
    const mat = model.bodies[model.elemBody[e]].material, lam = mat.lambda, mu = mat.mu;
    elementX(model, e, X);
    for (let g = 0; g < ng; g++) {
      gradients(npe, X, dNs[g], G);
      const s = samples[e * ng + g], w = vol[e * ng + g];
      const eps = {
        shrinkage: s.shrinkage, orientation: s.orientation,
        cooling: s.coolingT != null ? ISO.map((v) => -s.cte * (s.coolingT - Tmean) * v) : null,
      };
      for (const c of CAUSES) {
        const ep = eps[c]; if (!ep) continue;
        const tr = ep[0] + ep[1] + ep[2];
        const sx = lam * tr + 2 * mu * ep[0], sy = lam * tr + 2 * mu * ep[1], sz = lam * tr + 2 * mu * ep[2];
        const txy = mu * ep[3], tyz = mu * ep[4], tzx = mu * ep[5];
        if (!(sx || sy || sz || txy || tyz || tzx)) continue;
        const f = loads[c];
        for (let a = 0; a < npe; a++) {
          const gx = G[3 * a], gy = G[3 * a + 1], gz = G[3 * a + 2], d = 3 * model.elements[npe * e + a];
          f[d] += w * (gx * sx + gy * txy + gz * tzx);
          f[d + 1] += w * (gx * txy + gy * sy + gz * tyz);
          f[d + 2] += w * (gx * tzx + gy * tyz + gz * sz);
        }
      }
    }
  }
  onProgress?.(0.55);
  const K = cloneMatrix(K0);
  applyDirichlet(K, fixed);
  let factor = null, M = null;
  const cases = {};
  const total = new Float64Array(3 * model.nn);
  for (const c of CAUSES) {
    const b = loads[c];
    for (let d = 0; d < b.length; d++) if (fixed[d]) b[d] = 0;
    const u = new Float64Array(3 * model.nn);
    if (b.some((v) => v !== 0)) {
      const r = solveSystem(K, b, u, { factor, M, coords: model.nodes, tol: 1e-10 });
      factor = r.factor ?? factor; M = r.M ?? M;
    }
    for (let d = 0; d < u.length; d++) total[d] += u[d];
    cases[c] = u;
    onProgress?.(0.55 + 0.12 * (CAUSES.indexOf(c) + 1));
  }
  cases.total = total;
  const out = {};
  for (const [c, u] of Object.entries(cases)) {
    let max = 0; for (let n = 0; n < model.nn; n++) max = Math.max(max, Math.hypot(u[3 * n], u[3 * n + 1], u[3 * n + 2]));
    const fit = bestFitSimilarity(model.nodes, u, model.nn);
    let warpMax = 0, at = 0; for (let n = 0; n < model.nn; n++) { const v = Math.hypot(fit.residual[3 * n], fit.residual[3 * n + 1], fit.residual[3 * n + 2]); if (v > warpMax) { warpMax = v; at = n; } }
    out[c] = { displacement: u, max, warp: fit.residual, warpMax, warpAt: [model.nodes[3 * at], model.nodes[3 * at + 1], model.nodes[3 * at + 2]], scale: fit.scale, vertexDisplacement: surfaceField(model, u, 3, 0), vertexWarp: surfaceField(model, fit.residual, 3, 0) };
  }
  const dominant = CAUSES.reduce((best, c) => (out[c].warpMax > (out[best]?.warpMax ?? -1) ? c : best), CAUSES[0]);
  onProgress?.(1);
  return { ok: true, model, nodes: model.nodes, elements: model.ne, cases: out, dominant, held, Tmean };
}
