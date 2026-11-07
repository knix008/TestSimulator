// Modeling tools beyond the basic set: region inset, vertex bevel, the knife, quadric decimation and planar dissolve. No DOM here.
import { addFace, addVert, compact, createMesh, edgeKey, edgeMap, faceNormal, selVSet, selectedFaces, setFaceSelection, triangulateIndices, v3 } from './mesh.js';

/** Whether the selected faces have an edge of their region at all: a whole closed mesh has none, and can only inset face by face. */
export function regionHasOutline(mesh) {
  const inRegion = new Set(selectedFaces(mesh));
  for (const e of edgeMap(mesh).values()) if (e.faces.filter((g) => inRegion.has(g)).length === 1) return true;
  return false;
}

/** Inset of the selected faces as one region: only its outline moves in, with mitred corners, and `depth` lifts the whole region. */
export function insetRegion(mesh, thickness = 0.1, depth = 0) {
  const faces = selectedFaces(mesh);
  if (!faces.length) return mesh;
  const inRegion = new Set(faces);
  const edges = edgeMap(mesh);
  // The outline, directed as its faces run, with the region on its left.
  const outline = [];
  for (const f of faces) {
    const face = mesh.faces[f];
    for (let i = 0; i < face.length; i++) {
      const [a, b] = [face[i], face[(i + 1) % face.length]];
      if (edges.get(edgeKey(a, b)).faces.filter((g) => inRegion.has(g)).length === 1) outline.push({ a, b, f });
    }
  }
  const normals = new Map(faces.map((f) => [f, faceNormal(mesh, mesh.faces[f])]));
  const incoming = new Map();
  const outgoing = new Map();
  for (const e of outline) { incoming.set(e.b, e); outgoing.set(e.a, e); }
  const inward = (e) => v3.norm(v3.cross(normals.get(e.f), v3.norm(v3.sub(mesh.verts[e.b], mesh.verts[e.a]))));
  const regionNormal = new Map();
  for (const f of faces) for (const v of mesh.faces[f]) regionNormal.set(v, v3.add(regionNormal.get(v) ?? [0, 0, 0], normals.get(f)));
  const inner = new Map();
  for (const [v, into] of incoming) {
    const out = outgoing.get(v);
    if (!out) continue;
    const [d1, d2] = [inward(into), inward(out)];
    const sum = v3.add(d1, d2);
    const len = v3.len(sum);
    // A straight run moves by the thickness; a corner by more, so that both sides stay at the thickness.
    const direction = len > 1e-6 ? v3.mul(sum, 1 / len) : d1;
    const cos = Math.max(0.25, v3.dot(direction, d1));
    inner.set(v, addVert(mesh, v3.add(mesh.verts[v], v3.mul(direction, thickness / cos)), v));
  }
  for (const e of outline) {
    if (inner.has(e.a) && inner.has(e.b)) addFace(mesh, [e.a, e.b, inner.get(e.b), inner.get(e.a)], e.f);
  }
  for (const f of faces) mesh.faces[f] = mesh.faces[f].map((v) => inner.get(v) ?? v);
  if (depth) {
    const moved = new Set();
    for (const f of faces) {
      for (const v of mesh.faces[f]) {
        if (moved.has(v)) continue;
        moved.add(v);
        const key = [...inner.entries()].find(([, j]) => j === v)?.[0] ?? v;
        mesh.verts[v] = v3.add(mesh.verts[v], v3.mul(v3.norm(regionNormal.get(key) ?? [0, 0, 1]), depth));
      }
    }
  }
  setFaceSelection(mesh, faces);
  return mesh;
}

