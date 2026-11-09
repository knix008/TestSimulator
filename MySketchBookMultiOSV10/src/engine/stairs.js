// Stair geometry (pure: no three, no DOM; Node-testable). The `stairs` library item
// (library/parametric/structure.js) builds its meshes from `stairLayout()`, the Stairs
// tool places it from the start point and direction, the checks read its steps, and
// `syncStairwells()` cuts the hole for it in the floor of the level it reaches.
//
// Local frame of a stair (ARCHITECTURE.md §12): metres, Y up, the climber starts at
// the front (+Z) and climbs towards −Z; the layout is centred so the bounding box of
// its footprint is centred on the origin (library items: origin = bottom centre).
//
// Types used in real buildings:
//   straight — one flight;
//   l        — two flights at right angles with a quarter landing;
//   winder   — the same L with three winders (kite winder) instead of the landing;
//   u        — switchback / dog-leg: two parallel flights, a half landing across both,
//              an open well `gap` between them (a central wall when it is under 5 cm);
//   spiral   — wedge treads round a central pole, turning `angle` degrees, `diameter` across,
//              a quarter landing level with the floor above at the top;
//   curved   — helical stair round an open well (`innerRadius`, flight `width`).
//
// n risers of equal height: n = ceil(rise / maxRiser); n − 1 treads (landings and winders
// count as treads), the last riser climbs onto the floor above. `run` is the going of a
// tread (on the walking line for winders and spirals the going varies).
import { levelOf, polygonArea } from './document.js';

export const STAIR_TYPES = ['straight', 'l', 'winder', 'u', 'spiral', 'curved'];
/** Handrail height above the pitch line and guard height above the floor above (metres). */
export const RAIL_HEIGHT = 0.9;
export const GUARD_HEIGHT = 1.0;
export const POLE_RADIUS = 0.06;
/** Extra opening round a stair in the floor above (not at the arrival edge, where the floor meets the top riser). */
export const HOLE_CLEARANCE = 0.05;
/** Minimum clear height over a stair (pitch line to the ceiling or slab above). */
export const HEADROOM = 2.0;

export const STAIR_DEFAULTS = {
  type: 'straight', rise: 2.6, width: 0.9, run: 0.26, maxRiser: 0.19, turn: 'left',
  landing: 0, gap: 0.1, angle: 360, diameter: 1.6, innerRadius: 0.5,
  rail: 'baluster', railSides: 'auto', risers: 'closed', guard: false, stairwell: true,
};

const clampN = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

/** Parameters with defaults filled in and numbers kept in their useful ranges. */
export function stairParams(params = {}) {
  const p = { ...STAIR_DEFAULTS };
  for (const [k, v] of Object.entries(params ?? {})) if (v != null) p[k] = v;
  p.type = STAIR_TYPES.includes(p.type) ? p.type : 'straight';
  p.rise = clampN(p.rise, 0.2, 8, STAIR_DEFAULTS.rise);
  p.width = clampN(p.width, 0.5, 3, STAIR_DEFAULTS.width);
  p.run = clampN(p.run, 0.15, 0.45, STAIR_DEFAULTS.run);
  p.maxRiser = clampN(p.maxRiser, 0.1, 0.25, STAIR_DEFAULTS.maxRiser);
  p.landing = clampN(p.landing, 0, 4, 0);
  p.gap = clampN(p.gap, 0, 1, STAIR_DEFAULTS.gap);
  p.angle = clampN(p.angle, 90, 720, STAIR_DEFAULTS.angle);
  p.diameter = clampN(p.diameter, 1.0, 4, STAIR_DEFAULTS.diameter);
  p.innerRadius = clampN(p.innerRadius, 0.1, 4, STAIR_DEFAULTS.innerRadius);
  p.turn = p.turn === 'right' ? 'right' : 'left';
  return p;
}

export const riserCount = (rise, maxRiser) => Math.max(2, Math.ceil(rise / maxRiser - 1e-9));

// ───────────────────────── layout

