// Schedules and quantities of the BIM elements: one row per element (level,
// type, size, length / area / volume, U-value), schedules by type (the type
// catalogue: count and key parameters), cost lines and U-values of the
// layered wall and slab types.

import { polygonArea } from "../geom.js";
import { memberWeight } from "../members.js";
import { levelById, wallLength, wallHeight } from "../project.js";
import { uValue, materialById } from "../../lib/materials.js";
import { allTypes, allSlabTypes, typeInstances, TYPE_PARAMS, activeModel } from "./model.js";
import { slabArea, slabTypeOf, ceilingArea, ceilingHeight, beamLength, railingLength, rampModel, stairRails, pathLength, isCurtainWall, curtainGrid } from "./geometry.js";
import { openingSpans } from "../walls.js";

const lvName = (p, id) => (levelById(p, id) || {}).name || "";

// Every slab, ceiling, beam, railing, ramp, shaft and curtain wall → rows
// {category, level, name, type, count, length (m), area (m²), volume (m³), uValue}.
export function elementSchedule(p0) {
  const p = activeModel(p0);
  const rows = [];
  for (const s of p.slabs || []) {
    const st = slabTypeOf(p, s);
    const a = slabArea(p, s) / 1e6;
    rows.push({ id: s.id, category: s.kind === "foundation" ? "Foundation" : "Floor slab", level: lvName(p, s.level), type: st ? st.name : `${s.thickness} mm`, count: 1, length: 0, area: a, volume: (a * s.thickness) / 1000, uValue: st ? uValue(st.layers) : null, thickness: s.thickness });
  }
  for (const c of p.ceilings || []) {
    const st = slabTypeOf(p, c);
    rows.push({ id: c.id, category: "Ceiling", level: lvName(p, c.level), type: st ? st.name : `${c.thickness} mm`, count: 1, length: 0, area: ceilingArea(p, c) / 1e6, volume: (ceilingArea(p, c) / 1e6) * (c.thickness / 1000), uValue: null, thickness: c.thickness, height: ceilingHeight(p, c) });
  }
  const typeName = (id, fb) => { const t = allTypes(p).find((x) => x.id === id); return t ? t.name : fb; };
  for (const b of p.beams || []) {
    const L = beamLength(p, b) / 1000;
    const kind = Math.abs((b.z2 ?? b.z1 ?? 0) - (b.z1 ?? 0)) > 1 ? "Brace" : "Beam";
    rows.push({ id: b.id, category: kind, level: lvName(p, b.level), type: typeName(b.typeId, `${b.profile} ${b.w} × ${b.h}`), count: 1, length: L, area: 0, volume: L * (b.w / 1000) * (b.h / 1000) * (b.profile === "I" ? 0.35 : b.profile === "round" ? Math.PI / 4 : 1), uValue: null });
  }
  for (const r of p.railings || []) rows.push({ id: r.id, category: "Railing", level: lvName(p, r.level), type: typeName(r.typeId, `${r.style} ${r.height}`), count: 1, length: railingLength(r) / 1000, area: 0, volume: 0, uValue: null });
  for (const s of p.stairs || []) for (const rail of stairRails(p, s)) rows.push({ id: s.id, category: "Stair railing", level: lvName(p, s.level), type: s.shape || "straight", count: 1, length: pathLength(rail) / 1000, area: 0, volume: 0, uValue: null });
  for (const r of p.ramps || []) {
    const m = rampModel(p, r);
    rows.push({ id: r.id, category: "Ramp", level: lvName(p, r.level), type: `1:${m.slope > 0 ? Math.round(1 / m.slope) : "∞"}`, count: 1, length: m.length / 1000, area: (m.length * r.width) / 1e6, volume: (m.length * r.width * r.thickness) / 1e9, uValue: null });
  }
  for (const s of p.shafts || []) rows.push({ id: s.id, category: "Shaft", level: `${lvName(p, s.level)} – ${lvName(p, s.top)}`, type: s.name || "", count: 1, length: 0, area: Math.abs(polygonArea(s.pts)) / 1e6, volume: 0, uValue: null });
  for (const w of p.walls || []) {
    if (!isCurtainWall(p, w)) continue;
    const H = wallHeight(p, w);
    const g = curtainGrid(p, w, H);
    const wt = p.wallTypes.find((x) => x.id === w.type);
    rows.push({ id: w.id, category: "Curtain wall", level: lvName(p, w.level), type: wt ? wt.name : "", count: 1, length: wallLength(w) / 1000, area: (wallLength(w) * H) / 1e6, volume: 0, uValue: null, panels: (g.us.length - 1) * (g.zs.length - 1) - openingSpans(p, w).length });
  }
  return rows;
}

