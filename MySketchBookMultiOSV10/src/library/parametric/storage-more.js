// More storage items (designs + preset variants of storage.js entries). See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, item, P, variant, OPT, rng, addCabinet, addHandle, roundRect, frameShape, pillowGeo, T } from './helpers.js';
import { ITEMS as BASE } from './storage.js';
import { addBooks } from './living.js';
import { recentre } from './dining.js';

const KRAFT = '#b48a5c';
const TAPE = '#d6b277';
const base = (id) => BASE.find((e) => e.id === id);

/** Kraft cardboard box with tape, flap seam and a label. Centre bottom at (x, y, z). */
function cardBox(k, w, h, d, x, y, z, { label = true } = {}) {
  k.box('boxes', 'paint-white-matte', w, h, d, x, y + h / 2, z, { r: 0.004, segs: 1, overrides: { color: KRAFT } });
  // flap seam along x under the tape, tape across the top and down the front / back
  k.box('tape', 'plastic-white', w + 0.002, 0.0015, 0.05, x, y + h + 0.0005, z, { r: 0, overrides: { color: TAPE } });
  for (const s of [-1, 1]) k.box('tape', 'plastic-white', 0.05, 0.07, 0.0015, x, y + h - 0.035, z + s * (d / 2 + 0.0005), { r: 0, overrides: { color: TAPE } });
  if (label) k.box('labels', 'paper', Math.min(0.12, w * 0.35), 0.07, 0.0015, x - w * 0.2, y + h * 0.45, z + d / 2 + 0.0008, { r: 0 });
}

/** A sneaker / shoe along +z (toe at +z), bottom centre at (x, y, z), tilted by rx. */
function shoe(k, x, y, z, mat, { rx = 0, len = 0.26, sole = 'plastic-white' } = {}) {
  const c = Math.cos(rx), s = Math.sin(rx);
  const at = (ly, lz) => [x, y + ly * c - lz * s, z + ly * s + lz * c];
  let [px, py, pz] = at(0.012, 0);
  k.box('soles', sole, 0.095, 0.024, len, px, py, pz, { r: 0.01, segs: 2, rx });
  // heel / quarter part, rounded toe box, dark collar opening
  [px, py, pz] = at(0.024 + 0.033, -len * 0.16);
  k.soft('shoes', mat, 0.084, 0.066, len * 0.6, 0.028, px, py, pz, { rx, puff: 0.004, flat: 1 });
  [px, py, pz] = at(0.024 + 0.018, len * 0.22);
  k.sphere('shoes', mat, 1, px, py, pz, { rx, scale: [0.043, 0.032, len * 0.27], segs: k.seg(14, 6), rings: k.seg(8, 4) });
  [px, py, pz] = at(0.024 + 0.062, -len * 0.27);
  k.sphere('soles', 'rubber-black', 1, px, py, pz, { rx, scale: [0.03, 0.008, len * 0.14], segs: k.seg(12, 6), rings: k.seg(6, 4) });
}

/* ---------------------------------------------------- sliding-door wardrobe */

