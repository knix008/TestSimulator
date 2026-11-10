// What a library item looks like from above, as small grids to compare plan pictures with (io/plan-furniture.js):
// the item is built (its real parametric model), its triangles rasterised straight down in the item's own frame
// (columns = its width, x; rows = its depth, z, the front at the bottom), the highest surface winning, up to the plan
// cut (`cut`, like a drawn plan). From that height map:
//   occ  — where the item is (its footprint's shape: an L sofa, a round table, a toilet's bowl);
//   edge — where its height jumps or it ends (a bed's pillows and headboard, a sofa's back and arms, a sink's bowl).
// Both pooled to N × N cells, so they compare with any picture scale. Templates are cached per item.
import * as THREE from 'three';

const RES = 48; // raster cells across the item (pooled down to `size`)

/**
 * The top-view grids of a built item (a THREE.Object3D, front +Z, origin at the bottom centre): { occ, edge, w, d,
 * size } — Float32Array(size × size) each (row-major, row 0 = the back), w / d its footprint (m).
 */
export function topTemplate(root, { size = 12, cut = 1.5 } = {}) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
  if (box.isEmpty()) return null;
  const x0 = box.min.x; const z0 = box.min.z;
  const w = Math.max(0.05, box.max.x - box.min.x); const d = Math.max(0.05, box.max.z - box.min.z);
  const R = RES;
  const height = new Float32Array(R * R).fill(-1);
  const owner = new Int32Array(R * R).fill(-1);
  const v0 = new THREE.Vector3(); const v1 = new THREE.Vector3(); const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const n = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let part = 0;
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position; const idx = mesh.geometry.index;
    const count = idx ? idx.count : pos.count;
    const instances = mesh.isInstancedMesh ? mesh.count : 1;
    for (let inst = 0; inst < instances; inst++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(inst, m); m.premultiply(mesh.matrixWorld); } else m.copy(mesh.matrixWorld);
      part++;
      for (let t = 0; t + 2 < count; t += 3) {
        const a = idx ? idx.getX(t) : t; const b = idx ? idx.getX(t + 1) : t + 1; const c = idx ? idx.getX(t + 2) : t + 2;
        v0.fromBufferAttribute(pos, a).applyMatrix4(m); v1.fromBufferAttribute(pos, b).applyMatrix4(m); v2.fromBufferAttribute(pos, c).applyMatrix4(m);
        if (Math.min(v0.y, v1.y, v2.y) > cut) continue;
        n.crossVectors(e1.subVectors(v1, v0), e2.subVectors(v2, v0));
        if (n.lengthSq() < 1e-14 || Math.abs(n.y) / n.length() < 0.04) continue;
        const P = [v0, v1, v2].map((v) => [((v.x - x0) / w) * R, ((v.z - z0) / d) * R]);
        const ys = [v0, v1, v2].map((v) => Math.min(v.y, cut));
        const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
        if (Math.abs(area) < 1e-9) continue;
        const X0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))); const X1 = Math.min(R - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
        const Y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))); const Y1 = Math.min(R - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
          const px = x + 0.5; const py = y + 0.5;
          const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
          const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const yv = w0 * ys[0] + w1 * ys[1] + w2 * ys[2];
          const i = y * R + x;
          if (yv > height[i]) { height[i] = yv; owner[i] = part; }
        }
      }
    }
  });
  // Edges: the footprint's border and height jumps of 3 cm (both ways), on the raster; then pooled.
  const edgeR = new Float32Array(R * R);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = y * R + x;
    if (height[i] < 0) continue;
    for (const j of [x + 1 < R ? i + 1 : -1, y + 1 < R ? i + R : -1, x > 0 ? i - 1 : -1, y > 0 ? i - R : -1]) {
      if (j < 0 || height[j] < 0 || Math.abs(height[j] - height[i]) >= 0.03) { edgeR[i] = 1; break; }
    }
  }
  const occ = new Float32Array(size * size); const edge = new Float32Array(size * size);
  const per = R / size;
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const c = Math.floor(y / per) * size + Math.floor(x / per);
    if (height[y * R + x] >= 0) occ[c] += 1 / (per * per);
    edge[c] += edgeR[y * R + x] / (per * per);
  }
  return { occ, edge, w, d, size };
}

/**
 * A cached template source for io/plan-furniture.js: `build(item)` → a THREE.Object3D (the item at its default
 * size), or null. Returns (item) → template or null.
 */
export function templateSource(build, options = {}) {
  const cache = new Map();
  return (item) => {
    if (!cache.has(item)) {
      let t = null;
      try { const root = build(item); t = root ? topTemplate(root, options) : null; } catch { t = null; }
      cache.set(item, t);
    }
    return cache.get(item);
  };
}
