// Geometry for machining (no DOM, no kernel): 2D regions and their offsets, slicing a triangle mesh with
// horizontal planes, height fields and the drop cutter.
//
// Regions: a list of closed loops ([[x, y], …], last point not repeated) read with the "positive" fill rule —
// a point is inside when the sum of the winding numbers of the loops around it is > 0 (counter-clockwise
// loops count +1, clockwise −1). An outer boundary is CCW, a hole or island CW, and overlapping islands still
// read as their union. Offsetting (offsetLoops) works like a polygon clipper's offset: every edge moved to
// the side, arcs around the corners that open up, the raw curve cut at its self-intersections, and only the
// pieces at a true distance ≥ d from the region (on the right side) kept and chained back into loops. The
// arcs are circumscribed polygons, so a tool centre on the result is never closer to a wall than d.

const EPS = 1e-9;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ───────────────────────── loops

/** Signed area (CCW > 0). */
export function loopArea(loop) {
  let s = 0;
  for (let i = 0, n = loop.length; i < n; i++) { const a = loop[i]; const b = loop[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

export const loopLength = (loop, closed = true) => {
  let s = 0;
  for (let i = 0; i < loop.length - (closed ? 0 : 1); i++) s += dist(loop[i], loop[(i + 1) % loop.length]);
  return s;
};

/** Winding number of one loop around p. */
export function windingOf(loop, p) {
  let w = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i]; const b = loop[(i + 1) % n];
    const isLeft = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
    if (a[1] <= p[1]) { if (b[1] > p[1] && isLeft > 0) w++; } else if (b[1] <= p[1] && isLeft < 0) w--;
  }
  return w;
}

export const winding = (loops, p) => loops.reduce((s, l) => s + windingOf(l, p), 0);
/** Inside the region (positive fill rule). */
export const insideRegion = (loops, p) => winding(loops, p) > 0;
export const regionArea = (loops) => loops.reduce((s, l) => s + loopArea(l), 0);
export const reverseLoop = (loop) => [...loop].reverse();
export const ccw = (loop) => (loopArea(loop) < 0 ? reverseLoop(loop) : loop);
export const cw = (loop) => (loopArea(loop) > 0 ? reverseLoop(loop) : loop);

/** Bounds of loops: [xmin, ymin, xmax, ymax]. */
export function loopsBounds(loops) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of loops) for (const p of l) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
  return b;
}

export const rectLoop = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export function circleLoop(cx, cy, r, tol = 0.01) {
  const n = Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / Math.max(r, tol)))));
  // Circumscribed (the loop never comes inside the circle).
  const R = r / Math.cos(Math.PI / n);
  return Array.from({ length: n }, (_, i) => [cx + R * Math.cos((2 * Math.PI * (i + 0.5)) / n), cy + R * Math.sin((2 * Math.PI * (i + 0.5)) / n)]);
}

/** Drops repeated and collinear points (closed loop). */
export function cleanLoop(loop, tol = 1e-7) {
  let pts = loop.filter((p, i) => dist(p, loop[(i + 1) % loop.length]) > tol);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    // Start at the sharpest corner and keep it: every later point is then judged against a kept one (judged
    // against removed neighbours, a ring of points each within tol of its neighbours' line could all go).
    const n0 = pts.length; let start = 0; let sharp = -1;
    for (let i = 0; i < n0; i++) { const p0 = pts[(i - 1 + n0) % n0]; const p1 = pts[i]; const p2 = pts[(i + 1) % n0]; const u = sub(p1, p0); const v = sub(p2, p1); const h = Math.abs(cross(u, v)) / Math.max(1e-300, len(u) + len(v)); if (h > sharp) { sharp = h; start = i; } }
    pts = [...pts.slice(start), ...pts.slice(0, start)];
    const out = [pts[0]];
    for (let i = 1, n = pts.length; i < n; i++) {
      const a = out.at(-1); const b = pts[i]; const c = pts[(i + 1) % n];
      const ab = sub(b, a); const bc = sub(c, b);
      const lab = len(ab); const lbc = len(bc);
      if (lab < tol || lbc < tol) { changed = true; continue; }
      if (Math.abs(cross(ab, bc)) / (lab + lbc) < tol && dot(ab, bc) > 0) { changed = true; continue; }
      out.push(b);
    }
    pts = out;
  }
  return pts.length >= 3 ? pts : [];
}

