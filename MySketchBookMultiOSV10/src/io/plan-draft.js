// 2D cleanup of a recognised floor plan before it becomes 3D (the plan workbench, ui/plan-studio.js).
// A draft is the recogniser's result with ids: walls (centre lines + thickness), openings on walls (centre
// offset from the wall's start), texts (room names), leftovers (reference lines) and furniture (library items found
// in a picture, io/plan-furniture.js: item, params, position [x, z], rotation about +Y, footprint size [w, d]). Every edit here keeps
// connected wall ends together and the openings where they are in the plan; `toResult` turns the draft back
// into the recogniser's shape for plan-build.js applyPlan (the 3D conversion).
// Pure (no DOM, no three): unit-tested in test/unit/plan-draft.test.js.
import { newId } from '../engine/document.js';
import { openingDefaults } from './plan-recognize.js';
import { planEntities } from './plan-build.js';

const EPS = 1e-6;
/** Wall ends closer than this are one corner. */
export const JOIN_EPS = 0.005;

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const mul = (p, k) => [p[0] * k, p[1] * k];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const same = (p, q, tol = JOIN_EPS) => dist(p, q) <= tol;

export const wallLength = (w) => dist(w.a, w.b);
/** Unit direction of a wall (a → b). */
export function wallDir(w) {
  const L = wallLength(w);
  return L > EPS ? mul(sub(w.b, w.a), 1 / L) : [1, 0];
}
/** Plan point at `s` metres from the wall's start. */
export const pointAlong = (w, s) => add(w.a, mul(wallDir(w), s));
/** Distance along the wall of the foot of `p` (not clamped). */
export const alongOf = (w, p) => dot(sub(p, w.a), wallDir(w));
/** Distance of `p` to the wall's centre segment. */
export function distToWall(w, p) {
  const L = wallLength(w);
  const s = Math.max(0, Math.min(L, alongOf(w, p)));
  return dist(p, pointAlong(w, s));
}

/** 'door' | 'window' | 'passage' for an opening (from its library item). */
export function openingKind(op) {
  const item = String(op.item ?? '');
  if (item === 'door-cased-opening') return 'passage';
  if (item.startsWith('door')) return 'door';
  return 'window';
}

const copyPt = (p) => [Number(p[0]), Number(p[1])];

// ───────────────────────── draft ⇄ recogniser result

/**
 * A recogniser result ({ walls, openings (wall = index), texts, leftovers }) → a draft with ids.
 * `source` describes the background the workbench draws (kept as is).
 */
export function fromResult(result, extra = {}) {
  const walls = (result.walls ?? []).map((w) => ({ id: newId('dw'), a: copyPt(w.a), b: copyPt(w.b), thickness: Number(w.thickness) || 0.15, ...(w.curve ? { curve: { ...w.curve } } : {}), ...(w.keep ? { keep: { ...w.keep } } : {}) }));
  const openings = (result.openings ?? []).filter((o) => walls[o.wall]).map((o) => {
    const { wall, ...rest } = o;
    return { ...rest, id: newId('do'), wall: walls[wall].id };
  });
  const texts = (result.texts ?? []).filter((t) => t && Array.isArray(t.p)).map((t) => ({ ...t, id: newId('dt'), p: copyPt(t.p), height: t.height ?? 0.3 }));
  const leftovers = (result.leftovers ?? []).map((l) => ({ a: copyPt(l.a), b: copyPt(l.b) }));
  const furniture = (result.furniture ?? []).map((f) => ({ ...f, id: newId('df'), params: { ...(f.params ?? {}) }, position: copyPt(f.position), size: [...(f.size ?? [0.6, 0.6])] }));
  return { walls, openings, texts, leftovers, furniture, ...extra };
}

/** A draft → the recogniser's result shape (openings by wall index, kept within their walls). */
export function toResult(draft) {
  const live = draft.walls.filter((w) => wallLength(w) > 0.01);
  const index = new Map(live.map((w, i) => [w.id, i]));
  const walls = live.map((w) => ({ a: copyPt(w.a), b: copyPt(w.b), thickness: w.thickness, ...(w.curve ? { curve: { ...w.curve } } : {}), ...(w.keep ? { keep: { ...w.keep } } : {}) }));
  const openings = [];
  for (const op of draft.openings) {
    const i = index.get(op.wall);
    if (i == null) continue;
    const L = wallLength(live[i]);
    const width = Math.min(op.width, Math.max(0.2, L - 0.02));
    const offset = Math.max(width / 2, Math.min(L - width / 2, op.offset));
    const { id, wall, ...rest } = op;
    openings.push({ ...rest, wall: i, width, offset });
  }
  return {
    walls, openings,
    texts: draft.texts.map(({ id, ...t }) => ({ ...t, p: copyPt(t.p) })),
    leftovers: draft.leftovers.map((l) => ({ a: copyPt(l.a), b: copyPt(l.b) })),
    furniture: (draft.furniture ?? []).map(({ id, ...f }) => ({ ...f, position: copyPt(f.position) })),
    ...(draft.replaceObjects ? { replaceObjects: true } : {}),
  };
}

