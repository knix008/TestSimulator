// Free-surface flow on the lattice (no DOM): a liquid with a free surface under gravity — a tank sloshing, a dam
// breaking, a glass filling — by the free-surface lattice Boltzmann method (Körner et al. 2005, Thürey 2007).
//   cells       fluid (full), interface (part full: mass m, fill ε = m / ρ), gas (empty, the atmosphere at a fixed
//               pressure), wall (no-slip bounce-back)
//   streaming   between fluid and interface cells the populations move as usual and the mass of the interface
//               changes by what flows in minus what flows out (between two interface cells weighted by their mean
//               fill); from a gas cell nothing real arrives: the population is rebuilt so that the gas pressure
//               holds, f_ī = f_i^eq(ρ_A, u) + f_ī^eq(ρ_A, u) − f_i
//   collision   BGK with Smagorinsky large-eddy damping (water is near-inviscid on any practical grid) and gravity
//               added as a force
//   conversion  an interface cell fuller than (1 + κ) becomes fluid (its gas neighbours become interface, started
//               from the average of their neighbours), emptier than −κ becomes gas (its fluid neighbours become
//               interface); the excess mass is passed on, so the liquid's mass is kept
// Units (study): mm, s, m/s; the lattice runs with dt from the fastest expected speed √(2 g H).

const Q = 19;
const CX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const CY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
const CZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
const W = CX.map((_, i) => (i === 0 ? 1 / 3 : i < 7 ? 1 / 18 : 1 / 36));
const OPP = CX.map((_, i) => CX.findIndex((__, j) => CX[j] === -CX[i] && CY[j] === -CY[i] && CZ[j] === -CZ[i]));
export const CELL = { GAS: 0, FLUID: 1, INTERFACE: 2, WALL: 3 };
const KAPPA = 1e-3;

const feq = (q, rho, ux, uy, uz) => { const cu = 3 * (CX[q] * ux + CY[q] * uy + CZ[q] * uz); return W[q] * rho * (1 + cu + 0.5 * cu * cu - 1.5 * (ux * ux + uy * uy + uz * uz)); };

/**
 * The lattice run. config: { dims, type (Uint8Array per cell: CELL), fill (Float64Array 0..1 for interface cells),
 * tau, gravity [gx, gy, gz] (lattice), steps, smagorinsky, every (frames), periodic: [bool ×3], onFrame }.
 * Returns { type, fill, rho, vel, mass history, frames: [{ step, fill (Float32Array) }] }.
 */
