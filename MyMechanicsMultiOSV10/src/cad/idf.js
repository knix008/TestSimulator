// IDF (Intermediate Data Format, versions 2.0 and 3.0) — the board file (.emn / .brd: board outline and thickness,
// cutouts, drilled holes, keep-outs and component placement) and the library file (.emp / .lib: each package's
// outline and height). An imported board becomes an assembly: the board (its outline and holes as a sketch,
// extruded by the thickness, FR-4) and a part per package (its outline extruded by its height), placed by reference
// designator on the top or bottom side (a bottom-side part turned over about the board's Y axis), rotated about Z
// and raised by its mounting offset.
//
// A loop is a list of records "label x y angle": a straight segment to the point when the angle is 0, an arc of
// that included angle (degrees, counter-clockwise when positive) from the previous point otherwise, and a full
// circle when the angle is 360 (the previous point is then its centre).
import { itemsToSketch } from './cad2d-import.js';
import { createFeature } from './features.js';
import { createPart, createAssembly, createProject } from './document.js';

const MIL = 0.0254;

/** Tokens of a line: words and "quoted strings". */
function tokens(line) {
  const out = []; const re = /"([^"]*)"|(\S+)/g; let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]);
  return out;
}

/** The sections of an IDF file: [{ name ('.BOARD_OUTLINE'), args (after the name), lines: [tokens …] }]. */
export function idfSections(text) {
  const sections = []; let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^\.END_/i.test(line)) { cur = null; continue; }
    if (line.startsWith('.') && !cur) { const [name, ...args] = tokens(line); cur = { name: name.toUpperCase(), args, lines: [] }; sections.push(cur); continue; }
    if (line.startsWith('.') && cur && /^\.PROP\b/i.test(line)) { (cur.props ??= []).push(tokens(line).slice(1)); continue; }
    if (cur) cur.lines.push(tokens(line));
  }
  return sections;
}

/** Loops of loop records [[label, x, y, angle] …] (scaled): { label → [{ x, y, angle } …] } in file order. */
function loopsOf(rows, k) {
  const loops = new Map();
  for (const r of rows) {
    if (r.length < 4) continue;
    const label = Number(r[0]); const x = Number(r[1]) * k; const y = Number(r[2]) * k; const angle = Number(r[3]);
    if (![label, x, y, angle].every(Number.isFinite)) continue;
    if (!loops.has(label)) loops.set(label, []);
    loops.get(label).push({ x, y, angle });
  }
  return [...loops.entries()].map(([label, pts]) => ({ label, pts }));
}

/** Sketch items (lines, three-point arcs, circles) of a loop. */
export function loopItems(pts) {
  const items = [];
  for (let i = 1; i < pts.length; i++) {
    const P = pts[i - 1]; const Q = pts[i];
    if (Math.abs(Math.abs(Q.angle) - 360) < 1e-6) {
      items.push({ kind: 'circle', c: [P.x, P.y], r: Math.hypot(Q.x - P.x, Q.y - P.y) });
      i += 1; // the next record starts a new piece (a circle is a loop of its own)
      continue;
    }
    if (Math.hypot(Q.x - P.x, Q.y - P.y) < 1e-9) continue;
    if (Math.abs(Q.angle) < 1e-9) { items.push({ kind: 'line', a: [P.x, P.y], b: [Q.x, Q.y] }); continue; }
    // An arc of the included angle θ from P to Q: its centre lies off the chord's middle (left of P→Q when θ > 0).
    const th = (Q.angle * Math.PI) / 180;
    const mx = (P.x + Q.x) / 2; const my = (P.y + Q.y) / 2;
    const cx0 = Q.x - P.x; const cy0 = Q.y - P.y; const chord = Math.hypot(cx0, cy0);
    const d = chord / 2 / Math.tan(th / 2);
    const nx = -cy0 / chord; const ny = cx0 / chord;
    const c = [mx + nx * d, my + ny * d];
    const r = Math.hypot(P.x - c[0], P.y - c[1]);
    const a0 = Math.atan2(P.y - c[1], P.x - c[0]) + th / 2;
    items.push({ kind: 'arc3', pts: [[P.x, P.y], [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], [Q.x, Q.y]] });
  }
  return items;
}

/** The units factor (to mm) of a header line: MM, THOU / MILS, INCH (IDF 2.0 also writes them after the name). */
function unitsOf(words) {
  const u = words.map((w) => String(w).toUpperCase()).find((w) => ['MM', 'THOU', 'MIL', 'MILS', 'INCH', 'IN', 'TNM'].includes(w));
  if (u === 'THOU' || u === 'MIL' || u === 'MILS') return MIL;
  if (u === 'INCH' || u === 'IN') return 25.4;
  if (u === 'TNM') return 1e-5;
  return 1;
}