/** Deep copy (the workbench's undo steps). */
export const cloneDraft = (draft) => JSON.parse(JSON.stringify(draft));

/**
 * The walls, openings and rooms of a level of a project as a draft, to be cleaned up again in 2D. Room names
 * come back as texts at the room centres (with the room's own finishes kept), walls keep their height and
 * materials, openings their item settings; reference lines of the plan come back as leftovers.
 */
export function fromProject(project, levelId) {
  const walls = project.walls.filter((w) => w.level === levelId);
  const ids = new Set(walls.map((w) => w.id));
  const index = new Map(walls.map((w, i) => [w.id, i]));
  const result = {
    walls: walls.map((w) => ({ a: w.a, b: w.b, thickness: w.thickness, ...(w.curve ? { curve: w.curve } : {}), keep: { height: w.height ?? null, material: w.material ?? {}, ...(w.name ? { name: w.name } : {}) } })),
    openings: project.openings.filter((o) => ids.has(o.wall)).map((o) => ({ wall: index.get(o.wall), item: o.item, offset: o.offset, width: o.width, height: o.height, sill: o.sill, side: o.side, ...(o.params?.hinge ? { hinge: o.params.hinge } : {}), keep: { flip: o.flip ?? false, params: o.params ?? {}, ...(o.material ? { material: o.material } : {}) } })),
    texts: project.rooms.filter((r) => r.level === levelId && r.name).map((r) => ({ text: r.name, p: polygonCentre(r.points), height: 1, keep: { floor: r.floor, ceiling: r.ceiling, showCeiling: r.showCeiling ?? false } })),
    leftovers: (project.guides ?? []).filter((g) => g.level === levelId && g.source === 'plan').map((g) => ({ a: [g.a[0], g.a[2]], b: [g.b[0], g.b[2]] })),
    // Everything else on the level (furniture, lamps, stairs …) keeps all of its settings; only place and turn are edited.
    furniture: (project.objects ?? []).filter((o) => o.level === levelId).map((o) => {
      const { id, level, position, rotation, ...rest } = o;
      const w = Number(o.params?.width ?? o.params?.length) || 0.6; const d = Number(o.params?.depth ?? o.params?.width) || 0.6;
      return { item: o.item, params: { ...(o.params ?? {}) }, position: [position[0], position[2]], rotation: rotation?.[1] ?? 0, size: [w, d], keep: { ...rest, y: position[1], rx: rotation?.[0] ?? 0, rz: rotation?.[2] ?? 0 } };
    }),
    replaceObjects: true,
  };
  const draft = fromResult(result);
  draft.replaceObjects = true;
  return draft;
}

/** Area centroid of a polygon (its vertex mean when degenerate). */
export function polygonCentre(points) {
  let A = 0; let cx = 0; let cz = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]; const q = points[(i + 1) % points.length];
    const c = p[0] * q[1] - q[0] * p[1];
    A += c; cx += (p[0] + q[0]) * c; cz += (p[1] + q[1]) * c;
  }
  if (Math.abs(A) < 1e-9) return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  return [cx / (3 * A), cz / (3 * A)];
}

// ───────────────────────── keeping openings in place

/** World centres of the openings of a wall (taken before its ends move). */
function openingCentres(draft, wall) {
  return draft.openings.filter((o) => o.wall === wall.id).map((o) => ({ op: o, c: pointAlong(wall, o.offset) }));
}
/** Puts openings back at their plan positions on the (moved) wall, kept inside it. */
function restoreOpenings(wall, saved) {
  const L = wallLength(wall);
  for (const { op, c } of saved) op.offset = Math.max(Math.min(op.width / 2, L / 2), Math.min(L - Math.min(op.width / 2, L / 2), alongOf(wall, c)));
}

/** Sets one end of a wall (curved walls lose their arc: they are straight pieces from then on). */
export function setEnd(draft, wall, end, p) {
  const saved = openingCentres(draft, wall);
  wall[end] = copyPt(p);
  if (wall.curve) delete wall.curve;
  restoreOpenings(wall, saved);
}

/** Every wall end at `p` (within tol): [{ wall, end }]. */
export function endsAt(draft, p, tol = JOIN_EPS) {
  const out = [];
  for (const w of draft.walls) for (const end of ['a', 'b']) if (same(w[end], p, tol)) out.push({ wall: w, end });
  return out;
}

/** Moves a corner: every wall end at `from` goes to `to` (the walls stay joined). Returns how many ends moved. */
export function moveVertex(draft, from, to, tol = JOIN_EPS) {
  const ends = endsAt(draft, from, tol);
  for (const { wall, end } of ends) setEnd(draft, wall, end, to);
  return ends.length;
}

