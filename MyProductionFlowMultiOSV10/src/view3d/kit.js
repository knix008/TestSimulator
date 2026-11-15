// Shared 3D resources: unit primitives, a material cache, flat-quad geometry
// builders (painted floor lines, road ribbons) and canvas textures (labels,
// screens). Everything here is reused by every block, so a rebuild only
// creates the few geometries / textures that are unique to a block.
import * as THREE from 'three';

export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export class Kit {
  constructor() {
    const mark = (g) => { g.userData.kit = true; return g; };
    this.box = mark(new THREE.BoxGeometry(1, 1, 1));
    this.cyl = mark(new THREE.CylinderGeometry(0.5, 0.5, 1, 24));
    this.cylLow = mark(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
    this.cone = mark(new THREE.CylinderGeometry(0.25, 0.5, 1, 20));
    this.sphere = mark(new THREE.SphereGeometry(0.5, 20, 14));
    this.torus = mark(new THREE.TorusGeometry(0.5, 0.07, 8, 28));
    this.plane = mark(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)); // flat, facing up
    this.vplane = mark(new THREE.PlaneGeometry(1, 1)); // standing, facing +z
    this.arrow = mark(arrowGeometry());
    this.mats = new Map();
  }

  /** A cached MeshStandardMaterial. o: { rough, metal, opacity, emissive, ei, offset, side, basic }. */
  mat(color, o = {}) {
    const opacity = o.opacity ?? 1;
    const key = `${color}|${o.rough ?? 0.65}|${o.metal ?? 0.05}|${opacity}|${o.emissive ?? 0}|${o.ei ?? 1}|${o.offset ?? 0}|${o.side ?? 0}|${o.basic ? 1 : 0}`;
    let m = this.mats.get(key);
    if (!m) {
      const common = {
        color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: o.side ?? THREE.FrontSide,
        polygonOffset: Boolean(o.offset), polygonOffsetFactor: -(o.offset ?? 0), polygonOffsetUnits: -(o.offset ?? 0),
      };
      m = o.basic ? new THREE.MeshBasicMaterial({ ...common, toneMapped: false })
        : new THREE.MeshStandardMaterial({ ...common, roughness: o.rough ?? 0.65, metalness: o.metal ?? 0.05, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
      this.mats.set(key, m);
    }
    return m;
  }

  dispose() {
    for (const g of [this.box, this.cyl, this.cylLow, this.cone, this.sphere, this.torus, this.plane, this.vplane, this.arrow]) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

/** A floor arrow pointing +x, 1 m long, lying flat. */
function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.12); s.lineTo(0.1, -0.12); s.lineTo(0.1, -0.3); s.lineTo(0.5, 0);
  s.lineTo(0.1, 0.3); s.lineTo(0.1, 0.12); s.lineTo(-0.5, 0.12); s.closePath();
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
}

// ───────────────────────── flat quads

/**
 * One geometry from many flat quads at height y. Each quad is
 * [a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z]: a = left edge (start → end), b = right edge.
 */
export function quadGeometry(quads, y = 0) {
  const pos = new Float32Array(quads.length * 12);
  const nrm = new Float32Array(quads.length * 12);
  const uv = new Float32Array(quads.length * 8);
  const idx = [];
  quads.forEach((q, i) => {
    const o = i * 12;
    pos.set([q[0], y, q[1], q[2], y, q[3], q[4], y, q[5], q[6], y, q[7]], o);
    for (let k = 0; k < 4; k++) nrm[o + k * 3 + 1] = 1;
    uv.set([0, 1, 1, 1, 0, 0, 1, 0], i * 8);
    const v = i * 4; // a0 a1 b0 b1 → (a0, a1, b0), (b0, a1, b1): both face up
    idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Axis-aligned rectangle [x0, z0, x1, z1] as a quad. */
export const rectQuad = ([x0, z0, x1, z1]) => [x0, z1, x1, z1, x0, z0, x1, z0];

/** The four sides of a rectangle outline (centre cx, cz, size w × d, line width t). */
export function frameRects(cx, cz, w, d, t) {
  const x0 = cx - w / 2; const x1 = cx + w / 2; const z0 = cz - d / 2; const z1 = cz + d / 2;
  return [[x0, z0, x1, z0 + t], [x0, z1 - t, x1, z1], [x0, z0 + t, x0 + t, z1 - t], [x1 - t, z0 + t, x1, z1 - t]];
}

/** Quads of a band following a polyline at a lateral offset (mitred corners). pts: [[x, z], …]. */
export function ribbonQuads(pts, offset, half) {
  const n = pts.length;
  if (n < 2) return [];
  const dirs = [];
  for (let i = 1; i < n; i++) { const dx = pts[i][0] - pts[i - 1][0]; const dz = pts[i][1] - pts[i - 1][1]; const l = Math.hypot(dx, dz) || 1; dirs.push([dx / l, dz / l]); }
  const miter = (i) => {
    const a = dirs[Math.max(0, i - 1)]; const b = dirs[Math.min(dirs.length - 1, i)];
    let tx = a[0] + b[0]; let tz = a[1] + b[1]; const l = Math.hypot(tx, tz);
    if (l < 1e-6) { tx = b[0]; tz = b[1]; } else { tx /= l; tz /= l; }
    const nx = -tz; const nz = tx; // left normal
    const k = Math.max(0.35, nx * -a[1] + nz * a[0]);
    return [nx / k, nz / k];
  };
  const ms = pts.map((_, i) => miter(i));
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i]; const q = pts[i + 1]; const m0 = ms[i]; const m1 = ms[i + 1];
    const L = offset + half; const R = offset - half;
    out.push([p[0] + m0[0] * L, p[1] + m0[1] * L, q[0] + m1[0] * L, q[1] + m1[1] * L, p[0] + m0[0] * R, p[1] + m0[1] * R, q[0] + m1[0] * R, q[1] + m1[1] * R]);
  }
  return out;
}

/** Quads of a dashed line along a polyline (dash and gap lengths in metres). */
export function dashQuads(pts, offset, half, dash, gap) {
  const out = [];
  let phase = 0; // distance into the current dash+gap period
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1]; const [x1, z1] = pts[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-6) continue;
    const dx = (x1 - x0) / L; const dz = (z1 - z0) / L; const nx = -dz; const nz = dx;
    let s = 0;
    while (s < L) {
      const period = dash + gap;
      const inDash = phase < dash;
      const step = Math.min(L - s, inDash ? dash - phase : period - phase);
      if (inDash && step > 0.05) {
        const a = s; const b = s + step;
        const at = (t, o) => [x0 + dx * t + nx * o, z0 + dz * t + nz * o];
        const a0 = at(a, offset + half); const a1 = at(b, offset + half); const b0 = at(a, offset - half); const b1 = at(b, offset - half);
        out.push([...a0, ...a1, ...b0, ...b1]);
      }
      s += step; phase = (phase + step) % (dash + gap);
    }
  }
  return out;
}

// ───────────────────────── canvas textures

const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

const FONT = '"Segoe UI", system-ui, -apple-system, "Noto Sans KR", sans-serif';

/** A name tag: white text on a dark rounded plate. Returns { tex, aspect }. */
export function labelTexture(text) {
  const font = `600 44px ${FONT}`;
  const probe = makeCanvas(8, 8).getContext('2d');
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text).width);
  const c = makeCanvas(Math.min(2048, tw + 44), 68);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15, 23, 42, 0.78)';
  roundRect(g, 2, 2, c.width - 4, c.height - 4, 16); g.fill();
  g.font = font; g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, aspect: c.width / c.height };
}