// ───────────────────────── segments and their index

/** Distance from p to the segment a–b. */
export function segDist(p, a, b) {
  const ab = sub(b, a); const l2 = dot(ab, ab);
  let t = l2 > 0 ? dot(sub(p, a), ab) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t));
}

/** A uniform grid over segments [{ a, b }] for nearby queries. */
export class SegmentIndex {
  constructor(segs, cell = null) {
    this.segs = segs;
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    let total = 0;
    for (const s of segs) { b[0] = Math.min(b[0], s.a[0], s.b[0]); b[1] = Math.min(b[1], s.a[1], s.b[1]); b[2] = Math.max(b[2], s.a[0], s.b[0]); b[3] = Math.max(b[3], s.a[1], s.b[1]); total += dist(s.a, s.b); }
    if (!segs.length) b.fill(0);
    const span = Math.max(b[2] - b[0], b[3] - b[1], 1e-6);
    this.cell = cell ?? Math.max(span / 256, (total / Math.max(1, segs.length)) * 2, 1e-6);
    this.x0 = b[0]; this.y0 = b[1];
    this.nx = Math.max(1, Math.ceil((b[2] - b[0]) / this.cell) + 1); this.ny = Math.max(1, Math.ceil((b[3] - b[1]) / this.cell) + 1);
    this.cells = new Map();
    segs.forEach((s, i) => {
      const [i0, j0] = this.at(Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]));
      const [i1, j1] = this.at(Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1]));
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) { const key = j * this.nx + k; let c = this.cells.get(key); if (!c) { c = []; this.cells.set(key, c); } c.push(i); }
    });
    this.mark = new Int32Array(segs.length); this.stamp = 0;
  }
  at(x, y) { return [Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.x0) / this.cell))), Math.max(0, Math.min(this.ny - 1, Math.floor((y - this.y0) / this.cell)))]; }
  /** Calls fn(index) once for every segment whose cells touch the box. */
  each(x0, y0, x1, y1, fn) {
    this.stamp++;
    const [i0, j0] = this.at(x0, y0); const [i1, j1] = this.at(x1, y1);
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
      const c = this.cells.get(j * this.nx + k);
      if (!c) continue;
      for (const i of c) { if (this.mark[i] === this.stamp) continue; this.mark[i] = this.stamp; if (fn(i) === false) return; }
    }
  }
  /** Smallest distance from p to a segment within r (Infinity when none is that close). */
  near(p, r) {
    let best = Infinity;
    this.each(p[0] - r, p[1] - r, p[0] + r, p[1] + r, (i) => { const s = this.segs[i]; const d = segDist(p, s.a, s.b); if (d < best) best = d; });
    return best;
  }
  /** True when some segment is closer to p than r (cells searched from p outwards, so a near one ends it early). */
  closer(p, r) {
    this.stamp++;
    const [ci, cj] = this.at(p[0], p[1]);
    const K = Math.ceil(r / this.cell) + 1;
    for (let k = 0; k <= K; k++) {
      for (let j = cj - k; j <= cj + k; j++) {
        if (j < 0 || j >= this.ny) continue;
        const edge = j === cj - k || j === cj + k;
        for (let i = ci - k; i <= ci + k; i += edge ? 1 : 2 * k) {
          if (i < 0 || i >= this.nx) { if (!edge && k === 0) break; continue; }
          const c = this.cells.get(j * this.nx + i);
          if (c) for (const n of c) { if (this.mark[n] === this.stamp) continue; this.mark[n] = this.stamp; const s = this.segs[n]; if (segDist(p, s.a, s.b) < r) return true; }
          if (k === 0) break;
        }
      }
    }
    return false;
  }
}

const loopsSegments = (loops) => { const out = []; for (const l of loops) for (let i = 0; i < l.length; i++) out.push({ a: l[i], b: l[(i + 1) % l.length] }); return out; };

/** Distance from p to the nearest edge of the loops. */
export function distanceToLoops(loops, p) {
  let best = Infinity;
  for (const l of loops) for (let i = 0; i < l.length; i++) best = Math.min(best, segDist(p, l[i], l[(i + 1) % l.length]));
  return best;
}

// ───────────────────────── offsetting

/**
 * The region's boundary moved by `delta`: < 0 shrinks (where a tool centre of radius −delta can be inside a
 * pocket), > 0 grows (around a boss). Returns loops in the same reading (outer CCW, holes CW). `tol`: the
 * largest outward error of the corner arcs.
 */
