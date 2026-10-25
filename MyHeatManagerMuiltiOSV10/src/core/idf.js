// ECAD import from IDF 3.0 (the open board / component exchange of PCB design tools, as Icepak and FloTHERM read
// it): the board file (.emn) gives the board outline and thickness and the component placements, the library file
// (.emp) the component outlines, heights and properties. The result is a 3D model: the board as an effective-PCB
// slab in the x-y plane, each placed component as a mould-compound body above (TOP) or below (BOTTOM) it, carrying
// the POWER_OPR property as its power, all cooled by convection. Pure functions, unit-tested in Node.
import { normalizeModel, newId } from './model.js';
import { materialFromLibrary } from './materials.js';

const THOU = 0.0254;

/** Sections of an IDF file: [{ name, owner, rows }] with the record lines between ".NAME" and ".END_NAME". */
function sections(text) {
  const out = [];
  let current = null;
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const row = raw.trim();
    if (!row || row.startsWith('#')) continue;
    if (row.startsWith('.END_')) { current = null; continue; }
    if (row.startsWith('.')) {
      const [name, owner] = row.slice(1).split(/\s+/);
      current = { name: name.toUpperCase(), owner, rows: [] };
      out.push(current);
      continue;
    }
    current?.rows.push(row);
  }
  return out;
}

/** Fields of a record line, with "quoted strings" kept whole. */
const fields = (row) => [...row.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);

/**
 * Loops of outline records `label x y angle` → [{ label, points }]: a non-zero angle draws an arc from the previous
 * point (degrees, positive counter-clockwise), 360 a full circle whose first point is the centre.
 */
function loops(rows, scale) {
  const out = new Map();
  for (const row of rows) {
    const [label, x, y, angle] = fields(row).map(Number);
    if (![label, x, y].every(Number.isFinite)) continue;
    if (!out.has(label)) out.set(label, { label, points: [], circle: null });
    const loop = out.get(label);
    const p = [x * scale, y * scale];
    const a = Number(angle) || 0;
    const prev = loop.points.at(-1);
    if (Math.abs(Math.abs(a) - 360) < 1e-9 && prev) {
      loop.circle = { cx: prev[0], cy: prev[1], r: Math.hypot(p[0] - prev[0], p[1] - prev[1]) };
      continue;
    }
    if (a && prev) {
      // Arc through the chord prev → p with the included angle a: centre on the chord's bisector.
      const t = (a * Math.PI) / 180;
      const mx = (prev[0] + p[0]) / 2;
      const my = (prev[1] + p[1]) / 2;
      const half = Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 2;
      const d = half / Math.tan(t / 2);
      const nx = -(p[1] - prev[1]) / (2 * half);
      const ny = (p[0] - prev[0]) / (2 * half);
      const cx = mx + nx * d;
      const cy = my + ny * d;
      const r = Math.hypot(prev[0] - cx, prev[1] - cy);
      const start = Math.atan2(prev[1] - cy, prev[0] - cx);
      const steps = Math.max(2, Math.ceil(Math.abs(a) / 15));
      for (let s = 1; s < steps; s++) {
        const u = start + (t * s) / steps;
        loop.points.push([cx + r * Math.cos(u), cy + r * Math.sin(u)]);
      }
    }
    loop.points.push(p);
  }
  for (const loop of out.values()) {
    const [a, b] = [loop.points[0], loop.points.at(-1)];
    if (loop.points.length > 1 && a && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) loop.points.pop();
  }
  return [...out.values()];
}

const unitScale = (u) => (/THOU|MIL/i.test(String(u)) ? THOU : 1);

