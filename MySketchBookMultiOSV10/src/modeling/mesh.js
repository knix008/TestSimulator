// GeoMesh: SketchUp-style "sticky" edge/face geometry.
//
// Model: vertices (points), edges (vertex pairs) and planar faces whose boundary loops are
// vertex id cycles (outer CCW seen from the front, holes CW). Edges stick together: a new
// edge is split where it touches or crosses existing edges, coincident vertices merge, and
// any new closed planar loop becomes a face (or splits the face it lies on).
//
// All ids (vertices, edges, faces, curves) share one integer counter, so an id names exactly
// one entity of any kind. Every lookup goes through spatial grids, so editing one corner of a
// big model only looks at the geometry nearby.
import {
  v3, vcopy, toV, add, sub, scale, addScaled, dot, cross, len, len2, dist, dist2, norm, neg, maxAbs,
  newell, planeBasis, canonicalNormal, closestSegSeg, projectOnSegment, applyMatrix, matrixDeterminant,
} from './math.js';
import { BoxGrid, PointGrid } from './grid.js';
import { signedArea, classifyPoint, interiorPoint, pointInPolygon, triangulate2D, lineLine2 } from './polygon.js';

const ekey = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
const TAU = Math.PI * 2;
const EDGE_SOFT = 1, EDGE_SMOOTH = 2, EDGE_HIDDEN = 4;

export class GeoMesh {
  constructor(options = {}) {
    this.tolerance = options.tolerance ?? 1e-5; // vertex merge distance (m)
    this.planeTolerance = options.planeTolerance ?? 1e-6; // coplanarity, relative to max(1 m, |coordinate|)
    this.gridSize = options.gridSize ?? 0.5; // edge/face grid cell (m)
    this.vertices = new Map(); // id -> {x, y, z}
    this.edges = new Map(); // id -> {a, b, soft, smooth, hidden, curve?}
    this.faces = new Map(); // id -> {outer, holes, normal, material, backMaterial, uvTransform?}
    this.curves = new Map(); // id -> {edges, kind, center, normal, radius}
    this.revision = 0;
    this._nextId = 1;
    this._changes = { vertices: new Set(), edges: new Set(), faces: new Set() };
    this._vEdges = new Map(); // vertex -> Set(edge)
    this._edgeKey = new Map(); // 'a_b' -> edge
    this._eFaces = new Map(); // edge -> Set(face)
    this._vgrid = new PointGrid(Math.max(this.tolerance * 4, 1e-9));
    this._egrid = new BoxGrid(this.gridSize);
    this._fgrid = new BoxGrid(this.gridSize);
    this._fc = new Map(); // face -> cached {info, tri}
  }

  // ───────────────────────── bookkeeping

  _id() { return this._nextId++; }
  _mark(kind, id) { this._changes[kind].add(id); this.revision++; }

  // Returns everything created, modified or removed since the last call (the renderer
  // checks mesh.faces.has(id) to tell removed from changed).
  takeChanges() {
    const c = this._changes;
    const out = { vertices: [...c.vertices], edges: [...c.edges], faces: [...c.faces], revision: this.revision };
    this._changes = { vertices: new Set(), edges: new Set(), faces: new Set() };
    return out;
  }
  get changed() {
    return new Set([...this._changes.faces, ...this._changes.edges]);
  }

  _ptol(p) { return this.planeTolerance * Math.max(1, maxAbs(p)); }
  pos(id) { return this.vertices.get(id); }

  // ───────────────────────── vertices

  _newVertex(p) {
    const id = this._id();
    const q = { x: p.x, y: p.y, z: p.z };
    this.vertices.set(id, q);
    this._vgrid.insert(id, q);
    this._vEdges.set(id, new Set());
    this._mark('vertices', id);
    return id;
  }

  // Existing vertex within the merge tolerance of p (closest one), or null.
  findVertex(p, tol = this.tolerance) {
    let best = null, bd = tol * tol;
    this._vgrid.near(p, (id) => {
      const q = this.vertices.get(id);
      if (!q) return;
      const d = dist2(p, q);
      if (d <= bd) { bd = d; best = id; }
    });
    return best;
  }

  _vertexAt(p) {
    const found = this.findVertex(p);
    return found ?? this._newVertex(p);
  }

  _dropVertexIfFree(id) {
    const s = this._vEdges.get(id);
    if (!s || s.size) return;
    this._vgrid.remove(id, this.vertices.get(id));
    this.vertices.delete(id);
    this._vEdges.delete(id);
    this._mark('vertices', id);
  }

  // Moves vertices and keeps every index (grids, face planes, triangulation caches) current.
  _moveVertices(ids, fn) {
    const edges = new Set(), faces = new Set();
    for (const id of ids) {
      const p = this.vertices.get(id);
      if (!p) continue;
      this._vgrid.remove(id, p);
      const q = fn(p);
      p.x = q.x; p.y = q.y; p.z = q.z;
      this._vgrid.insert(id, p);
      this._mark('vertices', id);
      for (const e of this._vEdges.get(id)) edges.add(e);
    }
    for (const e of edges) {
      this._indexEdge(e);
      this._mark('edges', e);
      for (const f of this._eFaces.get(e)) faces.add(f);
    }
    for (const f of faces) this._touchFace(f, true);
    return faces;
  }

  // ───────────────────────── edges

  edgeBetween(a, b) { return this._edgeKey.get(ekey(a, b)) ?? null; }

  _indexEdge(id) {
    const e = this.edges.get(id);
    const a = this.vertices.get(e.a), b = this.vertices.get(e.b);
    const t = this.tolerance;
    this._egrid.insert(id, { x: Math.min(a.x, b.x) - t, y: Math.min(a.y, b.y) - t, z: Math.min(a.z, b.z) - t },
      { x: Math.max(a.x, b.x) + t, y: Math.max(a.y, b.y) + t, z: Math.max(a.z, b.z) + t });
  }

  _newEdge(a, b, flags = null) {
    if (a === b) return null;
    const k = ekey(a, b);
    const old = this._edgeKey.get(k);
    if (old !== undefined) return old;
    const id = this._id();
    const e = { a, b, soft: false, smooth: false, hidden: false };
    if (flags) {
      e.soft = !!flags.soft; e.smooth = !!flags.smooth; e.hidden = !!flags.hidden;
      if (flags.curve != null && this.curves.has(flags.curve)) { e.curve = flags.curve; this.curves.get(flags.curve).edges.push(id); }
    }
    this.edges.set(id, e);
    this._edgeKey.set(k, id);
    this._vEdges.get(a).add(id);
    this._vEdges.get(b).add(id);
    this._eFaces.set(id, new Set());
    this._indexEdge(id);
    this._mark('edges', id);
    return id;
  }

  // Removes an edge record (faces using it must have been removed or rewritten first).
  _removeEdge(id) {
    const e = this.edges.get(id);
    if (!e) return;
    this.edges.delete(id);
    this._edgeKey.delete(ekey(e.a, e.b));
    this._vEdges.get(e.a)?.delete(id);
    this._vEdges.get(e.b)?.delete(id);
    this._eFaces.delete(id);
    this._egrid.remove(id);
    if (e.curve != null) {
      const c = this.curves.get(e.curve);
      if (c) {
        const i = c.edges.indexOf(id);
        if (i >= 0) c.edges.splice(i, 1);
        if (!c.edges.length) this.curves.delete(e.curve);
      }
    }
    this._mark('edges', id);
  }

  // Splits edge id at the given vertices ([{t, v}], t along a→b); faces using it get the
  // new vertices inserted in their loops. Returns the chain of new edge ids.
  _splitEdge(id, cuts) {
    const e = this.edges.get(id);
    if (!e) return [];
    cuts = cuts.filter((c) => c.v !== e.a && c.v !== e.b).sort((p, q) => p.t - q.t);
    const chain = [e.a];
    for (const c of cuts) if (chain[chain.length - 1] !== c.v) chain.push(c.v);
    if (chain[chain.length - 1] !== e.b) chain.push(e.b);
    if (chain.length <= 2) return [id];
    const faces = [...this._eFaces.get(id)];
    const flags = { soft: e.soft, smooth: e.smooth, hidden: e.hidden };
    const curveId = e.curve;
    for (const f of faces) this._unregisterFaceEdges(f);
    // splice the inner vertices into every loop that runs along a-b
    const inner = chain.slice(1, -1);
    for (const f of faces) {
      const F = this.faces.get(f);
      for (const loop of [F.outer, ...F.holes]) {
        for (let i = 0; i < loop.length; i++) {
          const p = loop[i], q = loop[(i + 1) % loop.length];
          if (p === e.a && q === e.b) { loop.splice(i + 1, 0, ...inner); break; }
          if (p === e.b && q === e.a) { loop.splice(i + 1, 0, ...[...inner].reverse()); break; }
        }
      }
    }
    // replace the curve membership in place (keeps the curve's edge order)
    let curveIndex = -1;
    if (curveId != null) {
      const c = this.curves.get(curveId);
      curveIndex = c ? c.edges.indexOf(id) : -1;
    }
    const saveCurve = e.curve;
    delete e.curve;
    this._removeEdge(id);
    const pieces = [];
    for (let i = 0; i + 1 < chain.length; i++) pieces.push(this._newEdge(chain[i], chain[i + 1], flags));
    if (saveCurve != null && this.curves.has(saveCurve)) {
      const c = this.curves.get(saveCurve);
      for (const p of pieces) this.edges.get(p).curve = saveCurve;
      if (curveIndex >= 0) c.edges.splice(curveIndex, 1, ...pieces);
      else c.edges.push(...pieces);
    }
    for (const f of faces) { this._registerFaceEdges(f); this._touchFace(f, false); }
    return pieces;
  }

  // ───────────────────────── faces

  _loopsOf(F) { return F.holes.length ? [F.outer, ...F.holes] : [F.outer]; }

  _registerFaceEdges(fid) {
    const F = this.faces.get(fid);
    for (const loop of this._loopsOf(F)) {
      for (let i = 0; i < loop.length; i++) {
        const e = this._newEdge(loop[i], loop[(i + 1) % loop.length]);
        this._eFaces.get(e).add(fid);
      }
    }
  }
  _unregisterFaceEdges(fid) {
    const F = this.faces.get(fid);
    for (const loop of this._loopsOf(F)) {
      for (let i = 0; i < loop.length; i++) {
        const e = this._edgeKey.get(ekey(loop[i], loop[(i + 1) % loop.length]));
        if (e !== undefined) this._eFaces.get(e)?.delete(fid);
      }
    }
  }

  _computeNormal(loop) {
    const n = norm(newell(loop.map((v) => this.vertices.get(v))));
    return n;
  }

  // Re-index a face after its loops or vertices changed.
  _touchFace(fid, recomputeNormal) {
    const F = this.faces.get(fid);
    if (!F) return;
    if (recomputeNormal) {
      const n = this._computeNormal(F.outer);
      if (len2(n) > 0) F.normal = n;
    }
    this._fc.delete(fid);
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (const v of F.outer) {
      const p = this.vertices.get(v);
      if (p.x < mnx) mnx = p.x; if (p.y < mny) mny = p.y; if (p.z < mnz) mnz = p.z;
      if (p.x > mxx) mxx = p.x; if (p.y > mxy) mxy = p.y; if (p.z > mxz) mxz = p.z;
    }
    const t = this.tolerance;
    this._fgrid.insert(fid, { x: mnx - t, y: mny - t, z: mnz - t }, { x: mxx + t, y: mxy + t, z: mxz + t });
    this._mark('faces', fid);
  }

  _sameCycle(a, b) {
    if (a.length !== b.length) return false;
    const i = b.indexOf(a[0]);
    if (i < 0) return false;
    const n = a.length;
    let fwd = true, back = true;
    for (let k = 0; k < n && (fwd || back); k++) {
      if (a[k] !== b[(i + k) % n]) fwd = false;
      if (a[k] !== b[(i - k + n) % n]) back = false;
    }
    return fwd || back;
  }

  // A face with exactly this outer loop (either orientation), or null.
  _faceWithOuter(loop) {
    const e = this._edgeKey.get(ekey(loop[0], loop[1]));
    if (e === undefined) return null;
    for (const f of this._eFaces.get(e)) if (this._sameCycle(this.faces.get(f).outer, loop)) return f;
    return null;
  }

