// Computers (컴퓨터) category, part 1: laptops, desktops and towers, mini PCs, all-in-ones, monitors
// (office, pro, gaming, ultrawide, portrait, portable, multi-arm setups), keyboards, mice, pads and
// audio / video (webcams, speakers, soundbar, headsets, microphones, conference bar, stream deck).
// Units metres, Y up, front +Z, origin bottom centre (finish() centres every build).
import { THREE, Kit, P, T, roundRect } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { C } from './accessories-plus.js';

const PI = Math.PI;
export const CMP = 'computer';
/** A computers entry: surface placement unless stated. */
export const cmp = (def) => mk({ category: CMP, placement: 'surface', ...def });
const SCREENS = [['desktop', '바탕화면', 'Desktop'], ['dark', '어두운 앱', 'Dark app'], ['white', '문서', 'Document'], ['nature', '사진', 'Photo'], ['off', '꺼짐', 'Off']];
export const SCREEN = (def = 'desktop') => P.pick('screen', '화면', 'Screen', def, SCREENS);
export const screenMat = (s) => (s === 'off' ? 'screen-matte-off' : `screen-on-${s}`);

/** Flat keyboard: w × d on top of y, rows of key caps (merged per row when lite). */
export function keyboard(k, w, d, x, y, z, { mat = 'plastic-abs-matte-black', keyMat = 'plastic-abs-matte-anthracite', tilt = 0.05, rows = 5, cols = 15, o = {} } = {}) {
  k.box('keyboard', mat, w, 0.018, d, x, y + 0.009, z, { r: 0.004, rx: tilt, ...o });
  const kw = (w - 0.02) / cols, kd = (d - 0.02) / rows;
  for (let r = 0; r < rows; r++) k.box('keys', keyMat, w - 0.02, 0.006, kd * 0.8, x, y + 0.02 + (r - rows / 2) * kd * Math.sin(tilt), z - d / 2 + 0.01 + (r + 0.5) * kd, { r: 0.001, rx: tilt });
  if (k.hi) for (let c = 1; c < cols; c++) k.box('gaps', 'plastic-black', 0.0015, 0.0065, d - 0.025, x - w / 2 + 0.01 + c * kw, y + 0.0205, z, { r: 0, rx: tilt });
}

/** Reverses the winding and normals of a geometry (an open cylinder seen from inside). */
function flipGeo(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const a = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = a; }
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}

/** A monitor on a stand: panel w × h (bezel b), centre height cy above y0, stand style. */
export function monitor(k, w, h, cy, { screen = 'desktop', stand = 'foot', curve = 0, body = 'plastic-abs-matte-black', bezel = 0.008, y0 = 0, z0 = 0, x0 = 0, ry = 0, o = {} } = {}) {
  const t = 0.02;
  const s = (dx, dz) => [x0 + Math.cos(ry) * dx + Math.sin(ry) * dz, z0 - Math.sin(ry) * dx + Math.cos(ry) * dz];
  if (curve > 0) {
    const R = w / curve, segs = k.seg(24, 8);
    const g = new THREE.CylinderGeometry(R, R, h, segs, 1, true, -curve / 2, curve);
    g.rotateY(PI);
    g.translate(0, y0 + cy, z0 + R);
    k.add('screen', screenMat(screen), flipGeo(g));
    const back = new THREE.CylinderGeometry(R + t, R + t, h + bezel * 2, segs, 1, true, -curve / 2 - 0.01, curve + 0.02);
    back.rotateY(PI); back.translate(0, y0 + cy, z0 + R);
    k.add('body', body, back, o);
  } else {
    const [bx, bz] = s(0, -t / 2);
    k.box('body', body, w + bezel * 2, h + bezel * 2, t, bx, y0 + cy, bz, { r: 0.004, ry, ...o });
    const [sx, sz] = s(0, 0.0005);
    k.box('screen', screenMat(screen), w, h, 0.002, sx, y0 + cy, sz, { r: 0, ry });
  }
  const [px, pz] = s(0, -t - 0.03);
  if (stand === 'foot') {
    k.box('stand', body, 0.05, cy - h * 0.2, 0.025, px, y0 + (cy - h * 0.2) / 2 + 0.01, pz, { r: 0.006, ry, ...o });
    const [fx, fz] = s(0, -t - 0.02);
    k.box('stand', body, Math.min(0.3, w * 0.45), 0.012, 0.2, fx, y0 + 0.006, fz, { r: 0.006, ry, ...o });
  } else if (stand === 'v') {
    for (const sx2 of [-1, 1]) { const [vx, vz] = s(sx2 * 0.1, 0.0); k.rod('stand', body, [px, y0 + cy - h * 0.25, pz], [vx, y0 + 0.006, vz + 0.08], 0.01, { segs: 8, ...o }); }
    k.box('stand', body, 0.04, cy - h * 0.15, 0.03, px, y0 + (cy - h * 0.15) / 2, pz, { r: 0.006, ry, ...o });
  } else if (stand === 'arm') {
    k.box('stand', 'metal-pc-black-matte', 0.08, 0.08, 0.02, px, y0 + cy, pz, { r: 0.004, ry });
  }
}

/* ============================================================ laptops */

/** Laptop: base w × d, lid open angle `open` (radians from closed), screen. */
function laptop(k, w, d, { open = 1.9, screen = 'desktop', body = 'metal-al-anodised-grey', keyMat = 'plastic-abs-matte-black', thick = 0.015, bezel = 0.008, o = {} } = {}) {
  k.box('base', body, w, thick, d, 0, thick / 2, 0, { r: 0.004, ...o });
  k.box('keys', keyMat, w * 0.86, 0.0015, d * 0.42, 0, thick + 0.0007, -d * 0.12, { r: 0 });
  k.box('trackpad', body, w * 0.32, 0.001, d * 0.25, 0, thick + 0.0005, d * 0.28, { r: 0.002, ...o });
  const lidH = d - 0.005, t = 0.006, th = open, rx = PI / 2 - th;
  const ny = -Math.sin(rx), nz = Math.cos(rx);
  const cy = thick + Math.sin(th) * lidH / 2 - ny * t / 2, cz = -d / 2 + Math.cos(th) * lidH / 2 - nz * t / 2;
  k.box('lid', body, w, lidH, t, 0, cy, cz, { r: 0.004, rx, ...o });
  k.box('screen', screenMat(screen), w - bezel * 2, lidH - bezel * 2.5, 0.0015, 0, cy + ny * (t / 2 + 0.0008), cz + nz * (t / 2 + 0.0008), { r: 0, rx });
}

