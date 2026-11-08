// Document → three.js. One SceneSync per 3D view (each has its own shading). Geometry is rebuilt only when an object's
// signature changes, so moving an object or stepping a frame on a static mesh costs almost nothing.
import { sceneInstances } from '../core/scenes.js';
import { sceneVolumes, simBaked, simVersion } from '../core/simulation.js';
import * as THREE from 'three';
import { GEOMETRY_TYPES, evaluatedArmature, evaluatedMesh, getMaterial, isVisible, worldMatrix } from '../core/doc.js';
import { posedBone } from '../core/armature.js';
import { edgeMap, faceNormal, toTriangles, triangulateIndices, vertexNormals, v3 } from '../core/mesh.js';
import { evalShader } from '../core/nodes.js';
import { particlesAt } from '../core/physics.js';
import { gpencilMeshes } from '../core/gpencil.js';

export const COLORS = { selected: 0xef8b3c, active: 0xffc266, wire: 0x101010, helper: 0x101010, edge: 0x000000, editSel: 0xffa030, editFace: 0xffa030, vert: 0x101010 };

/** A quick fingerprint of a mesh: changes when any vertex moves. */
function hashMesh(mesh) {
  let h = mesh.verts.length * 31 + mesh.faces.length * 17 + (mesh.smooth ? 1 : 0) + (mesh.loose?.length ?? 0) * 7;
  for (const v of mesh.verts) h = (h * 1.0000001 + v[0] * 3.1 + v[1] * 5.3 + v[2] * 7.7) % 1e9;
  for (const f of mesh.faces) h = (h * 1.0000001 + f[0] + f.length * 3) % 1e9;
  if (mesh.colors) for (const c of mesh.colors) h = (h + c[0] * 2 + c[1] * 3 + c[2] * 5) % 1e9;
  if (mesh.uvs) for (const uv of mesh.uvs) if (uv) h = (h + uv[0][0] * 11 + uv[0][1] * 13) % 1e9;
  if (mesh.faceMat) for (const m of mesh.faceMat) h = (h + m * 19) % 1e9;
  h = (h + Object.keys(mesh.marks?.sharp ?? {}).length * 23) % 1e9;
  if (mesh.cornerNormals) for (const list of mesh.cornerNormals) if (list) h = (h + list[0][0] * 29 + list[0][1] * 31 + list[0][2] * 37) % 1e9;
  return h;
}

function signature(doc, obj) {
  const parts = [obj.type, obj.materials.join()];
  if (obj.type === 'MESH' && obj.data) parts.push(hashMesh(obj.data), JSON.stringify(obj.data.shapeKeys?.map((k) => k.value) ?? []));
  else parts.push(JSON.stringify(obj.data));
  if (obj.modifiers?.length) {
    parts.push(JSON.stringify(obj.modifiers));
    // Time-dependent or scene-dependent modifiers: the frame, and everything else, may change them.
    if (obj.modifiers.some((m) => ['WAVE', 'BUILD', 'NODES', 'OCEAN'].includes(m.type))) parts.push(doc.frame);
    if (obj.modifiers.some((m) => m.object)) parts.push(doc._rev ?? 0, doc.frame);
  }
  if (obj.type === 'ARMATURE' && obj.data?.bones?.some((b) => b.ik?.target)) parts.push(doc._rev ?? 0, doc.frame);
  if (obj.cache?.cloth) parts.push(doc.frame);
  if (obj.fluid || obj.dynamicPaint) parts.push(doc.frame, simVersion());
  if (obj.type === 'VOLUME') parts.push(JSON.stringify(obj.data));
  return parts.join('|');
}

const l0 = (obj) => obj.data.layers.reduce((n, l) => n + l.strokes.reduce((m, s) => m + s.points.reduce((k, p) => k + p[0] + p[1] * 3 + p[2] * 7, 0), 0), 0);

