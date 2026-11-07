// A CPU path tracer: BVH over world-space triangles, next-event estimation for lights, a principled-style surface
// (diffuse, GGX specular, metal, glass, emission), depth of field. Pure computation: runs in a worker or in Node.
import { Matrix3, Matrix4, Vector3 } from 'three';
import { GEOMETRY_TYPES, getMaterial, evaluatedMesh, getObject, isVisible, worldMatrix } from './doc.js';
import { isInstanceSource, sceneInstances } from './scenes.js';
import { sceneVolumes, simBaked } from './simulation.js';
import { particlesAt } from './physics.js';
import { toTriangles, v3 } from './mesh.js';
import { evalShader, evalWorld } from './nodes.js';

// ─────────────── the scene the tracer sees

/** Takes a snapshot of the document: triangles in world space, lights, camera, world. Transferable to a worker. */
export function buildRenderScene(doc, { frame = doc.frame, width, height } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const triMat = [];
  const vertexColors = [];
  let anyColors = false;
  const materials = [];
  const materialIndex = new Map();
  const slot = (id) => {
    if (!materialIndex.has(id)) {
      const m = id ? getMaterial(doc, id) : null;
      materialIndex.set(id, materials.length);
      materials.push(m ? { baseColor: m.baseColor, metallic: m.metallic, roughness: m.roughness, specular: m.specular, ior: m.ior, transmission: m.transmission, alpha: m.alpha, emission: m.emission.map((c) => c * m.emissionStrength), nodes: m.useNodes ? m.nodes : null }
        : { baseColor: [0.8, 0.8, 0.8], metallic: 0, roughness: 0.5, specular: 0.5, ior: 1.45, transmission: 0, alpha: 1, emission: [0, 0, 0], nodes: null });
    }
    return materialIndex.get(id);
  };
  const lights = [];
  const p = new Vector3();
  const n = new Vector3();
  const addTriangles = (obj, m) => {
    const mesh = evaluatedMesh(doc, obj, { frame, render: true });
    if (!mesh?.faces.length) return;
    const tri = toTriangles(mesh);
    const nm = new Matrix3().getNormalMatrix(m);
    for (let i = 0; i < tri.positions.length; i += 3) {
      p.set(tri.positions[i], tri.positions[i + 1], tri.positions[i + 2]).applyMatrix4(m);
      positions.push(p.x, p.y, p.z);
      n.set(tri.normals[i], tri.normals[i + 1], tri.normals[i + 2]).applyMatrix3(nm).normalize();
      normals.push(n.x, n.y, n.z);
    }
    for (const uv of tri.uvs) uvs.push(uv);
    for (const t of tri.triMat) triMat.push(slot(obj.materials[t] ?? obj.materials[0] ?? null));
    // Dynamic Paint shows as the surface's colour.
    if (obj.dynamicPaint?.role === 'CANVAS' && tri.colors) { anyColors = true; for (const c of tri.colors) vertexColors.push(c); } else for (let i = 0; i < tri.positions.length; i++) vertexColors.push(-1);
  };
  /** Triangles given directly in world space, with flat normals. */
  const pushTriangle = (a, b, c, slotIndex) => {
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(nx, ny, nz) || 1;
    positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) normals.push(nx / len, ny / len, nz / len);
    uvs.push(0, 0, 0, 0, 0, 0);
    triMat.push(slotIndex);
    for (let k = 0; k < 9; k++) vertexColors.push(-1);
  };
  const OCTA = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  const addParticles = (obj) => {
    for (const system of obj.particles ?? []) {
      const index = slot(obj.materials[0] ?? null);
      const list = particlesAt(doc, obj, system, frame);
      if (system.kind === 'HAIR') {
        const w = Math.max(0.002, system.size * 0.15);
        for (const strand of list) {
          for (let i = 0; i + 1 < strand.length; i++) {
            const [a, b] = [strand[i], strand[i + 1]];
            const [p0, p1, p2] = [[a[0] - w, a[1], a[2]], [a[0] + w, a[1], a[2]], [a[0], a[1] + w, a[2]]];
            const [q0, q1, q2] = [[b[0] - w, b[1], b[2]], [b[0] + w, b[1], b[2]], [b[0], b[1] + w, b[2]]];
            for (const [x, y, z, u] of [[p0, p1, q1, q0], [p1, p2, q2, q1], [p2, p0, q0, q2]]) { pushTriangle(x, y, z, index); pushTriangle(x, z, u, index); }
          }
        }
      } else {
        const r = system.size;
        for (const p of list) {
          const v = [[p[0] + r, p[1], p[2]], [p[0] - r, p[1], p[2]], [p[0], p[1] + r, p[2]], [p[0], p[1] - r, p[2]], [p[0], p[1], p[2] + r], [p[0], p[1], p[2] - r]];
          for (const [a, b, c] of OCTA) pushTriangle(v[a], v[b], v[c], index);
        }
      }
    }
  };
  for (const inst of sceneInstances(doc, { frame })) {
    if (isVisible(doc, inst.owner) && !inst.owner.hideRender && GEOMETRY_TYPES.has(inst.object.type)) addTriangles(inst.object, inst.matrix);
  }
  for (const obj of doc.objects) {
    if (!isVisible(doc, obj) || obj.hideRender || isInstanceSource(doc, obj)) continue;
    const m = worldMatrix(doc, obj);
    if (obj.type === 'LIGHT') {
      const l = obj.data;
      const dir = new Vector3(0, 0, -1).transformDirection(m);
      const origin = new Vector3().setFromMatrixPosition(m);
      const uAxis = new Vector3(1, 0, 0).transformDirection(m);
      const vAxis = new Vector3(0, 1, 0).transformDirection(m);
      lights.push({
        kind: l.kind, color: l.color, energy: l.energy, radius: l.radius, size: l.size, spot: (l.spotSize * Math.PI) / 360, blend: l.spotBlend, castShadow: l.castShadow !== false,
        position: [origin.x, origin.y, origin.z], direction: [dir.x, dir.y, dir.z], u: [uAxis.x, uAxis.y, uAxis.z], v: [vAxis.x, vAxis.y, vAxis.z],
      });
      continue;
    }
    if (!GEOMETRY_TYPES.has(obj.type)) continue;
    // Simulation domains and flows are places, not things; a baked liquid domain is the liquid.
    if (obj.smoke || obj.smokeFlow || obj.fluidFlow || (obj.fluid && !simBaked(obj))) continue;
    addTriangles(obj, m);
    if (obj.particles?.length) addParticles(obj);
  }
  const camObj = getObject(doc, doc.activeCamera) ?? doc.objects.find((o) => o.type === 'CAMERA');
  const r = doc.render;
  const w = width ?? Math.max(1, Math.round((r.width * r.percent) / 100));
  const h = height ?? Math.max(1, Math.round((r.height * r.percent) / 100));
  const camera = camObj ? cameraDescription(camObj.data, worldMatrix(doc, camObj)) : cameraDescription({ kind: 'PERSP', lens: 50, sensor: 36 }, new Matrix4().lookAt(new Vector3(7, -7, 5), new Vector3(0, 0, 0), new Vector3(0, 0, 1)).setPosition(7, -7, 5));
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), triMat: new Int32Array(triMat),
    vertexColors: anyColors ? new Float32Array(vertexColors) : null,
    volumes: sceneVolumes(doc, { frame }),
    materials, lights, camera, width: w, height: h,
    world: { color: doc.world.color, strength: doc.world.strength, nodes: doc.world.useNodes ? doc.world.nodes : null },
    settings: { samples: r.samples, bounces: r.bounces, exposure: r.exposure, gamma: r.gamma, filmTransparent: r.filmTransparent, viewTransform: r.viewTransform, denoise: r.denoise, seed: r.seed },
  };
}

