// Tri-dexel stock (no DOM): the stock as three grids of rays, along Z (over XY), along X (over YZ) and along Y
// (over XZ); each ray holds the intervals of material it passes through. The cutter's solid at every sample
// position of a move (a flat, ball, bull nose or drill point on a shank) is intersected exactly with every ray
// it reaches and that interval is removed — so pockets under overhangs, side holes and walls are represented,
// and a wall is resolved exactly along the rays that cross it, not to the grid spacing.
//
// The part is cast along the same rays (its material intervals from the mesh); a gouge is material of the part
// that a ray lost, measured along that ray.

import { meshDistance } from './cam-geom.js';

/** Intervals [a0, b0, a1, b1, …] minus [a, b]. */
function subtract(list, a, b) {
  if (!list.length || b <= list[0] || a >= list[list.length - 1]) return list;
  const out = [];
  for (let i = 0; i < list.length; i += 2) {
    const s = list[i]; const e = list[i + 1];
    if (e <= a || s >= b) { out.push(s, e); continue; }
    if (s < a) out.push(s, a);
    if (e > b) out.push(b, e);
  }
  return out;
}
const total = (list) => { let s = 0; for (let i = 0; i < list.length; i += 2) s += list[i + 1] - list[i]; return s; };
/** Length of the overlap of two interval lists. */
function overlap(p, q) {
  let s = 0; let i = 0; let j = 0;
  while (i < p.length && j < q.length) {
    const a = Math.max(p[i], q[j]); const b = Math.min(p[i + 1], q[j + 1]);
    if (b > a) s += b - a;
    if (p[i + 1] < q[j + 1]) i += 2; else j += 2;
  }
  return s;
}
/** p minus q (interval lists). */
function minus(p, q) { let out = p; for (let j = 0; j < q.length; j += 2) out = subtract(out, q[j], q[j + 1]); return out; }
/** p and q (interval lists): what both hold. */
export function intersectIntervals(p, q) {
  const out = minus(p, minus(p, q));
  // An end that is one of p's keeps p's steepness there (partRays' `cos`: how deep a cut along the ray reaches).
  if (p.cos) out.cos = out.map((v) => { const i = p.indexOf(v); return i >= 0 ? p.cos[i] : 1; });
  return out;
}

// Axes of the three grids: the ray runs along `w`; (u, v) index the grid.
const AXES = { z: { u: 0, v: 1, w: 2 }, x: { u: 1, v: 2, w: 0 }, y: { u: 0, v: 2, w: 1 } };

/** A tri-dexel stock for a box { x0 … z1 } with rays `cell` apart. */
export function createTriDexel(stock, cell) {
  const lo = [stock.x0, stock.y0, stock.z0]; const hi = [stock.x1, stock.y1, stock.z1];
  const grids = {};
  for (const [name, ax] of Object.entries(AXES)) {
    const nu = Math.max(1, Math.ceil((hi[ax.u] - lo[ax.u]) / cell)); const nv = Math.max(1, Math.ceil((hi[ax.v] - lo[ax.v]) / cell));
    const hu = (hi[ax.u] - lo[ax.u]) / nu; const hv = (hi[ax.v] - lo[ax.v]) / nv;
    const rays = Array.from({ length: nu * nv }, () => [lo[ax.w], hi[ax.w]]);
    grids[name] = { name, ax, nu, nv, hu, hv, u0: lo[ax.u], v0: lo[ax.v], rays };
  }
  return { stock, cell, lo, hi, grids };
}

