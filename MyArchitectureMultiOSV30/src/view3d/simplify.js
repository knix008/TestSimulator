// Coarse copies of furniture geometry for instances far away (batch.js
// level of detail). Vertex clustering: the geometry's box is cut into a grid,
// every vertex moves to the mean of its cell and triangles that collapse are
// dropped. Seen a few pixels across the copy looks the same, at a fraction of
// the triangles. The copy keeps the source's attribute names (positions are
// cell means, normals flat, other attributes from a corner), so it compiles
// to the very shader program the source uses (viewer.js warmShaders).

const CACHE = new WeakMap(); // source geometry → copy (or null: not worth it)

export const LOD_GRID = 14; // cells along the box's longest side
export const LOD_MIN_TRIANGLES = 48; // smaller geometry is drawn as it is
const KEEP_AT_MOST = 0.6; // a copy that keeps more than this share is not made

export function simplified(THREE, src) {
  if (CACHE.has(src)) return CACHE.get(src);
  const out = build(THREE, src);
  CACHE.set(src, out);
  if (out) src.addEventListener("dispose", () => out.dispose());
  return out;
}

function build(THREE, g) {
  const pos = g.attributes.position;
  if (!pos || pos.itemSize !== 3) return null;
  const index = g.index;
  const triCount = Math.floor((index ? index.count : pos.count) / 3);
  if (triCount < LOD_MIN_TRIANGLES) return null;
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox;
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
  const cell = Math.max(sx, sy, sz) / LOD_GRID;
  if (!(cell > 0)) return null;
  const nx = Math.max(1, Math.ceil(sx / cell) + 1), ny = Math.max(1, Math.ceil(sy / cell) + 1);
  // Vertex → cluster, cluster → mean position.
  const clusterOf = new Int32Array(pos.count);
  const ids = new Map();
  const sum = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = Math.floor((x - bb.min.x) / cell) + nx * (Math.floor((y - bb.min.y) / cell) + ny * Math.floor((z - bb.min.z) / cell));
    let c = ids.get(key);
    if (c === undefined) { c = sum.length / 4; ids.set(key, c); sum.push(0, 0, 0, 0); }
    sum[c * 4] += x; sum[c * 4 + 1] += y; sum[c * 4 + 2] += z; sum[c * 4 + 3]++;
    clusterOf[i] = c;
  }
  const mean = new Float32Array((sum.length / 4) * 3);
  for (let c = 0; c < sum.length / 4; c++) { const n = sum[c * 4 + 3]; mean[c * 3] = sum[c * 4] / n; mean[c * 3 + 1] = sum[c * 4 + 1] / n; mean[c * 3 + 2] = sum[c * 4 + 2] / n; }
  // Triangles that keep three distinct corners, each once.
  const tris = [];
  const seen = new Set();
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3, b = index ? index.getX(t * 3 + 1) : t * 3 + 1, c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const ca = clusterOf[a], cb = clusterOf[b], cc = clusterOf[c];
    if (ca === cb || cb === cc || ca === cc) continue;
    // Same corners in the same turning order: the same face (rotations are equal).
    const m = Math.min(ca, cb, cc);
    const key = m === ca ? `${ca},${cb},${cc}` : m === cb ? `${cb},${cc},${ca}` : `${cc},${ca},${cb}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tris.push(a, b, c);
  }
  if (!tris.length || tris.length / 3 > triCount * KEEP_AT_MOST) return null;
  // Non-indexed copy: flat normals, other attributes from the corner vertex.
  const n = tris.length;
  const out = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { const c = clusterOf[tris[k]]; p[k * 3] = mean[c * 3]; p[k * 3 + 1] = mean[c * 3 + 1]; p[k * 3 + 2] = mean[c * 3 + 2]; }
  out.setAttribute("position", new THREE.BufferAttribute(p, 3));
  for (const name of Object.keys(g.attributes)) {
    if (name === "position") continue;
    const src = g.attributes[name], size = src.itemSize;
    if (name === "normal") {
      const nr = new Float32Array(n * 3);
      for (let k = 0; k < n; k += 3) {
        const ax = p[k * 3], ay = p[k * 3 + 1], az = p[k * 3 + 2];
        const ux = p[k * 3 + 3] - ax, uy = p[k * 3 + 4] - ay, uz = p[k * 3 + 5] - az;
        const vx = p[k * 3 + 6] - ax, vy = p[k * 3 + 7] - ay, vz = p[k * 3 + 8] - az;
        let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        const l = Math.hypot(fx, fy, fz) || 1;
        fx /= l; fy /= l; fz /= l;
        for (let j = 0; j < 3; j++) { nr[(k + j) * 3] = fx; nr[(k + j) * 3 + 1] = fy; nr[(k + j) * 3 + 2] = fz; }
      }
      out.setAttribute("normal", new THREE.BufferAttribute(nr, 3));
      continue;
    }
    const arr = new src.array.constructor(n * size); // same type: a normalized byte colour stays one
    for (let k = 0; k < n; k++) for (let j = 0; j < size; j++) arr[k * size + j] = src.getComponent(tris[k], j);
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, src.normalized));
  }
  out.computeBoundingSphere();
  out.userData.lodOf = g.uuid;
  return out;
}