  // Creates a face from vertex loops. The outer loop order defines the normal; holes are
  // re-ordered to run the other way. Missing edges are created.
  _newFace(outer, holes = [], props = {}) {
    outer = outer.slice();
    if (outer.length < 3) return null;
    const dup = this._faceWithOuter(outer);
    if (dup !== null && !props.allowDuplicate) return dup;
    const n = this._computeNormal(outer);
    if (len2(n) === 0) return null;
    holes = holes.filter((h) => h.length >= 3).map((h) => {
      const hn = newell(h.map((v) => this.vertices.get(v)));
      return dot(hn, n) > 0 ? h.slice().reverse() : h.slice();
    });
    const id = this._id();
    const F = { outer, holes, normal: n, material: props.material ?? null, backMaterial: props.backMaterial ?? null };
    if (props.uvTransform) F.uvTransform = { ...props.uvTransform };
    this.faces.set(id, F);
    this._registerFaceEdges(id);
    this._touchFace(id, false);
    return id;
  }

  _setFaceLoops(fid, outer, holes) {
    const F = this.faces.get(fid);
    this._unregisterFaceEdges(fid);
    F.outer = outer.slice();
    const n = this._computeNormal(F.outer);
    if (len2(n) > 0) F.normal = n;
    F.holes = holes.filter((h) => h.length >= 3).map((h) => {
      const hn = newell(h.map((v) => this.vertices.get(v)));
      return dot(hn, F.normal) > 0 ? h.slice().reverse() : h.slice();
    });
    this._registerFaceEdges(fid);
    this._touchFace(fid, false);
  }

  _removeFace(fid) {
    if (!this.faces.has(fid)) return;
    this._unregisterFaceEdges(fid);
    this.faces.delete(fid);
    this._fgrid.remove(fid);
    this._fc.delete(fid);
    this._mark('faces', fid);
  }

  _reverseFace(fid, swapMaterials) {
    const F = this.faces.get(fid);
    F.outer.reverse();
    for (const h of F.holes) h.reverse();
    F.normal = neg(F.normal);
    if (swapMaterials) { const m = F.material; F.material = F.backMaterial; F.backMaterial = m; }
    this._touchFace(fid, false);
  }

  // Plane frame + 2D projection of a face (cached).
  _info(fid) {
    let c = this._fc.get(fid);
    if (c && c.info) return c.info;
    const F = this.faces.get(fid);
    const n = F.normal;
    const { u, v } = planeBasis(n);
    const o = this.vertices.get(F.outer[0]);
    const proj = (id) => { const p = this.vertices.get(id); const d = sub(p, o); return { x: dot(d, u), y: dot(d, v) }; };
    let dsum = 0;
    for (const id of F.outer) dsum += dot(n, this.vertices.get(id));
    const info = { n, u, v, o: vcopy(o), d: dsum / F.outer.length, outer2: F.outer.map(proj), holes2: F.holes.map((h) => h.map(proj)) };
    if (!c) { c = {}; this._fc.set(fid, c); }
    c.info = info;
    return info;
  }

  _frame(n, o) {
    const { u, v } = planeBasis(n);
    return { n, u, v, o: vcopy(o), d: dot(n, o) };
  }
  _to2(frame, p) { const d = sub(p, frame.o); return { x: dot(d, frame.u), y: dot(d, frame.v) }; }
  _from2(frame, q) { return add(frame.o, add(scale(frame.u, q.x), scale(frame.v, q.y))); }
  _onPlane(frame, p) { return Math.abs(dot(frame.n, p) - frame.d) <= this._ptol(p); }

  // 'in' | 'on' | 'out' of a 3D point (assumed on the face plane) against a face.
  _classifyInFace(fid, p) {
    const info = this._info(fid);
    return classifyPoint(this._to2(info, p), info.outer2, info.holes2, this.tolerance);
  }

  _facesCoplanar(f1, f2) {
    const a = this.faces.get(f1), b = this.faces.get(f2);
    if (Math.abs(dot(a.normal, b.normal)) < 1 - 1e-9) return false;
    const ia = this._info(f1);
    for (const v of b.outer.slice(0, 3)) {
      const p = this.vertices.get(v);
      if (Math.abs(Math.abs(dot(ia.n, p) - ia.d)) > this._ptol(p) * 10) return false;
    }
    return true;
  }

  // +1 if the face runs a→b, -1 if b→a, 0 if the edge is not on it.
  _dirInFace(fid, a, b) {
    const F = this.faces.get(fid);
    for (const loop of this._loopsOf(F)) {
      const n = loop.length;
      for (let i = 0; i < n; i++) {
        if (loop[i] === a) {
          if (loop[(i + 1) % n] === b) return 1;
          if (loop[(i - 1 + n) % n] === b) return -1;
        }
      }
    }
    return 0;
  }

  // ───────────────────────── adding edges

  // addEdge(p, q, { planeNormal }) → { edges, created, faces }
  //   edges: every edge now lying along p-q (new or existing), created: the new ones,
  //   faces: faces created (including the pieces of split faces).
  addEdge(p, q, options = {}) {
    const seg = this._insertSegment(toV(p), toV(q));
    const faces = this._integrate(seg.created, options);
    return { edges: seg.edges, created: seg.created, faces };
  }

  _insertSegment(P0, Q0) {
    const tol = this.tolerance, tol2 = tol * tol;
    const va = this._vertexAt(P0);
    const vb = this._vertexAt(Q0);
    if (va === vb) return { edges: [], created: [] };
    const P = this.vertices.get(va), Q = this.vertices.get(vb);
    const lenPQ = dist(P, Q);
    const splits = [{ s: 0, v: va }, { s: 1, v: vb }];
    const edgeCuts = new Map();
    const cut = (eid, t, v) => { let l = edgeCuts.get(eid); if (!l) edgeCuts.set(eid, (l = [])); l.push({ t, v }); };
    const cands = this._egrid.querySegment(P, Q, tol * 2);
    const tolS = tol / lenPQ;
    for (const eid of cands) {
      const e = this.edges.get(eid);
      if (!e) continue;
      const A = this.vertices.get(e.a), B = this.vertices.get(e.b);
      const shared = e.a === va || e.a === vb || e.b === va || e.b === vb;
      const pa = projectOnSegment(A, P, Q), pb = projectOnSegment(B, P, Q);
      if (pa.d2 <= tol2 && pb.d2 <= tol2) {
        // collinear: endpoints of each segment inside the other become split points
        if (pa.t > tolS && pa.t < 1 - tolS) splits.push({ s: pa.t, v: e.a });
        if (pb.t > tolS && pb.t < 1 - tolS) splits.push({ s: pb.t, v: e.b });
        const lenAB = dist(A, B), tolT = tol / lenAB;
        for (const v of [va, vb]) {
          if (v === e.a || v === e.b) continue;
          const pr = projectOnSegment(this.vertices.get(v), A, B);
          if (pr.d2 <= tol2 && pr.t > tolT && pr.t < 1 - tolT) cut(eid, pr.t, v);
        }
        continue;
      }
      if (shared) continue; // touching at a common vertex only
      const r = closestSegSeg(P, Q, A, B);
      if (r.d2 > tol2) continue;
      const lenAB = dist(A, B), tolT = tol / lenAB;
      const sEnd = r.s <= tolS ? 0 : r.s >= 1 - tolS ? 1 : null;
      const tEnd = r.t <= tolT ? 0 : r.t >= 1 - tolT ? 1 : null;
      if (tEnd !== null) {
        if (sEnd === null) splits.push({ s: r.s, v: tEnd === 0 ? e.a : e.b });
      } else if (sEnd !== null) {
        cut(eid, r.t, sEnd === 0 ? va : vb);
      } else {
        const X = this._vertexAt(scale(add(r.cp, r.cq), 0.5));
        cut(eid, r.t, X);
        splits.push({ s: r.s, v: X });
      }
    }
    for (const [eid, cuts] of edgeCuts) this._splitEdge(eid, cuts);
    splits.sort((a, b) => a.s - b.s);
    const edges = [], created = [];
    let prev = null;
    for (const sp of splits) {
      if (prev !== null && sp.v !== prev) {
        const old = this._edgeKey.get(ekey(prev, sp.v));
        if (old !== undefined) edges.push(old);
        else { const id = this._newEdge(prev, sp.v); edges.push(id); created.push(id); }
      }
      prev = sp.v;
    }
    return { edges, created };
  }

  // Face finding around new edges: faces they lie in are re-split; new closed planar loops
  // in free space become faces. Only geometry near the new edges is visited.
  _integrate(newEdges, options = {}) {
    const created = [];
    if (!newEdges.length) return created;
    const newSet = new Set(newEdges);
    const covered = new Map(); // edge -> [normals of faces it lies inside]
    const affected = new Set();
    for (const eid of newEdges) {
      const e = this.edges.get(eid);
      if (!e) continue;
      const A = this.vertices.get(e.a), B = this.vertices.get(e.b);
      const M = scale(add(A, B), 0.5);
      const t = this.tolerance;
      const cands = this._fgrid.queryBox({ x: M.x - t, y: M.y - t, z: M.z - t }, { x: M.x + t, y: M.y + t, z: M.z + t });
      for (const fid of cands) {
        if (!this.faces.has(fid)) continue;
        const info = this._info(fid);
        if (Math.abs(dot(info.n, A) - info.d) > this._ptol(A) || Math.abs(dot(info.n, B) - info.d) > this._ptol(B)) continue;
        if (this._classifyInFace(fid, M) === 'in') {
          affected.add(fid);
          let l = covered.get(eid);
          if (!l) covered.set(eid, (l = []));
          l.push(info.n);
        }
      }
    }
    for (const fid of affected) created.push(...this._rebuildFace(fid));

    const freeFaces = [];
    const planes = []; // {frame, visited}
    const planeFor = (n, d) => {
      for (const pl of planes) if (Math.abs(dot(pl.frame.n, n)) > 1 - 1e-9 && Math.abs(pl.frame.d - d) <= this.planeTolerance * Math.max(1, Math.abs(d))) return pl;
      return null;
    };
    for (const eid of newEdges) {
      const e = this.edges.get(eid);
      if (!e) continue;
      const A = this.vertices.get(e.a);
      for (const n of this._candidateNormals(eid, options)) {
        const cov = covered.get(eid);
        if (cov && cov.some((m) => Math.abs(dot(m, n)) > 1 - 1e-9)) continue;
        const d = dot(n, A);
        let pl = planeFor(n, d);
        if (!pl) { pl = { frame: this._frame(n, A), visited: new Set() }; planes.push(pl); }
        for (const [from, to] of [[e.a, e.b], [e.b, e.a]]) {
          if (pl.visited.has(from + '>' + to)) continue;
          const cycle = this._traceCycle(from, to, pl.frame, pl.visited);
          if (!cycle) continue;
          for (const loop of splitLoops(cycle)) {
            const pts = loop.map((v) => this._to2(pl.frame, this.vertices.get(v)));
            const area = signedArea(pts);
            if (area <= this.tolerance * this.tolerance) continue;
            let hasNew = false;
            for (let i = 0; i < loop.length && !hasNew; i++) hasNew = newSet.has(this._edgeKey.get(ekey(loop[i], loop[(i + 1) % loop.length])));
            if (!hasNew) continue;
            if (this._faceWithOuter(loop) !== null) continue;
            const fid = this._createFreeFace(loop, pts, pl.frame, options);
            if (fid !== null) { created.push(fid); freeFaces.push(fid); }
          }
        }
      }
    }
    // a face that closes a small shell (a box drawn edge by edge) orients the shell outward
    for (const f of freeFaces) if (this.faces.has(f)) this._fixClosedShell(f);
    return created;
  }

  _fixClosedShell(fid, limit = 2000) {
    const comp = [fid];
    const seen = new Set(comp);
    for (let qi = 0; qi < comp.length; qi++) {
      for (const e of this.boundaryEdges(comp[qi])) {
        const fs = this._eFaces.get(e);
        if (fs.size !== 2) return false; // open or non-manifold: leave it alone
        for (const g of fs) if (!seen.has(g)) { if (comp.length >= limit) return false; seen.add(g); comp.push(g); }
      }
    }
    this._orientShell(comp);
    return true;
  }

