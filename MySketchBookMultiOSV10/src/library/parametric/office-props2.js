// Office props (사무실) category, part 2: room-level things of an office — water cooler and bottle
// rack, coffee corner (capsule machine, kettle, mug tree, cup dispenser), boards (whiteboards, cork,
// glass, planner, notice cases), clocks, phones and meeting tools, safety (extinguishers, first aid,
// AED, exit sign, alarm, eye wash), storage helpers (safe, key cabinet, cash box, trolleys, step
// stool), coat stand, umbrella stand, reception extras, signs and desk comforts.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, roundRect, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { C, vessel, mugHandle } from './accessories-plus.js';
import { ofp, keys, sheets, binder, BINDER_COLS } from './office-props.js';

const PI = Math.PI;

/** Four castors under a w × d footprint (wheel radius r). */
function castors(k, w, d, r = 0.035) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl('casters', 'rubber-black', r, r, 0.025, sx * (w / 2 - 0.05) + 0.0125, r, sz * (d / 2 - 0.05), { rz: PI / 2, segs: k.seg(14, 6) });
    k.box('casters', 'metal-chrome', 0.03, 0.03, 0.03, sx * (w / 2 - 0.05), 2 * r + 0.012, sz * (d / 2 - 0.05), { r: 0.004 });
  }
  return 2 * r + 0.027;
}

/* ============================================================ water and coffee */

const waterCooler = ofp({
  id: 'ofp-water-cooler', placement: 'floor', ko: '생수 냉온수기', en: 'Bottled water cooler',
  params: [P.color('body', '몸체 색', 'Body colour', '#f0f0f0'), P.num('fill', '물 양', 'Water level', 0.7, 0, 1, 0.05)],
  tags: ['water cooler', 'water dispenser', 'bottle cooler', '정수기', '냉온수기', '생수기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.32, d = 0.33, h = 1.0;
    k.box('body', 'plastic-abs-gloss-white', w, h, d, 0, h / 2, 0, { r: 0.02, ...C(p.body) });
    k.box('recess', 'plastic-abs-matte-grey', w * 0.7, 0.2, 0.06, 0, h * 0.68, d / 2 - 0.02, { r: 0.01 });
    k.box('tray', 'plastic-abs-matte-black', w * 0.6, 0.015, 0.08, 0, h * 0.58, d / 2 - 0.01, { r: 0.004 });
    for (const [x, c] of [[-0.05, '#2a7de1'], [0.05, '#d9342b']]) k.box('taps', 'plastic-abs-gloss-blue', 0.03, 0.04, 0.03, x, h * 0.74, d / 2 - 0.03, { r: 0.006, ...C(c) });
    const r = 0.135, bh = 0.48, f = Math.max(0.02, p.fill);
    k.lathe('bottle', 'plastic-pc-clear', [[0.02, 0], [0.04, 0.02], [r, 0.08], [r, bh * 0.9], [r * 0.9, bh], [0, bh]], 0, h, 0, { segs: k.seg(28, 10) });
    k.lathe('water', 'water', [[0, 0], [r * 0.95, 0], [r * 0.95, bh * 0.8 * f], [0, bh * 0.8 * f]], 0, h + 0.02, 0, { segs: k.seg(24, 8) });
    return finish(k);
  },
});

const bottleRack = ofp({
  id: 'ofp-water-bottle-rack', placement: 'floor', ko: '생수통 보관대', en: 'Water bottle rack',
  params: [P.int('tiers', '단 수', 'Tiers', 3, 2, 5), P.int('bottles', '생수통 수', 'Bottles', 4, 0, 10)],
  tags: ['water bottle rack', 'bottle storage', '생수통 보관대', '생수 거치대', '물통 랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.6, d = 0.3, step = 0.32, h = p.tiers * step + 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-black-matte', 0.025, h, 0.025, sx * (w / 2 - 0.0125), h / 2, sz * (d / 2 - 0.0125), { r: 0.002 });
    let left = p.bottles;
    for (let i = 0; i < p.tiers; i++) {
      const y = 0.05 + i * step;
      for (const sz of [-1, 1]) k.rod('frame', 'metal-pc-black-matte', [-w / 2, y, sz * 0.1], [w / 2, y, sz * 0.1], 0.008, { segs: 6 });
      for (let j = 0; j < 2 && left > 0; j++, left--) k.cyl('bottles', 'plastic-pc-clear', 0.135, 0.135, 0.28, (j - 0.5) * 0.28, y + 0.135, -0.14, { rx: PI / 2, segs: k.seg(20, 8), ...C('#9fd0f0') });
    }
    return finish(k);
  },
});

const capsuleMachine = ofp({
  id: 'ofp-capsule-coffee-machine', ko: '캡슐 커피 머신', en: 'Capsule coffee machine',
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), P.bool('cup', '컵', 'Cup', true)],
  tags: ['coffee machine', 'capsule machine', 'espresso', '캡슐 커피', '커피 머신', '탕비실'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.13, d = 0.32, h = 0.27;
    k.box('body', 'plastic-abs-gloss-black', w, h, d, 0, h / 2, -0.03, { r: 0.02, ...C(p.body) });
    k.box('tank', 'plastic-acrylic-smoke', w * 0.9, h * 0.8, 0.06, 0, h * 0.42, -d / 2 - 0.06, { r: 0.01 });
    k.box('head', 'metal-chrome', w, 0.05, 0.1, 0, h - 0.03, d / 2 - 0.02, { r: 0.012 });
    k.box('drip', 'metal-chrome', w * 0.9, 0.02, 0.1, 0, 0.01, d / 2 - 0.02, { r: 0.004 });
    if (p.cup) { vessel(k, 'cup', 'ceramic-white', 0.03, 0.06, 0, 0.02, d / 2 - 0.02); }
    return finish(k);
  },
});

const kettle = ofp({
  id: 'ofp-electric-kettle-tray', ko: '전기 포트와 트레이', en: 'Electric kettle with tray',
  params: [P.color('kettle', '포트 색', 'Kettle colour', '#e8e8e8'), P.int('mugs', '머그 수', 'Mugs', 2, 0, 4)],
  tags: ['electric kettle', 'tea tray', 'hot water', '전기 포트', '커피포트', '탕비실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('tray', 'wood-bamboo-natural', 0.42, 0.015, 0.28, 0, 0.0075, 0, { r: 0.006 });
    k.cyl('base', 'plastic-abs-matte-black', 0.08, 0.085, 0.02, -0.1, 0.015, 0, { segs: k.seg(24, 8) });
    k.lathe('kettle', 'plastic-abs-gloss-white', [[0, 0], [0.075, 0], [0.08, 0.02], [0.07, 0.18], [0.05, 0.2], [0, 0.2]], -0.1, 0.035, 0, { segs: k.seg(24, 8), ...C(p.kettle) });
    k.tube('kettle', 'plastic-abs-matte-black', [[-0.17, 0.08, 0], [-0.2, 0.15, 0], [-0.16, 0.22, 0]], 0.012);
    k.rod('kettle', 'plastic-abs-gloss-white', [-0.03, 0.15, 0], [0.0, 0.2, 0], 0.012, { r2: 0.006, segs: 8, ...C(p.kettle) });
    for (let i = 0; i < p.mugs; i++) {
      const x = 0.07 + (i % 2) * 0.08, z = i < 2 ? -0.05 : 0.06;
      vessel(k, 'mugs', 'ceramic-white', 0.035, 0.09, x, 0.015, z);
      mugHandle(k, 'mugs', 'ceramic-white', 0.035, 0.09, x, 0.015, z);
    }
    return finish(k);
  },
});

const mugTree = ofp({
  id: 'ofp-mug-tree', ko: '머그 트리', en: 'Mug tree',
  params: [P.mat('wood', '목재', 'Wood', 'wood-beech-oil', 'wood'), P.int('mugs', '머그 수', 'Mugs', 4, 0, 6)],
  tags: ['mug tree', 'cup stand', 'mug holder', '머그 트리', '컵 걸이', '탕비실'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = 0.34;
    k.cyl('base', p.wood, 0.08, 0.085, 0.02, 0, 0, 0, { segs: k.seg(24, 8) });
    k.cyl('post', p.wood, 0.012, 0.012, h, 0, 0.02, 0, { segs: 10 });
    const cols = ['#c0392b', '#2a5d9f', '#f2f2f2', '#2f7a46', '#e0b020', '#333333'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2, y = 0.18 + (i % 2) * 0.1, c = Math.cos(a), s = Math.sin(a);
      k.rod('pegs', p.wood, [0, y, 0], [c * 0.08, y + 0.03, s * 0.08], 0.005, { segs: 6 });
      if (i < p.mugs) {
        vessel(k, 'mugs', 'ceramic-white', 0.035, 0.09, c * 0.13, y - 0.1, s * 0.13, { o: C(cols[i]) });
      }
    }
    return finish(k);
  },
});

const cupDispenser = ofp({
  id: 'ofp-paper-cup-dispenser', placement: 'wall', elevation: 1.0, ko: '종이컵 디스펜서', en: 'Paper cup dispenser',
  params: [P.int('tubes', '통 수', 'Tubes', 2, 1, 4), P.len('length', '길이', 'Length', 0.45, 0.3, 0.6)],
  tags: ['cup dispenser', 'paper cup', 'water cup', '종이컵 디스펜서', '종이컵 꽂이', '탕비실'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    for (let i = 0; i < p.tubes; i++) {
      const x = (i - (p.tubes - 1) / 2) * 0.1;
      k.cyl('tubes', 'plastic-acrylic-clear', 0.042, 0.042, L, x, 0, 0.045, { open: true, segs: k.seg(20, 8) });
      k.cyl('cups', 'paper', 0.037, 0.03, L * 0.9, x, 0.02, 0.045, { segs: k.seg(16, 8) });
      k.box('brackets', 'metal-ss-brushed', 0.09, 0.03, 0.01, x, L * 0.8, 0.005, { r: 0.002 });
    }
    return finish(k);
  },
});

/* ============================================================ boards */

