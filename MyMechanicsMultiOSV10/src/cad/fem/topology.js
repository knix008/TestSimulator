// Topology optimisation (SIMP) on the tetrahedral engine: every element has a density ρ ∈ [ρmin, 1] and a stiffness
// E(ρ) = (ρmin + ρ^p (1 − ρmin)) E0. The compliance c = fᵀu of the static loads is minimised for a volume fraction
// V* (Σ ρ_e v_e ≤ V* Σ v_e) by optimality-criteria updates
//   ρ ← clamp(ρ · (−∂c/∂ρ / (λ v))^½, ρ ± move), λ by bisection on the volume,
// with the sensitivities filtered over a radius (Sigmund's filter: ∂c̃_e = Σ H ρ ∂c / (ρ_e Σ H), H = r − distance),
// which keeps checkerboards and mesh-size dependence out. Elements touching the fixed and loaded faces (and any
// faces chosen to keep) stay solid. Each iteration is one static solve (multigrid CG, warm-started).
// The result: element densities, the density at the surface points, the history, and the optimised shape — the
// boundary triangles of the elements above a threshold (smoothed), for the view and STL export.
import { buildModel, fixtureData, loadVector, elementX, selectFaces, surfaceField } from './model.js';
import { ruleOf, ruleDerivatives, elasticStiffness, elementVolume } from './elements.js';
import { csrFromGraph, assemble, applyDirichlet, solveSystem } from './sparse.js';
import { modelGraph } from './model.js';
import './static.js';                                   // registers the multigrid preconditioner

/** Element centroids (corner nodes). */
function centroids(model) {
  const c = new Float64Array(3 * model.ne), npe = model.npe;
  for (let e = 0; e < model.ne; e++) for (let a = 0; a < 4; a++) { const n = model.elements[npe * e + a]; for (let k = 0; k < 3; k++) c[3 * e + k] += model.nodes[3 * n + k] / 4; }
  return c;
}

/** The filter neighbourhoods: for every element the elements within r and their weights r − d. */
function filterWeights(c, ne, r) {
  const cell = r, map = new Map(), key = (i, j, k) => `${i},${j},${k}`;
  for (let e = 0; e < ne; e++) { const k2 = key(Math.floor(c[3 * e] / cell), Math.floor(c[3 * e + 1] / cell), Math.floor(c[3 * e + 2] / cell)); let l = map.get(k2); if (!l) map.set(k2, (l = [])); l.push(e); }
  const ptr = new Int32Array(ne + 1), idx = [], w = [];
  for (let e = 0; e < ne; e++) {
    const i0 = Math.floor(c[3 * e] / cell), j0 = Math.floor(c[3 * e + 1] / cell), k0 = Math.floor(c[3 * e + 2] / cell);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      for (const f of map.get(key(i, j, k)) ?? []) { const d = Math.hypot(c[3 * e] - c[3 * f], c[3 * e + 1] - c[3 * f + 1], c[3 * e + 2] - c[3 * f + 2]); if (d < r) { idx.push(f); w.push(r - d); } }
    }
    ptr[e + 1] = idx.length;
  }
  return { ptr, idx: Int32Array.from(idx), w: Float64Array.from(w) };
}

/**
 * input: { bodies, fixtures, loads, mesh, volumeFraction (0.4), penalty (3), filterRadius (mm; 1.5 × element size),
 * iterations (40), move (0.2), keepFaces ([faceId]), keepLoaded (true), threshold (0.5), onProgress, cancel }.
 */
