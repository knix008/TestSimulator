// Further plants: dieffenbachia, croton, spider plant, agave, pampas grass in a vase, philodendron
// on a moss pole, weeping fig (ficus benjamina), potted lemon tree, ball and cone topiaries and a
// trough of geraniums. Leaves are procedural surfaces (helpers.js leafGeo / placeLeaf) merged per
// colour; every plant is seeded so it looks the same on every rebuild. See ARCHITECTURE.md §12.
import { THREE, Kit, P, rng, clamp, leafGeo, placeLeaf, addPot, variant } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const TAU = Math.PI * 2, GOLD = 2.39996;
const C = (color) => ({ overrides: { color } });
const seedP = () => P.int('seed', '모양', 'Variation', 1, 1, 30);
const potMat = (def = 'ceramic-matte') => P.mat('potMaterial', '화분 재질', 'Pot finish', def, 'ceramic');
const POT_STYLES = [['taper', '테이퍼', 'Tapered'], ['cylinder', '원통', 'Cylinder'], ['belly', '항아리', 'Belly'], ['bowl', '볼', 'Bowl']];

const OVAL = (t) => Math.sin(Math.PI * Math.min(1, t)) ** 0.6;
const LANCE = (t) => Math.sin(Math.PI * Math.min(1, t ** 0.7)) ** 0.9;
const STRAP = (t) => Math.min(1, 6 * t) * Math.min(1, (1 - t) * 2.5) ** 0.8;
const SPIKE = (t) => Math.max(0, 1 - t) ** 0.9 * Math.min(1, 4 * t + 0.4);
const HEART = (t) => Math.sin(Math.PI * (0.2 + 0.8 * Math.min(1, t))) ** 0.65 * (1 - 0.1 * t);

/** One leaf (grid surface) at base p, yaw / pitch / roll, merged by colour into 'leaves'. */
function leaf(k, L, W, p, yaw, pitch, color, { roll = 0, droop = 0.25, fold = 0.2, outline = OVAL, nu = 3, nv = 5, role = 'leaves', curl = 0 } = {}) {
  const g = leafGeo(L, W, { nu: k.hi ? nu : Math.max(1, Math.ceil(nu / 2)), nv: k.hi ? nv : Math.max(2, Math.ceil(nv / 2)), droop, fold, outline, curl });
  placeLeaf(g, p, yaw, pitch, roll);
  k.add(role, 'plant-leaf', g, C(color));
}

/** Stem tube through points. */
const stem = (k, pts, r, color = '#4e7436', role = 'stems') => k.tube(role, 'plant-stem', pts, r, { radial: k.seg(6, 3), segs: k.seg(10, 4), overrides: { color } });

/** Leaves scattered over an ellipsoid canopy (centre c, radii rx/ry). */
function canopy(k, c, rx, ry, n, rand, colors, L, W, o = {}) {
  const N = k.hi ? n : Math.round(n / 2.5);
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * GOLD + rand() * 0.4;
    const px = c[0] + Math.sin(a) * r * rx * (0.75 + 0.25 * rand()), pz = c[2] + Math.cos(a) * r * rx * (0.75 + 0.25 * rand()), py = c[1] + y * ry * (0.8 + 0.2 * rand());
    leaf(k, L * (0.8 + 0.4 * rand()), W, [px, py, pz], a + (rand() - 0.5) * 0.8, y * 0.9 + (rand() - 0.3) * 0.6, colors[i % colors.length], { nu: 1, nv: 2, droop: 0.15, fold: 0.1, ...o });
  }
}

/* ----------------------------------------------------------- foliage plants */