const whiteboardWall = ofp({
  id: 'ofp-wall-whiteboard', placement: 'wall', elevation: 0.9, ko: '벽걸이 화이트보드', en: 'Wall whiteboard',
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 2.4), P.len('height', '높이', 'Height', 0.9, 0.45, 1.2), P.bool('tray', '펜 받침', 'Marker tray', true)],
  tags: ['whiteboard', 'dry erase board', 'marker board', '화이트보드', '칠판', '회의'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height;
    k.box('board', 'paint-white-gloss', w - 0.03, h - 0.03, 0.012, 0, h / 2, 0.008, { r: 0 });
    k.panel('frame', 'metal-al-brushed', frameShape(w, h, 0.018), 0.022, 0, h / 2, 0.011, { bevel: 0.002 });
    k.box('scribbles', 'paper-black', w * 0.3, 0.01, 0.001, -w * 0.15, h * 0.7, 0.0145, { r: 0, ...C('#1f4e8c') });
    k.box('scribbles', 'paper-black', w * 0.2, 0.01, 0.001, -w * 0.2, h * 0.6, 0.0145, { r: 0, ...C('#b8322a') });
    if (p.tray) {
      k.box('tray', 'metal-al-brushed', w * 0.4, 0.015, 0.06, 0, -0.005, 0.04, { r: 0.002 });
      for (let i = 0; i < 3; i++) k.cyl('markers', 'plastic-abs-gloss-black', 0.008, 0.008, 0.12, -0.02 + i * 0.03, 0.012, 0.04, { rz: PI / 2, segs: 8, ...C(['#1f4e8c', '#b8322a', '#222222'][i]) });
    }
    return finish(k);
  },
});

const glassBoard = ofp({
  id: 'ofp-glass-board', placement: 'wall', elevation: 0.9, ko: '유리 보드', en: 'Glass dry-erase board',
  params: [P.len('width', '폭', 'Width', 1.5, 0.6, 2.4), P.len('height', '높이', 'Height', 1.0, 0.45, 1.2), P.color('back', '배면 색', 'Back colour', '#ffffff')],
  tags: ['glass board', 'glass whiteboard', 'magnetic glass', '유리 보드', '유리 칠판', '화이트보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height;
    k.box('back', 'glass-bp-white', w, h, 0.008, 0, h / 2, 0.004, { r: 0.004, ...C(p.back) });
    for (const sx of [-1, 1]) for (const sy of [0.08, h - 0.08]) k.cyl('standoffs', 'metal-ss-satin', 0.012, 0.012, 0.03, sx * (w / 2 - 0.06), sy, 0, { rx: PI / 2, segs: 10 });
    return finish(k);
  },
});

const mobileWhiteboard = ofp({
  id: 'ofp-mobile-double-whiteboard', placement: 'floor', ko: '이동식 양면 화이트보드', en: 'Mobile double-sided whiteboard',
  params: [P.len('width', '폭', 'Width', 1.5, 0.9, 1.8), P.num('tilt', '기울기', 'Tilt', 0, -0.5, 0.5, 0.01)],
  tags: ['mobile whiteboard', 'rolling whiteboard', 'flip board', '이동식 화이트보드', '양면 화이트보드', '회의'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.9, cy = 1.25;
    for (const sx of [-1, 1]) {
      k.box('frame', 'metal-al-brushed', 0.035, cy + 0.55, 0.035, sx * (w / 2 + 0.03), (cy + 0.55) / 2 + 0.06, 0, { r: 0.004 });
      k.box('frame', 'metal-al-brushed', 0.04, 0.03, 0.6, sx * (w / 2 + 0.03), 0.09, 0, { r: 0.004 });
      for (const sz of [-1, 1]) { k.cyl('casters', 'rubber-black', 0.035, 0.035, 0.025, sx * (w / 2 + 0.03) + 0.0125, 0.035, sz * 0.27, { rz: PI / 2, segs: k.seg(14, 6) }); }
    }
    const g = new THREE.BoxGeometry(w, h, 0.03);
    k.add('board', 'paint-white-gloss', T(g, 0, 0, 0, p.tilt, 0, 0).translate(0, cy, 0));
    k.add('rim', 'metal-al-brushed', T(new THREE.BoxGeometry(w + 0.02, 0.02, 0.035), 0, h / 2, 0, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(p.tilt)).translate(0, cy, 0));
    k.add('rim', 'metal-al-brushed', T(new THREE.BoxGeometry(w + 0.02, 0.02, 0.035), 0, -h / 2, 0, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(p.tilt)).translate(0, cy, 0));
    k.box('frame', 'metal-al-brushed', w + 0.1, 0.03, 0.03, 0, 0.14, 0, { r: 0.004 });
    return finish(k);
  },
});

const corkBoard = ofp({
  id: 'ofp-cork-notice-board', placement: 'wall', elevation: 1.0, ko: '코르크 게시판', en: 'Cork notice board',
  params: [P.len('width', '폭', 'Width', 0.9, 0.4, 1.8), P.len('height', '높이', 'Height', 0.6, 0.3, 1.2), P.int('notes', '메모 수', 'Notes', 7, 0, 16)],
  tags: ['cork board', 'notice board', 'pin board', 'bulletin board', '코르크 게시판', '게시판', '메모판'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height;
    k.box('cork', 'cork-board', w - 0.04, h - 0.04, 0.01, 0, h / 2, 0.006, { r: 0 });
    k.panel('frame', 'wood-oak', frameShape(w, h, 0.025), 0.02, 0, h / 2, 0.01, { bevel: 0.002 });
    const cols = ['#f6e05e', '#ffffff', '#f49ac2', '#8fd3f4', '#b5e48c'];
    for (let i = 0; i < p.notes; i++) {
      const x = -w / 2 + 0.1 + ((i * 0.37) % 1) * (w - 0.2), y = 0.08 + ((i * 0.61) % 1) * (h - 0.2), s = i % 3 ? 0.075 : 0.14;
      k.box('notes', 'paper', s, s * (i % 3 ? 1 : 1.4), 0.001, x, y + 0.03, 0.0115, { r: 0, rz: ((i * 13) % 7 - 3) * 0.03, ...C(cols[i % cols.length]) });
      k.sphere('pins', 'plastic-abs-gloss-red', 0.005, x, y + 0.03 + s * 0.4, 0.014, { segs: 8, rings: 6 });
    }
    return finish(k);
  },
});

const planner = ofp({
  id: 'ofp-wall-planner', placement: 'wall', elevation: 1.0, ko: '연간 일정표', en: 'Year wall planner',
  params: [P.len('width', '폭', 'Width', 1.0, 0.6, 1.6), P.color('accent', '포인트 색', 'Accent', '#2a5d9f')],
  tags: ['wall planner', 'year planner', 'schedule board', '연간 일정표', '벽걸이 달력', '스케줄 보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.7;
    k.box('sheet', 'paper', w, h, 0.004, 0, h / 2, 0.002, { r: 0 });
    k.box('header', 'paper', w, h * 0.1, 0.002, 0, h * 0.94, 0.005, { r: 0, ...C(p.accent) });
    for (let i = 1; i < 12; i++) k.box('grid', 'paper-black', 0.002, h * 0.85, 0.001, -w / 2 + (i / 12) * w, h * 0.44, 0.0045, { r: 0 });
    for (let i = 0; i < 9; i++) k.box('marks', 'paper', w / 12 * (1 + (i % 3)), 0.02, 0.001, -w / 2 + ((i * 0.29) % 0.8) * w + 0.05, 0.08 + ((i * 0.47) % 1) * h * 0.7, 0.005, { r: 0, ...C(['#f6e05e', '#f49ac2', '#8fd3f4'][i % 3]) });
    return finish(k);
  },
});

const noticeCase = ofp({
  id: 'ofp-lockable-notice-case', placement: 'wall', elevation: 1.0, ko: '잠금식 게시 케이스', en: 'Lockable notice case',
  params: [P.len('width', '폭', 'Width', 0.9, 0.5, 1.4), P.mat('frame', '틀', 'Frame', 'metal-al-anodised-clear', 'metal')],
  tags: ['notice case', 'display case', 'locked bulletin', '게시 케이스', '잠금 게시판', '안내 게시판'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.75, d = 0.045;
    k.box('back', 'felt-acoustic-navy', w - 0.03, h - 0.03, 0.008, 0, h / 2, 0.004, { r: 0 });
    k.panel('frame', p.frame, frameShape(w, h, 0.03), d, 0, h / 2, d / 2, { bevel: 0.003 });
    k.box('glass', 'glass-clear', w - 0.05, h - 0.05, 0.004, 0, h / 2, d - 0.006, { r: 0 });
    for (let i = 0; i < 4; i++) sheets(k, 0.21, 0.297, 0.001, -w / 2 + 0.14 + (i % 2) * 0.26, 0, 0, 0);
    for (let i = 0; i < 4; i++) k.box('posters', 'paper', 0.18, 0.25, 0.001, -w / 2 + 0.14 + i * (w - 0.28) / 3, h / 2, 0.009, { r: 0 });
    k.box('lock', 'metal-chrome', 0.015, 0.03, 0.008, w / 2 - 0.015, h / 2, d + 0.002, { r: 0.002 });
    return finish(k);
  },
});

const wallClock = ofp({
  id: 'ofp-office-wall-clock', placement: 'wall', elevation: 1.9, ko: '사무실 벽시계', en: 'Office wall clock',
  params: [P.len('diameter', '지름', 'Diameter', 0.32, 0.22, 0.5), P.mat('rim', '테두리', 'Rim', 'plastic-abs-matte-black', 'plastic')],
  tags: ['wall clock', 'office clock', 'clock', '벽시계', '시계', '사무실 시계'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('rim', p.rim, r, r, 0.045, 0, r, 0, { rx: PI / 2, segs: k.seg(36, 12) });
    k.cyl('face', 'paint-white-matte', r * 0.9, r * 0.9, 0.002, 0, r, 0.0225, { rx: PI / 2, segs: k.seg(36, 12) });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; k.box('ticks', 'paper-black', 0.006, i % 3 ? 0.015 : 0.03, 0.002, Math.sin(a) * r * 0.78, r + Math.cos(a) * r * 0.78, 0.025, { r: 0, rz: -a }); }
    k.box('hands', 'metal-black', 0.008, r * 0.5, 0.002, r * 0.15, r + r * 0.15, 0.027, { r: 0, rz: -0.9 });
    k.box('hands', 'metal-black', 0.006, r * 0.72, 0.002, -r * 0.1, r + r * 0.33, 0.029, { r: 0, rz: 0.3 });
    k.box('glass', 'glass-clear', r * 1.5, r * 1.5, 0.002, 0, r, 0.04, { r: r * 0.7 });
    return finish(k);
  },
});