/** The cutter's radius at height dz above its tip (−1 below the tip), for flat / ball / bull / drill cutters. */
export function radiusAt(cutter, dz) {
  const R = cutter.r;
  if (dz < 0) return -1;
  if (cutter.type === 'ball') return dz >= R ? R : Math.sqrt(Math.max(0, R * R - (R - dz) ** 2));
  if (cutter.type === 'bull') { const rc = Math.min(cutter.rc ?? 0, R); const rf = R - rc; return dz >= rc ? R : rf + Math.sqrt(Math.max(0, rc * rc - (rc - dz) ** 2)); }
  if (cutter.type === 'drill') { const k = Math.tan(((cutter.tip ?? 118) / 2) * Math.PI / 180); return Math.min(R, dz * k); }
  return R;
}
/** Height of the cutter's lower surface above its tip at radius q (Infinity outside). */
export function liftAt(cutter, q) {
  const R = cutter.r;
  if (q > R) return Infinity;
  if (cutter.type === 'ball') return R - Math.sqrt(Math.max(0, R * R - q * q));
  if (cutter.type === 'bull') { const rc = Math.min(cutter.rc ?? 0, R); const rf = R - rc; return q <= rf ? 0 : rc - Math.sqrt(Math.max(0, rc * rc - (q - rf) ** 2)); }
  if (cutter.type === 'drill') return q / Math.tan(((cutter.tip ?? 118) / 2) * Math.PI / 180);
  return 0;
}

const clampI = (v, n) => Math.max(0, Math.min(n - 1, v));

/**
 * Removes the cutter (tip at x, y, z) from the stock. Returns true when it cut anything (for rapid checks).
 * The rays along X and Y only need the heights where the Z rays under the cutter still hold material.
 */
export function cutAt(td, cutter, x, y, z) {
  const R = cutter.r;
  let cut = false; let top = -Infinity; let reached = 0;
  const gz = td.grids.z;
  const i0 = clampI(Math.floor((x - R - gz.u0) / gz.hu), gz.nu); const i1 = clampI(Math.floor((x + R - gz.u0) / gz.hu), gz.nu);
  const j0 = clampI(Math.floor((y - R - gz.v0) / gz.hv), gz.nv); const j1 = clampI(Math.floor((y + R - gz.v0) / gz.hv), gz.nv);
  if (x + R < td.lo[0] || x - R > td.hi[0] || y + R < td.lo[1] || y - R > td.hi[1] || z > td.hi[2]) return false;
  for (let j = j0; j <= j1; j++) {
    const py = gz.v0 + (j + 0.5) * gz.hv - y;
    for (let i = i0; i <= i1; i++) {
      const k = j * gz.nu + i; const ray = gz.rays[k];
      if (!ray.length) continue;
      const q = Math.hypot(gz.u0 + (i + 0.5) * gz.hu - x, py);
      if (q <= R) {
        reached++;
        const a = z + liftAt(cutter, q); const was = ray[ray.length - 1];
        if (a < was) { const n = subtract(ray, a, Infinity); if (n !== ray) { if (total(n) < total(ray)) cut = true; gz.rays[k] = n; top = Math.max(top, was); } }
      }
    }
  }
  // Along X and Y: only up to the highest material the cutter met in its columns (a column whose top is below the
  // cutter's lower surface holds nothing the cutter reaches, at any height), and a cell's margin for the rays
  // between the columns.
  // No column under the cutter at all (it only overlaps the stock's edge, between the outer columns and the
  // side): the X and Y rays decide alone, over the stock's height.
  if (top === -Infinity && reached > 0) return cut;
  const zTop = top === -Infinity ? td.hi[2] : Math.min(td.hi[2], top + td.cell);
  for (const name of ['x', 'y']) {
    const g = td.grids[name];
    // u: y for X rays, x for Y rays; v: z. The ray runs along the other horizontal axis.
    const cu = name === 'x' ? y : x; const cw = name === 'x' ? x : y;
    const iu0 = clampI(Math.floor((cu - R - g.u0) / g.hu), g.nu); const iu1 = clampI(Math.floor((cu + R - g.u0) / g.hu), g.nu);
    const iv0 = clampI(Math.floor((z - g.v0) / g.hv), g.nv); const iv1 = clampI(Math.floor((zTop - g.v0) / g.hv), g.nv);
    if (z > g.v0 + g.nv * g.hv) continue;
    for (let jv = iv0; jv <= iv1; jv++) {
      const pz = g.v0 + (jv + 0.5) * g.hv;
      const rr = radiusAt(cutter, pz - z);
      if (rr <= 0) continue;
      for (let iu = iu0; iu <= iu1; iu++) {
        const du = g.u0 + (iu + 0.5) * g.hu - cu;
        if (Math.abs(du) >= rr) continue;
        const half = Math.sqrt(rr * rr - du * du);
        const k = jv * g.nu + iu; const ray = g.rays[k];
        if (!ray.length) continue;
        const n = subtract(ray, cw - half, cw + half);
        if (n !== ray) { if (total(n) < total(ray) - 1e-12) cut = true; g.rays[k] = n; }
      }
    }
  }
  return cut;
}

