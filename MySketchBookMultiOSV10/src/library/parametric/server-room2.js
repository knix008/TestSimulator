// Server room (서버실) category, part 2: the room around the racks — precision cooling (CRAC / CRAH,
// in-row, ceiling units, chillers), raised floor (tiles, grates, pedestals, ramps, steps), cable
// ways (ladder / basket / fibre raceways, busway, drops), power (PDU cabinets, UPS frames, battery
// strings, ATS, panels, EPO), fire suppression and detection, security (cages, mantrap, readers,
// cameras), operations (crash cart, server lift, workbench, KVM console desk, monitoring wall,
// spares), environment sensors, lighting and signs.
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { C } from './accessories-plus.js';
import { srv, U, row, device } from './server-room.js';

const PI = Math.PI;

/** Louvre / grille lines across a w × h face at zf (centre x, y). */
function louvres(k, role, mat, w, h, x, y, zf, n) {
  for (let i = 0; i < n; i++) k.box(role, mat, w, 0.006, 0.012, x, y - h / 2 + (i + 0.5) * (h / n), zf + 0.006, { r: 0, rx: -0.5 });
}

/** A stand-alone cabinet unit body with a control display. */
function cabinet(k, w, h, d, { body = 'metal-pc-light-grey', color, display = true, plinth = 0.1 } = {}) {
  k.box('plinth', 'metal-pc-black-matte', w - 0.02, plinth, d - 0.02, 0, plinth / 2, 0, { r: 0.002 });
  k.box('body', body, w, h - plinth, d, 0, plinth + (h - plinth) / 2, 0, { r: 0.006, ...(color ? C(color) : {}) });
  for (let i = 1; i < Math.round(w / 0.6); i++) k.box('seams', 'metal-pc-black-matte', 0.004, h - plinth - 0.02, 0.002, -w / 2 + i * (w / Math.round(w / 0.6)), plinth + (h - plinth) / 2, d / 2 + 0.001, { r: 0 });
  if (display) k.box('display', 'screen-on-dark', 0.18, 0.12, 0.004, -w / 2 + 0.2, h - 0.35, d / 2 + 0.002, { r: 0.002 });
}

/* ============================================================ cooling */

const crac = srv({
  id: 'srv-crac-downflow', ko: '항온항습기 (하부 토출)', en: 'Precision air conditioner (downflow CRAC)',
  params: [P.int('modules', '모듈 수', 'Modules', 3, 1, 4), P.len('height', '높이', 'Height', 1.95, 1.8, 2.2)],
  tags: ['crac', 'precision air conditioner', 'downflow', 'computer room air conditioner', '항온항습기', '정밀 에어컨', '서버실 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.85 * p.modules, h = p.height, d = 0.9;
    cabinet(k, w, h, d, { color: '#e4e6e8' });
    for (let i = 0; i < p.modules; i++) louvres(k, 'grille', 'metal-pc-anthracite', 0.65, 0.5, -w / 2 + 0.425 + i * 0.85, h - 0.4, d / 2, 8);
    k.box('handles', 'metal-chrome', 0.02, 0.15, 0.02, w / 2 - 0.05, h / 2, d / 2 + 0.012, { r: 0.004 });
    return finish(k);
  },
});

const cracUp = srv({
  id: 'srv-crac-upflow-ducted', ko: '항온항습기 (상부 토출, 덕트)', en: 'Upflow CRAC with duct',
  params: [P.len('duct', '덕트 높이', 'Duct height', 0.6, 0.2, 1.0), P.color('body', '몸체 색', 'Body colour', '#e4e6e8')],
  tags: ['crac', 'upflow', 'ducted air conditioner', '항온항습기', '상부 토출', '덕트형 항온항습기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 1.7, h = 1.95, d = 0.85;
    cabinet(k, w, h, d, { color: p.body });
    louvres(k, 'grille', 'metal-pc-anthracite', w - 0.2, 0.6, 0, 0.6, d / 2, 10);
    k.box('duct', 'metal-steel-galvanised', w - 0.2, p.duct, d - 0.2, 0, h + p.duct / 2, 0, { r: 0.004 });
    return finish(k);
  },
});

const inRow = srv({
  id: 'srv-in-row-cooler', ko: '인로우 냉방기', en: 'In-row cooling unit',
  params: [P.len('width', '폭', 'Width', 0.3, 0.3, 0.6), P.pick('door', '전면', 'Front', 'grille', [['grille', '그릴', 'Grille'], ['fans', '팬 노출', 'Fans']])],
  tags: ['in-row cooler', 'row cooling', 'inrow', '인로우 냉방기', '랙 사이 냉방', '열 관리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 42 * U + 0.17, d = 1.0;
    cabinet(k, w, h, d, { body: 'metal-pc-black-matte', display: false, plinth: 0.05 });
    if (p.door === 'grille') k.box('grille', 'metal-pc-black-perforated', w - 0.06, h - 0.3, 0.004, 0, h / 2, d / 2 + 0.003, { r: 0 });
    else for (let i = 0; i < 6; i++) k.cyl('grille', 'metal-pc-black-perforated', w * 0.38, w * 0.38, 0.03, 0, 0.25 + i * (h - 0.4) / 6, d / 2, { rx: PI / 2, segs: k.seg(20, 8) });
    k.box('display', 'screen-on-dark', w * 0.6, 0.06, 0.004, 0, h - 0.1, d / 2 + 0.004, { r: 0.002 });
    return finish(k);
  },
});

const ceilingCooler = srv({
  id: 'srv-overhead-cooling-module', placement: 'ceiling', elevation: 2.9 - 0.35, ko: '천장형 국소 냉방 모듈', en: 'Overhead cooling module',
  params: [P.len('length', '길이', 'Length', 1.8, 1.2, 2.4), P.bool('pipes', '배관', 'Pipes', true)],
  tags: ['overhead cooling', 'ceiling cooler', 'spot cooling', '천장형 냉방', '국소 냉방', '오버헤드 쿨러'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, w = 0.6, h = 0.3;
    k.box('body', 'metal-pc-light-grey', L, h, w, 0, h / 2 + 0.05, 0, { r: 0.006 });
    k.box('grille', 'metal-pc-black-perforated', L - 0.1, 0.004, w - 0.1, 0, 0.048, 0, { r: 0 });
    for (const x of [-L * 0.35, L * 0.35]) k.rod('hangers', 'metal-steel-galvanised', [x, h + 0.05, 0], [x, h + 0.05 + 0.05, 0], 0.006, { segs: 6 });
    if (p.pipes) for (const z of [-0.1, 0.1]) k.rod('pipes', 'metal-copper-satin', [L / 2 - 0.1, h + 0.05, z], [L / 2 - 0.1, h + 0.1, z], 0.012, { segs: 8 });
    return finish(k);
  },
});

const chiller = srv({
  id: 'srv-outdoor-chiller', ko: '실외 냉각기 (칠러)', en: 'Outdoor chiller',
  params: [P.int('fans', '팬 수', 'Fans', 4, 2, 4), P.color('body', '몸체 색', 'Body colour', '#d8dadc')],
  tags: ['chiller', 'dry cooler', 'condenser', '칠러', '냉각기', '실외기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.fans, L = n * 0.9 + 0.2, w = 1.1, h = 1.6;
    k.box('body', 'metal-pc-light-grey', L, h - 0.1, w, 0, 0.1 + (h - 0.1) / 2, 0, { r: 0.006, ...C(p.body) });
    for (const sz of [-1, 1]) k.box('coil', 'metal-al-slotted', L - 0.1, h * 0.6, 0.004, 0, h * 0.45, sz * (w / 2 + 0.002), { r: 0 });
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.55 + i * 0.9;
      k.cyl('fans', 'metal-black-mesh', 0.38, 0.38, 0.06, x, h, 0, { segs: k.seg(24, 8) });
      k.add('fans', 'metal-pc-black-matte', T(new THREE.TorusGeometry(0.38, 0.02, 6, k.seg(24, 8)), x, h + 0.06, 0, PI / 2));
    }
    for (const sx of [-1, 1]) k.box('plinth', 'metal-steel-galvanised', 0.1, 0.1, w, sx * (L / 2 - 0.1), 0.05, 0, { r: 0.002 });
    return finish(k);
  },
});

