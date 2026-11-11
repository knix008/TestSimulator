// Accessories (소품) category, part 1: everyday props that dress a scene — entry and wardrobe things
// (key bowl, key rack, bags, suitcase, hat, shoes, umbrella, hangers, folded clothes), living-room
// tabletop props (remotes, coasters, magazines, board games, puzzle, album, snow globe, music box,
// binoculars, camera, headphones, records, radio, tissues, perfume, trinket dish), kitchen-counter
// props (mugs, moka pot, French press, grinder, pour-over, mills, mortar, cheese and bread boards,
// jars, eggs, cookbook stand, flasks, pitcher, cocktail set, lunch box) and bathroom / beauty props.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build); sizes are
// measured from the default build (mk). See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, T, roundRect, rng, transformAdded } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI, TAU = PI * 2;
export const ACC = 'accessories';
export const C = (color) => ({ overrides: { color } });
/** An accessories entry: surface placement unless stated. */
export const acc = (def) => mk({ category: ACC, placement: 'surface', ...def });

/** Thin-walled open vessel (cup, jar, glass) as a lathe, bottom at y. */
export function vessel(k, role, mat, r, h, x = 0, y = 0, z = 0, { wall = 0.004, taper = 1, foot = 0.9, o = {} } = {}) {
  const rt = r * taper;
  k.lathe(role, mat, [[0, 0], [r * foot, 0], [r, 0.006], [rt, h], [rt - wall, h], [r - wall, wall * 1.5], [0, wall * 1.5]], x, y, z, { segs: k.seg(28, 8), ...o });
}

/** Mug handle (half torus) on the +x side of a vessel of radius r and height h. */
export function mugHandle(k, role, mat, r, h, x = 0, y = 0, z = 0, ry = 0, o = {}) {
  const g = new THREE.TorusGeometry(h * 0.26, Math.max(0.003, r * 0.12), k.seg(8, 4), k.seg(14, 6), PI);
  g.rotateZ(-PI / 2);
  g.translate(r, h * 0.52, 0);
  g.rotateY(ry);
  k.add(role, mat, T(g, x, y, z), o);
}

/** Closed bottle (lathe) with a cap: body radius r, height h. */
export function bottle(k, role, mat, r, h, x = 0, y = 0, z = 0, { neck = 0.35, cap = 'metal-gold', capH = 0.02, o = {} } = {}) {
  const nr = r * neck;
  k.lathe(role, mat, [[0, 0], [r * 0.95, 0], [r, 0.006], [r, h * 0.7], [r * 0.8, h * 0.8], [nr, h * 0.88], [nr, h], [0, h]], x, y, z, { segs: k.seg(20, 7), ...o });
  if (cap) k.cyl('caps', cap, nr * 1.15, nr * 1.15, capH, x, y + h, z, { segs: k.seg(14, 6) });
}

/** A book lying flat or standing: w along x, t thickness (y), d depth (z). */
export function book(k, color, w, t, d, x, y, z, ry = 0) {
  k.box('covers', 'book-cream', w, t, d, x, y + t / 2, z, { r: 0.002, ry, ...C(color) });
  k.box('pages', 'paper', w - 0.006, t * 0.8, d - 0.008, x + 0.004 * Math.cos(ry), y + t / 2, z - 0.004 * Math.sin(ry), { r: 0, ry });
}

const BOOK_COLS = ['#8a2f2f', '#2f4f7a', '#3f6b45', '#c9a24a', '#5a4a6e', '#d8d0c0', '#2b2b2b'];

/* ===================================================== entry and wardrobe */

const keyBowl = acc({
  id: 'acc-key-bowl', ko: '열쇠 트레이 볼', en: 'Key bowl with keys',
  params: [P.mat('bowl', '그릇', 'Bowl', 'ceramic-speckled-cream', 'ceramic'), P.len('diameter', '지름', 'Diameter', 0.2, 0.12, 0.32)],
  tags: ['key bowl', 'catch-all', 'entryway', 'keys', '열쇠 그릇', '현관 소품', '키 트레이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2, h = r * 0.35;
    k.lathe('bowl', p.bowl, [[0, 0], [r * 0.55, 0], [r * 0.6, 0.004], [r * 0.95, h * 0.8], [r, h], [r * 0.94, h], [r * 0.88, h * 0.8], [r * 0.5, 0.012], [0, 0.012]], 0, 0, 0, { segs: k.seg(36, 10) });
    k.add('keys', 'metal-brass', T(new THREE.TorusGeometry(0.014, 0.0018, k.seg(6, 3), k.seg(16, 8)), 0, 0.016, 0, PI / 2, 0, 0));
    k.box('keys', 'metal-steel', 0.045, 0.003, 0.012, 0.026, 0.015, 0.004, { r: 0, ry: 0.3 });
    k.box('keys', 'metal-brass', 0.04, 0.003, 0.012, -0.018, 0.015, 0.024, { r: 0, ry: -1.2 });
    k.box('fob', 'leather-cognac', 0.035, 0.006, 0.018, -0.018, 0.017, -0.022, { r: 0.002, ry: 0.6 });
    return finish(k);
  },
});

const keyRack = acc({
  id: 'acc-wall-key-rack', placement: 'wall', elevation: 1.3, ko: '벽걸이 열쇠 걸이', en: 'Wall key rack',
  params: [P.mat('wood', '목재', 'Wood', 'wood-oak', 'wood'), P.int('hooks', '고리 수', 'Hooks', 5, 3, 8)],
  tags: ['key rack', 'key hooks', 'entryway', 'wall hooks', '열쇠 걸이', '키 걸이', '현관 벽걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.hooks, w = 0.06 * n + 0.04;
    k.box('board', p.wood, w, 0.09, 0.018, 0, 0.12, 0, { r: 0.004 });
    k.box('shelf', p.wood, w, 0.012, 0.06, 0, 0.17, 0.03, { r: 0.003 });
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.06;
      k.rod('hooks', 'metal-black', [x, 0.1, 0.009], [x, 0.1, 0.04], 0.003, { segs: 6 });
      k.rod('hooks', 'metal-black', [x, 0.1, 0.04], [x, 0.115, 0.045], 0.003, { segs: 6 });
      if (i % 2 === 0) {
        k.add('keys', 'metal-brass', T(new THREE.TorusGeometry(0.011, 0.0015, k.seg(6, 3), k.seg(12, 6)), x, 0.088, 0.04, 0, 0, 0));
        k.box('keys', 'metal-steel', 0.01, 0.045, 0.002, x, 0.055, 0.04, { r: 0 });
      }
    }
    return finish(k);
  },
});

const tote = acc({
  id: 'acc-tote-bag', ko: '캔버스 토트백', en: 'Canvas tote bag',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-canvas-ecru', 'fabric'), P.len('width', '폭', 'Width', 0.4, 0.28, 0.5)],
  tags: ['tote bag', 'shopping bag', 'canvas bag', 'eco bag', '토트백', '에코백', '장바구니', '가방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.95, d = 0.12;
    k.soft('bag', p.fabric, w, h, d, 0.02, 0, h / 2, 0, { puff: 0.01 });
    for (const z of [-d / 2 + 0.01, d / 2 - 0.01]) k.tube('handles', 'leather-cognac', [[-w * 0.22, h - 0.01, z], [-w * 0.18, h + 0.16, z], [w * 0.18, h + 0.16, z], [w * 0.22, h - 0.01, z]], 0.007);
    return finish(k);
  },
});

const backpack = acc({
  id: 'acc-backpack', placement: 'floor', ko: '백팩', en: 'Backpack',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-canvas-navy', 'fabric'), P.len('height', '높이', 'Height', 0.44, 0.34, 0.55)],
  tags: ['backpack', 'rucksack', 'school bag', 'bag', '백팩', '배낭', '책가방', '가방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = h * 0.68, d = 0.15;
    k.soft('bag', p.fabric, w, h, d, 0.06, 0, h / 2, 0, { puff: 0.015 });
    k.soft('bag', p.fabric, w * 0.75, h * 0.38, 0.06, 0.03, 0, h * 0.25, d / 2 + 0.02, { puff: 0.008 });
    k.box('trim', 'leather-cognac', w * 0.2, 0.004, 0.004, 0, h * 0.42, d / 2 + 0.05, { r: 0 });
    for (const s of [-1, 1]) k.tube('straps', 'fabric-canvas-black', [[s * w * 0.25, h * 0.92, -d / 2], [s * w * 0.3, h * 0.6, -d / 2 - 0.035], [s * w * 0.33, h * 0.12, -d / 2 - 0.01]], 0.01);
    k.tube('straps', 'fabric-canvas-black', [[-0.04, h, 0], [0, h + 0.04, 0], [0.04, h, 0]], 0.006);
    return finish(k);
  },
});

const suitcase = acc({
  id: 'acc-cabin-suitcase', placement: 'floor', ko: '기내용 캐리어', en: 'Cabin suitcase',
  params: [P.color('shell', '외피 색', 'Shell colour', '#3b6f8f'), P.len('height', '높이', 'Height', 0.55, 0.45, 0.78)],
  tags: ['suitcase', 'luggage', 'trolley', 'carry-on', '캐리어', '여행 가방', '기내용', '트렁크'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = h * 0.68, d = h * 0.42, wr = 0.025;
    k.rbox('shell', 'plastic-abs-gloss-blue', w, h, d, 0.035, 0, wr * 2 + h / 2, 0, C(p.shell));
    for (const x of [-w * 0.25, 0, w * 0.25]) k.box('ribs', 'plastic-abs-gloss-blue', 0.012, h * 0.9, 0.006, x, wr * 2 + h / 2, d / 2 + 0.001, { r: 0.003, ...C(p.shell) });
    k.box('zip', 'plastic-black', w + 0.004, h - 0.04, 0.012, 0, wr * 2 + h / 2, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('wheels', 'rubber-black', wr, wr, 0.02, sx * (w / 2 - 0.04) - 0.01, wr, sz * (d / 2 - 0.04), { rz: PI / 2, segs: k.seg(14, 6) });
      k.box('wheels', 'plastic-black', 0.04, 0.03, 0.04, sx * (w / 2 - 0.04), wr * 2 + 0.005, sz * (d / 2 - 0.04), { r: 0.005 });
    }
    for (const sx of [-1, 1]) k.box('handle', 'metal-al-anodised-grey', 0.015, 0.2, 0.015, sx * w * 0.18, wr * 2 + h + 0.1, -d / 2 + 0.03, { r: 0.003 });
    k.box('handle', 'plastic-black', w * 0.42, 0.025, 0.025, 0, wr * 2 + h + 0.21, -d / 2 + 0.03, { r: 0.008 });
    k.box('handle', 'plastic-black', 0.12, 0.02, 0.03, 0, wr * 2 + h * 0.6, d / 2 + 0.01, { r: 0.006, rz: PI / 2 });
    return finish(k);
  },
});

