// The modifier stack: non-destructive steps from an object's mesh to what gets drawn and rendered.
import { bevelVerts, decimatePlanar, decimateQuadric, projectOntoMesh } from './meshtools.js';
import {
  addFace, addVert, boundingBox, cloneMesh, closestOnTriangle, compact, createMesh, edgeKey, edgeMap, faceCenter, faceNormal, selectAll, setEdgeMark, triangulateIndices, v3, vertexNormals,
} from './mesh.js';
import { bevelEdges, mergeByDistance, smoothVerts } from './meshops.js';
import { booleanMesh } from './csg.js';
import { fbm } from './noise.js';
import { multiresEvaluate, oceanMesh, skinMesh, voxelRemesh } from './remesh.js';

/** Every modifier: its name, Korean name, parameters and defaults. The UI builds its panels from this table. */
export const MODIFIERS = {
  SUBSURF: { en: 'Subdivision Surface', ko: '서브디비전 표면', icon: 'mod-subsurf', group: 'generate', props: { levels: { def: 2, min: 0, max: 6, step: 1, int: true } } },
  MIRROR: { en: 'Mirror', ko: '미러', icon: 'mod-mirror', group: 'generate', props: { x: { def: true }, y: { def: false }, z: { def: false }, merge: { def: true }, mergeDistance: { def: 0.001, min: 0, step: 0.001 } } },
  ARRAY: { en: 'Array', ko: '배열', icon: 'mod-array', group: 'generate', props: { count: { def: 3, min: 1, max: 1000, step: 1, int: true }, offsetX: { def: 2.2, step: 0.1 }, offsetY: { def: 0, step: 0.1 }, offsetZ: { def: 0, step: 0.1 } } },
  SOLIDIFY: { en: 'Solidify', ko: '솔리디파이', icon: 'mod-solidify', group: 'generate', props: { thickness: { def: 0.1, step: 0.01 } } },
  BEVEL: { en: 'Bevel', ko: '베벨', icon: 'mod-bevel', group: 'generate', props: { width: { def: 0.1, min: 0, step: 0.01 }, segments: { def: 1, min: 1, max: 32, step: 1, int: true }, profile: { def: 0.5, min: 0, max: 1, step: 0.05 }, affect: { def: 'EDGES', options: ['EDGES', 'VERTICES'] }, angle: { def: 30, min: 0, max: 180, step: 1 } } },
  DECIMATE: { en: 'Decimate', ko: '디시메이트', icon: 'mod-decimate', group: 'generate', props: { mode: { def: 'COLLAPSE', options: ['COLLAPSE', 'PLANAR'] }, ratio: { def: 0.5, min: 0, max: 1, step: 0.05 }, angle: { def: 5, min: 0, max: 180, step: 1 } } },
  BOOLEAN: { en: 'Boolean', ko: '불리언', icon: 'mod-boolean', group: 'generate', props: { operation: { def: 'DIFFERENCE', options: ['DIFFERENCE', 'UNION', 'INTERSECT'] }, object: { def: null, object: 'MESH' } } },
  SCREW: { en: 'Screw', ko: '스크류', icon: 'mod-screw', group: 'generate', props: { angle: { def: 360, step: 5 }, steps: { def: 16, min: 2, max: 512, step: 1, int: true }, height: { def: 0, step: 0.1 }, axis: { def: 'Z', options: ['X', 'Y', 'Z'] } } },
  WELD: { en: 'Weld', ko: '용접', icon: 'mod-weld', group: 'generate', props: { distance: { def: 0.001, min: 0, step: 0.001 } } },
  WIREFRAME: { en: 'Wireframe', ko: '와이어프레임', icon: 'mod-wire', group: 'generate', props: { thickness: { def: 0.03, min: 0.001, step: 0.005 } } },
  TRIANGULATE: { en: 'Triangulate', ko: '삼각분할', icon: 'mod-tri', group: 'generate', props: {} },
  EDGE_SPLIT: { en: 'Edge Split', ko: '엣지 분할', icon: 'mod-split', group: 'generate', props: { angle: { def: 30, min: 0, max: 180, step: 1 } } },
  BUILD: { en: 'Build', ko: '빌드', icon: 'mod-build', group: 'generate', props: { start: { def: 1, step: 1, int: true }, length: { def: 100, min: 1, step: 1, int: true } } },
  MASK: { en: 'Mask', ko: '마스크', icon: 'mod-mask', group: 'generate', props: { group: { def: '' }, invert: { def: false } } },
  REMESH: { en: 'Remesh', ko: '리메시', icon: 'mod-remesh', group: 'generate', props: { voxelSize: { def: 0.1, min: 0.005, step: 0.01 }, smooth: { def: true } } },
  MULTIRES: { en: 'Multiresolution', ko: '멀티레졸루션', icon: 'mod-multires', group: 'generate', props: { levels: { def: 1, min: 0, max: 6, step: 1, int: true }, total: { def: 1, min: 0, max: 6, step: 1, int: true } } },
  SKIN: { en: 'Skin', ko: '스킨', icon: 'mod-skin', group: 'generate', props: { radius: { def: 0.25, min: 0.001, step: 0.01 }, resolution: { def: 0.08, min: 0.01, step: 0.01 }, blend: { def: 0.1, min: 0, step: 0.01 } } },
  OCEAN: { en: 'Ocean', ko: '오션', icon: 'mod-ocean', group: 'generate', props: { resolution: { def: 64, min: 8, max: 512, step: 8, int: true }, size: { def: 50, min: 1, step: 1 }, waveScale: { def: 1, min: 0, step: 0.1 }, windSpeed: { def: 12, min: 0.1, step: 0.5 }, windAngle: { def: 0, step: 5 }, choppiness: { def: 1, min: 0, step: 0.1 }, seed: { def: 1, min: 0, step: 1, int: true }, speed: { def: 1, min: 0, step: 0.1 } } },
  DISPLACE: { en: 'Displace', ko: '변위', icon: 'mod-displace', group: 'deform', props: { strength: { def: 0.3, step: 0.05 }, scale: { def: 2, min: 0.01, step: 0.1 }, midlevel: { def: 0.5, min: 0, max: 1, step: 0.05 } } },
  WAVE: { en: 'Wave', ko: '웨이브', icon: 'mod-wave', group: 'deform', props: { height: { def: 0.2, step: 0.05 }, width: { def: 1.5, min: 0.01, step: 0.1 }, speed: { def: 0.25, step: 0.05 } } },
  SMOOTH: { en: 'Smooth', ko: '스무스', icon: 'mod-smooth', group: 'deform', props: { factor: { def: 0.5, min: -2, max: 2, step: 0.05 }, iterations: { def: 3, min: 0, max: 100, step: 1, int: true } } },
  SIMPLE_DEFORM: { en: 'Simple Deform', ko: '간단 변형', icon: 'mod-deform', group: 'deform', props: { mode: { def: 'TWIST', options: ['TWIST', 'BEND', 'TAPER', 'STRETCH'] }, angle: { def: 45, step: 5 }, factor: { def: 0.5, step: 0.05 }, axis: { def: 'Z', options: ['X', 'Y', 'Z'] } } },
  CAST: { en: 'Cast', ko: '캐스트', icon: 'mod-cast', group: 'deform', props: { factor: { def: 0.5, min: -2, max: 2, step: 0.05 }, radius: { def: 0, min: 0, step: 0.1 } } },
  SHRINKWRAP: { en: 'Shrinkwrap', ko: '슈링크랩', icon: 'mod-shrink', group: 'deform', props: { object: { def: null, object: 'MESH' }, offset: { def: 0, step: 0.01 }, mode: { def: 'NEAREST_SURFACE', options: ['NEAREST_SURFACE', 'NEAREST_VERTEX', 'PROJECT'] }, axis: { def: 'Z', options: ['X', 'Y', 'Z'] }, positive: { def: true }, negative: { def: true } } },
  LATTICE: { en: 'Lattice', ko: '래티스', icon: 'mod-lattice', group: 'deform', props: { object: { def: null, object: 'LATTICE' } } },
  ARMATURE: { en: 'Armature', ko: '아마추어', icon: 'mod-armature', group: 'deform', props: { object: { def: null, object: 'ARMATURE' } } },
  NODES: { en: 'Geometry Nodes', ko: '지오메트리 노드', icon: 'mod-nodes', group: 'generate', props: {} },
};

