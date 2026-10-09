// Board geometry and copper connectivity shared by the PCB editor, DRC,
// autorouter, fabrication exporters and the 3D viewer.

import { getFootprint } from "../lib/footprints.js";
import { xform, rotatePoint, segSegDist, segPadDist, pointSegDist, padPadDist, pointInPolygon, polygonBounds, uid, round } from "../core/geom.js";
import { copperLayers } from "../core/project.js";

export function flipLayer(layer) {
  if (layer.startsWith("F.")) return "B." + layer.slice(2);
  if (layer.startsWith("B.")) return "F." + layer.slice(2);
  return layer;
}

// Transform for a placed footprint: back-side parts are mirrored (x -> -x).
export function fpTransform(fp) {
  return { x: fp.x, y: fp.y, rot: fp.rot || 0, mirror: fp.side === "B" };
}

// Pads of a placed footprint in board space.
// Each: {fpId, ref, num, net, shape, x, y, w, h, rot, drill, npth, layers:[copper layer names], smd, side}
export function footprintPads(fp, pcb) {
  const def = getFootprint(fp.footprint);
  if (!def) return [];
  const t = fpTransform(fp);
  const copper = copperLayers(pcb);
  const sideCu = fp.side === "B" ? "B.Cu" : "F.Cu";
  return def.pads.map((p, index) => {
    const [x, y] = xform(p.x, p.y, t);
    const localRot = p.rot || 0;
    const rot = ((t.mirror ? -localRot : localRot) + t.rot) % 360;
    const tht = p.layers === "*";
    // "B" pads sit on the far side of the footprint (edge-mount connectors).
    const far = p.layers === "B";
    return {
      fpId: fp.id, ref: fp.ref, index, num: p.num,
      net: p.npth ? "" : (fp.padNets && fp.padNets[p.num]) || "",
      shape: p.shape, x: round(x, 5), y: round(y, 5), w: p.w, h: p.h, rot,
      drill: p.drill || 0, npth: !!p.npth,
      layers: tht ? (p.npth ? [] : [...copper]) : [far ? (sideCu === "F.Cu" ? "B.Cu" : "F.Cu") : sideCu],
      smd: !tht, side: fp.side,
    };
  });
}

export function allPads(pcb) {
  return pcb.footprints.flatMap((fp) => footprintPads(fp, pcb));
}

// Silk/fab graphics of a placed footprint in board space, on the right side.
export function footprintGraphics(fp) {
  const def = getFootprint(fp.footprint);
  if (!def) return [];
  const t = fpTransform(fp);
  const layer = fp.side === "B" ? "B.SilkS" : "F.SilkS";
  const out = [];
  for (const s of def.silk || []) {
    if (s.t === "line") {
      const [x1, y1] = xform(s.x1, s.y1, t);
      const [x2, y2] = xform(s.x2, s.y2, t);
      out.push({ layer, kind: "line", x1, y1, x2, y2, w: s.w || 0.12 });
    } else if (s.t === "rect") {
      const c = [[s.x1, s.y1], [s.x2, s.y1], [s.x2, s.y2], [s.x1, s.y2]].map(([x, y]) => xform(x, y, t));
      for (let i = 0; i < 4; i++) out.push({ layer, kind: "line", x1: c[i][0], y1: c[i][1], x2: c[(i + 1) % 4][0], y2: c[(i + 1) % 4][1], w: s.w || 0.12 });
    } else if (s.t === "circle") {
      const [cx, cy] = xform(s.cx, s.cy, t);
      out.push({ layer, kind: "circle", cx, cy, r: s.r, w: s.w || 0.12 });
    } else if (s.t === "arc") {
      // Arcs are flattened so every consumer only needs lines and circles.
      const steps = Math.max(6, Math.round(Math.abs(s.a2 - s.a1) / 15));
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const a = ((s.a1 + ((s.a2 - s.a1) * i) / steps) * Math.PI) / 180;
        const p = xform(s.cx + s.r * Math.cos(a), s.cy - s.r * Math.sin(a), t);
        if (prev) out.push({ layer, kind: "line", x1: prev[0], y1: prev[1], x2: p[0], y2: p[1], w: s.w || 0.12 });
        prev = p;
      }
    }
  }
  return out;
}

// Reference designator text position (board space).
export function footprintRefPos(fp) {
  const def = getFootprint(fp.footprint);
  if (fp.refPos) return { x: fp.x + fp.refPos.x, y: fp.y + fp.refPos.y };
  const c = def ? def.courtyard : { x1: -1, y1: -1, x2: 1, y2: 1 };
  const [x, y] = xform((c.x1 + c.x2) / 2, c.y1 - 0.8, fpTransform(fp));
  return { x, y };
}

