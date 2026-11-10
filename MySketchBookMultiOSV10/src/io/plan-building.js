// Whole buildings from other programs (IFC, Sweet Home 3D) → project entities. The readers
// (plan-ifc.js, plan-sh3d.js) turn their file into one neutral "building" (metres, plan axes
// [x, z], z down on the plan like the app); this module puts it into a project in one change:
// levels by elevation, walls (curved walls as chains of short walls, like plan-arc.js), doors and
// windows on their host wall as library openings, rooms with their names and colours, stairs and
// furniture as library items (or imported models). Pure (no DOM, no three).
//
// A building:
//   { format, name,
//     levels:   [{ key, name, elevation, height }],
//     walls:    [{ key, level, a, b, thickness, height | null, arc?: { c, r, a0, a1 } }]   (arc: the wall follows it)
//     openings: [{ level, wall? (key), kind: 'door' | 'window', name, center, width, height, sill, facing? [x, z], hinge? }]
//     rooms:    [{ level, name, points, floorColor?, ceilingColor? }]
//     objects:  [{ level, name, hints, center, elevation, rotation, size: [w, h, d], item?, params?, model? }]
//     warnings: [] }
import { planEntities, floorForName } from './plan-build.js';
import { arcWallSegments } from './plan-arc.js';
import { openingDefaults, blockKind } from './plan-recognize.js';
import { newId } from '../engine/document.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Door or window from a name (any language the programs use) and its sill: 'door' | 'window'. */
export function openingKindOf(name = '', sill = 0) {
  const n = String(name);
  if (/window|fen[eê]tre|fenster|ventana|finestra|창(?!고)|skylight|velux|hatch|guichet/i.test(n)) return 'window';
  if (/door|porte|t[üu]r|puerta|문|門|gate|portail/i.test(n)) return 'door';
  return sill > 0.3 ? 'window' : 'door';
}

/** The library item of a door or window from its kind, width, height and name. */
export function openingItem(kind, width, name = '', height = 2.1) {
  const n = String(name);
  if (kind === 'window') {
    if (/french|porte.?fen|프렌치|patio/i.test(n) || height >= 1.9) return width >= 2.4 ? 'window-sliding-balcony' : width >= 1.0 ? 'door-french' : 'window-french';
    if (/round|circle|circular|porthole|oeil|hublot|원형/i.test(n)) return 'window-round';
    if (/roof|velux|skylight|천창|dachfenster/i.test(n)) return 'window-roof';
    if (/slid|coulis|미닫|미서기|schiebe/i.test(n)) return 'window-sliding';
    if (/double.?hung|guillotine|sash/i.test(n)) return 'window-double-hung';
    if (/fixed|fixe|고정|picture|festverglas/i.test(n)) return 'window-fixed';
    if (/awning|hopper|imposte|soupirail/i.test(n)) return 'window-awning';
    return openingDefaults('window', width).item;
  }
  if (/garage|sectional|roll.?up/i.test(n)) return 'door-garage';
  if (/french|patio|porte.?fen/i.test(n)) return 'door-french';
  if (/front|entr|main|현관|haust[üu]r|d'entr/i.test(n)) return 'door-entrance';
  const block = blockKind(n);
  if (block && block.kind !== 'door' && block.kind !== 'window') return openingDefaults(block.kind, width).item;
  if (/double|양개|dbl|zweifl/i.test(n) || width >= 1.4) return 'door-double';
  if (/opening|passage|arch|ouverture|개구부/i.test(n)) return 'door-cased-opening';
  return 'door-single';
}

/** Centre of all the walls of a building (plan [x, z]). */
export function buildingCenter(building) {
  const pts = building.walls.flatMap((w) => [w.a, w.b]);
  if (!pts.length) return [0, 0];
  const xs = pts.map((p) => p[0]); const zs = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
}

/** A wall as straight pieces (curved walls: plan-arc.js pieces carrying the whole arc). */
function wallPieces(w) {
  if (!w.arc) return [{ a: w.a, b: w.b, thickness: w.thickness }];
  const { c, r, a0, a1 } = w.arc;
  return arcWallSegments(c, r, a0, a1).map((s) => ({ a: s.a, b: s.b, thickness: w.thickness, curve: { id: w.key, cx: c[0], cz: c[1], r, a0, a1 } }));
}

/** The wall piece an opening sits in: { index, offset, side } or null. */
export function hostPiece(pieces, opening) {
  let best = null;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (opening.wallKey && p.key !== opening.wallKey) continue;
    const d = [p.b[0] - p.a[0], p.b[1] - p.a[1]];
    const L = Math.hypot(d[0], d[1]);
    if (L < 1e-6) continue;
    const u = [d[0] / L, d[1] / L];
    const v = [opening.center[0] - p.a[0], opening.center[1] - p.a[1]];
    const t = v[0] * u[0] + v[1] * u[1];
    const off = Math.abs(v[0] * -u[1] + v[1] * u[0]);
    const outside = t < 0 ? -t : t > L ? t - L : 0;
    const score = off + outside * 4;
    if (off > p.thickness / 2 + 0.6 || outside > 0.3) continue;
    if (!best || score < best.score) best = { index: i, t, L, u, score };
  }
  if (!best) return null;
  const p = pieces[best.index];
  const half = Math.min(opening.width / 2, best.L / 2);
  const offset = Math.max(half, Math.min(best.L - half, best.t));
  const n = [-best.u[1], best.u[0]]; // the wall's left side (walls.js)
  const side = opening.facing ? (opening.facing[0] * n[0] + opening.facing[1] * n[1] >= 0 ? 'left' : 'right') : 'left';
  return { index: best.index, offset, side, piece: p };
}

