// Grid simulations: smoke and fire (stable fluids), liquid (FLIP) and Dynamic Paint, all baked frame by frame.
//
// Results are big arrays, so they live in `simCache`, outside the document: undo does not throw them away, and a saved file
// stays small. An opened file needs its simulations baked again, which `simBaked` tells the interface.
import { Matrix4, Vector3 } from 'three';
import { isVisible, setFrame, worldMatrix, evaluatedMesh } from './doc.js';
import { boundingBox, v3, vertexNormals } from './mesh.js';
import { polygonizeField } from './metaball.js';
import { noise3 } from './noise.js';

export const simCache = new Map();
let version = 0;
export const simVersion = () => version;
export const simBaked = (obj) => simCache.has(obj.id);
export function clearSimCache(id = null) {
  if (id) simCache.delete(id); else simCache.clear();
  version++;
}

export const defaultSmokeDomain = () => ({ res: 32, buoyancy: 1.2, heat: 1, vorticity: 0.25, dissipation: 0.995, colour: [0.6, 0.6, 0.6], density: 8, anisotropy: 0, flame: [1, 0.45, 0.1], flameStrength: 12 });
export const defaultSmokeFlow = () => ({ kind: 'SMOKE', amount: 1, temperature: 1, velocity: [0, 0, 0], start: 1, end: 100000 });
export const defaultLiquidDomain = () => ({ res: 24, flip: 0.97, particlesPerCell: 8, surfaceSmooth: 1 });
export const defaultLiquidFlow = () => ({ kind: 'GEOMETRY', velocity: [0, 0, 0] });
export const defaultDynamicPaint = (role = 'CANVAS') => (role === 'CANVAS' ? { role, fade: 0, spread: 0, wetness: 1, base: [1, 1, 1], displace: 0 } : { role, radius: 0.5, color: [1, 0.1, 0.1], strength: 1 });

const worldVerts = (doc, obj, frame) => {
  const mesh = evaluatedMesh(doc, obj, { frame });
  const m = worldMatrix(doc, obj);
  const p = new Vector3();
  return mesh ? mesh.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(m); return [p.x, p.y, p.z]; }) : [];
};

/** The grid a domain gives: `res` cells on its longest side. */
function domainGrid(doc, obj, res) {
  const box = boundingBox(worldVerts(doc, obj));
  const size = [0, 1, 2].map((k) => Math.max(1e-4, box.max[k] - box.min[k]));
  const cell = Math.max(...size) / res;
  const n = size.map((s) => Math.max(4, Math.round(s / cell)));
  return { min: box.min, max: box.max, n, cell: size.map((s, k) => s / n[k]) };
}

// ─────────────── smoke and fire

