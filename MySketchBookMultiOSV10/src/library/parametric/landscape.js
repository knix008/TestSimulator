// Landscaping (조경) category, part 1: trees (Korean red pine, shaped garden pine, cherry, maple,
// zelkova, ginkgo, birch clump, magnolia, crape myrtle, persimmon, apple, olive, cypress, willow,
// dogwood, palm, spruce, metasequoia, standard ball tree, bamboo grove), shrubs and topiary
// (boxwood ball / hedge, privet hedge, cone, spiral, tiered poms, azalea, hydrangea, lavender row,
// pampas, fountain grass, hosta, fern, rose bush, standard rose, forsythia, creeping juniper, yew,
// camellia) and ground covers (lawns, gravel, pebbles, bark, flower bed, meadow, moss, sedum,
// artificial turf). Canopies are jittered blobs (detail follows the quality), trunks are tubes.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, rng } from './helpers.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { C } from './accessories-plus.js';

const PI = Math.PI;
export const LSC = 'landscape';
/** A landscaping entry: floor placement unless stated. */
export const lsc = (def) => mk({ category: LSC, placement: 'floor', ...def });

/** A soft, lumpy foliage blob of radius r (scale = [sx, sy, sz]) centred at (x, y, z). */
export function blob(k, role, mat, r, x, y, z, seed = 1, { scale = [1, 1, 1], detail, jitter = 0.18, o = {} } = {}) {
  let g = new THREE.IcosahedronGeometry(r, detail ?? (k.hi ? 2 : 1));
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  const pos = g.attributes.position, R = rng(seed);
  const bumps = [0, 1, 2].map(() => [R() * 6, R() * 6, R() * 6]);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    let n = 0;
    for (const [a, b, c] of bumps) n += Math.sin(vx / r * 3 + a) * Math.sin(vy / r * 3 + b) * Math.sin(vz / r * 3 + c);
    const f = 1 + (n / 3) * jitter * 2;
    pos.setXYZ(i, vx * f * scale[0], vy * f * scale[1], vz * f * scale[2]);
  }
  g.computeVertexNormals();
  g.translate(x, y, z);
  return k.add(role, mat, g, o);
}

/** Bent trunk / branch through points with radius r → r2 (tapers by segment). */
export function trunk(k, mat, pts, r, r2 = r * 0.5, o = {}) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = r + (r2 - r) * (i / n), rb = r + (r2 - r) * ((i + 1) / n);
    k.rod('trunk', mat, pts[i], pts[i + 1], rb, { r2: ra, segs: k.seg(12, 5), ...o });
    if (i > 0) k.sphere('trunk', mat, ra, ...pts[i], { segs: k.seg(10, 5), rings: k.seg(6, 3), ...o });
  }
}

/** Canopy of `n` blobs scattered in an ellipsoid (rx, ry, rz) around (x, y, z). */
export function canopy(k, mat, n, rx, ry, rz, x, y, z, seed, { size = 0.45, o = {}, role = 'leaves' } = {}) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = R() * PI * 2, e = (R() - 0.3) * PI * 0.7, d = 0.35 + R() * 0.65;
    const bx = x + Math.cos(a) * Math.cos(e) * rx * d, by = y + Math.sin(e) * ry * d, bz = z + Math.sin(a) * Math.cos(e) * rz * d;
    blob(k, role, mat, Math.min(rx, rz) * size * (0.7 + R() * 0.5), bx, by, bz, seed * 7 + i, { scale: [1, 0.8, 1], detail: 1, o });
  }
}

/** A deciduous tree: trunk to height th, canopy ellipsoid; returns nothing. */
function broadleaf(k, p, { trunkMat = 'plant-bark', leaf = 'plant-maple-green', th, cw, ch, lean = 0.05, seed = 3, blobs = 9, branches = 3, o = {} }) {
  const R = rng(seed);
  const top = [Math.sin(lean) * th, th, 0];
  trunk(k, trunkMat, [[0, 0, 0], [top[0] * 0.4, th * 0.5, 0], top], cw * 0.06 + 0.04, cw * 0.025 + 0.02);
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * PI * 2 + R();
    k.rod('trunk', trunkMat, [top[0] * 0.7, th * 0.8, 0], [top[0] + Math.cos(a) * cw * 0.3, th + ch * 0.2, Math.sin(a) * cw * 0.3], cw * 0.012 + 0.01, { r2: cw * 0.02 + 0.015, segs: k.seg(8, 4) });
  }
  canopy(k, leaf, blobs, cw / 2, ch / 2, cw / 2, top[0], th + ch * 0.4, 0, seed, { o });
}

const TREE = (key, ko, en, tags, def, build) => lsc({
  id: `lsc-tree-${key}`, ko, en,
  params: [P.len('height', '높이', 'Height', def, def * 0.5, Math.min(def * 1.5, 12)), P.num('spread', '수관 폭 비율', 'Crown spread', 1, 0.6, 1.4, 0.05), P.pick('season', '계절', 'Season', 'summer', [['spring', '봄', 'Spring'], ['summer', '여름', 'Summer'], ['autumn', '가을', 'Autumn']])],
  tags: [...tags, 'tree', 'landscape tree', '나무', '조경수', '정원수'],
  build: (p, ctx) => { const k = new Kit(ctx); build(k, p); return finish(k); },
});

