// Mesh tools shared by the CSG and the file writers: shared vertices, planar
// faces (coplanar neighbouring triangles joined), and re-triangulation of
// planar regions (CSG output has many slivers on flat faces).
import { triangulate } from './triangulate.js';

/**
 * Groups triangles (vertex indices) into planar faces: neighbours whose
 * normals agree are joined; each face's boundary is chained into loops, the
 * largest first (outer), holes after. Returns [{ loops, normal, ref }].
 */
export function planarFaces(vertices, faces) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const normals = faces.map(([a, b, c]) => unit(cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a]))));
  const offsets = faces.map((face, i) => normals[i].reduce((sum, v, k) => sum + v * vertices[face[0]][k], 0));
  const parent = faces.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const byEdge = new Map();
  faces.forEach((face, i) => face.forEach((v, k) => byEdge.set(`${v},${face[(k + 1) % 3]}`, i)));
  const span = vertices.reduce((m, p) => Math.max(m, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])), 1);
  faces.forEach((face, i) => face.forEach((v, k) => {
    const j = byEdge.get(`${face[(k + 1) % 3]},${v}`);
    if (j === undefined) return;
    const dot = normals[i][0] * normals[j][0] + normals[i][1] * normals[j][1] + normals[i][2] * normals[j][2];
    if (dot > 1 - 1e-10 && Math.abs(offsets[i] - offsets[j]) < span * 1e-9) parent[find(i)] = find(j);
  }));
  const groups = new Map();
  faces.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const out = [];
  for (const members of groups.values()) {
    const normal = normals[members[0]];
    if (members.length === 1) {
      const face = faces[members[0]];
      out.push({ loops: [face], normal, ref: unit(sub(vertices[face[1]], vertices[face[0]])), members });
      continue;
    }
    const inGroup = new Set(members);
    const next = new Map();
    for (const i of members) faces[i].forEach((v, k) => {
      const w = faces[i][(k + 1) % 3];
      const j = byEdge.get(`${w},${v}`);
      if (j !== undefined && inGroup.has(j)) return;
      if (!next.has(v)) next.set(v, []);
      next.get(v).push(w);
    });
    // Where loops touch (two ways on from one vertex), turn the sharpest way clockwise,
    // so every loop stays simple (interior on its left).
    const helper = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const hd = helper[0] * normal[0] + helper[1] * normal[1] + helper[2] * normal[2];
    const ax = unit(helper.map((v, k) => v - hd * normal[k]));
    const ay = cross(normal, ax);
    const flat = (v) => [vertices[v][0] * ax[0] + vertices[v][1] * ax[1] + vertices[v][2] * ax[2], vertices[v][0] * ay[0] + vertices[v][1] * ay[1] + vertices[v][2] * ay[2]];
    const pick = (from, at, options) => {
      if (options.length === 1) return options.pop();
      const [fx, fy] = flat(from);
      const [cx, cy] = flat(at);
      const back = Math.atan2(fy - cy, fx - cx);
      let best = 0;
      let bestTurn = Infinity;
      options.forEach((w, k) => {
        const [wx, wy] = flat(w);
        let turn = back - Math.atan2(wy - cy, wx - cx);
        while (turn <= 1e-12) turn += 2 * Math.PI;
        if (turn < bestTurn) { bestTurn = turn; best = k; }
      });
      return options.splice(best, 1)[0];
    };
    const loops = [];
    for (const [start] of next) {
      while (next.get(start)?.length) {
        const loop = [start];
        let prevV = start;
        let v = next.get(start).pop();
        let guard = 0;
        while (v !== start && guard++ < 1e6) {
          loop.push(v);
          const options = next.get(v);
          if (!options?.length) break;
          const w = pick(prevV, v, options);
          prevV = v;
          v = w;
        }
        if (v === start && loop.length >= 3) loops.push(loop);
      }
    }
    if (!loops.length) {
      for (const i of members) out.push({ loops: [faces[i]], normal: normals[i], ref: unit(sub(vertices[faces[i][1]], vertices[faces[i][0]])), members: [i] });
      continue;
    }
    // Largest loop (by area in the face's plane) is the outer boundary.
    const area = (loop) => {
      let t = [0, 0, 0];
      for (let k = 0; k < loop.length; k++) t = t.map((x, m) => x + cross(vertices[loop[k]], vertices[loop[(k + 1) % loop.length]])[m]);
      return Math.abs(t[0] * normal[0] + t[1] * normal[1] + t[2] * normal[2]) / 2;
    };
    loops.sort((p, q) => area(q) - area(p));
    out.push({ loops, normal, ref: unit(sub(vertices[loops[0][1]], vertices[loops[0][0]])), members });
  }
  return out;
}


