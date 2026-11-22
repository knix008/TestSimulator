// Mould analysis on the B-rep (no DOM, no display mesh):
//   silhouette split — every curved face whose normal turns through square to the pull (n·d = 0, the draft-zero
//     curve) is split there by the kernel: the zero curve is traced in the face's UV space (marching squares,
//     roots refined by bisection on the exact normal), lifted to 3D and turned into a thin ruled cutter across
//     the surface; the body's shells are split with the cutters, so neighbours share the new edges;
//   undercut analysis — every piece (facing the pull, away from it, or a wall) split by the shadow sweeps of the
//     pieces that can block it (pruned by bounding boxes), so each sub-piece is wholly lit or wholly blocked; a
//     ray along ±pull from a sample inside it (kernel distance between the ray segment and the body) decides,
//     and the areas are the kernel's;
//   cache — the split, the analysis and the parting loops are kept per body (hash + IsSame) and pull, so the
//     mold features of one rebuild and repeated Evaluate calls reuse them;
//   parting loop — the boundary between the pieces the core forms (facing away from the pull, and walls under
//     material) and the rest, chained into loops; the outer loop is the parting line.
import { rep } from './kernel.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** Bounding-box diagonal of a shape. */
// Cached per shape object: a body's box is asked for by every analysis of one rebuild.
const SIZES = new WeakMap();
export const sizeOf = (shape) => {
  if (shape && typeof shape === 'object' && SIZES.has(shape)) return SIZES.get(shape);
  let v = 1;
  try { const [lo, hi] = shape.boundingBox.bounds; v = Math.max(1e-6, len(sub(hi, lo))); } catch { v = 1; }
  if (shape && typeof shape === 'object') SIZES.set(shape, v);
  return v;
};

/** Point, unit normal (with the face's orientation) and area element |Su × Sv| of a face at raw (u, v). */
export function faceSampler(face) {
  const oc = rep().getOC();
  const gp = new oc.BRepGProp_Face(face.wrapped, false);
  const P = new oc.gp_Pnt(); const N = new oc.gp_Vec();
  return {
    bounds: face.UVBounds,
    at(u, v) {
      gp.Normal(u, v, P, N);
      const n = [N.X(), N.Y(), N.Z()]; const J = len(n);
      return { p: [P.X(), P.Y(), P.Z()], n: J > 1e-300 ? mul(n, 1 / J) : [0, 0, 0], J, u, v };
    },
    delete() { gp.delete(); P.delete(); N.delete(); },
  };
}

/** Distance query from a fixed shape; `near(p, tol)` tells if a point is on it. */
function distanceFrom(shape) {
  const R = rep();
  const q = new R.DistanceQuery(shape);
  return {
    to(other) { try { return q.distanceTo(other); } catch { return Infinity; } },
    near(p, tol) { try { return q.distanceTo(R.makeVertex(p)) <= tol; } catch { return false; } },
    delete() { q.delete(); },
  };
}

// A grid that never lands exactly on symmetric places (u = π/2 of a cylinder): interior nodes nudged a little.
const gridT = (i, G) => (i === 0 || i === G ? i / G : (i + 0.0137 * Math.sin(i * 1.7)) / G);

/**
 * The draft-zero curves of a face for the pull `d`: chains of points where the face normal is square to d,
 * inside the trimmed face. Returns [[{ p, n, u, v }]] (each chain in order). Planar faces have none.
 */
export function zeroCurves(face, d, { grid = 24, size = null } = {}) {
  if (face.geomType === 'PLANE') return [];
  const S = faceSampler(face);
  const dist = distanceFrom(face);
  try {
    const { uMin, uMax, vMin, vMax } = S.bounds;
    const G = grid; const eps = 1e-7;
    const U = (i) => uMin + (uMax - uMin) * gridT(i, G); const V = (j) => vMin + (vMax - vMin) * gridT(j, G);
    const g = (u, v) => dot(S.at(u, v).n, d);
    const val = []; const sgn = [];
    let pos = false; let neg = false;
    for (let i = 0; i <= G; i++) {
      val.push([]); sgn.push([]);
      for (let j = 0; j <= G; j++) { const x = g(U(i), V(j)); val[i].push(x); const s = x > eps ? 1 : x < -eps ? -1 : 0; sgn[i].push(s); pos ||= s > 0; neg ||= s < 0; }
    }
    if (!pos || !neg) return [];
    const tol = (size ?? sizeOf(face)) * 1e-6 + 1e-9;
    const roots = new Map();
    const root = (key, ua, va, ub, vb, ga) => {
      if (roots.has(key)) return roots.get(key);
      let a = 0; let b = 1; const sa = Math.sign(ga);
      for (let k = 0; k < 40; k++) { const m = (a + b) / 2; const x = g(ua + (ub - ua) * m, va + (vb - va) * m); if (Math.sign(x) === sa) a = m; else b = m; }
      const m = (a + b) / 2; const r = S.at(ua + (ub - ua) * m, va + (vb - va) * m);
      roots.set(key, r);
      return r;
    };
    const crossing = (key, i0, j0, i1, j1) => (sgn[i0][j0] * sgn[i1][j1] < 0 ? { key, r: root(key, U(i0), V(j0), U(i1), V(j1), val[i0][j0]) } : null);
    const links = new Map(); // edge key → [other keys]
    const link = (a, b) => {
      const mid = mul(add(a.r.p, b.r.p), 0.5);
      if (!dist.near(a.r.p, tol) && !dist.near(b.r.p, tol) && !dist.near(mid, tol)) return; // outside the trimmed face
      for (const [x, y] of [[a, b], [b, a]]) { if (!links.has(x.key)) links.set(x.key, { r: x.r, next: [] }); links.get(x.key).next.push(y.key); }
    };
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const c = [crossing(`h${i},${j}`, i, j, i + 1, j), crossing(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1), crossing(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1), crossing(`v${i},${j}`, i, j, i, j + 1)];
        const hit = c.filter(Boolean);
        if (hit.length === 2) link(hit[0], hit[1]);
        else if (hit.length === 4) {
          const centre = g((U(i) + U(i + 1)) / 2, (V(j) + V(j + 1)) / 2);
          if (Math.sign(centre) === sgn[i][j]) { link(c[0], c[1]); link(c[2], c[3]); } else { link(c[0], c[3]); link(c[1], c[2]); }
        }
      }
    }
    // Chains: start at the open ends, then the closed loops.
    const used = new Set(); const chains = [];
    const walk = (start) => {
      const chain = []; let cur = start; let prev = null;
      while (cur && !used.has(cur)) {
        used.add(cur); const node = links.get(cur); chain.push(node.r);
        const nxt = node.next.find((k) => k !== prev && !used.has(k));
        prev = cur; cur = nxt;
      }
      // A closed loop returns to its start.
      if (chain.length > 2 && links.get(start).next.includes(prev) && prev !== start) chain.push(links.get(start).r);
      return chain;
    };
    for (const [k, node] of links) if (!used.has(k) && node.next.length === 1) chains.push(walk(k));
    for (const k of links.keys()) if (!used.has(k)) chains.push(walk(k));
    return chains.filter((c) => c.length >= 2);
  } finally { S.delete(); dist.delete(); }
}

