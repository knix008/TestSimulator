// Grid simulations: smoke and fire (stable fluids), liquid (FLIP) and Dynamic Paint, all baked frame by frame.
//
// Results are big arrays, so they live in `simCache`, outside the document: undo does not throw them away, and a saved file
// stays small. An opened file needs its simulations baked again, which `simBaked` tells the interface.
import { Matrix4, Vector3 } from 'three';
import { getMaterial, isVisible, setFrame, worldMatrix, evaluatedMesh } from './doc.js';
import { evalVolume, treeUses } from './nodes.js';
import { boundingBox, v3, vertexNormals } from './mesh.js';
import { polygonizeField } from './metaball.js';
import { noise3 } from './noise.js';
import { fieldForce } from './physics.js';

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
export const defaultLiquidDomain = () => ({ res: 24, flip: 0.97, particlesPerCell: 8, surfaceSmooth: 1, viscosity: 0, surfaceTension: 0, foam: false, foamThreshold: 1.5, foamRate: 60, foamLife: 1.5, foamSize: 0.15 });
export const defaultLiquidFlow = () => ({ kind: 'GEOMETRY', velocity: [0, 0, 0] });
export const defaultDynamicPaint = (role = 'CANVAS') => (role === 'CANVAS' ? { role, surface: 'PAINT', fade: 0, spread: 0, wetness: 1, base: [1, 1, 1], displace: 0, waveSpeed: 0.4, waveDamping: 0.04, waveStrength: 0.3 } : { role, radius: 0.5, color: [1, 0.1, 0.1], strength: 1 });

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

/**
 * Which grid cells a mesh fills: { min, cell, n } says where the cells are. Inside counts by crossings along each column, and the cells its
 * surface passes through count too, so that a thin sheet still blocks.
 */
export function voxelize(doc, obj, grid) {
  const mesh = evaluatedMesh(doc, obj);
  const [nx, ny, nz] = grid.n;
  const out = new Uint8Array(nx * ny * nz);
  if (!mesh?.faces.length) return out;
  const m = worldMatrix(doc, obj);
  const q = new Vector3();
  const verts = mesh.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(m); return [q.x, q.y, q.z]; });
  const columns = new Map();
  const mark = (p) => {
    const [i, j, k] = [0, 1, 2].map((a) => Math.floor((p[a] - grid.min[a]) / grid.cell[a]));
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) out[i + j * nx + k * nx * ny] = 1;
  };
  const step = Math.min(...grid.cell) * 0.5;
  for (const f of mesh.faces) for (let t = 1; t + 1 < f.length; t++) {
    const [a, b, c] = [verts[f[0]], verts[f[t]], verts[f[t + 1]]];
    // The surface: points over the triangle, closer than a cell.
    const longest = Math.max(v3.dist(a, b), v3.dist(b, c), v3.dist(c, a));
    const count = Math.max(1, Math.ceil(longest / step));
    for (let u = 0; u <= count; u++) for (let v = 0; v <= count - u; v++) {
      const [x, y] = [u / count, v / count];
      mark(v3.add(a, v3.add(v3.mul(v3.sub(b, a), x), v3.mul(v3.sub(c, a), y))));
    }
    // Crossings with the columns through cell centres under this triangle.
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denominator) < 1e-12) continue;
    const [loI, hiI] = [Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - grid.min[0]) / grid.cell[0] - 0.5)), Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - grid.min[0]) / grid.cell[0] - 0.5))];
    const [loJ, hiJ] = [Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - grid.min[1]) / grid.cell[1] - 0.5)), Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - grid.min[1]) / grid.cell[1] - 0.5))];
    for (let j = loJ; j <= hiJ; j++) for (let i = loI; i <= hiI; i++) {
      const [x, y] = [grid.min[0] + (i + 0.5) * grid.cell[0], grid.min[1] + (j + 0.5) * grid.cell[1]];
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator;
      const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
      const key = i + j * nx;
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key).push(z);
    }
  }
  for (const [key, list] of columns) {
    if (list.length < 2) continue;
    list.sort((p, r) => p - r);
    const [i, j] = [key % nx, Math.floor(key / nx)];
    for (let e = 0; e + 1 < list.length; e += 2) {
      const lo = Math.max(0, Math.ceil((list[e] - grid.min[2]) / grid.cell[2] - 0.5));
      const hi = Math.min(nz - 1, Math.floor((list[e + 1] - grid.min[2]) / grid.cell[2] - 0.5));
      for (let k = lo; k <= hi; k++) out[i + j * nx + k * nx * ny] = 1;
    }
  }
  return out;
}

