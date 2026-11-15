// Static 3D models of the blocks. buildBlock() returns a group in the block's
// local frame (x = length w, z = depth h, y up; the caller places and rotates
// it), the height of its top (for the name tag) and an optional live(state)
// callback the view calls every frame with sim.blockState(id) — or null when
// the simulation is not running.
import * as THREE from 'three';
import { BLOCK_TYPES, baseOf, pathPoints } from '../sim/blocks.js';
import { num, quadGeometry, rectQuad, frameRects, ribbonQuads, dashQuads, screenTexture, chartTexture, floorTextTexture } from './kit.js';

export const STATE_COLORS = { idle: '#facc15', busy: '#22c55e', blocked: '#f97316', failed: '#ef4444' };
const OFF = '#59606b';

// A small palette shared by the models.
const C = {
  steel: '#9aa4ae', darkSteel: '#3f464e', frame: '#2d333a', black: '#1c1f23', rubber: '#26292d',
  yellow: '#f2c230', orange: '#e8711c', safety: '#f59e0b', white: '#eef1f4', glass: '#7fa6c4',
  wood: '#b88a5a', darkWood: '#8a6440', concrete: '#c4c7cb', asphalt: '#3a3d42', paint: '#f5f5f4',
  slate: '#5f7389', blue: '#2f6db5', rack: '#1f4e8c', robot: '#f08c1a', skin: '#e8c4a8',
};

/** Builds meshes into groups; collects the geometries / materials / textures it made for disposal. */
export class Builder {
  constructor(kit, trash) { this.kit = kit; this.trash = trash; }
  m(color, o) { return this.kit.mat(color, o); }
  own(x) { this.trash.push(x); return x; }