const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
/** A rectangular tread; `front` names its front edge (where its riser stands). */
function rectStep(x0, x1, z0, z1, y, front, extra = {}) {
  const f = { zmax: [[x0, z1], [x1, z1]], zmin: [[x0, z0], [x1, z0]], xmin: [[x0, z0], [x0, z1]], xmax: [[x1, z0], [x1, z1]] }[front];
  return { poly: rect(x0, x1, z0, z1), y, front: f, ...extra };
}

/** Removes repeated consecutive points (and a closing repeat). */
function dedupe(poly) {
  const out = [];
  for (const q of poly) if (!out.length || Math.hypot(q[0] - out.at(-1)[0], q[1] - out.at(-1)[1]) > 1e-9) out.push(q);
  while (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 1e-9) out.pop();
  return out;
}

/**
 * The full geometry of a stair, centred: {
 *   type, n, riser, going, rise, width,
 *   steps: [{ poly: [[x, z]…], y (top), front: [[x, z], [x, z]] | null, landing?, platform? }],
 *   exit: { a, b } (the arrival edge: the last riser, unless a platform carries it), exitRiser: bool,
 *   sides: [{ side: 'inner'|'outer', in: ±1 (stair interior to the left (+1) of the travel direction), pts: [[x, z, pitchY]…], stringer, rail }],
 *   guard: [[[x, z]…]] (polylines round the opening at floor height above), posts: [{ x, z, y }] (supports under landings),
 *   spine: { pts: [[x, z, top]…], thick } | null, pole: { x, z, r, h } | null,
 *   footprint: [[x, z]…], hole: [[x, z]…] (its last edge is the arrival edge), start: [x, z] (middle of the first riser), dir: [0, −1],
 *   size: [w, h, d], walkGoing (going on the walking line), blondel (2R + G),
 * }
 */
