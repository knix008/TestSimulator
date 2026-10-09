// Pure schematic edit operations (no DOM) — the editor calls these inside
// store.edit(), and test/unit/sch.test.mjs exercises them directly.

import { getSymbol, symbolBounds, partSymbol, unitCount } from "../lib/symbols.js";
import { partPins } from "../core/netlist.js";
import { xform, rotatePoint, pointSegDist, uid, snap } from "../core/geom.js";
import { fieldPositions } from "./render.js";

export const KINDS = ["parts", "wires", "buses", "junctions", "labels", "noconnects", "texts", "sheets", "dimensions"];

export function findById(sch, id) {
  for (const k of KINDS) {
    const o = sch[k].find((x) => x.id === id);
    if (o) return { kind: k, obj: o };
  }
  return null;
}

// World bounding box of a part (body + pins).
export function partBox(part) {
  const sym = partSymbol(part);
  if (!sym) return { x1: part.x - 50, y1: part.y - 50, x2: part.x + 50, y2: part.y + 50 };
  const b = symbolBounds(sym);
  const pts = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map(([x, y]) => xform(x, y, part));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

export function schematicBounds(sch) {
  const extra = (sch.sheets || []).map(sheetBox);
  let b = null;
  const add = (x1, y1, x2, y2) => {
    if (!b) b = { x1, y1, x2, y2 };
    else { b.x1 = Math.min(b.x1, x1); b.y1 = Math.min(b.y1, y1); b.x2 = Math.max(b.x2, x2); b.y2 = Math.max(b.y2, y2); }
  };
  for (const p of sch.parts) { const r = partBox(p); add(r.x1, r.y1, r.x2, r.y2); }
  for (const w of [...sch.wires, ...(sch.buses || [])]) add(Math.min(w.x1, w.x2), Math.min(w.y1, w.y2), Math.max(w.x1, w.x2), Math.max(w.y1, w.y2));
  for (const o of [...sch.labels, ...sch.texts, ...sch.junctions, ...sch.noconnects]) add(o.x - 100, o.y - 100, o.x + 300, o.y + 100);
  for (const e of extra) add(e.x1 - 100, e.y1 - 150, e.x2 + 100, e.y2 + 100);
  return b;
}

// ---------------------------------------------------------------- hit testing
// Returns the topmost item under (x, y) within `tol` world units.
export function hitTest(sch, x, y, tol, ctx) {
  // Labels and texts first (small, on top), then parts, junctions, wires.
  for (const l of [...sch.labels].reverse()) {
    const w = ctx ? (ctx.font = "50px sans-serif", ctx.measureText(l.text).width + 60) : l.text.length * 32 + 60;
    const r = l.rot || 0;
    const [lx, ly] = rotatePoint(x - l.x, y - l.y, -r);
    if (lx >= -tol - 10 && lx <= w + tol && ly >= -60 - tol && ly <= 40 + tol) return { kind: "labels", obj: l };
  }
  for (const t of [...sch.texts].reverse()) {
    const lines = String(t.text).split("\n");
    const size = t.size || 50;
    const w = Math.max(...lines.map((s) => s.length)) * size * 0.6;
    if (x >= t.x - tol && x <= t.x + w + tol && y >= t.y - size - tol && y <= t.y + (lines.length - 1) * size * 1.3 + tol) return { kind: "texts", obj: t };
  }
  for (const n of sch.noconnects) if (Math.abs(x - n.x) <= 30 + tol && Math.abs(y - n.y) <= 30 + tol) return { kind: "noconnects", obj: n };
  for (const d of sch.dimensions || []) {
    const [ax, ay, bx, by] = dimensionLine(d);
    if (pointSegDist(x, y, ax, ay, bx, by) <= tol + 20) return { kind: "dimensions", obj: d };
  }
  for (const sh of [...(sch.sheets || [])].reverse()) {
    if (x >= sh.x - tol && x <= sh.x + sh.w + tol && y >= sh.y - tol && y <= sh.y + sh.h + tol) {
      // Only the frame and the name pick the block, so wires inside stay clickable.
      const onEdge = Math.min(Math.abs(x - sh.x), Math.abs(x - sh.x - sh.w), Math.abs(y - sh.y), Math.abs(y - sh.y - sh.h)) <= tol + 20;
      if (onEdge || y < sh.y + 120) return { kind: "sheets", obj: sh };
    }
  }
  for (const j of sch.junctions) if (Math.hypot(x - j.x, y - j.y) <= 25 + tol) return { kind: "junctions", obj: j };
  // Wires before part bodies so a wire running into a pin can still be picked.
  for (const w of [...sch.wires].reverse()) if (pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) <= tol) return { kind: "wires", obj: w };
  for (const w of [...(sch.buses || [])].reverse()) if (pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) <= tol + 6) return { kind: "buses", obj: w };
  for (const p of [...sch.parts].reverse()) {
    const sym = partSymbol(p);
    const b = sym ? symbolBounds({ ...sym, pins: sym.pins.length > 1 ? [] : sym.pins }) : null;
    const box = b ? (() => {
      const pts = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map(([px, py]) => xform(px, py, p));
      const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
      return { x1: Math.min(...xs) - 15, y1: Math.min(...ys) - 15, x2: Math.max(...xs) + 15, y2: Math.max(...ys) + 15 };
    })() : partBox(p);
    if (x >= box.x1 - tol && x <= box.x2 + tol && y >= box.y1 - tol && y <= box.y2 + tol) return { kind: "parts", obj: p };
    if (sym && !sym.power) {
      const f = fieldPositions(p, sym);
      if (Math.abs(x - f.ref.x - (f.ref.align === "center" ? 0 : 40)) < 90 && Math.abs(y - f.ref.y) < 40) return { kind: "parts", obj: p, field: "ref" };
      if (Math.abs(x - f.value.x - (f.value.align === "center" ? 0 : 60)) < 120 && Math.abs(y - f.value.y) < 40) return { kind: "parts", obj: p, field: "value" };
    }
  }
  return null;
}

