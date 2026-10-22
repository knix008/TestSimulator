// The 3D start scenes. Each scene builds its meshes once (`build`) and draws a
// frame from three clocks (`draw`): `camera` moves the viewer, `objects` moves
// waves, weather, trees, particles and shapes, `sky` moves clouds, sun, stars
// and light. Every clock runs at its own speed from Settings, so any of them
// can be slowed, sped up or held while the others keep going.
import { modelMatrix } from './gl.js';
import { blossomTree, box, cone, MeshBuilder, pine, roundTree, seeds, solid, SOLID_KINDS, tube } from './meshes.js';
import { groundUnder, riverMiddle, TERRAIN, terrainHeight } from './terrain.js';

const TAU = Math.PI * 2;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const scale = (a, k) => a.map((v) => v * k);

/** A direction from azimuth (0 = straight ahead, −z) and elevation, in radians. */
export function sunDir(az, el) {
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

/** Azimuth of a horizontal direction, matching sunDir. */
const headingOf = (dir) => Math.atan2(dir[0], -dir[2]);

/** A point on a circle and the direction of travel along it. */
function circle(r, a) {
  return { pos: [Math.cos(a) * r, 0, Math.sin(a) * r], dir: [-Math.sin(a), 0, Math.cos(a)] };
}

function turn(dir, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [dir[0] * c - dir[2] * s, dir[1], dir[0] * s + dir[2] * c];
}

const ahead = (eye, dir, dist, dy = 0) => [eye[0] + dir[0] * dist, eye[1] + dy, eye[2] + dir[2] * dist];

/** Ease a camera height toward `target` as the camera clock advances; never below `floor`. */
function follow(s, key, target, step, floor = -Infinity) {
  if (!Number.isFinite(s[key])) s[key] = target;
  else s[key] += (target - s[key]) * Math.min(1, Math.abs(step) * 1.2);
  s[key] = Math.max(s[key], floor);
  return s[key];
}

/** Random spots in a ring, skipping those `avoid` rejects. */
function plant(rnd, n, { inner = 0, outer = 100, center = [0, 0], avoid = null } = {}) {
  const out = [];
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    const a = rnd() * TAU;
    const r = Math.sqrt(inner * inner + rnd() * (outer * outer - inner * inner));
    const x = center[0] + Math.cos(a) * r;
    const z = center[1] + Math.sin(a) * r;
    if (!avoid?.(x, z)) out.push([x, z]);
  }
  return out;
}

const awayFromRing = (radius, width) => (x, z) => Math.abs(Math.hypot(x, z) - radius) < width;

const PINE = [0.1, 0.27, 0.15];
const LEAF = [0.24, 0.44, 0.17];
const TRUNK = [0.3, 0.2, 0.12];
const SNOW = [0.9, 0.93, 0.97];

/** Mixed woods: firs and round trees at the given spots. */
function woods(rnd, spots, { pines = 0.6, height = [5, 11], leaves = LEAF, needles = PINE, trunk = TRUNK, snow = null } = {}) {
  const b = new MeshBuilder();
  for (const [x, z] of spots) {
    const h = height[0] + rnd() * (height[1] - height[0]);
    if (rnd() < pines) pine(b, x, z, h, needles, trunk, rnd, { snow });
    else roundTree(b, x, z, h * 0.8, leaves, trunk, rnd);
  }
  return b;
}

/** Small cones for grass tufts and shrubs. */
function tufts(rnd, spots, color, size = 0.5) {
  const b = new MeshBuilder();
  for (const [x, z] of spots) cone(b, [x, -0.1, z], size * (0.5 + rnd()), size * (1 + rnd() * 1.5), 4, color, { root: [x, z], rnd, swayFrom: 0, swayTo: 1 });
  return b;
}

/** Lighting shared by terrain and meshes. */
function light(o) {
  return { uSun: o.sun, uSunColor: o.sunColor, uAmbient: o.ambient, uFog: o.fog, uFogRange: o.fogRange };
}

/** Sky uniforms from a short description. */
function skyOf(o) {
  return {
    uZenith: o.zenith, uHorizon: o.horizon, uGround: o.ground ?? scale(o.horizon, 0.6), uSun: o.sun, uSunColor: o.sunColor,
    uSunSize: o.sunSize ?? 0.035, uGlow: o.glow ?? 1, uClouds: o.clouds ?? 0, uCloudColor: o.cloudColor ?? [1, 1, 1],
    uStars: o.stars ?? 0, uMilky: o.milky ?? 0, uNebula: o.nebula ?? 0, uNebA: o.nebA ?? [0.5, 0.3, 0.9], uNebB: o.nebB ?? [0.2, 0.6, 1],
    uTime: o.time ?? 0, uSpin: o.spin ?? 0, uRetro: o.retro ?? 0, uRetroColor: o.retroColor ?? [1, 0.2, 0.6], uFlash: o.flash ?? 0,
    uHaze: o.haze ?? 0.25, uSpace: o.space ?? 0, uWind: o.wind ?? [0.02, 0.008],
  };
}

/** The second colour of a pair: the accent's channels turned, for ribbons and lights. */
const turned = (c) => [c[2], c[0], c[1]];

