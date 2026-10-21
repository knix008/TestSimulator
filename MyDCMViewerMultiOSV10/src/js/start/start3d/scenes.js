// The 3D start scenes. Each one is a medical-imaging world: a CT gantry, MRI
// slices, an x-ray lightbox, a DNA helix, cells, a PACS server aisle and the
// rest. A scene builds its meshes once (`build`) and draws a frame from three
// clocks (`draw`): `camera` moves the viewer, `objects` moves scanners, beams,
// cells and signals, `sky` moves stars and light. Every clock runs at its own
// speed from Settings.
import { modelMatrix } from './gl.js';
import { box, cone, MeshBuilder, roundTree, seeds, solid, sphereFaces, tube } from './meshes.js';
import { TERRAIN } from './terrain.js';

const TAU = Math.PI * 2;
// One pace for every scene. Scenery sweeps past at SWEEP radians per clock
// unit (world speed / look distance), so a speed setting is the same number
// on a CT gantry, a server aisle and the rest. Local blinks stay as they are.
const SWEEP = 0.1;
const pathClock = (radius, look) => (SWEEP * look) / radius;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// Colours of the clinic: bone, blood, tissue, the false colours of a scan.
const CORAL = [0.98, 0.45, 0.42];
const ORANGE = [1, 0.66, 0.3];
const YELLOW = [0.98, 0.84, 0.36];
const GREEN = [0.45, 0.84, 0.5];
const TEAL = [0.3, 0.82, 0.82];
const BLUE = [0.42, 0.6, 1];
const VIOLET = [0.66, 0.5, 0.98];
const PINK = [0.95, 0.5, 0.78];
const BONE = [0.93, 0.9, 0.8];
const BLOOD = [0.88, 0.2, 0.26];
const FLESH = [0.95, 0.68, 0.62];
const ECG = [0.4, 0.98, 0.6];
const PAPER = [0.9, 0.92, 0.95];
const STEEL = [0.6, 0.64, 0.7];
const LINK = [0.55, 0.6, 0.7];
const INK = [0.05, 0.06, 0.09];
const WHITE = [1, 1, 1];
const RAMP = [BLUE, TEAL, GREEN, YELLOW, ORANGE, CORAL];

const ahead = (eye, dir, dist, dy = 0) => [eye[0] + dir[0] * dist, eye[1] + dy, eye[2] + dir[2] * dist];
const pick = (list, i) => list[((i % list.length) + list.length) % list.length];
/** A colour from the scan ramp, 0 (cold) through 1 (hot). */
const ramp = (v) => {
  const x = Math.max(0, Math.min(1, v)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return mix(RAMP[i], RAMP[i + 1], x - i);
};

function circle(r, a) {
  return { pos: [Math.cos(a) * r, 0, Math.sin(a) * r], dir: [-Math.sin(a), 0, Math.cos(a)] };
}

function light(o) {
  return { uSun: o.sun, uSunColor: o.sunColor, uAmbient: o.ambient, uFog: o.fog, uFogRange: o.fogRange };
}

function skyOf(o) {
  return {
    uZenith: o.zenith, uHorizon: o.horizon, uGround: o.ground ?? [0.02, 0.025, 0.04], uSun: o.sun, uSunColor: o.sunColor,
    uSunSize: o.sunSize ?? 0, uGlow: o.glow ?? 0, uClouds: 0, uCloudColor: [1, 1, 1],
    uStars: o.stars ?? 0, uMilky: o.milky ?? 0, uNebula: o.nebula ?? 0, uNebA: o.nebA ?? BLUE, uNebB: o.nebB ?? TEAL,
    uTime: o.time ?? 0, uSpin: o.spin ?? 0, uRetro: 0, uRetroColor: [0, 0, 0], uFlash: 0,
    uHaze: o.haze ?? 0.16, uSpace: o.space ?? 1, uWind: [0, 0],
  };
}

/** A cool reading-room lamp, theme-tinted, so equipment and anatomy read as solid. */
function labLight(tone, fogRange = [30, 150]) {
  const { c, accent } = tone;
  return {
    sun: [0.3, 0.88, 0.36],
    sunColor: mix([0.6, 0.64, 0.78], accent, 0.35),
    ambient: [0.3, 0.32, 0.38],
    fog: c([0.035, 0.05, 0.08]),
    fogRange,
  };
}

function labSky(tone, t, extra = {}) {
  const { c, accent } = tone;
  return skyOf({
    zenith: c(extra.zenith ?? [0.012, 0.018, 0.045]),
    horizon: c(extra.horizon ?? [0.06, 0.09, 0.15]),
    sun: [0.2, 0.95, 0.55],
    sunColor: extra.glow ? mix([0.7, 0.85, 1], accent, 0.4) : [0, 0, 0],
    sunSize: extra.sunSize ?? 0,
    glow: extra.glow ?? 0,
    stars: extra.stars ?? 0.4,
    milky: extra.milky ?? 0,
    nebula: extra.nebula ?? 0,
    nebA: mix(accent, extra.nebA ?? TEAL, 0.5),
    nebB: extra.nebB ?? BLUE,
    haze: extra.haze ?? 0.16,
    time: t.sky,
    spin: t.sky * 0.01,
  });
}

/** Orbit at one shared pace. `look` is how far ahead the view is aimed, in world units. */
function fly(s, t, radius, look, y, bob = 0) {
  const a = s.phase + t.camera * pathClock(radius, look);
  const path = circle(radius, a);
  return {
    a,
    eye: [path.pos[0], y + Math.sin(t.camera * 0.055) * bob, path.pos[2]],
    dir: path.dir,
  };
}

/** Swing to and fro in front of a picture that faces +z. */
function swing(s, t, radius, y, amount = 0.6, look = 8) {
  const a = Math.sin(s.phase + t.camera * pathClock(radius, look)) * amount;
  return [Math.sin(a) * radius, y + Math.sin(t.camera * 0.05) * 0.4, Math.cos(a) * radius];
}

function beginScene(k, tone, t, eye, target, env, skyExtra = {}, cam = {}) {
  const sky = labSky(tone, t, skyExtra);
  k.camera(eye, target, { fov: cam.fov ?? 0.95, roll: cam.roll ?? 0, level: cam.level });
  k.begin(env.fog);
  k.sky(sky);
  return sky;
}

function gridFloor(k, env, tone, span = 500, gap = 4) {
  const { accent } = tone;
  k.terrain({ mode: TERRAIN.flat }, {
    ...light(env),
    uLow: INK, uMid: INK, uHigh: INK, uPeak: INK,
    uLines: 0.7, uLineGap: gap, uLineColor: mix(LINK, accent, 0.4), uSpan: span,
  });
}

/** Draw `draw` twice, once upside down under a still, polished floor. */
function mirrored(k, sky, env, draw, o = {}) {
  k.beginMirror();
  k.sky(sky);
  draw();
  k.endMirror();
  k.water({
    uSpan: o.span ?? 100, uWave: o.wave ?? 0, uRipple: o.ripple ?? 0, uTime: o.time ?? 0, uSun: env.sun, uSunColor: env.sunColor,
    uDeep: o.deep ?? [0.025, 0.03, 0.05], uShallow: o.shallow ?? [0.04, 0.05, 0.07], uZenith: sky.uZenith, uHorizon: sky.uHorizon,
    uFog: env.fog, uFogRange: env.fogRange, uMirror: o.mirror ?? 0.55, uSpec: 0.4, uShine: 300,
  });
  draw();
}

/** Lit equipment and anatomy: bright enough to read against the dark, with a rim in the accent. */
function lit(k, geo, env, tone, extra = {}, opts) {
  k.solid(geo, { ...light(env), uEmit: 0.32, uTint: WHITE, uRim: mix(tone.accent, WHITE, 0.35), ...extra }, opts);
}

/** See-through tissue, a glass shell or a light beam, added on top. */
function glass(k, geo, env, tone, alpha, extra = {}, model) {
  k.solid(geo, { ...light(env), uEmit: 0.2, uTint: mix(WHITE, tone.accent, 0.3), uRim: mix(tone.accent, WHITE, 0.45), uAlpha: alpha, ...extra }, { blend: 'add', model });
}

function dust(k, s, t, tone, center, size, extra = {}) {
  k.points(s.dust, { uShape: 5, uCenter: center, uBox: size, uTwinkle: 0.6, uTime: t.objects, uSize: 0.07, uColorA: WHITE, uColorB: tone.accent, uAlpha: 0.6, ...extra });
}

// ── Geometry ────────────────────────────────────────────────────────────────

const jitter = (color, rnd, spread = 0.08) => {
  const k = 1 - spread / 2 + rnd() * spread;
  return color.map((v) => v * k);
};

/** An ellipsoid with radii `r` or [rx, ry, rz]. */
function ball(b, c, r, color, rnd, { detail = 1, squash = 1 } = {}) {
  const [rx, ry, rz] = Array.isArray(r) ? r : [r, r * squash, r];
  const at = (p) => [c[0] + p[0] * rx, c[1] + p[1] * ry, c[2] + p[2] * rz];
  for (const [p, q, s] of sphereFaces(detail)) b.tri(at(p), at(q), at(s), jitter(color, rnd, 0.06), { root: [c[0], c[2]] });
}

/** A lumpy ellipsoid: an organ, a cell, a skull. */
function lumpy(b, c, radii, color, rnd, { detail = 2, bump = 0.14 } = {}) {
  const bumps = new Map();
  const at = (p) => {
    const key = p.map((v) => v.toFixed(4)).join(',');
    if (!bumps.has(key)) bumps.set(key, 1 - bump / 2 + rnd() * bump);
    const k = bumps.get(key);
    return [c[0] + p[0] * radii[0] * k, c[1] + p[1] * radii[1] * k, c[2] + p[2] * radii[2] * k];
  };
  for (const [p, q, s] of sphereFaces(detail)) b.tri(at(p), at(q), at(s), jitter(color, rnd, 0.1), { root: [c[0], c[2]] });
}

/** A diamond (octahedron) with half-sizes `s`: speckle, atoms, markers. */
function gem(b, c, s, color, rnd) {
  const v = [[s[0], 0, 0], [-s[0], 0, 0], [0, s[1], 0], [0, -s[1], 0], [0, 0, s[2]], [0, 0, -s[2]]].map((p) => [c[0] + p[0], c[1] + p[1], c[2] + p[2]]);
  for (const f of [[4, 0, 2], [0, 5, 2], [5, 1, 2], [1, 4, 2], [0, 4, 3], [5, 0, 3], [1, 5, 3], [4, 1, 3]]) {
    b.tri(v[f[0]], v[f[1]], v[f[2]], jitter(color, rnd), { root: [c[0], c[2]] });
  }
}

function rod(b, p0, p1, r, color, rnd, segs = 6) {
  if (Math.hypot(...sub3(p1, p0)) < 1e-4) return;
  tube(b, p0, p1, r, segs, color, { rnd });
}

/** A polyline of rods; `joints` rounds the corners with small balls. */
function curve(b, pts, r, color, rnd, { segs = 6, joints = true } = {}) {
  for (let i = 1; i < pts.length; i++) {
    rod(b, pts[i - 1], pts[i], r, color, rnd, segs);
    if (joints && i < pts.length - 1) ball(b, pts[i], r, color, rnd, { detail: 0 });
  }
}

/** A ring about the z axis (a gantry, a bore) with tube radius `r`. */
function torus(b, c, R, r, color, rnd, { nu = 48, nv = 12 } = {}) {
  const at = (i, j) => {
    const u = (i / nu) * TAU;
    const v = (j / nv) * TAU;
    return [c[0] + (R + r * Math.cos(v)) * Math.cos(u), c[1] + (R + r * Math.cos(v)) * Math.sin(u), c[2] + r * Math.sin(v)];
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), jitter(color, rnd, 0.05));
  }
}

