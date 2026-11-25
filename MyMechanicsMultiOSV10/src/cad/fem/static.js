// Linear static analysis on the tetrahedral model, with contact between bodies (assembly components) and
// against rigid planes.
//
// Contact is node-to-surface: the nodes of one body's boundary (the slave, the finer of the two) are paired with
// the nearest boundary face of the other (the master, T6 / T3 shape functions at the projection).
//   bonded         u_s − Σ w_k u_k = 0, a stiff penalty (β·E/h per unit area) — a tie between non-matching meshes
//   contact        no penetration, frictionless: g = g0 + n·(u_s − Σ w_k u_k) ≥ 0, solved by the augmented
//                  Lagrangian (Uzawa) method: penalty k on the active set, multipliers λ (contact pressure) updated
//                  λ ← max(0, λ − k g) until the active set and λ settle — the result has no penetration
//                  beyond the solver tolerance, independent of k.
// Rigid planes ({ point, normal } with the body side along +normal) work like 'contact' with a fixed master.
//
// Input: { bodies: [{ mesh, material, name? }], fixtures, loads, gravity (m/s², e.g. [0,0,−9.81]), contacts:
// 'bonded' | 'contact' | 'none' (automatic between touching bodies) or [{ a, b, type, faces? }], walls,
// mesh: { size, resolution, order, refine }, tolerance (contact search, mm), tol, maxIter, onProgress, cancel }.

import { buildModel, fixtureData, rotateMatrix, rotateVector, addSprings, loadVector, elasticStresses, surfaceField, fieldMax, modelGraph, stiffnessMatrix, selectFaces, nodalAreas, probe, linePlot, principalField, integrateFaces } from './model.js';
import { faceShape } from './elements.js';
import { applyDirichlet, multiply, solveSystem, cloneMatrix, addEntry } from './sparse.js';

const fail = (error, extra = {}) => ({
  ok: false, error, nodes: new Float64Array(0), displacement: new Float64Array(0), nodeStress: new Float64Array(0), elements: 0, elementSize: 0,
  maxDisplacement: 0, maxDisplacementAt: [0, 0, 0], maxStress: 0, maxStressAt: [0, 0, 0], minFactorOfSafety: Infinity, iterations: 0,
  vertexDisplacement: new Float32Array(0), vertexStress: new Float32Array(0), ...extra,
});

import { contactConstraints, cyclicTies, addPenalty, jump, vectorJump, addForce, tangents } from './contact.js';
import { thermalOffset } from './model.js';
import { connectorConstraints, addConnectors, addPreloads, connectorResults } from './connectors.js';
import { smoothedAggregation } from './amg.js';
import { setMultigrid, csrFromGraph } from './sparse.js';
import { matmul, transpose } from './amg.js';
setMultigrid((A, o) => smoothedAggregation(A, o));
export { contactConstraints };

// ───────────────────────── the study

/**
 * Linear static study. Returns analyse()-compatible fields (for body 0 / a single part) plus
 * { model, stress (6 per node), principal, reactions [{ faceId, force }], contact: { pressure (per constraint),
 * force, area, iterations, maxPenetration }, bodies: [{ name, vertexDisplacement, vertexStress, maxStress }] }.
 */