/** Everything in the way of a simulation in this domain, as one mask. */
function obstacleMask(doc, domain, grid) {
  const [nx, ny, nz] = grid.n;
  const mask = new Uint8Array(nx * ny * nz);
  for (const o of doc.objects) {
    if (!o.collision || o === domain || o.type !== 'MESH' || !isVisible(doc, o)) continue;
    const one = voxelize(doc, o, grid);
    for (let c = 0; c < mask.length; c++) if (one[c]) mask[c] = 1;
  }
  return mask;
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
  if (state.solid) for (let c = 0; c < size; c++) if (state.solid[c]) { state.density[c] = 0; state.temperature[c] = 0; state.fuel[c] = 0; state.flame[c] = 0; state.u[c] = 0; state.v[c] = 0; state.w[c] = 0; }
  project(state, Math.ceil(iterations / 2));
  return state;
}

/** Removes the part of the velocity that compresses the air. Walls and solids allow no flow through them. */
function project(state, iterations) {
  const [nx, ny, nz] = state.n;
  const { u, v, w, solid } = state;
  const at = (i, j, k) => i + j * nx + k * nx * ny;
  const size = nx * ny * nz;
  const div = new Float32Array(size);
  const p = new Float32Array(size);
  if (solid) for (let c = 0; c < size; c++) if (solid[c]) { u[c] = 0; v[c] = 0; w[c] = 0; }
  /** A neighbour, or the cell itself where the neighbour is solid. */
  const near = solid
    ? (c, n) => (solid[n] ? c : n)
    : (c, n) => n;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [il, ir, jl, jr, kl, kr] = [Math.max(i - 1, 0), Math.min(i + 1, nx - 1), Math.max(j - 1, 0), Math.min(j + 1, ny - 1), Math.max(k - 1, 0), Math.min(k + 1, nz - 1)];
    div[at(i, j, k)] = 0.5 * (u[at(ir, j, k)] - u[at(il, j, k)] + v[at(i, jr, k)] - v[at(i, jl, k)] + w[at(i, j, kr)] - w[at(i, j, kl)]);
  }
  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = at(i, j, k);
      if (solid?.[c]) continue;
      const [il, ir, jl, jr, kl, kr] = [Math.max(i - 1, 0), Math.min(i + 1, nx - 1), Math.max(j - 1, 0), Math.min(j + 1, ny - 1), Math.max(k - 1, 0), Math.min(k + 1, nz - 1)];
      p[c] = (p[near(c, at(il, j, k))] + p[near(c, at(ir, j, k))] + p[near(c, at(i, jl, k))] + p[near(c, at(i, jr, k))] + p[near(c, at(i, j, kl))] + p[near(c, at(i, j, kr))] - div[c]) / 6;
    }
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = at(i, j, k);
    if (solid?.[c]) continue;
    const [il, ir, jl, jr, kl, kr] = [Math.max(i - 1, 0), Math.min(i + 1, nx - 1), Math.max(j - 1, 0), Math.min(j + 1, ny - 1), Math.max(k - 1, 0), Math.min(k + 1, nz - 1)];
    u[c] -= 0.5 * (p[near(c, at(ir, j, k))] - p[near(c, at(il, j, k))]);
    v[c] -= 0.5 * (p[near(c, at(i, jr, k))] - p[near(c, at(i, jl, k))]);
    w[c] -= 0.5 * (p[near(c, at(i, j, kr))] - p[near(c, at(i, j, kl))]);
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
  const blocked = doc.objects.some((o) => o.collision && o !== domain && o.type === 'MESH');
  for (let f = start; f <= end; f++) {
    setFrame(doc, f);
    if (blocked) state.solid = obstacleMask(doc, domain, grid);
    for (const flow of flows) {
      const s = flow.smokeFlow;
      if (f < s.start || f > s.end) continue;
      const mask = voxelize(doc, flow, grid);
      for (let c = 0; c < mask.length; c++) {
        if (!mask[c] || state.solid?.[c]) continue;
        const amount = s.amount * 0.4;
        if (s.kind === 'FIRE' || s.kind === 'BOTH') { state.fuel[c] = Math.min(1.5, state.fuel[c] + amount); state.temperature[c] += s.temperature * 0.2; }
        if (s.kind === 'SMOKE' || s.kind === 'BOTH') { state.density[c] = Math.min(1.5, state.density[c] + amount); state.temperature[c] += s.temperature * 0.2; }
        state.u[c] += s.velocity[0] * 0.05;
        state.v[c] += s.velocity[1] * 0.05;
        state.w[c] += s.velocity[2] * 0.05;
      }
    }
    // Force fields blow the air (as in Blender, where smoke has its field weights): the force at each cell's centre,
    // in the same units the flows' velocities are given.
    const fields = doc.objects.filter((o) => o.field && isVisible(doc, o));
    if (fields.length) {
      for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const c = x + nx * (y + ny * z);
        if (state.solid?.[c]) continue;
        const p = [grid.min[0] + (x + 0.5) * grid.cell[0], grid.min[1] + (y + 0.5) * grid.cell[1], grid.min[2] + (z + 0.5) * grid.cell[2]];
        const vel = [state.u[c] / 0.05, state.v[c] / 0.05, state.w[c] / 0.05];
        for (const o of fields) {
          const force = fieldForce(doc, o, p, vel);
          state.u[c] += (force[0] * 0.05) / doc.fps;
          state.v[c] += (force[1] * 0.05) / doc.fps;
          state.w[c] += (force[2] * 0.05) / doc.fps;
        }
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
  // Meshes whose material has a Volume: the shape filled, cell by cell, with what the tree says at each place.
  for (const obj of doc.objects) {
    if (obj.type !== 'MESH' || !isVisible(doc, obj) || obj.hideRender) continue;
    for (const id of obj.materials ?? []) {
      const material = getMaterial(doc, id);
      if (!material?.useNodes || !material.nodes || !treeUses(material.nodes, 'Volume')) continue;
      const res = Math.max(4, Math.min(96, material.volumeResolution ?? 40));
      const grid = domainGrid(doc, obj, res);
      const inside = voxelize(doc, obj, grid);
      const [nx, ny, nz] = grid.n;
      const raw = new Float32Array(inside.length);
      let most = 0;
      let first = null;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = i + j * nx + k * nx * ny;
        if (!inside[c]) continue;
        const position = [grid.min[0] + (i + 0.5) * grid.cell[0], grid.min[1] + (j + 0.5) * grid.cell[1], grid.min[2] + (k + 0.5) * grid.cell[2]];
        const v = evalVolume(material.nodes, { position, normal: [0, 0, 1], uv: [0, 0] });
        if (!v) continue;
        first ??= v;
        raw[c] = Math.max(0, v.density);
        most = Math.max(most, raw[c]);
      }
      if (!first || most <= 0) continue;
      const density = new Uint8Array(inside.length);
      for (let c = 0; c < raw.length; c++) density[c] = Math.round((raw[c] / most) * 255);
      out.push({ id: obj.id, min: grid.min, max: grid.max, n: grid.n, density, flame: null, sigma: most, albedo: [...first.color], emission: first.emission.map((x) => x / Math.max(1e-6, first.density)), flameColor: NEUTRAL.flame, anisotropy: first.anisotropy ?? 0, absorb: first.absorb });
      break;
    }
  }
  return out;
}

