// Shell elements for thin parts: a flat three-node facet shell (6 dofs per node: u v w θx θy θz) on the part's
// mid-surface. Membrane: the constant-strain triangle (CST). Bending: the discrete Kirchhoff triangle (DKT, Batoz
// 1980), built from its definition — the normal's rotations βx, βy vary quadratically over the triangle; at the
// corners they are the slopes of w, at the mid-sides the tangential one follows the cubic w along the side and the
// normal one is the mean of the corners' (so no transverse shear: thin plates). Drilling (θz about the facet's
// normal): a small stiffness (1e-3·E·t·A) that leaves the in-plane rigid rotation free.
//
// Stresses: per element, at its top and bottom surfaces σ = N/t ± 6 M/t² (local axes); von Mises of the larger,
// averaged to the nodes by area.
//
//   shellStatic({ nodes (3 per node), triangles (3 per element), thickness (per element or one value), material
//                 { E, nu, density, yield }, fixtures: [{ nodes: [...], type: 'fixed' | 'pinned' | 'roller', normal }],
//                 loads: [{ nodes, force: [Fx,Fy,Fz] } (shared) | { elements, pressure } | { gravity: [gx,gy,gz] }] })
//   → { ok, displacement (6 per node), maxDisplacement, nodeStress, maxStress, elementStress { top, bottom, vm },
//       reactions, minFactorOfSafety }
//
// Building the mid-surface from a part: midSurface(partMesh, faceIds, thickness) offsets the picked faces (one
// side of the wall) half the thickness inwards and welds the coincident vertices; wallThickness() measures it.
import { nodeGraph, csrFromGraph, assemble, applyDirichlet, solveSystem, multiply, cloneMatrix } from './sparse.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Local frame of a facet: rows e1 (along 1→2), e2, e3 (normal); local 2D coordinates of its corners; area. */
export function facetFrame(P) {
  const e1 = unit(sub(P[1], P[0])), n = cross(sub(P[1], P[0]), sub(P[2], P[0])), e3 = unit(n), e2 = cross(e3, e1);
  const xy = P.map((p) => { const d = sub(p, P[0]); return [dot(d, e1), dot(d, e2)]; });
  return { R: [e1, e2, e3], xy, area: 0.5 * len(n) };
}

/**
 * DKT bending: the curvature matrix B (3 × 9, dofs per corner w, βx = ∂w/∂x, βy = ∂w/∂y) at area coordinates L.
 */
function dktB(xy, L) {
  const [[x1, y1], [x2, y2], [x3, y3]] = xy;
  const A2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  // dL_i/dx = b_i / 2A, dL_i/dy = c_i / 2A.
  const b = [y2 - y3, y3 - y1, y1 - y2].map((v) => v / A2), c = [x3 - x2, x1 - x3, x2 - x1].map((v) => v / A2);
  // Quadratic shape functions: corners 0..2, mid-sides 3 (2–3), 4 (3–1), 5 (1–2); their x / y derivatives.
  const dN = (i, d) => {
    if (i < 3) return (4 * L[i] - 1) * d[i];
    const [p, q] = [[1, 2], [2, 0], [0, 1]][i - 3];
    return 4 * (L[q] * d[p] + L[p] * d[q]);
  };
  // βx and βy at each of the six points as rows over the 9 corner dofs.
  const bx = Array.from({ length: 6 }, () => new Float64Array(9)), by = Array.from({ length: 6 }, () => new Float64Array(9));
  for (let i = 0; i < 3; i++) { bx[i][3 * i + 1] = 1; by[i][3 * i + 2] = 1; }
  const P = xy;
  [[1, 2], [2, 0], [0, 1]].forEach(([i, j], k) => {
    const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1], l = Math.hypot(dx, dy), C = dx / l, S = dy / l;
    // Tangential βs = C βx + S βy, normal βn = S βx − C βy.
    // Mid-side: βs = 1.5 (w_j − w_i) / l − (βs_i + βs_j) / 4, βn = (βn_i + βn_j) / 2.
    const bs = new Float64Array(9), bn = new Float64Array(9);
    bs[3 * i] = -1.5 / l; bs[3 * j] = 1.5 / l;
    for (const m of [i, j]) {
      bs[3 * m + 1] += -0.25 * C; bs[3 * m + 2] += -0.25 * S;
      bn[3 * m + 1] += 0.5 * S; bn[3 * m + 2] += -0.5 * C;
    }
    // βx = C βs + S βn, βy = S βs − C βn.
    for (let q = 0; q < 9; q++) { bx[3 + k][q] = C * bs[q] + S * bn[q]; by[3 + k][q] = S * bs[q] - C * bn[q]; }
  });
  const B = [new Float64Array(9), new Float64Array(9), new Float64Array(9)];
  for (let i = 0; i < 6; i++) {
    const nx = dN(i, b), ny = dN(i, c);
    for (let q = 0; q < 9; q++) { B[0][q] += nx * bx[i][q]; B[1][q] += ny * by[i][q]; B[2][q] += ny * bx[i][q] + nx * by[i][q]; }
  }
  return B;
}

