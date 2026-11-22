// Natural frequencies (K φ = ω² M φ, consistent mass, LOBPCG with an IC(0) preconditioner) and linear buckling
// (K φ = λ (−K_G(σ)) φ from the static stress, subspace iteration with K-solves) on the tetrahedral model.
// Units: mm, N, MPa, t/mm³ → ω in rad/s.

import { buildModel, fixtureData, rotateMatrix, rotateVector, addSprings, stiffnessMatrix, massMatrix, modelGraph, surfaceField, elementX } from './model.js';
import { linearStatic } from './static.js';
import { applyDirichlet, multiply, preconditioner, lobpcg, inexactInverse, dot, rcmOrder, envelopeSize, envelopeFactor } from './sparse.js';

/**
 * K⁻¹ for the eigen solvers: the envelope LDLᵀ factor when it fits (then LOBPCG needs only a few iterations), else a
 * few IC(0)-CG iterations (an inexact inverse).
 */
function inverseOf(K, mask) {
  const perm = rcmOrder(K.g), est = envelopeSize(K, perm);
  if (est.size < 2.5e7 && est.flops < 4e10) {
    const F = envelopeFactor(K, perm);
    if (F) return (r, z) => { F.solve(r, z); for (let d = 0; d < z.length; d++) if (mask[d]) z[d] = 0; return z; };
  }
  return inexactInverse(K, preconditioner(K), { mask });
}
import { ruleOf, ruleDerivatives, gradients } from './elements.js';

const failedModal = (error) => ({ ok: false, error, frequencies: [], modes: [], nodes: new Float64Array(0), nodeModes: [], elements: 0, elementSize: 0, iterations: 0, solverIterations: 0 });

/** Normalises a nodal mode to max |u| = 1 with its largest component positive; returns the surface shape too. */
function shapeOf(model, x, b = 0) {
  let big = 0, comp = 0;
  for (let n = 0; n < model.nn; n++) { const m = Math.hypot(x[3 * n], x[3 * n + 1], x[3 * n + 2]); if (m > big) big = m; }
  for (let d = 0; d < x.length; d++) if (Math.abs(x[d]) > Math.abs(comp)) comp = x[d];
  const s = big > 0 ? Math.sign(comp || 1) / big : 0;
  const nodal = Float64Array.from(x, (v) => v * s);
  return { nodal, surface: surfaceField(model, nodal, 3, b) };
}

/**
 * Natural frequencies. input: { bodies, fixtures, contacts, mesh, modes (default 4), tol, maxIter, onProgress, cancel }.
 * Returns { ok, frequencies (Hz), modes (surface xyz per mode, max 1), nodeModes, effectiveMass (fraction per axis), ... }.
 */
