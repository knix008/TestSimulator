// More company workplace pieces (category 'workplace'), part 2: seating (drafting chair, saddle /
// wobble stools, stacking / nesting / sled chairs, modular lounge, high-back acoustic sofa, booth,
// tiered seating, lobby bench), pods (4-person meeting pod, nap pod), pantry (island with sink and
// fridge, snack + drink vending, bean-to-cup coffee, microwave station, glass-door fridge,
// recycling station) and technology (open rack, wall network cabinet, UPS, plotter, production
// printer, speed gates, video wall).
// Origin: bottom centre (finish() re-centres every build), front +Z. See ARCHITECTURE.md §12.
import { THREE, Kit, P, frameShape, addHandle } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const CAT = 'workplace';
const w$ = (def) => mk({ category: CAT, ...def });
const U = 0.0445; // one rack unit

/* --------------------------------------------------------------- helpers */

/** 5-star base with twin-wheel castors + gas lift up to `top` (as in workplace.js). */
function starBase(k, mat, { R = 0.31, top = 0.42 } = {}) {
  k.cyl('base', mat, 0.04, 0.05, 0.06, 0, 0.075, 0, { segs: k.seg(20, 8) });
  for (let i = 0; i < 5; i++) {
    const a = PI / 2 + (i / 5) * PI * 2, c = Math.cos(a), s = Math.sin(a);
    k.rod('base', mat, [c * 0.03, 0.105, s * 0.03], [c * R, 0.075, s * R], 0.016, { r2: 0.022, segs: k.seg(10, 5) });
    k.box('casters', 'plastic-black', 0.035, 0.03, 0.045, c * R, 0.055, s * R, { r: 0.008, segs: 2, ry: -a });
    k.cyl('casters', 'plastic-black', 0.025, 0.025, 0.04, c * (R + 0.01) - 0.02 * s, 0.025, s * (R + 0.01) + 0.02 * c, { rz: PI / 2, ry: -a, segs: k.seg(14, 6) });
  }
  k.cyl('lift', 'metal-chrome', 0.014, 0.014, top - 0.12, 0, 0.1, 0, { segs: k.seg(14, 6) });
  k.cyl('lift', 'plastic-black', 0.025, 0.028, Math.min(0.16, (top - 0.1) * 0.5), 0, 0.11, 0, { segs: k.seg(16, 6) });
}

/** Single castor (wheel axis along x) whose wheel touches the floor at (x, z). */
function castor(k, x, z, r = 0.028) {
  k.cyl('casters', 'plastic-black', r, r, 0.022, x + 0.011, r, z, { rz: PI / 2, segs: k.seg(14, 6) });
  k.box('casters', 'plastic-black', 0.03, 0.03, 0.04, x, 2 * r + 0.01, z, { r: 0.006, segs: 2 });
}

/** A row of small boxes (buttons, LEDs, ports) along x centred at (x, y) on a face at zf. */
function dots(k, role, mat, n, x, y, zf, pitch, s = 0.012) {
  for (let i = 0; i < n; i++) k.box(role, mat, s, s, 0.004, x + (i - (n - 1) / 2) * pitch, y, zf + 0.002, { r: 0 });
}

/** Rack-mount device (19" = 0.483 wide) whose bottom is at y, front face at zf. kind: 'patch' | 'switch' | 'server' | 'manager'. */
function rackDevice(k, kind, y, zf, depth = 0.3) {
  const h = (kind === 'server' ? 2 : 1) * U - 0.002, W = 0.483;
  k.box('devices', 'plastic-black', W - 0.04, h, depth, 0, y + h / 2, zf - depth / 2, { r: 0.002 });
  k.box('devices', 'metal-black', W, h, 0.004, 0, y + h / 2, zf - 0.002, { r: 0 }); // front plate with ears
  if (kind === 'patch' || kind === 'switch') {
    for (const s of [-1, 1]) k.box('ports', 'plastic-grey', 0.18, 0.016, 0.004, s * 0.1, y + h / 2, zf + 0.002, { r: 0 });
    if (kind === 'switch') dots(k, 'display', 'light-cool', 6, 0.0, y + h / 2 + 0.012, zf, 0.012, 0.004);
  } else if (kind === 'server') {
    for (let i = 0; i < 6; i++) k.box('ports', 'plastic-grey', 0.05, 0.02, 0.004, -0.17 + i * 0.058, y + h / 2, zf + 0.002, { r: 0.001 });
    dots(k, 'display', 'light-cool', 2, 0.2, y + h / 2, zf, 0.012, 0.005);
  } else {
    // horizontal cable manager: plate with finger slots
    for (let i = 0; i < 8; i++) k.box('devices', 'plastic-black', 0.012, h, 0.05, -0.2 + i * 0.057, y + h / 2, zf + 0.025, { r: 0.002 });
  }
}

/* ------------------------------------------------------------------ seating */

const draftingChair = w$({
  id: 'wpy-drafting-chair', ko: '드래프팅 체어(높은 작업 의자)', en: 'Drafting chair (high task chair)',
  params: [
    P.len('seatH', '좌판 높이', 'Seat height', 0.75, 0.62, 0.85),
    P.mat('fabric', '천', 'Upholstery', 'fabric-wool-charcoal', 'fabric'),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal'),
    P.bool('arms', '팔걸이', 'Arms', false),
  ],
  tags: ['drafting chair', 'high task chair', 'counter chair', 'foot ring', '드래프팅 체어', '높은 의자', '작업 의자', '발받침 링'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sy = p.seatH;
    starBase(k, p.frame, { R: 0.33, top: sy - 0.08 });
    // adjustable foot ring on three spokes with a clamp collar
    const ry = sy * 0.45, R = 0.23;
    k.add('ring', p.frame, new THREE.TorusGeometry(R, 0.011, k.seg(8, 4), k.seg(40, 12)).rotateX(PI / 2).translate(0, ry, 0));
    for (let i = 0; i < 3; i++) {
      const a = PI / 2 + (i * 2 * PI) / 3;
      k.rod('ring', p.frame, [Math.cos(a) * 0.03, ry, Math.sin(a) * 0.03], [Math.cos(a) * R, ry, Math.sin(a) * R], 0.008, { segs: k.seg(8, 4) });
    }
    k.cyl('mech', 'plastic-black', 0.04, 0.04, 0.045, 0, ry - 0.022, 0, { segs: k.seg(16, 6) });
    k.box('mech', 'plastic-black', 0.22, 0.05, 0.24, 0, sy - 0.075, 0, { r: 0.01, segs: 2 });
    k.soft('seat', p.fabric, 0.48, 0.08, 0.46, 0.03, 0, sy - 0.01, 0.03, { puff: 0.008 });
    k.box('mech', 'plastic-black', 0.06, 0.32, 0.03, 0, sy + 0.08, -0.23, { r: 0.008, rx: -0.1, segs: 2 });
    k.soft('seat', p.fabric, 0.44, 0.42, 0.07, 0.03, 0, sy + 0.36, -0.27, { rx: -0.12, puff: 0.01 });
    if (p.arms) for (const s of [-1, 1]) {
      const x = s * 0.255;
      k.box('mech', 'plastic-black', 0.03, 0.2, 0.05, x, sy + 0.07, -0.02, { r: 0.008, segs: 2 });
      k.rbox('mech', 'plastic-black', 0.07, 0.03, 0.24, 0.012, x, sy + 0.18, 0);
    }
    return finish(k);
  },
});

const saddleStool = w$({
  id: 'wpy-saddle-stool', ko: '새들 스툴(말안장 의자)', en: 'Saddle stool',
  params: [
    P.len('height', '좌면 높이', 'Seat height', 0.62, 0.5, 0.8),
    P.mat('leather', '가죽', 'Leather', 'leather-black', 'leather'),
    P.mat('frame', '받침', 'Base', 'metal-chrome', 'metal'),
  ],
  tags: ['saddle stool', 'saddle chair', 'ergonomic stool', 'lab stool', '새들 스툴', '안장 의자', '인체공학 의자', '스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height;
    starBase(k, p.frame, { R: 0.29, top: h - 0.07 });
    k.box('mech', 'plastic-black', 0.16, 0.04, 0.18, 0, h - 0.08, 0, { r: 0.01, segs: 2 });
    k.box('mech', 'plastic-black', 0.03, 0.012, 0.12, 0.1, h - 0.1, 0.02, { r: 0.004 }); // lift lever
    // two seat wings sloping to the sides, a centre ridge and a raised pommel at the front
    for (const s of [-1, 1]) k.soft('seat', p.leather, 0.22, 0.07, 0.36, 0.03, s * 0.11, h - 0.03, 0, { rz: -s * 0.22, puff: 0.006 });
    k.soft('seat', p.leather, 0.1, 0.07, 0.36, 0.03, 0, h - 0.015, 0.0, { puff: 0.004 });
    k.soft('seat', p.leather, 0.11, 0.07, 0.13, 0.03, 0, h + 0.01, 0.13, { rx: 0.3 });
    return finish(k);
  },
});

