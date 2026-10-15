// Faces, edges and vertices of a solid's triangle mesh — what FreeCAD calls a
// shape's sub-elements (Face1, Edge3, Vertex2): faces are the smooth regions
// (triangles joined across gentle bends), edges the creases between faces and
// the open borders, vertices the ends of edges. Each element has a signature
// (where it is and which way it faces) so a pick can be found again after the
// solid changes — the same idea as the picked fillet edges.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const round = (v) => +v.toFixed(6);

/**
 * Topology of triangles [[p, q, r], …] (world coordinates).
 * Returns { faceOf: Int32Array (face of each triangle), faces, edges, vertices }:
 *   faces:    [{ index, triangles, center, normal, area, planar }]
 *   edges:    [{ index, points, faces: [a, b], mid, dir, length }]
 *   vertices: [{ index, point }]
 */
export function meshTopology(triangles, { crease = 22 } = {}) {
  const n = triangles.length;
  const keyOf = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
  const points = [];
  const index = new Map();
  const pid = (p) => { const k = keyOf(p); if (!index.has(k)) { index.set(k, points.length); points.push(p); } return index.get(k); };
  const tri = triangles.map((t) => t.map(pid));
  const normals = triangles.map(([a, b, c]) => cross(sub(b, a), sub(c, a)));
  const areas = normals.map((v) => len(v) / 2);
  const units = normals.map(unit);
  // Triangle neighbours across each shared edge.
  const edgeTris = new Map();
  tri.forEach((t, i) => { for (let k = 0; k < 3; k++) { const a = t[k]; const b = t[(k + 1) % 3]; const e = a < b ? `${a}|${b}` : `${b}|${a}`; if (!edgeTris.has(e)) edgeTris.set(e, []); edgeTris.get(e).push(i); } });
  const cos = Math.cos((crease * Math.PI) / 180);
  // Faces: flood across edges whose two triangles bend less than the crease angle.
  const faceOf = new Int32Array(n).fill(-1);
  const faces = [];
  for (let seed = 0; seed < n; seed++) {
    if (faceOf[seed] >= 0 || areas[seed] < 1e-14) continue;
    const id = faces.length;
    const list = [seed];
    faceOf[seed] = id;
    for (let at = 0; at < list.length; at++) {
      const i = list[at];
      const t = tri[i];
      for (let k = 0; k < 3; k++) {
        const a = t[k]; const b = t[(k + 1) % 3];
        for (const j of edgeTris.get(a < b ? `${a}|${b}` : `${b}|${a}`)) {
          if (faceOf[j] >= 0 || areas[j] < 1e-14) continue;
          if (dot(units[i], units[j]) >= cos) { faceOf[j] = id; list.push(j); }
        }
      }
    }
    let area = 0; const c = [0, 0, 0]; const nn = [0, 0, 0]; let planar = true;
    for (const i of list) {
      area += areas[i];
      const [p, q, r] = triangles[i];
      for (let d = 0; d < 3; d++) { c[d] += ((p[d] + q[d] + r[d]) / 3) * areas[i]; nn[d] += normals[i][d] / 2; }
      if (dot(units[i], units[list[0]]) < 0.9999) planar = false;
    }
    faces.push({ index: id, triangles: list, center: c.map((v) => round(v / (area || 1))), normal: unit(nn).map(round), area, planar });
  }
  for (let i = 0; i < n; i++) if (faceOf[i] < 0) faceOf[i] = faces.length ? 0 : -1;
  // Edges: mesh edges between two faces (or on a border), chained into lines per pair of faces.
  const segments = new Map();
  for (const [e, list] of edgeTris) {
    const fs = [...new Set(list.map((i) => faceOf[i]))];
    if (list.length === 2 && fs.length === 1) continue;
    const key = fs.length === 1 ? `${fs[0]}|border` : fs.slice(0, 2).sort((x, y) => x - y).join('|');
    if (!segments.has(key)) segments.set(key, []);
    segments.get(key).push(e.split('|').map(Number));
  }
  const edges = [];
  const vertexCount = new Map();
  for (const [key, segs] of segments) {
    const ends = key.split('|');
    // Chain segments that share points into polylines.
    const byPoint = new Map();
    segs.forEach((s, i) => { for (const p of s) { if (!byPoint.has(p)) byPoint.set(p, []); byPoint.get(p).push(i); } });
    const used = new Set();
    for (let s = 0; s < segs.length; s++) {
      if (used.has(s)) continue;
      used.add(s);
      const chain = [...segs[s]];
      for (const forward of [true, false]) {
        for (;;) {
          const tip = forward ? chain[chain.length - 1] : chain[0];
          const next = (byPoint.get(tip) ?? []).find((i) => !used.has(i));
          if (next === undefined) break;
          used.add(next);
          const other = segs[next][0] === tip ? segs[next][1] : segs[next][0];
          if (forward) chain.push(other); else chain.unshift(other);
        }
      }
      const pts = chain.map((p) => points[p]);
      let length = 0;
      for (let i = 1; i < pts.length; i++) length += len(sub(pts[i], pts[i - 1]));
      if (length < 1e-9) continue;
      // The midpoint along the line and its direction there.
      let walked = 0; let mid = pts[0]; let dir = unit(sub(pts[pts.length - 1], pts[0]));
      for (let i = 1; i < pts.length; i++) {
        const step = len(sub(pts[i], pts[i - 1]));
        if (walked + step >= length / 2) { const t = (length / 2 - walked) / (step || 1); mid = pts[i - 1].map((v, d) => v + (pts[i][d] - v) * t); dir = unit(sub(pts[i], pts[i - 1])); break; }
        walked += step;
      }
      const closed = chain[0] === chain[chain.length - 1];
      if (!closed) for (const p of [chain[0], chain[chain.length - 1]]) vertexCount.set(p, (vertexCount.get(p) ?? 0) + 1);
      edges.push({ index: edges.length, points: pts, faces: ends[1] === 'border' ? [Number(ends[0])] : [Number(ends[0]), Number(ends[1])], mid: mid.map(round), dir: dir.map(round), length, closed });
    }
  }
  const vertices = [...vertexCount.keys()].map((p, i) => ({ index: i, point: points[p].map(round) }));
  return { faceOf, faces, edges, vertices };
}