const LAPTOPS = [
  ['cmp-laptop-13-ultrabook', '13인치 울트라북', '13-inch ultrabook', 0.3, 0.21, 'metal-al-anodised-grey', 0.013, ['ultrabook', 'thin laptop', '울트라북', '얇은 노트북']],
  ['cmp-laptop-14-business', '14인치 비즈니스 노트북', '14-inch business laptop', 0.322, 0.222, 'plastic-abs-matte-black', 0.017, ['business laptop', 'thinkpad style', '비즈니스 노트북', '업무용 노트북']],
  ['cmp-laptop-16-pro', '16인치 프로 노트북', '16-inch pro laptop', 0.356, 0.248, 'metal-al-anodised-clear', 0.016, ['pro laptop', 'creator laptop', '프로 노트북', '고성능 노트북']],
  ['cmp-laptop-17-gaming', '17인치 게이밍 노트북', '17-inch gaming laptop', 0.395, 0.29, 'plastic-abs-matte-anthracite', 0.026, ['gaming laptop', 'rgb laptop', '게이밍 노트북', '게임용 노트북']],
  ['cmp-chromebook', '크롬북 (11인치)', 'Chromebook 11-inch', 0.29, 0.2, 'plastic-abs-matte-grey', 0.019, ['chromebook', 'student laptop', '크롬북', '학생용 노트북']],
  ['cmp-laptop-15-budget', '15인치 보급형 노트북', '15-inch budget laptop', 0.36, 0.24, 'plastic-abs-matte-grey', 0.02, ['budget laptop', 'home laptop', '보급형 노트북', '가정용 노트북']],
  ['cmp-rugged-laptop', '러기드 노트북 (현장용)', 'Rugged field laptop', 0.35, 0.28, 'plastic-abs-matte-anthracite', 0.045, ['rugged laptop', 'field laptop', 'toughbook', '러기드 노트북', '현장용 노트북', '방진 방수']],
];

const laptops = LAPTOPS.map(([id, ko, en, w, d, body, thick, tags]) => cmp({
  id, ko, en,
  params: [P.num('open', '화면 각도', 'Lid angle', 1.95, 0, 2.4, 0.05), SCREEN()],
  tags: [...tags, 'laptop', 'notebook', '노트북', '랩톱'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    laptop(k, w, d, { open: p.open, screen: p.screen, body, thick });
    if (id === 'cmp-laptop-17-gaming') k.box('rgb', 'led-cyan', w * 0.86, 0.0006, 0.004, 0, thick + 0.0018, -d * 0.12 + d * 0.21, { r: 0 });
    if (id === 'cmp-rugged-laptop') for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('bumpers', 'rubber-black', 0.04, thick + 0.004, 0.04, sx * (w / 2 - 0.015), thick / 2, sz * (d / 2 - 0.015), { r: 0.008 });
    return finish(k);
  },
}));

const convertible = cmp({
  id: 'cmp-2in1-convertible', ko: '2in1 컨버터블 노트북 (텐트 모드)', en: '2-in-1 convertible laptop (tent mode)',
  params: [P.num('angle', '텐트 각도', 'Tent angle', 0.9, 0.4, 1.3, 0.05), SCREEN('nature')],
  tags: ['2 in 1', 'convertible laptop', 'tent mode', '2in1 노트북', '컨버터블', '태블릿 노트북'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.3, d = 0.21, a = p.angle / 2;
    for (const s of [-1, 1]) k.box('halves', 'metal-al-anodised-grey', w, d, 0.008, 0, Math.cos(a) * d / 2, s * Math.sin(a) * d / 2, { r: 0.004, rx: s * a });
    k.box('screen', screenMat(p.screen), w - 0.016, d - 0.02, 0.0015, 0, Math.cos(a) * d / 2, Math.sin(a) * d / 2 + 0.0045 * Math.cos(a), { r: 0, rx: a });
    k.rod('pen', 'plastic-abs-gloss-white', [w * 0.6, 0.004, 0.05], [w * 0.6, 0.004, -0.09], 0.0045, { segs: 8 });
    return finish(k);
  },
});

const detachable = cmp({
  id: 'cmp-tablet-keyboard-cover', ko: '태블릿 PC와 키보드 커버', en: 'Tablet PC with keyboard cover',
  params: [P.num('kick', '킥스탠드 각도', 'Kickstand angle', 0.4, 0.2, 0.9, 0.05), SCREEN('white'), P.color('cover', '커버 색', 'Cover colour', '#2f3a52')],
  tags: ['tablet pc', 'surface style', 'keyboard cover', '태블릿 PC', '키보드 커버', '투인원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.29, h = 0.2, a = p.kick;
    k.box('tablet', 'metal-al-anodised-grey', w, h, 0.009, 0, Math.cos(a) * h / 2 + 0.004, -Math.sin(a) * h / 2, { r: 0.006, rx: -a });
    k.box('screen', screenMat(p.screen), w - 0.02, h - 0.02, 0.0015, 0, Math.cos(a) * h / 2 + 0.004 + 0.005 * Math.sin(a), -Math.sin(a) * h / 2 + 0.005 * Math.cos(a), { r: 0, rx: -a });
    k.box('kickstand', 'metal-al-anodised-grey', w * 0.95, h * 0.7, 0.003, 0, Math.cos(0.6) * h * 0.35, -Math.sin(a) * h - 0.04, { r: 0.004, rx: 0.6 });
    k.box('cover', 'fabric-felt-charcoal', w, 0.005, 0.2, 0, 0.0025, 0.1, { r: 0.002, ...C(p.cover) });
    k.box('keys', 'plastic-abs-matte-black', w * 0.86, 0.0012, 0.1, 0, 0.0055, 0.07, { r: 0 });
    return finish(k);
  },
});

/* ============================================================ desktops */

