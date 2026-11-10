// Even more bedroom designs: panel, button-tufted, pallet, mid-century, folding guest and adult
// loft beds, a fold-out chair bed; gentleman's chest, highboy, chest-on-chest, mirrored chest,
// Korean jangnong (mother-of-pearl wardrobe) and bandaji chest, fabric wardrobe, under-bed drawers,
// closet island, tri-fold dressing table, TV lift cabinet, over-bed table, trunk stack, garment
// steamer and small pieces (jewellery box, table-top vanity mirror, bed-rest pillow).
// Sizes are measured from the default build. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, T, clamp, pillowGeo, addCabinet, addHandle, ellipse, frameShape, transformAdded } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { clothGeo } from './bedroom.js';
import { splayLegs } from './dining.js';

const PI = Math.PI;
const WOOD = (def = 'wood-oak', ko = '나무', en = 'Wood', key = 'wood') => P.mat(key, ko, en, def, 'wood');

/* ------------------------------------------------------------ bedding */

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

/** Mattress + duvet folded back + pillows leaning at the head (head at −z). Returns the mattress top. */
function bedOn(k, p, { mw, ml, y, z = 0, h = 0.22, drop = 0.18, foot = true, lean = 0.5, x = 0 }) {
  k.soft('mattress', 'fabric-linen-white', mw - 0.01, h, ml - 0.01, Math.min(0.05, h * 0.3), x, y + h / 2, z, { puff: 0.008 });
  const mTop = y + h, zHead = z - ml / 2, zFoot = z + ml / 2;
  if (p.bedding) {
    const d = clamp(drop, 0.03, mTop - 0.03), covered = ml - 0.45;
    const duvet = clothGeo({ w: mw, l: covered, top: mTop - 0.012, drop: d, r: Math.min(0.06, d * 0.7), thick: 0.045, nu: k.seg(40, 12), nv: k.seg(36, 10), sides: { left: true, right: true, foot }, seed: mw * 5 });
    duvet.translate(x, 0, (foot ? zFoot - 0.005 : zFoot - 0.03) - covered / 2);
    k.add('bedding', p.beddingFabric, duvet);
  }
  const n = p.pillows;
  if (n > 0) {
    const pw = Math.min(0.68, (mw - 0.08) / n);
    for (let i = 0; i < n; i++) {
      const g = pillowGeo(pw - 0.03, 0.46, 0.15, k.seg(14, 6));
      T(g, 0, 0, 0, -PI / 2 + lean, 0, 0);
      g.translate(x - mw / 2 + 0.04 + pw * (i + 0.5) + (mw - 0.08 - pw * n) / 2, mTop + Math.sin(lean) * 0.15 + 0.04, zHead + 0.03 + Math.cos(lean) * 0.23);
      k.add('pillows', p.beddingFabric, g);
    }
  }
  return mTop;
}

/* --------------------------------------------------------------- beds */

const panelBed = mk({
  id: 'bedroom-bed-panel', category: 'bedroom', ko: '패널 원목 침대(발판 포함)', en: 'Wooden panel bed with footboard',
  params: [pSize('queen'), WOOD('wood-walnut'), ...BEDDING('fabric-linen-white', 2)],
  tags: ['panel bed', 'footboard', 'wooden bed', 'classic bed', '패널 침대', '원목 침대', '발판 침대', '퀸 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p), W = mw + 0.08, L = ml + 0.12;
    const board = (z, H, thick) => {
      for (const sx of [-1, 1]) k.box('frame', p.wood, 0.07, H, 0.07, sx * (W / 2 - 0.035), H / 2, z, { r: 0.006 });
      for (const sx of [-1, 1]) k.cyl('frame', p.wood, 0.03, 0.04, 0.03, sx * (W / 2 - 0.035), H, z, { segs: k.seg(12, 6) });
      k.box('frame', p.wood, W - 0.1, 0.06, thick + 0.01, 0, H - 0.05, z, { r: 0.006 });
      k.box('frame', p.wood, W - 0.1, 0.05, thick, 0, 0.3, z, { r: 0.004 });
      const n = Math.max(2, Math.round(W / 0.55)), pw = (W - 0.1) / n, ph = H - 0.42;
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + 0.05 + pw * (i + 0.5);
        k.panel('frame', p.wood, frameShape(pw - 0.01, ph, 0.045), thick, x, 0.325 + ph / 2, z);
        k.box('panels', p.wood, pw - 0.1, ph - 0.09, thick * 0.6, x, 0.325 + ph / 2, z, { r: 0.012, segs: 2 });
      }
    };
    board(-L / 2 + 0.035, 1.15, 0.03);
    board(L / 2 - 0.035, 0.62, 0.03);
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.03, 0.2, L - 0.14, sx * (W / 2 - 0.035), 0.3, 0, { r: 0.004 });
    bedOn(k, p, { mw, ml, y: 0.3, h: 0.24, drop: 0.16, foot: false });
    return finish(k);
  },
});