const dieffenbachia = mk({
  id: 'plant-dieffenbachia', category: 'plants', ko: '디펜바키아', en: 'Dieffenbachia (dumb cane)',
  params: [P.len('height', '높이', 'Height', 0.85, 0.5, 1.3), P.int('stems', '줄기 수', 'Stems', 4, 2, 7), potMat('ceramic-white'), seedP()],
  tags: ['dieffenbachia', 'dumb cane', 'variegated', 'indoor plant', '디펜바키아', '관엽식물', '실내 식물', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 17 + 3), soil = addPot(k, { r: 0.15, h: 0.28, style: 'cylinder', mat: p.potMaterial });
    const H = p.height - soil;
    for (let s = 0; s < p.stems; s++) {
      const a = s * GOLD, top = soil + H * (0.55 + 0.3 * rand()), x = Math.sin(a) * 0.05, z = Math.cos(a) * 0.05;
      stem(k, [[x, soil - 0.01, z], [x * 1.3, (soil + top) / 2, z * 1.3], [x * 1.6, top, z * 1.6]], 0.012, '#7f9a5a');
      const n = k.hi ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const y = top - (i / n) * H * 0.35, yaw = a + i * 2.1;
        leaf(k, 0.26 + 0.06 * rand(), 0.13, [x * 1.6, y, z * 1.6], yaw, 0.55 - i * 0.12, i % 2 ? '#c8d8a0' : '#3f6b2c', { droop: 0.35, fold: 0.15, nu: 3, nv: 6 });
      }
    }
    return finish(k);
  },
});

const croton = mk({
  id: 'plant-croton', category: 'plants', ko: '크로톤(변엽목)', en: 'Croton',
  params: [P.len('height', '높이', 'Height', 0.7, 0.4, 1.1), potMat('ceramic-terracotta'), P.pick('pot', '화분 모양', 'Pot shape', 'belly', POT_STYLES), seedP()],
  tags: ['croton', 'codiaeum', 'colourful leaves', 'tropical', '크로톤', '변엽목', '관엽식물', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 29 + 5), soil = addPot(k, { r: 0.14, h: 0.26, style: p.pot, mat: p.potMaterial });
    const H = p.height - soil, colors = ['#b8321e', '#d9a21c', '#2f5a24'];
    for (let b = 0; b < 4; b++) {
      const a = b * 1.6 + rand() * 0.4, top = soil + H * (0.6 + 0.3 * rand());
      const tip = [Math.sin(a) * 0.12, top, Math.cos(a) * 0.12];
      stem(k, [[0, soil - 0.01, 0], [tip[0] * 0.5, (soil + top) / 2, tip[2] * 0.5], tip], 0.008, '#6b5236');
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = 0.45 + 0.55 * (i / n), pt = [tip[0] * t, soil + (top - soil) * t, tip[2] * t];
        leaf(k, 0.17 + 0.05 * rand(), 0.06, pt, a + i * GOLD, 0.2 + rand() * 0.5, colors[(i + b) % 3], { outline: LANCE, droop: 0.3, fold: 0.25, nu: 2, nv: 5 });
      }
    }
    return finish(k);
  },
});

const spider = mk({
  id: 'plant-spider-plant', category: 'plants', ko: '접란(스파이더 플랜트)', en: 'Spider plant',
  params: [P.len('spread', '퍼짐', 'Spread', 0.55, 0.35, 0.8), P.int('runners', '러너 수', 'Runners', 3, 0, 6), potMat('ceramic-white'), seedP()],
  tags: ['spider plant', 'chlorophytum', 'arching leaves', 'air purifying', '접란', '스파이더 플랜트', '공기정화 식물', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 11 + 2), soil = addPot(k, { r: 0.12, h: 0.2, style: 'taper', mat: p.potMaterial });
    const n = 34, S = p.spread;
    for (let i = 0; i < n; i++) {
      const a = i * GOLD;
      leaf(k, S * (0.5 + 0.5 * rand()), 0.022, [Math.sin(a) * 0.015, soil, Math.cos(a) * 0.015], a, 0.7 + rand() * 0.6, i % 2 ? '#e7ecc8' : '#4d8a32', { outline: STRAP, droop: 1.0, fold: 0.3, nu: 1, nv: 6 });
    }
    for (let r = 0; r < p.runners; r++) {
      const a = r * 2.3 + 0.5, L = S * 0.9, end = [Math.sin(a) * L, soil - 0.05, Math.cos(a) * L];
      stem(k, [[0, soil, 0], [end[0] * 0.5, soil + 0.12, end[2] * 0.5], end], 0.003, '#c9d49a');
      for (let j = 0; j < 7; j++) leaf(k, 0.09, 0.015, end, j * 0.9, 0.5, '#4d8a32', { outline: STRAP, droop: 0.6, nu: 1, nv: 3 });
    }
    return finish(k);
  },
});