/** PC tower: w × h × d, front style, optional glass side + RGB fans. */
function tower(k, w, h, d, { body = 'metal-pc-black-matte', front = 'mesh', glass = true, rgb = 'led-cyan', fans = 3, o = {} } = {}) {
  k.box('case', body, w, h, d, 0, h / 2 + 0.02, 0, { r: 0.006, ...o });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('feet', 'rubber-black', 0.04, 0.02, 0.06, sx * (w / 2 - 0.03), 0.01, sz * (d / 2 - 0.05), { r: 0.006 });
  if (front === 'mesh') k.box('front', 'metal-pc-black-perforated', w - 0.02, h - 0.04, 0.004, 0, h / 2 + 0.02, d / 2 + 0.002, { r: 0 });
  else if (front === 'glass') k.box('front', 'glass-tint-smoke-dark', w - 0.01, h - 0.02, 0.004, 0, h / 2 + 0.02, d / 2 + 0.003, { r: 0.002 });
  else if (front === 'bay') { k.box('front', 'plastic-abs-matte-black', w, h, 0.012, 0, h / 2 + 0.02, d / 2 + 0.006, { r: 0.004 }); k.box('bays', 'plastic-abs-matte-anthracite', w * 0.8, 0.04, 0.003, 0, h - 0.04, d / 2 + 0.013, { r: 0 }); }
  if (front !== 'bay') for (let i = 0; i < Math.min(fans, 3); i++) k.add('fans', rgb, T(new THREE.TorusGeometry(Math.min(w * 0.38, 0.06), 0.004, 4, k.seg(24, 8)), 0, h * 0.25 + 0.02 + i * h * 0.27, d / 2 - 0.004));
  if (glass) {
    k.box('glass', 'glass-tint-smoke-dark', 0.004, h - 0.04, d - 0.04, w / 2 + 0.002, h / 2 + 0.02, 0, { r: 0 });
    k.box('internals', 'plastic-abs-matte-anthracite', 0.005, h * 0.6, d * 0.6, -w / 2 + 0.03, h * 0.58, -d * 0.1, { r: 0 });
    k.box('internals', 'metal-al-anodised-black', w * 0.5, 0.05, 0.12, 0.0, h * 0.62, -0.02, { r: 0.004 });
    k.box('gpu', 'metal-al-anodised-black', w * 0.7, 0.04, d * 0.55, -0.0, h * 0.42, 0.0, { r: 0.004 });
  }
  k.box('buttons', 'metal-chrome', 0.02, 0.004, 0.02, w * 0.3, h + 0.022, d * 0.35, { r: 0.002 });
}

const TOWERS = [
  ['cmp-gaming-tower-rgb', '게이밍 PC (RGB 강화유리)', 'RGB gaming PC tower', 0.23, 0.48, 0.47, { front: 'mesh', glass: true, rgb: 'led-cyan', fans: 3 }, ['gaming pc', 'rgb', 'tempered glass', '게이밍 PC', '조립 PC', 'RGB']],
  ['cmp-white-tower-glass', '화이트 PC (어항형 케이스)', 'White dual-glass PC case', 0.28, 0.45, 0.44, { front: 'glass', glass: true, rgb: 'led-pink', fans: 3, o: C('#f2f2f2') }, ['white pc', 'fish tank case', 'dual chamber', '화이트 PC', '어항 케이스', '조립 PC']],
  ['cmp-office-tower', '사무용 데스크톱 (미니타워)', 'Office mini-tower desktop', 0.17, 0.36, 0.33, { front: 'bay', glass: false, fans: 0 }, ['office pc', 'desktop', 'mini tower', '사무용 PC', '데스크톱', '본체']],
  ['cmp-workstation-tower', '워크스테이션 (풀타워)', 'Full-tower workstation', 0.22, 0.56, 0.55, { front: 'mesh', glass: false, fans: 3, rgb: 'led-blue' }, ['workstation', 'cad pc', 'full tower', '워크스테이션', 'CAD 컴퓨터', '풀타워']],
  ['cmp-sff-desktop', '슬림형 데스크톱 (SFF)', 'Small form factor desktop', 0.095, 0.29, 0.3, { front: 'bay', glass: false, fans: 0 }, ['sff', 'slim pc', 'small form factor', '슬림 PC', '소형 데스크톱']],
  ['cmp-itx-cube', 'ITX 큐브 PC', 'Mini-ITX cube PC', 0.2, 0.25, 0.3, { front: 'mesh', glass: true, rgb: 'led-purple', fans: 1 }, ['itx', 'cube pc', 'compact gaming', 'ITX PC', '큐브 PC', '미니 PC']],
  ['cmp-tower-server', '타워형 서버 (사무실용)', 'Small-business tower server', 0.2, 0.44, 0.6, { front: 'bay', glass: false, fans: 0 }, ['tower server', 'small business server', '타워 서버', '사무실 서버', '파일 서버']],
];

const towers = TOWERS.map(([id, ko, en, w, h, d, o, tags]) => cmp({
  id, placement: 'floor', ko, en,
  params: [P.len('height', '높이', 'Height', h, h * 0.8, h * 1.2), P.bool('glass', '측면 유리', 'Glass side', !!o.glass)],
  tags: [...tags, 'computer', 'pc tower', '컴퓨터', 'PC 본체'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    tower(k, w, p.height, d, { ...o, glass: p.glass });
    return finish(k);
  },
}));

const miniPc = cmp({
  id: 'cmp-mini-pc-nuc', ko: '미니 PC (NUC형)', en: 'Mini PC (NUC style)',
  params: [P.len('size', '크기', 'Size', 0.117, 0.1, 0.15), P.bool('vesa', '모니터 뒤 장착판', 'VESA plate', false)],
  tags: ['mini pc', 'nuc', 'tiny pc', '미니 PC', '초소형 PC', 'NUC'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('case', 'metal-al-anodised-black', s, 0.05, s, 0, 0.025, 0, { r: 0.008 });
    k.box('top', 'plastic-abs-gloss-black', s - 0.004, 0.002, s - 0.004, 0, 0.0505, 0, { r: 0.006 });
    k.box('leds', 'led-blue', 0.006, 0.002, 0.002, s * 0.3, 0.03, s / 2 + 0.001, { r: 0 });
    for (let i = 0; i < 2; i++) k.box('ports', 'plastic-black', 0.012, 0.005, 0.002, -s * 0.2 + i * 0.016, 0.02, s / 2 + 0.001, { r: 0 });
    if (p.vesa) k.box('vesa', 'metal-pc-black-matte', 0.1, 0.002, 0.1, 0, 0.001, 0, { r: 0 });
    return finish(k);
  },
});

const macMiniLike = cmp({
  id: 'cmp-compact-desktop-square', ko: '정사각 소형 데스크톱 (알루미늄)', en: 'Compact aluminium desktop',
  params: [P.len('size', '크기', 'Size', 0.197, 0.127, 0.2), P.mat('body', '몸체', 'Body', 'metal-al-anodised-clear', 'metal')],
  tags: ['compact desktop', 'mini desktop', 'aluminium', '소형 데스크톱', '알루미늄 PC', '미니 컴퓨터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('case', p.body, s, s * 0.18, s, 0, s * 0.09 + 0.002, 0, { r: s * 0.12 });
    k.cyl('foot', 'plastic-abs-matte-black', s * 0.38, s * 0.38, 0.003, 0, 0, 0, { segs: k.seg(24, 8) });
    k.box('leds', 'led-green', 0.003, 0.003, 0.002, s * 0.4, s * 0.09, s / 2 + 0.001, { r: 0 });
    return finish(k);
  },
});

