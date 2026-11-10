// Even more kids items: triple and L-shaped bunk beds, mid-sleeper cabin bed, canopy princess bed,
// bedside co-sleeper crib, open-shelf changing table, nursery pieces (bouncer, baby swing, play gym,
// seated walker, pram, infant car seat, potty, nappy bin, safety gate), learning tower, kids vanity,
// art table, picnic table, sensory table, play furniture (modular play couch, soft-play blocks, play
// shop, puppet theatre, tool workbench, dress-up rack, sling bookshelf, cloud shelf), active play
// (indoor swing, mini trampoline, climbing wall, seesaw, play tunnel, basketball hoop, football goal)
// and ride-ons (balance bike, tricycle, kick scooter, ride-on car), toy piano and drum kit.
// Sizes are measured from the default build. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, T, roundRect, ellipse, addCabinet, addHandle, transformAdded, shellGeo, pillowGeo } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const C = (color, extra = {}) => ({ overrides: { color }, ...extra });
const PAL = ['#e86b5f', '#f2c14e', '#5fa8d3', '#7cc47f', '#b48ad6', '#f29bb5'];
const torus = (R, r, rs, ts, arc = PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc);
const WOOD = (def = 'wood-pine', ko = '나무', en = 'Wood', key = 'wood') => P.mat(key, ko, en, def, 'wood');

/** A wheel (tyre torus + hub) at (x, y, z) with its axle along x. */
function wheel(k, x, y, z, r, { tyre = 'rubber-black', hub = 'metal-steel', w = 0.02, hubColor } = {}) {
  k.add('tyres', tyre, T(torus(r - w / 2, w / 2, k.seg(8, 4), k.seg(22, 10)), x, y, z, 0, PI / 2, 0));
  k.cyl('hubs', hub, r * 0.45, r * 0.45, w * 0.8, x - w * 0.4, y, z, { rz: -PI / 2, segs: k.seg(14, 6), ...(hubColor ? C(hubColor) : {}) });
}

/** Mattress + pillow + folded blanket lying along x on a deck at y (head at −x). */
function mattress(k, ml, mw, y, { x = 0, z = 0, t = 0.12, bedding = 'fabric-cotton-white', blanket = 'fabric-velvet-blue' } = {}) {
  k.soft('mattress', bedding, ml, t, mw, 0.035, x, y + t / 2, z, { puff: 0.006, flat: 4 });
  const g = pillowGeo(Math.min(0.45, mw * 0.65), 0.3, 0.1, k.seg(12, 5));
  T(g, 0, 0, 0, -PI / 2 + 0.2, PI / 2, 0);
  g.translate(x - ml / 2 + 0.2, y + t + 0.05, z);
  k.add('pillows', bedding, g);
  if (blanket) k.soft('blanket', blanket, ml * 0.45, 0.04, mw - 0.04, 0.015, x + ml * 0.2, y + t + 0.02, z, { puff: 0.005 });
}

/** Rails: posts at both ends plus vertical slats between x0..x1 at z, from y0 to y1. */
function rail(k, role, mat, x0, x1, y0, y1, z, pitch = 0.1, w = 0.025) {
  k.box(role, mat, x1 - x0, 0.04, w + 0.005, (x0 + x1) / 2, y1 - 0.02, z, { r: 0.005 });
  const n = Math.max(1, Math.round((x1 - x0) / pitch));
  for (let i = 1; i < n; i++) k.box(role, mat, w, y1 - y0 - 0.04, w * 0.8, x0 + ((x1 - x0) * i) / n, (y0 + y1 - 0.04) / 2, z, { r: 0.004 });
}

/* ---------------------------------------------------------------- beds */

const tripleBunk = mk({
  id: 'kids-bed-triple-bunk', category: 'kids', ko: '3층 벙커 침대', en: 'Triple bunk bed',
  params: [WOOD('wood-pine'), P.mat('bedding', '침구', 'Bedding', 'fabric-cotton-white', 'fabric')],
  tags: ['triple bunk', 'bunk bed', 'three tier', 'kids bed', '3층 침대', '벙커 침대', '이층 침대', '형제 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.06, W = 0.96, H = 2.3, decks = [0.12, 0.9, 1.65];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.07, H, 0.07, sx * (L / 2 - 0.035), H / 2, sz * (W / 2 - 0.035), { r: 0.006 });
    decks.forEach((y, i) => {
      for (const sz of [-1, 1]) k.box('frame', p.wood, L - 0.07, 0.12, 0.03, 0, y + 0.02, sz * (W / 2 - 0.035), { r: 0.004 });
      k.box('frame', p.wood, L - 0.1, 0.02, W - 0.1, 0, y, 0, { r: 0.002 });
      mattress(k, L - 0.14, W - 0.12, y + 0.01, { bedding: p.bedding, blanket: 'fabric-velvet-blue', t: 0.1 });
      void i;
    });
    for (const y of [1.25, 1.98]) rail(k, 'frame', p.wood, -L / 2 + 0.05, L / 2 - 0.5, y - 0.1, y + 0.25, W / 2 - 0.035, 0.3);
    for (const y of [1.25, 1.98]) k.box('frame', p.wood, L - 0.07, 0.04, 0.03, 0, y + 0.23, -W / 2 + 0.035, { r: 0.004 });
    // straight ladder at the foot end on the front
    const lx = L / 2 - 0.28;
    for (const dx of [-0.17, 0.17]) k.box('frame', p.wood, 0.04, decks[2] + 0.35, 0.04, lx + dx, (decks[2] + 0.35) / 2, W / 2 + 0.03, { r: 0.004 });
    for (let i = 1; i <= 7; i++) k.box('frame', p.wood, 0.34, 0.03, 0.045, lx, i * 0.25, W / 2 + 0.03, { r: 0.004 });
    return finish(k);
  },
});

const lBunk = mk({
  id: 'kids-bed-l-bunk', category: 'kids', ko: 'ㄱ자 벙커 침대(수납장 포함)', en: 'L-shaped bunk bed with shelves',
  params: [WOOD('wood-white'), P.color('accent', '포인트 색', 'Accent colour', PAL[2])],
  tags: ['l-shaped bunk', 'corner bunk', 'bunk bed', 'kids bed', 'ㄱ자 침대', '벙커 침대', '이층 침대', '코너 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.06, W = 0.96, deck = 1.25, H = 1.65;
    // upper bed along x at the back, lower bed along z on the right, shelves under the upper bed
    const uz = -W / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.06, H, 0.06, sx * (L / 2 - 0.03), H / 2, uz + sz * (W / 2 - 0.03), { r: 0.005 });
    for (const sz of [-1, 1]) k.box('frame', p.wood, L, 0.1, 0.03, 0, deck, uz + sz * (W / 2 - 0.015), { r: 0.004 });
    k.box('frame', p.wood, L - 0.06, 0.02, W - 0.06, 0, deck - 0.03, uz, { r: 0.002 });
    mattress(k, L - 0.1, W - 0.1, deck - 0.02, { z: uz, blanket: 'fabric-mustard', t: 0.1 });
    // front guard rail, open where the ladder comes up
    rail(k, 'frame', p.wood, -L / 2 + 0.03, -0.46, deck + 0.05, H, uz + W / 2 - 0.015, 0.25);
    rail(k, 'frame', p.wood, -0.1, L / 2 - 0.03, deck + 0.05, H, uz + W / 2 - 0.015, 0.25);
    k.box('frame', p.wood, L, 0.04, 0.03, 0, H - 0.02, uz - W / 2 + 0.015, { r: 0.004 });
    // shelf unit under the upper bed (left half)
    addCabinet(k, { w: 0.8, h: deck - 0.1, d: 0.4, x: -L / 2 + 0.45, z: uz - W / 2 + 0.21, rows: [{ h: 0.33, n: 2, type: 'open' }, { h: 0.33, n: 2, type: 'open' }, { h: 0.34, n: 2, type: 'open' }], body: p.wood, base: 'none' });
    // lower bed along z (sticks out towards +z), foot posts
    const lx = L / 2 - W / 2, lz = 0.6, LL = 2.0;
    for (const sx of [-1, 1]) for (const end of [-1, 1]) k.box('frame', p.wood, 0.06, end > 0 ? 0.6 : 0.3, 0.06, lx + sx * (W / 2 - 0.03), end > 0 ? 0.3 : 0.15, lz + end * (LL / 2 - 0.03), { r: 0.005 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.03, 0.18, LL - 0.06, lx + sx * (W / 2 - 0.015), 0.22, lz, { r: 0.004 });
    k.box('frame', p.wood, W - 0.06, 0.3, 0.03, lx, 0.45, lz + LL / 2 - 0.03, { r: 0.004, overrides: { color: p.accent } });
    transformAdded(k, () => mattress(k, LL - 0.1, W - 0.1, 0.25, { blanket: 'fabric-velvet-green', t: 0.12 }), lx, 0, lz, -PI / 2);
    // ladder on the left of the upper bed front
    const ax = -0.28;
    for (const dx of [-0.15, 0.15]) k.box('frame', p.wood, 0.04, H, 0.04, ax + dx, H / 2, uz + W / 2 + 0.03, { r: 0.004 });
    for (let i = 1; i <= 5; i++) k.box('frame', p.wood, 0.3, 0.03, 0.04, ax, i * 0.24, uz + W / 2 + 0.03, { r: 0.004, overrides: { color: p.accent } });
    return finish(k);
  },
});

const midSleeper = mk({
  id: 'kids-bed-mid-sleeper', category: 'kids', ko: '미드 슬리퍼 캐빈 침대(커튼 아지트)', en: 'Mid-sleeper cabin bed with curtain den',
  params: [WOOD('wood-white'), P.mat('curtain', '커튼', 'Curtain', 'fabric-velvet-blue', 'fabric'), P.bool('curtainOn', '커튼', 'Curtain', true)],
  tags: ['mid sleeper', 'cabin bed', 'den', 'play space', 'kids bed', '미드 슬리퍼', '캐빈 침대', '아지트 침대', '중층 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.0, W = 0.95, deck = 0.95, H = 1.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.06, H, 0.06, sx * (L / 2 - 0.03), H / 2, sz * (W / 2 - 0.03), { r: 0.005 });
    for (const sz of [-1, 1]) k.box('frame', p.wood, L, 0.12, 0.025, 0, deck, sz * (W / 2 - 0.0125), { r: 0.004 });
    k.box('frame', p.wood, L - 0.06, 0.02, W - 0.06, 0, deck - 0.04, 0, { r: 0.002 });
    mattress(k, L - 0.1, W - 0.1, deck - 0.03, { blanket: 'fabric-velvet-rose', t: 0.12 });
    rail(k, 'frame', p.wood, -L / 2 + 0.03, L / 2 - 0.5, deck + 0.06, H, W / 2 - 0.0125, 0.3);
    k.box('frame', p.wood, L, 0.04, 0.025, 0, H - 0.02, -W / 2 + 0.0125, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.025, H - deck - 0.06, W, sx * (L / 2 - 0.0125), deck + (H - deck) / 2 - 0.03, 0, { r: 0.003 });
    if (p.curtainOn) {
      // gathered curtain under the deck on the front, with a gap at one end
      const cl = L - 0.5;
      k.add('curtain', p.curtain, shellGeo(k.seg(36, 12), 2, (u, v) => [-L / 2 + 0.05 + u * cl, 0.02 + v * (deck - 0.1), W / 2 + 0.01 + 0.02 * (1 + Math.sin(u * PI * 14))], 0.006));
      k.rod('frame', 'metal-white', [-L / 2 + 0.03, deck - 0.07, W / 2 + 0.025], [L / 2 - 0.03, deck - 0.07, W / 2 + 0.025], 0.008);
      k.sphere('lights', 'light-warm', 0.015, -0.3, deck - 0.1, 0.0, { segs: 8, rings: 5 });
      k.light(-0.3, deck - 0.12, 0, { intensity: 0.2, distance: 1.5 });
    }
    // three-step ladder-stair at the right end
    for (let i = 1; i <= 3; i++) k.box('frame', p.wood, 0.42, 0.025, 0.2, L / 2 + 0.12, i * 0.24, W / 2 - 0.15, { r: 0.004 });
    for (const dz of [-0.2, 0.2]) k.box('frame', p.wood, 0.42, 0.03, 0.03, L / 2 + 0.12, deck / 2, W / 2 - 0.15 + dz * 0.5, { r: 0.004, rz: 0.0 });
    for (const dx of [-0.2, 0.2]) k.box('frame', p.wood, 0.03, deck, 0.03, L / 2 + 0.12 + dx, deck / 2, W / 2 - 0.25, { r: 0.004 });
    return finish(k);
  },
});