const spotCooler = srv({
  id: 'srv-portable-spot-cooler', ko: '이동식 스팟 쿨러', en: 'Portable spot cooler',
  params: [P.int('ducts', '토출구', 'Nozzles', 2, 1, 3), P.color('body', '몸체 색', 'Body colour', '#f0f0f0')],
  tags: ['spot cooler', 'portable air conditioner', 'emergency cooling', '스팟 쿨러', '이동식 에어컨', '비상 냉방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.5, d = 0.55, h = 1.15;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2 + 0.06, 0, { r: 0.03, ...C(p.body) });
    louvres(k, 'grille', 'plastic-abs-matte-grey', w - 0.1, 0.4, 0, 0.45, d / 2, 8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('casters', 'rubber-black', 0.03, 0.03, 0.025, sx * (w / 2 - 0.06) + 0.0125, 0.03, sz * (d / 2 - 0.06), { rz: PI / 2, segs: 10 });
    for (let i = 0; i < p.ducts; i++) {
      const x = (i - (p.ducts - 1) / 2) * 0.15;
      k.tube('ducts', 'plastic-abs-matte-grey', [[x, h + 0.06, 0], [x, h + 0.4, 0.05], [x, h + 0.6, 0.3]], 0.05);
    }
    k.box('display', 'screen-on-dark', 0.1, 0.04, 0.004, 0, h - 0.06, d / 2 + 0.002, { r: 0.002 });
    return finish(k);
  },
});

const dehumid = srv({
  id: 'srv-industrial-dehumidifier', ko: '산업용 제습기', en: 'Industrial dehumidifier',
  params: [P.len('height', '높이', 'Height', 0.9, 0.7, 1.2), P.color('body', '몸체 색', 'Body colour', '#2a5d9f')],
  tags: ['dehumidifier', 'humidity control', 'industrial', '제습기', '산업용 제습기', '습도 관리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.45, d = 0.4;
    k.box('body', 'metal-pc-navy', w, h, d, 0, h / 2 + 0.06, 0, { r: 0.02, ...C(p.body) });
    k.box('grille', 'metal-pc-black-perforated', w - 0.08, h * 0.4, 0.004, 0, h * 0.35, d / 2 + 0.002, { r: 0 });
    k.box('display', 'screen-on-dark', 0.12, 0.05, 0.004, 0, h * 0.85, d / 2 + 0.002, { r: 0.002 });
    k.bentTube('handles', 'metal-chrome', [[-w / 2 + 0.05, h + 0.06, -d / 2 + 0.05], [-w / 2 + 0.05, h + 0.2, -d / 2 + 0.05], [w / 2 - 0.05, h + 0.2, -d / 2 + 0.05], [w / 2 - 0.05, h + 0.06, -d / 2 + 0.05]], 0.012, 0.04);
    for (const sx of [-1, 1]) k.cyl('casters', 'rubber-black', 0.05, 0.05, 0.03, sx * (w / 2 + 0.015) + 0.015, 0.05, -d / 4, { rz: PI / 2, segs: 12 });
    return finish(k);
  },
});

/* ============================================================ raised floor */

const tile = (id, ko, en, kind, tags) => srv({
  id, ko, en,
  params: [P.int('cols', '가로 장 수', 'Tiles across', 1, 1, 6), P.int('rows', '세로 장 수', 'Tiles deep', 1, 1, 6), P.len('height', '바닥 높이', 'Floor height', 0.04, 0.03, 0.6)],
  tags: [...tags, 'raised floor', 'access floor', '이중 바닥', '액세스 플로어', '서버실'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = 0.6, H = p.height;
    for (let c = 0; c < p.cols; c++) for (let r = 0; r < p.rows; r++) {
      const x = (c - (p.cols - 1) / 2) * s, z = (r - (p.rows - 1) / 2) * s;
      if (H > 0.1) k.cyl('pedestals', 'metal-steel-galvanised', 0.012, 0.012, H - 0.035, x - s / 2 + 0.02, 0, z - s / 2 + 0.02, { segs: 6 });
      if (kind === 'solid') k.box('tiles', 'floor-linoleum-sand', s - 0.003, 0.035, s - 0.003, x, H - 0.0175, z, { r: 0.001, ...C('#d6d3cc') });
      else if (kind === 'perf') { k.box('tiles', 'metal-pc-light-grey', s - 0.003, 0.03, s - 0.003, x, H - 0.015, z, { r: 0.001 }); k.box('grilles', 'metal-pc-white-perforated', s - 0.08, 0.002, s - 0.08, x, H + 0.0005, z, { r: 0 }); }
      else if (kind === 'grate') { k.box('tiles', 'metal-al-raw', s - 0.003, 0.03, s - 0.003, x, H - 0.015, z, { r: 0.001 }); k.box('grilles', 'metal-steel-grating', s - 0.04, 0.002, s - 0.04, x, H + 0.0005, z, { r: 0 }); k.box('dampers', 'metal-pc-black-matte', s - 0.06, 0.01, s - 0.06, x, H - 0.035, z, { r: 0 }); }
      else if (kind === 'cutout') { k.box('tiles', 'floor-linoleum-sand', s - 0.003, 0.035, s - 0.003, x, H - 0.0175, z, { r: 0.001, ...C('#d6d3cc') }); k.box('grilles', 'rubber-black', 0.2, 0.004, 0.08, x, H + 0.001, z + 0.1, { r: 0.004 }); }
      else if (kind === 'glass') { k.box('tiles', 'metal-al-raw', s - 0.003, 0.035, s - 0.003, x, H - 0.0175, z, { r: 0.001 }); k.box('glass', 'glass-laminated-clear', s - 0.06, 0.004, s - 0.06, x, H + 0.001, z, { r: 0 }); }
    }
    if (H > 0.1) {
      const W = p.cols * s, D = p.rows * s;
      for (let c = 0; c <= p.cols; c++) k.box('stringers', 'metal-steel-galvanised', 0.02, 0.025, D, -W / 2 + c * s, H - 0.05, 0, { r: 0 });
      k.box('base', 'floor-concrete-mid', W, 0.005, D, 0, 0.0025, 0, { r: 0 });
    }
    return finish(k);
  },
});

const tiles = [
  tile('srv-floor-tile-solid', '이중 바닥 패널 (일반)', 'Raised floor tile (solid)', 'solid', ['floor tile', 'solid panel', '바닥 패널', '일반 패널']),
  tile('srv-floor-tile-perforated', '이중 바닥 패널 (타공 25%)', 'Raised floor tile (perforated)', 'perf', ['perforated tile', 'airflow tile', '타공 패널', '통풍 패널']),
  tile('srv-floor-tile-grate', '이중 바닥 패널 (그레이팅 56%)', 'Raised floor grate tile with damper', 'grate', ['grate tile', 'high flow', 'damper', '그레이팅 패널', '댐퍼']),
  tile('srv-floor-tile-cutout', '케이블 인입 패널 (그로밋)', 'Cable cut-out tile with grommet', 'cutout', ['cable cutout', 'grommet', '케이블 인입', '그로밋']),
  tile('srv-floor-tile-glass', '이중 바닥 유리 패널', 'Glass raised floor panel', 'glass', ['glass tile', 'inspection panel', '유리 패널', '점검창']),
];

const pedestalSection = srv({
  id: 'srv-raised-floor-section', ko: '이중 바닥 단면 (페데스탈 노출)', en: 'Raised floor cut-away section',
  params: [P.len('height', '바닥 높이', 'Floor height', 0.45, 0.2, 0.8), P.int('size', '패널 수', 'Panels', 3, 2, 5), P.bool('cables', '하부 배선', 'Under-floor cables', true)],
  tags: ['raised floor section', 'pedestal', 'under floor', '이중 바닥 단면', '페데스탈', '바닥 하부 배선'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = 0.6, n = p.size, H = p.height, W = n * s;
    for (let c = 0; c <= n; c++) for (let r = 0; r <= n; r++) {
      const x = -W / 2 + c * s, z = -W / 2 + r * s;
      k.box('pedestals', 'metal-steel-galvanised', 0.1, 0.004, 0.1, x, 0.002, z, { r: 0 });
      k.cyl('pedestals', 'metal-steel-galvanised', 0.012, 0.012, H - 0.04, x, 0, z, { segs: 6 });
      k.box('pedestals', 'metal-steel-galvanised', 0.08, 0.006, 0.08, x, H - 0.038, z, { r: 0 });
    }
    for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) if (c + r < n + 1 && !(c === n - 1 && r === n - 1)) k.box('tiles', 'floor-linoleum-sand', s - 0.003, 0.035, s - 0.003, -W / 2 + (c + 0.5) * s, H - 0.0175, -W / 2 + (r + 0.5) * s, { r: 0.001, ...C('#d6d3cc') });
    k.box('base', 'floor-concrete-mid', W + 0.1, 0.005, W + 0.1, 0, 0.0025, 0, { r: 0 });
    if (p.cables) {
      k.box('trays', 'metal-ss-mesh', W, 0.06, 0.3, 0, 0.1, 0, { r: 0 });
      for (let i = 0; i < 6; i++) k.rod('cables', 'plastic-abs-gloss-blue', [-W / 2, 0.12, -0.1 + i * 0.04], [W / 2, 0.12, -0.1 + i * 0.04], 0.008, { segs: 6, ...C(i % 2 ? '#2a7de1' : '#e0b020') });
    }
    return finish(k);
  },
});

const ramp = srv({
  id: 'srv-raised-floor-ramp', ko: '이중 바닥 경사로', en: 'Raised floor access ramp',
  params: [P.len('height', '바닥 높이', 'Floor height', 0.45, 0.15, 0.5), P.len('width', '폭', 'Width', 1.2, 0.9, 1.8), P.bool('rails', '난간', 'Handrails', true)],
  tags: ['ramp', 'access ramp', 'raised floor ramp', '경사로', '이중 바닥 경사로', '장비 반입'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, W = p.width, L = H * 8.33;
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0), new THREE.Vector2(L, H), new THREE.Vector2(0, 0.01)]);
    k.panel('ramp', 'metal-al-tread', s, W, -L / 2, 0, 0, { ry: 0, bevel: 0.002 });
    if (p.rails) for (const sz of [-1, 1]) {
      k.rod('rails', 'metal-ss-satin', [-L / 2, 0.9, sz * W / 2], [L / 2, H + 0.9, sz * W / 2], 0.02, { segs: 8 });
      for (const t of [0.05, 0.5, 0.95]) k.rod('rails', 'metal-ss-satin', [-L / 2 + t * L, t * H, sz * W / 2], [-L / 2 + t * L, t * H + 0.9, sz * W / 2], 0.018, { segs: 8 });
    }
    return finish(k);
  },
});

const tileLifter = srv({
  id: 'srv-floor-tile-lifter', ko: '바닥 패널 흡착 리프터', en: 'Floor tile suction lifter',
  params: [P.int('cups', '흡착판 수', 'Cups', 2, 1, 3)],
  tags: ['tile lifter', 'suction lifter', 'floor puller', '패널 리프터', '흡착기', '바닥 패널 공구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.cups, L = n * 0.13;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.13;
      k.cyl('cups', 'rubber-black', 0.06, 0.06, 0.015, x, 0, 0, { segs: k.seg(20, 8) });
      k.box('levers', 'plastic-abs-gloss-red', 0.05, 0.02, 0.02, x, 0.03, 0.03, { r: 0.006 });
    }
    k.box('handle', 'plastic-abs-gloss-black', L, 0.04, 0.03, 0, 0.06, 0, { r: 0.012 });
    return finish(k);
  },
});

/* ============================================================ cable ways */