const stickPc = cmp({
  id: 'cmp-pc-stick-hdmi', ko: '스틱 PC (HDMI)', en: 'HDMI stick PC',
  params: [P.color('body', '색', 'Colour', '#2b2b2b')],
  tags: ['stick pc', 'compute stick', 'hdmi dongle', '스틱 PC', '동글 PC', '미니 컴퓨터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-black', 0.11, 0.012, 0.038, 0, 0.006, 0, { r: 0.004, ...C(p.body) });
    k.box('plug', 'metal-chrome', 0.015, 0.0045, 0.014, 0.0625, 0.006, 0, { r: 0.0005 });
    return finish(k);
  },
});

const aio = (id, ko, en, w, h, tags, { body = 'metal-al-anodised-clear', chin = true } = {}) => cmp({
  id, ko, en,
  params: [SCREEN(), P.bool('keyboard', '키보드', 'Keyboard', true)],
  tags: [...tags, 'all in one', 'aio pc', '일체형 PC', '올인원'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cy = 0.1 + h / 2 + (chin ? 0.05 : 0);
    k.box('body', body, w + 0.02, h + (chin ? 0.08 : 0.02), 0.012, 0, cy - (chin ? 0.03 : 0), 0, { r: 0.008 });
    k.box('screen', screenMat(p.screen), w, h, 0.002, 0, cy, 0.0065, { r: 0 });
    k.box('stand', body, 0.14, 0.2, 0.012, 0, 0.1, -0.06, { r: 0.004, rx: 0.3 });
    k.box('stand', body, 0.14, 0.006, 0.16, 0, 0.003, -0.06, { r: 0.004 });
    if (p.keyboard) keyboard(k, 0.28, 0.11, 0, 0, 0.18, { mat: 'metal-al-anodised-clear', keyMat: 'plastic-abs-matte-white', rows: 5, tilt: 0 });
    return finish(k);
  },
});

const aios = [
  aio('cmp-aio-24-colour', '24인치 일체형 PC (컬러)', '24-inch colour all-in-one', 0.52, 0.29, ['24 inch', 'colourful aio', '24인치 일체형', '컬러 PC'], { body: 'metal-al-anodised-blue' }),
  aio('cmp-aio-27-pro', '27인치 일체형 PC (프로)', '27-inch pro all-in-one', 0.6, 0.34, ['27 inch', 'pro aio', '27인치 일체형', '디자이너 PC'], { chin: false }),
];

/* ============================================================ monitors */

const MONS = [
  ['cmp-monitor-24-office', '24인치 사무용 모니터', '24-inch office monitor', 0.53, 0.3, 0, 'foot', ['24 inch monitor', 'office monitor', 'fhd', '24인치 모니터', '사무용 모니터']],
  ['cmp-monitor-27-4k', '27인치 4K 모니터', '27-inch 4K monitor', 0.6, 0.34, 0, 'foot', ['27 inch', '4k monitor', 'uhd', '27인치 모니터', '4K 모니터']],
  ['cmp-monitor-32-pro', '32인치 프로 디스플레이', '32-inch pro display', 0.71, 0.4, 0, 'foot', ['32 inch', 'pro display', 'colour accurate', '32인치 모니터', '전문가용 모니터']],
  ['cmp-monitor-34-ultrawide', '34인치 커브드 울트라와이드', '34-inch curved ultrawide', 0.8, 0.34, 0.75, 'v', ['ultrawide', 'curved monitor', '21:9', '울트라와이드', '커브드 모니터', '34인치']],
  ['cmp-monitor-49-super-ultrawide', '49인치 슈퍼 울트라와이드', '49-inch super ultrawide', 1.19, 0.34, 1.0, 'v', ['super ultrawide', '32:9', 'curved', '49인치 모니터', '슈퍼 울트라와이드']],
  ['cmp-monitor-27-gaming-240', '27인치 게이밍 모니터 (240Hz)', '27-inch 240Hz gaming monitor', 0.6, 0.34, 0, 'v', ['gaming monitor', '240hz', 'esports', '게이밍 모니터', '고주사율']],
  ['cmp-monitor-22-basic', '22인치 보급형 모니터', '22-inch basic monitor', 0.48, 0.27, 0, 'foot', ['22 inch', 'basic monitor', '22인치 모니터', '보급형 모니터']],
];

const monitors = MONS.map(([id, ko, en, w, h, curve, stand, tags]) => cmp({
  id, ko, en,
  params: [SCREEN(), P.len('height', '화면 중심 높이', 'Screen centre height', h / 2 + 0.12, h / 2 + 0.05, h / 2 + 0.25)],
  tags: [...tags, 'monitor', 'display', '모니터', '디스플레이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    monitor(k, w, h, p.height, { screen: p.screen, stand, curve });
    return finish(k);
  },
}));

const portrait = cmp({
  id: 'cmp-monitor-portrait-pivot', ko: '세로 피벗 모니터 (코딩용)', en: 'Portrait pivot monitor',
  params: [SCREEN('dark'), P.len('height', '화면 중심 높이', 'Screen centre height', 0.42, 0.35, 0.5)],
  tags: ['portrait monitor', 'pivot', 'vertical monitor', 'coding', '세로 모니터', '피벗 모니터', '코딩 모니터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    monitor(k, 0.3, 0.53, p.height, { screen: p.screen, stand: 'foot' });
    return finish(k);
  },
});

const hooded = cmp({
  id: 'cmp-monitor-hood-colour-grading', ko: '후드 장착 컬러 그레이딩 모니터', en: 'Colour-grading monitor with hood',
  params: [SCREEN('nature'), P.len('hood', '후드 깊이', 'Hood depth', 0.2, 0.1, 0.3)],
  tags: ['colour grading', 'monitor hood', 'photo editing', '컬러 그레이딩', '모니터 후드', '사진 편집'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.6, h = 0.34, cy = 0.33, D = p.hood;
    monitor(k, w, h, cy, { screen: p.screen, stand: 'foot', body: 'metal-pc-black-matte' });
    k.box('hood', 'fabric-felt-charcoal', w + 0.04, 0.006, D, 0, cy + h / 2 + 0.02, D / 2, { r: 0 });
    for (const s of [-1, 1]) k.box('hood', 'fabric-felt-charcoal', 0.006, h + 0.04, D, s * (w / 2 + 0.02), cy, D / 2, { r: 0 });
    return finish(k);
  },
});

