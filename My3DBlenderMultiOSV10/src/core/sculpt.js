// Sculpt, vertex paint and weight paint brushes: all work on a mesh, in the mesh's own space, inside a brush sphere.
import { edgeMap, faceNormal, vertexNormals, v3 } from './mesh.js';

export const SCULPT_BRUSHES = {
  DRAW: { en: 'Draw', ko: '그리기' },
  CLAY: { en: 'Clay', ko: '점토' },
  CREASE: { en: 'Crease', ko: '주름' },
  INFLATE: { en: 'Inflate', ko: '부풀리기' },
  BLOB: { en: 'Blob', ko: '방울' },
  SMOOTH: { en: 'Smooth', ko: '부드럽게' },
  FLATTEN: { en: 'Flatten', ko: '평평하게' },
  PINCH: { en: 'Pinch', ko: '꼬집기' },
  GRAB: { en: 'Grab', ko: '잡기' },
  MASK: { en: 'Mask', ko: '마스크' },
};

/** Smooth falloff: 1 at the centre, 0 at the edge of the brush. */
export const falloff = (t) => { const x = Math.max(0, Math.min(1, 1 - t)); return x * x * (3 - 2 * x); };

function brushVerts(mesh, center, radius) {
  const out = [];
  mesh.verts.forEach((v, i) => {
    const d = v3.dist(v, center);
    if (d < radius) out.push([i, falloff(d / radius)]);
  });
  return out;
}

/**
 * One brush dab. `options`: { radius, strength, invert, symmetryX, symmetryY, symmetryZ, delta (grab), normal (surface normal at the hit) }.
 * Masked vertices (mesh.mask[i] = 0…1) move less. Returns how many vertices the brush moved.
 */
export function sculptDab(mesh, brush, center, options = {}) {
  const axes = [options.symmetryX, options.symmetryY, options.symmetryZ];
  let moved = 0;
  // Every combination of the chosen mirrors: up to eight dabs.
  for (let bits = 0; bits < 8; bits++) {
    if ([0, 1, 2].some((k) => (bits >> k) & 1 && !axes[k])) continue;
    const flip = [0, 1, 2].map((k) => ((bits >> k) & 1 ? -1 : 1));
    moved += dab(mesh, brush, center.map((c, k) => c * flip[k]), options, flip);
  }
  return moved;
}

