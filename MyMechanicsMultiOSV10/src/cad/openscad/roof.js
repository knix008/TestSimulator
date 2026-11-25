// roof(): a 2D shape raised into a roof whose faces all slope at 45° — the height of a point is how long the
// shape's outline, moving inward at unit speed, takes to reach it.
//   method = "straight": the outline moves as a straight skeleton (every edge moves parallel to itself, corners
//     stay sharp — concave corners too). The wavefront is simulated event by event: between two events the
//     edges keep their neighbours, so each edge sweeps a planar trapezoid; an edge event drops an edge that
//     shrank to nothing, a split event cuts a loop where a concave corner runs into an edge (or joins two
//     loops — a hole and its outline). The roof is the union of the columns under those trapezoids.
//   method = "voronoi": the height is the distance to the outline (concave corners become round, in fragments
//     as $fn / $fa / $fs say); the roof is the shape extruded, minus everything within the 45° cones raised over
//     each edge (geometry.js does that with the hulls this file gives).

const EPS = 1e-9;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = (a) => Math.hypot(a[0], a[1]);

/** Signed area (counterclockwise > 0). */
export function loopArea(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) s += cross(loop[i], loop[(i + 1) % loop.length]);
  return s / 2;
}

/** A loop without repeated points and points on a straight run. */
function cleanLoop(loop, tol) {
  let pts = loop.filter((p, i) => len(sub(p, loop[(i + 1) % loop.length])) > tol);
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length]; const b = pts[i]; const c = pts[(i + 1) % pts.length];
      const u = sub(b, a); const w = sub(c, b);
      if (Math.abs(cross(u, w)) <= tol * Math.max(len(u), len(w)) && dot(u, w) > 0) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts;
}

/**
 * The straight skeleton roof of outlines (counterclockwise outer loops, clockwise holes) as convex pieces:
 * each a list of points (the swept trapezoid at its heights and the same points at z = 0) whose hull is a column
 * under one piece of the roof. Also gives the faces ([[x, y, z]] polygons) and the largest height.
 */