function cameraDescription(cam, m) {
  const e = m.elements;
  const lens = cam.lens ?? 50;
  const sensor = cam.sensor ?? 36;
  return {
    kind: cam.kind ?? 'PERSP',
    position: [e[12], e[13], e[14]],
    right: v3.norm([e[0], e[1], e[2]]), up: v3.norm([e[4], e[5], e[6]]), forward: v3.norm([-e[8], -e[9], -e[10]]),
    tanHalf: sensor / (2 * lens), orthoScale: cam.orthoScale ?? 6,
    aperture: cam.dofEnabled ? lens / (cam.fstop || 2.8) / 2 / 1000 : 0, focus: cam.dofFocus ?? 10,
  };
}

// ─────────────── BVH

export function buildBVH(positions) {
  const count = positions.length / 9;
  const order = new Int32Array(count).map((_, i) => i);
  const cx = new Float32Array(count * 3);
  const bmin = new Float32Array(count * 3);
  const bmax = new Float32Array(count * 3);
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const [a, b, c] = [positions[t * 9 + k], positions[t * 9 + 3 + k], positions[t * 9 + 6 + k]];
      bmin[t * 3 + k] = Math.min(a, b, c);
      bmax[t * 3 + k] = Math.max(a, b, c);
      cx[t * 3 + k] = (a + b + c) / 3;
    }
  }
  const nodes = [];
  const build = (start, end) => {
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const cBox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const t = order[i];
      for (let k = 0; k < 3; k++) {
        box[k] = Math.min(box[k], bmin[t * 3 + k]);
        box[k + 3] = Math.max(box[k + 3], bmax[t * 3 + k]);
        cBox[k] = Math.min(cBox[k], cx[t * 3 + k]);
        cBox[k + 3] = Math.max(cBox[k + 3], cx[t * 3 + k]);
      }
    }
    const index = nodes.length;
    nodes.push({ box, left: -1, right: -1, start, end });
    if (end - start <= 4) return index;
    const spans = [cBox[3] - cBox[0], cBox[4] - cBox[1], cBox[5] - cBox[2]];
    const axis = spans[0] > spans[1] ? (spans[0] > spans[2] ? 0 : 2) : (spans[1] > spans[2] ? 1 : 2);
    if (spans[axis] < 1e-9) return index;
    const midValue = (cBox[axis] + cBox[axis + 3]) / 2;
    let i = start;
    let j = end - 1;
    while (i <= j) {
      if (cx[order[i] * 3 + axis] < midValue) i++;
      else { [order[i], order[j]] = [order[j], order[i]]; j--; }
    }
    if (i === start || i === end) return index;
    const left = build(start, i);
    const right = build(i, end);
    nodes[index].left = left;
    nodes[index].right = right;
    return index;
  };
  if (count) build(0, count);
  return { nodes, order };
}