export function meshToGeometry(mesh) {
  const tri = toTriangles(mesh);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(tri.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(tri.uvs, 2));
  if (tri.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(tri.colors, 3));
  // One draw group per run of the same material slot.
  let start = 0;
  for (let t = 1; t <= tri.triMat.length; t++) {
    if (t === tri.triMat.length || tri.triMat[t] !== tri.triMat[start]) {
      g.addGroup(start * 3, (t - start) * 3, tri.triMat[start]);
      start = t;
    }
  }
  return g;
}

const lineGeometry = (pairs) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pairs.flat(), 3));

function edgeGeometry(mesh, sharpOnly = false) {
  const pairs = [];
  for (const e of edgeMap(mesh).values()) {
    if (sharpOnly && e.faces.length === 2) {
      const dot = v3.dot(faceNormal(mesh, mesh.faces[e.faces[0]]), faceNormal(mesh, mesh.faces[e.faces[1]]));
      if (dot > 0.98) continue;
    }
    pairs.push(mesh.verts[e.a], mesh.verts[e.b]);
  }
  return lineGeometry(pairs);
}

/** Welded surface with one normal per vertex: pushed out along it, this makes the selection outline. */
function hullGeometry(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.verts.flat(), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(vertexNormals(mesh).flat(), 3));
  g.setIndex(triangulateIndices(mesh).flat());
  return g;
}

const OUTLINE_VERTEX = `
uniform float width;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(projectionMatrix) * normalMatrix * normal);
  clip.xy += normalize(n.xy + 1e-5) * width * clip.w;
  gl_Position = clip;
}`;
const outlineMaterial = (color) => new THREE.ShaderMaterial({
  uniforms: { width: { value: 0.0035 }, color: { value: new THREE.Color(color) } },
  vertexShader: OUTLINE_VERTEX,
  fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }',
  side: THREE.BackSide,
});

function circle(radius, axis = 'z', n = 24, center = [0, 0, 0]) {
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (const k of [i, i + 1]) {
      const a = (k / n) * Math.PI * 2;
      const [p, q] = [Math.cos(a) * radius, Math.sin(a) * radius];
      pairs.push(axis === 'z' ? [center[0] + p, center[1] + q, center[2]] : axis === 'x' ? [center[0], center[1] + p, center[2] + q] : [center[0] + p, center[1], center[2] + q]);
    }
  }
  return pairs;
}