export function offsetLoops(loops, delta, { tol = 0.005 } = {}) {
  const src = loops.map((l) => cleanLoop(l)).filter((l) => l.length >= 3);
  if (!src.length) return [];
  const d = Math.abs(delta);
  if (d < 1e-12) return src.map((l) => l.map((p) => [...p]));
  const s = delta < 0 ? 1 : -1;       // offset to the left of each edge (shrink) or to the right (grow)
  // 1. The raw offset curve of every loop.
  const raw = [];
  for (const loop of src) {
    const n = loop.length; const pts = [];
    for (let i = 0; i < n; i++) {
      const p0 = loop[(i - 1 + n) % n]; const p1 = loop[i]; const p2 = loop[(i + 1) % n];
      const u1 = sub(p1, p0); const u2 = sub(p2, p1);
      const l1 = len(u1); const l2 = len(u2);
      const n1 = [(-u1[1] / l1) * s * d, (u1[0] / l1) * s * d];
      const n2 = [(-u2[1] / l2) * s * d, (u2[0] / l2) * s * d];
      const A = [p1[0] + n1[0], p1[1] + n1[1]]; const B = [p1[0] + n2[0], p1[1] + n2[1]];
      const turn = Math.atan2(cross(u1, u2), dot(u1, u2));
      pts.push(A);
      if (s * turn < -1e-9) {
        // The offsets open up around this corner: a circumscribed arc from A to B.
        const steps = Math.max(1, Math.ceil(Math.abs(turn) / (2 * Math.acos(Math.max(0, 1 - tol / d)))));
        const step = turn / steps; const R = d / Math.cos(step / 2);
        const a0 = Math.atan2(A[1] - p1[1], A[0] - p1[0]);
        for (let k = 0; k < steps; k++) { const a = a0 + (k + 0.5) * step; pts.push([p1[0] + R * Math.cos(a), p1[1] + R * Math.sin(a)]); }
      }
      if (dist(A, B) > 1e-12) pts.push(B);
    }
    // Points that round to the same key as the one before (chainPieces joins by 1e-6 keys) are one point: at a tiny
    // offset the corner arcs are that small, and keeping both would break the chain.
    const kept = [];
    for (const p of pts) if (!kept.length || keyOf(p) !== keyOf(kept.at(-1))) kept.push(p);
    while (kept.length > 1 && keyOf(kept[0]) === keyOf(kept.at(-1))) kept.pop();
    raw.push(kept);
  }
  // 2. Raw segments, cut at every crossing with another raw segment.
  const segs = [];
  for (const pts of raw) for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; if (dist(a, b) > 1e-12) segs.push({ a, b, cuts: [] }); }
  const index = new SegmentIndex(segs);
  for (let i = 0; i < segs.length; i++) {
    const si = segs[i];
    index.each(Math.min(si.a[0], si.b[0]), Math.min(si.a[1], si.b[1]), Math.max(si.a[0], si.b[0]), Math.max(si.a[1], si.b[1]), (j) => {
      if (j <= i) return;
      const sj = segs[j];
      const r = sub(si.b, si.a); const q = sub(sj.b, sj.a);
      const den = cross(r, q);
      const w = sub(sj.a, si.a);
      if (Math.abs(den) < 1e-14 * len(r) * len(q)) {
        // Parallel: collinear overlaps cut each other at the other's ends.
        if (Math.abs(cross(w, r)) / Math.max(len(r), 1e-12) > 1e-9) return;
        const rr = dot(r, r); const qq = dot(q, q);
        for (const [p, seg, base, dir, ll] of [[sj.a, si, si.a, r, rr], [sj.b, si, si.a, r, rr], [si.a, sj, sj.a, q, qq], [si.b, sj, sj.a, q, qq]]) {
          const t = dot(sub(p, base), dir) / ll;
          if (t > 1e-9 && t < 1 - 1e-9) seg.cuts.push({ t, p });
        }
        return;
      }
      const t = cross(w, q) / den; const u = cross(w, r) / den;
      if (t < -1e-12 || t > 1 + 1e-12 || u < -1e-12 || u > 1 + 1e-12) return;
      const p = [si.a[0] + r[0] * t, si.a[1] + r[1] * t];
      if (t > 1e-9 && t < 1 - 1e-9) si.cuts.push({ t, p });
      if (u > 1e-9 && u < 1 - 1e-9) sj.cuts.push({ t: u, p });
    });
  }
  // 3. Keep the pieces that are at distance ≥ d from the region and on the right side of it.
  const srcSegs = loopsSegments(src);
  const probe = new SegmentIndex(srcSegs);
  const srcIndex = probe.cell < d / 3 ? new SegmentIndex(srcSegs, d / 3) : probe;
  const keepTol = Math.max(1e-7, d * 1e-7);
  const pieces = [];
  for (const sg of segs) {
    const cuts = [{ t: 0, p: sg.a }, ...sg.cuts.sort((x, y) => x.t - y.t), { t: 1, p: sg.b }];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k].p; const b = cuts[k + 1].p;
      if (dist(a, b) < 1e-10) continue;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (srcIndex.closer(m, d - keepTol)) continue;
      const inside = insideRegion(src, m);
      if (delta < 0 ? !inside : inside) continue;
      pieces.push({ a, b });
    }
  }
  return chainPieces(pieces);
}

