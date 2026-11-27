// Material removal simulation, gouge check and cycle time (no DOM).
//
// Milling: the stock as a tri-dexel model (cam-dexel.js: rays along X, Y and Z holding material intervals). Every move is
// sampled at a fraction of a cell and the cutter's lower surface (flat, ball, bull nose, drill point) lowers
// the dexels under it. The part's own height field (the highest point of the mesh over each cell centre) is the
// limit: a dexel cut below it is a gouge. Removed volume = Σ (stock top − dexel) × cell area.
//
// Turning: the stock's half section as a grid of (radius, z) cells; the insert (nose disk and the holder side
// of it), boring bar, grooving blade and drill remove the cells they sweep; a removed cell inside the part's
// profile is a gouge; the volume is Σ 2π r dr dz of the removed cells.
import { exactRays } from './cam-kernel.js';
import { expandMoves } from './cam-ops.js';
import { cutterOf } from './cam-tools.js';
import { createTriDexel, cutAt, cutAlong, dexelVolume, topMap, dexelGouges, dexelFromTurned, dexelMesh, partRays, intersectIntervals } from './cam-dexel.js';

export { dexelMesh };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A Z-map over the stock box with cells of `cell` mm. */
export function createZMap(stock, cell) {
  const nx = Math.max(1, Math.ceil((stock.x1 - stock.x0) / cell)); const ny = Math.max(1, Math.ceil((stock.y1 - stock.y0) / cell));
  const hx = (stock.x1 - stock.x0) / nx; const hy = (stock.y1 - stock.y0) / ny;
  const z = new Float32Array(nx * ny).fill(stock.z1);
  return { x0: stock.x0, y0: stock.y0, nx, ny, hx, hy, z, top: stock.z1, bottom: stock.z0 };
}

/** The cutter's height above its tip at horizontal distance q from its axis (Infinity outside its radius). */
function profileOf(cutter) {
  const R = cutter.r;
  if (cutter.type === 'ball') return (q) => (q > R ? Infinity : R - Math.sqrt(Math.max(0, R * R - q * q)));
  if (cutter.type === 'bull') { const rc = Math.min(cutter.rc, R); const rf = R - rc; return (q) => (q > R ? Infinity : q <= rf ? 0 : rc - Math.sqrt(Math.max(0, rc * rc - (q - rf) * (q - rf)))); }
  if (cutter.type === 'drill') { const k = 1 / Math.tan(((cutter.tip ?? 118) / 2) * Math.PI / 180); return (q) => (q > R ? Infinity : q * k); }
  return (q) => (q > R ? Infinity : 0);
}

/** Lowers the Z-map under the cutter with its tip at (x, y, zt). */
function stampCutter(map, prof, R, x, y, zt) {
  const i0 = clamp(Math.floor((x - R - map.x0) / map.hx), 0, map.nx - 1); const i1 = clamp(Math.floor((x + R - map.x0) / map.hx), 0, map.nx - 1);
  const j0 = clamp(Math.floor((y - R - map.y0) / map.hy), 0, map.ny - 1); const j1 = clamp(Math.floor((y + R - map.y0) / map.hy), 0, map.ny - 1);
  if (x + R < map.x0 || x - R > map.x0 + map.nx * map.hx || y + R < map.y0 || y - R > map.y0 + map.ny * map.hy) return;
  for (let j = j0; j <= j1; j++) {
    const cy = map.y0 + (j + 0.5) * map.hy - y;
    for (let i = i0; i <= i1; i++) {
      const cx = map.x0 + (i + 0.5) * map.hx - x;
      const h = prof(Math.hypot(cx, cy));
      if (h === Infinity) continue;
      const k = j * map.nx + i; const zz = Math.max(map.bottom, zt + h);
      if (zz < map.z[k]) map.z[k] = zz;
    }
  }
}

/**
 * Runs milling toolpaths over a tri-dexel stock (cam-dexel.js). paths: [{ moves, tool }] with tools by id.
 * Returns { dexel, map (the top of the Z rays, for display), removed (mm³), rapidCuts, rapidAt, samples }.
 */
