// Further lighting: bubble branch and wagon-wheel chandeliers, glass dome and enamel factory
// pendants, wall-wash cylinder sconce, gooseneck reading wall light, multi-arm spider floor lamp,
// uplighter column, pleated table lamp, clamp lamp. Every item marks its bulbs with a light-*
// part and a Kit.light marker. Ceiling items: min y = 0, `elevation` = bottom under a 2.4 m ceiling.
import { THREE, Kit, P } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { canopy, bulb } from './lighting.js';

const PI = Math.PI, TAU = PI * 2;
const CAT = 'lighting';
const CEILING = 2.4;

/** Ceiling lamp: elevation from the default build height. */
function ceil(def) {
  const e = mk({ category: CAT, placement: 'ceiling', ...def });
  // Read when needed: measuring the height at load time built the lamp while the app started.
  Object.defineProperty(e, 'elevation', { enumerable: true, configurable: true, get: () => Math.max(0.3, +(CEILING - e.size[1]).toFixed(3)) });
  return e;
}
const lamp = (def) => mk({ category: CAT, ...def });

const bubble = ceil({
  id: 'bubble-branch-chandelier', ko: '버블 브랜치 샹들리에', en: 'Bubble branch chandelier',
  params: [
    P.int('globes', '구 수', 'Globes', 9, 5, 15),
    P.len('drop', '줄 길이', 'Stem length', 0.5, 0.2, 1.2),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['chandelier', 'bubble chandelier', 'branch chandelier', 'globe chandelier', 'molecular', '샹들리에', '버블 샹들리에', '유리구 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, n = Math.round(p.globes), cy = 0.3, top = cy + p.drop;
    k.cyl('metal', m, 0.012, 0.012, top - cy, 0, cy, 0, { segs: k.seg(10, 5) });
    canopy(k, top + 0.025, 0.06, 0.025, m);
    k.sphere('metal', m, 0.03, 0, cy, 0, { segs: k.seg(14, 6), rings: k.seg(8, 4) });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + i * 0.37, el = ((i % 3) - 1) * 0.45;
      const L = 0.32 + (i % 2) * 0.1;
      const x = Math.cos(a) * Math.cos(el) * L, y = cy + Math.sin(el) * L, z = Math.sin(a) * Math.cos(el) * L;
      k.rod('metal', m, [0, cy, 0], [x, y, z], 0.006, { segs: k.seg(8, 4) });
      k.sphere('glass', 'glass-frosted', 0.07, x * 1.2, y, z * 1.2, { segs: k.seg(18, 8), rings: k.seg(12, 5) });
      k.sphere('bulb', 'light-warm', 0.02, x * 1.2, y, z * 1.2, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    k.light(0, cy, 0, { intensity: 1.4, distance: 7 });
    return finish(k);
  },
});

const wagon = ceil({
  id: 'wagon-wheel-chandelier', ko: '웨건 휠 샹들리에', en: 'Wagon wheel chandelier',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.8, 0.5, 1.2),
    P.int('candles', '전구 수', 'Candles', 8, 4, 12),
    P.mat('wood', '목재', 'Wood', 'wood-dark', 'wood'),
  ],
  tags: ['wagon wheel', 'chandelier', 'rustic chandelier', 'farmhouse', 'candle chandelier', '샹들리에', '마차 바퀴 조명', '시골풍 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, n = Math.round(p.candles), y = 0.08;
    k.add('wood', p.wood, new THREE.TorusGeometry(R, 0.025, k.seg(8, 4), k.seg(48, 14)).rotateX(PI / 2).translate(0, y, 0));
    k.cyl('wood', p.wood, 0.06, 0.06, 0.08, 0, y - 0.04, 0, { segs: k.seg(16, 6) });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.rod('wood', p.wood, [0, y, 0], [Math.cos(a) * R, y, Math.sin(a) * R], 0.012, { segs: k.seg(8, 4) }); }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      k.cyl('candle', 'paint-white-matte', 0.012, 0.012, 0.09, x, y + 0.025, z, { segs: k.seg(10, 5) });
      k.sphere('bulb', 'light-warm', 0.012, x, y + 0.125, z, { segs: k.seg(10, 5), rings: k.seg(6, 3), scale: [1, 1.6, 1] });
      k.cyl('metal', 'metal-black', 0.022, 0.016, 0.02, x, y + 0.01, z, { segs: k.seg(10, 5) });
    }
    const top = 0.75;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; k.rod('metal', 'metal-black', [Math.cos(a) * R, y + 0.02, Math.sin(a) * R], [0, top - 0.15, 0], 0.004, { segs: 5 }); }
    k.cyl('metal', 'metal-black', 0.006, 0.006, 0.15, 0, top - 0.15, 0, { segs: 5 });
    canopy(k, top + 0.02, 0.07, 0.02, 'metal-black');
    k.light(0, y + 0.12, 0, { intensity: 1.2, distance: 6 });
    return finish(k);
  },
});

