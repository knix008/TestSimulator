// Mixed meshes (no DOM): one static study of solid tetrahedra, shell facets and beam elements together — thin walls
// as shells, frames as beams, chunky parts as solids — bonded where they meet.
//
// Degrees of freedom: 3 per solid node (translations), 6 per shell / beam node (translations, rotations), in one
// scalar sparse system (sparse.js on a dof graph). Element matrices: solids from model.js (T4 / T10), shells from
// shell.js (DKT + CST facets), beams from beam.js (Euler–Bernoulli, 12 × 12). Ties: every shell / beam node within
// `spiderRadius` of solid nodes moves them rigidly with it (an RBE2 spider: u_s = u_b + θ × r, penalty k = 1e3·E·h),
// so forces and moments pass between them, and shell / beam nodes at the same place are bonded on all six — a beam
// welded to a block, a plate standing on one, a beam on a plate.
//
//   mixedStatic({ solids: [{ mesh, material }], solidMesh: { size, order }, shells: [{ nodes, triangles, thickness,
//                 material }], beams: [{ a, b, u, section: { A, Iy, Iz, J }, material, divisions }],
//                 fixtures: [{ points: [[x,y,z]…], tol, dofs: 'fixed' | 'pinned' }] (the nodes of any kind there),
//                 loads: [{ points, force, moment }] (shared by the nodes there), tieTol })
//   → { ok, displacement (per kind: solid 3·n, shell 6·n, beam 6·n), maxDisplacement, ties, dofs, at(point) → u }
import { buildModel, stiffnessMatrix, elasticStresses, surfaceField } from './model.js';
import { facetFrame, facetStiffness, toGlobal, midSurface, wallThickness, refineSurface, shellStresses, onPartVertices, pointTriangleDistance } from './shell.js';
import { localStiffness, elementAxes } from './beam.js';
import { csrFromGraph, applyDirichlet, solveSystem } from './sparse.js';

const len = (a) => Math.hypot(a[0], a[1], a[2]);