// ─────────────── liquid (FLIP)

const seeded = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

/** A particle-in-cell liquid in a box: { n, h, min, particles, velocities, solid }. */
export function createLiquid(min, max, res, { solidBoxes = [], solidMask = null } = {}) {
  const size = [0, 1, 2].map((k) => max[k] - min[k]);
  const h = Math.max(...size) / res;
  const n = size.map((s) => Math.max(3, Math.round(s / h)));
  const solid = new Uint8Array(n[0] * n[1] * n[2]);
  const at = (i, j, k) => i + j * n[0] + k * n[0] * n[1];
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    const c = [min[0] + (i + 0.5) * h, min[1] + (j + 0.5) * h, min[2] + (k + 0.5) * h];
    if (solidBoxes.some((b) => c[0] >= b.min[0] && c[0] <= b.max[0] && c[1] >= b.min[1] && c[1] <= b.max[1] && c[2] >= b.min[2] && c[2] <= b.max[2])) solid[at(i, j, k)] = 1;
  }
  if (solidMask) for (let c = 0; c < solid.length; c++) if (solidMask(c)) solid[c] = 1;
  return { n, h, min, max, solid, particles: [], velocities: [] };
}

/** Fills a box with particles, a jittered few per cell. */
export function addLiquidBox(liquid, min, max, { perCell = 8, velocity = [0, 0, 0], seed = 7, inside = null } = {}) {
  const random = seeded(seed);
  const per = Math.max(1, Math.round(Math.cbrt(perCell)));
  const spacing = liquid.h / per;
  for (let z = Math.max(min[2], liquid.min[2]) + spacing / 2; z < Math.min(max[2], liquid.max[2]); z += spacing) {
    for (let y = Math.max(min[1], liquid.min[1]) + spacing / 2; y < Math.min(max[1], liquid.max[1]); y += spacing) {
      for (let x = Math.max(min[0], liquid.min[0]) + spacing / 2; x < Math.min(max[0], liquid.max[0]); x += spacing) {
        const p = [x + (random() - 0.5) * spacing * 0.5, y + (random() - 0.5) * spacing * 0.5, z + (random() - 0.5) * spacing * 0.5];
        if (solidAt(liquid, p) || (inside && !inside(p))) continue;
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
export function liquidStep(l, { dt = 1 / 24, gravity = [0, 0, -9.81], flip = 0.97, iterations = 40, substeps = 2, viscosity = 0, tension = 0 } = {}) {
  // Surface tension has a step it must stay under (capillary waves), or the surface rings and blows up.
  const capillary = tension > 0 ? Math.sqrt((l.h ** 3) / (2 * Math.PI * tension)) * 0.5 : Infinity;
  const count = Math.max(substeps, Math.ceil(dt / capillary));
  const step = dt / count;
  for (let s = 0; s < count; s++) singleLiquidStep(l, step, gravity, flip, iterations, viscosity, tension);
  return l;
}

/**
 * Surface tension as a force at the surface (continuum surface force): the liquid fraction blurred into a smooth field, its gradient the surface
 * normal, the divergence of the unit normal its curvature, and `tension` (surface tension over density, m³/s²) times both the push on each face.
 */
function addSurfaceTension(l, faces, liquidCell, dt, tension, idx) {
  const [nx, ny, nz] = l.n;
  const { h } = l;
  const at = (i, j, k) => i + j * nx + k * nx * ny;
  const clampedGet = (field, i, j, k) => field[at(Math.max(0, Math.min(nx - 1, i)), Math.max(0, Math.min(ny - 1, j)), Math.max(0, Math.min(nz - 1, k)))];
  const phi = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let sum = 0;
    for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) sum += clampedGet(liquidCell, i + a, j + b, k + c);
    phi[at(i, j, k)] = sum / 27;
  }
  const normal = [new Float32Array(phi.length), new Float32Array(phi.length), new Float32Array(phi.length)];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const g = [(clampedGet(phi, i + 1, j, k) - clampedGet(phi, i - 1, j, k)) / (2 * h), (clampedGet(phi, i, j + 1, k) - clampedGet(phi, i, j - 1, k)) / (2 * h), (clampedGet(phi, i, j, k + 1) - clampedGet(phi, i, j, k - 1)) / (2 * h)];
    const length = Math.hypot(...g);
    if (length < 1e-6) continue;
    for (let a = 0; a < 3; a++) normal[a][at(i, j, k)] = g[a] / length;
  }
  const curvature = new Float32Array(phi.length);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    curvature[at(i, j, k)] = -((clampedGet(normal[0], i + 1, j, k) - clampedGet(normal[0], i - 1, j, k)) + (clampedGet(normal[1], i, j + 1, k) - clampedGet(normal[1], i, j - 1, k)) + (clampedGet(normal[2], i, j, k + 1) - clampedGet(normal[2], i, j, k - 1))) / (2 * h);
  }
  // A face between two cells: the curvature of the two, and the field's change across it.
  const step = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  faces.forEach(({ d, val, wt }, a) => {
    for (let k = 0; k < d[2]; k++) for (let j = 0; j < d[1]; j++) for (let i = 0; i < d[0]; i++) {
      const id = idx(d, i, j, k);
      if (wt[id] <= 0) continue;
      const [pi, pj, pk] = [i - step[a][0], j - step[a][1], k - step[a][2]];
      if (pi < 0 || pj < 0 || pk < 0 || i >= nx || j >= ny || k >= nz) continue;
      const gradient = (phi[at(i, j, k)] - phi[at(pi, pj, pk)]) / h;
      if (gradient === 0) continue;
      const kappa = (curvature[at(i, j, k)] + curvature[at(pi, pj, pk)]) / 2;
      val[id] += dt * tension * kappa * gradient;
    }
  });
}