/**
 * Puts a building into a project (call inside one change). `target`: 'new' (the project is empty: its level is
 * replaced by the building's) or 'add' (levels at the same elevation are shared, others added).
 * `matchItem(object)` → { item, params?, scale? } | null places furniture (null: left out, counted as skipped);
 * `colorMaterial(hex, use)` → a material id for room colours (null: from the room name).
 * Returns { levels, walls, doors, windows, openings, rooms, objects, skipped, levelIds }.
 */
export function applyBuilding(project, building, { target = 'new', matchItem = null, colorMaterial = null, furniture = true, rooms: withRooms = true } = {}) {
  // Levels
  const byKey = new Map();
  const levels = [...(building.levels.length ? building.levels : [{ key: '_', name: '1F', elevation: 0, height: 2.5 }])].sort((a, b) => a.elevation - b.elevation);
  const emptyProject = target === 'new' && !project.walls.length && !project.objects.length && project.levels.length === 1;
  if (emptyProject) project.levels = [];
  for (const l of levels) {
    let level = project.levels.find((x) => Math.abs(x.elevation - l.elevation) < 0.05);
    if (!level) { level = { id: newId('lv'), name: l.name || `${project.levels.length + 1}F`, elevation: l.elevation, height: l.height }; project.levels.push(level); }
    else if (emptyProject) level.height = l.height;
    byKey.set(l.key, level);
  }
  project.levels.sort((a, b) => a.elevation - b.elevation);
  const levelOf = (key) => byKey.get(key) ?? byKey.get(levels[0].key);
  project.activeLevel = levelOf(levels[0].key).id;

  // One shift for the whole building: centred on the origin (or lined up with an earlier import).
  const center = buildingCenter(building);
  const shift = target === 'add' && Array.isArray(project.planShift) ? project.planShift : [-center[0], -center[1]];
  if (!Array.isArray(project.planShift)) project.planShift = shift;
  const mv = (p) => [p[0] + shift[0], p[1] + shift[1]];

  const counts = { levels: byKey.size, walls: 0, doors: 0, windows: 0, openings: 0, rooms: 0, objects: 0, skipped: 0 };
  for (const l of levels) {
    const level = levelOf(l.key);
    const walls = building.walls.filter((w) => (byKey.has(w.level) ? w.level : levels[0].key) === l.key);
    const pieces = [];
    const owner = [];
    for (const w of walls) for (const p of wallPieces(w)) { pieces.push({ ...p, key: w.key }); owner.push(w); }
    const openings = [];
    for (const o of building.openings.filter((x) => (byKey.has(x.level) ? x.level : levels[0].key) === l.key)) {
      const host = hostPiece(pieces, { center: o.center, width: o.width, facing: o.facing, wallKey: o.wall && pieces.some((p) => p.key === o.wall) ? o.wall : null }) ?? hostPiece(pieces, { center: o.center, width: o.width, facing: o.facing });
      if (!host) { counts.skipped += 1; continue; }
      const item = o.item ?? openingItem(o.kind, o.width, o.name, o.height);
      openings.push({ wall: host.index, item, offset: host.offset, width: o.width, height: o.height, sill: Math.max(0, o.sill ?? 0), side: host.side, ...(o.hinge ? { hinge: o.hinge } : {}) });
    }
    const roomsHere = withRooms ? building.rooms.filter((r) => (byKey.has(r.level) ? r.level : levels[0].key) === l.key && r.points?.length >= 3) : [];
    const result = { walls: pieces.map((p) => ({ a: p.a, b: p.b, thickness: p.thickness, ...(p.curve ? { curve: p.curve } : {}) })), openings, texts: [], leftovers: [] };
    const built = planEntities(result, { level: level.id, shift, elevation: level.elevation, keepLeftovers: false });
    built.walls.forEach((w, i) => { const h = owner[i].height; if (h != null && Math.abs(h - level.height) > 0.01) w.height = h; });
    let rooms = withRooms ? built.rooms : [];
    if (roomsHere.length) {
      rooms = roomsHere.map((r) => ({
        id: newId('rm'), level: level.id, name: r.name ?? '', points: r.points.map(mv),
        floor: (r.floorColor && colorMaterial?.(r.floorColor, 'floor')) || floorForName(r.name ?? ''),
        ceiling: (r.ceilingColor && colorMaterial?.(r.ceilingColor, 'ceiling')) || 'wall-paint-white', showCeiling: false,
      }));
    }
    for (const r of rooms) delete r.guess;
    project.walls.push(...built.walls);
    project.openings.push(...built.openings);
    project.rooms.push(...rooms);
    counts.walls += built.walls.length;
    counts.openings += built.openings.length;
    counts.doors += built.openings.filter((o) => o.item.startsWith('door-') && o.item !== 'door-cased-opening').length;
    counts.windows += built.openings.filter((o) => o.item.startsWith('window')).length;
    counts.rooms += rooms.length;
  }

  // Stairs and furniture
  for (const o of furniture ? building.objects : building.objects.filter((x) => x.item === 'stairs')) {
    const match = o.item ? { item: o.item, params: o.params ?? {}, scale: o.scale ?? [1, 1, 1] } : matchItem?.(o) ?? null;
    if (!match?.item) { counts.skipped += 1; continue; }
    const level = levelOf(o.level);
    const c = mv(o.center);
    project.objects.push({
      id: newId('ob'), level: level.id, item: match.item, params: match.params ?? {}, position: [c[0], o.elevation ?? 0, c[1]], rotation: [0, o.rotation ?? 0, 0],
      scale: match.scale ?? [1, 1, 1], materials: {}, tag: 'untagged', name: o.name ?? '',
    });
    counts.objects += 1;
  }
  return { ...counts, levelIds: levels.map((l) => levelOf(l.key).id) };
}