export function stairLayout(params) {
  const p = stairParams(params);
  const rise = p.rise; const n = riserCount(rise, p.maxRiser); const rh = rise / n; const G = p.run; const w = p.width;
  let type = p.type;
  if ((type === 'l' || type === 'u') && n < 4) type = 'straight';
  if (type === 'winder' && n < 6) type = n >= 4 ? 'l' : 'straight';
  const c = HOLE_CLEARANCE;
  const L = {
    type, n, riser: rh, going: G, rise, width: w, turn: p.turn,
    steps: [], exit: null, exitRiser: true, sides: [], guard: [], posts: [], spine: null, pole: null, footprint: [], hole: [], start: [0, 0], dir: [0, -1],
  };
  const flight1 = (count) => { for (let i = 1; i <= count; i++) L.steps.push(rectStep(-w / 2, w / 2, -i * G, -(i - 1) * G, i * rh, 'zmax')); };
  let walkGoing = G;

  if (type === 'straight') {
    const len = (n - 1) * G;
    flight1(n - 1);
    L.exit = { a: [-w / 2, -len], b: [w / 2, -len] };
    L.sides.push({ side: 'outer', in: 1, pts: [[-w / 2, 0, rh], [-w / 2, -len, rise]] });
    L.sides.push({ side: 'inner', in: -1, pts: [[w / 2, 0, rh], [w / 2, -len, rise]] });
    L.footprint = rect(-w / 2, w / 2, -len, 0);
    L.hole = [[w / 2 + c, -len], [w / 2 + c, c], [-w / 2 - c, c], [-w / 2 - c, -len]];
    L.guard.push([[w / 2, -len], [w / 2, 0], [-w / 2, 0], [-w / 2, -len]]);
  } else if (type === 'l' || type === 'winder') {
    const winder = type === 'winder';
    const a = Math.ceil((n - (winder ? 4 : 2)) / 2); const b = n - (winder ? 4 : 2) - a;
    const Ld = winder ? w : Math.max(w, p.landing || w);
    const zL0 = -a * G; const zL1 = zL0 - Ld; const yL = (a + 1) * rh;
    flight1(a);
    const zf0 = zL1; const zf1 = zL1 + w;
    const first2 = winder ? a + 3 : a + 1; // index of the tread before flight 2
    if (winder) {
      // Kite winder: the corner square split by lines at 30° and 60° from the inner corner.
      const t = w * Math.tan(Math.PI / 6);
      const C = [w / 2, zL0]; const P1 = [-w / 2, zL0]; const P2 = [-w / 2, zL0 - w]; const P3 = [w / 2, zL0 - w];
      const Q30 = [-w / 2, zL0 - t]; const Q60 = [w / 2 - t, zL0 - w];
      L.steps.push({ poly: [C, P1, Q30], y: (a + 1) * rh, front: [P1, C], winder: true });
      L.steps.push({ poly: [C, Q30, P2, Q60], y: (a + 2) * rh, front: [C, Q30], winder: true });
      L.steps.push({ poly: [C, Q60, P3], y: (a + 3) * rh, front: [C, Q60], winder: true });
      L.sides.push({ side: 'outer', in: 1, pts: [[-w / 2, 0, rh], [...P1, (a + 1) * rh], [...Q30, (a + 2) * rh], [...P2, (a + 2.5) * rh], [...Q60, (a + 3) * rh], [...P3, (a + 4) * rh], [w / 2 + b * G, zf0, rise]] });
      L.sides.push({ side: 'inner', in: -1, pts: [[w / 2, 0, rh], [...C, (a + 1) * rh], [...C, (a + 4) * rh], [w / 2 + b * G, zf1, rise]] });
      // Going on the walking line (half the width in): the three winders share a quarter circle.
      walkGoing = (Math.PI / 2) * (w / 2) / 3;
    } else {
      L.steps.push({ ...rectStep(-w / 2, w / 2, zL1, zL0, yL, 'zmax'), landing: true });
      L.sides.push({ side: 'outer', in: 1, pts: [[-w / 2, 0, rh], [-w / 2, zL0, yL], [-w / 2, zL1, yL], [w / 2, zL1, yL], [w / 2, zL1, yL + rh], [w / 2 + b * G, zL1, rise]] });
      L.sides.push({ side: 'inner', in: -1, pts: [[w / 2, 0, rh], [w / 2, zL0, yL], ...(Ld > w + 1e-6 ? [[w / 2, zf1, yL]] : []), [w / 2, zf1, yL + rh], [w / 2 + b * G, zf1, rise]] });
      L.posts.push({ x: -w / 2 + 0.05, z: zL1 + 0.05, y: yL });
    }
    for (let k = 1; k <= b; k++) L.steps.push(rectStep(w / 2 + (k - 1) * G, w / 2 + k * G, zf0, zf1, (first2 + k) * rh, 'xmin'));
    const X2 = w / 2 + b * G;
    L.exit = { a: [X2, zf0], b: [X2, zf1] };
    L.footprint = dedupe([[-w / 2, 0], [w / 2, 0], [w / 2, zf1], [X2, zf1], [X2, zf0], [-w / 2, zf0]]);
    L.hole = dedupe([[X2, zf1 + c], [w / 2 + c, zf1 + c], [w / 2 + c, c], [-w / 2 - c, c], [-w / 2 - c, zf0 - c], [X2, zf0 - c]]);
    L.guard.push(dedupe([[X2, zf1], [w / 2, zf1], [w / 2, 0], [-w / 2, 0], [-w / 2, zf0], [X2, zf0]]));
  } else if (type === 'u') {
    const a = Math.ceil((n - 2) / 2); const b = n - 2 - a;
    const g = p.gap; const Ld = Math.max(0.6, p.landing || w);
    const zL0 = -a * G; const zL1 = zL0 - Ld; const yL = (a + 1) * rh;
    const xR0 = w / 2 + g; const xR1 = 1.5 * w + g; const zE = zL0 + b * G;
    flight1(a);
    // Half landing across both flights and the well; its riser stands under flight 1 only.
    L.steps.push({ poly: rect(-w / 2, xR1, zL1, zL0), y: yL, front: [[-w / 2, zL0], [w / 2, zL0]], landing: true });
    for (let k = 1; k <= b; k++) L.steps.push(rectStep(xR0, xR1, zL0 + (k - 1) * G, zL0 + k * G, (a + 1 + k) * rh, 'zmin'));
    L.exit = { a: [xR0, zE], b: [xR1, zE] };
    L.sides.push({ side: 'outer', in: 1, pts: [[-w / 2, 0, rh], [-w / 2, zL0, yL], [-w / 2, zL1, yL], [xR1, zL1, yL], [xR1, zL0, yL], [xR1, zL0, yL + rh], [xR1, zE, rise]] });
    if (g >= 0.05) {
      L.sides.push({ side: 'inner', in: -1, pts: [[w / 2, 0, rh], [w / 2, zL0, yL], [xR0, zL0, yL], [xR0, zL0, yL + rh], [xR0, zE, rise]] });
    } else {
      // No room for two balustrades in the well: a central wall carries the inner ends of the treads.
      L.sides.push({ side: 'inner', in: -1, pts: [[w / 2, 0, rh], [w / 2, zL0, yL]], rail: false });
      L.sides.push({ side: 'inner', in: -1, pts: [[xR0, zL0, yL + rh], [xR0, zE, rise]], rail: false });
      const xm = w / 2 + g / 2;
      L.spine = { thick: Math.max(g, 0.04), pts: dedupePts([[xm, 0, rise + RAIL_HEIGHT], [xm, zE, rise + RAIL_HEIGHT], [xm, zL0, yL + rh + RAIL_HEIGHT]]) };
    }
    L.posts.push({ x: -w / 2 + 0.05, z: zL1 + 0.05, y: yL }, { x: xR1 - 0.05, z: zL1 + 0.05, y: yL });
    L.footprint = dedupe([[-w / 2, 0], [xR0, 0], [xR0, zE], [xR1, zE], [xR1, zL1], [-w / 2, zL1]]);
    L.hole = dedupe([[xR0, zE], [xR0, c], [-w / 2 - c, c], [-w / 2 - c, zL1 - c], [xR1 + c, zL1 - c], [xR1 + c, zE]]);
    L.guard.push(dedupe([[xR0, zE], [xR0, 0], [-w / 2, 0], [-w / 2, zL1], [xR1, zL1], [xR1, zE]]));
  } else {
    // spiral / curved: angle φ from the start line; turning right (before mirroring) the start line points to −x.
    const spiral = type === 'spiral';
    const A = ((spiral ? p.angle : Math.min(330, p.angle)) * Math.PI) / 180;
    const ro = spiral ? p.diameter / 2 : p.innerRadius + w;
    const ri = spiral ? POLE_RADIUS : p.innerRadius;
    const tin = spiral ? POLE_RADIUS * 0.5 : ri; // spiral treads reach into the pole
    const d = A / (n - 1);
    const pt = (phi, r) => [-r * Math.cos(phi), -r * Math.sin(phi)];
    const arcPts = (r, f0, f1) => { const k = Math.max(1, Math.ceil(Math.abs(f1 - f0) / (Math.PI / 30))); return Array.from({ length: k + 1 }, (_, j) => pt(f0 + ((f1 - f0) * j) / k, r)); };
    for (let i = 1; i < n; i++) {
      const f0 = (i - 1) * d; const f1 = i * d;
      const outer = arcPts(ro, f0, f1);
      const inner = spiral ? [pt(f1, tin)] : arcPts(tin, f1, f0).slice(0, -1);
      L.steps.push({ poly: [pt(f0, tin), ...outer, ...inner], y: i * rh, front: [pt(f0, tin), pt(f0, ro)] });
    }
    const pitch = (phi) => Math.min(rise, rh + (phi / d) * rh);
    const sideArc = (r, f0, f1) => arcPts(r, f0, f1).map((q, j, all) => [...q, pitch(f0 + ((f1 - f0) * j) / (all.length - 1))]);
    if (spiral) {
      // Top landing (a quarter round) level with the floor above: the last riser is its front.
      const top = Math.PI / 2;
      L.steps.push({ poly: [pt(A, tin), ...arcPts(ro, A, A + top), pt(A + top, tin)], y: rise, front: [pt(A, tin), pt(A, ro)], landing: true, platform: true });
      L.exitRiser = false;
      L.exit = { a: pt(A + top, ri), b: pt(A + top, ro) };
      L.sides.push({ side: 'outer', in: 1, pts: sideArc(ro, 0, A + top), stringer: false });
      L.pole = { x: 0, z: 0, r: POLE_RADIUS, h: rise + RAIL_HEIGHT };
      const circle = (r) => arcPts(r, 0, 2 * Math.PI).slice(0, -1);
      L.footprint = circle(ro);
      L.hole = circle(ro + c);
      const g0 = A + top; const g1 = A + 2 * Math.PI - 1.5 * d;
      if (g1 > g0 + 0.05) L.guard.push(arcPts(ro, g0, g1));
      walkGoing = ((ri + ro) / 2) * d;
    } else {
      L.exit = { a: pt(A, ri), b: pt(A, ro) };
      L.sides.push({ side: 'outer', in: 1, pts: sideArc(ro, 0, A) });
      L.sides.push({ side: 'inner', in: -1, pts: sideArc(ri, 0, A) });
      L.footprint = [...arcPts(ro, 0, A), ...arcPts(ri, A, 0)];
      L.hole = [pt(A, ri), [0, 0], pt(0, ro + c), ...arcPts(ro + c, 0, A)];
      L.guard.push([pt(A, ri), [0, 0], ...arcPts(ro, 0, A)]);
      walkGoing = ((ri + ro) / 2) * d;
    }
  }

  if (p.turn === 'left') mirror(L);
  L.start = mid(L.steps[0].front);
  centre(L);
  const hasRails = p.rail !== 'none' && railSidesOf(L, p.railSides).length > 0;
  const top = Math.max(rise + (hasRails ? RAIL_HEIGHT + 0.03 : 0), L.pole ? L.pole.h : 0, p.guard ? rise + GUARD_HEIGHT + 0.03 : 0, L.spine ? rise + RAIL_HEIGHT : 0);
  const xs = L.footprint.map((q) => q[0]); const zs = L.footprint.map((q) => q[1]);
  L.size = [Math.max(...xs) - Math.min(...xs), top, Math.max(...zs) - Math.min(...zs)].map((v) => Math.round(v * 1000) / 1000);
  L.walkGoing = walkGoing;
  L.blondel = 2 * rh + walkGoing;
  return L;
}

