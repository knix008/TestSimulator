// The 3D start scenes. Each one is a mind-mapping world: radial maps, neurons,
// org charts, fishbones, sticky notes and the rest. A scene builds its meshes
// once (`build`) and draws a frame from three clocks (`draw`): `camera` moves
// the viewer, `objects` moves sparks, bubbles, orbits and signals, `sky` moves
// stars and light. Every clock runs at its own speed from Settings.
import { modelMatrix } from './gl.js';
import { blossomTree, box, cone, MeshBuilder, roundTree, seeds, solid, sphereFaces, tube } from './meshes.js';
import { TERRAIN } from './terrain.js';

const TAU = Math.PI * 2;
// One pace for every scene. Scenery sweeps past at SWEEP radians per clock
// unit (world speed / look distance), so a speed setting is the same number
// on a radial map, an org chart and the rest. Local blinks stay as they are.
const SWEEP = 0.1;
const pathClock = (radius, look) => (SWEEP * look) / radius;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Branch colours, the same rainbow a mind map gives its main topics.
const CORAL = [0.98, 0.45, 0.42];
const ORANGE = [1, 0.66, 0.3];
const YELLOW = [0.98, 0.84, 0.36];
const GREEN = [0.45, 0.84, 0.5];
const TEAL = [0.3, 0.82, 0.82];
const BLUE = [0.42, 0.6, 1];
const VIOLET = [0.66, 0.5, 0.98];
const PINK = [0.95, 0.5, 0.78];
const BRANCH = [CORAL, ORANGE, YELLOW, GREEN, TEAL, BLUE, VIOLET, PINK];
const PAPER = [0.93, 0.94, 0.97];
const LINK = [0.55, 0.6, 0.7];
const TEXT = [0.13, 0.14, 0.19];
const INK = [0.05, 0.06, 0.09];
const WHITE = [1, 1, 1];
const NOTE = [[1, 0.9, 0.42], [1, 0.66, 0.74], [0.62, 0.9, 0.62], [0.58, 0.8, 1], [1, 0.74, 0.42]];

const ahead = (eye, dir, dist, dy = 0) => [eye[0] + dir[0] * dist, eye[1] + dy, eye[2] + dir[2] * dist];
const pick = (list, i) => list[((i % list.length) + list.length) % list.length];

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

/** A soft study lamp, theme-tinted, so topics read as solid objects. */
function mapLight(tone, fogRange = [30, 150]) {
  const { c, accent } = tone;
  return {
    sun: [0.3, 0.88, 0.36],
    sunColor: mix([0.62, 0.6, 0.78], accent, 0.35),
    ambient: [0.3, 0.3, 0.38],
    fog: c([0.04, 0.05, 0.09]),
    fogRange,
  };
}

