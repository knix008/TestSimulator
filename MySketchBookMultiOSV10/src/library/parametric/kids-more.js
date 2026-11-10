// More kids items: cribs, bassinet, cradle, toddler / house / car / loft / bunk / trundle beds,
// study desk + growing chair, book display, shelves, cubbies, organisers, play kitchen, tents,
// rocking horse, table sets, bean bag, changing table, glider, ball pit, slide, Pikler triangle,
// growth chart, mobile, night lamp, wardrobe, dollhouse, easel, train table, play mat, step
// stool, high chair, walker, teddy bear, blocks, playpen, mini sofa, rocking chair.
// Plus a few preset variants. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, variant, roundRect, ellipse, addCabinet, transformAdded, pillowGeo, T, rng } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const C = (color, extra = {}) => ({ overrides: { color }, ...extra });
const PAL = ['#e86b5f', '#f2c14e', '#5fa8d3', '#7cc47f', '#b48ad6', '#f29bb5'];

/** Closed loop of points around an ellipse (rx, rz) at height y. */
const loop = (rx, rz, y, n) => Array.from({ length: n }, (_, i) => { const a = (i / n) * PI * 2; return [Math.cos(a) * rx, y, Math.sin(a) * rz]; });

/** Simple kids chair (seat at seatH), front +z, placed at (x, z) turned by ry. */
function kidChair(k, { x = 0, z = 0, ry = 0, seatH = 0.3, mat = 'wood-pine', seat = 'plastic-white', color = PAL[0] } = {}) {
  transformAdded(k, (kk) => {
    const s = 0.3, legT = 0.03;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kk.box('chairs', mat, legT, seatH - 0.02, legT, sx * (s / 2 - 0.03), (seatH - 0.02) / 2, sz * (s / 2 - 0.03), { r: 0.006 });
    kk.rbox('seats', seat, s, 0.025, s, 0.008, 0, seatH - 0.0125, 0, C(color));
    for (const sx of [-1, 1]) kk.box('chairs', mat, legT, 0.28, legT, sx * (s / 2 - 0.03), seatH + 0.14, -(s / 2 - 0.03), { r: 0.006 });
    kk.rbox('seats', seat, s - 0.02, 0.11, 0.02, 0.008, 0, seatH + 0.22, -(s / 2 - 0.03), C(color));
  }, x, 0, z, ry);
}

/** Mattress + pillow on a bed deck at y (length along x). */
function mattress(k, ml, mw, y, bedding, accent, { t = 0.12, pillowAt = -1 } = {}) {
  k.soft('mattress', bedding, ml, t, mw, 0.035, 0, y + t / 2, 0, { puff: 0.006, flat: 4 });
  const g = pillowGeo(Math.min(0.45, mw * 0.7), 0.3, 0.1, k.seg(12, 5));
  T(g, 0, 0, 0, -PI / 2 + 0.25, PI / 2, 0);
  g.translate(pillowAt * (ml / 2 - 0.2), y + t + 0.05, 0);
  k.add('pillows', bedding, g);
  if (accent) k.soft('blanket', accent, ml * 0.4, 0.04, mw - 0.06, 0.015, -pillowAt * ml * 0.2, y + t + 0.02, 0, { puff: 0.005 });
}

/** Row of vertical slats between y0 and y1 along x (from x0 to x1) at z. */
function slatsX(k, role, mat, x0, x1, y0, y1, z, pitch = 0.07, w = 0.025) {
  const n = Math.max(2, Math.round((x1 - x0) / pitch));
  for (let i = 1; i < n; i++) k.box(role, mat, w, y1 - y0, w, x0 + ((x1 - x0) * i) / n, (y0 + y1) / 2, z, { r: 0.004 });
}
function slatsZ(k, role, mat, z0, z1, y0, y1, x, pitch = 0.07, w = 0.025) {
  const n = Math.max(2, Math.round((z1 - z0) / pitch));
  for (let i = 1; i < n; i++) k.box(role, mat, w, y1 - y0, w, x, (y0 + y1) / 2, z0 + ((z1 - z0) * i) / n, { r: 0.004 });
}

const WOOD = (def = 'wood-pine', ko = '나무', en = 'Wood') => P.mat('wood', ko, en, def, 'wood');
const BEDDING = P.mat('bedding', '침구', 'Bedding', 'fabric-cotton-white', 'fabric');
const ACCENT = (def = 'fabric-mustard') => P.mat('accent', '포인트 천', 'Accent fabric', def, 'fabric');

/* ------------------------------------------------------------------ cribs */

const cribConvertible = mk({
  id: 'kids-crib-convertible', category: 'kids', ko: '서랍형 변신 아기 침대', en: 'Convertible crib with drawer',
  params: [WOOD('wood-white'), BEDDING, P.bool('drawer', '하부 서랍', 'Drawer', true), P.len('base', '바닥 높이', 'Mattress height', 0.32, 0.2, 0.5)],
  tags: ['crib', 'baby bed', 'convertible crib', '아기 침대', '유아 침대', '베이비 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.3, D = 0.72, H = 0.95, po = 0.05, my = p.base;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, po, H, po, sx * (L / 2 - po / 2), H / 2, sz * (D / 2 - po / 2), { r: 0.01, segs: 2 });
    for (const sz of [-1, 1]) {
      const top = sz > 0 ? H - 0.12 : H - 0.03;
      k.box('frame', p.wood, L - 2 * po, 0.05, 0.04, 0, top, sz * (D / 2 - 0.025), { r: 0.008 });
      k.box('frame', p.wood, L - 2 * po, 0.05, 0.04, 0, my - 0.02, sz * (D / 2 - 0.025), { r: 0.006 });
      slatsX(k, 'frame', p.wood, -L / 2 + po, L / 2 - po, my, top - 0.025, sz * (D / 2 - 0.025), 0.068);
    }
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.025, H - my - 0.05, D - 2 * po, sx * (L / 2 - po / 2), (H + my) / 2 - 0.01, 0, { r: 0.006 });
    k.box('frame', 'plywood', L - 2 * po, 0.018, D - 2 * po, 0, my - 0.03, 0, { r: 0.001 });
    mattress(k, L - 0.12, D - 0.12, my - 0.021, p.bedding, null, { t: 0.1 });
    if (p.drawer && my > 0.22) {
      const dh = my - 0.08;
      k.box('frame', p.wood, L - 2 * po - 0.02, dh, 0.02, 0, 0.03 + dh / 2, D / 2 - 0.015, { r: 0.004 });
      k.cyl('handles', 'metal-brass', 0.014, 0.014, 0.02, 0, 0.03 + dh / 2, D / 2 - 0.005, { rx: PI / 2, segs: k.seg(12, 6) });
    }
    return finish(k);
  },
});

const cribRound = mk({
  id: 'kids-crib-oval', category: 'kids', ko: '타원형 아기 침대', en: 'Oval crib',
  params: [WOOD('wood-ash'), BEDDING, P.len('length', '길이', 'Length', 1.25, 1.0, 1.4)],
  tags: ['crib', 'oval crib', 'round crib', '아기 침대', '원형 아기 침대', '타원 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rx = p.length / 2, rz = 0.37, my = 0.3, top = 0.9;
    const n = k.hi ? 40 : 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      k.cyl('frame', p.wood, 0.011, 0.011, top - my, Math.cos(a) * rx, my, Math.sin(a) * rz, { segs: k.seg(8, 4) });
    }
    for (const y of [my, top]) k.tube('frame', p.wood, loop(rx, rz, y, 32), y === top ? 0.022 : 0.018, { closed: true, radial: k.seg(10, 5) });
    for (const s of [-1, 1]) for (const t of [-1, 1]) k.cyl('frame', p.wood, 0.022, 0.018, my, s * rx * 0.62, 0, t * rz * 0.7, { segs: k.seg(12, 6) });
    k.slab('frame', 'plywood', ellipse(rx * 2 - 0.04, rz * 2 - 0.04), 0.015, my - 0.02);
    k.slab('mattress', p.bedding, ellipse(rx * 2 - 0.06, rz * 2 - 0.06), 0.09, my - 0.005, { bevel: 0.025 });
    return finish(k);
  },
});

const bassinet = mk({
  id: 'kids-bassinet', category: 'kids', ko: '신생아 바구니 침대(바시넷)', en: 'Bassinet with hood',
  params: [P.mat('basket', '바구니', 'Basket', 'rattan', 'wood'), P.mat('fabric', '천', 'Fabric', 'fabric-cotton-white', 'fabric'), WOOD('wood-oak', '스탠드', 'Stand'), P.bool('hood', '덮개', 'Hood', true)],
  tags: ['bassinet', 'moses basket', 'newborn', '바시넷', '신생아 침대', '아기 바구니'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const y0 = 0.55;
    k.lathe('basket', p.basket, [[0, 0], [0.28, 0], [0.34, 0.06], [0.4, 0.22], [0.41, 0.25], [0.38, 0.25], [0.37, 0.22], [0.31, 0.03], [0, 0.03]], 0, y0, 0, { scale: [1, 1, 0.58], segs: k.seg(36, 12) });
    k.lathe('fabric', p.fabric, [[0, 0], [0.33, 0], [0.35, 0.04], [0, 0.04]], 0, y0 + 0.03, 0, { scale: [1, 1, 0.56], segs: k.seg(28, 10) });
    if (p.hood) k.sphere('fabric', p.fabric, 0.22, -0.2, y0 + 0.2, 0, { scale: [1, 1.05, 1.0], thetaLength: PI / 2, rz: PI / 2, segs: k.seg(20, 8), rings: k.seg(10, 4) });
    for (const sx of [-1, 1]) {
      k.rod('stand', p.wood, [sx * 0.32, 0, -0.18], [sx * 0.22, y0, 0.12], 0.016);
      k.rod('stand', p.wood, [sx * 0.32, 0, 0.18], [sx * 0.22, y0, -0.12], 0.016);
    }
    k.rod('stand', p.wood, [-0.32, 0.1, -0.15], [0.32, 0.1, -0.15], 0.012);
    k.rod('stand', p.wood, [-0.32, 0.1, 0.15], [0.32, 0.1, 0.15], 0.012);
    return finish(k);
  },
});

const cradle = mk({
  id: 'kids-cradle-rocking', category: 'kids', ko: '흔들 요람', en: 'Rocking cradle',
  params: [WOOD('wood-oak'), BEDDING],
  tags: ['cradle', 'rocking cradle', '요람', '흔들 요람', '아기 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.95, D = 0.5, y0 = 0.22, H = 0.42;
    for (const sz of [-1, 1]) {
      for (const y of [y0, y0 + H]) k.box('frame', p.wood, L, 0.035, 0.035, 0, y, sz * D / 2, { r: 0.008 });
      slatsX(k, 'frame', p.wood, -L / 2, L / 2, y0, y0 + H, sz * D / 2, 0.07, 0.02);
    }
    for (const sx of [-1, 1]) {
      const hh = sx < 0 ? H + 0.12 : H;
      k.box('frame', p.wood, 0.03, hh, D + 0.035, sx * L / 2, y0 + hh / 2 - 0.02, 0, { r: 0.008 });
      const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8 - 0.5; return [sx * L * 0.42, 0.025 + 0.14 * (t * 2) ** 2, t * 0.75]; });
      k.tube('frame', p.wood, pts, 0.022, { caps: true });
      k.box('frame', p.wood, 0.03, y0 - 0.02, 0.05, sx * L * 0.42, y0 / 2, 0, { r: 0.006 });
    }
    k.box('frame', 'plywood', L, 0.015, D, 0, y0 - 0.01, 0, { r: 0.001 });
    mattress(k, L - 0.05, D - 0.05, y0, p.bedding, null, { t: 0.07 });
    return finish(k);
  },
});

/* ------------------------------------------------------------------ beds */