/** Bevels the selected vertices: each is cut off by a new face through points `width` along its edges. */
export function bevelVerts(mesh, width = 0.1) {
  const selected = [...selVSet(mesh)];
  if (!selected.length) return mesh;
  const touched = new Set(selected);
  const edges = edgeMap(mesh);
  let w = width;
  for (const e of edges.values()) {
    const both = touched.has(e.a) && touched.has(e.b);
    if (touched.has(e.a) || touched.has(e.b)) w = Math.min(w, v3.dist(mesh.verts[e.a], mesh.verts[e.b]) * (both ? 0.48 : 0.95));
  }
  const cut = new Map();
  const at = (v, u) => {
    const key = `${v}>${u}`;
    if (!cut.has(key)) cut.set(key, addVert(mesh, v3.add(mesh.verts[v], v3.mul(v3.norm(v3.sub(mesh.verts[u], mesh.verts[v])), w)), v));
    return cut.get(key);
  };
  const count = mesh.faces.length;
  const nextAround = new Map(); // around a vertex: each new point to the one after it, in the order of its cap
  for (let f = 0; f < count; f++) {
    const face = mesh.faces[f];
    const ring = [];
    for (let i = 0; i < face.length; i++) {
      const [p, v, n] = [face[(i + face.length - 1) % face.length], face[i], face[(i + 1) % face.length]];
      if (!touched.has(v)) { ring.push(v); continue; }
      const [from, to] = [at(v, p), at(v, n)];
      ring.push(from, to);
      if (!nextAround.has(v)) nextAround.set(v, new Map());
      nextAround.get(v).set(to, from);
    }
    mesh.faces[f] = ring;
    if (mesh.uvs) mesh.uvs[f] = null;
  }
  const caps = [];
  for (const links of nextAround.values()) {
    const [first] = links.keys();
    const cap = [first];
    for (let v = links.get(first); v != null && v !== first && cap.length <= links.size; v = links.get(v)) cap.push(v);
    if (cap.length >= 3 && cap.length === links.size) { addFace(mesh, cap); caps.push(mesh.faces.length - 1); }
  }
  const made = caps.length;
  compact(mesh);
  mesh.selMode = 'face';
  setFaceSelection(mesh, Array.from({ length: made }, (_, i) => mesh.faces.length - made + i));
  return mesh;
}

// ─────────────── the knife

const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;

/**
 * Cuts along a line drawn on screen. `path` is a list of [x, y]; `project(vertex)` gives a vertex's [x, y] on screen. Faces turned away
 * are left alone unless `through` is set; `faceFilter(f)` can narrow it further. Returns how many faces were cut.
 */