export function simulateMilling(stock, paths, tools, { cell = 0.5, onProgress = null } = {}) {
  const td = createTriDexel(stock, cell);
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const before = dexelVolume(td);
  let rapidCuts = 0; let samples = 0; const rapidAt = []; const skipped = [];
  let full = false;
  const step = cell * 0.5;
  paths.forEach((tp, pi) => {
    const tool = toolMap.get(tp.tool);
    if (!tool) return;
    const cutter = cutterOf(tool);
    // A 5-axis path is replayed with the vertical tool at the same ball centres (`vt`: what the ball removes).
    // A 4-axis rotary path turns the part about X: in the part's frame the tool's axis is tilted by −A, and the
    // tip moves on arcs about the axis — interpolated in machine terms (x, radius, A), then turned into the part.
    if (tp.multi === 'rotary4') {
      rotaryPass(td, cutter, tp, step, (cut, m, p) => { samples++; if (cut && m.k === 'r') { rapidCuts++; if (rapidAt.length < 20) rapidAt.push({ path: pi, op: tp.op, p }); } });
      full = true;
      onProgress?.((pi + 1) / paths.length);
      return;
    }
    // Mill-turn live tools belong to a lathe set-up (simulateTurning); in a milling set-up they are left out.
    if (tp.multi === 'millTurn') { skipped.push(tp.op); return; }
    let pos = null;
    for (const m0 of expandMoves(tp.moves)) {
      const m = m0.vt ? { ...m0, p: m0.vt } : m0;
      if (!m.p) continue;
      if (!pos) { pos = m.p; continue; }
      const L = Math.hypot(m.p[0] - pos[0], m.p[1] - pos[1], m.p[2] - pos[2]);
      const n = Math.max(1, Math.ceil(L / step));
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        const x = pos[0] + (m.p[0] - pos[0]) * t; const y = pos[1] + (m.p[1] - pos[1]) * t; const z = pos[2] + (m.p[2] - pos[2]) * t;
        const cut = cutAt(td, cutter, x, y, z);
        if (cut && m.k === 'r') { rapidCuts++; if (rapidAt.length < 20) rapidAt.push({ path: pi, op: tp.op, p: [x, y, z] }); }
        samples++;
      }
      pos = m.p;
    }
    onProgress?.((pi + 1) / paths.length);
  });
  // `full`: the stock was cut from the sides and below too (a rotary path) — shown whole, not as its top.
  return { dexel: td, map: topMap(td), removed: before - dexelVolume(td), rapidCuts, rapidAt, samples, skipped, full };
}

/**
 * Replays a 4-axis rotary path (moves { mp: [x, 0, r], a (degrees) } about the axis tp.axis { y0, z0 }) on the
 * tri-dexel stock: samples along each move in machine terms (x, radius and A linearly), each one a cutter along
 * the axis (0, sin A, cos A) at the part point. report(cut, move, tip).
 */
function rotaryPass(td, cutter, tp, step, report) {
  const { y0, z0 } = tp.axis ?? { y0: 0, z0: 0 };
  const partOf = (x, r, aDeg) => { const a = (aDeg * Math.PI) / 180; return { tip: [x, y0 + Math.sin(a) * r, z0 + Math.cos(a) * r], axis: [0, Math.sin(a), Math.cos(a)] }; };
  let pos = null;
  for (const m of tp.moves) {
    if (!m.mp) continue;
    const q = [m.mp[0], m.mp[2], m.a ?? 0];
    if (!pos) { pos = q; continue; }
    // Arc length at the larger radius for the angle part, so a turn at a large radius is sampled finely.
    const L = Math.hypot(q[0] - pos[0], q[1] - pos[1], (((q[2] - pos[2]) * Math.PI) / 180) * Math.max(Math.abs(q[1]), Math.abs(pos[1])));
    const n = Math.max(1, Math.ceil(L / step));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const { tip, axis } = partOf(pos[0] + (q[0] - pos[0]) * t, pos[1] + (q[1] - pos[1]) * t, pos[2] + (q[2] - pos[2]) * t);
      report(cutAlong(td, cutter, tip, axis), m, tip);
    }
    pos = q;
  }
}