export function mixedStatic({ solids = [], solidMesh = {}, shells = [], beams = [], fixtures = [], loads = [], tieTol = 1e-3, spiderRadius = null, tieGap = null, tol = 1e-10 } = {}) {
  // ── nodes of each kind and their first dof.
  let model = null;
  if (solids.length) model = buildModel(solids.map((s) => ({ mesh: s.mesh, material: s.material })), solidMesh);
  const groups = [];          // { kind, n, dofs, base, pos(i) }
  let nDof = 0;
  if (model) { groups.push({ kind: 'solid', n: model.nn, d: 3, base: 0, pos: (i) => [model.nodes[3 * i], model.nodes[3 * i + 1], model.nodes[3 * i + 2]] }); nDof += 3 * model.nn; }
  const shellG = shells.map((s) => { const g = { kind: 'shell', n: s.nodes.length / 3, d: 6, base: nDof, src: s, pos: (i) => [s.nodes[3 * i], s.nodes[3 * i + 1], s.nodes[3 * i + 2]] }; nDof += 6 * g.n; groups.push(g); return g; });
  // Beams split into `divisions` elements along a → b.
  const beamG = beams.map((b) => {
    const m = Math.max(1, Math.round(b.divisions ?? 8)), pts = [];
    for (let k = 0; k <= m; k++) pts.push([0, 1, 2].map((q) => b.a[q] + ((b.b[q] - b.a[q]) * k) / m));
    const g = { kind: 'beam', n: pts.length, d: 6, base: nDof, src: b, pts, pos: (i) => pts[i] }; nDof += 6 * g.n; groups.push(g); return g;
  });
  // ── the dof graph (scalar): element couplings and ties.
  const adj = Array.from({ length: nDof }, () => new Set());
  const link = (dofs) => { for (const a of dofs) for (const b of dofs) adj[a].add(b); };
  const elements = [];          // { dofs, Ke (dense, row-major) }
  // Solids: the model's own CSR (3 dofs per node) copied in.
  let Ks = null;
  if (model) {
    Ks = stiffnessMatrix(model);
    for (let r = 0; r < Ks.n; r++) for (let p = Ks.ptr[r]; p < Ks.ptr[r + 1]; p++) adj[r].add(Ks.col[p]);
  }
  for (const g of shellG) {
    const s = g.src, T = s.triangles, E = s.material.E, nu = s.material.nu ?? 0.3;
    for (let e = 0; e < T.length / 3; e++) {
      const ids = [T[3 * e], T[3 * e + 1], T[3 * e + 2]];
      const fr = facetFrame(ids.map((i) => g.pos(i)));
      if (!(fr.area > 0)) continue;
      const t = typeof s.thickness === 'number' ? s.thickness : s.thickness[e];
      const Ke = toGlobal(facetStiffness(fr.xy, fr.area, t, E, nu).K, fr.R);
      const dofs = ids.flatMap((i) => [0, 1, 2, 3, 4, 5].map((k) => g.base + 6 * i + k));
      link(dofs); elements.push({ dofs, Ke, m: 18 });
    }
  }
  for (const g of beamG) {
    const b = g.src, E = b.material.E, G = E / (2 * (1 + (b.material.nu ?? 0.3))), { A, Iy, Iz, J } = b.section;
    for (let k = 0; k < g.n - 1; k++) {
      const xa = g.pts[k], xb = g.pts[k + 1], L = len([xb[0] - xa[0], xb[1] - xa[1], xb[2] - xa[2]]);
      const { ex, ey, ez } = elementAxes(xa, xb, b.u ?? [0, 0, 1]);
      const Kl = localStiffness(E, G, A, Iy, Iz, J, L);
      // Kg = Tᵀ Kl T with T = diag(R, R, R, R), R rows ex, ey, ez.
      const R = [ex, ey, ez], Ke = new Float64Array(144);
      const Tm = (i, j) => (Math.floor(i / 3) === Math.floor(j / 3) ? R[i % 3][j % 3] : 0);
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { let s = 0; for (let p = 3 * Math.floor(i / 3); p < 3 * Math.floor(i / 3) + 3; p++) for (let q = 3 * Math.floor(j / 3); q < 3 * Math.floor(j / 3) + 3; q++) s += Tm(p, i) * Kl[p][q] * Tm(q, j); Ke[12 * i + j] = s; }
      const dofs = [k, k + 1].flatMap((i) => [0, 1, 2, 3, 4, 5].map((q) => g.base + 6 * i + q));
      link(dofs); elements.push({ dofs, Ke, m: 12 });
    }
  }
  // Ties (penalty): a shell / beam node at a solid node (translations), shell / beam nodes at one place (all six).
  const Eref = Math.max(...[...solids, ...shells, ...beams].map((x) => x.material.E));
  const hRef = model?.size ?? 1;
  const kPen = 1e3 * Eref * hRef;
  const ties = [];            // penalty equations Σ coef·u = 0: { dofs, coef }
  const key = (p) => p.map((v) => Math.round(v / Math.max(tieTol, 1e-9))).join(',');
  // A shell / beam node near a solid: a rigid spider (RBE2) to the solid nodes within `reach` — each one moves with
  // the node's translation and rotation, u_s = u_b + θ × (x_s − x_b), so moments pass into the solid too.
  const reach = spiderRadius ?? 1.5 * (model?.size ?? 1);
  // Only the nodes that touch a solid's surface (within `tieGap`) are tied to it — not those merely near it.
  const solidTris = [];
  for (const sb of solids) { const m = sb.mesh; for (let i = 0; i < m.triangles.length; i += 3) solidTris.push([0, 1, 2].map((k) => { const v = m.triangles[i + k]; return [m.vertices[3 * v], m.vertices[3 * v + 1], m.vertices[3 * v + 2]]; })); }
  const gap = tieGap ?? 0.05 * (model?.size ?? 1);
  const touches = (p) => solidTris.some(([a, b, c]) => pointTriangleDistance(p, a, b, c) <= gap);
  const sixAt = new Map();
  for (const g of [...shellG, ...beamG]) for (let i = 0; i < g.n; i++) {
    const p = g.pos(i), ub = (q) => g.base + 6 * i + q;
    if (model && touches(p)) for (let sNode = 0; sNode < model.nn; sNode++) {
      const x = groups[0].pos(sNode), r = [x[0] - p[0], x[1] - p[1], x[2] - p[2]];
      if (len(r) > reach) continue;
      const us = (q) => 3 * sNode + q;
      // u_s − u_b − θ × r = 0, componentwise: θ × r = (θy rz − θz ry, θz rx − θx rz, θx ry − θy rx).
      ties.push({ dofs: [us(0), ub(0), ub(4), ub(5)], coef: [1, -1, -r[2], r[1]] });
      ties.push({ dofs: [us(1), ub(1), ub(5), ub(3)], coef: [1, -1, -r[0], r[2]] });
      ties.push({ dofs: [us(2), ub(2), ub(3), ub(4)], coef: [1, -1, -r[1], r[0]] });
    }
    const k = key(p), prev = sixAt.get(k);
    if (prev) for (let q = 0; q < 6; q++) ties.push({ dofs: [prev.g.base + 6 * prev.i + q, ub(q)], coef: [1, -1] });
    else sixAt.set(k, { g, i });
  }
  for (const tie of ties) link(tie.dofs);
  // ── assemble on the dof graph (d = 1).
  const ptr = new Int32Array(nDof + 1), lists = [];
  for (let r = 0; r < nDof; r++) { const u = Int32Array.from(adj[r]).sort(); lists.push(u); ptr[r + 1] = ptr[r] + u.length; }
  const idx = new Int32Array(ptr[nDof]); lists.forEach((u, r) => idx.set(u, ptr[r]));
  const graph = { nn: nDof, ptr, idx };
  const K = csrFromGraph(graph, 1);
  const pos = (r, c) => { let lo = ptr[r], hi = ptr[r + 1] - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (idx[mid] === c) return mid; if (idx[mid] < c) lo = mid + 1; else hi = mid - 1; } return -1; };
  const addK = (r, c, v) => { const p = pos(r, c); if (p >= 0) K.val[K.ptr[r] + (p - ptr[r])] += v; };
  if (Ks) for (let r = 0; r < Ks.n; r++) for (let p = Ks.ptr[r]; p < Ks.ptr[r + 1]; p++) addK(r, Ks.col[p], Ks.val[p]);
  for (const el of elements) for (let i = 0; i < el.m; i++) for (let j = 0; j < el.m; j++) { const v = el.Ke[el.m * i + j]; if (v) addK(el.dofs[i], el.dofs[j], v); }
  for (const tie of ties) for (let i = 0; i < tie.dofs.length; i++) for (let j = 0; j < tie.dofs.length; j++) addK(tie.dofs[i], tie.dofs[j], kPen * tie.coef[i] * tie.coef[j]);
  // ── fixtures and loads by points (any node of any kind within tol).
  const near = (p, tolP) => { const out = []; for (const g of groups) for (let i = 0; i < g.n; i++) if (len(g.pos(i).map((v, q) => v - p[q])) <= tolP) out.push({ g, i }); return out; };
  // Nodes on a face: within its tolerance of any of its triangles (only the kinds / bodies it names, when it does).
  const onTris = (tris, tolP, only = null) => { const out = []; for (const g of groups) { if (only && !only(g)) continue; for (let i = 0; i < g.n; i++) { const q = g.pos(i); if (tris.some(([a, b, c]) => pointTriangleDistance(q, a, b, c) <= tolP)) out.push({ g, i }); } } return out; };
  const hitsOf = (x) => (x.tris ? onTris(x.tris, x.tol ?? 1e-6, x.only) : x.points.flatMap((p) => near(p, x.tol ?? 1e-6)));
  const fixed = new Uint8Array(nDof), f = new Float64Array(nDof);
  for (const fx of fixtures) for (const { g, i } of hitsOf(fx)) {
    const ks = fx.dofs === 'pinned' || g.d === 3 ? [0, 1, 2] : [0, 1, 2, 3, 4, 5];
    for (const q of ks) if (q < g.d) fixed[g.base + g.d * i + q] = 1;
  }
  for (const l of loads) {
    const hits = hitsOf(l);
    if (!hits.length) continue;
    for (const { g, i } of hits) {
      for (let q = 0; q < 3; q++) f[g.base + g.d * i + q] += (l.force?.[q] ?? 0) / hits.length;
      if (g.d === 6) for (let q = 0; q < 3; q++) f[g.base + 6 * i + 3 + q] += (l.moment?.[q] ?? 0) / hits.length;
    }
  }
  // Solid nodes have no rotations; shell nodes with no drilling stiffness around are held by the drilling term.
  applyDirichlet(K, fixed, null, f);
  const r = solveSystem(K, f, new Float64Array(nDof), { tol, maxIter: 100000 });
  const u = r.x;
  let maxDisplacement = 0;
  const out = { solid: null, shells: [], beams: [] };
  for (const g of groups) {
    const arr = new Float64Array(g.d * g.n);
    for (let i = 0; i < g.d * g.n; i++) arr[i] = u[g.base + i];
    for (let i = 0; i < g.n; i++) maxDisplacement = Math.max(maxDisplacement, Math.hypot(arr[g.d * i], arr[g.d * i + 1], arr[g.d * i + 2]));
    if (g.kind === 'solid') out.solid = arr; else if (g.kind === 'shell') out.shells.push(arr); else out.beams.push(arr);
  }
  const at = (p, tolP = 1e-6) => { const h = near(p, tolP)[0]; return h ? [0, 1, 2].map((q) => u[h.g.base + h.g.d * h.i + q]) : null; };
  return { ok: r.converged !== false && u.every(Number.isFinite), displacement: out, maxDisplacement, ties: ties.length, dofs: nDof, at, method: r.method, model, groups, beamG, shellG };
}

