// More study & home-office pieces (category 'office'): roll-top, campaign, glass trestle, console,
// fold-down wall, partners and kidney desks, a sit-stand converter, windsor / balance-ball / captain /
// cane chairs, ladder, cube, revolving, low and corner bookcases, wall ledges and pegboard, magazine
// rack, home printer / scanner / 3D printer / NAS / tablet stand, desk accessories, wastebasket,
// paper trimmer, binders, planner board, wall hutch, drawer unit, typewriter, craft table, gaming PC.
// Origin bottom centre (finish() re-centres), front +Z, metres. See ARCHITECTURE.md §12.
import { THREE, Kit, P, rng, roundRect, ellipse, frameShape, addCabinet, addLegs, addHandle, transformAdded, clamp } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const CAT = 'office';
const o$ = (def) => mk({ category: CAT, ...def });
const BOOK_MATS = ['book-red', 'book-blue', 'book-green', 'book-cream'];

/* --------------------------------------------------------------- helpers */

/** Upright books along x from x0 to x1 standing on y, spines facing +z at zf (front edge). */
function books(k, x0, x1, y, zf, { seed = 1, hMin = 0.17, hMax = 0.25, dMin = 0.14, dMax = 0.2, fill = 0.85, lean = true } = {}) {
  const r = rng(seed);
  let x = x0;
  const end = x0 + (x1 - x0) * fill;
  while (x < end) {
    const t = 0.018 + r() * 0.03, h = hMin + r() * (hMax - hMin), d = dMin + r() * (dMax - dMin);
    if (x + t > x1) break;
    k.box('books', BOOK_MATS[Math.floor(r() * 4)], t, h, d, x + t / 2, y + h / 2, zf - d / 2, { r: 0.0015 });
    x += t + 0.001;
  }
  // a last book leaning against the row
  if (lean && end + 0.06 < x1) {
    const h = hMin + 0.03, t = 0.025, a = 0.35;
    k.box('books', BOOK_MATS[Math.floor(r() * 4)], t, h, dMin + 0.02, x + Math.sin(a) * h / 2 + t / 2, y + Math.cos(a) * h / 2, zf - (dMin + 0.02) / 2, { r: 0.0015, rz: -a });
  }
}

/** Horizontal stack of books (lying flat) centred at (x, z) from y. Returns the top y. */
function bookStack(k, n, x, y, z, seed = 3) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const t = 0.022 + r() * 0.03, w = 0.17 + r() * 0.08, d = 0.13 + r() * 0.06;
    k.box('books', BOOK_MATS[Math.floor(r() * 4)], w, t, d, x + (r() - 0.5) * 0.02, y + t / 2, z + (r() - 0.5) * 0.02, { r: 0.0015, ry: (r() - 0.5) * 0.25 });
    y += t;
  }
  return y;
}

/** Simple glowing dot rows / LEDs on a face at zf (role 'display', exempt from light markers). */
function leds(k, xs, y, zf, mat = 'light-cool') {
  for (const x of xs) k.box('display', mat, 0.006, 0.004, 0.003, x, y, zf + 0.0015, { r: 0 });
}

/* ------------------------------------------------------------------ desks */

const rollTopDesk = o$({
  id: 'ofx-roll-top-desk', ko: '롤탑 책상', en: 'Roll-top desk',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.1, 1.8),
    P.num('open', '덮개 열림', 'Tambour open', 0.8, 0, 1, 0.05),
    P.mat('wood', '목재', 'Wood', 'wood-walnut', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', [['knob', '노브', 'Knob'], ['bar', '바', 'Bar']]),
  ],
  tags: ['roll top desk', 'rolltop', 'tambour desk', 'antique desk', '롤탑 책상', '롤탑', '클래식 책상', '서재 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.76, H = 0.76, w = p.wood;
    const pw = 0.4;
    for (const s of [-1, 1]) addCabinet(k, { w: pw, h: H - 0.03, d: D - 0.02, x: s * (W / 2 - pw / 2), rows: [{ h: 0.34, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }], body: w, front: w, handle: p.handle, handleMat: 'metal-brass', plinth: 0.06 });
    k.box('fronts', w, W - 2 * pw - 0.01, 0.1, 0.02, 0, H - 0.08, D / 2 - 0.02, { r: 0.002 });
    addHandle(k, 'handles', 'metal-brass', p.handle, 0, H - 0.08, D / 2 - 0.01, { len: 0.14 });
    k.box('body', w, W - 2 * pw, 0.5, 0.02, 0, H - 0.29, -D / 2 + 0.03, { r: 0.002 });
    k.box('top', w, W + 0.02, 0.03, D, 0, H - 0.015, 0, { r: 0.004 });
    // upper section: quarter-ellipse sides, back, pigeonholes and the tambour
    const dU = 0.46, hU = 0.44, zb = -D / 2 + 0.01, y0 = H;
    const side = new THREE.Shape();
    side.moveTo(-zb, 0);
    for (let i = 0; i <= 16; i++) { const t = (i / 16) * PI / 2; side.lineTo(-(zb + dU * Math.cos(t)), hU * Math.sin(t) + (i === 16 ? 0.02 : 0)); }
    side.lineTo(-zb, hU + 0.02);
    for (const s of [-1, 1]) k.panel('body', w, side, 0.02, s * (W / 2 - 0.01), y0, 0, { ry: PI / 2 });
    k.box('body', w, W - 0.04, hU, 0.015, 0, y0 + hU / 2, zb + 0.008, { r: 0.002 });
    k.box('top', w, W + 0.01, 0.025, 0.12, 0, y0 + hU + 0.0125, zb + 0.06, { r: 0.004 });
    const ph = hU * 0.7, pd = dU * 0.45;
    k.box('body', w, W - 0.04, 0.012, pd, 0, y0 + ph, zb + pd / 2, { r: 0.001 });
    k.box('body', w, W - 0.04, 0.012, pd, 0, y0 + ph * 0.45, zb + pd / 2, { r: 0.001 });
    const nDiv = 7;
    for (let i = 1; i < nDiv; i++) k.box('body', w, 0.01, ph, pd, -W / 2 + 0.02 + ((W - 0.04) / nDiv) * i, y0 + ph / 2, zb + pd / 2, { r: 0.001 });
    k.box('drawers', w, (W - 0.04) / nDiv * 2 - 0.006, ph * 0.43, 0.012, -W / 2 + 0.02 + (W - 0.04) / nDiv * 3.5 - 0.0, y0 + ph * 0.22, zb + pd, { r: 0.001 });
    // tambour slats along the curve, retracted when open
    const t0 = clamp(p.open, 0, 1) * (PI / 2) * 0.88;
    const nS = k.hi ? 22 : 12;
    for (let i = 0; i < nS; i++) {
      const ta = t0 + ((PI / 2 - t0) * (i + 0.5)) / nS;
      if (PI / 2 - t0 < 0.02) break;
      const u = (dU - 0.01) * Math.cos(ta), v = (hU - 0.005) * Math.sin(ta);
      const du = -dU * Math.sin(ta), dv = hU * Math.cos(ta), L = Math.hypot(du, dv);
      const len = (L * (PI / 2 - t0)) / nS + 0.002;
      k.box('tambour', w, W - 0.05, 0.01, len, 0, y0 + v, zb + u, { r: 0.002, rx: Math.atan2(-dv, du) });
    }
    return finish(k);
  },
});

const campaignDesk = o$({
  id: 'ofx-campaign-desk', ko: '캠페인 책상(황동 모서리)', en: 'Campaign desk',
  params: [
    P.len('width', '폭', 'Width', 1.3, 1.0, 1.7),
    P.len('depth', '깊이', 'Depth', 0.65, 0.55, 0.8),
    P.mat('wood', '목재', 'Wood', 'wood-teak', 'wood'),
    P.mat('brass', '금속 장식', 'Brass fittings', 'metal-brass', 'metal'),
  ],
  tags: ['campaign desk', 'military chest desk', 'brass corners', '캠페인 책상', '황동 장식', '앤틱 책상', '서재'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.76, w = p.wood, b = p.brass;
    const pw = 0.38;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - pw / 2);
      addCabinet(k, { w: pw, h: H - 0.03, d: D, x, rows: [{ h: 0.33, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }, { h: 0.34, n: 1, type: 'drawer' }], body: w, front: w, handle: 'cup', handleMat: b, base: 'legs', legH: 0.08, legStyle: 'block', legMat: w });
      // brass L corner plates on the pedestal fronts
      for (const sx of [-1, 1]) for (const y of [0.1, H - 0.05]) {
        k.box('brass', b, 0.004, 0.06, 0.04, x + sx * (pw / 2 + 0.002), y, D / 2 - 0.02, { r: 0.001 });
        k.box('brass', b, 0.04, 0.06, 0.004, x + sx * (pw / 2 - 0.02), y, D / 2 + 0.002, { r: 0.001 });
      }
    }
    k.box('fronts', w, W - 2 * pw - 0.01, 0.09, 0.02, 0, H - 0.075, D / 2 - 0.01, { r: 0.002 });
    addHandle(k, 'brass', b, 'cup', 0, H - 0.075, D / 2, {});
    k.box('top', w, W, 0.03, D, 0, H - 0.015, 0, { r: 0.003 });
    // brass corner caps on the top and straps across the ends
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box('brass', b, 0.06, 0.004, 0.06, sx * (W / 2 - 0.028), H + 0.002, sz * (D / 2 - 0.028), { r: 0.001 });
      k.box('brass', b, 0.004, 0.034, 0.06, sx * (W / 2 + 0.002), H - 0.015, sz * (D / 2 - 0.028), { r: 0.001 });
    }
    k.box('body', w, W - 2 * pw, 0.4, 0.018, 0, H - 0.3, -D / 2 + 0.03, { r: 0.002 });
    return finish(k);
  },
});

const glassTrestleDesk = o$({
  id: 'ofx-glass-trestle-desk', ko: '유리 상판 트레슬 책상', en: 'Glass-top trestle desk',
  params: [
    P.len('width', '폭', 'Width', 1.5, 1.0, 2.0),
    P.len('depth', '깊이', 'Depth', 0.75, 0.6, 0.9),
    P.mat('legs', '트레슬', 'Trestles', 'wood-oak', 'wood'),
    P.mat('glass', '유리', 'Glass', 'glass-frosted', 'glass'),
  ],
  tags: ['trestle desk', 'glass desk', 'a-frame desk', '트레슬 책상', '유리 책상', '삼각 다리', '홈오피스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.74, t = 0.012, legH = H - t;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.22);
      for (const sz of [-1, 1]) {
        k.rod('legs', p.legs, [x, 0, sz * (D / 2 - 0.08)], [x, legH - 0.04, sz * 0.12], 0.02, { segs: 4, r2: 0.02 });
      }
      k.box('legs', p.legs, 0.05, 0.04, D - 0.1, x, legH - 0.02, 0, { r: 0.004 });
      k.box('legs', p.legs, 0.035, 0.035, D * 0.55, x, legH * 0.38, 0, { r: 0.004 });
      for (const sz of [-1, 1]) k.cyl('pads', 'plastic-grey', 0.015, 0.015, 0.003, x, legH, sz * (D / 2 - 0.1), { segs: 10 });
    }
    k.box('glass', p.glass, W, t, D, 0, legH + 0.003 + t / 2, 0, { r: 0.003 });
    return finish(k);
  },
});