/**
 * Mill-turn live-tool cycles on the turned bar (a tri-dexel made from the turning section): axial holes drilled
 * along Z at their C angle, radial holes drilled square to the axis from the turned outside. { dexel, removed }.
 */
function liveToolPass(td, paths, toolMap, step) {
  const before = dexelVolume(td);
  // The bar as turned, for the gouge check (only what the live tools take away counts).
  const turned = Object.fromEntries(Object.entries(td.grids).map(([k, g]) => [k, g.rays.map((r) => r.slice())]));
  for (const tp of paths) {
    const tool = toolMap.get(tp.tool);
    if (!tool) continue;
    const cutter = cutterOf(tool);
    for (const m of tp.moves) {
      if (m.k !== 'cyc') continue;
      let along; let points;
      if (m.live === 'radial') {
        // Radii from the entry down to the hole's bottom (pecks retract to the reference radius), the tool along
        // the radius (shank outward).
        const u = [Math.cos((m.c * Math.PI) / 180), Math.sin((m.c * Math.PI) / 180)];
        const c = [m.p[0] - u[0] * m.radius, m.p[1] - u[1] * m.radius];
        const at = (r) => [c[0] + u[0] * r, c[1] + u[1] * r, m.z];
        const radii = [m.init, m.rStart ?? m.r];
        if (m.q > 0) for (let r = (m.rStart ?? m.r) - m.q; r > m.radius + 1e-9; r -= m.q) radii.push(r);
        radii.push(m.radius, m.init);
        points = radii.map(at); along = [u[0], u[1], 0];
      } else {
        points = expandMoves([m]).filter((x) => x.p).map((x) => x.p); along = [0, 0, 1];
      }
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]; const b = points[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
        for (let s = 1; s <= n; s++) { const t = s / n; cutAlong(td, cutter, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], along); }
      }
    }
  }
  return { dexel: td, removed: before - dexelVolume(td), turned };
}

/**
 * Gouges of the live tools: part material the turned bar held and the live tools removed (the turning section's own
 * cells are checked by turnGougeCheck). part: the machining model ({ welded }). null without live tools.
 */
export function withLiveGouges(check, sim, part, { tol = 0.02 } = {}) {
  const g = liveGouges(sim, part, { tol });
  return g ? { ...check, count: check.count + g.count, max: Math.max(check.max ?? 0, g.max), live: { count: g.count, max: g.max } } : check;
}

export function liveGouges(sim, part, { tol = 0.02 } = {}) {
  const live = sim?.live;
  if (!live?.dexel || !part?.welded) return null;
  const td = live.dexel;
  td.part = Object.fromEntries(Object.entries(td.grids).map(([k, g]) => [k, partRays(part.welded, g).map((p, i) => intersectIntervals(p, live.turned[k][i]))]));
  // As the milling check: depths confirmed on the mesh (a ray along a hole's wall loses a long but shallow piece)
  // and on the B-rep when there is one.
  const exact = part.shape ? exactRays(part.shape) : null;
  try { return dexelGouges(td, part.welded, { tol, grid: part.topGrid?.() ?? null, exact }); } finally { exact?.delete(); }
}

function cutsAt(map, prof, R, x, y, zt) {
  const i = Math.floor((x - map.x0) / map.hx); const j = Math.floor((y - map.y0) / map.hy);
  if (i < 0 || j < 0 || i >= map.nx || j >= map.ny) return false;
  const q = Math.hypot(map.x0 + (i + 0.5) * map.hx - x, map.y0 + (j + 0.5) * map.hy - y);
  const h = prof(q);
  return h !== Infinity && Math.max(map.bottom, zt + h) < map.z[j * map.nx + i] - 1e-6;
}

