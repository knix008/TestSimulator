// Solid tools (Union, Subtract, Intersect, Trim, Split) on GeoMesh solids through manifold-3d.
// The WASM is loaded on first use only, so the app bundle pays nothing until a solid tool runs.
import { GeoMesh } from './mesh.js';
import { dot, sub, cross, norm, planeBasis, vcopy } from './math.js';
import { signedArea, pointInPolygon, interiorPoint } from './polygon.js';

let wasmPromise = null;

// Loads (once) and returns the manifold-3d module. options.locateFile is passed to the
// Emscripten loader (e.g. to serve manifold.wasm from a custom URL).
export function loadManifold(options = {}) {
  if (!wasmPromise) {
    wasmPromise = import('manifold-3d').then(async (mod) => {
      const wasm = await mod.default(options.locateFile ? { locateFile: options.locateFile } : undefined);
      wasm.setup();
      return wasm;
    }).catch((err) => { wasmPromise = null; throw err; });
  }
  return wasmPromise;
}

const NOT_SOLID = (which) => ({ error: 'not-solid', which });

// GeoMesh → manifold Mesh. Each triangle carries the index of its source face (faceID) and
// the run carries a reserved originalID, so results can be traced back to the inputs.
function toManifold(wasm, mesh, matrix) {
  const { Manifold, Mesh } = wasm;
  const index = new Map();
  const verts = [];
  for (const [id, p] of mesh.vertices) {
    let q = p;
    if (matrix) {
      const e = matrix.elements || matrix;
      q = { x: e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12], y: e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13], z: e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14] };
    }
    index.set(id, verts.length / 3);
    verts.push(q.x, q.y, q.z);
  }
  const tris = [], faceIDs = [], faces = [];
  for (const fid of mesh.faces.keys()) {
    const t = mesh._triangulateFace(fid);
    const k = faces.length;
    faces.push(fid);
    for (let i = 0; i < t.index.length; i += 3) {
      tris.push(index.get(t.verts[t.index[i]]), index.get(t.verts[t.index[i + 1]]), index.get(t.verts[t.index[i + 2]]));
      faceIDs.push(k);
    }
  }
  const mirrored = matrix ? det3(matrix) < 0 : false;
  if (mirrored) for (let i = 0; i < tris.length; i += 3) { const t = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = t; }
  const originalID = Manifold.reserveIDs(1);
  const m = new Mesh({
    numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris),
    faceID: new Uint32Array(faceIDs), runIndex: new Uint32Array([0, tris.length]), runOriginalID: new Uint32Array([originalID]),
  });
  m.merge();
  const solid = new Manifold(m);
  return { solid, originalID, faces, mesh };
}

function det3(m) {
  const e = m.elements || m;
  return e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]);
}

// manifold Mesh → GeoMesh: triangles of the same source face are merged back into polygon
// faces (with holes), keeping that face's materials.
function fromManifold(out, sources, options = {}) {
  const result = new GeoMesh({ tolerance: options.tolerance, gridSize: options.gridSize });
  const np = out.numProp;
  const P = out.vertProperties;
  const snap = (x) => Math.round(x * 1e6) / 1e6; // float32 noise → micrometres
  const vid = [];
  for (let i = 0; i < out.numVert; i++) vid.push(result._vertexAt({ x: snap(P[i * np]), y: snap(P[i * np + 1]), z: snap(P[i * np + 2]) }));
  const T = out.triVerts;
  const nTri = T.length / 3;
  // run of each triangle → originalID
  const runOf = new Uint32Array(nTri);
  const ri = out.runIndex, ro = out.runOriginalID;
  for (let r = 0; r + 1 < ri.length; r++) for (let t = ri[r] / 3; t < ri[r + 1] / 3; t++) runOf[t] = r;
  const groups = new Map();
  for (let t = 0; t < nTri; t++) {
    const a = vid[T[t * 3]], b = vid[T[t * 3 + 1]], c = vid[T[t * 3 + 2]];
    if (a === b || b === c || a === c) continue;
    const key = ro[runOf[t]] + ':' + out.faceID[t];
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { orig: ro[runOf[t]], face: out.faceID[t], tris: [] }));
    g.tris.push([a, b, c]);
  }
  for (const g of groups.values()) {
    const src = sources.get(g.orig);
    const F = src ? src.mesh.faces.get(src.faces[g.face]) : null;
    const props = F ? { material: F.material, backMaterial: F.backMaterial, uvTransform: F.uvTransform } : {};
    for (const comp of components(g.tris)) buildFaces(result, comp, props);
  }
  // coplanar neighbours with the same materials (e.g. two tops at one height) become one face
  const seams = [];
  for (const [e, fs] of result._eFaces) {
    if (fs.size !== 2) continue;
    const [f1, f2] = [...fs];
    const A = result.faces.get(f1), B = result.faces.get(f2);
    if (A.material === B.material && A.backMaterial === B.backMaterial && dot(A.normal, B.normal) > 1 - 1e-9 && result._facesCoplanar(f1, f2)) seams.push(e);
  }
  if (seams.length) result.eraseEdges(seams);
  // tidy up: dissolve vertices left in the middle of straight boundary runs
  for (const v of [...result.vertices.keys()]) if (result.vertices.has(v)) result._mergeCollinearAt(v);
  if (options.softenAngle) result.softenEdges(null, options.softenAngle);
  result.takeChanges();
  return result;
}