// Hit fields as a reusable object: the tracer makes millions of these tests.
export function intersect(scene, bvh, ox, oy, oz, dx, dy, dz, tMax, anyHit = false, hit = {}) {
  const { nodes, order } = bvh;
  if (!nodes.length) return null;
  const pos = scene.positions;
  const [ix, iy, iz] = [1 / dx, 1 / dy, 1 / dz];
  let best = tMax;
  let bestTri = -1;
  let bu = 0;
  let bv = 0;
  const stack = [0];
  while (stack.length) {
    const node = nodes[stack.pop()];
    const b = node.box;
    let t0 = (b[0] - ox) * ix;
    let t1 = (b[3] - ox) * ix;
    if (t0 > t1) [t0, t1] = [t1, t0];
    let tn = t0;
    let tf = t1;
    t0 = (b[1] - oy) * iy; t1 = (b[4] - oy) * iy;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tn) tn = t0;
    if (t1 < tf) tf = t1;
    t0 = (b[2] - oz) * iz; t1 = (b[5] - oz) * iz;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tn) tn = t0;
    if (t1 < tf) tf = t1;
    if (tn > tf || tf < 0 || tn > best) continue;
    if (node.left >= 0) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = order[i];
      const o = t * 9;
      const [ax, ay, az] = [pos[o], pos[o + 1], pos[o + 2]];
      const [e1x, e1y, e1z] = [pos[o + 3] - ax, pos[o + 4] - ay, pos[o + 5] - az];
      const [e2x, e2y, e2z] = [pos[o + 6] - ax, pos[o + 7] - ay, pos[o + 8] - az];
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const [sx, sy, sz] = [ox - ax, oy - ay, oz - az];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (d > 1e-5 && d < best) {
        if (anyHit) return hit;
        best = d; bestTri = t; bu = u; bv = v;
      }
    }
  }
  if (bestTri < 0) return null;
  hit.t = best; hit.tri = bestTri; hit.u = bu; hit.v = bv;
  return hit;
}

