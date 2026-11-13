// Appliances (가전): air conditioning and ventilation — wall splits (slim, premium, window-panel,
// multi), stand types (round tower, slim, 2-in-1 set), ceiling cassettes (1-way, 2-way, 4-way,
// round 360°, mini), ceiling suspended, concealed duct with grilles, floor console, window and
// through-wall units, portable dual-hose, outdoor units (single, side-discharge VRF, top-discharge
// VRF, wall bracket), rooftop unit, air curtain, ERV, ceiling fan-coil, evaporative cooler,
// thermostats and the remote holder. All indicator lights are LED materials (no lamps).
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, frameShape } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { C } from './accessories-plus.js';

const PI = Math.PI;
const aca = (def) => mk({ category: 'appliances', ...def });
const RUN = (on) => (on ? 'led-cyan' : 'plastic-abs-matte-grey');

/** Horizontal louvre lines over w × h on a face at zf. */
function slats(k, role, mat, w, h, x, y, zf, n, tilt = -0.5) {
  for (let i = 0; i < n; i++) k.box(role, mat, w, 0.004, 0.012, x, y - h / 2 + (i + 0.5) * (h / n), zf + 0.006, { r: 0, rx: tilt });
}

/** Fan grille disc (outdoor unit) facing +Z at (x, y, zf). */
function fanGrille(k, x, y, zf, r) {
  k.cyl('grille', 'metal-black-mesh', r, r, 0.004, x, y, zf, { rx: PI / 2, segs: k.seg(28, 10) });
  for (let i = 0; i < 3; i++) k.add('grille', 'metal-black', T(new THREE.TorusGeometry(r * (0.35 + i * 0.3), 0.003, 4, k.seg(28, 10)), x, y, zf + 0.004));
  k.cyl('hub', 'plastic-abs-matte-black', r * 0.15, r * 0.15, 0.01, x, y, zf - 0.01, { rx: PI / 2, segs: 12 });
}

/** Ceiling cassette panel (square or rect) with n discharge slots, hanging under y = h. */
function cassettePanel(k, w, d, slots, on, { round = false } = {}) {
  const t = 0.035;
  if (round) {
    k.cyl('panel', 'plastic-abs-matte-white', w / 2, w / 2, t, 0, 0, 0, { segs: k.seg(40, 12) });
    k.add('vanes', 'plastic-abs-matte-grey', T(new THREE.TorusGeometry(w * 0.38, 0.02, 4, k.seg(40, 12)), 0, -0.001, 0, PI / 2));
    k.cyl('grille', 'metal-pc-white-perforated', w * 0.28, w * 0.28, 0.003, 0, -0.002, 0, { segs: k.seg(32, 10) });
  } else {
    k.box('panel', 'plastic-abs-matte-white', w, t, d, 0, t / 2, 0, { r: 0.01 });
    k.box('grille', 'metal-pc-white-perforated', w * 0.5, 0.003, d * 0.5, 0, -0.0015, 0, { r: 0 });
    const sides = [[0, d * 0.36, w * 0.6, 0.06, 0], [0, -d * 0.36, w * 0.6, 0.06, 0], [w * 0.36, 0, 0.06, d * 0.6, 1], [-w * 0.36, 0, 0.06, d * 0.6, 1]];
    sides.slice(0, slots).forEach(([x, z, sw, sd, vertical]) => {
      k.box('slots', 'plastic-abs-matte-black', sw, 0.004, sd, x, -0.002, z, { r: 0 });
      k.box('vanes', 'plastic-abs-matte-white', vertical ? 0.05 : sw - 0.02, 0.006, vertical ? sd - 0.02 : 0.05, x, -0.006, z, { r: 0.002, rx: vertical ? 0 : on ? 0.5 * Math.sign(z) : 0, rz: vertical ? (on ? -0.5 * Math.sign(x) : 0) : 0 });
    });
  }
  k.box('display', RUN(on), 0.02, 0.003, 0.01, w * 0.2, -0.003, d * 0.2, { r: 0 });
}

/* ============================================================ wall splits */

const slimWall = aca({
  id: 'aca-wall-split-slim', placement: 'wall', elevation: 1.95, ko: '벽걸이 에어컨 (슬림)', en: 'Slim wall split air conditioner',
  params: [P.len('width', '폭', 'Width', 0.85, 0.7, 1.1), P.bool('on', '운전', 'Running', true), P.color('body', '몸체 색', 'Body colour', '#f4f4f4')],
  tags: ['air conditioner', 'wall split', 'mini split', 'slim', '에어컨', '벽걸이 에어컨', '슬림 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.27, d = 0.19;
    k.box('body', 'plastic-abs-gloss-white', w, h, d, 0, h / 2, d / 2, { r: 0.05, ...C(p.body) });
    k.box('vane', 'plastic-abs-gloss-white', w - 0.08, 0.008, 0.06, 0, 0.02, d - (p.on ? -0.02 : 0.01), { r: 0.003, rx: p.on ? 0.7 : 0, ...C(p.body) });
    k.box('display', RUN(p.on), 0.04, 0.01, 0.002, w * 0.36, h * 0.5, d + 0.001, { r: 0 });
    return finish(k);
  },
});