const worldClocks = ofp({
  id: 'ofp-world-time-clocks', placement: 'wall', elevation: 1.9, ko: '세계 시각 시계 세트', en: 'World time clocks',
  params: [P.int('count', '시계 수', 'Clocks', 4, 2, 6), P.mat('rim', '테두리', 'Rim', 'metal-ss-brushed', 'metal')],
  tags: ['world clocks', 'time zone clocks', 'clock set', '세계 시계', '시차 시계', '해외 시각'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.13, gap = 0.42;
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * gap;
      k.cyl('rim', p.rim, r, r, 0.035, x, r + 0.06, 0, { rx: PI / 2, segs: k.seg(28, 10) });
      k.cyl('face', 'paint-white-matte', r * 0.88, r * 0.88, 0.002, x, r + 0.06, 0.0175, { rx: PI / 2, segs: k.seg(28, 10) });
      k.box('hands', 'metal-black', 0.006, r * 0.6, 0.002, x, r + 0.06 + r * 0.25, 0.02, { r: 0, rz: i * 0.9 });
      k.box('labels', 'metal-black', 0.14, 0.03, 0.004, x, 0.015, 0.002, { r: 0.001 });
    }
    return finish(k);
  },
});

const ipPhone = ofp({
  id: 'ofp-ip-desk-phone', ko: 'IP 전화기', en: 'IP desk phone',
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), P.bool('screen', '화면 켜짐', 'Screen on', true)],
  tags: ['desk phone', 'ip phone', 'office telephone', 'voip', '전화기', '사무용 전화', '인터넷 전화'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.22, d = 0.2;
    k.box('base', 'plastic-abs-matte-black', w, 0.035, d, 0, 0.0175, 0, { r: 0.012, ...C(p.body) });
    k.box('body', 'plastic-abs-matte-black', w, 0.03, d * 0.9, 0.02, 0.055, 0, { r: 0.01, rx: -0.3, ...C(p.body) });
    k.box('display', p.screen ? 'screen-on-white' : 'screen-matte-off', 0.1, 0.004, 0.05, 0.03, 0.08, -0.04, { r: 0.002, rx: -0.3 });
    keys(k, 'keys', 'plastic-abs-matte-grey', 3, 4, 0.04, 0.06, 0.04, 0.018, 0.013, { o: { rx: -0.3 } });
    k.box('handset', 'plastic-abs-matte-black', 0.055, 0.03, 0.2, -w / 2 + 0.035, 0.085, 0, { r: 0.014, rx: -0.3, ...C(p.body) });
    k.tube('cord', 'plastic-abs-matte-black', [[-w / 2 + 0.03, 0.06, 0.09], [-w / 2 - 0.02, 0.02, 0.1], [-w / 2 + 0.01, 0.01, 0.12]], 0.004);
    return finish(k);
  },
});

const conferencePhone = ofp({
  id: 'ofp-conference-speakerphone', ko: '회의용 스피커폰', en: 'Conference speakerphone',
  params: [P.len('size', '크기', 'Size', 0.28, 0.18, 0.36), P.color('body', '몸체 색', 'Body colour', '#2b2b2b')],
  tags: ['conference phone', 'speakerphone', 'star phone', '스피커폰', '회의용 전화', '컨퍼런스 폰'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    const shape = new THREE.Shape();
    for (let i = 0; i < 3; i++) { const a = PI / 2 + (i / 3) * PI * 2; const fn = i ? 'lineTo' : 'moveTo'; shape[fn](Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6); }
    shape.closePath();
    k.slab('body', 'plastic-abs-matte-black', shape, 0.03, 0, { bevel: 0.008, ...C(p.body) });
    k.cyl('grille', 'metal-black-mesh', s * 0.18, s * 0.2, 0.034, 0, 0, 0, { segs: k.seg(24, 8) });
    k.box('display', 'screen-matte-off', 0.06, 0.003, 0.02, 0, 0.031, s * 0.2, { r: 0.001 });
    k.box('leds', 'led-green', 0.03, 0.002, 0.004, 0, 0.035, -s * 0.12, { r: 0 });
    return finish(k);
  },
});

const gooseneckMic = ofp({
  id: 'ofp-gooseneck-conference-mic', ko: '회의용 구즈넥 마이크', en: 'Gooseneck conference mic',
  params: [P.len('neck', '목 길이', 'Neck length', 0.4, 0.25, 0.6), P.bool('on', '켜짐', 'On', true)],
  tags: ['conference microphone', 'gooseneck mic', 'delegate unit', '회의용 마이크', '구즈넥 마이크', '회의실'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.neck;
    k.box('base', 'plastic-abs-matte-black', 0.14, 0.04, 0.12, 0, 0.02, 0, { r: 0.012, rx: 0 });
    k.cyl('button', p.on ? 'led-red' : 'plastic-abs-matte-grey', 0.012, 0.012, 0.006, 0.03, 0.04, 0.03, { segs: 10 });
    k.tube('neck', 'metal-black', [[0, 0.04, -0.03], [0, 0.04 + L * 0.6, -0.02], [0, 0.04 + L * 0.9, 0.05], [0, 0.04 + L * 0.95, 0.1]], 0.005);
    k.cyl('capsule', 'metal-black-mesh', 0.009, 0.007, 0.05, 0, 0.04 + L * 0.95, 0.1, { rx: 1.3, segs: 10 });
    k.add('ring', p.on ? 'led-red' : 'plastic-abs-matte-grey', T(new THREE.TorusGeometry(0.009, 0.002, 6, 12), 0, 0.04 + L * 0.95, 0.1, 1.3 - PI / 2, 0, 0));
    return finish(k);
  },
});

const tableTent = ofp({
  id: 'ofp-name-tent-cards', ko: '회의 명패 카드', en: 'Name tent cards',
  params: [P.int('count', '개수', 'Count', 4, 1, 8), P.color('card', '카드 색', 'Card colour', '#ffffff')],
  tags: ['name tent', 'table tent', 'place card', '명패 카드', '테이블 텐트', '좌석 카드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), a = 0.45;
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * 0.25;
      for (const s of [-1, 1]) k.box('cards', 'paper', 0.21, 0.08, 0.0015, x, 0.04 * Math.cos(a), s * Math.sin(a) * 0.04, { r: 0, rx: s * a, ...C(p.card) });
      k.box('text', 'paper-black', 0.12, 0.015, 0.0005, x, 0.04 * Math.cos(a), Math.sin(a) * 0.04 + 0.001, { r: 0, rx: a });
    }
    return finish(k);
  },
});

const projectorScreen = ofp({
  id: 'ofp-tripod-projector-screen', placement: 'floor', ko: '삼각대 스크린', en: 'Tripod projection screen',
  params: [P.len('width', '폭', 'Width', 1.8, 1.2, 2.4), P.num('open', '펼침', 'Pulled up', 1, 0.2, 1, 0.05)],
  tags: ['projector screen', 'tripod screen', 'projection', '스크린', '빔 스크린', '삼각대 스크린'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.75 * p.open, top = 0.95 + w * 0.75;
    for (let i = 0; i < 3; i++) { const a = PI / 2 + (i / 3) * PI * 2; k.rod('legs', 'metal-black', [0, 0.6, -0.05], [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45 - 0.05], 0.012, { segs: 8 }); }
    k.rod('post', 'metal-black', [0, 0, -0.05], [0, top + 0.08, -0.05], 0.014, { segs: 8 });
    k.cyl('case', 'metal-pc-black-matte', 0.04, 0.04, w + 0.1, (w + 0.1) / 2, 0.95, 0, { rz: PI / 2, segs: k.seg(14, 6) });
    k.box('screen', 'paint-white-matte', w, h, 0.002, 0, 0.95 + h / 2, 0, { r: 0 });
    k.box('screen', 'paint-black-matte', w, 0.04, 0.003, 0, 0.95 + h - 0.02, 0.001, { r: 0 });
    k.rod('post', 'metal-black', [-0.2, 0.95 + h, -0.01], [0.2, 0.95 + h, -0.01], 0.006, { segs: 6 });
    return finish(k);
  },
});

const tabletopFlipchart = ofp({
  id: 'ofp-tabletop-flipchart', ko: '탁상용 플립차트', en: 'Tabletop flipchart',
  params: [P.len('width', '폭', 'Width', 0.6, 0.4, 0.8), P.int('pages', '장 수', 'Pages', 20, 1, 40)],
  tags: ['tabletop flipchart', 'easel pad', 'presentation', '탁상 플립차트', '이젤 패드', '프레젠테이션'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 1.1, a = 0.25;
    k.box('back', 'paper-greyboard', w, h, 0.004, 0, h / 2 * Math.cos(a), -Math.sin(a) * h / 2, { r: 0, rx: a });
    k.box('stand', 'paper-greyboard', w * 0.9, h * 0.7, 0.004, 0, h * 0.35 * Math.cos(a), -Math.sin(a) * h * 0.9, { r: 0, rx: -a });
    k.box('pad', 'paper', w * 0.95, h * 0.95, Math.max(0.001, p.pages * 0.0002), 0, h * 0.47 * Math.cos(a), -Math.sin(a) * h * 0.47 + 0.004, { r: 0, rx: a });
    return finish(k);
  },
});

/* ============================================================ safety */

const extinguisher = ofp({
  id: 'ofp-fire-extinguisher-stand', placement: 'floor', ko: '소화기와 받침대', en: 'Fire extinguisher on stand',
  params: [P.int('count', '개수', 'Count', 1, 1, 2), P.len('height', '높이', 'Height', 0.5, 0.35, 0.65)],
  tags: ['fire extinguisher', 'extinguisher stand', 'fire safety', '소화기', '소화기 받침대', '소방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, r = h * 0.17;
    const w = p.count * (2 * r + 0.04) + 0.04;
    k.box('stand', 'metal-pc-red', w, 0.03, 2 * r + 0.06, 0, 0.015, 0, { r: 0.004 });
    k.box('stand', 'metal-pc-red', w, h * 0.5, 0.01, 0, h * 0.25 + 0.03, -r - 0.03, { r: 0.002 });
    k.box('sign', 'paper', w * 0.8, 0.08, 0.002, 0, h * 0.4, -r - 0.024, { r: 0, ...C('#ffffff') });
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * (2 * r + 0.04);
      k.lathe('cylinders', 'metal-pc-red', [[0, 0], [r, 0], [r, h * 0.82], [r * 0.6, h * 0.9], [r * 0.25, h * 0.92], [0, h * 0.92]], x, 0.03, 0, { segs: k.seg(20, 8) });
      k.box('valves', 'metal-brass', 0.03, 0.05, 0.03, x, 0.03 + h * 0.95, 0, { r: 0.004 });
      k.box('valves', 'plastic-abs-matte-black', 0.1, 0.012, 0.025, x + 0.03, 0.03 + h * 0.99, 0, { r: 0.004, rz: -0.1 });
      k.tube('hoses', 'rubber-black', [[x + 0.01, 0.03 + h * 0.95, 0.01], [x + r + 0.01, 0.03 + h * 0.7, 0.01], [x + r + 0.005, 0.03 + h * 0.4, 0.02]], 0.007);
      k.box('labels', 'paper', r * 1.2, h * 0.3, 0.002, x, 0.03 + h * 0.45, r + 0.001, { r: 0 });
    }
    return finish(k);
  },
});