const slidingWardrobe = item({
  id: 'storage-sliding-wardrobe', category: 'storage', ko: '슬라이딩 도어 옷장', en: 'Sliding-door wardrobe', size: [2.0, 2.2, 0.65],
  params: [
    P.len('width', '폭', 'Width', 2.0, 1.2, 3.6),
    P.len('height', '높이', 'Height', 2.2, 1.9, 2.6),
    P.len('depth', '깊이', 'Depth', 0.65, 0.55, 0.7),
    P.int('doors', '문 수', 'Doors', 2, 2, 4),
    P.mat('front', '문', 'Doors', 'paint-white-matte', 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('profile', '프레임', 'Profiles', 'metal-aluminium', 'metal'),
    P.bool('mirror', '거울 문', 'Mirror door', false),
  ],
  tags: ['sliding wardrobe', 'wardrobe', 'closet', '슬라이딩 옷장', '옷장', '미닫이 옷장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p, t = 0.018, plinth = 0.06;
    for (const s of [-1, 1]) k.box('body', p.body, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.002 });
    k.box('body', p.body, w - 2 * t, t, d - 0.002, 0, h - t / 2, -0.001, { r: 0.001 });
    k.box('body', p.body, w - 2 * t, plinth, d - 0.1, 0, plinth / 2, -0.05, { r: 0.001 });
    k.box('body', p.body, w - 2 * t, h - t - plinth, 0.01, 0, plinth + (h - t - plinth) / 2, -d / 2 + 0.005, { r: 0 });
    const iw = w - 2 * t, n = Math.max(2, Math.min(p.doors, Math.round(iw / 0.5)));
    // aluminium top rail and floor track
    k.box('profiles', p.profile, iw, 0.05, 0.075, 0, h - t - 0.025, d / 2 - 0.04, { r: 0.002 });
    k.box('profiles', p.profile, iw, 0.015, 0.075, 0, plinth + 0.0075, d / 2 - 0.04, { r: 0.002 });
    const ov = 0.03, dw = (iw + (n - 1) * ov) / n, dh = h - t - 0.05 - plinth - 0.015 - 0.006;
    const dy = plinth + 0.015 + 0.003 + dh / 2;
    for (let i = 0; i < n; i++) {
      const x = -iw / 2 + dw / 2 + i * (dw - ov);
      const z = i % 2 === 0 ? d / 2 - 0.058 : d / 2 - 0.025;
      const mirror = p.mirror && (n === 2 ? i === 1 : i === Math.floor(n / 2));
      // door leaf framed by vertical aluminium profiles (the pulls) and a thin top / bottom profile
      k.box(mirror ? 'mirror' : 'fronts', mirror ? 'mirror' : p.front, dw - 0.03, dh - 0.03, 0.012, x, dy, z, { r: 0.001 });
      for (const s of [-1, 1]) k.box('profiles', p.profile, 0.022, dh, 0.03, x + s * (dw / 2 - 0.011), dy, z, { r: 0.003 });
      for (const s of [-1, 1]) k.box('profiles', p.profile, dw - 0.04, 0.018, 0.022, x, dy + s * (dh / 2 - 0.009), z, { r: 0.002 });
      if (!mirror) k.box('profiles', p.profile, dw - 0.04, 0.012, 0.018, x, dy + dh * 0.17, z, { r: 0.002 });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------ blanket chest */

const blanketChest = item({
  id: 'storage-blanket-chest', category: 'storage', ko: '원목 블랭킷 체스트', en: 'Blanket chest', size: [1.04, 0.5, 0.48],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.4),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('hardware', '장식 철물', 'Hardware', 'metal-brass', 'metal'),
  ],
  tags: ['blanket chest', 'hope chest', 'wooden chest', '블랭킷 체스트', '원목 함', '수납 궤'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, foot = 0.07, top = 0.46, st = 0.05;
    // bracket feet + plinth moulding
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.08, foot, 0.08, sx * (w / 2 - 0.04), foot / 2, sz * (d / 2 - 0.04), { r: 0.01, segs: 2 });
    k.box('frame', p.wood, w + 0.01, 0.025, d + 0.01, 0, foot + 0.0125, 0, { r: 0.006, segs: 2 });
    const y0 = foot + 0.025, bh = top - y0;
    // corner stiles, rails and recessed panels (frame-and-panel)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, st, bh, st, sx * (w / 2 - st / 2), y0 + bh / 2, sz * (d / 2 - st / 2), { r: 0.004 });
    for (const sz of [-1, 1]) for (const y of [y0 + 0.03, top - 0.03]) k.box('frame', p.wood, w - 2 * st, 0.06, 0.03, 0, y, sz * (d / 2 - 0.015), { r: 0.003 });
    for (const sx of [-1, 1]) for (const y of [y0 + 0.03, top - 0.03]) k.box('frame', p.wood, 0.03, 0.06, d - 2 * st, sx * (w / 2 - 0.015), y, 0, { r: 0.003 });
    const ph = bh - 0.12;
    for (const sz of [-1, 1]) {
      k.box('panels', p.wood, w - 2 * st, ph, 0.012, 0, y0 + bh / 2, sz * (d / 2 - 0.022), { r: 0.002 });
      // two raised fields on the front / back, split by a muntin
      k.box('frame', p.wood, 0.05, ph, 0.03, 0, y0 + bh / 2, sz * (d / 2 - 0.015), { r: 0.003 });
      const fw = (w - 2 * st - 0.05) / 2 - 0.05;
      for (const sx of [-1, 1]) k.box('panels', p.wood, fw, ph - 0.05, 0.01, sx * (fw / 2 + 0.05), y0 + bh / 2, sz * (d / 2 - 0.012), { r: 0.006, segs: 2 });
    }
    for (const sx of [-1, 1]) k.box('panels', p.wood, 0.012, ph, d - 2 * st, sx * (w / 2 - 0.022), y0 + bh / 2, 0, { r: 0.002 });
    // lid with moulded edge
    k.box('lid', p.wood, w + 0.03, 0.028, d + 0.03, 0, top + 0.014, 0, { r: 0.008, segs: 2 });
    k.box('lid', p.wood, w + 0.01, 0.012, d + 0.01, 0, top + 0.004, 0, { r: 0.004 });
    // escutcheon with keyhole, iron side handles
    k.box('hardware', p.hardware, 0.04, 0.05, 0.004, 0, top - 0.035, d / 2 + 0.002, { r: 0.002 });
    k.box('keyhole', 'paint-black-matte', 0.006, 0.016, 0.002, 0, top - 0.036, d / 2 + 0.0045, { r: 0 });
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2), y = top - 0.11;
      k.box('hardware', p.hardware, 0.004, 0.035, 0.12, x + sx * 0.002, y + 0.01, 0, { r: 0.0015 });
      k.bentTube('hardware', p.hardware, [[x, y, -0.05], [x + sx * 0.02, y - 0.03, -0.05], [x + sx * 0.02, y - 0.03, 0.05], [x, y, 0.05]], 0.005, 0.012, { radial: k.seg(8, 4) });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------ steamer trunk */

const steamerTrunk = item({
  id: 'storage-steamer-trunk', category: 'storage', ko: '빈티지 트렁크', en: 'Steamer trunk', size: [0.95, 0.54, 0.53],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.1),
    P.mat('body', '외피', 'Covering', 'leather-brown', 'leather'),
    P.mat('slats', '나무 띠', 'Wood slats', 'wood-oak', 'wood'),
    P.mat('hardware', '장식 철물', 'Hardware', 'metal-brass', 'metal'),
  ],
  tags: ['trunk', 'steamer trunk', 'vintage chest', '트렁크', '빈티지 트렁크', '여행 가방 수납함'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.5, bh = 0.34, lh = 0.17, y0 = 0.015;
    // two runners underneath
    for (const s of [-1, 1]) k.box('slats', p.slats, w - 0.04, y0 + 0.002, 0.05, 0, (y0 + 0.002) / 2, s * (d / 2 - 0.06), { r: 0.004 });
    k.box('body', p.body, w, bh, d, 0, y0 + bh / 2, 0, { r: 0.008, segs: 2 });
    k.box('seam', 'leather-black', w - 0.01, 0.006, d - 0.01, 0, y0 + bh + 0.003, 0, { r: 0 });
    const ly = y0 + bh + 0.006;
    k.soft('body', p.body, w, lh, d, 0.03, 0, ly + lh / 2, 0, { puff: 0.008, flat: 3 });
    // wooden bands around body and lid, vertical bands over the front / back
    for (const y of [y0 + 0.04, y0 + bh - 0.03, ly + 0.03, ly + lh - 0.045]) {
      for (const s of [-1, 1]) k.box('slats', p.slats, w - 0.07, 0.035, 0.012, 0, y, s * (d / 2 + 0.005), { r: 0.003 });
      for (const s of [-1, 1]) k.box('slats', p.slats, 0.012, 0.035, d - 0.07, s * (w / 2 + 0.005), y, 0, { r: 0.003 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box('slats', p.slats, 0.035, bh - 0.02, 0.012, sx * w * 0.26, y0 + bh / 2, sz * (d / 2 + 0.005), { r: 0.003 });
      k.box('slats', p.slats, 0.035, lh - 0.03, 0.012, sx * w * 0.26, ly + lh / 2 - 0.005, sz * (d / 2 + 0.005), { r: 0.003 });
    }
    // brass corner caps on all eight corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [y0 + 0.025, ly + lh - 0.025]) k.box('hardware', p.hardware, 0.06, 0.05, 0.06, sx * (w / 2 - 0.028), y, sz * (d / 2 - 0.028), { r: 0.006, segs: 2 });
    // two latches and a lock plate
    for (const sx of [-1, 0, 1]) {
      const x = sx * w * 0.36;
      k.box('hardware', p.hardware, sx ? 0.04 : 0.06, 0.07, 0.006, x, ly + 0.005, d / 2 + 0.013, { r: 0.003 });
      if (!sx) k.box('seam', 'leather-black', 0.008, 0.018, 0.002, 0, ly - 0.005, d / 2 + 0.0165, { r: 0 });
    }
    // leather end handles
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 + 0.012), y = y0 + bh - 0.08;
      k.box('hardware', p.hardware, 0.006, 0.04, 0.05, x, y, -0.07, { r: 0.002 });
      k.box('hardware', p.hardware, 0.006, 0.04, 0.05, x, y, 0.07, { r: 0.002 });
      k.bentTube('seam', 'leather-black', [[x, y, -0.07], [x + sx * 0.012, y - 0.03, -0.05], [x + sx * 0.012, y - 0.03, 0.05], [x, y, 0.07]], 0.008, 0.02, { radial: k.seg(8, 4) });
    }
    return k.group();
  },
});

/* -------------------------------------------------------- woven basket set */

function basket(k, r, h, x, z, mat, liner) {
  // ribbed weave: the profile ripples every 1.6 cm; inner wall comes back down
  const prof = [[0, 0], [r * 0.82, 0], [r * 0.85, 0.008]];
  const rows = Math.max(4, Math.round(h / 0.016));
  for (let i = 1; i <= rows; i++) {
    const t = i / rows, y = 0.008 + (h - 0.02) * t, rr = r * (0.85 + 0.15 * Math.sin(t * Math.PI * 0.6));
    prof.push([rr + (i % 2 ? 0.003 : 0), y]);
  }
  prof.push([r * 0.99, h - 0.006], [r * 0.95, h - 0.006], [r * 0.82, 0.02], [0, 0.02]);
  k.lathe('baskets', mat, prof, x, 0, z, { segs: k.seg(36, 10) });
  // thick rim
  const rim = new THREE.TorusGeometry(r * 0.985, 0.009, k.seg(8, 4), k.seg(36, 10)).rotateX(Math.PI / 2).translate(x, h - 0.004, z);
  k.add('baskets', mat, rim);
  if (liner) k.lathe('liners', 'fabric-linen-white', [[r * 0.95, h - 0.08], [r * 0.955, h - 0.002], [r * 1.0, h + 0.012], [r * 1.04, h - 0.01], [r * 1.045, h - 0.07]], x, 0, z, { segs: k.seg(36, 10) });
  // two loop handles on the sides
  for (const s of [-1, 1]) {
    const hx = x + s * (r * 0.99);
    k.tube('baskets', mat, [[hx, h - 0.06, z - 0.05], [hx + s * 0.025, h - 0.03, z - 0.04], [hx + s * 0.03, h - 0.02, z], [hx + s * 0.025, h - 0.03, z + 0.04], [hx, h - 0.06, z + 0.05]], 0.007, { radial: k.seg(8, 4), segs: k.seg(16, 6) });
  }
}

const basketSet = item({
  id: 'storage-basket-set', category: 'storage', ko: '라탄 바구니 세트', en: 'Woven basket set', size: [1.23, 0.31, 0.42],
  params: [
    P.int('count', '개수', 'Baskets', 3, 2, 4),
    P.mat('weave', '소재', 'Weave', 'rattan', 'wood'),
    P.bool('liner', '천 안감', 'Fabric liner', true),
  ],
  tags: ['basket', 'woven basket', 'storage basket', '바구니', '라탄 바구니', '수납 바구니'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = [0.2, 0.16, 0.13, 0.11], H = [0.3, 0.25, 0.21, 0.17];
    let x = 0;
    for (let i = 0; i < p.count; i++) {
      x += i ? R[i - 1] + R[i] + 0.09 : 0;
      basket(k, R[i], H[i], x, i % 2 ? 0.03 : 0, p.weave, p.liner);
    }
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------- wooden crates */

function crate(k, x, y, z, mat, w = 0.5, h = 0.3, d = 0.36) {
  const t = 0.018;
  for (const s of [-1, 1]) {
    k.box('crates', mat, t, h, d, x + s * (w / 2 - t / 2), y + h / 2, z, { r: 0.002 });
    // hand slot through the end board
    const slot = new THREE.CapsuleGeometry(0.018, 0.07, k.seg(4, 2), k.seg(10, 6)).rotateX(Math.PI / 2).rotateY(Math.PI / 2);
    slot.scale(0.25, 1, 1).translate(x + s * (w / 2 + 0.0005), y + h - 0.06, z);
    k.add('slots', 'paint-black-matte', slot);
  }
  // three slats front and back with gaps, three bottom boards
  const sh = (h - 0.04) / 3;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box('crates', mat, w - 2 * t, sh - 0.012, 0.012, x, y + 0.012 + sh * i + sh / 2 + 0.006, z + s * (d / 2 - 0.006), { r: 0.002 });
  for (let i = 0; i < 3; i++) k.box('crates', mat, w - 2 * t, 0.012, d / 3 - 0.012, x, y + 0.006, z - d / 3 + (d / 3) * i, { r: 0.002 });
}

const crateStack = item({
  id: 'storage-crate-stack', category: 'storage', ko: '나무 상자 스택', en: 'Wooden crate stack', size: [1.02, 0.6, 0.36],
  params: [
    P.int('count', '상자 수', 'Crates', 3, 1, 4),
    P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'),
  ],
  tags: ['crate', 'wooden crate', 'apple box', '나무 상자', '사과 박스', '우드 크레이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.count, w = 0.5, h = 0.3, g = 0.02;
    const pos = n === 1 ? [[0, 0]] : n === 2 ? [[-(w + g) / 2, 0], [(w + g) / 2, 0]] : n === 3 ? [[-(w + g) / 2, 0], [(w + g) / 2, 0], [0.04, 1]] : [[-(w + g) / 2, 0], [(w + g) / 2, 0], [-(w + g) / 2, 1], [(w + g) / 2, 1]];
    for (const [x, row] of pos) crate(k, x, row * (h + 0.001), row ? 0.0 : 0, p.wood, w, h);
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------------- pegboard */

const pegboard = item({
  id: 'storage-pegboard', category: 'storage', ko: '타공판 공구 걸이', en: 'Pegboard with tools', placement: 'wall', elevation: 1.0, size: [0.9, 0.6, 0.12],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.5),
    P.len('height', '높이', 'Height', 0.6, 0.4, 1.0),
    P.mat('board', '판', 'Board', 'plywood', 'wood'),
    P.bool('tools', '공구', 'Tools', true),
  ],
  tags: ['pegboard', 'tool wall', 'garage', '타공판', '공구 걸이', '페그보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p, D = 0.12, bt = 0.006;
    const zb = -D / 2 + 0.022, zf = zb + bt / 2;
    // battens behind, board, frame lip around it
    for (const s of [-1, 1]) k.box('frame', 'wood-pine', w - 0.02, 0.04, 0.019, 0, h / 2 + s * (h / 2 - 0.03), -D / 2 + 0.0095, { r: 0.002 });
    k.box('board', p.board, w, h, bt, 0, h / 2, zb, { r: 0.0015 });
    const sp = 0.025, nx = Math.floor((w - 0.05) / sp), ny = Math.floor((h - 0.05) / sp);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const disc = new THREE.CircleGeometry(0.0032, k.seg(8, 4));
      disc.translate(-nx * sp / 2 + i * sp, h / 2 - ny * sp / 2 + j * sp, zf + 0.0006);
      k.add('holes', 'paint-black-matte', disc);
    }
    if (!p.tools) return recentre(k.group());
    const hook = (x, y, len = 0.05) => {
      k.bentTube('hooks', 'metal-steel', [[x, y, zf], [x, y, zf + len], [x, y + 0.018, zf + len + 0.006]], 0.0022, 0.008, { radial: k.seg(6, 4) });
    };
    const top = h - 0.1;
    // hammer resting on two hooks
    const hx = -w / 2 + 0.12;
    hook(hx - 0.025, top); hook(hx + 0.025, top);
    k.box('tools', 'metal-black', 0.11, 0.026, 0.024, hx, top + 0.015, zf + 0.04, { r: 0.004 });
    k.cyl('toolWood', 'wood-ash', 0.012, 0.014, Math.min(0.3, h - 0.15), hx, top + 0.003 - Math.min(0.3, h - 0.15), zf + 0.04, { segs: k.seg(10, 5) });
    // screwdrivers in a strip holder
    const sx0 = -w / 2 + 0.27;
    k.box('tools', 'metal-black', 0.14, 0.012, 0.05, sx0, top, zf + 0.025, { r: 0.002 });
    for (let i = 0; i < 4; i++) {
      const x = sx0 - 0.05 + i * 0.033, L = 0.09 + (i % 2) * 0.04;
      k.cyl('handles', 'plastic-black', 0.011, 0.013, 0.085, x, top + 0.006, zf + 0.03, { segs: k.seg(10, 5), overrides: { color: '#c0392b' } });
      k.cyl('tools', 'metal-steel', 0.0035, 0.0035, L, x, top + 0.006 - L, zf + 0.03, { segs: k.seg(6, 4) });
    }
    // wrench + tape roll on single hooks
    const wx = w > 0.75 ? 0.02 : 0.08;
    hook(wx, top + 0.03);
    k.box('tools', 'metal-steel', 0.022, 0.17, 0.005, wx, top + 0.03 - 0.085, zf + 0.04, { r: 0.002 });
    k.add('tools', 'metal-steel', new THREE.TorusGeometry(0.018, 0.006, k.seg(6, 4), k.seg(14, 6)).translate(wx, top - 0.14, zf + 0.04));
    if (w > 0.75) {
      const tx = 0.15;
      hook(tx, top + 0.01, 0.06);
      k.add('tape', 'paint-white-matte', new THREE.TorusGeometry(0.04, 0.016, k.seg(8, 4), k.seg(20, 8)).rotateX(0).translate(tx, top - 0.025, zf + 0.04), { overrides: { color: '#e0c34a' } });
    }
    // wire shelf with paint tins on the right
    const bx = w / 2 - 0.15, by = Math.max(0.12, h * 0.38);
    k.box('tools', 'metal-black', 0.24, 0.006, 0.1, bx, by, zf + 0.05, { r: 0.002 });
    k.box('tools', 'metal-black', 0.24, 0.03, 0.004, bx, by + 0.012, zf + 0.098, { r: 0.0015 });
    for (const s of [-1, 1]) k.rod('tools', 'metal-black', [bx + s * 0.11, by + 0.07, zf], [bx + s * 0.11, by, zf + 0.09], 0.003);
    for (const s of [-1, 1]) {
      k.cyl('tins', 'metal-steel', 0.04, 0.04, 0.08, bx + s * 0.055, by + 0.003, zf + 0.05, { segs: k.seg(16, 6) });
      k.cyl('tools', 'metal-black', 0.041, 0.041, 0.006, bx + s * 0.055, by + 0.083, zf + 0.05, { segs: k.seg(16, 6) });
    }
    // lower row: pliers on a hook
    const px = -w / 2 + 0.12, py = Math.max(0.1, top - 0.36);
    if (py > 0.08 && h >= 0.55) {
      hook(px + 0.12, py + 0.06);
      for (const s of [-1, 1]) k.rod('handles', 'plastic-black', [px + 0.12, py + 0.07, zf + 0.04], [px + 0.12 + s * 0.022, py - 0.07, zf + 0.04], 0.006, { overrides: { color: '#c0392b' } });
    }
    return k.group();
  },
});

/* ---------------------------------------------------------------- hall tree */

const hallTree = item({
  id: 'storage-hall-tree', category: 'storage', ko: '현관 벤치 옷걸이', en: 'Hall tree bench', size: [1.04, 1.9, 0.42],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.8, 1.4),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('cushion', '방석', 'Cushion', 'fabric-linen-grey', 'fabric'),
    P.mat('hooks', '고리', 'Hooks', 'metal-black', 'metal'),
  ],
  tags: ['hall tree', 'entryway bench', 'coat hooks', '현관 벤치', '현관 옷걸이', '신발 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.42, H = 1.9, seat = 0.45, t = 0.025;
    for (const s of [-1, 1]) {
      k.box('frame', p.wood, 0.04, H - 0.04, 0.04, s * (w / 2 - 0.02), (H - 0.04) / 2, -d / 2 + 0.02, { r: 0.004 });
      k.box('frame', p.wood, 0.03, seat, d - 0.04, s * (w / 2 - 0.015), seat / 2, 0.02, { r: 0.003 });
    }
    k.box('frame', p.wood, w, t, d, 0, seat - t / 2, 0, { r: 0.004 });
    k.box('frame', p.wood, w - 0.06, 0.05, 0.02, 0, seat - t - 0.025, d / 2 - 0.02, { r: 0.003 });
    k.box('frame', p.wood, w - 0.06, 0.018, d - 0.06, 0, 0.11, 0.01, { r: 0.002 });
    k.box('frame', p.wood, w - 0.06, 0.06, 0.018, 0, 0.05, d / 2 - 0.03, { r: 0.002 });
    k.soft('cushion', p.cushion, w - 0.08, 0.06, d - 0.06, 0.025, 0, seat + 0.03, 0.02, { puff: 0.008, sag: 0.006 });
    // bead-board back panel between the uprights
    const bw = w - 0.08, nb = Math.max(4, Math.round(bw / 0.09)), y0 = seat, y1 = 1.72;
    for (let i = 0; i < nb; i++) k.box('panel', p.wood, bw / nb - 0.003, y1 - y0, 0.014, -bw / 2 + (bw / nb) * (i + 0.5), (y0 + y1) / 2, -d / 2 + 0.02, { r: 0.002 });
    // hook rail with double hooks, cap shelf with brackets
    k.box('frame', p.wood, bw, 0.09, 0.022, 0, 1.58, -d / 2 + 0.038, { r: 0.004 });
    const nh = Math.max(3, Math.round(bw / 0.22));
    for (let i = 0; i < nh; i++) {
      const x = -bw / 2 + (bw / nh) * (i + 0.5), zf = -d / 2 + 0.049;
      k.bentTube('hooks', p.hooks, [[x, 1.6, zf], [x, 1.6, zf + 0.06], [x, 1.64, zf + 0.075]], 0.005, 0.015, { radial: k.seg(8, 4) });
      k.bentTube('hooks', p.hooks, [[x, 1.565, zf], [x, 1.53, zf + 0.04], [x, 1.55, zf + 0.055]], 0.004, 0.012, { radial: k.seg(8, 4) });
      k.cyl('hooks', p.hooks, 0.012, 0.012, 0.004, x, 1.58, zf, { rx: Math.PI / 2, segs: k.seg(12, 6) });
    }
    k.box('frame', p.wood, w + 0.04, 0.03, 0.24, 0, H - 0.025, -d / 2 + 0.12, { r: 0.004 });
    k.box('frame', p.wood, w, 0.03, 0.03, 0, H - 0.055, -d / 2 + 0.035, { r: 0.003 });
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(0.17, 0); sh.quadraticCurveTo(0.03, -0.03, 0, -0.15); sh.lineTo(0, 0);
      k.panel('frame', p.wood, sh, 0.02, s * (w / 2 - 0.02), H - 0.04, -d / 2 + 0.04, { ry: -Math.PI / 2 });
    }
    // a basket of shoes on the lower shelf
    k.soft('basket', 'rattan', 0.36, 0.17, 0.28, 0.02, -w / 4, 0.119 + 0.085, 0.02, { flat: 3 });
    shoe(k, w / 4 - 0.055, 0.119, 0.03, 'leather-brown', { sole: 'leather-black' });
    shoe(k, w / 4 + 0.055, 0.119, 0.03, 'leather-brown', { sole: 'leather-black' });
    return k.group();
  },
});

/* ------------------------------------------------------------ umbrella stand */

const umbrellaStand = item({
  id: 'storage-umbrella-stand', category: 'storage', ko: '우산꽂이', en: 'Umbrella stand', size: [0.27, 1.0, 0.22],
  params: [
    P.pick('style', '형태', 'Style', 'ceramic', [['ceramic', '도자기', 'Ceramic'], ['metal', '금속 원통', 'Metal tube']]),
    P.color('color', '색', 'Colour', '#7d8f86'),
    P.bool('umbrellas', '우산', 'Umbrellas', true),
  ],
  tags: ['umbrella stand', 'umbrella holder', 'entryway', '우산꽂이', '우산 스탠드', '현관 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.11, h = 0.48;
    if (p.style === 'ceramic') {
      k.lathe('stand', 'ceramic-matte', [[0, 0], [r * 0.85, 0], [r * 0.9, 0.01], [r, 0.1], [r * 0.98, h * 0.8], [r * 0.92, h - 0.01], [r * 0.95, h], [r * 0.85, h], [r * 0.85, 0.03], [0, 0.03]], 0, 0, 0, { smooth: 0, segs: k.seg(36, 10), overrides: { color: p.color } });
    } else {
      k.lathe('stand', 'metal-white', [[0, 0.012], [r, 0.012], [r, h], [r - 0.004, h], [r - 0.004, 0.03], [0, 0.03]], 0, 0, 0, { segs: k.seg(36, 10), overrides: { color: p.color } });
      k.lathe('base', 'metal-black', [[0, 0], [r + 0.012, 0], [r + 0.012, 0.016], [r - 0.002, 0.018], [0, 0.018]], 0, 0, 0, { segs: k.seg(36, 10) });
      k.add('base', 'metal-black', new THREE.TorusGeometry(r - 0.002, 0.005, k.seg(6, 4), k.seg(36, 10)).rotateX(Math.PI / 2).translate(0, h, 0));
    }
    if (p.umbrellas) {
      const L = 0.85, pal = ['fabric-navy', 'fabric-terracotta'];
      [-1, 1].forEach((s, i) => {
        const a = s * 0.1, bx = -s * 0.035;
        const at = (lx, ly) => [bx + lx * Math.cos(a) + ly * Math.sin(a), 0.035 - lx * Math.sin(a) + ly * Math.cos(a), i ? 0.02 : -0.02];
        k.rod('shafts', 'metal-black', at(0, 0), at(0, L), 0.005);
        // folded canopy spindle with a strap
        const prof = [[0.004, 0.04], [0.02, 0.12], [0.034, 0.4], [0.032, 0.62], [0.01, 0.72]];
        const [cx, cy, cz] = at(0, 0);
        k.lathe('canopy', pal[i], prof, cx, cy, cz, { smooth: 14, segs: k.seg(14, 6), rz: -a });
        const [sx, sy, sz] = at(0, 0.55);
        k.lathe('canopy', pal[i], [[0.033, -0.012], [0.035, 0], [0.033, 0.012]], sx, sy, sz, { segs: k.seg(14, 6), rz: -a });
        // J-handle curling outwards
        const pts = [[0, L - 0.01], [0, L + 0.06], [s * 0.012, L + 0.1], [s * 0.04, L + 0.11], [s * 0.062, L + 0.085], [s * 0.065, L + 0.055]].map(([x, y]) => at(x, y));
        k.tube('handles', 'wood-walnut', pts, 0.011, { radial: k.seg(10, 5), segs: k.seg(20, 8), caps: true });
      });
    }
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------- garage rack */

const garageRack = item({
  id: 'storage-garage-rack', category: 'storage', ko: '철제 앵글 선반', en: 'Garage steel rack', size: [1.2, 1.8, 0.45],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.len('height', '높이', 'Height', 1.8, 1.2, 2.1),
    P.int('levels', '단 수', 'Levels', 5, 3, 6),
    P.mat('frame', '프레임', 'Frame', 'metal-steel', 'metal'),
    P.mat('boards', '선반', 'Boards', 'plywood', 'wood'),
    P.bool('contents', '수납물', 'Contents', true),
  ],
  tags: ['garage shelving', 'steel rack', 'utility shelf', '앵글 선반', '철제 선반', '창고 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p, d = 0.45, n = p.levels, a = 0.035;
    // L-angle posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - a / 2), z = sz * (d / 2 - a / 2);
      k.box('frame', p.frame, a, h, 0.003, x, h / 2, sz * (d / 2 - 0.0015), { r: 0.0008 });
      k.box('frame', p.frame, 0.003, h, a, sx * (w / 2 - 0.0015), h / 2, z, { r: 0.0008 });
      k.box('feet', 'plastic-black', a + 0.004, 0.012, a + 0.004, x, 0.006, z, { r: 0.003 });
      // keyhole slots on the front faces
      for (let j = 0; j < Math.floor(h / 0.1); j++) k.box('slots', 'paint-black-matte', 0.006, 0.03, 0.001, x - sx * 0.006, 0.06 + j * 0.1, sz * (d / 2 + 0.0004), { r: 0 });
    }
    const span = (h - 0.12) / (n - 1);
    const rand = rng(n * 3 + w);
    for (let i = 0; i < n; i++) {
      const y = i === n - 1 ? h - 0.03 : 0.1 + span * i;
      for (const sz of [-1, 1]) k.box('frame', p.frame, w - 0.006, 0.04, 0.003, 0, y - 0.02, sz * (d / 2 + 0.0015), { r: 0.0008 });
      for (const sx of [-1, 1]) k.box('frame', p.frame, 0.003, 0.04, d - 0.006, sx * (w / 2 + 0.0015), y - 0.02, 0, { r: 0.0008 });
      k.box('boards', p.boards, w - 0.012, 0.012, d - 0.012, 0, y + 0.006, 0, { r: 0.001 });
      if (!p.contents || i === n - 1) continue;
      const room = span - 0.05, yt = y + 0.012;
      if (room < 0.15) continue;
      let x = -w / 2 + 0.03;
      while (x < w / 2 - 0.2) {
        const kind = Math.floor(rand() * 3);
        if (kind === 0 && room > 0.22) {
          const bw = 0.38, bh = Math.min(0.26, room - 0.02);
          if (x + bw > w / 2 - 0.03) break;
          k.box('bins', 'plastic-grey', bw, bh - 0.02, 0.38, x + bw / 2, yt + (bh - 0.02) / 2, 0, { r: 0.012, segs: 2, overrides: { color: '#a9b6bf' } });
          k.box('lids', 'plastic-black', bw + 0.012, 0.02, 0.392, x + bw / 2, yt + bh - 0.01, 0, { r: 0.006, overrides: { color: '#35506b' } });
          x += bw + 0.02;
        } else if (kind === 1) {
          const bw = 0.3 + rand() * 0.08, bh = Math.min(0.24, room - 0.02) * (0.7 + rand() * 0.3);
          if (x + bw > w / 2 - 0.03) break;
          cardBox(k, bw, bh, 0.34, x + bw / 2, yt, 0.0, { label: rand() < 0.6 });
          x += bw + 0.02;
        } else {
          for (let c = 0; c < 2; c++) {
            if (x + 0.17 > w / 2 - 0.03) break;
            k.cyl('tins', 'metal-steel', 0.08, 0.08, 0.18, x + 0.085, yt, 0.06, { segs: k.seg(20, 8) });
            k.cyl('lids', 'plastic-black', 0.081, 0.081, 0.008, x + 0.085, yt + 0.18, 0.06, { segs: k.seg(20, 8), overrides: { color: '#35506b' } });
            x += 0.18;
          }
          x += 0.02;
        }
      }
    }
    return k.group();
  },
});

/* --------------------------------------------------------- rolling tool chest */

const toolChest = item({
  id: 'storage-tool-chest', category: 'storage', ko: '이동식 공구함', en: 'Rolling tool chest', size: [0.72, 1.02, 0.48],
  params: [
    P.color('color', '색', 'Colour', '#b3262a'),
    P.mat('pulls', '손잡이', 'Pulls', 'metal-aluminium', 'metal'),
    P.bool('topChest', '상부 공구함', 'Top chest', true),
  ],
  tags: ['tool chest', 'tool cabinet', 'garage', '공구함', '공구 캐비닛', '이동식 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.68, d = 0.46, cast = 0.11, bh = 0.6;
    const paint = { overrides: { color: p.color } };
    // casters
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.06), z = sz * (d / 2 - 0.06);
      k.cyl('casters', 'rubber-black', 0.045, 0.045, 0.03, x - 0.015, 0.045, z, { rz: -Math.PI / 2, segs: k.seg(16, 6) });
      k.box('casterFork', 'metal-steel', 0.04, 0.05, 0.03, x, 0.07, z, { r: 0.004 });
      k.box('casterFork', 'metal-steel', 0.08, 0.008, 0.08, x, cast - 0.004, z, { r: 0.002 });
    }
    k.box('body', 'paint-white-gloss', w, bh, d - 0.012, 0, cast + bh / 2, -0.006, { r: 0.008, segs: 2, ...paint });
    k.box('trim', 'paint-black-matte', w + 0.004, 0.02, d + 0.004, 0, cast + bh - 0.01, 0, { r: 0.004 });
    // drawer fronts with full-width pulls
    const rows = [0.07, 0.07, 0.07, 0.1, 0.12, 0.14];
    let y = cast + 0.01;
    for (const rh of [...rows].reverse()) {
      k.box('fronts', 'paint-white-gloss', w - 0.04, rh - 0.008, 0.012, 0, y + rh / 2, d / 2 - 0.006, { r: 0.003, ...paint });
      k.box('pulls', p.pulls, w - 0.1, 0.014, 0.018, 0, y + rh - 0.018, d / 2 + 0.008, { r: 0.004 });
      y += rh;
    }
    // side handle bar
    k.bentTube('pulls', p.pulls, [[w / 2, cast + bh - 0.06, -0.15], [w / 2 + 0.045, cast + bh - 0.06, -0.15], [w / 2 + 0.045, cast + bh - 0.06, 0.15], [w / 2, cast + bh - 0.06, 0.15]], 0.011, 0.025, { radial: k.seg(10, 5) });
    let top = cast + bh;
    if (p.topChest) {
      const th = 0.3, y0 = top + 0.004;
      k.box('body', 'paint-white-gloss', w - 0.02, th - 0.07, d - 0.04, 0, y0 + (th - 0.07) / 2, -0.02, { r: 0.006, segs: 2, ...paint });
      let yy = y0 + 0.01;
      for (const rh of [0.05, 0.05, 0.11]) {
        k.box('fronts', 'paint-white-gloss', w - 0.06, rh - 0.008, 0.012, 0, yy + rh / 2, d / 2 - 0.026, { r: 0.003, ...paint });
        k.box('pulls', p.pulls, w - 0.12, 0.012, 0.016, 0, yy + rh - 0.016, d / 2 - 0.012, { r: 0.004 });
        yy += rh;
      }
      // hinged lid with a chrome lock
      k.box('body', 'paint-white-gloss', w, 0.07, d - 0.02, 0, y0 + th - 0.035, -0.01, { r: 0.012, segs: 2, ...paint });
      k.cyl('pulls', 'metal-chrome', 0.012, 0.012, 0.01, w / 2 - 0.07, y0 + th - 0.035, d / 2 - 0.02, { rx: Math.PI / 2, segs: k.seg(12, 6) });
      top = y0 + th;
    }
    k.box('trim', 'rubber-black', w - 0.02, 0.006, d - 0.04, 0, top + 0.003, -0.01, { r: 0.002 });
    return recentre(k.group());
  },
});