  // Plane normals (canonical sign) through an edge: one per non-collinear neighbouring edge,
  // plus the caller's drawing plane hint.
  _candidateNormals(eid, options) {
    const e = this.edges.get(eid);
    const A = this.vertices.get(e.a), B = this.vertices.get(e.b);
    const dir = sub(B, A);
    const L = len(dir);
    const out = [];
    const push = (n) => {
      n = canonicalNormal(norm(n));
      if (len2(n) === 0) return;
      for (const m of out) if (Math.abs(dot(m, n)) > 1 - 1e-9) return;
      out.push(n);
    };
    for (const w of [e.a, e.b]) {
      for (const e2 of this._vEdges.get(w)) {
        if (e2 === eid) continue;
        const E = this.edges.get(e2);
        const C = this.vertices.get(E.a === w ? E.b : E.a);
        const n = cross(dir, sub(C, A));
        if (len(n) <= 1e-9 * L * dist(C, A)) continue;
        push(n);
      }
    }
    if (options.planeNormal) {
      const h = toV(options.planeNormal);
      if (Math.abs(dot(norm(h), dir)) < 1e-6 * L) push(h);
    }
    return out;
  }

  // Next vertex when walking cur with the region on the left: the first edge clockwise from
  // the way back (keeps the smallest face on the left).
  _nextInPlane(prev, cur, frame) {
    const C = this.vertices.get(cur), Pp = this.vertices.get(prev);
    const rb = this._to2(frame, Pp), c2 = this._to2(frame, C);
    const thr = Math.atan2(rb.y - c2.y, rb.x - c2.x);
    let best = prev, bestD = TAU + 1;
    for (const eid of this._vEdges.get(cur)) {
      const e = this.edges.get(eid);
      const w = e.a === cur ? e.b : e.a;
      if (w === prev) continue;
      const W = this.vertices.get(w);
      if (!this._onPlane(frame, W)) continue;
      const w2 = this._to2(frame, W);
      let dlt = thr - Math.atan2(w2.y - c2.y, w2.x - c2.x);
      while (dlt <= 1e-12) dlt += TAU;
      while (dlt > TAU) dlt -= TAU;
      if (dlt < bestD) { bestD = dlt; best = w; }
    }
    return best;
  }

  _traceCycle(from, to, frame, visited, limit = 200000) {
    const seq = [from];
    let prev = from, cur = to;
    visited.add(from + '>' + to);
    for (let steps = 0; steps < limit; steps++) {
      const next = this._nextInPlane(prev, cur, frame);
      if (cur === from && next === to) return seq;
      seq.push(cur);
      visited.add(cur + '>' + next);
      prev = cur; cur = next;
    }
    return null;
  }