const stackingChair = w$({
  id: 'wpy-stacking-chair', ko: '스태킹 체어(PP 쉘)', en: 'Stacking shell chair',
  params: [
    P.len('seatH', '좌판 높이', 'Seat height', 0.45, 0.42, 0.48),
    P.mat('shell', '쉘', 'Shell', 'plastic-white', 'plastic'),
    P.mat('legs', '다리', 'Legs', 'metal-chrome', 'metal'),
  ],
  tags: ['stacking chair', 'shell chair', 'cafeteria chair', 'polypropylene', '스태킹 체어', '쌓는 의자', '플라스틱 의자', '식당 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sy = p.seatH, W = 0.46, t = 0.012;
    // side profile of the moulded shell (x = −z, y up) from the waterfall front up the back
    const line = [[-0.23, sy - 0.035], [-0.21, sy], [-0.1, sy + 0.008], [0.08, sy - 0.006], [0.17, sy + 0.01], [0.21, sy + 0.12], [0.24, sy + 0.28], [0.26, sy + 0.4]];
    const pts = new THREE.CatmullRomCurve3(line.map(([a, b]) => new THREE.Vector3(a, b, 0))).getPoints(k.seg(28, 10));
    const outer = [], inner = [];
    pts.forEach((q, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
      outer.push(new THREE.Vector2(q.x + (nx * t) / 2, q.y + (ny * t) / 2));
      inner.push(new THREE.Vector2(q.x - (nx * t) / 2, q.y - (ny * t) / 2));
    });
    k.panel('shell', p.shell, new THREE.Shape([...outer, ...inner.reverse()]), W, 0, 0, 0, { ry: PI / 2, bevel: 0.004, curveSegs: 4 });
    // four splayed tube legs, side rails (the stacking runners) and floor glides
    const ly = sy - 0.02;
    for (const sx of [-1, 1]) {
      k.rod('legs', p.legs, [sx * 0.235, 0.008, 0.24], [sx * 0.19, ly, 0.17], 0.0095, { segs: k.seg(10, 5) });
      k.rod('legs', p.legs, [sx * 0.235, 0.008, -0.25], [sx * 0.19, ly, -0.15], 0.0095, { segs: k.seg(10, 5) });
      k.rod('legs', p.legs, [sx * 0.19, ly, 0.17], [sx * 0.19, ly, -0.15], 0.0095, { segs: k.seg(10, 5) });
      for (const z of [0.24, -0.25]) k.cyl('glides', 'plastic-black', 0.012, 0.012, 0.01, sx * 0.235, 0, z, { segs: k.seg(10, 5) });
    }
    k.rod('legs', p.legs, [-0.19, ly - 0.005, -0.1], [0.19, ly - 0.005, -0.1], 0.008, { segs: k.seg(10, 5) });
    return finish(k);
  },
});

const nestingChair = w$({
  id: 'wpy-nesting-chair', ko: '네스팅 체어(접이 좌판, 바퀴)', en: 'Nesting chair (flip seat, castors)',
  params: [
    P.bool('folded', '좌판 접기', 'Seat flipped up', false),
    P.bool('arms', '팔걸이', 'Arms', true),
    P.mat('fabric', '천', 'Upholstery', 'fabric-navy', 'fabric'),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['nesting chair', 'flip seat chair', 'training chair', 'mobile chair', '네스팅 체어', '접이식 의자', '교육장 의자', '바퀴 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sy = 0.46, f = p.frame, X = 0.26;
    for (const s of [-1, 1]) {
      const x = s * X;
      k.rod('frame', f, [x, 0.075, 0.25], [x, 0.075, -0.27], 0.011, { segs: k.seg(10, 5) }); // floor bar
      k.rod('frame', f, [x, 0.075, 0.23], [x, sy - 0.04, 0.17], 0.011, { segs: k.seg(10, 5) });
      k.rod('frame', f, [x, 0.075, -0.25], [x, sy + 0.42, -0.31], 0.011, { segs: k.seg(10, 5) });
      castor(k, x, 0.25);
      castor(k, x, -0.27);
      if (p.arms) {
        k.rod('frame', f, [x, sy + 0.2, -0.28], [x, sy + 0.2, 0.12], 0.01, { segs: k.seg(10, 5) });
        k.rod('frame', f, [x, sy + 0.2, 0.12], [x, sy - 0.04, 0.17], 0.01, { segs: k.seg(10, 5) });
        k.rbox('arms', 'plastic-black', 0.05, 0.025, 0.24, 0.01, x, sy + 0.22, -0.04);
      }
    }
    k.rod('frame', f, [-X, sy - 0.04, -0.2], [X, sy - 0.04, -0.2], 0.01, { segs: k.seg(10, 5) }); // seat pivot bar
    k.rod('frame', f, [-X, sy - 0.04, 0.17], [X, sy - 0.04, 0.17], 0.01, { segs: k.seg(10, 5) });
    if (p.folded) k.soft('seat', p.fabric, 0.46, 0.44, 0.06, 0.025, 0, sy + 0.2, -0.2);
    else {
      k.box('arms', 'plastic-black', 0.42, 0.015, 0.4, 0, sy - 0.02, -0.01, { r: 0.004 });
      k.soft('seat', p.fabric, 0.46, 0.06, 0.44, 0.025, 0, sy + 0.02, -0.01, { puff: 0.006 });
    }
    k.soft('seat', p.fabric, 0.48, 0.3, 0.05, 0.02, 0, sy + 0.3, -0.3, { rx: -0.1, puff: 0.006 });
    return finish(k);
  },
});

const sledChair = w$({
  id: 'wpy-sled-chair', ko: '썰매 다리 회의 의자', en: 'Sled-base meeting chair',
  params: [
    P.len('width', '폭', 'Width', 0.58, 0.5, 0.66),
    P.mat('fabric', '천', 'Upholstery', 'fabric-linen-grey', 'fabric'),
    P.mat('frame', '프레임', 'Frame', 'metal-chrome', 'metal'),
  ],
  tags: ['sled chair', 'meeting chair', 'conference chair', 'visitor chair', '썰매 의자', '회의 의자', '회의실 의자', '방문객 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, r = 0.011;
    for (const s of [-1, 1]) {
      const x = s * (W / 2);
      // one bent tube per side: arm → front leg → floor runner → back upright → arm
      k.bentTube('frame', p.frame, [[x, 0.63, 0.0], [x, 0.63, 0.2], [x, r, 0.27], [x, r, -0.25], [x, 0.63, -0.21], [x, 0.63, 0.02]], r, 0.05, { radial: k.seg(10, 5) });
      k.rbox('arms', 'plastic-black', 0.05, 0.022, 0.3, 0.009, x, 0.645, -0.01);
    }
    for (const z of [0.17, -0.17]) k.rod('frame', p.frame, [-W / 2, 0.39, z], [W / 2, 0.39, z], 0.009, { segs: k.seg(10, 5) });
    k.soft('seat', p.fabric, W - 0.05, 0.08, 0.46, 0.03, 0, 0.44, 0.0, { puff: 0.008 });
    k.soft('seat', p.fabric, W - 0.05, 0.42, 0.07, 0.03, 0, 0.7, -0.24, { rx: -0.1, puff: 0.01 });
    return finish(k);
  },
});

const modularLounge = w$({
  id: 'wpy-modular-lounge', ko: '모듈형 라운지 소파(전원 모듈)', en: 'Modular lounge sofa with power module',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.len('depth', '깊이', 'Depth', 0.85, 0.75, 1.0),
    P.pick('arm', '팔걸이', 'Arm', 'left', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right'], ['none', '없음', 'None']]),
    P.bool('power', '전원 테이블', 'Power table', true),
    P.mat('fabric', '천', 'Fabric', 'fabric-mustard', 'fabric'),
    P.mat('wood', '테이블', 'Table top', 'wood-oak', 'wood'),
  ],
  tags: ['modular sofa', 'lounge sofa', 'breakout seating', 'power module', '모듈 소파', '라운지 소파', '휴게 공간', '전원 콘센트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth;
    k.box('plinth', 'plastic-black', W - 0.06, 0.08, D - 0.06, 0, 0.04, 0, { r: 0.004 });
    k.soft('fabric', p.fabric, W, 0.2, D, 0.03, 0, 0.18, 0);
    k.soft('fabric', p.fabric, W - 0.02, 0.13, D - 0.22, 0.04, 0, 0.345, 0.1, { puff: 0.012 });
    k.soft('fabric', p.fabric, W, 0.44, 0.2, 0.05, 0, 0.5, -D / 2 + 0.1, { puff: 0.01 });
    const armSide = p.arm === 'right' ? 1 : p.arm === 'left' ? -1 : 0;
    if (armSide) k.soft('fabric', p.fabric, 0.18, 0.4, D, 0.05, armSide * (W / 2 + 0.09), 0.28, 0, { puff: 0.008 });
    if (p.power) {
      const s = armSide ? -armSide : 1, x = s * (W / 2 + 0.17);
      // side table with a pop-up socket box on a steel sled
      k.box('table', p.wood, 0.34, 0.025, D - 0.1, x, 0.56, 0, { r: 0.004 });
      k.bentTube('steel', 'metal-black', [[x, 0.545, -D / 2 + 0.1], [x, 0.01, -D / 2 + 0.1], [x, 0.01, D / 2 - 0.1], [x, 0.545, D / 2 - 0.1]], 0.01, 0.03);
      k.box('socket', 'plastic-black', 0.16, 0.05, 0.08, x, 0.597, -0.1, { r: 0.006, segs: 2 });
      dots(k, 'socket', 'plastic-grey', 3, x, 0.6, -0.06, 0.045, 0.02);
    }
    return finish(k);
  },
});

const highbackSofa = w$({
  id: 'wpy-highback-sofa', ko: '하이백 흡음 소파(2인)', en: 'High-back acoustic sofa (2 seat)',
  params: [
    P.len('width', '폭', 'Width', 1.6, 1.3, 2.2),
    P.len('height', '등받이 높이', 'Back height', 1.35, 1.1, 1.6),
    P.bool('canopy', '지붕 패널', 'Canopy', false),
    P.mat('fabric', '바깥 천', 'Outer fabric', 'fabric-wool-charcoal', 'fabric'),
    P.mat('inner', '안쪽 천', 'Inner fabric', 'fabric-velvet-green', 'fabric'),
    P.mat('legs', '다리', 'Legs', 'metal-black', 'metal'),
  ],
  tags: ['high back sofa', 'acoustic sofa', 'privacy sofa', 'booth sofa', '하이백 소파', '흡음 소파', '집중 소파', '2인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.8, legH = 0.12;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', p.legs, 0.015, 0.012, legH, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08), { segs: k.seg(12, 6) });
    k.box('fabric', p.fabric, W, 0.2, D, 0, legH + 0.1, 0, { r: 0.01 });
    for (const s of [-1, 1]) k.soft('fabric', p.fabric, 0.1, H - legH, D, 0.03, s * (W / 2 - 0.05), legH + (H - legH) / 2, 0);
    k.soft('fabric', p.fabric, W, H - legH, 0.1, 0.03, 0, legH + (H - legH) / 2, -D / 2 + 0.05);
    // contrasting inner lining and two seat + back cushions
    k.soft('inner', p.inner, W - 0.2, H - legH - 0.32, 0.04, 0.015, 0, legH + 0.2 + (H - legH - 0.2) / 2, -D / 2 + 0.12);
    const cw = (W - 0.2) / 2;
    for (const s of [-1, 1]) {
      k.soft('inner', p.inner, cw - 0.01, 0.13, D - 0.18, 0.04, s * cw / 2, legH + 0.265, 0.06, { puff: 0.012 });
      k.soft('inner', p.inner, cw - 0.01, 0.42, 0.13, 0.05, s * cw / 2, legH + 0.55, -D / 2 + 0.19, { rx: -0.08, puff: 0.012 });
    }
    if (p.canopy) k.soft('fabric', p.fabric, W, 0.08, 0.55, 0.03, 0, H + 0.04, -D / 2 + 0.27);
    return finish(k);
  },
});