// The dimension line (offset from the measured points), as [ax, ay, bx, by].
export function dimensionLine(d) {
  const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
  const len = Math.hypot(dx, dy) || 1;
  const off = d.offset ?? 100;
  const nx = -dy / len, ny = dx / len;
  return [d.x1 + nx * off, d.y1 + ny * off, d.x2 + nx * off, d.y2 + ny * off];
}

// Hierarchical sheet blocks.
export function sheetPinPoints(sch) {
  const out = [];
  for (const sh of sch.sheets || []) for (const sp of sh.pins || []) out.push(sp.side === "R" ? [sh.x + sh.w, sh.y + sp.offset] : [sh.x, sh.y + sp.offset]);
  return out;
}

export function sheetBox(sh) {
  return { x1: sh.x, y1: sh.y, x2: sh.x + sh.w, y2: sh.y + sh.h };
}

// Keep a sheet block's pins in step with the hierarchical labels on its page:
// one pin per label name, new ones alternating left/right, block grown to fit.
// Returns true when something changed.
export function syncSheetPins(fullSch, sheet) {
  const names = [...new Set((fullSch.labels || []).filter((l) => l.kind === "hier" && (l.page || (fullSch.pages[0] && fullSch.pages[0].id)) === sheet.target).map((l) => l.text))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const before = JSON.stringify(sheet.pins || []);
  const kept = (sheet.pins || []).filter((p) => names.includes(p.name));
  for (const name of names) {
    if (kept.some((p) => p.name === name)) continue;
    const left = kept.filter((p) => p.side === "L").length;
    const right = kept.filter((p) => p.side === "R").length;
    const side = left <= right ? "L" : "R";
    const used = new Set(kept.filter((p) => p.side === side).map((p) => p.offset));
    let offset = 100;
    while (used.has(offset)) offset += 100;
    kept.push({ id: uid("sp"), name, side, offset });
  }
  sheet.pins = kept;
  const maxOff = Math.max(0, ...kept.map((p) => p.offset));
  if (sheet.h < maxOff + 100) sheet.h = maxOff + 100;
  return JSON.stringify(sheet.pins) !== before;
}

// Pin under the cursor (for wiring and no-connect placement).
export function pinAt(sch, x, y, tol) {
  for (const part of sch.parts) {
    for (const pin of partPins(part)) if (Math.hypot(pin.x - x, pin.y - y) <= tol) return { part, pin };
  }
  return null;
}

// Every point a wire may snap to: pins, wire ends, label anchors.
export function snapTargets(sch) {
  const pts = [];
  for (const part of sch.parts) for (const pin of partPins(part)) pts.push({ x: pin.x, y: pin.y, kind: "pin" });
  for (const [x, y] of sheetPinPoints(sch)) pts.push({ x, y, kind: "pin" });
  for (const w of sch.wires) { pts.push({ x: w.x1, y: w.y1, kind: "end" }); pts.push({ x: w.x2, y: w.y2, kind: "end" }); }
  for (const l of sch.labels) pts.push({ x: l.x, y: l.y, kind: "label" });
  return pts;
}

export function snapPoint(sch, x, y, grid, tol) {
  let best = null;
  for (const p of snapTargets(sch)) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= tol && (!best || d < best.d)) best = { ...p, d };
  }
  if (best) return { x: best.x, y: best.y, snapped: best.kind };
  return { x: snap(x, grid), y: snap(y, grid), snapped: null };
}