const consoleDesk = o$({
  id: 'ofx-console-desk', ko: '콘솔형 슬림 책상', en: 'Narrow console desk',
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.8, 1.4),
    P.len('depth', '깊이', 'Depth', 0.42, 0.35, 0.5),
    P.mat('wood', '목재', 'Wood', 'wood-ash', 'wood'),
    P.bool('gallery', '뒷턱', 'Back gallery', true),
  ],
  tags: ['console desk', 'laptop desk', 'slim desk', 'hallway desk', '콘솔 책상', '슬림 책상', '노트북 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.76, w = p.wood;
    k.box('top', w, W, 0.022, D, 0, H - 0.011, 0, { r: 0.004 });
    k.box('body', w, W - 0.08, 0.08, D - 0.06, 0, H - 0.062, -0.01, { r: 0.002 });
    k.box('fronts', w, W * 0.5, 0.06, 0.018, 0, H - 0.062, D / 2 - 0.035, { r: 0.002 });
    addHandle(k, 'handles', 'metal-brass', 'knob', 0, H - 0.062, D / 2 - 0.026, {});
    addLegs(k, 'legs', w, 'tapered', W - 0.02, D - 0.02, H - 0.1, { r: 0.018, splay: 0.02 });
    if (p.gallery) {
      k.box('top', w, W - 0.02, 0.06, 0.015, 0, H + 0.03, -D / 2 + 0.0075, { r: 0.003 });
      for (const s of [-1, 1]) k.box('top', w, 0.015, 0.04, 0.12, s * (W / 2 - 0.0075), H + 0.02, -D / 2 + 0.06, { r: 0.003 });
    }
    return finish(k);
  },
});

const wallFoldDesk = o$({
  id: 'ofx-wall-fold-desk', ko: '벽걸이 접이식 책상', en: 'Fold-down wall desk', placement: 'wall', elevation: 0.72,
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.6, 1.1),
    P.len('height', '높이', 'Height', 0.6, 0.45, 0.8),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('inside', '내부', 'Inside', 'wood-oak', 'wood'),
  ],
  tags: ['wall desk', 'fold down desk', 'murphy desk', 'floating desk', '벽걸이 책상', '접이식 책상', '월데스크', '좁은 공간'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.16, t = 0.018, fd = H - 0.04;
    const zf = D / 2;
    // cabinet box: sides, top, bottom, back
    for (const s of [-1, 1]) k.box('body', p.body, t, H, D, s * (W / 2 - t / 2), H / 2, 0, { r: 0.002 });
    k.box('body', p.body, W, t, D, 0, H - t / 2, 0, { r: 0.002 });
    k.box('body', p.body, W - 2 * t, t, D, 0, t / 2, 0, { r: 0.002 });
    k.box('inside', p.inside, W - 2 * t, H - 2 * t, 0.008, 0, H / 2, -D / 2 + 0.004, { r: 0 });
    // inside: shelf + dividers + a few things
    k.box('inside', p.inside, W - 2 * t, 0.012, D - 0.02, 0, H * 0.62, 0.0, { r: 0.001 });
    for (const x of [-W * 0.18, W * 0.18]) k.box('inside', p.inside, 0.012, H * 0.62 - t, D - 0.03, x, t + (H * 0.62 - t) / 2, -0.005, { r: 0.001 });
    books(k, -W / 2 + t + 0.01, -W * 0.18 - 0.01, H * 0.62 + 0.006, zf - 0.02, { seed: 5, hMin: 0.14, hMax: 0.19, dMin: 0.1, dMax: 0.12 });
    k.cyl('cup', 'ceramic-white', 0.03, 0.028, 0.09, W * 0.3, t, 0, { segs: k.seg(16, 8) });
    for (const a of [-0.15, 0, 0.18]) k.rod('cup', 'plastic-black', [W * 0.3 + a * 0.05, t + 0.02, 0], [W * 0.3 + a * 0.12, t + 0.14, 0.004], 0.004, { segs: 5 });
    // flap folded down = writing surface, with two stays
    k.box('flap', p.body, W - 0.004, t, fd, 0, t / 2, zf + fd / 2, { r: 0.002 });
    k.box('flap', p.inside, W - 0.06, 0.002, fd - 0.05, 0, t + 0.001, zf + fd / 2, { r: 0 });
    for (const s of [-1, 1]) k.rod('stays', 'metal-steel', [s * (W / 2 - t - 0.01), H * 0.45, zf - 0.01], [s * (W / 2 - 0.03), t + 0.004, zf + fd * 0.55], 0.004, { segs: 6 });
    return finish(k);
  },
});

const partnersDesk = o$({
  id: 'ofx-partners-desk', ko: '파트너스 데스크(양면)', en: 'Partners desk',
  params: [
    P.len('width', '폭', 'Width', 1.6, 1.4, 2.0),
    P.len('depth', '깊이', 'Depth', 1.05, 0.9, 1.2),
    P.mat('wood', '목재', 'Wood', 'wood-dark', 'wood'),
    P.mat('leather', '가죽 상판', 'Leather inset', 'leather-black', 'leather'),
  ],
  tags: ['partners desk', 'double sided desk', 'library desk', '파트너스 데스크', '양면 책상', '대형 서재 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.76, w = p.wood, pw = 0.45;
    for (const s of [-1, 1]) for (const side of [0, PI]) {
      transformAdded(k, () => addCabinet(k, { w: pw, h: H - 0.035, d: D / 2, z: D / 4, rows: [{ h: 0.34, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }], body: w, front: w, handle: 'bar', handleMat: 'metal-brass', plinth: 0.07 }), s * (W / 2 - pw / 2), 0, 0, side);
    }
    for (const side of [1, -1]) {
      k.box('fronts', w, W - 2 * pw - 0.01, 0.1, 0.02, 0, H - 0.085, side * (D / 2 - 0.01), { r: 0.002 });
      addHandle(k, 'handles', 'metal-brass', 'knob', 0, H - 0.085, side * D / 2, {});
    }
    k.box('body', w, W - 2 * pw, 0.1, D - 0.04, 0, H - 0.085, 0, { r: 0.002 });
    k.box('top', w, W + 0.04, 0.03, D + 0.04, 0, H - 0.015, 0, { r: 0.005 });
    k.box('leather', p.leather, W - 0.16, 0.003, D - 0.16, 0, H + 0.0015, 0, { r: 0.001 });
    return finish(k);
  },
});

/** Kidney (bean) outline: an ellipse whose front (+z) edge is pulled in at the middle. */
function kidneyShape(w, d, indent) {
  const pts = [];
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const x = (w / 2) * Math.cos(a);
    let z = (d / 2) * Math.sin(a);
    if (z > 0) z -= indent * Math.exp(-((x / (w * 0.22)) ** 2)) * (z / (d / 2)) ** 0.5;
    pts.push(new THREE.Vector2(x, z));
  }
  return new THREE.Shape(pts);
}

const kidneyDesk = o$({
  id: 'ofx-kidney-desk', ko: '콩팥형 책상', en: 'Kidney desk',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.1, 1.8),
    P.len('depth', '깊이', 'Depth', 0.75, 0.6, 0.9),
    P.num('indent', '앞쪽 오목', 'Front cut-in', 0.18, 0.05, 0.25),
    P.mat('wood', '목재', 'Wood', 'wood-oak', 'wood'),
  ],
  tags: ['kidney desk', 'bean desk', 'curved desk', 'vanity desk', '콩팥형 책상', '곡선 책상', '빈티지 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.76, w = p.wood, pw = 0.36;
    k.slab('top', w, kidneyShape(W, D, p.indent), 0.028, H - 0.028, { curveSegs: 32 });
    for (const s of [-1, 1]) addCabinet(k, { w: pw, h: H - 0.03, d: D * 0.62, x: s * (W / 2 - pw / 2 - 0.06), z: -D * 0.12, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.5, n: 1, type: 'drawer' }], body: w, front: w, handle: 'knob', handleMat: 'metal-brass', base: 'legs', legH: 0.12, legStyle: 'tapered', legMat: w });
    k.box('body', w, W - 2 * pw - 0.14, 0.35, 0.018, 0, H - 0.21, -D * 0.4, { r: 0.002 });
    return finish(k);
  },
});

const deskConverter = o$({
  id: 'ofx-desk-converter', ko: '스탠딩 데스크 변환대', en: 'Sit-stand desk converter', placement: 'surface',
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.6, 1.05),
    P.len('lift', '높이', 'Raised height', 0.3, 0.12, 0.5),
    P.mat('top', '상판', 'Top', 'wood-black', 'wood'),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['desk converter', 'standing desk riser', 'sit stand', '스탠딩 변환대', '데스크 라이저', '높이 조절', '모니터 받침'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.6, Hs = p.lift, f = p.frame;
    k.box('frame', f, W - 0.1, 0.025, D - 0.05, 0, 0.0125, 0, { r: 0.004 });
    // scissor X on both sides
    const zA = -D / 2 + 0.08, zB = D / 2 - 0.12;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.1);
      k.rod('frame', f, [x, 0.03, zA], [x, Hs - 0.03, zB], 0.012, { segs: 6 });
      k.rod('frame', f, [x, 0.03, zB], [x, Hs - 0.03, zA], 0.012, { segs: 6 });
      k.cyl('frame', 'metal-chrome', 0.012, 0.012, 0.03, x - 0.015, (Hs) / 2, (zA + zB) / 2, { rz: PI / 2, segs: 8 });
    }
    // work surface (monitor at the back) and keyboard tray in front, a step lower
    k.box('top', p.top, W, 0.022, 0.4, 0, Hs + 0.011, -D / 2 + 0.2, { r: 0.004 });
    k.box('frame', f, W - 0.06, 0.02, 0.06, 0, Hs - 0.06, D / 2 - 0.13, { r: 0.003 });
    for (const s of [-1, 1]) k.box('frame', f, 0.02, 0.07, 0.03, s * (W / 2 - 0.04), Hs - 0.035, -D / 2 + 0.39, { r: 0.003 });
    k.box('top', p.top, W, 0.018, 0.27, 0, Hs - 0.06, D / 2 - 0.01, { r: 0.004 });
    k.box('frame', 'plastic-black', 0.04, 0.012, 0.02, W / 2 - 0.05, Hs + 0.018, -D / 2 + 0.4, { r: 0.003 });
    return finish(k);
  },
});

/* ----------------------------------------------------------------- chairs */