const trayItem = (id, ko, en, kind, tags) => srv({
  id, placement: 'ceiling', elevation: 2.9 - 0.45, ko, en,
  params: [P.len('length', '길이', 'Length', 2.4, 1.0, 3.0), P.len('width', '폭', 'Width', 0.3, 0.1, 0.6), P.int('cables', '케이블 수', 'Cables', 8, 0, 20)],
  tags: [...tags, 'cable tray', 'overhead', '케이블 트레이', '천장 배선', '서버실'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, W = p.width, hang = 0.35;
    if (kind === 'ladder') {
      for (const sz of [-1, 1]) k.box('tray', 'metal-steel-galvanised', L, 0.08, 0.004, 0, 0.04, sz * W / 2, { r: 0 });
      for (let i = 0; i <= Math.round(L / 0.3); i++) k.box('tray', 'metal-steel-galvanised', 0.03, 0.01, W, -L / 2 + i * (L / Math.round(L / 0.3)), 0.005, 0, { r: 0 });
    } else if (kind === 'basket') {
      k.box('tray', 'metal-ss-mesh', L, 0.004, W, 0, 0.002, 0, { r: 0 });
      for (const sz of [-1, 1]) k.box('tray', 'metal-ss-mesh', L, 0.06, 0.004, 0, 0.03, sz * W / 2, { r: 0 });
    } else if (kind === 'fibre') {
      k.box('tray', 'plastic-pvc-white', L, 0.004, W, 0, 0.002, 0, { r: 0, ...C('#f2c200') });
      for (const sz of [-1, 1]) k.box('tray', 'plastic-pvc-white', L, 0.1, 0.004, 0, 0.05, sz * W / 2, { r: 0, ...C('#f2c200') });
    } else if (kind === 'solid') {
      k.box('tray', 'metal-steel-galvanised', L, 0.003, W, 0, 0.0015, 0, { r: 0 });
      for (const sz of [-1, 1]) k.box('tray', 'metal-steel-galvanised', L, 0.1, 0.003, 0, 0.05, sz * W / 2, { r: 0 });
      k.box('tray', 'metal-steel-galvanised', L, 0.003, W, 0, 0.1, 0, { r: 0 });
    }
    const cols = ['#2a7de1', '#e0b020', '#d9342b', '#2fb04a', '#f2f2f2', '#7a4a9a'];
    for (let i = 0; i < p.cables; i++) k.box('cables', 'plastic-abs-gloss-blue', L - 0.05, 0.012, 0.012, 0, 0.012 + Math.floor(i / 8) * 0.013, -W / 2 + 0.02 + (i % 8) * ((W - 0.04) / 7), { r: 0, ...C(kind === 'fibre' ? '#f2c200' : cols[i % cols.length]) });
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) for (const sz of [-1, 1]) k.rod('rods', 'metal-steel-galvanised', [x, 0, sz * (W / 2 + 0.02)], [x, hang, sz * (W / 2 + 0.02)], 0.006, { segs: 6 });
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) k.box('rods', 'metal-steel-galvanised', 0.04, 0.04, W + 0.08, x, -0.02, 0, { r: 0 });
    return finish(k);
  },
});

const trays = [
  trayItem('srv-ladder-cable-tray', '사다리형 케이블 트레이', 'Ladder cable tray', 'ladder', ['ladder tray', 'cable ladder', '사다리형 트레이', '래더']),
  trayItem('srv-wire-basket-tray', '와이어 바스켓 트레이', 'Wire basket cable tray', 'basket', ['basket tray', 'wire mesh tray', '바스켓 트레이', '메쉬 트레이']),
  trayItem('srv-fibre-raceway', '광케이블 레이스웨이 (노란색)', 'Fibre optic raceway', 'fibre', ['fibre raceway', 'fiber runner', 'optical', '광 레이스웨이', '광케이블 덕트']),
  trayItem('srv-covered-cable-trunking', '덮개형 케이블 덕트', 'Covered cable trunking', 'solid', ['cable trunking', 'covered tray', 'duct', '케이블 덕트', '덮개형 트레이']),
];

const busway = srv({
  id: 'srv-overhead-busway', placement: 'ceiling', elevation: 2.9 - 0.4, ko: '천장 버스덕트와 탭박스', en: 'Overhead busway with tap-off boxes',
  params: [P.len('length', '길이', 'Length', 2.4, 1.2, 3.0), P.int('boxes', '탭박스 수', 'Tap-off boxes', 3, 0, 6)],
  tags: ['busway', 'busbar', 'tap off box', 'overhead power', '버스덕트', '부스바', '천장 전원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('bus', 'metal-pc-light-grey', L, 0.12, 0.1, 0, 0.3, 0, { r: 0.004 });
    for (let i = 0; i < p.boxes; i++) {
      const x = -L / 2 + (i + 0.5) * (L / Math.max(1, p.boxes));
      k.box('boxes', 'metal-pc-light-grey', 0.25, 0.22, 0.18, x, 0.11, 0, { r: 0.006, ...C('#d0d4d8') });
      k.box('leds', 'led-green', 0.01, 0.01, 0.003, x + 0.08, 0.15, 0.091, { r: 0 });
      k.tube('cords', 'rubber-black', [[x, 0, 0], [x, -0.2, 0.02], [x + 0.02, -0.4, 0.03]], 0.012);
    }
    for (const x of [-L / 2 + 0.15, L / 2 - 0.15]) k.rod('rods', 'metal-steel-galvanised', [x, 0.36, 0], [x, 0.4, 0], 0.006, { segs: 6 });
    return finish(k);
  },
});

const cableDrop = srv({
  id: 'srv-cable-waterfall-drop', placement: 'ceiling', elevation: 2.9 - 0.9, ko: '케이블 낙하 가이드 (워터폴)', en: 'Cable waterfall drop',
  params: [P.int('cables', '케이블 수', 'Cables', 12, 2, 24), P.len('drop', '낙하 길이', 'Drop', 0.8, 0.3, 1.2)],
  tags: ['waterfall', 'cable drop', 'bend radius', '케이블 낙하', '워터폴', '케이블 가이드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), D = p.drop, W = 0.3;
    k.box('guide', 'plastic-pvc-white', W, 0.02, 0.15, 0, D, 0, { r: 0.006, ...C('#f2c200') });
    for (let i = 0; i < p.cables; i++) {
      const z = -W / 2 + 0.02 + (i % 12) * ((W - 0.04) / 11);
      k.tube('cables', 'plastic-abs-gloss-blue', [[z, D + 0.02, -0.15], [z, D + 0.02, 0.02], [z, D - 0.1, 0.08], [z, 0, 0.1]], 0.004);
    }
    return finish(k);
  },
});

const verticalMgr = srv({
  id: 'srv-vertical-cable-manager', ko: '수직 케이블 정리대 (단독)', en: 'Vertical cable manager',
  params: [P.len('width', '폭', 'Width', 0.25, 0.15, 0.35), P.int('fingers', '핑거 수', 'Fingers', 20, 8, 40), P.bool('door', '덮개', 'Cover door', false)],
  tags: ['vertical cable manager', 'cable channel', 'finger duct', '수직 케이블 정리대', '케이블 채널', '랙 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = 42 * U + 0.17, D = 0.6;
    k.box('body', 'metal-pc-black-matte', W, H, 0.02, 0, H / 2, -D / 2, { r: 0.002 });
    k.box('body', 'metal-pc-black-matte', W, 0.08, D, 0, 0.04, 0, { r: 0.002 });
    k.box('body', 'metal-pc-black-matte', W, 0.03, D, 0, H - 0.015, 0, { r: 0.002 });
    for (let i = 0; i < p.fingers; i++) for (const sx of [-1, 1]) k.box('fingers', 'plastic-black', 0.012, 0.03, 0.1, sx * (W / 2 - 0.006), 0.15 + i * ((H - 0.3) / (p.fingers - 1)), D / 2 - 0.05, { r: 0.003 });
    if (p.door) k.box('door', 'metal-pc-black-matte', W, H - 0.1, 0.01, 0, H / 2, D / 2, { r: 0.002 });
    return finish(k);
  },
});

/* ============================================================ power */

const pduCabinet = srv({
  id: 'srv-power-distribution-cabinet', ko: '전원 분배 캐비닛 (PDU)', en: 'Power distribution unit cabinet',
  params: [P.len('width', '폭', 'Width', 1.0, 0.6, 1.6), P.bool('meter', '계측 화면', 'Meter screen', true)],
  tags: ['pdu cabinet', 'power distribution', 'floor pdu', '분전반', '전원 분배 캐비닛', '배전반'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 1.95, d = 0.8;
    cabinet(k, w, h, d, { color: '#e4e6e8', display: p.meter });
    louvres(k, 'grille', 'metal-pc-anthracite', w * 0.6, 0.3, 0, 0.35, d / 2, 6);
    k.box('handles', 'metal-chrome', 0.02, 0.15, 0.02, w / 2 - 0.05, h / 2, d / 2 + 0.012, { r: 0.004 });
    k.box('labels', 'paper', 0.16, 0.06, 0.002, 0, h - 0.15, d / 2 + 0.002, { r: 0, ...C('#f2c200') });
    return finish(k);
  },
});

const bigUps = srv({
  id: 'srv-modular-ups-frame', ko: '모듈형 대용량 UPS', en: 'Modular UPS frame',
  params: [P.int('modules', '전력 모듈 수', 'Power modules', 6, 2, 10), P.color('body', '몸체 색', 'Body colour', '#1e1f22')],
  tags: ['modular ups', 'ups frame', 'data center ups', '모듈형 UPS', '대용량 UPS', '무정전 전원장치'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.6, h = 2.0, d = 1.0;
    cabinet(k, w, h, d, { body: 'metal-pc-black-matte', color: p.body });
    for (let i = 0; i < p.modules; i++) {
      const y = 0.2 + i * 0.13;
      k.box('modules', 'metal-pc-anthracite', w - 0.08, 0.12, 0.012, 0, y + 0.06, d / 2 + 0.006, { r: 0.002 });
      k.box('leds', 'led-green', 0.008, 0.008, 0.003, w / 2 - 0.08, y + 0.08, d / 2 + 0.013, { r: 0 });
      k.box('modules', 'metal-pc-black-perforated', w * 0.5, 0.08, 0.003, -0.05, y + 0.06, d / 2 + 0.013, { r: 0 });
    }
    return finish(k);
  },
});

const batteryRack = srv({
  id: 'srv-battery-string-rack', ko: 'UPS 배터리 랙 (개방형)', en: 'Open UPS battery rack',
  params: [P.int('tiers', '단 수', 'Tiers', 4, 2, 6), P.int('blocks', '단당 배터리', 'Blocks per tier', 8, 4, 12)],
  tags: ['battery rack', 'vrla batteries', 'battery string', '배터리 랙', '축전지', 'UPS 배터리'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.blocks, L = n * 0.17 + 0.1, step = 0.32, h = p.tiers * step + 0.1, d = 0.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-black-matte', 0.04, h, 0.04, sx * (L / 2 - 0.02), h / 2, sz * (d / 2 - 0.02), { r: 0.002 });
    for (let t = 0; t < p.tiers; t++) {
      const y = 0.08 + t * step;
      k.box('frame', 'metal-pc-black-matte', L, 0.02, d, 0, y, 0, { r: 0.002 });
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + 0.1 + i * 0.17;
        k.box('batteries', 'plastic-abs-matte-grey', 0.16, 0.22, 0.17, x, y + 0.12, 0, { r: 0.006 });
        k.box('lids', 'plastic-abs-matte-black', 0.16, 0.02, 0.17, x, y + 0.24, 0, { r: 0.004 });
      }
      k.box('bus', 'metal-copper-satin', L - 0.15, 0.008, 0.02, 0, y + 0.255, 0.05, { r: 0 });
    }
    return finish(k);
  },
});