export function linearStatic(input) {
  const { bodies, fixtures = [], loads = [], gravity = null, contacts = 'none', walls = [], mesh = {}, tolerance = null, tol = 1e-8, maxIter = 20000, onProgress = null, cancel = null, model: given = null } = input;
  const report = (f, stage) => onProgress?.(Math.min(1, Math.max(0, f)), stage);
  const model = given ?? buildModel(bodies, mesh, (f) => report(0.3 * f, 'mesh'));
  if (!model.ok) return fail(model.error);
  const fx = fixtureData(model, fixtures);
  const hasWalls = (walls ?? []).length > 0;
  if (!fx.count && !hasWalls) return fail('no-fixtures', { model });
  let nFixed = 0; for (let d = 0; d < fx.fixed.length; d++) nFixed += fx.fixed[d];
  if (!nFixed && !fx.springs.length && !hasWalls) return fail('no-fixtures', { model });
  const f = loadVector(model, loads, gravity);
  let fn = 0; for (let d = 0; d < f.length; d++) fn += f[d] * f[d];
  let anyPrescribed = false; for (let d = 0; d < f.length; d++) if (fx.fixed[d] && fx.value[d]) { anyPrescribed = true; break; }
  report(0.32, 'assemble');

  const cc = contactConstraints(model, { contacts, walls, tolerance, contactStiffness: input.contactStiffness ?? 200, friction: input.friction ?? 0, method: input.contactMethod ?? 'node', bondedStiffness: input.bondedStiffness ?? 10 });
  // Cyclic symmetry: ties of one cut face to the other turned by the sector angle.
  const cyc = cyclicTies(model, fixtures, { bondedStiffness: input.bondedStiffness ?? 10 });
  if (cyc.list.length) { cc.list.push(...cyc.list); cc.pairs = Int32Array.from([...(cc.pairs ?? []), ...cyc.pairs]); }
  // Connectors (springs, bolts, pins, rigid links, spot welds, bearings): their couplings in the pattern.
  const conn = connectorConstraints(model, input.connectors ?? []);
  if (conn.pairs.length) cc.pairs = Int32Array.from([...(cc.pairs ?? []), ...conn.pairs]);
  addPreloads(f, conn);
  const preloaded = conn.list.some((c) => c.preload);
  cc.conn = conn;
  // A shrink (interference) fit loads the bodies by itself: contact that starts overlapping.
  const interference = cc.list.some((c) => c.type === 'contact' && c.g0 < -1e-12);
  if (!(fn > 0) && !anyPrescribed && !interference && !preloaded) return fail('no-loads', { model });
  const graph = cc.pairs ? modelGraph(model, cc.pairs) : modelGraph(model);
  const K0 = stiffnessMatrix(model, graph, (x) => report(0.32 + 0.1 * x, 'assemble'));
  addSprings(model, K0, fx.springs);
  addConnectors(K0, conn);
  const Kref = cloneMatrix(K0);                  // for reactions
  const bonded0 = cc.list.filter((c) => c.type === 'bonded'), unilateral = cc.list.filter((c) => c.type === 'contact');
  report(0.45, 'solve');
  const ndof = 3 * model.nn, u = new Float64Array(ndof);
  // Bonded ties without unilateral contact: eliminated exactly (u_slave = Σ w u_master), the reduced system
  // K̂ = TᵀKT is as well conditioned as one body; with contact the ties use the augmented Lagrangian below.
  if (bonded0.length && !unilateral.length && input.tie !== 'penalty' && !bonded0.some((c) => c.R)) {
    const red = eliminateTies(K0, f, bonded0, model.nn, fx);
    if (red) {
      red.setCoords(model.nodes);
      const frR = red.rotate(fx.frames);
      applyDirichlet(red.K, red.fixed, red.value, red.f);
      const x0 = new Float64Array(red.K.n); for (let d = 0; d < x0.length; d++) if (red.fixed[d]) x0[d] = red.value[d];
      const r = solveSystem(red.K, red.f, x0, { prefer: input.solver ?? 'auto', tol, maxIter, cancel, coords: red.coords, mask: red.fixed, onIter: (i, rel) => report(0.45 + 0.4 * Math.min(1, Math.log(1 / Math.max(rel, tol)) / Math.log(1 / tol)), 'solve') });
      if (cancel?.()) return fail('cancelled', { model });
      rotateVector(r.x, frR, false);
      u.set(red.expand(r.x));
      return finishStatic({ input, model, fx, f, Kref, u, cc, unilateral: [], bonded: bonded0, lambda: new Float64Array(0), active: [], lamB: null, tau: null, tdir: [], slip: null, totalIt: r.it, alIt: 1, converged: r.converged, residual: r.rel ?? 0, solverMethod: r.method, report, fixtures, tied: red.tied });
    }
  }
  const bonded = bonded0;
  for (const c of bonded) addPenalty(K0, c);
  const lambda = new Float64Array(unilateral.length);
  let active = unilateral.map((c) => c.g0 <= 1e-9 * model.size);
  // Friction: the slip s (2 per node, lamT), the traction τ and the stick / slip state.
  const tdir = unilateral.map((c) => tangents(c.n)), lamT = new Float64Array(2 * unilateral.length), tau = new Float64Array(2 * unilateral.length), slip = new Uint8Array(unilateral.length);
  let totalIt = 0, alIt = 0, converged = true, residual = 0, solverMethod = 'pcg';
  // Bonded ties also use the augmented Lagrangian (a moderate penalty keeps the system well conditioned for the
  // multigrid; the multipliers make the tie exact).
  const maxAL = unilateral.length || bonded.length ? (input.maxContactIterations ?? 30) : 1;
  const lamB = new Float64Array(3 * bonded.length), cache = { M: null, factor: null };
  for (; alIt < maxAL; alIt++) {
    const K = unilateral.length || bonded.length ? cloneMatrix(K0) : K0;
    const b = Float64Array.from(f);
    bonded.forEach((c, i) => { for (let a = 0; a < 3; a++) if (lamB[3 * i + a]) addForce(b, c, [a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0], c.area * lamB[3 * i + a]); });
    unilateral.forEach((c, i) => {
      if (!active[i]) return;
      addPenalty(K, c);
      addForce(b, c, c.n, -c.area * (c.k * c.g0 - lambda[i]));
      if (c.mu > 0) for (let d = 0; d < 2; d++) {
        addPenalty(K, c, tdir[i][d]);
        addForce(b, c, tdir[i][d], c.area * c.k * lamT[2 * i + d]);
      }
    });
    // Rotated frames, then Dirichlet rows.
    rotateMatrix(K, fx.frames);
    rotateVector(b, fx.frames, true);
    const ul = rotateVector(Float64Array.from(u), fx.frames, true);
    applyDirichlet(K, fx.fixed, fx.value, b);
    for (let d = 0; d < ndof; d++) if (fx.fixed[d]) ul[d] = fx.value[d];
    const reuse = !unilateral.length && alIt > 0;
    const r = solveSystem(K, b, ul, { prefer: input.solver ?? 'auto', tol, maxIter, cancel, coords: model.nodes, mask: fx.fixed, M: reuse ? cache.M : null, factor: reuse ? cache.factor : null, onIter: (i, rel) => report(0.45 + 0.4 * Math.min(1, (alIt + Math.min(1, Math.log(1 / Math.max(rel, tol)) / Math.log(1 / tol))) / Math.max(1, Math.min(maxAL, 6))), 'solve') });
    totalIt += r.it; residual = r.rel ?? 0; solverMethod = r.method; cache.M = r.M; cache.factor = r.factor;
    if (!r.converged) converged = false;
    if (cancel?.()) return fail('cancelled', { model });
    u.set(rotateVector(ul, fx.frames, false));
    // Bonded multipliers: λ ← λ − k·gap; converged when the tie gaps are negligible against the element size.
    let bondGap = 0, bondScale = 1e-30;
    bonded.forEach((c, i) => { const g = vectorJump(c, u); for (let a = 0; a < 3; a++) { lamB[3 * i + a] -= c.k * g[a]; bondGap = Math.max(bondGap, Math.abs(g[a])); } });
    for (let i = 0; i < bonded.length; i++) bondScale = Math.max(bondScale, Math.abs(lamB[3 * i]), Math.abs(lamB[3 * i + 1]), Math.abs(lamB[3 * i + 2]));
    const bondDone = !bonded.length || bondGap * (bonded[0]?.k ?? 0) <= 2e-3 * bondScale;
    if (!unilateral.length) { if (bondDone) { alIt++; break; } continue; }
    // Multiplier update.
    let change = 0, scale = 1e-30, flips = 0;
    const next = unilateral.map((c, i) => {
      const g = c.g0 + jump(c, u), p = lambda[i] - c.k * g;
      const lam = Math.max(0, p);
      change = Math.max(change, Math.abs(lam - lambda[i])); scale = Math.max(scale, lam);
      if ((p > 0) !== active[i]) flips++;
      // Coulomb (return mapping on the tangential penalty): τ = −k(g_t − s); |τ| > μp → slip, s moves so |τ| = μp.
      let tr = [0, 0], sl = [lamT[2 * i], lamT[2 * i + 1]], st = 0;
      if (c.mu > 0 && p > 0) {
        const gt = [jump(c, u, tdir[i][0]), jump(c, u, tdir[i][1])];
        tr = [-c.k * (gt[0] - sl[0]), -c.k * (gt[1] - sl[1])];
        const tl = Math.hypot(tr[0], tr[1]), lim = c.mu * lam;
        if (tl > lim) { st = 1; tr = [tr[0] * lim / tl, tr[1] * lim / tl]; sl = [gt[0] + tr[0] / c.k, gt[1] + tr[1] / c.k]; }
        change = Math.max(change, Math.abs(tr[0] - tau[2 * i]), Math.abs(tr[1] - tau[2 * i + 1]));
        if (st !== slip[i]) flips++;
      }
      return { lam, act: p > 0, tr, sl, st };
    });
    next.forEach((x, i) => { lambda[i] = x.lam; active[i] = x.act; lamT[2 * i] = x.sl[0]; lamT[2 * i + 1] = x.sl[1]; tau[2 * i] = x.tr[0]; tau[2 * i + 1] = x.tr[1]; slip[i] = x.st; });
    // Converged when the multipliers settle; a few nodes at the contact edge may keep toggling — allow them after a while.
    if (bondDone && flips <= Math.floor(alIt / 12) && change <= (input.contactTol ?? 2e-3) * scale && alIt > 0) { alIt++; break; }
  }
  return finishStatic({ input, model, fx, f, Kref, u, cc, unilateral, bonded, lambda, active, lamB, tau, tdir, slip, totalIt, alIt, converged, residual, solverMethod, report, fixtures });
}