const tuftedBed = mk({
  id: 'bedroom-bed-button-tufted', category: 'bedroom', ko: '버튼 터프팅 헤드보드 침대', en: 'Button-tufted upholstered bed',
  params: [pSize('king'), P.mat('fabric', '천', 'Upholstery', 'fabric-velvet-blue', 'fabric'), P.mat('legs', '다리', 'Legs', 'metal-brass', 'metal'), ...BEDDING('fabric-cotton-white', 2)],
  tags: ['tufted bed', 'button tufted', 'upholstered bed', 'chesterfield bed', '터프팅 침대', '버튼 침대', '패브릭 침대', '호텔 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p), W = mw + 0.1, L = ml + 0.14, H = 1.35, hz = -L / 2 + 0.06;
    k.soft('frame', p.fabric, W, 0.24, L - 0.1, 0.04, 0, 0.1 + 0.12, 0.04, { puff: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', p.legs, 0.022, 0.016, 0.1, sx * (W / 2 - 0.08), 0, sz * (L / 2 - 0.12) + 0.04, { segs: k.seg(12, 6) });
    k.soft('headboard', p.fabric, W + 0.06, H - 0.1, 0.12, 0.05, 0, 0.1 + (H - 0.1) / 2, hz, { puff: 0.02, flat: 7 });
    // diamond button pattern on the front face
    const zb = hz + 0.06 + 0.012;
    const cols = Math.max(5, Math.round(W / 0.17)), rows = 4;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols - (r % 2); c++) {
      const x = -W / 2 + 0.12 + ((W - 0.24) / (cols - 1)) * (c + (r % 2) * 0.5), y = 0.62 + r * 0.16;
      k.sphere('buttons', p.fabric, 0.013, x, y, zb, { segs: k.seg(8, 5), rings: k.seg(6, 3), scale: [1, 1, 0.5] });
    }
    bedOn(k, p, { mw, ml, y: 0.32, h: 0.24, z: 0.04 + 0.01, drop: 0.2 });
    return finish(k);
  },
});

const palletBed = mk({
  id: 'bedroom-bed-pallet', category: 'bedroom', ko: '팔레트 침대(DIY)', en: 'Pallet bed',
  params: [pSize('queen'), WOOD('wood-pine', '팔레트', 'Pallets'), P.int('layers', '단 수', 'Layers', 2, 1, 3), ...BEDDING('fabric-linen-grey', 2)],
  tags: ['pallet bed', 'diy bed', 'rustic', 'low bed', '팔레트 침대', 'DIY 침대', '저상형 침대', '빈티지 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p);
    const pl = 1.2, pd = 0.8, ph = 0.144;
    const nx = Math.max(2, Math.ceil((mw + 0.1) / pd)), nz = Math.max(2, Math.ceil((ml + 0.1) / pl));
    const W = nx * pd, L = nz * pl;
    // one pallet = deck boards on three stringer blocks; laid with the long side along z
    const pallet = (x, y, z) => {
      for (const sx of [-1, 0, 1]) { k.box('pallets', p.wood, 0.1, 0.022, pl, x + sx * (pd / 2 - 0.05), y + 0.011, z, { r: 0.002 }); for (const sz of [-1, 0, 1]) k.box('pallets', p.wood, 0.1, 0.078, 0.14, x + sx * (pd / 2 - 0.05), y + 0.061, z + sz * (pl / 2 - 0.07), { r: 0.003 }); }
      for (let i = 0; i < 7; i++) k.box('pallets', p.wood, pd, 0.022, 0.1, x, y + ph - 0.033 + 0.011 + 0.0, z - pl / 2 + 0.05 + i * ((pl - 0.1) / 6), { r: 0.002 });
      for (const sx of [-1, 0, 1]) k.box('pallets', p.wood, 0.1, 0.022, pl, x + sx * (pd / 2 - 0.05), y + ph - 0.011 - 0.022 - 0.0, z, { r: 0.002 });
    };
    for (let l = 0; l < p.layers; l++) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) pallet(-W / 2 + pd * (i + 0.5), l * ph, -L / 2 + pl * (j + 0.5));
    bedOn(k, p, { mw, ml, y: p.layers * ph, h: 0.2, z: -L / 2 + ml / 2 + 0.05, drop: 0.12 });
    return finish(k);
  },
});

const midCentury = mk({
  id: 'bedroom-bed-mid-century', category: 'bedroom', ko: '미드센추리 침대(경사 다리)', en: 'Mid-century bed with splayed legs',
  params: [pSize('queen'), WOOD('wood-teak'), P.bool('shelves', '협탁 선반', 'Attached side shelves', true), ...BEDDING('fabric-mustard', 2)],
  tags: ['mid-century bed', 'retro bed', 'teak bed', 'splayed legs', '미드센추리 침대', '레트로 침대', '원목 침대', '티크'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p), W = mw + 0.06, L = ml + 0.06, fy = 0.22;
    k.box('frame', p.wood, W, 0.12, L, 0, fy + 0.06, 0.03, { r: 0.008, segs: 2 });
    splayLegs(k, 'frame', p.wood, W - 0.1, L - 0.1, fy, { inset: 0.06, r: 0.026, rFoot: 0.016, splay: 0.05 });
    // headboard: wide board floating on two posts, with horizontal grooves
    const hw = p.shelves ? W + 0.9 : W, hz = -L / 2 - 0.02;
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.05, 1.0, 0.05, sx * (W / 2 - 0.05), 0.5, hz, { r: 0.006 });
    for (let i = 0; i < 4; i++) k.box('frame', p.wood, hw, 0.095, 0.035, 0, 0.6 + i * 0.1, hz + 0.02, { r: 0.006 });
    if (p.shelves) for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.22);
      k.box('frame', p.wood, 0.42, 0.025, 0.38, x, 0.5, hz + 0.21, { r: 0.004 });
      k.box('frame', p.wood, 0.4, 0.12, 0.35, x, 0.425, hz + 0.21, { r: 0.004 });
      k.box('handles', 'metal-brass', 0.08, 0.012, 0.012, x, 0.43, hz + 0.39, { r: 0.003 });
    }
    bedOn(k, p, { mw, ml, y: fy + 0.08, h: 0.22, z: 0.03, drop: 0.2 });
    return finish(k);
  },
});

const guestBed = mk({
  id: 'bedroom-bed-folding-guest', category: 'bedroom', ko: '접이식 손님 침대(롤어웨이)', en: 'Folding guest bed (rollaway)',
  params: [P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'), P.mat('mattress', '매트리스', 'Mattress', 'fabric-linen-grey', 'fabric'), P.bool('folded', '접힘', 'Folded', false)],
  tags: ['folding bed', 'guest bed', 'rollaway', 'camp bed', '접이식 침대', '손님 침대', '간이 침대', '보조 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.8, L = 1.9, y = 0.36;
    if (p.folded) {
      // the two halves stand up, mattress folded in between, on four casters
      for (const sz of [-1, 1]) {
        k.bentTube('frame', p.frame, [[-W / 2, 0.08, sz * 0.2], [-W / 2, 0.95, sz * 0.2], [W / 2, 0.95, sz * 0.2], [W / 2, 0.08, sz * 0.2]], 0.014, 0.05);
        k.soft('mattress', p.mattress, W - 0.04, 0.85, 0.1, 0.04, 0, 0.53, sz * 0.1, { puff: 0.008 });
      }
      for (const sx of [-1, 1]) k.rod('frame', p.frame, [sx * W / 2, 0.08, -0.2], [sx * W / 2, 0.08, 0.2], 0.012);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.035, 0.035, 0.03, sx * W / 2, 0.035, sz * 0.2 - 0.015, { rx: PI / 2, segs: k.seg(14, 6) });
    } else {
      k.bentTube('frame', p.frame, [[-W / 2, y, -L / 2 + 0.05], [-W / 2, y, L / 2 - 0.05], [W / 2, y, L / 2 - 0.05], [W / 2, y, -L / 2 + 0.05], [-W / 2, y, -L / 2 + 0.05]], 0.014, 0.05);
      for (const sz of [-1, 0, 1]) for (const sx of [-1, 1]) k.rod('frame', p.frame, [sx * (W / 2 - 0.02), 0.05, sz * (L / 2 - 0.15)], [sx * W / 2, y, sz * (L / 2 - 0.15)], 0.012);
      for (const sz of [-1, 0, 1]) k.rod('frame', p.frame, [-W / 2 + 0.02, 0.06, sz * (L / 2 - 0.15)], [W / 2 - 0.02, 0.06, sz * (L / 2 - 0.15)], 0.01);
      for (let i = 0; i < 14; i++) k.box('frame', p.frame, W - 0.04, 0.006, 0.03, 0, y - 0.006, -L / 2 + 0.12 + i * ((L - 0.24) / 13), { r: 0 });
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.03, 0.03, 0.025, sx * (W / 2 - 0.02), 0.03, sz * (L / 2 - 0.15) - 0.012, { rx: PI / 2, segs: k.seg(14, 6) });
      k.soft('mattress', p.mattress, W - 0.04, 0.1, L - 0.08, 0.035, 0, y + 0.05, 0, { puff: 0.008 });
      const g = pillowGeo(0.55, 0.38, 0.12, k.seg(12, 5));
      T(g, 0, 0, 0, -PI / 2, 0, 0); g.translate(0, y + 0.16, -L / 2 + 0.26);
      k.add('pillow', 'fabric-cotton-white', g);
    }
    return finish(k);
  },
});