/* -------------------------------------------------------------- ladder shelf */

const ladderShelf = item({
  id: 'storage-ladder-shelf', category: 'storage', ko: '사다리 선반', en: 'Ladder shelf', size: [0.65, 1.8, 0.45],
  params: [
    P.len('width', '폭', 'Width', 0.65, 0.45, 1.0),
    P.len('height', '높이', 'Height', 1.8, 1.2, 2.0),
    P.int('shelves', '선반 수', 'Shelves', 5, 3, 6),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.bool('props', '소품', 'Props', true),
  ],
  tags: ['ladder shelf', 'leaning shelf', 'bookshelf', '사다리 선반', '벽 기대는 선반', '오픈 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p, d = 0.45, run = d - 0.04, L = Math.hypot(h, run), a = Math.atan2(run, h);
    const zAt = (y) => d / 2 - 0.02 - (run * y) / h;
    for (const s of [-1, 1]) k.box('frame', p.wood, 0.04, L, 0.03, s * (w / 2 - 0.02), h / 2, (zAt(0) + zAt(h)) / 2, { r: 0.005, segs: 2, rx: -a });
    const n = p.shelves, y0 = 0.22, y1 = h - 0.28, step = (y1 - y0) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const y = y0 + step * i, zf = zAt(y) + 0.02;
      const sd = Math.min(0.32 - (0.16 * i) / Math.max(1, n - 1), zf - (-d / 2 + 0.005));
      const cz = zf - sd / 2;
      k.box('frame', p.wood, w - 0.08, 0.022, sd, 0, y, cz, { r: 0.004 });
      k.box('frame', p.wood, w - 0.08, 0.04, 0.018, 0, y - 0.03, zf - sd + 0.009, { r: 0.003 });
      if (!p.props) continue;
      const top = y + 0.011;
      if (i === 0) {
        k.lathe('pot', 'ceramic-terracotta', [[0, 0], [0.06, 0], [0.075, 0.12], [0.08, 0.13], [0.07, 0.13], [0, 0.11]], w / 4, top, cz, { segs: k.seg(24, 8) });
        for (let j = 0; j < 7; j++) {
          const yaw = j * 0.9, g = new THREE.SphereGeometry(0.05, k.seg(10, 5), k.seg(8, 4));
          g.scale(1, 0.7, 1).translate(w / 4 + Math.cos(yaw) * 0.045, top + 0.16 + (j % 3) * 0.03, cz + Math.sin(yaw) * 0.03);
          k.add('leaves', 'plant-leaf', g);
        }
        k.box('decor', 'book-cream', 0.2, 0.03, Math.min(0.2, sd - 0.04), -w / 4 + 0.02, top + 0.015, cz, { r: 0.002 });
        k.box('decor', 'book-green', 0.18, 0.025, Math.min(0.18, sd - 0.05), -w / 4 + 0.02, top + 0.0425, cz, { r: 0.002 });
      } else if (i === 1 && sd > 0.16) {
        addBooks(k, -w / 2 + 0.06, w / 2 - 0.06, top, zf - sd + 0.01, Math.min(0.22, sd - 0.03), 7, { hMax: Math.min(0.26, step - 0.04), fill: 0.7 });
      } else if (i === 2) {
        k.lathe('vase', 'ceramic-matte', [[0, 0], [0.04, 0], [0.055, 0.05], [0.04, 0.13], [0.022, 0.17], [0.026, 0.19], [0, 0.19]], -w / 5, top, cz, { smooth: 16, segs: k.seg(20, 8) });
      }
    }
    return recentre(k.group());
  },
});

