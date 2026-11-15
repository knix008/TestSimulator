// The moving layer: entities, vehicles, pool units and agents, each kind drawn
// with one InstancedMesh per part (a "tinted" part takes the instance colour,
// the others keep their baked vertex colours). Shapes face +x with their base
// at y = 0, so heading h (2D, atan2(dy, dx)) becomes rotation.y = -h.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmp = new THREE.Color();
const rgb = (hex) => { tmp.set(hex); return [tmp.r, tmp.g, tmp.b]; };
const WHITE = [1, 1, 1];

// ───────────────────────── geometry pieces (vertex coloured)

function colorize(geo, col) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col[0]; a[i * 3 + 1] = col[1]; a[i * 3 + 2] = col[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const bx = (w, h, d, x, y0, z, col = WHITE, ry = 0) => colorize(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y0 + h / 2, z), col);
const cy = (rt, rb, h, x, y0, z, col = WHITE, seg = 12) => colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y0 + h / 2, z), col);
/** A wheel: a cylinder lying along z, centred at (x, y, z). */
const wheel = (r, t, x, y, z, col) => colorize(new THREE.CylinderGeometry(r, r, t, 14).rotateX(Math.PI / 2).translate(x, y, z), col);
const sp = (r, x, y, z, col = WHITE, seg = 12) => colorize(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)).translate(x, y, z), col);

function merge(pieces) {
  const g = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  g.computeBoundingSphere();
  return g;
}

const K = {
  tire: rgb('#1b1d20'), glass: rgb('#1e2a36'), light: rgb('#fff7d6'), red: rgb('#b91c1c'), skin: rgb('#e8c4a8'),
  jeans: rgb('#2b3a55'), wood: rgb('#b88a5a'), darkWood: rgb('#8a6440'), steel: rgb('#9aa4ae'), dark: rgb('#3f464e'),
  white: rgb('#f1f5f9'), tan: rgb('#e9d8b4'), cap: rgb('#cbd5e1'), orange: rgb('#ef7d1a'), yellow: rgb('#f2c230'),
  blue: rgb('#3b82f6'), hat: rgb('#facc15'), grey: rgb('#64748b'), rotor: rgb('#94a3b8'), shoe: rgb('#334155'),
};

function carWheels(len, wid, r, axles) {
  const out = [];
  for (const x of axles) for (const sz of [-1, 1]) out.push(wheel(r, 0.24, x * len, r, sz * (wid / 2 - 0.1), K.tire));
  return out;
}

/** Person facing +x: { tinted, plain } piece lists. `gown` makes a long patient gown. */
function personPieces(gown = false, hat = false) {
  const tinted = [
    cy(0.17, 0.2, 0.62, 0, 0.85, 0, WHITE, 10), // torso
    cy(0.05, 0.045, 0.58, 0, 0.9, -0.24, WHITE, 6), cy(0.05, 0.045, 0.58, 0, 0.9, 0.24, WHITE, 6), // arms
  ];
  if (gown) tinted.push(cy(0.2, 0.26, 0.55, 0, 0.32, 0, WHITE, 10));
  const plain = [
    cy(0.075, 0.065, 0.85, 0, 0, -0.09, gown ? K.skin : K.jeans, 6), cy(0.075, 0.065, 0.85, 0, 0, 0.09, gown ? K.skin : K.jeans, 6),
    bx(0.24, 0.07, 0.11, 0.04, 0, -0.09, K.shoe), bx(0.24, 0.07, 0.11, 0.04, 0, 0.09, K.shoe),
    sp(0.115, 0, 1.6, 0, K.skin, 12), cy(0.05, 0.05, 0.1, 0, 1.45, 0, K.skin, 6),
  ];
  if (hat) plain.push(colorize(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.63, 0), K.hat), cy(0.16, 0.16, 0.015, 0.02, 1.63, 0, K.hat, 12));
  return { tinted, plain };
}

