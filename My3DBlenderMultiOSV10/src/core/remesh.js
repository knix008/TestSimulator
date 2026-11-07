// Remeshing and implicit surfaces: voxel remesh (from a signed distance grid), the Skin surface around edges, the Ocean
// surface (a Phillips spectrum through an inverse FFT), Multiresolution levels, and dynamic topology for sculpting.
import { boundingBox, cloneMesh, closestOnTriangle, createMesh, edgeKey, edgeMap, triangulateIndices, v3 } from './mesh.js';
import { polygonizeField } from './metaball.js';

// ─────────────── voxel remesh

/** A signed distance grid (negative inside): the sign by winding along Z, the distance near the surface only. */
export function signedDistanceGrid(mesh, voxel, band = 2) {
  const box = boundingBox(mesh.verts);
  const pad = voxel * (band + 1);
  // The small shift keeps columns off the mesh's own edges, where a crossing could count twice or not at all.
  const min = box.min.map((x, k) => x - pad - voxel * [0.01371, 0.01733, 0.00917][k]);
  const n = [0, 1, 2].map((k) => Math.max(2, Math.ceil((box.max[k] + pad - min[k]) / voxel) + 1));
  const [nx, ny, nz] = n;
  const at = (i, j, k) => i + j * nx + k * nx * ny;
  const sign = new Int8Array(nx * ny * nz).fill(1);
  const dist = new Float32Array(nx * ny * nz).fill(voxel * (band + 2));
  const tris = triangulateIndices(mesh).map((t) => t.map((i) => mesh.verts[i]));

  const crossings = new Map();
  for (const [a, b, c] of tris) {
    const lo = [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1])];
    const hi = [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1])];
    const denom = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denom) < 1e-14) continue;
    const i0 = Math.max(0, Math.ceil((lo[0] - min[0]) / voxel));
    const i1 = Math.min(nx - 1, Math.floor((hi[0] - min[0]) / voxel));
    const j0 = Math.max(0, Math.ceil((lo[1] - min[1]) / voxel));
    const j1 = Math.min(ny - 1, Math.floor((hi[1] - min[1]) / voxel));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, y] = [min[0] + i * voxel, min[1] + j * voxel];
      const l0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denom;
      const l1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denom;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const z = a[2] * l0 + b[2] * l1 + c[2] * l2;
      const key = i + j * nx;
      if (!crossings.has(key)) crossings.set(key, []);
      crossings.get(key).push([z, denom > 0 ? 1 : -1]);
    }
  }
  for (const [key, list] of crossings) {
    // Winding, not parity: where two shells overlap the inside stays inside, so overlapping parts melt into one.
    list.sort((p, q) => p[0] - q[0]);
    const i = key % nx;
    const j = (key - i) / nx;
    let winding = 0;
    for (let s = 0; s + 1 < list.length; s++) {
      winding += list[s][1];
      if (winding === 0) continue;
      const k0 = Math.max(0, Math.ceil((list[s][0] - min[2]) / voxel));
      const k1 = Math.min(nz - 1, Math.floor((list[s + 1][0] - min[2]) / voxel));
      for (let k = k0; k <= k1; k++) sign[at(i, j, k)] = -1;
    }
  }
  for (const [a, b, c] of tris) {
    const lo = [0, 1, 2].map((q) => Math.max(0, Math.floor((Math.min(a[q], b[q], c[q]) - min[q]) / voxel) - band));
    const hi = [0, 1, 2].map((q) => Math.min(n[q] - 1, Math.ceil((Math.max(a[q], b[q], c[q]) - min[q]) / voxel) + band));
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
      const p = [min[0] + i * voxel, min[1] + j * voxel, min[2] + k * voxel];
      const d = v3.dist(p, closestOnTriangle(p, a, b, c));
      const id = at(i, j, k);
      if (d < dist[id]) dist[id] = d;
    }
  }
  return { min, n, voxel, value: (i, j, k) => dist[at(i, j, k)] * sign[at(i, j, k)] };
}

/** Rebuilds a closed mesh as an even surface with cells of `voxel`. Grids are capped, so a huge object gets larger voxels. */
export function voxelRemesh(mesh, { voxel = 0.1, smooth = true, maxCells = 200 } = {}) {
  if (!mesh.faces.length) return cloneMesh(mesh);
  const box = boundingBox(mesh.verts);
  const longest = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) || 1;
  const size = Math.max(voxel, longest / maxCells);
  const grid = signedDistanceGrid(mesh, size);
  const { min, n } = grid;
  const field = (x, y, z) => -grid.value(Math.round((x - min[0]) / size), Math.round((y - min[1]) / size), Math.round((z - min[2]) / size));
  const out = polygonizeField(field, min, [0, 1, 2].map((k) => min[k] + (n[k] - 1) * size), size, 0);
  out.smooth = smooth;
  return out;
}

