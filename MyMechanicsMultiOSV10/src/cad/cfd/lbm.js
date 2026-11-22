// Lattice-Boltzmann flow (no kernel, no DOM): D3Q19 for the flow, D3Q7 for heat.
//
// Collision: TRT (two relaxation times, Λ = 3/16 — the bounce-back wall then sits exactly half-way, which makes
// channel profiles exact), BGK, or MRT (d'Humières' moment set, orthogonalised here, with his relaxation rates).
// Turbulence: Smagorinsky large-eddy model on top (the local relaxation time grows with the resolved strain,
// computed from the non-equilibrium stress, τ = ½(τ₀ + √(τ₀² + 18√2 C_s² |Π|/ρ))), so the physical Reynolds number is
// simulated on the chosen grid instead of being lowered.
// Walls: interpolated bounce-back (Bouzidi–Firdaouss–Lallemand) with the wall distance along each link, so curved
// bodies are second-order accurate; plain half-way bounce-back where the interpolation has no fluid neighbour.
// Forces on the body by momentum exchange (drag, lift, side force, moments).
// Boundaries: velocity inlet and pressure outlet (non-equilibrium extrapolation), free-slip, no-slip or periodic sides.
// Heat: passive-scalar advection–diffusion on D3Q7 in the fluid and conduction in the solid (conjugate heat transfer;
// the solid's lattice diffusivity follows the conductivity ratio and its cells hold its own ρc (the equilibrium's
// rest population carries σ = ρc_solid / ρc_fluid), so steady and transient temperatures are right); body at a
// fixed temperature, with a heat power, or
// just conducting; optional Boussinesq buoyancy (Guo forcing) for natural convection.
// Steady runs stop when the monitored velocities and forces settle (then average over a window); transient runs
// march a physical duration and keep force histories and field snapshots.
//
// Units (flowStudy): mm for geometry, m/s, Pa, N, °C, W; fluid { density kg/m³, viscosity m²/s, k W/(m·K), cp J/(kg·K) }.

import { surfaceModel } from '../fem/mesh.js';

// ───────────────────────── lattices

export const CX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
export const CY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
export const CZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
export const W = CX.map((_, i) => (i === 0 ? 1 / 3 : i < 7 ? 1 / 18 : 1 / 36));
const Q = 19;
const dirIndex = (x, y, z) => CX.findIndex((_, i) => CX[i] === x && CY[i] === y && CZ[i] === z);
export const OPP = CX.map((_, i) => dirIndex(-CX[i], -CY[i], -CZ[i]));
// D3Q7 for the scalar: rest + 6 axes, w0 = 1/4, wi = 1/8, cs² = 1/4.
const TX = [0, 1, -1, 0, 0, 0, 0], TY = [0, 0, 0, 1, -1, 0, 0], TZ = [0, 0, 0, 0, 0, 1, -1], TW = [0.25, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125], TOPP = [0, 2, 1, 4, 3, 6, 5];

/** MRT: orthogonal moment matrix (rows) from d'Humières' polynomial set by Gram–Schmidt, with the relaxation group of each row. */
function mrtBasis() {
  const P = (f) => CX.map((_, i) => f(CX[i], CY[i], CZ[i], CX[i] ** 2 + CY[i] ** 2 + CZ[i] ** 2));
  const rows = [
    [P(() => 1), 'c'], [P((x, y, z, c) => c), 'e'], [P((x, y, z, c) => c * c), 'eps'],
    [P((x) => x), 'c'], [P((x, y, z, c) => x * c), 'q'], [P((x, y) => y), 'c'], [P((x, y, z, c) => y * c), 'q'], [P((x, y, z) => z), 'c'], [P((x, y, z, c) => z * c), 'q'],
    [P((x, y, z, c) => 3 * x * x - c), 'nu'], [P((x, y, z, c) => (3 * x * x - c) * c), 'pi'], [P((x, y, z) => y * y - z * z), 'nu'], [P((x, y, z, c) => (y * y - z * z) * c), 'pi'],
    [P((x, y) => x * y), 'nu'], [P((x, y, z) => y * z), 'nu'], [P((x, y, z) => z * x), 'nu'],
    [P((x, y, z) => x * (y * y - z * z)), 'm'], [P((x, y, z) => y * (z * z - x * x)), 'm'], [P((x, y, z) => z * (x * x - y * y)), 'm'],
  ];
  const M = [], groups = [];
  for (const [v0, g] of rows) {
    const v = v0.slice();
    for (const u of M) { const c = v.reduce((s, x, i) => s + x * u[i], 0) / u.reduce((s, x) => s + x * x, 0); for (let i = 0; i < Q; i++) v[i] -= c * u[i]; }
    M.push(v); groups.push(g);
  }
  const norm2 = M.map((r) => r.reduce((s, x) => s + x * x, 0));
  return { M: Float64Array.from(M.flat()), norm2: Float64Array.from(norm2), groups };
}
const MRT = mrtBasis();

// ───────────────────────── the lattice solver

/**
 * Low-level run on a box lattice. config:
 *   dims [nx, ny, nz]; solid Uint8Array (0 fluid, 1 body — forces counted, 2 wall); qwall Float32Array(Q·N) wall fractions
 *   (−1 unknown → half-way) for links from fluid cells into solid; flowAxis, flowSign; inlet: 'velocity' | 'none';
 *   uIn (lattice inlet velocity, scalar) or inletProfile (Float32Array per cell → speed); outlet 'pressure' | 'none';
 *   sides: [axis] → 'slip' | 'wall' | 'periodic'; tau; collision 'trt' | 'bgk' | 'mrt'; smagorinsky Cs; force [ax,ay,az]
 *   (uniform body acceleration, lattice); thermal: { tauF (fluid), tauS (solid), Tin, Tbody, fixedBody, source (per solid
 *   cell per step), Tinit, walls: { [axis]: { lo, hi } fixed wall temperatures }, buoyancy: { beta·g vector (lattice), Tref } }
 *   steps / minSteps / tol (steady), transient (bool), samples, onSample(step, state), onProgress, cancel.
 * Returns { rho, vel, temp, force (lattice, on the body, averaged), forceHistory, steps, converged, unstable, ... }.
 */