const extinguisherCabinet = ofp({
  id: 'ofp-fire-hose-cabinet', placement: 'wall', elevation: 0.3, ko: '옥내 소화전함', en: 'Indoor fire hose cabinet',
  params: [P.len('width', '폭', 'Width', 0.75, 0.6, 0.9), P.bool('glass', '유리창', 'Glass window', true)],
  tags: ['fire hose cabinet', 'hydrant cabinet', 'fire cabinet', '소화전함', '옥내 소화전', '소방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 1.4, d = 0.18;
    k.box('body', 'metal-pc-red', w, h, d, 0, h / 2, d / 2, { r: 0.006 });
    k.box('door', 'metal-pc-red', w - 0.02, h - 0.02, 0.012, 0, h / 2, d + 0.006, { r: 0.004 });
    if (p.glass) k.box('glass', 'glass-clear', w * 0.5, h * 0.25, 0.004, 0, h * 0.7, d + 0.013, { r: 0.002 });
    k.box('signs', 'paper', w * 0.5, 0.06, 0.002, 0, h * 0.88, d + 0.013, { r: 0 });
    k.add('hose', 'fabric-canvas-ecru', T(new THREE.TorusGeometry(0.2, 0.05, k.seg(8, 4), k.seg(24, 10)), 0, h * 0.7, d * 0.5, 0, 0, 0));
    k.box('lamp', 'led-red', 0.08, 0.04, 0.02, 0, h - 0.06, d + 0.022, { r: 0.006 });
    addHandleSimple(k, w / 2 - 0.05, h * 0.5, d + 0.012);
    return finish(k);
  },
});
function addHandleSimple(k, x, y, z) { k.box('handles', 'metal-chrome', 0.02, 0.12, 0.02, x, y, z + 0.01, { r: 0.004 }); }

const firstAid = ofp({
  id: 'ofp-first-aid-cabinet', placement: 'wall', elevation: 1.3, ko: '구급함', en: 'First aid cabinet',
  params: [P.len('width', '폭', 'Width', 0.36, 0.26, 0.5), P.color('body', '몸체 색', 'Body colour', '#f4f4f4')],
  tags: ['first aid kit', 'first aid cabinet', 'medicine cabinet', '구급함', '구급 상자', '응급 키트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 1.1, d = 0.12;
    k.box('body', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.008, ...C(p.body) });
    k.box('cross', 'plastic-abs-gloss-green', w * 0.3, w * 0.1, 0.004, 0, h * 0.55, d + 0.002, { r: 0, ...C('#1e9b4b') });
    k.box('cross', 'plastic-abs-gloss-green', w * 0.1, w * 0.3, 0.004, 0, h * 0.55, d + 0.002, { r: 0, ...C('#1e9b4b') });
    k.box('handle', 'plastic-abs-matte-black', 0.015, 0.06, 0.015, w / 2 - 0.03, h * 0.5, d + 0.008, { r: 0.003 });
    return finish(k);
  },
});

const aed = ofp({
  id: 'ofp-aed-wall-cabinet', placement: 'wall', elevation: 1.1, ko: '자동심장충격기 (AED) 함', en: 'AED wall cabinet',
  params: [P.color('body', '몸체 색', 'Body colour', '#f4f4f4'), P.bool('alarm', '경보 램프', 'Alarm lamp', true)],
  tags: ['aed', 'defibrillator', 'aed cabinet', '자동심장충격기', '제세동기', '응급'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.42, h = 0.45, d = 0.2;
    k.box('body', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.01, ...C(p.body) });
    k.box('glass', 'glass-clear', w * 0.75, h * 0.6, 0.004, 0, h * 0.45, d + 0.002, { r: 0.004 });
    k.box('aed', 'plastic-abs-gloss-green', w * 0.55, h * 0.45, 0.1, 0, h * 0.45, d * 0.5, { r: 0.02, ...C('#2fb04a') });
    k.box('sign', 'plastic-abs-gloss-green', w, 0.07, 0.006, 0, h + 0.04, 0.003, { r: 0.002, ...C('#2fb04a') });
    if (p.alarm) k.cyl('alarm', 'led-red', 0.025, 0.025, 0.03, 0, h, d * 0.5, { segs: 12 });
    return finish(k);
  },
});

const exitSign = ofp({
  id: 'ofp-emergency-exit-sign', placement: 'wall', elevation: 2.1, ko: '비상구 유도등', en: 'Emergency exit sign',
  params: [P.pick('dir', '방향', 'Direction', 'right', [['right', '오른쪽', 'Right'], ['left', '왼쪽', 'Left'], ['down', '아래', 'Down']]), P.len('width', '폭', 'Width', 0.36, 0.25, 0.5)],
  tags: ['exit sign', 'emergency exit', 'fire exit', '비상구', '유도등', '피난구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.45;
    k.box('body', 'plastic-abs-gloss-white', w, h, 0.04, 0, h / 2, 0.02, { r: 0.006 });
    k.box('face', 'led-green', w * 0.92, h * 0.85, 0.002, 0, h / 2, 0.041, { r: 0 });
    k.box('figure', 'paint-white-matte', h * 0.3, h * 0.55, 0.002, p.dir === 'left' ? w * 0.25 : -w * 0.25, h / 2, 0.043, { r: 0 });
    const ax = p.dir === 'left' ? -w * 0.18 : w * 0.18;
    k.box('arrow', 'paint-white-matte', w * 0.2, h * 0.12, 0.002, ax, h / 2, 0.043, { r: 0, rz: p.dir === 'down' ? PI / 2 : 0 });
    k.light(0, h / 2, 0.08, { color: '#7dffa0', intensity: 0.05, distance: 1.2 });
    return finish(k);
  },
});

const fireAlarm = ofp({
  id: 'ofp-fire-alarm-call-point', placement: 'wall', elevation: 1.3, ko: '화재 발신기 (비상벨)', en: 'Fire alarm call point',
  params: [P.bool('bell', '벨', 'With bell', true)],
  tags: ['fire alarm', 'call point', 'alarm bell', '비상벨', '화재 발신기', '소방'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('box', 'plastic-abs-gloss-red', 0.1, 0.1, 0.05, 0, 0.05, 0.025, { r: 0.006 });
    k.box('glass', 'plastic-acrylic-white', 0.065, 0.065, 0.004, 0, 0.05, 0.051, { r: 0.002 });
    if (p.bell) {
      k.cyl('bell', 'metal-pc-red', 0.075, 0.075, 0.04, 0, 0.22, 0, { rx: PI / 2, segs: k.seg(24, 8) });
      k.sphere('bell', 'metal-chrome', 0.012, 0, 0.22, 0.045, { segs: 10, rings: 6 });
    }
    return finish(k);
  },
});

const eyeWash = ofp({
  id: 'ofp-eye-wash-station', placement: 'wall', elevation: 1.2, ko: '세안기 (벽부형)', en: 'Wall eye-wash station',
  params: [P.int('bottles', '병 수', 'Bottles', 2, 1, 3)],
  tags: ['eye wash', 'eyewash station', 'safety', '세안기', '세안 스테이션', '안전 용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.bottles * 0.1 + 0.06;
    k.box('panel', 'plastic-abs-gloss-green', w, 0.36, 0.02, 0, 0.18, 0.01, { r: 0.006, ...C('#1e9b4b') });
    k.box('sign', 'paper', w * 0.8, 0.06, 0.002, 0, 0.32, 0.021, { r: 0 });
    for (let i = 0; i < p.bottles; i++) {
      const x = (i - (p.bottles - 1) / 2) * 0.1;
      k.lathe('bottles', 'plastic-pe-white', [[0, 0], [0.035, 0], [0.035, 0.18], [0.015, 0.21], [0.008, 0.24], [0, 0.24]], x, 0.03, 0.06, { segs: k.seg(16, 8) });
    }
    return finish(k);
  },
});

/* ============================================================ storage helpers */

const officeSafe = ofp({
  id: 'ofp-office-safe', placement: 'floor', ko: '사무용 금고', en: 'Office safe',
  params: [P.len('height', '높이', 'Height', 0.6, 0.35, 1.2), P.color('body', '몸체 색', 'Body colour', '#3a3d40')],
  tags: ['safe', 'office safe', 'fireproof safe', '금고', '사무용 금고', '내화 금고'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = Math.min(0.6, h * 0.75 + 0.1), d = 0.5;
    k.box('body', 'metal-pc-anthracite', w, h, d, 0, h / 2, 0, { r: 0.01, ...C(p.body) });
    k.box('door', 'metal-pc-anthracite', w - 0.05, h - 0.05, 0.02, 0, h / 2, d / 2 + 0.01, { r: 0.006, ...C(p.body) });
    k.box('keypad', 'plastic-abs-matte-black', 0.08, 0.1, 0.01, -w * 0.15, h * 0.62, d / 2 + 0.025, { r: 0.004 });
    keys(k, 'keys', 'metal-chrome', 3, 4, -w * 0.15, h * 0.6, d / 2 + 0.03, 0.02, 0.012, { top: false });
    k.cyl('handle', 'metal-chrome', 0.03, 0.03, 0.02, w * 0.18, h * 0.6, d / 2 + 0.02, { rx: PI / 2, segs: 12 });
    k.box('handle', 'metal-chrome', 0.1, 0.015, 0.015, w * 0.18, h * 0.6, d / 2 + 0.045, { r: 0.005 });
    return finish(k);
  },
});