const boothSeating = w$({
  id: 'wpy-booth-seating', ko: '탕비실 부스 좌석(테이블 포함)', en: 'Pantry booth seating with table',
  params: [
    P.len('length', '길이', 'Length', 1.4, 0.9, 2.0),
    P.len('backH', '등받이 높이', 'Back height', 1.1, 0.85, 1.4),
    P.mat('fabric', '쿠션', 'Upholstery', 'fabric-terracotta', 'fabric'),
    P.mat('body', '몸체', 'Body', 'wood-oak', 'wood'),
    P.mat('top', '테이블 상판', 'Table top', 'quartz-white', 'stone'),
  ],
  tags: ['booth', 'booth seating', 'pantry booth', 'cafe booth', '부스 좌석', '탕비실', '카페 부스', '벤치 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, tD = 0.72;
    for (const s of [-1, 1]) {
      const zc = s * (tD / 2 + 0.22), zb = s * (tD / 2 + 0.47);
      k.box('body', p.body, L, 0.4, 0.5, 0, 0.2, zc + s * 0.03, { r: 0.006 });
      k.box('body', p.body, L, p.backH, 0.06, 0, p.backH / 2, zb + s * 0.0, { r: 0.006 });
      k.soft('fabric', p.fabric, L - 0.04, 0.08, 0.46, 0.03, 0, 0.44, zc + s * 0.02, { puff: 0.008 });
      k.soft('fabric', p.fabric, L - 0.04, p.backH - 0.55, 0.07, 0.03, 0, 0.5 + (p.backH - 0.55) / 2, zb - s * 0.065, { rx: s * 0.06, puff: 0.008 });
    }
    // table on a T-base (pedestal + floor foot)
    k.box('top', p.top, L - 0.1, 0.03, tD, 0, 0.735, 0, { r: 0.006 });
    k.box('base', 'metal-black', 0.08, 0.68, 0.08, 0, 0.36, 0, { r: 0.004 });
    k.box('base', 'metal-black', 0.6, 0.03, 0.08, 0, 0.015, 0, { r: 0.004, ry: PI / 2 });
    k.box('base', 'metal-black', Math.max(0.3, L - 0.4), 0.03, 0.06, 0, 0.705, 0, { r: 0.004 });
    return finish(k);
  },
});

const tieredSeating = w$({
  id: 'wpy-tiered-seating', ko: '계단식 좌석(타운홀)', en: 'Tiered seating steps (town hall)',
  params: [
    P.len('width', '폭', 'Width', 3.0, 1.8, 6),
    P.int('tiers', '단 수', 'Tiers', 3, 2, 4),
    P.mat('wood', '목재', 'Wood', 'wood-oak', 'wood'),
    P.mat('fabric', '쿠션', 'Cushions', 'fabric-linen-grey', 'fabric'),
    P.bool('cushions', '쿠션', 'Cushions', true),
  ],
  tags: ['tiered seating', 'bleacher', 'amphitheatre', 'town hall steps', '계단식 좌석', '스탠드 좌석', '타운홀', '계단 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, n = p.tiers, td = 0.6, rise = 0.42, D = n * td;
    for (let i = 0; i < n; i++) {
      const h = (i + 1) * rise, z1 = D / 2 - i * td;
      k.box('wood', p.wood, W, h, td, 0, h / 2, z1 - td / 2, { r: 0.006 });
      k.box('nosing', 'rubber-black', W, 0.02, 0.03, 0, h - 0.01, z1 - 0.012, { r: 0.004 });
      if (p.cushions) {
        const m = Math.max(1, Math.floor((W - 0.2) / 0.9)), cw = (W - 0.2) / m;
        for (let j = 0; j < m; j++) k.soft('fabric', p.fabric, cw - 0.06, 0.07, td - 0.16, 0.025, -W / 2 + 0.1 + cw * (j + 0.5), h + 0.035, z1 - td / 2 + 0.04, { puff: 0.008 });
      }
    }
    return finish(k);
  },
});

const wobbleStool = w$({
  id: 'wpy-wobble-stool', ko: '워블 스툴(액티브 의자)', en: 'Wobble stool (active seating)',
  params: [
    P.len('height', '높이', 'Height', 0.55, 0.45, 0.72),
    P.mat('fabric', '좌판', 'Seat', 'fabric-velvet-blue', 'fabric'),
    P.mat('base', '받침', 'Base', 'plastic-grey', 'plastic'),
  ],
  tags: ['wobble stool', 'active stool', 'rocking stool', 'ergonomic', '워블 스툴', '흔들 의자', '액티브 의자', '스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height;
    // rounded, weighted rocker base with a rubber tread
    k.lathe('base', p.base, [[0, 0], [0.06, 0.002], [0.13, 0.014], [0.17, 0.035], [0.18, 0.055], [0.17, 0.068], [0.05, 0.075], [0, 0.075]], 0, 0, 0, { segs: k.seg(36, 10), smooth: 14 });
    k.lathe('tread', 'rubber-black', [[0, 0], [0.06, 0.002], [0.1, 0.007], [0.0, 0.007]], 0, -0.0005, 0, { segs: k.seg(28, 8) });
    k.cyl('base', p.base, 0.034, 0.04, (h - 0.16) * 0.55, 0, 0.07, 0, { segs: k.seg(18, 6) });
    k.cyl('column', 'metal-chrome', 0.02, 0.02, h - 0.14, 0, 0.08, 0, { segs: k.seg(14, 6) });
    k.box('column', 'plastic-black', 0.08, 0.012, 0.025, 0.04, h - 0.095, 0, { r: 0.004 }); // height lever
    k.cyl('column', 'plastic-black', 0.06, 0.045, 0.03, 0, h - 0.1, 0, { segs: k.seg(18, 6) });
    k.lathe('seat', p.fabric, [[0, 0], [0.15, 0], [0.175, 0.012], [0.182, 0.04], [0.17, 0.065], [0.12, 0.075], [0, 0.077]], 0, h - 0.077, 0, { segs: k.seg(36, 10), smooth: 12 });
    return finish(k);
  },
});