export function straightSkeleton(outlines, { maxEvents = 20000 } = {}) {
  let size = 0;
  for (const o of outlines) for (const p of o) size = Math.max(size, Math.abs(p[0]), Math.abs(p[1]));
  const tol = Math.max(size, 1) * 1e-9;
  const lines = []; // edge lines: { n (inward unit normal), c } — the line n·x = c + t at time t
  const loops = [];
  for (const raw of outlines) {
    const pts = cleanLoop(raw, tol);
    if (pts.length < 3 || Math.abs(loopArea(pts)) < tol * tol) continue;
    const verts = pts.map((p) => ({ p: [p[0], p[1]] }));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      const d = sub(b, a); const l = len(d);
      // Material on the left of the edge (counterclockwise outer loops, clockwise holes).
      const n = [-d[1] / l, d[0] / l];
      lines.push({ n, c: dot(n, a) });
      verts[i].e = lines.length - 1; // the edge leaving this vertex
    }
    loops.push(verts);
  }
  let t = 0;
  const pieces = []; const faces = [];
  const lineAt = (e) => lines[e];
  /** Velocity of a vertex between the edge coming in (e1) and the edge going out (e2). */
  function velocity(e1, e2) {
    const a = lines[e1].n; const b = lines[e2].n;
    const det = cross(a, b);
    if (Math.abs(det) < 1e-12) {
      // Parallel edges: the same direction (the vertex moves with them) or opposite (the strip between is gone).
      return dot(a, b) > 0 ? [a[0], a[1]] : [0, 0];
    }
    // Solve a·v = 1, b·v = 1.
    return [(b[1] - a[1]) / det, (a[0] - b[0]) / det];
  }
  const prevEdge = (loop, i) => loop[(i + loop.length - 1) % loop.length].e;
  function refresh(loop) { for (let i = 0; i < loop.length; i++) loop[i].v = velocity(prevEdge(loop, i), loop[i].e); }
  function dropDegenerate() {
    for (let k = loops.length - 1; k >= 0; k--) {
      const L = loops[k];
      // Vertices that met (an edge shrank to nothing): one vertex between the edges on either side.
      let again = true;
      while (again && L.length >= 3) {
        again = false;
        for (let i = 0; i < L.length; i++) {
          const j = (i + 1) % L.length;
          if (len(sub(L[i].p, L[j].p)) <= tol * 10) { L[i].e = L[j].e; L.splice(j, 1); again = true; break; }
        }
      }
      // Two edges on one line one after the other (left by an event): one edge.
      for (let i = 0; i < L.length && L.length >= 3; i++) {
        const j = (i + 1) % L.length;
        const a = lines[L[i].e]; const b = lines[L[j].e];
        if (L[i].e !== L[j].e && dot(a.n, b.n) > 1 - 1e-12 && Math.abs(a.c - b.c) < tol * 10) { L[i].e = L[j].e; L.splice(j, 1); i--; }
        else if (L[i].e === L[j].e) { L.splice(j, 1); i--; }
      }
      if (L.length < 3 || Math.abs(loopArea(L.map((x) => x.p))) <= tol * Math.max(size, 1) * 10) loops.splice(k, 1);
      else refresh(L);
    }
  }
  dropDegenerate();
  const pos = (v, dt) => [v.p[0] + v.v[0] * dt, v.p[1] + v.v[1] * dt];
  const isReflex = (L, i) => {
    const a = lines[prevEdge(L, i)].n; const b = lines[L[i].e].n;
    // Turning right (material on the left): the corner is concave.
    return cross(a, b) < -1e-12;
  };

  for (let guard = 0; guard < maxEvents && loops.length; guard++) {
    // The next event.
    let best = Infinity; let ev = null;
    for (let li = 0; li < loops.length; li++) {
      const L = loops[li];
      for (let i = 0; i < L.length; i++) {
        const j = (i + 1) % L.length;
        const d = sub(L[j].p, L[i].p); const l = len(d);
        const dir = l > tol ? [d[0] / l, d[1] / l] : (() => { const n = lines[L[i].e].n; return [n[1], -n[0]]; })();
        const rate = dot(sub(L[j].v, L[i].v), dir);
        if (rate < -1e-12) { const dt = l / -rate; if (dt < best) { best = dt; ev = { kind: 'edge' }; } }
      }
    }
    for (let li = 0; li < loops.length; li++) {
      const L = loops[li];
      for (let i = 0; i < L.length; i++) {
        if (!isReflex(L, i)) continue;
        const V = L[i];
        for (let mi = 0; mi < loops.length; mi++) {
          const M = loops[mi];
          for (let k = 0; k < M.length; k++) {
            if (mi === li && (k === i || (k + 1) % M.length === i)) continue;
            const ln = lineAt(M[k].e);
            const den = dot(ln.n, V.v) - 1;
            if (den >= -1e-12) continue;
            const dt = (ln.c + t - dot(ln.n, V.p)) / den;
            if (!(dt > -tol) || dt >= best) continue;
            const P = pos(V, Math.max(dt, 0));
            const A = pos(M[k], Math.max(dt, 0)); const B = pos(M[(k + 1) % M.length], Math.max(dt, 0));
            const ab = sub(B, A); const lab = len(ab);
            if (lab <= tol) continue;
            const s = dot(sub(P, A), ab) / (lab * lab);
            if (s < -1e-9 || s > 1 + 1e-9) continue;
            best = Math.max(dt, 0); ev = { kind: 'split', li, i, mi, k };
          }
        }
      }
    }
    if (!ev) break;
    const dt = best; const t1 = t + dt;
    // The trapezoids the edges sweep up to the event.
    if (dt > tol) {
      for (const L of loops) {
        for (let i = 0; i < L.length; i++) {
          const j = (i + 1) % L.length;
          const a0 = L[i].p; const b0 = L[j].p; const a1 = pos(L[i], dt); const b1 = pos(L[j], dt);
          const top = [[a0[0], a0[1], t], [b0[0], b0[1], t], [b1[0], b1[1], t1], [a1[0], a1[1], t1]];
          faces.push(top);
          pieces.push([...top, ...top.map((q) => [q[0], q[1], 0])]);
        }
      }
    }
    for (const L of loops) for (const v of L) v.p = pos(v, dt);
    t = t1;
    if (ev.kind === 'split') {
      const L = loops[ev.li]; const M = loops[ev.mi];
      const V = L[ev.i]; const A = M[ev.k]; const P = [V.p[0], V.p[1]];
      const inEdge = prevEdge(L, ev.i); const outEdge = V.e; const hitEdge = A.e;
      if (ev.li === ev.mi) {
        const n = L.length; const iv = ev.i; const ie = ev.k;
        const loop1 = [{ p: P, e: hitEdge }]; for (let x = (ie + 1) % n; x !== iv; x = (x + 1) % n) loop1.push(L[x]);
        const loop2 = [{ p: [...P], e: outEdge }]; for (let x = (iv + 1) % n; x !== (ie + 1) % n; x = (x + 1) % n) loop2.push(L[x]);
        void inEdge;
        loops.splice(ev.li, 1, loop1, loop2);
      } else {
        const nM = M.length; const nL = L.length;
        const merged = [{ p: P, e: hitEdge }];
        for (let x = (ev.k + 1) % nM, c = 0; c < nM; x = (x + 1) % nM, c++) merged.push(M[x]);
        merged.push({ p: [...P], e: outEdge });
        for (let x = (ev.i + 1) % nL; x !== ev.i; x = (x + 1) % nL) merged.push(L[x]);
        const keep = loops.filter((_, q) => q !== ev.li && q !== ev.mi);
        loops.length = 0; loops.push(...keep, merged);
      }
    }
    dropDegenerate();
  }
  return { pieces, faces, height: t };
}

/**
 * Points whose hull is everything within the 45° cone over a segment a–b up to height h (the cones over its
 * ends, as `n`-sided polygons with corners also exactly across the segment so its sides are exact planes).
 */
export function coneHullPoints(a, b, h, n) {
  const d = sub(b, a); const l = len(d) || 1;
  const nrm = Math.atan2(d[0] / l, -d[1] / l);
  const angles = new Set();
  for (let k = 0; k < n; k++) angles.add((2 * Math.PI * k) / n);
  angles.add(((nrm % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  angles.add(((nrm + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
  const out = [[a[0], a[1], 0], [b[0], b[1], 0]];
  // Corners on the circle (as OpenSCAD's fragments); the ones across the segment keep its sides at exactly 45°.
  const r = h;
  for (const q of [a, b]) for (const ang of angles) out.push([q[0] + r * Math.cos(ang), q[1] + r * Math.sin(ang), h]);
  return out;
}

void EPS;