export function createModifier(type, name) {
  const spec = MODIFIERS[type];
  if (!spec) throw new Error(`Unknown modifier: ${type}`);
  const mod = { type, name: name ?? spec.en, show: true, showRender: true };
  for (const [key, prop] of Object.entries(spec.props)) mod[key] = prop.def;
  return mod;
}

// ─────────────── subdivision

/** One Catmull-Clark step; boundary edges stay on their curve and UVs subdivide with the faces. */
export function catmullClark(mesh) {
  const edges = edgeMap(mesh);
  const faceCenters = mesh.faces.map((face) => faceCenter(mesh, face));
  const verts = [];
  const faceIdx = [];
  for (const c of faceCenters) { faceIdx.push(verts.length); verts.push(c); }
  const edgeIdx = new Map();
  const creases = mesh.marks?.crease ?? {};
  for (const [key, e] of edges) {
    const mid = v3.lerp(mesh.verts[e.a], mesh.verts[e.b], 0.5);
    let p = mid;
    if (e.faces.length === 2) {
      const c = v3.lerp(faceCenters[e.faces[0]], faceCenters[e.faces[1]], 0.5);
      // A creased edge stays on its line: between the smooth point and the edge's midpoint, by its crease value.
      p = v3.lerp(v3.lerp(mid, c, 0.5), mid, creases[key] ?? 0);
    }
    edgeIdx.set(key, verts.length);
    verts.push(p);
  }
  const adjFaces = mesh.verts.map(() => []);
  const adjEdges = mesh.verts.map(() => []);
  mesh.faces.forEach((face, f) => { for (const i of face) adjFaces[i].push(f); });
  for (const e of edges.values()) { adjEdges[e.a].push(e); adjEdges[e.b].push(e); }
  const vertIdx = mesh.verts.map((v, i) => {
    const boundary = adjEdges[i].filter((e) => e.faces.length < 2);
    let p;
    if (boundary.length >= 2) {
      // On a boundary: the cubic curve rule along its two boundary edges.
      const [o1, o2] = [boundary[0], boundary[1]].map((e) => mesh.verts[e.a === i ? e.b : e.a]);
      p = v3.add(v3.mul(v, 0.75), v3.mul(v3.add(o1, o2), 0.125));
    } else if (adjFaces[i].length === 0) p = v;
    else {
      const n = adjFaces[i].length;
      let F = [0, 0, 0];
      for (const f of adjFaces[i]) F = v3.add(F, faceCenters[f]);
      F = v3.mul(F, 1 / n);
      let R = [0, 0, 0];
      for (const e of adjEdges[i]) R = v3.add(R, v3.lerp(mesh.verts[e.a], mesh.verts[e.b], 0.5));
      R = v3.mul(R, 1 / adjEdges[i].length);
      p = v3.mul(v3.add(v3.add(F, v3.mul(R, 2)), v3.mul(v, n - 3)), 1 / n);
      // Three or more creased edges pin a corner; two make a crease line the vertex slides along.
      const creased = adjEdges[i].filter((e) => creases[edgeKey(e.a, e.b)] > 0);
      if (creased.length >= 2) {
        const amount = creased.reduce((s, e) => s + creases[edgeKey(e.a, e.b)], 0) / creased.length;
        let sharp = v;
        if (creased.length === 2) {
          const [o1, o2] = creased.map((e) => mesh.verts[e.a === i ? e.b : e.a]);
          sharp = v3.add(v3.mul(v, 0.75), v3.mul(v3.add(o1, o2), 0.125));
        }
        p = v3.lerp(p, sharp, amount);
      }
    }
    verts.push(p);
    return verts.length - 1;
  });
  const faces = [];
  const uvs = mesh.uvs ? [] : null;
  const faceMat = mesh.faceMat ? [] : null;
  mesh.faces.forEach((face, f) => {
    const n = face.length;
    const uv = mesh.uvs?.[f];
    let center = null;
    if (uv) { center = [0, 0]; for (const t of uv) { center[0] += t[0] / n; center[1] += t[1] / n; } }
    for (let i = 0; i < n; i++) {
      const [p, v, q] = [face[(i + n - 1) % n], face[i], face[(i + 1) % n]];
      faces.push([vertIdx[v], edgeIdx.get(edgeKey(v, q)), faceIdx[f], edgeIdx.get(edgeKey(p, v))]);
      if (uvs) {
        if (uv) {
          const [up, ui, uq] = [uv[(i + n - 1) % n], uv[i], uv[(i + 1) % n]];
          uvs.push([ui, [(ui[0] + uq[0]) / 2, (ui[1] + uq[1]) / 2], center, [(up[0] + ui[0]) / 2, (up[1] + ui[1]) / 2]]);
        } else uvs.push(null);
      }
      if (faceMat) faceMat.push(mesh.faceMat[f] ?? 0);
    }
  });
  const out = createMesh(verts, faces, { uvs, faceMat, smooth: mesh.smooth });
  // A partial crease fades level by level (a full one stays); seams and sharp edges just carry over to both halves.
  for (const kind of Object.keys(mesh.marks ?? {})) {
    for (const [key, value] of Object.entries(mesh.marks[kind])) {
      const m = edgeIdx.get(key);
      if (m == null) continue;
      const [a, b] = key.split('_').map(Number);
      const next = kind === 'crease' ? (value >= 1 ? 1 : Math.max(0, value - 0.25)) : value;
      if (!next) continue;
      setEdgeMark(out, kind, vertIdx[a], m, next);
      setEdgeMark(out, kind, m, vertIdx[b], next);
    }
  }
  // Loose edges carry over, split at their midpoints.
  for (const [a, b] of mesh.loose ?? []) {
    const m = edgeIdx.get(edgeKey(a, b));
    if (m == null) continue;
    out.loose.push([vertIdx[a], m], [m, vertIdx[b]]);
  }
  return out;
}

