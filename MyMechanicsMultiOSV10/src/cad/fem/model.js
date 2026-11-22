// The finite-element model shared by the studies: one or more bodies (a part, or the components of an
// assembly), each meshed with tetrahedra (mesh.js) and carrying its material; global node / element numbering;
// face selections; boundary conditions (fixed, roller / symmetry, prescribed displacement, elastic support);
// loads (force, pressure, torque, gravity); assembly of stiffness / mass; stress recovery and result fields
// on the CAD surface; probes and line plots.
//
// Units: mm, N, MPa (N/mm²), tonne/mm³ for mass (density kg/m³ × 1e-12), s.
// A face reference is a CAD face id (body 0 or every body when ambiguous) or { body, faceId }.

import { tetMesh, interpolateField, elementLocator } from './mesh.js';
import {
  nodesPerElement, ruleOf, ruleDerivatives, gradients, shapeValues, elasticStiffness, lame, elasticityMatrix,
  integrateFace, gaussToCorners, vonMises, principal, TET_EDGES, edgeNode, faceShape, tetVolume,
} from './elements.js';
import { nodeGraph, csrFromGraph, assemble, graphPos } from './sparse.js';

const meshCache = new WeakMap();

/** Meshes a surface (cached per surface object and options). */
export function meshSurface(surface, opts = {}) {
  const key = JSON.stringify({ size: opts.size ?? null, resolution: opts.resolution ?? 16, order: opts.order ?? 2, refine: opts.refine ?? [], grading: opts.grading ?? 0.4, curved: opts.curved ?? true, features: opts.features ?? true });
  let m = meshCache.get(surface);
  if (!m) meshCache.set(surface, (m = new Map()));
  if (m.has(key)) return m.get(key);
  const out = tetMesh(surface, opts);
  if (m.size > 6) m.clear();
  m.set(key, out);
  return out;
}

/** Material in solver units: { E MPa, nu, density kg/m³, yield MPa, ... } → adds rho (t/mm³), lambda, mu. */
export function solverMaterial(mat = {}) {
  const E = Number(mat.E) || 210000, nu = Math.min(0.499, Math.max(0, Number(mat.nu ?? 0.3)));
  return { ...mat, E, nu, rho: (Number(mat.density) || 7850) * 1e-12, ...lame(E, nu) };
}

/**
 * Builds the model of bodies [{ mesh: surface, material, meshOptions? }] with common mesh options
 * { size, resolution, order, refine (per body: [{ faceIds, size }]) }. Returns the model or { ok: false, error }.
 */
export function buildModel(bodies, meshOptions = {}, onProgress = null) {
  const parts = [];
  let nn = 0, ne = 0, nf = 0, order = meshOptions.order ?? 2;
  for (let b = 0; b < bodies.length; b++) {
    const body = bodies[b];
    const opts = { ...meshOptions, ...(body.meshOptions ?? {}), order, onProgress: onProgress && ((f) => onProgress((b + f) / bodies.length)) };
    // Local feature size: a body thinner than the element size gets elements of its own size (at least 2.5 through
    // its thinnest extent), so small components keep their faces at coarse global sizes.
    if (meshOptions.featureSize !== false && bodies.length > 1 && !(body.meshOptions?.size > 0)) {
      const V = body.mesh.vertices, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k]); }
      const ext = [0, 1, 2].map((k) => hi[k] - lo[k]), minExt = Math.min(...ext), maxExt = Math.max(...ext);
      const global = opts.size > 0 ? opts.size : maxExt / Math.max(2, opts.resolution ?? 16);
      opts.size = Math.min(global, Math.max(minExt / 2.5, maxExt / 40));
    }
    if (Array.isArray(meshOptions.refine) && meshOptions.refine.some((r) => r.body != null)) opts.refine = meshOptions.refine.filter((r) => (r.body ?? 0) === b);
    const m = meshSurface(body.mesh, opts);
    if (!m.ok) return { ok: false, error: m.error, body: b };
    parts.push({ mesh: m, material: solverMaterial(body.material), nodeStart: nn, elemStart: ne, faceStart: nf, surface: body.mesh, name: body.name ?? `Body ${b + 1}`, placement: body.placement ?? null });
    nn += m.nn; ne += m.ne; nf += m.faces.nf;
  }
  const npe = nodesPerElement(order), npf = order === 2 ? 6 : 3;
  const nodes = new Float64Array(3 * nn), elements = new Int32Array(npe * ne), elemBody = new Uint16Array(ne);
  const fNodes = new Int32Array(npf * nf), fId = new Int32Array(nf), fBody = new Uint16Array(nf), fElem = new Int32Array(nf), fLocal = new Uint8Array(nf);
  const surfaceNodes = new Uint8Array(nn), nodeBody = new Uint16Array(nn);
  parts.forEach((p, b) => {
    const m = p.mesh;
    nodes.set(m.nodes, 3 * p.nodeStart);
    surfaceNodes.set(m.surfaceNodes, p.nodeStart);
    nodeBody.fill(b, p.nodeStart, p.nodeStart + m.nn);
    for (let q = 0; q < m.elements.length; q++) elements[npe * p.elemStart + q] = m.elements[q] + p.nodeStart;
    elemBody.fill(b, p.elemStart, p.elemStart + m.ne);
    for (let q = 0; q < m.faces.nodes.length; q++) fNodes[npf * p.faceStart + q] = m.faces.nodes[q] + p.nodeStart;
    for (let f = 0; f < m.faces.nf; f++) { fId[p.faceStart + f] = m.faces.faceId[f]; fBody[p.faceStart + f] = b; fElem[p.faceStart + f] = m.faces.elem[f] + p.elemStart; fLocal[p.faceStart + f] = m.faces.local[f]; }
    p.nodeEnd = p.nodeStart + m.nn; p.elemEnd = p.elemStart + m.ne;
  });
  let size = 0, qmin = Infinity, qmean = 0, dmin = 180, poor = 0;
  for (const p of parts) { size = Math.max(size, p.mesh.size); qmin = Math.min(qmin, p.mesh.quality.min); qmean += p.mesh.quality.mean * p.mesh.ne; dmin = Math.min(dmin, p.mesh.quality.minDihedral); poor += p.mesh.quality.poor; }
  return {
    ok: true, order, npe, npf, nn, ne, nodes, elements, elemBody, nodeBody, surfaceNodes, bodies: parts,
    faces: { nodes: fNodes, faceId: fId, body: fBody, elem: fElem, local: fLocal, nf, npf },
    size, quality: { min: qmin, mean: qmean / Math.max(1, ne), minDihedral: dmin, poor },
    volume: parts.reduce((s, p) => s + p.mesh.volume, 0),
  };
}