const ats = srv({
  id: 'srv-transfer-switch', placement: 'wall', elevation: 0.5, ko: '자동 절체 스위치 (ATS)', en: 'Automatic transfer switch',
  params: [P.len('height', '높이', 'Height', 1.0, 0.6, 1.4), P.color('body', '몸체 색', 'Body colour', '#d0d4d8')],
  tags: ['ats', 'transfer switch', 'generator switch', '자동 절체 스위치', 'ATS', '절체반'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.6, d = 0.3;
    k.box('body', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.006, ...C(p.body) });
    k.box('display', 'screen-on-dark', 0.14, 0.08, 0.004, 0, h * 0.75, d + 0.002, { r: 0.002 });
    for (const [x, m] of [[-0.12, 'led-green'], [0.12, 'led-red']]) k.cyl('lamps', m, 0.018, 0.018, 0.01, x, h * 0.55, d, { rx: PI / 2, segs: 12 });
    k.box('handles', 'metal-chrome', 0.02, 0.12, 0.02, w / 2 - 0.04, h / 2, d + 0.012, { r: 0.004 });
    k.box('labels', 'paper', 0.2, 0.05, 0.002, 0, h * 0.9, d + 0.002, { r: 0, ...C('#f2c200') });
    return finish(k);
  },
});

const panelBoard = srv({
  id: 'srv-electrical-panelboard', placement: 'wall', elevation: 0.6, ko: '분전반 (차단기 함)', en: 'Electrical panelboard',
  params: [P.int('breakers', '차단기 수', 'Breakers', 24, 6, 42), P.bool('open', '문 열림', 'Door open', true)],
  tags: ['panelboard', 'breaker panel', 'distribution board', '분전반', '차단기', '전기 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx), rows = Math.ceil(p.breakers / 2), w = 0.5, h = 0.25 + rows * 0.04, d = 0.15;
    k.box('body', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.004 });
    for (let i = 0; i < p.breakers; i++) k.box('breakers', 'plastic-abs-matte-black', 0.09, 0.03, 0.03, (i % 2 ? 1 : -1) * 0.07, 0.1 + Math.floor(i / 2) * 0.04, d + 0.01, { r: 0.002 });
    k.box('main', 'plastic-abs-matte-black', 0.16, 0.08, 0.04, 0, h - 0.07, d + 0.015, { r: 0.004 });
    if (p.open) k.box('door', 'metal-pc-light-grey', 0.012, h, w, -w / 2 - 0.006, h / 2, d + w / 2, { r: 0.002 });
    else k.box('door', 'metal-pc-light-grey', w, h, 0.012, 0, h / 2, d + 0.03, { r: 0.002 });
    return finish(k);
  },
});

const epo = srv({
  id: 'srv-emergency-power-off', placement: 'wall', elevation: 1.3, ko: '비상 전원 차단 버튼 (EPO)', en: 'Emergency power off button',
  params: [P.bool('cover', '보호 덮개', 'Protective cover', true)],
  tags: ['epo', 'emergency power off', 'kill switch', '비상 정지', '비상 전원 차단', 'EPO'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('box', 'plastic-abs-gloss-yellow', 0.12, 0.12, 0.07, 0, 0.06, 0.035, { r: 0.008 });
    k.cyl('button', 'plastic-abs-gloss-red', 0.03, 0.03, 0.025, 0, 0.06, 0.07, { rx: PI / 2, segs: 16 });
    k.box('label', 'paper', 0.1, 0.03, 0.002, 0, 0.16, 0.001, { r: 0, ...C('#d9342b') });
    if (p.cover) k.box('cover', 'plastic-acrylic-clear', 0.13, 0.13, 0.05, 0, 0.065, 0.1, { r: 0.008 });
    return finish(k);
  },
});

const generator = srv({
  id: 'srv-standby-generator', ko: '비상 발전기 (방음형)', en: 'Standby generator (enclosed)',
  params: [P.len('length', '길이', 'Length', 3.2, 2.0, 4.4), P.color('body', '몸체 색', 'Body colour', '#c9c3b2')],
  tags: ['generator', 'diesel generator', 'standby power', '발전기', '비상 발전기', '디젤 발전기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, w = 1.2, h = 1.7;
    k.box('base', 'metal-pc-black-matte', L, 0.15, w, 0, 0.075, 0, { r: 0.004 });
    k.box('body', 'metal-pc-cream', L, h - 0.15, w, 0, 0.15 + (h - 0.15) / 2, 0, { r: 0.01, ...C(p.body) });
    for (let i = 0; i < Math.round(L / 0.9); i++) k.box('doors', 'metal-pc-cream', 0.75, h - 0.4, 0.01, -L / 2 + 0.5 + i * 0.9, h / 2 + 0.05, w / 2 + 0.005, { r: 0.004, ...C(p.body) });
    louvres(k, 'grille', 'metal-pc-anthracite', 0.6, 0.6, L / 2 - 0.4, h / 2, w / 2 + 0.01, 8);
    k.cyl('exhaust', 'metal-steel-raw', 0.06, 0.06, 0.4, -L / 2 + 0.4, h, 0, { segs: 12 });
    return finish(k);
  },
});

/* ============================================================ fire, detection, environment */

const gasCylinders = srv({
  id: 'srv-fire-suppression-cylinders', ko: '가스 소화 설비 (실린더)', en: 'Gas fire suppression cylinders',
  params: [P.int('count', '실린더 수', 'Cylinders', 3, 1, 6), P.len('height', '높이', 'Height', 1.5, 1.0, 1.8)],
  tags: ['fire suppression', 'fm-200', 'novec', 'clean agent', '가스 소화', '청정 소화약제', '소화 설비'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, r = 0.18;
    for (let i = 0; i < p.count; i++) {
      const x = (i - (p.count - 1) / 2) * (2 * r + 0.06);
      k.lathe('cylinders', 'metal-pc-red', [[0, 0], [r, 0.02], [r, h * 0.85], [r * 0.6, h * 0.95], [0.04, h * 0.97], [0, h * 0.97]], x, 0, 0, { segs: k.seg(24, 8) });
      k.box('valves', 'metal-brass', 0.06, 0.08, 0.06, x, h, 0, { r: 0.006 });
      k.box('labels', 'paper', r * 1.2, 0.3, 0.002, x, h * 0.55, r + 0.001, { r: 0 });
      k.rod('manifold', 'metal-steel-raw', [x, h + 0.04, 0], [x, h + 0.2, 0], 0.015, { segs: 8 });
    }
    const L = p.count * (2 * r + 0.06);
    k.rod('manifold', 'metal-steel-raw', [-L / 2 + r, h + 0.2, 0], [L / 2 - r, h + 0.2, 0], 0.025, { segs: 8 });
    k.box('frame', 'metal-pc-black-matte', L, 0.04, 0.05, 0, h * 0.7, -r - 0.03, { r: 0.002 });
    return finish(k);
  },
});

const nozzle = srv({
  id: 'srv-suppression-nozzle', placement: 'ceiling', elevation: 2.9 - 0.25, ko: '소화 노즐 (천장)', en: 'Suppression discharge nozzle',
  params: [P.len('drop', '배관 길이', 'Pipe drop', 0.2, 0.05, 0.4)],
  tags: ['nozzle', 'discharge nozzle', 'sprinkler head', '소화 노즐', '방출 노즐', '천장 소화'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('pipe', 'metal-pc-red', 0.02, 0.02, p.drop, 0, 0.04, 0, { segs: 10 });
    k.cyl('nozzle', 'metal-brass', 0.03, 0.025, 0.04, 0, 0, 0, { segs: 12 });
    return finish(k);
  },
});

const vesda = srv({
  id: 'srv-aspirating-smoke-detector', placement: 'wall', elevation: 1.5, ko: '공기 흡입형 연기 감지기 (VESDA)', en: 'Aspirating smoke detector',
  params: [P.len('pipe', '배관 길이', 'Pipe length', 0.8, 0.2, 1.4), P.color('body', '몸체 색', 'Body colour', '#e8e8e8')],
  tags: ['vesda', 'aspirating smoke detector', 'early warning', '공기 흡입형 감지기', '연기 감지기', '조기 경보'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.35, h = 0.22;
    k.box('body', 'plastic-abs-matte-white', w, h, 0.12, 0, h / 2, 0.06, { r: 0.012, ...C(p.body) });
    for (let i = 0; i < 5; i++) k.box('leds', i < 2 ? 'led-green' : 'led-amber', 0.03, 0.008, 0.002, -0.1 + i * 0.05, h * 0.65, 0.121, { r: 0 });
    k.rod('pipe', 'plastic-pvc-pipe', [0, h, 0.06], [0, h + p.pipe, 0.06], 0.013, { segs: 10, ...C('#d9342b') });
    return finish(k);
  },
});

const alarmPanel = srv({
  id: 'srv-fire-alarm-control-panel', placement: 'wall', elevation: 1.2, ko: '화재 수신반', en: 'Fire alarm control panel',
  params: [P.len('width', '폭', 'Width', 0.45, 0.35, 0.7), P.bool('display', '화면 켜짐', 'Display on', true)],
  tags: ['fire alarm panel', 'control panel', 'facp', '화재 수신반', '수신기', '소방 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 1.1;
    k.box('body', 'metal-pc-red', w, h, 0.12, 0, h / 2, 0.06, { r: 0.008 });
    k.box('display', p.display ? 'screen-on-dark' : 'screen-matte-off', w * 0.5, h * 0.18, 0.004, 0, h * 0.72, 0.122, { r: 0.002 });
    row(k, 'leds', 'led-amber', 8, 0, h * 0.5, 0.12, w * 0.1, 0.012);
    row(k, 'buttons', 'plastic-abs-matte-black', 4, 0, h * 0.35, 0.12, w * 0.18, 0.03);
    return finish(k);
  },
});