// ───────────────────────── a cutter along any axis (4-axis rotary, mill-turn radial live tools)

/** Height above the tip where the cutter reaches its full radius (flat 0, ball R, bull rc, drill R / tan(half tip)). */
function shoulderOf(cutter) {
  const R = cutter.r;
  if (cutter.type === 'ball') return R;
  if (cutter.type === 'bull') return Math.min(cutter.rc ?? 0, R);
  if (cutter.type === 'drill') return R / Math.tan(((cutter.tip ?? 118) / 2) * Math.PI / 180);
  return 0;
}

/**
 * The interval [s0, s1] of the line O + s·e_w (w = 0, 1, 2) inside the cutter with its tip at `tip`, its unit axis
 * `t` (tip → shank) and its shank reaching hMax along the axis; null when it misses. The cutter (lower surface by
 * radiusAt, a shank of radius R above) is convex, so the line meets it in one interval: the shank's cylinder gives
 * it above the shoulder exactly, and the end below the shoulder is found by bisection.
 */
function lineThroughCutter(O, w, tip, t, cutter, h0, hMax) {
  const R = cutter.r;
  const d = [O[0] - tip[0], O[1] - tip[1], O[2] - tip[2]];
  const wt = t[w]; const dt = d[0] * t[0] + d[1] * t[1] + d[2] * t[2];
  const A = 1 - wt * wt; const B = d[w] - wt * dt; const C = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] - dt * dt;
  const hAt = (s) => dt + s * wt;
  const inside = (s) => {
    const h = hAt(s);
    if (h < 0 || h > hMax) return false;
    const q2 = A * s * s + 2 * B * s + C;
    const r = radiusAt(cutter, h);
    return r > 0 && q2 <= r * r + 1e-12;
  };
  if (A < 1e-12) {
    // Along the axis: a constant distance from it; inside from the lower surface up to the shank's end.
    const q = Math.sqrt(Math.max(0, C));
    if (q > R) return null;
    const lift = liftAt(cutter, q);
    const a = (lift - dt) / wt; const b = (hMax - dt) / wt;
    return a < b ? [a, b] : [b, a];
  }
  const ring = (r) => { const disc = B * B - A * (C - r * r); if (disc < 0) return null; const sq = Math.sqrt(disc); return [(-B - sq) / A, (-B + sq) / A]; };
  if (Math.abs(wt) < 1e-12) {
    // Across the axis: one height, so one circle of the cutter's section.
    if (dt < 0 || dt > hMax) return null;
    const r = radiusAt(cutter, dt);
    return r > 0 ? ring(r) : null;
  }
  const cyl = ring(R);
  if (!cyl) return null;
  const hs = [(0 - dt) / wt, (hMax - dt) / wt].sort((x, y) => x - y);
  const sa = Math.max(cyl[0], hs[0]); const sb = Math.min(cyl[1], hs[1]);
  if (!(sa < sb)) return null;
  // Flat end: the cylinder above the tip is the cutter.
  if (cutter.type !== 'ball' && cutter.type !== 'bull' && cutter.type !== 'drill') return [sa, sb];
  if (cutter.type === 'ball') {
    // Ball end: the sphere round tip + R·t and the shank above its centre (convex pieces that overlap).
    const c = [O[0] - tip[0] - t[0] * R, O[1] - tip[1] - t[1] * R, O[2] - tip[2] - t[2] * R];
    const b = c[w]; const disc = b * b - (c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - R * R);
    const sphere = disc >= 0 ? [-b - Math.sqrt(disc), -b + Math.sqrt(disc)] : null;
    const hr = [(R - dt) / wt, (hMax - dt) / wt].sort((x, y) => x - y);
    const shank = [Math.max(cyl[0], hr[0]), Math.min(cyl[1], hr[1])];
    const parts = [sphere, shank[0] < shank[1] ? shank : null].filter(Boolean);
    return parts.length ? [Math.min(...parts.map((p) => p[0])), Math.max(...parts.map((p) => p[1]))] : null;
  }
  const bisect = (sin, sout) => { for (let i = 0; i < 22; i++) { const m = (sin + sout) / 2; if (inside(m)) sin = m; else sout = m; } return sin; };
  // Above the shoulder the whole cylinder chord is inside; the low-h end of the chord may be outside.
  const sh = (h0 - dt) / wt;
  let lo = sa; let hi = sb;
  if (wt > 0 ? sh < sb : sh > sa) {
    if (wt > 0) { const top0 = Math.max(sa, sh); if (!inside(sa)) lo = bisect(top0, sa); }
    else { const top0 = Math.min(sb, sh); if (!inside(sb)) hi = bisect(top0, sb); }
    return [lo, hi];
  }
  // All of the chord is below the shoulder: an inside point first (the chord's samples), then both ends.
  let sIn = null;
  for (let i = 0; i <= 16 && sIn == null; i++) { const s = sa + ((sb - sa) * i) / 16; if (inside(s)) sIn = s; }
  if (sIn == null) return null;
  return [inside(sa) ? sa : bisect(sIn, sa), inside(sb) ? sb : bisect(sIn, sb)];
}

