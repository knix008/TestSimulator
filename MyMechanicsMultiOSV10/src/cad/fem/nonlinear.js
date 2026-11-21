// Nonlinear static analysis on the tetrahedral model (no kernel, no DOM).
//
// Kinematics: total Lagrangian. F = I + ∇₀u, Green–Lagrange strain E = ½(FᵀF − I), second Piola–Kirchhoff
// stress S; internal force ∫ B_NLᵀ S dV₀ with δE = sym(Fᵀ∇₀δu); tangent K = ∫ B_NLᵀ C B_NL dV₀ + ∫ ∇Nᵀ S ∇N dV₀ (I₃).
// With geometric: false the kinematics are linear (small displacements, F = I, no initial-stress term).
//
// Material: J2 (von Mises) plasticity on E = Eᵉ + Eᵖ (hyperelastic–plastic St Venant–Kirchhoff form: exact for large
// rotations, small elastic strains), linear isotropic hardening K' and linear kinematic (Prager) hardening H'.
// Radial return (Simo & Hughes, Box 3.2): trial ξ = dev S_tr − α, f = ‖ξ‖ − √(2/3)(σy + K' ε̄ᵖ), Δγ = f / (2μ + ⅔(K'+H')),
// S = S_tr − 2μΔγ n, α ← α + ⅔H'Δγ n, ε̄ᵖ ← ε̄ᵖ + √(2/3)Δγ. Consistent (algorithmic) tangent
// C = κ 1⊗1 + 2μβ I_dev − 2μγ̄ n⊗n, β = 1 − 2μΔγ/‖ξ‖, γ̄ = 1/(1 + (K'+H')/3μ) − (1 − β), so Newton converges
// quadratically. Unloading is elastic from the current yield surface; reversed loading yields at the shifted surface
// (Bauschinger effect), so cyclic histories give the bilinear hysteresis loop.
//
// Load control along a load history (piecewise linear factors, e.g. [0, 1, 0, −1, 0]) of the loads and prescribed
// displacements, or the arc-length method (Crisfield, cylindrical) to pass limit points.
//
// Units: mm, N, MPa.

import { buildModel, fixtureData, rotateMatrix, rotateVector, loadVector, elementX, modelGraph, surfaceField, fieldMax, recoverNodal, vonMisesField } from './model.js';
import { ruleOf, ruleDerivatives, gradients, vonMises } from './elements.js';
import { csrFromGraph, assemble, applyDirichlet, multiply, solveSystem, dot } from './sparse.js';

const SQ23 = Math.sqrt(2 / 3);

const fail = (error, extra = {}) => ({ ok: false, error, elements: 0, elementSize: 0, maxDisplacement: 0, maxStress: 0, minFactorOfSafety: Infinity, vertexDisplacement: new Float32Array(0), vertexStress: new Float32Array(0), curve: [], ...extra });

/**
 * J2 return mapping at one point. E: total strain (Voigt, engineering shear); st: { ep (6, engineering), alpha (6, tensor),
 * eqp } committed state (not changed); out: { S (6), D (36), ep, alpha, eqp, yielded }.
 */
