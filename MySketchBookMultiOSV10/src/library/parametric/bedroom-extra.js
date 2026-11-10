// Further bedroom designs: wrap-around upholstered bed, bookcase-headboard bed, tatami platform,
// round bed, adjustable (motion) bed, industrial pipe bed, bed with integrated nightstands,
// corner (L) wardrobe, tall lingerie chest, floating wall vanity, bedroom armchair-bench.
// See ARCHITECTURE.md §12 → Library objects. Head of beds at −z, foot at +z.
import { THREE, Kit, P, OPT, T, clamp, pillowGeo, addCabinet, roundRect, transformAdded, softBoxGeo } from './helpers.js';
import { clothGeo } from './bedroom.js';
import { addBooks } from './living.js';
import { mk } from './appliances-more.js';
import { finish } from './kitchen.js';

const PI = Math.PI;

/* ------------------------------------------------------------ shared */

const SZ = { single: [1.0, 2.0], supersingle: [1.1, 2.0], queen: [1.5, 2.0], king: [1.6, 2.0], largeking: [1.8, 2.0] };
const SIZE_OPTS = [
  ['single', '싱글 1000×2000', 'Single 1000×2000'], ['supersingle', '슈퍼싱글 1100×2000', 'Super single 1100×2000'],
  ['queen', '퀸 1500×2000', 'Queen 1500×2000'], ['king', '킹 1600×2000', 'King 1600×2000'], ['largeking', '라지킹 1800×2000', 'Large king 1800×2000'],
];
const pSize = (def = 'queen') => P.pick('bedSize', '크기', 'Size', def, SIZE_OPTS);
const mattOf = (p) => SZ[p.bedSize] ?? SZ.queen;
const BEDDING = (fab = 'fabric-cotton-white', n = 2) => [
  P.bool('bedding', '침구', 'Bedding', true),
  P.mat('beddingFabric', '침구 천', 'Bedding fabric', fab, 'fabric'),
  P.int('pillows', '베개 수', 'Pillows', n, 0, 4),
];

const bedItem = (def) => mk({ category: 'bedroom', ...def, build: (p, ctx) => { const k = new Kit(ctx); def.make(k, p); return finish(k); } });

/** Mattress centred at (x, z) with its bottom at y; returns the top. */
function mattress(k, mw, ml, y, z, h = 0.24, x = 0) {
  k.soft('mattress', 'fabric-linen-white', mw - 0.01, h, ml - 0.01, Math.min(0.05, h * 0.3), x, y + h / 2, z, { puff: 0.008 });
  return y + h;
}

/** Duvet + pillows on a mattress (top mTop, head zHead, foot zFoot). */
function bedding(k, p, { mw, ml, mTop, zHead, zFoot, drop = 0.2, lean = 0.55, foot = true }) {
  drop = clamp(drop, 0.03, mTop - 0.03);
  if (p.bedding) {
    const covered = ml - 0.45;
    const duvet = clothGeo({ w: mw, l: covered, top: mTop - 0.012, drop, r: Math.min(0.06, drop * 0.75), thick: 0.045, nu: k.seg(40, 12), nv: k.seg(36, 10), sides: { left: true, right: true, foot }, seed: mw * 5 });
    duvet.translate(0, 0, zFoot - 0.005 - covered / 2);
    k.add('bedding', p.beddingFabric, duvet);
    const band = clothGeo({ w: mw + 0.02, l: 0.26, top: mTop + 0.033, drop: Math.max(0.03, drop - 0.03), r: 0.05, thick: 0.02, nu: k.seg(32, 10), nv: k.seg(6, 3), sides: { left: true, right: true, foot: false }, folds: 0.006, seed: 2 });
    band.translate(0, 0, zFoot - covered + 0.13);
    k.add('bedding', p.beddingFabric, band);
  }
  const n = p.pillows;
  const pw = Math.min(0.7, (mw - 0.08) / Math.max(1, n));
  for (let i = 0; i < n; i++) {
    const g = pillowGeo(pw - 0.03, 0.48, 0.16, k.seg(14, 6));
    T(g, 0, 0, 0, -PI / 2 + lean, 0, 0);
    g.translate(-mw / 2 + 0.04 + pw * (i + 0.5) + (mw - 0.08 - pw * n) / 2, mTop + Math.sin(lean) * 0.16 + 0.04, zHead + 0.03 + Math.cos(lean) * 0.24);
    k.add('pillows', p.beddingFabric, g);
  }
}