// ───────────────────────── an assembly with solid, shell and beam components

const faceTris = (mesh, faceId) => {
  const out = [];
  for (const g of mesh.faceGroups ?? []) if (g.faceId === faceId) for (let i = g.start; i < g.start + g.count; i += 3) out.push([0, 1, 2].map((k) => { const v = mesh.triangles[i + k]; return [mesh.vertices[3 * v], mesh.vertices[3 * v + 1], mesh.vertices[3 * v + 2]]; }));
  return out;
};
function boxOf(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.vertices[i + k]); hi[k] = Math.max(hi[k], mesh.vertices[i + k]); }
  return { lo, hi, ext: [0, 1, 2].map((k) => hi[k] - lo[k]) };
}
/** A thin component as a shell: its faces facing +(thinnest axis) moved to the mid-surface, refined to `size`. */
function shellOf(mesh, size) {
  const { ext } = boxOf(mesh), k = ext.indexOf(Math.min(...ext));
  const P = (v) => [mesh.vertices[3 * v], mesh.vertices[3 * v + 1], mesh.vertices[3 * v + 2]];
  const faces = [];
  for (const g of mesh.faceGroups ?? []) {
    let n = 0;
    for (let i = g.start; i < g.start + g.count; i += 3) {
      const a = P(mesh.triangles[i]), b = P(mesh.triangles[i + 1]), c = P(mesh.triangles[i + 2]);
      const u = b.map((x, q) => x - a[q]), w = c.map((x, q) => x - a[q]);
      n += u[(k + 1) % 3] * w[(k + 2) % 3] - u[(k + 2) % 3] * w[(k + 1) % 3];
    }
    if (n > 1e-9) faces.push(g.faceId);
  }
  const t = wallThickness(mesh, faces) ?? ext[k];
  const mid = refineSurface(midSurface(mesh, faces, t), Math.max(t, size));
  return { nodes: mid.nodes, triangles: mid.triangles, thickness: t };
}
/** A slender component as a beam: its longest axis through the box's centre, the box's cross-section (rectangle). */
function beamOf(mesh) {
  const { lo, hi, ext } = boxOf(mesh), j = ext.indexOf(Math.max(...ext));
  const [p, q] = [0, 1, 2].filter((x) => x !== j);
  const c = lo.map((v, k) => (v + hi[k]) / 2), a = c.slice(), b = c.slice(); a[j] = lo[j]; b[j] = hi[j];
  const w = ext[p], h = ext[q], u = [0, 0, 0]; u[p] = 1;
  const big = Math.max(w, h), small = Math.min(w, h);
  return { a, b, u, section: { A: w * h, Iz: (h * w ** 3) / 12, Iy: (w * h ** 3) / 12, J: (1 / 3 - 0.21 * (small / big) * (1 - small ** 4 / (12 * big ** 4))) * big * small ** 3 }, half: [w / 2, h / 2] };
}

