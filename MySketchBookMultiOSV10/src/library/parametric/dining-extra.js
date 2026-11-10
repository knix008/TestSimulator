// Further dining designs: table + chair sets (4 / 6 / 8, round), booth and corner banquette,
// buffet, hutch, bar cart, wine cabinet, gateleg and Korean low tables, concrete and counter
// tables, counter / saddle stools, café metal, Chiavari and wingback chairs, backrest bench,
// china cabinet. Sizes are measured from the default build. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, variant, roundRect, ellipse, addCabinet, addHandle, transformAdded } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { buildChair, splayLegs } from './dining.js';

const PI = Math.PI;
const CHAIR_STYLES = [['upholstered', '패브릭', 'Upholstered'], ['spindle', '원목 스핀들', 'Wooden spindle'], ['metal', '금속+합판', 'Metal + plywood']];
const WOOD = (def = 'wood-oak', ko = '나무', en = 'Wood', key = 'wood') => P.mat(key, ko, en, def, 'wood');

/** A chair from dining.js at (x, z) facing the table centre (turned by ry; chairs face +z). */
const chairAt = (k, p, x, z, ry) => transformAdded(k, (kk) => buildChair(kk, { style: p.chairStyle, wood: p.chairWood ?? p.wood, fabric: p.fabric }), x, 0, z, ry);

/** Rectangular table top + 4 legs (square or tapered), top at 0.75. */
function rectTable(k, p, L, D, { h = 0.75, t = 0.035, legs = 'square' } = {}) {
  k.slab('top', p.wood, roundRect(L, D, 0.012), t, h - t, { bevel: 0.004 });
  const ah = 0.08;
  for (const s of [-1, 1]) {
    k.box('frame', p.wood, L - 0.16, ah, 0.022, 0, h - t - ah / 2, s * (D / 2 - 0.07), { r: 0.002 });
    k.box('frame', p.wood, 0.022, ah, D - 0.16, s * (L / 2 - 0.07), h - t - ah / 2, 0, { r: 0.002 });
  }
  if (legs === 'square') splayLegs(k, 'frame', p.wood, L, D, h - t, { inset: 0.06, r: 0.03, square: true });
  else splayLegs(k, 'frame', p.wood, L, D, h - t, { inset: 0.07, r: 0.028, rFoot: 0.016, splay: 0.03 });
}

const setParams = (wood = 'wood-oak', style = 'upholstered', fabric = 'fabric-linen-beige') => [
  P.mat('wood', '식탁 목재', 'Table wood', wood, 'wood'),
  P.pick('chairStyle', '의자 스타일', 'Chair style', style, CHAIR_STYLES),
  P.mat('fabric', '의자 천', 'Chair fabric', fabric, 'fabric'),
  P.mat('chairWood', '의자 목재', 'Chair wood', wood, 'wood'),
];

/* ------------------------------------------------------------------ sets */

function rectSet(id, ko, en, seats, L, D, tags, wood, style, fabric) {
  return mk({
    id, category: 'dining', ko, en, seats,
    params: [P.len('length', '식탁 길이', 'Table length', L, L - 0.4, L + 0.4), ...setParams(wood, style, fabric), P.pick('legs', '식탁 다리', 'Table legs', 'square', [['square', '각진', 'Square'], ['tapered', '테이퍼', 'Tapered']])],
    tags: ['dining set', 'table and chairs', '식탁 세트', `${seats}인 식탁`, `${seats}-seat`, ...tags],
    build: (p, ctx) => {
      const k = new Kit(ctx);
      const len = p.length;
      rectTable(k, p, len, D, { legs: p.legs });
      const side = Math.floor((seats - (seats >= 6 ? 2 : 0)) / 2);
      for (let i = 0; i < side; i++) {
        const x = -len / 2 + (len / side) * (i + 0.5);
        chairAt(k, p, x, D / 2 + 0.12, PI);
        chairAt(k, p, x, -D / 2 - 0.12, 0);
      }
      if (seats >= 6) { chairAt(k, p, len / 2 + 0.16, 0, -PI / 2); chairAt(k, p, -len / 2 - 0.16, 0, PI / 2); }
      return finish(k);
    },
  });
}

const set4 = rectSet('dining-set-4', '4인 식탁 세트', '4-seat dining set', 4, 1.4, 0.8, ['4인', 'four seater'], 'wood-oak', 'upholstered', 'fabric-linen-beige');
const set6 = rectSet('dining-set-6', '6인 식탁 세트', '6-seat dining set', 6, 1.8, 0.9, ['6인', 'six seater'], 'wood-walnut', 'spindle', 'fabric-linen-grey');
const set8 = rectSet('dining-set-8', '8인 식탁 세트', '8-seat dining set', 8, 2.4, 1.0, ['8인', 'eight seater', 'large'], 'wood-dark', 'upholstered', 'fabric-velvet-green');