export function j2Update(E, st, mat, out) {
  const { lambda, mu } = mat, kappa = lambda + (2 / 3) * mu;
  const Hi = mat.isotropic ?? 0, Hk = mat.kinematic ?? 0, sy = mat.yield ?? Infinity;
  const ee = [E[0] - st.ep[0], E[1] - st.ep[1], E[2] - st.ep[2], E[3] - st.ep[3], E[4] - st.ep[4], E[5] - st.ep[5]];
  const tr = ee[0] + ee[1] + ee[2];
  // Trial stress (tensor components): normal λ tr + 2μ e_ii, shear μ γ.
  const S = out.S;
  S[0] = lambda * tr + 2 * mu * ee[0]; S[1] = lambda * tr + 2 * mu * ee[1]; S[2] = lambda * tr + 2 * mu * ee[2];
  S[3] = mu * ee[3]; S[4] = mu * ee[4]; S[5] = mu * ee[5];
  const p = (S[0] + S[1] + S[2]) / 3;
  const xi = [S[0] - p - st.alpha[0], S[1] - p - st.alpha[1], S[2] - p - st.alpha[2], S[3] - st.alpha[3], S[4] - st.alpha[4], S[5] - st.alpha[5]];
  const nx = Math.sqrt(xi[0] ** 2 + xi[1] ** 2 + xi[2] ** 2 + 2 * (xi[3] ** 2 + xi[4] ** 2 + xi[5] ** 2));
  const f = nx - SQ23 * (sy + Hi * st.eqp);
  const D = out.D;
  D.fill(0);
  out.ep = st.ep; out.alpha = st.alpha; out.eqp = st.eqp; out.yielded = false;
  if (!(f > 1e-12 * Math.max(1, sy)) || !mat.plastic) {
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) D[i * 6 + j] = lambda; D[i * 6 + i] = lambda + 2 * mu; D[(i + 3) * 6 + i + 3] = mu; }
    return out;
  }
  const dg = f / (2 * mu + (2 / 3) * (Hi + Hk));
  const n = xi.map((x) => x / nx);
  for (let i = 0; i < 6; i++) S[i] -= 2 * mu * dg * n[i];
  out.alpha = st.alpha.map((a, i) => a + (2 / 3) * Hk * dg * n[i]);
  out.eqp = st.eqp + SQ23 * dg;
  out.ep = st.ep.map((e, i) => e + (i < 3 ? 1 : 2) * dg * n[i]);
  out.yielded = true;
  const beta = 1 - (2 * mu * dg) / nx, gbar = 1 / (1 + (Hi + Hk) / (3 * mu)) - (1 - beta);
  // C = κ 1⊗1 + 2μβ (I − ⅓ 1⊗1) − 2μ γ̄ n⊗n (Voigt with engineering shear: shear diagonal μβ).
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[i * 6 + j] = kappa + 2 * mu * beta * ((i === j ? 1 : 0) - 1 / 3);
  for (let i = 3; i < 6; i++) D[i * 6 + i] = mu * beta;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) D[i * 6 + j] -= 2 * mu * gbar * n[i] * n[j];
  return out;
}

/** The per-Gauss-point material state of a model. */
function newState(ng) { return { ep: new Float64Array(6 * ng), alpha: new Float64Array(6 * ng), eqp: new Float64Array(ng), S: new Float64Array(6 * ng), yielded: new Uint8Array(ng) }; }

/**
 * Internal force and (optionally) tangent of displacement u. Writes trial state into `trial` (committed: `state`).
 * Returns the internal force vector.
 */