function singleLiquidStep(l, dt, gravity, flip, iterations, viscosity = 0, tension = 0) {
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
  if (tension > 0) addSurfaceTension(l, faces, liquidCell, dt, tension, idx);
  // Thick liquid: each face's velocity drawn towards its neighbours'.
  if (viscosity > 0) {
    const k = Math.min(1 / 6, (viscosity * dt) / (h * h));
    for (const { d, val, wt } of faces) {
      const old = val.slice();
      for (let c = 1; c < d[2] - 1; c++) for (let b = 1; b < d[1] - 1; b++) for (let a = 1; a < d[0] - 1; a++) {
        const id = idx(d, a, b, c);
        if (wt[id] <= 0) continue;
        const around = [idx(d, a - 1, b, c), idx(d, a + 1, b, c), idx(d, a, b - 1, c), idx(d, a, b + 1, c), idx(d, a, b, c - 1), idx(d, a, b, c + 1)].filter((n) => wt[n] > 0);
        val[id] = old[id] + k * around.reduce((sum, n) => sum + old[n] - old[id], 0);
      }
    }
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

/**
 * Secondary particles, as Blender's liquid makes them: where the surface moves faster than `threshold`, it gives off particles that live a while.
 * Each is spray while few liquid particles are about it (thrown, falling), foam on the surface (carried by the liquid), or a bubble inside (rising).
 * `secondary`: [{ p, v, life }]; returns the list with this step's births and deaths. Kinds: 0 spray, 1 foam, 2 bubble.
 */
export function stepSecondary(l, secondary, { dt, gravity = [0, 0, -9.81], threshold = 1.5, rate = 60, life = 1.5, seed = 1 } = {}) {
  const [nx, ny, nz] = l.n;
  const { h, min } = l;
  const cellOf = (p) => [0, 1, 2].map((a) => Math.floor((p[a] - min[a]) / h));
  const inside = (c) => c[0] >= 0 && c[1] >= 0 && c[2] >= 0 && c[0] < nx && c[1] < ny && c[2] < nz;
  const id = (c) => c[0] + c[1] * nx + c[2] * nx * ny;
  const count = new Uint16Array(nx * ny * nz);
  const velocity = new Float32Array(nx * ny * nz * 3);
  l.particles.forEach((p, q) => {
    const c = cellOf(p);
    if (!inside(c)) return;
    const n = id(c);
    count[n]++;
    for (let a = 0; a < 3; a++) velocity[n * 3 + a] += l.velocities[q][a];
  });
  const around = (c) => {
    let sum = 0;
    for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) { const d = [c[0] + x, c[1] + y, c[2] + z]; if (inside(d)) sum += count[id(d)]; }
    return sum;
  };
  let s = (seed * 2654435761) >>> 0 || 1;
  const random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  // Births: fast particles at the surface (a cell with air beside it).
  l.particles.forEach((p, q) => {
    const c = cellOf(p);
    if (!inside(c)) return;
    let surface = false;
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const d = [c[0] + x, c[1] + y, c[2] + z];
      if (inside(d) && !count[id(d)] && !l.solid[id(d)]) { surface = true; break; }
    }
    if (!surface) return;
    const v = l.velocities[q];
    const speed = Math.hypot(...v);
    if (speed <= threshold) return;
    const share = Math.min(1, (speed - threshold) / threshold);
    let births = rate * share * dt / Math.max(1, count[id(c)]);
    while (births > 0) {
      if (births < 1 && random() > births) break;
      births -= 1;
      secondary.push({ p: [0, 1, 2].map((a) => p[a] + (random() - 0.5) * h * 0.5), v: v.map((x) => x * (0.9 + random() * 0.2)), life: life * (0.5 + random() * 0.5) });
    }
  });
  // Motion and deaths.
  const out = [];
  for (const b of secondary) {
    const c = cellOf(b.p);
    if (!inside(c)) continue;
    const near = around(c);
    if (near < 6) {
      b.kind = 0;
      for (let a = 0; a < 3; a++) b.v[a] += gravity[a] * dt;
    } else if (near > 20 && count[id(c)] > 0) {
      b.kind = 2;
      const n = id(c);
      for (let a = 0; a < 3; a++) b.v[a] = velocity[n * 3 + a] / count[n] - gravity[a] * 0.05;
    } else {
      b.kind = 1;
      const n = id(c);
      if (count[n]) for (let a = 0; a < 3; a++) b.v[a] = velocity[n * 3 + a] / count[n];
      b.life -= dt;
    }
    for (let a = 0; a < 3; a++) b.p[a] += b.v[a] * dt;
    if (b.kind !== 1) b.life -= dt * 0.5;
    if (b.life > 0 && !solidAt(l, b.p) && b.p.every((x, a) => x >= l.min[a] && x <= l.max[a])) out.push(b);
  }
  return out;
}

