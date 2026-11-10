// More sofas (living): 5- and 6-seat straight sofas, extra 4-seat designs, L-shaped (ㄱ자) corner
// sectionals (left / right, 3+2, 4+2, 3+3), U-shaped sectionals, chaise-longue sectionals,
// modular sectional pieces (corner, armless, end, ottoman), console / theatre recliners, a
// pull-out sofa bed, a low floor modular sofa and a round conversation sofa.
//
// Sectionals use their own light "run" builder (seat modules: deck, back frame, seat and back
// cushions) so a U with nine seats stays inside the triangle budget. Straight sofas reuse the
// builders of living-sofas.js. Origin: bottom centre, back towards −z, front +z (re-centred).
import { THREE, Kit, P, T, clamp, pillowGeo, transformAdded } from './helpers.js';
import { upholstered, curved, recliner } from './living-sofas.js';
import { mk } from './appliances-more.js';
import { finish } from './kitchen.js';

const PI = Math.PI;

/* ------------------------------------------------------------ entries */

const seatTags = (n) => [`${n}인`, `${n}-seat`, `${n}인 소파`, 'sofa', '소파'];
const SECTIONAL_TAGS = ['sectional', 'corner sofa', 'sectional sofa', '코너 소파', '카우치', '소파'];

function sofaX({ id, ko, en, seats, tags = [], params, build }) {
  return mk({
    id, category: 'living', ko, en, ...(seats ? { seats } : {}), params,
    tags: [...new Set([...(seats ? seatTags(seats) : []), ...tags])],
    build: (p, ctx) => { const k = new Kit(ctx); build(k, p); return finish(k); },
  });
}

const pFab = (def = 'fabric-linen-grey', filter = 'fabric') => P.mat('fabric', filter === 'leather' ? '가죽' : '천', filter === 'leather' ? 'Leather' : 'Fabric', def, filter);
const pLeg = (def = 'wood-oak', filter = 'wood') => P.mat('legMat', filter === 'wood' ? '다리/받침 목재' : '다리 금속', filter === 'wood' ? 'Legs / base wood' : 'Leg metal', def, filter);
const pPillows = (def = 2, max = 6, mat = 'fabric-linen-white') => [P.int('pillows', '쿠션 수', 'Throw pillows', def, 0, max), P.mat('pillowFabric', '쿠션 천', 'Pillow fabric', mat, 'fabric')];
const pSeatW = (def = 0.78) => P.len('seatW', '좌석 폭', 'Seat width', def, 0.62, 0.95);
const pDepth = (def = 0.98, min = 0.86, max = 1.12) => P.len('depth', '깊이', 'Depth', def, min, max);
const BASE_OPTS = [['block', '블록 다리', 'Block feet'], ['plinth', '좌대', 'Plinth'], ['metal', '금속 다리', 'Metal legs'], ['floor', '바닥형', 'Floor']];
const pBase = (def = 'block') => P.pick('base', '받침', 'Base', def, BASE_OPTS);
const BACK_OPTS = [['loose', '등쿠션', 'Loose cushions'], ['pillow', '필로우', 'Pillow back'], ['tight', '일체형', 'Tight back']];
const pBack = (def = 'loose') => P.pick('back', '등받이', 'Back', def, BACK_OPTS);

/* ------------------------------------------------------ run builder */

const LEG = { block: 0.05, plinth: 0.07, metal: 0.15, floor: 0.0 };

/** Shared sectional options from params + fixed style. */
function opts(p, style = {}) {
  const base = p.base ?? style.base ?? 'block';
  return {
    d: p.depth ?? style.d ?? 0.98, sw: p.seatW ?? style.sw ?? 0.78, h: style.h ?? (base === 'floor' ? 0.66 : 0.8),
    seatH: style.seatH ?? (base === 'floor' ? 0.32 : 0.43), seatT: style.seatT ?? 0.15, backD: style.backD ?? 0.2,
    armW: style.armW ?? 0.16, armH: style.armH ?? (base === 'floor' ? 0.5 : 0.6), legH: LEG[base] ?? 0.05, base,
    back: p.back ?? style.back ?? 'loose', lean: style.lean ?? 0.16, fab: p.fabric, seatFab: style.seatFab ?? p.fabric,
    legMat: p.legMat ?? 'wood-black', bench: style.bench ?? false,
  };
}

/** Feet / plinth under a w × d footprint (local, centred). */
function feet(k, o, w, d) {
  if (o.legH <= 0.001) return;
  if (o.base === 'plinth') { k.box('legs', o.legMat, w - 0.1, o.legH, d - 0.1, 0, o.legH / 2, 0, { r: 0.004 }); return; }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - 0.06), z = sz * (d / 2 - 0.06);
    if (o.base === 'metal') k.cyl('legs', o.legMat, 0.013, 0.01, o.legH, x, 0, z, { segs: k.seg(12, 6) });
    else k.box('legs', o.legMat, 0.05, o.legH, 0.05, x, o.legH / 2, z, { r: 0.005 });
  }
}

