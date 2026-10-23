// Design rule check for the board.
//
// runDRC(project, {skip}) -> [{severity, code, message, x, y, layer?, ids}]
//
// Codes: clearance, short, no_net, zone_overlap, track_width, via_drill,
// pad_drill, annular_ring, hole_to_hole, edge_clearance, footprint_outside,
// courtyard_overlap, unconnected, dangling, silk_over_pad, missing_footprint,
// outline.
//
// Pairwise copper checks use a uniform-grid spatial hash over itemBounds so a
// board with a few thousand items stays interactive.

import { getFootprint } from "../lib/footprints.js";
import {
  segSegDist, pointSegDist, closestOnSeg, segPadDist, padPolygon, pointInPolygon,
  pointPolygonEdgeDist, polygonArea, polygonBounds, segmentsIntersect, rectsOverlap, round,
} from "../core/geom.js";
import { defaultRules } from "../core/project.js";
import {
  copperItems, itemDistance, itemBounds, ratsnest, footprintPads,
  footprintCourtyard, footprintGraphics, clearanceFor,
} from "./board.js";

const MIN_ANNULAR = 0.13;
const SILK_PAD_GAP = 0.1;
const EPS = 1e-6;

// ---------------------------------------------------------------- spatial hash
export class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iy) {
    return (ix + 100000) * 200003 + (iy + 100000);
  }
  insert(idx, b) {
    const c = this.cell;
    const x1 = Math.floor(b.x1 / c), x2 = Math.floor(b.x2 / c);
    const y1 = Math.floor(b.y1 / c), y2 = Math.floor(b.y2 / c);
    for (let ix = x1; ix <= x2; ix++) {
      for (let iy = y1; iy <= y2; iy++) {
        const k = this.key(ix, iy);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(idx);
      }
    }
  }
  // Calls fn(idx) for every candidate; an index may be reported more than once.
  query(b, fn) {
    const c = this.cell;
    const x1 = Math.floor(b.x1 / c), x2 = Math.floor(b.x2 / c);
    const y1 = Math.floor(b.y1 / c), y2 = Math.floor(b.y2 / c);
    for (let ix = x1; ix <= x2; ix++) {
      for (let iy = y1; iy <= y2; iy++) {
        const list = this.map.get(this.key(ix, iy));
        if (list) for (const i of list) fn(i);
      }
    }
  }
}

function grow(b, d) {
  return { x1: b.x1 - d, y1: b.y1 - d, x2: b.x2 + d, y2: b.y2 + d };
}

function pickCell(boundsList) {
  if (!boundsList.length) return 2;
  let area = 0;
  for (const b of boundsList) {
    area += Math.max(0.01, (b.x2 - b.x1) * (b.y2 - b.y1));

  }
  // Roughly a few items per cell; clamp so long tracks don't explode the map.
  const avg = Math.sqrt(area / boundsList.length);
  return Math.min(5, Math.max(0.5, avg * 2));
}

// ---------------------------------------------------------------- helpers
function itemCenter(it) {
  if (it.kind === "track") return [(it.t.x1 + it.t.x2) / 2, (it.t.y1 + it.t.y2) / 2];
  if (it.kind === "zone") { const b = polygonBounds(it.z.pts); return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2]; }
  return [it.x, it.y];
}

// The point of `it`'s copper nearest to (px, py) — for marker placement.
function nearestPoint(it, px, py) {
  if (it.kind === "track") { const c = closestOnSeg(px, py, it.t.x1, it.t.y1, it.t.x2, it.t.y2); return [c.x, c.y]; }
  if (it.kind === "via") {
    const dx = px - it.x, dy = py - it.y, l = Math.hypot(dx, dy);
    const r = it.v.d / 2;
    return l <= r ? [px, py] : [it.x + (dx / l) * r, it.y + (dy / l) * r];
  }
  if (it.kind === "pad") {
    const poly = it.poly || (it.poly = padPolygon(it.pad));
    if (pointInPolygon(px, py, poly)) return [px, py];
    let best = null, bd = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const c = closestOnSeg(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < bd) { bd = d; best = [c.x, c.y]; }
    }
    return best;
  }
  return itemCenter(it);
}

