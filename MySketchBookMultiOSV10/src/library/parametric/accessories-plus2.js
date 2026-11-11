// Accessories (소품) category, part 2: desk and stationery props (pencil cup, stapler, calendar,
// notebooks, fountain pen, magnifier, clock, paperweights, calculator, archive box, wax seal,
// postcards, charging dock, cutting mat, washi tape), hobby and sport props (yoga mat, dumbbells,
// kettlebell, skipping rope, racket, balls, skateboard, ukulele, violin case, knitting, watercolours,
// controllers, VR headset, baduk board, puzzle cubes), seasonal props (tabletop tree, gifts,
// pumpkins, Easter eggs, fairy-light jar, baubles, advent wreath, nutcracker, snowman, birthday
// cake), pets and home care (bowls, pet bed, scratching post, bird cage, fish bowl, litter box,
// broom, cleaning caddy, drying rack, leash hooks, carrier) and Korean traditional props
// (bokjumeoni, yut, norigae, Hahoe mask, incense burner, folding fan).
// Units metres, Y up, front +Z, origin bottom centre (finish()). See ARCHITECTURE.md §12.
import { THREE, Kit, P, T, roundRect, rng, transformAdded } from './helpers.js';
import { finish } from './kitchen.js';
import { acc, C, vessel, bottle, book } from './accessories-plus.js';

const PI = Math.PI, TAU = PI * 2;

/* ====================================================== desk and stationery */

const pencilCup = acc({
  id: 'acc-pencil-cup', ko: '연필꽂이', en: 'Pencil cup',
  params: [P.mat('cup', '컵', 'Cup', 'ceramic-matte-sage', 'ceramic'), P.int('pencils', '연필 수', 'Pencils', 7, 2, 12)],
  tags: ['pencil cup', 'pen holder', 'desk', 'stationery', '연필꽂이', '펜꽂이', '문구', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.04, h = 0.1, cols = ['#f2c14e', '#2f6db0', '#c8402e', '#2b2b2b', '#3b8c5a'];
    vessel(k, 'cup', p.cup, r, h, 0, 0, 0, { wall: 0.004 });
    for (let i = 0; i < p.pencils; i++) {
      const a = i * 2.4, d = r * 0.55 * ((i % 3) / 3 + 0.3), L = 0.15 + (i % 4) * 0.012, t = 0.12;
      const b = [Math.cos(a) * d, 0.008, Math.sin(a) * d], e = [b[0] + Math.cos(a) * L * t, 0.008 + L, b[2] + Math.sin(a) * L * t];
      k.rod('pencils', 'paint-white-matte', b, e, 0.0035, { segs: 6, ...C(cols[i % cols.length]) });
      k.sphere('tips', 'wood-dark', 0.003, e[0], e[1], e[2], { segs: 6, rings: 4 });
    }
    return finish(k);
  },
});

const stapler = acc({
  id: 'acc-stapler-tape', ko: '스테이플러와 테이프 커터', en: 'Stapler and tape dispenser',
  params: [P.color('colour', '색', 'Colour', '#c8402e')],
  tags: ['stapler', 'tape dispenser', 'desk', 'office supplies', '스테이플러', '호치키스', '테이프 커터', '문구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('stapler', 'plastic-abs-gloss-red', 0.15, 0.015, 0.038, 0.006, -0.06, 0.0075, 0, C(p.colour));
    k.rbox('stapler', 'plastic-abs-gloss-red', 0.145, 0.022, 0.034, 0.008, -0.058, 0.032, 0, C(p.colour));
    k.box('metal', 'metal-chrome', 0.12, 0.006, 0.03, -0.05, 0.018, 0, { r: 0.001 });
    k.rbox('dispenser', 'plastic-abs-matte-black', 0.12, 0.06, 0.05, 0.012, 0.08, 0.03, 0);
    k.add('tape', 'plastic-acrylic-clear', T(new THREE.TorusGeometry(0.026, 0.006, k.seg(6, 4), k.seg(24, 10)), 0.075, 0.075, 0, 0, 0, 0));
    k.box('metal', 'metal-chrome', 0.004, 0.012, 0.03, 0.14, 0.064, 0, { r: 0 });
    return finish(k);
  },
});

const calendar = acc({
  id: 'acc-desk-calendar', ko: '탁상 달력', en: 'Desk calendar',
  params: [P.len('width', '폭', 'Width', 0.2, 0.12, 0.3), P.color('cover', '표지 색', 'Cover colour', '#2f4f7a')],
  tags: ['desk calendar', 'tent calendar', 'planner', 'office', '탁상 달력', '달력', '캘린더', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = W * 0.72, a = 0.32;
    for (const s of [-1, 1]) k.box('board', 'paper-cardboard', W, H, 0.003, 0, (H / 2) * Math.cos(a), s * (H / 2) * Math.sin(a), { r: 0, rx: s * a, ...C(p.cover) });
    k.box('page', 'paper', W * 0.94, H * 0.88, 0.002, 0, (H / 2) * Math.cos(a) - 0.004, (H / 2) * Math.sin(a) + 0.003, { r: 0, rx: a });
    for (let i = 0; i < 5; i++) k.box('grid', 'paper-black', W * 0.8, 0.002, 0.001, 0, H * 0.15 * (i + 1) * Math.cos(a), H * 0.15 * (i + 1) * Math.sin(a) + 0.005, { r: 0, rx: a });
    for (let i = 0; i < 8; i++) k.add('rings', 'metal-silver-polished', T(new THREE.TorusGeometry(0.006, 0.0012, 4, k.seg(12, 6)), (i - 3.5) * W / 9, H * Math.cos(a), 0, 0, PI / 2, 0));
    return finish(k);
  },
});

const notebooks = acc({
  id: 'acc-notebook-stack', ko: '노트 더미와 펜', en: 'Notebooks with a pen',
  params: [P.int('count', '권 수', 'Notebooks', 4, 1, 8)],
  tags: ['notebooks', 'journals', 'stack', 'pen', '노트', '공책', '다이어리', '문구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = rng(21), cols = ['#2b2b2b', '#c9a24a', '#8a2f2f', '#5a7a6a', '#d8d0c0', '#2f4f7a'];
    let y = 0;
    for (let i = 0; i < p.count; i++) { const t = 0.012 + r() * 0.01; book(k, cols[i % cols.length], 0.15 + r() * 0.04, t, 0.21, (r() - 0.5) * 0.02, y, (r() - 0.5) * 0.02, (r() - 0.5) * 0.2); y += t; }
    k.cyl('pen', 'metal-gold-polished', 0.005, 0.005, 0.14, -0.07, y + 0.005, 0.02, { rz: -PI / 2, ry: 0.4, segs: 10 });
    return finish(k);
  },
});

const fountainPen = acc({
  id: 'acc-fountain-pen-ink', ko: '만년필과 잉크병', en: 'Fountain pen and ink bottle',
  params: [P.mat('tray', '펜 트레이', 'Pen tray', 'leather-aniline-cognac', 'leather'), P.mat('pen', '펜 몸체', 'Pen barrel', 'plastic-acrylic-black', 'plastic')],
  tags: ['fountain pen', 'ink bottle', 'calligraphy', 'writing', '만년필', '잉크', '캘리그라피', '문구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.slab('tray', p.tray, roundRect(0.2, 0.07, 0.02), 0.006, 0);
    k.cyl('pen', p.pen, 0.0065, 0.0065, 0.1, -0.06, 0.013, 0, { rz: -PI / 2, segs: 12 });
    k.cyl('pen', p.pen, 0.0055, 0.003, 0.03, 0.04, 0.013, 0, { rz: -PI / 2, segs: 12 });
    k.cyl('nib', 'metal-gold-polished', 0.003, 0.0005, 0.018, 0.07, 0.013, 0, { rz: -PI / 2, segs: 8 });
    k.box('nib', 'metal-gold-polished', 0.05, 0.002, 0.003, -0.03, 0.0205, 0, { r: 0 });
    k.box('ink', 'glass-clear', 0.06, 0.05, 0.06, 0.15, 0.025, 0.02, { r: 0.008 });
    k.box('inkfill', 'resin-epoxy-blue', 0.05, 0.03, 0.05, 0.15, 0.017, 0.02, { r: 0.004 });
    k.cyl('caps', 'plastic-black', 0.016, 0.016, 0.02, 0.15, 0.05, 0.02, { segs: 12 });
    return finish(k);
  },
});

const magnifier = acc({
  id: 'acc-desk-magnifier', ko: '돋보기', en: 'Magnifying glass',
  params: [P.mat('handle', '손잡이', 'Handle', 'wood-rosewood-oil', 'wood'), P.len('diameter', '렌즈 지름', 'Lens diameter', 0.08, 0.05, 0.12)],
  tags: ['magnifying glass', 'magnifier', 'loupe', 'reading', '돋보기', '확대경', '루페', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.add('rim', 'metal-brass-polished', T(new THREE.TorusGeometry(r, 0.004, k.seg(8, 4), k.seg(32, 12)), 0, 0.005, 0, PI / 2, 0, 0));
    k.cyl('glass', 'glass-clear', r, r, 0.004, 0, 0.003, 0, { segs: k.seg(28, 10) });
    k.cyl('handle', p.handle, 0.008, 0.01, 0.11, r + 0.005, 0.009, 0, { rz: -PI / 2, segs: 12 });
    return finish(k);
  },
});

const cubeClock = acc({
  id: 'acc-cube-clock', ko: '나무 큐브 디지털 시계', en: 'Wooden cube digital clock',
  params: [P.mat('wood', '목재', 'Wood', 'wood-white-oak-oil', 'wood'), P.len('width', '폭', 'Width', 0.15, 0.1, 0.24)],
  tags: ['digital clock', 'led clock', 'alarm clock', 'wooden clock', '디지털 시계', '탁상 시계', 'LED 시계', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = W * 0.45, D = W * 0.45;
    k.box('body', p.wood, W, H, D, 0, H / 2, 0, { r: 0.006 });
    const digit = W * 0.15;
    for (let i = 0; i < 4; i++) k.box('digits', 'led-amber', digit * 0.7, H * 0.45, 0.001, (i - 1.5) * digit + (i > 1 ? digit * 0.25 : -digit * 0.25), H / 2, D / 2 + 0.0005, { r: 0 });
    k.light(0, H / 2, D / 2 + 0.01, { color: '#ffb347', intensity: 0.05, distance: 0.6 });
    return finish(k);
  },
});

const paperweights = acc({
  id: 'acc-paperweight-set', ko: '유리 문진 세트', en: 'Glass paperweights',
  params: [P.mat('glass', '유리', 'Glass', 'glass-color-cobalt', 'glass'), P.int('count', '개수', 'Count', 3, 1, 4)],
  tags: ['paperweight', 'glass dome', 'desk', 'art glass', '문진', '유리 문진', '페이퍼웨이트', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), mats = [p.glass, 'glass-color-emerald', 'glass-tint-amber', 'glass-color-magenta'];
    for (let i = 0; i < p.count; i++) {
      const r = 0.035 - i * 0.004, x = (i - (p.count - 1) / 2) * 0.075;
      k.sphere(`dome${i}`, mats[i], r, x, 0, 0, { thetaLength: PI / 2, scale: [1, 0.8, 1] });
      k.sphere('core', 'glass-color-yellow', r * 0.35, x, r * 0.3, 0, { segs: 10, rings: 8 });
    }
    return finish(k);
  },
});