/* ----------------------------------------------------------- wall cube shelves */

const wallCubes = item({
  id: 'storage-wall-cubes', category: 'storage', ko: '벽걸이 큐브 선반', en: 'Wall cube shelves', placement: 'wall', elevation: 1.2, size: [1.0, 0.48, 0.22],
  params: [
    P.int('count', '개수', 'Cubes', 3, 2, 4),
    P.len('cube', '크기', 'Cube size', 0.3, 0.22, 0.4),
    P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'),
    P.bool('props', '소품', 'Props', true),
  ],
  tags: ['wall cube', 'wall shelf', 'floating cube', '벽걸이 선반', '큐브 선반', '벽 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = p.cube, d = 0.22, t = 0.016;
    for (let i = 0; i < p.count; i++) {
      const x = i * (c + 0.04), y = i % 2 ? c * 0.6 : 0;
      k.box('frame', p.wood, c, t, d, x, y + t / 2, 0, { r: 0.002 });
      k.box('frame', p.wood, c, t, d, x, y + c - t / 2, 0, { r: 0.002 });
      for (const s of [-1, 1]) k.box('frame', p.wood, t, c - 2 * t, d, x + s * (c / 2 - t / 2), y + c / 2, 0, { r: 0.002 });
      k.box('frame', p.wood, c - 2 * t, c - 2 * t, 0.006, x, y + c / 2, -d / 2 + 0.003, { r: 0 });
      if (!p.props) continue;
      const fy = y + t;
      if (i % 3 === 0) {
        k.lathe('pot', 'ceramic-white', [[0, 0], [0.045, 0], [0.05, 0.08], [0.052, 0.09], [0.045, 0.09], [0, 0.08]], x, fy, 0.01, { segs: k.seg(20, 8) });
        k.lathe('leaves', 'plant-leaf-light', [[0, 0.08], [0.03, 0.09], [0.036, 0.13], [0.025, 0.17], [0, 0.185]], x, fy, 0.01, { smooth: 10, segs: k.seg(14, 6) });
      } else if (i % 3 === 1) {
        const bh = Math.min(0.24, c - 2 * t - 0.03);
        for (let j = 0; j < 5; j++) k.box('books', ['book-blue', 'book-cream', 'book-red', 'book-cream', 'book-green'][j], 0.024, bh * (0.8 + 0.04 * j), 0.17, x - c / 2 + t + 0.03 + j * 0.026, fy + bh * (0.8 + 0.04 * j) / 2, 0.0, { r: 0.002 });
      } else {
        k.lathe('vase', 'ceramic-matte', [[0, 0], [0.035, 0], [0.05, 0.05], [0.03, 0.12], [0.02, 0.15], [0, 0.15]], x, fy, 0.01, { smooth: 14, segs: k.seg(20, 8), overrides: { color: '#c7b39b' } });
      }
    }
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------- floating shelves */

const floatingShelves = item({
  id: 'storage-floating-shelves', category: 'storage', ko: '무지주 벽선반', en: 'Floating shelves', placement: 'wall', elevation: 1.1, size: [0.9, 1.04, 0.22],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.5, 1.6),
    P.int('count', '선반 수', 'Shelves', 3, 1, 3),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.bool('props', '소품', 'Props', true),
  ],
  tags: ['floating shelf', 'wall shelf', 'hidden bracket', '벽선반', '무지주 선반', '플로팅 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.22, t = 0.04, gap = 0.35, n = p.count;
    for (let i = 0; i < n; i++) {
      const y = i * gap;
      k.box('shelves', p.wood, w, t, d, 0, y + t / 2, 0, { r: 0.004, segs: 2 });
      if (!p.props) continue;
      const top = y + t;
      if (i === 0) {
        k.box('books', 'book-blue', 0.24, 0.035, 0.17, -w / 2 + 0.17, top + 0.0175, 0, { r: 0.002 });
        k.box('books', 'book-cream', 0.21, 0.03, 0.16, -w / 2 + 0.17, top + 0.05, 0, { r: 0.002, ry: 0.1 });
        k.cyl('candle', 'wall-paint-white', 0.035, 0.035, 0.09, -w / 2 + 0.17, top + 0.065, 0, { segs: k.seg(16, 6) });
        k.lathe('vase', 'ceramic-matte', [[0, 0], [0.04, 0], [0.07, 0.03], [0.08, 0.05], [0.075, 0.05], [0, 0.012]], w / 2 - 0.16, top, 0, { segs: k.seg(24, 8) });
      } else if (i === 1) {
        addBooks(k, -w / 2 + 0.04, w / 2 - 0.25, top, -d / 2 + 0.01, 0.19, 5 + n, { hMax: 0.27, fill: 0.85 });
        k.lathe('vase', 'ceramic-matte', [[0, 0], [0.04, 0], [0.055, 0.05], [0.04, 0.14], [0.022, 0.2], [0.026, 0.22], [0, 0.22]], w / 2 - 0.12, top, 0, { smooth: 16, segs: k.seg(20, 8) });
      } else {
        // leaning picture frame and a small plant
        k.panel('frame', 'wood-black', frameShape(0.24, 0.3, 0.022), 0.02, -0.08, top + 0.15, -0.02, { rx: -0.12 });
        k.box('art', 'paper', 0.2, 0.26, 0.004, -0.08, top + 0.15, -0.024, { r: 0, rx: -0.12 });
        k.lathe('pot', 'ceramic-white', [[0, 0], [0.045, 0], [0.05, 0.08], [0.045, 0.08], [0, 0.07]], w / 2 - 0.12, top, 0, { segs: k.seg(20, 8) });
        for (let j = 0; j < 6; j++) {
          const g = new THREE.SphereGeometry(0.04, k.seg(10, 5), k.seg(8, 4));
          g.scale(1, 0.7, 1).translate(w / 2 - 0.12 + Math.cos(j) * 0.035, top + 0.11 + (j % 2) * 0.03, Math.sin(j) * 0.03);
          k.add('leaves', 'plant-leaf', g);
        }
      }
    }
    return recentre(k.group());
  },
});

/* -------------------------------------------------------------- corner shelf */

const cornerShelf = item({
  id: 'storage-corner-shelf', category: 'storage', ko: '코너 선반', en: 'Corner shelf', size: [0.42, 1.6, 0.42],
  params: [
    P.len('radius', '깊이', 'Depth', 0.42, 0.3, 0.6),
    P.len('height', '높이', 'Height', 1.6, 0.8, 2.0),
    P.int('shelves', '선반 수', 'Shelves', 5, 3, 7),
    P.mat('wood', '선반', 'Shelves', 'wood-walnut', 'wood'),
    P.mat('frame', '기둥', 'Posts', 'metal-black', 'metal'),
    P.bool('props', '소품', 'Props', true),
  ],
  tags: ['corner shelf', 'corner unit', 'quarter shelf', '코너 선반', '모서리 선반', '코너장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.radius, h = p.height, n = p.shelves, o = -R / 2;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(R, 0); sh.absarc(0, 0, R, 0, Math.PI / 2, false); sh.lineTo(0, 0);
    // posts in the corner and at both wall ends + one on the arc
    const posts = [[0.012, 0.012], [R - 0.014, 0.012], [0.012, R - 0.014], [R * 0.68, R * 0.68]];
    for (const [px, pz] of posts) k.cyl('posts', p.frame, 0.009, 0.009, h, o + px, 0, o + pz, { segs: k.seg(12, 6) });
    for (let i = 0; i < n; i++) {
      const y = 0.05 + ((h - 0.08) * i) / (n - 1);
      k.slab('shelves', p.wood, sh, 0.022, y, { x: o, z: o, bevel: 0.003 });
      if (!p.props || i === n - 1) continue;
      const top = y + 0.022;
      if (i % 3 === 1) k.lathe('vase', 'ceramic-matte', [[0, 0], [0.035, 0], [0.05, 0.05], [0.035, 0.13], [0.02, 0.17], [0, 0.17]], o + R * 0.3, top, o + R * 0.3, { smooth: 14, segs: k.seg(20, 8), overrides: { color: '#c9bba5' } });
      else if (i % 3 === 2) {
        for (let j = 0; j < 3; j++) k.box('books', ['book-red', 'book-cream', 'book-blue'][j], 0.17, 0.03, 0.13, o + R * 0.32, top + 0.015 + j * 0.031, o + R * 0.28, { r: 0.002, ry: Math.PI / 4 + j * 0.15 });
      } else k.lathe('bowl', 'ceramic-white', [[0, 0], [0.03, 0], [0.06, 0.03], [0.065, 0.05], [0.06, 0.05], [0, 0.01]], o + R * 0.32, top, o + R * 0.32, { segs: k.seg(20, 8) });
    }
    return k.group();
  },
});

/* ------------------------------------------------------ bookcase with doors */

const bookcaseDoors = item({
  id: 'storage-bookcase-doors', category: 'storage', ko: '하부장 책장', en: 'Bookcase with doors', size: [0.92, 2.0, 0.41],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.len('height', '높이', 'Height', 2.0, 1.6, 2.4),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', OPT.handle),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['bookcase', 'bookshelf with doors', 'library cabinet', '책장', '하부장 책장', '문 달린 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p, d = 0.38, low = 0.85, t = 0.02, ud = 0.3;
    addCabinet(k, { w, h: low, d, base: 'plinth', plinth: 0.08, rows: [{ h: 1, n: 2, type: 'door' }], body: p.wood, front: p.wood, handle: p.handle, handleMat: 'metal-brass', top: p.wood, topThick: 0.025, topOverhang: 0.01 });
    // raised field on each door
    const bodyH = low - 0.08 - 0.025;
    for (const s of [-1, 1]) k.box('fronts', p.wood, w / 2 - 0.11, bodyH - 0.12, 0.008, s * w / 4, 0.08 + bodyH / 2, d / 2 + 0.004, { r: 0.004, segs: 2 });
    // open upper case set back
    const uz = -d / 2 + ud / 2, uh = h - low - 0.04;
    for (const s of [-1, 1]) k.box('body', p.wood, t, uh, ud, s * (w / 2 - t / 2), low + uh / 2, uz, { r: 0.002 });
    k.box('body', p.wood, w - 2 * t, uh, 0.01, 0, low + uh / 2, -d / 2 + 0.005, { r: 0 });
    k.box('top', p.wood, w + 0.02, 0.04, ud + 0.02, 0, h - 0.02, uz + 0.01, { r: 0.006, segs: 2 });
    k.box('top', p.wood, w, 0.02, ud + 0.005, 0, h - 0.05, uz + 0.0025, { r: 0.003 });
    const ns = 3, gap = uh / (ns + 1);
    for (let i = 1; i <= ns; i++) k.box('body', p.wood, w - 2 * t, t, ud - 0.012, 0, low + gap * i, uz - 0.004, { r: 0.002 });
    if (p.books) for (let i = 0; i <= ns; i++) {
      const y = low + (i ? gap * i + t / 2 : 0);
      addBooks(k, -w / 2 + t + 0.01, w / 2 - t - 0.01, y, -d / 2 + 0.012, 0.22, 31 + i * 5, { hMax: Math.min(0.3, gap - 0.05), fill: 0.55 + 0.1 * (i % 3) });
    }
    return recentre(k.group());
  },
});