/**
 * Gouges: cells cut below the part's top surface by more than tol. partTop(x, y) → height (−Infinity: no part).
 * Returns { count, max, cells: [k] , remaining (mm³ of stock above the part), partHeights }.
 */
export function gougeCheck(sim, part, { tol = 0.02 } = {}) {
  // A simulation and the machining model: exact along the three ray directions.
  if (sim?.dexel && part?.welded) {
    const exact = part.shape ? exactRays(part.shape) : null;
    let g;
    try { g = dexelGouges(sim.dexel, part.welded, { tol, grid: part.topGrid?.() ?? null, exact }); } finally { exact?.delete(); }
    const map = sim.map; const pz = sim.dexel.part.z;
    const partHeights = Float32Array.from(pz, (l) => (l.length ? l[l.length - 1] : map.bottom));
    return { ...g, partHeights };
  }
  return gougeCheckMap(sim?.map ?? sim, part, { tol });
}

/** The height-map check (a partTop(x, y) function). */
function gougeCheckMap(map, partTop, { tol = 0.02 } = {}) {
  const heights = new Float32Array(map.z.length);
  let count = 0; let max = 0; const cells = []; let remaining = 0;
  const area = map.hx * map.hy;
  for (let j = 0; j < map.ny; j++) for (let i = 0; i < map.nx; i++) {
    const k = j * map.nx + i;
    const x = map.x0 + (i + 0.5) * map.hx; const y = map.y0 + (j + 0.5) * map.hy;
    // The lowest part height over the cell's centre and corners: a cell a wall runs through (its mesh a
    // little inside the true surface) is not counted as cut into.
    const centre = partTop(x, y);
    let top = centre;
    if (Number.isFinite(top)) for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) { const v = partTop(x + dx * map.hx, y + dy * map.hy); top = Math.min(top, Number.isFinite(v) ? v : map.bottom); }
    // No part over the cell: nothing to gouge (a drill breaking through cuts the stock's bottom only).
    const h = Number.isFinite(centre) ? Math.max(centre, map.bottom) : map.bottom;
    heights[k] = h;
    const g = Number.isFinite(top) ? Math.max(top, map.bottom) - map.z[k] : 0;
    if (g > tol) { count++; max = Math.max(max, g); if (cells.length < 2000) cells.push(k); }
    if (map.z[k] > h) remaining += (map.z[k] - h) * area;
  }
  return { count, max, cells, remaining, partHeights: heights };
}

/** A triangle mesh of the Z-map's top (for display): { vertices, normals, triangles, faceGroups } plus colours. */
export function zmapMesh(map, { partHeights = null, tol = 0.02 } = {}) {
  const { nx, ny, hx, hy } = map;
  const V = new Float32Array((nx + 1) * (ny + 1) * 3);
  const C = new Float32Array((nx + 1) * (ny + 1) * 3);
  const at = (i, j) => map.z[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const z = Math.min(at(i - 1, j - 1), at(i, j - 1), at(i - 1, j), at(i, j));
    const k = j * (nx + 1) + i;
    V.set([map.x0 + i * hx, map.y0 + j * hy, z], 3 * k);
    let col = [0.72, 0.76, 0.8];
    if (partHeights) {
      let worst = -Infinity;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) { if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const kk = b * nx + a; worst = Math.max(worst, partHeights[kk] - map.z[kk]); }
      // Red: gouge, green: at the part, blue: stock left above it.
      col = worst > tol ? [0.9, 0.15, 0.12] : worst > -Math.max(0.05, tol * 3) ? [0.3, 0.75, 0.35] : [0.35, 0.55, 0.9];
    }
    C.set(col, 3 * k);
  }
  const T = new Uint32Array(nx * ny * 6);
  let t = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i; const b = a + 1; const c = a + nx + 1; const d = c + 1;
    T.set([a, b, d, a, d, c], t); t += 6;
  }
  const N = new Float32Array(V.length);
  for (let k = 0; k < T.length; k += 3) {
    const a = 3 * T[k]; const b = 3 * T[k + 1]; const c = 3 * T[k + 2];
    const ux = V[b] - V[a]; const uy = V[b + 1] - V[a + 1]; const uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a]; const vy = V[c + 1] - V[a + 1]; const vz = V[c + 2] - V[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const q of [a, b, c]) { N[q] += n[0]; N[q + 1] += n[1]; N[q + 2] += n[2]; }
  }
  for (let q = 0; q < N.length; q += 3) { const l = Math.hypot(N[q], N[q + 1], N[q + 2]) || 1; N[q] /= l; N[q + 1] /= l; N[q + 2] /= l; }
  return { vertices: V, normals: N, triangles: T, faceGroups: [{ start: 0, count: T.length, faceId: 0 }], colors: C };
}