// ───────────────────────── selections

/** Face indices of a reference (or a list of them). */
export function selectFaces(model, refs) {
  const list = Array.isArray(refs) ? refs : [refs];
  const out = [];
  for (const r of list) {
    const body = typeof r === 'object' && r ? r.body ?? null : null, id = typeof r === 'object' && r ? r.faceId : r;
    for (let f = 0; f < model.faces.nf; f++) if (model.faces.faceId[f] === id && (body == null || model.faces.body[f] === body)) out.push(f);
  }
  return out;
}

/** Shortest corner edge at each node (mid-edge nodes: their edge), cached. */
export function localSize(model) {
  if (model._local) return model._local;
  const out = new Float64Array(model.nn).fill(Infinity), npe = model.npe, X = model.nodes;
  for (let e = 0; e < model.ne; e++) TET_EDGES.forEach(([i, j], k) => {
    const a = model.elements[npe * e + i], b = model.elements[npe * e + j];
    const l = Math.hypot(X[3 * a] - X[3 * b], X[3 * a + 1] - X[3 * b + 1], X[3 * a + 2] - X[3 * b + 2]);
    if (l < out[a]) out[a] = l; if (l < out[b]) out[b] = l;
    if (npe === 10) { const m = model.elements[npe * e + 4 + k]; if (l < out[m]) out[m] = l; }
  });
  model._local = out;
  return out;
}

/**
 * Nodes of the faces that lie on the CAD faces themselves (within 0.1 × the local element size): a boundary facet
 * spanning a sharp edge may be tagged with the face but its far node belongs to the neighbouring face.
 */
export function onFaceNodes(model, faces) {
  const tagged = faceNodeSet(model, faces), out = new Set(), loc = localSize(model);
  // Candidates: the tagged facets' nodes and those of every facet touching them (a node of the face may sit only on
  // a facet tagged with the neighbouring face, e.g. the mid-edge node of an edge in the face at a sharp corner).
  if (!model._nodeFacets) {
    const nf = model.faces.nf, npf = model.faces.npf, m = new Map();
    for (let q = 0; q < nf; q++) for (let a = 0; a < npf; a++) { const n = model.faces.nodes[npf * q + a]; let l = m.get(n); if (!l) m.set(n, (l = [])); l.push(q); }
    model._nodeFacets = m;
  }
  const all = new Set(tagged);
  for (const n of tagged) for (const q of model._nodeFacets.get(n) ?? []) for (let a = 0; a < model.faces.npf; a++) all.add(model.faces.nodes[model.faces.npf * q + a]);
  const ids = new Map();
  for (const f of faces) { const b = model.faces.body[f]; let s = ids.get(b); if (!s) ids.set(b, (s = new Set())); s.add(model.faces.faceId[f]); }
  for (const n of all) {
    const b = model.nodeBody[n], S = model.bodies[b].mesh.surfaceModel, set = ids.get(b);
    if (!S || !set) { out.add(n); continue; }
    const tol = 0.1 * loc[n];
    const hit = S.closest(model.nodes[3 * n], model.nodes[3 * n + 1], model.nodes[3 * n + 2], Math.max(tol, 1e-9), (fid) => set.has(fid));
    if (hit) out.add(n);
  }
  return out.size ? out : tagged;
}

/** Nodes of the faces. */
export function faceNodeSet(model, faces) {
  const s = new Set(), npf = model.faces.npf;
  for (const f of faces) for (let a = 0; a < npf; a++) s.add(model.faces.nodes[npf * f + a]);
  return s;
}