const SEASON = (p, spring, summer, autumn) => (p.season === 'spring' ? spring : p.season === 'autumn' ? autumn : summer);

/* ============================================================ trees */

const trees = [
  TREE('korean-red-pine', '소나무 (적송)', 'Korean red pine', ['red pine', 'pine tree', '소나무', '적송', '육송'], 6, (k, p) => {
    const h = p.height, R = rng(11);
    trunk(k, 'plant-bark', [[0, 0, 0], [0.25, h * 0.3, 0.05], [-0.1, h * 0.6, 0.1], [0.2, h * 0.85, 0]], 0.16 * h / 6, 0.06 * h / 6, C('#8a4a2e'));
    for (let i = 0; i < 6; i++) {
      const y = h * (0.5 + i * 0.09), a = i * 2.2 + R(), L = h * 0.25 * p.spread * (1 - i * 0.08);
      const bx = Math.cos(a) * L, bz = Math.sin(a) * L;
      k.rod('trunk', 'plant-bark', [0.05, y - 0.2, 0.05], [bx, y, bz], 0.04, { r2: 0.07, segs: k.seg(8, 4), ...C('#8a4a2e') });
      blob(k, 'leaves', 'plant-pine', L * 0.55, bx, y + 0.12, bz, 20 + i, { scale: [1.3, 0.45, 1.3], detail: 1 });
    }
  }),
  TREE('shaped-garden-pine', '조형 소나무 (정원용)', 'Cloud-pruned garden pine', ['niwaki', 'pruned pine', 'bonsai style', '조형 소나무', '정원 소나무', '분재형'], 3, (k, p) => {
    const h = p.height;
    trunk(k, 'plant-bark', [[0, 0, 0], [0.3, h * 0.35, 0], [-0.15, h * 0.65, 0.1], [0.1, h * 0.95, 0]], 0.1 * h / 3, 0.04, C('#6b4a35'));
    for (const [x, y, z, r] of [[0.5, 0.45, 0.1, 0.5], [-0.45, 0.62, 0.15, 0.45], [0.35, 0.82, -0.2, 0.4], [0.1, 1.0, 0, 0.35]]) blob(k, 'leaves', 'plant-pine', r * h / 3 * p.spread, x * h / 3 * p.spread, y * h, z * h / 3, Math.round(x * 100), { scale: [1.2, 0.4, 1.2], detail: k.hi ? 2 : 1 });
  }),
  TREE('cherry-blossom', '벚나무', 'Cherry blossom tree', ['cherry tree', 'sakura', '벚나무', '벚꽃', '왕벚나무'], 5, (k, p) => {
    broadleaf(k, p, { th: p.height * 0.4, cw: p.height * 0.9 * p.spread, ch: p.height * 0.6, leaf: SEASON(p, 'plant-petal-cherry', 'plant-maple-green', 'plant-maple-orange'), seed: 5, branches: 4, trunkMat: 'plant-bark-grey' });
  }),
  TREE('japanese-maple', '단풍나무 (홍단풍)', 'Japanese maple', ['maple', 'red maple', '단풍나무', '홍단풍', '청단풍'], 3.5, (k, p) => {
    broadleaf(k, p, { th: p.height * 0.35, cw: p.height * 1.0 * p.spread, ch: p.height * 0.65, leaf: SEASON(p, 'plant-maple-red', 'plant-maple-red', 'plant-maple-orange'), seed: 7, blobs: 11, lean: 0.12 });
  }),
  TREE('zelkova', '느티나무', 'Zelkova', ['zelkova', 'shade tree', '느티나무', '정자나무', '그늘나무'], 7, (k, p) => {
    broadleaf(k, p, { th: p.height * 0.35, cw: p.height * 0.8 * p.spread, ch: p.height * 0.65, leaf: SEASON(p, 'plant-birch', 'plant-maple-green', 'plant-maple-orange'), seed: 9, blobs: 12, branches: 5 });
  }),
  TREE('ginkgo', '은행나무', 'Ginkgo tree', ['ginkgo', 'maidenhair tree', '은행나무', '가로수', '노란 단풍'], 7, (k, p) => {
    const h = p.height;
    trunk(k, 'plant-bark-grey', [[0, 0, 0], [0, h * 0.5, 0], [0, h * 0.95, 0]], 0.14 * h / 7, 0.04);
    blob(k, 'leaves', SEASON(p, 'plant-birch', 'plant-maple-green', 'plant-petal-sunflower'), h * 0.22 * p.spread, 0, h * 0.62, 0, 31, { scale: [1, 1.9, 1] });
    canopy(k, SEASON(p, 'plant-birch', 'plant-maple-green', 'plant-petal-sunflower'), 6, h * 0.2 * p.spread, h * 0.3, h * 0.2 * p.spread, 0, h * 0.6, 0, 32);
  }),
  TREE('birch-clump', '자작나무 (3줄기)', 'Birch clump', ['birch', 'multi-stem', 'white bark', '자작나무', '다간형', '흰 수피'], 6, (k, p) => {
    const h = p.height;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2, lx = Math.cos(a) * 0.4 * p.spread, lz = Math.sin(a) * 0.4 * p.spread;
      trunk(k, 'plant-birch-bark', [[Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08], [lx * 0.5, h * 0.5, lz * 0.5], [lx, h * (0.85 - i * 0.05), lz]], 0.07, 0.03);
      canopy(k, SEASON(p, 'plant-birch', 'plant-birch', 'plant-petal-sunflower'), 4, h * 0.14 * p.spread, h * 0.22, h * 0.14 * p.spread, lx, h * (0.8 - i * 0.05), lz, 40 + i, { size: 0.6 });
    }
  }),
  TREE('magnolia', '목련', 'Magnolia', ['magnolia', 'flowering tree', '목련', '백목련', '봄꽃나무'], 5, (k, p) => {
    broadleaf(k, p, { th: p.height * 0.3, cw: p.height * 0.75 * p.spread, ch: p.height * 0.7, leaf: SEASON(p, 'plant-petal-white', 'plant-lemon-leaf', 'plant-oak-autumn'), seed: 13, blobs: 10, trunkMat: 'plant-bark-grey' });
  }),
  TREE('crape-myrtle', '배롱나무', 'Crape myrtle', ['crape myrtle', 'summer flowering', '배롱나무', '목백일홍', '여름꽃나무'], 4, (k, p) => {
    const h = p.height;
    for (let i = 0; i < 3; i++) { const a = i * 2.1; trunk(k, 'plant-bark-palm', [[0, 0, 0], [Math.cos(a) * 0.3, h * 0.4, Math.sin(a) * 0.3], [Math.cos(a) * 0.6 * p.spread, h * 0.65, Math.sin(a) * 0.6 * p.spread]], 0.07, 0.03, C('#c9a68a')); }
    canopy(k, SEASON(p, 'plant-maple-green', 'plant-petal-azalea', 'plant-maple-orange'), 10, h * 0.4 * p.spread, h * 0.25, h * 0.4 * p.spread, 0, h * 0.72, 0, 51);
  }),
  TREE('persimmon', '감나무 (열매)', 'Persimmon tree with fruit', ['persimmon', 'fruit tree', '감나무', '과실수', '홍시'], 5, (k, p) => {
    broadleaf(k, p, { th: p.height * 0.35, cw: p.height * 0.85 * p.spread, ch: p.height * 0.6, leaf: SEASON(p, 'plant-lemon-leaf', 'plant-lemon-leaf', 'plant-maple-orange'), seed: 17, blobs: 10 });
    if (p.season !== 'spring') { const R = rng(18); for (let i = 0; i < 14; i++) { const a = R() * PI * 2, rr = p.height * 0.35 * p.spread * Math.sqrt(R()); k.sphere('fruit', 'plant-fruit-persimmon', 0.04, Math.cos(a) * rr, p.height * (0.45 + R() * 0.4), Math.sin(a) * rr, { segs: 10, rings: 6, scale: [1, 0.8, 1] }); } }
  }),
  TREE('apple', '사과나무 (열매)', 'Apple tree with fruit', ['apple tree', 'orchard', '사과나무', '과수원', '과실수'], 4, (k, p) => {
    broadleaf(k, p, { th: p.height * 0.35, cw: p.height * 0.9 * p.spread, ch: p.height * 0.55, leaf: SEASON(p, 'plant-petal-white', 'plant-lemon-leaf', 'plant-oak-autumn'), seed: 19, blobs: 10, lean: 0.1 });
    if (p.season !== 'spring') { const R = rng(20); for (let i = 0; i < 16; i++) { const a = R() * PI * 2, rr = p.height * 0.38 * p.spread * Math.sqrt(R()); k.sphere('fruit', 'plant-fruit-apple-red', 0.035, Math.cos(a) * rr + p.height * 0.03, p.height * (0.42 + R() * 0.4), Math.sin(a) * rr, { segs: 10, rings: 6 }); } }
  }),
  TREE('olive', '올리브나무', 'Olive tree', ['olive tree', 'mediterranean', '올리브나무', '지중해 정원', '실버 잎'], 3.5, (k, p) => {
    const h = p.height;
    trunk(k, 'plant-bark-grey', [[0, 0, 0], [0.15, h * 0.2, 0], [-0.1, h * 0.4, 0.05], [0.05, h * 0.5, 0]], 0.14, 0.06);
    canopy(k, 'plant-olive', 12, h * 0.38 * p.spread, h * 0.22, h * 0.38 * p.spread, 0, h * 0.68, 0, 61, { size: 0.5 });
  }),
  TREE('italian-cypress', '이탈리안 사이프러스', 'Italian cypress', ['cypress', 'columnar tree', 'sempervirens', '사이프러스', '측백', '원뿔형 나무'], 7, (k, p) => {
    const h = p.height;
    trunk(k, 'plant-bark', [[0, 0, 0], [0, h * 0.2, 0]], 0.1, 0.08);
    blob(k, 'leaves', 'plant-cypress', h * 0.09 * p.spread, 0, h * 0.55, 0, 71, { scale: [1, 5, 1], jitter: 0.12 });
  }),
  TREE('weeping-willow', '수양버들', 'Weeping willow', ['weeping willow', 'willow', '수양버들', '버드나무', '물가 나무'], 7, (k, p) => {
    const h = p.height, R = rng(81);
    trunk(k, 'plant-bark-grey', [[0, 0, 0], [0.2, h * 0.35, 0], [0.1, h * 0.55, 0]], 0.22, 0.1);
    blob(k, 'leaves', 'plant-bamboo-leaf', h * 0.32 * p.spread, 0.1, h * 0.7, 0, 82, { scale: [1, 0.6, 1] });
    for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2 + R() * 0.2, rr = h * 0.3 * p.spread; blob(k, 'leaves', 'plant-bamboo-leaf', h * 0.06, 0.1 + Math.cos(a) * rr, h * (0.35 + R() * 0.15), Math.sin(a) * rr, 90 + i, { scale: [0.6, 3.2, 0.6], detail: 0 }); }
  }),
  TREE('dogwood', '산딸나무', 'Dogwood', ['dogwood', 'cornus', 'flowering tree', '산딸나무', '층층나무', '꽃나무'], 4, (k, p) => {
    broadleaf(k, p, { th: p.height * 0.3, cw: p.height * 1.0 * p.spread, ch: p.height * 0.55, leaf: SEASON(p, 'plant-petal-white', 'plant-maple-green', 'plant-maple-red'), seed: 23, blobs: 12, branches: 4 });
  }),
  TREE('palm', '야자수 (워싱턴 야자)', 'Fan palm tree', ['palm tree', 'washingtonia', 'tropical', '야자수', '워싱턴야자', '열대 정원'], 6, (k, p) => {
    const h = p.height;
    trunk(k, 'plant-bark-palm', [[0, 0, 0], [0.1, h * 0.5, 0], [0.15, h, 0]], 0.22, 0.16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2, up = (i % 2) * 0.4 - 0.1, L = 1.4 * p.spread;
      const g = new THREE.CircleGeometry(L * 0.5, k.seg(14, 6), -0.6, 1.2);
      g.rotateX(-PI / 2 + up); g.translate(0, 0, 0); g.rotateY(-a);
      g.translate(0.15, h, 0);
      k.add('fronds', 'plant-palm', g);
      k.rod('fronds', 'plant-palm', [0.15, h, 0], [0.15 + Math.cos(a) * L * 0.5, h + Math.sin(up) * L * 0.5, Math.sin(a) * L * 0.5], 0.015, { segs: 4 });
    }
  }),
  TREE('spruce', '가문비나무 (원추형)', 'Spruce', ['spruce', 'conifer', 'christmas tree', '가문비나무', '침엽수', '구상나무'], 5, (k, p) => {
    const h = p.height, w = h * 0.4 * p.spread;
    trunk(k, 'plant-bark', [[0, 0, 0], [0, h * 0.3, 0]], 0.1, 0.08);
    for (let i = 0; i < 5; i++) { const y = h * (0.12 + i * 0.17), r = w / 2 * (1 - i * 0.18); k.cyl('leaves', 'plant-pine', r * 0.25, r, h * 0.28, 0, y, 0, { segs: k.seg(14, 7) }); }
  }),
  TREE('metasequoia', '메타세쿼이아', 'Dawn redwood', ['metasequoia', 'dawn redwood', 'avenue tree', '메타세쿼이아', '가로수', '원뿔형'], 10, (k, p) => {
    const h = p.height, w = h * 0.3 * p.spread;
    trunk(k, 'plant-bark', [[0, 0, 0], [0, h * 0.95, 0]], 0.25, 0.05, C('#7a4a32'));
    k.cyl('leaves', SEASON(p, 'plant-cypress', 'plant-cypress', 'plant-maple-orange'), 0.1, w / 2, h * 0.85, 0, h * 0.15, 0, { segs: k.seg(16, 8) });
    canopy(k, SEASON(p, 'plant-cypress', 'plant-cypress', 'plant-maple-orange'), 6, w * 0.4, h * 0.3, w * 0.4, 0, h * 0.4, 0, 111, { size: 0.5 });
  }),
  TREE('standard-ball', '토피어리 표준목 (공 모양)', 'Standard ball-headed tree', ['standard tree', 'lollipop tree', 'topiary', '표준목', '토피어리', '공 모양 나무'], 2.2, (k, p) => {
    const h = p.height;
    k.cyl('trunk', 'plant-bark', 0.035, 0.05, h * 0.65, 0, 0, 0, { segs: k.seg(10, 5) });
    blob(k, 'leaves', 'plant-boxwood', h * 0.22 * p.spread, 0, h * 0.78, 0, 121, { jitter: 0.06 });
  }),
  TREE('bamboo-grove', '대나무 숲 (군식)', 'Bamboo grove', ['bamboo', 'bamboo grove', '대나무', '대나무 숲', '죽림'], 6, (k, p) => {
    const h = p.height, R = rng(131);
    for (let i = 0; i < 14; i++) {
      const a = R() * PI * 2, rr = Math.sqrt(R()) * 0.8 * p.spread, x = Math.cos(a) * rr, z = Math.sin(a) * rr, hh = h * (0.75 + R() * 0.25), lean = (R() - 0.5) * 0.15;
      k.rod('canes', 'plant-bamboo-cane', [x, 0, z], [x + lean * hh, hh, z], 0.025, { r2: 0.03, segs: k.seg(8, 4) });
      blob(k, 'leaves', 'plant-bamboo-leaf', 0.35, x + lean * hh, hh * 0.85, z, 132 + i, { scale: [1, 1.6, 1], detail: 1 });
    }
  }),
];

