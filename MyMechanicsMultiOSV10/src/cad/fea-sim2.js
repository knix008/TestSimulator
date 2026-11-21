// The later simulation studies, on the tetrahedral finite-element engine (cad/fem) and the lattice-Boltzmann
// flow solver (cad/cfd). This module keeps the study API the app and tests use and maps it onto the engines:
//
// nonlinearStatic(): total-Lagrangian large displacements, J2 plasticity with radial return and combined isotropic /
//   kinematic hardening, consistent tangent (quadratic Newton), load histories (unloading, cyclic loading) or the
//   arc-length method — see fem/nonlinear.js.
// dropTest(): explicit dynamics with floor contact (penalty with a stable stiffness and viscous damping, Coulomb
//   friction, rigid or elastic floor), optional plasticity and an energy balance — see fem/explicit.js.
// combineResults() / combinationStudy(): load-case combination (linear or SRSS) — see fem/combine.js.
// flowField(): external / internal flow, TRT / MRT / BGK collision with Smagorinsky LES, interpolated bounce-back,
//   heat transfer (conjugate), steady or transient — see cfd/lbm.js; flowSection(), streamlines(), pathlines(),
//   velocityAt() read its result.
//
// Units as in fea.js: mm, N, MPa, s; flow: m/s, Pa, N.
import { stressColor } from './fea.js';
import { nonlinearStudy, j2Update } from './fem/nonlinear.js';
import { dropStudy } from './fem/explicit.js';
import { combineResults as combineTet, combineStudy } from './fem/combine.js';
import { flowStudy, latticeRun, FLUIDS, CX, CY, CZ, W, OPP, sampleScalar } from './cfd/lbm.js';

export const D3Q19 = { CX, CY, CZ, W, OPP };
export { FLUIDS, latticeRun, j2Update };

/** Mesh options of the older API: resolution = elements along the longest side; elementSize / order / refine pass through. */
export const meshOptionsOf = (o = {}, order = 2) => ({ resolution: o.resolution ?? 16, size: o.elementSize ?? o.size ?? null, order: o.order ?? order, refine: o.refine ?? [] });

