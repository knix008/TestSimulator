// Exact geometry from the B-rep kernel for machining (no DOM): plane sections of a solid (OpenCASCADE's
// BRepAlgoAPI_Section, the curves discretised to a chord tolerance) and the offset solid that a ball or the
// corner of a bull nose traces (BRepOffsetAPI_MakeOffsetShape with arc joins = the solid's Minkowski sum with a
// sphere). The section of the offset solid at the centre height of a ball is exactly the curve its centre runs
// on when the ball touches the part all round.
import { rep } from './kernel.js';
import { projectedShadow } from './costing.js';
import { silhouetteSplitCached, faceSamples } from './mold-brep.js';
import { loopArea, windingOf, cleanLoop, reverseLoop } from './cam-geom.js';

/** The solid offset outwards by r (arc joins), cached on the shape. */
export function offsetSolid(shape, r) {
  shape.__camOffsets ??= new Map();
  const k = Math.round(r * 1e6);
  if (!shape.__camOffsets.has(k)) {
    const R = rep();
    shape.__camOffsets.set(k, r > 0 ? R.makeOffset(shape.clone ? shape.clone() : shape, r, 1e-5) : shape);
  }
  return shape.__camOffsets.get(k);
}

/**
 * The section of a solid with the plane Z = z as closed loops, material on the left (outer CCW, holes CW).
 * `tol`: the chord tolerance of the curves' polylines.
 */
export function kernelSection(shape, z, { tol = 0.001 } = {}) {
  const R = rep(); const oc = R.getOC();
  const size = 1e5;
  const plane = R.drawRectangle(size, size).sketchOnPlane('XY', z).face();
  const op = new oc.BRepAlgoAPI_Section(shape.wrapped, plane.wrapped, true);
  let edges;
  try { edges = R.cast(op.Shape()).meshEdges({ tolerance: tol, angularTolerance: 0.02 }); } finally { op.delete(); plane.delete?.(); }
  // Every edge as a polyline; chained end to end into loops.
  const polys = edges.edgeGroups.map((g) => { const pts = []; for (let i = g.start; i < g.start + g.count; i++) pts.push([edges.lines[3 * i], edges.lines[3 * i + 1]]); return pts; }).filter((p) => p.length > 1);
  const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
  const used = new Array(polys.length).fill(false);
  const loops = [];
  for (let s = 0; s < polys.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const loop = [...polys[s]];
    for (let guard = 0; guard < polys.length && key(loop[0]) !== key(loop.at(-1)); guard++) {
      const end = loop.at(-1);
      let found = false;
      for (let t = 0; t < polys.length; t++) {
        if (used[t]) continue;
        const q = polys[t];
        if (key(q[0]) === key(end)) { loop.push(...q.slice(1)); used[t] = true; found = true; break; }
        if (key(q.at(-1)) === key(end)) { loop.push(...[...q].reverse().slice(1)); used[t] = true; found = true; break; }
      }
      if (!found) break;
    }
    if (key(loop[0]) === key(loop.at(-1))) loop.pop();
    const c = cleanLoop(loop, 1e-7);
    if (c.length >= 3) loops.push(c);
  }
  // Orientation by nesting: even depth = material boundary (CCW), odd = hole (CW).
  return loops.map((l) => {
    const depth = loops.filter((o) => o !== l && Math.abs(loopArea(o)) > Math.abs(loopArea(l)) && windingOf(o, l[0]) !== 0).length;
    const ccw = loopArea(l) > 0;
    return (depth % 2 === 0) === ccw ? l : reverseLoop(l);
  });
}

/**
 * The highest point of any face (piece) facing down (−Z) — material over a hollow: under it a cutter's shank can be
 * trapped. Curved faces are split at their silhouette first, so a sphere's lower half counts and its upper half does
 * not. −Infinity when nothing faces down (the part is a terrain: each section holds every section above it).
 */
export function overhangTop(shape) {
  shape.__camOverhang ??= (() => {
    const [lo, hi] = shape.boundingBox.bounds;
    const size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    let top = -Infinity;
    for (const rec of silhouetteSplitCached(shape, [0, 0, 1]).faces) {
      for (const piece of rec.pieces) {
        const pts = faceSamples(piece, 4, size);
        if (!pts.length || !pts.every((r) => r.n[2] < -1e-9)) continue;
        const [, phi] = piece.boundingBox.bounds;
        top = Math.max(top, phi[2]);
      }
    }
    return top;
  })();
  return shape.__camOverhang;
}

/**
 * Exactly the plan outline of all the material above height H (its shadow along Z), as loops like kernelSection's:
 * the solid cut at H, its pieces facing up projected (projectedShadow), the slab's section. Cached per shape and H.
 */