const premiumWall = aca({
  id: 'aca-wall-split-premium', placement: 'wall', elevation: 1.9, ko: '벽걸이 에어컨 (무풍 프리미엄)', en: 'Premium wall air conditioner (micro-hole panel)',
  params: [P.len('width', '폭', 'Width', 0.95, 0.8, 1.2), P.bool('on', '운전', 'Running', true), P.color('panel', '패널 색', 'Panel colour', '#e9e7e2')],
  tags: ['air conditioner', 'wind-free', 'premium', 'micro holes', '에어컨', '무풍 에어컨', '프리미엄 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.34, d = 0.22;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2, d / 2, { r: 0.04 });
    k.box('panel', 'metal-pc-white-perforated', w - 0.04, h - 0.1, 0.006, 0, h * 0.58, d + 0.002, { r: 0.01, ...C(p.panel) });
    k.box('vane', 'plastic-abs-matte-white', w - 0.1, 0.01, 0.05, 0, 0.03, d + (p.on ? 0.01 : -0.01), { r: 0.003, rx: p.on ? 0.5 : 0 });
    k.box('display', RUN(p.on), 0.08, 0.008, 0.002, 0, 0.08, d + 0.004, { r: 0.002 });
    return finish(k);
  },
});

const squareWall = aca({
  id: 'aca-wall-split-square', placement: 'wall', elevation: 1.75, ko: '벽걸이 에어컨 (사각 디자인)', en: 'Square-front wall air conditioner',
  params: [P.len('size', '크기', 'Size', 0.6, 0.5, 0.75), P.bool('on', '운전', 'Running', true), P.color('panel', '패널 색', 'Panel colour', '#cfd3d6')],
  tags: ['air conditioner', 'square design', 'art cool', '에어컨', '사각 에어컨', '디자인 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size, d = 0.18;
    k.box('body', 'plastic-abs-matte-white', s, s, d, 0, s / 2, d / 2, { r: 0.02 });
    k.box('panel', 'glass-bp-grey', s - 0.02, s - 0.12, 0.006, 0, s / 2 + 0.04, d + 0.003, { r: 0.008, ...C(p.panel) });
    slats(k, 'vanes', 'plastic-abs-matte-grey', s - 0.06, 0.08, 0, 0.05, d, 3, p.on ? -0.6 : 0);
    k.box('display', RUN(p.on), 0.05, 0.006, 0.002, 0, s * 0.85, d + 0.007, { r: 0 });
    return finish(k);
  },
});

const multiSet = aca({
  id: 'aca-two-in-one-set', placement: 'floor', ko: '2in1 에어컨 세트 (스탠드+벽걸이)', en: '2-in-1 air conditioner set (stand + wall)',
  params: [P.len('gap', '간격', 'Gap', 0.6, 0.2, 1.2), P.bool('on', '운전', 'Running', true)],
  tags: ['2 in 1 air conditioner', 'multi split', 'home multi', '2in1 에어컨', '홈멀티', '투인원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), hs = 1.85, rs = 0.19, wx = rs + p.gap + 0.42;
    k.cyl('stand', 'plastic-abs-gloss-white', rs, rs, hs, -0.2, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('grille', 'metal-pc-white-perforated', rs + 0.002, rs + 0.002, hs * 0.55, -0.2, hs * 0.38, 0, { segs: k.seg(32, 10), open: true, thetaLength: PI, thetaStart: -PI / 2 });
    k.cyl('top', 'plastic-abs-matte-grey', rs * 0.9, rs * 0.9, 0.01, -0.2, hs, 0, { segs: k.seg(28, 10) });
    k.box('display', RUN(p.on), 0.06, 0.02, 0.003, -0.2, hs * 0.3, rs, { r: 0.003 });
    k.box('wall', 'plastic-abs-gloss-white', 0.85, 0.28, 0.2, wx, 2.05, -rs + 0.1, { r: 0.05 });
    k.box('vane', 'plastic-abs-gloss-white', 0.75, 0.008, 0.05, wx, 1.93, -rs + 0.22, { r: 0.003, rx: p.on ? 0.7 : 0 });
    return finish(k);
  },
});

/* ============================================================ stands */

const roundStand = aca({
  id: 'aca-stand-round-tower', ko: '스탠드 에어컨 (원형 타워)', en: 'Round tower stand air conditioner',
  params: [P.len('height', '높이', 'Height', 1.85, 1.6, 2.0), P.bool('on', '운전', 'Running', true), P.color('body', '몸체 색', 'Body colour', '#f2f2f2')],
  tags: ['stand air conditioner', 'floor standing', 'tower', '스탠드 에어컨', '타워형 에어컨', '거실 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, r = 0.18;
    k.cyl('body', 'plastic-abs-gloss-white', r, r * 1.05, h, 0, 0, 0, { segs: k.seg(36, 12), ...C(p.body) });
    for (let i = 0; i < 2; i++) k.cyl('outlets', 'metal-pc-white-perforated', r * 0.55, r * 0.55, 0.006, 0, h * (0.58 + i * 0.2), r - 0.004, { rx: PI / 2, segs: k.seg(28, 10) });
    k.box('display', RUN(p.on), 0.08, 0.02, 0.003, 0, h * 0.42, r + 0.002, { r: 0.004 });
    k.cyl('top', 'plastic-abs-matte-grey', r * 0.95, r * 0.95, 0.008, 0, h, 0, { segs: k.seg(32, 10) });
    return finish(k);
  },
});

const slimStand = aca({
  id: 'aca-stand-slim-panel', ko: '스탠드 에어컨 (슬림 패널)', en: 'Slim-panel stand air conditioner',
  params: [P.len('height', '높이', 'Height', 1.8, 1.6, 2.0), P.bool('on', '운전', 'Running', true), P.color('panel', '패널 색', 'Panel colour', '#e7e3dc')],
  tags: ['stand air conditioner', 'slim', 'panel', '스탠드 에어컨', '슬림 에어컨', '패널형'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.34, d = 0.3;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2, 0, { r: 0.04 });
    k.box('panel', 'glass-bp-cream', w - 0.01, h * 0.75, 0.008, 0, h * 0.42, d / 2 + 0.004, { r: 0.02, ...C(p.panel) });
    k.box('outlet', p.on ? 'plastic-abs-matte-black' : 'plastic-abs-matte-white', 0.06, h * 0.55, 0.006, 0, h * 0.58, d / 2 + 0.009, { r: 0.02 });
    k.box('display', RUN(p.on), 0.04, 0.02, 0.003, 0, h * 0.1, d / 2 + 0.009, { r: 0.003 });
    return finish(k);
  },
});

