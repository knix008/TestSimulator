// Section planes and vector glyphs for result display: a plane through the mesh (any axis, any
// offset) cut through the tetrahedra with the field interpolated on the cut, the flow grid's planes
// at a chosen offset, and arrows sampled from nodal or grid vector fields. Pure functions over the
// solver's mesh info (positions, tets, tetRegion) so they are tested without a browser.

/** Bounding box of the mesh's corner nodes: [[x,y,z] lo, [x,y,z] hi]. */
export function meshBox(info) {
  const p = info.positions;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < lo[k]) lo[k] = p[i + k]; if (p[i + k] > hi[k]) hi[k] = p[i + k]; }
  return [lo, hi];
}

const AXES = { x: 0, y: 1, z: 2 };

/**
 * The plane of a section: axis 'x' | 'y' | 'z', offset in [0, 1] across the box, flip to look at the
 * other side. Returns { normal, point, axis (index), at (coordinate) }.
 */
export function sectionPlane(box, { axis = 'x', offset = 0.5, flip = false } = {}) {
  const a = AXES[axis] ?? 0;
  const at = box[0][a] + Math.min(1, Math.max(0, offset)) * (box[1][a] - box[0][a]);
  const normal = [0, 0, 0];
  normal[a] = flip ? -1 : 1;
  const point = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, (box[0][2] + box[1][2]) / 2];
  point[a] = at;
  return { normal, point, axis: a, at };
}

const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

/**
 * Cuts the tetrahedra by a plane. values: per corner node (or null), vector + scale: the displayed
 * deformation, regions: a Set of tet regions to keep (null: all). Returns flat triangles
 * { positions: Float32Array (xyz ×3 per triangle), values: Float32Array (per vertex) | null, count }.
 */
export function cutTets(info, values, plane, { vector = null, scale = 0, regions = null } = {}) {
  const tets = info.tets;
  const reg = info.tetRegion;
  const pos = info.positions;
  if (!tets?.length) return { positions: new Float32Array(0), values: null, count: 0 };
  const nn = pos.length / 3;
  // Displayed node positions and signed distances.
  const x = vector && scale ? new Float32Array(pos.length) : pos;
  if (x !== pos) for (let i = 0; i < pos.length; i++) x[i] = pos[i] + scale * vector[i];
  const [nx, ny, nz] = plane.normal;
  const d0 = nx * plane.point[0] + ny * plane.point[1] + nz * plane.point[2];
  const dist = new Float32Array(nn);
  for (let i = 0; i < nn; i++) dist[i] = nx * x[3 * i] + ny * x[3 * i + 1] + nz * x[3 * i + 2] - d0;
  const outP = [];
  const outV = values ? [] : null;
  const pt = [];
  const vt = [];
  const ne = tets.length / 4;
  for (let e = 0; e < ne; e++) {
    if (regions && !regions.has(reg[e])) continue;
    const n = [tets[4 * e], tets[4 * e + 1], tets[4 * e + 2], tets[4 * e + 3]];
    const d = [dist[n[0]], dist[n[1]], dist[n[2]], dist[n[3]]];
    const pos4 = d.filter((v) => v > 0).length;
    if (pos4 === 0 || pos4 === 4) continue;
    pt.length = 0; vt.length = 0;
    // Intersections on the edges whose ends are on different sides, in a consistent order.
    const hits = [];
    for (const [a, b] of EDGES) {
      if ((d[a] > 0) === (d[b] > 0)) continue;
      const t = d[a] / (d[a] - d[b]);
      const ia = n[a]; const ib = n[b];
      hits.push({ a, b, p: [x[3 * ia] + t * (x[3 * ib] - x[3 * ia]), x[3 * ia + 1] + t * (x[3 * ib + 1] - x[3 * ia + 1]), x[3 * ia + 2] + t * (x[3 * ib + 2] - x[3 * ia + 2])], v: values ? values[ia] + t * (values[ib] - values[ia]) : 0 });
    }
    if (hits.length === 3) emit(hits[0], hits[1], hits[2]);
    else if (hits.length === 4) {
      // A quadrilateral: order the points around their centroid in the plane.
      const c = [0, 1, 2].map((k) => hits.reduce((s, h) => s + h.p[k], 0) / 4);
      const [u, w] = basis(plane.normal);
      hits.sort((p1, p2) => angle(p1.p, c, u, w) - angle(p2.p, c, u, w));
      emit(hits[0], hits[1], hits[2]);
      emit(hits[0], hits[2], hits[3]);
    }
  }
  function emit(a, b, c) {
    for (const h of [a, b, c]) { outP.push(h.p[0], h.p[1], h.p[2]); if (outV) outV.push(h.v); }
  }
  return { positions: Float32Array.from(outP), values: outV ? Float32Array.from(outV) : null, count: outP.length / 9 };
}