const adultLoft = mk({
  id: 'bedroom-bed-loft-sofa', category: 'bedroom', ko: '어른용 로프트 침대(아래 소파)', en: 'Adult loft bed with sofa underneath',
  params: [pSize('queen'), P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'), P.mat('fabric', '소파 천', 'Sofa fabric', 'fabric-linen-grey', 'fabric'), ...BEDDING('fabric-cotton-white', 2)],
  tags: ['loft bed', 'bunk', 'space saving', 'sofa underneath', 'studio', '로프트 침대', '이층 침대', '공간 절약', '원룸 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = mattOf(p), W = mw + 0.08, L = ml + 0.08, deck = 1.55, H = deck + 0.35;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.frame, 0.05, H, 0.05, sx * (L / 2 - 0.025), H / 2, sz * (W / 2 - 0.025), { r: 0.004 });
    for (const sz of [-1, 1]) k.box('frame', p.frame, L, 0.08, 0.04, 0, deck - 0.04, sz * (W / 2 - 0.02), { r: 0.003 });
    for (const sx of [-1, 1]) k.box('frame', p.frame, 0.04, 0.08, W, sx * (L / 2 - 0.02), deck - 0.04, 0, { r: 0.003 });
    // guard rail on three sides (open at the ladder end in front)
    k.box('frame', p.frame, L, 0.03, 0.03, 0, H - 0.015, -W / 2 + 0.015, { r: 0.003 });
    k.box('frame', p.frame, L * 0.55, 0.03, 0.03, -L * 0.225, H - 0.015, W / 2 - 0.015, { r: 0.003 });
    for (const sx of [-1, 1]) k.box('frame', p.frame, 0.03, 0.03, W, sx * (L / 2 - 0.015), H - 0.015, 0, { r: 0.003 });
    // ladder at the front right
    const lx = L / 2 - 0.3;
    for (const dx of [-0.2, 0.2]) k.box('frame', p.frame, 0.035, H, 0.035, lx + dx, H / 2, W / 2 + 0.03, { r: 0.004 });
    for (let i = 1; i <= 5; i++) k.rod('frame', 'metal-steel', [lx - 0.2, i * (deck / 6), W / 2 + 0.03], [lx + 0.2, i * (deck / 6), W / 2 + 0.03], 0.012);
    // the bed sits with its length along x (rotate by building along z then turning)
    transformAdded(k, () => bedOn(k, p, { mw, ml, y: deck, h: 0.18, drop: 0.06, foot: false }), 0, 0, 0, -PI / 2);
    // sofa underneath against the back
    const sw = Math.min(1.9, L - 0.2);
    k.soft('sofa', p.fabric, sw, 0.42, 0.85, 0.05, 0, 0.21, -W / 2 + 0.47, { puff: 0.01 });
    k.soft('sofa', p.fabric, sw, 0.45, 0.2, 0.06, 0, 0.6, -W / 2 + 0.14, { puff: 0.012, rx: -0.12 });
    for (const sx of [-1, 1]) k.soft('sofa', p.fabric, 0.16, 0.6, 0.85, 0.05, sx * (sw / 2 - 0.08), 0.3, -W / 2 + 0.47, { puff: 0.008 });
    return finish(k);
  },
});

const chairBed = mk({
  id: 'bedroom-chair-bed', category: 'bedroom', ko: '펼치는 의자 침대', en: 'Fold-out chair bed',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-navy', 'fabric'), P.bool('open', '펼침', 'Unfolded', false)],
  tags: ['chair bed', 'fold-out', 'sleeper chair', 'guest bed', 'futon chair', '의자 침대', '소파 베드', '1인 소파베드', '손님 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.8;
    if (p.open) {
      // three foam sections laid flat in a row + the back pad as the head
      for (let i = 0; i < 3; i++) k.soft('fabric', p.fabric, w - 0.08, 0.16, 0.62, 0.04, 0, 0.08, -0.62 + i * 0.63, { puff: 0.008 });
      k.soft('fabric', p.fabric, w - 0.08, 0.2, 0.25, 0.05, 0, 0.1, -1.08, { puff: 0.01 });
      for (const sx of [-1, 1]) k.soft('fabric', p.fabric, 0.06, 0.3, 0.75, 0.025, sx * (w / 2 - 0.03), 0.15, -0.72, { puff: 0.004 });
    } else {
      for (const sx of [-1, 1]) k.soft('fabric', p.fabric, 0.12, 0.6, 0.85, 0.04, sx * (w / 2 - 0.06), 0.3, 0, { puff: 0.008 });
      k.soft('fabric', p.fabric, w - 0.24, 0.32, 0.78, 0.04, 0, 0.16, 0.02, { puff: 0.008 });
      k.soft('fabric', p.fabric, w - 0.24, 0.12, 0.7, 0.04, 0, 0.38, 0.06, { puff: 0.012 });
      k.soft('fabric', p.fabric, w - 0.24, 0.52, 0.18, 0.05, 0, 0.62, -0.31, { puff: 0.012, rx: -0.15 });
    }
    k.box('base', 'plastic-black', w - 0.02, 0.02, p.open ? 0.3 : 0.8, 0, 0.01, 0, { r: 0.003 });
    return finish(k);
  },
});

/* ------------------------------------------------------------- chests */

const gentlemans = mk({
  id: 'bedroom-chest-gentlemans', category: 'bedroom', ko: '젠틀맨 체스트(상부 도어+서랍)', en: "Gentleman's chest",
  params: [WOOD('wood-walnut', '본체', 'Body'), P.pick('handle', '손잡이', 'Handles', 'knob', [['knob', '노브', 'Knob'], ['bar', '바', 'Bar'], ['cup', '컵', 'Cup']])],
  tags: ["gentleman's chest", 'chest', 'armoire', 'dresser', '젠틀맨 체스트', '서랍장', '수납장', '옷장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    addCabinet(k, { w: 0.95, h: 1.45, d: 0.5, rows: [{ h: 0.18, n: 1, type: 'drawer' }, { h: 0.18, n: 1, type: 'drawer' }, { h: 0.16, n: 2, type: 'drawer' }, { h: 0.48, n: 2, type: 'door' }], body: p.wood, front: p.wood, handle: p.handle, handleMat: 'metal-brass', base: 'legs', legH: 0.12, legStyle: 'square', legMat: p.wood, top: p.wood, topThick: 0.03, topOverhang: 0.015 });
    k.box('top', p.wood, 0.99, 0.04, 0.52, 0, 1.47, 0, { r: 0.006 });
    return finish(k);
  },
});

const highboy = mk({
  id: 'bedroom-highboy', category: 'bedroom', ko: '하이보이(카브리올 다리 높은 서랍장)', en: 'Highboy on cabriole legs',
  params: [WOOD('wood-dark', '본체', 'Body')],
  tags: ['highboy', 'tallboy', 'queen anne', 'cabriole legs', 'antique', '하이보이', '높은 서랍장', '앤티크 서랍장', '클래식 서랍장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.95, d = 0.5, legH = 0.32;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.05), z = sz * (d / 2 - 0.05);
      k.tube('legs', p.wood, [[x, legH, z], [x + sx * 0.025, legH * 0.7, z + sz * 0.025], [x - sx * 0.01, legH * 0.25, z - sz * 0.01], [x + sx * 0.015, 0.03, z + sz * 0.015]], 0.022, { radial: k.seg(8, 5), segs: k.seg(12, 5) });
      k.sphere('legs', p.wood, 0.026, x + sx * 0.015, 0.024, z + sz * 0.015, { scale: [1, 0.9, 1], segs: k.seg(10, 6), rings: k.seg(6, 4) });
    }
    // apron with a scalloped skirt
    const apron = new THREE.Shape();
    apron.moveTo(-w / 2, 0); apron.lineTo(-w / 2 + 0.1, 0); apron.quadraticCurveTo(-w * 0.25, 0.1, -0.08, 0.05); apron.quadraticCurveTo(0, -0.03, 0.08, 0.05); apron.quadraticCurveTo(w * 0.25, 0.1, w / 2 - 0.1, 0); apron.lineTo(w / 2, 0); apron.lineTo(w / 2, 0.16); apron.lineTo(-w / 2, 0.16); apron.lineTo(-w / 2, 0);
    k.panel('body', p.wood, apron, 0.02, 0, legH - 0.03, d / 2 - 0.02);
    addCabinet(k, { w, h: 1.4, d, y0: legH + 0.13, rows: [{ h: 0.26, n: 1, type: 'drawer' }, { h: 0.24, n: 1, type: 'drawer' }, { h: 0.22, n: 1, type: 'drawer' }, { h: 0.2, n: 2, type: 'drawer' }, { h: 0.08, n: 3, type: 'drawer' }], body: p.wood, front: p.wood, handle: 'bar', handleMat: 'metal-brass', base: 'none' });
    k.box('body', p.wood, w - 0.02, 0.13, d - 0.04, 0, legH + 0.065, -0.02, { r: 0.003 });
    // stepped cornice
    k.box('body', p.wood, w + 0.04, 0.03, d + 0.02, 0, legH + 1.545, 0.01, { r: 0.004 });
    k.box('body', p.wood, w + 0.08, 0.04, d + 0.04, 0, legH + 1.58, 0.02, { r: 0.006 });
    return finish(k);
  },
});

