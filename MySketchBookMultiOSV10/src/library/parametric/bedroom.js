// Bedroom: beds with bedding, nightstand, wardrobe, dresser, vanity, bed-end bench.
import { THREE, Kit, item, P, OPT, clamp, rng, shellGeo, pillowGeo, addCabinet, addHandle, roundRect, ellipse, frameShape, T } from './helpers.js';
import { splayLegs, recentre } from './dining.js';

/**
 * Cloth draped over a box top (like helpers.drapeGeo) but the corners hang like real
 * fabric: a corner point drops by the larger of its two overhangs, not their sum, so a
 * duvet corner never dives to the floor. Flat over w × l, rolls over radius r, hangs `drop`.
 */
export function clothGeo({ w, l, top, drop = 0.22, r = 0.05, thick = 0.04, folds = 0.014, foldPitch = 0.24, nu = 40, nv = 40, sides = { left: true, right: true, foot: true }, puffy = 0.01, seed = 3 }) {
  const dl = sides.left ? drop : 0, dr = sides.right ? drop : 0, df = sides.foot ? drop : 0;
  const quarter = (Math.PI / 2) * r;
  const bend = (s) => {
    if (s <= 0) return [0, 0];
    if (s < quarter) { const a = s / r; return [r * Math.sin(a), r * (1 - Math.cos(a))]; }
    return [r, r + (s - quarter)];
  };
  const rand = rng(seed);
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  return shellGeo(nu, nv, (u, v) => {
    // denser sampling near the rolled edges: ease u, v towards the borders
    const cx = -w / 2 - dl + u * (w + dl + dr);
    const cz = -l / 2 + v * (l + df);
    const ox = cx > w / 2 ? cx - w / 2 : cx < -w / 2 ? -w / 2 - cx : 0;
    const oz = cz > l / 2 ? cz - l / 2 : 0;
    let [bx, dx] = bend(ox), [bz, dz] = bend(oz);
    if (ox > 0 && oz > 0) {
      // corner: the cloth falls radially around a rounded corner and droops a little lower
      const s = Math.hypot(ox, oz), [b, dd] = bend(Math.min(s, drop * 1.12));
      bx = (b * ox) / s; bz = (b * oz) / s; dx = dd; dz = 0;
    }
    let X = clamp(cx, -w / 2, w / 2) + (cx < 0 ? -bx : bx);
    let Z = Math.min(cz, l / 2) + bz;
    let Y = top + thick - Math.max(dx, dz);
    if (ox === 0 && oz === 0) Y += puffy * (0.5 + 0.5 * Math.sin(cx * 9 + ph[0]) * Math.sin(cz * 7 + ph[1]));
    const hx = Math.max(0, dx - r) / Math.max(drop, 1e-3), hz = Math.max(0, dz - r) / Math.max(drop, 1e-3);
    if (hx > 0) X += Math.sign(cx) * folds * hx * (0.5 + 0.5 * Math.sin((cz / foldPitch) * Math.PI * 2 + ph[2]));
    if (hz > 0) Z += folds * hz * (0.5 + 0.5 * Math.sin((cx / foldPitch) * Math.PI * 2 + ph[0]));
    return [X, Y, Z];
  }, thick);
}

/* ------------------------------------------------------------------- bed */

const BED_SIZES = {
  single: [1.0, 2.0], supersingle: [1.1, 2.0], queen: [1.5, 2.0], king: [1.6, 2.0], largeking: [1.8, 2.0], usqueen: [1.52, 2.03], usking: [1.93, 2.03],
};