/**
 * Moves walls by `delta` [dx, dz]; ends of other walls joined to them follow (stretching those walls), texts are
 * left alone. Openings on the moved walls go with them.
 */
export function moveWalls(draft, ids, delta) {
  const set = new Set(ids);
  const moving = draft.walls.filter((w) => set.has(w.id));
  const corners = moving.flatMap((w) => [w.a, w.b]).map(copyPt);
  for (const w of moving) {
    w.a = add(w.a, delta); w.b = add(w.b, delta);
    if (w.curve) w.curve = { ...w.curve, cx: w.curve.cx + delta[0], cz: w.curve.cz + delta[1] };
  }
  const seen = new Set();
  for (const c of corners) {
    for (const w of draft.walls) {
      if (set.has(w.id)) continue;
      for (const end of ['a', 'b']) {
        const key = `${w.id}:${end}`;
        if (!seen.has(key) && same(w[end], c)) { seen.add(key); setEnd(draft, w, end, add(c, delta)); }
      }
    }
  }
  return moving.length;
}

// ───────────────────────── adding, splitting, deleting

/** Splits a wall at plan point `p` (on it): the wall keeps a → p, a new wall p → b takes the openings past p. */
export function splitWall(draft, wall, p) {
  const s = alongOf(wall, p);
  const L = wallLength(wall);
  if (s <= 0.01 || s >= L - 0.01) return null;
  const q = pointAlong(wall, s);
  const saved = openingCentres(draft, wall);
  const next = { id: newId('dw'), a: q, b: copyPt(wall.b), thickness: wall.thickness, ...(wall.keep ? { keep: { ...wall.keep } } : {}) };
  wall.b = copyPt(q);
  delete wall.curve;
  const index = draft.walls.indexOf(wall);
  draft.walls.splice(index + 1, 0, next);
  for (const { op, c } of saved) {
    const target = alongOf(wall, c) <= s ? wall : next;
    op.wall = target.id;
    restoreOpenings(target, [{ op, c }]);
  }
  return next;
}

/** The wall whose body (not its ends) `p` lies on, within tol. */
function wallThrough(draft, p, tol, except = null) {
  for (const w of draft.walls) {
    if (w === except || w.curve) continue;
    const s = alongOf(w, p);
    if (s > 0.01 && s < wallLength(w) - 0.01 && distToWall(w, p) <= tol) return w;
  }
  return null;
}

/** Adds a straight wall a → b; walls it starts or ends on are split there (T joints stay joined). */
export function addWall(draft, a, b, thickness = 0.15) {
  if (dist(a, b) < 0.02) return null;
  for (const p of [a, b]) { const host = wallThrough(draft, p, 0.01); if (host) splitWall(draft, host, p); }
  const wall = { id: newId('dw'), a: copyPt(a), b: copyPt(b), thickness };
  draft.walls.push(wall);
  return wall;
}

/** Deletes walls (with their openings), openings and texts by id. Returns how many things went. */
export function deleteItems(draft, ids) {
  const set = new Set(ids);
  const count = () => draft.walls.length + draft.openings.length + draft.texts.length + (draft.furniture?.length ?? 0);
  const before = count();
  const gone = new Set(draft.walls.filter((w) => set.has(w.id)).map((w) => w.id));
  draft.walls = draft.walls.filter((w) => !gone.has(w.id));
  draft.openings = draft.openings.filter((o) => !set.has(o.id) && !gone.has(o.wall));
  draft.texts = draft.texts.filter((t) => !set.has(t.id));
  if (draft.furniture) draft.furniture = draft.furniture.filter((f) => !set.has(f.id));
  return before - count();
}

/**
 * Adds a door / window / passage on a wall, centred at `along` metres from its start (kept inside the wall and
 * clear of the wall's other openings when there is room). `kind`: 'door' | 'double' | 'sliding' | 'window' | 'passage'.
 */
export function addOpening(draft, wall, along, kind = 'door', width = null) {
  const L = wallLength(wall);
  const w = Math.min(width ?? (kind === 'window' ? 1.2 : kind === 'double' ? 1.4 : kind === 'sliding' ? 1.8 : 0.9), Math.max(0.3, L - 0.1));
  if (L < 0.4) return null;
  let offset = Math.max(w / 2 + 0.05, Math.min(L - w / 2 - 0.05, along));
  if (offset < w / 2 || offset > L - w / 2) offset = L / 2;
  const defaults = openingDefaults(kind, w);
  const op = { id: newId('do'), wall: wall.id, kind, offset, width: w, ...defaults, side: 'left', ...(kind === 'door' || kind === 'double' ? { hinge: 'left' } : {}) };
  draft.openings.push(op);
  return op;
}

/** Adds a room name (or any label) at `p`. */
export function addText(draft, p, text, height = 0.4) {
  const label = { id: newId('dt'), text: String(text), p: copyPt(p), height };
  draft.texts.push(label);
  return label;
}