const windsorChair = o$({
  id: 'ofx-windsor-desk-chair', ko: '윈저 책상 의자', en: 'Windsor desk chair',
  params: [
    P.int('spindles', '살 수', 'Spindles', 7, 5, 11),
    P.mat('wood', '목재', 'Wood', 'wood-oak', 'wood'),
  ],
  tags: ['windsor chair', 'spindle chair', 'wooden chair', 'desk chair', '윈저 체어', '원목 의자', '책상 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.wood, sy = 0.45, st = 0.04;
    // saddle seat: rounded slab
    k.slab('seat', w, superEllipseLike(0.46, 0.42), st, sy - st, { bevel: 0.012 });
    // splayed legs + H stretcher
    const legs = [[-0.17, 0.14], [0.17, 0.14], [-0.17, -0.12], [0.17, -0.12]];
    const foot = (x, z) => [x * 1.3, 0, z * 1.35];
    for (const [x, z] of legs) k.rod('legs', w, foot(x, z), [x, sy - st, z], 0.016, { r2: 0.019, segs: k.seg(10, 6) });
    const mid = (x, z, t) => { const f = foot(x, z); return [f[0] + (x - f[0]) * t, (sy - st) * t, f[2] + (z - f[2]) * t]; };
    for (const sx of [-1, 1]) k.rod('legs', w, mid(sx * 0.17, 0.14, 0.4), mid(sx * 0.17, -0.12, 0.4), 0.01, { segs: 6 });
    k.rod('legs', w, mid(-0.17, 0.01, 0.4), mid(0.17, 0.01, 0.4), 0.01, { segs: 6 });
    // bow back (hoop) with spindles
    const R = 0.2, zc = -0.16, top = 0.95;
    const hoop = [];
    for (let i = 0; i <= 12; i++) { const a = PI * (i / 12); hoop.push([-Math.cos(a) * R, sy + (top - sy) * Math.sin(a) ** 0.6, zc - 0.03 * Math.sin(a)]); }
    k.tube('back', w, hoop, 0.013, { segs: k.seg(36, 12), radial: k.seg(8, 5) });
    const n = p.spindles;
    for (let i = 0; i < n; i++) {
      const x = -R * 0.8 + (1.6 * R * i) / (n - 1);
      const a = Math.acos(clamp(-x / R, -1, 1));
      const yTop = sy + (top - sy) * Math.sin(a) ** 0.6;
      k.rod('back', w, [x * 0.95, sy - 0.005, zc + 0.02], [x, yTop - 0.01, zc - 0.03 * Math.sin(a)], 0.0065, { segs: 6 });
    }
    return finish(k);
  },
});

/** Rounded saddle outline (front wider). */
function superEllipseLike(w, d) {
  const s = new THREE.Shape();
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const x = (w / 2) * Math.sign(c) * Math.abs(c) ** 0.7 * (sn > 0 ? 1 : 0.88);
    const z = (d / 2) * Math.sign(sn) * Math.abs(sn) ** 0.8;
    if (i === 0) s.moveTo(x, z); else s.lineTo(x, z);
  }
  return s;
}

const ballChair = o$({
  id: 'ofx-balance-ball-chair', ko: '밸런스 볼 의자', en: 'Balance ball chair',
  params: [
    P.len('ball', '공 지름', 'Ball diameter', 0.52, 0.45, 0.6),
    P.mat('cover', '커버', 'Cover', 'fabric-wool-charcoal', 'fabric'),
    P.mat('frame', '프레임', 'Frame', 'plastic-black', 'plastic'),
    P.bool('back', '등받이', 'Backrest', true),
  ],
  tags: ['ball chair', 'balance ball chair', 'yoga ball chair', 'ergonomic', '짐볼 의자', '밸런스 볼', '자세 교정 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.ball / 2, f = p.frame;
    const ringY = 0.12, ringR = R * 0.62;
    // base: ring on four short legs with casters
    k.add('frame', f, new THREE.TorusGeometry(ringR, 0.018, k.seg(8, 4), k.seg(40, 12)).rotateX(PI / 2).translate(0, ringY, 0));
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('frame', f, [c * ringR, ringY, s * ringR], [c * (ringR + 0.1), 0.05, s * (ringR + 0.1)], 0.016, { segs: 8 });
      k.cyl('casters', 'rubber-black', 0.025, 0.025, 0.03, c * (ringR + 0.1), 0.025, s * (ringR + 0.1), { rz: PI / 2, segs: k.seg(12, 6) });
    }
    k.sphere('ball', p.cover, R, 0, ringY + R * 0.82, 0, { segs: k.seg(32, 12), rings: k.seg(20, 8) });
    if (p.back) {
      const bz = -ringR - 0.02;
      for (const s of [-1, 1]) k.bentTube('frame', f, [[s * 0.12, ringY, bz + 0.03], [s * 0.12, ringY + 0.05, bz - 0.01], [s * 0.12, ringY + R * 1.9, bz - 0.04]], 0.012, 0.04);
      k.soft('pad', p.cover, 0.34, 0.16, 0.05, 0.02, 0, ringY + R * 1.85, bz - 0.04, { rx: -0.1 });
    }
    return finish(k);
  },
});

const captainChair = o$({
  id: 'ofx-captain-chair', ko: '원목 회전 캡틴 의자', en: "Wooden swivel captain's chair",
  params: [
    P.mat('wood', '목재', 'Wood', 'wood-walnut', 'wood'),
    P.mat('seat', '시트', 'Seat pad', 'leather-cognac', 'leather'),
  ],
  tags: ["captain's chair", "banker's chair", 'swivel chair', 'wooden office chair', '캡틴 체어', '뱅커스 체어', '원목 회전의자', '앤틱 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.wood, sy = 0.47;
    // four-leg wooden base on casters + iron swivel column
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('legs', w, [c * 0.04, 0.2, s * 0.04], [c * 0.32, 0.06, s * 0.32], 0.022, { r2: 0.028, segs: k.seg(10, 6) });
      k.cyl('casters', 'metal-brass', 0.022, 0.022, 0.03, c * 0.32, 0.022, s * 0.32, { rz: PI / 2, ry: -a, segs: k.seg(12, 6) });
      k.cyl('casters', 'metal-black', 0.008, 0.008, 0.03, c * 0.32, 0.03, s * 0.32, { segs: 6 });
    }
    k.cyl('legs', w, 0.05, 0.06, 0.08, 0, 0.16, 0, { segs: k.seg(16, 8) });
    k.cyl('iron', 'metal-black', 0.025, 0.025, sy - 0.27, 0, 0.24, 0, { segs: k.seg(12, 6) });
    k.cyl('iron', 'metal-black', 0.13, 0.13, 0.015, 0, sy - 0.07, 0, { segs: k.seg(20, 8) });
    // round wooden seat with leather pad
    k.cyl('seat', w, 0.25, 0.24, 0.04, 0, sy - 0.055, 0, { segs: k.seg(32, 12) });
    k.cyl('pad', p.seat, 0.22, 0.225, 0.025, 0, sy - 0.015, 0, { segs: k.seg(32, 12) });
    // horseshoe arm rail on spindles
    const R = 0.25, railY = sy + 0.24;
    const arc = new THREE.TorusGeometry(R, 0.022, k.seg(8, 5), k.seg(36, 12), PI * 1.25).rotateX(PI / 2).rotateY(PI * 1.125); // arc centred at the back (−z), open at the front
    k.add('rail', w, arc.translate(0, railY, -0.02));
    k.box('rail', w, 0.3, 0.09, 0.03, 0, railY + 0.03, -0.02 - R, { r: 0.012 });
    const n = k.hi ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const ang = -PI / 2 + (i / (n - 1) - 0.5) * PI * 1.15;
      const x = Math.cos(ang) * R, z = -0.02 + Math.sin(ang) * R;
      k.rod('rail', w, [x * 0.92, sy - 0.02, z * 0.92], [x, railY, z], 0.008, { segs: 6 });
    }
    return finish(k);
  },
});

const caneChair = o$({
  id: 'ofx-cane-desk-chair', ko: '라탄(케인) 책상 의자', en: 'Cane desk chair',
  params: [
    P.mat('wood', '프레임', 'Frame', 'wood-oak', 'wood'),
    P.mat('cane', '케인', 'Cane', 'rattan', 'wood'),
    P.bool('arms', '팔걸이', 'Arms', false),
  ],
  tags: ['cane chair', 'rattan chair', 'wicker chair', 'desk chair', '라탄 의자', '케인 체어', '등나무 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.wood, W = 0.48, D = 0.48, sy = 0.46;
    const fr = 0.035;
    k.slab('seat', w, frameShape(W, D, fr, fr, 0.03), 0.03, sy - 0.03, { bevel: 0.004 });
    k.box('cane', p.cane, W - 2 * fr + 0.004, 0.006, D - 2 * fr + 0.004, 0, sy - 0.012, 0, { r: 0 });
    for (const [x, z] of [[-1, 1], [1, 1]]) k.box('legs', w, 0.035, sy - 0.03, 0.035, x * (W / 2 - 0.025), (sy - 0.03) / 2, z * (D / 2 - 0.025), { r: 0.006 });
    // back legs run up into the back frame, slightly raked
    const bt = 0.88;
    for (const s of [-1, 1]) k.rod('legs', w, [s * (W / 2 - 0.025), 0, -D / 2 + 0.03], [s * (W / 2 - 0.03), bt, -D / 2 - 0.03], 0.018, { segs: k.seg(8, 6) });
    const bh = 0.32, by = sy + 0.12 + bh / 2;
    k.panel('legs', w, frameShape(W - 0.04, bh, 0.03, 0.03, 0.02), 0.025, 0, by, -D / 2 - 0.015, { rx: -0.06 });
    k.box('cane', p.cane, W - 0.1, bh - 0.06, 0.006, 0, by, -D / 2 - 0.015, { r: 0, rx: -0.06 });
    k.box('legs', w, W - 0.04, 0.04, 0.03, 0, bt - 0.02, -D / 2 - 0.03, { r: 0.008 });
    for (const s of [-1, 1]) k.box('legs', w, 0.02, 0.02, D - 0.06, s * (W / 2 - 0.025), 0.15, 0, { r: 0.004 });
    if (p.arms) for (const s of [-1, 1]) {
      k.rod('legs', w, [s * (W / 2 - 0.02), sy, D / 2 - 0.05], [s * (W / 2 - 0.02), sy + 0.2, D / 2 - 0.08], 0.012, { segs: 6 });
      k.box('legs', w, 0.045, 0.025, D - 0.02, s * (W / 2 - 0.02), sy + 0.21, -0.02, { r: 0.008 });
    }
    return finish(k);
  },
});

/* -------------------------------------------------------------- bookcases */

