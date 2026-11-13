// New-project templates (20): single rooms, Korean apartment plans (원룸,
// 오피스텔, 49·59·74·84·104㎡), a house and a two-storey house. Plans are lists
// of room rectangles; walls (exterior thick, partitions thin), doors between
// rooms, windows and the entrance are derived from them, so every template is
// consistent and easy to add. Pure (no three).
import { createProject, newId } from './document.js';
import { detectRoom, wallNormal } from './walls.js';
import { placeStairs, stairLayout, syncStairwells } from './stairs.js';

export const TEMPLATES = [
  ['empty', 'cube'],
  ['room', 'roomTool'],
  ['living', 'libLiving'],
  ['bedroom', 'libBedroom'],
  ['kidsroom', 'libKids'],
  ['kitchen', 'libKitchen'],
  ['dining', 'libDining'],
  ['bathroom', 'libBathroom'],
  ['office', 'libOffice'],
  ['dressing', 'libStorage'],
  ['laundry', 'libAppliances'],
  ['studio', 'floorTool'],
  ['officetel', 'floorTool'],
  ['apt49', 'plan2d'],
  ['apt59', 'plan2d'],
  ['apt74', 'plan2d'],
  ['apt84', 'plan2d'],
  ['apt104', 'plan2d'],
  ['house', 'libStructure'],
  ['duplex', 'stairsTool'],
  ['house3', 'stairsTool'],
  ['building', 'libOffice'],
  ['smalloffice', 'libWorkplace'],
  ['shop', 'libDining'],
  ['loft', 'stairsTool'],
];

const T_EXT = 0.25; // exterior walls
const T_INT = 0.12; // partitions

/** Room kinds: floor finish, whether they get a window, and whether they are a "hub" other rooms open onto. */
const KINDS = {
  living: { floor: 'floor-oak', window: 'big', hub: true },
  kitchen: { floor: 'floor-tile-large', window: 'normal', hub: true },
  dining: { floor: 'floor-oak', window: 'normal', hub: true },
  hall: { floor: 'floor-tile-large', window: null, hub: true },
  entry: { floor: 'floor-tile-large', window: null, hub: true },
  bedroom: { floor: 'floor-light', window: 'normal' },
  bedroom2: { floor: 'floor-light', window: 'normal' },
  bedroom3: { floor: 'floor-light', window: 'normal' },
  bedroom4: { floor: 'floor-light', window: 'normal' },
  kids: { floor: 'floor-light', window: 'normal' },
  office: { floor: 'floor-grey', window: 'normal' },
  room: { floor: 'floor-oak', window: 'normal' },
  dressing: { floor: 'floor-light', window: null, door: 0.8 },
  laundry: { floor: 'tile-grey', window: 'small', door: 0.8 },
  utility: { floor: 'tile-grey', window: 'small', door: 0.8 },
  bath: { floor: 'tile-grey', window: 'small', door: 0.8, tiles: true },
  bath2: { floor: 'tile-grey', window: 'small', door: 0.8, tiles: true },
  // Buildings (offices)
  lobby: { floor: 'floor-tile-large', window: 'big', hub: true },
  openoffice: { floor: 'floor-grey', window: 'big', hub: true },
  meeting: { floor: 'floor-grey', window: 'normal' },
  toilet: { floor: 'tile-grey', window: 'small', door: 0.8, tiles: true },
  stair: { floor: 'floor-tile-large', window: null, hub: true },
  reception: { floor: 'floor-tile-large', window: 'big', hub: true },
  director: { floor: 'floor-grey', window: 'normal' },
  pantry: { floor: 'tile-grey', window: 'small', door: 0.8 },
  storage: { floor: 'tile-grey', window: null, door: 0.8 },
  server: { floor: 'floor-grey', window: null, door: 1.0 },
  noc: { floor: 'floor-grey', window: null },
  hall2: { floor: 'floor-oak', window: 'big', hub: true },
  counter: { floor: 'tile-grey', window: null, hub: true },
  // Clinic, classroom, house extras (plans.js)
  waiting: { floor: 'floor-tile-large', window: 'big', hub: true },
  corridor: { floor: 'floor-tile-large', window: null, hub: true },
  consult: { floor: 'floor-grey', window: 'normal' },
  consult2: { floor: 'floor-grey', window: 'normal' },
  treatment: { floor: 'floor-grey', window: 'normal' },
  classroom: { floor: 'floor-light', window: 'big' },
  classroom2: { floor: 'floor-light', window: 'big' },
  prep: { floor: 'floor-grey', window: 'small', door: 0.8 },
  toilet2: { floor: 'tile-grey', window: 'small', door: 0.8, tiles: true },
};
export const kindOfKey = (key) => KINDS[key] ?? KINDS.room;