// ───────────────────────── cleanup commands

/** Union-find over n items. */
function unionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  return { find, union: (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb; } };
}

/** Corners of the draft: { points: [[x,z]], ends: Map(`${wallId}:a|b` → corner index) } (ends within tol joined). */
export function corners(draft, tol = JOIN_EPS) {
  const points = []; const ends = new Map(); const count = [];
  for (const w of draft.walls) {
    for (const end of ['a', 'b']) {
      let i = points.findIndex((p) => same(p, w[end], tol));
      if (i < 0) { i = points.length; points.push(copyPt(w[end])); count.push(0); }
      count[i] += 1;
      ends.set(`${w.id}:${end}`, i);
    }
  }
  return { points, ends, count };
}

/**
 * Squares the plan up: walls within `tolDeg` of horizontal or vertical become exactly so. Corners stay
 * joined: the corners of one horizontal run share one z, those of a vertical run one x (length-weighted mean).
 * Returns how many walls were turned.
 */
export function squareUp(draft, { tolDeg = 6 } = {}) {
  const tol = (tolDeg * Math.PI) / 180;
  const { points, ends } = corners(draft);
  const zGroups = unionFind(points.length); const xGroups = unionFind(points.length);
  const inZ = new Set(); const inX = new Set();
  let turned = 0;
  for (const w of draft.walls) {
    if (w.curve || wallLength(w) < 0.02) continue;
    const d = sub(w.b, w.a);
    const angle = Math.atan2(d[1], d[0]);
    const offH = Math.abs(Math.sin(angle)); const offV = Math.abs(Math.cos(angle));
    const i = ends.get(`${w.id}:a`); const j = ends.get(`${w.id}:b`);
    if (offH <= Math.sin(tol)) { zGroups.union(i, j); inZ.add(i); inZ.add(j); if (offH > 1e-9) turned++; } else if (offV <= Math.sin(tol)) { xGroups.union(i, j); inX.add(i); inX.add(j); if (offV > 1e-9) turned++; }
  }
  const mean = (group, set, axis) => {
    const sum = new Map();
    for (const i of set) {
      const r = group.find(i);
      const s = sum.get(r) ?? [0, 0];
      // Weight: the length of the walls at this corner (long walls move least).
      const weight = 1 + draft.walls.filter((w) => ends.get(`${w.id}:a`) === i || ends.get(`${w.id}:b`) === i).reduce((t, w) => t + wallLength(w), 0);
      s[0] += points[i][axis] * weight; s[1] += weight;
      sum.set(r, s);
    }
    return (i) => { const s = sum.get(group.find(i)); return s[0] / s[1]; };
  };
  const zOf = mean(zGroups, inZ, 1); const xOf = mean(xGroups, inX, 0);
  const target = points.map((p, i) => [inX.has(i) ? xOf(i) : p[0], inZ.has(i) ? zOf(i) : p[1]]);
  for (const w of draft.walls) {
    if (w.curve) continue;
    const saved = openingCentres(draft, w);
    w.a = target[ends.get(`${w.id}:a`)]; w.b = target[ends.get(`${w.id}:b`)];
    w.a = copyPt(w.a); w.b = copyPt(w.b);
    restoreOpenings(w, saved);
  }
  return turned;
}

/** Point where the lines through walls u and v cross (null when nearly parallel). */
function lineCross(u, v) {
  const du = sub(u.b, u.a); const dv = sub(v.b, v.a);
  const den = cross(du, dv);
  if (Math.abs(den) < 1e-9 * wallLength(u) * wallLength(v) || Math.abs(den) / (wallLength(u) * wallLength(v)) < Math.sin((5 * Math.PI) / 180)) return null;
  const t = cross(sub(v.a, u.a), dv) / den;
  return add(u.a, mul(du, t));
}

/** Free wall ends: ends at a corner of one wall that do not touch another wall's body. [{ wall, end }] */
export function openEnds(draft) {
  const { ends, count } = corners(draft);
  const out = [];
  for (const w of draft.walls) {
    for (const end of ['a', 'b']) {
      if (count[ends.get(`${w.id}:${end}`)] !== 1) continue;
      if (wallThrough(draft, w[end], Math.max(0.01, w.thickness * 0.1), w)) continue;
      out.push({ wall: w, end });
    }
  }
  return out;
}

/**
 * Closes the gaps of the recognition: free wall ends within `tol` metres of another free end meet (at the
 * walls' crossing for a corner, else halfway), then free ends near a wall run on to it (a T joint, the wall is
 * split there) or to a corner nearby. Returns how many ends were joined.
 */