  /** A box with its bottom at y0. */
  box(parent, w, h, d, x, y0, z, mat, cast = true) {
    const m = new THREE.Mesh(this.kit.box, mat);
    m.scale.set(Math.max(1e-3, w), Math.max(1e-3, h), Math.max(1e-3, d));
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = cast; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** An upright cylinder with its bottom at y0. */
  cyl(parent, r, h, x, y0, z, mat, low = false) {
    const m = new THREE.Mesh(low ? this.kit.cylLow : this.kit.cyl, mat);
    m.scale.set(r * 2, h, r * 2);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** A lying cylinder centred at (x, y, z), its axis along 'x' or 'z'. */
  cylH(parent, r, len, x, y, z, mat, axis = 'x') {
    const m = new THREE.Mesh(this.kit.cyl, mat);
    m.scale.set(r * 2, len, r * 2);
    if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  sphere(parent, r, x, y, z, mat) {
    const m = new THREE.Mesh(this.kit.sphere, mat);
    m.scale.setScalar(r * 2); m.position.set(x, y, z);
    m.castShadow = true; parent.add(m);
    return m;
  }
  /** A flat painted rectangle (no shadow casting). */
  paint(parent, w, d, x, z, y, mat) {
    const m = new THREE.Mesh(this.kit.plane, mat);
    m.scale.set(w, 1, d); m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** Many flat quads as one mesh. */
  quads(parent, quads, y, mat) {
    if (!quads.length) return null;
    const m = new THREE.Mesh(this.own(quadGeometry(quads, y)), mat);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  rects(parent, rects, y, mat) { return this.quads(parent, rects.map(rectQuad), y, mat); }
  /** A floor arrow pointing along +x, rotated by `ang` (radians, 2D convention). */
  arrow(parent, len, x, z, ang, y, mat) {
    const m = new THREE.Mesh(this.kit.arrow, mat);
    m.scale.set(len, 1, len); m.position.set(x, y, z); m.rotation.y = -ang;
    parent.add(m);
    return m;
  }
  /** A box spanning from 2D point a to b (local x, z), width t, height h, bottom y0. */
  seg(parent, a, b, t, h, y0, mat, extend = 0) {
    const dx = b[0] - a[0]; const dz = b[1] - a[1]; const L = Math.hypot(dx, dz);
    const m = this.box(parent, L + extend, h, t, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, mat);
    m.rotation.y = -Math.atan2(dz, dx);
    return m;
  }
  /** A lamp with its own material; set(color|null) lights it. */
  lamp(parent, r, h, x, y0, z) {
    const mat = this.own(new THREE.MeshStandardMaterial({ color: OFF, roughness: 0.3, metalness: 0, emissive: 0x000000 }));
    const mesh = this.cyl(parent, r, h, x, y0, z, mat);
    mesh.castShadow = false;
    mesh.userData.live = true;
    let last;
    const set = (color) => {
      if (color === last) return;
      last = color;
      if (color) { mat.color.set(color); mat.emissive.set(color); mat.emissiveIntensity = 1.4; } else { mat.color.set(OFF); mat.emissive.set(0x000000); }
    };
    return { mesh, mat, set };
  }
  /** A stack light (pole + lamp) on top of a machine. */
  statusLight(parent, x, y0, z) {
    this.cyl(parent, 0.025, 0.35, x, y0, z, this.m(C.darkSteel, { metal: 0.6, rough: 0.4 }), true);
    this.cyl(parent, 0.075, 0.04, x, y0 + 0.35, z, this.m(C.frame), true);
    const l = this.lamp(parent, 0.07, 0.24, x, y0 + 0.39, z);
    this.cyl(parent, 0.075, 0.03, x, y0 + 0.63, z, this.m(C.frame), true);
    return l;
  }
  /** A canvas screen facing +z centred at (x, y, z). */
  screen(parent, w, h, x, y, z, accent) {
    const s = screenTexture(w / h, accent);
    this.own(s.tex);
    const mat = this.own(new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false }));
    const m = new THREE.Mesh(this.kit.vplane, mat);
    m.scale.set(w, h, 1); m.position.set(x, y, z);
    m.userData.live = true;
    parent.add(m);
    return s.draw;
  }
}

const sizeOf = (b) => { const spec = BLOCK_TYPES[b.type]; return [b.w ?? spec?.w ?? 1, b.h ?? spec?.h ?? 1]; };
const fmt = (v, digits) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—');
const stateColor = (st) => (st?.state ? STATE_COLORS[st.state] ?? null : null);

/** { group, top, live? } for a block. Path blocks come back in coordinates relative to (b.x, b.y). */
export function buildBlock(b, B) {
  const g = new THREE.Group();
  const [w, h] = sizeOf(b);
  const fn = BUILDERS[b.type] ?? BUILDERS[baseOf(b.type)] ?? genericStation;
  const r = fn(B, g, b, w, h) ?? {};
  return { group: g, top: r.top ?? 1.5, live: r.live ?? null };
}

// ───────────────────────── discrete-event process

/** A roll-up loading door facing +z, centred at x = 0 (bottom at the floor). */
function loadingDoor(B, g, width, height, light) {
  const wall = B.m(C.concrete, { rough: 0.9 });
  B.box(g, width + 0.9, height + 0.6, 0.3, 0, 0, -0.15, wall);
  B.box(g, width + 0.24, height + 0.12, 0.06, 0, 0, 0.02, B.m(C.frame, { metal: 0.4 }));
  B.box(g, width, height * 0.62, 0.05, 0, height * 0.38, 0.06, B.m('#a9b4bf', { metal: 0.3, rough: 0.5 }));
  B.box(g, width, height * 0.38, 0.02, 0, 0, 0.03, B.m('#111418', { rough: 1 })); // dark, half-open opening
  for (let i = 0; i < 6; i++) B.box(g, width, 0.025, 0.02, 0, height * 0.42 + i * height * 0.095, 0.09, B.m('#8c97a3', { metal: 0.3 }), false);
  B.box(g, width + 0.5, 0.3, 0.55, 0, height + 0.05, 0.25, B.m(C.darkSteel)); // canopy
  const l = B.lamp(g, 0.09, 0.14, width / 2 + 0.25, height - 0.2, 0.1);
  l.set(light);
  B.box(g, 0.18, 0.5, 0.14, -width / 2 - 0.22, 0.15, 0.1, B.m(C.black, { rough: 0.9 })); // bumpers
  B.box(g, 0.18, 0.5, 0.14, width / 2 + 0.22, 0.15, 0.1, B.m(C.black, { rough: 0.9 }));
  return l;
}

function source(B, g, b, w, h, out = true) {
  const color = out ? '#22c55e' : '#ef4444';
  const dw = Math.min(h * 0.82, 3.2); const dh = 2.6;
  const sub = new THREE.Group();
  sub.position.x = out ? -w / 2 + 0.3 : w / 2 - 0.3;
  sub.rotation.y = out ? Math.PI / 2 : -Math.PI / 2;
  g.add(sub);
  const l = loadingDoor(B, sub, dw, dh, color);
  // Painted apron with a direction arrow.
  B.paint(g, w, h, 0, 0, 0.006, B.m('#9aa0a6', { rough: 0.95, offset: 1 }));
  B.rects(g, frameRects(0, 0, w, h, 0.08), 0.01, B.m(C.yellow, { offset: 2 }));
  B.arrow(g, Math.min(w, h) * 0.55, out ? 0.15 : -0.15, 0, 0, 0.012, B.m(color, { offset: 3, rough: 0.6 }));
  return { top: dh + 0.7, live: (st) => l.set(st ? color : OFF) };
}

function queue(B, g, b, w, h) {
  B.paint(g, w, h, 0, 0, 0.005, B.m('#b9bec4', { rough: 0.95, offset: 1, opacity: 0.85 }));
  B.rects(g, frameRects(0, 0, w, h, 0.1), 0.01, B.m(C.yellow, { offset: 2 }));
  // Hatched entry strip and a flow arrow.
  const quads = [];
  for (let i = 0; i < 5; i++) { const z0 = -h / 2 + 0.1 + (i * (h - 0.2)) / 5; quads.push(rectQuad([-w / 2 + 0.18, z0, -w / 2 + 0.32, z0 + (h - 0.2) / 10])); }
  B.quads(g, quads, 0.011, B.m(C.black, { offset: 2 }));
  B.arrow(g, Math.min(1.2, w * 0.3), w / 2 - 0.6, 0, 0, 0.012, B.m('#ffffff', { offset: 3, opacity: 0.8 }));
  // Stanchion posts at the corners.
  const post = B.m(C.darkSteel, { metal: 0.6, rough: 0.35 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.cyl(g, 0.04, 0.95, sx * (w / 2 - 0.05), 0, sz * (h / 2 - 0.05), post, true); B.cyl(g, 0.15, 0.03, sx * (w / 2 - 0.05), 0, sz * (h / 2 - 0.05), post, true); }
  const belt = B.m('#1d4ed8', { rough: 0.6 });
  B.box(g, w - 0.1, 0.05, 0.02, 0, 0.85, -(h / 2 - 0.05), belt);
  B.box(g, w - 0.1, 0.05, 0.02, 0, 0.85, h / 2 - 0.05, belt);
  return { top: 1.2 };
}

/** Machine models by props.look; all keep the work point (entities at z = 0.9) visible. */
function processBlock(B, g, b, w, h) {
  const look = b.props?.look || 'machine';
  const make = LOOK_BUILDERS[look] ?? LOOK_BUILDERS[LOOK_ALIAS[look]] ?? LOOK_BUILDERS.machine;
  const r = make(B, g, w, h);
  const light = B.statusLight(g, r.lx ?? w / 2 - 0.2, r.ly ?? r.top, r.lz ?? -h / 2 + 0.2);
  return { top: Math.max(r.top, (r.ly ?? r.top) + 0.65) + 0.15, live: (st) => { light.set(stateColor(st)); r.live?.(st); } };
}

function plinth(B, g, w, h, color = '#7d8792') { B.box(g, w * 0.96, 0.08, h * 0.92, 0, 0, 0, B.m(color, { rough: 0.8 })); }

/** A robot arm on a pedestal; returns the turret group (it turns while busy). */
function robotArm(B, g, x, z, reach = 1.2, color = C.robot) {
  const body = B.m(color, { rough: 0.45, metal: 0.15 });
  const dark = B.m(C.darkSteel, { metal: 0.6, rough: 0.4 });
  B.cyl(g, 0.34, 0.12, x, 0, z, dark);
  B.cyl(g, 0.26, 0.3, x, 0.12, z, body);
  const turret = new THREE.Group();
  turret.position.set(x, 0.42, z);
  turret.userData.live = true;
  g.add(turret);
  B.cyl(turret, 0.22, 0.24, 0, 0, 0, body);
  const shoulder = new THREE.Group(); shoulder.position.y = 0.32; shoulder.rotation.z = -0.55; turret.add(shoulder);
  B.cylH(shoulder, 0.13, 0.36, 0, 0, 0, dark, 'z');
  B.box(shoulder, 0.2, reach * 0.6, 0.2, 0, 0, 0, body);
  const elbow = new THREE.Group(); elbow.position.y = reach * 0.6; elbow.rotation.z = -1.55; shoulder.add(elbow);
  B.cylH(elbow, 0.1, 0.3, 0, 0, 0, dark, 'z');
  B.box(elbow, 0.15, reach * 0.55, 0.15, 0, 0, 0, body);
  const wrist = new THREE.Group(); wrist.position.y = reach * 0.55; wrist.rotation.z = -0.6; elbow.add(wrist);
  B.cyl(wrist, 0.06, 0.12, 0, 0, 0, dark);
  B.box(wrist, 0.18, 0.04, 0.08, 0, 0.12, 0, dark);
  B.box(wrist, 0.03, 0.12, 0.06, -0.07, 0.16, 0, B.m(C.steel, { metal: 0.7 }));
  B.box(wrist, 0.03, 0.12, 0.06, 0.07, 0.16, 0, B.m(C.steel, { metal: 0.7 }));
  return turret;
}

const spin = (turret, st) => {
  if (st?.state === 'busy') turret.rotation.y = Math.sin(performance.now() / 600) * 0.9;
};

function table(B, g, w, d, x, z, top = 0.86, topColor = '#c8b48a', legColor = C.steel) {
  B.box(g, w, 0.05, d, x, top - 0.05, z, B.m(topColor, { rough: 0.7 }));
  const leg = B.m(legColor, { metal: 0.5, rough: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(g, 0.05, top - 0.05, 0.05, x + sx * (w / 2 - 0.06), 0, z + sz * (d / 2 - 0.06), leg);
  B.box(g, w - 0.12, 0.03, d - 0.12, x, 0.15, z, B.m(legColor, { metal: 0.4 })); // lower shelf
}

const LOOK_BUILDERS = {
  machine(B, g, w, h) {
    plinth(B, g, w, h);
    const body = B.m(C.slate, { rough: 0.5, metal: 0.2 });
    B.box(g, w * 0.9, 1.5, h * 0.38, 0, 0.08, -h * 0.25, body); // back column
    B.box(g, w * 0.9, 0.82, h * 0.5, 0, 0.08, h * 0.18, body); // base
    B.box(g, w * 0.7, 0.04, h * 0.42, 0, 0.9, h * 0.18, B.m(C.steel, { metal: 0.7, rough: 0.3 })); // work bed
    B.box(g, w * 0.92, 0.06, h * 0.4, 0, 1.58, -h * 0.25, B.m(C.yellow)); // trim
    B.box(g, 0.45, 0.32, 0.04, -w * 0.25, 1.05, -h * 0.06 + 0.02, B.m('#0f172a', { rough: 0.3 })); // panel
    B.box(g, 0.35, 0.2, 0.01, -w * 0.25, 1.11, -h * 0.06 + 0.045, B.m('#38bdf8', { emissive: '#0ea5e9', ei: 0.6 }));
    return { top: 1.64 };
  },
  cnc(B, g, w, h) {
    plinth(B, g, w, h);
    const shell = B.m('#dfe3e6', { rough: 0.45, metal: 0.1 });
    B.box(g, w * 0.92, 2.0, h * 0.86, 0, 0.08, 0, shell);
    B.box(g, w * 0.93, 0.22, h * 0.87, 0, 1.6, 0, B.m(C.blue, { rough: 0.4 }));
    B.box(g, w * 0.5, 0.75, 0.03, -w * 0.08, 0.75, h * 0.43 + 0.01, B.m('#3a4f63', { opacity: 0.55, rough: 0.1, metal: 0.3 })); // window
    B.box(g, w * 0.54, 0.05, 0.05, -w * 0.08, 0.62, h * 0.44, B.m(C.darkSteel, { metal: 0.6 })); // handle rail
    B.box(g, w * 0.2, 0.8, 0.12, w * 0.33, 0.8, h * 0.43 + 0.06, B.m(C.frame, { rough: 0.4 })); // control pendant
    B.box(g, w * 0.16, 0.3, 0.01, w * 0.33, 1.25, h * 0.43 + 0.125, B.m('#38bdf8', { emissive: '#0ea5e9', ei: 0.6 }));
    B.box(g, w * 0.92, 0.12, h * 0.86, 0, 0.08, 0, B.m(C.darkSteel), false);
    return { top: 2.08, lx: w * 0.4, lz: -h * 0.35 };
  },
  robot(B, g, w, h) {
    plinth(B, g, w, h, '#9ca3af');
    table(B, g, w * 0.4, h * 0.5, w * 0.22, h * 0.1, 0.86, C.steel, C.darkSteel);
    const turret = robotArm(B, g, -w * 0.22, -h * 0.1, Math.min(1.4, Math.max(0.9, w * 0.45)));
    B.rects(g, frameRects(0, 0, w * 0.96, h * 0.92, 0.07), 0.09, B.m(C.yellow, { offset: 2 }));
    return { top: 1.6, live: (st) => spin(turret, st), lx: -w / 2 + 0.2, ly: 0.08, lz: h / 2 - 0.25 };
  },
  press(B, g, w, h) {
    plinth(B, g, w, h, C.darkSteel);
    const body = B.m('#e07b24', { rough: 0.5, metal: 0.2 });
    B.box(g, w * 0.8, 0.82, h * 0.7, 0, 0.08, 0, body); // bolster
    B.box(g, w * 0.6, 0.04, h * 0.5, 0, 0.86, 0.05, B.m(C.steel, { metal: 0.7, rough: 0.3 }));
    for (const sx of [-1, 1]) B.box(g, w * 0.14, 2.4, h * 0.6, sx * w * 0.36, 0.9, -0.05, body); // side frames
    B.box(g, w * 0.86, 0.6, h * 0.7, 0, 2.7, -0.05, body); // crown
    B.box(g, w * 0.5, 0.35, h * 0.45, 0, 1.75, 0.05, B.m(C.darkSteel, { metal: 0.6 })); // ram
    B.cyl(g, 0.12, 0.6, 0, 2.1, 0.05, B.m(C.steel, { metal: 0.8, rough: 0.2 }));
    B.box(g, w * 0.8, 0.06, 0.06, 0, 1.2, h * 0.36, B.m(C.yellow)); // light curtain bar
    return { top: 3.3, lx: w * 0.3, lz: -h * 0.25 };
  },
  oven(B, g, w, h) {
    const shell = B.m('#a8b0b8', { metal: 0.55, rough: 0.35 });
    B.box(g, w * 0.98, 0.7, h * 0.4, 0, 0, 0, B.m(C.darkSteel)); // conveyor bed
    B.box(g, w * 0.98, 0.06, h * 0.36, 0, 0.82, 0, B.m(C.rubber, { rough: 0.9 }));
    B.box(g, w * 0.8, 0.9, h * 0.9, 0, 0.95, 0, shell); // tunnel roof
    for (const sz of [-1, 1]) B.box(g, w * 0.8, 0.95, h * 0.22, 0, 0, sz * h * 0.34, shell); // tunnel walls
    B.box(g, w * 0.82, 0.12, h * 0.92, 0, 1.0, 0, B.m('#ef6c2f', { emissive: '#7c2d12', ei: 0.4 })); // heat band
    B.cyl(g, 0.15, 0.9, -w * 0.25, 1.85, -h * 0.2, shell);
    B.cyl(g, 0.15, 0.9, w * 0.2, 1.85, -h * 0.2, shell);
    B.box(g, 0.4, 0.5, 0.05, w * 0.15, 1.2, h * 0.45 + 0.03, B.m('#0f172a'));
    return { top: 1.85, lx: -w * 0.42, lz: -h * 0.4 };
  },
  workstation(B, g, w, h) {
    table(B, g, w * 0.86, h * 0.6, 0, h * 0.1, 0.86, '#d4c19a');
    const fr = B.m(C.steel, { metal: 0.5 });
    for (const sx of [-1, 1]) B.box(g, 0.05, 1.0, 0.05, sx * w * 0.4, 0.86, -h * 0.16, fr);
    B.box(g, w * 0.82, 0.04, 0.3, 0, 1.3, -h * 0.12, fr); // bin shelf
    const bins = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b'];
    for (let i = 0; i < 4; i++) B.box(g, w * 0.16, 0.14, 0.24, -w * 0.3 + i * w * 0.2, 1.34, -h * 0.12, B.m(bins[i], { rough: 0.6 }));
    B.box(g, w * 0.6, 0.04, 0.08, 0, 1.82, -h * 0.12, B.m('#f8fafc', { emissive: '#ffffff', ei: 0.7 })); // lamp
    B.box(g, w * 0.7, 0.02, 0.6, 0, 0.005, h * 0.42, B.m('#334155', { rough: 0.9 }), false); // anti-fatigue mat
    return { top: 1.86, lx: w * 0.4, lz: -h * 0.16 };
  },
  inspection(B, g, w, h) {
    table(B, g, w * 0.86, h * 0.6, 0, 0, 0.86, '#e5e7eb', C.darkSteel);
    const arch = B.m('#4a6fa5', { rough: 0.45, metal: 0.2 });
    for (const sz of [-1, 1]) B.box(g, 0.1, 1.9, 0.1, 0, 0, sz * h * 0.36, arch);
    B.box(g, 0.14, 0.12, h * 0.82, 0, 1.9, 0, arch);
    B.box(g, 0.2, 0.16, 0.2, 0, 1.74, 0, B.m(C.frame));
    B.cyl(g, 0.05, 0.05, 0, 1.69, 0, B.m('#93c5fd', { emissive: '#3b82f6', ei: 0.8 }));
    B.box(g, 0.5, 0.35, 0.05, w * 0.3, 1.0, -h * 0.28, B.m('#0f172a'));
    return { top: 2.02, lx: w * 0.35, lz: -h * 0.36 };
  },
  packing(B, g, w, h) {
    table(B, g, w * 0.86, h * 0.62, 0, 0, 0.86, C.wood);
    const card = B.m('#c49a6c', { rough: 0.85 });
    B.box(g, 0.5, 0.4, 0.4, -w * 0.3, 0.86, -h * 0.15, card);
    B.box(g, 0.45, 0.35, 0.35, -w * 0.3, 1.26, -h * 0.15, card);
    B.box(g, 0.6, 0.3, 0.45, -w * 0.38, 0, h * 0.38, card);
    B.cylH(g, 0.08, 0.1, w * 0.3, 0.98, -h * 0.18, B.m('#a3a3a3', { metal: 0.4 }), 'z'); // tape roll
    B.box(g, w * 0.6, 0.04, 0.04, 0, 1.6, -h * 0.25, B.m(C.steel, { metal: 0.5 }));
    for (const sx of [-1, 1]) B.box(g, 0.04, 0.74, 0.04, sx * w * 0.3, 0.86, -h * 0.25, B.m(C.steel, { metal: 0.5 }));
    return { top: 1.64, lx: w * 0.38, lz: -h * 0.25 };
  },
  paint(B, g, w, h) {
    const wall = B.m('#e8ecef', { rough: 0.6 });
    B.box(g, w * 0.96, 0.08, h * 0.9, 0, 0, 0, B.m('#94a3b8', { rough: 0.9 })); // grated floor
    B.box(g, w * 0.96, 2.3, 0.08, 0, 0, -h * 0.45, wall);
    for (const sx of [-1, 1]) B.box(g, 0.08, 2.3, h * 0.9, sx * w * 0.48, 0, 0, wall);
    B.box(g, w * 0.96, 0.3, h * 0.9, 0, 2.3, 0, B.m('#2aa198', { rough: 0.5 })); // plenum
    B.box(g, w * 0.4, 0.4, h * 0.3, 0, 2.6, -h * 0.2, B.m(C.steel, { metal: 0.5 })); // exhaust
    table(B, g, w * 0.4, h * 0.4, 0, 0.1, 0.86, '#6b7280', C.darkSteel);
    B.box(g, w * 0.9, 0.04, 0.04, 0, 2.2, h * 0.44, B.m('#f8fafc', { emissive: '#ffffff', ei: 0.5 }), false);
    return { top: 3.0, lx: w * 0.4, lz: -h * 0.36 };
  },
  washer(B, g, w, h) {
    const ss = B.m('#c9d1d8', { metal: 0.65, rough: 0.3 });
    B.box(g, w * 0.98, 0.7, h * 0.4, 0, 0, 0, B.m(C.darkSteel));
    B.box(g, w * 0.98, 0.06, h * 0.36, 0, 0.8, 0, B.m(C.rubber, { rough: 0.9 }));
    B.box(g, w * 0.72, 1.0, h * 0.92, 0, 0.95, 0, ss);
    for (const sz of [-1, 1]) B.box(g, w * 0.72, 0.95, h * 0.24, 0, 0, sz * h * 0.34, ss);
    B.box(g, w * 0.02, 0.6, h * 0.5, -w * 0.36, 0.95, 0, B.m('#334155', { opacity: 0.7 })); // curtain
    B.cylH(g, 0.06, w * 0.8, 0, 2.05, -h * 0.3, B.m(C.blue, { metal: 0.3 }), 'x'); // water pipe
    B.cyl(g, 0.25, 0.8, w * 0.4, 0, -h * 0.35, B.m('#60a5fa', { opacity: 0.85 }));
    return { top: 1.95, lx: -w * 0.3, lz: -h * 0.4 };
  },
  desk(B, g, w, h) {
    const wood = B.m(C.wood, { rough: 0.6 });
    B.box(g, w * 0.86, 0.05, h * 0.45, 0, 0.72, -h * 0.12, wood);
    for (const sx of [-1, 1]) B.box(g, 0.05, 0.72, h * 0.42, sx * w * 0.4, 0, -h * 0.12, B.m(C.darkWood));
    B.box(g, w * 0.8, 0.5, 0.03, 0, 0.2, -h * 0.32, B.m(C.darkWood)); // modesty panel
    B.box(g, 0.55, 0.34, 0.03, -w * 0.15, 0.95, -h * 0.25, B.m(C.black, { rough: 0.3 })); // monitor
    B.box(g, 0.5, 0.29, 0.01, -w * 0.15, 0.975, -h * 0.25 + 0.02, B.m('#60a5fa', { emissive: '#1d4ed8', ei: 0.5 }));
    B.box(g, 0.05, 0.2, 0.05, -w * 0.15, 0.77, -h * 0.27, B.m(C.black));
    B.box(g, 0.45, 0.02, 0.15, -w * 0.15, 0.77, -h * 0.05, B.m('#e5e7eb'));
    // Chair behind the desk (back side) and one for the visitor.
    const chair = B.m('#334155', { rough: 0.7 });
    B.box(g, 0.48, 0.08, 0.48, 0, 0.45, -h * 0.42, chair); B.box(g, 0.48, 0.5, 0.06, 0, 0.53, -h * 0.42 - 0.24, chair);
    B.cyl(g, 0.03, 0.45, 0, 0, -h * 0.42, B.m(C.steel, { metal: 0.6 }));
    return { top: 1.3, lx: w * 0.36, ly: 0.77, lz: -h * 0.25 };
  },
  checkout(B, g, w, h) {
    const counter = B.m('#3b4552', { rough: 0.5 });
    B.box(g, w * 0.9, 0.86, h * 0.36, 0, 0, -h * 0.18, counter);
    B.box(g, w * 0.55, 0.03, h * 0.3, -w * 0.15, 0.86, -h * 0.18, B.m(C.black, { rough: 0.95 })); // belt
    B.box(g, w * 0.92, 0.04, 0.05, 0, 0.88, -h * 0.02, B.m(C.steel, { metal: 0.6 }));
    B.box(g, 0.4, 0.06, 0.3, w * 0.3, 0.86, -h * 0.2, B.m('#e5e7eb'));
    B.box(g, 0.05, 0.4, 0.05, w * 0.3, 0.92, -h * 0.3, B.m(C.black));
    B.box(g, 0.32, 0.22, 0.04, w * 0.3, 1.25, -h * 0.3, B.m('#0f172a'));
    B.box(g, 0.28, 0.18, 0.01, w * 0.3, 1.27, -h * 0.3 + 0.025, B.m('#86efac', { emissive: '#16a34a', ei: 0.5 }));
    B.box(g, 0.5, 0.86, 0.4, w * 0.3, 0, h * 0.25, B.m('#4b5563')); // bagging stand
    return { top: 1.5, lx: -w * 0.42, ly: 0.86, lz: -h * 0.32 };
  },
  scanner(B, g, w, h) {
    B.box(g, w * 0.98, 0.7, h * 0.42, 0, 0, 0, B.m(C.darkSteel));
    B.box(g, w * 0.98, 0.06, h * 0.38, 0, 0.8, 0, B.m(C.black, { rough: 0.95 }));
    const body = B.m('#d8dde2', { rough: 0.4, metal: 0.1 });
    B.box(g, w * 0.55, 0.85, h * 0.92, 0, 1.0, 0, body);
    for (const sz of [-1, 1]) B.box(g, w * 0.55, 1.0, h * 0.24, 0, 0, sz * h * 0.34, body);
    B.box(g, w * 0.56, 0.1, h * 0.93, 0, 1.5, 0, B.m('#2563eb'));
    for (const sx of [-1, 1]) B.box(g, 0.02, 0.55, h * 0.42, sx * w * 0.28, 0.85, 0, B.m('#1e293b', { opacity: 0.75 })); // curtains
    B.box(g, 0.5, 0.35, 0.05, w * 0.15, 1.15, h * 0.46 + 0.03, B.m('#0f172a'));
    return { top: 1.85, lx: -w * 0.2, lz: -h * 0.36 };
  },
  bed(B, g, w, h) {
    const metal = B.m('#9aa3ab', { metal: 0.6, rough: 0.35 });
    const len = Math.min(w * 0.9, 2.1); const wid = Math.min(h * 0.55, 1.0);
    B.box(g, len, 0.1, wid, 0, 0.5, 0, metal);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.box(g, 0.04, 0.45, 0.04, sx * (len / 2 - 0.08), 0.06, sz * (wid / 2 - 0.06), metal); B.sphere(g, 0.05, sx * (len / 2 - 0.08), 0.05, sz * (wid / 2 - 0.06), B.m(C.black)); }
    B.box(g, len - 0.06, 0.18, wid - 0.06, 0, 0.6, 0, B.m('#f1f5f9', { rough: 0.9 })); // mattress
    B.box(g, 0.4, 0.1, wid * 0.6, -len / 2 + 0.3, 0.78, 0, B.m('#ffffff', { rough: 0.9 })); // pillow
    B.box(g, len * 0.5, 0.04, wid - 0.04, len * 0.15, 0.78, 0, B.m('#93c5fd', { rough: 0.9 })); // blanket
    B.box(g, 0.05, 0.6, wid, -len / 2, 0.5, 0, B.m('#cbd5e1')); // head board
    B.box(g, 0.05, 0.4, wid, len / 2, 0.5, 0, B.m('#cbd5e1'));
    B.cyl(g, 0.015, 1.9, -len / 2 + 0.1, 0, -wid / 2 - 0.2, metal, true); // IV pole
    B.box(g, 0.12, 0.2, 0.05, -len / 2 + 0.1, 1.65, -wid / 2 - 0.2, B.m('#e0f2fe', { opacity: 0.8 }));
    B.box(g, 0.5, 1.2, 0.4, len / 2 - 0.2, 0, -h / 2 + 0.25, B.m('#e5e7eb')); // monitor cart
    B.box(g, 0.35, 0.25, 0.02, len / 2 - 0.2, 1.0, -h / 2 + 0.46, B.m('#22c55e', { emissive: '#15803d', ei: 0.5 }));
    return { top: 1.4, lx: len / 2 - 0.2, ly: 1.2, lz: -h / 2 + 0.25 };
  },
};

function resourcePool(B, g, b, w, h) {
  B.paint(g, w, h, 0, 0, 0.005, B.m('#c4b5fd', { rough: 0.95, offset: 1, opacity: 0.45 }));
  B.rects(g, frameRects(0, 0, w, h, 0.08), 0.01, B.m('#7c3aed', { offset: 2 }));
  const kind = b.props?.kind || 'worker';
  if (kind === 'forklift') B.box(g, 0.5, 1.4, 0.3, w / 2 - 0.35, 0, -h / 2 + 0.2, B.m('#16a34a')); // charger
  else if (kind === 'robot') B.box(g, 0.4, 0.9, 0.25, w / 2 - 0.3, 0, -h / 2 + 0.18, B.m('#0284c7'));
  else {
    B.box(g, w * 0.6, 0.06, 0.35, 0, 0.42, -h / 2 + 0.22, B.m(C.wood)); // bench
    for (const sx of [-1, 1]) B.box(g, 0.05, 0.42, 0.3, sx * w * 0.27, 0, -h / 2 + 0.22, B.m(C.darkSteel));
    B.box(g, 0.5, 1.8, 0.4, w / 2 - 0.3, 0, -h / 2 + 0.22, B.m('#64748b', { metal: 0.3 })); // locker
  }
  return { top: 1.9 };
}

/** Small control stations: seize, release, select, assign, delay, batch, unbatch (and unknown types). */
function genericStation(B, g, b, w, h) {
  const color = BLOCK_TYPES[b.type]?.color ?? '#64748b';
  B.paint(g, w * 0.94, h * 0.9, 0, 0, 0.005, B.m(color, { rough: 0.9, offset: 1, opacity: 0.22 }));
  B.rects(g, frameRects(0, 0, w * 0.94, h * 0.9, 0.06), 0.01, B.m(color, { offset: 2 }));
  // Control cabinet at the back.
  const cz = -h / 2 + 0.3;
  B.box(g, 0.6, 1.1, 0.42, 0, 0, cz, B.m('#d5dbe1', { rough: 0.5 }));
  B.box(g, 0.62, 0.08, 0.44, 0, 1.1, cz, B.m(color, { rough: 0.5 }));
  B.box(g, 0.38, 0.24, 0.02, 0, 0.72, cz + 0.22, B.m('#0f172a', { rough: 0.3 }));
  B.box(g, 0.32, 0.18, 0.01, 0, 0.75, cz + 0.235, B.m(color, { emissive: color, ei: 0.45 }));
  let top = 1.25; let live = null;
  if (b.type === 'select') {
    const n = Math.max(2, Math.round(num(b.props?.outputs, 2)));
    for (let i = 0; i < n; i++) { const a = ((i - (n - 1) / 2) / Math.max(1, n - 1)) * 1.1; B.arrow(g, Math.min(0.9, w * 0.45), w * 0.1, h * 0.1, a, 0.012, B.m('#ffffff', { offset: 3, opacity: 0.85 })); }
  } else if (b.type === 'batch' || b.type === 'unbatch') {
    B.box(g, w * 0.7, 0.28, h * 0.45, 0, 0, h * 0.12, B.m(C.wood, { rough: 0.85 })); // pallet deck (items sit at 0.3)
    for (const sz of [-1, 0, 1]) B.box(g, w * 0.7, 0.1, 0.08, 0, 0, h * 0.12 + sz * h * 0.18, B.m(C.darkWood), false);
    if (b.type === 'batch') { B.cyl(g, 0.05, 2.0, w * 0.42, 0, h * 0.35, B.m(C.darkSteel, { metal: 0.6 })); B.cyl(g, 0.12, 0.25, w * 0.42, 1.2, h * 0.35, B.m('#e5e7eb', { opacity: 0.85 })); top = 2.1; }
  } else if (b.type === 'assign') {
    B.box(g, 0.34, 0.2, 0.3, 0, 1.18, cz, B.m(C.frame)); // label printer
    B.box(g, 0.2, 0.02, 0.08, 0, 1.3, cz + 0.16, B.m('#ffffff'));
    top = 1.45;
  } else if (b.type === 'delay') {
    B.arrow(g, Math.min(1.2, w * 0.5), 0, h * 0.12, 0, 0.012, B.m('#ffffff', { offset: 3, opacity: 0.8 }));
    const l = B.statusLight(g, 0.22, 1.18, cz);
    live = (st) => l.set(st ? (st.contents > 0 ? STATE_COLORS.busy : STATE_COLORS.idle) : null);
    top = 1.9;
  } else if (b.type === 'seize' || b.type === 'release') {
    B.cyl(g, 0.05, 1.0, w * 0.35, 0, h * 0.3, B.m(C.darkSteel, { metal: 0.6 }));
    B.sphere(g, 0.09, w * 0.35, 1.05, h * 0.3, B.m(b.type === 'seize' ? '#9333ea' : '#a855f7', { rough: 0.4 }));
  }
  return { top, live };
}

function gate(B, g, b, w, h) {
  const post = B.m('#e5e7eb', { rough: 0.5 });
  B.box(g, 0.32, 1.05, 0.32, 0, 0, -h / 2 + 0.16, post);
  B.box(g, 0.34, 0.08, 0.34, 0, 1.05, -h / 2 + 0.16, B.m('#dc2626'));
  B.box(g, 0.08, 0.6, 0.08, 0, 0, h / 2 - 0.05, post); // arm rest
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.9, -h / 2 + 0.16);
  pivot.userData.live = true;
  g.add(pivot);
  const len = h - 0.15; const n = Math.max(3, Math.round(len / 0.4));
  for (let i = 0; i < n; i++) B.box(pivot, 0.07, 0.07, len / n, 0, -0.035, (len * (i + 0.5)) / n, B.m(i % 2 ? '#ffffff' : '#dc2626', { rough: 0.5 }));
  B.rects(g, [[-0.08, -h / 2, 0.08, h / 2]], 0.01, B.m(C.paint, { offset: 2 })); // stop line
  const l = B.lamp(g, 0.06, 0.08, 0, 1.13, -h / 2 + 0.16);
  let angle = 0;
  const mode = b.props?.mode;
  const setArm = (open) => {
    const target = open ? 1.45 : 0;
    angle += (target - angle) * 0.25;
    if (Math.abs(target - angle) < 0.01) angle = target;
    pivot.rotation.x = -angle;
  };
  angle = mode === 'open' ? 1.45 : 0; pivot.rotation.x = -angle;
  return {
    top: 1.6,
    live: (st) => {
      if (!st) { l.set(null); angle = mode === 'open' ? 1.45 : 0; pivot.rotation.x = -angle; return; }
      setArm(Boolean(st.open)); l.set(st.open ? '#22c55e' : '#ef4444');
    },
  };
}

function combine(B, g, b, w, h) {
  // Input buffer shelves (items wait at z = 0.4) and an assembly table (z = 0.8).
  B.box(g, w * 0.28, 0.36, h * 0.86, -w * 0.33, 0, 0, B.m('#6b7280', { metal: 0.3 }));
  B.box(g, w * 0.3, 0.04, h * 0.88, -w * 0.33, 0.36, 0, B.m(C.steel, { metal: 0.5 }));
  table(B, g, w * 0.52, h * 0.6, w * 0.18, 0, 0.78, '#0d9488', C.darkSteel);
  B.box(g, w * 0.2, 0.08, h * 0.25, w * 0.18, 0.78, 0, B.m(C.darkSteel, { metal: 0.6 })); // jig
  const fr = B.m(C.steel, { metal: 0.5 });
  for (const sx of [-1, 1]) B.box(g, 0.05, 1.2, 0.05, w * 0.18 + sx * w * 0.24, 0.78, -h * 0.28, fr);
  B.box(g, w * 0.52, 0.05, 0.05, w * 0.18, 1.98, -h * 0.28, fr);
  B.cyl(g, 0.02, 0.4, w * 0.18, 1.58, -h * 0.18, B.m(C.black)); // tool on a balancer
  B.cyl(g, 0.05, 0.18, w * 0.18, 1.4, -h * 0.18, B.m('#f59e0b'));
  const light = B.statusLight(g, w / 2 - 0.15, 0.82, -h / 2 + 0.15);
  return { top: 2.2, live: (st) => light.set(stateColor(st)) };
}

// ───────────────────────── material handling

function localPath(b) { return pathPoints(b).map(([x, y]) => [x - b.x, y - b.y]); }

function conveyor(B, g, b) {
  const pts = localPath(b);
  const W = Math.max(0.2, num(b.props?.width, 0.8));
  const top = 0.84;
  const belt = B.m(C.rubber, { rough: 0.85 });
  const frame = B.m(C.steel, { metal: 0.6, rough: 0.35 });
  const leg = B.m('#6b7580', { metal: 0.5, rough: 0.45 });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const c = pts[i];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 1e-3) continue;
    const s = new THREE.Group();
    s.position.set((a[0] + c[0]) / 2, 0, (a[1] + c[1]) / 2);
    s.rotation.y = -Math.atan2(c[1] - a[1], c[0] - a[0]);
    g.add(s);
    B.box(s, L, 0.06, W, 0, top - 0.06, 0, belt);
    for (const sz of [-1, 1]) {
      B.box(s, L, 0.16, 0.05, 0, top - 0.13, sz * (W / 2 + 0.025), frame);
      const n = Math.max(1, Math.ceil(L / 1.8));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) B.box(s, 0.06, top - 0.13, 0.06, -L / 2 + (L * k) / n, 0, sz * (W / 2 + 0.02), leg);
    }
    const n = Math.max(1, Math.ceil(L / 1.8));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) B.box(s, 0.05, 0.05, W, -L / 2 + (L * k) / n, 0.18, 0, leg); // cross ties
    if (i === 1) B.cylH(s, 0.07, W + 0.02, -L / 2, top - 0.06, 0, frame, 'z');
    if (i === pts.length - 1) B.cylH(s, 0.07, W + 0.02, L / 2, top - 0.06, 0, frame, 'z');
  }
  for (let i = 1; i < pts.length - 1; i++) B.cyl(g, W / 2, 0.06, pts[i][0], top - 0.06, pts[i][1], belt); // corner discs
  return { top: top + 0.4 };
}