/** Sampling between cell centres, clamped at the walls. */
function trilinear(field, nx, ny, nz, x, y, z) {
  const fx = Math.max(0, Math.min(nx - 1.0001, x));
  const fy = Math.max(0, Math.min(ny - 1.0001, y));
  const fz = Math.max(0, Math.min(nz - 1.0001, z));
  const [i, j, k] = [Math.floor(fx), Math.floor(fy), Math.floor(fz)];
  const [u, v, w] = [fx - i, fy - j, fz - k];
  const at = (a, b, c) => a + b * nx + c * nx * ny;
  const c00 = field[at(i, j, k)] * (1 - u) + field[at(i + 1, j, k)] * u;
  const c10 = field[at(i, j + 1, k)] * (1 - u) + field[at(i + 1, j + 1, k)] * u;
  const c01 = field[at(i, j, k + 1)] * (1 - u) + field[at(i + 1, j, k + 1)] * u;
  const c11 = field[at(i, j + 1, k + 1)] * (1 - u) + field[at(i + 1, j + 1, k + 1)] * u;
  return (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
}

/**
 * One smoke solver step on a box grid. `state`: { n, density, temperature, fuel, flame, u, v, w }, in cells per step.
 * Semi-Lagrangian advection, buoyancy, vorticity confinement, a pressure projection so the air stays incompressible.
 */
export function smokeStep(state, { buoyancy = 1.2, vorticity = 0.25, dissipation = 0.995, iterations = 24, dt = 1 } = {}) {
  const [nx, ny, nz] = state.n;
  const size = nx * ny * nz;
  const at = (i, j, k) => i + j * nx + k * nx * ny;
  const { u, v, w } = state;
  // Forces: hot and dense air.
  for (let c = 0; c < size; c++) w[c] += dt * buoyancy * 0.05 * (state.temperature[c] - 0.1 * state.density[c]);

  if (vorticity > 0) {
    // Vorticity confinement puts back the swirl that advection smooths away.
    const wx = new Float32Array(size);
    const wy = new Float32Array(size);
    const wz = new Float32Array(size);
    const mag = new Float32Array(size);
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const c = at(i, j, k);
      wx[c] = (w[at(i, j + 1, k)] - w[at(i, j - 1, k)] - v[at(i, j, k + 1)] + v[at(i, j, k - 1)]) / 2;
      wy[c] = (u[at(i, j, k + 1)] - u[at(i, j, k - 1)] - w[at(i + 1, j, k)] + w[at(i - 1, j, k)]) / 2;
      wz[c] = (v[at(i + 1, j, k)] - v[at(i - 1, j, k)] - u[at(i, j + 1, k)] + u[at(i, j - 1, k)]) / 2;
      mag[c] = Math.hypot(wx[c], wy[c], wz[c]);
    }
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const c = at(i, j, k);
      let [gx, gy, gz] = [(mag[at(i + 1, j, k)] - mag[at(i - 1, j, k)]) / 2, (mag[at(i, j + 1, k)] - mag[at(i, j - 1, k)]) / 2, (mag[at(i, j, k + 1)] - mag[at(i, j, k - 1)]) / 2];
      const len = Math.hypot(gx, gy, gz) + 1e-6;
      gx /= len; gy /= len; gz /= len;
      u[c] += dt * vorticity * (gy * wz[c] - gz * wy[c]);
      v[c] += dt * vorticity * (gz * wx[c] - gx * wz[c]);
      w[c] += dt * vorticity * (gx * wy[c] - gy * wx[c]);
    }
  }

  project(state, iterations);

  // Advection: where did this cell's air come from?
  const advect = (src) => {
    const out = new Float32Array(size);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = at(i, j, k);
      out[c] = trilinear(src, nx, ny, nz, i - dt * u[c], j - dt * v[c], k - dt * w[c]);
    }
    return out;
  };
  const [uu, vv, ww] = [advect(u), advect(v), advect(w)];
  state.density = advect(state.density);
  state.temperature = advect(state.temperature);
  state.fuel = advect(state.fuel);
  state.flame = advect(state.flame);
  state.u = uu; state.v = vv; state.w = ww;

  // Fuel burns into heat, flame and smoke; everything cools and fades.
  for (let c = 0; c < size; c++) {
    if (state.fuel[c] > 0.01) {
      const burn = Math.min(state.fuel[c], 0.12 * dt);
      state.fuel[c] -= burn;
      state.temperature[c] += burn * 3;
      state.flame[c] = Math.min(1, state.flame[c] + burn * 6);
      state.density[c] += burn * 0.6;
    }
    state.density[c] *= dissipation;
    state.temperature[c] *= 0.985;
    state.flame[c] *= 0.86;
  }
  project(state, Math.ceil(iterations / 2));
  return state;
}