/**
 * Plans: per level, rectangles [key, x0, z0, x1, z1] (metres), pairs of keys with no wall between them
 * (open plans), and the room holding the entrance door.
 */
const PLANS = {
  room: [{ rects: [['room', 0, 0, 4.5, 3.6]], door: 'room' }],
  living: [{ rects: [['living', 0, 0, 6, 4.5]], door: 'living' }],
  bedroom: [{ rects: [['bedroom', 0, 0, 4.2, 3.6]], door: 'bedroom' }],
  kidsroom: [{ rects: [['kids', 0, 0, 3.6, 3.3]], door: 'kids' }],
  kitchen: [{ rects: [['kitchen', 0, 0, 4, 3.2]], door: 'kitchen' }],
  dining: [{ rects: [['dining', 0, 0, 4, 3.6]], door: 'dining' }],
  bathroom: [{ rects: [['bath', 0, 0, 2.4, 2.1]], door: 'bath' }],
  office: [{ rects: [['office', 0, 0, 5, 4]], door: 'office' }],
  dressing: [{ rects: [['dressing', 0, 0, 3, 2.4]], door: 'dressing' }],
  laundry: [{ rects: [['laundry', 0, 0, 2.6, 2.0]], door: 'laundry' }],
  studio: [{ rects: [['bath', 0, 0, 2.2, 2.4], ['entry', 0, 2.4, 2.2, 4.8], ['living', 2.2, 0, 6.6, 4.8]], open: [['entry', 'living']], entrance: 'entry' }],
  officetel: [{ rects: [['entry', 0, 0, 1.8, 1.8], ['bath', 0, 1.8, 1.8, 4.2], ['living', 1.8, 0, 6.0, 4.2], ['bedroom', 6.0, 0, 8.7, 4.2]], open: [['entry', 'living']], entrance: 'entry' }],
  apt49: [{ rects: [['bedroom', 0, 0, 3.3, 3.6], ['bedroom2', 0, 3.6, 3.3, 6.6], ['living', 3.3, 0, 8.4, 4.2], ['kitchen', 3.3, 4.2, 6.3, 6.6], ['bath', 6.3, 4.2, 8.4, 6.6]], open: [['living', 'kitchen']], entrance: 'kitchen' }],
  apt59: [{ rects: [['bedroom', 0, 0, 3.6, 3.6], ['bedroom2', 0, 3.6, 3.6, 7.2], ['living', 3.6, 0, 9.6, 4.4], ['kitchen', 3.6, 4.4, 7.2, 7.2], ['bath', 7.2, 4.4, 9.6, 7.2]], open: [['living', 'kitchen']], entrance: 'kitchen' }],
  apt74: [{ rects: [['bedroom', 0, 0, 3.9, 4.5], ['living', 3.9, 0, 8.1, 4.5], ['bedroom3', 8.1, 0, 10.8, 3.6], ['bedroom2', 0, 4.5, 3.6, 7.8], ['kitchen', 3.6, 4.5, 8.1, 7.8], ['bath', 8.1, 3.6, 10.8, 5.7], ['utility', 8.1, 5.7, 10.8, 7.8]], open: [['living', 'kitchen']], entrance: 'kitchen' }],
  apt84: [{ rects: [['bedroom', 0, 0, 3.9, 4.2], ['living', 3.9, 0, 7.8, 4.8], ['bedroom3', 7.8, 0, 11.4, 4.2], ['bedroom2', 0, 4.2, 3.9, 8.4], ['kitchen', 3.9, 4.8, 7.8, 8.4], ['bath', 7.8, 4.2, 11.4, 6.3], ['dressing', 7.8, 6.3, 9.6, 8.4], ['laundry', 9.6, 6.3, 11.4, 8.4]], open: [['living', 'kitchen']], entrance: 'kitchen' }],
  apt104: [{ rects: [['bedroom', 0, 0, 4.2, 4.8], ['living', 4.2, 0, 9, 4.8], ['bedroom3', 9, 0, 12.6, 3.9], ['bath', 9, 3.9, 12.6, 5.7], ['bedroom4', 9, 5.7, 12.6, 8.7], ['bedroom2', 0, 4.8, 3.6, 8.7], ['hall', 3.6, 4.8, 5.4, 8.7], ['kitchen', 5.4, 4.8, 9, 8.7]], open: [['living', 'kitchen']], entrance: 'hall' }],
  house: [{ rects: [['living', 0, 0, 5.5, 4.5], ['kitchen', 5.5, 0, 10, 4.5], ['bedroom', 0, 4.5, 4, 8], ['hall', 4, 4.5, 6, 8], ['bedroom2', 6, 4.5, 10, 6.5], ['bath', 6, 6.5, 10, 8]], open: [['living', 'kitchen']], entrance: 'hall' }],
  duplex: [
    { name: '1F', rects: [['living', 0, 0, 6, 4.5], ['kitchen', 6, 0, 10, 4.5], ['hall', 0, 4.5, 3, 8.5], ['bath', 3, 4.5, 5, 8.5], ['office', 5, 4.5, 10, 8.5]], open: [['living', 'kitchen'], ['hall', 'living']], entrance: 'hall', stairs: { room: 'hall' } },
    { name: '2F', rects: [['bedroom', 0, 0, 5, 4.5], ['bedroom2', 5, 0, 10, 4.5], ['hall', 0, 4.5, 3, 8.5], ['bath2', 3, 4.5, 6, 8.5], ['dressing', 6, 4.5, 10, 8.5]], open: [], stairwell: 'hall' },
  ],
  // Three-storey detached house: a switchback (U) stair with a half landing in the stacked stair hall;
  // the upper halls keep their floor round the stairwell opening (room.holes, stairs.js).
  house3: [
    { name: '1F', rects: [['living', 0, 0, 6, 4.5], ['kitchen', 6, 0, 10, 4.5], ['hall', 0, 4.5, 3, 9], ['bath', 3, 4.5, 5, 9], ['office', 5, 4.5, 10, 9]], open: [['living', 'kitchen'], ['hall', 'living']], entrance: 'hall', stairs: { room: 'hall', type: 'u' } },
    { name: '2F', rects: [['bedroom', 0, 0, 5, 4.5], ['bedroom2', 5, 0, 10, 4.5], ['hall', 0, 4.5, 3, 9], ['bath2', 3, 4.5, 6, 9], ['dressing', 6, 4.5, 10, 9]], open: [], stairs: { room: 'hall', type: 'u', guard: true } },
    { name: '3F', rects: [['bedroom3', 0, 0, 5, 4.5], ['kids', 5, 0, 10, 4.5], ['hall', 0, 4.5, 3, 9], ['bath', 3, 4.5, 6, 9], ['room', 6, 4.5, 10, 9]], open: [] },
  ],
  // Small office: reception, open work area, director's room, meeting room, pantry, toilet.
  smalloffice: [{ rects: [['reception', 0, 0, 4, 4], ['openoffice', 4, 0, 12, 6], ['meeting', 0, 4, 4, 8], ['director', 8, 6, 12, 9], ['pantry', 4, 6, 6.5, 9], ['toilet', 6.5, 6, 8, 9]], open: [['reception', 'openoffice']], entrance: 'reception' }],
  // Single office rooms for the samples (not in the New menu): open-plan office, executive office, server room,
  // small server closet and a network operations room. Server rooms are 3 m high (cable trays above the racks).
  openoffice1: [{ rects: [['openoffice', 0, 0, 10, 7]], door: 'openoffice' }],
  executive: [{ rects: [['director', 0, 0, 5.5, 4.5]], door: 'director' }],
  serverroom: [{ height: 3.0, rects: [['server', 0, 0, 8, 6]], door: 'server' }],
  servercloset: [{ height: 3.0, rects: [['server', 0, 0, 4, 3.2]], door: 'server' }],
  noc: [{ rects: [['noc', 0, 0, 7, 5]], door: 'noc' }],
  // Shop / café: sales floor with a big front window, counter, storage and a toilet at the back.
  shop: [{ rects: [['hall2', 0, 0, 9, 6], ['counter', 0, 6, 5, 8.5], ['storage', 5, 6, 7.5, 8.5], ['toilet', 7.5, 6, 9, 8.5]], open: [['hall2', 'counter']], entrance: 'hall2' }],
  // Loft studio: living-kitchen below, a sleeping loft over the back half reached by stairs.
  loft: [
    { name: '1F', rects: [['living', 0, 0, 7, 4.5], ['kitchen', 0, 4.5, 3.5, 8], ['hall', 3.5, 4.5, 5.5, 8], ['bath', 5.5, 4.5, 7, 8]], open: [['living', 'kitchen'], ['hall', 'living']], entrance: 'living', stairs: { room: 'hall' } },
    { name: '2F', rects: [['bedroom', 0, 4.5, 3.5, 8], ['hall', 3.5, 4.5, 5.5, 8], ['dressing', 5.5, 4.5, 7, 8]], open: [], stairwell: 'hall' },
  ],
  // Five-storey office building: lobby, then open-plan floors; meeting room, stair core and toilets on every floor.
  // The core has a switchback (U) stair with a half landing on every floor, stacked; each floor landing
  // keeps its floor round the stairwell opening.
  building: [1, 2, 3, 4, 5].map((n) => ({
    name: `${n}F`, height: 3.3,
    rects: [[n === 1 ? 'lobby' : 'openoffice', 0, 0, 14, 12], ['meeting', 14, 0, 20, 6], ['stair', 14, 6, 16.5, 12], ['toilet', 16.5, 6, 20, 12]],
    open: [], entrance: n === 1 ? 'lobby' : undefined,
    stairs: n < 5 ? { room: 'stair', type: 'u', guard: n === 4 } : undefined,
  })),
};