export function shadowAbove(shape, H, { tol = 0.001 } = {}) {
  shape.__camShadows ??= new Map();
  const key = Math.round(H * 1e6);
  if (shape.__camShadows.has(key)) return shape.__camShadows.get(key);
  const R = rep();
  const [lo, hi] = shape.boundingBox.bounds;
  let loops = [];
  if (H < hi[2]) {
    const cap = R.makeBox([lo[0] - 1, lo[1] - 1, H], [hi[0] + 1, hi[1] + 1, hi[2] + 1]);
    const above = (shape.clone ? shape.clone() : shape).intersect(cap);
    const s = projectedShadow(above, [0, 0, 1]);
    if (s.shadow) loops = kernelSection(s.shadow, s.base[2] + s.T / 2, { tol });
  }
  shape.__camShadows.set(key, loops);
  return loops;
}

/**
 * Exact checks on the solid for the gouge test: `intervals(p0, p1, w)` — where the segment p0→p1 (along axis w)
 * runs inside the solid, as sorted [a0, b0, a1, b1, …] in that axis' coordinate (the kernel's common of the solid
 * and the segment); `depth(p)` — the distance from p to the solid's boundary. Call delete() when done.
 */
export function exactRays(shape) {
  const R = rep(); const oc = R.getOC();
  const q = new R.DistanceQuery(shape);
  return {
    intervals(p0, p1, w) {
      const edge = R.makeLine(p0, p1);
      const op = new oc.BRepAlgoAPI_Common(shape.wrapped, edge.wrapped, new oc.Message_ProgressRange());
      try {
        if (op.HasErrors()) return null;
        const out = [];
        for (const e of R.cast(op.Shape()).edges ?? []) {
          const a = e.startPoint; const b = e.endPoint;
          const ca = [a.x, a.y, a.z][w]; const cb = [b.x, b.y, b.z][w];
          out.push([Math.min(ca, cb), Math.max(ca, cb)]);
        }
        out.sort((x, y) => x[0] - y[0]);
        // Touching pieces joined.
        const merged = [];
        for (const [a, b] of out) { if (merged.length && a <= merged[merged.length - 1] + 1e-9) merged[merged.length - 1] = Math.max(merged[merged.length - 1], b); else merged.push(a, b); }
        return merged;
      } catch { return null; } finally { op.delete(); }
    },
    /**
     * Many segments at once (one boolean per chunk): rays [{ p0, p1, w }] → their intervals (as intervals() gives
     * them), in order; null for a chunk the kernel could not do. Each piece of the result is matched to its ray by
     * the two coordinates that stay fixed along it.
     */
    intervalsMany(rays, chunk = 500) {
      const out = new Array(rays.length).fill(null);
      const keyOf = (w, p) => [0, 1, 2].filter((a) => a !== w).map((a) => Math.round(p[a] * 1e5)).join(',');
      for (let s = 0; s < rays.length; s += chunk) {
        const part = rays.slice(s, s + chunk);
        const index = new Map(part.map((r, i) => [`${r.w}|${keyOf(r.w, r.p0)}`, s + i]));
        const lists = new Map();
        let op = null; let comp = null;
        try {
          comp = R.makeCompound(part.map((r) => R.makeLine(r.p0, r.p1)));
          op = new oc.BRepAlgoAPI_Common(shape.wrapped, comp.wrapped, new oc.Message_ProgressRange());
          if (op.HasErrors()) continue;
          for (const e of R.cast(op.Shape()).edges ?? []) {
            const a = e.startPoint; const b = e.endPoint;
            const pa = [a.x, a.y, a.z]; const pb = [b.x, b.y, b.z];
            // Along which axis it runs (the one that changes), then its ray.
            const w = [0, 1, 2].reduce((m, k) => (Math.abs(pb[k] - pa[k]) > Math.abs(pb[m] - pa[m]) ? k : m), 0);
            const at = index.get(`${w}|${keyOf(w, pa)}`);
            if (at === undefined) continue;
            if (!lists.has(at)) lists.set(at, []);
            lists.get(at).push([Math.min(pa[w], pb[w]), Math.max(pa[w], pb[w])]);
          }
          for (let i = 0; i < part.length; i++) {
            const list = (lists.get(s + i) ?? []).sort((x, y) => x[0] - y[0]);
            const merged = [];
            for (const [a, b] of list) { if (merged.length && a <= merged[merged.length - 1] + 1e-9) merged[merged.length - 1] = Math.max(merged[merged.length - 1], b); else merged.push(a, b); }
            out[s + i] = merged;
          }
        } catch { /* this chunk stays unknown */ } finally { op?.delete(); }
      }
      return out;
    },
    depth(p) { try { return q.distanceTo(R.makeVertex(p)); } catch { return NaN; } },
    delete() { q.delete(); },
  };
}