const chestOnChest = mk({
  id: 'bedroom-chest-on-chest', category: 'bedroom', ko: '체스트 온 체스트(2단 서랍장)', en: 'Chest-on-chest',
  params: [WOOD('wood-oak', '본체', 'Body'), P.pick('handle', '손잡이', 'Handles', 'bar', [['bar', '바', 'Bar'], ['knob', '노브', 'Knob'], ['cup', '컵', 'Cup']])],
  tags: ['chest on chest', 'tall chest', 'two-piece', 'dresser', '체스트 온 체스트', '높은 서랍장', '2단 서랍장', '서랍장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 1.0, d = 0.52;
    addCabinet(k, { w, h: 0.85, d, rows: [{ h: 0.36, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }, { h: 0.31, n: 1, type: 'drawer' }], body: p.wood, front: p.wood, handle: p.handle, handleMat: 'metal-brass', base: 'plinth', plinth: 0.1, top: p.wood, topThick: 0.025, topOverhang: 0.02 });
    transformAdded(k, (kk) => {
      addCabinet(kk, { w: w - 0.08, h: 0.78, d: d - 0.06, rows: [{ h: 0.36, n: 1, type: 'drawer' }, { h: 0.34, n: 1, type: 'drawer' }, { h: 0.3, n: 2, type: 'drawer' }], body: p.wood, front: p.wood, handle: p.handle, handleMat: 'metal-brass', base: 'none' });
      kk.box('body', p.wood, w - 0.02, 0.04, d - 0.02, 0, 0.8, 0.01, { r: 0.006 });
    }, 0, 0.875, -0.03);
    for (const sx of [-1, 1]) k.box('handles', 'metal-brass', 0.02, 0.05, 0.14, sx * (w / 2 + 0.01), 0.5, 0, { r: 0.004 });
    return finish(k);
  },
});

const mirroredChest = mk({
  id: 'bedroom-chest-mirrored', category: 'bedroom', ko: '미러 서랍장(거울 마감)', en: 'Mirrored chest of drawers',
  params: [P.int('drawers', '서랍 수', 'Drawers', 3, 2, 5), P.mat('trim', '테두리', 'Trim', 'metal-gold', 'metal')],
  tags: ['mirrored chest', 'mirrored dresser', 'glam', 'hollywood regency', '미러 서랍장', '거울 서랍장', '글램', '서랍장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.9, h = 0.8, d = 0.45, n = p.drawers;
    k.box('body', 'wood-white', w - 0.01, h - 0.08, d - 0.02, 0, 0.08 + (h - 0.08) / 2, -0.01, { r: 0.002 });
    for (const sx of [-1, 1]) k.box('mirror', 'mirror', 0.006, h - 0.08, d - 0.02, sx * (w / 2 - 0.003), 0.08 + (h - 0.08) / 2, -0.01, { r: 0 });
    k.box('mirror', 'mirror', w, 0.008, d, 0, h - 0.004, 0, { r: 0 });
    for (let i = 0; i < n; i++) {
      const fh = (h - 0.1) / n, y = 0.09 + fh * (i + 0.5);
      k.box('mirror', 'mirror', w - 0.02, fh - 0.006, 0.008, 0, y, d / 2 - 0.006, { r: 0 });
      k.box('trim', p.trim, w - 0.02, 0.004, 0.01, 0, y - fh / 2 + 0.002, d / 2 - 0.004, { r: 0 });
      k.lathe('handles', p.trim, [[0, 0], [0.008, 0], [0.006, 0.01], [0.016, 0.025], [0, 0.03]], 0, y, d / 2, { rx: PI / 2, segs: k.seg(12, 6) });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('trim', p.trim, 0.018, 0.012, 0.08, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), { segs: k.seg(10, 6) });
    return finish(k);
  },
});

/* ---------------------------------------------------------- wardrobes */