const calculator = acc({
  id: 'acc-calculator', ko: '계산기', en: 'Desk calculator',
  params: [P.color('colour', '색', 'Colour', '#3a3d42')],
  tags: ['calculator', 'desk calculator', 'office', 'accounting', '계산기', '전자계산기', '사무용품', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.11, D = 0.16, a = 0.08;
    k.rbox('body', 'plastic-abs-matte-anthracite', W, 0.02, D, 0.006, 0, 0.012, 0, { rx: -a, ...C(p.colour) });
    k.box('display', 'screen-on-white', W * 0.8, 0.002, 0.035, 0, 0.026, -D * 0.33, { r: 0, rx: -a });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) k.box(r === 4 && c === 3 ? 'keyOrange' : 'keys', r === 4 && c === 3 ? 'plastic-abs-gloss-orange' : 'plastic-abs-gloss-white', 0.018, 0.005, 0.014, (c - 1.5) * 0.025, 0.024 - (r - 2) * 0.0025, -D * 0.12 + r * 0.024, { r: 0.002, rx: -a });
    return finish(k);
  },
});

const docBox = acc({
  id: 'acc-document-box', ko: '문서 보관 상자', en: 'Archive document boxes',
  params: [P.mat('board', '판지', 'Board', 'paper-kraft', 'other'), P.int('count', '상자 수', 'Boxes', 3, 1, 5)],
  tags: ['archive box', 'document box', 'file box', 'storage', '문서 상자', '파일 박스', '보관함', '사무용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * 0.1;
      k.box('boxes', p.board, 0.095, 0.26, 0.33, x, 0.13, 0, { r: 0.002 });
      k.box('labels', 'paper', 0.06, 0.08, 0.002, x, 0.17, 0.166, { r: 0 });
      k.box('holes', 'paper-black', 0.02, 0.012, 0.002, x, 0.22, 0.166, { r: 0 });
    }
    return finish(k);
  },
});

const waxSeal = acc({
  id: 'acc-wax-seal-set', ko: '실링 왁스 세트', en: 'Wax seal kit',
  params: [P.color('wax', '왁스 색', 'Wax colour', '#9b1c2e'), P.mat('handle', '손잡이', 'Handle', 'wood-am-walnut-oil', 'wood')],
  tags: ['wax seal', 'sealing wax', 'stamp', 'letters', '실링 왁스', '씰링', '도장', '편지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('envelope', 'paper-kraft', 0.16, 0.003, 0.11, 0, 0.0015, 0, { r: 0 });
    k.cyl('seal', 'wax-candle-red', 0.014, 0.016, 0.004, 0.0, 0.003, 0.0, { segs: 14, ...C(p.wax) });
    k.lathe('stamp', p.handle, [[0, 0], [0.012, 0], [0.009, 0.02], [0.007, 0.06], [0.012, 0.08], [0, 0.085]], 0.11, 0.012, -0.02, { segs: k.seg(14, 6) });
    k.cyl('stamp', 'metal-brass-antique', 0.014, 0.014, 0.012, 0.11, 0, -0.02, { segs: 14 });
    for (let i = 0; i < 3; i++) k.cyl('sticks', 'wax-candle-red', 0.006, 0.006, 0.09, -0.05 + i * 0.016, 0.006, 0.08, { rz: -PI / 2, segs: 8, ...C(p.wax) });
    return finish(k);
  },
});

const postcards = acc({
  id: 'acc-postcard-easel', ko: '엽서 이젤 거치대', en: 'Postcards on a mini easel',
  params: [P.mat('wood', '목재', 'Wood', 'wood-birch-oil', 'wood'), P.len('height', '높이', 'Height', 0.22, 0.15, 0.32)],
  tags: ['postcard', 'mini easel', 'display', 'art print', '엽서', '이젤', '엽서 거치대', '책상 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, a = 0.2;
    for (const s of [-1, 1]) k.rod('easel', p.wood, [s * H * 0.25, 0, H * 0.06], [s * H * 0.04, H, -H * 0.12], 0.005, { segs: 6 });
    k.rod('easel', p.wood, [0, 0, -H * 0.35], [0, H * 0.8, -H * 0.1], 0.004, { segs: 6 });
    k.box('easel', p.wood, H * 0.6, 0.008, 0.016, 0, H * 0.3, H * 0.0, { r: 0.002 });
    k.box('card', 'paper-glossy', H * 0.55, H * 0.4, 0.002, 0, H * 0.3 + H * 0.2 * Math.cos(a), -H * 0.2 * Math.sin(a) + 0.004, { r: 0, rx: -a, ...C('#5d8fb5') });
    k.box('card2', 'paper', H * 0.5, H * 0.36, 0.002, 0.004, H * 0.3 + H * 0.18 * Math.cos(a), -H * 0.18 * Math.sin(a) + 0.006, { r: 0, rx: -a, ry: 0.05 });
    return finish(k);
  },
});

const chargingDock = acc({
  id: 'acc-charging-dock', ko: '무선 충전 거치대와 휴대폰', en: 'Charging dock with phone',
  params: [P.mat('dock', '거치대', 'Dock', 'metal-al-anodised-grey', 'metal'), P.bool('watch', '시계 충전대', 'Watch charger', true)],
  tags: ['charging dock', 'wireless charger', 'smartphone', 'phone stand', '충전 거치대', '무선 충전기', '휴대폰', '스마트폰'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = 0.25;
    k.slab('dock', p.dock, roundRect(p.watch ? 0.16 : 0.09, 0.09, 0.02), 0.01, 0);
    k.box('dock', p.dock, 0.07, 0.12, 0.012, -0.0 - (p.watch ? 0.035 : 0), 0.07, -0.015, { r: 0.004, rx: -a });
    k.rbox('phone', 'plastic-abs-gloss-black', 0.072, 0.15, 0.008, 0.006, -(p.watch ? 0.035 : 0), 0.09, -0.004, { rx: -a });
    k.box('screen', 'screen-on-dark', 0.066, 0.14, 0.001, -(p.watch ? 0.035 : 0), 0.09, 0.0005 + 0.0, { r: 0, rx: -a });
    if (p.watch) {
      k.cyl('dock', p.dock, 0.006, 0.006, 0.05, 0.05, 0.01, 0, { segs: 8 });
      k.rbox('watchface', 'plastic-abs-gloss-black', 0.04, 0.048, 0.012, 0.006, 0.05, 0.065, 0.008);
      k.box('band', 'plastic-silicone-sage', 0.024, 0.055, 0.004, 0.05, 0.03, 0.0, { r: 0.002 });
    }
    return finish(k);
  },
});

const cuttingMat = acc({
  id: 'acc-cutting-mat-set', ko: '커팅 매트와 공구', en: 'Cutting mat with craft tools',
  params: [P.color('mat', '매트 색', 'Mat colour', '#3e7d5a'), P.len('width', '폭', 'Width', 0.45, 0.3, 0.6)],
  tags: ['cutting mat', 'scissors', 'ruler', 'craft', '커팅 매트', '가위', '자', '공예'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = W * 0.66;
    k.box('mat', 'plastic-pp-sage', W, 0.003, D, 0, 0.0015, 0, { r: 0, ...C(p.mat) });
    for (let i = 1; i < 6; i++) k.box('lines', 'paint-white-matte', 0.0015, 0.0005, D * 0.95, -W / 2 + (W * i) / 6, 0.0032, 0, { r: 0 });
    k.box('ruler', 'metal-al-brushed', W * 0.75, 0.002, 0.03, -W * 0.05, 0.004, D * 0.3, { r: 0 });
    for (const s of [-1, 1]) k.add('scissors', 'plastic-abs-gloss-orange', T(new THREE.TorusGeometry(0.014, 0.004, 6, k.seg(14, 8)), W * 0.2 + s * 0.012, 0.005, -D * 0.15 + 0.03, PI / 2, 0, 0));
    for (const s of [-1, 1]) k.box('blades', 'metal-ss-polished', 0.008, 0.002, 0.09, W * 0.2 + s * 0.003, 0.005, -D * 0.15 - 0.03, { r: 0, ry: s * 0.06 });
    k.cyl('knife', 'plastic-abs-gloss-yellow', 0.007, 0.007, 0.13, -W * 0.2, 0.01, -D * 0.1, { rz: -PI / 2, ry: 0.5, segs: 10 });
    return finish(k);
  },
});

const washi = acc({
  id: 'acc-washi-tape-stand', ko: '마스킹 테이프 거치대', en: 'Washi tape stand',
  params: [P.mat('wood', '목재', 'Wood', 'wood-birch-matte', 'wood'), P.int('rolls', '테이프 수', 'Rolls', 6, 2, 9)],
  tags: ['washi tape', 'masking tape', 'craft', 'journaling', '마스킹 테이프', '데코 테이프', '다꾸', '문구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.rolls, W = n * 0.022 + 0.04, cols = ['#f4b6c2', '#b8d8e8', '#f7e3a1', '#c9b3e6', '#bfe3c0', '#f2a65a', '#e8e4da', '#7aa58a', '#d14b3f'];
    k.box('stand', p.wood, W, 0.012, 0.07, 0, 0.006, 0, { r: 0.003 });
    for (const s of [-1, 1]) k.box('stand', p.wood, 0.012, 0.07, 0.05, s * (W / 2 - 0.006), 0.047, 0, { r: 0.003 });
    k.cyl('stand', 'metal-brass', 0.005, 0.005, W - 0.012, -W / 2 + 0.006, 0.055, 0, { rz: -PI / 2, segs: 8 });
    for (let i = 0; i < n; i++) k.cyl('rolls', 'paper', 0.026, 0.026, 0.018, -W / 2 + 0.024 + i * 0.022, 0.055, 0, { rz: -PI / 2, segs: k.seg(20, 8), ...C(cols[i % cols.length]) });
    return finish(k);
  },
});

/* ======================================================= hobby and sport */

const yogaMat = acc({
  id: 'acc-yoga-mat-roll', placement: 'floor', ko: '말아 둔 요가 매트', en: 'Rolled yoga mat',
  params: [P.color('colour', '색', 'Colour', '#7a6fa8'), P.len('width', '매트 폭', 'Mat width', 0.61, 0.5, 0.8)],
  tags: ['yoga mat', 'exercise mat', 'fitness', 'pilates', '요가 매트', '운동 매트', '필라테스', '홈트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, r = 0.07;
    k.cyl('mat', 'foam-eva-color', r, r, W, -W / 2, r, 0, { rz: -PI / 2, segs: k.seg(24, 10), ...C(p.colour) });
    k.cyl('core', 'foam-eva-grey', r * 0.3, r * 0.3, W + 0.002, -W / 2 - 0.001, r, 0, { rz: -PI / 2, segs: 12, ...C('#3a3a3a') });
    for (const s of [-1, 1]) k.add('strap', 'fabric-canvas-black', T(new THREE.TorusGeometry(r + 0.004, 0.004, 4, k.seg(24, 10)), s * W * 0.3, r, 0, 0, PI / 2, 0));
    return finish(k);
  },
});

