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
export const sizeOf = (shape) => { try { const [lo, hi] = shape.boundingBox.bounds; return Math.max(1e-6, len(sub(hi, lo))); } catch { return 1; } };

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
    let chains = [];
    try { chains = zeroCurves(face, d, { grid, size }); } catch { chains = []; }
    for (const c of chains) { const t = chainCutter(face, c, size); if (t) { tools.push(t); cutFaces.add(i); } }
  });
  const plain = () => ({ faces: faces.map((face, index) => ({ index, hash: face.hashCode, face, pieces: [face] })), shell: body, split: 0, cutters: tools.length });
  if (!tools.length) return plain();
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
      return { index, hash: face.hashCode, face, pieces: mod.length ? mod : [face] };
    });
    return { faces: out, shell, split: out.filter((f) => f.pieces.length > 1).length, cutters: tools.length };
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
  return {
    eps,
    blocked(p, side) { return q.to(R.makeLine(p, add(p, mul(d, side * L)))) < eps * 0.5; },
    delete() { q.delete(); },
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
      try { const prism = prismOf(piece.clone(), mul(d, -blocks * span)); out.push({ piece, blocks, prism, box: boxOf(prism) }); } catch { /* none */ }
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
        const tools = casters.filter((c) => c.piece !== piece && sides.includes(c.blocks) && boxesMeet(c.box, box, rays.eps * 2)).map((c) => c.prism);
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
      details.push({ index: rec.index, hash: rec.hash, cls, area, fractions, pieces: rec.pieces.length, exact: exactPieces === rec.pieces.length });
    }
  } finally { rays.delete(); }
  return { faces, counts, undercut: counts.undercut, details, split: sp.split };
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
  const loops = edgeLoops(recs.map((r) => r.edge), size * 1e-7).map((l) => l.map((i) => recs[i]));
  let outer = -1; let best = -1;
  loops.forEach((l, i) => { const f = footprint(l.map((r) => r.edge), d); if (f > best) { best = f; outer = i; } });
  return { loops, outer, split: split.split };
}