const fabricWardrobe = mk({
  id: 'bedroom-wardrobe-fabric', category: 'bedroom', ko: '천 옷장(조립식 캔버스)', en: 'Fabric wardrobe',
  params: [P.len('width', '폭', 'Width', 1.1, 0.8, 1.6), P.mat('fabric', '천', 'Fabric', 'fabric-cotton-grey', 'fabric'), P.bool('open', '앞 지퍼 열림', 'Front rolled up', true)],
  tags: ['fabric wardrobe', 'canvas wardrobe', 'portable closet', 'student', '천 옷장', '조립식 옷장', '간이 옷장', '자취'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 1.72, d = 0.45, t = 0.012;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('frame', 'metal-white', 0.0095, 0.0095, h, sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02), { segs: k.seg(8, 5) });
    // fabric skin: back, sides, top; the front can be rolled up and tied
    k.box('fabric', p.fabric, w, h - 0.05, t, 0, 0.05 + (h - 0.05) / 2, -d / 2, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('fabric', p.fabric, t, h - 0.05, d, sx * w / 2, 0.05 + (h - 0.05) / 2, 0, { r: 0.004 });
    k.soft('fabric', p.fabric, w + 0.02, 0.03, d + 0.02, 0.012, 0, h, 0, { puff: 0.003 });
    if (p.open) {
      for (const sx of [-1, 1]) k.box('fabric', p.fabric, w * 0.18, h - 0.05, t, sx * (w / 2 - w * 0.09), 0.05 + (h - 0.05) / 2, d / 2, { r: 0.004 });
      k.cyl('fabric', p.fabric, 0.05, 0.05, w * 0.64, -w * 0.32, h - 0.1, d / 2 + 0.03, { rz: -PI / 2, segs: k.seg(14, 6) });
      // rail with clothes + shelf unit on the right
      k.rod('frame', 'metal-white', [-w / 2 + 0.02, h - 0.2, 0], [w / 2 - 0.02, h - 0.2, 0], 0.01);
      for (let i = 0; i < 6; i++) k.box('clothes', ['fabric-navy', 'fabric-linen-white', 'fabric-terracotta'][i % 3], 0.012, 0.75 - (i % 2) * 0.15, d - 0.1, -w / 2 + 0.12 + i * 0.07, h - 0.6 - (0.75 - (i % 2) * 0.15) / 2 + 0.375, 0, { r: 0.004 });
      for (const y of [0.3, 0.6, 0.9]) k.box('fabric', p.fabric, w * 0.35, 0.02, d - 0.04, w / 2 - w * 0.19, y, 0, { r: 0.004 });
      k.box('fabric', p.fabric, 0.01, 0.95, d - 0.04, w / 2 - w * 0.37, 0.5, 0, { r: 0.003 });
    } else {
      k.box('fabric', p.fabric, w, h - 0.05, t, 0, 0.05 + (h - 0.05) / 2, d / 2, { r: 0.004 });
      k.rod('zip', 'metal-steel', [0, 0.12, d / 2 + 0.008], [0, h - 0.06, d / 2 + 0.008], 0.003, { segs: 4 });
    }
    return finish(k);
  },
});

const jangnong = mk({
  id: 'bedroom-jangnong', category: 'bedroom', ko: '자개장(전통 장롱)', en: 'Korean mother-of-pearl wardrobe (jagaejang)',
  params: [P.len('width', '폭', 'Width', 1.8, 1.2, 2.4), P.mat('lacquer', '옻칠', 'Lacquer', 'paint-black-matte', 'paint'), P.mat('inlay', '자개', 'Inlay', 'metal-white', 'metal')],
  tags: ['jagaejang', 'korean wardrobe', 'mother of pearl', 'lacquer', 'traditional', '자개장', '장롱', '전통 가구', '자개 장롱', '옻칠'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 1.9, d = 0.6, n = Math.max(2, Math.round(w / 0.45));
    k.box('body', p.lacquer, w, h - 0.1, d - 0.02, 0, 0.1 + (h - 0.1) / 2, -0.01, { r: 0.004 });
    k.box('body', p.lacquer, w + 0.04, 0.05, d + 0.02, 0, h + 0.025 - 0.0, 0, { r: 0.006 });
    // short legs with a bracketed base rail
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('body', p.lacquer, 0.07, 0.1, 0.07, sx * (w / 2 - 0.04), 0.05, sz * (d / 2 - 0.05), { r: 0.006 });
    const fw = w / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + fw * (i + 0.5);
      // tall door with a framed inlay panel, then a drawer under it
      k.panel('body', p.lacquer, frameShape(fw - 0.008, 1.35, 0.04), 0.022, x, 0.43 + 0.675, d / 2 + 0.002);
      k.box('inlay', p.inlay, fw - 0.12, 1.2, 0.004, x, 0.43 + 0.675, d / 2 - 0.004, { r: 0 });
      k.box('body', p.lacquer, fw - 0.008, 0.28, 0.022, x, 0.28, d / 2 + 0.002, { r: 0.003 });
      k.box('inlay', p.inlay, fw - 0.12, 0.16, 0.004, x, 0.28, d / 2 + 0.014, { r: 0 });
      // butterfly-shaped brass hinge plates + round pull
      k.cyl('hardware', 'metal-brass', 0.04, 0.04, 0.004, x, 0.28, d / 2 + 0.014, { rx: PI / 2, segs: k.seg(16, 6) });
      k.add('hardware', 'metal-brass', T(new THREE.TorusGeometry(0.022, 0.004, k.seg(6, 3), k.seg(14, 6), PI), x, 0.26, d / 2 + 0.022, 0, 0, PI));
      const hx = i % 2 === 0 ? x + fw / 2 - 0.05 : x - fw / 2 + 0.05;
      k.box('hardware', 'metal-brass', 0.05, 0.08, 0.004, hx, 1.0, d / 2 + 0.014, { r: 0 });
    }
    return finish(k);
  },
});