function transporter(B, g, b, w, h) {
  B.paint(g, w, h, 0, 0, 0.005, B.m('#4b5563', { rough: 0.9, offset: 1 }));
  const t = 0.14;
  B.rects(g, frameRects(0, 0, w, h, t), 0.01, B.m(C.safety, { offset: 2 }));
  const blacks = []; // hazard stripes along the long edges
  for (let x = -w / 2 + 0.15; x < w / 2 - 0.25; x += 0.4) { blacks.push([x, -h / 2, x + 0.14, -h / 2 + t]); blacks.push([x, h / 2 - t, x + 0.14, h / 2]); }
  B.rects(g, blacks, 0.012, B.m(C.black, { offset: 3 }));
  const kind = b.props?.vehicle || 'agv';
  if (kind === 'drone') {
    B.rects(g, [[-0.6, -0.5, -0.4, 0.5], [0.4, -0.5, 0.6, 0.5], [-0.4, -0.08, 0.4, 0.08]], 0.012, B.m('#ffffff', { offset: 3 })); // "H"
  }
  // Charger at the back edge.
  B.box(g, 0.55, 1.25, 0.3, w / 2 - 0.45, 0, -h / 2 + 0.2, B.m('#e5e7eb', { rough: 0.5 }));
  B.box(g, 0.57, 0.1, 0.32, w / 2 - 0.45, 1.25, -h / 2 + 0.2, B.m('#ea580c'));
  const l = B.lamp(g, 0.04, 0.03, w / 2 - 0.45, 0.95, -h / 2 + 0.36);
  l.mesh.rotation.x = Math.PI / 2;
  return { top: 1.6, live: (st) => l.set(st ? '#22c55e' : null) };
}