function dab(mesh, brush, center, options, flip) {
  const { radius = 0.5, strength = 0.5, invert = false, delta = [0, 0, 0] } = options;
  const sign = invert ? -1 : 1;
  const hits = brushVerts(mesh, center, radius);
  if (!hits.length) return 0;
  const normals = vertexNormals(mesh);
  let area = options.normal ? options.normal.map((c, k) => c * flip[k]) : [0, 0, 0];
  if (!options.normal) {
    for (const [i] of hits) area = v3.add(area, normals[i]);
    area = v3.norm(area);
  }
  const mask = mesh.mask;
  if (brush === 'MASK') {
    mesh.mask ??= [];
    for (const [i, f] of hits) mesh.mask[i] = Math.max(0, Math.min(1, (mesh.mask[i] ?? 0) + (invert ? -1 : 1) * f * strength));
    return hits.length;
  }
  let neighbours = null;
  if (brush === 'SMOOTH') {
    neighbours = new Map();
    for (const e of edgeMap(mesh).values()) {
      if (!neighbours.has(e.a)) neighbours.set(e.a, []);
      if (!neighbours.has(e.b)) neighbours.set(e.b, []);
      neighbours.get(e.a).push(e.b);
      neighbours.get(e.b).push(e.a);
    }
  }
  let planeD = 0;
  if (brush === 'FLATTEN' || brush === 'CLAY') {
    let c = [0, 0, 0];
    for (const [i] of hits) c = v3.add(c, mesh.verts[i]);
    planeD = v3.dot(v3.mul(c, 1 / hits.length), area);
  }
  const scale = radius * 0.2 * strength * sign;
  const updates = [];
  for (const [i, f] of hits) {
    const v = mesh.verts[i];
    const k = f * (1 - (mask?.[i] ?? 0));
    let p = v;
    switch (brush) {
      case 'DRAW': p = v3.add(v, v3.mul(area, scale * k)); break;
      case 'CLAY': {
        const d = v3.dot(v, area) - planeD;
        p = v3.add(v, v3.mul(area, (scale * 0.8 - d * 0.25) * k));
        break;
      }
      case 'INFLATE': p = v3.add(v, v3.mul(normals[i], scale * k)); break;
      case 'BLOB': {
        const out = v3.norm(v3.sub(v, center));
        p = v3.add(v, v3.mul(out, scale * k));
        break;
      }
      case 'CREASE': {
        const inward = v3.sub(center, v);
        p = v3.add(v3.add(v, v3.mul(inward, 0.1 * strength * k)), v3.mul(area, -scale * 0.5 * k));
        break;
      }
      case 'PINCH': p = v3.add(v, v3.mul(v3.sub(center, v), 0.2 * strength * sign * k)); break;
      case 'SMOOTH': {
        const around = neighbours.get(i) ?? [];
        if (around.length) {
          let c = [0, 0, 0];
          for (const j of around) c = v3.add(c, mesh.verts[j]);
          p = v3.lerp(v, v3.mul(c, 1 / around.length), Math.min(1, strength * k));
        }
        break;
      }
      case 'FLATTEN': {
        const d = v3.dot(v, area) - planeD;
        p = v3.sub(v, v3.mul(area, d * strength * k * sign));
        break;
      }
      case 'GRAB': {
        const m = delta.map((c, k) => c * flip[k]);
        p = v3.add(v, v3.mul(m, k));
        break;
      }
      default:
    }
    updates.push([i, p]);
  }
  for (const [i, p] of updates) mesh.verts[i] = p;
  return updates.length;
}

/** Paints vertex colours inside the brush. Creates the colour layer on first use. */
export function vertexPaintDab(mesh, center, { radius = 0.5, strength = 1, color = [1, 0, 0], blend = 'MIX' } = {}) {
  mesh.colors ??= mesh.verts.map(() => [1, 1, 1]);
  const hits = brushVerts(mesh, center, radius);
  for (const [i, f] of hits) {
    const k = f * strength;
    const c = mesh.colors[i];
    if (blend === 'MIX') mesh.colors[i] = v3.lerp(c, color, k);
    else if (blend === 'ADD') mesh.colors[i] = c.map((x, a) => Math.min(1, x + color[a] * k));
    else if (blend === 'SUB') mesh.colors[i] = c.map((x, a) => Math.max(0, x - color[a] * k));
    else if (blend === 'MUL') mesh.colors[i] = c.map((x, a) => x * (1 - k) + x * color[a] * k);
  }
  return hits.length;
}

/** Paints a vertex group's weights inside the brush. */
export function weightPaintDab(mesh, groupName, center, { radius = 0.5, strength = 0.5, weight = 1, blend = 'MIX' } = {}) {
  let group = mesh.vgroups.find((g) => g.name === groupName);
  if (!group) { group = { name: groupName, w: {} }; mesh.vgroups.push(group); }
  const hits = brushVerts(mesh, center, radius);
  for (const [i, f] of hits) {
    const k = f * strength;
    const w = group.w[i] ?? 0;
    const next = blend === 'ADD' ? w + weight * k : blend === 'SUB' ? w - weight * k : w + (weight - w) * k;
    group.w[i] = Math.max(0, Math.min(1, next));
  }
  return hits.length;
}

/** A blue → green → red ramp for showing weights. */
export function weightColor(w) {
  const t = Math.max(0, Math.min(1, w));
  if (t < 0.25) return [0, t * 4, 1];
  if (t < 0.5) return [0, 1, 1 - (t - 0.25) * 4];
  if (t < 0.75) return [(t - 0.5) * 4, 1, 0];
  return [1, 1 - (t - 0.75) * 4, 0];
}

export { faceNormal };