const GAUSS3 = [[2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]];
const planeD = (E, nu, f) => { const k = (E * f) / (1 - nu * nu); return [[k, k * nu, 0], [k * nu, k, 0], [0, 0, (k * (1 - nu)) / 2]]; };

/** Local 18 × 18 stiffness (dofs per node u v w θx θy θz in the facet's axes) of a facet with 2D corners xy. */
export function facetStiffness(xy, area, t, E, nu) {
  const K = new Float64Array(18 * 18);
  const add = (i, j, v) => { K[18 * i + j] += v; };
  // Membrane (CST): ε = [u,x, v,y, u,y + v,x] over (u, v) of the corners.
  const [[x1, y1], [x2, y2], [x3, y3]] = xy, A2 = 2 * area;
  const b = [y2 - y3, y3 - y1, y1 - y2].map((v) => v / A2), c = [x3 - x2, x1 - x3, x2 - x1].map((v) => v / A2);
  const Bm = [new Float64Array(6), new Float64Array(6), new Float64Array(6)];
  for (let i = 0; i < 3; i++) { Bm[0][2 * i] = b[i]; Bm[1][2 * i + 1] = c[i]; Bm[2][2 * i] = c[i]; Bm[2][2 * i + 1] = b[i]; }
  const Dm = planeD(E, nu, t);
  const mdof = (q) => 6 * (q >> 1) + (q & 1);
  for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) {
    let s = 0;
    for (let r = 0; r < 3; r++) for (let u = 0; u < 3; u++) s += Bm[r][p] * Dm[r][u] * Bm[u][q];
    add(mdof(p), mdof(q), s * area);
  }
  // Bending (DKT): dofs w, βx = ∂w/∂x = −θy, βy = ∂w/∂y = θx.
  const Db = planeD(E, nu, (t * t * t) / 12);
  const map = [], sign = [];
  for (let i = 0; i < 3; i++) { map.push(6 * i + 2, 6 * i + 4, 6 * i + 3); sign.push(1, -1, 1); }
  for (const L of GAUSS3) {
    const B = dktB(xy, L), w = area / 3;
    for (let p = 0; p < 9; p++) for (let q = 0; q < 9; q++) {
      let s = 0;
      for (let r = 0; r < 3; r++) for (let u = 0; u < 3; u++) s += B[r][p] * Db[r][u] * B[u][q];
      add(map[p], map[q], s * w * sign[p] * sign[q]);
    }
  }
  // Drilling: k (θz_i − θz_mean)² — no stiffness for a rigid in-plane turn.
  const kd = 1e-3 * E * t * area;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) add(6 * i + 5, 6 * j + 5, kd * (i === j ? 2 / 3 : -1 / 3));
  return { K, Bm, Dm, Db };
}

/** Rotates a local 18 × 18 matrix to global axes: Kg = Tᵀ K T with T = diag(R, R, …) (R rows = local axes). */
export function toGlobal(Kl, R) {
  const T = (i, j) => (Math.floor(i / 3) === Math.floor(j / 3) ? R[i % 3][j % 3] : 0);
  const KT = new Float64Array(324), Kg = new Float64Array(324);
  for (let i = 0; i < 18; i++) for (let j = 0; j < 18; j++) {
    let s = 0; const jb = 3 * Math.floor(j / 3);
    for (let k = jb; k < jb + 3; k++) s += Kl[18 * i + k] * T(k, j);
    KT[18 * i + j] = s;
  }
  for (let i = 0; i < 18; i++) for (let j = 0; j < 18; j++) {
    let s = 0; const ib = 3 * Math.floor(i / 3);
    for (let k = ib; k < ib + 3; k++) s += T(k, i) * KT[18 * k + j];
    Kg[18 * i + j] = s;
  }
  return Kg;
}

const vonMises2 = (s) => Math.sqrt(s[0] * s[0] - s[0] * s[1] + s[1] * s[1] + 3 * s[2] * s[2]);