export function latticeRun(config) {
  const { dims, solid, qwall = null, flowAxis = 0, flowSign = 1, inlet = 'velocity', outlet = 'pressure', sides = ['slip', 'slip', 'slip'], tau = 0.8,
    collision = 'trt', smagorinsky = 0, force = null, uIn = 0.05, inletProfile = null, thermal = null, steps = 4000, minSteps = 200, tol = 1e-6,
    transient = false, samples = 100, onSample = null, onProgress = null, cancel = null, center = null, fixedCells = null } = config;
  const [nx, ny, nz] = dims, N = nx * ny * nz;
  const F64 = N < 400000;
  let f = F64 ? new Float64Array(Q * N) : new Float32Array(Q * N), g = F64 ? new Float64Array(Q * N) : new Float32Array(Q * N);
  const uinVec = [0, 0, 0]; uinVec[flowAxis] = flowSign * uIn;
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const feqCell = (rho, ux, uy, uz, out, o) => {
    const usq = 1.5 * (ux * ux + uy * uy + uz * uz);
    for (let q = 0; q < Q; q++) { const cu = 3 * (CX[q] * ux + CY[q] * uy + CZ[q] * uz); out[o + q] = W[q] * rho * (1 + cu + 0.5 * cu * cu - usq); }
  };
  const inletSpeed = (s) => (inletProfile ? inletProfile[s] : uIn);
  const ramp = Math.max(0, config.ramp ?? 0);
  let rampF = 1;
  for (let s = 0; s < N; s++) {
    if (solid[s]) { feqCell(1, 0, 0, 0, f, Q * s); continue; }
    const sp = inlet === 'velocity' && !(config.ramp > 0) ? flowSign * (inletProfile ? 0 : uIn) : 0, u0 = config.initialVelocity ? config.initialVelocity.slice() : [0, 0, 0]; if (!config.initialVelocity) u0[flowAxis] = sp;
    feqCell(1, u0[0], u0[1], u0[2], f, Q * s);
  }
  // Streaming table: ≥ 0 destination index in g; −1 open (dropped); −2 bounce from the body; −3 bounce from a wall.
  const dest = new Int32Array(Q * N);
  const c = [0, 0, 0], p = [0, 0, 0];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = idx(i, j, k), base = Q * s;
    if (solid[s]) { dest.fill(-1, base, base + Q); continue; }
    for (let q = 0; q < Q; q++) {
      c[0] = CX[q]; c[1] = CY[q]; c[2] = CZ[q];
      p[0] = i + c[0]; p[1] = j + c[1]; p[2] = k + c[2];
      let drop = false, wall = false;
      const cc = [c[0], c[1], c[2]];
      for (let a = 0; a < 3; a++) {
        if (p[a] >= 0 && p[a] < dims[a]) continue;
        const mode = sides[a];
        if (mode === 'periodic') { p[a] = (p[a] + dims[a]) % dims[a]; continue; }
        if (mode === 'open' || (a === flowAxis && mode !== 'wall' && mode !== 'slip')) { drop = true; break; }
        if (a === flowAxis) { drop = true; break; }
        if (mode === 'wall') { wall = true; break; }
        p[a] -= c[a]; cc[a] = -c[a];          // free slip: specular reflection
      }
      if (drop) { dest[base + q] = -1; continue; }
      if (wall) { dest[base + q] = -3; continue; }
      const t = idx(p[0], p[1], p[2]);
      if (solid[t]) { dest[base + q] = solid[t] === 1 ? -2 : -3; continue; }
      dest[base + q] = Q * t + dirIndex(cc[0], cc[1], cc[2]);
    }
  }
  // Upstream neighbour (x − c_q) for the interpolated bounce-back, −1 when not fluid.
  const upstream = qwall ? new Int32Array(Q * N).fill(-1) : null;
  if (qwall) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = idx(i, j, k);
    if (solid[s]) continue;
    for (let q = 1; q < Q; q++) {
      if (dest[Q * s + q] !== -2 && dest[Q * s + q] !== -3) continue;
      const a = [i - CX[q], j - CY[q], k - CZ[q]];
      let ok = true;
      for (let ax = 0; ax < 3; ax++) { if (a[ax] < 0 || a[ax] >= dims[ax]) { if (sides[ax] === 'periodic') a[ax] = (a[ax] + dims[ax]) % dims[ax]; else ok = false; } }
      if (!ok) continue;
      const t = idx(a[0], a[1], a[2]);
      if (!solid[t]) upstream[Q * s + q] = t;
    }
  }
  // Inlet / outlet planes with the neighbouring plane inside.
  const plane = (pos) => {
    const list = [];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const cc = [i, j, k];
      if (cc[flowAxis] !== pos) continue;
      const s = idx(i, j, k);
      if (solid[s]) continue;
      const d = cc.slice(); d[flowAxis] += pos === 0 ? 1 : -1;
      const t = idx(d[0], d[1], d[2]);
      list.push([s, solid[t] ? s : t]);
    }
    return list;
  };
  const periodicFlow = sides[flowAxis] === 'periodic';
  const up = flowSign > 0 ? 0 : dims[flowAxis] - 1, down = flowSign > 0 ? dims[flowAxis] - 1 : 0;
  const inletCells = periodicFlow || inlet === 'none' ? [] : plane(up), outletCells = periodicFlow || outlet === 'none' ? [] : plane(down);
  const fluidList = [];
  for (let s = 0; s < N; s++) if (!solid[s]) fluidList.push(s);
  const fluid = Int32Array.from(fluidList);
  const cx = Float64Array.from(CX), cy = Float64Array.from(CY), cz = Float64Array.from(CZ), w = Float64Array.from(W), opp = Int32Array.from(OPP);
  const lambdaTRT = 3 / 16, cs2 = smagorinsky > 0 ? 18 * Math.SQRT2 * smagorinsky * smagorinsky : 0;
  const feq = new Float64Array(Q), fc = new Float64Array(Q), mom = new Float64Array(Q), src = new Float64Array(Q);
  const rates = { c: 0, e: 1.19, eps: 1.4, q: 1.2, pi: 1.4, m: 1.98 };
  const fx0 = force ? force[0] : 0, fy0 = force ? force[1] : 0, fz0 = force ? force[2] : 0;

  // Thermal lattice (all cells).
  const th = thermal;
  let tg = null, tg2 = null, Tcell = null;
  if (th) {
    tg = new Float64Array(7 * N); tg2 = new Float64Array(7 * N); Tcell = th.Tinit?.length === N ? Float64Array.from(th.Tinit) : new Float64Array(N).fill(th.Tinit ?? th.Tin ?? 0);
    for (let s = 0; s < N; s++) { const T0 = solid[s] === 1 && th.fixedBody ? th.Tbody : Tcell[s]; Tcell[s] = T0; for (let q = 0; q < 7; q++) tg[7 * s + q] = TW[q] * T0; if (solid[s] === 1) tg[7 * s] += ((th.sigmaS ?? 1) - 1) * T0; }
  }
  const bg = th?.buoyancy;

  const forceOut = [0, 0, 0], torqueOut = [0, 0, 0], sum = [0, 0, 0], sumT = [0, 0, 0], forceHistory = [];
  let steps_ = 0, converged = false, unstable = false, averaged = 0, prevMon = 0, stable = 0, heatToFluid = 0, heatSum = 0, uPrev = null, Tprev = null;
  const residuals = [];
  const avgWindow = Math.max(100, Math.round(Math.min(steps * 0.1, 1000)));
  const sampleEvery = Math.max(1, Math.floor(steps / Math.max(1, samples)));
  const ci = center ?? [nx / 2, ny / 2, nz / 2];
  const mrtRate = Float64Array.from(MRT.groups, (gname) => (gname === 'nu' ? -1 : rates[gname]));
  const K = { cx, cy, cz, w, opp, fx0, fy0, fz0, bg, Tcell, tau, cs2, collision, feq, fc, mom, src, mrtRate, lambdaTRT, nx, ny, ci };
  const fo6 = new Float64Array(6);
  const KH = { cx, cy, cz, th, dims, sides, inletCells, outletCells, uinVec, N, nx, ny, nz, idx };
  for (; steps_ < steps; steps_++) {
    rampF = ramp > 0 && steps_ < ramp ? 0.5 - 0.5 * Math.cos((Math.PI * steps_) / ramp) : 1;
    collideKernel(f, fluid, K);
    streamKernel(f, g, fluid, dest, qwall, upstream, K, fo6);
    forceOut[0] = fo6[0]; forceOut[1] = fo6[1]; forceOut[2] = fo6[2]; torqueOut[0] = fo6[3]; torqueOut[1] = fo6[4]; torqueOut[2] = fo6[5];
    // ── open boundaries: non-equilibrium extrapolation
    const tmp = new Float64Array(Q), nb = new Float64Array(Q);
    const moments = (arr, s) => { let r = 0, x = 0, y = 0, z = 0; const o = Q * s; for (let q = 0; q < Q; q++) { const v = arr[o + q]; r += v; x += v * cx[q]; y += v * cy[q]; z += v * cz[q]; } return [r, x / r, y / r, z / r]; };
    for (const [s, t] of inletCells) {
      const mt = moments(g, t), sp = flowSign * inletSpeed(s) * rampF, u0 = [0, 0, 0]; u0[flowAxis] = sp;
      feqCell(mt[0], u0[0], u0[1], u0[2], tmp, 0); feqCell(mt[0], mt[1], mt[2], mt[3], nb, 0);
      for (let q = 0; q < Q; q++) g[Q * s + q] = tmp[q] + (g[Q * t + q] - nb[q]);
    }
    for (const [s, t] of outletCells) {
      const mt = moments(g, t);
      feqCell(1, mt[1], mt[2], mt[3], tmp, 0); feqCell(mt[0], mt[1], mt[2], mt[3], nb, 0);
      for (let q = 0; q < Q; q++) g[Q * s + q] = tmp[q] + (g[Q * t + q] - nb[q]);
    }
    // Nested block: its outer cells take the coarser solution as a velocity inlet (its u, their own ρ) on the upstream
    // face and the sides, and a pressure outlet (its ρ, their own u) downstream — like the domain's own boundaries.
    // Holding both ρ and u everywhere over-constrains the block (drag 8 % high against a uniform fine grid).
    if (fixedCells) for (let q2 = 0; q2 < fixedCells.cells.length; q2++) {
      const sc = fixedCells.cells[q2]; const o = Q * sc;
      let r0 = 0, x = 0, y = 0, z = 0; for (let q = 0; q < Q; q++) { const v = g[o + q]; r0 += v; x += v * cx[q]; y += v * cy[q]; z += v * cz[q]; }
      if (fixedCells.outlet[q2]) feqCell(fixedCells.rho[q2], x / r0, y / r0, z / r0, g, o);
      else feqCell(r0, fixedCells.vel[3 * q2], fixedCells.vel[3 * q2 + 1], fixedCells.vel[3 * q2 + 2], g, o);
    }
    const sw = f; f = g; g = sw;

    if (th) {
      heatToFluid = heatKernel(f, tg, tg2, Tcell, solid, KH);
      const swt = tg; tg = tg2; tg2 = swt;
    }

    if (transient || averaged) { for (let a = 0; a < 3; a++) { sum[a] += forceOut[a]; sumT[a] += torqueOut[a]; } heatSum += heatToFluid; averaged++; }
    if (steps_ % sampleEvery === 0) { forceHistory.push({ step: steps_, force: forceOut.slice(), heat: heatToFluid }); onSample?.(steps_, { f, Tcell }); }
    if (steps_ % 50 === 49) {
      // Residual: ‖u − u_prev‖ / ‖u‖ over the fluid cells since the last check (per step), plus the force change.
      if (!uPrev) uPrev = new Float64Array(3 * fluid.length);
      let du2 = 0, u2 = 0, finite = true;
      for (let m = 0; m < fluid.length; m++) {
        const o = Q * fluid[m]; let r = 0, x = 0, y = 0, z = 0;
        for (let q = 0; q < Q; q++) { const v = f[o + q]; r += v; x += v * cx[q]; y += v * cy[q]; z += v * cz[q]; }
        x /= r; y /= r; z /= r;
        if (!Number.isFinite(x)) { finite = false; break; }
        du2 += (x - uPrev[3 * m]) ** 2 + (y - uPrev[3 * m + 1]) ** 2 + (z - uPrev[3 * m + 2]) ** 2; u2 += x * x + y * y + z * z;
        uPrev[3 * m] = x; uPrev[3 * m + 1] = y; uPrev[3 * m + 2] = z;
      }
      if (!finite) { unstable = true; break; }
      const fNow = Math.hypot(...forceOut), fChange = Math.abs(fNow - prevMon) / Math.max(1e-12, fNow);
      prevMon = fNow;
      let dT = 0;
      if (Tcell) { if (!Tprev) Tprev = new Float64Array(N); let d2 = 0, t2 = 0; for (let s2 = 0; s2 < N; s2++) { d2 += (Tcell[s2] - Tprev[s2]) ** 2; t2 += Tcell[s2] ** 2; Tprev[s2] = Tcell[s2]; } dT = Math.sqrt(d2 / Math.max(1e-300, t2)) / 50; }
      const change = Math.max(u2 > 0 ? Math.sqrt(du2 / u2) / 50 : 0, fluid.length && fNow > 0 ? fChange / 50 : 0, dT);
      residuals.push({ step: steps_, residual: change });
      onProgress?.(Math.min(0.99, steps_ / steps), { step: steps_, change });
      if (cancel?.()) break;
      if (!transient) {
        if (steps_ > minSteps && change < tol) stable++; else if (!averaged) stable = 0;
        if (stable >= 3 && !averaged) { averaged = 1; for (let a = 0; a < 3; a++) { sum[a] = forceOut[a]; sumT[a] = torqueOut[a]; } heatSum = heatToFluid; }
        if (averaged >= avgWindow) { converged = true; steps_++; break; }
      }
    }
  }
  // A steady run that did not settle (residual above the tolerance): the forces are averaged over its last fifth.
  let force_ = averaged > 0 ? sum.map((v) => v / averaged) : forceOut.slice();
  const torque_ = averaged > 0 ? sumT.map((v) => v / averaged) : torqueOut.slice();
  if (!transient && !averaged && forceHistory.length > 5) { const tail = forceHistory.slice(Math.floor(0.8 * forceHistory.length)); force_ = [0, 1, 2].map((a) => tail.reduce((t, x) => t + x.force[a], 0) / tail.length); }
  const rho = new Float32Array(N), vel = new Float32Array(3 * N);
  for (let s = 0; s < N; s++) {
    if (solid[s]) { rho[s] = 1; continue; }
    const o = Q * s; let r = 0, x = 0, y = 0, z = 0;
    for (let q = 0; q < Q; q++) { const v = f[o + q]; r += v; x += v * cx[q]; y += v * cy[q]; z += v * cz[q]; }
    rho[s] = r; vel[3 * s] = x / r; vel[3 * s + 1] = y / r; vel[3 * s + 2] = z / r;
  }
  let temp = null;
  if (th) { temp = new Float32Array(N); for (let s = 0; s < N; s++) { let T = 0; for (let q = 0; q < 7; q++) T += tg[7 * s + q]; if (solid[s] === 1) T /= th.sigmaS ?? 1; temp[s] = solid[s] === 1 && th.fixedBody ? th.Tbody : T; } }
  const avgRho = (list) => (list.length ? list.reduce((t, [s]) => t + rho[s], 0) / list.length : 1);
  return {
    dims, rho, vel, temp, force: force_, torque: torque_, forceHistory, residuals, steps: steps_, converged: transient ? !unstable : converged, unstable,
    inletRho: avgRho(inletCells), outletRho: avgRho(outletCells), heatToFluid: averaged > 0 ? heatSum / averaged : heatToFluid,
    uIn, tau, flowAxis, flowSign, collision, smagorinsky,
  };
}