/**
 * A board file: { version, name, units (mm per unit), thickness, outline: [loop …] (label 0 = the board, others
 * cutouts), holes: [{ d, x, y, plating, refdes, type }], placements: [{ pkg, partNo, refdes, x, y, offset, rotation,
 * side, status }], keepouts: [{ kind, side, height, loops }], notes }.
 */
export function readIdfBoard(text) {
  const secs = idfSections(text);
  const head = secs.find((s) => s.name === '.HEADER');
  if (!head) throw Object.assign(new Error('no .HEADER'), { code: 'idf-bad' });
  const first = head.lines[0] ?? [];
  if (!/BOARD_FILE|PANEL_FILE/i.test(first[0] ?? '')) throw Object.assign(new Error('not an IDF board file'), { code: 'idf-bad' });
  const version = Number(first[1]) || 3;
  const second = head.lines[1] ?? [];
  const k = unitsOf(second.slice(1));
  const out = { version, name: second[0] ?? 'board', units: k, thickness: 1.6, outline: [], holes: [], placements: [], keepouts: [], notes: [] };
  for (const s of secs) {
    if (s.name === '.BOARD_OUTLINE' || s.name === '.PANEL_OUTLINE') {
      out.thickness = Number(s.lines[0]?.[0]) * k || out.thickness;
      out.outline = loopsOf(s.lines.slice(1), k);
    } else if (s.name === '.DRILLED_HOLES') {
      for (const r of s.lines) {
        const [d, x, y, plating, refdes, type] = r;
        if (Number.isFinite(Number(d))) out.holes.push({ d: Number(d) * k, x: Number(x) * k, y: Number(y) * k, plating: plating ?? 'NPTH', refdes: refdes ?? 'BOARD', type: type ?? 'OTHER' });
      }
    } else if (s.name === '.PLACEMENT') {
      for (let i = 0; i + 1 < s.lines.length; i += 2) {
        const [pkg, partNo, refdes] = s.lines[i]; const [x, y, offset, rotation, side, status] = s.lines[i + 1];
        out.placements.push({ pkg, partNo, refdes, x: Number(x) * k, y: Number(y) * k, offset: (Number(offset) || 0) * k, rotation: Number(rotation) || 0, side: /BOTTOM/i.test(side ?? '') ? 'bottom' : 'top', status: (status ?? 'PLACED').toUpperCase() });
      }
    } else if (/^\.(ROUTE|PLACE|VIA)_(KEEPOUT|OUTLINE|REGION)$|^\.OTHER_OUTLINE$/.test(s.name)) {
      // Keep-outs and other outlines: a side (TOP / BOTTOM / BOTH), a height for placement ones, loops.
      const side = (s.name === '.OTHER_OUTLINE' ? s.lines[0]?.[1] : s.lines[0]?.[0]) ?? 'TOP';
      const height = Number(s.name === '.OTHER_OUTLINE' ? s.lines[0]?.[0] : s.lines[0]?.[1]) * k || 0;
      out.keepouts.push({ kind: s.name.slice(1).toLowerCase(), side: String(side).toLowerCase(), height, loops: loopsOf(s.lines.slice(1), k) });
    } else if (s.name === '.NOTES') {
      for (const r of s.lines) out.notes.push({ x: Number(r[0]) * k, y: Number(r[1]) * k, size: Number(r[2]) * k, text: r.slice(4).join(' ') });
    }
  }
  if (!out.outline.length) throw Object.assign(new Error('no board outline'), { code: 'idf-no-outline' });
  return out;
}

/** A library file: Map(geometry + part number → { geometry, partNo, kind, height, loops, props }). */
export function readIdfLibrary(text) {
  const lib = new Map();
  for (const s of idfSections(text)) {
    if (s.name !== '.ELECTRICAL' && s.name !== '.MECHANICAL') continue;
    const [geometry, partNo, units, height] = s.lines[0] ?? [];
    const k = unitsOf([units]);
    const item = { geometry, partNo, kind: s.name.slice(1).toLowerCase(), height: (Number(height) || 0) * k, loops: loopsOf(s.lines.slice(1), k), props: Object.fromEntries((s.props ?? []).map((p) => [p[0], p.slice(1).join(' ')])) };
    lib.set(`${geometry}\u0000${partNo}`, item);
    if (!lib.has(geometry)) lib.set(geometry, item);
  }
  return lib;
}

