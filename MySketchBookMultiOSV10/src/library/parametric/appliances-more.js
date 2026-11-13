// More appliances: fridges (French-door, column, wine, chest, retro), laundry (stack, top-loader,
// clothes care), cooking (range cooker, compact steam oven, warming drawer), cleaning & air
// (robot / stick vacuum, purifiers, dehumidifier, humidifier, heaters, fans, ceiling cassette),
// audio-video (speakers, soundbar, subwoofer, receiver, console, projector + screen), network
// (router, smart speaker), water purifier, sewing machine, ironing board, boiler, water heater.
// Plus preset variants of appliances.js entries. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, item, P, variant, roundRect, superEllipse, ellipse, frameShape, transformAdded } from './helpers.js';
import { finish } from './kitchen.js';
import { withMatrix } from './office.js';
import { ITEMS as BASE, fridgeBody, vBar, hBar, drumMachine } from './appliances.js';

const PI = Math.PI;
const byId = (id) => BASE.find((e) => e.id === id);

/* ------------------------------------------------------------- shared */

const SIZE_MAT = new THREE.MeshBasicMaterial();
const SIZE_CTX = { quality: 'high', wallThickness: 0.2, material: () => SIZE_MAT };

/** item() whose `size` is measured once from the default build (so it always matches the geometry). */
export function mk(def) {
  const entry = item({ size: [1, 1, 1], ...def });
  let cached = null;
  Object.defineProperty(entry, 'size', {
    enumerable: true, configurable: true,
    get() {
      if (!cached) {
        const b = new THREE.Box3().setFromObject(entry.build({}, SIZE_CTX));
        cached = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(Math.max(0.01, v) * 1000) / 1000);
      }
      return cached;
    },
    set(v) { cached = v; },
  });
  // The size if already measured (null if not): panels show it without building every model.
  Object.defineProperty(entry, 'knownSize', { enumerable: false, configurable: true, get: () => cached });
  return entry;
}

/** Round loudspeaker driver on a baffle whose front is at zf (centre x, y, radius r). */
export function driver(k, x, y, zf, r, { trim = 'metal-aluminium', cone = 'plastic-grey' } = {}) {
  k.add('drivers', 'rubber-black', new THREE.TorusGeometry(r * 0.9, r * 0.09, k.seg(8, 4), k.seg(32, 10)).scale(1, 1, 0.6).translate(x, y, zf + 0.002));
  k.cyl('cone', cone, r * 0.84, r * 0.84, 0.003, x, y, zf - 0.001, { rx: PI / 2, segs: k.seg(28, 10) });
  k.sphere('drivers', 'rubber-black', r * 0.28, x, y, zf + 0.001, { segs: k.seg(16, 8), rings: k.seg(6, 3), thetaLength: PI / 2, rx: PI / 2 });
  k.add('trim', trim, new THREE.TorusGeometry(r * 1.02, Math.max(0.002, r * 0.04), k.seg(6, 3), k.seg(32, 10)).translate(x, y, zf + 0.001));
}

/** Small round push buttons / LEDs in a row along x on a face at zf. */
function dots(k, role, mat, x0, x1, y, zf, n, r = 0.004) {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    k.cyl(role, mat, r, r, 0.003, x, y, zf, { rx: PI / 2, segs: k.seg(10, 5) });
  }
}

const FIN = [['metal-steel', '스테인리스', 'Stainless'], ['paint-white-gloss', '화이트', 'White'], ['paint-black-matte', '블랙', 'Black']];
void FIN;

/* -------------------------------------------------------- refrigerators */

const frenchFridge = mk({
  id: 'fridge-french-door', category: 'appliances', ko: '프렌치도어 냉장고(3도어)', en: 'French-door refrigerator',
  params: [
    P.len('width', '폭', 'Width', 0.91, 0.75, 1.0),
    P.len('height', '높이', 'Height', 1.79, 1.6, 1.95),
    P.len('depth', '깊이', 'Depth', 0.75, 0.65, 0.92),
    P.mat('finish', '마감', 'Finish', 'metal-steel', 'metal'),
    P.bool('dispenser', '정수기 디스펜서', 'Water dispenser', true),
  ],
  tags: ['french door fridge', 'refrigerator', 'bottom freezer', '프렌치도어 냉장고', '냉장고', '정수기 냉장고'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p, y0 = 0.035, ys = y0 + (h - y0) * 0.33;
    fridgeBody(k, {
      w, h, d, finish: p.finish, display: false,
      doors: [{ x0: -w / 2, x1: 0, y0: ys, y1: h, handle: 'v-right' }, { x0: 0, x1: w / 2, y0: ys, y1: h, handle: 'v-left' }, { x0: -w / 2, x1: w / 2, y0, y1: ys, handle: 'h-top' }],
    });
    if (p.dispenser) {
      const cx = -w / 4 - 0.02, cy = ys + (h - ys) * 0.42, zf = d / 2;
      k.box('dispenser', 'screen-black', 0.17, 0.32, 0.006, cx, cy, zf + 0.003, { r: 0.012 });
      k.box('dispenser', 'plastic-black', 0.12, 0.17, 0.02, cx, cy - 0.04, zf + 0.004, { r: 0.006 });
      k.box('trim', 'metal-chrome', 0.13, 0.012, 0.04, cx, cy - 0.135, zf + 0.02, { r: 0.004 });
      k.box('display', 'light-cool', 0.09, 0.02, 0.002, cx, cy + 0.12, zf + 0.0065, { r: 0 });
    }
    return finish(k);
  },
});

const columnFridge = mk({
  id: 'fridge-column-builtin', category: 'appliances', ko: '빌트인 컬럼 냉장고', en: 'Built-in column fridge',
  params: [
    P.len('width', '폭(1칸)', 'Width (each)', 0.6, 0.45, 0.9),
    P.len('height', '높이', 'Height', 2.0, 1.75, 2.2),
    P.bool('pair', '냉장+냉동 2칸', 'Fridge + freezer pair', true),
    P.mat('front', '도어 패널', 'Door panel', 'paint-white-matte', 'paint'),
    P.pick('handle', '손잡이', 'Handle', 'bar', [['bar', '긴 바', 'Long bar'], ['edge', '엣지', 'Edge pull']]),
  ],
  tags: ['column fridge', 'built-in refrigerator', 'integrated fridge', '컬럼 냉장고', '빌트인 냉장고', '키친핏'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.62, plinth = 0.1, n = p.pair ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * (w + 0.004);
      k.box('body', 'plastic-grey', w - 0.01, h - plinth, d - 0.03, cx, plinth + (h - plinth) / 2, -0.015, { r: 0.003 });
      k.box('plinth', 'plastic-black', w - 0.03, plinth, d - 0.08, cx, plinth / 2, -0.04, { r: 0.002 });
      k.box('doors', p.front, w - 0.003, h - plinth - 0.003, 0.022, cx, plinth + (h - plinth) / 2, d / 2 - 0.011, { r: 0.003 });
      const side = n === 2 ? (i === 0 ? 1 : -1) : -1; // handles at the meeting edges
      const hx = cx + side * (w / 2 - 0.05);
      if (p.handle === 'bar') vBar(k, 'metal-steel', hx, plinth + 0.35, plinth + 0.35 + Math.min(1.1, h * 0.55), d / 2, 0.035, 0.008);
      else k.box('handles', 'metal-aluminium', 0.018, h - plinth - 0.01, 0.022, cx + side * (w / 2 - 0.012), plinth + (h - plinth) / 2, d / 2 + 0.01, { r: 0.002 });
      k.box('display', 'light-cool', 0.04, 0.008, 0.002, cx, h - 0.09, d / 2 + 0.0015, { r: 0 });
    }
    return finish(k);
  },
});

/** Wine bottle lying along z (neck to +z), centre (x, y, z). */
function bottle(k, x, y, z, mat) {
  const L = 0.3, r = 0.037;
  const prof = [[0, 0], [r, 0.005], [r, L * 0.62], [r * 0.45, L * 0.78], [r * 0.36, L * 0.95], [r * 0.38, L], [0, L]];
  k.lathe('bottles', mat, prof, x, y, z - L / 2, { rx: PI / 2, segs: k.seg(10, 5) });
}

const wineFridge = mk({
  id: 'wine-cooler', category: 'appliances', ko: '와인 냉장고', en: 'Wine cooler',
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.3, 0.6),
    P.len('height', '높이', 'Height', 0.82, 0.82, 1.85),
    P.mat('finish', '마감', 'Finish', 'metal-black', 'metal'),
    P.mat('shelf', '선반 앞판', 'Shelf fronts', 'wood-oak', 'wood'),
  ],
  tags: ['wine cooler', 'wine fridge', 'wine cellar', '와인 냉장고', '와인셀러', '빌트인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.57, plinth = 0.085, t = 0.03, doorT = 0.04;
    const cd = d - doorT; // carcass depth
    const cz = -doorT / 2;
    // hollow carcass: sides, top, bottom, back liner
    for (const s of [-1, 1]) k.box('body', p.finish, t, h - plinth, cd, s * (w / 2 - t / 2), plinth + (h - plinth) / 2, cz, { r: 0.002 });
    k.box('body', p.finish, w - 2 * t, t, cd, 0, h - t / 2, cz, { r: 0.001 });
    k.box('liner', 'plastic-black', w - 2 * t, t, cd, 0, plinth + t / 2, cz, { r: 0.001 });
    k.box('liner', 'plastic-black', w - 2 * t, h - plinth - 2 * t, 0.02, 0, plinth + (h - plinth) / 2, cz - cd / 2 + 0.01, { r: 0 });
    k.box('plinth', 'plastic-black', w - 0.02, plinth, cd - 0.03, 0, plinth / 2, cz - 0.015, { r: 0.002 });
    k.box('plinth', 'metal-black', w - 0.04, plinth - 0.03, 0.006, 0, plinth / 2, d / 2 - doorT - 0.004, { r: 0.002 });
    // shelves with bottles lying neck-out
    const innerH = h - plinth - 2 * t, pitch = 0.105, n = Math.max(1, Math.floor((innerH - 0.03) / pitch));
    const per = Math.max(1, Math.floor((w - 2 * t - 0.01) / 0.082));
    const mats = ['plastic-black', 'plastic-black'];
    for (let i = 0; i < n; i++) {
      const y = plinth + t + 0.012 + i * pitch;
      k.box('shelves', p.shelf, w - 2 * t - 0.004, 0.025, 0.02, 0, y + 0.012, d / 2 - doorT - 0.03, { r: 0.002 });
      k.box('liner', 'metal-steel', w - 2 * t - 0.01, 0.004, cd - 0.06, 0, y, cz, { r: 0 });
      for (let j = 0; j < per; j++) {
        const x = -((per - 1) / 2) * 0.082 + j * 0.082;
        bottle(k, x, y + 0.04, cz + 0.02, mats[(i + j) % 2]);
      }
    }
    k.box('display', 'light-cool', w - 2 * t - 0.04, 0.008, 0.01, 0, h - t - 0.008, d / 2 - doorT - 0.04, { r: 0 });
    // glass door in a slim frame
    const dh = h - plinth - 0.004, dz = d / 2 - doorT / 2;
    k.panel('door', p.finish, frameShape(w - 0.004, dh, 0.04, 0.05), doorT, 0, plinth + dh / 2 + 0.002, dz, { bevel: 0.003 });
    k.box('glass', 'glass-tinted', w - 0.08, dh - 0.1, 0.006, 0, plinth + dh / 2 + 0.002, dz, { r: 0 });
    vBar(k, 'metal-steel', w / 2 - 0.022, plinth + dh * 0.25, plinth + dh * 0.25 + Math.min(0.6, dh * 0.5), d / 2, 0.03, 0.007);
    return finish(k);
  },
});

