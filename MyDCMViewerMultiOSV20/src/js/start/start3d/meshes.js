// Geometry for the 3D start scenes, built on the CPU once per scene.
// Solid meshes are flat-shaded triangles with this vertex layout:
//   position 3, normal 3, colour 3, sway 1, windows 1, root 2   (13 floats)
// `sway` is how much wind moves the vertex (0 at a trunk's foot, 1 at a crown).
// `windows` marks building walls that get lit windows at night.
// `root` is the (x, z) a tree stands on; the shader lifts it onto the terrain.

export const STRIDE = 13;

export function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export class MeshBuilder {
  constructor() {
    this.data = [];
  }

  get count() {
    return this.data.length / STRIDE;
  }

  /** One triangle, counter-clockwise seen from outside. `sway` is per corner or one number. */
  tri(a, b, c, color, { sway = 0, win = 0, root = [0, 0] } = {}) {
    const n = normalize(cross(sub(b, a), sub(c, a)));
    const weights = Array.isArray(sway) ? sway : [sway, sway, sway];
    [a, b, c].forEach((p, i) => {
      this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], color[0], color[1], color[2], weights[i], win, root[0], root[1]);
    });
  }

  quad(a, b, c, d, color, opts) {
    this.tri(a, b, c, color, opts && Array.isArray(opts.sway) ? { ...opts, sway: [opts.sway[0], opts.sway[1], opts.sway[2]] } : opts);
    this.tri(a, c, d, color, opts && Array.isArray(opts.sway) ? { ...opts, sway: [opts.sway[0], opts.sway[2], opts.sway[3]] } : opts);
  }

  floats() {
    return new Float32Array(this.data);
  }
}

function shade(color, rnd, spread = 0.12) {
  const k = 1 - spread + rnd() * spread * 2;
  return color.map((v) => v * k);
}

/** A box standing on `base` (its bottom centre), turned `yaw` radians. No bottom face. */
export function box(b, base, size, color, { yaw = 0, win = 0, root, rnd = Math.random, sway = 0 } = {}) {
  const [cx, cy, cz] = base;
  const [sx, sy, sz] = size.map((v) => v / 2);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
  const top = sy * 2;
  const p = [
    at(-sx, 0, -sz), at(sx, 0, -sz), at(sx, 0, sz), at(-sx, 0, sz),
    at(-sx, top, -sz), at(sx, top, -sz), at(sx, top, sz), at(-sx, top, sz),
  ];
  const opts = { win, root: root ?? [cx, cz], sway };
  b.quad(p[3], p[2], p[6], p[7], shade(color, rnd, 0.06), opts);
  b.quad(p[2], p[1], p[5], p[6], shade(color, rnd, 0.06), opts);
  b.quad(p[1], p[0], p[4], p[5], shade(color, rnd, 0.06), opts);
  b.quad(p[0], p[3], p[7], p[4], shade(color, rnd, 0.06), opts);
  b.quad(p[7], p[6], p[5], p[4], shade(color, rnd, 0.04), { ...opts, win: 0 });
}

/** A cone (or a frustum when `top` > 0) from `base` upward. */
export function cone(b, base, radius, height, segs, color, { top = 0, root, rnd = Math.random, swayFrom = 0, swayTo = 0 } = {}) {
  const [cx, cy, cz] = base;
  const opts = { root: root ?? [cx, cz] };
  const turn = rnd() * Math.PI;
  for (let i = 0; i < segs; i++) {
    const a0 = turn + (i / segs) * Math.PI * 2;
    const a1 = turn + ((i + 1) / segs) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * radius, cy, cz + Math.sin(a0) * radius];
    const p1 = [cx + Math.cos(a1) * radius, cy, cz + Math.sin(a1) * radius];
    const col = shade(color, rnd);
    if (top > 0) {
      const q0 = [cx + Math.cos(a0) * top, cy + height, cz + Math.sin(a0) * top];
      const q1 = [cx + Math.cos(a1) * top, cy + height, cz + Math.sin(a1) * top];
      b.quad(p1, p0, q0, q1, col, { ...opts, sway: [swayFrom, swayFrom, swayTo, swayTo] });
    } else {
      b.tri(p1, p0, [cx, cy + height, cz], col, { ...opts, sway: [swayFrom, swayFrom, swayTo] });
    }
  }
}