/** Bed frame + mattress + bedding. Mattress centred in x; head at −z. Returns the mattress top y. */
export function buildBed(k, p, { mw, ml, frameMat, headboard, legsMat = 'wood-oak', legH = 0.1, hbH = 1.05, margin = 0.035, hb = 0.09 }) {
  const W = mw + 2 * margin, L = ml + margin + hb;
  const zHead = -L / 2 + hb, zFoot = L / 2 - margin;
  const mz = (zHead + zFoot) / 2;
  const frameTop = 0.32, mattH = 0.24;
  // upholstered (or wood) platform frame on short legs
  const fh = frameTop - legH;
  const upholstered = headboard === 'upholstered';
  const frameFab = upholstered ? p.frameFabric : frameMat;
  if (upholstered) k.soft('frame', frameFab, W, fh, L - hb + 0.01, 0.03, 0, legH + fh / 2, (zHead + L / 2) / 2 - 0.005, { puff: 0.004 });
  else k.box('frame', frameFab, W, fh, L - hb + 0.01, 0, legH + fh / 2, (zHead + L / 2) / 2 - 0.005, { r: 0.006, segs: 2 });
  splayLegs(k, 'legs', legsMat, W - 0.06, L - hb - 0.06, legH, { inset: 0.04, r: 0.022, rFoot: 0.016, splay: 0.0 });
  if (W > 1.3) k.cyl('legs', legsMat, 0.022, 0.018, legH, 0, 0, mz, { segs: k.seg(12, 6) });
  // headboard
  const hz = -L / 2 + hb / 2;
  if (upholstered) {
    // vertical channel tufting: soft tubes side by side on a slim base board
    const n = Math.max(4, Math.round(W / 0.2));
    const cw = W / n;
    for (let i = 0; i < n; i++) k.soft('headboard', frameFab, cw + 0.002, hbH - legH - 0.02, hb, Math.min(cw / 2.2, 0.06), -W / 2 + cw * (i + 0.5), legH + 0.02 + (hbH - legH - 0.02) / 2, hz, { puff: 0.012, flat: 3 });
  } else if (headboard === 'slat') {
    const n = Math.max(6, Math.round(W / 0.09));
    k.box('headboard', frameMat, W, 0.05, hb, 0, hbH - 0.025, hz, { r: 0.008, segs: 2 });
    k.box('headboard', frameMat, W, 0.05, hb * 0.7, 0, frameTop + 0.05, hz, { r: 0.006 });
    for (let i = 0; i < n; i++) k.box('headboard', frameMat, (W / n) * 0.55, hbH - frameTop - 0.1, 0.03, -W / 2 + (W / n) * (i + 0.5), (hbH + frameTop) / 2, hz, { r: 0.006 });
    for (const s of [-1, 1]) k.box('headboard', frameMat, 0.06, hbH, hb, s * (W / 2 - 0.03), hbH / 2, hz, { r: 0.008, segs: 2 });
  } else {
    // solid wood board with a softened top edge on two legs
    k.box('headboard', frameMat, W, hbH - 0.12, 0.045, 0, 0.12 + (hbH - 0.12) / 2, hz - hb / 2 + 0.03, { r: 0.012, segs: 2 });
    k.box('headboard', frameMat, W + 0.02, 0.035, hb, 0, hbH - 0.0175, hz, { r: 0.012, segs: 2 });
    for (const s of [-1, 1]) k.box('headboard', frameMat, 0.06, 0.13, hb * 0.8, s * (W / 2 - 0.04), 0.065, hz, { r: 0.006 });
  }
  // mattress (slightly sunk into the frame)
  const my = frameTop - 0.02;
  k.soft('mattress', 'fabric-linen-white', mw - 0.01, mattH, ml - 0.01, 0.05, 0, my + mattH / 2, mz, { puff: 0.01 });
  const mTop = my + mattH;
  if (p.bedding) {
    // duvet: starts ~0.45 m from the head, folded back, hangs over the sides and foot
    const covered = ml - 0.45;
    const duvetThick = 0.045;
    const duvet = clothGeo({ w: mw, l: covered, top: mTop - 0.012, drop: 0.2, r: 0.06, thick: duvetThick, nu: k.seg(44, 14), nv: k.seg(40, 12), seed: mw * 7 });
    duvet.translate(0, 0, zFoot - 0.005 - covered / 2);
    k.add('bedding', p.beddingFabric, duvet);
    // turned-down top edge
    const band = clothGeo({ w: mw + 0.02, l: 0.26, top: mTop - 0.012 + duvetThick, drop: 0.17, r: 0.09, thick: 0.02, nu: k.seg(36, 10), nv: k.seg(6, 3), sides: { left: true, right: true, foot: false }, folds: 0.006, seed: 2 });
    band.translate(0, 0, zFoot - covered + 0.13);
    k.add('bedding', p.beddingFabric, band);
    // folded throw across the foot
    if (p.throw) {
      const tw = clothGeo({ w: mw, l: 0.45, top: mTop + duvetThick + 0.002, drop: 0.24, r: 0.08, thick: 0.014, nu: k.seg(40, 12), nv: k.seg(10, 4), sides: { left: true, right: true, foot: false }, folds: 0.01, puffy: 0.004, seed: 5 });
      tw.translate(0, 0, zFoot - 0.32);
      k.add('throw', p.throwFabric, tw);
    }
  }
  // pillows lean against the headboard
  const n = p.pillows;
  const pw = Math.min(0.7, (mw - 0.08) / Math.max(1, n));
  for (let i = 0; i < n; i++) {
    const g = pillowGeo(pw - 0.03, 0.48, 0.16, k.seg(16, 6));
    T(g, 0, 0, 0, -Math.PI / 2 + 0.55, 0, (i - (n - 1) / 2) * 0.03);
    g.translate(-mw / 2 + 0.04 + pw * (i + 0.5) + (mw - 0.08 - pw * n) / 2, mTop + 0.1, zHead + 0.25);
    k.add('pillows', p.beddingFabric, g);
  }
  if (n > 0 && p.bedding && mw >= 1.3) {
    const g = pillowGeo(0.5, 0.32, 0.12, k.seg(14, 5));
    T(g, 0, 0, 0, -0.5, 0, 0);
    g.translate(0, mTop + 0.2, zHead + 0.43);
    k.add('cushion', p.throwFabric, g);
  }
  return mTop;
}