/* -------------------------------------------------------------- beds */

const wrap = bedItem({
  id: 'bed-wraparound', ko: '랩어라운드 패브릭 침대', en: 'Wrap-around upholstered bed',
  params: [pSize('queen'), P.mat('fabric', '프레임 천', 'Frame fabric', 'fabric-boucle', 'fabric'), P.len('hbH', '헤드 높이', 'Headboard height', 0.8, 0.6, 1.1), ...BEDDING('fabric-linen-white', 2)],
  tags: ['wrap around bed', 'upholstered bed', 'boucle bed', '랩어라운드 침대', '패브릭 침대', '부클레 침대', '호텔 침대'],
  make: (k, p) => {
    const [mw, ml] = mattOf(p), m = 0.09, W = mw + 2 * m, L = ml + m + 0.12;
    const zHead = -L / 2 + 0.12;
    // padded base rounded all round
    k.soft('frame', p.fabric, W, 0.3, L, 0.07, 0, 0.17, 0, { puff: 0.01 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', 'wood-black', 0.05, 0.02, 0.05, sx * (W / 2 - 0.12), 0.01, sz * (L / 2 - 0.12), { r: 0.004 });
    // headboard that wraps round the head corners (a U in plan)
    const t = 0.12, R = 0.28, hw = W / 2;
    const s = new THREE.Shape();
    s.moveTo(-hw, -L / 2 + R + 0.25); s.lineTo(-hw, -L / 2 + R); s.quadraticCurveTo(-hw, -L / 2, -hw + R, -L / 2);
    s.lineTo(hw - R, -L / 2); s.quadraticCurveTo(hw, -L / 2, hw, -L / 2 + R); s.lineTo(hw, -L / 2 + R + 0.25);
    s.lineTo(hw - t, -L / 2 + R + 0.25); s.lineTo(hw - t, -L / 2 + R); s.quadraticCurveTo(hw - t, -L / 2 + t, hw - R, -L / 2 + t);
    s.lineTo(-hw + R, -L / 2 + t); s.quadraticCurveTo(-hw + t, -L / 2 + t, -hw + t, -L / 2 + R); s.lineTo(-hw + t, -L / 2 + R + 0.25);
    s.closePath();
    k.slab('headboard', p.fabric, s, p.hbH - 0.02, 0.02, { bevel: 0.04, bevelSegs: k.hi ? 3 : 1, curveSegs: 8 });
    const mTop = mattress(k, mw, ml, 0.3, zHead + ml / 2);
    bedding(k, p, { mw, ml, mTop, zHead, zFoot: zHead + ml, drop: 0.2 });
  },
});

const bookcase = bedItem({
  id: 'bed-bookcase-headboard', ko: '책장 헤드 침대', en: 'Bed with bookcase headboard',
  params: [pSize('supersingle'), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'), P.bool('books', '책', 'Books', true), ...BEDDING('fabric-cotton-grey', 1)],
  tags: ['bookcase headboard', 'storage headboard', 'bed', '책장 헤드', '수납 헤드 침대', '원룸 침대'],
  make: (k, p) => {
    const [mw, ml] = mattOf(p), W = mw + 0.06, hd = 0.28, hh = 1.0, wd = p.wood;
    const zHB = -ml / 2 - hd / 2;
    // headboard cabinet: sides, top, shelf, back, three cubbies
    for (const s of [-1, 1]) k.box('headboard', wd, 0.02, hh, hd, s * (W / 2 - 0.01), hh / 2, zHB, { r: 0.002 });
    k.box('headboard', wd, W, 0.02, hd, 0, hh - 0.01, zHB, { r: 0.002 });
    for (const y of [0.01, 0.62]) k.box('headboard', wd, W - 0.04, 0.02, hd, 0, y, zHB, { r: 0.002 });
    k.box('headboard', wd, W - 0.04, hh - 0.04, 0.012, 0, hh / 2, zHB - hd / 2 + 0.006, { r: 0 });
    for (const f of [-1 / 6, 1 / 6]) k.box('headboard', wd, 0.02, hh - 0.64, hd - 0.02, f * W, 0.62 + (hh - 0.64) / 2, zHB, { r: 0.002 });
    if (p.books) addBooks(k, -W / 2 + 0.03, -W / 6 - 0.02, 0.63, zHB, hd - 0.06, 3, { hMax: 0.28 });
    // frame with two drawers at the foot side
    const fh = 0.32;
    k.box('frame', wd, W, fh - 0.02, ml + 0.02, 0, (fh - 0.02) / 2 + 0.02, 0, { r: 0.003 });
    for (const s of [-1, 1]) {
      k.box('fronts', wd, 0.018, 0.2, ml * 0.42, W / 2 + 0.009, 0.15, s * ml * 0.22, { r: 0.002 });
      k.box('handles', 'metal-black', 0.012, 0.02, 0.16, W / 2 + 0.022, 0.21, s * ml * 0.22, { r: 0.003 });
    }
    k.box('legs', 'wood-black', W - 0.06, 0.02, ml - 0.04, 0, 0.01, 0, { r: 0.002 });
    const mTop = mattress(k, mw, ml, fh - 0.02, 0);
    bedding(k, p, { mw, ml, mTop, zHead: -ml / 2, zFoot: ml / 2, drop: 0.15 });
  },
});

const tatami = bedItem({
  id: 'bed-tatami-platform', ko: '다다미 평상 침대', en: 'Tatami platform bed',
  params: [pSize('queen'), P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'), P.len('margin', '평상 여유', 'Deck margin', 0.25, 0.1, 0.5), P.mat('edge', '다다미 테두리', 'Tatami edging', 'fabric-navy', 'fabric'), ...BEDDING('fabric-linen-white', 2)],
  tags: ['tatami bed', 'japanese bed', 'platform bed', '다다미 침대', '평상 침대', '일본식 침대', '좌식'],
  make: (k, p) => {
    const [mw, ml] = mattOf(p), m = p.margin, W = mw + 2 * m, L = ml + 2 * m, h = 0.3;
    k.box('frame', p.wood, W, h - 0.03, L, 0, (h - 0.03) / 2, 0, { r: 0.004 });
    // two tatami mats with edged long sides
    for (const s of [-1, 1]) {
      const tw = W / 2 - 0.04;
      k.box('tatami', 'rattan', tw, 0.03, L - 0.06, s * (W / 4), h - 0.015, 0, { r: 0.003 });
      for (const e of [-1, 1]) k.box('edging', p.edge, 0.035, 0.032, L - 0.06, s * W / 4 + e * (tw / 2 - 0.0175), h - 0.015, 0, { r: 0.002 });
    }
    // low headboard rail
    k.box('frame', p.wood, W, 0.32, 0.05, 0, h + 0.16 - 0.03, -L / 2 + 0.025, { r: 0.006 });
    const mTop = mattress(k, mw, ml, h, 0, 0.12);
    bedding(k, p, { mw, ml, mTop, zHead: -ml / 2, zFoot: ml / 2, drop: 0.1, lean: 0.2 });
  },
});

const roundBed = bedItem({
  id: 'bed-round', ko: '원형 침대', en: 'Round bed',
  params: [P.len('diameter', '지름', 'Diameter', 2.2, 1.8, 2.6), P.mat('fabric', '프레임 천', 'Frame fabric', 'fabric-velvet-rose', 'fabric'), P.mat('bedFabric', '침구 천', 'Bedding fabric', 'fabric-cotton-white', 'fabric'), P.int('pillows', '베개 수', 'Pillows', 3, 0, 5)],
  tags: ['round bed', 'circular bed', 'hotel bed', '원형 침대', '라운드 침대', '호텔 침대', '럭셔리'],
  make: (k, p) => {
    const D = p.diameter, R = D / 2, mr = R - 0.1;
    k.cyl('frame', p.fabric, R, R - 0.02, 0.3, 0, 0.03, 0, { segs: k.seg(48, 16) });
    k.cyl('legs', 'metal-gold', R - 0.25, R - 0.25, 0.03, 0, 0, 0, { segs: k.seg(40, 12) });
    k.cyl('mattress', 'fabric-linen-white', mr, mr, 0.22, 0, 0.3, 0, { segs: k.seg(48, 16) });
    k.cyl('bedding', p.bedFabric, mr + 0.02, mr + 0.04, 0.06, 0, 0.46, 0.12, { segs: k.seg(48, 16) });
    // curved padded headboard behind (sector of a ring, 140°)
    const a = (140 * PI) / 180, s = new THREE.Shape(), r0 = R + 0.02, r1 = R + 0.16, n = 24;
    for (let i = 0; i <= n; i++) { const t = -a / 2 + (a * i) / n; const x = r1 * Math.sin(t), z = -r1 * Math.cos(t); if (i === 0) s.moveTo(x, z); else s.lineTo(x, z); }
    for (let i = n; i >= 0; i--) { const t = -a / 2 + (a * i) / n; s.lineTo(r0 * Math.sin(t), -r0 * Math.cos(t)); }
    s.closePath();
    k.slab('headboard', p.fabric, s, 1.1, 0, { bevel: 0.04, bevelSegs: k.hi ? 3 : 1, curveSegs: 4 });
    for (let i = 0; i < p.pillows; i++) {
      const t = (i - (p.pillows - 1) / 2) * 0.32;
      const g = pillowGeo(0.6, 0.44, 0.16, k.seg(14, 6));
      T(g, 0, 0, 0, -PI / 2 + 0.6, -t, 0);
      g.translate((mr - 0.3) * Math.sin(t), 0.62, -(mr - 0.3) * Math.cos(t));
      k.add('pillows', p.bedFabric, g);
    }
  },
});

const motion = bedItem({
  id: 'bed-adjustable', ko: '전동 모션 베드', en: 'Adjustable motion bed',
  params: [pSize('queen'), P.num('head', '머리 올림(°)', 'Head raise (°)', 35, 0, 60, 1), P.num('foot', '다리 올림(°)', 'Foot raise (°)', 15, 0, 35, 1), P.mat('fabric', '베이스 천', 'Base fabric', 'fabric-wool-charcoal', 'fabric'), P.int('pillows', '베개 수', 'Pillows', 2, 0, 3), P.mat('beddingFabric', '베개 천', 'Pillow fabric', 'fabric-cotton-white', 'fabric')],
  tags: ['adjustable bed', 'motion bed', 'electric bed', '모션 베드', '전동 침대', '리클라이닝 침대'],
  make: (k, p) => {
    const [mw, ml] = mattOf(p), W = mw + 0.04, base = 0.3, mh = 0.2;
    k.soft('frame', p.fabric, W, base - 0.12, ml + 0.04, 0.03, 0, 0.12 + (base - 0.12) / 2, 0, { puff: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'metal-black', 0.025, 0.02, 0.12, sx * (W / 2 - 0.12), 0, sz * (ml / 2 - 0.15), { segs: k.seg(12, 6) });
    // three mattress segments: head (hinged at z1), seat (flat), foot (hinged at z2)
    const z0 = -ml / 2, lh = ml * 0.42, ls = ml * 0.2, lf = ml - lh - ls;
    const zh = z0 + lh, zf = zh + ls, y = base;
    const ha = (p.head * PI) / 180, fa = (p.foot * PI) / 180;
    const seg = (len, rx, z, dir) => {
      const g = softBoxGeo(mw, mh, len, 0.04, { round: k.hi ? 3 : 1, flat: k.hi ? 3 : 2, puff: 0.006 });
      g.translate(0, mh / 2, dir * len / 2);
      g.rotateX(rx);
      g.translate(0, y, z);
      k.add('mattress', 'fabric-linen-white', g);
    };
    seg(ls, 0, zh, 1);
    seg(lh, ha, zh, -1);
    seg(lf, -fa, zf, 1);
    // pillows on the raised head
    const n = p.pillows, pw = Math.min(0.7, (mw - 0.08) / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const g = pillowGeo(pw - 0.03, 0.45, 0.15, k.seg(14, 6));
      T(g, 0, 0, 0, -PI / 2 + ha + 0.1, 0, 0);
      const d = lh - 0.25;
      g.translate(-mw / 2 + 0.04 + pw * (i + 0.5) + (mw - 0.08 - pw * n) / 2, y + mh + Math.sin(ha) * d + 0.06, zh - Math.cos(ha) * d + 0.05);
      k.add('pillows', p.beddingFabric, g);
    }
    // wired remote on the seat
    k.box('remote', 'plastic-black', 0.05, 0.02, 0.14, mw / 2 - 0.2, y + mh + 0.01, zh + ls / 2, { r: 0.008 });
  },
});

const pipe = bedItem({
  id: 'bed-pipe-industrial', ko: '파이프 프레임 침대 (인더스트리얼)', en: 'Industrial pipe-frame bed',
  params: [pSize('queen'), P.mat('metal', '파이프', 'Pipe', 'metal-black', 'metal'), P.mat('wood', '침대 판', 'Slats wood', 'wood-pine', 'wood'), ...BEDDING('fabric-linen-grey', 2)],
  tags: ['pipe bed', 'industrial bed', 'metal bed', '파이프 침대', '철제 침대', '인더스트리얼', '빈티지'],
  make: (k, p) => {
    const [mw, ml] = mattOf(p), W = mw + 0.06, L = ml + 0.06, r = 0.021, m = p.metal, ry = 0.3;
    const zH = -L / 2, zF = L / 2;
    for (const [z, top] of [[zH, 1.05], [zF, 0.55]]) {
      for (const s of [-1, 1]) {
        k.cyl('frame', m, r, r, top, s * W / 2, 0, z, { segs: k.seg(14, 6) });
        k.sphere('frame', m, r * 1.3, s * W / 2, top, z, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
        k.cyl('frame', m, r * 1.5, r * 1.5, 0.02, s * W / 2, 0, z, { segs: k.seg(14, 6) });
      }
      k.rod('frame', m, [-W / 2, top - 0.08, z], [W / 2, top - 0.08, z], r);
      k.rod('frame', m, [-W / 2, ry + 0.12, z], [W / 2, ry + 0.12, z], r);
      for (let i = 1; i < 4; i++) { const x = -W / 2 + (W * i) / 4; k.rod('frame', m, [x, ry + 0.12, z], [x, top - 0.08, z], r * 0.75); }
    }
    for (const s of [-1, 1]) k.rod('frame', m, [s * W / 2, ry, zH], [s * W / 2, ry, zF], r);
    const n = Math.round(ml / 0.12);
    for (let i = 0; i < n; i++) k.box('slats', p.wood, W - 0.02, 0.018, 0.07, 0, ry + 0.01, -ml / 2 + (ml / n) * (i + 0.5), { r: 0.003 });
    const mTop = mattress(k, mw, ml, ry + 0.02, 0, 0.22);
    bedding(k, p, { mw, ml, mTop, zHead: -ml / 2, zFoot: ml / 2, drop: 0.18, foot: false });
  },
});

const integrated = bedItem({
  id: 'bed-integrated-nightstands', ko: '협탁 일체형 헤드 침대', en: 'Bed with integrated nightstands',
  params: [pSize('king'), P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'), P.mat('fabric', '헤드 천', 'Headboard fabric', 'fabric-linen-beige', 'fabric'), P.len('wing', '협탁 폭', 'Nightstand width', 0.5, 0.35, 0.65), ...BEDDING('fabric-cotton-white', 2)],
  tags: ['bed with nightstands', 'hotel bed', 'wide headboard', '협탁 일체형', '호텔식 침대', '와이드 헤드'],
  make: (k, p) => {
    const [mw, ml] = mattOf(p), W = mw + 0.08, wing = p.wing, HW = W + 2 * wing + 0.04, wd = p.wood;
    const zp = -ml / 2 - 0.06;
    k.box('headboard', wd, HW, 1.0, 0.04, 0, 0.5, zp - 0.02, { r: 0.004 });
    // padded panel above the mattress
    k.soft('padding', p.fabric, W, 0.58, 0.06, 0.03, 0, 0.62, zp + 0.03, { puff: 0.01 });
    // floating nightstands with one drawer
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.02 + wing / 2);
      k.box('headboard', wd, wing, 0.16, 0.4, x, 0.5, zp + 0.2, { r: 0.004 });
      k.box('fronts', 'wood-black', wing - 0.04, 0.12, 0.01, x, 0.5, zp + 0.4 + 0.005, { r: 0.002 });
    }
    k.box('frame', wd, W, 0.24, ml + 0.06, 0, 0.18, 0.01, { r: 0.004 });
    k.box('legs', 'wood-black', W - 0.1, 0.06, ml - 0.1, 0, 0.03, 0, { r: 0.002 });
    const mTop = mattress(k, mw, ml, 0.3, 0.01);
    bedding(k, p, { mw, ml, mTop, zHead: -ml / 2, zFoot: ml / 2 + 0.01, drop: 0.22 });
  },
});

/* ----------------------------------------------------------- storage */

const cornerWardrobe = bedItem({
  id: 'wardrobe-corner-l', ko: 'ㄱ자 코너 옷장', en: 'L-shaped corner wardrobe',
  params: [P.len('width', '한쪽 폭', 'Run width', 1.6, 1.2, 2.4), P.len('height', '높이', 'Height', 2.2, 1.9, 2.5), P.mat('body', '몸체', 'Body', 'wood-white', 'wood'), P.mat('front', '문', 'Doors', 'paint-white-matte'), P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle)],
  tags: ['corner wardrobe', 'l shaped wardrobe', 'closet', '코너 옷장', 'ㄱ자 옷장', '붙박이장', '드레스룸'],
  make: (k, p) => {
    const W = p.width, H = p.height, d = 0.58;
    const opt = (w) => ({ w, h: H, d, body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-aluminium', base: 'plinth', plinth: 0.08, rows: [{ h: 1, n: Math.max(1, Math.round(w / 0.5)), type: 'door' }] });
    // back run along x (corner at the left), side run along z on the left (doors facing +x)
    addCabinet(k, { ...opt(W - d), x: d / 2, z: 0 });
    transformAdded(k, () => addCabinet(k, opt(W - d)), -W / 2 + d / 2, 0, d / 2 + (W - d) / 2, PI / 2);
    // corner box with a diagonal door
    k.box('body', p.body, d, H, d, -W / 2 + d / 2, H / 2, 0, { r: 0.002 });
  },
});

const lingerie = bedItem({
  id: 'chest-lingerie', ko: '7단 란제리 서랍장', en: 'Tall 7-drawer lingerie chest',
  params: [P.len('width', '폭', 'Width', 0.55, 0.45, 0.7), P.len('height', '높이', 'Height', 1.3, 1.1, 1.5), P.mat('body', '몸체', 'Body', 'wood-white', 'wood'), P.mat('front', '서랍', 'Drawers', 'paint-white-matte'), P.pick('handle', '손잡이', 'Handles', 'knob', OPT.handle)],
  tags: ['lingerie chest', 'tall chest', 'semainier', '란제리 서랍장', '7단 서랍장', '좁은 서랍장'],
  make: (k, p) => {
    addCabinet(k, { w: p.width, h: p.height, d: 0.42, body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-brass', base: 'legs', legH: 0.12, legStyle: 'tapered', legMat: 'wood-oak', top: p.body, topThick: 0.02, topOverhang: 0.01, rows: Array.from({ length: 7 }, () => ({ h: 1 / 7, n: 1, type: 'drawer' })) });
  },
});

const vanityWall = bedItem({
  id: 'vanity-wall-floating', placement: 'wall', elevation: 0.62, ko: '벽걸이 화장대 (원형 거울)', en: 'Floating wall vanity with round mirror',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.2), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'), P.mat('frame', '거울 테', 'Mirror frame', 'metal-brass', 'metal')],
  tags: ['wall vanity', 'floating vanity', 'dressing table', '벽걸이 화장대', '화장대', '원형 거울'],
  make: (k, p) => {
    const w = p.width, d = 0.36, y = 0.15;
    k.box('top', p.wood, w, 0.03, d, 0, y - 0.015, 0, { r: 0.004 });
    k.box('top', p.wood, w - 0.02, 0.12, d - 0.02, 0, y - 0.09, -0.005, { r: 0.003 });
    k.box('fronts', p.wood, w * 0.5, 0.1, 0.012, 0, y - 0.09, d / 2 - 0.009, { r: 0.002 });
    k.cyl('handles', p.frame, 0.008, 0.008, 0.01, 0, y - 0.09, d / 2 - 0.003, { rx: PI / 2, segs: 10 });
    const r = Math.min(0.38, w * 0.4), my = y + 0.12 + r;
    const ring = new THREE.TorusGeometry(r, 0.012, k.seg(8, 4), k.seg(48, 16));
    ring.translate(0, my, -d / 2 + 0.03);
    k.add('frame', p.frame, ring);
    k.cyl('mirror', 'mirror', r, r, 0.006, 0, my, -d / 2 + 0.027, { rx: PI / 2, segs: k.seg(48, 16) });
  },
});

const bedBench = bedItem({
  id: 'bed-end-bench-upholstered', ko: '침대 끝 패브릭 벤치 (등받이)', en: 'Upholstered bed-end bench with back',
  params: [P.len('width', '폭', 'Width', 1.3, 0.9, 1.8), P.mat('fabric', '천', 'Fabric', 'fabric-velvet-green', 'fabric'), P.mat('legMat', '다리', 'Legs', 'metal-brass', 'metal')],
  tags: ['bench', 'bed bench', 'settee', '침대 벤치', '등받이 벤치', '패브릭 벤치'],
  make: (k, p) => {
    const w = p.width, d = 0.48;
    k.soft('seat', p.fabric, w, 0.14, d, 0.04, 0, 0.38, 0, { puff: 0.012 });
    k.soft('seat', p.fabric, w, 0.3, 0.1, 0.04, 0, 0.58, -d / 2 + 0.05, { puff: 0.01, rx: -0.12 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', p.legMat, 0.012, 0.009, 0.31, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), { segs: k.seg(12, 6) });
    k.rod('legs', p.legMat, [-w / 2 + 0.06, 0.12, 0], [w / 2 - 0.06, 0.12, 0], 0.008);
    void roundRect;
  },
});

export const ITEMS = [wrap, bookcase, tatami, roundBed, motion, pipe, integrated, cornerWardrobe, lingerie, vanityWall, bedBench];