/** Entity shapes: { tinted: geometry|null, plain: geometry|null }. Sizes in metres. */
function entityShape(shape) {
  const P = (tinted, plain = []) => ({ tinted: tinted.length ? merge(tinted) : null, plain: plain.length ? merge(plain) : null });
  switch (shape) {
    case 'pallet': {
      const plain = [bx(0.8, 0.03, 0.6, 0, 0.11, 0, K.wood), bx(0.8, 0.02, 0.6, 0, 0, 0, K.darkWood)];
      for (const z of [-0.26, 0, 0.26]) plain.push(bx(0.8, 0.09, 0.09, 0, 0.02, z, K.darkWood));
      return P([bx(0.74, 0.5, 0.56, 0, 0.14, 0)], plain);
    }
    case 'part': return P([cy(0.15, 0.15, 0.16, 0, 0, 0, WHITE, 16), cy(0.09, 0.11, 0.08, 0, 0.16, 0, WHITE, 16)], [cy(0.04, 0.04, 0.25, 0, 0, 0, K.dark, 8)]);
    case 'carton': return P([bx(0.45, 0.32, 0.35, 0, 0, 0)], [bx(0.46, 0.006, 0.07, 0, 0.32, 0, K.tan), bx(0.07, 0.006, 0.36, 0, 0.32, 0, K.tan)]);
    case 'bottle': return P([cy(0.075, 0.075, 0.22, 0, 0, 0, WHITE, 14), cy(0.03, 0.075, 0.07, 0, 0.22, 0, WHITE, 14)], [cy(0.033, 0.033, 0.035, 0, 0.29, 0, K.cap, 10), cy(0.077, 0.077, 0.08, 0, 0.07, 0, K.white, 14)]);
    case 'car': return P(
      [bx(4.2, 0.62, 1.76, 0, 0.3, 0), bx(2.1, 0.55, 1.62, -0.25, 0.92, 0)],
      [bx(2.16, 0.38, 1.66, -0.25, 1.0, 0, K.glass), bx(0.05, 0.12, 0.3, 2.1, 0.62, -0.6, K.light), bx(0.05, 0.12, 0.3, 2.1, 0.62, 0.6, K.light),
        bx(0.05, 0.1, 0.3, -2.1, 0.66, -0.6, K.red), bx(0.05, 0.1, 0.3, -2.1, 0.66, 0.6, K.red), ...carWheels(4.2, 1.76, 0.33, [-0.31, 0.31])]);
    case 'truck': return P(
      [bx(1.5, 1.85, 2.3, 2.05, 0.55, 0)],
      [bx(4.0, 2.5, 2.4, -0.75, 0.62, 0, K.white), bx(5.7, 0.28, 1.9, 0, 0.42, 0, K.dark), bx(0.05, 0.75, 2.0, 2.81, 1.5, 0, K.glass),
        bx(0.05, 0.15, 0.3, 2.81, 0.75, -0.9, K.light), bx(0.05, 0.15, 0.3, 2.81, 0.75, 0.9, K.light), ...carWheels(5.7, 2.3, 0.45, [-0.36, -0.2, 0.33])]);
    case 'bus': return P(
      [bx(5.8, 2.35, 2.3, 0, 0.4, 0)],
      [bx(5.0, 0.85, 2.34, -0.25, 1.45, 0, K.glass), bx(0.05, 1.1, 2.0, 2.91, 1.2, 0, K.glass), bx(5.82, 0.1, 2.32, 0, 2.75, 0, K.white),
        bx(0.05, 0.15, 0.35, 2.91, 0.65, -0.85, K.light), bx(0.05, 0.15, 0.35, 2.91, 0.65, 0.85, K.light), ...carWheels(5.8, 2.3, 0.45, [-0.3, 0.32])]);
    case 'train': return P(
      [bx(18, 2.9, 2.9, 0, 0.75, 0)],
      [bx(18.05, 0.55, 2.95, 0, 2.6, 0, K.white), bx(14, 0.7, 2.96, 0, 1.75, 0, K.glass), bx(0.06, 1.2, 2.2, 9.02, 1.6, 0, K.glass),
        ...[-7, -4.5, 4.5, 7].flatMap((x) => [-1.2, 1.2].map((z) => wheel(0.45, 0.2, x, 0.45, z, K.tire)))]);
    case 'container': return P([bx(6, 2.5, 2.4, 0, 0, 0)], [...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => bx(0.05, 2.4, 2.42, x, 0.05, 0, K.dark))]);
    case 'person': { const p = personPieces(); return P(p.tinted, p.plain); }
    case 'patient': { const p = personPieces(true); return P(p.tinted, p.plain); }
    case 'bag': return P([bx(0.24, 0.55, 0.42, 0, 0.06, 0)], [bx(0.03, 0.32, 0.03, -0.1, 0.61, -0.1, K.dark), bx(0.03, 0.32, 0.03, -0.1, 0.61, 0.1, K.dark), bx(0.03, 0.03, 0.23, -0.1, 0.92, 0, K.dark), wheel(0.04, 0.03, -0.08, 0.04, -0.16, K.tire), wheel(0.04, 0.03, -0.08, 0.04, 0.16, K.tire)]);
    default: return P([bx(0.4, 0.4, 0.4, 0, 0, 0)], [bx(0.41, 0.005, 0.08, 0, 0.4, 0, K.tan)]);
  }
}