const bed = item({
  id: 'bed', category: 'bedroom', ko: '침대', en: 'Bed', size: [1.68, 1.05, 2.13],
  // Real footprint for the chosen mattress (frame adds 0.18 m in width, 0.13 m in length).
  sizeOf: (p) => { const [w, l] = BED_SIZES[p?.bedSize] ?? BED_SIZES.queen; return [w + 0.18, 1.05, l + 0.13]; },
  params: [
    P.pick('bedSize', '크기', 'Size', 'queen', [
      ['single', '싱글 1000×2000', 'Single 1000×2000'], ['supersingle', '슈퍼싱글 1100×2000', 'Super single 1100×2000'],
      ['queen', '퀸 1500×2000', 'Queen 1500×2000'], ['king', '킹 1600×2000', 'King 1600×2000'], ['largeking', '라지킹 1800×2000', 'Large king 1800×2000'],
      ['usqueen', '미국 퀸 1520×2030', 'US queen 1520×2030'], ['usking', '미국 킹 1930×2030', 'US king 1930×2030'],
    ]),
    P.pick('headboard', '헤드보드', 'Headboard', 'upholstered', [['upholstered', '패브릭', 'Upholstered'], ['wood', '원목', 'Wood'], ['slat', '살대', 'Slatted wood']]),
    P.mat('frameFabric', '프레임 천', 'Frame fabric', 'fabric-linen-grey', 'fabric'),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.bool('bedding', '침구', 'Bedding', true),
    P.mat('beddingFabric', '침구 천', 'Bedding fabric', 'fabric-cotton-white', 'fabric'),
    P.bool('throw', '스로우 담요', 'Throw blanket', true),
    P.mat('throwFabric', '담요 천', 'Throw fabric', 'fabric-wool-charcoal', 'fabric'),
    P.int('pillows', '베개 수', 'Pillows', 2, 0, 4),
  ],
  tags: ['bed', 'double bed', 'queen bed', 'king bed', 'single bed', '침대', '퀸 침대', '킹 침대', '싱글 침대', '슈퍼싱글', '침구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = BED_SIZES[p.bedSize] ?? BED_SIZES.queen;
    buildBed(k, p, { mw, ml, frameMat: p.wood, headboard: p.headboard, legsMat: p.wood });
    return recentre(k.group());
  },
});

/* -------------------------------------------------------- case goods */

/** Cabinet on outward-splayed legs (helpers.addCabinet's own legs splay inwards). */
function cabinetOnLegs(k, o) {
  const legH = o.legH ?? 0.16;
  splayLegs(k, 'legs', o.legMat, o.w - 0.04, o.d - 0.06, legH, { inset: 0.035, r: 0.018, rFoot: 0.011, splay: 0.02 });
  return addCabinet(k, { ...o, base: 'none', y0: legH, h: o.h - legH });
}