/**
 * Removes a cutter whose axis is `axis` (tip → shank, any direction) with its tip at `tip`: every ray of the three
 * grids loses the stretch inside the cutter, whose shank runs out to the far side of the stock. Returns true when
 * it cut anything. The vertical cutAt is the quick case of this.
 */
export function cutAlong(td, cutter, tip, axis) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const t = [axis[0] / l, axis[1] / l, axis[2] / l];
  const R = cutter.r;
  let hMax = 0;
  for (const x of [td.lo[0], td.hi[0]]) for (const y of [td.lo[1], td.hi[1]]) for (const z of [td.lo[2], td.hi[2]]) hMax = Math.max(hMax, (x - tip[0]) * t[0] + (y - tip[1]) * t[1] + (z - tip[2]) * t[2]);
  hMax += td.cell;
  if (hMax <= 0) return false;
  // Quick reject: the cutter's capsule (tip → top, radius R) misses the stock.
  const top = [tip[0] + t[0] * hMax, tip[1] + t[1] * hMax, tip[2] + t[2] * hMax];
  for (let a = 0; a < 3; a++) if (Math.max(tip[a], top[a]) + R < td.lo[a] || Math.min(tip[a], top[a]) - R > td.hi[a]) return false;
  const h0 = shoulderOf(cutter);
  let cut = false;
  for (const g of Object.values(td.grids)) {
    const { u, v, w } = g.ax;
    // The capsule's shadow on the grid: rows v within R of the segment, and in each row the u span of the segment
    // over those v, widened by R.
    const pu = [tip[u], top[u]]; const pv = [tip[v], top[v]];
    const jv0 = clampI(Math.floor((Math.min(...pv) - R - g.v0) / g.hv), g.nv); const jv1 = clampI(Math.floor((Math.max(...pv) + R - g.v0) / g.hv), g.nv);
    const O = [0, 0, 0];
    for (let jv = jv0; jv <= jv1; jv++) {
      const cv = g.v0 + (jv + 0.5) * g.hv;
      let ua; let ub;
      const dv = pv[1] - pv[0];
      if (Math.abs(dv) < 1e-12) {
        if (Math.abs(cv - pv[0]) > R) continue;
        ua = Math.min(...pu) - R; ub = Math.max(...pu) + R;
      } else {
        const ta = Math.max(0, Math.min(1, (cv - R - pv[0]) / dv)); const tb = Math.max(0, Math.min(1, (cv + R - pv[0]) / dv));
        const xa = pu[0] + (pu[1] - pu[0]) * ta; const xb = pu[0] + (pu[1] - pu[0]) * tb;
        ua = Math.min(xa, xb) - R; ub = Math.max(xa, xb) + R;
      }
      const iu0 = clampI(Math.floor((ua - g.u0) / g.hu), g.nu); const iu1 = clampI(Math.floor((ub - g.u0) / g.hu), g.nu);
      O[v] = cv;
      for (let iu = iu0; iu <= iu1; iu++) {
        const k = jv * g.nu + iu; const ray = g.rays[k];
        if (!ray.length) continue;
        O[u] = g.u0 + (iu + 0.5) * g.hu; O[w] = 0;
        const s = lineThroughCutter(O, w, tip, t, cutter, h0, hMax);
        if (!s || s[1] <= ray[0] || s[0] >= ray[ray.length - 1]) continue;
        const n = subtract(ray, s[0], s[1]);
        // Rounding leaves hair-thin slivers: only a real piece counts as cut (rapid checks).
        if (n !== ray) { if (total(n) < total(ray) - 1e-6) cut = true; g.rays[k] = n; }
      }
    }
  }
  return cut;
}