function internal(model, mats, u, state, trial, K, geometric) {
  const npe = model.npe, rule = ruleOf(model.order), ng = rule.weights.length, dNs = ruleDerivatives(model.order, rule);
  const X = new Float64Array(3 * npe), G = new Float64Array(3 * npe), fint = new Float64Array(3 * model.nn);
  const m = 3 * npe, Ke = K ? new Float64Array(m * m) : null, B = new Float64Array(6 * m), DB = new Float64Array(6 * m), ids = new Int32Array(npe);
  const E = new Float64Array(6), out = { S: new Float64Array(6), D: new Float64Array(36) }, st = { ep: [0, 0, 0, 0, 0, 0], alpha: [0, 0, 0, 0, 0, 0], eqp: 0 };
  const F = new Float64Array(9);
  for (let e = 0; e < model.ne; e++) {
    const mat = mats[model.elemBody[e]];
    elementX(model, e, X);
    for (let a = 0; a < npe; a++) ids[a] = model.elements[npe * e + a];
    if (Ke) Ke.fill(0);
    for (let g = 0; g < ng; g++) {
      const w = rule.weights[g] * gradients(npe, X, dNs[g], G), q = ng * e + g;
      // F = I + Σ u_a ⊗ G_a
      F[0] = 1; F[1] = 0; F[2] = 0; F[3] = 0; F[4] = 1; F[5] = 0; F[6] = 0; F[7] = 0; F[8] = 1;
      for (let a = 0; a < npe; a++) {
        const d = 3 * ids[a], gx = G[3 * a], gy = G[3 * a + 1], gz = G[3 * a + 2];
        for (let k = 0; k < 3; k++) { const uk = u[d + k]; F[3 * k] += uk * gx; F[3 * k + 1] += uk * gy; F[3 * k + 2] += uk * gz; }
      }
      if (geometric) {
        // E = ½(FᵀF − I), Voigt engineering.
        const C = (i, j) => F[i] * F[j] + F[3 + i] * F[3 + j] + F[6 + i] * F[6 + j];
        E[0] = 0.5 * (C(0, 0) - 1); E[1] = 0.5 * (C(1, 1) - 1); E[2] = 0.5 * (C(2, 2) - 1);
        E[3] = C(0, 1); E[4] = C(1, 2); E[5] = C(2, 0);
      } else {
        E[0] = F[0] - 1; E[1] = F[4] - 1; E[2] = F[8] - 1;
        E[3] = F[1] + F[3]; E[4] = F[5] + F[7]; E[5] = F[6] + F[2];
      }
      for (let i = 0; i < 6; i++) { st.ep[i] = state.ep[6 * q + i]; st.alpha[i] = state.alpha[6 * q + i]; }
      st.eqp = state.eqp[q];
      j2Update(E, st, mat, out);
      const S = out.S;
      for (let i = 0; i < 6; i++) { trial.S[6 * q + i] = S[i]; trial.ep[6 * q + i] = out.ep[i]; trial.alpha[6 * q + i] = out.alpha[i]; }
      trial.eqp[q] = out.eqp; trial.yielded[q] = out.yielded ? 1 : state.yielded[q];
      // B_NL rows (geometric: F; else identity).
      const Fm = geometric ? F : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (let a = 0; a < npe; a++) {
        const g0 = G[3 * a], g1 = G[3 * a + 1], g2 = G[3 * a + 2];
        for (let k = 0; k < 3; k++) {
          const c = 3 * a + k, Fk0 = Fm[3 * k], Fk1 = Fm[3 * k + 1], Fk2 = Fm[3 * k + 2];
          B[c] = Fk0 * g0; B[m + c] = Fk1 * g1; B[2 * m + c] = Fk2 * g2;
          B[3 * m + c] = Fk0 * g1 + Fk1 * g0; B[4 * m + c] = Fk1 * g2 + Fk2 * g1; B[5 * m + c] = Fk2 * g0 + Fk0 * g2;
        }
      }
      for (let c = 0; c < m; c++) {
        let s = 0; for (let v = 0; v < 6; v++) s += B[v * m + c] * S[v];
        fint[3 * ids[(c / 3) | 0] + (c % 3)] += w * s;
      }
      if (!Ke) continue;
      const D = out.D;
      for (let v = 0; v < 6; v++) for (let c = 0; c < m; c++) { let s = 0; for (let k = 0; k < 6; k++) s += D[v * 6 + k] * B[k * m + c]; DB[v * m + c] = s; }
      for (let r = 0; r < m; r++) for (let c = r; c < m; c++) {
        let s = 0; for (let v = 0; v < 6; v++) s += B[v * m + r] * DB[v * m + c];
        Ke[r * m + c] += w * s;
      }
      if (geometric) {
        for (let a = 0; a < npe; a++) {
          const ax = G[3 * a], ay = G[3 * a + 1], az = G[3 * a + 2];
          const tx = S[0] * ax + S[3] * ay + S[5] * az, ty = S[3] * ax + S[1] * ay + S[4] * az, tz = S[5] * ax + S[4] * ay + S[2] * az;
          for (let b = a; b < npe; b++) {
            const v = w * (tx * G[3 * b] + ty * G[3 * b + 1] + tz * G[3 * b + 2]);
            for (let k = 0; k < 3; k++) Ke[(3 * a + k) * m + 3 * b + k] += v;
          }
        }
      }
    }
    if (Ke) {
      for (let r = 0; r < m; r++) for (let c = 0; c < r; c++) Ke[r * m + c] = Ke[c * m + r];
      // The geometric blocks were added on the upper triangle with b ≥ a only; mirror them as part of the symmetric fill.
      assemble(K, ids, npe, Ke);
    }
  }
  return fint;
}

/**
 * Nonlinear static study. input: { bodies, fixtures, loads, gravity, mesh, material overrides per body in bodies[i].material:
 * { E, nu, yield, isotropic (K', MPa), kinematic (H', MPa), plastic (default true) },
 *   geometric (default true), history (load factors, default [0, 1]), steps (increments per history segment, default 8),
 *   maxNewton (default 20), tol (relative residual, default 1e-6), arcLength: { length (initial Δl as a fraction of the
 *   first linear increment), maxSteps, target factor } | null, onProgress, cancel }.
 * Returns analyse()-like fields + { curve: [{ factor, maxDisplacement, maxStress, reaction, probe }], newtonIterations,
 * convergence (residual sequences per increment), yieldedElements, plasticFraction, equivalentPlasticStrain (nodal),
 * stress (6 per node, Cauchy approx. by S for small strains) }.
 */