// ───────────────────────── kernels (top level with typed-array arguments, so the engine optimises them)

// The 9 opposite pairs of D3Q19 (q, q+1) after the rest population.
const PAIRS = [1, 3, 5, 7, 9, 11, 13, 15, 17];

function collideKernel(f, fluid, P) {
  const { cx, cy, cz, w, fx0, fy0, fz0, bg, Tcell, tau, cs2, collision, feq, fc, mom, src, mrtRate, lambdaTRT } = P;
  const mrt = collision === 'mrt', bgk = collision === 'bgk';
  const constForce = fx0 !== 0 || fy0 !== 0 || fz0 !== 0;
  for (let m = 0; m < fluid.length; m++) {
    const s = fluid[m], o = Q * s;
    // Moments from the pairs.
    let r = f[o], mx = 0, my = 0, mz = 0;
    for (let k = 0; k < 9; k++) {
      const q = PAIRS[k], a = f[o + q], b = f[o + q + 1], d = a - b;
      r += a + b; mx += cx[q] * d; my += cy[q] * d; mz += cz[q] * d;
    }
    let ax = fx0, ay = fy0, az = fz0;
    if (bg) { const dT = Tcell[s] - bg.Tref; ax += bg.g[0] * dT; ay += bg.g[1] * dT; az += bg.g[2] * dT; }
    const forced = constForce || (bg && (ax !== 0 || ay !== 0 || az !== 0));
    const ir = 1 / r;
    const ux = (mx + 0.5 * r * ax) * ir, uy = (my + 0.5 * r * ay) * ir, uz = (mz + 0.5 * r * az) * ir, usq = 1.5 * (ux * ux + uy * uy + uz * uz);
    // Equilibrium (even part ep, odd part em per pair).
    feq[0] = w[0] * r * (1 - usq);
    for (let k = 0; k < 9; k++) {
      const q = PAIRS[k], cu = 3 * (cx[q] * ux + cy[q] * uy + cz[q] * uz), ep = w[q] * r * (1 + 0.5 * cu * cu - usq), em = w[q] * r * cu;
      feq[q] = ep + em; feq[q + 1] = ep - em;
    }
    let t0 = tau;
    if (cs2) {
      let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pyz = 0, pzx = 0;
      for (let q = 1; q < Q; q++) { const d = f[o + q] - feq[q], a1 = cx[q], b1 = cy[q], c1 = cz[q]; pxx += a1 * a1 * d; pyy += b1 * b1 * d; pzz += c1 * c1 * d; pxy += a1 * b1 * d; pyz += b1 * c1 * d; pzx += c1 * a1 * d; }
      const Pi = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pyz * pyz + pzx * pzx));
      t0 = 0.5 * (tau + Math.sqrt(tau * tau + (cs2 * Pi) * ir));
    }
    const wp = 1 / t0;
    // Guo forcing source S_q.
    if (forced) {
      const ua = ux * ax + uy * ay + uz * az;
      src[0] = w[0] * r * (-3 * ua);
      for (let k = 0; k < 9; k++) {
        const q = PAIRS[k], ca = cx[q] * ax + cy[q] * ay + cz[q] * az, cu = cx[q] * ux + cy[q] * uy + cz[q] * uz;
        // S_q = w r [3(c − u)·a + 9 (c·u)(c·a)], S_q̄ with c → −c.
        const even = w[q] * r * (-3 * ua + 9 * cu * ca), odd = w[q] * r * 3 * ca;
        src[q] = even + odd; src[q + 1] = even - odd;
      }
    }
    if (mrt) {
      // m = M f, m* = m − S(m − m_eq) + (I − S/2) M S_force, f = Mᵀ D⁻¹ m*
      for (let a = 0; a < Q; a++) {
        let s1 = 0, s2 = 0, s3 = 0; const row = a * Q;
        for (let q = 0; q < Q; q++) { const mq = MRT.M[row + q]; s1 += mq * f[o + q]; s2 += mq * feq[q]; if (forced) s3 += mq * src[q]; }
        const sr = mrtRate[a] < 0 ? wp : mrtRate[a];
        mom[a] = (s1 - sr * (s1 - s2) + (forced ? (1 - 0.5 * sr) * s3 : 0)) / MRT.norm2[a];
      }
      for (let q = 0; q < Q; q++) { let s1 = 0; for (let a = 0; a < Q; a++) s1 += MRT.M[a * Q + q] * mom[a]; fc[q] = s1; }
      for (let q = 0; q < Q; q++) f[o + q] = fc[q];
      continue;
    }
    const wm = bgk ? wp : 1 / (lambdaTRT / (t0 - 0.5) + 0.5), kp = 1 - 0.5 * wp, km = 1 - 0.5 * wm;
    f[o] = f[o] - wp * (f[o] - feq[0]) + (forced ? kp * src[0] : 0);
    for (let k = 0; k < 9; k++) {
      const q = PAIRS[k], a = f[o + q], b = f[o + q + 1];
      const fp = 0.5 * (a + b), fm = 0.5 * (a - b), ep = 0.5 * (feq[q] + feq[q + 1]), em = 0.5 * (feq[q] - feq[q + 1]);
      let np = fp - wp * (fp - ep), nm = fm - wm * (fm - em);
      if (forced) { np += kp * 0.5 * (src[q] + src[q + 1]); nm += km * 0.5 * (src[q] - src[q + 1]); }
      f[o + q] = np + nm; f[o + q + 1] = np - nm;
    }
  }
}


