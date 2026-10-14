// Check geometry and mesh repair (FreeCAD Part › Check geometry, Mesh › Analyze / Repair).
// Works on triangle soups ([[x,y,z] × 3]); no DOM.

import { solidBlocks } from './solids.js';

/** Self-intersections are only looked for up to this many triangles (pairs grow fast). */
export const SELF_CHECK_LIMIT = 20000;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Shared vertices; every face kept (also the degenerate ones, so they can be counted). */
function weld(triangles, tolerance) {
  const vertices = [];
  const map = new Map();
  const faces = triangles.map((tri) => tri.map((p) => {
    const key = `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)},${Math.round(p[2] / tolerance)}`;
    let index = map.get(key);
    if (index === undefined) { index = vertices.length; vertices.push(p); map.set(key, index); }
    return index;
  }));
  return { vertices, faces };
}

/** A face with two equal corners or (next to) no area. */
function isDegenerate(vertices, [a, b, c], tolerance) {
  if (a === b || b === c || a === c) return true;
  const n = cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a]));
  const longest = Math.max(len(sub(vertices[b], vertices[a])), len(sub(vertices[c], vertices[b])), len(sub(vertices[a], vertices[c])));
  return len(n) <= tolerance * longest;
}

const faceKey = (face) => [...face].sort((x, y) => x - y).join(',');

/** Undirected edge → the faces on it and the way each one runs along it. */
function edgeMap(faces) {
  const edges = new Map();
  faces.forEach((face, index) => {
    for (let i = 0; i < 3; i++) {
      const a = face[i];
      const b = face[(i + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let list = edges.get(key);
      if (!list) { list = []; edges.set(key, list); }
      list.push({ face: index, forward: a < b });
    }
  });
  return edges;
}

/** Faces joined across shared edges: a component number per face. */
function components(faces, edges) {
  const parent = faces.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const list of edges.values()) for (let i = 1; i < list.length; i++) parent[find(list[i].face)] = find(list[0].face);
  const ids = new Map();
  return faces.map((_, i) => {
    const root = find(i);
    if (!ids.has(root)) ids.set(root, ids.size);
    return ids.get(root);
  });
}

const signedVolume = (vertices, [a, b, c]) => dot(vertices[a], cross(vertices[b], vertices[c])) / 6;
const faceArea = (vertices, [a, b, c]) => len(cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a]))) / 2;

/**
 * Shells facing the wrong way. A shell inside an odd number of other shells is
 * a void and must face in (negative volume); the others must face out.
 */
function wrongShells(vertices, faces, shellOf) {
  const volume = new Map();
  const byShell = new Map();
  faces.forEach((face, i) => {
    volume.set(shellOf[i], (volume.get(shellOf[i]) ?? 0) + signedVolume(vertices, face));
    if (!byShell.has(shellOf[i])) byShell.set(shellOf[i], []);
    byShell.get(shellOf[i]).push(face);
  });
  const ids = [...byShell.keys()];
  // Ray parity along a slightly skewed direction (so it misses edges and vertices).
  const dir = [1, 0.000123, 0.000271];
  const inside = (p, shellFaces) => {
    let hits = 0;
    for (const [a, b, c] of shellFaces) {
      const A = vertices[a]; const B = vertices[b]; const C = vertices[c];
      const e1 = sub(B, A); const e2 = sub(C, A);
      const h = cross(dir, e2);
      const det = dot(e1, h);
      if (Math.abs(det) < 1e-14) continue;
      const s = sub(p, A);
      const u = dot(s, h) / det;
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1);
      const v = dot(dir, q) / det;
      if (v < 0 || u + v > 1) continue;
      if (dot(e2, q) / det > 1e-9) hits++;
    }
    return hits % 2 === 1;
  };
  const wrong = new Set();
  for (const id of ids) {
    const probe = vertices[byShell.get(id)[0][0]];
    const depth = ids.filter((other) => other !== id && inside(probe, byShell.get(other))).length;
    const shouldBePositive = depth % 2 === 0;
    if ((volume.get(id) > 0) !== shouldBePositive) wrong.add(id);
  }
  return wrong;
}