/**
 * A tri-dexel stock of a turned bar (the turning simulation's half section, `grid` from createTurnGrid, about the
 * axis through (cx, cy) along Z): every ray holds the bar's material as turned — for live-tool work after turning.
 */
export function dexelFromTurned(grid, stock, cell) {
  const cx = stock.cx ?? 0; const cy = stock.cy ?? 0; const r = stock.r;
  const td = createTriDexel({ x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r, z0: stock.z0, z1: stock.z1 }, cell);
  const filled = (i, j) => i >= 0 && i < grid.nr && j >= 0 && j < grid.nz && grid.m[j * grid.nr + i] === 1;
  // Radial runs of material in a row j of the section: [ρa, ρb, …].
  const runs = (j) => { const out = []; let a = null; for (let i = 0; i <= grid.nr; i++) { const f = i < grid.nr && filled(i, j); if (f && a == null) a = i * grid.dr; if (!f && a != null) { out.push(a, i * grid.dr); a = null; } } return out; };
  const rowOf = (z) => Math.floor((z - grid.z0) / grid.dz);
  const rowRuns = new Map();
  const runsAt = (z) => { const j = rowOf(z); if (!rowRuns.has(j)) rowRuns.set(j, runs(j)); return rowRuns.get(j); };
  // Z rays: one radius each, runs of rows along z.
  const gz = td.grids.z;
  for (let j = 0; j < gz.nv; j++) for (let i = 0; i < gz.nu; i++) {
    const rho = Math.hypot(gz.u0 + (i + 0.5) * gz.hu - cx, gz.v0 + (j + 0.5) * gz.hv - cy);
    const ir = Math.floor(rho / grid.dr); const out = []; let a = null;
    for (let k = 0; k <= grid.nz; k++) { const f = k < grid.nz && filled(ir, k); if (f && a == null) a = grid.z0 + k * grid.dz; if (!f && a != null) { out.push(a, grid.z0 + k * grid.dz); a = null; } }
    gz.rays[j * gz.nu + i] = out;
  }
  // X and Y rays: at height z and offset e from the axis, a run [ρa, ρb] is |w − c| between √(ρa² − e²) and √(ρb² − e²).
  for (const name of ['x', 'y']) {
    const g = td.grids[name]; const c = name === 'x' ? cx : cy; const co = name === 'x' ? cy : cx;
    for (let jv = 0; jv < g.nv; jv++) {
      const z = g.v0 + (jv + 0.5) * g.hv; const rr = runsAt(z);
      for (let iu = 0; iu < g.nu; iu++) {
        const e = Math.abs(g.u0 + (iu + 0.5) * g.hu - co);
        const neg = []; const pos = [];
        for (let q = 0; q < rr.length; q += 2) {
          if (rr[q + 1] <= e) continue;
          const a = Math.sqrt(Math.max(0, rr[q] * rr[q] - e * e)); const b = Math.sqrt(rr[q + 1] * rr[q + 1] - e * e);
          pos.push(c + a, c + b); neg.unshift(c - b, c - a);
        }
        // The two halves meet at the axis when the innermost run reaches it.
        const out = [...neg, ...pos];
        for (let q = out.length - 2; q > 0; q -= 2) if (Math.abs(out[q] - out[q - 1]) < 1e-9) out.splice(q - 1, 2);
        g.rays[jv * g.nu + iu] = out;
      }
    }
  }
  return td;
}

