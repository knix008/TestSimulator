// The 3D start scenes. Each one is a coding world: terminals, circuits, racks,
// source trees and the rest. A scene builds its meshes once (`build`) and draws
// a frame from three clocks (`draw`): `camera` moves the viewer, `objects` moves
// packets, carets, tokens and cables, `sky` moves stars and light. Every clock
// runs at its own speed from Settings.
import { modelMatrix } from './gl.js';
import { box, MeshBuilder, seeds, solid, tube } from './meshes.js';
import { TERRAIN } from './terrain.js';

const TAU = Math.PI * 2;
// One pace for every scene. Scenery sweeps past at SWEEP radians per clock
// unit (world speed / look distance), so a speed setting is the same number
// on a terminal, a circuit board and the rest. Local blinks stay as they are.
const SWEEP = 0.1;
const pathClock = (radius, look) => (SWEEP * look) / radius;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

// Syntax colours, the same roles a code editor uses.
const KW = [0.55, 0.64, 1];
const STRC = [0.4, 0.86, 0.5];
const NUMC = [0.98, 0.64, 0.28];
const FNC = [0.98, 0.84, 0.38];
const TYC = [0.35, 0.86, 0.86];
const CMC = [0.48, 0.54, 0.62];
const ERRC = [1, 0.3, 0.34];
const FRAME = [0.11, 0.12, 0.16];
const INK = [0.05, 0.06, 0.09];
const SYNTAX = [KW, STRC, NUMC, FNC, TYC, CMC];

const ahead = (eye, dir, dist, dy = 0) => [eye[0] + dir[0] * dist, eye[1] + dy, eye[2] + dir[2] * dist];

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
    uStars: o.stars ?? 0, uMilky: o.milky ?? 0, uNebula: o.nebula ?? 0, uNebA: o.nebA ?? KW, uNebB: o.nebB ?? TYC,
    uTime: o.time ?? 0, uSpin: o.spin ?? 0, uRetro: 0, uRetroColor: [0, 0, 0], uFlash: 0,
    uHaze: o.haze ?? 0.16, uSpace: o.space ?? 1, uWind: [0, 0],
  };
}

/** A desk lamp: cool key light, theme-tinted, so panels read as solid objects. */
function codeLight(tone, fogRange = [30, 150]) {
  const { c, accent } = tone;
  return {
    sun: [0.25, 0.9, 0.32],
    sunColor: mix([0.42, 0.52, 0.82], accent, 0.4),
    ambient: [0.26, 0.28, 0.36],
    fog: c([0.04, 0.05, 0.09]),
    fogRange,
  };
}