function dedupePts(pts) {
  const out = [];
  for (const q of pts) if (!out.length || Math.hypot(q[0] - out.at(-1)[0], q[1] - out.at(-1)[1]) > 1e-9) out.push(q);
  return out;
}

const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Mirrors a layout in x (a left turn is a mirrored right turn). */
function mirror(L) {
  const m2 = (q) => [-q[0], q[1], ...q.slice(2)];
  for (const s of L.steps) { s.poly = s.poly.map(m2); s.front = s.front?.map(m2) ?? null; }
  if (L.exit) L.exit = { a: m2(L.exit.a), b: m2(L.exit.b) };
  for (const s of L.sides) { s.pts = s.pts.map(m2); s.in = -s.in; }
  L.guard = L.guard.map((g) => g.map(m2));
  L.posts = L.posts.map((q) => ({ ...q, x: -q.x }));
  if (L.spine) L.spine.pts = L.spine.pts.map(m2);
  if (L.pole) L.pole.x = -L.pole.x;
  L.footprint = L.footprint.map(m2);
  L.hole = L.hole.map(m2);
}

/** Moves the layout so its footprint's bounding box is centred on the origin. */
function centre(L) {
  const xs = L.footprint.map((q) => q[0]); const zs = L.footprint.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2; const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const mv = (q) => [q[0] - cx, q[1] - cz, ...q.slice(2)];
  for (const s of L.steps) { s.poly = s.poly.map(mv); s.front = s.front?.map(mv) ?? null; }
  if (L.exit) L.exit = { a: mv(L.exit.a), b: mv(L.exit.b) };
  for (const s of L.sides) s.pts = s.pts.map(mv);
  L.guard = L.guard.map((g) => g.map(mv));
  L.posts = L.posts.map((q) => ({ ...q, x: q.x - cx, z: q.z - cz }));
  if (L.spine) L.spine.pts = L.spine.pts.map(mv);
  if (L.pole) { L.pole.x -= cx; L.pole.z -= cz; }
  L.footprint = L.footprint.map(mv);
  L.hole = L.hole.map(mv);
  L.start = mv(L.start);
  L.offset = [cx, cz];
}

