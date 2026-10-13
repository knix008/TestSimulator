// Ear clipping of an outline with holes (holes joined by two-way bridges).
import { dist, polygonArea } from './geometry.js';

// ───────────────────────── triangulation (ear clipping with hole bridges)

const crossOf = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const same = (a, b) => a.x === b.x && a.y === b.y;

function inTriangle(p, a, b, c) {
  return crossOf(a, b, p) >= -1e-12 && crossOf(b, c, p) >= -1e-12 && crossOf(c, a, p) >= -1e-12;
}

/** Joins a clockwise hole to the counter-clockwise ring with a two-way bridge. */
function bridge(ring, hole) {
  let mIndex = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i].x > hole[mIndex].x) mIndex = i;
  const m = hole[mIndex];
  // Closest edge hit by a ray from m towards +x.
  let best = null;
  let bestX = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const crosses = (a.y <= m.y && b.y >= m.y) || (b.y <= m.y && a.y >= m.y);
    if (!crosses || a.y === b.y) continue;
    const x = a.x + ((m.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (x >= m.x - 1e-12 && x < bestX) { bestX = x; best = a.x > b.x ? i : (i + 1) % ring.length; }
  }
  if (best === null) {
    // Fallback: the nearest ring vertex.
    best = 0;
    for (let i = 1; i < ring.length; i++) if (dist(ring[i], m) < dist(ring[best], m)) best = i;
  } else {
    // A reflex ring vertex inside the triangle (m, hit, candidate) blocks the view: take the one closest in angle.
    const hit = { x: bestX, y: m.y };
    const candidate = ring[best];
    let bestAngle = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      if (i === best || p.x < m.x) continue;
      const tri = candidate.y >= m.y ? inTriangle(p, m, hit, candidate) : inTriangle(p, m, candidate, hit);
      if (!tri) continue;
      const angle = Math.abs(Math.atan2(p.y - m.y, p.x - m.x));
      if (angle < bestAngle - 1e-12 || (Math.abs(angle - bestAngle) <= 1e-12 && dist(p, m) < dist(ring[best], m))) {
        bestAngle = angle;
        best = i;
      }
    }
  }
  const rotated = [...hole.slice(mIndex), ...hole.slice(0, mIndex)];
  return [...ring.slice(0, best + 1), ...rotated, { ...m }, { ...ring[best] }, ...ring.slice(best + 1)];
}

/** Triangles ([a, b, c] points, counter-clockwise) covering an outline minus its holes. */
export function triangulate(outer, holes = []) {
  let ring = polygonArea(outer) > 0 ? outer.map((p) => ({ ...p })) : [...outer].reverse().map((p) => ({ ...p }));
  const ordered = holes.map((hole) => (polygonArea(hole) < 0 ? hole : [...hole].reverse()))
    .sort((a, b) => Math.max(...b.map((p) => p.x)) - Math.max(...a.map((p) => p.x)));
  for (const hole of ordered) ring = bridge(ring, hole);
  const triangles = [];
  const pts = ring;
  let index = pts.map((_, i) => i);
  let guard = 0;
  let start = 0;
  while (index.length > 3 && guard < 100000) {
    guard += 1;
    let clipped = false;
    const n = index.length;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const a = pts[index[(i - 1 + n) % n]];
      const b = pts[index[i]];
      const c = pts[index[(i + 1) % n]];
      if (crossOf(a, b, c) <= 1e-12) continue;
      let ear = true;
      for (let j = 0; j < n; j++) {
        const p = pts[index[j]];
        if (j === i || j === (i - 1 + n) % n || j === (i + 1) % n || same(p, a) || same(p, b) || same(p, c)) continue;
        if (inTriangle(p, a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      triangles.push([a, b, c]);
      index.splice(i, 1);
      start = i % index.length;
      clipped = true;
      break;
    }
    if (!clipped) {
      // Degenerate leftovers (collinear runs): drop the flattest vertex.
      let flat = 0;
      let flatness = Infinity;
      for (let i = 0; i < index.length; i++) {
        const value = Math.abs(crossOf(pts[index[(i - 1 + index.length) % index.length]], pts[index[i]], pts[index[(i + 1) % index.length]]));
        if (value < flatness) { flatness = value; flat = i; }
      }
      index = index.filter((_, i) => i !== flat);
    }
  }
  if (index.length === 3 && crossOf(pts[index[0]], pts[index[1]], pts[index[2]]) > 1e-12) triangles.push(index.map((i) => pts[i]));
  return triangles;
}