export function freeSurfaceRun(config) {
  const { dims, tau = 0.6, gravity = [0, 0, -1e-4], steps = 1000, smagorinsky = 0.15, every = 0, periodic = [false, false, false], onFrame = null, cancel = null } = config;
  const [nx, ny, nz] = dims, N = nx * ny * nz;
  const type = Uint8Array.from(config.type);
  const f = new Float64Array(Q * N), g = new Float64Array(Q * N);
  const rho = new Float64Array(N).fill(1), mass = new Float64Array(N), vel = new Float64Array(3 * N);
  // Neighbour of each cell along each direction (−1: outside a non-periodic side, treated as a wall).
  const nb = new Int32Array(Q * N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = i + nx * (j + ny * k);
    for (let q = 0; q < Q; q++) {
      let a = i + CX[q], b = j + CY[q], c = k + CZ[q];
      if (periodic[0]) a = (a + nx) % nx; if (periodic[1]) b = (b + ny) % ny; if (periodic[2]) c = (c + nz) % nz;
      nb[Q * s + q] = a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz ? -1 : a + nx * (b + ny * c);
    }
  }
  const tp = (t) => (t < 0 ? CELL.WALL : type[t]);
  // Start at rest with the given density (hydrostatic when the caller gives it: no pressure waves to ring down).
  for (let s = 0; s < N; s++) {
    const r0 = config.rho0?.[s] ?? 1;
    rho[s] = r0;
    const m = type[s] === CELL.FLUID ? r0 : type[s] === CELL.INTERFACE ? r0 * Math.min(1, Math.max(0, config.fill?.[s] ?? 0.5)) : 0;
    mass[s] = m;
    for (let q = 0; q < Q; q++) f[Q * s + q] = W[q] * r0;
  }
  const [gx, gy, gz] = gravity;
  const frames = [], history = [];
  const totalMass = () => { let m = 0; for (let s = 0; s < N; s++) if (type[s] === CELL.FLUID || type[s] === CELL.INTERFACE) m += mass[s]; return m; };
  const m0 = totalMass();
  const fillOf = () => { const out = new Float32Array(N); for (let s = 0; s < N; s++) out[s] = type[s] === CELL.FLUID ? 1 : type[s] === CELL.INTERFACE ? Math.min(1, Math.max(0, mass[s] / Math.max(rho[s], 1e-9))) : 0; return out; };
  const toFluid = [], toGas = [];
  for (let step = 1; step <= steps; step++) {
    // ── stream with the free-surface rules, and the mass exchange of interface cells
    for (let s = 0; s < N; s++) {
      const ts = type[s];
      if (ts !== CELL.FLUID && ts !== CELL.INTERFACE) continue;
      const o = Q * s;
      const es = ts === CELL.FLUID ? 1 : mass[s] / Math.max(rho[s], 1e-9);
      let dm = 0;
      g[o] = f[o];
      for (let q = 1; q < Q; q++) {
        const qo = OPP[q], t = nb[o + qo];          // the population arriving at s along q comes from s − c_q
        const tt = tp(t);
        if (tt === CELL.WALL) { g[o + q] = f[o + qo]; continue; }
        if (tt === CELL.GAS) {
          // Rebuilt for the atmosphere (ρ_A = 1) with this cell's velocity.
          const ux = vel[3 * s], uy = vel[3 * s + 1], uz = vel[3 * s + 2];
          g[o + q] = feq(q, 1, ux, uy, uz) + feq(qo, 1, ux, uy, uz) - f[o + qo];
          continue;
        }
        const fin = f[Q * t + q], fout = f[o + qo];
        g[o + q] = fin;
        if (ts === CELL.INTERFACE) {
          if (tt === CELL.FLUID) dm += fin - fout;
          else { const et = mass[t] / Math.max(rho[t], 1e-9); dm += 0.5 * (es + et) * (fin - fout); }
        }
      }
      if (ts === CELL.INTERFACE) mass[s] += dm;
    }
    // ── collide (BGK + Smagorinsky + gravity force) in the liquid
    for (let s = 0; s < N; s++) {
      const ts = type[s];
      if (ts !== CELL.FLUID && ts !== CELL.INTERFACE) continue;
      const o = Q * s;
      let r = 0, mx = 0, my = 0, mz = 0;
      for (let q = 0; q < Q; q++) { const v = g[o + q]; r += v; mx += v * CX[q]; my += v * CY[q]; mz += v * CZ[q]; }
      let ux = mx / r + 0.5 * gx, uy = my / r + 0.5 * gy, uz = mz / r + 0.5 * gz;
      const um = Math.hypot(ux, uy, uz); if (um > 0.3) { ux *= 0.3 / um; uy *= 0.3 / um; uz *= 0.3 / um; }
      // Smagorinsky: the strain from the non-equilibrium stress.
      let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pyz = 0, pzx = 0;
      for (let q = 1; q < Q; q++) { const ne = g[o + q] - feq(q, r, ux, uy, uz); pxx += ne * CX[q] * CX[q]; pyy += ne * CY[q] * CY[q]; pzz += ne * CZ[q] * CZ[q]; pxy += ne * CX[q] * CY[q]; pyz += ne * CY[q] * CZ[q]; pzx += ne * CZ[q] * CX[q]; }
      const Pi = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pyz * pyz + pzx * pzx));
      const te = smagorinsky > 0 ? 0.5 * (tau + Math.sqrt(tau * tau + (18 * Math.SQRT2 * smagorinsky * smagorinsky * Pi) / r)) : tau;
      const om = 1 / te;
      for (let q = 0; q < Q; q++) {
        const cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz;
        const F = W[q] * (1 - 0.5 * om) * (3 * ((CX[q] - ux) * gx + (CY[q] - uy) * gy + (CZ[q] - uz) * gz) + 9 * cu * (CX[q] * gx + CY[q] * gy + CZ[q] * gz)) * r;
        g[o + q] += -om * (g[o + q] - feq(q, r, ux, uy, uz)) + F;
      }
      rho[s] = r; vel[3 * s] = ux; vel[3 * s + 1] = uy; vel[3 * s + 2] = uz;
      if (ts === CELL.FLUID) mass[s] = r;   // a full cell's mass is its density
    }
    // ── conversions (with the excess mass passed on to the neighbouring interface)
    toFluid.length = 0; toGas.length = 0;
    for (let s = 0; s < N; s++) {
      if (type[s] !== CELL.INTERFACE) continue;
      if (mass[s] > (1 + KAPPA) * rho[s]) toFluid.push(s);
      else if (mass[s] < -KAPPA * rho[s]) toGas.push(s);
      else {
        // An interface cell with no gas neighbour (enclosed) is liquid; with no liquid neighbour it is spray.
        let gas = false, liq = false;
        for (let q = 1; q < Q; q++) { const tt = tp(nb[Q * s + q]); if (tt === CELL.GAS) gas = true; else if (tt === CELL.FLUID) liq = true; }
        if (!gas && mass[s] > 0.99 * rho[s]) toFluid.push(s);
        else if (!liq && mass[s] < 0.01 * rho[s] && !hasInterfaceLiquid(s)) toGas.push(s);
      }
    }
    function hasInterfaceLiquid(s) { for (let q = 1; q < Q; q++) { const t = nb[Q * s + q]; if (t >= 0 && type[t] === CELL.INTERFACE && mass[t] > 0.1 * rho[t]) return true; } return false; }
    const newFluid = new Set(toFluid), newGas = new Set(toGas);
    for (const s of newFluid) {
      // Gas neighbours become interface, started from the average density and velocity of their liquid neighbours.
      for (let q = 1; q < Q; q++) {
        const t = nb[Q * s + q]; if (t < 0 || type[t] !== CELL.GAS) continue;
        let r = 0, ux = 0, uy = 0, uz = 0, n = 0;
        for (let p = 1; p < Q; p++) { const u = nb[Q * t + p]; if (u >= 0 && (type[u] === CELL.FLUID || type[u] === CELL.INTERFACE || newFluid.has(u))) { r += rho[u]; ux += vel[3 * u]; uy += vel[3 * u + 1]; uz += vel[3 * u + 2]; n++; } }
        r = n ? r / n : 1; ux = n ? ux / n : 0; uy = n ? uy / n : 0; uz = n ? uz / n : 0;
        type[t] = CELL.INTERFACE; mass[t] = 0; rho[t] = r; vel[3 * t] = ux; vel[3 * t + 1] = uy; vel[3 * t + 2] = uz;
        for (let p = 0; p < Q; p++) g[Q * t + p] = feq(p, r, ux, uy, uz);
      }
    }
    for (const s of newGas) for (let q = 1; q < Q; q++) {
      const t = nb[Q * s + q]; if (t >= 0 && type[t] === CELL.FLUID) { type[t] = CELL.INTERFACE; mass[t] = rho[t]; }
    }
    // Excess mass to the interface neighbours (along the surface normal's side, equally here).
    const distribute = (s, excess) => {
      const list = []; for (let q = 1; q < Q; q++) { const t = nb[Q * s + q]; if (t >= 0 && type[t] === CELL.INTERFACE && !newFluid.has(t) && !newGas.has(t)) list.push(t); }
      if (!list.length) return excess;
      for (const t of list) mass[t] += excess / list.length;
      return 0;
    };
    let lost = 0;
    for (const s of newFluid) { const ex = mass[s] - rho[s]; type[s] = CELL.FLUID; mass[s] = rho[s]; lost += distribute(s, ex); }
    for (const s of newGas) { const ex = mass[s]; type[s] = CELL.GAS; mass[s] = 0; lost += distribute(s, ex); }
    // What could not be passed on (no interface neighbour) is spread over all interface cells: mass is kept.
    if (lost) { let n = 0; for (let s = 0; s < N; s++) if (type[s] === CELL.INTERFACE) n++; if (n) for (let s = 0; s < N; s++) if (type[s] === CELL.INTERFACE) mass[s] += lost / n; }
    // Copy the streamed and collided populations back.
    f.set(g);
    if (every && step % every === 0) { const fr = { step, fill: fillOf() }; frames.push(fr); onFrame?.(fr); history.push({ step, mass: totalMass() }); }
    if (cancel?.()) break;
  }
  return { type, fill: fillOf(), rho, vel, mass, frames, history, massStart: m0, massEnd: totalMass() };
}