const princessBed = mk({
  id: 'kids-bed-canopy-princess', category: 'kids', ko: '캐노피 공주 침대', en: 'Princess canopy bed',
  params: [WOOD('wood-white'), P.mat('canopy', '캐노피 천', 'Canopy fabric', 'fabric-velvet-rose', 'fabric')],
  tags: ['princess bed', 'canopy bed', 'girls bed', 'kids bed', '공주 침대', '캐노피 침대', '여아 침대', '아이 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 2.06, W = 1.06, fy = 0.3;
    k.box('frame', p.wood, L, 0.2, W, 0, fy - 0.0, 0, { r: 0.01, segs: 2 });
    mattress(k, L - 0.1, W - 0.08, fy + 0.1, { blanket: p.canopy, t: 0.18 });
    // arched headboard with a cut-out heart
    const hb = new THREE.Shape(); hb.moveTo(-W / 2, 0); hb.lineTo(W / 2, 0); hb.lineTo(W / 2, 0.75); hb.quadraticCurveTo(W / 2, 1.15, 0, 1.2); hb.quadraticCurveTo(-W / 2, 1.15, -W / 2, 0.75); hb.lineTo(-W / 2, 0);
    const heart = new THREE.Path(); heart.moveTo(0, 0.72); heart.bezierCurveTo(0.12, 0.84, 0.18, 0.98, 0.07, 1.0); heart.bezierCurveTo(0.03, 1.0, 0.0, 0.97, 0, 0.94); heart.bezierCurveTo(0.0, 0.97, -0.03, 1.0, -0.07, 1.0); heart.bezierCurveTo(-0.18, 0.98, -0.12, 0.84, 0, 0.72);
    hb.holes.push(heart);
    k.panel('frame', p.wood, hb, 0.04, -L / 2 + 0.02, 0, 0, { ry: PI / 2 });
    k.box('frame', p.wood, 0.04, 0.55, W, L / 2 - 0.02, 0.275, 0, { r: 0.008 });
    // crown + draped canopy falling behind the headboard
    const top = 2.1, cx = -L / 2 + 0.1;
    k.rod('frame', p.wood, [cx - 0.05, 0.6, 0], [cx - 0.05, top, 0], 0.015);
    k.add('frame', 'metal-gold', T(torus(0.22, 0.012, k.seg(6, 4), k.seg(24, 8)), cx + 0.15, top, 0, PI / 2, 0, 0));
    k.cyl('frame', 'metal-gold', 0.08, 0.22, 0.1, cx + 0.15, top - 0.02, 0, { open: true, segs: k.seg(20, 8) });
    k.add('canopy', p.canopy, shellGeo(k.seg(28, 10), k.seg(12, 5), (u, v) => {
      const a = PI * 0.3 + u * PI * 1.4, y = top - v * (top - 0.35);
      const R = 0.2 + v * 0.45;
      return [cx + 0.15 + Math.cos(a) * R * 0.9 + v * 0.1, y, Math.sin(a) * R * (1 + v * 0.3) + 0.015 * Math.sin(u * PI * 12) * v];
    }, 0.006));
    return finish(k);
  },
});

const coSleeper = mk({
  id: 'kids-crib-co-sleeper', category: 'kids', ko: '침대 옆 아기 침대(사이드 크립)', en: 'Bedside co-sleeper crib',
  params: [P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'), P.mat('fabric', '천', 'Fabric', 'fabric-cotton-grey', 'fabric'), P.bool('sideDown', '옆판 내림', 'Side lowered', true)],
  tags: ['co-sleeper', 'bedside crib', 'side sleeper', 'bassinet', 'newborn', '사이드 크립', '아기 침대', '신생아 침대', '침대 옆 크립'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.9, W = 0.55, y = 0.55, hs = 0.3;
    // H legs with castors and a height column
    for (const sx of [-1, 1]) {
      k.rod('frame', p.frame, [sx * (L / 2 - 0.08), 0.06, -W / 2 + 0.05], [sx * (L / 2 - 0.08), 0.06, W / 2 + 0.15], 0.015);
      k.rod('frame', p.frame, [sx * (L / 2 - 0.08), 0.06, -0.05], [sx * (L / 2 - 0.08), y, -0.05], 0.018);
      for (const sz of [-W / 2 + 0.05, W / 2 + 0.15]) k.sphere('wheels', 'rubber-black', 0.03, sx * (L / 2 - 0.08), 0.03, sz, { segs: 10, rings: 6 });
    }
    k.rbox('fabric', p.fabric, L, 0.06, W, 0.02, 0, y, 0);
    k.soft('mattress', 'fabric-cotton-white', L - 0.05, 0.05, W - 0.05, 0.015, 0, y + 0.05, 0, { puff: 0.004 });
    // mesh walls (frosted panels) on three sides, front lowered towards the parents' bed (+z)
    for (const sx of [-1, 1]) k.box('fabric', 'glass-frosted', 0.012, hs, W, sx * (L / 2 - 0.006), y + 0.03 + hs / 2, 0, { r: 0.004 });
    k.box('fabric', 'glass-frosted', L, hs, 0.012, 0, y + 0.03 + hs / 2, -W / 2 + 0.006, { r: 0.004 });
    const fy = p.sideDown ? y + 0.03 + 0.04 : y + 0.03 + hs / 2;
    k.box('fabric', 'glass-frosted', L, p.sideDown ? 0.08 : hs, 0.012, 0, fy, W / 2 - 0.006, { r: 0.004 });
    k.tube('frame', p.fabric, [[-L / 2, y + 0.03 + hs, W / 2], [-L / 2, y + 0.03 + hs, -W / 2], [L / 2, y + 0.03 + hs, -W / 2], [L / 2, y + 0.03 + hs, W / 2]], 0.015, { tension: 0, radial: 6 });
    for (const sx of [-1, 1]) k.box('fabric', p.fabric, 0.05, 0.03, 0.2, sx * (L / 2 - 0.1), y - 0.02, W / 2 + 0.08, { r: 0.005 });
    return finish(k);
  },
});

/* ------------------------------------------------------------ nursery */

const changingShelf = mk({
  id: 'kids-changing-table-open', category: 'kids', ko: '오픈 선반 기저귀 교환대', en: 'Open-shelf changing table',
  params: [WOOD('wood-white'), P.mat('pad', '교환 패드', 'Changing pad', 'fabric-cotton-grey', 'fabric'), P.bool('baskets', '바구니', 'Baskets', true)],
  tags: ['changing table', 'baby changer', 'nappy station', 'nursery', '기저귀 교환대', '교환대', '아기방', '육아'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.9, d = 0.5, h = 0.92;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.04, h + 0.1, 0.04, sx * (w / 2 - 0.02), (h + 0.1) / 2, sz * (d / 2 - 0.02), { r: 0.006 });
    for (const y of [0.12, 0.5, h - 0.02]) k.box('frame', p.wood, w - 0.04, 0.02, d - 0.04, 0, y, 0, { r: 0.002 });
    // guard rails round the top
    k.box('frame', p.wood, w, 0.08, 0.02, 0, h + 0.06, -d / 2 + 0.01, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.02, 0.08, d, sx * (w / 2 - 0.01), h + 0.06, 0, { r: 0.004 });
    k.soft('pad', p.pad, w - 0.08, 0.08, d - 0.06, 0.03, 0, h + 0.03, 0, { puff: 0.01 });
    if (p.baskets) for (const y of [0.13, 0.51]) for (const sx of [-1, 1]) k.rbox('baskets', 'rattan', w / 2 - 0.08, 0.2, d - 0.12, 0.02, sx * (w / 4 - 0.01), y + 0.11, 0);
    for (let i = 0; i < 5; i++) k.box('nappies', 'fabric-cotton-white', 0.12, 0.03, 0.18, w / 4, 0.53 + 0.23 + i * 0.03 - 0.0, 0, { r: 0.008 });
    return finish(k);
  },
});

const bouncer = mk({
  id: 'kids-baby-bouncer', category: 'kids', ko: '아기 바운서', en: 'Baby bouncer',
  params: [P.mat('fabric', '시트', 'Seat', 'fabric-linen-grey', 'fabric'), P.mat('frame', '프레임', 'Frame', 'metal-chrome', 'metal'), P.bool('toyBar', '장난감 바', 'Toy bar', true)],
  tags: ['bouncer', 'baby bouncer', 'rocker', 'infant seat', '바운서', '아기 바운서', '흔들 의자', '신생아'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // wire frame: a loop on the floor rising to the seat at the back
    k.bentTube('frame', p.frame, [[-0.2, 0.01, 0.3], [-0.22, 0.01, -0.25], [-0.2, 0.32, -0.3], [0.2, 0.32, -0.3], [0.22, 0.01, -0.25], [0.2, 0.01, 0.3], [-0.2, 0.01, 0.3]], 0.008, 0.06);
    k.add('fabric', p.fabric, shellGeo(k.seg(10, 5), k.seg(16, 6), (u, v) => {
      const x = (u - 0.5) * 0.36 * (1 - 0.2 * v);
      const z = 0.25 - v * 0.52, y = 0.08 + 0.32 * v * v - 0.04 * Math.sin(u * PI) - 0.02 * Math.sin(v * PI) + 0.06 * (1 - v);
      return [x, y, z];
    }, 0.04));
    k.soft('fabric', p.fabric, 0.18, 0.05, 0.12, 0.02, 0, 0.12, 0.05, { puff: 0.01 });
    if (p.toyBar) {
      k.bentTube('frame', 'plastic-white', [[-0.21, 0.2, -0.05], [-0.21, 0.45, 0.02], [0.21, 0.45, 0.02], [0.21, 0.2, -0.05]], 0.01, 0.08);
      for (let i = 0; i < 3; i++) { k.rod('toys', 'plastic-white', [-0.1 + i * 0.1, 0.45, 0.02], [-0.1 + i * 0.1, 0.38, 0.02], 0.003, { segs: 4 }); k.sphere('toys', 'plastic-white', 0.025, -0.1 + i * 0.1, 0.36, 0.02, { segs: 10, rings: 6, ...C(PAL[i]) }); }
    }
    return finish(k);
  },
});