const frameTopOf = (o) => (o.back === 'pillow' ? Math.min(o.h, o.seatH + 0.24) : o.back === 'loose' ? o.h - 0.1 : o.h);

/** Back cushion (loose / pillow) of width cw centred at (x, zb = front of the back frame), local. */
function backCushion(k, o, cw, x, zb) {
  if (o.back === 'loose') {
    const bt = 0.2, bh = o.h - o.seatH - 0.02;
    k.soft('cushions', o.seatFab, cw, bh, bt, 0.06, x, o.seatH + bh / 2 + 0.006, zb + bt / 2 + 0.004, { puff: 0.024, rx: -o.lean, flat: 3 });
  } else if (o.back === 'pillow') {
    const ph = Math.min(0.56, o.h - o.seatH + 0.06);
    const g = pillowGeo(cw * 0.98, ph, 0.22, k.seg(12, 5), { pinch: 0.04 });
    T(g, 0, 0, 0, -0.3, 0, 0);
    g.translate(x, o.seatH + ph / 2 - 0.01, zb + 0.07);
    k.add('cushions', o.seatFab, g);
  } else {
    const ph = o.h - o.seatH - 0.03;
    k.soft('cushions', o.seatFab, cw - 0.01, ph, 0.09, 0.04, x, o.seatH + ph / 2 - 0.01, zb + 0.035, { puff: 0.016, rx: -o.lean * 0.5, flat: 3 });
  }
}

/** Straight armless run of n seats, width w (local: centred, back at −d/2). backOn = false: ottoman / chaise end. */
function run(k, o, w, n, { backOn = true, len = o.d } = {}) {
  const d = len, deckTop = o.seatH - o.seatT, y0 = o.legH;
  feet(k, o, w, d);
  k.soft('upholstery', o.fab, w - 0.004, deckTop - y0, d - 0.008, 0.025, 0, (y0 + deckTop) / 2, 0, { flat: 3, puff: 0.003 });
  let zb = -d / 2;
  if (backOn) {
    const by0 = deckTop - 0.03, top = frameTopOf(o);
    k.soft('upholstery', o.fab, w - 0.004, top - by0, o.backD, 0.04, 0, by0 + (top - by0) / 2, -d / 2 + o.backD / 2 + 0.002, { flat: 3, puff: 0.004 });
    zb = -d / 2 + o.backD;
  }
  const m = o.bench ? 1 : n, cw = w / m;
  const zs0 = zb - 0.004, zs1 = d / 2 + 0.01;
  for (let i = 0; i < m; i++) {
    const cx = -w / 2 + cw * (i + 0.5);
    k.soft('cushions', o.seatFab, cw - (m > 1 ? 0.008 : 0.004), o.seatT + 0.005, zs1 - zs0, 0.05, cx, deckTop + o.seatT / 2 - 0.002, (zs0 + zs1) / 2, { puff: 0.014, sag: 0.005, flat: 3 });
  }
  if (backOn) for (let i = 0; i < n; i++) backCushion(k, o, w / n - 0.008, -w / 2 + (w / n) * (i + 0.5), zb);
}

/** Corner unit d × d (local, centred) with backs along −z and along the `side` (−1 left / +1 right) edge. */
function corner(k, o, side) {
  const d = o.d, deckTop = o.seatH - o.seatT, y0 = o.legH, by0 = deckTop - 0.03, top = frameTopOf(o), bd = o.backD;
  feet(k, o, d, d);
  k.soft('upholstery', o.fab, d - 0.004, deckTop - y0, d - 0.008, 0.025, 0, (y0 + deckTop) / 2, 0, { flat: 3, puff: 0.003 });
  k.soft('upholstery', o.fab, d - 0.004, top - by0, bd, 0.04, 0, by0 + (top - by0) / 2, -d / 2 + bd / 2 + 0.002, { flat: 3, puff: 0.004 });
  k.soft('upholstery', o.fab, bd, top - by0, d - bd - 0.004, 0.04, side * (d / 2 - bd / 2 - 0.002), by0 + (top - by0) / 2, bd / 2, { flat: 3, puff: 0.004 });
  // seat cushion inside the two backs
  const sw = d - bd, cx = -side * bd / 2;
  k.soft('cushions', o.seatFab, sw - 0.006, o.seatT + 0.005, sw + 0.006, 0.05, cx, deckTop + o.seatT / 2 - 0.002, bd / 2 + 0.003, { puff: 0.014, sag: 0.005, flat: 3 });
  // back cushions: one along each back (rotated for the side one)
  const zb = -d / 2 + bd;
  backCushion(k, o, sw - 0.01, cx, zb);
  transformAdded(k, () => backCushion(k, o, sw - 0.21, 0, 0), side * (d / 2 - bd), 0, bd / 2 + 0.105, side < 0 ? PI / 2 : -PI / 2);
}