/** The sides that get a handrail: 'auto' = the open side real stairs of the type usually have. */
export function railSidesOf(L, railSides = 'auto') {
  const want = railSides === 'both' ? ['inner', 'outer'] : railSides === 'inner' || railSides === 'outer' ? [railSides]
    : L.type === 'spiral' ? ['outer'] : L.type === 'curved' ? ['inner', 'outer'] : ['inner'];
  return L.sides.filter((s) => want.includes(s.side) && s.rail !== false);
}

/**
 * Splits a side path into continuous runs: a point repeated at the same place with another
 * height (the step up at a landing's far edge, or the inner corner of winders) starts a new run.
 */
export function sideRuns(pts) {
  const runs = [];
  let run = [];
  for (const q of pts) {
    const last = run.at(-1);
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 1e-6) {
      if (Math.abs(q[2] - last[2]) > 1e-6) { if (run.length > 1) runs.push(run); run = [q]; }
      continue;
    }
    run.push(q);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** Riser height, going on the walking line and the 2R + G comfort rule (0.60–0.65 m). */
export function stairInfo(params) {
  const L = stairLayout(params);
  const blondel = Math.round(L.blondel * 1000) / 1000;
  return { type: L.type, n: L.n, treads: L.n - 1, riser: L.riser, going: L.walkGoing, blondel, comfortable: blondel >= 0.595 && blondel <= 0.655, steep: L.riser > 0.2 || L.walkGoing < 0.22 };
}

// ───────────────────────── placing (tool)

/** Rotation about Y (radians) that turns the local climbing direction (0, −1) into `dir` [dx, dz]. */
export const rotationFor = (dir) => Math.atan2(-dir[0], -dir[1]);

/** Local [x, z] → world [x, z] for an object's position / rotation / scale. */
export function toWorld(o, [x, z]) {
  const sx = o.scale?.[0] ?? 1; const sz = o.scale?.[2] ?? 1;
  const r = o.rotation?.[1] ?? 0; const cs = Math.cos(r); const sn = Math.sin(r);
  const lx = x * sx; const lz = z * sz;
  return [o.position[0] + lx * cs + lz * sn, o.position[2] - lx * sn + lz * cs];
}

/**
 * The object (position, rotation) of a stair that starts at `start` (world [x, z], the middle of its
 * first riser) and climbs along `dir`. `turn` (L, U, spiral …) is in the params.
 */
export function placeStairs(params, start, dir) {
  const L = stairLayout(params);
  const r = rotationFor(dir);
  const cs = Math.cos(r); const sn = Math.sin(r);
  const [sx, sz] = L.start;
  return { position: [start[0] - (sx * cs + sz * sn), 0, start[1] - (-sx * sn + sz * cs)], rotation: [0, r, 0], layout: L };
}

/** The rise that reaches the level above the given level (or the level's own height on the top level). */
export function riseToNextLevel(project, levelId) {
  const lv = levelOf(project, levelId);
  const above = project.levels.filter((l) => l.elevation > lv.elevation + 0.3).sort((a, b) => a.elevation - b.elevation)[0];
  return Math.round((above ? above.elevation - lv.elevation : lv.height) * 1000) / 1000;
}

export const isStairs = (o) => /^stairs(-|$)/.test(o?.item ?? '');

// ───────────────────────── stairwells (holes in the floor above)

const signed = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i]; const b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

