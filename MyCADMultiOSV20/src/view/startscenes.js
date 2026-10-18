// Start-page backgrounds: mechanical parts (Z up, millimetres).
// Positions are world coordinates. Parts that share gx/gy/gz, rate, spin and
// slide turn or travel together. The gear pair is a real spur-gear solid;
// the other scenes are built from primitives so switching stays immediate.
import { normalizeEntity } from '../domain/entities.js';
import { featureFrom, solidMesh } from '../domain/solids.js';
import { buildShapes, collectLoops } from '../domain/stl.js';

const at = (shape, spec) => ({ shape, color: 'steel', ...spec });

function turned(rate, spin, [gx, gy, gz], items, about) {
  return items.map((item) => ({ ...item, gx, gy, gz, rate, spin, about }));
}

function riding(slide, [gx, gy, gz], items) {
  return items.map((item) => ({ ...item, gx, gy, gz, rate: 0, spin: 'z', slide }));
}

function ring(count, radius, shape, spec) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    items.push(at(shape, { ...spec, x: (spec.x ?? 0) + Math.cos(a) * radius, y: (spec.y ?? 0) + Math.sin(a) * radius }));
  }
  return items;
}

function gearItems() {
  const module = 3;
  const gear = (teeth, bore, angle) => {
    const part = normalizeEntity({ type: 'part', kind: 'gear', x: 0, y: 0, angle, params: { module, teeth, bore, keyway: true, pitchCircle: false } });
    const shapes = buildShapes(collectLoops([part]).loops).map(({ outer, holes }) => ({ outer, holes }));
    return solidMesh(normalizeEntity({ type: 'solid', ...featureFrom('pad', { shapes }, { height: 14 }) }));
  };
  const shaft = (radius) => solidMesh(normalizeEntity({ type: 'solid', kind: 'cylinder', params: { radius, height: 44 }, x: 0, y: 0, z: -15 }));
  const [z1, z2] = [24, 16];
  const distance = (module * (z1 + z2)) / 2;
  const speed = 0.32;
  const mesh = (tris, color, gx, rate) => ({ shape: 'mesh', tris, color, x: gx, y: 0, z: 0, gx, gy: 0, gz: 0, rate, spin: 'z' });
  return [
    mesh(gear(z1, 16, 0), '#e8a53a', 0, speed),
    mesh(shaft(7.6), '#9aa4b1', 0, speed),
    mesh(gear(z2, 12, 180 / z2), '#3a6cf0', distance, (-speed * z1) / z2),
    mesh(shaft(5.6), '#9aa4b1', distance, (-speed * z1) / z2),
  ];
}

function shaft() {
  const steps = [[16, 22], [26, 18], [20, 52], [32, 14], [18, 34], [11, 18]];
  let z = 0;
  const parts = [];
  for (const [r, h] of steps) {
    parts.push(at('cyl', { r, h, z: z + h / 2, color: r >= 30 ? 'brass' : 'steel' }));
    z += h;
  }
  // Key on the long journal (the third step starts at z = 40).
  parts.push(at('box', { w: 7, d: 5, h: 40, x: 18, z: 66, color: 'dark' }));
  parts.push(at('torus', { r: 34, tube: 6, z: 99, color: 'dark' }));
  return turned(0.45, 'z', [0, 0, 0], parts);
}

function flange() {
  const parts = [
    at('cyl', { r: 52, h: 14, z: 7, color: 'steel' }),
    at('cyl', { r: 22, h: 26, z: 20, color: 'aluminum' }),
    at('torus', { r: 12, tube: 2.6, z: 33, color: 'dark' }),
    ...ring(8, 36, 'cyl', { r: 4.4, h: 18, seg: 6, z: 11, color: 'brass' }),
  ];
  return turned(0.28, 'z', [0, 0, 0], parts);
}

function fastener() {
  const bolt = turned(0.45, 'z', [0, 0, 0], [
    at('cyl', { r: 13, h: 9, seg: 6, z: 4.5, color: 'steel' }),
    at('cyl', { r: 6.2, h: 64, z: 41, color: 'aluminum' }),
    at('torus', { r: 12, tube: 2.2, z: 16, color: 'brass' }),
  ]);
  const nut = turned(-0.85, 'z', [0, 0, 0], [
    at('cyl', { r: 11, h: 10, seg: 6, z: 60, color: 'brass' }),
  ]);
  return [...bolt, ...nut];
}

function bracket() {
  const parts = [
    at('box', { w: 80, d: 48, h: 8, z: 4, color: 'steel' }),
    at('box', { w: 8, d: 48, h: 64, x: -36, z: 40, color: 'steel' }),
    at('box', { w: 18, d: 48, h: 8, x: -23, z: 8, color: 'aluminum' }),
    ...[[8, 14], [8, -14], [30, 14], [30, -14]].map(([x, y]) => at('cyl', { r: 3.2, h: 12, x, y, z: 6, color: 'dark' })),
    ...[26, 50].map((z) => at('cyl', { axis: 'x', r: 3.2, h: 12, x: -36, z, color: 'dark' })),
  ];
  return turned(0.16, 'z', [0, 0, 0], parts, 'center');
}