const keyCabinet = ofp({
  id: 'ofp-key-cabinet', placement: 'wall', elevation: 1.3, ko: '열쇠 보관함', en: 'Key cabinet',
  params: [P.int('hooks', '고리 수', 'Hooks', 48, 20, 100), P.bool('open', '문 열림', 'Door open', false)],
  tags: ['key cabinet', 'key box', 'key safe', '열쇠 보관함', '키 박스', '키 캐비닛'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = 8, rows = Math.ceil(p.hooks / cols), w = 0.3, h = 0.06 + rows * 0.045, d = 0.08;
    k.box('body', 'metal-pc-light-grey', w, h, 0.008, 0, h / 2, 0.004, { r: 0.002 });
    for (const sx of [-1, 1]) k.box('body', 'metal-pc-light-grey', 0.008, h, d, sx * (w / 2 - 0.004), h / 2, d / 2, { r: 0.002 });
    for (const y of [0.004, h - 0.004]) k.box('body', 'metal-pc-light-grey', w, 0.008, d, 0, y, d / 2, { r: 0.002 });
    for (let i = 0; i < p.hooks; i++) {
      const x = -w / 2 + 0.03 + (i % cols) * ((w - 0.06) / (cols - 1)), y = h - 0.035 - Math.floor(i / cols) * 0.045;
      k.box('hooks', 'metal-chrome', 0.003, 0.003, 0.03, x, y, 0.024, { r: 0 });
      if (i % 3 !== 1) k.box('tags', 'plastic-abs-gloss-yellow', 0.012, 0.025, 0.002, x, y - 0.016, 0.036, { r: 0, ...C(['#f2c200', '#2a7de1', '#d9342b', '#2fb04a'][i % 4]) });
    }
    if (p.open) k.box('door', 'metal-pc-light-grey', 0.008, h, w, -w / 2 - 0.004, h / 2, d + w / 2, { r: 0.002 });
    else k.box('door', 'metal-pc-light-grey', w, h, 0.008, 0, h / 2, d + 0.004, { r: 0.002 });
    return finish(k);
  },
});

const cashBox = ofp({
  id: 'ofp-cash-box', ko: '손금고', en: 'Cash box',
  params: [P.color('body', '몸체 색', 'Body colour', '#2a5d9f'), P.bool('open', '열림', 'Open', false)],
  tags: ['cash box', 'petty cash', 'money box', '손금고', '현금함', '경리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.3, d = 0.24, h = 0.09;
    k.box('box', 'metal-pc-navy', w, h, d, 0, h / 2, 0, { r: 0.006, ...C(p.body) });
    if (p.open) {
      k.box('lid', 'metal-pc-navy', w, 0.012, d, 0, h + d / 2, -d / 2, { r: 0.004, rx: PI / 2, ...C(p.body) });
      k.box('tray', 'plastic-abs-matte-black', w - 0.02, 0.02, d - 0.02, 0, h - 0.012, 0, { r: 0.003 });
      for (let i = 0; i < 4; i++) k.cyl('coins', 'metal-gold-brushed', 0.012, 0.012, 0.006, -0.1 + i * 0.05, h - 0.002, 0.06, { segs: 10 });
    } else k.box('lid', 'metal-pc-navy', w, 0.012, d, 0, h + 0.006, 0, { r: 0.004, ...C(p.body) });
    k.box('handle', 'metal-chrome', 0.1, 0.01, 0.02, 0, p.open ? h + 0.02 : h + 0.017, p.open ? -d : 0, { r: 0.004 });
    k.box('lock', 'metal-chrome', 0.03, 0.02, 0.006, 0, h * 0.7, d / 2 + 0.003, { r: 0.002 });
    return finish(k);
  },
});