/** Reactions, contact results, stresses and surface fields of a solved static model. */
function finishStatic({ input, model, fx, f, Kref, u, cc, unilateral, bonded, lambda, active, lamB, tau, tdir, slip, totalIt, alIt, converged, residual, solverMethod, report, fixtures, tied = null }) {
  const ndof = 3 * model.nn;
  report(0.88, 'stress');

  // Reactions on the fixture faces (global frame): K u − f at the constrained nodes, grouped by fixture.
  const Ku = multiply(Kref, u, new Float64Array(ndof));
  const reactions = fixtures.map((fxx) => ({ faceId: typeof fxx === 'object' ? fxx.faceId : fxx, force: [0, 0, 0] }));
  for (let n = 0; n < model.nn; n++) {
    const o = fx.owner[n];
    if (o < 0) continue;
    for (let c = 0; c < 3; c++) reactions[o].force[c] += Ku[3 * n + c] - f[3 * n + c];
  }
  // Contact results.
  let contactForce = [0, 0, 0], frictionForce = [0, 0, 0], contactArea = 0, maxPen = 0, maxPressure = 0, slipping = 0, sticking = 0;
  const pressure = new Float64Array(cc.list.length), contactNodes = new Float64Array(model.nn);
  cc.list.forEach((c, i) => {
    if (c.type === 'bonded') {
      const g = vectorJump(c, u), j = bonded.indexOf(c), F = lamB ? g.map((x, a) => c.area * (lamB[3 * j + a] - c.k * x)) : [0, 0, 0];
      pressure[i] = Math.hypot(...F) / c.area;
    } else {
      const j = unilateral.indexOf(c), g = c.g0 + jump(c, u);
      pressure[i] = active[j] ? lambda[j] : 0;
      if (pressure[i] > 0) {
        contactArea += c.area; maxPressure = Math.max(maxPressure, pressure[i]);
        for (let a = 0; a < 3; a++) { contactForce[a] += pressure[i] * c.area * c.n[a]; frictionForce[a] += c.area * (tau[2 * j] * tdir[j][0][a] + tau[2 * j + 1] * tdir[j][1][a]); }
        if (c.mu > 0) { if (slip[j]) slipping++; else sticking++; }
      }
      maxPen = Math.max(maxPen, -g);
    }
    contactNodes[c.s] = Math.max(contactNodes[c.s], pressure[i]);
  });

  // Contact pressure as a field: the nodal contact forces are the consistent loads ∫N_a p dA of the pressure, so the
  // pressure is recovered by the L2 projection M p = f with the face mass M = ∫N_a N_b dA over the slave faces.
  // Mortar multipliers are already a nodal pressure field; node-to-surface forces are projected.
  const st = elasticStresses(model, u, thermalOffset(model, input.loads));
  // Contact pressure from the recovered stress at the contact nodes: p = −n·σ·n (smooth, the surface traction).
  const smooth = cc.list.some((c) => c.mortar) ? mortarPressure(cc.list, pressure) : tractionPressure(cc.list, pressure, st.nodal);
  if (smooth) maxPressure = smooth.max;
  const dmax = fieldMax(model, u, 3), smax = fieldMax(model, st.vm, 1);
  const yieldOf = (b) => model.bodies[b].material.yield;
  let minFos = Infinity;
  for (let n = 0; n < model.nn; n++) { const y = yieldOf(model.nodeBody[n]); if (y > 0 && st.vm[n] > 0) minFos = Math.min(minFos, y / st.vm[n]); }
  const perBody = model.bodies.map((p, b) => {
    const vd = surfaceField(model, u, 3, b), vs = surfaceField(model, st.vm, 1, b);
    let ms = 0; for (let n = p.nodeStart; n < p.nodeEnd; n++) ms = Math.max(ms, st.vm[n]);
    // The stress tensor at the surface points too (fatigue: signed and principal measures, biaxiality).
    return { name: p.name, vertexDisplacement: vd, vertexStress: vs, vertexTensor: surfaceField(model, st.nodal, 6, b), maxStress: ms, vertexContact: surfaceField(model, contactNodes, 1, b) };
  });
  report(1, 'done');
  return {
    ok: converged, error: converged ? null : 'not-converged', solver: 'tet', order: model.order,
    model, nodes: model.nodes, displacement: u, nodeStress: st.vm, stress: st.nodal, gaussStress: st.gauss,
    elements: model.ne, nodeCount: model.nn, elementSize: model.size, quality: model.quality,
    maxDisplacement: dmax.value, maxDisplacementAt: dmax.at, maxStress: smax.value, maxStressAt: smax.at,
    minFactorOfSafety: minFos, iterations: totalIt, residual, linearSolver: solverMethod,
    vertexDisplacement: perBody[0].vertexDisplacement, vertexStress: perBody[0].vertexStress, vertexTensor: perBody[0].vertexTensor, bodies: perBody,
    reactions, externalForce: sumForces(f), connectors: cc.conn ? connectorResults(cc.conn, u) : [], contact: { constraints: cc.list.length, pressure, nodalPressure: smooth?.nodal ?? null, force: contactForce, friction: frictionForce, slipping, sticking, area: contactArea, maxPressure, maxPenetration: maxPen, iterations: alIt, list: cc.list },
  };
}