const roundSet = mk({
  id: 'dining-set-round-4', category: 'dining', ko: '원형 4인 식탁 세트', en: 'Round 4-seat dining set', seats: 4,
  params: [P.len('diameter', '지름', 'Diameter', 1.1, 0.9, 1.3), ...setParams('wood-ash', 'metal', 'fabric-linen-white'), P.mat('base', '받침', 'Pedestal', 'metal-black', 'metal')],
  tags: ['round dining set', 'pedestal table', '원형 식탁', '식탁 세트', '4인', '4-seat'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = p.diameter / 2, h = 0.75;
    k.cyl('top', p.wood, r, r, 0.03, 0, h - 0.03, 0, { segs: k.seg(48, 14) });
    k.cyl('base', p.base, 0.045, 0.045, h - 0.05, 0, 0.02, 0, { segs: k.seg(16, 8) });
    k.cyl('base', p.base, 0.26, 0.28, 0.025, 0, 0, 0, { segs: k.seg(36, 12) });
    k.cyl('base', p.base, 0.14, 0.05, 0.05, 0, h - 0.08, 0, { segs: k.seg(20, 8) });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4, R = r + 0.1;
      chairAt(k, p, Math.sin(a) * R, Math.cos(a) * R, a + PI);
    }
    return finish(k);
  },
});

const booth = mk({
  id: 'dining-booth', category: 'dining', ko: '부스 식탁(마주보는 벤치)', en: 'Dining booth with facing benches', seats: 4,
  params: [P.len('length', '길이', 'Length', 1.3, 0.9, 1.8), P.mat('fabric', '쿠션', 'Upholstery', 'leather-cognac', 'leather'), WOOD('wood-walnut'), P.mat('top', '식탁 상판', 'Table top', 'marble-white', 'stone')],
  tags: ['booth', 'dining booth', 'diner', 'banquette', '부스', '부스 식탁', '벤치 식탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.7, bd = 0.6, h = 0.74;
    k.box('top', p.top, L, 0.03, D, 0, h - 0.015, 0, { r: 0.006 });
    k.box('frame', 'metal-black', 0.08, h - 0.03, 0.08, 0, (h - 0.03) / 2, 0, { r: 0.004 });
    k.box('frame', 'metal-black', L * 0.6, 0.025, 0.4, 0, 0.0125, 0, { r: 0.004 });
    for (const s of [-1, 1]) {
      const z = s * (D / 2 + bd / 2 + 0.02);
      k.box('wood', p.wood, L + 0.1, 0.38, bd, 0, 0.19, z, { r: 0.006 });
      k.box('wood', p.wood, L + 0.1, 1.15, 0.08, 0, 0.575, z + s * (bd / 2 - 0.04), { r: 0.006 });
      k.soft('fabric', p.fabric, L, 0.09, bd - 0.12, 0.03, 0, 0.425, z - s * 0.03, { puff: 0.008 });
      k.soft('fabric', p.fabric, L, 0.55, 0.08, 0.03, 0, 0.78, z + s * (bd / 2 - 0.12), { puff: 0.01, rx: s * 0.1 });
    }
    return finish(k);
  },
});

const banquette = mk({
  id: 'dining-banquette-corner', category: 'dining', ko: 'ㄱ자 코너 벤치 식탁', en: 'Corner banquette with table', seats: 5,
  params: [P.len('length', '긴 쪽 길이', 'Long side', 1.8, 1.4, 2.4), P.len('return', '짧은 쪽 길이', 'Short side', 1.3, 1.0, 1.8), P.mat('fabric', '쿠션', 'Cushion', 'fabric-linen-grey', 'fabric'), WOOD('wood-white', '벤치', 'Bench'), P.mat('top', '식탁', 'Table', 'wood-oak', 'wood')],
  tags: ['banquette', 'corner bench', 'breakfast nook', 'built-in seating', '코너 벤치', 'ㄱ자 벤치', '붙박이 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const A = p.length, B = p.return, bd = 0.5, sh = 0.42;
    // long run along x at the back, short run along z on the left
    k.box('bench', p.wood, A, sh - 0.06, bd, 0, (sh - 0.06) / 2, -B / 2 + bd / 2, { r: 0.004 });
    k.box('bench', p.wood, bd, sh - 0.06, B - bd, -A / 2 + bd / 2, (sh - 0.06) / 2, bd / 2, { r: 0.004 });
    k.soft('fabric', p.fabric, A - 0.02, 0.07, bd - 0.04, 0.025, 0, sh - 0.025, -B / 2 + bd / 2 + 0.01, { puff: 0.008 });
    k.soft('fabric', p.fabric, bd - 0.04, 0.07, B - bd - 0.02, 0.025, -A / 2 + bd / 2 + 0.01, sh - 0.025, bd / 2 + 0.01, { puff: 0.008 });
    k.soft('fabric', p.fabric, A - 0.06, 0.42, 0.1, 0.04, 0.03, sh + 0.24, -B / 2 + 0.05, { puff: 0.012, rx: -0.1 });
    k.soft('fabric', p.fabric, 0.1, 0.42, B - 0.16, 0.04, -A / 2 + 0.05, sh + 0.24, 0.08, { puff: 0.012, rz: 0.1 });
    const tL = A - bd - 0.3, tD = B - bd - 0.25, tx = (bd + 0.05) / 2, tz = (bd + 0.05) / 2;
    k.slab('top', p.top, roundRect(tL, tD, 0.04), 0.03, 0.72, { x: tx, z: tz, bevel: 0.004 });
    k.cyl('frame', 'metal-black', 0.04, 0.04, 0.7, tx, 0.02, tz, { segs: k.seg(14, 6) });
    k.cyl('frame', 'metal-black', 0.24, 0.25, 0.02, tx, 0, tz, { segs: k.seg(28, 10) });
    return finish(k);
  },
});