const bandaji = mk({
  id: 'bedroom-bandaji', category: 'bedroom', ko: '반닫이(전통 함)', en: 'Korean bandaji chest',
  params: [WOOD('wood-dark', '나무', 'Wood'), P.mat('hardware', '장석', 'Hardware', 'metal-black', 'metal'), P.len('width', '폭', 'Width', 0.9, 0.7, 1.2)],
  tags: ['bandaji', 'korean chest', 'blanket chest', 'traditional', '반닫이', '전통 함', '이불함', '장석', '전통 가구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.72, d = 0.42;
    k.box('body', p.wood, w, h - 0.08, d, 0, 0.08 + (h - 0.08) / 2, 0, { r: 0.004 });
    k.box('body', p.wood, w + 0.03, 0.03, d + 0.02, 0, h - 0.015, 0, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('body', p.wood, 0.08, 0.08, d, sx * (w / 2 - 0.04), 0.04, 0, { r: 0.004 });
    k.box('body', p.wood, w - 0.16, 0.05, 0.03, 0, 0.055, d / 2 - 0.015, { r: 0.003 });
    // upper half of the front hinges down: the flap with heavy iron fittings
    const zf = d / 2 + 0.006;
    k.box('body', p.wood, w - 0.08, (h - 0.1) / 2, 0.016, 0, 0.08 + (h - 0.08) * 0.73, zf, { r: 0.003 });
    for (const sx of [-1, 1]) {
      k.box('hardware', p.hardware, 0.1, 0.03, 0.004, sx * (w / 2 - 0.12), 0.08 + (h - 0.08) * 0.5 + 0.02, zf + 0.009, { r: 0 });
      k.box('hardware', p.hardware, 0.03, 0.1, 0.004, sx * (w / 2 - 0.12), 0.08 + (h - 0.08) * 0.5 - 0.03, zf + 0.002, { r: 0 });
      for (const y of [0.12, h - 0.06]) k.box('hardware', p.hardware, 0.06, 0.06, 0.004, sx * (w / 2 - 0.03), y, zf - 0.003, { r: 0 });
    }
    k.cyl('hardware', p.hardware, 0.07, 0.07, 0.004, 0, 0.08 + (h - 0.08) * 0.68, zf + 0.008, { rx: PI / 2, segs: k.seg(18, 8) });
    k.box('hardware', p.hardware, 0.03, 0.08, 0.012, 0, 0.08 + (h - 0.08) * 0.52, zf + 0.008, { r: 0.002 });
    for (const sx of [-1, 1]) k.add('hardware', p.hardware, T(new THREE.TorusGeometry(0.035, 0.005, k.seg(6, 3), k.seg(14, 6), PI), sx * (w / 2 + 0.004), h - 0.15, 0, 0, PI / 2, PI));
    return finish(k);
  },
});

const underBed = mk({
  id: 'bedroom-underbed-drawers', category: 'bedroom', ko: '침대 밑 수납 서랍(바퀴)', en: 'Under-bed storage drawers',
  params: [P.int('count', '서랍 수', 'Drawers', 2, 1, 3), WOOD('wood-white', '서랍', 'Drawers')],
  tags: ['under bed storage', 'rolling drawer', 'storage box', '침대 밑 수납', '침대 서랍', '수납함', '바퀴 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.7, h = 0.17, d = 0.9;
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * (w + 0.04);
      k.box('drawer', p.wood, w, h - 0.02, d, x, 0.02 + (h - 0.02) / 2, 0, { r: 0.004 });
      k.box('drawer', p.wood, w - 0.03, 0.01, d - 0.03, x, h + 0.0, 0, { r: 0 });
      addHandle(k, 'handles', 'metal-steel', 'cup', x, 0.12, d / 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.018, 0.018, 0.015, x + sx * (w / 2 - 0.05), 0.018, sz * (d / 2 - 0.06) - 0.0075, { rx: PI / 2, segs: k.seg(10, 6) });
    }
    return finish(k);
  },
});

const closetIsland = mk({
  id: 'bedroom-closet-island', category: 'bedroom', ko: '드레스룸 아일랜드장(유리 상판)', en: 'Closet island with glass top',
  params: [P.len('length', '길이', 'Length', 1.2, 0.8, 1.8), WOOD('wood-white', '본체', 'Body'), P.bool('items', '진열품', 'Accessories', true)],
  tags: ['closet island', 'dressing room', 'walk-in closet', 'jewellery display', '드레스룸', '아일랜드장', '드레스룸 수납', '유리 상판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = 0.6, h = 0.9;
    for (const s of [-1, 1]) transformAdded(k, (kk) => addCabinet(kk, { w: L, h: h - 0.12, d: d / 2, rows: [{ h: 0.4, n: 2, type: 'drawer' }, { h: 0.3, n: 2, type: 'drawer' }, { h: 0.3, n: 2, type: 'drawer' }], body: p.wood, front: p.wood, handle: 'edge', handleMat: 'metal-gold', base: 'plinth', plinth: 0.06 }), 0, 0, s * d / 4, s > 0 ? 0 : PI);
    // shallow glass-topped display tray on top
    k.box('body', p.wood, L + 0.02, 0.1, d + 0.02, 0, h - 0.07, 0, { r: 0.003 });
    k.box('felt', 'fabric-velvet-blue', L - 0.06, 0.005, d - 0.06, 0, h - 0.07, 0, { r: 0 });
    k.box('glass', 'glass-clear', L + 0.02, 0.01, d + 0.02, 0, h - 0.015, 0, { r: 0 });
    if (p.items) for (let i = 0; i < 5; i++) k.add('watches', 'metal-gold', T(new THREE.TorusGeometry(0.03, 0.006, k.seg(6, 3), k.seg(14, 6)), -L / 2 + 0.15 + i * ((L - 0.3) / 4), h - 0.06, -0.1 + (i % 2) * 0.2, PI / 2, 0, 0));
    return finish(k);
  },
});

/* ---------------------------------------------------------- dressing */

const trifold = mk({
  id: 'bedroom-vanity-trifold', category: 'bedroom', ko: '삼면경 화장대(의자 포함)', en: 'Dressing table with tri-fold mirror',
  params: [WOOD('wood-white', '본체', 'Body'), P.mat('stool', '스툴 천', 'Stool fabric', 'fabric-velvet-rose', 'fabric'), P.bool('stoolOn', '스툴', 'Stool', true)],
  tags: ['dressing table', 'vanity', 'tri-fold mirror', 'makeup table', '화장대', '삼면경', '삼면 거울 화장대', '메이크업 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 1.0, d = 0.42, h = 0.75;
    k.box('top', p.wood, w, 0.025, d, 0, h - 0.0125, 0, { r: 0.004 });
    k.box('body', p.wood, w - 0.02, 0.12, d - 0.02, 0, h - 0.085, 0, { r: 0.003 });
    for (const sx of [-1, 0, 1]) { const x = sx * (w / 3); k.box('fronts', p.wood, w / 3 - 0.008, 0.1, 0.018, x, h - 0.085, d / 2 - 0.004, { r: 0.002 }); addHandle(k, 'handles', 'metal-gold', 'knob', x, h - 0.085, d / 2 + 0.005); }
    splayLegs(k, 'legs', p.wood, w - 0.04, d - 0.04, h - 0.145, { inset: 0.04, r: 0.02, rFoot: 0.013, splay: 0.02 });
    // tri-fold mirror: centre panel + two wings angled forward
    const mh = 0.62, cw = 0.48, ww = 0.24, y = h + 0.05 + mh / 2, zb = -d / 2 + 0.06;
    k.panel('frame', p.wood, frameShape(cw, mh, 0.025), 0.022, 0, y, zb);
    k.box('mirror', 'mirror', cw - 0.04, mh - 0.04, 0.004, 0, y, zb + 0.006, { r: 0 });
    for (const sx of [-1, 1]) {
      const a = sx * -0.6, cx = sx * (cw / 2 + Math.cos(0.6) * ww / 2), cz = zb + Math.sin(0.6) * ww / 2;
      k.panel('frame', p.wood, frameShape(ww, mh - 0.06, 0.02), 0.02, cx, y - 0.03, cz, { ry: a });
      k.box('mirror', 'mirror', ww - 0.03, mh - 0.09, 0.004, cx + Math.sin(-a) * -0.006, y - 0.03, cz + Math.cos(a) * 0.006, { r: 0, ry: a });
    }
    k.box('frame', p.wood, 0.12, 0.05, 0.08, 0, h + 0.025, zb, { r: 0.004 });
    if (p.stoolOn) {
      const sz = d / 2 + 0.12;
      for (const sx of [-1, 1]) for (const s2 of [-1, 1]) k.cyl('legs', p.wood, 0.014, 0.011, 0.4, sx * 0.14, 0, sz + s2 * 0.1, { segs: k.seg(10, 5) });
      k.soft('stool', p.stool, 0.42, 0.08, 0.32, 0.03, 0, 0.44, sz, { puff: 0.01 });
    }
    return finish(k);
  },
});