const keyOf = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;

/** Directed pieces → closed loops (cleaned; tiny loops dropped). */
function chainPieces(pieces) {
  const starts = new Map();
  // Coincident opposite pieces cancel; duplicates collapse.
  const seen = new Map();
  for (const pc of pieces) {
    const k = `${keyOf(pc.a)}>${keyOf(pc.b)}`; const back = `${keyOf(pc.b)}>${keyOf(pc.a)}`;
    if (seen.has(back)) { seen.get(back).dead = true; pc.dead = true; continue; }
    if (seen.has(k)) { pc.dead = true; continue; }
    seen.set(k, pc);
  }
  for (const pc of pieces) { if (pc.dead) continue; const k = keyOf(pc.a); if (!starts.has(k)) starts.set(k, []); starts.get(k).push(pc); }
  const out = [];
  for (const first of pieces) {
    if (first.dead || first.used) continue;
    const loop = [first.a];
    first.used = true;
    let cur = first; const startKey = keyOf(first.a);
    let guard = pieces.length + 5;
    let closed = false;
    while (guard-- > 0) {
      const k = keyOf(cur.b);
      if (k === startKey) { closed = true; break; }
      loop.push(cur.b);
      const nexts = (starts.get(k) ?? []).filter((x) => !x.used);
      if (!nexts.length) break;
      // Several ways on: the sharpest turn to the left keeps loops from merging through a touch point.
      let next = nexts[0];
      if (nexts.length > 1) {
        const din = sub(cur.b, cur.a); let best = -Infinity;
        for (const x of nexts) { const dout = sub(x.b, x.a); const ang = Math.atan2(cross(din, dout), dot(din, dout)); if (ang > best) { best = ang; next = x; } }
      }
      next.used = true; cur = next;
    }
    if (!closed) continue;
    const c = cleanLoop(loop);
    if (c.length >= 3 && Math.abs(loopArea(c)) > 1e-8) out.push(c);
  }
  return out;
}

/** Union of regions (each a loop list) as one cleaned loop list (via a tiny grow and shrink). */
export function unionLoops(loops, eps = 1e-4) {
  const grown = offsetLoops(loops, eps);
  return offsetLoops(grown, -eps);
}

/** Nested offset rings for clearing: offsets by first, first + step, … until nothing is left. */
export function clearingRings(loops, first, step, { tol = 0.005, max = 400 } = {}) {
  // Erosion by r1 then r2 is erosion by r1 + r2, so each ring is the one before moved by `step`.
  const rings = [];
  let cur = offsetLoops(loops, -first, { tol });
  for (let k = 0; k < max && cur.length; k++) {
    rings.push(cur);
    cur = offsetLoops(cur, -step, { tol });
  }
  return rings;
}

/** Splits loops into groups: each outer (CCW) loop with the holes (CW) directly inside it. */
export function groupRegions(loops) {
  const outers = loops.filter((l) => loopArea(l) > 0).sort((a, b) => loopArea(a) - loopArea(b));
  const holes = loops.filter((l) => loopArea(l) < 0);
  const groups = outers.map((o) => ({ outer: o, holes: [] }));
  for (const h of holes) {
    const g = groups.find((x) => windingOf(x.outer, h[0]) !== 0);
    if (g) g.holes.push(h);
  }
  return groups;
}

