// Multi-axis machining (no DOM): 4-axis rotary finishing, 5-axis simultaneous finishing and mill-turn live-tool
// drilling. Moves keep `p` in part coordinates (what the views draw) and carry the machine's extra axes:
//
//   rotary4  the part turns about X on an A axis (its axis through the stock's YZ centre); the tool stays vertical
//            over Y = 0 and finishes the part in lines along X, one per A angle (or rings around it, one per X):
//            for each angle the mesh is turned by A and a ball / flat cutter dropped on it (the axis through the
//            part's YZ centre, over its length). Moves:
//            { p (part), mp: [x, 0, r] (machine, about the axis), a (degrees) }.
//   multi5   5-axis simultaneous finishing with a ball end mill: the parallel raster of 3-axis finishing gives the
//            ball centre (the vertical drop-cutter never gouges, and a ball touches the part the same way whatever
//            the tool's tilt), and the tool axis follows the surface normal (from the centre surface's slope)
//            leaned `lead` degrees along the cut and kept within `maxTilt` of vertical — the ball cuts with its
//            side instead of its centre (no zero-speed point) and short tools reach steep walls. Moves:
//            { p (tip), t: [i, j, k] (tool axis), vt (the vertical tool's tip at the same ball centre, for the
//            stock simulation) }.
//   mtAxial  mill-turn: the part's holes drilled with a live tool along Z on a lathe with a C axis (polar
//            positioning: X the radius, C the angle). Moves: canned cycles with `c` (degrees), `live: 'axial'`.
//   mtRadial mill-turn: a pattern of radial holes (count, start angle, at Z, depth, from the turned outside) drilled
//            square to the axis: cycles with `c`, `live: 'radial'`, the depth along −X.
// The posts write A (4th axis), A and C with tool-centre-point control G43.4 (5-axis, table-table A/C), and C with
// G83 face / G87 side drilling (mill-turn).
import { TriangleGrid, dropCutter, weldMesh, meshBounds } from './cam-geom.js';
import { cutterOf } from './cam-tools.js';