const toddlerBed = mk({
  id: 'kids-toddler-bed', category: 'kids', ko: '유아 침대(가드 레일)', en: 'Toddler bed with guard rails',
  params: [WOOD('wood-white'), BEDDING, ACCENT('fabric-velvet-rose'), P.len('length', '길이', 'Length', 1.46, 1.3, 1.7)],
  tags: ['toddler bed', 'kids bed', 'guard rail', '유아 침대', '아이 침대', '어린이 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.76, y = 0.18;
    k.box('frame', p.wood, L, 0.12, D, 0, y - 0.06, 0, { r: 0.01 });
    for (const sx of [-1, 1]) {
      const hh = sx < 0 ? 0.62 : 0.46;
      k.rbox('frame', p.wood, 0.04, hh, D + 0.02, 0.018, sx * (L / 2 + 0.02), hh / 2, 0);
    }
    for (const sz of [-1, 1]) {
      const rx = sz > 0 ? -L * 0.18 : 0, rl = sz > 0 ? L * 0.5 : L - 0.1;
      k.rbox('frame', p.wood, rl, 0.03, 0.03, 0.012, rx, y + 0.26, sz * (D / 2 - 0.01));
      for (const s of [-1, 1]) k.box('frame', p.wood, 0.03, 0.14, 0.03, rx + s * (rl / 2 - 0.02), y + 0.18, sz * (D / 2 - 0.01), { r: 0.006 });
      slatsX(k, 'frame', p.wood, rx - rl / 2, rx + rl / 2, y + 0.12, y + 0.25, sz * (D / 2 - 0.01), 0.1, 0.02);
    }
    mattress(k, L - 0.06, D - 0.06, y, p.bedding, p.accent, { t: 0.11 });
    return finish(k);
  },
});

const houseBed = mk({
  id: 'kids-house-bed', category: 'kids', ko: '하우스 프레임 침대(몬테소리)', en: 'House-frame floor bed',
  params: [WOOD('wood-pine'), BEDDING, ACCENT('fabric-linen-grey'), P.pick('size', '매트리스', 'Mattress', 'single', [['single', '싱글', 'Single'], ['junior', '주니어', 'Junior']])],
  tags: ['house bed', 'montessori bed', 'floor bed', '하우스 침대', '몬테소리 침대', '저상 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [ml, mw] = p.size === 'junior' ? [1.6, 0.8] : [2.0, 1.0];
    const L = ml + 0.08, D = mw + 0.08, wall = 1.3, ridge = 1.75, po = 0.045;
    k.box('frame', p.wood, L, 0.1, D, 0, 0.05, 0, { r: 0.006 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.box('frame', p.wood, po, wall, po, sx * (L / 2 - po / 2), wall / 2, sz * (D / 2 - po / 2), { r: 0.006 });
      for (const sz of [-1, 1]) k.rod('frame', p.wood, [sx * (L / 2 - po / 2), wall, sz * (D / 2 - po / 2)], [sx * (L / 2 - po / 2), ridge, 0], 0.022, { segs: k.seg(8, 4) });
      k.box('frame', p.wood, 0.03, 0.06, D - po, sx * (L / 2 - po / 2), 0.4, 0, { r: 0.004 });
    }
    k.rod('frame', p.wood, [-L / 2, ridge, 0], [L / 2, ridge, 0], 0.024, { segs: k.seg(10, 4) });
    for (const sz of [-1, 1]) k.box('frame', p.wood, L, 0.04, 0.03, 0, wall - 0.02, sz * (D / 2 - po / 2), { r: 0.005 });
    mattress(k, ml, mw, 0.1, p.bedding, p.accent, { t: 0.14 });
    return finish(k);
  },
});

const carBed = mk({
  id: 'kids-car-bed', category: 'kids', ko: '자동차 침대', en: 'Race-car bed',
  params: [P.mat('body', '차체', 'Body', 'paint-white-gloss', 'paint'), P.color('color', '차체 색', 'Body colour', '#d8332c'), BEDDING],
  tags: ['car bed', 'race car bed', 'kids bed', '자동차 침대', '어린이 침대', '레이싱카 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.15, D = 1.05, t = 0.04;
    const prof = [[-1.07, 0.08], [1.07, 0.08], [1.07, 0.3], [0.95, 0.42], [0.55, 0.45], [0.35, 0.62], [-0.55, 0.62], [-0.8, 0.5], [-1.07, 0.5]];
    const shape = new THREE.Shape(prof.map(([x, y]) => new THREE.Vector2(x, y)));
    const win = new THREE.Path(); win.moveTo(0.3, 0.5); win.lineTo(-0.5, 0.5); win.lineTo(-0.5, 0.58); win.lineTo(0.25, 0.58); win.closePath();
    for (const sz of [-1, 1]) k.panel('body', p.body, shape, t, 0, 0, sz * (D / 2 - t / 2), { bevel: 0.01, ...C(p.color) });
    k.box('body', p.body, 0.04, 0.3, D - 2 * t, L / 2 - 0.02, 0.23, 0, { r: 0.01, ...C(p.color) });
    k.box('body', p.body, 0.04, 0.42, D - 2 * t, -L / 2 + 0.02, 0.29, 0, { r: 0.01, ...C(p.color) });
    k.box('trim', 'plastic-black', 0.5, 0.04, D + 0.04, -0.85, 0.6, 0, { r: 0.01 });
    for (const sz of [-1, 1]) {
      k.box('trim', 'plastic-black', 0.75, 0.06, 0.006, -0.12, 0.55, sz * (D / 2 + 0.003), { r: 0.002 });
      for (const sx of [-0.7, 0.7]) k.cyl('wheels', 'rubber-black', 0.17, 0.17, 0.07, sx, 0.17, sz > 0 ? D / 2 : -D / 2 - 0.07, { rx: PI / 2, segs: k.seg(28, 10) });
      for (const sx of [-0.7, 0.7]) k.cyl('trim', 'metal-chrome', 0.08, 0.08, 0.075, sx, 0.17, sz > 0 ? D / 2 : -D / 2 - 0.075, { rx: PI / 2, segs: k.seg(20, 8) });
      k.cyl('trim', 'plastic-white', 0.035, 0.035, 0.01, L / 2, 0.3, sz * 0.32, { rz: -PI / 2, segs: k.seg(14, 6) });
    }
    k.box('frame', 'plywood', L - 0.1, 0.02, D - 2 * t, 0, 0.12, 0, { r: 0.001 });
    mattress(k, 1.9, 0.9, 0.13, p.bedding, null, { t: 0.13, pillowAt: -1 });
    return finish(k);
  },
});

const loftDesk = mk({
  id: 'kids-loft-bed-desk', category: 'kids', ko: '책상 일체형 로프트 침대', en: 'Loft bed with desk',
  params: [WOOD('wood-white'), P.mat('desk', '책상 상판', 'Desk top', 'wood-oak', 'wood'), BEDDING, ACCENT('fabric-navy'), P.pick('ladder', '사다리 위치', 'Ladder side', 'right', [['right', '오른쪽', 'Right'], ['left', '왼쪽', 'Left']])],
  tags: ['loft bed', 'high sleeper', 'bed with desk', '로프트 침대', '벙커 침대', '책상 침대', '2층 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.08, D = 1.08, H = 1.85, y = 1.3, po = 0.06, ls = p.ladder === 'left' ? -1 : 1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, po, H, po, sx * (L / 2 - po / 2), H / 2, sz * (D / 2 - po / 2), { r: 0.008, segs: 2 });
    for (const sz of [-1, 1]) k.box('frame', p.wood, L - 2 * po, 0.12, 0.03, 0, y - 0.06, sz * (D / 2 - 0.02), { r: 0.005 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.03, 0.42, D - 2 * po, sx * (L / 2 - 0.03), y + 0.12, 0, { r: 0.005 });
    k.box('frame', 'plywood', L - 2 * po, 0.015, D - 0.08, 0, y - 0.03, 0, { r: 0.001 });
    mattress(k, 2.0, 1.0, y - 0.02, p.bedding, p.accent, { t: 0.14, pillowAt: -ls });
    k.box('frame', p.wood, L - 2 * po, 0.08, 0.025, 0, y + 0.3, -(D / 2 - 0.0125), { r: 0.005 });
    k.box('frame', p.wood, L - 2 * po - 0.48, 0.08, 0.025, -ls * 0.24, y + 0.3, D / 2 - 0.0125, { r: 0.005 });
    const lx = ls * (L / 2 - po - 0.24), lz = D / 2 + 0.02;
    for (const s of [-1, 1]) k.box('frame', p.wood, 0.04, y + 0.34, 0.035, lx + s * 0.19, (y + 0.34) / 2, lz, { r: 0.008 });
    for (let i = 1; i <= 5; i++) k.rod('frame', p.wood, [lx - 0.17, (i / 6) * (y + 0.05), lz], [lx + 0.17, (i / 6) * (y + 0.05), lz], 0.016);
    // desk under the bed + shelf unit at the other end
    const dw = L - 2 * po - 0.5;
    k.box('desk', p.desk, dw, 0.025, 0.6, -ls * 0.24 + ls * 0.01, 0.74, -D / 2 + 0.33, { r: 0.004 });
    k.box('frame', p.wood, 0.02, 0.74, 0.6, -ls * (L / 2 - po - 0.01), 0.37, -D / 2 + 0.33, { r: 0.003 });
    k.box('frame', p.wood, 0.4, 1.0, 0.36, ls * (L / 2 - po - 0.21), 0.5, -D / 2 + 0.22, { r: 0.004 });
    for (const yy of [0.33, 0.66]) k.box('desk', p.desk, 0.38, 0.018, 0.34, ls * (L / 2 - po - 0.21), yy, -D / 2 + 0.235, { r: 0.002 });
    return finish(k);
  },
});

const bunkStairs = mk({
  id: 'kids-bunk-bed-stairs', category: 'kids', ko: '계단 수납 2층 침대', en: 'Bunk bed with storage stairs',
  params: [WOOD('wood-pine'), P.mat('fronts', '계단 서랍', 'Stair fronts', 'paint-white-matte', 'paint'), BEDDING, ACCENT('fabric-velvet-green')],
  tags: ['bunk bed', 'staircase bunk', 'storage stairs', '2층 침대', '계단 침대', '이층 침대', '수납 계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.08, D = 1.06, H = 1.68, lo = 0.25, hi = 1.18, po = 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, po, H, po, sx * (L / 2 - po / 2), H / 2, sz * (D / 2 - po / 2), { r: 0.008, segs: 2 });
    for (const y of [lo, hi]) {
      for (const sz of [-1, 1]) k.box('frame', p.wood, L - 2 * po, 0.1, 0.03, 0, y - 0.05, sz * (D / 2 - 0.02), { r: 0.005 });
      k.box('frame', 'plywood', L - 2 * po, 0.015, D - 0.08, 0, y - 0.03, 0, { r: 0.001 });
      mattress(k, 2.0, 1.0, y - 0.02, p.bedding, p.accent, { t: 0.13 });
    }
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.025, H - hi, D - 2 * po, sx * (L / 2 - po / 2), (H + hi) / 2, 0, { r: 0.005 });
    k.box('frame', p.wood, L - 2 * po, 0.08, 0.025, 0, hi + 0.3, -(D / 2 - 0.0125), { r: 0.005 });
    k.box('frame', p.wood, L - 2 * po - 0.5, 0.08, 0.025, -0.25, hi + 0.3, D / 2 - 0.0125, { r: 0.005 });
    // staircase cabinet beside the right end: 4 steps
    const sw = 0.5, sd = D - 0.06, x0 = L / 2 + sw / 2;
    for (let i = 0; i < 4; i++) {
      const top = ((i + 1) / 4) * hi, dz = sd / 4;
      const z = D / 2 - 0.03 - dz * (i + 0.5);
      k.box('frame', p.wood, sw, top, dz, x0, top / 2, z, { r: 0.004 });
      k.box('fronts', p.fronts, sw - 0.04, Math.min(0.24, top - 0.06), 0.015, x0, top - Math.min(0.24, top - 0.06) / 2 - 0.03, z + dz / 2 + 0.006, { r: 0.003 });
    }
    k.box('frame', p.wood, 0.03, 0.5, 0.03, x0 + sw / 2 - 0.02, hi + 0.25, -D / 2 + 0.06, { r: 0.006 });
    return finish(k);
  },
});

const trundle = mk({
  id: 'kids-trundle-bed', category: 'kids', ko: '트런들(보조 침대) 싱글 침대', en: 'Single bed with trundle',
  params: [WOOD('wood-white'), BEDDING, ACCENT('fabric-velvet-blue'), P.num('open', '트런들 꺼냄', 'Trundle out', 0.6, 0, 1, 0.05)],
  tags: ['trundle bed', 'guest bed', 'pull out bed', '트런들 침대', '보조 침대', '아이 침대', '싱글 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.06, D = 1.04, y = 0.42;
    k.box('frame', p.wood, L, 0.22, D, 0, y - 0.11, 0, { r: 0.008 });
    for (const sx of [-1, 1]) {
      const hh = sx < 0 ? 0.95 : 0.7;
      k.rbox('frame', p.wood, 0.05, hh, D + 0.03, 0.02, sx * (L / 2 + 0.025), hh / 2, 0);
    }
    k.box('frame', p.wood, L - 0.4, 0.06, 0.03, -0.1, y + 0.3, -(D / 2 - 0.015), { r: 0.006 });
    mattress(k, 2.0, 1.0, y, p.bedding, p.accent, { t: 0.15 });
    const out = p.open * 0.85;
    const tz = 0.02 + out;
    k.box('frame', p.wood, L - 0.12, 0.17, D - 0.08, 0, 0.1, tz, { r: 0.006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.02, 0.02, 0.018, sx * (L / 2 - 0.15), 0.0, tz + sz * (D / 2 - 0.1), { segs: k.seg(10, 5) });
    if (out > 0.1) k.soft('mattress', p.bedding, 1.9, 0.08, 0.9, 0.03, 0, 0.19 + 0.04, tz, { puff: 0.005 });
    return finish(k);
  },
});

/* ---------------------------------------------------------- desk & chairs */

const studyDesk = mk({
  id: 'kids-study-desk-adjustable', category: 'kids', ko: '높이조절 각도 책상', en: 'Height-adjustable tilting study desk',
  params: [P.len('width', '폭', 'Width', 1.0, 0.8, 1.2), P.len('height', '높이', 'Height', 0.62, 0.5, 0.76), P.num('tilt', '상판 각도(°)', 'Top tilt (°)', 15, 0, 40, 1), P.mat('top', '상판', 'Top', 'wood-white', 'wood'), P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'), P.color('accent', '포인트 색', 'Accent colour', '#5fa8d3')],
  tags: ['study desk', 'kids desk', 'adjustable desk', 'ergonomic desk', '학생 책상', '높이조절 책상', '각도 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.62, h = p.height, a = (p.tilt * PI) / 180;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.1);
      k.box('frame', p.frame, 0.06, 0.03, d, x, 0.015, 0, { r: 0.008 });
      k.box('frame', p.frame, 0.06, h - 0.05, 0.05, x, (h - 0.05) / 2 + 0.02, -0.04, { r: 0.006 });
      k.box('accent', 'plastic-white', 0.065, 0.06, 0.055, x, h * 0.55, -0.04, { r: 0.01, ...C(p.accent) });
    }
    k.box('frame', p.frame, w - 0.2, 0.04, 0.04, 0, 0.2, -0.04, { r: 0.006 });
    // fixed back strip + front part hinged at its front edge (its back edge rises with the tilt)
    k.box('top', p.top, w, 0.025, 0.14, 0, h, -d / 2 + 0.07, { r: 0.004 });
    const tl = d - 0.14;
    k.box('top', p.top, w, 0.025, tl, 0, h + Math.sin(a) * tl / 2, d / 2 - Math.cos(a) * tl / 2, { r: 0.004, rx: a });
    k.box('accent', 'plastic-white', w * 0.9, 0.02, 0.025, 0, h + 0.02, d / 2 - 0.012, { r: 0.006, ...C(p.accent) });
    // book rack on the back strip
    k.box('top', p.top, w * 0.7, 0.22, 0.02, 0, h + 0.12, -d / 2 + 0.01, { r: 0.003 });
    k.box('top', p.top, w * 0.7, 0.02, 0.14, 0, h + 0.24, -d / 2 + 0.07, { r: 0.003 });
    return finish(k);
  },
});

const growChair = mk({
  id: 'kids-growing-chair', category: 'kids', ko: '성장 의자(높이조절 원목)', en: 'Adjustable growing chair',
  params: [WOOD('wood-oak'), P.len('seat', '좌판 높이', 'Seat height', 0.45, 0.3, 0.6), P.bool('cushion', '쿠션', 'Cushion', true), P.mat('fabric', '쿠션 천', 'Cushion fabric', 'fabric-linen-grey', 'fabric')],
  tags: ['growing chair', 'high chair', 'tripp trapp', 'adjustable chair', '성장 의자', '높이조절 의자', '아기 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.46, H = 0.8, a = 0.36, len = H / Math.cos(a);
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.015);
      k.box('frame', p.wood, 0.03, len, 0.07, x, H / 2, -0.03, { r: 0.008, rx: -a });
      k.box('frame', p.wood, 0.03, 0.05, 0.5, x, 0.025, 0.0, { r: 0.01 });
    }
    const sz = 0.02;
    k.box('frame', p.wood, W - 0.03, 0.022, 0.32, 0, p.seat, sz + 0.06, { r: 0.004 });
    k.box('frame', p.wood, W - 0.03, 0.022, 0.32, 0, Math.max(0.12, p.seat - 0.22), sz + 0.12, { r: 0.004 });
    for (const y of [H - 0.08, H - 0.2]) k.box('frame', p.wood, W - 0.03, 0.06, 0.02, 0, y, -0.03 - Math.tan(a) * (y - H / 2), { r: 0.006, rx: -a });
    if (p.cushion) k.soft('cushion', p.fabric, W - 0.08, 0.03, 0.28, 0.012, 0, p.seat + 0.026, sz + 0.06, { puff: 0.004 });
    return finish(k);
  },
});