// Items fully inside (window) or touching (crossing) a rectangle.
export function itemsInRect(sch, r, crossing = false) {
  const inside = (x, y) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
  const out = [];
  for (const p of sch.parts) {
    const b = partBox(p);
    const hit = crossing ? !(b.x2 < r.x1 || b.x1 > r.x2 || b.y2 < r.y1 || b.y1 > r.y2) : inside(b.x1, b.y1) && inside(b.x2, b.y2);
    if (hit) out.push(p.id);
  }
  for (const w of [...sch.wires, ...(sch.buses || []), ...(sch.dimensions || [])]) {
    const a = inside(w.x1, w.y1);
    const b = inside(w.x2, w.y2);
    if (crossing ? a || b : a && b) out.push(w.id);
  }
  for (const o of [...sch.labels, ...sch.texts, ...sch.junctions, ...sch.noconnects]) if (inside(o.x, o.y)) out.push(o.id);
  for (const sh of sch.sheets || []) {
    const hit = crossing ? !(sh.x + sh.w < r.x1 || sh.x > r.x2 || sh.y + sh.h < r.y1 || sh.y > r.y2) : inside(sh.x, sh.y) && inside(sh.x + sh.w, sh.y + sh.h);
    if (hit) out.push(sh.id);
  }
  return out;
}

// ---------------------------------------------------------------- edits
export function addWire(sch, x1, y1, x2, y2) {
  if (x1 === x2 && y1 === y2) return null;
  const w = { id: uid("w"), x1, y1, x2, y2 };
  sch.wires.push(w);
  return w;
}

// An orthogonal path from a to b through one corner (horizontal first unless vFirst).
export function orthoPath(ax, ay, bx, by, vFirst = false) {
  if (ax === bx || ay === by) return [[ax, ay], [bx, by]];
  return vFirst ? [[ax, ay], [ax, by], [bx, by]] : [[ax, ay], [bx, ay], [bx, by]];
}

export function deleteItems(sch, ids) {
  const set = new Set(ids);
  let n = 0;
  for (const k of KINDS) {
    const before = sch[k].length;
    sch[k] = sch[k].filter((o) => !set.has(o.id));
    n += before - sch[k].length;
  }
  cleanup(sch);
  return n;
}

// Centre of a selection (for rotate/mirror about it), snapped to the grid.
export function selectionCenter(sch, ids, grid = 50) {
  const set = new Set(ids);
  const xs = [];
  const ys = [];
  for (const k of KINDS) {
    for (const o of sch[k]) {
      if (!set.has(o.id)) continue;
      if (o.x1 !== undefined) { xs.push(o.x1, o.x2); ys.push(o.y1, o.y2); } else { xs.push(o.x); ys.push(o.y); }
    }
  }
  if (!xs.length) return { x: 0, y: 0 };
  return { x: snap((Math.min(...xs) + Math.max(...xs)) / 2, grid), y: snap((Math.min(...ys) + Math.max(...ys)) / 2, grid) };
}