export function shellStatic(input) {
  const { nodes, triangles, material, fixtures = [], loads = [], tol = 1e-10 } = input;
  const nn = nodes.length / 3, ne = triangles.length / 3;
  if (!ne) return { ok: false, error: 'no-shell' };
  const E = material.E, nu = material.nu ?? 0.3, rho = (material.density ?? 0) * 1e-9; // kg/m³ → kg/mm³
  const thick = (e) => (typeof input.thickness === 'number' ? input.thickness : input.thickness[e]);
  const g = nodeGraph(nn, triangles, 3), K = csrFromGraph(g, 6), f = new Float64Array(6 * nn);
  const P = (n) => [nodes[3 * n], nodes[3 * n + 1], nodes[3 * n + 2]];
  const frames = new Array(ne), mats = new Array(ne);
  let totalArea = 0;
  for (let e = 0; e < ne; e++) {
    const ids = [triangles[3 * e], triangles[3 * e + 1], triangles[3 * e + 2]];
    const fr = facetFrame(ids.map(P));
    if (!(fr.area > 0)) { frames[e] = null; continue; }
    frames[e] = fr; totalArea += fr.area;
    const m = facetStiffness(fr.xy, fr.area, thick(e), E, nu);
    mats[e] = m;
    assemble(K, ids, 3, toGlobal(m.K, fr.R));
  }
  // Loads.
  for (const l of loads) {
    if (l.gravity) {
      for (let e = 0; e < ne; e++) { const fr = frames[e]; if (!fr) continue; const m = rho * fr.area * thick(e) / 3; for (let a = 0; a < 3; a++) for (let k = 0; k < 3; k++) f[6 * triangles[3 * e + a] + k] += m * l.gravity[k] * 1000; }
      continue;
    }
    if (l.pressure != null) {
      // Pressure pushes against the facet's normal (onto the side it faces).
      const els = l.elements ?? Array.from({ length: ne }, (_, i) => i);
      for (const e of els) { const fr = frames[e]; if (!fr) continue; for (let a = 0; a < 3; a++) for (let k = 0; k < 3; k++) f[6 * triangles[3 * e + a] + k] -= (l.pressure * fr.area * fr.R[2][k]) / 3; }
      continue;
    }
    if (l.nodes?.length) {
      const share = 1 / l.nodes.length;
      for (const n of l.nodes) { for (let k = 0; k < 3; k++) f[6 * n + k] += (l.force?.[k] ?? 0) * share; for (let k = 0; k < 3; k++) f[6 * n + 3 + k] += (l.moment?.[k] ?? 0) * share; }
    }
  }
  // Fixtures.
  const fixed = new Uint8Array(6 * nn), value = new Float64Array(6 * nn);
  let count = 0;
  const owner = new Int32Array(nn).fill(-1);
  fixtures.forEach((fx, i) => {
    if (!fx.nodes?.length) return;
    count++;
    for (const n of fx.nodes) {
      owner[n] = i;
      if (fx.type === 'pinned') { for (let k = 0; k < 3; k++) fixed[6 * n + k] = 1; continue; }
      if (fx.type === 'roller') {
        // A symmetry plane along a global axis: no motion across it, no turning out of it.
        const ax = [0, 1, 2].reduce((m, k) => (Math.abs(fx.normal?.[k] ?? 0) > Math.abs(fx.normal?.[m] ?? 0) ? k : m), 0);
        fixed[6 * n + ax] = 1; for (let k = 0; k < 3; k++) if (k !== ax) fixed[6 * n + 3 + k] = 1;
        continue;
      }
      for (let k = 0; k < 6; k++) fixed[6 * n + k] = 1;
    }
  });
  if (!count) return { ok: false, error: 'no-fixtures' };
  // Nodes no element turns (a drilling dof left alone on an isolated node): hold them.
  const K0 = cloneMatrix(K);
  const b = Float64Array.from(f);
  applyDirichlet(K, fixed, value, b);
  const r = solveSystem(K, b, new Float64Array(6 * nn), { tol, maxIter: 50000 });
  const u = r.x;
  if (!u.every(Number.isFinite)) return { ok: false, error: 'singular' };
  // Reactions: K u − f on the fixed dofs, by fixture.
  const Ku = new Float64Array(6 * nn); multiply(K0, u, Ku);
  const reactions = fixtures.map(() => ({ force: [0, 0, 0] }));
  for (let n = 0; n < nn; n++) if (owner[n] >= 0) for (let k = 0; k < 3; k++) if (fixed[6 * n + k]) reactions[owner[n]].force[k] += Ku[6 * n + k] - f[6 * n + k];
  const { top, bottom, vm, nodeStress, maxStress, maxDisplacement } = shellStresses({ nodes, triangles, thickness: input.thickness, material }, u);
  const peak = Math.max(maxStress, vm.reduce((m2, v) => Math.max(m2, v), 0));
  const yieldS = material.yield ?? 0;
  return {
    ok: r.converged !== false, error: r.converged === false ? 'not-converged' : undefined, kind: 'shell',
    nodes, triangles, displacement: u, maxDisplacement, nodeStress, maxStress: Math.max(maxStress, peak), elementStress: { top, bottom, vm },
    reactions, elements: ne, nodeCount: nn, area: totalArea, minFactorOfSafety: yieldS > 0 && peak > 0 ? yieldS / peak : Infinity, method: r.method,
  };
}


