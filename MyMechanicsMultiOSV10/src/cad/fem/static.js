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

import { buildModel, fixtureData, rotateMatrix, rotateVector, addSprings, loadVector, elasticStresses, surfaceField, fieldMax, modelGraph, stiffnessMatrix, selectFaces, nodalAreas, probe, linePlot, principalField } from './model.js';
import { faceShape } from './elements.js';
import { applyDirichlet, multiply, solveSystem, cloneMatrix, addEntry } from './sparse.js';

const fail = (error, extra = {}) => ({
  ok: false, error, nodes: new Float64Array(0), displacement: new Float64Array(0), nodeStress: new Float64Array(0), elements: 0, elementSize: 0,
  maxDisplacement: 0, maxDisplacementAt: [0, 0, 0], maxStress: 0, maxStressAt: [0, 0, 0], minFactorOfSafety: Infinity, iterations: 0,
  vertexDisplacement: new Float32Array(0), vertexStress: new Float32Array(0), ...extra,
});

// ───────────────────────── contact pairing

/** Boundary faces of one body (optionally of chosen CAD faces), with a bounding-box hash. */
function faceIndex(model, body, faceIds = null) {
  const npf = model.faces.npf, list = [];
  const set = faceIds ? new Set(faceIds) : null;
  for (let f = 0; f < model.faces.nf; f++) if (model.faces.body[f] === body && (!set || set.has(model.faces.faceId[f]))) list.push(f);
  const cell = Math.max(1e-6, model.bodies[body].mesh.size);
  const buckets = new Map(), key = (i, j, k) => `${i},${j},${k}`;
  for (const f of list) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let a = 0; a < 3; a++) { const p = 3 * model.faces.nodes[npf * f + a]; for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], model.nodes[p + c]); hi[c] = Math.max(hi[c], model.nodes[p + c]); } }
    for (let i = Math.floor(lo[0] / cell); i <= Math.floor(hi[0] / cell); i++) for (let j = Math.floor(lo[1] / cell); j <= Math.floor(hi[1] / cell); j++) for (let k = Math.floor(lo[2] / cell); k <= Math.floor(hi[2] / cell); k++) {
      const kk = key(i, j, k); let b = buckets.get(kk); if (!b) buckets.set(kk, (b = [])); b.push(f);
    }
  }
  return { list, cell, near(p, r) {
    const out = new Set(), n = Math.ceil(r / cell);
    const ci = Math.floor(p[0] / cell), cj = Math.floor(p[1] / cell), ck = Math.floor(p[2] / cell);
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (let k = ck - n; k <= ck + n; k++) for (const f of buckets.get(key(i, j, k)) ?? []) out.add(f);
    return out;
  } };
}

/** Projection of p onto the straight (corner) triangle of face f: { d, l (area coords), point, normal }. */
function projectOnFace(model, f, p) {
  const npf = model.faces.npf, P = (a) => { const q = 3 * model.faces.nodes[npf * f + a]; return [model.nodes[q], model.nodes[q + 1], model.nodes[q + 2]]; };
  const A = P(0), B = P(1), C = P(2);
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], w = [p[0] - A[0], p[1] - A[1], p[2] - A[2]];
  const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], uv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2], wv = w[0] * v[0] + w[1] * v[1] + w[2] * v[2], den = uu * vv - uv * uv;
  let s = (vv * wu - uv * wv) / den, t = (uu * wv - uv * wu) / den;
  // Clamp into the triangle.
  if (s < 0) s = 0; if (t < 0) t = 0; if (s + t > 1) { const k = s + t; s /= k; t /= k; }
  const q = [A[0] + s * u[0] + t * v[0], A[1] + s * u[1] + t * v[1], A[2] + s * u[2] + t * v[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], nl = Math.hypot(...n) || 1;
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), l: [1 - s - t, s, t], point: q, normal: n.map((x) => x / nl) };
}