const babySwing = mk({
  id: 'kids-baby-swing', category: 'kids', ko: '전동 아기 그네(스윙)', en: 'Baby swing',
  params: [P.mat('fabric', '시트', 'Seat', 'fabric-cotton-grey', 'fabric'), P.mat('frame', '프레임', 'Frame', 'plastic-white', 'plastic')],
  tags: ['baby swing', 'infant swing', 'glider', 'nursery', '아기 그네', '전동 스윙', '흔들침대', '육아용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 0.95, w = 0.7;
    // A-frame legs each side, overhead motor hub, two hanger arms, a reclined seat
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rod('frame', p.frame, [sx * w / 2, 0.02, sz * 0.38], [sx * (w / 2 - 0.02), H, 0], 0.018);
      k.rbox('frame', p.frame, 0.06, 0.03, 0.8, 0.01, sx * w / 2, 0.015, 0);
      k.rbox('frame', p.frame, 0.08, 0.1, 0.1, 0.03, sx * (w / 2 - 0.02), H, 0);
      k.rod('frame', 'metal-steel', [sx * (w / 2 - 0.06), H, 0], [sx * 0.2, 0.45, 0.0], 0.01);
    }
    k.rod('frame', p.frame, [-w / 2, H + 0.04, 0], [w / 2, H + 0.04, 0], 0.022);
    k.add('fabric', p.fabric, shellGeo(k.seg(10, 5), k.seg(14, 6), (u, v) => [(u - 0.5) * 0.38, 0.35 + 0.35 * v * v, 0.2 - v * 0.45 - 0.03 * Math.sin(u * PI)], 0.05));
    k.soft('fabric', p.fabric, 0.18, 0.05, 0.12, 0.02, 0, 0.38, 0.1, { puff: 0.01 });
    for (let i = 0; i < 3; i++) k.sphere('toys', 'plastic-white', 0.022, -0.06 + i * 0.06, H - 0.07, 0.04, { segs: 10, rings: 6, ...C(PAL[i + 2]) });
    return finish(k);
  },
});

const playGym = mk({
  id: 'kids-baby-play-gym', category: 'kids', ko: '아기 놀이 매트 짐(아치)', en: 'Baby play gym',
  params: [P.mat('mat', '매트', 'Mat', 'fabric-mustard', 'fabric'), WOOD('wood-ash', '아치', 'Arch')],
  tags: ['play gym', 'activity gym', 'baby mat', 'tummy time', '아기 체육관', '놀이 매트', '모빌 매트', '터미타임'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.slab('mat', p.mat, ellipse(0.9, 0.9), 0.025, 0, { bevel: 0.01 });
    // wooden A-frame arch with hanging toys
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('arch', p.wood, [sx * 0.38, 0.0, sz * 0.18], [sx * 0.32, 0.55, 0], 0.016);
    k.rod('arch', p.wood, [-0.36, 0.56, 0], [0.36, 0.56, 0], 0.016);
    const toys = [['sphere', PAL[0]], ['ring', PAL[2]], ['star', PAL[1]], ['sphere', PAL[3]]];
    toys.forEach(([kind, color], i) => {
      const x = -0.2 + i * 0.13, len = 0.12 + (i % 2) * 0.06;
      k.rod('strings', 'paper', [x, 0.55, 0], [x, 0.55 - len, 0], 0.002, { segs: 4 });
      if (kind === 'ring') k.add('toys', 'plastic-white', T(torus(0.03, 0.008, 6, 14), x, 0.55 - len - 0.03, 0), C(color));
      else if (kind === 'star') k.add('toys', 'plastic-white', T(new THREE.OctahedronGeometry(0.035), x, 0.55 - len - 0.035, 0), C(color));
      else k.sphere('toys', 'plastic-white', 0.03, x, 0.55 - len - 0.03, 0, { segs: 10, rings: 6, ...C(color) });
    });
    k.soft('mat', 'fabric-cotton-white', 0.25, 0.06, 0.2, 0.02, 0.0, 0.055, -0.25, { puff: 0.01 });
    return finish(k);
  },
});

const seatedWalker = mk({
  id: 'kids-baby-walker-seated', category: 'kids', ko: '보행기(원형 좌석)', en: 'Seated baby walker',
  params: [P.color('color', '색', 'Colour', PAL[2]), P.mat('seat', '시트', 'Seat', 'fabric-cotton-grey', 'fabric')],
  tags: ['baby walker', 'activity walker', 'round walker', '보행기', '아기 보행기', '원형 보행기', '유아용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const o = C(p.color);
    k.lathe('base', 'plastic-white', [[0.3, 0.03], [0.36, 0.03], [0.37, 0.08], [0.34, 0.1], [0.3, 0.09]], 0, 0, 0, { segs: k.seg(32, 10), scale: [1.1, 1, 1], ...o });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; k.sphere('wheels', 'plastic-grey', 0.03, Math.cos(a) * 0.36, 0.03, Math.sin(a) * 0.33, { segs: 8, rings: 5 }); }
    for (let i = 0; i < 4; i++) { const a = PI / 4 + (i * PI) / 2; k.rod('frame', 'metal-white', [Math.cos(a) * 0.33, 0.09, Math.sin(a) * 0.3], [Math.cos(a) * 0.25, 0.47, Math.sin(a) * 0.23], 0.012); }
    k.lathe('tray', 'plastic-white', [[0.18, 0.46], [0.3, 0.46], [0.31, 0.5], [0.29, 0.52], [0.2, 0.52], [0.18, 0.5]], 0, 0, 0, { segs: k.seg(32, 10), scale: [1.1, 1, 1], ...o });
    k.lathe('seat', p.seat, [[0, 0.32], [0.12, 0.33], [0.17, 0.42], [0.18, 0.5], [0.16, 0.5], [0.13, 0.38], [0, 0.36]], 0, 0, 0, { segs: k.seg(24, 8) });
    for (let i = 0; i < 3; i++) k.cyl('toys', 'plastic-white', 0.025, 0.025, 0.04, -0.15 + i * 0.12, 0.52, 0.22, { segs: 10, ...C(PAL[(i + 3) % 6]) });
    return finish(k);
  },
});

const pram = mk({
  id: 'kids-stroller', category: 'kids', ko: '유모차(디럭스)', en: 'Baby pram / stroller',
  params: [P.mat('fabric', '바구니 천', 'Body fabric', 'fabric-navy', 'fabric'), P.mat('frame', '프레임', 'Frame', 'metal-chrome', 'metal'), P.bool('hood', '차양', 'Hood up', true)],
  tags: ['pram', 'stroller', 'pushchair', 'buggy', '유모차', '디럭스 유모차', '아기 유모차', '육아용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const ww = 0.56;
    // chassis: rear wheels (big) at −z, front wheels at +z, handle rising at the back
    for (const sx of [-1, 1]) {
      wheel(k, sx * ww / 2, 0.14, -0.32, 0.14, { w: 0.04 });
      wheel(k, sx * (ww / 2 - 0.03), 0.09, 0.3, 0.09, { w: 0.035 });
      k.rod('frame', p.frame, [sx * (ww / 2 - 0.03), 0.14, -0.32], [sx * 0.2, 0.5, 0.0], 0.012);
      k.rod('frame', p.frame, [sx * (ww / 2 - 0.05), 0.09, 0.3], [sx * 0.2, 0.5, 0.0], 0.012);
      k.rod('frame', p.frame, [sx * 0.2, 0.5, 0.0], [sx * 0.2, 1.02, -0.42], 0.013);
    }
    k.rod('frame', 'leather-black', [-0.22, 1.02, -0.42], [0.22, 1.02, -0.42], 0.018);
    k.rod('frame', p.frame, [-ww / 2 + 0.03, 0.14, -0.32], [ww / 2 - 0.03, 0.14, -0.32], 0.009);
    k.rbox('basket', 'fabric-wool-charcoal', 0.38, 0.12, 0.45, 0.03, 0, 0.25, -0.02);
    // carrycot: a rounded tub with the hood folded up at the back
    k.lathe('body', p.fabric, [[0, 0], [0.12, 0.0], [0.2, 0.05], [0.22, 0.22], [0.2, 0.23], [0.18, 0.06], [0, 0.03]], 0, 0.52, 0, { segs: k.seg(28, 10), scale: [0.95, 1, 1.75] });
    k.soft('mattress', 'fabric-cotton-white', 0.3, 0.04, 0.6, 0.015, 0, 0.57, 0, { puff: 0.004 });
    if (p.hood) k.sphere('hood', p.fabric, 0.22, 0, 0.73, -0.15, { thetaLength: PI / 2, segs: k.seg(20, 8), rings: k.seg(6, 3), scale: [0.95, 0.9, 1.3], rx: -PI / 2 });
    return finish(k);
  },
});

const carSeat = mk({
  id: 'kids-infant-car-seat', category: 'kids', ko: '신생아 바구니 카시트', en: 'Infant car seat carrier',
  params: [P.mat('fabric', '시트', 'Fabric', 'fabric-wool-charcoal', 'fabric'), P.mat('shell', '셸', 'Shell', 'plastic-black', 'plastic')],
  tags: ['car seat', 'infant carrier', 'baby seat', 'travel', '카시트', '바구니 카시트', '신생아 카시트', '외출'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // a deep oval tub tipped back (head end raised at −z) on two rocker rails, padded insert,
    // a carry handle arching across, and a sun canopy over the head end
    const tilt = 0.42;
    transformAdded(k, (kk) => {
      kk.lathe('shell', p.shell, [[0, 0], [0.15, 0], [0.19, 0.06], [0.21, 0.2], [0.215, 0.24], [0.2, 0.245], [0.185, 0.2], [0.165, 0.07], [0, 0.04]], 0, 0, 0, { segs: k.seg(28, 10), scale: [1, 1, 1.6] });
      kk.soft('fabric', p.fabric, 0.28, 0.06, 0.5, 0.025, 0, 0.07, 0, { puff: 0.012 });
      kk.soft('fabric', p.fabric, 0.26, 0.08, 0.12, 0.03, 0, 0.1, -0.24, { puff: 0.01 });
      for (const sx of [-1, 1]) kk.box('straps', 'fabric-wool-charcoal', 0.03, 0.005, 0.25, sx * 0.06, 0.105, -0.03, { r: 0.002 });
      kk.cyl('straps', 'metal-steel', 0.02, 0.02, 0.01, 0, 0.1, 0.12, { segs: 10 });
      for (const sx of [-1, 1]) kk.bentTube('shell', p.shell, [[sx * 0.12, 0.05, 0.25], [sx * 0.13, -0.02, 0.12], [sx * 0.13, -0.02, -0.12], [sx * 0.12, 0.05, -0.25]], 0.016, 0.08);
      kk.add('handle', p.shell, T(torus(0.225, 0.016, k.seg(6, 4), k.seg(20, 8), PI), 0, 0.22, 0.02));
      for (const sx of [-1, 1]) kk.cyl('handle', p.shell, 0.035, 0.035, 0.03, sx * 0.225, 0.22, 0.02, { rz: PI / 2, segs: 12 });
      kk.sphere('canopy', p.fabric, 0.21, 0, 0.2, -0.17, { thetaLength: PI / 2, segs: k.seg(16, 6), rings: k.seg(5, 3), scale: [1.02, 0.7, 1.2], rx: -0.9 });
    }, 0, 0.06, 0, 0);
    // tip the whole tub back (head end up) about x through the front rocker contact
    for (const part of k.parts.values()) for (const g of part.geos) { g.translate(0, -0.06, -0.3); g.rotateX(tilt); g.translate(0, 0.06, 0.3); }
    return finish(k);
  },
});

const potty = mk({
  id: 'kids-potty', category: 'kids', ko: '유아 변기(등받이 포티)', en: 'Potty chair',
  params: [P.color('color', '색', 'Colour', '#ffffff'), P.color('accent', '포인트 색', 'Accent', PAL[3])],
  tags: ['potty', 'potty chair', 'toilet training', 'toddler', '유아 변기', '아기 변기', '배변 훈련', '포티'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('body', 'plastic-white', [[0, 0], [0.14, 0], [0.15, 0.02], [0.16, 0.2], [0.17, 0.22], [0, 0.22]], 0, 0, 0, { segs: k.seg(28, 10), scale: [1, 1, 1.15], ...C(p.color) });
    const seat = ellipse(0.32, 0.36); seat.holes.push(new THREE.Path(ellipse(0.17, 0.2).getPoints(24)));
    k.slab('seat', 'plastic-white', seat, 0.025, 0.22, { bevel: 0.008, ...C(p.accent) });
    k.rbox('seat', 'plastic-white', 0.3, 0.2, 0.04, 0.02, 0, 0.32, -0.17, { rx: -0.2, ...C(p.accent) });
    k.rbox('seat', 'plastic-white', 0.06, 0.06, 0.06, 0.02, 0, 0.26, 0.17, C(p.accent));
    return finish(k);
  },
});