function streamKernel(f, g, fluid, dest, qwall, upstream, P, out) {
  const { cx, cy, cz, opp, nx, ny, ci } = P;
  let fxs = 0, fys = 0, fzs = 0, mxs = 0, mys = 0, mzs = 0;
  for (let m = 0; m < fluid.length; m++) {
    const s = fluid[m], o = Q * s;
    for (let q = 0; q < Q; q++) {
      const d = dest[o + q], v = f[o + q];
      if (d >= 0) { g[d] = v; continue; }
      if (d === -1) continue;
      const qo = opp[q];
      let back = v;
      if (qwall) {
        const qf = qwall[o + q];
        if (qf >= 0) {
          if (qf < 0.5) { const up2 = upstream[o + q]; back = up2 >= 0 ? 2 * qf * v + (1 - 2 * qf) * f[Q * up2 + q] : v; }
          else back = v / (2 * qf) + ((2 * qf - 1) / (2 * qf)) * f[o + qo];
        }
      }
      g[o + qo] = back;
      if (d === -2) {
        const px = (v + back) * cx[q], py = (v + back) * cy[q], pz = (v + back) * cz[q];
        fxs += px; fys += py; fzs += pz;
        const i = s % nx, rr = (s - i) / nx, j = rr % ny, k = (rr - j) / ny;
        const rx = i + 0.5 * cx[q] - ci[0], ry = j + 0.5 * cy[q] - ci[1], rz = k + 0.5 * cz[q] - ci[2];
        mxs += ry * pz - rz * py; mys += rz * px - rx * pz; mzs += rx * py - ry * px;
      }
    }
  }
  out[0] = fxs; out[1] = fys; out[2] = fzs; out[3] = mxs; out[4] = mys; out[5] = mzs;
}