const chestFreezer = mk({
  id: 'chest-freezer', category: 'appliances', ko: '다목적 냉동고(뚜껑형)', en: 'Chest freezer',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.6),
    P.len('height', '높이', 'Height', 0.85, 0.8, 0.9),
    P.mat('finish', '마감', 'Finish', 'paint-white-gloss', 'paint'),
  ],
  tags: ['chest freezer', 'freezer', 'deep freezer', '냉동고', '뚜껑형 냉동고', '김치냉장고(뚜껑형)'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.64, lid = 0.075, base = 0.06;
    k.soft('body', p.finish, w, h - lid - base, d, 0.02, 0, base + (h - lid - base) / 2, 0, { flat: 3 });
    k.box('plinth', 'plastic-grey', w - 0.02, base, d - 0.04, 0, base / 2, -0.01, { r: 0.006, overrides: { color: '#b9bbbe' } });
    // vent grille in the kick plate
    for (let i = 0; i < 5; i++) k.box('vents', 'plastic-black', 0.16, 0.004, 0.004, w / 2 - 0.14, 0.012 + i * 0.009, d / 2 - 0.029, { r: 0 });
    k.soft('lid', p.finish, w + 0.006, lid, d + 0.012, 0.022, 0, h - lid / 2, 0.003, { flat: 3, puff: 0.004 });
    // lid gasket line, recessed grip and the hinges at the back
    k.box('vents', 'plastic-grey', w - 0.01, 0.006, d - 0.002, 0, h - lid - 0.002, 0, { r: 0.002 });
    k.box('grip', 'plastic-grey', Math.min(0.32, w * 0.35), 0.022, 0.03, 0, h - lid + 0.012, d / 2 + 0.012, { r: 0.008, overrides: { color: '#c3c5c8' } });
    for (const s of [-1, 1]) k.box('grip', 'plastic-grey', 0.06, 0.04, 0.02, s * (w / 2 - 0.12), h - lid, -d / 2 - 0.006, { r: 0.006, overrides: { color: '#c3c5c8' } });
    // thermostat knob + indicator lights
    k.cyl('knob', 'plastic-grey', 0.022, 0.024, 0.016, -w / 2 + 0.1, base + 0.08, d / 2, { rx: PI / 2, segs: k.seg(18, 8) });
    k.box('display', 'light-cool', 0.03, 0.008, 0.002, -w / 2 + 0.17, base + 0.08, d / 2 + 0.001, { r: 0, overrides: { color: '#b8ffb0' } });
    return finish(k);
  },
});

const retroFridge = mk({
  id: 'fridge-retro', category: 'appliances', ko: '레트로 냉장고', en: 'Retro refrigerator',
  params: [
    P.len('height', '높이', 'Height', 1.52, 0.9, 1.92),
    P.color('color', '색', 'Colour', '#a8d4c6'),
    P.pick('hinge', '경첩', 'Hinge', 'left', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']]),
  ],
  tags: ['retro fridge', 'refrigerator', 'vintage', 'pastel', '레트로 냉장고', '냉장고', '컬러 냉장고'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, h = p.height, d = 0.72, foot = 0.06, doorT = 0.07, hs = p.hinge === 'right' ? -1 : 1;
    const col = { color: p.color };
    k.soft('body', 'paint-white-gloss', w, h - foot, d - doorT + 0.02, 0.05, 0, foot + (h - foot) / 2, -doorT / 2 + 0.01, { flat: 3, overrides: col });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'metal-chrome', 0.018, 0.012, foot + 0.005, sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.12), { segs: k.seg(16, 6) });
    // freezer door on top (small) and fridge door; rounded and puffed like the 1950s shells
    const split = h > 1.2 ? foot + (h - foot) * 0.74 : h + 1;
    const doors = split < h ? [[foot + 0.005, split - 0.004], [split + 0.004, h - 0.005]] : [[foot + 0.005, h - 0.005]];
    const zf = d / 2 - doorT / 2;
    for (const [a, b] of doors) {
      const dh = b - a;
      k.soft('doors', 'paint-white-gloss', w - 0.012, dh, doorT, 0.045, 0, (a + b) / 2, zf, { flat: 3, puff: 0.006, overrides: col });
      // chrome lever handle near the opening side
      const hx = hs * (w / 2 - 0.05), hy = dh > 0.6 ? b - 0.3 : (a + b) / 2;
      const L = Math.min(0.22, dh * 0.45);
      k.bentTube('handles', 'metal-chrome', [[hx, hy - L / 2, d / 2 - 0.002], [hx, hy - L / 2 + 0.01, d / 2 + 0.035], [hx, hy + L / 2 - 0.01, d / 2 + 0.035], [hx, hy + L / 2, d / 2 - 0.002]], 0.011, 0.02);
    }
    // chrome badge
    k.box('badge', 'metal-chrome', 0.12, 0.022, 0.006, 0, foot + 0.12, d / 2 + 0.003, { r: 0.004 });
    // hinges
    for (const [a, b] of doors) for (const y of [a + 0.02, b - 0.02]) k.box('badge', 'metal-chrome', 0.03, 0.03, 0.03, -hs * (w / 2 - 0.02), y, d / 2 - 0.01, { r: 0.006 });
    return finish(k);
  },
});

/* --------------------------------------------------------------- laundry */

const LAUNDRY = [['plastic-white', '화이트', 'White'], ['plastic-grey', '그레이', 'Grey'], ['plastic-black', '블랙', 'Black']];

const washerStack = mk({
  id: 'washer-dryer-stack', category: 'appliances', ko: '세탁기+건조기 직렬 설치', en: 'Stacked washer & dryer',
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.55, 0.7),
    P.len('depth', '깊이', 'Depth', 0.66, 0.55, 0.85),
    P.mat('finish', '색상', 'Finish', 'plastic-white', 'plastic'),
    P.bool('shelf', '보조 선반', 'Pull-out shelf', true),
  ],
  tags: ['washer dryer stack', 'stacked laundry', 'laundry tower', '세탁기 건조기', '직렬 설치', '워시타워', '빨래'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h1 = 0.85, kit = 0.04;
    drumMachine(k, { w, h: h1, d, finish: p.finish, dryer: false });
    k.box('kit', 'plastic-grey', w, kit, d - 0.02, 0, h1 + kit / 2, -0.01, { r: 0.004, overrides: { color: '#c7c9cc' } });
    if (p.shelf) k.box('kit', 'plastic-grey', w - 0.08, 0.012, 0.28, 0, h1 + kit / 2, d / 2 + 0.13, { r: 0.004, overrides: { color: '#c7c9cc' } });
    transformAdded(k, () => drumMachine(k, { w, h: 0.85, d, finish: p.finish, dryer: true }), 0, h1 + kit, 0);
    return finish(k);
  },
});

const topLoader = mk({
  id: 'washing-machine-top-load', category: 'appliances', ko: '통돌이 세탁기', en: 'Top-load washer',
  params: [
    P.len('width', '폭', 'Width', 0.64, 0.55, 0.75),
    P.len('height', '높이', 'Height', 1.0, 0.9, 1.1),
    P.mat('finish', '색상', 'Finish', 'plastic-white', 'plastic'),
  ],
  tags: ['top load washer', 'washing machine', 'top loader', '통돌이', '세탁기', '일반세탁기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.66, foot = 0.02, top = h - 0.02;
    k.soft('body', p.finish, w, top - foot, d, 0.03, 0, foot + (top - foot) / 2, 0, { flat: 3 });
    k.box('feet', 'plastic-black', w - 0.08, foot, d - 0.08, 0, foot / 2, 0, { r: 0.004 });
    // glass lid on the top in a grey frame, drum rim under it
    const lw = w - 0.07, ld = d - 0.2, lz = 0.05;
    k.slab('lid', 'plastic-grey', roundRect(lw, ld, 0.04), 0.02, top, { z: lz, bevel: 0.005, overrides: { color: '#cfd1d4' } });
    k.slab('glass', 'glass-tinted', roundRect(lw - 0.06, ld - 0.06, 0.03), 0.004, top + 0.018, { z: lz, bevel: 0.001 });
    k.cyl('drum', 'plastic-black', Math.min(lw, ld) * 0.42, Math.min(lw, ld) * 0.42, 0.002, 0, top + 0.004, lz, { segs: k.seg(36, 12) });
    k.add('drum', 'metal-steel', new THREE.TorusGeometry(Math.min(lw, ld) * 0.4, 0.008, k.seg(6, 3), k.seg(40, 12)).rotateX(PI / 2).translate(0, top + 0.008, lz));
    k.box('lid', 'plastic-grey', 0.14, 0.012, 0.02, 0, top + 0.012, lz + ld / 2 + 0.012, { r: 0.004, overrides: { color: '#cfd1d4' } });
    // control console along the back edge
    k.soft('panel', p.finish, w - 0.02, 0.06, 0.11, 0.02, 0, top + 0.02, -d / 2 + 0.06, { flat: 2 });
    k.box('display', 'screen-black', w * 0.5, 0.03, 0.004, 0, top + 0.03, -d / 2 + 0.117, { r: 0.004, rx: -0.4 });
    k.lathe('dial', 'metal-chrome', [[0, 0], [0.026, 0], [0.026, 0.006], [0.022, 0.02], [0, 0.022]], w * 0.36, top + 0.03, -d / 2 + 0.115, { rx: PI / 2 - 0.4, segs: k.seg(24, 8) });
    // kick panel with a vent and a chrome badge on the front
    k.box('feet', 'plastic-black', w - 0.06, 0.07, 0.004, 0, foot + 0.045, d / 2 + 0.001, { r: 0.004 });
    for (let i = 0; i < 4; i++) k.box('panel', 'plastic-grey', w * 0.4, 0.005, 0.004, 0, foot + 0.025 + i * 0.012, d / 2 + 0.003, { r: 0 });
    k.box('panel', 'metal-chrome', 0.1, 0.018, 0.004, 0, top - 0.09, d / 2 + 0.001, { r: 0.003 });
    return finish(k);
  },
});

