// Edit-mode operations on the selected part of a mesh. Each changes the mesh in place and leaves the new geometry
// selected, the way a modeling tool expects to carry on with it.
import {
  addFace, addVert, compact, createMesh, edgeKey, edgeMap, faceCenter, faceNormal, filterFaces, isManifold, removeVerts,
  selVSet, selectAll, selectNone, selectedEdges, selectedFaces, setEdgeMark, setFaceSelection, signedVolume, splitNormals, triangulateFace, v3, vertexNormals,
} from './mesh.js';

// ─────────────── extrude

/** Extrudes the selected faces as one region (plus selected edges and lone vertices) by `offset` along the normal. */
export function extrudeRegion(mesh, offset = 1, direction = null) {
  const faces = selectedFaces(mesh);
  const faceSet = new Set(faces);
  const sel = selVSet(mesh);
  const edges = edgeMap(mesh);
  let normal = [0, 0, 0];
  for (const f of faces) normal = v3.add(normal, faceNormal(mesh, mesh.faces[f]));
  normal = v3.norm(normal);
  const dup = new Map();
  const dupOf = (i) => {
    if (!dup.has(i)) dup.set(i, addVert(mesh, [...mesh.verts[i]], i));
    return dup.get(i);
  };
  // Side walls: edges with exactly one selected face.
  for (const f of faces) {
    const face = mesh.faces[f];
    for (let i = 0; i < face.length; i++) {
      const [a, b] = [face[i], face[(i + 1) % face.length]];
      const inRegion = edges.get(edgeKey(a, b)).faces.filter((g) => faceSet.has(g)).length;
      if (inRegion === 1) addFace(mesh, [a, b, dupOf(b), dupOf(a)], f);
    }
  }
  for (const f of faces) mesh.faces[f] = mesh.faces[f].map(dupOf);
  // Selected edges that belong to no selected face grow a wall, lone vertices grow an edge.
  const covered = new Set(faces.flatMap((f) => mesh.faces[f]));
  const inFace = new Set(dup.keys());
  const wireNormal = [];
  for (const e of edges.values()) {
    if (!sel.has(e.a) || !sel.has(e.b)) continue;
    if (e.faces.some((g) => faceSet.has(g))) continue;
    if (inFace.has(e.a) && inFace.has(e.b)) continue;
    addFace(mesh, [e.a, e.b, dupOf(e.b), dupOf(e.a)]);
    mesh.loose = (mesh.loose ?? []).filter(([p, q]) => edgeKey(p, q) !== edgeKey(e.a, e.b));
    wireNormal.push(e);
  }
  for (const i of sel) {
    if (dup.has(i)) continue;
    const j = dupOf(i);
    (mesh.loose ??= []).push([i, j]);
  }
  void covered;
  const dir = direction ?? (faces.length ? normal : [0, 0, 1]);
  for (const j of dup.values()) mesh.verts[j] = v3.add(mesh.verts[j], v3.mul(dir, offset));
  mesh.selV = [...dup.values()];
  mesh.selF = faces;
  // Vertices left inside a closed region are no longer used by anything.
  compactKeepingFaceSelection(mesh);
  return mesh;
}

/** Each selected face extruded on its own, along its own normal. */
export function extrudeIndividual(mesh, offset = 1) {
  const faces = selectedFaces(mesh);
  const tops = [];
  for (const f of faces) {
    const face = mesh.faces[f];
    const n = faceNormal(mesh, face);
    const ring = face.map((i) => addVert(mesh, v3.add(mesh.verts[i], v3.mul(n, offset)), i));
    for (let i = 0; i < face.length; i++) {
      const k = (i + 1) % face.length;
      addFace(mesh, [face[i], face[k], ring[k], ring[i]], f);
    }
    mesh.faces[f] = ring;
    tops.push(f);
  }
  setFaceSelection(mesh, tops);
  compactKeepingFaceSelection(mesh);
  return mesh;
}

function compactKeepingFaceSelection(mesh) {
  compact(mesh);
  if (mesh.selMode === 'face') mesh.selV = [...new Set((mesh.selF ?? []).flatMap((f) => mesh.faces[f] ?? []))];
  return mesh;
}

// ─────────────── inset, poke, triangulate

/** Inset of each selected face: `thickness` towards its centre, `depth` along its normal. */
export function insetFaces(mesh, thickness = 0.1, depth = 0) {
  const faces = selectedFaces(mesh);
  const inner = [];
  for (const f of faces) {
    const face = mesh.faces[f];
    const center = faceCenter(mesh, face);
    const n = faceNormal(mesh, face);
    const ring = face.map((i) => {
      const toCenter = v3.sub(center, mesh.verts[i]);
      const d = v3.len(toCenter) || 1;
      const t = Math.min(0.95, thickness / d);
      return addVert(mesh, v3.add(v3.add(mesh.verts[i], v3.mul(toCenter, t)), v3.mul(n, depth)), i);
    });
    for (let i = 0; i < face.length; i++) {
      const k = (i + 1) % face.length;
      addFace(mesh, [face[i], face[k], ring[k], ring[i]], f);
    }
    mesh.faces[f] = ring;
    inner.push(f);
  }
  setFaceSelection(mesh, inner);
  return mesh;
}

/** A vertex in the middle of each selected face, joined to its corners. */
export function pokeFaces(mesh, offset = 0) {
  const faces = selectedFaces(mesh);
  const remove = new Set(faces);
  for (const f of faces) {
    const face = mesh.faces[f];
    const c = addVert(mesh, v3.add(faceCenter(mesh, face), v3.mul(faceNormal(mesh, face), offset)));
    for (let i = 0; i < face.length; i++) addFace(mesh, [face[i], face[(i + 1) % face.length], c], f);
  }
  filterFaces(mesh, (f) => !remove.has(f));
  return mesh;
}

export function triangulateFaces(mesh) {
  const faces = new Set(selectedFaces(mesh));
  const made = [];
  for (const f of faces) {
    const face = mesh.faces[f];
    if (face.length === 3) continue;
    for (const t of triangulateFace(mesh, face)) made.push([t.map((c) => face[c]), f]);
  }
  const done = new Set(made.map(([, f]) => f));
  const first = mesh.faces.length;
  for (const [tri, f] of made) addFace(mesh, tri, f);
  const count = mesh.faces.length;
  filterFaces(mesh, (f) => !done.has(f));
  const added = count - first;
  setFaceSelection(mesh, Array.from({ length: added }, (_, i) => mesh.faces.length - added + i));
  return mesh;
}