/* --------------------------------------------------------------- storage */

const buffet = mk({
  id: 'dining-buffet', category: 'dining', ko: '다이닝 뷔페장(4도어)', en: 'Four-door dining buffet',
  params: [P.len('width', '폭', 'Width', 1.8, 1.2, 2.4), P.mat('body', '본체', 'Body', 'wood-walnut', 'wood'), P.mat('front', '도어', 'Doors', 'wood-walnut', 'wood'), P.pick('handle', '손잡이', 'Handles', 'bar', [['bar', '바', 'Bar'], ['knob', '노브', 'Knob'], ['edge', '엣지', 'Edge pull']]), P.mat('legs', '다리', 'Legs', 'metal-brass', 'metal')],
  tags: ['buffet', 'sideboard', 'credenza', '뷔페장', '사이드보드', '거실장', '수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.82, d = 0.45;
    addCabinet(k, { w, h, d, rows: [{ h: 0.78, n: 4, type: 'door' }, { h: 0.22, n: 4, type: 'drawer' }], body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-brass', base: 'legs', legH: 0.18, legStyle: 'metal', legMat: p.legs, top: p.body, topThick: 0.025 });
    return finish(k);
  },
});

const hutch = mk({
  id: 'dining-hutch', category: 'dining', ko: '그릇장(하부장 + 유리 상부장)', en: 'Dining hutch with glass top',
  params: [P.len('width', '폭', 'Width', 1.2, 0.9, 1.6), P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'), P.mat('top', '상판', 'Counter', 'wood-oak', 'wood'), P.pick('handle', '손잡이', 'Handles', 'knob', [['knob', '노브', 'Knob'], ['bar', '바', 'Bar'], ['cup', '컵', 'Cup']]), P.bool('plates', '접시', 'Plates', true)],
  tags: ['hutch', 'china cabinet', 'dresser', 'welsh dresser', '그릇장', '찬장', '주방 수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.48, bh = 0.88, uh = 1.12, ud = 0.34;
    addCabinet(k, { w, h: bh, d, rows: [{ h: 0.7, n: 2, type: 'door' }, { h: 0.3, n: 2, type: 'drawer' }], body: p.body, front: p.body, handle: p.handle, handleMat: 'metal-brass', base: 'plinth', plinth: 0.08, top: p.top, topThick: 0.03, topOverhang: 0.015 });
    transformAdded(k, (kk) => {
      addCabinet(kk, { w: w - 0.04, h: uh, d: ud, rows: [{ h: 1, n: 2, type: 'glass' }], body: p.body, front: p.body, handle: p.handle, handleMat: 'metal-brass', base: 'none' });
      kk.box('body', p.body, w + 0.02, 0.05, ud + 0.03, 0, uh + 0.025, 0.01, { r: 0.004 });
      for (const y of [0.37, 0.74]) kk.box('body', p.body, w - 0.08, 0.018, ud - 0.06, 0, y, -0.02, { r: 0.002 });
      if (p.plates) for (const y of [0.388, 0.758]) for (let i = 0; i < 4; i++) kk.cyl('plates', 'ceramic-white', 0.11, 0.11, 0.012, -w / 2 + 0.17 + i * ((w - 0.34) / 3), y + 0.115, -ud / 2 + 0.04, { rx: PI / 2 - 0.2, segs: kk.seg(24, 10) });
    }, 0, bh, -d / 2 + ud / 2);
    return finish(k);
  },
});

const barCart = mk({
  id: 'dining-bar-cart', category: 'dining', ko: '바 카트(서빙 트롤리)', en: 'Bar cart',
  params: [P.mat('frame', '프레임', 'Frame', 'metal-brass', 'metal'), P.mat('shelf', '선반', 'Shelves', 'glass-tinted', 'glass'), P.bool('bottles', '병', 'Bottles', true)],
  tags: ['bar cart', 'serving trolley', 'drinks trolley', '바 카트', '서빙 카트', '트롤리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.8, D = 0.45, H = 0.82, r = 0.012, wr = 0.07;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', p.frame, [sx * (L / 2 - 0.03), wr, sz * (D / 2 - 0.02)], [sx * (L / 2 - 0.03), H, sz * (D / 2 - 0.02)], r);
    for (const sx of [-1, 1]) k.bentTube('frame', p.frame, [[sx * (L / 2 - 0.03), H, -D / 2 + 0.02], [sx * (L / 2 + 0.06), H + 0.02, -D / 2 + 0.02], [sx * (L / 2 + 0.06), H + 0.02, D / 2 - 0.02], [sx * (L / 2 - 0.03), H, D / 2 - 0.02]], r * 0.9, 0.04);
    for (const y of [0.18, 0.62]) {
      k.box('shelf', p.shelf, L - 0.05, 0.008, D - 0.03, 0, y, 0, { r: 0 });
      k.tube('frame', p.frame, [[-L / 2 + 0.03, y + 0.02, -D / 2 + 0.02], [L / 2 - 0.03, y + 0.02, -D / 2 + 0.02], [L / 2 - 0.03, y + 0.02, D / 2 - 0.02], [-L / 2 + 0.03, y + 0.02, D / 2 - 0.02]], 0.006, { closed: true, tension: 0 });
    }
    for (const sx of [-1, 1]) k.cyl('wheels', 'rubber-black', wr, wr, 0.025, sx * (L / 2 - 0.03), wr, D / 2 - 0.0, { rx: PI / 2, segs: k.seg(24, 8) });
    for (const sx of [-1, 1]) k.cyl('wheels', 'rubber-black', wr, wr, 0.025, sx * (L / 2 - 0.03), wr, -D / 2 - 0.025, { rx: PI / 2, segs: k.seg(24, 8) });
    if (p.bottles) {
      for (const [x, z, h, m] of [[-0.25, -0.08, 0.28, 'glass-tinted'], [-0.15, -0.1, 0.24, 'glass-clear'], [-0.05, -0.06, 0.3, 'glass-tinted']]) k.lathe('bottles', m, [[0, 0], [0.04, 0], [0.04, h * 0.65], [0.014, h * 0.8], [0.014, h], [0, h]], x, 0.63, z, { segs: k.seg(16, 6) });
      for (const x of [0.12, 0.2]) k.lathe('glasses', 'glass-clear', [[0, 0], [0.03, 0], [0.03, 0.006], [0.004, 0.012], [0.004, 0.08], [0.035, 0.1], [0.04, 0.16], [0.038, 0.16], [0.03, 0.1], [0, 0.09]], x, 0.63, 0.05, { segs: k.seg(16, 6) });
      k.box('tray', p.frame, 0.25, 0.015, 0.16, 0.25, 0.19, 0, { r: 0.003 });
    }
    return finish(k);
  },
});

const wineCabinet = mk({
  id: 'dining-wine-cabinet', category: 'dining', ko: '와인 진열장(유리문)', en: 'Wine cabinet with glass door',
  params: [P.mat('body', '본체', 'Body', 'wood-dark', 'wood'), P.len('height', '높이', 'Height', 1.8, 1.2, 2.1), P.bool('bottles', '와인병', 'Bottles', true)],
  tags: ['wine cabinet', 'wine rack', 'bar cabinet', '와인장', '와인 진열장', '와인 랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.7, h = p.height, d = 0.42, t = 0.022;
    for (const s of [-1, 1]) k.box('body', p.body, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.003 });
    k.box('body', p.body, w, t, d, 0, h - t / 2, 0, { r: 0.003 });
    k.box('body', p.body, w - 2 * t, 0.08, d, 0, 0.04, 0, { r: 0.003 });
    k.box('body', p.body, w, h, 0.01, 0, h / 2, -d / 2 + 0.005, { r: 0 });
    const rack = h * 0.55, cols = 4, rows = Math.max(4, Math.round(rack / 0.11));
    const cw = (w - 2 * t) / cols, rh = rack / rows;
    for (let i = 1; i < cols; i++) k.box('body', p.body, 0.012, rack, d - 0.04, -w / 2 + t + cw * i, 0.08 + rack / 2, -0.01, { r: 0.001 });
    for (let j = 0; j <= rows; j++) k.box('body', p.body, w - 2 * t, 0.012, d - 0.04, 0, 0.08 + rh * j, -0.01, { r: 0.001 });
    if (p.bottles) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if ((i + j) % 3 !== 2) k.rod('bottles', 'glass-tinted', [-w / 2 + t + cw * (i + 0.5), 0.08 + rh * (j + 0.5), -d / 2 + 0.04], [-w / 2 + t + cw * (i + 0.5), 0.08 + rh * (j + 0.5), d / 2 - 0.05], 0.036, { r2: 0.014, segs: k.seg(12, 5) });
    for (const y of [0.08 + rack + 0.25, 0.08 + rack + 0.5]) if (y < h - 0.1) k.box('glass', 'glass-clear', w - 2 * t, 0.008, d - 0.05, 0, y, -0.01, { r: 0 });
    const uy = 0.08 + rack, uh = h - t - uy;
    k.panel('door', p.body, frameShapeAt(w - 0.004, uh - 0.004, 0.05), 0.02, 0, uy + uh / 2, d / 2 + 0.01, { bevel: 0.002 });
    k.box('glass', 'glass-clear', w - 0.09, uh - 0.09, 0.005, 0, uy + uh / 2, d / 2 + 0.01, { r: 0 });
    addHandle(k, 'handles', 'metal-brass', 'bar', w / 2 - 0.05, uy + uh / 2, d / 2 + 0.02, { len: 0.2, vertical: true });
    return finish(k);
  },
});

/** Rectangular frame outline centred at the origin (outer w × h, bar width b). */
function frameShapeAt(w, h, b) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(w / 2, h / 2), new THREE.Vector2(-w / 2, h / 2)]);
  const hole = new THREE.Path([new THREE.Vector2(-w / 2 + b, -h / 2 + b), new THREE.Vector2(-w / 2 + b, h / 2 - b), new THREE.Vector2(w / 2 - b, h / 2 - b), new THREE.Vector2(w / 2 - b, -h / 2 + b)]);
  s.holes.push(hole);
  return s;
}