const nappyBin = mk({
  id: 'kids-nappy-bin', category: 'kids', ko: '기저귀 휴지통(밀폐형)', en: 'Nappy disposal bin',
  params: [P.color('color', '색', 'Colour', '#ffffff')],
  tags: ['nappy bin', 'diaper pail', 'odour lock', 'nursery', '기저귀 휴지통', '기저귀 통', '밀폐 휴지통', '아기방'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('body', 'plastic-white', 0.28, 0.6, 0.26, 0.08, 0, 0.3, 0, { segs: 3, ...C(p.color) });
    k.rbox('lid', 'plastic-grey', 0.26, 0.05, 0.24, 0.07, 0, 0.62, 0, { segs: 3 });
    k.box('lid', 'plastic-grey', 0.12, 0.04, 0.06, 0, 0.02, 0.13, { r: 0.012 });
    k.rbox('body', 'plastic-white', 0.2, 0.25, 0.01, 0.01, 0, 0.32, 0.13, C('#eeeeee'));
    return finish(k);
  },
});

const babyGate = mk({
  id: 'kids-safety-gate', category: 'kids', ko: '안전문(유아 게이트)', en: 'Baby safety gate',
  params: [P.len('width', '폭', 'Width', 0.8, 0.7, 1.1), P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'), P.bool('open', '열림', 'Open', false)],
  tags: ['safety gate', 'baby gate', 'stair gate', 'pet gate', '안전문', '유아 안전문', '계단 게이트', '펫 게이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.76;
    // pressure-fit frame with a swinging door in the middle
    for (const sx of [-1, 1]) {
      k.box('frame', p.frame, 0.03, h, 0.03, sx * (w / 2 - 0.015), h / 2, 0, { r: 0.004 });
      for (const y of [0.1, h - 0.1]) k.cyl('frame', 'rubber-black', 0.025, 0.025, 0.02, sx * (w / 2 - 0.0), y, 0, { rz: PI / 2, segs: 10 });
    }
    k.box('frame', p.frame, w - 0.06, 0.03, 0.03, 0, 0.015, 0, { r: 0.004 });
    const dw = w - 0.2;
    transformAdded(k, (kk) => {
      kk.box('frame', p.frame, dw, 0.025, 0.025, dw / 2, h - 0.03, 0, { r: 0.004 });
      kk.box('frame', p.frame, dw, 0.025, 0.025, dw / 2, 0.06, 0, { r: 0.004 });
      const n = Math.round(dw / 0.065);
      for (let i = 0; i <= n; i++) kk.cyl('frame', p.frame, 0.007, 0.007, h - 0.1, (dw * i) / n, 0.06, 0, { segs: 6 });
      kk.box('latch', 'plastic-grey', 0.05, 0.1, 0.04, dw - 0.02, h - 0.08, 0, { r: 0.008 });
    }, -dw / 2, 0, 0, p.open ? -1.2 : 0);
    for (const sx of [-1, 1]) k.box('frame', p.frame, 0.07, 0.025, 0.025, sx * (w / 2 - 0.065), h - 0.03, 0, { r: 0.004 });
    return finish(k);
  },
});

/* ----------------------------------------------------- kids furniture */

const learningTower = mk({
  id: 'kids-learning-tower', category: 'kids', ko: '러닝 타워(주방 도우미 발판)', en: 'Learning tower',
  params: [WOOD('wood-pine'), P.len('platform', '발판 높이', 'Platform height', 0.45, 0.3, 0.55)],
  tags: ['learning tower', 'kitchen helper', 'montessori', 'step stool', '러닝 타워', '키친 헬퍼', '몬테소리', '발판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.47, d = 0.47, H = 0.9, py = p.platform;
    // two side frames, platform, a lower step at the front, guard bars round the top
    for (const sx of [-1, 1]) {
      const side = new THREE.Shape(); side.moveTo(-d / 2, 0); side.lineTo(d / 2, 0); side.lineTo(d / 2 - 0.06, H); side.lineTo(-d / 2 + 0.06, H); side.lineTo(-d / 2, 0);
      side.holes.push(new THREE.Path(roundRect(d - 0.24, H - py - 0.2, 0.05).getPoints(6).map((v) => new THREE.Vector2(v.x, v.y + py + 0.06 + (H - py - 0.2) / 2))));
      k.panel('frame', p.wood, side, 0.018, sx * (w / 2 - 0.009), 0, 0, { ry: PI / 2 });
    }
    k.box('frame', p.wood, w - 0.036, 0.02, d - 0.08, 0, py, 0, { r: 0.003 });
    k.box('frame', p.wood, w - 0.036, 0.02, 0.2, 0, py * 0.48, d / 2 - 0.1, { r: 0.003 });
    for (const [y, z] of [[H - 0.03, -d / 2 + 0.08], [H - 0.03, d / 2 - 0.08], [py + 0.25, d / 2 - 0.1]]) k.rod('frame', p.wood, [-w / 2 + 0.02, y, z], [w / 2 - 0.02, y, z], 0.014);
    k.box('frame', p.wood, w - 0.036, 0.25, 0.018, 0, py + 0.2, -d / 2 + 0.08, { r: 0.003 });
    return finish(k);
  },
});

const kidsVanity = mk({
  id: 'kids-vanity', category: 'kids', ko: '어린이 화장대(거울·스툴)', en: 'Kids vanity table with mirror and stool',
  params: [P.color('color', '색', 'Colour', PAL[5]), P.bool('stool', '스툴', 'Stool', true)],
  tags: ['kids vanity', 'play vanity', 'dressing table', 'pretend play', '어린이 화장대', '공주 화장대', '역할놀이', '아이 화장대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, d = 0.32, h = 0.5, o = C(p.color);
    k.rbox('body', 'paint-white-matte', w, 0.025, d, 0.008, 0, h - 0.0125, 0);
    k.rbox('body', 'paint-white-matte', w - 0.02, 0.1, d - 0.02, 0.008, 0, h - 0.075, 0, o);
    addHandle(k, 'handles', 'metal-gold', 'knob', 0, h - 0.075, d / 2 - 0.01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'paint-white-matte', 0.016, 0.012, h - 0.12, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), { segs: 10 });
    // arched mirror with a scalloped frame
    const mr = new THREE.Shape(); mr.moveTo(-0.2, 0); mr.lineTo(0.2, 0); mr.lineTo(0.2, 0.3); mr.absarc(0, 0.3, 0.2, 0, PI, false); mr.lineTo(-0.2, 0);
    k.panel('frame', 'paint-white-matte', mr, 0.025, 0, h, -d / 2 + 0.03, o);
    const glass = new THREE.Shape(); glass.moveTo(-0.17, 0.03); glass.lineTo(0.17, 0.03); glass.lineTo(0.17, 0.3); glass.absarc(0, 0.3, 0.17, 0, PI, false); glass.lineTo(-0.17, 0.03);
    k.add('mirror', 'mirror', T(new THREE.ShapeGeometry(glass, k.seg(16, 6)), 0, h, -d / 2 + 0.044));
    for (let i = 0; i < 3; i++) k.lathe('items', 'plastic-white', [[0, 0], [0.018, 0], [0.018, 0.06], [0.01, 0.07], [0, 0.07]], -0.2 + i * 0.05, h, 0.04, { segs: 10, ...C(PAL[i]) });
    if (p.stool) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'paint-white-matte', 0.012, 0.01, 0.26, sx * 0.1, 0, d / 2 + 0.2 + sz * 0.08, { segs: 8 }); k.soft('stool', 'fabric-velvet-rose', 0.28, 0.06, 0.24, 0.025, 0, 0.29, d / 2 + 0.2, { puff: 0.01 }); }
    return finish(k);
  },
});

const artTable = mk({
  id: 'kids-art-table', category: 'kids', ko: '어린이 미술 테이블(종이 롤)', en: 'Kids art table with paper roll',
  params: [WOOD('wood-pine'), P.int('chairs', '의자 수', 'Chairs', 2, 0, 2)],
  tags: ['art table', 'craft table', 'paper roll', 'drawing', '미술 테이블', '그림 그리기', '어린이 책상', '공작'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.0, D = 0.6, h = 0.52;
    k.box('top', p.wood, L, 0.025, D, 0, h - 0.0125, 0, { r: 0.006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.04, h - 0.025, 0.04, sx * (L / 2 - 0.04), (h - 0.025) / 2, sz * (D / 2 - 0.04), { r: 0.006 });
    // paper roll on an axle at one end, paper running across the table
    k.cyl('paper', 'paper', 0.06, 0.06, D - 0.12, -L / 2 - 0.07, h - 0.04, -(D - 0.12) / 2, { rx: PI / 2, segs: k.seg(16, 6) });
    for (const sz of [-1, 1]) k.box('frame', p.wood, 0.12, 0.1, 0.02, -L / 2 - 0.04, h - 0.04, sz * (D / 2 - 0.05), { r: 0.004 });
    k.box('paper', 'paper', L - 0.02, 0.002, D - 0.14, 0.0, h + 0.001, 0, { r: 0 });
    // storage cups and a low shelf
    k.box('frame', p.wood, L - 0.1, 0.018, D - 0.1, 0, 0.12, 0, { r: 0.003 });
    for (let i = 0; i < 3; i++) k.cyl('cups', 'plastic-white', 0.04, 0.035, 0.09, L / 2 - 0.12, h, -0.18 + i * 0.1, { segs: 12, ...C(PAL[i]) });
    for (let i = 0; i < 5; i++) k.rod('crayons', 'plastic-white', [L / 2 - 0.12 + (i - 2) * 0.008, h + 0.05, -0.18], [L / 2 - 0.12 + (i - 2) * 0.012, h + 0.14, -0.18], 0.004, { segs: 5, overrides: { color: PAL[i] } });
    for (let c = 0; c < p.chairs; c++) {
      const z = c === 0 ? D / 2 + 0.2 : -D / 2 - 0.2;
      transformAdded(k, (kk) => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) kk.box('chairs', p.wood, 0.03, 0.28, 0.03, sx * 0.12, 0.14, sz * 0.12, { r: 0.005 });
        kk.rbox('seats', 'plastic-white', 0.29, 0.025, 0.29, 0.008, 0, 0.29, 0, C(PAL[c + 2]));
        kk.rbox('seats', 'plastic-white', 0.27, 0.1, 0.02, 0.008, 0, 0.5, -0.13, C(PAL[c + 2]));
        for (const sx of [-1, 1]) kk.box('chairs', p.wood, 0.03, 0.24, 0.03, sx * 0.12, 0.42, -0.12, { r: 0.005 });
      }, 0, 0, z, c === 0 ? PI : 0);
    }
    return finish(k);
  },
});

const kidsPicnic = mk({
  id: 'kids-picnic-table', category: 'kids', ko: '어린이 피크닉 테이블', en: 'Kids picnic table',
  params: [WOOD('wood-teak'), P.bool('umbrella', '파라솔 구멍 마개', 'Umbrella', false)],
  tags: ['kids picnic table', 'play table', 'outdoor', 'bench table', '어린이 피크닉 테이블', '어린이 테이블', '벤치 테이블', '놀이 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.9, h = 0.5, bh = 0.28;
    for (let i = 0; i < 4; i++) k.box('top', p.wood, L, 0.022, 0.1, 0, h - 0.011, -0.165 + i * 0.11, { r: 0.004 });
    for (const sz of [-1, 1]) for (let i = 0; i < 2; i++) k.box('top', p.wood, L, 0.022, 0.1, 0, bh - 0.011, sz * (0.38 + (i - 0.5) * 0.11), { r: 0.004 });
    for (const sx of [-1, 1]) {
      const x = sx * (L / 2 - 0.12);
      for (const sz of [-1, 1]) k.box('frame', p.wood, 0.04, 0.62, 0.08, x, 0.27, sz * 0.2, { r: 0.004, rx: sz * 0.62 });
      k.box('frame', p.wood, 0.04, 0.06, 0.98, x, bh - 0.05, 0, { r: 0.004 });
      k.box('frame', p.wood, 0.04, 0.05, 0.42, x, h - 0.047, 0, { r: 0.004 });
    }
    if (p.umbrella) { k.cyl('umbrella', 'metal-white', 0.012, 0.012, 1.3, 0, 0.2, 0, { segs: 8 }); k.cyl('umbrella', 'fabric-cotton-white', 0.02, 0.6, 0.2, 0, 1.35, 0, { segs: k.seg(8, 8), ...C(PAL[0]) }); }
    return finish(k);
  },
});