/** Joins pairs of neighbouring triangles into quads when the crease between them is under `maxAngle` degrees. */
export function trisToQuads(mesh, maxAngle = 40) {
  const faces = selectedFaces(mesh).filter((f) => mesh.faces[f].length === 3);
  const allowed = new Set(faces);
  const used = new Set();
  const edges = edgeMap(mesh);
  const candidates = [];
  for (const e of edges.values()) {
    if (e.faces.length !== 2 || !allowed.has(e.faces[0]) || !allowed.has(e.faces[1])) continue;
    const dot = v3.dot(faceNormal(mesh, mesh.faces[e.faces[0]]), faceNormal(mesh, mesh.faces[e.faces[1]]));
    const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    if (angle <= maxAngle) candidates.push({ e, angle });
  }
  candidates.sort((p, q) => p.angle - q.angle);
  const remove = new Set();
  for (const { e } of candidates) {
    const [f, g] = e.faces;
    if (used.has(f) || used.has(g)) continue;
    used.add(f); used.add(g);
    const tri = mesh.faces[f];
    const other = mesh.faces[g].find((i) => i !== e.a && i !== e.b);
    const i = tri.findIndex((v, k) => edgeKey(v, tri[(k + 1) % 3]) === edgeKey(e.a, e.b));
    mesh.faces[f] = [tri[i], other, tri[(i + 1) % 3], tri[(i + 2) % 3]];
    remove.add(g);
  }
  filterFaces(mesh, (f) => !remove.has(f));
  return mesh;
}

// ─────────────── subdivide, loop cut, bisect

/** Splits each selected face into quads around its centre; neighbours take the new edge midpoints. */
export function subdivideFaces(mesh, cuts = 1) {
  for (let c = 0; c < cuts; c++) {
    const faces = selectedFaces(mesh);
    const set = new Set(faces);
    const mids = new Map();
    const mid = (a, b) => {
      const key = edgeKey(a, b);
      if (!mids.has(key)) mids.set(key, addVert(mesh, v3.lerp(mesh.verts[a], mesh.verts[b], 0.5), a));
      return mids.get(key);
    };
    const made = [];
    for (const f of faces) {
      const face = mesh.faces[f];
      const center = addVert(mesh, faceCenter(mesh, face));
      const n = face.length;
      if (n === 3) {
        const [ab, bc, ca] = [mid(face[0], face[1]), mid(face[1], face[2]), mid(face[2], face[0])];
        made.push([[face[0], ab, ca], f], [[face[1], bc, ab], f], [[face[2], ca, bc], f], [[ab, bc, ca], f]);
        mesh.verts.pop();
        if (mesh.colors) mesh.colors.pop();
        for (const key of mesh.shapeKeys ?? []) key.verts.pop();
      } else {
        for (let i = 0; i < n; i++) {
          made.push([[face[i], mid(face[i], face[(i + 1) % n]), center, mid(face[(i + n - 1) % n], face[i])], f]);
        }
      }
    }
    // Neighbours pick up the midpoints on their shared edges.
    mesh.faces.forEach((face, f) => {
      if (set.has(f)) return;
      const out = [];
      for (let i = 0; i < face.length; i++) {
        out.push(face[i]);
        const key = edgeKey(face[i], face[(i + 1) % face.length]);
        if (mids.has(key)) out.push(mids.get(key));
      }
      mesh.faces[f] = out;
      if (mesh.uvs?.[f] && out.length !== face.length) mesh.uvs[f] = null;
    });
    const first = mesh.faces.length;
    for (const [face, f] of made) addFace(mesh, face, f);
    const count = made.length;
    filterFaces(mesh, (f) => !set.has(f));
    const start = mesh.faces.length - count;
    void first;
    setFaceSelection(mesh, Array.from({ length: count }, (_, i) => start + i));
  }
  return mesh;
}

/** The edges across a strip of quads, starting at edge (a, b). */
export function edgeRing(mesh, a, b) {
  const edges = edgeMap(mesh);
  const start = edgeKey(a, b);
  const seen = new Set([start]);
  const quads = new Map();
  const walk = (key) => {
    let current = key;
    for (;;) {
      const e = edges.get(current);
      if (!e) return;
      const nextFace = e.faces.find((f) => !quads.has(f) && mesh.faces[f].length === 4);
      if (nextFace == null) return;
      const face = mesh.faces[nextFace];
      const i = face.findIndex((v, k) => edgeKey(v, face[(k + 1) % 4]) === current);
      const opposite = edgeKey(face[(i + 2) % 4], face[(i + 3) % 4]);
      quads.set(nextFace, i);
      if (seen.has(opposite)) return;
      seen.add(opposite);
      current = opposite;
    }
  };
  walk(start);
  walk(start);
  return { edges: seen, quads };
}

/** Cuts the ring of quads through edge (a, b) with `cuts` new edge loops, slid by `slide` (−1…1). */
export function loopCut(mesh, a, b, cuts = 1, slide = 0) {
  const { edges, quads } = edgeRing(mesh, a, b);
  // One orientation per edge, so the cuts line up all the way round.
  const points = new Map();
  const cutAt = (p, q) => {
    const key = edgeKey(p, q);
    if (!points.has(key)) {
      const low = Math.min(p, q);
      const high = Math.max(p, q);
      points.set(key, { low, list: Array.from({ length: cuts }, (_, i) => {
        const t = Math.max(0.02, Math.min(0.98, (i + 1) / (cuts + 1) + (slide * 0.5) / (cuts + 1)));
        return addVert(mesh, v3.lerp(mesh.verts[low], mesh.verts[high], t), low);
      }) });
    }
    const { low, list } = points.get(key);
    return p === low ? list : [...list].reverse();
  };
  const made = [];
  const newLoopVerts = new Set();
  for (const [f, i] of quads) {
    const face = mesh.faces[f];
    const [p, q, r, s] = [face[i], face[(i + 1) % 4], face[(i + 2) % 4], face[(i + 3) % 4]];
    // p→q and r→s are the cut edges; strips run from side s-p to side q-r.
    const top = cutAt(p, q);
    const bottom = cutAt(s, r);
    let [left1, left2] = [p, s];
    for (let k = 0; k < cuts; k++) {
      made.push([[left1, top[k], bottom[k], left2], f]);
      [left1, left2] = [top[k], bottom[k]];
      newLoopVerts.add(top[k]); newLoopVerts.add(bottom[k]);
    }
    made.push([[left1, q, r, left2], f]);
  }
  // Other faces on a ring edge (a triangle ending the ring) take the new vertices.
  mesh.faces.forEach((face, f) => {
    if (quads.has(f)) return;
    const out = [];
    for (let i = 0; i < face.length; i++) {
      const [p, q] = [face[i], face[(i + 1) % face.length]];
      out.push(p);
      if (edges.has(edgeKey(p, q)) && points.has(edgeKey(p, q))) out.push(...cutAt(p, q));
    }
    mesh.faces[f] = out;
  });
  const remove = new Set(quads.keys());
  for (const [face, f] of made) addFace(mesh, face, f);
  filterFaces(mesh, (f) => !remove.has(f));
  mesh.selV = [...newLoopVerts];
  mesh.selF = [];
  return mesh;
}