/* -------------------------------------------------------------- glass vitrine */

const vitrine = item({
  id: 'storage-vitrine', category: 'storage', ko: '유리 진열장', en: 'Glass display cabinet', size: [0.8, 1.8, 0.4],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.2),
    P.len('height', '높이', 'Height', 1.8, 1.2, 2.0),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.mat('base', '받침', 'Base', 'wood-oak', 'wood'),
    P.bool('props', '진열품', 'Display items', true),
  ],
  tags: ['vitrine', 'display cabinet', 'glass cabinet', '진열장', '유리 장식장', '쇼케이스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p, d = 0.4, f = 0.02, pl = 0.08;
    k.box('base', p.base, w, pl, d, 0, pl / 2, 0, { r: 0.004 });
    k.box('base', p.base, w, 0.03, d, 0, h - 0.015, 0, { r: 0.004 });
    const y0 = pl, y1 = h - 0.03, fh = y1 - y0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.frame, f, fh, f, sx * (w / 2 - f / 2), y0 + fh / 2, sz * (d / 2 - f / 2), { r: 0.002 });
    for (const y of [y0 + f / 2, y1 - f / 2]) {
      for (const sz of [-1, 1]) k.box('frame', p.frame, w - 2 * f, f, f, 0, y, sz * (d / 2 - f / 2), { r: 0.002 });
      for (const sx of [-1, 1]) k.box('frame', p.frame, f, f, d - 2 * f, sx * (w / 2 - f / 2), y, 0, { r: 0.002 });
    }
    // glass sides + back, two framed glass doors
    for (const sx of [-1, 1]) k.box('glass', 'glass-clear', 0.005, fh - 2 * f, d - 2 * f, sx * (w / 2 - f / 2), y0 + fh / 2, 0, { r: 0 });
    k.box('glass', 'glass-clear', w - 2 * f, fh - 2 * f, 0.005, 0, y0 + fh / 2, -d / 2 + f / 2, { r: 0 });
    const dw = (w - 2 * f) / 2;
    for (const s of [-1, 1]) {
      const cx = s * dw / 2;
      k.panel('frame', p.frame, frameShape(dw - 0.003, fh - 2 * f - 0.003, 0.016), 0.016, cx, y0 + fh / 2, d / 2 - 0.008, { bevel: 0.001 });
      k.box('glass', 'glass-clear', dw - 0.03, fh - 2 * f - 0.03, 0.004, cx, y0 + fh / 2, d / 2 - 0.008, { r: 0 });
      k.box('frame', p.frame, 0.01, 0.16, 0.012, cx - s * (dw / 2 - 0.03), y0 + fh * 0.5, d / 2 + 0.006, { r: 0.003 });
    }
    // glass shelves and display pieces
    const n = 3, gap = (fh - 2 * f) / (n + 1);
    for (let i = 0; i <= n; i++) {
      const y = y0 + f + gap * i;
      if (i) k.box('glass', 'glass-clear', w - 2 * f - 0.006, 0.008, d - 2 * f - 0.006, 0, y, 0, { r: 0 });
      if (!p.props) continue;
      const top = y + (i ? 0.004 : 0);
      const xs = [-w / 4, w / 4];
      if (i === 0) for (const x of xs) k.lathe('ceramics', 'ceramic-white', [[0, 0], [0.05, 0], [0.08, 0.08], [0.06, 0.2], [0.03, 0.26], [0.035, 0.28], [0, 0.28]], x, top, 0, { smooth: 18, segs: k.seg(24, 8) });
      else if (i === 1) {
        for (let j = 0; j < 3; j++) k.cyl('ceramics', 'ceramic-white', 0.11, 0.1, 0.012, -w / 6, top + j * 0.013, 0, { segs: k.seg(24, 8) });
        k.lathe('ceramics2', 'ceramic-matte', [[0, 0], [0.04, 0], [0.07, 0.05], [0.08, 0.08], [0.075, 0.08], [0, 0.015]], w / 5, top, 0, { segs: k.seg(24, 8), overrides: { color: '#6f8a8c' } });
      } else if (i === 2) {
        for (const x of xs) k.lathe('glassware', 'glass-tinted', [[0, 0], [0.03, 0], [0.03, 0.005], [0.004, 0.012], [0.004, 0.09], [0.035, 0.11], [0.04, 0.17], [0.037, 0.17], [0, 0.11]], x, top, 0, { segs: k.seg(20, 8) });
      } else if (gap > 0.25) {
        k.lathe('ceramics2', 'ceramic-matte', [[0, 0], [0.04, 0], [0.065, 0.06], [0.05, 0.15], [0.025, 0.2], [0, 0.2]], 0, top, 0, { smooth: 14, segs: k.seg(24, 8), overrides: { color: '#6f8a8c' } });
      }
    }
    return k.group();
  },
});

/* ------------------------------------------------------- plastic drawer tower */

const drawerTower = item({
  id: 'storage-drawer-tower', category: 'storage', ko: '플라스틱 서랍장', en: 'Plastic drawer tower', size: [0.38, 0.84, 0.42],
  params: [
    P.int('drawers', '서랍 수', 'Drawers', 5, 3, 7),
    P.color('color', '서랍 색', 'Drawer colour', '#dfe4e8'),
    P.bool('casters', '바퀴', 'Casters', true),
  ],
  tags: ['drawer unit', 'plastic drawers', 'storage tower', '플라스틱 서랍장', '서랍 수납함', '리빙박스 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.38, d = 0.42, cast = p.casters ? 0.05 : 0.01, dh = 0.15, n = p.drawers;
    const h = n * dh + 0.035;
    if (p.casters) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('casters', 'plastic-black', 0.02, 0.02, 0.018, sx * (w / 2 - 0.04) - 0.009, 0.02, sz * (d / 2 - 0.04), { rz: -Math.PI / 2, segs: k.seg(12, 6) });
      k.box('casters', 'plastic-black', 0.022, 0.022, 0.03, sx * (w / 2 - 0.04), 0.04, sz * (d / 2 - 0.04), { r: 0.004 });
    } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('casters', 'plastic-black', 0.03, 0.01, 0.03, sx * (w / 2 - 0.03), 0.005, sz * (d / 2 - 0.03), { r: 0.003 });
    // frame: sides, top with a lip, bottom tray
    for (const s of [-1, 1]) k.box('frame', 'plastic-white', 0.012, h, d, s * (w / 2 - 0.006), cast + h / 2, 0, { r: 0.004 });
    k.box('frame', 'plastic-white', w, 0.02, d, 0, cast + h - 0.01, 0, { r: 0.006, segs: 2 });
    k.box('frame', 'plastic-white', w - 0.04, 0.006, d - 0.04, 0, cast + h + 0.002, 0, { r: 0.002 });
    k.box('frame', 'plastic-white', w, 0.015, d, 0, cast + 0.0075, 0, { r: 0.004 });
    k.box('frame', 'plastic-white', w - 0.024, h - 0.03, 0.006, 0, cast + h / 2, -d / 2 + 0.003, { r: 0 });
    for (let i = 0; i < n; i++) {
      const y = cast + 0.015 + i * dh + dh / 2;
      k.box('drawers', 'plastic-grey', w - 0.03, dh - 0.008, d - 0.02, 0, y, 0.008, { r: 0.008, segs: 2, overrides: { color: p.color } });
      // finger grip and label slot
      k.box('grips', 'plastic-grey', 0.12, 0.018, 0.012, 0, y + dh / 2 - 0.03, d / 2 + 0.002, { r: 0.006, segs: 2 });
      k.box('labels', 'paper', 0.07, 0.03, 0.002, 0, y - 0.02, d / 2 - 0.001, { r: 0 });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------- storage bench */

const storageBench = item({
  id: 'storage-bench', category: 'storage', ko: '수납 벤치', en: 'Storage bench', size: [1.0, 0.5, 0.4],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.5),
    P.mat('wood', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('cushion', '방석', 'Cushion', 'fabric-linen-beige', 'fabric'),
    P.mat('baskets', '바구니', 'Baskets', 'rattan', 'wood'),
  ],
  tags: ['storage bench', 'cubby bench', 'entryway bench', '수납 벤치', '현관 벤치', '바구니 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.4, h = 0.42, t = 0.02, pl = 0.05;
    const n = Math.max(2, Math.round(w / 0.36));
    for (const s of [-1, 1]) k.box('body', p.wood, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.003 });
    k.box('body', p.wood, w, t, d, 0, h - t / 2, 0, { r: 0.003 });
    k.box('body', p.wood, w - 2 * t, t, d - 0.02, 0, pl + t / 2, -0.01, { r: 0.002 });
    k.box('body', p.wood, w - 2 * t, pl, 0.018, 0, pl / 2, d / 2 - 0.04, { r: 0.002 });
    k.box('body', p.wood, w - 2 * t, h - pl - 2 * t, 0.008, 0, (h + pl) / 2, -d / 2 + 0.004, { r: 0 });
    const cw = (w - 2 * t - (n - 1) * t) / n;
    for (let i = 1; i < n; i++) k.box('body', p.wood, t, h - pl - 2 * t, d - 0.02, -w / 2 + t + i * (cw + t) - t / 2, (h + pl) / 2, -0.01, { r: 0.002 });
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + t + cw / 2 + i * (cw + t), bh = h - pl - 2 * t - 0.03;
      k.soft('baskets', p.baskets, cw - 0.02, bh, d - 0.05, 0.015, cx, pl + t + bh / 2, 0.005, { flat: 3, puff: 0.004 });
      k.box('slots', 'paint-black-matte', 0.08, 0.022, 0.004, cx, pl + t + bh - 0.04, d / 2 - 0.018, { r: 0.008, segs: 2 });
    }
    k.soft('cushion', p.cushion, w - 0.02, 0.07, d - 0.01, 0.03, 0, h + 0.035, 0, { puff: 0.01, sag: 0.006 });
    return k.group();
  },
});

/* --------------------------------------------------------- utility cupboard */