/** Floor text (layout label): coloured text on a transparent background. */
export function floorTextTexture(text, color) {
  const font = `700 96px ${FONT}`;
  const probe = makeCanvas(8, 8).getContext('2d');
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text || ' ').width);
  const c = makeCanvas(Math.min(4096, tw + 48), 136);
  const g = c.getContext('2d');
  g.font = font; g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, aspect: c.width / c.height };
}

/** A live screen: draw(title, value, unit) repaints only when the text changed. */
export function screenTexture(aspect, accent = '#22d3ee') {
  const H = 256; const W = Math.round(Math.max(1, Math.min(4, aspect)) * H);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  let last = null;
  const draw = (title, value, unit = '') => {
    const key = `${title}|${value}|${unit}`;
    if (key === last) return;
    last = key;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#111c30');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; g.fillRect(0, 0, W, 6);
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = '#94a3b8'; g.font = `600 ${Math.round(H * 0.16)}px ${FONT}`;
    g.fillText(String(title).slice(0, 40), H * 0.1, H * 0.1);
    g.fillStyle = '#f8fafc'; g.font = `700 ${Math.round(H * 0.42)}px ${FONT}`;
    g.textBaseline = 'alphabetic';
    const text = String(value);
    let size = H * 0.42;
    while (size > 20 && g.measureText(text).width > W - H * 0.2 - (unit ? H * 0.6 : 0)) { size *= 0.9; g.font = `700 ${Math.round(size)}px ${FONT}`; }
    g.fillText(text, H * 0.1, H * 0.84);
    if (unit) {
      const w = g.measureText(text).width;
      g.fillStyle = accent; g.font = `600 ${Math.round(H * 0.16)}px ${FONT}`;
      g.fillText(String(unit).slice(0, 12), H * 0.14 + w, H * 0.84);
    }
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

/** A static chart board picture (axes, grid and a sample curve in the block colour). */
export function chartTexture(aspect, color) {
  const H = 256; const W = Math.round(Math.max(1, Math.min(4, aspect)) * H);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#f8fafc'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e2e8f0'; g.lineWidth = 2;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(30, (H - 30) * i / 5); g.lineTo(W - 12, (H - 30) * i / 5); g.stroke(); }
  g.strokeStyle = '#64748b'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(30, 12); g.lineTo(30, H - 30); g.lineTo(W - 12, H - 30); g.stroke();
  g.strokeStyle = color; g.lineWidth = 5; g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const x = 30 + (W - 42) * i / 40; const y = H - 40 - (H - 70) * (0.5 + 0.35 * Math.sin(i / 5) * (0.5 + i / 80));
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

/** A tileable concrete speckle used as the floor's colour map (values near white). */
export function concreteTexture() {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < S * S; i++) {
    const v = 228 + Math.floor(rnd() * 27) - (rnd() < 0.02 ? 30 : 0);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Faint slab joints at the tile edge (one tile = 4 m).
  g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, 0, S, 2); g.fillRect(0, 0, 2, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
