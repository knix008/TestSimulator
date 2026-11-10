// Even more bathroom designs: squat, back-to-wall and high-cistern toilets, walk-in bath, baby
// bath on a stand, square sliding shower enclosure, hinged bath screen, washstand vanity on legs,
// vanity with washing-machine space, utility sink, Victorian washstand with jug, floor-standing bath
// filler, pivot mirror, wall cubby, hotel towel shelf, towel stand, grab bars, shower chair, toilet
// footstool, mop bucket, bathrobe on a hook and small pieces (toothbrush cup, counter organiser,
// shower bottles, towel basket). Sizes are measured from the default build. See ARCHITECTURE.md §12.
import { THREE, Kit, P, T, roundRect, ellipse, frameShape, addCabinet, addHandle, shellGeo } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { towel } from './bathroom.js';

const PI = Math.PI;
const C = (color, extra = {}) => ({ overrides: { color }, ...extra });
const torus = (R, r, rs, ts, arc = PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc);

/** Pillar / mixer tap: base at (x, y, z), spout reaching +z. */
function tap(k, x, y, z, { h = 0.16, reach = 0.11, mat = 'metal-chrome' } = {}) {
  k.cyl('tap', mat, 0.022, 0.026, 0.03, x, y, z, { segs: k.seg(16, 6) });
  k.bentTube('tap', mat, [[x, y + 0.03, z], [x, y + h, z], [x, y + h, z + reach], [x, y + h - 0.035, z + reach]], 0.011, 0.04);
  k.cyl('tap', mat, 0.008, 0.008, 0.07, x, y + h * 0.6, z - 0.005, { rx: -PI / 2, segs: k.seg(8, 4) });
}

/** A short squeeze bottle / pump bottle at (x, y, z). */
function bottle(k, role, mat, x, y, z, h, r, { pump = false, color } = {}) {
  const o = color ? C(color) : {};
  k.lathe(role, mat, [[0, 0], [r, 0], [r, h * 0.85], [r * 0.6, h * 0.95], [r * 0.45, h], [0, h]], x, y, z, { segs: k.seg(16, 6), ...o });
  if (pump) { k.cyl('caps', 'plastic-white', r * 0.35, r * 0.4, 0.04, x, y + h, z, { segs: k.seg(10, 5) }); k.box('caps', 'plastic-white', 0.012, 0.012, 0.04, x, y + h + 0.045, z + 0.015, { r: 0.003 }); }
  else k.cyl('caps', 'plastic-black', r * 0.5, r * 0.5, 0.02, x, y + h, z, { segs: k.seg(10, 5) });
}

/* --------------------------------------------------------------- toilets */

const squat = mk({
  id: 'bath-toilet-squat', category: 'bathroom', ko: '화변기(쪼그려 앉는 변기)', en: 'Squat toilet',
  params: [P.mat('ceramic', '도기', 'Ceramic', 'ceramic-white', 'ceramic'), P.bool('cistern', '하이 탱크', 'Wall cistern', true)],
  tags: ['squat toilet', 'squatting pan', 'asian toilet', '화변기', '쪼그려 변기', '재래식 변기', '변기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.45, l = 0.6;
    // flat pan set in the floor: rim plate with the bowl recess and two ribbed foot treads
    const plate = roundRect(w, l, 0.18);
    plate.holes.push(new THREE.Path(ellipse(0.24, 0.4).getPoints(24).map((v) => new THREE.Vector2(v.x, v.y - 0.04))));
    k.slab('pan', p.ceramic, plate, 0.03, 0, { bevel: 0.006 });
    k.lathe('pan', p.ceramic, [[0, 0.002], [0.05, 0.002], [0.1, 0.012], [0.12, 0.028], [0.12, 0.03]], 0, 0, -0.04, { segs: k.seg(24, 8), scale: [1, 1, 1.65] });
    k.cyl('water', 'water', 0.045, 0.045, 0.004, 0, 0.004, 0.06, { segs: k.seg(16, 6) });
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) k.box('pan', p.ceramic, 0.09, 0.006, 0.012, sx * 0.17, 0.033, 0.06 + i * 0.03, { r: 0.002 });
    // hood over the back
    k.sphere('pan', p.ceramic, 0.12, 0, 0.03, -0.2, { thetaLength: PI / 2, scale: [1, 0.6, 0.6], segs: k.seg(18, 8), rings: k.seg(6, 3) });
    if (p.cistern) {
      k.rbox('cistern', p.ceramic, 0.42, 0.25, 0.16, 0.015, 0, 1.65, -l / 2 - 0.05);
      k.rod('pipe', 'metal-chrome', [0, 1.52, -l / 2 - 0.03], [0, 0.06, -l / 2 - 0.03], 0.016, { segs: k.seg(10, 5) });
      k.bentTube('pipe', 'metal-chrome', [[0, 0.06, -l / 2 - 0.03], [0, 0.04, -l / 2 + 0.05]], 0.016, 0.02);
      k.rod('pipe', 'metal-chrome', [0.18, 1.6, -l / 2 - 0.05], [0.2, 1.25, -l / 2 - 0.05], 0.003, { segs: 4 });
    }
    return finish(k);
  },
});

const backToWall = mk({
  id: 'bath-toilet-back-to-wall', category: 'bathroom', ko: '벽 밀착형 변기(매립 탱크)', en: 'Back-to-wall toilet',
  params: [P.mat('ceramic', '도기', 'Ceramic', 'ceramic-white', 'ceramic'), P.bool('plate', '버튼 플레이트', 'Flush plate', true)],
  tags: ['back to wall toilet', 'concealed cistern', 'rimless', 'modern toilet', '벽밀착 변기', '매립 탱크', '변기', '모던 변기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.36, d = 0.56, h = 0.4;
    // one smooth body from the wall to the front: a tapered superellipse in plan
    const body = new THREE.Shape();
    body.moveTo(-w / 2, -d / 2); body.lineTo(w / 2, -d / 2); body.lineTo(w / 2, 0); body.quadraticCurveTo(w / 2, d / 2, 0, d / 2); body.quadraticCurveTo(-w / 2, d / 2, -w / 2, 0); body.lineTo(-w / 2, -d / 2);
    k.slab('body', p.ceramic, body, h - 0.04, 0, { bevel: 0.025, curveSegs: 16 });
    // seat + lid (soft-close, thin)
    const seat = new THREE.Shape(); seat.moveTo(-w / 2 + 0.01, -d / 2 + 0.12); seat.lineTo(w / 2 - 0.01, -d / 2 + 0.12); seat.lineTo(w / 2 - 0.01, 0.02); seat.quadraticCurveTo(w / 2 - 0.01, d / 2 - 0.01, 0, d / 2 - 0.01); seat.quadraticCurveTo(-w / 2 + 0.01, d / 2 - 0.01, -w / 2 + 0.01, 0.02); seat.lineTo(-w / 2 + 0.01, -d / 2 + 0.12);
    k.slab('seat', 'plastic-white', seat, 0.035, h - 0.04, { bevel: 0.01 });
    k.box('seat', 'metal-chrome', 0.2, 0.015, 0.03, 0, h - 0.035, -d / 2 + 0.1, { r: 0.006 });
    if (p.plate) k.box('plate', 'metal-chrome', 0.24, 0.16, 0.012, 0, 0.95, -d / 2 + 0.006, { r: 0.006 });
    return finish(k);
  },
});