export function knifeCut(mesh, path, project, { through = false, faceFilter = null } = {}) {
  if (path.length < 2) return 0;
  const screen = mesh.verts.map((v) => project(v));
  const facing = (face) => {
    let area = 0;
    for (let i = 0; i < face.length; i++) {
      const [p, q] = [screen[face[i]], screen[face[(i + 1) % face.length]]];
      area += cross2(p[0], p[1], q[0], q[1]);
    }
    // Screen y points down: a face seen from the front runs clockwise there.
    return area < 0;
  };
  const allowed = mesh.faces.map((face, f) => (through || facing(face)) && (!faceFilter || faceFilter(f)));
  // Every crossing of the line with an edge, once per edge and per place along the line.
  const onEdge = new Map();
  const crossings = [];
  const edges = edgeMap(mesh);
  for (const e of edges.values()) {
    if (!e.faces.some((f) => allowed[f])) continue;
    const [p, q] = [screen[e.a], screen[e.b]];
    for (let s = 0; s + 1 < path.length; s++) {
      const [a, b] = [path[s], path[s + 1]];
      const [rx, ry, qx, qy] = [b[0] - a[0], b[1] - a[1], q[0] - p[0], q[1] - p[1]];
      const denom = cross2(rx, ry, qx, qy);
      if (Math.abs(denom) < 1e-9) continue;
      const along = cross2(p[0] - a[0], p[1] - a[1], qx, qy) / denom;
      const t = cross2(p[0] - a[0], p[1] - a[1], rx, ry) / denom;
      if (along < 0 || along > 1 || t <= 0.001 || t >= 0.999) continue;
      const vert = addVert(mesh, v3.lerp(mesh.verts[e.a], mesh.verts[e.b], t), e.a);
      const item = { edge: edgeKey(e.a, e.b), from: e.a, t, vert, order: s + along };
      if (!onEdge.has(item.edge)) onEdge.set(item.edge, []);
      onEdge.get(item.edge).push(item);
      crossings.push(item);
    }
  }
  if (!crossings.length) return 0;
  for (const list of onEdge.values()) list.sort((p, q) => p.t - q.t);
  // Into every face that shares a crossed edge go its new vertices, or the neighbours would have a crack.
  const order = new Map(crossings.map((c) => [c.vert, c.order]));
  const rings = mesh.faces.map((face) => {
    const ring = [];
    for (let i = 0; i < face.length; i++) {
      const [a, b] = [face[i], face[(i + 1) % face.length]];
      ring.push(a);
      const list = onEdge.get(edgeKey(a, b));
      if (list) {
        const items = list[0].from === a ? list : [...list].reverse();
        ring.push(...items.map((c) => c.vert));
      }
    }
    return ring;
  });
  const uvOf = (f, ring) => {
    const uvs = mesh.uvs?.[f];
    if (!uvs) return null;
    const face = mesh.faces[f];
    const out = [];
    for (let i = 0; i < face.length; i++) {
      const [a, b] = [face[i], face[(i + 1) % face.length]];
      out.push(uvs[i]);
      const list = onEdge.get(edgeKey(a, b));
      if (list) {
        const forward = list[0].from === a;
        for (const c of forward ? list : [...list].reverse()) {
          const k = forward ? c.t : 1 - c.t;
          out.push([uvs[i][0] + (uvs[(i + 1) % face.length][0] - uvs[i][0]) * k, uvs[i][1] + (uvs[(i + 1) % face.length][1] - uvs[i][1]) * k]);
        }
      }
    }
    return out.length === ring.length ? out : null;
  };
  // A face with two or more of the line's crossings is split between them, in the order the line met them.
  const newFaces = [];
  let cut = 0;
  const count = mesh.faces.length;
  for (let f = 0; f < count; f++) {
    const ring = rings[f];
    const corners = uvOf(f, ring);
    const on = ring.filter((v) => order.has(v)).sort((a, b) => order.get(a) - order.get(b));
    let pieces = [{ ring, uvs: corners }];
    if (allowed[f] && on.length >= 2) {
      cut++;
      for (let i = 0; i + 1 < on.length; i += 2) {
        const [a, b] = [on[i], on[i + 1]];
        const at = pieces.findIndex((p) => p.ring.includes(a) && p.ring.includes(b));
        if (at < 0) continue;
        const piece = pieces[at];
        const [ia, ib] = [piece.ring.indexOf(a), piece.ring.indexOf(b)];
        const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
        const one = { ring: piece.ring.slice(lo, hi + 1), uvs: piece.uvs?.slice(lo, hi + 1) ?? null };
        const two = { ring: [...piece.ring.slice(hi), ...piece.ring.slice(0, lo + 1)], uvs: piece.uvs ? [...piece.uvs.slice(hi), ...piece.uvs.slice(0, lo + 1)] : null };
        pieces.splice(at, 1, one, two);
      }
    }
    pieces = pieces.filter((p) => p.ring.length >= 3);
    mesh.faces[f] = pieces[0].ring;
    if (mesh.uvs) mesh.uvs[f] = pieces[0].uvs;
    for (const extra of pieces.slice(1)) newFaces.push({ ...extra, parent: f });
  }
  for (const piece of newFaces) {
    addFace(mesh, piece.ring, piece.parent);
    if (mesh.uvs) mesh.uvs[mesh.faces.length - 1] = piece.uvs;
  }
  mesh.selMode = mesh.selMode === 'face' ? 'vert' : mesh.selMode;
  mesh.selF = [];
  mesh.selV = crossings.map((c) => c.vert);
  return cut;
}

// ─────────────── decimation by quadric error

const planeOf = (a, b, c) => {
  const n = v3.cross(v3.sub(b, a), v3.sub(c, a));
  const area = v3.len(n);
  if (area < 1e-12) return null;
  const unit = v3.mul(n, 1 / area);
  return { n: unit, d: -v3.dot(unit, a), area };
};
// A symmetric 4×4 matrix as its ten numbers.
const planeQuadric = (n, d, w) => [n[0] * n[0] * w, n[0] * n[1] * w, n[0] * n[2] * w, n[0] * d * w, n[1] * n[1] * w, n[1] * n[2] * w, n[1] * d * w, n[2] * n[2] * w, n[2] * d * w, d * d * w];
const addQuadric = (a, b) => { for (let i = 0; i < 10; i++) a[i] += b[i]; };
const errorAt = (q, p) => q[0] * p[0] * p[0] + 2 * q[1] * p[0] * p[1] + 2 * q[2] * p[0] * p[2] + 2 * q[3] * p[0] + q[4] * p[1] * p[1] + 2 * q[5] * p[1] * p[2] + 2 * q[6] * p[1] + q[7] * p[2] * p[2] + 2 * q[8] * p[2] + q[9];