export function joinEnds(draft, { tol = 0.3 } = {}) {
  let joined = 0;
  // 1. Free end ↔ free end.
  let free = openEnds(draft);
  const done = new Set();
  for (const e of free) {
    const key = `${e.wall.id}:${e.end}`;
    if (done.has(key)) continue;
    let best = null;
    for (const f of free) {
      if (f.wall === e.wall || done.has(`${f.wall.id}:${f.end}`)) continue;
      const d = dist(e.wall[e.end], f.wall[f.end]);
      if (d <= tol && (!best || d < best.d)) best = { f, d };
    }
    if (!best) continue;
    const f = best.f;
    const meet = lineCross(e.wall, f.wall);
    const p = meet && dist(meet, e.wall[e.end]) <= tol * 1.5 && dist(meet, f.wall[f.end]) <= tol * 1.5 ? meet : mul(add(e.wall[e.end], f.wall[f.end]), 0.5);
    setEnd(draft, e.wall, e.end, p); setEnd(draft, f.wall, f.end, p);
    done.add(key); done.add(`${f.wall.id}:${f.end}`);
    joined += 2;
  }
  // 2. Free end → a corner nearby, or on to a wall body (along its own direction first, else the nearest foot).
  free = openEnds(draft);
  for (const e of free) {
    const p = e.wall[e.end];
    const cs = corners(draft).points.filter((c) => !same(c, p) && !same(c, e.wall[e.end === 'a' ? 'b' : 'a']));
    const corner = cs.map((c) => ({ c, d: dist(c, p) })).filter((x) => x.d <= tol).sort((x, y) => x.d - y.d)[0];
    if (corner) { setEnd(draft, e.wall, e.end, corner.c); joined++; continue; }
    let best = null;
    for (const w of draft.walls) {
      if (w === e.wall || w.curve) continue;
      const meet = lineCross(e.wall, w);
      const L = wallLength(w);
      if (meet) {
        const s = alongOf(w, meet);
        const d = dist(meet, p);
        if (s > 0.01 && s < L - 0.01 && d <= tol && (!best || d < best.d)) best = { w, p: meet, d };
      }
    }
    if (best) {
      setEnd(draft, e.wall, e.end, best.p);
      splitWall(draft, best.w, best.p);
      joined++;
    }
  }
  return joined;
}

/**
 * Joins straight walls that continue each other (same direction within `angTolDeg`, same line within `offTol`,
 * same thickness within `thickTol`) at a corner no third wall uses. Openings move to the joined wall.
 * Returns how many joints were removed.
 */
export function mergeCollinear(draft, { angTolDeg = 2, offTol = 0.03, thickTol = 0.03 } = {}) {
  let merged = 0;
  for (let guard = 0; guard < 10000; guard++) {
    const { points, ends, count } = corners(draft);
    let pair = null;
    for (let i = 0; i < points.length && !pair; i++) {
      if (count[i] !== 2) continue;
      const at = draft.walls.filter((w) => ends.get(`${w.id}:a`) === i || ends.get(`${w.id}:b`) === i);
      if (at.length !== 2 || at.some((w) => w.curve) || at[0] === at[1]) continue;
      const [u, v] = at;
      if (Math.abs(u.thickness - v.thickness) > thickTol) continue;
      const du = wallDir(u); const dv = wallDir(v);
      if (Math.abs(cross(du, dv)) > Math.sin((angTolDeg * Math.PI) / 180)) continue;
      const farU = ends.get(`${u.id}:a`) === i ? u.b : u.a;
      const farV = ends.get(`${v.id}:a`) === i ? v.b : v.a;
      // Must continue (not fold back) and stay on one line.
      if (dot(sub(points[i], farU), sub(farV, points[i])) <= 0) continue;
      const line = { a: farU, b: farV };
      if (Math.abs(cross(wallDir(line), sub(points[i], farU))) > offTol) continue;
      pair = { u, v, farU: copyPt(farU), farV: copyPt(farV) };
    }
    if (!pair) break;
    const { u, v, farU, farV } = pair;
    const saved = [...openingCentres(draft, u), ...openingCentres(draft, v)];
    u.a = farU; u.b = farV;
    u.thickness = Math.max(u.thickness, v.thickness);
    for (const s of saved) s.op.wall = u.id;
    restoreOpenings(u, saved);
    draft.walls = draft.walls.filter((w) => w !== v);
    merged++;
  }
  return merged;
}

/**
 * Removes walls shorter than `min` metres (recognition crumbs): each collapses to its middle, so the walls joined
 * to it stay joined. Curved pieces are kept. Returns how many walls went.
 */
export function removeShort(draft, { min = 0.12 } = {}) {
  let removed = 0;
  for (const w of [...draft.walls]) {
    if (w.curve || !draft.walls.includes(w) || wallLength(w) >= min) continue;
    const mid = mul(add(w.a, w.b), 0.5);
    const a = copyPt(w.a); const b = copyPt(w.b);
    draft.walls = draft.walls.filter((x) => x !== w);
    draft.openings = draft.openings.filter((o) => o.wall !== w.id);
    // Only ends that were joined to this crumb move.
    for (const p of [a, b]) if (endsAt(draft, p).length) moveVertex(draft, p, mid);
    removed++;
  }
  return removed;
}

