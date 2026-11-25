// Machining operations and their toolpaths (no DOM). A CAM set-up is stored on the part (`part.cam`):
//   { machine, post, stock, wcs, tools: [tool], ops: [op], program }
// op = { id, type, name, tool (id), feature (id | null), suppressed?, …parameters (OP_DEFAULTS) }.
//
// Milling (Z up into the spindle): face milling (zigzag), pocket / adaptive clearing, contour, slot, helical
// bore, drilling cycles (spot, drill, peck, chip break, tap), 3D z-level roughing, parallel (raster) and
// scallop finishing, waterline finishing. 2.5D regions come from sections of the part: the free area at a
// height is the stock outline minus the part's material at that height and everywhere above it (a tool can
// not go under an overhang), and the tool centre may go where that area, shrunk by the tool radius plus the
// stock to leave, still is (cam-geom offsetLoops). 3D finishing drops the cutter onto the mesh.
//
// Turning (Z along the spindle, X the radius; programs use diameters): facing, OD roughing (passes along −Z)
// and finishing (the nose centre on the profile dilated by the nose radius, grooves bridged), centre drilling,
// bore roughing / finishing, grooving (plunges) and threading (passes with a decreasing infeed).
//
// A toolpath: { op, tool, kind: 'mill' | 'turn', moves: [{ k: 'r' | 'f' | 't' | 'cyc', p: [x, y, z], f? , …}],
// rpm, feed, plunge, warnings }. 'cyc' moves are canned drilling cycles ({ cycle, p (hole bottom), r, q, dwell });
// expandMoves() turns them into plain moves the way a control runs them.
import { editMoves } from './cam-edit.js';
import { MULTI_OPS, MULTI_DEFAULTS, genRotary4, genMulti5, genMtAxial, genMtRadial } from './cam-multiaxis.js';
import {
  offsetLoops, insideRegion, reverseLoop, rectLoop, circleLoop, loopArea, loopLength, windingOf, resample, clipPolyline, unionLoops,
  dropCutter, groupRegions, geom2, segDist, cleanLoop, SegmentIndex,
} from './cam-geom.js';
import { kernelSection, offsetSolid, overhangTop, shadowAbove } from './cam-kernel.js';
import { cutterOf, millingData, turningData, cutMaterialOf, machineOf, METRIC_THREADS, isTurnTool } from './cam-tools.js';

const { dist } = geom2;
const round = (v, k = 1e4) => Math.round(v * k) / k;

export const MILL_OPS = ['facing', 'pocket', 'adaptive', 'contour', 'slot', 'helix', 'spot', 'drill', 'peck', 'chipBreak', 'tap', 'zlevel', 'parallel', 'scallop', 'waterline', ...MULTI_OPS];
export const TURN_OPS = ['tFace', 'tRough', 'tFinish', 'tDrill', 'tBoreRough', 'tBoreFinish', 'tGroove', 'tThread'];
export const OP_GROUPS = { face: ['facing'], rough25: ['pocket', 'adaptive', 'slot', 'helix'], finish25: ['contour'], holes: ['spot', 'drill', 'peck', 'chipBreak', 'tap'], mill3d: ['zlevel', 'parallel', 'scallop', 'waterline'], turn: TURN_OPS , multi: ['rotary4', 'multi5', 'mtAxial', 'mtRadial'] };

/** Parameters of each operation (lengths mm, angles degrees, stepover a fraction of the tool diameter). */
export const OP_DEFAULTS = {
  facing: { stepdown: 1, stepover: 0.7, leaveZ: 0, angle: 0 },
  pocket: { stepdown: 3, stepover: 0.45, leave: 0.3, leaveZ: 0.1, direction: 'climb', ramp: 3, finishPass: true },
  adaptive: { stepdown: 8, leave: 0.3, leaveZ: 0.1, direction: 'climb', ramp: 2, engagement: 60 },
  contour: { stepdown: 10, leave: 0, leaveZ: 0, direction: 'climb', springPass: false },
  slot: { stepdown: 2, leave: 0, leaveZ: 0, direction: 'climb', ramp: 3 },
  helix: { stepdown: 1.5, leave: 0, leaveZ: 0, direction: 'climb', target: 'counterbore' },
  spot: { depth: 1, dwell: 0 },
  drill: { dwell: 0, breakThrough: 1 },
  peck: { peck: 0, breakThrough: 1 },
  chipBreak: { peck: 0, breakThrough: 1 },
  tap: { breakThrough: 0 },
  zlevel: { stepdown: 2, stepover: 0.4, leave: 0.5, leaveZ: 0.3, direction: 'climb', ramp: 3 },
  parallel: { stepover: 0, scallop: 0.01, angle: 0, leave: 0, sample: 0.5 },
  scallop: { scallop: 0.01, leave: 0, sample: 0.5 },
  waterline: { stepdown: 0.5, leave: 0, direction: 'climb' },
  tFace: { stepdown: 1, leaveZ: 0 },
  tRough: { stepdown: 2, leave: 0.3, leaveZ: 0.1 },
  tFinish: { leave: 0, clearance: 0 },
  tDrill: { peck: 0 },
  tBoreRough: { stepdown: 1, leave: 0.3, leaveZ: 0.1 },
  tBoreFinish: { leave: 0, clearance: 0 },
  tGroove: { stepover: 0.8, leave: 0 },
  tThread: { pitch: 1.5, passes: 6, length: 0, z1: null, external: true },
  ...MULTI_DEFAULTS,
};