/** Heat collision + streaming into tg2; returns the scalar flux from the body into the fluid this step. */
function heatKernel(f, tg, tg2, Tcell, solid, P) {
  const { cx, cy, cz, th, dims, sides, inletCells, outletCells, uinVec, N, nx, ny, nz, idx } = P;
  for (let s = 0; s < N; s++) {
    const o = 7 * s;
    // Solid cells carry the energy σT (σ = (ρc)_solid / (ρc)_fluid): the rest population holds the extra (σ − 1)T,
    // so the solid heats on its own time scale while the conductive flux (∝ k) stays continuous at the interface.
    const sig = solid[s] === 1 ? th.sigmaS ?? 1 : solid[s] ? th.sigmaWall ?? 1 : 1;
    let T = 0; for (let q = 0; q < 7; q++) T += tg[o + q];
    T /= sig;
    let ux = 0, uy = 0, uz = 0, om;
    if (!solid[s]) {
      const fo = Q * s; let r = 0, mx = 0, my = 0, mz = 0;
      for (let q = 0; q < Q; q++) { const v = f[fo + q]; r += v; mx += v * cx[q]; my += v * cy[q]; mz += v * cz[q]; }
      ux = mx / r; uy = my / r; uz = mz / r; om = 1 / th.tauF;
    } else om = 1 / (solid[s] === 1 ? th.tauS : th.tauWall ?? th.tauS);
    if (solid[s] === 1 && th.fixedBody) T = th.Tbody;
    Tcell[s] = T;
    for (let q = 0; q < 7; q++) {
      const eq = TW[q] * T * (1 + 4 * (TX[q] * ux + TY[q] * uy + TZ[q] * uz)) + (q === 0 ? (sig - 1) * T : 0);
      tg[o + q] = (solid[s] === 1 && th.fixedBody) ? eq : tg[o + q] - om * (tg[o + q] - eq);
    }
    if (solid[s] === 1 && th.source) tg[o] += th.source;
  }
  // Stream (bounce-back at the domain sides, inlet fixed, outlet zero gradient); heat into the fluid from the body.
  let qBody = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = idx(i, j, k), o = 7 * s;
    for (let q = 0; q < 7; q++) {
      const a = [i + TX[q], j + TY[q], k + TZ[q]];
      let inside = true;
      for (let ax = 0; ax < 3; ax++) if (a[ax] < 0 || a[ax] >= dims[ax]) { if (sides[ax] === 'periodic') a[ax] = (a[ax] + dims[ax]) % dims[ax]; else inside = false; }
      if (!inside) { tg2[o + TOPP[q]] = tg[o + q]; continue; }
      const t = idx(a[0], a[1], a[2]);
      tg2[7 * t + q] = tg[o + q];
      if (solid[s] === 1 && !solid[t]) qBody += tg[o + q];
      else if (!solid[s] && solid[t] === 1) qBody -= tg[o + q];
    }
  }
  for (const [s] of inletCells) for (let q = 0; q < 7; q++) tg2[7 * s + q] = TW[q] * th.Tin * (1 + 4 * (TX[q] * uinVec[0] + TY[q] * uinVec[1] + TZ[q] * uinVec[2]));
  for (const [s, t] of outletCells) for (let q = 0; q < 7; q++) tg2[7 * s + q] = tg2[7 * t + q];
  // Wall temperatures on the domain faces (anti-bounce-back to a fixed value).
  if (th.walls) for (const [axStr, wv] of Object.entries(th.walls)) {
    const ax = Number(axStr);
    for (const [side, Tw] of [['lo', wv.lo], ['hi', wv.hi]]) {
      if (Tw == null) continue;
      const pos = side === 'lo' ? 0 : dims[ax] - 1, qin = side === 'lo' ? [1, 3, 5][ax] : [2, 4, 6][ax];
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const cc = [i, j, k]; if (cc[ax] !== pos) continue;
        const s = idx(i, j, k);
        tg2[7 * s + qin] = -tg[7 * s + TOPP[qin]] + 2 * TW[qin] * Tw;
      }
    }
  }
  return qBody;
}

// ───────────────────────── geometry on the lattice

/** Solid flags of the cell centres of a lattice (origin, h, dims) for a closed surface model: ray parity per x line. */
function voxelize(S, origin, h, dims) {
  const [nx, ny, nz] = dims, out = new Uint8Array(nx * ny * nz);
  const lines = new Map(), jy = 1.37e-7 * S.size, jz = 2.71e-7 * S.size;
  for (let t = 0; t < S.nt; t++) {
    const a = 3 * S.T[3 * t], b = 3 * S.T[3 * t + 1], c = 3 * S.T[3 * t + 2];
    const ymin = Math.min(S.V[a + 1], S.V[b + 1], S.V[c + 1]), ymax = Math.max(S.V[a + 1], S.V[b + 1], S.V[c + 1]);
    const zmin = Math.min(S.V[a + 2], S.V[b + 2], S.V[c + 2]), zmax = Math.max(S.V[a + 2], S.V[b + 2], S.V[c + 2]);
    const j0 = Math.max(0, Math.ceil((ymin - origin[1] - jy) / h - 0.5)), j1 = Math.min(ny - 1, Math.floor((ymax - origin[1] - jy) / h - 0.5));
    const k0 = Math.max(0, Math.ceil((zmin - origin[2] - jz) / h - 0.5)), k1 = Math.min(nz - 1, Math.floor((zmax - origin[2] - jz) / h - 0.5));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const x = S.rayX(t, origin[1] + (j + 0.5) * h + jy, origin[2] + (k + 0.5) * h + jz);
      if (x === null) continue;
      const kk = j + ny * k; let l = lines.get(kk); if (!l) lines.set(kk, (l = [])); l.push(x);
    }
  }
  for (const [kk, xs] of lines) {
    xs.sort((p, q) => p - q);
    const j = kk % ny, k = (kk - j) / ny;
    let c = 0;
    for (let i = 0; i < nx; i++) {
      const x = origin[0] + (i + 0.5) * h;
      while (c < xs.length && xs[c] < x) c++;
      if ((xs.length - c) & 1) out[i + nx * (j + ny * k)] = 1;
    }
  }
  return out;
}

/** Wall fractions q along the links from fluid cells into body cells (Bouzidi), from segment–surface intersections. */
function wallFractions(S, origin, h, dims, solid) {
  const [nx, ny, nz] = dims, N = nx * ny * nz, q = new Float32Array(Q * N).fill(-1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = i + nx * (j + ny * k);
    if (solid[s]) continue;
    for (let d = 1; d < Q; d++) {
      const a = [i + CX[d], j + CY[d], k + CZ[d]];
      if (a.some((v, ax) => v < 0 || v >= dims[ax])) continue;
      const t = a[0] + nx * (a[1] + ny * a[2]);
      if (solid[t] !== 1) continue;
      const p0 = [origin[0] + (i + 0.5) * h, origin[1] + (j + 0.5) * h, origin[2] + (k + 0.5) * h];
      const p1 = [p0[0] + CX[d] * h, p0[1] + CY[d] * h, p0[2] + CZ[d] * h];
      const tt = S.segmentHit(p0, p1);
      q[Q * s + d] = tt >= 0 ? Math.min(1, Math.max(1e-3, tt)) : 0.5;
    }
  }
  return q;
}

export const FLUIDS = {
  air: { density: 1.204, viscosity: 1.516e-5, k: 0.0257, cp: 1006, beta: 3.4e-3 },
  water: { density: 998.2, viscosity: 1.004e-6, k: 0.598, cp: 4182, beta: 2.1e-4 },
  oil: { density: 870, viscosity: 1e-4, k: 0.145, cp: 1900, beta: 7e-4 },
};