const nightstand = item({
  id: 'nightstand', category: 'bedroom', ko: '협탁', en: 'Nightstand', size: [0.5, 0.55, 0.4],
  params: [
    P.len('width', '폭', 'Width', 0.5, 0.35, 0.7),
    P.len('height', '높이', 'Height', 0.55, 0.4, 0.7),
    P.pick('style', '구성', 'Layout', 'drawers', [['drawers', '서랍 2단', 'Two drawers'], ['open', '서랍+오픈', 'Drawer + open shelf']]),
    P.mat('body', '몸체', 'Body', 'wood-oak', 'wood'),
    P.mat('front', '전면', 'Fronts', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', OPT.handle),
  ],
  tags: ['nightstand', 'bedside table', '협탁', '침대 옆 탁자', '사이드 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.4, legH = 0.16;
    if (p.style === 'drawers') {
      cabinetOnLegs(k, { w, h, d, legH, legMat: p.body, body: p.body, front: p.front, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.5, n: 1, type: 'drawer' }], handle: p.handle, handleMat: 'metal-brass', top: p.body, topThick: 0.02, topOverhang: 0.005 });
    } else {
      // open box: sides, bottom, back, top; one drawer at the top
      splayLegs(k, 'legs', p.body, w - 0.04, d - 0.06, legH, { inset: 0.035, r: 0.018, rFoot: 0.011, splay: 0.02 });
      const t = 0.018, bh = h - legH;
      for (const s of [-1, 1]) k.box('body', p.body, t, bh, d, s * (w / 2 - t / 2), legH + bh / 2, 0, { r: 0.002 });
      k.box('body', p.body, w, t, d, 0, h - t / 2, 0, { r: 0.002 });
      k.box('body', p.body, w - 2 * t, t, d, 0, legH + t / 2, 0, { r: 0.001 });
      k.box('body', p.body, w - 2 * t, bh - 2 * t, 0.008, 0, legH + bh / 2, -d / 2 + 0.004, { r: 0 });
      const dh = 0.15;
      k.box('body', p.body, w - 2 * t, t, d - 0.01, 0, h - t - dh - t / 2, 0, { r: 0.001 });
      k.box('fronts', p.front, w - 2 * t - 0.004, dh - 0.004, 0.018, 0, h - t - dh / 2, d / 2 - 0.009, { r: 0.0025 });
      addHandle(k, 'handles', 'metal-brass', p.handle, 0, h - t - dh / 2, d / 2, { len: 0.12 });
    }
    return k.group();
  },
});

const dresser = item({
  id: 'dresser', category: 'bedroom', ko: '서랍장', en: 'Dresser', size: [1.2, 0.82, 0.48],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.6, 1.8),
    P.len('height', '높이', 'Height', 0.82, 0.6, 1.3),
    P.int('rows', '단 수', 'Rows', 3, 2, 6),
    P.int('cols', '열 수', 'Columns', 2, 1, 3),
    P.mat('body', '몸체', 'Body', 'wood-walnut', 'wood'),
    P.mat('front', '전면', 'Fronts', 'wood-walnut', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
  ],
  tags: ['dresser', 'chest of drawers', 'drawers', '서랍장', '수납장', '체스트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rows = Array.from({ length: p.rows }, () => ({ h: 1 / p.rows, n: p.cols, type: 'drawer' }));
    cabinetOnLegs(k, { w: p.width, h: p.height, d: 0.48, legH: 0.14, legMat: p.body, body: p.body, front: p.front, rows, handle: p.handle, handleMat: 'metal-brass', top: p.body, topThick: 0.022, topOverhang: 0.006 });
    return k.group();
  },
});