/**
 * Static study of an assembly of mixed bodies: bodies [{ mesh, material, kind: 'solid' | 'shell' | 'beam', name }],
 * fixtures [{ body, faceId, type }], loads [{ body, faceId, force | pressure }] (as the solid studies give them), mesh
 * ({ size, order } for the solids). A shell body: its faces facing the thinnest direction at the mid-surface; a beam
 * body: its longest axis with the box's cross-section. → { ok, bodies: [{ name, kind, vertexDisplacement,
 * vertexStress, maxStress }], maxStress, maxDisplacement, minFactorOfSafety, elements, kinds }.
 */
export function mixedAssemblyStudy({ bodies, fixtures = [], loads = [], mesh = {} }) {
  let size = mesh.size;
  if (!(size > 0)) { let d = 0; for (const b of bodies) d = Math.max(d, Math.hypot(...boxOf(b.mesh).ext)); size = d / 25; }
  const solids = [], shells = [], beams = [], where = [];
  for (const b of bodies) {
    if (b.kind === 'shell') { const sh = shellOf(b.mesh, size); where.push({ kind: 'shell', i: shells.length, sh }); shells.push({ ...sh, material: b.material }); }
    else if (b.kind === 'beam') { const bm = beamOf(b.mesh); where.push({ kind: 'beam', i: beams.length, bm }); beams.push({ ...bm, material: b.material, divisions: 12 }); }
    else { where.push({ kind: 'solid', i: solids.length }); solids.push({ mesh: b.mesh, material: b.material }); }
  }
  // Faces → node sets: a solid's own nodes on it, a shell's within half its thickness, a beam's within its section.
  const reachOf = (w) => (w.kind === 'shell' ? 0.51 * w.sh.thickness + 1e-6 : w.kind === 'beam' ? 1.02 * Math.max(...w.bm.half) : 1e-3 * size + 1e-6);
  const onlyOf = (w) => (g) => (w.kind === 'solid' ? g.kind === 'solid' : w.kind === 'shell' ? g.kind === 'shell' && g.src === shells[w.i] : g.kind === 'beam' && g.src === beams[w.i]);
  const fx = fixtures.map((f) => { const w = where[f.body ?? 0]; return { tris: faceTris(bodies[f.body ?? 0].mesh, f.faceId), tol: reachOf(w), only: onlyOf(w), dofs: f.type === 'hinge' ? 'pinned' : 'fixed' }; });
  const ld = loads.map((l) => {
    const w = where[l.body ?? 0], tris = faceTris(bodies[l.body ?? 0].mesh, l.faceId);
    let force = l.force;
    if (!force && l.pressure != null) {
      const n = [0, 0, 0];
      for (const [a, b, c] of tris) { const u = b.map((v, k) => v - a[k]), v2 = c.map((v, k) => v - a[k]); n[0] += 0.5 * (u[1] * v2[2] - u[2] * v2[1]); n[1] += 0.5 * (u[2] * v2[0] - u[0] * v2[2]); n[2] += 0.5 * (u[0] * v2[1] - u[1] * v2[0]); }
      force = n.map((v) => -v * l.pressure);
    }
    return { tris, tol: reachOf(w), only: onlyOf(w), force: force ?? [0, 0, 0] };
  });
  const r = mixedStatic({ solids, solidMesh: { size, order: mesh.order ?? 2 }, shells, beams, fixtures: fx, loads: ld, spiderRadius: 1.5 * size });
  if (!r.ok) return { ok: false, error: 'not-converged' };
  const solidStress = r.model ? elasticStresses(r.model, r.displacement.solid) : null;
  const out = bodies.map((b, bi) => {
    const w = where[bi];
    if (w.kind === 'solid') {
      const vd = surfaceField(r.model, r.displacement.solid, 3, w.i), vs = surfaceField(r.model, solidStress.vm, 1, w.i);
      return { name: b.name, kind: 'solid', vertexDisplacement: vd, vertexStress: vs, maxStress: vs.reduce((m, v) => Math.max(m, v), 0) };
    }
    if (w.kind === 'shell') {
      const u6 = r.displacement.shells[w.i], st = shellStresses({ ...w.sh, material: b.material }, u6);
      const f = onPartVertices({ nodes: w.sh.nodes, displacement: u6, nodeStress: st.nodeStress }, b.mesh);
      return { name: b.name, kind: 'shell', vertexDisplacement: f.vertexDisplacement, vertexStress: f.vertexStress, maxStress: st.maxStress, thickness: w.sh.thickness };
    }
    // Beam: each node's stress from its elements' stretch and bending (curvature from the end rotations).
    const g = r.beamG[w.i], u6 = r.displacement.beams[w.i], bm = beams[w.i], E = b.material.E, n = g.n;
    const nodeS = new Float64Array(n);
    for (let k = 0; k < n - 1; k++) {
      const d = g.pts[k + 1].map((v, q) => v - g.pts[k][q]), L = len(d), ex = d.map((v) => v / L);
      const du = [0, 1, 2].map((q) => u6[6 * (k + 1) + q] - u6[6 * k + q]), dth = [0, 1, 2].map((q) => u6[6 * (k + 1) + 3 + q] - u6[6 * k + 3 + q]);
      const axial = Math.abs((E * (du[0] * ex[0] + du[1] * ex[1] + du[2] * ex[2])) / L);
      const along = dth[0] * ex[0] + dth[1] * ex[1] + dth[2] * ex[2];
      const kap = len(dth.map((v, q) => v - ex[q] * along)) / L;
      const sig = axial + E * kap * Math.max(...bm.half);
      nodeS[k] = Math.max(nodeS[k], sig); nodeS[k + 1] = Math.max(nodeS[k + 1], sig);
    }
    const f = onPartVertices({ nodes: Float64Array.from(g.pts.flat()), displacement: u6, nodeStress: nodeS }, b.mesh);
    return { name: b.name, kind: 'beam', vertexDisplacement: f.vertexDisplacement, vertexStress: f.vertexStress, maxStress: nodeS.reduce((m, v) => Math.max(m, v), 0) };
  });
  const maxStress = Math.max(...out.map((x) => x.maxStress));
  const yieldMin = Math.min(...bodies.map((b) => b.material.yield ?? Infinity));
  return { ok: true, mixed: true, bodies: out, maxStress, maxDisplacement: r.maxDisplacement, minFactorOfSafety: maxStress > 0 ? yieldMin / maxStress : Infinity, elements: (r.model?.ne ?? 0) + shells.reduce((s, x) => s + x.triangles.length / 3, 0) + beams.length * 12, kinds: out.map((x) => x.kind), ties: r.ties, dofs: r.dofs };
}