const styler = mk({
  id: 'clothes-care-cabinet', category: 'appliances', ko: '의류관리기', en: 'Clothes care cabinet',
  params: [
    P.pick('door', '도어', 'Door', 'mirror', [['mirror', '미러', 'Mirror'], ['black', '블랙 글라스', 'Black glass'], ['white', '화이트', 'White'], ['beige', '베이지', 'Beige']]),
    P.len('height', '높이', 'Height', 1.85, 1.7, 1.96),
  ],
  tags: ['clothes care', 'steam closet', 'garment steamer', '의류관리기', '스타일러', '에어드레서'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.445, h = p.height, d = 0.585, doorT = 0.03;
    k.box('body', 'paint-white-gloss', w, h - 0.03, d - doorT, 0, 0.03 + (h - 0.03) / 2, -doorT / 2, { r: 0.006, overrides: { color: '#e6e3dd' } });
    k.box('plinth', 'plastic-black', w - 0.02, 0.03, d - doorT - 0.03, 0, 0.015, -doorT / 2 - 0.01, { r: 0.002 });
    const mat = { mirror: 'mirror', black: 'screen-black', white: 'paint-white-gloss', beige: 'paint-white-gloss' }[p.door] ?? 'mirror';
    const ov = p.door === 'beige' ? { overrides: { color: '#d8cbb3' } } : {};
    k.box('door', mat, w - 0.004, h - 0.035, doorT, 0, 0.033 + (h - 0.035) / 2, d / 2 - doorT / 2, { r: 0.004, ...ov });
    // slim vertical edge grip on the right
    k.box('handles', 'metal-aluminium', 0.012, h * 0.45, 0.02, w / 2 - 0.004, h * 0.55, d / 2 - 0.006, { r: 0.003 });
    k.box('display', 'light-cool', 0.05, 0.01, 0.002, 0, h - 0.12, d / 2 + 0.001, { r: 0 });
    return finish(k);
  },
});

/* --------------------------------------------------------------- cooking */

const range = mk({
  id: 'range-cooker', category: 'appliances', ko: '가스레인지 오븐(프리스탠딩)', en: 'Range cooker',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.pick('hob', '상판', 'Hob', 'gas', [['gas', '가스', 'Gas'], ['induction', '인덕션', 'Induction']]),
    P.mat('finish', '마감', 'Finish', 'metal-steel', 'metal'),
    P.mat('trim', '손잡이·노브', 'Handles & knobs', 'metal-chrome', 'metal'),
  ],
  tags: ['range cooker', 'gas range', 'freestanding cooker', 'stove', '가스레인지', '오븐레인지', '레인지 쿠커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.9, d = 0.6, foot = 0.04, zf = d / 2;
    k.box('body', p.finish, w, h - foot - 0.012, d - 0.02, 0, foot + (h - foot - 0.012) / 2, -0.01, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'plastic-black', 0.02, 0.02, foot, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.06), { segs: k.seg(12, 6) });
    k.box('feet', 'plastic-black', w - 0.04, foot - 0.008, 0.01, 0, (foot - 0.008) / 2, zf - 0.04, { r: 0.002 });
    const hobMat = p.hob === 'gas' ? p.finish : 'screen-black';
    k.box('hob', hobMat, w, 0.012, d, 0, h - 0.006, 0, { r: 0.003 });
    k.box('body', p.finish, w, 0.09, 0.02, 0, h + 0.045, -d / 2 + 0.01, { r: 0.003 }); // backguard
    // burners
    const cols = w < 0.75 ? 2 : 3, nOv = w >= 1.05 ? 2 : 1;
    const xs = Array.from({ length: cols }, (_, i) => -w / 2 + (w / cols) * (i + 0.5));
    const zs = [-0.12, 0.13];
    const spots = [];
    for (const x of xs) for (const z of zs) spots.push([x, z, cols === 3 && Math.abs(x) < 0.01 ? null : 0.045]);
    if (cols === 3) { spots.splice(2, 2, [0, 0, 0.065]); }
    if (p.hob === 'gas') {
      for (const [x, z, r0] of spots) {
        const r = r0 ?? 0.05;
        k.cyl('burners', 'metal-black', r, r * 1.05, 0.018, x, h, z, { segs: k.seg(20, 8) });
        k.cyl('burners', 'metal-brass', r * 0.68, r * 0.68, 0.008, x, h + 0.018, z, { segs: k.seg(18, 8) });
      }
      // cast-iron grates, one per column pair
      const gy = h + 0.04, gr = 0.006;
      const sect = cols === 3 ? [[-w / 2 + 0.015, -w / 6], [-w / 6, w / 6], [w / 6, w / 2 - 0.015]] : [[-w / 2 + 0.015, 0], [0, w / 2 - 0.015]];
      for (const [a, b] of sect) {
        const x0 = a + 0.008, x1 = b - 0.008, z0 = -d / 2 + 0.11, z1 = d / 2 - 0.03;
        k.bentTube('grates', 'metal-black', [[x0, gy, z0], [x1, gy, z0], [x1, gy, z1], [x0, gy, z1], [x0, gy, z0]], gr, 0.015, { radial: k.seg(6, 4) });
        const mx = (x0 + x1) / 2;
        k.rod('grates', 'metal-black', [mx, gy, z0], [mx, gy, z1], gr, { segs: k.seg(6, 4) });
        for (const z of [z0 + (z1 - z0) * 0.33, z0 + (z1 - z0) * 0.66]) k.rod('grates', 'metal-black', [x0, gy, z], [x1, gy, z], gr, { segs: k.seg(6, 4) });
        for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) k.cyl('grates', 'metal-black', gr * 1.2, gr * 1.2, gy - h, x, h, z, { segs: 5 });
      }
    } else {
      for (const [x, z, r0] of spots) {
        const r = (r0 ?? 0.05) * 2;
        k.add('burners', 'plastic-grey', new THREE.TorusGeometry(r, 0.0025, 3, k.seg(40, 12)).scale(1, 1, 0.3).rotateX(PI / 2).translate(x, h + 0.0005, z));
      }
    }
    // control strip: one knob per burner + oven knob(s), clock display
    const ky = h - 0.065, nk = spots.length + nOv;
    for (let i = 0; i < nk; i++) {
      const x = -w / 2 + 0.07 + ((w - 0.14) * i) / Math.max(1, nk - 1);
      if (Math.abs(x) < 0.05 && nk % 2 === 1) continue;
      k.lathe('knobs', p.trim, [[0, 0], [0.02, 0], [0.02, 0.008], [0.017, 0.026], [0, 0.028]], x, ky, zf - 0.02, { rx: PI / 2, segs: k.seg(16, 6) });
    }
    k.box('display', 'screen-black', 0.08, 0.03, 0.004, 0, ky, zf - 0.018, { r: 0.003 });
    k.box('display', 'light-warm', 0.04, 0.012, 0.002, 0, ky, zf - 0.0155, { r: 0, overrides: { color: '#9fd0ff' } });
    // oven door(s) with window and a storage drawer below
    const dy0 = foot + 0.16, dy1 = h - 0.12;
    const ow = (w - 0.004) / nOv;
    for (let i = 0; i < nOv; i++) {
      const cx = -w / 2 + ow * (i + 0.5) + 0.002;
      k.box('door', p.finish, ow - 0.004, dy1 - dy0, 0.03, cx, (dy0 + dy1) / 2, zf - 0.005, { r: 0.004, segs: 2 });
      k.box('glass', 'glass-tinted', ow - 0.12, (dy1 - dy0) * 0.55, 0.004, cx, (dy0 + dy1) / 2 - 0.02, zf + 0.013, { r: 0 });
      k.box('liner', 'plastic-black', ow - 0.12, (dy1 - dy0) * 0.55, 0.002, cx, (dy0 + dy1) / 2 - 0.02, zf + 0.0105, { r: 0 });
      hBar(k, p.trim, cx - ow * 0.38, cx + ow * 0.38, dy1 - 0.04, zf + 0.01, 0.035, 0.008);
      k.box('door', p.finish, ow - 0.004, 0.13, 0.025, cx, foot + 0.075, zf - 0.008, { r: 0.004, segs: 2 });
      hBar(k, p.trim, cx - ow * 0.2, cx + ow * 0.2, foot + 0.1, zf + 0.004, 0.028, 0.007);
    }
    return finish(k);
  },
});

const steamOven = mk({
  id: 'steam-oven-compact', category: 'appliances', ko: '빌트인 스팀오븐(컴팩트)', en: 'Compact steam oven',
  params: [
    P.mat('trim', '테두리·손잡이', 'Trim & handle', 'metal-steel', 'metal'),
    P.bool('warmer', '워밍 서랍', 'Warming drawer', false),
  ],
  tags: ['steam oven', 'compact oven', 'combi oven', 'built-in', '스팀오븐', '컴팩트 오븐', '빌트인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.595, h = 0.455, d = 0.55;
    const y0 = p.warmer ? 0.14 : 0;
    k.box('body', 'metal-black', w - 0.02, h - 0.02, d - 0.03, 0, y0 + h / 2, -0.015, { r: 0.003 });
    const zf = d / 2;
    k.panel('trim', p.trim, frameShape(w, h, 0.012, 0.012), 0.02, 0, y0 + h / 2, zf - 0.01, { bevel: 0.002 });
    k.box('door', 'screen-black', w - 0.026, h - 0.026, 0.02, 0, y0 + h / 2, zf - 0.01, { r: 0.002 });
    k.box('glass', 'glass-tinted', w - 0.12, h - 0.18, 0.003, 0, y0 + (h - 0.07) / 2, zf + 0.0015, { r: 0 });
    k.box('display', 'light-warm', 0.18, 0.02, 0.002, 0, y0 + h - 0.04, zf + 0.001, { r: 0, overrides: { color: '#ffd8a0' } });
    dots(k, 'trim', p.trim, -w * 0.38, -w * 0.25, y0 + h - 0.04, zf, 2, 0.008);
    dots(k, 'trim', p.trim, w * 0.25, w * 0.38, y0 + h - 0.04, zf, 2, 0.008);
    hBar(k, p.trim, -w * 0.4, w * 0.4, y0 + h - 0.085, zf, 0.04, 0.008);
    if (p.warmer) {
      k.box('body', 'metal-black', w - 0.02, 0.135, d - 0.03, 0, 0.0675, -0.015, { r: 0.003 });
      k.box('door', 'screen-black', w - 0.004, 0.134, 0.02, 0, 0.067, zf - 0.01, { r: 0.002 });
      k.box('trim', p.trim, w * 0.5, 0.012, 0.004, 0, 0.12, zf + 0.002, { r: 0.002 });
    }
    return finish(k);
  },
});