function pairLocation(a, b) {
  const [bx, by] = itemCenter(b);
  let pa = nearestPoint(a, bx, by);
  const pb = nearestPoint(b, pa[0], pa[1]);
  pa = nearestPoint(a, pb[0], pb[1]);
  return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
}

function objId(it) {
  return it.kind === "pad" ? it.pad.fpId : it.id;
}

function itemLabel(it) {
  if (it.kind === "pad") return `pad ${it.pad.ref}.${it.pad.num}`;
  return it.kind;
}

function netLabel(n) {
  return n || "(no net)";
}

function polyEdges(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], b: { x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) } });
  }
  return out;
}

function segIntersection(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
  const den = (a2x - a1x) * (b2y - b1y) - (a2y - a1y) * (b2x - b1x);
  if (Math.abs(den) < 1e-12) return [(a1x + a2x) / 2, (a1y + a2y) / 2];
  const t = ((b1x - a1x) * (b2y - b1y) - (b1y - a1y) * (b2x - b1x)) / den;
  return [a1x + t * (a2x - a1x), a1y + t * (a2y - a1y)];
}

// Shrink a polygon a hair towards its centroid so touching edges don't count.
function shrink(pts, f = 0.999) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);
}

// Returns a point inside the overlap of two simple polygons, or null.
export function polygonsOverlap(pa, pb) {
  for (let i = 0; i < pa.length; i++) {
    const a1 = pa[i], a2 = pa[(i + 1) % pa.length];
    for (let k = 0; k < pb.length; k++) {
      const b1 = pb[k], b2 = pb[(k + 1) % pb.length];
      if (segmentsIntersect(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1], b2[0], b2[1])) {
        return segIntersection(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1], b2[0], b2[1]);
      }
    }
  }
  if (pointInPolygon(pa[0][0], pa[0][1], pb)) return pa[0];
  if (pointInPolygon(pb[0][0], pb[0][1], pa)) return pb[0];
  return null;
}

// A closed outline needs >= 3 finite points, non-zero area and no self-crossings.
export function outlineProblem(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return "Board outline needs at least 3 points";
  for (const p of pts) if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return "Board outline has an invalid point";
  if (Math.abs(polygonArea(pts)) < 1e-6) return "Board outline has zero area";
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a1 = pts[i], a2 = pts[(i + 1) % n];
    for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1) continue; // adjacent through the closing edge
      const b1 = pts[k], b2 = pts[(k + 1) % n];
      if (segmentsIntersect(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1], b2[0], b2[1])) return "Board outline crosses itself";
    }
  }
  return null;
}

// Distance from a point to the copper of an item on its layer(s).
function pointItemDist(px, py, it) {
  if (it.kind === "track") return pointSegDist(px, py, it.t.x1, it.t.y1, it.t.x2, it.t.y2) - it.t.w / 2;
  if (it.kind === "via") return Math.hypot(px - it.v.x, py - it.v.y) - it.v.d / 2;
  if (it.kind === "pad") {
    const poly = it.poly || (it.poly = padPolygon(it.pad));
    return pointInPolygon(px, py, poly) ? 0 : pointPolygonEdgeDist(px, py, poly);
  }
  return pointInPolygon(px, py, it.z.pts) ? 0 : Infinity;
}

// Same result as board.copperConnectivity() but driven by the spatial hash
// instead of an all-pairs loop. copperItems() lists zones last, so the first
// `nCopper` items are exactly the hashed ones.
function fastConnectivity(items, nCopper, bounds, hash) {
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };
  const touch = (a, b) => a.layers.some((l) => b.layers.includes(l)) && itemDistance(a, b) <= 1e-3;
  const seen = new Int32Array(nCopper).fill(-1);
  for (let i = 0; i < nCopper; i++) {
    const gb = grow(bounds[i], 0.01);
    hash.query(gb, (j) => {
      if (j <= i || seen[j] === i) return;
      seen[j] = i;
      if (find(i) === find(j)) return;
      if (rectsOverlap(gb, bounds[j]) && touch(items[i], items[j])) join(i, j);
    });
  }
  for (let z = nCopper; z < items.length; z++) {
    for (let j = 0; j < items.length; j++) {
      if (j === z || items[j].net !== items[z].net) continue;
      if (j >= nCopper && j < z) continue; // zone pairs: visit once
      if (touch(items[z], items[j])) join(z, j);
    }
  }
  return { items, find };
}