function housing() {
  const shell = [
    at('box', { w: 108, d: 76, h: 6, z: 3, color: 'dark' }),
    at('box', { w: 108, d: 6, h: 46, y: -35, z: 29, color: 'steel' }),
    at('box', { w: 108, d: 6, h: 46, y: 35, z: 29, color: 'steel' }),
    at('box', { w: 6, d: 76, h: 46, x: -51, z: 29, color: 'steel' }),
    at('box', { w: 6, d: 76, h: 46, x: 51, z: 29, color: 'steel' }),
    at('box', { w: 78, d: 48, h: 4, z: 54, color: 'aluminum' }),
  ];
  const left = turned(0.85, 'x', [0, -12, 28], [
    at('cyl', { axis: 'x', r: 5, h: 128, y: -12, z: 28, color: 'aluminum' }),
    at('cyl', { axis: 'x', r: 18, h: 10, y: -12, z: 28, color: 'brass' }),
  ]);
  const right = turned(-1.25, 'x', [0, 14, 28], [
    at('cyl', { axis: 'x', r: 5, h: 128, y: 14, z: 28, color: 'aluminum' }),
    at('cyl', { axis: 'x', r: 12, h: 10, y: 14, z: 28, color: 'blue' }),
  ]);
  return [...shell, ...left, ...right];
}

function frame() {
  const posts = [];
  for (const [x, y] of [[-42, -26], [42, -26], [-42, 26], [42, 26]]) posts.push(at('box', { w: 8, d: 8, h: 72, x, y, z: 36, color: 'steel' }));
  posts.push(at('box', { w: 92, d: 8, h: 8, y: -26, z: 76, color: 'aluminum' }), at('box', { w: 92, d: 8, h: 8, y: 26, z: 76, color: 'aluminum' }));
  posts.push(at('box', { w: 8, d: 60, h: 8, x: -42, z: 76, color: 'aluminum' }), at('box', { w: 8, d: 60, h: 8, x: 42, z: 76, color: 'aluminum' }));
  const beam = riding({ axis: 'x', amp: 26, speed: 0.55 }, [0, 0, 70], [
    at('box', { w: 36, d: 44, h: 8, z: 70, color: 'brass' }),
    at('cyl', { r: 3, h: 18, z: 58, color: 'dark' }),
  ]);
  return [...posts, ...beam];
}

function pulley() {
  const wheel = (x, rate) => turned(rate, 'z', [x, 0, 0], [
    at('cyl', { r: 8, h: 16, x, z: 28, color: 'steel' }),
    at('torus', { r: 20, tube: 4.2, x, z: 28, color: 'dark' }),
    at('cyl', { r: 4, h: 40, x, z: 28, color: 'aluminum' }),
  ]);
  return [
    ...wheel(-34, 0.8),
    ...wheel(34, -0.8),
    at('box', { w: 68, d: 3.2, h: 3.2, z: 48, color: 'dark' }),
    at('box', { w: 68, d: 3.2, h: 3.2, z: 8, color: 'dark' }),
    at('box', { w: 90, d: 28, h: 8, z: 4, color: 'steel' }),
  ];
}

function spring() {
  return turned(0.4, 'z', [0, 0, 0], [
    at('coil', { r: 16, tube: 2.3, turns: 8, pitch: 7, z: 38, color: 'brass' }),
    at('cyl', { r: 20, h: 6, z: 3, color: 'steel' }),
    at('cyl', { r: 20, h: 6, z: 74, color: 'steel' }),
    at('cyl', { r: 4, h: 80, z: 40, color: 'aluminum' }),
  ]);
}

function pipe() {
  const g = [0, 0, 0];
  const parts = [
    at('cyl', { axis: 'x', r: 6, h: 78, x: -46, z: 16, color: 'aluminum' }),
    at('cyl', { axis: 'x', r: 12, h: 5, x: -85, z: 16, color: 'brass' }),
    at('arc', { r: 22, tube: 6, a0: -Math.PI / 2, sweep: Math.PI / 2, x: -7, y: 22, z: 16, color: 'aluminum' }),
    at('cyl', { axis: 'y', r: 6, h: 64, x: 15, y: 54, z: 16, color: 'aluminum' }),
    at('cyl', { axis: 'y', r: 12, h: 5, x: 15, y: 86, z: 16, color: 'brass' }),
    at('cyl', { axis: 'z', r: 5, h: 48, x: -46, z: 40, color: 'steel' }),
    at('torus', { r: 11, tube: 2.4, x: -46, z: 64, color: 'copper' }),
  ];
  return turned(0.18, 'z', g, parts, 'center');
}