/** Cuts the selected faces (all when `faces` is null) with a plane; `clear` removes one side ('INNER' | 'OUTER'). */
export function bisect(mesh, point, normal, { clear = null, fill = false, faces = null } = {}) {
  const n = v3.norm(normal);
  const dist = (p) => v3.dot(v3.sub(p, point), n);
  const onlyFaces = faces ? new Set(faces) : null;
  const cuts = new Map();
  const cut = (a, b) => {
    const key = edgeKey(a, b);
    if (!cuts.has(key)) {
      const [da, db] = [dist(mesh.verts[a]), dist(mesh.verts[b])];
      cuts.set(key, addVert(mesh, v3.lerp(mesh.verts[a], mesh.verts[b], da / (da - db)), a));
    }
    return cuts.get(key);
  };
  const eps = 1e-7;
  const count = mesh.faces.length;
  const remove = new Set();
  const chain = [];
  for (let f = 0; f < count; f++) {
    if (onlyFaces && !onlyFaces.has(f)) continue;
    const face = mesh.faces[f];
    const d = face.map((i) => dist(mesh.verts[i]));
    const above = [];
    const below = [];
    const onPlane = [];
    for (let i = 0; i < face.length; i++) {
      const j = (i + 1) % face.length;
      const vi = face[i];
      if (d[i] >= -eps) above.push(vi);
      if (d[i] <= eps) below.push(vi);
      if (Math.abs(d[i]) <= eps) onPlane.push(vi);
      if ((d[i] > eps && d[j] < -eps) || (d[i] < -eps && d[j] > eps)) {
        const m = cut(vi, face[j]);
        above.push(m); below.push(m); onPlane.push(m);
      }
    }
    if (onPlane.length === 2) chain.push(onPlane);
    const crosses = d.some((x) => x > eps) && d.some((x) => x < -eps);
    if (!crosses) {
      if ((clear === 'OUTER' && d.some((x) => x > eps)) || (clear === 'INNER' && d.some((x) => x < -eps))) remove.add(f);
      continue;
    }
    remove.add(f);
    if (above.length >= 3 && clear !== 'OUTER') addFace(mesh, above, f);
    if (below.length >= 3 && clear !== 'INNER') addFace(mesh, below, f);
  }
  // Faces added above the original count stay; originals in `remove` go.
  // Neighbouring faces outside `faces` still need the new vertices on their edges.
  if (onlyFaces) {
    for (let f = 0; f < count; f++) {
      if (onlyFaces.has(f)) continue;
      const face = mesh.faces[f];
      const out = [];
      for (let i = 0; i < face.length; i++) {
        out.push(face[i]);
        const m = cuts.get(edgeKey(face[i], face[(i + 1) % face.length]));
        if (m != null) out.push(m);
      }
      mesh.faces[f] = out;
    }
  }
  filterFaces(mesh, (f) => !remove.has(f));
  // Vertices the plane passed exactly through have to count as part of the cut too.
  const cutVerts = [...new Set(chain.flat())];
  if (fill && cutVerts.length >= 3) {
    const center = cutVerts.reduce((c, i) => v3.add(c, v3.mul(mesh.verts[i], 1 / cutVerts.length)), [0, 0, 0]);
    const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = v3.norm(v3.cross(ref, n));
    const w = v3.cross(n, u);
    const angle = (i) => { const p = v3.sub(mesh.verts[i], center); return Math.atan2(v3.dot(p, w), v3.dot(p, u)); };
    const ring = [...cutVerts].sort((p, q) => angle(p) - angle(q));
    // Ascending angle round n faces +n: what stays below the plane is capped facing up, and the other way round.
    addFace(mesh, clear === 'OUTER' ? ring : [...ring].reverse());
  }
  compact(mesh);
  mesh.selV = [];
  mesh.selF = [];
  return mesh;
}

// ─────────────── bevel

/**
 * Bevels the selected manifold edges by `width`. Every corner of a face at a beveled vertex is replaced by the new
 * vertices of that corner: slid along the unselected edge next to it, or along the bisector when both edges there are
 * selected. Then each beveled edge gets a strip of `segments` quads, curved by `profile` (0.5 is round, 0 flat, 1 sharp towards the old
 * edge), and each vertex with three or more new vertices a cap.
 */