/** −n·σ·n at the active contact nodes from the nodal stress (6 per node): { nodal, max }. */
function tractionPressure(list, pressure, S) {
  const nodal = new Map(); let max = 0;
  list.forEach((c, i) => {
    if (c.type !== 'contact' || !(pressure[i] > 0)) return;
    const o = 6 * c.s, n = c.n;
    const sn = S[o] * n[0] * n[0] + S[o + 1] * n[1] * n[1] + S[o + 2] * n[2] * n[2] + 2 * (S[o + 3] * n[0] * n[1] + S[o + 4] * n[1] * n[2] + S[o + 5] * n[2] * n[0]);
    const p = Math.max(0, -sn);
    nodal.set(c.s, p); max = Math.max(max, p);
  });
  return nodal.size ? { nodal, max } : null;
}

/** The mortar multipliers as { nodal: Map node → MPa, max }. */
function mortarPressure(list, pressure) {
  const nodal = new Map(); let max = 0;
  list.forEach((c, i) => { if (!c.mortar) return; const p = Math.max(0, pressure[i]); nodal.set(c.s, Math.max(nodal.get(c.s) ?? 0, p)); max = Math.max(max, p); });
  return { nodal, max };
}

/** L2-projected contact pressure on the slave faces: { nodal: Map node → MPa, max } or null. */
export function contactPressureField(model, list, pressure) {
  const force = new Map(), slaves = new Set();
  list.forEach((c, i) => { if (c.type !== 'contact' || !(pressure[i] > 0)) return; force.set(c.s, (force.get(c.s) ?? 0) + pressure[i] * c.area); slaves.add(c.s); });
  if (!force.size) return null;
  const allSlaves = new Set(list.map((c) => c.s)), npf = model.faces.npf;
  const faces = [];
  for (let q = 0; q < model.faces.nf; q++) { let all = true, any = false; for (let a = 0; a < npf; a++) { const n = model.faces.nodes[npf * q + a]; if (!allSlaves.has(n)) all = false; if (slaves.has(n)) any = true; } if (all && any) faces.push(q); }
  // Sparse M (map of maps) and CG with a Jacobi preconditioner.
  const M = new Map(), ids = new Map();
  integrateFaces(model, faces, (nid, N, A) => {
    const a0 = Math.hypot(A[0], A[1], A[2]);
    for (let p = 0; p < npf; p++) { let row = M.get(nid[p]); if (!row) M.set(nid[p], (row = new Map())); for (let q = 0; q < npf; q++) row.set(nid[q], (row.get(nid[q]) ?? 0) + N[p] * N[q] * a0); }
  });
  const nodes = [...M.keys()]; nodes.forEach((n, i) => ids.set(n, i));
  const n = nodes.length, b = new Float64Array(n), x = new Float64Array(n), dg = new Float64Array(n);
  nodes.forEach((nd, i) => { b[i] = force.get(nd) ?? 0; dg[i] = M.get(nd).get(nd); });
  const mul = (v, out) => { nodes.forEach((nd, i) => { let t = 0; for (const [m, w] of M.get(nd)) t += w * v[ids.get(m)]; out[i] = t; }); return out; };
  const r = Float64Array.from(b), z = r.map((v, i) => v / dg[i]), p = Float64Array.from(z), q = new Float64Array(n);
  let rz = r.reduce((t, v, i) => t + v * z[i], 0);
  const b0 = Math.sqrt(b.reduce((t, v) => t + v * v, 0)) || 1;
  for (let it = 0; it < 4 * n + 50; it++) {
    mul(p, q);
    const pq = p.reduce((t, v, i) => t + v * q[i], 0); if (!(pq > 0)) break;
    const al = rz / pq;
    for (let i = 0; i < n; i++) { x[i] += al * p[i]; r[i] -= al * q[i]; }
    if (Math.sqrt(r.reduce((t, v) => t + v * v, 0)) < 1e-10 * b0) break;
    for (let i = 0; i < n; i++) z[i] = r[i] / dg[i];
    const rz1 = r.reduce((t, v, i) => t + v * z[i], 0), be = rz1 / rz; rz = rz1;
    for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
  }
  const nodal = new Map(); let max = 0;
  nodes.forEach((nd, i) => { const v = Math.max(0, x[i]); nodal.set(nd, v); max = Math.max(max, v); });
  return { nodal, max };
}