export function topologyStudy(input) {
  const { bodies, fixtures = [], loads = [], mesh = {}, volumeFraction = 0.4, penalty = 3, iterations = 40, move = 0.2, keepFaces = [], keepLoaded = true, threshold = 0.5, onProgress = null, cancel = null, tol = 0.01 } = input;
  const report = (f, st, extra) => onProgress?.(Math.min(1, Math.max(0, f)), st, extra);
  const model = buildModel(bodies, { order: 1, ...mesh }, (f) => report(0.15 * f, 'mesh'));
  if (!model.ok) return { ok: false, error: model.error };
  const fx = fixtureData(model, fixtures);
  let nFixed = 0; for (let d = 0; d < fx.fixed.length; d++) nFixed += fx.fixed[d];
  if (!nFixed && !fx.springs.length) return { ok: false, error: 'no-fixtures' };
  const f = loadVector(model, loads);
  let fn = 0; for (let d = 0; d < f.length; d++) fn += f[d] * f[d];
  if (!(fn > 0)) return { ok: false, error: 'no-loads' };
  const ne = model.ne, npe = model.npe, m = 3 * npe, rhoMin = 1e-3;
  // Unit-density element matrices and volumes.
  const rule = ruleOf(model.order), dNs = ruleDerivatives(model.order, rule);
  const KE = new Float64Array(ne * m * m), vol = new Float64Array(ne), X = new Float64Array(3 * npe), G = new Float64Array(3 * npe), ke = new Float64Array(m * m);
  for (let e = 0; e < ne; e++) {
    const mat = model.bodies[model.elemBody[e]].material;
    elementX(model, e, X);
    elasticStiffness(model.order, X, mat.lambda, mat.mu, ke, dNs, G);
    KE.set(ke, e * m * m);
    vol[e] = elementVolume(model.order, X, dNs, G);
  }
  let vTotal = 0; for (let e = 0; e < ne; e++) vTotal += vol[e];
  // Passive (solid) elements: those with a node on a fixed, loaded or kept face.
  const passive = new Uint8Array(ne);
  const keepIds = new Set(keepFaces);
  if (keepLoaded) { for (const x of fixtures) keepIds.add(typeof x === 'object' ? x.faceId : x); for (const l of loads) keepIds.add(l.faceId); }
  const keepNodes = new Uint8Array(model.nn);
  const npf = model.faces.npf;
  for (const fi of selectFaces(model, [...keepIds].map((id) => ({ faceId: id })))) for (let a = 0; a < npf; a++) keepNodes[model.faces.nodes[npf * fi + a]] = 1;
  if (!keepNodes.some(Boolean)) for (let d = 0; d < fx.fixed.length; d++) if (fx.fixed[d]) keepNodes[(d / 3) | 0] = 1;
  for (let e = 0; e < ne; e++) for (let a = 0; a < npe; a++) if (keepNodes[model.elements[npe * e + a]]) { passive[e] = 1; break; }
  const c = centroids(model);
  const r = Number(input.filterRadius) > 0 ? Number(input.filterRadius) : 1.5 * model.size;
  const H = filterWeights(c, ne, r);
  // The densities start at the volume fraction (passive ones solid; the free ones scaled to meet the volume).
  let vPassive = 0; for (let e = 0; e < ne; e++) if (passive[e]) vPassive += vol[e];
  const start = Math.min(1, Math.max(rhoMin, (volumeFraction * vTotal - vPassive) / Math.max(1e-12, vTotal - vPassive)));
  const rho = Float64Array.from({ length: ne }, (_, e) => (passive[e] ? 1 : start));
  const graph = modelGraph(model);
  const u = new Float64Array(3 * model.nn), dc = new Float64Array(ne), dcf = new Float64Array(ne);
  const history = [];
  const ids = new Int32Array(npe);
  let it = 0, change = 1, compliance = 0;
  for (; it < iterations && (change > tol || it < iterations * 0.7); it++) {
    if (cancel?.()) return { ok: false, error: 'cancelled' };
    // Penalty continuation: p over the last third rises by one — intermediate densities get expensive, the layout crisp.
    const p = it < iterations * 0.6 ? penalty : penalty + Math.min(1, (it - iterations * 0.6) / (iterations * 0.3));
    // K(ρ) and the static solve.
    const K = csrFromGraph(graph, 3);
    for (let e = 0; e < ne; e++) {
      for (let a = 0; a < npe; a++) ids[a] = model.elements[npe * e + a];
      assemble(K, ids, npe, KE.subarray(e * m * m, (e + 1) * m * m), rhoMin + rho[e] ** p * (1 - rhoMin));
    }
    const b = Float64Array.from(f);
    applyDirichlet(K, fx.fixed, fx.value, b);
    const sol = solveSystem(K, b, u, { tol: 1e-6, maxIter: 4000, coords: model.nodes, mask: fx.fixed });
    u.set(sol.x);
    // Compliance and the sensitivities −p ρ^(p−1) (1 − ρmin) u_eᵀ K0 u_e.
    compliance = 0; for (let d = 0; d < f.length; d++) compliance += f[d] * u[d];
    for (let e = 0; e < ne; e++) {
      const base = e * m * m; let ue = 0;
      for (let i = 0; i < m; i++) { const ni = model.elements[npe * e + ((i / 3) | 0)], ui = u[3 * ni + (i % 3)]; if (!ui) continue; let s = 0; for (let j = 0; j < m; j++) { const nj = model.elements[npe * e + ((j / 3) | 0)]; s += KE[base + i * m + j] * u[3 * nj + (j % 3)]; } ue += ui * s; }
      dc[e] = -p * rho[e] ** (p - 1) * (1 - rhoMin) * ue;
    }
    // Sensitivity filter.
    for (let e = 0; e < ne; e++) { let s = 0, ws = 0; for (let p = H.ptr[e]; p < H.ptr[e + 1]; p++) { const j = H.idx[p]; s += H.w[p] * rho[j] * dc[j]; ws += H.w[p]; } dcf[e] = s / (Math.max(1e-3, rho[e]) * ws); }
    // Optimality criteria with the volume by bisection on λ.
    // λ by bisection on a log scale (the sensitivities can be of any size: N·mm over mm³).
    let l1 = 1e-40, l2 = 1e40; const next = new Float64Array(ne);
    let vNow = 0; for (let e = 0; e < ne; e++) vNow += rho[e] * vol[e];
    for (let k = 0; k < 200 && l2 / l1 > 1 + 1e-7; k++) {
      const lm = Math.sqrt(l1 * l2); let v = 0;
      for (let e = 0; e < ne; e++) {
        if (passive[e]) { next[e] = 1; v += vol[e]; continue; }
        const be = Math.sqrt(Math.max(0, -dcf[e]) / (lm * vol[e]));
        next[e] = Math.max(rhoMin, Math.max(rho[e] - move, Math.min(1, Math.min(rho[e] + move, rho[e] * be))));
        v += next[e] * vol[e];
      }
      if (v > volumeFraction * vTotal) l1 = lm; else l2 = lm;
    }
    change = 0; for (let e = 0; e < ne; e++) { change = Math.max(change, Math.abs(next[e] - rho[e])); rho[e] = next[e]; }
    let vf = 0; for (let e = 0; e < ne; e++) vf += rho[e] * vol[e];
    history.push({ iteration: it + 1, compliance, volumeFraction: vf / vTotal, change });
    report(0.15 + 0.8 * Math.min(1, (it + 1) / iterations), 'optimise', { iteration: it + 1, compliance });
    void vNow;
  }
  // Nodal density (element average) and at the surface points.
  const nodeRho = new Float64Array(model.nn), cnt = new Float64Array(model.nn);
  for (let e = 0; e < ne; e++) for (let a = 0; a < npe; a++) { const n = model.elements[npe * e + a]; nodeRho[n] += rho[e]; cnt[n]++; }
  for (let n = 0; n < model.nn; n++) nodeRho[n] /= cnt[n] || 1;
  report(1, 'done');
  return {
    // The kept (passive) regions alone may already exceed the target volume: then nothing can be taken away.
    passiveFraction: vPassive / vTotal,
    ok: true, error: null, model, densities: rho, nodeDensity: nodeRho, vertexDensity: surfaceField(model, nodeRho, 1, 0), passive, history, iterations: it, compliance, converged: change <= tol,
    volumeFraction: history.at(-1)?.volumeFraction ?? volumeFraction, elements: ne, elementSize: model.size, filterRadius: r,
    shape: optimisedShape(model, rho, threshold),
  };
}

