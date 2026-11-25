// Particle study (no DOM): solid particles (sand, droplets, dust) carried by a computed flow (cfd/lbm.js result),
// their trajectories, where they hit the walls and the erosion they cause.
//
// Each particle (diameter d, density ρp) follows the frozen flow field u (trilinear over the fluid cells):
//   dv/dt = (u − v) / τ · f(Re_p) + g (1 − ρf/ρp),   τ = ρp d² / (18 μ),   f = 1 + 0.15 Re_p^0.687 (Schiller–Naumann,
//   Re_p = ρf |u − v| d / μ < 1000; above it Cd = 0.44), integrated exactly over each step for the drag part (stable
//   for tiny particles whose τ is far below the flow's time scale).
// A step ending in a solid cell is a wall impact: the wall normal from the solid cells around (the gradient of the
// solid fraction), the velocity reflected with restitutions e_n (normal) and e_t (tangential), and the impact
// erodes the wall (Finnie / Oka-type): ΔE = K · m · |v|^n · f(α) kg removed per particle mass m, with the impact
// angle α to the surface and the ductile angle function f(α) = sin 2α − 3 sin²α (α ≤ 18.4°) else cos² α / 3
// (K = 2e-9, n = 2.6 for steel by sand, by default). A particle leaving through the outlet escapes; one leaving the
// domain elsewhere is lost; one slower than 1 % of the inlet speed for a while, or past maxTime, is trapped.
//
//   Particles start at the inlet moving with its mean speed U along the flow.
//   particleStudy(flow, { diameter (µm), density (kg/m³), count, seeds, massFlow (kg/s of particles), gravity
//                         (m/s², vector), restitution: { normal, tangent }, erosion: { K, n }, maxTime (s) })
//   → { paths: [[x, y, z, t, speed] …] (mm, s, m/s), fates: { escaped, trapped, lost }, impacts: [{ p, speed,
//       angle, cell }], erosion: Float64Array per cell (kg/s), maxErosion, erosionAt (mm of the worst cell),
//       stokes (number), relaxation (s) }
import { CX, CY, CZ } from './lbm.js';

const len = (a) => Math.hypot(a[0], a[1], a[2]);
void CX; void CY; void CZ;

/** Fluid velocity (m/s) at a point (mm); null in solid / outside. */
function velocity(flow, p) {
  const { dims, origin, h, vel, solid } = flow, k = flow.velocity / flow.uLat;
  const c = [0, 1, 2].map((a) => (p[a] - origin[a]) / h - 0.5);
  const i0 = c.map(Math.floor);
  if (i0.some((v, a) => v < 0 || v + 1 >= dims[a])) return null;
  const out = [0, 0, 0]; let ws = 0;
  for (let b = 0; b < 8; b++) {
    const ii = [i0[0] + (b & 1), i0[1] + ((b >> 1) & 1), i0[2] + ((b >> 2) & 1)];
    const s = ii[0] + dims[0] * (ii[1] + dims[1] * ii[2]);
    if (solid[s]) continue;
    const w = [0, 1, 2].reduce((t, a) => t * ((b >> a) & 1 ? c[a] - i0[a] : 1 - (c[a] - i0[a])), 1);
    ws += w; for (let a = 0; a < 3; a++) out[a] += w * vel[3 * s + a];
  }
  if (ws < 1e-6) return [0, 0, 0];
  return out.map((v) => (v / ws) * k);
}
const cellOf = (flow, p) => { const i = [0, 1, 2].map((a) => Math.floor((p[a] - flow.origin[a]) / flow.h)); if (i.some((v, a) => v < 0 || v >= flow.dims[a])) return -1; return i[0] + flow.dims[0] * (i[1] + flow.dims[1] * i[2]); };
/** Outward wall normal at a solid cell (pointing into the fluid): minus the gradient of the solid mask. */
function wallNormal(flow, s) {
  const { dims, solid } = flow, nx = dims[0], ny = dims[1];
  const i = s % nx, j = Math.floor(s / nx) % ny, k = Math.floor(s / (nx * ny));
  const at = (a, b, c) => (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= dims[2] ? 1 : solid[a + nx * (b + ny * c)] ? 1 : 0);
  const g = [0, 0, 0];
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) { const v = at(i + di, j + dj, k + dk); g[0] += di * v; g[1] += dj * v; g[2] += dk * v; }
  const l = len(g); return l > 1e-12 ? g.map((v) => -v / l) : [0, 0, 1];
}
/** Finnie-type ductile erosion angle function (α in radians, to the surface). */
export const erosionAngle = (a) => (a <= Math.atan(1 / 3) ? Math.sin(2 * a) - 3 * Math.sin(a) ** 2 : Math.cos(a) ** 2 / 3);

