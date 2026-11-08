// Polygon mesh: the data every modeling feature works on. Plain JSON-able data, no DOM, no three.js.
//
//   verts     [[x,y,z], …]
//   faces     [[i,j,k,…], …]  counter-clockwise seen from outside
//   loose     [[a,b], …]      edges without a face
//   uvs       per face, one [u,v] per corner (or null)
//   faceMat   per face, material slot index (or null)
//   colors    per vertex [r,g,b] (or null)
//   vgroups   [{ name, w: { vertIndex: weight } }]
//   shapeKeys [{ name, value, verts }]  (the mesh itself is the basis)
//   smooth    shade smooth
//   selV/selF selected vertex and face indices (edit mode); selMode 'vert' | 'edge' | 'face'
//   marks     { seam: {edgeKey:true}, sharp: {edgeKey:true}, crease: {edgeKey:0…1} } (or absent)
//   cornerNormals  custom split normals: per face, one [x,y,z] per corner (or absent)
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};

export function createMesh(verts = [], faces = [], extra = {}) {
  return { verts, faces, loose: [], uvs: null, faceMat: null, colors: null, vgroups: [], shapeKeys: [], smooth: false, selV: [], selF: [], selMode: 'vert', ...extra };
}

export const cloneMesh = (mesh) => structuredClone(mesh);

export const edgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** Every edge: Map key → { a, b, faces: [faceIndex…] } (loose edges have no faces). */
export function edgeMap(mesh) {
  const map = new Map();
  mesh.faces.forEach((face, f) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = edgeKey(a, b);
      let e = map.get(key);
      if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }; map.set(key, e); }
      e.faces.push(f);
    }
  });
  for (const [a, b] of mesh.loose ?? []) {
    const key = edgeKey(a, b);
    if (!map.has(key)) map.set(key, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
  }
  return map;
}

export function faceCenter(mesh, face) {
  const c = [0, 0, 0];
  for (const i of face) { c[0] += mesh.verts[i][0]; c[1] += mesh.verts[i][1]; c[2] += mesh.verts[i][2]; }
  return [c[0] / face.length, c[1] / face.length, c[2] / face.length];
}

/** Newell's method: works for concave and slightly non-planar polygons. */
export function faceNormal(mesh, face) {
  const n = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = mesh.verts[face[i]];
    const b = mesh.verts[face[(i + 1) % face.length]];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return v3.norm(n);
}

export function faceArea(mesh, face) {
  const n = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = mesh.verts[face[i]];
    const b = mesh.verts[face[(i + 1) % face.length]];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return v3.len(n) / 2;
}

export function vertexNormals(mesh) {
  const normals = mesh.verts.map(() => [0, 0, 0]);
  for (const face of mesh.faces) {
    const n = faceNormal(mesh, face);
    const area = faceArea(mesh, face);
    for (const i of face) { normals[i][0] += n[0] * area; normals[i][1] += n[1] * area; normals[i][2] += n[2] * area; }
  }
  return normals.map(v3.norm);
}