/** Polyline clipped to the region (positive rule): the pieces inside. */
export function clipPolyline(pts, loops) {
  const segs = loopsSegments(loops);
  const out = []; let cur = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]; const b = pts[i + 1];
    const ts = [0, 1];
    const r = sub(b, a);
    for (const s of segs) {
      const q = sub(s.b, s.a); const den = cross(r, q);
      if (Math.abs(den) < 1e-14) continue;
      const w = sub(s.a, a); const t = cross(w, q) / den; const u = cross(w, r) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k]; const t1 = ts[k + 1];
      if (t1 - t0 < 1e-12) continue;
      const m = [a[0] + r[0] * (t0 + t1) / 2, a[1] + r[1] * (t0 + t1) / 2];
      const p0 = [a[0] + r[0] * t0, a[1] + r[1] * t0]; const p1 = [a[0] + r[0] * t1, a[1] + r[1] * t1];
      if (insideRegion(loops, m)) {
        if (!cur.length) cur.push(p0);
        else if (dist(cur.at(-1), p0) > 1e-9) { out.push(cur); cur = [p0]; }
        cur.push(p1);
      } else if (cur.length) { out.push(cur); cur = []; }
    }
  }
  if (cur.length > 1) out.push(cur);
  return out.filter((p) => p.length > 1);
}

// ───────────────────────── meshes

/**
 * A mesh as body.mesh() gives it ({ vertices, triangles }) with its vertices welded by position: shared
 * vertex indices across faces, so slices chain into closed loops.
 */
export function weldMesh(mesh, tol = 1e-5) {
  const V = mesh.vertices; const T = mesh.triangles;
  const map = new Map(); const verts = []; const remap = new Int32Array(V.length / 3);
  for (let i = 0; i < V.length / 3; i++) {
    const k = `${Math.round(V[3 * i] / tol)},${Math.round(V[3 * i + 1] / tol)},${Math.round(V[3 * i + 2] / tol)}`;
    let j = map.get(k);
    if (j === undefined) { j = verts.length / 3; map.set(k, j); verts.push(V[3 * i], V[3 * i + 1], V[3 * i + 2]); }
    remap[i] = j;
  }
  const tris = [];
  for (let t = 0; t < T.length; t += 3) {
    const a = remap[T[t]]; const b = remap[T[t + 1]]; const c = remap[T[t + 2]];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return { vertices: Float64Array.from(verts), triangles: Uint32Array.from(tris) };
}

export function meshBounds(mesh) {
  const V = mesh.vertices; const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k]); }
  return { lo, hi };
}

/** Signed volume of a closed mesh (outward triangles). */
export function meshVolume(mesh) {
  const V = mesh.vertices; const T = mesh.triangles; let vol = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t]; const b = 3 * T[t + 1]; const c = 3 * T[t + 2];
    vol += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
  }
  return vol;
}

/**
 * The cross-section of a closed, welded mesh at height z: material loops (outer CCW, holes CW). Vertices
 * exactly on the plane are nudged up by a hair so every crossing is proper.
 */
export function sliceMesh(welded, z) {
  const V = welded.vertices; const T = welded.triangles;
  const zz = (i) => { const v = V[3 * i + 2] - z; return Math.abs(v) < 1e-9 ? -1e-9 : v; };
  const point = new Map();
  const edgePoint = (i, j) => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    let p = point.get(k);
    if (!p) {
      const zi = zz(i); const zj = zz(j); const t = zi / (zi - zj);
      p = { k, x: V[3 * i] + (V[3 * j] - V[3 * i]) * t, y: V[3 * i + 1] + (V[3 * j + 1] - V[3 * i + 1]) * t };
      point.set(k, p);
    }
    return p;
  };
  const next = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const ids = [T[t], T[t + 1], T[t + 2]];
    const s = ids.map(zz);
    const above = s.map((v) => v > 0);
    const nAbove = above.filter(Boolean).length;
    if (nAbove === 0 || nAbove === 3) continue;
    // The lone vertex on one side, then the others in triangle order.
    const lone = above.findIndex((a) => (nAbove === 1 ? a : !a));
    const i0 = ids[lone]; const i1 = ids[(lone + 1) % 3]; const i2 = ids[(lone + 2) % 3];
    const p1 = edgePoint(i0, i1); const p2 = edgePoint(i0, i2);
    // Material on the left of the segment (outer loops CCW): with outward normals, p1 → p2 when the lone vertex is above.
    if (nAbove === 1) next.set(p1.k, p2); else next.set(p2.k, p1);
  }
  const loops = []; const used = new Set();
  for (const [k0] of next) {
    if (used.has(k0)) continue;
    const loop = []; let k = k0; let guard = next.size + 2;
    while (guard-- > 0 && !used.has(k)) {
      used.add(k);
      const p = point.get(k); loop.push([p.x, p.y]);
      const n = next.get(k); if (!n) break;
      k = n.k;
    }
    if (k === k0) { const c = cleanLoop(loop, 1e-7); if (c.length >= 3) loops.push(c); }
  }
  return loops;
}