/**
 * The stock as a closed surface for display (every side, not only the top): voxels from the Z rays (filled where a
 * cell's centre is inside material) and a face wherever a filled voxel meets an empty one.
 * { vertices, normals, triangles, faceGroups, colors: null }.
 */
export function dexelMesh(td) {
  const g = td.grids.z; const nz = Math.max(1, Math.round((td.hi[2] - td.lo[2]) / td.cell)); const hz = (td.hi[2] - td.lo[2]) / nz;
  const nx = g.nu; const ny = g.nv;
  const occ = new Uint8Array(nx * ny * nz);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ray = g.rays[j * nx + i];
    for (let q = 0; q < ray.length; q += 2) {
      const k0 = Math.max(0, Math.ceil((ray[q] - td.lo[2]) / hz - 0.5)); const k1 = Math.min(nz - 1, Math.floor((ray[q + 1] - td.lo[2]) / hz - 0.5));
      for (let k = k0; k <= k1; k++) occ[(k * ny + j) * nx + i] = 1;
    }
  }
  const at = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && occ[(k * ny + j) * nx + i] === 1;
  const V = []; const N = []; const T = [];
  const X = (i) => g.u0 + i * g.hu; const Y = (j) => g.v0 + j * g.hv; const Z = (k) => td.lo[2] + k * hz;
  const quad = (p, n) => { const b = V.length / 3; for (const q of p) { V.push(...q); N.push(...n); } T.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!at(i, j, k)) continue;
    const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1), z0 = Z(k), z1 = Z(k + 1);
    if (!at(i + 1, j, k)) quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
    if (!at(i - 1, j, k)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    if (!at(i, j + 1, k)) quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]);
    if (!at(i, j - 1, k)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
    if (!at(i, j, k + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    if (!at(i, j, k - 1)) quad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1]);
  }
  const tri = Uint32Array.from(T);
  return { vertices: Float32Array.from(V), normals: Float32Array.from(N), triangles: tri, faceGroups: [{ start: 0, count: tri.length, faceId: 0 }], colors: null };
}

/** Stock volume left (from the Z rays). */
export function dexelVolume(td) { const g = td.grids.z; let s = 0; for (const r of g.rays) s += total(r); return s * g.hu * g.hv; }

/** The top of each Z ray as a height map ({ x0, y0, nx, ny, hx, hy, z, bottom }) for display. */
export function topMap(td) {
  const g = td.grids.z;
  const z = new Float32Array(g.nu * g.nv);
  g.rays.forEach((r, k) => { z[k] = r.length ? r[r.length - 1] : td.lo[2]; });
  return { x0: g.u0, y0: g.v0, nx: g.nu, ny: g.nv, hx: g.hu, hy: g.hv, z, top: td.hi[2], bottom: td.lo[2] };
}

// ───────────────────────── the part along the rays