// ───────────────────────── turning

/** The stock's half section: cells (r, z); 1 = material. */
export function createTurnGrid(stock, cell = 0.1) {
  const nr = Math.max(1, Math.ceil(stock.r / cell)); const nz = Math.max(1, Math.ceil((stock.z1 - stock.z0) / cell));
  const dr = stock.r / nr; const dz = (stock.z1 - stock.z0) / nz;
  const m = new Uint8Array(nr * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) if ((i + 0.5) * dr >= (stock.bore ?? 0)) m[j * nr + i] = 1;
  return { nr, nz, dr, dz, z0: stock.z0, m };
}

/**
 * The insert as the simulator sees it: the wedge between its main edge (5° from radial toward +Z: a 95° approach
 * when turning toward the chuck) and its minor
 * edge (the insert's angle further on), both tangent to the nose circle — the set of points within the nose
 * radius of the wedge with its apex at the nose centre. Coordinates relative to the nose centre: dr outward
 * from the part (an OD tool; a boring bar flips it), dz along Z.
 */
function inInsert(dr, dz, n, a1, a2) {
  const ang = Math.atan2(dz, dr);
  if (ang >= a1 && ang <= a2) return true;
  const ray = (a) => { const ux = Math.cos(a); const uz = Math.sin(a); const t = Math.max(0, dr * ux + dz * uz); return Math.hypot(dr - ux * t, dz - uz * t); };
  return Math.min(ray(a1), ray(a2)) <= n;
}

/** Removes the cells the tool covers with its reference point (nose centre / blade front / drill tip) at (x, z). */
function turnStamp(g, tool, x, z, removed) {
  const n = Math.max(1e-3, tool.nose ?? 0.4);
  const type = tool.type;
  let zLo; let zHi; let test;
  // The holder's approach angle sets the main edge (95° → 5° past radial toward +Z), the insert's corner angle the minor edge.
  const a1 = (((tool.approach ?? 95) - 90) * Math.PI) / 180; const a2 = a1 + ((tool.angle ?? 80) * Math.PI) / 180;
  const reach = Math.max(4, 12 * n);
  if (type === 'groove') { const w = tool.width ?? tool.d; zLo = z - w / 2; zHi = z + w / 2; test = (r) => r >= x; }
  else if (type === 'turnDrill') { const R = tool.d / 2; const k = Math.tan(((tool.tip ?? 118) / 2) * Math.PI / 180); zLo = z; zHi = Infinity; test = (r, zz) => r <= R && zz >= z + r / k; }
  else if (type === 'bore') { zLo = z - n; zHi = z + reach; test = (r, zz) => inInsert(x - r, zz - z, n, a1, a2); }
  else { zLo = z - n; zHi = z + reach; test = (r, zz) => inInsert(r - x, zz - z, n, a1, a2); }
  if (zLo > g.z0 + g.nz * g.dz) return;
  const j0 = clamp(Math.floor((zLo - g.z0) / g.dz), 0, g.nz - 1);
  const j1 = zHi === Infinity ? g.nz - 1 : clamp(Math.floor((zHi - g.z0) / g.dz), 0, g.nz - 1);
  const iLo = type === 'bore' || type === 'turnDrill' ? 0 : clamp(Math.floor((x - n) / g.dr), 0, g.nr - 1);
  const iHi = type === 'bore' ? clamp(Math.ceil((x + n) / g.dr), 0, g.nr - 1) : g.nr - 1;
  for (let j = j0; j <= j1; j++) {
    const zz = g.z0 + (j + 0.5) * g.dz;
    for (let i = iLo; i <= iHi; i++) {
      const k = j * g.nr + i;
      if (!g.m[k]) continue;
      const r = (i + 0.5) * g.dr;
      if (test(r, zz)) { g.m[k] = 0; removed.push(k); }
    }
  }
}