/** The lines that stand for an object with no surface. */
function helperLines(doc, obj) {
  switch (obj.type) {
    case 'LIGHT': {
      const l = obj.data;
      const pairs = circle(0.12).concat(circle(0.12, 'x'));
      if (l.kind === 'SUN') for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pairs.push([Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0], [Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0]); }
      if (l.kind === 'SUN' || l.kind === 'AREA') pairs.push([0, 0, 0], [0, 0, -3]);
      if (l.kind === 'POINT') pairs.push([0, 0, 0], [0, 0, 0.3]);
      if (l.kind === 'SPOT') {
        const r = Math.tan((l.spotSize * Math.PI) / 360) * 2;
        pairs.push(...circle(r, 'z', 24, [0, 0, -2]));
        for (const [x, y] of [[r, 0], [-r, 0], [0, r], [0, -r]]) pairs.push([0, 0, 0], [x, y, -2]);
      }
      if (l.kind === 'AREA') { const s = l.size / 2; pairs.push([-s, -s, 0], [s, -s, 0], [s, -s, 0], [s, s, 0], [s, s, 0], [-s, s, 0], [-s, s, 0], [-s, -s, 0]); }
      return pairs;
    }
    case 'CAMERA': {
      const c = obj.data;
      const d = 1;
      const hw = (c.sensor / (2 * c.lens)) * d;
      const hh = hw * (doc.render.height / doc.render.width);
      const corners = [[-hw, -hh, -d], [hw, -hh, -d], [hw, hh, -d], [-hw, hh, -d]];
      const pairs = [];
      corners.forEach((p, i) => { pairs.push([0, 0, 0], p, p, corners[(i + 1) % 4]); });
      pairs.push([-hw * 0.5, hh * 1.1, -d], [hw * 0.5, hh * 1.1, -d], [hw * 0.5, hh * 1.1, -d], [0, hh * 1.5, -d], [0, hh * 1.5, -d], [-hw * 0.5, hh * 1.1, -d]);
      return pairs;
    }
    case 'VOLUME': {
      const pairs = [];
      const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) pairs.push(corners[a], corners[b]);
      return pairs;
    }
    case 'EMPTY': {
      const s = obj.data?.size ?? 1;
      const kind = obj.data?.display ?? 'PLAIN_AXES';
      if (kind === 'CUBE') {
        const pairs = [];
        const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map((p) => p.map((x) => x * s));
        for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) pairs.push(corners[a], corners[b]);
        return pairs;
      }
      if (kind === 'SPHERE') return [...circle(s), ...circle(s, 'x'), ...circle(s, 'y')];
      if (kind === 'CIRCLE') return circle(s);
      if (kind === 'ARROWS') return [[0, 0, 0], [s, 0, 0], [0, 0, 0], [0, s, 0], [0, 0, 0], [0, 0, s], [s, 0, 0], [s * 0.85, s * 0.08, 0], [0, s, 0], [s * 0.08, s * 0.85, 0], [0, 0, s], [0, s * 0.08, s * 0.85]];
      return [[-s, 0, 0], [s, 0, 0], [0, -s, 0], [0, s, 0], [0, 0, -s], [0, 0, s]];
    }
    case 'ARMATURE': {
      const pairs = [];
      const posed = doc ? evaluatedArmature(doc, obj) : obj.data;
      obj.data.bones.forEach((_, i) => {
        const { head, tail } = posedBone(posed, i);
        const axis = v3.sub(tail, head);
        const len = v3.len(axis);
        const dir = v3.norm(axis);
        const ref = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const u = v3.mul(v3.norm(v3.cross(ref, dir)), len * 0.1);
        const w = v3.mul(v3.cross(dir, v3.norm(u)), len * 0.1);
        const mid = v3.add(head, v3.mul(axis, 0.1));
        const ring = [v3.add(mid, u), v3.add(mid, w), v3.sub(mid, u), v3.sub(mid, w)];
        ring.forEach((p, k) => { pairs.push(head, p, p, tail, p, ring[(k + 1) % 4]); });
      });
      return pairs;
    }
    case 'LATTICE': {
      const { res, points } = obj.data;
      const [nu, nv, nw] = res;
      const at = (i, j, k) => points[i + j * nu + k * nu * nv];
      const pairs = [];
      for (let k = 0; k < nw; k++) for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        if (i + 1 < nu) pairs.push(at(i, j, k), at(i + 1, j, k));
        if (j + 1 < nv) pairs.push(at(i, j, k), at(i, j + 1, k));
        if (k + 1 < nw) pairs.push(at(i, j, k), at(i, j, k + 1));
      }
      return pairs;
    }
    case 'GPENCIL': {
      const pairs = [];
      for (const layer of obj.data.layers) {
        if (layer.hide) continue;
        for (const s of layer.strokes) for (let i = 0; i + 1 < s.points.length; i++) pairs.push(s.points[i], s.points[i + 1]);
      }
      return pairs;
    }
    default: return [];
  }
}

const hasTexture = (graph) => graph?.nodes?.some((n) => n.type.startsWith('TEX_'));

/** The image feeding Base Color directly, if any: the viewport then shows the picture itself, at full size. */
export function baseColorImage(graph) {
  if (!graph) return null;
  const link = graph.links.find((l) => l.in === 'Base Color' && graph.nodes.find((n) => n.id === l.to)?.type === 'BSDF_PRINCIPLED');
  const node = link && graph.nodes.find((n) => n.id === link.from);
  return node?.type === 'TEX_IMAGE' && link.out === 'Color' ? node.values?.image ?? null : null;
}