/* --------------------------------------------------------- shelves & storage */

const bookDisplay = mk({
  id: 'kids-book-display', category: 'kids', ko: '전면 책 진열대', en: 'Front-facing book display rack',
  params: [P.len('width', '폭', 'Width', 0.8, 0.5, 1.2), WOOD('wood-white'), P.int('tiers', '단 수', 'Tiers', 4, 3, 5), P.bool('books', '책', 'Books', true)],
  tags: ['book display', 'book rack', 'bookshelf', 'kids bookcase', '책 진열대', '전면 책장', '그림책 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = 1.0, n = p.tiers, a = 0.18;
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape([new THREE.Vector2(0.3, 0), new THREE.Vector2(-0.07, 0), new THREE.Vector2(-0.07 - Math.tan(a) * H, H), new THREE.Vector2(0.08, H)]);
      k.panel('frame', p.wood, shape, 0.018, s * (w / 2 - 0.009), 0, 0, { ry: -PI / 2, bevel: 0.002 });
    }
    k.box('frame', p.wood, w - 0.036, H * 0.9, 0.012, 0, H * 0.47, -0.06, { r: 0.002, rx: -a });
    const rand = rng(3);
    const covers = ['book-red', 'book-blue', 'book-green', 'book-cream'];
    for (let i = 0; i < n; i++) {
      const y = 0.06 + (i / n) * (H - 0.12), z = 0.2 - (i / n) * 0.18;
      k.box('frame', p.wood, w - 0.036, 0.015, 0.09, 0, y, z - 0.04, { r: 0.002 });
      k.box('frame', p.wood, w - 0.036, 0.06, 0.012, 0, y + 0.03, z + 0.005, { r: 0.002 });
      if (p.books) {
        const bw = 0.2;
        const nb = Math.floor((w - 0.06) / (bw + 0.02));
        for (let b = 0; b < nb; b++) {
          const bh = 0.18 + rand() * 0.06;
          k.box('books', covers[(b + i) % 4], bw, bh, 0.012, -w / 2 + 0.04 + bw / 2 + b * (bw + 0.02), y + bh / 2 + 0.01, z - 0.012 - Math.sin(a) * bh / 2, { r: 0.002, rx: -a });
        }
      }
    }
    return finish(k);
  },
});

const houseShelf = mk({
  id: 'kids-house-shelf', category: 'kids', ko: '집 모양 책장', en: 'House-shaped bookshelf',
  params: [P.len('width', '폭', 'Width', 0.7, 0.5, 1.0), WOOD('wood-pine'), P.int('shelves', '선반 수', 'Shelves', 3, 1, 4)],
  tags: ['house shelf', 'kids shelf', 'bookshelf', '집 모양 선반', '하우스 책장', '아이 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, wall = 1.1, rise = w * 0.42, d = 0.28, t = 0.02;
    for (const s of [-1, 1]) k.box('frame', p.wood, t, wall, d, s * (w / 2 - t / 2), wall / 2, 0, { r: 0.003 });
    const rl = Math.hypot(w / 2, rise), ra = Math.atan2(rise, w / 2);
    for (const s of [-1, 1]) k.box('frame', p.wood, rl + 0.03, t, d, s * w / 4, wall + rise / 2, 0, { r: 0.003, rz: -s * ra });
    k.box('frame', p.wood, w - 2 * t, t, d, 0, t / 2 + 0.03, 0, { r: 0.002 });
    for (let i = 1; i <= p.shelves; i++) k.box('frame', p.wood, w - 2 * t, t, d - 0.01, 0, 0.03 + (i * (wall - 0.03)) / (p.shelves + 0.6), 0, { r: 0.002 });
    k.box('back', 'paint-white-matte', w - 2 * t, wall, 0.006, 0, wall / 2, -d / 2 + 0.003, { r: 0 });
    for (const s of [-1, 1]) k.box('frame', p.wood, 0.04, 0.03, d, s * (w / 2 - 0.04), 0.015, 0, { r: 0.004 });
    return finish(k);
  },
});

const cubbies = mk({
  id: 'kids-toy-cubbies', category: 'kids', ko: '장난감 큐브 수납장(바구니)', en: 'Toy cubby unit with bins',
  params: [P.int('cols', '가로 칸', 'Columns', 3, 2, 4), P.int('rows', '세로 칸', 'Rows', 3, 2, 4), P.mat('body', '본체', 'Body', 'wood-white', 'wood'), P.mat('bins', '바구니', 'Bins', 'fabric-linen-grey', 'fabric'), P.int('binCount', '바구니 수', 'Bins', 5, 0, 16)],
  tags: ['cubby', 'cube storage', 'toy storage', 'kallax', '큐브 수납장', '장난감 수납', '바구니 수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = 0.34, t = 0.02, d = 0.36, W = p.cols * c + t, H = p.rows * c + t;
    for (let i = 0; i <= p.cols; i++) k.box('body', p.body, t, H, d, -W / 2 + t / 2 + i * c, H / 2 + 0.03, 0, { r: 0.002 });
    for (let j = 0; j <= p.rows; j++) k.box('body', p.body, W, t, d, 0, 0.03 + t / 2 + j * c, 0, { r: 0.002 });
    k.box('body', p.body, W - 0.04, 0.03, d - 0.04, 0, 0.015, 0, { r: 0.002 });
    let n = 0;
    for (let j = 0; j < p.rows; j++) for (let i = 0; i < p.cols; i++) {
      if (n >= p.binCount || (i + j) % 2 === 1 && n > 2) continue;
      n++;
      const x = -W / 2 + t + c * i + (c - t) / 2, y = 0.03 + t + c * j;
      k.soft('bins', p.bins, c - t - 0.02, c - t - 0.03, d - 0.04, 0.012, x, y + (c - t - 0.03) / 2, 0.01, { ...C(PAL[n % PAL.length]), flat: 3 });
      k.box('pulls', 'leather-brown', 0.08, 0.015, 0.006, x, y + c - t - 0.08, d / 2 - 0.006, { r: 0.004 });
    }
    return finish(k);
  },
});