const strobe = srv({
  id: 'srv-alarm-horn-strobe', placement: 'wall', elevation: 2.3, ko: '경보 사이렌·섬광등', en: 'Alarm horn strobe',
  params: [P.color('body', '몸체 색', 'Body colour', '#c0392b'), P.bool('flash', '점등', 'Flashing', false)],
  tags: ['horn strobe', 'alarm light', 'siren', '경광등', '사이렌', '섬광등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-gloss-red', 0.12, 0.16, 0.06, 0, 0.08, 0.03, { r: 0.01, ...C(p.body) });
    k.box('lens', p.flash ? 'light-candle' : 'plastic-acrylic-clear', 0.08, 0.04, 0.03, 0, 0.12, 0.07, { r: 0.008 });
    k.cyl('horn', 'metal-black-mesh', 0.035, 0.035, 0.004, 0, 0.05, 0.06, { rx: PI / 2, segs: 14 });
    k.light(0, 0.12, 0.12, { color: '#ffffff', intensity: p.flash ? 0.3 : 0, distance: 2 });
    return finish(k);
  },
});

const envSensor = srv({
  id: 'srv-temperature-humidity-sensor', ko: '온습도 센서 (랙 장착)', en: 'Rack temperature and humidity sensor',
  params: [P.bool('display', 'LCD 표시', 'LCD display', true)],
  tags: ['temperature sensor', 'humidity sensor', 'environmental monitor', '온습도 센서', '환경 감시', '온도계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-white', 0.07, 0.1, 0.025, 0, 0.05, 0, { r: 0.008 });
    if (p.display) k.box('display', 'screen-on-white', 0.05, 0.035, 0.002, 0, 0.065, 0.013, { r: 0.002 });
    k.box('grille', 'metal-pc-white-perforated', 0.05, 0.02, 0.002, 0, 0.02, 0.013, { r: 0 });
    k.tube('cable', 'rubber-black', [[0, 0, 0], [0.02, -0.0, -0.05], [0.05, 0.0, -0.1]], 0.002);
    return finish(k);
  },
});

const leakController = srv({
  id: 'srv-water-leak-detection', ko: '누수 감지 시스템', en: 'Water leak detection system',
  params: [P.len('length', '감지 케이블', 'Cable length', 2.0, 0.6, 3.0)],
  tags: ['leak detection', 'water sensor', 'sensing cable', '누수 감지', '누수 센서', '물 감지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('controller', 'plastic-abs-matte-white', 0.18, 0.12, 0.05, -L / 2, 0.06, 0, { r: 0.008 });
    k.box('leds', 'led-green', 0.008, 0.008, 0.003, -L / 2 + 0.05, 0.1, 0.026, { r: 0 });
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([-L / 2 + 0.1 + (i / 8) * (L - 0.1), 0.006, Math.sin(i * 1.2) * 0.15]);
    k.tube('cable', 'plastic-abs-gloss-yellow', pts, 0.006);
    return finish(k);
  },
});

const vibrationPanel = srv({
  id: 'srv-dcim-monitoring-wall', placement: 'wall', elevation: 1.0, ko: '서버실 관제 모니터 벽', en: 'Server room monitoring wall',
  params: [P.int('cols', '열', 'Columns', 3, 1, 4), P.int('rows', '행', 'Rows', 2, 1, 3), P.bool('on', '화면 켜짐', 'Screens on', true)],
  tags: ['monitoring wall', 'dcim', 'noc screens', 'dashboard', '관제 모니터', '모니터링 벽', '상황판'],
  build: (p, ctx) => {
    const k = new Kit(ctx), sw = 1.0, sh = 0.58;
    for (let c = 0; c < p.cols; c++) for (let r = 0; r < p.rows; r++) {
      const x = (c - (p.cols - 1) / 2) * (sw + 0.005), y = r * (sh + 0.005) + sh / 2;
      k.box('bezels', 'plastic-abs-matte-black', sw, sh, 0.05, x, y, 0.08, { r: 0.002 });
      k.box('screens', p.on ? 'screen-on-dark' : 'screen-matte-off', sw - 0.01, sh - 0.01, 0.002, x, y, 0.106, { r: 0 });
    }
    k.box('mount', 'metal-pc-black-matte', p.cols * sw * 0.9, 0.05, 0.05, 0, p.rows * sh * 0.5, 0.025, { r: 0.002 });
    return finish(k);
  },
});

/* ============================================================ security */

const cagePanel = srv({
  id: 'srv-security-cage-panel', ko: '서버 케이지 메쉬 패널', en: 'Server cage mesh panel',
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 2.0), P.len('height', '높이', 'Height', 2.4, 2.0, 2.8)],
  tags: ['cage panel', 'colocation cage', 'mesh partition', '케이지 패널', '메쉬 칸막이', '코로케이션'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height;
    k.panel('frame', 'metal-pc-black-matte', frameShape(w, h, 0.03), 0.03, 0, h / 2, 0);
    k.box('mesh', 'metal-black-mesh', w - 0.06, h - 0.06, 0.003, 0, h / 2, 0, { r: 0 });
    for (const sx of [-1, 1]) k.box('feet', 'metal-pc-black-matte', 0.05, 0.02, 0.2, sx * (w / 2 - 0.03), 0.01, 0, { r: 0.002 });
    return finish(k);
  },
});

const cageDoor = srv({
  id: 'srv-security-cage-door', ko: '서버 케이지 출입문', en: 'Server cage door',
  params: [P.len('width', '폭', 'Width', 1.0, 0.8, 1.4), P.bool('reader', '카드 리더', 'Card reader', true)],
  tags: ['cage door', 'mesh door', 'colocation', '케이지 문', '메쉬 문', '출입문'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 2.4;
    k.panel('frame', 'metal-pc-black-matte', frameShape(w + 0.1, h, 0.05), 0.05, 0, h / 2, 0);
    k.panel('frame', 'metal-pc-black-matte', frameShape(w - 0.01, h - 0.11, 0.03), 0.03, 0, h / 2 - 0.02, 0);
    k.box('mesh', 'metal-black-mesh', w - 0.07, h - 0.17, 0.003, 0, h / 2 - 0.02, 0, { r: 0 });
    k.box('handles', 'metal-chrome', 0.02, 0.2, 0.03, w / 2 - 0.06, 1.05, 0.03, { r: 0.004 });
    if (p.reader) { k.box('reader', 'plastic-abs-matte-black', 0.06, 0.1, 0.02, w / 2 + 0.12, 1.2, 0.03, { r: 0.006 }); k.box('leds', 'led-green', 0.01, 0.004, 0.002, w / 2 + 0.12, 1.24, 0.041, { r: 0 }); }
    return finish(k);
  },
});

const mantrap = srv({
  id: 'srv-security-mantrap', category: 'security', ko: '보안 출입 부스 (맨트랩)', en: 'Security mantrap booth',
  params: [P.len('depth', '깊이', 'Depth', 1.4, 1.0, 2.0), P.color('frame', '틀 색', 'Frame colour', '#2b2b2b')],
  tags: ['mantrap', 'airlock', 'security portal', '맨트랩', '보안 부스', '출입 통제'],
  build: (p, ctx) => {
    const k = new Kit(ctx), D = p.depth, W = 1.1, H = 2.3;
    for (const sx of [-1, 1]) k.box('glass', 'glass-laminated-clear', 0.012, H - 0.15, D, sx * W / 2, H / 2, 0, { r: 0 });
    k.box('roof', 'metal-pc-black-matte', W + 0.05, 0.15, D + 0.05, 0, H - 0.075, 0, { r: 0.004, ...C(p.frame) });
    for (const sz of [-1, 1]) {
      k.panel('frame', 'metal-pc-black-matte', frameShape(W, H - 0.15, 0.04), 0.05, 0, (H - 0.15) / 2, sz * D / 2, { ...C(p.frame) });
      k.box('glass', 'glass-laminated-clear', W - 0.08, H - 0.23, 0.01, 0, (H - 0.15) / 2, sz * D / 2, { r: 0 });
      k.box('reader', 'plastic-abs-matte-black', 0.08, 0.12, 0.03, W / 2 + 0.1, 1.2, sz * (D / 2 + 0.02), { r: 0.006 });
    }
    k.box('floor', 'rubber-sheet-grey', W, 0.02, D, 0, 0.01, 0, { r: 0 });
    k.box('lamp', 'light-panel-dim', W * 0.6, 0.01, D * 0.6, 0, H - 0.155, 0, { r: 0 });
    k.light(0, H - 0.2, 0, { color: '#ffffff', intensity: 0.3, distance: 2.5 });
    return finish(k);
  },
});

const biometric = srv({
  id: 'srv-biometric-door-reader', category: 'security', placement: 'wall', elevation: 1.2, ko: '지문·카드 출입 리더', en: 'Biometric door reader',
  params: [P.pick('kind', '방식', 'Type', 'finger', [['finger', '지문', 'Fingerprint'], ['card', '카드', 'Card'], ['pin', '번호', 'PIN pad']])],
  tags: ['door reader', 'biometric', 'access control', 'card reader', '출입 리더', '지문 리더', '카드 리더'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = 0.16;
    k.box('body', 'plastic-abs-gloss-black', 0.08, h, 0.03, 0, h / 2, 0.015, { r: 0.008 });
    if (p.kind === 'finger') k.box('sensor', 'glass-tint-smoke-dark', 0.025, 0.03, 0.006, 0, h * 0.3, 0.032, { r: 0.004 });
    else if (p.kind === 'pin') row(k, 'keys', 'metal-chrome', 3, 0, h * 0.4, 0.03, 0.02, 0.014);
    k.box('leds', 'led-blue', 0.04, 0.004, 0.002, 0, h * 0.8, 0.031, { r: 0 });
    return finish(k);
  },
});

const cctvServer = srv({
  id: 'srv-ptz-dome-camera', category: 'security', placement: 'ceiling', elevation: 2.9 - 0.25, ko: 'PTZ 돔 카메라 (천장)', en: 'Ceiling PTZ dome camera',
  params: [P.len('drop', '파이프 길이', 'Pendant drop', 0.1, 0.0, 0.5), P.color('body', '몸체 색', 'Body colour', '#f0f0f0')],
  tags: ['ptz camera', 'dome camera', 'cctv', 'security camera', 'PTZ 카메라', '돔 카메라', 'CCTV'],
  build: (p, ctx) => {
    const k = new Kit(ctx), D = p.drop;
    if (D > 0.005) k.cyl('pipe', 'plastic-abs-gloss-white', 0.025, 0.025, D, 0, 0.16, 0, { segs: 12, ...C(p.body) });
    k.cyl('housing', 'plastic-abs-gloss-white', 0.1, 0.11, 0.08, 0, 0.08, 0, { segs: k.seg(24, 8), ...C(p.body) });
    k.sphere('dome', 'glass-tint-smoke-dark', 0.09, 0, 0.08, 0, { rx: PI, thetaLength: PI / 2, segs: k.seg(24, 8), rings: k.seg(8, 4) });
    return finish(k);
  },
});