/** Material intervals of a welded mesh along every ray of a grid (crossings paired by the facets' facing). */
export function partRays(welded, g) {
  const V = welded.vertices; const T = welded.triangles; const { u, v, w } = g.ax;
  const lists = Array.from({ length: g.nu * g.nv }, () => []);
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t]; const b = 3 * T[t + 1]; const c = 3 * T[t + 2];
    const au = V[a + u]; const av = V[a + v]; const bu = V[b + u]; const bv = V[b + v]; const cu = V[c + u]; const cv = V[c + v];
    const d = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
    if (Math.abs(d) < 1e-14) continue; // parallel to the rays
    const iu0 = Math.max(0, Math.ceil((Math.min(au, bu, cu) - g.u0) / g.hu - 0.5)); const iu1 = Math.min(g.nu - 1, Math.floor((Math.max(au, bu, cu) - g.u0) / g.hu - 0.5));
    const iv0 = Math.max(0, Math.ceil((Math.min(av, bv, cv) - g.v0) / g.hv - 0.5)); const iv1 = Math.min(g.nv - 1, Math.floor((Math.max(av, bv, cv) - g.v0) / g.hv - 0.5));
    for (let jv = iv0; jv <= iv1; jv++) {
      const pv = g.v0 + (jv + 0.5) * g.hv;
      for (let iu = iu0; iu <= iu1; iu++) {
        const pu = g.u0 + (iu + 0.5) * g.hu;
        const l1 = ((bv - cv) * (pu - cu) + (cu - bu) * (pv - cv)) / d;
        const l2 = ((cv - av) * (pu - cu) + (au - cu) * (pv - cv)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-12 || l2 < -1e-12 || l3 < -1e-12) continue;
        // Facing the ray's direction (normal · w > 0): leaving material; else entering. The sign of d is the
        // facet's orientation in the (u, v) plane; (u, v, w) is right-handed for z and x, left-handed for y.
        const hand = g.name === 'y' ? -1 : 1;
        // The facet's unit normal's component along the ray (how steeply the ray meets the surface).
        const ux = V[b] - V[a]; const uy = V[b + 1] - V[a + 1]; const uz = V[b + 2] - V[a + 2];
        const vx = V[c] - V[a]; const vy = V[c + 1] - V[a + 1]; const vz = V[c + 2] - V[a + 2];
        const nn = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const cos = Math.abs(nn[w]) / (Math.hypot(nn[0], nn[1], nn[2]) || 1);
        lists[jv * g.nu + iu].push(l1 * V[a + w] + l2 * V[b + w] + l3 * V[c + w], d * hand > 0 ? 1 : -1, cos);
      }
    }
  }
  // Material intervals [a0, b0, …], with the surface's steepness to the ray at each end alongside (.cos).
  return lists.map((l) => {
    const hits = []; for (let i = 0; i < l.length; i += 3) hits.push([l[i], l[i + 1], l[i + 2]]);
    hits.sort((p, q) => p[0] - q[0]);
    const out = []; const cos = []; let depth = 0; let start = 0; let c0 = 1;
    for (const [s, dir, c] of hits) {
      if (dir < 0) { if (depth++ === 0) { start = s; c0 = c; } } else if (depth > 0 && --depth === 0) { if (s - start > 1e-9) { out.push(start, s); cos.push(c0, c); } }
    }
    out.cos = cos;
    return out;
  });
}

/** The deepest point of a ray's lost pieces below the part's surface (mesh distance), at most `bound`. */
function trueDepth(gone, stockLen, name, g, k, grid, bound) {
  const i = k % g.nu; const j = Math.floor(k / g.nu);
  const u = g.u0 + (i + 0.5) * g.hu; const v = g.v0 + (j + 0.5) * g.hv;
  const at = (w) => (name === 'z' ? [u, v, w] : name === 'x' ? [w, u, v] : [u, w, v]);
  let deep = 0;
  for (let q = 0; q < gone.length; q += 2) {
    const a = Math.max(gone[q], stockLen[0]); const b = Math.min(gone[q + 1], stockLen[1]);
    if (b <= a) continue;
    const n = Math.min(16, Math.max(2, Math.ceil((b - a) / 0.25)));
    for (let s = 0; s <= n; s++) { const d = meshDistance(grid, at(a + ((b - a) * s) / n), bound + 1e-6); if (Number.isFinite(d)) deep = Math.max(deep, Math.min(d, bound)); }
  }
  return deep;
}

/**
 * Gouges and stock left, ray by ray: { count (rays that lost part material), max (longest such loss),
 * remaining (stock volume outside the part, from the Z rays), cells (Z ray indices with a gouge) }. tol: the
 * length lost along a ray before it counts (the mesh's chord error).
 */