const dumbbells = acc({
  id: 'acc-dumbbell-pair', placement: 'floor', ko: '아령 한 쌍', en: 'Pair of dumbbells',
  params: [P.color('colour', '색', 'Colour', '#3a3d42'), P.len('size', '추 지름', 'Weight diameter', 0.1, 0.06, 0.16)],
  tags: ['dumbbells', 'weights', 'fitness', 'home gym', '아령', '덤벨', '운동 기구', '홈트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.size / 2, L = 0.26;
    for (const z of [-r * 1.2, r * 1.2]) {
      k.cyl('handles', 'metal-chrome', 0.014, 0.014, L, -L / 2, r, z, { rz: -PI / 2, segs: 12 });
      for (const s of [-1, 1]) k.cyl('weights', 'rubber-black', r, r, 0.05, s * (L / 2 - 0.025) - 0.025, r, z, { rz: -PI / 2, segs: k.seg(6, 6), ...C(p.colour) });
    }
    return finish(k);
  },
});

const kettlebell = acc({
  id: 'acc-kettlebell', placement: 'floor', ko: '케틀벨', en: 'Kettlebell',
  params: [P.mat('iron', '재질', 'Material', 'metal-iron-cast-black', 'metal'), P.len('size', '지름', 'Diameter', 0.2, 0.14, 0.28)],
  tags: ['kettlebell', 'weights', 'fitness', 'home gym', '케틀벨', '운동 기구', '홈트', '근력'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.size / 2;
    k.sphere('bell', p.iron, r, 0, r * 0.9, 0, { scale: [1, 0.95, 1] });
    k.cyl('bell', p.iron, r * 0.6, r * 0.6, r * 0.1, 0, 0, 0, { segs: k.seg(20, 8) });
    const h = new THREE.TorusGeometry(r * 0.55, r * 0.11, k.seg(10, 5), k.seg(20, 8), PI);
    h.scale(1, 1.15, 1);
    k.add('bell', p.iron, T(h, 0, r * 1.55, 0));
    return finish(k);
  },
});

const jumpRope = acc({
  id: 'acc-skipping-rope', placement: 'floor', ko: '줄넘기', en: 'Skipping rope',
  params: [P.color('handles', '손잡이 색', 'Handle colour', '#e86b5f')],
  tags: ['skipping rope', 'jump rope', 'fitness', 'cardio', '줄넘기', '운동', '홈트', '피트니스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), pts = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU * 2.2; const rr = 0.12 + i * 0.002; pts.push([Math.cos(a) * rr, 0.004 + (i % 7 === 0 ? 0.004 : 0), Math.sin(a) * rr]); }
    k.tube('rope', 'plastic-pvc-anthracite', pts, 0.003, { segs: k.seg(160, 60), radial: 5 });
    for (const s of [-1, 1]) k.cyl('handles', 'plastic-abs-gloss-red', 0.012, 0.014, 0.13, s * 0.2, 0.013, s * 0.12, { rz: s * PI / 2, ry: 0.4, segs: 12, ...C(p.handles) });
    return finish(k);
  },
});

const racket = acc({
  id: 'acc-tennis-racket', ko: '테니스 라켓과 공', en: 'Tennis racket and balls',
  params: [P.color('frame', '프레임 색', 'Frame colour', '#2b2b2b'), P.int('balls', '공 수', 'Balls', 2, 1, 4)],
  tags: ['tennis racket', 'tennis balls', 'sport', 'racquet', '테니스 라켓', '테니스공', '운동', '스포츠'],
  build: (p, ctx) => {
    const k = new Kit(ctx), y = 0.015;
    const head = new THREE.TorusGeometry(0.13, 0.01, 6, k.seg(36, 14));
    head.scale(0.78, 1, 1);
    k.add('frame', 'carbon-fiber', T(head, 0, y, -0.1, PI / 2, 0, 0), C(p.frame));
    for (let i = -6; i <= 6; i++) { k.box('strings', 'paint-white-matte', 0.0015, 0.0015, 0.25 * Math.sqrt(Math.max(0, 1 - (i / 7) ** 2)), i * 0.0145, y, -0.1, { r: 0 }); k.box('strings', 'paint-white-matte', 0.2 * Math.sqrt(Math.max(0, 1 - (i / 7) ** 2)), 0.0015, 0.0015, 0, y, -0.1 + i * 0.018, { r: 0 }); }
    k.rod('frame', 'carbon-fiber', [-0.03, y, 0.02], [0, y, 0.12], 0.008, { segs: 6, ...C(p.frame) });
    k.rod('frame', 'carbon-fiber', [0.03, y, 0.02], [0, y, 0.12], 0.008, { segs: 6, ...C(p.frame) });
    k.cyl('grip', 'leather-topgrain-white', 0.016, 0.016, 0.2, 0, y, 0.12, { rx: PI / 2, segs: 8 });
    for (let i = 0; i < p.balls; i++) k.sphere('balls', 'fabric-felt-natural', 0.033, 0.16 + (i % 2) * 0.07, 0.033, -0.05 + Math.floor(i / 2) * 0.07, { segs: 14, rings: 10, ...C('#d7e84a') });
    return finish(k);
  },
});

/** Ball with seam rings (sphere + thin tori). */
function ball(k, mat, r, seam, colour, y = r) {
  k.sphere('ball', mat, r, 0, y, 0, { segs: k.seg(28, 12), rings: k.seg(20, 10), ...(colour ? C(colour) : {}) });
  for (const [rx, ry] of [[0, 0], [PI / 2, 0], [PI / 2, PI / 2]]) k.add('seams', seam, T(new THREE.TorusGeometry(r * 1.002, r * 0.015, 4, k.seg(32, 14)), 0, y, 0, rx, ry, 0));
}

const basketball = acc({
  id: 'acc-basketball', placement: 'floor', ko: '농구공', en: 'Basketball',
  params: [P.len('diameter', '지름', 'Diameter', 0.24, 0.18, 0.26), P.color('colour', '색', 'Colour', '#d8692f')],
  tags: ['basketball', 'ball', 'sport', 'kids room', '농구공', '공', '스포츠', '운동'],
  build: (p, ctx) => { const k = new Kit(ctx); ball(k, 'rubber-latex', p.diameter / 2, 'rubber-black', p.colour); return finish(k); },
});

const football = acc({
  id: 'acc-football', placement: 'floor', ko: '축구공', en: 'Football (soccer ball)',
  params: [P.len('diameter', '지름', 'Diameter', 0.22, 0.16, 0.23)],
  tags: ['football', 'soccer ball', 'ball', 'sport', '축구공', '공', '스포츠', '운동'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    const ico = new THREE.IcosahedronGeometry(r, ctx.quality === 'low' ? 1 : 2);
    k.add('ball', 'leather-topgrain-white', T(ico, 0, r, 0));
    const pent = new THREE.IcosahedronGeometry(r * 1.004, 0).attributes.position;
    const seen = new Set();
    for (let i = 0; i < pent.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pent, i), key = v.toArray().map((n) => n.toFixed(3)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const n = v.clone().normalize(), g = new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.004, 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
      g.translate(n.x * r * 0.985, n.y * r * 0.985 + r, n.z * r * 0.985);
      k.add('patches', 'leather-topgrain-black', g);
    }
    return finish(k);
  },
});

const skateboard = acc({
  id: 'acc-skateboard', placement: 'floor', ko: '스케이트보드', en: 'Skateboard',
  params: [P.mat('deck', '데크', 'Deck', 'wood-maple-gloss', 'wood'), P.color('wheels', '바퀴 색', 'Wheel colour', '#f2c14e')],
  tags: ['skateboard', 'deck', 'skate', 'sport', '스케이트보드', '보드', '스케이트', '스포츠'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = 0.8, W = 0.2, y = 0.075;
    k.slab('deck', p.deck, roundRect(W, L, W / 2 - 0.001), 0.012, y);
    k.slab('grip', 'rubber-sheet-black', roundRect(W - 0.004, L - 0.004, W / 2 - 0.003), 0.002, y + 0.012);
    for (const s of [-1, 1]) {
      k.box('trucks', 'metal-al-polished', 0.16, 0.025, 0.05, 0, y - 0.02, s * 0.27, { r: 0.006 });
      for (const sx of [-1, 1]) k.cyl('wheels', 'plastic-silicone-white', 0.027, 0.027, 0.032, sx * 0.1 - 0.016, 0.027, s * 0.27, { rz: -PI / 2, segs: k.seg(16, 8), ...C(p.wheels) });
    }
    return finish(k);
  },
});

const ukulele = acc({
  id: 'acc-ukulele', ko: '우쿨렐레', en: 'Ukulele',
  params: [P.mat('wood', '목재', 'Wood', 'wood-mahogany-oil', 'wood'), P.len('length', '길이', 'Length', 0.53, 0.45, 0.66)],
  tags: ['ukulele', 'guitar', 'instrument', 'music', '우쿨렐레', '악기', '기타', '음악'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, s = L / 0.53;
    const body = new THREE.Shape();
    body.absellipse(0, 0.06 * s, 0.11 * s, 0.09 * s, 0, TAU, false, 0);
    const b2 = new THREE.Shape(); b2.absellipse(0, -0.08 * s, 0.085 * s, 0.075 * s, 0, TAU, false, 0);
    k.slab('body', p.wood, body, 0.06 * s, 0);
    k.slab('body', p.wood, b2, 0.06 * s, 0);
    k.cyl('hole', 'paper-black', 0.025 * s, 0.025 * s, 0.001, 0, 0.06 * s, -0.02 * s, { segs: k.seg(16, 8) });
    k.box('neck', 'wood-rosewood-oil', 0.035 * s, 0.02 * s, 0.24 * s, 0, 0.055 * s, -0.2 * s - 0.0, { r: 0.004 });
    k.box('neck', p.wood, 0.05 * s, 0.015 * s, 0.07 * s, 0, 0.05 * s, -0.355 * s, { r: 0.004 });
    k.box('bridge', 'wood-rosewood-oil', 0.06 * s, 0.008, 0.012, 0, 0.062 * s, 0.07 * s, { r: 0.002 });
    for (let i = 0; i < 4; i++) k.box('strings', 'plastic-nylon-natural', 0.0012, 0.0012, 0.36 * s, (i - 1.5) * 0.007 * s, 0.067 * s, -0.12 * s, { r: 0 });
    return finish(k);
  },
});

const violinCase = acc({
  id: 'acc-violin-case', placement: 'floor', ko: '바이올린 케이스', en: 'Violin case',
  params: [P.mat('shell', '외피', 'Shell', 'fabric-canvas-black', 'fabric')],
  tags: ['violin case', 'instrument case', 'music', 'orchestra', '바이올린 케이스', '악기 케이스', '바이올린', '음악'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = new THREE.Shape();
    s.moveTo(-0.39, -0.12); s.quadraticCurveTo(-0.42, 0, -0.39, 0.12); s.lineTo(0.15, 0.09); s.quadraticCurveTo(0.3, 0.06, 0.39, 0.05); s.quadraticCurveTo(0.42, 0, 0.39, -0.05); s.quadraticCurveTo(0.3, -0.06, 0.15, -0.09); s.lineTo(-0.39, -0.12);
    k.slab('case', p.shell, s, 0.12, 0, { bevel: 0.02 });
    k.slab('zip', 'plastic-black', s, 0.008, 0.056, { bevel: 0.002 });
    k.box('handle', 'leather-aniline-black', 0.12, 0.02, 0.025, -0.05, 0.12, 0, { r: 0.008 });
    return finish(k);
  },
});