const lobbyBench = w$({
  id: 'wpy-lobby-bench', ko: '로비 벤치(등받이 없음, 터프팅)', en: 'Tufted backless lobby bench',
  params: [
    P.len('length', '길이', 'Length', 1.8, 1.0, 3.0),
    P.len('depth', '깊이', 'Depth', 0.5, 0.4, 0.7),
    P.pick('base', '받침', 'Base', 'legs', [['legs', '금속 다리', 'Metal legs'], ['plinth', '좌대', 'Plinth']]),
    P.mat('fabric', '천', 'Upholstery', 'leather-cognac', 'leather'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['lobby bench', 'waiting bench', 'tufted bench', 'ottoman bench', '로비 벤치', '대기 벤치', '터프팅', '긴 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = p.depth, top = 0.45;
    if (p.base === 'legs') {
      k.box('frame', p.metal, L - 0.02, 0.03, D - 0.02, 0, 0.255, 0, { r: 0.004 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.metal, 0.03, 0.24, 0.03, sx * (L / 2 - 0.05), 0.12, sz * (D / 2 - 0.05), { r: 0.003 });
    } else {
      k.box('frame', p.metal, L - 0.08, 0.27, D - 0.08, 0, 0.135, 0, { r: 0.004 });
    }
    k.soft('seat', p.fabric, L, top - 0.27, D, 0.04, 0, 0.27 + (top - 0.27) / 2, 0, { puff: 0.015 });
    // diamond tufting buttons in two staggered rows
    const n = Math.max(3, Math.round(L / 0.25));
    for (let i = 0; i < n; i++) for (const [row, off] of [[-1, 0], [1, 0.5]]) {
      const x = -L / 2 + (L / n) * (i + 0.25 + off * 0.5);
      if (Math.abs(x) > L / 2 - 0.08) continue;
      k.sphere('buttons', p.fabric, 0.011, x, top + 0.006, row * D * 0.2, { segs: k.seg(8, 5), rings: k.seg(6, 3), scale: [1, 0.5, 1] });
    }
    return finish(k);
  },
});

/* --------------------------------------------------------------------- pods */

const meetingPod = w$({
  id: 'wpy-meeting-pod-4', ko: '4인 회의 부스(밀폐형)', en: 'Enclosed 4-person meeting pod',
  params: [
    P.len('width', '폭', 'Width', 2.2, 1.9, 2.6),
    P.len('depth', '깊이', 'Depth', 1.6, 1.4, 2.0),
    P.mat('shell', '외장', 'Shell', 'paint-white-matte', 'paint'),
    P.mat('felt', '흡음재', 'Acoustic felt', 'fabric-wool-charcoal', 'fabric'),
    P.mat('seat', '좌석', 'Seats', 'fabric-velvet-green', 'fabric'),
    P.mat('top', '테이블', 'Table', 'wood-oak', 'wood'),
  ],
  tags: ['meeting pod', 'meeting booth', 'acoustic pod', 'huddle room', '회의 부스', '미팅 부스', '방음 부스', '4인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 2.3, t = 0.06;
    k.box('shell', p.shell, W, 0.06, D, 0, 0.03, 0, { r: 0.006 }); // raised floor
    k.box('shell', p.shell, W, H - 0.06, t, 0, H / 2 + 0.03, -D / 2 + t / 2, { r: 0.006 });
    for (const s of [-1, 1]) k.box('shell', p.shell, t, H - 0.06, D, s * (W / 2 - t / 2), H / 2 + 0.03, 0, { r: 0.006 });
    k.box('shell', p.shell, W, 0.08, D, 0, H - 0.04 + 0.03, 0, { r: 0.006 });
    k.box('felt', p.felt, W - 2 * t, H - 0.3, 0.02, 0, H / 2, -D / 2 + t + 0.01, { r: 0.004 });
    for (const s of [-1, 1]) k.box('felt', p.felt, 0.02, H - 0.3, D - 0.3, s * (W / 2 - t - 0.01), H / 2, -0.1, { r: 0.004 });
    // glass front: two fixed lites + door with a long pull
    const zf = D / 2 - 0.02, gw = W - 2 * t;
    k.box('frame', 'metal-black', gw, 0.04, 0.04, 0, H - 0.08, zf, { r: 0.003 });
    k.box('frame', 'metal-black', gw, 0.03, 0.04, 0, 0.075, zf, { r: 0.003 });
    for (const x of [-gw / 2 + 0.02, -gw / 6, gw / 6, gw / 2 - 0.02]) k.box('frame', 'metal-black', 0.035, H - 0.18, 0.04, x, H / 2 - 0.005, zf, { r: 0.003 });
    k.box('glass', 'glass-clear', gw - 0.04, H - 0.2, 0.01, 0, H / 2 - 0.005, zf, { r: 0 });
    k.box('frame', 'metal-black', 0.025, 0.9, 0.03, gw / 6 - 0.06, 1.1, zf + 0.04, { r: 0.004 });
    // inside: table with a pedestal, two upholstered benches facing it
    k.box('top', p.top, 0.6, 0.03, D * 0.55, 0, 0.75, -0.05, { r: 0.005 });
    k.cyl('base', 'metal-black', 0.035, 0.035, 0.68, 0, 0.06, -0.05, { segs: k.seg(14, 6) });
    k.box('base', 'metal-black', 0.4, 0.02, 0.4, 0, 0.07, -0.05, { r: 0.004 });
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - t - 0.3);
      k.box('shell', p.shell, 0.5, 0.36, D - 0.4, x, 0.24, -0.08, { r: 0.006 });
      k.soft('seat', p.seat, 0.5, 0.08, D - 0.42, 0.03, x, 0.46, -0.08, { puff: 0.008 });
      k.soft('seat', p.seat, 0.08, 0.5, D - 0.42, 0.03, s * (W / 2 - t - 0.06), 0.8, -0.08, { puff: 0.006 });
    }
    // ceiling LED panel + ventilation grille on the roof
    k.box('lamp', 'light-cool', W * 0.5, 0.01, D * 0.4, 0, H - 0.005 - 0.03 + 0.0, -0.05, { r: 0.002 });
    for (let i = 0; i < 5; i++) k.box('frame', 'metal-black', 0.3, 0.012, 0.015, -W / 4, H + 0.036, -D / 4 + i * 0.03, { r: 0.002 });
    k.light(0, H - 0.08, -0.05, { color: '#f4f7ff', intensity: 0.9, distance: 3.5 });
    return finish(k);
  },
});

const napPod = w$({
  id: 'wpy-nap-pod', ko: '수면 포드(낮잠 의자)', en: 'Nap pod (sleep recliner with hood)',
  params: [
    P.mat('shell', '외장', 'Shell', 'plastic-white', 'plastic'),
    P.mat('cushion', '쿠션', 'Cushion', 'leather-black', 'leather'),
    P.mat('hood', '후드', 'Hood', 'plastic-grey', 'plastic'),
    P.bool('hoodOn', '후드', 'Privacy hood', true),
  ],
  tags: ['nap pod', 'sleep pod', 'rest pod', 'wellness', '수면 포드', '낮잠 의자', '휴게실', '리클라이너'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // pedestal base and the moulded shell carrying the reclined cushion
    k.rbox('shell', p.shell, 0.55, 0.3, 1.2, 0.08, 0, 0.15, 0.05, { segs: k.seg(4, 1) });
    k.rbox('shell', p.shell, 0.78, 0.14, 1.95, 0.06, 0, 0.36, 0.0, { segs: k.seg(4, 1) });
    k.soft('cushion', p.cushion, 0.62, 0.1, 0.62, 0.04, 0, 0.5, 0.62, { rx: -0.25, puff: 0.01 });
    k.soft('cushion', p.cushion, 0.62, 0.12, 0.55, 0.04, 0, 0.5, 0.05, { puff: 0.01 });
    k.soft('cushion', p.cushion, 0.62, 0.1, 0.78, 0.04, 0, 0.72, -0.52, { rx: 0.65, puff: 0.01 });
    for (const s of [-1, 1]) k.rbox('shell', p.shell, 0.08, 0.2, 0.9, 0.03, s * 0.36, 0.5, -0.1, { segs: k.seg(3, 1) });
    k.box('controls', 'plastic-black', 0.06, 0.012, 0.12, 0.36, 0.605, 0.2, { r: 0.004 });
    if (p.hoodOn) {
      const R = 0.55, n = k.seg(16, 6);
      const outer = [], inner = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * PI / 2; outer.push([R * Math.cos(a), R * Math.sin(a)]); inner.push([(R - 0.015) * Math.cos(a), (R - 0.015) * Math.sin(a)]); }
      k.lathe('hood', p.hood, outer, 0, 0.45 + R, -0.45, { rx: -PI / 2, segs: k.seg(32, 10) });
      k.lathe('hoodIn', 'paint-grey-matte', inner.reverse(), 0, 0.45 + R, -0.45, { rx: -PI / 2, segs: k.seg(32, 10) });
      k.add('hood', p.hood, new THREE.TorusGeometry(R - 0.007, 0.012, k.seg(8, 4), k.seg(40, 12)).translate(0, 0.45 + R, -0.45));
    }
    return finish(k);
  },
});

/* -------------------------------------------------------------------- pantry */

const pantryIsland = w$({
  id: 'wpy-pantry-island', ko: '탕비실 아일랜드(싱크·냉장고)', en: 'Pantry island with sink and fridge',
  params: [
    P.len('length', '길이', 'Length', 2.4, 1.8, 3.2),
    P.len('depth', '깊이', 'Depth', 0.9, 0.7, 1.1),
    P.mat('front', '문짝', 'Fronts', 'paint-green-matte', 'paint'),
    P.mat('top', '상판', 'Top', 'quartz-white', 'stone'),
  ],
  tags: ['pantry island', 'office kitchen', 'tea point', 'sink', 'under-counter fridge', '탕비실', '아일랜드', '싱크대', '사무실 주방'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = p.depth, H = 0.92, tt = 0.03, y0 = H - tt, fw = 0.6, ft = 0.019;
    const cw = L - fw, cx = -fw / 2, n = Math.max(2, Math.round(cw / 0.6));
    // hollow carcass (so the sink can show): plinth, sides, back, bottom, then the doors
    k.box('body', 'paint-white-matte', cw - 0.02, 0.08, D - 0.08, cx, 0.04, -0.02, { r: 0.002 });
    for (const x of [cx - cw / 2 + 0.009, cx + cw / 2 - 0.009]) k.box('body', 'paint-white-matte', 0.018, y0 - 0.08, D - ft, x, 0.08 + (y0 - 0.08) / 2, -ft / 2, { r: 0.001 });
    k.box('body', 'paint-white-matte', cw, y0 - 0.08, 0.018, cx, 0.08 + (y0 - 0.08) / 2, -D / 2 + 0.009, { r: 0.001 });
    k.box('body', 'paint-white-matte', cw, 0.018, D - ft, cx, 0.089, -ft / 2, { r: 0.001 });
    const dw = cw / n, dh = y0 - 0.08 - 0.003;
    for (let i = 0; i < n; i++) {
      const x = cx - cw / 2 + dw * (i + 0.5);
      k.box('fronts', p.front, dw - 0.003, dh, ft, x, 0.08 + dh / 2, D / 2 - ft / 2, { r: 0.002 });
      addHandle(k, 'handles', 'metal-steel', 'bar', x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), y0 - 0.12, D / 2, { len: 0.14, vertical: true });
    }
    // under-counter glass-door fridge at the right end
    const fx = L / 2 - fw / 2;
    k.box('fridge', 'metal-steel', fw - 0.005, y0, D - 0.02, fx, y0 / 2, -0.01, { r: 0.004 });
    k.panel('fridgeDoor', 'metal-black', frameShape(fw - 0.02, y0 - 0.1, 0.05, 0.06), 0.03, fx, 0.06 + (y0 - 0.1) / 2, D / 2 - 0.0, { bevel: 0.003 });
    k.box('glass', 'glass-tinted', fw - 0.12, y0 - 0.22, 0.008, fx, 0.06 + (y0 - 0.1) / 2, D / 2 - 0.005, { r: 0 });
    for (const y of [0.3, 0.55]) for (let i = 0; i < 5; i++) k.cyl('bottles', 'book-green', 0.028, 0.028, 0.2, fx - 0.18 + i * 0.09, y, D / 2 - 0.12, { segs: k.seg(10, 5) });
    k.box('fridgeDoor', 'metal-black', 0.02, 0.4, 0.03, fx - fw / 2 + 0.06, 0.06 + (y0 - 0.1) / 2, D / 2 + 0.03, { r: 0.004 });
    // top in pieces around the sink, basin, faucet
    const sw = 0.5, sd = Math.min(0.42, D - 0.3), sx = cx - cw / 4 + 0.05, sz = -0.02, TD = D + 0.04;
    const piece = (x0, x1, z0, z1) => { if (x1 - x0 > 0.005 && z1 - z0 > 0.005) k.box('top', p.top, x1 - x0, tt, z1 - z0, (x0 + x1) / 2, y0 + tt / 2, (z0 + z1) / 2, { r: 0.003 }); };
    piece(-L / 2 - 0.02, sx - sw / 2, -TD / 2, TD / 2);
    piece(sx + sw / 2, L / 2 + 0.02, -TD / 2, TD / 2);
    piece(sx - sw / 2, sx + sw / 2, sz + sd / 2, TD / 2);
    piece(sx - sw / 2, sx + sw / 2, -TD / 2, sz - sd / 2);
    const bd = 0.18, by = y0 + tt - bd;
    k.box('sink', 'metal-steel', sw, 0.004, sd, sx, by, sz, { r: 0 });
    for (const s of [-1, 1]) {
      k.box('sink', 'metal-steel', 0.004, bd, sd, sx + s * (sw / 2 - 0.002), by + bd / 2, sz, { r: 0 });
      k.box('sink', 'metal-steel', sw, bd, 0.004, sx, by + bd / 2, sz + s * (sd / 2 - 0.002), { r: 0 });
    }
    k.cyl('tap', 'plastic-black', 0.02, 0.02, 0.004, sx, by + 0.003, sz, { segs: k.seg(14, 6) });
    const tz = sz - sd / 2 - 0.06;
    k.cyl('tap', 'metal-chrome', 0.025, 0.025, 0.05, sx, H, tz, { segs: k.seg(14, 6) });
    k.tube('tap', 'metal-chrome', [[sx, H + 0.04, tz], [sx, H + 0.3, tz], [sx, H + 0.36, tz + 0.08], [sx, H + 0.3, tz + 0.2], [sx, H + 0.22, tz + 0.21]], 0.012, { radial: k.seg(10, 5), segs: k.seg(28, 10) });
    return finish(k);
  },
});