/** Largest normal curvature near a surface point (from the normal's change over a small step in u and v). */
function curvatureAt(S, r) {
  const { uMin, uMax, vMin, vMax } = S.bounds;
  let k = 0;
  for (const [du, dv] of [[(uMax - uMin) * 1e-4, 0], [0, (vMax - vMin) * 1e-4]]) {
    const q = S.at(r.u + du, r.v + dv); const dp = len(sub(q.p, r.p));
    if (dp > 1e-12) k = Math.max(k, len(sub(q.n, r.n)) / dp);
  }
  return k;
}

const curveThrough = (pts, size) => {
  const R = rep();
  // Points on a line (a cylinder's or cone's generator): the exact line, so the cutter is a plane and the kernel's
  // section with the surface is exact too.
  const a = pts[0]; const t = unit(sub(pts.at(-1), a));
  if (pts.length === 2 || pts.every((p) => len(cross(sub(p, a), t)) < size * 1e-9 + 1e-12)) return R.makeLine(pts[0], pts.at(-1));
  return R.makeBSplineApproximation(pts, { tolerance: size * 1e-7 + 1e-9, smoothing: null, degMax: 3, degMin: 1 });
};

/**
 * A thin ruled cutter along a chain of surface points: the chain pushed ±h along the surface normal, a little
 * longer at its open ends so it reaches the face's boundary. The kernel's intersection of it with the surface is
 * the draft-zero curve.
 */
export function chainCutter(face, chain, size) {
  const R = rep(); const oc = R.getOC();
  const S = faceSampler(face);
  let kmax = 0;
  try { for (const r of chain) kmax = Math.max(kmax, curvatureAt(S, r)); } finally { S.delete(); }
  const h = Math.max(size * 1e-4, Math.min(size * 0.02, kmax > 0 ? 0.3 / kmax : size * 0.02));
  const pts = chain.map((r) => ({ p: r.p, n: r.n })).filter((r, i, a) => i === 0 || len(sub(r.p, a[i - 1].p)) > size * 1e-9);
  if (pts.length < 2) return null;
  const closed = len(sub(pts[0].p, pts.at(-1).p)) < size * 1e-7;
  if (!closed) {
    const ext = size * 1e-3;
    const t0 = unit(sub(pts[0].p, pts[1].p)); const t1 = unit(sub(pts.at(-1).p, pts.at(-2).p));
    pts.unshift({ p: add(pts[0].p, mul(t0, ext)), n: pts[0].n }); pts.push({ p: add(pts.at(-1).p, mul(t1, ext)), n: pts.at(-1).n });
  }
  const ts = new oc.BRepOffsetAPI_ThruSections(false, true, 1e-6);
  try {
    ts.AddWire(R.assembleWire([curveThrough(pts.map((r) => sub(r.p, mul(r.n, h))), size)]).wrapped);
    ts.AddWire(R.assembleWire([curveThrough(pts.map((r) => add(r.p, mul(r.n, h))), size)]).wrapped);
    ts.Build(new oc.Message_ProgressRange());
    return ts.IsDone() ? R.cast(ts.Shape()) : null;
  } catch { return null; } finally { ts.delete(); }
}

// ───────────────────────── cones: the silhouette is two generators through the apex, on one plane

/** Axis of a revolved face from its circular edges (centre and normal of the largest circle); null if none. */
function circleAxisOf(face) {
  let best = null;
  for (const e of face.edges) {
    let p;
    try { p = [0, 0.2, 0.4, 0.6, 0.8].map((t) => vec(e.pointAt(t))); } catch { continue; }
    const ab = sub(p[1], p[0]); const ac = sub(p[2], p[0]);
    const n = cross(ab, ac); const dd = 2 * dot(n, n);
    if (!(dd > 1e-18)) continue;
    const c = add(p[0], mul(add(mul(cross(n, ab), dot(ac, ac)), mul(cross(ac, n), dot(ab, ab))), 1 / dd));
    const r = len(sub(p[0], c));
    if (p.some((q) => Math.abs(len(sub(q, c)) - r) > r * 1e-6 + 1e-9)) continue;
    if (!best || r > best.r) best = { point: c, dir: unit(n), r };
  }
  return best;
}