// Totals per category → [{category, count, length, area, volume}].
export function elementTotals(p) {
  const out = new Map();
  for (const r of elementSchedule(p)) {
    if (!out.has(r.category)) out.set(r.category, { category: r.category, count: 0, length: 0, area: 0, volume: 0 });
    const o = out.get(r.category);
    o.count += r.count; o.length += r.length; o.area += r.area; o.volume += r.volume;
  }
  return [...out.values()];
}

// Schedule by type: every catalogue type with its instances
// → [{category, type, id, count, params (text), builtin}].
export function typeSchedule(p0) {
  const p = activeModel(p0);
  const rows = [];
  for (const t of allTypes(p)) {
    const n = typeInstances(p, t.id).length;
    rows.push({ id: t.id, category: t.category, type: t.name, count: n, params: (TYPE_PARAMS[t.category] || []).filter((k) => t.params[k] !== undefined && t.params[k] !== "").map((k) => `${k} ${t.params[k]}`).join(", ") });
  }
  return rows.sort((a, b) => a.category.localeCompare(b.category) || b.count - a.count || a.type.localeCompare(b.type));
}

// U-values of the layered wall, slab and ceiling types → [{kind, type, thickness, uValue, layers}].
export function thermalSchedule(p) {
  const rows = [];
  for (const wt of p.wallTypes || []) {
    if (wt.kind === "curtain") continue;
    rows.push({ id: wt.id, kind: "Wall", type: wt.name, thickness: wt.layers.reduce((s, l) => s + l.thickness, 0), uValue: uValue(wt.layers), layers: wt.layers.map((l) => `${l.material} ${l.thickness}`).join(" / ") });
  }
  for (const st of allSlabTypes(p)) rows.push({ id: st.id, kind: st.use === "ceiling" ? "Ceiling" : st.use === "foundation" ? "Foundation" : "Floor", type: st.name, thickness: st.layers.reduce((s, l) => s + l.thickness, 0), uValue: uValue(st.layers, { rsi: 0.17, rse: 0.04 }), layers: st.layers.map((l) => `${l.material} ${l.thickness}`).join(" / ") });
  return rows;
}

// Cost lines for the estimate (costEstimate adds them): slabs and ceilings per
// m², beams, railings per m, ramps per item, curtain walls per m² of face.
export function elementCostLines(p0, add, c, live) {
  const p = activeModel(p0);
  add("Floor slabs", (p.slabs || []).filter(live).reduce((s, x) => s + slabArea(p, x), 0) / 1e6, "m²", +c.slab || 0);
  add("Ceilings", (p.ceilings || []).filter(live).reduce((s, x) => s + ceilingArea(p, x), 0) / 1e6, "m²", +c.ceiling || 0);
  add("Beams", (p.beams || []).filter(live).reduce((s, x) => s + beamLength(p, x), 0) / 1000, "m", +c.beam || 0);
  const rails = (p.railings || []).filter(live).reduce((s, x) => s + railingLength(x), 0) + (p.stairs || []).filter(live).reduce((s, x) => s + stairRails(p, x).reduce((a, r) => a + pathLength(r), 0), 0);
  add("Railings", rails / 1000, "m", +c.railing || 0);
  add("Ramps", (p.ramps || []).filter(live).length, "pcs", +c.ramp || 0);
  add("Curtain walls", (p.walls || []).filter((w) => live(w) && isCurtainWall(p, w)).reduce((s, w) => s + wallLength(w) * wallHeight(p, w), 0) / 1e6, "m²", +c.curtainWall || 0);
  // Structural members (towers, bridges, frames) by weight.
  const kg = (p.members || []).filter(live).reduce((s, m) => { const mat = materialById(m.material); return s + memberWeight(m, (mat && mat.density) || 7850); }, 0);
  add("Structural members", kg / 1000, "t", +c.member || 0);
}