export function dexelGouges(td, welded, { tol = 0.02, grid = null, exact = null } = {}) {
  let count = 0; let max = 0; const cells = []; const where = [];
  let remaining = 0; let confirmed = 0; let cleared = 0;
  const pending = [];
  const record = (name, g, k, gone, longest) => {
    count++; max = Math.max(max, longest);
    if (name === 'z' && cells.length < 2000) cells.push(k);
    if (where.length < 50) { const i = k % g.nu; const j = Math.floor(k / g.nu); const gi = gone.findIndex((v, q) => q % 2 === 0 && gone[q + 1] - v >= longest - 1e-9); where.push({ ray: name, u: g.u0 + (i + 0.5) * g.hu, v: g.v0 + (j + 0.5) * g.hv, from: gone[gi], to: gone[gi + 1] }); }
  };
  td.part ??= Object.fromEntries(Object.entries(td.grids).map(([k, g]) => [k, partRays(welded, g)]));
  for (const [name, g] of Object.entries(td.grids)) {
    const stockLen = name === 'z' ? [td.lo[2], td.hi[2]] : name === 'x' ? [td.lo[0], td.hi[0]] : [td.lo[1], td.hi[1]];
    const part = td.part[name];
    for (let k = 0; k < g.rays.length; k++) {
      const p = part[k];
      if (p.length) {
        // Part material within the stock that this ray no longer holds.
        const gone = minus(p, g.rays[k]);
        const lost = overlap(gone, stockLen);
        // How deep each lost piece reaches under the surface: its distance along the ray to the nearer end of the
        // part's interval, times the surface's steepness to the ray there (a ray grazing a surface sees a shallow
        // cut as a long one).
        let longest = 0;
        for (let i = 0; i < gone.length; i += 2) {
          const a0 = Math.max(gone[i], stockLen[0]); const a1 = Math.min(gone[i + 1], stockLen[1]);
          if (a1 <= a0) continue;
          let deep = 0;
          for (let q = 0; q < p.length; q += 2) {
            if (a1 <= p[q] || a0 >= p[q + 1]) continue;
            const lo = Math.max(a0, p[q]); const hi = Math.min(a1, p[q + 1]);
            const fromStart = (hi - p[q]) * (p.cos?.[q] ?? 1); const fromEnd = (p[q + 1] - lo) * (p.cos?.[q + 1] ?? 1);
            deep = Math.max(deep, Math.min(fromStart, fromEnd));
          }
          longest = Math.max(longest, deep);
        }
        // Confirmed against the surface itself: a ray running along a wall (a Z ray at a bore's edge) can lose
        // a long piece that is only a hair deep. The deepest of a few points of the lost pieces, by their
        // distance to the mesh.
        if (lost > tol && longest > tol && grid) longest = trueDepth(gone, stockLen, name, g, k, grid, longest);
        // On the B-rep (exact, not the mesh's chord tolerance), after this loop: the part's own interval along the
        // ray, what the ray lost of it, and how deep that is under the true surface.
        if (lost > tol && longest > tol) {
          if (exact) pending.push({ name, g, k, stockLen, gone, longest });
          else record(name, g, k, gone, longest);
        }
      }
      if (name === 'z') remaining += total(minus(g.rays[k], p)) * g.hu * g.hv;
    }
  }
  if (pending.length) {
    const at = (r, w) => { const i = r.k % r.g.nu; const j = Math.floor(r.k / r.g.nu); const u = r.g.u0 + (i + 0.5) * r.g.hu; const v = r.g.v0 + (j + 0.5) * r.g.hv; return r.name === 'z' ? [u, v, w] : r.name === 'x' ? [w, u, v] : [u, w, v]; };
    const axis = (r) => (r.name === 'z' ? 2 : r.name === 'x' ? 0 : 1);
    const ivs = exact.intervalsMany(pending.map((r) => ({ p0: at(r, r.stockLen[0] - 1), p1: at(r, r.stockLen[1] + 1), w: axis(r) })));
    pending.forEach((r, n) => {
      confirmed++;
      const part = ivs[n];
      if (!part) { record(r.name, r.g, r.k, r.gone, r.longest); return; }   // the kernel could not tell: the mesh's answer
      const gone = minus(part, r.g.rays[r.k]);
      let deep = 0;
      for (let q = 0; q < gone.length; q += 2) {
        const a = Math.max(gone[q], r.stockLen[0]); const b = Math.min(gone[q + 1], r.stockLen[1]);
        if (b - a <= 1e-9) continue;
        const m = Math.min(24, Math.max(2, Math.ceil((b - a) / 0.1)));
        for (let s = 0; s <= m; s++) { const d = exact.depth(at(r, a + ((b - a) * s) / m)); if (Number.isFinite(d)) deep = Math.max(deep, d); }
      }
      if (deep > tol) record(r.name, r.g, r.k, gone, deep); else cleared++;
    });
  }
  return { count, max, cells, remaining, where, exact: exact ? { confirmed, cleared } : null };
}