const faceX = (model, f, X) => { const npf = model.faces.npf; for (let a = 0; a < npf; a++) { const p = 3 * model.faces.nodes[npf * f + a]; X[3 * a] = model.nodes[p]; X[3 * a + 1] = model.nodes[p + 1]; X[3 * a + 2] = model.nodes[p + 2]; } return X; };

/** Integrates over faces: visit(nodeIds, N, areaVector, x) per Gauss point (x = the point). */
export function integrateFaces(model, faces, visit, rule = undefined) {
  const npf = model.faces.npf, order = model.order, X = new Float64Array(3 * npf), ids = new Int32Array(npf), x = [0, 0, 0];
  for (const f of faces) {
    faceX(model, f, X);
    for (let a = 0; a < npf; a++) ids[a] = model.faces.nodes[npf * f + a];
    integrateFace(order, X, (N, A) => {
      x[0] = x[1] = x[2] = 0;
      for (let a = 0; a < npf; a++) { x[0] += N[a] * X[3 * a]; x[1] += N[a] * X[3 * a + 1]; x[2] += N[a] * X[3 * a + 2]; }
      visit(ids, N, A, x);
    }, rule);
  }
}

/** Area, centroid and area-weighted mean normal of faces. */
export function faceStats(model, faces) {
  let A = 0; const c = [0, 0, 0], nrm = [0, 0, 0];
  integrateFaces(model, faces, (ids, N, Av, x) => { const a = Math.hypot(Av[0], Av[1], Av[2]); A += a; for (let k = 0; k < 3; k++) { c[k] += a * x[k]; nrm[k] += Av[k]; } });
  const nl = Math.hypot(...nrm) || 1;
  return { area: A, centroid: c.map((v) => v / (A || 1)), normal: nrm.map((v) => v / nl), flatness: nl / (A || 1) };
}

