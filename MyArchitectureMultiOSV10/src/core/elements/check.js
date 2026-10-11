// Model-check rules of the BIM elements (runCheck in check.js calls them).
// `add(severity, code, key, vars, x, y, ids, level)` as in check.js; the keys
// are English templates translated by the UI.

import { pointInPolygon, polygonArea, labelPoint, segIntersect } from "../geom.js";
import { rampModel, beamLength, stairLayout, stairRise, shaftsAt } from "./geometry.js";

export const ELEMENT_CHECKS = [
  ["slab-overlap", "Overlapping floor slabs"],
  ["slab-hole", "Slab openings outside their slab"],
  ["beam-short", "Very short beams"],
  ["railing-low", "Railings lower than 900 mm"],
  ["ramp-steep", "Ramps steeper than 1:12"],
  ["stair-riser", "Stairs by type with risers over 200 mm"],
  ["shaft-empty", "Shafts that cut nothing"],
];

const overlap = (a, b) => {
  for (const [x, y] of a) if (pointInPolygon(x, y, b)) return true;
  for (const [x, y] of b) if (pointInPolygon(x, y, a)) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i], q = a[(i + 1) % a.length], r = b[j], s = b[(j + 1) % b.length];
    if (segIntersect(p[0], p[1], q[0], q[1], r[0], r[1], s[0], s[1])) return true;
  }
  return false;
};

// Shrink a polygon a little towards its centroid (touching edges are no overlap).
const shrink = (pts, k = 0.995) => { const [cx, cy] = labelPoint(pts); return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); };

export function checkElements(p, add) {
  for (const lv of p.levels) {
    const slabs = (p.slabs || []).filter((s) => s.level === lv.id);
    for (let i = 0; i < slabs.length; i++) {
      for (let j = i + 1; j < slabs.length; j++) {
        const a = slabs[i], b = slabs[j];
        if (Math.abs((a.offset || 0) - (b.offset || 0)) > Math.max(a.thickness, b.thickness)) continue; // stacked: a raised floor over a slab
        if (overlap(shrink(a.pts), shrink(b.pts))) { const [x, y] = labelPoint(b.pts); add("warning", "slab-overlap", "Two floor slabs overlap on this level.", {}, x, y, [a.id, b.id], lv.id); }
      }
      for (const h of slabs[i].holes || []) if (!h.every(([x, y]) => pointInPolygon(x, y, slabs[i].pts))) { const [x, y] = labelPoint(h); add("warning", "slab-hole", "A slab opening lies outside its slab.", {}, x, y, [slabs[i].id], lv.id); }
    }
    for (const b of (p.beams || []).filter((x) => x.level === lv.id)) {
      const L = beamLength(p, b);
      if (L < Math.max(300, 1.5 * b.h)) add("warning", "beam-short", "Beam is only {len} mm long.", { len: Math.round(L) }, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, [b.id], lv.id);
    }
    for (const r of (p.railings || []).filter((x) => x.level === lv.id)) {
      if (r.height < 900) add("warning", "railing-low", "Railing is only {h} mm high (guards need 900 mm or more).", { h: Math.round(r.height) }, r.pts[0][0], r.pts[0][1], [r.id], lv.id);
    }
    for (const r of (p.ramps || []).filter((x) => x.level === lv.id)) {
      const m = rampModel(p, r);
      if (m.slope > 1 / 12 + 1e-4) add("warning", "ramp-steep", "Ramp slope is 1:{k} (accessible ramps are 1:12 or flatter).", { k: (1 / m.slope).toFixed(1) }, r.pts[0][0], r.pts[0][1], [r.id], lv.id);
    }
    for (const s of p.stairs.filter((x) => x.level === lv.id && x.shape)) {
      const lay = stairLayout(s, stairRise(p, s));
      if (lay.riser > 200) add("warning", "stair-riser", "Stair risers are {r} mm (over 200 mm): add steps.", { r: Math.round(lay.riser) }, s.x, s.y, [s.id], lv.id);
    }
  }
  for (const s of p.shafts || []) {
    const [x, y] = labelPoint(s.pts);
    const levels = p.levels.filter((l) => shaftsAt(p, l.id).includes(s)).map((l) => l.id);
    const hits = [...(p.slabs || []), ...(p.ceilings || []), ...p.roofs].some((el) => levels.includes(el.level) && overlap(s.pts, el.pts));
    if (!hits && Math.abs(polygonArea(s.pts)) > 0) add("warning", "shaft-empty", "This shaft does not cut any slab, ceiling or roof.", {}, x, y, [s.id], s.level);
  }
}