/** Shared vertices: { vertices, faces } (indices); degenerate triangles dropped. */
export function weldMesh(triangles, tolerance = 1e-6) {
  const vertices = [];
  const map = new Map();
  const faces = [];
  for (const tri of triangles) {
    const face = tri.map((p) => {
      const key = `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)},${Math.round(p[2] / tolerance)}`;
      let index = map.get(key);
      if (index === undefined) { index = vertices.length; vertices.push(p); map.set(key, index); }
      return index;
    });
    if (face[0] !== face[1] && face[1] !== face[2] && face[0] !== face[2]) faces.push(face);
  }
  return { vertices, faces };
}

/**
 * Fewer triangles, same solid: every planar region is triangulated again from
 * its boundary loops (all boundary vertices kept, so neighbours still match).
 */
export function simplifyMesh(triangles) {
  const { vertices, faces } = weldMesh(triangles);
  const out = [];
  for (const { loops, normal, members: regionFaces } of planarFaces(vertices, faces)) {
    if (loops.length === 1 && loops[0].length === 3) { out.push(loops[0].map((v) => vertices[v])); continue; }
    // A 2D frame in the plane.
    const helper = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const d = helper[0] * normal[0] + helper[1] * normal[1] + helper[2] * normal[2];
    let u = helper.map((v, k) => v - d * normal[k]);
    const lu = Math.hypot(...u);
    u = u.map((v) => v / lu);
    const w = [normal[1] * u[2] - normal[2] * u[1], normal[2] * u[0] - normal[0] * u[2], normal[0] * u[1] - normal[1] * u[0]];
    const to2 = (v) => ({ x: vertices[v][0] * u[0] + vertices[v][1] * u[1] + vertices[v][2] * u[2], y: vertices[v][0] * w[0] + vertices[v][1] * w[1] + vertices[v][2] * w[2], v });
    const [outer, ...holes] = loops.map((loop) => loop.map(to2));
    const tris = triangulate(outer, holes);
    // Triangulation must cover the region; otherwise keep the original triangles.
    const regionArea = (loop) => { let a = 0; for (let i = 0; i < loop.length; i++) { const p = loop[i]; const q = loop[(i + 1) % loop.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; };
    const want = regionArea(outer) - holes.reduce((sum, hole) => sum + regionArea(hole), 0);
    const got = tris.reduce((sum, tri) => sum + regionArea(tri), 0);
    if (!tris.length || Math.abs(got - want) > Math.max(1e-9, want * 1e-6)) {
      // This region could not be redone: keep its own triangles.
      for (const f of regionFaces) out.push(faces[f].map((v) => vertices[v]));
      continue;
    }
    // triangulate() gives counter-clockwise triangles in (u, w), i.e. facing +normal.
    for (const tri of tris) out.push(tri.map((q) => vertices[q.v]));
  }
  return out;
}

/**
 * Merges the two ends of every edge shorter than `minLength` (left over by
 * splitting planes that nearly touch) and drops the triangles that collapse.
 */
export function collapseShortEdges(triangles, minLength = 1e-4) {
  const { vertices, faces } = weldMesh(triangles);
  const parent = vertices.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  let merged = 0;
  for (const face of faces) {
    for (let k = 0; k < 3; k++) {
      const a = find(face[k]);
      const b = find(face[(k + 1) % 3]);
      if (a === b) continue;
      const p = vertices[a];
      const q = vertices[b];
      if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < minLength) { parent[b] = a; merged++; }
    }
  }
  if (!merged) return triangles;
  const out = [];
  for (const face of faces) {
    const f = face.map(find);
    if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2]) out.push(f.map((v) => vertices[v]));
  }
  return out;
}