/**
 * A tank study in physical units: a box of inner size [lx, ly, lz] mm on a grid of cell h mm, liquid filling the
 * cells whose centres pass `liquid(x, y, z)` (mm, the box's corner at 0), gravity −z, for `duration` seconds.
 * Returns the run plus { dims, h, dt, frames (with time), columnHeights (per x at the end, mm) }.
 */
export function tankStudy({ size = [200, 20, 120], h = 4, liquid = (x, y, z) => x < 60 && z < 60, duration = 0.3, gravity = 9.81, fluid = { viscosity: 1e-6 }, frames = 10, smagorinsky = 0.15, slice = true, cancel = null } = {}) {
  const nx = Math.max(3, Math.round(size[0] / h)) + 2, ny = slice ? 1 : Math.max(3, Math.round(size[1] / h)) + 2, nz = Math.max(3, Math.round(size[2] / h)) + 2;
  const N = nx * ny * nz, type = new Uint8Array(N), fill = new Float64Array(N);
  let Hmax = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = i + nx * (j + ny * k);
    const wall = i === 0 || i === nx - 1 || k === 0 || k === nz - 1 || (!slice && (j === 0 || j === ny - 1));
    if (wall) { type[s] = CELL.WALL; continue; }
    const x = (i - 0.5) * h, y = slice ? size[1] / 2 : (j - 0.5) * h, z = (k - 0.5) * h;
    if (liquid(x, y, z)) { type[s] = CELL.FLUID; Hmax = Math.max(Hmax, z + h / 2); } else type[s] = CELL.GAS;
  }
  // Liquid cells next to gas are the interface (full to start).
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx - 1; i++) {
    const s = idx(i, j, k); if (type[s] !== CELL.FLUID) continue;
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
      const jj = slice ? 0 : j + b; if (!slice && (jj < 0 || jj >= ny)) continue;
      if (type[idx(i + a, slice ? 0 : jj, k + c)] === CELL.GAS) { type[s] = CELL.INTERFACE; fill[s] = 1; break; }
    }
  }
  // Time step: the fastest speed √(2 g H) at 0.1 lattice units per step.
  const umax = Math.sqrt(2 * gravity * Math.max(Hmax, h) / 1000), dx = h / 1000;
  const dt = (0.1 * dx) / umax;
  const nuLat = (fluid.viscosity * dt) / (dx * dx);
  const tau = Math.max(0.5 + 3 * nuLat, 0.505);
  const gLat = (gravity * dt * dt) / dx;
  const steps = Math.max(1, Math.round(duration / dt));
  // Hydrostatic density: the liquid's depth below the top of its own column (lattice ρ = 1 + 3 g Δz).
  const rho0 = new Float64Array(N).fill(1);
  for (let i = 1; i < nx - 1; i++) for (let j = 0; j < ny; j++) {
    let top = -1; for (let k = nz - 2; k >= 1; k--) { const t = type[idx(i, j, k)]; if (t === CELL.FLUID || t === CELL.INTERFACE) { top = k; break; } }
    for (let k = 1; k <= top; k++) rho0[idx(i, j, k)] = 1 + 3 * gLat * (top - k);
  }
  const r = freeSurfaceRun({ dims: [nx, ny, nz], type, fill, tau, rho0, gravity: [0, 0, -gLat], steps, smagorinsky, every: Math.max(1, Math.floor(steps / frames)), periodic: [false, slice, false], cancel });
  const column = (fillF) => { const hs = []; for (let i = 1; i < nx - 1; i++) { let s = 0; for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny; j++) s += fillF[idx(i, j, k)]; hs.push((s / ny) * h); } return hs; };
  // The front: the furthest x with liquid on the floor.
  const front = (fillF) => { let x = 0; for (let i = 1; i < nx - 1; i++) { let any = false; for (let j = 0; j < ny; j++) if (fillF[idx(i, j, 1)] > 0.5) any = true; if (any) x = (i - 0.5) * h + h / 2; } return x; };
  return { ...r, dims: [nx, ny, nz], h, dt, tau, steps, viscosityModel: tau > 0.5 + 3 * nuLat ? 'raised' : 'physical',
    frames: r.frames.map((fr) => ({ ...fr, time: fr.step * dt, front: front(fr.fill), columns: column(fr.fill) })), columnHeights: column(r.fill), front: front(r.fill) };
}

