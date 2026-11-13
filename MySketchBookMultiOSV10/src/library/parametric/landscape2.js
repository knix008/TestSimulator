// Landscaping (조경) category, part 2: hardscape and garden features — rocks (boulder, cluster, seat
// stone, Jeju basalt), stepping stones and paths (concrete rounds, timber rounds, granite slabs,
// irregular flagstones, pavers, brick, gravel strip), edging (stone, steel, sleeper, brick, scalloped),
// retaining walls and steps, water (dry stream, rock waterfall, bamboo spout, stone basin, wall
// fountain, lily planter, pond edge), Korean garden pieces (stone lantern, pagoda, stone grandfather,
// jangseung, millstone, stone bench, jeongja, stone wall with tiles), garden lights (path, spike,
// solar set, in-ground uplight, lantern post, wall step light) — each with its own light —, irrigation
// (pop-up and oscillating sprinklers, hose reel, tap post, rain chain, watering can), tools (rack,
// mower, robot mower, compost tumbler), ornaments and wildlife (feeder, insect hotel, gnome, sundial,
// armillary, obelisk, wall trellis, wind spinner, scarecrow, signpost, plant labels) and street trees.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, rng, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { C } from './accessories-plus.js';
import { lsc, blob, trunk, canopy } from './landscape.js';

const PI = Math.PI;
const WARM = '#ffd9a8';

/* ============================================================ rocks */

const boulder = lsc({
  id: 'lsc-boulder', ko: '조경석 (자연석 바위)', en: 'Landscape boulder',
  params: [P.len('size', '크기', 'Size', 1.0, 0.3, 2.5), P.mat('stone', '석재', 'Stone', 'stone-granite-steel-grey', 'stone'), P.int('seed', '모양', 'Shape', 1, 1, 9)],
  tags: ['boulder', 'rock', 'landscape stone', '조경석', '자연석', '바위'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    blob(k, 'stone', p.stone, p.size / 2, 0, p.size * 0.3, 0, 400 + p.seed, { scale: [1.2, 0.7, 0.9], jitter: 0.3, detail: k.hi ? 2 : 1 });
    return finish(k);
  },
});

const boulderCluster = lsc({
  id: 'lsc-boulder-cluster', ko: '조경석 무리 (3개)', en: 'Boulder cluster (3)',
  params: [P.len('size', '크기', 'Size', 1.2, 0.4, 2.5), P.mat('stone', '석재', 'Stone', 'stone-sandstone-grey', 'stone')],
  tags: ['boulder cluster', 'rock group', 'rock garden', '조경석 무리', '돌 무리', '암석원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    [[0, 0, 1], [s * 0.7, s * 0.2, 0.6], [-s * 0.5, s * 0.35, 0.45]].forEach(([x, z, f], i) => blob(k, 'stone', p.stone, s / 2 * f, x, s * 0.25 * f, z, 410 + i, { scale: [1.2, 0.7, 1], jitter: 0.3 }));
    return finish(k);
  },
});

const seatStone = lsc({
  id: 'lsc-flat-seat-stone', ko: '평석 (걸터앉는 돌)', en: 'Flat seat stone',
  params: [P.len('length', '길이', 'Length', 1.2, 0.6, 2.0), P.mat('stone', '석재', 'Stone', 'stone-granite-tile-grey', 'stone')],
  tags: ['seat stone', 'flat rock', 'stone bench', '평석', '앉음돌', '쉼돌'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    blob(k, 'stone', p.stone, 0.5, 0, 0.22, 0, 420, { scale: [L, 0.45, L * 0.5], jitter: 0.12 });
    return finish(k);
  },
});

const basalt = lsc({
  id: 'lsc-jeju-basalt-rock', ko: '제주 현무암 (화산석)', en: 'Jeju volcanic basalt rock',
  params: [P.len('size', '크기', 'Size', 0.8, 0.3, 1.8)],
  tags: ['basalt', 'volcanic rock', 'jeju stone', '현무암', '화산석', '제주석'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    blob(k, 'stone', 'stone-lava-stone', p.size / 2, 0, p.size * 0.4, 0, 430, { scale: [1, 0.9, 0.85], jitter: 0.35 });
    return finish(k);
  },
});

/* ============================================================ paths and steps */

const PATHS = [
  ['lsc-stepping-stones-concrete-round', '원형 콘크리트 디딤돌', 'Round concrete stepping stones', 'concrete-grc-charcoal', 'round', ['concrete stepping stones', 'round pavers', '콘크리트 디딤돌', '원형 디딤돌']],
  ['lsc-stepping-timber-rounds', '통나무 원판 디딤목', 'Timber round stepping pads', 'wood-pine-oil', 'log', ['timber rounds', 'log slices', '통나무 디딤목', '원목 디딤']],
  ['lsc-granite-slab-path', '화강석 판석 디딤돌', 'Granite slab stepping path', 'stone-granite-pocheon', 'slab', ['granite slabs', 'slab path', '판석 디딤돌', '화강석 판석', '포천석']],
  ['lsc-irregular-flagstones', '부정형 판석 길', 'Irregular flagstone path', 'stone-slate-grey', 'flag', ['flagstone', 'crazy paving', '부정형 판석', '자연 판석', '디딤석']],
];

const paths = PATHS.map(([id, ko, en, mat, kind, tags]) => lsc({
  id, ko, en,
  params: [P.int('count', '개수', 'Count', 6, 2, 12), P.len('pitch', '간격', 'Pitch', 0.65, 0.45, 1.0), P.num('curve', '휘어짐', 'Curve', 0.3, -0.8, 0.8, 0.05)],
  tags: [...tags, 'stepping stones', 'garden path', '디딤돌', '정원 길'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = rng(440);
    for (let i = 0; i < p.count; i++) {
      const t = i - (p.count - 1) / 2, z = t * p.pitch, x = Math.sin((t / p.count) * PI) * p.curve, ry = R() * PI;
      if (kind === 'round') k.cyl('stones', mat, 0.25, 0.25, 0.05, x, 0, z, { segs: k.seg(28, 10) });
      else if (kind === 'log') { k.cyl('stones', mat, 0.22 + R() * 0.06, 0.22, 0.06, x, 0, z, { segs: k.seg(20, 8) }); k.cyl('bark', 'plant-bark', 0.235, 0.235, 0.055, x, 0, z, { segs: k.seg(20, 8), open: true }); }
      else if (kind === 'slab') k.box('stones', mat, 0.8, 0.06, 0.4, x, 0.03, z, { r: 0.008, ry: (R() - 0.5) * 0.1 });
      else blob(k, 'stones', mat, 0.28, x, 0.02, z, 450 + i, { scale: [1.2, 0.12, 1], jitter: 0.25, detail: 1 });
      void ry;
    }
    return finish(k);
  },
}));

const paver = (id, ko, en, tags, build) => lsc({
  id, ko, en,
  params: [P.len('length', '길이', 'Length', 3.0, 1.0, 8.0), P.len('width', '폭', 'Width', 1.0, 0.6, 2.0)],
  tags: [...tags, 'garden path', 'paving', '정원 길', '포장'],
  build: (p, ctx) => { const k = new Kit(ctx); build(k, p.length, p.width); return finish(k); },
});

const pavers = [
  paver('lsc-paver-path', '보도블록 길 (인터로킹)', 'Interlocking paver path', ['interlocking pavers', 'block paving', '보도블록', '인터로킹 블록'], (k, L, W) => {
    k.box('base', 'floor-concrete-mid', L, 0.04, W, 0, 0.02, 0, { r: 0 });
    const n = Math.min(60, Math.round(L / 0.2)), m = Math.max(2, Math.round(W / 0.1));
    for (let i = 0; i < n; i++) k.box('pavers', 'stone-granite-tile-grey', L / n - 0.006, 0.012, W - 0.02, -L / 2 + (i + 0.5) * (L / n), 0.046, 0, { r: 0.002, ...C(i % 3 ? '#9a9590' : '#7f7a74') });
    void m;
  }),
  paver('lsc-brick-path-herringbone', '벽돌 길 (헤링본)', 'Herringbone brick path', ['brick path', 'herringbone', '벽돌 길', '헤링본', '벽돌 포장'], (k, L, W) => {
    k.box('bricks', 'floor-brick-herringbone', L, 0.05, W, 0, 0.025, 0, { r: 0.002 });
    for (const sz of [-1, 1]) k.box('edge', 'wall-brick-red', L, 0.06, 0.1, 0, 0.03, sz * (W / 2 + 0.05), { r: 0.004 });
  }),
  paver('lsc-gravel-path-steel-edge', '자갈길 (스틸 경계)', 'Gravel path with steel edging', ['gravel path', 'steel edging', '자갈길', '스틸 경계재'], (k, L, W) => {
    k.box('gravel', 'stone-granite-tile-flamed', L, 0.04, W, 0, 0.02, 0, { r: 0 });
    for (const sz of [-1, 1]) k.box('edge', 'metal-steel-corten', L, 0.08, 0.005, 0, 0.04, sz * W / 2, { r: 0 });
  }),
  paver('lsc-deck-boardwalk', '데크 산책로', 'Timber boardwalk', ['boardwalk', 'deck path', '데크길', '목재 데크', '산책로'], (k, L, W) => {
    const n = Math.max(2, Math.round(L / 0.15));
    for (let i = 0; i < n; i++) k.box('boards', 'floor-deck-teak', 0.14, 0.03, W, -L / 2 + (i + 0.5) * (L / n), 0.13, 0, { r: 0.003 });
    for (const sz of [-1, 1]) k.box('joists', 'wood-pine-oil', L, 0.1, 0.05, 0, 0.065, sz * (W / 2 - 0.1), { r: 0.002 });
  }),
];