const vendingSnack = w$({
  id: 'wpy-vending-snack', ko: '과자 자판기', en: 'Snack vending machine',
  params: [
    P.int('rows', '진열 단 수', 'Shelf rows', 5, 4, 6),
    P.mat('body', '외장', 'Cabinet', 'paint-black-matte', 'paint'),
    P.mat('accent', '포인트', 'Accent', 'paint-blue-matte', 'paint'),
  ],
  tags: ['vending machine', 'snack machine', 'pantry', 'break room', '자판기', '과자 자판기', '스낵 자판기', '휴게실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.9, H = 1.83, D = 0.85, t = 0.03, cw = 0.24, gx0 = -W / 2 + t, gx1 = W / 2 - cw, gw = gx1 - gx0, gc = (gx0 + gx1) / 2;
    k.box('body', p.body, W, 0.12, D - 0.04, 0, 0.06, -0.02, { r: 0.006 }); // base with feet
    k.box('body', p.body, t, H - 0.12, D, -W / 2 + t / 2, 0.12 + (H - 0.12) / 2, 0, { r: 0.004 });
    k.box('body', p.body, W, t, D, 0, H - t / 2, 0, { r: 0.004 });
    k.box('body', p.body, W, H - 0.12, t, 0, 0.12 + (H - 0.12) / 2, -D / 2 + t / 2, { r: 0.004 });
    k.box('accent', p.accent, cw, H - 0.12, D, W / 2 - cw / 2, 0.12 + (H - 0.12) / 2, 0, { r: 0.006 });
    // lower part: delivery bin with a push flap
    k.box('body', p.body, gw, 0.42, D - 0.06, gc, 0.12 + 0.21, -0.03, { r: 0.004 });
    k.box('flap', 'plastic-black', gw - 0.12, 0.16, 0.02, gc, 0.3, D / 2 - 0.05, { r: 0.006 });
    // glazed display: interior back, shelf rows with spiral coils and packets
    const y0 = 0.56, y1 = H - 0.08, n = p.rows, rh = (y1 - y0) / n;
    k.box('interior', 'paint-white-matte', gw, y1 - y0, 0.01, gc, (y0 + y1) / 2, -D / 2 + t + 0.005, { r: 0 });
    const cols = 5, pitch = (gw - 0.04) / cols;
    const packs = ['book-red', 'book-blue', 'book-green', 'book-cream', 'book-red'];
    for (let r = 0; r < n; r++) {
      const sy = y0 + r * rh;
      k.box('shelf', 'metal-steel', gw, 0.008, D - 0.2, gc, sy + 0.004, -0.04, { r: 0 });
      for (let c = 0; c < cols; c++) {
        const x = gx0 + 0.02 + pitch * (c + 0.5), turns = 6, len = D - 0.28;
        const pts = [];
        for (let i = 0; i <= turns * 8; i++) { const a = (i / 8) * PI * 2; pts.push([x + Math.cos(a) * 0.035, sy + 0.045 + Math.sin(a) * 0.035, -len / 2 - 0.04 + (i / (turns * 8)) * len]); }
        k.tube('coils', 'metal-chrome', pts, 0.0025, { segs: k.seg(48, 14), radial: k.seg(5, 3) });
        k.box(`packs`, packs[(c + r) % packs.length], pitch * 0.72, rh * 0.62, 0.035, x, sy + 0.012 + rh * 0.31, 0.12, { r: 0.004 });
        k.box('labels', 'paint-white-gloss', 0.03, 0.012, 0.004, x, sy + 0.012, D / 2 - 0.11, { r: 0 });
      }
    }
    const zf = D / 2 - 0.05;
    k.box('glass', 'glass-clear', gw, y1 - y0, 0.008, gc, (y0 + y1) / 2, zf, { r: 0 });
    // control column: display, keypad, coin + card slots
    const kx = W / 2 - cw / 2, zc = D / 2;
    k.box('display', 'light-cool', 0.14, 0.05, 0.006, kx, 1.35, zc + 0.003, { r: 0.002 });
    for (let r = 0; r < 4; r++) dots(k, 'keys', 'metal-chrome', 3, kx, 1.25 - r * 0.04, zc, 0.04, 0.026);
    k.box('keys', 'plastic-black', 0.08, 0.06, 0.012, kx, 0.98, zc + 0.006, { r: 0.004 });
    k.box('keys', 'plastic-black', 0.1, 0.035, 0.012, kx, 0.88, zc + 0.006, { r: 0.004 });
    k.box('flap', 'plastic-black', 0.12, 0.08, 0.02, kx, 0.4, zc + 0.01, { r: 0.006 });
    return finish(k);
  },
});

const vendingDrink = w$({
  id: 'wpy-vending-drink', ko: '음료 자판기', en: 'Drink vending machine',
  params: [
    P.int('slots', '견본 칸 수', 'Sample slots', 8, 6, 10),
    P.mat('front', '전면 그래픽', 'Front panel', 'paint-blue-matte', 'paint'),
    P.mat('body', '외장', 'Cabinet', 'paint-white-gloss', 'paint'),
  ],
  tags: ['drink vending machine', 'beverage machine', 'soda machine', 'cans', '음료 자판기', '캔 자판기', '자판기', '휴게실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 1.0, H = 1.83, D = 0.72, zf = D / 2;
    k.box('body', p.body, W, H, D - 0.04, 0, H / 2, -0.02, { r: 0.012 });
    k.box('front', p.front, W - 0.08, H - 0.12, 0.03, 0, H / 2 + 0.02, zf - 0.015, { r: 0.008 });
    // sample window: row of cans and bottles behind glass, a push button under each
    const n = p.slots, sw = (W - 0.36) / n, x0 = -W / 2 + 0.06, wy = 1.42;
    k.box('interior', 'paint-white-matte', W - 0.32, 0.26, 0.02, x0 + (W - 0.36) / 2, wy, zf + 0.0, { r: 0 });
    for (let i = 0; i < n; i++) {
      const x = x0 + sw * (i + 0.5);
      if (i % 3 === 2) k.lathe('cans', 'glass-tinted', [[0, 0], [0.026, 0], [0.028, 0.1], [0.012, 0.15], [0.011, 0.18], [0, 0.18]], x, wy - 0.1, zf + 0.04, { segs: k.seg(12, 6) });
      else k.cyl('cans', i % 2 ? 'metal-aluminium' : 'book-red', 0.03, 0.03, 0.12, x, wy - 0.07, zf + 0.04, { segs: k.seg(14, 6) });
      k.box('keys', 'plastic-white', sw * 0.6, 0.025, 0.012, x, wy - 0.17, zf + 0.008, { r: 0.004 });
    }
    k.box('glass', 'glass-clear', W - 0.32, 0.27, 0.008, x0 + (W - 0.36) / 2, wy, zf + 0.08, { r: 0 });
    k.box('trim', 'metal-chrome', W - 0.3, 0.012, 0.09, x0 + (W - 0.36) / 2, wy + 0.14, zf + 0.04, { r: 0.002 });
    k.box('trim', 'metal-chrome', W - 0.3, 0.012, 0.09, x0 + (W - 0.36) / 2, wy - 0.14, zf + 0.04, { r: 0.002 });
    // right panel: price display, note + coin slots, return cup
    const kx = W / 2 - 0.15;
    k.box('display', 'light-warm', 0.12, 0.04, 0.006, kx, 1.15, zf + 0.003, { r: 0.002 });
    k.box('keys', 'plastic-black', 0.12, 0.04, 0.015, kx, 1.04, zf + 0.008, { r: 0.004 });
    k.box('keys', 'metal-chrome', 0.04, 0.06, 0.015, kx, 0.95, zf + 0.008, { r: 0.004 });
    k.box('keys', 'plastic-black', 0.08, 0.06, 0.02, kx, 0.8, zf + 0.01, { r: 0.006 });
    // can delivery port at the bottom
    k.box('keys', 'plastic-black', 0.5, 0.18, 0.04, -0.1, 0.32, zf + 0.0, { r: 0.01 });
    return finish(k);
  },
});