const glassDome = ceil({
  id: 'glass-dome-pendant', ko: '유리 돔 펜던트', en: 'Glass dome pendant',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.3, 0.18, 0.5),
    P.len('drop', '줄 길이', 'Cord length', 0.8, 0.3, 1.6),
    P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['pendant', 'glass pendant', 'dome pendant', 'kitchen island light', '펜던트', '유리 펜던트', '돔 조명', '아일랜드 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = R * 0.9;
    const prof = Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [R * Math.cos(t * PI / 2) + 0.001, H * Math.sin(t * PI / 2)]; });
    k.lathe('glass', p.glass, prof, 0, 0, 0, { segs: k.seg(36, 12) });
    k.cyl('metal', p.metal, 0.03, 0.03, 0.05, 0, H - 0.005, 0, { segs: k.seg(16, 6) });
    bulb(k, 0, H * 0.45, 0, 0.04, { socket: p.metal });
    const top = H + 0.045 + p.drop;
    k.cyl('cable', 'plastic-black', 0.003, 0.003, top - H - 0.045, 0, H + 0.045, 0, { segs: 5 });
    canopy(k, top + 0.025, 0.05, 0.025, p.metal);
    k.light(0, H * 0.45, 0, { intensity: 0.9, distance: 5 });
    return finish(k);
  },
});

const enamel = ceil({
  id: 'enamel-factory-pendant', ko: '에나멜 공장 펜던트', en: 'Enamel factory pendant',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.4, 0.25, 0.6),
    P.len('drop', '줄 길이', 'Cord length', 0.7, 0.3, 1.5),
    P.mat('shade', '갓', 'Shade', 'paint-green-matte', 'paint'),
  ],
  tags: ['industrial pendant', 'enamel pendant', 'factory light', 'barn light', '인더스트리얼 펜던트', '공장 조명', '에나멜 조명', '펜던트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = R * 0.55;
    const prof = [[R, 0], [R * 0.98, 0.008], [R * 0.7, H * 0.4], [R * 0.3, H * 0.85], [0.04, H], [0.035, H + 0.04]];
    k.lathe('shade', p.shade, prof, 0, 0, 0, { segs: k.seg(40, 12) });
    k.lathe('inside', 'paint-white-gloss', prof.map(([r, y]) => [Math.max(0, r - 0.003), y - 0.003]).reverse(), 0, 0, 0, { segs: k.seg(40, 12) });
    k.add('shade', 'metal-black', new THREE.TorusGeometry(R, 0.004, 4, k.seg(40, 12)).rotateX(PI / 2));
    bulb(k, 0, H * 0.45, 0, 0.035, { socket: 'metal-black' });
    const top = H + 0.04 + p.drop;
    k.cyl('cable', 'metal-black', 0.004, 0.004, top - H - 0.04, 0, H + 0.04, 0, { segs: 5 });
    canopy(k, top + 0.025, 0.05, 0.025, 'metal-black');
    k.light(0, H * 0.4, 0, { intensity: 1, distance: 6, type: 'spot', angle: 1.0 });
    return finish(k);
  },
});

const wallWash = lamp({
  id: 'wall-wash-cylinder-sconce', placement: 'wall', elevation: 1.7, ko: '업다운 원통 벽등', en: 'Up-down cylinder wall light',
  params: [
    P.len('length', '길이', 'Length', 0.2, 0.12, 0.4),
    P.mat('finish', '색', 'Finish', 'metal-black', 'metal'),
  ],
  tags: ['wall light', 'up down light', 'cylinder sconce', 'wall washer', 'exterior light', '벽등', '업다운 조명', '원통 벽등', '외벽등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, r = 0.045;
    k.box('body', p.finish, 0.06, 0.1, 0.012, 0, L / 2, 0.006, { r: 0.003 });
    k.box('body', p.finish, 0.02, 0.02, 0.03, 0, L / 2, 0.025, { r: 0.003 });
    k.cyl('body', p.finish, r, r, L, 0, 0, 0.04 + r, { segs: k.seg(28, 10) });
    for (const y of [0.002, L - 0.004]) k.cyl('glow', 'light-warm', r - 0.006, r - 0.006, 0.002, 0, y, 0.04 + r, { segs: k.seg(24, 8) });
    k.light(0, L + 0.05, 0.04 + r, { intensity: 0.4, distance: 2, type: 'spot', angle: 0.4 });
    k.light(0, -0.05, 0.04 + r, { intensity: 0.4, distance: 2, type: 'spot', angle: 0.4 });
    return finish(k);
  },
});