const columnStand = aca({
  id: 'aca-stand-column-fins', ko: '스탠드 에어컨 (상하 듀얼 토출)', en: 'Dual-outlet column stand air conditioner',
  params: [P.len('height', '높이', 'Height', 1.9, 1.7, 2.0), P.bool('on', '운전', 'Running', true)],
  tags: ['stand air conditioner', 'dual outlet', 'floor air conditioner', '스탠드 에어컨', '듀얼 토출', '상하 토출'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.4, d = 0.36;
    k.box('body', 'plastic-abs-gloss-white', w, h, d, 0, h / 2, 0, { r: 0.06 });
    for (const y of [h * 0.85, h * 0.5]) slats(k, 'vanes', 'plastic-abs-matte-grey', w - 0.08, 0.14, 0, y, d / 2, 5, p.on ? -0.6 : 0);
    k.box('display', RUN(p.on), 0.1, 0.03, 0.003, 0, h * 0.68, d / 2 + 0.002, { r: 0.005 });
    k.box('grille', 'metal-pc-white-perforated', w - 0.06, h * 0.25, 0.004, 0, h * 0.15, d / 2 + 0.002, { r: 0.006 });
    return finish(k);
  },
});

/* ============================================================ ceiling */

const CASS = [
  ['aca-cassette-4way', '천장형 에어컨 (4방향 카세트)', 'Ceiling cassette air conditioner (4-way)', 0.95, 0.95, 4, false],
  ['aca-cassette-2way', '천장형 에어컨 (2방향)', 'Ceiling cassette air conditioner (2-way)', 1.1, 0.6, 2, false],
  ['aca-cassette-1way', '천장형 에어컨 (1방향 슬림)', 'Ceiling cassette air conditioner (1-way slim)', 1.1, 0.45, 1, false],
  ['aca-cassette-mini', '천장형 에어컨 (미니 4방향 600각)', 'Mini 4-way cassette (600 grid)', 0.62, 0.62, 4, false],
  ['aca-cassette-round', '천장형 에어컨 (원형 360°)', 'Round 360° ceiling cassette', 0.95, 0.95, 0, true],
];

const cassettes = CASS.map(([id, ko, en, w, d, slots, round]) => aca({
  id, placement: 'ceiling', elevation: 2.4 - 0.04, ko, en,
  params: [P.bool('on', '운전', 'Running', true), P.bool('body', '본체 보기', 'Show body above ceiling', false)],
  tags: ['ceiling cassette', 'cassette air conditioner', 'system air conditioner', '천장형 에어컨', '시스템 에어컨', '카세트형'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    cassettePanel(k, w, d, slots, p.on, { round });
    if (p.body) k.box('body', 'metal-steel-galvanised', w * 0.85, 0.25, (round ? w : d) * 0.85, 0, 0.035 + 0.125, 0, { r: 0.004 });
    return finish(k);
  },
}));

const suspended = aca({
  id: 'aca-ceiling-suspended', placement: 'ceiling', elevation: 2.4 - 0.24, ko: '천장 노출형 에어컨 (실링형)', en: 'Ceiling-suspended air conditioner',
  params: [P.len('width', '폭', 'Width', 1.3, 1.0, 1.6), P.bool('on', '운전', 'Running', true)],
  tags: ['ceiling suspended', 'under ceiling', 'exposed air conditioner', '천장 노출형', '실링형 에어컨', '천장 매달기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.23, d = 0.68;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2, 0, { r: 0.05 });
    k.box('grille', 'metal-pc-white-perforated', w - 0.1, 0.004, d * 0.5, 0, -0.002, -d * 0.12, { r: 0 });
    k.box('vane', 'plastic-abs-matte-white', w - 0.12, 0.01, 0.07, 0, 0.04, d / 2 + (p.on ? 0.02 : -0.01), { r: 0.004, rx: p.on ? 0.6 : 0 });
    k.box('display', RUN(p.on), 0.04, 0.01, 0.002, w * 0.4, h * 0.6, d / 2 + 0.001, { r: 0 });
    return finish(k);
  },
});