/** Heights of the horizontal planar areas of a mesh (floors and tops), highest first. */
export function flatLevels(welded, { minArea = 1e-3 } = {}) {
  const V = welded.vertices; const T = welded.triangles; const areas = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t]; const b = 3 * T[t + 1]; const c = 3 * T[t + 2];
    const ux = V[b] - V[a]; const uy = V[b + 1] - V[a + 1]; const uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a]; const vy = V[c + 1] - V[a + 1]; const vz = V[c + 2] - V[a + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz) / 2;
    if (area < 1e-12 || Math.abs(nz) / (2 * area) < 0.9999) continue;
    const z = Math.round(((V[a + 2] + V[b + 2] + V[c + 2]) / 3) * 1e4) / 1e4;
    const k = `${z}|${nz > 0 ? 1 : -1}`;
    areas.set(k, (areas.get(k) ?? 0) + area);
  }
  return [...areas].filter(([, a]) => a >= minArea).map(([k, area]) => { const [z, up] = k.split('|'); return { z: Number(z), up: up === '1', area }; }).sort((a, b) => b.z - a.z);
}

// ───────────────────────── height field and drop cutter

/** Triangles in a uniform XY grid, for drop-cutter queries. */
export class TriangleGrid {
  constructor(welded, cell = null) {
    this.V = welded.vertices; this.T = welded.triangles;
    const { lo, hi } = meshBounds(welded);
    this.lo = lo; this.hi = hi;
    const n = this.T.length / 3;
    this.cell = cell ?? Math.max((hi[0] - lo[0] + hi[1] - lo[1]) / 2 / Math.max(8, Math.sqrt(n)), 1e-3);
    this.nx = Math.ceil((hi[0] - lo[0]) / this.cell) + 1; this.ny = Math.ceil((hi[1] - lo[1]) / this.cell) + 1;
    // Cells hold their triangles in one flat array (start offsets per cell); triangles spanning many cells
    // (large flat faces) are kept in a short list of their own and tried by every query.
    const box = new Int32Array(4 * n); const counts = new Int32Array(this.nx * this.ny + 1);
    const large = [];
    for (let t = 0; t < n; t++) {
      const a = 3 * this.T[3 * t]; const b = 3 * this.T[3 * t + 1]; const c = 3 * this.T[3 * t + 2];
      const [i0, j0] = this.at(Math.min(this.V[a], this.V[b], this.V[c]), Math.min(this.V[a + 1], this.V[b + 1], this.V[c + 1]));
      const [i1, j1] = this.at(Math.max(this.V[a], this.V[b], this.V[c]), Math.max(this.V[a + 1], this.V[b + 1], this.V[c + 1]));
      box.set([i0, j0, i1, j1], 4 * t);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) { large.push(t); continue; }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[j * this.nx + i + 1]++;
    }
    for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
    const items = new Int32Array(counts[counts.length - 1]); const fill = counts.slice(0, -1);
    for (let t = 0; t < n; t++) {
      const i0 = box[4 * t]; const j0 = box[4 * t + 1]; const i1 = box[4 * t + 2]; const j1 = box[4 * t + 3];
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * this.nx + i]++] = t;
    }
    this.start = counts; this.items = items; this.large = Int32Array.from(large); this.box = box;
    this.mark = new Int32Array(n); this.stamp = 0;
    this.zmax = new Float64Array(n);
    for (let t = 0; t < n; t++) this.zmax[t] = Math.max(this.V[3 * this.T[3 * t] + 2], this.V[3 * this.T[3 * t + 1] + 2], this.V[3 * this.T[3 * t + 2] + 2]);
  }
  at(x, y) { return [Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.lo[0]) / this.cell))), Math.max(0, Math.min(this.ny - 1, Math.floor((y - this.lo[1]) / this.cell)))]; }
  each(x0, y0, x1, y1, fn) {
    this.stamp++;
    if (x1 < this.lo[0] || y1 < this.lo[1] || x0 > this.hi[0] || y0 > this.hi[1]) return;
    const [i0, j0] = this.at(x0, y0); const [i1, j1] = this.at(x1, y1);
    const { start, items, mark, box } = this; const stamp = this.stamp;
    for (const t of this.large) {
      if (box[4 * t] > i1 || box[4 * t + 2] < i0 || box[4 * t + 1] > j1 || box[4 * t + 3] < j0) continue;
      mark[t] = stamp;
      if (fn(t) === false) return;
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * this.nx + i;
      for (let q = start[k], e = start[k + 1]; q < e; q++) { const t = items[q]; if (mark[t] !== stamp) { mark[t] = stamp; if (fn(t) === false) return; } }
    }
  }
  tri(t) { const V = this.V; const T = this.T; const a = 3 * T[3 * t]; const b = 3 * T[3 * t + 1]; const c = 3 * T[3 * t + 2]; return [[V[a], V[a + 1], V[a + 2]], [V[b], V[b + 1], V[b + 2]], [V[c], V[c + 1], V[c + 2]]]; }
  /** Highest point of the mesh above (x, y) (−Infinity when none). */
  topAt(x, y) {
    let best = -Infinity;
    this.each(x, y, x, y, (t) => { const z = triZAt(this.tri(t), x, y); if (z != null && z > best) best = z; });
    return best;
  }
}

