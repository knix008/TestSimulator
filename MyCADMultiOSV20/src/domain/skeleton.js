// Weighted straight skeleton of a simple polygon: the roof over any footprint
// with its own slope per edge (FreeCAD Arch Roof: an angle per edge, 90° = gable).
// Every edge moves inwards at speed cot(slope) per unit of height (a wavefront);
// where moving edges meet, the skeleton's arcs (hips, valleys, ridges) are
// traced. Each edge's roof face is its base edge closed by the arcs that bound it.
//   edge event   an edge of the wavefront shrinks to nothing
//   split event  a reflex vertex runs into an edge across the wavefront
// Returns { faces: [{ edge, points: [{ x, y, z }] }], arcs } with z the height
// above the eaves.

const EPS = 1e-7;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;

function signedArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) { const p = points[i]; const q = points[(i + 1) % points.length]; s += p.x * q.y - q.x * p.y; }
  return s / 2;
}

/**
 * @param points  footprint (any orientation, no repeated last point)
 * @param slopes  degrees per edge i (points[i] → points[i + 1]); 90 = vertical (gable)
 */
export function straightSkeleton(points, slopes) {
  // Counter-clockwise without zero-length edges; edge i of the reversed loop is the original edge n − 2 − i.
  let pts = points.map((p, i) => ({ ...p, slope: slopes[i] }));
  if (signedArea(points) < 0) {
    const n0 = pts.length;
    pts = pts.map((_, i) => ({ ...points[n0 - 1 - i], slope: slopes[(2 * n0 - 2 - i) % n0] }));
  }
  pts = pts.filter((p, i) => Math.hypot(p.x - pts[(i + 1) % pts.length].x, p.y - pts[(i + 1) % pts.length].y) > 1e-6);
  const slopeOf = (i) => pts[i].slope ?? 45;
  const n = pts.length;
  if (n < 3) return { faces: [], arcs: [], edgeMap: [] };
  const edges = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const m = { x: -dir.y, y: dir.x }; // inward (left of a counter-clockwise loop)
    const slope = Math.min(90, Math.max(1, Number(slopeOf(i)) || 45));
    const speed = slope >= 89.999 ? 0 : 1 / Math.tan((slope * Math.PI) / 180);
    return { a, b, dir, m, d: dot(m, a), speed };
  });
  const arcs = [];
  /** Position of the wavefront vertex between edges i and j at height t: m·p = d + s·t for both. */
  const motion = (i, j, at, t0) => {
    const ei = edges[i]; const ej = edges[j];
    const det = cross(ei.m, ej.m);
    if (Math.abs(det) < 1e-9) return { base: { x: at.x, y: at.y }, v: { x: 0, y: 0 }, t0 };
    // Solve [mi; mj] v = [si; sj].
    const v = { x: (ei.speed * ej.m.y - ej.speed * ei.m.y) / det, y: (ei.m.x * ej.speed - ej.m.x * ei.speed) / det };
    return { base: { x: at.x - v.x * t0, y: at.y - v.y * t0 }, v, t0 };
  };
  const posAt = (vx, t) => ({ x: vx.base.x + vx.v.x * t, y: vx.base.y + vx.v.y * t });
  const vertex = (ei, ej, at, t) => ({ ei, ej, start: { x: at.x, y: at.y, z: t }, ...motion(ei, ej, at, t) });
  const end = (vx, at, t) => arcs.push({ from: vx.start, to: { x: at.x, y: at.y, z: t }, left: vx.ei, right: vx.ej });

  let loops = [pts.map((p, i) => vertex((i - 1 + n) % n, i, p, 0))];
  let t = 0;
  for (let guard = 0; guard < 4 * n * n + 50 && loops.length; guard++) {
    // Close loops that ran out of room.
    loops = loops.filter((loop) => {
      if (loop.length >= 3) return true;
      if (loop.length === 2) {
        const [a, b] = loop;
        const pa = posAt(a, t); const pb = posAt(b, t);
        end(a, pa, t); end(b, pb, t);
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > 1e-6) arcs.push({ from: { ...pa, z: t }, to: { ...pb, z: t }, left: a.ej, right: a.ei });
      } else if (loop.length === 1) end(loop[0], posAt(loop[0], t), t);
      return false;
    });
    if (!loops.length) break;
    let best = null;
    loops.forEach((loop, li) => {
      const L = loop.length;
      for (let k = 0; k < L; k++) {
        const A = loop[k]; const B = loop[(k + 1) % L];
        // Edge event: A and B (both on edge A.ej) meet.
        const e = edges[A.ej];
        const dv = dot(sub(B.v, A.v), e.dir);
        const db = dot(sub(B.base, A.base), e.dir);
        if (Math.abs(dv) > 1e-12) {
          const te = -db / dv;
          if (te > t - EPS && (!best || te < best.t - EPS)) best = { kind: 'edge', t: Math.max(te, t), li, k };
        }
      }
      // Split events: a reflex vertex meets an edge of its loop.
      for (let k = 0; k < L; k++) {
        const V = loop[k];
        if (cross(edges[V.ei].dir, edges[V.ej].dir) >= -1e-9) continue;
        for (let q = 0; q < L; q++) {
          const P = loop[q]; const Q = loop[(q + 1) % L];
          const e = edges[P.ej];
          if (P.ej === V.ei || P.ej === V.ej || P === V || Q === V) continue;
          const den = dot(e.m, V.v) - e.speed;
          if (Math.abs(den) < 1e-12) continue;
          const ts = (e.d - dot(e.m, V.base)) / den;
          if (!(ts > t - EPS) || (best && ts >= best.t - EPS)) continue;
          const at = posAt(V, ts);
          const pp = posAt(P, ts); const qq = posAt(Q, ts);
          const s = dot(sub(at, pp), e.dir);
          const len = dot(sub(qq, pp), e.dir);
          if (s < -1e-6 || s > len + 1e-6) continue;
          best = { kind: 'split', t: Math.max(ts, t), li, k, q };
        }
      }
    });
    if (!best) {
      // Nothing more happens (vertical edges only): stop the wavefront where it is.
      for (const loop of loops) for (const vx of loop) end(vx, posAt(vx, t), t);
      break;
    }
    t = best.t;
    const loop = loops[best.li];
    const L = loop.length;
    if (best.kind === 'edge') {
      const A = loop[best.k]; const B = loop[(best.k + 1) % L];
      const pa = posAt(A, t); const pb = posAt(B, t);
      const at = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      end(A, at, t); end(B, at, t);
      const fresh = vertex(A.ei, B.ej, at, t);
      const next = loop.filter((vx) => vx !== A && vx !== B);
      const index = best.k + 1 < L ? best.k : 0;
      next.splice(Math.min(index, next.length), 0, fresh);
      // A vertex between an edge and itself is gone.
      loops[best.li] = next.filter((vx) => vx.ei !== vx.ej || next.length <= 1);
    } else {
      const V = loop[best.k]; const P = loop[best.q];
      const at = posAt(V, t);
      end(V, at, t);
      const k = P.ej;
      const v1 = vertex(V.ei, k, at, t);
      const v2 = vertex(k, V.ej, at, t);
      const walk = (from, to) => { const out = []; for (let i = from; ; i = (i + 1) % L) { out.push(loop[i]); if (i === to) break; } return out; };
      const one = [v1, ...walk((best.q + 1) % L, (best.k - 1 + L) % L)];
      const two = [v2, ...walk((best.k + 1) % L, best.q)];
      loops.splice(best.li, 1, one, two);
    }
  }

  // Faces: each edge's base closed by the arcs on either side of it.
  const key = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  const faces = edges.map((e, k) => {
    const segs = arcs.filter((arc) => arc.left === k || arc.right === k).map((arc) => [arc.from, arc.to]).filter(([p, q]) => key(p) !== key(q));
    const chain = [{ ...e.a, z: 0 }, { ...e.b, z: 0 }];
    const used = new Set();
    for (let guard = 0; guard < segs.length + 2; guard++) {
      const last = chain[chain.length - 1];
      if (chain.length > 2 && key(last) === key(chain[0])) break;
      const index = segs.findIndex((seg, i) => !used.has(i) && (key(seg[0]) === key(last) || key(seg[1]) === key(last)));
      if (index < 0) break;
      used.add(index);
      const [p, q] = segs[index];
      chain.push(key(p) === key(last) ? q : p);
    }
    if (chain.length > 2 && key(chain[chain.length - 1]) === key(chain[0])) chain.pop();
    return { edge: k, points: chain };
  });
  // Map back to the caller's edge numbering.
  const reversed = signedArea(points) < 0;
  return { faces, arcs, reversed, edges };
}