/** A tube from p0 to p1 (logs, branches). */
export function tube(b, p0, p1, radius, segs, color, { root, rnd = Math.random } = {}) {
  const axis = normalize(sub(p1, p0));
  const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, helper));
  const v = cross(axis, u);
  const ring = (p, a) => [
    p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * radius,
    p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * radius,
    p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * radius,
  ];
  const opts = { root: root ?? [p0[0], p0[2]] };
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    b.quad(ring(p0, a0), ring(p0, a1), ring(p1, a1), ring(p1, a0), shade(color, rnd), opts);
  }
}

const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(normalize);
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
})();

/** Faces of an icosahedron split `detail` times, as triangles of unit vectors. */
export function sphereFaces(detail = 1) {
  let faces = ICO.f.map(([a, b, c]) => [ICO.v[a], ICO.v[b], ICO.v[c]]);
  for (let d = 0; d < detail; d++) {
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = normalize([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      const bc = normalize([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2]);
      const ca = normalize([(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2]);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = next;
  }
  return faces;
}

/** A lumpy ball of leaves or blossom. Corners keep their lump so the ball stays closed. */
export function blob(b, center, radius, color, { root, rnd = Math.random, sway = 1, squash = 0.85, detail = 1 } = {}) {
  const bumps = new Map();
  const lump = (p) => {
    const key = p.map((v) => v.toFixed(4)).join(',');
    if (!bumps.has(key)) bumps.set(key, 0.82 + rnd() * 0.3);
    const k = bumps.get(key) * radius;
    return [center[0] + p[0] * k, center[1] + p[1] * k * squash, center[2] + p[2] * k];
  };
  const opts = { root: root ?? [center[0], center[2]], sway };
  for (const [p, q, r] of sphereFaces(detail)) b.tri(lump(p), lump(q), lump(r), shade(color, rnd, 0.16), opts);
}

/** A fir: trunk and three stacked cones. `h` is its height; it stands at local y = 0. */
export function pine(b, x, z, h, leaves, trunk, rnd, extra = {}) {
  const root = [x, z];
  cone(b, [x, -0.3, z], h * 0.045, h * 0.3, 5, trunk, { top: h * 0.03, root, rnd, swayFrom: 0, swayTo: 0.05 });
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const y = h * (0.18 + i * 0.22);
    const r = h * (0.3 - i * 0.075);
    const tall = h * (0.42 - i * 0.05);
    const tint = i === tiers - 1 && extra.snow ? extra.snow : leaves;
    cone(b, [x, y, z], r, tall, 7, tint, { root, rnd, swayFrom: y / h, swayTo: Math.min(1, (y + tall) / h) });
  }
}

/** A round tree: trunk and a few leafy balls. */
export function roundTree(b, x, z, h, leaves, trunk, rnd) {
  const root = [x, z];
  cone(b, [x, -0.3, z], h * 0.06, h * 0.55, 5, trunk, { top: h * 0.035, root, rnd, swayFrom: 0, swayTo: 0.4 });
  const balls = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < balls; i++) {
    const a = rnd() * Math.PI * 2;
    const off = i === 0 ? 0 : h * 0.16;
    blob(b, [x + Math.cos(a) * off, h * (0.62 + rnd() * 0.18), z + Math.sin(a) * off], h * (0.24 + rnd() * 0.08), leaves, { root, rnd, sway: 0.8 });
  }
}

/** A cherry tree: a leaning trunk, two branches and pink crowns. */
export function blossomTree(b, x, z, h, petals, trunk, rnd) {
  const root = [x, z];
  const lean = [x + (rnd() - 0.5) * h * 0.15, h * 0.5, z + (rnd() - 0.5) * h * 0.15];
  tube(b, [x, -0.3, z], lean, h * 0.05, 5, trunk, { root, rnd });
  for (let i = 0; i < 2; i++) {
    const a = rnd() * Math.PI * 2;
    const tip = [lean[0] + Math.cos(a) * h * 0.28, h * (0.72 + rnd() * 0.1), lean[2] + Math.sin(a) * h * 0.28];
    tube(b, lean, tip, h * 0.025, 4, trunk, { root, rnd });
    blob(b, tip, h * (0.2 + rnd() * 0.06), petals, { root, rnd, sway: 0.7 });
  }
  blob(b, [lean[0], h * 0.86, lean[2]], h * 0.27, petals, { root, rnd, sway: 0.9 });
}

const SOLIDS = {
  tetra: () => {
    const v = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map(normalize);
    return [[v[0], v[1], v[2]], [v[0], v[3], v[1]], [v[0], v[2], v[3]], [v[1], v[3], v[2]]];
  },
  cube: () => {
    const s = 0.6;
    const p = (x, y, z) => [x * s, y * s, z * s];
    const quads = [
      [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)],
      [p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)], [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)],
      [p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)], [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)],
    ];
    return quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
  },
  octa: () => {
    const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    return [[4, 0, 2], [0, 5, 2], [5, 1, 2], [1, 4, 2], [0, 4, 3], [5, 0, 3], [1, 5, 3], [4, 1, 3]].map((f) => f.map((i) => v[i]));
  },
  ico: () => sphereFaces(0),
  geo: () => sphereFaces(1),
  torus: () => {
    const out = [];
    const R = 0.7;
    const r = 0.28;
    const nu = 18;
    const nv = 8;
    const at = (i, j) => {
      const u = (i / nu) * Math.PI * 2;
      const v = (j / nv) * Math.PI * 2;
      return [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)];
    };
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = at(i, j); const b = at(i + 1, j); const c = at(i + 1, j + 1); const d = at(i, j + 1);
        out.push([a, d, c], [a, c, b]);
      }
    }
    return out;
  },
};