/** Vehicles (one plain part each, plus an optional tinted beacon). */
function vehicleShape(kind) {
  const P = (plain, tinted = []) => ({ plain: merge(plain), tinted: tinted.length ? merge(tinted) : null });
  switch (kind) {
    case 'forklift': return P([
      bx(1.5, 0.95, 1.05, -0.35, 0.22, 0, K.yellow), bx(0.45, 0.85, 1.05, -1.0, 0.22, 0, K.dark), // body + counterweight
      bx(0.5, 0.08, 0.5, -0.45, 1.17, 0, K.dark), bx(0.08, 0.5, 0.45, -0.7, 1.17, 0, K.dark), // seat
      bx(0.06, 1.05, 0.06, 0.15, 1.12, -0.45, K.dark), bx(0.06, 1.05, 0.06, 0.15, 1.12, 0.45, K.dark),
      bx(0.06, 1.05, 0.06, -0.95, 1.12, -0.45, K.dark), bx(0.06, 1.05, 0.06, -0.95, 1.12, 0.45, K.dark),
      bx(1.2, 0.05, 0.98, -0.4, 2.17, 0, K.dark), // overhead guard
      bx(0.08, 2.3, 0.1, 0.5, 0.1, -0.32, K.dark), bx(0.08, 2.3, 0.1, 0.5, 0.1, 0.32, K.dark), bx(0.08, 0.08, 0.74, 0.5, 1.2, 0, K.dark),
      bx(0.06, 0.6, 0.8, 0.58, 0.45, 0, K.dark), // carriage
      bx(1.05, 0.05, 0.12, 1.12, 0.45, -0.22, K.steel), bx(1.05, 0.05, 0.12, 1.12, 0.45, 0.22, K.steel),
      wheel(0.27, 0.26, 0.25, 0.27, -0.45, K.tire), wheel(0.27, 0.26, 0.25, 0.27, 0.45, K.tire),
      wheel(0.22, 0.22, -0.9, 0.22, -0.45, K.tire), wheel(0.22, 0.22, -0.9, 0.22, 0.45, K.tire),
    ], [cy(0.07, 0.07, 0.1, -0.4, 2.22, 0, WHITE, 10)]);
    case 'cart': return P([
      bx(1.2, 0.06, 0.7, 0, 0.36, 0, K.blue), bx(1.16, 0.03, 0.66, 0, 0.12, 0, K.grey),
      bx(0.04, 0.6, 0.04, -0.58, 0.42, -0.3, K.dark), bx(0.04, 0.6, 0.04, -0.58, 0.42, 0.3, K.dark), bx(0.04, 0.04, 0.64, -0.58, 1.0, 0, K.dark),
      ...[-0.5, 0.5].flatMap((x) => [-0.28, 0.28].map((z) => wheel(0.08, 0.05, x, 0.08, z, K.tire))),
      ...[-0.5, 0.5].flatMap((x) => [-0.28, 0.28].map((z) => bx(0.03, 0.2, 0.03, x, 0.14, z, K.steel))),
    ]);
    case 'drone': {
      const plain = [bx(0.42, 0.12, 0.42, 0, 0, 0, K.dark), bx(0.3, 0.08, 0.3, 0, 0.12, 0, K.white)];
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2; const x = Math.cos(a) * 0.48; const z = Math.sin(a) * 0.48;
        plain.push(bx(0.5, 0.04, 0.05, x / 2, 0.06, z / 2, K.dark, -a));
        plain.push(cy(0.03, 0.03, 0.08, x, 0.08, z, K.dark, 8));
        plain.push(cy(0.24, 0.24, 0.012, x, 0.16, z, K.rotor, 18));
      }
      plain.push(bx(0.03, 0.18, 0.3, -0.12, -0.18, 0, K.dark), bx(0.03, 0.18, 0.3, 0.12, -0.18, 0, K.dark));
      return P(plain, [sp(0.05, 0.22, 0.06, 0, WHITE, 8)]);
    }
    default: // agv
      return P([
        bx(1.3, 0.28, 0.85, 0, 0.06, 0, K.orange), bx(1.22, 0.04, 0.8, 0, 0.34, 0, K.dark),
        bx(0.02, 0.06, 0.6, 0.66, 0.2, 0, K.blue), bx(0.02, 0.06, 0.6, -0.66, 0.2, 0, K.red),
        cy(0.07, 0.07, 0.09, 0.55, 0.38, 0, K.tire, 12), cy(0.05, 0.05, 0.04, 0.55, 0.47, 0, K.blue, 10),
        wheel(0.07, 0.06, 0.4, 0.07, -0.43, K.tire), wheel(0.07, 0.06, 0.4, 0.07, 0.43, K.tire),
        wheel(0.07, 0.06, -0.4, 0.07, -0.43, K.tire), wheel(0.07, 0.06, -0.4, 0.07, 0.43, K.tire),
      ], [bx(0.3, 0.015, 0.3, -0.45, 0.355, 0, WHITE)]);
  }
}