const SCENES = {
  valley: {
    build(kit, rnd) {
      const shape = [500, 18, 70, 5];
      const ground = { mode: TERRAIN.river, amp: 40, freq: 0.012, seed: [rnd() * 50, rnd() * 50], shape };
      // Woods on both slopes all the way round the ring; the river stays clear.
      const spots = [];
      for (let i = 0; i < 1000; i++) {
        const a = rnd() * TAU;
        const r = riverMiddle(shape, a) + (rnd() < 0.5 ? -1 : 1) * (15 + rnd() * 60);
        spots.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return { ground, phase: rnd() * TAU, trees: kit.mesh(woods(rnd, spots, { pines: 0.8, height: [6, 12] })), birds: kit.cloud(seeds(40, 151)) };
    },
    draw(k, s, t, tone) {
      const { c, dark } = tone;
      const shape = s.ground.shape;
      const at = (ang) => {
        const r = riverMiddle(shape, ang);
        return [Math.cos(ang) * r, Math.sin(ang) * r];
      };
      const a = s.phase + t.camera * 0.009;
      const p = at(a);
      const q = at(a + 0.01);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const dir = [(q[0] - p[0]) / len, 0, (q[1] - p[1]) / len];
      const eye = [p[0], 7 + Math.sin(t.camera * 0.11) * 2.5, p[1]];
      const sun = sunDir(headingOf(dir) + 0.6 + Math.sin(t.sky * 0.01) * 0.5, dark ? 0.14 : 0.42);
      const horizon = c(dark ? [0.86, 0.66, 0.6] : [0.78, 0.86, 0.93]);
      const sunColor = dark ? [1, 0.72, 0.5] : [1, 0.96, 0.88];
      const env = { sun, sunColor, ambient: c([0.32, 0.36, 0.42]), fog: horizon, fogRange: [120, 300] };
      const sky = skyOf({ zenith: c(dark ? [0.14, 0.18, 0.4] : [0.22, 0.45, 0.82]), horizon, sun, sunColor, clouds: 0.5, cloudColor: dark ? [0.95, 0.78, 0.74] : [1, 1, 1], time: t.sky, haze: 0.35 });
      const land = { ...light(env), uLow: [0.62, 0.56, 0.4], uMid: [0.3, 0.5, 0.2], uHigh: [0.42, 0.4, 0.37], uPeak: [0.95, 0.96, 0.98], uBands: [0.8, 22, 34, 2], uSpan: 640 };
      const trees = { ...light(env), uWind: 0.2, uTime: t.objects, uTint: c([1, 1, 1], 0.12), uMinGround: 0.4 };
      k.camera(eye, ahead(eye, turn(dir, Math.sin(t.camera * 0.05) * 0.2), 40, -4), { fov: 0.95, level: 0 });
      k.begin(horizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
      k.endMirror();
      k.water({ uSpan: 400, uWave: 0.06, uRipple: 0.25, uWaveDir: dir.length ? [dir[0], dir[2]] : [1, 0], uTime: t.objects, uSun: sun, uSunColor: sunColor, uDeep: c([0.04, 0.12, 0.13]), uShallow: c([0.08, 0.2, 0.18]), uZenith: sky.uZenith, uHorizon: horizon, uFog: horizon, uFogRange: env.fogRange, uMirror: 0.85, uSpec: 1.4, uShine: 200 });
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
      k.points(s.birds, { uCenter: ahead(eye, dir, 60, 18), uBox: [120, 12, 120], uVel: [3, 0, 2], uWobble: [2, 0.6, 2], uWobbleFreq: 0.4, uTime: t.objects, uSize: 0.35, uColorA: [0.15, 0.15, 0.18], uColorB: [0.25, 0.22, 0.2], uAlpha: 0.8 }, { blend: 'alpha' });
    },
  },

  ocean: {
    build: (kit, rnd) => ({ phase: rnd() * TAU }),
    draw(k, s, t, tone) {
      const { c, dark } = tone;
      const a = s.phase + t.camera * 0.0055;
      const path = circle(700, a);
      const dir = turn(path.dir, Math.sin(t.camera * 0.07) * 0.22);
      const eye = [path.pos[0], 3.4 + Math.sin(t.camera * 0.55) * 0.35, path.pos[2]];
      const sun = sunDir(headingOf(path.dir) + 0.45 + Math.sin(t.sky * 0.01) * 0.3, 0.12 + Math.sin(t.sky * 0.023) * 0.05);
      const zenith = c(dark ? [0.06, 0.12, 0.28] : [0.14, 0.33, 0.66]);
      const horizon = c(dark ? [0.62, 0.52, 0.58] : [0.74, 0.83, 0.9]);
      const sunColor = dark ? [1, 0.7, 0.45] : [1, 0.95, 0.85];
      const deep = c([0.02, 0.11, 0.19]);
      k.camera(eye, ahead(eye, dir, 20, -1.6), { fov: 0.95, roll: Math.sin(t.camera * 0.5) * 0.025 });
      const sky = skyOf({ zenith, horizon, ground: deep, sun, sunColor, clouds: 0.5, cloudColor: dark ? [0.85, 0.72, 0.75] : [1, 0.99, 0.97], time: t.sky, haze: 0.35, wind: [0.02, 0.012] });
      k.begin(horizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      k.endMirror();
      k.water({
        uSpan: 600, uWave: 1.1, uWaveScale: 1.3, uWaveDir: [0.8, 0.4], uTime: t.objects, uSun: sun, uSunColor: sunColor, uDeep: deep,
        uShallow: c([0.05, 0.32, 0.38]), uZenith: zenith, uHorizon: horizon, uFog: horizon, uFogRange: [70, 290], uSpec: 1.6, uShine: 140,
        uFoam: 0.8, uMirror: 0.9, uRipple: 0.22,
      });
    },
  },

  aurora: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 8, freq: 0.02, seed: [rnd() * 50, rnd() * 50] };
      const spots = plant(rnd, 260, { inner: 18, outer: 150 });
      return { ground, trees: kit.mesh(woods(rnd, spots, { pines: 1, height: [4, 9], snow: SNOW })), phase: rnd() * TAU };
    },
    draw(k, s, t, tone) {
      const { c } = tone;
      const level = -1;
      const x = Math.sin(t.camera * 0.03 + s.phase) * 10;
      const z = 30 + Math.cos(t.camera * 0.03 + s.phase) * 6;
      const eye = [x, Math.max(level, terrainHeight(s.ground, x, z)) + 3, z];
      const target = [Math.sin(t.camera * 0.05) * 40, 32, -150];
      const moon = sunDir(-0.9, 0.35);
      const env = { sun: moon, sunColor: [0.32, 0.38, 0.55], ambient: [0.17, 0.21, 0.33], fog: c([0.05, 0.09, 0.15]), fogRange: [80, 420] };
      const sky = skyOf({ zenith: c([0.01, 0.02, 0.06]), horizon: c([0.05, 0.1, 0.17]), sun: moon, sunColor: [0.75, 0.8, 0.95], sunSize: 0.022, glow: 0.25, stars: 1, milky: 0.5, spin: t.sky * 0.01, time: t.sky, haze: 0.15 });
      const snow = { uLow: [0.78, 0.84, 0.95], uMid: [0.82, 0.87, 0.96], uHigh: [0.7, 0.76, 0.88], uPeak: [0.95, 0.97, 1], uBands: [0, 6, 30, 1], uSparkle: 0.7, uTime: t.objects, uSpan: 800 };
      const trees = { ...light(env), uWind: 0.12, uTime: t.objects, uTint: c([1, 1, 1], 0.1), uMinGround: level + 0.4 };
      const green = c([0.25, 1, 0.55], 0.15);
      const violet = c([0.6, 0.28, 0.95], 0.2);
      const curtains = () => {
        [[-40, 30, -170], [35, 36, -215], [-10, 26, -260], [70, 40, -140]].forEach((o, i) => {
          k.ribbon({ uMode: 1, uIndex: i, uOffset: o, uLen: 380, uHeight: 70, uTime: t.objects * 0.8, uColorA: green, uColorB: violet, uAlpha: 0.5 }, { blend: 'add' });
        });
      };
      k.camera(eye, target, { fov: 1.0, level });
      k.begin(sky.uHorizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      k.terrain(s.ground, { ...light(env), ...snow });
      k.solid(s.trees, trees, { ground: s.ground });
      curtains();
      k.endMirror();
      k.water({ uLevel: level, uSpan: 500, uWave: 0.03, uRipple: 0.04, uTime: t.objects, uSun: moon, uSunColor: [0.5, 0.55, 0.7], uDeep: c([0.02, 0.04, 0.08]), uShallow: c([0.03, 0.06, 0.1]), uZenith: sky.uZenith, uHorizon: sky.uHorizon, uFog: env.fog, uFogRange: env.fogRange, uMirror: 0.85, uSpec: 0.6, uShine: 300 });
      k.terrain(s.ground, { ...light(env), ...snow });
      k.solid(s.trees, trees, { ground: s.ground });
      curtains();
    },
  },

  stars: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 16, freq: 0.012, seed: [rnd() * 50, rnd() * 50] };
      const spots = plant(rnd, 70, { inner: 12, outer: 160 });
      return {
        ground, phase: rnd() * TAU,
        trees: kit.mesh(woods(rnd, spots, { pines: 0.4, height: [5, 10], leaves: [0.05, 0.07, 0.06], needles: [0.04, 0.06, 0.05], trunk: [0.05, 0.04, 0.04] })),
        meteors: kit.cloud(seeds(5, 77)),
      };
    },
    draw(k, s, t, tone) {
      const { c } = tone;
      const eye = [0, terrainHeight(s.ground, 0, 0) + 2.4, 0];
      const az = s.phase + t.camera * 0.015;
      const el = 0.32 + Math.sin(t.camera * 0.021) * 0.12;
      const look = sunDir(az, el);
      const moon = sunDir(az + 2.2, 0.5);
      const env = { sun: moon, sunColor: [0.3, 0.33, 0.46], ambient: [0.14, 0.16, 0.26], fog: c([0.06, 0.08, 0.16]), fogRange: [60, 260] };
      k.camera(eye, [eye[0] + look[0], eye[1] + look[1], eye[2] + look[2]], { fov: 1.1 });
      const sky = skyOf({ zenith: c([0.012, 0.018, 0.06]), horizon: c([0.09, 0.12, 0.24]), sun: moon, sunColor: [0, 0, 0], sunSize: 0, glow: 0, stars: 2.2, milky: 1.5, nebA: c([0.55, 0.45, 0.78], 0.3), nebB: c([0.3, 0.45, 0.72], 0.2), spin: t.sky * 0.012, time: t.sky, haze: 0.2 });
      k.begin(sky.uHorizon);
      k.sky(sky);
      k.points(s.meteors, { uCenter: [eye[0], eye[1] + 160, eye[2]], uBox: [700, 240, 700], uVel: [-140, -45, 30], uTime: t.sky, uSize: 1.2, uBlink: 1, uColorA: [1, 1, 1], uColorB: c([0.8, 0.9, 1]), uAlpha: 0.9 });
      k.terrain(s.ground, { ...light(env), uLow: [0.07, 0.09, 0.1], uMid: [0.05, 0.07, 0.08], uHigh: [0.08, 0.08, 0.1], uPeak: [0.1, 0.1, 0.12], uSpan: 700 });
      k.solid(s.trees, { ...light(env), uWind: 0.1, uTime: t.objects }, { ground: s.ground });
    },
  },

  rain: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 7, freq: 0.025, seed: [rnd() * 50, rnd() * 50] };
      const spots = plant(rnd, 280, { outer: 120, avoid: awayFromRing(36, 4) });
      return { ground, phase: rnd() * TAU, trees: kit.mesh(woods(rnd, spots, { pines: 0.45, height: [5, 10] })), drops: kit.cloud(seeds(5000, 11)) };
    },
    draw(k, s, t, tone) {
      const { c, dark } = tone;
      const level = -0.6;
      const a = s.phase + t.camera * 0.012;
      const path = circle(36, a);
      const dir = turn(path.dir, Math.sin(t.camera * 0.09) * 0.3);
      const ground = terrainHeight(s.ground, path.pos[0], path.pos[2]);
      const eye = [path.pos[0], follow(s, 'alt', Math.max(level, ground) + 1.9, t.step), path.pos[2]];
      const strike = Math.sin(t.sky * 0.23) * Math.sin(t.sky * 0.71 + 1.3);
      const flash = strike > 0.93 ? ((strike - 0.93) / 0.07) * (0.5 + 0.5 * Math.sin(t.sky * 40)) : 0;
      const dim = dark ? 0.6 : 1;
      const horizon = c(scale([0.55, 0.58, 0.62], dim));
      const sun = sunDir(0.6, 0.6);
      const env = { sun, sunColor: scale([0.35, 0.36, 0.38], dim), ambient: [0.32 * dim + flash * 0.6, 0.34 * dim + flash * 0.6, 0.38 * dim + flash * 0.7], fog: horizon, fogRange: [12, 140] };
      const sky = skyOf({ zenith: c(scale([0.32, 0.36, 0.42], dim)), horizon, sun, sunColor: [0, 0, 0], sunSize: 0, glow: 0, clouds: 1, cloudColor: scale([0.42, 0.45, 0.5], dim), time: t.sky * 1.6, flash: flash * 0.6, haze: 0.5, wind: [0.03, 0.01] });
      const land = { ...light(env), uLow: [0.22, 0.26, 0.2], uMid: [0.13, 0.22, 0.12], uHigh: [0.24, 0.26, 0.24], uPeak: [0.3, 0.3, 0.3], uBands: [0, 3, 30, 1], uSpan: 360 };
      const trees = { ...light(env), uWind: 0.3, uTime: t.objects, uTint: c([1, 1, 1], 0.12), uMinGround: level + 0.3 };
      k.camera(eye, ahead(eye, dir, 10, -0.6), { fov: 1.0, level });
      k.begin(horizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
      k.endMirror();
      k.water({ uLevel: level, uSpan: 300, uWave: 0.04, uRipple: 0.75, uTime: t.objects * 2, uSun: sun, uSunColor: env.sunColor, uDeep: c([0.06, 0.08, 0.09]), uShallow: c([0.1, 0.12, 0.13]), uZenith: sky.uZenith, uHorizon: horizon, uFog: horizon, uFogRange: env.fogRange, uMirror: 0.7, uSpec: 0.3 });
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
      const center = ahead(eye, dir, 10, 4);
      k.points(s.drops, { uShape: 1, uCenter: center, uBox: [44, 26, 44], uVel: [1.5, -24, 0.6], uTime: t.objects, uSize: 0.7, uColorA: c([0.75, 0.8, 0.88]), uColorB: [0.9, 0.92, 0.95], uAlpha: dark ? 0.45 : 0.6, uFadeFar: 30 }, { blend: 'alpha' });
    },
  },

  snow: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.ridges, amp: 45, freq: 0.008, seed: [rnd() * 50, rnd() * 50] };
      const spots = plant(rnd, 520, { outer: 260 });
      return { ground, phase: rnd() * TAU, trees: kit.mesh(woods(rnd, spots, { pines: 1, height: [5, 12], snow: SNOW, needles: [0.12, 0.24, 0.17] })), flakes: kit.cloud(seeds(6000, 23)) };
    },
    draw(k, s, t, tone) {
      const { c, dark } = tone;
      const a = s.phase + t.camera * 0.025;
      const path = circle(140, a);
      const top = groundUnder(s.ground, path.pos[0], path.pos[2], 14);
      const eye = [path.pos[0], follow(s, 'alt', top + 10, t.step, top + 4), path.pos[2]];
      const dim = dark ? 0.75 : 1;
      const horizon = c(scale([0.85, 0.88, 0.93], dim));
      const sun = sunDir(1.2, 0.35);
      const env = { sun, sunColor: scale([0.45, 0.47, 0.52], dim), ambient: scale([0.55, 0.58, 0.66], dim), fog: horizon, fogRange: [30, 240] };
      k.camera(eye, ahead(eye, path.dir, 30, -5), { fov: 1.0 });
      k.begin(horizon);
      k.sky(skyOf({ zenith: c(scale([0.55, 0.62, 0.72], dim)), horizon, sun, sunColor: [1, 1, 1], sunSize: 0, glow: 0.3, clouds: 0.85, cloudColor: scale([0.8, 0.83, 0.88], dim), time: t.sky, haze: 0.5 }));
      k.terrain(s.ground, { ...light(env), uLow: [0.88, 0.9, 0.95], uMid: [0.86, 0.89, 0.95], uHigh: [0.6, 0.63, 0.7], uPeak: [0.97, 0.98, 1], uBands: [0, 30, 20, 2], uSparkle: 0.8, uTime: t.objects, uSpan: 700 });
      k.solid(s.trees, { ...light(env), uWind: 0.2, uTime: t.objects, uTint: c([1, 1, 1], 0.1) }, { ground: s.ground });
      k.points(s.flakes, { uShape: 2, uCenter: ahead(eye, path.dir, 15), uBox: [60, 40, 60], uVel: [2.5, -3.2, 0.8], uWobble: [0.8, 0.3, 0.8], uWobbleFreq: 1.2, uTime: t.objects, uSize: 0.12, uColorA: [1, 1, 1], uColorB: c([0.9, 0.93, 1]), uAlpha: 0.9 }, { blend: 'alpha' });
    },
  },

  dusk: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 26, freq: 0.01, seed: [rnd() * 50, rnd() * 50] };
      const spots = plant(rnd, 380, { outer: 300 });
      const dark = [0.06, 0.05, 0.08];
      return { ground, phase: rnd() * TAU, sunAz: rnd() * TAU, trees: kit.mesh(woods(rnd, spots, { pines: 0.8, height: [6, 12], leaves: dark, needles: dark, trunk: dark })) };
    },
    draw(k, s, t, tone) {
      const { c } = tone;
      const a = s.phase + t.camera * 0.004;
      const x = Math.cos(a) * 60;
      const z = Math.sin(a) * 60;
      const eye = [x, follow(s, 'alt', Math.max(0, groundUnder(s.ground, x, z, 6)) + 5, t.step), z];
      const sunAz = s.sunAz + Math.sin(t.camera * 0.01) * 0.25;
      const sun = sunDir(s.sunAz, 0.05 + Math.sin(t.sky * 0.03) * 0.035);
      const horizon = c([1, 0.52, 0.32], 0.15);
      const sunColor = [1, 0.6, 0.32];
      const env = { sun, sunColor: scale(sunColor, 0.6), ambient: c([0.22, 0.17, 0.27]), fog: mix(horizon, [0.3, 0.2, 0.3], 0.35), fogRange: [60, 380] };
      const sky = skyOf({ zenith: c([0.15, 0.11, 0.32]), horizon, sun, sunColor, sunSize: 0.05, glow: 1.4, clouds: 0.4, cloudColor: c([0.78, 0.42, 0.5]), time: t.sky, haze: 0.4 });
      const land = { ...light(env), uLow: [0.12, 0.08, 0.12], uMid: [0.09, 0.07, 0.1], uHigh: [0.1, 0.08, 0.12], uPeak: [0.12, 0.1, 0.13], uSpan: 800 };
      const trees = { ...light(env), uWind: 0.15, uTime: t.objects, uMinGround: 0.6 };
      k.camera(eye, ahead(eye, sunDir(sunAz, 0), 100, 3), { fov: 0.9 });
      k.begin(horizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
      k.endMirror();
      k.water({ uSpan: 700, uWave: 0.25, uWaveScale: 1, uTime: t.objects, uSun: sun, uSunColor: sunColor, uDeep: c([0.06, 0.04, 0.1]), uShallow: c([0.1, 0.06, 0.12]), uZenith: sky.uZenith, uHorizon: horizon, uFog: env.fog, uFogRange: env.fogRange, uMirror: 0.9, uSpec: 3, uShine: 90, uRipple: 0.15 });
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
    },
  },

  forest: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 5, freq: 0.03, seed: [rnd() * 50, rnd() * 50] };
      const spots = plant(rnd, 750, { outer: 120, avoid: awayFromRing(45, 4) });
      const grass = plant(rnd, 1500, { outer: 70, avoid: awayFromRing(45, 1.2) });
      return {
        ground, phase: rnd() * TAU,
        trees: kit.mesh(woods(rnd, spots, { pines: 0.55, height: [8, 16] })),
        grass: kit.mesh(tufts(rnd, grass, [0.25, 0.42, 0.15], 0.35)),
        motes: kit.cloud(seeds(700, 31)),
      };
    },
    draw(k, s, t, tone) {
      const { c } = tone;
      const a = s.phase + t.camera * 0.012;
      const path = circle(45, a);
      const dir = turn(path.dir, Math.sin(t.camera * 0.08) * 0.35);
      const eye = [path.pos[0], follow(s, 'alt', terrainHeight(s.ground, path.pos[0], path.pos[2]) + 1.8, t.step) + Math.sin(t.camera * 1.6) * 0.04, path.pos[2]];
      const sun = sunDir(t.sky * 0.01 + 0.8, 0.75);
      const fog = c([0.55, 0.66, 0.6]);
      const env = { sun, sunColor: [1, 0.93, 0.78], ambient: c([0.3, 0.36, 0.32]), fog, fogRange: [18, 140] };
      k.camera(eye, ahead(eye, dir, 10, 0.4), { fov: 1.05 });
      k.begin(fog);
      k.sky(skyOf({ zenith: c([0.25, 0.5, 0.82]), horizon: fog, sun, sunColor: [1, 0.95, 0.85], clouds: 0.4, time: t.sky, haze: 0.6 }));
      k.terrain(s.ground, { ...light(env), uLow: [0.22, 0.33, 0.14], uMid: [0.2, 0.3, 0.13], uHigh: [0.3, 0.28, 0.2], uPeak: [0.3, 0.3, 0.2], uBands: [0, 6, 40, 1.5], uSpan: 320 });
      const trees = { ...light(env), uWind: 0.3, uTime: t.objects, uTint: c([1, 1, 1], 0.12) };
      k.solid(s.trees, trees, { ground: s.ground });
      k.solid(s.grass, { ...trees, uWind: 0.15 }, { ground: s.ground });
      k.points(s.motes, { uCenter: ahead(eye, dir, 8, 1), uBox: [30, 8, 30], uVel: [0.2, 0.15, 0.1], uWobble: [0.6, 0.4, 0.6], uWobbleFreq: 0.5, uTime: t.objects, uSize: 0.05, uTwinkle: 0.6, uColorA: [1, 0.92, 0.6], uColorB: c([1, 1, 0.85]), uAlpha: 0.8 });
    },
  },

  dunes: {
    build: (kit, rnd) => ({ ground: { mode: TERRAIN.dunes, amp: 13, freq: 0.02, seed: [rnd() * 50, rnd() * 50] }, phase: rnd() * TAU, sand: kit.cloud(seeds(1600, 41)) }),
    draw(k, s, t, tone) {
      const { c, dark } = tone;
      const a = s.phase + t.camera * 0.0045;
      const path = circle(900, a);
      const dir = turn(path.dir, Math.sin(t.camera * 0.05) * 0.15);
      const top = groundUnder(s.ground, path.pos[0], path.pos[2], 16);
      const eye = [path.pos[0], follow(s, 'alt', top + 6, t.step, top + 2), path.pos[2]];
      const sun = sunDir(headingOf(path.dir) + 1.1 + Math.sin(t.sky * 0.01) * 0.4, dark ? 0.1 : 0.22);
      const horizon = c(dark ? [0.95, 0.62, 0.42] : [0.95, 0.88, 0.75]);
      const sunColor = dark ? [1, 0.68, 0.4] : [1, 0.94, 0.82];
      const env = { sun, sunColor, ambient: c([0.3, 0.26, 0.3]), fog: horizon, fogRange: [80, 420] };
      k.camera(eye, ahead(eye, dir, 30, -3.5), { fov: 0.95 });
      k.begin(horizon);
      k.sky(skyOf({ zenith: c(dark ? [0.16, 0.2, 0.45] : [0.25, 0.5, 0.85]), horizon, sun, sunColor, sunSize: 0.03, glow: 1.2, clouds: 0.15, time: t.sky, haze: 0.55 }));
      k.terrain(s.ground, { ...light(env), uLow: c([0.72, 0.46, 0.26], 0.1), uMid: c([0.88, 0.62, 0.38], 0.1), uHigh: c([0.97, 0.76, 0.5], 0.1), uPeak: [0.98, 0.82, 0.6], uBands: [0, 8, 40, 2], uSparkle: 0.6, uTime: t.objects, uSpan: 900 });
      k.points(s.sand, { uCenter: [eye[0] + dir[0] * 20, top + 1, eye[2] + dir[2] * 20], uBox: [60, 8, 60], uVel: [8, 0.3, 2], uWobble: [0.3, 0.6, 0.3], uWobbleFreq: 2, uTime: t.objects, uSize: 0.05, uColorA: [0.98, 0.85, 0.65], uColorB: [1, 0.92, 0.78], uAlpha: 0.5 }, { blend: 'alpha' });
    },
  },

  city: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const gap = 10;
      for (let i = -12; i < 12; i++) {
        for (let j = -12; j < 12; j++) {
          if (rnd() < 0.07) continue;
          const cx = (i + 0.5) * gap;
          const cz = (j + 0.5) * gap;
          const d = Math.hypot(cx, cz);
          const tall = 5 + 65 * Math.exp(-(d * d) / (2 * 45 * 45)) * (0.45 + rnd() * 0.9);
          const shade = 0.75 + rnd() * 0.4;
          const color = [0.17 * shade, 0.19 * shade, 0.25 * shade];
          if (rnd() < 0.35) {
            box(b, [cx - 1.8, 0, cz], [3, tall, 6.5], color, { win: 1, rnd });
            box(b, [cx + 1.8, 0, cz], [3, tall * (0.5 + rnd() * 0.4), 6.5], color, { win: 1, rnd });
          } else {
            box(b, [cx, 0, cz], [6 + rnd(), tall, 6 + rnd()], color, { win: 1, rnd });
            if (tall > 38) box(b, [cx, tall, cz], [3.5, tall * 0.18, 3.5], color, { win: 1, rnd });
          }
        }
      }
      return {
        phase: rnd() * TAU, buildings: kit.mesh(b),
        cars: [seeds(260, 51), seeds(260, 52), seeds(260, 53), seeds(260, 54)].map((d) => kit.cloud(d)),
        lamps: [seeds(700, 55), seeds(700, 56)].map((d) => kit.cloud(d)),
      };
    },
    draw(k, s, t, tone) {
      const { c, dark, accent } = tone;
      const a = s.phase + t.camera * 0.02;
      const r = 165 + Math.sin(t.camera * 0.05) * 15;
      const eye = [Math.cos(a) * r, 48 + Math.sin(t.camera * 0.037) * 14, Math.sin(a) * r];
      const sun = sunDir(a + Math.PI + 0.4 + t.sky * 0.003, dark ? 0.25 : 0.06);
      const horizon = c(dark ? [0.3, 0.17, 0.22] : [0.98, 0.62, 0.46], 0.15);
      const zenith = c(dark ? [0.02, 0.03, 0.09] : [0.26, 0.32, 0.58]);
      const env = { sun, sunColor: dark ? [0.15, 0.17, 0.25] : [1, 0.62, 0.4], ambient: dark ? [0.16, 0.16, 0.22] : [0.42, 0.4, 0.48], fog: mix(horizon, zenith, 0.25), fogRange: [90, 380] };
      k.camera(eye, [0, 18, 0], { fov: 0.95 });
      k.begin(horizon);
      k.sky(skyOf({ zenith, horizon, sun, sunColor: dark ? [0.85, 0.88, 1] : [1, 0.62, 0.38], sunSize: dark ? 0.02 : 0.04, glow: dark ? 0.2 : 1.2, stars: dark ? 0.5 : 0, clouds: 0.25, cloudColor: dark ? [0.25, 0.2, 0.28] : [0.95, 0.65, 0.6], time: t.sky, spin: t.sky * 0.01 }));
      k.terrain({ mode: TERRAIN.flat }, { ...light(env), uLow: [0.09, 0.09, 0.11], uMid: [0.09, 0.09, 0.11], uHigh: [0.09, 0.09, 0.11], uPeak: [0.09, 0.09, 0.11], uLines: dark ? 0.35 : 0.15, uLineGap: 10, uLineColor: [0.95, 0.75, 0.45], uSpan: 900 });
      k.solid(s.buildings, { ...light(env), uWindows: dark ? 1 : 0.55, uWinColor: mix([1, 0.82, 0.55], accent, 0.2), uTime: t.objects, uTint: c([1, 1, 1], 0.15) });
      const lane = { uBox: [240, 2, 240], uCenter: [0, 0.5, 0], uLane: 10, uLaneY: 0.5, uTime: t.objects, uSize: 0.35, uFadeFar: 400 };
      const head = [1, 0.95, 0.8];
      const tail = [1, 0.15, 0.1];
      k.points(s.cars[0], { ...lane, uVel: [14, 0, 0], uColorA: head, uColorB: head });
      k.points(s.cars[1], { ...lane, uVel: [-14, 0, 0], uColorA: tail, uColorB: tail });
      k.points(s.cars[2], { ...lane, uVel: [0, 0, 14], uColorA: head, uColorB: head });
      k.points(s.cars[3], { ...lane, uVel: [0, 0, -14], uColorA: tail, uColorB: tail });
      const lamp = { ...lane, uLaneY: 4, uSize: 0.5, uTwinkle: 0.1, uColorA: [1, 0.78, 0.45], uColorB: c([1, 0.85, 0.6], 0.3), uAlpha: dark ? 1 : 0.6 };
      k.points(s.lamps[0], { ...lamp, uVel: [0, 0, 0] });
      k.points(s.lamps[1], { ...lamp, uVel: [0.000001, 0, 0] });
    },
  },

  nebula: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, gas: kit.cloud(seeds(260, 61)), dust: kit.cloud(seeds(3000, 62)) }),
    draw(k, s, t, tone) {
      const { c, accent } = tone;
      const a = s.phase + t.camera * 0.005;
      const path = circle(400, a);
      const eye = [path.pos[0], Math.sin(t.camera * 0.013) * 30, path.pos[2]];
      const dir = turn(path.dir, Math.sin(t.camera * 0.02) * 0.4);
      const nebA = mix([0.6, 0.25, 0.85], accent, 0.35);
      const nebB = c([0.15, 0.55, 0.95], 0.2);
      k.camera(eye, ahead(eye, dir, 50, Math.sin(t.camera * 0.017) * 12), { fov: 1.0 });
      const dark = [0.008, 0.008, 0.025];
      k.begin(dark);
      k.sky(skyOf({ zenith: dark, horizon: c([0.03, 0.02, 0.06]), sun: [0, 1, 0], sunColor: [0, 0, 0], sunSize: 0, glow: 0, stars: 1.3, nebula: 1, nebA, nebB, spin: t.sky * 0.01, time: t.sky, space: 1, haze: 0 }));
      k.points(s.gas, { uShape: 6, uCenter: eye, uBox: [420, 220, 420], uSwirl: 0.02, uTime: t.objects, uSize: 26, uMaxSize: 256, uColorA: nebA, uColorB: nebB, uAlpha: 0.12 });
      k.points(s.dust, { uShape: 5, uCenter: eye, uBox: [220, 220, 220], uTime: t.objects, uSize: 0.35, uTwinkle: 0.5, uColorA: [1, 1, 1], uColorB: c([0.75, 0.85, 1], 0.3) });
    },
  },

  bokeh: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, big: kit.cloud(seeds(220, 71)), small: kit.cloud(seeds(400, 72)) }),
    draw(k, s, t, tone) {
      const { c, dark, accent } = tone;
      const a = s.phase + t.camera * 0.004;
      const path = circle(300, a);
      const eye = [path.pos[0], Math.sin(t.camera * 0.03) * 3, path.pos[2]];
      const dir = turn(path.dir, Math.sin(t.camera * 0.025) * 0.3);
      const zenith = dark ? c([0.03, 0.03, 0.07], 0.3) : c([0.86, 0.88, 0.95], 0.15);
      const horizon = dark ? c([0.12, 0.08, 0.18], 0.4) : c([0.99, 0.93, 0.88], 0.15);
      k.camera(eye, ahead(eye, dir, 30), { fov: 0.9 });
      k.begin(horizon);
      k.sky(skyOf({ zenith, horizon, sun: [0, 1, 0], sunColor: [0, 0, 0], sunSize: 0, glow: 0, space: 1, haze: 0, time: t.sky }));
      const gold = [1, 0.75, 0.4];
      const blend = dark ? 'add' : 'alpha';
      k.points(s.big, { uShape: 4, uCenter: ahead(eye, dir, 30), uBox: [70, 40, 70], uVel: [0.4, 0.8, 0], uWobble: [1, 1, 1], uWobbleFreq: 0.3, uTime: t.objects, uSize: 2.4, uMaxSize: 220, uTwinkle: 0.25, uColorA: dark ? accent : mix(accent, [1, 1, 1], 0.25), uColorB: dark ? gold : turned(accent), uAlpha: dark ? 0.35 : 0.3 }, { blend });
      k.points(s.small, { uShape: 0, uCenter: ahead(eye, dir, 20), uBox: [50, 30, 50], uVel: [0.2, 0.5, 0], uWobble: [0.6, 0.6, 0.6], uWobbleFreq: 0.5, uTime: t.objects, uSize: 0.12, uTwinkle: 0.7, uColorA: dark ? [1, 1, 1] : accent, uColorB: gold, uAlpha: 0.8 }, { blend });
    },
  },

  grid: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, ground: { mode: TERRAIN.channel, amp: 45, freq: 0.015, seed: [rnd() * 50, rnd() * 50], shape: [1500, 16, 70, 0] } }),
    draw(k, s, t, tone) {
      const { c, accent } = tone;
      const a = s.phase + t.camera * 0.008;
      const path = circle(1500, a);
      const eye = [path.pos[0], 3 + Math.sin(t.camera * 0.4) * 0.3, path.pos[2]];
      const sun = sunDir(headingOf(path.dir) + Math.sin(t.camera * 0.03) * 0.05, 0.085);
      const horizon = c([0.85, 0.22, 0.55], 0.2);
      const line = mix([1, 0.2, 0.8], accent, 0.3);
      const env = { sun, sunColor: [0.5, 0.25, 0.45], ambient: [0.12, 0.08, 0.18], fog: mix(horizon, [0.1, 0.02, 0.15], 0.45), fogRange: [60, 520] };
      k.camera(eye, ahead(eye, path.dir, 30, 1.2), { fov: 1.0, roll: Math.sin(t.camera * 0.21) * 0.03 });
      k.begin(horizon);
      k.sky(skyOf({ zenith: c([0.05, 0.0, 0.12]), horizon, sun, sunColor: [1, 0.85, 0.3], sunSize: 0.2, glow: 0.8, retro: 1, retroColor: [1, 0.15, 0.55], stars: 0.6, time: t.sky, spin: t.sky * 0.005, haze: 0.3 }));
      k.terrain(s.ground, { ...light(env), uLow: [0.05, 0.02, 0.08], uMid: [0.06, 0.02, 0.1], uHigh: [0.08, 0.03, 0.12], uPeak: [0.1, 0.04, 0.14], uBands: [0, 20, 60, 1], uLines: 1.2, uLineGap: 6, uLineColor: line, uSpan: 1000 });
    },
  },

  ribbons: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, dust: kit.cloud(seeds(500, 81)) }),
    draw(k, s, t, tone) {
      const { c, dark, accent } = tone;
      const a = s.phase + t.camera * 0.03;
      const eye = [Math.cos(a) * 30, Math.sin(t.camera * 0.05) * 6, Math.sin(a) * 30];
      const zenith = dark ? c([0.02, 0.02, 0.06], 0.3) : c([0.84, 0.88, 0.96], 0.2);
      const horizon = dark ? c([0.1, 0.06, 0.16], 0.4) : c([0.99, 0.95, 0.92], 0.2);
      const sun = sunDir(0.5, 0.7);
      k.camera(eye, [0, 0, 0], { fov: 0.95 });
      k.begin(horizon);
      k.sky(skyOf({ zenith, horizon, sun, sunColor: [0, 0, 0], sunSize: 0, glow: 0, stars: dark ? 0.3 : 0, space: 1, haze: 0, time: t.sky, spin: t.sky * 0.01 }));
      const pairs = [[accent, turned(accent)], [[1, 0.55, 0.3], accent], [turned(turned(accent)), [0.95, 0.9, 1]], [[0.3, 0.8, 1], [0.8, 0.3, 1]], [accent, [1, 0.85, 0.4]], [[0.35, 1, 0.75], turned(accent)]];
      pairs.forEach(([ca, cb], i) => {
        k.ribbon({ uMode: 0, uIndex: i, uRadius: 9 + (i % 3) * 1.5, uWidth: 2.4, uTime: t.objects, uSun: sun, uColorA: ca, uColorB: cb, uAlpha: dark ? 0.75 : 0.85 }, { blend: dark ? 'add' : 'alpha' });
      });
      k.points(s.dust, { uCenter: [0, 0, 0], uBox: [50, 30, 50], uVel: [0.3, 0.5, 0.1], uWobble: [0.8, 0.8, 0.8], uWobbleFreq: 0.4, uTime: t.objects, uSize: 0.08, uTwinkle: 0.6, uColorA: dark ? [1, 1, 1] : accent, uColorB: turned(accent), uAlpha: 0.7 }, { blend: dark ? 'add' : 'alpha' });
    },
  },

  embers: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 4, freq: 0.03, seed: [rnd() * 50, rnd() * 50] };
      const fire = new MeshBuilder();
      const h0 = terrainHeight(ground, 0, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + rnd() * 0.3;
        tube(fire, [Math.cos(a) * 1.3, h0 + 0.1, Math.sin(a) * 1.3], [Math.cos(a) * 0.15, h0 + 0.9, Math.sin(a) * 0.15], 0.14, 6, [0.22, 0.13, 0.08], { rnd });
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        box(fire, [Math.cos(a) * 1.9, h0 - 0.1, Math.sin(a) * 1.9], [0.5, 0.35, 0.4], [0.35, 0.33, 0.32], { yaw: a, rnd });
      }
      const spots = plant(rnd, 220, { inner: 14, outer: 70 });
      return {
        ground, h0, phase: rnd() * TAU, fire: kit.mesh(fire),
        trees: kit.mesh(woods(rnd, spots, { pines: 0.75, height: [7, 13] })),
        flames: kit.cloud(seeds(260, 91)), sparks: kit.cloud(seeds(520, 92)), smoke: kit.cloud(seeds(140, 93)),
      };
    },
    draw(k, s, t, tone) {
      const { c } = tone;
      const a = s.phase + t.camera * 0.03;
      const r = 9 + Math.sin(t.camera * 0.05);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const eye = [x, Math.max(terrainHeight(s.ground, x, z), s.h0) + 2.2, z];
      const flicker = 0.85 + 0.15 * Math.sin(t.objects * 9.1) * Math.sin(t.objects * 5.3 + 1);
      const fireLight = scale([1.6, 0.75, 0.3], 2.2 * flicker);
      const firePos = [0, s.h0 + 1.2, 0];
      const moon = sunDir(1.5, 0.6);
      const env = { sun: moon, sunColor: [0.12, 0.14, 0.22], ambient: [0.05, 0.05, 0.08], fog: c([0.03, 0.03, 0.06]), fogRange: [20, 110] };
      k.camera(eye, [0, s.h0 + 1.3, 0], { fov: 1.0 });
      k.begin(env.fog);
      k.sky(skyOf({ zenith: c([0.01, 0.01, 0.04]), horizon: c([0.04, 0.04, 0.08]), sun: moon, sunColor: [0, 0, 0], sunSize: 0, glow: 0, stars: 1.2, milky: 0.4, spin: t.sky * 0.01, time: t.sky, haze: 0.2 }));
      const lit = { ...light(env), uLightPos: firePos, uLightColor: fireLight };
      k.terrain(s.ground, { ...lit, uLow: [0.18, 0.15, 0.12], uMid: [0.14, 0.16, 0.1], uHigh: [0.2, 0.18, 0.15], uPeak: [0.2, 0.18, 0.15], uSpan: 300 });
      k.solid(s.fire, lit);
      k.solid(s.trees, { ...lit, uWind: 0.15, uTime: t.objects }, { ground: s.ground });
      k.points(s.smoke, { uShape: 6, uCenter: [0, s.h0 + 10, 0], uBox: [4, 18, 4], uVel: [0.25, 1.2, 0], uWobble: [0.8, 0, 0.8], uWobbleFreq: 0.3, uRise: 1, uTime: t.objects, uSize: 2.5, uMaxSize: 200, uColorA: [0.3, 0.28, 0.3], uColorB: [0.22, 0.2, 0.22], uAlpha: 0.12 }, { blend: 'alpha' });
      k.points(s.flames, { uShape: 6, uCenter: [0, s.h0 + 1.5, 0], uBox: [1.3, 3, 1.3], uVel: [0, 2.4, 0], uWobble: [0.15, 0, 0.15], uWobbleFreq: 3, uRise: 1.5, uTime: t.objects, uSize: 0.9, uMaxSize: 160, uColorA: [1, 0.45, 0.1], uColorB: [1, 0.8, 0.3], uAlpha: 0.5 });
      k.points(s.sparks, { uShape: 0, uCenter: [0, s.h0 + 8, 0], uBox: [8, 16, 8], uVel: [0.3, 1.8, 0.1], uWobble: [0.6, 0.2, 0.6], uWobbleFreq: 0.8, uRise: 0.8, uTwinkle: 0.6, uTime: t.objects, uSize: 0.07, uColorA: [1, 0.55, 0.15], uColorB: [1, 0.8, 0.4] });
    },
  },

  lake: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.basin, amp: 30, freq: 0.02, seed: [rnd() * 50, rnd() * 50], shape: [0, 0, 40, 120] };
      const spots = plant(rnd, 420, { inner: 36, outer: 100 });
      return { ground, phase: rnd() * TAU, trees: kit.mesh(woods(rnd, spots, { pines: 0.7, height: [6, 12] })), mist: kit.cloud(seeds(160, 101)) };
    },
    draw(k, s, t, tone) {
      const { c, dark } = tone;
      const a = s.phase + t.camera * 0.01;
      const eye = [Math.cos(a) * 24, 3.5 + Math.sin(t.camera * 0.07) * 0.6, Math.sin(a) * 24];
      const look = a + Math.PI + Math.sin(t.camera * 0.03) * 0.5;
      const target = [Math.cos(look) * 60, 8, Math.sin(look) * 60];
      const sun = sunDir(t.sky * 0.01 + s.phase, dark ? 0.15 : 0.4);
      const horizon = c(dark ? [0.75, 0.6, 0.6] : [0.78, 0.86, 0.92]);
      const sunColor = dark ? [1, 0.75, 0.55] : [1, 0.95, 0.85];
      const env = { sun, sunColor, ambient: c([0.32, 0.36, 0.42]), fog: horizon, fogRange: [90, 320] };
      const sky = skyOf({ zenith: c(dark ? [0.12, 0.16, 0.36] : [0.2, 0.42, 0.78]), horizon, sun, sunColor, clouds: 0.45, cloudColor: dark ? [0.9, 0.78, 0.78] : [1, 1, 1], time: t.sky, haze: 0.35 });
      const land = { ...light(env), uLow: [0.3, 0.42, 0.2], uMid: [0.16, 0.3, 0.14], uHigh: [0.42, 0.4, 0.38], uPeak: [0.95, 0.96, 0.98], uBands: [2, 14, 24, 2], uSpan: 520 };
      const trees = { ...light(env), uWind: 0.2, uTime: t.objects, uTint: c([1, 1, 1], 0.12), uMinGround: 0.5 };
      k.camera(eye, target, { fov: 0.95, level: 0 });
      k.begin(horizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
      k.endMirror();
      k.water({ uSpan: 300, uWave: 0.04, uRipple: 0.12, uTime: t.objects, uSun: sun, uSunColor: sunColor, uDeep: c([0.03, 0.1, 0.12]), uShallow: c([0.06, 0.16, 0.16]), uZenith: sky.uZenith, uHorizon: horizon, uFog: horizon, uFogRange: env.fogRange, uMirror: 0.9, uSpec: 1.2, uShine: 250 });
      k.terrain(s.ground, land);
      k.solid(s.trees, trees, { ground: s.ground });
      k.points(s.mist, { uShape: 6, uCenter: [0, 1.5, 0], uBox: [160, 3, 160], uVel: [0.6, 0, 0.2], uTime: t.objects, uSize: 7, uMaxSize: 256, uColorA: [1, 1, 1], uColorB: horizon, uAlpha: 0.06 }, { blend: 'alpha' });
    },
  },

  sunrise: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, ground: { mode: TERRAIN.far, amp: 35, freq: 0.005, seed: [rnd() * 50, rnd() * 50], shape: [380, 600, 0, 0] } }),
    draw(k, s, t, tone) {
      const { c } = tone;
      const rise = 0.5 - 0.5 * Math.cos(s.phase + t.sky * 0.025);
      const el = -0.05 + 0.27 * rise;
      const day = Math.max(0, Math.min(1, (el + 0.03) / 0.25));
      const sun = sunDir(Math.sin(t.camera * 0.01) * 0.1, el);
      const zenith = c(mix([0.1, 0.1, 0.28], [0.25, 0.48, 0.8], day));
      const horizon = c(mix([1, 0.5, 0.32], [0.92, 0.86, 0.78], day), 0.12);
      const sunColor = mix([1, 0.5, 0.25], [1, 0.93, 0.8], day);
      const eye = [Math.sin(t.camera * 0.02) * 15, 2.5 + Math.sin(t.camera * 0.4) * 0.15, Math.cos(t.camera * 0.015) * 10];
      const env = { sun, sunColor: scale(sunColor, 0.4 + day * 0.6), ambient: mix([0.2, 0.18, 0.28], [0.4, 0.42, 0.5], day), fog: horizon, fogRange: [150, 700] };
      const sky = skyOf({ zenith, horizon, sun, sunColor, sunSize: 0.045, glow: 1.4 - day * 0.4, clouds: 0.35, cloudColor: mix([1, 0.62, 0.55], [1, 1, 1], day), time: t.sky, haze: 0.45 });
      k.camera(eye, [Math.sin(t.camera * 0.013) * 30, 6, -300], { fov: 0.9 });
      k.begin(horizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      k.endMirror();
      k.water({ uSpan: 800, uWave: 0.35, uWaveScale: 0.9, uRipple: 0.2, uTime: t.objects, uSun: sun, uSunColor: sunColor, uDeep: c(mix([0.06, 0.05, 0.14], [0.03, 0.12, 0.2], day)), uShallow: c([0.08, 0.15, 0.22]), uZenith: zenith, uHorizon: horizon, uFog: horizon, uFogRange: [150, 400], uMirror: 0.85, uSpec: 2.5, uShine: 60 });
      k.terrain(s.ground, { ...light(env), uLow: [0.28, 0.3, 0.4], uMid: [0.25, 0.28, 0.38], uHigh: [0.3, 0.32, 0.42], uPeak: [0.6, 0.62, 0.7], uBands: [0, 10, 28, 2], uSpan: 1400 });
    },
  },

  fireflies: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 3, freq: 0.03, seed: [rnd() * 50, rnd() * 50] };
      const spots = plant(rnd, 300, { inner: 20, outer: 90 });
      const grass = plant(rnd, 1400, { outer: 40, avoid: awayFromRing(12, 1) });
      const dark = [0.04, 0.07, 0.05];
      return {
        ground, phase: rnd() * TAU,
        trees: kit.mesh(woods(rnd, spots, { pines: 0.5, height: [8, 14], leaves: dark, needles: dark, trunk: [0.05, 0.04, 0.03] })),
        grass: kit.mesh(tufts(rnd, grass, [0.08, 0.16, 0.08], 0.4)),
        flies: kit.cloud(seeds(700, 111)),
      };
    },
    draw(k, s, t, tone) {
      const { c } = tone;
      const a = s.phase + t.camera * 0.01;
      const path = circle(12, a);
      const dir = turn(path.dir, -0.6 + Math.sin(t.camera * 0.05) * 0.4);
      const eye = [path.pos[0], terrainHeight(s.ground, path.pos[0], path.pos[2]) + 1.6, path.pos[2]];
      const moon = sunDir(a + 1, 0.45);
      const fog = c([0.03, 0.06, 0.07]);
      const env = { sun: moon, sunColor: [0.26, 0.32, 0.44], ambient: [0.1, 0.13, 0.16], fog, fogRange: [15, 90] };
      k.camera(eye, ahead(eye, dir, 10, 0.3), { fov: 1.05 });
      k.begin(fog);
      k.sky(skyOf({ zenith: c([0.015, 0.03, 0.07]), horizon: c([0.1, 0.16, 0.22]), sun: moon, sunColor: [0.85, 0.88, 0.95], sunSize: 0.025, glow: 0.35, stars: 1.1, milky: 0.4, spin: t.sky * 0.01, time: t.sky, haze: 0.2 }));
      k.terrain(s.ground, { ...light(env), uLow: [0.1, 0.18, 0.09], uMid: [0.09, 0.16, 0.08], uHigh: [0.1, 0.15, 0.09], uPeak: [0.1, 0.15, 0.09], uSpan: 240 });
      const trees = { ...light(env), uWind: 0.15, uTime: t.objects };
      k.solid(s.trees, trees, { ground: s.ground });
      k.solid(s.grass, { ...trees, uWind: 0.12 }, { ground: s.ground });
      k.points(s.flies, { uCenter: [eye[0], 1.4, eye[2]], uBox: [44, 3.5, 44], uVel: [0.2, 0, 0.1], uWobble: [1.2, 0.5, 1.2], uWobbleFreq: 0.35, uBlink: 1, uTime: t.objects, uSize: 0.3, uColorA: c([0.85, 1, 0.35], 0.15), uColorB: [1, 0.9, 0.4] });
    },
  },

  geometry: {
    build(kit, rnd) {
      const solids = SOLID_KINDS.map((kind) => {
        const b = new MeshBuilder();
        solid(b, kind, [1, 1, 1], rnd);
        return kit.mesh(b);
      });
      const items = Array.from({ length: 22 }, (_, i) => ({
        kind: i % SOLID_KINDS.length,
        orbit: 5 + rnd() * 10,
        angle: rnd() * TAU,
        y: 2.5 + rnd() * 7,
        size: 0.9 + rnd() * 1.4,
        spin: [0.2 + rnd() * 0.5, 0.1 + rnd() * 0.4, rnd() * 0.3],
        color: Math.floor(rnd() * 4),
        phase: rnd() * TAU,
      }));
      return { phase: rnd() * TAU, solids, items };
    },
    draw(k, s, t, tone) {
      const { c, dark, accent } = tone;
      const a = s.phase + t.camera * 0.03;
      const eye = [Math.cos(a) * 24, 7 + Math.sin(t.camera * 0.06) * 2.5, Math.sin(a) * 24];
      const zenith = dark ? c([0.05, 0.06, 0.1], 0.3) : c([0.82, 0.85, 0.92], 0.15);
      const horizon = dark ? c([0.15, 0.15, 0.22], 0.3) : c([0.97, 0.96, 0.95], 0.1);
      const sun = sunDir(a + 0.8 + t.sky * 0.02, 0.65);
      const palette = [accent, turned(accent), [1, 0.78, 0.35], dark ? [0.9, 0.92, 0.98] : [0.25, 0.28, 0.35]];
      const env = { sun, sunColor: [0.85, 0.85, 0.85], ambient: dark ? [0.25, 0.25, 0.32] : [0.45, 0.45, 0.5], fog: horizon, fogRange: [40, 110] };
      const sky = skyOf({ zenith, horizon, sun, sunColor: [0, 0, 0], sunSize: 0, glow: 0, haze: 0.2, time: t.sky });
      k.camera(eye, [0, 4.5, 0], { fov: 0.95, level: 0 });
      const drawSolids = () => {
        for (const item of s.items) {
          const ang = item.angle + t.objects * 0.08 * (item.orbit < 9 ? 1 : -0.7);
          const pos = [Math.cos(ang) * item.orbit, item.y + Math.sin(t.objects * 0.6 + item.phase) * 0.6, Math.sin(ang) * item.orbit];
          modelMatrix(k.model, pos, t.objects * item.spin[0] + item.phase, t.objects * item.spin[1], t.objects * item.spin[2], item.size);
          k.solid(s.solids[item.kind], { ...light(env), uTint: palette[item.color], uEmit: 0.12, uRim: scale(mix(accent, [1, 1, 1], 0.5), 0.35) }, { model: k.model });
        }
      };
      k.begin(horizon);
      k.sky(sky);
      k.beginMirror();
      k.sky(sky);
      drawSolids();
      k.endMirror();
      const floor = dark ? c([0.06, 0.06, 0.09], 0.2) : c([0.75, 0.76, 0.8], 0.1);
      k.water({ uSpan: 240, uWave: 0, uRipple: 0, uTime: t.objects, uSun: sun, uSunColor: [1, 1, 1], uDeep: floor, uShallow: floor, uZenith: zenith, uHorizon: horizon, uFog: horizon, uFogRange: env.fogRange, uMirror: 0.6, uSpec: 0.4, uShine: 400 });
      drawSolids();
    },
  },

  ink: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, clouds: [seeds(380, 121), seeds(380, 122), seeds(380, 123)].map((d) => kit.cloud(d)) }),
    draw(k, s, t, tone) {
      const { c, dark, accent } = tone;
      const a = s.phase + t.camera * 0.02;
      const eye = [Math.cos(a) * 34, Math.sin(t.camera * 0.03) * 8, Math.sin(a) * 34];
      const zenith = dark ? c([0.02, 0.03, 0.05], 0.2) : c([0.9, 0.93, 0.96], 0.08);
      const horizon = dark ? c([0.06, 0.07, 0.1], 0.2) : c([0.98, 0.98, 0.97], 0.05);
      k.camera(eye, [0, 0, 0], { fov: 0.95 });
      k.begin(horizon);
      k.sky(skyOf({ zenith, horizon, sun: [0, 1, 0], sunColor: [0, 0, 0], sunSize: 0, glow: 0, space: 1, haze: 0, time: t.sky }));
      const inks = dark
        ? [[accent, turned(accent)], [[0.2, 0.5, 1], [0.6, 0.3, 1]], [[1, 0.35, 0.6], [1, 0.7, 0.3]]]
        : [[scale(accent, 0.6), scale(turned(accent), 0.5)], [[0.08, 0.12, 0.35], [0.15, 0.3, 0.55]], [[0.55, 0.1, 0.35], [0.1, 0.4, 0.45]]];
      const centers = [[-4, 4, 0], [5, -2, 3], [0, 1, -6]];
      inks.forEach(([ca, cb], i) => {
        k.points(s.clouds[i], { uShape: 6, uCenter: centers[i], uBox: [30, 24, 30], uVel: [0, -0.6, 0], uSwirl: i % 2 ? -0.25 : 0.25, uWobble: [2, 1, 2], uWobbleFreq: 0.25, uTime: t.objects + i * 20, uSize: 3.5, uMaxSize: 256, uColorA: ca, uColorB: cb, uAlpha: dark ? 0.1 : 0.12 }, { blend: dark ? 'add' : 'alpha' });
      });
      [0, 1, 2].forEach((i) => {
        k.ribbon({ uMode: 0, uIndex: i + 7, uRadius: 7 + i * 2, uWidth: 0.35, uTime: t.objects * 0.6, uSun: [0, 1, 0], uColorA: inks[i][0], uColorB: inks[i][1], uAlpha: 0.45 }, { blend: dark ? 'add' : 'alpha' });
      });
    },
  },

  petals: {
    build(kit, rnd) {
      const ground = { mode: TERRAIN.hills, amp: 4, freq: 0.025, seed: [rnd() * 50, rnd() * 50] };
      const b = new MeshBuilder();
      for (const [x, z] of plant(rnd, 150, { outer: 90, avoid: awayFromRing(30, 4.5) })) blossomTree(b, x, z, 6 + rnd() * 4, [1, 0.72, 0.82], [0.32, 0.22, 0.2], rnd);
      const grass = plant(rnd, 1200, { outer: 60, avoid: awayFromRing(30, 1) });
      return { ground, phase: rnd() * TAU, trees: kit.mesh(b), grass: kit.mesh(tufts(rnd, grass, [0.4, 0.6, 0.25], 0.3)), petals: kit.cloud(seeds(2600, 131)) };
    },
    draw(k, s, t, tone) {
      const { c } = tone;
      const a = s.phase + t.camera * 0.01;
      const path = circle(30, a);
      const dir = turn(path.dir, Math.sin(t.camera * 0.06) * 0.4);
      const eye = [path.pos[0], follow(s, 'alt', terrainHeight(s.ground, path.pos[0], path.pos[2]) + 1.8, t.step), path.pos[2]];
      const sun = sunDir(t.sky * 0.01 + 1, 0.6);
      const horizon = c([0.96, 0.9, 0.92], 0.1);
      const env = { sun, sunColor: [1, 0.95, 0.88], ambient: c([0.45, 0.42, 0.48]), fog: horizon, fogRange: [40, 200] };
      k.camera(eye, ahead(eye, dir, 10, 0.8), { fov: 1.0 });
      k.begin(horizon);
      k.sky(skyOf({ zenith: c([0.45, 0.65, 0.9]), horizon, sun, sunColor: [1, 0.97, 0.9], clouds: 0.35, time: t.sky, haze: 0.4 }));
      k.terrain(s.ground, { ...light(env), uLow: [0.45, 0.62, 0.3], uMid: [0.4, 0.58, 0.28], uHigh: [0.5, 0.55, 0.35], uPeak: [0.5, 0.55, 0.35], uSpan: 400 });
      const trees = { ...light(env), uWind: 0.25, uTime: t.objects, uTint: c([1, 1, 1], 0.04) };
      k.solid(s.trees, trees, { ground: s.ground });
      k.solid(s.grass, { ...trees, uWind: 0.15 }, { ground: s.ground });
      k.points(s.petals, { uShape: 3, uCenter: ahead(eye, dir, 10, 5), uBox: [50, 24, 50], uVel: [1.6, -1.1, 0.6], uWobble: [0.8, 0.4, 0.8], uWobbleFreq: 1.4, uTime: t.objects, uSize: 0.14, uColorA: [1, 0.75, 0.85], uColorB: [1, 0.92, 0.95], uAlpha: 0.95 }, { blend: 'alpha' });
    },
  },

  mountains: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, ground: { mode: TERRAIN.ridges, amp: 70, freq: 0.006, seed: [rnd() * 50, rnd() * 50] }, mist: kit.cloud(seeds(120, 141)) }),
    draw(k, s, t, tone) {
      const { c, dark } = tone;
      const a = s.phase + t.camera * 0.006;
      const path = circle(1200, a);
      const dir = turn(path.dir, Math.sin(t.camera * 0.03) * 0.25);
      const top = groundUnder(s.ground, path.pos[0], path.pos[2], 50);
      const eye = [path.pos[0], follow(s, 'alt', top + 22, t.step, top + 8), path.pos[2]];
      const sun = sunDir(headingOf(path.dir) + 0.9 + t.sky * 0.004, dark ? 0.12 : 0.45);
      const horizon = c(dark ? [0.82, 0.62, 0.58] : [0.78, 0.84, 0.92]);
      const sunColor = dark ? [1, 0.7, 0.5] : [1, 0.96, 0.88];
      const env = { sun, sunColor, ambient: c([0.3, 0.34, 0.42]), fog: horizon, fogRange: [150, 700] };
      k.camera(eye, ahead(eye, dir, 60, -10), { fov: 1.0 });
      k.begin(horizon);
      k.sky(skyOf({ zenith: c(dark ? [0.14, 0.17, 0.38] : [0.2, 0.42, 0.8]), horizon, sun, sunColor, clouds: 0.5, cloudColor: dark ? [0.95, 0.75, 0.72] : [1, 1, 1], time: t.sky, haze: 0.4 }));
      k.terrain(s.ground, { ...light(env), uLow: [0.25, 0.38, 0.18], uMid: [0.16, 0.28, 0.14], uHigh: [0.4, 0.38, 0.36], uPeak: [0.96, 0.97, 1], uBands: [0, 18, 34, 3], uTime: t.objects, uSparkle: 0.2, uSpan: 1400 });
      k.points(s.mist, { uShape: 6, uCenter: [eye[0], 6, eye[2]], uBox: [600, 10, 600], uVel: [3, 0, 1], uTime: t.objects, uSize: 32, uMaxSize: 256, uColorA: [1, 1, 1], uColorB: horizon, uAlpha: 0.08 }, { blend: 'alpha' });
    },
  },
};

export function sceneOf(id) {
  return SCENES[id] ?? SCENES.valley;
}

export const SCENE_IDS = Object.keys(SCENES);

/** Free the buffers a scene's build made. */
export function releaseScene(kit, state) {
  for (const value of Object.values(state ?? {})) {
    if (Array.isArray(value)) for (const item of value) { if (item?.buffer) kit.release(item); }
    else if (value?.buffer) kit.release(value);
  }
}