/** Removes the part of the velocity that compresses the air. Walls allow no flow through them. */
function project(state, iterations) {
  const [nx, ny, nz] = state.n;
  const { u, v, w } = state;
  const at = (i, j, k) => i + j * nx + k * nx * ny;
  const size = nx * ny * nz;
  const div = new Float32Array(size);
  const p = new Float32Array(size);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [il, ir, jl, jr, kl, kr] = [Math.max(i - 1, 0), Math.min(i + 1, nx - 1), Math.max(j - 1, 0), Math.min(j + 1, ny - 1), Math.max(k - 1, 0), Math.min(k + 1, nz - 1)];
    div[at(i, j, k)] = 0.5 * (u[at(ir, j, k)] - u[at(il, j, k)] + v[at(i, jr, k)] - v[at(i, jl, k)] + w[at(i, j, kr)] - w[at(i, j, kl)]);
  }
  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const [il, ir, jl, jr, kl, kr] = [Math.max(i - 1, 0), Math.min(i + 1, nx - 1), Math.max(j - 1, 0), Math.min(j + 1, ny - 1), Math.max(k - 1, 0), Math.min(k + 1, nz - 1)];
      p[at(i, j, k)] = (p[at(il, j, k)] + p[at(ir, j, k)] + p[at(i, jl, k)] + p[at(i, jr, k)] + p[at(i, j, kl)] + p[at(i, j, kr)] - div[at(i, j, k)]) / 6;
    }
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = at(i, j, k);
    const [il, ir, jl, jr, kl, kr] = [Math.max(i - 1, 0), Math.min(i + 1, nx - 1), Math.max(j - 1, 0), Math.min(j + 1, ny - 1), Math.max(k - 1, 0), Math.min(k + 1, nz - 1)];
    u[c] -= 0.5 * (p[at(ir, j, k)] - p[at(il, j, k)]);
    v[c] -= 0.5 * (p[at(i, jr, k)] - p[at(i, jl, k)]);
    w[c] -= 0.5 * (p[at(i, j, kr)] - p[at(i, j, kl)]);
    if (i === 0 || i === nx - 1) u[c] = 0;
    if (j === 0 || j === ny - 1) v[c] = 0;
    if (k === 0 || k === nz - 1) w[c] = 0;
  }
}

export function createSmokeState(n) {
  const size = n[0] * n[1] * n[2];
  const f = () => new Float32Array(size);
  return { n, density: f(), temperature: f(), fuel: f(), flame: f(), u: f(), v: f(), w: f() };
}

/** Bakes a smoke domain over the frame range. Flows are every object with `smokeFlow`, in the domain's box. */
export function bakeSmoke(doc, domain, { start = doc.frameStart, end = doc.frameEnd, onProgress = null } = {}) {
  const settings = domain.smoke ?? defaultSmokeDomain();
  const back = doc.frame;
  setFrame(doc, start);
  const grid = domainGrid(doc, domain, settings.res);
  const state = createSmokeState(grid.n);
  const [nx, ny, nz] = grid.n;
  const flows = doc.objects.filter((o) => o.smokeFlow && o !== domain && isVisible(doc, o));
  const frames = {};
  for (let f = start; f <= end; f++) {
    setFrame(doc, f);
    for (const flow of flows) {
      const s = flow.smokeFlow;
      if (f < s.start || f > s.end) continue;
      const box = boundingBox(worldVerts(doc, flow));
      const toCell = (p, k) => (p - grid.min[k]) / grid.cell[k];
      const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor(toCell(box.min[k], k))));
      const hi = [0, 1, 2].map((k) => Math.min(grid.n[k] - 1, Math.ceil(toCell(box.max[k], k))));
      const centre = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
      const radius = [0, 1, 2].map((k) => Math.max(1, (hi[k] - lo[k]) / 2));
      for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
        const d = Math.hypot((i - centre[0]) / radius[0], (j - centre[1]) / radius[1], (k - centre[2]) / radius[2]);
        if (d > 1) continue;
        const c = i + j * nx + k * nx * ny;
        const amount = s.amount * (1 - d * 0.5) * 0.4;
        if (s.kind === 'FIRE' || s.kind === 'BOTH') { state.fuel[c] = Math.min(1.5, state.fuel[c] + amount); state.temperature[c] += s.temperature * 0.2; }
        if (s.kind === 'SMOKE' || s.kind === 'BOTH') { state.density[c] = Math.min(1.5, state.density[c] + amount); state.temperature[c] += s.temperature * 0.2; }
        state.u[c] += s.velocity[0] * 0.05;
        state.v[c] += s.velocity[1] * 0.05;
        state.w[c] += s.velocity[2] * 0.05;
      }
    }
    smokeStep(state, { buoyancy: settings.buoyancy * settings.heat, vorticity: settings.vorticity, dissipation: settings.dissipation });
    frames[f] = { density: packField(state.density), flame: packField(state.flame) };
    onProgress?.((f - start + 1) / (end - start + 1));
  }
  setFrame(doc, back);
  simCache.set(domain.id, { kind: 'SMOKE', min: grid.min, max: grid.max, n: grid.n, start, end, frames });
  version++;
  return simCache.get(domain.id);
}

const packField = (field) => { const out = new Uint8Array(field.length); for (let i = 0; i < field.length; i++) out[i] = Math.min(255, Math.round(Math.max(0, field[i]) * 170)); return out; };