/** The axis of a cone face ({ point, dir }): from the kernel's cone when it is bound, else its circular edges. */
function coneAxisOf(face) {
  const oc = rep().getOC();
  let ad = null;
  try {
    ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
    const ax = ad.Cone().Axis(); const l = ax.Location(); const dd = ax.Direction();
    return { point: [l.X(), l.Y(), l.Z()], dir: unit([dd.X(), dd.Y(), dd.Z()]) };
  } catch { return circleAxisOf(face); } finally { ad?.delete?.(); }
}

/**
 * The silhouette of a cone face seen along `d`: { apex, A (axis toward the face), beta (half-angle), gens: [g1, g2]
 * (unit generators from the apex), normal (of the plane holding both), t0, t1 (the face's range along a
 * generator) }; { gens: [] } when the cone faces one way all round (or lies along d); null when the face is not a
 * cone this can read. `ax` ({ point, dir }) may be given.
 */
export function coneSilhouetteLines(face, d, ax = null) {
  const axis = ax ?? coneAxisOf(face);
  if (!axis) return null;
  // Apex and half-angle from a straight edge of the face (a generator: the seam or a cut side).
  const line = face.edges.find((e) => e.geomType === 'LINE');
  if (!line) return null;
  const p = vec(line.startPoint); const q = vec(line.endPoint);
  const g0 = unit(sub(q, p));
  const w = sub(p, axis.point); const b = dot(g0, axis.dir); const den = 1 - b * b;
  if (!(den > 1e-12)) return null;
  const s = (b * dot(w, axis.dir) - dot(w, g0)) / den;
  const apex = add(p, mul(g0, s));
  const far = dot(sub(p, apex), g0) + dot(sub(q, apex), g0) > 0 ? g0 : mul(g0, -1);
  const A = dot(far, axis.dir) < 0 ? mul(axis.dir, -1) : axis.dir;
  const beta = Math.acos(Math.max(-1, Math.min(1, dot(far, A))));
  const a0 = Math.abs(A[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unit(cross(a0, A)); const e2 = cross(A, e1);
  const c1 = dot(e1, d); const c2 = dot(e2, d); const c = Math.hypot(c1, c2);
  if (!(c > 1e-12)) return { apex, A, beta, gens: [] };
  // n·d = 0 where cos(φ − ψ) = tan β (A·d) / |d across A|.
  const rhs = (Math.tan(beta) * dot(A, d)) / c;
  if (Math.abs(rhs) >= 1) return { apex, A, beta, gens: [] };
  const psi = Math.atan2(c2, c1); const k = Math.acos(rhs);
  const gen = (phi) => unit(add(mul(A, Math.cos(beta)), mul(add(mul(e1, Math.cos(phi)), mul(e2, Math.sin(phi))), Math.sin(beta))));
  const gens = [gen(psi + k), gen(psi - k)];
  // The face's range along a generator, from its boundary (axial distance / cos β).
  const ts = [];
  for (const e of face.edges) for (const t of [0, 0.25, 0.5, 0.75, 1]) { try { ts.push(dot(sub(vec(e.pointAt(t)), apex), A) / Math.cos(beta)); } catch { /* none */ } }
  return { apex, A, beta, gens, normal: unit(cross(gens[0], gens[1])), t0: Math.max(0, Math.min(...ts)), t1: Math.max(...ts) };
}

/** A square planar face of half-size h on the plane { point, n }. */
function squareFace(point, n, h) {
  const R = rep();
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(a, n)); const v = cross(n, u);
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add(point, add(mul(u, x * h), mul(v, y * h))));
  return R.makeFace(R.assembleWire(c.map((pt, i) => R.makeLine(pt, c[(i + 1) % 4]))));
}

/**
 * The plane a cone's silhouette lies on, as a square face of half-size h through the apex: [face]; [] when the
 * cone needs no split along d; null when it is not readable. (costing.js uses it for projected areas.)
 */
export function coneSilhouette(face, ax, d, h) {
  const sl = coneSilhouetteLines(face, unit(d), ax);
  if (!sl) return null;
  if (!sl.gens.length) return [];
  return [squareFace(sl.apex, sl.normal, h)];
}

/**
 * The cutter for a cone face in a shell split: one flat piece of the silhouette plane spanning both generators
 * over the face's range (a little longer; across the apex when the face reaches it), so the two silhouette lines
 * come from one cutter and the kernel's section of it with the cone is exact. undefined when no split is needed,
 * null when the face is not readable.
 */
function coneCutter(face, d, size) {
  const R = rep();
  const sl = coneSilhouetteLines(face, d);
  if (!sl) return null;
  if (!sl.gens.length) return undefined;
  const ext = size * 1e-3;
  const [g1, g2] = sl.gens; const P = (g, t) => add(sl.apex, mul(g, t));
  const t1 = sl.t1 + ext;
  const pts = sl.t0 > ext ? [P(g1, sl.t0 - ext), P(g1, t1), P(g2, t1), P(g2, sl.t0 - ext)] : [P(g1, -ext), P(g1, t1), P(g2, -ext), P(g2, t1)];
  // Across the apex the corners go round it: g1 far, g2 far, behind the apex on g1, behind it on g2.
  const quad = sl.t0 > ext ? pts : [pts[1], pts[3], pts[0], pts[2]];
  try { return R.makePolygon(quad); } catch { return null; }
}

const listShapes = (list) => {
  const R = rep(); const oc = R.getOC();
  const copy = new oc.NCollection_List_TopoDS_Shape(list); const out = [];
  while (copy.Size() > 0) { out.push(R.cast(copy.First())); copy.RemoveFirst(); }
  copy.delete();
  return out;
};