const coffeeBeanToCup = w$({
  id: 'wpy-coffee-bean-to-cup', ko: '전자동 커피머신(하부장 포함)', en: 'Bean-to-cup coffee machine on cabinet',
  params: [
    P.bool('milk', '우유 냉장고', 'Milk cooler', true),
    P.mat('machine', '머신', 'Machine', 'metal-steel', 'metal'),
    P.mat('cabinet', '하부장', 'Cabinet', 'wood-walnut', 'wood'),
  ],
  tags: ['coffee machine', 'bean to cup', 'espresso', 'office coffee', '커피머신', '전자동 커피', '원두 커피', '탕비실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.milk ? 0.95 : 0.7, D = 0.6, ch = 0.9;
    // base cabinet: two doors, cup drawer, top
    k.box('cabinet', p.cabinet, W, ch - 0.03, D - 0.02, 0, (ch - 0.03) / 2, -0.01, { r: 0.004 });
    k.box('top', 'quartz-white', W + 0.02, 0.03, D + 0.01, 0, ch - 0.015, 0, { r: 0.004 });
    for (const s of [-1, 1]) {
      k.box('cabinet', p.cabinet, W / 2 - 0.006, ch - 0.25, 0.006, s * W / 4, 0.12 + (ch - 0.25) / 2 - 0.05, D / 2 + 0.0, { r: 0.002 });
      addHandle(k, 'handles', 'metal-black', 'bar', s * 0.06, 0.55, D / 2 + 0.003, { len: 0.12, vertical: true });
    }
    // machine body with a recessed brew bay, spouts, drip grille and a touch screen
    const mx = p.milk ? -0.12 : 0, mw = 0.38, mh = 0.68, y = ch;
    k.box('machine', p.machine, mw, mh, 0.54, mx, y + mh / 2, -0.02, { r: 0.015, segs: 2 });
    k.box('bay', 'plastic-black', mw - 0.08, 0.26, 0.12, mx, y + 0.18, 0.2, { r: 0.006 });
    k.box('bay', 'metal-chrome', mw - 0.1, 0.012, 0.14, mx, y + 0.055, 0.21, { r: 0.002 });
    k.box('bay', 'plastic-black', 0.08, 0.04, 0.06, mx, y + 0.29, 0.21, { r: 0.008 });
    for (const s of [-1, 1]) k.cyl('bay', 'metal-chrome', 0.008, 0.008, 0.03, mx + s * 0.015, y + 0.24, 0.22, { segs: k.seg(8, 4) });
    k.box('display', 'light-cool', 0.2, 0.13, 0.008, mx, y + mh - 0.17, 0.255, { r: 0.004, rx: -0.15 });
    // bean hoppers on top
    for (const s of [-1, 1]) {
      k.box('hopper', 'glass-tinted', 0.15, 0.16, 0.2, mx + s * 0.09, y + mh + 0.08, -0.08, { r: 0.012 });
      k.box('beans', 'wood-dark', 0.13, 0.09, 0.18, mx + s * 0.09, y + mh + 0.05, -0.08, { r: 0.01 });
      k.box('machine', 'plastic-black', 0.16, 0.02, 0.21, mx + s * 0.09, y + mh + 0.17, -0.08, { r: 0.006 });
    }
    if (p.milk) {
      const ux = W / 2 - 0.13;
      k.box('machine', p.machine, 0.22, 0.42, 0.45, ux, y + 0.21, -0.04, { r: 0.012 });
      k.rod('bay', 'plastic-white', [ux - 0.11, y + 0.3, 0.1], [mx + mw / 2, y + 0.3, 0.1], 0.004, { segs: 6 });
    }
    // cup stack + lids beside
    for (let i = 0; i < 2; i++) k.lathe('cups', 'ceramic-white', [[0, 0], [0.028, 0], [0.04, 0.22], [0, 0.22]], (p.milk ? 0.39 : 0.27) - i * 0.0 - (p.milk ? 0.0 : 0), y, 0.2 - i * 0.1, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const microwaveStation = w$({
  id: 'wpy-microwave-station', ko: '탕비실 전자레인지 선반', en: 'Pantry microwave station',
  params: [
    P.len('width', '폭', 'Width', 1.2, 1.1, 1.6),
    P.int('microwaves', '전자레인지 수', 'Microwaves', 2, 1, 3),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.mat('shelf', '선반', 'Shelves', 'wood-oak', 'wood'),
  ],
  tags: ['microwave station', 'pantry shelf', 'microwave', 'break room', '전자레인지 선반', '탕비실 선반', '전자레인지', '휴게실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.48, H = 1.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.frame, 0.03, H, 0.03, sx * (W / 2 - 0.015), H / 2, sz * (D / 2 - 0.015), { r: 0.003 });
    const levels = [0.12, 0.62, 1.12, H - 0.015];
    for (const y of levels) k.box('shelf', p.shelf, W, 0.025, D, 0, y, 0, { r: 0.004 });
    for (const s of [-1, 1]) k.rod('frame', p.frame, [s * (W / 2 - 0.015), 0.15, -D / 2 + 0.015], [-s * (W / 2 - 0.015), 0.6, -D / 2 + 0.015], 0.006, { segs: 6 }); // back X brace
    // microwaves on the middle shelf, side by side
    const n = p.microwaves, mw = Math.min(0.5, (W - 0.08) / n - 0.02), mh = 0.29, md = 0.4, y0 = 0.62 + 0.0125;
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) / 2) * (mw + 0.03) + i * (mw + 0.03);
      k.box('oven', 'plastic-white', mw, mh, md, x, y0 + mh / 2, -0.02, { r: 0.008 });
      k.box('door', 'plastic-black', mw * 0.74, mh - 0.03, 0.012, x - mw * 0.12, y0 + mh / 2, -0.02 + md / 2 + 0.004, { r: 0.004 });
      k.box('glass', 'glass-tinted', mw * 0.5, mh - 0.09, 0.004, x - mw * 0.14, y0 + mh / 2, -0.02 + md / 2 + 0.011, { r: 0 });
      k.box('display', 'light-cool', mw * 0.12, 0.022, 0.004, x + mw * 0.37, y0 + mh - 0.05, -0.02 + md / 2 + 0.002, { r: 0 });
      dots(k, 'door', 'plastic-grey', 2, x + mw * 0.37, y0 + mh * 0.45, -0.02 + md / 2, 0.025, 0.018);
    }
    // bottom: three storage bins; top: paper towel roll on a holder
    const bw = (W - 0.1) / 3;
    for (let i = 0; i < 3; i++) k.box('bins', 'plastic-grey', bw - 0.03, 0.25, D - 0.08, -W / 2 + 0.05 + bw * (i + 0.5), 0.12 + 0.0125 + 0.125, 0, { r: 0.01 });
    // rz = +90° lays the roll along −x from its position
    k.cyl('towel', 'paper', 0.06, 0.06, 0.26, -W / 2 + 0.36, 1.2, 0.0, { rz: PI / 2, segs: k.seg(18, 6) });
    for (const x of [-W / 2 + 0.09, -W / 2 + 0.37]) k.box('frame', p.frame, 0.01, 0.07, 0.01, x, 1.17, 0.0, { r: 0 });
    return finish(k);
  },
});

const glassFridge = w$({
  id: 'wpy-glass-door-fridge', ko: '업소용 음료 냉장고(유리문)', en: 'Glass-door beverage fridge',
  params: [
    P.int('doors', '문 수', 'Doors', 1, 1, 3),
    P.mat('body', '외장', 'Cabinet', 'metal-black', 'metal'),
    P.mat('sign', '상단 광고판', 'Header panel', 'paint-blue-matte', 'paint'),
  ],
  tags: ['glass door fridge', 'beverage cooler', 'display fridge', 'drinks', '음료 냉장고', '쇼케이스', '업소용 냉장고', '탕비실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.doors, dw = 0.62, W = n * dw, H = 2.0, D = 0.7, zf = D / 2;
    // hollow cabinet (back, sides, plinth, header) so the stock shows through the glass doors
    const t = 0.04, bd = D - 0.03, bz = -0.015;
    k.box('body', p.body, W, H, t, 0, H / 2, -D / 2 + t / 2, { r: 0.004 });
    for (const s of [-1, 1]) k.box('body', p.body, t, H, bd, s * (W / 2 - t / 2), H / 2, bz, { r: 0.004 });
    k.box('body', p.body, W, 0.1, bd, 0, 0.05, bz, { r: 0.004 });
    k.box('body', p.body, W, 0.26, bd, 0, H - 0.13, bz, { r: 0.004 });
    k.box('interior', 'paint-white-matte', W - 2 * t, H - 0.36, 0.01, 0, 0.1 + (H - 0.36) / 2, -D / 2 + t + 0.005, { r: 0 });
    k.box('grille', 'plastic-black', W - 0.04, 0.09, 0.01, 0, 0.055, zf, { r: 0.003 });
    // lit header with the brand panel
    k.box('sign', p.sign, W - 0.04, 0.22, 0.012, 0, H - 0.13, zf + 0.002, { r: 0.004 });
    k.box('display', 'light-cool', W - 0.12, 0.04, 0.004, 0, H - 0.2, zf + 0.009, { r: 0.002 });
    for (let d = 0; d < n; d++) {
      const x = -W / 2 + dw * (d + 0.5), dh = H - 0.36;
      k.panel('doors', p.body, frameShape(dw - 0.01, dh, 0.04, 0.05), 0.04, x, 0.1 + dh / 2, zf + 0.02, { bevel: 0.003 });
      k.box('glass', 'glass-clear', dw - 0.09, dh - 0.09, 0.006, x, 0.1 + dh / 2, zf + 0.02, { r: 0 });
      k.box('handle', 'metal-chrome', 0.022, 0.6, 0.03, x + (d % 2 ? -1 : 1) * (dw / 2 - 0.05), 0.1 + dh / 2, zf + 0.055, { r: 0.006 });
      for (let s = 0; s < 5; s++) {
        const sy = 0.16 + s * 0.3;
        k.box('shelf', 'metal-chrome', dw - 0.08, 0.008, D - 0.16, x, sy, -0.03, { r: 0 });
        for (let i = 0; i < 5; i++) {
          const bx = x - (dw - 0.14) / 2 + i * ((dw - 0.14) / 4);
          if (s % 2) k.lathe('bottles', 'glass-tinted', [[0, 0], [0.03, 0], [0.032, 0.14], [0.012, 0.21], [0.012, 0.24], [0, 0.24]], bx, sy + 0.004, 0.1, { segs: k.seg(10, 5) });
          else k.cyl('cans', i % 2 ? 'book-red' : 'metal-aluminium', 0.031, 0.031, 0.12, bx, sy + 0.004, 0.1, { segs: k.seg(12, 5) });
        }
      }
    }
    return finish(k);
  },
});

const recyclingStation = w$({
  id: 'wpy-recycling-station', ko: '분리수거함(3구)', en: 'Recycling station (3 bins)',
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.8, 1.5),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.bool('sign', '안내판', 'Sign panel', true),
  ],
  tags: ['recycling station', 'recycling bins', 'waste sorting', 'bins', '분리수거함', '재활용', '쓰레기통', '휴지통'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = 0.95, D = 0.45, cw = W / 3, zf = D / 2;
    k.box('body', p.body, W, H, D, 0, H / 2, 0, { r: 0.008 });
    k.box('top', 'metal-steel', W + 0.01, 0.015, D + 0.01, 0, H + 0.0075, 0, { r: 0.003 });
    const colours = ['paint-green-matte', 'paint-blue-matte', 'paint-grey-matte'];
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + cw * (i + 0.5);
      k.box('doors', p.body, cw - 0.012, H - 0.12, 0.012, x, 0.06 + (H - 0.12) / 2, zf + 0.006, { r: 0.003 });
      k.box(`label${i}`, colours[i], cw - 0.06, 0.12, 0.004, x, H - 0.2, zf + 0.013, { r: 0.002 });
      k.box('pulls', 'metal-black', 0.1, 0.012, 0.02, x, H - 0.32, zf + 0.02, { r: 0.004 });
      // openings: round (bottles), slot (paper), square flap (general)
      if (i === 0) k.cyl('holes', 'plastic-black', 0.07, 0.07, 0.004, x, H + 0.015, 0.02, { segs: k.seg(24, 8) });
      else if (i === 1) k.box('holes', 'plastic-black', cw * 0.6, 0.004, 0.03, x, H + 0.017, 0.02, { r: 0 });
      else k.box('holes', 'plastic-black', cw * 0.55, 0.004, 0.18, x, H + 0.017, 0.02, { r: 0 });
    }
    k.box('plinth', 'plastic-black', W - 0.04, 0.06, D - 0.05, 0, 0.03, -0.01, { r: 0.002 });
    if (p.sign) {
      k.box('body', p.body, W, 0.4, 0.025, 0, H + 0.215, -D / 2 + 0.0125, { r: 0.004 });
      for (let i = 0; i < 3; i++) k.box(`label${i}`, colours[i], cw - 0.08, 0.24, 0.004, -W / 2 + cw * (i + 0.5), H + 0.23, -D / 2 + 0.027, { r: 0.002 });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------------ technology */

const openRack = w$({
  id: 'wpy-open-frame-rack', ko: '2포스트 오픈 랙(네트워크)', en: '2-post open network rack',
  params: [
    P.int('units', '랙 유닛(U)', 'Rack units (U)', 42, 24, 48),
    P.int('devices', '장비 수', 'Devices', 8, 2, 14),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['network rack', 'open frame rack', '2 post rack', 'patch panel', 'switch', '네트워크 랙', '오픈 랙', '패치 패널', '스위치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.units * U + 0.12, f = p.frame, px = 0.483 / 2 + 0.02;
    for (const s of [-1, 1]) {
      k.box('frame', f, 0.04, H - 0.02, 0.08, s * px, H / 2, 0, { r: 0.003 });
      k.box('frame', f, 0.08, 0.02, 0.6, s * px, 0.01, 0, { r: 0.003 }); // base angle
      k.box('frame', f, 0.12, 0.012, 0.01, s * (px - 0.06), H / 2, 0.042, { r: 0 }); // mounting rail lip
      // vertical cable managers with finger slots
      k.box('managers', 'plastic-black', 0.1, H - 0.2, 0.12, s * (px + 0.07), H / 2, 0.0, { r: 0.004 });
      for (let i = 0; i < 10; i++) k.box('managers', 'plastic-black', 0.11, 0.01, 0.13, s * (px + 0.07), 0.2 + i * (H - 0.4) / 9, 0.0, { r: 0.002 });
    }
    k.box('frame', f, 2 * px + 0.04, 0.04, 0.08, 0, H - 0.02, 0, { r: 0.003 });
    k.box('frame', f, 2 * px + 0.04, 0.03, 0.08, 0, 0.12, 0, { r: 0.003 });
    // devices top-down: patch panel, manager, switch, … then servers in the lower part
    const order = ['patch', 'manager', 'switch', 'patch', 'manager', 'switch', 'server', 'server', 'patch', 'switch', 'server', 'server', 'manager', 'server'];
    let y = H - 0.08 - U;
    for (let i = 0; i < p.devices && y > 0.16; i++) {
      const kind = order[i];
      const h = (kind === 'server' ? 2 : 1) * U;
      if (kind === 'server') y -= U;
      rackDevice(k, kind, y, 0.045, kind === 'server' ? 0.5 : 0.25);
      y -= h + (i % 3 === 2 ? U : 0);
    }
    return finish(k);
  },
});

const networkCabinetWall = w$({
  id: 'wpy-network-cabinet-wall', placement: 'wall', elevation: 1.4, ko: '벽걸이 네트워크 캐비닛', en: 'Wall-mount network cabinet',
  params: [
    P.int('units', '랙 유닛(U)', 'Rack units (U)', 12, 6, 18),
    P.mat('body', '외장', 'Cabinet', 'metal-black', 'metal'),
  ],
  tags: ['network cabinet', 'wall rack', 'data cabinet', 'comms cabinet', '네트워크 캐비닛', '벽걸이 랙', '통신 함체', '랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.6, D = 0.45, H = p.units * U + 0.1, zf = D / 2;
    k.box('body', p.body, W, H, 0.02, 0, H / 2, -D / 2 + 0.01, { r: 0.003 });
    for (const s of [-1, 1]) k.box('body', p.body, 0.02, H, D - 0.02, s * (W / 2 - 0.01), H / 2, 0.01, { r: 0.003 });
    for (const y of [0.01, H - 0.01]) k.box('body', p.body, W, 0.02, D - 0.02, 0, y, 0.01, { r: 0.003 });
    // top vent slots + cable entry
    for (let i = 0; i < 6; i++) k.box('vents', 'plastic-black', 0.2, 0.004, 0.012, 0.12, H + 0.0, -0.1 + i * 0.03, { r: 0 });
    k.box('vents', 'plastic-black', 0.1, 0.004, 0.06, -0.15, H + 0.0, -0.1, { r: 0 });
    // devices behind a framed glass door with a lock
    let y = H - 0.05 - U;
    for (const kind of ['patch', 'manager', 'switch', 'patch', 'switch', 'server']) {
      const h = (kind === 'server' ? 2 : 1) * U;
      if (kind === 'server') y -= U;
      if (y < 0.04) break;
      rackDevice(k, kind, y, zf - 0.04, 0.3);
      y -= h;
    }
    k.panel('door', p.body, frameShape(W, H, 0.04, 0.04), 0.02, 0, H / 2, zf - 0.01, { bevel: 0.002 });
    k.box('glass', 'glass-tinted', W - 0.07, H - 0.07, 0.004, 0, H / 2, zf - 0.012, { r: 0 });
    k.box('lock', 'metal-chrome', 0.025, 0.07, 0.012, W / 2 - 0.02, H / 2, zf + 0.006, { r: 0.004 });
    return finish(k);
  },
});

const upsCabinet = w$({
  id: 'wpy-ups-cabinet', ko: 'UPS(무정전 전원) 캐비닛', en: 'UPS cabinet',
  params: [
    P.bool('battery', '배터리 캐비닛 추가', 'Battery cabinet', true),
    P.len('height', '높이', 'Height', 1.9, 1.4, 2.0),
    P.mat('body', '외장', 'Cabinet', 'metal-black', 'metal'),
  ],
  tags: ['ups', 'uninterruptible power supply', 'battery cabinet', 'server room', 'UPS', '무정전 전원', '배터리', '서버실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, W = 0.6, D = 0.85, zf = D / 2;
    const unit = (x, ups) => {
      k.box('body', p.body, W, H - 0.06, D, x, 0.06 + (H - 0.06) / 2, 0, { r: 0.006 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'plastic-black', 0.02, 0.025, 0.06, x + sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.08), { segs: k.seg(10, 5) });
      // perforated front: horizontal slats
      const n = k.hi ? 22 : 12, y0 = 0.12, y1 = ups ? H - 0.5 : H - 0.12;
      for (let i = 0; i < n; i++) k.box('slats', 'plastic-black', W - 0.1, (y1 - y0) / n * 0.45, 0.006, x, y0 + (y1 - y0) * (i + 0.5) / n, zf + 0.003, { r: 0 });
      k.box('handle', 'metal-chrome', 0.02, 0.18, 0.025, x + W / 2 - 0.04, H / 2, zf + 0.012, { r: 0.004 });
      if (ups) {
        k.box('panel', 'plastic-black', W - 0.12, 0.26, 0.012, x, H - 0.28, zf + 0.006, { r: 0.006 });
        k.box('display', 'light-cool', 0.18, 0.1, 0.004, x - 0.08, H - 0.26, zf + 0.013, { r: 0.002 });
        dots(k, 'buttons', 'plastic-grey', 4, x + 0.13, H - 0.3, zf + 0.012, 0.035, 0.022);
        dots(k, 'display', 'light-warm', 3, x + 0.13, H - 0.22, zf + 0.012, 0.035, 0.008);
      }
    };
    if (p.battery) { unit(-W / 2 - 0.005, true); unit(W / 2 + 0.005, false); } else unit(0, true);
    return finish(k);
  },
});

const plotter = w$({
  id: 'wpy-plotter', ko: '대형 플로터(스탠드 포함)', en: 'Large-format plotter on stand',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.1, 1.9),
    P.bool('basket', '용지 바스켓', 'Output basket', true),
    P.mat('body', '외장', 'Body', 'plastic-black', 'plastic'),
  ],
  tags: ['plotter', 'large format printer', 'wide format', 'cad printer', '플로터', '대형 프린터', '도면 출력', '프린터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, by = 0.88;
    // stand: two legs on castor feet, cross tube
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.12);
      k.box('stand', 'metal-black', 0.05, by - 0.08, 0.05, x, 0.08 + (by - 0.08) / 2, -0.05, { r: 0.004 });
      k.box('stand', 'metal-black', 0.06, 0.04, 0.6, x, 0.07, 0.0, { r: 0.006 });
      castor(k, x, 0.26, 0.025);
      castor(k, x, -0.26, 0.025);
    }
    k.rod('stand', 'metal-black', [-W / 2 + 0.12, 0.35, -0.05], [W / 2 - 0.12, 0.35, -0.05], 0.018, { segs: k.seg(12, 6) });
    // body: rounded printer with a top cover, output slot and the media roll
    k.rbox('body', p.body, W, 0.26, 0.42, 0.04, 0, by + 0.13, -0.02, { segs: k.seg(3, 1) });
    k.rbox('cover', 'plastic-grey', W - 0.3, 0.06, 0.24, 0.03, -0.1, by + 0.26, 0.0, { segs: k.seg(3, 1) });
    k.box('cover', 'plastic-black', W - 0.12, 0.012, 0.02, 0, by + 0.07, 0.19, { r: 0.003 }); // output slot lip
    k.cyl('paper', 'paper', 0.045, 0.045, W - 0.25, -(W - 0.25) / 2, by - 0.03, -0.18, { rz: -PI / 2, segs: k.seg(18, 6) });
    k.box('paper', 'paper', W - 0.25, 0.002, 0.24, 0, by + 0.035, 0.32, { r: 0, rx: 0.5 });
    k.box('display', 'light-cool', 0.1, 0.06, 0.006, W / 2 - 0.14, by + 0.22, 0.17, { r: 0.002, rx: -0.6 });
    if (p.basket) {
      for (const s of [-1, 1]) k.bentTube('stand', 'metal-chrome', [[s * (W / 2 - 0.13), 0.55, 0.0], [s * (W / 2 - 0.13), 0.55, 0.42], [s * (W / 2 - 0.13), 0.75, 0.48]], 0.008, 0.06);
      k.box('basket', 'fabric-cotton-white', W - 0.28, 0.004, 0.45, 0, 0.5, 0.22, { r: 0, rx: 0.2 });
      k.box('basket', 'fabric-cotton-white', W - 0.28, 0.25, 0.004, 0, 0.62, 0.45, { r: 0, rx: -0.2 });
    }
    return finish(k);
  },
});

