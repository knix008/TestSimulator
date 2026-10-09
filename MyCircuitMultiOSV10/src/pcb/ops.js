// Pure PCB edit operations used by the editor (and tests).

import { footprintPads, footprintCourtyard, footprintBounds, allPads, copperItems, itemDistance, clearanceFor, trackWidthFor, netClassFor, boardBounds } from "./board.js";
import { pointSegDist, pointInPolygon, pointPolygonEdgeDist, rotatePoint, uid, round, polygonBounds, DEG } from "../core/geom.js";
import { copperLayers } from "../core/project.js";

export const PCB_KINDS = ["footprints", "tracks", "vias", "zones", "texts", "graphics", "dimensions"];

export function findPcb(pcb, id) {
  if (id === "outline") return { kind: "outline", obj: pcb.outline };
  for (const k of PCB_KINDS) {
    const o = pcb[k].find((x) => x.id === id);
    if (o) return { kind: k, obj: o };
  }
  return null;
}

// Topmost item under a point. Active layer items win over others.
export function hitTestPcb(pcb, x, y, tol, { activeLayer = "F.Cu", visible = {} } = {}) {
  const vis = (l) => visible[l] !== false;
  const hits = [];
  for (const v of pcb.vias) if (Math.hypot(x - v.x, y - v.y) <= v.d / 2 + tol) hits.push({ kind: "vias", obj: v, pri: 5 });
  for (const t of pcb.tracks) {
    if (!vis(t.layer)) continue;
    if (pointSegDist(x, y, t.x1, t.y1, t.x2, t.y2) <= t.w / 2 + tol) hits.push({ kind: "tracks", obj: t, pri: t.layer === activeLayer ? 4 : 2 });
  }
  for (const tx of pcb.texts) {
    if (!vis(tx.layer)) continue;
    const w = String(tx.text).length * (tx.size || 1.5) * 0.9;
    const [lx, ly] = rotatePoint(x - tx.x, y - tx.y, -(tx.rot || 0));
    if (Math.abs(lx) <= w / 2 + tol && Math.abs(ly) <= (tx.size || 1.5) * 0.7 + tol) hits.push({ kind: "texts", obj: tx, pri: 4 });
  }
  for (const d of pcb.dimensions) if (pointSegDist(x, y, d.x1, d.y1, d.x2, d.y2) <= tol * 2 + 0.5) hits.push({ kind: "dimensions", obj: d, pri: 3 });
  for (const g of pcb.graphics) {
    if (!vis(g.layer)) continue;
    let d = Infinity;
    if (g.kind === "line") d = pointSegDist(x, y, g.x1, g.y1, g.x2, g.y2);
    else if (g.kind === "circle") d = Math.abs(Math.hypot(x - g.cx, y - g.cy) - g.r);
    else if (g.kind === "rect") {
      const xs = [g.x1, g.x2], ys = [g.y1, g.y2];
      d = Math.min(pointSegDist(x, y, xs[0], ys[0], xs[1], ys[0]), pointSegDist(x, y, xs[1], ys[0], xs[1], ys[1]), pointSegDist(x, y, xs[1], ys[1], xs[0], ys[1]), pointSegDist(x, y, xs[0], ys[1], xs[0], ys[0]));
    }
    if (d <= (g.w || 0.15) / 2 + tol) hits.push({ kind: "graphics", obj: g, pri: 3 });
  }
  for (const fp of pcb.footprints) {
    const pads = footprintPads(fp, pcb);
    const onPad = pads.find((p) => Math.abs(x - p.x) <= p.w / 2 + tol && Math.abs(y - p.y) <= p.h / 2 + tol);
    const court = footprintCourtyard(fp);
    if (onPad || pointInPolygon(x, y, court)) {
      const sideActive = (fp.side === "B") === activeLayer.startsWith("B");
      hits.push({ kind: "footprints", obj: fp, pri: sideActive ? 3.5 : 1.5, pad: onPad || null });
    }
  }
  for (const z of pcb.zones) {
    if (!vis(z.layer)) continue;
    const edge = pointPolygonEdgeDist(x, y, z.pts);
    if (edge <= tol * 2) hits.push({ kind: "zones", obj: z, pri: 2.5 });
    else if (pointInPolygon(x, y, z.pts)) hits.push({ kind: "zones", obj: z, pri: 0.5 });
  }
  if (pointPolygonEdgeDist(x, y, pcb.outline) <= tol * 2) hits.push({ kind: "outline", obj: pcb.outline, pri: 1 });
  hits.sort((a, b) => b.pri - a.pri);
  return hits[0] || null;
}

