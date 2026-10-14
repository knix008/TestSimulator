// FreeCAD Surface: open surfaces from 2D curves — a ruled (or smooth) surface
// through several open curves spread over a height, a filling of a closed
// outline bulged like a membrane, a curve extruded into a face — and
// thickening a surface into a solid shell. No DOM.

import { delaunay } from './points.js';
import { polygonArea } from './geometry.js';

export const SURFACE_MODES = ['ruled', 'fill', 'extrude'];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** An open polyline resampled to n points by arc length, start to end. */
export function resampleOpen(points, n) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths[lengths.length - 1] || 1;
  const out = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (seg < points.length - 2 && lengths[seg + 1] < target) seg++;
    const t = (target - lengths[seg]) / ((lengths[seg + 1] - lengths[seg]) || 1);
    out.push({ x: points[seg].x + (points[seg + 1].x - points[seg].x) * t, y: points[seg].y + (points[seg + 1].y - points[seg].y) * t });
  }
  return out;
}

const catmull = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3);

/**
 * Surface through open curves (Surface › Sections): curve k at z = height·k/(m−1),
 * straight between them, or smooth (Catmull–Rom) when asked. Open: no caps.
 */
export function sectionSurface(curves, height, smooth = false) {
  const m = curves.length;
  if (m < 2) return [];
  const n = Math.max(24, ...curves.map((c) => c.length * 4));
  // Curves drawn the other way round are turned so their starts line up.
  const rows = curves.map((c) => resampleOpen(c, n));
  for (let k = 1; k < m; k++) {
    const a = rows[k - 1]; const b = rows[k];
    const same = Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y) + Math.hypot(a[n - 1].x - b[n - 1].x, a[n - 1].y - b[n - 1].y);
    const flipped = Math.hypot(a[0].x - b[n - 1].x, a[0].y - b[n - 1].y) + Math.hypot(a[n - 1].x - b[0].x, a[n - 1].y - b[0].y);
    if (flipped < same) rows[k] = b.slice().reverse();
  }
  const levels = [];
  for (let k = 0; k < m - 1; k++) {
    const steps = smooth && m > 2 ? 8 : 1;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const z = (height * (k + t)) / (m - 1);
      if (!t) { levels.push({ row: rows[k], z }); continue; }
      const r0 = rows[Math.max(0, k - 1)]; const r1 = rows[k]; const r2 = rows[k + 1]; const r3 = rows[Math.min(m - 1, k + 2)];
      levels.push({ row: r1.map((_, i) => ({ x: catmull(r0[i].x, r1[i].x, r2[i].x, r3[i].x, t), y: catmull(r0[i].y, r1[i].y, r2[i].y, r3[i].y, t) })), z });
    }
  }
  levels.push({ row: rows[m - 1], z: height });
  const tris = [];
  for (let k = 0; k + 1 < levels.length; k++) {
    const a = levels[k]; const b = levels[k + 1];
    for (let i = 0; i + 1 < n; i++) {
      const a0 = [a.row[i].x, a.row[i].y, a.z]; const a1 = [a.row[i + 1].x, a.row[i + 1].y, a.z];
      const b0 = [b.row[i].x, b.row[i].y, b.z]; const b1 = [b.row[i + 1].x, b.row[i + 1].y, b.z];
      tris.push([a0, a1, b1], [a0, b1, b0]);
    }
  }
  return tris;
}

/** A curve run straight up into a face of `height` (Part Extrude of an edge). */
export function extrudedCurve(points, height) {
  const tris = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]; const b = points[i + 1];
    tris.push([[a.x, a.y, 0], [b.x, b.y, 0], [b.x, b.y, height]], [[a.x, a.y, 0], [b.x, b.y, height], [a.x, a.y, height]]);
  }
  return tris;
}

const inside = (p, loop) => {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]; const b = loop[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};

/**
 * Filling of a closed outline (Surface › Filling): the membrane that is flat
 * along the outline and bulges to `bulge` in the middle (Δz = −c, z = 0 on
 * the edge) — a flat face when bulge is 0. Holes stay open.
 */
