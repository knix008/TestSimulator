// Bill of materials from the schematic (plus board-only footprints such as
// mounting holes placed directly on the PCB).

import { getSymbol } from "../lib/symbols.js";
import { getFootprint } from "../lib/footprints.js";

export const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

export function csvField(v) {
  if (typeof v === "number") return String(v);
  return `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
}

export function csvLine(fields) {
  return fields.map(csvField).join(",");
}

// One entry per physical part: {ref, value, footprint, lib, description, dnp}.
export function bomParts(project) {
  const parts = [];
  const seen = new Set();
  for (const part of project.schematic?.parts || []) {
    const sym = getSymbol(part.lib);
    if (sym && (sym.power || sym.flag)) continue;
    if (!part.ref || part.ref.startsWith("#")) continue;
    if (seen.has(part.ref)) continue; // further units of a multi-unit part
    seen.add(part.ref);
    parts.push({ ref: part.ref, value: part.value || "", footprint: part.footprint || "", lib: part.lib || "", description: (sym && sym.title) || part.lib || "", dnp: !!part.dnp });
  }
  for (const fp of project.pcb?.footprints || []) {
    if (!fp.ref || fp.ref.startsWith("#") || seen.has(fp.ref)) continue;
    seen.add(fp.ref);
    const def = getFootprint(fp.footprint);
    parts.push({ ref: fp.ref, value: fp.value || "", footprint: fp.footprint || "", lib: "", description: (def && def.title) || "", dnp: !!fp.dnp });
  }
  return parts.sort((a, b) => naturalCompare(a.ref, b.ref));
}

// Grouped rows: {item, qty, refs, references, value, footprint, lib, description, dnp}.
// opts.group === false gives one row per part.
export function bomRows(project, opts = {}) {
  const group = opts.group !== false;
  const groups = new Map();
  const order = [];
  for (const p of bomParts(project)) {
    const key = group ? `${p.value}\u0000${p.footprint}\u0000${p.lib}\u0000${p.dnp}` : p.ref;
    let g = groups.get(key);
    if (!g) {
      g = { refs: [], value: p.value, footprint: p.footprint, lib: p.lib, description: p.description, dnp: p.dnp };
      groups.set(key, g);
      order.push(g);
    }
    g.refs.push(p.ref);
  }
  for (const g of order) g.refs.sort(naturalCompare);
  // Fitted parts first, then by reference prefix/number.
  order.sort((a, b) => (a.dnp - b.dnp) || naturalCompare(a.refs[0], b.refs[0]));
  return order.map((g, i) => ({ item: i + 1, qty: g.refs.length, refs: g.refs, references: g.refs.join(","), value: g.value, footprint: g.footprint, lib: g.lib, description: g.description, dnp: g.dnp }));
}

export function bomCsv(project, opts = {}) {
  const lines = [csvLine(["Item", "Qty", "References", "Value", "Footprint", "Description", "DNP"])];
  for (const r of bomRows(project, opts)) lines.push(csvLine([r.item, r.qty, r.references, r.value, r.footprint, r.description, r.dnp ? "DNP" : ""]));
  return lines.join("\r\n") + "\r\n";
}