/**
 * The library stairs for a straight flight of `size` [width, rise, length] (m): { item, params: { width, rise, run } }.
 * The going is the length over the treads (risers at most 0.19 m, like engine/stairs.js).
 */
export function stairsItem(size) {
  const [width, rise, length] = size;
  const n = Math.max(2, Math.ceil(rise / 0.19 - 1e-9));
  const run = Math.max(0.15, Math.min(0.45, length / Math.max(1, n - 1)));
  const r = (v) => Math.round(v * 1000) / 1000;
  return { item: 'stairs', params: { width: r(Math.max(0.5, Math.min(3, width))), rise: r(rise), run: r(run) } };
}

/**
 * Fits a library item to a size: params width / length / depth / height when the item has them (within their range),
 * the rest by scale. `item` = { size: [w, h, d], params: [{ key, min, max, default }] }. Returns { params, scale }.
 */
export function fitItem(item, size) {
  const params = {};
  const base = [...(item.size ?? [1, 1, 1])];
  const p = (key) => item.params?.find((x) => x.key === key && x.type !== 'enum');
  const set = (axis, keys) => {
    for (const key of keys) {
      const def = p(key);
      if (!def || !(size[axis] > 0)) continue;
      const v = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, size[axis]));
      if (Math.abs(v - size[axis]) > 0.01) continue;
      // The default size grows with the parameter (a parametric item is built at its parameters).
      base[axis] += v - (def.default ?? base[axis]);
      params[key] = Math.round(v * 1000) / 1000;
      return;
    }
  };
  set(0, ['width', 'length']);
  set(2, ['depth']);
  set(1, ['height']);
  const scale = [0, 1, 2].map((i) => (size[i] > 0 && base[i] > 0 ? Math.round((size[i] / base[i]) * 1000) / 1000 : 1));
  return { params, scale };
}