const EDGES = [
  ['lsc-edging-stone-kerb', '화강석 경계석', 'Granite edging kerb', ['granite kerb', 'stone edging', '경계석', '화강석 경계'], (k, L) => k.box('edge', 'stone-granite-tile-grey', L, 0.15, 0.1, 0, 0.075, 0, { r: 0.008 })],
  ['lsc-edging-steel-curve', '스틸 경계재 (곡선)', 'Curved steel lawn edging', ['steel edging', 'corten edge', 'lawn edge', '스틸 경계재', '코르텐 경계'], (k, L) => {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(-L / 2 + t * L, Math.sin(t * PI * 1.5) * L * 0.12)); }
    const curve = new THREE.SplineCurve(pts);
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.004, 0); s.lineTo(0.004, 0.1); s.lineTo(0, 0.1); s.lineTo(0, 0);
    const path = new THREE.CurvePath(); path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.001)));
    for (let i = 0; i < 20; i++) { const a = curve.getPoint(i / 20), b = curve.getPoint((i + 1) / 20); const len = Math.hypot(b.x - a.x, b.y - a.y); k.box('edge', 'metal-steel-corten', len + 0.002, 0.1, 0.004, (a.x + b.x) / 2, 0.05, (a.y + b.y) / 2, { r: 0, ry: -Math.atan2(b.y - a.y, b.x - a.x) }); }
    void s; void path;
  }],
  ['lsc-edging-timber-sleeper', '침목 경계 (화단 테두리)', 'Timber sleeper edging', ['railway sleeper', 'timber edging', '침목', '목재 경계', '화단 테두리'], (k, L) => k.box('edge', 'wood-pine-dist', L, 0.15, 0.2, 0, 0.075, 0, { r: 0.008 })],
  ['lsc-edging-brick-dogtooth', '벽돌 톱니 경계', 'Dog-tooth brick edging', ['brick edging', 'dog tooth', '벽돌 경계', '톱니 벽돌'], (k, L) => { const n = Math.max(2, Math.round(L / 0.075)); for (let i = 0; i < n; i++) k.box('edge', 'wall-brick-red', 0.07, 0.2, 0.1, -L / 2 + (i + 0.5) * (L / n), 0.08, 0, { r: 0.004, rz: PI / 4 }); }],
  ['lsc-edging-scalloped-concrete', '물결형 콘크리트 경계블록', 'Scalloped concrete edging', ['scalloped edging', 'concrete border', '물결 경계블록', '콘크리트 경계'], (k, L) => { const n = Math.max(2, Math.round(L / 0.3)); for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * (L / n); k.box('edge', 'concrete-grc-white', L / n - 0.005, 0.12, 0.05, x, 0.06, 0, { r: 0.003 }); k.cyl('edge', 'concrete-grc-white', (L / n) / 2 - 0.005, (L / n) / 2 - 0.005, 0.05, x, 0.12, 0.025, { rx: PI / 2, segs: k.seg(16, 6), thetaLength: PI }); } }],
];

const edges = EDGES.map(([id, ko, en, tags, build]) => lsc({
  id, ko, en,
  params: [P.len('length', '길이', 'Length', 2.0, 0.5, 6.0)],
  tags: [...tags, 'edging', 'border', '경계', '화단 경계'],
  build: (p, ctx) => { const k = new Kit(ctx); build(k, p.length); return finish(k); },
}));

const retaining = lsc({
  id: 'lsc-retaining-wall-blocks', ko: '보강토 옹벽 블록', en: 'Retaining wall blocks',
  params: [P.len('length', '길이', 'Length', 3.0, 1.0, 8.0), P.int('courses', '단 수', 'Courses', 4, 1, 8), P.color('block', '블록 색', 'Block colour', '#9a8f80')],
  tags: ['retaining wall', 'segmental block', 'terrace', '옹벽', '보강토 블록', '화단 옹벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, bl = 0.4, bh = 0.15, n = Math.max(1, Math.round(L / bl));
    for (let c = 0; c < p.courses; c++) for (let i = 0; i < n; i++) {
      const off = c % 2 ? bl / 2 : 0, x = -L / 2 + (i + 0.5) * (L / n) + off;
      if (x > L / 2 - 0.01) continue;
      k.box('blocks', 'concrete-grc-charcoal', L / n - 0.008, bh - 0.005, 0.3, x, c * bh + bh / 2, -c * 0.02, { r: 0.006, ...C(p.block) });
    }
    k.box('cap', 'concrete-grc-charcoal', L, 0.06, 0.32, 0, p.courses * bh + 0.03, -(p.courses - 1) * 0.02, { r: 0.008, ...C(p.block) });
    return finish(k);
  },
});

const gardenSteps = lsc({
  id: 'lsc-garden-stone-steps', ko: '정원 돌계단', en: 'Garden stone steps',
  params: [P.int('steps', '단 수', 'Steps', 4, 2, 8), P.len('width', '폭', 'Width', 1.2, 0.6, 2.0), P.mat('stone', '석재', 'Stone', 'stone-granite-pocheon', 'stone')],
  tags: ['garden steps', 'stone steps', 'slope stairs', '정원 계단', '돌계단', '경사 계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx), rise = 0.15, run = 0.35;
    for (let i = 0; i < p.steps; i++) k.box('steps', p.stone, p.width, rise, run + 0.05, 0, rise * (i + 0.5), -i * run, { r: 0.01 });
    for (const sx of [-1, 1]) blob(k, 'soil', 'plant-lawn', 0.5, sx * (p.width / 2 + 0.3), rise * p.steps * 0.4, -(p.steps - 1) * run / 2, 470, { scale: [0.6, rise * p.steps * 1.6, p.steps * run * 1.1], detail: 1, jitter: 0.08 });
    return finish(k);
  },
});

const sleeperSteps = lsc({
  id: 'lsc-sleeper-steps', ko: '침목 계단 (자갈 디딤)', en: 'Sleeper steps with gravel treads',
  params: [P.int('steps', '단 수', 'Steps', 4, 2, 8), P.len('width', '폭', 'Width', 1.0, 0.6, 1.8)],
  tags: ['sleeper steps', 'timber steps', 'garden stairs', '침목 계단', '목재 계단', '정원 계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx), rise = 0.18, run = 0.45;
    for (let i = 0; i < p.steps; i++) {
      k.box('sleepers', 'wood-pine-dist', p.width, rise, 0.2, 0, rise * (i + 0.5), -i * run + 0.12, { r: 0.008 });
      k.box('gravel', 'stone-granite-tile-flamed', p.width, 0.02, run - 0.2, 0, rise * (i + 1) - 0.01, -i * run - 0.1, { r: 0 });
    }
    return finish(k);
  },
});

/* ============================================================ water */

const dryStream = lsc({
  id: 'lsc-dry-stream-bed', ko: '마른 개울 (건천 조경)', en: 'Dry stream bed',
  params: [P.len('length', '길이', 'Length', 4.0, 1.5, 8.0), P.len('width', '폭', 'Width', 0.8, 0.4, 1.5)],
  tags: ['dry stream', 'dry creek', 'rain garden', '건천', '마른 개울', '빗물 정원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, W = p.width, R = rng(480);
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([-L / 2 + (i / 8) * L, 0.01, Math.sin(i * 0.9) * W * 0.6]);
    for (let i = 0; i < 8; i++) k.box('bed', 'stone-slate-grey', L / 8 + 0.05, 0.02, W, (pts[i][0] + pts[i + 1][0]) / 2, 0.01, (pts[i][2] + pts[i + 1][2]) / 2, { r: 0.005, ry: -Math.atan2(pts[i + 1][2] - pts[i][2], pts[i + 1][0] - pts[i][0]) });
    for (let i = 0; i < Math.min(70, Math.round(L * 12)); i++) { const s = pts[Math.floor(R() * 8)]; k.sphere('pebbles', 'stone-granite-steel-grey', 0.03 + R() * 0.05, s[0] + (R() - 0.5) * L / 8, 0.02, s[2] + (R() - 0.5) * W, { segs: k.seg(8, 5), rings: k.seg(5, 3), scale: [1.3, 0.55, 1] }); }
    for (let i = 0; i < 4; i++) { const s = pts[1 + i * 2]; blob(k, 'stones', 'stone-sandstone-grey', 0.18, s[0], 0.08, s[2] + (i % 2 ? 1 : -1) * W * 0.6, 490 + i, { scale: [1.3, 0.7, 1], jitter: 0.25, detail: 1 }); }
    return finish(k);
  },
});

const waterfall = lsc({
  id: 'lsc-rock-waterfall', ko: '바위 폭포 (연못 포함)', en: 'Rock waterfall with pool',
  params: [P.len('height', '높이', 'Height', 1.0, 0.5, 2.0), P.len('pool', '연못 지름', 'Pool diameter', 1.6, 1.0, 3.0)],
  tags: ['waterfall', 'rock waterfall', 'cascade', '폭포', '인공 폭포', '연못'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, D = p.pool;
    k.cyl('water', 'water-pond', D / 2, D / 2, 0.02, 0, 0, 0, { segs: k.seg(32, 12) });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; blob(k, 'stones', 'stone-sandstone-grey', 0.18, Math.cos(a) * D / 2, 0.08, Math.sin(a) * D / 2, 500 + i, { scale: [1.3, 0.6, 1], detail: 1 }); }
    blob(k, 'stones', 'stone-sandstone-grey', H * 0.5, 0, H * 0.45, -D / 2 - H * 0.2, 511, { scale: [1.3, 1, 0.8], jitter: 0.25 });
    k.box('fall', 'water', 0.3, H * 0.75, 0.02, 0, H * 0.4, -D / 2 + 0.12, { r: 0, rx: 0.15 });
    k.box('fall', 'water', 0.32, 0.02, 0.18, 0, H * 0.78, -D / 2 + 0.03, { r: 0 });
    return finish(k);
  },
});

