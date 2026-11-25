// Submodelling of a linear static study: a region of the part (the "submodel") is cut out, meshed finer and solved
// on its own, driven on the cut faces by the displacements of the global (coarser) result — the cut-boundary
// displacement method. Faces of the submodel that are not cut keep the global study's loads and fixtures.
//
// It holds when the cut is far enough from what the submodel changes (St. Venant): the check compares the
// global and the submodel's von Mises stress over the cut faces — they should agree (the `boundary` ratio near 1).
//
//   submodelStatic({ ...linearStatic input for the submodel body, global: { model, displacement, nodeStress },
//                    cutFaces: [faceId | { body, faceId }] }) → linearStatic result + { submodel: { … } }
import { linearStatic } from './static.js';
import { probe, selectFaces, onFaceNodes } from './model.js';

const faceRef = (f) => (typeof f === 'object' && f ? f : { faceId: f });

/** von Mises of the global result at a point (null outside its mesh). */
function globalStress(global, p) {
  const r = probe(global.model, p, { vm: [global.nodeStress, 1] });
  return r.element < 0 ? null : r.values.vm;
}

export function submodelStatic(input) {
  const global = input.global;
  if (!global?.model || !global.displacement) return { ok: false, error: 'no-global' };
  const cuts = (input.cutFaces ?? []).map(faceRef);
  if (!cuts.length) return { ok: false, error: 'no-cut' };
  const fixtures = [...(input.fixtures ?? []), ...cuts.map((c) => ({ ...c, type: 'field', source: global }))];
  const r = linearStatic({ ...input, fixtures });
  if (!r.model) return r;
  // The cut faces: the transmitted force (reactions of the driven nodes) and the stress match with the global result.
  const nCut = cuts.length, first = fixtures.length - nCut;
  const force = [0, 0, 0];
  for (let i = 0; i < nCut; i++) { const f = r.reactions?.[first + i]?.force; if (f) for (let k = 0; k < 3; k++) force[k] += f[k]; }
  let sg = 0, ss = 0, n = 0;
  for (const c of cuts) {
    const faces = selectFaces(r.model, c.body != null ? { body: c.body, faceId: c.faceId } : c.faceId);
    for (const node of onFaceNodes(r.model, faces)) {
      const p = [r.model.nodes[3 * node], r.model.nodes[3 * node + 1], r.model.nodes[3 * node + 2]];
      const g = globalStress(global, p);
      if (g == null) continue;
      sg += g; ss += r.nodeStress[node]; n++;
    }
  }
  const globalMax = Math.max(0, ...Array.from(global.nodeStress ?? []));
  return {
    ...r,
    submodel: {
      cutFaces: nCut, cutForce: force, boundaryNodes: n,
      boundaryGlobal: n ? sg / n : 0, boundarySub: n ? ss / n : 0, boundary: n && sg > 0 ? ss / sg : 1,
      globalMaxStress: globalMax,
    },
  };
}

// ───────────────────────── carrying the global study over to the submodel's faces

/** Triangles of each face of a surface mesh: Map faceId → [[a, b, c] (vertex indices), …]. */
function trianglesByFace(mesh) {
  const out = new Map();
  for (const g of mesh.faceGroups ?? []) {
    const list = out.get(g.faceId) ?? [];
    for (let i = g.start; i < g.start + g.count; i += 3) list.push([mesh.triangles[i], mesh.triangles[i + 1], mesh.triangles[i + 2]]);
    out.set(g.faceId, list);
  }
  return out;
}
const V = (m, i) => [m.vertices[3 * i], m.vertices[3 * i + 1], m.vertices[3 * i + 2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Distance from p to the triangle abc. */
function pointTriangle(p, a, b, c) {
  const ab = sub3(b, a), ac = sub3(c, a), ap = sub3(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub3(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub3(p, [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]])); }
  const cp = sub3(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub3(p, [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]])); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return len(sub3(p, [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])])); }
  const n = cross(ab, ac), nl = len(n) || 1;
  return Math.abs(dot(ap, n)) / nl;
}