/** Pool units: the tinted part shows busy (green) or idle (grey). */
function workerShape(kind) {
  const P = (plain, tinted) => ({ plain: merge(plain), tinted: merge(tinted) });
  switch (kind) {
    case 'robot': return P(
      [cy(0.3, 0.32, 0.25, 0, 0.02, 0, K.white, 16), cy(0.16, 0.2, 0.7, 0, 0.27, 0, K.steel, 14), sp(0.16, 0, 1.08, 0, K.white, 14),
        bx(0.05, 0.06, 0.2, 0.15, 1.08, 0, K.glass), wheel(0.06, 0.05, 0, 0.06, -0.26, K.tire), wheel(0.06, 0.05, 0, 0.06, 0.26, K.tire)],
      [cy(0.33, 0.33, 0.05, 0, 0.27, 0, WHITE, 16)]);
    case 'tool': return P(
      [bx(0.6, 0.7, 0.45, 0, 0.1, 0, K.red), bx(0.62, 0.04, 0.47, 0, 0.8, 0, K.dark), bx(0.04, 0.3, 0.4, -0.31, 0.8, 0, K.dark),
        ...[-0.22, 0.22].flatMap((x) => [-0.17, 0.17].map((z) => wheel(0.05, 0.04, x, 0.05, z, K.tire)))],
      [bx(0.58, 0.04, 0.46, 0.0, 0.5, 0, WHITE)]);
    case 'forklift': { const v = vehicleShape('forklift'); return { plain: v.plain, tinted: v.tinted }; }
    default: { const p = personPieces(false, true); return P(p.plain, p.tinted); }
  }
}

/** Agents: a single tinted geometry each (one draw call per population). */
function agentShape(shape) {
  if (shape === 'dot') return { tinted: merge([sp(0.22, 0, 0.22, 0, WHITE, 10)]), plain: null };
  if (shape === 'car') {
    return { tinted: merge([bx(4.2, 0.62, 1.76, 0, 0.3, 0), bx(2.1, 0.5, 1.6, -0.25, 0.92, 0, rgb('#bcc6d0')), ...carWheels(4.2, 1.76, 0.33, [-0.31, 0.31])]), plain: null };
  }
  const head = rgb('#fff3e6');
  return {
    tinted: merge([
      cy(0.16, 0.19, 0.62, 0, 0.85, 0, WHITE, 8), cy(0.07, 0.06, 0.85, 0, 0, -0.08, [0.55, 0.55, 0.6], 5), cy(0.07, 0.06, 0.85, 0, 0, 0.08, [0.55, 0.55, 0.6], 5),
      sp(0.115, 0, 1.6, 0, head, 8),
    ]),
    plain: null,
  };
}

// ───────────────────────── instanced sets