// Wire ends sitting on pins / label anchors of the given parts — they follow when those parts move.
function attachedEnds(sch, ids) {
  const set = new Set(ids);
  const points = new Set();
  for (const p of sch.parts) if (set.has(p.id)) for (const pin of partPins(p)) points.add(`${pin.x},${pin.y}`);
  for (const l of sch.labels) if (set.has(l.id)) points.add(`${l.x},${l.y}`);
  for (const [x, y] of sheetPinPoints({ sheets: (sch.sheets || []).filter((sh) => set.has(sh.id)) })) points.add(`${x},${y}`);
  const ends = [];
  for (const w of sch.wires) {
    if (set.has(w.id)) continue;
    if (points.has(`${w.x1},${w.y1}`)) ends.push({ w, end: 1 });
    if (points.has(`${w.x2},${w.y2}`)) ends.push({ w, end: 2 });
  }
  return ends;
}

export function beginDrag(sch, ids) {
  const set = new Set(ids);
  const orig = new Map();
  for (const k of KINDS) for (const o of sch[k]) if (set.has(o.id)) orig.set(o.id, { ...o });
  const ends = attachedEnds(sch, ids).map((e) => ({ ...e, x: e.end === 1 ? e.w.x1 : e.w.x2, y: e.end === 1 ? e.w.y1 : e.w.y2 }));
  return { ids: set, orig, ends };
}

// Move by (dx, dy) from the drag's original positions; attached wire ends follow (rubber-banding).
export function applyDrag(sch, drag, dx, dy, { rubber = true } = {}) {
  for (const k of KINDS) {
    for (const o of sch[k]) {
      const g = drag.orig.get(o.id);
      if (!g) continue;
      if (o.x1 !== undefined) { o.x1 = g.x1 + dx; o.y1 = g.y1 + dy; o.x2 = g.x2 + dx; o.y2 = g.y2 + dy; } else { o.x = g.x + dx; o.y = g.y + dy; }
    }
  }
  for (const e of drag.ends) {
    const nx = rubber ? e.x + dx : e.x;
    const ny = rubber ? e.y + dy : e.y;
    if (e.end === 1) { e.w.x1 = nx; e.w.y1 = ny; } else { e.w.x2 = nx; e.w.y2 = ny; }
  }
}

// Rubber-banded wires become diagonal; straighten each into an L by adding
// a corner so the schematic stays orthogonal after a drag.
export function finishDrag(sch, drag) {
  for (const e of drag.ends) {
    const w = e.w;
    if (w.x1 !== w.x2 && w.y1 !== w.y2) {
      const moved = e.end === 1 ? [w.x1, w.y1] : [w.x2, w.y2];
      const fixed = e.end === 1 ? [w.x2, w.y2] : [w.x1, w.y1];
      // Keep the fixed end's original direction where possible.
      const wasHorizontal = Math.abs(e.y - fixed[1]) < 1;
      const corner = wasHorizontal ? [moved[0], fixed[1]] : [fixed[0], moved[1]];
      w.x1 = fixed[0]; w.y1 = fixed[1]; w.x2 = corner[0]; w.y2 = corner[1];
      addWire(sch, corner[0], corner[1], moved[0], moved[1]);
    }
  }
  cleanup(sch);
}

export function rotateItems(sch, ids, ccw = true) {
  const c = selectionCenter(sch, ids);
  const set = new Set(ids);
  const drag = beginDrag(sch, ids);
  const ang = ccw ? 90 : -90;
  const rot = (x, y) => {
    const [rx, ry] = rotatePoint(x - c.x, y - c.y, ang);
    return [c.x + rx, c.y + ry];
  };
  for (const k of KINDS) {
    for (const o of sch[k]) {
      if (!set.has(o.id)) continue;
      if (o.x1 !== undefined) {
        [o.x1, o.y1] = rot(o.x1, o.y1);
        [o.x2, o.y2] = rot(o.x2, o.y2);
      } else {
        [o.x, o.y] = rot(o.x, o.y);
        if (k === "parts" || k === "labels" || k === "texts") o.rot = (((o.rot || 0) + ang) % 360 + 360) % 360;
        if (k === "parts" && (o.refOffset || o.valueOffset)) { delete o.refOffset; delete o.valueOffset; }
      }
    }
  }
  followPins(sch, drag);
  cleanup(sch);
}