const chinaCabinet = mk({
  id: 'dining-china-cabinet', category: 'dining', ko: '양문 유리 장식장', en: 'Glass-door china cabinet',
  params: [P.len('width', '폭', 'Width', 1.0, 0.7, 1.4), P.mat('body', '본체', 'Body', 'wood-oak', 'wood'), P.mat('legs', '다리', 'Legs', 'wood-oak', 'wood'), P.bool('dishes', '그릇', 'Dishes', true)],
  tags: ['china cabinet', 'display cabinet', 'vitrine', '장식장', '유리 장식장', '그릇장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 1.7, d = 0.4;
    addCabinet(k, { w, h, d, rows: [{ h: 0.22, n: 2, type: 'drawer' }, { h: 0.78, n: 2, type: 'glass' }], body: p.body, front: p.body, handle: 'knob', handleMat: 'metal-brass', base: 'legs', legH: 0.2, legStyle: 'tapered', legMat: p.legs, top: p.body, topThick: 0.03, topOverhang: 0.015 });
    for (const y of [0.92, 1.28]) {
      k.box('glass', 'glass-clear', w - 0.06, 0.008, d - 0.06, 0, y, -0.01, { r: 0 });
      if (p.dishes) for (let i = 0; i < 3; i++) k.lathe('dishes', 'ceramic-white', [[0, 0], [0.04, 0], [0.05, 0.05], [0.055, 0.1], [0.05, 0.1], [0.045, 0.05], [0, 0.01]], -w / 3 + i * (w / 3), y + 0.004, -0.02, { segs: k.seg(18, 6) });
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- tables */

const gateleg = mk({
  id: 'dining-table-gateleg', category: 'dining', ko: '게이트레그 접이식 식탁', en: 'Gateleg table',
  params: [WOOD('wood-pine'), P.pick('leaves', '날개', 'Leaves', 'both', [['both', '양쪽 펼침', 'Both up'], ['one', '한쪽', 'One up'], ['none', '접음', 'Folded']])],
  tags: ['gateleg table', 'folding table', 'drop leaf', 'small space', '게이트레그', '접이식 식탁', '소형 식탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = 0.8, C = 0.3, Lf = 0.5, h = 0.74, t = 0.025;
    k.box('top', p.wood, C, t, D, 0, h - t / 2, 0, { r: 0.003 });
    for (const s of [-1, 1]) {
      k.box('frame', p.wood, C - 0.04, 0.6, 0.05, 0, (h - t) / 2 + 0.05, s * (D / 2 - 0.06), { r: 0.004 });
      k.box('frame', p.wood, C, 0.04, 0.08, 0, 0.02, s * (D / 2 - 0.06), { r: 0.006 });
    }
    k.box('frame', p.wood, 0.04, 0.04, D - 0.12, 0, 0.2, 0, { r: 0.004 });
    const up = p.leaves === 'both' ? [-1, 1] : p.leaves === 'one' ? [1] : [];
    for (const s of [-1, 1]) {
      if (up.includes(s)) {
        k.box('top', p.wood, Lf, t, D, s * (C / 2 + Lf / 2), h - t / 2, 0, { r: 0.003 });
        k.box('frame', p.wood, 0.04, h - t, 0.04, s * (C / 2 + Lf - 0.08), (h - t) / 2, 0.15, { r: 0.004 });
        k.box('frame', p.wood, Lf - 0.08, 0.04, 0.03, s * (C / 2 + (Lf - 0.08) / 2), h - t - 0.04, 0.15, { r: 0.004 });
        k.box('frame', p.wood, Lf - 0.08, 0.04, 0.03, s * (C / 2 + (Lf - 0.08) / 2), 0.2, 0.15, { r: 0.004 });
      } else {
        k.box('top', p.wood, t, h - 0.08, D, s * (C / 2 + t / 2), h - (h - 0.08) / 2, 0, { r: 0.003 });
      }
    }
    return finish(k);
  },
});

const lowTable = mk({
  id: 'dining-table-low-floor', category: 'dining', ko: '좌식 교자상(접이식)', en: 'Korean low floor dining table',
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 1.8), P.len('depth', '깊이', 'Depth', 0.75, 0.5, 0.9), WOOD('wood-walnut'), P.bool('cushions', '방석', 'Floor cushions', true), P.mat('fabric', '방석 천', 'Cushion fabric', 'fabric-linen-beige', 'fabric')],
  tags: ['low table', 'floor table', 'korean table', '교자상', '좌식 식탁', '밥상', '좌식 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.34, t = 0.03;
    k.slab('top', p.wood, roundRect(w, d, 0.03), t, h - t, { bevel: 0.006 });
    k.box('top', p.wood, w - 0.04, 0.04, d - 0.04, 0, h - t - 0.02, 0, { r: 0.004 });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.12);
      k.box('frame', p.wood, 0.035, h - t - 0.04, d - 0.18, x, (h - t - 0.04) / 2 + 0.03, 0, { r: 0.006 });
      k.box('frame', p.wood, 0.06, 0.03, d - 0.12, x, 0.015, 0, { r: 0.008 });
    }
    if (p.cushions) for (const s of [-1, 1]) for (const i of [-1, 1]) k.soft('cushions', p.fabric, 0.5, 0.07, 0.5, 0.03, i * w / 4, 0.035, s * (d / 2 + 0.32), { puff: 0.015 });
    return finish(k);
  },
});