/**
 * Contact constraints: [{ type, s (slave node), m (master nodes), w (weights), n (master outward normal), g0, area, k }].
 * Plus `pairs` (node pairs for the matrix pattern).
 */
export function contactConstraints(model, { contacts = 'none', walls = [], tolerance = null } = {}) {
  const list = [], pairs = [];
  const bodyCount = model.bodies.length;
  let specs = [];
  if (Array.isArray(contacts)) specs = contacts.filter((c) => c && c.type !== 'none');
  else if (contacts && contacts !== 'none') for (let a = 0; a < bodyCount; a++) for (let b = a + 1; b < bodyCount; b++) specs.push({ a, b, type: contacts });
  for (const sp of specs) {
    let A = sp.a, B = sp.b, facesA = sp.facesA ?? null, facesB = sp.facesB ?? null;
    // The finer body is the slave.
    if (model.bodies[A].mesh.size > model.bodies[B].mesh.size * 1.0001) { [A, B] = [B, A]; [facesA, facesB] = [facesB, facesA]; }
    const hA = model.bodies[A].mesh.size, hB = model.bodies[B].mesh.size, tol = tolerance ?? 0.35 * Math.min(hA, hB);
    const master = faceIndex(model, B, facesB);
    const slaveFaces = faceIndex(model, A, facesA).list;
    const { area } = nodalAreas(model, slaveFaces);
    const E = Math.max(model.bodies[A].material.E, model.bodies[B].material.E);
    const k = (sp.type === 'bonded' ? 300 : 30) * E / Math.min(hA, hB);
    for (const [s, aS] of area) {
      const p = [model.nodes[3 * s], model.nodes[3 * s + 1], model.nodes[3 * s + 2]];
      let best = null;
      for (const f of master.near(p, tol)) { const r = projectOnFace(model, f, p); if (r.d <= tol && (!best || r.d < best.r.d)) best = { f, r }; }
      if (!best) continue;
      const npf = model.faces.npf, m = [], w = [];
      const N = faceShape(model.order, best.r.l);
      for (let a = 0; a < npf; a++) { m.push(model.faces.nodes[npf * best.f + a]); w.push(N[a]); }
      const g0 = (p[0] - best.r.point[0]) * best.r.normal[0] + (p[1] - best.r.point[1]) * best.r.normal[1] + (p[2] - best.r.point[2]) * best.r.normal[2];
      list.push({ type: sp.type === 'bonded' ? 'bonded' : 'contact', s, m, w, n: best.r.normal, g0: sp.type === 'bonded' ? 0 : g0, area: aS, k, pair: [A, B] });
      for (const mm of m) pairs.push(s, mm);
    }
  }
  for (const wall of walls ?? []) {
    const nl = Math.hypot(...wall.normal) || 1, n = wall.normal.map((x) => x / nl);
    const bodies = wall.body != null ? [wall.body] : model.bodies.map((_, b) => b);
    for (const b of bodies) {
      const faces = wall.faceIds ? selectFaces(model, wall.faceIds.map((faceId) => ({ body: b, faceId }))) : faceIndex(model, b).list;
      const { area } = nodalAreas(model, faces);
      const h = model.bodies[b].mesh.size, k = 30 * model.bodies[b].material.E / h, reach = wall.reach ?? 0.25 * h;
      for (const [s, aS] of area) {
        const g0 = (model.nodes[3 * s] - wall.point[0]) * n[0] + (model.nodes[3 * s + 1] - wall.point[1]) * n[1] + (model.nodes[3 * s + 2] - wall.point[2]) * n[2];
        if (g0 > reach) continue;
        list.push({ type: 'contact', s, m: [], w: [], n, g0, area: aS, k, wall: true });
      }
    }
  }
  return { list, pairs: pairs.length ? Int32Array.from(pairs) : null };
}