/**
 * The body's faces split at their draft-zero curves for the pull `dir`. Returns { faces: [{ index, hash (the
 * original face's), face, pieces: [Face] }], shell (the split shells, a compound: its pieces share edges),
 * split (how many faces were split), cutters }.
 */
export function silhouetteSplit(body, dir, { grid = 24 } = {}) {
  const R = rep(); const oc = R.getOC();
  const d = unit(dir); const size = sizeOf(body);
  const faces = body.faces;
  const tools = []; const cutFaces = new Set();
  faces.forEach((face, i) => {
    // A cone: one planar cutter holds both silhouette lines (two cutters meeting at the apex defeat the splitter).
    if (face.geomType === 'CONE') {
      const t = coneCutter(face, d, size);
      if (t === undefined) return;
      if (t) { tools.push(t); cutFaces.add(i); return; }
    }
    let chains = [];
    try { chains = zeroCurves(face, d, { grid, size }); } catch { chains = []; }
    for (const c of chains) { const t = chainCutter(face, c, size); if (t) { tools.push(t); cutFaces.add(i); } }
  });
  // A face that had to be split and was not is reported (unsplit: true; failed lists them), never passed silently.
  const plain = () => ({ faces: faces.map((face, index) => ({ index, hash: face.hashCode, face, pieces: [face], unsplit: cutFaces.has(index) })), shell: body, split: 0, cutters: tools.length, failed: [...cutFaces] });
  if (!tools.length) return { ...plain(), failed: [] };
  const args = new oc.NCollection_List_TopoDS_Shape();
  for (const sh of R.iterTopo(body.wrapped, 'shell')) args.Append(sh);
  const list = new oc.NCollection_List_TopoDS_Shape(); for (const t of tools) list.Append(t.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  try {
    sp.SetArguments(args); sp.SetTools(list); sp.SetFuzzyValue(size * 1e-6);
    sp.Build(new oc.Message_ProgressRange());
    if (sp.HasErrors()) return plain();
    const shell = R.cast(sp.Shape());
    const out = faces.map((face, index) => {
      const mod = listShapes(sp.Modified(face.wrapped)).filter((s) => s.wrapped.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE);
      return { index, hash: face.hashCode, face, pieces: mod.length ? mod : [face], unsplit: cutFaces.has(index) && mod.length < 2 };
    });
    return { faces: out, shell, split: out.filter((f) => f.pieces.length > 1).length, cutters: tools.length, failed: out.filter((f) => f.unsplit).map((f) => f.index) };
  } catch { return plain(); } finally { sp.delete(); args.delete(); list.delete(); }
}

/** Sample points inside a (trimmed) face on an n × n grid of its UV box: [{ p, n, J }]; finer when none fall inside. */
export function faceSamples(face, n = 6, size = null) {
  const S = faceSampler(face);
  const dist = distanceFrom(face);
  const tol = (size ?? sizeOf(face)) * 1e-6 + 1e-9;
  try {
    const { uMin, uMax, vMin, vMax } = S.bounds;
    for (const m of [n, n * 3]) {
      const out = [];
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          const r = S.at(uMin + (uMax - uMin) * (i + 0.5 + 0.013 * Math.sin(i + 2 * j)) / m, vMin + (vMax - vMin) * (j + 0.5 + 0.011 * Math.cos(2 * i + j)) / m);
          if (r.J > 0 && dist.near(r.p, tol)) out.push(r);
        }
      }
      if (out.length) return out;
    }
    return [];
  } finally { S.delete(); dist.delete(); }
}

/** Rays along ±d from points against the body: `blocked(q, side)` is true when the ray from q meets material. */
export function rayCaster(body, d) {
  const R = rep();
  const size = sizeOf(body); const L = size * 3 + 10; const eps = size * 1e-4;
  const q = distanceFrom(body);
  const exact = (p, side) => q.to(R.makeLine(p, add(p, mul(d, side * L)))) < eps * 0.5;
  const grid = rayGrid(body, d, size * 1e-5);
  return {
    eps,
    /**
     * The kernel's answer (the ray comes within eps/2 of the body), found from a fine mesh where the mesh decides it
     * beyond doubt — through a triangle well inside its edges and well ahead, or further from every triangle than
     * eps/2 plus the mesh's tolerance — and from the kernel otherwise.
     */
    blocked(p, side) {
      const g = grid ? grid.cast(p, side, eps * 0.5) : 'unsure';
      return g === 'unsure' ? exact(p, side) : g === 'hit';
    },
    delete() { q.delete(); },
  };
}

/**
 * Rays along ±d against a fine mesh of the body (chord tolerance `tol`), its triangles binned on the plane square
 * to d. cast(p, side, reach) → 'hit' (the true surface is certainly met ahead of p), 'miss' (the ray certainly
 * stays further than `reach` from it) or 'unsure'. Null when the body cannot be meshed.
 */
