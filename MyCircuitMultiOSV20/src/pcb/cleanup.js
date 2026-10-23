// Track clean-up and per-net length report.
//
// cleanupTracks(project) -> {removed, merged}   (mutates project.pcb)
// lengthReport(project)  -> [{net, length, segments, vias}]

import { copperLayers } from "../core/project.js";
import { allPads } from "./board.js";
import { pointSegDist, pointInPolygon, round } from "../core/geom.js";

const TOL = 1e-6;

const same = (ax, ay, bx, by) => Math.abs(ax - bx) < TOL && Math.abs(ay - by) < TOL;

function padContains(pad, x, y) {
  // Rotated-rectangle test is enough to decide "this endpoint sits on a pad".
  const r = ((pad.rot || 0) * Math.PI) / 180;
  const dx = x - pad.x, dy = y - pad.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= pad.w / 2 + TOL && Math.abs(ly) <= pad.h / 2 + TOL;
}

export function cleanupTracks(project) {
  const pcb = project.pcb;
  let removed = 0;
  let merged = 0;

  // 1. zero-length segments
  const before = pcb.tracks.length;
  pcb.tracks = pcb.tracks.filter((t) => !same(t.x1, t.y1, t.x2, t.y2));
  removed += before - pcb.tracks.length;

  // 2. exact duplicates (either direction)
  const keys = new Set();
  pcb.tracks = pcb.tracks.filter((t) => {
    const a = `${round(t.x1, 5)},${round(t.y1, 5)}`;
    const b = `${round(t.x2, 5)},${round(t.y2, 5)}`;
    const k = `${t.layer}|${t.net || ""}|${t.w}|${a < b ? a + "|" + b : b + "|" + a}`;
    if (keys.has(k)) { removed++; return false; }
    keys.add(k);
    return true;
  });

  // 3. merge collinear touching segments. Only merge through a point that
  // nothing else uses (no third track end, via or pad) so junctions survive.
  const pads = allPads(pcb);
  const usedElsewhere = (x, y, layer, a, b) => {
    for (const t of pcb.tracks) {
      if (t === a || t === b || t.layer !== layer) continue;
      if (same(t.x1, t.y1, x, y) || same(t.x2, t.y2, x, y)) return true;
      // A T-junction landing on the mid-point keeps it too.
      if (pointSegDist(x, y, t.x1, t.y1, t.x2, t.y2) < TOL) return true;
    }
    for (const v of pcb.vias) if (Math.hypot(v.x - x, v.y - y) <= v.d / 2) return true;
    for (const p of pads) if (p.layers.includes(layer) && padContains(p, x, y)) return true;
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const byEnd = new Map();
    const key = (t, x, y) => `${t.layer}|${round(x, 5)},${round(y, 5)}`;
    for (const t of pcb.tracks) {
      for (const [x, y] of [[t.x1, t.y1], [t.x2, t.y2]]) {
        const k = key(t, x, y);
        if (!byEnd.has(k)) byEnd.set(k, []);
        byEnd.get(k).push(t);
      }
    }
    for (const [, list] of byEnd) {
      if (list.length !== 2) continue;
      const [a, b] = list;
      if (a === b || (a.net || "") !== (b.net || "") || a.w !== b.w || a.layer !== b.layer) continue;
      // Shared point and the two far ends.
      let px, py, ax, ay, bx, by;
      if (same(a.x2, a.y2, b.x1, b.y1)) { px = a.x2; py = a.y2; ax = a.x1; ay = a.y1; bx = b.x2; by = b.y2; }
      else if (same(a.x2, a.y2, b.x2, b.y2)) { px = a.x2; py = a.y2; ax = a.x1; ay = a.y1; bx = b.x1; by = b.y1; }
      else if (same(a.x1, a.y1, b.x1, b.y1)) { px = a.x1; py = a.y1; ax = a.x2; ay = a.y2; bx = b.x2; by = b.y2; }
      else if (same(a.x1, a.y1, b.x2, b.y2)) { px = a.x1; py = a.y1; ax = a.x2; ay = a.y2; bx = b.x1; by = b.y1; }
      else continue;
      const ux = px - ax, uy = py - ay, vx = bx - px, vy = by - py;
      const cross = ux * vy - uy * vx;
      if (Math.abs(cross) > 1e-6 * Math.hypot(ux, uy) * Math.hypot(vx, vy) || ux * vx + uy * vy <= 0) continue;
      if (usedElsewhere(px, py, a.layer, a, b)) continue;
      a.x1 = ax; a.y1 = ay; a.x2 = bx; a.y2 = by;
      pcb.tracks = pcb.tracks.filter((t) => t !== b);
      merged++;
      changed = true;
      break; // the end index is stale now; rebuild it
    }
  }

  // 4. vias that join fewer than two copper layers do nothing.
  const copper = copperLayers(pcb);
  pcb.vias = pcb.vias.filter((v) => {
    const layers = new Set();
    const r = v.d / 2;
    for (const t of pcb.tracks) {
      if (layers.has(t.layer)) continue;
      if (pointSegDist(v.x, v.y, t.x1, t.y1, t.x2, t.y2) <= r + t.w / 2 - TOL && (!t.net || !v.net || t.net === v.net)) layers.add(t.layer);
    }
    for (const p of pads) {
      if (p.npth || (v.net && p.net && p.net !== v.net)) continue;
      if (Math.hypot(p.x - v.x, p.y - v.y) > r + Math.hypot(p.w, p.h) / 2) continue;
      if (padContains(p, v.x, v.y)) for (const l of p.layers) layers.add(l);
    }
    for (const z of pcb.zones) {
      if (v.net && z.net === v.net && copper.includes(z.layer) && pointInPolygon(v.x, v.y, z.pts)) layers.add(z.layer);
    }
    if (layers.size >= 2) return true;
    removed++;
    return false;
  });

  return { removed, merged };
}

export function lengthReport(project) {
  const pcb = project.pcb;
  const by = new Map();
  const get = (net) => {
    if (!by.has(net)) by.set(net, { net, length: 0, segments: 0, vias: 0 });
    return by.get(net);
  };
  for (const t of pcb.tracks) {
    if (!t.net) continue;
    const r = get(t.net);
    r.length += Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
    r.segments++;
  }
  for (const v of pcb.vias) if (v.net) get(v.net).vias++;
  return [...by.values()]
    .map((r) => ({ ...r, length: round(r.length, 3) }))
    .sort((a, b) => a.net.localeCompare(b.net, undefined, { numeric: true }));
}