export function bevelEdges(mesh, width = 0.1, { segments = 1, profile = 0.5 } = {}) {
  const edges = edgeMap(mesh);
  const sel = new Set();
  for (const e of selectedEdges(mesh)) {
    if (e.faces.length === 2) sel.add(edgeKey(e.a, e.b));
  }
  if (!sel.size) return mesh;
  const isSel = (a, b) => sel.has(edgeKey(a, b));
  const touched = new Set([...sel].flatMap((key) => key.split('_').map(Number)));
  const dirTo = (v, u) => v3.norm(v3.sub(mesh.verts[u], mesh.verts[v]));
  // An edge can be no shorter than twice the bevel, or the two sides would cross.
  let w = width;
  for (const key of sel) {
    const [a, b] = key.split('_').map(Number);
    for (const v of [a, b]) {
      for (const e of edges.values()) {
        if (e.a !== v && e.b !== v) continue;
        const u = e.a === v ? e.b : e.a;
        if (!isSel(v, u)) w = Math.min(w, v3.dist(mesh.verts[v], mesh.verts[u]) * 0.48);
      }
    }
  }
  const slides = new Map();
  const slide = (v, u) => {
    const key = `${v}>${u}`;
    if (!slides.has(key)) slides.set(key, addVert(mesh, v3.add(mesh.verts[v], v3.mul(dirTo(v, u), w)), v));
    return slides.get(key);
  };
  const faceCount = mesh.faces.length;
  const replacement = new Map();
  // First pass: which unselected edges at a touched vertex are next to a selected edge?
  const needsSlide = new Set();
  for (let f = 0; f < faceCount; f++) {
    const face = mesh.faces[f];
    for (let i = 0; i < face.length; i++) {
      const [p, v, n] = [face[(i + face.length - 1) % face.length], face[i], face[(i + 1) % face.length]];
      if (!touched.has(v)) continue;
      if (isSel(v, p) && !isSel(v, n)) needsSlide.add(`${v}>${n}`);
      if (isSel(v, n) && !isSel(v, p)) needsSlide.add(`${v}>${p}`);
    }
  }
  const out = [];
  for (let f = 0; f < faceCount; f++) {
    const face = mesh.faces[f];
    const m = face.length;
    const ring = [];
    for (let i = 0; i < m; i++) {
      const [p, v, n] = [face[(i + m - 1) % m], face[i], face[(i + 1) % m]];
      let list;
      if (!touched.has(v)) list = [v];
      else if (isSel(v, p) && isSel(v, n)) {
        const [d1, d2] = [dirTo(v, p), dirTo(v, n)];
        const bis = v3.norm(v3.add(d1, d2));
        const half = Math.acos(Math.max(-1, Math.min(1, v3.dot(d1, d2)))) / 2;
        const len = w / Math.max(0.2, Math.sin(half));
        list = [addVert(mesh, v3.add(mesh.verts[v], v3.mul(bis, len)), v)];
      } else if (isSel(v, p)) list = [slide(v, n)];
      else if (isSel(v, n)) list = [slide(v, p)];
      else {
        list = [];
        if (needsSlide.has(`${v}>${p}`)) list.push(slide(v, p));
        if (needsSlide.has(`${v}>${n}`)) list.push(slide(v, n));
        if (!list.length) list = [v];
      }
      replacement.set(`${f}:${v}`, list);
      ring.push(...list);
    }
    out.push(ring);
  }
  const quads = [];
  for (const key of sel) {
    const e = edges.get(key);
    const [f, g] = e.faces;
    const faceF = mesh.faces[f];
    const i = faceF.findIndex((v, k) => edgeKey(v, faceF[(k + 1) % faceF.length]) === key);
    const [a, b] = [faceF[i], faceF[(i + 1) % faceF.length]];
    const x = replacement.get(`${f}:${a}`).at(-1);
    const y = replacement.get(`${f}:${b}`)[0];
    const p = replacement.get(`${g}:${b}`).at(-1);
    const q = replacement.get(`${g}:${a}`)[0];
    quads.push([[y, x, q, p], f, a, b]);
  }
  // Caps: the new vertices around a vertex, in fan order.
  const caps = [];
  for (const v of touched) {
    const corners = [];
    for (let f = 0; f < faceCount; f++) if (mesh.faces[f].includes(v)) corners.push(f);
    const start = corners[0];
    if (start == null) continue;
    const order = [];
    let f = start;
    let guard = corners.length + 2;
    do {
      order.push(f);
      const face = mesh.faces[f];
      const i = face.indexOf(v);
      const prev = face[(i + face.length - 1) % face.length];
      const nextFace = edges.get(edgeKey(v, prev)).faces.find((g) => g !== f);
      if (nextFace == null) break;
      f = nextFace;
    } while (f !== start && guard-- > 0);
    if (order.length !== corners.length) continue;
    const seq = [];
    for (const g of order) {
      const list = replacement.get(`${g}:${v}`);
      for (let k = list.length - 1; k >= 0; k--) if (seq.at(-1) !== list[k] && seq[0] !== list[k]) seq.push(list[k]);
    }
    if (seq.length >= 3) caps.push([seq.reverse(), order[0], v]);
  }
  mesh.faces = out.concat(mesh.faces.slice(faceCount));
  if (mesh.uvs) mesh.uvs = mesh.uvs.map((uv, f) => (uv && out[f] && uv.length === out[f].length ? uv : null));
  const first = mesh.faces.length;
  // The points between two new vertices at an old corner, along the curve. Strips and caps that meet there share them.
  const rails = new Map();
  const rail = (from, to, corner) => {
    const key = edgeKey(from, to);
    if (!rails.has(key)) {
      const list = [from];
      const middle = v3.lerp(mesh.verts[from], mesh.verts[to], 0.5);
      const control = v3.add(middle, v3.mul(v3.sub(mesh.verts[corner], middle), Math.max(0, Math.min(1, profile)) * 2));
      for (let i = 1; i < segments; i++) {
        const k = i / segments;
        const point = v3.add(v3.add(v3.mul(mesh.verts[from], (1 - k) * (1 - k)), v3.mul(control, 2 * k * (1 - k))), v3.mul(mesh.verts[to], k * k));
        list.push(addVert(mesh, point, corner));
      }
      list.push(to);
      rails.set(key, list);
    }
    const list = rails.get(key);
    return list[0] === from ? list : [...list].reverse();
  };
  for (const [[y, x, q, p], f, a, b] of quads) {
    if (segments <= 1) { addFace(mesh, [y, x, q, p], f); continue; }
    const [atA, atB] = [rail(x, q, a), rail(y, p, b)];
    for (let i = 0; i < segments; i++) addFace(mesh, [atB[i], atA[i], atA[i + 1], atB[i + 1]], f);
  }
  const widen = (face) => {
    if (segments <= 1) return face;
    const ring = [];
    face.forEach((v, i) => {
      ring.push(v);
      const list = rails.get(edgeKey(v, face[(i + 1) % face.length]));
      if (list) ring.push(...(list[0] === v ? list.slice(1, -1) : [...list].reverse().slice(1, -1)));
    });
    return ring;
  };
  for (const [face, f, v] of caps) {
    // A cap faces away from the middle of the mesh at that vertex.
    const center = faceCenter(mesh, face);
    const outward = v3.sub(mesh.verts[v], center);
    const fixed = widen(v3.dot(faceNormal(mesh, face), outward) < 0 ? [...face].reverse() : face);
    if (segments <= 1) { addFace(mesh, fixed, f); continue; }
    // Rounded: a fan around a point pushed out towards the old corner.
    const c = addVert(mesh, v3.add(center, v3.mul(v3.sub(mesh.verts[v], center), Math.max(0, Math.min(1, profile)) * 0.9)), v);
    // Quads where the ring allows it, as Blender makes them.
    if (fixed.length % 2 === 0) for (let i = 0; i < fixed.length; i += 2) addFace(mesh, [fixed[i], fixed[i + 1], fixed[(i + 2) % fixed.length], c], f);
    else fixed.forEach((u, i) => addFace(mesh, [u, fixed[(i + 1) % fixed.length], c], f));
  }
  // Faces around the strips take the new points too, so that nothing is left open.
  if (segments > 1) for (let f = 0; f < first; f++) { mesh.faces[f] = widen(mesh.faces[f]); if (mesh.uvs) mesh.uvs[f] = null; }
  const made = mesh.faces.length - first;
  compact(mesh);
  mesh.selMode = 'face';
  setFaceSelection(mesh, Array.from({ length: made }, (_, i) => mesh.faces.length - made + i));
  return mesh;
}

// ─────────────── delete, dissolve, merge, fill

export function deleteSelection(mesh, what = 'VERT') {
  if (what === 'VERT') {
    const sel = selVSet(mesh);
    removeVerts(mesh, (i) => sel.has(i));
  } else if (what === 'EDGE') {
    const sel = selVSet(mesh);
    filterFaces(mesh, (f) => {
      const face = mesh.faces[f];
      for (let i = 0; i < face.length; i++) if (sel.has(face[i]) && sel.has(face[(i + 1) % face.length])) return false;
      return true;
    });
    mesh.loose = (mesh.loose ?? []).filter(([a, b]) => !(sel.has(a) && sel.has(b)));
    compact(mesh);
  } else if (what === 'FACE') {
    const gone = new Set(selectedFaces(mesh));
    filterFaces(mesh, (f) => !gone.has(f));
    compact(mesh);
  } else if (what === 'ONLY_FACE') {
    const gone = new Set(selectedFaces(mesh));
    filterFaces(mesh, (f) => !gone.has(f));
  }
  selectNone(mesh);
  return mesh;
}