const ladderShelf = o$({
  id: 'ofx-ladder-shelf', ko: '사다리형 책장', en: 'Leaning ladder bookshelf',
  params: [
    P.len('width', '폭', 'Width', 0.65, 0.45, 1.0),
    P.len('height', '높이', 'Height', 1.8, 1.4, 2.1),
    P.int('shelves', '선반 수', 'Shelves', 5, 3, 6),
    P.mat('wood', '목재', 'Wood', 'wood-oak', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['ladder shelf', 'leaning bookcase', 'ladder bookshelf', '사다리 선반', '사다리 책장', '기대는 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, w = p.wood, Db = 0.4, lean = Math.atan2(Db - 0.05, H);
    for (const s of [-1, 1]) k.rod('rails', w, [s * W / 2, 0, Db / 2 - 0.02], [s * W / 2, H, -Db / 2 + 0.02], 0.02, { segs: 4, r2: 0.02 });
    const n = p.shelves;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.35) / (n + 0.2);
      const y = H * t, zFront = Db / 2 - 0.02 - (Db - 0.04) * t;
      const d = (Db - 0.02) * (1 - t) + 0.12;
      k.box('shelves', w, W - 0.035, 0.02, d, 0, y, zFront - d / 2 + 0.01, { r: 0.003 });
      if (p.books && i % 2 === 0 && d > 0.17) books(k, -W / 2 + 0.03, W / 2 - 0.03, y + 0.01, zFront - 0.01, { seed: 11 + i, dMax: Math.min(0.2, d - 0.02), dMin: Math.min(0.13, d - 0.04), hMax: 0.24 });
    }
    void lean;
    return finish(k);
  },
});

const cubeBookcase = o$({
  id: 'ofx-cube-bookcase', ko: '큐브 책장(4×4)', en: 'Cube bookcase (4×4)',
  params: [
    P.int('cols', '가로 칸', 'Columns', 4, 2, 5),
    P.int('rows', '세로 칸', 'Rows', 4, 1, 5),
    P.len('cell', '칸 크기', 'Cell size', 0.335, 0.3, 0.4),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('bins', '수납 바구니', 'Bins', 'fabric-linen-grey', 'fabric'),
    P.bool('fill', '바구니·책', 'Bins & books', true),
  ],
  tags: ['cube bookcase', 'cube shelf', 'kallax', 'storage cubes', '큐브 책장', '칸 책장', '정리함 선반', '4x4'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = p.cell, t = 0.016, T = 0.038, nx = p.cols, ny = p.rows, D = 0.39;
    const W = nx * c + (nx - 1) * t + 2 * T, H = ny * c + (ny - 1) * t + 2 * T;
    for (const s of [-1, 1]) k.box('body', p.body, T, H, D, s * (W / 2 - T / 2), H / 2, 0, { r: 0.003 });
    for (const y of [T / 2, H - T / 2]) k.box('body', p.body, W - 2 * T, T, D, 0, y, 0, { r: 0.003 });
    for (let i = 1; i < nx; i++) k.box('body', p.body, t, H - 2 * T, D, -W / 2 + T + i * (c + t) - t / 2, H / 2, 0, { r: 0.0015 });
    for (let j = 1; j < ny; j++) k.box('body', p.body, W - 2 * T, t, D, 0, T + j * (c + t) - t / 2, 0, { r: 0.0015 });
    if (p.fill) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x0 = -W / 2 + T + i * (c + t), y0 = T + j * (c + t);
      const kind = (i * 3 + j * 5) % 4;
      if (kind === 0) {
        k.soft('bins', p.bins, c - 0.02, c - 0.03, D - 0.04, 0.01, x0 + c / 2, y0 + (c - 0.03) / 2, 0.0, { flat: 2 });
        k.box('handlesB', 'leather-brown', 0.08, 0.02, 0.006, x0 + c / 2, y0 + c - 0.08, D / 2 - 0.018, { r: 0.004 });
      } else if (kind === 1) books(k, x0 + 0.01, x0 + c - 0.01, y0, D / 2 - 0.02, { seed: i * 7 + j, hMax: Math.min(0.28, c - 0.03) });
    }
    return finish(k);
  },
});