const tvLift = mk({
  id: 'bedroom-tv-lift-cabinet', category: 'bedroom', ko: '침대 끝 TV 리프트 장', en: 'End-of-bed TV lift cabinet',
  params: [P.len('width', '폭', 'Width', 1.4, 1.1, 1.8), WOOD('wood-walnut', '본체', 'Body'), P.bool('raised', 'TV 올림', 'TV raised', true)],
  tags: ['tv lift', 'motorised', 'end of bed', 'hidden tv', 'tv cabinet', 'TV 리프트', '전동 TV장', '침대 끝 수납', '숨김 TV'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.75, d = 0.45;
    k.box('body', p.wood, w, h - 0.06, d, 0, 0.06 + (h - 0.06) / 2, 0, { r: 0.005 });
    k.box('body', 'paint-black-matte', w - 0.06, 0.06, d - 0.06, 0, 0.03, 0, { r: 0.002 });
    // fluted front
    const n = Math.round(w / 0.04);
    for (let i = 0; i < n; i++) k.cyl('body', p.wood, 0.012, 0.012, h - 0.12, -w / 2 + 0.03 + i * ((w - 0.06) / (n - 1)), 0.09, d / 2, { segs: k.seg(8, 4), open: true });
    // lid split, TV rising out of the slot
    k.box('top', p.wood, w + 0.01, 0.025, d + 0.01, 0, h + 0.0125, 0, { r: 0.004 });
    if (p.raised) {
      const tw = Math.min(1.22, w - 0.1), th = tw * 0.58;
      k.box('tv', 'plastic-black', tw, th, 0.04, 0, h + 0.1 + th / 2, -0.02, { r: 0.004 });
      k.box('screen', 'screen-black', tw - 0.02, th - 0.02, 0.004, 0, h + 0.1 + th / 2, 0.0, { r: 0 });
      k.box('tv', 'metal-aluminium', 0.3, 0.12, 0.05, 0, h + 0.06, -0.02, { r: 0.004 });
    }
    return finish(k);
  },
});