const bambooSpout = lsc({
  id: 'lsc-bamboo-water-spout', ko: '대나무 물대롱과 돌확', en: 'Bamboo water spout with stone basin',
  params: [P.len('height', '높이', 'Height', 0.9, 0.5, 1.2), P.bool('water', '물', 'Water', true)],
  tags: ['bamboo spout', 'water basin', 'tsukubai', '물대롱', '돌확', '대나무 물받이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.lathe('basin', 'stone-granite-tile-grey', [[0, 0], [0.28, 0], [0.3, 0.12], [0.28, 0.25], [0.2, 0.25], [0.18, 0.12], [0, 0.12]], 0, 0, 0, { segs: k.seg(28, 10) });
    if (p.water) k.cyl('water', 'water-pond', 0.19, 0.19, 0.01, 0, 0.2, 0, { segs: k.seg(24, 8) });
    k.cyl('bamboo', 'plant-bamboo-cane', 0.035, 0.035, H, 0, 0, -0.45, { segs: k.seg(12, 6) });
    k.rod('bamboo', 'plant-bamboo-cane', [0, H - 0.1, -0.45], [0, H - 0.2, 0.0], 0.022, { segs: k.seg(10, 5) });
    if (p.water) k.rod('water', 'water', [0, H - 0.2, 0.0], [0, 0.2, 0.05], 0.006, { segs: 6 });
    for (let i = 0; i < 4; i++) blob(k, 'stones', 'stone-granite-steel-grey', 0.08, Math.cos(i * 1.6) * 0.4, 0.03, Math.sin(i * 1.6) * 0.4 + 0.1, 520 + i, { scale: [1.3, 0.6, 1], detail: 1 });
    return finish(k);
  },
});

const stoneBasin = lsc({
  id: 'lsc-stone-mortar-basin', ko: '돌확 (물확)', en: 'Stone mortar water basin',
  params: [P.len('diameter', '지름', 'Diameter', 0.6, 0.35, 1.0), P.bool('lotus', '연꽃', 'Water lily', true)],
  tags: ['stone basin', 'mortar stone', 'dolhwak', '돌확', '물확', '석조'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    blob(k, 'stone', 'stone-granite-macheon', r, 0, r * 0.45, 0, 530, { scale: [1, 0.55, 1], jitter: 0.08 });
    k.cyl('water', 'water-pond', r * 0.6, r * 0.6, 0.01, 0, r * 0.68, 0, { segs: k.seg(24, 8) });
    if (p.lotus) { k.cyl('pads', 'plant-water-lily-pad', r * 0.2, r * 0.2, 0.004, r * 0.15, r * 0.69, 0.02, { segs: 14 }); k.sphere('flower', 'plant-petal-lily', r * 0.07, -r * 0.15, r * 0.72, -0.03, { segs: 10, rings: 6 }); }
    return finish(k);
  },
});

const wallFountain = lsc({
  id: 'lsc-wall-fountain-lion', placement: 'wall', elevation: 0.0, ko: '벽천 (벽 분수, 수반 포함)', en: 'Wall fountain with trough',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.5), P.mat('stone', '석재', 'Stone', 'stone-travertine-classic', 'stone')],
  tags: ['wall fountain', 'trough', 'water feature', '벽천', '벽 분수', '수경 시설'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width;
    k.box('panel', p.stone, w, 1.4, 0.08, 0, 0.7, 0.04, { r: 0.01 });
    k.box('trough', p.stone, w + 0.1, 0.45, 0.4, 0, 0.225, 0.28, { r: 0.012 });
    k.box('water', 'water-pond', w, 0.01, 0.3, 0, 0.42, 0.28, { r: 0 });
    k.cyl('spout', 'metal-brass-aged', 0.02, 0.02, 0.15, 0, 1.0, 0.08, { rx: PI / 2, segs: 10 });
    k.box('water', 'water', 0.02, 0.58, 0.01, 0, 0.71, 0.24, { r: 0, rx: 0.05 });
    return finish(k);
  },
});

const lilyPlanter = lsc({
  id: 'lsc-water-lily-planter', ko: '수생 식물 화분 (수련)', en: 'Water lily planter bowl',
  params: [P.len('diameter', '지름', 'Diameter', 0.8, 0.5, 1.2), P.mat('bowl', '화분', 'Bowl', 'ceramic-terracotta-glazed', 'ceramic')],
  tags: ['water bowl', 'lily pot', 'aquatic plants', '수련 화분', '수생 식물', '물 화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.lathe('bowl', p.bowl, [[0, 0], [r * 0.6, 0], [r, r * 0.6], [r * 1.02, r * 0.8], [r * 0.95, r * 0.8], [r * 0.9, r * 0.62], [0, r * 0.62]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('water', 'water-pond', r * 0.92, r * 0.92, 0.01, 0, r * 0.7, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < 5; i++) { const a = i * 1.3; k.cyl('pads', 'plant-water-lily-pad', r * 0.18, r * 0.18, 0.004, Math.cos(a) * r * 0.5, r * 0.715, Math.sin(a) * r * 0.5, { segs: 14 }); }
    k.sphere('flower', 'plant-petal-white', r * 0.06, 0, r * 0.74, 0, { segs: 10, rings: 6 });
    k.rod('reeds', 'plant-reed', [-r * 0.3, r * 0.7, -r * 0.3], [-r * 0.35, r * 2.2, -r * 0.35], 0.006, { segs: 4 });
    k.rod('reeds', 'plant-reed', [-r * 0.25, r * 0.7, -r * 0.35], [-r * 0.15, r * 2.0, -r * 0.45], 0.006, { segs: 4 });
    return finish(k);
  },
});

const pondEdge = lsc({
  id: 'lsc-natural-pond-with-edge', ko: '자연형 연못 (조경석 테두리)', en: 'Natural pond with stone edge',
  params: [P.len('length', '길이', 'Length', 3.0, 1.5, 6.0), P.len('width', '폭', 'Width', 2.0, 1.0, 4.0), P.bool('plants', '수생 식물', 'Pond plants', true)],
  tags: ['pond', 'garden pond', 'natural pond', '연못', '자연형 연못', '생태 연못'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, W = p.width, R = rng(540);
    k.cyl('water', 'water-pond', 0.5, 0.5, 0.02, 0, 0, 0, { segs: k.seg(40, 14), scale: [L, 1, W] });
    const n = Math.round((L + W) * 3);
    for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; blob(k, 'stones', 'stone-sandstone-grey', 0.15 + R() * 0.1, Math.cos(a) * L / 2, 0.06, Math.sin(a) * W / 2, 550 + i, { scale: [1.3, 0.6, 1], detail: 1, jitter: 0.25 }); }
    if (p.plants) {
      for (let i = 0; i < 6; i++) { const a = R() * PI * 2, rr = 0.3 + R() * 0.3; k.cyl('pads', 'plant-water-lily-pad', 0.12, 0.12, 0.004, Math.cos(a) * L / 2 * rr, 0.021, Math.sin(a) * W / 2 * rr, { segs: 12 }); }
      for (let i = 0; i < 8; i++) { const x = L * 0.35 + (R() - 0.5) * 0.3, z = -W * 0.2 + (R() - 0.5) * 0.3; k.rod('reeds', 'plant-reed', [x, 0, z], [x + (R() - 0.5) * 0.1, 0.9 + R() * 0.4, z], 0.006, { segs: 4 }); }
    }
    return finish(k);
  },
});

/* ============================================================ Korean garden */