const handbag = acc({
  id: 'acc-handbag', ko: '가죽 핸드백', en: 'Leather handbag',
  params: [P.mat('leather', '가죽', 'Leather', 'leather-topgrain-taupe', 'leather'), P.len('width', '폭', 'Width', 0.3, 0.22, 0.4)],
  tags: ['handbag', 'purse', 'leather bag', 'top handle bag', '핸드백', '가죽 가방', '여성 가방', '가방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.72, d = w * 0.4;
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w * 0.4, h), new THREE.Vector2(-w * 0.4, h)]);
    k.panel('bag', p.leather, s, d, 0, 0, 0, { bevel: 0.012 });
    k.panel('flap', p.leather, new THREE.Shape([new THREE.Vector2(-w * 0.42, 0), new THREE.Vector2(w * 0.42, 0), new THREE.Vector2(w * 0.35, h * 0.35), new THREE.Vector2(-w * 0.35, h * 0.35)]), 0.004, 0, h * 0.65, d / 2 + 0.002, { bevel: 0.0015 });
    k.box('clasp', 'metal-gold-polished', 0.03, 0.018, 0.006, 0, h * 0.68, d / 2 + 0.006, { r: 0.002 });
    k.tube('handle', p.leather, [[-w * 0.25, h, 0], [-w * 0.18, h + w * 0.25, 0], [w * 0.18, h + w * 0.25, 0], [w * 0.25, h, 0]], 0.007);
    return finish(k);
  },
});

const fedora = acc({
  id: 'acc-fedora-hat', ko: '페도라 모자', en: 'Fedora hat',
  params: [P.mat('felt', '펠트', 'Felt', 'fabric-felt-charcoal', 'fabric'), P.len('brim', '챙 지름', 'Brim diameter', 0.36, 0.3, 0.44)],
  tags: ['fedora', 'hat', 'felt hat', 'wardrobe', '페도라', '모자', '중절모', '패션 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.brim / 2;
    k.lathe('brim', p.felt, [[0.09, 0.012], [R * 0.7, 0.006], [R, 0.018], [R - 0.004, 0.024], [R * 0.7, 0.012], [0.09, 0.018]], 0, 0, 0, { segs: k.seg(40, 12) });
    k.lathe('crown', p.felt, [[0, 0.11], [0.06, 0.12], [0.09, 0.1], [0.095, 0.05], [0.095, 0.012]], 0, 0, 0, { segs: k.seg(32, 10), scale: [1, 1, 1.18] });
    k.lathe('band', 'fabric-satin-navy', [[0.097, 0.016], [0.097, 0.042]], 0, 0, 0, { segs: k.seg(32, 10), scale: [1, 1, 1.18] });
    return finish(k);
  },
});

/** One shoe along z (toe at +z): sole + upper. */
function shoe(k, x, ry, { len = 0.27, w = 0.1, h = 0.09, sole = 'rubber-black', upper, uo = {}, heel = 0.025, boot = 0 }) {
  transformAdded(k, () => {
    k.rbox('soles', sole, w, heel, len, 0.01, 0, heel / 2, 0);
    k.soft('uppers', upper, w * 0.94, h - heel, len * 0.72, 0.035, 0, heel + (h - heel) / 2, -len * 0.12, { puff: 0.004, ...uo });
    k.sphere('uppers', upper, w * 0.47, 0, heel, len * 0.25, { thetaLength: PI / 2, scale: [1, 0.9, 1.6], ...uo });
    if (boot) k.soft('uppers', upper, w * 0.9, boot, len * 0.42, 0.03, 0, h + boot / 2 - 0.01, -len * 0.25, uo);
  }, x, 0, 0, ry);
}

const sneakers = acc({
  id: 'acc-sneakers-pair', placement: 'floor', ko: '운동화 한 켤레', en: 'Pair of sneakers',
  params: [P.mat('upper', '갑피', 'Upper', 'fabric-canvas-ecru', 'fabric'), P.len('length', '길이', 'Length', 0.27, 0.18, 0.31)],
  tags: ['sneakers', 'trainers', 'shoes', 'entryway', '운동화', '스니커즈', '신발', '현관'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const s of [-1, 1]) shoe(k, s * p.length * 0.24, s * 0.08, { len: p.length, w: p.length * 0.37, h: p.length * 0.33, sole: 'plastic-silicone-white', upper: p.upper });
    return finish(k);
  },
});

const boots = acc({
  id: 'acc-ankle-boots-pair', placement: 'floor', ko: '앵클 부츠 한 켤레', en: 'Pair of ankle boots',
  params: [P.mat('leather', '가죽', 'Leather', 'leather-aniline-chestnut', 'leather'), P.len('shaft', '목 높이', 'Shaft height', 0.1, 0.03, 0.2)],
  tags: ['ankle boots', 'chelsea boots', 'boots', 'shoes', '앵클 부츠', '부츠', '신발', '첼시 부츠'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const s of [-1, 1]) shoe(k, s * 0.065, s * 0.06, { len: 0.28, w: 0.1, h: 0.1, sole: 'rubber-black', upper: p.leather, heel: 0.03, boot: p.shaft });
    return finish(k);
  },
});

const slippers = acc({
  id: 'acc-slippers-pair', placement: 'floor', ko: '실내 슬리퍼', en: 'House slippers',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-faux-fur-grey', 'fabric'), P.len('length', '길이', 'Length', 0.27, 0.2, 0.31)],
  tags: ['slippers', 'house shoes', 'indoor slippers', '슬리퍼', '실내화', '덧신', '현관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, W = L * 0.36;
    for (const s of [-1, 1]) {
      const x = s * W * 0.7;
      k.slab('soles', 'plastic-silicone-grey', roundRect(W, L, W * 0.45), 0.018, 0, { x, ry: s * 0.06 });
      k.sphere('uppers', p.fabric, W * 0.5, x, 0.018, L * 0.18, { thetaLength: PI / 2, scale: [1, 0.85, 1.25] });
    }
    return finish(k);
  },
});

const umbrella = acc({
  id: 'acc-folded-umbrella', placement: 'floor', ko: '장우산', en: 'Closed umbrella',
  params: [P.mat('canopy', '우산 천', 'Canopy', 'fabric-canvas-black', 'fabric'), P.len('length', '길이', 'Length', 0.88, 0.7, 1.0)],
  tags: ['umbrella', 'rain', 'closed umbrella', 'entryway', '우산', '장우산', '비', '현관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.cyl('tip', 'metal-chrome', 0.004, 0.004, 0.06, 0, 0, 0, { segs: 8 });
    k.lathe('canopy', p.canopy, [[0.004, 0.05], [0.03, 0.2], [0.036, L * 0.55], [0.012, L * 0.78], [0.006, L * 0.8]], 0, 0, 0, { segs: k.seg(8, 6) });
    k.box('strap', p.canopy, 0.075, 0.025, 0.004, 0, L * 0.45, 0.034, { r: 0.002 });
    k.cyl('shaft', 'metal-black', 0.005, 0.005, L * 0.1, 0, L * 0.8, 0, { segs: 8 });
    k.tube('handle', 'wood-am-walnut-satin', [[0, L * 0.88, 0], [0, L * 0.97, 0], [0.025, L, 0], [0.05, L * 0.98, 0], [0.055, L * 0.94, 0]], 0.011, { caps: true });
    return finish(k);
  },
});

const hangerRail = acc({
  id: 'acc-wall-hanger-rail', placement: 'wall', elevation: 1.45, ko: '벽 옷걸이 레일과 셔츠', en: 'Wall rail with hung shirts',
  params: [P.mat('wood', '옷걸이 목재', 'Hanger wood', 'wood-beech-oil', 'wood'), P.int('count', '옷걸이 수', 'Hangers', 3, 1, 5)],
  tags: ['clothes rail', 'hangers', 'shirt', 'wardrobe', '옷걸이', '셔츠', '행거', '옷'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.count, w = Math.max(0.5, n * 0.14 + 0.2), cols = ['#f2f0ea', '#8fb3d9', '#c9b79a', '#3f4b5e', '#b44e3e'];
    for (const s of [-1, 1]) k.box('brackets', 'metal-black', 0.02, 0.06, 0.13, s * (w / 2 - 0.03), 0.72, 0.065, { r: 0.003 });
    k.rod('rail', 'metal-black', [-w / 2, 0.71, 0.11], [w / 2, 0.71, 0.11], 0.01);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.14;
      k.tube('hooks', 'metal-chrome', [[x, 0.68, 0.11], [x, 0.725, 0.11], [x + 0.012, 0.73, 0.11]], 0.002);
      k.tube('hangers', p.wood, [[x - 0.2, 0.6, 0.11], [x, 0.675, 0.11], [x + 0.2, 0.6, 0.11]], 0.008);
      k.soft('shirts', 'fabric-cotton-white', 0.42, 0.6, 0.03, 0.03, x, 0.3, 0.11 - 0.012 + i * 0.008, { ...C(cols[i % cols.length]) });
    }
    return finish(k);
  },
});

const foldedClothes = acc({
  id: 'acc-folded-clothes-stack', ko: '개어 둔 옷 더미', en: 'Stack of folded clothes',
  params: [P.int('count', '벌 수', 'Pieces', 4, 2, 7), P.mat('fabric', '천', 'Fabric', 'fabric-knit-cream', 'fabric')],
  tags: ['folded clothes', 'sweaters', 'laundry', 'wardrobe', '옷 더미', '개어 둔 옷', '스웨터', '빨래'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = rng(4), cols = [null, '#7a8b99', '#b9a07a', '#2f3b52', '#a35b4b', '#d8d1c4', '#56704f'];
    let y = 0;
    for (let i = 0; i < p.count; i++) {
      const t = 0.045 + r() * 0.02;
      k.soft(`clothes${i % 3}`, p.fabric, 0.32, t, 0.25, 0.015, (r() - 0.5) * 0.02, y + t / 2, (r() - 0.5) * 0.02, { puff: 0.006, ry: (r() - 0.5) * 0.1, ...(cols[i] ? C(cols[i]) : {}) });
      y += t;
    }
    return finish(k);
  },
});