/* ============================================================ operations */

const crashCart = srv({
  id: 'srv-kvm-crash-cart', ko: 'KVM 크래시 카트', en: 'KVM crash cart',
  params: [P.len('height', '높이', 'Height', 1.0, 0.8, 1.2), P.bool('screen', '화면 켜짐', 'Screen on', true)],
  tags: ['crash cart', 'kvm cart', 'console cart', '크래시 카트', '콘솔 카트', '점검 카트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.6, d = 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box('frame', 'metal-pc-black-matte', 0.03, h - 0.08, 0.03, sx * (w / 2 - 0.02), 0.08 + (h - 0.08) / 2, sz * (d / 2 - 0.02), { r: 0.002 });
      k.cyl('casters', 'rubber-black', 0.035, 0.035, 0.025, sx * (w / 2 - 0.02) + 0.0125, 0.035, sz * (d / 2 - 0.02), { rz: PI / 2, segs: 10 });
    }
    for (const y of [0.15, h * 0.55, h]) k.box('shelves', 'metal-pc-black-matte', w, 0.02, d, 0, y, 0, { r: 0.002 });
    k.box('keyboard', 'plastic-abs-matte-black', 0.42, 0.02, 0.14, 0, h + 0.02, 0.12, { r: 0.004 });
    k.box('monitor', 'plastic-abs-matte-black', 0.45, 0.28, 0.03, 0, h + 0.28, -0.12, { r: 0.006 });
    k.box('screen', p.screen ? 'screen-on-dark' : 'screen-matte-off', 0.43, 0.25, 0.002, 0, h + 0.28, -0.104, { r: 0 });
    k.box('monitor', 'plastic-abs-matte-black', 0.04, 0.14, 0.04, 0, h + 0.08, -0.15, { r: 0.004 });
    k.box('ups', 'plastic-abs-matte-black', 0.3, 0.2, 0.35, 0, 0.26, 0, { r: 0.01 });
    return finish(k);
  },
});