export function modalStudy(input) {
  const { bodies, fixtures = [], mesh = {}, modes = 4, tol = 1e-4, maxIter = 150, onProgress = null, cancel = null, model: given = null } = input;
  if (!fixtures.length) return failedModal('no-fixtures');
  const report = (f, st) => onProgress?.(Math.min(1, Math.max(0, f)), st);
  const model = given ?? buildModel(bodies, mesh, (f) => report(0.3 * f, 'mesh'));
  if (!model.ok) return failedModal(model.error);
  const fx = fixtureData(model, fixtures);
  let nFixed = 0; for (let d = 0; d < fx.fixed.length; d++) nFixed += fx.fixed[d];
  if (!nFixed && !fx.springs.length) return failedModal('no-fixtures');
  const graph = modelGraph(model);
  const K = stiffnessMatrix(model, graph), M = massMatrix(model, graph);
  addSprings(model, K, fx.springs);
  rotateMatrix(K, fx.frames); rotateMatrix(M, fx.frames);
  applyDirichlet(K, fx.fixed); applyDirichlet(M, fx.fixed);
  const ndof = 3 * model.nn, mask = fx.fixed;
  for (let d = 0; d < ndof; d++) if (mask[d]) { /* M row is identity after applyDirichlet: excluded through the mask */ }
  report(0.35, 'solve');
  const T = inverseOf(K, mask);
  const applyK = (x, out) => { multiply(K, x, out); for (let d = 0; d < ndof; d++) if (mask[d]) out[d] = 0; return out; };
  const applyM = (x, out) => { multiply(M, x, out); for (let d = 0; d < ndof; d++) if (mask[d]) out[d] = 0; return out; };
  const p = Math.max(1, Math.min(20, Math.round(modes)));
  const res = lobpcg(ndof, applyK, applyM, (r, z) => T(r, z), p, { mask, tol, maxIter, cancel, onIter: (it, r) => report(0.35 + 0.6 * Math.min(1, Math.max(it / maxIter, Math.log(1 / Math.max(r, tol)) / Math.log(1 / tol))), 'solve') });
  if (cancel?.()) return failedModal('cancelled');
  const frequencies = res.values.map((l) => Math.sqrt(Math.max(0, l)) / (2 * Math.PI));
  // Modes back to global axes; participation of each mode per axis (effective mass fractions).
  const nodeModes = [], shapes = [], effectiveMass = [];
  let total = 0;
  const ones = [0, 1, 2].map((ax) => { const v = new Float64Array(ndof); for (let n = 0; n < model.nn; n++) v[3 * n + ax] = 1; rotateVector(v, fx.frames, true); for (let d = 0; d < ndof; d++) if (mask[d]) v[d] = 0; return v; });
  const Mone = ones.map((v) => applyM(v, new Float64Array(ndof)));
  total = dot(ones[0], Mone[0]);
  for (const x of res.vectors) {
    const mx = applyM(x, new Float64Array(ndof)), gm = dot(x, mx);
    effectiveMass.push(Mone.map((mo) => (dot(x, mo) ** 2 / gm) / Math.max(1e-300, total)));
    const g = rotateVector(Float64Array.from(x), fx.frames, false);
    const s = shapeOf(model, g);
    nodeModes.push(s.nodal); shapes.push(s.surface);
  }
  report(1, 'done');
  return {
    ok: res.converged, error: res.converged ? null : 'not-converged', solver: 'tet', model,
    frequencies, modes: shapes, nodes: model.nodes, nodeModes, effectiveMass, totalMass: total,
    elements: model.ne, nodeCount: model.nn, elementSize: model.size, quality: model.quality, iterations: res.iterations, solverIterations: res.iterations,
  };
}

// ───────────────────────── buckling

/** −K_G p from Gauss stresses (gauss: 6 per point, ng points per element). */
function geometricOperator(model, gauss, mask, frames) {
  const npe = model.npe, rule = ruleOf(model.order), ng = rule.weights.length, dNs = ruleDerivatives(model.order, rule);
  // Per element: the symmetric npe×npe coupling s_ab = Σ_g w Σ_kl G_ak σ_kl G_bl.
  const S = new Float64Array(model.ne * npe * npe), X = new Float64Array(3 * npe), G = new Float64Array(3 * npe);
  for (let e = 0; e < model.ne; e++) {
    elementX(model, e, X);
    for (let g = 0; g < ng; g++) {
      const w = rule.weights[g] * gradients(npe, X, dNs[g], G), o = 6 * (ng * e + g);
      const sxx = gauss[o], syy = gauss[o + 1], szz = gauss[o + 2], sxy = gauss[o + 3], syz = gauss[o + 4], szx = gauss[o + 5];
      for (let a = 0; a < npe; a++) {
        const ax = G[3 * a], ay = G[3 * a + 1], az = G[3 * a + 2];
        const tx = sxx * ax + sxy * ay + szx * az, ty = sxy * ax + syy * ay + syz * az, tz = szx * ax + syz * ay + szz * az;
        for (let b2 = 0; b2 < npe; b2++) S[(e * npe + a) * npe + b2] += w * (tx * G[3 * b2] + ty * G[3 * b2 + 1] + tz * G[3 * b2 + 2]);
      }
    }
  }
  const tmp = new Float64Array(3 * model.nn);
  return (p, out) => {
    tmp.set(p);
    rotateVector(tmp, frames, false);
    out.fill(0);
    for (let e = 0; e < model.ne; e++) {
      const base = npe * e;
      for (let a = 0; a < npe; a++) {
        let x = 0, y = 0, z = 0;
        for (let b2 = 0; b2 < npe; b2++) { const c = S[(e * npe + a) * npe + b2], d = 3 * model.elements[base + b2]; x += c * tmp[d]; y += c * tmp[d + 1]; z += c * tmp[d + 2]; }
        const d = 3 * model.elements[base + a];
        out[d] -= x; out[d + 1] -= y; out[d + 2] -= z;
      }
    }
    rotateVector(out, frames, true);
    for (let d = 0; d < out.length; d++) if (mask[d]) out[d] = 0;
    return out;
  };
}