const binOrganizer = mk({
  id: 'kids-bin-organizer', category: 'kids', ko: '경사 바구니 장난감 정리대', en: 'Tiered toy organiser with tilted bins',
  params: [P.len('width', '폭', 'Width', 0.86, 0.6, 1.1), WOOD('wood-white'), P.int('tiers', '단 수', 'Tiers', 3, 2, 4)],
  tags: ['toy organizer', 'bin organizer', 'toy storage', '장난감 정리대', '정리함', '바구니 정리대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, n = p.tiers, H = 0.25 * n + 0.1, d = 0.3;
    for (const s of [-1, 1]) k.box('frame', p.wood, 0.02, H, d, s * (w / 2 - 0.01), H / 2, 0, { r: 0.004 });
    const cols = w > 0.8 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const y = 0.06 + i * 0.25;
      k.box('frame', p.wood, w - 0.04, 0.012, d, 0, y, 0, { r: 0.002, rx: 0.12 });
      for (let c = 0; c < cols; c++) {
        const bw = (w - 0.06) / cols - 0.01;
        k.rbox(`bin${(i + c) % 3}`, 'plastic-white', bw, 0.18, d - 0.02, 0.012, -w / 2 + 0.03 + (bw + 0.01) * (c + 0.5), y + 0.1, 0.02, { rx: 0.12, ...C(PAL[(i + c) % 3]) });
      }
    }
    return finish(k);
  },
});