export const MULTI_OPS = ['rotary4', 'multi5', 'mtAxial', 'mtRadial'];
export const MULTI_DEFAULTS = {
  rotary4: { stepover: 0, scallop: 0.02, pattern: 'lines', leave: 0, sample: 0.5, angleStep: 0 },
  multi5: { stepover: 0, scallop: 0.01, angle: 0, leave: 0, sample: 0.5, maxTilt: 60, lead: 10 },
  mtAxial: { peck: 0, breakThrough: 1 },
  mtRadial: { count: 4, startAngle: 0, z: null, depth: 5, diameter: 6, peck: 0 },
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Ball step for a scallop height h: 2√(2Rh − h²) (flat cutters: 0.1 D). */
const scallopStep = (tool, op) => (op.stepover > 0 ? op.stepover * tool.d : tool.type === 'ball' ? 2 * Math.sqrt(Math.max(1e-9, 2 * (tool.d / 2) * (op.scallop ?? 0.01) - (op.scallop ?? 0.01) ** 2)) : 0.1 * tool.d);

/** Rotates welded mesh vertices about the X axis through (y0, z0) by angle (radians): a new welded mesh. */
function turnedAboutX(welded, angle, y0, z0) {
  const c = Math.cos(angle), s = Math.sin(angle), V = welded.vertices, out = new Float64Array(V.length);
  for (let i = 0; i < V.length; i += 3) { const y = V[i + 1] - y0, z = V[i + 2] - z0; out[i] = V[i]; out[i + 1] = y0 + c * y - s * z; out[i + 2] = z0 + s * y + c * z; }
  return { vertices: out, triangles: welded.triangles };
}
/** Part point of a machine point (x, y0, z) with the part turned by `angle` about the axis (y0, z0). */
const partPoint = (x, y, z, angle, y0, z0) => { const c = Math.cos(-angle), s = Math.sin(-angle), yy = y - y0, zz = z - z0; return [x, y0 + c * yy - s * zz, z0 + s * yy + c * zz]; };

/**
 * The 4-axis rotary axis: through the part's YZ centre (a turned-about-X part is held on its own axis; the stock's
 * box may carry extra on one side), over the part's length in X.
 */
export function rotaryAxis(ctx) {
  const b = ctx.model.bounds;
  return { y0: (b.lo[1] + b.hi[1]) / 2, z0: (b.lo[2] + b.hi[2]) / 2, x0: b.lo[0], x1: b.hi[0] };
}

export function genRotary4(ctx, op, { toolOf, speeds }) {
  const tool = toolOf(ctx, op), R = tool.d / 2, cutter = cutterOf(tool);
  const { y0, z0, x0, x1 } = rotaryAxis(ctx);
  const welded = ctx.model.welded ?? weldMesh(ctx.model.mesh);
  // The largest radius of the part about the axis: the clearance radius beyond it.
  let rmax = 0;
  for (let i = 0; i < welded.vertices.length; i += 3) rmax = Math.max(rmax, Math.hypot(welded.vertices[i + 1] - y0, welded.vertices[i + 2] - z0));
  // Rapids turn the part at the clearance radius: beyond the part and beyond the stock's corners (a box stock
  // reaches further from the axis than the part — turning it under the tool there would be a crash).
  let rStock = 0;
  const s = ctx.stock;
  if (s && Number.isFinite(s.y0)) for (const y of [s.y0, s.y1]) for (const z of [s.z0, s.z1]) rStock = Math.max(rStock, Math.hypot(y - y0, z - z0));
  const rClear = Math.max(rmax, rStock) + R + Math.max(2, ctx.retract ?? 2);
  // Where the stock's surface is, seen from the axis at angle a: rapids come down to just above it (or above the
  // cut, if that is higher) and the tool feeds in from there.
  const edge = (a) => {
    if (!s || !Number.isFinite(s.y0)) return 0;
    const d = [Math.sin(a), Math.cos(a)]; let t = Infinity;
    for (const [lo, hi, c, k] of [[s.y0, s.y1, y0, 0], [s.z0, s.z1, z0, 1]]) { if (d[k] > 1e-12) t = Math.min(t, (hi - c) / d[k]); else if (d[k] < -1e-12) t = Math.min(t, (lo - c) / d[k]); }
    return Number.isFinite(t) ? Math.max(0, t) : 0;
  };
  const approach = (z, a) => Math.max(z, edge(a)) + (ctx.retract ?? 2);
  const step = scallopStep(tool, op);
  const dA = op.angleStep > 0 ? rad(op.angleStep) : Math.min(rad(10), step / Math.max(1, rmax));
  const nA = Math.max(4, Math.ceil((2 * Math.PI) / dA));
  const sample = Math.min(op.sample ?? 0.5, R / 2);
  const xs = []; for (let x = x0 + R * 0; x <= x1 + 1e-9; x += op.pattern === 'rings' ? step : sample) xs.push(x);
  const sp = speeds(ctx, op, tool, { ae: step, ap: 0.5 });
  const leave = op.leave ?? 0;
  // Heights: a grid of the part turned by A (made once per angle), the cutter dropped on it under the tool (y = y0).
  const grids = new Map();
  const gridAt = (a) => { if (!grids.has(a)) grids.set(a, new TriangleGrid(turnedAboutX(welded, a, y0, z0))); return grids.get(a); };
  const dropAt = (a, x) => Math.max(z0, dropCutter(gridAt(a), cutter, x, y0, z0 - rmax - R)) + leave;
  const heights = [];
  for (let k = 0; k < nA; k++) { const a = (2 * Math.PI * k) / nA; heights.push(xs.map((x) => dropAt(a, x))); }
  // The machine moves straight (in X and Z, or in A and Z) between points: where the cutter must stand higher midway
  // (a convex corner, the edge of a flat) the straight move would cut into the part, so points are added there.
  const CHORD = 0.002;
  const refine = (p0, p1, at, depth = 0, out = []) => {
    const m = (p0[0] + p1[0]) / 2; const z = at(m);
    if (depth < 8 && z - (p0[1] + p1[1]) / 2 > CHORD) { refine(p0, [m, z], at, depth + 1, out); out.push([m, z]); refine([m, z], p1, at, depth + 1, out); }
    return out;
  };
  /** A list of (s, z) points with the extra points between them. */
  const dense = (pts, at) => { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { out.push(...refine(pts[i - 1], pts[i], at)); out.push(pts[i]); } return out; };
  const moves = [];
  const at = (x, z, a, k) => ({ k, p: partPoint(x, y0, z, a, y0, z0), mp: [x, 0, z - z0], a: deg(a) });
  const feed = (x, z, a) => moves.push({ ...at(x, z, a, 'f'), f: sp.feed });
  const rapid = (x, z, a) => moves.push(at(x, z, a, 'r'));
  if (op.pattern === 'rings') {
    // One ring per X: round the part at that X (A from 0 to 360°), stepping along X between rings.
    xs.forEach((x, i) => {
      rapid(x, z0 + rClear, 0);
      // Round the part in A (the extra points at angles between: their grids are made when needed).
      const ring = dense(Array.from({ length: nA + 1 }, (_, k) => [(2 * Math.PI * k) / nA, heights[k % nA][i]]), (a) => dropAt(a, x));
      ring.forEach(([a, z], k) => { if (k === 0) { rapid(x, approach(z, a), a); moves.push({ ...at(x, z, a, 'f'), f: sp.plunge }); } else feed(x, z, a); });
      rapid(x, z0 + rClear, 2 * Math.PI);
    });
  } else {
    for (let k = 0; k < nA; k++) {
      const a = (2 * Math.PI * k) / nA;
      let line = dense(xs.map((x, i) => [x, heights[k][i]]), (x) => dropAt(a, x));
      if (k % 2) line = line.reverse();
      const [x0f, z0f] = line[0];
      rapid(x0f, z0 + rClear, a);
      rapid(x0f, approach(z0f, a), a);
      moves.push({ ...at(x0f, z0f, a, 'f'), f: sp.plunge });
      for (const [x, z] of line.slice(1)) feed(x, z, a);
      rapid(line.at(-1)[0], z0 + rClear, a);
    }
  }
  return { moves, ...sp, stepover: step, multi: 'rotary4', axis: { y0, z0 }, angles: nA };
}

/** Tool axis for a surface normal n, leaned `lead`° along the cut direction d, within `maxTilt`° of +Z. */
export function toolAxis(n, d, lead, maxTilt) {
  let a = unit(n);
  if (lead) { const tl = Math.tan(rad(lead)); a = unit([a[0] + d[0] * tl, a[1] + d[1] * tl, a[2] + d[2] * tl]); }
  if (a[2] < Math.cos(rad(maxTilt))) {
    const h = Math.hypot(a[0], a[1]) || 1, s = Math.sin(rad(maxTilt)), c = Math.cos(rad(maxTilt));
    a = [(a[0] / h) * s, (a[1] / h) * s, c];
  }
  return a;
}

export function genMulti5(ctx, op, { toolOf, speeds, finishArea, dropAlong, clipPolyline, rectLoop }) {
  const tool = toolOf(ctx, op);
  if (tool.type !== 'ball') throw Object.assign(new Error('needs a ball end mill'), { code: 'needBall' });
  const R = tool.d / 2, cutter = cutterOf(tool);
  const [x0, y0, x1, y1] = finishArea(ctx, op, R);
  const step = scallopStep(tool, op);
  const sp = speeds(ctx, op, tool, { ae: step, ap: 0.5 });
  const grid = ctx.model.topGrid(), floor = ctx.model.bounds.lo[2];
  const leave = op.leave ?? 0;
  const zc = (x, y) => dropCutter(grid, cutter, x, y, floor) + leave + R;     // the ball centre's height
  const ang = rad(op.angle ?? 0), ca = Math.cos(ang), sa = Math.sin(ang);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = Math.hypot(x1 - x0, y1 - y0) / 2;
  const sample = Math.min(op.sample ?? 0.5, R / 2), h = Math.max(0.05, sample / 2);
  const area = [rectLoop(x0, y0, x1, y1)];
  const retract = ctx.retract ?? 2;
  const moves = [];
  let k = 0;
  for (let v = -half; v <= half + 1e-9; v += step, k++) {
    const a = [cx - half * ca - v * sa, cy - half * sa + v * ca], b = [cx + half * ca - v * sa, cy + half * sa + v * ca];
    for (const piece of clipPolyline(k % 2 ? [b, a] : [a, b], area)) {
      // The vertical ball's tips along the line, refined where the surface bends or steps (as 3-axis finishing):
      // their ball centres are the 5-axis ball centres.
      const tips = dropAlong(ctx, cutter, piece, floor, leave, sample);
      if (!tips.length) continue;
      const pts = tips.map((q, i) => {
        const x = q[0], y = q[1];
        const nb = tips[Math.min(tips.length - 1, i + 1)], pb = tips[Math.max(0, i - 1)];
        const dir = unit([nb[0] - pb[0], nb[1] - pb[1], 0]);
        const n = [-(zc(x + h, y) - zc(x - h, y)) / (2 * h), -(zc(x, y + h) - zc(x, y - h)) / (2 * h), 1];
        return { c: [x, y, q[2] + R], t: toolAxis(n, dir, op.lead ?? 10, op.maxTilt ?? 60) };
      });
      const tip = (q) => [q.c[0] - q.t[0] * R, q.c[1] - q.t[1] * R, q.c[2] - q.t[2] * R];
      const vt = (q) => [q.c[0], q.c[1], q.c[2] - R];
      const first = pts[0], last = pts.at(-1);
      const clear = Math.max(ctx.clearance, first.c[2] + R + retract);
      // In over the first point at the clearance height, down along its axis to `retract` above it, feed in.
      moves.push({ k: 'r', p: [first.c[0], first.c[1], clear], t: [0, 0, 1], vt: [first.c[0], first.c[1], clear] });
      // Rapid only down to `retract` above the stock's top (or the point, if higher), then feed in along the axis:
      // a row starting off the part (dropped to the floor) must not rapid through the stock.
      const stockTop = ctx.stock?.z1 ?? -Infinity;
      // (along the tilted axis: the height gained is lift · t_z)
      const lift = Math.max(retract, (stockTop + retract - (first.c[2] - R)) / Math.max(0.2, first.t[2]));
      const above = tip(first).map((u, i) => u + first.t[i] * lift);
      moves.push({ k: 'r', p: above, t: first.t, vt: [first.c[0], first.c[1], first.c[2] - R + lift * first.t[2]] });
      moves.push({ k: 'f', p: tip(first), t: first.t, vt: vt(first), f: sp.plunge });
      for (const q of pts.slice(1)) moves.push({ k: 'f', p: tip(q), t: q.t, vt: vt(q), f: sp.feed });
      const up = Math.max(ctx.clearance, last.c[2] + R);
      moves.push({ k: 'r', p: [last.c[0], last.c[1], up], t: [0, 0, 1], vt: [last.c[0], last.c[1], up] });
    }
  }
  const tilts = moves.filter((m) => m.k === 'f').map((m) => deg(Math.acos(Math.max(-1, Math.min(1, m.t[2])))));
  return { moves, ...sp, stepover: step, multi: 'multi5', maxTiltUsed: tilts.length ? Math.max(...tilts) : 0 };
}

/** The turned part's axis (Z through the XY centre of its box) and its outside radius at z (from the profile). */
function lathe(ctx) {
  const b = ctx.model.bounds;
  const cx = (b.lo[0] + b.hi[0]) / 2, cy = (b.lo[1] + b.hi[1]) / 2;
  const outerAt = (z) => {
    const pr = ctx.profile?.samples ?? ctx.profile ?? [];
    let best = null;
    for (const s of Array.isArray(pr) ? pr : []) if (best == null || Math.abs(s.z - z) < Math.abs(best.z - z)) best = s;
    return best?.outer ?? Math.max(b.hi[0] - cx, b.hi[1] - cy);
  };
  return { cx, cy, outerAt };
}

export function genMtAxial(ctx, op, { toolOf, speeds }) {
  const tool = toolOf(ctx, op);
  const { cx, cy } = lathe(ctx);
  const holes = (ctx.features ?? []).filter((f) => f.type === 'hole' && (!op.feature || f.id === op.feature) && Math.hypot(f.x - cx, f.y - cy) > 1e-6);
  if (!holes.length) throw Object.assign(new Error('no off-axis holes'), { code: 'noLiveHoles' });
  const sp = speeds(ctx, op, tool, { ae: tool.d, ap: tool.d });
  const moves = [];
  for (const h of holes) {
    const r = Math.hypot(h.x - cx, h.y - cy), c = deg(Math.atan2(h.y - cy, h.x - cx));
    const zb = h.bottom - (op.breakThrough ?? 1) * 0;
    moves.push({ k: 'cyc', cycle: op.peck > 0 ? 'peck' : 'drill', p: [h.x, h.y, zb], r: h.top + 2, init: Math.max(ctx.clearance, h.top + 5), q: op.peck ?? 0, f: sp.plunge, dwell: 0, c, radius: r, live: 'axial' });
  }
  return { moves, ...sp, multi: 'millTurn', holes: holes.length };
}

export function genMtRadial(ctx, op, { toolOf, speeds }) {
  const tool = toolOf(ctx, op);
  const { cx, cy, outerAt } = lathe(ctx);
  const b = ctx.model.bounds;
  const z = op.z ?? (b.lo[2] + b.hi[2]) / 2;
  const ro = outerAt(z), depth = Math.max(0.1, op.depth ?? 5), n = Math.max(1, Math.round(op.count ?? 4));
  const sp = speeds(ctx, op, tool, { ae: tool.d, ap: tool.d });
  const moves = [];
  for (let i = 0; i < n; i++) {
    const c = (op.startAngle ?? 0) + (360 * i) / n, u = [Math.cos(rad(c)), Math.sin(rad(c))];
    const at = (r) => [cx + u[0] * r, cy + u[1] * r, z];
    moves.push({ k: 'cyc', cycle: op.peck > 0 ? 'peck' : 'drill', p: at(ro - depth), r: ro + 2, init: ro + 5, q: op.peck ?? 0, f: sp.plunge, dwell: 0, c, radius: ro - depth, rStart: ro + 2, live: 'radial', z, entry: at(ro + 5) });
  }
  return { moves, ...sp, multi: 'millTurn', holes: n, outer: ro };
}

/** A/C of a tool axis (i, j, k) on a table-table A (about X) / C (about Z) machine: A = acos k, C = atan2(i, −j). */
export function axisToAC(t, prevC = null) {
  const A = deg(Math.acos(Math.max(-1, Math.min(1, t[2]))));
  let C = Math.hypot(t[0], t[1]) < 1e-9 ? (prevC ?? 0) : deg(Math.atan2(t[0], -t[1]));
  if (prevC != null) { while (C - prevC > 180) C -= 360; while (C - prevC < -180) C += 360; }
  return { A, C };
}

export { meshBounds };
