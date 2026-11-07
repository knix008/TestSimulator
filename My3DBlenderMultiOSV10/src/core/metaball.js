// Metaballs: a scalar field sampled on a grid, surfaced by marching tetrahedra.
// Data: { elements: [{ co: [x,y,z], radius, stiffness }], threshold, resolution }.
import { createMesh, edgeKey } from './mesh.js';

const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

export const metaField = (elements, x, y, z) => {
  let sum = 0;
  for (const e of elements) {
    const d2 = ((x - e.co[0]) ** 2 + (y - e.co[1]) ** 2 + (z - e.co[2]) ** 2) / (e.radius * e.radius);
    if (d2 < 1) { const f = 1 - d2; sum += (e.stiffness ?? 2) * f * f * f; }
  }
  return sum;
};

/** The surface `field(x,y,z) = threshold` inside a box. Outward normals point towards lower field values. */
export function polygonizeField(field, min, max, cell, threshold = 1) {
  const n = [0, 1, 2].map((k) => Math.max(1, Math.ceil((max[k] - min[k]) / cell)));
  const mesh = createMesh();
  const known = new Map();
  const gridId = (i, j, k) => i + j * (n[0] + 1) + k * (n[0] + 1) * (n[1] + 1);
  const pointAt = (i, j, k) => [min[0] + i * cell, min[1] + j * cell, min[2] + k * cell];
  const cache = new Float64Array((n[0] + 1) * (n[1] + 1) * (n[2] + 1)).fill(NaN);
  const value = (i, j, k) => {
    const id = gridId(i, j, k);
    if (Number.isNaN(cache[id])) { const p = pointAt(i, j, k); cache[id] = field(p[0], p[1], p[2]); }
    return cache[id];
  };
  // Which way a triangle faces is decided on the midpoints of the cell's edges: unlike the real crossings they never collapse
  // to a point, however close the surface passes to a grid corner.
  const mids = [];
  const cross = (a, b) => {
    const key = edgeKey(a.id, b.id);
    if (!known.has(key)) {
      const t = (threshold - a.v) / (b.v - a.v);
      known.set(key, mesh.verts.length);
      mids.push([(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2]);
      mesh.verts.push([a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t]);
    }
    return known.get(key);
  };
  const orient = (i0, i1, i2, inside) => {
    const [a, b, c] = [mids[i0], mids[i1], mids[i2]];
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const out = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]];
    return nx * out[0] + ny * out[1] + nz * out[2] >= 0 ? [i0, i1, i2] : [i0, i2, i1];
  };
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    // Most cells of a big grid are not on the surface: find that out before building anything.
    let above = 0;
    for (const [a, b, c] of CORNERS) if (value(i + a, j + b, k + c) >= threshold) above++;
    if (above === 0 || above === 8) continue;
    const cube = CORNERS.map(([a, b, c]) => {
      const [x, y, z] = [i + a, j + b, k + c];
      return { id: gridId(x, y, z), p: pointAt(x, y, z), v: value(x, y, z) };
    });
    if (cube.every((c) => c.v < threshold) || cube.every((c) => c.v >= threshold)) continue;
    for (const tet of TETS) {
      const pts = tet.map((c) => cube[c]);
      const inside = pts.filter((c) => c.v >= threshold);
      const outside = pts.filter((c) => c.v < threshold);
      if (inside.length === 0 || outside.length === 0) continue;
      const center = inside.reduce((s, c) => [s[0] + c.p[0] / inside.length, s[1] + c.p[1] / inside.length, s[2] + c.p[2] / inside.length], [0, 0, 0]);
      if (inside.length === 1) {
        const [a, b, c] = outside.map((o) => cross(inside[0], o));
        mesh.faces.push(orient(a, b, c, center));
      } else if (inside.length === 3) {
        const [a, b, c] = inside.map((o) => cross(o, outside[0]));
        mesh.faces.push(orient(a, b, c, center));
      } else {
        const [a, b, c, d] = [cross(inside[0], outside[0]), cross(inside[0], outside[1]), cross(inside[1], outside[1]), cross(inside[1], outside[0])];
        mesh.faces.push(orient(a, b, c, center), orient(a, c, d, center));
      }
    }
  }
  return mesh;
}

export function metaballToMesh(data) {
  const elements = data.elements ?? [];
  if (!elements.length) return createMesh();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const e of elements) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], e.co[k] - e.radius); max[k] = Math.max(max[k], e.co[k] + e.radius); }
  const mesh = polygonizeField((x, y, z) => metaField(elements, x, y, z), min, max, data.resolution ?? 0.1, data.threshold ?? 0.6);
  mesh.smooth = true;
  return mesh;
}