/** Area-weighted normal and flatness of the CAD faces themselves (the surface triangles), or null. */
export function cadFaceStats(model, faces) {
  const n = [0, 0, 0]; let A = 0;
  const seen = new Set();
  for (const f of faces) {
    const b = model.faces.body[f], id = model.faces.faceId[f], key = b + ':' + id;
    if (seen.has(key)) continue;
    seen.add(key);
    const S = model.bodies[b].mesh.surfaceModel;
    if (!S) return null;
    for (let t = 0; t < S.nt; t++) {
      if (S.faceOf[t] !== id) continue;
      const a = 3 * S.T[3 * t], c = 3 * S.T[3 * t + 1], d = 3 * S.T[3 * t + 2];
      const ux = S.V[c] - S.V[a], uy = S.V[c + 1] - S.V[a + 1], uz = S.V[c + 2] - S.V[a + 2], vx = S.V[d] - S.V[a], vy = S.V[d + 1] - S.V[a + 1], vz = S.V[d + 2] - S.V[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[0] += nx / 2; n[1] += ny / 2; n[2] += nz / 2; A += Math.hypot(nx, ny, nz) / 2;
    }
  }
  if (!(A > 0)) return null;
  const l = Math.hypot(...n);
  return { area: A, normal: n.map((v) => v / l), flatness: l / A };
}

/** Nodal "lumped" areas of faces (each face's area split equally between its nodes) and area-weighted normals. */
export function nodalAreas(model, faces) {
  const npf = model.faces.npf, area = new Map(), normal = new Map(), X = new Float64Array(3 * npf);
  for (const f of faces) {
    faceX(model, f, X);
    const nv = [0, 0, 0]; let a = 0;
    integrateFace(model.order, X, (N, Av) => { a += Math.hypot(Av[0], Av[1], Av[2]); nv[0] += Av[0]; nv[1] += Av[1]; nv[2] += Av[2]; });
    for (let q = 0; q < npf; q++) {
      const id = model.faces.nodes[npf * f + q];
      // Corners get less than mid-edge nodes on a T6 (1/12 vs 1/4 of the area would follow ∫N for curvature-free
      // faces with lumping; an equal split keeps every node in contact searches).
      area.set(id, (area.get(id) ?? 0) + a / npf);
      const n = normal.get(id) ?? [0, 0, 0];
      n[0] += nv[0]; n[1] += nv[1]; n[2] += nv[2];
      normal.set(id, n);
    }
  }
  for (const [id, n] of normal) { const l = Math.hypot(...n) || 1; normal.set(id, n.map((v) => v / l)); }
  return { area, normal };
}

// ───────────────────────── element loops

/** Element node coordinates into X (3·npe). */
export function elementX(model, e, X, pos = model.nodes) {
  const npe = model.npe;
  for (let a = 0; a < npe; a++) { const p = 3 * model.elements[npe * e + a]; X[3 * a] = pos[p]; X[3 * a + 1] = pos[p + 1]; X[3 * a + 2] = pos[p + 2]; }
  return X;
}

/** Node graph of the model (+ extra node pairs, e.g. contact couplings), cached when no extras. */
export function modelGraph(model, extraPairs = null) {
  if (!extraPairs && model._graph) return model._graph;
  const g = nodeGraph(model.nn, model.elements, model.npe, extraPairs);
  if (!extraPairs) model._graph = g;
  return g;
}

/** Linear elastic stiffness (CSR, 3 dofs per node) of the whole model. */
export function stiffnessMatrix(model, graph = modelGraph(model), onProgress = null) {
  const K = csrFromGraph(graph, 3), npe = model.npe, m = 3 * npe;
  const Ke = new Float64Array(m * m), X = new Float64Array(3 * npe), dNs = ruleDerivatives(model.order, ruleOf(model.order)), G = new Float64Array(3 * npe);
  const ids = new Int32Array(npe);
  for (let e = 0; e < model.ne; e++) {
    const mat = model.bodies[model.elemBody[e]].material;
    elementX(model, e, X);
    elasticStiffness(model.order, X, mat.lambda, mat.mu, Ke, dNs, G);
    for (let a = 0; a < npe; a++) ids[a] = model.elements[npe * e + a];
    assemble(K, ids, npe, Ke);
    if (onProgress && e % 2000 === 0) onProgress(e / model.ne);
  }
  return K;
}

/** Lumped (HRZ) nodal masses (t) of the model, by Gauss integration of ρ N_a² scaled to the element mass. */
export function lumpedMass(model) {
  const npe = model.npe, rule = ruleOf(model.order), dNs = ruleDerivatives(model.order, rule), X = new Float64Array(3 * npe), G = new Float64Array(3 * npe);
  const N = new Float64Array(npe), m = new Float64Array(model.nn), diag = new Float64Array(npe);
  // Quadratic elements: the diagonal of the exact consistent mass (straight-element shares), scaled to ρV.
  const shares = LUMPED_SHARE[model.order === 2 ? 2 : 1];
  for (let e = 0; e < model.ne; e++) {
    const rho = model.bodies[model.elemBody[e]].material.rho;
    elementX(model, e, X);
    let V = 0;
    for (let g = 0; g < rule.weights.length; g++) V += rule.weights[g] * gradients(npe, X, dNs[g], G);
    for (let a = 0; a < npe; a++) m[model.elements[npe * e + a]] += rho * V * shares[a];
  }
  void N; void diag; void shapeValues;
  return m;
}

/** Consistent mass matrix (CSR, 3 dofs per node). */
export function massMatrix(model, graph = modelGraph(model)) {
  const M = csrFromGraph(graph, 3), npe = model.npe, m = 3 * npe;
  const Me = new Float64Array(m * m), X = new Float64Array(3 * npe), ids = new Int32Array(npe);
  // Exact for straight elements: ∫N_a N_b dV = V·C_ab.
  const C = massCoefficients(model.order), rule = ruleOf(model.order), dNs = ruleDerivatives(model.order, rule), G = new Float64Array(3 * npe);
  for (let e = 0; e < model.ne; e++) {
    const rho = model.bodies[model.elemBody[e]].material.rho;
    elementX(model, e, X);
    let V = 0;
    for (let g = 0; g < rule.weights.length; g++) V += rule.weights[g] * gradients(npe, X, dNs[g], G);
    Me.fill(0);
    for (let a = 0; a < npe; a++) for (let b = 0; b < npe; b++) { const v = rho * V * C[a * npe + b]; for (let k = 0; k < 3; k++) Me[(3 * a + k) * m + 3 * b + k] = v; }
    for (let a = 0; a < npe; a++) ids[a] = model.elements[npe * e + a];
    assemble(M, ids, npe, Me);
  }
  return M;
}

import { MASS_COEF, LUMPED_SHARE } from './elements.js';
const massCoefficients = (order) => MASS_COEF[order === 2 ? 2 : 1];

// ───────────────────────── boundary conditions

const normFixture = (f) => (typeof f === 'object' && f && !Array.isArray(f) ? { type: 'fixed', ...f } : { type: 'fixed', faceId: f });

/**
 * Dirichlet data of fixtures: { fixed (Uint8 per dof, in the rotated frames), value, frames (Map node → 3×3 rows
 * = local axes), springs [{ faces, k }] }. Fixture kinds:
 *   fixed         all three components 0
 *   roller        the normal component 0 (planar or curved faces: per-node normal frames) — also symmetry planes
 *   displacement  value [ux, uy, uz] with null for a free component (global axes)
 *   elastic       a distributed spring k (N/mm³) on the face (stiffness only)
 */
export function fixtureData(model, fixtures) {
  const ndof = 3 * model.nn, fixed = new Uint8Array(ndof), value = new Float64Array(ndof), frames = new Map(), springs = [];
  let count = 0;
  const owner = new Int32Array(model.nn).fill(-1);
  fixtures.map(normFixture).forEach((fx, i) => {
    const faces = selectFaces(model, fx.body != null ? { body: fx.body, faceId: fx.faceId } : fx.faceId);
    if (!faces.length) return;
    if (fx.type === 'elastic') { springs.push({ faces, k: Number(fx.stiffness ?? fx.k) || 0 }); count++; return; }
    const nodes = onFaceNodes(model, faces);
    if (fx.type === 'roller' || fx.type === 'symmetry') {
      // A planar face keeps one normal for all its nodes (symmetry planes); curved faces use per-node normals.
      const st = cadFaceStats(model, faces) ?? faceStats(model, faces), flat = st.flatness > 0.995;
      const { normal } = flat ? { normal: null } : nodalAreas(model, faces);
      for (const n of nodes) {
        if (fixed[3 * n] && fixed[3 * n + 1] && fixed[3 * n + 2]) continue;
        const nv = flat ? st.normal : normal.get(n) ?? [0, 0, 1];
        const ax = [0, 1, 2].find((a) => Math.abs(Math.abs(nv[a]) - 1) < 1e-6);
        if (ax != null && !frames.has(n)) { fixed[3 * n + ax] = 1; value[3 * n + ax] = 0; }
        else if (!frames.has(n)) { frames.set(n, frameFromNormal(nv)); fixed[3 * n] = 1; value[3 * n] = 0; }
        owner[n] = i;
      }
      count++;
      return;
    }
    for (const n of nodes) {
      const v = fx.type === 'displacement' ? fx.value ?? [0, 0, 0] : [0, 0, 0];
      if (frames.has(n)) { // a rotated node gets fully fixed only for zero values
        if (fx.type === 'fixed') { fixed[3 * n] = fixed[3 * n + 1] = fixed[3 * n + 2] = 1; value[3 * n] = value[3 * n + 1] = value[3 * n + 2] = 0; }
        continue;
      }
      for (let c = 0; c < 3; c++) if (v[c] != null && Number.isFinite(Number(v[c]))) { fixed[3 * n + c] = 1; value[3 * n + c] = Number(v[c]); }
      owner[n] = i;
    }
    count++;
  });
  return { fixed, value, frames, springs, count, owner };
}

/** Rows: the normal first, then two tangents. */
export function frameFromNormal(n) {
  const l = Math.hypot(...n) || 1, a = n.map((v) => v / l);
  const t0 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = t0[0] * a[0] + t0[1] * a[1] + t0[2] * a[2];
  let t1 = [t0[0] - d * a[0], t0[1] - d * a[1], t0[2] - d * a[2]];
  const l1 = Math.hypot(...t1); t1 = t1.map((v) => v / l1);
  const t2 = [a[1] * t1[2] - a[2] * t1[1], a[2] * t1[0] - a[0] * t1[2], a[0] * t1[1] - a[1] * t1[0]];
  return [...a, ...t1, ...t2];
}

/** K ← R K Rᵀ blockwise for the nodes with frames (scalar CSR with 3 dofs per node on graph g). */
export function rotateMatrix(A, frames) {
  if (!frames.size) return;
  const { g, ptr, val } = A, I = [1, 0, 0, 0, 1, 0, 0, 0, 1], B = new Float64Array(9), T = new Float64Array(9);
  for (let i = 0; i < g.nn; i++) {
    const Ri = frames.get(i) ?? null;
    const s = g.ptr[i], deg = g.ptr[i + 1] - s;
    for (let q = 0; q < deg; q++) {
      const j = g.idx[s + q], Rj = frames.get(j) ?? null;
      if (!Ri && !Rj) continue;
      const base = (k) => ptr[3 * i + k] + 3 * q;
      for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) B[3 * k + l] = val[base(k) + l];
      const R1 = Ri ?? I, R2 = Rj ?? I;
      // T = R1 B, then B' = T R2ᵀ
      for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) T[3 * k + l] = R1[3 * k] * B[l] + R1[3 * k + 1] * B[3 + l] + R1[3 * k + 2] * B[6 + l];
      for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) val[base(k) + l] = T[3 * k] * R2[3 * l] + T[3 * k + 1] * R2[3 * l + 1] + T[3 * k + 2] * R2[3 * l + 2];
    }
  }
}