function bestPoint(q, a, b) {
  const det = q[0] * (q[4] * q[7] - q[5] * q[5]) - q[1] * (q[1] * q[7] - q[5] * q[2]) + q[2] * (q[1] * q[5] - q[4] * q[2]);
  if (Math.abs(det) > 1e-8) {
    const [r0, r1, r2] = [-q[3], -q[6], -q[8]];
    const x = (r0 * (q[4] * q[7] - q[5] * q[5]) - q[1] * (r1 * q[7] - q[5] * r2) + q[2] * (r1 * q[5] - q[4] * r2)) / det;
    const y = (q[0] * (r1 * q[7] - q[5] * r2) - r0 * (q[1] * q[7] - q[5] * q[2]) + q[2] * (q[1] * r2 - r1 * q[2])) / det;
    const z = (q[0] * (q[4] * r2 - r1 * q[5]) - q[1] * (q[1] * r2 - r1 * q[2]) + r0 * (q[1] * q[5] - q[4] * q[2])) / det;
    const p = [x, y, z];
    // A solution far from the edge belongs to a nearly flat quadric: keep to the edge.
    const reach = v3.dist(a, b) * 2 + 1e-6;
    if (v3.dist(p, v3.lerp(a, b, 0.5)) < reach) return p;
  }
  const middle = v3.lerp(a, b, 0.5);
  return [a, b, middle].map((p) => [errorAt(q, p), p]).sort((m, n) => m[0] - n[0])[0][1];
}