// ─────────────── shading

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function basis(n) {
  const ref = Math.abs(n[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0];
  const t = v3.norm(v3.cross(ref, n));
  return [t, v3.cross(n, t)];
}

function cosineSample(n, r1, r2) {
  const [t, b] = basis(n);
  const phi = 2 * Math.PI * r1;
  const r = Math.sqrt(r2);
  const z = Math.sqrt(Math.max(0, 1 - r2));
  return v3.norm(v3.add(v3.add(v3.mul(t, r * Math.cos(phi)), v3.mul(b, r * Math.sin(phi))), v3.mul(n, z)));
}

function ggxHalf(n, roughness, r1, r2) {
  const a = Math.max(0.001, roughness * roughness);
  const [t, b] = basis(n);
  const phi = 2 * Math.PI * r1;
  const cos = Math.sqrt((1 - r2) / (1 + (a * a - 1) * r2));
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  return v3.norm(v3.add(v3.add(v3.mul(t, sin * Math.cos(phi)), v3.mul(b, sin * Math.sin(phi))), v3.mul(n, cos)));
}

const reflect = (d, n) => v3.sub(d, v3.mul(n, 2 * v3.dot(d, n)));

function refract(d, n, eta) {
  const cos = -v3.dot(d, n);
  const k = 1 - eta * eta * (1 - cos * cos);
  if (k < 0) return null;
  return v3.norm(v3.add(v3.mul(d, eta), v3.mul(n, eta * cos - Math.sqrt(k))));
}

const schlick = (cos, f0) => f0 + (1 - f0) * (1 - cos) ** 5;

/** The surface at a hit: a material's plain values, or its node tree evaluated at this point. */
function surfaceAt(scene, material, position, normal, uv) {
  if (material.nodes) {
    const bsdf = evalShader(material.nodes, { uv, position, normal, images: scene.images });
    if (bsdf) return bsdf;
  }
  return material;
}

function worldColor(scene, dir) {
  const w = scene.world;
  if (w.nodes) {
    const c = evalWorld(w.nodes, { normal: dir });
    if (c) return c;
  }
  return w.color.map((c) => c * w.strength);
}

/** Direct light at a point from one randomly picked light (the pick is unbiased: its result is multiplied by the count). */
function sampleLight(scene, bvh, pos, n, view, surf, random) {
  const lights = scene.lights;
  if (!lights.length) return [0, 0, 0];
  const light = lights[Math.floor(random() * lights.length) % lights.length];
  let toLight;
  let dist;
  let radiance;
  if (light.kind === 'SUN') {
    const spread = Math.max(0, light.radius);
    const jitter = spread > 0 ? v3.mul(cosineSample(light.direction, random(), random()), spread) : [0, 0, 0];
    toLight = v3.norm(v3.sub(jitter, light.direction));
    dist = 1e6;
    radiance = v3.mul(light.color, light.energy);
  } else {
    let target = light.position;
    let area = 1;
    if (light.kind === 'AREA') {
      target = v3.add(v3.add(light.position, v3.mul(light.u, (random() - 0.5) * light.size)), v3.mul(light.v, (random() - 0.5) * light.size));
    } else if (light.radius > 0) {
      const r = v3.mul(v3.norm([random() - 0.5, random() - 0.5, random() - 0.5]), light.radius * random());
      target = v3.add(target, r);
    }
    const d = v3.sub(target, pos);
    dist = v3.len(d);
    if (dist < 1e-6) return [0, 0, 0];
    toLight = v3.mul(d, 1 / dist);
    area = 1 / (4 * Math.PI * dist * dist);
    let k = light.energy * area;
    if (light.kind === 'SPOT') {
      const cos = v3.dot(light.direction, v3.mul(toLight, -1));
      const [outer, inner] = [Math.cos(light.spot), Math.cos(light.spot * (1 - Math.max(0.001, light.blend)))];
      if (cos <= outer) return [0, 0, 0];
      k *= Math.min(1, (cos - outer) / Math.max(1e-4, inner - outer));
    } else if (light.kind === 'AREA') {
      k *= Math.max(0, v3.dot(light.direction, v3.mul(toLight, -1))) * 2;
    }
    radiance = v3.mul(light.color, k);
  }
  const nl = v3.dot(n, toLight);
  if (nl <= 0) return [0, 0, 0];
  if (light.castShadow && intersect(scene, bvh, pos[0] + n[0] * 1e-4, pos[1] + n[1] * 1e-4, pos[2] + n[2] * 1e-4, toLight[0], toLight[1], toLight[2], dist - 2e-4, true)) return [0, 0, 0];
  // Diffuse (for non-metals) plus a GGX highlight.
  const diffuse = v3.mul(surf.baseColor, ((1 - surf.metallic) * (1 - surf.transmission)) / Math.PI);
  const h = v3.norm(v3.add(toLight, view));
  const nh = Math.max(0, v3.dot(n, h));
  const nv = Math.max(1e-4, v3.dot(n, view));
  const vh = Math.max(0, v3.dot(view, h));
  const a = Math.max(0.001, surf.roughness * surf.roughness);
  const a2 = a * a;
  const denom = nh * nh * (a2 - 1) + 1;
  const D = a2 / (Math.PI * denom * denom);
  const k = ((surf.roughness + 1) ** 2) / 8;
  const G = (nl / (nl * (1 - k) + k)) * (nv / (nv * (1 - k) + k));
  const f0 = surf.baseColor.map((c) => 0.08 * (surf.specular ?? 0.5) * (1 - surf.metallic) + c * surf.metallic);
  const fh = (1 - vh) ** 5;
  const spec = f0.map((f) => (D * G * (f + (1 - f) * fh)) / (4 * nl * nv));
  const count = lights.length;
  return [0, 1, 2].map((c) => (diffuse[c] + spec[c]) * radiance[c] * nl * count);
}

// ─────────────── volumes

/** Where a ray is inside a box: [near, far], or null. */
function boxSpan(v, o, d, tMax) {
  let near = 0;
  let far = tMax;
  for (let k = 0; k < 3; k++) {
    const inv = 1 / d[k];
    let t0 = (v.min[k] - o[k]) * inv;
    let t1 = (v.max[k] - o[k]) * inv;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return null;
  }
  return [near, far];
}

/** A grid's value at a world point, 0…1, smooth between cells. */
function gridAt(v, field, p) {
  const [nx, ny, nz] = v.n;
  const x = ((p[0] - v.min[0]) / (v.max[0] - v.min[0])) * nx - 0.5;
  const y = ((p[1] - v.min[1]) / (v.max[1] - v.min[1])) * ny - 0.5;
  const z = ((p[2] - v.min[2]) / (v.max[2] - v.min[2])) * nz - 0.5;
  const fx = Math.max(0, Math.min(nx - 1.001, x));
  const fy = Math.max(0, Math.min(ny - 1.001, y));
  const fz = Math.max(0, Math.min(nz - 1.001, z));
  const [i, j, k] = [Math.floor(fx), Math.floor(fy), Math.floor(fz)];
  const [u, w, t] = [fx - i, fy - j, fz - k];
  const at = (a, b, c) => field[a + b * nx + c * nx * ny];
  const c0 = (at(i, j, k) * (1 - u) + at(i + 1, j, k) * u) * (1 - w) + (at(i, j + 1, k) * (1 - u) + at(i + 1, j + 1, k) * u) * w;
  const c1 = (at(i, j, k + 1) * (1 - u) + at(i + 1, j, k + 1) * u) * (1 - w) + (at(i, j + 1, k + 1) * (1 - u) + at(i + 1, j + 1, k + 1) * u) * w;
  return (c0 * (1 - t) + c1 * t) / 255;
}

/** Fraction of light that gets through the volumes along a shadow ray (ratio tracking). */
function volumeTransmittance(scene, o, d, tMax, random) {
  let tr = 1;
  for (const v of scene.volumes) {
    const span = boxSpan(v, o, d, tMax);
    if (!span) continue;
    let t = span[0];
    for (let guard = 0; guard < 256; guard++) {
      t += -Math.log(1 - random()) / v.sigma;
      if (t >= span[1]) break;
      tr *= 1 - gridAt(v, v.density, [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]);
      if (tr < 0.02) return 0;
    }
  }
  return tr;
}

/** Light reaching a point in a volume from one random light. Scattering is even in all directions. */
function volumeLight(scene, bvh, pos, random) {
  const lights = scene.lights;
  if (!lights.length) return [0, 0, 0];
  const light = lights[Math.floor(random() * lights.length) % lights.length];
  let toLight;
  let dist;
  let radiance;
  if (light.kind === 'SUN') {
    toLight = v3.mul(light.direction, -1);
    dist = 1e6;
    radiance = v3.mul(light.color, light.energy);
  } else {
    const d = v3.sub(light.position, pos);
    dist = v3.len(d);
    if (dist < 1e-6) return [0, 0, 0];
    toLight = v3.mul(d, 1 / dist);
    radiance = v3.mul(light.color, light.energy / (4 * Math.PI * dist * dist));
    if (light.kind === 'SPOT') {
      const cos = v3.dot(light.direction, v3.mul(toLight, -1));
      const [outer, inner] = [Math.cos(light.spot), Math.cos(light.spot * (1 - Math.max(0.001, light.blend)))];
      if (cos <= outer) return [0, 0, 0];
      radiance = v3.mul(radiance, Math.min(1, (cos - outer) / Math.max(1e-4, inner - outer)));
    }
  }
  if (light.castShadow && intersect(scene, bvh, pos[0], pos[1], pos[2], toLight[0], toLight[1], toLight[2], dist - 1e-3, true)) return [0, 0, 0];
  const tr = volumeTransmittance(scene, pos, toLight, dist, random);
  const k = (tr * lights.length) / (4 * Math.PI);
  return [radiance[0] * k, radiance[1] * k, radiance[2] * k];
}

/** Follows a ray through the volumes up to tMax: the first real collision, or null when it passes through them all. */
function volumeCollision(scene, o, d, tMax, random) {
  let best = null;
  for (const v of scene.volumes) {
    const span = boxSpan(v, o, d, best ? best.t : tMax);
    if (!span) continue;
    let t = span[0];
    for (let guard = 0; guard < 512; guard++) {
      t += -Math.log(1 - random()) / v.sigma;
      if (t >= span[1]) break;
      const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      if (random() < gridAt(v, v.density, p)) { best = { t, v, p }; break; }
    }
  }
  return best;
}

function tracePath(scene, bvh, origin, direction, random, aovs) {
  const { bounces } = scene.settings;
  let [ro, rd] = [origin, direction];
  const color = [0, 0, 0];
  let throughput = [1, 1, 1];
  let alpha = 0;
  let specularBounce = true;
  const hit = {};
  for (let depth = 0; depth <= bounces; depth++) {
    const h = intersect(scene, bvh, ro[0], ro[1], ro[2], rd[0], rd[1], rd[2], Infinity, false, hit);
    if (scene.volumes?.length) {
      const event = volumeCollision(scene, ro, rd, h ? h.t : 1e6, random);
      if (event) {
        if (depth === 0) alpha = 1;
        const { v, p } = event;
        // What the medium itself gives off, then light it scatters towards the viewer.
        const flame = v.flame ? gridAt(v, v.flame, p) : 0;
        const dens = Math.max(1e-4, gridAt(v, v.density, p));
        for (let c = 0; c < 3; c++) color[c] += throughput[c] * (v.emission[c] + (v.flameColor[c] * flame) / dens);
        if (depth === bounces) break;
        const light = volumeLight(scene, bvh, p, random);
        for (let c = 0; c < 3; c++) { throughput[c] *= v.albedo[c]; color[c] += throughput[c] * light[c]; }
        // A new direction, evenly over the sphere.
        const z = 1 - 2 * random();
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const a = 2 * Math.PI * random();
        rd = [r * Math.cos(a), r * Math.sin(a), z];
        ro = p;
        continue;
      }
    }
    if (!h) {
      if (depth > 0 || !scene.settings.filmTransparent) {
        const w = worldColor(scene, rd);
        color[0] += throughput[0] * w[0]; color[1] += throughput[1] * w[1]; color[2] += throughput[2] * w[2];
      }
      if (depth === 0) alpha = scene.settings.filmTransparent ? 0 : 1;
      break;
    }
    if (depth === 0) alpha = 1;
    const t = h.tri;
    const [u, v, w] = [h.u, h.v, 1 - h.u - h.v];
    const o = t * 9;
    const nrm = scene.normals;
    const pos = [ro[0] + rd[0] * h.t, ro[1] + rd[1] * h.t, ro[2] + rd[2] * h.t];
    let n = v3.norm([nrm[o] * w + nrm[o + 3] * u + nrm[o + 6] * v, nrm[o + 1] * w + nrm[o + 4] * u + nrm[o + 7] * v, nrm[o + 2] * w + nrm[o + 5] * u + nrm[o + 8] * v]);
    const entering = v3.dot(n, rd) < 0;
    if (!entering) n = v3.mul(n, -1);
    const uvs = scene.uvs;
    const uv = [uvs[t * 6] * w + uvs[t * 6 + 2] * u + uvs[t * 6 + 4] * v, uvs[t * 6 + 1] * w + uvs[t * 6 + 3] * u + uvs[t * 6 + 5] * v];
    const material = scene.materials[scene.triMat[t]] ?? scene.materials[0];
    let surf = surfaceAt(scene, material, pos, n, uv);
    if (scene.vertexColors && scene.vertexColors[o] >= 0) {
      const vc = scene.vertexColors;
      surf = { ...surf, baseColor: [vc[o] * w + vc[o + 3] * u + vc[o + 6] * v, vc[o + 1] * w + vc[o + 4] * u + vc[o + 7] * v, vc[o + 2] * w + vc[o + 5] * u + vc[o + 8] * v].map((x, c) => x * surf.baseColor[c]) };
    }
    if (depth === 0 && aovs) { aovs.depth = h.t; aovs.normal = n; }
    // A partly transparent surface: the ray may pass straight through.
    if ((surf.alpha ?? 1) < 1 && random() > surf.alpha) {
      ro = v3.add(pos, v3.mul(rd, 1e-4));
      if (depth === 0) alpha = surf.alpha;
      continue;
    }
    if (surf.emission && (surf.emission[0] || surf.emission[1] || surf.emission[2])) {
      color[0] += throughput[0] * surf.emission[0]; color[1] += throughput[1] * surf.emission[1]; color[2] += throughput[2] * surf.emission[2];
    }
    if (depth === bounces) break;
    const view = v3.mul(rd, -1);
    const transmission = surf.transmission ?? 0;
    const metallic = surf.metallic ?? 0;
    if (transmission > 0 && random() < transmission) {
      const eta = entering ? 1 / (surf.ior ?? 1.45) : surf.ior ?? 1.45;
      const f0 = ((1 - (surf.ior ?? 1.45)) / (1 + (surf.ior ?? 1.45))) ** 2;
      const cos = Math.max(0, v3.dot(view, n));
      const refracted = refract(rd, n, eta);
      const half = (surf.roughness ?? 0) > 0.01 ? ggxHalf(n, surf.roughness, random(), random()) : n;
      if (!refracted || random() < schlick(cos, f0)) {
        rd = v3.norm(reflect(rd, half));
        ro = v3.add(pos, v3.mul(n, 1e-4));
      } else {
        rd = half === n ? refracted : v3.norm(v3.lerp(refracted, v3.mul(half, -1), (surf.roughness ?? 0) * 0.5));
        ro = v3.sub(pos, v3.mul(n, 1e-4));
        throughput = throughput.map((x, c) => x * surf.baseColor[c]);
      }
      specularBounce = true;
      continue;
    }
    const direct = sampleLight(scene, bvh, pos, n, view, surf, random);
    color[0] += throughput[0] * direct[0]; color[1] += throughput[1] * direct[1]; color[2] += throughput[2] * direct[2];
    // Next bounce: glossy or diffuse, chosen by how reflective the surface is here.
    const cosV = Math.max(0, v3.dot(view, n));
    const f0 = surf.baseColor.map((c) => 0.08 * (surf.specular ?? 0.5) * (1 - metallic) + c * metallic);
    const f = f0.map((x) => schlick(cosV, x));
    const pSpec = Math.max(0.05, Math.min(0.95, Math.max(f[0], f[1], f[2]) * (metallic > 0.5 ? 1 : 0.8) + metallic * 0.5));
    if (random() < pSpec) {
      const half = ggxHalf(n, surf.roughness ?? 0.5, random(), random());
      rd = v3.norm(reflect(rd, half));
      if (v3.dot(rd, n) <= 0) break;
      throughput = throughput.map((x, c) => (x * f[c]) / pSpec);
    } else {
      rd = cosineSample(n, random(), random());
      const albedo = surf.baseColor.map((c) => c * (1 - metallic));
      throughput = throughput.map((x, c) => (x * albedo[c]) / (1 - pSpec));
    }
    ro = v3.add(pos, v3.mul(n, 1e-4));
    specularBounce = false;
    // Russian roulette after a few bounces, so dark paths end early without bias.
    if (depth > 2) {
      const q = Math.min(0.95, Math.max(throughput[0], throughput[1], throughput[2]));
      if (random() > q) break;
      throughput = throughput.map((x) => x / q);
    }
  }
  void specularBounce;
  return [color[0], color[1], color[2], alpha];
}

function cameraRay(cam, x, y, width, height, random) {
  const aspect = width / height;
  const sx = (2 * x) / width - 1;
  const sy = 1 - (2 * y) / height;
  if (cam.kind === 'ORTHO') {
    const half = cam.orthoScale / 2;
    const origin = v3.add(v3.add(cam.position, v3.mul(cam.right, sx * half)), v3.mul(cam.up, (sy * half) / aspect));
    return [origin, cam.forward];
  }
  const dir = v3.norm(v3.add(v3.add(cam.forward, v3.mul(cam.right, sx * cam.tanHalf)), v3.mul(cam.up, (sy * cam.tanHalf) / aspect)));
  if (cam.aperture > 0) {
    const focal = v3.add(cam.position, v3.mul(dir, cam.focus / Math.max(0.01, v3.dot(dir, cam.forward))));
    const a = 2 * Math.PI * random();
    const r = Math.sqrt(random()) * cam.aperture;
    const origin = v3.add(v3.add(cam.position, v3.mul(cam.right, r * Math.cos(a))), v3.mul(cam.up, r * Math.sin(a)));
    return [origin, v3.norm(v3.sub(focal, origin))];
  }
  return [cam.position, dir];
}

/**
 * Renders rows y0…y1−1 into `out` (Float32Array RGBA, linear, added up over `samples`). Row `baseRow` is the first row
 * of `out`, so a worker can hand in a buffer of just the rows it was given.
 */
export function renderRows(scene, bvh, y0, y1, out, { samples = scene.settings.samples, firstSample = 0, aovs = null, baseRow = 0 } = {}) {
  const { width, height, camera } = scene;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y - baseRow) * width + x;
      const i = p * 4;
      const random = mulberry((y * 65537 + x * 257 + firstSample * 1009 + scene.settings.seed + 1) >>> 0);
      for (let s = 0; s < samples; s++) {
        const [origin, dir] = cameraRay(camera, x + random(), y + random(), width, height, random);
        const aov = aovs && s === 0 && firstSample === 0 ? {} : null;
        const c = tracePath(scene, bvh, origin, dir, random, aov);
        // Fireflies: a clamp on single samples keeps a rare huge value from ruining a pixel.
        out[i] += Math.min(20, c[0]); out[i + 1] += Math.min(20, c[1]); out[i + 2] += Math.min(20, c[2]); out[i + 3] += c[3];
        if (aov && aovs) {
          aovs.depth[p] = aov.depth ?? 0;
          if (aov.normal) { aovs.normal[p * 3] = aov.normal[0]; aovs.normal[p * 3 + 1] = aov.normal[1]; aovs.normal[p * 3 + 2] = aov.normal[2]; }
        }
      }
    }
  }
}