const sensoryTable = mk({
  id: 'kids-sensory-table', category: 'kids', ko: '감각 놀이 테이블(물·모래)', en: 'Sensory water and sand table',
  params: [P.color('color', '색', 'Colour', PAL[2]), P.bool('fill', '물·모래 채움', 'Filled', true)],
  tags: ['sensory table', 'water table', 'sand table', 'messy play', '감각 놀이', '물놀이 테이블', '모래 놀이', '촉감 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.9, D = 0.55, h = 0.55, o = C(p.color);
    for (const sx of [-1, 1]) {
      k.box('tub', 'plastic-white', L / 2 - 0.02, 0.14, D, sx * (L / 4), h - 0.07, 0, { r: 0.02, ...o });
      if (p.fill) k.box(sx < 0 ? 'water' : 'sand', sx < 0 ? 'water' : 'travertine', L / 2 - 0.07, 0.01, D - 0.05, sx * (L / 4), h - 0.03, 0, { r: 0 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'plastic-white', 0.025, 0.03, h - 0.14, sx * (L / 2 - 0.06), 0, sz * (D / 2 - 0.06), { segs: 10, ...o });
    k.box('legs', 'plastic-white', L - 0.1, 0.02, D - 0.1, 0, 0.15, 0, { r: 0.005, ...o });
    for (let i = 0; i < 3; i++) k.lathe('toys', 'plastic-white', [[0, 0], [0.03, 0], [0.04, 0.05], [0, 0.05]], 0.2 + i * 0.07, h - 0.03, -0.1 + i * 0.08, { segs: 10, ...C(PAL[(i + 3) % 6]) });
    k.sphere('toys', 'plastic-white', 0.03, -0.2, h - 0.02, 0.05, { segs: 10, rings: 6, ...C(PAL[1]) });
    return finish(k);
  },
});

/* ---------------------------------------------------------- play */

const playCouch = mk({
  id: 'kids-play-couch', category: 'kids', ko: '모듈 놀이 소파(폼 블록)', en: 'Modular kids play couch',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-velvet-green', 'fabric'), P.pick('layout', '배치', 'Layout', 'couch', [['couch', '소파', 'Couch'], ['fort', '요새', 'Fort'], ['flat', '매트', 'Flat mat']])],
  tags: ['play couch', 'modular sofa', 'foam sofa', 'nugget', 'fort', '놀이 소파', '모듈 소파', '폼 소파', '요새 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const f = p.fabric;
    if (p.layout === 'flat') {
      k.soft('foam', f, 1.2, 0.12, 0.6, 0.03, 0, 0.06, -0.31, { puff: 0.006 });
      k.soft('foam', f, 1.2, 0.12, 0.6, 0.03, 0, 0.06, 0.31, { puff: 0.006 });
      k.soft('foam', f, 0.6, 0.15, 0.6, 0.06, 0.3, 0.195, 0, { puff: 0.008 });
      k.soft('foam', f, 0.6, 0.15, 0.6, 0.06, -0.3, 0.195, 0, { puff: 0.008 });
    } else if (p.layout === 'fort') {
      k.soft('foam', f, 1.2, 0.12, 0.6, 0.03, 0, 0.06, 0, { puff: 0.006 });
      for (const sx of [-1, 1]) k.soft('foam', f, 0.12, 0.6, 0.6, 0.03, sx * 0.54, 0.42, 0, { puff: 0.006 });
      k.soft('foam', f, 1.2, 0.12, 0.6, 0.03, 0, 0.78, 0, { puff: 0.006 });
      for (const sx of [-1, 1]) k.soft('foam', f, 0.3, 0.15, 0.3, 0.05, sx * 0.25, 0.92, 0, { puff: 0.008 });
    } else {
      k.soft('foam', f, 1.2, 0.24, 0.6, 0.04, 0, 0.12, 0.05, { puff: 0.008 });
      k.soft('foam', f, 1.2, 0.36, 0.14, 0.04, 0, 0.42, -0.27, { puff: 0.008, rx: -0.12 });
      for (const sx of [-1, 1]) k.soft('foam', f, 0.3, 0.15, 0.3, 0.05, sx * 0.35, 0.315, 0.12, { puff: 0.008 });
    }
    return finish(k);
  },
});

const softPlay = mk({
  id: 'kids-soft-play-set', category: 'kids', ko: '소프트 블록 놀이 세트(계단·미끄럼)', en: 'Soft-play foam block set',
  params: [P.int('colorSet', '색 조합', 'Colour set', 0, 0, 2)],
  tags: ['soft play', 'foam blocks', 'climbing blocks', 'toddler gym', '소프트 블록', '폼 블록', '유아 놀이', '실내 놀이터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const pal = p.colorSet === 1 ? ['#f29bb5', '#b48ad6', '#ffffff', '#5fa8d3'] : p.colorSet === 2 ? ['#d6c7a8', '#9aa5a0', '#f2ebe0', '#c7a48a'] : [PAL[0], PAL[1], PAL[2], PAL[3]];
    // steps (3 risers) + a ramp wedge + a cylinder + a half-moon rocker
    for (let i = 0; i < 3; i++) k.rbox('foam', 'fabric-cotton-white', 0.3, 0.15 * (i + 1), 0.6, 0.03, -0.6 + i * 0.3, 0.075 * (i + 1), 0, C(pal[i]));
    const wedge = new THREE.Shape(); wedge.moveTo(0, 0); wedge.lineTo(0.75, 0); wedge.lineTo(0, 0.45); wedge.lineTo(0, 0);
    k.panel('foam', 'fabric-cotton-white', wedge, 0.6, -0.15, 0, 0, { bevel: 0.02, ...C(pal[3]) });
    k.cyl('foam', 'fabric-cotton-white', 0.15, 0.15, 0.6, 0.3, 0.15, 0.6, { rz: PI / 2, segs: k.seg(20, 8), ...C(pal[1]) });
    k.sphere('foam', 'fabric-cotton-white', 0.3, -0.45, 0.0, 0.62, { thetaLength: PI / 2, rx: PI, segs: k.seg(20, 8), rings: k.seg(6, 3), scale: [1, 1, 0.5], ...C(pal[0]) });
    k.box('foam', 'fabric-cotton-white', 0.6, 0.02, 0.3, -0.45, 0.3, 0.62, { r: 0.008, ...C(pal[0]) });
    return finish(k);
  },
});

const playShop = mk({
  id: 'kids-play-shop', category: 'kids', ko: '역할놀이 가게(마켓 스탠드)', en: 'Play market stall',
  params: [WOOD('wood-pine'), P.color('awning', '차양 색', 'Awning colour', PAL[0])],
  tags: ['play shop', 'market stall', 'pretend play', 'grocery stand', '역할놀이', '가게 놀이', '마트 놀이', '시장 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.9, d = 0.4, h = 0.6, H = 1.35;
    addCabinet(k, { w, h, d, rows: [{ h: 0.5, n: 2, type: 'open' }, { h: 0.5, n: 2, type: 'open' }], body: p.wood, base: 'plinth', plinth: 0.05, top: p.wood, topThick: 0.02, topOverhang: 0.03 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.04, H - h, 0.04, sx * (w / 2 - 0.02), h + (H - h) / 2, -d / 2 + 0.04, { r: 0.004 });
    // striped awning sloping forward
    const n = 6;
    for (let i = 0; i < n; i++) k.box('awning', 'fabric-cotton-white', w / n, 0.01, 0.4, -w / 2 + (w / n) * (i + 0.5), H - 0.06, -d / 2 + 0.2, { r: 0, rx: 0.35, overrides: { color: i % 2 ? '#ffffff' : p.awning } });
    k.box('frame', p.wood, w * 0.6, 0.12, 0.02, 0, H + 0.04, -d / 2 + 0.04, { r: 0.004 });
    // crates of produce + a toy till
    for (const sx of [-1, 1]) {
      k.box('crates', p.wood, w / 2 - 0.08, 0.08, 0.2, sx * (w / 4), h + 0.06, 0.05, { r: 0.004, rx: -0.25 });
      for (let i = 0; i < 4; i++) k.sphere('produce', 'plastic-white', 0.03, sx * (w / 4) - 0.1 + i * 0.065, h + 0.12, 0.05, { segs: 10, rings: 6, ...C(sx < 0 ? PAL[0] : PAL[3]) });
    }
    k.rbox('till', 'plastic-white', 0.18, 0.1, 0.14, 0.01, 0, h + 0.07, -0.08, C(PAL[2]));
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) k.box('produce', 'plastic-white', 0.08, 0.06, 0.1, -w / 2 + 0.1 + i * 0.1 + (i > 1 ? 0.06 : 0), 0.05 + 0.02 + j * (h - 0.07) / 2 + 0.03, 0.0, { r: 0.006, ...C(PAL[(i + j) % 6]) });
    return finish(k);
  },
});

const puppetTheatre = mk({
  id: 'kids-puppet-theatre', category: 'kids', ko: '인형극 무대', en: 'Puppet theatre',
  params: [WOOD('wood-white', '무대', 'Theatre'), P.mat('curtain', '커튼', 'Curtains', 'fabric-velvet-rose', 'fabric')],
  tags: ['puppet theatre', 'puppet show', 'stage', 'pretend play', '인형극', '인형극 무대', '역할놀이', '무대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.85, H = 1.4, wy = 0.85, wh = 0.38;
    // front panel with a window, two side wings angled back
    const front = new THREE.Shape(); front.moveTo(-w / 2, 0); front.lineTo(w / 2, 0); front.lineTo(w / 2, H - 0.15); front.quadraticCurveTo(0, H + 0.1, -w / 2, H - 0.15); front.lineTo(-w / 2, 0);
    const hole = new THREE.Path(); hole.moveTo(-w / 2 + 0.1, wy); hole.lineTo(w / 2 - 0.1, wy); hole.lineTo(w / 2 - 0.1, wy + wh); hole.lineTo(-w / 2 + 0.1, wy + wh); hole.lineTo(-w / 2 + 0.1, wy);
    front.holes.push(hole);
    k.panel('frame', p.wood, front, 0.02, 0, 0, 0);
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.02, H - 0.15, 0.4, sx * (w / 2 + 0.12), (H - 0.15) / 2, -0.16, { r: 0.003, ry: sx * 0.6 });
    k.box('frame', p.wood, w - 0.16, 0.03, 0.12, 0, wy - 0.015, 0.05, { r: 0.004 });
    // gathered curtains tied to each side of the window
    for (const sx of [-1, 1]) k.add('curtain', p.curtain, shellGeo(k.seg(10, 5), 2, (u, v) => [sx * (w / 2 - 0.1 - u * (0.14 - 0.08 * Math.sin(v * PI))), wy + v * wh, 0.02 + 0.012 * Math.sin(u * PI * 6)], 0.005));
    k.box('curtain', p.curtain, w - 0.16, 0.06, 0.02, 0, wy + wh - 0.03, 0.025, { r: 0.004 });
    k.box('sign', 'paint-white-matte', 0.4, 0.1, 0.01, 0, H - 0.12, 0.015, { r: 0.004, ...C(PAL[1]) });
    // a puppet peeking out
    k.sphere('puppet', 'fabric-mustard', 0.06, 0.12, wy + 0.08, 0.0, { segs: 12, rings: 8 });
    k.cyl('puppet', 'fabric-velvet-blue', 0.05, 0.07, 0.1, 0.12, wy - 0.04, 0.0, { segs: 10 });
    return finish(k);
  },
});

const workbench = mk({
  id: 'kids-tool-workbench', category: 'kids', ko: '어린이 공구 작업대', en: 'Kids toy tool workbench',
  params: [WOOD('wood-pine'), P.color('accent', '포인트 색', 'Accent colour', PAL[1])],
  tags: ['toy workbench', 'tool bench', 'pretend play', 'construction', '공구 놀이', '작업대', '역할놀이', '공구 장난감'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.7, d = 0.35, h = 0.5, H = 0.95, o = C(p.accent);
    addCabinet(k, { w, h, d, rows: [{ h: 0.5, n: 1, type: 'open' }, { h: 0.5, n: 1, type: 'open' }], body: p.wood, base: 'plinth', plinth: 0.04, top: p.wood, topThick: 0.03, topOverhang: 0.02 });
    // pegboard back with tools
    k.box('board', 'paint-white-matte', w, H - h, 0.02, 0, h + (H - h) / 2, -d / 2 + 0.01, { r: 0.004, ...o });
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 0.12 + i * 0.15;
      k.rod('tools', 'plastic-white', [x, h + 0.18, -d / 2 + 0.04], [x, h + 0.36, -d / 2 + 0.04], 0.012, { segs: 6, ...C(PAL[(i + 2) % 6]) });
      if (i % 2) k.box('tools', 'metal-steel', 0.08, 0.03, 0.03, x, h + 0.37, -d / 2 + 0.04, { r: 0.004 });
      else k.box('tools', 'metal-steel', 0.012, 0.08, 0.008, x, h + 0.4, -d / 2 + 0.04, { r: 0.002 });
    }
    // vice + a few bolts on the top
    k.rbox('tools', 'plastic-white', 0.12, 0.08, 0.1, 0.01, w / 2 - 0.1, h + 0.07, d / 2 - 0.08, C(PAL[0]));
    k.rod('tools', 'plastic-white', [w / 2 - 0.1, h + 0.06, d / 2 - 0.03], [w / 2 - 0.1, h + 0.06, d / 2 + 0.06], 0.008, { segs: 6, ...C(PAL[2]) });
    for (let i = 0; i < 4; i++) k.cyl('tools', 'plastic-white', 0.018, 0.018, 0.05, -0.2 + i * 0.06, h + 0.03, 0.05, { segs: 6, ...C(PAL[(i + 4) % 6]) });
    return finish(k);
  },
});