/* -------------------------------------------------- cleaning, air, heat */

const robotVac = mk({
  id: 'robot-vacuum', category: 'appliances', ko: '로봇청소기', en: 'Robot vacuum',
  params: [
    P.pick('dock', '스테이션', 'Dock', 'station', [['none', '없음', 'None'], ['charge', '충전대', 'Charging dock'], ['station', '자동 먼지비움', 'Auto-empty station']]),
    P.mat('color', '색상', 'Colour', 'plastic-white', 'plastic'),
  ],
  tags: ['robot vacuum', 'robot cleaner', 'roomba', '로봇청소기', '청소기', '물걸레'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.175, rz = p.dock === 'station' ? 0.33 : p.dock === 'charge' ? 0.22 : 0;
    k.lathe('body', p.color, [[0, 0.012], [R - 0.012, 0.012], [R, 0.025], [R, 0.072], [R - 0.012, 0.088], [0, 0.088]], 0, 0, rz, { segs: k.seg(40, 12) });
    k.cyl('top', 'screen-black', R - 0.025, R - 0.02, 0.003, 0, 0.087, rz, { segs: k.seg(36, 12) });
    k.cyl('top', 'plastic-black', 0.042, 0.042, 0.025, 0, 0.09, rz - 0.07, { segs: k.seg(20, 8) }); // lidar turret
    k.cyl('trim', 'plastic-grey', R + 0.002, R + 0.002, 0.03, 0, 0.035, rz, { segs: k.seg(40, 12), open: true, thetaLength: PI }); // bumper band
    k.cyl('trim', 'plastic-black', R * 0.9, R * 0.9, 0.012, 0, 0.0, rz, { segs: k.seg(24, 8) }); // wheels / brush block
    for (let i = 0; i < 3; i++) {
      const a = i * (2 * PI / 3);
      const cx = -0.11, cz = rz + 0.11;
      k.rod('trim', 'plastic-grey', [cx, 0.006, cz], [cx + Math.cos(a) * 0.07, 0.003, cz + Math.sin(a) * 0.07], 0.002, { segs: 4 });
    }
    k.box('display', 'light-cool', 0.02, 0.002, 0.006, 0, 0.0895, rz + 0.08, { r: 0 });
    if (p.dock === 'station') {
      k.box('dock', p.color, 0.33, 0.016, 0.16, 0, 0.008, 0.06, { r: 0.006 });
      k.soft('dock', p.color, 0.32, 0.44, 0.22, 0.04, 0, 0.22, -0.11, { flat: 3 });
      k.box('top', 'plastic-black', 0.24, 0.008, 0.14, 0, 0.441, -0.11, { r: 0.004 });
      k.box('trim', 'plastic-grey', 0.1, 0.06, 0.006, 0, 0.06, 0.003, { r: 0.006 });
    } else if (p.dock === 'charge') {
      k.soft('dock', p.color, 0.18, 0.1, 0.08, 0.02, 0, 0.05, 0.0, { flat: 2 });
      k.box('trim', 'metal-steel', 0.06, 0.01, 0.006, 0, 0.02, 0.041, { r: 0.002 });
    }
    return finish(k);
  },
});

const stickVac = mk({
  id: 'stick-vacuum-stand', category: 'appliances', ko: '무선청소기(거치대)', en: 'Cordless stick vacuum on stand',
  params: [
    P.mat('color', '본체 색', 'Body colour', 'plastic-grey', 'plastic'),
    P.mat('accent', '포인트', 'Accent', 'metal-copper', 'metal'),
  ],
  tags: ['stick vacuum', 'cordless vacuum', 'vacuum cleaner', '무선청소기', '청소기', '청소기 거치대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // stand: base plate + back column with a charging holder at the top
    k.slab('stand', 'plastic-white', roundRect(0.3, 0.32, 0.05), 0.016, 0, { bevel: 0.004 });
    k.box('stand', 'plastic-white', 0.06, 1.05, 0.03, 0, 0.016 + 0.525, -0.13, { r: 0.008, segs: 2 });
    k.box('stand', 'plastic-white', 0.1, 0.06, 0.1, 0, 1.0, -0.08, { r: 0.01, segs: 2 });
    // floor head resting on the plate
    k.soft('head', 'plastic-black', 0.25, 0.05, 0.1, 0.02, 0, 0.016 + 0.025, 0.06, { flat: 2 });
    k.cyl('head', p.accent, 0.022, 0.022, 0.05, 0, 0.04, 0.0, { segs: k.seg(14, 6), rx: -0.3 });
    // wand up to the motor + bin hanging on the holder
    k.rod('wand', p.accent, [0, 0.06, 0.0], [0, 0.75, -0.04], 0.016, { segs: k.seg(14, 6) });
    k.cyl('body', p.color, 0.05, 0.05, 0.18, 0, 0.75, -0.04, { segs: k.seg(20, 8), rx: -0.25 });
    k.cyl('bin', 'glass-frosted', 0.045, 0.045, 0.16, 0, 0.72, 0.03, { segs: k.seg(20, 8), rx: 0.4 });
    k.cyl('body', p.color, 0.035, 0.03, 0.08, 0, 0.92, -0.07, { segs: k.seg(16, 6), rx: -0.25 });
    k.bentTube('wand', p.accent, [[0, 0.98, -0.07], [0, 1.0, 0.0], [0, 0.88, 0.04]], 0.014, 0.03);
    k.box('display', 'light-cool', 0.02, 0.006, 0.002, 0, 0.84, 0.012, { r: 0 });
    return finish(k);
  },
});

const purifierTower = mk({
  id: 'air-purifier-tower', category: 'appliances', ko: '공기청정기(원통형)', en: 'Air purifier (tower)',
  params: [
    P.len('height', '높이', 'Height', 0.72, 0.45, 1.05),
    P.mat('filter', '필터 커버', 'Filter cover', 'fabric-linen-grey', 'fabric'),
  ],
  tags: ['air purifier', 'air cleaner', 'hepa', '공기청정기', '원통형 공기청정기', '360도'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.15, h = p.height, band0 = 0.05, band1 = h * 0.7;
    k.cyl('body', 'plastic-white', r, r, band0, 0, 0, 0, { segs: k.seg(40, 12) });
    k.cyl('filter', p.filter, r - 0.003, r - 0.003, band1 - band0, 0, band0, 0, { segs: k.seg(40, 12) });
    k.lathe('body', 'plastic-white', [[r, band1], [r, h - 0.02], [r - 0.012, h], [0, h]], 0, 0, 0, { segs: k.seg(40, 12) });
    k.cyl('grille', 'plastic-grey', r - 0.03, r - 0.03, 0.004, 0, h, 0, { segs: k.seg(36, 12) });
    for (const rr of [0.04, 0.07, 0.1]) k.add('grille', 'plastic-black', new THREE.TorusGeometry(rr, 0.004, 3, k.seg(36, 12)).scale(1, 1, 0.4).rotateX(PI / 2).translate(0, h + 0.004, 0));
    k.add('display', 'light-cool', new THREE.TorusGeometry(r - 0.02, 0.003, 3, k.seg(40, 12)).rotateX(PI / 2).translate(0, h + 0.001, 0), { overrides: { color: '#a8d8ff' } });
    k.box('top', 'screen-black', 0.05, 0.003, 0.03, 0, h + 0.0005, r - 0.045, { r: 0 });
    return finish(k);
  },
});