// ─────────────── volumes as the renderer sees them

/** A procedural density in a unit box, for Volume objects. Returns 0…1. */
export function proceduralDensity(data, x, y, z) {
  const kind = data.kind ?? 'CONSTANT';
  if (kind === 'CONSTANT') return 1;
  const d = Math.hypot(x - 0.5, y - 0.5, z - 0.5) * 2;
  const falloff = Math.max(0, 1 - d);
  if (kind === 'SPHERE') return Math.min(1, falloff * 2);
  const s = data.scale ?? 4;
  const n = noise3(x * s + 1.7, y * s + 3.1, z * s + 5.3);
  return Math.max(0, n - (data.threshold ?? 0.45)) * 4 * Math.min(1, falloff * 3);
}

/** Bakes a Volume object's density into a grid, for rendering and for the viewport. */
export function volumeGrid(data) {
  const res = Math.max(4, Math.min(96, data.res ?? 32));
  const out = new Uint8Array(res * res * res);
  for (let k = 0; k < res; k++) for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    out[i + j * res + k * res * res] = Math.round(Math.min(1, proceduralDensity(data, (i + 0.5) / res, (j + 0.5) / res, (k + 0.5) / res)) * 255);
  }
  return { n: [res, res, res], density: out, flame: null };
}

const NEUTRAL = { colour: [0.8, 0.8, 0.8], density: 4, emission: [0, 0, 0], emissionStrength: 0, flame: [1, 0.45, 0.1], flameStrength: 12 };

/** Every volume in a scene at a frame: { min, max, n, density (0…255), flame, sigma, albedo, emission, flameColor }. */
export function sceneVolumes(doc, { frame = doc.frame } = {}) {
  const out = [];
  for (const obj of doc.objects) {
    if (!isVisible(doc, obj) || obj.hideRender) continue;
    if (obj.type === 'VOLUME') {
      const grid = volumeGrid(obj.data);
      const m = worldMatrix(doc, obj);
      const corners = [];
      const p = new Vector3();
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) { p.set(a, b, c).applyMatrix4(m); corners.push([p.x, p.y, p.z]); }
      const box = boundingBox(corners);
      out.push({ id: obj.id, min: box.min, max: box.max, n: grid.n, density: grid.density, flame: null, sigma: obj.data.density ?? NEUTRAL.density, albedo: obj.data.colour ?? NEUTRAL.colour, emission: (obj.data.emission ?? NEUTRAL.emission).map((e) => e * (obj.data.emissionStrength ?? 1)), flameColor: NEUTRAL.flame.map((c) => c * NEUTRAL.flameStrength) });
    } else if (obj.smoke) {
      const cache = simCache.get(obj.id);
      const data = cache?.frames[Math.max(cache.start, Math.min(cache.end, frame))];
      if (!data) continue;
      out.push({ id: obj.id, min: cache.min, max: cache.max, n: cache.n, density: data.density, flame: data.flame, sigma: obj.smoke.density ?? NEUTRAL.density, albedo: obj.smoke.colour ?? NEUTRAL.colour, emission: [0, 0, 0], flameColor: (obj.smoke.flame ?? NEUTRAL.flame).map((c) => c * (obj.smoke.flameStrength ?? NEUTRAL.flameStrength)) });
    }
  }
  return out;
}

// ─────────────── liquid (FLIP)

const seeded = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

/** A particle-in-cell liquid in a box: { n, h, min, particles, velocities, solid }. */
export function createLiquid(min, max, res, { solidBoxes = [] } = {}) {
  const size = [0, 1, 2].map((k) => max[k] - min[k]);
  const h = Math.max(...size) / res;
  const n = size.map((s) => Math.max(3, Math.round(s / h)));
  const solid = new Uint8Array(n[0] * n[1] * n[2]);
  const at = (i, j, k) => i + j * n[0] + k * n[0] * n[1];
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    const c = [min[0] + (i + 0.5) * h, min[1] + (j + 0.5) * h, min[2] + (k + 0.5) * h];
    if (solidBoxes.some((b) => c[0] >= b.min[0] && c[0] <= b.max[0] && c[1] >= b.min[1] && c[1] <= b.max[1] && c[2] >= b.min[2] && c[2] <= b.max[2])) solid[at(i, j, k)] = 1;
  }
  return { n, h, min, max, solid, particles: [], velocities: [] };
}