const wardrobe = mk({
  id: 'kids-wardrobe-house', category: 'kids', ko: '집 모양 아이 옷장', en: 'House-shaped kids wardrobe',
  params: [P.len('width', '폭', 'Width', 0.8, 0.6, 1.0), P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'), P.mat('roof', '지붕', 'Roof', 'wood-pine', 'wood')],
  tags: ['kids wardrobe', 'wardrobe', 'closet', '아이 옷장', '어린이 옷장', '집 모양 옷장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 1.35, d = 0.48;
    addCabinet(k, { w, h, d, rows: [{ h: 0.24, n: 1, type: 'drawer' }, { h: 0.76, n: 2, type: 'door' }], body: p.body, front: p.body, handle: 'knob', handleMat: 'wood-oak', base: 'legs', legH: 0.1, legStyle: 'tapered', legMat: p.roof });
    const rise = w * 0.38, rl = Math.hypot(w / 2 + 0.04, rise), ra = Math.atan2(rise, w / 2 + 0.04);
    for (const s of [-1, 1]) k.box('roof', p.roof, rl, 0.025, d + 0.04, s * (w / 4 + 0.01), h + rise / 2, 0, { r: 0.004, rz: -s * ra });
    const gable = new THREE.Shape([new THREE.Vector2(-w / 2 + 0.01, 0), new THREE.Vector2(w / 2 - 0.01, 0), new THREE.Vector2(0, rise - 0.02)]);
    k.panel('body', p.body, gable, 0.018, 0, h, d / 2 - 0.02, { bevel: 0.002 });
    k.cyl('roof', p.roof, 0.05, 0.05, 0.012, 0, h + rise * 0.35, d / 2 - 0.012, { rx: PI / 2, segs: k.seg(20, 8) });
    return finish(k);
  },
});

const changingTable = mk({
  id: 'kids-changing-table', category: 'kids', ko: '기저귀 교환대 서랍장', en: 'Changing table dresser',
  params: [P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'), P.mat('pad', '교환 매트', 'Pad', 'fabric-cotton-grey', 'fabric'), P.pick('handle', '손잡이', 'Handles', 'knob', [['knob', '노브', 'Knob'], ['bar', '바', 'Bar'], ['cup', '컵', 'Cup']])],
  tags: ['changing table', 'baby dresser', 'nursery', '기저귀 교환대', '아기 서랍장', '교환대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.94, h = 0.86, d = 0.5;
    addCabinet(k, { w, h, d, rows: [{ h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 2, type: 'drawer' }], body: p.body, front: p.body, handle: p.handle, handleMat: 'wood-oak', base: 'plinth', plinth: 0.07, top: p.body, topThick: 0.022 });
    const tw = 0.82, td = 0.72, ty = h;
    k.box('body', p.body, tw, 0.018, td, 0, ty + 0.009, (td - d) / 2 * 0, { r: 0.003 });
    for (const s of [-1, 1]) k.box('body', p.body, 0.018, 0.12, td, s * (tw / 2 - 0.009), ty + 0.07, 0, { r: 0.004 });
    k.box('body', p.body, tw, 0.12, 0.018, 0, ty + 0.07, -td / 2 + 0.009, { r: 0.004 });
    k.soft('pad', p.pad, tw - 0.05, 0.07, td - 0.06, 0.03, 0, ty + 0.055, 0.01, { puff: 0.008 });
    return finish(k);
  },
});

const toyChest = mk({
  id: 'kids-toy-chest-bench', category: 'kids', ko: '장난감 수납 벤치', en: 'Toy chest bench with cushion',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.2), P.mat('body', '본체', 'Body', 'wood-white', 'wood'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-velvet-rose', 'fabric'), P.num('open', '뚜껑 열림(°)', 'Lid open (°)', 0, 0, 80, 1)],
  tags: ['toy chest', 'storage bench', 'toy box', '장난감 수납함', '수납 벤치', '토이 박스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.42, d = 0.4, a = (p.open * PI) / 180;
    k.box('body', p.body, w, h - 0.03, d, 0, (h - 0.03) / 2, 0, { r: 0.006 });
    for (const s of [-1, 1]) k.box('body', p.body, 0.12, 0.03, 0.02, s * (w / 2 - 0.15), h - 0.15, d / 2 + 0.008, { r: 0.008 });
    const lz = -d / 2, ly = h - 0.03;
    const c = Math.cos(a), sn = Math.sin(a);
    k.box('body', p.body, w, 0.025, d, 0, ly + 0.0125 + sn * d / 2, lz + c * d / 2, { r: 0.004, rx: -a });
    k.soft('cushion', p.fabric, w - 0.04, 0.06, d - 0.04, 0.025, 0, ly + 0.025 + 0.03 + sn * d / 2 - (1 - c) * 0, lz + c * d / 2 - sn * 0.04, { rx: -a, puff: 0.008 });
    return finish(k);
  },
});

/* ------------------------------------------------------------- play */

const playKitchen = mk({
  id: 'kids-play-kitchen', category: 'kids', ko: '소꿉놀이 주방', en: 'Play kitchen',
  params: [P.mat('body', '본체', 'Body', 'wood-white', 'wood'), P.color('accent', '포인트 색', 'Accent colour', '#7cc47f'), P.mat('top', '상판', 'Top', 'wood-oak', 'wood')],
  tags: ['play kitchen', 'toy kitchen', 'pretend play', '소꿉놀이', '장난감 주방', '주방 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.84, h = 0.52, d = 0.32;
    k.box('body', p.body, w, h, d, 0, h / 2, 0, { r: 0.006 });
    k.box('top', p.top, w + 0.02, 0.02, d + 0.02, 0, h + 0.01, 0, { r: 0.004 });
    k.box('body', p.body, w, 0.5, 0.02, 0, h + 0.27, -d / 2 + 0.01, { r: 0.004 });
    k.box('top', p.top, w, 0.018, 0.12, 0, h + 0.4, -d / 2 + 0.07, { r: 0.003 });
    // oven door with window + cupboard, accent-coloured fronts
    k.box('fronts', 'paint-white-matte', w / 2 - 0.03, h - 0.1, 0.015, -w / 4, h / 2, d / 2 + 0.008, { r: 0.004, ...C(p.accent) });
    k.box('glass', 'glass-tinted', w / 2 - 0.13, h * 0.4, 0.004, -w / 4, h / 2, d / 2 + 0.017, { r: 0 });
    k.box('fronts', 'paint-white-matte', w / 2 - 0.03, h - 0.1, 0.015, w / 4, h / 2, d / 2 + 0.008, { r: 0.004, ...C(p.accent) });
    k.rod('metal', 'metal-chrome', [-w / 2 + 0.08, h - 0.08, d / 2 + 0.04], [-0.08, h - 0.08, d / 2 + 0.04], 0.008);
    // hob, knobs, sink + tap
    for (const x of [-0.27, -0.1]) k.cyl('hob', 'plastic-black', 0.065, 0.065, 0.006, x, h + 0.02, 0.02, { segs: k.seg(20, 8) });
    for (let i = 0; i < 3; i++) k.cyl('hob', 'plastic-black', 0.018, 0.018, 0.02, -0.3 + i * 0.1, h + 0.17, -d / 2 + 0.02, { rx: PI / 2, segs: k.seg(12, 6) });
    k.lathe('metal', 'metal-steel', [[0, 0], [0.09, 0], [0.11, 0.06], [0.12, 0.065], [0, 0.065]], 0.22, h - 0.04, 0.02, { segs: k.seg(20, 8) });
    k.tube('metal', 'metal-chrome', [[0.22, h + 0.02, -d / 2 + 0.03], [0.22, h + 0.16, -d / 2 + 0.03], [0.22, h + 0.18, -d / 2 + 0.08], [0.22, h + 0.14, -d / 2 + 0.12]], 0.009);
    return finish(k);
  },
});

const teepee = mk({
  id: 'kids-teepee', category: 'kids', ko: '인디언 티피 텐트', en: 'Play teepee',
  params: [P.mat('fabric', '천', 'Canvas', 'fabric-cotton-white', 'fabric'), WOOD('wood-pine', '기둥', 'Poles'), P.mat('mat', '바닥 매트', 'Floor mat', 'fabric-mustard', 'fabric'), P.len('size', '바닥 지름', 'Base diameter', 1.2, 1.0, 1.5)],
  tags: ['teepee', 'tipi', 'play tent', 'kids tent', '티피', '인디언 텐트', '놀이 텐트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.size / 2, H = 1.55, top = 1.85;
    const prof = Array.from({ length: 6 }, (_, i) => { const t = i / 5; return new THREE.Vector2(R * (1 - t) + 0.05 * t, H * t); });
    const g = new THREE.LatheGeometry(prof, k.seg(5, 5), 0.5, PI * 2 - 1.0);
    g.computeVertexNormals();
    k.add('canvas', p.fabric, g);
    const g2 = g.clone(); g2.scale(0.985, 1, 0.985); g2.index && g2.setIndex([...g2.index.array].reverse()); g2.computeVertexNormals();
    k.add('canvas', p.fabric, g2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + PI / 5;
      const bx = Math.sin(a) * R * 1.02, bz = Math.cos(a) * R * 1.02;
      const ex = -Math.sin(a) * 0.08, ez = -Math.cos(a) * 0.08;
      k.rod('poles', p.wood, [bx, 0, bz], [ex, top, ez], 0.014, { segs: k.seg(8, 4) });
    }
    k.cyl('mat', p.mat, R * 0.85, R * 0.85, 0.05, 0, 0, 0, { segs: k.seg(5, 5) });
    return finish(k);
  },
});

const aTent = mk({
  id: 'kids-play-tent-a-frame', category: 'kids', ko: 'A형 놀이 텐트', en: 'A-frame play tent',
  params: [P.mat('fabric', '천', 'Canvas', 'fabric-linen-grey', 'fabric'), WOOD('wood-pine', '기둥', 'Poles'), P.mat('mat', '매트', 'Mat', 'fabric-cotton-white', 'fabric')],
  tags: ['play tent', 'a frame tent', 'kids tent', '놀이 텐트', 'A형 텐트', '아이 텐트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.1, B = 1.0, H = 1.1;
    for (const sx of [-1, 1]) {
      const x = sx * L / 2;
      for (const sz of [-1, 1]) k.rod('poles', p.wood, [x, 0, sz * B / 2], [x, H + 0.08, -sz * 0.05], 0.016, { segs: k.seg(8, 4) });
    }
    k.rod('poles', p.wood, [-L / 2 - 0.08, H, 0], [L / 2 + 0.08, H, 0], 0.016, { segs: k.seg(8, 4) });
    const sl = Math.hypot(B / 2, H), sa = Math.atan2(B / 2, H);
    for (const sz of [-1, 1]) k.box('canvas', p.fabric, L, sl, 0.006, 0, H / 2, sz * B / 4, { r: 0, rx: -sz * sa });
    k.soft('mat', p.mat, L - 0.05, 0.05, B - 0.08, 0.02, 0, 0.025, 0, { puff: 0.005 });
    const gp = pillowGeo(0.4, 0.3, 0.1, k.seg(12, 5)); T(gp, 0.2, 0.15, -0.15, -0.3, 0.3, 0);
    k.add('pillows', 'fabric-mustard', gp);
    return finish(k);
  },
});

const rockingHorse = mk({
  id: 'kids-rocking-horse', category: 'kids', ko: '흔들 목마', en: 'Rocking horse',
  params: [WOOD('wood-oak'), P.mat('saddle', '안장', 'Saddle', 'leather-cognac', 'leather'), P.mat('mane', '갈기', 'Mane', 'fabric-wool-charcoal', 'fabric')],
  tags: ['rocking horse', 'ride on', 'wooden toy', '흔들 목마', '목마', '원목 장난감'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.95;
    for (const sz of [-1, 1]) {
      const pts = Array.from({ length: 11 }, (_, i) => { const t = i / 10 - 0.5; return [t * L, 0.025 + 0.16 * (t * 2) ** 2, sz * 0.15]; });
      k.tube('wood', p.wood, pts, 0.022, { caps: true });
    }
    for (const sx of [-1, 1]) k.box('wood', p.wood, 0.04, 0.03, 0.34, sx * 0.25, 0.04, 0, { r: 0.006 });
    k.sphere('wood', p.wood, 0.2, 0, 0.48, 0, { scale: [1.35, 0.62, 0.55], segs: k.seg(24, 10), rings: k.seg(14, 6) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('wood', p.wood, [sx * 0.16, 0.44, sz * 0.06], [sx * 0.25, 0.05, sz * 0.13], 0.02, { r2: 0.025 });
    k.rod('wood', p.wood, [0.2, 0.5, 0], [0.3, 0.72, 0], 0.06, { r2: 0.045 });
    k.rbox('wood', p.wood, 0.24, 0.1, 0.09, 0.04, 0.38, 0.74, 0, { rz: -0.5 });
    for (const s of [-1, 1]) k.cyl('wood', p.wood, 0.012, 0.02, 0.06, 0.28, 0.8, s * 0.025, { segs: k.seg(8, 4) });
    k.rod('metal', 'metal-black', [0.3, 0.73, -0.12], [0.3, 0.73, 0.12], 0.012);
    k.soft('saddle', p.saddle, 0.24, 0.04, 0.2, 0.02, -0.02, 0.6, 0, { puff: 0.006 });
    k.rbox('mane', p.mane, 0.2, 0.04, 0.03, 0.015, 0.27, 0.8, 0, { rz: -0.9 });
    k.rod('mane', p.mane, [-0.25, 0.52, 0], [-0.36, 0.35, 0], 0.03, { r2: 0.01 });
    return finish(k);
  },
});

const tableStools = mk({
  id: 'kids-table-stools-set', category: 'kids', ko: '원형 유아 테이블 + 스툴 4개', en: 'Round kids table with 4 stools',
  params: [WOOD('wood-white'), P.mat('top', '상판', 'Top', 'wood-oak', 'wood'), P.int('stools', '스툴 수', 'Stools', 4, 0, 4)],
  tags: ['kids table', 'activity table', 'stools', '유아 테이블', '아이 테이블', '스툴 세트', '놀이 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.32, h = 0.48;
    k.cyl('top', p.top, r, r, 0.025, 0, h - 0.025, 0, { segs: k.seg(36, 12) });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      k.rod('legs', p.wood, [Math.cos(a) * 0.17, h - 0.03, Math.sin(a) * 0.17], [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24], 0.02, { r2: 0.016 });
    }
    for (let i = 0; i < p.stools; i++) {
      const a = (i / 4) * PI * 2;
      const x = Math.cos(a) * 0.52, z = Math.sin(a) * 0.52;
      k.cyl(`seat${i}`, 'plastic-white', 0.13, 0.13, 0.03, x, 0.25, z, { segs: k.seg(24, 8), ...C(PAL[i]) });
      for (let j = 0; j < 3; j++) {
        const b = (j / 3) * PI * 2;
        k.rod('legs', p.wood, [x + Math.cos(b) * 0.06, 0.25, z + Math.sin(b) * 0.06], [x + Math.cos(b) * 0.1, 0, z + Math.sin(b) * 0.1], 0.013);
      }
    }
    return finish(k);
  },
});

const tableChairs = mk({
  id: 'kids-table-chairs-set', category: 'kids', ko: '사각 유아 테이블 + 의자 2개', en: 'Square kids table with 2 chairs',
  params: [WOOD('wood-pine'), P.mat('top', '상판', 'Top', 'paint-white-matte', 'paint'), P.color('accent', '의자 색', 'Chair colour', '#5fa8d3')],
  tags: ['kids table', 'table and chairs', 'study table', '유아 테이블', '아이 책상 세트', '어린이 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = 0.62, h = 0.5;
    k.box('top', p.top, s, 0.025, s, 0, h - 0.0125, 0, { r: 0.006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', p.wood, 0.04, h - 0.025, 0.04, sx * (s / 2 - 0.04), (h - 0.025) / 2, sz * (s / 2 - 0.04), { r: 0.008 });
    kidChair(k, { z: 0.45, ry: PI, mat: p.wood, color: p.accent, seatH: 0.28 });
    kidChair(k, { z: -0.45, ry: 0, mat: p.wood, color: p.accent, seatH: 0.28 });
    return finish(k);
  },
});

const beanBag = mk({
  id: 'kids-bean-bag', category: 'kids', ko: '어린이 빈백', en: 'Kids bean bag',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-velvet-blue', 'fabric'), P.len('size', '지름', 'Diameter', 0.65, 0.5, 0.85)],
  tags: ['bean bag', 'kids bean bag', 'floor seat', '빈백', '어린이 빈백', '쿠션 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.size / 2;
    k.lathe('fabric', p.fabric, [[0, 0], [R * 0.85, 0], [R, R * 0.25], [R * 0.98, R * 0.6], [R * 0.8, R * 0.95], [R * 0.45, R * 1.05], [R * 0.25, R * 0.92], [0, R * 0.85]], 0, 0, 0, { smooth: 18, segs: k.seg(28, 10), scale: [1, 1, 0.95] });
    return finish(k);
  },
});

const glider = mk({
  id: 'kids-nursing-glider', category: 'kids', ko: '수유 글라이더 의자', en: 'Nursing glider chair',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-linen-beige', 'fabric'), WOOD('wood-white', '프레임', 'Frame')],
  tags: ['glider', 'nursing chair', 'rocking chair', '수유 의자', '글라이더', '흔들의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.74, D = 0.82;
    for (const s of [-1, 1]) {
      k.box('frame', p.wood, 0.05, 0.05, D - 0.06, s * (W / 2 - 0.07), 0.025, 0, { r: 0.008 });
      for (const z of [-1, 1]) k.rod('frame', 'metal-black', [s * (W / 2 - 0.07), 0.05, z * 0.28], [s * (W / 2 - 0.07), 0.16, z * 0.25], 0.008);
    }
    k.box('frame', p.wood, W - 0.1, 0.04, 0.05, 0, 0.03, 0, { r: 0.006 });
    k.soft('fabric', p.fabric, W - 0.06, 0.2, D - 0.12, 0.05, 0, 0.26, 0.03, { puff: 0.01 });
    k.soft('fabric', p.fabric, W - 0.26, 0.14, D - 0.26, 0.05, 0, 0.42, 0.08, { puff: 0.015 });
    for (const s of [-1, 1]) k.soft('fabric', p.fabric, 0.13, 0.42, D - 0.12, 0.05, s * (W / 2 - 0.065), 0.37, 0.03, { puff: 0.01 });
    k.soft('fabric', p.fabric, W - 0.1, 0.72, 0.18, 0.06, 0, 0.6, -D / 2 + 0.12, { rx: -0.12, puff: 0.015 });
    return finish(k);
  },
});

const ballPit = mk({
  id: 'kids-ball-pit', category: 'kids', ko: '볼풀', en: 'Ball pit',
  params: [P.mat('fabric', '쿠션', 'Foam cover', 'fabric-cotton-grey', 'fabric'), P.len('size', '지름', 'Diameter', 1.0, 0.8, 1.4), P.int('balls', '공 수', 'Balls', 60, 10, 120)],
  tags: ['ball pit', 'play pool', 'foam pit', '볼풀', '공놀이', '놀이 매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.size / 2, h = 0.32, t = 0.1;
    k.lathe('fabric', p.fabric, [[0, 0], [R - 0.02, 0], [R, 0.02], [R, h - 0.04], [R - 0.04, h], [R - t + 0.03, h], [R - t, h - 0.04], [R - t, 0.05], [0, 0.05]], 0, 0, 0, { segs: k.seg(36, 12) });
    const rand = rng(7), br = 0.035, n = Math.min(p.balls, k.hi ? 120 : 50);
    for (let i = 0; i < n; i++) {
      const a = rand() * PI * 2, rr = Math.sqrt(rand()) * (R - t - br);
      const layer = Math.floor(i / 40);
      k.sphere(`ball${i % 4}`, 'plastic-white', br, Math.cos(a) * rr, 0.05 + br + layer * br * 1.6 + rand() * 0.02, Math.sin(a) * rr, { segs: k.seg(10, 5), rings: k.seg(6, 3), ...C(PAL[i % 4]) });
    }
    return finish(k);
  },
});

const slide = mk({
  id: 'kids-slide', category: 'kids', ko: '실내 미끄럼틀', en: 'Indoor slide',
  params: [P.mat('plastic', '플라스틱', 'Plastic', 'plastic-white', 'plastic'), P.color('color', '미끄럼판 색', 'Slide colour', '#f2c14e'), P.color('steps', '계단 색', 'Steps colour', '#5fa8d3')],
  tags: ['slide', 'indoor slide', 'toddler slide', '미끄럼틀', '실내 놀이', '유아 미끄럼틀'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const top = 0.7, W = 0.46, len = 1.15, a = Math.atan2(top - 0.06, len);
    const L = Math.hypot(top - 0.06, len);
    k.box('steps', p.plastic, W + 0.06, top, 0.3, 0, top / 2, -0.15, { r: 0.02, ...C(p.steps) });
    for (let i = 1; i <= 2; i++) {
      const sh = (i / 3) * top;
      k.box('steps', p.plastic, W + 0.06, sh, 0.16, 0, sh / 2, -0.3 - 0.08 - (2 - i) * 0.16, { r: 0.015, ...C(p.steps) });
      k.box('stepsTop', p.plastic, W, 0.012, 0.12, 0, sh + 0.006, -0.3 - 0.08 - (2 - i) * 0.16, { r: 0.004, ...C('#ffffff') });
    }
    k.box('chute', p.plastic, W, 0.025, L, 0, (top + 0.06) / 2, len / 2, { r: 0.008, rx: a, ...C(p.color) });
    for (const s of [-1, 1]) k.box('chute', p.plastic, 0.03, 0.12, L, s * (W / 2 + 0.015), (top + 0.06) / 2 + 0.05, len / 2, { r: 0.012, rx: a, ...C(p.color) });
    k.box('chute', p.plastic, W + 0.06, 0.04, 0.12, 0, 0.02, len + 0.03, { r: 0.015, ...C(p.color) });
    for (const s of [-1, 1]) k.bentTube('rails', p.plastic, [[s * (W / 2 + 0.02), top, -0.28], [s * (W / 2 + 0.02), top + 0.3, -0.24], [s * (W / 2 + 0.02), top + 0.3, -0.02], [s * (W / 2 + 0.02), top + 0.1, 0.05]], 0.02, 0.06, C(p.steps));
    return finish(k);
  },
});

const pikler = mk({
  id: 'kids-pikler-triangle', category: 'kids', ko: '피클러 삼각 클라이머', en: 'Pikler climbing triangle',
  params: [WOOD('wood-pine'), P.len('width', '폭', 'Width', 0.75, 0.6, 1.0), P.bool('ramp', '경사판', 'Ramp', true), P.mat('rampMat', '경사판 재질', 'Ramp finish', 'paint-blue-matte', 'paint')],
  tags: ['pikler triangle', 'climbing triangle', 'montessori', '피클러', '클라이밍 삼각대', '몬테소리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, B = 0.9, H = 0.78, n = 7;
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.015);
      for (const sz of [-1, 1]) k.rod('frame', p.wood, [x, 0, sz * B / 2], [x, H, 0], 0.022, { segs: k.seg(8, 4) });
    }
    for (const sz of [-1, 1]) for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), y = H * t, z = sz * (B / 2) * (1 - t);
      k.rod('rungs', p.wood, [-w / 2 + 0.01, y, z], [w / 2 - 0.01, y, z], 0.014, { segs: k.seg(10, 5) });
    }
    if (p.ramp) {
      const rl = 1.0, ra = Math.atan2(H * 0.6, rl);
      k.box('ramp', p.rampMat, w * 0.85, 0.02, Math.hypot(rl, H * 0.6), 0, H * 0.3, B / 2 * 0.4 + rl / 2 - 0.2, { r: 0.005, rx: ra });
    }
    return finish(k);
  },
});

const growthChart = mk({
  id: 'kids-growth-chart', category: 'kids', placement: 'wall', elevation: 0.1, ko: '벽걸이 키재기 자', en: 'Wall growth chart',
  params: [P.mat('board', '판', 'Board', 'wood-pine', 'wood'), P.mat('marks', '눈금', 'Marks', 'paint-black-matte', 'paint')],
  tags: ['growth chart', 'height chart', 'ruler', '키재기', '키 재는 자', '성장 차트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.2, H = 1.6, t = 0.018;
    k.box('board', p.board, W, H, t, 0, H / 2, t / 2, { r: 0.004 });
    for (let i = 1; i < 32; i++) {
      const y = (i / 32) * H, major = i % 4 === 0;
      k.box('marks', p.marks, major ? W * 0.6 : W * 0.3, 0.004, 0.002, -W / 2 + (major ? W * 0.3 : W * 0.15) + 0.01, y, t + 0.001, { r: 0 });
    }
    k.cyl('marks', 'paint-white-gloss', 0.03, 0.03, 0.006, W * 0.2, H - 0.08, t, { rx: PI / 2, segs: k.seg(16, 6), ...C('#f2c14e') });
    return finish(k);
  },
});

const mobile = mk({
  id: 'kids-mobile', category: 'kids', placement: 'ceiling', elevation: 1.8, ko: '천장 모빌', en: 'Hanging nursery mobile',
  params: [P.mat('wood', '막대', 'Rods', 'wood-ash', 'wood'), P.mat('felt', '모빌', 'Shapes', 'fabric-cotton-white', 'fabric')],
  tags: ['mobile', 'nursery mobile', 'hanging', '모빌', '아기 모빌', '천장 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const top = 0.8;
    k.rod('string', 'paper', [0, 0.45, 0], [0, top, 0], 0.0015, { segs: 4 });
    k.rod('rods', p.wood, [-0.3, 0.45, 0], [0.3, 0.45, 0], 0.006, { segs: k.seg(8, 4) });
    k.rod('rods', p.wood, [0, 0.42, -0.25], [0, 0.42, 0.25], 0.006, { segs: k.seg(8, 4) });
    const hang = [[-0.3, 0.45, 0, 0.18], [0.3, 0.45, 0, 0.25], [0, 0.42, -0.25, 0.3], [0, 0.42, 0.25, 0.2]];
    hang.forEach(([x, y, z, len], i) => {
      k.rod('string', 'paper', [x, y - len, z], [x, y, z], 0.0015, { segs: 4 });
      if (i % 2) k.sphere(`shape${i % 3}`, p.felt, 0.045, x, y - len - 0.045, z, { segs: k.seg(14, 6), rings: k.seg(10, 4), ...C(PAL[i]) });
      else {
        const s = new THREE.Shape();
        for (let j = 0; j < 10; j++) { const a = (j / 10) * PI * 2 + PI / 2, r = j % 2 ? 0.025 : 0.06; const v = [Math.cos(a) * r, Math.sin(a) * r]; if (j) s.lineTo(...v); else s.moveTo(...v); }
        s.closePath();
        k.panel(`shape${i % 3}`, p.felt, s, 0.015, x, y - len - 0.06, z, { bevel: 0.004, ...C(PAL[i]) });
      }
    });
    k.sphere('shape2', p.felt, 0.06, 0, 0.42 - 0.12, 0, { segs: k.seg(16, 6), rings: k.seg(10, 4), thetaLength: PI, ...C('#f2c14e') });
    k.rod('string', 'paper', [0, 0.36, 0], [0, 0.42, 0], 0.0015, { segs: 4 });
    return finish(k);
  },
});

const nightLamp = mk({
  id: 'kids-night-lamp-cloud', category: 'kids', placement: 'surface', ko: '구름 수면등', en: 'Cloud night light',
  params: [P.pick('shape', '모양', 'Shape', 'cloud', [['cloud', '구름', 'Cloud'], ['moon', '달', 'Moon']]), P.mat('base', '받침', 'Base', 'wood-ash', 'wood')],
  tags: ['night light', 'night lamp', 'cloud lamp', '수면등', '무드등', '구름 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('base', p.base, 0.26, 0.03, 0.09, 0, 0.015, 0, { r: 0.008 });
    if (p.shape === 'moon') {
      const s = new THREE.Shape(); s.absarc(0, 0, 0.1, 0, PI * 2, false);
      const h = new THREE.Path(); h.absarc(0.05, 0.03, 0.085, 0, PI * 2, true); s.holes.push(h);
      k.panel('glow', 'light-warm', s, 0.05, 0, 0.13, 0, { bevel: 0.012, curveSegs: 24 });
    } else {
      for (const [x, y, r] of [[-0.07, 0.08, 0.05], [0, 0.11, 0.07], [0.075, 0.085, 0.05], [0.035, 0.06, 0.045], [-0.035, 0.06, 0.045]]) k.sphere('glow', 'light-warm', r, x, y, 0, { scale: [1, 1, 0.55], segs: k.seg(18, 8), rings: k.seg(12, 5) });
    }
    k.light(0, 0.1, 0, { color: '#ffd9a0', intensity: 0.25, distance: 2 });
    return finish(k);
  },
});

const dollhouse = mk({
  id: 'kids-dollhouse', category: 'kids', ko: '3층 인형의 집', en: 'Three-storey dollhouse',
  params: [P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'), P.mat('roof', '지붕', 'Roof', 'paint-white-matte', 'paint'), P.color('roofColor', '지붕 색', 'Roof colour', '#e86b5f'), P.mat('floor', '바닥', 'Floors', 'wood-oak', 'wood')],
  tags: ['dollhouse', 'doll house', 'toy house', '인형의 집', '돌하우스', '장난감 집'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.72, H = 0.8, D = 0.3, t = 0.012, rise = 0.28;
    for (const s of [-1, 1]) k.box('body', p.body, t, H, D, s * (W / 2 - t / 2), H / 2, 0, { r: 0.002 });
    k.box('body', p.body, W, H, t, 0, H / 2, -D / 2 + t / 2, { r: 0.002 });
    for (let i = 0; i < 3; i++) k.box('floor', p.floor, W - 2 * t, t, D - t, 0, 0.02 + i * (H / 3), t / 2, { r: 0.001 });
    k.box('body', p.body, 0.012, H / 3, D - t, 0.06, H / 6 + 0.02, t / 2, { r: 0.001 });
    const rl = Math.hypot(W / 2 + 0.03, rise), ra = Math.atan2(rise, W / 2 + 0.03);
    for (const s of [-1, 1]) k.box('roof', p.roof, rl, 0.015, D + 0.03, s * (W / 4 + 0.005), H + rise / 2, 0, { r: 0.003, rz: -s * ra, ...C(p.roofColor) });
    const gable = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, rise)]);
    k.panel('body', p.body, gable, t, 0, H, -D / 2 + t / 2, { bevel: 0.001 });
    // window panes in the back wall + chimney + tiny furniture
    for (const [x, y] of [[-0.2, 0.42], [0.2, 0.42], [-0.2, 0.68], [0.2, 0.68]]) k.box('glass', 'glass-clear', 0.08, 0.1, 0.004, x, y, -D / 2 + t + 0.002, { r: 0 });
    k.box('roof', p.roof, 0.05, 0.12, 0.05, 0.18, H + 0.14, -0.05, { r: 0.003, ...C(p.roofColor) });
    k.box('toys', 'fabric-velvet-blue', 0.14, 0.05, 0.07, -0.18, 0.055, -0.05, { r: 0.01 });
    k.box('toys', 'fabric-velvet-blue', 0.12, 0.04, 0.16, 0.2, 0.3, -0.03, { r: 0.01 });
    k.box('toys', 'fabric-velvet-blue', 0.08, 0.06, 0.06, -0.15, 0.56, 0.0, { r: 0.01 });
    return finish(k);
  },
});

