// Model check: the architectural counterpart of ERC/DRC. A pure function of
// the project returning [{severity, code, key, vars, x, y, ids, level}], where
// `key` is the English message template (translated by the UI with t(key, vars)).

import { wallLength, wallHeight, openingTags, levelAbove } from "./project.js";
import { wallFrame, wallPoint, openingSpans, wallOutlines } from "./walls.js";
import { roomArea } from "./rooms.js";
import { furnitureCorners, furnitureDef } from "../lib/furniture.js";
import { pointInPolygon, polygonCentroid, pointSegDist, segIntersect } from "./geom.js";

export const CHECKS = [
  ["wall-short", "Walls shorter than their thickness"],
  ["wall-duplicate", "Overlapping walls"],
  ["opening-outside", "Openings past the end of their wall"],
  ["opening-overlap", "Overlapping openings"],
  ["opening-tall", "Openings taller than the wall"],
  ["door-blocked", "Door swing blocked by furniture"],
  ["furniture-wall", "Furniture inside a wall"],
  ["room-small", "Very small rooms"],
  ["room-overlap", "Overlapping rooms"],
  ["room-no-door", "Rooms without a door or opening"],
  ["stair-top", "Stairs on the top level"],
  ["clash-furniture", "Clash: furniture with furniture"],
  ["clash-stair", "Clash: stair with a wall"],
  ["clash-column", "Clash: column in a door or window"],
];

const SEATS = new Set(["chair", "barStool", "officeChair", "studentChair"]);

function polysOverlap(a, b) {
  for (const [x, y] of a) if (pointInPolygon(x, y, b)) return true;
  for (const [x, y] of b) if (pointInPolygon(x, y, a)) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j], s = b[(j + 1) % b.length];
      if (segIntersect(p[0], p[1], q[0], q[1], r[0], r[1], s[0], s[1])) return true;
    }
  }
  return false;
}

