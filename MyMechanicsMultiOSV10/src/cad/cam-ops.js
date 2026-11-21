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
import {
  offsetLoops, insideRegion, reverseLoop, rectLoop, circleLoop, loopArea, loopLength, windingOf, resample, clipPolyline, unionLoops,
  dropCutter, groupRegions, geom2, segDist, cleanLoop,
} from './cam-geom.js';
import { cutterOf, millingData, turningData, cutMaterialOf, machineOf, METRIC_THREADS, isTurnTool } from './cam-tools.js';

const { dist } = geom2;
const round = (v, k = 1e4) => Math.round(v * k) / k;

export const MILL_OPS = ['facing', 'pocket', 'adaptive', 'contour', 'slot', 'helix', 'spot', 'drill', 'peck', 'chipBreak', 'tap', 'zlevel', 'parallel', 'scallop', 'waterline'];
export const TURN_OPS = ['tFace', 'tRough', 'tFinish', 'tDrill', 'tBoreRough', 'tBoreFinish', 'tGroove', 'tThread'];
export const OP_GROUPS = { face: ['facing'], rough25: ['pocket', 'adaptive', 'slot', 'helix'], finish25: ['contour'], holes: ['spot', 'drill', 'peck', 'chipBreak', 'tap'], mill3d: ['zlevel', 'parallel', 'scallop', 'waterline'], turn: TURN_OPS };