/** One shape drawn as InstancedMeshes (a tinted and/or a plain part) that share the instance matrices. */
export class ShapeSet {
  constructor(root, shape, material, { cast = true, capacity = 256 } = {}) {
    this.root = root; this.material = material; this.cast = cast;
    this.parts = [];
    if (shape.tinted) this.parts.push({ geo: shape.tinted, tinted: true, mesh: null });
    if (shape.plain) this.parts.push({ geo: shape.plain, tinted: false, mesh: null });
    this.cap = 0; this.n = 0;
    this.alloc(capacity);
  }

  alloc(cap) {
    for (const p of this.parts) {
      const m = new THREE.InstancedMesh(p.geo, this.material, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.castShadow = this.cast; m.receiveShadow = true;
      m.count = 0; m.visible = false;
      if (p.mesh) {
        m.instanceMatrix.array.set(p.mesh.instanceMatrix.array.subarray(0, this.cap * 16));
        m.instanceColor.array.set(p.mesh.instanceColor.array.subarray(0, this.cap * 3));
        this.root.remove(p.mesh); p.mesh.dispose();
      }
      this.root.add(m);
      p.mesh = m;
    }
    this.cap = cap;
  }

  begin() { this.n = 0; }

  /** Adds one instance at (x, y, z) three.js coordinates, turned by rotY, uniform scale s; col = [r, g, b] linear. */
  add(x, y, z, rotY, col, s = 1) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const i = this.n++;
    const c = Math.cos(rotY) * s; const sn = Math.sin(rotY) * s;
    for (const p of this.parts) {
      const te = p.mesh.instanceMatrix.array; const o = i * 16;
      te[o] = c; te[o + 1] = 0; te[o + 2] = -sn; te[o + 3] = 0;
      te[o + 4] = 0; te[o + 5] = s; te[o + 6] = 0; te[o + 7] = 0;
      te[o + 8] = sn; te[o + 9] = 0; te[o + 10] = c; te[o + 11] = 0;
      te[o + 12] = x; te[o + 13] = y; te[o + 14] = z; te[o + 15] = 1;
      const ca = p.mesh.instanceColor.array; const k = i * 3;
      const col2 = p.tinted && col ? col : WHITE;
      ca[k] = col2[0]; ca[k + 1] = col2[1]; ca[k + 2] = col2[2];
    }
  }

  end() {
    for (const p of this.parts) {
      p.mesh.count = this.n;
      p.mesh.visible = this.n > 0;
      if (this.n) { p.mesh.instanceMatrix.needsUpdate = true; p.mesh.instanceColor.needsUpdate = true; }
    }
  }

  setCast(cast) { this.cast = cast; for (const p of this.parts) p.mesh.castShadow = cast; }
  hide() { this.n = 0; this.end(); }
  dispose() { for (const p of this.parts) { this.root.remove(p.mesh); p.mesh.dispose(); } this.parts = []; }
}