export function fillSurface(outer, holes = [], bulge = 0) {
  const loops = [outer, ...holes];
  const box = { minX: Math.min(...outer.map((p) => p.x)), maxX: Math.max(...outer.map((p) => p.x)), minY: Math.min(...outer.map((p) => p.y)), maxY: Math.max(...outer.map((p) => p.y)) };
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY) || 1;
  const step = size / 24;
  // Edge points (the outline split to about the grid step) and a grid inside.
  const pts = [];
  const fixed = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]; const b = loop[(i + 1) % loop.length];
      const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 0; k < parts; k++) { pts.push([a.x + ((b.x - a.x) * k) / parts, a.y + ((b.y - a.y) * k) / parts]); fixed.push(true); }
    }
  }
  const inMaterial = (p) => inside(p, outer) && !holes.some((h) => inside(p, h));
  for (let x = box.minX + step / 2; x < box.maxX; x += step) for (let y = box.minY + step / 2; y < box.maxY; y += step) {
    const p = { x, y };
    if (!inMaterial(p)) continue;
    // Not too near the edge (a thin sliver triangle there helps nobody).
    if (pts.some(([qx, qy], i) => fixed[i] && Math.hypot(qx - x, qy - y) < step * 0.45)) continue;
    pts.push([x, y]);
    fixed.push(false);
  }
  const tris = delaunay(pts).filter((t) => {
    const c = { x: (pts[t[0]][0] + pts[t[1]][0] + pts[t[2]][0]) / 3, y: (pts[t[0]][1] + pts[t[1]][1] + pts[t[2]][1]) / 3 };
    return inMaterial(c);
  });
  // Membrane heights: Jacobi on the mesh Laplacian with a constant load, then scaled to the bulge.
  const z = pts.map(() => 0);
  if (bulge) {
    const neighbours = pts.map(() => new Set());
    for (const [a, b, c] of tris) { neighbours[a].add(b).add(c); neighbours[b].add(a).add(c); neighbours[c].add(a).add(b); }
    for (let it = 0; it < 400; it++) {
      for (let i = 0; i < pts.length; i++) {
        if (fixed[i] || !neighbours[i].size) continue;
        let s = 0;
        for (const j of neighbours[i]) s += z[j];
        z[i] = s / neighbours[i].size + step * step * 0.25;
      }
    }
    const peak = Math.max(...z) || 1;
    for (let i = 0; i < z.length; i++) z[i] = (z[i] / peak) * bulge;
  }
  const up = polygonArea(outer) > 0;
  return tris.map((t) => {
    const tri = t.map((i) => [pts[i][0], pts[i][1], z[i]]);
    return up ? tri : [tri[0], tri[2], tri[1]];
  });
}

/**
 * A surface made a solid shell `t` thick (Part Thickness of a face): each
 * corner moved along its normal, the two skins joined along the open border.
 */
export function thicken(tris, t) {
  if (!(t > 0) || !tris.length) return tris;
  const key = (p) => p.map((v) => Math.round(v * 1e6)).join(',');
  const verts = new Map();
  const faces = tris.map((tri) => tri.map((p) => {
    const k = key(p);
    if (!verts.has(k)) verts.set(k, { p, n: [0, 0, 0] });
    return k;
  }));
  const faceNormals = faces.map((f) => {
    const [a, b, c] = f.map((k) => verts.get(k).p);
    const n = cross(sub(b, a), sub(c, a));
    const l = Math.hypot(...n) || 1;
    // Each face counts by its angle at the corner (a quad split in two still counts 90°).
    const ps = [a, b, c];
    f.forEach((k, i) => {
      const p = ps[i]; const q = ps[(i + 1) % 3]; const r = ps[(i + 2) % 3];
      const u = sub(q, p); const w = sub(r, p);
      const angle = Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / ((Math.hypot(...u) * Math.hypot(...w)) || 1))));
      const v = verts.get(k);
      v.n = [v.n[0] + (n[0] / l) * angle, v.n[1] + (n[1] / l) * angle, v.n[2] + (n[2] / l) * angle];
      (v.faces ??= []).push([n[0] / l, n[1] / l, n[2] / l]);
    });
    return n;
  });
  void faceNormals;
  // Mitred: a corner moves t / cos(angle to its faces), so every face stays t from its offset.
  const moved = new Map([...verts].map(([k, v]) => {
    const l = Math.hypot(...v.n) || 1;
    const n = v.n.map((x) => x / l);
    const cos = Math.max(0.3, Math.min(...v.faces.map((f) => f[0] * n[0] + f[1] * n[1] + f[2] * n[2])));
    return [k, v.p.map((x, i) => x + n[i] * (t / cos))];
  }));
  const out = [];
  for (const f of faces) {
    out.push(f.map((k) => moved.get(k)));
    out.push([verts.get(f[0]).p, verts.get(f[2]).p, verts.get(f[1]).p]);
  }
  // Border edges (used once): a wall between the skins.
  const count = new Map();
  for (const f of faces) for (let i = 0; i < 3; i++) { const a = f[i]; const b = f[(i + 1) % 3]; const k = a < b ? `${a}|${b}` : `${b}|${a}`; count.set(k, (count.get(k) ?? 0) + 1); }
  for (const f of faces) for (let i = 0; i < 3; i++) {
    const a = f[i]; const b = f[(i + 1) % 3];
    if (count.get(a < b ? `${a}|${b}` : `${b}|${a}`) !== 1) continue;
    const A = verts.get(a).p; const B = verts.get(b).p; const A2 = moved.get(a); const B2 = moved.get(b);
    out.push([A, B, B2], [A, B2, A2]);
  }
  // Whichever side the normals were, the shell faces out.
  const vol = out.reduce((s, [a, b, c]) => s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])), 0);
  return vol < 0 ? out.map(([a, b, c]) => [a, c, b]) : out;
}
