// Connectors of the tetrahedral studies: springs, bolts with preload, pins, rigid links, spot welds and bearings
// between two face sets (two bodies of an assembly, or two faces of one part).
//
// Each side's motion is the area-weighted mean of its face nodes: the translation ū = Σ wᵢ uᵢ and, about an axis e
// through the side's centroid, the rotation θₑ = Σ wᵢ (e × rᵢ)·uᵢ / Σ wᵢ |e × rᵢ|² (the best-fitting rigid turn).
// A connector is a set of linear constraints g = Σ cᵢ·uᵢ (one vector cᵢ per node) between the two sides, each with a
// stiffness k: K += k c cᵀ — a spring when k is physical, a tie when it is large (rigid, pin, spot weld). The
// constraint value g after the solve gives the connector's force k·g.
//   spring    axial k (along the line from A to B, or a given direction) and shear k across it (N/mm)
//   bolt      the shank as a spring: axial E A / L, shear 12 E I / L³ (A, I of the diameter, L between the faces' centres);
//             preload P: equal and opposite forces pulling the faces together; the bolt force = P + k_axial·elongation
//   pin       the two sides move together (translations), free to turn about each other
//   rigid     translations and rotations tied
//   spotWeld  translations and rotations tied between the parts of the faces within the weld's radius of its point
//   bearing   radial stiffness about the shaft's axis (the two directions square to it); axial and turning free
// Sides with more than 600 nodes are thinned evenly to keep the coupling sparse.
import { selectFaces, nodalAreas, cylinderOfFaces } from './model.js';
import { addEntry } from './sparse.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Two unit vectors square to d. */
function across(d) {
  const t = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(cross(d, t)); return [e1, cross(d, e1)];
}

/** A side: { nodes, w (weights, sum 1), c (centroid) } of faces, optionally only within `radius` of `point`. */
export function sideOf(model, refs, { point = null, radius = Infinity, max = 600 } = {}) {
  const faces = selectFaces(model, refs);
  if (!faces.length) return null;
  const { area } = nodalAreas(model, faces);
  let list = [...area].filter(([n]) => !point || Math.hypot(...sub([model.nodes[3 * n], model.nodes[3 * n + 1], model.nodes[3 * n + 2]], point)) <= radius);
  if (!list.length) return null;
  // Thinned evenly over the face (in face order), each kept node standing for the area of those it skips — a biased
  // pick would turn a rigid turn of the side into a mean translation.
  if (list.length > max) { const step = list.length / max; list = Array.from({ length: max }, (_, i) => { const lo = Math.floor(i * step), hi = Math.floor((i + 1) * step); let a = 0; for (let q = lo; q < hi; q++) a += list[q][1]; return [list[lo][0], a]; }); }
  const W = list.reduce((s, [, a]) => s + a, 0);
  const nodes = list.map(([n]) => n), w = list.map(([, a]) => a / W);
  const c = [0, 0, 0];
  nodes.forEach((n, i) => { for (let k = 0; k < 3; k++) c[k] += w[i] * model.nodes[3 * n + k]; });
  return { nodes, w, c, faces };
}

/** Coefficient vectors of a side's mean translation along d: wᵢ d. */
const transRow = (side, d) => side.nodes.map((_, i) => d.map((x) => x * side.w[i]));
/** Coefficient vectors of a side's mean rotation about e (through its centroid). */
function rotRow(model, side, e) {
  const rows = side.nodes.map((n, i) => { const r = sub([model.nodes[3 * n], model.nodes[3 * n + 1], model.nodes[3 * n + 2]], side.c); return cross(e, r).map((x) => x * side.w[i]); });
  const S = side.nodes.reduce((s, n, i) => { const r = sub([model.nodes[3 * n], model.nodes[3 * n + 1], model.nodes[3 * n + 2]], side.c); const q = cross(e, r); return s + side.w[i] * dot(q, q); }, 0);
  return S > 1e-300 ? rows.map((v) => v.map((x) => x / S)) : null;
}

/** A constraint B − A of two rows: { ids, C (3 per id), k, label, dir }. */
function pairRow(A, B, rowA, rowB, k, label, dir = null) {
  const map = new Map();
  const put = (n, v, s) => { const o = map.get(n) ?? [0, 0, 0]; map.set(n, [o[0] + s * v[0], o[1] + s * v[1], o[2] + s * v[2]]); };
  A.nodes.forEach((n, i) => put(n, rowA[i], -1));
  B.nodes.forEach((n, i) => put(n, rowB[i], 1));
  return { ids: [...map.keys()], C: [...map.values()], k, label, dir };
}

/**
 * The constraints of connectors: { list: [{ connector, rows: [{ ids, C, k, label, dir }], preload: { side A, side B,
 * dir, P } }], pairs (node pairs for the matrix pattern) }. connectors: [{ type, faceA, faceB, bodyA?, bodyB?, … }].
 */