const portableMon = cmp({
  id: 'cmp-portable-monitor-folio', ko: '포터블 모니터 (커버 스탠드)', en: 'Portable monitor with folio stand',
  params: [SCREEN(), P.num('angle', '기울기', 'Angle', 0.3, 0.15, 0.6, 0.01)],
  tags: ['portable monitor', 'usb-c monitor', 'travel screen', '포터블 모니터', '휴대용 모니터', '서브 모니터'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.36, h = 0.22, a = p.angle;
    k.box('panel', 'metal-al-anodised-grey', w, h, 0.008, 0, Math.cos(a) * h / 2 + 0.01, -Math.sin(a) * h / 2, { r: 0.004, rx: -a });
    k.box('screen', screenMat(p.screen), w - 0.012, h - 0.016, 0.0015, 0, Math.cos(a) * h / 2 + 0.01 + 0.0045 * Math.sin(a), -Math.sin(a) * h / 2 + 0.0045 * Math.cos(a), { r: 0, rx: -a });
    k.box('folio', 'leather-black', w, h * 0.7, 0.003, 0, Math.cos(0.9) * h * 0.35, -Math.sin(a) * h - 0.05, { r: 0.002, rx: 0.9 });
    k.box('folio', 'leather-black', w, 0.003, 0.03, 0, 0.0015, 0.0, { r: 0 });
    return finish(k);
  },
});

const dualArm = cmp({
  id: 'cmp-dual-monitor-arm-setup', ko: '듀얼 모니터 암 세트', en: 'Dual monitors on desk arm',
  params: [SCREEN(), P.len('size', '모니터 폭', 'Monitor width', 0.6, 0.48, 0.71), P.num('angle', '안쪽 각도', 'Toe-in', 0.2, 0, 0.4, 0.01)],
  tags: ['dual monitor', 'monitor arm', 'two screens', '듀얼 모니터', '모니터 암', '모니터 거치대'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.size, h = w * 0.5625, cy = 0.4, a = p.angle;
    k.box('clamp', 'metal-pc-black-matte', 0.08, 0.06, 0.1, 0, 0.03, -0.25, { r: 0.006 });
    k.cyl('pole', 'metal-pc-black-matte', 0.018, 0.018, cy + 0.1, 0, 0.06, -0.25, { segs: 10 });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.01) * Math.cos(a);
      k.rod('arms', 'metal-pc-black-matte', [0, cy, -0.25], [x * 0.6, cy, -0.1], 0.014, { segs: 8 });
      monitor(k, w, h, cy, { screen: p.screen, stand: 'arm', x0: x, z0: s * 0 + Math.sin(a) * w / 2 * 0.5 - 0.05, ry: -s * a });
    }
    return finish(k);
  },
});

const tripleArm = cmp({
  id: 'cmp-triple-monitor-stand', ko: '트리플 모니터 스탠드', en: 'Triple monitor stand',
  params: [SCREEN('dark'), P.len('size', '모니터 폭', 'Monitor width', 0.53, 0.48, 0.6)],
  tags: ['triple monitor', 'trading setup', 'three screens', '트리플 모니터', '트레이딩', '3화면'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.size, h = w * 0.5625, cy = 0.38, a = 0.35;
    k.box('base', 'metal-pc-black-matte', 0.35, 0.015, 0.25, 0, 0.0075, -0.2, { r: 0.006 });
    k.cyl('pole', 'metal-pc-black-matte', 0.02, 0.02, cy + 0.05, 0, 0.015, -0.2, { segs: 10 });
    k.box('bar', 'metal-pc-black-matte', w * 2.6, 0.03, 0.03, 0, cy, -0.12, { r: 0.004 });
    for (const s of [-1, 0, 1]) monitor(k, w, h, cy, { screen: p.screen, stand: 'arm', x0: s * (w + 0.01) * Math.cos(a * Math.abs(s)) , z0: Math.abs(s) * Math.sin(a) * w / 2 - 0.08, ry: -s * a });
    return finish(k);
  },
});

/* ============================================================ input */

const KBS = [
  ['cmp-keyboard-full', '풀배열 키보드', 'Full-size keyboard', 0.44, 0.135, 'plastic-abs-matte-black', 'plastic-abs-matte-anthracite', ['full size keyboard', '104 key', '풀배열 키보드', '사무용 키보드']],
  ['cmp-keyboard-tkl-mechanical', '텐키리스 기계식 키보드', 'Tenkeyless mechanical keyboard', 0.36, 0.14, 'metal-al-anodised-grey', 'plastic-abs-matte-white', ['tkl', 'mechanical keyboard', '텐키리스', '기계식 키보드']],
  ['cmp-keyboard-60-percent', '60% 미니 키보드', '60% compact keyboard', 0.29, 0.1, 'plastic-abs-matte-white', 'plastic-abs-gloss-pink', ['60 percent', 'compact keyboard', '미니 키보드', '60% 키보드']],
  ['cmp-keyboard-low-profile', '로우 프로파일 무선 키보드', 'Low-profile wireless keyboard', 0.42, 0.12, 'metal-al-anodised-clear', 'plastic-abs-matte-white', ['low profile', 'wireless keyboard', 'slim', '무선 키보드', '슬림 키보드']],
];

const keyboards = KBS.map(([id, ko, en, w, d, mat, keyMat, tags]) => cmp({
  id, ko, en,
  params: [P.color('keys', '키캡 색', 'Keycap colour', '#3a3a3a'), P.num('tilt', '기울기', 'Tilt', 0.05, 0, 0.12, 0.01), P.bool('rgb', 'RGB 조명', 'RGB backlight', id.includes('mechanical'))],
  tags: [...tags, 'keyboard', '키보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    keyboard(k, w, d, 0, 0, 0, { mat, keyMat, tilt: p.tilt, rows: d > 0.12 ? 6 : 5, o: {} });
    for (const part of k.parts.values()) if (part.role === 'keys' && p.keys !== '#3a3a3a') part.overrides = { color: p.keys };
    if (p.rgb) k.box('rgb', 'led-magenta', w - 0.01, 0.002, 0.004, 0, 0.004, d / 2 + 0.001, { r: 0 });
    return finish(k);
  },
}));

const splitKb = cmp({
  id: 'cmp-split-ergonomic-keyboard', ko: '분리형 인체공학 키보드', en: 'Split ergonomic keyboard',
  params: [P.num('splay', '벌림 각도', 'Splay', 0.25, 0, 0.5, 0.01), P.len('gap', '간격', 'Gap', 0.08, 0.02, 0.25)],
  tags: ['split keyboard', 'ergonomic keyboard', 'tented', '분리형 키보드', '인체공학 키보드', '스플릿'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const s of [-1, 1]) {
      const half = new Kit(ctx);
      keyboard(half, 0.19, 0.13, 0, 0, 0, { rows: 5, cols: 7 });
      half.soft('rest', 'leather-black', 0.16, 0.015, 0.06, 0.006, 0, 0.008, 0.1, { puff: 0.002 });
      for (const part of half.parts.values()) for (const g of part.geos) { g.rotateY(-s * p.splay); g.translate(s * (p.gap / 2 + 0.1), 0, 0); k.add(part.role, part.mat, g, { overrides: part.overrides, uv: 'keep' }); }
    }
    return finish(k);
  },
});