/** Sets the thickness of the given walls (all walls when `ids` is null). Returns how many changed. */
export function setThickness(draft, ids, thickness) {
  const set = ids ? new Set(ids) : null;
  let n = 0;
  for (const w of draft.walls) if ((!set || set.has(w.id)) && Math.abs(w.thickness - thickness) > 1e-9) { w.thickness = thickness; n++; }
  return n;
}

/** Sets a straight wall's length, keeping its start (and what is joined to its end follows). */
export function setWallLength(draft, wall, length) {
  if (!(length > 0.02) || wall.curve) return false;
  const to = add(wall.a, mul(wallDir(wall), length));
  moveVertex(draft, wall.b, to);
  return true;
}

/** Scales the whole draft about `origin` by k (a two-point calibration): walls, thickness, openings, texts, lines. */
export function scaleDraft(draft, origin, k) {
  if (!(k > 0) || Math.abs(k - 1) < 1e-12) return false;
  const s = (p) => [origin[0] + (p[0] - origin[0]) * k, origin[1] + (p[1] - origin[1]) * k];
  for (const w of draft.walls) {
    w.a = s(w.a); w.b = s(w.b); w.thickness *= k;
    if (w.curve) { const c = s([w.curve.cx, w.curve.cz]); w.curve = { ...w.curve, cx: c[0], cz: c[1], r: w.curve.r * k }; }
  }
  for (const o of draft.openings) { o.offset *= k; o.width *= k; }
  for (const t of draft.texts) t.p = s(t.p);
  for (const l of draft.leftovers) { l.a = s(l.a); l.b = s(l.b); }
  // Furniture moves with the plan; its size follows (a picture at the wrong scale had it at the wrong size too).
  for (const f of draft.furniture ?? []) {
    f.position = s(f.position); f.size = f.size.map((v) => v * k);
    for (const key of ['width', 'depth', 'length', 'chaise']) if (typeof f.params?.[key] === 'number') f.params[key] *= k;
  }
  return true;
}

/**
 * The tilt of the plan: the length-weighted mean wall direction modulo 90° (radians, in (−45°, 45°]); 0 for a plan
 * drawn square. A scan or photo of a drawing is usually turned by this much.
 */
export function dominantAngle(draft) {
  let c = 0; let s = 0;
  for (const w of draft.walls) {
    if (w.curve) continue;
    const L = wallLength(w);
    if (L < 0.05) continue;
    const a = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
    c += L * Math.cos(4 * a); s += L * Math.sin(4 * a);
  }
  if (Math.hypot(c, s) < 1e-9) return 0;
  return Math.atan2(s, c) / 4;
}

/** Turns the draft by `angle` (radians, +x towards +z) about `centre`: walls, arcs, texts and reference lines. */
export function rotateDraft(draft, centre, angle) {
  if (Math.abs(angle) < 1e-12) return false;
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  const R = (p) => { const dx = p[0] - centre[0]; const dz = p[1] - centre[1]; return [centre[0] + dx * cos - dz * sin, centre[1] + dx * sin + dz * cos]; };
  for (const w of draft.walls) {
    w.a = R(w.a); w.b = R(w.b);
    if (w.curve) { const c = R([w.curve.cx, w.curve.cz]); w.curve = { ...w.curve, cx: c[0], cz: c[1], a0: w.curve.a0 + angle, a1: w.curve.a1 + angle }; }
  }
  for (const t of draft.texts) t.p = R(t.p);
  for (const l of draft.leftovers) { l.a = R(l.a); l.b = R(l.b); }
  // Turning the plan by a turns each piece's front (sin θ, cos θ) to (sin(θ − a), cos(θ − a)).
  for (const f of draft.furniture ?? []) { f.position = R(f.position); f.rotation -= angle; }
  return true;
}

/**
 * A point of the workbench's background (a picture or drawing lines) in plan metres. The background is
 * { offset [x, z] (plan point of its source origin), k (metres per source unit), rotation (radians), centre [x, z]
 * (source units, what it turns about) }; `q` is in source units (pixels of a picture).
 */
export function backgroundPoint(bg, q) {
  const local = [bg.offset[0] + q[0] * bg.k, bg.offset[1] + q[1] * bg.k];
  const r = bg.rotation ?? 0;
  if (!r) return local;
  const c = [bg.offset[0] + bg.centre[0] * bg.k, bg.offset[1] + bg.centre[1] * bg.k];
  const cos = Math.cos(r); const sin = Math.sin(r);
  const dx = local[0] - c[0]; const dz = local[1] - c[1];
  return [c[0] + dx * cos - dz * sin, c[1] + dx * sin + dz * cos];
}

/** The plan point the background turns about. */
export const backgroundCentre = (bg) => [bg.offset[0] + bg.centre[0] * bg.k, bg.offset[1] + bg.centre[1] * bg.k];