/* ================================================= living-room tabletop */

const remoteTray = acc({
  id: 'acc-remote-tray', ko: '리모컨 트레이', en: 'Remote control tray',
  params: [P.mat('tray', '트레이', 'Tray', 'leather-saddle-tan', 'leather'), P.int('remotes', '리모컨 수', 'Remotes', 2, 1, 3)],
  tags: ['remote control', 'tv remote', 'tray', 'organiser', '리모컨', '리모컨 정리함', '트레이', '거실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.26, d = 0.12;
    k.box('tray', p.tray, w, 0.006, d, 0, 0.003, 0, { r: 0.002 });
    for (const s of [-1, 1]) { k.box('tray', p.tray, w, 0.03, 0.005, 0, 0.015, s * (d / 2 - 0.0025), { r: 0.002 }); k.box('tray', p.tray, 0.005, 0.03, d, s * (w / 2 - 0.0025), 0.015, 0, { r: 0.002 }); }
    for (let i = 0; i < p.remotes; i++) {
      const z = (i - (p.remotes - 1) / 2) * 0.034;
      k.rbox('remotes', i === 1 ? 'plastic-abs-matte-grey' : 'plastic-abs-matte-black', 0.2, 0.018, 0.045 * 0.95 - 0.012, 0.006, 0, 0.015, z);
      for (let b = 0; b < 4; b++) k.box('buttons', 'plastic-grey', 0.012, 0.004, 0.01, -0.06 + b * 0.03, 0.025, z, { r: 0.001 });
    }
    return finish(k);
  },
});

const coasters = acc({
  id: 'acc-coaster-set', ko: '코스터 세트', en: 'Coaster set with holder',
  params: [P.mat('coaster', '코스터', 'Coasters', 'cork-natural', 'other'), P.int('count', '장 수', 'Count', 6, 2, 8)],
  tags: ['coasters', 'cork coasters', 'drink mats', 'coffee table', '코스터', '컵받침', '티 매트', '거실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('holder', 'wood-am-walnut-oil', 0.055, 0.055, 0.008, 0, 0, 0, { segs: k.seg(28, 10) });
    for (const s of [-1, 1]) k.cyl('holder', 'wood-am-walnut-oil', 0.006, 0.006, 0.06, s * 0.035, 0.008, -0.03, { segs: 8 });
    for (let i = 0; i < p.count; i++) k.cyl('coasters', p.coaster, 0.05, 0.05, 0.006, 0, 0.008 + i * 0.0065, 0, { segs: k.seg(28, 10) });
    k.cyl('coasters', p.coaster, 0.05, 0.05, 0.006, 0.13, 0, 0.02, { segs: k.seg(28, 10) });
    vessel(k, 'glass', 'glass-clear', 0.032, 0.09, 0.13, 0.006, 0.02, { taper: 1.05 });
    return finish(k);
  },
});

const magazines = acc({
  id: 'acc-magazine-stack', ko: '잡지 더미', en: 'Stack of magazines',
  params: [P.int('count', '권 수', 'Count', 6, 2, 12)],
  tags: ['magazines', 'stack', 'coffee table', 'reading', '잡지', '잡지 더미', '읽을거리', '거실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = rng(7), cols = ['#e8e2d4', '#d14b3f', '#25415e', '#f0c84b', '#1f1f1f', '#7aa58a'];
    for (let i = 0; i < p.count; i++) k.box(`mag${i % 3}`, 'paper-glossy', 0.23, 0.007, 0.3, (r() - 0.5) * 0.03, i * 0.0072 + 0.0035, (r() - 0.5) * 0.03, { r: 0.001, ry: (r() - 0.5) * 0.25, ...C(cols[i % cols.length]) });
    return finish(k);
  },
});

const boardGames = acc({
  id: 'acc-board-game-boxes', ko: '보드게임 상자', en: 'Board game boxes',
  params: [P.int('count', '상자 수', 'Boxes', 3, 1, 5)],
  tags: ['board games', 'game boxes', 'family games', 'games night', '보드게임', '게임 상자', '놀이', '거실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = rng(11), cols = ['#c8402e', '#2f6db0', '#3b8c5a', '#e9b23a', '#6b3fa0'];
    let y = 0;
    for (let i = 0; i < p.count; i++) {
      const w = 0.28 + r() * 0.12, d = 0.2 + r() * 0.1, t = 0.05 + r() * 0.03;
      k.box('boxes', 'paper-cardboard', w, t, d, (r() - 0.5) * 0.03, y + t / 2, 0, { r: 0.002, ry: (r() - 0.5) * 0.12, ...C(cols[i]) });
      k.box('labels', 'paper-glossy', w * 0.6, 0.002, d * 0.3, 0, y + t + 0.001, 0, { r: 0, ry: (r() - 0.5) * 0.1 });
      y += t;
    }
    return finish(k);
  },
});

const puzzle = acc({
  id: 'acc-jigsaw-puzzle', ko: '직소 퍼즐 판', en: 'Jigsaw puzzle in progress',
  params: [P.int('done', '맞춘 줄 수', 'Rows done', 5, 1, 8), P.color('picture', '그림 색', 'Picture colour', '#4f86b8')],
  tags: ['jigsaw', 'puzzle', 'hobby', 'table game', '직소 퍼즐', '퍼즐', '취미', '놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.6, D = 0.42, n = 12, m = 8, r = rng(3);
    k.box('board', 'paper-greyboard', W + 0.04, 0.004, D + 0.04, 0, 0.002, 0, { r: 0 });
    const cw = W / n, cd = D / m;
    for (let j = 0; j < Math.min(m, p.done); j++) for (let i = 0; i < n; i++) k.box(`pieces${(i + j) % 2}`, 'paper-glossy', cw * 0.97, 0.003, cd * 0.97, -W / 2 + cw * (i + 0.5), 0.0055, -D / 2 + cd * (j + 0.5), { r: 0, ...C((i + j) % 2 ? p.picture : '#e7d7a8') });
    for (let i = 0; i < 14; i++) k.box('loose', 'paper-glossy', cw * 0.9, 0.003, cd * 0.9, W / 2 + 0.06 + r() * 0.12, 0.0015, (r() - 0.5) * D, { r: 0, ry: r() * PI, ...C(p.picture) });
    k.box('lid', 'paper-cardboard', 0.3, 0.05, 0.2, W / 2 + 0.12, 0.025, -D / 2 - 0.08, { r: 0.002, ry: 0.2, ...C('#2c4a6b') });
    return finish(k);
  },
});

const album = acc({
  id: 'acc-photo-album', ko: '사진 앨범', en: 'Photo album',
  params: [P.mat('cover', '표지', 'Cover', 'fabric-linen-sage', 'fabric'), P.int('count', '권 수', 'Albums', 2, 1, 4)],
  tags: ['photo album', 'scrapbook', 'memories', 'coffee table book', '사진 앨범', '앨범', '추억', '책'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.count; i++) {
      const y = i * 0.055, ry = i * 0.15;
      k.box('covers', p.cover, 0.34, 0.055, 0.3, 0, y + 0.0275, 0, { r: 0.004, ry });
      k.box('pages', 'paper', 0.335, 0.045, 0.285, 0.006, y + 0.0275, 0, { r: 0, ry });
      k.box('labels', 'paper-kraft', 0.08, 0.002, 0.05, 0, y + 0.0555, 0.05, { r: 0, ry });
    }
    return finish(k);
  },
});

const snowGlobe = acc({
  id: 'acc-snow-globe', ko: '스노글로브', en: 'Snow globe',
  params: [P.len('diameter', '유리 지름', 'Globe diameter', 0.12, 0.08, 0.2), P.mat('base', '받침', 'Base', 'wood-am-walnut-gloss', 'wood')],
  tags: ['snow globe', 'souvenir', 'winter', 'christmas', '스노글로브', '스노우볼', '겨울 소품', '크리스마스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2, bh = r * 0.7;
    k.lathe('base', p.base, [[0, 0], [r * 0.95, 0], [r * 0.98, bh * 0.2], [r * 0.75, bh], [0, bh]], 0, 0, 0, { segs: k.seg(28, 10) });
    k.sphere('glass', 'glass-clear', r, 0, bh + r * 0.9, 0);
    k.cyl('snow', 'snow', r * 0.7, r * 0.72, r * 0.15, 0, bh, 0, { segs: k.seg(20, 8) });
    k.cyl('tree', 'plant-pine', 0.001, r * 0.35, r * 0.9, 0, bh + r * 0.15, 0, { segs: k.seg(10, 6) });
    k.box('house', 'paint-terracotta-matte', r * 0.35, r * 0.3, r * 0.3, r * 0.38, bh + r * 0.3, r * 0.1, { r: 0.002 });
    return finish(k);
  },
});

const musicBox = acc({
  id: 'acc-music-box', ko: '오르골', en: 'Wooden music box',
  params: [P.mat('wood', '목재', 'Wood', 'wood-mahogany-satin', 'wood'), P.num('lid', '뚜껑 열림(도)', 'Lid open (°)', 70, 0, 100, 1)],
  tags: ['music box', 'jewellery box', 'keepsake box', 'ballerina', '오르골', '뮤직 박스', '보석함', '선물'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.18, D = 0.12, H = 0.07, a = (p.lid * PI) / 180;
    k.box('box', p.wood, W, H, D, 0, H / 2, 0, { r: 0.003 });
    k.box('lining', 'fabric-velvet-rose', W - 0.016, 0.004, D - 0.016, 0, H - 0.008, 0, { r: 0 });
    const lid = new THREE.BoxGeometry(W, 0.016, D);
    lid.translate(0, 0.008, D / 2);
    lid.rotateX(-a);
    lid.translate(0, H, -D / 2);
    k.add('box', p.wood, lid);
    k.cyl('figure', 'metal-gold-polished', 0.006, 0.006, 0.03, 0, H - 0.008, 0, { segs: 8 });
    k.lathe('figure', 'ceramic-gloss-blush', [[0, 0], [0.02, 0.004], [0.006, 0.018], [0.004, 0.035], [0.007, 0.04], [0, 0.045]], 0, H + 0.02, 0, { segs: k.seg(14, 6) });
    k.cyl('crank', 'metal-brass', 0.003, 0.003, 0.02, W / 2, H * 0.4, 0, { rz: -PI / 2, segs: 6 });
    return finish(k);
  },
});