const easel = mk({
  id: 'kids-art-easel', category: 'kids', ko: '양면 미술 이젤', en: 'Double-sided art easel',
  params: [WOOD('wood-pine'), P.bool('paper', '종이 롤', 'Paper roll', true), P.len('height', '높이', 'Height', 1.15, 0.9, 1.3)],
  tags: ['easel', 'art easel', 'chalkboard', 'whiteboard', '이젤', '미술 이젤', '칠판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, W = 0.6, B = 0.6, a = Math.atan2(B / 2, H), L = Math.hypot(B / 2, H);
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) k.box('frame', p.wood, 0.035, L, 0.025, sx * W / 2, H / 2, sz * B / 4, { r: 0.005, rx: -sz * a });
      k.box(sz > 0 ? 'white' : 'black', sz > 0 ? 'paint-white-gloss' : 'paint-black-matte', W - 0.03, 0.5, 0.008, 0, H * 0.62, sz * B * 0.12 + sz * 0.012, { r: 0.002, rx: -sz * a });
      k.box('frame', p.wood, W, 0.025, 0.1, 0, H * 0.33, sz * B * 0.3, { r: 0.004 });
    }
    if (p.paper) {
      k.rod('frame', p.wood, [-W / 2, H + 0.02, 0], [W / 2, H + 0.02, 0], 0.01);
      k.cyl('paper', 'paper', 0.04, 0.04, W - 0.06, -W / 2 + 0.03, H + 0.02, 0, { rz: -PI / 2, segs: k.seg(16, 8) });
    }
    return finish(k);
  },
});

