// Recognised floor plan → project entities: walls and openings on a level, rooms
// found from the wall centre lines (walls.js detectRoom, like the templates) and
// named after the texts inside them, the entrance door on the outside wall, and
// the lines that are no wall, door or window kept as reference lines (guides).
// Pure (no DOM); walls.js brings three's math only.
import { newId, polygonArea } from '../engine/document.js';
import { detectRoom, pointInPolygon } from '../engine/walls.js';

// Curved walls: the recognizer builds them with the same segmenting rule as user-drawn arc walls
// (≤ 0.3 m, chord error ≤ 1 cm, `curve` on every piece); the helper lives in plan-arc.js (pure).
export { arcWallSegments, arcSegmentCount } from './plan-arc.js';

/**
 * A name for a room found without a label (pictures): its kind from size and shape — the biggest room is the
 * living room, long narrow ones corridors, small ones bathrooms or storage, the rest bedrooms / rooms.
 * Returns a key of the room.* strings ('living', 'bedroom', 'bath', 'hall', 'storage', 'room').
 */
export function roomKindGuess(points, { largest = 0 } = {}) {
  const area = polygonArea(points);
  const xs = points.map((p) => p[0]); const zs = points.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs); const d = Math.max(...zs) - Math.min(...zs);
  const short = Math.min(w, d); const long = Math.max(w, d);
  if (largest > 0 && area >= largest - 1e-6 && area >= 12) return 'living';
  if (short <= 1.6 && long >= short * 2.2) return 'hall';
  if (area < 2.2) return 'storage';
  if (area < 5.5) return 'bath';
  if (area >= 7) return 'bedroom';
  return 'room';
}

/** Floor finish from a room name (Korean and English plan labels). */
export function floorForName(name = '') {
  if (/욕실|화장실|샤워|bath|toilet|wc|shower|restroom|lavatory/i.test(name)) return 'tile-grey';
  if (/다용도|세탁|보일러|발코니|베란다|laundry|utility|balcony|storage|창고/i.test(name)) return 'tile-grey';
  if (/주방|부엌|kitchen|pantry|탕비/i.test(name)) return 'floor-tile-large';
  if (/현관|복도|홀|로비|entry|entrance|hall|lobby|corridor|foyer/i.test(name)) return 'floor-tile-large';
  if (/사무|회의|office|meeting|conference|work/i.test(name)) return 'floor-grey';
  if (/침실|방|bed|room|dress|드레스/i.test(name)) return 'floor-light';
  return 'floor-oak';
}

/** Texts that are room names (not dimensions, areas or level marks). */
const isLabel = (text) => /\p{L}/u.test(text) && !/^[\d\s.,x×*+\-=:/()㎡m²]+$/i.test(text) && text.length <= 24;

/**
 * Builds the entities of a recognised plan for `level`: { walls, openings, rooms, guides, bounds }.
 * `shift` moves everything ([x, z] added), `elevation` places reference lines on the level's floor.
 */