function vise() {
  const base = [
    at('box', { w: 120, d: 40, h: 12, z: 6, color: 'dark' }),
    at('box', { w: 90, d: 10, h: 8, z: 16, color: 'steel' }),
    at('box', { w: 14, d: 40, h: 40, x: -46, z: 32, color: 'steel' }),
  ];
  const jaw = riding({ axis: 'x', amp: 16, speed: 0.85 }, [10, 0, 30], [
    at('box', { w: 14, d: 36, h: 34, x: 10, z: 30, color: 'blue' }),
  ]);
  const screw = turned(2.4, 'x', [12, 0, 22], [
    at('cyl', { axis: 'x', r: 3.4, h: 86, x: 12, z: 22, color: 'brass' }),
    at('cyl', { axis: 'x', r: 8, h: 8, seg: 6, x: 58, z: 22, color: 'steel' }),
  ]);
  return [...base, ...jaw, ...screw];
}

function coupling() {
  const parts = [
    at('cyl', { axis: 'x', r: 7, h: 40, x: -42, z: 22, color: 'aluminum' }),
    at('cyl', { axis: 'x', r: 7, h: 40, x: 42, z: 22, color: 'aluminum' }),
    at('cyl', { axis: 'x', r: 16, h: 34, x: 0, z: 22, color: 'steel' }),
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(at('cyl', { axis: 'x', r: 2.5, h: 40, y: Math.cos(a) * 16, z: 22 + Math.sin(a) * 16, color: 'brass' }));
  }
  return turned(0.7, 'x', [0, 0, 22], parts);
}

function bearing() {
  const outer = [at('torus', { r: 30, tube: 6, z: 18, color: 'steel' })];
  const balls = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    balls.push(at('sphere', { r: 4.4, x: Math.cos(a) * 23, y: Math.sin(a) * 23, z: 18, color: 'brass' }));
  }
  const inner = turned(0.9, 'z', [0, 0, 0], [
    at('torus', { r: 16, tube: 4.2, z: 18, color: 'aluminum' }),
    at('cyl', { r: 8, h: 22, z: 18, color: 'dark' }),
    ...balls,
  ]);
  return [...outer, ...inner];
}

function plate() {
  const parts = [
    at('box', { w: 96, d: 64, h: 8, z: 4, color: 'aluminum' }),
    at('box', { w: 28, d: 16, h: 8, z: 12, color: 'steel' }),
  ];
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iy = 0; iy < 3; iy += 1) parts.push(at('cyl', { r: 3, h: 12, x: -33 + ix * 22, y: -18 + iy * 18, z: 6, color: 'dark' }));
  }
  return turned(0.2, 'z', [0, 0, 0], parts, 'center');
}

function cam() {
  const disc = turned(1.1, 'z', [0, 0, 0], [
    at('cyl', { r: 16, h: 12, x: 9, z: 18, color: 'brass' }),
    at('cyl', { r: 5, h: 26, z: 18, color: 'steel' }),
  ]);
  const follower = riding({ axis: 'x', amp: 8, speed: 2.2 }, [36, 0, 22], [
    at('box', { w: 12, d: 14, h: 22, x: 36, z: 22, color: 'blue' }),
    at('cyl', { axis: 'x', r: 4, h: 28, x: 48, z: 22, color: 'aluminum' }),
  ]);
  return [
    ...disc,
    ...follower,
    at('box', { w: 10, d: 22, h: 28, x: 62, z: 24, color: 'dark' }),
  ];
}

function crank() {
  const shaft = turned(0.85, 'x', [0, 0, 26], [
    at('cyl', { axis: 'x', r: 6, h: 28, x: -46, z: 26, color: 'steel' }),
    at('box', { w: 10, d: 10, h: 26, x: -28, z: 38, color: 'dark' }),
    at('cyl', { axis: 'x', r: 5, h: 16, x: -14, z: 48, color: 'brass' }),
    at('box', { w: 10, d: 10, h: 26, x: 0, z: 38, color: 'dark' }),
    at('cyl', { axis: 'x', r: 6, h: 34, x: 24, z: 26, color: 'steel' }),
  ]);
  const piston = riding({ axis: 'x', amp: 14, speed: 1.7 }, [62, 0, 26], [
    at('cyl', { axis: 'x', r: 12, h: 20, x: 62, z: 26, color: 'aluminum' }),
  ]);
  return [...shaft, ...piston, at('box', { w: 16, d: 28, h: 16, x: 78, z: 26, color: 'dark' })];
}

