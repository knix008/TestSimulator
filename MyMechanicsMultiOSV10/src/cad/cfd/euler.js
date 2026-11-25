// Compressible flow (no DOM): the Euler equations of an ideal gas on the voxel grid of the flow study — for high-speed
// gas flow where the lattice Boltzmann solver (weakly compressible, Ma < 0.3) does not hold: shocks, expansion,
// stagnation heating.
//
// Cell-centred finite volumes of U = (ρ, ρu, ρv, ρw, E), HLL fluxes from MUSCL-reconstructed face states (minmod
// limiter on the primitive variables), two-stage Runge–Kutta (Heun) in time at a CFL number. Solid cells are slip
// walls (each face to a solid cell sees the mirrored state: the normal velocity reversed). Boundaries: the inlet and
// the lateral sides take the free stream (Ma, p, T along the flow axis); the outlet is zero-gradient (supersonic) or
// held at the free-stream pressure (subsonic).
//
//   eulerRun({ dims, h (m), solid, init (cell → [ρ, u, v, w, p]), bc: { axis, sign, inflow [ρ, u, v, w, p] | null,
//              outflow 'extrapolate' | 'pressure', p }, gamma, tEnd | steps, cfl, order }) → { U, rho, vel, p, steps, t }
//   compressibleStudy(mesh, { mach, pressure (Pa), temperature (K), axis, sign, resolution, domain, gamma, R })
//     → a flow result (as flowStudy's, for the section / probes) with p, T, mach per cell, drag (N), dragCoefficient,
//       maxMach, stagnationPressure (Pa, at the body's front), shock (bool: a pressure rise > 20 % ahead of the body).
import { surfaceModel } from '../fem/mesh.js';
import { voxelize } from './lbm.js';

const minmod = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);

/** Primitive [ρ, u, v, w, p] → conserved. */
const cons = (q, g) => [q[0], q[0] * q[1], q[0] * q[2], q[0] * q[3], q[4] / (g - 1) + 0.5 * q[0] * (q[1] ** 2 + q[2] ** 2 + q[3] ** 2)];

/** HLL flux along axis a between primitive states L and R. */
function hll(L, R, a, g, out) {
  const fl = (q, F) => {
    const r = q[0], u = [q[1], q[2], q[3]], p = q[4], un = u[a], E = p / (g - 1) + 0.5 * r * (u[0] ** 2 + u[1] ** 2 + u[2] ** 2);
    F[0] = r * un; F[1] = r * un * u[0]; F[2] = r * un * u[1]; F[3] = r * un * u[2]; F[a + 1] += p; F[4] = (E + p) * un;
    return E;
  };
  const FL = [0, 0, 0, 0, 0], FR = [0, 0, 0, 0, 0];
  const EL = fl(L, FL), ER = fl(R, FR);
  const cL = Math.sqrt(Math.max(1e-12, (g * L[4]) / L[0])), cR = Math.sqrt(Math.max(1e-12, (g * R[4]) / R[0]));
  const sL = Math.min(L[a + 1] - cL, R[a + 1] - cR), sR = Math.max(L[a + 1] + cL, R[a + 1] + cR);
  const UL = [L[0], L[0] * L[1], L[0] * L[2], L[0] * L[3], EL], UR = [R[0], R[0] * R[1], R[0] * R[2], R[0] * R[3], ER];
  for (let k = 0; k < 5; k++) out[k] = sL >= 0 ? FL[k] : sR <= 0 ? FR[k] : (sR * FL[k] - sL * FR[k] + sL * sR * (UR[k] - UL[k])) / (sR - sL);
  return Math.max(Math.abs(sL), Math.abs(sR));
}