const purifierBox = mk({
  id: 'air-purifier-box', category: 'appliances', ko: '공기청정기(사각형)', en: 'Air purifier (box)',
  params: [
    P.len('height', '높이', 'Height', 0.62, 0.45, 0.9),
    P.mat('panel', '패널', 'Panels', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['air purifier', 'air cleaner', 'hepa', '공기청정기', '사각 공기청정기', '거실 가전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.34, d = 0.3, h = p.height;
    k.soft('body', 'plastic-white', w, h, d, 0.03, 0, h / 2, 0, { flat: 3 });
    // fabric front & side panels inset in the shell
    k.soft('panels', p.panel, w - 0.05, h - 0.13, 0.012, 0.005, 0, (h - 0.13) / 2 + 0.03, d / 2 + 0.002, { flat: 3 });
    for (const s of [-1, 1]) k.soft('panels', p.panel, 0.012, h - 0.13, d - 0.06, 0.005, s * (w / 2 + 0.002), (h - 0.13) / 2 + 0.03, 0, { flat: 3 });
    // top outlet slots and the touch display
    for (let i = 0; i < 8; i++) k.box('grille', 'plastic-black', w - 0.08, 0.002, 0.008, 0, h + 0.0005, -d / 2 + 0.06 + i * 0.022, { r: 0 });
    k.box('display', 'light-cool', 0.06, 0.002, 0.012, 0, h + 0.0005, d / 2 - 0.04, { r: 0 });
    return finish(k);
  },
});

const dehumidifier = mk({
  id: 'dehumidifier', category: 'appliances', ko: '제습기', en: 'Dehumidifier',
  params: [P.mat('color', '색상', 'Colour', 'plastic-white', 'plastic')],
  tags: ['dehumidifier', 'humidity', '제습기', '습기 제거', '장마'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.37, h = 0.6, d = 0.28;
    k.soft('body', p.color, w, h - 0.02, d, 0.035, 0, 0.02 + (h - 0.02) / 2, 0, { flat: 3 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'plastic-black', 0.018, 0.018, 0.022, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), { segs: k.seg(12, 6) });
    // water tank: lower front drawer with a level window
    k.box('tank', 'plastic-grey', w - 0.03, h * 0.38, 0.012, 0, 0.03 + h * 0.19, d / 2 + 0.002, { r: 0.008, overrides: { color: '#d7d9dc' } });
    k.box('glass', 'glass-frosted', 0.03, h * 0.22, 0.004, w * 0.3, 0.03 + h * 0.19, d / 2 + 0.009, { r: 0.002 });
    k.box('tank', 'plastic-grey', 0.12, 0.02, 0.018, 0, 0.03 + h * 0.36, d / 2 + 0.004, { r: 0.006, overrides: { color: '#d7d9dc' } });
    // top: louvred outlet + panel, carrying handle at the back
    for (let i = 0; i < 7; i++) k.box('grille', 'plastic-black', w - 0.1, 0.003, 0.008, 0, h + 0.0005, -d / 2 + 0.06 + i * 0.022, { r: 0 });
    k.box('display', 'screen-black', 0.1, 0.004, 0.05, 0, h + 0.001, d / 2 - 0.055, { r: 0.002 });
    k.box('display', 'light-cool', 0.04, 0.002, 0.012, 0, h + 0.003, d / 2 - 0.055, { r: 0 });
    k.bentTube('feet', 'plastic-black', [[-0.1, h - 0.005, -d / 2 + 0.02], [-0.1, h + 0.03, -d / 2 + 0.02], [0.1, h + 0.03, -d / 2 + 0.02], [0.1, h - 0.005, -d / 2 + 0.02]], 0.008, 0.015);
    return finish(k);
  },
});

const humidifier = mk({
  id: 'humidifier', category: 'appliances', ko: '가습기', en: 'Humidifier', placement: 'surface',
  params: [P.mat('color', '본체', 'Base', 'plastic-white', 'plastic')],
  tags: ['humidifier', 'ultrasonic humidifier', 'mist', '가습기', '초음파 가습기', '겨울 가전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('body', p.color, [[0, 0], [0.11, 0], [0.12, 0.01], [0.12, 0.07], [0.105, 0.085], [0, 0.085]], 0, 0, 0, { segs: k.seg(36, 10) });
    // clear tank with water, mist cap on top
    k.lathe('glass', 'glass-frosted', [[0.1, 0.085], [0.108, 0.13], [0.1, 0.24], [0.07, 0.29], [0.04, 0.3], [0, 0.3]], 0, 0, 0, { segs: k.seg(36, 10), smooth: 10 });
    k.cyl('water', 'water', 0.095, 0.095, 0.11, 0, 0.088, 0, { segs: k.seg(28, 8) });
    k.cyl('body', p.color, 0.04, 0.045, 0.04, 0, 0.295, 0, { segs: k.seg(24, 8) });
    k.cyl('nozzle', 'plastic-grey', 0.016, 0.016, 0.005, 0, 0.335, 0, { segs: k.seg(16, 6) });
    k.cyl('knob', 'metal-chrome', 0.018, 0.02, 0.012, 0, 0.04, 0.118, { rx: PI / 2, segs: k.seg(16, 6) });
    k.box('display', 'light-cool', 0.025, 0.006, 0.002, 0.06, 0.04, 0.104, { r: 0, ry: 0.55 });
    return finish(k);
  },
});

const oilHeater = mk({
  id: 'oil-heater', category: 'appliances', ko: '라디에이터(오일 히터)', en: 'Oil-filled radiator',
  params: [
    P.int('fins', '핀 수', 'Fins', 11, 7, 15),
    P.mat('finish', '마감', 'Finish', 'metal-white', 'metal'),
  ],
  tags: ['oil heater', 'radiator', 'electric heater', '라디에이터', '오일히터', '난방기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.fins, pitch = 0.05, fh = 0.56, fd = 0.2, y0 = 0.1;
    const span = (n - 1) * pitch;
    const fin = roundRect(fd, fh, 0.06);
    for (let i = 0; i < n; i++) k.panel('fins', p.finish, fin, 0.028, -span / 2 + i * pitch, y0 + fh / 2, 0, { ry: PI / 2, bevel: 0.006, curveSegs: 10 });
    // tie rods and the control box on the right end
    for (const y of [y0 + 0.05, y0 + fh - 0.05]) k.rod('rods', 'metal-steel', [-span / 2 - 0.02, y, 0], [span / 2 + 0.02, y, 0], 0.012, { segs: k.seg(10, 5) });
    k.soft('control', 'plastic-white', 0.1, 0.22, 0.14, 0.02, span / 2 + 0.064, y0 + fh - 0.13, 0, { flat: 2 });
    for (const [y, r] of [[y0 + fh - 0.08, 0.02], [y0 + fh - 0.16, 0.016]]) k.cyl('knobs', 'plastic-grey', r, r, 0.012, span / 2 + 0.07, y, 0.07, { rx: PI / 2, segs: k.seg(16, 6) });
    k.box('display', 'light-warm', 0.012, 0.012, 0.002, span / 2 + 0.07, y0 + fh - 0.21, 0.071, { r: 0, overrides: { color: '#ff8a5c' } });
    // castor bars
    for (const x of [-span / 2 + pitch, span / 2 - pitch]) {
      k.box('base', 'plastic-black', 0.03, 0.03, 0.3, x, 0.065, 0, { r: 0.006 });
      k.rod('base', 'metal-steel', [x, 0.08, 0], [x, y0 + 0.01, 0], 0.006, { segs: 5 });
      for (const z of [-0.13, 0.13]) k.cyl('base', 'plastic-black', 0.025, 0.025, 0.02, x - 0.01, 0.025, z, { rz: PI / 2, segs: k.seg(14, 6) });
    }
    return finish(k);
  },
});

const floorFan = mk({
  id: 'fan-stand', category: 'appliances', ko: '스탠드 선풍기', en: 'Stand fan',
  params: [
    P.len('height', '높이', 'Height', 1.15, 0.8, 1.35),
    P.mat('color', '색상', 'Colour', 'plastic-white', 'plastic'),
  ],
  tags: ['fan', 'stand fan', 'electric fan', 'pedestal fan', '선풍기', '스탠드 선풍기', '여름 가전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height - 0.2, R = 0.2, cz = 0.04;
    k.lathe('base', p.color, [[0, 0], [0.17, 0], [0.175, 0.012], [0.15, 0.04], [0.04, 0.06], [0, 0.06]], 0, 0, 0, { segs: k.seg(36, 10), smooth: 8 });
    k.cyl('pole', 'metal-chrome', 0.012, 0.012, H - 0.15, 0, 0.05, 0, { segs: k.seg(12, 5) });
    k.cyl('base', p.color, 0.02, 0.022, 0.12, 0, H - 0.17, 0, { segs: k.seg(14, 6) });
    // motor housing behind the blades
    k.sphere('base', p.color, 0.07, 0, H, cz - 0.16, { scale: [1, 1, 1.4], segs: k.seg(20, 8), rings: k.seg(12, 5) });
    k.box('display', 'light-cool', 0.012, 0.004, 0.012, 0, H + 0.07, cz - 0.17, { r: 0 });
    // 5 blades + spinner
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      k.sphere('blades', 'glass-frosted', 1, Math.cos(a) * 0.095, H + Math.sin(a) * 0.095, cz - 0.03, { scale: [0.09, 0.055, 0.008], segs: k.seg(14, 6), rings: k.seg(8, 4), rz: a, ry: 0 });
    }
    k.cyl('blades', 'plastic-grey', 0.035, 0.035, 0.03, 0, H, cz - 0.05, { rx: PI / 2, segs: k.seg(16, 6) });
    // wire cage: two rings + spokes front and back
    const ring = (z) => k.add('cage', 'metal-white', new THREE.TorusGeometry(R, 0.004, 4, k.seg(48, 14)).translate(0, H, z));
    ring(cz); ring(cz - 0.06);
    k.add('cage', p.color, new THREE.TorusGeometry(R + 0.004, 0.01, 6, k.seg(48, 14)).scale(1, 1, 2).translate(0, H, cz - 0.03));
    const ns = k.hi ? 16 : 8;
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.tube('cage', 'metal-white', [[0, H, cz + 0.035], [c * R * 0.5, H + s * R * 0.5, cz + 0.025], [c * R, H + s * R, cz]], 0.0018, { segs: 6, radial: 3 });
      k.tube('cage', 'metal-white', [[0, H, cz - 0.11], [c * R * 0.5, H + s * R * 0.5, cz - 0.09], [c * R, H + s * R, cz - 0.06]], 0.0018, { segs: 6, radial: 3 });
    }
    k.cyl('cage', p.color, 0.03, 0.03, 0.006, 0, H, cz + 0.033, { rx: PI / 2, segs: k.seg(16, 6) });
    return finish(k);
  },
});

const towerFan = mk({
  id: 'fan-tower', category: 'appliances', ko: '타워팬', en: 'Tower fan',
  params: [
    P.len('height', '높이', 'Height', 1.05, 0.75, 1.2),
    P.mat('color', '색상', 'Colour', 'plastic-white', 'plastic'),
  ],
  tags: ['tower fan', 'fan', 'bladeless', '타워팬', '선풍기', '슬림 선풍기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, bh = h - 0.06;
    k.lathe('base', 'plastic-grey', [[0, 0], [0.17, 0], [0.172, 0.01], [0.15, 0.03], [0, 0.035]], 0, 0, 0, { segs: k.seg(36, 10), scale: [1, 1, 0.85], overrides: { color: '#c9cbce' } });
    k.cyl('base', 'plastic-grey', 0.08, 0.09, 0.03, 0, 0.03, 0, { segs: k.seg(24, 8), overrides: { color: '#c9cbce' } });
    k.slab('body', p.color, superEllipse(0.2, 0.18, 2.4, k.hi ? 48 : 20), bh - 0.02, 0.06, { bevel: 0.015 });
    // front outlet grille and the top control pad
    k.box('grille', 'plastic-black', 0.07, bh * 0.72, 0.012, 0, 0.06 + bh * 0.46, 0.085, { r: 0.004 });
    for (let i = 0; i < 14; i++) k.box('grille', 'plastic-grey', 0.072, 0.004, 0.004, 0, 0.06 + bh * 0.12 + i * bh * 0.05, 0.092, { r: 0 });
    k.box('display', 'screen-black', 0.1, 0.003, 0.07, 0, h - 0.019, 0, { r: 0.002 });
    k.box('display', 'light-cool', 0.04, 0.002, 0.012, 0, h - 0.017, 0.02, { r: 0 });
    return finish(k);
  },
});

const cassette = mk({
  id: 'air-conditioner-cassette', category: 'appliances', ko: '천장형 시스템 에어컨', en: 'Ceiling cassette air conditioner', placement: 'ceiling', elevation: 2.4 - 0.04,
  params: [P.len('width', '패널 크기', 'Panel size', 0.95, 0.6, 1.0)],
  tags: ['ceiling cassette', 'system air conditioner', 'ceiling ac', '시스템 에어컨', '천장형 에어컨', '4way'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, t = 0.03;
    k.slab('panel', 'plastic-white', roundRect(w, w, 0.03), t, 0.008, { bevel: 0.006 });
    // centre intake grille (slots), four outlet slots with louvres around it
    const g = w * 0.52;
    k.slab('grille', 'plastic-grey', roundRect(g, g, 0.01), 0.004, 0.005, { bevel: 0.001, overrides: { color: '#d3d5d8' } });
    const n = k.hi ? 14 : 7;
    for (let i = 0; i < n; i++) k.box('slots', 'plastic-black', g - 0.04, 0.002, 0.004, 0, 0.004, -g / 2 + 0.02 + ((g - 0.04) * i) / (n - 1), { r: 0 });
    const off = g / 2 + (w / 2 - g / 2) / 2, sl = g + 0.02;
    for (let i = 0; i < 4; i++) {
      const ry = (i * PI) / 2, c = Math.cos(ry), s = Math.sin(ry);
      k.box('slots', 'plastic-black', sl, 0.004, 0.06, s * off, 0.006, c * off, { r: 0.002, ry });
      k.box('panel', 'plastic-white', sl - 0.01, 0.004, 0.05, s * (off + 0.005), 0.0, c * (off + 0.005), { r: 0.0015, ry });
    }
    k.box('display', 'light-cool', 0.03, 0.002, 0.008, w / 2 - 0.08, 0.005, w / 2 - 0.06, { r: 0 });
    return finish(k);
  },
});