/**
 * Linear buckling. input as linearStatic plus { modes (default 2), maxIter, tol }. Returns { ok, loadFactor (smallest
 * positive; else the smallest in size), loadFactors, modes (surface shapes), staticResult, ... }.
 */
export function bucklingStudy(input) {
  const { modes = 2, maxIter = 120, tol = 1e-4, onProgress = null, cancel = null } = input;
  const report = (f, st) => onProgress?.(Math.min(1, Math.max(0, f)), st);
  const stat = linearStatic({ ...input, onProgress: (f, st) => report(0.45 * f, st) });
  if (stat.error && stat.error !== 'not-converged') return { ok: false, error: stat.error, loadFactors: [], loadFactor: 0, modes: [], staticResult: stat, elements: 0, elementSize: 0, iterations: 0 };
  const model = stat.model, fx = fixtureData(model, input.fixtures ?? []);
  const K = stiffnessMatrix(model, modelGraph(model));
  addSprings(model, K, fx.springs);
  rotateMatrix(K, fx.frames);
  applyDirichlet(K, fx.fixed);
  const ndof = 3 * model.nn, mask = fx.fixed;
  const applyK = (x, out) => { multiply(K, x, out); for (let d = 0; d < ndof; d++) if (mask[d]) out[d] = 0; return out; };
  const applyG = geometricOperator(model, stat.gaussStress, mask, fx.frames);
  const p = Math.max(1, Math.min(6, Math.round(modes)));
  // K_G φ = ν K φ with K positive definite: the most negative ν give the smallest positive load factors λ = −1/ν;
  // when none is negative (the loads only buckle the part reversed) the largest ν give the negative factors.
  const T = inverseOf(K, mask);
  const KG = (x, out) => { applyG(x, out); for (let d = 0; d < ndof; d++) out[d] = -out[d]; return out; };
  const u0 = rotateVector(Float64Array.from(stat.displacement), fx.frames, true);
  const opts = (k) => ({ mask, tol, maxIter, cancel, start: [u0], onIter: (it, r) => report(0.45 + (0.25 + 0.25 * k) * Math.min(1, Math.max(it / maxIter, Math.log(1 / Math.max(r, tol)) / Math.log(1 / tol))), 'solve') });
  let res = lobpcg(ndof, KG, applyK, T, p, opts(0));
  let factors = res.values.map((nu) => -1 / nu), vectors = res.vectors, it = res.iterations, converged = res.converged;
  if (!factors.some((f) => f > 0 && Number.isFinite(f))) {
    const neg = (x, out) => { KG(x, out); for (let d = 0; d < ndof; d++) out[d] = -out[d]; return out; };
    res = lobpcg(ndof, neg, applyK, T, p, opts(1));
    factors = res.values.map((nu) => 1 / nu); vectors = res.vectors; it += res.iterations; converged = res.converged;
  }
  const solverIterations = it;
  if (!factors.length || factors.every((f) => !Number.isFinite(f))) return { ok: false, error: 'not-converged', loadFactors: [], loadFactor: 0, modes: [], staticResult: stat, elements: model.ne, elementSize: model.size, iterations: it };
  const chosen = vectors.map((v, i) => ({ i, v }));
  const X = vectors;
  const positive = factors.filter((f) => f > 0);
  const loadFactor = positive.length ? Math.min(...positive) : factors.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  const shapes = chosen.map(({ i }) => shapeOf(model, rotateVector(Float64Array.from(X[i]), fx.frames, false)));
  const byFactor = factors.map((f, i) => ({ f, m: shapes[i] }));
  const first = byFactor.findIndex((x) => x.f === loadFactor);
  if (first > 0) byFactor.unshift(...byFactor.splice(first, 1));
  report(1, 'done');
  return {
    ok: converged && stat.ok, error: converged ? (stat.ok ? null : stat.error) : 'not-converged', solver: 'tet', model,
    loadFactor, loadFactors: byFactor.map((x) => x.f), modes: byFactor.map((x) => x.m.surface), nodeModes: byFactor.map((x) => x.m.nodal),
    staticResult: stat, elements: model.ne, nodeCount: model.nn, elementSize: model.size, iterations: it, solverIterations,
  };
}