export function eulerRun({ dims, h, solid = null, init, bc = {}, gamma = 1.4, tEnd = null, steps = 2000, cfl = 0.45, order = 2, onProgress = null, tol = 0 }) {
  const [nx, ny, nz] = dims, N = nx * ny * nz, g = gamma;
  const isSolid = (s) => solid && solid[s];
  const U = new Float64Array(5 * N), U0 = new Float64Array(5 * N), R1 = new Float64Array(5 * N);
  for (let s = 0; s < N; s++) { const c = cons(init(s), g); for (let k = 0; k < 5; k++) U[5 * s + k] = c[k]; }
  const prim = (Ua, s) => { const r = Math.max(1e-9, Ua[5 * s]), u = Ua[5 * s + 1] / r, v = Ua[5 * s + 2] / r, w = Ua[5 * s + 3] / r; return [r, u, v, w, Math.max(1e-9, (g - 1) * (Ua[5 * s + 4] - 0.5 * r * (u * u + v * v + w * w)))]; };
  const ax = bc.axis ?? 0, sign = bc.sign ?? 1;
  const ghost = (Ua, s, a, side) => {
    // The state beyond the domain face `side` (−1 / +1) of cell s along axis a.
    const q = prim(Ua, s);
    if (a === ax) {
      const inletSide = sign > 0 ? -1 : 1;
      if (side === inletSide && bc.inflow) return bc.inflow.slice();
      if (side !== inletSide && bc.outflow === 'pressure') { const c = Math.sqrt((g * q[4]) / q[0]); if (Math.abs(q[a + 1]) < c) { q[4] = bc.p; } }
      return q;
    }
    return bc.lateral === 'wall' ? (q[a + 1] = -q[a + 1], q) : bc.inflow && bc.lateral !== 'extrapolate' ? bc.inflow.slice() : q;
  };
  const step = [1, nx, nx * ny];
  const coord = (s) => [s % nx, Math.floor(s / nx) % ny, Math.floor(s / (nx * ny))];
  // Residual: −Σ faces F·n / h.
  const residual = (Ua, Rout) => {
    Rout.fill(0);
    let smax = 1e-12;
    const P = new Float64Array(5 * N);
    for (let s = 0; s < N; s++) if (!isSolid(s)) { const q = prim(Ua, s); for (let k = 0; k < 5; k++) P[5 * s + k] = q[k]; }
    const qAt = (s) => [P[5 * s], P[5 * s + 1], P[5 * s + 2], P[5 * s + 3], P[5 * s + 4]];
    const F = [0, 0, 0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (dims[a] === 1 && a !== ax) continue;
      const st = step[a];
      for (let s = 0; s < N; s++) {
        if (isSolid(s)) continue;
        const c = coord(s);
        // The face on the + side of s (and the domain face on the − side for the first cell).
        // Its + face, and its − face when that is a domain face or a wall (a solid cell is never visited itself).
        const faces = c[a] === 0 || isSolid(s - st) ? [-1, 1] : [1];
        for (const side of faces) {
          const nbIn = c[a] + side >= 0 && c[a] + side < dims[a];
          const t = nbIn ? s + side * st : -1;
          let qL, qR;
          const me = qAt(s);
          let other;
          if (!nbIn) other = ghost(Ua, s, a, side);
          else if (isSolid(t)) { other = me.slice(); other[a + 1] = -other[a + 1]; }
          else other = qAt(t);
          // MUSCL: slopes from the next cells on each side (first order at walls / domain faces).
          if (order === 2 && nbIn && !isSolid(t)) {
            const sm = s - side * st, tp = t + side * st, cm = c[a] - side, cp = c[a] + 2 * side;
            const okM = cm >= 0 && cm < dims[a] && !isSolid(sm), okP = cp >= 0 && cp < dims[a] && !isSolid(tp);
            const qm = okM ? qAt(sm) : me, qp = okP ? qAt(tp) : other;
            const a1 = me.map((v, k) => v + 0.5 * minmod(other[k] - v, v - qm[k]));
            const b1 = other.map((v, k) => v - 0.5 * minmod(v - me[k], qp[k] - v));
            if (a1[0] > 0 && a1[4] > 0 && b1[0] > 0 && b1[4] > 0) { qL = side > 0 ? a1 : b1; qR = side > 0 ? b1 : a1; }
          }
          if (!qL) { qL = side > 0 ? me : other; qR = side > 0 ? other : me; }
          smax = Math.max(smax, hll(qL, qR, a, g, F));
          // F flows from the − cell to the + cell.
          for (let k = 0; k < 5; k++) {
            if (side > 0) { Rout[5 * s + k] -= F[k] / h; if (nbIn && !isSolid(t)) Rout[5 * t + k] += F[k] / h; }
            else Rout[5 * s + k] += F[k] / h;
          }
        }
      }
    }
    return smax;
  };
  let t = 0, n = 0, change = Infinity;
  const total = tEnd ?? Infinity;
  for (; n < steps && t < total - 1e-15; n++) {
    U0.set(U);
    const smax = residual(U, R1);
    let dt = (cfl * h) / smax;
    if (tEnd != null) dt = Math.min(dt, tEnd - t);
    for (let i = 0; i < 5 * N; i++) U[i] = U0[i] + dt * R1[i];
    residual(U, R1);
    let d = 0, ref = 0;
    for (let i = 0; i < 5 * N; i++) { const nv = 0.5 * (U0[i] + U[i] + dt * R1[i]); d += Math.abs(nv - U0[i]); ref += Math.abs(U0[i]); U[i] = nv; }
    t += dt; change = d / Math.max(1e-30, ref);
    if (onProgress && n % 50 === 0) onProgress(tEnd ? t / tEnd : n / steps);
    if (tol > 0 && n > 50 && change < tol * dt / Math.max(1e-30, h)) { n++; break; }
  }
  const rho = new Float64Array(N), vel = new Float64Array(3 * N), p = new Float64Array(N);
  for (let s = 0; s < N; s++) { if (isSolid(s)) continue; const q = prim(U, s); rho[s] = q[0]; vel[3 * s] = q[1]; vel[3 * s + 1] = q[2]; vel[3 * s + 2] = q[3]; p[s] = q[4]; }
  return { U, rho, vel, p, steps: n, t, change };
}