/** Parameters of each operation (lengths mm, angles degrees, stepover a fraction of the tool diameter). */
export const OP_DEFAULTS = {
  facing: { stepdown: 1, stepover: 0.7, leaveZ: 0, angle: 0 },
  pocket: { stepdown: 3, stepover: 0.45, leave: 0.3, leaveZ: 0.1, direction: 'climb', ramp: 3, finishPass: true },
  adaptive: { stepdown: 8, stepover: 0.12, leave: 0.3, leaveZ: 0.1, direction: 'climb', ramp: 2, engagement: 70 },
  contour: { stepdown: 10, leave: 0, leaveZ: 0, direction: 'climb', springPass: false },
  slot: { stepdown: 2, leave: 0, leaveZ: 0, direction: 'climb', ramp: 3 },
  helix: { stepdown: 1.5, leave: 0, leaveZ: 0, direction: 'climb' },
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
  tFinish: { leave: 0, clearance: 25 },
  tDrill: { peck: 0 },
  tBoreRough: { stepdown: 1, leave: 0.3, leaveZ: 0.1 },
  tBoreFinish: { leave: 0, clearance: 25 },
  tGroove: { stepover: 0.8, leave: 0 },
  tThread: { pitch: 1.5, passes: 6, length: 0, z1: null, external: true },
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

/** Material of the part at z and above (its shadow), as islands (reversed section loops), duplicates dropped. */
function shadowIslands(ctx, z, step) {
  const { model } = ctx;
  const zTop = model.bounds.hi[2];
  const out = []; const seen = new Set();
  if (z >= zTop) return out;
  const eps = model.eps * 4;
  const heights = new Set([z + eps]);
  for (const l of model.levels) if (l.up && l.z > z + eps) heights.add(l.z - eps);
  for (let h = z + step; h < zTop; h += step) heights.add(h);
  heights.add(zTop - eps);
  for (const h of heights) {
    if (h > zTop) continue;
    for (const loop of model.slice(h)) {
      const sig = `${round(loopArea(loop), 1e3)}|${round(loopLength(loop), 1e3)}|${round(loop[0][0], 1e2)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(reverseLoop(loop));
    }
  }
  return out;
}

/** The stock outline (a little larger, so edges are cleared fully) as a CCW loop. */
function stockLoop(ctx, grow) {
  const s = ctx.stock;
  return rectLoop(s.x0 - grow, s.y0 - grow, s.x1 + grow, s.y1 + grow);
}

/** Where the tool centre may go at height z (loops; positive rule). */
function centreRegion(ctx, z, R, leave, { outer = null, shadowStep = 2 } = {}) {
  const loops = [outer ?? stockLoop(ctx, R * 0.9), ...shadowIslands(ctx, z, shadowStep)];
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
function cutLoops(path, loops, z, { zFrom, safe, feed, plunge, ramp, R, retractZ, clearZ }) {
  const slope = Math.tan((Math.max(0.5, Math.min(90, ramp)) * Math.PI) / 180);
  let entered = false;
  for (const loop0 of loops) {
    const pts = startNear(loop0, path.pos);
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
    rampAlong(path, pts, zFrom, z, slope, ramp >= 89 ? 0 : 1, feed, plunge);
    entered = true;
  }
}

/** Walks the closed loop pts descending from z0 to z at the slope, finishes the loop at z and re-cuts the ramp. */
function rampAlong(path, pts, z0, z, slope, useRamp, feed, plunge) {
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
  const step = tool.d * Math.min(0.9, Math.max(0.03, op.stepover ?? 0.45));
  const sp = speeds(ctx, op, tool, { ae: step, ap: op.stepdown });
  const path = new Path([0, 0, ctx.clearance]);
  const warnings = [];
  let prevZ = top;
  let engagementMax = 0;
  for (const z of levels) {
    const boundary = featureBoundary(ctx, f, z, R);
    const outer = f?.type === 'hole' ? boundary : f?.type === 'step' ? boundary : null;
    const islands = f?.type === 'hole' ? [] : shadowIslands(ctx, z, op.stepdown || 2);
    const base = [outer ?? stockLoop(ctx, R * 0.9), ...islands];
    const first = offsetLoops(base, -(R + (op.leave ?? 0)), { tol: Math.min(0.005, R / 50) });
    let region = within(first, f?.type === 'pocket' || f?.type === 'slot' ? boundary : null);
    if (!region.length) { if (!warnings.includes('tooBig')) warnings.push('tooBig'); continue; }
    const rings = [region];
    let cur = region;
    for (let k = 0; k < 500; k++) { cur = offsetLoops(cur, -step, { tol: Math.min(0.005, R / 50) }); if (!cur.length) break; rings.push(cur); }
    const ordered = ringsInsideOut(rings).map((r) => orient(r, op.direction));
    let loops = ordered.flat();
    if (adaptive) { const a = adaptiveLoops(loops, R, step, op.engagement ?? 70); loops = a.loops; engagementMax = Math.max(engagementMax, a.maxEngagement); }
    cutLoops(path, loops, z, { zFrom: prevZ + 0.5, safe: region, feed: sp.feed, plunge: sp.plunge, ramp: op.ramp ?? 3, R, retractZ: prevZ + ctx.retract, clearZ: ctx.clearance });
    if (op.finishPass && (op.leave ?? 0) > 0) {
      const fin = within(offsetLoops(base, -R, { tol: Math.min(0.005, R / 50) }), f?.type === 'pocket' || f?.type === 'slot' ? boundary : null);
      cutLoops(path, orient(fin, op.direction), z, { zFrom: z, safe: fin, feed: sp.feed, plunge: sp.plunge, ramp: 90, R, retractZ: z + ctx.retract, clearZ: ctx.clearance });
    }
    prevZ = z;
  }
  path.rapid([path.pos[0], path.pos[1], ctx.clearance]);
  return { moves: path.moves, ...sp, warnings, engagement: engagementMax };
}

/**
 * Adaptive clearing: the rings are walked with the engagement angle checked against the material left by the
 * loops before; where a corner would load the cutter beyond the limit, trochoidal loops replace the straight
 * cut there. Returns { loops, maxEngagement (degrees, after) }.
 */
function adaptiveLoops(loops, R, step, limitDeg) {
  if (!loops.length) return { loops, maxEngagement: 0 };
  let bx0 = Infinity; let by0 = Infinity; let bx1 = -Infinity; let by1 = -Infinity;
  for (const l of loops) for (const p of l) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }
  const h = Math.max(R / 6, 0.05);
  const nx = Math.ceil((bx1 - bx0 + 2 * R) / h) + 2; const ny = Math.ceil((by1 - by0 + 2 * R) / h) + 2;
  if (nx * ny > 4e6) return { loops, maxEngagement: 0 };
  const ox = bx0 - R - h; const oy = by0 - R - h;
  // Material: every cell within the reach of some loop (what this level clears), removed as the tool passes.
  const mat = new Uint8Array(nx * ny);
  for (const l of loops) for (const p of resample(l, h, true)) stamp(mat, nx, ny, ox, oy, h, p, R, 1);
  const limit = (limitDeg * Math.PI) / 180;
  const out = []; let maxEng = 0;
  const probes = 24;
  for (const l of loops) {
    const pts = resample(l, Math.max(h, step / 3), true);
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; const q = pts[(i + 1) % pts.length];
      const dir = [q[0] - p[0], q[1] - p[1]]; const dl = Math.hypot(...dir) || 1;
      // Engagement: the arc of the cutter's leading half touching material.
      let hit = 0;
      for (let k = 0; k < probes; k++) {
        const a = -Math.PI / 2 + (Math.PI * (k + 0.5)) / probes;
        const ux = (dir[0] * Math.cos(a) - dir[1] * Math.sin(a)) / dl; const uy = (dir[0] * Math.sin(a) + dir[1] * Math.cos(a)) / dl;
        const x = p[0] + ux * (R + h * 0.5); const y = p[1] + uy * (R + h * 0.5);
        const ix = Math.floor((x - ox) / h); const iy = Math.floor((y - oy) / h);
        if (ix >= 0 && iy >= 0 && ix < nx && iy < ny && mat[iy * nx + ix]) hit++;
      }
      const eng = (Math.PI * hit) / probes;
      if (eng > limit && dl > 1e-9) {
        // Trochoidal loop: a small circle just ahead of the point, walked once before going on.
        const rr = Math.min(step * 0.5, R * 0.5);
        const ux = dir[0] / dl; const uy = dir[1] / dl;
        const cx = p[0] + ux * rr; const cy = p[1] + uy * rr;
        const a0 = Math.atan2(-uy, -ux);
        for (let k = 0; k <= 16; k++) {
          const a = a0 + (2 * Math.PI * k) / 16;
          const q2 = [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
          res.push(q2);
          stamp(mat, nx, ny, ox, oy, h, q2, R, 0);
        }
        maxEng = Math.max(maxEng, limit);
      } else maxEng = Math.max(maxEng, eng);
      res.push(p);
      stamp(mat, nx, ny, ox, oy, h, p, R, 0);
    }
    out.push(res);
  }
  return { loops: out, maxEngagement: (maxEng * 180) / Math.PI };
}

function stamp(mat, nx, ny, ox, oy, h, p, R, value) {
  const i0 = Math.max(0, Math.floor((p[0] - R - ox) / h)); const i1 = Math.min(nx - 1, Math.ceil((p[0] + R - ox) / h));
  const j0 = Math.max(0, Math.floor((p[1] - R - oy) / h)); const j1 = Math.min(ny - 1, Math.ceil((p[1] + R - oy) / h));
  const r2 = R * R;
  for (let j = j0; j <= j1; j++) { const y = oy + (j + 0.5) * h - p[1]; for (let i = i0; i <= i1; i++) { const x = ox + (i + 0.5) * h - p[0]; if (x * x + y * y <= r2) mat[j * nx + i] = value; } }
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
    else if (f?.type === 'pocket' || f?.type === 'slot') loops = within(region, featureBoundary(ctx, f, z, R));
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
  const holeR = (f.counterbore?.d ?? f.d) / 2;
  const bottom = f.counterbore ? f.top - f.counterbore.depth : (f.through ? f.bottom - 0.5 : f.bottom);
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
    path.cycle({ cycle, p: [h.x, h.y, round(bottom, 1e4)], r: round(start + ctx.retract, 1e4), init: ctx.clearance, q, f: sp.feed, dwell: op.dwell ?? 0, pitch: tool.pitch ?? 0, hole: h.id });
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
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const zm = drop(m[0], m[1]);
    if (depth < 10 && zm > (a[2] + b[2]) / 2 + tol) { const mid = [m[0], m[1], zm]; refine(a, mid, depth + 1); out.push(mid); refine(mid, b, depth + 1); }
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

/** Scallop finishing: rings inward from the area's outline, spaced so the 3D distance between passes holds. */
function genScallop(ctx, op) {
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

// ───────────────────────── turning

/** The outer and bore radius at z from the profile samples (nearest sample). */
function profileAt(profile, z) {
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
  return { moves: path.moves, ...sp, feed: sp.feedRev };
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
  return { moves: path.moves, ...sp, feed: sp.feedRev };
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

function genTFinish(ctx, op) {
  const tool = toolOf(ctx, op); const s = ctx.stock; const p = ctx.profile; const n = tool.nose ?? 0.4;
  const prof = reachableOuter(p, op.clearance ?? 25).map((q) => ({ z: q.z, r: q.r + (op.leave ?? 0) }));
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
  return { moves: path.moves, ...sp, feed: sp.feedRev };
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
  const inner = reachableInner(p, finish ? (op.clearance ?? 25) : 0).map((q) => ({ z: q.z, r: q.r > 0 ? q.r - leave : 0 }));
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
    return { moves: path.moves, ...sp, feed: sp.feedRev };
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
  return { moves: path.moves, ...sp, feed: sp.feedRev };
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
      add(f.type === 'step' ? 'adaptive' : 'pocket', rough, f.id);
      add('contour', pick(['flat'], (t) => t.d <= minWidth(f) * 0.6).at(0) ?? rough, f.id, { stepdown: Math.max(1, f.depth ?? 10) });
    } else if (f.type === 'slot') {
      const exact = pick(['flat'], (t) => Math.abs(t.d - f.width) < 1e-6)[0];
      add('slot', exact ?? pick(['flat'], (t) => t.d < f.width)[0], f.id);
    } else if (f.type === 'boss') add('contour', pick(['flat'])[1] ?? pick(['flat'])[0], f.id, { stepdown: Math.max(1, f.height) });
  }
  const holes = features.filter((f) => f.type === 'hole');
  if (holes.length) add('spot', pick(['spot'])[0]);
  const drilled = new Set();
  for (const h of holes) {
    const drill = pick(['drill'], (t) => Math.abs(t.d - h.d) < 0.06)[0];
    if (drill) {
      if (!drilled.has(drill.id)) { drilled.add(drill.id); add(h.depth > 3 * h.d ? 'peck' : 'drill', drill); }
    } else add('helix', pick(['flat'], (t) => t.d < h.d * 0.9)[0], h.id);
    if (h.counterbore) add('helix', pick(['flat'], (t) => t.d < h.counterbore.d * 0.9)[0], h.id);
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
