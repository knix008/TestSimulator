// Remeshing and implicit surfaces: voxel remesh (from a signed distance grid), the Skin surface around edges, the Ocean
// surface (a Phillips spectrum through an inverse FFT), Multiresolution levels, and dynamic topology for sculpting.
import { boundingBox, cloneMesh, closestOnTriangle, createMesh, edgeKey, edgeMap, triangulateIndices, v3 } from './mesh.js';
import { polygonizeField } from './metaball.js';
import { convexHull as hullOf } from './rigid.js';

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

/**
 * The same grid, as quads. BLOCKS is the grid's own faces between inside and outside cells. SMOOTH is surface nets: one vertex in each cell the surface
 * passes through, at the mean of where it crosses the cell's edges, and one quad for each crossed grid edge. SHARP also pulls those vertices onto the
 * original surface, which brings back flats and most of the edges. Closed input gives closed, all-quad output.
 */
export function quadRemesh(mesh, { voxel = 0.1, mode = 'SMOOTH', maxCells = 200 } = {}) {
  if (!mesh.faces.length) return cloneMesh(mesh);
  const box = boundingBox(mesh.verts);
  const longest = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) || 1;
  const size = Math.max(voxel, longest / maxCells);
  const grid = signedDistanceGrid(mesh, size);
  const { min, n, value } = grid;
  const out = createMesh();
  const pointAt = (i, j, k) => [min[0] + i * size, min[1] + j * size, min[2] + k * size];
  const inside = (i, j, k) => value(i, j, k) < 0;
  if (mode === 'BLOCKS') {
    // A cell here is a grid point, reaching half a voxel each way.
    const corners = new Map();
    const corner = (i, j, k) => {
      const key = `${i},${j},${k}`;
      if (!corners.has(key)) { corners.set(key, out.verts.length); out.verts.push(pointAt(i - 0.5, j - 0.5, k - 0.5)); }
      return corners.get(key);
    };
    const open = (i, j, k) => i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2] || !inside(i, j, k);
    for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      if (!inside(i, j, k)) continue;
      if (open(i + 1, j, k)) out.faces.push([corner(i + 1, j, k), corner(i + 1, j + 1, k), corner(i + 1, j + 1, k + 1), corner(i + 1, j, k + 1)]);
      if (open(i - 1, j, k)) out.faces.push([corner(i, j, k), corner(i, j, k + 1), corner(i, j + 1, k + 1), corner(i, j + 1, k)]);
      if (open(i, j + 1, k)) out.faces.push([corner(i, j + 1, k), corner(i, j + 1, k + 1), corner(i + 1, j + 1, k + 1), corner(i + 1, j + 1, k)]);
      if (open(i, j - 1, k)) out.faces.push([corner(i, j, k), corner(i + 1, j, k), corner(i + 1, j, k + 1), corner(i, j, k + 1)]);
      if (open(i, j, k + 1)) out.faces.push([corner(i, j, k + 1), corner(i + 1, j, k + 1), corner(i + 1, j + 1, k + 1), corner(i, j + 1, k + 1)]);
      if (open(i, j, k - 1)) out.faces.push([corner(i, j, k), corner(i, j + 1, k), corner(i + 1, j + 1, k), corner(i + 1, j, k)]);
    }
    return out;
  }
  // Surface nets: a cell is the cube between eight grid points.
  const cellId = new Map();
  const CUBE_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = (c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1];
  for (let k = 0; k + 1 < n[2]; k++) for (let j = 0; j + 1 < n[1]; j++) for (let i = 0; i + 1 < n[0]; i++) {
    const values = Array.from({ length: 8 }, (_, c) => { const [a, b, d] = corner(c); return value(i + a, j + b, k + d); });
    if (values.every((x) => x < 0) || values.every((x) => x >= 0)) continue;
    const sum = [0, 0, 0];
    let count = 0;
    for (const [p, q] of CUBE_EDGES) {
      const [vp, vq] = [values[p], values[q]];
      if ((vp < 0) === (vq < 0)) continue;
      const t = vp / (vp - vq);
      const [ap, bp, dp] = corner(p);
      const [aq, bq, dq] = corner(q);
      sum[0] += ap + (aq - ap) * t; sum[1] += bp + (bq - bp) * t; sum[2] += dp + (dq - dp) * t;
      count++;
    }
    cellId.set(`${i},${j},${k}`, out.verts.length);
    out.verts.push(pointAt(i + sum[0] / count, j + sum[1] / count, k + sum[2] / count));
  }
  const cell = (i, j, k) => cellId.get(`${i},${j},${k}`);
  const quad = (a, b, c, d, flip) => {
    if (a == null || b == null || c == null || d == null) return;
    out.faces.push(flip ? [d, c, b, a] : [a, b, c, d]);
  };
  for (let k = 1; k + 1 < n[2]; k++) for (let j = 1; j + 1 < n[1]; j++) for (let i = 1; i + 1 < n[0]; i++) {
    const here = inside(i, j, k);
    if (here !== inside(i + 1, j, k)) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !here);
    if (here !== inside(i, j + 1, k)) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !here);
    if (here !== inside(i, j, k + 1)) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !here);
  }
  if (mode === 'SHARP') {
    const tris = triangulateIndices(mesh).map((t) => t.map((v) => mesh.verts[v]));
    out.verts = out.verts.map((p) => {
      let best = p;
      let least = Infinity;
      for (const [a, b, c] of tris) { const q = closestOnTriangle(p, a, b, c); const d = v3.dist(p, q); if (d < least) { least = d; best = q; } }
      return least < size * 1.5 ? [...best] : p;
    });
  }
  out.smooth = mode === 'SMOOTH';
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