const mailCart = ofp({
  id: 'ofp-mail-cart', placement: 'floor', ko: '우편물 운반 카트', en: 'Mail cart',
  params: [P.len('length', '길이', 'Length', 0.9, 0.6, 1.2), P.int('files', '파일 수', 'Hanging files', 12, 0, 30)],
  tags: ['mail cart', 'file cart', 'trolley', '우편 카트', '서류 카트', '운반 카트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, d = 0.45;
    const y0 = castors(k, L, d);
    k.box('bin', 'metal-pc-light-grey', L, 0.4, d, 0, y0 + 0.2 + 0.25, 0, { r: 0.006 });
    k.box('shelf', 'metal-pc-light-grey', L, 0.02, d, 0, y0 + 0.08, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('posts', 'metal-chrome', 0.02, 0.4, 0.02, sx * (L / 2 - 0.02), y0 + 0.25, sz * (d / 2 - 0.02), { r: 0.003 });
    k.bentTube('handle', 'metal-chrome', [[-L / 2 - 0.02, y0 + 0.6, -d / 2 + 0.04], [-L / 2 - 0.1, y0 + 0.75, -d / 2 + 0.04], [-L / 2 - 0.1, y0 + 0.75, d / 2 - 0.04], [-L / 2 - 0.02, y0 + 0.6, d / 2 - 0.04]], 0.012, 0.04);
    for (let i = 0; i < p.files; i++) k.box('files', 'paper-kraft', 0.004, 0.25, d - 0.08, -L / 2 + 0.06 + i * ((L - 0.12) / 30), y0 + 0.55, 0, { r: 0, ...C(BINDER_COLS[i % BINDER_COLS.length]) });
    return finish(k);
  },
});

const kickStool = ofp({
  id: 'ofp-rolling-kick-stool', placement: 'floor', ko: '이동식 발판 (킥 스툴)', en: 'Rolling kick stool',
  params: [P.color('body', '색', 'Colour', '#2a5d9f'), P.len('height', '높이', 'Height', 0.36, 0.3, 0.45)],
  tags: ['kick stool', 'step stool', 'elephant foot', '킥 스툴', '발판', '사다리 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.lathe('body', 'plastic-pp-navy', [[0, 0], [0.21, 0], [0.21, 0.02], [0.15, h - 0.02], [0.14, h], [0, h]], 0, 0, 0, { segs: k.seg(28, 10), ...C(p.body) });
    k.cyl('top', 'rubber-black', 0.14, 0.14, 0.006, 0, h, 0, { segs: k.seg(28, 10) });
    k.cyl('bumper', 'rubber-black', 0.215, 0.215, 0.02, 0, 0, 0, { segs: k.seg(28, 10) });
    return finish(k);
  },
});

const stepLadder = ofp({
  id: 'ofp-folding-step-ladder', placement: 'floor', ko: '사무실 접이식 사다리', en: 'Office folding step ladder',
  params: [P.int('steps', '단 수', 'Steps', 3, 2, 5), P.mat('frame', '틀', 'Frame', 'metal-al-brushed', 'metal')],
  tags: ['step ladder', 'folding ladder', 'ladder', '사다리', '접이식 사다리', '발판 사다리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.steps, rise = 0.24, h = n * rise, w = 0.45, a = 0.28;
    for (const sx of [-1, 1]) {
      k.rod('frame', p.frame, [sx * w / 2, 0, h * Math.tan(a)], [sx * w / 2, h, 0], 0.016, { segs: 8 });
      k.rod('frame', p.frame, [sx * w / 2, 0, -h * 0.35], [sx * w / 2, h, 0], 0.014, { segs: 8 });
      k.box('feet', 'rubber-black', 0.04, 0.03, 0.05, sx * w / 2, 0.015, h * Math.tan(a), { r: 0.006 });
    }
    for (let i = 1; i <= n; i++) {
      const y = i * rise, z = (h - y) * Math.tan(a);
      k.box('steps', p.frame, w, 0.02, 0.12, 0, y - 0.01, z, { r: 0.003 });
      k.box('treads', 'rubber-black', w - 0.04, 0.004, 0.1, 0, y + 0.002, z, { r: 0 });
    }
    k.bentTube('frame', p.frame, [[-w / 2, h, 0], [-w / 2, h + 0.5, -0.05], [w / 2, h + 0.5, -0.05], [w / 2, h, 0]], 0.012, 0.05);
    return finish(k);
  },
});

const coatStand = ofp({
  id: 'ofp-office-coat-stand', placement: 'floor', ko: '사무실 옷걸이 스탠드', en: 'Office coat stand',
  params: [P.mat('metal', '금속', 'Metal', 'metal-pc-black-matte', 'metal'), P.int('coats', '걸린 옷', 'Coats', 2, 0, 4)],
  tags: ['coat stand', 'coat rack', 'hat stand', '옷걸이', '스탠드 옷걸이', '코트 걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = 1.78;
    k.cyl('base', p.metal, 0.2, 0.21, 0.02, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('post', p.metal, 0.018, 0.018, h, 0, 0.02, 0, { segs: 10 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2, y = i % 2 ? h - 0.05 : h - 0.2;
      k.tube('hooks', p.metal, [[0, y - 0.04, 0], [Math.cos(a) * 0.1, y, Math.sin(a) * 0.1], [Math.cos(a) * 0.13, y + 0.04, Math.sin(a) * 0.13]], 0.006);
    }
    const cols = ['#2b2f3a', '#8a6d4a', '#4a5a3a', '#7a1f2a'];
    for (let i = 0; i < p.coats; i++) {
      const a = (i / 6) * PI * 2 * 2 + 0.3;
      k.soft('coats', 'fabric-felt-charcoal', 0.4, 0.9, 0.1, 0.04, Math.cos(a) * 0.17, h - 0.55, Math.sin(a) * 0.17, { ry: -a + PI / 2, puff: 0.01, ...C(cols[i]) });
    }
    return finish(k);
  },
});

const umbrellaStand = ofp({
  id: 'ofp-umbrella-stand-office', placement: 'floor', ko: '우산꽂이 (사무실)', en: 'Office umbrella stand',
  params: [P.int('umbrellas', '우산 수', 'Umbrellas', 3, 0, 8), P.mat('body', '재질', 'Material', 'metal-ss-brushed', 'metal')],
  tags: ['umbrella stand', 'umbrella holder', 'entrance', '우산꽂이', '우산 거치대', '현관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = 0.13, h = 0.55;
    k.cyl('body', p.body, r, r, h, 0, 0, 0, { open: true, segs: k.seg(28, 10) });
    k.cyl('body', p.body, r, r, 0.01, 0, 0, 0, { segs: k.seg(28, 10) });
    const cols = ['#1f3a6e', '#222222', '#b8322a', '#2f7a46', '#e0b020', '#7a4a9a', '#555555', '#e07a2a'];
    for (let i = 0; i < p.umbrellas; i++) {
      const a = i * 2.4, x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
      k.cyl('umbrellas', 'fabric-canvas-navy', 0.03, 0.008, 0.6, x, 0.02, z, { rz: Math.cos(a) * 0.08, rx: Math.sin(a) * 0.08, segs: 8, ...C(cols[i]) });
      k.tube('handles', 'wood-am-walnut-oil', [[x, 0.7, z], [x, 0.8, z], [x + 0.03, 0.83, z], [x + 0.05, 0.79, z]], 0.008);
    }
    return finish(k);
  },
});

const lockerTags = ofp({
  id: 'ofp-visitor-badge-rack', placement: 'wall', elevation: 1.2, ko: '방문증 걸이', en: 'Visitor badge rack',
  params: [P.int('badges', '방문증 수', 'Badges', 12, 4, 24), P.color('strap', '목줄 색', 'Lanyard colour', '#2a5d9f')],
  tags: ['visitor badge', 'lanyard', 'id card', 'badge rack', '방문증', '출입증', '목걸이 명찰'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = 6, rows = Math.ceil(p.badges / cols), w = cols * 0.07 + 0.04, h = rows * 0.22 + 0.04;
    k.box('board', 'plastic-acrylic-white', w, h, 0.008, 0, h / 2, 0.004, { r: 0.004 });
    for (let i = 0; i < p.badges; i++) {
      const x = -w / 2 + 0.055 + (i % cols) * 0.07, y = h - 0.03 - Math.floor(i / cols) * 0.22;
      k.cyl('pegs', 'metal-chrome', 0.004, 0.004, 0.025, x, y, 0.008, { rx: PI / 2, segs: 6 });
      k.box('straps', 'fabric-canvas-navy', 0.012, 0.1, 0.002, x, y - 0.05, 0.022, { r: 0, ...C(p.strap) });
      k.box('cards', 'plastic-pvc-clear', 0.055, 0.085, 0.003, x, y - 0.145, 0.024, { r: 0.003 });
    }
    return finish(k);
  },
});

const brochureRack = ofp({
  id: 'ofp-brochure-floor-stand', placement: 'floor', ko: '브로슈어 스탠드', en: 'Brochure floor stand',
  params: [P.int('pockets', '포켓 수', 'Pockets', 4, 2, 6), P.mat('frame', '틀', 'Frame', 'metal-chrome', 'metal')],
  tags: ['brochure stand', 'literature rack', 'leaflet display', '브로슈어 스탠드', '카탈로그 꽂이', '안내 책자'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.pockets, h = 0.35 + n * 0.3, w = 0.3;
    k.box('base', p.frame, 0.38, 0.015, 0.36, 0, 0.0075, 0, { r: 0.004 });
    k.rod('post', p.frame, [0, 0, -0.08], [0, h, -0.08], 0.014, { segs: 8 });
    const cols = ['#2a5d9f', '#c0392b', '#2f7a46', '#e0b020', '#7a4a9a', '#333333'];
    for (let i = 0; i < n; i++) {
      const y = 0.35 + i * 0.3;
      k.box('pockets', 'plastic-acrylic-clear', w, 0.14, 0.004, 0, y, -0.04, { r: 0.002, rx: -0.2 });
      k.box('pockets', 'plastic-acrylic-clear', w, 0.004, 0.04, 0, y - 0.07, -0.05, { r: 0 });
      k.box('brochures', 'paper-glossy', w * 0.7, 0.22, 0.01, 0, y + 0.03, -0.06, { r: 0, rx: -0.2, ...C(cols[i % cols.length]) });
    }
    return finish(k);
  },
});

const deskFan = ofp({
  id: 'ofp-usb-desk-fan', ko: '탁상용 선풍기', en: 'Desk fan',
  params: [P.len('diameter', '지름', 'Diameter', 0.2, 0.12, 0.3), P.color('body', '몸체 색', 'Body colour', '#f0f0f0')],
  tags: ['desk fan', 'usb fan', 'small fan', '탁상용 선풍기', '미니 선풍기', '책상 선풍기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2;
    k.cyl('base', 'plastic-abs-gloss-white', 0.06, 0.065, 0.02, 0, 0, 0, { segs: k.seg(20, 8), ...C(p.body) });
    k.rod('stem', 'plastic-abs-gloss-white', [0, 0.02, 0], [0, r + 0.06, -0.01], 0.012, { segs: 8, ...C(p.body) });
    k.cyl('cage', 'metal-black-mesh', r, r, 0.07, 0, r + 0.08, -0.04, { rx: PI / 2, segs: k.seg(24, 8), open: true });
    k.cyl('cage', 'metal-black-mesh', r, r, 0.003, 0, r + 0.08, 0.03, { rx: PI / 2, segs: k.seg(24, 8) });
    for (let i = 0; i < 5; i++) k.box('blades', 'plastic-acrylic-smoke', r * 0.8, 0.002, r * 0.35, Math.cos(i * 1.257) * r * 0.4, r + 0.08 + Math.sin(i * 1.257) * r * 0.4, 0, { r: 0, rx: PI / 2, rz: i * 1.257, ry: 0.3 });
    k.box('motor', 'plastic-abs-gloss-white', 0.06, 0.06, 0.06, 0, r + 0.08, -0.08, { r: 0.02, ...C(p.body) });
    return finish(k);
  },
});

const deskPurifier = ofp({
  id: 'ofp-desk-air-purifier', ko: '탁상용 공기청정기', en: 'Desk air purifier',
  params: [P.len('height', '높이', 'Height', 0.3, 0.2, 0.4), P.color('body', '몸체 색', 'Body colour', '#e8e8e8')],
  tags: ['air purifier', 'desk purifier', 'hepa', '공기청정기', '미니 공기청정기', '탁상 공기청정기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.cyl('body', 'plastic-abs-matte-white', 0.085, 0.09, h, 0, 0, 0, { segs: k.seg(28, 10), ...C(p.body) });
    k.cyl('grille', 'metal-pc-white-perforated', 0.091, 0.091, h * 0.6, 0, 0.02, 0, { segs: k.seg(28, 10), open: true });
    k.cyl('top', 'plastic-abs-matte-grey', 0.07, 0.07, 0.006, 0, h, 0, { segs: k.seg(24, 8) });
    k.box('leds', 'led-blue', 0.02, 0.002, 0.004, 0, h + 0.006, 0.05, { r: 0 });
    return finish(k);
  },
});

const heater = ofp({
  id: 'ofp-under-desk-panel-heater', placement: 'floor', ko: '책상 밑 패널 히터', en: 'Under-desk panel heater',
  params: [P.len('width', '폭', 'Width', 0.6, 0.4, 0.9), P.color('panel', '패널 색', 'Panel colour', '#8a8a8a')],
  tags: ['panel heater', 'foot warmer', 'desk heater', '패널 히터', '발난로', '책상 히터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.4, a = 0.35;
    for (const [s, ww] of [[0, w], [1, w * 0.6], [-1, w * 0.6]]) {
      if (!s) k.box('panels', 'felt-acoustic-grey', ww, h, 0.015, 0, h / 2, -0.15, { r: 0.004, ...C(p.panel) });
      else k.box('panels', 'felt-acoustic-grey', ww * 0.5, h, 0.015, s * (w / 2 + Math.cos(a) * ww * 0.25 - 0.01), h / 2, -0.15 + Math.sin(a) * ww * 0.25, { r: 0.004, ry: -s * a, ...C(p.panel) });
    }
    k.box('switch', 'led-amber', 0.02, 0.01, 0.004, w * 0.3, h - 0.03, -0.14, { r: 0 });
    return finish(k);
  },
});

const desktopPlantShelf = ofp({
  id: 'ofp-desk-shelf-riser', ko: '책상 위 2단 선반', en: 'Desktop shelf riser',
  params: [P.mat('wood', '목재', 'Wood', 'wood-white-oak-oil', 'wood'), P.len('width', '폭', 'Width', 0.6, 0.4, 1.0), P.int('books', '책 수', 'Books', 5, 0, 10)],
  tags: ['desk shelf', 'desktop riser', 'hutch', '책상 선반', '데스크 선반', '2단 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, d = 0.22, t = 0.016;
    for (const y of [0.12, 0.3]) k.box('shelves', p.wood, w, t, d, 0, y, 0, { r: 0.002 });
    for (const sx of [-1, 1]) k.box('sides', 'metal-pc-black-matte', 0.02, 0.31, d, sx * (w / 2 - 0.01), 0.155, 0, { r: 0.002 });
    for (let i = 0; i < p.books; i++) binder(k, BINDER_COLS[i % BINDER_COLS.length], 0.035, 0.15 - (i % 2) * 0.02, 0.16, -w / 2 + 0.05 + i * 0.04, 0.128, -0.01, { label: false });
    k.box('notes', 'paper', 0.08, 0.04, 0.08, w * 0.3, 0.02, 0.02, { r: 0, ...C('#f6e05e') });
    return finish(k);
  },
});

const docCamera = ofp({
  id: 'ofp-document-camera', ko: '실물 화상기', en: 'Document camera',
  params: [P.len('arm', '팔 길이', 'Arm length', 0.38, 0.25, 0.5), P.color('body', '몸체 색', 'Body colour', '#2b2b2b')],
  tags: ['document camera', 'visualizer', 'overhead camera', '실물 화상기', '실물 투영기', '문서 카메라'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.arm;
    k.box('base', 'plastic-abs-matte-black', 0.2, 0.03, 0.26, 0, 0.015, 0, { r: 0.01, ...C(p.body) });
    k.rod('arm', 'plastic-abs-matte-black', [0, 0.03, -0.1], [0, 0.03 + L * 0.7, -0.08], 0.012, { segs: 8, ...C(p.body) });
    k.rod('arm', 'plastic-abs-matte-black', [0, 0.03 + L * 0.7, -0.08], [0, 0.03 + L, 0.06], 0.01, { segs: 8, ...C(p.body) });
    k.box('head', 'plastic-abs-matte-black', 0.06, 0.03, 0.08, 0, 0.03 + L, 0.08, { r: 0.008, ...C(p.body) });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.012, 0.012, 0.004, 0, 0.012 + L, 0.09, { segs: 12 });
    sheets(k, 0.21, 0.15, 0.002, 0, 0.0, 0.18);
    return finish(k);
  },
});

const signHolder = ofp({
  id: 'ofp-acrylic-sign-holder', ko: '아크릴 안내 꽂이', en: 'Acrylic sign holder',
  params: [P.pick('size', '크기', 'Size', 'a4', [['a5', 'A5', 'A5'], ['a4', 'A4', 'A4'], ['a3', 'A3', 'A3']]), P.bool('landscape', '가로형', 'Landscape', false)],
  tags: ['sign holder', 'acrylic stand', 'menu stand', 'pop stand', '아크릴 꽂이', '안내 꽂이', 'POP 꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = { a5: [0.148, 0.21], a4: [0.21, 0.297], a3: [0.297, 0.42] }[p.size];
    const [w, h] = p.landscape ? [s[1], s[0]] : s;
    const a = 0.2;
    k.box('base', 'plastic-acrylic-clear', w + 0.01, 0.005, 0.09, 0, 0.0025, 0, { r: 0.002 });
    k.box('frame', 'plastic-acrylic-clear', w + 0.01, h + 0.01, 0.004, 0, h / 2 * Math.cos(a) + 0.005, -Math.sin(a) * h / 2 + 0.03, { r: 0.002, rx: -a });
    k.box('paper', 'paper', w, h, 0.0015, 0, h / 2 * Math.cos(a) + 0.005, -Math.sin(a) * h / 2 + 0.033, { r: 0, rx: -a });
    k.box('print', 'paper', w * 0.7, h * 0.15, 0.001, 0, h * 0.7 * Math.cos(a) + 0.005, -Math.sin(a) * h * 0.7 + 0.035, { r: 0, rx: -a, ...C('#2a5d9f') });
    return finish(k);
  },
});

const wallSign = ofp({
  id: 'ofp-room-name-sign', placement: 'wall', elevation: 1.45, ko: '실명판 (회의실 표찰)', en: 'Room name sign',
  params: [P.len('width', '폭', 'Width', 0.3, 0.2, 0.5), P.mat('plate', '판', 'Plate', 'metal-ss-brushed', 'metal'), P.bool('slider', '사용 중 표시', 'Occupied slider', true)],
  tags: ['room sign', 'door sign', 'meeting room sign', 'office sign', '실명판', '표찰', '회의실 표지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.45;
    k.box('plate', p.plate, w, h, 0.006, 0, h / 2, 0.003, { r: 0.004 });
    k.box('text', 'paper-black', w * 0.6, h * 0.18, 0.001, 0, h * 0.62, 0.0065, { r: 0 });
    if (p.slider) {
      k.box('slider', 'plastic-acrylic-black', w * 0.8, h * 0.22, 0.004, 0, h * 0.22, 0.008, { r: 0.002 });
      k.box('slider', 'plastic-abs-gloss-red', w * 0.3, h * 0.16, 0.003, w * 0.2, h * 0.22, 0.011, { r: 0.001 });
    }
    return finish(k);
  },
});

const directory = ofp({
  id: 'ofp-floor-directory-board', placement: 'wall', elevation: 1.0, ko: '층별 안내도', en: 'Floor directory board',
  params: [P.int('rows', '줄 수', 'Rows', 8, 4, 16), P.mat('frame', '틀', 'Frame', 'metal-ss-brushed', 'metal')],
  tags: ['directory board', 'floor directory', 'wayfinding', '층별 안내도', '안내판', '입주사 안내'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.6, rh = 0.06, h = p.rows * rh + 0.15;
    k.box('board', 'plastic-acrylic-black', w, h, 0.012, 0, h / 2, 0.006, { r: 0.004 });
    k.panel('frame', p.frame, frameShape(w + 0.02, h + 0.02, 0.012), 0.02, 0, h / 2, 0.01, { bevel: 0.002 });
    k.box('header', 'paper', w * 0.6, 0.05, 0.001, 0, h - 0.06, 0.0125, { r: 0, ...C('#d0d0d0') });
    for (let i = 0; i < p.rows; i++) {
      k.box('lines', 'paper', w * 0.5, 0.02, 0.001, -w * 0.12, h - 0.13 - i * rh, 0.0125, { r: 0 });
      k.box('lines', 'paper', 0.06, 0.02, 0.001, w * 0.36, h - 0.13 - i * rh, 0.0125, { r: 0, ...C('#f2c200') });
    }
    return finish(k);
  },
});

/* ============================================================ attendance, awards and desk extras */

const timeClock = ofp({
  id: 'ofp-punch-time-clock', placement: 'wall', elevation: 1.1, ko: '출퇴근 기록기 (카드식)', en: 'Punch time clock',
  params: [P.int('cards', '카드 수', 'Cards', 16, 0, 30), P.color('body', '몸체 색', 'Body colour', '#d8d4cc')],
  tags: ['time clock', 'punch clock', 'time card', 'attendance', '출퇴근 기록기', '타임 카드', '근태'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.2, h = 0.26, d = 0.12;
    k.box('body', 'plastic-abs-matte-beige', w, h, d, 0, h / 2, d / 2, { r: 0.012, ...C(p.body) });
    k.box('display', 'screen-matte-off', w * 0.7, 0.05, 0.004, 0, h * 0.78, d + 0.002, { r: 0.002 });
    k.box('slot', 'plastic-abs-matte-black', w * 0.5, 0.006, 0.02, 0, h, d * 0.5, { r: 0 });
    const rackW = 0.3, rackH = Math.max(0.1, Math.ceil(p.cards / 2) * 0.035 + 0.04);
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 + rackW / 2 + 0.03);
      k.box('racks', 'metal-pc-light-grey', rackW * 0.45, rackH, 0.03, x, rackH / 2 - 0.05, 0.015, { r: 0.002 });
      const n = sx < 0 ? Math.ceil(p.cards / 2) : Math.floor(p.cards / 2);
      for (let i = 0; i < n; i++) k.box('cards', 'paper', rackW * 0.4, 0.06, 0.002, x, rackH - 0.05 - 0.01 - i * 0.035, 0.032, { r: 0 });
    }
    return finish(k);
  },
});