/**
 * Flow around (external) or through (internal) a body mesh. options:
 *   mode 'external' | 'internal'; axis 'x'|'y'|'z' and sign ±1; velocity (m/s); fluid name or { density, viscosity, k, cp, beta };
 *   cellSize (mm) or resolution (cells across the body / hydraulic diameter, default 24); domain { upstream, downstream,
 *   lateral } in body sizes (external; defaults 1, 2.5, 1); sides 'slip' | 'wall' | 'periodic' (external lateral);
 *   collision 'trt' (default) | 'bgk' | 'mrt'; les (Smagorinsky C_s, default 0.12; 0 = off); uLat (default 0.06);
 *   time: { mode 'steady' | 'transient', duration (s), maxSteps }; thermal: null | { inlet (°C), body: { mode 'temperature' |
 *   'power' | 'conduct', value (°C or W), k (solid W/mK) }, buoyancy (bool) }; maxCells; onProgress; cancel.
 * Returns the lattice result with physical quantities: dragForce, liftForce, sideForce (N), force vector, moments (N·m),
 * dragCoefficient, frontalArea (mm²), pressureDrop (Pa), reynolds, maxVelocity, heat (W into the fluid), nusselt,
 * vertexPressure (Pa on the body's surface vertices), vertexCp, strouhal (transient), history, ...
 */