const stoneLantern = lsc({
  id: 'lsc-stone-lantern-seokdeung', ko: '석등', en: 'Korean stone lantern (seokdeung)',
  params: [P.len('height', '높이', 'Height', 1.6, 0.8, 2.5), P.bool('lit', '불 켜짐', 'Lit', true)],
  tags: ['stone lantern', 'seokdeung', 'temple lantern', '석등', '돌 등', '사찰 석등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, s = H / 1.6, m = 'stone-granite-macheon';
    k.box('base', m, 0.6 * s, 0.15 * s, 0.6 * s, 0, 0.075 * s, 0, { r: 0.01 });
    k.cyl('base', m, 0.25 * s, 0.28 * s, 0.1 * s, 0, 0.15 * s, 0, { segs: 8 });
    k.cyl('pillar', m, 0.1 * s, 0.1 * s, 0.55 * s, 0, 0.25 * s, 0, { segs: 8 });
    k.cyl('pillar', m, 0.28 * s, 0.18 * s, 0.1 * s, 0, 0.8 * s, 0, { segs: 8 });
    k.cyl('firebox', m, 0.2 * s, 0.2 * s, 0.3 * s, 0, 0.9 * s, 0, { segs: 8 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + PI / 8; k.box('windows', p.lit ? 'light-candle' : 'paint-black-matte', 0.08 * s, 0.14 * s, 0.01, Math.sin(a) * 0.19 * s, 1.05 * s, Math.cos(a) * 0.19 * s, { r: 0, ry: a }); }
    k.cyl('roof', m, 0.12 * s, 0.38 * s, 0.18 * s, 0, 1.2 * s, 0, { segs: 8 });
    k.lathe('finial', m, [[0, 0], [0.08 * s, 0], [0.05 * s, 0.08 * s], [0.07 * s, 0.14 * s], [0, 0.22 * s]], 0, 1.38 * s, 0, { segs: 8 });
    k.light(0, 1.05 * s, 0, { intensity: p.lit ? 0.15 : 0, distance: 3, color: WARM });
    return finish(k);
  },
});

const pagoda = lsc({
  id: 'lsc-stone-pagoda-three-story', ko: '삼층 석탑 (정원용)', en: 'Three-storey stone pagoda',
  params: [P.len('height', '높이', 'Height', 1.8, 0.8, 3.0), P.mat('stone', '석재', 'Stone', 'stone-granite-macheon', 'stone')],
  tags: ['stone pagoda', 'seoktap', 'three storey', '석탑', '삼층석탑', '돌탑'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.height / 1.8;
    k.box('base', p.stone, 0.8 * s, 0.2 * s, 0.8 * s, 0, 0.1 * s, 0, { r: 0.01 });
    k.box('base', p.stone, 0.65 * s, 0.25 * s, 0.65 * s, 0, 0.325 * s, 0, { r: 0.01 });
    let y = 0.45 * s;
    for (let i = 0; i < 3; i++) {
      const w = (0.4 - i * 0.07) * s, h = (0.22 - i * 0.04) * s;
      k.box('body', p.stone, w, h, w, 0, y + h / 2, 0, { r: 0.006 });
      y += h;
      k.box('roofs', p.stone, w * 1.7, 0.07 * s, w * 1.7, 0, y + 0.035 * s, 0, { r: 0.006 });
      y += 0.07 * s;
    }
    k.cyl('finial', p.stone, 0.03 * s, 0.05 * s, 0.25 * s, 0, y, 0, { segs: 8 });
    return finish(k);
  },
});

const harubang = lsc({
  id: 'lsc-dol-hareubang', ko: '돌하르방', en: 'Jeju stone grandfather (dol hareubang)',
  params: [P.len('height', '높이', 'Height', 1.2, 0.4, 2.0)],
  tags: ['dol hareubang', 'jeju statue', 'stone guardian', '돌하르방', '제주 석상', '수호석'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.height / 1.2, m = 'stone-lava-stone';
    k.cyl('base', m, 0.25 * s, 0.28 * s, 0.1 * s, 0, 0, 0, { segs: 10 });
    blob(k, 'body', m, 0.25 * s, 0, 0.45 * s, 0, 560, { scale: [1, 1.5, 0.8], jitter: 0.08 });
    blob(k, 'head', m, 0.18 * s, 0, 0.92 * s, 0, 561, { scale: [1, 1.2, 0.95], jitter: 0.06 });
    k.cyl('hat', m, 0.16 * s, 0.2 * s, 0.14 * s, 0, 1.05 * s, 0, { segs: 12 });
    for (const sx of [-1, 1]) blob(k, 'hands', m, 0.07 * s, sx * 0.08 * s, 0.1 * s + 0.35 * s, 0.18 * s, 562, { scale: [1.2, 0.8, 0.8], detail: 1 });
    for (const sx of [-1, 1]) k.sphere('eyes', m, 0.035 * s, sx * 0.07 * s, 0.97 * s, 0.15 * s, { segs: 10, rings: 6 });
    return finish(k);
  },
});

const jangseung = lsc({
  id: 'lsc-jangseung-pair', ko: '장승 (한 쌍)', en: 'Jangseung village guardian posts (pair)',
  params: [P.len('height', '높이', 'Height', 2.2, 1.2, 3.0), P.len('gap', '간격', 'Gap', 1.0, 0.5, 2.0)],
  tags: ['jangseung', 'totem', 'village guardian', '장승', '천하대장군', '마을 수호신'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    for (const [sx, col] of [[-1, '#c0392b'], [1, '#2a5d9f']]) {
      const x = sx * p.gap / 2;
      k.cyl('posts', 'wood-pine-dist', 0.14, 0.16, H, x, 0, 0, { segs: k.seg(14, 7) });
      k.cyl('hats', 'paint-black-matte', 0.18, 0.2, 0.12, x, H * 0.82, 0, { segs: 14 });
      for (const ex of [-0.05, 0.05]) k.sphere('eyes', 'paint-white-matte', 0.03, x + ex, H * 0.72, 0.13, { segs: 8, rings: 6 });
      k.box('mouth', 'paint-white-matte', 0.1, 0.03, 0.02, x, H * 0.6, 0.14, { r: 0.006 });
      k.box('text', 'paper', 0.1, H * 0.35, 0.01, x, H * 0.3, 0.155, { r: 0, ...C(col) });
    }
    return finish(k);
  },
});

const millstone = lsc({
  id: 'lsc-millstone-ornament', ko: '맷돌 (장식)', en: 'Millstone ornament',
  params: [P.len('diameter', '지름', 'Diameter', 0.5, 0.3, 0.9), P.bool('stacked', '두 짝 포개기', 'Stacked pair', true)],
  tags: ['millstone', 'grinding stone', 'korean antique', '맷돌', '돌 장식', '전통 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2, m = 'stone-granite-macheon';
    k.cyl('stones', m, r, r * 1.02, r * 0.35, 0, 0, 0, { segs: k.seg(28, 10) });
    if (p.stacked) {
      k.cyl('stones', m, r * 0.96, r, r * 0.35, 0, r * 0.36, 0, { segs: k.seg(28, 10) });
      k.cyl('hole', 'paint-black-matte', r * 0.12, r * 0.12, 0.004, 0, r * 0.71, 0, { segs: 12 });
      k.rod('handle', 'wood-pine-dist', [r * 0.8, r * 0.55, 0], [r * 1.3, r * 0.55, 0], 0.025, { segs: 8 });
    }
    return finish(k);
  },
});

const stoneBench = lsc({
  id: 'lsc-granite-slab-bench', ko: '화강석 장대석 벤치', en: 'Granite slab bench',
  params: [P.len('length', '길이', 'Length', 1.8, 1.0, 3.0), P.mat('stone', '석재', 'Stone', 'stone-granite-pocheon', 'stone')],
  tags: ['stone bench', 'granite bench', 'garden seat', '돌 벤치', '장대석', '화강석 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('seat', p.stone, L, 0.12, 0.45, 0, 0.39, 0, { r: 0.012 });
    for (const sx of [-1, 1]) k.box('legs', p.stone, 0.2, 0.33, 0.4, sx * (L / 2 - 0.25), 0.165, 0, { r: 0.01 });
    return finish(k);
  },
});

const jeongja = lsc({
  id: 'lsc-jeongja-pavilion', ko: '정자 (사모정)', en: 'Korean garden pavilion (jeongja)',
  params: [P.len('size', '크기', 'Size', 3.0, 2.0, 4.5), P.color('rafters', '단청 색', 'Dancheong colour', '#2f7a5a')],
  tags: ['jeongja', 'pavilion', 'gazebo', 'hanok', '정자', '사모정', '한옥 정자'],
  build: (p, ctx) => {
    const k = new Kit(ctx), S = p.size, H = 2.6;
    k.box('base', 'stone-granite-pocheon', S + 0.4, 0.4, S + 0.4, 0, 0.2, 0, { r: 0.01 });
    k.box('floor', 'wood-pine-oil', S, 0.12, S, 0, 0.66, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('posts', 'wood-pine-oil', 0.11, 0.12, H - 0.4, sx * (S / 2 - 0.12), 0.4, sz * (S / 2 - 0.12), { segs: k.seg(14, 7) });
      k.cyl('plinths', 'stone-granite-pocheon', 0.16, 0.18, 0.2, sx * (S / 2 - 0.12), 0.4, sz * (S / 2 - 0.12), { segs: 8 });
    }
    for (const sz of [-1, 1]) { k.box('beams', 'wood-pine-oil', S, 0.2, 0.2, 0, H, sz * (S / 2 - 0.12), { r: 0.004 }); k.box('beams', 'wood-pine-oil', 0.2, 0.2, S, sz * (S / 2 - 0.12), H, 0, { r: 0.004 }); }
    k.box('dancheong', 'paint-white-matte', S + 0.02, 0.1, S + 0.02, 0, H + 0.12, 0, { r: 0.004, ...C(p.rafters) });
    const roof = new THREE.ConeGeometry((S + 1.2) * 0.72, 1.4, 4, 1, false, PI / 4);
    roof.translate(0, H + 0.2 + 0.7, 0);
    k.add('roof', 'metal-zinc-anthracite', roof);
    k.sphere('finial', 'ceramic-matte-charcoal', 0.12, 0, H + 1.6, 0, { segs: 10, rings: 8 });
    for (const sx of [-1, 1]) k.box('rails', 'wood-pine-oil', 0.06, 0.35, S, sx * (S / 2 - 0.05), 0.9, 0, { r: 0.004 });
    return finish(k);
  },
});

const tileWall = lsc({
  id: 'lsc-stone-wall-with-roof-tiles', ko: '기와 담장 (돌담)', en: 'Stone wall with roof tile coping',
  params: [P.len('length', '길이', 'Length', 3.0, 1.0, 6.0), P.len('height', '높이', 'Height', 1.6, 1.0, 2.2)],
  tags: ['korean stone wall', 'tile capped wall', 'hanok wall', '돌담', '기와 담장', '토담'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, H = p.height;
    k.box('wall', 'stone-stacked-beige', L, H - 0.2, 0.4, 0, (H - 0.2) / 2, 0, { r: 0.01 });
    k.box('coping', 'ceramic-matte-charcoal', L + 0.1, 0.06, 0.6, 0, H - 0.17, 0, { r: 0.004 });
    const g = new THREE.CylinderGeometry(0.33, 0.33, L + 0.1, 3, 1);
    g.rotateZ(PI / 2); g.scale(1, 0.5, 1); g.translate(0, H - 0.06, 0);
    k.add('coping', 'ceramic-matte-charcoal', g);
    return finish(k);
  },
});

/* ============================================================ garden lights (each one switchable) */

const pathLight = lsc({
  id: 'lsc-path-light-mushroom', ko: '정원등 (버섯형 잔디등)', en: 'Mushroom path light',
  params: [P.len('height', '높이', 'Height', 0.6, 0.3, 1.0), P.mat('body', '몸체', 'Body', 'metal-pc-anthracite', 'metal'), P.bool('on', '켜짐', 'On', true)],
  tags: ['path light', 'garden light', 'lawn light', '잔디등', '정원등', '보행등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.cyl('post', p.body, 0.03, 0.035, H - 0.06, 0, 0, 0, { segs: k.seg(12, 6) });
    k.cyl('lens', p.on ? 'light-warm' : 'plastic-acrylic-opal', 0.04, 0.04, 0.04, 0, H - 0.08, 0, { segs: k.seg(16, 6) });
    k.cyl('hat', p.body, 0.12, 0.05, 0.04, 0, H - 0.04, 0, { segs: k.seg(20, 8) });
    k.light(0, H - 0.07, 0, { intensity: p.on ? 0.2 : 0, distance: 3, type: 'spot', angle: 1.1, color: WARM });
    return finish(k);
  },
});

const spikeSpot = lsc({
  id: 'lsc-spike-spotlight', ko: '스파이크 투광등 (수목 조명)', en: 'Spike spotlight for trees',
  params: [P.num('tilt', '기울기', 'Tilt', 0.5, 0, 1.2, 0.01), P.bool('on', '켜짐', 'On', true)],
  tags: ['spike light', 'tree uplight', 'spotlight', '스파이크 조명', '수목 투광등', '업라이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = p.tilt;
    k.cyl('spike', 'plastic-abs-matte-black', 0.004, 0.015, 0.05, 0, 0, 0, { segs: 6 });
    k.box('knuckle', 'metal-pc-black-matte', 0.03, 0.04, 0.03, 0, 0.07, 0, { r: 0.006 });
    k.cyl('head', 'metal-pc-black-matte', 0.035, 0.035, 0.1, 0, 0.09, 0, { rx: -a, segs: k.seg(16, 6) });
    k.cyl('lens', p.on ? 'light-warm' : 'glass-clear', 0.03, 0.03, 0.002, 0, 0.09 + Math.cos(a) * 0.1, -Math.sin(a) * 0.1 * -1, { rx: -a, segs: 12 });
    k.light(0, 0.09 + Math.cos(a) * 0.12, Math.sin(a) * 0.12, { intensity: p.on ? 0.6 : 0, distance: 6, type: 'spot', angle: 0.35, color: WARM });
    return finish(k);
  },
});

const solarSet = lsc({
  id: 'lsc-solar-stake-lights', ko: '태양광 정원등 세트', en: 'Solar stake lights set',
  params: [P.int('count', '개수', 'Count', 6, 2, 10), P.len('pitch', '간격', 'Spacing', 0.5, 0.3, 1.0), P.bool('on', '켜짐', 'On', true)],
  tags: ['solar lights', 'stake lights', 'garden border lights', '태양광 정원등', '솔라 라이트', '꽂이형 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * p.pitch;
      k.cyl('stakes', 'plastic-abs-matte-black', 0.008, 0.008, 0.3, x, 0, 0, { segs: 6 });
      k.cyl('lens', p.on ? 'light-warm' : 'plastic-acrylic-clear', 0.035, 0.03, 0.06, x, 0.3, 0, { segs: k.seg(12, 6) });
      k.cyl('panels', 'glass-tint-smoke-dark', 0.045, 0.045, 0.015, x, 0.36, 0, { segs: k.seg(12, 6) });
    }
    k.light(0, 0.33, 0, { intensity: p.on ? 0.05 * p.count : 0, distance: 2, color: WARM });
    return finish(k);
  },
});