const utilityCupboard = item({
  id: 'storage-utility-cupboard', category: 'storage', ko: '다용도 청소함', en: 'Utility cupboard', size: [0.61, 1.92, 0.54],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.4, 0.9),
    P.len('height', '높이', 'Height', 1.9, 1.6, 2.2),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '문', 'Door', 'paint-green-matte', 'paint'),
    P.bool('louvres', '루버 통풍구', 'Louvres', true),
    P.pick('handle', '손잡이', 'Handle', 'bar', OPT.handle),
  ],
  tags: ['broom cupboard', 'utility cabinet', 'cleaning closet', '청소함', '다용도장', '빗자루 수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p, d = 0.5;
    addCabinet(k, { w, h, d, base: 'plinth', plinth: 0.08, rows: [{ h: 1, n: 1, type: 'door', hinge: 'left', handleY: 1.05 }], body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-black' });
    k.box('body', p.body, w + 0.01, 0.025, d + 0.01, 0, h + 0.0125, 0, { r: 0.004 });
    if (p.louvres) {
      const zf = d / 2, lw = w - 0.14;
      for (const yc of [0.08 + 0.2, h - 0.25]) {
        const lh = 0.24, ns = Math.floor(lh / 0.028);
        k.panel('fronts', p.front, frameShape(lw + 0.03, lh + 0.03, 0.015), 0.008, -0.01, yc, zf + 0.004, { bevel: 0.001 });
        k.box('vent', 'paint-black-matte', lw, lh, 0.002, -0.01, yc, zf + 0.0012, { r: 0 });
        for (let i = 0; i < ns; i++) k.box('fronts', p.front, lw, 0.028, 0.004, -0.01, yc - lh / 2 + 0.016 + i * (lh - 0.02) / ns, zf + 0.006, { r: 0.001, rx: -0.6 });
      }
    }
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------- tiered shoe rack */

const shoeRack = item({
  id: 'storage-shoe-rack', category: 'storage', ko: '오픈 신발 선반', en: 'Open shoe rack', size: [0.8, 0.66, 0.32],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.2),
    P.int('tiers', '단 수', 'Tiers', 3, 2, 4),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.mat('slats', '선반', 'Slats', 'wood-oak', 'wood'),
    P.bool('shoes', '신발', 'Shoes', true),
  ],
  tags: ['shoe rack', 'open shoe shelf', 'entryway', '신발 선반', '신발 거치대', '현관 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.32, n = p.tiers, sp = 0.2, h = 0.06 + n * sp, rise = 0.05;
    const xs = w / 2 - 0.012, zs = d / 2 - 0.012;
    for (const sx of [-1, 1]) {
      k.bentTube('frame', p.frame, [[sx * xs, 0.005, zs], [sx * xs, h - 0.01, zs], [sx * xs, h - 0.01, -zs], [sx * xs, 0.005, -zs]], 0.011, 0.03, { radial: k.seg(10, 5) });
      for (const sz of [-1, 1]) k.cyl('feet', 'plastic-black', 0.013, 0.013, 0.008, sx * xs, 0, sz * zs, { segs: k.seg(12, 6) });
    }
    const pal = ['fabric-navy', 'fabric-linen-white', 'leather-brown'];
    const rand = rng(n + w);
    for (let i = 0; i < n; i++) {
      const yf = 0.08 + i * sp, a = Math.atan2(rise, d - 0.06);
      // slanted tier: front rod is low, back high, three slats between
      k.rod('frame', p.frame, [-xs, yf, zs - 0.01], [xs, yf, zs - 0.01], 0.008);
      k.rod('frame', p.frame, [-xs, yf + rise, -zs + 0.01], [xs, yf + rise, -zs + 0.01], 0.008);
      for (let j = 0; j < 3; j++) {
        const t = (j + 0.5) / 3, z = zs - 0.03 - t * (d - 0.08), y = yf + rise * (1 - (z + zs - 0.01) / (2 * zs - 0.02)) + 0.012;
        k.box('slats', p.slats, w - 0.04, 0.012, 0.07, 0, y, z, { r: 0.003, rx: a });
      }
      // front stop lip
      k.rod('frame', p.frame, [-xs, yf + 0.03, zs - 0.01], [xs, yf + 0.03, zs - 0.01], 0.005);
      if (!p.shoes) continue;
      const pairs = Math.floor((w - 0.06) / 0.24);
      for (let q = 0; q < pairs; q++) {
        if (rand() < 0.2) continue;
        const cx = -w / 2 + 0.03 + 0.12 + q * ((w - 0.06 - 0.24) / Math.max(1, pairs - 1) || 0) + (pairs === 1 ? (w - 0.3) / 2 : 0);
        const mat = pal[Math.floor(rand() * pal.length)];
        for (const s of [-1, 1]) shoe(k, cx + s * 0.052, yf + rise / 2 + 0.012, -0.005, mat, { rx: a, len: Math.min(0.26, d - 0.05) });
      }
    }
    return k.group();
  },
});

/* -------------------------------------------------------------- boot tray */

const bootTray = item({
  id: 'storage-boot-tray', category: 'storage', ko: '신발 트레이와 장화', en: 'Boot tray with boots', size: [0.75, 0.36, 0.38],
  params: [
    P.len('width', '폭', 'Width', 0.75, 0.5, 1.0),
    P.color('boots', '장화 색', 'Boot colour', '#3f5b44'),
    P.bool('sneakers', '운동화', 'Sneakers', true),
  ],
  tags: ['boot tray', 'rain boots', 'mud tray', '신발 트레이', '장화', '현관 매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.38;
    k.box('tray', 'rubber-black', w, 0.008, d, 0, 0.004, 0, { r: 0.003 });
    k.panel('tray', 'rubber-black', frameShape(w, d, 0.02, 0.02, 0.03), 0.03, 0, 0.015, 0, { rx: -Math.PI / 2, bevel: 0.006 });
    // diamond ridges
    for (let i = 0; i < Math.floor((w - 0.06) / 0.05); i++) k.box('tray', 'rubber-black', 0.012, 0.006, d - 0.06, -w / 2 + 0.05 + i * 0.05, 0.011, 0, { r: 0.002 });
    const paint = { overrides: { color: p.boots } };
    const bx = p.sneakers ? -w / 4 : 0;
    for (const s of [-1, 1]) {
      const x = bx + s * 0.06;
      k.rbox('bootSole', 'rubber-black', 0.1, 0.03, 0.27, 0.012, x, 0.029, 0.0, {});
      k.soft('boots', 'plastic-black', 0.095, 0.08, 0.2, 0.04, x, 0.07, 0.03, { puff: 0.01, flat: 2, ...paint });
      k.lathe('boots', 'plastic-black', [[0.055, 0.03], [0.054, 0.15], [0.058, 0.32], [0.06, 0.34], [0.052, 0.34], [0.05, 0.32], [0.046, 0.08], [0, 0.07]], x, 0.0, -0.05, { segs: k.seg(20, 8), scale: [0.9, 1, 1.15], ...paint });
    }
    if (p.sneakers) for (const s of [-1, 1]) shoe(k, w / 4 + s * 0.055, 0.014, 0.0, 'fabric-linen-white', { sole: 'rubber-black' });
    return k.group();
  },
});

/* ------------------------------------------------------------- key cabinet */

const keyCabinet = item({
  id: 'storage-key-cabinet', category: 'storage', ko: '열쇠 보관함', en: 'Key cabinet', placement: 'wall', elevation: 1.4, size: [0.32, 0.38, 0.1],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.bool('glass', '유리 문', 'Glass door', true),
    P.bool('keys', '열쇠', 'Keys', true),
  ],
  tags: ['key cabinet', 'key box', 'key holder', '열쇠함', '키 박스', '열쇠 보관함'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.3, h = 0.36, d = 0.06, t = 0.012;
    for (const s of [-1, 1]) k.box('body', p.wood, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.002 });
    for (const y of [t / 2, h - t / 2]) k.box('body', p.wood, w - 2 * t, t, d, 0, y, 0, { r: 0.002 });
    k.box('body', p.wood, w - 2 * t, h - 2 * t, 0.006, 0, h / 2, -d / 2 + 0.003, { r: 0 });
    // crown on top
    k.box('body', p.wood, w + 0.016, 0.02, d + 0.016, 0, h + 0.01, 0.0, { r: 0.004, segs: 2 });
    const zf = d / 2 + 0.006;
    if (p.glass) {
      k.panel('door', p.wood, frameShape(w, h, 0.03), 0.012, 0, h / 2, zf, { bevel: 0.002 });
      k.box('glass', 'glass-clear', w - 0.05, h - 0.05, 0.003, 0, h / 2, zf - 0.002, { r: 0 });
    } else {
      k.box('door', p.wood, w, h, 0.012, 0, h / 2, zf, { r: 0.002 });
      k.box('door', p.wood, w - 0.07, h - 0.07, 0.006, 0, h / 2, zf + 0.007, { r: 0.004 });
    }
    k.lathe('knob', 'metal-brass', [[0, 0], [0.006, 0], [0.005, 0.01], [0.01, 0.016], [0.01, 0.022], [0, 0.024]], w / 2 - 0.022, h / 2, zf + 0.006, { rx: Math.PI / 2, segs: k.seg(12, 6) });
    if (p.keys) {
      const zb = -d / 2 + 0.006;
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 0.055 + i * 0.063, y = h - 0.07 - r * 0.15;
        k.bentTube('hooks', 'metal-brass', [[x, y, zb], [x, y, zb + 0.025], [x, y + 0.01, zb + 0.03]], 0.0018, 0.005, { radial: k.seg(6, 4) });
        if ((i + r) % 3 === 2) continue;
        k.add('keys', 'metal-steel', new THREE.TorusGeometry(0.009, 0.0013, k.seg(4, 3), k.seg(12, 6)).translate(x, y - 0.006, zb + 0.022));
        k.box('keys', 'metal-steel', 0.012, 0.045, 0.002, x, y - 0.04, zb + 0.022, { r: 0.0005 });
        k.rbox('fobs', 'leather-cognac', 0.022, 0.04, 0.004, 0.006, x + 0.014, y - 0.035, zb + 0.026, { rz: 0.15 });
      }
    }
    return recentre(k.group());
  },
});

/* --------------------------------------------------------------- hook rail */

const hookRail = item({
  id: 'storage-hook-rail', category: 'storage', ko: '벽걸이 후크 레일', en: 'Wall peg rail', placement: 'wall', elevation: 1.1, size: [0.94, 0.63, 0.15],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.4),
    P.int('pegs', '고리 수', 'Pegs', 5, 3, 8),
    P.mat('wood', '나무', 'Wood', 'wood-ash', 'wood'),
    P.bool('items', '걸린 물건', 'Hanging items', true),
  ],
  tags: ['peg rail', 'shaker pegs', 'wall hooks', '후크 레일', '벽 고리', '쉐이커 페그'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, n = p.pegs, ry = p.items ? 0.52 : 0.045, zb = 0;
    k.box('rail', p.wood, w, 0.09, 0.02, 0, ry, zb + 0.01, { r: 0.006, segs: 2 });
    const xs = (i) => -w / 2 + (w / n) * (i + 0.5), zf = zb + 0.02;
    for (let i = 0; i < n; i++) k.lathe('pegs', p.wood, [[0, 0], [0.011, 0], [0.009, 0.03], [0.008, 0.06], [0.014, 0.07], [0.016, 0.078], [0.012, 0.085], [0, 0.087]], xs(i), ry, zf, { rx: Math.PI / 2, segs: k.seg(14, 6), smooth: 10 });
    if (p.items && n >= 3) {
      // canvas tote on the first peg
      const bx = xs(0) + 0.02, bag = pillowGeo(0.32, 0.36, 0.05, k.seg(12, 5), { seam: 0.008, pinch: 0.02 });
      bag.translate(bx, ry - 0.34, zf + 0.04);
      k.add('bag', 'fabric-linen-beige', bag);
      for (const s of [-1, 1]) k.tube('bag', 'fabric-linen-beige', [[bx + s * 0.09, ry - 0.17, zf + 0.04], [bx + s * 0.05, ry - 0.06, zf + 0.04], [bx, ry + 0.006, zf + 0.045]], 0.008, { radial: k.seg(6, 4), segs: k.seg(12, 5) });
      // scarf folded over the middle peg
      const mx = xs(Math.floor(n / 2));
      k.rbox('scarf', 'fabric-mustard', 0.16, 0.025, 0.04, 0.012, mx, ry + 0.004, zf + 0.05, {});
      k.rbox('scarf', 'fabric-mustard', 0.075, 0.46, 0.012, 0.005, mx - 0.04, ry - 0.23, zf + 0.06, { rz: 0.04 });
      k.rbox('scarf', 'fabric-mustard', 0.075, 0.38, 0.012, 0.005, mx + 0.04, ry - 0.19, zf + 0.072, { rz: -0.05 });
      // hat on the last peg, crown towards the wall
      const hx = xs(n - 1);
      k.lathe('hat', 'fabric-wool-charcoal', [[0, 0.11], [0.06, 0.105], [0.075, 0.07], [0.08, 0.012], [0.15, 0.006], [0.155, 0], [0.15, -0.004], [0.08, 0.002], [0.074, 0.06], [0.0, 0.1]], hx, ry - 0.05, zf + 0.12, { rx: -Math.PI / 2, segs: k.seg(28, 8) });
      k.lathe('hat', 'leather-black', [[0.081, 0.012], [0.08, 0.03], [0.078, 0.03], [0.079, 0.012]], hx, ry - 0.05, zf + 0.12, { rx: -Math.PI / 2, segs: k.seg(28, 8) });
    }
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------- entryway console */

const entryConsole = item({
  id: 'storage-entry-console', category: 'storage', ko: '현관 콘솔(바구니)', en: 'Entryway console with baskets', size: [1.0, 1.3, 0.35],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.4),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.mat('top', '상판', 'Top', 'wood-oak', 'wood'),
    P.bool('props', '소품', 'Props', true),
  ],
  tags: ['console table', 'entryway table', 'hall console', '콘솔', '현관 콘솔', '수납 콘솔'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.35, h = 0.8, tt = 0.03, f = 0.022;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.frame, f, h - tt, f, sx * (w / 2 - f / 2 - 0.01), (h - tt) / 2, sz * (d / 2 - f / 2 - 0.01), { r: 0.002 });
    for (const y of [h - tt - 0.03, 0.12]) {
      for (const sz of [-1, 1]) k.box('frame', p.frame, w - 0.02 - 2 * f, f, f, 0, y, sz * (d / 2 - f / 2 - 0.01), { r: 0.002 });
      for (const sx of [-1, 1]) k.box('frame', p.frame, f, f, d - 0.02 - 2 * f, sx * (w / 2 - f / 2 - 0.01), y, 0, { r: 0.002 });
    }
    k.box('top', p.top, w, tt, d, 0, h - tt / 2, 0, { r: 0.004, segs: 2 });
    k.box('top', p.top, w - 0.03, 0.018, d - 0.03, 0, 0.12 + f / 2 + 0.009, 0, { r: 0.003 });
    // two woven baskets on the lower shelf
    const by = 0.12 + f / 2 + 0.018, bw = (w - 0.12) / 2 - 0.02;
    for (const s of [-1, 1]) {
      k.soft('baskets', 'rattan', bw, 0.26, d - 0.06, 0.03, s * (bw / 2 + 0.03), by + 0.13, 0, { flat: 3, puff: 0.006 });
      k.box('baskets', 'leather-cognac', 0.07, 0.015, 0.006, s * (bw / 2 + 0.03), by + 0.21, (d - 0.06) / 2 + 0.006, { r: 0.004, overrides: undefined });
    }
    if (p.props) {
      const y = h;
      k.slab('tray', 'wood-walnut', roundRect(0.3, 0.18, 0.04), 0.015, y, { x: -w / 4, z: 0, bevel: 0.004 });
      k.lathe('bowl', 'ceramic-matte', [[0, 0], [0.03, 0], [0.06, 0.03], [0.07, 0.05], [0.066, 0.05], [0, 0.01]], -w / 4 - 0.06, y + 0.015, 0, { segs: k.seg(24, 8), overrides: { color: '#c9bba5' } });
      k.lathe('vase', 'ceramic-white', [[0, 0], [0.045, 0], [0.06, 0.08], [0.04, 0.2], [0.025, 0.26], [0.03, 0.28], [0, 0.28]], w / 4, y, -0.02, { smooth: 16, segs: k.seg(20, 8) });
      for (let j = 0; j < 3; j++) k.rod('stems', 'plant-stem', [w / 4, y + 0.2, -0.02], [w / 4 + (j - 1) * 0.08, y + 0.5 - j * 0.03, -0.02 + (j - 1) * 0.02], 0.003, { segs: 4 });
      for (let j = 0; j < 9; j++) {
        const g = new THREE.SphereGeometry(0.025, k.seg(8, 4), k.seg(6, 3));
        const jj = j % 3, t = 0.6 + Math.floor(j / 3) * 0.17;
        g.scale(1, 0.4, 0.7).translate(w / 4 + (jj - 1) * 0.08 * t, y + 0.2 + (0.3 - jj * 0.03) * t, -0.02 + (jj - 1) * 0.02 * t);
        k.add('leaves', 'plant-leaf', g);
      }
    }
    return k.group();
  },
});