/** Fills a box with particles, a jittered few per cell. */
export function addLiquidBox(liquid, min, max, { perCell = 8, velocity = [0, 0, 0], seed = 7 } = {}) {
  const random = seeded(seed);
  const per = Math.max(1, Math.round(Math.cbrt(perCell)));
  const spacing = liquid.h / per;
  for (let z = Math.max(min[2], liquid.min[2]) + spacing / 2; z < Math.min(max[2], liquid.max[2]); z += spacing) {
    for (let y = Math.max(min[1], liquid.min[1]) + spacing / 2; y < Math.min(max[1], liquid.max[1]); y += spacing) {
      for (let x = Math.max(min[0], liquid.min[0]) + spacing / 2; x < Math.min(max[0], liquid.max[0]); x += spacing) {
        const p = [x + (random() - 0.5) * spacing * 0.5, y + (random() - 0.5) * spacing * 0.5, z + (random() - 0.5) * spacing * 0.5];
        if (solidAt(liquid, p)) continue;
        liquid.particles.push(p);
        liquid.velocities.push([...velocity]);
      }
    }
  }
  return liquid;
}

function solidAt(l, p) {
  const [i, j, k] = [0, 1, 2].map((a) => Math.floor((p[a] - l.min[a]) / l.h));
  if (i < 0 || j < 0 || k < 0 || i >= l.n[0] || j >= l.n[1] || k >= l.n[2]) return true;
  return l.solid[i + j * l.n[0] + k * l.n[0] * l.n[1]] === 1;
}

/** One FLIP step: particles to a staggered grid, gravity, incompressibility, the change in velocity back to the particles. */
export function liquidStep(l, { dt = 1 / 24, gravity = [0, 0, -9.81], flip = 0.97, iterations = 40, substeps = 2 } = {}) {
  const step = dt / substeps;
  for (let s = 0; s < substeps; s++) singleLiquidStep(l, step, gravity, flip, iterations);
  return l;
}