/**
 * A part as a container (a tank, a cup): its walls from the part's solid on a grid of cell h mm (default: the
 * largest extent / resolution), the liquid in the space the walls enclose sideways and from below, up to `level`
 * (0..1 of that space's height) and over the first `dam` (0..1) of its length along x; gravity −z, the vessel
 * accelerating along +x at `accel` m/s² (the liquid feels it backwards: sloshing). solidMask(origin, h, dims) gives
 * the walls (the caller voxelises the part). Returns the run with frames { time, fill, com (mm), top (mm) }.
 */
export function vesselStudy({ lo, hi, solidMask, h = null, resolution = 40, level = 0.5, dam = 1, accel = 0, gravity = 9.81, duration = 0.5, frames = 20, viscosity = 1e-6, smagorinsky = 0.15, cancel = null }) {
  const ext = [0, 1, 2].map((a) => hi[a] - lo[a]);
  const hh = h > 0 ? h : Math.max(...ext) / Math.max(8, resolution);
  const origin = lo.map((v) => v - hh);
  const dims = ext.map((e) => Math.max(3, Math.ceil(e / hh) + 2));
  const [nx, ny, nz] = dims, N = nx * ny * nz;
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const wallCells = solidMask(origin, hh, dims);
  // Enclosed: a free cell with walls to −x, +x, −y, +y and below it.
  const enclosed = new Uint8Array(N);
  const hits = (i, j, k, di, dj, dk) => { for (let a = i + di, b = j + dj, c = k + dk; a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz; a += di, b += dj, c += dk) if (wallCells[idx(a, b, c)]) return true; return false; };
  let zlo = Infinity, zhi = -Infinity, xlo = Infinity, xhi = -Infinity;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = idx(i, j, k); if (wallCells[s]) continue;
    if (hits(i, j, k, -1, 0, 0) && hits(i, j, k, 1, 0, 0) && hits(i, j, k, 0, -1, 0) && hits(i, j, k, 0, 1, 0) && hits(i, j, k, 0, 0, -1)) { enclosed[s] = 1; zlo = Math.min(zlo, k); zhi = Math.max(zhi, k); xlo = Math.min(xlo, i); xhi = Math.max(xhi, i); }
  }
  if (!Number.isFinite(zlo)) return { ok: false, error: 'not-a-vessel' };
  const kTop = zlo + Math.max(1, Math.round(level * (zhi - zlo + 1))) - 1, iEnd = xlo + Math.max(1, Math.round(dam * (xhi - xlo + 1))) - 1;
  const type = new Uint8Array(N), fill = new Float64Array(N);
  let liquidCells = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = idx(i, j, k);
    if (wallCells[s] || i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) { type[s] = CELL.WALL; continue; }
    if (enclosed[s] && k <= kTop && i <= iEnd) { type[s] = CELL.FLUID; liquidCells++; } else type[s] = CELL.GAS;
  }
  if (!liquidCells) return { ok: false, error: 'no-liquid' };
  for (let s = 0; s < N; s++) {
    if (type[s] !== CELL.FLUID) continue;
    const i = s % nx, j = Math.floor(s / nx) % ny, k = Math.floor(s / (nx * ny));
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (type[idx(i + a, j + b, k + c)] === CELL.GAS) { type[s] = CELL.INTERFACE; fill[s] = 1; break; }
  }
  const Hmax = (kTop - zlo + 1) * hh;
  const umax = Math.max(Math.sqrt(2 * gravity * Hmax / 1000), Math.abs(accel) * duration * 0.5, 0.05), dx = hh / 1000;
  const dt = (0.1 * dx) / umax;
  const tau = Math.max(0.5 + (3 * viscosity * dt) / (dx * dx), 0.505);
  const gLat = (gravity * dt * dt) / dx, aLat = (accel * dt * dt) / dx;
  const steps = Math.max(1, Math.round(duration / dt));
  const rho0 = new Float64Array(N).fill(1);
  for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) {
    let top = -1; for (let k = nz - 2; k >= 1; k--) { const t = type[idx(i, j, k)]; if (t === CELL.FLUID || t === CELL.INTERFACE) { top = k; break; } }
    for (let k = 1; k <= top; k++) if (type[idx(i, j, k)] !== CELL.WALL) rho0[idx(i, j, k)] = 1 + 3 * gLat * (top - k);
  }
  const r = freeSurfaceRun({ dims, type, fill, tau, rho0, gravity: [-aLat, 0, -gLat], steps, smagorinsky, every: Math.max(1, Math.floor(steps / frames)), cancel });
  const stats = (fl) => {
    let m = 0, cx = 0, cy = 0, cz = 0, top = -Infinity;
    for (let s = 0; s < N; s++) {
      const v = fl[s]; if (!(v > 0)) continue;
      const i = s % nx, j = Math.floor(s / nx) % ny, k = Math.floor(s / (nx * ny));
      const x = origin[0] + (i + 0.5) * hh, y = origin[1] + (j + 0.5) * hh, z = origin[2] + (k + 0.5) * hh;
      m += v; cx += v * x; cy += v * y; cz += v * z; if (v > 0.5) top = Math.max(top, z + hh / 2);
    }
    return { com: m ? [cx / m, cy / m, cz / m] : [0, 0, 0], top };
  };
  const first = stats(r.frames[0]?.fill ?? r.fill);
  return {
    ok: true, ...r, dims, origin, h: hh, dt, tau, steps, liquidCells, level, accel,
    frames: [{ step: 0, time: 0, fill: (() => { const f0 = new Float32Array(N); for (let s = 0; s < N; s++) f0[s] = type[s] === CELL.FLUID || type[s] === CELL.INTERFACE ? 1 : 0; return f0; })() }, ...r.frames].map((fr) => ({ ...fr, time: fr.step * dt, ...stats(fr.fill) })),
    restTop: first.top,
  };
}

/** The liquid's surface (fill > ½) as a triangle mesh of cell faces, for display: { vertices, triangles, normals }. */
export function liquidMesh(fill, dims, origin, h, threshold = 0.5) {
  const [nx, ny, nz] = dims; const V = [], T = [], Nn = [];
  const full = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && fill[i + nx * (j + ny * k)] > threshold;
  const quad = (p, n) => { const b = V.length / 3; for (const q of p) V.push(...q); for (let a = 0; a < 4; a++) Nn.push(...n); T.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!full(i, j, k)) continue;
    const x0 = origin[0] + i * h, y0 = origin[1] + j * h, z0 = origin[2] + k * h, x1 = x0 + h, y1 = y0 + h, z1 = z0 + h;
    if (!full(i + 1, j, k)) quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
    if (!full(i - 1, j, k)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    if (!full(i, j + 1, k)) quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]);
    if (!full(i, j - 1, k)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
    if (!full(i, j, k + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    if (!full(i, j, k - 1)) quad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1]);
  }
  return { vertices: Float32Array.from(V), triangles: Uint32Array.from(T), normals: Float32Array.from(Nn), faceGroups: [] };
}