/** The exact Riemann (Sod) solution's density at x/t (for the checks): left / right states [ρ, u, p]. */
export function riemannDensity(L, R, xt, g = 1.4) {
  const [rl, ul, pl] = L, [rr, ur, pr] = R, cl = Math.sqrt((g * pl) / rl), cr = Math.sqrt((g * pr) / rr);
  const fK = (p, r, pk, ck) => (p > pk ? (p - pk) * Math.sqrt(2 / ((g + 1) * r) / (p + ((g - 1) / (g + 1)) * pk)) : ((2 * ck) / (g - 1)) * ((p / pk) ** ((g - 1) / (2 * g)) - 1));
  let lo = 1e-9, hi = Math.max(pl, pr) * 10;
  for (let i = 0; i < 200; i++) { const m = 0.5 * (lo + hi); if (fK(m, rl, pl, cl) + fK(m, rr, pr, cr) + ur - ul > 0) hi = m; else lo = m; }
  const ps = 0.5 * (lo + hi), us = 0.5 * (ul + ur) + 0.5 * (fK(ps, rr, pr, cr) - fK(ps, rl, pl, cl));
  if (xt < us) {
    if (ps > pl) { const sl = ul - cl * Math.sqrt(((g + 1) / (2 * g)) * (ps / pl) + (g - 1) / (2 * g)); return xt < sl ? rl : rl * ((ps / pl + (g - 1) / (g + 1)) / (((g - 1) / (g + 1)) * (ps / pl) + 1)); }
    const csl = cl * (ps / pl) ** ((g - 1) / (2 * g)), shl = ul - cl, stl = us - csl;
    if (xt < shl) return rl; if (xt > stl) return rl * (ps / pl) ** (1 / g);
    return rl * ((2 / (g + 1) + ((g - 1) / ((g + 1) * cl)) * (ul - xt)) ** (2 / (g - 1)));
  }
  if (ps > pr) { const sr = ur + cr * Math.sqrt(((g + 1) / (2 * g)) * (ps / pr) + (g - 1) / (2 * g)); return xt > sr ? rr : rr * ((ps / pr + (g - 1) / (g + 1)) / (((g - 1) / (g + 1)) * (ps / pr) + 1)); }
  const csr = cr * (ps / pr) ** ((g - 1) / (2 * g)), shr = ur + cr, str = us + csr;
  if (xt > shr) return rr; if (xt < str) return rr * (ps / pr) ** (1 / g);
  return rr * ((2 / (g + 1) - ((g - 1) / ((g + 1) * cr)) * (ur - xt)) ** (2 / (g - 1)));
}

/** Rayleigh pitot: the stagnation pressure behind a normal shock over the free-stream static pressure (M ≥ 1). */
export function pitotRatio(M, g = 1.4) {
  if (M < 1) return (1 + ((g - 1) / 2) * M * M) ** (g / (g - 1));
  return (((g + 1) / 2) * M * M) ** (g / (g - 1)) * ((g + 1) / (2 * g * M * M - (g - 1))) ** (1 / (g - 1));
}

