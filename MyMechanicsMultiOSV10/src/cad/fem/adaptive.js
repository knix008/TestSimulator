// Adaptive (h) meshing of the linear static study: solve, estimate each element's error, refine where it is large,
// and solve again until the estimated error falls under the target.
//
// Error (Zienkiewicz–Zhu): the difference between the recovered (smoothed, superconvergent) stress σ* and the
// element's own stress σ_h at its Gauss points, in the energy norm: e² = ∫ (σ* − σ_h)ᵀ C⁻¹ (σ* − σ_h) dV, and the
// relative error η = √(Σ e² / (Σ e² + Σ ∫ σ_hᵀ C⁻¹ σ_h dV)). C⁻¹ is the isotropic compliance of each body's material.
// Refinement: the elements carrying the largest errors (until `fraction` of the total) get a smaller local size, as
// point regions of the mesher (graded around them); nearby regions merge. The size factor follows the error: for
// quadratic elements the energy error falls about as h², so h·√(target / η), kept within 0.35…0.75 — a pass close to
// the target refines gently instead of multiplying the mesh. Each pass is kept in a
// history { pass, elements, nodes, maxStress, maxDisplacement, error }.
import { linearStatic } from './static.js';
import { elementX } from './model.js';
import { ruleOf, ruleDerivatives, gradients, shapeValues } from './elements.js';

/** σᵀ C⁻¹ σ for an isotropic material (Voigt: xx yy zz xy yz zx). */
function energy(s, E, nu) {
  return ((s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) - 2 * nu * (s[0] * s[1] + s[1] * s[2] + s[2] * s[0]) + 2 * (1 + nu) * (s[3] * s[3] + s[4] * s[4] + s[5] * s[5])) / E;
}

/**
 * Error of a static result: { eta, errors (e² per element), sizes (per element), centroids (3 per element) }.
 */
export function elementErrors(result) {
  const model = result.model, S = result.stress, G = result.gaussStress;
  const npe = model.npe, rule = ruleOf(model.order), ng = rule.weights.length, dNs = ruleDerivatives(model.order, rule);
  const X = new Float64Array(3 * npe), Gr = new Float64Array(3 * npe), N = new Float64Array(npe);
  const errors = new Float64Array(model.ne), sizes = new Float64Array(model.ne), centroids = new Float64Array(3 * model.ne);
  let eSum = 0, uSum = 0;
  const ds = new Float64Array(6), sh = new Float64Array(6);
  for (let e = 0; e < model.ne; e++) {
    const mat = model.bodies[model.elemBody[e]].material, E = mat.E, nu = mat.nu ?? 0.3;
    elementX(model, e, X);
    let ee = 0, ue = 0;
    for (let g = 0; g < ng; g++) {
      const w = rule.weights[g] * gradients(npe, X, dNs[g], Gr);
      shapeValues(model.order, rule.points[g], N);
      for (let k = 0; k < 6; k++) {
        let star = 0; for (let a = 0; a < npe; a++) star += N[a] * S[6 * model.elements[npe * e + a] + k];
        sh[k] = G[6 * (ng * e + g) + k]; ds[k] = star - sh[k];
      }
      ee += w * energy(ds, E, nu); ue += w * energy(sh, E, nu);
    }
    errors[e] = Math.max(0, ee); eSum += errors[e]; uSum += Math.max(0, ue);
    // Size: the mean length of the corner edges; centre: of the corners.
    const c = [0, 1, 2, 3].map((a) => [X[3 * a], X[3 * a + 1], X[3 * a + 2]]);
    let L = 0; for (const [i, j] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) L += Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1], c[i][2] - c[j][2]);
    sizes[e] = L / 6;
    for (let k = 0; k < 3; k++) centroids[3 * e + k] = (c[0][k] + c[1][k] + c[2][k] + c[3][k]) / 4;
  }
  return { eta: Math.sqrt(eSum / Math.max(1e-300, eSum + uSum)), errors, sizes, centroids, total: eSum, energy: uSum / 2 };
}

/** Refinement regions for the elements carrying the largest share of the error. */
export function refinementRegions(err, { fraction = 0.5, maxRegions = 60, factor = 0.5 } = {}) {
  const order = [...err.errors.keys()].sort((a, b) => err.errors[b] - err.errors[a]);
  const regions = []; let acc = 0;
  for (const e of order) {
    if (acc >= fraction * err.total || regions.length >= maxRegions) break;
    acc += err.errors[e];
    const p = [err.centroids[3 * e], err.centroids[3 * e + 1], err.centroids[3 * e + 2]], h = err.sizes[e];
    // Merge with a region it falls in (keeping the smaller size).
    const hit = regions.find((r) => Math.hypot(r.point[0] - p[0], r.point[1] - p[1], r.point[2] - p[2]) < r.radius);
    if (hit) { hit.size = Math.min(hit.size, h * factor); continue; }
    regions.push({ point: p, radius: 1.5 * h, size: h * factor });
  }
  return regions;
}