/** One automatic cleanup pass: crumbs, squaring, gaps, straight runs (the workbench's "Clean up all"). */
export function cleanupAll(draft, { squareTolDeg = 6, joinTol = 0.3, minWall = 0.12 } = {}) {
  const removed = removeShort(draft, { min: minWall });
  const joined = joinEnds(draft, { tol: joinTol });
  const squared = squareUp(draft, { tolDeg: squareTolDeg });
  const joined2 = joinEnds(draft, { tol: joinTol });
  const merged = mergeCollinear(draft);
  return { removed, joined: joined + joined2, squared, merged };
}

// ───────────────────────── checks, snapping, picking

/**
 * What is still wrong with the draft before it becomes 3D: [{ kind, at: [x,z], ids }].
 * kinds: 'open-end' (a wall end touching nothing), 'short-wall', 'overlap' (two walls on top of each other),
 * 'opening-wide' (wider than its wall), 'opening-overlap' (two openings on one spot).
 */
export function draftProblems(draft) {
  const out = [];
  for (const { wall, end } of openEnds(draft)) out.push({ kind: 'open-end', at: copyPt(wall[end]), ids: [wall.id] });
  for (const w of draft.walls) if (!w.curve && wallLength(w) < 0.12) out.push({ kind: 'short-wall', at: mul(add(w.a, w.b), 0.5), ids: [w.id] });
  for (let i = 0; i < draft.walls.length; i++) {
    const u = draft.walls[i];
    if (u.curve) continue;
    for (let j = i + 1; j < draft.walls.length; j++) {
      const v = draft.walls[j];
      if (v.curve || Math.abs(cross(wallDir(u), wallDir(v))) > 0.02) continue;
      if (distToWall(u, v.a) > 0.03 && distToWall(u, v.b) > 0.03 && distToWall(v, u.a) > 0.03 && distToWall(v, u.b) > 0.03) continue;
      if (Math.abs(cross(wallDir(u), sub(v.a, u.a))) > 0.03) continue;
      const L = wallLength(u);
      const s0 = Math.max(0, Math.min(alongOf(u, v.a), alongOf(u, v.b)));
      const s1 = Math.min(L, Math.max(alongOf(u, v.a), alongOf(u, v.b)));
      if (s1 - s0 > 0.05) out.push({ kind: 'overlap', at: pointAlong(u, (s0 + s1) / 2), ids: [u.id, v.id] });
    }
  }
  const byWall = new Map(draft.walls.map((w) => [w.id, w]));
  for (const o of draft.openings) {
    const w = byWall.get(o.wall);
    if (!w) continue;
    if (o.width > wallLength(w) - 0.02) out.push({ kind: 'opening-wide', at: pointAlong(w, o.offset), ids: [o.id] });
  }
  for (const w of draft.walls) {
    const ops = draft.openings.filter((o) => o.wall === w.id).sort((x, y) => x.offset - y.offset);
    for (let i = 1; i < ops.length; i++) {
      if (ops[i].offset - ops[i].width / 2 < ops[i - 1].offset + ops[i - 1].width / 2 - 0.01) out.push({ kind: 'opening-overlap', at: pointAlong(w, (ops[i].offset + ops[i - 1].offset) / 2), ids: [ops[i - 1].id, ops[i].id] });
    }
  }
  return out;
}

/**
 * The point to use for a pointer at `p` (plan metres): a wall end or corner within `tol`, else the middle of a
 * wall, else the foot on a wall's centre line; otherwise `p` itself. Returns { p, kind: 'end'|'mid'|'on'|null, wall }.
 */
export function snapPoint(draft, p, tol, { skipWalls = null } = {}) {
  let best = null;
  const skip = skipWalls ? new Set(skipWalls) : null;
  for (const w of draft.walls) {
    if (skip?.has(w.id)) continue;
    for (const end of ['a', 'b']) {
      const d = dist(w[end], p);
      if (d <= tol && (!best || best.kind !== 'end' || d < best.d)) best = { p: copyPt(w[end]), kind: 'end', wall: w, d };
    }
  }
  if (best) return best;
  for (const w of draft.walls) {
    if (skip?.has(w.id)) continue;
    const mid = mul(add(w.a, w.b), 0.5);
    const d = dist(mid, p);
    if (d <= tol * 0.8 && (!best || d < best.d)) best = { p: mid, kind: 'mid', wall: w, d };
  }
  if (best) return best;
  for (const w of draft.walls) {
    if (skip?.has(w.id) || w.curve) continue;
    const d = distToWall(w, p);
    if (d <= tol && (!best || d < best.d)) {
      const s = Math.max(0, Math.min(wallLength(w), alongOf(w, p)));
      best = { p: pointAlong(w, s), kind: 'on', wall: w, d };
    }
  }
  return best ?? { p: copyPt(p), kind: null, wall: null, d: 0 };
}