const gooseneck = lamp({
  id: 'gooseneck-reading-wall-light', placement: 'wall', elevation: 1.05, ko: '구스넥 독서 벽등', en: 'Gooseneck reading wall light',
  params: [
    P.len('reach', '길이', 'Reach', 0.35, 0.2, 0.6),
    P.mat('finish', '색', 'Finish', 'metal-chrome', 'metal'),
  ],
  tags: ['reading light', 'bedside light', 'gooseneck', 'wall lamp', 'headboard light', '독서등', '침대 벽등', '구스넥', '벽 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.reach, m = p.finish;
    k.cyl('body', m, 0.045, 0.045, 0.025, 0, 0.1, 0, { rx: PI / 2, segs: k.seg(20, 8) });
    k.cyl('body', m, 0.012, 0.012, 0.006, 0.02, 0.1, 0.025, { rx: PI / 2, segs: k.seg(10, 5) });
    k.tube('body', m, [[0, 0.1, 0.02], [0, 0.18, R * 0.35], [0, 0.22, R * 0.75], [0, 0.16, R]], 0.006, { segs: k.seg(28, 10), radial: k.seg(8, 4) });
    k.cyl('body', m, 0.022, 0.018, 0.07, 0, 0.12, R, { segs: k.seg(16, 6) });
    k.cyl('glow', 'light-cool', 0.016, 0.016, 0.002, 0, 0.119, R, { segs: k.seg(14, 6) });
    k.light(0, 0.1, R, { color: '#fff4e0', intensity: 0.4, distance: 2, type: 'spot', angle: 0.5 });
    return finish(k);
  },
});

const spider = lamp({
  id: 'spider-floor-lamp', placement: 'floor', ko: '스파이더 멀티암 플로어 램프', en: 'Spider multi-arm floor lamp',
  params: [
    P.int('arms', '팔 수', 'Arms', 5, 3, 7),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
  ],
  tags: ['floor lamp', 'spider lamp', 'multi arm lamp', 'industrial lamp', '플로어 램프', '스탠드', '멀티 암 조명', '거실 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, n = Math.round(p.arms), H = 1.5;
    k.cyl('metal', m, 0.14, 0.15, 0.025, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('metal', m, 0.012, 0.012, H - 0.02, 0, 0.02, 0, { segs: k.seg(10, 5) });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, y0 = H - 0.5 + (i % 3) * 0.18, L = 0.35 + ((i * 7) % 3) * 0.08;
      const x = Math.cos(a) * L, z = Math.sin(a) * L, y = y0 + 0.15 + (i % 2) * 0.1;
      k.rod('metal', m, [0, y0, 0], [x, y, z], 0.006, { segs: k.seg(8, 4) });
      const dir = new THREE.Vector3(x, -0.25, z).normalize();
      const geo = new THREE.CylinderGeometry(0.03, 0.055, 0.1, k.seg(20, 8), 1, true);
      geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)));
      geo.translate(x, y, z);
      k.add('heads', m, geo);
      k.sphere('bulb', 'light-warm', 0.022, x + dir.x * 0.02, y + dir.y * 0.02, z + dir.z * 0.02, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
      if (i < 3) k.light(x + dir.x * 0.06, y + dir.y * 0.06, z + dir.z * 0.06, { intensity: 0.4, distance: 3 });
    }
    return finish(k);
  },
});

const uplighter = lamp({
  id: 'uplighter-column-floor-lamp', placement: 'floor', ko: '사각 기둥 업라이트 스탠드', en: 'Square column uplighter',
  params: [
    P.len('height', '높이', 'Height', 1.4, 0.8, 1.8),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
    P.mat('wood', '프레임', 'Frame', 'wood-walnut', 'wood'),
  ],
  tags: ['floor lamp', 'uplighter', 'column lamp', 'paper lamp', 'japanese', '플로어 램프', '기둥 조명', '업라이트', '한지 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, w = 0.22;
    k.box('shade', p.shade, w - 0.01, H - 0.06, w - 0.01, 0, 0.03 + (H - 0.06) / 2, 0, { r: 0.002 });
    for (const x of [-1, 1]) for (const z of [-1, 1]) k.box('frame', p.wood, 0.02, H, 0.02, x * (w / 2 - 0.01), H / 2, z * (w / 2 - 0.01), { r: 0.003 });
    for (const y of [0.04, H - 0.02]) for (const s of [-1, 1]) {
      k.box('frame', p.wood, w, 0.02, 0.02, 0, y, s * (w / 2 - 0.01), { r: 0.003 });
      k.box('frame', p.wood, 0.02, 0.02, w, s * (w / 2 - 0.01), y, 0, { r: 0.003 });
    }
    k.box('glow', 'light-warm', w - 0.04, 0.004, w - 0.04, 0, H - 0.08, 0, { r: 0 });
    k.light(0, H * 0.6, 0, { intensity: 0.6, distance: 4 });
    return finish(k);
  },
});