/** Arm block (x × z footprint) centred at (x, z), from the deck base up to armH. */
function arm(k, o, x, z, wx, wz) {
  const y0 = o.legH, ah = o.armH - y0;
  k.soft('upholstery', o.fab, wx, ah, wz, 0.045, x, y0 + ah / 2, z, { flat: 3, puff: 0.008 });
  transformAdded(k, () => feet(k, o, wx, wz), x, 0, z);
}

/** Chaise end (width cw, length cl, local centred, back at −cl/2). */
function chaise(k, o, cw, cl) {
  const deckTop = o.seatH - o.seatT, y0 = o.legH, by0 = deckTop - 0.03, top = frameTopOf(o);
  feet(k, o, cw, cl);
  k.soft('upholstery', o.fab, cw - 0.004, deckTop - y0, cl - 0.008, 0.025, 0, (y0 + deckTop) / 2, 0, { flat: 3, puff: 0.003 });
  k.soft('upholstery', o.fab, cw - 0.004, top - by0, o.backD, 0.04, 0, by0 + (top - by0) / 2, -cl / 2 + o.backD / 2 + 0.002, { flat: 3, puff: 0.004 });
  const zb = -cl / 2 + o.backD, zs1 = cl / 2 + 0.01;
  k.soft('cushions', o.seatFab, cw - 0.006, o.seatT + 0.005, zs1 - zb, 0.05, 0, deckTop + o.seatT / 2 - 0.002, (zb + zs1) / 2, { puff: 0.014, sag: 0.006, flat: 4 });
  backCushion(k, o, cw - 0.01, 0, zb);
}

/** Throw pillows against the back of a run from x0 to x1 (back front at zb). */
function pillows(k, n, mat, x0, x1, o, zb) {
  if (!n) return;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = x0 + 0.25 + (x1 - x0 - 0.5) * t;
    const g = pillowGeo(0.44, 0.44, 0.13, k.seg(12, 5));
    T(g, 0, 0, 0, -0.32, (t - 0.5) * 0.5, 0);
    g.translate(x, o.seatH + 0.22, zb + (o.back === 'loose' ? 0.27 : 0.14));
    k.add('pillows', mat, g);
  }
}

/**
 * A sectional in plan: main run of `main` seats along the back (z = 0 back line), and per side
 * (left −x / right +x) one of: 'arm', 'none', { ret: n } (corner + return of n seats with an arm),
 * { chaise: length }.
 */
function sectional(k, p, o, { main, left = 'arm', right = 'arm' }) {
  const d = o.d, mw = main * o.sw;
  transformAdded(k, () => run(k, o, mw, main), 0, 0, d / 2);
  for (const [s, cfg] of [[-1, left], [1, right]]) {
    const edge = s * mw / 2;
    if (cfg === 'arm') arm(k, o, edge + s * o.armW / 2, d / 2, o.armW, d);
    else if (cfg?.ret) {
      transformAdded(k, () => corner(k, o, s), edge + s * d / 2, 0, d / 2);
      const L = cfg.ret * o.sw;
      transformAdded(k, () => run(k, o, L, cfg.ret), edge + s * d / 2, 0, d + L / 2, s < 0 ? PI / 2 : -PI / 2);
      if (cfg.arm !== false) arm(k, o, edge + s * d / 2, d + L + o.armW / 2, d, o.armW);
    } else if (cfg?.chaise) {
      const cw = o.sw + 0.12, cl = cfg.chaise;
      transformAdded(k, () => chaise(k, o, cw, cl), edge + s * cw / 2, 0, cl / 2);
      if (cfg.arm) arm(k, o, edge + s * (cw + o.armW / 2), cl / 2, o.armW, cl);
    }
  }
  pillows(k, p.pillows ?? 0, p.pillowFabric ?? 'fabric-linen-white', -mw / 2, mw / 2, o, o.backD);
}

const SECT_PARAMS = (fab = 'fabric-linen-grey', leg = 'wood-black', base = 'block', back = 'loose', pil = 2, depth = 0.98) => [
  pSeatW(), pDepth(depth), pFab(fab), pLeg(leg), pBase(base), pBack(back), ...pPillows(pil, 6),
];

/* ------------------------------------------------ L-shaped sectionals */

const SIDE = { left: ['왼쪽 코너', 'left-hand corner', '좌측', 'left'], right: ['오른쪽 코너', 'right-hand corner', '우측', 'right'] };