/** Replaces each connected group of selected faces with one n-gon along its outer edge (groups with holes stay). */
export function dissolveFaces(mesh) {
  const selected = new Set(selectedFaces(mesh));
  const edges = edgeMap(mesh);
  const seen = new Set();
  const remove = new Set();
  const made = [];
  for (const start of selected) {
    if (seen.has(start)) continue;
    const island = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const f = stack.pop();
      island.push(f);
      const face = mesh.faces[f];
      for (let i = 0; i < face.length; i++) {
        for (const g of edges.get(edgeKey(face[i], face[(i + 1) % face.length])).faces) {
          if (selected.has(g) && !seen.has(g)) { seen.add(g); stack.push(g); }
        }
      }
    }
    if (island.length < 2) continue;
    const inIsland = new Set(island);
    const next = new Map();
    let clean = true;
    for (const f of island) {
      const face = mesh.faces[f];
      for (let i = 0; i < face.length; i++) {
        const [a, b] = [face[i], face[(i + 1) % face.length]];
        if (edges.get(edgeKey(a, b)).faces.filter((g) => inIsland.has(g)).length === 1) {
          if (next.has(a)) clean = false;
          next.set(a, b);
        }
      }
    }
    if (!clean || !next.size) continue;
    const first = next.keys().next().value;
    const loop = [first];
    for (let v = next.get(first); v !== first && loop.length <= next.size; v = next.get(v)) loop.push(v);
    if (loop.length !== next.size) continue;
    for (const f of island) remove.add(f);
    made.push([loop, island[0]]);
  }
  const before = mesh.faces.length;
  for (const [face, f] of made) addFace(mesh, face, f);
  const count = mesh.faces.length - before;
  filterFaces(mesh, (f) => !remove.has(f));
  compact(mesh);
  mesh.selMode = 'face';
  setFaceSelection(mesh, Array.from({ length: count }, (_, i) => mesh.faces.length - count + i));
  return mesh;
}

/** Removes the selected edges and joins the two faces on each. */
export function dissolveEdges(mesh) {
  const saved = mesh.selMode;
  for (const e of selectedEdges(mesh)) {
    if (e.faces.length !== 2) continue;
    mesh.selMode = 'face';
    setFaceSelection(mesh, e.faces);
    dissolveFaces(mesh);
    break;
  }
  mesh.selMode = saved;
  return mesh;
}

/** Removes selected vertices from their faces, keeping those faces where at least three corners remain. */
export function dissolveVerts(mesh) {
  const sel = selVSet(mesh);
  mesh.faces = mesh.faces.map((face) => face.filter((i) => !sel.has(i)));
  if (mesh.uvs) mesh.uvs = mesh.uvs.map((uv, f) => (uv && uv.length === mesh.faces[f].length ? uv : null));
  filterFaces(mesh, (f) => mesh.faces[f].length >= 3);
  removeVerts(mesh, (i) => sel.has(i));
  compact(mesh);
  selectNone(mesh);
  return mesh;
}

/** Applies a vertex remap: faces lose repeated corners and disappear when fewer than three remain. */
function applyWeld(mesh, target) {
  mesh.faces = mesh.faces.map((face) => {
    const out = [];
    for (const i of face) { const t = target(i); if (out.at(-1) !== t) out.push(t); }
    while (out.length > 1 && out[0] === out.at(-1)) out.pop();
    return out;
  });
  if (mesh.uvs) mesh.uvs = mesh.uvs.map((uv, f) => (uv && uv.length === mesh.faces[f].length ? uv : null));
  filterFaces(mesh, (f) => new Set(mesh.faces[f]).size >= 3);
  mesh.loose = (mesh.loose ?? []).map(([a, b]) => [target(a), target(b)]).filter(([a, b]) => a !== b);
  mesh.selV = [...new Set((mesh.selV ?? []).map(target))];
  compact(mesh);
}

/** Merges selected vertices: 'CENTER', 'CURSOR' (with `cursor`), 'FIRST' or 'LAST'. */
export function mergeVerts(mesh, mode = 'CENTER', cursor = [0, 0, 0]) {
  const sel = mesh.selV ?? [];
  if (sel.length < 2) return mesh;
  const set = new Set(sel);
  const point = mode === 'CURSOR' ? cursor : mode === 'FIRST' ? mesh.verts[sel[0]] : mode === 'LAST' ? mesh.verts[sel.at(-1)] : v3.mul(sel.reduce((c, i) => v3.add(c, mesh.verts[i]), [0, 0, 0]), 1 / sel.length);
  const keep = sel[0];
  mesh.verts[keep] = [...point];
  applyWeld(mesh, (i) => (set.has(i) ? keep : i));
  return mesh;
}