/* ------------------------------------------------------------- rolling cart */

const rollingCart = item({
  id: 'storage-rolling-cart', category: 'storage', ko: '3단 트롤리', en: 'Rolling utility cart', size: [0.5, 0.86, 0.36],
  params: [
    P.color('color', '색', 'Colour', '#8fb3a6'),
    P.bool('props', '소품', 'Props', true),
  ],
  tags: ['rolling cart', 'trolley', 'utility cart', '트롤리', '3단 카트', '이동식 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.44, d = 0.34, rim = 0.06, paint = { overrides: { color: p.color } };
    const ys = [0.12, 0.38, 0.66];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.015), z = sz * (d / 2 - 0.015);
      k.cyl('frame', 'metal-white', 0.009, 0.009, ys[2] + rim - 0.06, x, 0.06, z, { segs: k.seg(12, 6), ...paint });
      k.sphere('casters', 'plastic-black', 0.025, x, 0.025, z, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
      k.cyl('casters', 'plastic-black', 0.012, 0.012, 0.02, x, 0.045, z, { segs: k.seg(10, 5) });
    }
    for (const y of ys) {
      k.box('trays', 'metal-white', w - 0.004, 0.004, d - 0.004, 0, y + 0.002, 0, { r: 0.0015, ...paint });
      for (const s of [-1, 1]) {
        k.box('trays', 'metal-white', w, rim, 0.003, 0, y + rim / 2, s * (d / 2 - 0.0015), { r: 0.001, ...paint });
        k.box('trays', 'metal-white', 0.003, rim, d, s * (w / 2 - 0.0015), y + rim / 2, 0, { r: 0.001, ...paint });
      }
      // hand-hole slots in the long rims
      for (const s of [-1, 1]) k.box('slots', 'paint-black-matte', 0.08, 0.016, 0.001, 0, y + rim - 0.02, s * (d / 2 + 0.0005), { r: 0 });
    }
    k.bentTube('frame', 'metal-white', [[w / 2 - 0.015, ys[2] + rim - 0.01, -0.09], [w / 2 + 0.04, ys[2] + rim + 0.04, -0.09], [w / 2 + 0.04, ys[2] + rim + 0.04, 0.09], [w / 2 - 0.015, ys[2] + rim - 0.01, 0.09]], 0.008, 0.02, { radial: k.seg(8, 5), ...paint });
    if (p.props) {
      for (const [x, h, c] of [[-0.12, 0.14, '#e6dccb'], [-0.03, 0.18, '#d5b48a'], [0.09, 0.12, '#e6dccb']]) {
        k.cyl('jars', 'ceramic-matte', 0.04, 0.04, h, x, ys[2] + 0.004, 0, { segs: k.seg(16, 6), overrides: { color: c } });
        k.cyl('lidsWood', 'wood-ash', 0.041, 0.041, 0.015, x, ys[2] + 0.004 + h, 0, { segs: k.seg(16, 6) });
      }
      for (let j = 0; j < 3; j++) k.cyl('rolls', 'paper', 0.055, 0.055, 0.1, -0.13 + j * 0.12, ys[1] + 0.004, 0, { segs: k.seg(16, 6) });
    }
    return recentre(k.group());
  },
});

/* ----------------------------------------------------------- magazine files */

const magazineFiles = item({
  id: 'storage-magazine-files', category: 'storage', ko: '파일 박스', en: 'Magazine files', placement: 'surface', size: [0.34, 0.32, 0.25],
  params: [
    P.int('count', '개수', 'Files', 4, 2, 6),
    P.mat('board', '소재', 'Material', 'plywood', 'wood'),
    P.bool('papers', '서류', 'Papers', true),
  ],
  tags: ['magazine file', 'file box', 'desk organizer', '파일 박스', '서류 정리함', '잡지꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const fw = 0.08, D = 0.25, H = 0.32, t = 0.005;
    const prof = new THREE.Shape();
    // side profile: x = depth (front −, back +), y = height; tall back, low front, slanted cut
    prof.moveTo(-D / 2, 0); prof.lineTo(D / 2, 0); prof.lineTo(D / 2, H); prof.lineTo(D / 2 - 0.06, H);
    prof.quadraticCurveTo(-D / 2 + 0.04, 0.17, -D / 2 + 0.01, 0.1); prof.lineTo(-D / 2, 0.1); prof.lineTo(-D / 2, 0);
    const n = p.count, pitch = fw + 0.004;
    const mags = ['book-red', 'book-blue', 'paper', 'book-green', 'paper', 'book-cream'];
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * pitch) / 2 + i * pitch;
      for (const s of [-1, 1]) k.panel('files', p.board, prof, t, x + s * (fw / 2 - t / 2), 0, 0, { ry: Math.PI / 2, bevel: 0.0015 });
      k.box('files', p.board, fw - 2 * t, t, D, x, t / 2, 0, { r: 0.001 });
      k.box('files', p.board, fw - 2 * t, H, t, x, H / 2, -D / 2 + t / 2, { r: 0.001 });
      k.box('files', p.board, fw - 2 * t, 0.1, t, x, 0.05, D / 2 - t / 2, { r: 0.001 });
      // finger hole on the back
      k.box('holes', 'paint-black-matte', 0.03, 0.012, 0.001, x, H - 0.04, -D / 2 - 0.0006, { r: 0 });
      if (p.papers) {
        const mh = 0.28 - (i % 3) * 0.02;
        k.box('papers', mags[i % mags.length], fw - 2 * t - 0.012, mh, D - 2 * t - 0.03, x, t + mh / 2, -0.005, { r: 0.002 });
        k.box('pages', 'paper', fw - 2 * t - 0.018, 0.003, D - 2 * t - 0.035, x, t + mh + 0.0005, -0.005, { r: 0 });
      }
    }
    return k.group();
  },
});

/* ------------------------------------------------------------- garment rack */

function garmentShape(kind) {
  const s = new THREE.Shape();
  if (kind === 'shirt') {
    s.moveTo(-0.05, 0); s.lineTo(-0.19, -0.045); s.lineTo(-0.22, -0.1); s.lineTo(-0.235, -0.58); s.lineTo(-0.19, -0.585);
    s.lineTo(-0.17, -0.22); s.lineTo(-0.17, -0.72); s.lineTo(0.17, -0.72); s.lineTo(0.17, -0.22); s.lineTo(0.19, -0.585);
    s.lineTo(0.235, -0.58); s.lineTo(0.22, -0.1); s.lineTo(0.19, -0.045); s.lineTo(0.05, 0); s.quadraticCurveTo(0, -0.04, -0.05, 0);
  } else if (kind === 'dress') {
    s.moveTo(-0.06, 0); s.lineTo(-0.15, -0.03); s.lineTo(-0.14, -0.3); s.lineTo(-0.24, -0.98); s.lineTo(0.24, -0.98); s.lineTo(0.14, -0.3);
    s.lineTo(0.15, -0.03); s.lineTo(0.06, 0); s.quadraticCurveTo(0, -0.08, -0.06, 0);
  } else {
    s.moveTo(-0.06, 0); s.lineTo(-0.2, -0.05); s.lineTo(-0.225, -0.12); s.lineTo(-0.23, -0.95); s.lineTo(0.23, -0.95);
    s.lineTo(0.225, -0.12); s.lineTo(0.2, -0.05); s.lineTo(0.06, 0); s.quadraticCurveTo(0, -0.05, -0.06, 0);
  }
  return s;
}