const inground = lsc({
  id: 'lsc-in-ground-uplight', ko: '지중 매입 업라이트', en: 'In-ground uplight',
  params: [P.len('diameter', '지름', 'Diameter', 0.12, 0.08, 0.25), P.bool('on', '켜짐', 'On', true)],
  tags: ['in-ground light', 'buried uplight', 'well light', '지중등', '매입 업라이트', '바닥 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('ring', 'metal-ss-satin', r + 0.012, r + 0.012, 0.008, 0, 0, 0, { segs: k.seg(20, 8) });
    k.cyl('lens', p.on ? 'light-warm' : 'glass-clear', r, r, 0.002, 0, 0.008, 0, { segs: k.seg(20, 8) });
    k.light(0, 0.03, 0, { intensity: p.on ? 0.6 : 0, distance: 6, type: 'spot', angle: 0.3, color: WARM });
    return finish(k);
  },
});

const lanternPost = lsc({
  id: 'lsc-garden-lantern-post', ko: '정원 가로등 (랜턴형)', en: 'Garden lantern post',
  params: [P.len('height', '높이', 'Height', 2.2, 1.5, 3.2), P.int('heads', '등 수', 'Lanterns', 1, 1, 2), P.bool('on', '켜짐', 'On', true)],
  tags: ['lamp post', 'garden lantern', 'street light', '정원 가로등', '랜턴 등', '보안등'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.cyl('base', 'metal-iron-cast-black', 0.14, 0.16, 0.3, 0, 0, 0, { segs: 10 });
    k.cyl('post', 'metal-iron-cast-black', 0.04, 0.05, H - 0.6, 0, 0.3, 0, { segs: 10 });
    const heads = p.heads === 2 ? [-0.3, 0.3] : [0];
    if (p.heads === 2) k.rod('arm', 'metal-iron-cast-black', [-0.3, H - 0.25, 0], [0.3, H - 0.25, 0], 0.02, { segs: 8 });
    for (const x of heads) {
      k.box('lantern', 'metal-iron-cast-black', 0.2, 0.025, 0.2, x, H - 0.28, 0, { r: 0.004 });
      k.box('glass', p.on ? 'light-warm' : 'glass-frosted', 0.16, 0.24, 0.16, x, H - 0.14, 0, { r: 0.004 });
      k.cyl('cap', 'metal-iron-cast-black', 0.03, 0.15, 0.1, x, H - 0.01, 0, { segs: 4, ry: PI / 4 });
      k.light(x, H - 0.14, 0, { intensity: p.on ? 0.6 : 0, distance: 6, color: WARM });
    }
    return finish(k);
  },
});

const wallStep = lsc({
  id: 'lsc-garden-wall-brick-light', placement: 'wall', elevation: 0.3, ko: '담장 매입 벽돌등 (하향)', en: 'Brick light for garden walls',
  params: [P.bool('on', '켜짐', 'On', true)],
  tags: ['brick light', 'wall step light', 'louvre light', '벽돌등', '담장 조명', '하향등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'metal-pc-anthracite', 0.22, 0.07, 0.02, 0, 0.035, 0.01, { r: 0.004 });
    for (let i = 0; i < 3; i++) k.box('louvres', 'metal-pc-anthracite', 0.2, 0.006, 0.02, 0, 0.015 + i * 0.018, 0.025, { r: 0, rx: 0.5 });
    k.box('lens', p.on ? 'light-warm' : 'glass-frosted', 0.18, 0.05, 0.002, 0, 0.035, 0.019, { r: 0 });
    k.light(0, 0.0, 0.06, { intensity: p.on ? 0.15 : 0, distance: 2, type: 'spot', angle: 0.9, color: WARM });
    return finish(k);
  },
});

/* ============================================================ irrigation and tools */

const popup = lsc({
  id: 'lsc-popup-sprinkler-heads', ko: '팝업 스프링클러 (잔디 관수)', en: 'Pop-up lawn sprinklers',
  params: [P.int('count', '개수', 'Count', 4, 1, 6), P.len('pitch', '간격', 'Spacing', 2.0, 1.0, 2.5), P.bool('spray', '분사 중', 'Spraying', true)],
  tags: ['pop-up sprinkler', 'irrigation', 'lawn watering', '스프링클러', '자동 관수', '잔디 물주기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * p.pitch;
      k.cyl('heads', 'plastic-abs-matte-black', 0.035, 0.035, 0.02, x, 0, 0, { segs: 12 });
      if (p.spray) { k.cyl('heads', 'plastic-abs-matte-grey', 0.012, 0.012, 0.08, x, 0.02, 0, { segs: 8 }); k.cyl('spray', 'water', 0.5, 0.02, 0.35, x, 0.05, 0, { segs: k.seg(20, 8), open: true }); }
    }
    return finish(k);
  },
});

const oscillating = lsc({
  id: 'lsc-oscillating-sprinkler', ko: '왕복식 스프링클러', en: 'Oscillating sprinkler',
  params: [P.num('swing', '분사 각도', 'Swing', 0.3, -0.8, 0.8, 0.05), P.bool('spray', '분사 중', 'Spraying', true)],
  tags: ['oscillating sprinkler', 'garden sprinkler', '왕복식 스프링클러', '물뿌리개', '잔디 관수'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('base', 'plastic-abs-gloss-yellow', 0.4, 0.04, 0.1, 0, 0.02, 0, { r: 0.012 });
    k.cyl('tube', 'metal-al-brushed', 0.012, 0.012, 0.36, 0.18, 0.08, 0, { rz: PI / 2, segs: 8 });
    if (p.spray) for (let i = 0; i < 8; i++) k.rod('spray', 'water', [-0.15 + i * 0.043, 0.09, 0], [-0.4 + i * 0.11, 1.0, Math.sin(p.swing) * 1.2], 0.004, { segs: 4 });
    return finish(k);
  },
});

const hoseReel = lsc({
  id: 'lsc-hose-reel-cart', ko: '호스 릴 카트', en: 'Hose reel cart',
  params: [P.len('wound', '감긴 양', 'Hose wound', 1, 0.2, 1, 0.05), P.color('reel', '릴 색', 'Reel colour', '#2f7a46')],
  tags: ['hose reel', 'garden hose', 'hose cart', '호스 릴', '정원 호스', '물 호스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const sx of [-1, 1]) { k.cyl('wheels', 'rubber-black', 0.12, 0.12, 0.04, sx * 0.24 + (sx > 0 ? 0.04 : 0), 0.12, 0.1, { rz: PI / 2, segs: k.seg(16, 8) }); k.rod('frame', 'metal-pc-forest', [sx * 0.22, 0.12, 0.1], [sx * 0.22, 0.9, -0.15], 0.012, { segs: 8, ...C(p.reel) }); }
    k.cyl('reel', 'plastic-pp-olive', 0.18, 0.18, 0.36, 0.18, 0.45, 0, { rz: PI / 2, segs: k.seg(20, 8), ...C(p.reel) });
    k.cyl('hose', 'plastic-abs-gloss-green', 0.1 + 0.07 * p.wound, 0.1 + 0.07 * p.wound, 0.32, 0.16, 0.45, 0, { rz: PI / 2, segs: k.seg(20, 8), ...C('#3aa655') });
    k.rod('frame', 'metal-pc-forest', [-0.22, 0.9, -0.15], [0.22, 0.9, -0.15], 0.012, { segs: 8, ...C(p.reel) });
    return finish(k);
  },
});