/** z of the triangle's plane at (x, y) when (x, y) is inside its XY projection. */
function triZAt([a, b, c], x, y) {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-14) return null;
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
  const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) return null;
  return l1 * a[2] + l2 * b[2] + l3 * c[2];
}

/**
 * Drop cutter: the lowest tool-tip height at (x, y) where the cutter touches the mesh but does not cut into
 * it (vertex, facet and edge contacts). Cutter: { type: 'flat' | 'ball' | 'bull', r, rc? (corner radius of a
 * bull nose) }. `floor`: the lowest height allowed (the stock bottom). `stopAbove`: return as soon as the
 * height is known to be above it (a yes / no question: does the cutter cut the mesh with its tip there?).
 */
export function dropCutter(grid, cutter, x, y, floor = -Infinity, stopAbove = Infinity) {
  const R = cutter.r;
  const rc = cutter.type === 'ball' ? R : cutter.type === 'bull' ? Math.min(cutter.rc ?? 0, R) : 0;
  const rf = R - rc; // flat part radius
  const V = grid.V; const T = grid.T; const zmax = grid.zmax;
  let best = floor;
  const lift = (q) => (q <= rf ? 0 : rc > 0 ? rc - Math.sqrt(Math.max(0, rc * rc - (q - rf) * (q - rf))) : 0);
  grid.each(x - R, y - R, x + R, y + R, (t) => {
    // A triangle wholly below the best height so far can not lift the cutter.
    if (zmax[t] <= best) return true;
    const ia = 3 * T[3 * t]; const ib = 3 * T[3 * t + 1]; const ic = 3 * T[3 * t + 2];
    const ax = V[ia]; const ay = V[ia + 1]; const az = V[ia + 2];
    const bx = V[ib]; const by = V[ib + 1]; const bz = V[ib + 2];
    const cx = V[ic]; const cy = V[ic + 1]; const cz = V[ic + 2];
    // Vertices.
    let q = Math.hypot(ax - x, ay - y); if (q <= R) { const v = az - lift(q); if (v > best) best = v; }
    q = Math.hypot(bx - x, by - y); if (q <= R) { const v = bz - lift(q); if (v > best) best = v; }
    q = Math.hypot(cx - x, cy - y); if (q <= R) { const v = cz - lift(q); if (v > best) best = v; }
    // Facet: the touch point on the plane, on the uphill side of the axis.
    const ux = bx - ax; const uy = by - ay; const uz = bz - az; const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 1e-14) {
      nx /= nl; ny /= nl; nz /= nl;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nz > 1e-9) {
        const h = Math.hypot(nx, ny);
        const off = rf + rc * h;
        const px = h > 1e-12 ? x - (nx / h) * off : x; const py = h > 1e-12 ? y - (ny / h) * off : y;
        // Inside the triangle's XY (barycentric), then the plane's height there.
        const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(d) > 1e-14) {
          const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
          const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
          const l3 = 1 - l1 - l2;
          if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) {
            const tip = l1 * az + l2 * bz + l3 * cz - rc * (1 - nz);
            if (tip > best) best = tip;
          }
        }
      }
    }
    // Edges.
    best = Math.max(best, edgeDrop(ax, ay, az, bx, by, bz, x, y, R, rf, rc), edgeDrop(bx, by, bz, cx, cy, cz, x, y, R, rf, rc), edgeDrop(cx, cy, cz, ax, ay, az, x, y, R, rf, rc));
    return best <= stopAbove;
  });
  return best;
}

