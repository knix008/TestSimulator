// MyArchitecture projects (.myarch) → a building (plan-building.js). A .myarch file is one JSON
// document ({ format: "myarch", version: 1, levels, walls, openings, rooms, stairs, columns,
// furniture, … }) written by MyArchitecture V10 (Electron) and V20 (Tauri) alike.
//
// Units: millimetres. Plan x to the right, plan y down the screen (the same way round as the app's
// plan z), heights separate. Walls are centre lines (x1, y1)–(x2, y2). An opening sits on its wall
// `at` mm from the wall's start to its centre, `sill` above the floor; it opens towards the wall's
// left normal (−dy, dx) times `side`, hinged at the jamb nearer the wall's `hinge` end ("start" /
// "end"). Rotations are degrees, clockwise on the plan; a piece's back is its local −y.
// Items of a design option that is not the active one, and demolished items, are left out.
// Pure (no DOM, no three), works in Node.
import { stairsItem } from './plan-building.js';

export const isMyarchName = (name) => /\.myarch$/i.test(name ?? '');

const MM = 0.001;
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const mm = (v, d = 0) => num(v, d) * MM;
const DEG = Math.PI / 180;

/** The library item of a MyArchitecture door / window / opening type. */
export function myarchOpeningItem(kind, type, width) {
  if (kind === 'opening') return 'door-cased-opening';
  if (kind === 'window') return ({ fixed: 'window-fixed', sliding: 'window-sliding', casement: 'window-casement' })[type] ?? 'window-casement';
  if (type === 'double') return 'door-double';
  if (type === 'sliding') return 'door-sliding';
  if (type === 'garage') return 'door-garage';
  return width >= 1.4 ? 'door-double' : 'door-single';
}

/** The parsed project, or a coded error. */
export function parseMyarch(source) {
  const text = typeof source === 'string' ? source : new TextDecoder('utf-8').decode(source instanceof Uint8Array ? source : new Uint8Array(source));
  let p;
  try { p = JSON.parse(text.replace(/^﻿/, '')); } catch (error) { throw Object.assign(new Error(`Not a MyArchitecture project (${error.message})`), { code: 'myarch-invalid' }); }
  if (!p || typeof p !== 'object' || (p.format != null && p.format !== 'myarch') || (!Array.isArray(p.levels) && !Array.isArray(p.walls))) {
    throw Object.assign(new Error('Not a MyArchitecture project'), { code: 'myarch-invalid' });
  }
  return p;
}

/**
 * A .myarch file (bytes or text) → { building, project (the parsed file), counts: { skipped kinds } }.
 * The building follows plan-building.js (metres, plan [x, z]).
 */