/** Small octahedra for foam, spray and bubbles, in their own material slot (the second). */
function addSecondaryGeometry(mesh, points, size) {
  mesh.faceMat ??= mesh.faces.map(() => 0);
  for (const q of points) {
    const base = mesh.verts.length;
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) mesh.verts.push([q[0] + d[0] * size, q[1] + d[1] * size, q[2] + d[2] * size]);
    for (const [a, b, c] of [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]) { mesh.faces.push([base + a, base + b, base + c]); mesh.faceMat.push(1); }
  }
  return mesh;
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
  const liquid = createLiquid(box.min, box.max, settings.res);
  const grid = { min: box.min, n: liquid.n, cell: [0, 1, 2].map(() => liquid.h) };
  const refreshObstacles = () => { if (doc.objects.some((o) => o.collision && o !== domain && GEOMETRY_OK(o))) liquid.solid = obstacleMask(doc, domain, grid); };
  refreshObstacles();
  const flows = doc.objects.filter((o) => o.fluidFlow && o !== domain && isVisible(doc, o));
  /** Is this point inside the flow's own shape? */
  const insideOf = (flow) => {
    const mask = voxelize(doc, flow, grid);
    return (p) => {
      const [i, j, k] = [0, 1, 2].map((a) => Math.floor((p[a] - liquid.min[a]) / liquid.h));
      return i >= 0 && j >= 0 && k >= 0 && i < liquid.n[0] && j < liquid.n[1] && k < liquid.n[2] && mask[i + j * liquid.n[0] + k * liquid.n[0] * liquid.n[1]] === 1;
    };
  };
  for (const flow of flows) {
    if (flow.fluidFlow.kind !== 'GEOMETRY') continue;
    const b = boundingBox(worldVerts(doc, flow));
    addLiquidBox(liquid, b.min, b.max, { perCell: settings.particlesPerCell, velocity: flow.fluidFlow.velocity, inside: insideOf(flow) });
  }
  const frames = {};
  const dt = 1 / (doc.fps || 24);
  let secondary = [];
  for (let f = start; f <= end; f++) {
    setFrame(doc, f);
    refreshObstacles();
    for (const flow of flows) {
      if (flow.fluidFlow.kind !== 'INFLOW') continue;
      const b = boundingBox(worldVerts(doc, flow));
      addLiquidBox(liquid, b.min, b.max, { perCell: Math.max(1, settings.particlesPerCell / 4), velocity: flow.fluidFlow.velocity, seed: f, inside: insideOf(flow) });
    }
    liquidStep(liquid, { dt, gravity: doc.gravity, flip: settings.flip, viscosity: settings.viscosity ?? 0, tension: settings.surfaceTension ?? 0 });
    if (settings.foam) secondary = stepSecondary(liquid, secondary, { dt, gravity: doc.gravity, threshold: settings.foamThreshold ?? 1.5, rate: settings.foamRate ?? 60, life: settings.foamLife ?? 1.5, seed: f });
    frames[f] = { particles: liquid.particles.map((p) => [p[0], p[1], p[2]]), foam: secondary.map((b) => [b.p[0], b.p[1], b.p[2], b.kind ?? 1]) };
    onProgress?.((f - start + 1) / (end - start + 1));
  }
  setFrame(doc, back);
  simCache.set(domain.id, { kind: 'LIQUID', min: box.min, max: box.max, h: liquid.h, start, end, frames, meshes: new Map(), foamSize: settings.foamSize ?? 0.15 });
  version++;
  return simCache.get(domain.id);
}
const GEOMETRY_OK = (o) => o.type === 'MESH';