/** ㄱ자 sectional a+b: a seats on the long side (the corner counts as one), b seats on the return. */
function lSofa(a, b, side, { fab, leg = 'wood-black', base = 'block', back = 'loose', pil = 2, style = {}, extraTags = [], koName, enName }) {
  const [sk, se, sk2, se2] = SIDE[side];
  const ret = { ret: b };
  return sofaX({
    id: `sectional-l-${a}x${b}-${side}`, seats: a + b,
    ko: `${koName ?? 'ㄱ자 코너 소파'} ${a}+${b} (${sk})`, en: `${enName ?? 'L-shaped sectional'} ${a}+${b} (${se})`,
    tags: [...SECTIONAL_TAGS, 'L-shaped sofa', 'ㄱ자 소파', 'L자 소파', `${a}+${b}`, sk2, se2, ...extraTags],
    params: SECT_PARAMS(fab, leg, base, back, pil),
    build: (k, p) => {
      const o = opts(p, style);
      sectional(k, p, o, side === 'left' ? { main: a - 1, left: ret, right: 'arm' } : { main: a - 1, left: 'arm', right: ret });
    },
  });
}

const L = [
  lSofa(3, 2, 'left', { fab: 'fabric-linen-grey' }),
  lSofa(3, 2, 'right', { fab: 'fabric-linen-beige', leg: 'wood-oak' }),
  lSofa(4, 2, 'left', { fab: 'fabric-wool-charcoal', base: 'metal', leg: 'metal-black', back: 'tight', style: { h: 0.78, lean: 0.12 }, koName: 'ㄱ자 모던 코너 소파', enName: 'Modern L-shaped sectional', extraTags: ['modern', '모던'] }),
  lSofa(4, 2, 'right', { fab: 'fabric-boucle', base: 'plinth', leg: 'wood-oak', back: 'pillow', pil: 3, style: { h: 0.74, seatH: 0.42, seatT: 0.17 }, koName: 'ㄱ자 필로우백 코너 소파', enName: 'Pillow-back L-shaped sectional', extraTags: ['pillow back', '필로우백', 'boucle', '부클레'] }),
  lSofa(3, 3, 'left', { fab: 'fabric-cotton-grey', base: 'plinth', leg: 'wood-dark', pil: 3, koName: 'ㄱ자 대형 코너 소파', enName: 'Large L-shaped sectional' }),
  lSofa(3, 3, 'right', { fab: 'leather-cognac', base: 'metal', leg: 'metal-chrome', back: 'tight', pil: 0, style: { lean: 0.1 }, koName: 'ㄱ자 가죽 코너 소파', enName: 'Leather L-shaped sectional', extraTags: ['leather', '가죽'] }),
];

/* ------------------------------------------------ U-shaped sectionals */

const U = [
  sofaX({
    id: 'sectional-u-2x3x2', seats: 9, ko: 'U자 대형 소파 (2+3+2)', en: 'U-shaped sectional (2+3+2)',
    tags: [...SECTIONAL_TAGS, 'U-shaped sofa', 'U자 소파', 'horseshoe', '9인', '9-seat', 'large family sofa'],
    params: SECT_PARAMS('fabric-linen-beige', 'wood-oak', 'plinth', 'loose', 3),
    build: (k, p) => sectional(k, p, opts(p, { bench: true }), { main: 3, left: { ret: 2 }, right: { ret: 2 } }),
  }),
  sofaX({
    id: 'sectional-u-1x2x1', seats: 6, ko: 'U자 소형 소파 (1+2+1)', en: 'Compact U-shaped sectional (1+2+1)',
    tags: [...SECTIONAL_TAGS, 'U-shaped sofa', 'U자 소파', 'compact', '소형', '6인', '6-seat'],
    params: SECT_PARAMS('fabric-velvet-green', 'metal-brass', 'metal', 'tight', 2, 0.92),
    build: (k, p) => sectional(k, p, opts(p, { lean: 0.1, h: 0.78 }), { main: 2, left: { ret: 1 }, right: { ret: 1 } }),
  }),
  sofaX({
    id: 'sectional-u-chaise', seats: 7, ko: 'U자 카우치 소파 (코너+카우치)', en: 'U-shaped sectional with chaise',
    tags: [...SECTIONAL_TAGS, 'U-shaped sofa', 'U자 소파', 'chaise', '카우치', '7인', '7-seat'],
    params: SECT_PARAMS('fabric-cotton-grey', 'wood-black', 'block', 'pillow', 2),
    build: (k, p) => sectional(k, p, opts(p, { h: 0.74, seatT: 0.17 }), { main: 3, left: { ret: 2 }, right: { chaise: 1.6 } }),
  }),
];

/* ------------------------------------------------ chaise sectionals */