function robotBlock(B, g, b, w, h) {
  B.box(g, w * 0.9, 0.05, h * 0.9, 0, 0, 0, B.m('#9ca3af', { rough: 0.85 }), false);
  const reach = Math.min(1.5, Math.max(0.8, num(b.props?.reach, 2.5) * 0.45));
  const turret = robotArm(B, g, 0, 0, reach, '#0284c7');
  const post = B.m(C.yellow, { rough: 0.5 });
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) B.box(g, 0.06, 1.1, 0.06, sx * (w / 2 - 0.05), 0, sz * (h / 2 - 0.05), post);
    B.box(g, w - 0.1, 0.05, 0.04, 0, 1.0, sz * (h / 2 - 0.05), post);
    B.box(g, w - 0.1, 0.05, 0.04, 0, 0.5, sz * (h / 2 - 0.05), post);
  }
  const light = B.statusLight(g, w / 2 - 0.05, 1.1, -h / 2 + 0.05);
  return { top: 2.2, live: (st) => { light.set(stateColor(st)); spin(turret, st); } };
}

// ───────────────────────── warehouse

function rack(B, g, b, w, h) {
  const bays = Math.max(1, Math.round(num(b.props?.bays, 6)));
  const levels = Math.max(1, Math.round(num(b.props?.levels, 4)));
  const H = 0.25 + levels * 1.0;
  const up = B.m(C.rack, { metal: 0.4, rough: 0.45 });
  const beam = B.m(C.orange, { metal: 0.3, rough: 0.45 });
  const deck = B.m('#b9c0c7', { metal: 0.5, rough: 0.5 });
  const brace = B.m('#3b6db0', { metal: 0.4, rough: 0.5 });
  const D = Math.max(0.6, h - 0.1); const bw = w / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + i * bw;
    for (const sz of [-1, 1]) B.box(g, 0.08, H, 0.08, x, 0, sz * D / 2, up);
    for (let k = 0; k < levels; k++) {
      const m = B.box(g, 0.03, 0.03, Math.hypot(D, 1.0), x, 0.25 + k * 1.0 + 0.5 - 0.015, 0, brace, false);
      m.rotation.x = (k % 2 ? 1 : -1) * Math.atan2(1.0, D);
    }
    B.box(g, 0.04, 0.04, D, x, 0.12, 0, brace, false);
    B.box(g, 0.04, 0.04, D, x, H - 0.1, 0, brace, false);
  }
  for (let k = 0; k < levels; k++) {
    const y = 0.15 + k * 1.0;
    for (const sz of [-1, 1]) B.box(g, w, 0.1, 0.05, 0, Math.max(0, y - 0.1), sz * (D / 2 - 0.06), beam);
    if (k > 0) B.box(g, w - 0.04, 0.02, D - 0.14, 0, y - 0.02, 0, deck, false);
  }
  // End guards and a painted footprint.
  for (const sx of [-1, 1]) B.box(g, 0.12, 0.4, D + 0.1, sx * (w / 2 + 0.1), 0, 0, B.m(C.yellow, { rough: 0.5 }));
  B.rects(g, frameRects(0, 0, w + 0.3, h + 0.1, 0.08), 0.01, B.m(C.yellow, { offset: 2 }));
  return { top: H + 0.3 };
}