const serverLift = srv({
  id: 'srv-server-lift', ko: '서버 리프트 (장비 운반)', en: 'Server lift',
  params: [P.len('lift', '플랫폼 높이', 'Platform height', 0.8, 0.2, 1.8), P.color('body', '몸체 색', 'Body colour', '#2a5d9f')],
  tags: ['server lift', 'equipment lifter', 'rack lift', '서버 리프트', '장비 리프트', '운반 리프트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = 2.0, L = p.lift;
    k.box('base', 'metal-pc-navy', 0.65, 0.1, 0.85, 0, 0.12, 0, { r: 0.006, ...C(p.body) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('casters', 'rubber-black', 0.05, 0.05, 0.03, sx * 0.27 + 0.015, 0.05, sz * 0.36, { rz: PI / 2, segs: 10 });
    k.box('mast', 'metal-al-brushed', 0.12, H - 0.17, 0.12, 0, 0.17 + (H - 0.17) / 2, -0.35, { r: 0.004 });
    k.box('platform', 'metal-pc-navy', 0.6, 0.03, 0.6, 0, 0.2 + L, 0.05, { r: 0.004, ...C(p.body) });
    k.bentTube('handle', 'metal-chrome', [[-0.25, 1.0, -0.42], [-0.25, 1.1, -0.55], [0.25, 1.1, -0.55], [0.25, 1.0, -0.42]], 0.015, 0.05);
    k.box('winch', 'plastic-abs-matte-black', 0.15, 0.15, 0.1, 0.12, 0.9, -0.42, { r: 0.01 });
    return finish(k);
  },
});

const esdBench = srv({
  id: 'srv-esd-workbench', ko: '정전기 방지 작업대', en: 'ESD workbench',
  params: [P.len('width', '폭', 'Width', 1.5, 1.0, 2.0), P.bool('shelf', '상부 선반', 'Upper shelf', true)],
  tags: ['esd bench', 'anti-static workbench', 'repair bench', '정전기 방지 작업대', '작업대', '수리대'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, d = 0.75, h = 0.85;
    k.box('top', 'rubber-sheet-grey', w, 0.03, d, 0, h - 0.015, 0, { r: 0.002, ...C('#3a6ea5') });
    for (const sx of [-1, 1]) {
      k.box('frame', 'metal-pc-light-grey', 0.05, h - 0.03, d - 0.1, sx * (w / 2 - 0.05), (h - 0.03) / 2, 0, { r: 0.002 });
      if (p.shelf) k.box('frame', 'metal-pc-light-grey', 0.04, 0.7, 0.04, sx * (w / 2 - 0.05), h + 0.35, -d / 2 + 0.05, { r: 0.002 });
    }
    k.box('frame', 'metal-pc-light-grey', w - 0.1, 0.05, 0.05, 0, 0.15, 0, { r: 0.002 });
    if (p.shelf) {
      k.box('frame', 'metal-pc-light-grey', w, 0.02, 0.3, 0, h + 0.7, -d / 2 + 0.15, { r: 0.002 });
      k.box('lamp', 'light-panel-dim', w * 0.8, 0.01, 0.06, 0, h + 0.685, -d / 2 + 0.15, { r: 0 });
      k.light(0, h + 0.67, -d / 2 + 0.15, { color: '#ffffff', intensity: 0.3, distance: 1.5, type: 'spot', angle: 1.1 });
      k.box('outlets', 'metal-pc-light-grey', w - 0.1, 0.06, 0.05, 0, h + 0.1, -d / 2 + 0.03, { r: 0.002 });
    }
    device(k, 'server1u', 0.1, h, 0.15, 1, { depth: 0.6 });
    k.box('wrist', 'plastic-abs-gloss-yellow', 0.04, 0.01, 0.12, -w / 2 + 0.15, h + 0.005, 0.2, { r: 0.004 });
    return finish(k);
  },
});

const consoleDesk = srv({
  id: 'srv-noc-console-desk', ko: '관제 콘솔 데스크', en: 'NOC console desk',
  params: [P.int('positions', '좌석 수', 'Positions', 3, 1, 3), P.bool('screens', '화면 켜짐', 'Screens on', true)],
  tags: ['console desk', 'noc desk', 'control room', '관제 데스크', '상황실 데스크', '콘솔'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.positions, pw = 1.2, w = n * pw, d = 0.95, h = 0.74;
    k.box('top', 'plastic-hpl-anthracite', w, 0.04, d, 0, h - 0.02, 0, { r: 0.006 });
    k.box('body', 'metal-pc-black-matte', w, h - 0.04, 0.3, 0, (h - 0.04) / 2, -d / 2 + 0.15, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('body', 'metal-pc-black-matte', 0.04, h - 0.04, d - 0.3, sx * (w / 2 - 0.02), (h - 0.04) / 2, 0.15, { r: 0.002 });
    k.box('rail', 'metal-pc-black-matte', w, 0.06, 0.08, 0, h + 0.03, -d / 2 + 0.1, { r: 0.002 });
    for (let i = 0; i < n; i++) for (let j = -1; j <= 1; j++) {
      const x = -w / 2 + (i + 0.5) * pw + j * 0.37;
      k.box('monitors', 'plastic-abs-matte-black', 0.36, 0.22, 0.03, x, h + 0.28, -d / 2 + 0.13, { r: 0.004, ry: -j * 0.25 });
      k.box('screens', p.screens ? 'screen-on-dark' : 'screen-matte-off', 0.345, 0.2, 0.002, x + Math.sin(-j * 0.25) * 0.016, h + 0.28, -d / 2 + 0.146, { r: 0, ry: -j * 0.25 });
    }
    return finish(k);
  },
});

const sparesCabinet = srv({
  id: 'srv-spare-parts-shelving', ko: '예비 부품 선반 (부품함)', en: 'Spare parts shelving with bins',
  params: [P.int('tiers', '단 수', 'Tiers', 5, 3, 7), P.len('width', '폭', 'Width', 1.0, 0.8, 1.5)],
  tags: ['spare parts', 'parts bins', 'shelving', '예비 부품', '부품함', '선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, d = 0.45, step = 0.36, h = p.tiers * step + 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-light-grey', 0.035, h, 0.035, sx * (w / 2 - 0.0175), h / 2, sz * (d / 2 - 0.0175), { r: 0.002 });
    const cols = ['#2a5d9f', '#d9342b', '#f2c200', '#2fb04a'];
    for (let t = 0; t < p.tiers; t++) {
      const y = 0.06 + t * step;
      k.box('shelves', 'metal-pc-light-grey', w, 0.02, d, 0, y, 0, { r: 0.002 });
      const bins = Math.floor(w / 0.2);
      for (let i = 0; i < bins; i++) k.box('bins', 'plastic-pp-white', 0.18, 0.15, d - 0.05, -w / 2 + 0.11 + i * ((w - 0.2) / Math.max(1, bins - 1)), y + 0.085, 0, { r: 0.006, ...C(cols[(t + i) % cols.length]) });
    }
    return finish(k);
  },
});

const cableSpoolRack = srv({
  id: 'srv-cable-spool-rack', ko: '케이블 릴 거치대', en: 'Cable spool rack',
  params: [P.int('spools', '릴 수', 'Spools', 4, 1, 8), P.len('width', '폭', 'Width', 1.0, 0.6, 1.6)],
  tags: ['cable spool', 'cable reel', 'reel rack', '케이블 릴', '전선 릴', '릴 거치대'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 1.2, d = 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-black-matte', 0.04, h, 0.04, sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02), { r: 0.002 });
    const cols = ['#2a7de1', '#e0b020', '#d9342b', '#2fb04a', '#f2f2f2', '#7a4a9a', '#e07a2a', '#333333'];
    for (let i = 0; i < p.spools; i++) {
      const y = i % 2 ? 0.85 : 0.35, n = Math.ceil(p.spools / 2), idx = Math.floor(i / 2);
      const rod = (w - 0.08) / 2;
      k.cyl('rods', 'metal-chrome', 0.012, 0.012, w, w / 2, y, 0, { rz: PI / 2, segs: 8 });
      const x = -w / 2 + 0.1 + (idx + 0.5) * ((w - 0.2) / n);
      k.cyl('spools', 'paper-cardboard', 0.2, 0.2, Math.min(0.18, (w - 0.2) / n - 0.02), x + Math.min(0.09, ((w - 0.2) / n - 0.02) / 2), y, 0, { rz: PI / 2, segs: k.seg(20, 8) });
      k.cyl('cable', 'plastic-abs-gloss-blue', 0.16, 0.16, Math.min(0.16, (w - 0.2) / n - 0.04), x + Math.min(0.08, ((w - 0.2) / n - 0.04) / 2), y, 0, { rz: PI / 2, segs: k.seg(20, 8), ...C(cols[i % cols.length]) });
      void rod;
    }
    return finish(k);
  },
});

const degausser = srv({
  id: 'srv-hard-drive-degausser', ko: '하드디스크 소자기 (디가우저)', en: 'Hard drive degausser',
  params: [P.color('body', '몸체 색', 'Body colour', '#d8d4cc'), P.bool('open', '투입구 열림', 'Drawer open', false)],
  tags: ['degausser', 'data destruction', 'drive eraser', '디가우저', '소자기', '데이터 파기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.4, d = 0.5, h = 0.3;
    k.box('body', 'metal-pc-cream', w, h, d, 0, h / 2, 0, { r: 0.012, ...C(p.body) });
    k.box('drawer', 'plastic-abs-matte-black', w * 0.6, 0.05, p.open ? 0.2 : 0.02, 0, h * 0.6, d / 2 + (p.open ? 0.1 : 0.01), { r: 0.004 });
    k.box('display', 'screen-on-dark', 0.1, 0.04, 0.004, w * 0.3, h * 0.82, d / 2 + 0.002, { r: 0.002 });
    return finish(k);
  },
});

const mediaSafe = srv({
  id: 'srv-data-media-safe', ko: '내화 미디어 금고', en: 'Fireproof data media safe',
  params: [P.len('height', '높이', 'Height', 1.2, 0.6, 1.8), P.bool('open', '문 열림', 'Door open', false)],
  tags: ['media safe', 'data safe', 'tape safe', '미디어 금고', '내화 금고', '백업 테이프 보관'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.65, d = 0.6;
    k.box('body', 'metal-pc-anthracite', w, h, d, 0, h / 2, 0, { r: 0.012 });
    if (p.open) {
      k.box('door', 'metal-pc-anthracite', 0.08, h - 0.06, w - 0.06, -w / 2 + 0.04, h / 2, d / 2 + (w - 0.06) / 2, { r: 0.006 });
      for (let i = 0; i < 4; i++) {
        const y = 0.1 + i * (h - 0.2) / 4;
        k.box('shelves', 'metal-pc-light-grey', w - 0.1, 0.01, d - 0.1, 0, y, 0.02, { r: 0 });
        for (let j = 0; j < 6; j++) k.box('tapes', 'plastic-abs-matte-black', 0.025, 0.1, 0.1, -w / 2 + 0.1 + j * 0.08, y + 0.055, 0.08, { r: 0.002 });
      }
    } else {
      k.box('door', 'metal-pc-anthracite', w - 0.06, h - 0.06, 0.04, 0, h / 2, d / 2 + 0.02, { r: 0.006 });
      k.cyl('handle', 'metal-chrome', 0.04, 0.04, 0.03, w * 0.2, h * 0.55, d / 2 + 0.04, { rx: PI / 2, segs: 14 });
      k.box('keypad', 'plastic-abs-matte-black', 0.08, 0.1, 0.01, -w * 0.15, h * 0.6, d / 2 + 0.045, { r: 0.004 });
    }
    return finish(k);
  },
});

const ledTroffer = srv({
  id: 'srv-led-linear-light', placement: 'ceiling', elevation: 2.9 - 0.05, ko: '서버실 LED 라인 조명', en: 'Server room LED linear light',
  params: [P.len('length', '길이', 'Length', 1.5, 0.6, 2.4), P.bool('on', '켜짐', 'On', true), P.pick('mount', '설치', 'Mount', 'surface', [['surface', '직부', 'Surface'], ['pendant', '펜던트', 'Pendant']])],
  tags: ['led linear light', 'batten', 'ceiling light', 'server room lighting', 'LED 조명', '라인 조명', '천장 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, drop = p.mount === 'pendant' ? 0.4 : 0;
    k.box('body', 'metal-pc-white-perforated', L, 0.05, 0.08, 0, 0.025, 0, { r: 0.006, ...C('#f2f2f2') });
    k.box('diffuser', p.on ? 'light-panel-dim' : 'light-panel-off', L - 0.02, 0.004, 0.07, 0, -0.001, 0, { r: 0 });
    if (drop) for (const x of [-L * 0.4, L * 0.4]) k.rod('wires', 'metal-ss-satin', [x, 0.05, 0], [x, 0.05 + drop, 0], 0.0015, { segs: 4 });
    k.light(0, -0.01, 0, { color: '#f4f8ff', intensity: p.on ? 0.8 : 0, distance: 5, type: 'spot', angle: 1.3 });
    return finish(k);
  },
});

const sign = srv({
  id: 'srv-restricted-area-sign', placement: 'wall', elevation: 1.6, ko: '출입 제한 표지판 (서버실)', en: 'Restricted area sign',
  params: [P.len('width', '폭', 'Width', 0.4, 0.25, 0.6), P.color('band', '띠 색', 'Band colour', '#d9342b')],
  tags: ['restricted sign', 'authorized personnel only', 'server room sign', '출입 제한', '관계자 외 출입금지', '서버실 표지'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = w * 0.6;
    k.box('plate', 'plastic-acrylic-white', w, h, 0.004, 0, h / 2, 0.002, { r: 0.004 });
    k.box('band', 'plastic-acrylic-red', w, h * 0.3, 0.001, 0, h * 0.82, 0.0045, { r: 0, ...C(p.band) });
    k.box('text', 'paper-black', w * 0.7, h * 0.08, 0.001, 0, h * 0.45, 0.0045, { r: 0 });
    k.box('text', 'paper-black', w * 0.5, h * 0.06, 0.001, 0, h * 0.25, 0.0045, { r: 0 });
    return finish(k);
  },
});

const groundingBar = srv({
  id: 'srv-grounding-busbar', placement: 'wall', elevation: 0.4, ko: '접지 단자대 (부스바)', en: 'Grounding busbar',
  params: [P.len('length', '길이', 'Length', 0.5, 0.3, 1.0), P.int('lugs', '단자 수', 'Lugs', 6, 2, 12)],
  tags: ['grounding bar', 'earth bar', 'tgb', '접지 단자대', '접지 부스바', '어스바'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    for (const x of [-L / 2 + 0.03, L / 2 - 0.03]) k.box('insulators', 'plastic-abs-matte-black', 0.04, 0.05, 0.05, x, 0.025, 0.025, { r: 0.004 });
    k.box('bar', 'metal-copper-polished', L, 0.1, 0.008, 0, 0.05, 0.054, { r: 0.002 });
    for (let i = 0; i < p.lugs; i++) {
      const x = -L / 2 + 0.06 + i * ((L - 0.12) / Math.max(1, p.lugs - 1));
      k.box('lugs', 'metal-tin', 0.02, 0.04, 0.012, x, 0.05, 0.064, { r: 0.002 });
      k.tube('wires', 'plastic-abs-gloss-green', [[x, 0.03, 0.07], [x, -0.05, 0.08], [x + 0.02, -0.15, 0.06]], 0.005, { ...C('#2fb04a') });
    }
    return finish(k);
  },
});

const aisleDoor = srv({
  id: 'srv-aisle-sliding-door', ko: '통로 컨테인먼트 슬라이딩 도어', en: 'Aisle containment sliding door',
  params: [P.len('width', '통로 폭', 'Aisle width', 1.2, 1.0, 1.8), P.num('open', '열림', 'Open', 0, 0, 1, 0.05)],
  tags: ['containment door', 'sliding door', 'aisle door', '컨테인먼트 도어', '슬라이딩 도어', '통로 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = 2.1, leaf = W / 2;
    k.box('frame', 'metal-al-anodised-black', W + 0.1, 0.12, 0.08, 0, H + 0.06, 0, { r: 0.004 });
    for (const sx of [-1, 1]) {
      k.box('frame', 'metal-al-anodised-black', 0.05, H + 0.12, 0.08, sx * (W / 2 + 0.025), (H + 0.12) / 2, 0, { r: 0.002 });
      const x = sx * (leaf / 2 + p.open * leaf * 0.9);
      k.panel('leaves', 'metal-al-anodised-black', frameShape(leaf, H - 0.02, 0.03), 0.03, x, (H - 0.02) / 2 + 0.01, 0.02);
      k.box('glass', 'plastic-pc-clear', leaf - 0.06, H - 0.08, 0.006, x, H / 2, 0.02, { r: 0 });
    }
    return finish(k);
  },
});

/* ============================================================ small rooms, telecom and tools */

const wallPrecisionAc = srv({
  id: 'srv-wall-precision-ac', placement: 'wall', elevation: 1.9, ko: '벽걸이 서버실 전용 에어컨', en: 'Wall-mounted server room air conditioner',
  params: [P.len('width', '폭', 'Width', 1.0, 0.8, 1.2), P.bool('on', '운전', 'Running', true)],
  tags: ['server room air conditioner', 'wall split', '24/7 cooling', '서버실 에어컨', '벽걸이 에어컨', '전산실 냉방'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.32, d = 0.25;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2, d / 2, { r: 0.04 });
    k.box('vane', 'plastic-abs-matte-white', w - 0.1, 0.01, 0.07, 0, 0.03, d + (p.on ? 0.02 : -0.01), { r: 0.004, rx: p.on ? 0.6 : 0 });
    k.box('grille', 'plastic-abs-matte-grey', w - 0.1, 0.03, 0.004, 0, 0.06, d + 0.001, { r: 0 });
    k.box('display', p.on ? 'led-cyan' : 'plastic-abs-matte-grey', 0.05, 0.012, 0.002, w * 0.35, h * 0.55, d + 0.002, { r: 0 });
    k.box('labels', 'paper', 0.12, 0.03, 0.002, -w * 0.3, h * 0.6, d + 0.002, { r: 0, ...C('#2a5d9f') });
    return finish(k);
  },
});

const patchCordHanger = srv({
  id: 'srv-patch-cord-hanger', placement: 'wall', elevation: 1.2, ko: '패치 코드 걸이', en: 'Patch cord hanger',
  params: [P.int('hooks', '고리 수', 'Hooks', 6, 3, 10), P.int('cords', '걸린 코드', 'Cords per hook', 4, 0, 8)],
  tags: ['patch cord hanger', 'cable hanger', 'cord organizer', '패치 코드 걸이', '랜선 걸이', '케이블 걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.hooks, w = n * 0.1 + 0.04;
    k.box('board', 'metal-pc-black-matte', w, 0.08, 0.01, 0, 0.6, 0.005, { r: 0.002 });
    const cols = ['#2a7de1', '#e0b020', '#d9342b', '#2fb04a', '#f2f2f2', '#7a4a9a'];
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.07 + i * 0.1;
      k.box('hooks', 'metal-chrome', 0.01, 0.01, 0.08, x, 0.6, 0.05, { r: 0.002 });
      for (let j = 0; j < p.cords; j++) k.tube('cords', 'plastic-abs-gloss-blue', [[x - 0.02, 0.6, 0.06 + j * 0.002], [x - 0.03, 0.2 + j * 0.01, 0.07], [x + 0.03, 0.2 + j * 0.01, 0.07], [x + 0.02, 0.6, 0.06 + j * 0.002]], 0.0025, { segs: k.seg(16, 6), radial: 4, ...C(cols[(i + j) % cols.length]) });
    }
    return finish(k);
  },
});