const ducted = aca({
  id: 'aca-concealed-duct', placement: 'ceiling', elevation: 2.4 - 0.32, ko: '천장 매립 덕트형 에어컨 (그릴 포함)', en: 'Concealed ducted air conditioner with grilles',
  params: [P.len('width', '폭', 'Width', 1.0, 0.8, 1.4), P.int('grilles', '토출 그릴', 'Supply grilles', 2, 1, 3), P.bool('body', '본체 보기', 'Show body', true)],
  tags: ['ducted air conditioner', 'concealed', 'slim duct', '덕트형 에어컨', '천장 매립형', '빌트인 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.25, d = 0.7;
    if (p.body) {
      k.box('body', 'metal-steel-galvanised', w, h, d, 0, 0.06 + h / 2, 0, { r: 0.004 });
      k.box('duct', 'metal-al-foil', w * 0.8, 0.2, 0.6, 0, 0.06 + h / 2, d / 2 + 0.3, { r: 0.02 });
    }
    for (let i = 0; i < p.grilles; i++) {
      const x = (i - (p.grilles - 1) / 2) * (w / p.grilles);
      k.panel('grilles', 'metal-pc-white-perforated', frameShape(0.45, 0.12, 0.02), 0.012, x, 0.006, d / 2 + 0.3, { rx: PI / 2 });
      k.box('grilles', 'plastic-abs-matte-white', 0.41, 0.004, 0.08, x, 0.003, d / 2 + 0.3, { r: 0 });
    }
    k.panel('return', 'plastic-abs-matte-white', frameShape(0.6, 0.6, 0.03), 0.012, 0, 0.006, -d / 2 + 0.2, { rx: PI / 2 });
    k.box('return', 'metal-pc-white-perforated', 0.54, 0.004, 0.54, 0, 0.003, -d / 2 + 0.2, { r: 0 });
    return finish(k);
  },
});

const linearSlot = aca({
  id: 'aca-linear-slot-diffuser', placement: 'ceiling', elevation: 2.4 - 0.08, ko: '라인 디퓨저 (시스템 에어컨 토출구)', en: 'Linear slot diffuser',
  params: [P.len('length', '길이', 'Length', 1.5, 0.6, 3.0), P.int('slots', '슬롯 수', 'Slots', 2, 1, 4)],
  tags: ['slot diffuser', 'linear diffuser', 'air outlet', '라인 디퓨저', '슬롯 디퓨저', '에어컨 토출구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, n = p.slots, w = n * 0.03 + 0.03;
    k.box('frame', 'metal-al-anodised-clear', L, 0.012, w, 0, 0.006, 0, { r: 0.002 });
    for (let i = 0; i < n; i++) k.box('slots', 'plastic-abs-matte-black', L - 0.02, 0.004, 0.018, 0, -0.001, -w / 2 + 0.03 + i * 0.03, { r: 0 });
    k.box('plenum', 'metal-steel-galvanised', L, 0.07, w + 0.04, 0, 0.047, 0, { r: 0.002 });
    return finish(k);
  },
});

/* ============================================================ floor / window / portable */

const floorConsole = aca({
  id: 'aca-floor-console', ko: '바닥형 콘솔 에어컨', en: 'Floor console air conditioner',
  params: [P.len('width', '폭', 'Width', 0.7, 0.6, 1.0), P.bool('on', '운전', 'Running', true)],
  tags: ['floor console', 'low wall unit', 'console air conditioner', '콘솔 에어컨', '바닥형 에어컨', '창가형'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.6, d = 0.21;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2, 0, { r: 0.03 });
    slats(k, 'vanes', 'plastic-abs-matte-grey', w - 0.08, 0.06, 0, h - 0.04, d / 2, 2, p.on ? -0.6 : 0);
    k.box('grille', 'metal-pc-white-perforated', w - 0.08, 0.25, 0.004, 0, 0.18, d / 2 + 0.002, { r: 0.006 });
    k.box('display', RUN(p.on), 0.05, 0.012, 0.002, w * 0.3, h * 0.72, d / 2 + 0.001, { r: 0 });
    return finish(k);
  },
});

const windowAc = aca({
  id: 'aca-window-unit', placement: 'wall', elevation: 1.0, ko: '창문형 에어컨', en: 'Window air conditioner',
  params: [P.len('width', '폭', 'Width', 0.48, 0.4, 0.65), P.bool('on', '운전', 'Running', true), P.bool('curtains', '측면 커튼', 'Side panels', true)],
  tags: ['window air conditioner', 'window unit', 'room air conditioner', '창문형 에어컨', '창문 에어컨', '원룸 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.35, d = 0.55;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2, 0, { r: 0.015 });
    k.box('front', 'plastic-abs-matte-white', w + 0.02, h + 0.02, 0.03, 0, h / 2, d / 2, { r: 0.01 });
    slats(k, 'vanes', 'plastic-abs-matte-grey', w * 0.5, h * 0.3, w * 0.2, h * 0.72, d / 2 + 0.015, 4, p.on ? -0.6 : 0);
    k.box('grille', 'metal-pc-white-perforated', w * 0.85, h * 0.35, 0.004, 0, h * 0.25, d / 2 + 0.016, { r: 0.004 });
    k.box('display', RUN(p.on), 0.04, 0.012, 0.002, -w * 0.3, h * 0.75, d / 2 + 0.016, { r: 0 });
    if (p.curtains) for (const s of [-1, 1]) k.box('panels', 'plastic-pp-white', 0.2, h, 0.01, s * (w / 2 + 0.1), h / 2, -0.05, { r: 0.002 });
    return finish(k);
  },
});