function dock(B, g, b, w, h) {
  const n = Math.max(1, Math.round(num(b.props?.doors, 2)));
  const pitch = w / n; const dw = Math.min(3.0, pitch * 0.72); const dh = 3.0;
  B.box(g, w + 0.4, dh + 1.0, 0.3, 0, 0, -h / 2 + 0.15, B.m(C.concrete, { rough: 0.9 }));
  B.box(g, w + 0.4, 0.2, 0.32, 0, dh + 0.8, -h / 2 + 0.15, B.m('#6b7280'));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pitch * (i + 0.5);
    const sub = new THREE.Group();
    sub.position.set(x, 0, -h / 2 + 0.31);
    g.add(sub);
    B.box(sub, dw + 0.24, dh + 0.12, 0.04, 0, 0, 0.02, B.m(C.frame, { metal: 0.4 }));
    B.box(sub, dw, dh * 0.7, 0.05, 0, dh * 0.3, 0.06, B.m('#a9b4bf', { metal: 0.3, rough: 0.5 }));
    B.box(sub, dw, dh * 0.3, 0.02, 0, 0, 0.03, B.m('#111418', { rough: 1 }));
    for (let k = 0; k < 7; k++) B.box(sub, dw, 0.025, 0.02, 0, dh * 0.34 + k * dh * 0.09, 0.09, B.m('#8c97a3', { metal: 0.3 }), false);
    B.box(sub, dw + 0.5, 0.35, 0.6, 0, dh + 0.05, 0.28, B.m(C.darkSteel));
    for (const sx of [-1, 1]) B.box(sub, 0.2, 0.45, 0.16, sx * (dw / 2 + 0.2), 0.2, 0.1, B.m(C.black, { rough: 0.9 }));
    // Dock leveller plate with yellow edges in front of the door.
    const lev = Math.min(1.4, h * 0.45);
    B.box(sub, dw * 0.85, 0.04, lev, 0, 0, lev / 2 + 0.05, B.m(C.darkSteel, { metal: 0.5 }), false);
    B.rects(sub, [[-dw * 0.425, 0.05, -dw * 0.425 + 0.08, lev + 0.05], [dw * 0.425 - 0.08, 0.05, dw * 0.425, lev + 0.05]], 0.045, B.m(C.yellow, { offset: 2 }));
  }
  B.rects(g, frameRects(0, 0, w, h, 0.08), 0.01, B.m(C.yellow, { offset: 2 }));
  const light = B.statusLight(g, w / 2 - 0.1, dh + 1.0, -h / 2 + 0.15);
  return { top: dh + 1.7, live: (st) => light.set(stateColor(st) ?? (st ? (st.contents > 0 ? STATE_COLORS.busy : STATE_COLORS.idle) : null)) };
}