function mapSky(tone, t, extra = {}) {
  const { c, accent } = tone;
  return skyOf({
    zenith: c(extra.zenith ?? [0.014, 0.016, 0.05]),
    horizon: c(extra.horizon ?? [0.08, 0.08, 0.17]),
    sun: [0.2, 0.95, 0.55],
    sunColor: extra.glow ? mix([1, 0.85, 0.6], accent, 0.4) : [0, 0, 0],
    sunSize: extra.sunSize ?? 0,
    glow: extra.glow ?? 0,
    stars: extra.stars ?? 0.5,
    milky: extra.milky ?? 0,
    nebula: extra.nebula ?? 0,
    nebA: mix(accent, VIOLET, 0.5),
    nebB: TEAL,
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
  const sky = mapSky(tone, t, skyExtra);
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

/** Draw `draw` twice, once upside down under a still mirror floor. */
function mirrored(k, sky, env, draw, o = {}) {
  k.beginMirror();
  k.sky(sky);
  draw();
  k.endMirror();
  k.water({
    uSpan: o.span ?? 100, uWave: o.wave ?? 0, uRipple: o.ripple ?? 0, uTime: o.time ?? 0, uSun: env.sun, uSunColor: env.sunColor,
    uDeep: o.deep ?? [0.025, 0.03, 0.05], uShallow: o.shallow ?? [0.04, 0.045, 0.07], uZenith: sky.uZenith, uHorizon: sky.uHorizon,
    uFog: env.fog, uFogRange: env.fogRange, uMirror: o.mirror ?? 0.55, uSpec: 0.4, uShine: 300,
  });
  draw();
}

/** Lit topics: bright enough to read against the dark, with a rim in the accent. */
function topics(k, geo, env, tone, extra = {}) {
  k.solid(geo, { ...light(env), uEmit: 0.32, uTint: WHITE, uRim: mix(tone.accent, WHITE, 0.35), ...extra });
}

// ── Geometry ────────────────────────────────────────────────────────────────

const jitter = (color, rnd, spread = 0.08) => {
  const k = 1 - spread / 2 + rnd() * spread;
  return color.map((v) => v * k);
};

/** A round topic (an ellipsoid with radii `r` or [rx, ry, rz]). */
function ball(b, c, r, color, rnd, { detail = 1, squash = 1 } = {}) {
  const [rx, ry, rz] = Array.isArray(r) ? r : [r, r * squash, r];
  const at = (p) => [c[0] + p[0] * rx, c[1] + p[1] * ry, c[2] + p[2] * rz];
  for (const [p, q, s] of sphereFaces(detail)) b.tri(at(p), at(q), at(s), jitter(color, rnd, 0.06), { root: [c[0], c[2]] });
}

/** A lumpy ellipsoid: a brain lobe, a thought cloud. */
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

/** A diamond (octahedron) with half-sizes `s`: decisions and milestones. */
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

/**
 * A mind-map branch: an S-curve from p0 to p1, thick at the parent and thin at
 * the child. `rise` lifts the middle into an arch; `dash` leaves every other piece out.
 */
function branch(b, p0, p1, r0, r1, color, rnd, { steps = 10, rise = 0, dash = false } = {}) {
  const d = sub3(p1, p0);
  const c1 = [p0[0] + d[0] * 0.45, p0[1] + rise, p0[2] + d[2] * 0.45];
  const c2 = [p1[0] - d[0] * 0.45, p1[1] + rise, p1[2] - d[2] * 0.45];
  const at = (t) => {
    const u = 1 - t;
    return [0, 1, 2].map((i) => u * u * u * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * p1[i]);
  };
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const next = at(i / steps);
    const r = r0 + (r1 - r0) * ((i - 0.5) / steps);
    if (!dash || i % 2) {
      rod(b, prev, next, r, color, rnd);
      if (!dash && i < steps) ball(b, next, r, color, rnd, { detail: 0 });
    }
    prev = next;
  }
}

/** A right-angle connector: along axis `k` to the middle, across, then on to p1. */
function elbow(b, p0, p1, r, color, rnd, k = 1) {
  const mid = (p0[k] + p1[k]) / 2;
  const a = [...p0];
  const c = [...p1];
  a[k] = mid;
  c[k] = mid;
  rod(b, p0, a, r, color, rnd);
  rod(b, a, c, r, color, rnd);
  rod(b, c, p1, r, color, rnd);
  ball(b, a, r, color, rnd, { detail: 0 });
  ball(b, c, r, color, rnd, { detail: 0 });
}

/** A topic card standing on `base` and facing +z, with a line or two of "text". */
function card(b, base, size, color, rnd, lines = 1) {
  const [w, h, d] = size;
  box(b, base, size, color, { rnd });
  for (let i = 0; i < lines; i++) {
    const lw = w * (i ? 0.42 : 0.64);
    const y = base[1] + h * (lines === 1 ? 0.43 : 0.6 - i * 0.32);
    box(b, [base[0] - w * 0.34 + lw / 2, y, base[2] + d / 2 + 0.012], [lw, h * 0.14, 0.03], TEXT, { rnd });
  }
}

/** A flat topic lying on the floor (seen from above), with text on its top. */
function tile(b, center, size, color, rnd) {
  const [w, h, d] = size;
  box(b, center, size, color, { rnd });
  box(b, [center[0] - w * 0.1, center[1] + h, center[2]], [w * 0.62, 0.02, d * 0.2], TEXT, { rnd });
}

/** An arrowhead pointing down (negative `h`) or up from `tip`'s base. */
function arrow(b, at, h, color, rnd) {
  cone(b, at, 0.2, h, 8, color, { rnd });
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

/** A small flowchart standing at (ox, oz): start, steps, a decision with a loop, end. */
function flowchart(b, ox, oz, rnd, color) {
  const x = ox;
  const z = oz;
  const lineC = mix(LINK, color, 0.3);
  const pill = (y, c) => {
    box(b, [x, y - 0.45, z], [2.2, 0.9, 0.5], c, { rnd });
    ball(b, [x - 1.1, y, z], [0.45, 0.45, 0.25], c, rnd);
    ball(b, [x + 1.1, y, z], [0.45, 0.45, 0.25], c, rnd);
  };
  pill(11, GREEN);
  card(b, [x, 7.9, z], [3, 1.1, 0.5], color, rnd, 2);
  gem(b, [x, 6, z], [1.5, 0.95, 0.3], YELLOW, rnd);
  card(b, [x, 3.3, z], [3, 1.1, 0.5], mix(color, WHITE, 0.25), rnd, 2);
  card(b, [x + 4.6, 5.45, z], [2.4, 1.1, 0.5], ORANGE, rnd, 1);
  pill(1.4, CORAL);
  const down = (y0, y1) => {
    rod(b, [x, y0, z], [x, y1 + 0.42, z], 0.07, lineC, rnd);
    arrow(b, [x, y1 + 0.42, z], -0.42, lineC, rnd);
  };
  down(10.55, 9);
  down(7.9, 6.95);
  down(5.05, 4.4);
  down(3.3, 1.85);
  // The "no" path: right to the side step, up and back into the first step.
  rod(b, [x + 1.5, 6, z], [x + 3.4, 6, z], 0.07, lineC, rnd);
  rod(b, [x + 4.6, 6.55, z], [x + 4.6, 8.45, z], 0.07, lineC, rnd);
  rod(b, [x + 4.6, 8.45, z], [x + 1.95, 8.45, z], 0.07, lineC, rnd);
  ball(b, [x + 4.6, 8.45, z], 0.07, lineC, rnd, { detail: 0 });
  gem(b, [x + 1.85, 8.45, z], [0.3, 0.2, 0.2], lineC, rnd);
}

const SCENES = {
  radial: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const center = [0, 2.6, 0];
      ball(b, center, [1.6, 1.05, 1.25], PAPER, rnd, { detail: 2 });
      const mains = 7;
      for (let i = 0; i < mains; i++) {
        const color = BRANCH[i % BRANCH.length];
        const a = (i / mains) * TAU + (rnd() - 0.5) * 0.3;
        const len = 6 + rnd() * 1.5;
        const p = [Math.cos(a) * len, 1.4 + rnd() * 2.6, Math.sin(a) * len];
        branch(b, center, p, 0.22, 0.1, color, rnd);
        ball(b, p, [0.75, 0.45, 0.6], color, rnd);
        const subs = 2 + Math.floor(rnd() * 2);
        for (let j = 0; j < subs; j++) {
          const sa = a + (j - (subs - 1) / 2) * 0.42;
          const sl = 3 + rnd() * 1.2;
          const q = [p[0] + Math.cos(sa) * sl, p[1] + (rnd() - 0.5) * 1.6, p[2] + Math.sin(sa) * sl];
          const light2 = mix(color, WHITE, 0.25);
          branch(b, p, q, 0.09, 0.05, color, rnd, { steps: 8 });
          ball(b, q, [0.42, 0.26, 0.34], light2, rnd);
          for (let l = 0; l < 2; l++) {
            const la = sa + (l - 0.5) * 0.7;
            const leaf = [q[0] + Math.cos(la) * 1.7, q[1] + (rnd() - 0.5), q[2] + Math.sin(la) * 1.7];
            branch(b, q, leaf, 0.045, 0.03, color, rnd, { steps: 5 });
            ball(b, leaf, 0.17, mix(color, WHITE, 0.45), rnd, { detail: 0 });
          }
        }
      }
      return { phase: rnd() * TAU, map: kit.mesh(b), sparks: kit.cloud(seeds(260, 201)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [16, 60]);
      const { eye } = fly(s, t, 19, 14, 7, 1.4);
      const sky = beginScene(k, tone, t, eye, [0, 2, 0], env, { stars: 0.6, nebula: 0.25, glow: 0.12, sunSize: 0.01 });
      mirrored(k, sky, env, () => topics(k, s.map, env, tone), { span: 120 });
      k.points(s.sparks, { uShape: 5, uCenter: [0, 3, 0], uBox: [24, 7, 24], uSwirl: 0.12, uTwinkle: 0.6, uTime: t.objects, uSize: 0.1, uColorA: WHITE, uColorB: accent, uAlpha: 0.7 });
    },
  },

  neurons: {
    build(kit, rnd) {
      const pts = scatter(rnd, 54, [0, 4, 0], [11, 4, 9]);
      const cells = new MeshBuilder();
      const links = new MeshBuilder();
      pts.forEach((p, i) => {
        ball(cells, p, 0.22 + rnd() * 0.22, mix(pick(BRANCH, i), WHITE, 0.35), rnd);
        for (let d = 0; d < 3; d++) {
          const tip = [p[0] + (rnd() - 0.5) * 1.6, p[1] + (rnd() - 0.5) * 1.6, p[2] + (rnd() - 0.5) * 1.6];
          rod(links, p, tip, 0.025, TEAL, rnd, 4);
        }
      });
      for (const [i, j] of nearest(pts, 2)) branch(links, pts[i], pts[j], 0.06, 0.03, TEAL, rnd, { steps: 7, rise: (rnd() - 0.5) * 1.5 });
      return { phase: rnd() * TAU, cells: kit.mesh(cells), links: kit.mesh(links), signals: kit.cloud(seeds(420, 211)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [14, 55]);
      const { eye } = fly(s, t, 17, 12, 5, 1.6);
      beginScene(k, tone, t, eye, [0, 4, 0], env, { stars: 0.9, nebula: 0.5, milky: 0.2 });
      k.solid(s.links, { ...light(env), uEmit: 0.5, uTint: mix(TEAL, accent, 0.45) });
      k.solid(s.cells, { ...light(env), uEmit: 0.75, uTint: WHITE, uRim: mix(accent, WHITE, 0.5) });
      k.points(s.signals, { uShape: 5, uCenter: [0, 4, 0], uBox: [24, 9, 20], uSwirl: 0.2, uTwinkle: 0.8, uBlink: 0.5, uTime: t.objects, uSize: 0.14, uColorA: WHITE, uColorB: accent, uAlpha: 0.85 });
    },
  },

  brain: {
    build(kit, rnd) {
      const shell = new MeshBuilder();
      const inner = new MeshBuilder();
      for (const side of [-1, 1]) lumpy(shell, [side * 1.55, 4.2, 0], [1.9, 2.2, 3.3], PINK, rnd, { detail: 3, bump: 0.12 });
      lumpy(shell, [0, 2.4, -2.5], [2, 1, 1.2], VIOLET, rnd, { detail: 2 });
      rod(shell, [0, 2.9, -1.3], [0, 0.2, -1.8], 0.55, VIOLET, rnd, 10);
      const pts = [-1, 1].flatMap((side) => scatter(rnd, 22, [side * 1.55, 4.2, 0], [1.3, 1.5, 2.4]));
      pts.forEach((p, i) => ball(inner, p, 0.12 + rnd() * 0.08, pick(BRANCH, i), rnd, { detail: 0 }));
      for (const [i, j] of nearest(pts, 2)) rod(inner, pts[i], pts[j], 0.03, mix(TEAL, WHITE, 0.3), rnd, 4);
      return { phase: rnd() * TAU, shell: kit.mesh(shell), inner: kit.mesh(inner), sparks: kit.cloud(seeds(320, 221)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [12, 45]);
      const { eye } = fly(s, t, 11, 8, 5.2, 1);
      const sky = beginScene(k, tone, t, eye, [0, 3.6, 0], env, { stars: 0.7, nebula: 0.4, glow: 0.15, sunSize: 0.01 });
      mirrored(k, sky, env, () => {
        k.solid(s.inner, { ...light(env), uEmit: 0.85, uTint: WHITE });
        k.solid(s.shell, { ...light(env), uEmit: 0.15, uTint: mix(WHITE, accent, 0.3), uRim: mix(accent, WHITE, 0.4), uAlpha: 0.28 }, { blend: 'add' });
      }, { span: 80 });
      k.points(s.sparks, { uShape: 5, uCenter: [0, 4.2, 0], uBox: [10, 7, 10], uSwirl: 0.35, uTwinkle: 0.7, uTime: t.objects, uSize: 0.08, uColorA: WHITE, uColorB: accent, uAlpha: 0.8 });
    },
  },

  orgchart: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const root = { pos: [0, 8.6, 0], size: [3.6, 1.3, 0.5] };
      card(b, root.pos, root.size, PAPER, rnd, 2);
      const heads = [-9, -3, 3, 9];
      heads.forEach((x, i) => {
        const color = BRANCH[(i * 2) % BRANCH.length];
        const size = [2.7, 1.05, 0.45];
        const pos = [x, 5.6, 0];
        card(b, pos, size, color, rnd, 2);
        elbow(b, root.pos, [x, pos[1] + size[1], 0], 0.06, LINK, rnd);
        const kids = 2 + (i % 2);
        for (let j = 0; j < kids; j++) {
          const cx = x + (j - (kids - 1) / 2) * 1.95;
          const kidSize = [1.6, 0.85, 0.4];
          card(b, [cx, 2.6, 0], kidSize, mix(color, WHITE, 0.3), rnd, 1);
          elbow(b, pos, [cx, 2.6 + kidSize[1], 0], 0.045, LINK, rnd);
        }
      });
      return { phase: rnd() * TAU, chart: kit.mesh(b), dust: kit.cloud(seeds(160, 231)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [14, 60]);
      const eye = swing(s, t, 18, 5.4, 0.65, 9);
      beginScene(k, tone, t, eye, [0, 5.2, 0], env, { stars: 0.35 });
      gridFloor(k, env, tone, 160, 2);
      topics(k, s.chart, env, tone);
      k.points(s.dust, { uCenter: [0, 5, 2], uBox: [26, 10, 8], uVel: [0.2, 0.25, 0], uTwinkle: 0.5, uTime: t.objects, uSize: 0.06, uColorA: accent, uColorB: WHITE, uAlpha: 0.6 });
    },
  },

  logic: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const y = 0.25;
      const rootAt = [-13, y, 0];
      tile(b, [rootAt[0], 0, 0], [4, 0.7, 2.2], PAPER, rnd);
      const firsts = [-9, -4.5, 0, 4.5, 9];
      firsts.forEach((z, i) => {
        const color = BRANCH[(i + 1) % BRANCH.length];
        const at = [-5, 0, z];
        tile(b, at, [3.2, 0.55, 1.6], color, rnd);
        elbow(b, [rootAt[0] + 2, y, 0], [at[0] - 1.6, y, z], 0.07, LINK, rnd, 0);
        const kids = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < kids; j++) {
          const kz = z + (j - (kids - 1) / 2) * 1.5;
          const kid = [2, 0, kz];
          tile(b, kid, [2.6, 0.42, 1.1], mix(color, WHITE, 0.3), rnd);
          elbow(b, [at[0] + 1.6, y, z], [kid[0] - 1.3, y, kz], 0.05, LINK, rnd, 0);
          if (rnd() < 0.6) {
            const leaf = [8, 0, kz];
            tile(b, leaf, [2.2, 0.3, 0.9], mix(color, WHITE, 0.5), rnd);
            rod(b, [kid[0] + 1.3, y, kz], [leaf[0] - 1.1, y, kz], 0.04, LINK, rnd);
          }
        }
      });
      return { phase: rnd() * TAU, chart: kit.mesh(b), dust: kit.cloud(seeds(200, 241)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [18, 70]);
      const { eye } = fly(s, t, 20, 14, 12, 1.2);
      beginScene(k, tone, t, eye, [-1, 0, 0], env, { stars: 0.3 });
      gridFloor(k, env, tone, 200, 1.5);
      topics(k, s.chart, env, tone);
      k.points(s.dust, { uCenter: [0, 1, 0], uBox: [34, 2, 26], uVel: [0.5, 0.1, 0], uTwinkle: 0.5, uTime: t.objects, uSize: 0.06, uColorA: accent, uColorB: WHITE, uAlpha: 0.6 });
    },
  },

  timeline: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      rod(b, [-72, 0.7, 0], [72, 0.7, 0], 0.16, PAPER, rnd, 10);
      for (let i = -11; i <= 11; i++) {
        const x = i * 6;
        const color = pick(BRANCH, i);
        gem(b, [x, 0.7, 0], [0.42, 0.42, 0.42], color, rnd);
        const h = 2.2 + ((i + 12) % 3) * 1.2;
        rod(b, [x, 1.1, 0], [x, h, 0], 0.05, LINK, rnd);
        card(b, [x, h, 0], [3.4, 1.2, 0.4], color, rnd, 2);
      }
      return { phase: rnd() * TAU, line: kit.mesh(b), flow: kit.cloud(seeds(260, 251)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [10, 48]);
      const a = s.phase + t.camera * pathClock(48, 20);
      const x = Math.sin(a) * 42;
      const eye = [x, 3.4 + Math.sin(t.camera * 0.05) * 0.3, 10];
      beginScene(k, tone, t, eye, [x + Math.cos(a) * 9, 2.6, 0], env, { stars: 0.4 }, { fov: 1.0 });
      gridFloor(k, env, tone, 200, 2);
      topics(k, s.line, env, tone);
      k.points(s.flow, { uCenter: [0, 0.7, 0], uBox: [144, 0.25, 0.4], uVel: [6, 0, 0], uTime: t.objects, uSize: 0.14, uColorA: accent, uColorB: YELLOW, uAlpha: 0.9 });
    },
  },

  fishbone: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const y = 5;
      rod(b, [-12, y, 0], [9.2, y, 0], 0.2, PAPER, rnd, 10);
      rod(b, [-12, y, 0], [-13.6, y + 1.6, 0], 0.12, PAPER, rnd);
      rod(b, [-12, y, 0], [-13.6, y - 1.6, 0], 0.12, PAPER, rnd);
      card(b, [10.9, y - 0.85, 0], [3.4, 1.7, 0.6], CORAL, rnd, 2);
      for (let i = 0; i < 3; i++) {
        const x0 = -8.5 + i * 5.8;
        for (const side of [1, -1]) {
          const color = BRANCH[(i * 2 + (side > 0 ? 1 : 2)) % BRANCH.length];
          const end = [x0, y + side * 3.8, 0];
          rod(b, [x0 + 2.6, y, 0], end, 0.1, mix(LINK, color, 0.5), rnd);
          card(b, side > 0 ? [x0 - 0.4, end[1], 0] : [x0 - 0.4, end[1] - 1, 0], [2.6, 1, 0.45], color, rnd, 1);
          for (const k of [0.35, 0.68]) {
            const p = [x0 + 2.6 - 2.6 * k, y + side * 3.8 * k, 0];
            rod(b, p, [p[0] - 2, p[1], 0], 0.05, mix(LINK, color, 0.3), rnd);
            card(b, [p[0] - 2.7, p[1] - 0.3, 0], [1.3, 0.6, 0.3], mix(color, WHITE, 0.4), rnd, 1);
          }
        }
      }
      return { phase: rnd() * TAU, fish: kit.mesh(b), dust: kit.cloud(seeds(180, 261)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [14, 60]);
      const eye = swing(s, t, 20, 5.2, 0.6, 9);
      beginScene(k, tone, t, eye, [-0.5, 5, 0], env, { stars: 0.4, nebula: 0.15 });
      gridFloor(k, env, tone, 160, 2);
      topics(k, s.fish, env, tone);
      k.points(s.dust, { uCenter: [0, 5, 1], uBox: [30, 10, 6], uVel: [-0.6, 0.1, 0], uTwinkle: 0.5, uTime: t.objects, uSize: 0.07, uColorA: accent, uColorB: WHITE, uAlpha: 0.6 });
    },
  },

  idea: {
    build(kit, rnd) {
      const glass = new MeshBuilder();
      const metal = new MeshBuilder();
      const wire = new MeshBuilder();
      ball(glass, [0, 5.2, 0], 2.3, WHITE, rnd, { detail: 3 });
      cone(glass, [0, 2.5, 0], 1.0, 1.3, 18, WHITE, { top: 1.35, rnd });
      for (let i = 0; i < 4; i++) cone(metal, [0, 1.3 + i * 0.3, 0], i % 2 ? 0.9 : 0.98, 0.3, 18, [0.62, 0.64, 0.7], { top: i % 2 ? 0.98 : 0.9, rnd });
      cone(metal, [0, 1.3, 0], 0.9, -0.5, 18, [0.3, 0.32, 0.36], { top: 0.3, rnd });
      const zig = [[-0.55, 2.6], [-0.45, 4.6], [-0.25, 5.2], [0, 4.7], [0.25, 5.2], [0.45, 4.6], [0.55, 2.6]];
      for (let i = 1; i < zig.length; i++) rod(wire, [zig[i - 1][0], zig[i - 1][1], 0], [zig[i][0], zig[i][1], 0], i === 1 || i === zig.length - 1 ? 0.04 : 0.07, YELLOW, rnd, 5);
      return { phase: rnd() * TAU, glass: kit.mesh(glass), metal: kit.mesh(metal), wire: kit.mesh(wire), sparks: kit.cloud(seeds(300, 271)), thoughts: kit.cloud(seeds(90, 272)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [12, 48]);
      const { eye } = fly(s, t, 11, 8, 4.4, 0.8);
      beginScene(k, tone, t, eye, [0, 4, 0], env, { stars: 0.6, glow: 0.2, sunSize: 0.01 });
      const glow = 0.85 + 0.15 * Math.sin(t.objects * 1.3);
      const warm = mix([1, 0.85, 0.5], accent, 0.2).map((v) => v * 2.4 * glow);
      const lamp = { uLightPos: [0, 5, 0], uLightColor: warm };
      k.terrain({ mode: TERRAIN.flat }, { ...light(env), ...lamp, uLow: INK, uMid: INK, uHigh: INK, uPeak: INK, uLines: 0.7, uLineGap: 2, uLineColor: mix(LINK, accent, 0.4), uSpan: 120 });
      k.solid(s.metal, { ...light(env), ...lamp, uTint: WHITE });
      k.solid(s.wire, { ...light(env), uEmit: 1, uTint: mix(YELLOW, WHITE, 0.4 * glow) });
      k.points(s.sparks, { uShape: 5, uCenter: [0, 5.2, 0], uBox: [9, 9, 9], uVel: [0, 1.2, 0], uRise: 0.6, uTwinkle: 0.7, uTime: t.objects, uSize: 0.1, uColorA: YELLOW, uColorB: accent, uAlpha: 0.85 });
      k.points(s.thoughts, { uShape: 4, uCenter: [0, 5, 0], uBox: [16, 7, 16], uSwirl: 0.15, uTime: t.objects, uSize: 0.35, uColorA: mix(accent, WHITE, 0.4), uColorB: TEAL, uAlpha: 0.5 });
      k.solid(s.glass, { ...light(env), uEmit: 0.4, uTint: mix([1, 0.92, 0.7], accent, 0.15), uRim: mix(accent, WHITE, 0.6), uAlpha: 0.22 * glow + 0.05 }, { blend: 'add' });
    },
  },

  sticky: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      box(b, [0, 0.6, 0], [21, 10.4, 0.3], [0.55, 0.4, 0.27], { rnd });
      box(b, [0, 0.6, -0.05], [21.6, 0.3, 0.42], [0.25, 0.17, 0.12], { rnd });
      box(b, [0, 10.9, -0.05], [21.6, 0.3, 0.42], [0.25, 0.17, 0.12], { rnd });
      for (const x of [-10.65, 10.65]) box(b, [x, 0.6, -0.05], [0.3, 10.6, 0.42], [0.25, 0.17, 0.12], { rnd });
      const pins = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 7; c++) {
          if (rnd() < 0.15) continue;
          const x = (c - 3) * 2.75 + (rnd() - 0.5) * 0.5;
          const y = 1.4 + r * 2.4 + (rnd() - 0.5) * 0.4;
          const size = 1.75 + rnd() * 0.3;
          card(b, [x, y, 0.19], [size, size, 0.06], pick(NOTE, Math.floor(rnd() * NOTE.length)), rnd, 2);
          const pin = [x, y + size - 0.22, 0.32];
          ball(b, pin, 0.13, CORAL, rnd, { detail: 0 });
          pins.push(pin);
        }
      }
      for (let i = 0; i < 9; i++) {
        const a = pins[Math.floor(rnd() * pins.length)];
        const z = pins[Math.floor(rnd() * pins.length)];
        if (a !== z) rod(b, [a[0], a[1], 0.36], [z[0], z[1], 0.36], 0.025, [0.9, 0.2, 0.25], rnd, 4);
      }
      return { phase: rnd() * TAU, board: kit.mesh(b), dust: kit.cloud(seeds(140, 281)) };
    },
    draw(k, s, t, tone) {
      const env = mapLight(tone, [14, 50]);
      const eye = swing(s, t, 15, 5.6, 0.6, 7);
      beginScene(k, tone, t, eye, [0, 5.6, 0], env, { stars: 0.25, glow: 0.1, sunSize: 0.01 });
      gridFloor(k, env, tone, 120, 2);
      topics(k, s.board, env, tone, { uEmit: 0.2, uLightPos: [0, 9, 8], uLightColor: [1.4, 1.25, 1] });
      k.points(s.dust, { uCenter: [0, 5, 3], uBox: [22, 10, 6], uVel: [0.15, 0.2, 0], uWobble: [0.3, 0.3, 0.3], uWobbleFreq: 0.4, uTwinkle: 0.5, uTime: t.objects, uSize: 0.05, uColorA: [1, 0.9, 0.7], uColorB: WHITE, uAlpha: 0.6 });
    },
  },

  orbit: {
    build(kit, rnd) {
      const core = new MeshBuilder();
      ball(core, [0, 3, 0], [1.8, 1.25, 1.5], PAPER, rnd, { detail: 2 });
      const sphere = new MeshBuilder();
      solid(sphere, 'geo', WHITE, rnd);
      const items = Array.from({ length: 16 }, (_, i) => ({
        orbit: 3.8 + rnd() * 7,
        angle: rnd() * TAU,
        y: 1.4 + rnd() * 3.6,
        size: 0.45 + rnd() * 0.6,
        color: i % BRANCH.length,
        phase: rnd() * TAU,
      }));
      return { phase: rnd() * TAU, core: kit.mesh(core), sphere: kit.mesh(sphere), items };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [14, 50]);
      const { eye } = fly(s, t, 15, 10, 4.8, 0.8);
      const sky = beginScene(k, tone, t, eye, [0, 2.6, 0], env, { stars: 0.7, nebula: 0.3 });
      mirrored(k, sky, env, () => {
        topics(k, s.core, env, tone);
        for (const item of s.items) {
          const ang = item.angle + t.objects * 0.1 * (item.orbit < 7 ? 1 : -0.6);
          const pos = [Math.cos(ang) * item.orbit, item.y + Math.sin(t.objects * 0.5 + item.phase) * 0.35, Math.sin(ang) * item.orbit];
          modelMatrix(k.model, pos, t.objects * 0.3 + item.phase, 0, 0, item.size);
          k.solid(s.sphere, { ...light(env), uTint: BRANCH[item.color], uEmit: 0.35, uRim: mix(accent, WHITE, 0.45) }, { model: k.model });
        }
      }, { span: 120 });
      BRANCH.slice(0, 5).forEach((color, i) => {
        k.ribbon({ uMode: 0, uIndex: i, uRadius: 4.2 + i * 1.4, uWidth: 0.12, uTime: t.objects * 0.5, uSun: env.sun, uColorA: color, uColorB: mix(color, WHITE, 0.4), uAlpha: 0.55, uOffset: [0, 3, 0] }, { blend: 'add' });
      });
    },
  },

  forest: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      blossomTree(b, 0, 0, 9, PINK, [0.36, 0.25, 0.2], rnd);
      for (let i = 0; i < 70; i++) {
        const a = rnd() * TAU;
        const r = 7 + rnd() * 38;
        const h = 2.5 + rnd() * 3.5;
        const leaves = rnd() < 0.55 ? mix([0.3, 0.6, 0.35], pick(BRANCH, i), 0.25) : pick(BRANCH, i);
        if (rnd() < 0.2) blossomTree(b, Math.cos(a) * r, Math.sin(a) * r, h, leaves, [0.32, 0.23, 0.18], rnd);
        else roundTree(b, Math.cos(a) * r, Math.sin(a) * r, h, leaves, [0.32, 0.23, 0.18], rnd);
      }
      return { phase: rnd() * TAU, trees: kit.mesh(b), flies: kit.cloud(seeds(320, 291)) };
    },
    draw(k, s, t, tone) {
      const { accent, c } = tone;
      const env = mapLight(tone, [16, 70]);
      const { eye, dir } = fly(s, t, 13, 12, 3, 0.4);
      beginScene(k, tone, t, eye, ahead(eye, dir, 10, 0.6), env, { stars: 0.6, glow: 0.3, sunSize: 0.014, horizon: [0.14, 0.1, 0.2] });
      const grass = c([0.05, 0.1, 0.07]);
      k.terrain({ mode: TERRAIN.flat }, { ...light(env), uLow: grass, uMid: grass, uHigh: grass, uPeak: grass, uSpan: 240 });
      k.solid(s.trees, { ...light(env), uEmit: 0.12, uTint: WHITE, uWind: 0.12, uTime: t.objects });
      k.points(s.flies, { uCenter: [eye[0], 1.8, eye[2]], uBox: [40, 3, 40], uWobble: [0.6, 0.4, 0.6], uWobbleFreq: 0.5, uTwinkle: 0.8, uTime: t.objects, uSize: 0.08, uColorA: YELLOW, uColorB: accent, uAlpha: 0.85 });
    },
  },

  bubbles: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      ball(b, [0, 0, 0], 1, WHITE, rnd, { detail: 2 });
      const items = Array.from({ length: 22 }, (_, i) => {
        const a = rnd() * TAU;
        const r = 1.5 + rnd() * 10;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, y0: rnd() * 14, speed: 0.25 + rnd() * 0.4, size: 0.4 + rnd() * 1, color: i % BRANCH.length, phase: rnd() * TAU };
      });
      return { phase: rnd() * TAU, bubble: kit.mesh(b), items, rings: kit.cloud(seeds(260, 301)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [14, 50]);
      const { eye } = fly(s, t, 16, 10, 4.5, 1);
      beginScene(k, tone, t, eye, [0, 5, 0], env, { stars: 0.5, nebula: 0.3 });
      gridFloor(k, env, tone, 140, 2);
      for (const item of s.items) {
        const y = ((item.y0 + t.objects * item.speed) % 14) + 0.2;
        const x = item.x + Math.sin(t.objects * 0.4 + item.phase) * 0.5;
        modelMatrix(k.model, [x, y, item.z], 0, 0, 0, item.size * Math.min(1, y / 1.2));
        k.solid(s.bubble, { ...light(env), uTint: mix(BRANCH[item.color], WHITE, 0.2), uEmit: 0.3, uRim: mix(accent, WHITE, 0.6), uAlpha: 0.4 }, { model: k.model, blend: 'add' });
      }
      k.points(s.rings, { uShape: 4, uCenter: [0, 6, 0], uBox: [26, 14, 26], uVel: [0, 0.7, 0], uWobble: [0.4, 0, 0.4], uWobbleFreq: 0.6, uTime: t.objects, uSize: 0.3, uColorA: mix(accent, WHITE, 0.4), uColorB: TEAL, uAlpha: 0.55 });
    },
  },

  constellation: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const R = 70;
      const at = (az, el) => [Math.cos(el) * Math.sin(az) * R, 2 + Math.sin(el) * R, Math.cos(el) * Math.cos(az) * R];
      for (let g = 0; g < 3; g++) {
        const az0 = g * (TAU / 3);
        const root = at(az0, 0.62);
        ball(b, root, 1.1, WHITE, rnd);
        const kids = 4 + Math.floor(rnd() * 2);
        for (let i = 0; i < kids; i++) {
          const az = az0 + (i - (kids - 1) / 2) * 0.32;
          const el = 0.36 + rnd() * 0.18;
          const p = at(az, el);
          rod(b, root, p, 0.1, mix(BLUE, WHITE, 0.5), rnd, 4);
          ball(b, p, 0.65, mix(pick(BRANCH, g * 3 + i), WHITE, 0.45), rnd);
          for (let j = 0; j < 2; j++) {
            const q = at(az + (j - 0.5) * 0.14, el - 0.1 - rnd() * 0.08);
            rod(b, p, q, 0.07, mix(BLUE, WHITE, 0.5), rnd, 4);
            ball(b, q, 0.4, WHITE, rnd, { detail: 0 });
          }
        }
      }
      return { phase: rnd() * TAU, stars: kit.mesh(b), dust: kit.cloud(seeds(500, 311)) };
    },
    draw(k, s, t, tone) {
      const { accent, c } = tone;
      const env = mapLight(tone, [60, 400]);
      const a = s.phase + t.camera * SWEEP * 0.25;
      const eye = [0, 1.6, 0];
      beginScene(k, tone, t, eye, [Math.sin(a) * 10, 6.5, Math.cos(a) * 10], env, { stars: 1, milky: 0.6, nebula: 0.3 }, { fov: 1.05 });
      const ground = c([0.02, 0.025, 0.04]);
      k.terrain({ mode: TERRAIN.far, amp: 8 }, { ...light(env), uLow: ground, uMid: ground, uHigh: ground, uPeak: ground, uSpan: 500 });
      k.solid(s.stars, { ...light(env), uEmit: 0.9, uTint: WHITE, uRim: mix(accent, WHITE, 0.5) });
      k.points(s.dust, { uShape: 5, uCenter: [0, 50, 0], uBox: [180, 60, 180], uTwinkle: 0.9, uTime: t.objects, uSize: 0.5, uColorA: WHITE, uColorB: accent, uAlpha: 0.7 });
    },
  },

  flowchart: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      flowchart(b, -12, -7, rnd, BLUE);
      flowchart(b, -2, 0, rnd, VIOLET);
      flowchart(b, 8, -7, rnd, TEAL);
      return { phase: rnd() * TAU, chart: kit.mesh(b), flow: kit.cloud(seeds(90, 321)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [16, 70]);
      const eye = swing(s, t, 20, 6.4, 0.6, 9);
      beginScene(k, tone, t, eye, [-1, 5.8, -2], env, { stars: 0.35 });
      gridFloor(k, env, tone, 160, 2);
      topics(k, s.chart, env, tone);
      for (const [x, z] of [[-12, -7], [-2, 0], [8, -7]]) {
        k.points(s.flow, { uCenter: [x, 6, z + 0.3], uBox: [0.1, 9.5, 0.1], uVel: [0, -2.2, 0], uTime: t.objects, uSize: 0.16, uColorA: accent, uColorB: YELLOW, uAlpha: 0.9 });
      }
    },
  },

  clusters: {
    build(kit, rnd) {
      const hub = new MeshBuilder();
      ball(hub, [0, 3, 0], [1.6, 1.05, 1.3], PAPER, rnd, { detail: 2 });
      const groups = BRANCH.slice(0, 6).map((color, g) => {
        const a = (g / 6) * TAU;
        const pos = [Math.cos(a) * 9, 2.6 + (g % 2) * 1.6, Math.sin(a) * 9];
        branch(hub, [0, 3, 0], pos, 0.16, 0.08, color, rnd, { dash: true, steps: 14 });
        const b = new MeshBuilder();
        ball(b, [0, 0, 0], 0.6, color, rnd);
        const n = 6 + Math.floor(rnd() * 4);
        for (let i = 0; i < n; i++) {
          const ca = (i / n) * TAU;
          const r = 1.8 + rnd() * 0.9;
          const p = [Math.cos(ca) * r, (rnd() - 0.5) * 1.6, Math.sin(ca) * r];
          rod(b, [0, 0, 0], p, 0.03, mix(color, WHITE, 0.3), rnd, 4);
          box(b, [p[0], p[1] - 0.25, p[2]], [0.7, 0.5, 0.7], mix(color, WHITE, 0.2 + rnd() * 0.3), { rnd, yaw: ca });
        }
        return { pos, spin: (g % 2 ? 1 : -1) * (0.15 + rnd() * 0.1), mesh: kit.mesh(b) };
      });
      return { phase: rnd() * TAU, hub: kit.mesh(hub), groups: groups.map((g) => g.mesh), meta: groups.map(({ pos, spin }) => ({ pos, spin })), dust: kit.cloud(seeds(200, 331)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [16, 60]);
      const { eye } = fly(s, t, 19, 13, 7, 1.2);
      const sky = beginScene(k, tone, t, eye, [0, 2.6, 0], env, { stars: 0.6, nebula: 0.2 });
      mirrored(k, sky, env, () => {
        topics(k, s.hub, env, tone);
        s.groups.forEach((mesh, i) => {
          const { pos, spin } = s.meta[i];
          modelMatrix(k.model, [pos[0], pos[1] + Math.sin(t.objects * 0.4 + i) * 0.3, pos[2]], t.objects * spin, 0, 0, 1);
          k.solid(mesh, { ...light(env), uEmit: 0.32, uTint: WHITE, uRim: mix(accent, WHITE, 0.35) }, { model: k.model });
        });
      }, { span: 120 });
      k.points(s.dust, { uShape: 5, uCenter: [0, 3, 0], uBox: [26, 7, 26], uSwirl: 0.1, uTwinkle: 0.6, uTime: t.objects, uSize: 0.08, uColorA: WHITE, uColorB: accent, uAlpha: 0.6 });
    },
  },

  outline: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const pattern = [0, 1, 2, 2, 1, 2, 1, 0, 1, 1, 2, 3, 3, 2, 0, 1, 2, 1, 2, 2];
      const last = [];
      let group = -1;
      for (let i = 0; i < 44; i++) {
        const level = pattern[i % pattern.length];
        if (level === 0) group++;
        const z = -66 + i * 3;
        const x = -7 + level * 2.2;
        const color = level === 0 ? pick(BRANCH, group) : mix(pick(BRANCH, group), WHITE, 0.2 * level);
        ball(b, [x, 0.4, z], level === 0 ? 0.4 : 0.26, color, rnd, { detail: 0 });
        const len = level === 0 ? 9 + rnd() * 4 : 3 + rnd() * 7;
        box(b, [x + 0.8 + len / 2, 0.1, z], [len, level === 0 ? 0.5 : 0.32, level === 0 ? 1 : 0.7], color, { rnd });
        if (level > 0 && last[level - 1]) {
          const parent = last[level - 1];
          rod(b, [parent[0], 0.2, parent[2] + 0.4], [parent[0], 0.2, z], 0.04, LINK, rnd, 4);
          rod(b, [parent[0], 0.2, z], [x - 0.3, 0.2, z], 0.04, LINK, rnd, 4);
        }
        last[level] = [x, 0.4, z];
        last.length = level + 1;
      }
      return { phase: rnd() * TAU, rows: kit.mesh(b), dust: kit.cloud(seeds(160, 341)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [8, 40]);
      const a = s.phase + t.camera * pathClock(48, 20);
      const z = Math.sin(a) * 52;
      const eye = [-3 + Math.sin(t.camera * 0.04) * 1.5, 5.2, z];
      beginScene(k, tone, t, eye, [1, 0, z + Math.cos(a) * 12], env, { stars: 0.3 }, { fov: 1.0 });
      gridFloor(k, env, tone, 200, 3);
      topics(k, s.rows, env, tone);
      k.points(s.dust, { uCenter: [eye[0], 2, eye[2]], uBox: [24, 4, 30], uVel: [0.2, 0.2, 0], uTwinkle: 0.5, uTime: t.objects, uSize: 0.06, uColorA: accent, uColorB: WHITE, uAlpha: 0.6 });
    },
  },

  relations: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const hub = [0, 2.4, 0];
      ball(b, hub, [1.4, 0.95, 1.2], PAPER, rnd, { detail: 2 });
      const nodes = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * TAU + (rnd() - 0.5) * 0.3;
        const r = 6 + rnd() * 5;
        return [Math.cos(a) * r, 1.2 + rnd() * 2.6, Math.sin(a) * r];
      });
      nodes.forEach((p, i) => {
        const color = pick(BRANCH, i);
        branch(b, hub, p, 0.14, 0.07, color, rnd);
        ball(b, p, [0.6, 0.4, 0.5], color, rnd);
      });
      for (let i = 0; i < 7; i++) {
        const p = nodes[i];
        const q = nodes[(i + 3 + Math.floor(rnd() * 3)) % nodes.length];
        branch(b, p, q, 0.06, 0.06, mix(ORANGE, WHITE, 0.3), rnd, { rise: 5 + rnd() * 3, dash: true, steps: 18 });
      }
      return { phase: rnd() * TAU, map: kit.mesh(b), sparks: kit.cloud(seeds(240, 351)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [16, 60]);
      const { eye } = fly(s, t, 20, 14, 6.5, 1.4);
      const sky = beginScene(k, tone, t, eye, [0, 3, 0], env, { stars: 0.7, nebula: 0.3 });
      mirrored(k, sky, env, () => topics(k, s.map, env, tone), { span: 120 });
      k.points(s.sparks, { uShape: 5, uCenter: [0, 5, 0], uBox: [26, 9, 26], uSwirl: 0.15, uTwinkle: 0.6, uTime: t.objects, uSize: 0.09, uColorA: ORANGE, uColorB: accent, uAlpha: 0.7 });
    },
  },

  matrix: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const quads = [[-5, -5, GREEN], [5, -5, ORANGE], [-5, 5, BLUE], [5, 5, CORAL]];
      for (const [x, z, color] of quads) {
        box(b, [x, 0, z], [9.2, 0.22, 9.2], mix(color, INK, 0.55), { rnd });
        for (let i = 0; i < 5; i++) {
          const px = x + (rnd() - 0.5) * 6.5;
          const pz = z + (rnd() - 0.5) * 6.5;
          card(b, [px, 0.22, pz], [1.9, 1.2, 0.3], mix(color, WHITE, 0.15 + rnd() * 0.3), rnd, 2);
        }
      }
      rod(b, [-10.5, 0.3, 0], [10.5, 0.3, 0], 0.08, PAPER, rnd);
      rod(b, [0, 0.3, -10.5], [0, 0.3, 10.5], 0.08, PAPER, rnd);
      ball(b, [0, 1.2, 0], [1.2, 0.8, 1.2], PAPER, rnd, { detail: 2 });
      return { phase: rnd() * TAU, grid: kit.mesh(b), dust: kit.cloud(seeds(180, 361)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [16, 70]);
      const { eye } = fly(s, t, 18, 12, 9, 1);
      beginScene(k, tone, t, eye, [0, 0.6, 0], env, { stars: 0.4 });
      gridFloor(k, env, tone, 160, 2);
      topics(k, s.grid, env, tone);
      k.points(s.dust, { uCenter: [0, 2, 0], uBox: [22, 4, 22], uVel: [0.2, 0.3, 0], uTwinkle: 0.5, uTime: t.objects, uSize: 0.06, uColorA: accent, uColorB: WHITE, uAlpha: 0.6 });
    },
  },

  spiral: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      let prev = null;
      for (let i = 0; i < 28; i++) {
        const a = i * 0.55;
        const r = 2.4 + i * 0.32;
        const p = [Math.cos(a) * r, 0.8 + i * 0.3, Math.sin(a) * r];
        const color = pick(BRANCH, Math.floor(i / 4));
        if (prev) branch(b, prev, p, 0.12, 0.1, color, rnd, { steps: 5 });
        ball(b, p, [0.5 - i * 0.008, 0.32, 0.42], color, rnd);
        const leaf = [Math.cos(a) * (r + 2.2), p[1] + (rnd() - 0.5), Math.sin(a) * (r + 2.2)];
        branch(b, p, leaf, 0.05, 0.03, color, rnd, { steps: 5 });
        ball(b, leaf, 0.18, mix(color, WHITE, 0.4), rnd, { detail: 0 });
        prev = p;
      }
      ball(b, [0, 0.8, 0], 1.1, PAPER, rnd, { detail: 2, squash: 0.7 });
      branch(b, [0, 0.8, 0], [2.4, 0.8, 0], 0.16, 0.12, CORAL, rnd, { steps: 4 });
      return { phase: rnd() * TAU, spiral: kit.mesh(b), sparks: kit.cloud(seeds(260, 371)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [16, 60]);
      const { eye } = fly(s, t, 21, 14, 7.5, 1.2);
      const sky = beginScene(k, tone, t, eye, [0, 4.4, 0], env, { stars: 0.7, nebula: 0.35 });
      mirrored(k, sky, env, () => topics(k, s.spiral, env, tone), { span: 120 });
      k.points(s.sparks, { uShape: 5, uCenter: [0, 5, 0], uBox: [26, 10, 26], uSwirl: 0.25, uVel: [0, 0.3, 0], uTwinkle: 0.6, uTime: t.objects, uSize: 0.09, uColorA: WHITE, uColorB: accent, uAlpha: 0.7 });
    },
  },

  islands: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const isle = (x, z, R, color) => {
        cone(b, [x, -1.4, z], R * 1.2, 1.8, 16, [0.42, 0.36, 0.3], { top: R, rnd });
        cone(b, [x, 0.4, z], R, 0.12, 16, mix([0.3, 0.55, 0.32], color, 0.15), { rnd });
        const top = [x, 1.1, z];
        ball(b, top, [0.75, 0.5, 0.65], color, rnd);
        for (let i = 0; i < Math.floor(R); i++) {
          const a = rnd() * TAU;
          const d = R * (0.5 + rnd() * 0.3);
          roundTree(b, x + Math.cos(a) * d, z + Math.sin(a) * d, 1 + rnd() * 0.8, [0.3, 0.62, 0.36], [0.32, 0.23, 0.18], rnd);
        }
        return top;
      };
      const center = isle(0, 0, 4.2, PAPER);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + (rnd() - 0.5) * 0.3;
        const r = 13 + rnd() * 4;
        const color = BRANCH[i % BRANCH.length];
        const top = isle(Math.cos(a) * r, Math.sin(a) * r, 1.6 + rnd(), color);
        branch(b, center, top, 0.16, 0.1, color, rnd, { rise: 3, steps: 14 });
      }
      return { phase: rnd() * TAU, world: kit.mesh(b), birds: kit.cloud(seeds(60, 381)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [24, 90]);
      const { eye } = fly(s, t, 26, 18, 8, 1.4);
      const sky = beginScene(k, tone, t, eye, [0, 1, 0], env, { stars: 0.5, glow: 0.3, sunSize: 0.014, horizon: [0.12, 0.1, 0.2] });
      mirrored(k, sky, env, () => topics(k, s.world, env, tone, { uEmit: 0.22 }), {
        span: 180, wave: 0.04, ripple: 0.08, time: t.objects, mirror: 0.5, deep: [0.02, 0.05, 0.08], shallow: [0.04, 0.1, 0.13],
      });
      k.points(s.birds, { uShape: 5, uCenter: [0, 6, 0], uBox: [40, 4, 40], uSwirl: 0.08, uTwinkle: 0.6, uTime: t.objects, uSize: 0.12, uColorA: WHITE, uColorB: accent, uAlpha: 0.6 });
    },
  },

  gantt: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      let prevEnd = null;
      for (let r = 0; r < 14; r++) {
        const z = (r - 6.5) * 2.4;
        let x = -44 + rnd() * 6;
        const color = pick(BRANCH, Math.floor(r / 2));
        while (x < 40) {
          const len = 3 + rnd() * 8;
          box(b, [x + len / 2, 0, z], [len, 0.6, 1.3], mix(color, INK, 0.25), { rnd });
          const done = len * (0.2 + rnd() * 0.8);
          box(b, [x + done / 2, 0.6, z], [done, 0.1, 1.1], mix(color, WHITE, 0.25), { rnd });
          if (prevEnd && rnd() < 0.3) elbow(b, prevEnd, [x, 0.3, z - 0.65], 0.04, LINK, rnd, 2);
          prevEnd = [x + len, 0.3, z + 0.65];
          if (rnd() < 0.15) gem(b, [x + len + 0.8, 0.8, z], [0.5, 0.5, 0.5], YELLOW, rnd);
          x += len + 1.5 + rnd() * 5;
        }
      }
      rod(b, [4, 0.05, -18], [4, 0.05, 18], 0.12, CORAL, rnd);
      return { phase: rnd() * TAU, bars: kit.mesh(b), today: kit.cloud(seeds(120, 391)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = mapLight(tone, [10, 50]);
      const a = s.phase + t.camera * pathClock(48, 20);
      const x = Math.sin(a) * 34;
      const eye = [x, 9.5, 20];
      beginScene(k, tone, t, eye, [x + Math.cos(a) * 8, 0, 0], env, { stars: 0.3 }, { fov: 1.0 });
      gridFloor(k, env, tone, 200, 2.4);
      topics(k, s.bars, env, tone);
      k.points(s.today, { uCenter: [4, 1.5, 0], uBox: [0.2, 3, 36], uVel: [0, 0.8, 0], uRise: 0.6, uTime: t.objects, uSize: 0.14, uColorA: CORAL, uColorB: accent, uAlpha: 0.85 });
    },
  },
};

export function sceneOf(id) {
  return SCENES[id] ?? SCENES.radial;
}

export const SCENE_IDS = Object.keys(SCENES);

/** Free the buffers a scene's build made. */
export function releaseScene(kit, state) {
  for (const value of Object.values(state ?? {})) {
    if (Array.isArray(value)) for (const item of value) { if (item?.buffer) kit.release(item); }
    else if (value?.buffer) kit.release(value);
  }
}
