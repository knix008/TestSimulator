// Rooms: areas, and automatic detection of enclosed spaces from the walls.
//
// Detection builds a planar graph of the wall centre lines (split at every
// crossing and T), walks each face by always taking the sharpest turn, keeps
// the bounded faces and insets each by half the thickness of the wall along
// that edge, so the room polygon follows the inner wall faces (net area).

import { polygonArea, polygonPerimeter, pointInPolygon, segIntersect, offsetPolygon, dist, closestOnSegment, labelPoint } from "./geom.js";

const Q = 1; // node merge tolerance (mm)

export function roomArea(r) {
  return Math.abs(polygonArea(r.pts));
}

export function roomPerimeter(r) {
  return polygonPerimeter(r.pts);
}

export function roomLabelPoint(r) {
  return labelPoint(r.pts);
}

// Planar graph of the walls of a level.
export function wallGraph(walls) {
  const nodes = [];
  const nodeAt = (x, y) => {
    for (const n of nodes) if (Math.abs(n.x - x) <= Q && Math.abs(n.y - y) <= Q) return n;
    const n = { id: nodes.length, x, y, edges: [] };
    nodes.push(n);
    return n;
  };
  // Split points along each wall (ends, crossings, T contacts).
  const cuts = walls.map((w) => [{ t: 0, x: w.x1, y: w.y1 }, { t: 1, x: w.x2, y: w.y2 }]);
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i];
    for (let j = i + 1; j < walls.length; j++) {
      const b = walls[j];
      const x = segIntersect(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2);
      if (x) { cuts[i].push({ t: x.t, x: x.x, y: x.y }); cuts[j].push({ t: x.u, x: x.x, y: x.y }); continue; }
      // Near-misses: an end lying on the other wall within tolerance.
      for (const [w, k, o] of [[a, i, b], [b, j, a]]) {
        for (const [ex, ey] of [[o.x1, o.y1], [o.x2, o.y2]]) {
          const c = closestOnSegment(ex, ey, w.x1, w.y1, w.x2, w.y2);
          if (c.d <= Q * 2 && c.t > 0 && c.t < 1) cuts[k].push({ t: c.t, x: ex, y: ey });
        }
      }
    }
  }
  const edges = [];
  walls.forEach((w, i) => {
    const list = cuts[i].sort((a, b) => a.t - b.t);
    for (let k = 0; k + 1 < list.length; k++) {
      const A = nodeAt(list[k].x, list[k].y);
      const B = nodeAt(list[k + 1].x, list[k + 1].y);
      if (A === B) continue;
      if (A.edges.some((e) => e.to === B)) continue;
      const e1 = { from: A, to: B, wall: w, ang: Math.atan2(B.y - A.y, B.x - A.x) };
      const e2 = { from: B, to: A, wall: w, ang: Math.atan2(A.y - B.y, A.x - B.x) };
      e1.twin = e2;
      e2.twin = e1;
      A.edges.push(e1);
      B.edges.push(e2);
      edges.push(e1, e2);
    }
  });
  for (const n of nodes) n.edges.sort((a, b) => a.ang - b.ang);
  return { nodes, edges };
}

// All faces of the wall graph: [{pts, walls, area}] (signed area; the
// unbounded outer face of each component comes out with the opposite sign).
export function graphFaces(walls) {
  const { edges } = wallGraph(walls);
  const used = new Set();
  const faces = [];
  for (const start of edges) {
    if (used.has(start)) continue;
    const pts = [];
    const ws = [];
    let e = start;
    let guard = 0;
    while (e && !used.has(e) && guard++ < 10000) {
      used.add(e);
      pts.push([e.from.x, e.from.y]);
      ws.push(e.wall);
      // Next edge: at e.to, the edge just before the twin in angular order
      // (turn as far right as possible in maths axes).
      const list = e.to.edges;
      const i = list.indexOf(e.twin);
      e = list[(i - 1 + list.length) % list.length];
    }
    if (pts.length >= 3) faces.push({ pts, walls: ws, area: polygonArea(pts) });
  }
  return faces;
}

// Enclosed spaces: bounded faces, inset to the inner wall faces.
export function detectRooms(walls, { minArea = 0.5e6 } = {}) {
  const faces = graphFaces(walls);
  // Bounded faces have positive signed area with this walk (outer: negative).
  const rooms = [];
  for (const f of faces) {
    if (f.area <= 0) continue;
    const inner = offsetPolygon(f.pts, f.walls.map((w) => w.thickness / 2));
    const a = Math.abs(polygonArea(inner));
    if (a < minArea) continue;
    rooms.push({ pts: cleanup(inner), centre: f.pts, area: a });
  }
  return rooms;
}

// Outer outline of each building block (outside wall faces).
export function buildingOutlines(walls) {
  const faces = graphFaces(walls);
  const out = [];
  for (const f of faces) {
    if (f.area >= 0) continue;
    // Negative inset = grow outwards to the outside faces.
    const outer = offsetPolygon(f.pts, f.walls.map((w) => -w.thickness / 2));
    out.push(cleanup(outer));
  }
  return out.filter((p) => Math.abs(polygonArea(p)) > 1e6);
}

// The room polygon around a point (for click-to-create), or null.
export function roomAtPoint(walls, x, y) {
  const found = detectRooms(walls, { minArea: 0.05e6 }).filter((r) => pointInPolygon(x, y, r.centre));
  found.sort((a, b) => a.area - b.area);
  return found[0] || null;
}

// Drop repeated and collinear vertices.
export function cleanup(pts) {
  let out = pts.filter((p, i) => dist(...p, ...pts[(i + 1) % pts.length]) > 0.5);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-3 * dist(...a, ...b) * dist(...b, ...c) + 1e-9) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

// Suggested room names by size, in creation order.
export function suggestRoomName(area, index, t = (s) => s) {
  const m2 = area / 1e6;
  if (m2 < 3) return t("Storage");
  if (m2 < 6) return t("Bathroom");
  if (m2 < 9) return t("Room");
  if (m2 < 16) return index === 0 ? t("Bedroom") : t("Room");
  return t("Living room");
}