// ─────────────── the individual modifiers

function mirrorMesh(mesh, axis, merge, distance) {
  const out = cloneMesh(mesh);
  const n = mesh.verts.length;
  // Vertices on the plane meet their copy there.
  if (merge) for (const v of out.verts) if (Math.abs(v[axis]) <= distance) v[axis] = 0;
  const base = out.verts.length;
  for (let i = 0; i < n; i++) {
    const v = [...out.verts[i]];
    v[axis] = -v[axis];
    addVert(out, v, i);
  }
  mesh.faces.forEach((face, f) => {
    const g = addFace(out, [...face].reverse().map((i) => i + base), f);
    if (out.uvs && mesh.uvs?.[f]) out.uvs[g] = [...mesh.uvs[f]].reverse().map((t) => [...t]);
  });
  for (const [a, b] of mesh.loose ?? []) out.loose.push([a + base, b + base]);
  if (merge) mergeByDistance(out, Math.max(distance, 1e-6), true);
  return out;
}

function arrayMesh(mesh, count, offset) {
  const out = cloneMesh(mesh);
  const n = mesh.verts.length;
  for (let c = 1; c < count; c++) {
    const base = out.verts.length;
    for (let i = 0; i < n; i++) addVert(out, v3.add(mesh.verts[i], v3.mul(offset, c)), i);
    mesh.faces.forEach((face, f) => {
      const g = addFace(out, face.map((i) => i + base), f);
      if (out.uvs && mesh.uvs?.[f]) out.uvs[g] = mesh.uvs[f].map((t) => [...t]);
    });
    for (const [a, b] of mesh.loose ?? []) out.loose.push([a + base, b + base]);
  }
  return out;
}