/** v ← R v (toLocal) or Rᵀ v per framed node. */
export function rotateVector(v, frames, toLocal) {
  for (const [n, R] of frames) {
    const x = v[3 * n], y = v[3 * n + 1], z = v[3 * n + 2];
    if (toLocal) { v[3 * n] = R[0] * x + R[1] * y + R[2] * z; v[3 * n + 1] = R[3] * x + R[4] * y + R[5] * z; v[3 * n + 2] = R[6] * x + R[7] * y + R[8] * z; }
    else { v[3 * n] = R[0] * x + R[3] * y + R[6] * z; v[3 * n + 1] = R[1] * x + R[4] * y + R[7] * z; v[3 * n + 2] = R[2] * x + R[5] * y + R[8] * z; }
  }
  return v;
}

/** Adds the elastic-support springs k ∫ N_a N_b dA (each direction) to K. */
export function addSprings(model, K, springs) {
  for (const { faces, k } of springs) {
    if (!(k > 0)) continue;
    const npf = model.faces.npf, Ke = new Float64Array(9 * npf * npf);
    for (const f of faces) {
      Ke.fill(0);
      const ids = [];
      integrateFaces(model, [f], (nid, N, A) => {
        if (!ids.length) for (let a = 0; a < npf; a++) ids.push(nid[a]);
        const a0 = Math.hypot(A[0], A[1], A[2]);
        for (let a = 0; a < npf; a++) for (let b = 0; b < npf; b++) for (let c = 0; c < 3; c++) Ke[(3 * a + c) * 3 * npf + 3 * b + c] += k * a0 * N[a] * N[b];
      });
      assemble(K, ids, npf, Ke);
    }
  }
}