/**
 * Exact elimination of bonded ties: slave nodes follow their master points (same weights for x, y, z). Slaves that are
 * fixed, or masters of other ties, are left out of the elimination (kept as independent nodes). Returns { K (CSR on the
 * retained nodes with its graph), f, fixed, coords, expand(uh) → u, tied } or null when nothing can be eliminated.
 */
function eliminateTies(K, f, ties, nn, fx) {
  const masterOf = new Map(), isMaster = new Set();
  for (const c of ties) for (const m of c.m) isMaster.add(m);
  for (const c of ties) {
    const s = c.s;
    if (masterOf.has(s) || isMaster.has(s) || fx.fixed[3 * s] || fx.fixed[3 * s + 1] || fx.fixed[3 * s + 2] || fx.frames.has(s)) continue;
    if (c.m.some((m) => masterOf.has(m))) continue;
    masterOf.set(s, c);
  }
  if (!masterOf.size) return null;
  const keep = new Int32Array(nn).fill(-1);
  let nr = 0;
  for (let n = 0; n < nn; n++) if (!masterOf.has(n)) keep[n] = nr++;
  // T (3nn × 3nr): identity on retained nodes, master weights on slaves.
  const ptr = new Int32Array(3 * nn + 1), cols = [], vals = [];
  for (let n = 0; n < nn; n++) for (let k = 0; k < 3; k++) {
    const c = masterOf.get(n);
    if (!c) { cols.push(3 * keep[n] + k); vals.push(1); }
    else { const items = c.m.map((m, q) => [3 * keep[m] + k, c.w[q]]).sort((a, b) => a[0] - b[0]); for (const [cc2, w] of items) if (w) { cols.push(cc2); vals.push(w); } }
    ptr[3 * n + k + 1] = cols.length;
  }
  const T = { n: 3 * nn, ptr, col: Int32Array.from(cols), val: Float64Array.from(vals) };
  const TT = transpose(T, 3 * nr);
  const Kr = matmul(TT, matmul({ n: K.n, ptr: K.ptr, col: K.col, val: K.val }, T, 3 * nr), 3 * nr);
  // Node graph of the reduced matrix (3×3 blocks), and the reduced matrix in the block-row layout the solvers use.
  const sets = Array.from({ length: nr }, () => new Set());
  for (let r = 0; r < Kr.n; r++) { const a = (r / 3) | 0; for (let p = Kr.ptr[r]; p < Kr.ptr[r + 1]; p++) sets[a].add((Kr.col[p] / 3) | 0); }
  const gptr = new Int32Array(nr + 1), lists = sets.map((s2, a) => { s2.add(a); const u2 = Int32Array.from(s2).sort(); gptr[a + 1] = u2.length; return u2; });
  for (let a = 0; a < nr; a++) gptr[a + 1] += gptr[a];
  const gidx = new Int32Array(gptr[nr]); lists.forEach((u2, a) => gidx.set(u2, gptr[a]));
  const g = { nn: nr, ptr: gptr, idx: gidx };
  const A = csrFromGraph(g, 3);
  for (let r = 0; r < Kr.n; r++) for (let p = Kr.ptr[r]; p < Kr.ptr[r + 1]; p++) addEntry(A, r, Kr.col[p], Kr.val[p]);
  const fr = new Float64Array(3 * nr);
  mvT(T, f, fr);
  const fixed = new Uint8Array(3 * nr), value = new Float64Array(3 * nr), coords = new Float64Array(3 * nr);
  for (let n = 0; n < nn; n++) { const q = keep[n]; if (q < 0) continue; for (let k = 0; k < 3; k++) { fixed[3 * q + k] = fx.fixed[3 * n + k]; value[3 * q + k] = fx.value[3 * n + k]; } }
  // Retained node coordinates (rigid-body modes for the multigrid).
  return {
    K: A, f: fr, fixed, value, coords, tied: masterOf.size,
    setCoords(nodes) { for (let n = 0; n < nn; n++) { const q = keep[n]; if (q >= 0) for (let k = 0; k < 3; k++) coords[3 * q + k] = nodes[3 * n + k]; } },
    expand(uh) { const out = new Float64Array(3 * nn); for (let r = 0; r < 3 * nn; r++) { let s2 = 0; for (let p = T.ptr[r]; p < T.ptr[r + 1]; p++) s2 += T.val[p] * uh[T.col[p]]; out[r] = s2; } return out; },
    rotate(frames) { const map = new Map(); for (const [n, R] of frames) if (keep[n] >= 0) map.set(keep[n], R); rotateMatrix(A, map); rotateVector(fr, map, true); return map; },
  };
}
const mvT = (T, x, y) => { y.fill(0); for (let r = 0; r < T.n; r++) for (let p = T.ptr[r]; p < T.ptr[r + 1]; p++) y[T.col[p]] += T.val[p] * x[r]; return y; };