const garmentRack = item({
  id: 'storage-garment-rack', category: 'storage', ko: '행거(옷 포함)', en: 'Garment rack', size: [1.2, 1.62, 0.48],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.mat('shelf', '하부 선반', 'Base shelf', 'wood-oak', 'wood'),
    P.int('clothes', '옷 수', 'Garments', 7, 0, 12),
  ],
  tags: ['garment rack', 'clothes rail', 'hanger rack', '행거', '옷걸이 행거', '스탠드 행거'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, h = 1.6, xs = w / 2 - 0.02, rail = h - 0.015;
    k.bentTube('frame', p.frame, [[-xs, 0.04, 0], [-xs, rail, 0], [xs, rail, 0], [xs, 0.04, 0]], 0.014, 0.05, { radial: k.seg(12, 6) });
    for (const s of [-1, 1]) {
      k.rod('frame', p.frame, [s * xs, 0.03, -d / 2 + 0.015], [s * xs, 0.03, d / 2 - 0.015], 0.014, { segs: k.seg(12, 6) });
      for (const z of [-1, 1]) k.sphere('feet', 'rubber-black', 0.018, s * xs, 0.018, z * (d / 2 - 0.018), { segs: k.seg(10, 5), rings: k.seg(6, 4) });
      k.cyl('frame', p.frame, 0.02, 0.02, 0.05, s * xs, 0.015, 0, { segs: k.seg(12, 6) });
    }
    // slatted base shelf on two rods
    for (const z of [-1, 1]) k.rod('frame', p.frame, [-xs, 0.15, z * 0.15], [xs, 0.15, z * 0.15], 0.008, { segs: k.seg(10, 5) });
    for (let i = 0; i < 4; i++) k.box('shelf', p.shelf, w - 0.08, 0.016, 0.075, 0, 0.166, -0.135 + i * 0.09, { r: 0.003 });
    cardBox(k, 0.34, 0.2, 0.3, -w / 4, 0.174, 0, { label: true });
    shoe(k, w / 4 - 0.055, 0.174, 0, 'leather-cognac', { sole: 'leather-black' });
    shoe(k, w / 4 + 0.055, 0.174, 0, 'leather-cognac', { sole: 'leather-black' });
    // hangers with garments, seen edge-on along the rail
    const n = p.clothes, pal = ['fabric-linen-white', 'fabric-navy', 'fabric-terracotta'];
    const kinds = ['shirt', 'coat', 'shirt', 'dress', 'shirt', 'coat'];
    const span = w - 0.2;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
      k.tube('hangers', 'metal-chrome', [[x, rail - 0.05, 0], [x, rail - 0.01, 0], [x, rail + 0.02, 0.012], [x, rail + 0.022, -0.01], [x, rail + 0.005, -0.02]], 0.0022, { radial: k.seg(6, 4), segs: k.seg(12, 5) });
      k.rod('hangerWood', 'wood-ash', [x, rail - 0.05, 0], [x, rail - 0.09, -0.2], 0.007, { segs: k.seg(8, 4) });
      k.rod('hangerWood', 'wood-ash', [x, rail - 0.05, 0], [x, rail - 0.09, 0.2], 0.007, { segs: k.seg(8, 4) });
      const kind = kinds[i % kinds.length];
      k.panel('clothes', pal[i % pal.length], garmentShape(kind), kind === 'coat' ? 0.06 : 0.035, x, rail - 0.055, 0, { ry: Math.PI / 2, bevel: 0.012, curveSegs: 6 });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------ storage ottoman */

const storageOttoman = item({
  id: 'storage-ottoman', category: 'storage', ko: '수납 스툴', en: 'Storage ottoman', size: [0.46, 0.45, 0.46],
  params: [
    P.pick('shape', '모양', 'Shape', 'cube', [['cube', '사각', 'Cube'], ['round', '원형', 'Round']]),
    P.len('size', '크기', 'Size', 0.45, 0.35, 0.6),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-green', 'fabric'),
    P.mat('feet', '다리', 'Feet', 'metal-brass', 'metal'),
  ],
  tags: ['storage ottoman', 'pouf', 'footstool', '수납 스툴', '수납 오토만', '발받침'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, foot = 0.04, bh = 0.32, lh = 0.09;
    if (p.shape === 'cube') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', p.feet, 0.014, 0.01, foot, sx * (s / 2 - 0.04), 0, sz * (s / 2 - 0.04), { segs: k.seg(12, 6) });
      k.soft('body', p.fabric, s, bh, s, 0.025, 0, foot + bh / 2, 0, { puff: 0.006, flat: 4 });
      k.soft('lid', p.fabric, s + 0.008, lh, s + 0.008, 0.035, 0, foot + bh + lh / 2 + 0.002, 0, { puff: 0.014, flat: 5 });
      const hw = s / 2 + 0.004, r = 0.03, y = foot + bh + 0.006;
      k.bentTube('piping', p.fabric, [[-hw + r, y, -hw], [hw, y, -hw], [hw, y, hw], [-hw, y, hw], [-hw, y, -hw], [-hw + r + 0.001, y, -hw]], 0.006, r, { radial: k.seg(8, 4) });
      // tufting buttons
      for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) k.sphere('buttons', p.fabric, 0.009, bx * s * 0.22, foot + bh + lh + 0.004 - (bx || bz ? 0.004 : 0.008), bz * s * 0.22, { segs: k.seg(8, 5), rings: k.seg(6, 3), scale: [1, 0.5, 1] });
    } else {
      const r = s / 2;
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; k.cyl('feet', p.feet, 0.014, 0.01, foot, Math.cos(a) * (r - 0.05), 0, Math.sin(a) * (r - 0.05), { segs: k.seg(12, 6) }); }
      k.lathe('body', p.fabric, [[0, foot], [r - 0.03, foot], [r - 0.008, foot + 0.01], [r, foot + 0.04], [r, foot + bh - 0.01], [r - 0.004, foot + bh], [0, foot + bh]], 0, 0, 0, { segs: k.seg(40, 12) });
      k.lathe('lid', p.fabric, [[0, foot + bh + 0.002], [r + 0.004, foot + bh + 0.002], [r + 0.008, foot + bh + 0.03], [r - 0.004, foot + bh + lh - 0.01], [r * 0.6, foot + bh + lh + 0.006], [0, foot + bh + lh + 0.004]], 0, 0, 0, { segs: k.seg(40, 12), smooth: 12 });
      k.add('piping', p.fabric, new THREE.TorusGeometry(r + 0.004, 0.006, k.seg(8, 4), k.seg(40, 12)).rotateX(Math.PI / 2).translate(0, foot + bh + 0.006, 0));
      k.sphere('buttons', p.fabric, 0.012, 0, foot + bh + lh, 0, { segs: k.seg(8, 5), rings: k.seg(6, 3), scale: [1, 0.5, 1] });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------- metal locker */

const locker = item({
  id: 'storage-locker', category: 'storage', ko: '철제 사물함', en: 'Metal locker', size: [0.9, 1.81, 0.48],
  params: [
    P.int('cols', '열 수', 'Columns', 3, 1, 4),
    P.int('tiers', '단 수', 'Tiers', 1, 1, 3),
    P.len('height', '높이', 'Height', 1.8, 1.2, 2.0),
    P.color('color', '색', 'Colour', '#4f6d7a'),
  ],
  tags: ['locker', 'metal locker', 'gym locker', '사물함', '철제 락커', '락커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const cw = 0.3, w = p.cols * cw, h = p.height, d = 0.45, pl = 0.1;
    const paint = { overrides: { color: p.color } };
    k.box('plinth', 'paint-black-matte', w - 0.02, pl, d - 0.04, 0, pl / 2, -0.01, { r: 0.002 });
    k.box('body', 'paint-grey-matte', w, h - pl, d - 0.015, 0, pl + (h - pl) / 2, -0.0075, { r: 0.004, ...paint });
    const th = (h - pl - 0.02) / p.tiers;
    for (let c = 0; c < p.cols; c++) for (let t = 0; t < p.tiers; t++) {
      const x = -w / 2 + cw * (c + 0.5), y0 = pl + 0.01 + t * th, zf = d / 2 - 0.0075;
      k.box('doors', 'paint-grey-matte', cw - 0.012, th - 0.012, 0.012, x, y0 + th / 2, zf, { r: 0.003, ...paint });
      // vent slots near the top (and bottom on tall doors)
      const rows = [y0 + th - 0.06];
      if (th > 0.9) rows.push(y0 + 0.08);
      for (const vy of rows) for (let r = 0; r < 3; r++) for (let q = 0; q < 2; q++) k.box('vents', 'paint-black-matte', 0.09, 0.006, 0.002, x + (q - 0.5) * 0.11, vy - r * 0.015, zf + 0.0065, { r: 0 });
      // lever handle + name plate
      const hy = y0 + Math.min(th / 2, 1.05 - y0 > 0.1 ? th / 2 : th / 2);
      k.box('handles', 'metal-steel', 0.026, 0.07, 0.012, x + cw / 2 - 0.045, hy, zf + 0.012, { r: 0.004 });
      k.box('handles', 'metal-steel', 0.012, 0.05, 0.03, x + cw / 2 - 0.045, hy - 0.02, zf + 0.025, { r: 0.004 });
      k.box('plates', 'metal-aluminium', 0.07, 0.03, 0.002, x, y0 + th - 0.12, zf + 0.007, { r: 0.0008 });
    }
    // sloped dust top
    k.box('body', 'paint-grey-matte', w + 0.004, 0.012, d - 0.01, 0, h + 0.004, -0.005, { r: 0.003, ...paint });
    return recentre(k.group());
  },
});

/* ------------------------------------------------------- wall-hung cabinet */

const wallCabinet = item({
  id: 'storage-wall-cabinet', category: 'storage', ko: '벽걸이 수납장', en: 'Wall-hung cabinet', placement: 'wall', elevation: 1.45, size: [0.8, 0.6, 0.34],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.4, 1.6),
    P.len('height', '높이', 'Height', 0.6, 0.35, 0.9),
    P.pick('style', '문 형태', 'Front', 'doors', [['doors', '여닫이 문', 'Hinged doors'], ['glass', '유리 문', 'Glass doors'], ['flap', '플랩 도어', 'Lift-up flap']]),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '문', 'Fronts', 'wood-oak', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', OPT.handle),
  ],
  tags: ['wall cabinet', 'hanging cabinet', 'wall cupboard', '벽걸이 수납장', '상부장', '벽 수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p, d = 0.32;
    if (p.style === 'flap') {
      addCabinet(k, { w, h, d, base: 'none', rows: [{ h: 1, n: 1, type: 'door' }], body: p.body, front: p.front, handle: 'none' });
      if (p.handle !== 'none') addHandle(k, 'handles', 'metal-black', p.handle, 0, p.handle === 'edge' ? 0.012 : 0.05, d / 2, { len: Math.min(0.4, w * 0.4) });
    } else {
      const n = Math.max(1, Math.round(w / 0.42));
      addCabinet(k, { w, h, d, base: 'none', rows: [{ h: 1, n, type: p.style === 'glass' ? 'glass' : 'door', handleY: 0.04 + Math.min(0.2, h * 0.35) / 2 }], body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-black' });
      if (p.style === 'glass') {
        const shelfY = h / 2;
        k.box('body', p.body, w - 0.04, 0.016, d - 0.05, 0, shelfY, -0.02, { r: 0.001 });
        for (let i = 0; i < Math.floor(w / 0.12); i++) k.lathe('cups', 'ceramic-white', [[0, 0], [0.03, 0], [0.04, 0.09], [0.037, 0.09], [0, 0.01]], -w / 2 + 0.07 + i * 0.12, shelfY + 0.008, -0.03, { segs: k.seg(16, 6) });
      }
    }
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------- cardboard boxes */

const cardboardBoxes = item({
  id: 'storage-cardboard-boxes', category: 'storage', ko: '이삿짐 박스 더미', en: 'Moving box stack', size: [1.0, 0.72, 0.42],
  params: [
    P.int('count', '박스 수', 'Boxes', 4, 1, 6),
    P.bool('labels', '라벨', 'Labels', true),
  ],
  tags: ['cardboard box', 'moving boxes', 'packing box', '박스', '이삿짐 박스', '종이 상자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = [[0.5, 0.38, 0.4], [0.45, 0.32, 0.36], [0.4, 0.34, 0.38], [0.38, 0.26, 0.3], [0.32, 0.24, 0.28], [0.3, 0.2, 0.26]];
    // [x, z, index of the box it rests on (-1 = floor)]
    const slots = [[-0.255, 0, -1], [0.235, 0.01, -1], [-0.24, 0, 0], [0.22, 0.02, 1], [-0.25, 0, 2], [0.62, 0, -1]];
    const top = [];
    for (let i = 0; i < p.count; i++) {
      const [w, h, d] = S[i];
      const [x, z, on] = slots[i];
      const y = on < 0 ? 0 : top[on] + 0.001;
      top[i] = y + h;
      cardBox(k, w, h, d, x, y, z, { label: p.labels });
      // hand holes on the ends
      for (const s of [-1, 1]) {
        const g = new THREE.CapsuleGeometry(0.015, 0.06, k.seg(4, 2), k.seg(10, 6)).rotateZ(Math.PI / 2).scale(1, 1, 0.2).rotateY(Math.PI / 2);
        g.translate(x + s * (w / 2 + 0.0008), y + h - 0.07, z);
        k.add('holes', 'paint-black-matte', g);
      }
    }
    return recentre(k.group());
  },
});

/* ---------------------------------------------------------------- variants */

const sh = base('shelving-unit'), cu = base('cube-storage'), sc = base('shoe-cabinet'), cl = base('built-in-closet'), cr = base('coat-rack');

const VARIANTS = [
  variant(sh, 'walnut', '원목 월넛 선반장', 'Walnut wood shelving', { style: 'wood', board: 'wood-walnut' }, { tags: ['walnut', '월넛', 'wood shelf', '원목 선반'] }),
  variant(sh, 'low-white', '화이트 와이드 낮은 선반', 'Low white wide shelving', { width: 1.6, height: 1.0, shelves: 3, frame: 'metal-white', board: 'wood-white' }, { tags: ['low shelf', '낮은 선반', 'white', '화이트'] }),
  variant(cu, '4x4', '4×4 큐브 수납장', 'Cube storage 4×4', { cols: 4, rows: 4, wood: 'wood-oak' }, { tags: ['4x4', '16칸', 'large cube', '대형 큐브'] }),
  variant(cu, '3x1', '3칸 낮은 큐브 수납장', 'Low cube storage 3×1', { cols: 3, rows: 1, wood: 'wood-ash', binFabric: 'fabric-linen-beige' }, { tags: ['low cube', '낮은 수납장', 'bench', '3칸'] }),
  variant(sc, 'tall', '키큰 신발장', 'Tall shoe cabinet', { width: 1.2, height: 2.1, middleNiche: true, front: 'wood-walnut', handle: 'bar' }, { tags: ['tall', '키큰', '전신 신발장', 'full height'] }),
  variant(cl, 'grey-3door', '그레이 3문 붙박이장', 'Grey 3-door closet', { width: 1.8, doors: 3, front: 'paint-grey-matte', handle: 'bar' }, { tags: ['grey', '그레이', '3문', '3-door'] }),
  variant(cr, 'black', '블랙 스탠드 옷걸이', 'Black coat stand', { wood: 'wood-black', hooks: 'metal-black' }, { tags: ['black', '블랙', 'modern', '모던'] }),
  variant(slidingWardrobe, 'mirror', '거울 슬라이딩 옷장', 'Mirrored sliding wardrobe', { mirror: true, doors: 3, width: 2.7 }, { tags: ['mirror', '거울', '3문', 'mirrored'] }),
  variant(garageRack, 'black', '블랙 4단 앵글 선반', 'Black 4-tier steel rack', { frame: 'metal-black', levels: 4, height: 1.5 }, { tags: ['black', '블랙', '4단', '4-tier'] }),
  variant(locker, 'two-tier', '2단 사물함', 'Two-tier locker', { cols: 2, tiers: 2, color: '#b8bcbf' }, { tags: ['two tier', '2단', 'school locker', '학교 사물함'] }),
  variant(rollingCart, 'black', '블랙 트롤리', 'Black rolling cart', { color: '#2b2b2d' }, { tags: ['black', '블랙', 'kitchen cart', '주방 트롤리'] }),
  variant(storageOttoman, 'round-rose', '원형 로즈 수납 스툴', 'Round rose storage pouf', { shape: 'round', fabric: 'fabric-velvet-rose', feet: 'metal-gold' }, { tags: ['round', '원형', 'pouf', '푸프'] }),
];

export const ITEMS = [
  slidingWardrobe, blanketChest, steamerTrunk, basketSet, crateStack, pegboard, hallTree, umbrellaStand, garageRack, toolChest,
  ladderShelf, wallCubes, floatingShelves, cornerShelf, bookcaseDoors, vitrine, drawerTower, storageBench, utilityCupboard, shoeRack,
  bootTray, keyCabinet, hookRail, entryConsole, rollingCart, magazineFiles, garmentRack, storageOttoman, locker, wallCabinet, cardboardBoxes,
  ...VARIANTS,
];

void T;