export function planEntities(result, { level, shift = [0, 0], elevation = 0, keepLeftovers = true, maxGuides = 3000 } = {}) {
  const mv = (p) => [p[0] + shift[0], p[1] + shift[1]];
  // Curved walls: every piece of one arc keeps the arc (moved with the plan) and one id per import.
  const curveIds = new Map();
  const curveOf = (c) => {
    if (!curveIds.has(c.id)) curveIds.set(c.id, newId('arc'));
    const cc = mv([c.cx, c.cz]);
    return { id: curveIds.get(c.id), cx: cc[0], cz: cc[1], r: c.r, a0: c.a0, a1: c.a1 };
  };
  const walls = result.walls.map((w) => ({ id: newId('w'), level, a: mv(w.a), b: mv(w.b), thickness: w.thickness, height: null, material: {}, ...(w.curve ? { curve: curveOf(w.curve) } : {}), ...(w.keep ?? {}) }));
  const openings = result.openings.filter((op) => walls[op.wall]).map((op) => ({
    id: newId('op'), wall: walls[op.wall].id, item: op.item, offset: op.offset, width: op.width, height: op.height, sill: op.sill,
    flip: false, side: op.side ?? 'left', params: op.hinge ? { hinge: op.hinge } : {}, ...(op.kind ? { kind: op.kind } : {}), ...(op.keep ?? {}),
  }));
  // Rooms: seeds beside every wall and at every label; the smallest wall cycle around each, once.
  const rooms = [];
  const texts = (result.texts ?? []).filter((t) => isLabel(t.text)).map((t) => ({ ...t, p: mv(t.p) }));
  const seeds = [...texts.map((t) => t.p)];
  for (const w of walls) {
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
    const L = Math.hypot(d[0], d[1]);
    if (L < 0.3) continue;
    const n = [-d[1] / L, d[0] / L];
    for (const f of [0.25, 0.5, 0.75]) for (const s of [-1, 1]) {
      const m = [w.a[0] + d[0] * f, w.a[1] + d[1] * f];
      seeds.push([m[0] + n[0] * s * (w.thickness / 2 + 0.08), m[1] + n[1] * s * (w.thickness / 2 + 0.08)]);
    }
  }
  const seen = new Set();
  const keyOf = (points) => points.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).sort().join(';');
  for (const seed of seeds) {
    if (rooms.some((r) => pointInPolygon(seed, r.points))) continue;
    const points = detectRoom(walls, seed, level);
    if (!points || points.length < 3) continue;
    const key = keyOf(points);
    if (seen.has(key)) continue;
    seen.add(key);
    if (polygonArea(points) < 0.8) continue;
    const labels = texts.filter((t) => pointInPolygon(t.p, points)).sort((a, b) => b.height - a.height);
    const name = labels.length ? labels[0].text : '';
    // A floor cleaned up again in 2D (plan-draft.js fromProject): the room keeps its finishes through its label.
    rooms.push({ id: newId('rm'), level, name, points, floor: floorForName(name), ceiling: 'wall-paint-white', showCeiling: false, ...(labels[0]?.keep ?? {}) });
  }
  // Rooms with no label (pictures): a guess from size and shape, for the caller to name (roomNames).
  const largest = Math.max(0, ...rooms.map((r) => polygonArea(r.points)));
  for (const r of rooms) if (!r.name) r.guess = roomKindGuess(r.points, { largest });
  // Doors on the outside walls: entrance doors.
  const wallOf = new Map(walls.map((w) => [w.id, w]));
  const outside = (p) => !rooms.some((r) => pointInPolygon(p, r.points));
  for (const op of openings) {
    const w = wallOf.get(op.wall);
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
    const L = Math.hypot(d[0], d[1]);
    const u = [d[0] / L, d[1] / L]; const n = [-u[1], u[0]];
    const c = [w.a[0] + u[0] * op.offset, w.a[1] + u[1] * op.offset];
    const k = w.thickness / 2 + 0.2;
    const exterior = outside([c[0] + n[0] * k, c[1] + n[1] * k]) !== outside([c[0] - n[0] * k, c[1] - n[1] * k]);
    if (exterior && op.item === 'door-single' && op.width >= 0.85) op.item = 'door-entrance';
    delete op.kind;
  }
  const guides = keepLeftovers ? (result.leftovers ?? []).slice(0, maxGuides).map((l) => ({ id: newId('g'), a: [l.a[0] + shift[0], elevation + 0.001, l.a[1] + shift[1]], b: [l.b[0] + shift[0], elevation + 0.001, l.b[1] + shift[1]], level, source: 'plan' })) : [];
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]);
  const zs = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const bounds = xs.length ? { min: [Math.min(...xs), Math.min(...zs)], max: [Math.max(...xs), Math.max(...zs)] } : null;
  return { walls, openings, rooms, guides, bounds };
}

/**
 * Scales the plan of a level by `k` about `origin` [x, z] (a drawing imported at the wrong scale, e.g. a PDF without a
 * scale, after a two-point calibration): walls (ends, thickness, arcs), the openings in them (place and width), rooms
 * and the plan's reference lines. Heights stay.
 */
export function scalePlanLevel(project, levelId, origin, k) {
  if (!(k > 0) || Math.abs(k - 1) < 1e-9) return 0;
  const s = (p) => [origin[0] + (p[0] - origin[0]) * k, origin[1] + (p[1] - origin[1]) * k];
  const walls = project.walls.filter((w) => w.level === levelId);
  const ids = new Set(walls.map((w) => w.id));
  for (const w of walls) {
    w.a = s(w.a); w.b = s(w.b); w.thickness *= k;
    if (w.curve) { const c = s([w.curve.cx, w.curve.cz]); w.curve = { ...w.curve, cx: c[0], cz: c[1], r: w.curve.r * k }; }
  }
  for (const o of project.openings) if (ids.has(o.wall)) { o.offset *= k; o.width *= k; }
  for (const r of project.rooms) if (r.level === levelId) { r.points = r.points.map(s); if (Array.isArray(r.holes)) r.holes = r.holes.map((h) => (Array.isArray(h) ? h.map(s) : h?.points ? { ...h, points: h.points.map(s) } : h)); }
  for (const g of project.guides ?? []) if (g.level === levelId && g.source === 'plan') { const a = s([g.a[0], g.a[2]]); const b = s([g.b[0], g.b[2]]); g.a = [a[0], g.a[1], a[1]]; g.b = [b[0], g.b[1], b[1]]; }
  return walls.length;
}