const binoculars = acc({
  id: 'acc-binoculars', ko: '쌍안경', en: 'Binoculars',
  params: [P.mat('body', '몸체', 'Body', 'rubber-black', 'plastic'), P.len('length', '길이', 'Length', 0.16, 0.1, 0.22)],
  tags: ['binoculars', 'field glasses', 'bird watching', 'travel', '쌍안경', '망원경', '탐조', '여행 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, r = L * 0.22;
    for (const s of [-1, 1]) {
      k.cyl('body', p.body, r, r, L, s * r * 1.15, r, -L / 2, { rx: PI / 2, segs: k.seg(20, 8) });
      k.cyl('lens', 'glass-tint-blue', r * 0.85, r * 0.85, 0.003, s * r * 1.15, r, L / 2, { rx: PI / 2, segs: k.seg(20, 8) });
      k.cyl('eyepiece', 'plastic-black', r * 0.6, r * 0.7, L * 0.12, s * r * 1.15, r, -L / 2 - L * 0.12, { rx: PI / 2, segs: k.seg(16, 6) });
    }
    k.box('bridge', 'metal-gunmetal', r * 0.8, r * 0.6, L * 0.5, 0, r * 1.2, -L * 0.15, { r: 0.003 });
    k.cyl('bridge', 'metal-gunmetal', r * 0.35, r * 0.35, r * 0.9, 0, r * 1.5, -L * 0.3, { rx: PI / 2, segs: 12 });
    return finish(k);
  },
});

const camera = acc({
  id: 'acc-vintage-camera', ko: '빈티지 필름 카메라', en: 'Vintage film camera',
  params: [P.mat('trim', '외장', 'Leatherette', 'leather-aniline-black', 'leather'), P.len('lens', '렌즈 길이', 'Lens length', 0.04, 0.02, 0.12)],
  tags: ['film camera', 'rangefinder', 'vintage camera', 'photography', '필름 카메라', '카메라', '빈티지', '사진'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.14, H = 0.08, D = 0.04;
    k.box('body', 'metal-chrome-satin', W, H, D, 0, H / 2, 0, { r: 0.006 });
    k.box('trim', p.trim, W - 0.002, H * 0.55, D + 0.002, 0, H * 0.45, 0, { r: 0.004 });
    k.cyl('lens', 'metal-black', 0.024, 0.026, p.lens, 0, H * 0.48, D / 2, { rx: PI / 2, segs: k.seg(24, 10) });
    k.cyl('glass', 'glass-tint-blue', 0.018, 0.018, 0.002, 0, H * 0.48, D / 2 + p.lens, { rx: PI / 2, segs: k.seg(20, 8) });
    k.box('glass', 'glass-tint-blue', 0.018, 0.012, 0.002, -W * 0.33, H * 0.82, D / 2 + 0.001, { r: 0 });
    for (const x of [W * 0.25, W * 0.38]) k.cyl('dials', 'metal-chrome', 0.009, 0.009, 0.008, x, H, 0, { segs: 12 });
    return finish(k);
  },
});