/**
 * A threading pass from zA to zB with the V tip at radius x and the given pitch: the thread's axial section
 * (at the angle the section shows; the helix has the same section shifted along Z at every angle). A cell is cut
 * where it lies outside the V of the nearest groove: r ≥ x + d / tan(half angle), d its axial distance to that
 * groove's centre (grooves every pitch from where the pass starts).
 */
function threadStamp(g, tool, x, zA, zB, pitch, removed) {
  const half = (((tool.angle ?? 60) / 2) * Math.PI) / 180;
  const k = 1 / Math.tan(half);
  const lo = Math.min(zA, zB); const hi = Math.max(zA, zB);
  const j0 = clamp(Math.floor((lo - g.z0) / g.dz), 0, g.nz - 1); const j1 = clamp(Math.floor((hi - g.z0) / g.dz), 0, g.nz - 1);
  for (let j = j0; j <= j1; j++) {
    const zz = g.z0 + (j + 0.5) * g.dz;
    if (zz < lo || zz > hi) continue;
    const ph = (((zA - zz) % pitch) + pitch) % pitch;
    const d = Math.min(ph, pitch - ph);
    const floor = x + d * k;
    for (let i = clamp(Math.floor(floor / g.dr), 0, g.nr - 1); i < g.nr; i++) {
      const c = j * g.nr + i;
      if (g.m[c] && (i + 0.5) * g.dr >= floor) { g.m[c] = 0; removed.push(c); }
    }
  }
}

/** Runs turning toolpaths: { grid, removed (mm³) }. */
export function simulateTurning(stock, paths, tools, { cell = 0.1 } = {}) {
  const g = createTurnGrid(stock, cell);
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const removed = [];
  const step = Math.min(g.dr, g.dz) * 0.5;
  const skipped = []; const live = [];
  for (const tp of paths) {
    const tool = toolMap.get(tp.tool);
    if (!tool) continue;
    // Live-tool (C axis) drilling is off the turning section: done afterwards on a 3D model of the turned bar.
    if (tp.multi === 'millTurn') { live.push(tp); continue; }
    if (tp.multi) { skipped.push(tp.op); continue; }
    let pos = null;
    for (const m of expandMoves(tp.moves)) {
      if (!m.p) continue;
      const q = [m.p[0], m.p[2]];
      if (!pos) { pos = q; continue; }
      // Drills run on the axis: the cycle's z is the move's z.
      if (m.k === 't' || tool.type === 'thread') {
        if (m.k === 't') threadStamp(g, tool, Math.min(pos[0], q[0]), pos[1], q[1], m.f, removed);
        pos = q; continue;
      }
      const L = Math.hypot(q[0] - pos[0], q[1] - pos[1]);
      const n = Math.max(1, Math.ceil(L / step));
      for (let s = 1; s <= n; s++) { const t = s / n; turnStamp(g, tool, pos[0] + (q[0] - pos[0]) * t, pos[1] + (q[1] - pos[1]) * t, removed); }
      pos = q;
    }
  }
  let vol = 0;
  for (const k of removed) { const i = k % g.nr; vol += 2 * Math.PI * (i + 0.5) * g.dr * g.dr * g.dz; }
  // Live tools: the turned bar as a tri-dexel (cells about the turning section's size, at least 0.25 mm), drilled.
  let liveSim = null;
  if (live.length) {
    const lc = Math.max(0.25, Math.min(g.dr, g.dz) * 2);
    liveSim = liveToolPass(dexelFromTurned(g, stock, lc), live, toolMap, lc * 0.5);
    vol += liveSim.removed;
  }
  return { grid: g, removed: vol, removedCells: removed, skipped, live: liveSim };
}