const revolvingBookcase = o$({
  id: 'ofx-revolving-bookcase', ko: '회전 책장', en: 'Revolving bookcase',
  params: [
    P.int('tiers', '단 수', 'Tiers', 3, 2, 4),
    P.len('side', '한 변', 'Side', 0.5, 0.4, 0.6),
    P.mat('wood', '목재', 'Wood', 'wood-dark', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['revolving bookcase', 'rotating bookshelf', 'swivel bookcase', '회전 책장', '돌아가는 책장', '서재'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.side, w = p.wood, th = 0.3, t = 0.018;
    // fixed base + turntable
    k.box('base', w, S * 0.8, 0.06, S * 0.8, 0, 0.03, 0, { r: 0.006 });
    k.cyl('base', 'metal-black', S * 0.25, S * 0.25, 0.02, 0, 0.06, 0, { segs: k.seg(24, 8) });
    const y0 = 0.08;
    for (let i = 0; i <= p.tiers; i++) k.box('case', w, S, t, S, 0, y0 + i * th + t / 2, 0, { r: 0.003 });
    k.box('case', w, S * 0.3, (p.tiers) * th, S * 0.3, 0, y0 + (p.tiers * th) / 2, 0, { r: 0.002 });
    // each face: books (spines out) in its left half, vertical slats closing its right half
    // (the slats hide the book block of the neighbouring face, which sits behind them)
    for (let i = 0; i < p.tiers; i++) for (let q = 0; q < 4; q++) {
      const a = (q * PI) / 2;
      const y = y0 + i * th + t + (th - t) / 2;
      transformAdded(k, () => {
        for (let j = 0; j < 4; j++) k.box('slats', w, 0.04, th - t, 0.012, 0.03 + j * ((S / 2 - 0.05) / 3), y, S / 2 - 0.006, { r: 0.002 });
        if (p.books) books(k, -S / 2 + 0.01, -0.02, y0 + i * th + t, S / 2 - 0.01, { seed: i * 4 + q, hMax: 0.25, dMax: S / 2 - 0.06, dMin: 0.12, fill: 0.9, lean: false });
      }, 0, 0, 0, a);
    }
    k.cyl('case', w, 0.03, 0.04, 0.05, 0, y0 + p.tiers * th + t, 0, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const lowBookcase = o$({
  id: 'ofx-low-bookcase', ko: '낮은 긴 책장', en: 'Low long bookcase',
  params: [
    P.int('bays', '칸 수', 'Bays', 4, 2, 6),
    P.len('bay', '칸 폭', 'Bay width', 0.45, 0.35, 0.6),
    P.mat('wood', '목재', 'Wood', 'wood-walnut', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['low bookcase', 'long bookshelf', 'sideboard bookcase', 'under window shelf', '낮은 책장', '긴 책장', '창가 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.bays, b = p.bay, t = 0.02, W = n * b + t, H = 0.72, D = 0.32, w = p.wood;
    k.box('base', w, W - 0.03, 0.06, D - 0.04, 0, 0.03, -0.01, { r: 0.002 });
    k.box('case', w, W + 0.02, 0.025, D + 0.01, 0, H - 0.0125, 0.005, { r: 0.004 });
    k.box('case', w, W, t, D, 0, 0.06 + t / 2, 0, { r: 0.002 });
    k.box('case', w, W, H - 0.085, 0.01, 0, 0.06 + (H - 0.085) / 2, -D / 2 + 0.005, { r: 0 });
    for (let i = 0; i <= n; i++) k.box('case', w, t, H - 0.085, D, -W / 2 + t / 2 + i * b, 0.06 + (H - 0.085) / 2, 0, { r: 0.002 });
    const ys = 0.06 + t + (H - 0.085 - t) / 2;
    k.box('case', w, W - t, t, D - 0.01, 0, ys, 0.005, { r: 0.002 });
    if (p.books) for (let i = 0; i < n; i++) for (const [y, j] of [[0.06 + t, 0], [ys + t / 2, 1]]) {
      if ((i + j) % 3 === 2) continue;
      books(k, -W / 2 + t + i * b + 0.01, -W / 2 + (i + 1) * b - 0.005, y, D / 2 - 0.02, { seed: i * 3 + j + 1, hMax: 0.27, fill: 0.75 });
    }
    return finish(k);
  },
});

const cornerBookcase = o$({
  id: 'ofx-corner-bookcase', ko: '코너 책장', en: 'Corner bookcase',
  params: [
    P.len('side', '한 변', 'Side', 0.6, 0.45, 0.8),
    P.len('height', '높이', 'Height', 1.8, 1.2, 2.2),
    P.int('shelves', '선반 수', 'Shelves', 5, 3, 7),
    P.mat('wood', '목재', 'Wood', 'wood-white', 'wood'),
  ],
  tags: ['corner bookcase', 'corner shelf', 'quarter round shelf', '코너 책장', '모서리 선반', '코너 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.side, H = p.height, t = 0.018, w = p.wood;
    // the corner is at (−S/2, −S/2) of the footprint: two backs along −x and −z, quarter-round shelves
    const shelfShape = () => {
      const s = new THREE.Shape();
      s.moveTo(-S / 2, S / 2);
      s.lineTo(-S / 2, -S / 2 + 0.001);
      const n = 16;
      for (let i = 0; i <= n; i++) { const a = (i / n) * (PI / 2); s.lineTo(-S / 2 + S * Math.sin(a), -S / 2 + S * Math.cos(a)); }
      s.lineTo(-S / 2, -S / 2 + S);
      return s;
    };
    void shelfShape;
    // slab maps shape y → plan +z; build in plan coords: corner at back-left (x = −S/2, z = −S/2)
    const shape = new THREE.Shape();
    shape.moveTo(-S / 2, -S / 2);
    shape.lineTo(S / 2, -S / 2);
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * (PI / 2); shape.lineTo(-S / 2 + S * Math.cos(a), -S / 2 + S * Math.sin(a)); }
    shape.lineTo(-S / 2, -S / 2);
    const n = p.shelves;
    for (let i = 0; i <= n; i++) {
      const y = i === 0 ? 0.05 : i === n ? H - t : 0.05 + ((H - 0.05 - t) * i) / n;
      k.slab('shelves', w, shape, t, y, { bevel: 0.002, curveSegs: 16 });
    }
    k.box('backs', w, S, H, t, 0, H / 2, -S / 2 + t / 2, { r: 0.002 });
    k.box('backs', w, t, H, S - t, -S / 2 + t / 2, H / 2, t / 2, { r: 0.002 });
    k.box('backs', w, 0.06, 0.05, 0.06, S / 2 * 0.6, 0.025, 0.0, { r: 0.004 });
    for (let i = 1; i < n; i++) {
      const y = 0.05 + ((H - 0.05 - t) * i) / n + t;
      if (i % 2) books(k, -S / 2 + 0.03, S * 0.1, y, -S / 2 + 0.22, { seed: i + 20, dMax: 0.18, fill: 0.8 });
      else k.cyl('decor', 'ceramic-white', 0.05, 0.04, 0.16, -S / 2 + 0.12, y, -S / 2 + 0.12, { segs: k.seg(16, 8) });
    }
    return finish(k);
  },
});

const floatingLedges = o$({
  id: 'ofx-floating-ledges', ko: '벽 선반 북레지', en: 'Wall book ledges', placement: 'wall', elevation: 0.9,
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.5, 1.5),
    P.int('ledges', '선반 수', 'Ledges', 3, 1, 5),
    P.len('spacing', '간격', 'Spacing', 0.36, 0.28, 0.5),
    P.mat('wood', '목재', 'Wood', 'wood-white', 'wood'),
  ],
  tags: ['book ledge', 'picture ledge', 'floating shelf', 'wall shelf', '북레지', '벽 선반', '책 진열 선반', '플로팅 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, w = p.wood, d = 0.1;
    for (let i = 0; i < p.ledges; i++) {
      const y = i * p.spacing;
      k.box('ledges', w, W, 0.02, d, 0, y + 0.01, 0, { r: 0.002 });
      k.box('ledges', w, W, 0.06, 0.016, 0, y + 0.03, -d / 2 + 0.008, { r: 0.002 });
      k.box('ledges', w, W, 0.035, 0.012, 0, y + 0.0275, d / 2 - 0.006, { r: 0.002 });
      // face-out books leaning on the back
      const r = rng(i + 3);
      let x = -W / 2 + 0.04;
      while (x < W / 2 - 0.2) {
        const bw = 0.15 + r() * 0.06, bh = 0.2 + r() * 0.06;
        k.box('books', BOOK_MATS[Math.floor(r() * 4)], bw, bh, 0.018, x + bw / 2, y + 0.02 + bh / 2 * Math.cos(0.12), -0.01, { r: 0.002, rx: -0.12 });
        x += bw + 0.03 + r() * 0.05;
      }
    }
    return finish(k);
  },
});

const pegboard = o$({
  id: 'ofx-pegboard', ko: '타공판 정리 보드', en: 'Pegboard organiser', placement: 'wall', elevation: 0.95,
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.4, 1.0),
    P.len('height', '높이', 'Height', 0.8, 0.5, 1.2),
    P.mat('board', '보드', 'Board', 'paint-white-matte', 'paint'),
    P.mat('accessories', '부속', 'Accessories', 'metal-black', 'metal'),
  ],
  tags: ['pegboard', 'wall organiser', 'craft wall', 'tool board', '타공판', '페그보드', '벽 정리', '공구 보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, a = p.accessories, t = 0.012;
    k.box('board', p.board, W, H, t, 0, H / 2, -0.012, { r: 0.002 });
    k.box('frame', 'wood-oak', W + 0.02, 0.02, 0.025, 0, H + 0.005, -0.012, { r: 0.002 });
    const pitch = 0.05;
    const nx = Math.floor((W - 0.04) / pitch), ny = Math.floor((H - 0.04) / pitch);
    const x0 = -((nx - 1) * pitch) / 2, y0 = (H - (ny - 1) * pitch) / 2;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) k.cyl('holes', 'plastic-black', 0.003, 0.003, 0.0012, x0 + i * pitch, y0 + j * pitch, -0.012 + t / 2 - 0.0008, { rx: PI / 2, segs: 6 });
    const zf = -0.012 + t / 2;
    // shelf with jars
    const sy = H * 0.72;
    k.box('acc', a, W * 0.6, 0.006, 0.1, -W * 0.12, sy, zf + 0.05, { r: 0.001 });
    k.box('acc', a, W * 0.6, 0.03, 0.004, -W * 0.12, sy + 0.015, zf + 0.098, { r: 0 });
    for (let i = 0; i < 3; i++) k.cyl('jars', 'glass-clear', 0.03, 0.03, 0.08, -W * 0.12 - W * 0.2 + i * W * 0.2, sy + 0.003, zf + 0.05, { segs: k.seg(14, 8) });
    // wire basket
    const by = H * 0.3;
    k.box('acc', a, 0.2, 0.004, 0.1, W * 0.2, by, zf + 0.05, { r: 0 });
    for (const z of [zf + 0.002, zf + 0.098]) k.box('acc', a, 0.2, 0.08, 0.003, W * 0.2, by + 0.04, z, { r: 0 });
    for (const s of [-1, 1]) k.box('acc', a, 0.003, 0.08, 0.1, W * 0.2 + s * 0.1, by + 0.04, zf + 0.05, { r: 0 });
    // hooks with scissors / ruler / tape
    for (let i = 0; i < 3; i++) {
      const x = -W * 0.3 + i * 0.09, y = H * 0.48;
      k.bentTube('acc', a, [[x, y, zf], [x, y, zf + 0.05], [x, y + 0.02, zf + 0.06]], 0.002, 0.008);
    }
    k.box('tools', 'wood-ash', 0.03, 0.3, 0.004, -W * 0.3, H * 0.48 - 0.15, zf + 0.045, { r: 0.001 });
    k.add('tools', 'plastic-black', new THREE.TorusGeometry(0.02, 0.006, 6, k.seg(16, 8)).translate(-W * 0.3 + 0.09, H * 0.48 - 0.03, zf + 0.045));
    k.box('tools', 'metal-steel', 0.012, 0.12, 0.003, -W * 0.3 + 0.09, H * 0.48 - 0.11, zf + 0.045, { r: 0.001 });
    k.cyl('tools', 'plastic-black', 0.035, 0.035, 0.03, -W * 0.3 + 0.18, H * 0.48 - 0.04, zf + 0.03, { rx: PI / 2, segs: k.seg(16, 8) });
    return finish(k);
  },
});

const magazineRack = o$({
  id: 'ofx-magazine-rack', ko: '매거진 랙', en: 'Magazine rack',
  params: [
    P.len('width', '폭', 'Width', 0.42, 0.3, 0.6),
    P.mat('frame', '프레임', 'Frame', 'metal-brass', 'metal'),
    P.mat('wood', '바닥판', 'Base', 'wood-walnut', 'wood'),
  ],
  tags: ['magazine rack', 'newspaper holder', 'magazine holder', '매거진 랙', '잡지꽂이', '신문꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, f = p.frame, D = 0.3, H = 0.42;
    k.box('base', p.wood, W, 0.02, D, 0, 0.04, 0, { r: 0.004 });
    for (const s of [-1, 1]) for (const sz of [-1, 1]) k.cyl('frame', f, 0.007, 0.006, 0.03, s * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02), { segs: 8 });
    // three U frames (front, middle, back) splayed outwards
    for (const [z, tilt] of [[D / 2 - 0.02, 0.12], [0, 0], [-D / 2 + 0.02, -0.12]]) {
      const zt = z + Math.sin(tilt) * H;
      k.bentTube('frame', f, [[-W / 2 + 0.01, 0.05, z], [-W / 2 + 0.01, H, zt], [W / 2 - 0.01, H, zt], [W / 2 - 0.01, 0.05, z]], 0.006, 0.03);
    }
    // magazines in the two slots
    const mats = ['paper', 'book-red', 'book-blue', 'paper'];
    for (let i = 0; i < 4; i++) {
      const zc = (i < 2 ? 1 : -1) * (0.05 + (i % 2) * 0.02);
      k.box('mags', mats[i], W * 0.75, 0.29, 0.006, (i % 2 ? 0.02 : -0.02), 0.05 + 0.145, zc, { r: 0.001, rx: (i < 2 ? 1 : -1) * 0.12 });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------- devices (surface) */

const inkjetPrinter = o$({
  id: 'ofx-inkjet-printer', ko: '잉크젯 복합기(가정용)', en: 'Home inkjet printer', placement: 'surface',
  params: [
    P.mat('body', '본체', 'Body', 'plastic-black', 'plastic'),
    P.bool('paper', '용지', 'Paper loaded', true),
  ],
  tags: ['inkjet printer', 'home printer', 'all in one printer', 'scanner', '잉크젯 프린터', '복합기', '가정용 프린터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const b = p.body, W = 0.44, D = 0.34, H = 0.15;
    k.rbox('body', b, W, H - 0.03, D, 0.012, 0, (H - 0.03) / 2, 0, { segs: k.seg(3, 1) });
    // scanner lid
    k.rbox('body', b, W, 0.03, D - 0.02, 0.01, 0, H - 0.015, -0.01, { segs: k.seg(3, 1) });
    k.box('trim', 'plastic-grey', W - 0.02, 0.004, 0.01, 0, H - 0.03, D / 2 - 0.022, { r: 0 });
    // control panel tilted on the front-right with a small screen
    k.box('body', b, 0.14, 0.012, 0.06, W / 2 - 0.09, H - 0.04, D / 2 + 0.01, { r: 0.004, rx: 0.5 });
    k.box('display', 'light-cool', 0.06, 0.002, 0.035, W / 2 - 0.1, H - 0.032, D / 2 + 0.012, { r: 0, rx: 0.5 });
    // output tray pulled out + paper slot
    k.box('trim', 'plastic-grey', W - 0.12, 0.006, 0.18, 0, 0.05, D / 2 + 0.08, { r: 0.002 });
    k.box('trim', 'plastic-black', W - 0.1, 0.02, 0.006, 0, 0.065, D / 2 + 0.001, { r: 0 });
    // rear input tray tilted up
    k.box('trim', 'plastic-grey', W - 0.14, 0.2, 0.006, 0, H - 0.02 + 0.09, -D / 2 - 0.04, { r: 0.002, rx: -0.4 });
    if (p.paper) {
      k.box('paper', 'paper', 0.21, 0.18, 0.004, 0, H - 0.02 + 0.085, -D / 2 - 0.033, { r: 0, rx: -0.4 });
      k.box('paper', 'paper', 0.21, 0.002, 0.15, 0, 0.055, D / 2 + 0.08, { r: 0 });
    }
    return finish(k);
  },
});

const flatbedScanner = o$({
  id: 'ofx-flatbed-scanner', ko: '평판 스캐너', en: 'Flatbed scanner', placement: 'surface',
  params: [
    P.num('lid', '덮개 각도(°)', 'Lid angle (°)', 20, 0, 85, 1),
    P.mat('body', '본체', 'Body', 'plastic-black', 'plastic'),
  ],
  tags: ['scanner', 'flatbed scanner', 'photo scanner', '스캐너', '평판 스캐너', '사진 스캔'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.28, D = 0.38, H = 0.04, b = p.body;
    k.rbox('body', b, W, H, D, 0.01, 0, H / 2, 0, { segs: k.seg(3, 1) });
    k.box('glass', 'glass-tinted', W - 0.04, 0.003, D - 0.06, 0, H + 0.0005, 0.005, { r: 0 });
    const a = (p.lid * PI) / 180, L = D - 0.01, lt = 0.015;
    const hz = -D / 2 + 0.005, hy = H + lt / 2;
    k.rbox('lid', b, W, lt, L, 0.006, 0, hy + Math.sin(a) * L / 2, hz + Math.cos(a) * L / 2, { rx: -a, segs: k.seg(3, 1) });
    k.box('lid', 'paint-white-matte', W - 0.03, 0.002, L - 0.03, 0, hy - lt / 2 + Math.sin(a) * L / 2 - Math.cos(a) * 0.001, hz + Math.cos(a) * L / 2 + Math.sin(a) * 0.009, { rx: -a, r: 0 });
    for (const x of [0.08, 0.1, 0.12]) k.cyl('buttons', 'plastic-grey', 0.005, 0.005, 0.003, x - 0.12, H, D / 2 - 0.012, { segs: 8 });
    leds(k, [W / 2 - 0.03], H - 0.01, D / 2);
    return finish(k);
  },
});

const printer3d = o$({
  id: 'ofx-3d-printer', ko: '3D 프린터(FDM)', en: '3D printer (FDM)', placement: 'surface',
  params: [
    P.len('size', '프레임 크기', 'Frame size', 0.42, 0.32, 0.55),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal'),
    P.mat('filament', '필라멘트', 'Filament', 'plastic-white', 'plastic'),
  ],
  tags: ['3d printer', 'fdm printer', 'maker', 'filament', '3D 프린터', '쓰리디 프린터', '메이커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, f = p.frame, e = 0.02;
    // cube frame of extrusions
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', f, e, S, e, sx * (S / 2 - e / 2), S / 2, sz * (S / 2 - e / 2), { r: 0.001 });
    for (const y of [e / 2, S - e / 2]) {
      for (const sz of [-1, 1]) k.box('frame', f, S - 2 * e, e, e, 0, y, sz * (S / 2 - e / 2), { r: 0.001 });
      for (const sx of [-1, 1]) k.box('frame', f, e, e, S - 2 * e, sx * (S / 2 - e / 2), y, 0, { r: 0.001 });
    }
    // heated bed, printed part, gantry and hotend
    const by = S * 0.35;
    k.box('bed', 'metal-black', S - 0.08, 0.006, S - 0.08, 0, by, 0, { r: 0.001 });
    k.box('bed', 'glass-tinted', S - 0.1, 0.003, S - 0.1, 0, by + 0.0045, 0, { r: 0 });
    for (const sx of [-1, 1]) k.rod('rods', 'metal-chrome', [sx * 0.04, e, -S / 2 + e], [sx * 0.04, by - 0.003, -S / 2 + e + 0.001], 0.004, { segs: 6 });
    k.cyl('part', p.filament, 0.03, 0.04, 0.06, 0.02, by + 0.006, 0.01, { segs: k.seg(6, 6) });
    const gy = S * 0.62;
    k.rod('rods', 'metal-chrome', [-S / 2 + e, gy, 0], [S / 2 - e, gy, 0], 0.004, { segs: 6 });
    k.rod('rods', 'metal-chrome', [-S / 2 + e, gy + 0.03, 0], [S / 2 - e, gy + 0.03, 0], 0.004, { segs: 6 });
    k.box('head', 'plastic-black', 0.05, 0.06, 0.05, 0.02, gy + 0.015, 0.02, { r: 0.004 });
    k.cyl('head', 'metal-brass', 0.003, 0.006, 0.02, 0.02, gy - 0.035, 0.02, { segs: 8 });
    // control box with screen on the front bottom rail
    k.box('head', 'plastic-black', 0.1, 0.05, 0.03, S / 2 - 0.1, 0.045, S / 2 + 0.012, { r: 0.004, rx: 0.2 });
    k.box('display', 'light-cool', 0.07, 0.035, 0.002, S / 2 - 0.1, 0.047, S / 2 + 0.028, { r: 0, rx: 0.2 });
    // spool holder on top
    k.rod('rods', f, [-0.08, S, -S / 2 + 0.01], [-0.08, S + 0.12, -S / 2 + 0.01], 0.008, { segs: 6 });
    k.cyl('spool', 'plastic-black', 0.1, 0.1, 0.006, -0.08 - 0.03, S + 0.12, -S / 2 + 0.01, { rz: PI / 2, segs: k.seg(28, 10) });
    k.cyl('spool', 'plastic-black', 0.1, 0.1, 0.006, -0.08 + 0.036, S + 0.12, -S / 2 + 0.01, { rz: PI / 2, segs: k.seg(28, 10) });
    k.cyl('filament', p.filament, 0.085, 0.085, 0.06, -0.08 + 0.03, S + 0.12, -S / 2 + 0.01, { rz: PI / 2, segs: k.seg(28, 10) });
    return finish(k);
  },
});

const nas = o$({
  id: 'ofx-nas', ko: 'NAS 저장장치(4베이)', en: 'NAS storage (4-bay)', placement: 'surface',
  params: [
    P.int('bays', '베이 수', 'Drive bays', 4, 2, 6),
    P.mat('body', '본체', 'Body', 'plastic-black', 'plastic'),
  ],
  tags: ['nas', 'network storage', 'home server', 'hard drive', 'NAS', '나스', '네트워크 저장장치', '홈서버'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.bays, W = 0.04 + n * 0.042, H = 0.17, D = 0.23;
    k.rbox('body', p.body, W, H, D, 0.008, 0, H / 2 + 0.006, 0, { segs: k.seg(3, 1) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.01, 0.01, 0.006, sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.03), { segs: 8 });
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.02 + 0.042 * (i + 0.5);
      k.box('trays', 'plastic-grey', 0.038, 0.13, 0.008, x, 0.085, D / 2 + 0.003, { r: 0.002 });
      k.box('trays', 'plastic-black', 0.02, 0.006, 0.004, x, 0.135, D / 2 + 0.008, { r: 0.001 });
    }
    leds(k, [-W / 2 + 0.02, -W / 2 + 0.04, -W / 2 + 0.06], H - 0.012, D / 2 + 0.004);
    return finish(k);
  },
});

const tabletStand = o$({
  id: 'ofx-tablet-stand', ko: '태블릿 거치대와 키보드', en: 'Tablet on stand with keyboard', placement: 'surface',
  params: [
    P.len('size', '태블릿 폭', 'Tablet width', 0.25, 0.18, 0.33),
    P.num('tilt', '각도(°)', 'Tilt (°)', 70, 45, 85, 1),
    P.mat('stand', '거치대', 'Stand', 'metal-aluminium', 'metal'),
  ],
  tags: ['tablet stand', 'ipad stand', 'tablet', 'keyboard', '태블릿 거치대', '태블릿', '무선 키보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const tw = p.size, th = tw * 0.72, a = (p.tilt * PI) / 180, s = p.stand;
    k.box('stand', s, tw * 0.6, 0.008, 0.13, 0, 0.004, -0.04, { r: 0.002 });
    // hinged arm and cradle
    const ay = 0.008, az = -0.1;
    const L = 0.12;
    const top = [0, ay + Math.sin(a) * L, az + Math.cos(a) * L * 0.4];
    k.box('stand', s, 0.04, L, 0.008, 0, (ay + top[1]) / 2, (az + top[2]) / 2, { r: 0.002, rx: -(PI / 2 - a) * 0.4 });
    // tablet: plate tilted back by (90° − tilt)
    const back = PI / 2 - a;
    const cy = top[1] + Math.cos(back) * (th / 2) - 0.03, cz = top[2] + 0.015 - Math.sin(back) * (th / 2) + 0.03;
    k.box('tablet', 'plastic-black', tw, th, 0.007, 0, cy, cz, { r: 0.006, rx: -back });
    k.box('screen', 'screen-black', tw - 0.014, th - 0.014, 0.001, 0, cy + Math.sin(back) * 0.0, cz + 0.0036, { r: 0, rx: -back });
    k.box('stand', s, tw * 0.5, 0.012, 0.02, 0, cy - Math.cos(back) * th / 2 - 0.004, cz + Math.sin(back) * th / 2 + 0.006, { r: 0.003, rx: -back });
    // keyboard in front
    const kw = 0.28, kd = 0.11;
    k.box('keyboard', 'metal-aluminium', kw, 0.008, kd, 0, 0.004, 0.12, { r: 0.003 });
    for (let r = 0; r < 4; r++) k.box('keys', 'plastic-white', kw - 0.02 - (r === 3 ? 0.05 : 0), 0.003, 0.018, 0, 0.0095, 0.12 - kd / 2 + 0.015 + r * 0.022, { r: 0.001 });
    return finish(k);
  },
});

const bookStackItem = o$({
  id: 'ofx-book-stack', ko: '쌓아 둔 책', en: 'Stack of books', placement: 'surface',
  params: [
    P.int('count', '권 수', 'Books', 5, 2, 9),
    P.int('seed', '배치', 'Arrangement', 3, 1, 20),
    P.bool('glasses', '안경', 'Glasses on top', true),
  ],
  tags: ['books', 'book stack', 'pile of books', '책', '책 더미', '쌓인 책', '소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const top = bookStack(k, p.count, 0, 0, 0, p.seed);
    if (p.glasses) {
      for (const s of [-1, 1]) k.add('glasses', 'metal-black', new THREE.TorusGeometry(0.022, 0.0018, 4, k.seg(20, 8)).rotateX(PI / 2).translate(s * 0.028, top + 0.002, 0.02));
      k.rod('glasses', 'metal-black', [-0.007, top + 0.002, 0.02], [0.007, top + 0.002, 0.02], 0.0015, { segs: 4 });
      for (const s of [-1, 1]) k.rod('glasses', 'metal-black', [s * 0.05, top + 0.002, 0.02], [s * 0.052, top + 0.003, -0.1], 0.0015, { segs: 4 });
    }
    return finish(k);
  },
});

const blotterSet = o$({
  id: 'ofx-desk-blotter-set', ko: '가죽 데스크 매트 세트', en: 'Leather desk blotter set', placement: 'surface',
  params: [
    P.len('width', '매트 폭', 'Pad width', 0.8, 0.5, 1.0),
    P.mat('leather', '가죽', 'Leather', 'leather-brown', 'leather'),
  ],
  tags: ['desk pad', 'blotter', 'desk set', 'pen tray', 'letter holder', '데스크 매트', '가죽 매트', '펜 트레이', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.4, l = p.leather;
    k.slab('leather', l, roundRect(W, D, 0.02), 0.004, 0, { bevel: 0.0015 });
    for (const s of [-1, 1]) k.box('leather', l, 0.06, 0.006, D, s * (W / 2 - 0.03), 0.004, 0, { r: 0.002 });
    k.box('paper', 'paper', 0.21, 0.002, 0.297, -0.05, 0.0045, 0.02, { r: 0, ry: 0.08 });
    // pen tray, letter holder, card holder, pen cup behind the pad
    const z = -D / 2 - 0.07;
    k.slab('leather', l, frameShape(0.24, 0.08, 0.008, 0.008, 0.01), 0.025, 0, { x: -W / 2 + 0.14, z });
    k.box('leather', l, 0.23, 0.003, 0.07, -W / 2 + 0.14, 0.0015, z, { r: 0 });
    for (const dx of [-0.05, 0.03]) k.rod('pens', 'metal-gold', [-W / 2 + 0.14 + dx - 0.06, 0.012, z], [-W / 2 + 0.14 + dx + 0.06, 0.012, z + 0.005], 0.0045, { segs: 6 });
    const lx = 0.02;
    k.box('leather', l, 0.2, 0.12, 0.012, lx, 0.06, z - 0.03, { r: 0.004 });
    k.box('leather', l, 0.2, 0.09, 0.012, lx, 0.045, z + 0.03, { r: 0.004 });
    k.box('leather', l, 0.2, 0.012, 0.072, lx, 0.006, z, { r: 0.003 });
    k.box('paper', 'paper', 0.16, 0.1, 0.002, lx, 0.07, z, { r: 0 });
    k.cyl('leather', l, 0.04, 0.04, 0.1, W / 2 - 0.1, 0, z, { segs: k.seg(20, 8) });
    for (const [dx, dz, c] of [[-0.01, 0.005, 'metal-gold'], [0.012, -0.01, 'plastic-black'], [0.005, 0.014, 'metal-steel']]) k.rod('pens', c, [W / 2 - 0.1 + dx, 0.03, z + dz], [W / 2 - 0.1 + dx * 2.5, 0.15, z + dz * 2], 0.004, { segs: 6 });
    return finish(k);
  },
});

const wastebasket = o$({
  id: 'ofx-mesh-wastebasket', ko: '메시 휴지통', en: 'Mesh wastebasket',
  params: [
    P.len('height', '높이', 'Height', 0.32, 0.24, 0.42),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.bool('paper', '구긴 종이', 'Crumpled paper', true),
  ],
  tags: ['wastebasket', 'waste bin', 'trash can', 'mesh bin', '휴지통', '쓰레기통', '메시 휴지통'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, rb = 0.1, rt = 0.13, m = p.metal;
    k.cyl('base', m, rb, rb, 0.006, 0, 0, 0, { segs: k.seg(28, 10) });
    for (const [y, r, th] of [[0.006, rb, 0.004], [H - 0.004, rt, 0.005], [H * 0.5, (rb + rt) / 2, 0.002]]) k.add('rings', m, new THREE.TorusGeometry(r, th, 4, k.seg(36, 12)).rotateX(PI / 2).translate(0, y, 0));
    const n = k.hi ? 36 : 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('wires', m, [c * rb, 0.006, s * rb], [c * rt, H - 0.004, s * rt], 0.0012, { segs: 3 });
      k.rod('wires', m, [c * rb, 0.006, s * rb], [Math.cos(a + 0.35) * rt, H - 0.004, Math.sin(a + 0.35) * rt], 0.0012, { segs: 3 });
    }
    if (p.paper) for (const [x, y, z, r] of [[0.02, 0.05, 0.01, 0.045], [-0.04, 0.05, -0.02, 0.04], [0.0, 0.11, 0.02, 0.042]]) k.sphere('paper', 'paper', r, x, y, z, { segs: 7, rings: 5, scale: [1, 0.85, 1.1] });
    return finish(k);
  },
});

const paperTrimmer = o$({
  id: 'ofx-paper-trimmer', ko: '작두형 재단기', en: 'Guillotine paper trimmer', placement: 'surface',
  params: [
    P.num('arm', '칼날 각도(°)', 'Blade angle (°)', 35, 0, 80, 1),
    P.mat('base', '바탕판', 'Base', 'plastic-white', 'plastic'),
  ],
  tags: ['paper trimmer', 'guillotine', 'paper cutter', '재단기', '종이 재단기', '작두 재단기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.32, D = 0.42, t = 0.02;
    k.box('base', p.base, W, t, D, 0, t / 2, 0, { r: 0.004 });
    // printed grid lines
    for (let i = 1; i < 6; i++) k.box('lines', 'plastic-black', W - 0.04, 0.0006, 0.0015, -0.01, t + 0.0003, -D / 2 + (D / 6) * i, { r: 0 });
    for (let i = 1; i < 4; i++) k.box('lines', 'plastic-black', 0.0015, 0.0006, D - 0.04, -W / 2 + (W / 4) * i - 0.01, t + 0.0003, 0, { r: 0 });
    k.box('fence', 'metal-aluminium', 0.012, 0.02, D, -W / 2 + 0.006, t + 0.01, 0, { r: 0.002 });
    k.box('fence', 'metal-steel', 0.008, 0.004, D, W / 2 - 0.02, t + 0.002, 0, { r: 0 });
    // blade arm hinged at the back right
    const a = (p.arm * PI) / 180, L = D + 0.04;
    const hz = -D / 2 + 0.01, hy = t + 0.02, x = W / 2 - 0.016;
    k.box('arm', 'metal-steel', 0.012, 0.03, L, x, hy + Math.sin(a) * L / 2, hz + Math.cos(a) * L / 2, { r: 0.002, rx: -a });
    k.cyl('arm', 'metal-steel', 0.02, 0.02, 0.03, x - 0.015, hy, hz, { rz: PI / 2, segs: k.seg(14, 6) });
    const ex = hz + Math.cos(a) * L, ey = hy + Math.sin(a) * L;
    k.rod('handle', 'plastic-black', [x, ey, ex], [x, ey + 0.07 * Math.cos(a), ex + 0.07 * -Math.sin(a) + 0.02], 0.014, { segs: k.seg(12, 6) });
    k.box('paper', 'paper', 0.21, 0.001, 0.25, -0.03, t + 0.001, 0.0, { r: 0 });
    return finish(k);
  },
});

const bindersRow = o$({
  id: 'ofx-binders-row', ko: '레버아치 파일 줄', en: 'Row of lever-arch binders', placement: 'surface',
  params: [
    P.int('count', '권 수', 'Binders', 6, 2, 12),
    P.bool('mixed', '여러 색', 'Mixed colours', true),
  ],
  tags: ['binders', 'lever arch file', 'ring binder', 'files', '바인더', '레버아치 파일', '서류철', '파일'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.count, tW = 0.075, H = 0.32, D = 0.285, g = 0.004;
    const colors = p.mixed ? ['#2c5aa0', '#b8322a', '#2e7d4f', '#d9a21b'] : ['#2b2f36'];
    const W = n * (tW + g);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (tW + g) * (i + 0.5);
      const color = colors[i % colors.length];
      k.box('binder', 'plastic-white', tW, H, D, x, H / 2, 0, { r: 0.004, overrides: { color } });
      // spine label and finger hole
      k.box('labels', 'paper', tW * 0.6, 0.1, 0.002, x, H * 0.62, D / 2 + 0.001, { r: 0 });
      k.cyl('holes', 'plastic-black', 0.014, 0.014, 0.003, x, H * 0.22, D / 2 - 0.001, { rx: PI / 2, segs: k.seg(14, 8) });
    }
    return finish(k);
  },
});

const plannerBoard = o$({
  id: 'ofx-planner-board', ko: '월간 유리 플래너 보드', en: 'Monthly glass planner board', placement: 'wall', elevation: 1.1,
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.5),
    P.len('height', '높이', 'Height', 0.6, 0.4, 1.0),
    P.mat('glass', '유리', 'Glass', 'glass-frosted', 'glass'),
  ],
  tags: ['planner board', 'glass board', 'calendar whiteboard', 'monthly planner', '플래너 보드', '유리 화이트보드', '월간 계획표', '달력 보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, t = 0.006, z = 0.02;
    k.box('backing', 'paint-white-matte', W - 0.004, H - 0.004, 0.002, 0, H / 2, z - t / 2 - 0.002, { r: 0 });
    k.box('glass', p.glass, W, H, t, 0, H / 2, z, { r: 0.002 });
    // printed grid: title band + 5 rows × 7 columns
    const top = H - 0.08, zf = z + t / 2 + 0.0004;
    k.box('print', 'plastic-black', W - 0.06, 0.003, 0.0006, 0, top, zf, { r: 0 });
    for (let r = 1; r < 5; r++) k.box('print', 'plastic-black', W - 0.06, 0.0015, 0.0006, 0, 0.03 + ((top - 0.03) * r) / 5, zf, { r: 0 });
    for (let c = 1; c < 7; c++) k.box('print', 'plastic-black', 0.0015, top - 0.03, 0.0006, -W / 2 + 0.03 + ((W - 0.06) * c) / 7, 0.03 + (top - 0.03) / 2, zf, { r: 0 });
    k.box('print', 'book-red', 0.18, 0.025, 0.0006, -W / 2 + 0.13, H - 0.04, zf, { r: 0 });
    // standoffs in the corners and a marker tray
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.cyl('standoffs', 'metal-chrome', 0.012, 0.012, 0.03, sx * (W / 2 - 0.03), H / 2 + sy * (H / 2 - 0.03), z - 0.02, { rx: PI / 2, segs: k.seg(14, 6) });
    k.box('standoffs', 'metal-aluminium', 0.25, 0.012, 0.05, W / 4, -0.015, z, { r: 0.003 });
    for (let i = 0; i < 3; i++) k.rod('markers', ['book-red', 'book-blue', 'plastic-black'][i], [W / 4 - 0.07 + i * 0.02, -0.005, z], [W / 4 + 0.06 + i * 0.02, -0.005, z], 0.006, { segs: 6 });
    return finish(k);
  },
});