/* -------------------------------------------------------- audio & video */

const SPEAKER_WOOD = 'wood-walnut';

/** Box speaker: cabinet + baffle with drivers (or a fabric grille). Bottom at y0, centred at x. */
function speakerBox(k, x, y0, w, h, d, { wood, grille, woofers = 1, wr = 0.07 }) {
  k.box('cabinet', wood, w, h, d, x, y0 + h / 2, 0, { r: 0.008, segs: 2 });
  const zf = d / 2;
  k.box('baffle', 'paint-black-matte', w - 0.01, h - 0.01, 0.008, x, y0 + h / 2, zf + 0.002, { r: 0.004 });
  if (grille) {
    k.soft('grille', 'fabric-wool-charcoal', w - 0.012, h - 0.012, 0.012, 0.004, x, y0 + h / 2, zf + 0.012, { flat: 2 });
    return;
  }
  const zb = zf + 0.006;
  driver(k, x, y0 + h - 0.06, zb, 0.022);
  for (let i = 0; i < woofers; i++) driver(k, x, y0 + h - 0.1 - wr - i * (2 * wr + 0.03), zb, wr);
  k.cyl('cone', 'plastic-black', 0.018, 0.018, 0.004, x, y0 + 0.045, zb - 0.002, { rx: PI / 2, segs: k.seg(16, 6) });
}

const bookshelfSpeakers = mk({
  id: 'speakers-bookshelf', category: 'appliances', ko: '북쉘프 스피커(한 쌍)', en: 'Bookshelf speakers (pair)', placement: 'surface',
  params: [
    P.len('spacing', '간격', 'Spacing', 0.6, 0.25, 1.4),
    P.mat('wood', '캐비닛', 'Cabinet', SPEAKER_WOOD, 'wood'),
    P.bool('grille', '그릴', 'Grille cover', false),
  ],
  tags: ['speakers', 'bookshelf speaker', 'hifi', 'stereo', '스피커', '북쉘프 스피커', '오디오'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const s of [-1, 1]) speakerBox(k, s * p.spacing / 2, 0, 0.18, 0.3, 0.24, { wood: p.wood, grille: p.grille, wr: 0.065 });
    return finish(k);
  },
});