/**
 * Stresses of a shell solution u (6 per node): per element at its top and bottom surfaces (σ = N/t ∓ 6M/t², facet
 * axes) and von Mises; per node from the corner stresses as global tensors averaged by area (the larger of the two
 * surfaces). → { top, bottom, vm, nodeStress, maxStress, maxDisplacement }.
 */
export function shellStresses({ nodes, triangles, thickness, material }, u) {
  const nn = nodes.length / 3, ne = triangles.length / 3, E = material.E, nu = material.nu ?? 0.3;
  const thick = (e) => (typeof thickness === 'number' ? thickness : thickness[e]);
  const P = (n) => [nodes[3 * n], nodes[3 * n + 1], nodes[3 * n + 2]];
  const frames = [], mats = [];
  for (let e = 0; e < ne; e++) { const fr = facetFrame([0, 1, 2].map((k) => P(triangles[3 * e + k]))); frames.push(fr.area > 0 ? fr : null); mats.push(fr.area > 0 ? facetStiffness(fr.xy, fr.area, thick(e), E, nu) : null); }
  // Stresses per element (centroid): membrane from CST, moments from DKT.
  const top = new Float64Array(3 * ne), bottom = new Float64Array(3 * ne), vm = new Float64Array(ne);
  const nodeStress = new Float64Array(nn), wsum = new Float64Array(nn), nodeTensor = new Float64Array(12 * nn); // top, bottom: xx yy zz xy yz zx
  for (let e = 0; e < ne; e++) {
    const fr = frames[e]; if (!fr) continue;
    const t = thick(e), m = mats[e], R = fr.R;
    const ul = new Float64Array(18);
    for (let a = 0; a < 3; a++) { const n = triangles[3 * e + a]; for (let blk = 0; blk < 2; blk++) for (let k = 0; k < 3; k++) ul[6 * a + 3 * blk + k] = dot(R[k], [u[6 * n + 3 * blk], u[6 * n + 3 * blk + 1], u[6 * n + 3 * blk + 2]]); }
    const um = [ul[0], ul[1], ul[6], ul[7], ul[12], ul[13]];
    const eps = [0, 1, 2].map((r2) => m.Bm[r2].reduce((s, v, q) => s + v * um[q], 0));
    const N = [0, 1, 2].map((r2) => m.Dm[r2].reduce((s, v, q) => s + v * eps[q], 0));
    const B = dktB(fr.xy, [1 / 3, 1 / 3, 1 / 3]);
    const ub = []; for (let a = 0; a < 3; a++) ub.push(ul[6 * a + 2], -ul[6 * a + 4], ul[6 * a + 3]);
    const kap = [0, 1, 2].map((r2) => B[r2].reduce((s, v, q) => s + v * ub[q], 0));
    const M = [0, 1, 2].map((r2) => m.Db[r2].reduce((s, v, q) => s + v * kap[q], 0));
    // w,xx > 0 (sagging up) stretches the bottom fibre: σ_top = N/t − 6M/t², σ_bottom = N/t + 6M/t².
    for (let k = 0; k < 3; k++) { top[3 * e + k] = N[k] / t - (6 * M[k]) / (t * t); bottom[3 * e + k] = N[k] / t + (6 * M[k]) / (t * t); }
    vm[e] = Math.max(vonMises2(top.subarray(3 * e, 3 * e + 3)), vonMises2(bottom.subarray(3 * e, 3 * e + 3)));
    // At the corners (the DKT curvature is linear over the element): the nodes' stress, averaged by area — a clamped
    // edge's peak moment sits at the corners, not at the centroids a third of an element in.
    for (let a = 0; a < 3; a++) {
      const Lc = [0, 0, 0]; Lc[a] = 1;
      const Bc = dktB(fr.xy, Lc);
      const kc = [0, 1, 2].map((r2) => Bc[r2].reduce((s, v, q) => s + v * ub[q], 0));
      const Mc = [0, 1, 2].map((r2) => m.Db[r2].reduce((s, v, q) => s + v * kc[q], 0));
      const st = [0, 1, 2].map((k) => N[k] / t - (6 * Mc[k]) / (t * t)), sb = [0, 1, 2].map((k) => N[k] / t + (6 * Mc[k]) / (t * t));
      // The surface stresses as global 3D tensors (σ = Σ s_ij e_i ⊗ e_j), summed by area: averaging tensors, not von
      // Mises values, lets the corners' scatter cancel between neighbours.
      const n = triangles[3 * e + a];
      for (const [side, s] of [[0, st], [1, sb]]) {
        const o = 6 * (2 * n + side);
        for (const [p, q, slot] of [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 3], [1, 2, 4], [0, 2, 5]]) {
          const v = s[0] * R[0][p] * R[0][q] + s[1] * R[1][p] * R[1][q] + s[2] * (R[0][p] * R[1][q] + R[1][p] * R[0][q]);
          nodeTensor[o + slot] += v * fr.area;
        }
      }
      wsum[n] += fr.area;
    }
  }
  let maxStress = 0, maxDisplacement = 0;
  const vm3 = (s, o) => Math.sqrt(0.5 * ((s[o] - s[o + 1]) ** 2 + (s[o + 1] - s[o + 2]) ** 2 + (s[o + 2] - s[o]) ** 2) + 3 * (s[o + 3] ** 2 + s[o + 4] ** 2 + s[o + 5] ** 2));
  for (let n = 0; n < nn; n++) {
    if (wsum[n]) { for (let k = 0; k < 12; k++) nodeTensor[12 * n + k] /= wsum[n]; nodeStress[n] = Math.max(vm3(nodeTensor, 12 * n), vm3(nodeTensor, 12 * n + 6)); }
    maxStress = Math.max(maxStress, nodeStress[n]); maxDisplacement = Math.max(maxDisplacement, Math.hypot(u[6 * n], u[6 * n + 1], u[6 * n + 2]));
  }
  return { top, bottom, vm, nodeStress, maxStress, maxDisplacement };
}