const dressUp = mk({
  id: 'kids-dress-up-rack', category: 'kids', ko: '역할놀이 옷걸이(거울 포함)', en: 'Dress-up costume rack with mirror',
  params: [WOOD('wood-white'), P.bool('costumes', '의상', 'Costumes', true)],
  tags: ['dress up', 'costume rack', 'clothes rail', 'pretend play', '역할놀이 옷장', '드레스업', '코스튬', '아이 옷걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.8, d = 0.38, H = 1.15;
    addCabinet(k, { w, h: 0.3, d, rows: [{ h: 1, n: 2, type: 'open' }], body: p.wood, base: 'plinth', plinth: 0.04, top: p.wood, topThick: 0.02 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.03, H - 0.3, 0.03, sx * (w / 2 - 0.015), 0.3 + (H - 0.3) / 2, -d / 2 + 0.06, { r: 0.004 });
    k.rod('frame', 'metal-white', [-w / 2 + 0.02, H - 0.05, -d / 2 + 0.06], [w / 2 - 0.02, H - 0.05, -d / 2 + 0.06], 0.01);
    k.box('frame', p.wood, 0.32, 0.6, 0.02, w / 2 - 0.18, 0.62, -d / 2 + 0.03, { r: 0.004 });
    k.box('mirror', 'mirror', 0.28, 0.56, 0.004, w / 2 - 0.18, 0.62, -d / 2 + 0.043, { r: 0 });
    if (p.costumes) for (let i = 0; i < 3; i++) {
      const x = -w / 2 + 0.12 + i * 0.12;
      k.add('hangers', 'wood-oak', T(torus(0.09, 0.004, 4, k.seg(10, 5), PI * 0.6), x, H - 0.12, -d / 2 + 0.06, 0, PI / 2, PI * 0.2));
      const g = shellGeo(k.seg(10, 4), k.seg(8, 4), (u, v) => [x + (u - 0.5) * 0.04, H - 0.12 - v * 0.55, -d / 2 + 0.06 + (u - 0.5) * (0.12 + 0.2 * v) + 0.01 * Math.sin(u * PI * 6) * v], 0.006);
      k.add('costumes', 'fabric-cotton-white', g, C(PAL[[5, 2, 4][i]]));
    }
    k.sphere('items', 'plastic-white', 0.08, -0.2, 0.36, 0.0, { thetaLength: PI / 2, segs: 12, rings: 5, ...C(PAL[1]) });
    return finish(k);
  },
});

const slingShelf = mk({
  id: 'kids-sling-bookshelf', category: 'kids', ko: '패브릭 슬링 책꽂이', en: 'Fabric sling bookshelf',
  params: [WOOD('wood-ash'), P.mat('fabric', '천', 'Fabric', 'fabric-linen-beige', 'fabric'), P.int('slings', '포켓 수', 'Pockets', 4, 3, 5)],
  tags: ['sling bookshelf', 'book sling', 'fabric shelf', 'front-facing books', '슬링 책꽂이', '패브릭 책장', '아이 책장', '전면 책꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, H = 1.1, n = p.slings;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.035, H, 0.035, sx * (w / 2 - 0.0175), H / 2, sz * 0.12 + (sz < 0 ? -0.05 : 0), { r: 0.006 });
    for (let i = 0; i < n; i++) {
      const y = 0.3 + i * ((H - 0.4) / (n - 1)), zf = 0.12, zb = -0.17 + i * 0.03;
      for (const z of [zf, zb]) k.rod('frame', p.wood, [-w / 2 + 0.03, y, z], [w / 2 - 0.03, y, z], 0.01);
      k.add('fabric', p.fabric, shellGeo(k.seg(6, 3), k.seg(10, 4), (u, v) => {
        const z = zf + (zb - zf) * v, sag = 0.18 * Math.sin(v * PI) - 0.04 * v;
        return [(u - 0.5) * (w - 0.08), y - sag, z];
      }, 0.004));
      for (let b = 0; b < 3; b++) k.box('books', 'paper', 0.17, 0.2 - b * 0.02, 0.012, -0.17 + b * 0.17, y - 0.06, zf - 0.03 - b * 0.012, { r: 0.002, rx: -0.3, overrides: { color: PAL[(i + b) % 6] } });
    }
    return finish(k);
  },
});

const cloudShelf = mk({
  id: 'kids-cloud-shelf', category: 'kids', ko: '구름 모양 벽선반', en: 'Cloud-shaped wall shelf', placement: 'wall', elevation: 1.2,
  params: [P.color('color', '색', 'Colour', '#ffffff'), P.bool('items', '소품', 'Items', true)],
  tags: ['cloud shelf', 'wall shelf', 'nursery decor', 'kids room', '구름 선반', '벽 선반', '아이방 선반', '아기방 인테리어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const d = 0.12, o = C(p.color);
    // cloud outline: bumps on top, flat bottom; a ledge at the bottom
    const s = new THREE.Shape();
    s.moveTo(-0.32, 0); s.lineTo(0.32, 0); s.absarc(0.24, 0.1, 0.1, -PI / 2 + 0.3, PI * 0.6, false);
    s.absarc(0.05, 0.2, 0.15, 0.2, PI * 0.85, false); s.absarc(-0.18, 0.14, 0.12, 0.3, PI * 0.95, false); s.absarc(-0.28, 0.06, 0.06, PI * 0.5, PI * 1.5, false); s.lineTo(-0.32, 0);
    k.panel('cloud', 'paint-white-matte', s, 0.025, 0, 0.02, -d / 2 + 0.0125, o);
    k.box('cloud', 'paint-white-matte', 0.66, 0.022, d, 0, 0.011, 0, { r: 0.004, ...o });
    if (p.items) {
      k.sphere('items', 'fabric-mustard', 0.05, -0.18, 0.07, 0.01, { segs: 10, rings: 6 });
      k.sphere('items', 'fabric-mustard', 0.035, -0.18, 0.14, 0.01, { segs: 10, rings: 6 });
      for (let i = 0; i < 3; i++) k.box('books', 'paper', 0.02, 0.16 - i * 0.02, 0.1, 0.12 + i * 0.025, 0.1 - i * 0.01, 0.0, { r: 0.002, overrides: { color: PAL[i + 2] } });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------- active play */

const indoorSwing = mk({
  id: 'kids-indoor-swing-frame', category: 'kids', ko: '실내 그네(A자 프레임)', en: 'Indoor swing frame',
  params: [WOOD('wood-pine'), P.pick('seat', '좌석', 'Seat', 'bucket', [['bucket', '안전 버킷', 'Toddler bucket'], ['board', '나무 판', 'Board'], ['saucer', '원형 둥지', 'Saucer nest']]), P.color('color', '좌석 색', 'Seat colour', PAL[0])],
  tags: ['indoor swing', 'swing frame', 'toddler swing', 'a-frame', '실내 그네', '그네', '유아 그네', '둥지 그네'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.4, H = 1.45, spread = 0.55;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', p.wood, [sx * (L / 2 - 0.04), 0, sz * spread], [sx * (L / 2 - 0.04), H, 0], 0.025, { segs: k.seg(8, 6) });
    k.box('frame', p.wood, L + 0.04, 0.07, 0.07, 0, H + 0.035, 0, { r: 0.006 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.04, 0.05, spread * 1.2, sx * (L / 2 - 0.04), 0.35, 0, { r: 0.004 });
    const sy = 0.38, o = C(p.color);
    for (const dx of [-0.17, 0.17]) k.rod('ropes', 'fabric-linen-beige', [dx, H, 0], [dx * (p.seat === 'saucer' ? 1.3 : 1), sy + 0.05, 0], 0.006, { segs: 5 });
    if (p.seat === 'bucket') {
      k.lathe('seat', 'plastic-white', [[0, 0], [0.15, 0], [0.18, 0.12], [0.19, 0.22], [0.17, 0.22], [0.15, 0.12], [0, 0.02]], 0, sy - 0.08, 0, { segs: k.seg(20, 8), scale: [1, 1, 0.9], ...o });
    } else if (p.seat === 'board') {
      k.rbox('seat', 'wood-oak', 0.42, 0.03, 0.16, 0.006, 0, sy, 0);
    } else {
      k.add('seat', 'rubber-black', T(torus(0.32, 0.03, k.seg(8, 4), k.seg(24, 10)), 0, sy, 0, PI / 2, 0, 0));
      k.cyl('seat', 'fabric-cotton-white', 0.3, 0.3, 0.01, 0, sy - 0.01, 0, { segs: k.seg(24, 10), ...o });
    }
    return finish(k);
  },
});

const miniTrampoline = mk({
  id: 'kids-mini-trampoline', category: 'kids', ko: '유아 미니 트램펄린(손잡이)', en: 'Mini trampoline with handle',
  params: [P.color('color', '패드 색', 'Pad colour', PAL[2]), P.len('diameter', '지름', 'Diameter', 0.95, 0.8, 1.2)],
  tags: ['mini trampoline', 'toddler trampoline', 'rebounder', 'bounce', '트램펄린', '유아 트램펄린', '방방', '점프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, y = 0.22, o = C(p.color);
    k.add('pad', 'fabric-cotton-white', T(torus(R - 0.06, 0.05, k.seg(8, 4), k.seg(32, 12)), 0, y, 0, PI / 2, 0, 0), o);
    k.cyl('mat', 'fabric-wool-charcoal', R - 0.1, R - 0.1, 0.005, 0, y - 0.02, 0, { segs: k.seg(32, 12) });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; k.bentTube('legs', 'metal-steel', [[Math.cos(a) * (R - 0.06), y - 0.03, Math.sin(a) * (R - 0.06)], [Math.cos(a) * (R - 0.02), 0.02, Math.sin(a) * (R - 0.02)]], 0.012, 0.02); k.cyl('legs', 'rubber-black', 0.025, 0.025, 0.02, Math.cos(a) * (R - 0.02), 0, Math.sin(a) * (R - 0.02), { segs: 8 }); }
    // T handle bar at the back
    k.rod('handle', 'metal-steel', [0, y, -R + 0.06], [0, 0.85, -R + 0.1], 0.016);
    k.rod('handle', 'rubber-black', [-0.22, 0.85, -R + 0.1], [0.22, 0.85, -R + 0.1], 0.02);
    return finish(k);
  },
});

const climbingWall = mk({
  id: 'kids-climbing-wall', category: 'kids', ko: '실내 클라이밍 월(홀드 패널)', en: 'Kids climbing wall panel', placement: 'wall', elevation: 0,
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 2.4), P.len('height', '높이', 'Height', 2.0, 1.5, 2.4), WOOD('plywood', '패널', 'Panel'), P.bool('mat', '바닥 매트', 'Crash mat', true)],
  tags: ['climbing wall', 'bouldering', 'climbing holds', 'kids gym', '클라이밍 월', '실내 암벽', '클라이밍 홀드', '아이 체육'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, z0 = -0.15;
    k.box('panel', p.wood, w, h, 0.02, 0, h / 2 + 0.03, z0, { r: 0.004 });
    const rnd = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
    const n = Math.round(w * h * 7);
    for (let i = 0; i < n; i++) {
      const x = (rnd(i + 1) - 0.5) * (w - 0.15), y = 0.2 + rnd(i + 7.3) * (h - 0.3), s = 0.035 + rnd(i + 3.1) * 0.03;
      k.add('holds', 'plastic-white', T(new THREE.IcosahedronGeometry(s, 0), x, y, z0 + 0.012, rnd(i) * 3, rnd(i + 2) * 3, 0, [1.2, 0.8, 0.55]), C(PAL[i % 6]));
    }
    if (p.mat) k.soft('mat', 'fabric-navy', w, 0.1, 0.6, 0.03, 0, 0.05, z0 + 0.32, { puff: 0.006 });
    else k.box('panel', p.wood, w, 0.03, 0.04, 0, 0.015, z0 + 0.02, { r: 0.003 });
    return finish(k);
  },
});

const seesaw = mk({
  id: 'kids-seesaw', category: 'kids', ko: '유아 시소(실내용)', en: 'Toddler seesaw',
  params: [P.color('color', '색', 'Colour', PAL[1]), P.color('accent', '포인트 색', 'Accent', PAL[2])],
  tags: ['seesaw', 'teeter totter', 'rocker', 'toddler', '시소', '유아 시소', '실내 놀이기구', '흔들 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.1, o = C(p.color), a = C(p.accent);
    k.lathe('base', 'plastic-white', [[0, 0], [0.18, 0], [0.14, 0.18], [0.06, 0.24], [0, 0.24]], 0, 0, 0, { segs: k.seg(20, 8), scale: [1, 1, 1.4], ...a });
    k.rbox('beam', 'plastic-white', L, 0.05, 0.22, 0.02, 0, 0.27, 0, o);
    for (const sx of [-1, 1]) {
      k.rbox('seat', 'plastic-white', 0.26, 0.04, 0.26, 0.02, sx * (L / 2 - 0.15), 0.31, 0, o);
      k.rbox('seat', 'plastic-white', 0.04, 0.2, 0.24, 0.015, sx * (L / 2 - 0.02), 0.4, 0, o);
      k.rod('handles', 'plastic-white', [sx * (L / 2 - 0.3), 0.29, -0.06], [sx * (L / 2 - 0.3), 0.5, -0.06], 0.015, a);
      k.rod('handles', 'plastic-white', [sx * (L / 2 - 0.3), 0.5, -0.1], [sx * (L / 2 - 0.3), 0.5, 0.1], 0.016, a);
    }
    return finish(k);
  },
});

const tunnel = mk({
  id: 'kids-play-tunnel', category: 'kids', ko: '놀이 터널(접이식)', en: 'Pop-up play tunnel',
  params: [P.len('length', '길이', 'Length', 1.8, 1.0, 2.6), P.color('color', '색', 'Colour', PAL[4])],
  tags: ['play tunnel', 'crawl tunnel', 'pop-up tunnel', 'toddler', '놀이 터널', '기어가기 터널', '유아 터널', '텐트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, R = 0.25, o = C(p.color);
    // a fabric tube kept round by wire rings; slight sag between rings
    const rings = Math.max(4, Math.round(L / 0.25));
    k.add('fabric', 'fabric-cotton-white', shellGeo(k.seg(rings * 4, rings * 2), k.seg(20, 10), (u, v) => {
      const x = (u - 0.5) * L, a = v * PI * 2, sag = 1 - 0.05 * Math.abs(Math.sin(u * rings * PI));
      return [x, R + Math.cos(a) * R * sag, Math.sin(a) * R * sag];
    }, 0.004), o);
    for (let i = 0; i <= rings; i++) k.add('rings', 'fabric-wool-charcoal', T(torus(R, 0.008, 4, k.seg(18, 8)), -L / 2 + (L * i) / rings, R, 0, 0, PI / 2, 0));
    return finish(k);
  },
});

const hoop = mk({
  id: 'kids-basketball-hoop', category: 'kids', ko: '어린이 농구대(높이조절)', en: 'Kids basketball hoop',
  params: [P.len('rim', '림 높이', 'Rim height', 1.4, 0.9, 1.9), P.color('color', '받침 색', 'Base colour', PAL[0])],
  tags: ['basketball hoop', 'kids hoop', 'basketball stand', 'indoor sport', '어린이 농구대', '농구대', '실내 농구', '아이 운동'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rh = p.rim, o = C(p.color);
    k.rbox('base', 'plastic-white', 0.6, 0.18, 0.5, 0.06, 0, 0.09, -0.05, o);
    k.cyl('pole', 'plastic-black', 0.03, 0.035, rh + 0.25 - 0.18, 0, 0.18, -0.15, { segs: 12 });
    k.rbox('board', 'plastic-white', 0.6, 0.42, 0.02, 0.02, 0, rh + 0.2, -0.12);
    k.box('board', 'plastic-black', 0.24, 0.18, 0.004, 0, rh + 0.12, -0.108, { r: 0 });
    k.add('rim', 'metal-white', T(torus(0.12, 0.008, 6, k.seg(20, 10)), 0, rh, 0.02, PI / 2, 0, 0), C(PAL[0]));
    k.lathe('net', 'fabric-cotton-white', [[0.12, rh], [0.1, rh - 0.12], [0.085, rh - 0.22], [0.08, rh - 0.22]], 0, 0, 0.02, { segs: k.seg(12, 6) });
    k.sphere('ball', 'fabric-terracotta', 0.08, 0.22, 0.08, 0.2, { segs: 12, rings: 8 });
    return finish(k);
  },
});

const goal = mk({
  id: 'kids-football-goal', category: 'kids', ko: '미니 축구 골대', en: 'Mini football goal',
  params: [P.len('width', '폭', 'Width', 1.2, 0.9, 1.8), P.mat('frame', '프레임', 'Frame', 'plastic-white', 'plastic')],
  tags: ['football goal', 'soccer goal', 'mini goal', 'kids sport', '축구 골대', '미니 골대', '어린이 축구', '아이 운동'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.8, d = 0.55, r = 0.02;
    k.bentTube('frame', p.frame, [[-w / 2, 0.02, 0], [-w / 2, h, 0], [w / 2, h, 0], [w / 2, 0.02, 0]], r, 0.04);
    k.bentTube('frame', p.frame, [[-w / 2, h - 0.02, -0.02], [-w / 2, 0.02, -d], [w / 2, 0.02, -d], [w / 2, h - 0.02, -0.02]], r * 0.8, 0.04);
    k.rod('frame', p.frame, [-w / 2, 0.02, 0], [-w / 2, 0.02, -d], r * 0.8);
    k.rod('frame', p.frame, [w / 2, 0.02, 0], [w / 2, 0.02, -d], r * 0.8);
    // net as a thin translucent shell on the back and sides (frosted reads as mesh from a distance)
    k.add('net', 'glass-frosted', shellGeo(6, 4, (u, v) => [(u - 0.5) * w, 0.02 + (1 - v) * (h - 0.04), -0.02 - v * (d - 0.02)], 0.002));
    for (const sx of [-1, 1]) k.add('net', 'glass-frosted', shellGeo(2, 3, (u, v) => [sx * w / 2, 0.02 + u * (h - 0.04) * (1 - v), -v * d], 0.002));
    k.sphere('ball', 'fabric-cotton-white', 0.09, 0.3, 0.09, 0.35, { segs: 12, rings: 8 });
    return finish(k);
  },
});

/* ---------------------------------------------------------- ride-ons */

const balanceBike = mk({
  id: 'kids-balance-bike', category: 'kids', ko: '밸런스 바이크(페달 없는 자전거)', en: 'Balance bike',
  params: [P.mat('frame', '프레임', 'Frame', 'wood-ash', 'wood'), P.color('color', '포인트 색', 'Accent colour', PAL[0])],
  tags: ['balance bike', 'running bike', 'push bike', 'toddler bike', '밸런스 바이크', '킥바이크', '유아 자전거', '페달 없는 자전거'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.15, wb = 0.56;
    wheel(k, 0, r, -wb / 2, r, { w: 0.035, hub: 'plastic-white', hubColor: p.color });
    wheel(k, 0, r, wb / 2, r, { w: 0.035, hub: 'plastic-white', hubColor: p.color });
    // wooden frame: a curved beam from the rear axle up to the head tube, fork to the front wheel
    k.tube('frame', p.frame, [[0, r, -wb / 2], [0, 0.32, -0.12], [0, 0.34, 0.12], [0, 0.42, wb / 2 - 0.08]], 0.025, { radial: k.seg(8, 5), segs: k.seg(14, 6) });
    for (const sx of [-1, 1]) k.rod('frame', p.frame, [sx * 0.03, 0.44, wb / 2 - 0.1], [sx * 0.03, r, wb / 2], 0.012);
    k.rod('frame', 'metal-steel', [0, 0.42, wb / 2 - 0.1], [0, 0.6, wb / 2 - 0.14], 0.014);
    k.rod('frame', 'metal-steel', [-0.2, 0.6, wb / 2 - 0.14], [0.2, 0.6, wb / 2 - 0.14], 0.012);
    for (const sx of [-1, 1]) k.cyl('grips', 'plastic-white', 0.016, 0.016, 0.08, sx * 0.24, 0.6, wb / 2 - 0.14, { rz: PI / 2, segs: 8, ...C(p.color) });
    k.rbox('seat', 'leather-black', 0.13, 0.04, 0.2, 0.02, 0, 0.4, -0.08);
    return finish(k);
  },
});

const tricycle = mk({
  id: 'kids-tricycle', category: 'kids', ko: '세발자전거', en: 'Tricycle',
  params: [P.color('color', '프레임 색', 'Frame colour', PAL[0]), P.bool('pushBar', '보호자 손잡이', 'Parent push bar', true)],
  tags: ['tricycle', 'trike', 'three wheeler', 'toddler bike', '세발자전거', '유아 자전거', '트라이크', '아이 자전거'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const o = C(p.color), fr = 0.2, rr = 0.11, wb = 0.55;
    wheel(k, 0, fr, wb / 2, fr, { w: 0.04, hub: 'plastic-white' });
    for (const sx of [-1, 1]) wheel(k, sx * 0.24, rr, -wb / 2, rr, { w: 0.035, hub: 'plastic-white' });
    k.rod('axle', 'metal-steel', [-0.24, rr, -wb / 2], [0.24, rr, -wb / 2], 0.008);
    k.tube('frame', 'metal-white', [[0, rr + 0.03, -wb / 2], [0, 0.3, -0.1], [0, 0.42, wb / 2 - 0.12]], 0.022, { radial: k.seg(8, 5), segs: k.seg(12, 5), ...o });
    for (const sx of [-1, 1]) k.rod('frame', 'metal-white', [sx * 0.035, 0.45, wb / 2 - 0.08], [sx * 0.035, fr, wb / 2], 0.012, o);
    k.rod('frame', 'metal-white', [0, 0.42, wb / 2 - 0.1], [0, 0.6, wb / 2 - 0.16], 0.014, o);
    k.rod('frame', 'metal-steel', [-0.2, 0.6, wb / 2 - 0.16], [0.2, 0.6, wb / 2 - 0.16], 0.012);
    for (const sx of [-1, 1]) { k.cyl('grips', 'plastic-black', 0.016, 0.016, 0.08, sx * 0.24, 0.6, wb / 2 - 0.16, { rz: PI / 2, segs: 8 }); k.box('pedals', 'plastic-black', 0.05, 0.02, 0.08, sx * 0.1, fr - 0.08 * (sx > 0 ? 1 : -1), wb / 2, { r: 0.004 }); }
    k.rbox('seat', 'plastic-black', 0.18, 0.05, 0.16, 0.02, 0, 0.36, -0.12);
    k.rbox('seat', 'plastic-black', 0.18, 0.14, 0.03, 0.015, 0, 0.44, -0.2, { rx: -0.2 });
    k.rbox('basket', 'plastic-white', 0.3, 0.1, 0.16, 0.02, 0, rr + 0.12, -wb / 2 - 0.02, o);
    if (p.pushBar) k.bentTube('frame', 'metal-steel', [[0, 0.3, -wb / 2 + 0.02], [0, 0.95, -wb / 2 - 0.12], [0, 1.0, -wb / 2 - 0.15]], 0.012, 0.05);
    return finish(k);
  },
});

const scooter = mk({
  id: 'kids-kick-scooter', category: 'kids', ko: '어린이 킥보드(3바퀴)', en: 'Kids three-wheel kick scooter',
  params: [P.color('color', '색', 'Colour', PAL[2])],
  tags: ['kick scooter', 'scooter', 'three wheel scooter', 'kids scooter', '킥보드', '어린이 킥보드', '씽씽이', '스쿠터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const o = C(p.color), wr = 0.06;
    for (const sx of [-1, 1]) wheel(k, sx * 0.1, wr, 0.22, wr, { w: 0.03, tyre: 'plastic-white', hub: 'plastic-grey' });
    wheel(k, 0, 0.05, -0.32, 0.05, { w: 0.025, tyre: 'plastic-white', hub: 'plastic-grey' });
    k.rbox('deck', 'plastic-white', 0.13, 0.03, 0.5, 0.012, 0, 0.08, -0.06, o);
    k.box('deck', 'rubber-black', 0.11, 0.004, 0.42, 0, 0.097, -0.06, { r: 0 });
    k.rbox('deck', 'plastic-white', 0.26, 0.04, 0.06, 0.015, 0, wr, 0.22, o);
    k.rod('bar', 'metal-aluminium', [0, wr + 0.02, 0.22], [0, 0.75, 0.15], 0.014);
    k.rod('bar', 'metal-aluminium', [-0.16, 0.75, 0.15], [0.16, 0.75, 0.15], 0.012);
    for (const sx of [-1, 1]) k.cyl('grips', 'plastic-white', 0.017, 0.017, 0.08, sx * 0.2, 0.75, 0.15, { rz: PI / 2, segs: 8, ...o });
    k.box('deck', 'plastic-black', 0.06, 0.02, 0.06, 0, 0.11, -0.3, { r: 0.006, rx: 0.2 });
    return finish(k);
  },
});

const rideOnCar = mk({
  id: 'kids-ride-on-car', category: 'kids', ko: '붕붕카(유아 승용 자동차)', en: 'Toddler ride-on car',
  params: [P.color('color', '차체 색', 'Body colour', PAL[0])],
  tags: ['ride-on car', 'foot-to-floor', 'toddler car', 'push car', '붕붕카', '유아 자동차', '승용 완구', '아이 자동차'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const o = C(p.color);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(k, sx * 0.17, 0.07, sz * 0.2, 0.07, { w: 0.04, tyre: 'plastic-black', hub: 'plastic-white' });
    k.soft('body', 'plastic-white', 0.32, 0.16, 0.62, 0.06, 0, 0.16, 0, { puff: 0.01, ...o });
    k.soft('body', 'plastic-white', 0.3, 0.12, 0.18, 0.05, 0, 0.27, 0.16, { puff: 0.01, ...o });
    k.soft('body', 'plastic-white', 0.24, 0.16, 0.06, 0.025, 0, 0.32, -0.2, { puff: 0.006, ...o });
    k.rbox('seat', 'plastic-black', 0.22, 0.03, 0.2, 0.01, 0, 0.255, -0.08);
    k.cyl('wheel', 'plastic-black', 0.012, 0.012, 0.12, 0, 0.33, 0.1, { rx: -0.5, segs: 8 });
    k.add('wheel', 'plastic-black', T(torus(0.06, 0.01, 6, k.seg(16, 8)), 0, 0.43, 0.06, -0.5 - PI / 2, 0, 0));
    for (const sx of [-1, 1]) k.sphere('lights', 'plastic-white', 0.025, sx * 0.1, 0.22, 0.31, { segs: 10, rings: 6, ...C('#fff3c4') });
    k.box('trim', 'plastic-white', 0.32, 0.02, 0.62, 0, 0.085, 0, { r: 0.008, overrides: { color: '#ffffff' } });
    return finish(k);
  },
});

/* ------------------------------------------------------------ music */

const toyPiano = mk({
  id: 'kids-toy-piano', category: 'kids', ko: '어린이 장난감 피아노(그랜드형)', en: 'Kids toy grand piano',
  params: [P.color('color', '색', 'Colour', '#1b1b1f'), P.bool('stool', '의자', 'Stool', true)],
  tags: ['toy piano', 'kids piano', 'baby grand', 'musical toy', '장난감 피아노', '어린이 피아노', '악기 장난감', '그랜드 피아노'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const o = C(p.color), h = 0.48;
    const s = new THREE.Shape(); s.moveTo(-0.25, 0.12); s.lineTo(0.25, 0.12); s.lineTo(0.25, -0.05); s.quadraticCurveTo(0.24, -0.3, 0.05, -0.35); s.quadraticCurveTo(-0.2, -0.38, -0.25, -0.2); s.lineTo(-0.25, 0.12);
    k.slab('body', 'paint-black-matte', s, 0.12, h - 0.12, { bevel: 0.008, ...o });
    k.slab('body', 'paint-black-matte', s, 0.008, h + 0.06, { bevel: 0.002, ry: 0, ...o, x: 0 });
    for (const [x, z] of [[-0.21, 0.08], [0.21, 0.08], [0.0, -0.28]]) k.cyl('legs', 'paint-black-matte', 0.018, 0.015, h - 0.12, x, 0, z, { segs: 10, ...o });
    // keyboard: white keys + black keys
    const n = 15, kw = 0.46 / n;
    for (let i = 0; i < n; i++) k.box('keys', 'plastic-white', kw - 0.002, 0.015, 0.08, -0.23 + kw * (i + 0.5), h - 0.06, 0.15, { r: 0.001 });
    for (let i = 0; i < n - 1; i++) if (i % 7 !== 2 && i % 7 !== 6) k.box('blackKeys', 'plastic-black', kw * 0.55, 0.012, 0.045, -0.23 + kw * (i + 1), h - 0.045, 0.13, { r: 0.001 });
    k.box('body', 'paint-black-matte', 0.5, 0.03, 0.1, 0, h - 0.08, 0.15, { r: 0.004, ...o });
    if (p.stool) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'paint-black-matte', 0.012, 0.012, 0.26, sx * 0.12, 0, 0.42 + sz * 0.08, { segs: 8, ...o }); k.soft('stool', 'leather-black', 0.32, 0.04, 0.22, 0.012, 0, 0.28, 0.42, { puff: 0.004 }); }
    return finish(k);
  },
});

const drumKit = mk({
  id: 'kids-drum-set', category: 'kids', ko: '어린이 드럼 세트', en: 'Kids drum kit',
  params: [P.color('color', '쉘 색', 'Shell colour', PAL[2])],
  tags: ['drum kit', 'kids drums', 'junior drum set', 'musical instrument', '어린이 드럼', '드럼 세트', '악기', '타악기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const o = C(p.color);
    // bass drum lying on its side, two toms on top, floor tom, snare on a stand, cymbal, throne
    k.cyl('shells', 'paint-white-gloss', 0.2, 0.2, 0.25, 0, 0.2, 0.0, { rx: PI / 2, segs: k.seg(24, 10), ...o });
    k.cyl('heads', 'plastic-white', 0.19, 0.19, 0.004, 0, 0.2, 0.0, { rx: PI / 2, segs: k.seg(24, 10) });
    for (const sx of [-1, 1]) k.cyl('shells', 'paint-white-gloss', 0.09, 0.09, 0.1, sx * 0.11, 0.42, -0.1, { rx: 0.3, segs: k.seg(18, 8), ...o });
    k.cyl('shells', 'paint-white-gloss', 0.13, 0.13, 0.2, 0.33, 0.2, 0.12, { segs: k.seg(20, 8), ...o });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('stands', 'metal-chrome', [0.33 + Math.cos(a) * 0.12, 0, 0.12 + Math.sin(a) * 0.12], [0.33 + Math.cos(a) * 0.13, 0.22, 0.12 + Math.sin(a) * 0.13], 0.006, { segs: 5 }); }
    k.cyl('shells', 'paint-white-gloss', 0.12, 0.12, 0.1, -0.3, 0.42, 0.15, { segs: k.seg(20, 8), ...o });
    k.cyl('stands', 'metal-chrome', 0.008, 0.008, 0.42, -0.3, 0, 0.15, { segs: 6 });
    k.cyl('stands', 'metal-chrome', 0.008, 0.008, 0.85, -0.38, 0, -0.08, { segs: 6 });
    k.lathe('cymbal', 'metal-brass', [[0, 0.02], [0.03, 0.015], [0.18, 0], [0.18, -0.003], [0, 0.012]], -0.38, 0.85, -0.08, { segs: k.seg(24, 10) });
    k.cyl('throne', 'leather-black', 0.14, 0.14, 0.06, 0, 0.36, 0.48, { segs: k.seg(18, 8) });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('stands', 'metal-chrome', [Math.cos(a) * 0.15, 0, 0.48 + Math.sin(a) * 0.15], [0, 0.36, 0.48], 0.008, { segs: 5 }); }
    for (const sx of [-1, 1]) k.rod('sticks', 'wood-oak', [sx * 0.08 - 0.3, 0.475, 0.1], [sx * 0.04 - 0.3 + 0.12, 0.49, 0.32], 0.005, { segs: 5 });
    return finish(k);
  },
});

export const ITEMS = [
  tripleBunk, lBunk, midSleeper, princessBed, coSleeper,
  changingShelf, bouncer, babySwing, playGym, seatedWalker, pram, carSeat, potty, nappyBin, babyGate,
  learningTower, kidsVanity, artTable, kidsPicnic, sensoryTable,
  playCouch, softPlay, playShop, puppetTheatre, workbench, dressUp, slingShelf, cloudShelf,
  indoorSwing, miniTrampoline, climbingWall, seesaw, tunnel, hoop, goal,
  balanceBike, tricycle, scooter, rideOnCar, toyPiano, drumKit,
];