// ─────────────── skin

const segmentDistance = (p, a, b) => {
  const ab = v3.sub(b, a);
  const t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), ab) / (v3.dot(ab, ab) || 1)));
  return { d: v3.dist(p, v3.add(a, v3.mul(ab, t))), t };
};

/**
 * A surface around the edges of a mesh, like skin around a skeleton: capsules whose radius goes from one vertex's value to
 * the next (`mesh.skin[i]`, or `radius`), joined with a smooth blend. Returns a closed mesh.
 */
export function skinMesh(mesh, { radius = 0.25, resolution = 0.08, blend = 0.1 } = {}) {
  const edges = [...edgeMap(mesh).values()];
  if (!edges.length) return createMesh();
  const rad = (i) => mesh.skin?.[i] ?? radius;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const e of edges) for (const i of [e.a, e.b]) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], mesh.verts[i][k] - rad(i) - blend - resolution);
    max[k] = Math.max(max[k], mesh.verts[i][k] + rad(i) + blend + resolution);
  }
  const field = (x, y, z) => {
    const p = [x, y, z];
    // A polynomial smooth maximum, so that branches flow into each other.
    let best = -Infinity;
    for (const e of edges) {
      const { d, t } = segmentDistance(p, mesh.verts[e.a], mesh.verts[e.b]);
      const value = rad(e.a) + (rad(e.b) - rad(e.a)) * t - d;
      const h = blend > 0 ? Math.max(0, Math.min(1, 0.5 + (value - best) / (2 * blend))) : value > best ? 1 : 0;
      best = best === -Infinity ? value : best + (value - best) * h + blend * h * (1 - h);
    }
    return best;
  };
  const out = polygonizeField(field, min, max, resolution, 0);
  out.smooth = true;
  return out;
}

// ─────────────── ocean

/** In-place radix-2 FFT of one row; `inverse` without the 1/n, as the spectrum already has its scale. */
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const [wr, wi] = [Math.cos(angle), Math.sin(angle)];
    for (let i = 0; i < n; i += len) {
      let [cr, ci] = [1, 0];
      for (let k = 0; k < len / 2; k++) {
        const [a, b] = [i + k, i + k + len / 2];
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function fft2(re, im, n) {
  const [rr, ri] = [new Float64Array(n), new Float64Array(n)];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) { rr[x] = re[y * n + x]; ri[x] = im[y * n + x]; }
    fft(rr, ri, true);
    for (let x = 0; x < n; x++) { re[y * n + x] = rr[x]; im[y * n + x] = ri[x]; }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { rr[y] = re[y * n + x]; ri[y] = im[y * n + x]; }
    fft(rr, ri, true);
    for (let y = 0; y < n; y++) { re[y * n + x] = rr[y]; im[y * n + x] = ri[y]; }
  }
}

/** A seeded Gaussian generator, so that the same settings give the same sea. */
function gaussian(seed) {
  let s = seed >>> 0 || 1;
  const random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random());
}

/**
 * The heights and horizontal displacements of a square ocean tile at a time (Tessendorf's method). The tile repeats, so
 * `size` tiles fit edge to edge. Returns { n, height, dx, dy } with n × n values.
 */
export function oceanField({ resolution = 64, size = 50, waveScale = 1, windSpeed = 12, windAngle = 0, choppiness = 1, depthLimit = 200, seed = 1, time = 0 } = {}) {
  const n = 2 ** Math.round(Math.log2(Math.max(4, resolution)));
  const g = 9.81;
  const L = (windSpeed * windSpeed) / g;
  const wind = [Math.cos((windAngle * Math.PI) / 180), Math.sin((windAngle * Math.PI) / 180)];
  const random = gaussian(seed);
  const [h0r, h0i] = [new Float64Array(n * n), new Float64Array(n * n)];
  const kx = (i) => ((i <= n / 2 ? i : i - n) * 2 * Math.PI) / size;
  const phillips = (x, y) => {
    const k2 = x * x + y * y;
    if (k2 < 1e-10) return 0;
    const k = Math.sqrt(k2);
    const align = (x * wind[0] + y * wind[1]) / k;
    const small = L / 1000;
    return (Math.exp(-1 / (k2 * L * L)) / (k2 * k2)) * align * align * Math.exp(-k2 * small * small);
  };
  // Normalized by the spectrum's own integral, so the height does not depend on the tile: the significant wave height comes to
  // 0.21 v²/g, the usual figure for a fully developed sea.
  const dk = (2 * Math.PI) / size;
  const amplitude = 0.000877 * dk * dk * waveScale;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = Math.sqrt((amplitude * phillips(kx(i), kx(j))) / 2);
    h0r[j * n + i] = random() * p;
    h0i[j * n + i] = random() * p;
  }
  const [hr, hi, xr, xi, yr, yi] = Array.from({ length: 6 }, () => new Float64Array(n * n));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [x, y] = [kx(i), kx(j)];
    const k = Math.hypot(x, y);
    // Deep water, slowed by a finite depth.
    const w = Math.sqrt(g * k * Math.tanh(k * depthLimit)) * time;
    const [c, s] = [Math.cos(w), Math.sin(w)];
    const m = ((n - j) % n) * n + ((n - i) % n);
    const [ar, ai] = [h0r[j * n + i], h0i[j * n + i]];
    const [br, bi] = [h0r[m], -h0i[m]];
    const re = ar * c - ai * s + br * c + bi * s;
    const im = ar * s + ai * c - br * s + bi * c;
    const id = j * n + i;
    hr[id] = re;
    hi[id] = im;
    if (k > 1e-8) {
      // Horizontal movement: −i·k/|k|·h.
      xr[id] = (x / k) * im;
      xi[id] = -(x / k) * re;
      yr[id] = (y / k) * im;
      yi[id] = -(y / k) * re;
    }
  }
  fft2(hr, hi, n);
  fft2(xr, xi, n);
  fft2(yr, yi, n);
  return { n, height: hr, dx: xr.map((v) => v * -choppiness), dy: yr.map((v) => v * -choppiness), size };
}