export function itemBoundsPcb(pcb, kind, o) {
  if (kind === "footprints") return footprintBounds(o);
  if (kind === "tracks" || kind === "dimensions" || (kind === "graphics" && o.kind !== "circle")) return { x1: Math.min(o.x1, o.x2), y1: Math.min(o.y1, o.y2), x2: Math.max(o.x1, o.x2), y2: Math.max(o.y1, o.y2) };
  if (kind === "graphics") return { x1: o.cx - o.r, y1: o.cy - o.r, x2: o.cx + o.r, y2: o.cy + o.r };
  if (kind === "vias") return { x1: o.x - o.d / 2, y1: o.y - o.d / 2, x2: o.x + o.d / 2, y2: o.y + o.d / 2 };
  if (kind === "zones") return polygonBounds(o.pts);
  return { x1: o.x - 1, y1: o.y - 1, x2: o.x + 1, y2: o.y + 1 };
}

export function itemsInRectPcb(pcb, r, crossing = false, visible = {}) {
  const out = [];
  for (const k of PCB_KINDS) {
    for (const o of pcb[k]) {
      if (o.layer && visible[o.layer] === false) continue;
      const b = itemBoundsPcb(pcb, k, o);
      const hit = crossing ? !(b.x2 < r.x1 || b.x1 > r.x2 || b.y2 < r.y1 || b.y1 > r.y2) : b.x1 >= r.x1 && b.x2 <= r.x2 && b.y1 >= r.y1 && b.y2 <= r.y2;
      if (hit && !(k === "footprints" && o.locked && !crossing)) out.push(o.id);
    }
  }
  return out;
}

export function pcbContentBounds(pcb) {
  let b = boardBounds(pcb);
  for (const fp of pcb.footprints) {
    const f = footprintBounds(fp);
    b = { x1: Math.min(b.x1, f.x1), y1: Math.min(b.y1, f.y1), x2: Math.max(b.x2, f.x2), y2: Math.max(b.y2, f.y2) };
  }
  return b;
}

// ---------------------------------------------------------------- moves
export function beginMovePcb(pcb, ids) {
  const set = new Set(ids);
  const orig = new Map();
  for (const k of PCB_KINDS) for (const o of pcb[k]) if (set.has(o.id)) orig.set(o.id, JSON.parse(JSON.stringify(o)));
  if (set.has("outline")) orig.set("outline", pcb.outline.map((p) => p.slice()));
  return { ids: set, orig };
}

export function applyMovePcb(pcb, mv, dx, dy) {
  for (const k of PCB_KINDS) {
    for (const o of pcb[k]) {
      const g = mv.orig.get(o.id);
      if (!g) continue;
      if (k === "footprints" && o.locked) continue;
      if (k === "zones") o.pts = g.pts.map(([x, y]) => [round(x + dx, 4), round(y + dy, 4)]);
      else if (o.x1 !== undefined) { o.x1 = round(g.x1 + dx, 4); o.y1 = round(g.y1 + dy, 4); o.x2 = round(g.x2 + dx, 4); o.y2 = round(g.y2 + dy, 4); }
      else if (k === "graphics" && o.kind === "circle") { o.cx = round(g.cx + dx, 4); o.cy = round(g.cy + dy, 4); }
      else { o.x = round(g.x + dx, 4); o.y = round(g.y + dy, 4); }
    }
  }
  if (mv.orig.has("outline")) pcb.outline = mv.orig.get("outline").map(([x, y]) => [round(x + dx, 4), round(y + dy, 4)]);
}

export function selectionCenterPcb(pcb, ids) {
  let b = null;
  for (const id of ids) {
    const f = findPcb(pcb, id);
    if (!f) continue;
    const r = f.kind === "outline" ? polygonBounds(pcb.outline) : itemBoundsPcb(pcb, f.kind, f.obj);
    b = b ? { x1: Math.min(b.x1, r.x1), y1: Math.min(b.y1, r.y1), x2: Math.max(b.x2, r.x2), y2: Math.max(b.y2, r.y2) } : r;
  }
  if (!b) return { x: 0, y: 0 };
  return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
}