/** Quadric error edge collapse (Garland and Heckbert), keeping the surface's topology and open borders. Returns a triangle mesh. */
export function decimateQuadric(mesh, ratio) {
  const verts = mesh.verts.map((v) => [...v]);
  const tris = triangulateIndices(mesh).map((t) => [...t]);
  const target = Math.max(4, Math.floor(tris.length * ratio));
  if (tris.length <= target) return createMesh(verts, tris);
  const quadric = verts.map(() => new Array(10).fill(0));
  const trisOf = verts.map(() => new Set());
  tris.forEach((t, i) => {
    for (const v of t) trisOf[v].add(i);
    const plane = planeOf(verts[t[0]], verts[t[1]], verts[t[2]]);
    if (!plane) return;
    const q = planeQuadric(plane.n, plane.d, plane.area);
    for (const v of t) addQuadric(quadric[v], q);
  });
  // Open borders stay in place: a strong plane through each, across the surface.
  const edgeCount = new Map();
  tris.forEach((t, i) => { for (let k = 0; k < 3; k++) { const key = edgeKey(t[k], t[(k + 1) % 3]); if (!edgeCount.has(key)) edgeCount.set(key, []); edgeCount.get(key).push(i); } });
  for (const [key, owners] of edgeCount) {
    if (owners.length !== 1) continue;
    const [a, b] = key.split('_').map(Number);
    const t = tris[owners[0]];
    const plane = planeOf(verts[t[0]], verts[t[1]], verts[t[2]]);
    if (!plane) continue;
    const side = v3.cross(v3.sub(verts[b], verts[a]), plane.n);
    const len = v3.len(side);
    if (len < 1e-12) continue;
    const n = v3.mul(side, 1 / len);
    const q = planeQuadric(n, -v3.dot(n, verts[a]), len * len * 1000);
    addQuadric(quadric[a], q);
    addQuadric(quadric[b], q);
  }
  const neighbours = (v) => { const out = new Set(); for (const i of trisOf[v]) for (const u of tris[i]) if (u !== v) out.add(u); return out; };
  // A binary heap of candidates. An entry is stale when its vertices have changed since.
  const stamp = new Int32Array(verts.length);
  const heap = [];
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p].cost <= heap[i].cost) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const [l, r] = [i * 2 + 1, i * 2 + 2];
        let m = i;
        if (l < heap.length && heap[l].cost < heap[m].cost) m = l;
        if (r < heap.length && heap[r].cost < heap[m].cost) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const candidate = (a, b) => {
    const q = quadric[a].map((x, i) => x + quadric[b][i]);
    const p = bestPoint(q, verts[a], verts[b]);
    push({ a, b, p, cost: errorAt(q, p) + v3.dist(verts[a], verts[b]) * 1e-9, sa: stamp[a], sb: stamp[b] });
  };
  for (const key of edgeCount.keys()) { const [a, b] = key.split('_').map(Number); candidate(a, b); }
  const flips = (v, other, p) => {
    for (const i of trisOf[v]) {
      const t = tris[i];
      if (t.includes(other)) continue;
      const k = t.indexOf(v);
      const [u, w] = [verts[t[(k + 1) % 3]], verts[t[(k + 2) % 3]]];
      const before = v3.cross(v3.sub(u, verts[v]), v3.sub(w, verts[v]));
      const after = v3.cross(v3.sub(u, p), v3.sub(w, p));
      if (v3.len(after) < 1e-14 || v3.dot(before, after) <= 0.05 * v3.len(before) * v3.len(after)) return true;
    }
    return false;
  };
  let alive = tris.length;
  while (alive > target && heap.length) {
    const c = pop();
    if (c.sa !== stamp[c.a] || c.sb !== stamp[c.b]) continue;
    if (!trisOf[c.a].size || !trisOf[c.b].size) continue;
    const shared = [...trisOf[c.a]].filter((i) => trisOf[c.b].has(i));
    if (!shared.length) continue;
    // The link condition: the two may share only the vertices of the triangles on their edge, or the surface would pinch.
    const nb = neighbours(c.b);
    let common = 0;
    for (const u of neighbours(c.a)) if (nb.has(u)) common++;
    if (common !== shared.length) continue;
    if (flips(c.a, c.b, c.p) || flips(c.b, c.a, c.p)) continue;
    for (const i of shared) {
      for (const v of tris[i]) trisOf[v].delete(i);
      tris[i] = null;
      alive--;
    }
    for (const i of trisOf[c.b]) {
      tris[i][tris[i].indexOf(c.b)] = c.a;
      trisOf[c.a].add(i);
    }
    trisOf[c.b].clear();
    verts[c.a] = c.p;
    addQuadric(quadric[c.a], quadric[c.b]);
    stamp[c.a]++;
    stamp[c.b]++;
    for (const u of neighbours(c.a)) { stamp[u]++; }
    for (const u of neighbours(c.a)) {
      candidate(c.a, u);
      for (const w of neighbours(u)) if (w !== c.a && u < w) candidate(u, w);
    }
  }
  const out = createMesh(verts, tris.filter(Boolean));
  compact(out);
  return out;
}