/** The baked liquid at a frame, as a world-space mesh (made once for each frame). */
export function liquidMeshAt(doc, domain, frame = doc.frame) {
  const cache = simCache.get(domain.id);
  if (cache?.kind !== 'LIQUID') return null;
  const f = Math.max(cache.start, Math.min(cache.end, frame));
  if (!cache.meshes.has(f)) {
    const surface = liquidSurface(cache.frames[f].particles, cache.min, cache.max, cache.h * 0.75, 1.5);
    const foam = cache.frames[f].foam ?? [];
    cache.meshes.set(f, foam.length ? addSecondaryGeometry(surface, foam, cache.h * (cache.foamSize ?? 0.15)) : surface);
  }
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
  const waves = settings.surface === 'WAVE';
  const height = new Float32Array(count);
  const rise = new Float32Array(count);
  for (let f = start; f <= end; f++) {
    setFrame(doc, f);
    inverse.copy(worldMatrix(doc, canvas));
    const pressed = new Float32Array(count);
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
        pressed[i] = Math.max(pressed[i], k);
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
    if (waves) {
      // A wave surface: brushes hold it down while they touch it, and the dip spreads over the mesh's edges as a damped wave, a few steps a frame.
      const speed = Math.min(0.5, settings.waveSpeed ?? 0.4);
      const hold = () => { for (let i = 0; i < count; i++) if (pressed[i] > 0) { height[i] = Math.min(height[i], -pressed[i] * (settings.waveStrength ?? 0.3)); rise[i] = 0; } };
      hold();
      for (let step = 0; step < 4; step++) {
        for (let i = 0; i < count; i++) {
          // Summed over edges, so that what one vertex gives another receives: the water's level is kept.
          let sum = 0;
          for (const j of around[i]) sum += height[j] - height[i];
          rise[i] = (rise[i] + speed * sum / 8) * (1 - (settings.waveDamping ?? 0.04));
        }
        for (let i = 0; i < count; i++) height[i] += rise[i];
        hold();
      }
    }
    frames[f] = { color: color.slice(), wet: wet.slice(), ...(waves ? { wave: height.slice() } : {}) };
  }
  setFrame(doc, back);
  simCache.set(canvas.id, { kind: 'PAINT', start, end, frames });
  version++;
  return simCache.get(canvas.id);
}