/** Turning gouges: removed cells inside the part's profile. profileAt(z) → { outer, inner }. */
export function turnGougeCheck(sim, profileAt, { tol = 0.02, threads = [] } = {}) {
  const g = sim.grid; let count = 0; let max = 0; let remaining = 0;
  // A thread cuts below the modelled cylinder on purpose: down to its root there.
  const inThread = (r, z) => threads.some((th) => z >= Math.min(th.z0, th.z1) - tol && z <= Math.max(th.z0, th.z1) + tol && r >= th.major / 2 - th.depth - tol);
  for (const k of sim.removedCells) {
    const i = k % g.nr; const j = Math.floor(k / g.nr);
    const r = (i + 0.5) * g.dr; const z = g.z0 + (j + 0.5) * g.dz;
    if (inThread(r, z)) continue;
    const p = profileAt(z);
    if (r < p.outer - tol && r > p.inner + tol) { count++; max = Math.max(max, Math.min(p.outer - r, r - p.inner)); }
  }
  for (let k = 0; k < g.m.length; k++) {
    if (!g.m[k]) continue;
    const i = k % g.nr; const j = Math.floor(k / g.nr);
    const r = (i + 0.5) * g.dr; const z = g.z0 + (j + 0.5) * g.dz; const p = profileAt(z);
    if (r > p.outer || r < p.inner) remaining += 2 * Math.PI * r * g.dr * g.dz;
  }
  return { count, max, remaining };
}

// ───────────────────────── time

/**
 * Cycle time of toolpaths (seconds): feed moves at their feed (mm/min; turning mm/rev at the spindle speed of
 * the radius, constant surface speed capped at the machine's maximum), rapids at the machine's rapid rate,
 * dwells, and a tool change between different tools. Returns { total, cutting, rapid, changes, perOp: [s] }.
 */
export function cycleTime(paths, machine) {
  let cutting = 0; let rapid = 0; let changes = 0; let dwell = 0;
  const perOp = [];
  let lastTool = null; let pos = null;
  for (const tp of paths) {
    let t = 0;
    if (lastTool !== tp.tool) { changes++; t += machine.toolChange; lastTool = tp.tool; }
    for (const m of expandMoves(tp.moves)) {
      if (m.k === 'dwell') { dwell += m.s; t += m.s; continue; }
      if (!m.p) continue;
      if (!pos) { pos = m.p; continue; }
      const L = Math.hypot(m.p[0] - pos[0], m.p[1] - pos[1], m.p[2] - pos[2]);
      let s;
      if (m.k === 'r') { s = (L / machine.rapid) * 60; rapid += s; }
      else if (tp.kind === 'turn') {
        const r = Math.max(0.5, (Math.abs(m.p[0]) + Math.abs(pos[0])) / 2);
        const rpm = m.k === 't' ? tp.rpm : Math.min(tp.maxRpm ?? machine.maxRpm, (1000 * (tp.vc ?? 200)) / (Math.PI * 2 * r));
        s = (L / Math.max(1e-6, (m.f ?? tp.feed) * rpm)) * 60; cutting += s;
      } else { s = (L / Math.max(1, m.f ?? tp.feed)) * 60; cutting += s; }
      t += s;
      pos = m.p;
    }
    perOp.push(t);
  }
  return { total: cutting + rapid + dwell + changes * machine.toolChange, cutting, rapid, dwell, changes, perOp };
}

/** Length of feed and rapid moves (mm). */
export function pathLengths(moves) {
  let feed = 0; let rapid = 0; let pos = null;
  for (const m of expandMoves(moves)) {
    if (!m.p) continue;
    if (pos) { const L = Math.hypot(m.p[0] - pos[0], m.p[1] - pos[1], m.p[2] - pos[2]); if (m.k === 'r') rapid += L; else feed += L; }
    pos = m.p;
  }
  return { feed, rapid };
}