// ───────────────────────── from a part: the mid-surface

/** Area-weighted vertex normals of a triangle mesh (Float32/64 arrays). */
function vertexNormals(mesh) {
  const nv = mesh.vertices.length / 3, N = new Float64Array(3 * nv);
  const V = (i) => [mesh.vertices[3 * i], mesh.vertices[3 * i + 1], mesh.vertices[3 * i + 2]];
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]];
    const n = cross(sub(V(b), V(a)), sub(V(c), V(a)));
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[3 * v + k] += n[k];
  }
  return N;
}

/** Triangles (index triples into mesh.vertices) of the given faces, with each one's face id. */
function facesTriangles(mesh, faceIds) {
  const want = new Set(faceIds), out = [];
  for (const g of mesh.faceGroups ?? []) if (want.has(g.faceId)) for (let i = g.start; i < g.start + g.count; i += 3) out.push({ tri: [mesh.triangles[i], mesh.triangles[i + 1], mesh.triangles[i + 2]], faceId: g.faceId });
  return out;
}

/** Ray–triangle hit distance (Möller–Trumbore), or Infinity. */
function rayHit(o, d, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-14) return Infinity;
  const inv = 1 / det, s = sub(o, a), u = dot(s, p) * inv;
  if (u < -1e-9 || u > 1 + 1e-9) return Infinity;
  const q = cross(s, e1), v = dot(d, q) * inv;
  if (v < -1e-9 || u + v > 1 + 1e-9) return Infinity;
  const t = dot(e2, q) * inv;
  return t > 1e-9 ? t : Infinity;
}

/**
 * The wall thickness under the picked faces: rays from their triangles' centres inwards (against the face normal)
 * to the next surface; the median distance. null when nothing is hit.
 */
export function wallThickness(mesh, faceIds, { samples = 40 } = {}) {
  const tris = facesTriangles(mesh, faceIds);
  if (!tris.length) return null;
  const V = (i) => [mesh.vertices[3 * i], mesh.vertices[3 * i + 1], mesh.vertices[3 * i + 2]];
  const all = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) all.push([V(mesh.triangles[i]), V(mesh.triangles[i + 1]), V(mesh.triangles[i + 2])]);
  const step = Math.max(1, Math.floor(tris.length / samples)), d = [];
  for (let i = 0; i < tris.length; i += step) {
    const [a, b, c] = tris[i].tri.map(V), n = cross(sub(b, a), sub(c, a));
    if (len(n) < 1e-12) continue;
    const dir = unit(n).map((v) => -v), o = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    let best = Infinity;
    for (const [p, q, r] of all) best = Math.min(best, rayHit(o, dir, p, q, r));
    if (Number.isFinite(best)) d.push(best);
  }
  if (!d.length) return null;
  d.sort((x, y) => x - y);
  return d[Math.floor(d.length / 2)];
}

/**
 * The mid-surface of a wall: the picked faces' triangles moved half the thickness inwards along the vertex normals
 * (averaged over the picked faces, so the faces stay joined), coincident vertices welded.
 * → { nodes, triangles, faceOf (part face id per element), source (part vertex → node, −1 if none) }.
 */
