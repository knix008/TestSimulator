// Heat conduction on the tetrahedral model: steady state −∇·(k∇T) = 0 and transient ρc ∂T/∂t = ∇·(k∇T)
// (backward Euler), with fixed temperatures, heat power into faces, convection h(T − T∞) and internal heat
// generation, and radiation to the surroundings εσ(T⁴ − T∞⁴) (absolute temperatures; solved by Newton steps on
// the linearised film 4εσT³: steady until the temperatures stop changing, transient once per step). Several bodies (assembly components) can be joined by a thermal contact conductance (bonded
// faces conduct through a stiff film unless a conductance is given).
//
// Units: mm, W, °C, s. k W/(m·K) → 1e-3 W/(mm·K); h W/(m²·K) → 1e-6 W/(mm²·K); ρc (kg/m³·J/(kg·K)) → 1e-9 J/(mm³·K).

import { buildModel, selectFaces, integrateFaces, elementX, surfaceField, fieldMax, modelGraph, onFaceNodes, probe, linePlot } from './model.js';
import { conductionMatrix, ruleOf, ruleDerivatives, gradients, shapeValues } from './elements.js';
import { csrFromGraph, assemble, addEntry, applyDirichlet, multiply, preconditioner, pcg, cloneMatrix } from './sparse.js';
import { contactConstraints } from './static.js';

const THERMAL_DEFAULTS = { k: 50, cp: 500 };

const failed = (error) => ({ ok: false, error, nodes: new Float64Array(0), nodeTemperature: new Float64Array(0), vertexTemperature: new Float32Array(0), min: 0, max: 0, minAt: [0, 0, 0], maxAt: [0, 0, 0], heatFlowOut: 0, heatFlowIn: 0, faceHeatFlow: [], fluxIn: 0, convectionOut: 0, elements: 0, elementSize: 0, iterations: 0 });

/**
 * Heat conduction study. input: { bodies: [{ mesh, material: { k, cp, density } }], temperatures [{ faceId, value }],
 * fluxes [{ faceId, power W }], convections [{ faceId, h, ambient }], radiations [{ faceId, emissivity, ambient }],
 * generation [{ body, power W }] (uniform),
 * contacts ('bonded' | [{ a, b, type, conductance W/(m²K) }]), mesh, transient: { duration s, steps, initial °C,
 * samples } | null, tol, onProgress, cancel }.
 * Returns fields like the earlier voxel study plus { model, history (transient: [{ time, min, max, mean }]), probe }.
 */