// Rotate a selection by `deg` (CCW on screen). A single footprint turns
// about its own origin, a group about its centre.
export function rotatePcb(pcb, ids, deg = 90) {
  const list = ids.map((id) => findPcb(pcb, id)).filter(Boolean);
  const single = list.length === 1 && list[0].kind === "footprints";
  const c = single ? { x: list[0].obj.x, y: list[0].obj.y } : selectionCenterPcb(pcb, ids);
  const rot = (x, y) => {
    const [rx, ry] = rotatePoint(x - c.x, y - c.y, deg);
    return [round(c.x + rx, 4), round(c.y + ry, 4)];
  };
  for (const { kind, obj: o } of list) {
    if (kind === "footprints") {
      if (o.locked) continue;
      [o.x, o.y] = rot(o.x, o.y);
      o.rot = (((o.rot || 0) + deg) % 360 + 360) % 360;
      if (o.refPos) { const [rx, ry] = rotatePoint(o.refPos.x, o.refPos.y, deg); o.refPos = { x: round(rx, 3), y: round(ry, 3) }; }
    } else if (kind === "zones") o.pts = o.pts.map(([x, y]) => rot(x, y));
    else if (kind === "outline") pcb.outline = pcb.outline.map(([x, y]) => rot(x, y));
    else if (o.x1 !== undefined) { [o.x1, o.y1] = rot(o.x1, o.y1); [o.x2, o.y2] = rot(o.x2, o.y2); }
    else if (kind === "graphics" && o.kind === "circle") [o.cx, o.cy] = rot(o.cx, o.cy);
    else {
      [o.x, o.y] = rot(o.x, o.y);
      if (kind === "texts") o.rot = (((o.rot || 0) + deg) % 360 + 360) % 360;
    }
  }
}

// Flip footprints / texts / tracks to the other side of the board.
export function flipPcb(pcb, ids) {
  const set = new Set(ids);
  const cu = copperLayers(pcb);
  const flipLayerName = (l) => (l.startsWith("F.") ? "B." + l.slice(2) : l.startsWith("B.") ? "F." + l.slice(2) : l);
  const c = selectionCenterPcb(pcb, ids);
  for (const fp of pcb.footprints) {
    if (!set.has(fp.id) || fp.locked) continue;
    fp.side = fp.side === "B" ? "F" : "B";
    // Flipping mirrors left-right, so the rotation direction reverses.
    fp.rot = ((360 - (fp.rot || 0)) % 360);
    if (set.size > 1) fp.x = round(2 * c.x - fp.x, 4);
    if (fp.refPos) fp.refPos = { x: -fp.refPos.x, y: fp.refPos.y };
  }
  for (const t of pcb.tracks) if (set.has(t.id)) { t.layer = cu.includes(flipLayerName(t.layer)) ? flipLayerName(t.layer) : t.layer; }
  for (const t of pcb.texts) if (set.has(t.id)) t.layer = flipLayerName(t.layer);
  for (const g of pcb.graphics) if (set.has(g.id)) g.layer = flipLayerName(g.layer);
  for (const z of pcb.zones) if (set.has(z.id)) z.layer = cu.includes(flipLayerName(z.layer)) ? flipLayerName(z.layer) : z.layer;
}

export function deletePcb(pcb, ids) {
  const set = new Set(ids);
  let n = 0;
  for (const k of PCB_KINDS) {
    const before = pcb[k].length;
    pcb[k] = pcb[k].filter((o) => !set.has(o.id) || (k === "footprints" && o.locked));
    n += before - pcb[k].length;
  }
  return n;
}

// Every track and via touching the given copper (a whole routed connection),
// used by "select connected" / "delete route".
export function connectedCopper(pcb, startIds) {
  const items = copperItems(pcb).filter((i) => i.kind === "track" || i.kind === "via");
  const ids = new Set(startIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const it of items) {
      if (ids.has(it.id)) continue;
      for (const other of items) {
        if (!ids.has(other.id) || !it.layers.some((l) => other.layers.includes(l))) continue;
        if (itemDistance(it, other) <= 1e-3) { ids.add(it.id); grew = true; break; }
      }
    }
  }
  return [...ids];
}

// ---------------------------------------------------------------- routing helpers
// 45° routing: a straight run then a diagonal (or the reverse).
export function route45(ax, ay, bx, by, diagonalFirst = false) {
  const dx = bx - ax;
  const dy = by - ay;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 1e-9 || ady < 1e-9 || Math.abs(adx - ady) < 1e-9) return [[ax, ay], [bx, by]];
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const d = Math.min(adx, ady);
  if (diagonalFirst) {
    const cx = ax + sx * d;
    const cy = ay + sy * d;
    return [[ax, ay], [round(cx, 4), round(cy, 4)], [bx, by]];
  }
  const cx = adx > ady ? bx - sx * d : ax;
  const cy = adx > ady ? ay : by - sy * d;
  return [[ax, ay], [round(cx, 4), round(cy, 4)], [bx, by]];
}