export function midSurface(mesh, faceIds, thickness) {
  const tris = facesTriangles(mesh, faceIds);
  const N = vertexNormals({ vertices: mesh.vertices, triangles: Uint32Array.from(tris.flatMap((x) => x.tri)) });
  const nv = mesh.vertices.length / 3;
  // Weld by position first (faces carry their own copies of shared vertices), then average the normals per weld.
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.vertices[i + k]); hi[k] = Math.max(hi[k], mesh.vertices[i + k]); }
  const tolW = 1e-6 * Math.max(1e-9, len(sub(hi, lo))) + 1e-9;
  const key = (i) => [0, 1, 2].map((k) => Math.round(mesh.vertices[3 * i + k] / tolW)).join(',');
  const weld = new Map(), source = new Int32Array(nv).fill(-1);
  const sums = [];
  for (const { tri } of tris) for (const v of tri) {
    if (source[v] >= 0) continue;
    const k = key(v);
    let id = weld.get(k);
    if (id == null) { id = sums.length; weld.set(k, id); sums.push({ p: [mesh.vertices[3 * v], mesh.vertices[3 * v + 1], mesh.vertices[3 * v + 2]], n: [0, 0, 0] }); }
    source[v] = id;
  }
  for (let v = 0; v < nv; v++) if (source[v] >= 0) for (let k = 0; k < 3; k++) sums[source[v]].n[k] += N[3 * v + k];
  const nodes = new Float64Array(3 * sums.length);
  sums.forEach((s, i) => { const n = unit(s.n); for (let k = 0; k < 3; k++) nodes[3 * i + k] = s.p[k] - (n[k] * thickness) / 2; });
  const triangles = [], faceOf = [];
  for (const { tri, faceId } of tris) {
    const [a, b, c] = tri.map((v) => source[v]);
    if (a === b || b === c || a === c) continue;
    triangles.push(a, b, c); faceOf.push(faceId);
  }
  return { nodes, triangles: Uint32Array.from(triangles), faceOf, source };
}

/** Mid-surface nodes within `dist` of the given faces of the part (fixtures and loads on its edges). */
export function nodesNearFaces(mesh, faceIds, shell, dist) {
  const tris = facesTriangles(mesh, faceIds);
  const V = (i) => [mesh.vertices[3 * i], mesh.vertices[3 * i + 1], mesh.vertices[3 * i + 2]];
  const T = tris.map(({ tri }) => tri.map(V));
  const out = [];
  const nn = shell.nodes.length / 3;
  for (let n = 0; n < nn; n++) {
    const p = [shell.nodes[3 * n], shell.nodes[3 * n + 1], shell.nodes[3 * n + 2]];
    if (T.some(([a, b, c]) => pointTriangleDistance(p, a, b, c) <= dist)) out.push(n);
  }
  return out;
}

/** Distance from p to the triangle abc. */
export function pointTriangleDistance(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub(p, [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]])); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]])); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return len(sub(p, [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])])); }
  const n = cross(ab, ac), nl = len(n) || 1;
  return Math.abs(dot(ap, n)) / nl;
}

// ───────────────────────── a part's static study as a shell study

/** Area and mean outward normal of the given faces of a surface mesh. */
function facesAreaNormal(mesh, faceIds) {
  const V = (i) => [mesh.vertices[3 * i], mesh.vertices[3 * i + 1], mesh.vertices[3 * i + 2]];
  const n = [0, 0, 0];
  let area = 0;
  for (const { tri } of facesTriangles(mesh, faceIds)) {
    const [a, b, c] = tri.map(V), m = cross(sub(b, a), sub(c, a));
    area += 0.5 * len(m); for (let k = 0; k < 3; k++) n[k] += 0.5 * m[k];
  }
  return { area, normal: unit(n) };
}

/**
 * The shell study of a part: its mid-surface from `shellFaces` (one side of the wall; thickness measured when not
 * given), the solid study's fixtures and loads (engine records on part faces) moved to the mid-surface nodes on
 * those faces. Fixed → fixed, hinge → pinned, roller → roller (across the face's normal); forces shared by the
 * nodes of their face; pressure on a shell face → on its elements, on another face → its force p·A on the face's
 * nodes; gravity. Others are listed in `unsupported`.
 * → { input (for shellStatic), mid, thickness, unsupported } or { error }.
 */