const spliceBox = srv({
  id: 'srv-fibre-splice-enclosure', placement: 'wall', elevation: 1.4, ko: '광 접속함 (벽부형)', en: 'Wall fibre splice enclosure',
  params: [P.bool('open', '문 열림', 'Door open', true), P.int('trays', '접속 트레이', 'Splice trays', 4, 1, 8)],
  tags: ['fibre splice', 'fiber termination box', 'odf', '광 접속함', '광 단자함', 'ODF'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.4, h = 0.45, d = 0.12;
    k.box('body', 'metal-pc-light-grey', w, h, d, 0, h / 2, d / 2, { r: 0.006 });
    for (let i = 0; i < p.trays; i++) k.box('trays', 'plastic-abs-matte-grey', w - 0.08, 0.012, 0.08, 0, 0.06 + i * 0.022, d / 2 + 0.01, { r: 0.002 });
    row(k, 'ports', 'plastic-abs-gloss-blue', 12, 0, h * 0.75, d, 0.025, 0.014, 0.01);
    for (let i = 0; i < 6; i++) k.tube('fibres', 'plastic-abs-gloss-yellow', [[-0.12 + i * 0.05, h * 0.75, d + 0.01], [-0.1 + i * 0.05, h * 0.55, d + 0.03], [-0.15 + i * 0.04, 0.02, d * 0.6]], 0.002);
    if (p.open) k.box('door', 'metal-pc-light-grey', 0.01, h, w, -w / 2 - 0.005, h / 2, d + w / 2, { r: 0.002 });
    else k.box('door', 'metal-pc-light-grey', w, h, 0.01, 0, h / 2, d + 0.03, { r: 0.002 });
    return finish(k);
  },
});

const mdfFrame = srv({
  id: 'srv-telecom-mdf-frame', ko: '통신 MDF 단자 프레임', en: 'Telecom MDF termination frame',
  params: [P.int('verticals', '수직 열', 'Verticals', 3, 2, 6), P.int('blocks', '열당 블록', 'Blocks per vertical', 10, 4, 16)],
  tags: ['mdf', 'main distribution frame', 'krone', 'idc block', 'MDF', '주배선반', '통신 단자'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.verticals, H = 2.2, w = n * 0.35;
    for (let i = 0; i <= n; i++) k.box('frame', 'metal-pc-light-grey', 0.05, H, 0.4, -w / 2 + i * 0.35, H / 2, 0, { r: 0.002 });
    k.box('frame', 'metal-pc-light-grey', w + 0.05, 0.06, 0.4, 0, H - 0.03, 0, { r: 0.002 });
    for (let i = 0; i < n; i++) for (let b = 0; b < p.blocks; b++) {
      const x = -w / 2 + 0.175 + i * 0.35, y = 0.3 + b * ((H - 0.5) / p.blocks);
      k.box('blocks', 'plastic-abs-matte-white', 0.25, 0.04, 0.05, x, y, 0.2, { r: 0.002 });
      k.box('blocks', 'plastic-abs-matte-grey', 0.22, 0.012, 0.01, x, y, 0.23, { r: 0 });
    }
    return finish(k);
  },
});

const toolKit = srv({
  id: 'srv-network-tool-kit', placement: 'surface', ko: '네트워크 공구 세트', en: 'Network tool kit',
  params: [P.bool('open', '케이스 열림', 'Case open', true)],
  tags: ['network tools', 'crimper', 'cable tester', 'tool kit', '네트워크 공구', '랜 툴', '케이블 테스터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.45, d = 0.32;
    k.box('case', 'plastic-abs-matte-black', w, 0.05, d, 0, 0.025, 0, { r: 0.012 });
    if (p.open) {
      k.box('case', 'plastic-abs-matte-black', w, d, 0.05, 0, 0.05 + d / 2, -d / 2 - 0.025, { r: 0.012 });
      k.box('foam', 'plastic-pu-foam', w - 0.02, 0.01, d - 0.02, 0, 0.05, 0, { r: 0, ...C('#3a3a3a') });
      k.box('tester', 'plastic-abs-gloss-yellow', 0.08, 0.025, 0.14, -0.13, 0.065, 0, { r: 0.008 });
      k.box('screen', 'screen-on-dark', 0.05, 0.002, 0.04, -0.13, 0.078, -0.03, { r: 0 });
      k.box('crimper', 'metal-steel', 0.2, 0.015, 0.03, 0.06, 0.06, -0.06, { r: 0.004, ry: 0.2 });
      k.box('grips', 'plastic-abs-gloss-red', 0.1, 0.02, 0.035, 0.14, 0.062, -0.08, { r: 0.008, ry: 0.2 });
      k.box('tester', 'plastic-abs-gloss-yellow', 0.16, 0.025, 0.03, 0.06, 0.063, 0.07, { r: 0.01 });
    } else k.box('case', 'plastic-abs-matte-black', w, 0.05, d, 0, 0.075, 0, { r: 0.012 });
    return finish(k);
  },
});

const antiStaticMat = srv({
  id: 'srv-anti-static-floor-mat', ko: '정전기 방지 바닥 매트', en: 'Anti-static floor mat',
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 2.0), P.len('depth', '깊이', 'Depth', 0.9, 0.6, 1.5)],
  tags: ['anti-static mat', 'esd mat', 'grounding mat', '정전기 방지 매트', 'ESD 매트', '접지 매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('mat', 'rubber-sheet-grey', p.width, 0.004, p.depth, 0, 0.002, 0, { r: 0.0015, ...C('#3a6ea5') });
    k.cyl('snap', 'metal-chrome', 0.008, 0.008, 0.002, p.width / 2 - 0.04, 0.004, p.depth / 2 - 0.04, { segs: 8 });
    return finish(k);
  },
});

const fireDoor = srv({
  id: 'srv-steel-fire-door', ko: '방화문 (서버실, 점검창)', en: 'Steel fire door with vision panel',
  params: [P.len('width', '폭', 'Width', 1.0, 0.9, 1.8), P.bool('double', '양개', 'Double leaf', false), P.color('leaf', '문 색', 'Leaf colour', '#8a8f96')],
  tags: ['fire door', 'steel door', 'server room door', '방화문', '철제문', '서버실 출입문'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = 2.1, n = p.double ? 2 : 1, lw = W / n;
    k.panel('frame', 'metal-pc-anthracite', frameShape(W + 0.1, H + 0.05, 0.05, 0.05), 0.2, 0, (H + 0.05) / 2, 0);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * lw;
      k.box('leaf', 'metal-pc-light-grey', lw - 0.01, H - 0.06, 0.05, x, H / 2, 0.03, { r: 0.004, ...C(p.leaf) });
      k.box('glass', 'glass-wired', 0.15, 0.5, 0.01, x, 1.5, 0.056, { r: 0 });
      k.box('handles', 'metal-ss-satin', 0.16, 0.02, 0.06, x + (i ? -1 : 1) * (lw / 2 - 0.12), 1.05, 0.08, { r: 0.008 });
    }
    k.box('closer', 'metal-pc-anthracite', 0.3, 0.05, 0.06, 0, H, 0.12, { r: 0.006 });
    k.box('labels', 'paper', 0.2, 0.12, 0.002, 0, 1.75, 0.0565, { r: 0, ...C('#d9342b') });
    return finish(k);
  },
});

const seismicBase = srv({
  id: 'srv-rack-seismic-base', ko: '랙 내진 받침대', en: 'Rack seismic base frame',
  params: [P.len('height', '높이', 'Height', 0.3, 0.15, 0.6), P.len('width', '폭', 'Width', 0.6, 0.6, 0.8)],
  tags: ['seismic base', 'rack stand', 'earthquake', '내진 받침대', '랙 받침', '내진 프레임'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, W = p.width, D = 1.0;
    for (const y of [0.025, H - 0.025]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-black-matte', W, 0.05, 0.05, 0, y, sz * (D / 2 - 0.025), { r: 0.002 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', 'metal-pc-black-matte', 0.05, H, 0.05, sx * (W / 2 - 0.025), H / 2, sz * (D / 2 - 0.025), { r: 0.002 });
    for (const sx of [-1, 1]) k.rod('frame', 'metal-pc-black-matte', [sx * (W / 2 - 0.025), 0.05, -D / 2 + 0.05], [sx * (W / 2 - 0.025), H - 0.05, D / 2 - 0.05], 0.015, { segs: 6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('anchors', 'metal-steel-raw', 0.1, 0.01, 0.1, sx * (W / 2 - 0.025), 0.005, sz * (D / 2 - 0.025), { r: 0 });
    return finish(k);
  },
});

export const ITEMS = [
  wallPrecisionAc, patchCordHanger, spliceBox, mdfFrame, toolKit, antiStaticMat, fireDoor, seismicBase,
  crac, cracUp, inRow, ceilingCooler, chiller, spotCooler, dehumid,
  ...tiles, pedestalSection, ramp, tileLifter,
  ...trays, busway, cableDrop, verticalMgr,
  pduCabinet, bigUps, batteryRack, ats, panelBoard, epo, generator, groundingBar,
  gasCylinders, nozzle, vesda, alarmPanel, strobe, envSensor, leakController, vibrationPanel,
  cagePanel, cageDoor, mantrap, biometric, cctvServer, aisleDoor,
  crashCart, serverLift, esdBench, consoleDesk, sparesCabinet, cableSpoolRack, degausser, mediaSafe, ledTroffer, sign,
];