/* ============================================================ shrubs and topiary */

const SHRUB = (key, ko, en, tags, def, build, extra = []) => lsc({
  id: `lsc-${key}`, ko, en,
  params: [P.len('size', '크기', 'Size', def, def * 0.5, def * 2), ...extra],
  tags: [...tags, 'shrub', 'garden plant', '관목', '정원 식물', '조경'],
  build: (p, ctx) => { const k = new Kit(ctx); build(k, p.size, p); return finish(k); },
});

const shrubs = [
  SHRUB('boxwood-ball', '회양목 공 (구형 전정)', 'Boxwood ball', ['boxwood', 'buxus ball', 'clipped', '회양목', '공 모양', '구형 전정'], 0.8, (k, s) => blob(k, 'leaves', 'plant-boxwood', s / 2, 0, s / 2, 0, 141, { jitter: 0.05 })),
  SHRUB('boxwood-hedge', '회양목 생울타리 (각형)', 'Clipped boxwood hedge', ['boxwood hedge', 'low hedge', 'parterre', '회양목 울타리', '낮은 생울타리', '화단 경계'], 0.5, (k, s, p) => { k.soft('leaves', 'plant-boxwood', p.length, s, s * 0.9, s * 0.15, 0, s / 2, 0, { puff: 0.02 }); }, [P.len('length', '길이', 'Length', 2.0, 0.5, 6.0)]),
  SHRUB('privet-hedge', '쥐똥나무 생울타리', 'Privet hedge', ['privet hedge', 'tall hedge', 'screen', '쥐똥나무', '생울타리', '차폐'], 1.6, (k, s, p) => { k.soft('leaves', 'plant-hedge', p.length, s, 0.7, 0.12, 0, s / 2, 0, { puff: 0.05 }); }, [P.len('length', '길이', 'Length', 3.0, 1.0, 6.0)]),
  SHRUB('topiary-cone', '원뿔 토피어리', 'Cone topiary', ['cone topiary', 'pyramid', '원뿔 토피어리', '피라미드 전정'], 1.5, (k, s) => { k.cyl('leaves', 'plant-boxwood', 0.02, s * 0.3, s, 0, 0, 0, { segs: k.seg(24, 10) }); }),
  SHRUB('topiary-spiral', '나선형 토피어리', 'Spiral topiary', ['spiral topiary', 'corkscrew', '나선 토피어리', '스파이럴'], 1.6, (k, s) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * PI * 2 * 3.5, r = s * 0.25 * (1 - t * 0.7); pts.push([Math.cos(a) * r, s * 0.05 + t * s * 0.9, Math.sin(a) * r]); }
    k.tube('leaves', 'plant-boxwood', pts, s * 0.1, { segs: k.seg(80, 30), radial: k.seg(10, 5) });
    k.cyl('trunk', 'plant-bark', 0.02, 0.025, s, 0, 0, 0, { segs: 8 });
  }),
  SHRUB('topiary-tiered-poms', '3단 폼폼 토피어리', 'Tiered pom-pom topiary', ['pom pom topiary', 'tiered', '폼폼 토피어리', '3단 전정'], 1.6, (k, s) => {
    k.cyl('trunk', 'plant-bark', 0.02, 0.03, s * 0.95, 0, 0, 0, { segs: 8 });
    [[0.22, 0.25], [0.17, 0.58], [0.12, 0.86]].forEach(([r, y], i) => blob(k, 'leaves', 'plant-boxwood', s * r, 0, s * y, 0, 150 + i, { jitter: 0.05 }));
  }),
  SHRUB('azalea-mound', '철쭉 (군식 둔덕)', 'Azalea mound', ['azalea', 'rhododendron', 'flowering shrub', '철쭉', '영산홍', '봄꽃'], 0.7, (k, s, p) => {
    blob(k, 'leaves', 'plant-boxwood', s / 2, 0, s * 0.35, 0, 161, { scale: [1.5, 0.75, 1.3] });
    if (p.flowers) blob(k, 'flowers', 'plant-petal-azalea', s / 2 * 1.02, 0, s * 0.36, 0, 162, { scale: [1.5, 0.75, 1.3], jitter: 0.28 });
  }, [P.bool('flowers', '개화', 'In flower', true)]),
  SHRUB('hydrangea-bush', '수국', 'Hydrangea bush', ['hydrangea', 'mophead', '수국', '산수국', '여름꽃'], 1.0, (k, s, p) => {
    blob(k, 'leaves', 'plant-hosta', s / 2, 0, s * 0.45, 0, 171, { scale: [1.2, 0.9, 1.2] });
    const R = rng(172);
    for (let i = 0; i < 10; i++) { const a = R() * PI * 2, e = R() * 0.9; k.sphere('flowers', p.colour === 'pink' ? 'plant-petal-hydrangea-pink' : 'plant-petal-hydrangea-blue', s * 0.11, Math.cos(a) * Math.cos(e) * s * 0.55, s * 0.45 + Math.sin(e) * s * 0.42, Math.sin(a) * Math.cos(e) * s * 0.55, { segs: k.seg(10, 6), rings: k.seg(8, 4) }); }
  }, [P.pick('colour', '꽃 색', 'Flower colour', 'blue', [['blue', '파랑', 'Blue'], ['pink', '분홍', 'Pink']])]),
  SHRUB('lavender-row', '라벤더 줄심기', 'Lavender row', ['lavender', 'herb border', '라벤더', '허브', '보라 꽃'], 0.5, (k, s, p) => {
    const n = Math.max(1, Math.round(p.length / (s * 0.9)));
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * s * 0.9; blob(k, 'leaves', 'plant-lavender-leaf', s * 0.45, x, s * 0.3, 0, 181 + i, { scale: [1, 0.7, 1], detail: 1 }); blob(k, 'flowers', 'plant-petal-lavender', s * 0.4, x, s * 0.55, 0, 191 + i, { scale: [1, 0.5, 1], jitter: 0.3, detail: 1 }); }
  }, [P.len('length', '길이', 'Length', 2.0, 0.5, 5.0)]),
  SHRUB('pampas-grass', '팜파스 그라스', 'Pampas grass', ['pampas grass', 'ornamental grass', 'plumes', '팜파스', '억새류', '관상용 그라스'], 1.8, (k, s) => {
    const R = rng(201);
    for (let i = 0; i < 26; i++) { const a = R() * PI * 2, l = s * (0.45 + R() * 0.25), t = 0.3 + R() * 0.5; k.rod('blades', 'plant-grass-blade', [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], [Math.cos(a) * l * Math.sin(t), l * Math.cos(t), Math.sin(a) * l * Math.sin(t)], 0.006, { r2: 0.0, segs: 3 }); }
    for (let i = 0; i < 9; i++) { const a = R() * PI * 2, rr = R() * s * 0.15, y = s * (0.75 + R() * 0.2); k.rod('stems', 'plant-straw', [0, 0, 0], [Math.cos(a) * rr, y, Math.sin(a) * rr], 0.004, { segs: 3 }); blob(k, 'plumes', 'plant-dried-pampas', s * 0.07, Math.cos(a) * rr, y + s * 0.08, Math.sin(a) * rr, 210 + i, { scale: [0.6, 2.2, 0.6], detail: 0 }); }
  }),
  SHRUB('fountain-grass', '수크령 (분수형 그라스)', 'Fountain grass', ['fountain grass', 'pennisetum', '수크령', '분수 그라스', '관상용 풀'], 0.8, (k, s) => {
    const R = rng(221);
    for (let i = 0; i < 40; i++) { const a = R() * PI * 2, l = s * (0.6 + R() * 0.4); k.tube('blades', 'plant-grass-blade', [[0, 0, 0], [Math.cos(a) * l * 0.25, l * 0.6, Math.sin(a) * l * 0.25], [Math.cos(a) * l * 0.6, l * 0.5, Math.sin(a) * l * 0.6]], 0.004, { segs: k.seg(6, 3), radial: 3 }); }
  }),
  SHRUB('hosta-clump', '비비추 (호스타)', 'Hosta clump', ['hosta', 'plantain lily', 'shade plant', '비비추', '호스타', '그늘 식물'], 0.6, (k, s) => {
    const R = rng(231);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2 + R() * 0.3; blob(k, 'leaves', 'plant-hosta', s * 0.18, Math.cos(a) * s * 0.28, s * 0.25 + R() * 0.05, Math.sin(a) * s * 0.28, 232 + i, { scale: [1.6, 0.35, 0.9], detail: 1 }); }
  }),
  SHRUB('fern-clump', '고사리 군식', 'Fern clump', ['fern', 'woodland', 'shade garden', '고사리', '양치식물', '그늘 정원'], 0.7, (k, s) => {
    const R = rng(241);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2 + R() * 0.3; k.tube('fronds', 'plant-fern', [[0, 0, 0], [Math.cos(a) * s * 0.25, s * 0.55, Math.sin(a) * s * 0.25], [Math.cos(a) * s * 0.55, s * 0.35, Math.sin(a) * s * 0.55]], s * 0.04, { segs: k.seg(8, 4), radial: k.seg(5, 3) }); }
  }),
  SHRUB('rose-bush', '장미 덤불', 'Rose bush', ['rose bush', 'shrub rose', '장미', '장미 덤불', '꽃'], 1.0, (k, s, p) => {
    blob(k, 'leaves', 'plant-boxwood', s * 0.45, 0, s * 0.45, 0, 251, { scale: [1.1, 1, 1.1], jitter: 0.25 });
    const R = rng(252);
    for (let i = 0; i < 14; i++) { const a = R() * PI * 2, e = R() * 1.1; k.sphere('flowers', p.colour === 'pink' ? 'plant-petal-rose-pink' : 'plant-petal-rose-red', s * 0.05, Math.cos(a) * Math.cos(e) * s * 0.48, s * 0.45 + Math.sin(e) * s * 0.44, Math.sin(a) * Math.cos(e) * s * 0.48, { segs: 8, rings: 6 }); }
  }, [P.pick('colour', '꽃 색', 'Flower colour', 'red', [['red', '빨강', 'Red'], ['pink', '분홍', 'Pink']])]),
  SHRUB('standard-rose', '스탠다드 장미 (외대 장미)', 'Standard tree rose', ['standard rose', 'tree rose', '스탠다드 장미', '외대 장미'], 1.3, (k, s) => {
    k.cyl('trunk', 'plant-stem-woody', 0.012, 0.015, s * 0.7, 0, 0, 0, { segs: 8 });
    blob(k, 'leaves', 'plant-boxwood', s * 0.2, 0, s * 0.8, 0, 261, { jitter: 0.22 });
    const R = rng(262);
    for (let i = 0; i < 10; i++) { const a = R() * PI * 2, e = R() * 1.2; k.sphere('flowers', 'plant-petal-rose-pink', s * 0.035, Math.cos(a) * Math.cos(e) * s * 0.21, s * 0.8 + Math.sin(e) * s * 0.2, Math.sin(a) * Math.cos(e) * s * 0.21, { segs: 8, rings: 6 }); }
  }),
  SHRUB('forsythia', '개나리 (아치형)', 'Forsythia', ['forsythia', 'golden bell', '개나리', '봄꽃', '노란 꽃'], 1.6, (k, s) => {
    const R = rng(271);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2 + R() * 0.3, l = s * (0.7 + R() * 0.4); k.tube('stems', 'plant-petal-forsythia', [[0, 0, 0], [Math.cos(a) * l * 0.3, l * 0.75, Math.sin(a) * l * 0.3], [Math.cos(a) * l * 0.75, l * 0.45, Math.sin(a) * l * 0.75]], 0.03, { segs: k.seg(10, 5), radial: k.seg(6, 3) }); }
  }),
  SHRUB('creeping-juniper', '눈향나무 (포복형)', 'Creeping juniper', ['creeping juniper', 'ground cover', '눈향나무', '포복형 향나무', '지피 식물'], 1.2, (k, s) => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; blob(k, 'leaves', 'plant-cypress', s * 0.3, Math.cos(a) * s * 0.35, s * 0.08, Math.sin(a) * s * 0.35, 281 + i, { scale: [1.4, 0.3, 1.4], detail: 1 }); }
  }),
  SHRUB('yew-column', '주목 (원기둥 전정)', 'Clipped yew column', ['yew', 'taxus', 'column', '주목', '원기둥 전정', '상록수'], 2.0, (k, s) => { blob(k, 'leaves', 'plant-cypress', s * 0.18, 0, s / 2, 0, 291, { scale: [1, 2.7, 1], jitter: 0.06 }); }),
  SHRUB('camellia', '동백나무', 'Camellia', ['camellia', 'winter flowering', '동백나무', '동백꽃', '상록 관목'], 1.8, (k, s) => {
    k.cyl('trunk', 'plant-bark-grey', 0.03, 0.04, s * 0.3, 0, 0, 0, { segs: 8 });
    blob(k, 'leaves', 'plant-lemon-leaf', s * 0.32, 0, s * 0.58, 0, 301, { scale: [1, 1.3, 1] });
    const R = rng(302);
    for (let i = 0; i < 16; i++) { const a = R() * PI * 2, e = (R() - 0.4) * 1.4; k.sphere('flowers', 'plant-petal-camellia', s * 0.03, Math.cos(a) * Math.cos(e) * s * 0.34, s * 0.58 + Math.sin(e) * s * 0.42, Math.sin(a) * Math.cos(e) * s * 0.34, { segs: 8, rings: 6 }); }
  }),
];