function isConvex(poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]; const b = poly[(i + 1) % poly.length]; const c = poly[(i + 2) % poly.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-12) continue;
    if (sign && Math.sign(cr) !== sign) return false;
    sign = Math.sign(cr);
  }
  return true;
}

const inside = (p, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]; const [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};

/** Sutherland–Hodgman: `subject` clipped by a convex polygon `clip`. */
export function clipPolygon(subject, clip) {
  const ccw = signed(clip) > 0;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]; const b = clip[(i + 1) % clip.length];
    const side = (q) => { const v = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]); return ccw ? v : -v; };
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]; const q = input[(j + 1) % input.length];
      const sp = side(p); const sq = side(q);
      if (sp >= -1e-12) out.push(p);
      if ((sp >= -1e-12) !== (sq >= -1e-12)) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return dedupe(out);
}

/** The part of a hole inside a room (exact for convex rooms; a non-convex room takes the hole when it lies inside). */
export function holeInRoom(hole, room) {
  if (isConvex(room)) return clipPolygon(hole, room);
  if (hole.every((q) => inside(q, room))) return hole;
  // Non-convex room: clip by the room's bounding box, keep it when its middle is in the room.
  const xs = room.map((q) => q[0]); const zs = room.map((q) => q[1]);
  const part = clipPolygon(hole, rect(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)));
  if (part.length < 3) return [];
  const cx = part.reduce((s, q) => s + q[0], 0) / part.length; const cz = part.reduce((s, q) => s + q[1], 0) / part.length;
  return inside([cx, cz], room) ? part : [];
}