const headphones = acc({
  id: 'acc-headphones-stand', ko: '헤드폰과 거치대', en: 'Headphones on a stand',
  params: [P.mat('cups', '이어컵', 'Ear cups', 'leather-topgrain-black', 'leather'), P.mat('stand', '거치대', 'Stand', 'wood-am-walnut-oil', 'wood')],
  tags: ['headphones', 'headphone stand', 'music', 'audio', '헤드폰', '헤드셋', '거치대', '음악'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = 0.26;
    k.cyl('stand', p.stand, 0.06, 0.065, 0.015, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('stand', p.stand, 0.01, 0.012, H - 0.02, 0, 0.015, 0, { segs: 12 });
    k.box('stand', p.stand, 0.08, 0.02, 0.025, 0, H, 0, { r: 0.008 });
    const arc = new THREE.TorusGeometry(0.085, 0.009, k.seg(8, 4), k.seg(24, 10), PI);
    arc.scale(1, 1.1, 1.6);
    k.add('band', 'metal-black', T(arc, 0, H - 0.08, 0));
    k.add('band', p.cups, T(new THREE.TorusGeometry(0.075, 0.01, k.seg(8, 4), k.seg(20, 8), PI * 0.6), 0, H - 0.08, 0, 0, 0, PI * 0.2));
    for (const s of [-1, 1]) {
      k.cyl('shells', 'plastic-abs-matte-black', 0.045, 0.045, 0.03, s * 0.095, H - 0.11, 0, { rz: s * PI / 2, segs: k.seg(22, 8) });
      k.cyl('cups', p.cups, 0.042, 0.042, 0.022, s * 0.07, H - 0.11, 0, { rz: s * PI / 2, segs: k.seg(22, 8) });
    }
    return finish(k);
  },
});

const vinylCrate = acc({
  id: 'acc-vinyl-crate', placement: 'floor', ko: 'LP 레코드 상자', en: 'Crate of vinyl records',
  params: [P.mat('wood', '상자 목재', 'Crate wood', 'wood-pine-oil', 'wood'), P.int('records', '레코드 수', 'Records', 16, 4, 28)],
  tags: ['vinyl records', 'lp crate', 'record box', 'music', 'LP', '레코드', '레코드 상자', '음반'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.34, D = 0.36, H = 0.24, t = 0.015, r = rng(9);
    k.box('crate', p.wood, W, t, D, 0, t / 2, 0, { r: 0.002 });
    for (const s of [-1, 1]) { k.box('crate', p.wood, t, H, D, s * (W / 2 - t / 2), H / 2, 0, { r: 0.002 }); k.box('crate', p.wood, W - 2 * t, H * 0.55, t, 0, H * 0.275, s * (D / 2 - t / 2), { r: 0.002 }); }
    const cols = ['#2a2a2a', '#d9b44a', '#c24b3a', '#3a6aa0', '#e8e4da', '#5b8a5e'];
    const n = p.records, pitch = (D - 2 * t - 0.01) / Math.max(n, 1);
    for (let i = 0; i < n; i++) k.box(`sleeves${i % 3}`, 'paper-glossy', 0.31, 0.31, 0.004, 0, t + 0.155, -D / 2 + t + 0.006 + pitch * (i + 0.5), { r: 0, rx: (r() - 0.5) * 0.12, ...C(cols[i % cols.length]) });
    return finish(k);
  },
});

const radio = acc({
  id: 'acc-vintage-radio', ko: '레트로 라디오', en: 'Retro radio',
  params: [P.mat('case', '케이스', 'Case', 'wood-teak', 'wood'), P.len('width', '폭', 'Width', 0.3, 0.2, 0.42)],
  tags: ['radio', 'retro radio', 'speaker', 'audio', '라디오', '레트로', '스피커', '음악'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = W * 0.6, D = W * 0.42;
    k.rbox('case', p.case, W, H, D, 0.015, 0, H / 2 + 0.01, 0);
    for (const s of [-1, 1]) k.box('feet', 'rubber-black', 0.03, 0.01, D * 0.8, s * W * 0.35, 0.005, 0, { r: 0.002 });
    k.box('grille', 'fabric-tweed-oatmeal', W * 0.52, H * 0.7, 0.004, -W * 0.2, H / 2 + 0.01, D / 2 + 0.001, { r: 0 });
    k.box('dial', 'paper', W * 0.3, H * 0.25, 0.004, W * 0.27, H * 0.68, D / 2 + 0.001, { r: 0 });
    for (const y of [0.3, 0.12]) k.cyl('knobs', 'metal-brass-satin', 0.015, 0.015, 0.012, W * (0.2 + y), H * 0.3, D / 2, { rx: PI / 2, segs: 14 });
    k.tube('handle', 'leather-saddle-tan', [[-W * 0.35, H, 0], [0, H + W * 0.1, 0], [W * 0.35, H, 0]], 0.006);
    return finish(k);
  },
});

const tissueBox = acc({
  id: 'acc-tissue-box', ko: '티슈 케이스', en: 'Tissue box cover',
  params: [P.mat('cover', '케이스', 'Cover', 'wood-ash', 'wood'), P.len('width', '폭', 'Width', 0.25, 0.13, 0.28)],
  tags: ['tissue box', 'tissues', 'kleenex', 'cover', '티슈', '휴지 케이스', '티슈 박스', '거실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = 0.13, H = W < 0.16 ? 0.13 : 0.085;
    k.box('cover', p.cover, W, H, D, 0, H / 2, 0, { r: 0.006 });
    k.box('slot', 'plastic-black', W * 0.5, 0.002, 0.025, 0, H + 0.001, 0, { r: 0 });
    k.sphere('tissue', 'paper', 0.04, 0, H, 0, { scale: [1, 0.9, 0.35], thetaLength: PI / 2 });
    return finish(k);
  },
});

const perfume = acc({
  id: 'acc-perfume-trio', ko: '향수병 세트', en: 'Perfume bottles',
  params: [P.mat('glass', '유리', 'Glass', 'glass-tint-amber', 'glass'), P.mat('tray', '트레이', 'Tray', 'stone-marble-carrara', 'stone')],
  tags: ['perfume', 'fragrance', 'bottles', 'vanity', '향수', '향수병', '화장대', '뷰티'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('tray', p.tray, 0.12, 0.12, 0.012, 0, 0, 0, { segs: k.seg(36, 12) });
    k.box('bottles', p.glass, 0.06, 0.09, 0.03, -0.045, 0.057, 0, { r: 0.006 });
    k.cyl('caps', 'metal-gold-polished', 0.012, 0.012, 0.03, -0.045, 0.102, 0, { segs: 12 });
    bottle(k, 'bottles2', 'glass-clear', 0.028, 0.08, 0.04, 0.012, -0.03, { neck: 0.3, cap: 'plastic-acrylic-black', capH: 0.025 });
    k.sphere('bottles3', 'glass-tint-rose', 0.03, 0.035, 0.042, 0.05, { scale: [1, 1, 0.7] });
    k.cyl('caps', 'metal-gold-polished', 0.008, 0.008, 0.015, 0.035, 0.07, 0.05, { segs: 10 });
    return finish(k);
  },
});

const trinket = acc({
  id: 'acc-trinket-dish-set', ko: '반지 접시와 액세서리', en: 'Trinket dish with jewellery',
  params: [P.mat('dish', '접시', 'Dish', 'ceramic-gloss-blush', 'ceramic'), P.len('diameter', '지름', 'Diameter', 0.12, 0.08, 0.18)],
  tags: ['trinket dish', 'ring dish', 'jewellery', 'vanity', '반지 접시', '액세서리 접시', '주얼리', '화장대'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.lathe('dish', p.dish, [[0, 0], [r * 0.7, 0], [r, 0.014], [r * 0.97, 0.016], [r * 0.68, 0.005], [0, 0.005]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.lathe('stand', p.dish, [[0, 0], [0.012, 0], [0.006, 0.01], [0.004, 0.05], [0, 0.056]], r * 0.3, 0.005, 0, { segs: k.seg(12, 6) });
    for (const [x, z, s] of [[-0.012, 0.012, 1], [0.01, -0.016, 0.8]]) k.add('rings', 'metal-gold-polished', T(new THREE.TorusGeometry(0.009 * s, 0.0015, k.seg(6, 3), k.seg(16, 8)), x, 0.007, z, PI / 2, 0, 0));
    k.add('rings', 'metal-gold-polished', T(new THREE.TorusGeometry(0.008, 0.0015, k.seg(6, 3), k.seg(16, 8)), r * 0.3, 0.035, 0, 0, 0, 0));
    k.tube('chain', 'metal-silver-polished', [[-r * 0.5, 0.007, -r * 0.3], [-r * 0.2, 0.007, r * 0.4], [r * 0.2, 0.007, r * 0.45], [r * 0.5, 0.007, 0.0]], 0.001);
    return finish(k);
  },
});

/* ==================================================== kitchen counter */

const mugs = acc({
  id: 'acc-mug-pair', ko: '머그컵 두 개', en: 'Pair of mugs',
  params: [P.mat('glaze', '유약', 'Glaze', 'ceramic-speckled-oatmeal', 'ceramic'), P.len('height', '높이', 'Height', 0.095, 0.07, 0.13)],
  tags: ['mugs', 'coffee mug', 'tea cup', 'kitchen', '머그컵', '머그', '커피잔', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, r = h * 0.43;
    for (const [x, z, ry, m] of [[-r * 1.3, 0, 0.4, p.glaze], [r * 1.3, r * 0.4, -0.8, 'ceramic-gloss-sage']]) {
      vessel(k, 'mugs', m, r, h, x, 0, z, { wall: 0.005, o: {} });
      mugHandle(k, 'mugs', m, r, h, x, 0, z, ry);
      k.cyl('coffee', 'wood-dark', r - 0.006, r - 0.006, 0.002, x, h * 0.82, z, { segs: k.seg(20, 8) });
    }
    return finish(k);
  },
});

const moka = acc({
  id: 'acc-moka-pot', ko: '모카 포트', en: 'Moka pot',
  params: [P.mat('body', '몸체', 'Body', 'metal-al-brushed', 'metal'), P.len('height', '높이', 'Height', 0.2, 0.13, 0.28)],
  tags: ['moka pot', 'stovetop espresso', 'coffee maker', 'bialetti style', '모카 포트', '커피 메이커', '에스프레소', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, r = H * 0.27;
    const oct = 8;
    k.lathe('body', p.body, [[0, 0], [r, 0], [r * 0.82, H * 0.42], [r * 0.7, H * 0.46]], 0, 0, 0, { segs: oct });
    k.lathe('body', p.body, [[r * 0.72, H * 0.46], [r * 0.78, H * 0.5], [r * 0.95, H * 0.88], [r * 0.9, H * 0.9], [r * 0.3, H * 0.96], [0, H * 0.97]], 0, 0, 0, { segs: oct });
    k.lathe('knob', 'plastic-black', [[0, 0], [r * 0.18, 0], [r * 0.12, H * 0.05], [0, H * 0.06]], 0, H * 0.96, 0, { segs: 10 });
    k.tube('handle', 'plastic-black', [[-r * 0.9, H * 0.85, 0], [-r * 1.5, H * 0.8, 0], [-r * 1.45, H * 0.55, 0], [-r * 0.85, H * 0.55, 0]], H * 0.03);
    k.cyl('body', p.body, r * 0.06, r * 0.16, H * 0.12, r * 0.98, H * 0.78, 0, { rz: -0.6, segs: 8 });
    return finish(k);
  },
});

const frenchPress = acc({
  id: 'acc-french-press', ko: '프렌치 프레스', en: 'French press',
  params: [P.mat('frame', '프레임', 'Frame', 'metal-copper-polished', 'metal'), P.len('height', '높이', 'Height', 0.22, 0.15, 0.3)],
  tags: ['french press', 'cafetiere', 'coffee press', 'coffee', '프렌치 프레스', '커피 프레스', '커피', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, r = H * 0.25;
    vessel(k, 'glass', 'glass-borosilicate', r, H * 0.8, 0, 0.008, 0, { wall: 0.003 });
    k.cyl('coffee', 'wood-dark', r - 0.004, r - 0.004, H * 0.5, 0, 0.012, 0, { segs: k.seg(20, 8) });
    k.cyl('frame', p.frame, r + 0.004, r + 0.006, 0.012, 0, 0, 0, { segs: k.seg(24, 8) });
    k.cyl('frame', p.frame, r + 0.004, r + 0.004, 0.006, 0, H * 0.25, 0, { segs: k.seg(24, 8), open: true });
    k.lathe('frame', p.frame, [[r + 0.003, 0], [r + 0.004, 0.015], [r * 0.4, 0.03], [0, 0.032]], 0, H * 0.81, 0, { segs: k.seg(24, 8) });
    k.cyl('frame', p.frame, 0.003, 0.003, H * 0.16, 0, H * 0.84, 0, { segs: 8 });
    k.sphere('frame', p.frame, 0.01, 0, H, 0, { segs: 10, rings: 6 });
    k.tube('frame', p.frame, [[r + 0.003, H * 0.7, 0], [r * 1.7, H * 0.68, 0], [r * 1.7, H * 0.2, 0], [r + 0.003, H * 0.18, 0]], 0.006);
    return finish(k);
  },
});

const grinder = acc({
  id: 'acc-coffee-grinder', ko: '핸드 커피 그라인더', en: 'Manual coffee grinder',
  params: [P.mat('wood', '목재', 'Wood', 'wood-walnut', 'wood'), P.len('size', '몸체 폭', 'Body width', 0.11, 0.08, 0.15)],
  tags: ['coffee grinder', 'hand grinder', 'coffee mill', 'vintage', '커피 그라인더', '핸드밀', '커피', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.size, h = w * 1.05;
    k.box('box', p.wood, w, h, w, 0, h / 2, 0, { r: 0.004 });
    k.box('drawer', p.wood, w * 0.7, h * 0.3, 0.006, 0, h * 0.28, w / 2 + 0.003, { r: 0.002 });
    k.sphere('knob', 'metal-brass', 0.006, 0, h * 0.28, w / 2 + 0.01, { segs: 8, rings: 6 });
    k.lathe('hopper', 'metal-brass-antique', [[0, 0], [w * 0.4, 0], [w * 0.45, w * 0.25], [w * 0.4, w * 0.28], [0, w * 0.2]], 0, h, 0, { segs: k.seg(20, 8) });
    k.cyl('crank', 'metal-iron-cast-black', 0.005, 0.005, w * 0.25, 0, h + w * 0.2, 0, { segs: 8 });
    k.rod('crank', 'metal-iron-cast-black', [0, h + w * 0.45, 0], [w * 0.55, h + w * 0.45, 0], 0.005);
    k.cyl('crank', p.wood, 0.009, 0.009, 0.03, w * 0.55, h + w * 0.45, 0, { segs: 10 });
    return finish(k);
  },
});

const pourOver = acc({
  id: 'acc-pour-over-set', ko: '핸드드립 세트', en: 'Pour-over coffee set',
  params: [P.mat('kettle', '주전자', 'Kettle', 'metal-pc-black-matte', 'metal'), P.mat('dripper', '드리퍼', 'Dripper', 'ceramic-gloss-white', 'ceramic')],
  tags: ['pour over', 'hand drip', 'gooseneck kettle', 'dripper', '핸드드립', '드리퍼', '드립 주전자', '커피'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // carafe + dripper
    k.lathe('carafe', 'glass-borosilicate', [[0, 0], [0.055, 0], [0.065, 0.05], [0.045, 0.11], [0.04, 0.13], [0.036, 0.13], [0.04, 0.11], [0.06, 0.05], [0.05, 0.004], [0, 0.004]], -0.08, 0, 0, { segs: k.seg(24, 8) });
    k.cyl('coffee', 'wood-dark', 0.055, 0.05, 0.03, -0.08, 0.004, 0, { segs: k.seg(20, 8) });
    k.lathe('dripper', p.dripper, [[0.03, 0], [0.05, 0.004], [0.032, 0.012], [0.065, 0.08], [0.06, 0.082], [0.026, 0.016]], -0.08, 0.13, 0, { segs: k.seg(24, 8) });
    // gooseneck kettle
    k.lathe('kettle', p.kettle, [[0, 0], [0.07, 0], [0.072, 0.1], [0.05, 0.13], [0.02, 0.135], [0, 0.135]], 0.08, 0, 0, { segs: k.seg(24, 8) });
    k.tube('kettle', p.kettle, [[0.02, 0.02, 0], [-0.01, 0.03, 0], [-0.03, 0.1, 0], [-0.05, 0.14, 0]], 0.006);
    k.tube('handle', 'wood-am-walnut-oil', [[0.145, 0.11, 0], [0.18, 0.1, 0], [0.18, 0.03, 0], [0.148, 0.02, 0]], 0.009);
    return finish(k);
  },
});

const mills = acc({
  id: 'acc-salt-pepper-mills', ko: '소금·후추 그라인더', en: 'Salt and pepper mills',
  params: [P.mat('wood', '목재', 'Wood', 'wood-olive-oil', 'wood'), P.len('height', '높이', 'Height', 0.18, 0.1, 0.32)],
  tags: ['salt mill', 'pepper mill', 'grinder', 'condiments', '후추 그라인더', '소금', '양념', '식탁 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    for (const [x, m] of [[-0.035, p.wood], [0.035, 'wood-ebony-oil']]) {
      k.lathe('mills', m, [[0, 0], [0.026, 0], [0.028, H * 0.15], [0.02, H * 0.5], [0.024, H * 0.8], [0.016, H * 0.95], [0, H * 0.96]], x, 0, 0, { segs: k.seg(20, 8) });
      k.sphere('knobs', 'metal-chrome', 0.007, x, H * 0.96, 0, { segs: 10, rings: 6 });
    }
    return finish(k);
  },
});

const mortar = acc({
  id: 'acc-mortar-pestle', ko: '절구와 공이', en: 'Mortar and pestle',
  params: [P.mat('stone', '석재', 'Stone', 'stone-granite-absolute-black', 'stone'), P.len('diameter', '지름', 'Diameter', 0.14, 0.1, 0.22)],
  tags: ['mortar', 'pestle', 'spice grinder', 'kitchen', '절구', '공이', '막자사발', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2, h = r * 1.1;
    k.lathe('mortar', p.stone, [[0, 0], [r * 0.7, 0], [r, h * 0.6], [r * 0.97, h], [r * 0.75, h], [r * 0.6, h * 0.4], [0, h * 0.3]], 0, 0, 0, { segs: k.seg(28, 10) });
    const pestle = new THREE.CylinderGeometry(r * 0.12, r * 0.24, r * 1.8, k.seg(14, 6));
    pestle.translate(0, r * 0.9, 0);
    k.add('pestle', p.stone, T(pestle, r * 0.2, h * 0.35, 0, 0, 0, -0.5));
    return finish(k);
  },
});

const cheeseBoard = acc({
  id: 'acc-cheese-board', ko: '치즈 보드', en: 'Cheese board',
  params: [P.mat('board', '도마', 'Board', 'wood-acacia-oil', 'wood'), P.len('length', '길이', 'Length', 0.4, 0.28, 0.55)],
  tags: ['cheese board', 'charcuterie', 'serving board', 'party', '치즈 보드', '샤퀴테리', '서빙 보드', '식탁 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, D = 0.22;
    k.slab('board', p.board, roundRect(L, D, 0.03), 0.018, 0);
    k.cyl('board', p.board, 0.008, 0.008, 0.09, L / 2 + 0.04, 0.009, 0, { rz: PI / 2, segs: 10 });
    const wedge = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.09, 0.02), new THREE.Vector2(0.08, -0.04)]);
    k.panel('cheese', 'wax-candle-ivory', wedge, 0.045, -L * 0.25, 0.0405, 0, { rx: -PI / 2, bevel: 0.002, ...C('#f1d27a') });
    k.cyl('cheese', 'wax-candle-ivory', 0.04, 0.04, 0.035, L * 0.12, 0.018, -0.03, { segs: k.seg(20, 8), ...C('#f4efe2') });
    for (let i = 0; i < 6; i++) k.sphere('grapes', 'glass-color-ruby', 0.009, L * 0.3 + (i % 3) * 0.015, 0.027 + Math.floor(i / 3) * 0.012, 0.05 - (i % 2) * 0.01, { segs: 8, rings: 6 });
    k.box('knife', 'metal-ss-polished', 0.09, 0.003, 0.015, -0.02, 0.02, 0.07, { r: 0, ry: 0.3 });
    return finish(k);
  },
});

