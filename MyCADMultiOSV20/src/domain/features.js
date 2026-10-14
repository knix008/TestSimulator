// More Part / PartDesign geometry: lofts through several sections (ruled or
// smooth), sweeps of any outline, tapered pads (draft), drilled holes
// (counterbore / countersink / drill tip), and mesh decimation. No DOM.

import { polygonArea } from './geometry.js';
import { triangulate } from './triangulate.js';

const ccw = (loop) => (polygonArea(loop) > 0 ? loop : [...loop].reverse());

/** A closed loop resampled to n points by arc length, starting nearest its lowest-left point (so sections line up). */
export function resampleAligned(loop, n) {
  const pts = ccw(loop);
  // Start at the point with the smallest x + y (a stable corner for similar shapes).
  let start = 0;
  pts.forEach((p, i) => { if (p.x + p.y < pts[start].x + pts[start].y - 1e-9) start = i; });
  const ring = [...pts.slice(start), ...pts.slice(0, start)];
  const lengths = [0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    lengths.push(lengths[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[lengths.length - 1] || 1;
  const out = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (seg < ring.length - 1 && lengths[seg + 1] < target) seg++;
    const a = ring[seg];
    const b = ring[(seg + 1) % ring.length];
    const span = lengths[seg + 1] - lengths[seg] || 1;
    const t = (target - lengths[seg]) / span;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Catmull–Rom value between p1 and p2 (p0, p3 the neighbours) at t. */
const catmull = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3);

/**
 * Loft through sections spread evenly from z = 0 to `height` (Part Loft).
 * smooth: a Catmull–Rom surface through the sections; else straight (ruled) between them.
 */
export function loftSectionsMesh(sections, height, smooth = false) {
  const m = sections.length;
  if (m < 2) return [];
  const n = Math.max(48, ...sections.map((s) => s.length));
  const rings = sections.map((s) => resampleAligned(s, n));
  const zs = rings.map((_, k) => (height * k) / (m - 1));
  // Rings to stitch: the sections, plus in-betweens for a smooth loft.
  const levels = [];
  for (let k = 0; k < m - 1; k++) {
    const steps = smooth && m > 2 ? 8 : 1;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      if (!t) { levels.push({ ring: rings[k], z: zs[k] }); continue; }
      const r0 = rings[Math.max(0, k - 1)]; const r1 = rings[k]; const r2 = rings[k + 1]; const r3 = rings[Math.min(m - 1, k + 2)];
      levels.push({ ring: r1.map((_, i) => ({ x: catmull(r0[i].x, r1[i].x, r2[i].x, r3[i].x, t), y: catmull(r0[i].y, r1[i].y, r2[i].y, r3[i].y, t) })), z: zs[k] + (zs[k + 1] - zs[k]) * t });
    }
  }
  levels.push({ ring: rings[m - 1], z: zs[m - 1] });
  const tris = [];
  for (let k = 0; k + 1 < levels.length; k++) {
    const a = levels[k]; const b = levels[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = [a.ring[i].x, a.ring[i].y, a.z]; const a1 = [a.ring[j].x, a.ring[j].y, a.z];
      const b0 = [b.ring[i].x, b.ring[i].y, b.z]; const b1 = [b.ring[j].x, b.ring[j].y, b.z];
      tris.push([a0, a1, b1], [a0, b1, b0]);
    }
  }
  const bottom = levels[0]; const top = levels[levels.length - 1];
  for (const [p, q, r] of triangulate(bottom.ring)) tris.push([[p.x, p.y, bottom.z], [r.x, r.y, bottom.z], [q.x, q.y, bottom.z]]);
  for (const [p, q, r] of triangulate(top.ring)) tris.push([[p.x, p.y, top.z], [q.x, q.y, top.z], [r.x, r.y, top.z]]);
  return tris;
}

const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  unit: (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

const signedVolume = (tris) => tris.reduce((s, [a, b, c]) => s + v3.dot(a, v3.cross(b, c)) / 6, 0);

/**
 * Sweep of a closed 2D section (centred on its own centroid) along a 3D path
 * (Part Sweep with a profile): the section stays square to the path
 * (parallel-transport frames) and is widened at bends so the walls keep their width.
 */
export function sweepSectionMesh(path, section) {
  const pts = path.filter((p, i) => i === 0 || Math.hypot(...v3.sub(p, path[i - 1])) > 1e-9);
  if (pts.length < 2 || section.length < 3) return [];
  const area = polygonArea(section);
  const cx = section.reduce((s, p) => s + p.x, 0) / section.length;
  const cy = section.reduce((s, p) => s + p.y, 0) / section.length;
  const sec = ccw(section).map((p) => ({ x: p.x - cx, y: p.y - cy }));
  if (Math.abs(area) < 1e-12) return [];
  const seg = pts.slice(0, -1).map((p, i) => v3.unit(v3.sub(pts[i + 1], p)));
  const tangents = pts.map((_, i) => (i === 0 ? seg[0] : i === pts.length - 1 ? seg[seg.length - 1] : v3.unit(v3.add(seg[i - 1], seg[i]))));
  const t0 = tangents[0];
  let normal = v3.unit(v3.cross(t0, Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const t = tangents[i];
    if (i > 0) normal = v3.unit(v3.sub(normal, v3.mul(t, v3.dot(normal, t))));
    const binormal = v3.cross(t, normal);
    // At a bend the cut plane is the bisector: stretch along the bend direction by 1/cos(half angle).
    let stretch = 1;
    let bendDir = null;
    if (i > 0 && i < pts.length - 1) {
      const c = Math.max(-0.999, Math.min(1, v3.dot(seg[i - 1], t)));
      stretch = 1 / Math.max(0.2, c);
      const b = v3.sub(seg[i], seg[i - 1]);
      if (Math.hypot(...b) > 1e-9) bendDir = v3.unit(v3.sub(b, v3.mul(t, v3.dot(b, t))));
    }
    rings.push(sec.map((q) => {
      let off = v3.add(v3.mul(normal, q.x), v3.mul(binormal, q.y));
      if (bendDir) off = v3.add(off, v3.mul(bendDir, v3.dot(off, bendDir) * (stretch - 1)));
      return v3.add(pts[i], off);
    }));
  }
  const n = sec.length;
  let tris = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      tris.push([rings[i][k], rings[i][j], rings[i + 1][j]], [rings[i][k], rings[i + 1][j], rings[i + 1][k]]);
    }
  }
  const capIndex = triangulate(sec).map((tri) => tri.map((p) => sec.findIndex((q) => q.x === p.x && q.y === p.y)));
  for (const [a, b, c] of capIndex) {
    if (a < 0 || b < 0 || c < 0) continue;
    tris.push([rings[0][a], rings[0][c], rings[0][b]]);
    tris.push([rings[rings.length - 1][a], rings[rings.length - 1][b], rings[rings.length - 1][c]]);
  }
  // Whichever way the frame turned, the solid faces outward.
  if (signedVolume(tris) < 0) tris = tris.map(([a, b, c]) => [a, c, b]);
  return tris;
}

/** Same-count offset (mitre at every corner): out (d > 0) is away from a loop's own inside. */
function mitreOffset(loop, d) {
  const sign = polygonArea(loop) > 0 ? 1 : -1;
  const n = loop.length;
  const lines = loop.map((a, i) => {
    const b = loop[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dir = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    return { p: { x: a.x + dir.y * sign * d, y: a.y - dir.x * sign * d }, dir };
  });
  return loop.map((_, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    if (Math.abs(den) < 1e-9) return l2.p;
    const t = ((l2.p.x - l1.p.x) * l2.dir.y - (l2.p.y - l1.p.y) * l2.dir.x) / den;
    return { x: l1.p.x + l1.dir.x * t, y: l1.p.y + l1.dir.y * t };
  });
}

/**
 * A pad with a draft (Part Extrude TaperAngle): every wire moves toward its own
 * inside by h·tan(angle) at the top for a positive angle — holes narrow too, as
 * FreeCAD tapers inner wires (out for a negative angle).
 */
export function taperedExtrude(shape, height, taperDeg) {
  const d = height * Math.tan((taperDeg * Math.PI) / 180);
  const outer = ccw(shape.outer);
  const holes = shape.holes.map((h) => (polygonArea(h) < 0 ? h : [...h].reverse()));
  const topOuter = mitreOffset(outer, -d);
  const topHoles = holes.map((h) => mitreOffset(h, -d));
  // A wire whose edges turn round has shrunk past nothing: no such pad.
  const turned = (low, high) => low.some((p, i) => {
    const q = low[(i + 1) % low.length]; const a = high[i]; const b = high[(i + 1) % high.length];
    return (q.x - p.x) * (b.x - a.x) + (q.y - p.y) * (b.y - a.y) <= 0;
  });
  if (polygonArea(topOuter) <= 1e-9 || topHoles.some((h) => polygonArea(h) >= -1e-9) || turned(outer, topOuter) || holes.some((h, i) => turned(h, topHoles[i]))) return null;
  const tris = [];
  for (const [a, b, c] of triangulate(outer, holes)) tris.push([[a.x, a.y, 0], [c.x, c.y, 0], [b.x, b.y, 0]]);
  for (const [a, b, c] of triangulate(topOuter, topHoles)) tris.push([[a.x, a.y, height], [b.x, b.y, height], [c.x, c.y, height]]);
  const band = (low, high) => {
    for (let i = 0; i < low.length; i++) {
      const j = (i + 1) % low.length;
      const a0 = [low[i].x, low[i].y, 0]; const a1 = [low[j].x, low[j].y, 0];
      const b0 = [high[i].x, high[i].y, height]; const b1 = [high[j].x, high[j].y, height];
      tris.push([a0, a1, b1], [a0, b1, b0]);
    }
  };
  band(outer, topOuter);
  holes.forEach((h, i) => band(h, topHoles[i]));
  return tris;
}

export const HOLE_TYPES = ['simple', 'counterbore', 'countersink'];
export const HOLE_TIPS = ['flatBottom', 'drillPoint'];

/**
 * Profile [[r, z]] (counter-clockwise) of a drilled hole whose mouth is at z = 0,
 * going down: the bore, an optional counterbore or countersink (90°) at the
 * mouth, a flat or 118° drill-point bottom. A little above z = 0 so it cuts cleanly.
 */
export function holeProfile(p) {
  const R = p.diameter / 2;
  const above = Math.max(0.05, p.diameter * 0.02);
  const tip = HOLE_TIPS[p.tip] === 'drillPoint' ? R / Math.tan((59 * Math.PI) / 180) : 0;
  const pts = [[0, -p.depth - tip], [R, -p.depth]];
  const type = HOLE_TYPES[p.type] ?? 'simple';
  if (type === 'counterbore' && p.cbDiameter > p.diameter) {
    const depth = Math.min(p.cbDepth, p.depth);
    pts.push([R, -depth], [p.cbDiameter / 2, -depth], [p.cbDiameter / 2, above]);
  } else if (type === 'countersink' && p.csDiameter > p.diameter) {
    const cs = p.csDiameter / 2;
    pts.push([R, -Math.min(cs - R, p.depth)], [cs, 0], [cs, above]);
  } else pts.push([R, above]);
  pts.push([0, above]);
  return pts;
}

/** Exact volume of a hole (cylinders and cones). */
export function holeVolume(p) {
  const prof = holeProfile(p);
  // Pappus: volume = 2π · area · centroid radius of the profile.
  let area = 0; let moment = 0;
  for (let i = 0; i < prof.length; i++) {
    const [r1, z1] = prof[i]; const [r2, z2] = prof[(i + 1) % prof.length];
    const cr = r1 * z2 - r2 * z1;
    area += cr / 2;
    moment += ((r1 + r2) * cr) / 6;
  }
  return 2 * Math.PI * moment;
}

// ───────────────────────── mesh decimation (quadric error edge collapse)

/**
 * Fewer triangles, nearly the same shape (Mesh › Decimation): edges are
 * collapsed cheapest first by the quadric error of their planes; a collapse that
 * would fold a triangle or break the surface's closedness is skipped.
 * `ratio` = triangles kept (0…1). Returns triangles.
 */
export function decimateMesh(triangles, ratio = 0.5, tolerance = 1e-9) {
  const verts = [];
  const map = new Map();
  const faces = [];
  for (const tri of triangles) {
    const f = tri.map((p) => {
      const key = p.map((v) => Math.round(v / 1e-6)).join(',');
      let i = map.get(key);
      if (i === undefined) { i = verts.length; verts.push([...p]); map.set(key, i); }
      return i;
    });
    if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2]) faces.push(f);
  }
  const target = Math.max(4, Math.floor(faces.length * ratio));
  const alive = faces.map(() => true);
  const vertFaces = verts.map(() => new Set());
  faces.forEach((f, i) => f.forEach((v) => vertFaces[v].add(i)));
  const normalOf = (f) => {
    const [a, b, c] = f.map((v) => verts[v]);
    return v3.cross(v3.sub(b, a), v3.sub(c, a));
  };
  // Quadric of each vertex: sum of the squared distances to its faces' planes.
  const Q = verts.map(() => new Array(10).fill(0));
  const addPlane = (q, n, d) => {
    const [a, b, c] = n;
    const k = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let i = 0; i < 10; i++) q[i] += k[i];
  };
  faces.forEach((f) => {
    const n = v3.unit(normalOf(f));
    const d = -v3.dot(n, verts[f[0]]);
    f.forEach((v) => addPlane(Q[v], n, d));
  });
  const errorAt = (q, p) => {
    const [x, y, z] = p;
    return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  };
  const costOf = (a, b) => {
    const q = Q[a].map((v, i) => v + Q[b][i]);
    const mid = v3.mul(v3.add(verts[a], verts[b]), 0.5);
    // The best of the two ends and the middle.
    let best = { cost: errorAt(q, mid), at: mid };
    for (const p of [verts[a], verts[b]]) { const c = errorAt(q, p); if (c < best.cost) best = { cost: c, at: [...p] }; }
    return best;
  };
  let count = faces.length;
  for (let pass = 0; pass < 40 && count > target; pass++) {
    // Candidate edges, cheapest first.
    const edges = new Map();
    faces.forEach((f, i) => {
      if (!alive[i]) return;
      for (let k = 0; k < 3; k++) {
        const a = f[k]; const b = f[(k + 1) % 3];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (!edges.has(key)) edges.set(key, [Math.min(a, b), Math.max(a, b)]);
      }
    });
    const list = [...edges.values()].map(([a, b]) => ({ a, b, ...costOf(a, b) })).sort((x, y) => x.cost - y.cost);
    const touched = new Set();
    let collapsed = 0;
    for (const e of list) {
      if (count <= target) break;
      if (touched.has(e.a) || touched.has(e.b)) continue;
      const shared = [...vertFaces[e.a]].filter((f) => vertFaces[e.b].has(f));
      if (shared.length !== 2) continue; // only interior edges of a closed surface
      // Link condition: the two ends share exactly the two opposite vertices.
      const ring = (v) => new Set([...vertFaces[v]].flatMap((f) => faces[f]).filter((x) => x !== v));
      const ra = ring(e.a); const rb = ring(e.b);
      const common = [...ra].filter((x) => rb.has(x));
      if (common.length !== 2) continue;
      // No face may flip.
      const old = [verts[e.a], verts[e.b]];
      verts[e.a] = e.at; verts[e.b] = e.at;
      let flips = false;
      for (const f of new Set([...vertFaces[e.a], ...vertFaces[e.b]])) {
        if (shared.includes(f)) continue;
        const before = (() => { const save = [verts[e.a], verts[e.b]]; verts[e.a] = old[0]; verts[e.b] = old[1]; const n = normalOf(faces[f]); verts[e.a] = save[0]; verts[e.b] = save[1]; return n; })();
        const after = normalOf(faces[f]);
        if (v3.dot(before, after) <= tolerance * Math.hypot(...before) * Math.hypot(...after)) { flips = true; break; }
      }
      if (flips) { verts[e.a] = old[0]; verts[e.b] = old[1]; continue; }
      // Collapse b into a.
      for (const f of shared) { alive[f] = false; for (const v of faces[f]) vertFaces[v].delete(f); count--; }
      for (const f of vertFaces[e.b]) {
        faces[f] = faces[f].map((v) => (v === e.b ? e.a : v));
        vertFaces[e.a].add(f);
      }
      vertFaces[e.b].clear();
      Q[e.a] = Q[e.a].map((v, i) => v + Q[e.b][i]);
      for (const v of [e.a, ...ra, ...rb]) touched.add(v);
      collapsed++;
    }
    if (!collapsed) break;
  }
  return faces.filter((_, i) => alive[i]).map((f) => f.map((v) => [...verts[v]]));
}