const MICE = [
  ['cmp-mouse-office', '사무용 마우스', 'Office mouse', 0.062, 0.11, 0.036, 'plastic-abs-matte-black', ['office mouse', 'wired mouse', '사무용 마우스', '유선 마우스']],
  ['cmp-mouse-gaming-rgb', '게이밍 마우스 (RGB)', 'RGB gaming mouse', 0.068, 0.126, 0.042, 'plastic-abs-matte-black', ['gaming mouse', 'rgb mouse', '게이밍 마우스', 'RGB 마우스']],
  ['cmp-mouse-travel', '휴대용 무선 마우스', 'Travel wireless mouse', 0.055, 0.095, 0.03, 'plastic-abs-gloss-white', ['travel mouse', 'wireless mouse', 'mini mouse', '무선 마우스', '휴대용 마우스']],
];

const mice = MICE.map(([id, ko, en, w, d, h, mat, tags]) => cmp({
  id, ko, en,
  params: [P.color('body', '색', 'Colour', mat.includes('white') ? '#f2f2f2' : '#2b2b2b'), P.bool('pad', '마우스 패드', 'Mouse pad', true)],
  tags: [...tags, 'mouse', 'computer mouse', '마우스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), o = C(p.body);
    k.sphere('body', mat, 0.5, 0, 0.0, 0, { thetaLength: PI / 2, segs: k.seg(24, 10), rings: k.seg(10, 5), scale: [w, h * 2, d], ...o });
    k.box('buttons', 'plastic-black', 0.002, h * 0.3, d * 0.35, 0, h * 0.75, -d * 0.25, { r: 0 });
    k.cyl('wheel', 'rubber-black', 0.009, 0.009, 0.006, -0.003, h * 0.9, -d * 0.25, { rz: PI / 2, segs: 12 });
    if (id.includes('gaming')) k.box('rgb', 'led-cyan', w * 0.3, 0.003, 0.012, 0, h * 0.45, d * 0.38, { r: 0.002 });
    if (p.pad) k.box('pad', 'fabric-felt-charcoal', 0.25, 0.003, 0.21, 0.02, -0.0015, 0.0, { r: 0.012 });
    return finish(k);
  },
}));

const vertMouse = cmp({
  id: 'cmp-vertical-mouse', ko: '버티컬 마우스', en: 'Vertical ergonomic mouse',
  params: [P.color('body', '색', 'Colour', '#3a3a3a')],
  tags: ['vertical mouse', 'ergonomic mouse', '버티컬 마우스', '인체공학 마우스', '손목 보호'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.sphere('body', 'plastic-abs-matte-black', 0.5, 0, 0, 0, { thetaLength: PI / 2, segs: k.seg(24, 10), rings: k.seg(10, 5), scale: [0.07, 0.15, 0.12], ...C(p.body) });
    for (const dz of [-0.02, 0.01]) k.box('buttons', 'plastic-abs-matte-grey', 0.004, 0.025, 0.025, 0.03, 0.04, dz, { r: 0.004, rz: 0.4 });
    return finish(k);
  },
});

const trackball = cmp({
  id: 'cmp-trackball', ko: '트랙볼 마우스', en: 'Trackball mouse',
  params: [P.color('ball', '볼 색', 'Ball colour', '#d9342b')],
  tags: ['trackball', 'thumb trackball', '트랙볼', '트랙볼 마우스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.sphere('body', 'plastic-abs-matte-black', 0.5, 0, 0, 0, { thetaLength: PI / 2, segs: k.seg(24, 10), rings: k.seg(10, 5), scale: [0.09, 0.09, 0.13] });
    k.sphere('ball', 'plastic-abs-gloss-red', 0.017, -0.03, 0.03, 0.02, { segs: 16, rings: 12, ...C(p.ball) });
    return finish(k);
  },
});

const deskMat = cmp({
  id: 'cmp-xl-desk-mouse-mat', ko: '대형 데스크 매트 (게이밍)', en: 'XL gaming desk mat',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.2), P.color('mat', '색', 'Colour', '#1e1f22'), P.bool('rgb', 'RGB 테두리', 'RGB edge', false)],
  tags: ['desk mat', 'mouse mat', 'xl pad', '데스크 매트', '장패드', '마우스 패드'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, d = w * 0.44;
    k.box('mat', 'fabric-felt-charcoal', w, 0.004, d, 0, 0.002, 0, { r: 0.0015, ...C(p.mat) });
    if (p.rgb) k.add('rgb', 'led-magenta', T(new THREE.BoxGeometry(w, 0.002, 0.004), 0, 0.004, d / 2 - 0.002));
    return finish(k);
  },
});

const drawingTablet = cmp({
  id: 'cmp-pen-tablet', ko: '펜 태블릿 (판형)', en: 'Pen tablet',
  params: [P.len('width', '폭', 'Width', 0.35, 0.2, 0.5)],
  tags: ['pen tablet', 'drawing tablet', 'graphics tablet', '펜 태블릿', '판 태블릿', '드로잉 태블릿'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, d = w * 0.62;
    k.box('tablet', 'plastic-abs-matte-black', w, 0.009, d, 0, 0.0045, 0, { r: 0.006 });
    k.box('area', 'plastic-abs-matte-anthracite', w * 0.72, 0.0005, d * 0.8, w * 0.08, 0.0092, 0, { r: 0 });
    for (let i = 0; i < 4; i++) k.box('keys', 'plastic-abs-matte-grey', 0.025, 0.002, 0.015, -w / 2 + 0.03, 0.0095, -d * 0.3 + i * 0.03, { r: 0.002 });
    k.rod('pen', 'plastic-abs-matte-black', [w * 0.2, 0.014, d * 0.35], [-w * 0.05, 0.014, d * 0.4], 0.005, { r2: 0.003, segs: 8 });
    return finish(k);
  },
});