const throughWall = aca({
  id: 'aca-through-wall-ptac', placement: 'wall', elevation: 0.15, ko: '벽 관통형 에어컨 (PTAC)', en: 'Through-wall air conditioner (PTAC)',
  params: [P.len('width', '폭', 'Width', 1.07, 0.9, 1.1), P.bool('on', '운전', 'Running', true)],
  tags: ['ptac', 'through wall', 'hotel air conditioner', '벽 관통형', '호텔 에어컨', 'PTAC'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.42, d = 0.3;
    k.box('body', 'metal-pc-cream', w, h, d, 0, h / 2, d / 2, { r: 0.01 });
    k.box('grille', 'metal-pc-white-perforated', w * 0.55, h * 0.12, 0.004, -w * 0.1, h - 0.04, d / 2 + 0.002, { r: 0, rx: -PI / 2 });
    k.box('grille', 'metal-pc-white-perforated', w * 0.7, h * 0.45, 0.004, -w * 0.1, h * 0.38, d + 0.002, { r: 0.004 });
    k.box('controls', 'plastic-abs-matte-grey', 0.14, 0.1, 0.004, w * 0.35, h * 0.6, d + 0.002, { r: 0.004 });
    k.box('display', RUN(p.on), 0.04, 0.012, 0.002, w * 0.35, h * 0.7, d + 0.005, { r: 0 });
    return finish(k);
  },
});