const productionPrinter = w$({
  id: 'wpy-production-printer', ko: '프로덕션 복합기(피니셔 포함)', en: 'Production printer with finisher',
  params: [
    P.bool('lct', '대용량 급지 장치', 'Large capacity tray', true),
    P.bool('finisher', '피니셔', 'Finisher', true),
    P.mat('body', '외장', 'Body', 'plastic-white', 'plastic'),
  ],
  tags: ['production printer', 'copier', 'finisher', 'print room', 'digital press', '프로덕션 프린터', '복합기', '복사기', '피니셔'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = 0.78, zf = D / 2;
    // main engine with 4 paper decks
    k.box('body', p.body, 0.8, 1.0, D, 0, 0.5, 0, { r: 0.01 });
    for (let i = 0; i < 4; i++) {
      k.box('decks', 'plastic-grey', 0.76, 0.12, 0.012, 0, 0.1 + i * 0.13, zf + 0.006, { r: 0.004 });
      k.box('pulls', 'plastic-black', 0.18, 0.02, 0.02, 0, 0.13 + i * 0.13, zf + 0.018, { r: 0.006 });
    }
    k.box('decks', 'plastic-grey', 0.76, 0.4, 0.012, 0, 0.8, zf + 0.006, { r: 0.004 }); // front door
    // scanner bed + document feeder on top, control panel on an arm
    k.box('body', p.body, 0.72, 0.1, 0.62, -0.02, 1.05, -0.04, { r: 0.01 });
    k.box('feeder', 'plastic-grey', 0.62, 0.12, 0.5, -0.03, 1.16, -0.06, { r: 0.012 });
    k.box('feeder', 'plastic-black', 0.4, 0.01, 0.32, -0.08, 1.225, -0.04, { r: 0.004, rz: 0.08 });
    k.rod('arm', 'plastic-grey', [0.36, 1.05, 0.25], [0.48, 1.18, 0.38], 0.018, { segs: k.seg(10, 5) });
    k.box('arm', 'plastic-black', 0.3, 0.2, 0.025, 0.48, 1.24, 0.4, { r: 0.008, rx: -0.6 });
    k.box('display', 'light-cool', 0.26, 0.15, 0.004, 0.48, 1.245, 0.413, { r: 0.002, rx: -0.6 });
    if (p.lct) {
      k.box('body', p.body, 0.42, 0.72, 0.66, -0.62, 0.36, -0.03, { r: 0.01 });
      k.box('decks', 'plastic-grey', 0.38, 0.66, 0.012, -0.62, 0.36, 0.3 + 0.006, { r: 0.004 });
    }
    if (p.finisher) {
      const fx = 0.76;
      k.box('body', p.body, 0.7, 1.05, 0.66, fx, 0.525, -0.03, { r: 0.01 });
      k.box('decks', 'plastic-grey', 0.64, 0.6, 0.012, fx, 0.4, 0.3 + 0.006, { r: 0.004 });
      // stacker trays sloping out of the side
      for (const [y, L] of [[0.75, 0.38], [1.0, 0.3]]) k.box('trays', 'plastic-grey', L, 0.012, 0.42, fx + 0.35 + L / 2 - 0.02, y, -0.03, { r: 0.004, rz: 0.18 });
      k.box('paper', 'paper', 0.28, 0.03, 0.3, fx + 0.5, 0.79, -0.03, { r: 0.002, rz: 0.18 });
    }
    return finish(k);
  },
});