/** A new operation with its defaults. */
export function createOp(type, { id, tool, feature = null, name = null, ...params } = {}) {
  return { id: id ?? `op${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, type, name: name ?? type, tool, feature, ...structuredClone(OP_DEFAULTS[type] ?? {}), ...params };
}

// ───────────────────────── stock and context

/** The default stock around a part's box: { kind: 'box', x0 … z1 } for milling, { kind: 'bar', r, z0, z1 } for turning. */
export function defaultStock(bounds, { turning = false, margin = 2, top = 2, bottom = 0, cx = null, cy = null } = {}) {
  const { lo, hi } = bounds;
  if (turning) {
    const x = cx ?? (lo[0] + hi[0]) / 2; const y = cy ?? (lo[1] + hi[1]) / 2;
    const R = Math.max(Math.abs(hi[0] - x), Math.abs(lo[0] - x), Math.abs(hi[1] - y), Math.abs(lo[1] - y));
    return { kind: 'bar', r: round(Math.ceil((R + margin / 2) * 2) / 2, 1e3), z0: round(lo[2] - bottom), z1: round(hi[2] + top), cx: x, cy: y };
  }
  return { kind: 'box', x0: round(lo[0] - margin), y0: round(lo[1] - margin), z0: round(lo[2] - bottom), x1: round(hi[0] + margin), y1: round(hi[1] + margin), z1: round(hi[2] + top) };
}

export const stockVolume = (s) => (s.kind === 'bar' ? Math.PI * s.r * s.r * (s.z1 - s.z0) - Math.PI * (s.bore ?? 0) ** 2 * (s.z1 - s.z0) : (s.x1 - s.x0) * (s.y1 - s.y0) * (s.z1 - s.z0));

/**
 * The context the generators need: { model (cam-features machiningModel), stock, tools, machine, material,
 * features, profile? }. Clearance: 10 mm over the stock, retract 2 mm over the local top.
 */
export function camContext({ model, stock, tools, machine = 'vmc', material = 'steel-1020', features = [], profile = null }) {
  const m = typeof machine === 'string' ? machineOf(machine) : machine;
  const top = stock.kind === 'bar' ? stock.z1 : stock.z1;
  return { model, stock, tools, toolMap: new Map(tools.map((t) => [t.id, t])), machine: m, materialClass: cutMaterialOf(material), features, featureMap: new Map(features.map((f) => [f.id, f])), profile, clearance: top + 10, retract: 2 };
}

/** A path under construction. */
class Path {
  constructor(start) { this.moves = []; this.pos = [...start]; }
  rapid(p) { if (dist3(p, this.pos) > 1e-9) { this.moves.push({ k: 'r', p: [...p] }); this.pos = [...p]; } }
  feed(p, f) { if (dist3(p, this.pos) > 1e-9) { this.moves.push({ k: 'f', p: [...p], f }); this.pos = [...p]; } }
  thread(p, f) { this.moves.push({ k: 't', p: [...p], f }); this.pos = [...p]; }
  cycle(c) { this.moves.push({ k: 'cyc', ...c }); this.pos = [c.p[0], c.p[1], c.init]; }
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Heights from top down to bottom in equal steps no deeper than `step`, plus the given extra levels between. */
export function stepLevels(top, bottom, step, extra = []) {
  if (!(top > bottom + 1e-9)) return [];
  const n = Math.max(1, Math.ceil((top - bottom) / Math.max(0.01, step) - 1e-9));
  const out = new Set(Array.from({ length: n }, (_, k) => round(top - ((k + 1) * (top - bottom)) / n, 1e6)));
  for (const z of extra) if (z < top - 1e-6 && z > bottom + 1e-6) out.add(round(z, 1e6));
  return [...out].sort((a, b) => b - a);
}

// ───────────────────────── regions

/**
 * Material of the part at z and everywhere above it (its shadow), as islands (reversed section loops): the
 * sections just above z, just under every flat face higher up, every 2 mm up to the top (sloped and curved
 * walls), duplicates dropped. Overlapping islands read as their union under the positive fill rule.
 */
function shadowIslands(ctx, z) {
  const { model } = ctx;
  const zTop = model.bounds.hi[2];
  if (z >= zTop) return [];
  const eps = model.eps * 4;
  const heights = new Set([z + eps, zTop - eps]);
  for (const l of model.levels) if (l.up && l.z > z + eps) heights.add(l.z - eps);
  for (let h = zTop - 2; h > z + eps; h -= 2) heights.add(round(h, 1e6));
  const out = []; const seen = new Set();
  const base = model.slice(z + eps);
  for (const h of [...heights].sort((a, b) => a - b)) {
    const sec = model.slice(h);
    // A section that lies wholly inside the material at z (the usual case: walls that do not lean out) adds
    // nothing to the shadow.
    if (h > z + eps && base.length && sec.filter((l) => loopArea(l) > 0).every((l) => l.every((q) => insideRegion(base, q)))) continue;
    for (const loop of sec) { const k = loopSig(loop); if (!seen.has(k)) { seen.add(k); out.push(reverseLoop(loop)); } }
  }
  return out;
}

const loopSig = (l) => `${round(loopArea(l), 1e3)}|${round(loopLength(l), 1e3)}|${round(Math.min(...l.map((p) => p[0])), 1e3)}|${round(Math.min(...l.map((p) => p[1])), 1e3)}`;

/** The stock outline (a little larger, so edges are cleared fully) as a CCW loop. */
function stockLoop(ctx, grow) {
  const s = ctx.stock;
  return rectLoop(s.x0 - grow, s.y0 - grow, s.x1 + grow, s.y1 + grow);
}

/** Where the tool centre may go at height z (loops; positive rule). */
function centreRegion(ctx, z, R, leave, { outer = null, shadowStep = 2 } = {}) {
  const loops = [outer ?? stockLoop(ctx, R * 0.9), ...shadowIslands(ctx, z)];
  return offsetLoops(loops, -(R + leave), { tol: Math.min(0.005, R / 50) });
}

/** The loops of a region that lie inside `boundary` (by their first point). */
const within = (loops, boundary) => (boundary ? loops.filter((l) => windingOf(boundary, l[0]) !== 0 || l.some((p) => windingOf(boundary, p) !== 0)) : loops);

// ───────────────────────── loops along a level

/** A loop rotated to start at the point nearest p (and closed). */
function startNear(loop, p) {
  let bi = 0; let bd = Infinity;
  loop.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bi = i; } });
  const out = [...loop.slice(bi), ...loop.slice(0, bi)];
  out.push(out[0]);
  return out;
}

/** True when the straight move a → b stays in the region (sampled). */
function linkInside(region, a, b, step) {
  const n = Math.max(2, Math.ceil(dist(a, b) / Math.max(step, 0.1)));
  for (let i = 0; i <= n; i++) { const p = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]; if (!insideRegion(region, p)) return false; }
  return true;
}

/**
 * Cuts closed loops at height z: the first is entered by a ramp along it from zFrom, later ones are reached by
 * a feed move when it stays inside `safe`, else by a retract and a new ramp.
 */
function cutLoops(path, loops, z, { zFrom, safe, feed, plunge, ramp, R, retractZ, clearZ, asIs = false }) {
  const slope = Math.tan((Math.max(0.5, Math.min(90, ramp)) * Math.PI) / 180);
  let entered = false;
  for (const [index, loop0] of loops.entries()) {
    // Walked paths (adaptive) keep their own start and order; the first one (a ring) still closes for its ramp.
    const pts = asIs ? (index === 0 ? [...loop0, loop0[0]] : loop0) : startNear(loop0, path.pos);
    const start = pts[0];
    const here = [path.pos[0], path.pos[1]];
    if (entered && Math.abs(path.pos[2] - z) < 1e-9 && safe && linkInside(safe, here, start, R / 2)) {
      path.feed([start[0], start[1], z], feed);
      for (const q of pts.slice(1)) path.feed([q[0], q[1], z], feed);
      continue;
    }
    // Retract, go over, and ramp down along the loop.
    if (path.pos[2] < retractZ - 1e-9) path.rapid([path.pos[0], path.pos[1], Math.max(retractZ, path.pos[2])]);
    if (Math.hypot(path.pos[0] - start[0], path.pos[1] - start[1]) > 1e-9) { path.rapid([path.pos[0], path.pos[1], clearZ]); path.rapid([start[0], start[1], clearZ]); }
    path.rapid([start[0], start[1], zFrom]);
    rampAlong(path, pts, zFrom, z, slope, ramp >= 89 ? 0 : 1, feed, plunge, asIs);
    entered = true;
  }
}

/** Walks the closed loop pts descending from z0 to z at the slope, finishes the loop at z and re-cuts the ramp. */
function rampAlong(path, pts, z0, z, slope, useRamp, feed, plunge, endAtStart = false) {
  const L = loopLength(pts.slice(0, -1));
  const rampLen = useRamp ? (z0 - z) / slope : 0;
  if (!(rampLen > 1e-6) || L < 1e-6) {
    path.feed([pts[0][0], pts[0][1], z], plunge);
    for (const q of pts.slice(1)) path.feed([q[0], q[1], z], feed);
    return;
  }
  // Ramp (possibly several turns on a short loop).
  let walked = 0; let i = 0; const n = pts.length - 1;
  let cur = pts[0];
  while (walked < rampLen - 1e-9) {
    const next = pts[(i % n) + 1];
    const seg = dist(cur, next);
    if (walked + seg >= rampLen) {
      const t = (rampLen - walked) / seg;
      const p = [cur[0] + (next[0] - cur[0]) * t, cur[1] + (next[1] - cur[1]) * t];
      path.feed([p[0], p[1], z], plunge);
      cur = p; walked = rampLen;
      break;
    }
    walked += seg;
    path.feed([next[0], next[1], z0 - (z0 - z) * (walked / rampLen)], plunge);
    cur = next; i++;
  }
  // The rest of the loop at full depth from where the ramp ended, then again over the ramped part.
  const startIdx = i % n;
  for (let k = 1; k <= n; k++) { const q = pts[((startIdx + k) % n)]; path.feed([q[0], q[1], z], feed); }
  path.feed([cur[0], cur[1], z], feed);
  // A walked path that goes on from the loop's own start: round once more to it (all of it cut already).
  if (endAtStart) for (let k = startIdx + 1; k <= n; k++) { const q = pts[k % n]; path.feed([q[0], q[1], z], feed); }
}

/** Offset loops run with the material on their right (climb milling with a right-hand cutter); conventional reverses. */
const orient = (loops, direction) => (direction === 'conventional' ? loops.map(reverseLoop) : loops);

/** Orders loop groups: innermost rings first, each ring's loops by distance. */
function ringsInsideOut(rings) { return [...rings].reverse(); }

// ───────────────────────── generators

function toolOf(ctx, op) {
  const tool = ctx.toolMap.get(op.tool);
  if (!tool) throw Object.assign(new Error(`no tool ${op.tool}`), { code: 'noTool' });
  return tool;
}

function speeds(ctx, op, tool, extra = {}) {
  const d = millingData(tool, ctx.materialClass, ctx.machine, extra);
  return { rpm: op.rpm > 0 ? Number(op.rpm) : d.rpm, feed: op.feedRate > 0 ? Number(op.feedRate) : d.feed, plunge: op.plungeRate > 0 ? Number(op.plungeRate) : d.plunge, power: d.power };
}

function featureOf(ctx, op) { return op.feature ? ctx.featureMap.get(op.feature) ?? null : null; }

/** Face milling: zigzag passes over the stock top down to the part top (+ leaveZ). */
function genFacing(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2; const s = ctx.stock;
  const target = (featureOf(ctx, op)?.z ?? ctx.model.bounds.hi[2]) + (op.leaveZ ?? 0);
  const levels = stepLevels(s.z1, target, op.stepdown || 1);
  const sp = speeds(ctx, op, tool, { ae: tool.d * op.stepover, ap: op.stepdown });
  const path = new Path([s.x0 - R - 5, s.y0, ctx.clearance]);
  const step = tool.d * Math.min(0.95, Math.max(0.05, op.stepover));
  const x0 = s.x0 - R - 2; const x1 = s.x1 + R + 2;
  for (const z of levels) {
    const ys = [];
    for (let y = s.y0 + R - step * 0.15; y < s.y1 + R * 0.85; y += step) ys.push(Math.min(y, s.y1 - R + R * 0.85));
    if (!ys.length) ys.push((s.y0 + s.y1) / 2);
    path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
    path.rapid([x0, ys[0], ctx.clearance]);
    path.rapid([x0, ys[0], z + 1]);
    path.feed([x0, ys[0], z], sp.plunge);
    ys.forEach((y, i) => {
      const [a, b] = i % 2 ? [x1, x0] : [x0, x1];
      if (i) path.feed([a, y, z], sp.feed);
      path.feed([b, y, z], sp.feed);
    });
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp };
}

/** The boundary of a feature's machining area at height z (a loop), or null for the whole stock. */
function featureBoundary(ctx, f, z, R) {
  if (!f) return null;
  const eps = ctx.model.eps * 4;
  if (f.type === 'pocket' || f.type === 'slot') {
    const sl = ctx.model.slice(Math.min(z + eps, ctx.model.bounds.hi[2] - eps));
    let best = null; let ba = Infinity;
    for (const l of sl) { const a = loopArea(l); if (a < 0 && windingOf(l, f.seed) !== 0 && -a < ba) { ba = -a; best = l; } }
    return best ? reverseLoop(best) : f.outline;
  }
  if (f.type === 'hole') return circleLoop(f.x, f.y, (f.counterbore?.d ?? f.d) / 2, 0.002);
  if (f.type === 'step') return offsetLoops([f.outline], 2 * R + 0.5)[0] ?? f.outline;
  return null;
}

/** Pocket / step clearing with offset rings, inside out; an optional finishing ring at the wall. */
function genPocket(ctx, op, { adaptive = false } = {}) {
  const tool = toolOf(ctx, op); const R = tool.d / 2;
  const f = featureOf(ctx, op);
  const top = f ? Math.max(f.top ?? ctx.model.bounds.hi[2], f.type === 'hole' ? f.top : -Infinity) : ctx.stock.z1;
  const floor = f ? (f.type === 'hole' ? (f.counterbore ? f.top - f.counterbore.depth : f.bottom) : f.floor) : ctx.model.bounds.lo[2];
  const leaveZ = op.leaveZ ?? 0;
  const extra = ctx.model.levels.filter((l) => l.up).map((l) => l.z + leaveZ);
  const levels = stepLevels(top, floor + leaveZ, op.stepdown || 2, extra);
  // Adaptive: the ring spacing that gives the target engagement on a straight cut, ae = R (1 − cos θ).
  const step = adaptive ? Math.max(0.02, R * (1 - Math.cos(((op.engagement ?? 60) * Math.PI) / 180)) * 0.98) : tool.d * Math.min(0.9, Math.max(0.03, op.stepover ?? 0.45));
  const sp = speeds(ctx, op, tool, { ae: step, ap: op.stepdown });
  const path = new Path([0, 0, ctx.clearance]);
  const warnings = [];
  let prevZ = top;
  let engagementMax = 0; const entries = []; const ringCache = new Map();
  for (const z of levels) {
    const boundary = featureBoundary(ctx, f, z, R);
    const outer = f?.type === 'hole' ? boundary : f?.type === 'step' ? boundary : null;
    const islands = f?.type === 'hole' ? [] : shadowIslands(ctx, z);
    const base = [outer ?? stockLoop(ctx, R * 0.9), ...islands];
    // Levels between two changes of the walls have the same outline: their region and rings are worked out once.
    const key = base.map(loopSig).sort().join(';') + (boundary ? `|${loopSig(boundary)}` : '');
    const cached = ringCache.get(key);
    const first = cached ? cached.first : offsetLoops(base, -(R + (op.leave ?? 0)), { tol: Math.min(0.005, R / 50) });
    let region = cached ? cached.region : within(first, f?.type === 'pocket' || f?.type === 'slot' ? boundary : null);
    if (!region.length) {
      // Room for the tool without the material above: the area is under an overhang, else the tool is too big.
      const open = boundary && offsetLoops([boundary], -(R + (op.leave ?? 0))).length > 0;
      const why = open ? 'shadowed' : 'tooBig';
      if (!warnings.includes(why)) warnings.push(why);
      continue;
    }
    let rings = cached?.rings;
    if (!rings) {
      rings = [region];
      let cur = region;
      for (let k = 0; k < 500; k++) { cur = offsetLoops(cur, -step, { tol: Math.min(0.005, R / 50) }); if (!cur.length) break; rings.push(cur); }
      ringCache.set(key, { first, region, rings });
    }
    const ordered = ringsInsideOut(rings).map((r) => orient(r, op.direction));
    let loops = ordered.flat();
    if (adaptive) {
      // The area this level clears: the tool-centre region grown back by the radius (its walls stay).
      const area = offsetLoops(region, R, { tol: Math.min(0.005, R / 50) });
      const a = adaptiveLevel(ordered.flat(), area, R, op.engagement ?? 60, region, op.direction === 'conventional' ? -1 : 1);
      loops = a.loops; engagementMax = Math.max(engagementMax, a.maxEngagement);
      if (loops[0]) entries.push({ z, loop: loops[0] });
    }
    cutLoops(path, loops, z, { zFrom: prevZ + 0.5, safe: region, feed: sp.feed, plunge: sp.plunge, ramp: op.ramp ?? 3, R, retractZ: prevZ + ctx.retract, clearZ: ctx.clearance, asIs: adaptive });
    if (op.finishPass && (op.leave ?? 0) > 0) {
      const fin = within(offsetLoops(base, -R, { tol: Math.min(0.005, R / 50) }), f?.type === 'pocket' || f?.type === 'slot' ? boundary : null);
      cutLoops(path, orient(fin, op.direction), z, { zFrom: z, safe: fin, feed: sp.feed, plunge: sp.plunge, ramp: 90, R, retractZ: z + ctx.retract, clearZ: ctx.clearance });
    }
    prevZ = z;
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp, warnings, engagement: engagementMax, entries };
}

/**
 * Exact engagement of a cutter of radius R at p moving along u, in the stock left by the cuts so far: the angle
 * of its leading half circle that runs through material. Material = inside `area` (what this level clears; the
 * part's walls and the air outside are not material) and outside every capsule swept so far (a segment of the
 * tool-centre path grown by R). Arc breakpoints come from the circle's crossings with the area's edges and the
 * capsules' boundaries, so between two breakpoints the material test of one point holds for the whole arc.
 */
export class EngagementModel {
  constructor(area, R) {
    this.area = area; this.R = R;
    this.areaIdx = new SegmentIndex(area.flatMap((l) => l.map((a, i) => ({ a, b: l[(i + 1) % l.length] }))));
    this.cell = 2 * R; this.segs = []; this.buckets = new Map();
  }
  /** Records the move a → b as cut. */
  add(a, b) {
    const id = this.segs.push({ a, b }) - 1; const c = this.cell; const R = this.R;
    const i0 = Math.floor((Math.min(a[0], b[0]) - R) / c); const i1 = Math.floor((Math.max(a[0], b[0]) + R) / c);
    const j0 = Math.floor((Math.min(a[1], b[1]) - R) / c); const j1 = Math.floor((Math.max(a[1], b[1]) + R) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = `${i},${j}`; let l = this.buckets.get(k); if (!l) { l = []; this.buckets.set(k, l); } l.push(id); }
  }
  near(p) {
    const c = this.cell; const R = this.R; const out = new Set();
    for (let i = Math.floor((p[0] - 2 * R) / c); i <= Math.floor((p[0] + 2 * R) / c); i++) {
      for (let j = Math.floor((p[1] - 2 * R) / c); j <= Math.floor((p[1] + 2 * R) / c); j++) for (const id of this.buckets.get(`${i},${j}`) ?? []) out.add(id);
    }
    return [...out].map((id) => this.segs[id]);
  }
  /** Engagement angle (radians) at p moving along u (unit). */
  engagement(p, u) {
    const R = this.R; const base = Math.atan2(u[1], u[0]);
    const HALF = Math.PI / 2;
    const rel = (q) => { let a = Math.atan2(q[1] - p[1], q[0] - p[0]) - base; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const at = (a) => [p[0] + R * Math.cos(base + a), p[1] + R * Math.sin(base + a)];
    const circleLine = (o, d) => {
      const fx = o[0] - p[0]; const fy = o[1] - p[1]; const A = d[0] * d[0] + d[1] * d[1]; const B = 2 * (fx * d[0] + fy * d[1]); const C = fx * fx + fy * fy - R * R;
      const disc = B * B - 4 * A * C;
      if (disc < 0 || A < 1e-18) return [];
      const sq = Math.sqrt(disc);
      return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
    };
    /** The parts of [−90°, 90°] where test(point) holds, from the breakpoints (each piece tested once). */
    const pieces = (breaks, test) => {
      const list = [-HALF, HALF, ...breaks.filter((a) => a > -HALF && a < HALF)].sort((x, y) => x - y);
      const out = [];
      for (let k = 0; k + 1 < list.length; k++) {
        const a0 = list[k]; const a1 = list[k + 1];
        if (a1 - a0 < 1e-12) continue;
        if (test(at((a0 + a1) / 2))) { if (out.length && Math.abs(out[out.length - 1][1] - a0) < 1e-12) out[out.length - 1][1] = a1; else out.push([a0, a1]); }
      }
      return out;
    };
    // Material can only be inside the area: its pieces of the leading half.
    const areaBreaks = [];
    this.areaIdx.each(p[0] - R, p[1] - R, p[0] + R, p[1] + R, (i) => {
      const s = this.areaIdx.segs[i]; const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
      for (const t of circleLine(s.a, d)) if (t >= 0 && t <= 1) areaBreaks.push(rel([s.a[0] + d[0] * t, s.a[1] + d[1] * t]));
    });
    let free = pieces(areaBreaks, (q) => insideRegion(this.area, q));
    if (!free.length) return 0;
    // Each capsule cut so far (within reach) takes away the arcs it covers: its own breakpoints, its own test.
    for (const s of this.near(p)) {
      if (segDist(p, s.a, s.b) >= 2 * R) continue;
      const { a, b } = s; const brk = [];
      const d = [b[0] - a[0], b[1] - a[1]]; const L = Math.hypot(d[0], d[1]);
      if (L > 1e-12) {
        const n = [(-d[1] / L) * R, (d[0] / L) * R];
        for (const sgn of [1, -1]) { const o = [a[0] + sgn * n[0], a[1] + sgn * n[1]]; for (const t of circleLine(o, d)) if (t >= 0 && t <= 1) brk.push(rel([o[0] + d[0] * t, o[1] + d[1] * t])); }
      }
      for (const c of [a, b]) {
        const dd = Math.hypot(c[0] - p[0], c[1] - p[1]);
        if (dd < 1e-12 || dd >= 2 * R) continue;
        const psi = Math.atan2(c[1] - p[1], c[0] - p[0]); const w = Math.acos(dd / (2 * R));
        for (const ang of [psi - w, psi + w]) brk.push(rel([p[0] + R * Math.cos(ang), p[1] + R * Math.sin(ang)]));
      }
      const covered = pieces(brk, (q) => segDist(q, a, b) < R - 1e-9);
      if (!covered.length) continue;
      const next = [];
      for (const [f0, f1] of free) {
        let segs = [[f0, f1]];
        for (const [c0, c1] of covered) segs = segs.flatMap(([x0, x1]) => (c1 <= x0 || c0 >= x1 ? [[x0, x1]] : [...(c0 > x0 ? [[x0, c0]] : []), ...(c1 < x1 ? [[c1, x1]] : [])]));
        next.push(...segs);
      }
      free = next;
      if (!free.length) return 0;
    }
    return free.reduce((sum, [x0, x1]) => sum + (x1 - x0), 0);
  }
}

/**
 * Adaptive clearing of one level: the rings (spaced for the target engagement on a straight cut,
 * ae = R (1 − cos θ)) cut inside out; every sample's engagement is computed exactly against the stock left so
 * far, and where it would pass the limit (corners) the cutter makes trochoidal loops ahead — smaller ones until
 * the limit holds. The innermost ring is the entry (opened by the ramp like a helical bore) and is not limited. Returns { loops, maxEngagement (degrees), samples }.
 */
function adaptiveLevel(rings, area, R, limitDeg, region, side = 1) {
  const limit = (limitDeg * Math.PI) / 180;
  const model = new EngagementModel(area, R);
  const out = []; let maxEng = 0; let samples = 0;
  const sample = Math.max(R / 5, 0.05);
  let prev = null; let first = true;
  for (const loop of rings) {
    let pts = resample(loop, sample, true);
    // Start where the last ring ended (nearest point), so the step across is part of the checked walk.
    if (prev) { let bi = 0; let bd = Infinity; pts.forEach((q, i) => { const d = Math.hypot(q[0] - prev[0], q[1] - prev[1]); if (d < bd) { bd = d; bi = i; } }); pts = [...pts.slice(bi), ...pts.slice(0, bi)]; }
    pts.push(pts[0]);
    const res = [];
    // The first (innermost) ring is the entry: the ramp opens it as a helical bore would, at full width.
    const entry = first; first = false;
    if (!prev) prev = pts[0];
    res.push(prev);
    const go = (q) => { model.add(prev, q); res.push(q); prev = q; };
    // Where a point would load the cutter past the limit it is pulled towards the cleared side (the left of the
    // travel for climb milling) until the exact engagement is the limit; the ring is then run again over what is
    // left, until every point is reached.
    for (let pass = 0; pass < (entry ? 1 : 8); pass++) {
      let short = false;
      for (let i = entry ? 1 : 0; i < pts.length; i++) {
        const p = prev; const q = pts[i];
        const dl = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (dl < 1e-9) continue;
        const u = [(q[0] - p[0]) / dl, (q[1] - p[1]) / dl];
        if (entry) { go(q); continue; }
        const eng = model.engagement(q, u);
        samples++;
        if (eng <= limit + 1e-9) { maxEng = Math.max(maxEng, eng); go(q); continue; }
        const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
        const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nrm = [(-(b[1] - a[1]) / tl) * side, ((b[0] - a[0]) / tl) * side];
        const at = (k) => [q[0] + nrm[0] * k, q[1] + nrm[1] * k];
        const engAt = (k) => { const t = at(k); const dd = Math.hypot(t[0] - p[0], t[1] - p[1]); return dd > 1e-9 ? model.engagement(t, [(t[0] - p[0]) / dd, (t[1] - p[1]) / dd]) : 0; };
        let lo = 0; let hi = Math.max(sample, R);
        if (engAt(hi) > limit) {
          // Pulling back is not enough (a corner): the cutter turns towards the cleared side instead, by the
          // smallest angle that keeps the limit (the least loaded heading when none does).
          let best = null; let bestE = Infinity;
          for (let len = dl; len >= dl / 8 && bestE > limit; len /= 2) {
            for (let deg = 0; deg <= 170; deg += 10) {
              const th = (deg * Math.PI) / 180 * side; const c = Math.cos(th); const sn = Math.sin(th);
              const dir = [u[0] * c - u[1] * sn, u[0] * sn + u[1] * c];
              const t = [p[0] + dir[0] * len, p[1] + dir[1] * len];
              if (region && !insideRegion(region, t)) continue;
              const e = model.engagement(t, dir);
              if (e < bestE) { bestE = e; best = t; }
              if (e <= limit) break;
            }
          }
          if (best) { maxEng = Math.max(maxEng, bestE); go(best); }
          short = true; continue;
        }
        for (let it = 0; it < 9; it++) { const mid = (lo + hi) / 2; if (engAt(mid) > limit) lo = mid; else hi = mid; }
        const t = at(hi);
        if (!region || insideRegion(region, t)) { maxEng = Math.max(maxEng, engAt(hi)); go(t); }
        short = true;
      }
      if (!short) break; // another pass over the ring starts from here; its first step is checked like any other
    }
    out.push(res);
  }
  return { loops: out, maxEngagement: (maxEng * 180) / Math.PI, samples };
}

/** Contour: one ring at the walls of a feature (or around the part), at every level. */
function genContour(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2;
  const f = featureOf(ctx, op);
  const top = f?.type === 'boss' ? f.top : f?.top ?? ctx.stock.z1;
  const bottom = f?.type === 'boss' ? f.base : f?.floor ?? ctx.model.bounds.lo[2];
  const levels = stepLevels(Math.min(top, ctx.stock.z1), bottom + (op.leaveZ ?? 0), op.stepdown || 10);
  const sp = speeds(ctx, op, tool, { ae: R * 0.2, ap: op.stepdown });
  const path = new Path([0, 0, ctx.clearance]);
  let prevZ = top;
  for (const z of levels) {
    const region = centreRegion(ctx, z, R, op.leave ?? 0, { shadowStep: op.stepdown || 10 });
    let loops;
    if (f?.type === 'boss') loops = region.filter((l) => loopArea(l) < 0 && windingOf(l, f.seed) !== 0).sort((a, b) => loopArea(b) - loopArea(a)).slice(0, 1);
    else if (f?.type === 'pocket' || f?.type === 'slot' || f?.type === 'step') loops = within(region, featureBoundary(ctx, f, z, R));
    else {
      // Around the part: the holes of the region that hold the part's largest section.
      const mat = ctx.model.slice(Math.min(z + ctx.model.eps * 4, ctx.model.bounds.hi[2] - ctx.model.eps));
      const main = mat.filter((l) => loopArea(l) > 0).sort((a, b) => loopArea(b) - loopArea(a))[0];
      loops = main ? region.filter((l) => loopArea(l) < 0 && windingOf(l, main[0]) !== 0) : [];
    }
    if (!loops.length) continue;
    const ordered = orient(loops, op.direction);
    cutLoops(path, ordered, z, { zFrom: prevZ + 0.5, safe: null, feed: sp.feed, plunge: sp.plunge, ramp: 90, R, retractZ: z + ctx.retract, clearZ: ctx.clearance });
    if (op.springPass) cutLoops(path, ordered, z, { zFrom: z, safe: null, feed: sp.feed, plunge: sp.plunge, ramp: 90, R, retractZ: z + ctx.retract, clearZ: ctx.clearance });
    path.rapid([path.pos[0], path.pos[1], z + ctx.retract]);
    prevZ = z;
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp };
}

/** Slot: a single centre pass when the cutter is as wide as the slot, else pocket clearing. */
function genSlot(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2;
  const f = featureOf(ctx, op);
  if (!f || !(f.width > 0) || tool.d < f.width * 0.95 || tool.d > f.width + 1e-6) return genPocket(ctx, { ...op, stepover: 0.45 });
  const levels = stepLevels(f.top, f.floor + (op.leaveZ ?? 0), op.stepdown || 2);
  const sp = speeds(ctx, op, tool, { ae: tool.d, ap: op.stepdown });
  const path = new Path([0, 0, ctx.clearance]);
  let prevZ = f.top;
  const rEff = Math.min(R, f.width / 2 - 0.002);
  for (const z of levels) {
    const boundary = featureBoundary(ctx, f, z, R);
    const loops = offsetLoops([boundary], -rEff, { tol: 0.002 });
    if (!loops.length) continue;
    cutLoops(path, orient(loops, op.direction), z, { zFrom: prevZ + 0.5, safe: null, feed: sp.feed, plunge: sp.plunge, ramp: op.ramp ?? 3, R, retractZ: prevZ + ctx.retract, clearZ: ctx.clearance });
    prevZ = z;
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp };
}

/** Helical bore of a round hole or counterbore: a helix down at the hole radius minus the tool radius. */
function genHelix(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2;
  const f = featureOf(ctx, op);
  if (!f || f.type !== 'hole') throw Object.assign(new Error('helix needs a hole'), { code: 'needHole' });
  // The counterbore (target 'counterbore') or the hole under it (target 'hole', the default without one).
  const cb = f.counterbore && op.target !== 'hole';
  const holeR = (cb ? f.counterbore.d : f.d) / 2;
  const bottom = cb ? f.top - f.counterbore.depth : (f.through ? f.bottom - 0.5 : f.bottom);
  const r = holeR - R - (op.leave ?? 0);
  if (r < 0) throw Object.assign(new Error('tool too big'), { code: 'tooBig' });
  const sp = speeds(ctx, op, tool, { ae: R, ap: op.stepdown });
  const path = new Path([f.x + r, f.y, ctx.clearance]);
  path.rapid([f.x + r, f.y, ctx.clearance]);
  path.rapid([f.x + r, f.y, f.top + 1]);
  const pitch = Math.max(0.1, op.stepdown || 1.5);
  const turns = Math.max(1, Math.ceil((f.top + 1 - bottom) / pitch));
  const n = Math.max(24, Math.ceil((2 * Math.PI * Math.max(r, 0.5)) / 0.5));
  const sign = op.direction === 'conventional' ? -1 : 1;
  const z0 = f.top + 1;
  for (let k = 1; k <= turns * n; k++) { const a = (sign * 2 * Math.PI * k) / n; path.feed([f.x + r * Math.cos(a), f.y + r * Math.sin(a), z0 - ((z0 - bottom) * k) / (turns * n)], sp.feed); }
  for (let k = 1; k <= n; k++) { const a = (sign * 2 * Math.PI * k) / n; path.feed([f.x + r * Math.cos(a), f.y + r * Math.sin(a), bottom], sp.feed); }
  path.feed([f.x, f.y, bottom], sp.feed);
  path.rapid([f.x, f.y, ctx.clearance]);
  return { moves: path.moves, ...sp };
}

/** Drilling cycles at holes: the op's feature, or every hole whose drill / tap size is the tool's. */
function genDrilling(ctx, op) {
  const tool = toolOf(ctx, op);
  const holes = op.feature ? [featureOf(ctx, op)].filter((f) => f?.type === 'hole') : ctx.features.filter((f) => f.type === 'hole' && holeMatches(f, tool, op.type));
  if (!holes.length) throw Object.assign(new Error('no holes'), { code: 'noHoles' });
  const sp = speeds(ctx, op, tool);
  const path = new Path([holes[0].x, holes[0].y, ctx.clearance]);
  path.rapid([holes[0].x, holes[0].y, ctx.clearance]);
  // Nearest neighbour order.
  const left = [...holes]; const order = [];
  let at = [path.pos[0], path.pos[1]];
  while (left.length) { let bi = 0; let bd = Infinity; left.forEach((h, i) => { const d = Math.hypot(h.x - at[0], h.y - at[1]); if (d < bd) { bd = d; bi = i; } }); const h = left.splice(bi, 1)[0]; order.push(h); at = [h.x, h.y]; }
  const tip = tool.type === 'drill' ? (tool.d / 2) / Math.tan(((tool.tip ?? 118) / 2) * Math.PI / 180) : 0;
  const cycle = { spot: 'drill', drill: 'drill', peck: 'peck', chipBreak: 'chip', tap: 'tap' }[op.type];
  for (const h of order) {
    const start = h.counterbore ? h.top - h.counterbore.depth : h.top;
    let bottom;
    if (op.type === 'spot') bottom = start - Math.max(0.2, op.depth ?? (h.d / 2) * 0.5);
    else if (op.type === 'tap') bottom = h.through ? h.bottom - (op.breakThrough ?? 0) : h.bottom + (tool.pitch ?? 1) * 1.5;
    else bottom = h.through ? h.bottom - tip - (op.breakThrough ?? 1) : h.bottom - tip;
    const q = op.type === 'peck' || op.type === 'chipBreak' ? (op.peck > 0 ? op.peck : tool.d) : 0;
    // R plane over the hole's top (a counterbore floor below it may not be cut yet when this runs).
    path.cycle({ cycle, p: [h.x, h.y, round(bottom, 1e4)], r: round(h.top + ctx.retract, 1e4), init: ctx.clearance, q, f: sp.feed, dwell: op.dwell ?? 0, pitch: tool.pitch ?? 0, hole: h.id });
  }
  return { moves: path.moves, ...sp };
}

function holeMatches(h, tool, type) {
  if (type === 'tap') return Boolean(h.thread) && METRIC_THREADS[h.thread] && Math.abs(METRIC_THREADS[h.thread][1] - (tool.pitch ?? 0)) < 1e-6;
  if (type === 'spot') return true;
  return Math.abs(h.d - tool.d) < 0.06;
}

/** 3D z-level roughing over the whole part (or a feature's area). */
function genZLevel(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2;
  const leaveZ = op.leaveZ ?? 0;
  const extra = ctx.model.levels.filter((l) => l.up).map((l) => l.z + leaveZ);
  const levels = stepLevels(ctx.stock.z1, ctx.model.bounds.lo[2] + leaveZ, op.stepdown || 2, extra);
  const step = tool.d * Math.min(0.9, Math.max(0.05, op.stepover ?? 0.4));
  const sp = speeds(ctx, op, tool, { ae: step, ap: op.stepdown });
  const path = new Path([0, 0, ctx.clearance]);
  let prevZ = ctx.stock.z1;
  // A ball or bull nose cuts higher than its tip at its rim: keep the radial leave at least that.
  const cutter = cutterOf(tool);
  const leave = (op.leave ?? 0) + (cutter.type === 'flat' ? 0 : 0);
  for (const z of levels) {
    const region = centreRegion(ctx, z, R, leave, { shadowStep: op.stepdown || 2 });
    if (!region.length) continue;
    const rings = [region]; let cur = region;
    for (let k = 0; k < 500; k++) { cur = offsetLoops(cur, -step, { tol: Math.min(0.005, R / 50) }); if (!cur.length) break; rings.push(cur); }
    // Each connected area on its own, inside out.
    const groups = groupRegions(region);
    for (const g of groups) {
      const inG = (l) => windingOf(g.outer, l[0]) !== 0;
      const loops = ringsInsideOut(rings).map((r) => orient(r.filter(inG), op.direction)).flat();
      cutLoops(path, loops, z, { zFrom: prevZ + 0.5, safe: [g.outer, ...g.holes], feed: sp.feed, plunge: sp.plunge, ramp: op.ramp ?? 3, R, retractZ: prevZ + ctx.retract, clearZ: ctx.clearance });
      path.rapid([path.pos[0], path.pos[1], prevZ + ctx.retract]);
    }
    prevZ = z;
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp };
}

/** The XY area a 3D finishing pass covers: a freeform feature's box, or the part's box, grown by the radius. */
function finishArea(ctx, op, R) {
  const f = featureOf(ctx, op);
  const b = f?.bounds ?? ctx.model.bounds;
  return [b.lo[0] - R, b.lo[1] - R, b.hi[0] + R, b.hi[1] + R];
}

/** Stepover between passes from the scallop height (ball) or the stepover fraction. */
function finishStep(tool, op) {
  const R = tool.d / 2;
  if (op.stepover > 0) return tool.d * op.stepover;
  const h = Math.max(1e-4, op.scallop ?? 0.01);
  const rc = tool.type === 'ball' ? R : tool.type === 'bull' ? (tool.rc || 0.5) : R;
  return Math.min(tool.d * 0.8, 2 * Math.sqrt(Math.max(0, 2 * rc * h - h * h)) + (tool.type === 'bull' ? 2 * (R - rc) : 0));
}

/**
 * Drops the cutter along a polyline (XY points) → 3D points. A segment whose middle needs the cutter higher
 * than the straight line between its ends is split (again and again where the surface bends), so the
 * straight moves between the points do not cut into the part.
 */
function dropAlong(ctx, cutter, pts, floor, leave, sample, tol = 0.002) {
  const grid = ctx.model.topGrid();
  const drop = (x, y) => dropCutter(grid, cutter, x, y, floor) + leave;
  const base = resample(pts, sample).map((p) => [p[0], p[1], drop(p[0], p[1])]);
  const out = [];
  const refine = (a, b, depth) => {
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // A cliff (steeper than 45°): up first at the low end, or across first and down at the far end, so the
    // move never cuts the edge it climbs; the level part is refined in turn.
    if (Math.abs(b[2] - a[2]) > run + tol && run > 1e-9) {
      const corner = b[2] > a[2] ? [a[0], a[1], b[2]] : [b[0], b[1], a[2]];
      if (b[2] > a[2]) { out.push(corner); refine(corner, b, depth + 1); } else { refine(a, corner, depth + 1); out.push(corner); }
      return;
    }
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const zm = drop(m[0], m[1]);
    if (depth < 12 && zm > (a[2] + b[2]) / 2 + tol) { const mid = [m[0], m[1], zm]; refine(a, mid, depth + 1); out.push(mid); refine(mid, b, depth + 1); }
  };
  for (let i = 0; i < base.length; i++) { if (i) refine(base[i - 1], base[i], 0); out.push(base[i]); }
  return simplify3(out, tol);
}

/** Drops collinear points (within tol). */
function simplify3(pts, tol) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out.at(-1); const b = pts[i]; const c = pts[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const L = Math.hypot(...ac);
    if (L < 1e-12) continue;
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (Math.hypot(...cr) / L > tol) out.push(b);
  }
  out.push(pts.at(-1));
  return out;
}

/** Parallel (raster) finishing: lines at an angle, the cutter dropped on the mesh. */
function genParallel(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2; const cutter = cutterOf(tool);
  const [x0, y0, x1, y1] = finishArea(ctx, op, R);
  const step = finishStep(tool, op);
  const sp = speeds(ctx, op, tool, { ae: step, ap: 0.5 });
  const ang = ((op.angle ?? 0) * Math.PI) / 180; const ca = Math.cos(ang); const sa = Math.sin(ang);
  const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const half = Math.hypot(x1 - x0, y1 - y0) / 2;
  const floor = ctx.model.bounds.lo[2];
  const area = [rectLoop(x0, y0, x1, y1)];
  const sample = Math.min(op.sample ?? 0.5, R / 4);
  const path = new Path([x0, y0, ctx.clearance]);
  let k = 0;
  for (let v = -half; v <= half + 1e-9; v += step, k++) {
    const a = [cx - half * ca - v * sa, cy - half * sa + v * ca]; const b = [cx + half * ca - v * sa, cy + half * sa + v * ca];
    for (const piece of clipPolyline(k % 2 ? [b, a] : [a, b], area)) {
      const pts = dropAlong(ctx, cutter, piece, floor, op.leave ?? 0, sample);
      if (!pts.length) continue;
      const first = pts[0];
      const near = Math.hypot(path.pos[0] - first[0], path.pos[1] - first[1]) <= step * 1.5 && path.pos[2] < ctx.clearance - 1e-9;
      if (near) {
        // Step over along the surface (dropped too), so the link does not cut into the part.
        for (const q of dropAlong(ctx, cutter, [[path.pos[0], path.pos[1]], [first[0], first[1]]], floor, op.leave ?? 0, sample).slice(1)) path.feed(q, sp.feed);
      } else {
        path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
        path.rapid([first[0], first[1], ctx.clearance]);
        path.rapid([first[0], first[1], first[2] + ctx.retract]);
        path.feed(first, sp.plunge);
      }
      for (const q of pts.slice(1)) path.feed(q, sp.feed);
    }
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp, stepover: step };
}

/**
 * The cusp left between two ball positions: in the plane through both centres (c0, c1: [t, z] across the passes)
 * the two circles of radius R meet below the centres at the cusp; its height over the part is measured square
 * to the surface.
 * surf(t) → the part's height below the cross-section point t. Returns the cusp height (≥ 0).
 */
export function cuspHeight(c0, c1, R, surf) {
  const dx = c1[0] - c0[0]; const dz = c1[1] - c0[1]; const d = Math.hypot(dx, dz);
  if (d < 1e-12) return 0;
  if (d >= 2 * R) return Infinity;
  const m = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2]; const hc = Math.sqrt(R * R - (d / 2) ** 2);
  // The ridge between two ball bottoms tops out where the circles meet below the line of centres.
  const p1 = [m[0] - (dz / d) * hc, m[1] + (dx / d) * hc]; const p2 = [m[0] + (dz / d) * hc, m[1] - (dx / d) * hc];
  const cusp = p1[1] < p2[1] ? p1 : p2;
  const z = surf(cusp[0]);
  if (!Number.isFinite(z)) return 0;
  const e = 1e-3; const slope = (surf(cusp[0] + e) - surf(cusp[0] - e)) / (2 * e);
  return Math.max(0, (cusp[1] - z) / Math.sqrt(1 + (Number.isFinite(slope) ? slope * slope : 0)));
}

/**
 * Scallop finishing with a ball: every point of a pass steps inward by its own distance — the one at which the
 * cusp with the next pass, found from the two ball positions over the part's actual cross-section there, is the
 * scallop height asked for (bisection). So the scallop holds on flat, steep and curved areas alike. The stepped
 * points make the next pass (its self-crossings in tight corners resolved by the positive fill rule, where the
 * passes then come closer and the scallop is lower).
 */
function genScallop(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2; const cutter = cutterOf(tool);
  if (cutter.type !== 'ball') return genScallopUniform(ctx, op);
  const [x0, y0, x1, y1] = finishArea(ctx, op, R);
  const h = Math.max(1e-4, op.scallop ?? 0.01);
  const sFlat = 2 * Math.sqrt(Math.max(1e-12, 2 * R * h - h * h));
  const sp = speeds(ctx, op, tool, { ae: finishStep(tool, op), ap: 0.5 });
  const floor = ctx.model.bounds.lo[2];
  const leave = op.leave ?? 0;
  const sample = Math.min(op.sample ?? 0.5, R / 4);
  const grid = ctx.model.topGrid();
  const drop = (x, y) => dropCutter(grid, cutter, x, y, floor) + leave;
  const top = (x, y) => { const v = grid.topAt(x, y); return Number.isFinite(v) ? v + leave : floor + leave; };
  const path = new Path([x0, y0, ctx.clearance]);
  const passes = [];
  let ring = [rectLoop(x0, y0, x1, y1)];
  for (let k = 0; k < 4000 && ring.length; k++) {
    const next = [];
    for (const loop of ring) {
      const closed = [...loop, loop[0]];
      const pts = dropAlong(ctx, cutter, closed, floor, leave, sample);
      if (pts.length < 2) continue;
      passes.push(pts);
      const near = Math.hypot(path.pos[0] - pts[0][0], path.pos[1] - pts[0][1]) <= 4 * R && path.pos[2] < ctx.clearance - 1e-9;
      if (near) for (const q of dropAlong(ctx, cutter, [[path.pos[0], path.pos[1]], [pts[0][0], pts[0][1]]], floor, leave, sample).slice(1)) path.feed(q, sp.feed);
      else { path.rapid([path.pos[0], path.pos[1], ctx.clearance]); path.rapid([pts[0][0], pts[0][1], ctx.clearance]); path.rapid([pts[0][0], pts[0][1], pts[0][2] + ctx.retract]); }
      path.feed(pts[0], sp.plunge);
      for (const q of pts.slice(1)) path.feed(q, sp.feed);
      // Every point of the loop's polygon steps inward by its own distance.
      const poly = resample(loop, Math.max(sample, R / 2), true);
      const n = poly.length;
      const stepped = poly.map((p, i) => {
        const a = poly[(i - 1 + n) % n]; const b = poly[(i + 1) % n];
        const tx = b[0] - a[0]; const ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl; const ny = tx / tl; // inward (left of a CCW loop)
        const z0 = drop(p[0], p[1]) + R;
        const height = (s) => cuspHeight([0, z0], [s, drop(p[0] + nx * s, p[1] + ny * s) + R], R, (t) => top(p[0] + nx * t, p[1] + ny * t));
        let lo = 0; let hi = 2 * R * 0.999;
        if (height(hi) <= h) lo = hi;
        else for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (height(mid) <= h) lo = mid; else hi = mid; }
        // Where no step keeps the cusp (a wall the passes climb), the passes keep a 3D distance of the flat-ground
        // stepover, at least a quarter of it in plan.
        let s = lo;
        if (s < sFlat * 0.25) {
          let a = 0; let c = sFlat;
          for (let it = 0; it < 12; it++) { const mid = (a + c) / 2; const dz = drop(p[0] + nx * mid, p[1] + ny * mid) - (z0 - R); if (Math.hypot(mid, dz) <= sFlat) a = mid; else c = mid; }
          s = Math.max(a, sFlat * 0.25);
        }
        return [p[0] + nx * s, p[1] + ny * s];
      });
      next.push(stepped);
    }
    // Each stepped loop made simple again (the positive fill rule drops the swallow-tails of tight corners);
    // pieces too small to hold a pass and repeats are left out.
    const seen = new Set(); ring = []; const apex = [];
    for (const st of next) {
      const pieces = offsetLoops([st], -1e-4, { tol: 0.002 });
      const big = pieces.filter((l) => loopArea(l) > sample * sample);
      if (!big.length) {
        // The ring has closed up: one plunge at the middle of what is left so the top is finished too.
        const last = pieces.filter((l) => loopArea(l) > 1e-6).sort((x, y) => loopArea(y) - loopArea(x))[0];
        if (last) apex.push([last.reduce((a2, q) => a2 + q[0], 0) / last.length, last.reduce((a2, q) => a2 + q[1], 0) / last.length]);
        continue;
      }
      for (const l of big) { const k2 = loopSig(l); if (!seen.has(k2)) { seen.add(k2); ring.push(l); } }
    }
    for (const a2 of apex) {
      const q = [a2[0], a2[1], drop(a2[0], a2[1])];
      path.rapid([path.pos[0], path.pos[1], Math.max(path.pos[2], q[2]) + ctx.retract]); path.rapid([q[0], q[1], q[2] + ctx.retract]); path.feed(q, sp.plunge);
      passes.push([q]);
    }
  }
  // Clean-up: the scallop actually left (scallopLeft: the surface's distance to the nearest ball position, less
  // the radius) checked on a fine grid over the area; where it is over the height asked for — the corners where
  // rings that started square close up, and where they meet the apex — short passes go through exactly those
  // places, so the height holds everywhere.
  const dropPath = (plan) => dropAlong(ctx, cutter, plan, floor, leave, sample);
  const rings = passes.length;
  for (const pts of scallopCleanup(passes, [x0, y0, x1, y1], R, h, top, dropPath, Math.min(sFlat / 8, sample / 2), sample)) {
    path.rapid([path.pos[0], path.pos[1], ctx.clearance]); path.rapid([pts[0][0], pts[0][1], ctx.clearance]); path.rapid([pts[0][0], pts[0][1], pts[0][2] + ctx.retract]);
    path.feed(pts[0], sp.plunge);
    for (const q of pts.slice(1)) path.feed(q, sp.feed);
    passes.push(pts);
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp, scallop: h, passes, cleanup: passes.length - rings };
}

/**
 * The scallop a ball of radius R leaves after `passes` (tool-tip polylines), at plan points of the area: the
 * surface point (x, y, top(x, y)) to the nearest ball position (centres along the passes, R over the tip), less R.
 * `at(x, y)` → the height left; positions are binned on a plan grid for the search.
 */
export function scallopLeft(passes, R, top, { step = 0.1 } = {}) {
  const cell = Math.max(R, 0.5); const bins = new Map();
  const key = (i, j) => i * 1e6 + j;
  const put = (c) => { const k = key(Math.floor(c[0] / cell), Math.floor(c[1] / cell)); let b = bins.get(k); if (!b) bins.set(k, (b = [])); b.push(c); };
  for (const pass of passes) {
    if (pass.length === 1) { put([pass[0][0], pass[0][1], pass[0][2] + R]); continue; }
    for (let i = 0; i + 1 < pass.length; i++) {
      const a = pass[i]; const b = pass[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
      for (let k = 0; k <= n; k++) { const t = k / n; put([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + R]); }
    }
  }
  const reach = Math.ceil((2 * R) / cell) + 1;
  return {
    /** The height left at (x, y); with `limit`, the search stops at the first ball leaving no more than it. */
    at(x, y, limit = -Infinity) {
      const z = top(x, y);
      if (!Number.isFinite(z)) return 0;
      const i = Math.floor(x / cell); const j = Math.floor(y / cell);
      const enough = Number.isFinite(limit) ? (R + limit) ** 2 : -1;
      let best = Infinity;
      for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
        const list = bins.get(key(i + a, j + b)); if (!list) continue;
        for (const c of list) { const d = (c[0] - x) ** 2 + (c[1] - y) ** 2 + (c[2] - z) ** 2; if (d < best) { best = d; if (best <= enough) return Math.sqrt(best) - R; } }
      }
      return Math.sqrt(best) - R;
    },
  };
}

/**
 * Passes that take the scallop down to `h` where `passes` leave more: the plan grid (spacing `g`) over the area
 * is checked (scallopLeft); the cells over h, grouped by adjacency, each get a pass through the ball positions that
 * touch the surface there (R along its normal, so off to the side on a slope) (ordered
 * along the group's long axis, the tool dropped onto the part every `sample`), a single point a plunge. Repeats
 * until nothing is over h (at most 4 rounds).
 */
function scallopCleanup(passes, [x0, y0, x1, y1], R, h, top, dropPath, g, sample) {
  const out = [];
  const all = [...passes];
  const nx = Math.max(1, Math.ceil((x1 - x0) / g)); const ny = Math.max(1, Math.ceil((y1 - y0) / g));
  for (let round = 0; round < 4; round++) {
    const left = scallopLeft(all, R, top);
    const over = new Map();
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const x = x0 + ((x1 - x0) * i) / nx; const y = y0 + ((y1 - y0) * j) / ny;
      if (!(left.at(x, y, h) > h)) continue;
      // A ball touches a slope where the surface's normal points at its centre: to take the material at (x, y)
      // its centre stands R along that normal, so in plan R times the normal's level part away (downhill).
      const e = Math.max(1e-3, g / 4);
      const gx = (top(x + e, y) - top(x - e, y)) / (2 * e); const gy = (top(x, y + e) - top(x, y - e)) / (2 * e);
      const k = Number.isFinite(gx) && Number.isFinite(gy) ? R / Math.sqrt(1 + gx * gx + gy * gy) : 0;
      over.set(i * (ny + 1) + j, [x - gx * k, y - gy * k]);
    }
    if (!over.size) break;
    // Groups of neighbouring cells.
    const seen = new Set();
    for (const [k0] of over) {
      if (seen.has(k0)) continue;
      const group = []; const stack = [k0]; seen.add(k0);
      while (stack.length) {
        const k = stack.pop(); group.push(over.get(k));
        const i = Math.floor(k / (ny + 1)); const j = k % (ny + 1);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const kk = (i + a) * (ny + 1) + (j + b);
          if (i + a >= 0 && i + a <= nx && j + b >= 0 && j + b <= ny && over.has(kk) && !seen.has(kk)) { seen.add(kk); stack.push(kk); }
        }
      }
      // Along the group's long axis (principal direction), through its points.
      const cx = group.reduce((s2, p) => s2 + p[0], 0) / group.length; const cy = group.reduce((s2, p) => s2 + p[1], 0) / group.length;
      let sxx = 0; let sxy = 0; let syy = 0;
      for (const p of group) { const dx = p[0] - cx; const dy = p[1] - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy); const ux = Math.cos(ang); const uy = Math.sin(ang);
      const ts = group.map((p) => (p[0] - cx) * ux + (p[1] - cy) * uy);
      const t0 = Math.min(...ts); const t1 = Math.max(...ts);
      const n = Math.max(1, Math.ceil((t1 - t0) / sample));
      const plan = [];
      for (let k = 0; k <= (t1 - t0 > 1e-9 ? n : 0); k++) {
        const t = t0 + ((t1 - t0) * k) / n;
        // The group's points near this station, averaged across the axis (the pass runs through the middle).
        const near = group.filter((p, q) => Math.abs(ts[q] - t) <= Math.max(g, sample / 2));
        const off = near.length ? near.reduce((s2, p) => s2 + (-(p[0] - cx) * uy + (p[1] - cy) * ux), 0) / near.length : 0;
        const x = cx + ux * t - uy * off; const y = cy + uy * t + ux * off;
        plan.push([x, y]);
      }
      const pts = dropPath(plan.length > 1 ? plan : [plan[0], plan[0]]);
      if (!pts.length) continue;
      out.push(pts); all.push(pts);
    }
  }
  return out;
}

/** Scallop finishing for flat and bull-nose cutters: rings spaced so the 3D distance between passes holds. */
function genScallopUniform(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2; const cutter = cutterOf(tool);
  const [x0, y0, x1, y1] = finishArea(ctx, op, R);
  const s3 = finishStep(tool, op);
  const sp = speeds(ctx, op, tool, { ae: s3, ap: 0.5 });
  const floor = ctx.model.bounds.lo[2];
  const sample = Math.min(op.sample ?? 0.5, R / 4);
  const grid = ctx.model.topGrid();
  const path = new Path([x0, y0, ctx.clearance]);
  let ring = [rectLoop(x0, y0, x1, y1)];
  let sxy = s3;
  for (let k = 0; k < 2000 && ring.length; k++) {
    let dzSum = 0; let n = 0;
    for (const loop of ring) {
      const closed = [...loop, loop[0]];
      const pts = dropAlong(ctx, cutter, closed, floor, op.leave ?? 0, sample);
      if (pts.length < 2) continue;
      const near = Math.hypot(path.pos[0] - pts[0][0], path.pos[1] - pts[0][1]) <= s3 * 2 && path.pos[2] < ctx.clearance - 1e-9;
      if (near) {
        // Step over to the next ring along the surface (dropped), so the link does not cut a bump between.
        for (const q of dropAlong(ctx, cutter, [[path.pos[0], path.pos[1]], [pts[0][0], pts[0][1]]], floor, op.leave ?? 0, sample).slice(1)) path.feed(q, sp.feed);
      } else { path.rapid([path.pos[0], path.pos[1], ctx.clearance]); path.rapid([pts[0][0], pts[0][1], ctx.clearance]); path.rapid([pts[0][0], pts[0][1], pts[0][2] + ctx.retract]); }
      path.feed(pts[0], sp.plunge);
      for (const q of pts.slice(1)) path.feed(q, sp.feed);
      // Slope across the ring: heights a step inward against here.
      for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 24))) {
        const a = pts[i]; const b = pts[Math.min(pts.length - 1, i + 1)];
        const t = [b[0] - a[0], b[1] - a[1]]; const tl = Math.hypot(...t) || 1;
        const inward = [-t[1] / tl, t[0] / tl];
        const zIn = dropCutter(grid, cutter, a[0] + inward[0] * sxy, a[1] + inward[1] * sxy, floor);
        dzSum += Math.abs(zIn - a[2]); n++;
      }
    }
    // Constant 3D spacing: the XY step shrinks where the surface is steep.
    const dz = n ? dzSum / n : 0;
    sxy = Math.max(s3 * 0.2, (s3 * sxy) / Math.hypot(sxy, dz));
    ring = offsetLoops(ring, -sxy, { tol: 0.005 });
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp, stepover: s3 };
}

/**
 * A waterline loop (CCW around material) made exact: every point pushed outward until the dropped cutter
 * stands no higher than the level, and the segments between split where their middle would still cut.
 */
function pushOut(ctx, cutter, loop, z, R, leave, tol = 0.003) {
  const grid = ctx.model.topGrid();
  const floor = ctx.model.bounds.lo[2] - 1;
  // Does the cutter, its tip at the level, cut the part here? (Only triangles above the level can say yes.)
  const lim = z + tol - leave;
  const high = (x, y) => dropCutter(grid, cutter, x, y, lim, lim) > lim;
  const pts = resample(loop, Math.max(0.05, R / 4), true);
  const n = pts.length;
  const out = [];
  const fix = (p, nx, ny) => {
    if (!high(p[0], p[1])) return p;
    // The approximate loop is usually only a little inside: a short step out, doubled until clear, then halved.
    let lo = 0; let hi = 0.02;
    while (high(p[0] + nx * hi, p[1] + ny * hi) && hi < 4 * R) { lo = hi; hi *= 2; }
    while (hi - lo > 5e-4) { const mid = (lo + hi) / 2; if (high(p[0] + nx * mid, p[1] + ny * mid)) lo = mid; else hi = mid; }
    return [p[0] + nx * hi, p[1] + ny * hi];
  };
  const normal = (i) => { const a = pts[(i - 1 + n) % n]; const b = pts[(i + 1) % n]; const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; };
  const fixed = pts.map((p, i) => { const [nx, ny] = normal(i); return fix(p, nx, ny); });
  for (let i = 0; i < n; i++) {
    const a = fixed[i]; const b = fixed[(i + 1) % n];
    out.push(a);
    // Middle of the segment: pushed too if it would cut (a concave bend between the points).
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (high(m[0], m[1])) { const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; out.push(fix(m, dy / l, -dx / l)); }
  }
  return cleanLoop(out, 1e-6);
}

/** Waterline finishing: at each height, the tool's own shape stepped against the part's sections above the tip. */
function genWaterline(ctx, op) {
  const tool = toolOf(ctx, op); const R = tool.d / 2; const cutter = cutterOf(tool);
  const top = ctx.model.bounds.hi[2]; const bottom = ctx.model.bounds.lo[2];
  const levels = stepLevels(top, bottom, op.stepdown || 0.5).filter((z) => z > bottom + 1e-6);
  const sp = speeds(ctx, op, tool, { ae: R * 0.2, ap: op.stepdown });
  const path = new Path([0, 0, ctx.clearance]);
  const rc = cutter.type === 'flat' ? 0 : cutter.rc;
  const eps = ctx.model.eps * 4;
  if (ctx.model.shape) return exactWaterline(ctx, op, { tool, R, cutter, rc, levels, sp, path, eps });
  for (const z of levels) {
    // The cutter's radius at heights above its tip, and the part's material at those heights (and higher).
    const samples = rc > 0 ? 6 : 1;
    const grown = [];
    for (let j = 0; j <= samples; j++) {
      const hgt = rc > 0 ? (rc * j) / samples : 0;
      const rho = rc > 0 ? (R - rc) + Math.sqrt(Math.max(0, rc * rc - (rc - hgt) * (rc - hgt))) : R;
      const zz = Math.min(z + hgt + eps, top - eps);
      const mat = ctx.model.slice(zz);
      if (!mat.length || rho <= 1e-6) continue;
      grown.push(...offsetLoops(mat, rho + (op.leave ?? 0), { tol: 0.003 }));
    }
    // Material higher up (under which the shank would pass) also stops the cutter.
    for (const l of ctx.model.levels) if (l.up && l.z > z + rc + eps) { const mat = ctx.model.slice(l.z - eps); if (mat.length) grown.push(...offsetLoops(mat, R + (op.leave ?? 0), { tol: 0.003 })); }
    if (!grown.length) continue;
    const loops = unionLoops(grown).filter((l) => loopArea(l) > 0).map((l) => pushOut(ctx, cutter, l, z, R, op.leave ?? 0)).filter((l) => l.length > 2);
    if (!loops.length) continue;
    // Around the part from outside: climb = clockwise.
    const ordered = loops.map((l) => (op.direction === 'conventional' ? l : reverseLoop(l)));
    cutLoops(path, ordered, z, { zFrom: z + ctx.retract, safe: null, feed: sp.feed, plunge: sp.plunge, ramp: 90, R, retractZ: z + ctx.retract, clearZ: ctx.clearance });
    path.rapid([path.pos[0], path.pos[1], z + ctx.retract]);
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp };
}

/**
 * Waterline from the B-rep: the tool centre's curve at each height is a section of the offset solid — the part
 * grown by the ball's radius (ball), by the corner radius and then the flat part of the bottom (bull nose), or
 * the part's own section grown by the radius (flat). Material higher up, which the shank would meet: where nothing
 * above the shank's height faces down, the part's section there already holds everything above it (and the contact
 * curve holds that grown by R); otherwise the exact shadow of the material above (shadowAbove) grown by R is added.
 */
function exactWaterline(ctx, op, { R, cutter, rc, levels, sp, path, eps }) {
  const shape = ctx.model.shape; const leave = op.leave ?? 0;
  const top = ctx.model.bounds.hi[2];
  for (const z of levels) {
    let contact;
    // A hair above the centre height: a section exactly in a flat face of the offset solid (a floor the tool
    // stands on) returns that face's edges instead of the outline.
    const lift = 1e-4;
    if (cutter.type === 'ball') contact = kernelSection(offsetSolid(shape, R + leave), z + R + lift);
    else if (rc > 0) contact = offsetLoops(kernelSection(offsetSolid(shape, rc + leave), z + rc + lift), R - rc, { tol: 0.001 });
    else contact = offsetLoops(kernelSection(shape, Math.min(z + 1e-4, top - 1e-4)), R + leave, { tol: 0.001 });
    // The shank (radius R) above the rounded tip: material it would pass under.
    const H = z + rc + eps;
    const above = overhangTop(shape) > H ? shadowAbove(shape, H) : [];
    let loops = contact;
    if (above.length) {
      const shank = offsetLoops(above, R + leave, { tol: 0.002 });
      const outside = shank.some((l) => l.some((q) => !insideRegion(contact, q)));
      if (outside) { const u = unionLoops([...contact, ...shank]); if (u.length) loops = u; }
    }
    if (!loops.length) continue;
    // Material on the loops' left: climb milling runs them the other way.
    const ordered = loops.map((l) => (op.direction === 'conventional' ? l : reverseLoop(l)));
    cutLoops(path, ordered, z, { zFrom: z + ctx.retract, safe: null, feed: sp.feed, plunge: sp.plunge, ramp: 90, R, retractZ: z + ctx.retract, clearZ: ctx.clearance });
    path.rapid([path.pos[0], path.pos[1], z + ctx.retract]);
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp, exact: true };
}

// ───────────────────────── turning

/** The outer and bore radius at z from the profile samples (nearest sample). */
/** The turning profile sample nearest to z ({ outer: 0, inner: 0 } beyond the part). */
export function profileAt(profile, z) {
  if (!profile) return { outer: 0, inner: 0 };
  const s = profile.samples;
  if (!s.length) return { outer: 0, inner: 0 };
  if (z > s[0].z) return z > profile.front ? { outer: 0, inner: 0 } : s[0];
  if (z < s.at(-1).z) return z < profile.back ? { outer: 0, inner: 0 } : s.at(-1);
  let lo = 0; let hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].z >= z) lo = m; else hi = m; }
  return Math.abs(s[lo].z - z) < Math.abs(s[hi].z - z) ? s[lo] : s[hi];
}

/** The outer profile as the tool can reach it from the front (recesses behind a shoulder bridged at the angle). */
function reachableOuter(profile, clearanceDeg) {
  const k = Math.tan((clearanceDeg * Math.PI) / 180);
  const out = []; let prev = null;
  for (const s of profile.samples) {
    let r = s.outer;
    if (prev) r = Math.max(r, prev.r - k * (prev.z - s.z));
    out.push({ z: s.z, r }); prev = { z: s.z, r };
  }
  return out;
}
function reachableInner(profile, clearanceDeg) {
  const k = Math.tan((clearanceDeg * Math.PI) / 180);
  const out = []; let prev = null;
  for (const s of profile.samples) {
    let r = s.inner > 0 ? s.inner : 0;
    if (prev) r = Math.min(r, prev.r + k * (prev.z - s.z));
    out.push({ z: s.z, r }); prev = { z: s.z, r };
  }
  return out;
}

function turnSpeeds(ctx, op, tool, finish) {
  const d = turningData(tool, ctx.materialClass, ctx.machine, { finish });
  return { vc: op.vc > 0 ? Number(op.vc) : d.vc, feedRev: op.feedRev > 0 ? Number(op.feedRev) : d.feedRev, maxRpm: d.maxRpm, rpm: Math.round(d.rpmAt(2 * (ctx.stock.r || 20))), css: true };
}

function genTFace(ctx, op) {
  const tool = toolOf(ctx, op); const s = ctx.stock; const p = ctx.profile; const n = tool.nose ?? 0.4;
  const target = p.front + (op.leaveZ ?? 0);
  const levels = stepLevels(s.z1, target, op.stepdown || 1);
  const sp = turnSpeeds(ctx, op, tool, false);
  const path = new Path([s.r + 5, 0, s.z1 + 5]);
  const xIn = (s.bore ?? 0) > 0 ? s.bore - n : -n;
  for (const z of levels) {
    const zc = z + n; // nose centre
    path.rapid([s.r + 2, 0, zc + 1]);
    path.rapid([s.r + 2, 0, zc]);
    path.feed([xIn, 0, zc], sp.feedRev);
    path.feed([xIn, 0, zc + 1], sp.feedRev);
    path.rapid([s.r + 2, 0, zc + 1]);
  }
  return { moves: path.moves, ...sp, feed: sp.feedRev, nose: n, side: 'od', tipOffset: tipOffset(tool, 'od') };
}

function genTRough(ctx, op) {
  const tool = toolOf(ctx, op); const s = ctx.stock; const p = ctx.profile; const n = tool.nose ?? 0.8;
  const leave = op.leave ?? 0.3; const leaveZ = op.leaveZ ?? 0.1;
  const env = reachableOuter(p, 0).map((q) => ({ z: q.z, r: q.r + leave + n }));
  const sp = turnSpeeds(ctx, op, tool, false);
  const ap = Math.max(0.1, op.stepdown || 2);
  const path = new Path([s.r + 5, 0, s.z1 + 5]);
  const minR = Math.min(...env.map((e) => e.r));
  const back = p.back + leaveZ;
  for (let x = s.r + n - ap; x > minR - 1e-9 + 0; x -= ap) {
    // From the front along −Z until the profile (plus the leave and the nose) reaches this radius.
    let zEnd = back + n;
    for (const e of env) { if (e.r >= x - 1e-9) { zEnd = Math.max(e.z + leaveZ + n, back + n); break; } }
    // The profile at the front may already stand higher: then nothing to cut at this radius.
    if (env.length && env[0].r >= x - 1e-9) continue;
    path.rapid([x + ap, 0, s.z1 + 1]);
    path.rapid([x, 0, s.z1 + 1]);
    path.feed([x, 0, zEnd], sp.feedRev);
    path.feed([x + ap, 0, zEnd + ap], sp.feedRev);
    path.rapid([x + ap, 0, s.z1 + 1]);
  }
  path.rapid([s.r + 5, 0, s.z1 + 5]);
  return { moves: path.moves, ...sp, feed: sp.feedRev, nose: n, side: 'od', tipOffset: tipOffset(tool, 'od') };
}

/**
 * The nose centre path on a profile polyline [{ z, r }] (front to back) for a nose of radius n: at every z the
 * outermost centre (side 1; innermost for a bore, side −1) whose disk touches the polyline — its vertices and
 * the insides of its segments — without crossing it. Returns { z, x } samples.
 */
function noseCentre(prof, n, side = 1) {
  const P = side > 0 ? prof : prof.map((q) => ({ z: q.z, r: -q.r }));
  const step = Math.max(0.01, Math.min(0.05, n / 4));
  const front = P[0].z; const back = P.at(-1).z;
  const out = [];
  for (let z = front + n - 1e-9; z >= back - 1e-9; z -= step) {
    let x = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const dz = z - a.z;
      if (Math.abs(dz) <= n + 1e-9) x = Math.max(x, a.r + Math.sqrt(Math.max(0, n * n - dz * dz)));
      const b = P[i + 1];
      if (!b || Math.abs(b.z - a.z) < 1e-12) continue;
      // Tangent to the segment's line, where the touch point lies on the segment.
      const m = (b.r - a.r) / (b.z - a.z); const k = Math.sqrt(1 + m * m);
      const sTouch = z + (n * m) / k; // the foot of the centre on the line: centre = foot + n · (−m, 1) / k
      if (sTouch < Math.min(a.z, b.z) - 1e-12 || sTouch > Math.max(a.z, b.z) + 1e-12) continue;
      x = Math.max(x, a.r + m * (z - a.z) + n * k);
    }
    if (Number.isFinite(x)) out.push({ z, x: side > 0 ? x : -x });
  }
  return out;
}

/**
 * How steep a back slope the insert can follow: what is left of 180° after the holder's approach angle and the
 * insert's corner angle, less 3° of clearance (op.clearance > 0 overrides).
 */
function backClearance(tool, op) {
  if (op.clearance > 0) return Number(op.clearance);
  return Math.max(0, 180 - (tool.approach ?? 95) - (tool.angle ?? 80) - 3);
}
/** Imaginary tip offset of a turning tool's nose centre (radius, z): OD tools tip direction 3, boring bars 2. */
const tipOffset = (tool, kind) => { const n = tool.nose ?? 0; return kind === 'id' ? [n, -n] : [-n, -n]; };

function genTFinish(ctx, op) {
  const tool = toolOf(ctx, op); const s = ctx.stock; const p = ctx.profile; const n = tool.nose ?? 0.4;
  const prof = reachableOuter(p, backClearance(tool, op)).map((q) => ({ z: q.z, r: q.r + (op.leave ?? 0) }));
  const sp = turnSpeeds(ctx, op, tool, true);
  const path = new Path([s.r + 5, 0, s.z1 + 5]);
  // The front face from the axis out, then down the profile.
  const body = prof.filter((q) => q.z <= p.front);
  const nc = noseCentre([{ z: p.front, r: 0 }, { z: p.front, r: body[0]?.r ?? 0 }, ...body], n, 1);
  path.rapid([0, 0, p.front + n + 2]);
  path.rapid([-n * 0, 0, p.front + n + 2]);
  path.feed([0, 0, p.front + n], sp.feedRev);
  const pts = simplify3(nc.map((q) => [q.x, 0, q.z]), 0.001);
  for (const q of pts) path.feed(q, sp.feedRev);
  path.feed([path.pos[0] + 1, 0, path.pos[2]], sp.feedRev);
  path.rapid([s.r + 5, 0, path.pos[2]]);
  path.rapid([s.r + 5, 0, s.z1 + 5]);
  // The contour itself (front face and profile) for controls that compensate the nose radius (G42).
  const contour = simplify3([[0, 0, p.front], ...[{ z: p.front, r: body[0]?.r ?? 0 }, ...body].map((q) => [q.r, 0, q.z])], 0.0005);
  return { moves: path.moves, ...sp, feed: sp.feedRev, nose: n, side: 'od', tipOffset: tipOffset(tool, 'od'), contour };
}

function genTDrill(ctx, op) {
  const tool = toolOf(ctx, op); const p = ctx.profile; const s = ctx.stock;
  const boreLen = p.samples.filter((q) => q.inner > 0).length ? p.front - Math.min(...p.samples.filter((q) => q.inner > 0).map((q) => q.z)) : 0;
  if (!(boreLen > 0)) throw Object.assign(new Error('no bore'), { code: 'noBore' });
  const tip = (tool.d / 2) / Math.tan(((tool.tip ?? 118) / 2) * Math.PI / 180);
  const through = p.samples.at(-1).inner > 0;
  const bottom = p.front - boreLen - (through ? tip + 1 : 0);
  const sp = turnSpeeds(ctx, op, tool, false);
  const path = new Path([0, 0, s.z1 + 5]);
  path.rapid([0, 0, s.z1 + 5]);
  path.cycle({ cycle: op.peck > 0 ? 'peck' : 'drill', p: [0, 0, round(bottom, 1e4)], r: round(s.z1 + 2, 1e4), init: s.z1 + 5, q: op.peck || 0, f: sp.feedRev, dwell: 0, pitch: 0, lathe: true });
  return { moves: path.moves, ...sp, feed: sp.feedRev };
}

function genTBore(ctx, op, finish) {
  const tool = toolOf(ctx, op); const s = ctx.stock; const p = ctx.profile; const n = tool.nose ?? 0.4;
  const leave = finish ? (op.leave ?? 0) : op.leave ?? 0.3;
  const inner = reachableInner(p, finish ? backClearance(tool, op) : 0).map((q) => ({ z: q.z, r: q.r > 0 ? q.r - leave : 0 }));
  const bored = inner.filter((q) => q.r > 0);
  if (!bored.length) throw Object.assign(new Error('no bore'), { code: 'noBore' });
  const sp = turnSpeeds(ctx, op, tool, finish);
  const path = new Path([0, 0, s.z1 + 5]);
  const drillR = Math.max(s.bore ?? 0, (ctx.tools.find((t) => t.type === 'turnDrill')?.d ?? 0) / 2);
  if (finish) {
    const nc = noseCentre(bored, n, -1);
    path.rapid([nc[0].x, 0, s.z1 + 2]);
    for (const q of simplify3(nc.map((c) => [c.x, 0, c.z]), 0.001)) path.feed(q, sp.feedRev);
    path.feed([path.pos[0] - 0.5, 0, path.pos[2] + 0.5], sp.feedRev);
    path.rapid([path.pos[0], 0, s.z1 + 5]);
    return { moves: path.moves, ...sp, feed: sp.feedRev, nose: n, side: 'id', tipOffset: tipOffset(tool, 'id'), contour: simplify3(bored.map((q) => [q.r, 0, q.z]), 0.0005) };
  }
  const ap = Math.max(0.1, op.stepdown || 1);
  const maxR = Math.max(...bored.map((q) => q.r));
  for (let x = drillR + ap; x < maxR - n + ap - 1e-9; x += ap) {
    const xc = Math.min(x, maxR - n);
    let zEnd = bored.at(-1).z;
    for (const q of inner) if (q.r - n < xc - 1e-9) { zEnd = q.z + (op.leaveZ ?? 0.1) + n; break; }
    if (inner[0].r - n < xc - 1e-9) continue;
    path.rapid([xc - ap, 0, s.z1 + 1]);
    path.rapid([xc, 0, s.z1 + 1]);
    path.feed([xc, 0, zEnd], sp.feedRev);
    path.feed([Math.max(0, xc - ap), 0, zEnd + ap], sp.feedRev);
    path.rapid([Math.max(0, xc - ap), 0, s.z1 + 1]);
  }
  path.rapid([0, 0, s.z1 + 5]);
  return { moves: path.moves, ...sp, feed: sp.feedRev, nose: n, side: 'id', tipOffset: tipOffset(tool, 'id') };
}

function genTGroove(ctx, op) {
  const tool = toolOf(ctx, op); const s = ctx.stock; const p = ctx.profile;
  const w = tool.width ?? tool.d;
  const grooves = p.grooves.filter((g) => g.width >= w - 1e-6);
  if (!grooves.length) throw Object.assign(new Error('no grooves'), { code: 'noGrooves' });
  const sp = turnSpeeds(ctx, op, tool, false);
  const path = new Path([s.r + 5, 0, s.z1 + 5]);
  for (const g of grooves) {
    const zs = [];
    // Plunge centres from one wall to the other (the tool's centre half a width inside each wall).
    const a = g.z1 - w / 2; const b = g.z0 + w / 2;
    const step = w * Math.min(1, Math.max(0.2, op.stepover ?? 0.8));
    for (let z = a; z > b + 1e-9; z -= step) zs.push(z);
    zs.push(b);
    const top = g.r + g.depth + 1;
    for (const zc of zs) {
      path.rapid([Math.max(top, path.pos[0]), 0, path.pos[2]]);
      path.rapid([top, 0, zc]);
      path.feed([g.r + (op.leave ?? 0), 0, zc], sp.feedRev);
      path.rapid([top, 0, zc]);
    }
  }
  path.rapid([s.r + 5, 0, path.pos[2]]);
  path.rapid([s.r + 5, 0, s.z1 + 5]);
  return { moves: path.moves, ...sp, feed: sp.feedRev, width: w };
}

function genTThread(ctx, op) {
  const tool = toolOf(ctx, op); const s = ctx.stock; const p = ctx.profile;
  const pitch = Math.max(0.2, Number(op.pitch) || 1.5);
  const z1 = op.z1 ?? p.front; const len = op.length > 0 ? op.length : Math.min(20, (p.front - p.back) / 2);
  const z0 = z1 - len;
  const major = op.major > 0 ? op.major / 2 : profileAt(p, z1 - Math.min(len, 1)).outer;
  const depth = 0.61343 * pitch;
  const passes = Math.max(1, Math.round(op.passes || 6));
  const sp = turnSpeeds(ctx, op, tool, false);
  const path = new Path([major + 3, 0, z1 + 2 * pitch]);
  for (let k = 1; k <= passes; k++) {
    const x = major - depth * Math.sqrt(k / passes);
    path.rapid([major + 1, 0, z1 + 2 * pitch]);
    path.rapid([x, 0, z1 + 2 * pitch]);
    path.thread([x, 0, z0], pitch);
    path.rapid([major + 1, 0, z0]);
  }
  path.rapid([major + 1, 0, z1 + 2 * pitch]);
  path.rapid([s.r + 5, 0, s.z1 + 5]);
  return { moves: path.moves, ...sp, rpm: Math.min(sp.maxRpm, Math.round((1000 * sp.vc * 0.5) / (Math.PI * 2 * major))), feed: pitch, thread: { z0, z1, major: major * 2, pitch, depth } };
}

const GENERATORS = {
  facing: genFacing, pocket: (c, o) => genPocket(c, o), adaptive: (c, o) => genPocket(c, o, { adaptive: true }), contour: genContour, slot: genSlot, helix: genHelix,
  spot: genDrilling, drill: genDrilling, peck: genDrilling, chipBreak: genDrilling, tap: genDrilling,
  zlevel: genZLevel, parallel: genParallel, scallop: genScallop, waterline: genWaterline,
  // Multi-axis (cam-multiaxis.js): 4-axis rotary, 5-axis simultaneous, mill-turn live tools.
  rotary4: (c, o) => genRotary4(c, o, { toolOf, speeds }), multi5: (c, o) => genMulti5(c, o, { toolOf, speeds, finishArea, dropAlong, clipPolyline, rectLoop }),
  mtAxial: (c, o) => genMtAxial(c, o, { toolOf, speeds }), mtRadial: (c, o) => genMtRadial(c, o, { toolOf, speeds }),
  tFace: genTFace, tRough: genTRough, tFinish: genTFinish, tDrill: genTDrill, tBoreRough: (c, o) => genTBore(c, o, false), tBoreFinish: (c, o) => genTBore(c, o, true), tGroove: genTGroove, tThread: genTThread,
};

/** The toolpath of one operation (throws with `code` when it cannot be made). */
export function generateToolpath(ctx, op) {
  const gen = GENERATORS[op.type];
  if (!gen) throw Object.assign(new Error(`unknown operation ${op.type}`), { code: 'unknownOp' });
  const tool = toolOf(ctx, op);
  if (TURN_OPS.includes(op.type) !== isTurnTool(tool)) throw Object.assign(new Error('tool kind'), { code: 'wrongTool' });
  if (TURN_OPS.includes(op.type) && !ctx.profile) throw Object.assign(new Error('not a turned part'), { code: 'notTurnable' });
  const r = gen(ctx, op);
  // The operation's toolpath edits (cam-edit.js) laid over the generated moves (milling).
  if (op.edits && !TURN_OPS.includes(op.type) && r.moves) r.moves = editMoves(r.moves, op.edits, ctx);
  return { op: op.id, opType: op.type, tool: tool.id, kind: TURN_OPS.includes(op.type) ? 'turn' : 'mill', warnings: [], ...r };
}

/** Every unsuppressed operation's toolpath: { paths, errors: [{ op, code }] }. */
export function generateProgram(ctx, ops) {
  const paths = []; const errors = [];
  for (const op of ops) {
    if (op.suppressed) continue;
    try { paths.push(generateToolpath(ctx, op)); } catch (error) { errors.push({ op: op.id, code: error.code ?? 'failed', message: error.message }); }
  }
  return { paths, errors };
}

/**
 * Canned cycles expanded into plain moves as a control runs them (G98: back to the initial plane): rapid over
 * the hole, rapid to R, feed down (pecks: to each depth, back up to R (peck) or by 0.5 mm (chip break), down to
 * just above the last depth), back up (tapping: feed out). Everything else is passed through.
 */
export function expandMoves(moves) {
  const out = [];
  for (const m of moves) {
    if (m.k !== 'cyc') { out.push(m); continue; }
    const [x, y, zb] = m.p; const r = m.r; const init = m.init;
    out.push({ k: 'r', p: [x, y, init] });
    out.push({ k: 'r', p: [x, y, r] });
    if ((m.cycle === 'peck' || m.cycle === 'chip') && m.q > 0) {
      let z = r;
      while (z - m.q > zb + 1e-9) {
        const next = z - m.q;
        out.push({ k: 'f', p: [x, y, next], f: m.f });
        if (m.cycle === 'peck') { out.push({ k: 'r', p: [x, y, r] }); out.push({ k: 'r', p: [x, y, next + 0.5] }); } else out.push({ k: 'r', p: [x, y, next + 0.5] });
        z = next;
        if (m.cycle === 'chip') out.push({ k: 'f', p: [x, y, z], f: m.f });
      }
      out.push({ k: 'f', p: [x, y, zb], f: m.f });
    } else out.push({ k: 'f', p: [x, y, zb], f: m.f });
    if (m.dwell > 0) out.push({ k: 'dwell', p: [x, y, zb], s: m.dwell });
    if (m.cycle === 'tap') { out.push({ k: 'f', p: [x, y, r], f: m.f }); if (Math.abs(init - r) > 1e-9) out.push({ k: 'r', p: [x, y, init] }); } else out.push({ k: 'r', p: [x, y, init] });
  }
  return out;
}

/**
 * Default operations for recognised features: facing, pocket roughing (adaptive for open areas) and contour
 * finishing, slots, bosses, drilling (spot, drill / peck, tap) and helical bores, 3D roughing and finishing for
 * freeform areas; for a turned part facing, OD rough / finish, bore, grooves.
 */
export function planOperations(features, tools, { turning = false, profile = null } = {}) {
  const ops = [];
  const pick = (types, pred = () => true) => tools.filter((t) => types.includes(t.type) && pred(t)).sort((a, b) => b.d - a.d);
  const add = (type, tool, feature = null, extra = {}) => { if (tool) ops.push(createOp(type, { id: `op${ops.length + 1}`, tool: tool.id, feature, name: `${type}${feature ? ` ${feature}` : ''}`, ...extra })); };
  if (turning) {
    add('tFace', pick(['turnRough'])[0]);
    add('tRough', pick(['turnRough'])[0]);
    const bores = (profile?.samples ?? []).filter((q) => q.inner > 0).map((q) => q.inner);
    if (bores.length) { const smallest = Math.min(...bores); add('tDrill', pick(['turnDrill'], (t) => t.d / 2 <= smallest)[0]); add('tBoreRough', pick(['bore'], (t) => (t.minBore ?? 0) / 2 <= smallest * 1.5)[0]); add('tBoreFinish', pick(['bore'])[0]); }
    add('tFinish', pick(['turnFinish'])[0]);
    if (profile?.grooves?.length) add('tGroove', pick(['groove'])[0]);
    return ops;
  }
  const minWidth = (f) => Math.max(0.5, f.width ?? Infinity);
  for (const f of features) if (f.type === 'face') add('facing', pick(['face'])[0] ?? pick(['flat'])[0], f.id);
  for (const f of features) {
    if (f.type === 'pocket' || f.type === 'step') {
      const rough = pick(['flat'], (t) => t.d <= minWidth(f) * 0.8)[0] ?? pick(['flat']).at(-1);
      add('pocket', rough, f.id);
      add('contour', pick(['flat'], (t) => t.d <= minWidth(f) * 0.6).at(0) ?? rough, f.id, { stepdown: Math.max(1, f.depth ?? 10) });
    } else if (f.type === 'slot') {
      const exact = pick(['flat'], (t) => Math.abs(t.d - f.width) < 1e-6)[0];
      add('slot', exact ?? pick(['flat'], (t) => t.d < f.width)[0], f.id);
    } else if (f.type === 'boss') add('contour', pick(['flat'])[1] ?? pick(['flat'])[0], f.id, { stepdown: Math.max(1, f.height) });
  }
  const holes = features.filter((f) => f.type === 'hole');
  // Counterbores first (the drills start at their floors), then spot, drill / peck, the rest helical.
  for (const h of holes) if (h.counterbore) add('helix', pick(['flat'], (t) => t.d < h.counterbore.d * 0.9)[0], h.id, { target: 'counterbore' });
  if (holes.length) add('spot', pick(['spot'])[0]);
  const drilled = new Set();
  for (const h of holes) {
    const drill = pick(['drill'], (t) => Math.abs(t.d - h.d) < 0.06)[0];
    if (drill) {
      if (!drilled.has(drill.id)) { drilled.add(drill.id); add(h.depth > 3 * h.d ? 'peck' : 'drill', drill); }
    }
    if (!drill) add('helix', pick(['flat'], (t) => t.d < h.d * 0.9)[0], h.id, { target: 'hole' });
  }
  const tapped = new Set(holes.filter((h) => h.thread).map((h) => h.thread));
  for (const th of tapped) add('tap', pick(['tap'], (t) => t.thread === th)[0]);
  const surf = features.find((f) => f.type === 'surface3d');
  if (surf) {
    add('zlevel', pick(['flat'])[0]);
    add('parallel', pick(['ball'])[0], surf.id);
  }
  return ops;
}

export { loopLength, segDist, cleanLoop };