const knitting = acc({
  id: 'acc-knitting-basket', ko: '뜨개질 바구니', en: 'Knitting basket',
  params: [P.mat('basket', '바구니', 'Basket', 'rope-seagrass', 'other'), P.int('balls', '실타래 수', 'Yarn balls', 4, 1, 6)],
  tags: ['knitting', 'yarn', 'basket', 'craft', '뜨개질', '털실', '실타래', '공예'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.16, h = 0.2, cols = ['#c75b5b', '#e8d8b8', '#5f8b9b', '#d9a441', '#7a8b5a', '#9b6b9e'];
    k.lathe('basket', p.basket, [[0, 0], [r * 0.85, 0], [r, h], [r - 0.012, h], [r * 0.85 - 0.012, 0.012], [0, 0.012]], 0, 0, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < p.balls; i++) {
      const a = i * 2.3, d = i === 0 ? 0 : r * 0.5, br = 0.055;
      k.sphere('yarn', 'fabric-knit-cream', br, Math.cos(a) * d * 0.9, h - br * 0.3 + (i === 0 ? 0.02 : 0), Math.sin(a) * d * 0.9, { segs: k.seg(16, 8), rings: k.seg(12, 6), ...C(cols[i % cols.length]) });
    }
    for (const s of [-1, 1]) k.rod('needles', 'wood-bamboo-natural', [s * 0.03, h - 0.02, 0], [s * 0.08, h + 0.2, -0.05], 0.004, { segs: 6 });
    return finish(k);
  },
});

const watercolour = acc({
  id: 'acc-watercolour-set', ko: '수채화 도구 세트', en: 'Watercolour painting set',
  params: [P.mat('pad', '스케치북', 'Pad', 'paper-watercolor', 'other')],
  tags: ['watercolour', 'paint brushes', 'palette', 'art', '수채화', '물감', '붓', '미술'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#5d4037', '#2b2b2b'];
    k.box('pad', p.pad, 0.3, 0.012, 0.21, 0, 0.006, 0, { r: 0.002 });
    k.box('pad', 'paper-black', 0.3, 0.003, 0.21, 0, 0.0015, 0, { r: 0 });
    k.box('wash', 'paper-watercolor', 0.18, 0.001, 0.11, 0, 0.0125, 0, { r: 0, ...C('#9cc3d9') });
    k.box('tin', 'metal-white', 0.18, 0.012, 0.07, 0.26, 0.006, -0.03, { r: 0.004 });
    for (let i = 0; i < 8; i++) k.box('pans', 'paper', 0.017, 0.003, 0.025, 0.26 + (i % 4 - 1.5) * 0.04, 0.0135, -0.03 + (Math.floor(i / 4) - 0.5) * 0.03, { r: 0, ...C(cols[i]) });
    vessel(k, 'jar', 'glass-clear', 0.035, 0.09, 0.24, 0, 0.07, { wall: 0.003 });
    k.cyl('water', 'water', 0.03, 0.03, 0.05, 0.24, 0.004, 0.07, { segs: 14 });
    for (let i = 0; i < 3; i++) k.rod('brushes', 'wood-ebony-gloss', [0.24 + (i - 1) * 0.008, 0.01, 0.07], [0.24 + (i - 1) * 0.03, 0.2, 0.07 - 0.02], 0.003, { segs: 6 });
    return finish(k);
  },
});

const controllers = acc({
  id: 'acc-game-controllers', ko: '게임 컨트롤러 두 개', en: 'Pair of game controllers',
  params: [P.color('colour', '색', 'Colour', '#f2f2f2')],
  tags: ['game controller', 'gamepad', 'joystick', 'gaming', '게임 패드', '컨트롤러', '게임기', '게임'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const [x, z, ry, col] of [[-0.09, 0, 0.3, p.colour], [0.09, 0.03, -0.4, '#2b2b2b']]) {
      transformAdded(k, () => {
        k.rbox('pad', 'plastic-abs-gloss-white', 0.1, 0.03, 0.06, 0.012, 0, 0.022, 0, C(col));
        for (const s of [-1, 1]) k.sphere('pad', 'plastic-abs-gloss-white', 0.03, s * 0.05, 0.02, 0.018, { scale: [0.9, 0.6, 1.3], ...C(col) });
        for (const s of [-1, 1]) k.cyl('sticks', 'rubber-black', 0.008, 0.009, 0.01, s * 0.025, 0.036, 0.01, { segs: 10 });
        for (let i = 0; i < 4; i++) k.sphere('buttons', 'plastic-abs-gloss-grey', 0.004, 0.032 + Math.cos(i * PI / 2) * 0.008, 0.038, -0.008 + Math.sin(i * PI / 2) * 0.008, { segs: 6, rings: 4 });
      }, x, 0, z, ry);
    }
    return finish(k);
  },
});

const vr = acc({
  id: 'acc-vr-headset', ko: 'VR 헤드셋', en: 'VR headset',
  params: [P.color('colour', '색', 'Colour', '#f4f4f4')],
  tags: ['vr headset', 'virtual reality', 'gaming', 'headset', 'VR', '가상현실', '헤드셋', '게임'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('visor', 'plastic-abs-gloss-white', 0.19, 0.1, 0.09, 0.03, 0, 0.05, 0.03, C(p.colour));
    k.box('front', 'plastic-abs-gloss-black', 0.17, 0.08, 0.004, 0, 0.05, 0.077, { r: 0.002 });
    k.rbox('foam', 'foam-memory', 0.17, 0.08, 0.02, 0.02, 0, 0.05, -0.02);
    const strap = new THREE.TorusGeometry(0.09, 0.012, 4, k.seg(24, 10), PI);
    strap.rotateX(PI / 2); strap.rotateY(PI); strap.scale(1.05, 1, 1.3);
    k.add('strap', 'plastic-abs-matte-grey', T(strap, 0, 0.05, -0.03));
    return finish(k);
  },
});

const baduk = acc({
  id: 'acc-baduk-board', placement: 'floor', ko: '바둑판과 바둑알', en: 'Baduk (Go) board with stones',
  params: [P.mat('wood', '목재', 'Wood', 'wood-maple-honey', 'wood'), P.len('legs', '다리 높이', 'Leg height', 0.1, 0, 0.18)],
  tags: ['baduk', 'go board', 'weiqi', 'board game', '바둑', '바둑판', '바둑알', '전통 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.45, D = 0.48, T0 = 0.1, y = p.legs, r = rng(8);
    if (y > 0.005) for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', p.wood, 0.04, 0.03, y, sx * W * 0.32, 0, sz * D * 0.32, { segs: k.seg(12, 6) });
    k.box('board', p.wood, W, T0, D, 0, y + T0 / 2, 0, { r: 0.003 });
    for (let i = 0; i < 19; i++) {
      const t = -0.5 + i / 18;
      k.box('lines', 'paper-black', W * 0.9, 0.0005, 0.0012, 0, y + T0 + 0.0002, t * D * 0.9, { r: 0 });
      k.box('lines', 'paper-black', 0.0012, 0.0005, D * 0.9, t * W * 0.9, y + T0 + 0.0002, 0, { r: 0 });
    }
    for (let i = 0; i < 18; i++) {
      const gx = Math.floor(r() * 19), gz = Math.floor(r() * 19);
      k.sphere(i % 2 ? 'white' : 'black', i % 2 ? 'ceramic-gloss-white' : 'ceramic-gloss-black', 0.011, (-0.5 + gx / 18) * W * 0.9, y + T0, (-0.5 + gz / 18) * D * 0.9, { segs: 10, rings: 4, scale: [1, 0.45, 1], thetaLength: PI / 2 });
    }
    for (const s of [-1, 1]) k.lathe('bowls', 'wood-am-walnut-satin', [[0, 0], [0.05, 0], [0.065, 0.04], [0.04, 0.07], [0, 0.072]], s * (W / 2 + 0.1), 0, D * 0.25, { segs: k.seg(20, 8), smooth: 8 });
    return finish(k);
  },
});

const puzzleCubes = acc({
  id: 'acc-puzzle-cubes', ko: '큐브 퍼즐', en: 'Puzzle cubes',
  params: [P.int('count', '개수', 'Count', 2, 1, 3), P.len('size', '크기', 'Size', 0.057, 0.04, 0.09)],
  tags: ['puzzle cube', 'magic cube', 'toy', 'brain teaser', '큐브', '큐브 퍼즐', '장난감', '퍼즐'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size, cols = ['#ffffff', '#c0392b', '#2980b9', '#f39c12', '#27ae60', '#f1c40f'];
    for (let c = 0; c < p.count; c++) {
      transformAdded(k, () => {
        k.box('core', 'plastic-abs-gloss-black', s, s, s, 0, s / 2, 0, { r: 0.002 });
        const t = s / 3;
        const faces = [[0, 1, 0], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 0, -1]];
        faces.forEach((n, fi) => {
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
            const off = [n[0] ? n[0] * (s / 2 + 0.0005) : a * t, n[1] ? s / 2 + 0.0005 + s / 2 : (n[0] ? a : b) * t + s / 2, n[2] ? n[2] * (s / 2 + 0.0005) : (n[0] ? b : b) * t];
            if (n[1]) { off[0] = a * t; off[2] = b * t; }
            if (n[0]) { off[1] = s / 2 + a * t; off[2] = b * t; }
            if (n[2]) { off[0] = a * t; off[1] = s / 2 + b * t; }
            k.box('stickers', 'plastic-abs-gloss-white', n[0] ? 0.001 : t * 0.85, n[1] ? 0.001 : t * 0.85, n[2] ? 0.001 : t * 0.85, ...off, { r: 0, ...C(cols[(fi + c + (a + b + 2) % 2) % 6]) });
          }
        });
      }, (c - (p.count - 1) / 2) * s * 1.6, 0, (c % 2) * s * 0.4, c * 0.5);
    }
    return finish(k);
  },
});

/* ============================================================= seasonal */