const speedGate = w$({
  id: 'wpy-speed-gate', ko: '보안 스피드 게이트(출입 게이트)', en: 'Security speed gate',
  params: [
    P.int('lanes', '통로 수', 'Lanes', 1, 1, 3),
    P.len('lane', '통로 폭', 'Lane width', 0.65, 0.55, 0.95),
    P.mat('body', '몸체', 'Body', 'metal-steel', 'metal'),
  ],
  tags: ['speed gate', 'turnstile', 'access control', 'security gate', 'lobby', '스피드 게이트', '출입 게이트', '보안 게이트', '로비'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.lanes, lane = p.lane, cw = 0.2, L = 1.4, H = 1.0;
    const span = n * lane + (n + 1) * cw;
    for (let i = 0; i <= n; i++) {
      const x = -span / 2 + cw / 2 + i * (lane + cw);
      k.box('body', p.body, cw, H - 0.02, L, x, (H - 0.02) / 2, 0, { r: 0.012 });
      k.box('top', 'glass-tinted', cw + 0.01, 0.02, L + 0.01, x, H - 0.01, 0, { r: 0.004 });
      // card reader + direction LEDs at both ends of the top
      for (const s of [-1, 1]) {
        k.box('reader', 'plastic-black', cw - 0.06, 0.012, 0.14, x, H + 0.006, s * (L / 2 - 0.15), { r: 0.004 });
        k.box('display', 'light-cool', cw - 0.1, 0.004, 0.06, x, H + 0.013, s * (L / 2 - 0.15), { r: 0.001 });
      }
      // glass wings into the neighbouring lanes (closed)
      for (const s of [-1, 1]) {
        if ((i === 0 && s < 0) || (i === n && s > 0)) continue;
        k.box('wings', 'glass-clear', lane / 2 - 0.01, 0.75, 0.012, x + s * (cw / 2 + lane / 4 - 0.005), 0.25 + 0.375, 0, { r: 0.006 });
        k.box('wingEdge', 'metal-chrome', 0.012, 0.75, 0.02, x + s * (cw / 2 + lane / 2 - 0.016), 0.625, 0, { r: 0.004 });
      }
      k.box('trim', 'plastic-black', cw + 0.004, 0.06, L - 0.04, x, 0.03, 0, { r: 0.004 });
    }
    return finish(k);
  },
});

const videoWall = w$({
  id: 'wpy-video-wall', ko: '비디오 월(바닥 스탠드)', en: 'Video wall on floor stand',
  params: [
    P.int('cols', '가로 화면 수', 'Columns', 2, 1, 3),
    P.int('rows', '세로 화면 수', 'Rows', 2, 1, 3),
    P.len('screen', '화면 폭', 'Screen width', 1.21, 0.95, 1.45),
    P.mat('stand', '스탠드', 'Stand', 'metal-black', 'metal'),
  ],
  tags: ['video wall', 'display wall', 'digital signage', 'screens', 'lobby', '비디오 월', '멀티 비전', '디지털 사이니지', '모니터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const C = p.cols, R = p.rows, sw = p.screen, sh = sw * 0.5625, y0 = 0.7;
    const W = C * sw, Hs = R * sh;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const x = -W / 2 + sw * (c + 0.5), y = y0 + sh * (r + 0.5);
      k.box('bezel', 'plastic-black', sw - 0.002, sh - 0.002, 0.05, x, y, 0, { r: 0.002 });
      k.box('screen', 'screen-black', sw - 0.012, sh - 0.012, 0.004, x, y, 0.026, { r: 0 });
    }
    // stand: two posts on wide feet, mounting rails behind the screens
    const px = Math.min(W / 2 - 0.2, 0.45 * Math.max(1, C - 0.5));
    for (const s of [-1, 1]) {
      k.box('stand', p.stand, 0.08, y0 + Hs - 0.2, 0.05, s * px, (y0 + Hs - 0.2) / 2, -0.06, { r: 0.004 });
      k.box('stand', p.stand, 0.1, 0.05, 0.8, s * px, 0.025, 0.0, { r: 0.006 });
      for (const z of [-0.35, 0.35]) k.cyl('stand', 'rubber-black', 0.025, 0.025, 0.01, s * px, -0.0, z, { segs: k.seg(10, 5) });
    }
    for (let r = 0; r <= R; r++) k.box('stand', p.stand, Math.max(0.3, W - 0.3), 0.04, 0.03, 0, y0 + 0.1 + r * (Hs - 0.2) / R, -0.04, { r: 0.003 });
    k.box('stand', p.stand, 2 * px + 0.08, 0.04, 0.05, 0, 0.3, -0.06, { r: 0.003 });
    k.box('player', 'plastic-black', 0.3, 0.05, 0.22, 0, 0.35, -0.12, { r: 0.006 });
    return finish(k);
  },
});

export const ITEMS = [
  draftingChair, saddleStool, stackingChair, nestingChair, sledChair, modularLounge, highbackSofa, boothSeating, tieredSeating, wobbleStool,
  meetingPod, napPod, pantryIsland, vendingSnack, vendingDrink, coffeeBeanToCup, microwaveStation, glassFridge, recyclingStation,
  openRack, networkCabinetWall, upsCabinet, plotter, productionPrinter, speedGate, videoWall, lobbyBench,
];