/** All the moving things of the 3D view. */
export class DynamicLayer {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'dynamic';
    scene.add(this.root);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
    this.shapes = new Map(); // key → shape { tinted, plain } (geometries)
    this.sets = new Map(); // key → ShapeSet
    this.agentSets = new Map(); // population block id → { set, key, prev }
    this.colors = new Map();
    this.castShadows = true;
  }

  color(hex) {
    let c = this.colors.get(hex);
    if (!c) { c = rgb(hex || '#3b82f6'); this.colors.set(hex, c); }
    return c;
  }

  shape(key, make) {
    let s = this.shapes.get(key);
    if (!s) { s = make(); this.shapes.set(key, s); }
    return s;
  }

  set(key, make) {
    let s = this.sets.get(key);
    if (!s) { s = new ShapeSet(this.root, this.shape(key, make), this.material, { cast: this.castShadows }); this.sets.set(key, s); }
    return s;
  }

  setShadows(on) {
    this.castShadows = on;
    for (const s of this.sets.values()) s.setCast(on);
    for (const a of this.agentSets.values()) a.set.setCast(on && a.set.n <= 2000);
  }

  /** Draws one frame from the simulation (or hides everything when sim is null). */
  update(sim) {
    if (!sim) { this.hide(); return; }
    for (const s of this.sets.values()) s.begin();

    // Vehicles first: drones lift the load they carry.
    const drones = [];
    for (const v of sim.vehicleViews()) {
      const kind = { tugger: 'cart', crane: 'drone' }[v.kind] ?? (['agv', 'forklift', 'cart', 'drone'].includes(v.kind) ? v.kind : 'agv');
      const y = kind === 'drone' ? 3 + Math.sin(performance.now() / 400 + v.x) * 0.04 : 0;
      if (kind === 'drone') drones.push(v);
      const tint = kind === 'drone' ? this.color(v.loaded ? '#22c55e' : '#ef4444') : this.color(v.loaded ? '#22c55e' : '#e5e7eb');
      this.set(`v:${kind}`, () => vehicleShape(kind)).add(v.x, y, v.y, -(v.heading || 0), tint);
    }

    for (const ev of sim.entityViews()) {
      const shape = ev.e?.shape || 'box';
      let z = ev.z || 0;
      if (drones.length && Math.abs(z - 0.55) < 0.02) {
        for (const d of drones) if (Math.abs(d.x - ev.x) < 0.05 && Math.abs(d.y - ev.y) < 0.05) { z = 2.5; break; }
      }
      const s = shape === 'bottle' ? 1.3 : 1;
      this.set(`e:${shape}`, () => entityShape(shape)).add(ev.x, z, ev.y, -(ev.heading || 0), this.color(ev.e?.color), s);
    }

    for (const w of sim.workerViews()) {
      if (w.off) continue;
      const kind = ['worker', 'robot', 'tool', 'forklift'].includes(w.kind) ? w.kind : 'worker';
      this.set(`w:${kind}`, () => workerShape(kind)).add(w.x, 0, w.y, w.busy ? 0 : -Math.PI / 2, this.color(w.busy ? '#22c55e' : '#9ca3af'));
    }

    for (const s of this.sets.values()) s.end();
    this.updateAgents(sim.agentViews());
  }

  updateAgents(pops) {
    const seen = new Set();
    for (const p of pops) {
      const shape = ['person', 'dot', 'car'].includes(p.shape) ? p.shape : 'person';
      const key = `a:${shape}`;
      let a = this.agentSets.get(p.block);
      if (a && a.key !== key) { a.set.dispose(); a = null; }
      if (!a) {
        a = { key, set: new ShapeSet(this.root, this.shape(key, () => agentShape(shape)), this.material, { cast: this.castShadows, capacity: 256 }), prev: null, heading: null };
        this.agentSets.set(p.block, a);
      }
      seen.add(p.block);
      const cols = (p.states ?? []).map((s) => this.color(s.color));
      const fallback = this.color('#3b82f6');
      const co = p.coords; const n = Math.floor(co.length / 3);
      if (!a.prev || a.prev.length !== n * 2) { a.prev = new Float32Array(n * 2); a.heading = new Float32Array(n); for (let i = 0; i < n; i++) { a.prev[i * 2] = co[i * 3]; a.prev[i * 2 + 1] = co[i * 3 + 1]; } }
      a.set.begin();
      for (let i = 0; i < n; i++) {
        const x = co[i * 3]; const y = co[i * 3 + 1];
        const dx = x - a.prev[i * 2]; const dy = y - a.prev[i * 2 + 1];
        if (dx * dx + dy * dy > 1e-6) a.heading[i] = Math.atan2(dy, dx);
        a.prev[i * 2] = x; a.prev[i * 2 + 1] = y;
        a.set.add(x, 0, y, -a.heading[i], cols[co[i * 3 + 2]] ?? fallback);
      }
      a.set.end();
      a.set.setCast(this.castShadows && n <= 2000);
    }
    for (const [id, a] of this.agentSets) if (!seen.has(id)) { a.set.dispose(); this.agentSets.delete(id); }
  }

  hide() {
    for (const s of this.sets.values()) s.hide();
    for (const a of this.agentSets.values()) { a.set.hide(); a.prev = null; }
  }

  dispose() {
    for (const s of this.sets.values()) s.dispose();
    for (const a of this.agentSets.values()) a.set.dispose();
    for (const s of this.shapes.values()) { s.tinted?.dispose(); s.plain?.dispose(); }
    this.sets.clear(); this.agentSets.clear(); this.shapes.clear();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