const penDisplay = cmp({
  id: 'cmp-pen-display', ko: '액정 타블렛 (펜 디스플레이)', en: 'Pen display tablet',
  params: [SCREEN('nature'), P.num('angle', '각도', 'Angle', 0.35, 0.15, 1.2, 0.01)],
  tags: ['pen display', 'drawing display', 'liquid crystal tablet', '액정 타블렛', '펜 디스플레이', '그림 그리기'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = 0.42, h = 0.27, a = p.angle;
    k.box('panel', 'plastic-abs-matte-black', w, h, 0.02, 0, Math.sin(a) * h / 2 + 0.03, -Math.cos(a) * 0 + 0.0, { r: 0.008, rx: -(PI / 2 - a) });
    k.box('screen', screenMat(p.screen), w - 0.04, h - 0.03, 0.002, 0, Math.sin(a) * h / 2 + 0.03 + Math.cos(a) * 0.011, Math.sin(a) * 0.011, { r: 0, rx: -(PI / 2 - a) });
    k.box('stand', 'metal-al-anodised-grey', w * 0.6, 0.03, h * 0.6, 0, 0.015, -0.05, { r: 0.006 });
    return finish(k);
  },
});

/* ============================================================ audio / video */

const webcam = cmp({
  id: 'cmp-webcam-monitor-clip', ko: '웹캠 (모니터 클립)', en: 'Clip-on webcam',
  params: [P.bool('cover', '렌즈 가리개', 'Privacy cover', false)],
  tags: ['webcam', 'usb camera', 'video call', '웹캠', '화상 카메라', '화상 회의'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('body', 'plastic-abs-matte-black', 0.095, 0.03, 0.03, 0, 0.065, 0, { r: 0.012 });
    k.cyl('lens', 'glass-tint-smoke-dark', 0.009, 0.009, 0.003, 0, 0.065, 0.015, { rx: PI / 2, segs: 14 });
    if (p.cover) k.box('cover', 'plastic-abs-matte-black', 0.025, 0.02, 0.003, 0, 0.065, 0.017, { r: 0.004 });
    k.box('clip', 'plastic-abs-matte-black', 0.04, 0.05, 0.012, 0, 0.025, -0.01, { r: 0.004 });
    k.box('clip', 'plastic-abs-matte-black', 0.04, 0.012, 0.04, 0, 0.006, -0.03, { r: 0.004 });
    return finish(k);
  },
});

const confBar = cmp({
  id: 'cmp-video-conference-bar', ko: '화상회의 비디오 바', en: 'Video conference bar',
  params: [P.len('length', '길이', 'Length', 0.7, 0.5, 1.0), P.color('body', '색', 'Colour', '#2b2b2b')],
  tags: ['video bar', 'conference camera', 'meeting room camera', '화상회의 카메라', '비디오 바', '회의실 카메라'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('body', 'fabric-felt-charcoal', L, 0.08, 0.07, 0, 0.04, 0, { r: 0.03, ...C(p.body) });
    k.box('glass', 'glass-tint-smoke-dark', 0.16, 0.05, 0.004, 0, 0.045, 0.035, { r: 0.02 });
    for (const x of [-0.04, 0.04]) k.cyl('lens', 'plastic-abs-matte-black', 0.012, 0.012, 0.004, x, 0.045, 0.036, { rx: PI / 2, segs: 12 });
    return finish(k);
  },
});