/** Drop of the cutter on one edge: analytic for flat and ball cutters, a golden-section search for a bull nose. */
function edgeDrop(px, py, pz, qx, qy, qz, x, y, R, rf, rc) {
  const dx = qx - px; const dy = qy - py; const dz = qz - pz;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-18) return -Infinity;
  const fx = px - x; const fy = py - y;
  if (rc >= R - 1e-12) {
    // Ball: the sphere's section in the edge's vertical plane is a circle of radius ρ touching the edge line.
    const L = Math.sqrt(L2); const ux = dx / L; const uy = dy / L;
    const sc = -(fx * ux + fy * uy); const e = Math.abs(fx * uy - fy * ux);
    if (e > R) return -Infinity;
    const rho = Math.sqrt(R * R - e * e); const m = dz / L; const k = Math.sqrt(1 + m * m);
    const s = sc + (rho * m) / k;
    if (s < 0 || s > L) return -Infinity;
    return pz + m * sc + rho * k - R;
  }
  // Where the edge's XY is within R of the axis.
  const B = 2 * (fx * dx + fy * dy); const C = fx * fx + fy * fy - R * R;
  const disc = B * B - 4 * L2 * C;
  if (disc < 0) return -Infinity;
  const sq = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - sq) / (2 * L2)); const t1 = Math.min(1, (-B + sq) / (2 * L2));
  if (t0 > t1) return -Infinity;
  if (rc <= 1e-12) return pz + dz * (dz > 0 ? t1 : t0); // flat: the highest reachable point of the edge
  const height = (t) => {
    const ex = fx + dx * t; const ey = fy + dy * t; const qd = Math.hypot(ex, ey);
    if (qd > R) return -Infinity;
    const lift = qd <= rf ? 0 : rc - Math.sqrt(Math.max(0, rc * rc - (qd - rf) * (qd - rf)));
    return pz + dz * t - lift;
  };
  let a = t0; let b = t1;
  let best = Math.max(height(a), height(b));
  const g = 0.6180339887;
  let c = b - g * (b - a); let d = a + g * (b - a);
  let fc = height(c); let fd = height(d);
  for (let i = 0; i < 28; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = height(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = height(d); }
  }
  best = Math.max(best, fc, fd);
  return best;
}

/** A polyline resampled so no segment is longer than `step`. */
export function resample(pts, step, closed = false) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i]; const b = pts[(i + 1) % n];
    const k = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed && n) out.push([...pts[n - 1]]);
  return out;
}

export const geom2 = { sub, cross, dot, len, dist, EPS };

/** Distance from a 3D point to a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
export function pointTriangleDistance(p, a, b, c) {
  const sub3 = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub3(b, a); const ac = sub3(c, a); const ap = sub3(p, a);
  const d1 = dot3(ab, ap); const d2 = dot3(ac, ap);
  const at = (q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = sub3(p, b); const d3 = dot3(ab, bp); const d4 = dot3(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at([a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]); }
  const cp = sub3(p, c); const d5 = dot3(ab, cp); const d6 = dot3(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at([a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]); }
  const den = 1 / (va + vb + vc); const v = vb * den; const w = vc * den;
  return at([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

/** Distance from a point to the mesh surface, searched out to `limit` (Infinity when nothing is that close). */
export function meshDistance(grid, p, limit) {
  let best = Infinity;
  grid.each(p[0] - limit, p[1] - limit, p[0] + limit, p[1] + limit, (t) => {
    if (grid.zmax[t] < p[2] - Math.min(best, limit)) return true;
    const d = pointTriangleDistance(p, ...grid.tri(t));
    if (d < best) best = d;
    return true;
  });
  return best;
}