function rayGrid(body, d, tol) {
  let m;
  try { m = body.mesh({ tolerance: tol, angularTolerance: 0.1 }); } catch { return null; }
  const V = m?.vertices; const T = m?.triangles;
  if (!V?.length || !T?.length) return null;
  const e1 = unit(Math.abs(d[0]) < 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0])); const e2 = cross(d, e1);
  const n = V.length / 3;
  const U = new Float64Array(n); const W = new Float64Array(n); const H = new Float64Array(n);
  let u0 = Infinity; let w0 = Infinity; let u1 = -Infinity; let w1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
    U[i] = dot(p, e1); W[i] = dot(p, e2); H[i] = dot(p, d);
    u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]); w0 = Math.min(w0, W[i]); w1 = Math.max(w1, W[i]);
  }
  const nt = T.length / 3;
  const N = Math.max(1, Math.min(256, Math.ceil(Math.sqrt(nt))));
  const cu = Math.max(1e-12, (u1 - u0) / N); const cw = Math.max(1e-12, (w1 - w0) / N);
  const cells = Array.from({ length: N * N }, () => []);
  const grow = 4 * tol;
  const cellOf = (x, lo, c) => Math.max(0, Math.min(N - 1, Math.floor((x - lo) / c)));
  for (let t = 0; t < nt; t++) {
    const a = T[3 * t]; const b = T[3 * t + 1]; const c = T[3 * t + 2];
    const i0 = cellOf(Math.min(U[a], U[b], U[c]) - grow, u0, cu); const i1 = cellOf(Math.max(U[a], U[b], U[c]) + grow, u0, cu);
    const j0 = cellOf(Math.min(W[a], W[b], W[c]) - grow, w0, cw); const j1 = cellOf(Math.max(W[a], W[b], W[c]) + grow, w0, cw);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells[i * N + j].push(t);
  }
  // Signed 2D distance of (x, y) from the edge a→b, positive on the left.
  const side2 = (ax, ay, bx, by, x, y) => { const ex = bx - ax; const ey = by - ay; const l = Math.hypot(ex, ey); return l > 1e-15 ? (ex * (y - ay) - ey * (x - ax)) / l : -Math.hypot(x - ax, y - ay); };
  return {
    cast(p, side, reach) {
      const x = dot(p, e1); const y = dot(p, e2); const h = dot(p, d);
      // Further than reach + the mesh error from every triangle seen along d: a miss for sure.
      const margin = reach + grow;
      if (x < u0 - margin || x > u1 + margin || y < w0 - margin || y > w1 + margin) return 'miss';
      const list = cells[cellOf(x, u0, cu) * N + cellOf(y, w0, cw)];
      let unsure = false;
      for (const t of list) {
        let a = T[3 * t]; let b = T[3 * t + 1]; let c = T[3 * t + 2];
        let area = (U[b] - U[a]) * (W[c] - W[a]) - (U[c] - U[a]) * (W[b] - W[a]);
        if (area < 0) { const k = b; b = c; c = k; area = -area; }
        const da = side2(U[b], W[b], U[c], W[c], x, y); const db = side2(U[c], W[c], U[a], W[a], x, y); const dc = side2(U[a], W[a], U[b], W[b], x, y);
        const inner = Math.min(da, db, dc);
        if (inner < -margin) continue;                                    // well outside this triangle
        // Height of the triangle's plane over (x, y) (or its height range when it stands edge-on).
        const A2 = Math.abs(area);
        let lo; let hi;
        if (A2 > 1e-12 * (cu * cw + 1e-30)) {
          const la = ((U[b] - x) * (W[c] - y) - (U[c] - x) * (W[b] - y)) / area;
          const lb = ((U[c] - x) * (W[a] - y) - (U[a] - x) * (W[c] - y)) / area;
          const hh = la * H[a] + lb * H[b] + (1 - la - lb) * H[c];
          lo = hh; hi = hh;
        } else { lo = Math.min(H[a], H[b], H[c]); hi = Math.max(H[a], H[b], H[c]); }
        const ahead = side > 0 ? lo - h : h - hi;                        // distance ahead of p along the ray
        const behind = side > 0 ? h - hi : lo - h;                       // > 0: wholly behind p
        if (behind > margin) continue;                                    // the ray starts past it
        if (inner > margin && ahead > margin) return 'hit';               // through its inside, clearly ahead
        unsure = true;                                                    // near an edge, grazing, or level with p
      }
      return unsure ? 'unsure' : 'miss';
    },
  };
}

const CLASSES = ['cavity', 'core', 'straight', 'undercut'];

/** A shape swept along a vector by the kernel (faces → solids). */
export function prismOf(shape, v) {
  const R = rep(); const oc = R.getOC();
  const vv = new R.Vector(v);
  const mk = new oc.BRepPrimAPI_MakePrism(shape.wrapped, vv.wrapped, false, true);
  try { return R.cast(mk.Shape()); } finally { mk.delete(); vv.delete?.(); }
}