export const SOLID_KINDS = Object.keys(SOLIDS);

/** A unit-sized solid at the origin; the scene places it with a model matrix. */
export function solid(b, kind, color, rnd = Math.random) {
  for (const [p, q, r] of SOLIDS[kind]()) b.tri(p, q, r, shade(color, rnd, 0.05));
}

/** Seeds for a particle cloud: four numbers 0..1 per particle. */
export function seeds(n, seed) {
  const r = rand(seed);
  const out = new Float32Array(n * 4);
  for (let i = 0; i < out.length; i++) out[i] = r();
  return out;
}

/** A square grid of (x, z) in -0.5..0.5 with triangle indices (16-bit). */
export function gridArrays(n) {
  const pos = new Float32Array(n * n * 2);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = (z * n + x) * 2;
      pos[i] = x / (n - 1) - 0.5;
      pos[i + 1] = z / (n - 1) - 0.5;
    }
  }
  const idx = new Uint16Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let z = 0; z < n - 1; z++) {
    for (let x = 0; x < n - 1; x++) {
      const a = z * n + x;
      idx[k++] = a; idx[k++] = a + n; idx[k++] = a + 1;
      idx[k++] = a + 1; idx[k++] = a + n; idx[k++] = a + n + 1;
    }
  }
  return { pos, idx };
}

/** A strip of (u, v) in 0..1: u along a ribbon or curtain, v across it. */
export function stripArrays(nu, nv) {
  const pos = new Float32Array(nu * nv * 2);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = (j * nu + i) * 2;
      pos[k] = i / (nu - 1);
      pos[k + 1] = j / (nv - 1);
    }
  }
  const idx = new Uint16Array((nu - 1) * (nv - 1) * 6);
  let k = 0;
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i;
      idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + nu;
      idx[k++] = a + 1; idx[k++] = a + nu + 1; idx[k++] = a + nu;
    }
  }
  return { pos, idx };
}

/** A whole sphere of unit directions for the sky. */
export function domeArrays(rings = 24, segs = 48) {
  const pos = [];
  for (let y = 0; y <= rings; y++) {
    const phi = (y / rings) * Math.PI;
    for (let x = 0; x <= segs; x++) {
      const theta = (x / segs) * Math.PI * 2;
      pos.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    }
  }
  const idx = [];
  const row = segs + 1;
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segs; x++) {
      const a = y * row + x;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
}