const plaques = ofp({
  id: 'ofp-award-plaques-wall', placement: 'wall', elevation: 1.3, ko: '감사패 벽 진열', en: 'Award plaques wall set',
  params: [P.int('count', '개수', 'Count', 4, 1, 8), P.mat('wood', '목재', 'Wood', 'wood-am-walnut-satin', 'wood')],
  tags: ['award plaque', 'plaque', 'recognition', '감사패', '공로패', '상패'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = Math.min(4, p.count), rows = Math.ceil(p.count / 4);
    for (let i = 0; i < p.count; i++) {
      const x = ((i % 4) - (cols - 1) / 2) * 0.3, y = (rows - 1 - Math.floor(i / 4)) * 0.34;
      k.box('boards', p.wood, 0.23, 0.29, 0.02, x, y + 0.145, 0.01, { r: 0.004 });
      k.box('plates', 'metal-gold-brushed', 0.18, 0.22, 0.002, x, y + 0.145, 0.021, { r: 0.002 });
      k.box('text', 'paper-black', 0.12, 0.012, 0.001, x, y + 0.2, 0.0225, { r: 0 });
    }
    return finish(k);
  },
});

const trophies = ofp({
  id: 'ofp-trophy-trio', ko: '트로피 3종', en: 'Trophy trio',
  params: [P.mat('metal', '금속', 'Metal', 'metal-gold-polished', 'metal'), P.len('height', '높이', 'Height', 0.3, 0.18, 0.45)],
  tags: ['trophy', 'cup trophy', 'award', '트로피', '우승컵', '상'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    [[-0.12, 0.8], [0, 1], [0.12, 0.65]].forEach(([x, s]) => {
      const hh = h * s;
      k.box('bases', 'stone-marble-nero-marquina', 0.07 * s + 0.02, hh * 0.18, 0.07 * s + 0.02, x, hh * 0.09, 0, { r: 0.003 });
      k.lathe('cups', p.metal, [[0, hh * 0.18], [0.025 * s, hh * 0.18], [0.008, hh * 0.3], [0.008, hh * 0.5], [0.035 * s + 0.01, hh * 0.62], [0.045 * s + 0.01, hh], [0.04 * s + 0.01, hh], [0, hh * 0.7]], x, 0, 0, { segs: k.seg(20, 8) });
      for (const sx of [-1, 1]) k.tube('cups', p.metal, [[x + sx * (0.035 * s + 0.01), hh * 0.92, 0], [x + sx * (0.06 * s + 0.015), hh * 0.82, 0], [x + sx * (0.03 * s + 0.01), hh * 0.68, 0]], 0.003);
    });
    return finish(k);
  },
});

const certificates = ofp({
  id: 'ofp-framed-certificates', placement: 'wall', elevation: 1.4, ko: '액자 인증서', en: 'Framed certificates',
  params: [P.int('count', '개수', 'Count', 3, 1, 6), P.mat('frame', '액자', 'Frame', 'wood-black', 'wood')],
  tags: ['certificate', 'diploma frame', 'license frame', '인증서', '사업자 등록증', '액자'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.25, h = 0.33;
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * (w + 0.06);
      k.panel('frames', p.frame, frameShape(w, h, 0.02), 0.02, x, h / 2, 0.01, { bevel: 0.002 });
      k.box('paper', 'paper', w - 0.04, h - 0.04, 0.002, x, h / 2, 0.004, { r: 0 });
      k.box('seal', 'metal-gold-matte', 0.03, 0.03, 0.001, x + w * 0.25, h * 0.2, 0.0055, { r: 0.014 });
      k.box('glass', 'glass-clear', w - 0.04, h - 0.04, 0.002, x, h / 2, 0.016, { r: 0 });
    }
    return finish(k);
  },
});

const sanitiser = ofp({
  id: 'ofp-hand-sanitiser-stand', placement: 'floor', ko: '손 소독제 스탠드', en: 'Hand sanitiser stand',
  params: [P.len('height', '높이', 'Height', 1.3, 1.0, 1.5), P.bool('auto', '자동 센서', 'Touchless', true)],
  tags: ['hand sanitiser', 'sanitizer stand', 'hygiene', '손 소독제', '소독제 스탠드', '위생'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height;
    k.box('base', 'metal-pc-white-perforated', 0.3, 0.02, 0.3, 0, 0.01, 0, { r: 0.006 });
    k.box('post', 'metal-ss-brushed', 0.06, h - 0.2, 0.04, 0, 0.02 + (h - 0.2) / 2, -0.02, { r: 0.006 });
    k.box('unit', 'plastic-abs-gloss-white', 0.13, 0.22, 0.1, 0, h - 0.11, 0.02, { r: 0.02 });
    k.box('window', 'plastic-acrylic-smoke', 0.04, 0.08, 0.004, 0, h - 0.08, 0.071, { r: 0.002 });
    if (p.auto) k.box('sensor', 'led-blue', 0.02, 0.006, 0.006, 0, h - 0.21, 0.07, { r: 0.002 });
    else k.box('lever', 'plastic-abs-matte-grey', 0.08, 0.04, 0.02, 0, h - 0.2, 0.07, { r: 0.008 });
    k.box('tray', 'metal-ss-brushed', 0.12, 0.01, 0.1, 0, h * 0.55, 0.03, { r: 0.003 });
    return finish(k);
  },
});