const speakers = cmp({
  id: 'cmp-desktop-speakers-pair', ko: 'PC 스피커 (2채널)', en: 'Desktop speakers (pair)',
  params: [P.len('height', '높이', 'Height', 0.2, 0.12, 0.3), P.len('gap', '간격', 'Gap', 0.7, 0.4, 1.2), P.mat('cabinet', '인클로저', 'Cabinet', 'wood-am-walnut-oil', 'wood')],
  tags: ['pc speakers', 'desktop speakers', 'studio monitors', 'PC 스피커', '데스크톱 스피커', '모니터 스피커'],
  build: (p, ctx) => {
    const k = new Kit(ctx), h = p.height, w = h * 0.65, d = h * 0.75;
    for (const s of [-1, 1]) {
      const x = s * p.gap / 2;
      k.box('cabinets', p.cabinet, w, h, d, x, h / 2, 0, { r: 0.006, ry: -s * 0.15 });
      k.cyl('drivers', 'plastic-abs-matte-black', w * 0.36, w * 0.36, 0.006, x + s * 0.0, h * 0.38, d / 2, { rx: PI / 2, segs: k.seg(20, 8) });
      k.cyl('drivers', 'plastic-abs-matte-black', w * 0.14, w * 0.14, 0.006, x, h * 0.78, d / 2, { rx: PI / 2, segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

const soundbar = cmp({
  id: 'cmp-monitor-soundbar', ko: '모니터용 사운드바', en: 'Monitor soundbar',
  params: [P.len('length', '길이', 'Length', 0.5, 0.35, 0.8)],
  tags: ['soundbar', 'pc soundbar', 'monitor speaker', '사운드바', 'PC 사운드바', '모니터 스피커'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length;
    k.box('body', 'fabric-felt-charcoal', L, 0.06, 0.07, 0, 0.03, 0, { r: 0.025 });
    k.box('leds', 'led-blue', 0.02, 0.003, 0.002, L * 0.4, 0.045, 0.035, { r: 0 });
    return finish(k);
  },
});

const subwoofer = cmp({
  id: 'cmp-desk-subwoofer', placement: 'floor', ko: '책상 밑 서브우퍼', en: 'Under-desk subwoofer',
  params: [P.len('size', '크기', 'Size', 0.26, 0.2, 0.35)],
  tags: ['subwoofer', 'bass speaker', '서브우퍼', '우퍼', '저음 스피커'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.size;
    k.box('cabinet', 'wood-melamine-black', s, s * 1.1, s, 0, s * 0.55, 0, { r: 0.008 });
    k.cyl('driver', 'plastic-abs-matte-black', s * 0.38, s * 0.38, 0.01, 0, s * 0.55, s / 2, { rx: PI / 2, segs: k.seg(24, 8) });
    k.cyl('port', 'plastic-black', s * 0.08, s * 0.08, 0.004, 0, s * 0.15, s / 2 + 0.001, { rx: PI / 2, segs: 12 });
    return finish(k);
  },
});

const headsetStand = cmp({
  id: 'cmp-gaming-headset-on-stand', ko: '게이밍 헤드셋과 거치대', en: 'Gaming headset on stand',
  params: [P.color('accent', '포인트 색', 'Accent colour', '#d9342b'), P.bool('rgb', 'RGB 받침', 'RGB base', true)],
  tags: ['gaming headset', 'headset stand', 'headphones', '게이밍 헤드셋', '헤드셋 거치대', '헤드폰'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.cyl('base', 'plastic-abs-matte-black', 0.06, 0.065, 0.015, 0, 0, 0, { segs: k.seg(24, 8) });
    if (p.rgb) k.add('rgb', 'led-cyan', T(new THREE.TorusGeometry(0.063, 0.002, 4, k.seg(24, 8)), 0, 0.008, 0, PI / 2));
    k.cyl('post', 'metal-al-anodised-black', 0.008, 0.008, 0.24, 0, 0.015, 0, { segs: 8 });
    k.box('hanger', 'metal-al-anodised-black', 0.03, 0.015, 0.08, 0, 0.26, 0, { r: 0.006 });
    k.add('band', 'plastic-abs-matte-black', T(new THREE.TorusGeometry(0.085, 0.012, 6, k.seg(24, 10), PI), 0, 0.18, 0, 0, PI / 2, 0));
    for (const s of [-1, 1]) {
      k.cyl('cups', 'plastic-abs-matte-black', 0.045, 0.045, 0.03, 0, 0.17, s * 0.085 - (s > 0 ? 0.03 : 0), { rx: PI / 2, segs: k.seg(20, 8) });
      k.cyl('accent', 'plastic-abs-gloss-red', 0.035, 0.035, 0.002, 0, 0.17, s * 0.085 + (s > 0 ? 0.0 : 0.0) + s * 0.0, { rx: PI / 2, segs: 16, ...C(p.accent) });
    }
    k.rod('mic', 'plastic-abs-matte-black', [0, 0.15, 0.1], [0.0, 0.07, 0.14], 0.004, { segs: 6 });
    return finish(k);
  },
});

const usbMic = cmp({
  id: 'cmp-usb-microphone-arm', ko: 'USB 마이크와 붐 암', en: 'USB microphone on boom arm',
  params: [P.len('reach', '암 길이', 'Arm reach', 0.6, 0.4, 0.8), P.bool('shield', '팝 필터', 'Pop filter', true)],
  tags: ['usb microphone', 'boom arm', 'podcast mic', 'streaming', 'USB 마이크', '붐 암', '방송용 마이크'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.reach;
    k.box('clamp', 'metal-pc-black-matte', 0.05, 0.08, 0.06, 0, 0.04, 0, { r: 0.004 });
    k.rod('arm', 'metal-pc-black-matte', [0, 0.08, 0], [0, 0.08 + R * 0.55, R * 0.25], 0.008, { segs: 8 });
    k.rod('arm', 'metal-pc-black-matte', [0, 0.08 + R * 0.55, R * 0.25], [0, 0.08 + R * 0.45, R * 0.75], 0.008, { segs: 8 });
    const mx = 0, my = 0.08 + R * 0.45 - 0.1, mz = R * 0.75;
    k.cyl('mic', 'metal-pc-black-matte', 0.03, 0.03, 0.16, mx, my, mz, { segs: k.seg(20, 8) });
    k.cyl('grille', 'metal-black-mesh', 0.031, 0.031, 0.07, mx, my + 0.08, mz, { segs: k.seg(20, 8), open: true });
    if (p.shield) k.cyl('pop', 'fabric-mesh-black', 0.06, 0.06, 0.003, mx, my + 0.12, mz + 0.08, { rx: PI / 2, segs: k.seg(20, 8) });
    return finish(k);
  },
});

const streamDeck = cmp({
  id: 'cmp-macro-key-controller', ko: '매크로 키 컨트롤러 (15키)', en: 'Macro key controller (15 keys)',
  params: [P.int('keys', '키 수', 'Keys', 15, 6, 32), P.bool('lit', '키 화면 켜짐', 'Keys lit', true)],
  tags: ['stream deck', 'macro keypad', 'shortcut controller', '매크로 키패드', '스트림 덱', '단축키 컨트롤러'],
  build: (p, ctx) => {
    const k = new Kit(ctx), cols = p.keys <= 6 ? 3 : p.keys <= 15 ? 5 : 8, rows = Math.ceil(p.keys / cols), w = cols * 0.02 + 0.02, h = rows * 0.02 + 0.02;
    const a = 0.6;
    k.box('body', 'plastic-abs-matte-black', w, h, 0.02, 0, Math.sin(a) * h / 2 + 0.01, 0, { r: 0.006, rx: -(PI / 2 - a) });
    for (let i = 0; i < p.keys; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const lx = -w / 2 + 0.02 + c * 0.02, ly = h / 2 - 0.02 - r * 0.02;
      k.box('keys', p.lit ? screenMat(['desktop', 'nature', 'dark'][i % 3]) : 'screen-matte-off', 0.015, 0.015, 0.004, lx, Math.sin(a) * (h / 2 + ly) + 0.01 + Math.cos(a) * 0.011, -Math.cos(a) * ly + Math.sin(a) * 0.011, { r: 0.002, rx: -(PI / 2 - a) });
    }
    k.box('stand', 'plastic-abs-matte-black', w, 0.01, h * 0.6, 0, 0.005, -h * 0.25, { r: 0.004 });
    return finish(k);
  },
});

const ringLight = cmp({
  id: 'cmp-desk-ring-light-phone', ko: '데스크 링라이트와 스마트폰 거치대', en: 'Desk ring light with phone holder',
  params: [P.len('diameter', '링 지름', 'Ring diameter', 0.26, 0.15, 0.45), P.bool('on', '켜짐', 'On', true)],
  tags: ['ring light', 'selfie light', 'streaming light', '링라이트', '개인 방송 조명', '셀카 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), R = p.diameter / 2, H = 0.35;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('tripod', 'metal-pc-black-matte', [0, 0.12, 0], [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], 0.005, { segs: 6 }); }
    k.cyl('pole', 'metal-pc-black-matte', 0.008, 0.008, H, 0, 0.1, 0, { segs: 8 });
    k.add('ring', p.on ? 'light-daylight' : 'plastic-acrylic-opal', T(new THREE.TorusGeometry(R, 0.012, k.seg(8, 4), k.seg(40, 12)), 0, H + 0.1 + R, 0));
    k.box('phone', 'plastic-abs-matte-black', 0.075, 0.155, 0.008, 0, H + 0.1 + R, 0.01, { r: 0.008 });
    k.box('screen', p.on ? 'screen-on-nature' : 'screen-matte-off', 0.068, 0.145, 0.001, 0, H + 0.1 + R, 0.0145, { r: 0.006 });
    k.light(0, H + 0.1 + R, 0.05, { intensity: p.on ? 0.5 : 0, distance: 2, type: 'spot', angle: 0.9, color: '#ffffff' });
    return finish(k);
  },
});

export const ITEMS = [
  ...laptops, convertible, detachable, ...towers, miniPc, macMiniLike, stickPc, ...aios,
  ...monitors, portrait, hooded, portableMon, dualArm, tripleArm,
  ...keyboards, splitKb, ...mice, vertMouse, trackball, deskMat, drawingTablet, penDisplay,
  webcam, confBar, speakers, soundbar, subwoofer, headsetStand, usbMic, streamDeck, ringLight,
];