  _createFreeFace(loop, pts, frame, options) {
    // Orientation: floor-level faces always look up (interior app: floors face the room);
    // otherwise follow a coplanar neighbour, then any neighbour (consistent shells: a
    // shared edge runs opposite ways), then "up" for horizontal faces, then the hint.
    const n = frame.n;
    const horizontal = Math.abs(n.y) > 0.99;
    let reverse = null;
    if (horizontal && Math.abs(frame.d * Math.sign(n.y) - (options.groundY ?? 0)) <= this.tolerance) reverse = n.y < 0;
    for (const wantCoplanar of [true, false]) {
      for (let i = 0; i < loop.length && reverse === null; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        for (const g of this._eFaces.get(this._edgeKey.get(ekey(a, b)))) {
          if (wantCoplanar !== Math.abs(dot(this.faces.get(g).normal, n)) > 1 - 1e-9) continue;
          const d = this._dirInFace(g, a, b);
          if (d !== 0) { reverse = d === 1; break; }
        }
      }
    }
    if (reverse === null) {
      if (horizontal) reverse = n.y < 0;
      else if (options.planeNormal) reverse = dot(n, toV(options.planeNormal)) < 0;
      else reverse = false;
    }
    // coplanar faces lying entirely inside the loop become its holes
    let mn = { x: Infinity, y: Infinity, z: Infinity }, mx = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const v of loop) {
      const p = this.vertices.get(v);
      mn = { x: Math.min(mn.x, p.x), y: Math.min(mn.y, p.y), z: Math.min(mn.z, p.z) };
      mx = { x: Math.max(mx.x, p.x), y: Math.max(mx.y, p.y), z: Math.max(mx.z, p.z) };
    }
    const inner = [];
    for (const fid of this._fgrid.queryBox(mn, mx)) {
      const G = this.faces.get(fid);
      if (!G) continue;
      if (Math.abs(dot(G.normal, n)) < 1 - 1e-9) continue;
      let ok = true;
      for (const v of G.outer) {
        const p = this.vertices.get(v);
        if (!this._onPlane(frame, p) || classifyPoint(this._to2(frame, p), pts, [], this.tolerance) !== 'in') { ok = false; break; }
      }
      if (ok) inner.push(fid);
    }
    // keep only the outermost inner faces
    const holes = [];
    for (const fid of inner) {
      const G = this.faces.get(fid);
      const p = this.vertices.get(G.outer[0]);
      let nested = false;
      for (const other of inner) {
        if (other === fid) continue;
        const oi = this._info(other);
        if (classifyPoint(this._to2(oi, p), oi.outer2, [], this.tolerance) === 'in') { nested = true; break; }
      }
      if (!nested) holes.push(G.outer.slice());
    }
    const outer = reverse ? loop.slice().reverse() : loop.slice();
    return this._newFace(outer, holes);
  }

  // Splits the regions of one face again after edges were added inside it.
  _rebuildFace(fid) {
    const F = this.faces.get(fid);
    if (!F) return [];
    const info = this._info(fid);
    const frame = { n: info.n, u: info.u, v: info.v, o: info.o, d: info.d };
    const edgeIds = this._edgesInFaceClosure(fid);
    const outer2 = info.outer2, holes2 = info.holes2;
    const regions = this._regionsFromEdges(edgeIds, frame, (q) => classifyPoint(q, outer2, holes2, this.tolerance) === 'in');
    if (!regions.length) return [];
    // unchanged?
    const r0 = regions[0];
    if (regions.length === 1 && this._sameCycle(r0.outer, F.outer) && r0.holes.length === F.holes.length &&
      r0.holes.every((h) => F.holes.some((g) => this._sameCycle(h, g)))) return [];
    const props = { material: F.material, backMaterial: F.backMaterial, uvTransform: F.uvTransform };
    // the face id stays with the region that keeps its outer boundary (else the largest)
    const keepAt = regions.findIndex((r) => this._sameCycle(r.outer, F.outer));
    if (keepAt > 0) regions.unshift(...regions.splice(keepAt, 1));
    this._setFaceLoops(fid, regions[0].outer, regions[0].holes);
    const created = [];
    for (let i = 1; i < regions.length; i++) {
      const id = this._newFace(regions[i].outer, regions[i].holes, props);
      if (id !== null) created.push(id);
    }
    return created;
  }

  // Edges lying in a face's plane with their midpoint inside or on the face.
  _edgesInFaceClosure(fid) {
    const F = this.faces.get(fid);
    const info = this._info(fid);
    let mn = { x: Infinity, y: Infinity, z: Infinity }, mx = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const v of F.outer) {
      const p = this.vertices.get(v);
      mn = { x: Math.min(mn.x, p.x), y: Math.min(mn.y, p.y), z: Math.min(mn.z, p.z) };
      mx = { x: Math.max(mx.x, p.x), y: Math.max(mx.y, p.y), z: Math.max(mx.z, p.z) };
    }
    const t = this.tolerance;
    const out = [];
    for (const eid of this._egrid.queryBox(add(mn, v3(-t, -t, -t)), add(mx, v3(t, t, t)))) {
      const e = this.edges.get(eid);
      if (!e) continue;
      const A = this.vertices.get(e.a), B = this.vertices.get(e.b);
      if (Math.abs(dot(info.n, A) - info.d) > this._ptol(A) || Math.abs(dot(info.n, B) - info.d) > this._ptol(B)) continue;
      const M = scale(add(A, B), 0.5);
      if (classifyPoint(this._to2(info, M), info.outer2, info.holes2, t) !== 'out') out.push(eid);
    }
    return out;
  }

  // Planar arrangement of a set of edges: returns the bounded regions (outer CCW about
  // frame.n, holes CW) whose interior point passes keep(point2D), largest first.
  _regionsFromEdges(edgeIds, frame, keep) {
    const adj = new Map();
    const p2 = new Map();
    const P2 = (v) => { let q = p2.get(v); if (!q) { q = this._to2(frame, this.vertices.get(v)); p2.set(v, q); } return q; };
    for (const eid of edgeIds) {
      const e = this.edges.get(eid);
      if (!e) continue;
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push(e.b);
      adj.get(e.b).push(e.a);
    }
    // neighbours sorted by angle so "next clockwise" is an index step
    const order = new Map();
    for (const [v, list] of adj) {
      const c = P2(v);
      const withAng = list.map((w) => { const q = P2(w); return { w, a: Math.atan2(q.y - c.y, q.x - c.x) }; });
      withAng.sort((x, y) => x.a - y.a);
      const ws = withAng.map((x) => x.w);
      const idx = new Map(ws.map((w, i) => [w, i]));
      order.set(v, { ws, idx });
    }
    const next = (prev, cur) => {
      const o = order.get(cur);
      const k = o.ws.length;
      const i = o.idx.get(prev);
      return o.ws[(i - 1 + k) % k];
    };
    const visited = new Set();
    const outers = [], holes = [];
    const area2 = this.tolerance * this.tolerance;
    for (const [v, list] of adj) {
      for (const w of list) {
        if (visited.has(v + '>' + w)) continue;
        const seq = [v];
        visited.add(v + '>' + w);
        let prev = v, cur = w, guard = 0;
        while (guard++ < 1e6) {
          const nx = next(prev, cur);
          if (cur === v && nx === w) break;
          seq.push(cur);
          visited.add(cur + '>' + nx);
          prev = cur; cur = nx;
        }
        for (const loop of splitLoops(seq)) {
          const pts = loop.map(P2);
          const a = signedArea(pts);
          if (a > area2) outers.push({ loop, pts, area: a, holes: [], holePts: [] });
          else if (a < -area2) holes.push({ loop, pts, area: -a });
        }
      }
    }
    for (const h of holes) {
      const rev = h.pts.slice().reverse();
      const ip = interiorPoint(rev);
      let best = null;
      const hs = new Set(h.loop);
      for (const o of outers) {
        if (o.area <= h.area + area2) continue;
        if (o.loop.length === h.loop.length && o.loop.every((x) => hs.has(x))) continue;
        if (!pointInPolygon(ip, o.pts)) continue;
        if (!best || o.area < best.area) best = o;
      }
      if (best) { best.holes.push(h.loop); best.holePts.push(h.pts); }
    }
    const regions = [];
    for (const o of outers) {
      const ip = interiorPoint(o.pts, o.holePts);
      if (keep(ip)) regions.push({ outer: o.loop, holes: o.holes, area: o.area - o.holePts.reduce((s, h) => s + Math.abs(signedArea(h)), 0) });
    }
    regions.sort((a, b) => b.area - a.area);
    return regions;
  }

  // ───────────────────────── drawing helpers

  // Draws a chain of edges; closed: also back to the start. → { edges, faces }
  addPolyline(points, options = {}) {
    const pts = points.map(toV);
    const edges = [], faces = [];
    const n = pts.length;
    const segs = options.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const r = this.addEdge(pts[i], pts[(i + 1) % n], options);
      edges.push(...r.edges);
      faces.push(...r.faces);
    }
    return { edges: [...new Set(edges)], faces: faces.filter((f) => this.faces.has(f)) };
  }

  // addRectangle(p0, p1, p2): p0-p1 is one side, p2 gives the other side's length/direction.
  // addRectangle(p0, p1, { normal }): p0/p1 are opposite corners in the plane with that normal
  // (sides follow the plane's world-aligned axes, e.g. X/Z on the ground).
  addRectangle(p0, p1, third = { normal: { x: 0, y: 1, z: 0 } }) {
    const a = toV(p0), b = toV(p1);
    let pts, n;
    if (third && third.normal && third.x === undefined && !Array.isArray(third)) {
      n = norm(toV(third.normal));
      const { u, v } = planeBasis(n);
      const d = sub(b, a);
      const du = dot(d, u), dv = dot(d, v);
      pts = [a, addScaled(a, u, du), addScaled(addScaled(a, u, du), v, dv), addScaled(a, v, dv)];
    } else {
      const c = toV(third);
      const side = sub(b, a);
      const w = sub(c, b);
      const s2 = len2(side);
      const perp = sub(w, scale(side, dot(w, side) / s2)); // keep it square
      pts = [a, b, add(b, perp), add(a, perp)];
      n = norm(cross(side, perp));
    }
    return this.addPolyline(pts, { closed: true, planeNormal: n });
  }

  _circlePoints(center, normal, radius, segments, a0 = 0, a1 = TAU, xAxis = null) {
    const c = toV(center), n = norm(toV(normal));
    let { u, v } = planeBasis(n);
    if (xAxis) { u = norm(sub(toV(xAxis), scale(n, dot(toV(xAxis), n)))); v = cross(n, u); }
    const pts = [];
    const full = Math.abs(a1 - a0 - TAU) < 1e-12;
    const count = full ? segments : segments + 1;
    for (let i = 0; i < count; i++) {
      const t = a0 + ((a1 - a0) * i) / segments;
      pts.push(add(c, add(scale(u, radius * Math.cos(t)), scale(v, radius * Math.sin(t)))));
    }
    return { pts, c, n };
  }

  _makeCurve(edgeIds, kind, center, normal, radius) {
    const id = this._id();
    const list = [];
    for (const e of edgeIds) {
      const E = this.edges.get(e);
      if (!E) continue;
      if (E.curve != null) { // an edge belongs to one curve only
        const old = this.curves.get(E.curve);
        if (old) { const i = old.edges.indexOf(e); if (i >= 0) old.edges.splice(i, 1); if (!old.edges.length) this.curves.delete(E.curve); }
      }
      E.curve = id;
      list.push(e);
    }
    this.curves.set(id, { edges: list, kind, center: vcopy(center), normal: vcopy(normal), radius });
    return id;
  }

  // → { edges, faces, curve }
  addCircle(center, normal, radius, segments = 24) {
    const { pts, c, n } = this._circlePoints(center, normal, radius, segments);
    const r = this.addPolyline(pts, { closed: true, planeNormal: n });
    const curve = this._makeCurve(r.edges, 'circle', c, n, radius);
    return { ...r, curve };
  }

  // Arc around center from startAngle to endAngle (radians, CCW about normal, 0 along xAxis
  // or the plane's u axis). → { edges, faces, curve }
  addArc(center, normal, radius, startAngle, endAngle, options = {}) {
    const segments = options.segments ?? Math.max(2, Math.ceil((Math.abs(endAngle - startAngle) / TAU) * 24));
    const { pts, c, n } = this._circlePoints(center, normal, radius, segments, startAngle, endAngle, options.xAxis);
    const r = this.addPolyline(pts, { planeNormal: n });
    const curve = this._makeCurve(r.edges, 'arc', c, n, radius);
    return { ...r, curve };
  }

  // Arc through three points (start, a point on the arc, end).
  addArc3(p0, p1, p2, options = {}) {
    const a = toV(p0), b = toV(p1), c = toV(p2);
    const ab = sub(b, a), ac = sub(c, a);
    const n = norm(cross(ab, ac));
    if (len2(n) === 0) return this.addPolyline([a, c]);
    // circumcentre
    const abXac = cross(ab, ac);
    const center = add(a, scale(add(scale(cross(abXac, ab), len2(ac)), scale(cross(ac, abXac), len2(ab))), 1 / (2 * len2(abXac))));
    const r = dist(center, a);
    const xAxis = norm(sub(a, center));
    const yAxis = cross(n, xAxis);
    const ang = (p) => { const d = sub(p, center); let t = Math.atan2(dot(d, yAxis), dot(d, xAxis)); if (t < 0) t += TAU; return t; };
    const end = ang(c);
    return this.addArc(center, n, r, 0, end, { ...options, xAxis });
  }

  // Regular polygon (edges grouped as one 'polygon' curve; push/pull keeps hard sides).
  addPolygon(center, normal, radius, sides = 6) {
    const { pts, c, n } = this._circlePoints(center, normal, radius, sides);
    const r = this.addPolyline(pts, { closed: true, planeNormal: n });
    const curve = this._makeCurve(r.edges, 'polygon', c, n, radius);
    return { ...r, curve };
  }

  curveOf(edgeId) { return this.edges.get(edgeId)?.curve ?? null; }
  // Every edge of the curve the edge belongs to (selection/erase works on the whole curve).
  curveEdges(edgeId) {
    const c = this.curveOf(edgeId);
    return c != null && this.curves.has(c) ? [...this.curves.get(c).edges] : [edgeId];
  }

  // ───────────────────────── erasing

  // Erases edges and the faces they bound. Coplanar faces that the erased edges separated
  // merge into one (healing); a face whose hole loop loses an edge fills the hole.
  // Returns { faces: merged/created faces, removedFaces }.
  eraseEdges(ids) {
    const E = new Set([...ids].filter((e) => this.edges.has(e)));
    if (!E.size) return { faces: [], removedFaces: [] };
    const faceSet = new Set();
    for (const e of E) for (const f of this._eFaces.get(e)) faceSet.add(f);
    const parent = new Map([...faceSet].map((f) => [f, f]));
    const find = (f) => { while (parent.get(f) !== f) { parent.set(f, parent.get(parent.get(f))); f = parent.get(f); } return f; };
    for (const e of E) {
      const fs = [...this._eFaces.get(e)];
      for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
        if (this._facesCoplanar(fs[i], fs[j])) parent.set(find(fs[i]), find(fs[j]));
      }
    }
    const groups = new Map();
    for (const f of faceSet) { const r = find(f); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); }
    const removed = [], created = [];
    const touchedVerts = new Set();
    for (const e of E) { const ed = this.edges.get(e); touchedVerts.add(ed.a); touchedVerts.add(ed.b); }
    const heal = [];
    for (const group of groups.values()) {
      if (group.length >= 2) {
        // keep the largest face's frame and properties; snapshot old polygons for the inside test
        group.sort((a, b) => this.area(b) - this.area(a));
        const main = this.faces.get(group[0]);
        const info = this._info(group[0]);
        const frame = { n: info.n, u: info.u, v: info.v, o: info.o, d: info.d };
        const polys = group.map((f) => {
          const F = this.faces.get(f);
          return { outer: F.outer.map((v) => this._to2(frame, this.vertices.get(v))), holes: F.holes.map((h) => h.map((v) => this._to2(frame, this.vertices.get(v)))) };
        });
        const edgeIds = new Set();
        for (const f of group) {
          const F = this.faces.get(f);
          for (const loop of this._loopsOf(F)) for (let i = 0; i < loop.length; i++) {
            const id = this._edgeKey.get(ekey(loop[i], loop[(i + 1) % loop.length]));
            if (!E.has(id)) edgeIds.add(id);
          }
        }
        heal.push({ frame, polys, edgeIds, props: { material: main.material, backMaterial: main.backMaterial, uvTransform: main.uvTransform } });
        for (const f of group) { this._removeFace(f); removed.push(f); }
      } else {
        const f = group[0];
        const F = this.faces.get(f);
        const hitsOuter = F.outer.some((v, i) => E.has(this._edgeKey.get(ekey(v, F.outer[(i + 1) % F.outer.length]))));
        if (hitsOuter) { this._removeFace(f); removed.push(f); }
        else {
          const keepHoles = F.holes.filter((h) => !h.some((v, i) => E.has(this._edgeKey.get(ekey(v, h[(i + 1) % h.length])))));
          this._setFaceLoops(f, F.outer, keepHoles);
          created.push(f);
        }
      }
    }
    for (const e of E) this._removeEdge(e);
    for (const h of heal) {
      const keep = (q) => h.polys.some((pg) => classifyPoint(q, pg.outer, pg.holes, this.tolerance) !== 'out');
      for (const r of this._regionsFromEdges([...h.edgeIds].filter((e) => this.edges.has(e)), h.frame, keep)) {
        const id = this._newFace(r.outer, r.holes, h.props);
        if (id !== null) created.push(id);
      }
    }
    for (const v of touchedVerts) if (this.vertices.has(v)) this._mergeCollinearAt(v);
    for (const v of touchedVerts) this._dropVertexIfFree(v);
    return { faces: created.filter((f) => this.faces.has(f)), removedFaces: removed };
  }

  // Erase faces only (their edges stay), like selecting a face and pressing Delete in SketchUp.
  eraseFaces(ids) {
    for (const f of ids) this._removeFace(f);
  }

  // Erase any mix of entity ids (vertices erase their edges, curves their edges).
  erase(ids) {
    const edges = new Set(), faces = [];
    for (const id of ids) {
      if (this.edges.has(id)) edges.add(id);
      else if (this.faces.has(id)) faces.push(id);
      else if (this.curves.has(id)) for (const e of this.curves.get(id).edges) edges.add(e);
      else if (this.vertices.has(id)) for (const e of this._vEdges.get(id)) edges.add(e);
    }
    this.eraseFaces(faces);
    return this.eraseEdges(edges);
  }

  // A vertex left between two collinear edges with the same faces is dissolved (one edge).
  _mergeCollinearAt(v) {
    const es = this._vEdges.get(v);
    if (!es || es.size !== 2) return false;
    const [e1, e2] = [...es];
    const E1 = this.edges.get(e1), E2 = this.edges.get(e2);
    if ((E1.curve ?? null) !== (E2.curve ?? null)) return false;
    const a = E1.a === v ? E1.b : E1.a, b = E2.a === v ? E2.b : E2.a;
    if (a === b || this._edgeKey.has(ekey(a, b))) return false;
    const P = this.vertices.get(v), A = this.vertices.get(a), B = this.vertices.get(b);
    const pr = projectOnSegment(P, A, B);
    if (pr.d2 > this.tolerance * this.tolerance * 0.01 || pr.t <= 0 || pr.t >= 1) return false;
    const f1 = this._eFaces.get(e1), f2 = this._eFaces.get(e2);
    if (f1.size !== f2.size || [...f1].some((f) => !f2.has(f))) return false;
    const faces = [...f1];
    const flags = { soft: E1.soft && E2.soft, smooth: E1.smooth && E2.smooth, hidden: E1.hidden && E2.hidden, curve: E1.curve };
    for (const f of faces) this._unregisterFaceEdges(f);
    for (const f of faces) {
      const F = this.faces.get(f);
      for (const loop of this._loopsOf(F)) { const i = loop.indexOf(v); if (i >= 0) loop.splice(i, 1); }
    }
    this._removeEdge(e1);
    this._removeEdge(e2);
    this._newEdge(a, b, flags);
    for (const f of faces) { this._registerFaceEdges(f); this._touchFace(f, false); }
    this._dropVertexIfFree(v);
    return true;
  }

  // ───────────────────────── push/pull

  // pushPull(faceId, distance, { createNew }) → { face, created: { faces, edges }, error? }
  // Face edges bordered only by perpendicular faces stretch them (the face moves); otherwise
  // the face is extruded with new side faces. A face bordered by a coplanar face (drawn on a
  // larger face) leaves an opening; a free-standing face stays as the back of the new solid.
  // Pushing until the cap lands inside an opposite face cuts a hole through it.
  pushPull(fid, distance, options = {}) {
    const F = this.faces.get(fid);
    if (!F) return { face: null, created: { faces: [], edges: [] }, error: 'no-face' };
    if (!distance) return { face: fid, created: { faces: [], edges: [] } };
    const n = F.normal;
    let allPerp = true, anyCoplanar = false, free = true, anyPerpEdge = false;
    for (const loop of this._loopsOf(F)) {
      for (let i = 0; i < loop.length; i++) {
        const e = this._edgeKey.get(ekey(loop[i], loop[(i + 1) % loop.length]));
        let others = 0;
        for (const g of this._eFaces.get(e)) {
          if (g === fid) continue;
          others++; free = false;
          const gn = this.faces.get(g).normal;
          if (Math.abs(dot(gn, n)) > 1e-6) { allPerp = false; if (this._facesCoplanar(g, fid)) anyCoplanar = true; }
        }
        if (others) anyPerpEdge = true;
      }
    }
    // stretch when every bordering face is perpendicular (edges with no face just follow)
    if (allPerp && anyPerpEdge && !options.createNew) return this._pushStretch(fid, distance);
    return this._pushExtrude(fid, distance, { free, coplanar: anyCoplanar, createNew: !!options.createNew });
  }

  _pushStretch(fid, d) {
    const F = this.faces.get(fid);
    const n = F.normal;
    const off = scale(n, d);
    const verts = [...new Set(this._loopsOf(F).flat())];
    const target = d < 0 ? this._findOpposite(fid, off) : null;
    if (target && target.exact) return this._collapse(fid, target.face);
    this._moveVertices(verts, (p) => add(p, off));
    if (target) {
      const loopEdges = this.boundaryEdges(fid);
      this._removeFace(fid);
      const made = this._integrate(loopEdges, {});
      const killed = this._dropFacesMatching(made, [F.outer, ...F.holes]);
      return { face: null, created: { faces: made.filter((f) => !killed.has(f) && this.faces.has(f)), edges: [] }, pushedThrough: target.face };
    }
    return { face: fid, created: { faces: [], edges: [] } };
  }

  // A face (other than fid) on the plane fid would reach after moving by off, that contains
  // the moved face: the push-through target. exact: the moved face covers it exactly.
  _findOpposite(fid, off) {
    const F = this.faces.get(fid);
    const pts = F.outer.map((v) => add(this.vertices.get(v), off));
    const frame = this._frame(F.normal, pts[0]);
    const pts2 = pts.map((p) => this._to2(frame, p));
    const ip = this._from2(frame, interiorPoint(pts2));
    const t = this.tolerance;
    for (const g of this._fgrid.queryBox(add(ip, v3(-t, -t, -t)), add(ip, v3(t, t, t)))) {
      if (g === fid || !this.faces.has(g)) continue;
      const info = this._info(g);
      if (Math.abs(dot(info.n, F.normal)) < 1 - 1e-9) continue;
      if (Math.abs(dot(info.n, ip) - info.d) > this._ptol(ip) * 10) continue;
      if (this._classifyInFace(g, ip) !== 'in') continue;
      if (!pts.every((p) => this._classifyInFace(g, p) !== 'out')) continue;
      const G = this.faces.get(g);
      const exact = G.outer.length === pts.length && !G.holes.length && pts.every((p) => G.outer.some((v) => dist(this.vertices.get(v), p) <= t));
      return { face: g, exact };
    }
    return null;
  }

  // Pushing a box face exactly onto the opposite face: the volume between vanishes.
  _collapse(fid, gid) {
    const F = this.faces.get(fid);
    const kill = new Set([fid, gid]);
    for (const e of this.boundaryEdges(fid)) for (const g of this._eFaces.get(e)) kill.add(g);
    const edges = new Set();
    for (const f of kill) for (const e of this.boundaryEdges(f)) edges.add(e);
    const verts = new Set();
    for (const f of kill) this._removeFace(f);
    for (const e of edges) {
      if (this._eFaces.get(e)?.size) continue;
      const E = this.edges.get(e);
      verts.add(E.a); verts.add(E.b);
      this._removeEdge(e);
    }
    for (const v of verts) this._dropVertexIfFree(v);
    void F;
    return { face: null, created: { faces: [], edges: [] }, collapsed: [...kill] };
  }

  _dropFacesMatching(faceIds, loops) {
    const killed = new Set();
    for (const f of faceIds) {
      const G = this.faces.get(f);
      if (G && loops.some((l) => this._sameCycle(G.outer, l))) { this._removeFace(f); killed.add(f); }
    }
    return killed;
  }

  _pushExtrude(fid, d, { free, coplanar, createNew }) {
    const F = this.faces.get(fid);
    const n = vcopy(F.normal);
    const off = scale(n, d);
    const loops = this._loopsOf(F).map((l) => l.slice());
    const props = { material: F.material, backMaterial: F.backMaterial, uvTransform: F.uvTransform };
    const target = d < 0 && (coplanar || createNew) ? this._findOpposite(fid, off) : null;
    const firstId = this._nextId;
    // coplanar (drawn on a bigger face): a,b,b',a' gives sign(d)·outward — a bump or a recess.
    // solid (free/standalone face): sides always face away from the face's interior.
    const solidMode = !coplanar;
    const sideFlip = solidMode && d < 0;
    // cap vertices (merging into geometry already there, SketchUp's sticky behaviour)
    const map = new Map();
    for (const loop of loops) for (const v of loop) if (!map.has(v)) map.set(v, this._vertexAt(add(this.vertices.get(v), off)));
    const keepF = !coplanar || createNew;
    if (!keepF) this._removeFace(fid);
    else if (free && d > 0) this._reverseFace(fid, true);
    const capLoops = loops.map((l) => l.map((v) => map.get(v)));
    const createdFaces = [];
    let capFace = null;
    if (target) {
      // cap lands inside the opposite face: cut it there instead of making a cap
      const capEdges = [];
      for (const cl of capLoops) for (let i = 0; i < cl.length; i++) {
        const r = this._insertSegment(this.vertices.get(cl[i]), this.vertices.get(cl[(i + 1) % cl.length]));
        capEdges.push(...r.created);
      }
      const made = this._integrate(capEdges, {});
      const killed = this._dropFacesMatching(made, capLoops);
      createdFaces.push(...made.filter((f) => !killed.has(f)));
    }
    // side faces: one per boundary edge, a,b,b',a' (orientation follows from the sign of d)
    for (let li = 0; li < loops.length; li++) {
      const loop = loops[li];
      const m = loop.length;
      for (let i = 0; i < m; i++) {
        const a = loop[i], b = loop[(i + 1) % m];
        let side = [a, b, ...this._chain(map.get(b), map.get(a))];
        if (sideFlip) side = side.reverse();
        const sf = this._newFace(side, [], { material: null });
        if (sf !== null) createdFaces.push(sf);
      }
      // soften the extrusion edges of curves (cylinders look round)
      for (let i = 0; i < m; i++) {
        const v = loop[i];
        const prevE = this.edges.get(this._edgeKey.get(ekey(loop[(i - 1 + m) % m], v)));
        const nextE = this.edges.get(this._edgeKey.get(ekey(v, loop[(i + 1) % m])));
        if (prevE && nextE && prevE.curve != null && prevE.curve === nextE.curve && this.curves.get(prevE.curve)?.kind !== 'polygon') {
          const ve = this.edges.get(this._edgeKey.get(ekey(v, map.get(v))));
          if (ve) { ve.soft = true; ve.smooth = true; }
        }
      }
    }
    if (!target) {
      let outer = capLoops[0], holes = capLoops.slice(1);
      const reverse = solidMode && d < 0;
      if (reverse) { outer = outer.slice().reverse(); holes = holes.map((h) => h.slice().reverse()); }
      capFace = this._newFace(outer, holes, props);
      if (capFace !== null) createdFaces.push(capFace);
      // the cap's curves follow the base's curves
      const curveMap = new Map();
      for (const loop of loops) for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        const E = this.edges.get(this._edgeKey.get(ekey(a, b)));
        if (!E || E.curve == null || !this.curves.has(E.curve)) continue;
        const ce = this._edgeKey.get(ekey(map.get(a), map.get(b)));
        if (ce === undefined) continue;
        if (!curveMap.has(E.curve)) curveMap.set(E.curve, []);
        curveMap.get(E.curve).push(ce);
      }
      for (const [cid, list] of curveMap) {
        const c = this.curves.get(cid);
        if (list.every((e) => this.edges.get(e).curve == null)) this._makeCurve(list, c.kind, add(c.center, off), c.normal, c.radius);
      }
    }
    const newEdges = this._newEdgesOf(createdFaces, firstId);
    return { face: capFace, created: { faces: createdFaces.filter((f) => this.faces.has(f)), edges: newEdges }, ...(target ? { pushedThrough: target.face } : {}) };
  }

  _newEdgesOf(faces, firstId) {
    const out = new Set();
    for (const f of faces) for (const e of this.boundaryEdges(f)) if (e >= firstId) out.add(e);
    return [...out];
  }

  // Vertex chain from a to b along existing collinear edges (a direct edge if there is one).
  _chain(a, b) {
    if (a === b) return [a];
    if (this._edgeKey.has(ekey(a, b))) return [a, b];
    const A = this.vertices.get(a), B = this.vertices.get(b);
    const out = [a];
    let cur = a, guard = 0;
    const tol2 = this.tolerance * this.tolerance;
    while (cur !== b && guard++ < 10000) {
      let best = null, bt = -Infinity;
      const C = this.vertices.get(cur);
      const tc = projectOnSegment(C, A, B).t;
      for (const e of this._vEdges.get(cur)) {
        const E = this.edges.get(e);
        const w = E.a === cur ? E.b : E.a;
        const pr = projectOnSegment(this.vertices.get(w), A, B);
        if (pr.d2 <= tol2 && pr.t > tc + 1e-12 && pr.t <= 1 + 1e-9 && (best === null || pr.t < bt || bt === -Infinity)) { best = w; bt = pr.t; }
      }
      if (best === null) { out.push(b); return out; }
      out.push(best);
      cur = best;
    }
    return out;
  }

  // ───────────────────────── move / transform / copy

  _collectVertices(sel) {
    const vs = new Set();
    const addFace = (f) => { const F = this.faces.get(f); if (F) for (const l of this._loopsOf(F)) for (const v of l) vs.add(v); };
    const addEdge = (e) => { const E = this.edges.get(e); if (E) { vs.add(E.a); vs.add(E.b); } };
    if (Array.isArray(sel) || sel instanceof Set) {
      for (const id of sel) {
        if (this.vertices.has(id)) vs.add(id);
        else if (this.edges.has(id)) addEdge(id);
        else if (this.faces.has(id)) addFace(id);
        else if (this.curves.has(id)) for (const e of this.curves.get(id).edges) addEdge(e);
      }
    } else {
      for (const v of sel.vertices || []) if (this.vertices.has(v)) vs.add(v);
      for (const e of sel.edges || []) addEdge(e);
      for (const f of sel.faces || []) addFace(f);
    }
    return vs;
  }

  // Moves the referenced vertices; connected geometry stretches. autoFold: faces that end
  // up non-planar are folded into planar triangles. → { faces: touched, folded }
  moveEntities(sel, vector, options = {}) {
    const off = toV(vector);
    const vs = this._collectVertices(sel);
    const faces = this._moveVertices(vs, (p) => add(p, off));
    for (const c of this.curves.values()) if (c.edges.every((e) => { const E = this.edges.get(e); return vs.has(E.a) && vs.has(E.b); })) c.center = add(c.center, off);
    const folded = options.autoFold ? this._autoFold(faces) : [];
    return { faces: [...faces].filter((f) => this.faces.has(f)), folded };
  }

  // Applies a THREE.Matrix4 (or 16 numbers, column major) to the vertices of the entities.
  transformEntities(ids, matrix, options = {}) {
    const vs = this._collectVertices(ids);
    const mirror = matrixDeterminant(matrix) < 0;
    const faces = this._moveVertices(vs, (p) => applyMatrix(matrix, p));
    if (mirror) {
      // a mirrored face would turn inside out: reverse loops of faces moved as a whole
      for (const f of faces) {
        const F = this.faces.get(f);
        if (F && this._loopsOf(F).every((l) => l.every((v) => vs.has(v)))) {
          F.outer.reverse(); for (const h of F.holes) h.reverse();
          this._touchFace(f, true);
        }
      }
    }
    for (const c of this.curves.values()) {
      if (!c.edges.every((e) => { const E = this.edges.get(e); return vs.has(E.a) && vs.has(E.b); })) continue;
      const c0 = c.center;
      c.center = applyMatrix(matrix, c0);
      const tip = applyMatrix(matrix, add(c0, c.normal));
      c.normal = norm(sub(tip, c.center));
      const rim = applyMatrix(matrix, add(c0, scale(planeBasis(c.normal).u, c.radius)));
      c.radius = dist(rim, c.center) || c.radius;
    }
    const folded = options.autoFold ? this._autoFold(faces) : [];
    return { faces: [...faces].filter((f) => this.faces.has(f)), folded };
  }

  // Copies faces/edges (and curves), transformed. Coincident vertices merge with existing
  // ones. → { vertices, edges, faces }
  copyEntities(ids, matrix = null) {
    const xf = (p) => (matrix ? applyMatrix(matrix, p) : vcopy(p));
    const mirror = matrix ? matrixDeterminant(matrix) < 0 : false;
    const faceIds = new Set(), edgeIds = new Set();
    for (const id of ids) {
      if (this.faces.has(id)) faceIds.add(id);
      else if (this.edges.has(id)) edgeIds.add(id);
      else if (this.curves.has(id)) for (const e of this.curves.get(id).edges) edgeIds.add(e);
    }
    for (const f of faceIds) for (const e of this.boundaryEdges(f)) edgeIds.add(e);
    const vmap = new Map();
    const mapV = (v) => { let w = vmap.get(v); if (w === undefined) { w = this._vertexAt(xf(this.vertices.get(v))); vmap.set(v, w); } return w; };
    const emap = new Map();
    for (const e of edgeIds) {
      const E = this.edges.get(e);
      const id = this._newEdge(mapV(E.a), mapV(E.b), { soft: E.soft, smooth: E.smooth, hidden: E.hidden });
      if (id !== null) emap.set(e, id);
    }
    const newFaces = [];
    for (const f of faceIds) {
      const F = this.faces.get(f);
      let outer = F.outer.map(mapV), holes = F.holes.map((h) => h.map(mapV));
      if (mirror) { outer = outer.reverse(); holes = holes.map((h) => h.reverse()); }
      const id = this._newFace(outer, holes, { material: F.material, backMaterial: F.backMaterial, uvTransform: F.uvTransform });
      if (id !== null) newFaces.push(id);
    }
    // curves wholly inside the copy are copied too
    const seen = new Set();
    for (const e of edgeIds) {
      const cid = this.edges.get(e).curve;
      if (cid == null || seen.has(cid)) continue;
      seen.add(cid);
      const c = this.curves.get(cid);
      if (!c || !c.edges.every((x) => emap.has(x))) continue;
      const center = xf(c.center);
      const normal = matrix ? norm(sub(applyMatrix(matrix, add(c.center, c.normal)), center)) : vcopy(c.normal);
      this._makeCurve(c.edges.map((x) => emap.get(x)), c.kind, center, normal, c.radius);
    }
    return { vertices: [...new Set(vmap.values())], edges: [...new Set(emap.values())], faces: newFaces };
  }

  _isPlanar(fid) {
    const F = this.faces.get(fid);
    const n = F.normal;
    const p0 = this.vertices.get(F.outer[0]);
    const d0 = dot(n, p0);
    for (const l of this._loopsOf(F)) for (const v of l) {
      const p = this.vertices.get(v);
      if (Math.abs(dot(n, p) - d0) > Math.max(this.tolerance, this._ptol(p))) return false;
    }
    return true;
  }

  _autoFold(faces) {
    const folded = [];
    for (const f of faces) {
      if (!this.faces.has(f) || this._isPlanar(f)) continue;
      const F = this.faces.get(f);
      const tris = this._triangulateFace(f);
      const props = { material: F.material, backMaterial: F.backMaterial, uvTransform: F.uvTransform };
      const verts = tris.verts;
      this._removeFace(f);
      for (let i = 0; i < tris.index.length; i += 3) {
        const id = this._newFace([verts[tris.index[i]], verts[tris.index[i + 1]], verts[tris.index[i + 2]]], [], props);
        if (id !== null) folded.push(id);
      }
    }
    return folded;
  }

  // ───────────────────────── offset

  // Offsets the outer loop of a face inside (distance > 0) or outside (< 0) with mitred
  // corners; the new loop splits the face (or surrounds it). → { edges, faces, error? }
  offsetFace(fid, distance) {
    const F = this.faces.get(fid);
    if (!F) return { edges: [], faces: [], error: 'no-face' };
    const info = this._info(fid);
    const P = info.outer2;
    const m = P.length;
    const out2 = [];
    for (let i = 0; i < m; i++) {
      const a = P[(i - 1 + m) % m], b = P[i], c = P[(i + 1) % m];
      const t1 = normalize2({ x: b.x - a.x, y: b.y - a.y }), t2 = normalize2({ x: c.x - b.x, y: c.y - b.y });
      const n1 = { x: -t1.y, y: t1.x }, n2 = { x: -t2.y, y: t2.x }; // left = inside for CCW
      const p1 = { x: a.x + n1.x * distance, y: a.y + n1.y * distance };
      const p2 = { x: b.x + n2.x * distance, y: b.y + n2.y * distance };
      const x = lineLine2(p1, t1, p2, t2);
      out2.push(x && Math.abs(t1.x * t2.y - t1.y * t2.x) > 1e-9 ? { x: x.x, y: x.y } : { x: b.x + n1.x * distance, y: b.y + n1.y * distance });
    }
    // reject offsets that flip an edge (distance larger than the polygon allows)
    for (let i = 0; i < m; i++) {
      const a = P[i], b = P[(i + 1) % m], c = out2[i], d = out2[(i + 1) % m];
      if ((b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y) <= 0) return { edges: [], faces: [], error: 'offset-too-large' };
    }
    if (signedArea(out2) <= 0) return { edges: [], faces: [], error: 'offset-too-large' };
    const pts = out2.map((q) => this._from2(info, q));
    const r = this.addPolyline(pts, { closed: true, planeNormal: info.n });
    // offsetting a circle gives a circle
    const outerCurves = new Set(F.outer.map((v, i) => this.edges.get(this._edgeKey.get(ekey(v, F.outer[(i + 1) % m])))?.curve));
    if (outerCurves.size === 1) {
      const cid = [...outerCurves][0];
      const c = cid != null ? this.curves.get(cid) : null;
      if (c && c.kind === 'circle') r.curve = this._makeCurve(r.edges, 'circle', c.center, c.normal, c.radius - distance);
    }
    return r;
  }

  // ───────────────────────── follow me

  // Sweeps a profile face along a connected chain of edges with mitred joints.
  // → { faces, edges, error? }
  followMe(fid, pathEdgeIds) {
    const F = this.faces.get(fid);
    if (!F) return { faces: [], edges: [], error: 'no-face' };
    const path = this._orderPath(pathEdgeIds);
    if (!path) return { faces: [], edges: [], error: 'bad-path' };
    let { verts, segEdges, closed } = path;
    const profileLoops = this._loopsOf(F).map((l) => l.slice());
    const profilePts = profileLoops.map((l) => l.map((v) => vcopy(this.vertices.get(v))));
    const centroid = scale(profilePts[0].reduce((s, p) => add(s, p), v3()), 1 / profilePts[0].length);
    let Q = verts.map((v) => vcopy(this.vertices.get(v)));
    if (!closed) {
      if (dist2(centroid, Q[Q.length - 1]) < dist2(centroid, Q[0])) { verts.reverse(); segEdges.reverse(); Q.reverse(); }
    } else {
      // start at the segment the profile sits on (closest, most along the face normal)
      let best = 0, bestScore = Infinity;
      for (let i = 0; i < Q.length; i++) {
        const a = Q[i], b = Q[(i + 1) % Q.length];
        const pr = projectOnSegment(centroid, a, b);
        const t = Math.min(1, Math.max(0, pr.t));
        const dd = dist(centroid, add(a, scale(sub(b, a), t)));
        const par = 1 - Math.abs(dot(norm(sub(b, a)), F.normal));
        const score = dd + par * 1e3;
        if (score < bestScore) { bestScore = score; best = i; }
      }
      verts = verts.slice(best).concat(verts.slice(0, best));
      segEdges = segEdges.slice(best).concat(segEdges.slice(0, best));
      Q = verts.map((v) => vcopy(this.vertices.get(v)));
    }
    const nQ = Q.length;
    const segs = closed ? nQ : nQ - 1;
    const dir = (i) => norm(sub(Q[(i + 1) % nQ], Q[i % nQ]));
    const miter = (i) => {
      if (!closed && i === 0) return dir(0);
      if (!closed && i === nQ - 1) return dir(nQ - 2);
      const s = add(dir((i - 1 + nQ) % nQ), dir(i % nQ));
      return len2(s) < 1e-12 ? dir(i % nQ) : norm(s);
    };
    const project = (p, d, at, pn) => {
      const den = dot(d, pn);
      if (Math.abs(den) < 1e-12) return vcopy(p);
      return addScaled(p, d, dot(sub(at, p), pn) / den);
    };
    const sections = [];
    sections[0] = closed ? profilePts.map((l) => l.map((p) => project(p, dir(0), Q[0], miter(0)))) : profilePts;
    const count = closed ? nQ : nQ;
    for (let i = 1; i < count; i++) sections[i] = sections[i - 1].map((l) => l.map((p) => project(p, dir(i - 1), Q[i], miter(i))));
    // vertex ids per section (the open sweep starts on the profile itself)
    const ids = sections.map((sec, i) => sec.map((l, li) => l.map((p, k) => (!closed && i === 0 ? profileLoops[li][k] : this._vertexAt(p)))));
    const firstId = this._nextId;
    const made = [];
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % nQ;
      for (let li = 0; li < ids[i].length; li++) {
        const A = ids[i][li], B = ids[j][li];
        const m = A.length;
        for (let k = 0; k < m; k++) {
          const quad = [A[k], A[(k + 1) % m], B[(k + 1) % m], B[k]];
          const uniq = quad.filter((v, x) => quad.indexOf(v) === x);
          if (uniq.length < 3) continue;
          const f = this._newFace(uniq, []);
          if (f !== null) made.push(f);
        }
      }
    }
    if (!closed) {
      const last = ids[nQ - 1];
      const cap = this._newFace(last[0], last.slice(1), { material: F.material, backMaterial: F.backMaterial });
      if (cap !== null) made.push(cap);
      made.push(fid);
    } else {
      const loopEdges = this.boundaryEdges(fid);
      this._removeFace(fid);
      for (const e of loopEdges) if (this.edges.has(e) && !this._eFaces.get(e).size) {
        const E = this.edges.get(e); this._removeEdge(e); this._dropVertexIfFree(E.a); this._dropVertexIfFree(E.b);
      }
    }
    this._orientShell(made);
    // smooth joints: along a curved path, and along curved profile edges
    const curveOfSeg = segEdges.map((e) => this.edges.get(e)?.curve ?? null);
    for (let i = 0; i < nQ; i++) {
      if (!closed && (i === 0 || i === nQ - 1)) continue;
      const c1 = curveOfSeg[(i - 1 + segs) % segs], c2 = curveOfSeg[i % segs];
      if (c1 == null || c1 !== c2) continue;
      for (const l of ids[i]) for (let k = 0; k < l.length; k++) this._setSoft(l[k], l[(k + 1) % l.length]);
    }
    for (let li = 0; li < profileLoops.length; li++) {
      const pl = profileLoops[li], m = pl.length;
      for (let k = 0; k < m; k++) {
        const e1 = this.edges.get(this._edgeKey.get(ekey(pl[(k - 1 + m) % m], pl[k])));
        const e2 = this.edges.get(this._edgeKey.get(ekey(pl[k], pl[(k + 1) % m])));
        if (!e1 || !e2 || e1.curve == null || e1.curve !== e2.curve || this.curves.get(e1.curve)?.kind === 'polygon') continue;
        for (let i = 0; i < segs; i++) this._setSoft(ids[i][li][k], ids[(i + 1) % nQ][li][k]);
      }
    }
    const live = made.filter((f) => this.faces.has(f));
    return { faces: live, edges: this._newEdgesOf(live, firstId) };
  }

  _setSoft(a, b) {
    const e = this._edgeKey.get(ekey(a, b));
    if (e === undefined) return;
    const E = this.edges.get(e);
    E.soft = true; E.smooth = true;
    this._mark('edges', e);
  }

  // Orders edges into a chain → { verts, segEdges, closed } or null.
  _orderPath(edgeIds) {
    const ids = [...new Set(edgeIds)].filter((e) => this.edges.has(e));
    if (!ids.length) return null;
    const adj = new Map();
    for (const e of ids) {
      const E = this.edges.get(e);
      for (const [v, w] of [[E.a, E.b], [E.b, E.a]]) { if (!adj.has(v)) adj.set(v, []); adj.get(v).push({ w, e }); }
    }
    for (const l of adj.values()) if (l.length > 2) return null;
    let start = ids.length ? this.edges.get(ids[0]).a : null;
    let closed = true;
    for (const [v, l] of adj) if (l.length === 1) { start = v; closed = false; break; }
    const verts = [start], segEdges = [];
    const used = new Set();
    let cur = start;
    while (true) {
      const nx = adj.get(cur).find((x) => !used.has(x.e));
      if (!nx) break;
      used.add(nx.e);
      segEdges.push(nx.e);
      if (nx.w === start) break;
      verts.push(nx.w);
      cur = nx.w;
    }
    if (used.size !== ids.length) return null;
    return { verts, segEdges, closed };
  }

  // Makes faces consistently oriented (shared edges run opposite ways); a closed shell ends
  // up facing outward.
  _orientShell(faceIds) {
    const set = new Set(faceIds.filter((f) => this.faces.has(f)));
    const done = new Set();
    for (const seed of set) {
      if (done.has(seed)) continue;
      const comp = [seed];
      done.add(seed);
      for (let qi = 0; qi < comp.length; qi++) {
        const f = comp[qi];
        const F = this.faces.get(f);
        for (const loop of this._loopsOf(F)) for (let i = 0; i < loop.length; i++) {
          const a = loop[i], b = loop[(i + 1) % loop.length];
          for (const g of this._eFaces.get(this._edgeKey.get(ekey(a, b)))) {
            if (!set.has(g) || done.has(g)) continue;
            if (this._dirInFace(g, a, b) === 1) this._reverseFace(g, false);
            done.add(g);
            comp.push(g);
          }
        }
      }
      // closed component: outward means positive volume
      let vol = 0;
      for (const f of comp) vol += this._faceVolume(f);
      if (vol < 0) for (const f of comp) this._reverseFace(f, false);
    }
  }

  // Re-orients every face connected to fid like fid (SketchUp "Orient Faces").
  orientFaces(fid) {
    const comp = this.connected(fid).faces;
    // seed must not flip: reorient relative to it, then undo a global flip if it happened
    const n0 = vcopy(this.faces.get(fid).normal);
    this._orientShellFrom(fid, comp);
    if (dot(this.faces.get(fid).normal, n0) < 0) for (const f of comp) this._reverseFace(f, false);
    return comp;
  }
  _orientShellFrom(seed, faceIds) {
    const set = new Set(faceIds);
    const done = new Set([seed]);
    const q = [seed];
    for (let qi = 0; qi < q.length; qi++) {
      const F = this.faces.get(q[qi]);
      for (const loop of this._loopsOf(F)) for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        for (const g of this._eFaces.get(this._edgeKey.get(ekey(a, b)))) {
          if (!set.has(g) || done.has(g)) continue;
          if (this._dirInFace(g, a, b) === 1) this._reverseFace(g, false);
          done.add(g); q.push(g);
        }
      }
    }
  }

  // ───────────────────────── intersect

  // Adds edges where faces of A cross faces of B (or any face of the model when B is null);
  // faces split along the new edges. → { edges, faces }
  intersectFaces(faceIdsA, faceIdsB = null) {
    const A = [...faceIdsA].filter((f) => this.faces.has(f));
    const Bset = faceIdsB ? new Set([...faceIdsB].filter((f) => this.faces.has(f))) : null;
    const segments = [];
    const tol = this.tolerance;
    const Aset = new Set(A);
    for (const fa of A) {
      const bbA = this._faceBox(fa);
      const cands = Bset ? Bset : this._fgrid.queryBox(bbA.min, bbA.max);
      for (const fb of cands) {
        if (fb === fa || !this.faces.has(fb)) continue;
        if (!Bset && Aset.has(fb) && fb < fa) continue;
        const bbB = this._faceBox(fb);
        if (bbA.min.x > bbB.max.x + tol || bbB.min.x > bbA.max.x + tol || bbA.min.y > bbB.max.y + tol || bbB.min.y > bbA.max.y + tol || bbA.min.z > bbB.max.z + tol || bbB.min.z > bbA.max.z + tol) continue;
        const ia = this._info(fa), ib = this._info(fb);
        const u = cross(ia.n, ib.n);
        const uu = len2(u);
        if (uu < 1e-12) continue;
        const P0 = scale(add(scale(cross(ib.n, u), ia.d), scale(cross(u, ia.n), ib.d)), 1 / uu);
        const D = norm(u);
        const ra = this._lineIntervals(fa, P0, D), rb = this._lineIntervals(fb, P0, D);
        for (const [s0, s1] of intersectIntervals(ra, rb)) {
          if (s1 - s0 > tol) segments.push([addScaled(P0, D, s0), addScaled(P0, D, s1)]);
        }
      }
    }
    const edges = [], faces = [];
    for (const [p, q] of segments) {
      const r = this.addEdge(p, q);
      edges.push(...r.created);
      faces.push(...r.faces);
    }
    return { edges, faces: faces.filter((f) => this.faces.has(f)) };
  }

  _faceBox(fid) {
    const F = this.faces.get(fid);
    let mn = { x: Infinity, y: Infinity, z: Infinity }, mx = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const v of F.outer) {
      const p = this.vertices.get(v);
      mn = { x: Math.min(mn.x, p.x), y: Math.min(mn.y, p.y), z: Math.min(mn.z, p.z) };
      mx = { x: Math.max(mx.x, p.x), y: Math.max(mx.y, p.y), z: Math.max(mx.z, p.z) };
    }
    return { min: mn, max: mx };
  }

  // Parameter intervals of the line P0 + s·D (lying in the face plane) inside the face.
  _lineIntervals(fid, P0, D) {
    const info = this._info(fid);
    const o2 = this._to2(info, P0);
    const d2 = { x: dot(D, info.u), y: dot(D, info.v) };
    const ts = [];
    for (const loop of [info.outer2, ...info.holes2]) {
      for (let i = 0, n = loop.length; i < n; i++) {
        const a = loop[i], b = loop[(i + 1) % n];
        const sa = d2.x * (a.y - o2.y) - d2.y * (a.x - o2.x);
        const sb = d2.x * (b.y - o2.y) - d2.y * (b.x - o2.x);
        const along = (p) => (p.x - o2.x) * d2.x + (p.y - o2.y) * d2.y;
        if (Math.abs(sa) <= 1e-12) ts.push(along(a));
        if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
          const t = sa / (sa - sb);
          ts.push(along({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
        }
      }
    }
    ts.sort((x, y) => x - y);
    const out = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] <= 1e-12) continue;
      const m = (ts[i] + ts[i + 1]) / 2;
      const q = { x: o2.x + d2.x * m, y: o2.y + d2.y * m };
      if (classifyPoint(q, info.outer2, info.holes2, this.tolerance) !== 'out') {
        if (out.length && Math.abs(out[out.length - 1][1] - ts[i]) <= 1e-12) out[out.length - 1][1] = ts[i + 1];
        else out.push([ts[i], ts[i + 1]]);
      }
    }
    return out;
  }

  // ───────────────────────── faces: orientation, smoothing, materials

  flipFaces(ids) {
    for (const f of ids) if (this.faces.has(f)) this._reverseFace(f, true);
  }
  reverseFaces(ids) { this.flipFaces(ids); }

  // Edges whose two faces meet at less than angleDeg become soft + smooth (others hard).
  softenEdges(ids = null, angleDeg = 20, options = {}) {
    const list = ids ? [...ids] : [...this.edges.keys()];
    const lim = (angleDeg * Math.PI) / 180;
    const changed = [];
    for (const e of list) {
      const E = this.edges.get(e);
      const fs = this._eFaces.get(e);
      if (!E || !fs || fs.size !== 2) continue;
      const [f1, f2] = [...fs];
      if (!options.coplanar && this._facesCoplanar(f1, f2)) continue;
      let c = dot(this.faces.get(f1).normal, this.faces.get(f2).normal);
      if (this._dirInFace(f1, E.a, E.b) === this._dirInFace(f2, E.a, E.b)) c = -c; // inconsistent orientation
      const ang = Math.acos(Math.max(-1, Math.min(1, c)));
      const s = ang < lim;
      if (E.soft !== s || E.smooth !== s) { E.soft = s; E.smooth = s; this._mark('edges', e); changed.push(e); }
      for (const f of fs) this._fc.delete(f);
    }
    return changed;
  }

  setEdgeFlags(ids, flags) {
    for (const e of ids) {
      const E = this.edges.get(e);
      if (!E) continue;
      for (const k of ['soft', 'smooth', 'hidden']) if (k in flags) E[k] = !!flags[k];
      this._mark('edges', e);
    }
  }

  setMaterial(faceIds, presetId, options = {}) {
    for (const f of faceIds) {
      const F = this.faces.get(f);
      if (!F) continue;
      if (options.back) F.backMaterial = presetId ?? null;
      else F.material = presetId ?? null;
      this._mark('faces', f);
    }
  }

  setUVTransform(faceIds, uvTransform) {
    for (const f of faceIds) {
      const F = this.faces.get(f);
      if (!F) continue;
      if (uvTransform) F.uvTransform = { ...uvTransform }; else delete F.uvTransform;
      this._fc.delete(f);
      this._mark('faces', f);
    }
  }

  // ───────────────────────── queries

  facesOfEdge(e) { return [...(this._eFaces.get(e) || [])]; }
  edgesOfVertex(v) { return [...(this._vEdges.get(v) || [])]; }
  facesOfVertex(v) {
    const out = new Set();
    for (const e of this._vEdges.get(v) || []) for (const f of this._eFaces.get(e)) out.add(f);
    return [...out];
  }
  boundaryEdges(fid) {
    const F = this.faces.get(fid);
    if (!F) return [];
    const out = [];
    for (const loop of this._loopsOf(F)) for (let i = 0; i < loop.length; i++) {
      const e = this._edgeKey.get(ekey(loop[i], loop[(i + 1) % loop.length]));
      if (e !== undefined) out.push(e);
    }
    return out;
  }
  // Everything connected to an entity through edges (SketchUp triple-click).
  connected(id) {
    const verts = new Set();
    const stack = [];
    if (this.vertices.has(id)) stack.push(id);
    else if (this.edges.has(id)) { const E = this.edges.get(id); stack.push(E.a, E.b); }
    else if (this.faces.has(id)) stack.push(...this.faces.get(id).outer);
    else if (this.curves.has(id)) for (const e of this.curves.get(id).edges) { const E = this.edges.get(e); stack.push(E.a, E.b); }
    const edges = new Set(), faces = new Set();
    while (stack.length) {
      const v = stack.pop();
      if (verts.has(v)) continue;
      verts.add(v);
      for (const e of this._vEdges.get(v) || []) {
        edges.add(e);
        const E = this.edges.get(e);
        stack.push(E.a === v ? E.b : E.a);
        for (const f of this._eFaces.get(e)) faces.add(f);
      }
    }
    return { vertices: [...verts], edges: [...edges], faces: [...faces] };
  }

  boundingBox() {
    let mn = { x: Infinity, y: Infinity, z: Infinity }, mx = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of this.vertices.values()) {
      if (p.x < mn.x) mn.x = p.x; if (p.y < mn.y) mn.y = p.y; if (p.z < mn.z) mn.z = p.z;
      if (p.x > mx.x) mx.x = p.x; if (p.y > mx.y) mx.y = p.y; if (p.z > mx.z) mx.z = p.z;
    }
    return { min: mn, max: mx, empty: !this.vertices.size };
  }

  // Closed, consistently oriented 2-manifold: every edge has exactly two faces running it
  // in opposite directions, and there are no stray edges.
  isSolid() {
    if (!this.faces.size) return false;
    for (const [e, fs] of this._eFaces) {
      if (fs.size !== 2) return false;
      const E = this.edges.get(e);
      const [f1, f2] = [...fs];
      if (this._dirInFace(f1, E.a, E.b) !== -this._dirInFace(f2, E.a, E.b)) return false;
    }
    return true;
  }

  _faceVolume(fid) {
    const t = this._triangulateFace(fid);
    let v = 0;
    const P = t.verts.map((id) => this.vertices.get(id));
    for (let i = 0; i < t.index.length; i += 3) {
      const a = P[t.index[i]], b = P[t.index[i + 1]], c = P[t.index[i + 2]];
      v += dot(a, cross(b, c)) / 6;
    }
    return v;
  }
  volume() {
    let v = 0;
    for (const f of this.faces.keys()) v += this._faceVolume(f);
    return v;
  }
  area(fid) {
    const info = this._info(fid);
    let a = Math.abs(signedArea(info.outer2));
    for (const h of info.holes2) a -= Math.abs(signedArea(h));
    return a;
  }
  // Plane of a face: { normal, constant } with normal·p + constant = 0 (THREE.Plane layout).
  plane(fid) {
    const info = this._info(fid);
    return { normal: vcopy(info.n), constant: -info.d };
  }
  // 'in' | 'on' | 'out' for a point on (or projected to) the face plane.
  classifyPoint(fid, p) {
    const info = this._info(fid);
    const q = toV(p);
    return classifyPoint(this._to2(info, q), info.outer2, info.holes2, this.tolerance);
  }

  // ───────────────────────── triangulation / render buffers

  // Per-face triangles (cached): verts = vertex ids (outer then holes), index = local
  // triangle indices wound with the face normal.
  _triangulateFace(fid) {
    let c = this._fc.get(fid);
    if (c && c.tri) return c.tri;
    const F = this.faces.get(fid);
    const info = this._info(fid);
    const verts = [...F.outer, ...F.holes.flat()];
    const index = triangulate2D(info.outer2, info.holes2);
    // make sure every triangle winds with the face (earcut follows the input winding)
    const P2 = [...info.outer2, ...info.holes2.flat()];
    for (let i = 0; i < index.length; i += 3) {
      const a = P2[index[i]], b = P2[index[i + 1]], cc = P2[index[i + 2]];
      if ((b.x - a.x) * (cc.y - a.y) - (b.y - a.y) * (cc.x - a.x) < 0) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
    }
    const tri = { verts, index, pos: null, uv: null };
    if (!c) { c = {}; this._fc.set(fid, c); }
    c.tri = tri;
    return tri;
  }

  // Cached render data of one face: positions and planar metre UVs.
  _faceBuffers(fid) {
    const t = this._triangulateFace(fid);
    if (t.pos) return t;
    const F = this.faces.get(fid);
    const info = this._info(fid);
    const n = t.verts.length;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const ut = F.uvTransform;
    const r = ut ? ut.rotation || 0 : 0, cs = Math.cos(r), sn = Math.sin(r);
    const su = ut && ut.scale ? ut.scale[0] || 1 : 1, sv = ut && ut.scale ? ut.scale[1] || 1 : 1;
    const ou = ut && ut.offset ? ut.offset[0] : 0, ov = ut && ut.offset ? ut.offset[1] : 0;
    for (let i = 0; i < n; i++) {
      const p = this.vertices.get(t.verts[i]);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      let u = dot(p, info.u), v = dot(p, info.v);
      if (ut) { const ru = u * cs - v * sn, rv = u * sn + v * cs; u = ru / su + ou; v = rv / sv + ov; }
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    t.pos = pos; t.uv = uv;
    return t;
  }

  // Render buffers. UVs are planar in metres (u along the face's world-aligned axis).
  triangulate(options = {}) {
    const groupsOn = options.materialGroups !== false;
    const faceIds = [...this.faces.keys()];
    const keyOf = (F) => (groupsOn ? `${F.material ?? ''}|${F.backMaterial ?? ''}` : '');
    if (groupsOn) {
      const keys = new Map();
      for (const f of faceIds) keys.set(f, keyOf(this.faces.get(f)));
      faceIds.sort((a, b) => (keys.get(a) < keys.get(b) ? -1 : keys.get(a) > keys.get(b) ? 1 : a - b));
    }
    let nv = 0, ni = 0;
    const tris = faceIds.map((f) => { const t = this._faceBuffers(f); nv += t.verts.length; ni += t.index.length; return t; });
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
    const indices = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const faceOfTriangle = new Int32Array(ni / 3);
    const groups = [];
    const smoothVerts = new Set();
    let hardCount = 0, softCount = 0;
    for (const E of this.edges.values()) {
      if (E.smooth) { smoothVerts.add(E.a); smoothVerts.add(E.b); }
      if (!E.hidden) { if (E.soft) softCount++; else hardCount++; }
    }
    let vo = 0, io = 0;
    for (let k = 0; k < faceIds.length; k++) {
      const f = faceIds[k], F = this.faces.get(f), t = tris[k];
      const key = keyOf(F);
      const g = groups[groups.length - 1];
      if (!g || g.key !== key) groups.push({ key, start: io, count: 0, material: F.material ?? null, backMaterial: F.backMaterial ?? null });
      positions.set(t.pos, vo * 3);
      uvs.set(t.uv, vo * 2);
      const n = F.normal;
      for (let i = 0; i < t.verts.length; i++) {
        const nrm = smoothVerts.size && smoothVerts.has(t.verts[i]) ? this._smoothNormal(f, t.verts[i]) : n;
        const o = (vo + i) * 3;
        normals[o] = nrm.x; normals[o + 1] = nrm.y; normals[o + 2] = nrm.z;
      }
      const idx = t.index;
      for (let i = 0; i < idx.length; i++) indices[io + i] = vo + idx[i];
      faceOfTriangle.fill(f, io / 3, (io + idx.length) / 3);
      groups[groups.length - 1].count += idx.length;
      vo += t.verts.length;
      io += idx.length;
    }
    for (const g of groups) delete g.key;
    const edgePositions = new Float32Array(hardCount * 6), softEdgePositions = new Float32Array(softCount * 6);
    let ho = 0, so = 0;
    for (const E of this.edges.values()) {
      if (E.hidden) continue;
      const a = this.vertices.get(E.a), b = this.vertices.get(E.b);
      const arr = E.soft ? softEdgePositions : edgePositions;
      const o = E.soft ? so : ho;
      arr[o] = a.x; arr[o + 1] = a.y; arr[o + 2] = a.z; arr[o + 3] = b.x; arr[o + 4] = b.y; arr[o + 5] = b.z;
      if (E.soft) so += 6; else ho += 6;
    }
    return { positions, normals, uvs, indices, groups, faceOfTriangle, faceIds, edgePositions, softEdgePositions };
  }

  // Average normal of the faces around vertex v reachable from f across smooth edges.
  _smoothNormal(f, v) {
    const n0 = this.faces.get(f).normal;
    const seen = new Set([f]);
    const q = [f];
    let s = vcopy(n0);
    for (let qi = 0; qi < q.length; qi++) {
      const g = q[qi];
      for (const e of this._vEdges.get(v)) {
        const E = this.edges.get(e);
        if (!E.smooth) continue;
        const fs = this._eFaces.get(e);
        if (!fs.has(g)) continue;
        for (const h of fs) {
          if (seen.has(h)) continue;
          seen.add(h);
          q.push(h);
          const hn = this.faces.get(h).normal;
          s = add(s, dot(hn, n0) < -0.5 ? neg(hn) : hn);
        }
      }
    }
    return norm(s);
  }

  // ───────────────────────── serialisation

  toJSON() {
    const vertices = [];
    for (const [id, p] of this.vertices) vertices.push([id, p.x, p.y, p.z]);
    const edges = [];
    for (const [id, e] of this.edges) {
      const flags = (e.soft ? EDGE_SOFT : 0) | (e.smooth ? EDGE_SMOOTH : 0) | (e.hidden ? EDGE_HIDDEN : 0);
      edges.push(e.curve != null ? [id, e.a, e.b, flags, e.curve] : [id, e.a, e.b, flags]);
    }
    const faces = [];
    for (const [id, F] of this.faces) {
      const o = { id, outer: F.outer.slice() };
      if (F.holes.length) o.holes = F.holes.map((h) => h.slice());
      if (F.material != null) o.material = F.material;
      if (F.backMaterial != null) o.backMaterial = F.backMaterial;
      if (F.uvTransform) o.uvTransform = { ...F.uvTransform };
      faces.push(o);
    }
    const curves = [];
    for (const [id, c] of this.curves) curves.push({ id, kind: c.kind, edges: c.edges.slice(), center: vcopy(c.center), normal: vcopy(c.normal), radius: c.radius });
    return { format: 'geomesh', version: 1, tolerance: this.tolerance, planeTolerance: this.planeTolerance, gridSize: this.gridSize, nextId: this._nextId, vertices, edges, faces, curves };
  }

  static fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const m = new GeoMesh({ tolerance: data.tolerance, planeTolerance: data.planeTolerance, gridSize: data.gridSize });
    for (const [id, x, y, z] of data.vertices || []) {
      const p = { x, y, z };
      m.vertices.set(id, p); m._vgrid.insert(id, p); m._vEdges.set(id, new Set());
    }
    for (const c of data.curves || []) m.curves.set(c.id, { edges: [], kind: c.kind, center: vcopy(c.center), normal: vcopy(c.normal), radius: c.radius });
    for (const [id, a, b, flags = 0, curve] of data.edges || []) {
      const e = { a, b, soft: !!(flags & EDGE_SOFT), smooth: !!(flags & EDGE_SMOOTH), hidden: !!(flags & EDGE_HIDDEN) };
      if (curve != null && m.curves.has(curve)) e.curve = curve;
      m.edges.set(id, e);
      m._edgeKey.set(ekey(a, b), id);
      m._vEdges.get(a).add(id); m._vEdges.get(b).add(id);
      m._eFaces.set(id, new Set());
      m._indexEdge(id);
    }
    for (const c of data.curves || []) {
      const cur = m.curves.get(c.id);
      cur.edges = c.edges.filter((e) => m.edges.has(e));
      if (!cur.edges.length) m.curves.delete(c.id);
    }
    for (const f of data.faces || []) {
      const F = { outer: f.outer.slice(), holes: (f.holes || []).map((h) => h.slice()), normal: v3(), material: f.material ?? null, backMaterial: f.backMaterial ?? null };
      if (f.uvTransform) F.uvTransform = { ...f.uvTransform };
      m.faces.set(f.id, F);
      F.normal = m._computeNormal(F.outer);
      m._registerFaceEdges(f.id);
      m._touchFace(f.id, false);
    }
    let maxId = 0;
    for (const map of [m.vertices, m.edges, m.faces, m.curves]) for (const id of map.keys()) if (id > maxId) maxId = id;
    m._nextId = Math.max(data.nextId || 1, maxId + 1);
    m._changes = { vertices: new Set(), edges: new Set(), faces: new Set() };
    m.revision = 0;
    return m;
  }

  clone() { return GeoMesh.fromJSON(this.toJSON()); }

  // Merges another GeoMesh into this one (transformed), returns the new ids.
  merge(other, matrix = null) {
    const tmp = other === this ? other.clone() : other;
    const xf = (p) => (matrix ? applyMatrix(matrix, p) : vcopy(p));
    const vmap = new Map();
    const mapV = (v) => { let w = vmap.get(v); if (w === undefined) { w = this._vertexAt(xf(tmp.vertices.get(v))); vmap.set(v, w); } return w; };
    const edges = [], faces = [];
    for (const [id, E] of tmp.edges) { const e = this._newEdge(mapV(E.a), mapV(E.b), { soft: E.soft, smooth: E.smooth, hidden: E.hidden }); if (e !== null) edges.push(e); }
    const mirror = matrix ? matrixDeterminant(matrix) < 0 : false;
    for (const F of tmp.faces.values()) {
      let outer = F.outer.map(mapV), holes = F.holes.map((h) => h.map(mapV));
      if (mirror) { outer.reverse(); holes.forEach((h) => h.reverse()); }
      const f = this._newFace(outer, holes, { material: F.material, backMaterial: F.backMaterial, uvTransform: F.uvTransform });
      if (f !== null) faces.push(f);
    }
    return { vertices: [...vmap.values()], edges, faces };
  }

  // Low-level construction used by primitives/solids: face from points (vertices merge).
  addFaceFromPoints(outerPts, holesPts = [], props = {}) {
    const outer = outerPts.map((p) => this._vertexAt(toV(p)));
    const holes = holesPts.map((h) => h.map((p) => this._vertexAt(toV(p))));
    const dedupe = (l) => l.filter((v, i) => v !== l[(i + 1) % l.length]);
    return this._newFace(dedupe(outer), holes.map(dedupe), props);
  }

  // Consistency check used by tests: every index agrees with the entity maps.
  validate() {
    const problems = [];
    for (const [fid, F] of this.faces) {
      for (const loop of this._loopsOf(F)) {
        if (new Set(loop).size !== loop.length) problems.push(`face ${fid} repeats a vertex`);
        for (let i = 0; i < loop.length; i++) {
          const e = this._edgeKey.get(ekey(loop[i], loop[(i + 1) % loop.length]));
          if (e === undefined) problems.push(`face ${fid} missing edge ${loop[i]}-${loop[(i + 1) % loop.length]}`);
          else if (!this._eFaces.get(e).has(fid)) problems.push(`edge ${e} does not list face ${fid}`);
        }
      }
    }
    for (const [e, fs] of this._eFaces) for (const f of fs) if (!this.faces.has(f)) problems.push(`edge ${e} lists dead face ${f}`);
    for (const [e, E] of this.edges) if (!this.vertices.has(E.a) || !this.vertices.has(E.b)) problems.push(`edge ${e} has a dead vertex`);
    return problems;
  }
}

// Splits a closed vertex walk at repeated vertices into simple loops (drops spurs).
export function splitLoops(seq) {
  const loops = [];
  const path = [];
  const at = new Map();
  for (const v of seq) {
    if (at.has(v)) {
      const i = at.get(v);
      const loop = path.slice(i);
      for (let k = i; k < path.length; k++) at.delete(path[k]);
      path.length = i;
      if (loop.length >= 3) loops.push(loop);
    }
    at.set(v, path.length);
    path.push(v);
  }
  if (path.length >= 3) loops.push(path);
  return loops;
}

function normalize2(p) { const l = Math.hypot(p.x, p.y); return l > 0 ? { x: p.x / l, y: p.y / l } : { x: 0, y: 0 }; }

function intersectIntervals(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s, e]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}