// Edge-connected components of a triangle list.
function components(tris) {
  const byEdge = new Map();
  const k = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  tris.forEach((t, i) => { for (let j = 0; j < 3; j++) { const key = k(t[j], t[(j + 1) % 3]); if (!byEdge.has(key)) byEdge.set(key, []); byEdge.get(key).push(i); } });
  const seen = new Uint8Array(tris.length);
  const out = [];
  for (let s = 0; s < tris.length; s++) {
    if (seen[s]) continue;
    const comp = [];
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop();
      comp.push(tris[i]);
      const t = tris[i];
      for (let j = 0; j < 3; j++) for (const n of byEdge.get(k(t[j], t[(j + 1) % 3]))) if (!seen[n]) { seen[n] = 1; st.push(n); }
    }
    out.push(comp);
  }
  return out;
}

// Boundary loops of a coplanar triangle patch → faces (outer CCW, holes CW).
function buildFaces(mesh, tris, props) {
  const half = new Map();
  for (const t of tris) for (let j = 0; j < 3; j++) half.set(t[j] + '>' + t[(j + 1) % 3], [t[j], t[(j + 1) % 3]]);
  const next = new Map();
  for (const [key, [a, b]] of half) {
    if (half.has(b + '>' + a)) continue; // interior edge
    if (!next.has(a)) next.set(a, []);
    next.get(a).push(b);
  }
  const loops = [];
  const used = new Set();
  for (const [a, outs] of next) {
    for (const b0 of outs) {
      if (used.has(a + '>' + b0)) continue;
      const loop = [a];
      let cur = b0, prev = a;
      used.add(a + '>' + b0);
      let guard = 0;
      while (cur !== a && guard++ < 1e6) {
        loop.push(cur);
        const cands = (next.get(cur) || []).filter((w) => !used.has(cur + '>' + w));
        if (!cands.length) break;
        const w = cands[0];
        used.add(cur + '>' + w);
        prev = cur; cur = w;
      }
      void prev;
      if (cur === a && loop.length >= 3) loops.push(loop);
    }
  }
  if (!loops.length) return;
  // plane of the patch from its largest triangle
  let n = { x: 0, y: 0, z: 0 }, best = -1;
  for (const t of tris) {
    const A = mesh.vertices.get(t[0]), B = mesh.vertices.get(t[1]), C = mesh.vertices.get(t[2]);
    const c = cross(sub(B, A), sub(C, A));
    const l = Math.hypot(c.x, c.y, c.z);
    if (l > best) { best = l; n = c; }
  }
  n = norm(n);
  const { u, v } = planeBasis(n);
  const o = vcopy(mesh.vertices.get(loops[0][0]));
  const to2 = (id) => { const d = sub(mesh.vertices.get(id), o); return { x: dot(d, u), y: dot(d, v) }; };
  const outers = [], holes = [];
  for (const l of loops) {
    const pts = l.map(to2);
    const a = signedArea(pts);
    (a > 0 ? outers : holes).push({ loop: l, pts, area: Math.abs(a), holes: [] });
  }
  for (const h of holes) {
    const ip = interiorPoint(h.pts.slice().reverse());
    let target = null;
    for (const o2 of outers) if (o2.area > h.area && pointInPolygon(ip, o2.pts) && (!target || o2.area < target.area)) target = o2;
    if (target) target.holes.push(h.loop);
  }
  for (const o2 of outers) mesh._newFace(o2.loop, o2.holes, props);
}

async function run(op, a, b, options = {}) {
  if (!a || !a.isSolid()) return NOT_SOLID('a');
  if (!b || !b.isSolid()) return NOT_SOLID('b');
  const wasm = await loadManifold(options);
  const A = toManifold(wasm, a, options.matrixA);
  const B = toManifold(wasm, b, options.matrixB);
  const sources = new Map([[A.originalID, A], [B.originalID, B]]);
  const anySoft = [...a.edges.values(), ...b.edges.values()].some((e) => e.soft);
  const opts = { softenAngle: options.softenAngle ?? (anySoft ? 30 : 0), tolerance: a.tolerance, gridSize: a.gridSize };
  const made = [];
  try {
    const results = op(A.solid, B.solid);
    const out = {};
    for (const [name, solid] of Object.entries(results)) {
      made.push(solid);
      out[name] = solid.isEmpty() ? new GeoMesh({ tolerance: a.tolerance }) : fromManifold(solid.getMesh(), sources, opts);
    }
    return out;
  } finally {
    for (const s of made) s.delete?.();
    A.solid.delete?.();
    B.solid.delete?.();
  }
}

// Each returns a Promise of { mesh } (or { error: 'not-solid', which: 'a' | 'b' }).
// options: { matrixA, matrixB (world transforms of the operands), softenAngle, locateFile }
export async function union(a, b, options) {
  const r = await run((x, y) => ({ mesh: x.add(y) }), a, b, options);
  return r;
}
export async function subtract(a, b, options) {
  return run((x, y) => ({ mesh: x.subtract(y) }), a, b, options);
}
export async function intersect(a, b, options) {
  return run((x, y) => ({ mesh: x.intersect(y) }), a, b, options);
}
// SketchUp Trim: a cuts b and stays → { a: copy of a, b: b − a }
export async function trim(a, b, options) {
  const r = await run((x, y) => ({ b: y.subtract(x) }), a, b, options);
  if (r.error) return r;
  return { a: a.clone(), b: r.b };
}
// SketchUp Split: → { aOnly: a − b, both: a ∩ b, bOnly: b − a }
export async function split(a, b, options) {
  return run((x, y) => ({ aOnly: x.subtract(y), both: x.intersect(y), bOnly: y.subtract(x) }), a, b, options);
}
// Outer Shell: union keeping only the outside (same as union for two solids).
export const outerShell = union;