const wallHutch = o$({
  id: 'ofx-wall-hutch', ko: '벽걸이 책상 수납장', en: 'Wall-mounted desk hutch', placement: 'wall', elevation: 1.05,
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.6),
    P.len('height', '높이', 'Height', 0.6, 0.45, 0.8),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '문', 'Doors', 'wood-oak', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'edge', [['edge', '엣지', 'Edge pull'], ['knob', '노브', 'Knob'], ['none', '없음(푸시)', 'None (push)']]),
  ],
  tags: ['hutch', 'wall cabinet', 'overhead storage', 'desk hutch', '책상 수납장', '벽 수납장', '상부장', '오버헤드 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.3;
    const n = Math.max(2, Math.round(W / 0.4));
    addCabinet(k, { w: W, h: H, d: D, rows: [{ h: 0.3, n, type: 'open' }, { h: 0.7, n, type: 'door' }], body: p.body, front: p.front, base: 'none', handle: p.handle, handleMat: 'metal-aluminium' });
    // under-hutch cubby dividers in the open row
    for (let i = 1; i < n; i++) k.box('body', p.body, 0.016, H * 0.3, D - 0.04, -W / 2 + (W / n) * i, H * 0.15, -0.02, { r: 0.001 });
    books(k, -W / 2 + 0.03, -W / 2 + W / n - 0.02, 0.018, D / 2 - 0.04, { seed: 2, hMax: Math.min(0.16, H * 0.3 - 0.03), hMin: 0.1, dMax: 0.15, dMin: 0.1 });
    return finish(k);
  },
});