const bread = acc({
  id: 'acc-bread-loaf-board', ko: '빵과 브레드 보드', en: 'Bread loaf on a board',
  params: [P.mat('board', '도마', 'Board', 'wood-beech-oil', 'wood'), P.len('length', '빵 길이', 'Loaf length', 0.3, 0.18, 0.45)],
  tags: ['bread', 'sourdough', 'bread board', 'bakery', '빵', '바게트', '브레드 보드', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.slab('board', p.board, roundRect(L + 0.12, 0.24, 0.02), 0.02, 0);
    k.sphere('loaf', 'wood-maple-honey', L / 2, 0, 0.02, 0, { thetaLength: PI / 2, scale: [1, 0.38, 0.42], ...C('#c48a4a') });
    for (let i = -1; i <= 1; i++) k.box('scores', 'wax-candle-ivory', 0.012, 0.004, 0.07, i * L * 0.22, 0.02 + L * 0.18, 0, { r: 0, rx: 0.3, ry: 0.5, ...C('#e7cf9e') });
    k.box('knife', 'metal-ss-polished', 0.22, 0.003, 0.025, 0, 0.022, 0.09, { r: 0 });
    k.box('knife', 'wood-am-walnut-oil', 0.1, 0.014, 0.02, 0.16, 0.027, 0.09, { r: 0.004 });
    return finish(k);
  },
});

const masonJars = acc({
  id: 'acc-mason-jars-trio', ko: '보관 유리병 세트', en: 'Storage jars trio',
  params: [P.mat('lid', '뚜껑', 'Lids', 'wood-bamboo-natural', 'wood'), P.len('height', '큰 병 높이', 'Tall jar height', 0.22, 0.14, 0.3)],
  tags: ['storage jars', 'mason jars', 'pantry', 'canisters', '유리병', '보관 용기', '밀폐 용기', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, cols = ['#e9dcc0', '#8b5a2b', '#d9b24c'];
    [[0.85, 1], [0.65, 0.9], [0.45, 0.8]].forEach(([s, rs], i) => {
      const h = H * s, r = 0.05 * rs, x = (i - 1) * 0.11;
      vessel(k, 'glass', 'glass-clear', r, h, x, 0, 0, { wall: 0.003 });
      k.cyl(`fill${i}`, 'paper', r - 0.004, r - 0.004, h * 0.6, x, 0.005, 0, { segs: k.seg(20, 8), ...C(cols[i]) });
      k.cyl('lids', p.lid, r + 0.002, r + 0.002, 0.018, x, h, 0, { segs: k.seg(20, 8) });
    });
    return finish(k);
  },
});

const cookieJar = acc({
  id: 'acc-cookie-jar', ko: '쿠키 항아리', en: 'Cookie jar',
  params: [P.mat('glaze', '유약', 'Glaze', 'ceramic-gloss-mint', 'ceramic'), P.len('height', '높이', 'Height', 0.22, 0.15, 0.3)],
  tags: ['cookie jar', 'biscuit jar', 'canister', 'kitchen', '쿠키 항아리', '과자 통', '도자기 통', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, r = H * 0.45;
    k.lathe('jar', p.glaze, [[0, 0], [r * 0.7, 0], [r, H * 0.3], [r * 0.95, H * 0.7], [r * 0.7, H * 0.82], [0, H * 0.82]], 0, 0, 0, { segs: k.seg(32, 10), smooth: 10 });
    k.lathe('lid', 'ceramic-gloss-white', [[0, 0], [r * 0.75, 0], [r * 0.6, H * 0.08], [r * 0.15, H * 0.1], [r * 0.2, H * 0.16], [0, H * 0.18]], 0, H * 0.82, 0, { segs: k.seg(28, 10) });
    return finish(k);
  },
});

const eggs = acc({
  id: 'acc-egg-basket', ko: '달걀 바구니', en: 'Wire egg basket',
  params: [P.mat('wire', '철망', 'Wire', 'metal-black', 'metal'), P.int('eggs', '달걀 수', 'Eggs', 8, 3, 12)],
  tags: ['egg basket', 'eggs', 'farmhouse', 'wire basket', '달걀 바구니', '계란', '철망 바구니', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.09, h = 0.12, n = k.seg(10, 6);
    for (const y of [0.005, h * 0.5, h]) k.add('wire', p.wire, T(new THREE.TorusGeometry(r * (0.85 + (y / h) * 0.15), 0.0025, 5, k.seg(28, 12)), 0, y, 0, PI / 2, 0, 0));
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; k.rod('wire', p.wire, [Math.cos(a) * r * 0.85, 0.005, Math.sin(a) * r * 0.85], [Math.cos(a) * r, h, Math.sin(a) * r], 0.002, { segs: 4 }); }
    k.tube('wire', p.wire, [[-r, h, 0], [-r * 0.6, h + 0.08, 0], [r * 0.6, h + 0.08, 0], [r, h, 0]], 0.003);
    const rr = rng(5);
    for (let i = 0; i < p.eggs; i++) {
      const a = i * 2.4, d = i === 0 ? 0 : r * 0.55 * Math.min(1, 0.4 + i * 0.12), y = 0.025 + Math.floor(i / 6) * 0.035;
      k.sphere('eggs', 'paint-biscuit-eggshell', 0.022, Math.cos(a) * d, y, Math.sin(a) * d, { segs: 12, rings: 8, scale: [1, 1.3, 1], rz: (rr() - 0.5) * 1.5 });
    }
    return finish(k);
  },
});

const cookbookStand = acc({
  id: 'acc-cookbook-stand', ko: '요리책 거치대', en: 'Cookbook stand',
  params: [P.mat('wood', '목재', 'Wood', 'wood-acacia-oil', 'wood'), P.num('tilt', '기울기(도)', 'Tilt (°)', 20, 10, 35, 1)],
  tags: ['cookbook stand', 'recipe holder', 'book stand', 'tablet stand', '요리책 거치대', '레시피', '독서대', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = (p.tilt * PI) / 180, W = 0.34, H = 0.26;
    k.box('stand', p.wood, W, H, 0.012, 0, H / 2 * Math.cos(a) + 0.02, -H / 2 * Math.sin(a), { r: 0.003, rx: -a });
    k.box('stand', p.wood, W, 0.02, 0.05, 0, 0.01, 0.015, { r: 0.003 });
    k.box('stand', p.wood, 0.02, H * 0.6, 0.012, 0, H * 0.3 * Math.cos(a * 2) + 0.01, -H * 0.55 * Math.sin(a), { r: 0.002, rx: a });
    // open book on the stand: cover behind two page blocks
    k.box('cover', 'book-red', W * 0.97, H * 0.88, 0.005, 0, H / 2 * Math.cos(a) + 0.03, -H / 2 * Math.sin(a) + 0.006, { r: 0.001, rx: -a });
    for (const s of [-1, 1]) k.box('pages', 'paper', W * 0.46, H * 0.85, 0.012, s * W * 0.235, H / 2 * Math.cos(a) + 0.03, -H / 2 * Math.sin(a) + 0.012, { r: 0, rx: -a, ry: -s * 0.08 });
    return finish(k);
  },
});