const xmasTree = acc({
  id: 'acc-tabletop-christmas-tree', ko: '탁상 크리스마스트리', en: 'Tabletop Christmas tree',
  params: [P.len('height', '높이', 'Height', 0.45, 0.3, 0.8), P.bool('lights', '전구', 'Lights', true)],
  tags: ['christmas tree', 'xmas', 'holiday', 'festive', '크리스마스트리', '트리', '크리스마스', '연말'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, r = H * 0.32, pot = H * 0.14, cols = ['#c0392b', '#d4ac0d', '#e8e4da'];
    k.cyl('pot', 'fabric-burlap-natural', r * 0.4, r * 0.32, pot, 0, 0, 0, { segs: k.seg(16, 8) });
    for (let i = 0; i < 3; i++) k.cyl('tree', 'plant-pine', r * (0.35 - i * 0.1), r * (1 - i * 0.25), H * 0.35, 0, pot + i * H * 0.22, 0, { segs: k.seg(14, 7) });
    k.sphere('star', 'metal-gold-polished', H * 0.035, 0, pot + H * 0.86, 0, { segs: 8, rings: 6, scale: [1, 1.3, 0.4] });
    const rr = rng(12);
    for (let i = 0; i < 14; i++) {
      const t = i / 14, y = pot + H * (0.05 + t * 0.72), rad = r * (1 - t * 0.85) * 0.92, a = i * 2.4;
      k.sphere(`baubles${i % 3}`, 'glass-color-red', H * 0.018, Math.cos(a) * rad, y, Math.sin(a) * rad, { segs: 8, rings: 6, ...C(cols[i % 3]) });
      if (p.lights && i % 2 === 0) k.sphere('bulbs', 'light-warm', H * 0.008, Math.cos(a + 1) * rad * 1.02, y + rr() * 0.01, Math.sin(a + 1) * rad * 1.02, { segs: 6, rings: 4 });
    }
    if (p.lights) k.light(0, pot + H * 0.4, 0, { intensity: 0.15, distance: 1.5, color: '#ffd9a0' });
    return finish(k);
  },
});

const gifts = acc({
  id: 'acc-gift-box-stack', ko: '선물 상자 더미', en: 'Stack of gift boxes',
  params: [P.int('count', '상자 수', 'Boxes', 4, 1, 6)],
  tags: ['gift boxes', 'presents', 'holiday', 'birthday', '선물 상자', '선물', '리본', '크리스마스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = ['#b0302a', '#2f6b4a', '#e8e0cf', '#2f4f7a', '#d4ac0d', '#7a3e8f'], rib = ['#d4ac0d', '#e8e0cf', '#b0302a'];
    const spots = [[-0.11, 0, 0.3, 0.2, 0.26], [0.13, 0, 0.22, 0.16, 0.2], [0.02, 0.2, 0.18, 0.14, 0.16], [-0.12, 0, 0.14, 0.11, 0.12], [0.2, 0, 0.12, 0.1, 0.1], [0.05, 0.34, 0.1, 0.08, 0.1]];
    for (let i = 0; i < p.count; i++) {
      const [x, y, w, h, d] = spots[i], z = i === 3 ? 0.2 : i === 4 ? 0.17 : 0;
      k.box(`box${i}`, 'paper-glossy', w, h, d, x, y + h / 2, z, { r: 0.002, ...C(cols[i]) });
      k.box(`ribbon${i % 3}`, 'fabric-satin-gold', 0.02, h + 0.002, d + 0.002, x, y + h / 2, z, { r: 0, ...C(rib[i % 3]) });
      k.box(`ribbon${i % 3}`, 'fabric-satin-gold', w + 0.002, h + 0.002, 0.02, x, y + h / 2, z, { r: 0, ...C(rib[i % 3]) });
      for (const s of [-1, 1]) k.sphere(`ribbon${i % 3}`, 'fabric-satin-gold', 0.022, x + s * 0.018, y + h + 0.01, z, { segs: 8, rings: 6, scale: [1.2, 0.6, 0.6], ...C(rib[i % 3]) });
    }
    return finish(k);
  },
});

const pumpkins = acc({
  id: 'acc-pumpkin-trio', ko: '호박 장식 세트', en: 'Decorative pumpkins',
  params: [P.int('count', '개수', 'Count', 3, 1, 3), P.len('size', '큰 호박 지름', 'Largest diameter', 0.26, 0.16, 0.4)],
  tags: ['pumpkins', 'autumn', 'harvest', 'halloween', '호박', '가을 장식', '할로윈', '추수'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = ['#e07b2a', '#e9dfc8', '#7a8b5a'];
    for (let i = 0; i < p.count; i++) {
      const R = (p.size / 2) * (1 - i * 0.22), x = [0, R * 2.2, -R * 2.0][i] + (i ? 0 : 0), z = [0, R * 0.5, R * 0.8][i];
      const g = new THREE.SphereGeometry(R, k.seg(32, 12), k.seg(16, 8));
      const pos = g.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const vx = pos.getX(j), vz = pos.getZ(j), a = Math.atan2(vz, vx), f = 1 - 0.08 * (1 - Math.abs(Math.cos(a * 4)));
        pos.setXYZ(j, vx * f, pos.getY(j) * 0.7, vz * f);
      }
      g.computeVertexNormals();
      k.add(`pumpkins${i}`, 'paint-white-matte', T(g, x, R * 0.7, z), C(cols[i]));
      k.cyl('stems', 'wood-dark', R * 0.07, R * 0.1, R * 0.35, x, R * 1.32, z, { segs: 6, rz: 0.2 });
    }
    return finish(k);
  },
});

const easter = acc({
  id: 'acc-easter-egg-basket', ko: '부활절 달걀 바구니', en: 'Easter egg basket',
  params: [P.mat('basket', '바구니', 'Basket', 'rattan', 'wood'), P.int('eggs', '달걀 수', 'Eggs', 7, 3, 10)],
  tags: ['easter eggs', 'easter basket', 'spring', 'holiday', '부활절', '부활절 달걀', '봄 장식', '바구니'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.12, h = 0.08, cols = ['#f4b6c2', '#b8d8e8', '#f7e3a1', '#c9b3e6', '#bfe3c0'];
    k.lathe('basket', p.basket, [[0, 0], [r * 0.8, 0], [r, h], [r - 0.01, h], [r * 0.8 - 0.01, 0.01], [0, 0.01]], 0, 0, 0, { segs: k.seg(28, 10) });
    k.tube('basket', p.basket, [[-r, h, 0], [-r * 0.7, h + 0.13, 0], [r * 0.7, h + 0.13, 0], [r, h, 0]], 0.008);
    k.cyl('grass', 'plant-grass-blade', r - 0.01, r * 0.8, h * 0.8, 0, 0.01, 0, { segs: k.seg(20, 8) });
    for (let i = 0; i < p.eggs; i++) {
      const a = i * 2.4, d = i === 0 ? 0 : r * 0.55;
      k.sphere('eggs', 'paint-white-matte', 0.022, Math.cos(a) * d, h * 0.9 + 0.01, Math.sin(a) * d, { segs: 10, rings: 8, scale: [1, 1.3, 1], rz: 0.4, ...C(cols[i % cols.length]) });
    }
    return finish(k);
  },
});

const fairyJar = acc({
  id: 'acc-fairy-light-jar', ko: '전구 유리병 무드등', en: 'Fairy-light jar',
  params: [P.len('height', '높이', 'Height', 0.22, 0.14, 0.35), P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass')],
  tags: ['fairy lights', 'jar light', 'mood light', 'string lights', '전구 병', '무드등', '앵두 전구', '감성 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, r = H * 0.3;
    vessel(k, 'jar', p.glass, r, H, 0, 0, 0, { wall: 0.003 });
    k.cyl('lid', 'cork-natural', r - 0.002, r - 0.005, 0.03, 0, H - 0.01, 0, { segs: k.seg(18, 8) });
    const pts = [];
    for (let i = 0; i <= 30; i++) { const a = i * 0.9, t = i / 30; pts.push([Math.cos(a) * r * 0.65, 0.01 + t * H * 0.8, Math.sin(a) * r * 0.65]); }
    k.tube('wire', 'metal-copper', pts, 0.0008, { segs: k.seg(90, 40), radial: 3 });
    for (let i = 0; i <= 30; i += 3) k.sphere('bulbs', 'light-warm', 0.004, pts[i][0], pts[i][1], pts[i][2], { segs: 6, rings: 4 });
    k.light(0, H * 0.45, 0, { intensity: 0.12, distance: 1.2, color: '#ffcf87' });
    return finish(k);
  },
});

const baubleBowl = acc({
  id: 'acc-ornament-bowl', ko: '오너먼트 유리 볼', en: 'Glass bowl of ornaments',
  params: [P.int('count', '오너먼트 수', 'Ornaments', 7, 3, 10), P.len('diameter', '지름', 'Diameter', 0.26, 0.18, 0.36)],
  tags: ['ornaments', 'baubles', 'christmas', 'centrepiece', '오너먼트', '크리스마스 볼', '센터피스', '연말'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2, h = r * 0.6, cols = ['#b0302a', '#d4ac0d', '#2f6b4a', '#e8e4da'];
    k.lathe('bowl', 'glass-clear', [[0, 0], [r * 0.4, 0], [r * 0.45, 0.01], [r, h], [r - 0.004, h], [r * 0.45 - 0.004, 0.014], [0, 0.014]], 0, 0, 0, { segs: k.seg(32, 10) });
    for (let i = 0; i < p.count; i++) {
      const a = i * 2.4, d = i === 0 ? 0 : r * 0.42, br = r * 0.24;
      k.sphere(`b${i % 4}`, 'glass-color-red', br, Math.cos(a) * d, 0.014 + br + (i > 5 ? br : 0), Math.sin(a) * d, { segs: 12, rings: 8, ...C(cols[i % 4]) });
    }
    return finish(k);
  },
});

const advent = acc({
  id: 'acc-advent-wreath', ko: '대림절 초 리스', en: 'Advent candle wreath',
  params: [P.int('lit', '켠 초 수', 'Candles lit', 2, 0, 4), P.color('candles', '초 색', 'Candle colour', '#f1ece0')],
  tags: ['advent wreath', 'candles', 'christmas', 'centrepiece', '대림절', '초 리스', '크리스마스', '캔들'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = 0.16;
    k.add('wreath', 'plant-pine', T(new THREE.TorusGeometry(R, 0.045, k.seg(10, 5), k.seg(32, 12)), 0, 0.03, 0, PI / 2, 0, 0, [1, 1, 0.65]));
    for (let i = 0; i < 10; i++) { const a = i * 0.63; k.sphere('berries', 'glass-color-red', 0.01, Math.cos(a) * (R + 0.03), 0.045, Math.sin(a) * (R + 0.03), { segs: 6, rings: 4 }); }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + PI / 4, x = Math.cos(a) * R, z = Math.sin(a) * R;
      k.cyl('candles', 'wax-candle-white', 0.022, 0.022, 0.13, x, 0.04, z, { segs: k.seg(16, 8), ...C(p.candles) });
      if (i < p.lit) { k.sphere('flames', 'light-candle', 0.006, x, 0.18, z, { segs: 6, rings: 4, scale: [1, 2, 1] }); k.light(x, 0.19, z, { color: '#ffb35a', intensity: 0.08, distance: 1 }); }
    }
    return finish(k);
  },
});