/** Adds a constraint's penalty k·A·c cᵀ (c = n ⊗ [1, −w]; bonded: each of the 3 directions). */
function addPenalty(K, c) {
  const ids = [c.s, ...c.m], coef = [1, ...c.w.map((x) => -x)], kA = c.k * c.area;
  if (c.type === 'bonded') {
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) { const v = kA * coef[i] * coef[j]; if (v) for (let d = 0; d < 3; d++) addEntry(K, 3 * ids[i] + d, 3 * ids[j] + d, v); }
    return;
  }
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
    const v = kA * coef[i] * coef[j];
    if (!v) continue;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { const x = v * c.n[a] * c.n[b]; if (x) addEntry(K, 3 * ids[i] + a, 3 * ids[j] + b, x); }
  }
}

/** n·(u_s − Σ w u_m). */
const normalJump = (c, u) => {
  let x = u[3 * c.s] * c.n[0] + u[3 * c.s + 1] * c.n[1] + u[3 * c.s + 2] * c.n[2];
  for (let i = 0; i < c.m.length; i++) { const d = 3 * c.m[i]; x -= c.w[i] * (u[d] * c.n[0] + u[d + 1] * c.n[1] + u[d + 2] * c.n[2]); }
  return x;
};
const vectorJump = (c, u) => {
  const g = [u[3 * c.s], u[3 * c.s + 1], u[3 * c.s + 2]];
  for (let i = 0; i < c.m.length; i++) for (let d = 0; d < 3; d++) g[d] -= c.w[i] * u[3 * c.m[i] + d];
  return g;
};

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
  if (!(fn > 0) && !anyPrescribed) return fail('no-loads', { model });
  report(0.32, 'assemble');

  const cc = contactConstraints(model, { contacts, walls, tolerance });
  const graph = cc.pairs ? modelGraph(model, cc.pairs) : modelGraph(model);
  const K0 = stiffnessMatrix(model, graph, (x) => report(0.32 + 0.1 * x, 'assemble'));
  addSprings(model, K0, fx.springs);
  const Kref = cloneMatrix(K0);                  // for reactions
  const bonded = cc.list.filter((c) => c.type === 'bonded'), unilateral = cc.list.filter((c) => c.type === 'contact');
  for (const c of bonded) addPenalty(K0, c);
  report(0.45, 'solve');

  const ndof = 3 * model.nn, u = new Float64Array(ndof);
  const lambda = new Float64Array(unilateral.length);
  let active = unilateral.map((c) => c.g0 <= 1e-9 * model.size);
  let totalIt = 0, alIt = 0, converged = true, residual = 0, solverMethod = 'pcg';
  const maxAL = unilateral.length ? 40 : 1;
  for (; alIt < maxAL; alIt++) {
    const K = unilateral.length ? cloneMatrix(K0) : K0;
    const b = Float64Array.from(f);
    unilateral.forEach((c, i) => {
      if (!active[i]) return;
      addPenalty(K, c);
      const s = c.area * (c.k * c.g0 - lambda[i]);
      const ids = [c.s, ...c.m], coef = [1, ...c.w.map((x) => -x)];
      for (let q = 0; q < ids.length; q++) for (let a = 0; a < 3; a++) b[3 * ids[q] + a] -= s * coef[q] * c.n[a];
    });
    // Rotated frames, then Dirichlet rows.
    rotateMatrix(K, fx.frames);
    rotateVector(b, fx.frames, true);
    const ul = rotateVector(Float64Array.from(u), fx.frames, true);
    applyDirichlet(K, fx.fixed, fx.value, b);
    for (let d = 0; d < ndof; d++) if (fx.fixed[d]) ul[d] = fx.value[d];
    const r = solveSystem(K, b, ul, { prefer: input.solver ?? 'auto', tol, maxIter, cancel, onIter: (i, rel) => report(0.45 + 0.4 * Math.min(1, (alIt + Math.min(1, Math.log(1 / Math.max(rel, tol)) / Math.log(1 / tol))) / Math.max(1, Math.min(maxAL, 6))), 'solve') });
    totalIt += r.it; residual = r.rel ?? 0; solverMethod = r.method;
    if (!r.converged) converged = false;
    if (cancel?.()) return fail('cancelled', { model });
    u.set(rotateVector(ul, fx.frames, false));
    if (!unilateral.length) break;
    // Multiplier update.
    let change = 0, scale = 1e-30, flips = 0;
    const next = unilateral.map((c, i) => {
      const g = c.g0 + normalJump(c, u), p = lambda[i] - c.k * g;
      const lam = Math.max(0, p);
      change = Math.max(change, Math.abs(lam - lambda[i])); scale = Math.max(scale, lam);
      if ((p > 0) !== active[i]) flips++;
      return { lam, act: p > 0 };
    });
    next.forEach((x, i) => { lambda[i] = x.lam; active[i] = x.act; });
    if (!flips && change <= 1e-4 * scale && alIt > 0) { alIt++; break; }
  }
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
  let contactForce = [0, 0, 0], contactArea = 0, maxPen = 0, maxPressure = 0;
  const pressure = new Float64Array(cc.list.length), contactNodes = new Float64Array(model.nn);
  cc.list.forEach((c, i) => {
    if (c.type === 'bonded') {
      const g = vectorJump(c, u), F = g.map((x) => c.k * c.area * x);
      pressure[i] = Math.hypot(...F) / c.area;
    } else {
      const j = unilateral.indexOf(c), g = c.g0 + normalJump(c, u);
      pressure[i] = active[j] ? lambda[j] : 0;
      if (pressure[i] > 0) { contactArea += c.area; for (let a = 0; a < 3; a++) contactForce[a] += pressure[i] * c.area * c.n[a]; maxPressure = Math.max(maxPressure, pressure[i]); }
      maxPen = Math.max(maxPen, -g);
    }
    contactNodes[c.s] = Math.max(contactNodes[c.s], pressure[i]);
  });

  const st = elasticStresses(model, u);
  const dmax = fieldMax(model, u, 3), smax = fieldMax(model, st.vm, 1);
  const yieldOf = (b) => model.bodies[b].material.yield;
  let minFos = Infinity;
  for (let n = 0; n < model.nn; n++) { const y = yieldOf(model.nodeBody[n]); if (y > 0 && st.vm[n] > 0) minFos = Math.min(minFos, y / st.vm[n]); }
  const perBody = model.bodies.map((p, b) => {
    const vd = surfaceField(model, u, 3, b), vs = surfaceField(model, st.vm, 1, b);
    let ms = 0; for (let n = p.nodeStart; n < p.nodeEnd; n++) ms = Math.max(ms, st.vm[n]);
    return { name: p.name, vertexDisplacement: vd, vertexStress: vs, maxStress: ms, vertexContact: surfaceField(model, contactNodes, 1, b) };
  });
  report(1, 'done');
  return {
    ok: converged, error: converged ? null : 'not-converged', solver: 'tet', order: model.order,
    model, nodes: model.nodes, displacement: u, nodeStress: st.vm, stress: st.nodal, gaussStress: st.gauss,
    elements: model.ne, nodeCount: model.nn, elementSize: model.size, quality: model.quality,
    maxDisplacement: dmax.value, maxDisplacementAt: dmax.at, maxStress: smax.value, maxStressAt: smax.at,
    minFactorOfSafety: minFos, iterations: totalIt, residual, linearSolver: solverMethod,
    vertexDisplacement: perBody[0].vertexDisplacement, vertexStress: perBody[0].vertexStress, bodies: perBody,
    reactions, externalForce: sumForces(f), contact: { constraints: cc.list.length, pressure, force: contactForce, area: contactArea, maxPressure, maxPenetration: maxPen, iterations: alIt, list: cc.list },
  };
}

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