const hangingFileBox = ofp({
  id: 'ofp-hanging-file-box', ko: '행잉 파일 박스', en: 'Hanging file box',
  params: [P.int('files', '파일 수', 'Files', 10, 0, 20), P.color('box', '상자 색', 'Box colour', '#3a3a3a')],
  tags: ['hanging file', 'file box', 'suspension file', '행잉 파일', '파일 박스', '서류 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.37, d = 0.36, h = 0.27, t = 0.004;
    k.box('box', 'plastic-pp-black', w, t, d, 0, t / 2, 0, { r: 0, ...C(p.box) });
    for (const sx of [-1, 1]) k.box('box', 'plastic-pp-black', t, h, d, sx * (w / 2 - t / 2), h / 2, 0, { r: 0, ...C(p.box) });
    for (const sz of [-1, 1]) k.box('box', 'plastic-pp-black', w, h * (sz > 0 ? 0.6 : 1), t, 0, h * (sz > 0 ? 0.3 : 0.5), sz * (d / 2 - t / 2), { r: 0, ...C(p.box) });
    for (let i = 0; i < p.files; i++) {
      const z = -d / 2 + 0.03 + i * ((d - 0.06) / 20);
      k.box('files', 'paper-kraft', w - 0.02, h - 0.03, 0.002, 0, (h - 0.03) / 2 + 0.01, z, { r: 0, ...C(['#3f7a46', '#2a5d9f', '#c9a24a'][i % 3]) });
      k.box('tabs', 'plastic-acrylic-clear', 0.05, 0.02, 0.002, -w / 2 + 0.05 + (i % 5) * 0.06, h - 0.01, z, { r: 0 });
    }
    return finish(k);
  },
});

const drawerTray = ofp({
  id: 'ofp-drawer-organiser-tray', ko: '서랍 정리 트레이', en: 'Drawer organiser tray',
  params: [P.color('tray', '트레이 색', 'Tray colour', '#e8e8e8'), P.int('cells', '칸 수', 'Compartments', 6, 3, 8)],
  tags: ['drawer organizer', 'desk drawer tray', 'stationery tray', '서랍 정리함', '서랍 트레이', '문구 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.36, d = 0.26, h = 0.05, t = 0.004, n = p.cells;
    k.box('tray', 'plastic-pp-white', w, t, d, 0, t / 2, 0, { r: 0.002, ...C(p.tray) });
    for (const sx of [-1, 1]) k.box('tray', 'plastic-pp-white', t, h, d, sx * (w / 2 - t / 2), h / 2, 0, { r: 0, ...C(p.tray) });
    for (const sz of [-1, 0, 1]) k.box('tray', 'plastic-pp-white', w, h, t, 0, h / 2, sz * (d / 2 - t / 2), { r: 0, ...C(p.tray) });
    const top = Math.ceil(n / 2), bot = n - top;
    for (let i = 1; i < top; i++) k.box('tray', 'plastic-pp-white', t, h, d / 2, -w / 2 + (i / top) * w, h / 2, -d / 4, { r: 0, ...C(p.tray) });
    for (let i = 1; i < bot; i++) k.box('tray', 'plastic-pp-white', t, h, d / 2, -w / 2 + (i / bot) * w, h / 2, d / 4, { r: 0, ...C(p.tray) });
    k.rod('pens', 'plastic-abs-gloss-black', [-0.15, 0.012, 0.06], [0.0, 0.012, 0.07], 0.004, { segs: 6 });
    k.box('erasers', 'plastic-rubber-gum', 0.04, 0.012, 0.02, 0.1, 0.01, -0.06, { r: 0.003, ...C('#f4f4f4') });
    return finish(k);
  },
});

const memoBoard = ofp({
  id: 'ofp-monitor-memo-boards', ko: '모니터 메모판', en: 'Monitor memo boards',
  params: [P.len('length', '길이', 'Length', 0.18, 0.12, 0.25), P.color('board', '판 색', 'Board colour', '#d0d6dc')],
  tags: ['monitor memo board', 'side panel', 'sticky note board', '모니터 메모판', '모니터 메모 보드', '포스트잇 보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, gap = 0.62;
    for (const sx of [-1, 1]) {
      k.box('boards', 'plastic-acrylic-clear', L, 0.16, 0.004, sx * (gap / 2 + L / 2), 0.08, 0, { r: 0.004, ...C(p.board) });
      k.box('notes', 'paper', 0.06, 0.06, 0.001, sx * (gap / 2 + L * 0.35), 0.11, 0.0025, { r: 0, ...C('#f6e05e') });
      k.box('notes', 'paper', 0.06, 0.06, 0.001, sx * (gap / 2 + L * 0.7), 0.05, 0.0025, { r: 0, ...C('#f49ac2') });
    }
    return finish(k);
  },
});

const ledDeskLamp = ofp({
  id: 'ofp-led-task-lamp', ko: 'LED 사무용 스탠드', en: 'LED office task lamp',
  params: [P.color('body', '몸체 색', 'Body colour', '#2b2b2b'), P.len('reach', '팔 길이', 'Reach', 0.42, 0.3, 0.6), P.bool('on', '켜짐', 'On', true)],
  tags: ['desk lamp', 'task lamp', 'led lamp', 'office lamp', '스탠드', 'LED 스탠드', '사무용 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.reach;
    k.box('base', 'metal-pc-black-matte', 0.16, 0.02, 0.16, 0, 0.01, 0, { r: 0.006, ...C(p.body) });
    k.rod('arm', 'metal-pc-black-matte', [0, 0.02, -0.05], [0, 0.42, -0.05], 0.009, { segs: 8, ...C(p.body) });
    k.rod('arm', 'metal-pc-black-matte', [0, 0.42, -0.05], [0, 0.44, -0.05 + L], 0.008, { segs: 8, ...C(p.body) });
    k.box('head', 'metal-pc-black-matte', 0.05, 0.015, 0.25, 0, 0.43, -0.05 + L - 0.1, { r: 0.004, ...C(p.body) });
    k.box('diffuser', p.on ? 'light-panel-dim' : 'light-panel-off', 0.04, 0.002, 0.23, 0, 0.422, -0.05 + L - 0.1, { r: 0 });
    k.light(0, 0.4, -0.05 + L - 0.1, { color: '#fff2dc', intensity: p.on ? 0.4 : 0, distance: 2, type: 'spot', angle: 1.0 });
    return finish(k);
  },
});

const notebooks = ofp({
  id: 'ofp-spiral-notebook-stack', ko: '스프링 노트 묶음', en: 'Spiral notebook stack',
  params: [P.int('count', '권 수', 'Count', 4, 1, 8), P.pick('size', '크기', 'Size', 'a5', [['a5', 'A5', 'A5'], ['a4', 'A4', 'A4'], ['b5', 'B5', 'B5']])],
  tags: ['notebook', 'spiral notebook', 'notepad', '노트', '스프링 노트', '공책'],
  build: (p, ctx) => {
    const k = new Kit(ctx), [w, d] = { a5: [0.148, 0.21], a4: [0.21, 0.297], b5: [0.182, 0.257] }[p.size];
    for (let i = 0; i < p.count; i++) {
      const y = i * 0.012, ry = ((i * 5) % 7 - 3) * 0.04;
      k.box('covers', 'paper-cardboard', w, 0.01, d, 0, y + 0.005, 0, { r: 0.001, ry, ...C(BINDER_COLS[(i * 3) % BINDER_COLS.length]) });
      k.box('spiral', 'metal-chrome', 0.006, 0.012, d * 0.95, -w / 2 - 0.002, y + 0.006, 0, { r: 0.003, ry });
    }
    return finish(k);
  },
});

const ballotBox = ofp({
  id: 'ofp-clear-ballot-box', ko: '투명 투표함', en: 'Clear ballot box',
  params: [P.len('size', '크기', 'Size', 0.4, 0.3, 0.6), P.int('papers', '용지 수', 'Ballots', 30, 0, 80)],
  tags: ['ballot box', 'voting box', 'raffle box', '투표함', '응모함', '추첨함'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('box', 'plastic-acrylic-clear', s, s, s, 0, s / 2, 0, { r: 0.004 });
    k.box('slot', 'plastic-black', s * 0.4, 0.003, 0.015, 0, s + 0.001, 0, { r: 0 });
    for (let i = 0; i < p.papers; i++) k.box('papers', 'paper', 0.06, 0.002, 0.04, ((i * 0.37) % 1 - 0.5) * s * 0.8, 0.005 + Math.floor(i / 10) * 0.004, ((i * 0.61) % 1 - 0.5) * s * 0.8, { r: 0, ry: i * 0.7 });
    k.box('label', 'paper', s * 0.5, s * 0.15, 0.002, 0, s * 0.75, s / 2 + 0.002, { r: 0 });
    return finish(k);
  },
});

export const ITEMS = [
  timeClock, plaques, trophies, certificates, sanitiser, hangingFileBox, drawerTray, memoBoard, ledDeskLamp, notebooks, ballotBox,
  waterCooler, bottleRack, capsuleMachine, kettle, mugTree, cupDispenser,
  whiteboardWall, glassBoard, mobileWhiteboard, corkBoard, planner, noticeCase, wallClock, worldClocks,
  ipPhone, conferencePhone, gooseneckMic, tableTent, projectorScreen, tabletopFlipchart,
  extinguisher, extinguisherCabinet, firstAid, aed, exitSign, fireAlarm, eyeWash,
  officeSafe, keyCabinet, cashBox, mailCart, kickStool, stepLadder, coatStand, umbrellaStand, lockerTags, brochureRack,
  deskFan, deskPurifier, heater, desktopPlantShelf, docCamera, signHolder, wallSign, directory,
];