export function readMyarch(source) {
  const p = parseMyarch(source);
  const list = (k) => (Array.isArray(p[k]) ? p[k] : []);
  // Design options: only the active option of each set is shown (MyArchitecture's hiddenOptions).
  const hidden = new Set();
  for (const s of list('designOptions')) for (const o of s?.options ?? []) if (o.id !== s.active) hidden.add(o.id);
  const shown = (it) => it && !(it.option && hidden.has(it.option)) && it.phase !== 'demolish';

  const defaults = p.defaults ?? {};
  const building = { format: 'myarch', name: p.meta?.title ?? p.name ?? '', levels: [], walls: [], openings: [], rooms: [], objects: [], warnings: [] };
  const counts = { roofs: list('roofs').length, slabs: list('slabs').length, ceilings: list('ceilings').length, beams: list('beams').length, railings: list('railings').length, ramps: list('ramps').length, solids: list('solids').length, members: list('members').length };

  // Levels (sorted by elevation; none: one ground level)
  for (const l of list('levels')) building.levels.push({ key: l.id, name: l.name ?? '', elevation: mm(l.elevation), height: mm(l.height, num(defaults.wallHeight, 2800)) });
  building.levels.sort((a, b) => a.elevation - b.elevation);
  if (!building.levels.length) building.levels.push({ key: '_', name: '1F', elevation: 0, height: mm(defaults.wallHeight, 2800) });
  const levelKey = (it) => (building.levels.some((l) => l.key === it?.level) ? it.level : building.levels[0].key);
  const levelOf = (key) => building.levels.find((l) => l.key === key) ?? building.levels[0];

  // Walls: the thickness written on the wall, else the sum of its type's layers, else the default
  const types = new Map(list('wallTypes').map((t) => [t.id, t]));
  const typeThickness = (id) => { const t = types.get(id); const s = (t?.layers ?? []).reduce((a, x) => a + num(x.thickness), 0); return s > 0 ? s : null; };
  const walls = new Map();
  for (const w of list('walls')) {
    if (!shown(w)) continue;
    const a = [mm(w.x1), mm(w.y1)]; const b = [mm(w.x2), mm(w.y2)];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) continue;
    const level = levelKey(w);
    const thickness = Math.max(0.02, mm(num(w.thickness, 0) || typeThickness(w.type) || num(defaults.wallThickness, 200)));
    const height = w.height != null ? mm(w.height) : levelOf(level).height;
    const wall = { key: w.id, level, a, b, thickness, height };
    walls.set(w.id, { wall, src: w });
    building.walls.push(wall);
  }

  // Doors, windows and plain openings on their walls
  for (const o of list('openings')) {
    const host = walls.get(o.wall);
    if (!host || !shown(o)) continue;
    const w = host.src;
    const dx = num(w.x2) - num(w.x1); const dy = num(w.y2) - num(w.y1);
    const L = Math.hypot(dx, dy);
    if (L < 1) continue;
    const u = [dx / L, dy / L];
    const n = [-u[1], u[0]]; // the wall's left side (the same formula as the app's walls.js)
    const kind = o.kind === 'window' ? 'window' : o.kind === 'opening' ? 'opening' : 'door';
    const width = mm(o.width, kind === 'window' ? 1200 : 900);
    const at = Math.min(L - num(o.width) / 2, Math.max(num(o.width) / 2, num(o.at, L / 2)));
    const center = [mm(num(w.x1) + u[0] * at), mm(num(w.y1) + u[1] * at)];
    const side = num(o.side, 1) < 0 ? -1 : 1;
    const facing = [n[0] * side, n[1] * side];
    // In the app the item's −x jamb is towards the wall's start when it faces the left side, towards the end
    // when it faces the right side (plan-building hostPiece picks the side from `facing`).
    const atStart = o.hinge !== 'end';
    const hinge = (side > 0) === atStart ? 'left' : 'right';
    building.openings.push({
      level: host.wall.level, wall: o.wall, kind: kind === 'window' ? 'window' : 'door', name: `${o.type ?? ''} ${kind}`.trim(),
      item: myarchOpeningItem(kind, o.type, width), center, width, height: mm(o.height, kind === 'window' ? 1200 : 2100), sill: mm(o.sill, kind === 'window' ? 900 : 0),
      facing, ...(kind === 'door' && o.type !== 'sliding' && o.type !== 'garage' ? { hinge } : {}),
      // The type and the swing are MyArchitecture's own: no entrance door swapped in on outside walls.
      exactItem: true,
    });
  }

  // Rooms
  for (const r of list('rooms')) {
    if (!shown(r) || !Array.isArray(r.pts) || r.pts.length < 3) continue;
    building.rooms.push({ level: levelKey(r), name: [r.number, r.name].filter(Boolean).join(' '), points: r.pts.map(([x, y]) => [mm(x), mm(y)]) });
  }

  // Stairs: a straight flight from the level to the next one (L / U / spiral stairs as one straight flight of the
  // same length). MyArchitecture's stairs climb along their local +x; the library stairs climb towards −z.
  const elevations = building.levels.map((l) => l.elevation);
  for (const s of list('stairs')) {
    if (!shown(s)) continue;
    const level = levelOf(levelKey(s));
    const next = elevations.find((e) => e > level.elevation + 0.01);
    const rise = next != null ? next - level.elevation : level.height;
    const length = mm(s.length, 3600) + (s.shape === 'L' || s.shape === 'U' ? mm(s.length2 ?? s.length, 0) / 2 : 0);
    const a = num(s.rot) * DEG;
    if (s.shape && s.shape !== 'straight') building.warnings.push(`stairs-${s.shape}`);
    building.objects.push({
      level: level.key, name: '', hints: 'stairs', center: [mm(s.x), mm(s.y)], elevation: 0,
      rotation: Math.atan2(-Math.cos(a), -Math.sin(a)), size: [mm(s.width, 1000), rise, length], ...stairsItem([mm(s.width, 1000), rise, length]),
    });
  }

  // Columns: the library column at the level's height
  for (const c of list('columns')) {
    if (!shown(c)) continue;
    const level = levelOf(levelKey(c));
    const round = c.shape === 'round';
    const w = mm(c.w, 400); const d = mm(c.d ?? c.w, 400);
    const shape = round ? 'round' : Math.abs(w - d) < 0.005 ? 'square' : 'rect';
    building.objects.push({
      level: level.key, name: '', hints: 'column', center: [mm(c.x), mm(c.y)], elevation: 0, rotation: -num(c.rot) * DEG, size: [w, level.height, d],
      item: 'column', params: { shape, size: w, depth: d, fitLevel: c.height == null, height: c.height != null ? mm(c.height) : level.height, trim: false, material: 'wall-paint-white' },
    });
  }

  // Furniture: matched to the library by its kind ("doubleBed", "sofa3", "ceilingLight" …) and size
  for (const f of list('furniture')) {
    if (!shown(f) || f.kind === 'model' || f.kind === 'component') { if (shown(f) && (f.kind === 'model' || f.kind === 'component')) building.warnings.push(`furniture-${f.kind}`); continue; }
    building.objects.push({
      // `kind` ("doubleBed", "sofa3") finds the library item; the name shown is the user's own, if any.
      level: levelKey(f), name: f.name || '', hints: [f.kind, f.typeId].filter(Boolean).join(' '),
      center: [mm(f.x), mm(f.y)], elevation: mm(f.elevation), rotation: -num(f.rot) * DEG,
      size: [mm(f.w, 500), mm(f.h, 500), mm(f.d, 500)],
    });
  }
  return { building, project: p, counts };
}