/** Welds selected vertices (all when `all`) closer than `distance`. Returns how many vertices were removed. */
export function mergeByDistance(mesh, distance = 0.0001, all = false) {
  const before = mesh.verts.length;
  const sel = all ? null : selVSet(mesh);
  const cell = Math.max(distance, 1e-9) * 2;
  const buckets = new Map();
  const target = new Int32Array(mesh.verts.length).map((_, i) => i);
  mesh.verts.forEach((v, i) => {
    if (sel && !sel.has(i)) return;
    const c = v.map((x) => Math.floor(x / cell));
    for (let x = c[0] - 1; x <= c[0] + 1; x++) for (let y = c[1] - 1; y <= c[1] + 1; y++) for (let z = c[2] - 1; z <= c[2] + 1; z++) {
      for (const j of buckets.get(`${x},${y},${z}`) ?? []) {
        if (target[i] === i && v3.dist(v, mesh.verts[j]) <= distance) target[i] = j;
      }
    }
    if (target[i] === i) {
      const key = `${c[0]},${c[1]},${c[2]}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
  });
  applyWeld(mesh, (i) => target[i]);
  return before - mesh.verts.length;
}

/** F key: an edge from two selected vertices, a face from three or more (in order around their centre). */
export function makeEdgeFace(mesh) {
  const sel = mesh.selV ?? [];
  if (sel.length === 2) {
    const has = edgeMap(mesh).has(edgeKey(sel[0], sel[1]));
    if (!has) (mesh.loose ??= []).push([sel[0], sel[1]]);
    return mesh;
  }
  if (sel.length < 3) return mesh;
  const center = v3.mul(sel.reduce((c, i) => v3.add(c, mesh.verts[i]), [0, 0, 0]), 1 / sel.length);
  // The plane through the points: the largest cross product round the centre.
  let n = [0, 0, 0];
  for (let i = 0; i < sel.length; i++) {
    const a = v3.sub(mesh.verts[sel[i]], center);
    for (let j = i + 1; j < sel.length; j++) {
      const c = v3.cross(a, v3.sub(mesh.verts[sel[j]], center));
      n = v3.add(n, v3.dot(c, n) < 0 ? v3.mul(c, -1) : c);
    }
  }
  n = v3.norm(n);
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = v3.norm(v3.cross(ref, n));
  const w = v3.cross(n, u);
  const angle = (i) => { const p = v3.sub(mesh.verts[i], center); return Math.atan2(v3.dot(p, w), v3.dot(p, u)); };
  const ring = [...sel].sort((a, b) => angle(a) - angle(b));
  // Agree with the direction of an existing neighbouring edge, so the normals stay consistent.
  const directed = new Set();
  for (const face of mesh.faces) for (let i = 0; i < face.length; i++) directed.add(`${face[i]}>${face[(i + 1) % face.length]}`);
  let clash = 0;
  for (let i = 0; i < ring.length; i++) if (directed.has(`${ring[i]}>${ring[(i + 1) % ring.length]}`)) clash++;
  const set = new Set(ring.map((_, i) => edgeKey(ring[i], ring[(i + 1) % ring.length])));
  mesh.loose = (mesh.loose ?? []).filter(([a, b]) => !set.has(edgeKey(a, b)));
  addFace(mesh, clash ? ring.reverse() : ring);
  if (mesh.selMode === 'face') mesh.selF = [mesh.faces.length - 1];
  return mesh;
}

/** Bridges the two loops of selected boundary edges with quads. */
export function bridgeLoops(mesh) {
  const edges = selectedEdges(mesh).filter((e) => e.faces.length <= 1);
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    let cur = start;
    for (;;) {
      const next = adj.get(cur).find((x) => !seen.has(x));
      if (next == null) break;
      seen.add(next);
      loop.push(next);
      cur = next;
    }
    loops.push(loop);
  }
  if (loops.length !== 2 || loops[0].length !== loops[1].length) return false;
  const [a, b] = loops;
  const n = a.length;
  // Best rotation and direction of the second loop: the smallest total distance.
  let best = { cost: Infinity, order: b };
  for (const candidate of [b, [...b].reverse()]) {
    for (let shift = 0; shift < n; shift++) {
      const order = candidate.map((_, i) => candidate[(i + shift) % n]);
      const cost = a.reduce((sum, v, i) => sum + v3.dist(mesh.verts[v], mesh.verts[order[i]]), 0);
      if (cost < best.cost) best = { cost, order };
    }
  }
  const made = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    made.push(addFace(mesh, [a[i], a[j], best.order[j], best.order[i]]));
  }
  // Face the same way as the faces already on the first loop.
  const first = edgeMap(mesh).get(edgeKey(a[0], a[1]));
  const neighbour = first?.faces.find((f) => !made.includes(f));
  if (neighbour != null) {
    const face = mesh.faces[neighbour];
    const i = face.indexOf(a[0]);
    if (face[(i + 1) % face.length] === a[1]) for (const f of made) mesh.faces[f].reverse();
  }
  mesh.loose = (mesh.loose ?? []).filter(([p, q]) => !(new Set(edges.map((e) => edgeKey(e.a, e.b)))).has(edgeKey(p, q)));
  return true;
}

// ─────────────── normals

export function flipNormals(mesh) {
  for (const f of selectedFaces(mesh)) {
    mesh.faces[f].reverse();
    mesh.uvs?.[f]?.reverse();
  }
  return mesh;
}

/** Makes the winding consistent on each connected part, then outward (by signed volume). */
export function recalcNormals(mesh, inside = false) {
  const edges = edgeMap(mesh);
  const seen = new Set();
  for (let start = 0; start < mesh.faces.length; start++) {
    if (seen.has(start)) continue;
    const island = [start];
    seen.add(start);
    for (let k = 0; k < island.length; k++) {
      const f = island[k];
      const face = mesh.faces[f];
      for (let i = 0; i < face.length; i++) {
        const [a, b] = [face[i], face[(i + 1) % face.length]];
        for (const g of edges.get(edgeKey(a, b)).faces) {
          if (g === f || seen.has(g)) continue;
          const other = mesh.faces[g];
          const j = other.indexOf(a);
          // A neighbour agrees when it runs along the shared edge the other way.
          if (other[(j + 1) % other.length] === b) { other.reverse(); mesh.uvs?.[g]?.reverse(); }
          seen.add(g);
          island.push(g);
        }
      }
    }
    const part = createMesh(mesh.verts, island.map((f) => mesh.faces[f]));
    const volume = signedVolume(part);
    if ((volume < 0) !== inside) for (const f of island) { mesh.faces[f].reverse(); mesh.uvs?.[f]?.reverse(); }
  }
  return mesh;
}

// ─────────────── transforms of the selection

/** Moves each selected vertex along its normal. */
export function shrinkFatten(mesh, offset = 0.1) {
  const normals = vertexNormals(mesh);
  for (const i of mesh.selV ?? []) mesh.verts[i] = v3.add(mesh.verts[i], v3.mul(normals[i], offset));
  return mesh;
}

/** Laplacian smoothing of the selected vertices. */
export function smoothVerts(mesh, factor = 0.5, iterations = 1, onlySelected = true) {
  const sel = onlySelected ? selVSet(mesh) : null;
  const neighbours = mesh.verts.map(() => new Set());
  for (const e of edgeMap(mesh).values()) { neighbours[e.a].add(e.b); neighbours[e.b].add(e.a); }
  for (let it = 0; it < iterations; it++) {
    const next = mesh.verts.map((v, i) => {
      if ((sel && !sel.has(i)) || !neighbours[i].size) return v;
      let c = [0, 0, 0];
      for (const j of neighbours[i]) c = v3.add(c, mesh.verts[j]);
      return v3.lerp(v, v3.mul(c, 1 / neighbours[i].size), factor);
    });
    mesh.verts = next;
  }
  return mesh;
}

/** Repeatable noise on the selected vertices. */
export function randomizeVerts(mesh, amount = 0.1, seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  for (const i of mesh.selV ?? []) mesh.verts[i] = v3.add(mesh.verts[i], [rnd() * amount * 2, rnd() * amount * 2, rnd() * amount * 2]);
  return mesh;
}

/** Blends the selected vertices towards a sphere round their centre. */
export function toSphere(mesh, factor = 1) {
  const sel = mesh.selV ?? [];
  if (!sel.length) return mesh;
  const center = v3.mul(sel.reduce((c, i) => v3.add(c, mesh.verts[i]), [0, 0, 0]), 1 / sel.length);
  const radius = sel.reduce((sum, i) => sum + v3.dist(mesh.verts[i], center), 0) / sel.length;
  for (const i of sel) {
    const target = v3.add(center, v3.mul(v3.norm(v3.sub(mesh.verts[i], center)), radius));
    mesh.verts[i] = v3.lerp(mesh.verts[i], target, factor);
  }
  return mesh;
}

/** Copies the selection in place; the copies become the selection. */
export function duplicateSelection(mesh) {
  const faces = selectedFaces(mesh);
  const sel = selVSet(mesh);
  const map = new Map();
  const dup = (i) => { if (!map.has(i)) map.set(i, addVert(mesh, [...mesh.verts[i]], i)); return map.get(i); };
  const made = [];
  for (const f of faces) {
    made.push(addFace(mesh, mesh.faces[f].map(dup), f));
    if (mesh.uvs?.[f]) mesh.uvs[made.at(-1)] = mesh.uvs[f].map((uv) => [...uv]);
  }
  for (const i of sel) dup(i);
  const covered = new Set(faces.flatMap((f) => mesh.faces[f]));
  for (const e of edgeMap(mesh).values()) {
    if (sel.has(e.a) && sel.has(e.b) && !(covered.has(e.a) && covered.has(e.b))) (mesh.loose ??= []).push([dup(e.a), dup(e.b)]);
  }
  mesh.selV = [...map.values()];
  mesh.selF = made;
  return mesh;
}

/** Spins the selection round an axis through `center` in `steps` steps. */
export function spin(mesh, angleDeg = 360, steps = 12, center = [0, 0, 0], axis = [0, 0, 1]) {
  const edges = selectedEdges(mesh);
  const sel = [...(mesh.selV ?? [])];
  const k = v3.norm(axis);
  const rotate = (p, a) => {
    const r = v3.sub(p, center);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return v3.add(center, v3.add(v3.add(v3.mul(r, cos), v3.mul(v3.cross(k, r), sin)), v3.mul(k, v3.dot(k, r) * (1 - cos))));
  };
  const full = Math.abs(Math.abs(angleDeg) - 360) < 1e-6;
  const rings = [new Map(sel.map((i) => [i, i]))];
  for (let s = 1; s <= steps; s++) {
    if (full && s === steps) { rings.push(rings[0]); break; }
    const a = ((angleDeg * Math.PI) / 180) * (s / steps);
    rings.push(new Map(sel.map((i) => [i, addVert(mesh, rotate(mesh.verts[i], a), i)])));
  }
  for (let s = 0; s < steps; s++) {
    for (const e of edges) addFace(mesh, [rings[s].get(e.a), rings[s].get(e.b), rings[s + 1].get(e.b), rings[s + 1].get(e.a)]);
    if (!edges.length) for (const i of sel) (mesh.loose ??= []).push([rings[s].get(i), rings[s + 1].get(i)]);
  }
  mesh.selV = [...rings.at(-1).values()];
  mesh.selF = [];
  return mesh;
}

// ─────────────── selection

export function selectInvert(mesh) {
  const v = selVSet(mesh);
  const f = new Set(selectedFaces(mesh));
  mesh.selV = mesh.verts.map((_, i) => i).filter((i) => !v.has(i));
  mesh.selF = mesh.faces.map((_, i) => i).filter((i) => !f.has(i));
  if (mesh.selMode === 'face') mesh.selV = [...new Set(mesh.selF.flatMap((g) => mesh.faces[g]))];
  return mesh;
}

export function selectLinked(mesh) {
  const adj = mesh.verts.map(() => []);
  for (const e of edgeMap(mesh).values()) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  const seen = selVSet(mesh);
  const stack = [...seen];
  while (stack.length) for (const j of adj[stack.pop()]) if (!seen.has(j)) { seen.add(j); stack.push(j); }
  mesh.selV = [...seen];
  mesh.selF = mesh.faces.map((_, f) => f).filter((f) => mesh.faces[f].every((i) => seen.has(i)));
  return mesh;
}

export function selectMore(mesh) {
  const sel = selVSet(mesh);
  const grown = new Set(sel);
  for (const face of mesh.faces) if (face.some((i) => sel.has(i))) for (const i of face) grown.add(i);
  mesh.selV = [...grown];
  mesh.selF = mesh.faces.map((_, f) => f).filter((f) => mesh.faces[f].every((i) => grown.has(i)));
  return mesh;
}

export function selectLess(mesh) {
  const sel = selVSet(mesh);
  const out = new Set(sel);
  for (const face of mesh.faces) if (face.some((i) => !sel.has(i))) for (const i of face) out.delete(i);
  mesh.selV = [...out];
  mesh.selF = mesh.faces.map((_, f) => f).filter((f) => mesh.faces[f].every((i) => out.has(i)));
  return mesh;
}

export function selectRandom(mesh, ratio = 0.5, seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  mesh.selV = mesh.verts.map((_, i) => i).filter(() => rnd() < ratio);
  return mesh;
}

/** Vertices on edges that are not shared by exactly two faces. */
export function selectNonManifold(mesh) {
  const out = new Set();
  for (const e of edgeMap(mesh).values()) if (e.faces.length !== 2) { out.add(e.a); out.add(e.b); }
  mesh.selV = [...out];
  mesh.selF = [];
  return mesh;
}

/** The edge loop through (a, b): straight on through vertices with four edges. */
export function selectEdgeLoop(mesh, a, b) {
  const edges = edgeMap(mesh);
  const out = new Set([a, b]);
  const step = (from, to) => {
    let [p, q] = [from, to];
    for (let guard = 0; guard < mesh.verts.length; guard++) {
      const around = [...edges.values()].filter((e) => e.a === q || e.b === q);
      if (around.length !== 4) return;
      const facesHere = new Set(edges.get(edgeKey(p, q)).faces);
      const next = around.map((e) => (e.a === q ? e.b : e.a)).find((v) => v !== p && !edges.get(edgeKey(q, v)).faces.some((f) => facesHere.has(f)));
      if (next == null || out.has(next)) return;
      out.add(next);
      [p, q] = [q, next];
    }
  };
  step(a, b);
  step(b, a);
  mesh.selV = [...out];
  return mesh;
}

// ─────────────── edge marks

/** Marks or clears the selected edges: 'seam', 'sharp', or 'crease' with a value of 0…1. Returns how many edges changed. */
export function markSelectedEdges(mesh, kind, value = true) {
  const edges = selectedEdges(mesh);
  for (const e of edges) setEdgeMark(mesh, kind, e.a, e.b, value);
  return edges.length;
}

/** Marks edges whose faces meet at more than `angle` degrees as sharp. */
export function markSharpByAngle(mesh, angle = 30) {
  const limit = (angle * Math.PI) / 180;
  let n = 0;
  for (const e of edgeMap(mesh).values()) {
    if (e.faces.length !== 2) continue;
    const dot = v3.dot(faceNormal(mesh, mesh.faces[e.faces[0]]), faceNormal(mesh, mesh.faces[e.faces[1]]));
    if (Math.acos(Math.max(-1, Math.min(1, dot))) > limit) { setEdgeMark(mesh, 'sharp', e.a, e.b, true); n++; }
  }
  return n;
}

// ─────────────── custom split normals

/** Stores the current look as custom normals, so that later edits to the shape do not change the shading. */
export function setCustomNormalsFromShading(mesh) {
  const flat = !mesh.smooth;
  const vn = flat ? null : vertexNormals(mesh);
  const split = !flat && Object.keys(mesh.marks?.sharp ?? {}).length ? splitNormals(mesh) : null;
  mesh.cornerNormals = mesh.faces.map((face, f) => {
    const fn = flat ? faceNormal(mesh, face) : null;
    return face.map((v, k) => [...(split?.[f][k] ?? (flat ? fn : vn[v]))]);
  });
  return mesh;
}

/** Aims the normals of the selected vertices at a point (or away from it). */
export function pointNormalsAt(mesh, target, invert = false) {
  if (!mesh.cornerNormals) setCustomNormalsFromShading(mesh);
  const sel = selVSet(mesh);
  mesh.faces.forEach((face, f) => {
    mesh.cornerNormals[f] ??= face.map(() => faceNormal(mesh, face));
    face.forEach((v, k) => {
      if (!sel.has(v)) return;
      const n = v3.norm(v3.sub(target, mesh.verts[v]));
      mesh.cornerNormals[f][k] = invert ? v3.mul(n, -1) : n;
    });
  });
  return mesh;
}

export function clearCustomNormals(mesh) {
  delete mesh.cornerNormals;
  return mesh;
}

// ─────────────── rip and slide

/** The faces around a vertex in fan order, as far as they connect. */
function fanAround(mesh, v, faces) {
  const left = new Set(faces);
  const order = [];
  let current = faces[0];
  while (current != null) {
    order.push(current);
    left.delete(current);
    const face = mesh.faces[current];
    const n = face.length;
    const k = face.indexOf(v);
    const others = [face[(k + 1) % n], face[(k + n - 1) % n]];
    current = [...left].find((f) => others.some((o) => mesh.faces[f].includes(o))) ?? null;
  }
  return order;
}

/**
 * Tears the mesh open along the selected edges: each selected vertex gets a copy for the faces on the other side of the
 * tear. A single vertex tears its fan in two. The new vertices end up selected. Returns how many were added.
 */
export function ripSelection(mesh) {
  const sel = selVSet(mesh);
  if (!sel.size) return 0;
  const facesOf = new Map();
  mesh.faces.forEach((face, f) => { for (const v of face) if (sel.has(v)) { if (!facesOf.has(v)) facesOf.set(v, []); facesOf.get(v).push(f); } });
  const added = [];
  const replace = (f, from, to) => {
    const face = mesh.faces[f];
    face[face.indexOf(from)] = to;
    // Marks live on vertex pairs: an edge that moved to the copy keeps its marks.
    for (const kind of Object.keys(mesh.marks ?? {})) {
      const n = face.length;
      const k = face.indexOf(to);
      for (const other of [face[(k + 1) % n], face[(k + n - 1) % n]]) {
        const value = mesh.marks[kind][edgeKey(from, other)];
        if (value) mesh.marks[kind][edgeKey(to, other)] = value;
      }
    }
    if (mesh.cornerNormals) mesh.cornerNormals[f] = null;
  };
  const tornEdge = (a, b) => sel.has(a) && sel.has(b);
  for (const v of sel) {
    const faces = facesOf.get(v) ?? [];
    if (faces.length < 2) continue;
    // Faces stay together across edges that are not being torn.
    const parent = new Map(faces.map((f) => [f, f]));
    const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
      const [A, B] = [mesh.faces[faces[i]], mesh.faces[faces[j]]];
      const n = A.length;
      const k = A.indexOf(v);
      for (const other of [A[(k + 1) % n], A[(k + n - 1) % n]]) {
        const m = B.indexOf(v);
        const close = [B[(m + 1) % B.length], B[(m + B.length - 1) % B.length]];
        if (close.includes(other) && !tornEdge(v, other)) parent.set(find(faces[i]), find(faces[j]));
      }
    }
    const groups = new Map();
    for (const f of faces) { const r = find(f); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); }
    const list = [...groups.values()];
    if (list.length === 1 && sel.size === 1) {
      // A lone vertex: half of its fan goes to the copy.
      const fan = fanAround(mesh, v, faces);
      list.splice(0, 1, fan.slice(0, Math.ceil(fan.length / 2)), fan.slice(Math.ceil(fan.length / 2)));
    }
    for (const group of list.slice(1)) {
      if (!group.length) continue;
      const copy = addVert(mesh, [...mesh.verts[v]], v);
      for (const f of group) replace(f, v, copy);
      added.push(copy);
    }
  }
  if (added.length) { mesh.selV = added; mesh.selF = []; }
  return added.length;
}

/**
 * Slides the selected vertices along their edges that are not selected: `factor` is a fraction of each edge, and its sign
 * picks the side. Vertices without such an edge stay.
 */
export function edgeSlide(mesh, factor = 0.5) {
  const sel = selVSet(mesh);
  const around = new Map();
  for (const e of edgeMap(mesh).values()) {
    const [inA, inB] = [sel.has(e.a), sel.has(e.b)];
    if (inA && !inB) { if (!around.has(e.a)) around.set(e.a, []); around.get(e.a).push(e.b); }
    if (inB && !inA) { if (!around.has(e.b)) around.set(e.b, []); around.get(e.b).push(e.a); }
  }
  // One direction for the whole selection, so that a loop moves as one.
  let reference = null;
  const moves = [];
  for (const v of sel) {
    const others = around.get(v);
    if (!others?.length) continue;
    const dirs = others.map((o) => ({ o, d: v3.norm(v3.sub(mesh.verts[o], mesh.verts[v])) }));
    reference ??= dirs[0].d;
    const with_ = dirs.reduce((best, x) => (v3.dot(x.d, reference) > v3.dot(best.d, reference) ? x : best));
    const against = dirs.reduce((best, x) => (v3.dot(x.d, reference) < v3.dot(best.d, reference) ? x : best));
    const target = factor >= 0 ? with_ : against;
    moves.push([v, v3.lerp(mesh.verts[v], mesh.verts[target.o], Math.abs(factor))]);
  }
  for (const [v, p] of moves) mesh.verts[v] = p;
  return moves.length;
}

// ─────────────── proportional editing

export const PROPORTIONAL_FALLOFFS = ['SMOOTH', 'SPHERE', 'ROOT', 'SHARP', 'LINEAR', 'CONSTANT', 'RANDOM'];

/** How strongly a point at `t` (0 at the selection, 1 at the edge of the influence) follows the selection. */
export function proportionalFalloff(kind, t, seed = 0) {
  const x = Math.max(0, Math.min(1, 1 - t));
  switch (kind) {
    case 'SPHERE': return Math.sqrt(1 - (1 - x) * (1 - x));
    case 'ROOT': return Math.sqrt(x);
    case 'SHARP': return x * x;
    case 'LINEAR': return x;
    case 'CONSTANT': return t < 1 ? 1 : 0;
    case 'RANDOM': { const r = Math.sin(seed * 12.9898) * 43758.5453; return x * (r - Math.floor(r)); }
    default: return x * x * (3 - 2 * x);
  }
}

/**
 * Vertices that follow the selection: [index, weight] for each one inside `size` of the selection, not counting the
 * selection itself. `connected`: distance along the edges, so that a part not joined by edges stays put.
 */
export function proportionalWeights(mesh, { size = 1, falloff = 'SMOOTH', connected = false } = {}) {
  const sel = selVSet(mesh);
  const out = [];
  if (!sel.size || size <= 0) return out;
  if (connected) {
    const around = mesh.verts.map(() => []);
    for (const e of edgeMap(mesh).values()) {
      const d = v3.dist(mesh.verts[e.a], mesh.verts[e.b]);
      around[e.a].push([e.b, d]);
      around[e.b].push([e.a, d]);
    }
    const dist = new Float64Array(mesh.verts.length).fill(Infinity);
    const queue = [];
    for (const i of sel) { dist[i] = 0; queue.push(i); }
    // Bellman-Ford on a work list: small meshes need few passes and big ones stay simple.
    while (queue.length) {
      const i = queue.pop();
      for (const [j, d] of around[i]) {
        const next = dist[i] + d;
        if (next < dist[j] && next < size) { dist[j] = next; queue.push(j); }
      }
    }
    mesh.verts.forEach((_, i) => { if (!sel.has(i) && dist[i] < size) out.push([i, proportionalFalloff(falloff, dist[i] / size, i)]); });
    return out;
  }
  const chosen = [...sel].map((i) => mesh.verts[i]);
  mesh.verts.forEach((v, i) => {
    if (sel.has(i)) return;
    let best = Infinity;
    for (const p of chosen) { const d = v3.dist(v, p); if (d < best) best = d; }
    if (best < size) out.push([i, proportionalFalloff(falloff, best / size, i)]);
  });
  return out;
}

export { isManifold, selectAll, selectNone };