function solidifyMesh(mesh, thickness) {
  const out = cloneMesh(mesh);
  const normals = vertexNormals(mesh);
  const n = mesh.verts.length;
  for (let i = 0; i < n; i++) addVert(out, v3.sub(mesh.verts[i], v3.mul(normals[i], thickness)), i);
  mesh.faces.forEach((face, f) => addFace(out, [...face].reverse().map((i) => i + n), f));
  const edges = edgeMap(mesh);
  mesh.faces.forEach((face, f) => {
    for (let i = 0; i < face.length; i++) {
      const [a, b] = [face[i], face[(i + 1) % face.length]];
      if (edges.get(edgeKey(a, b)).faces.length === 1) addFace(out, [b, a, a + n, b + n], f);
    }
  });
  return out;
}

/** Shortest edges first, each vertex once per round, until the face count reaches the ratio. */
export function decimateMesh(mesh, ratio) {
  const out = cloneMesh(mesh);
  const target = Math.max(4, Math.floor(mesh.faces.length * ratio));
  for (let round = 0; round < 64 && out.faces.length > target; round++) {
    const edges = [...edgeMap(out).values()].map((e) => ({ ...e, len: v3.dist(out.verts[e.a], out.verts[e.b]) })).sort((p, q) => p.len - q.len);
    const map = new Int32Array(out.verts.length).map((_, i) => i);
    const used = new Set();
    let removedFaces = 0;
    const need = out.faces.length - target;
    for (const e of edges) {
      if (removedFaces >= need) break;
      if (used.has(e.a) || used.has(e.b)) continue;
      used.add(e.a);
      used.add(e.b);
      out.verts[e.a] = v3.lerp(out.verts[e.a], out.verts[e.b], 0.5);
      map[e.b] = e.a;
      removedFaces += Math.max(1, e.faces.length);
    }
    if (!removedFaces) break;
    out.faces = out.faces.map((face) => {
      const list = [];
      for (const i of face) { const t = map[i]; if (list.at(-1) !== t) list.push(t); }
      while (list.length > 1 && list[0] === list.at(-1)) list.pop();
      return list;
    }).filter((face) => new Set(face).size >= 3);
    out.uvs = null;
    out.faceMat = null;
    compact(out);
  }
  return out;
}