const overBed = mk({
  id: 'bedroom-overbed-table', category: 'bedroom', ko: '침대 사이드 C형 테이블(높이조절)', en: 'Over-bed table on casters',
  params: [P.len('height', '높이', 'Height', 0.85, 0.7, 1.05), WOOD('wood-oak', '상판', 'Top'), P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal')],
  tags: ['over-bed table', 'bedside table', 'laptop table', 'adjustable', 'c table', '침대 테이블', '사이드 테이블', '노트북 테이블', '높이조절'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, L = 0.8, d = 0.4;
    k.box('top', p.wood, L, 0.022, d, 0, h - 0.011, 0, { r: 0.006 });
    const px = -L / 2 + 0.06;
    k.box('frame', p.frame, 0.05, h - 0.1, 0.035, px, 0.07 + (h - 0.1) / 2, 0, { r: 0.004 });
    k.box('frame', p.frame, 0.04, 0.03, d * 0.8, px + 0.02, h - 0.04, 0, { r: 0.003 });
    // H base on casters (open towards +x so it slides under the bed)
    k.box('frame', p.frame, 0.05, 0.04, 0.55, px, 0.06, 0, { r: 0.004 });
    for (const sz of [-1, 1]) {
      k.box('frame', p.frame, 0.6, 0.035, 0.04, px + 0.28, 0.06, sz * 0.26, { r: 0.004 });
      for (const x of [px - 0.01, px + 0.56]) k.sphere('wheels', 'rubber-black', 0.025, x, 0.025, sz * 0.26, { segs: k.seg(10, 6), rings: k.seg(6, 4) });
    }
    return finish(k);
  },
});

const trunks = mk({
  id: 'bedroom-trunk-stack', category: 'bedroom', ko: '빈티지 트렁크 협탁(2단)', en: 'Stacked vintage trunks bedside table',
  params: [P.mat('leather', '가죽', 'Leather', 'leather-brown', 'leather'), P.mat('top', '위 트렁크', 'Top trunk', 'leather-cognac', 'leather'), P.mat('hardware', '금속', 'Hardware', 'metal-brass', 'metal')],
  tags: ['vintage trunk', 'suitcase stack', 'bedside table', 'nightstand', '트렁크', '빈티지 협탁', '여행 가방', '침대 협탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const trunk = (w, h, d, y, mat, ry) => transformAdded(k, (kk) => {
      kk.soft('trunk', mat, w, h, d, 0.02, 0, h / 2, 0, { flat: 2 });
      for (const sx of [-1, 1]) kk.box('straps', 'leather-black', 0.035, h + 0.006, d + 0.006, sx * w * 0.28, h / 2, 0, { r: 0.004 });
      kk.box('straps', 'leather-black', w + 0.004, 0.012, d + 0.004, 0, h * 0.62, 0, { r: 0.003 });
      for (const sx of [-1, 1]) kk.box('hardware', p.hardware, 0.035, 0.035, 0.012, sx * w * 0.28, h * 0.62, d / 2 + 0.006, { r: 0.003 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kk.box('hardware', p.hardware, 0.03, h + 0.004, 0.03, sx * (w / 2 - 0.01), h / 2, sz * (d / 2 - 0.01), { r: 0.004 });
      kk.add('hardware', p.hardware, T(new THREE.TorusGeometry(0.04, 0.007, kk.seg(6, 3), kk.seg(12, 6), PI), 0, h + 0.002, 0, 0, 0, 0));
    }, 0, y, 0, ry);
    trunk(0.62, 0.3, 0.4, 0, p.leather, 0);
    trunk(0.54, 0.24, 0.36, 0.3, p.top, 0.08);
    return finish(k);
  },
});

const steamer = mk({
  id: 'bedroom-garment-steamer', category: 'bedroom', ko: '스탠드형 스팀다리미(의류 스티머)', en: 'Upright garment steamer',
  params: [P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'), P.bool('shirt', '셔츠', 'Shirt on hanger', true)],
  tags: ['garment steamer', 'clothes steamer', 'steam iron', '스팀다리미', '의류 스티머', '스탠드 스티머', '다림질'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('body', p.body, 0.3, 0.32, 0.26, 0.05, 0, 0.16, 0);
    k.cyl('tank', 'glass-frosted', 0.09, 0.09, 0.22, 0.0, 0.32, -0.02, { segs: k.seg(18, 8) });
    for (const sx of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.035, 0.035, 0.02, sx * 0.13, 0.035, -0.1, { rz: PI / 2, segs: k.seg(12, 6) });
    k.cyl('pole', 'metal-chrome', 0.012, 0.012, 1.25, 0.08, 0.3, 0.06, { segs: k.seg(10, 5) });
    k.bentTube('pole', 'metal-chrome', [[0.08, 1.55, 0.06], [0.08, 1.6, 0.06], [-0.15, 1.6, 0.06], [-0.15, 1.5, 0.06]], 0.008, 0.03);
    k.bentTube('hose', 'plastic-black', [[0.05, 0.3, 0.1], [0.15, 0.45, 0.16], [0.2, 0.9, 0.14], [0.16, 1.22, 0.1]], 0.012, 0.15);
    k.rbox('body', p.body, 0.07, 0.16, 0.06, 0.02, 0.16, 1.3, 0.1);
    if (p.shirt) {
      k.add('hanger', 'wood-oak', T(new THREE.TorusGeometry(0.2, 0.006, 4, k.seg(12, 6), PI * 0.5), -0.15, 1.28, 0.06, 0, 0, PI * 0.25));
      k.soft('shirt', 'fabric-linen-white', 0.44, 0.7, 0.05, 0.02, -0.15, 0.93, 0.06, { puff: 0.006 });
      for (const sx of [-1, 1]) k.soft('shirt', 'fabric-linen-white', 0.12, 0.55, 0.05, 0.02, -0.15 + sx * 0.26, 1.0, 0.06, { rz: sx * 0.12, puff: 0.004 });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------- small pieces */

const jewelleryBox = mk({
  id: 'bedroom-jewellery-box', category: 'bedroom', ko: '보석함(2단 서랍)', en: 'Jewellery box', placement: 'surface',
  params: [P.mat('shell', '겉감', 'Outer', 'leather-white', 'leather'), P.mat('lining', '안감', 'Lining', 'fabric-velvet-rose', 'fabric'), P.bool('open', '뚜껑 열림', 'Lid open', true)],
  tags: ['jewellery box', 'jewelry box', 'ring box', 'vanity', '보석함', '쥬얼리 박스', '액세서리 함', '화장대 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.28, d = 0.18, h = 0.12;
    k.rbox('shell', p.shell, w, h, d, 0.008, 0, h / 2, 0);
    for (const y of [0.03, 0.075]) { k.box('fronts', p.shell, w - 0.02, 0.035, 0.004, 0, y, d / 2 + 0.001, { r: 0.001 }); k.cyl('handles', 'metal-gold', 0.006, 0.006, 0.008, 0, y, d / 2, { rx: PI / 2, segs: k.seg(10, 5) }); }
    k.box('lining', p.lining, w - 0.02, 0.004, d - 0.02, 0, h + 0.0, 0, { r: 0 });
    if (p.open) {
      k.rbox('shell', p.shell, w, 0.03, d, 0.008, 0, h + d / 2 - 0.0, -d / 2 - 0.0, { rx: -PI / 2 + 0.25 });
      k.add('jewels', 'metal-gold', T(new THREE.TorusGeometry(0.012, 0.003, 6, k.seg(14, 6)), -0.07, h + 0.012, 0.02, 0, 0, 0));
      k.tube('jewels', 'metal-gold', [[0.02, h + 0.004, -0.04], [0.06, h + 0.006, 0.0], [0.1, h + 0.004, -0.03], [0.07, h + 0.004, 0.05]], 0.002, { radial: 4, segs: k.seg(16, 6) });
    } else k.rbox('shell', p.shell, w + 0.004, 0.03, d + 0.004, 0.008, 0, h + 0.015, 0);
    return finish(k);
  },
});

const tabletopMirror = mk({
  id: 'bedroom-vanity-mirror-tabletop', category: 'bedroom', ko: '탁상 화장 거울(서랍 받침)', en: 'Table-top vanity mirror with drawer', placement: 'surface',
  params: [WOOD('wood-walnut', '나무', 'Wood'), P.pick('shape', '모양', 'Shape', 'oval', [['oval', '타원', 'Oval'], ['round', '원형', 'Round']])],
  tags: ['vanity mirror', 'tabletop mirror', 'tilting mirror', 'makeup mirror', '탁상 거울', '화장 거울', '스탠드 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.34, d = 0.16, mw = p.shape === 'round' ? 0.3 : 0.26, mh = p.shape === 'round' ? 0.3 : 0.38;
    k.box('base', p.wood, w, 0.07, d, 0, 0.035, 0, { r: 0.006 });
    k.box('fronts', p.wood, w - 0.03, 0.05, 0.01, 0, 0.035, d / 2, { r: 0.002 });
    k.cyl('handles', 'metal-brass', 0.007, 0.007, 0.012, 0, 0.035, d / 2, { rx: PI / 2, segs: k.seg(10, 5) });
    for (const sx of [-1, 1]) k.box('base', p.wood, 0.02, mh * 0.62, 0.025, sx * (mw / 2 + 0.03), 0.07 + mh * 0.31, 0, { r: 0.006 });
    const cy = 0.07 + mh / 2 + 0.03;
    const frame = ellipse(mw + 0.03, mh + 0.03); frame.holes.push(new THREE.Path(ellipse(mw, mh).getPoints(32)));
    k.panel('base', p.wood, frame, 0.02, 0, cy, 0, { rx: -0.1 });
    k.add('mirror', 'mirror', T(new THREE.ShapeGeometry(ellipse(mw, mh), k.seg(24, 10)), 0, cy, 0.004, -0.1, 0, 0));
    for (const sx of [-1, 1]) k.cyl('handles', 'metal-brass', 0.008, 0.008, 0.01, sx * (mw / 2 + 0.02), cy, 0, { rz: PI / 2, segs: k.seg(10, 5) });
    return finish(k);
  },
});

const bedRest = mk({
  id: 'bedroom-bed-rest-pillow', category: 'bedroom', ko: '등받이 독서 쿠션(팔걸이형)', en: 'Bed rest reading pillow', placement: 'surface',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-boucle', 'fabric')],
  tags: ['bed rest', 'reading pillow', 'husband pillow', 'backrest cushion', '등받이 쿠션', '독서 쿠션', '침대 등받이', '팔걸이 쿠션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.soft('fabric', p.fabric, 0.5, 0.5, 0.2, 0.08, 0, 0.27, -0.1, { puff: 0.02, rx: -0.25 });
    for (const sx of [-1, 1]) k.soft('fabric', p.fabric, 0.15, 0.24, 0.4, 0.07, sx * 0.29, 0.12, 0.02, { puff: 0.015 });
    k.soft('fabric', p.fabric, 0.42, 0.1, 0.32, 0.04, 0, 0.05, 0.05, { puff: 0.01 });
    k.add('handle', p.fabric, T(new THREE.TorusGeometry(0.06, 0.012, 6, k.seg(14, 6), PI), 0, 0.53, -0.17, -0.25, 0, 0));
    return finish(k);
  },
});

export const ITEMS = [
  panelBed, tuftedBed, palletBed, midCentury, guestBed, adultLoft, chairBed,
  gentlemans, highboy, chestOnChest, mirroredChest, fabricWardrobe, jangnong, bandaji, underBed, closetIsland,
  trifold, tvLift, overBed, trunks, steamer, jewelleryBox, tabletopMirror, bedRest,
];