/** A forking tree of tubes (vessels, airways). `keep(p)` stops a branch that leaves its organ. */
function grow(b, p, dir, len, r, depth, colorAt, rnd, keep, spread = 0.7) {
  const q = add3(p, dir.map((v) => v * len));
  if (!keep(q)) return;
  const color = colorAt(depth);
  rod(b, p, q, r, color, rnd, 6);
  ball(b, q, r * 1.05, color, rnd, { detail: 0 });
  if (depth <= 0) return;
  const w = norm3(cross3(dir, [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
  for (const side of [-1, 1]) {
    const d = norm3(dir.map((v, i) => v + w[i] * side * spread + (rnd() - 0.5) * 0.25));
    grow(b, q, d, len * (0.7 + rnd() * 0.15), r * 0.72, depth - 1, colorAt, rnd, keep, spread);
  }
}

/** Random points inside an ellipsoid. */
function scatter(rnd, n, c, radii) {
  return Array.from({ length: n }, () => {
    let p;
    do p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; while (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 > 1);
    return [c[0] + p[0] * radii[0], c[1] + p[1] * radii[1], c[2] + p[2] * radii[2]];
  });
}

/** Link every point to its `n` nearest neighbours, each pair once. */
function nearest(points, n) {
  const seen = new Set();
  const out = [];
  points.forEach((p, i) => {
    const order = points.map((q, j) => [j, Math.hypot(...sub3(p, q))]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    for (const [j] of order.slice(0, n)) {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([i, j]);
    }
  });
  return out;
}

/** One heartbeat on an ECG strip: P, QRS and T over a period of 1. */
function ecg(u) {
  const g = (c, w) => Math.exp(-(((u - c) / w) ** 2));
  return 0.45 * g(0.18, 0.035) - 0.35 * g(0.36, 0.012) + 3.6 * g(0.4, 0.014) - 0.8 * g(0.44, 0.014) + 0.8 * g(0.65, 0.06);
}
const ECG_PERIOD = 10;
const ecgAt = (x) => ecg((((x % ECG_PERIOD) + ECG_PERIOD) % ECG_PERIOD) / ECG_PERIOD);

/** A heart: two atria, the ventricles narrowing to the apex, the aortic arch. Centred on the origin. */
function heart(b, rnd, size = 1) {
  const s = (p) => p.map((v) => v * size);
  lumpy(b, s([-0.55, 0.55, 0]), s([1.0, 0.95, 0.9]), BLOOD, rnd, { detail: 2, bump: 0.1 });
  lumpy(b, s([0.6, 0.5, -0.1]), s([0.95, 0.9, 0.85]), mix(BLOOD, CORAL, 0.25), rnd, { detail: 2, bump: 0.1 });
  lumpy(b, s([0.1, -0.6, 0.1]), s([1.25, 1.35, 1.0]), BLOOD, rnd, { detail: 2, bump: 0.1 });
  cone(b, s([0.2, -1.6, 0.15]), 0.75 * size, -0.9 * size, 12, mix(BLOOD, INK, 0.15), { rnd });
  const arch = [[0.15, 1.1, 0], [0.2, 1.9, -0.1], [-0.2, 2.35, -0.3], [-0.8, 2.2, -0.45], [-1.05, 1.5, -0.55]].map(s);
  curve(b, arch, 0.32 * size, mix(BLOOD, CORAL, 0.4), rnd, { segs: 10 });
  curve(b, [[0.6, 1.0, 0.1], [0.95, 1.7, 0.25], [1.4, 1.95, 0.35]].map(s), 0.24 * size, mix(BLUE, VIOLET, 0.4), rnd, { segs: 8 });
}

const SCENES = {
  ctgantry: {
    build(kit, rnd) {
      const frame = new MeshBuilder();
      const C = [0, 5.6, 0];
      torus(frame, C, 4.3, 1.15, PAPER, rnd, { nu: 64, nv: 14 });
      box(frame, [0, 0, 0], [7.2, 1.4, 2.4], mix(PAPER, STEEL, 0.45), { rnd });
      box(frame, [0, 0, 7.5], [1.8, 3.2, 3.6], STEEL, { rnd });
      box(frame, [0, 0, 7.5], [2.6, 0.2, 4.6], mix(STEEL, INK, 0.4), { rnd });
      // The operator's console off to the side.
      box(frame, [-9, 0, 4], [3.2, 2.2, 1.4], mix(STEEL, INK, 0.3), { rnd });
      for (const x of [-9.8, -8.2]) box(frame, [x, 2.2, 4], [1.4, 1, 0.12], [0.08, 0.12, 0.18], { rnd, yaw: x < -9 ? 0.2 : -0.2 });
      const glow = new MeshBuilder();
      torus(glow, C, 3.17, 0.06, WHITE, rnd, { nu: 64, nv: 6 });
      torus(glow, [0, C[1], 1.18], 4.3, 0.07, WHITE, rnd, { nu: 64, nv: 6 });
      torus(glow, [0, C[1], -1.18], 4.3, 0.07, WHITE, rnd, { nu: 64, nv: 6 });
      for (const x of [-9.8, -8.2]) box(glow, [x, 2.35, 4.08], [1.2, 0.7, 0.02], mix(TEAL, WHITE, 0.3), { rnd, yaw: x < -9 ? 0.2 : -0.2 });
      // The table and the patient, built where the table is drawn: at z = 0 and moved by the model.
      const table = new MeshBuilder();
      box(table, [0, 3.2, 0], [1.7, 0.22, 10], STEEL, { rnd });
      box(table, [0, 3.42, 0], [1.5, 0.14, 9.6], mix(BLUE, WHITE, 0.25), { rnd });
      ball(table, [0, 4.0, -3.1], [0.45, 0.42, 0.5], FLESH, rnd, { detail: 2 });
      lumpy(table, [0, 3.95, -0.6], [0.78, 0.4, 2.0], mix(TEAL, WHITE, 0.4), rnd, { detail: 2, bump: 0.06 });
      for (const x of [-0.3, 0.3]) lumpy(table, [x, 3.82, 2.6], [0.3, 0.26, 1.7], mix(TEAL, WHITE, 0.4), rnd, { detail: 1, bump: 0.06 });
      // The x-ray tube and the detector arc turn about the bore; the fan beam between them.
      const rotor = new MeshBuilder();
      box(rotor, [0, 2.75, 0], [1.1, 0.5, 0.8], mix(STEEL, WHITE, 0.3), { rnd });
      for (let i = -3; i <= 3; i++) {
        const a = -Math.PI / 2 + i * 0.12;
        box(rotor, [Math.cos(a) * 3.05, Math.sin(a) * 3.05 - 0.2, 0], [0.36, 0.4, 0.8], mix(STEEL, INK, 0.2), { rnd, yaw: 0 });
      }
      const beam = new MeshBuilder();
      for (const z of [-0.05, 0.05]) beam.tri([0, 2.75, z], [-1.3, -2.85, z], [1.3, -2.85, z], WHITE);
      return {
        phase: rnd() * TAU, frame: kit.mesh(frame), glow: kit.mesh(glow), table: kit.mesh(table), rotor: kit.mesh(rotor), beam: kit.mesh(beam),
        sparks: kit.cloud(seeds(160, 401)), dust: kit.cloud(seeds(220, 402)),
      };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [18, 70]);
      const { eye } = fly(s, t, 18, 13, 6.5, 1.2);
      const sky = beginScene(k, tone, t, eye, [0, 4.4, 1.5], env, { stars: 0.4, glow: 0.12, sunSize: 0.01 });
      const z = 4.5 + Math.sin(t.objects * 0.15) * 2.5;
      const roll = t.objects * 0.9;
      const C = [0, 5.6, 0];
      const lamp = { uLightPos: C, uLightColor: mix(accent, WHITE, 0.4).map((v) => v * 1.4) };
      mirrored(k, sky, env, () => {
        lit(k, s.frame, env, tone, { uEmit: 0.25, ...lamp });
        k.solid(s.glow, { ...light(env), uEmit: 1, uTint: mix(accent, WHITE, 0.25) });
        modelMatrix(k.model, [0, 0, z], 0, 0, 0, 1);
        lit(k, s.table, env, tone, lamp, { model: k.model });
        modelMatrix(k.model, C, 0, 0, roll, 1);
        lit(k, s.rotor, env, tone, { uEmit: 0.4 }, { model: k.model });
        glass(k, s.beam, env, tone, 0.16 + 0.05 * Math.sin(t.objects * 2.1), { uEmit: 1, uTint: mix(accent, WHITE, 0.3) }, k.model);
      }, { span: 120 });
      k.points(s.sparks, { uShape: 5, uCenter: C, uBox: [5.6, 5.6, 2.2], uTwinkle: 0.8, uTime: t.objects, uSize: 0.07, uColorA: WHITE, uColorB: accent, uAlpha: 0.75 });
      dust(k, s, t, tone, [0, 5, 2], [30, 10, 30], { uSwirl: 0.08, uSize: 0.06 });
    },
  },

  mrislices: {
    build(kit, rnd) {
      const head = new MeshBuilder();
      lumpy(head, [0, 5.4, 0], [2.0, 2.5, 2.35], FLESH, rnd, { detail: 3, bump: 0.05 });
      gem(head, [0, 5.2, 2.4], [0.25, 0.45, 0.35], FLESH, rnd);
      const base = new MeshBuilder();
      rod(base, [0, 3.4, -0.3], [0, 1.2, -0.3], 0.85, mix(FLESH, STEEL, 0.4), rnd, 14);
      lumpy(base, [0, 0.8, -0.3], [3.2, 0.75, 1.6], mix(STEEL, BLUE, 0.2), rnd, { detail: 2, bump: 0.06 });
      const brain = new MeshBuilder();
      for (const side of [-1, 1]) lumpy(brain, [side * 0.78, 5.9, 0.1], [0.85, 1.25, 1.75], PINK, rnd, { detail: 2, bump: 0.16 });
      lumpy(brain, [0, 4.6, -1.1], [1.1, 0.55, 0.7], VIOLET, rnd, { detail: 1 });
      rod(brain, [0, 4.9, -0.5], [0, 3.6, -0.6], 0.3, VIOLET, rnd, 8);
      // Ten axial slice plates, with a lit frame round each.
      const plates = new MeshBuilder();
      const frames = new MeshBuilder();
      const plate = (pb, fb, y) => {
        box(pb, [0, y - 0.015, 0], [7.6, 0.03, 7.6], WHITE, { rnd });
        const h = 3.8;
        const c = [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h], [-h, y, -h]];
        curve(fb, c, 0.03, WHITE, rnd, { segs: 4 });
      };
      for (let i = 0; i < 10; i++) plate(plates, frames, 1.8 + i * 0.82);
      const scanPlate = new MeshBuilder();
      const scanFrame = new MeshBuilder();
      plate(scanPlate, scanFrame, 0);
      return {
        phase: rnd() * TAU, head: kit.mesh(head), base: kit.mesh(base), brain: kit.mesh(brain), plates: kit.mesh(plates), frames: kit.mesh(frames),
        scanPlate: kit.mesh(scanPlate), scanFrame: kit.mesh(scanFrame), dust: kit.cloud(seeds(240, 411)),
      };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 55]);
      const { eye } = fly(s, t, 14, 10, 6.8, 1);
      const sky = beginScene(k, tone, t, eye, [0, 5, 0], env, { stars: 0.5, nebula: 0.3 });
      const y = 5.5 + Math.sin(t.objects * 0.3) * 3.6;
      mirrored(k, sky, env, () => {
        lit(k, s.base, env, tone, { uEmit: 0.2 });
        k.solid(s.brain, { ...light(env), uEmit: 0.6, uTint: WHITE, uRim: mix(accent, WHITE, 0.4) });
        k.solid(s.frames, { ...light(env), uEmit: 1, uTint: mix(accent, LINK, 0.35) });
        glass(k, s.plates, env, tone, 0.05, { uEmit: 0.8 });
        glass(k, s.head, env, tone, 0.2, { uTint: mix(FLESH, accent, 0.3) });
        modelMatrix(k.model, [0, y, 0], 0, 0, 0, 1);
        k.solid(s.scanFrame, { ...light(env), uEmit: 1, uTint: mix(accent, WHITE, 0.5) }, { model: k.model });
        glass(k, s.scanPlate, env, tone, 0.22, { uEmit: 1, uTint: accent }, k.model);
      }, { span: 100 });
      dust(k, s, t, tone, [0, 5, 0], [18, 10, 18], { uSwirl: 0.2 });
    },
  },

  xray: {
    build(kit, rnd) {
      const film = new MeshBuilder();
      box(film, [0, 0.2, -2.6], [17, 12.6, 0.3], [0.16, 0.17, 0.2], { rnd });
      box(film, [0, 0.6, -2.42], [16, 11.8, 0.06], [0.22, 0.32, 0.42], { rnd });
      box(film, [0, 0, -2.6], [0.6, 0.2, 0.3], STEEL, { rnd });
      const bones = new MeshBuilder();
      const cz = 0.6;
      const rz = 1.2;
      // Spine and skull.
      for (let i = 0; i < 22; i++) {
        const y = 1.9 + i * 0.4;
        ball(bones, [0, y, cz - rz - 0.05 * Math.sin(i * 0.3)], [0.32 - i * 0.004, 0.15, 0.28], BONE, rnd, { detail: 1 });
      }
      lumpy(bones, [0, 11.2, cz - 0.3], [1.1, 1.3, 1.25], BONE, rnd, { detail: 2, bump: 0.05 });
      lumpy(bones, [0, 10.0, cz + 0.35], [0.75, 0.35, 0.6], BONE, rnd, { detail: 1, bump: 0.08 });
      // Ten pairs of ribs curving from the spine round to the breastbone.
      for (let i = 0; i < 10; i++) {
        const y = 8.3 - i * 0.42;
        const rx = 1.35 + Math.sin((i + 1) / 11 * Math.PI) * 1.0;
        const drop = 0.6 + i * 0.05;
        const end = i < 7 ? 0.9 : 0.75 - (i - 7) * 0.12;
        for (const side of [-1, 1]) {
          const pts = [];
          for (let j = 0; j <= 12; j++) {
            const a = 0.12 + (j / 12) * Math.PI * end;
            pts.push([side * Math.sin(a) * rx, y - drop * Math.sin(a * 0.5), cz - Math.cos(a) * rz]);
          }
          curve(bones, pts, 0.07, BONE, rnd, { segs: 5 });
        }
      }
      rod(bones, [0, 8.1, cz + rz - 0.05], [0, 5.6, cz + rz - 0.1], 0.12, BONE, rnd, 6);
      // Collarbones, shoulders and arms.
      for (const side of [-1, 1]) {
        curve(bones, [[0, 8.4, cz + rz - 0.1], [side * 1.2, 8.75, cz + 0.6], [side * 2.5, 8.9, cz - 0.2]], 0.09, BONE, rnd);
        ball(bones, [side * 2.65, 8.6, cz - 0.3], 0.32, BONE, rnd);
        rod(bones, [side * 2.7, 8.4, cz - 0.3], [side * 3.1, 5.2, cz - 0.1], 0.13, BONE, rnd, 6);
        ball(bones, [side * 3.12, 5.1, cz - 0.1], 0.2, BONE, rnd, { detail: 0 });
        rod(bones, [side * 3.1, 5.0, cz - 0.15], [side * 3.4, 2.4, cz + 0.2], 0.08, BONE, rnd, 5);
        rod(bones, [side * 3.25, 5.0, cz + 0.05], [side * 3.6, 2.4, cz + 0.35], 0.07, BONE, rnd, 5);
        lumpy(bones, [side * 1.3, 2.2, cz - 0.4], [1.0, 0.85, 0.35], BONE, rnd, { detail: 1, bump: 0.1 });
        ball(bones, [side * 1.15, 1.45, cz - 0.1], 0.3, BONE, rnd);
        rod(bones, [side * 1.2, 1.3, cz - 0.1], [side * 1.45, 0.1, cz], 0.17, BONE, rnd, 6);
      }
      const scan = new MeshBuilder();
      box(scan, [0, -0.06, -2.36], [16, 0.12, 0.04], WHITE, { rnd });
      return { phase: rnd() * TAU, film: kit.mesh(film), bones: kit.mesh(bones), scan: kit.mesh(scan), dust: kit.cloud(seeds(180, 421)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 60]);
      const eye = swing(s, t, 15, 6.2, 0.55, 9);
      beginScene(k, tone, t, eye, [0, 6, 0], env, { stars: 0.3 });
      gridFloor(k, env, tone, 160, 2);
      const glow = 0.85 + 0.15 * Math.sin(t.objects * 0.8);
      k.solid(s.film, { ...light(env), uEmit: 0.9, uTint: mix(WHITE, accent, 0.35).map((v) => v * glow) });
      k.solid(s.bones, { ...light(env), uEmit: 0.7, uTint: mix(WHITE, accent, 0.15), uRim: mix(accent, WHITE, 0.6) });
      const y = 0.8 + ((t.objects * 0.9) % 11.4);
      modelMatrix(k.model, [0, y, 0], 0, 0, 0, 1);
      glass(k, s.scan, env, tone, 0.55, { uEmit: 1, uTint: accent }, k.model);
      dust(k, s, t, tone, [0, 6, 2], [22, 12, 8], { uShape: 0, uVel: [0.15, 0.2, 0], uSize: 0.05, uColorA: accent });
    },
  },

  dna: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const n = 72;
      const R = 2.2;
      const H = 13;
      const pairs = [[CORAL, TEAL], [YELLOW, GREEN], [TEAL, CORAL], [GREEN, YELLOW]];
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 3.2 * TAU;
        const y = 0.8 + (i / n) * H;
        const p = [Math.cos(a) * R, y, Math.sin(a) * R];
        const q = [-p[0], y, -p[2]];
        ball(b, p, 0.26, BLUE, rnd);
        ball(b, q, 0.26, VIOLET, rnd);
        if (prev) {
          rod(b, prev[0], p, 0.1, mix(BLUE, WHITE, 0.3), rnd);
          rod(b, prev[1], q, 0.1, mix(VIOLET, WHITE, 0.3), rnd);
        }
        if (i % 2 === 0) {
          const [ca, cb] = pick(pairs, Math.floor(rnd() * 4));
          const m = [0, y, 0];
          rod(b, p, m, 0.08, ca, rnd, 5);
          rod(b, m, q, 0.08, cb, rnd, 5);
        }
        prev = [p, q];
      }
      return {
        phase: rnd() * TAU, helix: kit.mesh(b), dust: kit.cloud(seeds(300, 431)),
        far: [[-17, -15, 0.55, 1], [18, -13, 0.5, -1], [3, -24, 0.6, 1], [-20, 12, 0.45, -1]],
      };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [16, 70]);
      const { eye } = fly(s, t, 18, 12, 7.2, 1.2);
      const sky = beginScene(k, tone, t, eye, [0, 7.2, 0], env, { stars: 0.7, nebula: 0.4, nebA: VIOLET });
      mirrored(k, sky, env, () => {
        modelMatrix(k.model, [0, 0, 0], t.objects * 0.15, 0, 0, 1);
        lit(k, s.helix, env, tone, { uEmit: 0.4 }, { model: k.model });
        for (const [x, z, size, dir] of s.far) {
          modelMatrix(k.model, [x, 0, z], t.objects * 0.12 * dir, 0, 0, size);
          lit(k, s.helix, env, tone, { uEmit: 0.35 }, { model: k.model });
        }
      }, { span: 140 });
      dust(k, s, t, tone, [0, 7, 0], [30, 14, 30], { uSwirl: 0.15, uVel: [0, 0.3, 0], uSize: 0.08 });
    },
  },

  cells: {
    build(kit, rnd) {
      const membrane = new MeshBuilder();
      lumpy(membrane, [0, 0, 0], [1, 0.9, 1], WHITE, rnd, { detail: 2, bump: 0.12 });
      const inside = new MeshBuilder();
      lumpy(inside, [0.15, 0.05, 0], [0.4, 0.36, 0.38], WHITE, rnd, { detail: 2, bump: 0.12 });
      for (let i = 0; i < 6; i++) {
        const a = rnd() * TAU;
        const c = [Math.cos(a) * 0.62, (rnd() - 0.5) * 0.5, Math.sin(a) * 0.62];
        ball(inside, c, [0.16, 0.07, 0.08], mix(WHITE, ORANGE, 0.4), rnd, { detail: 0 });
      }
      const rbc = new MeshBuilder();
      solid(rbc, 'torus', WHITE, rnd);
      const spot = () => {
        const a = rnd() * TAU;
        const r = 2 + rnd() * 10;
        return [Math.cos(a) * r, 1.6 + rnd() * 8, Math.sin(a) * r];
      };
      const cells = Array.from({ length: 16 }, (_, i) => ({ pos: spot(), size: 0.8 + rnd() * 0.7, color: pick([PINK, VIOLET, TEAL, BLUE, GREEN], i), phase: rnd() * TAU }));
      const reds = Array.from({ length: 18 }, () => ({ pos: spot(), size: 0.5 + rnd() * 0.3, phase: rnd() * TAU }));
      return { phase: rnd() * TAU, membrane: kit.mesh(membrane), inside: kit.mesh(inside), rbc: kit.mesh(rbc), cells, reds, dust: kit.cloud(seeds(320, 441)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 50]);
      const { eye } = fly(s, t, 17, 11, 5.6, 1.2);
      beginScene(k, tone, t, eye, [0, 5, 0], env, { stars: 0.25, nebula: 0.6, nebA: PINK, nebB: VIOLET, horizon: [0.1, 0.06, 0.12] });
      const at = (item, k2) => [
        item.pos[0] + Math.sin(t.objects * 0.21 + item.phase) * 0.7 * k2,
        item.pos[1] + Math.sin(t.objects * 0.33 + item.phase * 2) * 0.5,
        item.pos[2] + Math.cos(t.objects * 0.17 + item.phase) * 0.7 * k2,
      ];
      for (const item of s.reds) {
        modelMatrix(k.model, at(item, 1.4), t.objects * 0.2 + item.phase, item.phase + t.objects * 0.15, 0.4, item.size);
        k.solid(s.rbc, { ...light(env), uEmit: 0.35, uTint: BLOOD, uRim: mix(accent, CORAL, 0.5) }, { model: k.model });
      }
      for (const item of s.cells) {
        modelMatrix(k.model, at(item, 1), t.objects * 0.1 + item.phase, 0, 0, item.size);
        k.solid(s.inside, { ...light(env), uEmit: 0.55, uTint: mix(item.color, WHITE, 0.2), uRim: mix(accent, WHITE, 0.5) }, { model: k.model });
      }
      for (const item of s.cells) {
        modelMatrix(k.model, at(item, 1), t.objects * 0.1 + item.phase, 0, 0, item.size);
        glass(k, s.membrane, env, tone, 0.3, { uTint: mix(item.color, WHITE, 0.3) }, k.model);
      }
      dust(k, s, t, tone, [0, 5, 0], [28, 12, 28], { uShape: 6, uWobble: [0.4, 0.3, 0.4], uWobbleFreq: 0.4, uSize: 0.1, uColorA: mix(PINK, WHITE, 0.4), uAlpha: 0.5 });
    },
  },

  neurons: {
    build(kit, rnd) {
      const pts = scatter(rnd, 46, [0, 4.5, 0], [11, 4, 9]);
      const cells = new MeshBuilder();
      const links = new MeshBuilder();
      pts.forEach((p, i) => {
        lumpy(cells, p, [0.32, 0.28, 0.3].map((v) => v * (0.8 + rnd() * 0.6)), mix(pick([TEAL, BLUE, VIOLET, PINK], i), WHITE, 0.35), rnd, { detail: 1, bump: 0.3 });
        for (let d = 0; d < 4; d++) {
          const tip = [p[0] + (rnd() - 0.5) * 1.8, p[1] + (rnd() - 0.5) * 1.8, p[2] + (rnd() - 0.5) * 1.8];
          const mid = mix(p, tip, 0.5).map((v) => v + (rnd() - 0.5) * 0.4);
          curve(links, [p, mid, tip], 0.03, TEAL, rnd, { segs: 4, joints: false });
        }
      });
      for (const [i, j] of nearest(pts, 2)) {
        const m = mix(pts[i], pts[j], 0.5).map((v) => v + (rnd() - 0.5) * 1.2);
        curve(links, [pts[i], mix(pts[i], m, 0.5), m, mix(m, pts[j], 0.5), pts[j]], 0.05, TEAL, rnd, { segs: 5 });
      }
      return { phase: rnd() * TAU, cells: kit.mesh(cells), links: kit.mesh(links), signals: kit.cloud(seeds(420, 451)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 55]);
      const { eye } = fly(s, t, 17, 12, 5.2, 1.6);
      beginScene(k, tone, t, eye, [0, 4.5, 0], env, { stars: 0.8, nebula: 0.5, milky: 0.2 });
      k.solid(s.links, { ...light(env), uEmit: 0.5, uTint: mix(TEAL, accent, 0.45) });
      k.solid(s.cells, { ...light(env), uEmit: 0.75, uTint: WHITE, uRim: mix(accent, WHITE, 0.5) });
      k.points(s.signals, { uShape: 5, uCenter: [0, 4.5, 0], uBox: [24, 9, 20], uSwirl: 0.2, uTwinkle: 0.8, uBlink: 0.5, uTime: t.objects, uSize: 0.14, uColorA: WHITE, uColorB: accent, uAlpha: 0.85 });
    },
  },

  heartbeat: {
    build(kit, rnd) {
      const trace = new MeshBuilder();
      const pts = [];
      for (let x = -32; x <= 32.001; x += 0.05) pts.push([x, 2.6 + ecgAt(x + 32), -5]);
      curve(trace, pts, 0.07, WHITE, rnd, { segs: 4, joints: false });
      // ECG paper: a faint grid on a dark monitor.
      const paper = new MeshBuilder();
      box(paper, [0, 0.4, -5.7], [66, 8.4, 0.2], [0.03, 0.06, 0.05], { rnd });
      const lines = new MeshBuilder();
      for (let x = -32; x <= 32; x += 2) rod(lines, [x, 0.5, -5.55], [x, 8.7, -5.55], 0.02, WHITE, rnd, 3);
      for (let y = 1; y <= 8.5; y += 1) rod(lines, [-32.5, y, -5.55], [32.5, y, -5.55], 0.02, WHITE, rnd, 3);
      const beat = new MeshBuilder();
      heart(beat, rnd, 1.2);
      const cursor = new MeshBuilder();
      ball(cursor, [0, 0, 0], 0.22, WHITE, rnd, { detail: 2 });
      return { phase: rnd() * TAU, trace: kit.mesh(trace), paper: kit.mesh(paper), lines: kit.mesh(lines), heart: kit.mesh(beat), cursor: kit.mesh(cursor), dust: kit.cloud(seeds(200, 461)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 60]);
      const eye = swing(s, t, 15, 5.2, 0.6, 9);
      beginScene(k, tone, t, eye, [0, 4.6, -1.5], env, { stars: 0.35, glow: 0.1, sunSize: 0.01 });
      gridFloor(k, env, tone, 160, 2);
      const run = (t.objects * 5) % 64;
      const x = -32 + run;
      const u = (run % ECG_PERIOD) / ECG_PERIOD;
      const pulse = Math.exp(-(((u - 0.41) / 0.06) ** 2));
      const line = mix(ECG, accent, 0.3);
      k.solid(s.paper, { ...light(env), uEmit: 1, uTint: WHITE });
      k.solid(s.lines, { ...light(env), uEmit: 1, uTint: mix(line, INK, 0.7) });
      k.solid(s.trace, { ...light(env), uEmit: 1, uTint: line });
      modelMatrix(k.model, [0, 5.4, 1.4], Math.sin(t.objects * 0.2) * 0.5, 0, 0, 1 + pulse * 0.08);
      lit(k, s.heart, env, tone, { uEmit: 0.35 + pulse * 0.3, uRim: mix(CORAL, WHITE, 0.3 + pulse * 0.4) }, { model: k.model });
      modelMatrix(k.model, [x, 2.6 + ecgAt(x + 32), -4.9], 0, 0, 0, 1.6);
      k.solid(s.cursor, { ...light(env), uEmit: 1, uTint: mix(line, WHITE, 0.5) }, { model: k.model });
      k.points(s.dust, { uShape: 5, uCenter: [x, 2.6, -4.8], uBox: [3, 0.3, 0.2], uVel: [5, 0, 0], uTime: t.objects, uSize: 0.12, uColorA: line, uColorB: WHITE, uAlpha: 0.8 });
      dust(k, s, t, tone, [0, 5, 0], [30, 10, 14], { uShape: 0, uVel: [0.2, 0.25, 0], uSize: 0.05, uColorA: CORAL, uAlpha: 0.5 });
    },
  },

  vessels: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const colorAt = (depth) => mix(mix(BLOOD, CORAL, 0.2), mix(PINK, WHITE, 0.3), 1 - depth / 6);
      rod(b, [0, 0, 0], [0, 3.4, 0], 0.5, BLOOD, rnd, 12);
      const keep = (q) => q[1] > 0.5 && q[1] < 13.5 && Math.hypot(q[0], q[2]) < 10.5;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rnd() * 0.4;
        grow(b, [0, 3.4, 0], norm3([Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6]), 2.6, 0.32, 6, colorAt, rnd, keep, 0.75);
      }
      return { phase: rnd() * TAU, tree: kit.mesh(b), flow: kit.cloud(seeds(400, 471)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [16, 60]);
      const { eye } = fly(s, t, 18, 12, 6.8, 1.2);
      const sky = beginScene(k, tone, t, eye, [0, 6, 0], env, { stars: 0.5, nebula: 0.3, nebA: CORAL });
      const glow = 0.9 + 0.1 * Math.sin(t.objects * 1.1);
      mirrored(k, sky, env, () => {
        lit(k, s.tree, env, tone, { uEmit: 0.45 * glow, uRim: mix(accent, WHITE, 0.4), uLightPos: [0, 8, 0], uLightColor: [0.8, 0.5, 0.5] });
      }, { span: 120 });
      k.points(s.flow, { uShape: 0, uCenter: [0, 7, 0], uBox: [20, 13, 20], uSwirl: 0.25, uVel: [0, 0.6, 0], uTwinkle: 0.6, uTime: t.objects, uSize: 0.09, uColorA: mix(CORAL, WHITE, 0.4), uColorB: accent, uAlpha: 0.7 });
    },
  },

  molecules: {
    build(kit, rnd) {
      const shapes = [];
      for (let m = 0; m < 5; m++) {
        const b = new MeshBuilder();
        ball(b, [0, 0, 0], 0.6, mix(VIOLET, WHITE, 0.2), rnd, { detail: 2 });
        const n = 4 + (m % 3);
        const tilt = rnd() * 0.8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const p = [Math.cos(a) * 1.5, Math.sin(a) * Math.sin(tilt) * 1.5, Math.sin(a) * Math.cos(tilt) * 1.5];
          const color = i % 2 ? CORAL : BLUE;
          rod(b, [0, 0, 0], p, 0.08, LINK, rnd);
          ball(b, p, 0.34, color, rnd);
          const outward = norm3(p.map((v) => v + (rnd() - 0.5) * 0.8));
          const q = add3(p, outward.map((v) => v * 0.95));
          rod(b, p, q, 0.07, LINK, rnd);
          ball(b, q, 0.3, mix(STEEL, INK, 0.25), rnd);
          for (let h = 0; h < 2; h++) {
            const hq = add3(q, norm3([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]).map((v) => v * 0.55));
            rod(b, q, hq, 0.04, LINK, rnd, 4);
            ball(b, hq, 0.15, WHITE, rnd, { detail: 0 });
          }
        }
        shapes.push(kit.mesh(b));
      }
      const items = Array.from({ length: 12 }, (_, i) => ({
        orbit: 3.5 + rnd() * 7, angle: rnd() * TAU, y: 2 + rnd() * 5.5, size: 0.7 + rnd() * 0.4, shape: i % 5, phase: rnd() * TAU,
      }));
      return { phase: rnd() * TAU, shapes, items, dust: kit.cloud(seeds(260, 481)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 55]);
      const { eye } = fly(s, t, 17, 11, 5.4, 1);
      beginScene(k, tone, t, eye, [0, 4.6, 0], env, { stars: 0.7, nebula: 0.35, nebA: VIOLET });
      for (const item of s.items) {
        const ang = item.angle + t.objects * 0.08 * (item.orbit < 7 ? 1 : -0.7);
        const pos = [Math.cos(ang) * item.orbit, item.y + Math.sin(t.objects * 0.4 + item.phase) * 0.4, Math.sin(ang) * item.orbit];
        modelMatrix(k.model, pos, t.objects * 0.25 + item.phase, item.phase, Math.sin(t.objects * 0.1 + item.phase) * 0.5, item.size);
        lit(k, s.shapes[item.shape], env, tone, { uEmit: 0.4 }, { model: k.model });
      }
      k.ribbon({ uMode: 0, uIndex: 1, uRadius: 6.5, uWidth: 0.1, uTime: t.objects * 0.4, uSun: env.sun, uColorA: accent, uColorB: mix(VIOLET, WHITE, 0.4), uAlpha: 0.4, uOffset: [0, 4.6, 0] }, { blend: 'add' });
      dust(k, s, t, tone, [0, 5, 0], [28, 10, 28], { uSwirl: 0.12, uSize: 0.08 });
    },
  },

  ultrasound: {
    build(kit, rnd) {
      const A = [0, 10.4, 0];
      const R = 9;
      const half = 0.62;
      const at = (a, r, z = 0) => [A[0] + Math.sin(a) * r, A[1] - Math.cos(a) * r, z];
      const fan = new MeshBuilder();
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        const a0 = -half + (i / steps) * half * 2;
        const a1 = -half + ((i + 1) / steps) * half * 2;
        fan.quad(at(a0, 0.6, -0.05), at(a1, 0.6, -0.05), at(a1, R, -0.05), at(a0, R, -0.05), [0.03, 0.04, 0.06]);
      }
      // Speckle: grey tissue, a bright capsule round a dark cyst, a brighter far wall.
      const speckle = new MeshBuilder();
      for (let i = 0; i < 1600; i++) {
        const a = -half + rnd() * half * 2;
        const r = 0.8 + Math.sqrt(rnd()) * (R - 0.9);
        const p = at(a, r, 0.02);
        const e = Math.hypot((p[0] - 0.6) / 2.6, (p[1] - 4.6) / 1.6);
        if (e < 0.85 && rnd() < 0.9) continue;
        let v = 0.25 + rnd() * 0.35;
        if (Math.abs(e - 1) < 0.15) v += 0.45;
        if (r > R - 1.2) v += 0.2;
        const g = 0.04 + rnd() * 0.05;
        gem(speckle, p, [g * 1.6, g, 0.02], [v, v, v * 1.05], rnd);
      }
      const marks = new MeshBuilder();
      for (const side of [-1, 1]) rod(marks, at(side * half, 0.6, 0), at(side * half, R, 0), 0.04, WHITE, rnd, 4);
      for (const r of [0.6, 3, 5, 7, R]) {
        const arc = [];
        for (let i = 0; i <= 24; i++) arc.push(at(-half + (i / 24) * half * 2, r, 0));
        curve(marks, arc, r === R || r === 0.6 ? 0.04 : 0.015, WHITE, rnd, { segs: 3, joints: false });
      }
      for (let r = 1; r < R; r += 1) box(marks, at(half + 0.06, r, 0), [0.25, 0.04, 0.04], WHITE, { rnd });
      const probe = new MeshBuilder();
      box(probe, [0, 10.3, 0], [1.7, 0.5, 0.8], mix(STEEL, WHITE, 0.3), { rnd });
      box(probe, [0, 10.8, 0], [1.1, 2.0, 0.65], PAPER, { rnd });
      curve(probe, [[0, 12.8, 0], [0.2, 13.8, -0.4], [1.4, 14.4, -1.4], [3.2, 14.2, -2.6]], 0.12, STEEL, rnd);
      const beam = new MeshBuilder();
      for (const z of [-0.01, 0.03]) beam.tri([0, 0, z], [-0.05, -R, z], [0.05, -R, z], WHITE);
      rod(beam, [0, -0.6, 0.03], [0, -R, 0.03], 0.03, WHITE, rnd, 4);
      return {
        phase: rnd() * TAU, fan: kit.mesh(fan), speckle: kit.mesh(speckle), marks: kit.mesh(marks), probe: kit.mesh(probe), beam: kit.mesh(beam),
        dust: kit.cloud(seeds(160, 491)),
      };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 60]);
      const eye = swing(s, t, 16, 6, 0.6, 9);
      beginScene(k, tone, t, eye, [0, 6.2, 0], env, { stars: 0.3, glow: 0.1, sunSize: 0.01 });
      gridFloor(k, env, tone, 160, 2);
      const flicker = 0.9 + 0.1 * Math.sin(t.objects * 3.1);
      k.solid(s.fan, { ...light(env), uEmit: 1, uTint: WHITE });
      k.solid(s.speckle, { ...light(env), uEmit: 1, uTint: mix(WHITE, accent, 0.2).map((v) => v * flicker) });
      k.solid(s.marks, { ...light(env), uEmit: 1, uTint: mix(accent, WHITE, 0.3) });
      lit(k, s.probe, env, tone);
      modelMatrix(k.model, [0, 10.4, 0], 0, 0, Math.sin(t.objects * 0.5) * 0.6, 1);
      glass(k, s.beam, env, tone, 0.5, { uEmit: 1, uTint: accent }, k.model);
      dust(k, s, t, tone, [0, 6, 2], [24, 12, 8], { uShape: 0, uVel: [0.1, 0.2, 0], uSize: 0.05, uColorA: accent });
    },
  },

  endoscope: {
    build(kit, rnd) {
      // A winding lumen (colon / airway): rings of folded mucosa along a closed loop, with vessels on the wall.
      const path = (u) => [Math.sin(u) * 26 + Math.sin(u * 3) * 3, 4 + Math.sin(u * 2) * 1.6, Math.cos(u) * 26 + Math.cos(u * 2) * 4];
      const wall = new MeshBuilder();
      const vessels = new MeshBuilder();
      const N = 220, M = 18;
      const frame = (u) => {
        const p = path(u), q = path(u + 0.01);
        const tng = norm3(sub3(q, p));
        const side = norm3(cross3(tng, [0, 1, 0]));
        const up = cross3(side, tng);
        return { p, side, up };
      };
      const rad = (i, j) => 2.3 + 0.35 * Math.sin(i * 0.9) + 0.18 * Math.sin((j / M) * TAU * 3 + i * 0.4);   // periodic in j: no seam
      const at = (i, j) => {
        const { p, side, up } = frame((i / N) * TAU);
        const a = (j / M) * TAU, r = rad(i, j);
        return [p[0] + (side[0] * Math.cos(a) + up[0] * Math.sin(a)) * r, p[1] + (side[1] * Math.cos(a) + up[1] * Math.sin(a)) * r, p[2] + (side[2] * Math.cos(a) + up[2] * Math.sin(a)) * r];
      };
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
          const fold = 0.5 + 0.5 * Math.sin(i * 0.9);
          const color = mix(mix(FLESH, CORAL, 0.35), mix(PINK, WHITE, 0.25), fold * 0.6);
          wall.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), jitter(color, rnd, 0.12));
        }
      }
      for (let v = 0; v < 26; v++) {
        const i0 = Math.floor(rnd() * N), j0 = rnd() * M;
        const pts = [];
        for (let k = 0; k < 7; k++) pts.push(at(i0 + k, j0 + Math.sin(k * 0.8 + v) * 1.2).map((c, n) => c * 0.985 + path((i0 + k) / N * TAU)[n] * 0.015));
        curve(vessels, pts, 0.022, mix(BLOOD, VIOLET, 0.35), rnd, { segs: 4 });
      }
      return { phase: rnd() * TAU, wall: kit.mesh(wall), vessels: kit.mesh(vessels), path, dust: kit.cloud(seeds(300, 511)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [2, 22]);
      const u = s.phase + t.camera * 0.012;
      const eye = s.path(u);
      const target = s.path(u + 0.08);
      beginScene(k, tone, t, eye, target, env, { stars: 0, glow: 0.05 }, { fov: 1.15 });
      // the light at the tip of the scope: the wall glows near the viewer and fades into the dark
      const lamp = { uLightPos: eye, uLightColor: mix(WHITE, accent, 0.15) };
      lit(k, s.wall, env, tone, { uEmit: 0.12, uRim: mix(CORAL, WHITE, 0.4), ...lamp });
      k.solid(s.vessels, { ...light(env), uEmit: 0.5, uTint: mix(BLOOD, WHITE, 0.15), ...lamp });
      dust(k, s, t, tone, target, [3, 3, 3], { uShape: 0, uVel: [0, 0.05, 0], uSize: 0.04, uColorA: mix(WHITE, accent, 0.3), uAlpha: 0.45 });
    },
  },

  petscan: {
    build(kit, rnd) {
      // A PET ring of detector blocks, the patient on the couch, hot spots that light up.
      const ring = new MeshBuilder();
      const blocks = 48;
      for (let i = 0; i < blocks; i++) {
        const a = (i / blocks) * TAU;
        const c = [Math.cos(a) * 5.4, 5 + Math.sin(a) * 5.4, 0];
        for (let z = -1.5; z <= 1.5; z += 0.75) box(ring, [c[0], c[1], z], [0.55, 0.55, 0.6], mix([0.22, 0.26, 0.34], STEEL, rnd() * 0.3), { rnd });
      }
      torus(ring, [0, 5, -2.1], 6.4, 0.5, PAPER, rnd, { nu: 64, nv: 10 });
      torus(ring, [0, 5, 2.1], 6.4, 0.5, PAPER, rnd, { nu: 64, nv: 10 });
      const couch = new MeshBuilder();
      box(couch, [0, 2.4, 0], [1.6, 0.25, 22], mix(STEEL, WHITE, 0.4), { rnd });
      box(couch, [0, 1.2, 6], [1.2, 2.2, 2], STEEL, { rnd });
      const body = new MeshBuilder();
      lumpy(body, [0, 3.35, -2.5], [1.0, 0.65, 3.2], mix(FLESH, WHITE, 0.2), rnd, { detail: 2, bump: 0.08 });
      lumpy(body, [0, 3.4, 1.8], [0.55, 0.55, 0.6], mix(FLESH, WHITE, 0.2), rnd, { detail: 2, bump: 0.06 });
      const hot = new MeshBuilder();
      const spots = [[0.3, 3.5, -1.2], [-0.4, 3.4, -3.4], [0.1, 3.55, 1.8], [0.5, 3.3, -4.6]];
      spots.forEach((p, i) => ball(hot, p, 0.22 + (i % 2) * 0.1, WHITE, rnd, { detail: 1 }));
      return { phase: rnd() * TAU, ring: kit.mesh(ring), couch: kit.mesh(couch), body: kit.mesh(body), hot: kit.mesh(hot), spots, rays: kit.cloud(seeds(500, 521)), dust: kit.cloud(seeds(200, 523)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [12, 55]);
      const eye = swing(s, t, 15, 6.5, 0.7, 9);
      beginScene(k, tone, t, eye, [0, 4.4, -1], env, { stars: 0.4, glow: 0.1, sunSize: 0.01 });
      gridFloor(k, env, tone, 160, 2);
      lit(k, s.ring, env, tone, { uEmit: 0.2 });
      lit(k, s.couch, env, tone);
      glass(k, s.body, env, tone, 0.55, { uEmit: 0.3 });
      // hot spots: FDG uptake glowing in the warm PET colours, beating slowly
      const beat = 0.6 + 0.4 * Math.sin(t.objects * 1.4);
      k.solid(s.hot, { ...light(env), uEmit: 1, uTint: mix(mix(CORAL, ORANGE, 0.5), YELLOW, beat * 0.6) });
      // annihilation photons: pairs flying out in opposite directions to the detector ring
      for (const [i, p] of s.spots.entries()) {
        const a = t.objects * 0.9 + i * 1.7;
        const dir = [Math.cos(a), Math.sin(a), 0];
        k.points(s.rays, { uShape: 0, uCenter: [p[0] + dir[0] * 2.6, p[1] + dir[1] * 2.6, p[2]], uBox: [Math.abs(dir[0]) * 2.4 + 0.05, Math.abs(dir[1]) * 2.4 + 0.05, 0.05], uTime: t.objects, uTwinkle: 0.8, uSize: 0.08, uColorA: mix(YELLOW, WHITE, 0.5), uColorB: accent, uAlpha: 0.8 });
        k.points(s.rays, { uShape: 0, uCenter: [p[0] - dir[0] * 2.6, p[1] - dir[1] * 2.6, p[2]], uBox: [Math.abs(dir[0]) * 2.4 + 0.05, Math.abs(dir[1]) * 2.4 + 0.05, 0.05], uTime: t.objects + 3, uTwinkle: 0.8, uSize: 0.08, uColorA: mix(YELLOW, WHITE, 0.5), uColorB: accent, uAlpha: 0.8 });
      }
      dust(k, s, t, tone, [0, 5, 0], [24, 10, 20], { uShape: 0, uVel: [0.1, 0.2, 0], uSize: 0.05, uColorA: ORANGE, uAlpha: 0.4 });
    },
  },

  linac: {
    build(kit, rnd) {
      // A radiotherapy linear accelerator. box() places a box by its bottom; the turning parts (drum, arm,
      // head, collimator, beam) are built round the isocentre (0, 3.2, 0), the point every beam aims at.
      const stand = new MeshBuilder();
      box(stand, [0, 0, -6.6], [6.5, 8, 2.6], mix(PAPER, STEEL, 0.2), { rnd });
      box(stand, [0, 0, -5.2], [7.5, 0.25, 4], mix(STEEL, INK, 0.3), { rnd });
      const arm = new MeshBuilder();
      torus(arm, [0, 0, -4.7], 2.4, 0.75, mix(PAPER, WHITE, 0.3), rnd, { nu: 48, nv: 10 });
      box(arm, [0, 2.6, -2.35], [2.3, 1.2, 4.9], PAPER, { rnd });
      box(arm, [0, 1.5, 0], [2.3, 1.7, 2.3], PAPER, { rnd });
      cone(arm, [0, 1.5, 0], 0.85, -0.45, 16, mix(STEEL, INK, 0.25), { rnd });
      // the multi-leaf collimator: leaf pairs of different lengths shape the field
      for (let i = -6; i <= 6; i++) for (const side of [-1, 1]) box(arm, [side * (0.42 + 0.25 * Math.abs(Math.sin(i * 0.7))), 0.98, i * 0.09], [0.45, 0.06, 0.07], mix(STEEL, YELLOW, 0.35), { rnd });
      const beam = new MeshBuilder();
      cone(beam, [0, -0.35, 0], 0.62, 1.35, 20, WHITE, { rnd });
      const couch = new MeshBuilder();
      box(couch, [0, 2.6, 2.0], [1.6, 0.25, 10], mix(INK, STEEL, 0.55), { rnd });
      box(couch, [0, 0, 5.0], [1.1, 2.6, 1.6], STEEL, { rnd });
      lumpy(couch, [0, 3.2, 1.9], [0.7, 0.36, 2.3], mix(FLESH, WHITE, 0.25), rnd, { detail: 2, bump: 0.06 });
      lumpy(couch, [0, 3.25, -0.95], [0.42, 0.42, 0.48], mix(FLESH, WHITE, 0.25), rnd, { detail: 2, bump: 0.05 });
      const lasers = new MeshBuilder();
      rod(lasers, [-9, 3.2, 0], [9, 3.2, 0], 0.015, WHITE, rnd, 3);
      rod(lasers, [0, 3.2, -4], [0, 3.2, 9], 0.015, WHITE, rnd, 3);
      rod(lasers, [0, 0.05, 0], [0, 9, 0], 0.012, WHITE, rnd, 3);
      return { phase: rnd() * TAU, stand: kit.mesh(stand), arm: kit.mesh(arm), couch: kit.mesh(couch), beam: kit.mesh(beam), lasers: kit.mesh(lasers), dust: kit.cloud(seeds(220, 531)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [12, 55]);
      const eye = swing(s, t, 15, 6, 0.7, 9);
      beginScene(k, tone, t, eye, [0, 3.6, -0.5], env, { stars: 0.3, glow: 0.1, sunSize: 0.01 });
      gridFloor(k, env, tone, 160, 2);
      lit(k, s.stand, env, tone);
      lit(k, s.couch, env, tone);
      // the gantry turns round the long axis of the couch through the isocentre
      const g = Math.sin(t.objects * 0.25) * 2.4;
      modelMatrix(k.model, [0, 3.2, 0], 0, 0, g, 1);
      lit(k, s.arm, env, tone, { uEmit: 0.25 }, { model: k.model });
      const on = Math.sin(t.objects * 0.9) > -0.3 ? 1 : 0.2;
      glass(k, s.beam, env, tone, 0.4 * on, { uEmit: 1, uTint: mix(accent, WHITE, 0.45) }, k.model);
      k.solid(s.lasers, { ...light(env), uEmit: 1, uTint: GREEN });
      dust(k, s, t, tone, [0, 4, 0], [20, 8, 16], { uShape: 0, uVel: [0.1, 0.25, 0], uSize: 0.05, uColorA: accent, uAlpha: 0.45 });
    },
  },
  pacs: {
    build(kit, rnd) {
      const racks = new MeshBuilder();
      const leds = new MeshBuilder();
      for (const side of [-1, 1]) {
        for (let z = -63; z <= 63; z += 1.5) {
          box(racks, [side * 4, 0, z], [1.2, 4.2, 1.4], mix([0.16, 0.18, 0.22], STEEL, rnd() * 0.15), { rnd });
          box(racks, [side * 3.4, 0.3, z], [0.04, 3.6, 1.2], [0.08, 0.09, 0.12], { rnd });
          for (let r = 0; r < 8; r++) {
            const color = pick([GREEN, GREEN, BLUE, TEAL, ORANGE], Math.floor(rnd() * 5));
            box(leds, [side * 3.37, 0.55 + r * 0.44, z + (rnd() - 0.5) * 0.8], [0.04, 0.06, 0.18 + rnd() * 0.2], color, { rnd });
          }
        }
        rod(racks, [side * 4, 4.8, -64], [side * 4, 4.8, 64], 0.12, STEEL, rnd);
        rod(racks, [side * 4.2, 4.6, -64], [side * 4.2, 4.6, 64], 0.06, mix(BLUE, STEEL, 0.5), rnd, 4);
      }
      // Cold-aisle tiles: a lit strip down the middle of the floor.
      const strip = new MeshBuilder();
      for (let z = -63; z <= 63; z += 3) box(strip, [0, 0.01, z], [0.6, 0.02, 1.6], WHITE, { rnd });
      return { phase: rnd() * TAU, racks: kit.mesh(racks), leds: kit.mesh(leds), strip: kit.mesh(strip), blink: kit.cloud(seeds(900, 501)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [6, 40]);
      const a = s.phase + t.camera * pathClock(40, 10);
      const z = Math.sin(a) * 40;
      const heading = ((1 - Math.cos(a)) / 2) * Math.PI;
      const eye = [Math.sin(t.camera * 0.04) * 0.5, 2.1 + Math.sin(t.camera * 0.05) * 0.15, z];
      const target = [eye[0] + Math.sin(heading) * 10, 1.9, z + Math.cos(heading) * 10];
      beginScene(k, tone, t, eye, target, env, { stars: 0.2 }, { fov: 1.0 });
      gridFloor(k, env, tone, 160, 1.5);
      lit(k, s.racks, env, tone, { uEmit: 0.15, uLightPos: [eye[0], 4.4, eye[2]], uLightColor: mix(accent, WHITE, 0.5) });
      k.solid(s.leds, { ...light(env), uEmit: 1, uTint: WHITE });
      k.solid(s.strip, { ...light(env), uEmit: 1, uTint: mix(accent, INK, 0.55) });
      for (const side of [-1, 1]) {
        k.points(s.blink, { uShape: 0, uCenter: [side * 3.32, 2.1, eye[2]], uBox: [0.02, 3.4, 80], uBlink: 1, uTime: t.objects * 3, uSize: 0.05, uColorA: mix(GREEN, WHITE, 0.3), uColorB: accent, uAlpha: 0.95 });
      }
    },
  },

  voxels: {
    build(kit, rnd) {
      const vol = new MeshBuilder();
      const N = 13;
      const cell = 0.52;
      const C = [0, 4.6, 0];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          for (let l = 0; l < N; l++) {
            const p = [(i - (N - 1) / 2) * cell, (j - (N - 1) / 2) * cell, (l - (N - 1) / 2) * cell];
            if (p[0] > 0 && p[2] > 0) continue;
            const wob = 1 + 0.08 * Math.sin(p[0] * 2.1 + p[1] * 1.3) + 0.06 * Math.cos(p[2] * 2.7);
            const d = Math.hypot(p[0] / 3.2, p[1] / 2.9, p[2] / 2.7) * wob;
            if (d > 1) continue;
            const v = 1 - d + (rnd() - 0.5) * 0.12;
            box(vol, [C[0] + p[0], C[1] + p[1] - cell * 0.41, C[2] + p[2]], [cell * 0.82, cell * 0.82, cell * 0.82], ramp(v * 1.25), { rnd });
          }
        }
      }
      // Three MPR planes: axial, sagittal and coronal, each with its frame.
      const planes = [];
      const frames = [];
      const H = 4.2;
      for (const axis of [1, 0, 2]) {
        const pb = new MeshBuilder();
        const fb = new MeshBuilder();
        const size = [2 * H, 2 * H, 2 * H];
        size[axis] = 0.03;
        box(pb, [0, -size[1] / 2, 0], size, WHITE, { rnd });
        const corner = (u, v) => {
          const q = [0, 0, 0];
          const [ua, va] = [0, 1, 2].filter((x) => x !== axis);
          q[ua] = u * H;
          q[va] = v * H;
          return q;
        };
        curve(fb, [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)], 0.04, WHITE, rnd, { segs: 4 });
        planes.push(kit.mesh(pb));
        frames.push(kit.mesh(fb));
      }
      return { phase: rnd() * TAU, vol: kit.mesh(vol), planes, frames, dust: kit.cloud(seeds(200, 511)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [16, 60]);
      const { eye } = fly(s, t, 15, 10, 7.2, 1);
      const sky = beginScene(k, tone, t, eye, [0, 4.4, 0], env, { stars: 0.5, nebula: 0.25 });
      const C = [0, 4.6, 0];
      const offsets = [
        [0, Math.sin(t.objects * 0.25) * 2.8, 0],
        [Math.sin(t.objects * 0.21 + 1) * 3, 0, 0],
        [0, 0, Math.sin(t.objects * 0.23 + 2) * 2.6],
      ];
      const colors = [CORAL, GREEN, BLUE];
      mirrored(k, sky, env, () => {
        lit(k, s.vol, env, tone, { uEmit: 0.45 });
        s.planes.forEach((plane, i) => {
          modelMatrix(k.model, add3(C, offsets[i]), 0, 0, 0, 1);
          k.solid(s.frames[i], { ...light(env), uEmit: 1, uTint: mix(colors[i], accent, 0.25) }, { model: k.model });
          glass(k, plane, env, tone, 0.12, { uEmit: 1, uTint: mix(colors[i], accent, 0.25) }, k.model);
        });
      }, { span: 100 });
      dust(k, s, t, tone, C, [20, 10, 20], { uSwirl: 0.15 });
    },
  },

  hospital: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const WALL = [0.82, 0.85, 0.9];
      box(b, [0, 0, 0], [10, 14, 7], WALL, { rnd, win: 1 });
      for (const side of [-1, 1]) box(b, [side * 10, 0, 1.5], [9, 7.5, 9], mix(WALL, BLUE, 0.1), { rnd, win: 1 });
      box(b, [0, 0, -11], [16, 4.5, 6], mix(WALL, STEEL, 0.3), { rnd, win: 1 });
      box(b, [0, 0, 3.5], [5, 3.2, 3], mix(WALL, TEAL, 0.25), { rnd });
      box(b, [0, 3.2, 3.6], [6.4, 0.25, 3.8], STEEL, { rnd });
      // Helipad on the tower roof.
      cone(b, [0, 14, 0], 3, 0.15, 24, [0.2, 0.22, 0.26], { top: 3, rnd });
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * TAU;
        const a1 = ((i + 1) / 24) * TAU;
        b.tri([0, 14.15, 0], [Math.cos(a0) * 3, 14.15, Math.sin(a0) * 3], [Math.cos(a1) * 3, 14.15, Math.sin(a1) * 3], [0.2, 0.22, 0.26]);
      }
      for (const x of [-0.65, 0.65]) box(b, [x, 14.15, 0], [0.32, 0.04, 1.8], WHITE, { rnd });
      box(b, [0, 14.15, 0], [1.3, 0.04, 0.32], WHITE, { rnd });
      for (let x = -40; x <= 40; x += 8) rod(b, [x, 0, 13.2], [x, 3.05, 13.2], 0.07, STEEL, rnd, 5);
      // Roads, parking and an ambulance at the door.
      box(b, [0, 0, 11], [90, 0.04, 3.6], [0.12, 0.13, 0.15], { rnd });
      box(b, [0, 0, 7.5], [3.2, 0.04, 4], [0.12, 0.13, 0.15], { rnd });
      for (let i = 0; i < 14; i++) {
        const x = 8 + (i % 7) * 2.2;
        const z = 14.5 + Math.floor(i / 7) * 3.6;
        if (rnd() < 0.25) continue;
        box(b, [x, 0, z], [1.6, 0.9, 2.6], pick([CORAL, BLUE, PAPER, STEEL, YELLOW], Math.floor(rnd() * 5)), { rnd });
      }
      box(b, [3.4, 0, 7.4], [1.9, 2, 4], WHITE, { rnd, yaw: 0.1 });
      for (let i = 0; i < 46; i++) {
        const a = rnd() * TAU;
        const r = 19 + rnd() * 12;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (Math.abs(z - 11) < 3) continue;
        roundTree(b, x, z, 2.5 + rnd() * 2.5, mix([0.28, 0.55, 0.34], TEAL, rnd() * 0.3), [0.32, 0.23, 0.18], rnd);
      }
      const signs = new MeshBuilder();
      box(signs, [0, 10.4, 3.55], [0.8, 2.4, 0.1], WHITE, { rnd });
      box(signs, [0, 11.2, 3.56], [2.4, 0.8, 0.1], WHITE, { rnd });
      box(signs, [3.4, 2, 7.4], [0.5, 0.25, 0.5], CORAL, { rnd, yaw: 0.1 });
      const lights = new MeshBuilder();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        ball(lights, [Math.cos(a) * 2.9, 14.2, Math.sin(a) * 2.9], 0.09, WHITE, rnd, { detail: 0 });
      }
      for (let x = -40; x <= 40; x += 8) ball(lights, [x, 3.2, 13.2], 0.18, WHITE, rnd, { detail: 0 });
      return { phase: rnd() * TAU, campus: kit.mesh(b), signs: kit.mesh(signs), lights: kit.mesh(lights), flies: kit.cloud(seeds(200, 521)) };
    },
    draw(k, s, t, tone) {
      const { accent, c } = tone;
      const env = labLight(tone, [30, 110]);
      const { eye } = fly(s, t, 36, 20, 13, 1.2);
      beginScene(k, tone, t, eye, [0, 5, 0], env, { stars: 0.7, glow: 0.3, sunSize: 0.014, horizon: [0.12, 0.1, 0.2] });
      const grass = c([0.05, 0.09, 0.07]);
      k.terrain({ mode: TERRAIN.flat }, { ...light(env), uLow: grass, uMid: grass, uHigh: grass, uPeak: grass, uSpan: 260 });
      k.solid(s.campus, { ...light(env), uEmit: 0.12, uTint: WHITE, uRim: mix(accent, WHITE, 0.3), uWindows: 1, uWinColor: mix([1, 0.86, 0.6], accent, 0.25), uTime: t.objects });
      const blink = 0.6 + 0.4 * Math.max(0, Math.sin(t.objects * 1.6));
      k.solid(s.signs, { ...light(env), uEmit: 1, uTint: [1, 0.3, 0.32] });
      k.solid(s.lights, { ...light(env), uEmit: 1, uTint: mix(YELLOW, WHITE, 0.4).map((v) => v * blink) });
      k.points(s.flies, { uCenter: [0, 2, 0], uBox: [70, 4, 70], uWobble: [0.6, 0.4, 0.6], uWobbleFreq: 0.5, uTwinkle: 0.8, uTime: t.objects, uSize: 0.1, uColorA: YELLOW, uColorB: accent, uAlpha: 0.7 });
    },
  },

  lungs: {
    build(kit, rnd) {
      const tissue = new MeshBuilder();
      const L = [[-2.1, 0, 0], [2.1, 0, 0]];
      const radii = [1.85, 3.1, 1.55];
      for (const c of L) lumpy(tissue, c, radii, PINK, rnd, { detail: 3, bump: 0.08 });
      const airway = new MeshBuilder();
      const pipe = mix(PAPER, TEAL, 0.25);
      rod(airway, [0, 5.4, 0], [0, 2.4, 0], 0.32, pipe, rnd, 10);
      for (let y = 2.7; y < 5.3; y += 0.4) rod(airway, [0, y, 0], [0, y + 0.12, 0], 0.37, PAPER, rnd, 10);
      L.forEach((c, i) => {
        const side = i ? 1 : -1;
        const start = [side * 1.3, 1.5, 0];
        rod(airway, [0, 2.4, 0], start, 0.22, pipe, rnd, 8);
        ball(airway, [0, 2.4, 0], 0.32, pipe, rnd, { detail: 1 });
        const inside = (q) => ((q[0] - c[0]) / radii[0]) ** 2 + ((q[1] - c[1]) / radii[1]) ** 2 + ((q[2] - c[2]) / radii[2]) ** 2 < 0.8;
        for (const dir of [[side * 0.35, -1, 0.15], [side * 0.6, 0.6, -0.15], [side * 0.5, -0.4, 0.4]]) {
          grow(airway, start, norm3(dir), 1.1, 0.15, 4, () => pipe, rnd, inside, 0.6);
        }
      });
      const heartMesh = new MeshBuilder();
      heart(heartMesh, rnd, 0.62);
      return { phase: rnd() * TAU, tissue: kit.mesh(tissue), airway: kit.mesh(airway), heart: kit.mesh(heartMesh), bubbles: kit.cloud(seeds(240, 531)), dust: kit.cloud(seeds(160, 532)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [14, 55]);
      const { eye } = fly(s, t, 13, 9, 5.6, 1);
      const sky = beginScene(k, tone, t, eye, [0, 5.2, 0], env, { stars: 0.5, nebula: 0.3, nebA: PINK });
      const breath = 1 + 0.04 * Math.sin(t.objects * 0.7);
      mirrored(k, sky, env, () => {
        modelMatrix(k.model, [0.5, 3.9, 0.9], 0.3, 0, 0, 1 + 0.03 * Math.max(0, Math.sin(t.objects * 4)));
        lit(k, s.heart, env, tone, { uEmit: 0.4 }, { model: k.model });
        modelMatrix(k.model, [0, 5.1, 0], 0, 0, 0, breath);
        k.solid(s.airway, { ...light(env), uEmit: 0.6, uTint: mix(WHITE, accent, 0.3), uRim: mix(accent, WHITE, 0.4) }, { model: k.model });
        glass(k, s.tissue, env, tone, 0.24, { uTint: mix(PINK, accent, 0.25) }, k.model);
      }, { span: 100 });
      k.points(s.bubbles, { uShape: 4, uCenter: [0, 6, 0], uBox: [16, 12, 16], uVel: [0, 0.5, 0], uWobble: [0.3, 0, 0.3], uWobbleFreq: 0.5, uTime: t.objects, uSize: 0.22, uColorA: mix(accent, WHITE, 0.4), uColorB: TEAL, uAlpha: 0.45 });
      dust(k, s, t, tone, [0, 5, 0], [20, 10, 20], { uSwirl: 0.1, uSize: 0.06 });
    },
  },

  spine: {
    build(kit, rnd) {
      const bones = new MeshBuilder();
      const discs = new MeshBuilder();
      const cord = [];
      const n = 24;
      for (let i = 0; i < n; i++) {
        const y = 1.9 + i * 0.44;
        const z = 0.45 * Math.sin(i * 0.27 - 0.9);
        const r = 0.82 - i * 0.014;
        ball(bones, [0, y, z], [r, 0.19, r * 0.82], BONE, rnd, { detail: 2 });
        if (i < n - 1) ball(discs, [0, y + 0.22, z], [r * 0.86, 0.07, r * 0.7], WHITE, rnd, { detail: 1 });
        const back = z - r * 0.82;
        rod(bones, [0, y, back + 0.1], [0, y - 0.22, back - 0.75], 0.1, BONE, rnd, 5);
        ball(bones, [0, y - 0.24, back - 0.78], 0.13, BONE, rnd, { detail: 0 });
        for (const side of [-1, 1]) rod(bones, [side * 0.3, y, back + 0.25], [side * (r + 0.55), y + 0.02, back + 0.05], 0.08, BONE, rnd, 5);
        cord.push([0, y, back - 0.25]);
      }
      lumpy(bones, [0, 1.1, -0.35], [1.0, 0.75, 0.6], BONE, rnd, { detail: 2, bump: 0.08 });
      for (const side of [-1, 1]) lumpy(bones, [side * 1.55, 1.3, -0.15], [1.1, 1.0, 0.4], BONE, rnd, { detail: 2, bump: 0.1 });
      const nerve = new MeshBuilder();
      curve(nerve, cord, 0.09, WHITE, rnd, { segs: 6 });
      cord.forEach((p, i) => {
        if (i % 2) return;
        for (const side of [-1, 1]) rod(nerve, p, [side * 1.4, p[1] - 0.3, p[2] - 0.2], 0.025, WHITE, rnd, 3);
      });
      return { phase: rnd() * TAU, bones: kit.mesh(bones), discs: kit.mesh(discs), nerve: kit.mesh(nerve), signal: kit.cloud(seeds(90, 541)), dust: kit.cloud(seeds(200, 542)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = labLight(tone, [12, 50]);
      const { eye } = fly(s, t, 14.5, 10, 6.8, 1);
      const sky = beginScene(k, tone, t, eye, [0, 6.5, 0], env, { stars: 0.5, nebula: 0.3, glow: 0.12, sunSize: 0.01 });
      mirrored(k, sky, env, () => {
        lit(k, s.bones, env, tone, { uEmit: 0.4, uTint: mix(WHITE, accent, 0.1) });
        k.solid(s.discs, { ...light(env), uEmit: 0.8, uTint: mix(TEAL, accent, 0.5) });
        k.solid(s.nerve, { ...light(env), uEmit: 1, uTint: mix(YELLOW, accent, 0.4) });
      }, { span: 90 });
      k.points(s.signal, { uShape: 5, uCenter: [0, 7, -0.9], uBox: [0.25, 10.5, 1], uVel: [0, 1.6, 0], uTime: t.objects, uSize: 0.12, uColorA: mix(YELLOW, WHITE, 0.4), uColorB: accent, uAlpha: 0.85 });
      dust(k, s, t, tone, [0, 7, 0], [18, 12, 18], { uSwirl: 0.12, uSize: 0.06 });
    },
  },
};

export function sceneOf(id) {
  return SCENES[id] ?? SCENES.ctgantry;
}

export const SCENE_IDS = Object.keys(SCENES);

/** Free the buffers a scene's build made. */
export function releaseScene(kit, state) {
  for (const value of Object.values(state ?? {})) {
    if (Array.isArray(value)) for (const item of value) { if (item?.buffer) kit.release(item); }
    else if (value?.buffer) kit.release(value);
  }
}
