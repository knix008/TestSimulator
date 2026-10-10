// Schedules and quantities: rooms, doors and windows, walls and floor areas
// per level, plus CSV output. Pure functions of the project.

import { wallLength, wallHeight, openingTags, levelById } from "./project.js";
import { openingSpans } from "./walls.js";
import { roomArea, roomPerimeter, buildingOutlines } from "./rooms.js";
import { polygonArea } from "./geom.js";

export function roomSchedule(p) {
  const rows = [];
  for (const lv of p.levels) {
    for (const r of p.rooms.filter((x) => x.level === lv.id)) {
      rows.push({ id: r.id, level: lv.name, name: r.name || "", area: roomArea(r) / 1e6, perimeter: roomPerimeter(r) / 1000, floor: r.floor || "" });
    }
  }
  return rows;
}

export function openingSchedule(p) {
  const tags = openingTags(p);
  const rows = [];
  for (const o of p.openings) {
    const w = p.walls.find((x) => x.id === o.wall);
    const lv = w ? levelById(p, w.level) : null;
    rows.push({ id: o.id, tag: tags.get(o.id), kind: o.kind, type: o.type, level: lv ? lv.name : "", width: o.width, height: o.height, sill: o.sill, wallThickness: w ? w.thickness : 0 });
  }
  rows.sort((a, b) => a.tag.localeCompare(b.tag));
  return rows;
}

// Per level: wall count, length, gross/net wall face area (one side),
// volume, room (net) area and gross floor area (outside of the walls).
export function levelSummary(p) {
  return p.levels.map((lv) => {
    const walls = p.walls.filter((w) => w.level === lv.id);
    let length = 0, gross = 0, net = 0, volume = 0;
    for (const w of walls) {
      const L = wallLength(w);
      const H = wallHeight(p, w);
      const holes = openingSpans(p, w).reduce((s, sp) => s + (sp.u2 - sp.u1) * Math.min(sp.o.height, Math.max(0, H - sp.o.sill)), 0);
      length += L;
      gross += L * H;
      net += L * H - holes;
      volume += (L * H - holes) * w.thickness;
    }
    const rooms = p.rooms.filter((r) => r.level === lv.id);
    const roomA = rooms.reduce((s, r) => s + roomArea(r), 0);
    const gfa = buildingOutlines(walls).reduce((s, pts) => s + Math.abs(polygonArea(pts)), 0);
    return {
      level: lv.name, elevation: lv.elevation, height: lv.height, walls: walls.length, wallLength: length / 1000,
      wallAreaGross: gross / 1e6, wallAreaNet: net / 1e6, wallVolume: volume / 1e9, rooms: rooms.length, roomArea: roomA / 1e6, grossArea: gfa / 1e6,
      doors: p.openings.filter((o) => o.kind === "door" && walls.some((w) => w.id === o.wall)).length,
      windows: p.openings.filter((o) => o.kind === "window" && walls.some((w) => w.id === o.wall)).length,
      furniture: p.furniture.filter((f) => f.level === lv.id).length,
    };
  });
}

export function projectTotals(p) {
  const lv = levelSummary(p);
  const sum = (k) => lv.reduce((s, x) => s + x[k], 0);
  return { levels: lv.length, walls: sum("walls"), wallLength: sum("wallLength"), roomArea: sum("roomArea"), grossArea: sum("grossArea"), doors: sum("doors"), windows: sum("windows"), wallVolume: sum("wallVolume") };
}

// Wall types: count, length and face area per type (untyped walls by thickness).
export function wallTypeSchedule(p) {
  const rows = new Map();
  for (const w of p.walls) {
    const wt = w.type ? p.wallTypes.find((x) => x.id === w.type) : null;
    const key = wt ? wt.id : `t${w.thickness}`;
    if (!rows.has(key)) rows.set(key, { type: wt ? wt.name : `${w.thickness} mm`, thickness: w.thickness, layers: wt ? wt.layers.map((l) => `${l.material} ${l.thickness}`).join(" / ") : "", count: 0, length: 0, area: 0 });
    const r = rows.get(key);
    const L = wallLength(w);
    const H = wallHeight(p, w);
    const holes = openingSpans(p, w).reduce((s, sp) => s + (sp.u2 - sp.u1) * Math.min(sp.o.height, Math.max(0, H - sp.o.sill)), 0);
    r.count++;
    r.length += L / 1000;
    r.area += (L * H - holes) / 1e6;
  }
  return [...rows.values()].sort((a, b) => b.area - a.area);
}

// Cost estimate from the project's unit prices (walls and floors per m² of
// face, roofs per m² of plan, everything else per item). Demolished items
// are left out; existing ones cost nothing.
export function costEstimate(p) {
  const c = p.costs || {};
  const live = (it) => (it.phase || "new") === "new";
  const lines = [];
  const add = (item, qty, unit, price) => { if (qty > 0) lines.push({ item, qty, unit, price, total: qty * price }); };
  let wallArea = 0;
  for (const w of p.walls.filter(live)) {
    const H = wallHeight(p, w);
    wallArea += (wallLength(w) * H - openingSpans(p, w).reduce((s, sp) => s + (sp.u2 - sp.u1) * Math.min(sp.o.height, Math.max(0, H - sp.o.sill)), 0)) / 1e6;
  }
  add("Walls", wallArea, "m²", +c.wall || 0);
  add("Floors", p.rooms.filter(live).reduce((s, r) => s + roomArea(r), 0) / 1e6, "m²", +c.floor || 0);
  add("Roofs", p.roofs.filter(live).reduce((s, r) => s + Math.abs(polygonArea(r.pts)), 0) / 1e6, "m²", +c.roof || 0);
  for (const k of ["door", "window", "opening"]) add(k === "door" ? "Doors" : k === "window" ? "Windows" : "Openings", p.openings.filter((o) => o.kind === k && live(o)).length, "pcs", +c[k] || 0);
  add("Stairs", p.stairs.filter(live).length, "pcs", +c.stair || 0);
  add("Columns", p.columns.filter(live).length, "pcs", +c.column || 0);
  const furnTotal = p.furniture.filter(live).reduce((s, f) => s + (+((f.props || {}).price) || +c.furniture || 0), 0);
  if (furnTotal > 0) lines.push({ item: "Furniture", qty: p.furniture.filter(live).length, unit: "pcs", price: furnTotal / Math.max(1, p.furniture.filter(live).length), total: furnTotal });
  const total = lines.reduce((s, l) => s + l.total, 0);
  return { lines, total, currency: c.currency || "KRW" };
}

const esc = (v) => {
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// rows: [{...}], cols: [[key, header]] → CSV text (UTF-8 BOM so Excel reads Korean).
export function toCSV(rows, cols) {
  const lines = [cols.map(([, hd]) => esc(hd)).join(",")];
  for (const r of rows) lines.push(cols.map(([k]) => esc(r[k])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