function basis(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = cross(n, a); const lu = Math.hypot(...u); for (let k = 0; k < 3; k++) u[k] /= lu;
  const w = cross(n, u);
  return [u, w];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angle = (p, c, u, w) => { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; return Math.atan2(d[0] * w[0] + d[1] * w[1] + d[2] * w[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]); };

/** Regions to cut: the solid bodies, plus the air when the field lives there too (electromagnetics). */
export function cutRegions(info, withAir) {
  const n = info.bodies?.length ?? 0;
  const set = new Set(Array.from({ length: n }, (_, i) => i));
  if (withAir && info.airElements > 0) set.add(n);
  return set;
}

/** The corner nodes on the visible surface (once each). */
export function surfaceNodes(info) {
  if (info._surface) return info._surface;
  const seen = new Uint8Array(info.positions.length / 3);
  for (const n of info.tris) seen[n] = 1;
  const list = [];
  for (let i = 0; i < seen.length; i++) if (seen[i]) list.push(i);
  info._surface = list;
  return list;
}

/**
 * Arrows from a nodal vector field (xyz per corner node): at most `count`, spread evenly over the
 * candidate nodes (a coarse grid keeps one node per cell). Returns [{ p, d, m }] with the magnitude m.
 */
export function nodalArrows(info, vector, { count = 300, nodes = null, plane = null, band = 0 } = {}) {
  const pos = info.positions;
  let cand = nodes ?? surfaceNodes(info);
  if (plane) {
    // Nodes near the section plane (within a band), so the arrows sit on the cut.
    const [nx, ny, nz] = plane.normal;
    const d0 = nx * plane.point[0] + ny * plane.point[1] + nz * plane.point[2];
    const all = pos.length / 3;
    cand = [];
    for (let i = 0; i < all; i++) if (Math.abs(nx * pos[3 * i] + ny * pos[3 * i + 1] + nz * pos[3 * i + 2] - d0) <= band) cand.push(i);
  }
  return spread(cand.filter((i) => Number.isFinite(vector[3 * i])), count, (i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], (i) => [vector[3 * i], vector[3 * i + 1], vector[3 * i + 2]]);
}

function spread(cand, count, at, vec) {
  if (!cand.length || count <= 0) return [];
  const pts = cand.map(at);
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const ext = [0, 1, 2].map((k) => Math.max(hi[k] - lo[k], 1e-9));
  // Cell size so that the occupied cells are about `count` (surface-like sets fill ~ area).
  const dims = ext.filter((v) => v > 1e-6 * Math.max(...ext)).length || 1;
  const vol = ext.reduce((a, b) => (b > 1e-6 * Math.max(...ext) ? a * b : a), 1);
  let h = (vol / count) ** (1 / dims);
  let best = [];
  for (let pass = 0; pass < 6; pass++) {
    const cells = new Map();
    pts.forEach((p, j) => {
      const key = `${Math.floor((p[0] - lo[0]) / h)},${Math.floor((p[1] - lo[1]) / h)},${Math.floor((p[2] - lo[2]) / h)}`;
      if (!cells.has(key)) cells.set(key, j);
    });
    best = [...cells.values()];
    if (best.length <= count * 1.15) break;
    h *= (best.length / count) ** (1 / Math.max(1, dims - 1)) ;
  }
  return best.slice(0, count).map((j) => { const d = vec(cand[j]); return { p: pts[j], d, m: Math.hypot(d[0], d[1], d[2]) }; });
}

/** Flow grid: cell-centred ux, uy, uz on a plane through the grid (axis index, offset 0–1). */
export function gridArrows(fluid, { axis = 2, offset = 0.5, count = 300 } = {}) {
  const [nx, ny, nz] = fluid.dims;
  const n = [nx, ny, nz];
  const h = fluid.cellSize;
  const lo = fluid.origin;
  const { ux, uy, uz } = fluid.fields;
  if (!ux || !uy || !uz) return [];
  const at = Math.min(n[axis] - 1, Math.max(0, Math.floor(offset * n[axis])));
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const cand = [];
  for (let b = 0; b < n[v]; b++) for (let a = 0; a < n[u]; a++) {
    const idx = [0, 0, 0]; idx[axis] = at; idx[u] = a; idx[v] = b;
    const c = (idx[2] * ny + idx[1]) * nx + idx[0];
    if (fluid.cells[c] === 0) cand.push(idx);
  }
  const cell = (idx) => (idx[2] * ny + idx[1]) * nx + idx[0];
  return spread(cand, count, (idx) => [0, 1, 2].map((k) => lo[k] + (idx[k] + 0.5) * h), (idx) => { const c = cell(idx); return [ux[c], uy[c], uz[c]]; });
}

/** Value of a nodal field at the corner node nearest a point (model units): { node, value, distance }. */
export function valueAt(info, values, point) {
  const p = info.positions;
  let best = -1; let bd = Infinity;
  for (let i = 0; i < p.length / 3; i++) {
    const d = (p[3 * i] - point[0]) ** 2 + (p[3 * i + 1] - point[1]) ** 2 + (p[3 * i + 2] - point[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { node: best, value: best >= 0 && values ? values[best] : null, distance: Math.sqrt(bd) };
}