export function runCheck(p) {
  const issues = [];
  const add = (severity, code, key, vars, x, y, ids, level) => issues.push({ severity, code, key, vars, message: key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ""), x, y, ids, level });
  const tags = openingTags(p);
  const pt = (o) => { const w = p.walls.find((x) => x.id === o.wall); return w ? wallPoint(w, o.at) : [0, 0]; };

  for (const lv of p.levels) {
    const walls = p.walls.filter((w) => w.level === lv.id);
    const outlines = wallOutlines(walls);
    // ---- walls
    for (const w of walls) {
      const L = wallLength(w);
      if (L < Math.max(50, w.thickness * 0.75)) add("warning", "wall-short", "Wall is only {len} mm long.", { len: Math.round(L) }, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, [w.id], lv.id);
    }
    for (let i = 0; i < walls.length; i++) {
      const a = walls[i];
      const fa = wallFrame(a);
      for (let j = i + 1; j < walls.length; j++) {
        const b = walls[j];
        const fb = wallFrame(b);
        if (Math.abs(fa.d[0] * fb.d[1] - fa.d[1] * fb.d[0]) > 1e-3) continue;
        // Collinear and overlapping by more than a thickness.
        if (pointSegDist(b.x1, b.y1, a.x1 - fa.d[0] * 1e5, a.y1 - fa.d[1] * 1e5, a.x2 + fa.d[0] * 1e5, a.y2 + fa.d[1] * 1e5) > 5) continue;
        const u = (x, y) => (x - a.x1) * fa.d[0] + (y - a.y1) * fa.d[1];
        const b1 = Math.min(u(b.x1, b.y1), u(b.x2, b.y2)), b2 = Math.max(u(b.x1, b.y1), u(b.x2, b.y2));
        const ov = Math.min(fa.len, b2) - Math.max(0, b1);
        if (ov > Math.max(a.thickness, 50)) {
          const m = Math.max(0, b1) + ov / 2;
          add("error", "wall-duplicate", "Two walls overlap for {len} mm.", { len: Math.round(ov) }, a.x1 + fa.d[0] * m, a.y1 + fa.d[1] * m, [a.id, b.id], lv.id);
        }
      }
    }
    // ---- openings
    for (const w of walls) {
      const L = wallLength(w);
      const H = wallHeight(p, w);
      const list = p.openings.filter((o) => o.wall === w.id).sort((a, b) => a.at - b.at);
      for (const o of list) {
        const [x, y] = pt(o);
        if (o.at - o.width / 2 < -1 || o.at + o.width / 2 > L + 1) add("error", "opening-outside", "{tag} runs past the end of its wall.", { tag: tags.get(o.id) }, x, y, [o.id], lv.id);
        if (o.sill + o.height > H + 1) add("error", "opening-tall", "{tag} is taller than the wall ({h} mm > {wh} mm).", { tag: tags.get(o.id), h: Math.round(o.sill + o.height), wh: Math.round(H) }, x, y, [o.id], lv.id);
      }
      for (let i = 0; i + 1 < list.length; i++) {
        const a = list[i], b = list[i + 1];
        if (a.at + a.width / 2 > b.at - b.width / 2 + 1) {
          const [x, y] = wallPoint(w, (a.at + b.at) / 2);
          add("error", "opening-overlap", "{a} and {b} overlap.", { a: tags.get(a.id), b: tags.get(b.id) }, x, y, [a.id, b.id], lv.id);
        }
      }
    }
    // ---- furniture against walls and door swings
    const furn = p.furniture.filter((f) => f.level === lv.id && (f.elevation || 0) < 2000);
    for (const f of furn) {
      // Wall lights are meant to sit on a wall (ceiling lamps, at 2 m and
      // above, are not checked at all).
      if (f.kind === "rug" || (furnitureDef(f.kind) || {}).mount === "wall") continue;
      const fc = furnitureCorners(f);
      for (const w of walls) {
        const o = outlines.get(w.id);
        if (!o) continue;
        // Shrink the test a little so furniture touching a wall face is fine.
        const inner = fc.map(([x, y]) => [f.x + (x - f.x) * 0.96, f.y + (y - f.y) * 0.96]);
        if (polysOverlap(inner, o.poly) && !openingSpans(p, w).some((s) => { const uv = (s.u1 + s.u2) / 2; const [mx, my] = wallPoint(w, uv); return Math.hypot(mx - f.x, my - f.y) < s.o.width; })) {
          add("warning", "furniture-wall", "Furniture overlaps a wall.", {}, f.x, f.y, [f.id, w.id], lv.id);
          break;
        }
      }
    }
    for (const w of walls) {
      const fw = wallFrame(w);
      for (const s of openingSpans(p, w)) {
        const o = s.o;
        if (o.kind !== "door" || o.type === "sliding" || o.type === "garage") continue;
        // Swing quarter: the hinge jamb, the leaf length and the side it opens to.
        const hingeU = o.hinge === "end" ? s.u2 : s.u1;
        const [hx, hy] = wallPoint(w, hingeU, (o.side * w.thickness) / 2);
        const leaf = s.u2 - s.u1;
        const dirU = o.hinge === "end" ? -1 : 1;
        const samples = [];
        for (let k = 1; k <= 6; k++) {
          const a = (k / 6) * (Math.PI / 2);
          for (const r of [leaf * 0.5, leaf * 0.95]) {
            const du = Math.cos(a) * r * dirU, dv = Math.sin(a) * r * o.side;
            samples.push([hx + fw.d[0] * du + fw.n[0] * dv, hy + fw.d[1] * du + fw.n[1] * dv]);
          }
        }
        for (const f of furn) {
          if (f.kind === "rug" || f.h < 150) continue;
          const fc = furnitureCorners(f);
          if (samples.some(([x, y]) => pointInPolygon(x, y, fc))) {
            add("warning", "door-blocked", "{tag} cannot open fully: furniture is in its swing.", { tag: tags.get(o.id) }, f.x, f.y, [o.id, f.id], lv.id);
            break;
          }
        }
      }
    }
    // ---- rooms
    const rooms = p.rooms.filter((r) => r.level === lv.id);
    for (const r of rooms) {
      const a = roomArea(r);
      const [cx, cy] = polygonCentroid(r.pts);
      if (a < 1.5e6) add("warning", "room-small", "Room \"{name}\" is only {a} m².", { name: r.name || "—", a: (a / 1e6).toFixed(2) }, cx, cy, [r.id], lv.id);
    }
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const shrink = (pts) => { const [cx, cy] = polygonCentroid(pts); return pts.map(([x, y]) => [cx + (x - cx) * 0.98, cy + (y - cy) * 0.98]); };
        if (polysOverlap(shrink(a.pts), shrink(b.pts))) {
          const [cx, cy] = polygonCentroid(b.pts);
          add("warning", "room-overlap", "Rooms \"{a}\" and \"{b}\" overlap.", { a: a.name || "—", b: b.name || "—" }, cx, cy, [a.id, b.id], lv.id);
        }
      }
    }
    if (walls.length) {
      const doors = p.openings.filter((o) => o.kind !== "window" && walls.some((w) => w.id === o.wall)).map((o) => {
        const w = walls.find((x) => x.id === o.wall);
        return { p: wallPoint(w, o.at), reach: w.thickness / 2 + 80 };
      });
      for (const r of rooms) {
        const near = doors.some(({ p: [x, y], reach }) => {
          for (let i = 0; i < r.pts.length; i++) {
            const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length];
            if (pointSegDist(x, y, a[0], a[1], b[0], b[1]) <= reach) return true;
          }
          return false;
        });
        const stairIn = p.stairs.some((s) => s.level === lv.id && pointInPolygon(s.x, s.y, r.pts));
        if (!near && !stairIn) {
          const [cx, cy] = polygonCentroid(r.pts);
          add("warning", "room-no-door", "Room \"{name}\" has no door or opening.", { name: r.name || "—" }, cx, cy, [r.id], lv.id);
        }
      }
    }
    // ---- clash detection (BIM coordination)
    const solidFurn = furn.filter((f) => f.kind !== "rug" && f.h >= 150);
    for (let i = 0; i < solidFurn.length; i++) {
      for (let j = i + 1; j < solidFurn.length; j++) {
        const a = solidFurn[i], b = solidFurn[j];
        // Seats tucked under tables and desks are intended.
        if (SEATS.has(a.kind) || SEATS.has(b.kind)) continue;
        const za = [a.elevation || 0, (a.elevation || 0) + a.h], zb = [b.elevation || 0, (b.elevation || 0) + b.h];
        if (za[1] <= zb[0] || zb[1] <= za[0]) continue;
        const shrink = (f) => furnitureCorners({ ...f, w: f.w * 0.92, d: f.d * 0.92 });
        if (polysOverlap(shrink(a), shrink(b))) add("warning", "clash-furniture", "Clash: two pieces of furniture overlap.", {}, (a.x + b.x) / 2, (a.y + b.y) / 2, [a.id, b.id], lv.id);
      }
    }
    for (const s of p.stairs.filter((x) => x.level === lv.id)) {
      const L = s.length * 0.96, W = s.width * 0.96;
      const c = Math.cos(((s.rot || 0) * Math.PI) / 180), sn = Math.sin(((s.rot || 0) * Math.PI) / 180);
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [s.x + (u * L) / 2 * c - (v * W) / 2 * sn, s.y + (u * L) / 2 * sn + (v * W) / 2 * c]);
      for (const w of walls) {
        const o = outlines.get(w.id);
        if (o && polysOverlap(pts, o.poly)) { add("error", "clash-stair", "Clash: a stair runs into a wall.", {}, s.x, s.y, [s.id, w.id], lv.id); break; }
      }
    }
    for (const col of p.columns.filter((x) => x.level === lv.id)) {
      const cp = furnitureCorners({ ...col, w: col.w * 0.9, d: col.d * 0.9 });
      for (const w of walls) {
        for (const s of openingSpans(p, w)) {
          const t = w.thickness / 2;
          const box = [wallPoint(w, s.u1, -t), wallPoint(w, s.u2, -t), wallPoint(w, s.u2, t), wallPoint(w, s.u1, t)];
          if (polysOverlap(cp, box)) add("error", "clash-column", "Clash: a column blocks {tag}.", { tag: tags.get(s.o.id) }, col.x, col.y, [col.id, s.o.id], lv.id);
        }
      }
    }
    // ---- stairs
    if (!levelAbove(p, lv.id)) {
      for (const s of p.stairs.filter((x) => x.level === lv.id)) add("warning", "stair-top", "A stair on the top level leads nowhere.", {}, s.x, s.y, [s.id], lv.id);
    }
  }
  return issues;
}