/**
 * Blender's way: a square frame at each vertex, quads along each edge, an end cap at each tip, and at a branch the convex hull of the frames that meet
 * there. It gives quads for Subdivision Surface to round. `mesh.skin[i]` or `radius` is the half-width of a frame.
 */
export function skinHull(mesh, { radius = 0.25 } = {}) {
  const neighbours = mesh.verts.map(() => []);
  for (const e of edgeMap(mesh).values()) { neighbours[e.a].push(e.b); neighbours[e.b].push(e.a); }
  const out = createMesh();
  const rad = (i) => mesh.skin?.[i] ?? radius;
  const seen = new Set();
  const dirOf = (a, b) => v3.norm(v3.sub(mesh.verts[b], mesh.verts[a]));
  /** Four corners around a point, square to `axis`. Each is the one before it in the same turn, carried from `ref` so that a tube does not twist. */
  const frameAt = (centre, axis, r, ref) => {
    const side = v3.norm(v3.sub(ref, v3.mul(axis, v3.dot(ref, axis))));
    const up = v3.cross(axis, side);
    return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => { out.verts.push(v3.add(centre, v3.add(v3.mul(side, a * r), v3.mul(up, b * r)))); return out.verts.length - 1; });
  };
  const ring = (from, to) => { for (let k = 0; k < 4; k++) out.faces.push([from[k], from[(k + 1) % 4], to[(k + 1) % 4], to[k]]); };
  /** Between two frames, with rings so that the quads stay about square: half the edge's length over its mean radius, as Blender counts them. */
  const tube = (from, to, a, b) => {
    const mean = (rad(a) + rad(b)) / 2;
    const cuts = mean > 1e-9 ? Math.floor((v3.dist(mesh.verts[a], mesh.verts[b]) / mean) * 0.5) : 0;
    let last = from;
    for (let c = 1; c <= cuts; c++) {
      const next = from.map((id, k) => { out.verts.push(v3.lerp(out.verts[id], out.verts[to[k]], c / (cuts + 1))); return out.verts.length - 1; });
      ring(last, next);
      last = next;
    }
    ring(last, to);
  };
  const startRef = (axis) => (Math.abs(axis[2]) < 0.9 ? v3.norm(v3.cross([0, 0, 1], axis)) : [1, 0, 0]);
  const branch = (v) => neighbours[v].length >= 3;
  const branches = new Map(); // a branch vertex and the frames coming into it, each listed in order
  /** Goes along a chain from `from` (whose frame this is) until it ends or reaches a branch. */
  const walk = (from, next, frame, ref) => {
    let [at, to, last, side] = [from, next, frame, ref];
    for (;;) {
      seen.add(at < to ? `${at}_${to}` : `${to}_${at}`);
      const degree = neighbours[to].length;
      if (degree >= 3) {
        // The chain stops short of the branch, and the hull closes the gap.
        const along = dirOf(at, to);
        const back = Math.min(rad(to) * 1.5, v3.dist(mesh.verts[at], mesh.verts[to]) * 0.45);
        const stop = frameAt(v3.sub(mesh.verts[to], v3.mul(along, back)), along, rad(to), side);
        tube(last, stop, at, to);
        branches.get(to).push(stop);
        return;
      }
      if (degree === 1) {
        const along = dirOf(at, to);
        const end = frameAt(mesh.verts[to], along, rad(to), side);
        tube(last, end, at, to);
        out.faces.push([...end]);
        return;
      }
      const after = neighbours[to].find((n) => n !== at);
      const axis = v3.norm(v3.add(dirOf(at, to), dirOf(to, after)));
      const middle = frameAt(mesh.verts[to], axis, rad(to), side);
      tube(last, middle, at, to);
      side = v3.norm(v3.sub(side, v3.mul(axis, v3.dot(side, axis))));
      [at, to, last] = [to, after, middle];
      if (seen.has(at < to ? `${at}_${to}` : `${to}_${at}`)) return;
    }
  };
  mesh.verts.forEach((_, v) => { if (branch(v)) branches.set(v, []); });
  const leave = (v, next, reversed = false) => {
    const along = dirOf(v, next);
    const ref = startRef(along);
    if (branch(v)) {
      const go = Math.min(rad(v) * 1.5, v3.dist(mesh.verts[v], mesh.verts[next]) * 0.45);
      const start = frameAt(v3.add(mesh.verts[v], v3.mul(along, go)), along, rad(v), ref);
      branches.get(v).push(start);
      walk(v, next, start, ref);
    } else {
      const start = frameAt(mesh.verts[v], along, rad(v), ref);
      out.faces.push([...start].reverse());
      walk(v, next, start, ref);
    }
    void reversed;
  };
  // Tips first, then what leaves branches; a loop with neither starts anywhere.
  mesh.verts.forEach((_, v) => { if (neighbours[v].length === 1 && !seen.has(v < neighbours[v][0] ? `${v}_${neighbours[v][0]}` : `${neighbours[v][0]}_${v}`)) leave(v, neighbours[v][0]); });
  mesh.verts.forEach((_, v) => { if (branch(v)) for (const n of neighbours[v]) if (!seen.has(v < n ? `${v}_${n}` : `${n}_${v}`)) leave(v, n); });
  // Hulls over each branch, leaving out what would cover the mouth of a tube.
  for (const [v, frames] of branches) {
    const ids = frames.flat();
    const hull = hullOf(ids.map((i) => out.verts[i]));
    if (!hull) continue;
    const idAt = (p) => ids[ids.findIndex((i) => v3.dist(out.verts[i], p) < 1e-9)];
    for (const face of hull.faces) {
      const corners = face.v.map((k) => idAt(hull.verts[k]));
      if (frames.some((f) => corners.every((c) => f.includes(c)))) continue;
      out.faces.push(corners);
    }
    void v;
  }
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
/**
 * Blender's four spectra as frequency spectra S(ω) of a wind of speed U: Pierson–Moskowitz for a sea fully grown, JONSWAP for one
 * still growing over a fetch (its peak sharpened by γ), and TMA, JONSWAP in water of a finite depth (Kitaigorodskii's factor).
 */
