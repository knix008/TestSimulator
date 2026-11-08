// Baking: what a surface shows, or what a more detailed copy of it looks like, written into an image through its UVs.
import { Matrix3, Vector3 } from 'three';
import { evaluatedMesh, getMaterial, worldMatrix } from './doc.js';
import { evalShader } from './nodes.js';
import { buildBVH, buildRenderScene, intersect, tracePath } from './pathtracer.js';
import { toTriangles, v3 } from './mesh.js';

export const BAKE_TYPES = ['DIFFUSE', 'EMIT', 'ROUGHNESS', 'NORMAL', 'POSITION', 'UV', 'AO', 'COMBINED', 'DISPLACEMENT'];

const toSRGB = (x) => { const v = Math.max(0, Math.min(1, x)); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };

/** Every triangle of a mesh in world space, with its normals, UVs and material slot. */
function worldTriangles(mesh, matrix) {
  const tri = toTriangles(mesh);
  const nm = new Matrix3().getNormalMatrix(matrix);
  const p = new Vector3();
  const count = tri.positions.length / 9;
  const out = [];
  for (let t = 0; t < count; t++) {
    const pos = [];
    const nor = [];
    for (let k = 0; k < 3; k++) {
      p.set(tri.positions[t * 9 + k * 3], tri.positions[t * 9 + k * 3 + 1], tri.positions[t * 9 + k * 3 + 2]).applyMatrix4(matrix);
      pos.push([p.x, p.y, p.z]);
      p.set(tri.normals[t * 9 + k * 3], tri.normals[t * 9 + k * 3 + 1], tri.normals[t * 9 + k * 3 + 2]).applyMatrix3(nm).normalize();
      nor.push([p.x, p.y, p.z]);
    }
    out.push({ pos, nor, uv: [0, 1, 2].map((k) => [tri.uvs[t * 6 + k * 2], tri.uvs[t * 6 + k * 2 + 1]]), slot: tri.triMat[t] });
  }
  return out;
}

/** Tangent and bitangent of a triangle, from how its UVs lie on it. */
function tangentFrame(t) {
  const [e1, e2] = [v3.sub(t.pos[1], t.pos[0]), v3.sub(t.pos[2], t.pos[0])];
  const [du1, dv1, du2, dv2] = [t.uv[1][0] - t.uv[0][0], t.uv[1][1] - t.uv[0][1], t.uv[2][0] - t.uv[0][0], t.uv[2][1] - t.uv[0][1]];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-12) return null;
  return { t: v3.norm(v3.mul(v3.sub(v3.mul(e1, dv2), v3.mul(e2, dv1)), 1 / det)), b: v3.norm(v3.mul(v3.sub(v3.mul(e2, du1), v3.mul(e1, du2)), 1 / det)) };
}

const positionsOf = (triangles) => { const out = new Float32Array(triangles.length * 9); triangles.forEach((t, i) => t.pos.forEach((p, k) => out.set(p, i * 9 + k * 3))); return out; };

/**
 * Bakes one object into a new { width, height, rgba }, row 0 at the top. Needs UVs.
 * `high`: a more detailed mesh in the same space. With it, NORMAL and DISPLACEMENT come from what a ray along the normal finds on that mesh, within `distance`.
 */