// ───────────────────────── loads

/**
 * External force vector of loads:
 *   { faceId, force: [Fx,Fy,Fz] }   total force, as a uniform traction F/A over the faces
 *   { faceId, pressure: p }         normal pressure (positive pushes into the body)
 *   { faceId, torque: [Mx,My,Mz] }  a moment about the faces' centroid, as the traction (M × r)/I_p
 *   { faceId, traction: [tx,ty,tz] } a uniform traction (MPa)
 * gravity [gx,gy,gz] in m/s² (body force ρg). `scale` multiplies everything.
 */
export function loadVector(model, loads = [], gravity = null, scale = 1) {
  const f = new Float64Array(3 * model.nn);
  const npf = model.faces.npf;
  for (const load of loads) {
    const faces = selectFaces(model, load.body != null ? { body: load.body, faceId: load.faceId } : load.faceId);
    if (!faces.length) continue;
    if (load.force || load.traction) {
      const st = faceStats(model, faces);
      const t = load.traction ?? load.force.map((v) => v / (st.area || 1));
      integrateFaces(model, faces, (ids, N, A) => { const a = Math.hypot(A[0], A[1], A[2]); for (let q = 0; q < npf; q++) for (let c = 0; c < 3; c++) f[3 * ids[q] + c] += scale * N[q] * t[c] * a; });
    } else if (load.pressure) {
      integrateFaces(model, faces, (ids, N, A) => { for (let q = 0; q < npf; q++) for (let c = 0; c < 3; c++) f[3 * ids[q] + c] -= scale * load.pressure * N[q] * A[c]; });
    } else if (load.torque) {
      const st = faceStats(model, faces), M = load.torque, Ml = Math.hypot(...M) || 1, ax = M.map((v) => v / Ml);
      let Ip = 0;
      integrateFaces(model, faces, (ids, N, A, x) => { const r = [x[0] - st.centroid[0], x[1] - st.centroid[1], x[2] - st.centroid[2]], c = cross(ax, r); Ip += (c[0] ** 2 + c[1] ** 2 + c[2] ** 2) * Math.hypot(A[0], A[1], A[2]); });
      if (Ip > 0) integrateFaces(model, faces, (ids, N, A, x) => {
        const r = [x[0] - st.centroid[0], x[1] - st.centroid[1], x[2] - st.centroid[2]], t = cross(ax, r).map((v) => (v * Ml) / Ip), a = Math.hypot(A[0], A[1], A[2]);
        for (let q = 0; q < npf; q++) for (let c = 0; c < 3; c++) f[3 * ids[q] + c] += scale * N[q] * t[c] * a;
      });
    }
  }
  if (gravity && gravity.some((g) => g)) {
    const npe = model.npe, rule = ruleOf(model.order), dNs = ruleDerivatives(model.order, rule), X = new Float64Array(3 * npe), G = new Float64Array(3 * npe), N = new Float64Array(npe);
    for (let e = 0; e < model.ne; e++) {
      const rho = model.bodies[model.elemBody[e]].material.rho * 1e3;     // t/mm³ · mm/s² → N/mm³: ρ[kg/m³]·1e-9·g[m/s²]
      elementX(model, e, X);
      for (let gp = 0; gp < rule.weights.length; gp++) {
        const w = rule.weights[gp] * gradients(npe, X, dNs[gp], G);
        shapeValues(model.order, rule.points[gp], N);
        for (let a = 0; a < npe; a++) for (let c = 0; c < 3; c++) f[3 * model.elements[npe * e + a] + c] += scale * rho * gravity[c] * N[a] * w;
      }
    }
  }
  return f;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ───────────────────────── stresses

/**
 * Linear elastic stresses: per element Gauss point (6 each) and recovered at the nodes (extrapolated to the corners,
 * mid-edge nodes from their corners, averaged over the elements of each body). Returns { gauss, nodal (6·nn), vm (nn) }.
 * `strainOffset(e, g, eps)` may subtract an initial strain (thermal).
 */
export function elasticStresses(model, u, strainOffset = null) {
  const npe = model.npe, rule = ruleOf(model.order), ng = rule.weights.length, dNs = ruleDerivatives(model.order, rule);
  const X = new Float64Array(3 * npe), G = new Float64Array(3 * npe), gauss = new Float64Array(6 * ng * model.ne);
  const eps = new Float64Array(6);
  for (let e = 0; e < model.ne; e++) {
    const mat = model.bodies[model.elemBody[e]].material, lam = mat.lambda, mu = mat.mu;
    elementX(model, e, X);
    for (let g = 0; g < ng; g++) {
      gradients(npe, X, dNs[g], G);
      eps.fill(0);
      for (let a = 0; a < npe; a++) {
        const d = 3 * model.elements[npe * e + a], ux = u[d], uy = u[d + 1], uz = u[d + 2], gx = G[3 * a], gy = G[3 * a + 1], gz = G[3 * a + 2];
        eps[0] += gx * ux; eps[1] += gy * uy; eps[2] += gz * uz;
        eps[3] += gy * ux + gx * uy; eps[4] += gz * uy + gy * uz; eps[5] += gx * uz + gz * ux;
      }
      if (strainOffset) strainOffset(e, g, eps);
      const tr = eps[0] + eps[1] + eps[2], o = 6 * (ng * e + g);
      gauss[o] = lam * tr + 2 * mu * eps[0]; gauss[o + 1] = lam * tr + 2 * mu * eps[1]; gauss[o + 2] = lam * tr + 2 * mu * eps[2];
      gauss[o + 3] = mu * eps[3]; gauss[o + 4] = mu * eps[4]; gauss[o + 5] = mu * eps[5];
    }
  }
  const nodal = recoverSPR(model, gauss, 6);
  return { gauss, nodal, vm: vonMisesField(nodal, model.nn) };
}

/**
 * Superconvergent patch recovery (Zienkiewicz–Zhu): at every node a linear polynomial in x is fitted by least squares
 * to the Gauss-point values of the elements around it (grown by one ring when too few), evaluated at the node.
 * Less sensitive to distorted elements than extrapolation; falls back to extrapolation for degenerate patches.
 */
export function recoverSPR(model, gauss, stride) {
  const npe = model.npe, rule = ruleOf(model.order), ng = rule.weights.length, X = model.nodes;
  if (ng < 4) return recoverNodal(model, gauss, stride, 'extrapolate');
  // Gauss point positions.
  const gp = new Float64Array(3 * ng * model.ne), N = new Float64Array(npe);
  for (let e = 0; e < model.ne; e++) for (let g = 0; g < ng; g++) {
    shapeValues(model.order, rule.points[g], N);
    for (let a = 0; a < npe; a++) { const p = 3 * model.elements[npe * e + a]; for (let k = 0; k < 3; k++) gp[3 * (ng * e + g) + k] += N[a] * X[p + k]; }
  }
  const elemsOf = Array.from({ length: model.nn }, () => []);
  for (let e = 0; e < model.ne; e++) for (let a = 0; a < npe; a++) elemsOf[model.elements[npe * e + a]].push(e);
  const fallback = recoverNodal(model, gauss, stride, 'extrapolate');
  const out = new Float64Array(stride * model.nn), A = new Float64Array(16), rhs = new Float64Array(4 * stride);
  for (let n = 0; n < model.nn; n++) {
    let patch = elemsOf[n];
    if (patch.length < 3) {
      const grown = new Set(patch);
      for (const e of patch) for (let a = 0; a < npe; a++) for (const e2 of elemsOf[model.elements[npe * e + a]]) grown.add(e2);
      patch = [...grown];
    }
    A.fill(0); rhs.fill(0);
    let h = 0;
    for (const e of patch) for (let g = 0; g < ng; g++) { const q = ng * e + g; h = Math.max(h, Math.abs(gp[3 * q] - X[3 * n]), Math.abs(gp[3 * q + 1] - X[3 * n + 1]), Math.abs(gp[3 * q + 2] - X[3 * n + 2])); }
    h = h || 1;
    for (const e of patch) for (let g = 0; g < ng; g++) {
      const q = ng * e + g, b = [1, (gp[3 * q] - X[3 * n]) / h, (gp[3 * q + 1] - X[3 * n + 1]) / h, (gp[3 * q + 2] - X[3 * n + 2]) / h];
      for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) A[4 * i + j] += b[i] * b[j]; for (let c = 0; c < stride; c++) rhs[c * 4 + i] += b[i] * gauss[stride * q + c]; }
    }
    // Solve the 4×4 normal equations (Cholesky); degenerate patch → extrapolated value.
    const L = new Float64Array(16);
    let ok = true;
    for (let j = 0; j < 4 && ok; j++) {
      let d = A[5 * j]; for (let k = 0; k < j; k++) d -= L[4 * j + k] ** 2;
      if (!(d > 1e-10 * A[0])) { ok = false; break; }
      L[5 * j] = Math.sqrt(d);
      for (let i = j + 1; i < 4; i++) { let t = A[4 * i + j]; for (let k = 0; k < j; k++) t -= L[4 * i + k] * L[4 * j + k]; L[4 * i + j] = t / L[5 * j]; }
    }
    if (!ok) { for (let c = 0; c < stride; c++) out[stride * n + c] = fallback[stride * n + c]; continue; }
    for (let c = 0; c < stride; c++) {
      const y = [0, 0, 0, 0], x = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) { let t = rhs[c * 4 + i]; for (let k = 0; k < i; k++) t -= L[4 * i + k] * y[k]; y[i] = t / L[5 * i]; }
      for (let i = 3; i >= 0; i--) { let t = y[i]; for (let k = i + 1; k < 4; k++) t -= L[4 * k + i] * x[k]; x[i] = t / L[5 * i]; }
      out[stride * n + c] = x[0];
    }
  }
  return out;
}