export function oceanSpectrum(kind, omega, { windSpeed = 12, fetch = 120, sharpenPeak = 3.3, depth = 200 } = {}) {
  const g = 9.81;
  if (omega <= 0) return 0;
  if (kind === 'PIERSON_MOSKOWITZ') {
    const peak = (0.877 * g) / windSpeed;
    return ((0.0081 * g * g) / omega ** 5) * Math.exp(-1.25 * (peak / omega) ** 4);
  }
  // JONSWAP: the fetch in kilometres, as Blender gives it.
  const F = Math.max(1, fetch * 1000);
  const peak = 22 * ((g * g) / (windSpeed * F)) ** (1 / 3);
  const alpha = 0.076 * ((windSpeed * windSpeed) / (F * g)) ** 0.22;
  const sigma = omega <= peak ? 0.07 : 0.09;
  const r = Math.exp(-((omega - peak) ** 2) / (2 * sigma * sigma * peak * peak));
  let s = ((alpha * g * g) / omega ** 5) * Math.exp(-1.25 * (peak / omega) ** 4) * sharpenPeak ** r;
  if (kind === 'TEXEL_MARSEN_ARSLOE') {
    const wh = omega * Math.sqrt(depth / g);
    s *= wh <= 1 ? 0.5 * wh * wh : wh < 2 ? 1 - 0.5 * (2 - wh) ** 2 : 1;
  }
  return s;
}