export function boundingBox(verts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
  return verts.length ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

/** Signed volume of a closed mesh (positive when the normals point outward). */
export function signedVolume(mesh) {
  let volume = 0;
  for (const tri of triangulateIndices(mesh)) {
    const [a, b, c] = [mesh.verts[tri[0]], mesh.verts[tri[1]], mesh.verts[tri[2]]];
    volume += v3.dot(a, v3.cross(b, c)) / 6;
  }
  return volume;
}

/** V − E + F; 2 for a closed mesh with no holes. */
export function eulerCharacteristic(mesh) {
  const used = new Set(mesh.faces.flat());
  for (const [a, b] of mesh.loose ?? []) { used.add(a); used.add(b); }
  return used.size - edgeMap(mesh).size + mesh.faces.length;
}

/** Every edge shared by exactly two faces, in opposite directions. */
export function isManifold(mesh) {
  const directed = new Map();
  for (const face of mesh.faces) {
    for (let i = 0; i < face.length; i++) {
      const key = `${face[i]}>${face[(i + 1) % face.length]}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of directed) {
    if (count !== 1) return false;
    const [a, b] = key.split('>');
    if (directed.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** Ear clipping for a polygon: index triples into `face`. Convex polygons stay a fan. */
export function triangulateFace(mesh, face) {
  if (face.length === 3) return [[0, 1, 2]];
  if (face.length === 4) {
    // Split a quad along the diagonal that keeps it convex.
    const [a, b, c, d] = face.map((i) => mesh.verts[i]);
    const n = faceNormal(mesh, face);
    const ac = v3.dot(v3.cross(v3.sub(c, a), v3.sub(b, a)), n) * v3.dot(v3.cross(v3.sub(c, a), v3.sub(d, a)), n);
    return ac <= 0 ? [[0, 1, 2], [0, 2, 3]] : [[1, 2, 3], [1, 3, 0]];
  }
  const n = faceNormal(mesh, face);
  const axis = Math.abs(n[2]) > Math.abs(n[0]) && Math.abs(n[2]) > Math.abs(n[1]) ? 2 : Math.abs(n[1]) > Math.abs(n[0]) ? 1 : 0;
  const [ux, uy] = axis === 2 ? [0, 1] : axis === 1 ? [2, 0] : [1, 2];
  const flip = n[axis] < 0 ? -1 : 1;
  const pts = face.map((i) => [mesh.verts[i][ux], mesh.verts[i][uy] * flip]);
  const area2 = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
  const inside = (p, a, b, c) => area2(a, b, p) >= -1e-12 && area2(b, c, p) >= -1e-12 && area2(c, a, p) >= -1e-12;
  const order = face.map((_, i) => i);
  const out = [];
  let guard = face.length * face.length;
  while (order.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const a = order[(i + order.length - 1) % order.length];
      const b = order[i];
      const c = order[(i + 1) % order.length];
      if (area2(a, b, c) <= 1e-14) continue;
      if (order.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (order.length === 3) out.push([order[0], order[1], order[2]]);
  else for (let i = 1; i < order.length - 1; i++) out.push([order[0], order[i], order[i + 1]]);
  return out;
}

export function triangulateIndices(mesh) {
  const out = [];
  for (const face of mesh.faces) for (const t of triangulateFace(mesh, face)) out.push([face[t[0]], face[t[1]], face[t[2]]]);
  return out;
}

/**
 * Flat arrays for drawing or ray tracing. `triFace[t]` = source face of triangle t. Smooth shading shares vertex
 * normals; flat shading gives each face its own.
 */
export function toTriangles(mesh) {
  const corners = mesh.cornerNormals ?? (mesh.smooth && hasMarks(mesh, 'sharp') ? splitNormals(mesh) : null);
  const vn = mesh.smooth && !corners ? vertexNormals(mesh) : null;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = mesh.colors ? [] : null;
  const triFace = [];
  const triMat = [];
  const cornerVerts = [];
  mesh.faces.forEach((face, f) => {
    const fn = vn ? null : faceNormal(mesh, face);
    for (const t of triangulateFace(mesh, face)) {
      for (const corner of t) {
        const i = face[corner];
        const p = mesh.verts[i];
        positions.push(p[0], p[1], p[2]);
        cornerVerts.push(i);
        const n = corners?.[f]?.[corner] ?? (vn ? vn[i] : fn);
        normals.push(n[0], n[1], n[2]);
        const uv = mesh.uvs?.[f]?.[corner];
        uvs.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
        if (colors) { const c = mesh.colors[i] ?? [1, 1, 1]; colors.push(c[0], c[1], c[2]); }
      }
      triFace.push(f);
      triMat.push(mesh.faceMat?.[f] ?? 0);
    }
  });
  return { positions, normals, uvs, colors, triFace, triMat, corners: cornerVerts };
}

// ─────────────── edge marks and split normals

export const hasMarks = (mesh, kind) => Object.keys(mesh.marks?.[kind] ?? {}).length > 0;
export const edgeMark = (mesh, kind, a, b) => mesh.marks?.[kind]?.[edgeKey(a, b)];

export function setEdgeMark(mesh, kind, a, b, value) {
  mesh.marks ??= {};
  mesh.marks[kind] ??= {};
  if (value) mesh.marks[kind][edgeKey(a, b)] = value;
  else delete mesh.marks[kind][edgeKey(a, b)];
}

/** Smooth normals per face corner that stop at sharp edges: corners meet only across edges that are not sharp. */
export function splitNormals(mesh) {
  const offset = [];
  let count = 0;
  for (const face of mesh.faces) { offset.push(count); count += face.length; }
  const parent = new Int32Array(count).map((_, i) => i);
  const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; } return r; };
  const corner = (f, v) => offset[f] + mesh.faces[f].indexOf(v);
  for (const e of edgeMap(mesh).values()) {
    if (e.faces.length !== 2 || edgeMark(mesh, 'sharp', e.a, e.b)) continue;
    const [f, g] = e.faces;
    if (f === g) continue;
    parent[find(corner(f, e.a))] = find(corner(g, e.a));
    parent[find(corner(f, e.b))] = find(corner(g, e.b));
  }
  const sum = new Map();
  mesh.faces.forEach((face, f) => {
    const n = v3.mul(faceNormal(mesh, face), faceArea(mesh, face));
    face.forEach((_, k) => {
      const root = find(offset[f] + k);
      const s = sum.get(root);
      if (s) { s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; } else sum.set(root, [...n]);
    });
  });
  return mesh.faces.map((face, f) => face.map((_, k) => v3.norm(sum.get(find(offset[f] + k)))));
}

/** The point of triangle abc nearest to p (Ericson, Real-Time Collision Detection). */
export function closestOnTriangle(p, a, b, c) {
  const ab = v3.sub(b, a);
  const ac = v3.sub(c, a);
  const ap = v3.sub(p, a);
  const d1 = v3.dot(ab, ap);
  const d2 = v3.dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = v3.sub(p, b);
  const d3 = v3.dot(ab, bp);
  const d4 = v3.dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return v3.add(a, v3.mul(ab, d1 / (d1 - d3)));
  const cp = v3.sub(p, c);
  const d5 = v3.dot(ab, cp);
  const d6 = v3.dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return v3.add(a, v3.mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return v3.add(b, v3.mul(v3.sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return v3.add(a, v3.add(v3.mul(ab, vb * denom), v3.mul(ac, vc * denom)));
}

// ─────────────── selection helpers

export const selVSet = (mesh) => new Set(mesh.selV ?? []);

/** Selected faces: explicit in face mode, otherwise every face whose vertices are all selected. */
export function selectedFaces(mesh) {
  if (mesh.selMode === 'face') return [...new Set(mesh.selF ?? [])].filter((f) => f < mesh.faces.length);
  const sel = selVSet(mesh);
  const out = [];
  mesh.faces.forEach((face, f) => { if (face.every((i) => sel.has(i))) out.push(f); });
  return out;
}

export function selectedEdges(mesh) {
  const sel = selVSet(mesh);
  const out = [];
  for (const e of edgeMap(mesh).values()) if (sel.has(e.a) && sel.has(e.b)) out.push(e);
  return out;
}

/** Sets the face selection and the vertices it covers. */
export function setFaceSelection(mesh, faces) {
  mesh.selF = [...new Set(faces)];
  mesh.selV = [...new Set(mesh.selF.flatMap((f) => mesh.faces[f] ?? []))];
}

export function selectAll(mesh) {
  mesh.selV = mesh.verts.map((_, i) => i);
  mesh.selF = mesh.faces.map((_, i) => i);
}

export function selectNone(mesh) {
  mesh.selV = [];
  mesh.selF = [];
}

export function selectionCenter(mesh) {
  const sel = mesh.selV ?? [];
  if (!sel.length) return [0, 0, 0];
  const c = [0, 0, 0];
  for (const i of sel) { c[0] += mesh.verts[i][0]; c[1] += mesh.verts[i][1]; c[2] += mesh.verts[i][2]; }
  return [c[0] / sel.length, c[1] / sel.length, c[2] / sel.length];
}

/** Removes vertices no face or loose edge uses and renumbers everything that refers to them. */
export function compact(mesh) {
  const used = new Set(mesh.faces.flat());
  for (const [a, b] of mesh.loose ?? []) { used.add(a); used.add(b); }
  return removeVerts(mesh, (i) => !used.has(i));
}

/** Drops the vertices `drop(i)` says, renumbering faces, edges, selection, groups, colours and shape keys. */
export function removeVerts(mesh, drop) {
  const remap = new Int32Array(mesh.verts.length).fill(-1);
  const verts = [];
  mesh.verts.forEach((v, i) => { if (!drop(i)) { remap[i] = verts.length; verts.push(v); } });
  if (verts.length === mesh.verts.length) return mesh;
  mesh.verts = verts;
  const keep = mesh.faces.map((face) => face.every((i) => remap[i] >= 0));
  filterFaces(mesh, (f) => keep[f]);
  mesh.faces = mesh.faces.map((face) => face.map((i) => remap[i]));
  mesh.loose = (mesh.loose ?? []).filter(([a, b]) => remap[a] >= 0 && remap[b] >= 0).map(([a, b]) => [remap[a], remap[b]]);
  mesh.selV = (mesh.selV ?? []).map((i) => remap[i]).filter((i) => i >= 0);
  if (mesh.colors) mesh.colors = mesh.colors.filter((_, i) => remap[i] >= 0);
  for (const group of mesh.vgroups ?? []) {
    const w = {};
    for (const [k, value] of Object.entries(group.w)) if (remap[k] >= 0) w[remap[k]] = value;
    group.w = w;
  }
  for (const key of mesh.shapeKeys ?? []) key.verts = key.verts.filter((_, i) => remap[i] >= 0);
  for (const kind of Object.keys(mesh.marks ?? {})) {
    const next = {};
    for (const [key, value] of Object.entries(mesh.marks[kind])) {
      const [a, b] = key.split('_').map(Number);
      if (remap[a] >= 0 && remap[b] >= 0) next[edgeKey(remap[a], remap[b])] = value;
    }
    mesh.marks[kind] = next;
  }
  return mesh;
}

/** Keeps faces `keep(f)` says, with their per-face data and selection. */
export function filterFaces(mesh, keep) {
  const remap = new Map();
  const faces = [];
  const uvs = mesh.uvs ? [] : null;
  const faceMat = mesh.faceMat ? [] : null;
  const cornerNormals = mesh.cornerNormals ? [] : null;
  mesh.faces.forEach((face, f) => {
    if (!keep(f)) return;
    remap.set(f, faces.length);
    faces.push(face);
    if (uvs) uvs.push(mesh.uvs[f] ?? null);
    if (faceMat) faceMat.push(mesh.faceMat[f] ?? 0);
    if (cornerNormals) cornerNormals.push(mesh.cornerNormals[f] ?? null);
  });
  mesh.faces = faces;
  mesh.uvs = uvs;
  mesh.faceMat = faceMat;
  if (cornerNormals) mesh.cornerNormals = cornerNormals;
  mesh.selF = (mesh.selF ?? []).filter((f) => remap.has(f)).map((f) => remap.get(f));
  return mesh;
}

/** Adds a face with the same material as `like`; its UVs are unset until unwrapped. Returns its index. */
export function addFace(mesh, face, like = null) {
  mesh.faces.push(face);
  if (mesh.uvs) mesh.uvs.push(null);
  if (mesh.faceMat) mesh.faceMat.push(like == null ? 0 : mesh.faceMat[like] ?? 0);
  if (mesh.cornerNormals) mesh.cornerNormals.push(null);
  return mesh.faces.length - 1;
}

/** Adds a vertex; per-vertex layers (colours, shape keys) take `like`'s value. Returns its index. */
export function addVert(mesh, position, like = null) {
  mesh.verts.push(position);
  if (mesh.colors) mesh.colors.push(like == null ? [1, 1, 1] : [...(mesh.colors[like] ?? [1, 1, 1])]);
  for (const key of mesh.shapeKeys ?? []) key.verts.push(like == null ? [...position] : [...(key.verts[like] ?? position)]);
  const index = mesh.verts.length - 1;
  if (like != null) for (const group of mesh.vgroups ?? []) if (group.w[like] != null) group.w[index] = group.w[like];
  return index;
}

// ─────────────── primitives (all centred on the origin)

export function planeMesh(size = 2) {
  const s = size / 2;
  const mesh = createMesh([[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0]], [[0, 1, 2, 3]]);
  mesh.uvs = [[[0, 0], [1, 0], [1, 1], [0, 1]]];
  return mesh;
}

export function cubeMesh(size = 2) {
  const s = size / 2;
  const verts = [[-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]];
  const faces = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const mesh = createMesh(verts, faces);
  mesh.uvs = faces.map(() => [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return mesh;
}

export function circleMesh(vertices = 32, radius = 1, fill = 'NOTHING') {
  const verts = [];
  for (let i = 0; i < vertices; i++) {
    const a = (i / vertices) * Math.PI * 2;
    verts.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);
  }
  const mesh = createMesh(verts, []);
  if (fill === 'NGON') mesh.faces.push(verts.map((_, i) => i));
  else if (fill === 'FAN') {
    verts.push([0, 0, 0]);
    for (let i = 0; i < vertices; i++) mesh.faces.push([vertices, i, (i + 1) % vertices]);
  } else mesh.loose = verts.map((_, i) => [i, (i + 1) % vertices]);
  return mesh;
}

export function gridMesh(xDiv = 10, yDiv = 10, size = 2) {
  const verts = [];
  const faces = [];
  const uvs = [];
  for (let y = 0; y <= yDiv; y++) {
    for (let x = 0; x <= xDiv; x++) verts.push([(x / xDiv - 0.5) * size, (y / yDiv - 0.5) * size, 0]);
  }
  const at = (x, y) => y * (xDiv + 1) + x;
  for (let y = 0; y < yDiv; y++) {
    for (let x = 0; x < xDiv; x++) {
      faces.push([at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)]);
      const [u0, u1, v0, v1] = [x / xDiv, (x + 1) / xDiv, y / yDiv, (y + 1) / yDiv];
      uvs.push([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  return createMesh(verts, faces, { uvs });
}

export function uvSphereMesh(segments = 32, rings = 16, radius = 1) {
  const verts = [[0, 0, radius]];
  for (let r = 1; r < rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      verts.push([Math.sin(phi) * Math.cos(theta) * radius, Math.sin(phi) * Math.sin(theta) * radius, Math.cos(phi) * radius]);
    }
  }
  const bottom = verts.length;
  verts.push([0, 0, -radius]);
  const at = (r, s) => 1 + (r - 1) * segments + ((s + segments) % segments);
  const faces = [];
  const uvs = [];
  for (let s = 0; s < segments; s++) {
    const [u0, u1] = [s / segments, (s + 1) / segments];
    const v1 = 1 - 1 / rings;
    faces.push([0, at(1, s), at(1, s + 1)]);
    uvs.push([[(u0 + u1) / 2, 1], [u0, v1], [u1, v1]]);
    for (let r = 1; r < rings - 1; r++) {
      faces.push([at(r, s), at(r + 1, s), at(r + 1, s + 1), at(r, s + 1)]);
      const [vt, vb] = [1 - r / rings, 1 - (r + 1) / rings];
      uvs.push([[u0, vt], [u0, vb], [u1, vb], [u1, vt]]);
    }
    faces.push([bottom, at(rings - 1, s + 1), at(rings - 1, s)]);
    uvs.push([[(u0 + u1) / 2, 0], [u1, 1 / rings], [u0, 1 / rings]]);
  }
  return createMesh(verts, faces, { uvs });
}

export function icoSphereMesh(subdivisions = 2, radius = 1) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => v3.mul(v3.norm(v), radius));
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let level = 1; level < subdivisions; level++) {
    const mid = new Map();
    const midpoint = (a, b) => {
      const key = edgeKey(a, b);
      if (!mid.has(key)) { verts.push(v3.mul(v3.norm(v3.add(verts[a], verts[b])), radius)); mid.set(key, verts.length - 1); }
      return mid.get(key);
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const [ab, bc, ca] = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return createMesh(verts, faces);
}

export function cylinderMesh(vertices = 32, radius = 1, depth = 2, caps = true, radiusTop = radius) {
  const verts = [];
  const h = depth / 2;
  for (let i = 0; i < vertices; i++) {
    const a = (i / vertices) * Math.PI * 2;
    verts.push([Math.cos(a) * radius, Math.sin(a) * radius, -h]);
  }
  const apex = radiusTop <= 1e-9;
  if (apex) verts.push([0, 0, h]);
  else for (let i = 0; i < vertices; i++) {
    const a = (i / vertices) * Math.PI * 2;
    verts.push([Math.cos(a) * radiusTop, Math.sin(a) * radiusTop, h]);
  }
  const faces = [];
  for (let i = 0; i < vertices; i++) {
    const j = (i + 1) % vertices;
    faces.push(apex ? [i, j, vertices] : [i, j, j + vertices, i + vertices]);
  }
  if (caps) {
    faces.push(Array.from({ length: vertices }, (_, i) => vertices - 1 - i));
    if (!apex) faces.push(Array.from({ length: vertices }, (_, i) => i + vertices));
  }
  return createMesh(verts, faces);
}

export const coneMesh = (vertices = 32, radius = 1, depth = 2) => cylinderMesh(vertices, radius, depth, true, 0);

export function torusMesh(major = 48, minor = 12, majorRadius = 1, minorRadius = 0.25) {
  const verts = [];
  const faces = [];
  const uvs = [];
  for (let i = 0; i < major; i++) {
    const a = (i / major) * Math.PI * 2;
    for (let j = 0; j < minor; j++) {
      const b = (j / minor) * Math.PI * 2;
      const r = majorRadius + minorRadius * Math.cos(b);
      verts.push([r * Math.cos(a), r * Math.sin(a), minorRadius * Math.sin(b)]);
    }
  }
  const at = (i, j) => ((i + major) % major) * minor + ((j + minor) % minor);
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      const [u0, u1, v0, v1] = [i / major, (i + 1) / major, j / minor, (j + 1) / minor];
      uvs.push([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  return createMesh(verts, faces, { uvs });
}

// ─────────────── UV projections

/** Box projection per face: the dominant axis of the face normal decides the plane. */
export function unwrapBox(mesh, scale = 0.5) {
  mesh.uvs = mesh.faces.map((face) => {
    const n = faceNormal(mesh, face);
    const a = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    const [ux, uy] = a[2] >= a[0] && a[2] >= a[1] ? [0, 1] : a[1] >= a[0] ? [0, 2] : [1, 2];
    return face.map((i) => [mesh.verts[i][ux] * scale + 0.5, mesh.verts[i][uy] * scale + 0.5]);
  });
  return mesh;
}

export function unwrapCylinder(mesh) {
  const box = boundingBox(mesh.verts);
  const h = box.max[2] - box.min[2] || 1;
  mesh.uvs = mesh.faces.map((face) => {
    const us = face.map((i) => (Math.atan2(mesh.verts[i][1], mesh.verts[i][0]) / (Math.PI * 2) + 1) % 1);
    const fix = Math.max(...us) - Math.min(...us) > 0.5;
    return face.map((i, k) => [fix && us[k] < 0.5 ? us[k] + 1 : us[k], (mesh.verts[i][2] - box.min[2]) / h]);
  });
  return mesh;
}

export function unwrapSphere(mesh) {
  mesh.uvs = mesh.faces.map((face) => {
    const us = face.map((i) => (Math.atan2(mesh.verts[i][1], mesh.verts[i][0]) / (Math.PI * 2) + 1) % 1);
    const fix = Math.max(...us) - Math.min(...us) > 0.5;
    return face.map((i, k) => {
      const v = mesh.verts[i];
      const r = v3.len(v) || 1;
      return [fix && us[k] < 0.5 ? us[k] + 1 : us[k], 1 - Math.acos(Math.max(-1, Math.min(1, v[2] / r))) / Math.PI];
    });
  });
  return mesh;
}

/** Packs per-face box projections into separate islands in the unit square (a simple "smart project"). */
export function unwrapSmart(mesh, margin = 0.01) {
  const cols = Math.ceil(Math.sqrt(mesh.faces.length || 1));
  const cell = 1 / cols;
  mesh.uvs = mesh.faces.map((face, f) => {
    const n = faceNormal(mesh, face);
    const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = v3.norm(v3.cross(ref, n));
    const w = v3.cross(n, u);
    const flat = face.map((i) => [v3.dot(mesh.verts[i], u), v3.dot(mesh.verts[i], w)]);
    const xs = flat.map((p) => p[0]);
    const ys = flat.map((p) => p[1]);
    const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
    const size = cell - margin * 2;
    const [ox, oy] = [(f % cols) * cell + margin, Math.floor(f / cols) * cell + margin];
    return flat.map((p) => [ox + ((p[0] - minX) / span) * size, oy + ((p[1] - minY) / span) * size]);
  });
  return mesh;
}