const nutcracker = acc({
  id: 'acc-nutcracker', ko: '호두까기 인형', en: 'Nutcracker figure',
  params: [P.len('height', '높이', 'Height', 0.3, 0.2, 0.5), P.color('coat', '제복 색', 'Coat colour', '#b0302a')],
  tags: ['nutcracker', 'christmas', 'figurine', 'soldier', '호두까기 인형', '크리스마스', '인형', '장식 인형'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, u = H / 30;
    k.cyl('base', 'wood-dark', 4 * u, 4.5 * u, 1.5 * u, 0, 0, 0, { segs: k.seg(16, 8) });
    for (const s of [-1, 1]) k.cyl('legs', 'paint-black-matte', 1.1 * u, 1.1 * u, 8 * u, s * 1.4 * u, 1.5 * u, 0, { segs: 10 });
    k.cyl('coat', 'paint-white-matte', 3 * u, 3.2 * u, 9 * u, 0, 9.5 * u, 0, { segs: k.seg(16, 8), ...C(p.coat) });
    for (const s of [-1, 1]) k.cyl('coat', 'paint-white-matte', 1 * u, 1 * u, 7 * u, s * 4 * u, 11 * u, 0, { segs: 10, ...C(p.coat) });
    k.cyl('belt', 'paint-black-matte', 3.25 * u, 3.25 * u, 1 * u, 0, 10 * u, 0, { segs: k.seg(16, 8) });
    k.cyl('face', 'paint-peach-matte', 2.4 * u, 2.4 * u, 4 * u, 0, 18.5 * u, 0, { segs: k.seg(16, 8) });
    k.box('beard', 'paint-white-matte', 3.6 * u, 2 * u, 1.5 * u, 0, 19 * u, 1.9 * u, { r: 0.004 });
    k.cyl('hat', 'paint-black-matte', 2.6 * u, 2.6 * u, 7 * u, 0, 22.5 * u, 0, { segs: k.seg(16, 8) });
    k.cyl('trim', 'metal-gold-polished', 2.65 * u, 2.65 * u, 0.6 * u, 0, 23 * u, 0, { segs: k.seg(16, 8) });
    return finish(k);
  },
});

const snowman = acc({
  id: 'acc-snowman-figure', ko: '눈사람 인형', en: 'Snowman figure',
  params: [P.len('height', '높이', 'Height', 0.25, 0.15, 0.45), P.color('scarf', '목도리 색', 'Scarf colour', '#2f6b4a')],
  tags: ['snowman', 'winter', 'christmas', 'figurine', '눈사람', '겨울 장식', '크리스마스', '인형'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, r1 = H * 0.24, r2 = H * 0.17, r3 = H * 0.12;
    k.sphere('snow', 'fabric-faux-fur-white', r1, 0, r1 * 0.9, 0);
    k.sphere('snow', 'fabric-faux-fur-white', r2, 0, r1 * 1.7 + r2 * 0.7, 0);
    k.sphere('snow', 'fabric-faux-fur-white', r3, 0, r1 * 1.7 + r2 * 1.6 + r3 * 0.7, 0);
    const hy = r1 * 1.7 + r2 * 1.6 + r3 * 0.7;
    k.cyl('nose', 'plastic-abs-gloss-orange', 0.0005, r3 * 0.18, r3 * 0.7, 0, hy, r3 * 0.9, { rx: PI / 2, segs: 8 });
    k.add('scarf', 'fabric-knit-cream', T(new THREE.TorusGeometry(r3 * 0.95, r3 * 0.22, 6, k.seg(18, 8)), 0, hy - r3 * 0.85, 0, PI / 2, 0, 0), C(p.scarf));
    k.cyl('hat', 'paint-black-matte', r3 * 1.1, r3 * 1.1, r3 * 0.1, 0, hy + r3 * 0.8, 0, { segs: 14 });
    k.cyl('hat', 'paint-black-matte', r3 * 0.7, r3 * 0.7, r3 * 0.8, 0, hy + r3 * 0.85, 0, { segs: 14 });
    for (const s of [-1, 1]) k.sphere('eyes', 'paint-black-matte', r3 * 0.08, s * r3 * 0.35, hy + r3 * 0.3, r3 * 0.88, { segs: 6, rings: 4 });
    return finish(k);
  },
});

const cake = acc({
  id: 'acc-birthday-cake', ko: '생일 케이크', en: 'Birthday cake',
  params: [P.int('candles', '초 수', 'Candles', 5, 1, 9), P.color('icing', '크림 색', 'Icing colour', '#f6d6de'), P.bool('lit', '불 켜기', 'Lit', true)],
  tags: ['birthday cake', 'cake', 'party', 'celebration', '생일 케이크', '케이크', '파티', '축하'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.11, h = 0.1;
    k.cyl('plate', 'ceramic-gloss-white', r + 0.04, r + 0.03, 0.01, 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('cake', 'wax-candle-ivory', r, r, h, 0, 0.01, 0, { segs: k.seg(32, 10), ...C(p.icing) });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; k.sphere('cream', 'wax-candle-white', 0.012, Math.cos(a) * (r - 0.012), 0.01 + h, Math.sin(a) * (r - 0.012), { segs: 8, rings: 5 }); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; k.sphere('berries', 'glass-color-red', 0.012, Math.cos(a) * r * 0.45, 0.012 + h, Math.sin(a) * r * 0.45, { segs: 8, rings: 6 }); }
    for (let i = 0; i < p.candles; i++) {
      const a = (i / p.candles) * TAU, d = p.candles === 1 ? 0 : r * 0.7;
      k.cyl('candles', 'wax-candle-white', 0.0035, 0.0035, 0.06, Math.cos(a) * d, 0.01 + h, Math.sin(a) * d, { segs: 6, ...C(['#5fa8d3', '#f2c14e', '#e86b5f'][i % 3]) });
      if (p.lit) k.sphere('flames', 'light-candle', 0.004, Math.cos(a) * d, 0.08 + h, Math.sin(a) * d, { segs: 6, rings: 4, scale: [1, 2, 1] });
    }
    if (p.lit) k.light(0, h + 0.1, 0, { color: '#ffb35a', intensity: 0.1, distance: 1 });
    return finish(k);
  },
});

/* ==================================================== pets and home care */