function singleLiquidStep(l, dt, gravity, flip, iterations) {
  const [nx, ny, nz] = l.n;
  const { h, min } = l;
  const uDim = [nx + 1, ny, nz];
  const vDim = [nx, ny + 1, nz];
  const wDim = [nx, ny, nz + 1];
  const idx = (d, i, j, k) => i + j * d[0] + k * d[0] * d[1];
  const make = (d) => new Float32Array(d[0] * d[1] * d[2]);
  const faces = [{ d: uDim, val: make(uDim), wt: make(uDim), off: [0, 0.5, 0.5] }, { d: vDim, val: make(vDim), wt: make(vDim), off: [0.5, 0, 0.5] }, { d: wDim, val: make(wDim), wt: make(wDim), off: [0.5, 0.5, 0] }];
  const weights = (d, off, p) => {
    const f = [0, 1, 2].map((a) => (p[a] - min[a]) / h - off[a]);
    const b = f.map((x, a) => Math.max(0, Math.min(d[a] - 2, Math.floor(x))));
    const t = f.map((x, a) => Math.max(0, Math.min(1, x - b[a])));
    return { b, t };
  };
  // Particles to grid.
  const count = l.particles.length;
  for (let q = 0; q < count; q++) {
    const p = l.particles[q];
    const vel = l.velocities[q];
    for (let a = 0; a < 3; a++) {
      const { d, val, wt, off } = faces[a];
      const { b, t } = weights(d, off, p);
      for (let c = 0; c < 2; c++) for (let e = 0; e < 2; e++) for (let g = 0; g < 2; g++) {
        const w = (g ? t[0] : 1 - t[0]) * (e ? t[1] : 1 - t[1]) * (c ? t[2] : 1 - t[2]);
        const id = idx(d, b[0] + g, b[1] + e, b[2] + c);
        val[id] += vel[a] * w;
        wt[id] += w;
      }
    }
  }
  for (const f of faces) for (let i = 0; i < f.val.length; i++) if (f.wt[i] > 0) f.val[i] /= f.wt[i];
  const before = faces.map((f) => f.val.slice());
  // Which cells hold liquid.
  const cellId = (i, j, k) => i + j * nx + k * nx * ny;
  const liquidCell = new Uint8Array(nx * ny * nz);
  for (let q = 0; q < count; q++) {
    const p = l.particles[q];
    const [i, j, k] = [0, 1, 2].map((a) => Math.max(0, Math.min(l.n[a] - 1, Math.floor((p[a] - min[a]) / h))));
    liquidCell[cellId(i, j, k)] = 1;
  }
  // Gravity on faces next to liquid.
  for (let a = 0; a < 3; a++) {
    const { val, wt } = faces[a];
    for (let i = 0; i < val.length; i++) if (wt[i] > 0) val[i] += gravity[a] * dt;
  }
  // Walls and obstacles: no flow through.
  const isSolid = (i, j, k) => i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz || l.solid[cellId(i, j, k)] === 1;
  const [U, V, W] = [faces[0].val, faces[1].val, faces[2].val];
  const enforce = () => {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) if (isSolid(i - 1, j, k) || isSolid(i, j, k)) U[idx(uDim, i, j, k)] = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) if (isSolid(i, j - 1, k) || isSolid(i, j, k)) V[idx(vDim, i, j, k)] = 0;
    for (let k = 0; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (isSolid(i, j, k - 1) || isSolid(i, j, k)) W[idx(wDim, i, j, k)] = 0;
  };
  enforce();
  // Pressure: Gauss-Seidel over the liquid cells; air around has pressure 0.
  const pressure = new Float32Array(nx * ny * nz);
  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = cellId(i, j, k);
      if (!liquidCell[c] || l.solid[c]) continue;
      const div = U[idx(uDim, i + 1, j, k)] - U[idx(uDim, i, j, k)] + V[idx(vDim, i, j + 1, k)] - V[idx(vDim, i, j, k)] + W[idx(wDim, i, j, k + 1)] - W[idx(wDim, i, j, k)];
      const open = [isSolid(i - 1, j, k), isSolid(i + 1, j, k), isSolid(i, j - 1, k), isSolid(i, j + 1, k), isSolid(i, j, k - 1), isSolid(i, j, k + 1)];
      const sides = open.filter((x) => !x).length;
      if (!sides) continue;
      // Overrelaxed correction of the six faces directly: simple, and it keeps the velocity field as the unknown.
      const correction = (1.7 * div) / sides;
      pressure[c] += correction;
      if (!open[0]) U[idx(uDim, i, j, k)] += correction;
      if (!open[1]) U[idx(uDim, i + 1, j, k)] -= correction;
      if (!open[2]) V[idx(vDim, i, j, k)] += correction;
      if (!open[3]) V[idx(vDim, i, j + 1, k)] -= correction;
      if (!open[4]) W[idx(wDim, i, j, k)] += correction;
      if (!open[5]) W[idx(wDim, i, j, k + 1)] -= correction;
    }
  }
  // Grid to particles: mostly the change (FLIP), a little of the new value (PIC), and move.
  const sample = (f, field, p) => {
    const { b, t } = weights(f.d, f.off, p);
    let out = 0;
    for (let c = 0; c < 2; c++) for (let e = 0; e < 2; e++) for (let g = 0; g < 2; g++) {
      out += field[idx(f.d, b[0] + g, b[1] + e, b[2] + c)] * (g ? t[0] : 1 - t[0]) * (e ? t[1] : 1 - t[1]) * (c ? t[2] : 1 - t[2]);
    }
    return out;
  };
  const eps = h * 1e-3;
  for (let q = 0; q < count; q++) {
    const p = l.particles[q];
    const vel = l.velocities[q];
    const next = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const f = faces[a];
      const pic = sample(f, f.val, p);
      const change = pic - sample(f, before[a], p);
      vel[a] = flip * (vel[a] + change) + (1 - flip) * pic;
      next[a] = p[a] + pic * dt;
    }
    // Into a wall or obstacle: keep to the free axes.
    for (let a = 0; a < 3; a++) {
      const trial = [...p];
      trial[a] = next[a];
      if (solidAt(l, trial)) { next[a] = p[a]; vel[a] = 0; } else p[a] = next[a];
    }
    for (let a = 0; a < 3; a++) p[a] = Math.max(l.min[a] + eps, Math.min(l.max[a] - eps, p[a]));
  }
}