/** Gauss values (stride per point) → nodal averages (extrapolated to the corners for 4-point elements). */
export function recoverNodal(model, gauss, stride, mode = 'extrapolate') {
  const npe = model.npe, ng = model.order === 2 ? 4 : 1, out = new Float64Array(stride * model.nn), count = new Float64Array(model.nn);
  const corner = new Float64Array(4 * stride), gp = new Float64Array(4 * stride), C = new Float64Array(12);
  for (let e = 0; e < model.ne; e++) {
    if (ng === 4) {
      for (let q = 0; q < 4 * stride; q++) gp[q] = gauss[4 * stride * e + q];
      if (mode === 'nearest') corner.set(gp); else gaussToCorners(gp, stride, corner);
    } else for (let a = 0; a < 4; a++) for (let c = 0; c < stride; c++) corner[a * stride + c] = gauss[stride * e + c];
    let w = 1;
    if (mode !== 'plain') {
      for (let a = 0; a < 4; a++) { const p = 3 * model.elements[npe * e + a]; C[3 * a] = model.nodes[p]; C[3 * a + 1] = model.nodes[p + 1]; C[3 * a + 2] = model.nodes[p + 2]; }
      w = Math.max(1e-30, tetVolume(C));
    }
    for (let a = 0; a < 4; a++) { const n = model.elements[npe * e + a]; for (let c = 0; c < stride; c++) out[stride * n + c] += w * corner[a * stride + c]; count[n] += w; }
    if (npe === 10) TET_EDGES.forEach(([i, j], k) => { const n = model.elements[npe * e + 4 + k]; for (let c = 0; c < stride; c++) out[stride * n + c] += 0.5 * w * (corner[i * stride + c] + corner[j * stride + c]); count[n] += w; });
  }
  for (let n = 0; n < model.nn; n++) if (count[n]) for (let c = 0; c < stride; c++) out[stride * n + c] /= count[n];
  return out;
}

