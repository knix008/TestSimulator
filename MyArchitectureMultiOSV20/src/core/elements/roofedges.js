// Footprint roofs with a slope (or a gable) per edge, like Revit's "roof by
// footprint" and ArchiCAD's multi-plane roof. Every sloped edge i defines a
// plane that passes through the top of the walls (`base`) on the edge's wall
// line and rises inwards at the edge's pitch; the roof surface is the lowest of
// those planes, so each face is the part of the outline where its plane is the
// lowest one — a half-plane clip per other edge, exact for convex outlines.
// Gable edges (slope: false) get a vertical gable wall under the surface.
//
// The result has the shape of roofModel() in roof.js: {outline, lines, faces,
// gables, peak, flat}.

import { polygonArea, offsetPolygon, clipHalfPlane, pointSegDist } from "../geom.js";

const EPS = 1e-9;

// Lower envelope of linear functions f_j(t) = a_j + b_j t on [0, 1] → [[t, z]].
function envelope(fs) {
  const ts = new Set([0, 1]);
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const db = fs[i].b - fs[j].b;
      if (Math.abs(db) < EPS) continue;
      const t = (fs[j].a - fs[i].a) / db;
      if (t > 1e-6 && t < 1 - 1e-6) ts.add(t);
    }
  }
  const at = (t) => Math.min(...fs.map((f) => f.a + f.b * t));
  const pts = [...ts].sort((x, y) => x - y).map((t) => [t, at(t)]);
  // Keep only the corners.
  return pts.filter((q, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a = pts[i - 1], c = pts[i + 1];
    const k = (c[1] - a[1]) / (c[0] - a[0] || 1);
    return Math.abs(a[1] + k * (q[0] - a[0]) - q[1]) > 1e-6;
  });
}

export function edgeRoofModel(roof, base = 0) {
  let pts = roof.pts;
  let edges = roof.edges || [];
  // Work counter-clockwise (maths axes) so the left normal points inside.
  if (polygonArea(pts) < 0) {
    const n = pts.length;
    pts = pts.slice().reverse();
    // Edge i (pts[i] → pts[i+1]) of the reversed ring is edge n-2-i of the original.
    edges = pts.map((_, i) => edges[(2 * n - 2 - i) % n] || {});
  }
  const n = pts.length;
  const pitchOf = (e) => (e && Number.isFinite(e.pitch) ? e.pitch : roof.pitch || 0);
  const overOf = (e) => (e && Number.isFinite(e.overhang) ? e.overhang : roof.overhang || 0);
  const outline = offsetPolygon(pts, edges.map((e) => -overOf(e)).concat(Array(Math.max(0, n - edges.length)).fill(-(roof.overhang || 0))));
  // Plane of each sloped edge: z = base + k·((x, y) − a)·nIn.
  const planes = [];
  for (let i = 0; i < n; i++) {
    const e = edges[i] || {};
    if (e.slope === false) continue;
    const tan = Math.tan((pitchOf(e) * Math.PI) / 180);
    if (!(tan > 0)) continue;
    const a = pts[i], b = pts[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nIn = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    // z = A·X + C
    planes.push({ i, A: [tan * nIn[0], tan * nIn[1]], C: base - tan * (a[0] * nIn[0] + a[1] * nIn[1]) });
  }
  const zOf = (pl, x, y) => pl.A[0] * x + pl.A[1] * y + pl.C;
  if (!planes.length) {
    const top = base + (roof.thickness || 200);
    return { outline, lines: [], faces: [{ pts: outline.map(([x, y]) => [x, y, top]) }], gables: [], peak: top, flat: true };
  }
  const surface = (x, y) => Math.min(...planes.map((pl) => zOf(pl, x, y)));
  const faces = [];
  for (const pl of planes) {
    let region = outline.slice();
    for (const q of planes) {
      if (q === pl || !region.length) continue;
      // Keep where z_pl − z_q <= 0  ⇔  (q.A − pl.A)·X >= pl.C − q.C.
      const dir = [q.A[0] - pl.A[0], q.A[1] - pl.A[1]];
      const value = pl.C - q.C;
      if (Math.hypot(dir[0], dir[1]) < EPS) { if (value > 1e-6) region = []; else if (q.i < pl.i) region = []; continue; }
      region = clipHalfPlane(region, [0, 0], dir, value);
    }
    if (region.length >= 3 && Math.abs(polygonArea(region)) > 1) faces.push({ pts: region.map(([x, y]) => [x, y, zOf(pl, x, y)]), edge: pl.i });
  }
  // Ridges and hips: face edges that are not on the outline.
  const onOutline = (x, y) => outline.some((a, k) => pointSegDist(x, y, ...a, ...outline[(k + 1) % outline.length]) < 1);
  const lines = [];
  const seen = new Set();
  for (const f of faces) {
    for (let k = 0; k < f.pts.length; k++) {
      const a = f.pts[k], b = f.pts[(k + 1) % f.pts.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
      if (onOutline((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      const key = [a, b].map((q) => `${Math.round(q[0])},${Math.round(q[1])}`).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push([a[0], a[1], b[0], b[1]]);
    }
  }
  // Gable walls under the gable edges (on the wall line, from the wall top up to the surface).
  const gables = [];
  for (let i = 0; i < n; i++) {
    const e = edges[i] || {};
    if (e.slope !== false) continue;
    const a = pts[i], b = pts[(i + 1) % n];
    const fs = planes.map((pl) => ({ a: zOf(pl, a[0], a[1]), b: zOf(pl, b[0], b[1]) - zOf(pl, a[0], a[1]) }));
    const env = envelope(fs).filter(([, z]) => z > base - 1);
    if (env.length < 2 || Math.max(...env.map((q) => q[1])) < base + 10) continue;
    const top = env.slice().reverse().map(([t, z]) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.max(base, z)]);
    gables.push({ pts: [[a[0], a[1], base], [b[0], b[1], base], ...top], edge: i });
  }
  const peak = Math.max(base, ...faces.flatMap((f) => f.pts.map((q) => q[2])));
  return { outline, lines, faces, gables, peak, flat: false, surface };
}