export function flowStudy(mesh, opts = {}) {
  const { mode = 'external', axis = 'x', sign = 1, velocity = 1, fluid = 'air', cellSize = null, resolution = 24, domain = {}, sides: sideMode = 'slip',
    collision = 'trt', les = 0.12, uLat: uLat0 = 0.06, time = { mode: 'steady' }, thermal = null, maxCells = 3e6, onProgress = null, cancel = null } = opts;
  let uLat = uLat0;
  const S = surfaceModel(mesh);
  if (!(S.volume > 0)) return { ok: false, error: 'empty' };
  const fa = { x: 0, y: 1, z: 2 }[axis] ?? 0;
  const props = typeof fluid === 'string' ? FLUIDS[fluid] ?? FLUIDS.air : { ...FLUIDS.air, ...fluid };
  const ext = [0, 1, 2].map((a) => S.hi[a] - S.lo[a]);
  const lateralAxes = [0, 1, 2].filter((a) => a !== fa);
  const across = Math.max(...lateralAxes.map((a) => ext[a]));
  let h = cellSize > 0 ? cellSize : (mode === 'internal' ? Math.min(...lateralAxes.map((a) => ext[a])) / 3 : across) / Math.max(4, resolution);
  // Domain (mm): external flow gets room up-, downstream and to the sides.
  const Lb = Math.max(...ext);
  // Margins scale with the size across the flow (a long body along the flow does not need a huge cross-section).
  const Lm = Math.max(across, 0.25 * Lb);
  const up = (domain.upstream ?? 1) * Lm, down = (domain.downstream ?? 2.5) * Lm, side = (domain.lateral ?? 1) * Lm;
  let lo, hi;
  if (mode === 'internal') { lo = S.lo.slice(); hi = S.hi.slice(); lo[fa] -= 2 * h; hi[fa] += 2 * h; for (const a of lateralAxes) { lo[a] -= h; hi[a] += h; } }
  else { lo = S.lo.map((v, a) => v - (a === fa ? (sign > 0 ? up : down) : side)); hi = S.hi.map((v, a) => v + (a === fa ? (sign > 0 ? down : up) : side)); }
  let dims = [0, 1, 2].map((a) => Math.max(3, Math.ceil((hi[a] - lo[a]) / h)));
  while (dims[0] * dims[1] * dims[2] > maxCells) { h *= 1.1; dims = [0, 1, 2].map((a) => Math.max(3, Math.ceil((hi[a] - lo[a]) / h))); }
  const origin = lo;
  const N = dims[0] * dims[1] * dims[2];
  const solid = voxelize(S, origin, h, dims);
  if (mode === 'internal') {
    // Close off the outside: flood from the lateral domain faces within each cross-section (the body's walls stop it).
    const idx = (c) => c[0] + dims[0] * (c[1] + dims[1] * c[2]);
    const stack = [];
    for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
      const c = [i, j, k];
      if (lateralAxes.some((a) => c[a] === 0 || c[a] === dims[a] - 1)) { const s = idx(c); if (!solid[s]) { solid[s] = 2; stack.push(c); } }
    }
    while (stack.length) {
      const c = stack.pop();
      for (const a of lateralAxes) for (const d of [-1, 1]) {
        const e = c.slice(); e[a] += d;
        if (e[a] < 0 || e[a] >= dims[a]) continue;
        const s = idx(e); if (solid[s]) continue;
        solid[s] = 2; stack.push(e);
      }
    }
    // Slices beyond the body's ends: open only where the nearest end slice of the passage is open.
    let k0 = dims[fa], k1 = -1;
    for (let s = 0; s < N; s++) if (solid[s] === 1) { const c = [s % dims[0], Math.floor(s / dims[0]) % dims[1], Math.floor(s / (dims[0] * dims[1]))]; k0 = Math.min(k0, c[fa]); k1 = Math.max(k1, c[fa]); }
    for (let s = 0; s < N; s++) {
      const c = [s % dims[0], Math.floor(s / dims[0]) % dims[1], Math.floor(s / (dims[0] * dims[1]))];
      if (c[fa] >= k0 && c[fa] <= k1) continue;
      const e = c.slice(); e[fa] = c[fa] < k0 ? k0 : k1;
      const t = idx(e);
      solid[s] = solid[t] ? 2 : 0;
    }
  }
  let fluidCells = 0; for (let s = 0; s < N; s++) if (!solid[s]) fluidCells++;
  if (!fluidCells) return { ok: false, error: 'no-fluid' };
  const qwall = wallFractions(S, origin, h, dims, solid);
  onProgress?.(0.04, { stage: 'grid' });
  // Characteristic length and lattice units.
  const inPos = sign > 0 ? 0 : dims[fa] - 1;
  let inletArea = 0, inletPerim = 0;
  {
    const [a1, a2] = lateralAxes, at = (c) => solid[c[0] + dims[0] * (c[1] + dims[1] * c[2])];
    const pos = mode === 'internal' ? Math.min(dims[fa] - 1, Math.max(0, inPos + (sign > 0 ? 2 : -2))) : inPos;
    for (let p = 0; p < dims[a1]; p++) for (let q = 0; q < dims[a2]; q++) {
      const c = [0, 0, 0]; c[fa] = pos; c[a1] = p; c[a2] = q;
      if (at(c)) continue;
      inletArea++;
      for (const [da, d] of [[a1, 1], [a1, -1], [a2, 1], [a2, -1]]) { const e = c.slice(); e[da] += d; if (e[da] < 0 || e[da] >= dims[da] || at(e)) inletPerim++; }
    }
  }
  if (mode === 'internal' && !inletArea) return { ok: false, error: 'no-passage' };
  const lcCells = mode === 'internal' ? Math.max(1, (4 * inletArea) / Math.max(1, inletPerim)) : across / h;
  const lcM = (lcCells * h) / 1000, dxM = h / 1000;
  const reynolds = (velocity * lcM) / props.viscosity;
  // Internal (viscous) flow: keep the lattice pressure drop ~ 96 u² L / (Re D) below 0.1 so compressibility stays small.
  if (mode === 'internal') uLat = Math.max(0.004, Math.min(uLat, Math.sqrt((0.1 * Math.max(reynolds, 1e-6) * lcCells) / (96 * dims[fa]))));
  const transient = time.mode === 'transient';
  // A transient run of a short duration in a slow flow: at least 50 steps, by a smaller time step (a lower lattice
  // velocity) — never by running longer than the time asked for.
  if (transient) { const dt0 = (uLat * dxM) / Math.max(1e-12, velocity); const want = (time.duration ?? 1) / 50; if (dt0 > want) uLat *= want / dt0; }
  const nuLat = (uLat * lcCells) / Math.max(1e-12, reynolds);
  const tau = 0.5 + 3 * nuLat;
  const dt = (uLat * dxM) / Math.max(1e-12, velocity);
  const flowThrough = dims[fa] / uLat;
  const steps = transient ? Math.min(time.maxSteps ?? 400000, Math.max(50, Math.round((time.duration ?? 1) / dt))) : Math.min(time.maxSteps ?? 20000, Math.max(3000, Math.round((time.passes ?? 10) * flowThrough)));
  const sides = [0, 1, 2].map((a) => (a === fa ? 'open' : mode === 'internal' ? 'wall' : sideMode));
  // Heat in lattice units: α_lat = α dt/dx².
  let th = null, solidCells = 0;
  for (let s = 0; s < N; s++) if (solid[s] === 1) solidCells++;
  if (thermal) {
    const alphaF = props.k / (props.density * props.cp), aLat = (alphaF * dt) / (dxM * dxM);
    const ks = thermal.body?.k ?? 50, aS = aLat * (ks / props.k);
    const rcS = (thermal.body?.density ?? 7850) * (thermal.body?.cp ?? 500), sigmaS = rcS / (props.density * props.cp);
    const tauF = 0.5 + 4 * aLat, tauS = Math.min(0.5 + 4 * aS, 50);
    const Tin = thermal.inlet ?? 20, bm = thermal.body?.mode ?? 'temperature';
    th = { tauF, tauS, sigmaS, Tin, Tinit: Tin, fixedBody: bm === 'temperature', Tbody: bm === 'temperature' ? thermal.body?.value ?? 60 : Tin };
    if (bm === 'power' && solidCells) {
      // Steady balance k_s ∇²T + q''' = 0 on the lattice (α_s,lat ∇²_lat T + s = 0): s = α_s,lat · dx² · q''' / k_s per step.
      const Pw = thermal.body?.value ?? 10, qv = Pw / (solidCells * dxM ** 3);
      th.source = (aS * dxM * dxM * qv) / ks;
    }
    if (thermal.buoyancy) {
      const gLat = (9.81 * dt * dt) / dxM, b = props.beta ?? 3.4e-3;
      th.buoyancy = { g: [0, 0, gLat * b], Tref: Tin };     // Z up: warmer fluid rises (acceleration +Z per kelvin)
    }
  }
  // Body centre (cells) for the moments.
  const ctr = [0, 1, 2].map((a) => ((S.lo[a] + S.hi[a]) / 2 - origin[a]) / h - 0.5);
  const snapshots = [];
  const lat = latticeRun({
    dims, solid, qwall, flowAxis: fa, flowSign: sign, sides, tau, collision, smagorinsky: les, uIn: uLat, thermal: th, steps, minSteps: Math.min(steps, Math.round(1.5 * flowThrough)), tol: time.tol ?? 2e-7,
    transient, samples: transient ? 200 : 100, center: ctr, cancel, ramp: Math.round(Math.min(steps * 0.2, 0.6 * flowThrough)),
    onProgress: (f, info) => onProgress?.(0.05 + 0.9 * f, { stage: 'flow', ...info }),
  });
  if (lat.unstable) return { ok: false, error: 'unstable', reynolds, tau, cells: N };
  // Multi-resolution: nested blocks around the body, each with half the cell size, driven on their outer cells by the
  // next coarser solution (one-way nesting, acoustic scaling: same lattice velocity, ν_lat and τ − ½ doubled per level).
  // Forces and the surface pressure come from the finest block.
  const blocks = [];
  let fine = { lat, origin, h, dims, solid, tau, center: ctr };
  const levels = Math.max(0, Math.min(3, Math.round(opts.refine ?? 0)));
  for (let lvl = 1; lvl <= levels && mode === 'external'; lvl++) {
    const hf = fine.h / 2, mg = Math.max(6 * hf, (opts.blockMargin ?? 0.8) * across / lvl);
    const lo = S.lo.map((v, a) => v - (a === fa ? (sign > 0 ? mg : 2 * mg) : mg)), hi = S.hi.map((v, a) => v + (a === fa ? (sign > 0 ? 2 * mg : mg) : mg));
    // Inside the coarser grid by two of its cells.
    for (let a = 0; a < 3; a++) { lo[a] = Math.max(lo[a], fine.origin[a] + 2 * fine.h); hi[a] = Math.min(hi[a], fine.origin[a] + (fine.dims[a] - 2) * fine.h); }
    const dimsF = [0, 1, 2].map((a) => Math.max(4, Math.ceil((hi[a] - lo[a]) / hf)));
    if (dimsF[0] * dimsF[1] * dimsF[2] > maxCells) break;
    const solidF = voxelize(S, lo, hf, dimsF), qF = wallFractions(S, lo, hf, dimsF, solidF);
    const NF = dimsF[0] * dimsF[1] * dimsF[2], cells = [];
    for (let k = 0; k < dimsF[2]; k++) for (let j = 0; j < dimsF[1]; j++) for (let i = 0; i < dimsF[0]; i++) {
      if (i && j && k && i < dimsF[0] - 1 && j < dimsF[1] - 1 && k < dimsF[2] - 1) continue;
      const sF = i + dimsF[0] * (j + dimsF[1] * k); if (!solidF[sF]) cells.push(sF);
    }
    const rhoB = new Float32Array(cells.length), velB = new Float32Array(3 * cells.length);
    const coarseFlow = { dims: fine.dims, origin: fine.origin, h: fine.h, solid: fine.solid };
    cells.forEach((sF, q) => {
      const i = sF % dimsF[0], r = (sF - i) / dimsF[0], j = r % dimsF[1], k = (r - j) / dimsF[1];
      const p = [lo[0] + (i + 0.5) * hf, lo[1] + (j + 0.5) * hf, lo[2] + (k + 0.5) * hf];
      rhoB[q] = sampleScalar(coarseFlow, p, (sc) => fine.lat.rho[sc]) ?? 1;
      for (let a = 0; a < 3; a++) velB[3 * q + a] = sampleScalar(coarseFlow, p, (sc) => fine.lat.vel[3 * sc + a]) ?? (a === fa ? sign * uLat : 0);
    });
    const tauF = 0.5 + 2 * (fine.tau - 0.5), u0 = [0, 0, 0]; u0[fa] = sign * uLat;
    const ctrF = [0, 1, 2].map((a) => ((S.lo[a] + S.hi[a]) / 2 - lo[a]) / hf - 0.5);
    const throughF = dimsF[fa] / uLat;
    const latF = latticeRun({
      dims: dimsF, solid: solidF, qwall: qF, flowAxis: fa, flowSign: sign, sides: ['open', 'open', 'open'], inlet: 'none', outlet: 'none', tau: tauF, collision, smagorinsky: les, uIn: uLat,
      initialVelocity: u0, fixedCells: { cells: Int32Array.from(cells), rho: rhoB, vel: velB, outlet: Uint8Array.from(cells, (sF) => { const i = sF % dimsF[0], r = (sF - i) / dimsF[0], j = r % dimsF[1], k = (r - j) / dimsF[1]; const c = [i, j, k]; return c[fa] === (sign > 0 ? dimsF[fa] - 1 : 0) ? 1 : 0; }) }, steps: Math.min(time.maxSteps ?? 20000, Math.max(2000, Math.round(0.8 * (time.passes ?? 10) * throughF))), minSteps: Math.round(4 * throughF), tol: time.tol ?? 2e-7, center: ctrF, cancel,
      onProgress: (fr, info) => onProgress?.(Math.min(0.99, 0.95 + 0.04 * ((lvl - 1 + fr) / levels)), { stage: 'flow', level: lvl, ...info }),
    });
    if (latF.unstable) break;
    blocks.push({ level: lvl, origin: lo, h: hf, dims: dimsF, cells: NF, steps: latF.steps, converged: latF.converged, rho: latF.rho, vel: latF.vel, solid: solidF });
    fine = { lat: latF, origin: lo, h: hf, dims: dimsF, solid: solidF, tau: tauF, center: ctrF };
  }
  // Physical quantities.
  const scaleV = velocity / uLat, qd = props.density * scaleV * scaleV;
  const toN = qd * dxM * dxM;
  const dxF = fine.h / 1000, toNf = qd * dxF * dxF;
  const forceN = fine.lat.force.map((v) => v * toNf);
  const lateral1 = lateralAxes[0], lateral2 = lateralAxes[1];
  const drag = forceN[fa] * sign;
  // Frontal area: body cells projected along the flow axis.
  const front = new Set();
  for (let k = 0; k < fine.dims[2]; k++) for (let j = 0; j < fine.dims[1]; j++) for (let i = 0; i < fine.dims[0]; i++) {
    if (fine.solid[i + fine.dims[0] * (j + fine.dims[1] * k)] !== 1) continue;
    const c = [i, j, k]; c[fa] = 0; front.add(c.join(','));
  }
  const frontalArea = front.size * fine.h * fine.h;
  const dragCoefficient = front.size ? drag / (0.5 * props.density * velocity * velocity * frontalArea * 1e-6) : 0;
  const pressureDrop = ((lat.inletRho - lat.outletRho) / 3) * qd;
  let vmax = 0; for (let s = 0; s < N; s++) vmax = Math.max(vmax, Math.hypot(lat.vel[3 * s], lat.vel[3 * s + 1], lat.vel[3 * s + 2]));
  const flow = { dims: fine.dims, origin: fine.origin, h: fine.h, vel: fine.lat.vel, rho: fine.lat.rho, temp: fine.lat.temp, solid: fine.solid, flowAxis: fa, flowSign: sign, velocity, uLat, fluid: props };
  // Pressure on the body: from the fluid cells near each surface vertex (offset along the outward normal).
  const nv = mesh.vertices.length / 3, vertexPressure = new Float32Array(nv), vertexCp = new Float32Array(nv), normals = mesh.normals;
  for (let v = 0; v < nv; v++) {
    const p = [mesh.vertices[3 * v], mesh.vertices[3 * v + 1], mesh.vertices[3 * v + 2]];
    const n = normals ? [normals[3 * v], normals[3 * v + 1], normals[3 * v + 2]] : [0, 0, 0];
    const hh = fine.h, rr = fine.lat.rho;
    const q = [p[0] + 0.9 * hh * n[0], p[1] + 0.9 * hh * n[1], p[2] + 0.9 * hh * n[2]];
    const val = sampleScalar(flow, q, (s) => ((rr[s] - 1) / 3) * qd) ?? sampleScalar(flow, p, (s) => ((rr[s] - 1) / 3) * qd, 2) ?? 0;
    vertexPressure[v] = val; vertexCp[v] = val / (0.5 * props.density * velocity * velocity);
  }
  // Heat.
  let heat = 0, nusselt = 0;
  if (th) {
    const rcF = props.density * props.cp;
    heat = lat.heatToFluid * rcF * dxM ** 3 / dt;    // scalar flux × ρc × cell volume per step
    const dT = (th.fixedBody ? th.Tbody : (thermal.body?.value ?? 0)) - th.Tin;
    const A = S.area * 1e-6;
    if (th.fixedBody && Math.abs(dT) > 0 && A > 0) nusselt = (heat / (A * dT)) * lcM / props.k;
  }
  // Strouhal from the lift history (transient).
  let strouhal = 0;
  if (transient && lat.forceHistory.length > 20) {
    const ys = lat.forceHistory.map((x) => x.force[lateral1]), half = Math.floor(ys.length / 2), tail = ys.slice(half);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    let crossings = 0; for (let i = 1; i < tail.length; i++) if ((tail[i - 1] - mean) * (tail[i] - mean) < 0) crossings++;
    const span = (lat.forceHistory.at(-1).step - lat.forceHistory[half].step) * dt;
    const freq = span > 0 ? crossings / 2 / span : 0;
    strouhal = (freq * lcM) / velocity;
  }
  onProgress?.(1, { stage: 'done' });
  return {
    ok: true, error: lat.converged ? null : (transient ? null : 'not-converged'), ...lat, mode, axis, sign, origin, h, solid, fluidCells, cells: N,
    uLat, reynolds, reynoldsSimulated: reynolds, capped: false, velocity, fluid: props, dt, physicalTime: lat.steps * dt,
    forceVector: forceN, dragForce: drag, liftForce: forceN[lateral2] ?? 0, sideForce: forceN[lateral1] ?? 0,
    moments: fine.lat.torque.map((v) => v * toNf * dxF), blocks: blocks.map(({ rho: _r, vel: _v, solid: _s, ...b }) => b), refined: blocks.length, dragCoefficient, frontalArea, pressureDrop, meanVelocity: velocity, maxVelocity: vmax * scaleV,
    hydraulicDiameter: mode === 'internal' ? lcCells * h : 0, characteristicLength: lcCells * h, elements: fluidCells, elementSize: h,
    vertexPressure, vertexCp, heat, nusselt, strouhal, collision, les, tau,
    history: lat.forceHistory.map((x) => ({ time: x.step * dt, force: x.force.map((v) => v * toN), heat: th ? x.heat * props.density * props.cp * dxM ** 3 / dt : 0 })),
    snapshots,
  };
}

/** A scalar at a world point from the fluid cells around it (trilinear over the fluid ones), or null. */
export function sampleScalar(flow, p, value, reach = 1) {
  const { dims, origin, h, solid } = flow;
  const c = [0, 1, 2].map((a) => (p[a] - origin[a]) / h - 0.5), i0 = c.map(Math.floor);
  let sum = 0, wsum = 0;
  for (let dk = 1 - reach; dk <= reach; dk++) for (let dj = 1 - reach; dj <= reach; dj++) for (let di = 1 - reach; di <= reach; di++) {
    const ii = [i0[0] + di, i0[1] + dj, i0[2] + dk];
    if (ii.some((v, a) => v < 0 || v >= dims[a])) continue;
    const s = ii[0] + dims[0] * (ii[1] + dims[1] * ii[2]);
    if (solid[s]) continue;
    const wgt = [0, 1, 2].reduce((t, a) => t * Math.max(0, 1 - Math.abs(c[a] - ii[a]) / reach), 1);
    if (wgt <= 0) continue;
    sum += wgt * value(s); wsum += wgt;
  }
  return wsum > 1e-9 ? sum / wsum : null;
}