/** Centre of the recognised walls (used to put an imported plan around the origin). */
export function planCenter(result) {
  const xs = result.walls.flatMap((w) => [w.a[0], w.b[0]]);
  const zs = result.walls.flatMap((w) => [w.a[1], w.b[1]]);
  if (!xs.length) return [0, 0];
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
}

/**
 * Puts a recognised plan into the project (one change): `target` = 'replace' (the active level's walls, openings,
 * rooms and plan guides are replaced), 'level' (a new level on top), 'add' (added to the active level, e.g. walls
 * found in an underlay picture, with `shift` [0, 0]) or 'new' (the caller made an empty project).
 * The first import is centred on the origin; later ones reuse that shift so the floors of one drawing line up.
 * Returns { level, walls, openings, rooms, guides } (counts) and the level id.
 */
export function applyPlan(project, result, { target = 'replace', wallHeight = null, keepLeftovers = true, levelName = null, shift: fixedShift = null, roomNames = null, source = null } = {}) {
  let level = project.levels.find((l) => l.id === project.activeLevel) ?? project.levels[0];
  if (target === 'level') {
    const top = [...project.levels].sort((a, b) => a.elevation - b.elevation).at(-1);
    level = { id: newId('lv'), name: levelName ?? `${project.levels.length + 1}F`, elevation: top.elevation + top.height + 0.3, height: wallHeight ?? top.height };
    project.levels.push(level);
    project.activeLevel = level.id;
  } else if (target !== 'add') {
    const wallIds = new Set(project.walls.filter((w) => w.level === level.id).map((w) => w.id));
    project.walls = project.walls.filter((w) => !wallIds.has(w.id));
    project.openings = project.openings.filter((o) => !wallIds.has(o.wall));
    project.rooms = project.rooms.filter((r) => r.level !== level.id);
    project.guides = project.guides.filter((g) => !(g.source === 'plan' && g.level === level.id));
    if (wallHeight) level.height = wallHeight;
  }
  const center = planCenter(result);
  let shift = fixedShift ?? [-center[0], -center[1]];
  if (!fixedShift && target === 'level' && project.walls.length) {
    // Floors of one drawing share its coordinates: reuse the first import's shift while the plans overlap,
    // otherwise (another drawing) put the new floor over the middle of the ones below.
    const box = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) });
    const old = box(project.walls.flatMap((w) => [w.a, w.b]));
    const reuse = Array.isArray(project.planShift) ? project.planShift : null;
    const fresh = reuse && box(result.walls.flatMap((w) => [w.a, w.b]).map((p) => [p[0] + reuse[0], p[1] + reuse[1]]));
    const overlap = fresh && Math.min(old.x1, fresh.x1) - Math.max(old.x0, fresh.x0) > 0 && Math.min(old.z1, fresh.z1) - Math.max(old.z0, fresh.z0) > 0;
    shift = overlap ? reuse : [(old.x0 + old.x1) / 2 - center[0], (old.z0 + old.z1) / 2 - center[1]];
  }
  if (!fixedShift && !(target === 'level' && project.planShift)) project.planShift = shift;
  const built = planEntities(result, { level: level.id, shift, elevation: level.elevation, keepLeftovers });
  // Unlabelled rooms: named from the guess (roomNames(key, n) → text, n counts rooms of one kind), marked with the source.
  const counts = new Map();
  for (const r of built.rooms) {
    if (source) r.planSource = source;
    if (r.guess && roomNames) { const n = (counts.get(r.guess) ?? 0) + 1; counts.set(r.guess, n); r.name = roomNames(r.guess, n); r.floor = floorForName(r.name); r.nameGuessed = true; }
    delete r.guess;
  }
  project.walls.push(...built.walls);
  project.openings.push(...built.openings);
  project.rooms.push(...built.rooms);
  project.guides.push(...built.guides);
  return { level: level.id, walls: built.walls.length, openings: built.openings.length, doors: built.openings.filter((o) => o.item.startsWith('door-') && o.item !== 'door-cased-opening').length, windows: built.openings.filter((o) => o.item.startsWith('window')).length, rooms: built.rooms.length, roomIds: built.rooms.map((r) => r.id), guides: built.guides.length, bounds: built.bounds };
}