/** The rotation of the polar decomposition F = R U (3×3 row-major), by the scaled Newton iteration. */
export function polarRotation(F) {
  let R = Array.from(F);
  for (let it = 0; it < 30; it++) {
    const [a, b, c, d, e, f, g, h, i] = R;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (!(Math.abs(det) > 1e-300)) break;
    const inv = [(e * i - f * h) / det, -(d * i - f * g) / det, (d * h - e * g) / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
    let change = 0;
    R = R.map((x, k) => { const y = 0.5 * (x + inv[k]); change = Math.max(change, Math.abs(y - x)); return y; });
    if (change < 1e-13) break;
  }
  return R;
}

/**
 * Nonlinear static study of a part. options: { material: { E, nu, yield, tangentModulus (Et), isotropic, kinematic,
 * kinematicFraction (share of kinematic hardening, default 0.5), plastic }, fixtures, loads, resolution | elementSize,
 * order, steps, history (load factors), arcLength, geometric, maxNewton, tol, onProgress, cancel }.
 */
export function nonlinearStatic(mesh, opts = {}) {
  const { material, fixtures = [], loads = [], steps = 8, geometric = true, history = null, arcLength = null, maxNewton = 20, tol = 1e-6, onProgress = null, cancel = null } = opts;
  const r = nonlinearStudy({ bodies: [{ mesh, material }], fixtures, loads, mesh: meshOptionsOf(opts), steps, geometric, history, arcLength, maxNewton, tol, track: opts.track ?? null, onProgress, cancel });
  return r;
}

/**
 * Drop test of a part. options: { material, height, velocity, direction, resolution | elementSize, order (1 default),
 * duration, samples, gravity (mm/s²), floor: { type, E, thickness, friction, damping }, plastic, onProgress, cancel }.
 */
export function dropTest(mesh, opts = {}) {
  const { material, height = 1000, velocity = null, direction = [0, 0, -1], duration = null, samples = 160, gravity = 9810, floor = {}, plastic = true, onProgress = null, cancel = null } = opts;
  return dropStudy({ bodies: [{ mesh, material }], mesh: meshOptionsOf(opts, 1), height, velocity, direction, duration, samples, gravity, floor, plastic, frames: opts.frames ?? 24, onProgress, cancel });
}

/** Combination of solved static cases [{ result, factor }] — tet results (with .model). */
export function combineResults(mesh, { cases = [], method = 'linear' } = {}) {
  return combineTet(cases, method);
}

/** Solves each load case and combines them: cases [{ loads, factor, name }] (same fixtures). */
export function combinationStudy(mesh, { material, fixtures, cases, method = 'linear', onProgress = null, cancel = null, ...rest } = {}) {
  return combineStudy({ bodies: [{ mesh, material }], fixtures, cases, method, mesh: meshOptionsOf(rest), onProgress, cancel });
}

/**
 * Flow around / through a body mesh. options as cfd/lbm.js flowStudy (mode, axis, sign, velocity, fluid, cellSize |
 * resolution, collision, les, time, thermal, ...). Kept for the older callers.
 */
export function flowField(mesh, opts = {}) {
  return flowStudy(mesh, opts);
}

/** The lattice velocity at a world point (trilinear over the fluid cell centres; null outside / in solid). */
export function velocityAt(flow, p) {
  const { dims, origin, h, vel, solid } = flow;
  const c = [0, 1, 2].map((a) => (p[a] - origin[a]) / h - 0.5);
  const i0 = c.map(Math.floor);
  if (i0.some((v, a) => v < 0 || v + 1 >= dims[a])) return null;
  const out = [0, 0, 0];
  let wsum = 0;
  for (let b = 0; b < 8; b++) {
    const ii = [i0[0] + (b & 1), i0[1] + ((b >> 1) & 1), i0[2] + ((b >> 2) & 1)];
    const s = ii[0] + dims[0] * (ii[1] + dims[1] * ii[2]);
    if (solid[s]) continue;
    const w = [0, 1, 2].reduce((t, a) => t * ((b >> a) & 1 ? c[a] - i0[a] : 1 - (c[a] - i0[a])), 1);
    wsum += w;
    for (let a = 0; a < 3; a++) out[a] += w * vel[3 * s + a];
  }
  if (wsum < 0.25) return null;
  return out.map((v) => v / wsum);
}

/** Field value of one cell in physical units: velocity (m/s), pressure (Pa), temperature (°C), vorticity (1/s). */
function cellValue(flow, quantity) {
  const { vel, rho, temp, dims, solid, h } = flow;
  const scaleV = flow.velocity / flow.uLat, q = flow.fluid.density * scaleV * scaleV;
  if (quantity === 'pressure') return (s) => ((rho[s] - 1) / 3) * q;
  if (quantity === 'temperature') return (s) => (temp ? temp[s] : 0);
  if (quantity === 'vorticity') {
    const [nx, ny] = dims, dx = h / 1000;
    const u = (s, a) => (s >= 0 && s < solid.length && !solid[s] ? vel[3 * s + a] * scaleV : 0);
    return (s) => {
      const sx = 1, sy = nx, sz = nx * ny;
      const d = (a, step) => (u(s + step, a) - u(s - step, a)) / (2 * dx);
      const wx = d(2, sy) - d(1, sz), wy = d(0, sz) - d(2, sx), wz = d(1, sx) - d(0, sy);
      return Math.hypot(wx, wy, wz);
    };
  }
  return (s) => Math.hypot(vel[3 * s], vel[3 * s + 1], vel[3 * s + 2]) * scaleV;
}

/**
 * A section plane through the flow domain, coloured by velocity, pressure, temperature or vorticity: { mesh, colors, min,
 * max, quantity, normalAxis, index } in world units. normalAxis 0/1/2, at (world coordinate; default the middle).
 */
export function flowSection(flow, { normalAxis = 1, at = null, quantity = 'velocity' } = {}) {
  const { dims, origin, h, solid } = flow;
  const [a1, a2] = [0, 1, 2].filter((a) => a !== normalAxis);
  const mid = at == null ? Math.floor(dims[normalAxis] / 2) : Math.min(dims[normalAxis] - 1, Math.max(0, Math.round((at - origin[normalAxis]) / h - 0.5)));
  const n1 = dims[a1], n2 = dims[a2], value = cellValue(flow, quantity);
  const cell = new Float64Array(n1 * n2), inSolid = new Uint8Array(n1 * n2);
  let min = Infinity, max = -Infinity;
  for (let q2 = 0; q2 < n2; q2++) for (let q1 = 0; q1 < n1; q1++) {
    const c = [0, 0, 0]; c[normalAxis] = mid; c[a1] = q1; c[a2] = q2;
    const s = c[0] + dims[0] * (c[1] + dims[1] * c[2]);
    inSolid[q1 + n1 * q2] = solid[s] && quantity !== 'temperature' ? 1 : 0;
    if (inSolid[q1 + n1 * q2]) continue;
    const v = value(s);
    cell[q1 + n1 * q2] = v;
    min = Math.min(min, v); max = Math.max(max, v);
  }
  if (!Number.isFinite(min)) { min = 0; max = 1; }
  const vertices = [], normals = [], triangles = [], colors = [];
  const nrm = [0, 0, 0]; nrm[normalAxis] = 1;
  const pos = origin[normalAxis] + (mid + 0.5) * h;
  for (let q2 = 0; q2 < n2; q2++) for (let q1 = 0; q1 < n1; q1++) {
    const k = q1 + n1 * q2;
    if (inSolid[k]) continue;
    const base = vertices.length / 3;
    for (const [d1, d2] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = [0, 0, 0]; p[normalAxis] = pos; p[a1] = origin[a1] + (q1 + d1) * h; p[a2] = origin[a2] + (q2 + d2) * h;
      vertices.push(...p); normals.push(...nrm);
      colors.push(...stressColor(cell[k], min, max));
    }
    triangles.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { mesh: { vertices: Float32Array.from(vertices), normals: Float32Array.from(normals), triangles: Uint32Array.from(triangles), faceGroups: [] }, colors: Float32Array.from(colors), min, max, quantity, normalAxis, index: mid };
}

/** Streamlines from seeds spread over the inlet: segments [x,y,z, x,y,z, …] (world) and per-segment speed (m/s). */
export function streamlines(flow, { count = 7, maxSteps = 800, seeds = null } = {}) {
  const { dims, origin, h, flowAxis: fa, flowSign: sign } = flow;
  const [a1, a2] = [0, 1, 2].filter((a) => a !== fa);
  const list = seeds ?? [];
  if (!seeds) {
    const start = sign > 0 ? origin[fa] + 1.6 * h : origin[fa] + (dims[fa] - 1.6) * h;
    for (let p = 1; p <= count; p++) for (let q = 1; q <= count; q++) {
      const s = [0, 0, 0]; s[fa] = start;
      s[a1] = origin[a1] + (dims[a1] * h * p) / (count + 1);
      s[a2] = origin[a2] + (dims[a2] * h * q) / (count + 1);
      list.push(s);
    }
  }
  const segments = [], speed = [], scaleV = flow.velocity / flow.uLat;
  const step = 0.5 * h;
  for (const seed of list) {
    let p = seed.slice();
    for (let n = 0; n < maxSteps; n++) {
      const v1 = velocityAt(flow, p);
      if (!v1) break;
      const m1 = Math.hypot(...v1);
      if (m1 < 1e-6) break;
      const mid = p.map((x, a) => x + (0.5 * step * v1[a]) / m1);
      const v2 = velocityAt(flow, mid) ?? v1;
      const m2 = Math.hypot(...v2) || m1;
      const q = p.map((x, a) => x + (step * v2[a]) / m2);
      segments.push(...p, ...q); speed.push(m2 * scaleV);
      p = q;
    }
  }
  return { segments, speed };
}

/**
 * Particle trajectories: massless tracers released at the seeds and carried for `duration` seconds of physical time
 * (RK2 in the velocity field, m/s → mm/s). Returns { paths: [[x,y,z,t], …] per seed }.
 */
export function pathlines(flow, { seeds = null, count = 5, duration = null, dt = null } = {}) {
  const { dims, origin, h, flowAxis: fa, flowSign: sign } = flow;
  const scaleV = (flow.velocity / flow.uLat) * 1000;        // lattice velocity → mm/s
  const T = duration ?? (dims[fa] * h) / (flow.velocity * 1000) * 1.5;
  const step = dt ?? (0.4 * h) / (flow.velocity * 1000);
  const list = seeds ?? [];
  if (!seeds) {
    const [a1, a2] = [0, 1, 2].filter((a) => a !== fa);
    const start = sign > 0 ? origin[fa] + 1.6 * h : origin[fa] + (dims[fa] - 1.6) * h;
    for (let p = 1; p <= count; p++) { const s = [0, 0, 0]; s[fa] = start; s[a1] = origin[a1] + (dims[a1] * h * p) / (count + 1); s[a2] = origin[a2] + (dims[a2] * h) / 2; list.push(s); }
  }
  return {
    paths: list.map((seed) => {
      const out = [[...seed, 0]];
      let p = seed.slice();
      for (let t = 0; t < T; t += step) {
        const v1 = velocityAt(flow, p); if (!v1) break;
        const mid = p.map((x, a) => x + 0.5 * step * v1[a] * scaleV);
        const v2 = velocityAt(flow, mid) ?? v1;
        p = p.map((x, a) => x + step * v2[a] * scaleV);
        out.push([...p, t + step]);
      }
      return out;
    }),
  };
}

/** Pressure (Pa) at a world point of a flow result. */
export function pressureAt(flow, p) {
  const scaleV = flow.velocity / flow.uLat, q = flow.fluid.density * scaleV * scaleV;
  return sampleScalar(flow, p, (s) => ((flow.rho[s] - 1) / 3) * q);
}

export { stressColor };