// ───────────────────────── traffic

function road(B, g, b) {
  const pts = localPath(b);
  const lanes = Math.max(1, Math.round(num(b.props?.lanes, 2)));
  const W = lanes * 3.5; const hw = W / 2;
  B.quads(g, ribbonQuads(pts, 0, hw + 0.5), 0.004, B.m('#8d9096', { rough: 0.95, offset: 1 })); // kerb band
  B.quads(g, ribbonQuads(pts, 0, hw), 0.008, B.m(C.asphalt, { rough: 0.95, offset: 2 }));
  const line = B.m('#f5f5f4', { rough: 0.6, offset: 3 });
  B.quads(g, [...ribbonQuads(pts, hw - 0.25, 0.07), ...ribbonQuads(pts, -hw + 0.25, 0.07)], 0.012, line);
  const dashes = [];
  for (let k = 1; k < lanes; k++) dashes.push(...dashQuads(pts, -hw + k * 3.5, 0.07, 3, 4.5));
  B.quads(g, dashes, 0.012, line);
  // Direction arrows near the end of each lane.
  const n = pts.length; const a = pts[n - 2]; const c = pts[n - 1];
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; const dx = (c[0] - a[0]) / L; const dz = (c[1] - a[1]) / L;
  if (L > 6) for (let k = 0; k < lanes; k++) {
    const off = -hw + (k + 0.5) * 3.5; const back = Math.min(8, L * 0.4);
    B.arrow(g, 2.2, c[0] - dx * back - dz * off, c[1] - dz * back + dx * off, Math.atan2(dz, dx), 0.013, B.m('#f5f5f4', { offset: 4, opacity: 0.85 }));
  }
  return { top: 1.0 };
}