/** A face split by tools (its pieces; the face itself when nothing cuts it). */
function splitFaces(face, tools) {
  const R = rep(); const oc = R.getOC();
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(face.wrapped);
  const list = new oc.NCollection_List_TopoDS_Shape(); for (const t of tools) list.Append(t.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  try {
    sp.SetArguments(args); sp.SetTools(list); sp.Build(new oc.Message_ProgressRange());
    if (sp.HasErrors()) throw new Error('split');
    const out = R.cast(sp.Shape()).faces;
    return out.length ? out : [face];
  } finally { sp.delete(); args.delete(); list.delete(); }
}

// ───────────────────────── cache (one analysis per body and pull, reused within a rebuild and by Evaluate)

const CACHE = []; const CACHE_MAX = 16;
/** Hits and misses of the analysis cache (tests read it). */
export const moldCacheStats = { hits: 0, misses: 0 };
/** Forgets every cached analysis. */
export function clearMoldCache() { CACHE.length = 0; moldCacheStats.hits = 0; moldCacheStats.misses = 0; }

/**
 * The cached value of `make()` for this body (same kernel shape: hash and IsSame) and key; the body is kept as a
 * clone, so operations that consume the caller's copy do not spoil the check.
 */
function cached(kind, body, dir, extra, make) {
  let hash = 0; try { hash = body.hashCode; } catch { return make(); }
  const key = `${kind}|${hash}|${dir.map((x) => x.toFixed(12)).join(',')}|${extra}`;
  for (let i = 0; i < CACHE.length; i++) {
    const e = CACHE[i];
    if (e.key !== key) continue;
    let same = false; try { same = e.body.wrapped.IsSame(body.wrapped); } catch { same = false; }
    if (!same) continue;
    moldCacheStats.hits++;
    if (i) { CACHE.splice(i, 1); CACHE.unshift(e); }
    return e.value;
  }
  moldCacheStats.misses++;
  const value = make();
  let keep; try { keep = body.clone(); } catch { return value; }
  CACHE.unshift({ key, body: keep, value });
  if (CACHE.length > CACHE_MAX) CACHE.length = CACHE_MAX;
  return value;
}

/** The silhouette split of the body for the pull, cached. */
export function silhouetteSplitCached(body, dir) {
  const d = unit(dir);
  return cached('split', body, d, '', () => silhouetteSplit(body, d));
}

// ───────────────────────── shadows

const boxOf = (shape) => { try { return shape.boundingBox.bounds; } catch { return null; } };
const boxesMeet = (a, b, tol) => !a || !b || [0, 1, 2].every((k) => a[0][k] <= b[1][k] + tol && b[0][k] <= a[1][k] + tol);

/**
 * A shape's footprint seen along d: the 2D boxes (on the plane square to d) of its mesh triangles with their height
 * range along d, each grown by `grow` (the mesh's chord tolerance, so the true surface lies inside). Null when the
 * shape cannot be meshed.
 */
function footprintOf(shape, d, tol, grow) {
  let m;
  try { m = shape.mesh({ tolerance: tol, angularTolerance: 0.2 }); } catch { return null; }
  const v = m?.vertices; const t = m?.triangles;
  if (!v?.length || !t?.length) return null;
  const e1 = unit(Math.abs(d[0]) < 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0])); const e2 = cross(d, e1);
  const boxes = new Float64Array((t.length / 3) * 6);
  const all = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length / 3; i++) {
    let u0 = Infinity; let v0 = Infinity; let u1 = -Infinity; let v1 = -Infinity; let h0 = Infinity; let h1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const q = 3 * t[3 * i + k]; const p = [v[q], v[q + 1], v[q + 2]];
      const u = dot(p, e1); const w = dot(p, e2);
      const h = dot(p, d);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, w); v1 = Math.max(v1, w); h0 = Math.min(h0, h); h1 = Math.max(h1, h);
    }
    boxes.set([u0 - grow, v0 - grow, u1 + grow, v1 + grow, h0 - grow, h1 + grow], 6 * i);
    all[0] = Math.min(all[0], u0 - grow); all[1] = Math.min(all[1], v0 - grow); all[2] = Math.max(all[2], u1 + grow); all[3] = Math.max(all[3], v1 + grow);
  }
  return { boxes, all };
}

/**
 * Whether the sweep of the caster footprint `a` along `way` × d (+1 up, −1 down) may reach the piece footprint `b`:
 * false only when no triangle of b lies, seen along d, over a triangle of a on the swept side of it.
 */
function footprintsMeet(a, b, way) {
  if (!a || !b) return true;
  if (a.all[0] > b.all[2] || b.all[0] > a.all[2] || a.all[1] > b.all[3] || b.all[1] > a.all[3]) return false;
  const A = a.boxes; const B = b.boxes;
  for (let i = 0; i < A.length; i += 6) {
    if (A[i] > b.all[2] || A[i + 2] < b.all[0] || A[i + 1] > b.all[3] || A[i + 3] < b.all[1]) continue;
    for (let j = 0; j < B.length; j += 6) {
      if (!(A[i] <= B[j + 2] && B[j] <= A[i + 2] && A[i + 1] <= B[j + 3] && B[j + 1] <= A[i + 3])) continue;
      if (way > 0 ? B[j + 5] >= A[i + 4] : B[j + 4] <= A[i + 5]) return true;
    }
  }
  return false;
}

/** Mean of n·d over a piece's samples, and whether every sample faces the same way beyond `s`. */
function facingOf(pts, d, s) {
  const W = pts.reduce((x, r) => x + r.J, 0);
  const nd = W > 0 ? pts.reduce((x, r) => x + dot(r.n, d) * r.J, 0) / W : 0;
  const up = pts.length > 0 && pts.every((r) => dot(r.n, d) > s);
  const down = pts.length > 0 && pts.every((r) => dot(r.n, d) < -s);
  return { nd, kind: up ? 'up' : down ? 'down' : Math.abs(nd) <= s ? 'wall' : nd > 0 ? 'up' : 'down' };
}

/**
 * The shadow casters of the split body: every piece facing away from the pull, swept along −d (rays going +d
 * from below it meet it: `blocks` +1), and every piece facing the pull swept along +d (rays going −d: `blocks`
 * −1). With their boxes, for pruning. A closed solid's shadow along ±d is the union of these sweeps.
 */
function shadowCasters(sp, d, s, size) {
  const span = size * 3 + 10;
  const out = [];
  for (const rec of sp.faces) {
    for (const piece of rec.pieces) {
      const f = facingOf(faceSamples(piece, 3, size), d, s);
      if (f.kind === 'wall') continue;
      const blocks = f.kind === 'down' ? 1 : -1;
      try { const prism = prismOf(piece.clone(), mul(d, -blocks * span)); out.push({ piece, blocks, prism, box: boxOf(prism), foot: footprintOf(piece, d, size * 1e-3, size * 2e-3 + size * 2e-4) }); } catch { /* none */ }
    }
  }
  return out;
}