function chaiseSofa(n, side, { fab, leg = 'wood-oak', base = 'block', back = 'loose', armChaise = true, style = {}, koName = '카우치 소파', enName = 'sofa with chaise', tags = [] }) {
  const [sk, se, sk2, se2] = SIDE[side];
  const ck = side === 'left' ? '왼쪽 카우치' : '오른쪽 카우치', ce = side === 'left' ? 'left chaise' : 'right chaise';
  return sofaX({
    id: `sofa${n + 1}-chaise-${side}`, seats: n + 1,
    ko: `${n + 1}인 ${koName} (${ck})`, en: `${n + 1}-seat ${enName} (${ce})`,
    tags: [...SECTIONAL_TAGS, 'chaise longue', 'chaise sectional', '카우치 소파', '셰이즈', sk2, se2, ...tags],
    params: [...SECT_PARAMS(fab, leg, base, back, 2), P.len('chaiseL', '카우치 길이', 'Chaise length', 1.6, 1.3, 1.9)],
    build: (k, p) => {
      const o = opts(p, style), c = { chaise: p.chaiseL, arm: armChaise };
      sectional(k, p, o, side === 'left' ? { main: n, left: c, right: 'arm' } : { main: n, left: 'arm', right: c });
    },
  });
}
void SIDE;

const C = [
  chaiseSofa(2, 'left', { fab: 'fabric-linen-white', leg: 'wood-oak', koName: '카우치 소파', enName: 'compact sofa with chaise' }),
  chaiseSofa(3, 'left', { fab: 'fabric-linen-grey', leg: 'wood-black' }),
  chaiseSofa(3, 'right', { fab: 'fabric-navy', base: 'metal', leg: 'metal-black', back: 'tight', style: { lean: 0.12 }, koName: '모던 카우치 소파', enName: 'modern sofa with chaise', tags: ['modern', '모던'] }),
  chaiseSofa(4, 'right', { fab: 'fabric-boucle', base: 'plinth', leg: 'wood-walnut', back: 'pillow', armChaise: false, style: { h: 0.74, seatT: 0.17 }, koName: '와이드 카우치 소파', enName: 'wide sofa with chaise', tags: ['wide', '와이드'] }),
];

/* ------------------------------------------------ modular pieces */

