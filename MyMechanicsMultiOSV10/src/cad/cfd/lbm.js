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
// Rotating bodies (a rotor, an impeller as a frozen rotor): their walls move with u_w = ω × r — bounce-back with the
// moving-wall term −6 wᵢ ρ (cᵢ·u_w) at the wall point of each link — and the torque about the axis gives the shaft power.
// Boundaries: velocity inlet and pressure outlet (non-equilibrium extrapolation), free-slip, no-slip or periodic sides.
// Heat: passive-scalar advection–diffusion on D3Q7 in the fluid and conduction in the solid (conjugate heat transfer;
// the solid's lattice diffusivity follows the conductivity ratio and its cells hold its own ρc (the equilibrium's
// rest population carries σ = ρc_solid / ρc_fluid), so steady and transient temperatures are right); body at a
// fixed temperature, with a heat power, or
// just conducting; optional Boussinesq buoyancy (Guo forcing) for natural convection.
// Electronics cooling: further solid components (boards, chips, heat sinks) each with its own power, ρc and
// conductivity — per axis for a board (the D3Q7 flux of each axis relaxes at its own rate: a diagonal conductivity
// tensor) — reported per component (mean, maximum, junction T_case + θ_jc P).
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
    transient = false, samples = 100, onSample = null, onProgress = null, cancel = null, center = null, fixedCells = null, rotation = null } = config;
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
  // Warm start from an earlier run on the same grid (the nested blocks' coupling iterations); taken over, not copied.
  const init = config.initialState;
  if (init && init.length === Q * N) { if (init instanceof f.constructor) f = init; else f.set(init); }
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
    for (let s = 0; s < N; s++) { const fx = th.cell ? th.cell.fixed[s] === 1 : th.fixedBody; const T0 = solid[s] === 1 && fx ? th.Tbody : Tcell[s]; Tcell[s] = T0; for (let q = 0; q < 7; q++) tg[7 * s + q] = TW[q] * T0; if (solid[s] === 1) tg[7 * s] += ((th.cell ? th.cell.sig[s] : th.sigmaS ?? 1) - 1) * T0; }
  }
  const bg = th?.buoyancy;

  const forceOut = [0, 0, 0], torqueOut = [0, 0, 0], sum = [0, 0, 0], sumT = [0, 0, 0], forceHistory = [];
  let steps_ = 0, converged = false, unstable = false, averaged = 0, prevMon = 0, stable = 0, heatToFluid = 0, heatSum = 0, uPrev = null, Tprev = null;
  const residuals = [];
  const avgWindow = Math.max(100, Math.round(Math.min(steps * 0.1, 1000)));
  const sampleEvery = Math.max(1, Math.floor(steps / Math.max(1, samples)));
  const ci = center ?? [nx / 2, ny / 2, nz / 2];
  const mrtRate = Float64Array.from(MRT.groups, (gname) => (gname === 'nu' ? -1 : rates[gname]));
  // Rotation: { axis (unit vector), center (cells), omega (rad per step), mask (solid cells that turn; all when absent) }.
  const rot = rotation ? { ...rotation, axis: rotation.axis.map((v) => v / Math.hypot(...rotation.axis)) } : null;
  const K = { cx, cy, cz, w, opp, fx0, fy0, fz0, bg, Tcell, tau, cs2, collision, feq, fc, mom, src, mrtRate, lambdaTRT, nx, ny, nz, ci, rot };
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
    // Holding both ρ and u on a block's edge over-constrains it (drag 8 % high against a uniform fine grid); mode 2
    // holds both, for the coarser grid's cells covered by a finer block (its solution fed back: two-way nesting).
    if (fixedCells) for (let q2 = 0; q2 < fixedCells.cells.length; q2++) {
      const sc = fixedCells.cells[q2]; const o = Q * sc, mode = fixedCells.outlet[q2];
      if (mode === 2) { feqCell(fixedCells.rho[q2], fixedCells.vel[3 * q2], fixedCells.vel[3 * q2 + 1], fixedCells.vel[3 * q2 + 2], g, o); continue; }
      // Non-equilibrium extrapolation from the neighbour inward (as on the domain's open faces): a bare equilibrium
      // edge drops the viscous stress there and distorts the block's flow a few cells deep.
      const t = fixedCells.inner ? fixedCells.inner[q2] : -1;
      if (t >= 0) {
        const mt = moments(g, t);
        if (mode) feqCell(fixedCells.rho[q2], mt[1], mt[2], mt[3], tmp, 0); else feqCell(mt[0], fixedCells.vel[3 * q2], fixedCells.vel[3 * q2 + 1], fixedCells.vel[3 * q2 + 2], tmp, 0);
        feqCell(mt[0], mt[1], mt[2], mt[3], nb, 0);
        for (let q = 0; q < Q; q++) g[o + q] = tmp[q] + (g[Q * t + q] - nb[q]);
        continue;
      }
      let r0 = 0, x = 0, y = 0, z = 0; for (let q = 0; q < Q; q++) { const v = g[o + q]; r0 += v; x += v * cx[q]; y += v * cy[q]; z += v * cz[q]; }
      if (mode) feqCell(fixedCells.rho[q2], x / r0, y / r0, z / r0, g, o);
      else feqCell(r0, fixedCells.vel[3 * q2], fixedCells.vel[3 * q2 + 1], fixedCells.vel[3 * q2 + 2], g, o);
    }
    // Absorbing layer inside a block's edge: the equilibrium part is nudged toward the driving solution (strength σ,
    // fading inward), so eddies leaving the block are damped instead of reflected from its held edge.
    const sp = fixedCells?.sponge;
    if (sp) for (let q2 = 0; q2 < sp.cells.length; q2++) {
      const o = Q * sp.cells[q2], sg = sp.sigma[q2];
      let r0 = 0, x = 0, y = 0, z = 0; for (let q = 0; q < Q; q++) { const v = g[o + q]; r0 += v; x += v * cx[q]; y += v * cy[q]; z += v * cz[q]; }
      feqCell(sp.rho[q2], sp.vel[3 * q2], sp.vel[3 * q2 + 1], sp.vel[3 * q2 + 2], tmp, 0); feqCell(r0, x / r0, y / r0, z / r0, nb, 0);
      for (let q = 0; q < Q; q++) g[o + q] += sg * (tmp[q] - nb[q]);
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
  if (th) { temp = new Float32Array(N); for (let s = 0; s < N; s++) { let T = 0; for (let q = 0; q < 7; q++) T += tg[7 * s + q]; if (solid[s] === 1) T /= th.cell ? th.cell.sig[s] : th.sigmaS ?? 1; temp[s] = (solid[s] === 1 && (th.cell ? th.cell.fixed[s] === 1 : th.fixedBody) ? th.Tbody : T) + (th.Toffset ?? 0); } }
  const avgRho = (list) => (list.length ? list.reduce((t, [s]) => t + rho[s], 0) / list.length : 1);
  return {
    dims, rho, vel, temp, force: force_, torque: torque_, forceHistory, residuals, steps: steps_, converged: transient ? !unstable : converged, unstable,
    inletRho: avgRho(inletCells), outletRho: avgRho(outletCells), heatToFluid: averaged > 0 ? heatSum / averaged : heatToFluid,
    uIn, tau, flowAxis, flowSign, collision, smagorinsky, state: config.keepState ? f : undefined,
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
  const { cx, cy, cz, w, opp, nx, ny, ci, rot } = P;
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
      if (rot && d === -2) {
        // The wall point of the link, its velocity ω × r, and the moving-wall correction (ρ ≈ 1).
        const i = s % nx, rr = (s - i) / nx, j = rr % ny, k = (rr - j) / ny;
        const nz = P.nz ?? 1, t = ((i + cx[q] + nx) % nx) + nx * (((j + cy[q] + ny) % ny) + ny * ((k + cz[q] + nz) % nz));
        if (!rot.mask || rot.mask[t]) {
          const qf = qwall ? qwall[o + q] : -1, a = qf >= 0 ? qf : 0.5;
          const px = i + 0.5 + a * cx[q] - rot.center[0], py = j + 0.5 + a * cy[q] - rot.center[1], pz = k + 0.5 + a * cz[q] - rot.center[2];
          const [ax, ay, az] = rot.axis, om = rot.omega;
          const ux = om * (ay * pz - az * py), uy = om * (az * px - ax * pz), uz = om * (ax * py - ay * px);
          const cu = cx[q] * ux + cy[q] * uy + cz[q] * uz;
          const corr = 6 * w[q] * cu * (qf >= 0.5 ? 1 / (2 * qf) : 1);
          back -= corr;
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
    const cell = th.cell;
    const sig = cell && solid[s] === 1 ? cell.sig[s] : solid[s] === 1 ? th.sigmaS ?? 1 : solid[s] ? th.sigmaWall ?? 1 : 1;
    let T = 0; for (let q = 0; q < 7; q++) T += tg[o + q];
    T /= sig;
    let ux = 0, uy = 0, uz = 0, om;
    if (!solid[s]) {
      const fo = Q * s; let r = 0, mx = 0, my = 0, mz = 0;
      for (let q = 0; q < Q; q++) { const v = f[fo + q]; r += v; mx += v * cx[q]; my += v * cy[q]; mz += v * cz[q]; }
      ux = mx / r; uy = my / r; uz = mz / r; om = 1 / th.tauF;

      // Positivity of the D3Q7 equilibrium wᵢT(1 + 4cᵢ·u) needs |u| < 1/4: a local velocity beyond what the lattice
      // resolves (a coarse grid at a high Reynolds number) is capped at 0.2 for the heat it carries.
      const um = Math.hypot(ux, uy, uz); if (um > 0.2) { const k = 0.2 / um; ux *= k; uy *= k; uz *= k; th.capped = (th.capped ?? 0) + 1; }
      // Where the molecular diffusivity is far too small for the heat the lattice advects (cell Péclet above 8: τ → ½,
      // the BGK scalar then oscillates without bound) the cell takes the diffusivity |u|/2 (cell Péclet 2, τ = ½ + 2|u|)
      // — the grid-scale mixing a coarse lattice cannot resolve. Resolved cases (Péclet up to 8) are left alone.
      const uc = Math.min(um, 0.2); if (th.tauF - 0.5 < 0.5 * uc) { om = 1 / Math.max(th.tauF, 0.5 + 2 * uc); th.pecletLimited = (th.pecletLimited ?? 0) + 1; }
    } else om = 1 / (solid[s] === 1 ? th.tauS : th.tauWall ?? th.tauS);
    const fixedHere = solid[s] === 1 && (cell ? cell.fixed[s] === 1 : th.fixedBody);
    if (fixedHere) T = th.Tbody;
    Tcell[s] = T;
    if (cell && solid[s] === 1 && !fixedHere) {
      // Per-axis relaxation of the flux (antisymmetric) parts: a diagonal conductivity tensor; the rest at the mean rate.
      const t3 = cell.tau, o3 = 3 * s, om0 = 3 / (t3[o3] + t3[o3 + 1] + t3[o3 + 2]);
      tg[o] -= om0 * (tg[o] - (TW[0] * T + (sig - 1) * T));
      for (let a = 0; a < 3; a++) {
        const p = 1 + 2 * a, m = 2 + 2 * a, fp = tg[o + p], fm = tg[o + m];
        const sym = fp + fm, asym = fp - fm, eqs = 2 * TW[p] * T;
        const ns = sym - om0 * (sym - eqs), na = asym * (1 - 1 / t3[o3 + a]);
        tg[o + p] = 0.5 * (ns + na); tg[o + m] = 0.5 * (ns - na);
      }
      tg[o] += cell.src[s];
    } else {
      for (let q = 0; q < 7; q++) {
        const eq = TW[q] * T * (1 + 4 * (TX[q] * ux + TY[q] * uy + TZ[q] * uz)) + (q === 0 ? (sig - 1) * T : 0);
        tg[o + q] = fixedHere ? eq : tg[o + q] - om * (tg[o + q] - eq);
      }
      if (solid[s] === 1 && !cell && th.source) tg[o] += th.source;
    }
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
export function voxelize(S, origin, h, dims) {
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
    collision = 'trt', les = 0.12, uLat: uLat0 = 0.06, time = { mode: 'steady' }, thermal = null, maxCells = 3e6, onProgress = null, cancel = null, rotation = null } = opts;
  let uLat = uLat0;
  const comps = (thermal?.components ?? []).filter((c) => c?.mesh?.vertices?.length);
  // No main mesh (electronics: every solid is a component) — the grid is made around the components.
  const S = surfaceModel(comps.length ? joinMeshes([...(mesh ? [mesh] : []), ...comps.map((c) => c.mesh)]) : mesh);
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
  // Which solid cells belong to which component (-1: the main body).
  const compCell = comps.length ? new Int16Array(N).fill(-1) : null;
  comps.forEach((c, ci) => { const cv = voxelize(surfaceModel(c.mesh), origin, h, dims); for (let s = 0; s < N; s++) if (cv[s] && solid[s] === 1) compCell[s] = ci; });
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
    // Steady runs: the steady temperatures do not depend on the heat capacities, so every solid takes the fluid's ρc
    // (σ = 1) and settles on the flow's time scale (a pseudo-transient); transient runs keep the real ρc.
    const rcS = (thermal.body?.density ?? 7850) * (thermal.body?.cp ?? 500), sigmaS = transient ? rcS / (props.density * props.cp) : 1;
    const tauF = 0.5 + 4 * aLat, tauS = Math.min(0.5 + 4 * aS, 50);
    const Tin = thermal.inlet ?? 20, bm = thermal.body?.mode ?? 'temperature';
    // The lattice carries the rise above the inlet θ = T − T_in: the flow's slight compressibility (−θ∇·u) then errs in
    // proportion to the rise, and air nothing heats stays exactly at the inlet temperature.
    th = { tauF, tauS, sigmaS, Tin: 0, Tinit: 0, Toffset: Tin, fixedBody: bm === 'temperature', Tbody: bm === 'temperature' ? (thermal.body?.value ?? 60) - Tin : 0 };
    if (bm === 'power' && solidCells) {
      // Steady balance k_s ∇²T + q''' = 0 on the lattice (α_s,lat ∇²_lat T + s = 0): s = α_s,lat · dx² · q''' / k_s per step.
      const Pw = thermal.body?.value ?? 10, qv = Pw / (solidCells * dxM ** 3);
      th.source = (aS * dxM * dxM * qv) / ks;
    }
    if (compCell) {
      // Per-cell properties: the main body as set, each component its own ρc, conductivity (per axis) and power.
      const cell = { sig: new Float64Array(N).fill(1), tau: new Float64Array(3 * N).fill(tauS), src: new Float64Array(N), fixed: new Uint8Array(N) };
      const counts = comps.map(() => 0); for (let s = 0; s < N; s++) if (compCell[s] >= 0) counts[compCell[s]]++;
      let mainCells = 0; for (let s = 0; s < N; s++) if (solid[s] === 1 && compCell[s] < 0) mainCells++;
      const mainSrc = bm === 'power' && mainCells ? (aLat * dxM * dxM * ((thermal.body?.value ?? 10) / (mainCells * dxM ** 3))) / props.k : 0;
      for (let s = 0; s < N; s++) {
        if (solid[s] !== 1) continue;
        const ci = compCell[s];
        if (ci < 0) { cell.sig[s] = sigmaS; cell.fixed[s] = bm === 'temperature' ? 1 : 0; cell.src[s] = mainSrc; continue; }
        const c = comps[ci], k3 = Array.isArray(c.k) ? c.k : [c.k ?? 50, c.k ?? 50, c.k ?? 50];
        cell.sig[s] = transient ? ((c.density ?? 2000) * (c.cp ?? 900)) / (props.density * props.cp) : 1;
        for (let a = 0; a < 3; a++) cell.tau[3 * s + a] = Math.min(0.5 + 4 * aLat * (k3[a] / props.k), 50);
        cell.src[s] = counts[ci] && c.power ? (aLat * dxM * dxM * (c.power / (counts[ci] * dxM ** 3))) / props.k : 0;
      }
      th.cell = cell;
      th.compCounts = counts;
    }
    if (thermal.buoyancy) {
      const gLat = (9.81 * dt * dt) / dxM, b = props.beta ?? 3.4e-3;
      th.buoyancy = { g: [0, 0, gLat * b], Tref: 0 };     // Z up: warmer fluid rises (acceleration +Z per kelvin)
    }
  }
  // Body centre (cells) for the moments.
  const ctr = [0, 1, 2].map((a) => ((S.lo[a] + S.hi[a]) / 2 - origin[a]) / h - 0.5);
  const snapshots = [];
  const levels = mode === 'external' && !compCell && !rotation ? Math.max(0, Math.min(3, Math.round(opts.refine ?? 0))) : 0;
  // A rotating body (rotation: { axis 'x' | 'y' | 'z' | vector, center mm (default: the body's middle), rpm }): its walls
  // move with ω × r; the torque is taken about the rotation centre.
  let rot = null;
  if (rotation && Number(rotation.rpm)) {
    const ax = Array.isArray(rotation.axis) ? rotation.axis : { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[rotation.axis ?? 'z'];
    const cmm = rotation.center ?? [0, 1, 2].map((a) => (S.lo[a] + S.hi[a]) / 2);
    const omega = (Number(rotation.rpm) * 2 * Math.PI) / 60;
    rot = { axis: ax, center: cmm.map((v, a) => (v - origin[a]) / h), omega: omega * dt, omegaPhys: omega, rpm: Number(rotation.rpm), centerMm: cmm };
  }
  const coarseCfg = {
    dims, solid, qwall, flowAxis: fa, flowSign: sign, sides, tau, collision, smagorinsky: les, uIn: uLat, thermal: th, steps, rotation: rot ? { axis: rot.axis, center: rot.center, omega: rot.omega } : null, minSteps: Math.min(steps, Math.round(1.5 * flowThrough)), tol: time.tol ?? 2e-7,
    transient, samples: transient ? 200 : 100, center: rot ? rot.center.map((v) => v - 0.5) : ctr, cancel, ramp: Math.round(Math.min(steps * 0.2, 0.6 * flowThrough)), keepState: levels > 0,
    onProgress: (f, info) => onProgress?.(0.05 + (levels ? 0.45 : 0.9) * f, { stage: 'flow', ...info }),
  };
  let lat = latticeRun(coarseCfg);
  if (lat.unstable) return { ok: false, error: 'unstable', reynolds, tau, cells: N };
  // Multi-resolution: nested blocks around the body, each with half the cell size (acoustic scaling: same lattice
  // velocity, ν_lat and τ − ½ doubled per level). Two-way coupling by alternating Schwarz iterations: a block's edge is
  // driven by the next coarser solution (velocity inlet upstream and on the sides, pressure outlet downstream), and
  // the coarser grid's cells well inside the block take the block's solution back — so the coarse flow around the
  // block sees the wake the fine grid resolves. Sweeps over all levels repeat (warm-started) until the drag on the
  // finest block settles. One-way driving alone read the drag 5 % high at one level against a uniform fine grid.
  // Forces and the surface pressure come from the finest block.
  const L = [{ level: 0, origin, h, dims, solid, tau, center: ctr, cfg: coarseCfg, lat }];
  const centre = (B, s) => { const i = s % B.dims[0], r = (s - i) / B.dims[0], j = r % B.dims[1], k = (r - j) / B.dims[1]; return [B.origin[0] + (i + 0.5) * B.h, B.origin[1] + (j + 0.5) * B.h, B.origin[2] + (k + 0.5) * B.h]; };
  for (let lvl = 1; lvl <= levels; lvl++) {
    const P = L[lvl - 1];
    // Margins (body sizes) shrink inward: each block's boundary stays well outside the next one's near field.
    const hf = P.h / 2, mg = Math.max(6 * hf, (opts.blockMargin ?? 1) * across * (1 + 0.5 * (levels - lvl)));
    const lo = S.lo.map((v, a) => v - (a === fa ? (sign > 0 ? mg : 2 * mg) : mg)), hi = S.hi.map((v, a) => v + (a === fa ? (sign > 0 ? 2 * mg : mg) : mg));
    // Inside the coarser grid by two of its cells.
    for (let a = 0; a < 3; a++) { lo[a] = Math.max(lo[a], P.origin[a] + 2 * P.h); hi[a] = Math.min(hi[a], P.origin[a] + (P.dims[a] - 2) * P.h); }
    const dimsF = [0, 1, 2].map((a) => Math.max(4, Math.ceil((hi[a] - lo[a]) / hf)));
    if (dimsF[0] * dimsF[1] * dimsF[2] > maxCells) break;
    const solidF = voxelize(S, lo, hf, dimsF), qF = wallFractions(S, lo, hf, dimsF, solidF);
    const edge = [], edgeMode = [], edgeInner = [];
    for (let k = 0; k < dimsF[2]; k++) for (let j = 0; j < dimsF[1]; j++) for (let i = 0; i < dimsF[0]; i++) {
      if (i && j && k && i < dimsF[0] - 1 && j < dimsF[1] - 1 && k < dimsF[2] - 1) continue;
      const sF = i + dimsF[0] * (j + dimsF[1] * k); if (solidF[sF]) continue;
      edge.push(sF); edgeMode.push([i, j, k][fa] === (sign > 0 ? dimsF[fa] - 1 : 0) ? 1 : 0);
      // The neighbour one step inward (diagonally at edges and corners), for the non-equilibrium part.
      const c = [i, j, k].map((v, a) => (v === 0 ? 1 : v === dimsF[a] - 1 ? v - 1 : v)), t = c[0] + dimsF[0] * (c[1] + dimsF[1] * c[2]);
      edgeInner.push(solidF[t] ? -1 : t);
    }
    const tauF = 0.5 + 2 * (P.tau - 0.5), u0 = [0, 0, 0]; u0[fa] = sign * uLat;
    const ctrF = [0, 1, 2].map((a) => ((S.lo[a] + S.hi[a]) / 2 - lo[a]) / hf - 0.5);
    const throughF = dimsF[fa] / uLat;
    const cfg = {
      dims: dimsF, solid: solidF, qwall: qF, flowAxis: fa, flowSign: sign, sides: ['open', 'open', 'open'], inlet: 'none', outlet: 'none', tau: tauF, collision, smagorinsky: les, uIn: uLat,
      initialVelocity: u0, steps: Math.min(time.maxSteps ?? 20000, Math.max(2000, Math.round(0.8 * (time.passes ?? 10) * throughF))), minSteps: Math.round(4 * throughF), tol: time.tol ?? 2e-7, center: ctrF, cancel, keepState: true,
      onProgress: (fr, info) => onProgress?.(Math.min(0.99, 0.5 + 0.45 * ((lvl - 1 + fr) / levels)), { stage: 'flow', level: lvl, ...info }),
    };
    L.push({ level: lvl, origin: lo, h: hf, dims: dimsF, solid: solidF, tau: tauF, center: ctrF, cfg, edge: Int32Array.from(edge), edgeMode: Uint8Array.from(edgeMode), edgeInner: Int32Array.from(edgeInner), through: throughF, cells: dimsF[0] * dimsF[1] * dimsF[2] });
  }
  /** The fixed cells of level n: its edge from level n − 1, and its cells two of its cells inside level n + 1 from that one. */
  const gridOf = (B) => ({ dims: B.dims, origin: B.origin, h: B.h, solid: B.solid });
  // Absorbing layer on a block's downstream face: four cells, σ 0.1 at the edge. At Re ≈ 2000 a block without it blew
  // up within ~1200 steps (eddies reflected from its held outlet); at Re ≈ 50 it moves the drag by 0.2 %. Not on the
  // other faces: there it pulled the block toward the coarse solution (drag 9 % high).
  const SPONGE = 4, SPONGE_SIGMA = 0.1;
  const fixedFor = (n) => {
    const B = L[n], cellsX = [], rhoX = [], velX = [], modeX = [], innerX = [];
    let sponge = null;
    if (n > 0) {
      const P = L[n - 1], g = gridOf(P);
      B.edge.forEach((s, q) => {
        const p = centre(B, s);
        cellsX.push(s); modeX.push(B.edgeMode[q]); innerX.push(B.edgeInner[q]);
        rhoX.push(sampleScalar(g, p, (t) => P.lat.rho[t]) ?? 1);
        for (let a = 0; a < 3; a++) velX.push(sampleScalar(g, p, (t) => P.lat.vel[3 * t + a]) ?? (a === fa ? sign * uLat : 0));
      });
      // The absorbing layer: SPONGE cells deep from the downstream face, σ falling quadratically from SPONGE_SIGMA.
      {
        const sc = [], sr = [], sv = [], ss = [];
        for (let k = 1; k < B.dims[2] - 1; k++) for (let j = 1; j < B.dims[1] - 1; j++) for (let i = 1; i < B.dims[0] - 1; i++) {
          const cc = [i, j, k];
          const d = sign > 0 ? B.dims[fa] - 1 - cc[fa] : cc[fa];
          if (d > SPONGE) continue;
          const s = i + B.dims[0] * (j + B.dims[1] * k); if (B.solid[s]) continue;
          const p = centre(B, s);
          sc.push(s); ss.push(SPONGE_SIGMA * ((SPONGE + 1 - d) / SPONGE) ** 2);
          sr.push(sampleScalar(g, p, (t) => P.lat.rho[t]) ?? 1);
          for (let a = 0; a < 3; a++) sv.push(sampleScalar(g, p, (t) => P.lat.vel[3 * t + a]) ?? (a === fa ? sign * uLat : 0));
        }
        sponge = { cells: Int32Array.from(sc), rho: Float32Array.from(sr), vel: Float32Array.from(sv), sigma: Float32Array.from(ss) };
      }
    }
    const C = L[n + 1];
    if (C?.lat) {
      // Only from eight of the finer cells inside its edge: nearer, the block's own flow still carries its driven edge
      // (six cells fed back oscillated between sweeps, four converged 12 % low); ten left too little fed back (4 % high).
      const g = gridOf(C), ov = 4 * B.h;
      const lo = [0, 1, 2].map((a) => C.origin[a] + ov), hi = [0, 1, 2].map((a) => C.origin[a] + C.dims[a] * C.h - ov);
      const i0 = lo.map((v, a) => Math.max(0, Math.floor((v - B.origin[a]) / B.h))), i1 = hi.map((v, a) => Math.min(B.dims[a] - 1, Math.ceil((v - B.origin[a]) / B.h)));
      const onEdge = n > 0 ? new Set(B.edge) : null;
      for (let k = i0[2]; k <= i1[2]; k++) for (let j = i0[1]; j <= i1[1]; j++) for (let i = i0[0]; i <= i1[0]; i++) {
        const s = i + B.dims[0] * (j + B.dims[1] * k);
        if (B.solid[s] || onEdge?.has(s)) continue;
        const p = centre(B, s);
        if (p.some((v, a) => v <= lo[a] || v >= hi[a])) continue;
        const r = sampleScalar(g, p, (t) => C.lat.rho[t]); if (r == null) continue;
        cellsX.push(s); modeX.push(2); innerX.push(-1); rhoX.push(r);
        for (let a = 0; a < 3; a++) velX.push(sampleScalar(g, p, (t) => C.lat.vel[3 * t + a]) ?? 0);
      }
    }
    return cellsX.length ? { cells: Int32Array.from(cellsX), rho: Float32Array.from(rhoX), vel: Float32Array.from(velX), outlet: Uint8Array.from(modeX), inner: Int32Array.from(innerX), sponge } : null;
  };
  /** Runs level n with its current fixed cells; warm = a coupling sweep, starting from its last state. */
  const runLevel = (n, warm) => {
    const B = L[n];
    const cfg = { ...B.cfg, fixedCells: fixedFor(n) };
    if (warm) { cfg.initialState = B.lat.state; cfg.ramp = 0; cfg.minSteps = Math.round(n ? B.through : 0.5 * flowThrough); }
    const r = latticeRun(cfg);
    if (r.unstable) return false;
    B.lat = r; B.steps = (B.steps ?? 0) + r.steps;
    return true;
  };
  let built = 0, refineFailed = 0;
  for (let n = 1; n < L.length; n++) { if (!runLevel(n, false)) { refineFailed = n; break; } built = n; }
  if (L.length - 1 > built && !refineFailed) refineFailed = built + 1;
  L.length = built + 1;
  const coupling = [];
  if (built > 0 && !transient) {
    let prev = L[built].lat.force[fa];
    for (let it = 0; it < (opts.couplingIterations ?? 4) && !cancel?.(); it++) {
      let ok = true;
      for (let n = 0; n <= built && ok; n++) ok = runLevel(n, true);
      if (!ok) break;
      const now = L[built].lat.force[fa], change = Math.abs(now - prev) / Math.max(1e-12, Math.abs(now));
      coupling.push(change); prev = now;
      if (change < (opts.couplingTol ?? 0.005)) break;
    }
  }
  for (const B of L) B.lat.state = undefined;
  lat = L[0].lat;
  const blocks = L.slice(1).map((B) => ({ level: B.level, origin: B.origin, h: B.h, dims: B.dims, cells: B.cells, steps: B.steps, converged: B.lat.converged, rho: B.lat.rho, vel: B.lat.vel, solid: B.solid }));
  const top = L[built];
  const fine = { lat: top.lat, origin: top.origin, h: top.h, dims: top.dims, solid: top.solid, tau: top.tau, center: top.center };
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
  const nv = mesh ? mesh.vertices.length / 3 : 0, vertexPressure = new Float32Array(nv), vertexCp = new Float32Array(nv), normals = mesh?.normals;
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
  // Electronics: each component's temperatures (and the junction, T_case max + θ_jc · P).
  const components = [];
  if (th?.cell && compCell) {
    const T = fine.lat.temp;
    comps.forEach((c, ci) => {
      let mx = -Infinity, sum = 0, n = 0;
      for (let s = 0; s < N; s++) if (compCell[s] === ci) { mx = Math.max(mx, T[s]); sum += T[s]; n++; }
      const P = c.power ?? 0;
      components.push({ name: c.name ?? `C${ci + 1}`, power: P, cells: n, max: n ? mx : null, mean: n ? sum / n : null, junction: n && c.thetaJC != null ? mx + c.thetaJC * P : null, limit: c.limit ?? null, over: n && c.limit != null ? (c.thetaJC != null ? mx + c.thetaJC * P : mx) > c.limit : false });
    });
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
    moments: fine.lat.torque.map((v) => v * toNf * dxF), blocks: blocks.map(({ rho: _r, vel: _v, solid: _s, ...b }) => b), refined: blocks.length, refineRequested: levels, refineFailed, coupling, couplingSettled: !coupling.length || coupling.at(-1) < (opts.couplingTol ?? 0.005), dragCoefficient, frontalArea, pressureDrop, meanVelocity: velocity, maxVelocity: vmax * scaleV,
    hydraulicDiameter: mode === 'internal' ? lcCells * h : 0, characteristicLength: lcCells * h, elements: fluidCells, elementSize: h,
    vertexPressure, vertexCp, heat, nusselt, strouhal, collision, les, tau, components, inletArea: inletArea * h * h,
    rotation: rot ? (() => { const n = rot.axis.map((v) => v / Math.hypot(...rot.axis)); const M = fine.lat.torque.map((v) => v * toNf * dxF); const torque = M[0] * n[0] + M[1] * n[1] + M[2] * n[2]; return { rpm: rot.rpm, axis: n, center: rot.centerMm, torque, power: -torque * rot.omegaPhys }; })() : null,
    history: lat.forceHistory.map((x) => ({ time: x.step * dt, force: x.force.map((v) => v * toN), heat: th ? x.heat * props.density * props.cp * dxM ** 3 / dt : 0 })),
    snapshots,
  };
}

/** Several surface meshes as one (disjoint closed bodies: the ray parity still finds each one's inside). */
export function joinMeshes(list) {
  let nv = 0, nt = 0; for (const m of list) { nv += m.vertices.length; nt += m.triangles.length; }
  const vertices = new Float32Array(nv), triangles = new Uint32Array(nt);
  let vo = 0, to = 0;
  for (const m of list) { vertices.set(m.vertices, vo); for (let i = 0; i < m.triangles.length; i++) triangles[to + i] = m.triangles[i] + vo / 3; vo += m.vertices.length; to += m.triangles.length; }
  return { vertices, triangles };
}

/**
 * Electronics cooling with a fan: the fan curve Δp = p_max (1 − Q / Q_max) meets the system curve Δp = c Q², c from a
 * first run at `velocity`; the study runs again at that operating point. fan: { maxFlow (m³/s), maxPressure (Pa) }.
 */
export function fanOperatingPoint(dp1, q1, fan) {
  const c = dp1 / Math.max(1e-30, q1 * q1), b = fan.maxPressure / fan.maxFlow;
  const Q = (-b + Math.sqrt(b * b + 4 * c * fan.maxPressure)) / (2 * c);
  return { flow: Q, pressure: fan.maxPressure * (1 - Q / fan.maxFlow), systemCoefficient: c };
}
export function fanFlowStudy(mesh, opts) {
  const { fan, velocity = 1 } = opts;
  const r1 = flowStudy(mesh, { ...opts, velocity });
  if (!r1.ok && r1.error !== 'not-converged') return r1;
  const A = r1.inletArea * 1e-6, q1 = velocity * A;
  const op = fanOperatingPoint(Math.max(1e-9, r1.pressureDrop), q1, fan);
  const v = op.flow / A;
  const r2 = flowStudy(mesh, { ...opts, velocity: v });
  if (!r2.ok && r2.error !== 'not-converged') return r2;
  return { ...r2, fan: { ...op, velocity: v, systemPressure: r2.pressureDrop, mismatch: Math.abs(r2.pressureDrop - op.pressure) / Math.max(1e-9, op.pressure), firstRun: { velocity, pressureDrop: r1.pressureDrop } } };
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