/** Merges neighbouring faces that lie within `angle` degrees of each other into one face each. */
export function decimatePlanar(mesh, angle = 5) {
  const out = createMesh(mesh.verts.map((v) => [...v]), mesh.faces.map((f) => [...f]));
  const limit = Math.cos((angle * Math.PI) / 180);
  const normals = out.faces.map((f) => faceNormal(out, f));
  const edges = edgeMap(out);
  const group = out.faces.map((_, i) => i);
  const find = (i) => { while (group[i] !== i) { group[i] = group[group[i]]; i = group[i]; } return i; };
  const reference = new Map();
  for (const e of edges.values()) {
    if (e.faces.length !== 2) continue;
    const [p, q] = [find(e.faces[0]), find(e.faces[1])];
    if (p === q) continue;
    const [np, nq] = [reference.get(p) ?? normals[p], reference.get(q) ?? normals[q]];
    if (v3.dot(np, nq) >= limit) { group[q] = p; reference.set(p, np); }
  }
  // Each group becomes one polygon, when its outline is a single closed loop.
  const members = new Map();
  out.faces.forEach((_, i) => { const g = find(i); if (!members.has(g)) members.set(g, []); members.get(g).push(i); });
  const faces = [];
  for (const list of members.values()) {
    if (list.length === 1) { faces.push(out.faces[list[0]]); continue; }
    const inGroup = new Set(list);
    const next = new Map();
    let split = false;
    for (const f of list) {
      const face = out.faces[f];
      for (let i = 0; i < face.length; i++) {
        const [a, b] = [face[i], face[(i + 1) % face.length]];
        if (edges.get(edgeKey(a, b)).faces.filter((g) => inGroup.has(g)).length === 1) {
          if (next.has(a)) split = true;
          next.set(a, b);
        }
      }
    }
    const [start] = next.keys();
    const ring = [start];
    for (let v = next.get(start); v != null && v !== start && ring.length <= next.size; v = next.get(v)) ring.push(v);
    if (split || ring.length !== next.size || ring.length < 3) for (const f of list) faces.push(out.faces[f]);
    else faces.push(ring.filter((v, i) => {
      // Vertices left straight along an outline are of no use.
      const [p, n] = [ring[(i + ring.length - 1) % ring.length], ring[(i + 1) % ring.length]];
      const [d1, d2] = [v3.norm(v3.sub(out.verts[v], out.verts[p])), v3.norm(v3.sub(out.verts[n], out.verts[v]))];
      return v3.dot(d1, d2) < 0.99999;
    }));
  }
  out.faces = faces.filter((f) => f.length >= 3);
  compact(out);
  return out;
}

/** Projects vertices onto a target along an axis, for the Shrinkwrap modifier's Project mode: the nearest hit in the allowed directions. */
export function projectOntoMesh(verts, target, axis, { positive = true, negative = true, offset = 0 } = {}) {
  const tris = triangulateIndices(target).map((t) => t.map((i) => target.verts[i]));
  if (!tris.length) return verts.map((v) => [...v]);
  const a = 'XYZ'.indexOf(axis);
  const [u, w] = [(a + 1) % 3, (a + 2) % 3];
  // Triangles in a grid across the axis: each ray looks only in its own cell.
  let [minU, maxU, minW, maxW] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const t of tris) for (const p of t) { minU = Math.min(minU, p[u]); maxU = Math.max(maxU, p[u]); minW = Math.min(minW, p[w]); maxW = Math.max(maxW, p[w]); }
  const cells = Math.max(1, Math.ceil(Math.sqrt(tris.length)));
  const [su, sw] = [(maxU - minU || 1) / cells, (maxW - minW || 1) / cells];
  const grid = new Map();
  const cellKey = (i, j) => i * 100003 + j;
  tris.forEach((t, n) => {
    const [i0, i1] = [Math.floor((Math.min(...t.map((p) => p[u])) - minU) / su), Math.floor((Math.max(...t.map((p) => p[u])) - minU) / su)];
    const [j0, j1] = [Math.floor((Math.min(...t.map((p) => p[w])) - minW) / sw), Math.floor((Math.max(...t.map((p) => p[w])) - minW) / sw)];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = cellKey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); }
  });
  return verts.map((v) => {
    const list = grid.get(cellKey(Math.floor((v[u] - minU) / su), Math.floor((v[w] - minW) / sw))) ?? [];
    let best = null;
    let bestDist = Infinity;
    for (const n of list) {
      const [p, q, r] = tris[n];
      const d = (q[u] - p[u]) * (r[w] - p[w]) - (r[u] - p[u]) * (q[w] - p[w]);
      if (Math.abs(d) < 1e-14) continue;
      const l1 = ((v[u] - p[u]) * (r[w] - p[w]) - (r[u] - p[u]) * (v[w] - p[w])) / d;
      const l2 = ((q[u] - p[u]) * (v[w] - p[w]) - (v[u] - p[u]) * (q[w] - p[w])) / d;
      if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
      const h = p[a] + l1 * (q[a] - p[a]) + l2 * (r[a] - p[a]);
      const along = h - v[a];
      if ((along >= 0 && !positive) || (along < 0 && !negative)) continue;
      if (Math.abs(along) < bestDist) { bestDist = Math.abs(along); best = h + Math.sign(along || 1) * -offset; }
    }
    if (best == null) return [...v];
    const out = [...v];
    out[a] = best;
    return out;
  });
}