/**
 * Undercut analysis on the B-rep for a two-part mould pulled apart along `dir`: faces facing the pull (+d) must
 * see out along +d (cavity), facing away along −d (core); walls square to the pull (within `angle`°) are
 * 'straight' unless blocked both ways. Curved faces are split at the draft-zero curve first, so a face turning
 * through the pull (a side hole, a rod lying across it) is judged piece by piece. Every piece — facing or wall —
 * is then split by the shadow sweeps that can reach it (shadowCasters, pruned by boxes), so each sub-piece is wholly
 * lit or wholly blocked; one ray per sample decides it and the areas are the kernel's, exact. Cached per body and
 * pull (`cache: false` to skip). Returns { faces: Map face hash → class, counts, undercut (count), details:
 * [{ index, hash, cls, area, fractions: {class: share of the area}, pieces, exact }], split }.
 */
export function undercutBrep(body, dir, { angle = 0.5, samples = 6, split = null, cache = true } = {}) {
  const d = unit(dir);
  const run = () => undercutCompute(body, d, { angle, samples, split });
  return cache && !split ? cached('undercut', body, d, `${angle}|${samples}`, run) : run();
}

function undercutCompute(body, d, { angle, samples, split }) {
  const R = rep();
  const size = sizeOf(body);
  const s = Math.sin((angle * Math.PI) / 180);
  const sp = split ?? silhouetteSplitCached(body, d);
  const rays = rayCaster(body, d);
  const casters = shadowCasters(sp, d, s, size);
  const faces = new Map(); const counts = { cavity: 0, core: 0, straight: 0, undercut: 0 }; const details = [];
  const classify = (r) => {
    const q = add(r.p, mul(r.n, rays.eps));
    const nd = dot(r.n, d);
    if (nd > s) return rays.blocked(q, 1) ? 'undercut' : 'cavity';
    if (nd < -s) return rays.blocked(q, -1) ? 'undercut' : 'core';
    return rays.blocked(q, 1) && rays.blocked(q, -1) ? 'undercut' : 'straight';
  };
  try {
    for (const rec of sp.faces) {
      const tally = { cavity: 0, core: 0, straight: 0, undercut: 0 };
      let area = 0; let exactPieces = 0;
      for (const piece of rec.pieces) {
        let pa = 0; try { pa = R.measureArea(piece); } catch { pa = 0; }
        area += pa;
        const pts = faceSamples(piece, samples, size);
        const { kind } = facingOf(pts, d, s);
        // Facing the pull: only what is over it matters; away: what is under it; a wall: both.
        const sides = kind === 'up' ? [1] : kind === 'down' ? [-1] : [1, -1];
        const box = boxOf(piece);
        // Only sweeps that reach the piece can shadow part of it: boxes first, then the kernel's exact distance
        // (a sweep whose column only passes beside the piece is left out of the split, which changes nothing).
        let tools = casters.filter((c) => c.piece !== piece && sides.includes(c.blocks) && boxesMeet(c.box, box, rays.eps * 2));
        // Then the footprints seen along the pull (a sweep covers exactly its piece's footprint), then the distance.
        if (tools.length) { const foot = footprintOf(piece, d, size * 1e-3, size * 2e-3 + size * 2e-4); tools = tools.filter((c) => footprintsMeet(c.foot, foot, -c.blocks)); }
        if (tools.length) {
          const near = distanceFrom(piece);
          try { tools = tools.filter((c) => near.to(c.prism) <= rays.eps * 2); } finally { near.delete(); }
        }
        tools = tools.map((c) => c.prism);
        let subs = null;
        try { subs = tools.length ? splitFaces(piece, tools) : [piece]; } catch { subs = null; }
        if (subs) {
          for (const sub of subs) {
            const a = sub === piece ? pa : R.measureArea(sub);
            const sp2 = sub === piece ? pts : faceSamples(sub, 2, size);
            if (!sp2.length) { tally[kind === 'up' ? 'cavity' : kind === 'down' ? 'core' : 'straight'] += a; continue; }
            const votes = { cavity: 0, core: 0, straight: 0, undercut: 0 };
            for (const r of sp2) votes[classify(r)]++;
            tally[CLASSES.reduce((m, k) => (votes[k] > votes[m] ? k : m), CLASSES[0])] += a;
          }
          exactPieces++;
          continue;
        }
        // The kernel could not split the piece: area shares from the samples.
        const w = { cavity: 0, core: 0, straight: 0, undercut: 0 };
        for (const r of pts) w[classify(r)] += r.J;
        const tot = CLASSES.reduce((x, k) => x + w[k], 0);
        if (tot > 0) for (const k of CLASSES) tally[k] += (pa * w[k]) / tot;
      }
      const fractions = Object.fromEntries(CLASSES.map((k) => [k, area > 0 ? tally[k] / area : 0]));
      let cls = 'straight';
      if (area > 0) cls = fractions.undercut > 1e-3 ? 'undercut' : ['cavity', 'core', 'straight'].reduce((m, k) => (fractions[k] > fractions[m] + 1e-9 ? k : m), 'cavity');
      faces.set(rec.hash, cls); counts[cls]++;
      details.push({ index: rec.index, hash: rec.hash, cls, area, fractions, pieces: rec.pieces.length, exact: exactPieces === rec.pieces.length && !rec.unsplit, unsplit: Boolean(rec.unsplit) });
    }
  } finally { rays.delete(); }
  return { faces, counts, undercut: counts.undercut, details, split: sp.split, failed: sp.failed ?? [] };
}

/**
 * Which side of the mould forms each piece, for the parting line: 'core' for pieces facing away from the pull
 * and for walls with material over them but none under them; everything else (facing the pull, walls on the
 * outline, walls in through openings) 'cavity'. Returns [{ face, index (original face), side, n (mean normal) }].
 */