function screwMesh(mesh, { angle, steps, height, axis }) {
  const k = axis === 'X' ? [1, 0, 0] : axis === 'Y' ? [0, 1, 0] : [0, 0, 1];
  const rotate = (p, a) => {
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    return v3.add(v3.add(v3.mul(p, cos), v3.mul(v3.cross(k, p), sin)), v3.mul(k, v3.dot(k, p) * (1 - cos)));
  };
  const edges = [...edgeMap(mesh).values()].map((e) => [e.a, e.b]);
  const n = mesh.verts.length;
  const out = createMesh([], [], { smooth: mesh.smooth });
  const closed = Math.abs(Math.abs(angle) - 360) < 1e-6 && Math.abs(height) < 1e-9;
  const rings = closed ? steps : steps + 1;
  for (let s = 0; s < rings; s++) {
    const t = s / steps;
    for (const v of mesh.verts) out.verts.push(v3.add(rotate(v, (angle * Math.PI / 180) * t), v3.mul(k, height * t)));
  }
  for (let s = 0; s < steps; s++) {
    const [p, q] = [s * n, ((s + 1) % rings) * n];
    for (const [a, b] of edges) out.faces.push([a + p, b + p, b + q, a + q]);
  }
  return out;
}

function wireframeMesh(mesh, thickness) {
  const out = createMesh([], []);
  const box = cubePrism(thickness / 2);
  for (const e of edgeMap(mesh).values()) {
    const [a, b] = [mesh.verts[e.a], mesh.verts[e.b]];
    const d = v3.norm(v3.sub(b, a));
    const ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = v3.norm(v3.cross(ref, d));
    const w = v3.cross(d, u);
    const base = out.verts.length;
    for (const end of [a, b]) for (const [x, y] of box) out.verts.push(v3.add(end, v3.add(v3.mul(u, x), v3.mul(w, y))));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      out.faces.push([base + i, base + j, base + j + 4, base + i + 4]);
    }
    out.faces.push([base + 3, base + 2, base + 1, base], [base + 4, base + 5, base + 6, base + 7]);
  }
  return out;
}
const cubePrism = (r) => [[-r, -r], [r, -r], [r, r], [-r, r]];

function simpleDeform(mesh, { mode, angle, factor, axis }) {
  const out = cloneMesh(mesh);
  const k = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2;
  const [u, w] = k === 0 ? [1, 2] : k === 1 ? [2, 0] : [0, 1];
  const box = boundingBox(mesh.verts);
  const size = box.max[k] - box.min[k] || 1;
  const rad = (angle * Math.PI) / 180;
  out.verts = mesh.verts.map((v) => {
    const t = (v[k] - box.min[k]) / size - 0.5;
    const p = [...v];
    if (mode === 'TWIST') {
      const a = rad * t;
      p[u] = v[u] * Math.cos(a) - v[w] * Math.sin(a);
      p[w] = v[u] * Math.sin(a) + v[w] * Math.cos(a);
    } else if (mode === 'BEND') {
      if (Math.abs(rad) > 1e-6) {
        const a = rad * t;
        const r = size / rad;
        p[u] = v[u] + r * (1 - Math.cos(a));
        p[k] = r * Math.sin(a);
      }
    } else if (mode === 'TAPER') {
      const s = 1 + factor * (t + 0.5);
      p[u] = v[u] * s;
      p[w] = v[w] * s;
    } else if (mode === 'STRETCH') {
      const s = 1 + factor;
      const side = 1 / Math.sqrt(Math.max(0.01, s));
      p[k] = v[k] * s;
      p[u] = v[u] * side;
      p[w] = v[w] * side;
    }
    return p;
  });
  return out;
}