const tapPost = lsc({
  id: 'lsc-garden-tap-post', ko: '정원 수전 기둥', en: 'Garden tap post',
  params: [P.mat('post', '기둥', 'Post', 'stone-sandstone-grey', 'stone'), P.bool('bowl', '물받이', 'Drain bowl', true)],
  tags: ['garden tap', 'standpipe', 'outdoor faucet', '수전', '야외 수도', '정원 수도'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('post', p.post, 0.15, 0.85, 0.15, 0, 0.425, 0, { r: 0.008 });
    for (const y of [0.55, 0.78]) { k.rod('tap', 'metal-brass-polished', [0, y, 0.075], [0, y, 0.13], 0.01, { segs: 8 }); k.rod('tap', 'metal-brass-polished', [0, y, 0.13], [0, y - 0.04, 0.15], 0.008, { segs: 8 }); }
    if (p.bowl) k.lathe('bowl', 'stone-granite-tile-grey', [[0, 0], [0.2, 0], [0.22, 0.08], [0.19, 0.08], [0.17, 0.02], [0, 0.02]], 0, 0, 0.15, { segs: k.seg(20, 8) });
    return finish(k);
  },
});

const rainChain = lsc({
  id: 'lsc-rain-chain-basin', placement: 'wall', elevation: 0.0, ko: '레인 체인과 빗물 받이', en: 'Rain chain with basin',
  params: [P.len('length', '길이', 'Length', 2.4, 1.2, 3.0), P.mat('metal', '금속', 'Metal', 'metal-copper-satin', 'metal')],
  tags: ['rain chain', 'downspout', 'rainwater', '레인 체인', '빗물 체인', '홈통'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, n = Math.round(L / 0.12);
    for (let i = 0; i < n; i++) k.cyl('cups', p.metal, 0.035, 0.025, 0.06, 0, 0.15 + i * (L - 0.2) / n, 0.15, { segs: k.seg(12, 6), open: true });
    k.rod('chain', p.metal, [0, 0.15, 0.15], [0, L, 0.15], 0.003, { segs: 4 });
    k.rod('chain', p.metal, [0, L, 0.15], [0, L, 0], 0.01, { segs: 6 });
    k.lathe('basin', 'stone-granite-tile-grey', [[0, 0], [0.22, 0], [0.25, 0.15], [0.22, 0.15], [0.19, 0.04], [0, 0.04]], 0, 0, 0.15, { segs: k.seg(20, 8) });
    return finish(k);
  },
});

const wateringCan = lsc({
  id: 'lsc-watering-can', ko: '물뿌리개', en: 'Watering can',
  params: [P.mat('metal', '금속', 'Metal', 'metal-steel-galvanised', 'metal'), P.len('height', '높이', 'Height', 0.32, 0.2, 0.45)],
  tags: ['watering can', 'garden can', '물뿌리개', '물조리개', '원예 도구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, r = h * 0.4;
    k.cyl('body', p.metal, r * 0.85, r, h * 0.75, 0, 0, 0, { segs: k.seg(20, 8) });
    k.rod('spout', p.metal, [r * 0.7, h * 0.1, 0], [r * 2.4, h * 0.85, 0], 0.012, { segs: 8 });
    k.cyl('rose', p.metal, 0.035, 0.02, 0.04, r * 2.45, h * 0.85, 0, { rz: -0.9, segs: 10 });
    k.tube('handle', p.metal, [[-r * 0.8, h * 0.6, 0], [-r * 0.5, h * 1.05, 0], [r * 0.5, h * 1.0, 0], [r * 0.5, h * 0.75, 0]], 0.01);
    return finish(k);
  },
});

const toolRack = lsc({
  id: 'lsc-garden-tool-rack', ko: '원예 도구 걸이 (삽·갈퀴)', en: 'Garden tool rack',
  params: [P.int('tools', '도구 수', 'Tools', 5, 2, 8)],
  tags: ['tool rack', 'shovel', 'rake', 'garden tools', '원예 도구', '삽', '갈퀴'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.tools, w = n * 0.15 + 0.1;
    for (const sx of [-1, 1]) k.box('frame', 'wood-cedar-oil', 0.06, 1.5, 0.06, sx * w / 2, 0.75, 0, { r: 0.004 });
    for (const y of [1.3, 0.3]) k.box('frame', 'wood-cedar-oil', w, 0.06, 0.06, 0, y, 0, { r: 0.004 });
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.12 + i * 0.15;
      k.cyl('handles', 'wood-ash-white', 0.014, 0.014, 1.1, x, 0.2, 0.06, { segs: 8 });
      const head = i % 3;
      if (head === 0) k.box('heads', 'metal-steel-raw', 0.2, 0.25, 0.01, x, 0.12, 0.06, { r: 0.01 });
      else if (head === 1) { k.box('heads', 'metal-steel-raw', 0.35, 0.02, 0.02, x, 0.2, 0.06, { r: 0.002 }); for (let j = 0; j < 10; j++) k.box('heads', 'metal-steel-raw', 0.006, 0.08, 0.006, x - 0.16 + j * 0.035, 0.16, 0.06, { r: 0 }); }
      else k.box('heads', 'metal-steel-raw', 0.12, 0.2, 0.01, x, 0.1, 0.06, { r: 0.004 });
    }
    return finish(k);
  },
});

const mower = lsc({
  id: 'lsc-push-lawn-mower', ko: '잔디 깎기 기계 (자주식)', en: 'Push lawn mower',
  params: [P.color('deck', '본체 색', 'Deck colour', '#d9342b'), P.bool('bag', '수거 백', 'Grass bag', true)],
  tags: ['lawn mower', 'grass cutter', '잔디 깎기', '예초기', '잔디 관리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('deck', 'metal-pc-red', 0.5, 0.15, 0.55, 0, 0.15, 0, { r: 0.04, ...C(p.deck) });
    k.box('engine', 'plastic-abs-matte-black', 0.25, 0.18, 0.25, 0, 0.3, 0.05, { r: 0.04 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.09, 0.09, 0.04, sx * 0.27 + (sx > 0 ? 0.04 : 0), 0.09, sz * 0.22, { rz: PI / 2, segs: k.seg(16, 8) });
    k.bentTube('handle', 'metal-pc-black-matte', [[-0.2, 0.2, -0.27], [-0.22, 0.95, -0.75], [0.22, 0.95, -0.75], [0.2, 0.2, -0.27]], 0.012, 0.06);
    if (p.bag) k.soft('bag', 'fabric-canvas-black', 0.4, 0.3, 0.35, 0.05, 0, 0.3, -0.45, { puff: 0.02 });
    return finish(k);
  },
});

const robotMower = lsc({
  id: 'lsc-robot-lawn-mower', ko: '로봇 잔디 깎기와 충전소', en: 'Robot lawn mower with dock',
  params: [P.bool('docked', '충전 중', 'Docked', false)],
  tags: ['robot mower', 'robotic lawnmower', 'automower', '로봇 잔디 깎기', '자동 예초기', '스마트 정원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), z = p.docked ? -0.15 : 0.6;
    k.box('dock', 'plastic-abs-matte-anthracite', 0.4, 0.02, 0.5, 0, 0.01, -0.3, { r: 0.02 });
    k.box('dock', 'plastic-abs-matte-anthracite', 0.3, 0.25, 0.1, 0, 0.125, -0.5, { r: 0.04 });
    k.sphere('body', 'plastic-abs-gloss-white', 0.5, 0, 0.04, z, { thetaLength: PI / 2, segs: k.seg(24, 10), rings: k.seg(8, 4), scale: [0.55, 0.22, 0.65] });
    k.cyl('dial', 'plastic-abs-gloss-red', 0.04, 0.04, 0.01, 0, 0.145, z + 0.05, { segs: 14 });
    for (const sx of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.1, 0.1, 0.04, sx * 0.27 + (sx > 0 ? 0.04 : 0), 0.1, z - 0.1, { rz: PI / 2, segs: k.seg(16, 8) });
    return finish(k);
  },
});

const compost = lsc({
  id: 'lsc-compost-tumbler', ko: '회전식 퇴비통', en: 'Compost tumbler',
  params: [P.num('turn', '회전', 'Rotation', 0.3, 0, 1.6, 0.05), P.color('drum', '통 색', 'Drum colour', '#2b2b2b')],
  tags: ['compost tumbler', 'composter', 'compost bin', '퇴비통', '컴포스터', '음식물 퇴비'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const sx of [-1, 1]) { k.rod('frame', 'metal-steel-galvanised', [sx * 0.38, 0, -0.35], [sx * 0.38, 0.65, 0], 0.02, { segs: 8 }); k.rod('frame', 'metal-steel-galvanised', [sx * 0.38, 0, 0.35], [sx * 0.38, 0.65, 0], 0.02, { segs: 8 }); }
    k.cyl('drum', 'plastic-pe-anthracite', 0.3, 0.3, 0.7, 0.35, 0.65, 0, { rz: PI / 2, segs: k.seg(8, 8), ...C(p.drum) });
    k.box('door', 'plastic-pe-anthracite', 0.3, 0.02, 0.2, 0, 0.65 + Math.cos(p.turn) * 0.3, Math.sin(p.turn) * 0.3, { r: 0.006, rx: p.turn });
    k.rod('frame', 'metal-steel-galvanised', [-0.45, 0.65, 0], [0.45, 0.65, 0], 0.015, { segs: 8 });
    return finish(k);
  },
});

/* ============================================================ ornaments and wildlife */