/**
 * Dynamic Paint's image sequence output: every baked frame drawn over the canvas's UV layout as a picture, the paint
 * colour (`paintmap`) or the wetness in grey (`wetmap`), as Blender writes paintmap0001.png… A few pixels of margin
 * keep seams from showing the background. Returns [{ frame, name, image }] (image: { width, height, rgba }).
 */
export function dynamicPaintImages(canvas, { size = 256, map = 'paintmap', margin = 2 } = {}) {
  const cache = simCache.get(canvas.id);
  const mesh = canvas.data;
  if (cache?.kind !== 'PAINT' || !mesh.uvs?.length) return [];
  const out = [];
  for (let frame = cache.start; frame <= cache.end; frame++) {
    const data = cache.frames[frame];
    const rgba = new Uint8ClampedArray(size * size * 4);
    const filled = new Uint8Array(size * size);
    const value = (i) => (map === 'wetmap' ? [data.wet[i], data.wet[i], data.wet[i]] : [data.color[i * 3], data.color[i * 3 + 1], data.color[i * 3 + 2]]);
    mesh.faces.forEach((face, fi) => {
      const uv = mesh.uvs[fi];
      if (!uv) return;
      for (let k = 1; k + 1 < face.length; k++) {
        const corners = [0, k, k + 1];
        const P = corners.map((c) => [uv[c][0] * size - 0.5, (1 - uv[c][1]) * size - 0.5]);
        const C = corners.map((c) => value(face[c]));
        const det = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
        if (Math.abs(det) < 1e-12) continue;
        const lo = [Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])))];
        const hi = [Math.min(size - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0]))), Math.min(size - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])))];
        for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
          const b1 = ((x - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (y - P[0][1])) / det;
          const b2 = ((P[1][0] - P[0][0]) * (y - P[0][1]) - (x - P[0][0]) * (P[1][1] - P[0][1])) / det;
          const b0 = 1 - b1 - b2;
          if (b0 < -1e-6 || b1 < -1e-6 || b2 < -1e-6) continue;
          const i = y * size + x;
          for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(Math.max(0, Math.min(1, b0 * C[0][c] + b1 * C[1][c] + b2 * C[2][c])) * 255);
          rgba[i * 4 + 3] = 255;
          filled[i] = 1;
        }
      }
    });
    // Margin: empty pixels next to painted ones take their colour, a ring at a time.
    for (let ring = 0; ring < margin; ring++) {
      const add = [];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (filled[i]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || !filled[ny * size + nx]) continue;
          add.push([i, ny * size + nx]);
          break;
        }
      }
      for (const [i, j] of add) { for (let c = 0; c < 4; c++) rgba[i * 4 + c] = rgba[j * 4 + c]; filled[i] = 1; }
    }
    out.push({ frame, name: `${map}${String(frame).padStart(4, '0')}.png`, image: { width: size, height: size, rgba } });
  }
  return out;
}