const MOD_TAGS = ['modular sofa', 'module', '모듈 소파', '조합형', 'sectional piece', '소파 유닛'];
const modParams = () => [pSeatW(0.9), pDepth(0.98), pFab('fabric-linen-grey'), pLeg('wood-black'), pBase('block'), pBack('loose')];
const M = [
  sofaX({
    id: 'sofa-module-armless', ko: '모듈 소파 암리스 유닛', en: 'Modular sofa armless unit', tags: [...MOD_TAGS, 'armless', '팔걸이 없는'],
    params: modParams(), build: (k, p) => { const o = opts(p); run(k, o, o.sw, 1); },
  }),
  sofaX({
    id: 'sofa-module-corner', ko: '모듈 소파 코너 유닛', en: 'Modular sofa corner unit', tags: [...MOD_TAGS, 'corner', '코너'],
    params: [...modParams().filter((q) => q.key !== 'seatW'), P.pick('side', '등받이 방향', 'Side back', 'left', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']])],
    build: (k, p) => corner(k, opts(p), p.side === 'right' ? 1 : -1),
  }),
  sofaX({
    id: 'sofa-module-end', ko: '모듈 소파 엔드 유닛 (팔걸이)', en: 'Modular sofa end unit with arm', tags: [...MOD_TAGS, 'end unit', '엔드', 'arm', '팔걸이'],
    params: [...modParams(), P.pick('side', '팔걸이 방향', 'Arm side', 'left', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']])],
    build: (k, p) => { const o = opts(p), s = p.side === 'right' ? 1 : -1; run(k, o, o.sw, 1); arm(k, o, s * (o.sw / 2 + o.armW / 2), 0, o.armW, o.d); },
  }),
  sofaX({
    id: 'sofa-module-ottoman', ko: '모듈 소파 오토만 유닛', en: 'Modular sofa ottoman unit', tags: [...MOD_TAGS, 'ottoman', '오토만', 'footstool', '발받침'],
    params: [pSeatW(0.9), pDepth(0.9, 0.6, 1.1), pFab('fabric-linen-grey'), pLeg('wood-black'), pBase('block')],
    build: (k, p) => { const o = opts(p); run(k, o, o.sw, 1, { backOn: false }); },
  }),
  sofaX({
    id: 'sofa-module-chaise', ko: '모듈 소파 카우치 유닛', en: 'Modular sofa chaise unit', tags: [...MOD_TAGS, 'chaise', '카우치', 'lounger'],
    params: [pSeatW(0.9), P.len('chaiseL', '길이', 'Length', 1.6, 1.3, 1.9), pFab('fabric-linen-grey'), pLeg('wood-black'), pBase('block'), pBack('loose')],
    build: (k, p) => { const o = opts(p); chaise(k, o, o.sw, p.chaiseL); },
  }),
];

/* ------------------------------------------------ straight sofas */

function straight({ id, ko, en, seats, tags, style, width, depth, fabric, fabFilter = 'fabric', legMat, legFilter = 'wood', pillows: pil, extra = [], map }) {
  return sofaX({
    id, ko, en, seats, tags,
    params: [
      P.len('width', '폭', 'Width', ...width), P.len('depth', '깊이', 'Depth', ...depth), pFab(fabric, fabFilter),
      ...(legMat ? [pLeg(legMat, legFilter)] : []), ...(pil ? pPillows(pil[0], pil[1], pil[2]) : []), ...extra,
    ],
    build: (k, p) => upholstered(k, { seats, ...style, w: p.width, d: p.depth, fabric: p.fabric, legMat: p.legMat ?? style.legMat, pillows: p.pillows ?? 0, pillowMat: p.pillowFabric, ...(map ? map(p) : {}) }),
  });
}

const S = [
  straight({
    id: 'sofa5-track', ko: '5인 트랙암 대형 소파', en: '5-seat track-arm sofa', seats: 5, tags: ['track arm', '트랙암', 'large sofa', '대형 소파', 'family', '패밀리'],
    style: { h: 0.84, seatH: 0.44, arm: 'track', armW: 0.15, armH: 0.6, back: 'loose', backD: 0.18, base: 'block', cushion: 'split', nBack: 5 },
    width: [3.5, 3.1, 3.9], depth: [0.98, 0.88, 1.08], fabric: 'fabric-linen-grey', legMat: 'wood-black', pillows: [2, 4, 'fabric-linen-white'],
  }),
  straight({
    id: 'sofa5-chesterfield', ko: '5인 체스터필드 소파', en: '5-seat chesterfield sofa', seats: 5, tags: ['chesterfield', '체스터필드', 'tufted', '버튼 터프팅', 'leather', '가죽', 'large sofa'],
    style: { h: 0.76, seatH: 0.45, arm: 'roll', armW: 0.23, armH: 0.76, back: 'tufted', backD: 0.2, base: 'bun', cushion: 'split', nSeat: 4, tuftArms: true },
    width: [3.4, 3.0, 3.8], depth: [0.96, 0.88, 1.04], fabric: 'leather-black', fabFilter: 'leather', legMat: 'wood-dark',
  }),
  straight({
    id: 'sofa6-modular', ko: '6인 모듈 대형 소파', en: '6-seat modular sofa', seats: 6, tags: ['modular', '모듈', 'extra large', '초대형', 'low', '로우', 'family'],
    style: { h: 0.72, seatH: 0.41, seatT: 0.16, arm: 'track', armW: 0.2, armH: 0.56, back: 'loose', backCushT: 0.22, backD: 0.2, base: 'block', legH: 0.03, cushion: 'split', modular: true, nBack: 6 },
    width: [4.2, 3.8, 4.8], depth: [1.04, 0.94, 1.12], fabric: 'fabric-cotton-grey', legMat: 'wood-black', pillows: [3, 6, 'fabric-mustard'],
  }),
  straight({
    id: 'sofa6-bench', ko: '6인 벤치 쿠션 패밀리 소파', en: '6-seat bench-cushion family sofa', seats: 6, tags: ['bench cushion', '벤치 쿠션', 'extra large', '초대형', 'family', '패밀리'],
    style: { h: 0.86, seatH: 0.45, arm: 'round', armW: 0.18, armH: 0.6, back: 'loose', backD: 0.18, base: 'tapered', cushion: 'bench', nBack: 4, lean: 0.16 },
    width: [4.0, 3.6, 4.6], depth: [0.98, 0.9, 1.06], fabric: 'fabric-linen-beige', legMat: 'wood-walnut', pillows: [4, 6, 'fabric-terracotta'],
  }),
  straight({
    id: 'sofa4-slope-leather', ko: '4인 가죽 슬로프암 소파', en: '4-seat leather slope-arm sofa', seats: 4, tags: ['leather', '가죽', 'slope arm', '경사 팔걸이', 'hairpin', '헤어핀'],
    style: { h: 0.78, seatH: 0.43, arm: 'slope', armW: 0.12, armH: 0.58, back: 'tight', backD: 0.16, base: 'hairpin', cushion: 'split', lean: 0.1 },
    width: [2.7, 2.4, 3.0], depth: [0.9, 0.82, 0.98], fabric: 'leather-cognac', fabFilter: 'leather', legMat: 'metal-black', legFilter: 'metal',
  }),
  straight({
    id: 'sofa4-tufted-bench', ko: '4인 버튼 시트 벤치 소파', en: '4-seat tufted bench-seat sofa', seats: 4, tags: ['tufted', '버튼', 'bench seat', '벤치 시트', 'velvet', '벨벳', 'glam'],
    style: { h: 0.8, seatH: 0.45, arm: 'flare', armW: 0.16, armH: 0.64, back: 'tufted', backD: 0.17, base: 'metal', cushion: 'tight', tuftSeat: true, buttonMat: 'metal-brass' },
    width: [2.6, 2.3, 2.9], depth: [0.9, 0.82, 0.98], fabric: 'fabric-velvet-blue', legMat: 'metal-brass', legFilter: 'metal',
  }),
  straight({
    id: 'sofa3-floor-modular', ko: '3인 좌식 모듈 소파', en: '3-seat floor modular sofa', seats: 3, tags: ['floor sofa', '좌식 소파', 'low sofa', '저상', 'modular', '모듈', 'pillow back'],
    style: { h: 0.6, seatH: 0.3, seatT: 0.16, arm: 'none', back: 'pillow', backD: 0.16, base: 'floor', cushion: 'split', modular: true },
    width: [2.4, 2.0, 2.8], depth: [0.92, 0.82, 1.02], fabric: 'fabric-linen-white', pillows: [2, 4, 'fabric-mustard'],
  }),
];

/* ------------------------------------------------ special builders */

/** Pull-out sofa bed: a 3-seat track-arm sofa; open = a mattress on a folding frame pulled out. */
const pullout = sofaX({
  id: 'sofa3-pullout-bed', seats: 3, ko: '3인 풀아웃 소파베드', en: '3-seat pull-out sofa bed',
  tags: ['sofa bed', '소파베드', 'pull out', '풀아웃', 'guest bed', '손님용 침대'],
  params: [P.len('width', '폭', 'Width', 2.1, 1.9, 2.4), pDepth(0.95, 0.88, 1.02), pFab('fabric-cotton-grey'), pLeg('wood-dark'), P.bool('open', '침대로 펼침', 'Pulled out as bed', false)],
  build: (k, p) => {
    const w = p.width, d = p.depth, armW = 0.16;
    upholstered(k, { seats: 3, w, d, fabric: p.fabric, legMat: p.legMat, h: 0.84, seatH: 0.45, arm: 'track', armW, armH: 0.62, back: 'loose', backD: 0.18, base: 'block', cushion: p.open ? 'tight' : 'split' });
    if (p.open) {
      const mw = w - 2 * armW - 0.06, ml = 1.85, z0 = d / 2 - 0.25, mz = z0 + ml / 2;
      k.soft('bedding', 'fabric-linen-white', mw, 0.11, ml, 0.035, 0, 0.36, mz, { puff: 0.008, flat: 3 });
      for (const zz of [z0 + 0.7, z0 + ml - 0.08]) {
        k.rod('frame', 'metal-black', [-mw / 2 + 0.03, 0.3, zz], [mw / 2 - 0.03, 0.3, zz], 0.01);
        for (const s of [-1, 1]) k.rod('frame', 'metal-black', [s * (mw / 2 - 0.05), 0.3, zz], [s * (mw / 2 - 0.05), 0.0, zz + 0.05], 0.01);
      }
      for (const s of [-1, 1]) k.rod('frame', 'metal-black', [s * (mw / 2 - 0.03), 0.3, z0], [s * (mw / 2 - 0.03), 0.3, z0 + ml - 0.05], 0.01);
      const g = pillowGeo(0.6, 0.4, 0.13, k.seg(12, 5));
      T(g, 0, 0, 0, -PI / 2 + 0.1, 0, 0);
      g.translate(0, 0.47, z0 + 0.3);
      k.add('bedding', 'fabric-linen-white', g);
    }
  },
});

/** Two 1-seat recliners with a storage console (cup holders) between them. */
const reclConsole = sofaX({
  id: 'sofa2-recliner-console', seats: 2, ko: '2인 콘솔 리클라이너 소파', en: '2-seat recliner sofa with console',
  tags: ['recliner', '리클라이너', 'console', '콘솔', 'cup holder', '컵홀더', 'home theater', '홈시어터'],
  params: [pDepth(0.98, 0.9, 1.05), pFab('leather-black', 'leather'), P.bool('open', '발받침 펼침', 'Footrests raised', false)],
  build: (k, p) => {
    const d = p.depth, sw = 0.88, cw = 0.32;
    for (const s of [-1, 1]) transformAdded(k, () => recliner(k, { w: sw, d, seats: 1, fabric: p.fabric, open: p.open, armW: 0.16 }), s * (cw / 2 + sw / 2 - 0.02), 0, 0);
    k.soft('upholstery', p.fabric, cw, 0.56, d - 0.02, 0.04, 0, 0.045 + 0.28, 0, { flat: 3, puff: 0.006 });
    k.soft('cushions', p.fabric, cw + 0.01, 0.07, d * 0.9, 0.03, 0, 0.64, d * 0.04, { flat: 3, puff: 0.012 });
    for (const s of [-1, 1]) {
      k.cyl('cups', 'metal-chrome', 0.042, 0.042, 0.012, s * 0.075, 0.67, d / 2 - 0.15, { segs: k.seg(20, 8) });
      k.cyl('cups', 'plastic-black', 0.034, 0.034, 0.013, s * 0.075, 0.6705, d / 2 - 0.15, { segs: k.seg(20, 8) });
    }
    k.box('legs', 'plastic-black', cw - 0.04, 0.045, d - 0.08, 0, 0.0225, 0, { r: 0.004 });
  },
});

/** 3-seat theatre recliner with cup holders in the arms. */
const theater = sofaX({
  id: 'sofa3-theater-recliner', seats: 3, ko: '3인 홈시어터 리클라이너 (컵홀더)', en: '3-seat home theatre recliner',
  tags: ['recliner', '리클라이너', 'home theater', '홈시어터', 'cup holder', '컵홀더', 'cinema', '영화'],
  params: [P.len('width', '폭', 'Width', 2.7, 2.5, 3.0), pDepth(1.0, 0.92, 1.08), pFab('leather-brown', 'leather'), P.bool('open', '발받침 펼침', 'Footrests raised', true)],
  build: (k, p) => {
    const w = p.width, d = p.depth, armW = 0.22, armH = 0.64;
    recliner(k, { w, d, seats: 3, fabric: p.fabric, open: p.open, armW, armH, h: 1.04 });
    for (const s of [-1, 1]) for (const dz of [0.12, 0.28]) {
      k.cyl('cups', 'metal-chrome', 0.04, 0.04, 0.012, s * (w / 2 - armW / 2), armH - 0.002, d / 2 - dz, { segs: k.seg(20, 8) });
      k.cyl('cups', 'plastic-black', 0.032, 0.032, 0.013, s * (w / 2 - armW / 2), armH - 0.0015, d / 2 - dz, { segs: k.seg(20, 8) });
    }
  },
});

/** Round conversation sofa: a deep arc of seats around a centre (curved builder, phi > 90°). */
const round = sofaX({
  id: 'sofa5-round', seats: 5, ko: '5인 원형 대화 소파 (반원)', en: '5-seat round conversation sofa',
  tags: ['round sofa', '원형 소파', 'curved', '곡선', 'conversation pit', '대화형', 'circle'],
  params: [P.len('radius', '반지름', 'Radius', 1.35, 1.1, 1.7), pFab('fabric-velvet-rose'), pLeg('wood-walnut'), P.num('arc', '원호(°)', 'Arc (°)', 220, 160, 260, 5)],
  build: (k, p) => curved(k, { seats: 5, R: p.radius, phi: (p.arc / 2) * (PI / 180), h: 0.74, seatH: 0.42, bt: 0.2, b: 0.86, base: 'plinth', fabric: p.fabric, legMat: p.legMat, backPillows: 5 }),
});

/** Serpentine (S-curve) sofa: two opposite arcs joined — seating on both sides. */
const serpentine = sofaX({
  id: 'sofa6-serpentine', seats: 6, ko: '6인 S자 곡선 소파', en: '6-seat serpentine sofa',
  tags: ['serpentine', 'S자 소파', 'curved', '곡선', 'lobby', '로비', 'wave'],
  params: [P.len('width', '폭(한쪽 원호)', 'Arc width (each)', 2.2, 1.8, 2.6), pFab('fabric-boucle'), pLeg('wood-oak')],
  build: (k, p) => {
    const o = { seats: 3, w: p.width, sag: 0.4, h: 0.72, seatH: 0.42, bt: 0.18, b: 0.84, base: 'plinth', fabric: p.fabric, legMat: p.legMat };
    // arcs: chord p.width, centre of the arc at z = 0 → move each so the ends meet in the middle
    const c = p.width, s = 0.4, phi = 2 * Math.atan((2 * s) / c), R = c / 2 / Math.sin(phi);
    const zEnd = -R * Math.cos(phi);
    transformAdded(k, () => curved(k, o), -c / 2, 0, -zEnd, 0);
    transformAdded(k, () => curved(k, o), c / 2, 0, zEnd, PI);
  },
});
void clamp; void THREE;

export const ITEMS = [...S, ...L, ...U, ...C, ...M, pullout, reclConsole, theater, round, serpentine];