// ---------------------------------------------------------------- main
export function runDRC(project, opts = {}) {
  const pcb = project.pcb;
  const rules = { ...defaultRules(), ...(pcb.rules || {}) };
  const skip = new Set(opts.skip || []);
  const issues = [];
  const on = (code) => !skip.has(code);
  const add = (severity, code, message, x, y, ids = [], extra = {}) => {
    if (skip.has(code)) return;
    issues.push({ severity, code, message, x: round(x, 4), y: round(y, 4), ...extra, ids: [...new Set(ids)] });
  };

  // --- footprint definitions
  for (const fp of pcb.footprints) {
    if (!getFootprint(fp.footprint)) add("error", "missing_footprint", `${fp.ref || "?"}: footprint "${fp.footprint}" not found in the library`, fp.x, fp.y, [fp.id]);
  }

  // --- outline
  const outline = pcb.outline;
  const outlineErr = outlineProblem(outline);
  if (outlineErr) {
    const p = Array.isArray(outline) && outline[0] && Number.isFinite(outline[0][0]) ? outline[0] : [0, 0];
    add("error", "outline", outlineErr, p[0], p[1], [], { layer: "Edge.Cuts" });
  }
  const outlineOk = !outlineErr;

  const items = copperItems(pcb);
  const copper = items.filter((it) => it.kind !== "zone");
  const zones = items.filter((it) => it.kind === "zone");
  const bounds = copper.map(itemBounds);

  // --- footprints vs board / each other
  const fpPoly = new Map(pcb.footprints.map((fp) => [fp.id, footprintCourtyard(fp)]));
  const fpOutside = new Set(); // footprints entirely off the board: their pads are not re-reported
  if (outlineOk) {
    const edges = polyEdges(outline);
    for (const fp of pcb.footprints) {
      const poly = fpPoly.get(fp.id);
      const insideCount = poly.filter(([x, y]) => pointInPolygon(x, y, outline)).length;
      let crosses = false;
      for (let i = 0; i < 4 && !crosses; i++) {
        const a = poly[i], b = poly[(i + 1) % 4];
        for (const e of edges) if (segmentsIntersect(a[0], a[1], b[0], b[1], e.x1, e.y1, e.x2, e.y2)) { crosses = true; break; }
      }
      if (insideCount < 4 || crosses) {
        if (insideCount === 0 && !crosses) fpOutside.add(fp.id);
        add("error", "footprint_outside", `${fp.ref}: footprint is ${insideCount === 0 && !crosses ? "outside" : "not fully inside"} the board outline`, fp.x, fp.y, [fp.id]);
      }
    }
  }
  if (on("courtyard_overlap")) {
    const fps = pcb.footprints;
    const shr = fps.map((fp) => shrink(fpPoly.get(fp.id)));
    const fb = shr.map(polygonBounds);
    for (let i = 0; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        if (fps[i].side !== fps[j].side || !rectsOverlap(fb[i], fb[j])) continue;
        const p = polygonsOverlap(shr[i], shr[j]);
        if (p) add("warning", "courtyard_overlap", `Courtyards of ${fps[i].ref} and ${fps[j].ref} overlap`, p[0], p[1], [fps[i].id, fps[j].id], { layer: fps[i].side === "B" ? "B.CrtYd" : "F.CrtYd" });
      }
    }
  }

  // --- widths, drills, annular rings
  for (const t of pcb.tracks) {
    if (t.w < rules.minTrackWidth - EPS) add("error", "track_width", `Track width ${t.w} mm < minimum ${rules.minTrackWidth} mm`, (t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2, [t.id], { layer: t.layer });
  }
  for (const v of pcb.vias) {
    if (v.drill < rules.minDrill - EPS) add("error", "via_drill", `Via drill ${v.drill} mm < minimum ${rules.minDrill} mm`, v.x, v.y, [v.id]);
    const ring = (v.d - v.drill) / 2;
    if (ring < MIN_ANNULAR - EPS) add("error", "annular_ring", `Via annular ring ${round(ring, 3)} mm < ${MIN_ANNULAR} mm`, v.x, v.y, [v.id]);
  }
  const pads = pcb.footprints.flatMap((fp) => footprintPads(fp, pcb));
  for (const p of pads) {
    if (p.drill > 0 && p.drill < rules.minDrill - EPS) add("warning", "pad_drill", `Pad ${p.ref}.${p.num} drill ${p.drill} mm < minimum ${rules.minDrill} mm`, p.x, p.y, [p.fpId]);
    if (p.drill > 0 && !p.npth) {
      const ring = (Math.min(p.w, p.h) - p.drill) / 2;
      if (ring < MIN_ANNULAR - EPS) add("error", "annular_ring", `Pad ${p.ref}.${p.num} annular ring ${round(ring, 3)} mm < ${MIN_ANNULAR} mm`, p.x, p.y, [p.fpId]);
    }
  }

  // --- hole to hole (sweep over x)
  if (on("hole_to_hole")) {
    const holes = [];
    for (const p of pads) if (p.drill > 0) holes.push({ x: p.x, y: p.y, r: p.drill / 2, id: p.fpId, label: `${p.ref}.${p.num}` });
    for (const v of pcb.vias) holes.push({ x: v.x, y: v.y, r: v.drill / 2, id: v.id, label: "via" });
    holes.sort((a, b) => a.x - b.x);
    const maxR = holes.reduce((m, h) => Math.max(m, h.r), 0);
    for (let i = 0; i < holes.length; i++) {
      const a = holes[i];
      for (let j = i + 1; j < holes.length; j++) {
        const b = holes[j];
        if (b.x - a.x > a.r + maxR + rules.holeToHole) break;
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
        if (gap < rules.holeToHole - EPS) {
          add("error", "hole_to_hole", `Hole spacing ${round(Math.max(0, gap), 3)} mm < ${rules.holeToHole} mm (${a.label} / ${b.label})`, (a.x + b.x) / 2, (a.y + b.y) / 2, [a.id, b.id]);
        }
      }
    }
  }

  // --- copper clearance and shorts
  let maxClear = rules.clearance;
  for (const nc of rules.netClasses || []) maxClear = Math.max(maxClear, nc.clearance || 0);
  const hash = new SpatialHash(pickCell(bounds));
  bounds.forEach((b, i) => hash.insert(i, b));
  if (on("clearance") || on("short") || on("no_net")) {
    const seen = new Int32Array(copper.length).fill(-1);
    for (let i = 0; i < copper.length; i++) {
      const a = copper[i];
      const ba = grow(bounds[i], maxClear);
      hash.query(ba, (j) => {
        if (j <= i || seen[j] === i) return;
        seen[j] = i;
        const b = copper[j];
        if (!rectsOverlap(ba, bounds[j])) return;
        const layer = a.layers.find((l) => b.layers.includes(l));
        if (!layer) return;
        const na = a.net, nb = b.net;
        if (na === nb) {
          if (na) return;
          // Unnetted copper: loose track/via pieces are assumed to be one wire,
          // but separate unconnected pads must still keep apart.
          if (a.kind !== "pad" || b.kind !== "pad") return;
          if (a.pad.fpId === b.pad.fpId && a.pad.num === b.pad.num) return;
        }
        // Pads of one footprint that share a number are joined by definition.
        if (a.kind === "pad" && b.kind === "pad" && a.pad.fpId === b.pad.fpId && a.pad.num === b.pad.num && a.pad.num !== "") return;
        const req = clearanceFor(rules, na, nb);
        const d = itemDistance(a, b);
        if (d >= req - EPS) return;
        const [x, y] = pairLocation(a, b);
        const ids = [objId(a), objId(b)];
        if (!na !== !nb) {
          const free = na ? b : a;
          if (free.kind !== "pad" && d <= 0) {
            const other = na ? a : b;
            add("warning", "no_net", `Unnetted ${free.kind} touches ${itemLabel(other)} of net ${other.net}`, x, y, ids, { layer });
            return;
          }
        }
        if (d <= 0) {
          add("error", "short", `Short between ${netLabel(na)} and ${netLabel(nb)} (${itemLabel(a)} / ${itemLabel(b)})`, x, y, ids, { layer });
        } else {
          add("error", "clearance", `Clearance ${round(d, 3)} mm < ${req} mm between ${netLabel(na)} and ${netLabel(nb)} (${itemLabel(a)} / ${itemLabel(b)})`, x, y, ids, { layer });
        }
      });
    }
  }

  // --- zone outlines of different nets with equal priority must not overlap
  if (on("zone_overlap")) {
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i].z, b = zones[j].z;
        if (a.layer !== b.layer || (a.net || "") === (b.net || "") || (a.priority || 0) !== (b.priority || 0)) continue;
        if (!a.pts || !b.pts || a.pts.length < 3 || b.pts.length < 3) continue;
        if (!rectsOverlap(polygonBounds(a.pts), polygonBounds(b.pts))) continue;
        const p = polygonsOverlap(shrink(a.pts), shrink(b.pts));
        if (p) add("error", "zone_overlap", `Zones ${netLabel(a.net)} and ${netLabel(b.net)} overlap on ${a.layer} with equal priority`, p[0], p[1], [a.id, b.id], { layer: a.layer });
      }
    }
  }

  // --- board edge clearance
  if (outlineOk && on("edge_clearance")) {
    const edges = polyEdges(outline);
    const ob = polygonBounds(outline);
    const ec = rules.edgeClearance;
    for (let i = 0; i < copper.length; i++) {
      const it = copper[i];
      if (it.kind === "pad" && fpOutside.has(it.pad.fpId)) continue;
      const b = bounds[i];
      const anchors = it.kind === "track" ? [[it.t.x1, it.t.y1], [it.t.x2, it.t.y2]] : [[it.x, it.y]];
      const layer = it.layers[0];
      const outside = !rectsOverlap(b, ob) || anchors.some(([x, y]) => !pointInPolygon(x, y, outline));
      if (outside) {
        const [x, y] = itemCenter(it);
        add("error", "edge_clearance", `${itemLabel(it)} is outside the board outline`, x, y, [objId(it)], { layer });
        continue;
      }
      const gb = grow(b, ec);
      let best = Infinity, bestEdge = null;
      for (const e of edges) {
        if (!rectsOverlap(gb, e.b)) continue;
        let d;
        if (it.kind === "track") d = segSegDist(it.t.x1, it.t.y1, it.t.x2, it.t.y2, e.x1, e.y1, e.x2, e.y2) - it.t.w / 2;
        else if (it.kind === "via") d = pointSegDist(it.x, it.y, e.x1, e.y1, e.x2, e.y2) - it.v.d / 2;
        else d = segPadDist(e.x1, e.y1, e.x2, e.y2, it.pad);
        if (d < best) { best = d; bestEdge = e; }
      }
      if (best < ec - EPS) {
        const [cx, cy] = itemCenter(it);
        const c0 = closestOnSeg(cx, cy, bestEdge.x1, bestEdge.y1, bestEdge.x2, bestEdge.y2);
        const p = nearestPoint(it, c0.x, c0.y);
        const c = closestOnSeg(p[0], p[1], bestEdge.x1, bestEdge.y1, bestEdge.x2, bestEdge.y2);
        add("error", "edge_clearance", `${itemLabel(it)} is ${round(Math.max(0, best), 3)} mm from the board edge (< ${ec} mm)`, (p[0] + c.x) / 2, (p[1] + c.y) / 2, [objId(it)], { layer });
      }
    }
  }

  // --- dangling track ends
  if (on("dangling")) {
    for (let i = 0; i < copper.length; i++) {
      const it = copper[i];
      if (it.kind !== "track") continue;
      const t = it.t;
      for (const [px, py] of [[t.x1, t.y1], [t.x2, t.y2]]) {
        const tol = t.w / 2 + 1e-3;
        const qb = { x1: px - tol, y1: py - tol, x2: px + tol, y2: py + tol };
        let joined = false;
        hash.query(qb, (j) => {
          if (joined || j === i) return;
          const o = copper[j];
          if (!o.layers.includes(t.layer)) return;
          if (t.net && o.net !== t.net) return;
          if (pointItemDist(px, py, o) <= tol) joined = true;
        });
        if (!joined && t.net) {
          for (const z of zones) if (z.z.layer === t.layer && z.net === t.net && pointInPolygon(px, py, z.z.pts)) { joined = true; break; }
        }
        if (!joined) add("warning", "dangling", `Dangling track end (${netLabel(t.net)})`, px, py, [t.id], { layer: t.layer });
      }
    }
  }

  // --- silkscreen over exposed pads
  if (on("silk_over_pad")) {
    const silk = [];
    for (const fp of pcb.footprints) for (const g of footprintGraphics(fp)) silk.push({ ...g, owner: fp.id });
    for (const g of pcb.graphics || []) {
      if (g.layer !== "F.SilkS" && g.layer !== "B.SilkS") continue;
      if (g.kind === "rect") {
        const c = [[g.x1, g.y1], [g.x2, g.y1], [g.x2, g.y2], [g.x1, g.y2]];
        for (let k = 0; k < 4; k++) silk.push({ layer: g.layer, kind: "line", x1: c[k][0], y1: c[k][1], x2: c[(k + 1) % 4][0], y2: c[(k + 1) % 4][1], w: g.w || 0.12, owner: g.id });
      } else silk.push({ ...g, w: g.w || 0.12, owner: g.id });
    }
    const exposed = pads.filter((p) => !p.npth).map((p) => ({ pad: p, poly: padPolygon(p), b: itemBounds({ kind: "pad", pad: p }) }));
    const ph = new SpatialHash(pickCell(exposed.map((e) => e.b)));
    exposed.forEach((e, i) => ph.insert(i, e.b));
    const warned = new Set();
    for (const g of silk) {
      const side = g.layer === "B.SilkS" ? "B.Cu" : "F.Cu";
      const reach = g.w / 2 + SILK_PAD_GAP;
      const gb = g.kind === "circle"
        ? { x1: g.cx - g.r - reach, y1: g.cy - g.r - reach, x2: g.cx + g.r + reach, y2: g.cy + g.r + reach }
        : { x1: Math.min(g.x1, g.x2) - reach, y1: Math.min(g.y1, g.y2) - reach, x2: Math.max(g.x1, g.x2) + reach, y2: Math.max(g.y1, g.y2) + reach };
      ph.query(gb, (k) => {
        const e = exposed[k];
        const key = `${e.pad.fpId}#${e.pad.index}`;
        if (warned.has(key) || !e.pad.layers.includes(side) || !rectsOverlap(gb, e.b)) return;
        let d;
        if (g.kind === "circle") {
          const inside = pointInPolygon(g.cx, g.cy, e.poly);
          const dmin = inside ? 0 : pointPolygonEdgeDist(g.cx, g.cy, e.poly);
          let dmax = 0;
          for (const [x, y] of e.poly) dmax = Math.max(dmax, Math.hypot(x - g.cx, y - g.cy));
          d = g.r >= dmin && g.r <= dmax ? 0 : Math.min(Math.abs(g.r - dmin), Math.abs(g.r - dmax));
        } else {
          d = segPadDist(g.x1, g.y1, g.x2, g.y2, e.pad);
        }
        d -= g.w / 2;
        if (d < SILK_PAD_GAP - EPS) {
          warned.add(key);
          add("warning", "silk_over_pad", `Silkscreen over pad ${e.pad.ref}.${e.pad.num}`, e.pad.x, e.pad.y, [e.pad.fpId, g.owner], { layer: g.layer });
        }
      });
    }
  }

  // --- unconnected (ratsnest)
  if (on("unconnected")) {
    const rats = ratsnest(pcb, fastConnectivity(items, copper.length, bounds, hash));
    // Ratsnest endpoints are item anchors, so an exact-coordinate index finds them.
    const anchorKey = (net, x, y) => `${net}|${round(x, 5)}|${round(y, 5)}`;
    const byAnchor = new Map();
    for (const it of copper) {
      if (!it.net) continue;
      const pts = it.kind === "track" ? [[it.t.x1, it.t.y1], [it.t.x2, it.t.y2]] : [[it.x, it.y]];
      for (const [x, y] of pts) {
        const k = anchorKey(it.net, x, y);
        if (!byAnchor.has(k)) byAnchor.set(k, []);
        byAnchor.get(k).push(objId(it));
      }
    }
    const idsAt = (net, x, y) => byAnchor.get(anchorKey(net, x, y)) || [];
    for (const r of rats) {
      add("error", "unconnected", `Unconnected net ${r.net}`, (r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2,
        [...idsAt(r.net, r.x1, r.y1), ...idsAt(r.net, r.x2, r.y2)], { net: r.net, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 });
    }
  }

  // Errors first; Array.prototype.sort is stable so check order is kept.
  issues.sort((a, b) => (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1));
  return issues;
}