/* ============================================================ ground covers */

const GROUND = (key, ko, en, tags, build, extra = []) => lsc({
  id: `lsc-${key}`, ko, en,
  params: [P.len('width', '폭', 'Width', 2.0, 0.5, 8.0), P.len('depth', '깊이', 'Depth', 1.5, 0.5, 8.0), ...extra],
  tags: [...tags, 'ground cover', 'garden bed', '지피', '화단', '조경'],
  build: (p, ctx) => { const k = new Kit(ctx); build(k, p.width, p.depth, p); return finish(k); },
});

/** Rounded bed outline as a slab. */
function bed(k, role, mat, w, d, h, round = 0.3) {
  const s = new THREE.Shape(), r = Math.min(round, w / 2 - 0.01, d / 2 - 0.01);
  s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  k.slab(role, mat, s, h, 0, { bevel: Math.min(0.01, h / 3) });
}

const grounds = [
  GROUND('lawn-patch', '잔디밭 (사각)', 'Lawn patch', ['lawn', 'grass', 'turf', '잔디', '잔디밭', '천연 잔디'], (k, w, d, p) => { bed(k, 'lawn', p.lush ? 'plant-lawn-lush' : 'plant-lawn', w, d, 0.03, 0.05); }, [P.bool('lush', '짙은 잔디', 'Lush', true)]),
  GROUND('lawn-round', '원형 잔디밭', 'Round lawn', ['round lawn', 'circle lawn', '원형 잔디', '잔디 마당'], (k, w, d) => { k.cyl('lawn', 'plant-lawn-lush', w / 2, w / 2, 0.03, 0, 0, 0, { segs: k.seg(48, 16), scale: [1, 1, d / w] }); k.add('edge', 'metal-steel-corten', T(new THREE.TorusGeometry(w / 2, 0.006, 4, k.seg(48, 16)), 0, 0.03, 0, PI / 2, 0, 0, [1, d / w, 1])); }),
  GROUND('gravel-bed', '자갈 깔기', 'Gravel bed', ['gravel', 'pea gravel', '자갈', '자갈 마당', '쇄석'], (k, w, d, p) => { bed(k, 'gravel', 'stone-granite-tile-flamed', w, d, 0.04, 0.2); const R = rng(311); for (let i = 0; i < 40; i++) k.sphere('pebbles', 'stone-granite-steel-grey', 0.02 + R() * 0.02, (R() - 0.5) * (w - 0.1), 0.04, (R() - 0.5) * (d - 0.1), { segs: 6, rings: 4, scale: [1.3, 0.5, 1] }); void p; }),
  GROUND('white-pebble-bed', '백자갈 화단', 'White pebble bed', ['white pebbles', 'river stones', '백자갈', '조약돌', '마사토'], (k, w, d) => { bed(k, 'base', 'stone-limestone-portland', w, d, 0.03, 0.3); const R = rng(321), n = Math.min(160, Math.round(w * d * 40)); for (let i = 0; i < n; i++) k.sphere('pebbles', 'stone-marble-thassos', 0.025 + R() * 0.02, (R() - 0.5) * (w - 0.1), 0.03, (R() - 0.5) * (d - 0.1), { segs: k.seg(8, 5), rings: k.seg(5, 3), scale: [1.3, 0.55, 1] }); }),
  GROUND('bark-mulch-bed', '바크 멀칭 화단', 'Bark mulch bed', ['bark mulch', 'mulch bed', '바크', '멀칭', '우드칩'], (k, w, d, p) => { bed(k, 'mulch', p.colour === 'red' ? 'plant-mulch-red' : p.colour === 'black' ? 'plant-mulch-black' : 'plant-mulch-bark', w, d, 0.05, 0.4); }, [P.pick('colour', '색', 'Colour', 'natural', [['natural', '자연색', 'Natural'], ['red', '적색', 'Red'], ['black', '흑색', 'Black']])]),
  GROUND('flower-bed-bordered', '경계석 꽃 화단', 'Bordered flower bed', ['flower bed', 'annuals', 'border', '꽃 화단', '경계석', '초화류'], (k, w, d, p) => {
    bed(k, 'soil', 'plant-soil-garden', w, d, 0.12, 0.05);
    for (const sz of [-1, 1]) k.box('kerb', 'stone-granite-tile-grey', w + 0.1, 0.15, 0.08, 0, 0.075, sz * (d / 2 + 0.04), { r: 0.01 });
    for (const sx of [-1, 1]) k.box('kerb', 'stone-granite-tile-grey', 0.08, 0.15, d, sx * (w / 2 + 0.04), 0.075, 0, { r: 0.01 });
    const cols = ['plant-petal-marigold', 'plant-petal-rose-red', 'plant-petal-white', 'plant-petal-lavender'];
    const n = Math.min(60, Math.round(w * d * 10)), R = rng(331);
    for (let i = 0; i < n; i++) { const x = (R() - 0.5) * (w - 0.2), z = (R() - 0.5) * (d - 0.2); blob(k, 'plants', 'plant-boxwood', 0.08, x, 0.17, z, 340 + i, { scale: [1, 0.7, 1], detail: 0 }); k.sphere('flowers', p.mix ? cols[i % 4] : cols[0], 0.035, x, 0.24, z, { segs: 6, rings: 4 }); }
  }, [P.bool('mix', '색 섞기', 'Mixed colours', true)]),
  GROUND('wildflower-meadow', '야생화 초지', 'Wildflower meadow patch', ['wildflower meadow', 'meadow', 'naturalistic', '야생화', '초지', '자연형 화단'], (k, w, d) => {
    bed(k, 'base', 'plant-lawn-sparse', w, d, 0.02, 0.5);
    const R = rng(351), n = Math.min(110, Math.round(w * d * 18)), cols = ['plant-petal-cosmos', 'plant-petal-sunflower', 'plant-petal-white', 'plant-petal-iris'];
    for (let i = 0; i < n; i++) { const x = (R() - 0.5) * (w - 0.1), z = (R() - 0.5) * (d - 0.1), h = 0.3 + R() * 0.4; k.rod('stems', 'plant-stem-green', [x, 0.02, z], [x + (R() - 0.5) * 0.08, h, z], 0.003, { segs: 3 }); k.sphere(['f0', 'f1', 'f2', 'f3'][i % 4], cols[i % 4], 0.025, x, h, z, { segs: 6, rings: 4, scale: [1, 0.5, 1] }); }
  }),
  GROUND('moss-garden-mound', '이끼 정원 (둔덕)', 'Moss garden mound', ['moss garden', 'moss', 'japanese garden', '이끼 정원', '이끼', '둔덕'], (k, w, d) => { blob(k, 'moss', 'plant-moss', 0.5, 0, 0, 0, 361, { scale: [w, 0.35, d], jitter: 0.1 }); }),
  GROUND('sedum-ground-cover', '세덤 지피 (돌나물류)', 'Sedum ground cover', ['sedum', 'succulent ground cover', 'green roof', '세덤', '돌나물', '옥상 녹화'], (k, w, d) => { bed(k, 'tray', 'plastic-pe-anthracite', w, d, 0.06, 0.02); const R = rng(371), n = Math.min(120, Math.round(w * d * 25)); for (let i = 0; i < n; i++) blob(k, ['s0', 's1'][i % 2], i % 2 ? 'plant-jade' : 'plant-echeveria', 0.06, (R() - 0.5) * (w - 0.1), 0.07, (R() - 0.5) * (d - 0.1), 380 + i, { scale: [1, 0.5, 1], detail: 0 }); }),
  GROUND('artificial-turf', '인조 잔디 매트', 'Artificial turf mat', ['artificial turf', 'fake grass', 'astroturf', '인조 잔디', '잔디 매트', '옥상 잔디'], (k, w, d, p) => { k.box('turf', p.short ? 'plant-grass-artificial-short' : 'plant-grass-artificial', w, 0.025, d, 0, 0.0125, 0, { r: 0.003 }); }, [P.bool('short', '짧은 잔디', 'Short pile', false)]),
];

export const ITEMS = [...trees, ...shrubs, ...grounds];