/**
 * Applies a baked canvas to the evaluated mesh of a frame: colours, and a dent along the normals where wet. A WEIGHT
 * surface writes the wetness into a vertex group instead (`outputGroup`, "dp_weight"), for other modifiers to use.
 */
export function applyDynamicPaint(canvas, mesh, frame) {
  const cache = simCache.get(canvas.id);
  if (cache?.kind !== 'PAINT' || cache.frames[cache.start].wet.length !== mesh.verts.length) return mesh;
  const data = cache.frames[Math.max(cache.start, Math.min(cache.end, frame))];
  if (canvas.dynamicPaint?.surface === 'WEIGHT') {
    const name = canvas.dynamicPaint.outputGroup || 'dp_weight';
    const w = Array.from(data.wet, (x) => Math.max(0, Math.min(1, x)));
    mesh.vgroups = [...(mesh.vgroups ?? []).filter((g) => g.name !== name), { name, w }];
    return mesh;
  }
  if (data.wave) {
    // A wave surface moves; it is not painted.
    const normals = vertexNormals(mesh);
    mesh.verts = mesh.verts.map((v, i) => v3.add(v, v3.mul(normals[i], data.wave[i])));
    return mesh;
  }
  mesh.colors = mesh.verts.map((_, i) => [data.color[i * 3], data.color[i * 3 + 1], data.color[i * 3 + 2]]);
  const amount = canvas.dynamicPaint?.displace ?? 0;
  if (amount) {
    const normals = vertexNormals(mesh);
    mesh.verts = mesh.verts.map((v, i) => v3.add(v, v3.mul(normals[i], amount * data.wet[i])));
  }
  return mesh;
}