export function mirrorItems(sch, ids, axis = "x") {
  const c = selectionCenter(sch, ids);
  const set = new Set(ids);
  const drag = beginDrag(sch, ids);
  const m = (x, y) => (axis === "x" ? [2 * c.x - x, y] : [x, 2 * c.y - y]);
  for (const k of KINDS) {
    for (const o of sch[k]) {
      if (!set.has(o.id)) continue;
      if (o.x1 !== undefined) {
        [o.x1, o.y1] = m(o.x1, o.y1);
        [o.x2, o.y2] = m(o.x2, o.y2);
      } else {
        [o.x, o.y] = m(o.x, o.y);
        if (k === "parts") {
          // Mirror about the vertical axis flips local x; about the horizontal axis
          // is the same as mirroring x and rotating 180°.
          o.mirror = !o.mirror;
          if (axis === "y") o.rot = ((o.rot || 0) + 180) % 360;
          delete o.refOffset; delete o.valueOffset;
        }
        if (k === "labels" && axis === "x" && (o.rot === 0 || o.rot === 180)) o.rot = (o.rot + 180) % 360;
        if (k === "labels" && axis === "y" && (o.rot === 90 || o.rot === 270)) o.rot = (o.rot + 180) % 360;
      }
    }
  }
  followPins(sch, drag);
  cleanup(sch);
}

// After rotating/mirroring parts, wire ends that sat on their pins move to the new pin positions.
function followPins(sch, drag) {
  const byPin = new Map();
  for (const [id, before] of drag.orig) {
    const now = sch.parts.find((p) => p.id === id);
    if (!now || !before.lib) continue;
    const a = partPins(before);
    const b = partPins(now);
    a.forEach((pin, i) => byPin.set(`${pin.x},${pin.y}`, [b[i].x, b[i].y]));
  }
  for (const e of drag.ends) {
    const to = byPin.get(`${e.x},${e.y}`);
    if (!to) continue;
    if (e.end === 1) { e.w.x1 = to[0]; e.w.y1 = to[1]; } else { e.w.x2 = to[0]; e.w.y2 = to[1]; }
  }
  // Straighten anything that went diagonal.
  finishDragEndsOnly(sch, drag);
}

function finishDragEndsOnly(sch, drag) {
  for (const e of drag.ends) {
    const w = e.w;
    if (w.x1 !== w.x2 && w.y1 !== w.y2) {
      const fixed = e.end === 1 ? [w.x2, w.y2] : [w.x1, w.y1];
      const moved = e.end === 1 ? [w.x1, w.y1] : [w.x2, w.y2];
      w.x1 = fixed[0]; w.y1 = fixed[1]; w.x2 = moved[0]; w.y2 = fixed[1];
      addWire(sch, moved[0], fixed[1], moved[0], moved[1]);
    }
  }
}