function signal(B, g, b, w, h) {
  const pole = B.m('#4b5563', { metal: 0.6, rough: 0.4 });
  const pz = -h / 2 + 0.15;
  B.cyl(g, 0.07, 3.4, 0, 0, pz, pole);
  B.cyl(g, 0.18, 0.08, 0, 0, pz, pole);
  B.box(g, 0.32, 0.95, 0.32, 0, 3.4, pz, B.m('#1f2937', { rough: 0.5 }));
  const lamps = [];
  const cols = ['#ef4444', '#facc15', '#22c55e'];
  for (let i = 0; i < 3; i++) {
    const y = 4.12 - i * 0.29;
    for (const sx of [-1, 1]) {
      const l = B.lamp(g, 0.09, 0.04, sx * 0.17, y - 0.09, pz);
      l.mesh.rotation.z = Math.PI / 2; l.mesh.position.set(sx * 0.17, y, pz);
      lamps.push([i, l]);
      B.box(g, 0.12, 0.03, 0.22, sx * 0.22, y + 0.12, pz, B.m(C.black), false); // visor
    }
  }
  B.rects(g, [[w / 2 - 0.25, -h / 2, w / 2 - 0.05, h / 2]], 0.014, B.m(C.paint, { offset: 4 })); // stop line
  const set = (phase) => { for (const [i, l] of lamps) l.set(phase && ['red', 'yellow', 'green'][i] === phase ? cols[i] : null); };
  set(null);
  return { top: 4.6, live: (st) => set(st ? st.phase ?? (st.open ? 'green' : 'red') : null) };
}

function parking(B, g, b, w, h) {
  B.paint(g, w, h, 0, 0, 0.006, B.m(C.asphalt, { rough: 0.95, offset: 1 }));
  const cap = Math.max(1, Math.round(num(b.props?.spaces, 20)));
  const cols = Math.max(1, Math.round(Math.sqrt(cap * (w / Math.max(1, h)) / 1.8)));
  const rows = Math.ceil(cap / cols);
  const lines = []; const t = Math.min(0.12, (w / cols) * 0.06);
  for (let r = 0; r < rows; r++) {
    const zc = -h / 2 + (h * (r + 0.5)) / rows; const rh = (h / rows) * 0.42;
    const inRow = Math.min(cols, cap - r * cols);
    for (let c = 0; c <= inRow; c++) { const x = -w / 2 + (w * c) / cols; lines.push([x - t / 2, zc - rh, x + t / 2, zc + rh]); }
  }
  lines.push(...frameRects(0, 0, w, h, 0.12));
  B.rects(g, lines, 0.012, B.m(C.paint, { offset: 2, rough: 0.6 }));
  // A "P" sign post at a corner.
  B.cyl(g, 0.04, 2.2, -w / 2 - 0.3, 0, -h / 2 - 0.3, B.m('#6b7280', { metal: 0.5 }));
  B.box(g, 0.6, 0.6, 0.05, -w / 2 - 0.3, 2.2, -h / 2 - 0.3, B.m('#1d4ed8'));
  return { top: 3.2 };
}

// ───────────────────────── system dynamics

function stock(B, g, b, w, h) {
  const R = Math.max(0.3, Math.min(w, h) * 0.42); const H = 2.6;
  const color = BLOCK_TYPES.stock.color;
  B.box(g, R * 2.2, 0.15, R * 2.2, 0, 0, 0, B.m('#9ca3af', { rough: 0.9 }));
  const liquidMat = B.own(new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.88 }));
  const liquid = new THREE.Mesh(B.kit.cyl, liquidMat);
  liquid.userData.live = true;
  g.add(liquid);
  const shell = B.cyl(g, R, H, 0, 0.15, 0, B.m('#dbeafe', { opacity: 0.22, rough: 0.05, metal: 0.1 }));
  shell.castShadow = false; shell.renderOrder = 2;
  const ring = B.m(C.steel, { metal: 0.7, rough: 0.3 });
  for (const y of [0.15, 0.15 + H]) { const t = new THREE.Mesh(B.kit.torus, ring); t.rotation.x = Math.PI / 2; t.scale.setScalar(R * 2); t.position.y = y; g.add(t); }
  B.cyl(g, R * 0.3, 0.2, 0, 0.15 + H, 0, ring);
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; B.box(g, 0.06, 0.15, 0.06, Math.cos(a) * R * 0.9, 0, Math.sin(a) * R * 0.9, ring); }
  let max = 1;
  const setLevel = (f) => {
    const lv = Math.max(0, Math.min(1, f));
    liquid.visible = lv > 0.002;
    liquid.scale.set(R * 1.9, Math.max(1e-3, H * lv), R * 1.9);
    liquid.position.y = 0.16 + (H * lv) / 2;
  };
  setLevel(0.5);
  return {
    top: H + 0.6,
    live: (st) => {
      if (!st) { max = 1; setLevel(0.5); return; }
      const v = Math.abs(num(st.value, 0));
      if (v > max) max = v;
      setLevel(v / max);
    },
  };
}

function flow(B, g, b, w, h) {
  const pipe = B.m('#38bdf8', { metal: 0.4, rough: 0.35 });
  const L = w; const y = 0.7;
  B.cylH(g, 0.1, L, 0, y, 0, pipe, 'x');
  for (const sx of [-1, 1]) {
    B.cylH(g, 0.14, 0.06, sx * (L / 2 - 0.05), y, 0, B.m(C.steel, { metal: 0.7 }), 'x'); // flanges
    B.box(g, 0.08, y - 0.1, 0.25, sx * L * 0.33, 0, 0, B.m(C.darkSteel)); // supports
  }
  B.box(g, 0.32, 0.3, 0.28, 0, y - 0.15, 0, B.m('#0369a1', { metal: 0.3 })); // valve body
  B.cyl(g, 0.03, 0.3, 0, y + 0.15, 0, B.m(C.steel, { metal: 0.7 }));
  const wheel = new THREE.Mesh(B.kit.torus, B.m('#dc2626', { rough: 0.5 }));
  wheel.rotation.x = Math.PI / 2; wheel.scale.setScalar(0.36); wheel.position.y = y + 0.46; g.add(wheel);
  B.arrow(g, Math.min(1.2, L * 0.4), 0, h * 0.3, 0, 0.012, B.m('#0ea5e9', { offset: 3 }));
  return { top: y + 0.9 };
}

function infoPillar(B, g, b, w, h) {
  const color = BLOCK_TYPES[b.type]?.color ?? '#8b5cf6';
  B.cyl(g, 0.22, 0.06, 0, 0, 0, B.m(C.darkSteel, { metal: 0.5 }));
  B.cyl(g, 0.05, 1.1, 0, 0.06, 0, B.m(C.steel, { metal: 0.6 }));
  const sw = Math.min(1.4, w * 0.6); const sh = sw * 0.5;
  B.box(g, sw + 0.08, sh + 0.08, 0.08, 0, 1.12, 0, B.m(color, { rough: 0.45 }));
  const draw = B.screen(g, sw, sh, 0, 1.16 + sh / 2, 0.045, color);
  const unit = b.props?.unitLabel ?? '';
  draw(b.name, '—', unit);
  return { top: 1.3 + sh, live: (st) => draw(b.name, st ? fmt(num(st.value, NaN), 2) : '—', unit) };
}

function population(B, g, b, w, h) {
  B.paint(g, w, h, 0, 0, 0.004, B.m('#b7d3b0', { rough: 0.95, offset: 1, opacity: 0.6 }));
  B.rects(g, frameRects(0, 0, w, h, 0.1), 0.01, B.m('#059669', { offset: 2 }));
  // A low fence (posts + two rails) around the area.
  const post = B.m('#6b7280', { metal: 0.5, rough: 0.4 });
  const rail = B.m('#9ca3af', { metal: 0.5, rough: 0.4 });
  const per = 2 * (w + h); const step = Math.max(2.5, per / 160);
  const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]; const c = corners[(i + 1) % 4];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]); const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) { const f = k / n; B.box(g, 0.06, 0.9, 0.06, a[0] + (c[0] - a[0]) * f, 0, a[1] + (c[1] - a[1]) * f, post); }
    B.seg(g, a, c, 0.04, 0.05, 0.85, rail);
    B.seg(g, a, c, 0.04, 0.05, 0.45, rail);
  }
  return { top: 1.4 };
}

// ───────────────────────── layout

function zone(B, g, b, w, h) {
  const fill = b.props?.fill || '#cbd5e1';
  const op = Math.max(0, Math.min(1, num(b.props?.opacity, 0.35)));
  const rough = { epoxy: 0.3, tile: 0.45, wood: 0.6, grass: 1, asphalt: 0.95 }[b.props?.floor] ?? 0.85;
  if (op > 0.01) B.paint(g, w, h, 0, 0, 0.003, B.m(fill, { opacity: op, rough, offset: 1 }));
  B.rects(g, frameRects(0, 0, w, h, 0.06), 0.006, B.m(fill, { opacity: Math.min(1, op + 0.4), rough, offset: 1 }));
  return { top: 0.3 };
}

function wall(B, g, b) {
  const pts = localPath(b);
  const H = Math.max(0.2, num(b.props?.height, 3)); const T = Math.max(0.05, num(b.props?.thickness, 0.2));
  const mat = B.m('#d6d3cd', { rough: 0.9 });
  const cap = B.m('#a8a29e', { rough: 0.8 });
  for (let i = 1; i < pts.length; i++) {
    B.seg(g, pts[i - 1], pts[i], T, H, 0, mat, T);
    B.seg(g, pts[i - 1], pts[i], T + 0.02, 0.05, H, cap, T + 0.02);
  }
  return { top: H + 0.4 };
}