const flasks = acc({
  id: 'acc-thermos-bottles', ko: '보온병 두 개', en: 'Insulated flasks',
  params: [P.color('colour', '색', 'Colour', '#6f8f7a'), P.len('height', '높이', 'Height', 0.26, 0.18, 0.34)],
  tags: ['thermos', 'flask', 'water bottle', 'tumbler', '보온병', '텀블러', '물병', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.cyl('flask', 'metal-pc-sage', 0.036, 0.036, H * 0.88, -0.045, 0, 0, { segs: k.seg(24, 8), ...C(p.colour) });
    k.cyl('caps', 'metal-ss-brushed', 0.03, 0.033, H * 0.12, -0.045, H * 0.88, 0, { segs: k.seg(20, 8) });
    k.cyl('flask2', 'metal-ss-brushed', 0.042, 0.038, H * 0.6, 0.05, 0, 0.01, { segs: k.seg(24, 8) });
    k.cyl('caps', 'plastic-black', 0.043, 0.043, 0.02, 0.05, H * 0.6, 0.01, { segs: k.seg(20, 8) });
    return finish(k);
  },
});

const pitcher = acc({
  id: 'acc-water-pitcher-glasses', ko: '물병과 유리컵', en: 'Water pitcher and glasses',
  params: [P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass'), P.int('glasses', '컵 수', 'Glasses', 2, 1, 4)],
  tags: ['pitcher', 'jug', 'water glasses', 'carafe', '물병', '피처', '유리컵', '식탁 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = 0.24, r = 0.06;
    k.lathe('pitcher', p.glass, [[0, 0], [r, 0], [r * 1.05, H * 0.5], [r * 0.85, H], [r * 0.82, H], [r, H * 0.5], [r - 0.004, 0.006], [0, 0.006]], 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('water', 'water', r - 0.006, r - 0.004, H * 0.6, 0, 0.006, 0, { segs: k.seg(24, 8) });
    mugHandle(k, 'pitcher', p.glass, r, H * 0.9, 0, 0, 0, PI);
    for (let i = 0; i < p.glasses; i++) vessel(k, 'glasses', p.glass, 0.032, 0.1, 0.11 + (i % 2) * 0.075, 0, (i < 2 ? 0 : 0.07) + (i % 2) * 0.03 - 0.02, { wall: 0.0025, taper: 1.1 });
    return finish(k);
  },
});

const cocktail = acc({
  id: 'acc-cocktail-set', ko: '칵테일 셰이커 세트', en: 'Cocktail shaker set',
  params: [P.mat('metal', '금속', 'Metal', 'metal-gold-brushed', 'metal'), P.mat('tray', '트레이', 'Tray', 'stone-marble-nero-marquina', 'stone')],
  tags: ['cocktail shaker', 'bar tools', 'jigger', 'home bar', '칵테일 셰이커', '홈바', '바 도구', '파티'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.slab('tray', p.tray, roundRect(0.32, 0.18, 0.02), 0.012, 0);
    k.lathe('shaker', p.metal, [[0, 0], [0.04, 0], [0.045, 0.14], [0.04, 0.16], [0.02, 0.2], [0.012, 0.21], [0.014, 0.23], [0, 0.235]], -0.08, 0.012, 0, { segs: k.seg(24, 8) });
    k.lathe('jigger', p.metal, [[0, 0], [0.022, 0], [0.006, 0.035], [0.022, 0.07], [0.02, 0.07], [0.004, 0.035], [0, 0.034]], 0.03, 0.012, -0.03, { segs: k.seg(18, 8) });
    k.rod('spoon', p.metal, [0.08, 0.016, 0.05], [0.13, 0.016, -0.06], 0.002, { segs: 5 });
    vessel(k, 'glass', 'glass-crystal', 0.035, 0.08, 0.1, 0.012, 0.02, { wall: 0.003, taper: 1.15 });
    return finish(k);
  },
});

const lunchBox = acc({
  id: 'acc-lunch-box-stack', ko: '3단 도시락', en: 'Stacked lunch box',
  params: [P.color('colour', '색', 'Colour', '#b2483c'), P.int('tiers', '단 수', 'Tiers', 3, 1, 4)],
  tags: ['lunch box', 'bento', 'dosirak', 'food container', '도시락', '찬합', '벤토', '주방 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.18, D = 0.12, t = 0.055;
    for (let i = 0; i < p.tiers; i++) k.rbox(`tiers${i % 2}`, 'plastic-abs-gloss-red', W, t - 0.003, D, 0.012, 0, i * t + t / 2, 0, i % 2 ? C('#2b2b2b') : C(p.colour));
    k.rbox('lid', 'plastic-abs-gloss-black', W + 0.004, 0.012, D + 0.004, 0.006, 0, p.tiers * t + 0.006, 0);
    k.box('band', 'fabric-canvas-ecru', 0.03, p.tiers * t + 0.016, D + 0.008, 0, (p.tiers * t + 0.012) / 2, 0, { r: 0.002 });
    k.box('band', 'fabric-canvas-ecru', 0.03, 0.006, D * 0.6, 0, p.tiers * t + 0.016, 0, { r: 0.002 });
    return finish(k);
  },
});

/* ===================================================== bath and beauty */

const soapDish = acc({
  id: 'acc-soap-dish-bar', ko: '비누와 비누 받침', en: 'Soap bar on a dish',
  params: [P.mat('dish', '받침', 'Dish', 'wood-teak', 'wood'), P.color('soap', '비누 색', 'Soap colour', '#d9c7e6')],
  tags: ['soap dish', 'bar soap', 'bathroom', 'wash basin', '비누 받침', '비누', '욕실 소품', '세면대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < 5; i++) k.box('dish', p.dish, 0.13, 0.012, 0.012, 0, 0.006, (i - 2) * 0.018, { r: 0.003 });
    for (const s of [-1, 1]) k.box('dish', p.dish, 0.012, 0.01, 0.09, s * 0.05, 0.005, 0, { r: 0.002 });
    k.rbox('soap', 'wax-soap', 0.085, 0.028, 0.055, 0.012, 0, 0.026, 0, C(p.soap));
    return finish(k);
  },
});

const bathSalts = acc({
  id: 'acc-bath-salts-jars', ko: '입욕 소금 병', en: 'Bath salt jars',
  params: [P.mat('lid', '뚜껑', 'Lids', 'cork-natural', 'other'), P.color('salt', '소금 색', 'Salt colour', '#e7b6c6')],
  tags: ['bath salts', 'jars', 'apothecary', 'spa', '입욕제', '배스 솔트', '유리병', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    [[-0.05, 0.14, 0.04], [0.04, 0.1, 0.035]].forEach(([x, h, r], i) => {
      vessel(k, 'glass', 'glass-clear', r, h, x, 0, i * 0.02, { wall: 0.003 });
      k.cyl('salt', 'snow-packed', r - 0.004, r - 0.004, h * 0.7, x, 0.005, i * 0.02, { segs: k.seg(20, 8), ...(i === 0 ? C(p.salt) : {}) });
      k.cyl('lids', p.lid, r - 0.002, r - 0.004, 0.025, x, h - 0.006, i * 0.02, { segs: k.seg(18, 8) });
    });
    k.box('scoop', 'wood-bamboo-natural', 0.07, 0.006, 0.015, 0.02, 0.003, 0.07, { r: 0.002, ry: 0.4 });
    return finish(k);
  },
});

const ducks = acc({
  id: 'acc-rubber-ducks', ko: '고무 오리 인형', en: 'Rubber ducks',
  params: [P.int('count', '마리 수', 'Ducks', 3, 1, 5), P.len('size', '크기', 'Size', 0.08, 0.05, 0.14)],
  tags: ['rubber duck', 'bath toy', 'duckie', 'bathroom', '고무 오리', '목욕 장난감', '오리 인형', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * s * 1.1, sc = 1 - (i % 2) * 0.25, z = (i % 2) * s * 0.4;
      k.sphere('ducks', 'plastic-abs-gloss-yellow', s * 0.5 * sc, x, s * 0.35 * sc, z, { scale: [0.85, 0.7, 1.1], segs: k.seg(16, 8), rings: k.seg(10, 6) });
      k.sphere('ducks', 'plastic-abs-gloss-yellow', s * 0.28 * sc, x, s * 0.75 * sc, z + s * 0.2 * sc, { segs: k.seg(14, 8), rings: k.seg(10, 6) });
      k.sphere('beaks', 'plastic-abs-gloss-orange', s * 0.1 * sc, x, s * 0.72 * sc, z + s * 0.45 * sc, { scale: [1.2, 0.5, 1.2], segs: 8, rings: 6 });
    }
    return finish(k);
  },
});

const bathScale = acc({
  id: 'acc-bathroom-scale', placement: 'floor', ko: '체중계', en: 'Bathroom scale',
  params: [P.mat('top', '상판', 'Top', 'glass-tint-dark-grey', 'glass'), P.len('width', '폭', 'Width', 0.3, 0.26, 0.36)],
  tags: ['bathroom scale', 'weighing scale', 'digital scale', 'health', '체중계', '저울', '디지털 체중계', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width;
    k.slab('base', 'plastic-abs-matte-black', roundRect(W, W, 0.03), 0.016, 0.004);
    k.slab('top', p.top, roundRect(W, W, 0.03), 0.006, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.012, 0.012, 0.004, sx * W * 0.38, 0, sz * W * 0.38, { segs: 10 });
    k.box('display', 'screen-on-dark', 0.07, 0.001, 0.03, 0, 0.0265, -W * 0.33, { r: 0 });
    return finish(k);
  },
});

const apothecary = acc({
  id: 'acc-apothecary-jars', ko: '욕실 유리 보관함 세트', en: 'Bathroom apothecary jars',
  params: [P.mat('lid', '뚜껑', 'Lids', 'metal-ss-brushed', 'metal'), P.int('count', '병 수', 'Jars', 3, 1, 4)],
  tags: ['apothecary jars', 'cotton jar', 'bathroom storage', 'canisters', '면봉 통', '화장솜 통', '유리 보관함', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * 0.085, h = 0.1 + (i % 2) * 0.04;
      vessel(k, 'glass', 'glass-clear', 0.035, h, x, 0, 0, { wall: 0.003 });
      k.cyl(i % 2 ? 'swabs' : 'cotton', 'fabric-cotton-white', 0.03, 0.03, h * 0.65, x, 0.005, 0, { segs: k.seg(16, 8) });
      k.lathe('lids', p.lid, [[0, 0], [0.037, 0], [0.037, 0.012], [0.01, 0.018], [0.012, 0.03], [0, 0.032]], x, h, 0, { segs: k.seg(18, 8) });
    }
    return finish(k);
  },
});