/** The tile as a grid mesh in the XY plane, with UVs. */
export function oceanMesh(options = {}) {
  const f = oceanField(options);
  const { n, size } = f;
  const verts = [];
  const faces = [];
  const uvs = [];
  const at = (x, y) => y * (n + 1) + x;
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
    const id = (y % n) * n + (x % n);
    verts.push([(x / n - 0.5) * size + f.dx[id], (y / n - 0.5) * size + f.dy[id], f.height[id]]);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    faces.push([at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)]);
    uvs.push([[x / n, y / n], [(x + 1) / n, y / n], [(x + 1) / n, (y + 1) / n], [x / n, (y + 1) / n]]);
  }
  return createMesh(verts, faces, { uvs, smooth: true });
}

// ─────────────── multiresolution

/**
 * Levels of subdivision whose vertices keep sculpted offsets. `subdivide` is Catmull-Clark; the offsets (`mod.disp`) belong
 * to the top level, and each vertex of a lower level has a copy at the top, so lower levels show the same sculpting.
 */
export function multiresLevels(base, levels, subdivide) {
  const meshes = [base];
  for (let i = 0; i < levels; i++) meshes.push(subdivide(meshes[i]));
  return meshes;
}

/** Where a vertex of one level is found one level up: subdivision puts face points, then edge points, then the old vertices. */
export const vertexOneLevelUp = (mesh, i) => mesh.faces.length + edgeMap(mesh).size + i;

/** The mesh at `level`, with the top level's offsets applied. */
export function multiresEvaluate(base, mod, subdivide) {
  const total = mod.total ?? mod.levels ?? 0;
  const shown = Math.min(mod.levels ?? total, total);
  const stack = multiresLevels(base, total, subdivide);
  const out = cloneMesh(stack[shown]);
  const top = stack[total];
  if (mod.disp?.length !== top.verts.length) return out;
  // Follow each shown vertex up to the top level.
  const edgeCounts = stack.map((m) => m.faces.length + edgeMap(m).size);
  out.verts = stack[shown].verts.map((v, i) => {
    let at = i;
    for (let level = shown; level < total; level++) at += edgeCounts[level];
    return v3.add(v, mod.disp[at]);
  });
  return out;
}

/** Runs a brush on the displaced top level and stores the result as offsets. `brush(mesh)` changes the mesh it gets. */
export function multiresSculpt(base, mod, subdivide, brush) {
  const total = mod.total ?? mod.levels ?? 0;
  const smooth = multiresLevels(base, total, subdivide)[total];
  const working = cloneMesh(smooth);
  const hasDisp = mod.disp?.length === working.verts.length;
  if (hasDisp) working.verts = smooth.verts.map((v, i) => v3.add(v, mod.disp[i]));
  const result = brush(working);
  mod.disp = working.verts.map((v, i) => v3.sub(v, smooth.verts[i]));
  return result;
}

/** One more level, keeping the sculpted shape. */
export function multiresAddLevel(base, mod, subdivide) {
  const total = mod.total ?? mod.levels ?? 0;
  const before = multiresLevels(base, total, subdivide)[total];
  const shaped = cloneMesh(before);
  const hadDisp = mod.disp?.length === before.verts.length;
  if (hadDisp) shaped.verts = before.verts.map((v, i) => v3.add(v, mod.disp[i]));
  const nextShaped = subdivide(shaped);
  const nextSmooth = subdivide(before);
  mod.total = total + 1;
  mod.levels = total + 1;
  mod.disp = hadDisp ? nextShaped.verts.map((v, i) => v3.sub(v, nextSmooth.verts[i])) : null;
}