/** Builds the template's project. `names` gives localised room names: (key) → text. */
export function buildTemplate(id, options = {}) { return buildPlanProject(PLANS[id], options); }

/**
 * A project from a plan: one spec per level { name?, height?, rects, open?, entrance? | door?, stairs?, stairwell?,
 * columns?: [[x, z, size?, shape?], …] (structural columns, planedit.js) }. Also used by plans.js (sample floor plans).
 */
export function buildPlanProject(plan, { name = '', names = (k) => k, wallHeight = 2.4 } = {}) {
  const project = createProject({ name, wallHeight });
  if (!plan) { center(project); return project; }
  plan.forEach((spec, i) => {
    let levelId = project.levels[0].id;
    if (i > 0) {
      const below = project.levels[i - 1];
      levelId = newId('lv');
      project.levels.push({ id: levelId, name: spec.name ?? `${i + 1}F`, elevation: below.elevation + below.height + 0.3, height: spec.height ?? wallHeight });
    } else {
      if (spec.name) project.levels[0].name = spec.name;
      if (spec.height) project.levels[0].height = spec.height;
    }
    buildRects(project, levelId, spec, names);
  });
  // A storey above: the floors below get ceilings so each floor reads as its own.
  if (plan.length > 1) for (const r of project.rooms) if (r.level !== project.levels.at(-1).id) r.showCeiling = true;
  center(project);
  // Stairwells: the stairs cut their openings into the floors they reach (and the ceilings they climb through).
  syncStairwells(project);
  project.activeLevel = project.levels[0].id;
  if (plan.length > 1) project.levelView = 'all';
  return project;
}