const birdFeeder = lsc({
  id: 'lsc-bird-feeder-pole', ko: '새 모이대 (기둥형)', en: 'Bird feeder pole',
  params: [P.len('height', '높이', 'Height', 1.8, 1.2, 2.4), P.int('feeders', '모이통 수', 'Feeders', 3, 1, 4)],
  tags: ['bird feeder', 'feeding station', 'wildlife garden', '새 모이대', '버드 피더', '생태 정원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.cyl('pole', 'metal-pc-black-matte', 0.012, 0.012, H, 0, 0, 0, { segs: 8 });
    for (let i = 0; i < p.feeders; i++) {
      const a = (i / p.feeders) * PI * 2, x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3, y = H - 0.1 - (i % 2) * 0.15;
      k.tube('arms', 'metal-pc-black-matte', [[0, y, 0], [x * 0.7, y + 0.05, z * 0.7], [x, y - 0.02, z]], 0.006);
      k.cyl('feeders', 'plastic-pc-clear', 0.04, 0.04, 0.2, x, y - 0.3, z, { segs: 10 });
      k.cyl('seed', 'plant-straw', 0.035, 0.035, 0.12, x, y - 0.29, z, { segs: 8 });
      k.cyl('roofs', 'metal-pc-forest', 0.07, 0.07, 0.02, x, y - 0.1, z, { segs: 12 });
    }
    return finish(k);
  },
});

const insectHotel = lsc({
  id: 'lsc-insect-hotel', ko: '곤충 호텔', en: 'Insect hotel',
  params: [P.len('height', '높이', 'Height', 0.5, 0.3, 1.2), P.bool('post', '기둥', 'On post', true)],
  tags: ['insect hotel', 'bug house', 'bee hotel', '곤충 호텔', '벌집', '생태 정원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, w = H * 0.7, y0 = p.post ? 0.9 : 0;
    if (p.post) k.box('post', 'wood-cedar-oil', 0.07, y0, 0.07, 0, y0 / 2, -0.05, { r: 0.004 });
    k.box('frame', 'wood-cedar-oil', w, H, 0.15, 0, y0 + H / 2, 0, { r: 0.006 });
    const roof = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.04, 0), new THREE.Vector2(w / 2 + 0.04, 0), new THREE.Vector2(0, w * 0.35)]);
    k.panel('roof', 'wood-cedar-burnt', roof, 0.17, 0, y0 + H, 0, { bevel: 0.004 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const cx = -w / 4 + c * w / 2, cy = y0 + H * (0.2 + r * 0.3), m = ['plant-bamboo-cane', 'plant-straw', 'plant-bark'][(r + c) % 3];
      k.box(`fill${(r + c) % 3}`, m, w / 2 - 0.03, H * 0.27, 0.01, cx, cy, 0.075, { r: 0 });
    }
    return finish(k);
  },
});

const gnome = lsc({
  id: 'lsc-garden-gnome', ko: '정원 난쟁이 인형', en: 'Garden gnome',
  params: [P.len('height', '높이', 'Height', 0.35, 0.2, 0.6), P.color('hat', '모자 색', 'Hat colour', '#d9342b')],
  tags: ['garden gnome', 'ornament', 'statue', '정원 인형', '노움', '정원 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.height / 0.35;
    k.cyl('body', 'plastic-abs-gloss-blue', 0.07 * s, 0.09 * s, 0.14 * s, 0, 0.03 * s, 0, { segs: 12, ...C('#2a5d9f') });
    k.box('boots', 'plastic-abs-matte-black', 0.12 * s, 0.03 * s, 0.1 * s, 0, 0.015 * s, 0.01, { r: 0.01 * s });
    k.sphere('face', 'plastic-abs-matte-beige', 0.05 * s, 0, 0.2 * s, 0.01 * s, { segs: 12, rings: 8, ...C('#f0c9a0') });
    k.cyl('beard', 'plastic-abs-matte-white', 0.0, 0.055 * s, 0.09 * s, 0, 0.12 * s, 0.035 * s, { rx: PI, segs: 10 });
    k.cyl('hat', 'plastic-abs-gloss-red', 0.0, 0.055 * s, 0.14 * s, 0, 0.22 * s, 0, { segs: 12, ...C(p.hat) });
    return finish(k);
  },
});

const sundial = lsc({
  id: 'lsc-sundial-pedestal', ko: '해시계 (받침대)', en: 'Sundial on pedestal',
  params: [P.len('height', '높이', 'Height', 0.9, 0.5, 1.2), P.mat('stone', '받침 석재', 'Pedestal stone', 'stone-limestone-portland', 'stone')],
  tags: ['sundial', 'garden ornament', 'pedestal', '해시계', '앙부일구', '정원 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.lathe('pedestal', p.stone, [[0, 0], [0.22, 0], [0.22, 0.06], [0.13, 0.12], [0.1, H * 0.5], [0.13, H - 0.06], [0.2, H - 0.04], [0.2, H], [0, H]], 0, 0, 0, { segs: k.seg(16, 8) });
    k.cyl('dial', 'metal-bronze-patina', 0.17, 0.17, 0.008, 0, H, 0, { segs: k.seg(28, 10) });
    const g = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.14, 0), new THREE.Vector2(0, 0.1)]);
    k.panel('gnomon', 'metal-bronze-patina', g, 0.006, -0.07, H + 0.008, 0, { ry: 0, bevel: 0.001 });
    return finish(k);
  },
});

const armillary = lsc({
  id: 'lsc-armillary-sphere', ko: '혼천의 조형물 (정원용)', en: 'Armillary sphere sculpture',
  params: [P.len('diameter', '지름', 'Diameter', 0.6, 0.3, 1.2), P.mat('metal', '금속', 'Metal', 'metal-bronze-patina', 'metal')],
  tags: ['armillary sphere', 'garden sculpture', 'honcheonui', '혼천의', '조형물', '정원 조각'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.lathe('stand', p.metal, [[0, 0], [0.18, 0], [0.15, 0.04], [0.04, 0.1], [0.03, 0.4], [0.06, 0.45], [0, 0.45]], 0, 0, 0, { segs: k.seg(16, 8) });
    for (const [rx, ry, rz] of [[0, 0, 0], [PI / 2, 0, 0], [PI / 2, PI / 2, 0], [0.41, 0, 0.3]]) k.add('rings', p.metal, T(new THREE.TorusGeometry(r, 0.008, 6, k.seg(36, 12)), 0, 0.45 + r, 0, rx, ry, rz));
    k.rod('rings', p.metal, [0, 0.45, 0], [0, 0.45 + 2 * r, 0], 0.005, { segs: 6 });
    return finish(k);
  },
});

const obelisk = lsc({
  id: 'lsc-climbing-obelisk', ko: '덩굴 오벨리스크 (클레마티스)', en: 'Climbing obelisk with clematis',
  params: [P.len('height', '높이', 'Height', 1.8, 1.0, 2.5), P.bool('plant', '덩굴식물', 'Climber', true)],
  tags: ['obelisk', 'plant support', 'climber', '오벨리스크', '덩굴 지지대', '클레마티스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, w = 0.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', 'metal-iron-wrought', [sx * w / 2, 0, sz * w / 2], [0, H, 0], 0.008, { segs: 6 });
    for (let i = 1; i < 4; i++) { const y = H * i / 4.5, s = w * (1 - y / H); k.add('frame', 'metal-iron-wrought', T(new THREE.TorusGeometry(s * 0.72, 0.005, 4, 4), 0, y, 0, PI / 2, 0, PI / 4)); }
    k.sphere('finial', 'metal-iron-wrought', 0.03, 0, H, 0, { segs: 8, rings: 6 });
    if (p.plant) {
      blob(k, 'leaves', 'plant-ivy', w * 0.45, 0, H * 0.45, 0, 600, { scale: [1, H * 1.6, 1], jitter: 0.3 });
      const R = rng(601);
      for (let i = 0; i < 12; i++) { const a = R() * PI * 2, y = H * (0.15 + R() * 0.65); k.sphere('flowers', 'plant-petal-lavender', 0.03, Math.cos(a) * w * 0.3 * (1 - y / H + 0.2), y, Math.sin(a) * w * 0.3 * (1 - y / H + 0.2), { segs: 8, rings: 5, scale: [1, 0.4, 1] }); }
    }
    return finish(k);
  },
});

const wallTrellis = lsc({
  id: 'lsc-wall-trellis-climber', placement: 'wall', elevation: 0.0, ko: '벽면 트렐리스와 덩굴 장미', en: 'Wall trellis with climbing rose',
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 2.4), P.len('height', '높이', 'Height', 1.8, 1.0, 2.4), P.bool('plant', '덩굴', 'Climber', true)],
  tags: ['trellis', 'wall trellis', 'climbing rose', '트렐리스', '격자 지지대', '덩굴 장미'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height;
    const n = Math.round(w / 0.15), m = Math.round(h / 0.15);
    for (let i = 0; i <= n; i++) k.box('trellis', 'wood-cedar-oil', 0.02, h, 0.02, -w / 2 + i * (w / n), h / 2, 0.03, { r: 0 });
    for (let j = 0; j <= m; j++) k.box('trellis', 'wood-cedar-oil', w, 0.02, 0.02, 0, j * (h / m) + 0.01, 0.05, { r: 0 });
    if (p.plant) {
      blob(k, 'leaves', 'plant-ivy', 0.5, 0, h * 0.5, 0.1, 610, { scale: [w * 0.9, h * 0.9, 0.2], jitter: 0.3 });
      const R = rng(611);
      for (let i = 0; i < 20; i++) k.sphere('flowers', 'plant-petal-rose-pink', 0.035, (R() - 0.5) * w * 0.8, h * (0.15 + R() * 0.75), 0.17, { segs: 8, rings: 6 });
    }
    return finish(k);
  },
});