export function heatStudy(input) {
  const { bodies, temperatures = [], fluxes = [], convections = [], radiations = [], generation = [], contacts = 'none', mesh = {}, transient = null, tol = 1e-10, maxIter = 20000, onProgress = null, cancel = null, model: given = null } = input;
  if (!temperatures.length && !convections.length && !radiations.length) return failed('no-temperature');
  const report = (f, st) => onProgress?.(Math.min(1, Math.max(0, f)), st);
  const model = given ?? buildModel(bodies, mesh, (f) => report(0.3 * f, 'mesh'));
  if (!model.ok) return failed(model.error);
  const nn = model.nn, props = model.bodies.map((p, b) => { const m = bodies?.[b]?.material ?? {}; const k = Number(m.k) > 0 ? Number(m.k) : THERMAL_DEFAULTS.k; const cp = Number(m.cp) > 0 ? Number(m.cp) : THERMAL_DEFAULTS.cp; return { k: k * 1e-3, rc: (Number(m.density) || 7850) * 1e-9 * cp }; });
  const cc = contacts && contacts !== 'none' ? contactConstraints(model, { contacts }) : { list: [], pairs: null };
  const graph = cc.pairs ? modelGraph(model, cc.pairs) : modelGraph(model);
  const K = csrFromGraph(graph, 1), Cap = new Float64Array(nn), b = new Float64Array(nn);
  const npe = model.npe, Ke = new Float64Array(npe * npe), X = new Float64Array(3 * npe), ids = new Int32Array(npe);
  const rule = ruleOf(model.order), dNs = ruleDerivatives(model.order, rule), G = new Float64Array(3 * npe), N = new Float64Array(npe);
  const genDensity = new Float64Array(model.bodies.length);
  for (const g of generation) { const p = model.bodies[g.body ?? 0]; if (p) genDensity[g.body ?? 0] += g.power / Math.max(1e-30, p.mesh.volume); }
  for (let e = 0; e < model.ne; e++) {
    const bi = model.elemBody[e], pr = props[bi];
    elementX(model, e, X);
    conductionMatrix(model.order, X, pr.k, Ke, dNs, G);
    for (let a = 0; a < npe; a++) ids[a] = model.elements[npe * e + a];
    assemble(K, ids, npe, Ke);
    // Lumped capacity and the generation load by Gauss integration.
    for (let g = 0; g < rule.weights.length; g++) {
      const w = rule.weights[g] * gradients(npe, X, dNs[g], G);
      shapeValues(model.order, rule.points[g], N);
      for (let a = 0; a < npe; a++) { b[ids[a]] += genDensity[bi] * N[a] * w; }
    }
    let V = 0; for (let g = 0; g < rule.weights.length; g++) V += rule.weights[g] * gradients(npe, X, dNs[g], G);
    const share = model.order === 2 ? [1, 1, 1, 1, 32 / 6, 32 / 6, 32 / 6, 32 / 6, 32 / 6, 32 / 6].map((x) => x / 36) : [0.25, 0.25, 0.25, 0.25];
    for (let a = 0; a < npe; a++) Cap[ids[a]] += pr.rc * V * share[a];
  }
  // Thermal contact: bonded faces as a conductance film (default: as conductive as 0.01 mm of the better body).
  for (const c of cc.list) {
    const kk = c.conductance ? c.conductance * 1e-6 : 100 * Math.max(...props.map((p) => p.k)) / Math.max(1e-6, model.size);
    const nodes = [c.s, ...c.m], coef = [1, ...c.w.map((x) => -x)];
    for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) addEntry(K, nodes[i], nodes[j], kk * c.area * coef[i] * coef[j]);
  }
  // Convection: H = h∫N_a N_b dA, b += h T∞ ∫N_a dA.
  const npf = model.faces.npf, He = new Float64Array(npf * npf);
  for (const cv of convections) {
    const hc = Number(cv.h) * 1e-6;
    if (!(hc > 0)) continue;
    for (const f of selectFaces(model, cv.body != null ? { body: cv.body, faceId: cv.faceId } : cv.faceId)) {
      He.fill(0);
      let fids = null;
      integrateFaces(model, [f], (nid, Nf, A) => {
        fids ??= Int32Array.from(nid);
        const a = Math.hypot(A[0], A[1], A[2]);
        for (let p = 0; p < npf; p++) { b[nid[p]] += hc * cv.ambient * Nf[p] * a; for (let q = 0; q < npf; q++) He[p * npf + q] += hc * Nf[p] * Nf[q] * a; }
      });
      assemble(K, fids, npf, He);
    }
  }
  // Radiation: the face area lumped on its nodes (εσA per node), with each node's surroundings temperature.
  const SIGMA = 5.670374419e-8 * 1e-6;   // W/(mm²·K⁴)
  const radC = new Float64Array(nn), radAmb = new Float64Array(nn);
  for (const rd of radiations) {
    const eps = Math.min(1, Math.max(0, Number(rd.emissivity)));
    if (!(eps > 0)) continue;
    integrateFaces(model, selectFaces(model, rd.body != null ? { body: rd.body, faceId: rd.faceId } : rd.faceId), (nid, Nf, A) => {
      const a = Math.hypot(A[0], A[1], A[2]);
      for (let p = 0; p < npf; p++) { const c = eps * SIGMA * Nf[p] * a; radAmb[nid[p]] = (radAmb[nid[p]] * radC[nid[p]] + (Number(rd.ambient) + 273.15) * c) / (radC[nid[p]] + c || 1); radC[nid[p]] += c; }
    });
  }
  const radiating = radC.some((c) => c > 0);
  /** Adds the radiation linearised about T0 (°C) to a matrix diagonal and a right-hand side. */
  const linearise = (A, rhs, T0) => {
    for (let n = 0; n < nn; n++) {
      const c = radC[n]; if (!c || fixed[n]) continue;
      const tk = Math.max(1, T0[n] + 273.15), t3 = tk * tk * tk, ta = radAmb[n];
      addEntry(A, n, n, 4 * c * t3);
      rhs[n] += c * (3 * t3 * tk + ta * ta * ta * ta) - 4 * c * t3 * 273.15;
    }
  };
  let fluxIn = 0;
  for (const fl of fluxes) {
    const faces = selectFaces(model, fl.body != null ? { body: fl.body, faceId: fl.faceId } : fl.faceId);
    let A = 0; integrateFaces(model, faces, (nid, Nf, Av) => { A += Math.hypot(Av[0], Av[1], Av[2]); });
    if (!(A > 0) || !fl.power) continue;
    const q = fl.power / A;
    integrateFaces(model, faces, (nid, Nf, Av) => { const a = Math.hypot(Av[0], Av[1], Av[2]); for (let p = 0; p < npf; p++) b[nid[p]] += q * Nf[p] * a; });
    fluxIn += fl.power;
  }
  for (const g of generation) fluxIn += g.power;
  // Fixed temperatures.
  const fixed = new Uint8Array(nn), value = new Float64Array(nn), owner = new Int32Array(nn).fill(-1);
  temperatures.forEach((bc, i) => { for (const n of onFaceNodes(model, selectFaces(model, bc.body != null ? { body: bc.body, faceId: bc.faceId } : bc.faceId))) { fixed[n] = 1; value[n] = bc.value; owner[n] = i; } });
  let nFixed = 0; for (let n = 0; n < nn; n++) nFixed += fixed[n];
  if (!nFixed && !convections.some((c) => c.h > 0) && !radiating) return failed('no-temperature');
  const Kref = cloneMatrix(K);
  report(0.4, 'solve');

  const T = new Float64Array(nn);
  let guess = 0, gn = 0;
  for (const t of temperatures) { guess += t.value; gn++; }
  for (const c of convections) { guess += c.ambient; gn++; }
  for (const c of radiations) { guess += Number(c.ambient); gn++; }
  T.fill(gn ? guess / gn : 20);
  for (let n = 0; n < nn; n++) if (fixed[n]) T[n] = value[n];
  let iterations = 0, converged = true;
  const history = [];
  if (transient && transient.duration > 0) {
    const steps = Math.max(1, Math.round(transient.steps ?? 50)), dt = transient.duration / steps;
    T.fill(Number.isFinite(transient.initial) ? transient.initial : 20);
    for (let n = 0; n < nn; n++) if (fixed[n]) T[n] = value[n];
    const A0 = cloneMatrix(K);
    for (let n = 0; n < nn; n++) addEntry(A0, n, n, Cap[n] / dt);
    let A = cloneMatrix(A0);
    const rhsBase = new Float64Array(nn);
    applyDirichlet(A, fixed, value, rhsBase);   // rhsBase: the fixed columns moved over
    let M = preconditioner(A);
    const radRhs = new Float64Array(nn);
    const every = Math.max(1, Math.floor(steps / Math.max(1, transient.samples ?? 50)));
    const rhs = new Float64Array(nn);
    const stats = (time) => { let mn = Infinity, mx = -Infinity, s = 0; for (let n = 0; n < nn; n++) { mn = Math.min(mn, T[n]); mx = Math.max(mx, T[n]); s += T[n]; } history.push({ time, min: mn, max: mx, mean: s / nn, probes: (transient.probes ?? []).map((p) => probe(model, p, { T: [T, 1] }).values.T ?? null) }); };
    stats(0);
    for (let s = 1; s <= steps; s++) {
      // Radiation: linearised about the last step's temperatures (the matrix diagonal changes with them).
      if (radiating) { A = cloneMatrix(A0); radRhs.fill(0); linearise(A, radRhs, T); rhsBase.fill(0); applyDirichlet(A, fixed, value, rhsBase); if (s === 1 || s % 10 === 0) M = preconditioner(A); }
      for (let n = 0; n < nn; n++) rhs[n] = fixed[n] ? value[n] : b[n] + (Cap[n] / dt) * T[n] + rhsBase[n] + radRhs[n];
      const r = pcg((v, out) => multiply(A, v, out), M, rhs, T, { tol, maxIter });
      iterations += r.it; if (!r.converged) converged = false;
      if (s % every === 0 || s === steps) stats(s * dt);
      report(0.4 + 0.55 * (s / steps), 'solve');
      if (cancel?.()) return failed('cancelled');
    }
  } else if (radiating) {
    // Newton steps on the radiation until the temperatures stop changing.
    let ok = false;
    for (let it = 0; it < 60; it++) {
      const A = cloneMatrix(K), rhs = Float64Array.from(b);
      linearise(A, rhs, T);
      applyDirichlet(A, fixed, value, rhs);
      const prev = Float64Array.from(T);
      const r = pcg((v, out) => multiply(A, v, out), preconditioner(A), rhs, T, { tol, maxIter, cancel });
      iterations += r.it; if (!r.converged) { converged = false; break; }
      let d = 0, span = 1; for (let n = 0; n < nn; n++) { d = Math.max(d, Math.abs(T[n] - prev[n])); span = Math.max(span, Math.abs(T[n])); }
      report(0.4 + 0.5 * Math.min(1, it / 10), 'solve');
      if (d < 1e-7 * span) { ok = true; break; }
      if (cancel?.()) return failed('cancelled');
    }
    if (!ok) converged = false;
  } else {
    const A = cloneMatrix(K), rhs = Float64Array.from(b);
    applyDirichlet(A, fixed, value, rhs);
    const r = pcg((v, out) => multiply(A, v, out), preconditioner(A), rhs, T, { tol, maxIter, cancel, onIter: (i) => report(0.4 + 0.5 * Math.min(1, i / 300), 'solve') });
    iterations = r.it; converged = r.converged;
  }
  // Heat balance: reactions at the fixed nodes, convection out.
  const KT = multiply(Kref, T, new Float64Array(nn));
  const faceHeatFlow = temperatures.map((bc) => ({ faceId: bc.faceId, value: 0 }));
  if (!transient) for (let n = 0; n < nn; n++) if (fixed[n] && owner[n] >= 0) faceHeatFlow[owner[n]].value -= KT[n] - b[n];
  let heatFlowOut = 0, heatFlowIn = 0;
  for (const f of faceHeatFlow) if (f.value > 0) heatFlowOut += f.value; else heatFlowIn -= f.value;
  let convectionOut = 0;
  for (const cv of convections) {
    const hc = Number(cv.h) * 1e-6;
    integrateFaces(model, selectFaces(model, cv.body != null ? { body: cv.body, faceId: cv.faceId } : cv.faceId), (nid, Nf, A) => {
      let t = 0; for (let p = 0; p < npf; p++) t += Nf[p] * T[nid[p]];
      convectionOut += hc * (t - cv.ambient) * Math.hypot(A[0], A[1], A[2]);
    });
  }
  let radiationOut = 0;
  for (let n = 0; n < nn; n++) if (radC[n]) { const tk = T[n] + 273.15; radiationOut += radC[n] * (tk ** 4 - radAmb[n] ** 4); }
  const mx = fieldMax(model, T, 1, false);
  let min = Infinity, minN = 0;
  for (let n = 0; n < nn; n++) if (T[n] < min) { min = T[n]; minN = n; }
  report(1, 'done');
  return {
    ok: converged, error: converged ? null : 'not-converged', solver: 'tet', model,
    nodes: model.nodes, nodeTemperature: T, vertexTemperature: surfaceField(model, T, 1, 0), bodies: model.bodies.map((p, bi) => ({ name: p.name, vertexTemperature: surfaceField(model, T, 1, bi) })),
    min, max: mx.value, minAt: [model.nodes[3 * minN], model.nodes[3 * minN + 1], model.nodes[3 * minN + 2]], maxAt: mx.at,
    heatFlowOut, heatFlowIn, faceHeatFlow, fluxIn, convectionOut, radiationOut, history,
    elements: model.ne, nodeCount: model.nn, elementSize: model.size, quality: model.quality, iterations, conductivity: props[0].k * 1e3,
  };
}

/** Temperature at a point of a heat result. */
export function probeTemperature(result, p) {
  const r = probe(result.model, p, { T: [result.nodeTemperature, 1] });
  return r.element < 0 ? null : r.values.T;
}

/** Temperature along a line. */
export function temperatureLine(result, a, b, samples = 41) {
  return linePlot(result.model, a, b, { T: [result.nodeTemperature, 1] }, (v) => v.T, samples);
}