function label(B, g, b, w) {
  const text = String(b.props?.text ?? '');
  if (!text) return { top: 0.2 };
  const size = Math.max(0.2, num(b.props?.size, 0.8));
  const t = floorTextTexture(text, b.props?.textColor || '#0f172a');
  B.own(t.tex);
  const mat = B.own(new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const m = new THREE.Mesh(B.kit.plane, mat);
  const hh = size * 1.4;
  m.scale.set(hh * t.aspect, 1, hh); m.position.y = 0.02;
  m.renderOrder = 1;
  g.add(m);
  return { top: 0.2 };
}

function display(B, g, b, w, h) {
  const sw = Math.max(0.8, w * 0.92); const sh = Math.min(2.4, Math.max(0.5, sw * 0.42)); const y0 = 1.0;
  const frame = B.m('#1f2937', { rough: 0.4, metal: 0.3 });
  for (const sx of [-1, 1]) B.box(g, 0.08, y0, 0.08, sx * sw * 0.35, 0, 0, B.m(C.steel, { metal: 0.6 }));
  for (const sx of [-1, 1]) B.box(g, 0.5, 0.05, Math.min(h * 0.6, 0.8), sx * sw * 0.35, 0, 0, frame);
  B.box(g, sw + 0.12, sh + 0.12, 0.1, 0, y0, 0, frame);
  const front = B.screen(g, sw, sh, 0, y0 + 0.06 + sh / 2, 0.055, '#2dd4bf');
  const back = B.screen(g, sw, sh, 0, y0 + 0.06 + sh / 2, -0.055, '#2dd4bf');
  g.children[g.children.length - 1].rotation.y = Math.PI;
  const digits = Math.max(0, Math.min(6, Math.round(num(b.props?.digits, 1))));
  const unit = b.props?.unitLabel ?? '';
  const draw = (v) => { front(b.name, v, unit); back(b.name, v, unit); };
  draw('—');
  return { top: y0 + sh + 0.5, live: (st) => draw(st ? fmt(num(st.value, NaN), digits) : '—') };
}

function chart(B, g, b, w, h) {
  const bw = Math.max(1, w * 0.95); const bh = Math.min(4, bw * 0.5); const y0 = 1.4;
  const post = B.m('#4b5563', { metal: 0.5, rough: 0.4 });
  for (const sx of [-1, 1]) B.box(g, 0.14, y0 + bh, 0.14, sx * bw * 0.4, 0, 0, post);
  B.box(g, bw + 0.2, bh + 0.2, 0.12, 0, y0 - 0.1, 0, B.m('#1f2937', { rough: 0.5 }));
  const tex = B.own(chartTexture(bw / bh, BLOCK_TYPES.chart.color));
  const mat = B.own(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const m = new THREE.Mesh(B.kit.vplane, mat);
  m.scale.set(bw, bh, 1); m.position.set(0, y0 + bh / 2, 0.065);
  g.add(m);
  return { top: y0 + bh + 0.5 };
}

/** Looks without a model of their own borrow the closest one. */
const LOOK_ALIAS = {
  lathe: 'machine', mill: 'cnc', injection: 'press', dryer: 'oven', assembly: 'workstation', kitting: 'workstation', test: 'inspection',
  labeler: 'packing', welder: 'robot', laser: 'cnc', saw: 'machine', grinder: 'machine', printer: 'cnc', lift: 'machine', turntable: 'workstation',
  turnstile: 'scanner', elevator: 'machine', toll: 'checkout', fuel: 'checkout', platform: 'desk',
};

/** Rail track: sleepers and two steel rails along the path. */
function railTrack(B, g, b) {
  const pts = localPath(b);
  const sleeper = B.m('#6b4f3a', { rough: 0.9 }); const steel = B.m('#9aa4ae', { metal: 0.8, rough: 0.3 });
  B.quads(g, ribbonQuads(pts, 0, 1.6), 0.004, B.m('#8b8378', { rough: 1, offset: 1 }));
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1]; const [x1, z1] = pts[i]; const L = Math.hypot(x1 - x0, z1 - z0); const nx = -(z1 - z0) / (L || 1); const nz = (x1 - x0) / (L || 1);
    for (let s2 = 0.3; s2 < L; s2 += 0.7) { const x = x0 + ((x1 - x0) * s2) / L; const z = z0 + ((z1 - z0) * s2) / L; B.seg(g, [x - nx * 1.2, z - nz * 1.2], [x + nx * 1.2, z + nz * 1.2], 0.22, 0.12, 0, sleeper); }
    for (const off of [-0.72, 0.72]) B.seg(g, [x0 + nx * off, z0 + nz * off], [x1 + nx * off, z1 + nz * off], 0.07, 0.14, 0.12, steel);
  }
  return { top: 0.8 };
}

/** A cellular grid: a plane whose canvas shows the cells' states while running. */
function cellGrid(B, g, b, w, h) {
  const cols = Math.max(2, Math.round(num(b.props?.cols, 20))); const rows = Math.max(2, Math.round(num(b.props?.rows, 20)));
  const canvas = document.createElement('canvas'); canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const tex = B.own(new THREE.CanvasTexture(canvas)); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = B.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  const plane = new THREE.Mesh(B.own(new THREE.PlaneGeometry(w, h)), mat);
  plane.rotation.x = -Math.PI / 2; plane.position.y = 0.02; plane.receiveShadow = true; plane.userData.live = true;
  g.add(plane);
  const states = b.props?.states ?? [];
  const idle = () => { ctx.fillStyle = states[0]?.color ?? '#cbd5e1'; ctx.fillRect(0, 0, cols, rows); tex.needsUpdate = true; };
  idle();
  B.rects(g, frameRects(0, 0, w, h, 0.08), 0.03, B.m('#15803d', { offset: 2 }));
  let last = null;
  return {
    top: 0.6,
    live: (st) => {
      if (!st?.cells) { if (last) { idle(); last = null; } return; }
      if (st.generation === last) return;
      last = st.generation;
      const img = ctx.createImageData(cols, rows);
      const rgb = states.map((s) => new THREE.Color(s.color));
      for (let i = 0; i < st.cells.length; i++) { const c = rgb[st.cells[i]] ?? rgb[0]; img.data[i * 4] = c.r * 255; img.data[i * 4 + 1] = c.g * 255; img.data[i * 4 + 2] = c.b * 255; img.data[i * 4 + 3] = 255; }
      ctx.putImageData(img, 0, 0); tex.needsUpdate = true;
    },
  };
}

function pillar(B, g, b, w, h) { const H = num(b.props?.height, 6); B.box(g, w, H, h, 0, 0, 0, B.m('#a8a29e', { rough: 0.85 })); B.rects(g, frameRects(0, 0, w + 0.2, h + 0.2, 0.08), 0.01, B.m(C.yellow, { offset: 2 })); return { top: H + 0.3 }; }
function door(B, g, b, w, h) {
  const H = num(b.props?.height, 3.5);
  const frame = B.m(C.frame, { metal: 0.4 });
  B.box(g, 0.15, H, h, -w / 2, 0, 0, frame); B.box(g, 0.15, H, h, w / 2, 0, 0, frame); B.box(g, w + 0.3, 0.2, h, 0, H, 0, frame);
  for (let i = 0; i < 8; i++) B.box(g, w, H / 8 - 0.02, 0.04, 0, H * 0.45 + i * (H * 0.55) / 8, 0, B.m('#a9b4bf', { metal: 0.3, rough: 0.5 }), false);
  return { top: H + 0.4 };
}
function tree(B, g, b, w, h) {
  const H = num(b.props?.height, 6); const r = Math.min(w, h) / 2;
  B.cyl(g, r * 0.08, H * 0.45, 0, 0, 0, B.m('#78350f', { rough: 0.9 }));
  B.sphere(g, r * 0.9, 0, H * 0.6, 0, B.m('#15803d', { rough: 0.9 }));
  B.sphere(g, r * 0.6, r * 0.3, H * 0.82, r * 0.1, B.m('#16a34a', { rough: 0.9 }));
  return { top: H + 0.3 };
}

const BUILDERS = {
  railTrack, cellGrid, pillar, door, tree,
  source: (B, g, b, w, h) => source(B, g, b, w, h, true),
  sink: (B, g, b, w, h) => source(B, g, b, w, h, false),
  queue, process: processBlock, resourcePool, gate, combine,
  seize: genericStation, release: genericStation, select: genericStation, assign: genericStation,
  delay: genericStation, batch: genericStation, unbatch: genericStation,
  conveyor, transporter, robot: robotBlock,
  rack, dock,
  road, signal, parking,
  stock, flow, variable: infoPillar, parameter: infoPillar,
  population,
  zone, wall, label, display, chart,
};