const brushCup = acc({
  id: 'acc-makeup-brush-cup', ko: '메이크업 브러시 꽂이', en: 'Makeup brush cup',
  params: [P.mat('cup', '컵', 'Cup', 'ceramic-matte-clay-pink', 'ceramic'), P.int('brushes', '브러시 수', 'Brushes', 6, 2, 10)],
  tags: ['makeup brushes', 'brush holder', 'vanity', 'cosmetics', '메이크업 브러시', '브러시 꽂이', '화장대', '뷰티'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.04, h = 0.1;
    vessel(k, 'cup', p.cup, r, h, 0, 0, 0, { wall: 0.004 });
    for (let i = 0; i < p.brushes; i++) {
      const a = (i / p.brushes) * TAU, d = r * 0.5, tilt = 0.18, L = 0.15 + (i % 3) * 0.025;
      const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      const tip = [bx + Math.cos(a) * L * tilt, 0.01 + L, bz + Math.sin(a) * L * tilt];
      k.rod('handles', i % 2 ? 'wood-ebony-gloss' : 'metal-gold-rose-polished', [bx, 0.01, bz], [bx + Math.cos(a) * L * tilt * 0.75, 0.01 + L * 0.75, bz + Math.sin(a) * L * tilt * 0.75], 0.004, { segs: 6 });
      k.sphere('bristles', 'fur-black', 0.009 + (i % 2) * 0.004, tip[0], tip[1], tip[2], { segs: 8, rings: 6, scale: [1, 1.8, 1] });
    }
    return finish(k);
  },
});

const handMirror = acc({
  id: 'acc-hand-mirror-comb', ko: '손거울과 빗', en: 'Hand mirror and comb',
  params: [P.mat('frame', '테', 'Frame', 'metal-brass-polished', 'metal'), P.len('size', '거울 지름', 'Mirror diameter', 0.13, 0.09, 0.18)],
  tags: ['hand mirror', 'comb', 'hairbrush', 'vanity', '손거울', '빗', '화장대', '뷰티'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.size / 2;
    k.cyl('frame', p.frame, r, r, 0.012, 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('mirror', 'mirror', r - 0.006, r - 0.006, 0.002, 0, 0.012, 0, { segs: k.seg(32, 10) });
    k.box('frame', p.frame, 0.02, 0.012, r * 1.4, 0, 0.006, r + r * 0.65, { r: 0.004 });
    k.box('comb', 'wood-am-walnut-oil', 0.03, 0.006, 0.17, r + 0.05, 0.003, 0.03, { r: 0.002, ry: 0.15 });
    transformAdded(k, () => { for (let i = 0; i < 18; i++) k.box('comb', 'wood-am-walnut-oil', 0.018, 0.004, 0.002, 0.022, 0.002, (i - 8.5) * 0.0085, { r: 0 }); }, r + 0.05, 0, 0.03, 0.15);
    return finish(k);
  },
});

const cosmeticBag = acc({
  id: 'acc-cosmetic-bag', ko: '파우치', en: 'Cosmetic bag',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-satin-champagne', 'fabric'), P.len('width', '폭', 'Width', 0.22, 0.15, 0.3)],
  tags: ['cosmetic bag', 'makeup pouch', 'toiletry bag', 'travel', '파우치', '화장품 파우치', '세면 가방', '뷰티'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = W * 0.55, D = W * 0.4;
    k.soft('bag', p.fabric, W, H, D, H * 0.35, 0, H / 2, 0, { puff: 0.008 });
    k.box('zip', 'metal-gold-polished', W * 0.85, 0.004, 0.006, 0, H - 0.002, 0, { r: 0 });
    k.box('zip', 'metal-gold-polished', 0.012, 0.02, 0.004, W * 0.4, H - 0.012, 0.006, { r: 0.001 });
    k.cyl('lipstick', 'metal-gold-polished', 0.008, 0.008, 0.06, W * 0.6, 0.008, 0.02, { rz: PI / 2, segs: 10 });
    return finish(k);
  },
});

const nailRack = acc({
  id: 'acc-nail-polish-rack', ko: '매니큐어 진열대', en: 'Nail polish rack',
  params: [P.mat('rack', '선반', 'Rack', 'plastic-acrylic-clear', 'plastic'), P.int('tiers', '단 수', 'Tiers', 3, 1, 4)],
  tags: ['nail polish', 'manicure', 'display rack', 'vanity', '매니큐어', '네일', '진열대', '뷰티'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.24, cols = ['#c0392b', '#e78fb3', '#f3d6c6', '#6c3483', '#1f618d', '#2b2b2b', '#d4ac0d', '#17a589'];
    for (let t = 0; t < p.tiers; t++) {
      const y = t * 0.045, z = -t * 0.04;
      k.box('rack', p.rack, W, 0.006 + y, 0.04, 0, (0.006 + y) / 2, z, { r: 0.001 });
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.045;
        k.cyl('polish', 'glass-clear', 0.014, 0.014, 0.03, x, 0.006 + y, z, { segs: 10, ...C(cols[(i + t * 3) % cols.length]) });
        k.cyl('caps', 'plastic-black', 0.006, 0.006, 0.025, x, 0.036 + y, z, { segs: 8 });
      }
    }
    return finish(k);
  },
});

const hairDryer = acc({
  id: 'acc-hair-dryer', ko: '헤어드라이어', en: 'Hair dryer',
  params: [P.color('colour', '색', 'Colour', '#e9e4dc')],
  tags: ['hair dryer', 'blow dryer', 'hair care', 'vanity', '헤어드라이어', '드라이기', '헤어', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('body', 'plastic-abs-gloss-white', 0.04, 0.045, 0.2, -0.1, 0.045, 0, { rz: -PI / 2, segs: k.seg(22, 8), ...C(p.colour) });
    k.cyl('nozzle', 'plastic-abs-matte-grey', 0.03, 0.04, 0.05, 0.1, 0.045, 0, { rz: -PI / 2, segs: k.seg(18, 8) });
    k.cyl('grille', 'metal-black-mesh', 0.04, 0.04, 0.004, -0.104, 0.045, 0, { rz: -PI / 2, segs: k.seg(18, 8) });
    k.box('handle', 'plastic-abs-gloss-white', 0.04, 0.035, 0.15, -0.03, 0.02, 0.1, { r: 0.012, ...C(p.colour) });
    k.tube('cord', 'rubber-black', [[-0.03, 0.01, 0.17], [-0.06, 0.006, 0.24], [-0.15, 0.006, 0.2], [-0.2, 0.006, 0.1]], 0.004);
    return finish(k);
  },
});

const bathBombs = acc({
  id: 'acc-bath-bomb-bowl', ko: '배스 밤 그릇', en: 'Bowl of bath bombs',
  params: [P.mat('bowl', '그릇', 'Bowl', 'wood-teak', 'wood'), P.int('count', '개수', 'Count', 5, 2, 9)],
  tags: ['bath bombs', 'spa', 'bowl', 'gift', '배스 밤', '입욕제', '스파', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.11, h = 0.055, cols = ['#f4b6c2', '#b8d8e8', '#f7e3a1', '#c9b3e6', '#bfe3c0'];
    k.lathe('bowl', p.bowl, [[0, 0], [r * 0.6, 0], [r, h], [r * 0.95, h], [r * 0.55, 0.008], [0, 0.008]], 0, 0, 0, { segs: k.seg(32, 10) });
    for (let i = 0; i < p.count; i++) {
      const a = i * 2.4, d = i === 0 ? 0 : r * 0.5, y = i < 5 ? 0.035 : 0.065;
      k.sphere('bombs', 'wax-soap', 0.027, Math.cos(a) * d * (i < 5 ? 1 : 0.4), y, Math.sin(a) * d * (i < 5 ? 1 : 0.4), { segs: 12, rings: 8, ...C(cols[i % cols.length]) });
    }
    return finish(k);
  },
});

const shaving = acc({
  id: 'acc-shaving-set', ko: '면도기 거치대 세트', en: 'Shaving set on a stand',
  params: [P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal'), P.mat('handle', '손잡이', 'Handle', 'wood-ebony-oil', 'wood')],
  tags: ['shaving set', 'razor', 'shaving brush', 'grooming', '면도기', '면도 브러시', '그루밍', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('stand', p.metal, 0.05, 0.05, 0.01, 0, 0, 0, { segs: k.seg(28, 10), scale: [1.5, 1, 1] });
    k.cyl('stand', p.metal, 0.005, 0.005, 0.13, 0, 0.01, -0.02, { segs: 8 });
    k.box('stand', p.metal, 0.14, 0.006, 0.03, 0, 0.14, -0.005, { r: 0.002 });
    for (const s of [-1, 1]) {
      k.lathe('handles', p.handle, [[0, 0], [0.012, 0.005], [0.01, 0.05], [0.015, 0.06], [0, 0.065]], s * 0.045, 0.06, 0.008, { segs: k.seg(14, 6) });
    }
    k.sphere('brush', 'fur-grey', 0.02, -0.045, 0.06, 0.008, { scale: [1, 1.6, 1], segs: 10, rings: 8 });
    k.box('razor', p.metal, 0.04, 0.012, 0.008, 0.045, 0.06, 0.008, { r: 0.002 });
    return finish(k);
  },
});

export const ITEMS = [
  keyBowl, keyRack, tote, backpack, suitcase, handbag, fedora, sneakers, boots, slippers, umbrella, hangerRail, foldedClothes,
  remoteTray, coasters, magazines, boardGames, puzzle, album, snowGlobe, musicBox, binoculars, camera, headphones, vinylCrate, radio, tissueBox, perfume, trinket,
  mugs, moka, frenchPress, grinder, pourOver, mills, mortar, cheeseBoard, bread, masonJars, cookieJar, eggs, cookbookStand, flasks, pitcher, cocktail, lunchBox,
  soapDish, bathSalts, ducks, bathScale, apothecary, brushCup, handMirror, cosmeticBag, nailRack, hairDryer, bathBombs, shaving,
];