// Courtyard rectangle as a polygon in board space.
export function footprintCourtyard(fp) {
  const def = getFootprint(fp.footprint);
  const c = def ? def.courtyard : { x1: -1, y1: -1, x2: 1, y2: 1 };
  const t = fpTransform(fp);
  return [[c.x1, c.y1], [c.x2, c.y1], [c.x2, c.y2], [c.x1, c.y2]].map(([x, y]) => xform(x, y, t));
}

export function footprintBounds(fp) {
  return polygonBounds(footprintCourtyard(fp));
}

export function boardBounds(pcb) {
  return polygonBounds(pcb.outline);
}

export function boardNets(pcb) {
  const set = new Set();
  for (const fp of pcb.footprints) for (const n of Object.values(fp.padNets || {})) if (n) set.add(n);
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function netClassFor(rules, net) {
  for (const nc of rules.netClasses || []) if ((nc.nets || []).includes(net)) return nc;
  return null;
}

export function trackWidthFor(rules, net) {
  const nc = netClassFor(rules, net);
  return (nc && nc.trackWidth) || rules.trackWidth;
}

export function clearanceFor(rules, netA, netB) {
  const a = netClassFor(rules, netA);
  const b = netClassFor(rules, netB);
  return Math.max(rules.clearance, (a && a.clearance) || 0, (b && b.clearance) || 0);
}

// ---------------------------------------------------------------- copper items
// Flatten copper into uniform items: {kind, id, net, layers, ...geometry}.
export function copperItems(pcb) {
  const copper = copperLayers(pcb);
  const items = [];
  for (const pad of allPads(pcb)) if (!pad.npth) items.push({ kind: "pad", id: `${pad.fpId}#${pad.index}`, net: pad.net, layers: pad.layers, pad, x: pad.x, y: pad.y });
  for (const t of pcb.tracks) items.push({ kind: "track", id: t.id, net: t.net || "", layers: [t.layer], t });
  for (const v of pcb.vias) items.push({ kind: "via", id: v.id, net: v.net || "", layers: [...copper], v, x: v.x, y: v.y });
  for (const z of pcb.zones) items.push({ kind: "zone", id: z.id, net: z.net || "", layers: [z.layer], z });
  return items;
}

function viaPad(v) {
  return { shape: "circle", x: v.x, y: v.y, w: v.d, h: v.d, rot: 0 };
}

// Copper-to-copper edge distance between two items that share a layer.
export function itemDistance(a, b) {
  const A = a.kind;
  const B = b.kind;
  if (A === "zone" || B === "zone") {
    const z = A === "zone" ? a : b;
    const o = A === "zone" ? b : a;
    return zoneItemDistance(z.z, o);
  }
  if (A === "track" && B === "track") {
    return segSegDist(a.t.x1, a.t.y1, a.t.x2, a.t.y2, b.t.x1, b.t.y1, b.t.x2, b.t.y2) - a.t.w / 2 - b.t.w / 2;
  }
  if (A === "track" || B === "track") {
    const t = A === "track" ? a.t : b.t;
    const o = A === "track" ? b : a;
    const pad = o.kind === "pad" ? o.pad : viaPad(o.v);
    return segPadDist(t.x1, t.y1, t.x2, t.y2, pad) - t.w / 2;
  }
  const pa = A === "pad" ? a.pad : viaPad(a.v);
  const pb = B === "pad" ? b.pad : viaPad(b.v);
  if (pa.shape === "circle" && pb.shape === "circle") return Math.hypot(pa.x - pb.x, pa.y - pb.y) - pa.w / 2 - pb.w / 2;
  return padPadDist(pa, pb);
}

function zoneItemDistance(z, o) {
  // Is the item's anchor inside the zone outline? Then it touches the fill.
  const pts = z.pts;
  const anchors = o.kind === "track" ? [[o.t.x1, o.t.y1], [o.t.x2, o.t.y2]] : o.kind === "zone" ? o.z.pts : [[o.x, o.y]];
  for (const [x, y] of anchors) if (pointInPolygon(x, y, pts)) return 0;
  return Infinity;
}

// Bounding box of an item (for quick rejection).
export function itemBounds(it) {
  if (it.kind === "track") {
    const h = it.t.w / 2;
    return { x1: Math.min(it.t.x1, it.t.x2) - h, y1: Math.min(it.t.y1, it.t.y2) - h, x2: Math.max(it.t.x1, it.t.x2) + h, y2: Math.max(it.t.y1, it.t.y2) + h };
  }
  if (it.kind === "via") return { x1: it.v.x - it.v.d / 2, y1: it.v.y - it.v.d / 2, x2: it.v.x + it.v.d / 2, y2: it.v.y + it.v.d / 2 };
  if (it.kind === "pad") {
    const r = Math.hypot(it.pad.w, it.pad.h) / 2;
    return { x1: it.pad.x - r, y1: it.pad.y - r, x2: it.pad.x + r, y2: it.pad.y + r };
  }
  return polygonBounds(it.z.pts);
}

function sharesLayer(a, b) {
  return a.layers.some((l) => b.layers.includes(l));
}

// Union-find over copper that physically touches. Returns {items, groupOf(itemIndex)}.
export function copperConnectivity(pcb, items = copperItems(pcb)) {
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const bounds = items.map(itemBounds);
  // Broad phase: a uniform grid, so only items sharing a cell are compared
  // (the editor recomputes this after every edit). Zones are big, so they are
  // checked against everything in their cells like any other item.
  const CELL = 2;
  const grid = new Map();
  bounds.forEach((b, i) => {
    const x1 = Math.floor(b.x1 / CELL), x2 = Math.floor(b.x2 / CELL), y1 = Math.floor(b.y1 / CELL), y2 = Math.floor(b.y2 / CELL);
    for (let cx = x1; cx <= x2; cx++) {
      for (let cy = y1; cy <= y2; cy++) {
        const k = cx * 100003 + cy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });
  const seen = new Set();
  const pairs = [];
  for (const list of grid.values()) {
    for (let p = 0; p < list.length; p++) {
      for (let q = p + 1; q < list.length; q++) {
        const i = Math.min(list[p], list[q]);
        const j = Math.max(list[p], list[q]);
        const k = i * items.length + j;
        if (seen.has(k)) continue;
        seen.add(k);
        pairs.push([i, j]);
      }
    }
  }
  for (const [i, j] of pairs) {
    {
      const a = items[i];
      const b = items[j];
      if (!sharesLayer(a, b)) continue;
      // Zones only join copper of their own net (fills keep clear of others).
      if ((a.kind === "zone" || b.kind === "zone") && a.net !== b.net) continue;
      const ba = bounds[i];
      const bb = bounds[j];
      if (ba.x1 > bb.x2 + 0.01 || bb.x1 > ba.x2 + 0.01 || ba.y1 > bb.y2 + 0.01 || bb.y1 > ba.y2 + 0.01) continue;
      if (itemDistance(a, b) <= 1e-3) {
        const ra = find(i);
        const rb = find(j);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }
  return { items, find };
}

// Anchor points of an item for ratsnest lines.
function anchors(it) {
  if (it.kind === "track") return [[it.t.x1, it.t.y1], [it.t.x2, it.t.y2]];
  if (it.kind === "zone") return [];
  return [[it.x, it.y]];
}

// Ratsnest: per net, the minimum spanning set of airwires joining the
// separately connected copper islands. Returns [{net, x1,y1,x2,y2}].
export function ratsnest(pcb, conn = copperConnectivity(pcb)) {
  const { items, find } = conn;
  const byNet = new Map();
  items.forEach((it, i) => {
    if (!it.net) return;
    if (!byNet.has(it.net)) byNet.set(it.net, []);
    byNet.get(it.net).push(i);
  });
  const lines = [];
  for (const [net, idxs] of byNet) {
    // Only nets with at least two pads need connecting.
    if (idxs.filter((i) => items[i].kind === "pad").length < 2) continue;
    const clusters = new Map();
    for (const i of idxs) {
      const r = find(i);
      if (!clusters.has(r)) clusters.set(r, []);
      for (const a of anchors(items[i])) clusters.get(r).push(a);
    }
    const list = [...clusters.values()].filter((c) => c.length);
    if (list.length < 2) continue;
    // Prim's algorithm over clusters with closest-anchor distance.
    const inTree = [0];
    const rest = new Set(list.map((_, i) => i).slice(1));
    while (rest.size) {
      let best = null;
      for (const a of inTree) {
        for (const b of rest) {
          for (const pa of list[a]) {
            for (const pb of list[b]) {
              const d = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2;
              if (!best || d < best.d) best = { d, b, pa, pb };
            }
          }
        }
      }
      lines.push({ net, x1: best.pa[0], y1: best.pa[1], x2: best.pb[0], y2: best.pb[1] });
      inTree.push(best.b);
      rest.delete(best.b);
    }
  }
  return lines;
}

// ---------------------------------------------------------------- schematic -> board
// Bring the board in line with the schematic. New parts are dropped in a
// neat grid beside the board outline. Returns a summary of what changed.
export function updateBoardFromSchematic(pcb, boardNet, { removeExtra = true, updateTrackNets = true } = {}) {
  const summary = { added: [], updated: [], removed: [], missingFootprint: [] };
  const byPart = new Map(pcb.footprints.map((f) => [f.partId, f]));
  const byRef = new Map(pcb.footprints.map((f) => [f.ref, f]));
  const keep = new Set();
  const b = boardBounds(pcb);
  let cursorX = b.x2 + 5;
  let cursorY = b.y1;
  let rowH = 0;
  const oldPadNet = new Map();
  for (const fp of pcb.footprints) for (const [num, net] of Object.entries(fp.padNets || {})) oldPadNet.set(`${fp.id}:${num}`, net);
  for (const part of boardNet.parts) {
    if (part.dnp) continue;
    if (!part.footprint || !getFootprint(part.footprint)) { summary.missingFootprint.push(part.ref); continue; }
    let fp = byPart.get(part.partId) || byRef.get(part.ref);
    if (fp) {
      const changed = fp.ref !== part.ref || fp.value !== part.value || fp.footprint !== part.footprint || JSON.stringify(fp.padNets) !== JSON.stringify(part.padNets);
      fp.partId = part.partId;
      fp.ref = part.ref;
      fp.value = part.value;
      fp.footprint = part.footprint;
      fp.padNets = { ...part.padNets };
      if (changed) summary.updated.push(part.ref);
    } else {
      const def = getFootprint(part.footprint);
      const c = def.courtyard;
      const w = c.x2 - c.x1;
      const h = c.y2 - c.y1;
      if (cursorY + h > b.y1 + Math.max(40, b.y2 - b.y1)) { cursorY = b.y1; cursorX += rowH + 2; rowH = 0; }
      fp = {
        id: uid("f"), partId: part.partId, ref: part.ref, value: part.value, footprint: part.footprint,
        x: round(cursorX - c.x1, 3), y: round(cursorY - c.y1, 3), rot: 0, side: "F", padNets: { ...part.padNets }, locked: false,
      };
      cursorY += h + 2;
      rowH = Math.max(rowH, w);
      pcb.footprints.push(fp);
      summary.added.push(part.ref);
    }
    keep.add(fp.id);
  }
  if (removeExtra) {
    const before = pcb.footprints.length;
    const removed = pcb.footprints.filter((f) => !keep.has(f.id) && f.partId);
    pcb.footprints = pcb.footprints.filter((f) => keep.has(f.id) || !f.partId);
    summary.removed = removed.map((f) => f.ref);
    void before;
  }
  // Renamed nets: carry the new name onto tracks/vias/zones that used the old one.
  if (updateTrackNets) {
    const rename = new Map();
    for (const fp of pcb.footprints) {
      for (const [num, net] of Object.entries(fp.padNets || {})) {
        const old = oldPadNet.get(`${fp.id}:${num}`);
        if (old && old !== net) rename.set(old, net);
      }
    }
    if (rename.size) {
      for (const t of pcb.tracks) if (rename.has(t.net)) t.net = rename.get(t.net);
      for (const v of pcb.vias) if (rename.has(v.net)) v.net = rename.get(v.net);
      for (const z of pcb.zones) if (rename.has(z.net)) z.net = rename.get(z.net);
    }
  }
  return summary;
}

// Which net is at a board point on a layer (pads, then tracks, then vias)?
export function netAtPoint(pcb, x, y, layer, tolerance = 0.05) {
  for (const pad of allPads(pcb)) {
    if (layer && !pad.layers.includes(layer)) continue;
    const [lx, ly] = rotatePoint(x - pad.x, y - pad.y, -(pad.rot || 0));
    if (Math.abs(lx) <= pad.w / 2 + tolerance && Math.abs(ly) <= pad.h / 2 + tolerance) return { net: pad.net, kind: "pad", pad };
  }
  for (const v of pcb.vias) if (Math.hypot(x - v.x, y - v.y) <= v.d / 2 + tolerance) return { net: v.net, kind: "via", via: v };
  for (const t of pcb.tracks) {
    if (layer && t.layer !== layer) continue;
    if (pointSegDist(x, y, t.x1, t.y1, t.x2, t.y2) <= t.w / 2 + tolerance) return { net: t.net, kind: "track", track: t };
  }
  return null;
}

// Unrouted connection count — "N of M connections routed".
export function routingStats(pcb) {
  const conn = copperConnectivity(pcb);
  const rats = ratsnest(pcb, conn);
  let total = 0;
  const byNet = new Map();
  for (const it of conn.items) if (it.kind === "pad" && it.net) byNet.set(it.net, (byNet.get(it.net) || 0) + 1);
  for (const n of byNet.values()) total += Math.max(0, n - 1);
  return { total, unrouted: rats.length, routed: Math.max(0, total - rats.length), rats };
}