/** The quaternion [x, y, z, w] of a turn by `deg` about Z, after turning over about Y when on the bottom. */
export function placementRotation(deg, bottom) {
  const h = (deg * Math.PI) / 360;
  const qz = [0, 0, Math.sin(h), Math.cos(h)];
  if (!bottom) return qz;
  const qy = [0, 1, 0, 0]; // 180° about Y
  // qz · qy
  const [ax, ay, az, aw] = qz; const [bx, by, bz, bw] = qy;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/** The sketch (all loops on the top plane) of loops and extra circles. */
function sketchOf(loops, circles = []) {
  const items = loops.flatMap((l) => loopItems(l.pts));
  for (const c of circles) items.push({ kind: 'circle', c: [c.x, c.y], r: c.d / 2 });
  return itemsToSketch(items).sketch;
}

/**
 * The project pieces of a board (and its library): { board: { name, sketch, thickness }, packages: [{ key, name,
 * sketch, height, kind }], placements: [{ key, refdes, position, rotation }], missing: [refdes …], holes,
 * keepouts }. Holes of the board (not of a part pad's plating only) cut through it.
 */
export function idfModel(board, lib = new Map(), { placedOnly = false } = {}) {
  const t = board.thickness;
  const boardSketch = sketchOf(board.outline, board.holes.filter((h) => h.d > 0));
  const packages = new Map(); const placements = []; const missing = [];
  for (const p of board.placements) {
    if (placedOnly && p.status === 'UNPLACED') continue;
    const item = lib.get(`${p.pkg}\u0000${p.partNo}`) ?? lib.get(p.pkg);
    if (!item || !item.loops.length || !(item.height > 0)) { missing.push(p.refdes); continue; }
    const key = `${item.geometry}\u0000${item.partNo}`;
    if (!packages.has(key)) packages.set(key, { key, name: item.geometry, partNo: item.partNo, sketch: sketchOf(item.loops), height: item.height, kind: item.kind, props: item.props });
    const bottom = p.side === 'bottom';
    placements.push({ key, refdes: p.refdes, partNo: p.partNo, position: [p.x, p.y, bottom ? -p.offset : t + p.offset], rotation: placementRotation(p.rotation, bottom), side: p.side });
  }
  return { board: { name: board.name, sketch: boardSketch, thickness: t }, packages: [...packages.values()], placements, missing, holes: board.holes, keepouts: board.keepouts };
}

/** A part of an outline sketch on the top plane extruded by `depth`. */
function extrudedPart(name, sketch, depth, extra = {}) {
  const part = createPart(name, extra);
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...structuredClone(sketch) });
  part.features.push(sk);
  part.features.push(createFeature(part, 'extrude', { sketch: sk.id, op: 'boss', end: 'blind', depth }));
  return part;
}

/**
 * A new project of an IDF model: the board part (FR-4, green), a part per package (its height; electrical dark grey,
 * mechanical light grey) and an assembly with the board fixed at the origin and every placed component, named by
 * reference designator, fixed where the board file puts it.
 */
export function idfProject(model, name = model.board.name || 'board') {
  const p = createProject({ name, kind: 'none' });
  const board = extrudedPart(model.board.name || 'Board', model.board.sketch, model.board.thickness, { material: 'fr4', color: '#2f7d3a', description: 'PCB' });
  p.parts.push(board);
  const partOf = new Map();
  for (const pk of model.packages) {
    const part = extrudedPart(pk.name, pk.sketch, pk.height, { partNo: pk.partNo ?? '', color: pk.kind === 'mechanical' ? '#b8bec6' : '#3a3f46', material: 'abs', description: Object.entries(pk.props ?? {}).map(([k, v]) => `${k}=${v}`).join('; ') });
    p.parts.push(part); partOf.set(pk.key, part);
  }
  const asm = createAssembly(name);
  asm.components.push({ id: `cmp-${board.id}`, name: `${board.name}<1>`, part: board.id, position: [0, 0, 0], rotation: [0, 0, 0, 1], fixed: true });
  model.placements.forEach((pl, i) => {
    const part = partOf.get(pl.key);
    if (part) asm.components.push({ id: `cmp-${i}-${part.id}`, name: pl.refdes || `${part.name}<${i + 1}>`, part: part.id, position: pl.position, rotation: pl.rotation, fixed: true, refdes: pl.refdes, side: pl.side });
  });
  p.assemblies.push(asm);
  p.active = { kind: 'assembly', id: asm.id };
  return p;
}