// ---------------------------------------------------------------- cleanup
// Remove zero-length wires and duplicates, merge collinear wires that meet
// end to end with nothing else attached there, and keep junction dots exactly
// where three or more connections meet.
export function cleanup(sch) {
  sch.wires = sch.wires.filter((w) => !(w.x1 === w.x2 && w.y1 === w.y2));
  const seen = new Set();
  sch.wires = sch.wires.filter((w) => {
    const a = `${w.x1},${w.y1}`;
    const b = `${w.x2},${w.y2}`;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  mergeOverlaps(sch);
  autoJunctions(sch); // drop stale dots first so they do not block merging
  mergeCollinear(sch);
  autoJunctions(sch);
  splitAtJunctions(sch);
}

// Horizontal/vertical wires that overlap along the same line become one wire
// covering the union (drawing over an existing wire must not leave doubles).
function mergeOverlaps(sch) {
  const lines = new Map();
  const out = [];
  for (const w of sch.wires) {
    const horizontal = w.y1 === w.y2;
    if (!horizontal && w.x1 !== w.x2) { out.push(w); continue; }
    const key = horizontal ? `h${w.y1}` : `v${w.x1}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push({ w, a: horizontal ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2), b: horizontal ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2) });
  }
  for (const [key, list] of lines) {
    list.sort((p, q) => p.a - q.a);
    const merged = [];
    for (const it of list) {
      const last = merged[merged.length - 1];
      if (last && it.a < last.b) last.b = Math.max(last.b, it.b);
      else merged.push({ ...it });
    }
    const c = +key.slice(1);
    for (const m of merged) {
      if (key[0] === "h") Object.assign(m.w, { x1: m.a, y1: c, x2: m.b, y2: c });
      else Object.assign(m.w, { x1: c, y1: m.a, x2: c, y2: m.b });
      out.push(m.w);
    }
  }
  sch.wires = out;
}

function mergeCollinear(sch) {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    const pinPts = new Set();
    for (const p of sch.parts) for (const pin of partPins(p)) pinPts.add(`${pin.x},${pin.y}`);
    for (const l of sch.labels) pinPts.add(`${l.x},${l.y}`);
    for (const n of sch.junctions) pinPts.add(`${n.x},${n.y}`);
    const ends = new Map();
    for (const w of sch.wires) {
      for (const k of [`${w.x1},${w.y1}`, `${w.x2},${w.y2}`]) {
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(w);
      }
    }
    for (const [k, ws] of ends) {
      if (ws.length !== 2 || pinPts.has(k)) continue;
      const [a, b] = ws;
      const horizontal = (w) => w.y1 === w.y2;
      const vertical = (w) => w.x1 === w.x2;
      if (!((horizontal(a) && horizontal(b)) || (vertical(a) && vertical(b)))) continue;
      // Another wire passing through this point means it is a T: keep it split.
      const [px, py] = k.split(",").map(Number);
      if (sch.wires.some((w) => w !== a && w !== b && pointSegDist(px, py, w.x1, w.y1, w.x2, w.y2) < 0.5)) continue;
      const far = (w) => (`${w.x1},${w.y1}` === k ? [w.x2, w.y2] : [w.x1, w.y1]);
      const [ax, ay] = far(a);
      const [bx, by] = far(b);
      // Only join wires that leave the point in opposite directions; overlapping
      // wires folded together would collapse into nothing.
      if ((ax - px) * (bx - px) + (ay - py) * (by - py) >= 0) continue;
      a.x1 = ax; a.y1 = ay; a.x2 = bx; a.y2 = by;
      sch.wires = sch.wires.filter((w) => w !== b);
      changed = true;
      break;
    }
  }
}

// A junction placed on a wire's middle splits that wire there, so connectivity
// and later edits see two wires meeting at the dot.
function splitAtJunctions(sch) {
  for (const j of sch.junctions) {
    for (const w of [...sch.wires]) {
      const atEnd = (w.x1 === j.x && w.y1 === j.y) || (w.x2 === j.x && w.y2 === j.y);
      if (atEnd) continue;
      if (pointSegDist(j.x, j.y, w.x1, w.y1, w.x2, w.y2) < 0.5) {
        const x2 = w.x2;
        const y2 = w.y2;
        w.x2 = j.x;
        w.y2 = j.y;
        sch.wires.push({ id: uid("w"), x1: j.x, y1: j.y, x2, y2 });
      }
    }
  }
}

export function connectionCount(sch, x, y) {
  let n = 0;
  for (const w of sch.wires) {
    if ((w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y)) n += 1;
    else if (pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) < 0.5) n += 2;
  }
  for (const p of sch.parts) for (const pin of partPins(p)) if (pin.x === x && pin.y === y) n += 1;
  for (const [px, py] of sheetPinPoints(sch)) if (px === x && py === y) n += 1;
  return n;
}

export function autoJunctions(sch) {
  const candidates = new Map();
  for (const w of sch.wires) {
    candidates.set(`${w.x1},${w.y1}`, [w.x1, w.y1]);
    candidates.set(`${w.x2},${w.y2}`, [w.x2, w.y2]);
  }
  for (const p of sch.parts) for (const pin of partPins(p)) candidates.set(`${pin.x},${pin.y}`, [pin.x, pin.y]);
  const want = new Set();
  for (const [k, [x, y]] of candidates) if (connectionCount(sch, x, y) >= 3) want.add(k);
  // Keep manual junctions that still sit on a wire crossing; drop orphans.
  sch.junctions = sch.junctions.filter((j) => {
    const k = `${j.x},${j.y}`;
    if (want.has(k)) { want.delete(k); return true; }
    return connectionCount(sch, j.x, j.y) >= 3;
  });
  for (const k of want) {
    const [x, y] = k.split(",").map(Number);
    sch.junctions.push({ id: uid("j"), x, y });
  }
}

// ---------------------------------------------------------------- parts
export function newPart(libName, x, y, overrides = {}) {
  const sym = getSymbol(libName);
  if (!sym) throw new Error(`unknown symbol ${libName}`);
  const fields = { ...(sym.fields || {}) };
  if (unitCount(sym) > 1 && !overrides.unit) overrides = { unit: 1, ...overrides };
  return {
    id: uid("p"), lib: libName, ref: sym.power ? "#PWR?" : sym.flag ? "#FLG?" : `${sym.refPrefix}?`, value: sym.value,
    footprint: (sym.footprints && sym.footprints[0]) || "", x, y, rot: 0, mirror: false, fields, ...overrides,
  };
}

// Clipboard: copy items (and the wires fully between them) as JSON relative to an anchor.
export function copyItems(sch, ids) {
  const set = new Set(ids);
  const data = {};
  for (const k of KINDS) data[k] = sch[k].filter((o) => set.has(o.id)).map((o) => ({ ...o }));
  const c = selectionCenter(sch, ids);
  return { kind: "mycircuit-sch", anchor: c, data };
}

export function pasteItems(sch, clip, x, y) {
  const dx = x - clip.anchor.x;
  const dy = y - clip.anchor.y;
  const ids = [];
  const usedRefs = new Set(sch.parts.map((p) => p.ref));
  for (const k of KINDS) {
    for (const o of clip.data[k] || []) {
      const n = { ...JSON.parse(JSON.stringify(o)), id: uid(k[0]) };
      if (n.x1 !== undefined) { n.x1 += dx; n.y1 += dy; n.x2 += dx; n.y2 += dy; } else { n.x += dx; n.y += dy; }
      if (k === "parts") {
        const m = /^([A-Za-z#_]+)\d+$/.exec(n.ref || "");
        if (m && usedRefs.has(n.ref)) n.ref = `${m[1]}?`;
      }
      sch[k].push(n);
      ids.push(n.id);
    }
  }
  cleanup(sch);
  return ids;
}

// Next label text: "D0" → "D1", "ADDR7" → "ADDR8", otherwise unchanged.
export function incrementText(s) {
  const m = /^(.*?)(\d+)$/.exec(s || "");
  if (!m) return s;
  return m[1] + String(+m[2] + 1).padStart(m[2].length, "0");
}

// Points where wires end with nothing attached (shown as small circles in the editor).
export function danglingEnds(sch) {
  const pts = [];
  const pins = new Set();
  for (const p of sch.parts) for (const pin of partPins(p)) pins.add(`${pin.x},${pin.y}`);
  for (const [x, y] of sheetPinPoints(sch)) pins.add(`${x},${y}`);
  const labels = new Set(sch.labels.map((l) => `${l.x},${l.y}`));
  const ncs = new Set(sch.noconnects.map((n) => `${n.x},${n.y}`));
  for (const w of sch.wires) {
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const k = `${x},${y}`;
      if (pins.has(k) || labels.has(k) || ncs.has(k)) continue;
      if (connectionCount(sch, x, y) > 1) continue;
      pts.push([x, y]);
    }
  }
  return pts;
}