export function vonMisesField(nodal, nn) {
  const vm = new Float64Array(nn);
  for (let n = 0; n < nn; n++) vm[n] = vonMises(nodal, 6 * n);
  return vm;
}

// ───────────────────────── results on the CAD surface

/** Per body: a nodal field (d per node) interpolated to that body's surface vertices. */
export function surfaceField(model, field, d, b = 0) {
  const p = model.bodies[b], m = p.mesh;
  const local = field.subarray ? field.subarray(d * p.nodeStart, d * p.nodeEnd) : field.slice(d * p.nodeStart, d * p.nodeEnd);
  return interpolateField(m, m.vertexMap, local, d);
}

/** Maximum of |vector| (d = 3) or value (d = 1) with the node position. */
export function fieldMax(model, field, d, abs = true) {
  let best = -Infinity, at = 0;
  for (let n = 0; n < model.nn; n++) {
    const v = d === 3 ? Math.hypot(field[3 * n], field[3 * n + 1], field[3 * n + 2]) : abs ? Math.abs(field[n]) : field[n];
    if (v > best) { best = v; at = n; }
  }
  return { value: best, at: [model.nodes[3 * at], model.nodes[3 * at + 1], model.nodes[3 * at + 2]], node: at };
}

// ───────────────────────── probes and plots

/** Point location in the model (cached locator). */
export function locate(model, p) {
  model._locator ??= elementLocator({ nodes: model.nodes, elements: model.elements, ne: model.ne, order: model.order, npe: model.npe, hmax: model.size });
  return model._locator.locate(p, 3);
}

/**
 * Values at a point: interpolates nodal fields { name: [array, d] } with the element's shape functions.
 * Returns { inside, element, values: { name: number | number[] } }.
 */
export function probe(model, p, fields) {
  const loc = locate(model, p);
  if (loc.elem < 0) return { inside: false, element: -1, values: {} };
  const N = shapeValues(model.order, loc.L), npe = model.npe, values = {};
  for (const [name, [arr, d]] of Object.entries(fields)) {
    const v = new Array(d).fill(0);
    for (let a = 0; a < npe; a++) { const n = model.elements[npe * loc.elem + a]; for (let c = 0; c < d; c++) v[c] += N[a] * arr[d * n + c]; }
    values[name] = d === 1 ? v[0] : v;
  }
  return { inside: loc.inside, element: loc.elem, values };
}

/** Samples a scalar of the probe values along the segment a→b: [{ s (mm from a), point, value }]. */
export function linePlot(model, a, b, fields, pick, samples = 41) {
  const out = [], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  for (let i = 0; i < samples; i++) {
    const t = i / Math.max(1, samples - 1), p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
    const r = probe(model, p, fields);
    out.push({ s: t * L, point: p, inside: r.inside, value: r.inside || r.element >= 0 ? pick(r.values) : null });
  }
  return out;
}

/** Principal stresses at every node (3 per node, descending). */
export function principalField(nodal, nn) {
  const out = new Float64Array(3 * nn);
  for (let n = 0; n < nn; n++) { const p = principal(nodal, 6 * n); out[3 * n] = p[0]; out[3 * n + 1] = p[1]; out[3 * n + 2] = p[2]; }
  return out;
}

export { graphPos, elasticityMatrix, faceShape, edgeNode };