/**
 * The adaptive static study: input as linearStatic, plus { target (relative error, default 0.05), maxPasses
 * (default 4), fraction }. Returns the last result with { adaptive: { history, eta, converged } }.
 */
export function adaptiveStatic(input, { target = 0.05, maxPasses = 4, fraction = 0.5, maxElements = 80000, onPass = null } = {}) {
  const regions = [...(input.mesh?.refine ?? [])];
  const history = [];
  let r = null;
  for (let pass = 0; pass < maxPasses; pass++) {
    r = linearStatic({ ...input, mesh: { ...(input.mesh ?? {}), refine: regions } });
    if (!r.model || r.error && r.error !== 'not-converged') return { ...r, adaptive: { history, eta: null, converged: false } };
    const err = elementErrors(r);
    history.push({ pass: pass + 1, elements: r.elements, nodes: r.nodeCount, maxStress: r.maxStress, maxDisplacement: r.maxDisplacement, error: err.eta });
    onPass?.(history.at(-1));
    if (err.eta <= target || pass === maxPasses - 1 || r.elements >= maxElements) return { ...r, adaptive: { history, eta: err.eta, converged: err.eta <= target } };
    const factor = Math.min(0.75, Math.max(0.35, Math.sqrt(target / err.eta)));
    regions.push(...refinementRegions(err, { fraction, factor }));
  }
  return { ...r, adaptive: { history, eta: history.at(-1)?.error ?? null, converged: false } };
}

/**
 * p-adaptive (then hp) static study: the same mesh solved with linear (p = 1) and quadratic (p = 2) tetrahedra.
 * The strain energy converges from below as p rises, so the change from p 1 to p 2 estimates the linear solution's
 * error, √(|U₂ − U₁| / U₂); the quadratic one is judged by its own recovered-stress estimate. When that is still over
 * the target, the quadratic mesh is refined where the error is (h, adaptiveStatic) — elements are at most p = 2.
 * Returns the last result with { adaptive: { history: [{ pass, order, elements, nodes, maxStress, energy, error }],
 * eta, converged, method: 'p' | 'hp' } }.
 */
export function pAdaptiveStatic(input, { target = 0.05, maxPasses = 3, onPass = null } = {}) {
  const history = [];
  const mesh = input.mesh ?? {};
  const r1 = linearStatic({ ...input, mesh: { ...mesh, order: 1 } });
  if (!r1.model) return { ...r1, adaptive: { history, eta: null, converged: false, method: 'p' } };
  const e1 = elementErrors(r1);
  const r2 = linearStatic({ ...input, mesh: { ...mesh, order: 2 } });
  if (!r2.model) return { ...r2, adaptive: { history, eta: null, converged: false, method: 'p' } };
  const e2 = elementErrors(r2);
  const pErr = Math.sqrt(Math.abs(e2.energy - e1.energy) / Math.max(1e-300, e2.energy));
  history.push({ pass: 1, order: 1, elements: r1.elements, nodes: r1.nodeCount, maxStress: r1.maxStress, energy: e1.energy, error: Math.max(pErr, e1.eta) });
  onPass?.(history.at(-1));
  history.push({ pass: 2, order: 2, elements: r2.elements, nodes: r2.nodeCount, maxStress: r2.maxStress, energy: e2.energy, error: e2.eta });
  onPass?.(history.at(-1));
  if (e2.eta <= target || maxPasses <= 2) return { ...r2, adaptive: { history, eta: e2.eta, converged: e2.eta <= target, method: 'p', pChange: pErr } };
  // Still over: h-refine the quadratic mesh (its first pass is the p = 2 solve already made).
  const h = adaptiveStatic({ ...input, mesh: { ...mesh, order: 2 } }, { target, maxPasses: maxPasses - 1, onPass: (x) => { if (x.pass > 1) { const q = { ...x, pass: history.length + 1, order: 2 }; history.push(q); onPass?.(q); } } });
  return { ...h, adaptive: { history, eta: h.adaptive?.eta ?? e2.eta, converged: Boolean(h.adaptive?.converged), method: 'hp', pChange: pErr } };
}