/** Draws a material's node tree into a texture, so the viewport shows its pattern (from UV or the unit square). */
function bakeNodes(graph, images, size = 128) {
  const data = new Uint8Array(size * size * 4);
  const srgb = (x) => { const c = Math.max(0, Math.min(1, x)); return (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const uv = [(x + 0.5) / size, (y + 0.5) / size];
      const bsdf = evalShader(graph, { uv, position: [uv[0] * 2 - 1, uv[1] * 2 - 1, 0], normal: [0, 0, 1], images });
      const c = bsdf?.baseColor ?? [0.8, 0.8, 0.8];
      const i = (y * size + x) * 4;
      data[i] = srgb(c[0]); data[i + 1] = srgb(c[1]); data[i + 2] = srgb(c[2]); data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class SceneSync {
  constructor() {
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.lightsGroup = new THREE.Group();
    this.instanceRoot = new THREE.Group();
    this.instanceGeometry = new Map();
    this.volumeRoot = new THREE.Group();
    this.scene.add(this.root, this.lightsGroup, this.instanceRoot, this.volumeRoot);
    this.items = new Map();
    this.pbr = new Map();
    this.solid = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.65, metalness: 0, side: THREE.DoubleSide });
    this.vertexColored = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0, side: THREE.DoubleSide });
    this.wireMaterial = new THREE.LineBasicMaterial({ color: COLORS.wire });
    this.helperMaterials = {
      normal: new THREE.LineBasicMaterial({ color: COLORS.helper }),
      selected: new THREE.LineBasicMaterial({ color: COLORS.selected }),
      active: new THREE.LineBasicMaterial({ color: COLORS.active }),
    };
    this.outlines = { selected: outlineMaterial(COLORS.selected), active: outlineMaterial(COLORS.active) };
    this.particleMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false });
    this.bakes = new Map();
    this.imageTextures = new Map();
  }

  /** A live texture of a document image; painting bumps `entry.version` to send the new pixels to the GPU. */
  imageTexture(id, entry) {
    let held = this.imageTextures.get(id);
    if (!held || held.entry !== entry) {
      held?.texture.dispose();
      const texture = new THREE.DataTexture(new Uint8Array(entry.rgba.buffer, entry.rgba.byteOffset, entry.rgba.byteLength), entry.width, entry.height, THREE.RGBAFormat);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = true;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      held = { entry, texture, version: entry.version ?? 0 };
      this.imageTextures.set(id, held);
    }
    if ((entry.version ?? 0) !== held.version) { held.version = entry.version ?? 0; held.texture.needsUpdate = true; }
    return held.texture;
  }

  /** The three.js material for a document material in `material` / `rendered` shading. */
  materialFor(doc, id) {
    const mat = id ? getMaterial(doc, id) : null;
    if (!mat) return this.solid;
    let m = this.pbr.get(id);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide });
      this.pbr.set(id, m);
    }
    let surface = mat;
    let map = null;
    if (mat.useNodes && mat.nodes) {
      surface = evalShader(mat.nodes, { uv: [0.5, 0.5], position: [0, 0, 0], normal: [0, 0, 1], images: this.images }) ?? mat;
      const direct = baseColorImage(mat.nodes);
      const entry = direct != null ? this.images?.[direct] : null;
      if (entry) {
        map = this.imageTexture(direct, entry);
      } else if (hasTexture(mat.nodes)) {
        const key = JSON.stringify(mat.nodes);
        let bake = this.bakes.get(id);
        if (!bake || bake.key !== key) {
          bake?.texture.dispose();
          bake = { key, texture: bakeNodes(mat.nodes, this.images) };
          this.bakes.set(id, bake);
        }
        map = bake.texture;
      }
    }
    if (m.map !== map) { m.map = map; m.needsUpdate = true; }
    m.color.setRGB(...(map ? [1, 1, 1] : surface.baseColor ?? [0.8, 0.8, 0.8]));
    m.metalness = surface.metallic ?? 0;
    m.roughness = Math.max(0.04, surface.roughness ?? 0.5);
    m.ior = surface.ior ?? 1.45;
    m.specularIntensity = Math.min(1, (surface.specular ?? 0.5) * 2);
    const transmission = surface.transmission ?? 0;
    const alpha = surface.alpha ?? 1;
    m.transparent = alpha < 1 || transmission > 0;
    m.opacity = transmission > 0 ? Math.min(alpha, 1 - transmission * 0.75) : alpha;
    const e = surface.emission ?? [0, 0, 0];
    m.emissive.setRGB(e[0], e[1], e[2]);
    m.emissiveIntensity = 1;
    return m;
  }

  /** Brings the scene up to date. `shading`: 'WIRE' | 'SOLID' | 'MATERIAL' | 'RENDERED'. `selection`: draw selection outlines. */
  sync(doc, { shading = 'SOLID', selection = true, xray = false, images = null, renderMode = false } = {}) {
    this.images = images;
    const seen = new Set();
    for (const obj of doc.objects) {
      const visible = isVisible(doc, obj) && !(renderMode && obj.hideRender);
      let item = this.items.get(obj.id);
      if (!visible) { if (item) item.group.visible = false; if (item) seen.add(obj.id); continue; }
      seen.add(obj.id);
      if (!item) {
        item = { group: new THREE.Group(), sig: null, mesh: null, wire: null, hull: null, lines: null, points: null, evaluated: null };
        item.group.matrixAutoUpdate = false;
        item.group.userData.objId = obj.id;
        this.root.add(item.group);
        this.items.set(obj.id, item);
      }
      item.group.visible = true;
      item.group.matrix.copy(worldMatrix(doc, obj));
      item.group.matrixWorldNeedsUpdate = true;
      const sig = signature(doc, obj);
      if (sig !== item.sig) { this.rebuild(doc, obj, item); item.sig = sig; }
      this.style(doc, obj, item, { shading, selection, xray, renderMode });
      this.updateParticles(doc, obj, item);
      this.updateGrease(doc, obj, item);
    }
    for (const [id, item] of this.items) {
      if (seen.has(id)) continue;
      this.disposeItem(item);
      this.root.remove(item.group);
      this.items.delete(id);
    }
    this.syncInstances(doc, shading);
    this.syncVolumes(doc, shading);
    this.scene.updateMatrixWorld(true);
  }

  /** Volumes: a box drawn with a shader that marches through a 3D texture of the density. */
  syncVolumes(doc, shading) {
    const key = `${doc._rev ?? 0}|${doc.frame}|${simVersion()}|${shading}`;
    if (this.volumesKey === key) return;
    this.volumesKey = key;
    for (const c of [...this.volumeRoot.children]) { this.volumeRoot.remove(c); c.geometry.dispose(); c.material.uniforms.density.value.dispose(); c.material.uniforms.flame.value?.dispose(); c.material.dispose(); }
    if (shading === 'WIRE') return;
    const texture = (data, n) => {
      const tex = new THREE.Data3DTexture(data, n[0], n[1], n[2]);
      tex.format = THREE.RedFormat;
      tex.type = THREE.UnsignedByteType;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      return tex;
    };
    for (const v of sceneVolumes(doc)) {
      const size = v.max.map((x, k) => x - v.min[k]);
      const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
      geometry.translate((v.min[0] + v.max[0]) / 2, (v.min[1] + v.max[1]) / 2, (v.min[2] + v.max[2]) / 2);
      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, side: THREE.BackSide,
        uniforms: { density: { value: texture(v.density, v.n) }, flame: { value: v.flame ? texture(v.flame, v.n) : null }, hasFlame: { value: v.flame ? 1 : 0 }, boxMin: { value: new THREE.Vector3(...v.min) }, boxMax: { value: new THREE.Vector3(...v.max) }, sigma: { value: v.sigma }, tint: { value: new THREE.Vector3(...v.albedo) }, glow: { value: new THREE.Vector3(...v.emission) }, flameColor: { value: new THREE.Vector3(...v.flameColor) } },
        vertexShader: 'out vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `precision highp float; precision highp sampler3D;
          in vec3 vWorld; out vec4 outColor;
          uniform sampler3D density; uniform sampler3D flame; uniform float hasFlame; uniform vec3 boxMin; uniform vec3 boxMax; uniform float sigma; uniform vec3 tint; uniform vec3 glow; uniform vec3 flameColor;
          void main() {
            vec3 rd = normalize(vWorld - cameraPosition);
            vec3 t0 = (boxMin - cameraPosition) / rd, t1 = (boxMax - cameraPosition) / rd;
            vec3 a = min(t0, t1), b = max(t0, t1);
            float near = max(max(max(a.x, a.y), a.z), 0.0), far = min(min(b.x, b.y), b.z);
            const int STEPS = 64;
            float dt = (far - near) / float(STEPS);
            vec3 color = vec3(0.0); float tr = 1.0;
            for (int i = 0; i < STEPS && tr > 0.01; i++) {
              vec3 p = cameraPosition + rd * (near + (float(i) + 0.5) * dt);
              vec3 uvw = (p - boxMin) / (boxMax - boxMin);
              float d = texture(density, uvw).r;
              float f = hasFlame > 0.5 ? texture(flame, uvw).r : 0.0;
              float step_ = exp(-d * sigma * dt);
              color += tr * (1.0 - step_) * (tint * (0.45 + 0.55 * uvw.z) + glow) + tr * dt * f * flameColor * 0.5;
              tr *= step_;
            }
            outColor = vec4(color, 1.0 - tr);
          }`,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.raycast = () => {};
      mesh.renderOrder = 5;
      this.volumeRoot.add(mesh);
    }
  }

  /** Instances are drawn as InstancedMesh per source object; geometry is shared and rebuilt only when the source changes. */
  syncInstances(doc, shading) {
    const key = `${doc._rev ?? 0}|${doc.frame}|${shading}`;
    if (this.instancesKey === key) return;
    this.instancesKey = key;
    for (const c of [...this.instanceRoot.children]) { this.instanceRoot.remove(c); c.dispose?.(); }
    const groups = new Map();
    for (const inst of sceneInstances(doc)) {
      if (!isVisible(doc, inst.owner) || !GEOMETRY_TYPES.has(inst.object.type)) continue;
      if (!groups.has(inst.object.id)) groups.set(inst.object.id, { object: inst.object, matrices: [] });
      groups.get(inst.object.id).matrices.push(inst.matrix);
    }
    for (const [id, { object, matrices }] of groups) {
      const sig = signature(doc, object);
      let held = this.instanceGeometry.get(id);
      if (!held || held.sig !== sig) {
        held?.geometry.dispose();
        const mesh = evaluatedMesh(doc, object);
        if (!mesh?.faces.length) continue;
        held = { sig, geometry: meshToGeometry(mesh) };
        this.instanceGeometry.set(id, held);
      }
      const material = shading === 'SOLID' || shading === 'WIRE' ? this.solid : this.materialFor(doc, object.materials.find(Boolean) ?? null);
      const instanced = new THREE.InstancedMesh(held.geometry, material, matrices.length);
      matrices.forEach((m, i) => instanced.setMatrixAt(i, m));
      instanced.userData.instanceOf = id;
      instanced.raycast = () => {};
      this.instanceRoot.add(instanced);
    }
  }

  disposeItem(item) {
    for (const key of ['mesh', 'wire', 'hull', 'lines', 'points']) {
      if (item[key]) { item.group.remove(item[key]); item[key].geometry.dispose(); item[key] = null; }
    }
  }

  rebuild(doc, obj, item) {
    this.disposeItem(item);
    item.evaluated = null;
    const add = (key, object) => { object.userData.objId = obj.id; object.matrixAutoUpdate = false; item[key] = object; item.group.add(object); };
    if (GEOMETRY_TYPES.has(obj.type)) {
      const mesh = evaluatedMesh(doc, obj);
      item.evaluated = mesh;
      if (mesh?.faces.length) {
        add('mesh', new THREE.Mesh(meshToGeometry(mesh), this.solid));
        add('hull', new THREE.Mesh(hullGeometry(mesh), this.outlines.selected));
        add('wire', new THREE.LineSegments(edgeGeometry(mesh), this.wireMaterial));
      } else if (mesh?.loose?.length || mesh?.verts.length) {
        add('lines', new THREE.LineSegments(edgeGeometry(mesh), this.helperMaterials.normal));
      }
    } else {
      const pairs = helperLines(doc, obj);
      if (pairs.length) add('lines', new THREE.LineSegments(lineGeometry(pairs), this.helperMaterials.normal));
    }
  }

  style(doc, obj, item, { shading, selection, xray, renderMode }) {
    const selected = selection && doc.selected.includes(obj.id);
    const active = doc.activeId === obj.id;
    const state = selected ? (active ? 'active' : 'selected') : 'normal';
    const editing = doc.mode === 'EDIT' && active;
    if (item.mesh) {
      item.mesh.visible = shading !== 'WIRE' || renderMode;
      if (shading === 'SOLID') {
        const hasColors = item.mesh.geometry.hasAttribute('color') && (doc.mode === 'VERTEX_PAINT' || doc.mode === 'WEIGHT_PAINT' || obj.dynamicPaint?.role === 'CANVAS');
        item.mesh.material = hasColors ? this.vertexColored : this.solid;
      } else if (shading !== 'WIRE') {
        const slots = obj.materials;
        const list = slots.length ? slots.map((id) => this.materialFor(doc, id)) : [this.solid];
        item.mesh.material = list.length > 1 ? list : list[0];
      }
      if (obj.smoke || obj.smokeFlow || obj.fluidFlow || (obj.fluid && !simBaked(obj))) item.mesh.visible = false;
      item.mesh.castShadow = shading === 'RENDERED';
      item.mesh.receiveShadow = shading === 'RENDERED';
      const transparent = xray && shading !== 'RENDERED';
      for (const m of Array.isArray(item.mesh.material) ? item.mesh.material : [item.mesh.material]) {
        if (m === this.solid || m === this.vertexColored) { m.transparent = transparent; m.opacity = transparent ? 0.45 : 1; m.depthWrite = !transparent; }
      }
    }
    if (item.hull) {
      item.hull.visible = selected && !editing && shading !== 'WIRE' && !renderMode;
      item.hull.material = this.outlines[active ? 'active' : 'selected'];
    }
    if (item.wire) {
      item.wire.visible = !renderMode && !editing && (shading === 'WIRE' || (obj.showWire ?? false) || Boolean(obj.smoke || obj.smokeFlow || obj.fluidFlow || (obj.fluid && !simBaked(obj))));
      item.wire.material = shading === 'WIRE' ? this.helperMaterials[state] : this.wireMaterial;
    }
    if (item.lines) {
      item.lines.visible = !renderMode;
      item.lines.material = this.helperMaterials[state];
    }
  }

  /** A drawing's ribbons and fills; the thin helper lines stay as the outline to pick by. */
  updateGrease(doc, obj, item) {
    if (obj.type !== 'GPENCIL') return;
    const key = JSON.stringify([obj.data.layers.map((l) => [l.hide, l.color, l.fill, l.fillColor, l.opacity, l.thickness, l.keyed, l.strokes.length, l.strokes.at(-1)?.points.length]), l0(obj), doc.frame]);
    if (item.greaseKey === key) return;
    item.greaseKey = key;
    if (item.grease) { for (const m of item.grease) { item.group.remove(m); m.geometry.dispose(); m.material.dispose(); } }
    item.grease = [];
    for (const part of gpencilMeshes(obj.data, doc.frame)) {
      for (const [piece, color] of [[part.fills, part.fillColor], [part.lines, part.color]]) {
        if (!piece.faces.length) continue;
        const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color[0], color[1], color[2]), transparent: part.opacity < 1, opacity: part.opacity, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(meshToGeometry(piece), material);
        mesh.raycast = () => {};
        item.group.add(mesh);
        item.grease.push(mesh);
      }
    }
  }

  updateParticles(doc, obj, item) {
    if (item.points) { item.group.remove(item.points); item.points.geometry.dispose(); item.points = null; }
    if (item.instances) { for (const m of item.instances) { item.group.remove(m); m.geometry.dispose(); m.dispose(); } item.instances = null; }
    if (!obj.particles?.length) return;
    const flat = [];
    const pairs = [];
    for (const system of obj.particles) {
      const list = particlesAt(doc, obj, system);
      const source = system.renderAs === 'OBJECT' && system.kind !== 'HAIR' && list.length ? doc.objects.find((o) => o.id === system.instanceObject) : null;
      if (source?.type === 'MESH') {
        // Copies of an object, one per particle.
        const geometry = meshToGeometry(evaluatedMesh(doc, source));
        const copies = new THREE.InstancedMesh(geometry, this.particleInstanceMaterial ??= new THREE.MeshStandardMaterial({ color: 0xbbbbbb }), list.length);
        const m = new THREE.Matrix4();
        list.forEach((p, i) => { m.makeScale(system.size, system.size, system.size).setPosition(p[0], p[1], p[2]); copies.setMatrixAt(i, m); });
        copies.matrixAutoUpdate = false;
        copies.matrix.copy(item.group.matrix).invert();
        copies.raycast = () => {};
        copies.frustumCulled = false;
        (item.instances ??= []).push(copies);
        item.group.add(copies);
        continue;
      }
      if (system.kind === 'HAIR') for (const strand of list) for (let i = 0; i + 1 < strand.length; i++) pairs.push(...strand[i], ...strand[i + 1]);
      else for (const p of list) flat.push(...p);
    }
    // Particles are computed in world space; the holder cancels the object's own matrix.
    const holder = new THREE.BufferGeometry();
    holder.setAttribute('position', new THREE.Float32BufferAttribute(flat.length ? flat : pairs, 3));
    const points = flat.length ? new THREE.Points(holder, this.particleMaterial) : new THREE.LineSegments(holder, this.helperMaterials.normal);
    points.matrixAutoUpdate = false;
    points.matrix.copy(item.group.matrix).invert();
    points.raycast = () => {};
    item.points = points;
    item.group.add(points);
  }

  /** Scene lights and world, for the Rendered shading. */
  syncLights(doc, enabled) {
    while (this.lightsGroup.children.length) {
      const l = this.lightsGroup.children.pop();
      l.dispose?.();
    }
    if (!enabled) return;
    const pos = new THREE.Vector3();
    for (const obj of doc.objects) {
      if (obj.type !== 'LIGHT' || !isVisible(doc, obj) || obj.hideRender) continue;
      const l = obj.data;
      const m = worldMatrix(doc, obj);
      pos.setFromMatrixPosition(m);
      const color = new THREE.Color(l.color[0], l.color[1], l.color[2]);
      let light;
      if (l.kind === 'SUN') light = new THREE.DirectionalLight(color, l.energy);
      else if (l.kind === 'SPOT') light = new THREE.SpotLight(color, l.energy / (4 * Math.PI), 0, (l.spotSize * Math.PI) / 360, l.spotBlend, 2);
      else if (l.kind === 'AREA') light = new THREE.PointLight(color, l.energy / (4 * Math.PI), 0, 2);
      else light = new THREE.PointLight(color, l.energy / (4 * Math.PI), 0, 2);
      light.position.copy(pos);
      if (light.target) {
        const dir = new THREE.Vector3(0, 0, -1).transformDirection(m);
        light.target.position.copy(pos).add(dir);
        light.target.updateMatrixWorld();
        this.lightsGroup.add(light.target);
      }
      light.castShadow = l.castShadow !== false;
      if (light.castShadow && light.shadow) {
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = -0.0005;
        if (l.kind === 'SUN') { const s = 15; Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s, far: 100 }); }
      }
      this.lightsGroup.add(light);
    }
  }

  /** Meshes under the mouse, for picking. */
  pickables() {
    const out = [];
    for (const item of this.items.values()) {
      if (!item.group.visible) continue;
      if (item.mesh) out.push(item.mesh);
      if (item.lines) out.push(item.lines);
    }
    return out;
  }

  dispose() {
    for (const item of this.items.values()) this.disposeItem(item);
    this.items.clear();
    for (const m of this.pbr.values()) m.dispose();
    for (const b of this.bakes.values()) b.texture.dispose();
    this.solid.dispose();
    this.vertexColored.dispose();
    this.wireMaterial.dispose();
    Object.values(this.helperMaterials).forEach((m) => m.dispose());
    Object.values(this.outlines).forEach((m) => m.dispose());
    this.particleMaterial.dispose();
    this.syncLights(null, false);
  }
}