/** The opening under `p` (within tol of its span on the wall), else null. */
export function openingAt(draft, p, tol) {
  const byWall = new Map(draft.walls.map((w) => [w.id, w]));
  let best = null;
  for (const o of draft.openings) {
    const w = byWall.get(o.wall);
    if (!w) continue;
    const s = alongOf(w, p);
    const off = Math.abs(cross(wallDir(w), sub(p, w.a)));
    if (Math.abs(s - o.offset) <= o.width / 2 && off <= w.thickness / 2 + tol) {
      const d = off + Math.abs(s - o.offset) * 0.01;
      if (!best || d < best.d) best = { op: o, d };
    }
  }
  return best?.op ?? null;
}

/** The wall under `p` (within its half thickness plus tol), else null. */
export function wallAt(draft, p, tol) {
  let best = null;
  for (const w of draft.walls) {
    const d = distToWall(w, p);
    if (d <= w.thickness / 2 + tol && (!best || d < best.d)) best = { w, d };
  }
  return best?.w ?? null;
}

/** The text under `p` (within `tol`, scaled with its height), else null. */
export function textAt(draft, p, tol) {
  let best = null;
  for (const t of draft.texts) {
    const d = dist(t.p, p);
    if (d <= tol + (t.height ?? 0.3) * Math.max(1, String(t.text).length * 0.3) && (!best || d < best.d)) best = { t, d };
  }
  return best?.t ?? null;
}

/** Bounds of what is drawn ({ min, max } or null). */
export function draftBounds(draft, { leftovers = true } = {}) {
  const pts = [...draft.walls.flatMap((w) => [w.a, w.b]), ...draft.texts.map((t) => t.p), ...(draft.furniture ?? []).map((f) => f.position), ...(leftovers ? draft.leftovers.flatMap((l) => [l.a, l.b]) : [])];
  if (!pts.length) return null;
  return { min: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], max: [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] };
}

/** Counts for the status line. */
export function draftStats(draft) {
  const kinds = draft.openings.map(openingKind);
  return { walls: draft.walls.length, doors: kinds.filter((k) => k === 'door').length, windows: kinds.filter((k) => k === 'window').length, passages: kinds.filter((k) => k === 'passage').length, texts: draft.texts.length, furniture: draft.furniture?.length ?? 0 };
}

/**
 * How good a recognised plan of a picture is after the automatic cleanup (straightened, squared, joined, merged) of a
 * copy: { problems, rooms, walls, score } — score = 2 × problems − rooms (lower is better: little to fix by hand,
 * closed rooms). Used to choose between the wall detection variants.
 */
export function detectionScore(result) {
  const d = fromResult({ ...result, texts: [] });
  rotateDraft(d, [0, 0], -dominantAngle(d));
  cleanupAll(d);
  const problems = draftProblems(d).length;
  let rooms = 0;
  try { rooms = planEntities(toResult(d), { level: 'score', keepLeftovers: false }).rooms.length; } catch { rooms = 0; }
  return { problems, rooms, walls: d.walls.length, score: 2 * problems - rooms };
}

/**
 * The best of several recognised plans of one picture (index), given in order of preference: the first whose score
 * is within `slack` of the best one (so a preferred variant — the walls-only picture — wins unless another is clearly
 * better). Plans without walls never win while another has some.
 */
export function pickDetection(results, { slack = 2 } = {}) {
  const scores = results.map((r) => (r?.walls?.length ? detectionScore(r).score : Infinity));
  const best = Math.min(...scores);
  if (!Number.isFinite(best)) return 0;
  return scores.findIndex((s) => s <= best + slack);
}

/** Corners of a piece of furniture's footprint (plan metres): its rectangle turned by its rotation. */
export function furnitureCorners(f) {
  const [w, d] = f.size; const r = f.rotation ?? 0;
  const u = [Math.cos(r), -Math.sin(r)]; const fr = [Math.sin(r), Math.cos(r)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [f.position[0] + (u[0] * a * w) / 2 + (fr[0] * b * d) / 2, f.position[1] + (u[1] * a * w) / 2 + (fr[1] * b * d) / 2]);
}

/** The piece of furniture under `p` (the smallest one, so a chair on a rug wins), else null. */
export function furnitureAt(draft, p, tol = 0) {
  let best = null;
  for (const f of draft.furniture ?? []) {
    const r = f.rotation ?? 0;
    const dx = p[0] - f.position[0]; const dz = p[1] - f.position[1];
    const a = dx * Math.cos(r) - dz * Math.sin(r); const b = dx * Math.sin(r) + dz * Math.cos(r);
    if (Math.abs(a) <= f.size[0] / 2 + tol && Math.abs(b) <= f.size[1] / 2 + tol && (!best || f.size[0] * f.size[1] < best.size[0] * best.size[1])) best = f;
  }
  return best;
}