export function particleStudy(flow, { diameter = 200, density = 2650, count = 50, seeds = null, massFlow = 0.01, gravity = [0, 0, -9.81], restitution = { normal: 0.6, tangent: 0.9 }, erosion = { K: 2e-9, n: 2.6 }, maxTime = null } = {}) {
  if (!flow?.vel) return { ok: false, error: 'no-flow' };
  const { dims, origin, h, flowAxis: fa = 0, flowSign: sign = 1 } = flow;
  const rhoF = flow.fluid?.density ?? 1.2, mu = (flow.fluid?.viscosity ?? 1.5e-5) * rhoF;
  const d = diameter * 1e-6, rhoP = density, tau = (rhoP * d * d) / (18 * mu), mP = rhoP * Math.PI * d ** 3 / 6;
  const U = flow.velocity, L = dims[fa] * h * 1e-3;
  const T = maxTime ?? (3 * L) / Math.max(1e-6, U);
  // Seeds: a grid over the inlet face (fluid cells), unless given.
  let list = seeds;
  if (!list) {
    const [a1, a2] = [0, 1, 2].filter((a) => a !== fa);
    const start = sign > 0 ? origin[fa] + 1.5 * h : origin[fa] + (dims[fa] - 1.5) * h;
    const m = Math.max(1, Math.round(Math.sqrt(count)));
    list = [];
    for (let p = 0; p < m; p++) for (let q = 0; q < m; q++) {
      const s = [0, 0, 0]; s[fa] = start; s[a1] = origin[a1] + (dims[a1] * h * (p + 0.5)) / m; s[a2] = origin[a2] + (dims[a2] * h * (q + 0.5)) / m;
      const c = cellOf(flow, s); if (c >= 0 && !flow.solid[c]) list.push(s);
    }
  }
  const erosionMap = new Float64Array(dims[0] * dims[1] * dims[2]);
  const rate = massFlow / Math.max(1, list.length);      // kg/s carried by each tracked particle
  const fates = { escaped: 0, trapped: 0, lost: 0 }, impacts = [], paths = [];
  const g = gravity.map((v) => v * (1 - rhoF / rhoP));
  for (const seed of list) {
    let p = seed.slice();                                // mm
    // Injected with the inlet's mean stream (not the local, possibly unsteady, cell velocity).
    let v = [0, 0, 0]; v[fa] = sign * U;
    const path = [[...p, 0, len(v)]];
    let t = 0, slow = 0, fate = 'trapped';
    // Steps: a fraction of a cell at the local speed, and at most a few relaxation times.
    for (let n = 0; n < 20000 && t < T; n++) {
      const u = velocity(flow, p);
      if (!u) { const out = p[fa] - origin[fa]; fate = (sign > 0 ? out >= dims[fa] * h - 1.5 * h : out <= 1.5 * h) ? 'escaped' : 'lost'; break; }
      const sp = Math.max(len(v), len(u), 1e-3);
      const dt = Math.min((0.3 * h * 1e-3) / sp, Math.max(tau, 1e-7) * 2, T - t + 1e-9);
      const rel = [u[0] - v[0], u[1] - v[1], u[2] - v[2]], Re = (rhoF * len(rel) * d) / mu;
      const f = Re < 1000 ? 1 + 0.15 * Re ** 0.687 : (0.44 * Re) / 24;
      const te = tau / f, e = Math.exp(-dt / te);
      // Exact drag relaxation towards u (plus gravity's terminal drift) over the step.
      const vNew = [0, 1, 2].map((a) => u[a] + g[a] * te + (v[a] - u[a] - g[a] * te) * e);
      const pNew = [0, 1, 2].map((a) => p[a] + 0.5 * (v[a] + vNew[a]) * dt * 1000);
      const cell = cellOf(flow, pNew);
      if (cell >= 0 && flow.solid[cell]) {
        // Wall impact: reflect, erode, stay where it was.
        const nrm = wallNormal(flow, cell), vn = vNew[0] * nrm[0] + vNew[1] * nrm[1] + vNew[2] * nrm[2];
        if (vn < 0) {
          const speed = len(vNew), angle = Math.asin(Math.min(1, -vn / Math.max(1e-12, speed)));
          const loss = erosion.K * speed ** erosion.n * erosionAngle(angle);       // kg per kg of particles
          erosionMap[cell] += loss * rate;
          if (impacts.length < 5000) impacts.push({ p: pNew.slice(), speed, angle: (angle * 180) / Math.PI, cell });
          const vt = vNew.map((x, a) => x - vn * nrm[a]);
          v = vt.map((x, a) => restitution.tangent * x - restitution.normal * vn * nrm[a]);
        } else v = vNew;
        t += dt;
        continue;
      }
      p = pNew; v = vNew; t += dt;
      if (n % 4 === 0) path.push([...p, t, len(v)]);
      slow = len(v) < 0.01 * U ? slow + dt : 0;
      if (slow > 0.1 * T) { fate = 'trapped'; break; }
    }
    path.push([...p, t, len(v)]);
    paths.push(path);
    fates[fate]++;
  }
  let maxErosion = 0, at = -1;
  for (let s = 0; s < erosionMap.length; s++) if (erosionMap[s] > maxErosion) { maxErosion = erosionMap[s]; at = s; }
  const nx = dims[0], ny = dims[1];
  const erosionAt = at >= 0 ? [origin[0] + ((at % nx) + 0.5) * h, origin[1] + ((Math.floor(at / nx) % ny) + 0.5) * h, origin[2] + (Math.floor(at / (nx * ny)) + 0.5) * h] : null;
  return {
    ok: true, paths, fates, impacts, erosion: erosionMap, maxErosion, erosionAt, totalErosion: erosionMap.reduce((s, x) => s + x, 0),
    relaxation: tau, stokes: (tau * U) / Math.max(1e-9, L), particleMass: mP, tracked: list.length,
  };
}

/** Erosion (kg/s per cell) at a body's vertices: each vertex takes the largest of the solid cells next to it. */
export function erosionAtVertices(flow, result, vertices) {
  const out = new Float32Array(vertices.length / 3);
  for (let v = 0; v < out.length; v++) {
    const p = [vertices[3 * v], vertices[3 * v + 1], vertices[3 * v + 2]];
    let best = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const c = cellOf(flow, [p[0] + dx * flow.h * 0.6, p[1] + dy * flow.h * 0.6, p[2] + dz * flow.h * 0.6]);
      if (c >= 0) best = Math.max(best, result.erosion[c]);
    }
    out[v] = best;
  }
  return out;
}