const portableDual = aca({
  id: 'aca-portable-dual-hose', ko: '이동식 에어컨 (듀얼 호스)', en: 'Portable air conditioner (dual hose)',
  params: [P.len('height', '높이', 'Height', 0.78, 0.65, 0.9), P.bool('on', '운전', 'Running', true), P.color('body', '몸체 색', 'Body colour', '#f2f2f2')],
  tags: ['portable air conditioner', 'mobile air conditioner', 'dual hose', '이동식 에어컨', '포터블 에어컨', '듀얼 호스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.46, d = 0.38;
    k.box('body', 'plastic-abs-matte-white', w, h, d, 0, h / 2 + 0.04, 0, { r: 0.04, ...C(p.body) });
    slats(k, 'vanes', 'plastic-abs-matte-grey', w * 0.6, 0.1, 0, h - 0.04, d / 2, 4, p.on ? -0.6 : 0);
    k.box('display', RUN(p.on), 0.06, 0.012, 0.002, 0, h * 0.75, d / 2 + 0.001, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('casters', 'rubber-black', 0.025, 0.025, 0.02, sx * (w / 2 - 0.06) + 0.01, 0.025, sz * (d / 2 - 0.06), { rz: PI / 2, segs: 10 });
    for (const x of [-0.1, 0.1]) k.tube('hoses', 'plastic-abs-matte-grey', [[x, h * 0.6, -d / 2], [x, h * 0.8, -d / 2 - 0.25], [x, h + 0.25, -d / 2 - 0.45]], 0.06);
    k.box('window kit', 'plastic-pp-white', 0.3, 0.6, 0.02, 0, h + 0.4, -d / 2 - 0.5, { r: 0.004 });
    return finish(k);
  },
});

const evaporative = aca({
  id: 'aca-evaporative-cooler', ko: '냉풍기 (증발식)', en: 'Evaporative air cooler',
  params: [P.len('height', '높이', 'Height', 0.95, 0.7, 1.2), P.num('water', '물 양', 'Water level', 0.6, 0, 1, 0.05)],
  tags: ['evaporative cooler', 'air cooler', 'swamp cooler', '냉풍기', '증발식 냉풍기', '이동식 냉풍기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.36, d = 0.32;
    k.box('body', 'plastic-abs-gloss-white', w, h, d, 0, h / 2 + 0.04, 0, { r: 0.05 });
    slats(k, 'vanes', 'plastic-abs-matte-grey', w * 0.7, h * 0.4, 0, h * 0.68, d / 2, 8, 0);
    k.box('tank', 'plastic-acrylic-clear', w * 0.5, h * 0.18, 0.004, 0, h * 0.2, d / 2 + 0.002, { r: 0.006 });
    k.box('water', 'water', w * 0.46, Math.max(0.005, h * 0.17 * p.water), 0.002, 0, h * 0.11 + h * 0.085 * p.water, d / 2 + 0.003, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('casters', 'rubber-black', 0.025, 0.025, 0.02, sx * (w / 2 - 0.05) + 0.01, 0.025, sz * (d / 2 - 0.05), { rz: PI / 2, segs: 10 });
    return finish(k);
  },
});

/* ============================================================ outdoor units */

const outdoorSingle = aca({
  id: 'aca-outdoor-unit-single', ko: '에어컨 실외기 (가정용)', en: 'Air conditioner outdoor unit',
  params: [P.len('width', '폭', 'Width', 0.8, 0.7, 0.95), P.bool('pipes', '배관', 'Pipes', true)],
  tags: ['outdoor unit', 'condenser', 'compressor', '실외기', '에어컨 실외기', '가정용 실외기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.55, d = 0.28;
    k.box('body', 'metal-pc-cream', w, h, d, 0, h / 2 + 0.04, 0, { r: 0.006, ...C('#e8e6df') });
    fanGrille(k, -w * 0.12, h / 2 + 0.04, d / 2 + 0.002, h * 0.38);
    k.box('grille', 'metal-al-slotted', d, h - 0.04, 0.004, -w / 2 - 0.002, h / 2 + 0.04, 0, { r: 0, ry: PI / 2 });
    for (const sx of [-1, 1]) k.box('feet', 'metal-pc-anthracite', 0.06, 0.04, d + 0.04, sx * (w / 2 - 0.12), 0.02, 0, { r: 0.002 });
    if (p.pipes) for (const [y, r] of [[0.15, 0.012], [0.2, 0.008]]) k.tube('pipes', 'plastic-pe-white', [[w / 2, y, 0.02], [w / 2 + 0.08, y, 0.02], [w / 2 + 0.1, y + 0.3, -0.05]], r);
    return finish(k);
  },
});

const vrfSide = aca({
  id: 'aca-outdoor-vrf-side', ko: '시스템 에어컨 실외기 (측면 토출 2팬)', en: 'VRF outdoor unit (side discharge, 2 fans)',
  params: [P.len('width', '폭', 'Width', 0.95, 0.9, 1.1), P.color('body', '몸체 색', 'Body colour', '#e8e6df')],
  tags: ['vrf', 'system air conditioner', 'outdoor unit', '시스템 에어컨 실외기', '멀티 실외기', 'VRF'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 1.38, d = 0.37;
    k.box('body', 'metal-pc-cream', w, h, d, 0, h / 2 + 0.05, 0, { r: 0.006, ...C(p.body) });
    for (const y of [0.4, 1.02]) fanGrille(k, 0, y + 0.05, d / 2 + 0.002, 0.27);
    for (const sx of [-1, 1]) k.box('feet', 'metal-pc-anthracite', 0.08, 0.05, d + 0.06, sx * (w / 2 - 0.12), 0.025, 0, { r: 0.002 });
    return finish(k);
  },
});

const vrfTop = aca({
  id: 'aca-outdoor-vrf-top', ko: '시스템 에어컨 실외기 (상부 토출 대형)', en: 'VRF outdoor unit (top discharge, large)',
  params: [P.int('fans', '팬 수', 'Fans', 2, 1, 3), P.color('body', '몸체 색', 'Body colour', '#e8e6df')],
  tags: ['vrf', 'top discharge', 'commercial outdoor unit', '상부 토출 실외기', '대형 실외기', '빌딩용 실외기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = p.fans, w = n * 0.85 + 0.1, h = 1.7, d = 0.76;
    k.box('body', 'metal-pc-cream', w, h - 0.1, d, 0, 0.1 + (h - 0.1) / 2, 0, { r: 0.006, ...C(p.body) });
    for (const sz of [-1, 1]) k.box('coil', 'metal-al-slotted', w - 0.1, h * 0.6, 0.004, 0, h * 0.45, sz * (d / 2 + 0.002), { r: 0 });
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.475 + i * 0.85;
      k.cyl('fans', 'metal-black-mesh', 0.33, 0.33, 0.08, x, h, 0, { segs: k.seg(28, 10) });
      k.add('fans', 'metal-pc-black-matte', T(new THREE.TorusGeometry(0.34, 0.015, 6, k.seg(28, 10)), x, h + 0.08, 0, PI / 2));
    }
    k.box('base', 'metal-pc-anthracite', w, 0.1, d, 0, 0.05, 0, { r: 0.004 });
    return finish(k);
  },
});

const bracketOutdoor = aca({
  id: 'aca-outdoor-wall-bracket', placement: 'wall', elevation: 1.2, ko: '실외기 앵글 거치 (벽면)', en: 'Outdoor unit on wall bracket',
  params: [P.len('width', '폭', 'Width', 0.8, 0.7, 0.95), P.bool('cover', '루버 커버', 'Louvre cover', false)],
  tags: ['outdoor unit bracket', 'wall bracket', 'balcony', '실외기 앵글', '실외기 거치대', '벽면 실외기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.55, d = 0.28;
    for (const sx of [-1, 1]) {
      k.box('bracket', 'metal-steel-galvanised', 0.04, 0.04, d + 0.15, sx * (w / 2 - 0.1), 0.02, (d + 0.15) / 2, { r: 0.002 });
      k.rod('bracket', 'metal-steel-galvanised', [sx * (w / 2 - 0.1), -0.3, 0.01], [sx * (w / 2 - 0.1), 0, d + 0.1], 0.015, { segs: 6 });
      k.box('bracket', 'metal-steel-galvanised', 0.04, 0.35, 0.03, sx * (w / 2 - 0.1), -0.15, 0.015, { r: 0.002 });
    }
    k.box('body', 'metal-pc-cream', w, h, d, 0, 0.04 + h / 2, d / 2 + 0.1, { r: 0.006, ...C('#e8e6df') });
    if (p.cover) slats(k, 'cover', 'wood-melamine-white', w + 0.04, h, 0, 0.04 + h / 2, d + 0.1, 10, -0.6);
    else fanGrille(k, -w * 0.12, 0.04 + h / 2, d + 0.102, h * 0.38);
    return finish(k);
  },
});

const rooftop = aca({
  id: 'aca-rooftop-package-unit', ko: '옥상형 패키지 냉방기 (루프탑)', en: 'Rooftop packaged unit',
  params: [P.len('length', '길이', 'Length', 2.4, 1.8, 3.2), P.color('body', '몸체 색', 'Body colour', '#d9dadb')],
  tags: ['rooftop unit', 'rtu', 'packaged unit', '루프탑', '옥상 냉방기', '패키지 에어컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, w = 1.4, h = 1.2;
    k.box('curb', 'metal-steel-galvanised', L - 0.1, 0.2, w - 0.1, 0, 0.1, 0, { r: 0.004 });
    k.box('body', 'metal-pc-light-grey', L, h - 0.2, w, 0, 0.2 + (h - 0.2) / 2, 0, { r: 0.006, ...C(p.body) });
    for (let i = 0; i < 2; i++) { k.cyl('fans', 'metal-black-mesh', 0.3, 0.3, 0.06, L * 0.15 + i * 0.7 - 0.35, h, 0, { segs: k.seg(24, 8) }); }
    k.box('coil', 'metal-al-slotted', L * 0.45, h * 0.6, 0.004, L * 0.2, h * 0.55, w / 2 + 0.002, { r: 0 });
    k.box('panels', 'metal-pc-light-grey', 0.6, 0.7, 0.01, -L * 0.3, h * 0.55, w / 2 + 0.005, { r: 0.004, ...C(p.body) });
    return finish(k);
  },
});

/* ============================================================ air curtain, ventilation, controls */

const airCurtain = aca({
  id: 'aca-air-curtain', placement: 'wall', elevation: 2.15, ko: '에어 커튼 (출입문 상부)', en: 'Door air curtain',
  params: [P.len('length', '길이', 'Length', 1.0, 0.9, 1.8), P.bool('on', '운전', 'Running', false)],
  tags: ['air curtain', 'door air barrier', 'entrance', '에어 커튼', '에어 커텐', '출입문 바람막이'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, h = 0.2, d = 0.22;
    k.box('body', 'metal-pc-white-perforated', L, h, d, 0, h / 2, d / 2, { r: 0.02, ...C('#f2f2f2') });
    k.box('nozzle', 'plastic-abs-matte-black', L - 0.06, 0.004, 0.04, 0, -0.001, d * 0.7, { r: 0 });
    k.box('display', RUN(p.on), 0.02, 0.008, 0.002, L / 2 - 0.05, h * 0.6, d + 0.001, { r: 0 });
    return finish(k);
  },
});

const erv = aca({
  id: 'aca-erv-ventilation-unit', placement: 'ceiling', elevation: 2.7 - 0.27, ko: '전열교환 환기장치 (천장 매립)', en: 'Energy recovery ventilator (ceiling)',
  params: [P.len('width', '폭', 'Width', 0.9, 0.7, 1.2), P.bool('ducts', '덕트', 'Ducts', true)],
  tags: ['erv', 'hrv', 'ventilation', 'heat recovery', '전열교환기', '환기 장치', '공기 순환'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = 0.27, d = 0.8;
    k.box('body', 'metal-steel-galvanised', w, h, d, 0, h / 2, 0, { r: 0.004 });
    k.box('labels', 'paper', 0.2, 0.004, 0.1, 0, -0.001, 0, { r: 0 });
    if (p.ducts) for (const [x, sz] of [[-w * 0.3, 1], [w * 0.3, 1], [-w * 0.3, -1], [w * 0.3, -1]]) k.cyl('ducts', 'metal-al-foil', 0.08, 0.08, 0.35, x, h / 2, sz * d / 2, { rx: sz * PI / 2, segs: k.seg(16, 6) });
    return finish(k);
  },
});

const ceilingVent = aca({
  id: 'aca-ceiling-diffuser-square', placement: 'ceiling', elevation: 2.4 - 0.05, ko: '천장 디퓨저 (사각 4방)', en: 'Square ceiling air diffuser',
  params: [P.len('size', '크기', 'Size', 0.6, 0.3, 0.6), P.pick('finish', '마감', 'Finish', 'white', [['white', '흰색', 'White'], ['silver', '은색', 'Silver']])],
  tags: ['ceiling diffuser', 'air diffuser', 'supply air', '천장 디퓨저', '급기구', '환기구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size, m = p.finish === 'white' ? 'plastic-abs-matte-white' : 'metal-al-brushed';
    for (let i = 0; i < 4; i++) { const r = s / 2 - i * (s * 0.1); k.panel('rings', m, frameShape(r * 2, r * 2, s * 0.03), 0.01, 0, 0.012 - i * 0.004, 0, { rx: PI / 2 }); }
    k.box('core', 'plastic-abs-matte-black', s * 0.3, 0.004, s * 0.3, 0, 0.0, 0, { r: 0 });
    k.box('neck', 'metal-steel-galvanised', s * 0.5, 0.04, s * 0.5, 0, 0.03, 0, { r: 0 });
    return finish(k);
  },
});

const fanCoil = aca({
  id: 'aca-fan-coil-ceiling', placement: 'ceiling', elevation: 2.7 - 0.28, ko: '팬코일 유닛 (천장 노출)', en: 'Exposed ceiling fan coil unit',
  params: [P.len('length', '길이', 'Length', 1.2, 0.8, 1.6), P.bool('pipes', '배관', 'Pipes', true)],
  tags: ['fan coil', 'fcu', 'hydronic', '팬코일', 'FCU', '냉난방 유닛'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, h = 0.25, d = 0.55;
    k.box('body', 'metal-pc-white-perforated', L, h, d, 0, h / 2, 0, { r: 0.006, ...C('#eeeeee') });
    slats(k, 'grille', 'plastic-abs-matte-grey', L - 0.1, 0.12, 0, h * 0.5, d / 2, 5, -0.5);
    if (p.pipes) for (const z of [-0.08, 0.0, 0.08]) k.rod('pipes', 'metal-copper-satin', [-L / 2, h * 0.5, z], [-L / 2 - 0.25, h * 0.5, z], 0.012, { segs: 8 });
    return finish(k);
  },
});

const thermostat = aca({
  id: 'aca-wall-thermostat', placement: 'wall', elevation: 1.4, ko: '에어컨 벽면 온도 조절기', en: 'Wall thermostat controller',
  params: [P.pick('kind', '종류', 'Type', 'touch', [['touch', '터치 화면', 'Touch screen'], ['dial', '다이얼', 'Dial'], ['button', '버튼', 'Buttons']]), P.bool('on', '화면 켜짐', 'Screen on', true)],
  tags: ['thermostat', 'wall controller', 'temperature controller', '온도 조절기', '에어컨 리모컨', '벽면 컨트롤러'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = 0.09;
    k.box('body', 'plastic-abs-matte-white', s, s, 0.018, 0, s / 2, 0.009, { r: 0.012 });
    if (p.kind === 'dial') {
      k.cyl('dial', 'metal-ss-brushed', 0.03, 0.03, 0.012, 0, s / 2, 0.018, { rx: PI / 2, segs: k.seg(24, 8) });
      k.box('display', p.on ? 'led-cyan' : 'plastic-abs-matte-grey', 0.02, 0.008, 0.002, 0, s / 2, 0.031, { r: 0 });
    } else {
      k.box('display', p.on ? 'screen-on-dark' : 'screen-matte-off', s * 0.75, s * (p.kind === 'touch' ? 0.75 : 0.4), 0.002, 0, p.kind === 'touch' ? s / 2 : s * 0.65, 0.0185, { r: 0.004 });
      if (p.kind === 'button') for (let i = 0; i < 4; i++) k.box('buttons', 'plastic-abs-matte-grey', 0.014, 0.01, 0.003, -0.03 + i * 0.02, s * 0.25, 0.0195, { r: 0.002 });
    }
    return finish(k);
  },
});

const remoteHolder = aca({
  id: 'aca-remote-wall-holder', placement: 'wall', elevation: 1.3, ko: '에어컨 리모컨과 벽 거치대', en: 'Air conditioner remote on wall holder',
  params: [P.color('remote', '리모컨 색', 'Remote colour', '#f2f2f2')],
  tags: ['remote control', 'remote holder', 'air conditioner remote', '에어컨 리모컨', '리모컨 거치대', '리모컨'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('holder', 'plastic-abs-matte-white', 0.06, 0.08, 0.025, 0, 0.04, 0.0125, { r: 0.008 });
    k.box('remote', 'plastic-abs-gloss-white', 0.05, 0.17, 0.02, 0, 0.1, 0.02, { r: 0.012, ...C(p.remote) });
    k.box('display', 'screen-on-white', 0.035, 0.03, 0.002, 0, 0.155, 0.031, { r: 0.002 });
    for (let i = 0; i < 6; i++) k.box('buttons', 'plastic-abs-matte-grey', 0.012, 0.008, 0.003, -0.011 + (i % 2) * 0.022, 0.12 - Math.floor(i / 2) * 0.016, 0.031, { r: 0.002 });
    return finish(k);
  },
});

const heatPumpBoiler = aca({
  id: 'aca-heat-pump-indoor-tower', ko: '히트펌프 실내 유닛 (냉난방 일체)', en: 'Heat pump indoor tower unit',
  params: [P.len('height', '높이', 'Height', 1.75, 1.5, 1.9), P.bool('on', '운전', 'Running', true)],
  tags: ['heat pump', 'hydro unit', 'air to water', '히트펌프', '냉난방기', '공기열 히트펌프'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = 0.6, d = 0.65;
    k.box('body', 'metal-pc-white-perforated', w, h, d, 0, h / 2, 0, { r: 0.02, ...C('#f4f4f4') });
    k.box('panel', 'glass-bp-black', w * 0.5, 0.12, 0.006, 0, h * 0.8, d / 2 + 0.003, { r: 0.01 });
    k.box('display', RUN(p.on), 0.1, 0.03, 0.002, 0, h * 0.8, d / 2 + 0.007, { r: 0.002 });
    for (const x of [-0.18, -0.06, 0.06, 0.18]) k.rod('pipes', 'metal-copper-satin', [x, h, -d / 4], [x, h + 0.12, -d / 4], 0.012, { segs: 8 });
    return finish(k);
  },
});

export const ITEMS = [
  slimWall, premiumWall, squareWall, multiSet, roundStand, slimStand, columnStand,
  ...cassettes, suspended, ducted, linearSlot, floorConsole, windowAc, throughWall, portableDual, evaporative,
  outdoorSingle, vrfSide, vrfTop, bracketOutdoor, rooftop, airCurtain, erv, ceilingVent, fanCoil, thermostat, remoteHolder, heatPumpBoiler,
];
