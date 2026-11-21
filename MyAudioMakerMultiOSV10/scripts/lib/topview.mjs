// Furniture seen from above, for the interior plan pictures (scripts/make-plan-image-samples.mjs): every object of a
// level is built from the library (the real parametric model), placed, and its triangles are rasterised straight
// down onto the picture's pixel grid (a z-buffer: the highest surface wins). From that:
//   colour — the material colour, lit from above (surfaces facing up are lighter), with a soft shadow on the floor
//   line   — only the edges: where the height jumps (a sofa back, a pillow, a table top) or one object meets another
//   flat   — one light tone per object and its outline (a sales-catalogue furniture plan)
// Like a plan cut: what is higher than `cut` (ceiling lights, upper cabinets, wall art) is left out.
// Returns an RGBA buffer to lay between the floors and the walls, plus each object's footprint (plan metres).
import * as THREE from 'three';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';
import { getMaterial } from '../../src/engine/materials.js';

const BY_ID = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));
const ctx = { quality: 'low', wallThickness: 0.2, material: (id, o) => getMaterial(id, o) };

/** sRGB [r, g, b] (0–255) of a material (its base colour; textures are not loaded here). */
function colourOf(material) {
  const c = material?.color ?? new THREE.Color(0.8, 0.8, 0.8);
  const hex = c.getHex(THREE.SRGBColorSpace);
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/**
 * objects: project objects of one level; grid: { width, height, toPixel([x, z]) → [px, py], k (px per metre) }.
 * options: { mode: 'colour' | 'line' | 'flat', cut = 1.5, ink = [r, g, b], shadow = true, lineAlpha }.
 */
export function topView(objects, grid, { mode = 'colour', cut = 1.5, ink = [40, 40, 40], shadow = true, lineAlpha = 0.9, flatTone = null } = {}) {
  const { width: W, height: H, k } = grid;
  const height = new Float32Array(W * H).fill(-1);
  const owner = new Int32Array(W * H).fill(-1);
  const rgb = new Float32Array(W * H * 3);
  const footprints = [];
  const v0 = new THREE.Vector3(); const v1 = new THREE.Vector3(); const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const n = new THREE.Vector3();
  const m = new THREE.Matrix4();
  objects.forEach((object, index) => {
    const entry = BY_ID.get(object.item);
    if (!entry) return;
    let root;
    try { root = entry.build(object.params ?? {}, ctx); } catch { return; }
    if (!root) return;
    root.position.set(...object.position);
    root.rotation.set(...(object.rotation ?? [0, 0, 0]));
    root.scale.set(...(object.scale ?? [1, 1, 1]));
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let drawn = false;
    root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const count = idx ? idx.count : pos.count;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = mesh.geometry.groups?.length ? mesh.geometry.groups : [{ start: 0, count, materialIndex: 0 }];
      const instances = mesh.isInstancedMesh ? mesh.count : 1;
      for (let inst = 0; inst < instances; inst++) {
        if (mesh.isInstancedMesh) { mesh.getMatrixAt(inst, m); m.premultiply(mesh.matrixWorld); } else m.copy(mesh.matrixWorld);
        for (const g of groups) {
          const material = materials[g.materialIndex ?? 0] ?? materials[0];
          if (!material || material.visible === false) continue;
          const base = colourOf(material);
          const glass = material.transparent && (material.opacity ?? 1) < 0.6;
          for (let t = g.start; t + 2 < g.start + g.count && t + 2 < count; t += 3) {
            const a = idx ? idx.getX(t) : t; const b = idx ? idx.getX(t + 1) : t + 1; const c = idx ? idx.getX(t + 2) : t + 2;
            v0.fromBufferAttribute(pos, a).applyMatrix4(m); v1.fromBufferAttribute(pos, b).applyMatrix4(m); v2.fromBufferAttribute(pos, c).applyMatrix4(m);
            if (Math.min(v0.y, v1.y, v2.y) > cut) continue;
            n.crossVectors(e1.subVectors(v1, v0), e2.subVectors(v2, v0));
            const len = n.length();
            if (len < 1e-12) continue;
            const up = Math.abs(n.y) / len;
            if (up < 0.04) continue; // standing faces have no area seen from above
            box.expandByPoint(v0); box.expandByPoint(v1); box.expandByPoint(v2);
            drawn = true;
            const P = [grid.toPixel([v0.x, v0.z]), grid.toPixel([v1.x, v1.z]), grid.toPixel([v2.x, v2.z])];
            const ys = [Math.min(v0.y, cut), Math.min(v1.y, cut), Math.min(v2.y, cut)];
            const shade = 0.6 + 0.4 * up;
            raster(P, ys, (i, y) => {
              if (y <= height[i]) return;
              height[i] = y; owner[i] = index;
              const lift = 0.9 + 0.12 * Math.min(1, y / 1.2);
              for (let ch = 0; ch < 3; ch++) rgb[i * 3 + ch] = glass ? 200 + base[ch] * 0.2 : base[ch] * shade * lift;
            });
          }
        }
      }
    });
    if (drawn) footprints.push({ item: object.item, position: [object.position[0], object.position[2]], rotation: object.rotation?.[1] ?? 0, min: [box.min.x, box.min.z], max: [box.max.x, box.max.z], height: Math.min(box.max.y, cut) });
  });

  function raster(P, ys, put) {
    const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))); const maxX = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))); const maxY = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5; const py = y + 0.5;
        const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
        const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        put(y * W + x, w0 * ys[0] + w1 * ys[1] + w2 * ys[2]);
      }
    }
  }

  // Edges: a height jump of 3 cm or more, or another object next door (seen from above, like a drawn plan).
  const edge = new Uint8Array(W * H);
  const jump = 0.03;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (owner[i] < 0) continue;
      for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1, x > 0 ? i - 1 : -1, y > 0 ? i - W : -1]) {
        if (j < 0) { edge[i] = 2; break; }
        if (owner[j] !== owner[i]) { edge[i] = 2; break; }
        if (Math.abs(height[j] - height[i]) >= jump && height[i] > height[j]) edge[i] = Math.max(edge[i], 1);
      }
    }
  }
  const out = Buffer.alloc(W * H * 4);
  const reach = Math.max(2, Math.round(k * 0.12)); // shadow length for 1 m of height
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x; const o = i * 4;
      if (owner[i] >= 0) {
        let c;
        if (mode === 'colour') c = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
        else if (mode === 'flat') c = flatTone ?? [246, 242, 234];
        else c = [255, 255, 255];
        let a = 255;
        if (edge[i]) {
          const strength = edge[i] === 2 ? 1 : mode === 'colour' ? 0.45 : 0.85;
          c = c.map((v, ch) => v * (1 - strength * lineAlpha) + ink[ch] * strength * lineAlpha);
        }
        if (mode === 'line' && !edge[i]) a = 235; // a hint of white under the lines hides the floor pattern
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = a;
      } else if (shadow && mode === 'colour') {
        // A soft shadow down and to the right of what stands nearby.
        let s = 0;
        for (let d = 1; d <= reach; d += 1) {
          const X = x - d; const Y = y - d;
          if (X < 0 || Y < 0) break;
          const j = Y * W + X;
          if (owner[j] >= 0 && height[j] * k * 0.12 * 1.4 >= d) s = Math.max(s, 1 - d / (reach + 1));
        }
        if (s > 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = Math.round(70 * s); }
      }
    }
  }
  return { rgba: out, footprints };
}