/** Directed edges with no partner, chained into loops (each loop runs the way its faces do). */
function boundaryLoops(faces, edges) {
  const next = new Map();
  for (const list of edges.values()) {
    if (list.length !== 1) continue;
    const face = faces[list[0].face];
    for (let i = 0; i < 3; i++) {
      const a = face[i];
      const b = face[(i + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (edges.get(key) === list) {
        if (!next.has(a)) next.set(a, []);
        next.get(a).push(b);
      }
    }
  }
  const loops = [];
  for (const start of [...next.keys()]) {
    while (next.get(start)?.length) {
      const loop = [start];
      let at = next.get(start).shift();
      while (at !== start && loop.length <= next.size + 1) {
        loop.push(at);
        const outs = next.get(at);
        if (!outs?.length) break;
        at = outs.shift();
      }
      if (at === start && loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

/** A segment crossing a triangle's inside (end points and edges not counted). */
function segmentHitsTriangle(p, q, [a, b, c], eps) {
  const n = cross(sub(b, a), sub(c, a));
  const scale = len(n);
  if (scale < 1e-18) return false;
  const dp = dot(n, sub(p, a)) / scale;
  const dq = dot(n, sub(q, a)) / scale;
  if ((dp > eps && dq > eps) || (dp < -eps && dq < -eps) || Math.abs(dp - dq) < eps) return false;
  if (Math.abs(dp) <= eps || Math.abs(dq) <= eps) return false; // touching, not crossing
  const t = dp / (dp - dq);
  const x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  // On an edge counts: the segment really goes through the plane there.
  const inside = (u, v) => dot(cross(sub(v, u), sub(x, u)), n) / (scale * len(sub(v, u)) || 1) >= -eps;
  return inside(a, b) && inside(b, c) && inside(c, a);
}

/** Pairs of triangles that cut through each other (not sharing a corner); sweep along x. */
function selfIntersections(vertices, faces, tolerance) {
  const boxes = faces.map((face, index) => {
    const pts = face.map((i) => vertices[i]);
    return { index, min: [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), max: [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]))) };
  }).sort((x, y) => x.min[0] - y.min[0]);
  let count = 0;
  const eps = Math.max(tolerance * 10, 1e-9);
  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i];
    for (let j = i + 1; j < boxes.length && boxes[j].min[0] <= A.max[0] + eps; j++) {
      const B = boxes[j];
      if (B.min[1] > A.max[1] + eps || B.max[1] < A.min[1] - eps || B.min[2] > A.max[2] + eps || B.max[2] < A.min[2] - eps) continue;
      const fa = faces[A.index];
      const fb = faces[B.index];
      if (fa.some((v) => fb.includes(v))) continue;
      const ta = fa.map((v) => vertices[v]);
      const tb = fb.map((v) => vertices[v]);
      let hit = false;
      for (let k = 0; k < 3 && !hit; k++) hit = segmentHitsTriangle(ta[k], ta[(k + 1) % 3], tb, eps) || segmentHitsTriangle(tb[k], tb[(k + 1) % 3], ta, eps);
      if (hit) count++;
    }
  }
  return count;
}

/**
 * What is wrong with a mesh: { triangles, vertices, shells, degenerate,
 * duplicates, openEdges, holes, nonManifold, flipped, inverted,
 * selfIntersections (null = too big to check), volume, area, closed, ok, issues }.
 */
export function analyzeMesh(triangles, { tolerance = 1e-6, selfCheck = true } = {}) {
  const { vertices, faces: all } = weld(triangles, tolerance);
  const degenerate = all.filter((face) => isDegenerate(vertices, face, tolerance)).length;
  const seen = new Set();
  let duplicates = 0;
  const faces = [];
  const collapsed = ([a, b, c]) => a === b || b === c || a === c;
  for (const face of all) {
    // A zero-area sliver still closes a T-junction: it stays in the edge graph.
    if (collapsed(face)) continue;
    const key = faceKey(face);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    faces.push(face);
  }
  const edges = edgeMap(faces);
  let openEdges = 0;
  let nonManifold = 0;
  let flipped = 0;
  for (const list of edges.values()) {
    if (list.length === 1) openEdges++;
    else if (list.length > 2) nonManifold++;
    else if (list[0].forward === list[1].forward) flipped++;
  }
  const shellOf = components(faces, edges);
  const shells = new Set(shellOf).size;
  const shellVolume = new Map();
  faces.forEach((face, i) => shellVolume.set(shellOf[i], (shellVolume.get(shellOf[i]) ?? 0) + signedVolume(vertices, face)));
  // Voids (shells inside others) face in; everything else faces out.
  const inverted = shellVolume.size > 1 ? wrongShells(vertices, faces, shellOf).size : [...shellVolume.values()].filter((v) => v < 0).length;
  const holes = openEdges ? boundaryLoops(faces, edges).length : 0;
  const volume = faces.reduce((sum, face) => sum + signedVolume(vertices, face), 0);
  const area = faces.reduce((sum, face) => sum + faceArea(vertices, face), 0);
  const self = selfCheck && faces.length <= SELF_CHECK_LIMIT ? selfIntersections(vertices, faces, tolerance) : null;
  const report = {
    triangles: triangles.length, vertices: vertices.length, shells, degenerate, duplicates, openEdges, holes, nonManifold, flipped, inverted,
    selfIntersections: self, volume, area,
  };
  report.closed = openEdges === 0 && nonManifold === 0;
  report.issues = ['degenerate', 'duplicates', 'openEdges', 'nonManifold', 'flipped', 'inverted', 'selfIntersections'].filter((key) => report[key] > 0);
  report.ok = report.issues.length === 0;
  return report;
}

const COUNTS = ['triangles', 'vertices', 'shells', 'degenerate', 'duplicates', 'openEdges', 'holes', 'nonManifold', 'flipped', 'inverted', 'volume', 'area'];

/**
 * Check geometry of a solid entity. A BIM object is a compound of blocks that
 * touch by design (as FreeCAD's Arch compounds), so each block is checked on its own.
 */
export function checkSolid(entity, options = {}) {
  const reports = solidBlocks(entity).filter((tris) => tris.length).map((tris) => analyzeMesh(tris, options));
  const total = Object.fromEntries(COUNTS.map((key) => [key, reports.reduce((sum, r) => sum + r[key], 0)]));
  total.blocks = reports.length;
  total.selfIntersections = reports.some((r) => r.selfIntersections === null) ? null : reports.reduce((sum, r) => sum + r.selfIntersections, 0);
  total.closed = reports.every((r) => r.closed);
  total.empty = reports.length === 0;
  total.issues = ['degenerate', 'duplicates', 'openEdges', 'nonManifold', 'flipped', 'inverted', 'selfIntersections'].filter((key) => total[key] > 0);
  total.ok = total.issues.length === 0;
  total.repairable = total.issues.some((key) => REPAIRABLE.includes(key));
  return total;
}

/**
 * Removes zero-area slivers (a, b, c with c on the long edge a–b): the face on
 * the other side of a–b is split at c, so the mesh stays closed.
 */
function dissolveSlivers(vertices, input, tolerance) {
  let faces = input;
  let removed = 0;
  for (let pass = 0; pass < 8; pass++) {
    const slivers = [];
    faces.forEach((face, i) => { if (isDegenerate(vertices, face, tolerance)) slivers.push(i); });
    if (!slivers.length) break;
    const gone = new Set();
    const replace = new Map();
    const edges = edgeMap(faces);
    for (const s of slivers) {
      if (gone.has(s) || replace.has(s)) continue;
      const face = faces[s];
      // The longest edge u→v and the corner w on it.
      let k = 0;
      let best = -1;
      for (let i = 0; i < 3; i++) {
        const l = len(sub(vertices[face[(i + 1) % 3]], vertices[face[i]]));
        if (l > best) { best = l; k = i; }
      }
      const u = face[k];
      const v = face[(k + 1) % 3];
      const w = face[(k + 2) % 3];
      const list = edges.get(u < v ? `${u},${v}` : `${v},${u}`) ?? [];
      const other = list.map((entry) => entry.face).find((f) => f !== s && !gone.has(f) && !replace.has(f) && !slivers.includes(f));
      gone.add(s);
      removed++;
      if (other === undefined) continue;
      // The neighbour runs v→u; split it into v→w and w→u.
      const g = faces[other];
      const j = [0, 1, 2].find((i) => g[i] === v && g[(i + 1) % 3] === u);
      if (j === undefined) continue;
      const x = g[(j + 2) % 3];
      replace.set(other, [[v, w, x], [w, u, x]]);
    }
    faces = faces.flatMap((face, i) => (gone.has(i) ? [] : replace.get(i) ?? [face]));
  }
  return { faces, removed };
}

/**
 * Closes cracks (T-junctions): a boundary vertex lying on a boundary edge of
 * the other side splits that edge's face there, until both sides share
 * their vertices. Returns the number of splits.
 */
function closeCracks(vertices, faces, tolerance) {
  let splits = 0;
  for (let pass = 0; pass < 16; pass++) {
    const edges = edgeMap(faces);
    const boundary = [];
    for (const list of edges.values()) {
      if (list.length !== 1) continue;
      const face = faces[list[0].face];
      for (let i = 0; i < 3; i++) {
        const u = face[i];
        const v = face[(i + 1) % 3];
        if (edges.get(u < v ? `${u},${v}` : `${v},${u}`) === list) boundary.push({ face: list[0].face, u, v });
      }
    }
    const points = [...new Set(boundary.flatMap((e) => [e.u, e.v]))];
    if (!boundary.length || boundary.length * points.length > 4e6) break;
    const split = new Map();
    for (const { face, u, v } of boundary) {
      if (split.has(face)) continue;
      const a = vertices[u];
      const d = sub(vertices[v], a);
      const l2 = dot(d, d);
      if (l2 < 1e-24) continue;
      const near = Math.max(tolerance * 10, Math.sqrt(l2) * 1e-4);
      let best = null;
      for (const w of points) {
        if (w === u || w === v) continue;
        const t = dot(sub(vertices[w], a), d) / l2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const off = len(sub(vertices[w], [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]));
        if (off < near && (!best || t < best.t)) best = { w, t };
      }
      if (best) split.set(face, { u, v, w: best.w });
    }
    if (!split.size) break;
    const next = [];
    faces.forEach((face, i) => {
      const s = split.get(i);
      if (!s) { next.push(face); return; }
      const j = [0, 1, 2].find((k) => face[k] === s.u && face[(k + 1) % 3] === s.v);
      const x = face[(j + 2) % 3];
      next.push([s.u, s.w, x], [s.w, s.v, x]);
    });
    faces.splice(0, faces.length, ...next);
    splits += split.size;
  }
  return splits;
}

/** Problems `repairMesh` can mend (self-intersections and non-manifold edges it cannot). */
export const REPAIRABLE = ['degenerate', 'duplicates', 'openEdges', 'flipped', 'inverted'];

/**
 * Mends a mesh: drops degenerate and duplicate triangles, turns faces so
 * neighbours agree, closes cracks (T-junctions), fills holes (a fan from
 * each hole's centre) and turns
 * inside-out shells outward. Returns { triangles, fixed: { degenerate,
 * duplicates, flipped, cracks, holes, inverted } }.
 */
export function repairMesh(triangles, { tolerance = 1e-6, degenerate = true, duplicates = true, orient = true, holes = true } = {}) {
  const { vertices, faces: all } = weld(triangles, tolerance);
  const fixed = { degenerate: 0, duplicates: 0, flipped: 0, cracks: 0, holes: 0, inverted: 0 };
  const seen = new Set();
  let faces = [];
  for (const face of all) {
    if (degenerate && (face[0] === face[1] || face[1] === face[2] || face[0] === face[2])) { fixed.degenerate++; continue; }
    const key = faceKey(face);
    if (duplicates && seen.has(key)) { fixed.duplicates++; continue; }
    seen.add(key);
    faces.push([...face]);
  }
  if (degenerate) {
    const result = dissolveSlivers(vertices, faces, tolerance);
    faces = result.faces;
    fixed.degenerate += result.removed;
  }
  if (orient) {
    // Walk each shell from one face; a neighbour running the same way along the shared edge is turned.
    const edges = edgeMap(faces);
    const neighbours = faces.map(() => []);
    for (const list of edges.values()) if (list.length === 2) { neighbours[list[0].face].push(list[1].face); neighbours[list[1].face].push(list[0].face); }
    const runs = (face, a, b) => (face[0] === a && face[1] === b) || (face[1] === a && face[2] === b) || (face[2] === a && face[0] === b);
    const done = new Uint8Array(faces.length);
    for (let s = 0; s < faces.length; s++) {
      if (done[s]) continue;
      done[s] = 1;
      const queue = [s];
      while (queue.length) {
        const f = queue.pop();
        const face = faces[f];
        for (const g of neighbours[f]) {
          if (done[g]) continue;
          const other = faces[g];
          // The shared edge.
          for (let i = 0; i < 3; i++) {
            const a = face[i];
            const b = face[(i + 1) % 3];
            if (!other.includes(a) || !other.includes(b)) continue;
            if (runs(other, a, b)) { other.reverse(); fixed.flipped++; }
            break;
          }
          done[g] = 1;
          queue.push(g);
        }
      }
    }
  }
  // Cracks first (sides that should meet), then what is still open is a hole.
  if (holes) fixed.cracks = closeCracks(vertices, faces, tolerance);
  // Filling a hole can make slivers, dissolving them can open a new crack: a few rounds.
  for (let round = 0; holes && round < 4; round++) {
    if (round) closeCracks(vertices, faces, tolerance);
    const edges = edgeMap(faces);
    const loops = boundaryLoops(faces, edges);
    if (!loops.length) break;
    for (const loop of loops) {
      fixed.holes++;
      // The new faces run each boundary edge the other way.
      if (loop.length === 3) { faces.push([loop[2], loop[1], loop[0]]); continue; }
      const c = [0, 1, 2].map((k) => loop.reduce((sum, v) => sum + vertices[v][k], 0) / loop.length);
      const ci = vertices.length;
      vertices.push(c);
      for (let i = 0; i < loop.length; i++) faces.push([ci, loop[(i + 1) % loop.length], loop[i]]);
    }
    if (degenerate) faces = dissolveSlivers(vertices, faces, tolerance).faces;
  }
  if (orient) {
    // Shells facing the wrong way (a void inside another shell faces in).
    const edges = edgeMap(faces);
    const shellOf = components(faces, edges);
    const turn = wrongShells(vertices, faces, shellOf);
    fixed.inverted = turn.size;
    faces = faces.map((face, i) => (turn.has(shellOf[i]) ? [face[0], face[2], face[1]] : face));
  }
  return { triangles: faces.map((face) => face.map((i) => [...vertices[i]])), fixed };
}