/** The signature of an element, to find it again after the solid changes. */
export function elementSignature(topology, kind, index) {
  if (kind === 'face') { const f = topology.faces[index]; return f ? { center: f.center, normal: f.normal, area: +f.area.toFixed(6) } : null; }
  if (kind === 'edge') { const e = topology.edges[index]; return e ? { mid: e.mid, dir: e.dir, length: +e.length.toFixed(6) } : null; }
  const v = topology.vertices[index];
  return v ? { point: v.point } : null;
}

/** The element of a (changed) topology that best matches a signature, or -1. */
export function matchElement(topology, kind, signature) {
  if (!signature) return -1;
  let best = -1; let bestScore = Infinity;
  const list = kind === 'face' ? topology.faces : kind === 'edge' ? topology.edges : topology.vertices;
  list.forEach((item, i) => {
    let score;
    if (kind === 'face') score = len(sub(item.center, signature.center)) + 50 * (1 - dot(item.normal, signature.normal));
    else if (kind === 'edge') score = len(sub(item.mid, signature.mid)) + 50 * (1 - Math.abs(dot(item.dir, signature.dir)));
    else score = len(sub(item.point, signature.point));
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** FreeCAD's names of sub-elements: Face1, Edge2, Vertex3 (1-based). */
export const elementName = (kind, index) => `${kind === 'face' ? 'Face' : kind === 'edge' ? 'Edge' : 'Vertex'}${index + 1}`;