const wardrobe = item({
  id: 'wardrobe', category: 'bedroom', ko: '옷장', en: 'Wardrobe', size: [1.2, 2.2, 0.6],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.5, 3.0),
    P.len('height', '높이', 'Height', 2.2, 1.6, 2.6),
    P.len('depth', '깊이', 'Depth', 0.6, 0.45, 0.7),
    P.pick('doorType', '문 형태', 'Doors', 'hinged', [['hinged', '여닫이', 'Hinged'], ['sliding', '슬라이딩', 'Sliding']]),
    P.int('doors', '문 수', 'Door count', 2, 1, 6),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '전면', 'Fronts', 'wood-ash', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.bool('drawers', '하부 서랍', 'Drawers below', false),
  ],
  tags: ['wardrobe', 'closet', 'armoire', '옷장', '장롱', '붙박이장', '슬라이딩 옷장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = p.depth;
    if (p.doorType === 'hinged') {
      const rows = [];
      if (p.drawers) rows.push({ h: 0.4, abs: true, n: Math.max(1, Math.round(p.doors / 2)), type: 'drawer' }, { h: 0.2, abs: true, n: Math.max(1, Math.round(p.doors / 2)), type: 'drawer' });
      const bodyH = h - 0.08;
      const rest = bodyH - (p.drawers ? 0.6 : 0);
      rows.push({ h: rest, abs: true, n: p.doors, type: 'door', handleY: null });
      // tall doors get long pulls (addCabinet sizes handles for kitchen-height fronts)
      const longBar = p.handle === 'bar';
      addCabinet(k, { w, h, d, rows, body: p.body, front: p.front, handle: longBar ? 'none' : p.handle, handleMat: 'metal-black', base: 'plinth', plinth: 0.08 });
      if (p.drawers && longBar) {
        const nd = Math.max(1, Math.round(p.doors / 2));
        for (let c = 0; c < nd; c++) for (const y of [0.41, 0.58]) addHandle(k, 'handles', 'metal-black', 'bar', -w / 2 + (w / nd) * (c + 0.5), y, d / 2, { len: 0.2 });
      }
      if (longBar) {
        const cw = w / p.doors, hy = Math.min(1.1, 0.08 + (p.drawers ? 0.6 : 0) + rest / 2);
        for (let c = 0; c < p.doors; c++) {
          const hinge = p.doors === 1 ? 'left' : c % 2 === 0 ? 'left' : 'right';
          const cx = -w / 2 + cw * (c + 0.5);
          addHandle(k, 'handles', 'metal-black', 'bar', hinge === 'left' ? cx + cw / 2 - 0.045 : cx - cw / 2 + 0.045, hy, d / 2, { len: 0.42, vertical: true });
        }
      }
    } else {
      // carcass + two/three overlapping sliding panels on separate tracks
      const plinth = 0.06, top = 0.05, ft = 0.022;
      const bh = h - plinth;
      k.box('body', p.body, w, bh, d - 0.07, 0, plinth + bh / 2, -0.035, { r: 0.003 });
      k.box('body', p.body, w - 0.02, plinth, d - 0.1, 0, plinth / 2, -0.04, { r: 0.001 });
      for (const s of [-1, 1]) k.box('body', p.body, 0.02, bh, 0.07, s * (w / 2 - 0.01), plinth + bh / 2, d / 2 - 0.035, { r: 0.002 });
      k.box('body', p.body, w, top, 0.07, 0, h - top / 2, d / 2 - 0.035, { r: 0.002 });
      k.box('track', 'metal-aluminium', w - 0.04, 0.012, 0.06, 0, h - top - 0.006, d / 2 - 0.035, { r: 0.001 });
      const n = Math.max(2, p.doors);
      const pw = (w - 0.04) / n + 0.03;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.02 + ((w - 0.04 - pw) * i) / (n - 1) + pw / 2;
        const z = d / 2 - (i % 2 === 0 ? 0.017 : 0.047);
        const ph = h - plinth - top - 0.02;
        k.box('fronts', p.front, pw, ph, ft, x, plinth + 0.005 + ph / 2, z, { r: 0.003 });
        // recessed vertical pull along the leading edge
        if (p.handle !== 'none') {
          const ex = i < n / 2 ? x + pw / 2 - 0.03 : x - pw / 2 + 0.03;
          k.box('handles', 'metal-black', 0.014, Math.min(0.8, ph * 0.45), 0.01, ex, plinth + ph * 0.5, z + ft / 2 + 0.004, { r: 0.002 });
        }
      }
    }
    return k.group();
  },
});