// ─────────────── dynamic topology

/**
 * Re-tessellates a triangle mesh near a point: edges longer than `detail` are split, edges much shorter are collapsed,
 * so a brush stroke always has enough triangles of about one size. Returns { split, collapsed }.
 */
export function dyntopoRefine(mesh, center, radius, detail) {
  let split = 0;
  let collapsed = 0;
  const inside = (i) => v3.dist(mesh.verts[i], center) < radius;
  const faceDrop = () => {
    if (mesh.uvs) mesh.uvs = null;
    if (mesh.faceMat) mesh.faceMat = null;
    if (mesh.cornerNormals) delete mesh.cornerNormals;
  };

  // Triangulate first: the splitting below is defined on triangles.
  if (mesh.faces.some((f) => f.length !== 3)) {
    mesh.faces = triangulateIndices(mesh);
    faceDrop();
  }

  // Long edges: one pass of splitting (a triangle with several long edges is split at the longest; later dabs finish it).
  const long = new Map();
  for (const [key, e] of edgeMap(mesh)) {
    if ((inside(e.a) || inside(e.b)) && v3.dist(mesh.verts[e.a], mesh.verts[e.b]) > detail) long.set(key, e);
  }
  if (long.size) {
    const mids = new Map();
    const midOf = (a, b) => {
      const key = edgeKey(a, b);
      if (!mids.has(key)) {
        mids.set(key, mesh.verts.length);
        mesh.verts.push(v3.lerp(mesh.verts[a], mesh.verts[b], 0.5));
        if (mesh.colors) mesh.colors.push(v3.lerp(mesh.colors[a], mesh.colors[b], 0.5));
        if (mesh.mask) mesh.mask[mesh.verts.length - 1] = ((mesh.mask[a] ?? 0) + (mesh.mask[b] ?? 0)) / 2;
        split++;
      }
      return mids.get(key);
    };
    const next = [];
    for (const [a, b, c] of mesh.faces) {
      const cuts = [long.has(edgeKey(a, b)), long.has(edgeKey(b, c)), long.has(edgeKey(c, a))];
      const n = cuts.filter(Boolean).length;
      if (n === 0) next.push([a, b, c]);
      else if (n === 3) {
        const [ab, bc, ca] = [midOf(a, b), midOf(b, c), midOf(c, a)];
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      } else if (n === 1) {
        if (cuts[0]) { const m = midOf(a, b); next.push([a, m, c], [m, b, c]); }
        else if (cuts[1]) { const m = midOf(b, c); next.push([a, b, m], [a, m, c]); }
        else { const m = midOf(c, a); next.push([a, b, m], [m, b, c]); }
      } else if (!cuts[0]) { const [bc, ca] = [midOf(b, c), midOf(c, a)]; next.push([a, b, bc], [a, bc, ca], [ca, bc, c]); }
      else if (!cuts[1]) { const [ab, ca] = [midOf(a, b), midOf(c, a)]; next.push([a, ab, ca], [ab, b, c], [ab, c, ca]); }
      else { const [ab, bc] = [midOf(a, b), midOf(b, c)]; next.push([a, ab, c], [ab, bc, c], [ab, b, bc]); }
    }
    mesh.faces = next;
    faceDrop();
  }

  // Short edges: collapse unless it would pinch the surface (the ends may share only the two faces' third vertices).
  const limit = detail * 0.4;
  const short = [...edgeMap(mesh).values()].filter((e) => e.faces.length === 2 && inside(e.a) && inside(e.b) && v3.dist(mesh.verts[e.a], mesh.verts[e.b]) < limit);
  if (short.length) {
    const touched = new Set();
    const around = mesh.verts.map(() => new Set());
    for (const [a, b, c] of mesh.faces) { around[a].add(b).add(c); around[b].add(a).add(c); around[c].add(a).add(b); }
    const redirect = new Map();
    for (const e of short) {
      if (touched.has(e.a) || touched.has(e.b)) continue;
      let common = 0;
      for (const x of around[e.a]) if (around[e.b].has(x)) common++;
      if (common !== 2) continue;
      for (const x of [e.a, e.b, ...around[e.a], ...around[e.b]]) touched.add(x);
      mesh.verts[e.a] = v3.lerp(mesh.verts[e.a], mesh.verts[e.b], 0.5);
      redirect.set(e.b, e.a);
      collapsed++;
    }
    if (redirect.size) {
      mesh.faces = mesh.faces.map((f) => f.map((i) => redirect.get(i) ?? i)).filter(([a, b, c]) => a !== b && b !== c && c !== a);
      faceDrop();
    }
  }
  return { split, collapsed };
}