function sumForces(f) {
  const s = [0, 0, 0];
  for (let i = 0; i < f.length; i += 3) { s[0] += f[i]; s[1] += f[i + 1]; s[2] += f[i + 2]; }
  return s;
}

/** Probe of a static result at a point: displacement, stress tensor, von Mises, principal stresses. */
export function probeStatic(result, p) {
  const m = result.model;
  const r = probe(m, p, { u: [result.displacement, 3], s: [result.stress, 6], vm: [result.nodeStress, 1] });
  if (r.element < 0) return null;
  return { point: p, inside: r.inside, displacement: r.values.u, stress: r.values.s, vonMises: r.values.vm };
}

/** von Mises (or another pick) along a line. */
export function staticLine(result, a, b, quantity = 'vonMises', samples = 41) {
  const m = result.model;
  const pick = {
    vonMises: (v) => v.vm, displacement: (v) => Math.hypot(...v.u), ux: (v) => v.u[0], uy: (v) => v.u[1], uz: (v) => v.u[2],
    sxx: (v) => v.s[0], syy: (v) => v.s[1], szz: (v) => v.s[2], sxy: (v) => v.s[3], syz: (v) => v.s[4], szx: (v) => v.s[5],
  }[quantity] ?? ((v) => v.vm);
  return linePlot(m, a, b, { u: [result.displacement, 3], s: [result.stress, 6], vm: [result.nodeStress, 1] }, pick, samples);
}

export { principalField };