const vanity = item({
  id: 'vanity-table', category: 'bedroom', ko: '화장대', en: 'Vanity table', size: [1.0, 1.45, 0.45],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.4),
    P.pick('mirror', '거울', 'Mirror', 'round', [['round', '원형', 'Round'], ['rect', '사각', 'Rectangle'], ['none', '없음', 'None']]),
    P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'),
    P.mat('legWood', '다리', 'Legs', 'wood-oak', 'wood'),
    P.mat('frame', '거울 프레임', 'Mirror frame', 'metal-gold', 'metal'),
  ],
  tags: ['vanity', 'dressing table', 'makeup table', '화장대', '드레스 테이블', '거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, h = 0.75;
    k.slab('top', p.wood, roundRect(w, d, 0.01), 0.025, h - 0.025, { bevel: 0.004 });
    // drawer box under the top: one wide drawer between two narrow ones
    const ah = 0.13;
    k.box('body', p.wood, w - 0.04, ah, d - 0.06, 0, h - 0.025 - ah / 2, -0.02, { r: 0.002 });
    const cols = [0.28, 0.44, 0.28];
    let x = -(w - 0.04) / 2;
    for (const c of cols) {
      const cw = c * (w - 0.04);
      k.box('fronts', p.wood, cw - 0.004, ah - 0.006, 0.018, x + cw / 2, h - 0.025 - ah / 2, d / 2 - 0.03 + 0.009, { r: 0.0025 });
      k.sphere('handles', 'metal-gold', 0.01, x + cw / 2, h - 0.025 - ah / 2, d / 2 - 0.012, { segs: 12, rings: 8 });
      x += cw;
    }
    splayLegs(k, 'legs', p.legWood, w - 0.02, d - 0.02, h - 0.025 - ah, { inset: 0.04, r: 0.02, rFoot: 0.012, splay: 0.025 });
    if (p.mirror !== 'none') {
      const mw = Math.min(0.62, w * 0.6), mh = p.mirror === 'round' ? mw : 0.75;
      const my = h + 0.04, mz = -d / 2 + 0.06;
      const outer = p.mirror === 'round' ? ellipse(mw, mw) : roundRect(mw, mh, 0.03);
      const ring = p.mirror === 'round' ? ellipse(mw, mw) : roundRect(mw, mh, 0.03);
      ring.holes.push(new THREE.Path((p.mirror === 'round' ? ellipse(mw - 0.03, mw - 0.03) : roundRect(mw - 0.03, mh - 0.03, 0.02)).getPoints(48).reverse()));
      k.panel('frame', p.frame, ring, 0.025, 0, my + mh / 2, mz, { bevel: 0.005, curveSegs: 48 });
      k.panel('mirror', 'mirror', p.mirror === 'round' ? ellipse(mw - 0.028, mw - 0.028) : roundRect(mw - 0.028, mh - 0.028, 0.02), 0.005, 0, my + mh / 2, mz - 0.004, { bevel: 0.001, curveSegs: 48 });
      void outer;
      // slim stand: a foot on the top holding the frame
      k.box('frame', p.frame, mw * 0.5, 0.012, 0.12, 0, h + 0.006, mz + 0.01, { r: 0.004 });
      k.box('frame', p.frame, 0.03, 0.06, 0.02, 0, h + 0.03, mz, { r: 0.004 });
    }
    return recentre(k.group());
  },
});

const bedBench = item({
  id: 'bed-bench', category: 'bedroom', ko: '침대 벤치', en: 'Bed-end bench', size: [1.3, 0.46, 0.42],
  params: [
    P.len('width', '폭', 'Width', 1.3, 0.8, 1.9),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-blue', 'fabric'),
    P.mat('wood', '다리', 'Legs', 'wood-walnut', 'wood'),
    P.bool('tufted', '버튼 터프팅', 'Button tufted', true),
  ],
  tags: ['bench', 'bed bench', 'ottoman bench', '침대 벤치', '스툴', '벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.42, h = 0.46, legH = 0.2;
    k.soft('upholstery', p.fabric, w, h - legH, d, 0.04, 0, legH + (h - legH) / 2, 0, { puff: 0.014 });
    if (p.tufted) {
      const nx = Math.max(3, Math.round(w / 0.25));
      // two staggered rows of buttons
      for (let j = 0; j < 2; j++) for (let i = 0; i < nx - j; i++) {
        const x = -w / 2 + (w / nx) * (i + 0.5 + j * 0.5);
        k.sphere('upholstery', p.fabric, 0.011, x, h + 0.006, j ? 0.07 : -0.07, { scale: [1, 0.5, 1], segs: 8, rings: 4 });
      }
    }
    splayLegs(k, 'legs', p.wood, w - 0.02, d - 0.02, legH, { inset: 0.05, r: 0.02, rFoot: 0.012, splay: 0.02 });
    return k.group();
  },
});

export const ITEMS = [bed, nightstand, wardrobe, dresser, vanity, bedBench];
void frameShape;