/** Splits vertices along edges sharper than `angle`: each smooth patch of faces gets its own copy. */
function edgeSplit(mesh, angle) {
  const out = cloneMesh(mesh);
  const edges = edgeMap(mesh);
  const limit = (angle * Math.PI) / 180;
  const sharp = new Set();
  for (const [key, e] of edges) {
    if (e.faces.length !== 2) { sharp.add(key); continue; }
    const dot = v3.dot(faceNormal(mesh, mesh.faces[e.faces[0]]), faceNormal(mesh, mesh.faces[e.faces[1]]));
    if (Math.acos(Math.max(-1, Math.min(1, dot))) > limit) sharp.add(key);
  }
  const faceSets = mesh.verts.map(() => []);
  mesh.faces.forEach((face, f) => { for (const i of face) faceSets[i].push(f); });
  mesh.verts.forEach((_, v) => {
    const list = faceSets[v];
    const seen = new Set();
    let first = true;
    for (const start of list) {
      if (seen.has(start)) continue;
      const patch = [start];
      seen.add(start);
      for (let k = 0; k < patch.length; k++) {
        const face = mesh.faces[patch[k]];
        const i = face.indexOf(v);
        for (const u of [face[(i + 1) % face.length], face[(i + face.length - 1) % face.length]]) {
          const key = edgeKey(v, u);
          if (sharp.has(key)) continue;
          for (const g of edges.get(key).faces) if (!seen.has(g)) { seen.add(g); patch.push(g); }
        }
      }
      if (first) { first = false; continue; }
      const copy = addVert(out, [...mesh.verts[v]], v);
      for (const f of patch) out.faces[f] = out.faces[f].map((i) => (i === v ? copy : i));
    }
  });
  return out;
}