const windSpinner = lsc({
  id: 'lsc-kinetic-wind-spinner', ko: '바람개비 조형물 (키네틱)', en: 'Kinetic wind spinner',
  params: [P.len('height', '높이', 'Height', 2.0, 1.0, 3.0), P.mat('metal', '금속', 'Metal', 'metal-copper-satin', 'metal')],
  tags: ['wind spinner', 'kinetic sculpture', 'garden art', '바람개비', '키네틱 조형물', '정원 아트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.cyl('post', 'metal-steel-blackened', 0.015, 0.02, H - 0.3, 0, 0, 0, { segs: 8 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; k.box('cups', p.metal, 0.12, 0.004, 0.06, Math.cos(a) * 0.22, H - 0.3, Math.sin(a) * 0.22, { r: 0, ry: -a, rx: 0.6 }); k.rod('arms', p.metal, [0, H - 0.3, 0], [Math.cos(a) * 0.18, H - 0.3, Math.sin(a) * 0.18], 0.003, { segs: 4 }); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + 0.2; k.box('cups', p.metal, 0.08, 0.004, 0.04, Math.cos(a) * 0.14, H - 0.12, Math.sin(a) * 0.14, { r: 0, ry: -a, rx: -0.6 }); }
    return finish(k);
  },
});

const scarecrow = lsc({
  id: 'lsc-scarecrow', ko: '허수아비', en: 'Scarecrow',
  params: [P.len('height', '높이', 'Height', 1.7, 1.2, 2.0), P.color('shirt', '옷 색', 'Shirt colour', '#b8322a')],
  tags: ['scarecrow', 'vegetable garden', '허수아비', '텃밭', '농촌 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.cyl('post', 'wood-pine-dist', 0.03, 0.035, H, 0, 0, 0, { segs: 8 });
    k.rod('post', 'wood-pine-dist', [-0.55, H * 0.72, 0], [0.55, H * 0.72, 0], 0.025, { segs: 8 });
    k.soft('shirt', 'fabric-canvas-ecru', 0.5, H * 0.35, 0.18, 0.05, 0, H * 0.6, 0, { puff: 0.02, ...C(p.shirt) });
    for (const sx of [-1, 1]) k.cyl('sleeves', 'fabric-canvas-ecru', 0.06, 0.07, 0.4, sx * 0.25 + (sx < 0 ? 0 : 0.4), H * 0.72, 0, { rz: PI / 2, segs: 8, ...C(p.shirt) });
    k.sphere('head', 'plant-straw', 0.13, 0, H * 0.86, 0, { segs: 12, rings: 8 });
    k.cyl('hat', 'plant-straw', 0.25, 0.25, 0.015, 0, H * 0.94, 0, { segs: 16 });
    k.cyl('hat', 'plant-straw', 0.1, 0.12, 0.1, 0, H * 0.94, 0, { segs: 12 });
    return finish(k);
  },
});

const signpost = lsc({
  id: 'lsc-garden-signpost', ko: '정원 이정표 (나무 화살표)', en: 'Wooden garden signpost',
  params: [P.int('arrows', '화살표 수', 'Arrows', 3, 1, 5), P.len('height', '높이', 'Height', 1.6, 1.0, 2.2)],
  tags: ['signpost', 'direction sign', 'wayfinding', '이정표', '안내 표지', '나무 표지판'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.box('post', 'wood-pine-dist', 0.08, H, 0.08, 0, H / 2, 0, { r: 0.006 });
    for (let i = 0; i < p.arrows; i++) {
      const y = H - 0.15 - i * 0.18, dir = i % 2 ? -1 : 1, a = i * 0.6;
      const s = new THREE.Shape([new THREE.Vector2(0, -0.05), new THREE.Vector2(0.45, -0.05), new THREE.Vector2(0.52, 0), new THREE.Vector2(0.45, 0.05), new THREE.Vector2(0, 0.05)]);
      k.panel('arrows', 'wood-cedar-oil', s, 0.025, 0, y, 0, { ry: a + (dir < 0 ? PI : 0), bevel: 0.003 });
    }
    return finish(k);
  },
});

const plantLabels = lsc({
  id: 'lsc-plant-label-stakes', placement: 'surface', ko: '식물 이름표 꽂이 세트', en: 'Plant label stakes',
  params: [P.int('count', '개수', 'Count', 6, 2, 12), P.mat('label', '재질', 'Material', 'metal-zinc', 'metal')],
  tags: ['plant labels', 'plant markers', 'herb tags', '식물 이름표', '이름표 꽂이', '텃밭 표지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * 0.15;
      k.box('stakes', p.label, 0.06, 0.25, 0.003, x, 0.125, 0, { r: 0.002, rx: 0.1 });
      k.box('text', 'paper-black', 0.04, 0.01, 0.001, x, 0.22, 0.004, { r: 0, rx: 0.1 });
    }
    return finish(k);
  },
});

/* ============================================================ street trees and planters */

const treeGrate = lsc({
  id: 'lsc-tree-grate-with-tree', ko: '가로수 보호판과 가로수', en: 'Street tree with tree grate',
  params: [P.len('height', '나무 높이', 'Tree height', 5.0, 3.0, 8.0), P.len('grate', '보호판 크기', 'Grate size', 1.2, 0.9, 1.8)],
  tags: ['tree grate', 'street tree', 'tree pit', '가로수 보호판', '가로수', '보도 수목'],
  build: (p, ctx) => {
    const k = new Kit(ctx), G = p.grate, H = p.height;
    k.panel('grate', 'metal-iron-cast-black', frameShape(G, G, G * 0.35), 0.03, 0, 0.015, 0, { rx: PI / 2 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; k.box('grate', 'metal-iron-cast-black', G * 0.15, 0.02, 0.012, Math.cos(a) * G * 0.32, 0.01, Math.sin(a) * G * 0.32, { r: 0, ry: -a }); }
    k.cyl('soil', 'plant-mulch-bark', G * 0.15, G * 0.15, 0.01, 0, 0, 0, { segs: 16 });
    trunk(k, 'plant-bark-grey', [[0, 0, 0], [0, H * 0.45, 0]], 0.08, 0.06);
    canopy(k, 'plant-maple-green', 9, H * 0.25, H * 0.25, H * 0.25, 0, H * 0.68, 0, 620);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('stakes', 'wood-pine-oil', [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], [Math.cos(a) * 0.12, 1.6, Math.sin(a) * 0.12], 0.025, { segs: 6 }); }
    return finish(k);
  },
});

const youngTree = lsc({
  id: 'lsc-staked-young-tree', ko: '지주목 세운 어린 나무', en: 'Staked young tree',
  params: [P.len('height', '높이', 'Height', 2.5, 1.5, 4.0), P.pick('stakes', '지주 방식', 'Staking', 'tripod', [['tripod', '삼각 지주', 'Tripod'], ['single', '단일 지주', 'Single stake'], ['two', '이각 지주', 'Two stakes']])],
  tags: ['young tree', 'tree stake', 'newly planted', '어린 나무', '지주목', '신규 식재'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.cyl('soil', 'plant-mulch-bark', 0.5, 0.5, 0.04, 0, 0, 0, { segs: k.seg(20, 8) });
    trunk(k, 'plant-bark', [[0, 0, 0], [0.02, H * 0.6, 0]], 0.03, 0.02);
    canopy(k, 'plant-maple-green', 6, H * 0.18, H * 0.22, H * 0.18, 0.02, H * 0.75, 0, 630, { size: 0.55 });
    const n = p.stakes === 'tripod' ? 3 : p.stakes === 'two' ? 2 : 1;
    for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; k.cyl('stakes', 'wood-pine-oil', 0.025, 0.025, H * 0.55, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15, { segs: 6 }); k.rod('ties', 'rubber-black', [Math.cos(a) * 0.15, H * 0.45, Math.sin(a) * 0.15], [0.01, H * 0.45, 0], 0.006, { segs: 4 }); }
    return finish(k);
  },
});

const gabionPlanter = lsc({
  id: 'lsc-gabion-planter', ko: '개비온 화단 (돌망태)', en: 'Gabion planter',
  params: [P.len('length', '길이', 'Length', 1.5, 0.8, 3.0), P.len('height', '높이', 'Height', 0.5, 0.3, 1.0), P.bool('plants', '식재', 'Planted', true)],
  tags: ['gabion planter', 'stone cage', 'raised bed', '개비온', '돌망태 화단', '석축 화단'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, H = p.height, D = 0.5;
    k.box('stones', 'stone-stacked-grey', L, H, D, 0, H / 2, 0, { r: 0.01 });
    k.box('mesh', 'metal-steel-grating', L + 0.01, H + 0.005, D + 0.01, 0, H / 2, 0, { r: 0 });
    if (p.plants) { k.box('soil', 'plant-soil-garden', L - 0.1, 0.01, D - 0.1, 0, H + 0.005, 0, { r: 0 }); for (let i = 0; i < Math.round(L / 0.35); i++) blob(k, 'plants', 'plant-boxwood', 0.17, -L / 2 + 0.2 + i * 0.35, H + 0.12, 0, 640 + i, { detail: 1 }); }
    return finish(k);
  },
});

export const ITEMS = [
  boulder, boulderCluster, seatStone, basalt, ...paths, ...pavers, ...edges, retaining, gardenSteps, sleeperSteps,
  dryStream, waterfall, bambooSpout, stoneBasin, wallFountain, lilyPlanter, pondEdge,
  stoneLantern, pagoda, harubang, jangseung, millstone, stoneBench, jeongja, tileWall,
  pathLight, spikeSpot, solarSet, inground, lanternPost, wallStep,
  popup, oscillating, hoseReel, tapPost, rainChain, wateringCan, toolRack, mower, robotMower, compost,
  birdFeeder, insectHotel, gnome, sundial, armillary, obelisk, wallTrellis, windSpinner, scarecrow, signpost, plantLabels,
  treeGrate, youngTree, gabionPlanter,
];