export function nonlinearStudy(input) {
  const { bodies, fixtures = [], loads = [], gravity = null, mesh = {}, geometric = true, history = null, steps = 8, maxNewton = 20, tol = 1e-6,
    arcLength = null, track = null, onProgress = null, cancel = null, model: given = null } = input;
  if (!fixtures.length) return fail('no-fixtures');
  const report = (f, st) => onProgress?.(Math.min(1, Math.max(0, f)), st);
  const model = given ?? buildModel(bodies, mesh, (f) => report(0.15 * f, 'mesh'));
  if (!model.ok) return fail(model.error);
  const mats = model.bodies.map((p) => {
    const m = p.material;
    const E = m.E, Et = m.tangentModulus > 0 ? m.tangentModulus : null;
    // Plastic modulus from a tangent modulus Et (uniaxial bilinear curve): H = E·Et / (E − Et), shared by the mix.
    let Hi = Number(m.isotropic ?? NaN), Hk = Number(m.kinematic ?? NaN);
    if (!Number.isFinite(Hi) && !Number.isFinite(Hk)) { const H = Et ? (E * Et) / Math.max(1e-9, E - Et) : E / 19; const mix = Math.min(1, Math.max(0, m.kinematicFraction ?? 0.5)); Hi = (1 - mix) * H; Hk = mix * H; }
    return { ...m, isotropic: Number.isFinite(Hi) ? Hi : 0, kinematic: Number.isFinite(Hk) ? Hk : 0, plastic: m.plastic !== false && m.yield > 0 };
  });
  const fx = fixtureData(model, fixtures);
  let nFixed = 0; for (let d = 0; d < fx.fixed.length; d++) nFixed += fx.fixed[d];
  if (!nFixed) return fail('no-fixtures', { model });
  const fref = loadVector(model, loads, gravity);
  let anyPrescribed = false; for (let d = 0; d < fref.length; d++) if (fx.fixed[d] && fx.value[d]) { anyPrescribed = true; break; }
  let fn = 0; for (let d = 0; d < fref.length; d++) fn += fref[d] * fref[d];
  if (!(fn > 0) && !anyPrescribed) return fail('no-loads', { model });
  const ndof = 3 * model.nn, ng = ruleOf(model.order).weights.length * model.ne;
  const graph = modelGraph(model), K = csrFromGraph(graph, 3);
  let state = newState(ng), trial = newState(ng);
  const u = new Float64Array(ndof);
  const curve = [], convergence = [];
  let newtonTotal = 0, failedAt = null;
  const local = (v) => rotateVector(Float64Array.from(v), fx.frames, true);
  const flocal = local(fref);
  const fnorm = Math.sqrt(dot(flocal, flocal));
  /** Residual reference: the larger of the applied load and the internal force (reactions included), never 0. */
  const refOf = (lam, fint) => Math.max(Math.abs(lam) * fnorm, Math.sqrt(dot(fint, fint)), 1e-9);
  /** Residual r = λ f − f_int (local frames, fixed dofs zero) and the tangent into K when asked. */
  const evaluate = (lam, withK) => {
    if (withK) K.val.fill(0);
    const fint = internal(model, mats, u, state, trial, withK ? K : null, geometric);
    const r = new Float64Array(ndof);
    for (let d = 0; d < ndof; d++) r[d] = lam * fref[d] - fint[d];
    rotateVector(r, fx.frames, true);
    for (let d = 0; d < ndof; d++) if (fx.fixed[d]) r[d] = 0;
    if (withK) { rotateMatrix(K, fx.frames); applyDirichlet(K, fx.fixed); Kpre = null; }
    return { r, fint };
  };
  let Kpre = null;
  const solveK = (b, x = new Float64Array(ndof)) => {
    const s = solveSystem(K, b, x, { prefer: input.solver ?? 'auto', tol: 1e-11, maxIter: 8000, factor: Kpre?.factor ?? null, M: Kpre?.M ?? null });
    Kpre = { factor: s.factor, M: s.M };
    return { x, it: s.it, ok: s.converged };
  };
  const addDu = (dul) => { const g = rotateVector(Float64Array.from(dul), fx.frames, false); for (let d = 0; d < ndof; d++) u[d] += g[d]; };
  const record = (lam) => {
    const st = recoverNodal(model, trial.S, 6), vm = vonMisesField(st, model.nn), dm = fieldMax(model, u, 3), sm = fieldMax(model, vm, 1);
    const reaction = reactionOf(lam);
    curve.push({ factor: lam, maxDisplacement: dm.value, maxStress: sm.value, reaction, probe: track ? trackValue(track) : null });
  };
  const reactionOf = (lam) => {
    const fint = internal(model, mats, u, state, newState(ng), null, geometric), out = [0, 0, 0];
    for (let n = 0; n < model.nn; n++) if (fx.owner[n] >= 0 && (track?.fixture == null || fx.owner[n] === track.fixture)) for (let c = 0; c < 3; c++) out[c] += fint[3 * n + c] - lam * fref[3 * n + c];
    return out;
  };
  const trackValue = (tr) => {
    if (tr.node != null) return [u[3 * tr.node], u[3 * tr.node + 1], u[3 * tr.node + 2]];
    return null;
  };
  /** Newton iterations at a fixed load factor with the prescribed displacements at lam × value. */
  const newtonAt = (lam) => {
    // Prescribed displacements: move the fixed dofs to their target first (local frames).
    const ul = local(u), du = new Float64Array(ndof);
    let move = false;
    for (let d = 0; d < ndof; d++) if (fx.fixed[d]) { du[d] = lam * fx.value[d] - ul[d]; if (du[d]) move = true; }
    const res = [];
    if (move) {
      // Dirichlet predictor: the free dofs follow the boundary increment through the current tangent,
      // K_ff Δu_f = −K_fc Δu_c, obtained as Δu = K⁻¹(−K Δu_c) with the fixed rows / columns of the unconstrained tangent.
      K.val.fill(0);
      internal(model, mats, u, state, trial, K, geometric);
      rotateMatrix(K, fx.frames);
      const rhs = multiply(K, du, new Float64Array(ndof));
      for (let d = 0; d < ndof; d++) rhs[d] = fx.fixed[d] ? du[d] : -rhs[d];
      applyDirichlet(K, fx.fixed);
      Kpre = null;
      const s = solveK(rhs);
      for (let d = 0; d < ndof; d++) if (fx.fixed[d]) s.x[d] = du[d];
      addDu(s.x);
    }
    for (let it = 0; it < maxNewton; it++) {
      const { r, fint } = evaluate(lam, true);
      const rn = Math.sqrt(dot(r, r)) / refOf(lam, fint);
      res.push(rn);
      if (rn < tol) return { ok: true, it, res };
      if (!Number.isFinite(rn)) return { ok: false, it, res };
      const s = solveK(r);
      newtonTotal += 1;
      addDu(s.x);
      if (cancel?.()) return { ok: false, it, res, cancelled: true };
    }
    const { r, fint } = evaluate(lam, false);
    const rn = Math.sqrt(dot(r, r)) / refOf(lam, fint);
    res.push(rn);
    return { ok: rn < tol * 10, it: maxNewton, res };
  };
  const commit = () => { const t = state; state = trial; trial = t; for (const k of ['ep', 'alpha', 'eqp', 'S', 'yielded']) trial[k].set(state[k]); };

  if (!arcLength) {
    const path = history?.length ? history : [0, 1];
    const total = (path.length - 1) * Math.max(1, Math.round(steps));
    let done = 0;
    record(path[0] ?? 0);
    for (let seg = 0; seg + 1 < path.length && !failedAt; seg++) {
      const a = path[seg], b = path[seg + 1], n = Math.max(1, Math.round(steps));
      for (let k = 1; k <= n; k++) {
        const lam = a + ((b - a) * k) / n;
        let r = newtonAt(lam);
        if (!r.ok && !r.cancelled) {
          // Cut back: two half increments.
          const lam0 = a + ((b - a) * (k - 1)) / n;
          const r1 = newtonAt(0.5 * (lam0 + lam));
          if (r1.ok) { commit(); r = newtonAt(lam); }
        }
        convergence.push({ factor: lam, residuals: r.res });
        if (r.cancelled) return fail('cancelled', { model });
        if (!r.ok) { failedAt = lam; break; }
        commit();
        record(lam);
        report(0.15 + 0.8 * (++done / total), 'solve');
      }
    }
  } else {
    // Arc-length (cylindrical, Crisfield): constraint ‖Δu‖ = Δl, load factor free.
    const target = arcLength.target ?? 1, maxSteps = arcLength.maxSteps ?? 40;
    record(0);
    evaluate(0, true);
    const ut0 = solveK(flocal).x;
    let dl = (arcLength.length ?? 0.1) * Math.sqrt(dot(ut0, ut0)) * target;
    let lam = 0, prevDu = null;
    for (let step = 0; step < maxSteps && lam < target * 0.9999; step++) {
      const uStart = Float64Array.from(u), stateLam = lam;
      evaluate(lam, true);
      const ut = solveK(flocal).x;
      let sgn = 1;
      if (prevDu) sgn = dot(prevDu, ut) >= 0 ? 1 : -1;
      let dlam = (sgn * dl) / Math.sqrt(dot(ut, ut));
      const Du = ut.map((x) => x * dlam);
      addDu(Du);
      lam += dlam;
      let ok = false, it = 0;
      const res = [];
      for (; it < maxNewton; it++) {
        const { r, fint } = evaluate(lam, true);
        const rn = Math.sqrt(dot(r, r)) / refOf(lam, fint);
        res.push(rn);
        if (rn < tol) { ok = true; break; }
        const ur = solveK(r).x, uT = solveK(flocal).x;
        // (Du + ur + δλ uT)² = Δl²
        const a1 = dot(uT, uT), w = Du.map((x, i) => x + ur[i]), a2 = 2 * dot(w, uT), a3 = dot(w, w) - dl * dl;
        const disc = a2 * a2 - 4 * a1 * a3;
        if (disc < 0) break;
        const r1 = (-a2 + Math.sqrt(disc)) / (2 * a1), r2 = (-a2 - Math.sqrt(disc)) / (2 * a1);
        const pick = (x) => dot(Du, w.map((v, i) => v + x * uT[i]));
        const dl1 = pick(r1) >= pick(r2) ? r1 : r2;
        const inc = w.map((v, i) => v + dl1 * uT[i] - Du[i]);
        for (let d = 0; d < ndof; d++) Du[d] += inc[d];
        addDu(inc);
        lam += dl1;
        newtonTotal++;
      }
      convergence.push({ factor: lam, residuals: res });
      if (!ok) {
        // Retry with half the arc.
        u.set(uStart); lam = stateLam; dl *= 0.5;
        if (dl < 1e-8 * Math.sqrt(dot(ut0, ut0))) { failedAt = lam; break; }
        step--; continue;
      }
      prevDu = Du;
      commit();
      record(lam);
      if (it <= 3) dl *= 1.5; else if (it > 8) dl *= 0.6;
      if (lam > target) break;
      report(0.15 + 0.8 * Math.min(1, lam / target, step / maxSteps), 'solve');
      if (cancel?.()) return fail('cancelled', { model });
    }
  }
  // Results at the last converged state.
  const nodal = recoverNodal(model, state.S, 6), vm = vonMisesField(nodal, model.nn);
  const eqpNodal = recoverNodal(model, state.eqp, 1);
  let yieldedPts = 0; for (let q = 0; q < ng; q++) yieldedPts += state.yielded[q];
  const ngp = ruleOf(model.order).weights.length;
  let yieldedElements = 0; for (let e = 0; e < model.ne; e++) { let y = 0; for (let g = 0; g < ngp; g++) y |= state.yielded[ngp * e + g]; yieldedElements += y; }
  const dm = fieldMax(model, u, 3), sm = fieldMax(model, vm, 1);
  let minFos = Infinity;
  for (let n = 0; n < model.nn; n++) { const y = mats[model.nodeBody[n]].yield; if (y > 0 && vm[n] > 0) minFos = Math.min(minFos, y / vm[n]); }
  report(1, 'done');
  const ok = !failedAt;
  return {
    ok, error: ok ? null : 'not-converged', solver: 'tet', model, failedAt,
    nodes: model.nodes, displacement: u, nodeStress: vm, stress: nodal, equivalentPlasticStrain: eqpNodal,
    elements: model.ne, nodeCount: model.nn, elementSize: model.size, quality: model.quality,
    maxDisplacement: dm.value, maxDisplacementAt: dm.at, maxStress: sm.value, maxStressAt: sm.at, minFactorOfSafety: minFos,
    vertexDisplacement: surfaceField(model, u, 3, 0), vertexStress: surfaceField(model, vm, 1, 0), vertexPlasticStrain: surfaceField(model, eqpNodal, 1, 0),
    curve, convergence, newtonIterations: newtonTotal, yieldedElements, plasticFraction: yieldedElements / model.ne, yieldedPoints: yieldedPts,
  };
}

export { vonMises };