export function shellFromPart({ mesh, shellFaces, thickness = 0, size = 0, fixtures = [], loads = [], gravity = null, material }) {
  if (!shellFaces?.length) return { error: 'no-shell-faces' };
  const t = thickness > 0 ? thickness : wallThickness(mesh, shellFaces);
  if (!(t > 0)) return { error: 'no-thickness' };
  const raw = midSurface(mesh, shellFaces, t);
  if (!raw.triangles.length) return { error: 'no-shell' };
  // Element size: given, or a 40th of the mid-surface's extent (and not below the thickness).
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < raw.nodes.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], raw.nodes[i + k]); hi[k] = Math.max(hi[k], raw.nodes[i + k]); }
  const h = size > 0 ? size : Math.max(t, len(sub(hi, lo)) / 40);
  const mid = refineSurface(raw, h);
  const reach = 0.51 * t + 1e-6 * t;
  const unsupported = new Set();
  const fx = [];
  for (const f of fixtures) {
    const r = typeof f === 'object' && f ? f : { faceId: f, type: 'fixed' };
    const nodes = nodesNearFaces(mesh, [r.faceId], mid, reach);
    if (!nodes.length) continue;
    if (r.type === 'fixed' || r.type == null) fx.push({ nodes, type: 'fixed' });
    else if (r.type === 'hinge') fx.push({ nodes, type: 'pinned' });
    else if (r.type === 'roller' || r.type === 'symmetry') fx.push({ nodes, type: 'roller', normal: facesAreaNormal(mesh, [r.faceId]).normal });
    else unsupported.add(r.type);
  }
  const ld = [];
  const shellSet = new Set(shellFaces);
  for (const l of loads) {
    if (l.centrifugal) { unsupported.add('centrifugal'); continue; }
    if (l.thermal) { unsupported.add('thermal'); continue; }
    if (Array.isArray(l.faceId) || l.remote || l.bearing || l.mass != null) { unsupported.add(l.remote ? 'remote' : l.bearing ? 'bearing' : l.mass != null ? 'mass' : 'load'); continue; }
    if (l.torque) { unsupported.add('torque'); continue; }
    if (l.pressure != null) {
      if (shellSet.has(l.faceId)) { const els = []; mid.faceOf.forEach((fid, e) => { if (fid === l.faceId) els.push(e); }); ld.push({ elements: els, pressure: l.pressure }); continue; }
      const nodes = nodesNearFaces(mesh, [l.faceId], mid, reach), an = facesAreaNormal(mesh, [l.faceId]);
      if (nodes.length) ld.push({ nodes, force: an.normal.map((v) => -v * l.pressure * an.area) });
      continue;
    }
    let force = l.force ?? null;
    if (!force && l.traction) { const A = facesAreaNormal(mesh, [l.faceId]).area; force = l.traction.map((v) => v * A); }
    if (!force) { unsupported.add('load'); continue; }
    const nodes = nodesNearFaces(mesh, [l.faceId], mid, reach);
    if (nodes.length) ld.push({ nodes, force });
  }
  if (gravity) ld.push({ gravity });
  return { input: { nodes: mid.nodes, triangles: mid.triangles, thickness: t, material, fixtures: fx, loads: ld }, mid, thickness: t, unsupported: [...unsupported] };
}

/**
 * Shell results on the part's surface (for the colours and the deformed shape): each part vertex takes its nearest
 * mid-surface node's displacement and stress. → { vertexDisplacement (3 per vertex), vertexStress }.
 */
export function onPartVertices(result, mesh) {
  const nv = mesh.vertices.length / 3, nn = result.nodes.length / 3;
  // A uniform grid over the nodes for the nearest search.
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let n = 0; n < nn; n++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], result.nodes[3 * n + k]); hi[k] = Math.max(hi[k], result.nodes[3 * n + k]); }
  const span = Math.max(1e-9, ...[0, 1, 2].map((k) => hi[k] - lo[k])), h = span / Math.max(1, Math.cbrt(nn) * 2);
  const cell = (p) => [0, 1, 2].map((k) => Math.floor((p[k] - lo[k]) / h));
  const keyOf = (a, b, c) => a + ',' + b + ',' + c;
  const grid = new Map();
  for (let n = 0; n < nn; n++) { const c = cell([result.nodes[3 * n], result.nodes[3 * n + 1], result.nodes[3 * n + 2]]), k = keyOf(c[0], c[1], c[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); }
  const vd = new Float32Array(3 * nv), vs = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const p = [mesh.vertices[3 * v], mesh.vertices[3 * v + 1], mesh.vertices[3 * v + 2]], c = cell(p);
    let best = -1, bd = Infinity;
    for (let ring = 0; ring < 64 && (best < 0 || ring <= 1); ring++) {
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) for (let k = -ring; k <= ring; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== ring) continue;
        for (const n of grid.get(keyOf(c[0] + i, c[1] + j, c[2] + k)) ?? []) { const d = Math.hypot(result.nodes[3 * n] - p[0], result.nodes[3 * n + 1] - p[1], result.nodes[3 * n + 2] - p[2]); if (d < bd) { bd = d; best = n; } }
      }
    }
    if (best < 0) continue;
    for (let k = 0; k < 3; k++) vd[3 * v + k] = result.displacement[6 * best + k];
    vs[v] = result.nodeStress[best];
  }
  return { vertexDisplacement: vd, vertexStress: vs };
}