export function compressibleStudy(mesh, { mach = 2, pressure = 101325, temperature = 288.15, axis = 'x', sign = 1, resolution = 24, domain = {}, gamma = 1.4, R = 287.05, steps = 1500, onProgress = null } = {}) {
  const S = surfaceModel(mesh);
  if (!(S.volume > 0)) return { ok: false, error: 'empty' };
  const fa = { x: 0, y: 1, z: 2 }[axis] ?? 0, lateral = [0, 1, 2].filter((a) => a !== fa);
  const ext = [0, 1, 2].map((a) => S.hi[a] - S.lo[a]), across = Math.max(...lateral.map((a) => ext[a]));
  const h = across / Math.max(6, resolution);
  const Lm = Math.max(across, 0.25 * Math.max(...ext));
  const up = (domain.upstream ?? 1) * Lm, down = (domain.downstream ?? 1.5) * Lm, side = (domain.lateral ?? 1) * Lm;
  const lo = S.lo.map((v, a) => v - (a === fa ? (sign > 0 ? up : down) : side)), hi = S.hi.map((v, a) => v + (a === fa ? (sign > 0 ? down : up) : side));
  const dims = [0, 1, 2].map((a) => Math.max(3, Math.ceil((hi[a] - lo[a]) / h)));
  if (dims[0] * dims[1] * dims[2] > 4e5) return { ok: false, error: 'too-large' };
  const solid = voxelize(S, lo, h, dims);
  const rho0 = pressure / (R * temperature), c0 = Math.sqrt((gamma * pressure) / rho0), U0 = mach * c0;
  const free = [rho0, 0, 0, 0, pressure]; free[fa + 1] = sign * U0;
  const r = eulerRun({ dims, h: h / 1000, solid, init: () => free.slice(), bc: { axis: fa, sign, inflow: free, outflow: mach >= 1 ? 'extrapolate' : 'pressure', p: pressure, lateral: 'farfield' }, gamma, steps, onProgress, tol: 1e-5 });
  const N = dims[0] * dims[1] * dims[2];
  const T = new Float64Array(N), M = new Float64Array(N);
  let maxMach = 0;
  for (let s = 0; s < N; s++) { if (solid[s]) continue; T[s] = r.p[s] / (R * r.rho[s]); const c = Math.sqrt((gamma * r.p[s]) / r.rho[s]); M[s] = Math.hypot(r.vel[3 * s], r.vel[3 * s + 1], r.vel[3 * s + 2]) / c; maxMach = Math.max(maxMach, M[s]); }
  // Pressure force on the body: Σ over fluid–solid faces of p · area along the face normal (out of the fluid).
  const st = [1, dims[0], dims[0] * dims[1]], A = (h / 1000) ** 2, force = [0, 0, 0];
  let front = 0, frontN = 0;
  for (let s = 0; s < N; s++) {
    if (solid[s]) continue;
    const c = [s % dims[0], Math.floor(s / dims[0]) % dims[1], Math.floor(s / (dims[0] * dims[1]))];
    for (let a = 0; a < 3; a++) for (const d of [-1, 1]) {
      const k = c[a] + d; if (k < 0 || k >= dims[a]) continue;
      const t = s + d * st[a];
      if (!solid[t]) continue;
      force[a] += d * (r.p[s] - pressure) * A;
      if (a === fa && d === sign) { front = Math.max(front, r.p[s]); frontN++; }
    }
  }
  // Shock ahead of the body: the pressure rises by more than 20 % somewhere upstream of it.
  let shock = false;                                      // (a subsonic free stream has no bow shock)
  for (let s = 0; s < N && !shock && mach >= 1; s++) if (!solid[s] && r.p[s] > 1.2 * pressure) { const c = [s % dims[0], Math.floor(s / dims[0]) % dims[1], Math.floor(s / (dims[0] * dims[1]))]; if ((c[fa] * h + lo[fa]) * sign < S.lo[fa] * sign - h) shock = true; }
  const frontal = lateral.reduce((s, a) => s * ext[a], 1) * 1e-6;
  const drag = force[fa] * sign;
  const vLat = new Float32Array(3 * N); for (let i = 0; i < 3 * N; i++) vLat[i] = r.vel[i];
  return {
    ok: true, compressible: true, dims, origin: lo, h, solid, vel: vLat, rho: Float32Array.from(r.rho), p: r.p, T, mach: M, pInf: pressure,
    flowAxis: fa, flowSign: sign, velocity: U0, uLat: U0, fluid: { density: rho0, viscosity: 0 }, freeStream: { mach, pressure, temperature, density: rho0, velocity: U0, sound: c0 },
    drag, force, dragCoefficient: drag / (0.5 * rho0 * U0 * U0 * frontal), maxMach, stagnationPressure: front, shock, steps: r.steps, converged: r.change < 1e-3,
    // The flow study page's names.
    dragForce: drag, liftForce: force[lateral[lateral.length - 1]], sideForce: force[lateral[0]], frontalArea: frontal * 1e6, pressureDrop: 0, reynolds: Infinity, collision: 'euler', les: 0,
    maxVelocity: (() => { let m = 0; for (let s = 0; s < N; s++) m = Math.max(m, Math.hypot(r.vel[3 * s], r.vel[3 * s + 1], r.vel[3 * s + 2])); return m; })(),
    pitot: pitotRatio(mach, gamma) * pressure,
  };
}