/** The liquid's surface: particles splatted into a smooth field and polygonized. Normals face outward. */
export function liquidSurface(particles, min, max, h, radius = 1.6) {
  const n = [0, 1, 2].map((k) => Math.max(2, Math.ceil((max[k] - min[k]) / h) + 2));
  const grid = new Float32Array(n[0] * n[1] * n[2]);
  const reach = Math.ceil(radius);
  for (const p of particles) {
    const f = [0, 1, 2].map((k) => (p[k] - min[k]) / h + 1);
    const c = f.map(Math.floor);
    for (let k = Math.max(0, c[2] - reach); k <= Math.min(n[2] - 1, c[2] + reach); k++) {
      for (let j = Math.max(0, c[1] - reach); j <= Math.min(n[1] - 1, c[1] + reach); j++) {
        for (let i = Math.max(0, c[0] - reach); i <= Math.min(n[0] - 1, c[0] + reach); i++) {
          const d2 = ((i - f[0]) ** 2 + (j - f[1]) ** 2 + (k - f[2]) ** 2) / (radius * radius);
          if (d2 < 1) { const w = 1 - d2; grid[i + j * n[0] + k * n[0] * n[1]] += w * w * w; }
        }
      }
    }
  }
  const origin = min.map((x) => x - h);
  const field = (x, y, z) => {
    const [i, j, k] = [Math.round((x - origin[0]) / h), Math.round((y - origin[1]) / h), Math.round((z - origin[2]) / h)];
    if (i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2]) return 0;
    return grid[i + j * n[0] + k * n[0] * n[1]];
  };
  const mesh = polygonizeField(field, origin, origin.map((x, k) => x + (n[k] - 1) * h), h, 1);
  mesh.smooth = true;
  return mesh;
}

/** Bakes a liquid domain: flow objects' volumes are filled at the start (GEOMETRY) or keep pouring in (INFLOW). */
export function bakeLiquid(doc, domain, { start = doc.frameStart, end = doc.frameEnd, onProgress = null } = {}) {
  const settings = domain.fluid ?? defaultLiquidDomain();
  const back = doc.frame;
  setFrame(doc, start);
  const box = boundingBox(worldVerts(doc, domain));
  const obstacles = doc.objects.filter((o) => o.collision && o !== domain && GEOMETRY_OK(o) && isVisible(doc, o)).map((o) => boundingBox(worldVerts(doc, o)));
  const liquid = createLiquid(box.min, box.max, settings.res, { solidBoxes: obstacles });
  const flows = doc.objects.filter((o) => o.fluidFlow && o !== domain && isVisible(doc, o));
  for (const flow of flows) {
    if (flow.fluidFlow.kind !== 'GEOMETRY') continue;
    const b = boundingBox(worldVerts(doc, flow));
    addLiquidBox(liquid, b.min, b.max, { perCell: settings.particlesPerCell, velocity: flow.fluidFlow.velocity });
  }
  const frames = {};
  const dt = 1 / (doc.fps || 24);
  for (let f = start; f <= end; f++) {
    setFrame(doc, f);
    for (const flow of flows) {
      if (flow.fluidFlow.kind !== 'INFLOW') continue;
      const b = boundingBox(worldVerts(doc, flow));
      addLiquidBox(liquid, b.min, b.max, { perCell: Math.max(1, settings.particlesPerCell / 4), velocity: flow.fluidFlow.velocity, seed: f });
    }
    liquidStep(liquid, { dt, gravity: doc.gravity, flip: settings.flip });
    frames[f] = { particles: liquid.particles.map((p) => [p[0], p[1], p[2]]) };
    onProgress?.((f - start + 1) / (end - start + 1));
  }
  setFrame(doc, back);
  simCache.set(domain.id, { kind: 'LIQUID', min: box.min, max: box.max, h: liquid.h, start, end, frames, meshes: new Map() });
  version++;
  return simCache.get(domain.id);
}
const GEOMETRY_OK = (o) => o.type === 'MESH';

/** The baked liquid at a frame, as a world-space mesh (made once for each frame). */
export function liquidMeshAt(doc, domain, frame = doc.frame) {
  const cache = simCache.get(domain.id);
  if (cache?.kind !== 'LIQUID') return null;
  const f = Math.max(cache.start, Math.min(cache.end, frame));
  if (!cache.meshes.has(f)) cache.meshes.set(f, liquidSurface(cache.frames[f].particles, cache.min, cache.max, cache.h * 0.75, 1.5));
  return cache.meshes.get(f);
}