// Smallest clearance margin of a proposed track segment against other-net copper.
// Returns {ok, margin, at:{x,y}} where margin < 0 means a violation.
export function checkSegment(pcb, seg, net, items = copperItems(pcb)) {
  const probe = { kind: "track", id: "_probe", net, layers: [seg.layer], t: seg };
  let worst = { ok: true, margin: Infinity, at: null };
  for (const it of items) {
    if (!it.layers.includes(seg.layer)) continue;
    if (it.kind === "zone") continue;
    if (net && it.net === net) continue;
    if (!net && !it.net) continue;
    const need = clearanceFor(pcb.rules, net, it.net);
    const d = itemDistance(probe, it);
    const margin = d - need;
    if (margin < worst.margin) worst = { ok: margin >= -1e-6, margin, at: { x: it.x ?? (it.t ? (it.t.x1 + it.t.x2) / 2 : 0), y: it.y ?? (it.t ? (it.t.y1 + it.t.y2) / 2 : 0) } };
  }
  // Board edge.
  const edge = Math.min(pointPolygonEdgeDist(seg.x1, seg.y1, pcb.outline), pointPolygonEdgeDist(seg.x2, seg.y2, pcb.outline)) - seg.w / 2 - pcb.rules.edgeClearance;
  if (edge < worst.margin) worst = { ok: edge >= -1e-6, margin: edge, at: { x: seg.x1, y: seg.y1 } };
  return worst;
}

// Snap a point to a nearby pad centre / track end / via (any net, or a given one).
export function snapCopper(pcb, x, y, tol, { net = null, layer = null } = {}) {
  let best = null;
  const consider = (px, py, n, kind, extra) => {
    if (net !== null && n !== net) return;
    const d = Math.hypot(px - x, py - y);
    if (d <= tol && (!best || d < best.d)) best = { x: px, y: py, net: n, kind, d, ...extra };
  };
  for (const pad of allPads(pcb)) {
    if (pad.npth) continue;
    if (layer && !pad.layers.includes(layer)) continue;
    const reach = Math.max(tol, Math.max(pad.w, pad.h) / 2);
    const d = Math.hypot(pad.x - x, pad.y - y);
    if (d <= reach && (net === null || pad.net === net) && (!best || d < best.d)) best = { x: pad.x, y: pad.y, net: pad.net, kind: "pad", d, pad };
  }
  for (const v of pcb.vias) consider(v.x, v.y, v.net, "via", { via: v });
  for (const t of pcb.tracks) {
    if (layer && t.layer !== layer) continue;
    consider(t.x1, t.y1, t.net, "track-end", { track: t });
    consider(t.x2, t.y2, t.net, "track-end", { track: t });
  }
  return best;
}

export function newTrack(net, layer, w, x1, y1, x2, y2) {
  return { id: uid("t"), layer, net: net || "", w, x1: round(x1, 4), y1: round(y1, 4), x2: round(x2, 4), y2: round(y2, 4) };
}

export function newVia(pcb, net, x, y) {
  const nc = netClassFor(pcb.rules, net);
  return { id: uid("v"), x: round(x, 4), y: round(y, 4), d: (nc && nc.viaDiameter) || pcb.rules.viaDiameter, drill: (nc && nc.viaDrill) || pcb.rules.viaDrill, net: net || "" };
}

export { trackWidthFor };

// Rounded-rectangle board outline as a polygon.
export function rectOutline(x, y, w, h, r = 0) {
  if (r <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const rr = Math.min(r, w / 2, h / 2);
  const pts = [];
  const corners = [[x + w - rr, y + rr, -90], [x + w - rr, y + h - rr, 0], [x + rr, y + h - rr, 90], [x + rr, y + rr, 180]];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = (start + (90 * i) / 6) * DEG;
      pts.push([round(cx + rr * Math.cos(a), 4), round(cy + rr * Math.sin(a), 4)]);
    }
  }
  return pts;
}

// Lay out footprints in a tidy grid inside the board (used by "Arrange footprints").
export function arrangeFootprints(pcb, ids) {
  const b = boardBounds(pcb);
  const list = pcb.footprints.filter((f) => !f.locked && (!ids || ids.includes(f.id)));
  list.sort((a, c) => (a.ref || "").localeCompare(c.ref || "", undefined, { numeric: true }));
  let x = b.x1 + 3;
  let y = b.y1 + 3;
  let rowH = 0;
  for (const fp of list) {
    const fb = footprintBounds({ ...fp, x: 0, y: 0 });
    const w = fb.x2 - fb.x1;
    const h = fb.y2 - fb.y1;
    if (x + w > b.x2 - 2 && x > b.x1 + 3) { x = b.x1 + 3; y += rowH + 2; rowH = 0; }
    fp.x = round(x - fb.x1, 3);
    fp.y = round(y - fb.y1, 3);
    x += w + 2;
    rowH = Math.max(rowH, h);
  }
}