const key2 = (a, b) => [a, b].sort().join('|');
const round = (v) => Math.round(v * 1000) / 1000;

/** Walls, doors, windows, rooms and stairs of one level from its rectangles. */
function buildRects(project, level, spec, names) {
  const rects = spec.rects.map(([key, x0, z0, x1, z1]) => ({ key, x0, z0, x1, z1 }));
  const open = new Set((spec.open ?? []).map(([a, b]) => key2(a, b)));
  // 1. Edge pieces between every corner coordinate, with the rooms on either side.
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap((r) => [r.z0, r.z1]))].sort((a, b) => a - b);
  const pieces = new Map();
  const addPiece = (a, b, owner) => {
    const k = `${round(a[0])},${round(a[1])},${round(b[0])},${round(b[1])}`;
    const p = pieces.get(k) ?? { a, b, owners: [] };
    p.owners.push(owner);
    pieces.set(k, p);
  };
  for (const r of rects) {
    const cutsX = [r.x0, ...xs.filter((x) => x > r.x0 + 1e-6 && x < r.x1 - 1e-6), r.x1];
    const cutsZ = [r.z0, ...zs.filter((z) => z > r.z0 + 1e-6 && z < r.z1 - 1e-6), r.z1];
    for (let i = 0; i < cutsX.length - 1; i++) { addPiece([cutsX[i], r.z0], [cutsX[i + 1], r.z0], r); addPiece([cutsX[i], r.z1], [cutsX[i + 1], r.z1], r); }
    for (let i = 0; i < cutsZ.length - 1; i++) { addPiece([r.x0, cutsZ[i]], [r.x0, cutsZ[i + 1]], r); addPiece([r.x1, cutsZ[i]], [r.x1, cutsZ[i + 1]], r); }
  }
  // 2. Pieces → walls: open plans have none between their rooms; collinear pieces of the same kind join into one wall.
  const kept = [...pieces.values()].filter((p) => !(p.owners.length === 2 && open.has(key2(p.owners[0].key, p.owners[1].key))));
  const walls = [];
  const sameLine = (p, w) => (p.a[0] === p.b[0] ? w.a[0] === w.b[0] && w.a[0] === p.a[0] : w.a[1] === w.b[1] && w.a[1] === p.a[1]);
  for (const p of kept.sort((m, n) => m.a[0] - n.a[0] || m.a[1] - n.a[1])) {
    const thickness = p.owners.length === 1 ? T_EXT : T_INT;
    const prev = walls.find((w) => w.thickness === thickness && sameLine(p, w) && Math.abs(w.b[0] - p.a[0]) < 1e-6 && Math.abs(w.b[1] - p.a[1]) < 1e-6);
    if (prev) { prev.b = [...p.b]; prev.pieces.push(p); continue; }
    walls.push({ id: newId('w'), level, a: [...p.a], b: [...p.b], thickness, height: null, material: {}, pieces: [p] });
  }
  const piecesOf = new Map();
  for (const w of walls) { piecesOf.set(w, w.pieces); delete w.pieces; project.walls.push(w); }
  const wallAt = (point) => {
    for (const w of walls) {
      const dx = w.b[0] - w.a[0]; const dz = w.b[1] - w.a[1];
      const L = Math.hypot(dx, dz);
      const t = ((point[0] - w.a[0]) * dx + (point[1] - w.a[1]) * dz) / (L * L);
      const px = w.a[0] + dx * t; const pz = w.a[1] + dz * t;
      if (t > 0 && t < 1 && Math.hypot(px - point[0], pz - point[1]) < 0.01) return { wall: w, offset: t * L, length: L };
    }
    return null;
  };
  const opening = (point, width, height, sill, item) => {
    const at = wallAt(point);
    if (!at || width > at.length - 0.1) return;
    // The wanted place, else the nearest free place on the same wall (openings never overlap).
    const lo = width / 2 + 0.05; const hi = at.length - width / 2 - 0.05;
    const taken = project.openings.filter((o) => o.wall === at.wall.id);
    const free = (c) => taken.every((o) => Math.abs(o.offset - c) >= (o.width + width) / 2 + 0.15);
    const want = Math.max(lo, Math.min(hi, at.offset));
    let offset = null;
    for (let d = 0; d <= at.length && offset == null; d += 0.05) for (const c of [want - d, want + d]) if (c >= lo && c <= hi && free(c)) { offset = c; break; }
    if (offset == null) return;
    project.openings.push({ id: newId('op'), wall: at.wall.id, item, offset, width, height, sill, flip: false, side: 'left', params: {} });
  };
  const shared = (a, b) => kept.filter((p) => p.owners.length === 2 && p.owners.includes(a) && p.owners.includes(b));
  const length = (p) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
  const exterior = (r) => [...pieces.values()].filter((p) => p.owners.length === 1 && p.owners[0] === r);
  // 3. Doors: every room opens onto its best neighbouring hub (else any neighbour); hubs with a wall between them get a door too.
  const doors = new Set();
  const door = (a, b) => {
    const k = key2(a.key, b.key);
    if (doors.has(k) || open.has(k)) return;
    const seg = shared(a, b).sort((m, n) => length(n) - length(m))[0];
    if (!seg || length(seg) < 0.95) return;
    doors.add(k);
    const width = Math.min(kindOfKey(a.key).door ?? 0.9, kindOfKey(b.key).door ?? 0.9);
    // Near the end of the shared stretch, leaving the middle of the walls for furniture.
    const t = (0.2 + width / 2) / length(seg);
    opening([seg.a[0] + (seg.b[0] - seg.a[0]) * t, seg.a[1] + (seg.b[1] - seg.a[1]) * t], width, 2.1, 0, 'door-single');
  };
  const neighbours = (r) => rects.filter((o) => o !== r && shared(r, o).length);
  const sharedLength = (r, o) => shared(r, o).reduce((s, p) => s + length(p), 0);
  for (const r of rects) {
    if (kindOfKey(r.key).hub) continue;
    const pick = (list) => [...list].sort((m, n) => sharedLength(r, n) - sharedLength(r, m))[0];
    const target = pick(neighbours(r).filter((o) => kindOfKey(o.key).hub)) ?? pick(neighbours(r));
    if (target) door(r, target);
  }
  for (const r of rects) if (kindOfKey(r.key).hub) for (const o of neighbours(r)) if (kindOfKey(o.key).hub) door(r, o);
  // 4. The entrance door first, then a window on each room's longest outside wall (moved aside when they would meet).
  const doorRoom = spec.entrance ?? spec.door;
  if (doorRoom) {
    const r = rects.find((x) => x.key === doorRoom);
    const outside = exterior(r).sort((m, n) => length(n) - length(m));
    // Single-room templates: the door goes on another side than the window.
    const seg = spec.door ? outside[1] ?? outside[0] : outside[0];
    if (seg) {
      const t = (0.3 + 0.5) / length(seg);
      opening([seg.a[0] + (seg.b[0] - seg.a[0]) * t, seg.a[1] + (seg.b[1] - seg.a[1]) * t], spec.entrance ? 1.0 : 0.9, 2.1, 0, spec.entrance ? 'door-entrance' : 'door-single');
    }
  }
  // 4. Windows on each room's longest outside wall; the entrance door on the entrance room's.
  for (const r of rects) {
    const kind = kindOfKey(r.key).window;
    const outside = exterior(r).sort((m, n) => length(n) - length(m));
    if (!kind || !outside.length || (spec.stairwell && r.key === spec.stairwell)) continue;
    const seg = outside[0];
    const mid = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
    const L = length(seg);
    if (kind === 'big') opening(mid, Math.min(L - 0.8, 3.6), 2.1, 0.1, 'window-sliding');
    else if (kind === 'small') opening(mid, Math.min(0.6, L - 0.4), 0.6, 1.4, 'window-casement');
    else opening(mid, Math.min(L - 0.8, 1.8), 1.4, 0.9, 'window-casement');
  }
  // 5. Rooms (open plans share one room: the first key found there names it).
  for (const r of rects) {
    if (spec.stairwell && r.key === spec.stairwell) continue; // the stairwell is open to the floor below
    const points = detectRoom(project.walls, [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], level);
    if (!points) continue;
    const shape = points.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).sort().join(';');
    if (project.rooms.some((o) => o.level === level && o.points.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).sort().join(';') === shape)) continue;
    project.rooms.push({ id: newId('rm'), level, name: names(r.key), key: r.key, points, floor: kindOfKey(r.key).floor, ceiling: 'wall-paint-white', showCeiling: false });
  }
  // 6. Bathroom walls get tiles on the bathroom side.
  for (const r of rects.filter((x) => kindOfKey(x.key).tiles)) {
    const c = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    for (const w of walls.filter((x) => piecesOf.get(x).some((p) => p.owners.includes(r)))) {
      const n = wallNormal(w);
      const side = (c[0] - w.a[0]) * n[0] + (c[1] - w.a[1]) * n[1] > 0 ? 'left' : 'right';
      w.material = { ...w.material, [side]: 'tile-subway-white' };
    }
  }
  // 7. Stairs in the stair hall of the lower floor.
  if (spec.stairs) {
    const r = rects.find((x) => x.key === spec.stairs.room);
    const lv = project.levels.find((l) => l.id === level);
    // `turn`: this flight runs back over the one below (stacked stair halls of three or more storeys).
    if (r && lv && spec.stairs.type) project.objects.push(fittedStairs(r, level, lv.height + 0.3, spec.stairs));
    else if (r && lv) project.objects.push({ id: newId('ob'), level, item: 'stairs', params: { rise: lv.height + 0.3, width: Math.min(1.0, r.x1 - r.x0 - 0.5) }, position: [(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2], rotation: [0, spec.stairs.turn ? Math.PI : 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' });
  }
  // 8. Structural columns (their centres are wall nodes, so walls stay joined to them).
  for (const [x, z, size = 0.4, shape = 'square'] of spec.columns ?? []) {
    project.objects.push({ id: newId('ob'), level, item: 'column', params: { shape, size, depth: size, fitLevel: true, height: project.levels.find((l) => l.id === level)?.height ?? 2.4, trim: false, material: 'wall-paint-white' }, position: [x, 0, z], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' });
  }
  project.__rects = [...(project.__rects ?? []), ...rects.map((r) => ({ ...r, level }))];
}

/**
 * A stair of the given type fitted into a stair hall rectangle: it climbs along the hall's long side away
 * from the hall's first end (where the doors are: that end stays a floor landing), its far end against the
 * far wall. Stacked halls get the same stair on every floor, so the flights sit over each other.
 */
function fittedStairs(r, level, rise, { type = 'u', guard = false, turn = 'right' }) {
  const alongZ = r.z1 - r.z0 >= r.x1 - r.x0;
  const inset = T_EXT / 2 + 0.02;
  const across = (alongZ ? r.x1 - r.x0 : r.z1 - r.z0) - 2 * inset;
  const gap = 0.12;
  const width = Math.round(Math.min(1.2, type === 'u' ? (across - gap) / 2 : across) * 100) / 100;
  const params = { type, rise: Math.round(rise * 1000) / 1000, width, run: 0.27, maxRiser: 0.19, turn, gap, rail: 'baluster', guard, tread: 'wood-oak', riser: 'paint-white-matte' };
  const L = stairLayout(params);
  const dir = alongZ ? [0, 1] : [1, 0];
  // Centre of the footprint: in the middle across, its far end against the far wall.
  const far = (alongZ ? r.z1 : r.x1) - inset;
  const c = alongZ ? [(r.x0 + r.x1) / 2, far - L.size[2] / 2] : [far - L.size[2] / 2, (r.z0 + r.z1) / 2];
  const placed = placeStairs(params, [0, 0], dir);
  return { id: newId('ob'), level, item: 'stairs', params, position: [c[0], 0, c[1]], rotation: placed.rotation, scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' };
}

function center(project) {
  const xs = project.walls.flatMap((w) => [w.a[0], w.b[0]]);
  const zs = project.walls.flatMap((w) => [w.a[1], w.b[1]]);
  if (!xs.length) { project.camera = { position: [6, 6, 8], target: [0, 0.6, 0], fov: 50, ortho: false }; return; }
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  for (const w of project.walls) { w.a = [w.a[0] - cx, w.a[1] - cz]; w.b = [w.b[0] - cx, w.b[1] - cz]; }
  for (const r of project.rooms) r.points = r.points.map(([x, z]) => [x - cx, z - cz]);
  for (const o of project.objects) o.position = [o.position[0] - cx, o.position[1], o.position[2] - cz];
  // The furnishing code (samples.js) works with the room rectangles: kept in the same frame, not saved.
  const rects = (project.__rects ?? []).map((r) => ({ ...r, x0: r.x0 - cx, x1: r.x1 - cx, z0: r.z0 - cz, z1: r.z1 - cz }));
  delete project.__rects;
  Object.defineProperty(project, 'rects', { value: rects, enumerable: false, configurable: true });
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const top = project.levels.at(-1);
  project.camera = { position: [size * 0.75, size * 0.85 + top.elevation, size * 1.05], target: [0, 0.6 + top.elevation / 2, 0], fov: 50, ortho: false };
}