export function moldSides(body, dir, { angle = 0.5, split = null } = {}) {
  const d = unit(dir); const size = sizeOf(body);
  const s = Math.sin((angle * Math.PI) / 180);
  const sp = split ?? silhouetteSplitCached(body, d);
  const rays = rayCaster(body, d);
  const out = [];
  try {
    for (const rec of sp.faces) {
      for (const face of rec.pieces) {
        const pts = faceSamples(face, 4, size);
        const W = pts.reduce((x, r) => x + r.J, 0) || 1;
        const n = unit(pts.reduce((acc, r) => add(acc, mul(r.n, r.J / W)), [0, 0, 0]));
        const nd = pts.reduce((x, r) => x + dot(r.n, d) * r.J, 0) / W;
        let side = 'cavity';
        if (nd < -s) side = 'core';
        else if (nd <= s && pts.length) {
          let votes = 0;
          for (const r of pts.slice(0, 5)) {
            const q = add(r.p, mul(r.n, rays.eps));
            const up = rays.blocked(q, 1); const down = rays.blocked(q, -1);
            if (up && !down) votes++; else if (down && !up) votes--;
          }
          if (votes > 0) side = 'core';
        }
        out.push({ face, index: rec.index, side, n });
      }
    }
  } finally { rays.delete(); }
  return { pieces: out, split: sp };
}

/**
 * The edges grouped into connected loops by their shared vertices (the split shell's edges meet at one vertex
 * even where the kernel's fuzzy merge left their curve ends a little apart); end points when a vertex is missing.
 */
export function vertexLoops(edges, tol = 1e-6) {
  const R = rep();
  const ends = edges.map((e) => {
    try { const vs = [...R.iterTopo(e.wrapped, 'vertex')].map((v) => `v${R.cast(v).hashCode}`); if (vs.length) return vs; } catch { /* points */ }
    return [vec(e.startPoint), vec(e.endPoint)].map((p) => p.map((x) => Math.round(x / tol)).join(','));
  });
  const seen = new Set(); const loops = [];
  for (let i = 0; i < edges.length; i++) {
    if (seen.has(i)) continue;
    const loop = []; const stack = [i]; seen.add(i);
    while (stack.length) {
      const k = stack.pop(); loop.push(k);
      for (let j = 0; j < edges.length; j++) if (!seen.has(j) && ends[j].some((p) => ends[k].includes(p))) { seen.add(j); stack.push(j); }
    }
    loops.push(loop);
  }
  return loops;
}

/** The edges grouped into connected loops (by their end points). */
export function edgeLoops(edges, tol = 1e-6) {
  const key = (p) => p.map((x) => Math.round(x / tol)).join(',');
  const ends = edges.map((e) => [key(vec(e.startPoint)), key(vec(e.endPoint))]);
  const seen = new Set(); const loops = [];
  for (let i = 0; i < edges.length; i++) {
    if (seen.has(i)) continue;
    const loop = []; const stack = [i]; seen.add(i);
    while (stack.length) {
      const k = stack.pop(); loop.push(k);
      for (let j = 0; j < edges.length; j++) if (!seen.has(j) && ends[j].some((p) => ends[k].includes(p))) { seen.add(j); stack.push(j); }
    }
    loops.push(loop);
  }
  return loops;
}

function basis(dir) {
  const a = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(a, dir)); return { u, v: cross(dir, u) };
}

/** Area of a loop's footprint across the pull (its bounding rectangle in u, v). */
export function footprint(edges, dir) {
  const { u, v } = basis(dir);
  const pts = edges.flatMap((e) => [0, 0.25, 0.5, 0.75, 1].map((t) => vec(e.pointAt(t))));
  const us = pts.map((p) => dot(p, u)); const vs = pts.map((p) => dot(p, v));
  return (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
}

/**
 * The parting loops of the body for a pull along `dir`: edges of the silhouette-split shell between a piece the
 * core forms and one it does not, chained into loops. Returns { loops: [[{ edge, core, other }]], outer (index of
 * the loop with the largest footprint), split (faces split at their silhouette) }; edge records carry the two
 * faces so a parting surface can follow them. Cached per body and pull (the edges are shared: clone to change).
 */
export function partingLoops(body, dir, opts = {}) {
  const d = unit(dir);
  if (opts.split || opts.cache === false) return partingLoopsCompute(body, d, opts);
  return cached('loops', body, d, String(opts.angle ?? 0.5), () => partingLoopsCompute(body, d, opts));
}

function partingLoopsCompute(body, d, opts) {
  const size = sizeOf(body);
  const { pieces, split } = moldSides(body, d, opts);
  const byEdge = new Map();
  for (const pc of pieces) {
    for (const e of pc.face.edges) {
      const k = e.hashCode;
      if (!byEdge.has(k)) byEdge.set(k, { edge: e, faces: [] });
      byEdge.get(k).faces.push(pc);
    }
  }
  const recs = [];
  for (const { edge, faces } of byEdge.values()) {
    if (faces.length !== 2) continue;
    const [a, b] = faces;
    if ((a.side === 'core') === (b.side === 'core')) continue;
    const core = a.side === 'core' ? a : b; const other = core === a ? b : a;
    recs.push({ edge, core: core.face, other: other.face });
  }
  const loops = vertexLoops(recs.map((r) => r.edge), size * 1e-7).map((l) => l.map((i) => recs[i]));
  let outer = -1; let best = -1;
  loops.forEach((l, i) => { const f = footprint(l.map((r) => r.edge), d); if (f > best) { best = f; outer = i; } });
  return { loops, outer, split: split.split, failed: split.failed ?? [] };
}