const agave = mk({
  id: 'plant-agave', category: 'plants', ko: '아가베(용설란)', en: 'Agave',
  params: [P.len('size', '크기', 'Size', 0.6, 0.35, 1.0), potMat('concrete'), seedP()],
  tags: ['agave', 'century plant', 'succulent', 'rosette', '아가베', '용설란', '다육식물', '선인장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 13 + 1), soil = addPot(k, { r: 0.18, h: 0.18, style: 'bowl', mat: p.potMaterial });
    const S = p.size, rings = 4;
    for (let r = 0; r < rings; r++) {
      const per = k.hi ? 8 : 6;
      for (let i = 0; i < per; i++) {
        const a = i * (TAU / per) + r * 0.4, pitch = 0.25 + r * 0.32;
        leaf(k, S * (0.55 - r * 0.08) * (0.9 + 0.2 * rand()), 0.09 - r * 0.012, [0, soil, 0], a, pitch, r % 2 ? '#7a9e9a' : '#6a8f8a', { outline: SPIKE, droop: 0.12, fold: 0.6, nu: 2, nv: 5 });
      }
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------ arrangements */

const pampas = mk({
  id: 'plant-pampas-vase', category: 'plants', ko: '팜파스 그라스 화병', en: 'Pampas grass in a vase',
  params: [P.len('height', '높이', 'Height', 1.1, 0.6, 1.6), P.int('stems', '줄기 수', 'Stems', 7, 3, 12), P.mat('vase', '화병', 'Vase', 'ceramic-matte', 'ceramic'), seedP()],
  tags: ['pampas grass', 'dried flowers', 'boho', 'vase', '팜파스', '드라이 플라워', '보헤미안', '화병'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 7 + 9), vh = 0.36;
    k.lathe('vase', p.vase, [[0, 0], [0.08, 0], [0.12, 0.08], [0.13, 0.18], [0.08, 0.3], [0.045, 0.34], [0.05, vh], [0.04, vh], [0, vh - 0.05]], 0, 0, 0, { smooth: 18, segs: k.seg(28, 10) });
    for (let i = 0; i < p.stems; i++) {
      const a = i * GOLD, lean = 0.12 + 0.2 * rand(), top = p.height * (0.8 + 0.2 * rand());
      const tip = [Math.sin(a) * lean * top * 0.5, top, Math.cos(a) * lean * top * 0.5];
      stem(k, [[0, vh - 0.02, 0], [tip[0] * 0.4, (vh + top) * 0.5, tip[2] * 0.4], tip], 0.004, '#b7a27a');
      const plumeL = 0.3;
      k.sphere('plumes', 'fabric-linen-beige', 0.05, tip[0] * 0.97, top - plumeL / 2 + 0.05, tip[2] * 0.97, { segs: k.seg(12, 6), rings: k.seg(10, 5), scale: [1, plumeL / 0.1, 1] });
    }
    return finish(k);
  },
});

const mossPole = mk({
  id: 'plant-moss-pole-philodendron', category: 'plants', ko: '수태봉 필로덴드론', en: 'Philodendron on a moss pole',
  params: [P.len('height', '높이', 'Height', 1.2, 0.7, 1.8), potMat('ceramic-matte'), P.pick('pot', '화분 모양', 'Pot shape', 'cylinder', POT_STYLES), seedP()],
  tags: ['philodendron', 'moss pole', 'climbing plant', 'heartleaf', '필로덴드론', '수태봉', '덩굴 식물', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 19 + 4), soil = addPot(k, { r: 0.16, h: 0.3, style: p.pot, mat: p.potMaterial });
    const top = p.height - 0.05;
    k.cyl('pole', 'rattan', 0.03, 0.035, top - soil + 0.1, 0, soil - 0.1, 0, { segs: k.seg(14, 6) });
    const n = k.hi ? 26 : 12;
    for (let i = 0; i < n; i++) {
      const t = i / n, y = soil + (top - soil) * t, a = i * 1.9;
      const at = [Math.sin(a) * 0.035, y, Math.cos(a) * 0.035];
      leaf(k, 0.17 + 0.08 * (1 - t) + 0.03 * rand(), 0.14, at, a, -0.05 + rand() * 0.3, i % 3 ? '#2f5d27' : '#3f7a31', { outline: HEART, droop: 0.4, fold: 0.12, nu: 3, nv: 5 });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------------ trees */

const ficus = mk({
  id: 'plant-ficus-benjamina', category: 'plants', ko: '벤자민 고무나무', en: 'Weeping fig (ficus benjamina)',
  params: [P.len('height', '높이', 'Height', 1.6, 0.9, 2.2), potMat('ceramic-white'), P.pick('pot', '화분 모양', 'Pot shape', 'taper', POT_STYLES), seedP()],
  tags: ['ficus benjamina', 'weeping fig', 'indoor tree', 'small leaves', '벤자민', '벤자민 고무나무', '실내 나무', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 23 + 8), soil = addPot(k, { r: 0.2, h: 0.36, style: p.pot, mat: p.potMaterial });
    const H = p.height, cy = soil + (H - soil) * 0.62, rx = (H - soil) * 0.32, ry = (H - soil) * 0.36;
    // braided trunk: three intertwined stems
    for (let s = 0; s < 3; s++) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6, a = s * (TAU / 3) + t * 5; pts.push([Math.sin(a) * 0.018, soil - 0.02 + (cy - soil) * t, Math.cos(a) * 0.018]); }
      stem(k, pts, 0.012, '#8c7b62', 'trunk');
    }
    canopy(k, [0, cy, 0], rx, ry, 360, rand, ['#2f5a24', '#4b7a35', '#3a6a2c'], 0.07, 0.035, { droop: 0.3 });
    return finish(k);
  },
});

const lemon = mk({
  id: 'plant-lemon-tree', category: 'plants', ko: '레몬 나무 화분', en: 'Potted lemon tree',
  params: [P.len('height', '높이', 'Height', 1.3, 0.8, 1.9), P.int('fruit', '열매 수', 'Lemons', 9, 0, 20), potMat('ceramic-terracotta'), seedP()],
  tags: ['lemon tree', 'citrus', 'fruit tree', 'mediterranean', '레몬 나무', '귤나무', '과실수', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 37 + 6), soil = addPot(k, { r: 0.22, h: 0.34, style: 'taper', mat: p.potMaterial });
    const H = p.height, cy = soil + (H - soil) * 0.66, rx = (H - soil) * 0.33, ry = (H - soil) * 0.3;
    stem(k, [[0, soil - 0.02, 0], [0.01, (soil + cy) / 2, 0], [0, cy, 0.01]], 0.02, '#7a6650', 'trunk');
    for (let b = 0; b < 4; b++) { const a = b * 1.57 + 0.3; stem(k, [[0, cy - 0.1, 0], [Math.sin(a) * rx * 0.6, cy + 0.02, Math.cos(a) * rx * 0.6]], 0.008, '#7a6650', 'trunk'); }
    canopy(k, [0, cy, 0], rx, ry, 240, rand, ['#2c5a22', '#3d6e2c'], 0.1, 0.05, { droop: 0.2 });
    for (let i = 0; i < p.fruit; i++) {
      const a = i * GOLD + 0.3, y = cy + (rand() - 0.6) * ry * 1.3, r = Math.sqrt(Math.max(0.1, 1 - ((y - cy) / ry) ** 2)) * rx * 0.95;
      k.sphere('fruit', 'plant-leaf', 0.035, Math.sin(a) * r, y, Math.cos(a) * r, { segs: k.seg(12, 6), rings: k.seg(8, 4), scale: [1, 1.25, 1], overrides: { color: '#e6c22c' } });
    }
    return finish(k);
  },
});

/* --------------------------------------------------------------- topiaries */

function topiary(kind) {
  return (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 41 + (kind === 'cone' ? 2 : 1));
    const soil = addPot(k, { r: 0.17, h: 0.3, style: kind === 'cone' ? 'cylinder' : 'taper', mat: p.potMaterial });
    const H = p.height;
    if (kind === 'ball') {
      const R = clamp(H * 0.22, 0.12, 0.35), cy = H - R;
      k.cyl('trunk', 'wood-dark', 0.014, 0.018, cy - soil + 0.02, 0, soil - 0.02, 0, { segs: k.seg(10, 5) });
      k.sphere('core', 'plant-leaf', R * 0.92, 0, cy, 0, { segs: k.seg(20, 8), rings: k.seg(14, 6), overrides: { color: '#24451c' } });
      canopy(k, [0, cy, 0], R, R, 420, rand, ['#2f5a24', '#3f6e2e'], 0.05, 0.03, { droop: 0.1 });
    } else {
      const ch = H - soil - 0.04, R = clamp(ch * 0.3, 0.12, 0.4), y0 = soil + 0.04;
      k.cyl('core', 'plant-leaf', 0.0, R * 0.92, ch, 0, y0, 0, { segs: k.seg(20, 8), overrides: { color: '#24451c' } });
      const N = k.hi ? 380 : 150;
      for (let i = 0; i < N; i++) {
        const t = Math.sqrt((i + 0.5) / N), y = y0 + ch * (1 - t), r = R * t, a = i * GOLD;
        leaf(k, 0.045, 0.025, [Math.sin(a) * r, y, Math.cos(a) * r], a, 0.3 + rand() * 0.4, i % 2 ? '#2f5a24' : '#3f6e2e', { nu: 1, nv: 2, droop: 0.1, fold: 0.1 });
      }
    }
    return finish(k);
  };
}

const ballTopiary = mk({
  id: 'plant-topiary-ball', category: 'plants', ko: '볼 토피어리', en: 'Ball topiary',
  params: [P.len('height', '높이', 'Height', 1.0, 0.6, 1.6), potMat('ceramic-white'), seedP()],
  tags: ['topiary', 'ball topiary', 'boxwood', 'clipped', '토피어리', '회양목', '구형 토피어리', '화분'],
  build: topiary('ball'),
});
const coneTopiary = mk({
  id: 'plant-topiary-cone', category: 'plants', ko: '원뿔 토피어리', en: 'Cone topiary',
  params: [P.len('height', '높이', 'Height', 1.2, 0.6, 1.8), potMat('ceramic-matte'), seedP()],
  tags: ['topiary', 'cone topiary', 'cypress', 'clipped', '토피어리', '원뿔 토피어리', '측백', '화분'],
  build: topiary('cone'),
});

const geraniums = mk({
  id: 'plant-geranium-trough', category: 'plants', ko: '제라늄 화분 트로프', en: 'Geranium trough',
  params: [P.len('length', '길이', 'Length', 0.8, 0.4, 1.4), P.int('plants', '포기 수', 'Plants', 4, 2, 7), P.mat('trough', '트로프', 'Trough', 'ceramic-terracotta', 'ceramic'), P.color('bloom', '꽃 색', 'Bloom colour', '#d1283a'), seedP()],
  tags: ['geranium', 'pelargonium', 'flower trough', 'balcony flowers', '제라늄', '꽃 화분', '베란다 화분', '꽃'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 43 + 3), L = p.length, th = 0.17, td = 0.2;
    const prof = new THREE.Shape([new THREE.Vector2(-L / 2 + 0.02, 0), new THREE.Vector2(L / 2 - 0.02, 0), new THREE.Vector2(L / 2, th), new THREE.Vector2(-L / 2, th)]);
    k.panel('trough', p.trough, prof, td, 0, 0, 0, { bevel: 0.006 });
    k.box('soil', 'soil', L - 0.03, 0.01, td - 0.03, 0, th + 0.002, 0, { r: 0 });
    const n = clamp(Math.round(p.plants), 2, 7);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (L * (i + 0.5)) / n;
      for (let j = 0; j < (k.hi ? 9 : 5); j++) {
        const a = j * GOLD + rand();
        leaf(k, 0.08, 0.07, [x, th, 0], a, 0.35 + 0.3 * rand(), '#3d6b2a', { outline: HEART, droop: 0.2, fold: 0.05, nu: 2, nv: 3 });
      }
      for (let f = 0; f < 2; f++) {
        const fx = x + (f - 0.5) * 0.05, fy = th + 0.2 + 0.05 * rand();
        stem(k, [[x, th, 0], [fx, fy - 0.05, 0.01], [fx, fy, 0.01]], 0.003, '#4e7436');
        k.sphere('blooms', 'plant-leaf', 0.04, fx, fy + 0.02, 0.01, { segs: k.seg(10, 6), rings: k.seg(8, 4), overrides: { color: p.bloom } });
      }
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- variants */

const V = [
  variant(geraniums, 'pink', '분홍 제라늄 트로프', 'Pink geranium trough', { bloom: '#e46f9a' }, { tags: ['pink', '분홍'] }),
  variant(ballTopiary, 'double', '대형 볼 토피어리', 'Tall ball topiary', { height: 1.5 }, { tags: ['tall', '대형'] }),
];

export const ITEMS = [dieffenbachia, croton, spider, agave, pampas, mossPole, ficus, lemon, ballTopiary, coneTopiary, geraniums, ...V];