const trainTable = mk({
  id: 'kids-train-table', category: 'kids', ko: '기차 놀이 테이블', en: 'Train table with track',
  params: [WOOD('wood-white'), P.mat('top', '상판', 'Top', 'paint-green-matte', 'paint'), P.mat('track', '레일', 'Track', 'wood-ash', 'wood')],
  tags: ['train table', 'train set', 'play table', '기차 테이블', '기차 놀이', '놀이 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.2, D = 0.8, h = 0.42;
    k.box('top', p.top, L, 0.02, D, 0, h - 0.01, 0, { r: 0.004 });
    for (const sz of [-1, 1]) k.box('frame', p.wood, L, 0.05, 0.02, 0, h + 0.0, sz * (D / 2 + 0.01), { r: 0.004 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.02, 0.05, D + 0.04, sx * (L / 2 + 0.01), h, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.05, h - 0.02, 0.05, sx * (L / 2 - 0.05), (h - 0.02) / 2, sz * (D / 2 - 0.05), { r: 0.006 });
    k.box('frame', p.wood, L - 0.1, 0.012, D - 0.1, 0, 0.1, 0, { r: 0.002 });
    k.tube('track', p.track, loop(0.45, 0.28, h + 0.008, 28), 0.018, { closed: true, radial: k.seg(6, 4) });
    k.tube('track', p.track, loop(0.3, 0.14, h + 0.008, 24), 0.018, { closed: true, radial: k.seg(6, 4) });
    for (const [x, z, c] of [[0.42, 0.08, 0], [0.38, -0.08, 1], [0.32, -0.2, 2]]) k.rbox(`car${c}`, 'paint-white-gloss', 0.07, 0.05, 0.1, 0.01, x, h + 0.05, z, C(PAL[c]));
    for (const [x, z] of [[-0.1, 0], [0.05, 0.02], [-0.3, 0.3], [0.5, -0.33]]) {
      k.cyl('trees', 'plant-leaf', 0.0, 0.04, 0.12, x, h + 0.03, z, { segs: k.seg(10, 5) });
      k.cyl('frame', p.wood, 0.008, 0.008, 0.03, x, h, z, { segs: 6 });
    }
    return finish(k);
  },
});

const playMat = mk({
  id: 'kids-play-mat-puzzle', category: 'kids', ko: '퍼즐 놀이 매트', en: 'Foam puzzle play mat',
  params: [P.int('tiles', '타일(한 변)', 'Tiles per side', 4, 2, 6), P.len('tile', '타일 크기', 'Tile size', 0.3, 0.25, 0.6), P.pick('palette', '색', 'Colours', 'bright', [['bright', '원색', 'Bright'], ['soft', '파스텔', 'Pastel']])],
  tags: ['play mat', 'puzzle mat', 'foam mat', '놀이 매트', '퍼즐 매트', '유아 매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.tiles, s = p.tile;
    const cols = p.palette === 'soft' ? ['#f4d6cc', '#d6e6c3', '#cfe0ef', '#efe3c0'] : PAL;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c = (i + j * 2) % 4;
      k.box(`tile${c}`, 'plastic-white', s - 0.003, 0.012, s - 0.003, -n * s / 2 + s * (i + 0.5), 0.006, -n * s / 2 + s * (j + 0.5), { r: 0.002, ...C(cols[c]) });
    }
    return finish(k);
  },
});

const stepStool = mk({
  id: 'kids-step-stool', category: 'kids', ko: '2단 발판', en: 'Two-step stool',
  params: [WOOD('wood-white'), P.mat('treads', '발판', 'Treads', 'wood-oak', 'wood')],
  tags: ['step stool', 'stool', 'bathroom step', '발판', '디딤대', '계단 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.42, D = 0.38;
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(D / 2, 0.15), new THREE.Vector2(0, 0.15), new THREE.Vector2(0, 0.3), new THREE.Vector2(-D / 2, 0.3)]);
      k.panel('frame', p.wood, shape, 0.018, s * (W / 2 - 0.009), 0, 0, { ry: PI / 2, bevel: 0.003 });
    }
    k.box('treads', p.treads, W, 0.018, D / 2, 0, 0.15, -D / 4, { r: 0.003 });
    k.box('treads', p.treads, W, 0.018, D / 2, 0, 0.3, D / 4, { r: 0.003 });
    k.cyl('frame', 'rubber-black', 0.02, 0.02, 0.005, 0, 0.16, -D / 4, { segs: 8 });
    return finish(k);
  },
});