function lathe() {
  const bed = [
    at('box', { w: 176, d: 34, h: 14, z: 7, color: 'dark' }),
    at('box', { w: 156, d: 12, h: 6, z: 16, color: 'steel' }),
    at('box', { w: 36, d: 42, h: 48, x: -70, z: 40, color: 'steel' }),
    at('box', { w: 26, d: 30, h: 34, x: 72, z: 32, color: 'aluminum' }),
  ];
  const chuck = turned(1.3, 'x', [-42, 0, 46], [
    at('cyl', { axis: 'x', r: 16, h: 18, x: -42, z: 46, color: 'brass' }),
    at('cyl', { axis: 'x', r: 5.5, h: 82, x: 8, z: 46, color: 'aluminum' }),
  ]);
  const carriage = riding({ axis: 'x', amp: 24, speed: 0.4 }, [8, 0, 26], [
    at('box', { w: 24, d: 42, h: 14, x: 8, z: 26, color: 'blue' }),
    at('box', { w: 6, d: 8, h: 16, x: 8, y: -10, z: 38, color: 'dark' }),
  ]);
  return [...bed, ...chuck, ...carriage];
}

function mill() {
  const body = [
    at('box', { w: 86, d: 56, h: 12, z: 6, color: 'dark' }),
    at('box', { w: 26, d: 26, h: 96, x: -36, z: 54, color: 'steel' }),
    at('box', { w: 40, d: 28, h: 20, x: -16, z: 98, color: 'steel' }),
  ];
  const spindle = turned(1.8, 'z', [-4, 0, 78], [
    at('cyl', { r: 8, h: 26, x: -4, z: 78, color: 'aluminum' }),
    at('cyl', { r: 3, h: 18, x: -4, z: 58, color: 'brass' }),
  ]);
  const table = riding({ axis: 'y', amp: 16, speed: 0.5 }, [10, 0, 24], [
    at('box', { w: 62, d: 30, h: 10, x: 10, z: 24, color: 'blue' }),
    at('box', { w: 22, d: 14, h: 14, x: 10, z: 34, color: 'steel' }),
  ]);
  return [...body, ...spindle, ...table];
}

function block() {
  const parts = [
    at('box', { w: 84, d: 54, h: 28, z: 14, color: 'aluminum' }),
    at('box', { w: 34, d: 22, h: 8, x: -8, z: 32, color: 'dark' }),
    at('cyl', { r: 9, h: 14, x: 24, y: 12, z: 35, color: 'brass' }),
    at('cyl', { r: 3.2, h: 20, x: 24, y: 12, z: 36, color: 'dark' }),
    at('box', { w: 22, d: 14, h: 10, x: 16, y: -12, z: 33, color: 'steel' }),
  ];
  for (const [x, y] of [[-30, -18], [-30, 18], [30, -18], [30, 18]]) parts.push(at('cyl', { r: 3, h: 32, x, y, z: 16, color: 'dark' }));
  return turned(0.22, 'z', [0, 0, 0], parts, 'center');
}

function teeth(cx, radius, count, width, color) {
  const z = 10 + width / 2;
  const items = [at('cyl', { r: radius * 0.62, h: width, x: cx, z, color })];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    items.push(at('box', {
      w: radius * 0.28, d: radius * 0.16, h: width * 0.92,
      x: cx + Math.cos(a) * radius * 0.84, y: Math.sin(a) * radius * 0.84, z, rz: a, color,
    }));
  }
  items.push(at('cyl', { r: 5.5, h: width + 20, x: cx, z: 16, color: 'aluminum' }));
  return items;
}

function reducer() {
  const shell = [
    at('box', { w: 124, d: 86, h: 6, z: 3, color: 'dark' }),
    at('box', { w: 114, d: 6, h: 40, y: -40, z: 26, color: 'steel' }),
    at('box', { w: 114, d: 6, h: 40, y: 40, z: 26, color: 'steel' }),
    at('box', { w: 6, d: 86, h: 40, x: -59, z: 26, color: 'steel' }),
    at('box', { w: 6, d: 86, h: 40, x: 59, z: 26, color: 'steel' }),
  ];
  const big = turned(0.36, 'z', [-24, 0, 0], teeth(-24, 30, 16, 12, 'brass'));
  const small = turned(-0.36 * 16 / 10, 'z', [24, 0, 0], teeth(24, 18, 10, 12, 'blue'));
  return [...shell, ...big, ...small];
}

const SCENES = {
  gears: gearItems, shaft, flange, fastener, bracket, housing, frame, pulley, spring, pipe,
  vise, coupling, bearing, plate, cam, crank, lathe, mill, block, reducer,
};

const cache = new Map();

/** Ids that have a model. */
export function definedStartScenes() {
  return Object.keys(SCENES);
}

/** Parts for one start-page scene. Unknown ids use the gear pair. */
export function sceneItems(id) {
  const key = SCENES[id] ? id : 'gears';
  if (!cache.has(key)) cache.set(key, SCENES[key]());
  return cache.get(key);
}