const drawerUnit = o$({
  id: 'ofx-drawer-unit-legs', ko: '다리형 3단 서랍장(책상 옆)', en: 'Wooden 3-drawer unit on legs',
  params: [
    P.len('width', '폭', 'Width', 0.42, 0.35, 0.55),
    P.len('height', '높이', 'Height', 0.62, 0.5, 0.75),
    P.mat('wood', '몸체', 'Body', 'wood-oak', 'wood'),
    P.mat('front', '서랍', 'Fronts', 'paint-grey-matte', 'paint'),
    P.pick('legStyle', '다리', 'Legs', 'tapered', [['tapered', '원목 테이퍼', 'Tapered wood'], ['metal', '금속', 'Metal'], ['hairpin', '헤어핀', 'Hairpin']]),
  ],
  tags: ['drawer unit', 'side drawers', 'desk drawers', 'bedside drawers', '서랍장', '3단 서랍', '책상 옆 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    addCabinet(k, { w: p.width, h: p.height, d: 0.42, rows: [{ h: 0.34, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }], body: p.wood, front: p.front, handle: 'cup', handleMat: 'metal-brass', base: 'legs', legH: 0.16, legStyle: p.legStyle, legMat: p.legStyle === 'tapered' ? p.wood : 'metal-black', top: p.wood, topThick: 0.02 });
    return finish(k);
  },
});