export function oceanField({ resolution = 64, size = 50, waveScale = 1, windSpeed = 12, windAngle = 0, choppiness = 1, depthLimit = 200, seed = 1, time = 0, spectrum = 'PHILLIPS', fetch = 120, sharpenPeak = 3.3, depth = null, jacobian = false } = {}) {
  const water = depth ?? depthLimit;
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
  // The other spectra by their own energy: S(ω) turned into wavenumbers (dω/dk = g / 2ω in deep water) and spread about the wind
  // as cos², so that the variance of the heights is the spectrum's.
  const modeOf = (x, y) => {
    if (spectrum === 'PHILLIPS') return Math.sqrt((amplitude * phillips(x, y)) / 2);
    const k = Math.hypot(x, y);
    if (k < 1e-10) return 0;
    const omega = Math.sqrt(g * k * Math.tanh(k * water));
    const s1 = oceanSpectrum(spectrum, omega, { windSpeed, fetch, sharpenPeak, depth: water }) * (g / (2 * omega));
    const align = (x * wind[0] + y * wind[1]) / k;
    const s2 = (s1 / k) * ((align * align) / Math.PI);
    return Math.sqrt((s2 * dk * dk * waveScale) / 4);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = modeOf(kx(i), kx(j));
    h0r[j * n + i] = random() * p;
    h0i[j * n + i] = random() * p;
  }
  const [hr, hi, xr, xi, yr, yi] = Array.from({ length: 6 }, () => new Float64Array(n * n));
  // The Jacobian's terms, from the spectrum as Blender takes them: ∂Dx/∂x ↔ kx²/|k|·h, ∂Dx/∂y ↔ kx·ky/|k|·h, ∂Dy/∂y ↔ ky²/|k|·h.
  const J = jacobian ? Array.from({ length: 6 }, () => new Float64Array(n * n)) : null;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [x, y] = [kx(i), kx(j)];
    const k = Math.hypot(x, y);
    // Deep water, slowed by a finite depth.
    const w = Math.sqrt(g * k * Math.tanh(k * water)) * time;
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
      if (J) {
        for (const [q, w2] of [[0, (x * x) / k], [2, (x * y) / k], [4, (y * y) / k]]) { J[q][id] = w2 * re; J[q + 1][id] = w2 * im; }
      }
    }
  }
  fft2(hr, hi, n);
  fft2(xr, xi, n);
  fft2(yr, yi, n);
  const out = { n, height: hr, dx: xr.map((v) => v * -choppiness), dy: yr.map((v) => v * -choppiness), size };
  if (J) {
    for (const q of [0, 2, 4]) fft2(J[q], J[q + 1], n);
    out.jxx = J[0].map((v) => 1 - choppiness * v);
    out.jxy = J[2].map((v) => -choppiness * v);
    out.jyy = J[4].map((v) => 1 - choppiness * v);
  }
  return out;
}

/** The tile as a grid mesh in the XY plane, with UVs. */
export function oceanMesh(options = {}) {
  const f = oceanField({ ...options, jacobian: Boolean(options.useFoam) });
  const { n, size } = f;
  const verts = [];
  const faces = [];
  const uvs = [];
  const at = (x, y) => y * (n + 1) + x;
  // Foam where the horizontal movement squeezes the surface: the Jacobian of (x + Dx, y + Dy) falls below one, and folds below zero.
  const cell = size / n;
  const wrap = (i) => ((i % n) + n) % n;
  void cell;
  const foamAt = (x, y) => {
    const id = wrap(y) * n + wrap(x);
    const jacobian = f.jxx[id] * f.jyy[id] - f.jxy[id] * f.jxy[id];
    const v = Math.max(0, Math.min(1, (options.foamCoverage ?? 0) + (1 - jacobian)));
    return v * v;
  };
  const foam = options.useFoam ? [] : null;
  // Spray: where the surface folds, the way it is squeezed, the eigenvector of the Jacobian's smaller eigenvalue (as Blender's
  // spray map), its length the foam there. Inverted, the other eigenvector.
  const spray = options.useFoam && options.useSpray ? [] : null;
  const sprayAt = (x, y, amount) => {
    const id = wrap(y) * n + wrap(x);
    const [a, b, c, e] = [f.jxx[id], f.jxy[id], f.jxy[id], f.jyy[id]];
    const mean = (a + e) / 2;
    const root = Math.sqrt(Math.max(0, ((a - e) / 2) ** 2 + b * c));
    const lambda = options.invertSpray ? mean + root : mean - root;
    // (J − λI) v = 0: v = (b, λ − a), or (λ − e, c) when that one is too short.
    let v = [b, lambda - a];
    if (Math.hypot(v[0], v[1]) < 1e-9) v = [lambda - e, c];
    const len = Math.hypot(v[0], v[1]) || 1;
    return [(v[0] / len) * amount, (v[1] / len) * amount, 0];
  };
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
    const id = (y % n) * n + (x % n);
    verts.push([(x / n - 0.5) * size + f.dx[id], (y / n - 0.5) * size + f.dy[id], f.height[id]]);
    const amount = foam ? foamAt(x, y) : 0;
    foam?.push(amount);
    spray?.push(sprayAt(x, y, amount));
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    faces.push([at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)]);
    uvs.push([[x / n, y / n], [(x + 1) / n, y / n], [(x + 1) / n, (y + 1) / n], [x / n, (y + 1) / n]]);
  }
  const mesh = createMesh(verts, faces, { uvs, smooth: true });
  if (foam) {
    // `foam` whitens the material where it lies in a render; the colours show it in the solid view, on a sea blue.
    mesh.foam = foam;
    mesh.colors = foam.map((v) => [0.2 + 0.8 * v, 0.4 + 0.6 * v, 0.55 + 0.45 * v]);
    mesh.attributes = { foam, ...(spray ? { spray } : {}) };
  }
  return mesh;
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