const round4 = (q) => [Math.round(q[0] * 10000) / 10000, Math.round(q[1] * 10000) / 10000];

/** The world polygons of a stair object: { footprint, hole, base (world y), top, layout }. */
export function stairsWorld(project, o) {
  const L = stairLayout(o.params ?? {});
  const level = levelOf(project, o.level);
  const base = level.elevation + (o.position?.[1] ?? 0);
  return { layout: L, level, base, top: base + L.rise * Math.abs(o.scale?.[1] ?? 1), footprint: L.footprint.map((q) => toWorld(o, q)), hole: L.hole.map((q) => toWorld(o, q)) };
}

/** The level a stair object arrives at (its top within 15 cm of the level's floor), or null. */
export function levelReached(project, o, world = stairsWorld(project, o)) {
  return project.levels.find((l) => l.id !== world.level.id && Math.abs(l.elevation - world.top) < 0.15) ?? null;
}

/**
 * Brings every stairwell in line with the stairs: each stair (not hidden, `stairwell` on) that reaches
 * a level cuts its opening into the floors of that level's rooms (room.holes) and into the ceilings of
 * its own level's rooms it climbs through (room.ceilingHoles). Holes a stair made carry its id and are
 * replaced on every call; other holes stay. Returns true when a room changed.
 */
export function syncStairwells(project) {
  const key = (r) => JSON.stringify([r.holes ?? null, r.ceilingHoles ?? null]);
  const before = new Map(project.rooms.map((r) => [r, key(r)]));
  for (const r of project.rooms) {
    for (const field of ['holes', 'ceilingHoles']) {
      if (!Array.isArray(r[field])) continue;
      r[field] = r[field].filter((h) => !h?.stairs);
      if (!r[field].length) delete r[field];
    }
  }
  for (const o of project.objects) {
    if (!isStairs(o) || o.hidden || o.params?.stairwell === false) continue;
    const world = stairsWorld(project, o);
    const up = levelReached(project, o, world);
    const add = (room, field, poly) => {
      const part = holeInRoom(poly, room.points);
      if (part.length < 3 || polygonArea(part) < 0.01) return;
      (room[field] ??= []).push({ points: part.map(round4), stairs: o.id });
    };
    if (up) for (const room of project.rooms) if (room.level === up.id) add(room, 'holes', world.hole);
    // The stair climbs through the ceiling of its own level.
    if (world.top > world.level.elevation + world.level.height - 0.05) for (const room of project.rooms) if (room.level === world.level.id) add(room, 'ceilingHoles', world.hole);
  }
  let changed = false;
  for (const r of project.rooms) if (before.get(r) !== key(r)) changed = true;
  return changed;
}

/** The polygons of a room's holes (`room.holes` / `room.ceilingHoles` entries are { points } or plain point lists). */
export const holePolygons = (list) => (Array.isArray(list) ? list : []).map((h) => (Array.isArray(h) ? h : h?.points)).filter((h) => Array.isArray(h) && h.length >= 3);