const concreteTable = mk({
  id: 'dining-table-concrete', category: 'dining', ko: '콘크리트 상판 철제 식탁', en: 'Concrete-top steel dining table',
  params: [P.len('length', '길이', 'Length', 2.0, 1.4, 2.6), P.mat('top', '상판', 'Top', 'concrete', 'stone'), P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal')],
  tags: ['concrete table', 'industrial table', 'steel frame', '콘크리트 식탁', '인더스트리얼 식탁', '철제 다리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.95, h = 0.75, t = 0.05;
    k.box('top', p.top, L, t, D, 0, h - t / 2, 0, { r: 0.006 });
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - 0.18);
      k.box('frame', p.frame, 0.05, 0.05, D - 0.08, x, 0.025, 0, { r: 0.003 });
      k.box('frame', p.frame, 0.05, 0.05, D - 0.08, x, h - t - 0.025, 0, { r: 0.003 });
      for (const z of [-1, 1]) k.box('frame', p.frame, 0.05, h - t - 0.1, 0.05, x, (h - t) / 2, z * (D / 2 - 0.065), { r: 0.003 });
    }
    k.box('frame', p.frame, L - 0.36, 0.04, 0.04, 0, 0.15, 0, { r: 0.003 });
    return finish(k);
  },
});

const counterTable = mk({
  id: 'dining-table-counter', category: 'dining', ko: '카운터 높이 식탁(하부 선반)', en: 'Counter-height table with shelf',
  params: [P.len('length', '길이', 'Length', 1.5, 1.0, 2.0), WOOD('wood-oak', '상판', 'Top'), P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'), P.bool('stools', '스툴', 'Stools', true), P.mat('seat', '스툴 좌판', 'Stool seats', 'wood-oak', 'wood')],
  tags: ['counter height table', 'kitchen island table', 'high table', '카운터 테이블', '아일랜드 식탁', '높은 식탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.7, h = 0.92;
    k.slab('top', p.wood, roundRect(L, D, 0.01), 0.04, h - 0.04, { bevel: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.frame, 0.04, h - 0.04, 0.04, sx * (L / 2 - 0.05), (h - 0.04) / 2, sz * (D / 2 - 0.05), { r: 0.003 });
    k.box('frame', p.frame, L - 0.06, 0.03, D - 0.06, 0, h - 0.055, 0, { r: 0.003 });
    k.box('top', p.wood, L - 0.12, 0.025, D - 0.12, 0, 0.25, 0, { r: 0.003 });
    if (p.stools) for (const sx of [-1, 1]) {
      const x = sx * L / 4, z = D / 2 + 0.18;
      k.cyl('seat', p.seat, 0.17, 0.17, 0.035, x, 0.65 - 0.035, z, { segs: k.seg(24, 8) });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        k.rod('frame', p.frame, [x + Math.cos(a) * 0.09, 0.615, z + Math.sin(a) * 0.09], [x + Math.cos(a) * 0.16, 0, z + Math.sin(a) * 0.16], 0.011);
      }
      k.tube('frame', p.frame, Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * PI * 2; return [x + Math.cos(a) * 0.14, 0.24, z + Math.sin(a) * 0.14]; }), 0.008, { closed: true });
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- seating */

const counterStool = mk({
  id: 'dining-stool-counter-back', category: 'dining', ko: '등받이 카운터 스툴', en: 'Counter stool with back',
  params: [P.len('seat', '좌판 높이', 'Seat height', 0.65, 0.6, 0.78), P.mat('fabric', '쿠션', 'Upholstery', 'leather-cognac', 'leather'), P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal')],
  tags: ['counter stool', 'bar stool', 'stool with back', '카운터 스툴', '바 스툴', '등받이 스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = p.seat, s = 0.42;
    const at = splayLegs(k, 'frame', p.frame, s - 0.04, s - 0.04, sh - 0.06, { inset: 0.03, r: 0.012, rFoot: 0.011, splay: 0.04 });
    const yr = 0.26;
    const [x0, z0] = at(-1, 1, yr), [x1] = at(1, 1, yr);
    k.rod('frame', p.frame, [x0, yr, z0], [x1, yr, z0], 0.01);
    for (const sx of [-1, 1]) { const [xa, za] = at(sx, 1, yr * 0.7), [, zb] = at(sx, -1, yr * 0.7); k.rod('frame', p.frame, [xa, yr * 0.7, za], [xa, yr * 0.7, zb], 0.008); }
    k.soft('fabric', p.fabric, s, 0.07, s, 0.025, 0, sh - 0.035, 0, { puff: 0.01 });
    for (const sx of [-1, 1]) k.rod('frame', p.frame, [sx * (s / 2 - 0.05), sh - 0.05, -s / 2 + 0.03], [sx * (s / 2 - 0.05), sh + 0.28, -s / 2 - 0.02], 0.01);
    k.soft('fabric', p.fabric, s - 0.02, 0.2, 0.05, 0.02, 0, sh + 0.24, -s / 2 - 0.02, { puff: 0.008, rx: -0.12 });
    return finish(k);
  },
});

const saddleStool = mk({
  id: 'dining-stool-saddle', category: 'dining', ko: '새들 바 스툴(원목)', en: 'Wooden saddle bar stool',
  params: [P.len('seat', '좌판 높이', 'Seat height', 0.75, 0.6, 0.8), WOOD('wood-walnut'), P.mat('foot', '발받침', 'Footrest', 'metal-brass', 'metal')],
  tags: ['saddle stool', 'bar stool', 'wooden stool', '새들 스툴', '바 스툴', '원목 스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = p.seat;
    const g = new THREE.SphereGeometry(0.2, k.seg(24, 10), k.seg(12, 5), 0, PI * 2, 0, PI / 2);
    g.scale(1, 0.18, 0.88);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setY(i, pos.getY(i) - 0.02 * (1 - (x / 0.2) ** 2) + 0.03 * (x / 0.2) ** 2); }
    g.computeVertexNormals();
    g.translate(0, sh - 0.02, 0);
    k.add('seat', p.wood, g);
    k.cyl('seat', p.wood, 0.2, 0.2, 0.02, 0, sh - 0.04, 0, { segs: k.seg(24, 10), scale: [1, 1, 0.88] });
    const at = splayLegs(k, 'legs', p.wood, 0.3, 0.3, sh - 0.04, { inset: 0.04, r: 0.018, rFoot: 0.013, splay: 0.06 });
    const y = 0.25, pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => { const [x, z] = at(sx, sz, y); return [x, y, z]; });
    k.tube('foot', p.foot, pts, 0.009, { closed: true, tension: 0 });
    return finish(k);
  },
});

const cafeMetal = mk({
  id: 'dining-chair-metal-cafe', category: 'dining', ko: '철제 카페 의자(톨릭스형)', en: 'Metal café chair',
  params: [P.mat('metal', '금속', 'Metal', 'paint-white-gloss', 'paint'), P.color('color', '색', 'Colour', '#2f4f6f')],
  tags: ['metal chair', 'cafe chair', 'industrial chair', 'tolix', '철제 의자', '카페 의자', '인더스트리얼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.45, o = { overrides: { color: p.color } };
    const leg = (sx, sz) => k.rod('metal', p.metal, [sx * 0.24, 0, sz * 0.24], [sx * 0.19, sh, sz * 0.19], 0.014, { ...o, r2: 0.016 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(sx, sz);
    k.box('metal', p.metal, 0.42, 0.015, 0.42, 0, sh, 0, { r: 0.004, ...o });
    for (const s of [-1, 1]) {
      k.box('metal', p.metal, 0.42, 0.04, 0.012, 0, sh - 0.02, s * 0.205, { r: 0.004, ...o });
      k.box('metal', p.metal, 0.012, 0.04, 0.42, s * 0.205, sh - 0.02, 0, { r: 0.004, ...o });
    }
    for (const s of [-1, 1]) k.rod('metal', p.metal, [s * 0.19, sh, -0.19], [s * 0.18, 0.84, -0.25], 0.012, o);
    k.box('metal', p.metal, 0.38, 0.17, 0.012, 0, 0.75, -0.235, { r: 0.004, rx: -0.15, ...o });
    for (const s of [-1, 1]) k.rod('metal', p.metal, [-0.21, 0.18, s * 0.21], [0.21, 0.18, s * 0.21], 0.006, o);
    return finish(k);
  },
});

const chiavari = mk({
  id: 'dining-chair-chiavari', category: 'dining', ko: '키아바리 연회 의자', en: 'Chiavari banquet chair',
  params: [WOOD('wood-white'), P.mat('fabric', '방석', 'Seat pad', 'fabric-cotton-white', 'fabric'), P.mat('accent', '포인트', 'Accent', 'metal-gold', 'metal')],
  tags: ['chiavari', 'banquet chair', 'wedding chair', '키아바리', '연회 의자', '웨딩 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.45;
    for (const sx of [-1, 1]) {
      k.rod('frame', p.wood, [sx * 0.19, 0, 0.19], [sx * 0.18, sh, 0.18], 0.013, { r2: 0.012 });
      k.rod('frame', p.wood, [sx * 0.17, 0, -0.21], [sx * 0.16, 0.92, -0.2], 0.013, { r2: 0.012 });
      for (const y of [0.2, 0.32]) k.rod('frame', p.wood, [sx * 0.185, y, 0.185], [sx * 0.165, y, -0.205], 0.007);
    }
    k.box('frame', p.wood, 0.4, 0.03, 0.4, 0, sh - 0.015, 0, { r: 0.006 });
    for (const y of [0.18, 0.32]) k.rod('frame', p.wood, [-0.185, y, 0.185], [0.185, y, 0.185], 0.007);
    for (const y of [0.56, 0.68, 0.8, 0.9]) k.rod('frame', p.wood, [-0.165, y, -0.2], [0.165, y, -0.2], y > 0.85 ? 0.014 : 0.007);
    for (let i = 0; i < 5; i++) k.sphere('accent', p.accent, 0.009, -0.12 + i * 0.06, 0.62, -0.2, { segs: 8, rings: 5 });
    k.soft('pad', p.fabric, 0.36, 0.035, 0.36, 0.014, 0, sh + 0.017, 0.0, { puff: 0.006 });
    return finish(k);
  },
});

const wingDining = mk({
  id: 'dining-chair-wingback', category: 'dining', ko: '윙백 다이닝 체어', en: 'Wingback dining chair',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-velvet-blue', 'fabric'), WOOD('wood-dark', '다리', 'Legs'), P.bool('nailheads', '징 장식', 'Nailhead trim', true)],
  tags: ['wingback chair', 'host chair', 'head chair', 'upholstered', '윙백 체어', '호스트 의자', '패브릭 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.48;
    splayLegs(k, 'legs', p.wood, 0.5, 0.5, sh - 0.08, { inset: 0.04, r: 0.02, rFoot: 0.013, splay: 0.015 });
    k.soft('fabric', p.fabric, 0.52, 0.1, 0.52, 0.03, 0, sh - 0.04, 0.01, { puff: 0.012 });
    k.soft('fabric', p.fabric, 0.52, 0.64, 0.09, 0.035, 0, sh + 0.31, -0.23, { puff: 0.012, rx: -0.08 });
    for (const s of [-1, 1]) k.soft('fabric', p.fabric, 0.07, 0.36, 0.2, 0.03, s * 0.25, sh + 0.42, -0.14, { puff: 0.008, ry: s * 0.4 });
    if (p.nailheads) for (let i = 0; i < 12; i++) k.sphere('nails', 'metal-brass', 0.005, -0.25 + i * (0.5 / 11), sh - 0.07, 0.272, { segs: 6, rings: 4 });
    return finish(k);
  },
});

const backBench = mk({
  id: 'dining-bench-backrest', category: 'dining', ko: '등받이 패브릭 식탁 벤치', en: 'Upholstered dining bench with back',
  params: [P.len('width', '폭', 'Width', 1.5, 1.0, 2.2), P.mat('fabric', '천', 'Fabric', 'fabric-linen-grey', 'fabric'), WOOD('wood-oak', '다리', 'Legs')],
  tags: ['dining bench', 'bench with back', 'settee', '식탁 벤치', '등받이 벤치', '패브릭 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.5, sh = 0.46;
    splayLegs(k, 'legs', p.wood, w, d, sh - 0.08, { inset: 0.05, r: 0.022, rFoot: 0.014, splay: 0.02 });
    k.box('legs', p.wood, w - 0.04, 0.05, d - 0.04, 0, sh - 0.105, 0, { r: 0.004 });
    k.soft('fabric', p.fabric, w, 0.1, d, 0.03, 0, sh - 0.04, 0, { puff: 0.012 });
    k.soft('fabric', p.fabric, w, 0.38, 0.08, 0.03, 0, sh + 0.24, -d / 2 + 0.02, { puff: 0.012, rx: -0.12 });
    for (const s of [-1, 1]) k.rod('legs', p.wood, [s * (w / 2 - 0.1), sh - 0.08, -d / 2 + 0.06], [s * (w / 2 - 0.1), sh + 0.08, -d / 2 + 0.04], 0.012);
    return finish(k);
  },
});

/* -------------------------------------------------------------- variants */

const V = [
  variant(set4, 'white', '화이트 4인 식탁 세트(금속 의자)', 'White 4-seat set, metal chairs', { wood: 'wood-white', chairStyle: 'metal', chairWood: 'wood-ash' }, { tags: ['white', '화이트'], seats: 4 }),
  variant(booth, 'velvet', '벨벳 부스 식탁', 'Velvet dining booth', { fabric: 'fabric-velvet-green', wood: 'wood-oak', top: 'wood-walnut' }, { tags: ['velvet', '벨벳'], seats: 4 }),
  variant(buffet, 'white', '화이트 뷔페장', 'White buffet', { body: 'paint-white-matte', front: 'wood-oak', handle: 'edge', legs: 'metal-black' }, { tags: ['white', '화이트'] }),
];

export const ITEMS = [
  set4, set6, set8, roundSet, booth, banquette, buffet, hutch, barCart, wineCabinet, chinaCabinet,
  gateleg, lowTable, concreteTable, counterTable, counterStool, saddleStool, cafeMetal, chiavari, wingDining, backBench,
  ...V,
];