const highChair = mk({
  id: 'kids-high-chair', category: 'kids', ko: '아기 식탁 의자(하이체어)', en: 'Baby high chair with tray',
  params: [WOOD('wood-ash'), P.mat('tray', '식판', 'Tray', 'plastic-white', 'plastic'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-cotton-grey', 'fabric')],
  tags: ['high chair', 'baby chair', 'feeding chair', '하이체어', '아기 의자', '유아 식탁 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sy = 0.55, s = 0.36;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', p.wood, [sx * 0.14, sy, sz * 0.13], [sx * 0.27, 0, sz * 0.27], 0.018, { r2: 0.014 });
    k.box('frame', p.wood, s, 0.025, s, 0, sy, 0, { r: 0.006 });
    k.box('frame', p.wood, s, 0.42, 0.025, 0, sy + 0.22, -s / 2 + 0.01, { r: 0.008, rx: -0.1 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.025, 0.2, s, sx * (s / 2 - 0.0125), sy + 0.1, 0, { r: 0.006 });
    k.rod('frame', p.wood, [-0.24, 0.24, 0.2], [0.24, 0.24, 0.2], 0.015);
    k.box('frame', p.wood, 0.28, 0.018, 0.1, 0, 0.3, 0.17, { r: 0.004 });
    k.rbox('tray', p.tray, 0.5, 0.025, 0.28, 0.01, 0, sy + 0.22, 0.26);
    k.rbox('tray', p.tray, 0.46, 0.03, 0.02, 0.008, 0, sy + 0.24, 0.39);
    k.soft('cushion', p.fabric, s - 0.06, 0.03, s - 0.05, 0.012, 0, sy + 0.028, 0.01, { puff: 0.004 });
    return finish(k);
  },
});

const walker = mk({
  id: 'kids-push-walker', category: 'kids', ko: '원목 보행기 수레(블록)', en: 'Wooden push walker with blocks',
  params: [WOOD('wood-pine'), P.int('blocks', '블록 수', 'Blocks', 8, 0, 14)],
  tags: ['push walker', 'baby walker', 'wagon', '보행기', '걸음마 수레', '원목 장난감'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.42, W = 0.3, y0 = 0.08;
    k.box('frame', p.wood, L, 0.015, W, 0, y0, 0, { r: 0.003 });
    for (const sz of [-1, 1]) k.box('frame', p.wood, L, 0.12, 0.015, 0, y0 + 0.06, sz * (W / 2 - 0.0075), { r: 0.003 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.015, 0.12, W, sx * (L / 2 - 0.0075), y0 + 0.06, 0, { r: 0.003 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wheels', p.wood, 0.065, 0.065, 0.02, sx * 0.15, 0.065, sz > 0 ? W / 2 : -W / 2 - 0.02, { rx: PI / 2, segs: k.seg(20, 8) });
    for (const sz of [-1, 1]) k.rod('frame', p.wood, [-L / 2, y0 + 0.08, sz * (W / 2 - 0.01)], [-L / 2 - 0.12, 0.5, sz * (W / 2 - 0.01)], 0.014);
    k.rod('frame', p.wood, [-L / 2 - 0.12, 0.5, -W / 2], [-L / 2 - 0.12, 0.5, W / 2], 0.018);
    const rand = rng(5);
    for (let i = 0; i < p.blocks; i++) {
      const s = 0.05;
      k.box(`block${i % 4}`, 'paint-white-matte', s, s, s, -L / 2 + 0.05 + (i % 4) * 0.09 + rand() * 0.01, y0 + 0.033 + Math.floor(i / 8) * 0.05, -W / 2 + 0.06 + (Math.floor(i / 4) % 2) * 0.1 + 0.02, { r: 0.004, ry: rand() * 0.4, ...C(PAL[i % 4]) });
    }
    return finish(k);
  },
});

const teddy = mk({
  id: 'kids-teddy-bear', category: 'kids', placement: 'surface', ko: '곰 인형', en: 'Teddy bear',
  params: [P.mat('fur', '털', 'Fur', 'fabric-boucle', 'fabric'), P.color('color', '색', 'Colour', '#9a6a43'), P.len('size', '크기', 'Height', 0.35, 0.2, 0.8)],
  tags: ['teddy bear', 'stuffed toy', 'plush', '곰 인형', '봉제 인형', '인형'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size / 0.35, f = C(p.color), seg = { segs: k.seg(18, 8), rings: k.seg(12, 5) };
    k.sphere('fur', p.fur, 0.085 * s, 0, 0.1 * s, 0, { scale: [1, 1.1, 0.9], ...seg, ...f });
    k.sphere('fur', p.fur, 0.07 * s, 0, 0.25 * s, 0.01 * s, { ...seg, ...f });
    for (const x of [-1, 1]) {
      k.sphere('fur', p.fur, 0.027 * s, x * 0.05 * s, 0.31 * s, 0, { ...seg, ...f });
      k.sphere('fur', p.fur, 0.033 * s, x * 0.085 * s, 0.13 * s, 0.03 * s, { scale: [0.8, 1.4, 0.8], ...seg, ...f });
      k.sphere('fur', p.fur, 0.04 * s, x * 0.05 * s, 0.035 * s, 0.07 * s, { scale: [0.9, 0.9, 1.3], ...seg, ...f });
      k.sphere('eyes', 'plastic-black', 0.008 * s, x * 0.025 * s, 0.27 * s, 0.072 * s, { segs: 8, rings: 6 });
    }
    k.sphere('snout', 'fabric-linen-beige', 0.03 * s, 0, 0.235 * s, 0.07 * s, { scale: [1, 0.8, 0.8], ...seg });
    k.sphere('eyes', 'plastic-black', 0.01 * s, 0, 0.245 * s, 0.093 * s, { segs: 8, rings: 6 });
    return finish(k);
  },
});

const blocks = mk({
  id: 'kids-building-blocks', category: 'kids', placement: 'surface', ko: '원목 쌓기 블록', en: 'Wooden building blocks',
  params: [P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'), P.bool('painted', '색칠', 'Painted', true)],
  tags: ['building blocks', 'wooden blocks', 'toy blocks', '쌓기 블록', '원목 블록', '블록 장난감'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = 0.05;
    const col = (i) => (p.painted ? ['b0', 'paint-white-matte', C(PAL[i % 4])] : ['b0', p.wood, {}]);
    const put = (i, w, h, d, x, y, z, ry = 0) => { const [r, m, o] = col(i); k.box(p.painted ? `b${i % 4}` : r, m, w, h, d, x, y, z, { r: 0.003, ry, ...o }); };
    put(0, s * 2, s, s, -0.05, s / 2, 0);
    put(1, s, s, s, 0.06, s / 2, 0.02, 0.3);
    put(2, s * 2, s * 0.5, s, -0.05, s * 1.25, 0);
    put(3, s, s, s, -0.05, s * 2, 0, 0.2);
    k.cyl(p.painted ? 'b1' : 'b0', p.painted ? 'paint-white-matte' : p.wood, s / 2, s / 2, s * 1.2, 0.07, s, 0.02, { segs: k.seg(16, 6), ...(p.painted ? C(PAL[1]) : {}) });
    const tri = new THREE.Shape([new THREE.Vector2(-s, 0), new THREE.Vector2(s, 0), new THREE.Vector2(0, s * 0.9)]);
    k.panel(p.painted ? 'b2' : 'b0', p.painted ? 'paint-white-matte' : p.wood, tri, s, -0.05, s * 2.5, 0, { bevel: 0.003, ...(p.painted ? C(PAL[2]) : {}) });
    put(0, s, s, s, 0.0, s / 2, 0.09, 0.6);
    put(2, s * 1.5, s * 0.5, s * 0.5, 0.1, s * 0.25, 0.1, -0.4);
    return finish(k);
  },
});

const playpen = mk({
  id: 'kids-playpen', category: 'kids', ko: '아기 놀이울(펜스)', en: 'Baby playpen',
  params: [P.len('size', '크기', 'Size', 1.2, 0.9, 1.8), WOOD('wood-white', '프레임', 'Frame'), P.mat('pad', '바닥 매트', 'Floor pad', 'fabric-cotton-grey', 'fabric')],
  tags: ['playpen', 'play yard', 'baby fence', '아기 놀이울', '놀이방 매트', '베이비 룸'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, H = 0.66, po = 0.04;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, po, H, po, sx * (S / 2 - po / 2), H / 2, sz * (S / 2 - po / 2), { r: 0.008 });
    for (const s of [-1, 1]) {
      for (const y of [0.05, H - 0.02]) {
        k.box('frame', p.wood, S - 2 * po, 0.03, 0.03, 0, y, s * (S / 2 - 0.02), { r: 0.006 });
        k.box('frame', p.wood, 0.03, 0.03, S - 2 * po, s * (S / 2 - 0.02), y, 0, { r: 0.006 });
      }
      slatsX(k, 'frame', p.wood, -S / 2 + po, S / 2 - po, 0.06, H - 0.03, s * (S / 2 - 0.02), 0.08, 0.022);
      slatsZ(k, 'frame', p.wood, -S / 2 + po, S / 2 - po, 0.06, H - 0.03, s * (S / 2 - 0.02), 0.08, 0.022);
    }
    k.soft('pad', p.pad, S - 0.1, 0.04, S - 0.1, 0.015, 0, 0.02, 0, { puff: 0.004 });
    return finish(k);
  },
});

const miniSofa = mk({
  id: 'kids-mini-sofa', category: 'kids', ko: '어린이 미니 소파', en: 'Kids mini sofa',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-velvet-rose', 'fabric'), P.len('width', '폭', 'Width', 0.8, 0.55, 1.1), WOOD('wood-oak', '다리', 'Legs')],
  tags: ['kids sofa', 'mini sofa', 'toddler couch', '어린이 소파', '아기 소파', '미니 소파'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, legH = 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', p.wood, 0.015, 0.011, legH, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), { segs: k.seg(10, 5) });
    k.soft('fabric', p.fabric, w, 0.14, d, 0.03, 0, legH + 0.07, 0, { puff: 0.006 });
    k.soft('fabric', p.fabric, w - 0.2, 0.08, d - 0.1, 0.03, 0, legH + 0.18, 0.04, { puff: 0.012 });
    for (const sx of [-1, 1]) k.soft('fabric', p.fabric, 0.1, 0.18, d, 0.04, sx * (w / 2 - 0.05), legH + 0.23, 0, { puff: 0.01 });
    k.soft('fabric', p.fabric, w, 0.28, 0.1, 0.04, 0, legH + 0.28, -d / 2 + 0.05, { puff: 0.01 });
    return finish(k);
  },
});

const kidsRocker = mk({
  id: 'kids-rocking-chair', category: 'kids', ko: '어린이 흔들의자', en: 'Kids rocking chair',
  params: [WOOD('wood-white'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-mustard', 'fabric')],
  tags: ['kids rocking chair', 'rocker', 'child chair', '어린이 흔들의자', '흔들의자', '아이 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.4, sy = 0.26;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.015);
      const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8 - 0.5; return [x, 0.018 + 0.08 * (t * 2) ** 2, t * 0.6]; });
      k.tube('frame', p.wood, pts, 0.016, { caps: true });
      k.box('frame', p.wood, 0.025, sy, 0.025, x, sy / 2 + 0.01, 0.13, { r: 0.005 });
      k.box('frame', p.wood, 0.025, 0.55, 0.025, x, 0.3, -0.13, { r: 0.005, rx: -0.12 });
      k.box('frame', p.wood, 0.03, 0.025, 0.3, x, sy + 0.16, 0.0, { r: 0.006 });
      k.box('frame', p.wood, 0.02, 0.16, 0.02, x, sy + 0.08, 0.12, { r: 0.004 });
    }
    k.box('frame', p.wood, W, 0.022, 0.32, 0, sy, 0, { r: 0.004 });
    for (const y of [0.42, 0.52]) k.box('frame', p.wood, W - 0.03, 0.06, 0.018, 0, y, -0.13 - (y - 0.3) * 0.12, { r: 0.004, rx: -0.12 });
    k.soft('cushion', p.fabric, W - 0.05, 0.03, 0.28, 0.012, 0, sy + 0.026, 0.01, { puff: 0.005 });
    return finish(k);
  },
});

const climbArch = mk({
  id: 'kids-climbing-arch', category: 'kids', ko: '아치 흔들 클라이머', en: 'Climbing arch rocker',
  params: [WOOD('wood-pine'), P.len('width', '폭', 'Width', 0.6, 0.45, 0.8), P.bool('cushion', '쿠션', 'Cushion', false), P.mat('fabric', '쿠션 천', 'Cushion fabric', 'fabric-cotton-grey', 'fabric')],
  tags: ['climbing arch', 'rocker', 'montessori', 'pikler arch', '클라이밍 아치', '흔들 아치', '몬테소리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, R = 0.48, n = 11;
    for (const s of [-1, 1]) {
      const pts = Array.from({ length: 17 }, (_, i) => { const a = PI * (i / 16); return [s * (w / 2 - 0.012), R * Math.sin(a) + 0.015, R * Math.cos(a) * 1.0]; });
      k.tube('frame', p.wood, pts, 0.016, { caps: true });
    }
    for (let i = 0; i < n; i++) {
      const a = PI * ((i + 0.5) / n);
      k.box('rungs', p.wood, w - 0.03, 0.018, 0.07, 0, R * Math.sin(a) + 0.01, R * Math.cos(a), { r: 0.004, rx: a - PI / 2 });
    }
    if (p.cushion) k.soft('cushion', p.fabric, w - 0.06, 0.05, 0.7, 0.02, 0, 0.025, 0, { puff: 0.006 });
    return finish(k);
  },
});

const sensoryBoard = mk({
  id: 'kids-busy-board', category: 'kids', placement: 'wall', elevation: 0.3, ko: '벽걸이 비지 보드(감각 놀이판)', en: 'Wall busy board',
  params: [P.mat('board', '판', 'Board', 'plywood', 'wood'), P.len('width', '폭', 'Width', 0.8, 0.5, 1.2)],
  tags: ['busy board', 'sensory board', 'activity board', '비지 보드', '감각 놀이판', '촉감 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = 0.55, t = 0.018;
    k.box('board', p.board, W, H, t, 0, H / 2, t / 2, { r: 0.008 });
    k.cyl('items0', 'plastic-white', 0.05, 0.05, 0.02, -W / 2 + 0.1, H * 0.7, t, { rx: PI / 2, segs: k.seg(20, 8), ...C(PAL[0]) });
    k.cyl('items1', 'plastic-white', 0.03, 0.03, 0.025, -W / 2 + 0.1, H * 0.3, t, { rx: PI / 2, segs: k.seg(16, 6), ...C(PAL[2]) });
    k.box('items2', 'plastic-white', 0.12, 0.08, 0.015, 0, H * 0.7, t + 0.007, { r: 0.006, ...C(PAL[1]) });
    k.box('metal', 'metal-brass', 0.06, 0.012, 0.012, 0, H * 0.3, t + 0.008, { r: 0.003 });
    k.rod('metal', 'metal-chrome', [W / 2 - 0.25, H * 0.25, t + 0.02], [W / 2 - 0.05, H * 0.25, t + 0.02], 0.004);
    for (let i = 0; i < 4; i++) k.sphere(`items${i % 3}`, 'plastic-white', 0.014, W / 2 - 0.22 + i * 0.05, H * 0.25, t + 0.02, { segs: 10, rings: 6, ...C(PAL[i]) });
    k.box('items1', 'plastic-white', 0.18, 0.12, 0.012, W / 2 - 0.15, H * 0.68, t + 0.006, { r: 0.008, ...C(PAL[2]) });
    return finish(k);
  },
});

const toyShelfLow = mk({
  id: 'kids-montessori-shelf', category: 'kids', ko: '몬테소리 낮은 교구장', en: 'Low Montessori toy shelf',
  params: [P.len('width', '폭', 'Width', 1.0, 0.6, 1.4), WOOD('wood-pine'), P.int('levels', '단 수', 'Levels', 2, 1, 3), P.bool('toys', '장난감', 'Toys', true)],
  tags: ['montessori shelf', 'toy shelf', 'low shelf', '교구장', '몬테소리', '낮은 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.3, lh = 0.28, H = p.levels * lh + 0.06, t = 0.02;
    for (const s of [-1, 1]) k.box('frame', p.wood, t, H, d, s * (w / 2 - t / 2), H / 2, 0, { r: 0.004 });
    for (let i = 0; i <= p.levels; i++) k.box('frame', p.wood, w - 2 * t, t, d, 0, 0.05 + i * lh, 0, { r: 0.002 });
    k.box('frame', p.wood, w - 2 * t, H - 0.05, 0.006, 0, (H + 0.05) / 2, -d / 2 + 0.003, { r: 0 });
    if (p.toys) {
      const rand = rng(11);
      for (let i = 0; i < p.levels; i++) {
        const y = 0.06 + i * lh;
        k.rbox(`toy${i % 3}`, 'plastic-white', 0.15, 0.1, 0.12, 0.02, -w / 4, y + 0.05, 0, C(PAL[i]));
        k.sphere(`toy${(i + 1) % 3}`, 'plastic-white', 0.05, w / 8, y + 0.06, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4), ...C(PAL[i + 1]) });
        k.cyl('basket', 'rattan', 0.08, 0.07, 0.08, w / 3, y + 0.01, rand() * 0.02, { segs: k.seg(16, 6) });
      }
    }
    return finish(k);
  },
});

const kidsDresser = mk({
  id: 'kids-dresser-colour', category: 'kids', ko: '컬러 서랍장(아이 방)', en: 'Kids colour-front dresser',
  params: [P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'), P.int('rows', '서랍 단', 'Drawer rows', 4, 3, 5)],
  tags: ['kids dresser', 'chest of drawers', 'drawers', '아이 서랍장', '컬러 서랍장', '서랍장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.8, h = 0.9, d = 0.45, n = p.rows;
    k.box('body', p.body, w, h - 0.06, d - 0.02, 0, (h + 0.06) / 2, -0.01, { r: 0.005 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('body', p.body, 0.02, 0.02, 0.06, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), { segs: k.seg(10, 5) });
    const fh = (h - 0.1) / n;
    for (let i = 0; i < n; i++) {
      const y = 0.08 + fh * (i + 0.5);
      k.box(`front${i % 4}`, 'paint-white-matte', w - 0.04, fh - 0.01, 0.018, 0, y, d / 2 - 0.01, { r: 0.004, ...C(PAL[i % 4]) });
      k.box('pulls', 'paint-white-gloss', 0.1, 0.02, 0.01, 0, y + fh / 2 - 0.035, d / 2 + 0.002, { r: 0.008 });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------- variants */

const V = [
  variant(cribConvertible, 'natural', '원목 변신 아기 침대', 'Natural-wood convertible crib', { wood: 'wood-oak', bedding: 'fabric-linen-white' }, { tags: ['oak', '원목'] }),
  variant(teepee, 'grey', '그레이 티피 텐트', 'Grey teepee', { fabric: 'fabric-linen-grey', mat: 'fabric-cotton-white' }, { tags: ['grey', '그레이'] }),
  variant(beanBag, 'mustard', '머스타드 어린이 빈백', 'Mustard kids bean bag', { fabric: 'fabric-mustard' }, { tags: ['mustard', '머스타드'] }),
  variant(playMat, 'pastel', '파스텔 퍼즐 매트(대형)', 'Large pastel puzzle mat', { palette: 'soft', tiles: 6 }, { tags: ['pastel', '파스텔', 'large', '대형'] }),
];

export const ITEMS = [
  cribConvertible, cribRound, bassinet, cradle, toddlerBed, houseBed, carBed, loftDesk, bunkStairs, trundle,
  studyDesk, growChair, bookDisplay, houseShelf, cubbies, binOrganizer, wardrobe, changingTable, toyChest,
  playKitchen, teepee, aTent, rockingHorse, tableStools, tableChairs, beanBag, glider, ballPit, slide, pikler,
  growthChart, mobile, nightLamp, dollhouse, easel, trainTable, playMat, stepStool, highChair, walker, teddy, blocks,
  playpen, miniSofa, kidsRocker, climbArch, sensoryBoard, toyShelfLow, kidsDresser,
  ...V,
];