const pleated = lamp({
  id: 'pleated-table-lamp', placement: 'surface', ko: '주름 갓 테이블 램프', en: 'Pleated shade table lamp',
  params: [
    P.len('height', '높이', 'Height', 0.5, 0.35, 0.7),
    P.mat('base', '받침', 'Base', 'ceramic-terracotta', 'ceramic'),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
  ],
  tags: ['table lamp', 'pleated lamp', 'bedside lamp', 'ceramic lamp', '테이블 램프', '주름 갓', '침대 협탁 조명', '무드등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, bh = H * 0.5;
    k.lathe('base', p.base, [[0, 0], [0.07, 0], [0.1, bh * 0.25], [0.11, bh * 0.55], [0.07, bh * 0.9], [0.025, bh], [0, bh]], 0, 0, 0, { segs: k.seg(32, 10), smooth: 14 });
    k.cyl('metal', 'metal-brass', 0.008, 0.008, H * 0.3, 0, bh, 0, { segs: k.seg(8, 4) });
    const sh = H * 0.42, rb = H * 0.34, rt = H * 0.2, y0 = H - sh, n = k.hi ? 28 : 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, rm = (rb + rt) / 2, slant = Math.atan2(rb - rt, sh);
      const pw = (TAU * rm) / n * 1.08;
      k.box('shade', p.shade, pw, sh / Math.cos(slant), 0.003, Math.sin(a) * rm, y0 + sh / 2, Math.cos(a) * rm, { r: 0, ry: a + (i % 2 ? 0.35 : -0.35), rx: slant });
    }
    bulb(k, 0, y0 + sh * 0.35, 0, 0.03, { socket: 'metal-brass', up: true });
    k.light(0, y0 + sh * 0.35, 0, { intensity: 0.5, distance: 3 });
    return finish(k);
  },
});

const clamp = lamp({
  id: 'clamp-desk-lamp', placement: 'surface', ko: '클램프 집게 램프', en: 'Clamp-on lamp',
  params: [P.mat('finish', '색', 'Finish', 'paint-black-matte', 'paint')],
  tags: ['clamp lamp', 'clip lamp', 'shelf lamp', 'desk lamp', '집게 조명', '클램프 램프', '책상 조명', '선반 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.finish;
    k.box('clamp', m, 0.05, 0.012, 0.07, 0, 0.006, 0, { r: 0.003 });
    k.box('clamp', m, 0.05, 0.08, 0.012, 0, 0.04, -0.03, { r: 0.003 });
    k.box('clamp', m, 0.05, 0.012, 0.07, 0, 0.074, 0, { r: 0.003 });
    k.cyl('clamp', 'metal-steel', 0.004, 0.004, 0.06, 0, 0.012, 0.02, { segs: 6 });
    k.cyl('clamp', 'plastic-black', 0.014, 0.014, 0.008, 0, 0.004, 0.02, { segs: k.seg(12, 5) });
    k.tube('arm', 'metal-steel', [[0, 0.08, 0], [0, 0.2, 0.02], [0, 0.3, 0.1], [0, 0.32, 0.18]], 0.005, { segs: k.seg(20, 8), radial: k.seg(8, 4) });
    const geo = new THREE.CylinderGeometry(0.025, 0.07, 0.12, k.seg(28, 10), 1, true);
    geo.rotateX(0.7); geo.translate(0, 0.28, 0.22);
    k.add('clamp', m, geo);
    k.sphere('bulb', 'light-warm', 0.025, 0, 0.29, 0.21, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    k.light(0, 0.27, 0.23, { intensity: 0.5, distance: 3, type: 'spot', angle: 0.8 });
    return finish(k);
  },
});

export const ITEMS = [bubble, wagon, glassDome, enamel, wallWash, gooseneck, spider, uplighter, pleated, clamp];