const highCistern = mk({
  id: 'bath-toilet-high-cistern', category: 'bathroom', ko: '하이 탱크 클래식 변기(줄당김)', en: 'High-level cistern toilet with pull chain',
  params: [P.mat('ceramic', '도기', 'Ceramic', 'ceramic-white', 'ceramic'), P.mat('seat', '변좌', 'Seat', 'wood-dark', 'wood'), P.mat('metal', '배관', 'Pipework', 'metal-brass', 'metal')],
  tags: ['high cistern toilet', 'victorian toilet', 'pull chain', 'traditional', '하이 탱크 변기', '클래식 변기', '빅토리안', '줄 당김'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const by = 0.4;
    // pedestal bowl (lathe, stretched in depth) with a fluted foot
    k.lathe('bowl', p.ceramic, [[0, 0], [0.12, 0], [0.13, 0.03], [0.1, 0.12], [0.11, 0.25], [0.17, 0.34], [0.19, by - 0.02], [0.18, by], [0, by]], 0, 0, 0.04, { segs: k.seg(28, 10), scale: [1, 1, 1.35], smooth: 14 });
    k.slab('seat', p.seat, ellipse(0.38, 0.46), 0.03, by, { bevel: 0.008, x: 0, z: 0.06 });
    k.box('seat', p.metal, 0.16, 0.02, 0.04, 0, by + 0.01, -0.2, { r: 0.005 });
    // cistern up high on brackets, flush pipe down to the bowl, chain with a pull
    const cy = 1.95, cz = -0.26;
    k.box('cistern', p.ceramic, 0.48, 0.24, 0.2, 0, cy + 0.12, cz, { r: 0.012, segs: 2 });
    k.box('cistern', p.ceramic, 0.52, 0.03, 0.23, 0, cy + 0.255, cz + 0.005, { r: 0.008 });
    for (const sx of [-1, 1]) k.box('pipe', p.metal, 0.02, 0.12, 0.18, sx * 0.18, cy - 0.06, cz, { r: 0.003 });
    k.bentTube('pipe', p.metal, [[0.0, cy, cz], [0.0, by + 0.2, cz], [0.0, by + 0.06, -0.14]], 0.018, 0.1);
    k.rod('pipe', p.metal, [0.2, cy + 0.15, cz + 0.08], [0.22, cy + 0.15, cz + 0.12], 0.006);
    for (let i = 0; i < 18; i++) k.add('pipe', p.metal, T(torus(0.008, 0.002, 4, 6), 0.22, cy + 0.14 - i * 0.03, cz + 0.12, 0, (i % 2) * PI / 2, 0));
    k.lathe('pull', p.seat, [[0, 0], [0.012, 0.01], [0.018, 0.05], [0.01, 0.09], [0, 0.1]], 0.22, cy + 0.14 - 18 * 0.03 - 0.1, cz + 0.12, { segs: k.seg(10, 5) });
    return finish(k);
  },
});

/* ------------------------------------------------------------- bathing */

const walkInBath = mk({
  id: 'bath-walk-in-tub', category: 'bathroom', ko: '워크인 욕조(문 달린 좌식 욕조)', en: 'Walk-in bathtub with door',
  params: [P.len('length', '길이', 'Length', 1.3, 1.1, 1.5), P.mat('shell', '욕조', 'Shell', 'plastic-white', 'plastic'), P.bool('water', '물', 'Water', false)],
  tags: ['walk-in bath', 'accessible bath', 'safety tub', 'senior', '워크인 욕조', '좌식 욕조', '노인 욕조', '문 달린 욕조'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = 0.78, H = 1.0;
    k.rbox('shell', p.shell, L, H, W, 0.04, 0, H / 2, 0, { segs: 2 });
    k.rbox('inner', 'ceramic-white', L - 0.12, 0.04, W - 0.12, 0.03, 0, H - 0.01, 0, { segs: 2 });
    // seat moulded inside (visible over the rim), door with a seal frame and lever on the front
    k.rbox('shell', p.shell, L * 0.4, 0.06, W - 0.18, 0.02, -L / 2 + L * 0.22, H + 0.0, 0, { segs: 2 });
    k.panel('door', p.shell, frameShape(0.58, 0.82, 0.035, 0.035, 0.03), 0.02, L * 0.12, 0.05 + 0.41, W / 2 + 0.008);
    k.box('door', 'glass-frosted', 0.51, 0.75, 0.01, L * 0.12, 0.46, W / 2 + 0.006, { r: 0.004 });
    k.box('handles', 'metal-chrome', 0.03, 0.16, 0.03, L * 0.12 + 0.24, 0.6, W / 2 + 0.035, { r: 0.008 });
    k.box('handles', 'metal-chrome', 0.3, 0.02, 0.025, 0, H + 0.03, -W / 2 + 0.04, { r: 0.006 });
    tap(k, L / 2 - 0.12, H, -W / 2 + 0.08, { h: 0.14, reach: 0.12 });
    for (let i = 0; i < 4; i++) k.cyl('jets', 'metal-chrome', 0.02, 0.02, 0.006, -L / 2 + 0.2 + i * 0.25, H + 0.002, W / 2 - 0.05, { segs: k.seg(10, 5) });
    if (p.water) k.box('water', 'water', L - 0.14, 0.01, W - 0.14, 0, H - 0.06, 0, { r: 0 });
    return finish(k);
  },
});

const babyBath = mk({
  id: 'bath-baby-bath-stand', category: 'bathroom', ko: '아기 욕조(거치대 포함)', en: 'Baby bath on stand',
  params: [P.color('color', '색', 'Colour', '#9fd3e6'), P.bool('stand', '거치대', 'Stand', true)],
  tags: ['baby bath', 'infant tub', 'baby bathtub', 'stand', '아기 욕조', '유아 욕조', '신생아 욕조', '목욕'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const y = p.stand ? 0.62 : 0, o = C(p.color);
    k.lathe('tub', 'plastic-white', [[0, 0], [0.18, 0], [0.24, 0.05], [0.27, 0.2], [0.29, 0.22], [0.27, 0.22], [0.25, 0.2], [0.2, 0.04], [0, 0.03]], 0, y, 0, { segs: k.seg(32, 10), scale: [1.55, 1, 1], ...o });
    k.rbox('tub', 'plastic-white', 0.14, 0.05, 0.26, 0.02, -0.26, y + 0.06, 0, { rz: 0.4, ...o });
    if (p.stand) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('stand', 'metal-white', [sx * 0.3, 0, sz * 0.28], [sx * 0.3, y, -sz * 0.2], 0.012);
      for (const sz of [-1, 1]) k.rod('stand', 'metal-white', [-0.34, y, sz * 0.22], [0.34, y, sz * 0.22], 0.012);
      for (const sx of [-1, 1]) k.cyl('feet', 'rubber-black', 0.02, 0.02, 0.02, sx * 0.3, 0, 0, { rx: PI / 2, segs: k.seg(8, 4) });
    }
    k.add('duck', 'plastic-white', T(new THREE.SphereGeometry(0.035, k.seg(10, 6), k.seg(6, 4)), 0.1, y + 0.06, 0.05), C('#f2c14e'));
    return finish(k);
  },
});