/**
 * The boundary of the elements with ρ ≥ threshold as a triangle mesh { vertices, triangles, normals } (corner nodes;
 * a few passes of Laplacian smoothing on the surface take the staircase off), and its volume.
 */
export function optimisedShape(model, rho, threshold = 0.5, smooth = 3) {
  const npe = model.npe, faces = new Map();
  const FACES = [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]], EDGES = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
  const kept = Uint8Array.from({ length: model.ne }, (_, e) => (rho[e] >= threshold ? 1 : 0));
  // Elements meeting only along an edge make that edge non-manifold (four boundary triangles on it): the elements
  // around such an edge are filled in, until there is none (a closed, printable surface).
  const around = new Map();
  for (let e = 0; e < model.ne; e++) for (const [i, j] of EDGES) { const a = model.elements[npe * e + i], b = model.elements[npe * e + j], k = a < b ? `${a},${b}` : `${b},${a}`; let l = around.get(k); if (!l) around.set(k, (l = [])); l.push(e); }
  for (let pass = 0; pass < 20; pass++) {
    // Boundary triangles of the kept set, counted per edge.
    const bnd = new Map();
    for (let e = 0; e < model.ne; e++) {
      if (!kept[e]) continue;
      const v = [0, 1, 2, 3].map((a) => model.elements[npe * e + a]);
      for (const [a, b, c] of FACES) { const k = [v[a], v[b], v[c]].sort((x, y) => x - y).join(','); if (bnd.has(k)) bnd.delete(k); else bnd.set(k, [v[a], v[b], v[c]]); }
    }
    const count = new Map();
    for (const t of bnd.values()) for (let q = 0; q < 3; q++) { const a = t[q], b = t[(q + 1) % 3], k = a < b ? `${a},${b}` : `${b},${a}`; count.set(k, (count.get(k) ?? 0) + 1); }
    let added = 0;
    for (const [k, n] of count) if (n > 2) for (const e of around.get(k) ?? []) if (!kept[e]) { kept[e] = 1; added++; }
    if (!added) break;
  }
  for (let e = 0; e < model.ne; e++) {
    if (!kept[e]) continue;
    const v = [0, 1, 2, 3].map((a) => model.elements[npe * e + a]);
    for (const [a, b, c] of FACES) { const k = [v[a], v[b], v[c]].sort((x, y) => x - y).join(','); if (faces.has(k)) faces.delete(k); else faces.set(k, [v[a], v[b], v[c]]); }
  }
  const used = new Map(), verts = [], tris = [];
  const id = (n) => { let i = used.get(n); if (i == null) { i = verts.length / 3; used.set(n, i); verts.push(model.nodes[3 * n], model.nodes[3 * n + 1], model.nodes[3 * n + 2]); } return i; };
  for (const [a, b, c] of faces.values()) tris.push(id(a), id(b), id(c));
  const V = Float64Array.from(verts), nv = V.length / 3;
  // Laplacian smoothing (λ|μ, no shrinking) over the triangle neighbours.
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < tris.length; t += 3) for (let q = 0; q < 3; q++) { nb[tris[t + q]].add(tris[t + ((q + 1) % 3)]); nb[tris[t + q]].add(tris[t + ((q + 2) % 3)]); }
  for (let pass = 0; pass < 2 * smooth; pass++) {
    const k = pass % 2 ? -0.53 : 0.5, D = new Float64Array(V.length);
    for (let i = 0; i < nv; i++) { if (!nb[i].size) continue; for (const j of nb[i]) for (let a = 0; a < 3; a++) D[3 * i + a] += (V[3 * j + a] - V[3 * i + a]) / nb[i].size; }
    for (let i = 0; i < V.length; i++) V[i] += k * D[i];
  }
  let volume = 0;
  for (let t = 0; t < tris.length; t += 3) { const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2]; volume += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6; }
  // Vertex normals (area-weighted face normals) for shading.
  const N = new Float32Array(V.length);
  for (let t = 0; t < tris.length; t += 3) {
    const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i] += nx; N[i + 1] += ny; N[i + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return { vertices: Float32Array.from(V), normals: N, triangles: Uint32Array.from(tris), volume: Math.abs(volume) };
}