// ─────────────── Dynamic Paint

/** Bakes a canvas: brushes leave colour where they pass (and an optional dent); paint can fade or spread. */
export function bakeDynamicPaint(doc, canvas, { start = doc.frameStart, end = doc.frameEnd } = {}) {
  const settings = canvas.dynamicPaint;
  const back = doc.frame;
  const mesh = canvas.data;
  const count = mesh.verts.length;
  const brushes = doc.objects.filter((o) => o.dynamicPaint?.role === 'BRUSH');
  const base = settings.base ?? [1, 1, 1];
  const wet = new Float32Array(count);
  const color = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) color[i * 3 + c] = base[c];
  const around = mesh.verts.map(() => []);
  for (const f of mesh.faces) for (let i = 0; i < f.length; i++) { around[f[i]].push(f[(i + 1) % f.length]); around[f[(i + 1) % f.length]].push(f[i]); }
  const frames = {};
  const inverse = new Matrix4();
  const p = new Vector3();
  for (let f = start; f <= end; f++) {
    setFrame(doc, f);
    inverse.copy(worldMatrix(doc, canvas));
    for (const brush of brushes) {
      const b = worldVerts(doc, brush);
      if (!b.length) continue;
      const box = boundingBox(b);
      const reach = brush.dynamicPaint.radius;
      for (let i = 0; i < count; i++) {
        const v = mesh.verts[i];
        p.set(v[0], v[1], v[2]).applyMatrix4(inverse);
        const d = Math.hypot(Math.max(box.min[0] - p.x, 0, p.x - box.max[0]), Math.max(box.min[1] - p.y, 0, p.y - box.max[1]), Math.max(box.min[2] - p.z, 0, p.z - box.max[2]));
        if (d >= reach) continue;
        const k = (1 - d / reach) * (brush.dynamicPaint.strength ?? 1);
        wet[i] = Math.min(1, wet[i] + k);
        for (let c = 0; c < 3; c++) color[i * 3 + c] += (brush.dynamicPaint.color[c] - color[i * 3 + c]) * k;
      }
    }
    if (settings.spread > 0) {
      const next = color.slice();
      const nextWet = wet.slice();
      for (let i = 0; i < count; i++) {
        for (const j of around[i]) {
          if (wet[j] <= wet[i]) continue;
          const k = settings.spread * (wet[j] - wet[i]) * 0.25;
          nextWet[i] += k;
          for (let c = 0; c < 3; c++) next[i * 3 + c] += (color[j * 3 + c] - color[i * 3 + c]) * k;
        }
      }
      color.set(next);
      wet.set(nextWet);
    }
    if (settings.fade > 0) {
      for (let i = 0; i < count; i++) {
        wet[i] *= 1 - settings.fade;
        for (let c = 0; c < 3; c++) color[i * 3 + c] += (base[c] - color[i * 3 + c]) * settings.fade;
      }
    }
    frames[f] = { color: color.slice(), wet: wet.slice() };
  }
  setFrame(doc, back);
  simCache.set(canvas.id, { kind: 'PAINT', start, end, frames });
  version++;
  return simCache.get(canvas.id);
}

/** Applies a baked canvas to the evaluated mesh of a frame: colours, and a dent along the normals where wet. */
export function applyDynamicPaint(canvas, mesh, frame) {
  const cache = simCache.get(canvas.id);
  if (cache?.kind !== 'PAINT' || cache.frames[cache.start].wet.length !== mesh.verts.length) return mesh;
  const data = cache.frames[Math.max(cache.start, Math.min(cache.end, frame))];
  mesh.colors = mesh.verts.map((_, i) => [data.color[i * 3], data.color[i * 3 + 1], data.color[i * 3 + 2]]);
  const amount = canvas.dynamicPaint?.displace ?? 0;
  if (amount) {
    const normals = vertexNormals(mesh);
    mesh.verts = mesh.verts.map((v, i) => v3.add(v, v3.mul(normals[i], amount * data.wet[i])));
  }
  return mesh;
}