const squareShower = mk({
  id: 'bath-shower-square-sliding', category: 'bathroom', ko: '사각 샤워부스(슬라이딩 도어)', en: 'Square shower enclosure with sliding doors',
  params: [P.len('size', '크기', 'Size', 0.9, 0.8, 1.2), P.mat('frame', '프레임', 'Frame', 'metal-chrome', 'metal'), P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass')],
  tags: ['shower enclosure', 'sliding shower door', 'square shower', 'corner shower', '샤워부스', '사각 샤워부스', '슬라이딩 샤워부스', '샤워실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, H = 1.95, ty = 0.06;
    k.rbox('tray', 'ceramic-white', s, ty, s, 0.01, 0, ty / 2, 0);
    k.cyl('tray', 'metal-chrome', 0.04, 0.04, 0.004, 0, ty, 0, { segs: k.seg(16, 6) });
    // frame: corner posts at the two open corners, top + bottom rails on the two open sides
    for (const [x, z] of [[s / 2 - 0.01, s / 2 - 0.01], [-s / 2 + 0.01, s / 2 - 0.01], [s / 2 - 0.01, -s / 2 + 0.01]]) k.box('frame', p.frame, 0.025, H, 0.025, x, ty + H / 2, z, { r: 0.003 });
    for (const y of [ty + 0.015, ty + H - 0.015]) {
      k.box('frame', p.frame, s, 0.025, 0.025, 0, y, s / 2 - 0.012, { r: 0.003 });
      k.box('frame', p.frame, 0.025, 0.025, s, s / 2 - 0.012, y, 0, { r: 0.003 });
    }
    // glass: a fixed + a sliding pane on each open side (overlapping)
    const pw = s / 2 + 0.05;
    k.box('glass', p.glass, pw, H - 0.05, 0.006, -s / 2 + pw / 2 + 0.02, ty + H / 2, s / 2 - 0.02, { r: 0 });
    k.box('glass', p.glass, pw, H - 0.05, 0.006, s / 2 - pw / 2 - 0.02, ty + H / 2, s / 2 - 0.005, { r: 0 });
    k.box('glass', p.glass, 0.006, H - 0.05, pw, s / 2 - 0.02, ty + H / 2, -s / 2 + pw / 2 + 0.02, { r: 0 });
    k.box('glass', p.glass, 0.006, H - 0.05, pw, s / 2 - 0.005, ty + H / 2, s / 2 - pw / 2 - 0.02, { r: 0 });
    k.box('frame', p.frame, 0.02, 0.3, 0.03, 0.04, ty + 1.0, s / 2 + 0.012, { r: 0.008 });
    return finish(k);
  },
});

const bathScreen = mk({
  id: 'bath-bath-screen', category: 'bathroom', ko: '욕조 샤워 가림막(접이 유리)', en: 'Hinged bath screen', placement: 'wall', elevation: 0.58,
  params: [P.len('width', '폭', 'Width', 0.8, 0.6, 1.1), P.len('height', '높이', 'Height', 1.4, 1.2, 1.6), P.mat('frame', '금속', 'Metal', 'metal-chrome', 'metal'), P.bool('flap', '보조 날개', 'Return flap', true)],
  tags: ['bath screen', 'shower screen', 'over-bath', 'glass panel', '욕조 가림막', '샤워 스크린', '유리 파티션', '욕조 샤워'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height;
    // the screen stands on the bath rim, perpendicular to the wall (it runs along +z from the wall)
    k.box('frame', p.frame, 0.03, h, 0.02, 0, h / 2, -0.01, { r: 0.004 });
    const main = w - (p.flap ? 0.25 : 0);
    k.box('glass', 'glass-clear', 0.008, h - 0.02, main, 0, h / 2, main / 2 + 0.01, { r: 0 });
    k.box('frame', p.frame, 0.016, 0.02, main, 0, 0.01, main / 2 + 0.01, { r: 0.003 });
    if (p.flap) {
      const a = 0.5;
      k.box('glass', 'glass-clear', 0.008, h - 0.02, 0.25, Math.sin(a) * 0.125, h / 2, main + 0.02 + Math.cos(a) * 0.125, { r: 0, ry: a });
      for (const y of [0.2, h - 0.2]) k.cyl('frame', p.frame, 0.008, 0.008, 0.06, 0, y - 0.03, main + 0.015, { segs: k.seg(8, 5) });
    }
    for (const y of [0.25, h - 0.25]) k.box('frame', p.frame, 0.03, 0.06, 0.03, 0, y, 0.02, { r: 0.006 });
    return finish(k);
  },
});

const bathFiller = mk({
  id: 'bath-floor-bath-filler', category: 'bathroom', ko: '스탠드형 욕조 수전(바닥 설치)', en: 'Floor-standing bath filler',
  params: [P.mat('metal', '마감', 'Finish', 'metal-black', 'metal'), P.bool('handset', '핸드샤워', 'Hand shower', true)],
  tags: ['bath filler', 'freestanding tap', 'floor mounted faucet', 'bath mixer', '욕조 수전', '스탠드 수전', '바닥 수전', '수전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 0.95, m = p.metal;
    k.cyl('tap', m, 0.06, 0.065, 0.02, 0, 0, 0, { segs: k.seg(20, 8) });
    k.cyl('tap', m, 0.022, 0.024, H - 0.05, 0, 0.02, 0, { segs: k.seg(14, 6) });
    k.bentTube('tap', m, [[0, H - 0.04, 0], [0, H + 0.08, 0], [0, H + 0.08, 0.25], [0, H - 0.0, 0.26]], 0.017, 0.08);
    for (const y of [H - 0.25, H - 0.32]) { k.cyl('tap', m, 0.026, 0.026, 0.04, 0, y, 0, { segs: k.seg(14, 6) }); k.box('tap', m, 0.012, 0.012, 0.07, 0.0, y + 0.02, -0.04, { r: 0.004 }); }
    if (p.handset) {
      k.box('tap', m, 0.03, 0.04, 0.04, 0.03, H - 0.42, 0, { r: 0.006 });
      k.rod('tap', m, [0.05, H - 0.5, 0], [0.05, H - 0.28, 0.0], 0.014);
      k.cyl('tap', m, 0.024, 0.016, 0.03, 0.05, H - 0.28, 0, { segs: k.seg(12, 6) });
      k.tube('hose', m, [[0.05, H - 0.5, 0], [0.08, H - 0.62, 0.02], [0.03, H - 0.75, 0.03], [0.01, H - 0.85, 0.0]], 0.006, { radial: 5 });
    }
    return finish(k);
  },
});

/* -------------------------------------------------------------- basins */

const washstandVanity = mk({
  id: 'bath-vanity-washstand-legs', category: 'bathroom', ko: '다리형 원목 세면대장(대리석 상판)', en: 'Washstand vanity on legs with marble top',
  params: [P.len('width', '폭', 'Width', 0.9, 0.7, 1.2), P.mat('body', '본체', 'Body', 'wood-walnut', 'wood'), P.mat('top', '상판', 'Top', 'marble-white', 'stone'), P.mat('metal', '수전·손잡이', 'Tap & pulls', 'metal-brass', 'metal')],
  tags: ['washstand', 'vanity', 'furniture vanity', 'marble top', '세면대장', '원목 세면대', '다리형 세면대', '대리석 세면대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.52, h = 0.84;
    addCabinet(k, { w, h: h - 0.03, d, rows: [{ h: 0.55, n: 1, type: 'open' }, { h: 0.45, n: 2, type: 'drawer' }], body: p.body, front: p.body, handle: 'knob', handleMat: p.metal, base: 'legs', legH: 0.28, legStyle: 'square', legMat: p.body });
    // marble top with an undermount oval basin (darker hollow) + backsplash + tap
    const top = roundRect(w + 0.02, d + 0.02, 0.01);
    const hole = ellipse(0.42, 0.32);
    top.holes.push(new THREE.Path(hole.getPoints(24).map((v) => new THREE.Vector2(v.x, v.y + 0.03))));
    k.slab('top', p.top, top, 0.03, h - 0.03, { bevel: 0.004 });
    k.lathe('basin', 'ceramic-white', [[0, 0], [0.12, 0], [0.18, 0.04], [0.21, 0.12], [0.215, 0.13]], 0, h - 0.16, 0.03, { segs: k.seg(28, 10), scale: [1, 1, 0.76] });
    k.box('top', p.top, w + 0.02, 0.1, 0.02, 0, h + 0.05, -d / 2, { r: 0.004 });
    tap(k, 0, h, -d / 2 + 0.07, { mat: p.metal, reach: 0.13 });
    k.box('towels', 'fabric-cotton-white', w * 0.5, 0.1, d - 0.12, 0, 0.36 + 0.05, -0.02, { r: 0.02 });
    return finish(k);
  },
});

const washerVanity = mk({
  id: 'bath-vanity-washer', category: 'bathroom', ko: '세탁기 수납 세면대장', en: 'Vanity unit with washing-machine space',
  params: [P.mat('body', '본체', 'Body', 'wood-white', 'wood'), P.mat('top', '상판', 'Top', 'quartz-white', 'stone'), P.bool('washer', '세탁기', 'Washing machine', true)],
  tags: ['washer vanity', 'laundry vanity', 'washing machine cabinet', 'utility', '세탁기장', '세탁기 수납', '세면대장', '다용도실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 1.5, d = 0.62, h = 0.9, bw = 0.6;
    // basin cabinet on the right, open bay on the left for a front-loader
    k.box('body', p.body, 0.02, h - 0.03, d, -W / 2 + 0.01, (h - 0.03) / 2, 0, { r: 0.002 });
    k.box('body', p.body, W, 0.02, d, 0, h - 0.04, 0, { r: 0.002 });
    k.box('body', p.body, W - bw - 0.02, h - 0.05, 0.02, -bw / 2 - 0.0, (h - 0.05) / 2, -d / 2 + 0.01, { r: 0.002 });
    addCabinet(k, { w: bw, h: h - 0.03, d, x: W / 2 - bw / 2, rows: [{ h: 1, n: 2, type: 'door' }], body: p.body, front: p.body, handle: 'edge', handleMat: 'metal-aluminium', base: 'plinth', plinth: 0.08 });
    const top = roundRect(W, d, 0.006);
    top.holes.push(new THREE.Path(roundRect(0.44, 0.34, 0.06).getPoints(6).map((v) => new THREE.Vector2(v.x + W / 2 - bw / 2, v.y + 0.03))));
    k.slab('top', p.top, top, 0.03, h - 0.03, { bevel: 0.003 });
    k.rbox('basin', 'ceramic-white', 0.44, 0.15, 0.34, 0.05, W / 2 - bw / 2, h - 0.1, 0.03);
    tap(k, W / 2 - bw / 2, h, -d / 2 + 0.07);
    if (p.washer) {
      const ww = 0.6, wh = 0.82;
      k.box('washer', 'plastic-white', ww - 0.02, wh, d - 0.06, -W / 2 + 0.02 + ww / 2, wh / 2, 0.0, { r: 0.012, segs: 2 });
      k.add('washer', 'metal-chrome', T(torus(0.17, 0.02, k.seg(8, 4), k.seg(28, 10)), -W / 2 + 0.02 + ww / 2, 0.4, d / 2 - 0.03));
      k.cyl('glass', 'glass-tinted', 0.155, 0.155, 0.01, -W / 2 + 0.02 + ww / 2, 0.4, d / 2 - 0.035, { rx: PI / 2, segs: k.seg(24, 8) });
      k.box('washer', 'plastic-grey', ww - 0.06, 0.08, 0.01, -W / 2 + 0.02 + ww / 2, wh - 0.07, d / 2 - 0.025, { r: 0.004 });
    }
    return finish(k);
  },
});

const utilitySink = mk({
  id: 'bath-utility-sink', category: 'bathroom', ko: '다용도 세탁 개수대(스탠드)', en: 'Freestanding utility sink',
  params: [P.mat('tub', '개수대', 'Tub', 'plastic-white', 'plastic'), P.mat('legs', '다리', 'Legs', 'metal-steel', 'metal')],
  tags: ['utility sink', 'laundry tub', 'wash basin', 'garage sink', '다용도 개수대', '세탁 개수대', '빨래 싱크', '다용도실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, d = 0.55, h = 0.88, td = 0.33;
    // open-top tub: four walls + floor
    k.box('tub', p.tub, w, 0.02, d, 0, h - td + 0.01, 0, { r: 0.006 });
    for (const sz of [-1, 1]) k.box('tub', p.tub, w, td, 0.025, 0, h - td / 2, sz * (d / 2 - 0.0125), { r: 0.008 });
    for (const sx of [-1, 1]) k.box('tub', p.tub, 0.025, td, d, sx * (w / 2 - 0.0125), h - td / 2, 0, { r: 0.008 });
    k.box('tub', p.tub, w + 0.02, 0.025, 0.05, 0, h, -d / 2 + 0.02, { r: 0.008 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('legs', p.legs, [sx * (w / 2 - 0.05), h - td, sz * (d / 2 - 0.05)], [sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02)], 0.016, { segs: k.seg(10, 5) });
    for (const sx of [-1, 1]) k.rod('legs', p.legs, [sx * (w / 2 - 0.035), 0.2, -d / 2 + 0.035], [sx * (w / 2 - 0.035), 0.2, d / 2 - 0.035], 0.01, { segs: k.seg(8, 4) });
    k.rod('drain', 'plastic-white', [0, h - td, 0], [0, 0.3, -d / 2 + 0.05], 0.02, { segs: k.seg(10, 5) });
    tap(k, 0, h + 0.012, -d / 2 + 0.02, { h: 0.22, reach: 0.18 });
    return finish(k);
  },
});

const victorianWashstand = mk({
  id: 'bath-washstand-jug', category: 'bathroom', ko: '빅토리안 세면 스탠드(물동이·주전자)', en: 'Victorian washstand with bowl and jug',
  params: [WOODP('wood-dark'), P.mat('top', '상판', 'Top', 'marble-white', 'stone'), P.mat('china', '도자기', 'China', 'ceramic-white', 'ceramic')],
  tags: ['washstand', 'wash bowl', 'pitcher', 'jug', 'antique', 'victorian', '세면 스탠드', '앤티크 세면대', '물동이', '주전자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.9, d = 0.45, h = 0.78;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.lathe('frame', p.wood, [[0, 0], [0.02, 0], [0.025, 0.04], [0.016, 0.12], [0.022, 0.3], [0.016, 0.5], [0.024, h - 0.12], [0.024, h - 0.03], [0, h - 0.03]], sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), { segs: k.seg(12, 6), smooth: 12 });
    k.box('frame', p.wood, w - 0.04, 0.12, d - 0.04, 0, h - 0.09, 0, { r: 0.004 });
    k.box('fronts', p.wood, w * 0.6, 0.09, 0.015, 0, h - 0.09, d / 2 - 0.012, { r: 0.002 });
    addHandle(k, 'handles', 'metal-brass', 'knob', -0.08, h - 0.09, d / 2 - 0.004);
    addHandle(k, 'handles', 'metal-brass', 'knob', 0.08, h - 0.09, d / 2 - 0.004);
    k.box('frame', p.wood, w - 0.1, 0.02, d - 0.1, 0, 0.18, 0, { r: 0.003 });
    k.box('top', p.top, w, 0.025, d, 0, h - 0.0125, 0, { r: 0.004 });
    const back = new THREE.Shape(); back.moveTo(-w / 2, 0); back.lineTo(w / 2, 0); back.lineTo(w / 2, 0.15); back.quadraticCurveTo(0, 0.32, -w / 2, 0.15); back.lineTo(-w / 2, 0);
    k.panel('top', p.top, back, 0.02, 0, h, -d / 2 + 0.01);
    // bowl with the jug standing in it
    k.lathe('china', p.china, [[0, 0], [0.08, 0], [0.16, 0.06], [0.2, 0.11], [0.21, 0.115], [0.19, 0.115], [0.15, 0.065], [0.075, 0.012], [0, 0.012]], 0, h, 0.02, { segs: k.seg(28, 10) });
    k.lathe('china', p.china, [[0, 0], [0.07, 0], [0.09, 0.06], [0.1, 0.13], [0.07, 0.22], [0.065, 0.27], [0.08, 0.3], [0.075, 0.305], [0.06, 0.28], [0, 0.27]], 0, h + 0.012, 0.02, { segs: k.seg(20, 8), smooth: 14 });
    k.add('china', p.china, T(torus(0.07, 0.012, k.seg(6, 4), k.seg(14, 6), PI), -0.09, h + 0.18, 0.02, 0, 0, PI / 2));
    k.box('towel', 'fabric-cotton-white', 0.3, 0.12, 0.012, 0.0, 0.33, d / 2 - 0.005, { r: 0.004 });
    k.rod('frame', p.wood, [-w / 2 + 0.04, 0.4, d / 2 - 0.02], [w / 2 - 0.04, 0.4, d / 2 - 0.02], 0.01);
    return finish(k);
  },
});
function WOODP(def) { return P.mat('wood', '나무', 'Wood', def, 'wood'); }

/* ------------------------------------------------------- wall pieces */

const pivotMirror = mk({
  id: 'bath-mirror-pivot-oval', category: 'bathroom', ko: '회전 타원 거울(벽 브래킷)', en: 'Oval pivot mirror on wall brackets', placement: 'wall', elevation: 1.05,
  params: [P.len('width', '폭', 'Width', 0.5, 0.4, 0.7), P.len('height', '높이', 'Height', 0.75, 0.55, 0.95), P.mat('metal', '프레임', 'Frame', 'metal-brass', 'metal'), P.num('tilt', '기울기(°)', 'Tilt (°)', 8, -20, 20, 1)],
  tags: ['pivot mirror', 'tilting mirror', 'oval mirror', 'bathroom mirror', '회전 거울', '타원 거울', '욕실 거울', '틸트 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, a = (p.tilt * PI) / 180, cy = h / 2, cz = 0.07;
    for (const sx of [-1, 1]) {
      k.cyl('frame', p.metal, 0.03, 0.03, 0.012, sx * (w / 2 + 0.03), cy, 0, { rx: PI / 2, segs: k.seg(16, 6) });
      k.rod('frame', p.metal, [sx * (w / 2 + 0.03), cy, 0.006], [sx * (w / 2 + 0.03), cy, cz], 0.008);
      k.rod('frame', p.metal, [sx * (w / 2 + 0.03), cy, cz], [sx * (w / 2), cy, cz], 0.008);
    }
    const ring = ellipse(w, h); ring.holes.push(new THREE.Path(ellipse(w - 0.03, h - 0.03).getPoints(40)));
    k.panel('frame', p.metal, ring, 0.018, 0, cy, cz, { rx: a });
    k.add('mirror', 'mirror', T(new THREE.ShapeGeometry(ellipse(w - 0.025, h - 0.025), k.seg(32, 12)), 0, cy, cz + 0.002, a, 0, 0));
    k.add('mirror', 'mirror', T(new THREE.ShapeGeometry(ellipse(w - 0.025, h - 0.025), k.seg(32, 12)), 0, cy, cz - 0.004, a, PI, 0));
    return finish(k);
  },
});

const wallCubby = mk({
  id: 'bath-wall-cubby', category: 'bathroom', ko: '벽걸이 오픈 칸 수납장', en: 'Wall-hung open cubby shelf', placement: 'wall', elevation: 1.2,
  params: [P.int('cols', '가로 칸', 'Columns', 3, 2, 4), P.int('rows', '세로 칸', 'Rows', 2, 1, 3), P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'), P.bool('items', '소품', 'Items', true)],
  tags: ['cubby', 'wall shelf', 'bathroom storage', 'open shelf', '오픈 수납장', '벽 선반', '욕실 수납', '칸 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const cw = 0.24, ch = 0.24, d = 0.16, t = 0.016, W = p.cols * cw + t, H = p.rows * ch + t;
    k.box('frame', p.wood, W, H, 0.006, 0, H / 2, -d / 2 + 0.003, { r: 0 });
    for (let i = 0; i <= p.cols; i++) k.box('frame', p.wood, t, H, d, -W / 2 + t / 2 + i * cw, H / 2, 0, { r: 0.002 });
    for (let j = 0; j <= p.rows; j++) k.box('frame', p.wood, W, t, d, 0, t / 2 + j * ch, 0, { r: 0.002 });
    if (p.items) for (let j = 0; j < p.rows; j++) for (let i = 0; i < p.cols; i++) {
      const x = -W / 2 + t + cw * (i + 0.5) - t / 2, y = t + j * ch;
      const kind = (i + j * 2) % 3;
      if (kind === 0) for (let n = 0; n < 3; n++) k.cyl('towels', 'fabric-cotton-white', 0.035, 0.035, cw - 0.06, x - cw / 2 + 0.03, y + 0.035 + (n === 2 ? 0.06 : 0), (n === 2 ? 0 : n === 0 ? -0.035 : 0.035), { rz: -PI / 2, segs: k.seg(12, 6) });
      else if (kind === 1) { bottle(k, 'bottles', 'plastic-white', x - 0.05, y, 0, 0.14, 0.025, { pump: true }); bottle(k, 'bottles', 'glass-frosted', x + 0.04, y, 0.01, 0.11, 0.028); }
      else k.lathe('items', 'rattan', [[0, 0], [0.08, 0], [0.09, 0.12], [0.085, 0.12], [0.075, 0.01], [0, 0.01]], x, y, 0, { segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

const hotelShelf = mk({
  id: 'bath-hotel-towel-shelf', category: 'bathroom', ko: '호텔식 수건 선반(걸이 바 포함)', en: 'Hotel towel shelf with bar', placement: 'wall', elevation: 1.45,
  params: [P.len('width', '폭', 'Width', 0.6, 0.45, 0.9), P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal'), P.bool('towels', '수건', 'Towels', true)],
  tags: ['towel shelf', 'hotel towel rack', 'towel bar', 'bathroom shelf', '수건 선반', '호텔 수건걸이', '수건걸이', '욕실 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.24, top = 0.3;
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2);
      k.box('frame', p.metal, 0.012, 0.32, 0.02, x, 0.16, -d / 2 + 0.01, { r: 0.003 });
      k.box('frame', p.metal, 0.012, 0.012, d, x, top, 0, { r: 0.003 });
      k.rod('frame', p.metal, [x, 0.04, -d / 2 + 0.01], [x, top, d / 2 - 0.03], 0.005);
    }
    for (let i = 0; i < 6; i++) k.rod('frame', p.metal, [-w / 2, top + 0.006, -d / 2 + 0.02 + i * ((d - 0.04) / 5)], [w / 2, top + 0.006, -d / 2 + 0.02 + i * ((d - 0.04) / 5)], 0.005, { segs: k.seg(8, 4) });
    k.rod('frame', p.metal, [-w / 2, 0.06, d / 2 - 0.06], [w / 2, 0.06, d / 2 - 0.06], 0.009);
    if (p.towels) {
      for (let i = 0; i < 3; i++) k.rbox('towels', 'fabric-cotton-white', w * 0.42, 0.05, d * 0.7, 0.018, -w * 0.24 + (i === 2 ? w * 0.48 : 0), top + 0.04 + (i === 1 ? 0.05 : 0), 0, { segs: 2 });
      towel(k, 0, 0.06, d / 2 - 0.06, w * 0.7, 0.35);
    }
    return finish(k);
  },
});

const grabBars = mk({
  id: 'bath-grab-bars', category: 'bathroom', ko: '안전 손잡이(L자 + 일자)', en: 'Safety grab bars', placement: 'wall', elevation: 0.7,
  params: [P.mat('metal', '마감', 'Finish', 'metal-steel', 'metal'), P.bool('straight', '일자 손잡이 추가', 'Add straight bar', true)],
  tags: ['grab bar', 'safety rail', 'accessible', 'senior', 'handrail', '안전 손잡이', '욕실 손잡이', '노약자', '핸드레일'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const z = 0.05, r = 0.016;
    // L bar: 0.6 horizontal + 0.6 vertical
    k.bentTube('bar', p.metal, [[-0.3, 0, z], [0.3, 0, z], [0.3, 0.6, z]], r, 0.05, { radial: k.seg(12, 6) });
    for (const [x, y] of [[-0.3, 0], [0.3, 0.6], [0.3, 0]]) { k.cyl('bar', p.metal, 0.035, 0.035, 0.008, x, y, -z + 0.05, { rx: PI / 2, segs: k.seg(14, 6) }); k.rod('bar', p.metal, [x, y, 0.008], [x, y, z], r * 0.9); }
    if (p.straight) {
      k.rod('bar', p.metal, [0.55, 0.15, z], [1.15, 0.15, z], r, { segs: k.seg(12, 6) });
      for (const x of [0.55, 1.15]) { k.cyl('bar', p.metal, 0.035, 0.035, 0.008, x, 0.15, 0.0, { rx: PI / 2, segs: k.seg(14, 6) }); k.rod('bar', p.metal, [x, 0.15, 0.008], [x, 0.15, z], r * 0.9); }
    }
    return finish(k);
  },
});

const robeHook = mk({
  id: 'bath-bathrobe-hook', category: 'bathroom', ko: '목욕 가운과 벽 후크', en: 'Bathrobe on wall hook', placement: 'wall', elevation: 0.55,
  params: [P.mat('robe', '가운', 'Robe', 'fabric-cotton-white', 'fabric'), P.mat('metal', '후크', 'Hook', 'metal-chrome', 'metal')],
  tags: ['bathrobe', 'robe hook', 'towel hook', 'hanging robe', '목욕 가운', '가운', '후크', '벽걸이 후크'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const top = 1.15;
    k.cyl('hook', p.metal, 0.022, 0.022, 0.01, 0, top + 0.02, -0.005, { rx: PI / 2, segs: k.seg(14, 6) });
    k.bentTube('hook', p.metal, [[0, top + 0.02, 0], [0, top + 0.02, 0.05], [0, top + 0.06, 0.06]], 0.006, 0.02);
    // the robe hangs from the hook: a tapered cloth tube flattened against the wall, with soft folds
    const robe = shellGeo(k.seg(20, 8), k.seg(16, 6), (u, v) => {
      const y = top - v * 1.05;
      const half = 0.06 + 0.24 * Math.min(1, v * 3) + 0.04 * v;
      const x = (u - 0.5) * 2 * half;
      const z = 0.05 + 0.05 * Math.sin(u * PI) * Math.min(1, v * 2.5) + 0.012 * Math.sin(u * PI * 6) * v;
      return [x, y, z];
    }, 0.02);
    k.add('robe', p.robe, robe);
    for (const sx of [-1, 1]) k.add('robe', p.robe, shellGeo(4, k.seg(10, 4), (u, v) => [sx * (0.27 + u * 0.06), top - 0.12 - v * 0.6, 0.08 + 0.02 * u], 0.025));
    k.rod('robe', p.robe, [-0.25, top - 0.5, 0.1], [0.25, top - 0.52, 0.1], 0.015, { segs: k.seg(8, 4) });
    return finish(k);
  },
});

/* ------------------------------------------------------- floor pieces */

const towelStand = mk({
  id: 'bath-towel-stand', category: 'bathroom', ko: '스탠드형 수건걸이(2단)', en: 'Freestanding towel stand',
  params: [P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'), P.bool('towels', '수건', 'Towels', true)],
  tags: ['towel stand', 'towel rack', 'freestanding', 'valet', '수건 스탠드', '수건걸이', '스탠드 수건걸이', '욕실 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, h = 0.85;
    for (const sx of [-1, 1]) {
      k.rod('frame', p.metal, [sx * w / 2, 0.02, 0], [sx * w / 2, h, 0], 0.012);
      k.rbox('frame', p.metal, 0.04, 0.02, 0.32, 0.006, sx * w / 2, 0.01, 0);
    }
    for (const [y, z] of [[h, 0], [h - 0.25, 0.0]]) k.rod('frame', p.metal, [-w / 2, y, z], [w / 2, y, z], 0.009);
    if (p.towels) { towel(k, -0.05, h, 0, w * 0.75, 0.42); towel(k, 0.05, h - 0.25, 0, w * 0.6, 0.3); }
    return finish(k);
  },
});

const showerChair = mk({
  id: 'bath-shower-chair', category: 'bathroom', ko: '목욕 의자(등받이 높이조절)', en: 'Shower chair with backrest',
  params: [P.mat('seat', '좌판', 'Seat', 'plastic-white', 'plastic'), P.len('seatHeight', '좌판 높이', 'Seat height', 0.45, 0.35, 0.55)],
  tags: ['shower chair', 'bath seat', 'medical', 'senior', 'accessible', '목욕 의자', '샤워 의자', '노인 목욕', '안전 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = p.seatHeight, w = 0.48, d = 0.42;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.rod('frame', 'metal-aluminium', [sx * (w / 2 - 0.01), 0.04, sz * (d / 2 - 0.01)], [sx * (w / 2 - 0.05), sh - 0.03, sz * (d / 2 - 0.05)], 0.013);
      k.cyl('feet', 'rubber-black', 0.022, 0.025, 0.045, sx * (w / 2 - 0.01), 0, sz * (d / 2 - 0.01), { segs: k.seg(12, 6) });
    }
    for (const sx of [-1, 1]) k.rod('frame', 'metal-aluminium', [sx * (w / 2 - 0.035), 0.18, -d / 2 + 0.03], [sx * (w / 2 - 0.035), 0.18, d / 2 - 0.03], 0.008);
    // perforated seat (holes suggested by a grid of dark plugs) + backrest
    k.rbox('seat', p.seat, w - 0.04, 0.035, d - 0.03, 0.012, 0, sh - 0.017, 0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.cyl('holes', 'plastic-grey', 0.01, 0.01, 0.002, -0.12 + i * 0.08, sh, -0.08 + j * 0.08, { segs: 8 });
    for (const sx of [-1, 1]) k.rod('frame', 'metal-aluminium', [sx * (w / 2 - 0.05), sh - 0.03, -d / 2 + 0.05], [sx * (w / 2 - 0.05), sh + 0.38, -d / 2 + 0.0], 0.012);
    k.rbox('seat', p.seat, w - 0.08, 0.14, 0.025, 0.01, 0, sh + 0.28, -d / 2 + 0.01, { rx: -0.12 });
    return finish(k);
  },
});

const footstool = mk({
  id: 'bath-toilet-footstool', category: 'bathroom', ko: '변기 발받침', en: 'Toilet footstool',
  params: [P.mat('mat', '재질', 'Material', 'wood-teak', 'wood')],
  tags: ['toilet stool', 'squatty potty', 'footstool', 'step', '변기 발받침', '발판', '쾌변 발받침', '욕실 스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // U shape in plan that wraps the front of a toilet pedestal; top slopes slightly
    const s = new THREE.Shape();
    s.moveTo(-0.24, -0.12); s.lineTo(-0.24, 0.14); s.quadraticCurveTo(-0.24, 0.17, -0.21, 0.17); s.lineTo(0.21, 0.17); s.quadraticCurveTo(0.24, 0.17, 0.24, 0.14); s.lineTo(0.24, -0.12);
    s.lineTo(0.12, -0.12); s.lineTo(0.12, 0.02); s.quadraticCurveTo(0, 0.08, -0.12, 0.02); s.lineTo(-0.12, -0.12); s.lineTo(-0.24, -0.12);
    k.slab('stool', p.mat, s, 0.025, 0.17, { bevel: 0.005 });
    for (const sx of [-1, 1]) k.box('stool', p.mat, 0.11, 0.17, 0.27, sx * 0.18, 0.085, 0.025, { r: 0.006 });
    return finish(k);
  },
});

const mopBucket = mk({
  id: 'bath-mop-bucket', category: 'bathroom', ko: '탈수 밀대 걸레와 양동이', en: 'Mop and bucket with wringer',
  params: [P.color('color', '양동이 색', 'Bucket colour', '#5fa8d3')],
  tags: ['mop', 'bucket', 'wringer', 'cleaning', '걸레', '양동이', '밀대', '청소 도구', '탈수 걸레'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const o = C(p.color);
    k.lathe('bucket', 'plastic-white', [[0, 0], [0.15, 0], [0.17, 0.26], [0.18, 0.27], [0.165, 0.27], [0.15, 0.02], [0, 0.02]], 0, 0, 0, { segs: k.seg(24, 8), scale: [1.2, 1, 1], ...o });
    k.box('bucket', 'plastic-white', 0.18, 0.08, 0.22, 0.1, 0.28, 0, { r: 0.01, ...o });
    k.add('handle', 'metal-steel', T(torus(0.18, 0.004, 4, k.seg(16, 6), PI), 0, 0.27, 0, 0, PI / 2, 0));
    // mop: pole leaning in the bucket, round head of strands
    k.rod('mop', 'metal-aluminium', [0.08, 0.12, 0.0], [-0.12, 1.25, -0.05], 0.012);
    k.cyl('mop', 'plastic-grey', 0.025, 0.025, 0.12, -0.12, 1.2, -0.05, { rz: 0.17, segs: k.seg(10, 5) });
    k.lathe('strands', 'fabric-linen-white', [[0, 0.0], [0.09, 0.0], [0.11, 0.08], [0.05, 0.15], [0, 0.16]], 0.1, 0.03, 0.0, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

/* -------------------------------------------------------- small pieces */

const toothbrushCup = mk({
  id: 'bath-toothbrush-cup', category: 'bathroom', ko: '양치 컵과 칫솔·치약', en: 'Toothbrush cup with toothpaste', placement: 'surface',
  params: [P.mat('cup', '컵', 'Cup', 'ceramic-matte', 'ceramic'), P.int('brushes', '칫솔 수', 'Toothbrushes', 2, 1, 4)],
  tags: ['toothbrush', 'toothbrush holder', 'tumbler', 'toothpaste', '칫솔', '양치컵', '치약', '칫솔꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('cup', p.cup, [[0, 0], [0.035, 0], [0.04, 0.1], [0.037, 0.1], [0.032, 0.008], [0, 0.008]], 0, 0, 0, { segs: k.seg(18, 8) });
    const cols = ['#5fa8d3', '#e86b5f', '#7cc47f', '#f2c14e'];
    for (let i = 0; i < p.brushes; i++) {
      const a = (i / p.brushes) * PI * 2, dx = Math.cos(a) * 0.012, dz = Math.sin(a) * 0.012;
      k.rod('brushes', 'plastic-white', [dx, 0.01, dz], [dx * 5, 0.19, dz * 5], 0.006, { segs: 6, overrides: { color: cols[i % 4] } });
      k.box('bristles', 'plastic-white', 0.012, 0.025, 0.012, dx * 5.2, 0.195, dz * 5.2 + 0.008, { r: 0.002 });
    }
    k.box('tube', 'plastic-white', 0.035, 0.016, 0.15, 0.08, 0.008, 0.03, { r: 0.006 });
    k.cyl('tube', 'plastic-black', 0.012, 0.012, 0.02, 0.08, 0.012, 0.115, { rx: PI / 2, segs: k.seg(10, 5) });
    return finish(k);
  },
});

const counterOrganiser = mk({
  id: 'bath-counter-organiser', category: 'bathroom', ko: '세면대 정리 트레이(디스펜서·용기)', en: 'Vanity tray with dispenser and jars', placement: 'surface',
  params: [P.mat('tray', '트레이', 'Tray', 'marble-white', 'stone'), P.mat('jars', '용기', 'Containers', 'glass-frosted', 'glass')],
  tags: ['vanity tray', 'soap dispenser', 'cotton jar', 'organiser', '세면대 트레이', '디스펜서', '정리함', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('tray', p.tray, 0.3, 0.02, 0.16, 0.006, 0, 0.01, 0);
    bottle(k, 'jars', p.jars, -0.09, 0.02, 0, 0.16, 0.035, { pump: true });
    k.cyl('jars', p.jars, 0.04, 0.04, 0.1, 0.0, 0.02, 0.0, { segs: k.seg(18, 8) });
    k.cyl('caps', 'metal-gold', 0.042, 0.042, 0.015, 0.0, 0.12, 0.0, { segs: k.seg(18, 8) });
    for (let i = 0; i < 3; i++) k.sphere('cotton', 'fabric-cotton-white', 0.018, -0.012 + i * 0.012, 0.11, 0.0, { segs: 8, rings: 5 });
    k.cyl('jars', p.jars, 0.035, 0.035, 0.05, 0.095, 0.02, -0.02, { segs: k.seg(16, 6) });
    k.cyl('caps', 'metal-gold', 0.037, 0.037, 0.012, 0.095, 0.07, -0.02, { segs: k.seg(16, 6) });
    k.box('soap', 'ceramic-white', 0.06, 0.02, 0.04, 0.1, 0.03, 0.045, { r: 0.008 });
    return finish(k);
  },
});

const showerBottles = mk({
  id: 'bath-shower-bottles', category: 'bathroom', ko: '샴푸·린스·바디워시 세트', en: 'Shampoo, conditioner and body wash', placement: 'surface',
  params: [P.color('color', '병 색', 'Bottle colour', '#e8e2d6'), P.bool('sponge', '샤워볼', 'Bath pouf', true)],
  tags: ['shampoo', 'conditioner', 'body wash', 'shower gel', '샴푸', '린스', '바디워시', '욕실 용품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    bottle(k, 'bottles', 'plastic-white', -0.09, 0, 0, 0.22, 0.04, { pump: true, color: p.color });
    bottle(k, 'bottles', 'plastic-white', 0.0, 0, 0, 0.22, 0.04, { pump: true, color: p.color });
    k.rbox('bottles', 'plastic-white', 0.07, 0.17, 0.045, 0.015, 0.09, 0.085, 0, C(p.color));
    k.cyl('caps', 'plastic-black', 0.02, 0.02, 0.025, 0.09, 0.17, 0, { segs: k.seg(10, 5) });
    for (const x of [-0.09, 0, 0.09]) k.box('labels', 'paper', 0.04, 0.06, 0.002, x, 0.1, 0.041, { r: 0 });
    if (p.sponge) k.sphere('pouf', 'fabric-velvet-rose', 0.06, 0.03, 0.055, 0.09, { segs: k.seg(14, 6), rings: k.seg(8, 4), scale: [1, 0.9, 1] });
    return finish(k);
  },
});

const towelBasket = mk({
  id: 'bath-towel-basket', category: 'bathroom', ko: '롤 수건 바구니', en: 'Basket of rolled towels',
  params: [P.mat('basket', '바구니', 'Basket', 'rattan', 'wood'), P.mat('towel', '수건', 'Towels', 'fabric-cotton-white', 'fabric')],
  tags: ['towel basket', 'rolled towels', 'wicker basket', 'spa', '수건 바구니', '롤 수건', '라탄 바구니', '스파'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.2, h = 0.3;
    k.lathe('basket', p.basket, [[0, 0], [r * 0.85, 0], [r, h], [r * 1.03, h + 0.01], [r * 0.97, h + 0.01], [r * 0.93, h * 0.06], [0, h * 0.06]], 0, 0, 0, { segs: k.seg(28, 10) });
    for (const sx of [-1, 1]) k.add('basket', p.basket, T(torus(0.045, 0.008, 4, k.seg(12, 6), PI), sx * (r + 0.01), h - 0.02, 0, 0, PI / 2, 0));
    // rolled towels standing up in the basket, a few leaning
    const rolls = [[0, 0, 0], [0.09, 0.06, 0.15], [-0.09, 0.05, -0.15], [0.07, -0.09, 0.1], [-0.08, -0.08, -0.12], [0.0, 0.11, 0.05]];
    for (const [x, z, a] of rolls) k.cyl('towels', p.towel, 0.045, 0.045, 0.3, x, h * 0.06, z, { rx: a, rz: -a * 0.6, segs: k.seg(14, 6) });
    for (const [x, z] of rolls) k.cyl('towels', p.towel, 0.02, 0.02, 0.005, x, h * 0.06 + 0.3, z, { segs: 8, overrides: { color: '#d8d4cc' } });
    return finish(k);
  },
});

export const ITEMS = [
  squat, backToWall, highCistern, walkInBath, babyBath, squareShower, bathScreen, bathFiller,
  washstandVanity, washerVanity, utilitySink, victorianWashstand, pivotMirror, wallCubby, hotelShelf, grabBars, robeHook,
  towelStand, showerChair, footstool, mopBucket, toothbrushCup, counterOrganiser, showerBottles, towelBasket,
];