function codeSky(tone, t, extra = {}) {
  const { c, accent } = tone;
  return skyOf({
    zenith: c(extra.zenith ?? [0.012, 0.018, 0.05]),
    horizon: c(extra.horizon ?? [0.06, 0.1, 0.18]),
    sun: [0.2, 0.95, 0.55],
    sunColor: extra.glow ? mix([0.45, 1, 0.7], accent, 0.45) : [0, 0, 0],
    sunSize: extra.sunSize ?? 0,
    glow: extra.glow ?? 0,
    stars: extra.stars ?? 0.5,
    milky: extra.milky ?? 0,
    nebula: extra.nebula ?? 0,
    nebA: mix(accent, KW, 0.5),
    nebB: TYC,
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

function beginScene(k, tone, t, eye, target, env, skyExtra = {}, cam = {}) {
  const sky = codeSky(tone, t, skyExtra);
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
    uLines: 0.85, uLineGap: gap, uLineColor: mix(TYC, accent, 0.4), uSpan: span,
  });
}

function panes(k, geo, env, tone, color) {
  const { accent } = tone;
  k.solid(geo, {
    ...light(env),
    uWindows: 1,
    uWinColor: mix(color, accent, 0.35),
    uTime: env.winTime ?? 0,
    uTint: mix([1, 1, 1], accent, 0.12),
    uEmit: 0.04,
  });
}

/** Block letters. Each row is a string; `#` is a cube. `origin` is the centre of the bottom row. */
function blocks(b, rows, origin, cell, color, rnd) {
  const h = rows.length;
  rows.forEach((row, y) => {
    const chars = [...row];
    chars.forEach((ch, x) => {
      if (ch === ' ') return;
      const px = origin[0] + (x - (chars.length - 1) / 2) * cell;
      const py = origin[1] + (h - 1 - y) * cell;
      box(b, [px, py, origin[2]], [cell * 0.78, cell * 0.78, cell * 0.62], color, { rnd });
    });
  });
}

const BRACE_L = [' ##', '#  ', '#  ', '#  ', ' ##'];
const BRACE_R = ['## ', '  #', '  #', '  #', '## '];

const SCENES = {
  terminal: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const r = 18;
        box(b, [Math.cos(a) * r, 0, Math.sin(a) * r], [5.4, 4.6, 0.45], FRAME, { yaw: a, win: 1, rnd });
      }
      return { phase: rnd() * TAU, panes: kit.mesh(b), carets: kit.cloud(seeds(220, 11)), dust: kit.cloud(seeds(360, 12)) };
    },
    draw(k, s, t, tone) {
      const env = { ...codeLight(tone, [12, 48]), winTime: t.objects };
      const { a, eye, dir } = fly(s, t, 7, 12, 2.15, 0.2);
      const out = [Math.cos(a), 0, Math.sin(a)];
      const sky = beginScene(k, tone, t, eye, [eye[0] + out[0] * 10, 2.05, eye[2] + out[2] * 10], env, { stars: 0.25, glow: 0.15, sunSize: 0.012 });
      const draw = () => panes(k, s.panes, env, tone, STRC);
      k.beginMirror();
      k.sky(sky);
      draw();
      k.endMirror();
      k.water({
        uSpan: 160, uWave: 0.02, uRipple: 0.04, uTime: t.objects, uSun: env.sun, uSunColor: [0.4, 1, 0.6],
        uDeep: [0.02, 0.04, 0.05], uShallow: [0.03, 0.08, 0.07], uZenith: sky.uZenith, uHorizon: sky.uHorizon,
        uFog: env.fog, uFogRange: env.fogRange, uMirror: 0.72, uSpec: 0.8, uShine: 180,
      });
      draw();
      k.points(s.carets, { uShape: 1, uCenter: ahead(eye, dir, 8, 0.4), uBox: [14, 5, 14], uVel: [0, -1.4, 0], uTime: t.objects, uSize: 0.28, uColorA: STRC, uColorB: [0.7, 1, 0.75], uAlpha: 0.85 });
      k.points(s.dust, { uCenter: eye, uBox: [20, 6, 20], uVel: [0.15, 0.05, 0], uTwinkle: 0.5, uTime: t.objects, uSize: 0.05, uColorA: [0.7, 0.9, 0.8], uColorB: TYC, uAlpha: 0.6 });
    },
  },

  editor: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      const gap = 8;
      for (let i = -5; i <= 5; i++) {
        for (let j = -5; j <= 5; j++) {
          if (Math.abs(i) + Math.abs(j) < 2) continue;
          if (rnd() < 0.18) continue;
          const x = i * gap;
          const z = j * gap;
          const far = Math.min(1, Math.hypot(i, j) / 7);
          const tall = 3 + (1 - far) * (8 + rnd() * 14);
          box(b, [x, 0, z], rnd() < 0.5 ? [1.7, tall, 4.2] : [4.2, tall, 1.7], FRAME, { win: 1, rnd });
        }
      }
      return { phase: rnd() * TAU, towers: kit.mesh(b), carets: kit.cloud(seeds(180, 21)) };
    },
    draw(k, s, t, tone) {
      const env = { ...codeLight(tone, [40, 180]), winTime: t.objects };
      const { eye } = fly(s, t, 42, 28, 14, 3);
      beginScene(k, tone, t, eye, [0, 6, 0], env, { stars: 0.35 });
      gridFloor(k, env, tone, 700, 8);
      panes(k, s.towers, env, tone, mix(KW, FNC, 0.4));
      k.points(s.carets, { uShape: 1, uCenter: [0, 1.2, 0], uBox: [80, 0.4, 80], uVel: [6, 0, 0], uLane: 8, uLaneY: 0.6, uTime: t.objects, uSize: 0.22, uColorA: STRC, uColorB: FNC, uFadeFar: 160 });
    },
  },

  coderain: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, rain: kit.cloud(seeds(1600, 31)), glow: kit.cloud(seeds(240, 32)) }),
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [20, 90]);
      const { eye, dir } = fly(s, t, 6, 14, 7, 1.2);
      beginScene(k, tone, t, eye, ahead(eye, dir, 16, -1), env, { stars: 0.15, haze: 0.08, zenith: [0.0, 0.02, 0.03], horizon: [0.02, 0.08, 0.05] });
      gridFloor(k, env, tone, 240, 3);
      const green = mix(STRC, accent, 0.25);
      k.points(s.rain, { uShape: 1, uCenter: eye, uBox: [28, 22, 36], uVel: [0, -11, 0], uRise: 0.55, uTime: t.objects, uSize: 0.42, uColorA: green, uColorB: [0.15, 0.55, 0.32], uAlpha: 0.9 });
      k.points(s.glow, { uCenter: [eye[0], 1, eye[2]], uBox: [30, 2, 30], uTwinkle: 0.7, uTime: t.objects, uSize: 0.08, uColorA: green, uColorB: [0.8, 1, 0.7], uAlpha: 0.7 });
    },
  },

  circuit: {
    build: (kit, rnd) => ({
      phase: rnd() * TAU,
      pads: kit.mesh((() => {
        const b = new MeshBuilder();
        for (let i = 0; i < 40; i++) {
          const x = (rnd() - 0.5) * 80;
          const z = (rnd() - 0.5) * 80;
          box(b, [x, 0, z], [0.7 + rnd() * 0.6, 0.12, 0.7 + rnd() * 0.6], rnd() < 0.5 ? TYC : NUMC, { rnd });
        }
        return b;
      })()),
      packets: [0, 1, 2, 3].map((i) => kit.cloud(seeds(160, 40 + i))),
    }),
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [25, 140]);
      const { eye, dir } = fly(s, t, 28, 18, 3.2, 0.3);
      beginScene(k, tone, t, eye, ahead(eye, dir, 14, -2.2), env, { stars: 0.2, horizon: [0.05, 0.12, 0.1] }, { fov: 1.0 });
      k.terrain({ mode: TERRAIN.flat }, {
        ...light(env),
        uLow: [0.04, 0.07, 0.06], uMid: [0.04, 0.07, 0.06], uHigh: [0.05, 0.09, 0.07], uPeak: [0.05, 0.09, 0.07],
        uLines: 1.35, uLineGap: 2, uLineColor: mix([0.15, 0.85, 0.55], accent, 0.35), uSpan: 400,
      });
      k.solid(s.pads, { ...light(env), uEmit: 0.55, uTint: [1, 1, 1] });
      const lane = { uCenter: [0, 0.3, 0], uBox: [90, 0.2, 90], uLane: 4, uLaneY: 0.25, uTime: t.objects, uSize: 0.16, uFadeFar: 120 };
      [[14, 0], [-11, 0], [0, 13], [0, -10]].forEach((vel, i) => {
        k.points(s.packets[i], { ...lane, uVel: [vel[0], 0, vel[1]], uColorA: i % 2 ? FNC : TYC, uColorB: accent });
      });
    },
  },

  racks: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      for (let i = -10; i <= 10; i++) {
        for (const side of [-1, 1]) {
          box(b, [side * 2.7, 0, i * 3.4], [1.15, 3.5, 2.15], FRAME, { win: 1, rnd });
        }
      }
      return { phase: rnd() * TAU, racks: kit.mesh(b), leds: kit.cloud(seeds(280, 51)) };
    },
    draw(k, s, t, tone) {
      const env = { ...codeLight(tone, [8, 42]), winTime: t.objects };
      const a = s.phase + t.camera * pathClock(48, 20);
      const z = Math.sin(a) * 26;
      const eye = [Math.sin(t.camera * 0.04) * 0.25, 1.65, z];
      const look = z + Math.cos(a) * 10;
      beginScene(k, tone, t, eye, [0, 1.5, look], env, { stars: 0.05, haze: 0.22, zenith: [0.02, 0.03, 0.06] }, { fov: 1.0 });
      gridFloor(k, env, tone, 200, 2);
      panes(k, s.racks, env, tone, mix(TYC, KW, 0.5));
      k.points(s.leds, { uCenter: [0, 3.2, 0], uBox: [7, 0.3, 70], uTwinkle: 0.85, uBlink: 0.4, uTime: t.objects, uSize: 0.08, uColorA: STRC, uColorB: ERRC, uAlpha: 0.9 });
    },
  },

  git: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, commits: kit.cloud(seeds(80, 61)) }),
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [20, 80]);
      const { eye } = fly(s, t, 20, 14, 5.5, 1.6);
      beginScene(k, tone, t, eye, [0, 0.5, 0], env, { stars: 0.7, nebula: 0.25 });
      const colors = [accent, STRC, FNC, TYC, NUMC, KW];
      colors.forEach((color, i) => {
        k.ribbon({ uMode: 0, uIndex: i, uRadius: 4.5 + i * 0.85, uWidth: 0.55, uTime: t.objects, uSun: env.sun, uColorA: color, uColorB: mix(color, [1, 1, 1], 0.35), uAlpha: 0.8 }, { blend: 'add' });
      });
      k.points(s.commits, { uCenter: [0, 0.4, 0], uBox: [16, 6, 16], uSwirl: 0.15, uTime: t.objects, uSize: 0.28, uColorA: [1, 1, 1], uColorB: accent, uTwinkle: 0.35 });
    },
  },

  tokens: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      for (let i = 0; i < 56; i++) {
        const a = (i / 56) * TAU;
        const r = 12 + (i % 3) * 1.4;
        const w = 0.45 + rnd() * 1.7;
        box(b, [Math.cos(a) * r, 0.9 + (i % 4) * 0.55, Math.sin(a) * r], [w, 0.32, 0.28], SYNTAX[i % SYNTAX.length], { yaw: a, rnd });
      }
      return { phase: rnd() * TAU, tokens: kit.mesh(b) };
    },
    draw(k, s, t, tone) {
      const env = codeLight(tone, [12, 50]);
      const { eye } = fly(s, t, 18, 12, 3.2, 0.4);
      beginScene(k, tone, t, eye, [0, 1.6, 0], env, { stars: 0.3 });
      gridFloor(k, env, tone, 180, 2);
      k.solid(s.tokens, { ...light(env), uEmit: 0.35, uTint: [1, 1, 1] });
    },
  },

  binary: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, bits: kit.cloud(seeds(900, 71)), sparks: kit.cloud(seeds(400, 72)) }),
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [16, 70]);
      const { eye, dir } = fly(s, t, 8, 14, 6, 1);
      beginScene(k, tone, t, eye, ahead(eye, dir, 14), env, { stars: 0.4 });
      k.points(s.bits, { uShape: 1, uCenter: [0, 6, 0], uBox: [26, 14, 26], uVel: [0, -2.5, 0], uTime: t.objects, uSize: 0.32, uColorA: [0.85, 0.92, 1], uColorB: mix(STRC, accent, 0.3), uAlpha: 0.85 });
      k.points(s.sparks, { uShape: 5, uCenter: [0, 6, 0], uBox: [26, 14, 26], uVel: [0.4, 0.2, 0], uTwinkle: 0.6, uTime: t.objects, uSize: 0.12, uColorA: FNC, uColorB: accent, uAlpha: 0.7 });
    },
  },

  keyboard: {
    build(kit, rnd) {
      const keys = new MeshBuilder();
      const lit = new MeshBuilder();
      const cols = 15;
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wide = r === rows - 1 && c === 7;
          if (wide) continue;
          if (r === rows - 1 && (c === 6 || c === 8)) continue;
          const x = (c - (cols - 1) / 2) * 1.05;
          const z = (r - (rows - 1) / 2) * 1.05;
          const target = rnd() < 0.14 ? lit : keys;
          box(target, [x, 0, z], [0.86, 0.34, 0.86], target === lit ? KW : [0.16, 0.17, 0.21], { rnd });
        }
      }
      box(keys, [0, 0, ((rows - 1) - (rows - 1) / 2) * 1.05], [3.3, 0.32, 0.86], [0.16, 0.17, 0.21], { rnd });
      return { phase: rnd() * TAU, keys: kit.mesh(keys), lit: kit.mesh(lit), dust: kit.cloud(seeds(80, 81)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [8, 30]);
      const { eye } = fly(s, t, 7.5, 6, 4.2, 0.35);
      beginScene(k, tone, t, eye, [0, 0.2, 0], env, { stars: 0.2 }, { fov: 0.85 });
      gridFloor(k, env, tone, 80, 1.05);
      k.solid(s.keys, { ...light(env), uTint: [1, 1, 1] });
      k.solid(s.lit, { ...light(env), uEmit: 0.72, uTint: mix(accent, [1, 1, 1], 0.2) });
      k.points(s.dust, { uCenter: [0, 1.2, 0], uBox: [16, 2, 8], uVel: [0.3, 0.15, 0], uTwinkle: 0.4, uTime: t.objects, uSize: 0.05, uColorA: accent, uColorB: FNC, uAlpha: 0.7 });
    },
  },

  chip: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      box(b, [0, 0, 0], [8.2, 0.28, 8.2], [0.08, 0.16, 0.13], { rnd });
      box(b, [0, 0.28, 0], [3.1, 0.38, 3.1], [0.12, 0.42, 0.36], { win: 1, rnd });
      for (let side = 0; side < 4; side++) {
        const yaw = side * Math.PI / 2;
        for (let i = -6; i <= 6; i++) {
          const along = i * 0.52;
          const x = Math.cos(yaw) * 4.35 - Math.sin(yaw) * along;
          const z = Math.sin(yaw) * 4.35 + Math.cos(yaw) * along;
          box(b, [x, 0, z], [0.16, 0.22, 0.42], [0.72, 0.76, 0.8], { yaw, rnd });
        }
      }
      return { phase: rnd() * TAU, die: kit.mesh(b), sparks: kit.cloud(seeds(220, 91)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = { ...codeLight(tone, [8, 28]), winTime: t.objects };
      const { eye } = fly(s, t, 9, 7, 4.2, 0.6);
      const sky = beginScene(k, tone, t, eye, [0, 0.6, 0], env, { stars: 0.35, glow: 0.2, sunSize: 0.01 });
      const draw = () => {
        panes(k, s.die, env, tone, STRC);
        k.points(s.sparks, { uCenter: [0, 1.1, 0], uBox: [7, 2.2, 7], uSwirl: 0.35, uTime: t.objects, uSize: 0.07, uTwinkle: 0.5, uColorA: TYC, uColorB: accent });
      };
      k.beginMirror();
      k.sky(sky);
      draw();
      k.endMirror();
      k.water({
        uSpan: 80, uWave: 0, uRipple: 0, uTime: t.objects, uSun: env.sun, uSunColor: env.sunColor,
        uDeep: [0.02, 0.04, 0.045], uShallow: [0.03, 0.06, 0.06], uZenith: sky.uZenith, uHorizon: sky.uHorizon,
        uFog: env.fog, uFogRange: env.fogRange, uMirror: 0.6, uSpec: 0.5, uShine: 240,
      });
      draw();
    },
  },

  network: {
    build(kit, rnd) {
      const nodes = Array.from({ length: 9 }, () => {
        const a = rnd() * TAU;
        const r = 4 + rnd() * 7;
        return [Math.cos(a) * r, 1.2 + rnd() * 3.5, Math.sin(a) * r];
      });
      const bodies = new MeshBuilder();
      const links = new MeshBuilder();
      nodes.forEach((p, i) => {
        box(bodies, p, [0.7, 0.7, 0.7], SYNTAX[i % SYNTAX.length], { rnd });
        const q = nodes[(i * 2 + 1) % nodes.length];
        tube(links, p, q, 0.045, 5, CMC, { rnd });
      });
      return { phase: rnd() * TAU, nodes: kit.mesh(bodies), links: kit.mesh(links), packets: kit.cloud(seeds(160, 101)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [14, 55]);
      const { eye } = fly(s, t, 16, 12, 5, 1.2);
      beginScene(k, tone, t, eye, [0, 2, 0], env, { stars: 0.85, nebula: 0.35 });
      k.solid(s.links, { ...light(env), uEmit: 0.4, uTint: mix(TYC, accent, 0.3) });
      k.solid(s.nodes, { ...light(env), uEmit: 0.45, uTint: [1, 1, 1], uRim: mix(accent, [1, 1, 1], 0.4) });
      k.points(s.packets, { uCenter: [0, 2, 0], uBox: [16, 5, 16], uSwirl: 0.22, uTime: t.objects, uSize: 0.1, uColorA: [1, 1, 1], uColorB: accent, uTwinkle: 0.4 });
    },
  },

  stack: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      for (let i = 0; i < 7; i++) {
        const w = 6.4 - i * 0.45;
        box(b, [0, i * 0.85, 0], [w, 0.48, w * 0.62], SYNTAX[i % SYNTAX.length], { win: 1, rnd });
      }
      return { phase: rnd() * TAU, frames: kit.mesh(b), rise: kit.cloud(seeds(200, 111)) };
    },
    draw(k, s, t, tone) {
      const env = { ...codeLight(tone, [10, 36]), winTime: t.objects };
      const { eye } = fly(s, t, 11, 9, 4.2, 0.8);
      beginScene(k, tone, t, eye, [0, 2.4, 0], env, { stars: 0.3 });
      gridFloor(k, env, tone, 80, 2);
      panes(k, s.frames, env, tone, KW);
      k.points(s.rise, { uCenter: [0, 3.2, 0], uBox: [2, 7, 2], uVel: [0, 1.6, 0], uRise: 0.8, uTime: t.objects, uSize: 0.1, uColorA: FNC, uColorB: STRC });
    },
  },

  ast: {
    build(kit, rnd) {
      const nodes = new MeshBuilder();
      const links = new MeshBuilder();
      const root = [0, 4.4, 0];
      const mids = [[-3.4, 2.3, 0.5], [0.2, 2.3, -0.8], [3.3, 2.3, 0.3]];
      const top = (p, size) => [p[0], p[1] + size[1], p[2]];
      const rootSize = [2.2, 0.7, 0.55];
      box(nodes, root, rootSize, KW, { win: 1, rnd });
      const rootTop = top(root, rootSize);
      mids.forEach((p, i) => {
        const size = [1.7, 0.55, 0.45];
        box(nodes, p, size, i === 1 ? FNC : TYC, { win: 1, rnd });
        tube(links, rootTop, [p[0], p[1] + size[1], p[2]], 0.05, 4, CMC, { rnd });
        for (const side of [-1, 1]) {
          const leaf = [p[0] + side * 1.15, 0.35, p[2] + side * 0.45];
          const leafSize = [1.05, 0.4, 0.36];
          box(nodes, leaf, leafSize, side < 0 ? STRC : NUMC, { win: 1, rnd });
          tube(links, top(p, size), top(leaf, leafSize), 0.04, 4, CMC, { rnd });
        }
      });
      return { phase: rnd() * TAU, nodes: kit.mesh(nodes), links: kit.mesh(links) };
    },
    draw(k, s, t, tone) {
      const env = { ...codeLight(tone, [10, 40]), winTime: t.objects };
      const { eye } = fly(s, t, 10, 8, 3.6, 0.7);
      beginScene(k, tone, t, eye, [0, 2.2, 0], env, { stars: 0.4 });
      gridFloor(k, env, tone, 80, 2);
      k.solid(s.links, { ...light(env), uEmit: 0.25, uTint: CMC });
      panes(k, s.nodes, env, tone, KW);
    },
  },

  debug: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, breaks: kit.cloud(seeds(70, 121)), caret: kit.cloud(seeds(12, 122)) }),
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [12, 55]);
      const { eye, dir } = fly(s, t, 22, 16, 1.7, 0.12);
      beginScene(k, tone, t, eye, ahead(eye, dir, 14, 0.15), env, { stars: 0.15, horizon: [0.08, 0.05, 0.08] }, { fov: 1.02 });
      k.terrain({ mode: TERRAIN.flat }, {
        ...light(env),
        uLow: [0.05, 0.05, 0.07], uMid: [0.05, 0.05, 0.07], uHigh: [0.05, 0.05, 0.07], uPeak: [0.05, 0.05, 0.07],
        uLines: 1.5, uLineGap: 1.15, uLineColor: mix([0.25, 0.32, 0.42], accent, 0.25), uSpan: 260,
      });
      k.points(s.breaks, { uCenter: [0, 0.35, 0], uBox: [60, 0.15, 60], uBlink: 1, uTime: t.objects, uSize: 0.2, uColorA: ERRC, uColorB: [1, 0.55, 0.3], uFadeFar: 80 });
      k.points(s.caret, { uShape: 1, uCenter: ahead(eye, dir, 5, -0.7), uBox: [0.15, 0.7, 0.15], uTime: t.objects, uSize: 0.55, uColorA: [0.75, 1, 0.85], uColorB: [0.75, 1, 0.85], uAlpha: 0.95 });
    },
  },

  containers: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          if (rnd() < 0.2) continue;
          const stack = rnd() < 0.35 ? 2 : 1;
          for (let k = 0; k < stack; k++) {
            box(b, [i * 3.4, k * 1.25, j * 6.2], [2.5, 1.1, 5.4], SYNTAX[(i + j + k + 6) % SYNTAX.length], { win: rnd() < 0.45 ? 1 : 0, rnd });
          }
        }
      }
      return { phase: rnd() * TAU, boxes: kit.mesh(b) };
    },
    draw(k, s, t, tone) {
      const env = { ...codeLight(tone, [20, 90]), winTime: t.objects };
      const { eye } = fly(s, t, 28, 20, 8, 1.5);
      beginScene(k, tone, t, eye, [0, 1.5, 0], env, { stars: 0.25 });
      gridFloor(k, env, tone, 240, 3.4);
      panes(k, s.boxes, env, tone, TYC);
    },
  },

  fiber: {
    build: (kit, rnd) => ({ phase: rnd() * TAU, photons: kit.cloud(seeds(500, 131)) }),
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [10, 40]);
      const { eye, dir } = fly(s, t, 1.2, 10, 0.4, 0.35);
      beginScene(k, tone, t, eye, ahead(eye, dir, 8, 0.2), env, { stars: 0.2, haze: 0.05 }, { fov: 1.05 });
      [accent, TYC, FNC, STRC, NUMC, KW].forEach((color, i) => {
        k.ribbon({ uMode: 0, uIndex: i + 2, uRadius: 2.2 + i * 0.7, uWidth: 0.28, uTime: t.objects, uSun: env.sun, uColorA: color, uColorB: [1, 1, 1], uAlpha: 0.75 }, { blend: 'add' });
      });
      k.points(s.photons, { uCenter: [0, 0, 0], uBox: [16, 8, 16], uSwirl: 0.4, uVel: [0, 0.4, 0], uTime: t.objects, uSize: 0.06, uTwinkle: 0.7, uColorA: [1, 1, 1], uColorB: accent });
    },
  },

  hex: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      for (let row = 0; row < 18; row++) {
        for (let col = 0; col < 22; col++) {
          const hot = rnd() < 0.22;
          box(b, [(col - 11) * 0.72, 0, (row - 9) * 0.72], [0.52, 0.16 + (hot ? 0.12 : 0), 0.52], hot ? SYNTAX[Math.floor(rnd() * SYNTAX.length)] : FRAME, { rnd });
        }
      }
      return { phase: rnd() * TAU, cells: kit.mesh(b), scan: kit.cloud(seeds(40, 141)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [10, 40]);
      const { eye } = fly(s, t, 9, 8, 5.2, 0.35);
      beginScene(k, tone, t, eye, [0, 0.1, 0], env, { stars: 0.2 }, { fov: 0.9 });
      k.solid(s.cells, { ...light(env), uEmit: 0.4, uTint: [1, 1, 1] });
      k.points(s.scan, { uShape: 1, uCenter: [Math.sin(t.objects * 0.15) * 6, 0.5, 0], uBox: [0.4, 0.3, 14], uTime: t.objects, uSize: 0.2, uColorA: mix(accent, [1, 1, 1], 0.3), uColorB: TYC, uAlpha: 0.8 });
    },
  },

  pipeline: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      SYNTAX.slice(0, 5).forEach((color, i) => {
        const z = (i - 2) * 7;
        box(b, [0, 0, z], [3.4, 2.1, 1.5], FRAME, { win: 1, rnd });
        box(b, [0, 2.1, z], [3.4, 0.16, 1.5], color, { rnd });
      });
      return { phase: rnd() * TAU, stages: kit.mesh(b), flow: kit.cloud(seeds(240, 151)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = { ...codeLight(tone, [14, 60]), winTime: t.objects };
      const { eye } = fly(s, t, 14, 12, 3.1, 0.5);
      beginScene(k, tone, t, eye, [0, 1.2, 0], env, { stars: 0.3 });
      gridFloor(k, env, tone, 160, 2);
      panes(k, s.stages, env, tone, KW);
      k.points(s.flow, { uCenter: [0, 1.05, 0], uBox: [0.8, 0.45, 36], uVel: [0, 0, 5], uTime: t.objects, uSize: 0.12, uColorA: accent, uColorB: FNC, uAlpha: 0.9 });
    },
  },

  repo: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      for (let i = 0; i < 14; i++) {
        const a = rnd() * TAU;
        const r = 3 + rnd() * 12;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        box(b, [x, 0, z], [1.5, 0.9, 1.15], mix(KW, [0.2, 0.35, 0.7], rnd()), { rnd });
        const files = 2 + Math.floor(rnd() * 3);
        for (let f = 0; f < files; f++) {
          box(b, [x + 0.15, 0.9 + f * 0.28, z], [1.15, 0.22, 0.85], SYNTAX[(i + f) % SYNTAX.length], { win: 1, rnd });
        }
      }
      return { phase: rnd() * TAU, files: kit.mesh(b) };
    },
    draw(k, s, t, tone) {
      const env = { ...codeLight(tone, [16, 70]), winTime: t.objects };
      const { eye } = fly(s, t, 18, 14, 5.5, 1);
      beginScene(k, tone, t, eye, [0, 1.2, 0], env, { stars: 0.45 });
      gridFloor(k, env, tone, 160, 3);
      panes(k, s.files, env, tone, FNC);
    },
  },

  api: {
    build(kit, rnd) {
      const hubs = [[0, 2.2, 0]];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        hubs.push([Math.cos(a) * (6 + (i % 2) * 3), 1.2 + (i % 3), Math.sin(a) * (6 + (i % 2) * 3)]);
      }
      const bodies = new MeshBuilder();
      const links = new MeshBuilder();
      hubs.forEach((p, i) => {
        const size = i === 0 ? 1.3 : 0.55;
        box(bodies, [p[0], p[1] - size / 2, p[2]], [size, size, size], i === 0 ? FNC : SYNTAX[i % SYNTAX.length], { rnd });
        if (i > 0) tube(links, hubs[0], p, 0.04, 4, CMC, { rnd });
      });
      return { phase: rnd() * TAU, hubs: kit.mesh(bodies), links: kit.mesh(links), calls: kit.cloud(seeds(180, 161)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [16, 70]);
      const { eye } = fly(s, t, 16, 12, 5, 1);
      beginScene(k, tone, t, eye, [0, 2, 0], env, { stars: 1, nebula: 0.45, milky: 0.2 });
      k.solid(s.links, { ...light(env), uEmit: 0.35, uTint: mix(CMC, accent, 0.4) });
      k.solid(s.hubs, { ...light(env), uEmit: 0.5, uRim: accent, uTint: [1, 1, 1] });
      k.points(s.calls, { uCenter: [0, 2, 0], uBox: [14, 4, 14], uSwirl: 0.18, uTime: t.objects, uSize: 0.09, uColorA: [1, 1, 1], uColorB: NUMC, uTwinkle: 0.45 });
    },
  },

  glyphs: {
    build(kit, rnd) {
      const b = new MeshBuilder();
      blocks(b, BRACE_L, [-4.2, 0, 0], 0.85, KW, rnd);
      blocks(b, BRACE_R, [4.2, 0, 0], 0.85, KW, rnd);
      box(b, [-0.7, 1.7, 0], [0.7, 0.7, 0.55], FNC, { rnd });
      box(b, [0.7, 1.7, 0], [0.7, 0.7, 0.55], STRC, { rnd });
      box(b, [0, 2.7, 0], [0.55, 0.55, 0.45], NUMC, { rnd });
      return { phase: rnd() * TAU, glyphs: kit.mesh(b), dust: kit.cloud(seeds(120, 171)) };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [10, 40]);
      const swing = Math.sin(s.phase + t.camera * pathClock(11, 8)) * 0.65;
      const eye = [Math.sin(swing) * 11, 3.2 + Math.sin(t.camera * 0.05) * 0.4, Math.cos(swing) * 11];
      const sky = beginScene(k, tone, t, eye, [0, 2, 0], env, { stars: 0.4, glow: 0.25, sunSize: 0.012 });
      const draw = () => {
        k.solid(s.glyphs, { ...light(env), uEmit: 0.2, uTint: [1, 1, 1], uRim: mix(accent, [1, 1, 1], 0.3) });
      };
      k.beginMirror();
      k.sky(sky);
      draw();
      k.endMirror();
      k.water({
        uSpan: 80, uWave: 0, uRipple: 0, uTime: t.objects, uSun: env.sun, uSunColor: env.sunColor,
        uDeep: [0.03, 0.035, 0.05], uShallow: [0.04, 0.05, 0.07], uZenith: sky.uZenith, uHorizon: sky.uHorizon,
        uFog: env.fog, uFogRange: env.fogRange, uMirror: 0.55, uSpec: 0.4, uShine: 300,
      });
      draw();
      k.points(s.dust, { uCenter: [0, 2.2, 0], uBox: [12, 4, 6], uVel: [0.2, 0.3, 0], uWobble: [0.3, 0.3, 0.3], uWobbleFreq: 0.4, uTime: t.objects, uSize: 0.06, uColorA: accent, uColorB: TYC, uAlpha: 0.7 });
    },
  },

  memory: {
    build(kit, rnd) {
      const kinds = ['cube', 'ico', 'octa', 'torus', 'tetra'];
      const solids = kinds.map((kind) => {
        const b = new MeshBuilder();
        solid(b, kind, [1, 1, 1], rnd);
        return kit.mesh(b);
      });
      const items = Array.from({ length: 16 }, (_, i) => ({
        kind: i % kinds.length,
        orbit: 4 + rnd() * 7,
        angle: rnd() * TAU,
        y: 1.4 + rnd() * 3.5,
        size: 0.7 + rnd() * 0.9,
        spin: 0.25 + rnd() * 0.45,
        color: i % SYNTAX.length,
        phase: rnd() * TAU,
      }));
      return { phase: rnd() * TAU, solids, items };
    },
    draw(k, s, t, tone) {
      const { accent } = tone;
      const env = codeLight(tone, [14, 50]);
      const { eye } = fly(s, t, 14, 10, 4.5, 0.8);
      const sky = beginScene(k, tone, t, eye, [0, 2, 0], env, { stars: 0.6, nebula: 0.2 });
      const draw = () => {
        for (const item of s.items) {
          const ang = item.angle + t.objects * 0.08 * (item.orbit < 7 ? 1 : -0.6);
          const pos = [Math.cos(ang) * item.orbit, item.y + Math.sin(t.objects * 0.5 + item.phase) * 0.35, Math.sin(ang) * item.orbit];
          modelMatrix(k.model, pos, t.objects * item.spin + item.phase, t.objects * item.spin * 0.6, 0, item.size);
          k.solid(s.solids[item.kind], {
            ...light(env),
            uTint: SYNTAX[item.color],
            uEmit: 0.28,
            uRim: mix(accent, [1, 1, 1], 0.45),
          }, { model: k.model });
        }
      };
      k.beginMirror();
      k.sky(sky);
      draw();
      k.endMirror();
      k.water({
        uSpan: 120, uWave: 0, uRipple: 0, uTime: t.objects, uSun: env.sun, uSunColor: [1, 1, 1],
        uDeep: [0.025, 0.03, 0.05], uShallow: [0.04, 0.045, 0.07], uZenith: sky.uZenith, uHorizon: sky.uHorizon,
        uFog: env.fog, uFogRange: env.fogRange, uMirror: 0.5, uSpec: 0.35, uShine: 320,
      });
      draw();
    },
  },
};

export function sceneOf(id) {
  return SCENES[id] ?? SCENES.terminal;
}

export const SCENE_IDS = Object.keys(SCENES);

/** Free the buffers a scene's build made. */
export function releaseScene(kit, state) {
  for (const value of Object.values(state ?? {})) {
    if (Array.isArray(value)) for (const item of value) { if (item?.buffer) kit.release(item); }
    else if (value?.buffer) kit.release(value);
  }
}