const typewriter = o$({
  id: 'ofx-typewriter', ko: '빈티지 타자기', en: 'Vintage typewriter', placement: 'surface',
  params: [
    P.mat('body', '본체', 'Body', 'paint-green-matte', 'paint'),
    P.bool('paper', '종이', 'Paper', true),
  ],
  tags: ['typewriter', 'vintage', 'retro', 'writer', '타자기', '빈티지', '레트로 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const b = p.body, W = 0.32;
    // body: sloped keyboard deck and raised back housing
    k.rbox('body', b, W, 0.06, 0.26, 0.015, 0, 0.03, 0, { segs: k.seg(3, 1) });
    k.rbox('body', b, W, 0.06, 0.14, 0.02, 0, 0.08, -0.05, { segs: k.seg(3, 1) });
    k.box('body', b, W - 0.02, 0.012, 0.14, 0, 0.065, 0.06, { r: 0.004, rx: 0.32 });
    // four rows of round keys on little stems
    const rows = [10, 11, 11, 10];
    rows.forEach((n, r) => {
      const z = 0.115 - r * 0.026, y = 0.075 + r * 0.008;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.024 + (r % 2) * 0.006;
        k.cyl('keys', 'plastic-black', 0.0085, 0.0085, 0.004, x, y, z, { segs: k.seg(12, 6) });
        k.cyl('stems', 'metal-chrome', 0.002, 0.002, 0.02, x, y - 0.02, z, { segs: 4 });
      }
    });
    k.box('keys', 'plastic-black', 0.12, 0.006, 0.014, 0, 0.068, 0.135, { r: 0.003 });
    // carriage with platen and knobs
    const cy = 0.135, cz = -0.08;
    k.box('carriage', 'metal-chrome', W + 0.08, 0.012, 0.03, 0, cy - 0.02, cz, { r: 0.003 });
    k.cyl('platen', 'rubber-black', 0.022, 0.022, W + 0.02, -W / 2 - 0.01, cy, cz, { rz: -PI / 2, segs: k.seg(20, 8) });
    for (const s of [-1, 1]) k.cyl('carriage', 'plastic-black', 0.02, 0.02, 0.02, s * (W / 2 + 0.03) - (s > 0 ? 0 : 0.02), cy, cz, { rz: -PI / 2, segs: k.seg(16, 6) });
    k.bentTube('carriage', 'metal-chrome', [[-W / 2 - 0.02, cy + 0.01, cz + 0.01], [-W / 2 - 0.05, cy + 0.03, cz + 0.05], [-W / 2 - 0.05, cy + 0.03, cz + 0.1]], 0.003, 0.02);
    if (p.paper) k.box('paper', 'paper', 0.21, 0.2, 0.0015, 0, cy + 0.1, cz - 0.015, { r: 0, rx: -0.15 });
    return finish(k);
  },
});

const craftTable = o$({
  id: 'ofx-craft-table', ko: '취미·공예 작업대', en: 'Craft & hobby table',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.0, 1.8),
    P.len('depth', '깊이', 'Depth', 0.7, 0.6, 0.85),
    P.mat('top', '상판', 'Top', 'wood-white', 'wood'),
    P.mat('bins', '수납함', 'Bins', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['craft table', 'hobby table', 'sewing table', 'work table', '공예 작업대', '취미 책상', '작업 테이블', '커팅 매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.76, t = p.top, cw = 0.42;
    k.box('top', t, W, 0.028, D, 0, H - 0.014, 0, { r: 0.004 });
    k.box('mat', 'paint-green-matte', 0.6, 0.003, 0.45, -W * 0.12, H + 0.0015, 0.02, { r: 0.001 });
    for (let i = 1; i < 12; i++) k.box('lines', 'paint-white-matte', 0.0015, 0.0005, 0.43, -W * 0.12 - 0.3 + i * 0.05, H + 0.0032, 0.02, { r: 0 });
    // storage tower with cubbies + bins on the right, two legs on the left
    const cx = W / 2 - cw / 2;
    // open cubby tower: sides, back, middle divider, three shelves; bins and paper in the cubbies
    const th = H - 0.028, pt = 0.018, td = D - 0.02;
    for (const s of [-1, 1]) k.box('body', t, pt, th, td, cx + s * (cw / 2 - pt / 2), th / 2, 0, { r: 0.002 });
    k.box('body', t, cw - 2 * pt, th, 0.008, cx, th / 2, -td / 2 + 0.004, { r: 0 });
    k.box('body', t, pt, th - 0.03, td - 0.01, cx, th / 2 + 0.015, 0.005, { r: 0.001 });
    const ch = (th - 0.03) / 3;
    for (let j = 0; j < 3; j++) k.box('body', t, cw - 2 * pt, pt, td - 0.01, cx, 0.03 + j * ch + pt / 2, 0.005, { r: 0.001 });
    k.box('body', t, cw, 0.03, 0.01, cx, 0.015, td / 2 - 0.005, { r: 0.001 });
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
      const x = cx - cw / 4 + (i * cw) / 2 + (i ? -pt / 4 : pt / 4), y = 0.03 + j * ch + pt;
      if ((i + j) % 2 === 0) k.soft('bins', p.bins, cw / 2 - 0.04, ch - pt - 0.03, td * 0.8, 0.01, x, y + (ch - pt - 0.03) / 2, 0.02, { flat: 2 });
      else k.box('paperStack', 'paper', cw / 2 - 0.06, 0.03 + j * 0.01, td * 0.6, x, y + 0.015 + j * 0.005, 0.0, { r: 0.001 });
    }
    for (const sz of [-1, 1]) k.box('legs', 'metal-white', 0.05, H - 0.028, 0.05, -W / 2 + 0.05, (H - 0.028) / 2, sz * (D / 2 - 0.05), { r: 0.004 });
    k.box('legs', 'metal-white', 0.03, 0.03, D - 0.12, -W / 2 + 0.05, 0.1, 0, { r: 0.004 });
    // supplies: pencil cup, spool, scissors
    k.cyl('supplies', 'ceramic-white', 0.035, 0.032, 0.1, W / 2 - 0.15, H, -D / 2 + 0.1, { segs: k.seg(16, 8) });
    k.cyl('supplies', 'fabric-terracotta', 0.02, 0.02, 0.05, W / 2 - 0.25, H, -D / 2 + 0.1, { segs: k.seg(14, 6) });
    return finish(k);
  },
});

const gamingPc = o$({
  id: 'ofx-gaming-pc', ko: '게이밍 PC(강화유리 케이스)', en: 'Gaming PC (glass side)',
  params: [
    P.len('height', '높이', 'Height', 0.47, 0.4, 0.55),
    P.mat('case', '케이스', 'Case', 'metal-black', 'metal'),
    P.pick('rgb', 'RGB 색', 'RGB colour', 'cool', [['cool', '푸른빛', 'Cool'], ['warm', '따뜻한 빛', 'Warm']]),
  ],
  tags: ['gaming pc', 'computer tower', 'desktop pc', 'rgb', '게이밍 PC', '데스크톱', '컴퓨터 본체', '본체'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, W = 0.22, D = 0.45, c = p.case, glow = p.rgb === 'cool' ? 'light-cool' : 'light-warm';
    // left side is tempered glass (−x); the rest is the steel case
    k.box('case', c, W - 0.006, 0.012, D, 0.003, H - 0.006, 0, { r: 0.003 });
    k.box('case', c, W - 0.006, 0.02, D, 0.003, 0.03, 0, { r: 0.003 });
    k.box('case', c, 0.006, H - 0.04, D, W / 2 - 0.003, H / 2 + 0.01, 0, { r: 0.002 });
    k.box('case', c, W - 0.012, H - 0.04, 0.006, 0, H / 2 + 0.01, -D / 2 + 0.003, { r: 0.001 });
    k.box('glass', 'glass-tinted', 0.005, H - 0.035, D - 0.004, -W / 2 + 0.0025, H / 2 + 0.01, 0, { r: 0.002 });
    for (const sz of [-1, 1]) k.box('feet', 'rubber-black', W - 0.02, 0.02, 0.04, 0, 0.01, sz * (D / 2 - 0.04), { r: 0.006 });
    // front mesh panel with three fans
    k.box('front', 'plastic-black', W, H - 0.03, 0.02, 0, H / 2 + 0.005, D / 2 - 0.01, { r: 0.004 });
    for (let i = 0; i < 3; i++) {
      const y = 0.1 + i * ((H - 0.16) / 2);
      k.add('display', glow, new THREE.TorusGeometry(0.055, 0.004, 4, k.seg(28, 10)).rotateY(PI / 2).translate(-W / 2 + 0.03, y, D / 2 - 0.08 - 0.0));
      k.cyl('fans', 'plastic-black', 0.055, 0.055, 0.025, -W / 2 + 0.03, y, D / 2 - 0.08, { rz: PI / 2, segs: k.seg(20, 8) });
    }
    // motherboard, GPU, CPU cooler, RAM with glow strip
    k.box('board', 'plastic-black', 0.004, H * 0.6, D * 0.55, W / 2 - 0.01, H * 0.55, -D * 0.12, { r: 0 });
    k.box('gpu', 'metal-aluminium', 0.05, 0.03, D * 0.6, W / 2 - 0.04, H * 0.38, -D * 0.05, { r: 0.004 });
    k.box('display', glow, 0.003, 0.006, D * 0.5, W / 2 - 0.066, H * 0.38 + 0.012, -D * 0.05, { r: 0 });
    k.cyl('fans', 'metal-aluminium', 0.04, 0.04, 0.06, W / 2 - 0.08, H * 0.66, -D * 0.12, { rz: PI / 2, segs: k.seg(20, 8) });
    k.add('display', glow, new THREE.TorusGeometry(0.04, 0.003, 4, k.seg(24, 8)).rotateY(PI / 2).translate(W / 2 - 0.111, H * 0.66, -D * 0.12));
    for (let i = 0; i < 2; i++) k.box('display', glow, 0.008, 0.035, 0.005, W / 2 - 0.03, H * 0.66, D * 0.06 + i * 0.012, { r: 0 });
    k.box('case', c, 0.015, 0.012, 0.012, -W / 2 + 0.03, H, D / 2 - 0.03, { r: 0.002 });
    return finish(k);
  },
});

export const ITEMS = [
  rollTopDesk, campaignDesk, glassTrestleDesk, consoleDesk, wallFoldDesk, partnersDesk, kidneyDesk, deskConverter,
  windsorChair, ballChair, captainChair, caneChair,
  ladderShelf, cubeBookcase, revolvingBookcase, lowBookcase, cornerBookcase, floatingLedges, pegboard, magazineRack,
  inkjetPrinter, flatbedScanner, printer3d, nas, tabletStand, bookStackItem, blotterSet, wastebasket, paperTrimmer, bindersRow,
  plannerBoard, wallHutch, drawerUnit, typewriter, craftTable, gamingPc,
];