const floorSpeaker = mk({
  id: 'speaker-floorstanding', category: 'appliances', ko: '톨보이 스피커', en: 'Floor-standing speaker',
  params: [
    P.len('height', '높이', 'Height', 1.0, 0.8, 1.2),
    P.mat('wood', '캐비닛', 'Cabinet', SPEAKER_WOOD, 'wood'),
    P.bool('grille', '그릴', 'Grille cover', false),
  ],
  tags: ['floor speaker', 'tower speaker', 'tallboy', 'hifi', '톨보이 스피커', '스피커', '오디오'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.22, d = 0.32, plinth = 0.035;
    k.box('plinth', 'metal-black', w + 0.08, 0.02, d + 0.06, 0, plinth - 0.01, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('plinth', 'metal-black', 0.008, 0.002, plinth - 0.02, sx * (w / 2 + 0.02), 0, sz * (d / 2 + 0.01), { segs: 8 });
    speakerBox(k, 0, plinth, w, p.height - plinth, d, { wood: p.wood, grille: p.grille, woofers: 3, wr: 0.07 });
    return finish(k);
  },
});

const soundbar = mk({
  id: 'soundbar', category: 'appliances', ko: '사운드바', en: 'Soundbar', placement: 'surface',
  params: [
    P.len('width', '폭', 'Width', 0.95, 0.55, 1.3),
    P.mat('cover', '그릴', 'Grille', 'fabric-wool-charcoal', 'fabric'),
  ],
  tags: ['soundbar', 'tv speaker', 'home theater', '사운드바', 'TV 스피커', '홈시어터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.065, d = 0.11;
    k.soft('body', 'plastic-black', w, h, d, 0.025, 0, 0.004 + h / 2, 0, { flat: 4 });
    k.soft('grille', p.cover, w - 0.03, h - 0.012, 0.03, 0.01, 0, 0.004 + h / 2, d / 2 - 0.01, { flat: 4 });
    for (const s of [-1, 1]) k.box('feet', 'rubber-black', 0.08, 0.004, 0.06, s * (w / 2 - 0.12), 0.002, 0, { r: 0.001 });
    k.box('display', 'light-cool', 0.04, 0.005, 0.002, 0, 0.012, d / 2 + 0.005, { r: 0 });
    k.box('top', 'plastic-grey', 0.14, 0.002, 0.03, 0, h + 0.004, -0.01, { r: 0.0008 });
    return finish(k);
  },
});

const subwoofer = mk({
  id: 'subwoofer', category: 'appliances', ko: '서브우퍼', en: 'Subwoofer',
  params: [
    P.len('size', '크기', 'Size', 0.38, 0.28, 0.5),
    P.mat('finish', '마감', 'Finish', 'paint-black-matte', 'paint'),
  ],
  tags: ['subwoofer', 'woofer', 'bass', 'home theater', '서브우퍼', '우퍼', '홈시어터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, foot = 0.02;
    k.box('cabinet', p.finish, s, s, s, 0, foot + s / 2, 0, { r: 0.015, segs: 3 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.022, 0.025, foot, sx * (s / 2 - 0.05), 0, sz * (s / 2 - 0.05), { segs: k.seg(14, 6) });
    driver(k, 0, foot + s * 0.52, s / 2, s * 0.36, { trim: 'metal-black', cone: 'plastic-black' });
    k.box('cone', 'plastic-black', s * 0.5, 0.025, 0.005, 0, foot + 0.04, s / 2, { r: 0.01 }); // bass port slot
    k.box('display', 'light-cool', 0.008, 0.008, 0.002, s / 2 - 0.03, foot + s - 0.03, s / 2 + 0.001, { r: 0 });
    return finish(k);
  },
});

const receiver = mk({
  id: 'av-receiver', category: 'appliances', ko: 'AV 리시버(앰프)', en: 'AV receiver', placement: 'surface',
  params: [P.mat('front', '전면 패널', 'Front panel', 'metal-black', 'metal')],
  tags: ['av receiver', 'amplifier', 'amp', 'hifi', 'AV 리시버', '앰프', '오디오'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.435, h = 0.16, d = 0.38, foot = 0.015;
    k.box('body', 'metal-black', w - 0.004, h, d - 0.01, 0, foot + h / 2, -0.005, { r: 0.004 });
    k.box('front', p.front, w, h + 0.004, 0.012, 0, foot + h / 2, d / 2 - 0.006, { r: 0.004, segs: 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'plastic-black', 0.022, 0.025, foot, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), { segs: k.seg(14, 6) });
    // top vents
    for (let i = 0; i < 9; i++) k.box('vents', 'plastic-black', 0.2, 0.002, 0.008, 0, foot + h + 0.0005, -d / 2 + 0.05 + i * 0.022, { r: 0 });
    const zf = d / 2;
    // display window, big volume knob, input selector, buttons
    k.box('display', 'screen-black', 0.2, 0.045, 0.003, -0.02, foot + h * 0.62, zf + 0.0015, { r: 0.003 });
    k.box('display', 'light-cool', 0.13, 0.012, 0.001, -0.02, foot + h * 0.64, zf + 0.0032, { r: 0 });
    k.lathe('knobs', 'metal-aluminium', [[0, 0], [0.035, 0], [0.035, 0.022], [0.032, 0.026], [0, 0.026]], w / 2 - 0.08, foot + h * 0.55, zf, { rx: PI / 2, segs: k.seg(32, 10) });
    k.lathe('knobs', 'metal-aluminium', [[0, 0], [0.02, 0], [0.02, 0.016], [0, 0.017]], -w / 2 + 0.06, foot + h * 0.55, zf, { rx: PI / 2, segs: k.seg(24, 8) });
    dots(k, 'knobs', 'metal-aluminium', -0.11, 0.07, foot + 0.035, zf, 7, 0.005);
    k.cyl('knobs', 'plastic-black', 0.005, 0.005, 0.003, -w / 2 + 0.06, foot + 0.035, zf, { rx: PI / 2, segs: 8 }); // headphone jack
    return finish(k);
  },
});

const consoleItem = mk({
  id: 'game-console', category: 'appliances', ko: '게임 콘솔+컨트롤러', en: 'Game console & controller', placement: 'surface',
  params: [
    P.pick('stand', '설치', 'Orientation', 'vertical', [['vertical', '세로', 'Vertical'], ['horizontal', '가로', 'Horizontal']]),
    P.mat('shell', '외장', 'Shell', 'plastic-white', 'plastic'),
  ],
  tags: ['game console', 'video game', 'controller', 'gamepad', '게임기', '콘솔', '게임패드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 0.39, D = 0.26, flat = p.stand === 'horizontal';
    const m = flat
      ? new THREE.Matrix4().makeTranslation(0.0, 0.054, -0.02).multiply(new THREE.Matrix4().makeRotationZ(PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, -H / 2, 0))
      : new THREE.Matrix4().makeTranslation(-0.12, 0.015, 0);
    withMatrix(k, () => {
      // built standing: black core between two curved shells, light strip in the gap
      k.box('core', 'plastic-black', 0.06, H - 0.01, D - 0.02, 0, H / 2, 0, { r: 0.006, segs: 2 });
      for (const sd of [-1, 1]) k.soft('shell', p.shell, 0.022, H, D, 0.01, sd * 0.042, H / 2, 0, { flat: 3, puff: 0.004 });
      k.box('display', 'light-cool', 0.003, H * 0.8, 0.003, 0.0305, H * 0.5, D / 2 - 0.012, { r: 0 });
    }, m);
    if (!flat) k.slab('core', 'plastic-black', ellipse(0.12, 0.14), 0.015, 0, { x: -0.12, bevel: 0.003 });
    // controller lying in front
    const cx = flat ? 0 : 0.12, cz = flat ? D / 2 + 0.06 : 0.06;
    k.soft('pad', 'plastic-white', 0.15, 0.03, 0.07, 0.014, cx, 0.03, cz, { flat: 2, puff: 0.004 });
    for (const s of [-1, 1]) k.sphere('pad', 'plastic-white', 1, cx + s * 0.06, 0.022, cz + 0.035, { scale: [0.026, 0.02, 0.045], segs: k.seg(14, 6), rings: k.seg(8, 4) });
    for (const s of [-1, 1]) k.cyl('sticks', 'plastic-black', 0.011, 0.009, 0.014, cx + s * 0.028, 0.042, cz + 0.012, { segs: k.seg(12, 6) });
    k.box('sticks', 'plastic-black', 0.05, 0.002, 0.03, cx, 0.0455, cz - 0.01, { r: 0.001 });
    return finish(k);
  },
});

const projector = mk({
  id: 'projector-ceiling', category: 'appliances', ko: '빔프로젝터(천장형)', en: 'Ceiling projector', placement: 'ceiling', elevation: 2.4 - 0.32,
  params: [
    P.len('drop', '거치대 길이', 'Drop', 0.18, 0.05, 0.6),
    P.mat('color', '본체', 'Body', 'plastic-white', 'plastic'),
  ],
  tags: ['projector', 'beam projector', 'home cinema', '빔프로젝터', '프로젝터', '홈시네마'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const bh = 0.12, top = bh + 0.02 + p.drop;
    k.soft('body', p.color, 0.33, bh, 0.28, 0.025, 0, bh / 2, 0, { flat: 3 });
    // lens on the front, vents
    k.cyl('lens', 'plastic-black', 0.045, 0.048, 0.025, 0.08, bh / 2, 0.14, { rx: PI / 2, segs: k.seg(24, 8) });
    k.cyl('glass', 'glass-tinted', 0.032, 0.032, 0.004, 0.08, bh / 2, 0.163, { rx: PI / 2, segs: k.seg(20, 8) });
    for (let i = 0; i < 6; i++) k.box('lens', 'plastic-black', 0.004, bh * 0.5, 0.004, -0.13 + i * 0.016, bh / 2, 0.141, { r: 0 });
    // ceiling mount: bracket, pole, ceiling plate
    k.box('mount', 'metal-black', 0.16, 0.012, 0.16, 0, bh + 0.006, 0, { r: 0.002 });
    k.cyl('mount', 'metal-black', 0.016, 0.016, p.drop, 0, bh + 0.012, 0, { segs: k.seg(12, 6) });
    k.cyl('mount', 'metal-black', 0.06, 0.06, 0.012, 0, top - 0.012, 0, { segs: k.seg(20, 8) });
    k.box('display', 'light-cool', 0.01, 0.004, 0.002, -0.12, bh * 0.25, 0.1405, { r: 0 });
    return finish(k);
  },
});

const screen = mk({
  id: 'projector-screen', category: 'appliances', ko: '롤스크린(프로젝터 스크린)', en: 'Pull-down projector screen', placement: 'wall', elevation: 0.75,
  params: [
    P.len('width', '폭', 'Width', 2.2, 1.2, 3.2),
    P.len('drop', '내림 길이', 'Drop', 1.5, 0.8, 2.2),
  ],
  tags: ['projector screen', 'pull down screen', 'home cinema', '프로젝터 스크린', '스크린', '홈시네마'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, drop = p.drop, cw = w + 0.12, ch = 0.085, top = drop + 0.05 + ch;
    k.box('casing', 'metal-white', cw, ch, 0.085, 0, top - ch / 2, 0, { r: 0.02, segs: 3 });
    for (const s of [-1, 1]) k.box('casing', 'plastic-grey', 0.02, ch + 0.004, 0.09, s * (cw / 2 - 0.008), top - ch / 2, 0, { r: 0.006 });
    // cloth: white viewing area with black borders and top drop
    const y0 = 0.05, cz = 0.0;
    k.box('screen', 'fabric-cotton-white', w, drop, 0.003, 0, y0 + drop / 2, cz, { r: 0 });
    const border = 0.04, va = Math.min(drop - 0.15, (w - 2 * border) * 9 / 16);
    const topDrop = drop - va - border;
    k.box('border', 'paint-black-matte', w, topDrop, 0.001, 0, y0 + drop - topDrop / 2, cz + 0.002, { r: 0 });
    k.box('border', 'paint-black-matte', w, border, 0.001, 0, y0 + border / 2, cz + 0.002, { r: 0 });
    for (const s of [-1, 1]) k.box('border', 'paint-black-matte', border, va, 0.001, s * (w / 2 - border / 2), y0 + border + va / 2, cz + 0.002, { r: 0 });
    // weighted bottom bar + pull tab
    k.box('casing', 'metal-white', w + 0.01, 0.03, 0.02, 0, y0 - 0.0, cz, { r: 0.008 });
    k.box('casing', 'plastic-black', 0.04, 0.05, 0.006, 0, y0 - 0.04, cz, { r: 0.004 });
    return finish(k);
  },
});

/* ------------------------------------------------------ network & small */

const router = mk({
  id: 'wifi-router', category: 'appliances', ko: '와이파이 공유기', en: 'Wi-Fi router', placement: 'surface',
  params: [P.mat('color', '색상', 'Colour', 'plastic-black', 'plastic'), P.int('antennas', '안테나', 'Antennas', 4, 0, 6)],
  tags: ['router', 'wifi router', 'modem', 'network', '공유기', '와이파이', '인터넷'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.24, d = 0.16, h = 0.035;
    k.soft('body', p.color, w, h, d, 0.012, 0, 0.004 + h / 2, 0, { flat: 3 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.01, 0.01, 0.004, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), { segs: 8 });
    for (let i = 0; i < 8; i++) k.box('top', 'plastic-grey', 0.004, 0.001, d * 0.5, -0.07 + i * 0.02, 0.004 + h + 0.0002, -0.01, { r: 0 });
    for (let i = 0; i < 6; i++) k.box('display', 'light-cool', 0.006, 0.004, 0.002, -0.06 + i * 0.024, 0.004 + h * 0.5, d / 2 + 0.001, { r: 0, overrides: { color: '#a8ffb8' } });
    const n = p.antennas;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -w / 2 + 0.02 + ((w - 0.04) * i) / (n - 1);
      const tilt = (n === 1 ? 0 : (i / (n - 1) - 0.5)) * 0.5;
      k.box('antennas', p.color, 0.018, 0.17, 0.008, x + Math.sin(-tilt) * 0.0, 0.004 + h * 0.6 + 0.085, -d / 2 - 0.004, { r: 0.004, rz: tilt });
    }
    return finish(k);
  },
});

const smartSpeaker = mk({
  id: 'smart-speaker', category: 'appliances', ko: 'AI 스피커', en: 'Smart speaker', placement: 'surface',
  params: [P.mat('fabric', '패브릭', 'Fabric', 'fabric-linen-grey', 'fabric'), P.len('height', '높이', 'Height', 0.15, 0.09, 0.25)],
  tags: ['smart speaker', 'ai speaker', 'voice assistant', 'AI 스피커', '스마트 스피커', '블루투스 스피커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.052, h = p.height;
    k.lathe('fabric', p.fabric, [[0, 0], [r * 0.9, 0], [r, 0.01], [r, h - 0.012], [r * 0.96, h - 0.004]], 0, 0, 0, { segs: k.seg(36, 10) });
    k.cyl('top', 'plastic-grey', r * 0.96, r * 0.96, 0.004, 0, h - 0.004, 0, { segs: k.seg(32, 10), overrides: { color: '#d8d9db' } });
    k.add('display', 'light-cool', new THREE.TorusGeometry(r * 0.8, 0.002, 3, k.seg(36, 10)).rotateX(PI / 2).translate(0, h + 0.0005, 0), { overrides: { color: '#8fd6ff' } });
    for (const x of [-0.02, 0, 0.02]) k.cyl('buttons', 'plastic-black', 0.005, 0.005, 0.0015, x, h, 0, { segs: 8 });
    return finish(k);
  },
});

const waterPurifier = mk({
  id: 'water-purifier', category: 'appliances', ko: '정수기(직수형)', en: 'Water purifier', placement: 'surface',
  params: [P.mat('color', '본체', 'Body', 'paint-white-gloss', 'paint'), P.len('height', '높이', 'Height', 0.42, 0.35, 0.55)],
  tags: ['water purifier', 'water dispenser', 'filter', '정수기', '직수 정수기', '냉온정수기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.17, h = p.height, d = 0.36;
    k.soft('body', p.color, w, h, d - 0.05, 0.03, 0, h / 2, -0.025, { flat: 3 });
    // dispensing head reaching forward with the nozzle, touch panel on its top
    const hy = h - 0.055;
    k.soft('body', p.color, w * 0.86, 0.06, 0.12, 0.02, 0, hy, d / 2 - 0.08, { flat: 2 });
    k.cyl('nozzle', 'metal-chrome', 0.008, 0.008, 0.025, 0, hy - 0.055, d / 2 - 0.055, { segs: k.seg(12, 6) });
    k.box('display', 'screen-black', w * 0.66, 0.003, 0.07, 0, hy + 0.0305, d / 2 - 0.085, { r: 0.002 });
    k.box('display', 'light-cool', 0.03, 0.002, 0.008, 0, hy + 0.032, d / 2 - 0.07, { r: 0 });
    // drip tray
    k.box('tray', 'metal-steel', w * 0.82, 0.018, 0.11, 0, 0.009, d / 2 - 0.07, { r: 0.004 });
    for (let i = 0; i < 6; i++) k.box('tray', 'plastic-grey', w * 0.7, 0.002, 0.004, 0, 0.0185, d / 2 - 0.115 + i * 0.018, { r: 0 });
    return finish(k);
  },
});

const sewing = mk({
  id: 'sewing-machine', category: 'appliances', ko: '재봉틀', en: 'Sewing machine', placement: 'surface',
  params: [P.mat('color', '본체', 'Body', 'plastic-white', 'plastic'), P.mat('accent', '포인트', 'Accent', 'paint-blue-matte', 'paint')],
  tags: ['sewing machine', 'sewing', 'craft', '재봉틀', '미싱', '바느질'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.42, D = 0.18;
    k.soft('body', p.color, W, 0.07, D, 0.02, 0, 0.035, 0, { flat: 3 });
    k.soft('body', p.color, 0.12, 0.2, 0.16, 0.03, W / 2 - 0.07, 0.07 + 0.1 - 0.005, -0.005, { flat: 2 }); // pillar
    k.soft('body', p.color, W - 0.02, 0.085, 0.13, 0.03, 0, 0.27 - 0.01, -0.01, { flat: 3 }); // arm
    k.soft('body', p.color, 0.09, 0.14, 0.14, 0.02, -W / 2 + 0.055, 0.2, 0.0, { flat: 2 }); // head
    k.box('accent', p.accent, W - 0.04, 0.012, 0.002, 0, 0.27, 0.0565, { r: 0 });
    k.box('display', 'screen-black', 0.06, 0.04, 0.003, W / 2 - 0.07, 0.17, 0.076, { r: 0.003 });
    // needle bar, presser foot, needle plate
    k.cyl('metal', 'metal-chrome', 0.005, 0.005, 0.08, -W / 2 + 0.06, 0.07, 0.02, { segs: 8 });
    k.box('metal', 'metal-chrome', 0.025, 0.006, 0.03, -W / 2 + 0.06, 0.073, 0.03, { r: 0.002 });
    k.box('metal', 'metal-steel', 0.08, 0.002, 0.08, -W / 2 + 0.07, 0.0705, 0.02, { r: 0.001 });
    // hand wheel on the right side, spool pin + spool on top
    k.cyl('wheel', 'plastic-grey', 0.05, 0.05, 0.03, W / 2 - 0.012, 0.25, -0.01, { rz: -PI / 2, segs: k.seg(28, 10) });
    k.cyl('metal', 'metal-chrome', 0.003, 0.003, 0.06, 0.05, 0.298, -0.02, { segs: 6 });
    k.cyl('spool', 'fabric-terracotta', 0.014, 0.014, 0.04, 0.05, 0.305, -0.02, { segs: k.seg(14, 6) });
    k.box('display', 'light-warm', 0.02, 0.003, 0.004, -W / 2 + 0.06, 0.13, 0.071, { r: 0 });
    return finish(k);
  },
});

/** Ironing-board outline in plan: square tail at −x, rounded nose at +x. */
function boardShape(L, W) {
  const s = new THREE.Shape();
  const x0 = -L / 2, x1 = L / 2, hw = W / 2;
  s.moveTo(x0 + 0.03, -hw);
  s.lineTo(x1 - L * 0.35, -hw);
  s.bezierCurveTo(x1 - L * 0.1, -hw, x1, -hw * 0.35, x1, 0);
  s.bezierCurveTo(x1, hw * 0.35, x1 - L * 0.1, hw, x1 - L * 0.35, hw);
  s.lineTo(x0 + 0.03, hw);
  s.quadraticCurveTo(x0, hw, x0, hw - 0.03);
  s.lineTo(x0, -hw + 0.03);
  s.quadraticCurveTo(x0, -hw, x0 + 0.03, -hw);
  return s;
}

const ironing = mk({
  id: 'ironing-board', category: 'appliances', ko: '다리미판+다리미', en: 'Ironing board & iron',
  params: [
    P.len('height', '높이', 'Height', 0.86, 0.7, 0.95),
    P.mat('cover', '커버', 'Cover', 'fabric-linen-grey', 'fabric'),
  ],
  tags: ['ironing board', 'iron', 'steam iron', 'laundry', '다리미판', '다리미', '스팀다리미'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.22, W = 0.38, h = p.height;
    k.slab('board', 'metal-white', boardShape(L, W), 0.012, h - 0.03, { bevel: 0.003, curveSegs: 16 });
    k.slab('cover', p.cover, boardShape(L + 0.01, W + 0.01), 0.018, h - 0.018, { bevel: 0.008, curveSegs: 16 });
    // X legs (side view), feet bars across
    const legZ = [-0.12, 0.12], a = -0.32, b = 0.3;
    for (const z of legZ) {
      k.rod('legs', 'metal-white', [a, 0.02, z], [b + 0.02, h - 0.03, z], 0.011, { segs: k.seg(10, 5) });
      k.rod('legs', 'metal-white', [b, 0.02, z * 0.82], [a - 0.02, h - 0.03, z * 0.82], 0.011, { segs: k.seg(10, 5) });
    }
    for (const [x, zz] of [[a, 0.12], [b, 0.1]]) {
      k.rod('legs', 'metal-white', [x, 0.02, -zz - 0.04], [x, 0.02, zz + 0.04], 0.012, { segs: k.seg(10, 5) });
      for (const s of [-1, 1]) k.sphere('feet', 'rubber-black', 0.018, x, 0.018, s * (zz + 0.04), { segs: 8, rings: 5, scale: [1, 1, 1.3] });
    }
    // iron rest at the tail, iron standing on it
    k.slab('board', 'metal-white', roundRect(0.14, 0.22, 0.03), 0.006, h - 0.02, { x: -L / 2 - 0.07, bevel: 0.002 });
    const ix = -L / 2 - 0.07, iy = h - 0.014;
    k.slab('iron', 'metal-steel', boardShape(0.25, 0.11), 0.012, iy, { x: ix, ry: PI / 2, bevel: 0.003, curveSegs: 10 });
    const ironTop = new THREE.Shape(boardShape(0.24, 0.1).getPoints(10));
    k.slab('ironbody', 'plastic-white', ironTop, 0.05, iy + 0.012, { x: ix, ry: PI / 2, bevel: 0.015, curveSegs: 8 });
    k.bentTube('ironbody', 'paint-blue-matte', [[ix, iy + 0.06, 0.08], [ix, iy + 0.11, 0.04], [ix, iy + 0.11, -0.06], [ix, iy + 0.06, -0.09]], 0.012, 0.03);
    return finish(k);
  },
});

const boiler = mk({
  id: 'gas-boiler', category: 'appliances', ko: '가스 보일러(벽걸이)', en: 'Wall-hung gas boiler', placement: 'wall', elevation: 1.1,
  params: [P.mat('finish', '마감', 'Finish', 'paint-white-gloss', 'paint')],
  tags: ['boiler', 'gas boiler', 'combi boiler', 'heating', '보일러', '가스보일러', '난방'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.44, h = 0.7, d = 0.3, y0 = 0.16;
    k.soft('body', p.finish, w, h, d, 0.02, 0, y0 + h / 2, 0, { flat: 3 });
    // control panel near the bottom front
    k.box('panel', 'plastic-grey', w - 0.08, 0.1, 0.01, 0, y0 + 0.08, d / 2 + 0.003, { r: 0.006, overrides: { color: '#d4d6d9' } });
    k.box('display', 'screen-black', 0.09, 0.04, 0.003, -0.08, y0 + 0.08, d / 2 + 0.009, { r: 0.003 });
    k.box('display', 'light-cool', 0.05, 0.014, 0.001, -0.08, y0 + 0.08, d / 2 + 0.011, { r: 0 });
    for (const x of [0.04, 0.09, 0.14]) k.cyl('knobs', 'plastic-black', 0.013, 0.013, 0.008, x, y0 + 0.08, d / 2 + 0.008, { rx: PI / 2, segs: k.seg(14, 6) });
    // flue on top, pipes & valves underneath
    k.cyl('flue', 'metal-white', 0.05, 0.05, 0.14, 0, y0 + h, -0.03, { segs: k.seg(20, 8) });
    const xs = [-0.15, -0.08, 0, 0.08, 0.15];
    xs.forEach((x, i) => {
      const mat = i === 2 ? 'metal-brass' : 'metal-copper';
      k.cyl('pipes', mat, 0.011, 0.011, y0, x, 0, 0.03, { segs: k.seg(10, 5) });
      k.box('valves', 'plastic-black', 0.03, 0.03, 0.03, x, y0 * 0.55, 0.03, { r: 0.006 });
    });
    return finish(k);
  },
});

const waterHeater = mk({
  id: 'water-heater', category: 'appliances', ko: '전기 온수기(저장식)', en: 'Electric water heater', placement: 'wall', elevation: 1.0,
  params: [P.len('height', '높이', 'Height', 0.85, 0.5, 1.3), P.mat('finish', '마감', 'Finish', 'paint-white-gloss', 'paint')],
  tags: ['water heater', 'hot water tank', 'boiler', '온수기', '전기온수기', '저장식 온수기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.22, h = p.height, y0 = 0.12;
    k.lathe('tank', p.finish, [[0, 0], [r * 0.5, 0], [r * 0.9, 0.03], [r, 0.09], [r, h - 0.09], [r * 0.9, h - 0.03], [r * 0.5, h], [0, h]], 0, y0, 0, { segs: k.seg(36, 10), smooth: 14 });
    k.box('panel', 'plastic-grey', 0.14, 0.12, 0.02, 0, y0 + 0.16, r - 0.004, { r: 0.008, overrides: { color: '#d4d6d9' } });
    k.cyl('panel', 'plastic-black', 0.025, 0.025, 0.012, 0, y0 + 0.17, r + 0.006, { rx: PI / 2, segs: k.seg(16, 6) });
    k.box('display', 'light-warm', 0.01, 0.01, 0.002, 0.045, y0 + 0.13, r + 0.007, { r: 0, overrides: { color: '#ff8a5c' } });
    for (const x of [-0.07, 0.07]) {
      k.cyl('pipes', x < 0 ? 'metal-steel' : 'metal-copper', 0.011, 0.011, y0 + 0.01, x, 0, 0, { segs: k.seg(10, 5) });
      k.box('pipes', 'plastic-black', 0.03, 0.03, 0.03, x, 0.05, 0, { r: 0.006 });
    }
    return finish(k);
  },
});

/* ----------------------------------------------------- preset variants */

const V = [
  variant(byId('refrigerator'), 'side-by-side-black', '양문형 냉장고(블랙)', 'Side-by-side fridge (black)', { type: 'sideBySide', finish: 'paint-black-matte' }, { tags: ['side by side', '양문형'] }),
  variant(byId('refrigerator'), 'top-freezer', '일반 2도어 냉장고', 'Top-freezer fridge', { type: 'topFreezer', width: 0.7, height: 1.75, depth: 0.7, finish: 'paint-white-gloss' }, { tags: ['top freezer', '2도어', '원룸 냉장고'] }),
  variant(byId('kimchi-refrigerator'), 'steel', '김치냉장고(메탈)', 'Kimchi refrigerator (metal)', { finish: 'metal-aluminium', width: 0.82 }, { tags: ['metal', '메탈'] }),
  variant(byId('tv'), '55', 'TV 55인치(스탠드)', '55" TV on stand', { inches: 55 }, { tags: ['55 inch', '55인치'] }),
  variant(byId('tv-wall'), '85', '벽걸이 TV 85인치', '85" wall TV', { inches: 85 }, { tags: ['85 inch', '85인치', '대형 TV'] }),
  variant(wineFridge, 'tall', '와인셀러(대형)', 'Wine cellar (tall)', { height: 1.8, width: 0.6, finish: 'metal-steel' }, { tags: ['tall', '대형'] }),
  variant(range, 'wide-black', '레인지 쿠커 120(블랙)', 'Range cooker 120 (black)', { width: 1.2, finish: 'metal-black', trim: 'metal-brass' }, { tags: ['wide', '대형', 'black', '블랙'] }),
  variant(washerStack, 'black', '세탁기+건조기 직렬(블랙)', 'Stacked washer & dryer (black)', { finish: 'plastic-black' }, { tags: ['black', '블랙'] }),
];

export const ITEMS = [
  frenchFridge, columnFridge, wineFridge, chestFreezer, retroFridge,
  washerStack, topLoader, styler,
  range, steamOven,
  robotVac, stickVac, purifierTower, purifierBox, dehumidifier, humidifier, oilHeater, floorFan, towerFan, cassette,
  bookshelfSpeakers, floorSpeaker, soundbar, subwoofer, receiver, consoleItem, projector, screen,
  router, smartSpeaker, waterPurifier, sewing, ironing, boiler, waterHeater,
  ...V,
];
void LAUNDRY;