/** The whole image in one call. Returns { width, height, data } with data averaged (linear). */
export function renderImage(scene, { samples = scene.settings.samples, onProgress = null } = {}) {
  const bvh = buildBVH(scene.positions);
  const data = new Float32Array(scene.width * scene.height * 4);
  for (let y = 0; y < scene.height; y++) {
    renderRows(scene, bvh, y, y + 1, data, { samples });
    onProgress?.((y + 1) / scene.height);
  }
  for (let i = 0; i < data.length; i++) data[i] /= samples;
  return { width: scene.width, height: scene.height, data };
}

/** An edge-preserving smoothing filter over a rendered image: neighbours count less the more their colour differs. */
export function denoiseImage(img, radius = 2, sigma = 0.25) {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(data.length);
  const inv = 1 / (2 * sigma * sigma);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sum = [0, 0, 0];
      let total = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = (ny * w + nx) * 4;
          const d = (data[i] - data[j]) ** 2 + (data[i + 1] - data[j + 1]) ** 2 + (data[i + 2] - data[j + 2]) ** 2;
          const k = Math.exp(-d * inv) * Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius || 1));
          sum[0] += data[j] * k; sum[1] += data[j + 1] * k; sum[2] += data[j + 2] * k;
          total += k;
        }
      }
      out[i] = sum[0] / total; out[i + 1] = sum[1] / total; out[i + 2] = sum[2] / total; out[i + 3] = data[i + 3];
    }
  }
  return { width: w, height: h, data: out };
}

// ─────────────── output

const toSrgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055);
/** A filmic curve (Narkowicz's fit): highlights roll off instead of clipping. */
const filmic = (x) => (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);

/** Linear floats → display RGBA8 with exposure, view transform and gamma. */
export function toDisplay(img, { exposure = 0, gamma = 1, viewTransform = 'FILMIC' } = {}) {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  const k = 2 ** exposure;
  for (let i = 0; i < out.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let x = Math.max(0, img.data[i + c] * k);
      x = viewTransform === 'FILMIC' ? filmic(x * 0.6) : Math.min(1, x);
      out[i + c] = toSrgb(Math.max(0, Math.min(1, x))) ** (1 / gamma) * 255 + 0.5;
    }
    out[i + 3] = Math.max(0, Math.min(1, img.data[i + 3])) * 255 + 0.5;
  }
  return out;
}