export function connectorConstraints(model, connectors = []) {
  const list = [], pairs = [];
  const E = Math.max(...model.bodies.map((b) => b.material.E));
  const h = Math.min(...model.bodies.map((b) => b.mesh.size));
  const stiff = 1e3 * E * h;   // a tie: far stiffer than the elements around it (N/mm)
  connectors.forEach((cn, ci) => {
    const ref = (face, body) => (Array.isArray(face) ? face : [face]).map((f) => (body != null ? { body, faceId: f } : f));
    const radius = cn.type === 'spotWeld' ? (Number(cn.diameter) || 5) / 2 : Infinity;
    const A = sideOf(model, ref(cn.faceA, cn.bodyA), { point: cn.point ?? null, radius });
    const B = sideOf(model, ref(cn.faceB, cn.bodyB), { point: cn.point ?? null, radius });
    if (!A || !B) { list.push({ connector: ci, error: 'faces', rows: [] }); return; }
    const rows = []; let preload = null;
    const line = sub(B.c, A.c), L = Math.hypot(...line);
    const d = norm(cn.direction ?? (L > 1e-9 ? line : [0, 0, 1]));
    const [t1, t2] = across(d);
    const trans = (dir, k, label) => rows.push(pairRow(A, B, transRow(A, dir), transRow(B, dir), k, label, dir));
    const rot = (e, k, label) => { const ra = rotRow(model, A, e), rb = rotRow(model, B, e); if (ra && rb) rows.push(pairRow(A, B, ra, rb, k, label, e)); };
    if (cn.type === 'spring') {
      trans(d, Number(cn.axial) || 0, 'axial'); const ks = Number(cn.shear) || 0;
      if (ks > 0) { trans(t1, ks, 'shear1'); trans(t2, ks, 'shear2'); }
    } else if (cn.type === 'bolt') {
      const D = Number(cn.diameter) || 10, Eb = Number(cn.E) || 210000, Ab = (Math.PI * D * D) / 4, Ib = (Math.PI * D ** 4) / 64, Lb = Math.max(L, 1e-6);
      trans(d, (Eb * Ab) / Lb, 'axial'); trans(t1, (12 * Eb * Ib) / Lb ** 3, 'shear1'); trans(t2, (12 * Eb * Ib) / Lb ** 3, 'shear2');
      const P = Number(cn.preload) || 0;
      if (P) preload = { A, B, dir: d, P };
    } else if (cn.type === 'pin') {
      for (const e of AXES) trans(e, stiff, 'tie');
    } else if (cn.type === 'rigid' || cn.type === 'spotWeld') {
      for (const e of AXES) trans(e, stiff, 'tie');
      for (const e of AXES) rot(e, stiff * h * h, 'turn');
    } else if (cn.type === 'bearing') {
      const cyl = cylinderOfFaces(model, A.faces) ?? cylinderOfFaces(model, B.faces);
      const ax = cyl?.dir ?? d; const [r1, r2] = across(ax);
      const kr = Number(cn.radial) || stiff;
      trans(r1, kr, 'radial1'); trans(r2, kr, 'radial2');
      if (cn.axialFixed) trans(ax, stiff, 'axial');
    } else { list.push({ connector: ci, error: 'type', rows: [] }); return; }
    for (const r of rows) for (let i = 0; i < r.ids.length; i++) for (let j = i + 1; j < r.ids.length; j++) pairs.push(r.ids[i], r.ids[j]);
    list.push({ connector: ci, type: cn.type, rows, preload, length: L, A, B });
  });
  return { list, pairs };
}

/** Adds the connectors' stiffness k c cᵀ to K. */
export function addConnectors(K, conn) {
  for (const c of conn.list) for (const r of c.rows) {
    if (!(r.k > 0)) continue;
    for (let i = 0; i < r.ids.length; i++) for (let j = 0; j < r.ids.length; j++) {
      const a = r.C[i], b = r.C[j];
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) { const v = r.k * a[p] * b[q]; if (v) addEntry(K, 3 * r.ids[i] + p, 3 * r.ids[j] + q, v); }
    }
  }
}

/** Adds the bolt preloads to f: P along d on side A (towards B) and −P on side B, spread by the weights. */
export function addPreloads(f, conn) {
  for (const c of conn.list) {
    const pl = c.preload; if (!pl) continue;
    pl.A.nodes.forEach((n, i) => { for (let k = 0; k < 3; k++) f[3 * n + k] += pl.P * pl.A.w[i] * pl.dir[k]; });
    pl.B.nodes.forEach((n, i) => { for (let k = 0; k < 3; k++) f[3 * n + k] -= pl.P * pl.B.w[i] * pl.dir[k]; });
  }
}

/**
 * Connector results after a solve: [{ connector, type, forces: { label: k·g }, axial (bolt: P + k·elongation, N),
 * shear (N), moment (N·mm, rigid / spot weld) }].
 */
export function connectorResults(conn, u) {
  return conn.list.map((c) => {
    if (c.error) return { connector: c.connector, error: c.error };
    const forces = {};
    for (const r of c.rows) { let g = 0; r.ids.forEach((n, i) => { g += r.C[i][0] * u[3 * n] + r.C[i][1] * u[3 * n + 1] + r.C[i][2] * u[3 * n + 2]; }); forces[r.label] = (forces[r.label] ?? 0) + r.k * g; }
    const out = { connector: c.connector, type: c.type, forces };
    if (c.type === 'bolt' || c.type === 'spring') {
      // The spring force: tension positive when the sides move apart; a bolt adds its preload.
      out.axial = forces.axial + (c.preload?.P ?? 0);
      out.shear = Math.hypot(forces.shear1 ?? 0, forces.shear2 ?? 0);
    }
    if (c.type === 'pin' || c.type === 'rigid' || c.type === 'spotWeld') {
      // The force carried from A to B (x, y, z) and, tied, the moment.
      const val = (r) => { let g = 0; r.ids.forEach((n, i) => { g += r.C[i][0] * u[3 * n] + r.C[i][1] * u[3 * n + 1] + r.C[i][2] * u[3 * n + 2]; }); return r.k * g; };
      out.force = c.rows.filter((r) => r.label === 'tie').map(val);
      const turns = c.rows.filter((r) => r.label === 'turn').map(val);
      if (turns.length) out.moment = turns;
    }
    if (c.type === 'bearing') out.radial = Math.hypot(forces.radial1 ?? 0, forces.radial2 ?? 0);
    return out;
  });
}