function shrinkwrap(mesh, target, offset) {
  const out = cloneMesh(mesh);
  if (!target?.verts?.length) return out;
  const tris = triangulateIndices(target).map((t) => t.map((i) => target.verts[i]));
  if (!tris.length) return out;
  const normalOf = tris.map(([a, b, c]) => v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a))));
  // A coarse grid of triangles keeps this usable on dense targets.
  const box = boundingBox(target.verts);
  const longest = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) || 1;
  const cell = longest / Math.max(1, Math.min(32, Math.ceil(Math.cbrt(tris.length))));
  const cellOf = (x, k) => Math.floor((x - box.min[k]) / cell);
  const grid = new Map();
  tris.forEach(([a, b, c], t) => {
    const lo = [0, 1, 2].map((k) => cellOf(Math.min(a[k], b[k], c[k]), k));
    const hi = [0, 1, 2].map((k) => cellOf(Math.max(a[k], b[k], c[k]), k));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const key = `${i},${j},${k}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(t);
    }
  });
  const steps = Math.ceil(longest / cell) + 3;
  out.verts = mesh.verts.map((v) => {
    let best = null;
    let dist = Infinity;
    let bestT = 0;
    const home = [0, 1, 2].map((k) => cellOf(v[k], k));
    // Rings of cells outward: stop once the next ring cannot hold anything nearer.
    for (let r = 0; r <= steps; r++) {
      if (best && (r - 1) * cell > dist) break;
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
        for (const t of grid.get(`${home[0] + i},${home[1] + j},${home[2] + k}`) ?? []) {
          const [a, b, c] = tris[t];
          const q = closestOnTriangle(v, a, b, c);
          const d = v3.dist(v, q);
          if (d < dist) { dist = d; best = q; bestT = t; }
        }
      }
    }
    return best ? v3.add(best, v3.mul(normalOf[bestT], offset)) : v;
  });
  return out;
}

/** Trilinear lattice deformation; `lattice`: { res: [u,v,w], rest: points, points: moved points } in the mesh's space. */
export function latticeDeform(mesh, lattice) {
  const out = cloneMesh(mesh);
  const [nu, nv, nw] = lattice.res;
  const at = (i, j, k) => i + j * nu + k * nu * nv;
  const box = boundingBox(lattice.rest);
  const size = [0, 1, 2].map((a) => box.max[a] - box.min[a] || 1);
  out.verts = mesh.verts.map((v) => {
    const q = [0, 1, 2].map((a) => (v[a] - box.min[a]) / size[a]);
    if (q.some((x) => x < 0 || x > 1)) return v;
    const [fu, fv, fw] = [q[0] * (nu - 1), q[1] * (nv - 1), q[2] * (nw - 1)];
    const [iu, iv, iw] = [Math.min(nu - 2, Math.floor(fu)), Math.min(nv - 2, Math.floor(fv)), Math.min(nw - 2, Math.floor(fw))];
    const [tu, tv, tw] = [fu - iu, fv - iv, fw - iw];
    let offset = [0, 0, 0];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
      const w = (a ? tu : 1 - tu) * (b ? tv : 1 - tv) * (c ? tw : 1 - tw);
      const i = at(iu + a, iv + b, iw + c);
      offset = v3.add(offset, v3.mul(v3.sub(lattice.points[i], lattice.rest[i]), w));
    }
    return v3.add(v, offset);
  });
  return out;
}

/** Runs one modifier. `ctx` supplies what a modifier needs from the scene: frame, other meshes, armature, node evaluator. */
export function applyModifier(mesh, mod, ctx = {}) {
  switch (mod.type) {
    case 'SUBSURF': {
      let out = mesh;
      for (let i = 0; i < Math.min(mod.levels, 6); i++) out = catmullClark(out);
      return out === mesh ? cloneMesh(mesh) : out;
    }
    case 'MIRROR': {
      let out = mesh;
      if (mod.x) out = mirrorMesh(out, 0, mod.merge, mod.mergeDistance);
      if (mod.y) out = mirrorMesh(out, 1, mod.merge, mod.mergeDistance);
      if (mod.z) out = mirrorMesh(out, 2, mod.merge, mod.mergeDistance);
      return out;
    }
    case 'ARRAY': return arrayMesh(mesh, mod.count, [mod.offsetX, mod.offsetY, mod.offsetZ]);
    case 'SOLIDIFY': return solidifyMesh(mesh, mod.thickness);
    case 'BEVEL': {
      const out = cloneMesh(mesh);
      out.selMode = 'vert';
      // Only edges sharper than the limit angle.
      const edges = edgeMap(out);
      const limit = (mod.angle * Math.PI) / 180;
      const sharpVerts = new Set();
      for (const e of edges.values()) {
        if (e.faces.length !== 2) continue;
        const dot = v3.dot(faceNormal(out, out.faces[e.faces[0]]), faceNormal(out, out.faces[e.faces[1]]));
        if (Math.acos(Math.max(-1, Math.min(1, dot))) >= limit) { sharpVerts.add(e.a); sharpVerts.add(e.b); }
      }
      out.selV = [...sharpVerts];
      if (mod.affect === 'VERTICES') bevelVerts(out, mod.width);
      else bevelEdges(out, mod.width, { segments: mod.segments ?? 1, profile: mod.profile ?? 0.5 });
      out.selV = [];
      out.selF = [];
      return out;
    }
    case 'DECIMATE': return mod.mode === 'PLANAR' ? decimatePlanar(mesh, mod.angle ?? 5) : decimateQuadric(mesh, mod.ratio);
    case 'BOOLEAN': {
      const other = mod.object != null ? ctx.meshInLocal?.(mod.object) : null;
      if (!other || !other.faces.length || !mesh.faces.length) return cloneMesh(mesh);
      const out = booleanMesh(mesh, other, mod.operation);
      out.smooth = mesh.smooth;
      return out;
    }
    case 'SCREW': return screwMesh(mesh, mod);
    case 'WELD': {
      const out = cloneMesh(mesh);
      mergeByDistance(out, mod.distance, true);
      return out;
    }
    case 'WIREFRAME': return wireframeMesh(mesh, mod.thickness);
    case 'TRIANGULATE': {
      const out = cloneMesh(mesh);
      const faces = [];
      out.faces.forEach((face) => {
        if (face.length === 3) faces.push(face);
        else for (let i = 1; i < face.length - 1; i++) faces.push([face[0], face[i], face[i + 1]]);
      });
      out.faces = faces;
      out.uvs = null;
      out.faceMat = null;
      return out;
    }
    case 'EDGE_SPLIT': return edgeSplit(mesh, mod.angle);
    case 'BUILD': {
      const out = cloneMesh(mesh);
      const t = Math.max(0, Math.min(1, ((ctx.frame ?? 1) - mod.start) / mod.length));
      const n = Math.floor(out.faces.length * t);
      out.faces = out.faces.slice(0, n);
      if (out.uvs) out.uvs = out.uvs.slice(0, n);
      if (out.faceMat) out.faceMat = out.faceMat.slice(0, n);
      out.loose = [];
      return compact(out);
    }
    case 'MASK': {
      const out = cloneMesh(mesh);
      const group = out.vgroups.find((g) => g.name === mod.group);
      if (!group) return out;
      const inside = (i) => (group.w[i] ?? 0) > 0;
      out.faces = out.faces.filter((face) => face.every(inside) !== mod.invert);
      out.uvs = null;
      out.faceMat = null;
      return compact(out);
    }
    case 'DISPLACE': {
      const out = cloneMesh(mesh);
      const normals = vertexNormals(mesh);
      out.verts = mesh.verts.map((v, i) => {
        const h = fbm(v[0] * mod.scale, v[1] * mod.scale, v[2] * mod.scale) - mod.midlevel;
        return v3.add(v, v3.mul(normals[i], h * mod.strength));
      });
      return out;
    }
    case 'WAVE': {
      const out = cloneMesh(mesh);
      const t = (ctx.frame ?? 1) * mod.speed;
      out.verts = mesh.verts.map((v) => {
        const r = Math.hypot(v[0], v[1]);
        return [v[0], v[1], v[2] + mod.height * Math.sin((r * Math.PI * 2) / mod.width - t)];
      });
      return out;
    }
    case 'SMOOTH': {
      const out = cloneMesh(mesh);
      smoothVerts(out, mod.factor, mod.iterations, false);
      return out;
    }
    case 'SIMPLE_DEFORM': return simpleDeform(mesh, mod);
    case 'CAST': {
      const out = cloneMesh(mesh);
      const box = boundingBox(mesh.verts);
      const center = v3.lerp(box.min, box.max, 0.5);
      const radius = mod.radius || mesh.verts.reduce((s, v) => s + v3.dist(v, center), 0) / (mesh.verts.length || 1);
      out.verts = mesh.verts.map((v) => v3.lerp(v, v3.add(center, v3.mul(v3.norm(v3.sub(v, center)), radius)), mod.factor));
      return out;
    }
    case 'SHRINKWRAP': {
      const target = mod.object != null ? ctx.meshInLocal?.(mod.object) : null;
      if (target?.verts?.length && mod.mode === 'PROJECT') { const out = cloneMesh(mesh); out.verts = projectOntoMesh(mesh.verts, target, mod.axis ?? 'Z', { positive: mod.positive !== false, negative: mod.negative !== false, offset: mod.offset }); return out; }
      if (target?.verts?.length && mod.mode === 'NEAREST_VERTEX') {
        const out = cloneMesh(mesh);
        out.verts = mesh.verts.map((v) => { let best = v; let d = Infinity; for (const u of target.verts) { const k = v3.dist(u, v); if (k < d) { d = k; best = u; } } return [...best]; });
        return out;
      }
      return shrinkwrap(mesh, target, mod.offset);
    }
    case 'LATTICE': {
      const lattice = mod.object != null ? ctx.latticeInLocal?.(mod.object) : null;
      return lattice ? latticeDeform(mesh, lattice) : cloneMesh(mesh);
    }
    case 'ARMATURE': {
      const out = cloneMesh(mesh);
      return ctx.deformByArmature ? ctx.deformByArmature(out, mod.object) : out;
    }
    case 'NODES': return ctx.evalGeometryNodes ? ctx.evalGeometryNodes(mesh, mod) : cloneMesh(mesh);
    case 'REMESH': return voxelRemesh(mesh, { voxel: mod.voxelSize, smooth: mod.smooth });
    case 'MULTIRES': return multiresEvaluate(mesh, mod, catmullClark);
    case 'SKIN': return skinMesh(mesh, mod);
    case 'OCEAN': return oceanMesh({ ...mod, time: (((ctx.frame ?? 1) - 1) / (ctx.fps ?? 24)) * mod.speed });
    default: return cloneMesh(mesh);
  }
}

/** Shape keys, then the visible modifiers. The input is not changed. */
export function evaluateMesh(mesh, modifiers = [], ctx = {}, { render = false } = {}) {
  let out = cloneMesh(mesh);
  for (const key of mesh.shapeKeys ?? []) {
    if (!key.value) continue;
    out.verts = out.verts.map((v, i) => v3.add(v, v3.mul(v3.sub(key.verts[i] ?? mesh.verts[i], mesh.verts[i]), key.value)));
  }
  out.shapeKeys = [];
  for (const mod of modifiers) {
    if (render ? mod.showRender === false : mod.show === false) continue;
    out = applyModifier(out, mod, ctx);
  }
  if (ctx.afterAll) out = ctx.afterAll(out) ?? out;
  return out;
}

export { selectAll };