const petBowls = acc({
  id: 'acc-pet-bowls-stand', placement: 'floor', ko: '반려동물 밥그릇 받침', en: 'Raised pet bowls',
  params: [P.mat('wood', '받침 목재', 'Stand wood', 'wood-white-oak-oil', 'wood'), P.len('height', '높이', 'Height', 0.12, 0.05, 0.25)],
  tags: ['pet bowls', 'dog bowl', 'cat bowl', 'feeder', '밥그릇', '반려동물', '강아지', '고양이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, W = 0.4, D = 0.2;
    k.box('stand', p.wood, W, 0.02, D, 0, H - 0.01, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('stand', p.wood, 0.025, H - 0.02, 0.025, sx * (W / 2 - 0.03), (H - 0.02) / 2, sz * (D / 2 - 0.03), { r: 0.003 });
    for (const s of [-1, 1]) {
      k.lathe('bowls', 'metal-ss-polished', [[0, 0], [0.05, 0], [0.075, 0.05], [0.08, 0.055], [0.072, 0.055], [0.045, 0.005], [0, 0.005]], s * W * 0.24, H - 0.02, 0, { segs: k.seg(24, 10) });
      k.cyl(s < 0 ? 'water' : 'kibble', s < 0 ? 'water' : 'wood-dark', 0.06, 0.05, 0.03, s * W * 0.24, H - 0.015, 0, { segs: k.seg(20, 8) });
    }
    return finish(k);
  },
});

const petBed = acc({
  id: 'acc-pet-bed-round', placement: 'floor', ko: '도넛 반려동물 방석', en: 'Round donut pet bed',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-faux-fur-mink', 'fabric'), P.len('diameter', '지름', 'Diameter', 0.6, 0.4, 0.9)],
  tags: ['pet bed', 'dog bed', 'cat bed', 'donut bed', '반려동물 방석', '강아지 침대', '고양이 방석', '펫 베드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.diameter / 2, rr = R * 0.22;
    k.add('rim', p.fabric, T(new THREE.TorusGeometry(R - rr, rr, k.seg(14, 6), k.seg(36, 14)), 0, rr * 0.9, 0, PI / 2, 0, 0, [1, 1, 0.9]));
    k.cyl('cushion', p.fabric, R - rr * 1.2, R - rr * 1.1, rr * 0.7, 0, 0, 0, { segs: k.seg(32, 12) });
    return finish(k);
  },
});

const scratchPost = acc({
  id: 'acc-cat-scratching-post', placement: 'floor', ko: '고양이 스크래쳐 기둥', en: 'Cat scratching post',
  params: [P.len('height', '높이', 'Height', 0.6, 0.4, 0.9), P.mat('base', '바닥판', 'Base', 'fabric-felt-grey', 'fabric')],
  tags: ['scratching post', 'cat tree', 'cat toy', 'sisal', '스크래쳐', '캣타워', '고양이', '반려동물'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.box('base', p.base, 0.4, 0.04, 0.4, 0, 0.02, 0, { r: 0.008 });
    k.cyl('post', 'rope-sisal', 0.045, 0.045, H - 0.07, 0, 0.04, 0, { segs: k.seg(20, 8) });
    k.box('base', p.base, 0.3, 0.03, 0.3, 0, H - 0.015, 0, { r: 0.008 });
    k.rod('toy', 'rope-cotton', [0.15, H - 0.03, 0.1], [0.15, H - 0.25, 0.1], 0.002, { segs: 4 });
    k.sphere('toy', 'fabric-felt-red', 0.022, 0.15, H - 0.27, 0.1, { segs: 10, rings: 8 });
    return finish(k);
  },
});

const birdCage = acc({
  id: 'acc-bird-cage', ko: '새장', en: 'Bird cage',
  params: [P.mat('wire', '철사', 'Wire', 'metal-brass-antique', 'metal'), P.len('height', '높이', 'Height', 0.45, 0.3, 0.7)],
  tags: ['bird cage', 'birdcage', 'canary', 'pet', '새장', '새', '반려조', '빈티지 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, r = H * 0.33, n = k.seg(16, 8), body = H * 0.62;
    k.cyl('base', p.wire, r + 0.01, r + 0.015, 0.03, 0, 0, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
      k.tube('bars', p.wire, [[x, 0.03, z], [x, body, z], [x * 0.7, body + H * 0.2, z * 0.7], [0, H * 0.93, 0]], 0.0028, { segs: k.seg(16, 6), radial: 4 });
    }
    for (const y of [0.03, body * 0.5, body]) k.add('rings', p.wire, T(new THREE.TorusGeometry(r, 0.003, 4, k.seg(32, 12)), 0, y, 0, PI / 2, 0, 0));
    k.add('rings', p.wire, T(new THREE.TorusGeometry(0.025, 0.003, 4, 12), 0, H - 0.02, 0));
    k.rod('perch', 'wood-pine', [-r * 0.8, body * 0.4, 0], [r * 0.8, body * 0.4, 0], 0.004, { segs: 6 });
    k.sphere('bird', 'plastic-abs-gloss-yellow', 0.025, 0, body * 0.4 + 0.03, 0, { segs: 10, rings: 8, scale: [0.8, 1, 1.3] });
    return finish(k);
  },
});

const fishBowl = acc({
  id: 'acc-fish-bowl', ko: '어항', en: 'Goldfish bowl',
  params: [P.len('diameter', '지름', 'Diameter', 0.25, 0.16, 0.36), P.int('fish', '금붕어 수', 'Goldfish', 2, 1, 4)],
  tags: ['fish bowl', 'goldfish', 'aquarium', 'pet', '어항', '금붕어', '물고기', '반려동물'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.diameter / 2;
    k.lathe('glass', 'glass-clear', [[0, 0], [R * 0.55, 0], [R * 0.9, R * 0.4], [R, R * 0.9], [R * 0.85, R * 1.5], [R * 0.65, R * 1.7], [R * 0.68, R * 1.72]], 0, 0, 0, { segs: k.seg(32, 12), smooth: 12 });
    k.lathe('water', 'water', [[0, 0.005], [R * 0.55, 0.005], [R * 0.88, R * 0.4], [R * 0.97, R * 0.9], [R * 0.9, R * 1.3], [0, R * 1.3]], 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('gravel', 'stone-travertine-classic', R * 0.6, R * 0.55, R * 0.12, 0, 0.005, 0, { segs: k.seg(20, 8) });
    for (let i = 0; i < p.fish; i++) {
      const a = i * 2.1, x = Math.cos(a) * R * 0.4, z = Math.sin(a) * R * 0.4, y = R * (0.6 + i * 0.15);
      k.sphere('fish', 'plastic-abs-gloss-orange', R * 0.1, x, y, z, { segs: 10, rings: 6, scale: [1.6, 1, 0.6], ry: a });
      k.cyl('fish', 'plastic-abs-gloss-orange', R * 0.07, 0.001, R * 0.1, x - Math.cos(a) * R * 0.15, y, z + Math.sin(a) * R * 0.15, { rz: PI / 2, ry: a, segs: 6 });
    }
    return finish(k);
  },
});

const litterBox = acc({
  id: 'acc-litter-box', placement: 'floor', ko: '고양이 화장실', en: 'Hooded litter box',
  params: [P.color('colour', '색', 'Colour', '#dfe3e6'), P.bool('hood', '덮개', 'Hood', true)],
  tags: ['litter box', 'cat toilet', 'litter tray', 'cat', '고양이 화장실', '모래 화장실', '고양이', '반려동물'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.5, D = 0.4;
    k.rbox('tray', 'plastic-pp-light-grey', W, 0.12, D, 0.03, 0, 0.06, 0, C(p.colour));
    k.box('litter', 'stone-travertine-classic', W - 0.03, 0.005, D - 0.03, 0, 0.11, 0, { r: 0 });
    if (p.hood) {
      const g = new THREE.SphereGeometry(0.5, k.seg(28, 12), k.seg(12, 6), 0, TAU, 0, PI / 2);
      g.scale(W, 0.6, D);
      k.add('hood', 'plastic-pp-white', T(g, 0, 0.11, 0));
      k.cyl('door', 'plastic-acrylic-smoke', 0.09, 0.09, 0.004, 0, 0.2, D / 2 - 0.03, { rx: PI / 2 - 0.4, segs: k.seg(20, 8) });
    }
    k.box('scoop', 'plastic-pp-white', 0.06, 0.006, 0.18, W / 2 + 0.05, 0.003, 0.05, { r: 0.002 });
    return finish(k);
  },
});

const broom = acc({
  id: 'acc-broom-dustpan', placement: 'floor', ko: '빗자루와 쓰레받기', en: 'Broom and dustpan',
  params: [P.mat('bristles', '솔', 'Bristles', 'rope-sisal', 'other'), P.len('height', '높이', 'Height', 0.95, 0.7, 1.3)],
  tags: ['broom', 'dustpan', 'cleaning', 'sweeping', '빗자루', '쓰레받기', '청소 도구', '청소'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.box('pan', 'plastic-pp-sage', 0.3, 0.004, 0.25, 0, 0.002, 0.08, { r: 0.001 });
    for (const s of [-1, 1]) k.box('pan', 'plastic-pp-sage', 0.004, 0.08, 0.25, s * 0.148, 0.04, 0.08, { r: 0.001 });
    k.box('pan', 'plastic-pp-sage', 0.3, 0.08, 0.012, 0, 0.04, -0.045, { r: 0.004 });
    k.cyl('pan', 'plastic-pp-sage', 0.011, 0.011, H * 0.8, 0, 0.06, -0.05, { segs: 10 });
    k.box('broom', p.bristles, 0.26, 0.2, 0.05, 0, 0.1, -0.11, { r: 0.01 });
    k.box('broom', 'wood-pine', 0.24, 0.035, 0.045, 0, 0.215, -0.11, { r: 0.004 });
    k.cyl('handle', 'wood-pine', 0.012, 0.012, H - 0.23, 0, 0.23, -0.11, { segs: 10 });
    return finish(k);
  },
});

const caddy = acc({
  id: 'acc-cleaning-caddy', ko: '청소 도구 캐디', en: 'Cleaning caddy',
  params: [P.color('colour', '색', 'Colour', '#5f8b9b'), P.int('bottles', '스프레이 수', 'Spray bottles', 2, 1, 3)],
  tags: ['cleaning caddy', 'spray bottle', 'sponge', 'cleaning', '청소 캐디', '분무기', '세제', '청소'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.34, D = 0.2, H = 0.1;
    k.box('caddy', 'plastic-pp-dusty-blue', W, 0.008, D, 0, 0.004, 0, { r: 0.002, ...C(p.colour) });
    for (const s of [-1, 1]) { k.box('caddy', 'plastic-pp-dusty-blue', W, H, 0.006, 0, H / 2, s * (D / 2 - 0.003), { r: 0.002, ...C(p.colour) }); k.box('caddy', 'plastic-pp-dusty-blue', 0.006, H, D, s * (W / 2 - 0.003), H / 2, 0, { r: 0.002, ...C(p.colour) }); }
    k.box('caddy', 'plastic-pp-dusty-blue', 0.008, H + 0.12, D, 0, (H + 0.12) / 2, 0, { r: 0.002, ...C(p.colour) });
    k.box('caddy', 'plastic-pp-dusty-blue', 0.02, 0.02, D * 0.5, 0, H + 0.11, 0, { r: 0.006, ...C(p.colour) });
    for (let i = 0; i < p.bottles; i++) {
      const x = -W * 0.25 + (i % 2) * 0.0, z = (i - (p.bottles - 1) / 2) * 0.06;
      bottle(k, 'bottles', 'plastic-pe-white', 0.03, 0.18, x, 0.008, z, { neck: 0.5, cap: null });
      k.box('trigger', 'plastic-abs-gloss-blue', 0.025, 0.05, 0.06, x, 0.2, z + 0.015, { r: 0.006 });
    }
    k.box('sponge', 'foam-eva-color', 0.1, 0.03, 0.065, W * 0.25, 0.023, -0.03, { r: 0.006, ...C('#f2c14e') });
    k.box('sponge', 'foam-eva-color', 0.1, 0.01, 0.065, W * 0.25, 0.043, -0.03, { r: 0.003, ...C('#3b8c5a') });
    k.box('cloth', 'fabric-cotton-sky', 0.12, 0.04, 0.07, W * 0.25, 0.03, 0.05, { r: 0.012 });
    return finish(k);
  },
});

const dryingRack = acc({
  id: 'acc-clothes-drying-rack', placement: 'floor', ko: '빨래 건조대', en: 'Clothes drying rack',
  params: [P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'), P.len('width', '폭', 'Width', 1.1, 0.8, 1.6), P.bool('laundry', '빨래', 'Laundry', true)],
  tags: ['drying rack', 'clothes airer', 'laundry', 'clothes horse', '빨래 건조대', '건조대', '빨래', '세탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = 0.95, D = 0.55;
    for (const s of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', p.frame, [s * (W / 2 - 0.02), 0, sz * D / 2], [s * (W / 2 - 0.02), H, sz * 0.05], 0.008, { segs: 6 });
    for (let i = 0; i < 6; i++) k.rod('frame', p.frame, [-W / 2 + 0.02, H, -0.18 + i * 0.072], [W / 2 - 0.02, H, -0.18 + i * 0.072], 0.004, { segs: 5 });
    for (const sz of [-1, 1]) k.rod('frame', p.frame, [-W / 2 + 0.02, H * 0.45, sz * D * 0.28], [W / 2 - 0.02, H * 0.45, sz * D * 0.28], 0.004, { segs: 5 });
    if (p.laundry) {
      const cols = ['#f2f0ea', '#8fb3d9', '#d7c3a5'];
      for (let i = 0; i < 3; i++) k.box(`towels${i}`, 'fabric-cotton-white', W * 0.22, 0.4, 0.008, (i - 1) * W * 0.3, H - 0.2, -0.18 + i * 0.144, { r: 0.004, ...C(cols[i]) });
    }
    return finish(k);
  },
});

const leashHooks = acc({
  id: 'acc-leash-hooks', placement: 'wall', elevation: 1.2, ko: '산책줄 벽걸이', en: 'Wall hooks with dog leash',
  params: [P.mat('wood', '목재', 'Wood', 'wood-white-oak-oil', 'wood'), P.color('leash', '줄 색', 'Leash colour', '#c75b5b')],
  tags: ['leash hooks', 'dog leash', 'pet', 'entryway', '산책줄', '목줄 걸이', '강아지', '현관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = 0.36;
    k.box('board', p.wood, W, 0.08, 0.018, 0, 0.4, 0, { r: 0.004 });
    for (const x of [-0.1, 0, 0.1]) { k.rod('hooks', 'metal-brass', [x, 0.39, 0.009], [x, 0.39, 0.05], 0.004, { segs: 6 }); k.sphere('hooks', 'metal-brass', 0.007, x, 0.39, 0.052, { segs: 8, rings: 6 }); }
    k.tube('leash', 'fabric-canvas-ecru', [[-0.1, 0.39, 0.045], [-0.13, 0.25, 0.05], [-0.11, 0.05, 0.05], [-0.07, 0.0, 0.05], [-0.06, 0.12, 0.05], [-0.09, 0.3, 0.048], [-0.1, 0.39, 0.045]], 0.006, { ...C(p.leash) });
    k.tube('collar', 'leather-cognac', [[0.1, 0.39, 0.045], [0.06, 0.3, 0.05], [0.1, 0.22, 0.05], [0.14, 0.3, 0.05], [0.1, 0.39, 0.045]], 0.007);
    return finish(k);
  },
});

const carrier = acc({
  id: 'acc-pet-carrier', placement: 'floor', ko: '반려동물 이동장', en: 'Pet carrier',
  params: [P.color('colour', '색', 'Colour', '#e9e4dc'), P.len('length', '길이', 'Length', 0.5, 0.4, 0.7)],
  tags: ['pet carrier', 'cat carrier', 'dog crate', 'travel', '이동장', '켄넬', '반려동물', '이동 가방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, W = L * 0.66, H = L * 0.6;
    k.rbox('shell', 'plastic-pp-white', W, H * 0.45, L, 0.03, 0, H * 0.225, 0, C(p.colour));
    k.rbox('shell', 'plastic-pp-white', W, H * 0.5, L, 0.05, 0, H * 0.7, 0, C(p.colour));
    k.box('seam', 'plastic-pp-light-grey', W + 0.006, 0.015, L + 0.006, 0, H * 0.45, 0, { r: 0.003 });
    for (let i = 0; i < 7; i++) k.box('door', 'metal-chrome', 0.004, H * 0.6, 0.004, -W * 0.3 + i * W * 0.1, H * 0.48, L / 2 + 0.004, { r: 0 });
    k.box('handle', 'plastic-black', 0.15, 0.03, 0.03, 0, H + 0.02, 0, { r: 0.01 });
    return finish(k);
  },
});

/* ==================================================== Korean traditional */

const bokjumeoni = acc({
  id: 'acc-bokjumeoni', ko: '복주머니', en: 'Bokjumeoni (lucky pouches)',
  params: [P.int('count', '개수', 'Pouches', 3, 1, 4), P.mat('silk', '비단', 'Silk', 'fabric-satin-emerald', 'fabric')],
  tags: ['bokjumeoni', 'lucky pouch', 'korean', 'new year', '복주머니', '설날', '전통 소품', '한국 전통'],
  build: (p, ctx) => {
    const k = new Kit(ctx), mats = [p.silk, 'fabric-velvet-burgundy', 'fabric-velvet-mustard', 'fabric-velvet-blue'];
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * 0.1, s = 1 - (i % 2) * 0.15;
      k.lathe(`pouch${i}`, mats[i], [[0, 0], [0.03 * s, 0.003], [0.045 * s, 0.035 * s], [0.035 * s, 0.07 * s], [0.012 * s, 0.085 * s], [0.02 * s, 0.1 * s], [0, 0.1 * s]], x, 0, 0, { segs: k.seg(20, 8), smooth: 10 });
      k.add('cords', 'rope-cotton', T(new THREE.TorusGeometry(0.014 * s, 0.003, 5, 12), x, 0.084 * s, 0, PI / 2, 0, 0), C('#d4ac0d'));
      k.rod('cords', 'rope-cotton', [x, 0.084 * s, 0.014 * s], [x + 0.01, 0.03, 0.04 * s], 0.0025, { segs: 5, ...C('#d4ac0d') });
    }
    return finish(k);
  },
});

const yut = acc({
  id: 'acc-yut-set', ko: '윷놀이 세트', en: 'Yutnori game set',
  params: [P.mat('wood', '윷 목재', 'Stick wood', 'wood-birch-oil', 'wood'), P.mat('mat', '윷판', 'Board cloth', 'fabric-linen-flax', 'fabric')],
  tags: ['yutnori', 'yut', 'korean game', 'new year', '윷놀이', '윷', '윷판', '전통 놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), S = 0.4;
    k.box('board', p.mat, S, 0.004, S, 0, 0.002, 0, { r: 0 });
    const spots = [];
    for (let i = 0; i <= 5; i++) { const t = -0.5 + i / 5; spots.push([t, -0.5], [t, 0.5], [-0.5, t], [0.5, t]); }
    for (let i = 1; i < 6; i++) { const t = -0.5 + i / 6; spots.push([t, t], [t, -t]); }
    for (const [a, b] of spots) k.cyl('spots', 'paper-black', 0.009, 0.009, 0.001, a * S * 0.85, 0.004, b * S * 0.85, { segs: 10 });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.CylinderGeometry(0.012, 0.012, 0.16, k.seg(12, 6), 1, false, 0, PI);
      g.rotateZ(PI / 2);
      if (i % 2) g.rotateX(PI);
      k.add('sticks', p.wood, T(g, S / 2 + 0.06, i % 2 ? 0.012 : 0, -0.09 + i * 0.05, 0, 0.1 * (i - 1.5), 0));
    }
    for (let i = 0; i < 4; i++) k.cyl(i < 2 ? 'tokensA' : 'tokensB', i < 2 ? 'plastic-abs-gloss-red' : 'plastic-abs-gloss-blue', 0.012, 0.014, 0.02, -S * 0.425 + i * 0.03, 0.004, S * 0.425, { segs: 10 });
    return finish(k);
  },
});

const norigae = acc({
  id: 'acc-norigae-wall', placement: 'wall', elevation: 1.3, ko: '노리개 벽걸이', en: 'Norigae tassel wall hanging',
  params: [P.color('tassel', '술 색', 'Tassel colour', '#b0302a'), P.int('strands', '술 수', 'Tassels', 3, 1, 3)],
  tags: ['norigae', 'tassel', 'korean', 'wall hanging', '노리개', '매듭', '전통 소품', '한국 전통'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = [p.tassel, '#2f4f7a', '#d4ac0d'];
    k.rod('hanger', 'rope-cotton', [0, 0.6, 0], [0, 0.45, 0], 0.003, { segs: 5, ...C(p.tassel) });
    k.box('knot', 'rope-cotton', 0.06, 0.06, 0.012, 0, 0.42, 0, { r: 0.006, rz: PI / 4, ...C(p.tassel) });
    k.cyl('jade', 'stone-marble-verde-guatemala', 0.025, 0.025, 0.012, 0, 0.36, -0.006, { rx: PI / 2, segs: k.seg(16, 8) });
    for (let i = 0; i < p.strands; i++) {
      const x = (i - (p.strands - 1) / 2) * 0.04;
      k.rod('cords', 'rope-cotton', [0, 0.34, 0], [x, 0.26, 0], 0.002, { segs: 4, ...C(cols[i]) });
      k.sphere('beads', 'metal-gold-polished', 0.008, x, 0.255, 0, { segs: 8, rings: 6 });
      k.cyl(`tassel${i}`, 'rope-cotton', 0.008, 0.016, 0.24, x, 0.005, 0, { segs: 10, ...C(cols[i]) });
    }
    return finish(k);
  },
});

const hahoe = acc({
  id: 'acc-hahoe-mask', placement: 'wall', elevation: 1.5, ko: '하회탈 벽걸이', en: 'Hahoe mask wall hanging',
  params: [P.mat('wood', '목재', 'Wood', 'wood-pine-honey', 'wood'), P.len('height', '높이', 'Height', 0.22, 0.15, 0.32)],
  tags: ['hahoe mask', 'korean mask', 'talchum', 'wall decor', '하회탈', '탈', '전통 소품', '한국 전통'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height;
    k.sphere('face', p.wood, H / 2, 0, H / 2, 0, { thetaLength: PI, scale: [0.75, 1, 0.35], segs: k.seg(24, 10), rings: k.seg(16, 8) });
    const smile = new THREE.TorusGeometry(H * 0.16, H * 0.018, 6, k.seg(16, 8), PI);
    smile.rotateZ(PI);
    k.add('lines', 'wood-dark', T(smile, 0, H * 0.34, H * 0.16));
    for (const s of [-1, 1]) {
      const eye = new THREE.TorusGeometry(H * 0.06, H * 0.012, 4, k.seg(12, 6), PI);
      k.add('lines', 'wood-dark', T(eye, s * H * 0.15, H * 0.6, H * 0.16));
      k.sphere('cheeks', 'paint-terracotta-matte', H * 0.04, s * H * 0.2, H * 0.42, H * 0.14, { segs: 8, rings: 6, scale: [1, 0.8, 0.4] });
    }
    k.sphere('face', p.wood, H * 0.06, 0, H * 0.48, H * 0.17, { segs: 10, rings: 8, scale: [0.8, 1.2, 0.8] });
    k.rod('cord', 'rope-cotton', [-H * 0.3, H * 0.85, -0.01], [0, H * 1.05, -0.01], 0.002, { segs: 4 });
    k.rod('cord', 'rope-cotton', [H * 0.3, H * 0.85, -0.01], [0, H * 1.05, -0.01], 0.002, { segs: 4 });
    return finish(k);
  },
});

const incense = acc({
  id: 'acc-incense-burner', ko: '청자 향로', en: 'Celadon incense burner',
  params: [P.mat('glaze', '유약', 'Glaze', 'ceramic-celadon', 'ceramic'), P.bool('smoke', '향 피움', 'Incense lit', true)],
  tags: ['incense burner', 'censer', 'celadon', 'korean', '향로', '청자', '향', '전통 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; k.cyl('feet', p.glaze, 0.008, 0.012, 0.03, Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045, { segs: 8 }); }
    k.lathe('body', p.glaze, [[0, 0.025], [0.05, 0.025], [0.07, 0.06], [0.065, 0.085], [0.06, 0.09], [0, 0.09]], 0, 0, 0, { segs: k.seg(28, 10), smooth: 8 });
    k.lathe('lid', p.glaze, [[0.06, 0], [0.058, 0.02], [0.03, 0.05], [0.012, 0.06], [0.015, 0.075], [0, 0.08]], 0, 0.09, 0, { segs: k.seg(24, 8), smooth: 8 });
    if (p.smoke) {
      k.cyl('stick', 'wood-dark', 0.0015, 0.0015, 0.12, 0.025, 0.09, 0.02, { segs: 5, rz: -0.15 });
      k.tube('smoke', 'glass-frosted', [[0.04, 0.21, 0.02], [0.035, 0.25, 0.02], [0.05, 0.3, 0.025], [0.035, 0.36, 0.02]], 0.002, { radial: 4 });
    }
    return finish(k);
  },
});

const fan = acc({
  id: 'acc-buchae-fan-stand', ko: '합죽선 부채와 받침', en: 'Korean folding fan on a stand',
  params: [P.mat('paper', '부채 종이', 'Fan paper', 'hanji-ivory', 'other'), P.len('width', '부채 폭', 'Fan width', 0.5, 0.35, 0.7)],
  tags: ['folding fan', 'buchae', 'hapjukseon', 'korean', '부채', '합죽선', '전통 소품', '한국 전통'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.width / 2, n = k.seg(16, 8), r0 = R * 0.35, spread = PI * 0.85, y0 = 0.06;
    k.box('stand', 'wood-am-walnut-oil', 0.16, 0.02, 0.07, 0, 0.01, 0, { r: 0.004 });
    k.box('stand', 'wood-am-walnut-oil', 0.03, y0, 0.03, 0, y0 / 2 + 0.01, -0.01, { r: 0.003 });
    for (let i = 0; i < n; i++) {
      const a0 = -spread / 2 + (i / n) * spread, a1 = -spread / 2 + ((i + 1) / n) * spread, z = (i % 2) * 0.004;
      const pts = [[Math.sin(a0) * r0, Math.cos(a0) * r0], [Math.sin(a0) * R, Math.cos(a0) * R], [Math.sin(a1) * R, Math.cos(a1) * R], [Math.sin(a1) * r0, Math.cos(a1) * r0]];
      const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      k.panel('paper', p.paper, s, 0.002, 0, y0, z, { bevel: 0 });
    }
    for (let i = 0; i <= n; i++) { const a = -spread / 2 + (i / n) * spread; k.rod('ribs', 'wood-bamboo-natural', [0, y0, 0.003], [Math.sin(a) * R, y0 + Math.cos(a) * R, 0.003], 0.0015, { segs: 4 }); }
    k.sphere('pivot', 'metal-brass', 0.008, 0, y0, 0.004, { segs: 8, rings: 6 });
    return finish(k);
  },
});

export const ITEMS = [
  pencilCup, stapler, calendar, notebooks, fountainPen, magnifier, cubeClock, paperweights, calculator, docBox, waxSeal, postcards, chargingDock, cuttingMat, washi,
  yogaMat, dumbbells, kettlebell, jumpRope, racket, basketball, football, skateboard, ukulele, violinCase, knitting, watercolour, controllers, vr, baduk, puzzleCubes,
  xmasTree, gifts, pumpkins, easter, fairyJar, baubleBowl, advent, nutcracker, snowman, cake,
  petBowls, petBed, scratchPost, birdCage, fishBowl, litterBox, broom, caddy, dryingRack, leashHooks, carrier,
  bokjumeoni, yut, norigae, hahoe, incense, fan,
];