/** The part's shell study, as the study runner runs it: shellFromPart → shellStatic → fields on the part's vertices. */
export function partShellStudy(args) {
  const prep = shellFromPart(args);
  if (prep.error) return { ok: false, error: prep.error };
  const r = shellStatic({ ...prep.input, tol: args.tol ?? 1e-10 });
  if (!r.displacement) return r;
  return { ...r, ...onPartVertices(r, args.mesh), thickness: prep.thickness, unsupported: prep.unsupported, elementSize: Math.sqrt((4 * r.area) / Math.sqrt(3) / Math.max(1, r.elements)), order: 1 };
}

// ───────────────────────── refining the mid-surface to an element size

/**
 * Conforming longest-edge refinement until no edge is longer than h: edges longer than h are marked, every
 * triangle with a marked edge gets its longest edge marked too (repeated until stable), then each triangle splits
 * by its marked edges — 1 (the longest) into 2, 2 into 3, 3 into 4 — at the edges' midpoints; repeated.
 * → { nodes, triangles, faceOf } (faceOf carried to the children). `maxElements` stops it early.
 */
export function refineSurface({ nodes, triangles, faceOf }, h, { maxElements = 40000 } = {}) {
  let P = Array.from(nodes), T = Array.from(triangles), F = Array.from(faceOf);
  const L = (a, b) => Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
  const ek = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  for (let round = 0; round < 30; round++) {
    const ne = T.length / 3;
    const marked = new Set();
    for (let e = 0; e < ne; e++) for (let k = 0; k < 3; k++) { const a = T[3 * e + k], b = T[3 * e + (k + 1) % 3]; if (L(a, b) > h) marked.add(ek(a, b)); }
    if (!marked.size) break;
    // Closure: a triangle with any marked edge has its longest edge marked.
    const longest = (e) => { let best = 0, bl = -1; for (let k = 0; k < 3; k++) { const l = L(T[3 * e + k], T[3 * e + (k + 1) % 3]); if (l > bl) { bl = l; best = k; } } return best; };
    for (let changed = true; changed;) {
      changed = false;
      for (let e = 0; e < ne; e++) {
        let any = false; for (let k = 0; k < 3; k++) if (marked.has(ek(T[3 * e + k], T[3 * e + (k + 1) % 3]))) any = true;
        if (!any) continue;
        const k = longest(e), key = ek(T[3 * e + k], T[3 * e + (k + 1) % 3]);
        if (!marked.has(key)) { marked.add(key); changed = true; }
      }
    }
    // Estimated children: stop before the limit.
    let grow = 0;
    for (let e = 0; e < ne; e++) { let c = 0; for (let k = 0; k < 3; k++) if (marked.has(ek(T[3 * e + k], T[3 * e + (k + 1) % 3]))) c++; grow += c; }
    if (ne + grow > maxElements) break;
    const mid = new Map();
    const midOf = (a, b) => { const key = ek(a, b); let m = mid.get(key); if (m == null) { m = P.length / 3; P.push((P[3 * a] + P[3 * b]) / 2, (P[3 * a + 1] + P[3 * b + 1]) / 2, (P[3 * a + 2] + P[3 * b + 2]) / 2); mid.set(key, m); } return m; };
    const T2 = [], F2 = [];
    const push = (a, b, c, f) => { T2.push(a, b, c); F2.push(f); };
    for (let e = 0; e < ne; e++) {
      const f = F[e];
      // Rotate so that the longest edge is v0–v1 (orientation kept).
      const k = longest(e);
      const v = [T[3 * e + k], T[3 * e + (k + 1) % 3], T[3 * e + (k + 2) % 3]];
      const m01 = marked.has(ek(v[0], v[1])), m12 = marked.has(ek(v[1], v[2])), m20 = marked.has(ek(v[2], v[0]));
      if (!m01) { push(v[0], v[1], v[2], f); continue; }
      const a = midOf(v[0], v[1]);
      if (m12 && m20) { const b = midOf(v[1], v[2]), c = midOf(v[2], v[0]); push(v[0], a, c, f); push(a, v[1], b, f); push(c, b, v[2], f); push(a, b, c, f); continue; }
      if (m12) { const b = midOf(v[1], v[2]); push(v[0], a, v[2], f); push(a, v[1], b, f); push(a, b, v[2], f); continue; }
      if (m20) { const c = midOf(v[2], v[0]); push(v[0], a, c, f); push(c, a, v[2], f); push(a, v[1], v[2], f); continue; }
      push(v[0], a, v[2], f); push(a, v[1], v[2], f);
    }
    T = T2; F = F2;
  }
  return { nodes: Float64Array.from(P), triangles: Uint32Array.from(T), faceOf: F };
}