/** Library parts from an .emp file: Map("geometry|part number" → { geometry, part, height (mm), outline, circle, props }). */
export function parseIdfLibrary(text) {
  const parts = new Map();
  for (const s of sections(text)) {
    if (s.name !== 'ELECTRICAL' && s.name !== 'MECHANICAL') continue;
    const [geometry, part, units, height] = fields(s.rows[0] ?? '');
    const scale = unitScale(units);
    const props = {};
    const outline = [];
    for (const row of s.rows.slice(1)) {
      const f = fields(row);
      if (f[0]?.toUpperCase() === 'PROP') props[f[1].toUpperCase()] = Number(f[2]);
      else outline.push(row);
    }
    const loop = loops(outline, scale)[0];
    parts.set(`${geometry}|${part}`, { geometry, part, height: Number(height) * scale, outline: loop?.points ?? [], circle: loop?.circle ?? null, props, kind: s.name.toLowerCase() });
  }
  return parts;
}

/**
 * Model from an IDF 3.0 board file and (optionally) its library file. options: { language, h (W/m²K, default 10),
 * maxCells (default 400 000) }. Returns { model, warnings }.
 */
export function idfToModel(boardText, libraryText = '', options = {}) {
  const language = options.language === 'en' ? 'en' : 'ko';
  const warnings = [];
  const all = sections(boardText);
  const header = all.find((s) => s.name === 'HEADER');
  if (!header || !/BOARD_FILE|PANEL_FILE/i.test(header.rows[0] ?? '')) throw new Error('not an IDF board file (.emn): the header has no BOARD_FILE record');
  const [boardName, units] = fields(header.rows[1] ?? '');
  const scale = unitScale(units);
  const outlineSection = all.find((s) => s.name === 'BOARD_OUTLINE' || s.name === 'PANEL_OUTLINE');
  if (!outlineSection) throw new Error('the board file has no BOARD_OUTLINE');
  const thickness = Number(outlineSection.rows[0]) * scale;
  const boardLoops = loops(outlineSection.rows.slice(1), scale);
  const outer = boardLoops.find((l) => l.label === 0) ?? boardLoops[0];
  if (!outer || (outer.points.length < 3 && !outer.circle)) throw new Error('the board outline has fewer than three points');
  if (boardLoops.length > 1) warnings.push(`${boardLoops.length - 1} board cut-out(s) left out (bodies cannot have holes)`);
  const library = libraryText ? parseIdfLibrary(libraryText) : new Map();
  // Placements: "package part refdes" then "x y offset rotation side status".
  const placed = [];
  const placement = all.find((s) => s.name === 'PLACEMENT');
  const rows = placement?.rows ?? [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const [geometry, part, refdes] = fields(rows[i]);
    const [x, y, offset, rotation, side] = fields(rows[i + 1]);
    placed.push({ geometry, part, refdes, x: Number(x) * scale, y: Number(y) * scale, offset: (Number(offset) || 0) * scale, rotation: Number(rotation) || 0, side: String(side).toUpperCase() });
  }
  const missing = placed.filter((p) => !library.has(`${p.geometry}|${p.part}`));
  if (missing.length) warnings.push(`${missing.length} placed component(s) have no outline in the library file and were left out${libraryText ? '' : ' (no .emp library was given)'}`);
  // Component outlines in board coordinates (rotated about their origin; bottom-side parts mirrored in x).
  const comps = [];
  for (const p of placed) {
    const lib = library.get(`${p.geometry}|${p.part}`);
    if (!lib || !(lib.height > 0)) continue;
    const t = (p.rotation * Math.PI) / 180;
    const place = ([u, v]) => {
      const mu = p.side === 'BOTTOM' ? -u : u;
      return [p.x + mu * Math.cos(t) - v * Math.sin(t), p.y + mu * Math.sin(t) + v * Math.cos(t)];
    };
    const shape = lib.circle
      ? { shape: 'circle', ...(([cx, cy]) => ({ cx, cy }))(place([lib.circle.cx, lib.circle.cy])), r: lib.circle.r }
      : { shape: 'polygon', points: lib.outline.map(place) };
    if (shape.shape === 'polygon' && shape.points.length < 3) continue;
    comps.push({ ...p, lib, shape });
  }
  // Bounds in the board plane, moved so the lower-left corner sits one margin from the origin.
  const ptsOf = (s) => (s.shape === 'circle' ? [[s.cx - s.r, s.cy - s.r], [s.cx + s.r, s.cy + s.r]] : s.points);
  const boardShape = outer.circle ? { shape: 'circle', ...outer.circle } : { shape: 'polygon', points: outer.points };
  const pts = [boardShape, ...comps.map((c) => c.shape)].flatMap(ptsOf);
  const x0 = Math.min(...pts.map((p) => p[0]));
  const y0 = Math.min(...pts.map((p) => p[1]));
  const width0 = Math.max(...pts.map((p) => p[0])) - x0;
  const height0 = Math.max(...pts.map((p) => p[1])) - y0;
  const margin = Math.max(1, 0.02 * Math.max(width0, height0));
  const shift = (s) => (s.shape === 'circle' ? { ...s, cx: s.cx - x0 + margin, cy: s.cy - y0 + margin } : { ...s, points: s.points.map(([x, y]) => [x - x0 + margin, y - y0 + margin]) });
  const asRect = (s) => {
    if (s.shape !== 'polygon' || s.points.length !== 4) return s;
    const xs = [...new Set(s.points.map((p) => +p[0].toFixed(9)))];
    const ys = [...new Set(s.points.map((p) => +p[1].toFixed(9)))];
    return xs.length === 2 && ys.length === 2 ? { shape: 'rect', x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) } : s;
  };
  const below = Math.max(0, ...comps.filter((c) => c.side === 'BOTTOM').map((c) => c.offset + c.lib.height));
  const above = Math.max(0, ...comps.filter((c) => c.side !== 'BOTTOM').map((c) => c.offset + c.lib.height));
  const zBoard = below > 0 ? below + margin / 4 : margin / 4;
  const depth = zBoard + thickness + above + margin / 4;
  // Grid: about maxCells cells, the board at least two cells thick.
  const width = width0 + 2 * margin;
  const height = height0 + 2 * margin;
  const maxCells = options.maxCells ?? 400_000;
  const dz = Math.min(thickness / 2, depth / 8);
  const nz = Math.min(80, Math.max(4, Math.ceil(depth / dz)));
  const dxy = Math.sqrt((width * height * nz) / maxCells);
  const nx = Math.max(10, Math.round(width / dxy));
  const ny = Math.max(10, Math.round(height / dxy));
  const pcb = { ...materialFromLibrary('pcb4', language), id: 'pcb' };
  const emc = { ...materialFromLibrary('emc', language), id: 'emc' };
  const taken = [];
  const id = (prefix) => { const v = newId(prefix, taken); taken.push(v); return v; };
  const bodies = [{ id: id('board'), name: boardName || (language === 'en' ? 'Board' : '기판'), material: pcb.id, ...asRect(shift(boardShape)), z0: zBoard, z1: zBoard + thickness, power: 0 }];
  let totalPower = 0;
  for (const c of comps) {
    const z0 = c.side === 'BOTTOM' ? zBoard - c.offset - c.lib.height : zBoard + thickness + c.offset;
    const power = Number.isFinite(c.lib.props.POWER_OPR) ? c.lib.props.POWER_OPR : 0;
    totalPower += power;
    bodies.push({ id: id('c'), name: c.refdes || c.part, material: emc.id, ...asRect(shift(c.shape)), z0, z1: z0 + c.lib.height, power });
  }
  if (comps.length && !totalPower) warnings.push('no component has a POWER_OPR property — set the powers of the parts');
  const model = normalizeModel({
    name: boardName || (language === 'en' ? 'IDF import' : 'IDF 가져오기'),
    domain: { dim: 3, width: +width.toFixed(4), height: +height.toFixed(4), depth: +depth.toFixed(4), nx, ny, nz, background: null },
    materials: [pcb, emc],
    bodies,
    boundaries: [{ id: 'air', name: language === 'en' ? 'Air (convection)' : '공기 (대류)', target: 'exterior', type: 'convection', h: options.h ?? 10, Tinf: 25, emissivity: 0.9, Tamb: 25 }],
    ambient: 25,
    study: { type: 'steady' },
  });
  return { model, warnings };
}