export function bakeMap(doc, obj, { type = 'DIFFUSE', width = 256, height = 256, images = {}, high = null, distance = 0.5, samples = 16, margin = 4, mesh: given = null, seed = 1 } = {}) {
  const mesh = given ?? evaluatedMesh(doc, obj, { render: true });
  if (!mesh?.uvs?.some(Boolean)) throw new Error('This object has no UV map to bake into: unwrap it first');
  const matrix = worldMatrix(doc, obj);
  const triangles = worldTriangles(mesh, matrix);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const filled = new Uint8Array(width * height);
  const materials = obj.materials.map((id) => getMaterial(doc, id));
  const box = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  for (const t of triangles) for (const p of t.pos) for (let k = 0; k < 3; k++) { box.lo[k] = Math.min(box.lo[k], p[k]); box.hi[k] = Math.max(box.hi[k], p[k]); }
  let s = seed >>> 0 || 1;
  const random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  // Rays: against the detailed mesh, or the scene for AO and Combined.
  const highTriangles = high ? worldTriangles(high, matrix) : null;
  const highScene = highTriangles ? { positions: positionsOf(highTriangles) } : null;
  const highBvh = highScene ? buildBVH(highScene.positions) : null;
  const needScene = type === 'AO' || type === 'COMBINED';
  const scene = needScene ? { ...buildRenderScene(doc, { images }), images } : null;
  const sceneBvh = scene ? buildBVH(scene.positions) : null;
  const surfaceAt = (t, position, normal, uv) => {
    const material = materials[t.slot] ?? materials[0];
    if (material?.useNodes && material.nodes) return evalShader(material.nodes, { uv, position, normal, images }) ?? material;
    return material ?? { baseColor: [0.8, 0.8, 0.8], roughness: 0.5, emission: [0, 0, 0] };
  };
  /** What a ray finds on the detailed mesh, either way along the normal: the nearest. */
  const probe = (position, normal) => {
    let best = null;
    for (const sign of [1, -1]) {
      const d = v3.mul(normal, sign);
      const hit = {};
      const h = intersect(highScene, highBvh, position[0], position[1], position[2], d[0], d[1], d[2], distance, false, hit);
      if (h && (!best || h.t < Math.abs(best.signed))) best = { signed: sign * h.t, tri: h.tri, u: h.u, v: h.v };
    }
    return best;
  };
  const shade = (t, frame, position, normal, uv) => {
    switch (type) {
      case 'DIFFUSE': return (surfaceAt(t, position, normal, uv).baseColor ?? [0.8, 0.8, 0.8]).map(toSRGB);
      case 'EMIT': return (surfaceAt(t, position, normal, uv).emission ?? [0, 0, 0]).map(toSRGB);
      case 'ROUGHNESS': { const r = surfaceAt(t, position, normal, uv).roughness ?? 0.5; return [r, r, r]; }
      case 'POSITION': return position.map((x, k) => (x - box.lo[k]) / Math.max(1e-6, box.hi[k] - box.lo[k]));
      case 'UV': return [uv[0], uv[1], 0];
      case 'NORMAL': {
        let n = surfaceAt(t, position, normal, uv).normal ?? normal;
        if (highTriangles) {
          const found = probe(position, normal);
          if (found) { const h = highTriangles[found.tri]; const w = 1 - found.u - found.v; n = v3.norm(v3.add(v3.add(v3.mul(h.nor[0], w), v3.mul(h.nor[1], found.u)), v3.mul(h.nor[2], found.v))); }
        }
        if (!frame) return [0.5, 0.5, 1];
        return [v3.dot(n, frame.t) * 0.5 + 0.5, v3.dot(n, frame.b) * 0.5 + 0.5, v3.dot(n, normal) * 0.5 + 0.5];
      }
      case 'DISPLACEMENT': {
        const found = highTriangles ? probe(position, normal) : null;
        const value = found ? found.signed / distance : 0;
        const g = 0.5 + value * 0.5;
        return [g, g, g];
      }
      case 'AO': {
        let open = 0;
        const ref = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const a = v3.norm(v3.cross(ref, normal));
        const b = v3.cross(normal, a);
        const o = v3.add(position, v3.mul(normal, 1e-4));
        for (let i = 0; i < samples; i++) {
          const [r2, phi] = [random(), 2 * Math.PI * random()];
          const r = Math.sqrt(r2);
          const d = v3.add(v3.add(v3.mul(a, r * Math.cos(phi)), v3.mul(b, r * Math.sin(phi))), v3.mul(normal, Math.sqrt(1 - r2)));
          if (!intersect(scene, sceneBvh, o[0], o[1], o[2], d[0], d[1], d[2], distance * 4, true)) open++;
        }
        const g = open / samples;
        return [g, g, g];
      }
      case 'COMBINED': {
        const sum = [0, 0, 0];
        const o = v3.add(position, v3.mul(normal, 1e-3));
        for (let i = 0; i < samples; i++) {
          const c = tracePath(scene, sceneBvh, o, v3.mul(normal, -1), random, null);
          for (let k = 0; k < 3; k++) sum[k] += Math.min(20, c[k]);
        }
        return sum.map((x) => toSRGB(x / samples));
      }
      default: throw new Error(`Unknown bake type: ${type}`);
    }
  };
  for (const t of triangles) {
    const frame = type === 'NORMAL' ? tangentFrame(t) : null;
    const [a, b, c] = t.uv;
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denominator) < 1e-14) continue;
    const [x0, x1] = [Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) * width)), Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0]) * width))];
    const [y0, y1] = [Math.max(0, Math.floor((1 - Math.max(a[1], b[1], c[1])) * height)), Math.min(height - 1, Math.ceil((1 - Math.min(a[1], b[1], c[1])) * height))];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [u, w] = [(x + 0.5) / width, 1 - (y + 0.5) / height];
      const l0 = ((b[1] - c[1]) * (u - c[0]) + (c[0] - b[0]) * (w - c[1])) / denominator;
      const l1 = ((c[1] - a[1]) * (u - c[0]) + (a[0] - c[0]) * (w - c[1])) / denominator;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
      const blend = (list) => list[0].map((_, k) => list[0][k] * l0 + list[1][k] * l1 + list[2][k] * l2);
      const out = shade(t, frame, blend(t.pos), v3.norm(blend(t.nor)), [u, w]);
      const i = (y * width + x) * 4;
      rgba[i] = out[0] * 255; rgba[i + 1] = out[1] * 255; rgba[i + 2] = out[2] * 255; rgba[i + 3] = 255;
      filled[y * width + x] = 1;
    }
  }
  // A margin around the islands, so that filtering does not pull in what is outside them.
  for (let pass = 0; pass < margin; pass++) {
    const next = filled.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (filled[y * width + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !filled[ny * width + nx]) continue;
        const [from, to] = [(ny * width + nx) * 4, (y * width + x) * 4];
        for (let k = 0; k < 4; k++) rgba[to + k] = rgba[from + k];
        next[y * width + x] = 1;
        break;
      }
    }
    filled.set(next);
  }
  return { width, height, rgba };
}