/**
 * Which face of the global part each face of the submodel lies on: { map: Map subFaceId → { faceId, areaRatio },
 * cut: [subFaceId …] (faces inside the part's material — made by the cut) }. A sub face is matched by a few of its
 * triangle centres lying on one original face (within `tol`, default 1e-3 of the part's size).
 */
export function mapSubFaces(partMesh, subMesh, { tol = null } = {}) {
  const P = trianglesByFace(partMesh), S = trianglesByFace(subMesh);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < partMesh.vertices.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], partMesh.vertices[i + k]); hi[k] = Math.max(hi[k], partMesh.vertices[i + k]); }
  const eps = tol ?? 1e-3 * Math.max(1e-9, len(sub3(hi, lo)));
  const area = (m, tris) => tris.reduce((s, [a, b, c]) => s + 0.5 * len(cross(sub3(V(m, b), V(m, a)), sub3(V(m, c), V(m, a)))), 0);
  const partArea = new Map([...P].map(([id, tris]) => [id, area(partMesh, tris)]));
  const map = new Map(), cut = [];
  for (const [sid, tris] of S) {
    // Up to 5 sample points: the centres of the largest triangles.
    const pts = tris.map(([a, b, c]) => { const A = V(subMesh, a), B = V(subMesh, b), C = V(subMesh, c); return { p: [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3], s: len(cross(sub3(B, A), sub3(C, A))) }; })
      .sort((x, y) => y.s - x.s).slice(0, 5).map((x) => x.p);
    let best = null;
    for (const [pid, ptris] of P) {
      const onIt = pts.every((p) => ptris.some(([a, b, c]) => pointTriangle(p, V(partMesh, a), V(partMesh, b), V(partMesh, c)) < eps));
      if (onIt) { best = pid; break; }
    }
    if (best == null) cut.push(sid);
    else map.set(sid, { faceId: best, areaRatio: Math.min(1, area(subMesh, tris) / Math.max(1e-300, partArea.get(best))) });
  }
  return { map, cut };
}

/**
 * The global study's fixtures and loads on the submodel's faces. Face loads that spread over a face (pressure) are
 * kept; a force or torque on a face is scaled by the share of the face inside the submodel. Body loads (gravity,
 * spin, temperature change) carry over. Loads tied to several faces at once (remote, mass, bearing) and cyclic
 * pairs cannot be split: when they touch the submodel `unsupported` lists them.
 */
export function carryOver({ fixtures = [], loads = [] }, mapping) {
  const subsOf = (faceId) => [...mapping.map].filter(([, m]) => m.faceId === faceId);
  const unsupported = [];
  const outFix = [];
  for (const f of fixtures) {
    const r = typeof f === 'object' && f ? f : { faceId: f, type: 'fixed' };
    const hits = subsOf(r.faceId);
    if (!hits.length) continue;
    if (r.type === 'cyclic') { unsupported.push('cyclic'); continue; }
    for (const [sid] of hits) outFix.push({ ...r, faceId: sid, body: undefined });
  }
  const outLoads = [];
  for (const l of loads) {
    if (l.centrifugal || l.thermal) { outLoads.push(l); continue; }
    if (Array.isArray(l.faceId)) { if (l.faceId.some((id) => subsOf(typeof id === 'object' ? id.faceId : id).length)) unsupported.push(l.remote ? 'remote' : l.mass != null ? 'mass' : l.bearing ? 'bearing' : 'load'); continue; }
    for (const [sid, m] of subsOf(l.faceId)) {
      const r = { ...l, faceId: sid, body: undefined };
      if (l.force) r.force = l.force.map((v) => v * m.areaRatio);
      if (l.torque) r.torque = l.torque.map((v) => v * m.areaRatio);
      if (l.remote || l.bearing || l.mass != null) { unsupported.push('load'); continue; }
      outLoads.push(r);
    }
  }
  return { fixtures: outFix, loads: outLoads, unsupported: [...new Set(unsupported)] };
}
