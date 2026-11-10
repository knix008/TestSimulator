// More lighting items (designs + preset variants of lighting.js entries). See ARCHITECTURE.md §12 → Library objects.
// Pendants, chandeliers, floor/table lamps, ceiling, wall and decorative lights. Every item marks its
// bulb(s) with an emissive 'light-warm' / 'light-cool' part and a Kit.light marker at the bulb.
// Ceiling items: origin bottom centre (min y = 0), `elevation` = bottom height under a 2.4 m ceiling.
// Wall items: the back (min z) touches the wall.
import { THREE, Kit, item, P, variant, clamp, lerp, transformAdded } from './helpers.js';
import { ITEMS as base, recentre, canopy, bulb, profileOf, metalShade } from './lighting.js';

const CEILING = 2.4;
const TAU = Math.PI * 2;

// Default-build bounding boxes (measured; the library test checks them).
const SIZES = {
  'track-light': [1.012, 0.207, 0.13],
  'surface-spotlight': [0.1, 0.191, 0.136],
  'square-downlight': [0.12, 0.097, 0.12],
  'led-panel-light': [0.6, 0.036, 0.6],
  'semi-flush-ceiling-light': [0.368, 0.238, 0.368],
  'ceiling-fan-light': [1.23, 0.515, 1.293],
  'linear-pendant': [1.2, 0.752, 0.07],
  'rattan-pendant': [0.459, 1.008, 0.459],
  'cage-pendant': [0.185, 1.102, 0.185],
  'edison-cluster-pendant': [0.304, 1.078, 0.304],
  'drum-pendant': [0.605, 0.9, 0.605],
  'paper-lantern-pendant': [0.5, 1.032, 0.5],
  'moroccan-lantern': [0.356, 1.033, 0.356],
  'sputnik-chandelier': [0.851, 0.891, 0.839],
  'crystal-chandelier': [0.636, 0.748, 0.636],
  'ring-chandelier': [0.796, 1.08, 0.796],
  'torchiere-floor-lamp': [0.366, 1.803, 0.366],
  'reading-floor-lamp': [0.262, 1.504, 0.607],
  'studio-spot-floor-lamp': [0.656, 1.562, 0.57],
  'paper-column-floor-lamp': [0.42, 1.504, 0.428],
  'sphere-floor-lamp': [0.45, 0.47, 0.45],
  'hanji-lamp': [0.34, 0.622, 0.34],
  'mushroom-table-lamp': [0.321, 0.36, 0.321],
  'globe-table-lamp': [0.25, 0.327, 0.25],
  'bankers-lamp': [0.27, 0.395, 0.16],
  'lava-lamp-table': [0.148, 0.418, 0.148],
  'tiffany-table-lamp': [0.41, 0.619, 0.41],
  'led-desk-lamp': [0.16, 0.447, 0.41],
  'swing-arm-wall-lamp': [0.224, 0.275, 0.612],
  'picture-light': [0.45, 0.182, 0.16],
  'mirror-light-bar': [0.6, 0.05, 0.111],
  'wall-lantern': [0.146, 0.354, 0.233],
  'candle-wall-sconce': [0.308, 0.26, 0.124],
  'string-lights-globe': [2.021, 0.247, 0.066],
  'neon-sign-light': [0.541, 0.495, 0.045],
  'under-cabinet-pucks': [0.9, 0.016, 0.179],
  'night-light-plug': [0.06, 0.08, 0.043],
};

/** item() with the lighting defaults: size from SIZES and the ceiling elevation from the height. */
function lamp(def) {
  const size = def.size ?? SIZES[def.id] ?? [0.3, 0.3, 0.3];
  const e = { category: 'lighting', ...def, size };
  if (e.placement === 'ceiling' && e.elevation == null) e.elevation = Math.max(0.3, +(CEILING - size[1]).toFixed(3));
  return item(e);
}

const add3 = (a, d, s) => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];

/** Bare filament (Edison) bulb under a socket whose top is at yTop. Returns the glass centre y. */
function edison(k, x, yTop, z, r = 0.03, socket = 'metal-brass') {
  k.cyl('socket', socket, 0.014, 0.016, 0.045, x, yTop - 0.045, z, { segs: k.seg(14, 6) });
  const H = r * 2.6, y0 = yTop - 0.045 - H + 0.004;
  k.lathe('bulb', 'light-warm', [[0, 0], [r * 0.45, r * 0.08], [r * 0.9, r * 0.5], [r, r * 0.95], [r * 0.85, r * 1.6], [r * 0.5, r * 2.2], [r * 0.45, H]], x, y0, z, { segs: k.seg(16, 6), smooth: 14 });
  return y0 + r;
}

/** Cylindrical spot head turning about pivot p (x axis); theta = tilt from straight down towards +z. Returns the light position. */
function spotHead(k, p, theta, mat, { r = 0.034, len = 0.12, glow = 'light-warm' } = {}) {
  const d = [0, -Math.cos(theta), Math.sin(theta)];
  k.rod('head', mat, add3(p, d, -0.045), add3(p, d, len - 0.045), r, { segs: k.seg(24, 8) });
  k.rod('head', mat, add3(p, d, -0.052), add3(p, d, -0.044), r * 0.82, { segs: k.seg(24, 8) });
  k.rod('lens', glow, add3(p, d, len - 0.047), add3(p, d, len - 0.0444), r * 0.76, { segs: k.seg(20, 8) });
  // black anti-glare ring just inside the mouth
  k.rod('lens-ring', 'plastic-black', add3(p, d, len - 0.048), add3(p, d, len - 0.0446), r * 0.92, { segs: k.seg(24, 8), open: true });
  return add3(p, d, len - 0.02);
}

/** Half cylinder (lathe) along x whose open side faces down (rx tilts it); plus end caps. Inner face optional. */
function halfHood(k, role, mat, R, L, x, y, z, { rx = 0, inner = 'paint-white-matte', overrides } = {}) {
  const segs = k.seg(24, 8);
  const pts = [[R * 0.96, -L / 2], [R, -L / 2 + 0.006], [R, L / 2 - 0.006], [R * 0.96, L / 2]].map(([r, yy]) => new THREE.Vector2(r, yy));
  const outer = new THREE.LatheGeometry(pts, segs, 0, Math.PI);
  k.add(role, mat, T(outer, x, y, z, rx, 0, Math.PI / 2), { overrides });
  if (inner) {
    const ip = [...pts].reverse().map((v) => new THREE.Vector2(Math.max(0, v.x - 0.0015), v.y));
    k.add(role + '-inner', inner, T(new THREE.LatheGeometry(ip, segs, 0, Math.PI), x, y, z, rx, 0, Math.PI / 2));
  }
  for (const s of [-1, 1]) {
    const cap = new THREE.CircleGeometry(R * 0.96, segs, 0, Math.PI).rotateY(s * Math.PI / 2).translate(s * L / 2, 0, 0);
    k.add(role, mat, T(cap, x, y, z, rx, 0, 0), { overrides });
    const capIn = new THREE.CircleGeometry(R * 0.95, segs, 0, Math.PI).rotateY(-s * Math.PI / 2).translate(s * (L / 2 - 0.001), 0, 0);
    k.add(role + '-inner', inner || mat, T(capIn, x, y, z, rx, 0, 0));
  }
}

function T(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
}

/** Lathe profile with rib bands (paper lanterns): fn(t) → radius, t in [t0, t1] over height H. */
function ribbed(fn, H, bands, depth = 0.018, t0 = 0, t1 = 1) {
  const out = [];
  for (let i = 0; i <= bands * 2; i++) {
    const t = t0 + (t1 - t0) * (i / (bands * 2));
    out.push([fn(t) * (i % 2 ? 1 : 1 - depth), t * H]);
  }
  return out;
}

/** Hanging cord from y0 up to the ceiling canopy at top. */
function cordTo(k, y0, top, { canopyMat = 'paint-white-matte', r = 0.06, cord = 'plastic-black' } = {}) {
  k.cyl('cord', cord, 0.003, 0.003, top - 0.02 - y0, 0, y0, 0, { segs: 6 });
  canopy(k, top, r, 0.025, canopyMat);
}

/* ======================================================= ceiling: track / spots */

const trackLight = lamp({
  id: 'track-light', placement: 'ceiling', ko: '레일 조명(트랙)', en: 'Track light',
  params: [
    P.len('length', '레일 길이', 'Rail length', 1.0, 0.5, 3.0),
    P.int('heads', '헤드 수', 'Spots', 3, 1, 6),
    P.num('aim', '조사 각도', 'Aim', 0.55, 0, 1, 0.05),
    P.mat('finish', '색', 'Finish', 'metal-black', 'metal'),
  ],
  tags: ['track light', 'rail spot', 'spotlight', '레일 조명', '트랙 조명', '스포트 조명', '레일등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, m = p.finish, top = 0.3;
    k.box('rail', m, L, 0.032, 0.036, 0, top - 0.016, 0, { r: 0.003 });
    for (const s of [-1, 1]) k.box('trim', 'plastic-black', 0.006, 0.033, 0.037, s * (L / 2 + 0.003), top - 0.0165, 0, { r: 0.0015 });
    k.box('trim', 'plastic-black', L - 0.01, 0.002, 0.012, 0, top - 0.0325, 0, { r: 0 });
    const n = p.heads, theta = lerp(0.2, 1.15, clamp(p.aim, 0, 1));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (L * (i + 0.5)) / n;
      k.box('fit', m, 0.026, 0.035, 0.04, x, top - 0.032 - 0.0175 + 0.001, 0, { r: 0.004 });
      const yt = top - 0.078;
      k.rod('fit', m, [x, top - 0.066, 0], [x, yt, 0], 0.006, { segs: k.seg(10, 5) });
      k.bentTube('fit', m, [[x - 0.042, yt - 0.05, 0], [x - 0.042, yt, 0], [x + 0.042, yt, 0], [x + 0.042, yt - 0.05, 0]], 0.0035, 0.012, { radial: k.seg(8, 4) });
      const pv = [x, yt - 0.05, 0];
      k.cyl('fit', m, 0.007, 0.007, 0.094, x - 0.047, pv[1], 0, { rz: -Math.PI / 2, segs: k.seg(12, 6) });
      const lp = spotHead(k, pv, theta + (n > 1 ? 0 : 0), m);
      k.light(lp[0], lp[1], lp[2], { intensity: 0.7, distance: 5, type: 'spot', angle: 0.6 });
    }
    recentre(k);
    return k.group();
  },
});

const surfaceSpot = lamp({
  id: 'surface-spotlight', placement: 'ceiling', ko: '직부 스포트 조명', en: 'Surface spotlight',
  params: [
    P.int('heads', '헤드 수', 'Heads', 1, 1, 3),
    P.num('aim', '조사 각도', 'Aim', 0.5, 0, 1, 0.05),
    P.mat('finish', '색', 'Finish', 'metal-white', 'metal'),
  ],
  tags: ['spotlight', 'surface spot', 'ceiling spot', '스포트 조명', '직부 스포트', '천장 스포트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.heads, m = p.finish, top = 0.25, pitch = 0.1;
    if (n === 1) {
      k.lathe('base', m, [[0, 0], [0.04, 0], [0.045, 0.004], [0.045, 0.02], [0, 0.02]], 0, top - 0.02, 0, { segs: k.seg(32, 10) });
    } else {
      k.rbox('base', m, n * pitch, 0.02, 0.085, 0.006, 0, top - 0.01, 0, { segs: k.seg(3, 1) });
    }
    const theta = lerp(0.15, 1.1, clamp(p.aim, 0, 1));
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * pitch;
      const yt = top - 0.045;
      k.rod('fit', m, [x, top - 0.02, 0], [x, yt, 0], 0.007, { segs: k.seg(10, 5) });
      k.bentTube('fit', m, [[x - 0.045, yt - 0.055, 0], [x - 0.045, yt, 0], [x + 0.045, yt, 0], [x + 0.045, yt - 0.055, 0]], 0.004, 0.012, { radial: k.seg(8, 4) });
      const pv = [x, yt - 0.055, 0];
      k.cyl('fit', m, 0.008, 0.008, 0.1, x - 0.05, pv[1], 0, { rz: -Math.PI / 2, segs: k.seg(12, 6) });
      const lp = spotHead(k, pv, theta * (n > 1 && i % 2 ? 0.6 : 1), m, { r: 0.037, len: 0.13 });
      k.light(lp[0], lp[1], lp[2], { intensity: 0.7, distance: 5, type: 'spot', angle: 0.6 });
    }
    recentre(k);
    return k.group();
  },
});

const squareDownlight = lamp({
  id: 'square-downlight', placement: 'ceiling', elevation: CEILING - 0.006, ko: '사각 매입 다운라이트', en: 'Square recessed downlight',
  params: [
    P.len('width', '크기', 'Size', 0.12, 0.07, 0.25),
    P.pick('layout', '구성', 'Layout', 'single', [['single', '1구', 'Single'], ['double', '2구', 'Twin']]),
    P.mat('trim', '테두리', 'Trim', 'metal-white', 'metal'),
  ],
  tags: ['downlight', 'square downlight', 'recessed light', '다운라이트', '사각 매입등', '매입 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, n = p.layout === 'double' ? 2 : 1, W = w * n - (n - 1) * 0.008;
    // trim frame 6 mm proud of the ceiling, square reflector cells, housing above
    const b = w * 0.1;
    for (const s of [-1, 1]) {
      k.box('trim', p.trim, W, 0.006, b, 0, 0.003, s * (w / 2 - b / 2), { r: 0.0015 });
      k.box('trim', p.trim, b, 0.006, w - 2 * b, s * (W / 2 - b / 2), 0.003, 0, { r: 0.0015 });
    }
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (w - 0.008);
      if (n > 1 && i > 0) k.box('trim', p.trim, b * 0.8, 0.006, w - 2 * b, x - (w - 0.008) / 2, 0.003, 0, { r: 0.0015 });
      const c = (w / 2 - b) * Math.SQRT2;
      k.lathe('reflector', 'metal-aluminium', [[c, 0.006], [c * 0.7, 0.04]], x, 0, 0, { segs: 4, ry: Math.PI / 4 });
      k.box('bulb', 'light-warm', (w / 2 - b) * 1.4, 0.003, (w / 2 - b) * 1.4, x, 0.0395, 0, { r: 0 });
      k.light(x, 0.03, 0, { intensity: 0.8, distance: 5, type: 'spot', angle: 0.7 });
    }
    k.box('housing', 'metal-steel', W - 0.01, 0.055, w - 0.01, 0, 0.0425 + 0.0275, 0, { r: 0.002 });
    recentre(k);
    return k.group();
  },
});

const ledPanel = lamp({
  id: 'led-panel-light', placement: 'ceiling', ko: 'LED 평판 조명', en: 'LED panel light',
  params: [
    P.len('width', '가로', 'Width', 0.6, 0.3, 1.2),
    P.len('depth', '세로', 'Depth', 0.6, 0.3, 0.6),
    P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'),
    P.mat('glow', '빛 색', 'Light colour', 'light-cool', 'other'),
  ],
  tags: ['led panel', 'flat panel light', 'office light', 'LED 평판등', '엣지등', '사무실 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth;
    k.rbox('frame', p.frame, W, 0.012, D, 0.003, 0, 0.007, 0, { segs: k.seg(2, 1) });
    k.box('bulb', p.glow, W - 0.024, 0.002, D - 0.024, 0, 0.0005, 0, { r: 0 });
    k.box('housing', p.frame, W - 0.06, 0.022, D - 0.06, 0, 0.013 + 0.011, 0, { r: 0.003 });
    const nx = Math.max(1, Math.round(W / 0.6)), nz = Math.max(1, Math.round(D / 0.6));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) k.light(-W / 2 + (W / nx) * (i + 0.5), -0.01, -D / 2 + (D / nz) * (j + 0.5), { intensity: 1.2, distance: 6, color: '#f4f8ff' });
    recentre(k);
    return k.group();
  },
});

const semiFlush = lamp({
  id: 'semi-flush-ceiling-light', placement: 'ceiling', ko: '세미 플러시 천장등', en: 'Semi-flush ceiling light',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.36, 0.25, 0.6),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
    P.mat('glass', '유리', 'Glass', 'glass-frosted', 'glass'),
  ],
  tags: ['semi flush', 'ceiling light', 'bowl light', '세미 플러시', '천장등', '유리 볼 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, bowlH = R * 0.5, top = bowlH + 0.13;
    k.lathe('glass', p.glass, profileOf([[0.012, 0], [R * 0.45, bowlH * 0.08], [R * 0.8, bowlH * 0.35], [R * 0.97, bowlH * 0.8], [R, bowlH]], k.seg(16, 6)), 0, 0, 0, { segs: k.seg(48, 14) });
    k.add('metal', p.metal, new THREE.TorusGeometry(R, 0.004, k.seg(8, 4), k.seg(64, 16)).rotateX(Math.PI / 2).translate(0, bowlH, 0));
    // finial under the bowl and the hub above it
    k.lathe('metal', p.metal, [[0, -0.018], [0.01, -0.014], [0.014, -0.004], [0.012, 0.002], [0, 0.003]], 0, 0, 0, { segs: k.seg(16, 6) });
    const hubY = bowlH + 0.04;
    k.cyl('metal', p.metal, 0.01, 0.01, top - 0.025 - hubY, 0, hubY, 0, { segs: k.seg(12, 6) });
    k.sphere('metal', p.metal, 0.018, 0, hubY, 0, { segs: k.seg(16, 6), rings: k.seg(10, 4) });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU, c = Math.cos(a), s = Math.sin(a);
      k.tube('metal', p.metal, [[c * 0.015, hubY, s * 0.015], [c * R * 0.5, hubY + 0.01, s * R * 0.5], [c * R * 0.92, bowlH + 0.02, s * R * 0.92], [c * R, bowlH + 0.003, s * R]], 0.0035, { segs: k.seg(16, 6), radial: k.seg(8, 4) });
    }
    canopy(k, top, 0.07, 0.03, p.metal);
    for (const s of [-1, 1]) bulb(k, s * R * 0.25, bowlH * 0.55, 0, 0.026, { socket: 'metal-steel', up: true });
    k.light(0, bowlH * 0.5, 0, { intensity: 1.2, distance: 6 });
    recentre(k);
    return k.group();
  },
});

const ceilingFan = lamp({
  id: 'ceiling-fan-light', placement: 'ceiling', ko: '실링팬 조명', en: 'Ceiling fan with light',
  params: [
    P.len('diameter', '날개 지름', 'Blade span', 1.32, 0.9, 1.6),
    P.int('blades', '날개 수', 'Blades', 5, 3, 6),
    P.len('drop', '다운로드 길이', 'Downrod', 0.22, 0.1, 0.6),
    P.mat('blade', '날개', 'Blades', 'wood-walnut', 'wood'),
    P.mat('finish', '본체', 'Body', 'metal-steel', 'metal'),
  ],
  tags: ['ceiling fan', 'fan light', '실링팬', '천장 선풍기', '팬 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, m = p.finish;
    // light kit (frosted bowl) at the bottom, motor above, downrod and canopy
    const kitH = 0.09;
    k.lathe('glass', 'glass-frosted', profileOf([[0, 0], [0.06, 0.006], [0.1, 0.03], [0.115, 0.06], [0.11, kitH - 0.01]], k.seg(14, 6)), 0, 0, 0, { segs: k.seg(40, 12) });
    k.lathe('body', m, [[0.1, kitH - 0.012], [0.12, kitH - 0.01], [0.12, kitH + 0.02], [0.07, kitH + 0.03], [0, kitH + 0.03]], 0, 0, 0, { segs: k.seg(40, 12) });
    bulb(k, 0, 0.045, 0, 0.03, { socket: 'metal-steel' });
    const yM = kitH + 0.03;
    k.lathe('body', m, profileOf([[0.07, 0], [0.12, 0.012], [0.135, 0.045], [0.13, 0.08], [0.08, 0.11], [0.025, 0.12]], k.seg(16, 6)), 0, yM, 0, { segs: k.seg(48, 14) });
    k.lathe('trim', 'metal-black', [[0.131, 0.038], [0.137, 0.04], [0.137, 0.05], [0.131, 0.052]], 0, yM, 0, { segs: k.seg(48, 14) });
    const yRod = yM + 0.115;
    k.cyl('body', m, 0.012, 0.012, p.drop, 0, yRod, 0, { segs: k.seg(14, 6) });
    const top = yRod + p.drop + 0.06;
    k.lathe('body', m, profileOf([[0.015, 0], [0.05, 0.01], [0.075, 0.04], [0.08, 0.06]], k.seg(10, 4)).concat([[0, 0.06]]), 0, top - 0.06, 0, { segs: k.seg(36, 10) });
    const bl = R - 0.17, yB = yM + 0.035;
    for (let i = 0; i < p.blades; i++) {
      const a = (i / p.blades) * TAU;
      transformAdded(k, () => {
        k.rbox('blade', p.blade, bl, 0.008, 0.13, 0.003, 0.17 + bl / 2, yB, 0, { rx: 0.2, segs: k.seg(3, 1) });
        k.box('body', m, 0.13, 0.008, 0.035, 0.12, yB + 0.009, 0, { r: 0.002 });
      }, 0, 0, 0, a);
    }
    k.light(0, 0.03, 0, { intensity: 1.4, distance: 7 });
    recentre(k);
    return k.group();
  },
});

/* ============================================================== pendants */

const linearPendant = lamp({
  id: 'linear-pendant', placement: 'ceiling', ko: '라인 펜던트(식탁등)', en: 'Linear pendant',
  params: [
    P.len('length', '길이', 'Length', 1.2, 0.6, 2.0),
    P.len('drop', '와이어 길이', 'Cable length', 0.7, 0.3, 1.5),
    P.mat('finish', '색', 'Finish', 'metal-black', 'metal'),
  ],
  tags: ['linear pendant', 'dining light', 'bar pendant', '라인 펜던트', '식탁등', '일자 조명', 'LED 펜던트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, m = p.finish;
    k.rbox('body', m, L, 0.05, 0.065, 0.008, 0, 0.004 + 0.025, 0, { segs: k.seg(3, 1) });
    k.box('bulb', 'light-warm', L - 0.03, 0.004, 0.045, 0, 0.0045, 0, { r: 0.0015 });
    const top = 0.054 + p.drop;
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - 0.12);
      k.cyl('fit', 'metal-steel', 0.005, 0.005, 0.02, x, 0.054, 0, { segs: k.seg(10, 5) });
      k.cyl('cable', 'metal-steel', 0.0012, 0.0012, top - 0.074 - 0.02, x, 0.074, 0, { segs: 5 });
      transformAdded(k, () => canopy(k, top, 0.035, 0.02, m), x, 0, 0);
    }
    const n = Math.max(1, Math.round(L / 0.6));
    for (let i = 0; i < n; i++) k.light(-L / 2 + (L / n) * (i + 0.5), -0.02, 0, { intensity: 0.8, distance: 5, type: 'spot', angle: 1.1 });
    recentre(k);
    return k.group();
  },
});

const RATTAN = {
  globe: { h: 0.85, r: (t) => Math.sin(Math.PI * (0.1 + 0.8 * t)) },
  bell: { h: 0.72, r: (t) => 0.16 + 0.84 * (1 - t) ** 1.6 },
  wide: { h: 0.4, r: (t) => Math.sqrt(Math.max(0.03, 1 - 0.97 * t * t)) },
};

const rattanPendant = lamp({
  id: 'rattan-pendant', placement: 'ceiling', ko: '라탄 펜던트', en: 'Rattan pendant',
  params: [
    P.pick('style', '모양', 'Style', 'globe', [['globe', '구형', 'Globe'], ['bell', '벨', 'Bell'], ['wide', '넓은 돔', 'Wide dome']]),
    P.len('diameter', '지름', 'Diameter', 0.45, 0.25, 0.8),
    P.len('drop', '줄 길이', 'Cord length', 0.6, 0.2, 1.6),
    P.mat('weave', '재질', 'Weave', 'rattan', 'wood'),
  ],
  tags: ['rattan pendant', 'woven pendant', 'wicker lamp', '라탄 조명', '라탄 펜던트', '등나무 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = RATTAN[p.style] ?? RATTAN.globe, R = p.diameter / 2, H = p.diameter * S.h;
    const rad = (t) => R * S.r(t);
    const nr = k.hi ? 28 : 14;
    for (let j = 0; j < nr; j++) {
      const a = (j / nr) * TAU, c = Math.cos(a), s = Math.sin(a);
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([c * rad(t), t * H, s * rad(t)]); }
      k.tube('weave', p.weave, pts, 0.0026, { segs: k.seg(24, 8), radial: 4 });
    }
    const nRings = Math.max(6, Math.round(H / 0.022));
    for (let i = 0; i < nRings; i++) {
      const t = i / (nRings - 1);
      const tr = i === 0 || i === nRings - 1 ? 0.0055 : 0.0034;
      k.add('weave', p.weave, new THREE.TorusGeometry(rad(t) + 0.001, tr, 4, k.seg(56, 16)).rotateX(Math.PI / 2).translate(0, t * H, 0));
    }
    const capR = Math.max(0.025, Math.min(0.04, rad(1) - 0.004));
    k.cyl('fit', 'paint-black-matte', capR, capR, 0.03, 0, H - 0.01, 0, { segs: k.seg(16, 6) });
    const by = H * 0.5;
    bulb(k, 0, by, 0, 0.035);
    k.cyl('cord', 'plastic-black', 0.003, 0.003, H - (by + 0.06), 0, by + 0.06, 0, { segs: 6 });
    cordTo(k, H + 0.02, H + 0.02 + p.drop, { canopyMat: 'paint-black-matte' });
    k.light(0, by, 0, { intensity: 1.2, distance: 6 });
    recentre(k);
    return k.group();
  },
});

const CAGE = {
  round: (t) => Math.sin(Math.PI * t * 0.93) ** 0.8,
  diamond: (t) => Math.max(0.02, 1 - Math.abs(2 * t - 1)),
  cylinder: (t) => (t < 0.08 ? t / 0.08 : 1),
};

const cagePendant = lamp({
  id: 'cage-pendant', placement: 'ceiling', ko: '인더스트리얼 케이지 펜던트', en: 'Industrial cage pendant',
  params: [
    P.pick('shape', '케이지 모양', 'Cage', 'round', [['round', '둥근', 'Round'], ['diamond', '다이아몬드', 'Diamond'], ['cylinder', '원통', 'Cylinder']]),
    P.len('diameter', '지름', 'Diameter', 0.18, 0.12, 0.3),
    P.len('drop', '줄 길이', 'Cord length', 0.8, 0.2, 1.8),
    P.mat('finish', '색', 'Finish', 'metal-black', 'metal'),
  ],
  tags: ['cage pendant', 'industrial', 'edison bulb', '케이지 조명', '인더스트리얼 조명', '에디슨 전구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = p.diameter * 1.4, m = p.finish, fn = CAGE[p.shape] ?? CAGE.round;
    const nr = 8;
    for (let j = 0; j < nr; j++) {
      const a = (j / nr) * TAU, c = Math.cos(a), s = Math.sin(a);
      const pts = [[c * 0.004, 0.002, s * 0.004]];
      for (let i = 1; i <= 10; i++) { const t = (i / 10) * 0.92; const r = R * fn(t); pts.push([c * r, t * H, s * r]); }
      pts.push([c * 0.03, H, s * 0.03]);
      k.tube('cage', m, pts, 0.0022, { segs: k.seg(36, 10), radial: k.seg(6, 4) });
    }
    for (const t of [0.3, 0.55, 0.8]) k.add('cage', m, new THREE.TorusGeometry(R * fn(t), 0.0024, k.seg(6, 4), k.seg(48, 12)).rotateX(Math.PI / 2).translate(0, t * H, 0));
    k.sphere('cage', m, 0.008, 0, 0.004, 0, { segs: k.seg(10, 5), rings: k.seg(6, 4) });
    k.lathe('cage', m, [[0, 0], [0.034, 0], [0.034, 0.012], [0.022, 0.035], [0.011, 0.05], [0, 0.05]], 0, H - 0.004, 0, { segs: k.seg(24, 8) });
    const cy = edison(k, 0, H + 0.002, 0, Math.min(0.03, R * 0.42));
    cordTo(k, H + 0.046, H + 0.046 + p.drop, { canopyMat: m });
    k.light(0, cy, 0, { intensity: 1, distance: 5 });
    recentre(k);
    return k.group();
  },
});

const edisonCluster = lamp({
  id: 'edison-cluster-pendant', placement: 'ceiling', ko: '에디슨 전구 다발 펜던트', en: 'Edison bulb cluster pendant',
  params: [
    P.int('bulbs', '전구 수', 'Bulbs', 6, 3, 12),
    P.len('drop', '최대 길이', 'Max drop', 1.0, 0.4, 1.8),
    P.pick('plate', '천장판', 'Canopy', 'round', [['round', '원형', 'Round'], ['bar', '일자', 'Linear bar']]),
    P.mat('finish', '색', 'Finish', 'metal-black', 'metal'),
  ],
  tags: ['edison bulbs', 'bare bulb pendant', 'cluster', '에디슨 전구', '전구 펜던트', '다발 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.bulbs, top = p.drop + 0.05, m = p.finish, bar = p.plate === 'bar';
    if (bar) {
      const w = Math.max(0.5, n * 0.11);
      k.rbox('plate', m, w, 0.03, 0.08, 0.006, 0, top - 0.015, 0, { segs: k.seg(3, 1) });
    } else {
      k.cyl('plate', m, 0.15, 0.15, 0.02, 0, top - 0.02, 0, { segs: k.seg(40, 12) });
      k.cyl('plate', m, 0.14, 0.152, 0.012, 0, top - 0.032, 0, { segs: k.seg(40, 12) });
    }
    const pb = bar ? top - 0.03 : top - 0.032;
    for (let i = 0; i < n; i++) {
      let x, z;
      if (bar) { const w = Math.max(0.5, n * 0.11) - 0.08; x = n > 1 ? -w / 2 + (w * i) / (n - 1) : 0; z = (i % 2 ? 1 : -1) * 0.012; }
      else { const a = i * 2.39996, r = 0.025 + 0.1 * Math.sqrt((i + 0.5) / n); x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const len = p.drop * (0.45 + 0.55 * ((i * 0.618034 + 0.25) % 1));
      const sTop = pb - len;
      k.cyl('cord', 'plastic-black', 0.0025, 0.0025, pb - sTop, x, sTop, z, { segs: 5 });
      const cy = edison(k, x, sTop, z, 0.03, 'metal-brass');
      if (i % 3 === 0) k.light(x, cy, z, { intensity: 0.6, distance: 5 });
    }
    recentre(k);
    return k.group();
  },
});

const drumPendant = lamp({
  id: 'drum-pendant', placement: 'ceiling', ko: '드럼 패브릭 펜던트', en: 'Fabric drum pendant',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.6, 0.35, 1.0),
    P.len('height', '갓 높이', 'Shade height', 0.3, 0.15, 0.45),
    P.len('drop', '줄 길이', 'Cord length', 0.6, 0.2, 1.5),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['drum pendant', 'fabric pendant', 'lampshade', '드럼 펜던트', '패브릭 조명', '갓 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = p.height;
    k.cyl('shade', p.shade, R, R, H, 0, 0, 0, { open: true, segs: k.seg(64, 16) });
    for (const y of [0.002, H - 0.002]) k.add('metal', p.metal, new THREE.TorusGeometry(R, 0.0025, 4, k.seg(64, 16)).rotateX(Math.PI / 2).translate(0, y, 0));
    k.cyl('diffuser', 'glass-frosted', R - 0.004, R - 0.004, 0.003, 0, 0.008, 0, { segs: k.seg(48, 14) });
    // spider: three spokes to the centre ring that carries the bulbs
    const yS = H - 0.04;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; k.rod('metal', p.metal, [Math.cos(a) * 0.03, yS, Math.sin(a) * 0.03], [Math.cos(a) * (R - 0.003), H - 0.004, Math.sin(a) * (R - 0.003)], 0.002, { segs: 5 }); }
    k.cyl('metal', p.metal, 0.03, 0.03, 0.02, 0, yS - 0.01, 0, { segs: k.seg(16, 6) });
    const nb = R > 0.25 ? 3 : 1;
    for (let i = 0; i < nb; i++) { const a = (i / nb) * TAU; const r = nb > 1 ? 0.06 : 0; bulb(k, Math.cos(a) * r, yS - 0.08, Math.sin(a) * r, 0.03, { socket: 'metal-brass' }); }
    cordTo(k, yS + 0.01, H + p.drop, { canopyMat: p.metal, r: 0.07 });
    k.light(0, H * 0.4, 0, { intensity: 1.4, distance: 6 });
    recentre(k);
    return k.group();
  },
});

const PAPER = {
  ball: { h: 0.92, fn: (t) => Math.sin(Math.PI * t), t0: 0.06, t1: 0.95 },
  oval: { h: 1.35, fn: (t) => Math.sin(Math.PI * t) ** 0.85, t0: 0.05, t1: 0.96 },
  cloud: { h: 1.0, fn: (t) => Math.sin(Math.PI * t) * (1 + 0.1 * Math.sin(Math.PI * 4 * t)), t0: 0.06, t1: 0.95 },
};

const paperPendant = lamp({
  id: 'paper-lantern-pendant', placement: 'ceiling', ko: '종이 등 펜던트', en: 'Paper lantern pendant',
  params: [
    P.pick('shape', '모양', 'Shape', 'ball', [['ball', '구형', 'Ball'], ['oval', '타원', 'Oval'], ['cloud', '구름', 'Cloud']]),
    P.len('diameter', '지름', 'Diameter', 0.5, 0.3, 0.9),
    P.len('drop', '줄 길이', 'Cord length', 0.6, 0.2, 1.5),
    P.mat('paper', '종이', 'Paper', 'paper', 'other'),
  ],
  tags: ['paper lantern', 'rice paper', 'akari', '종이 조명', '한지 등', '종이 등', '등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = PAPER[p.shape] ?? PAPER.ball, R = p.diameter / 2, H = p.diameter * S.h;
    const bands = Math.round(H / 0.03);
    const prof = ribbed((t) => R * S.fn(t), H, bands, 0.02, S.t0, S.t1);
    k.lathe('paper', p.paper, prof, 0, 0, 0, { segs: k.seg(48, 14) });
    const yT = prof[prof.length - 1][1], rT = prof[prof.length - 1][0], rB = prof[0][0], yB = prof[0][1];
    k.add('wire', 'metal-white', new THREE.TorusGeometry(rT, 0.0025, 4, k.seg(32, 10)).rotateX(Math.PI / 2).translate(0, yT, 0));
    k.add('wire', 'metal-white', new THREE.TorusGeometry(rB, 0.0025, 4, k.seg(32, 10)).rotateX(Math.PI / 2).translate(0, yB, 0));
    const by = H * 0.5;
    bulb(k, 0, by, 0, 0.035, { socket: 'plastic-white' });
    k.cyl('cord', 'plastic-white', 0.003, 0.003, yT + 0.02 - (by + 0.06), 0, by + 0.06, 0, { segs: 6 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; k.rod('wire', 'metal-white', [0, yT + 0.02, 0], [Math.cos(a) * rT, yT, Math.sin(a) * rT], 0.0015, { segs: 4 }); }
    cordTo(k, yT + 0.02, yT + 0.02 + p.drop, { cord: 'plastic-white' });
    k.light(0, by, 0, { intensity: 1.2, distance: 6 });
    recentre(k);
    return k.group();
  },
});

const moroccan = lamp({
  id: 'moroccan-lantern', placement: 'ceiling', ko: '모로코 랜턴 펜던트', en: 'Moroccan lantern pendant',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.32, 0.2, 0.5),
    P.len('drop', '체인 길이', 'Chain length', 0.5, 0.15, 1.2),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
    P.color('tint', '유리 색', 'Glass colour', '#d9893a'),
  ],
  tags: ['moroccan lantern', 'brass lantern', 'bohemian', '모로코 랜턴', '모로칸 조명', '랜턴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = p.diameter * 1.35, m = p.metal;
    const prof = profileOf([[0.03, 0], [R * 0.55, 0.12 * H], [R, 0.42 * H], [R * 0.85, 0.62 * H], [R * 0.42, 0.82 * H], [0.05, H]], 16);
    // faceted coloured glass between pierced metal caps (8 facets)
    const glass = prof.filter(([, y]) => y >= 0.1 * H && y <= 0.84 * H).map(([r, y]) => [r * 0.985, y]);
    k.lathe('glass', 'glass-frosted', glass, 0, 0, 0, { segs: 8, overrides: { color: p.tint } });
    k.lathe('metal', m, prof.filter(([, y]) => y <= 0.14 * H), 0, 0, 0, { segs: 8 });
    k.lathe('metal', m, prof.filter(([, y]) => y >= 0.8 * H), 0, 0, 0, { segs: 8 });
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU, c = Math.sin(a), s = Math.cos(a);
      k.tube('metal', m, prof.map(([r, y]) => [c * (r + 0.002), y, s * (r + 0.002)]), 0.003, { segs: k.seg(24, 8), radial: 4 });
    }
    const ringAt = (y) => { let best = prof[0]; for (const q of prof) if (Math.abs(q[1] - y) < Math.abs(best[1] - y)) best = q; return best; };
    for (const f of [0.14, 0.42, 0.62, 0.8]) {
      const [r, y] = ringAt(f * H);
      k.add('metal', m, new THREE.TorusGeometry(r / Math.cos(Math.PI / 8) + 0.002, 0.004, 4, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8 * 0).translate(0, y, 0));
    }
    // bottom drop finial and top crown
    k.lathe('metal', m, [[0, -0.05], [0.008, -0.04], [0.016, -0.02], [0.012, -0.005], [0.03, 0], [0, 0.002]], 0, 0.004, 0, { segs: k.seg(12, 6) });
    k.lathe('metal', m, [[0.05, 0], [0.035, 0.03], [0.012, 0.05], [0.006, 0.06], [0, 0.062]], 0, H - 0.002, 0, { segs: k.seg(16, 6) });
    const by = H * 0.45;
    bulb(k, 0, by, 0, 0.028);
    k.cyl('cord', 'plastic-black', 0.003, 0.003, H - by - 0.05, 0, by + 0.05, 0, { segs: 6 });
    // chain of alternating links
    const y0 = H + 0.055, top = y0 + p.drop;
    const nl = Math.max(2, Math.floor((top - 0.035 - y0) / 0.02));
    for (let i = 0; i < nl; i++) k.add('metal', m, new THREE.TorusGeometry(0.01, 0.0022, k.seg(6, 4), k.seg(12, 6)).scale(1, 1.25, 1).rotateY(i % 2 ? Math.PI / 2 : 0).translate(0, y0 + 0.011 + i * 0.02, 0));
    canopy(k, top, 0.06, 0.03, m);
    k.light(0, by, 0, { intensity: 1, distance: 5, color: '#ffc985' });
    recentre(k);
    return k.group();
  },
});

/* =========================================================== chandeliers */

const sputnik = lamp({
  id: 'sputnik-chandelier', placement: 'ceiling', ko: '스푸트니크 샹들리에', en: 'Sputnik chandelier',
  params: [
    P.int('arms', '팔 수', 'Arms', 16, 8, 30),
    P.len('diameter', '지름', 'Diameter', 0.9, 0.5, 1.4),
    P.len('rod', '봉 길이', 'Rod length', 0.4, 0.1, 1.0),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['sputnik', 'starburst chandelier', 'mid-century', '스푸트니크', '샹들리에', '미드센추리 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2 - 0.022, n = p.arms, m = p.metal;
    const c = [0, R + 0.03, 0];
    k.sphere('metal', m, 0.06, c[0], c[1], c[2], { segs: k.seg(28, 10), rings: k.seg(18, 7) });
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
      const d = new THREE.Vector3(Math.cos(a) * rr, y * 0.72, Math.sin(a) * rr).normalize();
      const dv = [d.x, d.y, d.z];
      k.rod('metal', m, add3(c, dv, 0.05), add3(c, dv, R - 0.04), 0.0045, { segs: k.seg(8, 4) });
      k.rod('fit', m, add3(c, dv, R - 0.045), add3(c, dv, R - 0.016), 0.011, { segs: k.seg(12, 5) });
      const b = add3(c, dv, R + 0.004);
      k.sphere('bulb', 'light-warm', 0.022, b[0], b[1], b[2], { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    }
    const top = c[1] + 0.055 + p.rod + 0.03;
    k.cyl('metal', m, 0.009, 0.009, top - 0.03 - (c[1] + 0.05), 0, c[1] + 0.05, 0, { segs: k.seg(12, 6) });
    canopy(k, top, 0.07, 0.03, m);
    k.light(0, c[1], 0, { intensity: 2.2, distance: 8 });
    recentre(k);
    return k.group();
  },
});

const crystal = lamp({
  id: 'crystal-chandelier', placement: 'ceiling', ko: '크리스탈 샹들리에', en: 'Crystal chandelier',
  params: [
    P.int('tiers', '단 수', 'Tiers', 2, 1, 3),
    P.len('diameter', '지름', 'Diameter', 0.64, 0.4, 1.0),
    P.len('rod', '봉 길이', 'Rod length', 0.3, 0.1, 1.0),
    P.mat('metal', '금속', 'Metal', 'metal-gold', 'metal'),
  ],
  tags: ['crystal chandelier', 'classic', 'tiered chandelier', '크리스탈 샹들리에', '샹들리에', '클래식 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2 - 0.03, m = p.metal, T_ = p.tiers;
    const pitch = 0.17, y0 = 0.12;
    const colTop = y0 + (T_ - 1) * pitch + 0.16;
    k.cyl('metal', m, 0.013, 0.013, colTop - 0.03, 0, 0.03, 0, { segs: k.seg(14, 6) });
    // big crystal drop at the very bottom
    k.add('crystal', 'glass-frosted', new THREE.OctahedronGeometry(0.03).scale(1, 1.6, 1).translate(0, 0.05, 0), { overrides: { color: '#eef4ff', roughness: 0.05 } });
    k.sphere('metal', m, 0.016, 0, 0.098, 0, { segs: k.seg(14, 6), rings: k.seg(8, 4) });
    const CRYSTAL = { overrides: { color: '#eef4ff', roughness: 0.05 } };
    const oct = (x, y, z, r = 0.012) => k.add('crystal', 'glass-frosted', new THREE.OctahedronGeometry(r).scale(1, 1.8, 1).translate(x, y, z), CRYSTAL);
    for (let j = 0; j < T_; j++) {
      const Rj = R * (1 - 0.34 * j), yj = y0 + j * pitch;
      k.lathe('metal', m, profileOf([[0.016, -0.05], [0.04, -0.04], [0.062, -0.02], [0.066, -0.004], [0.04, 0.006], [0.016, 0.012]], k.seg(10, 5)), 0, yj, 0, { segs: k.seg(24, 8) });
      k.add('metal', m, new THREE.TorusGeometry(Rj, 0.005, k.seg(6, 4), k.seg(64, 16)).rotateX(Math.PI / 2).translate(0, yj, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + j * 0.5, c = Math.cos(a), s = Math.sin(a);
        k.tube('metal', m, [[c * 0.06, yj - 0.012, s * 0.06], [c * Rj * 0.55, yj - 0.03, s * Rj * 0.55], [c * Rj, yj, s * Rj]], 0.004, { segs: k.seg(14, 6), radial: 4 });
      }
      const nc = clamp(Math.round((TAU * Rj) / 0.13), 5, 12);
      for (let i = 0; i < nc; i++) {
        const a = (i / nc) * TAU + j * 0.3, c = Math.cos(a), s = Math.sin(a), x = c * Rj, z = s * Rj;
        k.lathe('metal', m, [[0, 0], [0.01, 0], [0.026, 0.01], [0.028, 0.014], [0.014, 0.012], [0, 0.012]], x, yj - 0.004, z, { segs: k.seg(16, 6) });
        k.cyl('sleeve', 'paint-white-gloss', 0.01, 0.01, 0.06, x, yj + 0.008, z, { segs: k.seg(12, 6) });
        k.lathe('bulb', 'light-warm', [[0, 0], [0.008, 0.006], [0.011, 0.015], [0.007, 0.028], [0, 0.037]], x, yj + 0.068, z, { segs: k.seg(12, 6) });
        oct(x, yj - 0.03, z, 0.011);
        // bead swag to the next candle, with a drop at its low point
        const a2 = ((i + 1) / nc) * TAU + j * 0.3, am = (a + a2) / 2;
        k.tube('crystal', 'glass-frosted', [[x, yj - 0.006, z], [Math.cos(am) * (Rj + 0.012), yj - 0.055, Math.sin(am) * (Rj + 0.012)], [Math.cos(a2) * Rj, yj - 0.006, Math.sin(a2) * Rj]], 0.0028, { segs: k.seg(12, 5), radial: 4, ...CRYSTAL });
        oct(Math.cos(am) * (Rj + 0.012), yj - 0.085, Math.sin(am) * (Rj + 0.012), 0.012);
      }
      k.light(0, yj + 0.08, 0, { intensity: 1.4, distance: 7 });
    }
    // crown ring of small drops at the column top
    const yc = colTop - 0.03;
    k.add('metal', m, new THREE.TorusGeometry(0.08, 0.004, 4, k.seg(32, 10)).rotateX(Math.PI / 2).translate(0, yc, 0));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; k.rod('metal', m, [0, yc + 0.02, 0], [Math.cos(a) * 0.08, yc, Math.sin(a) * 0.08], 0.003, { segs: 5 }); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; oct(Math.cos(a) * 0.08, yc - 0.026, Math.sin(a) * 0.08, 0.009); }
    const top = colTop + p.rod;
    k.cyl('metal', m, 0.007, 0.007, top - colTop - 0.03, 0, colTop, 0, { segs: k.seg(10, 5) });
    canopy(k, top, 0.07, 0.035, m);
    recentre(k);
    return k.group();
  },
});

const ringChandelier = lamp({
  id: 'ring-chandelier', placement: 'ceiling', ko: '링 LED 샹들리에', en: 'Ring LED chandelier',
  params: [
    P.int('rings', '링 수', 'Rings', 3, 1, 4),
    P.len('diameter', '지름', 'Diameter', 0.8, 0.4, 1.4),
    P.len('drop', '와이어 길이', 'Cable length', 0.8, 0.3, 1.5),
    P.mat('metal', '금속', 'Metal', 'metal-gold', 'metal'),
  ],
  tags: ['ring chandelier', 'led ring', 'modern chandelier', '링 조명', 'LED 샹들리에', '모던 샹들리에'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2 - 0.015, n = p.rings, m = p.metal;
    const rings = [];
    for (let i = 0; i < n; i++) rings.push({ r: R * (1 - i * 0.24), y: 0.02 + i * 0.13 });
    const top = rings[n - 1].y + p.drop;
    for (const [i, g] of rings.entries()) {
      k.add('ring', m, new THREE.TorusGeometry(g.r, 0.013, k.seg(10, 5), k.seg(96, 24)).rotateX(Math.PI / 2).scale(1, 1.5, 1).translate(0, g.y, 0));
      k.add('bulb', 'light-warm', new THREE.TorusGeometry(g.r, 0.0085, k.seg(6, 4), k.seg(96, 24)).rotateX(Math.PI / 2).scale(1, 0.5, 1).translate(0, g.y - 0.0165, 0));
      for (let c = 0; c < 3; c++) {
        const a = (c / 3) * TAU + i * 0.7, x = Math.cos(a), z = Math.sin(a);
        k.rod('cable', 'metal-steel', [x * g.r, g.y + 0.018, z * g.r], [x * 0.05, top - 0.03, z * 0.05], 0.0011, { segs: 4 });
      }
      k.light(0, g.y - 0.03, 0, { intensity: 0.9, distance: 6 });
    }
    k.lathe('canopy', m, [[0, 0], [0.072, 0], [0.08, 0.008], [0.08, 0.03], [0, 0.03]], 0, top - 0.03, 0, { segs: k.seg(40, 12) });
    recentre(k);
    return k.group();
  },
});

/* =========================================================== floor lamps */

const torchiere = lamp({
  id: 'torchiere-floor-lamp', ko: '업라이트 스탠드(토치에어)', en: 'Torchiere floor lamp',
  params: [
    P.len('height', '높이', 'Height', 1.8, 1.5, 1.95),
    P.len('bowl', '갓 지름', 'Bowl diameter', 0.36, 0.25, 0.5),
    P.mat('finish', '색', 'Finish', 'metal-black', 'metal'),
    P.mat('bowlMat', '갓', 'Bowl', 'metal-black', 'metal'),
  ],
  tags: ['torchiere', 'uplighter', 'floor lamp', '업라이트', '토치에어', '장스탠드', '간접 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, R = p.bowl / 2, m = p.finish;
    k.lathe('base', m, profileOf([[0, 0], [0.135, 0], [0.14, 0.006], [0.13, 0.02], [0.03, 0.03], [0, 0.03]], k.seg(10, 5)), 0, 0, 0, { segs: k.seg(40, 12) });
    const by = H - 0.11;
    k.cyl('base', m, 0.011, 0.011, by - 0.028, 0, 0.028, 0, { segs: k.seg(14, 6) });
    k.cyl('base', m, 0.016, 0.016, 0.06, 0, 1.0, 0, { segs: k.seg(14, 6) });
    k.cyl('knob', 'plastic-black', 0.007, 0.007, 0.025, 0.012, 1.03, 0, { rz: -Math.PI / 2, segs: k.seg(10, 5) });
    const outer = profileOf([[0.025, 0], [R * 0.45, 0.025], [R * 0.82, 0.065], [R, 0.11]], k.seg(14, 6));
    k.lathe('bowl', p.bowlMat, outer, 0, by, 0, { segs: k.seg(48, 14) });
    k.lathe('bowl-inner', 'paint-white-matte', outer.map(([r, y]) => [Math.max(0, r - 0.002), y + 0.0015]).reverse(), 0, by, 0, { segs: k.seg(48, 14) });
    k.add('bowl', p.bowlMat, new THREE.TorusGeometry(R, 0.003, 6, k.seg(64, 16)).rotateX(Math.PI / 2).translate(0, by + 0.11, 0));
    k.cyl('bulb', 'light-warm', R * 0.35, R * 0.35, 0.006, 0, by + 0.035, 0, { segs: k.seg(24, 8) });
    k.light(0, H - 0.03, 0, { intensity: 1.4, distance: 6 });
    recentre(k);
    return k.group();
  },
});

const readingLamp = lamp({
  id: 'reading-floor-lamp', ko: '독서용 플로어 스탠드', en: 'Reading floor lamp',
  params: [
    P.len('height', '높이', 'Height', 1.45, 1.2, 1.7),
    P.len('reach', '팔 길이', 'Arm reach', 0.4, 0.25, 0.6),
    P.mat('finish', '색', 'Finish', 'metal-black', 'metal'),
    P.mat('shade', '갓', 'Shade', 'metal-brass', 'metal'),
  ],
  tags: ['reading lamp', 'floor lamp', 'task light', '독서등', '플로어 스탠드', '장스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, X = p.reach, m = p.finish;
    k.lathe('base', m, profileOf([[0, 0], [0.125, 0], [0.13, 0.008], [0.12, 0.022], [0.025, 0.03], [0, 0.03]], k.seg(10, 5)), 0, 0, 0, { segs: k.seg(40, 12) });
    k.cyl('base', m, 0.01, 0.01, H - 0.03, 0, 0.028, 0, { segs: k.seg(14, 6) });
    k.sphere('base', m, 0.018, 0, H, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    const yEnd = H - 0.02;
    k.tube('base', m, [[0, H, 0], [0, H + 0.045, X * 0.45], [0, H + 0.03, X * 0.88], [0, yEnd, X]], 0.007, { segs: k.seg(24, 8), radial: k.seg(10, 5) });
    const hs = 0.075 + 0.035;
    transformAdded(k, () => {
      metalShade(k, 'cone', 0.075, 0, p.shade);
      bulb(k, 0, 0.05, 0, 0.026);
      k.light(0, 0.03, 0, { intensity: 0.8, distance: 4, type: 'spot', angle: 0.8 });
    }, 0, yEnd - hs + 0.004, X);
    recentre(k);
    return k.group();
  },
});

const studioSpot = lamp({
  id: 'studio-spot-floor-lamp', ko: '삼각대 스포트 스탠드', en: 'Tripod spotlight floor lamp',
  params: [
    P.len('height', '높이', 'Height', 1.55, 1.2, 1.8),
    P.num('tilt', '헤드 기울기', 'Head tilt', 0.3, 0, 0.8, 0.05),
    P.mat('head', '헤드', 'Head', 'metal-black', 'metal'),
    P.mat('legs', '다리', 'Legs', 'metal-chrome', 'metal'),
  ],
  tags: ['tripod spotlight', 'studio lamp', 'floor lamp', '삼각대 조명', '스튜디오 스탠드', '스포트 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, footR = 0.36;
    const hub = H * 0.55, yc = H - 0.13;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 2;
      const f = [Math.cos(a) * footR, 0.012, Math.sin(a) * footR];
      k.rod('legs', p.legs, f, [Math.cos(a) * 0.022, hub, Math.sin(a) * 0.022], 0.011, { segs: k.seg(12, 6) });
      k.sphere('feet', 'rubber-black', 0.016, f[0], 0.014, f[2], { segs: k.seg(10, 5), rings: k.seg(6, 4), scale: [1, 0.8, 1] });
    }
    k.cyl('legs', p.legs, 0.03, 0.03, 0.06, 0, hub - 0.04, 0, { segs: k.seg(16, 6) });
    k.cyl('legs', p.legs, 0.012, 0.012, yc - 0.16 - hub, 0, hub, 0, { segs: k.seg(12, 6) });
    const yy = yc - 0.16;
    k.bentTube('yoke', p.head, [[-0.135, yc, 0], [-0.135, yy, 0], [0.135, yy, 0], [0.135, yc, 0]], 0.008, 0.03, { radial: k.seg(10, 5) });
    for (const s of [-1, 1]) k.cyl('knob', 'plastic-black', 0.016, 0.016, 0.02, s > 0 ? 0.143 : -0.163, yc, 0, { rz: -Math.PI / 2, segs: k.seg(14, 6) });
    // drum head aimed forward and slightly down
    const t = 0.15 + 1.0 * clamp(p.tilt, 0, 0.8);
    const d = [0, -Math.sin(t) * 0.6, Math.cos(t)];
    const dl = Math.hypot(...d), dv = d.map((v) => v / dl);
    const c = [0, yc, 0];
    k.rod('head', p.head, add3(c, dv, -0.1), add3(c, dv, 0.12), 0.12, { segs: k.seg(32, 10) });
    k.rod('head', p.head, add3(c, dv, -0.13), add3(c, dv, -0.1), 0.085, { segs: k.seg(28, 10) });
    k.rod('lens-ring', 'metal-chrome', add3(c, dv, 0.118), add3(c, dv, 0.124), 0.122, { segs: k.seg(32, 10), open: true });
    k.rod('lens', 'light-warm', add3(c, dv, 0.112), add3(c, dv, 0.1205), 0.105, { segs: k.seg(28, 10) });
    const lp = add3(c, dv, 0.15);
    k.light(lp[0], lp[1], lp[2], { intensity: 1.2, distance: 6, type: 'spot', angle: 0.7 });
    recentre(k);
    return k.group();
  },
});

const PAPER_COLUMN = {
  column: (t) => 0.92 + 0.08 * Math.sin(Math.PI * t),
  tapered: (t) => 1 - 0.38 * t,
  oval: (t) => 0.45 + 0.55 * Math.sin(Math.PI * t) ** 0.7,
};

const paperFloor = lamp({
  id: 'paper-column-floor-lamp', ko: '종이 기둥 플로어 램프', en: 'Paper column floor lamp',
  params: [
    P.pick('shape', '모양', 'Shape', 'column', [['column', '기둥', 'Column'], ['tapered', '테이퍼', 'Tapered'], ['oval', '타원', 'Oval']]),
    P.len('height', '높이', 'Height', 1.5, 0.9, 1.9),
    P.len('width', '지름', 'Diameter', 0.42, 0.3, 0.6),
    P.mat('paper', '종이', 'Paper', 'paper', 'other'),
  ],
  tags: ['paper floor lamp', 'akari', 'japanese lamp', '종이 스탠드', '한지 스탠드', '플로어 램프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, R = p.width / 2, y0 = 0.14, fn = PAPER_COLUMN[p.shape] ?? PAPER_COLUMN.column;
    const h = H - y0;
    const prof = ribbed((t) => R * fn(t), h, Math.round(h / 0.045), 0.035);
    k.lathe('paper', p.paper, prof, 0, y0, 0, { segs: k.seg(48, 14) });
    for (const [r, y] of [prof[0], prof[prof.length - 1]]) k.add('wire', 'metal-black', new THREE.TorusGeometry(r, 0.003, 4, k.seg(40, 12)).rotateX(Math.PI / 2).translate(0, y0 + y, 0));
    // thin wire legs under the lantern
    const rb = prof[0][0];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('wire', 'metal-black', [c * rb * 1.15, 0, s * rb * 1.15], [c * rb, y0 + 0.002, s * rb], 0.0035, { segs: 5 });
      k.rod('wire', 'metal-black', [c * rb, y0 + 0.002, s * rb], [0, y0 + 0.08, 0], 0.0025, { segs: 4 });
    }
    k.cyl('wire', 'metal-black', 0.006, 0.006, 0.18, 0, y0 + 0.08, 0, { segs: 6 });
    const by = y0 + 0.32;
    k.cyl('bulb', 'light-warm', 0.03, 0.03, 0.22, 0, by, 0, { segs: k.seg(16, 6) });
    k.light(0, by + 0.11, 0, { intensity: 1.2, distance: 5 });
    if (h > 1.0) k.light(0, y0 + h * 0.75, 0, { intensity: 0.6, distance: 4 });
    recentre(k);
    return k.group();
  },
});

const sphereFloor = lamp({
  id: 'sphere-floor-lamp', ko: '구형 플로어 램프', en: 'Globe floor lamp',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.45, 0.25, 0.7),
    P.mat('glass', '유리', 'Glass', 'glass-frosted', 'glass'),
    P.mat('base', '받침', 'Base', 'metal-black', 'metal'),
  ],
  tags: ['globe lamp', 'floor globe', 'ball lamp', '구형 조명', '볼 램프', '바닥 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, br = Math.max(0.07, R * 0.45);
    k.lathe('base', p.base, profileOf([[0, 0], [br, 0], [br + 0.004, 0.005], [br, 0.018], [br * 0.8, 0.026]], 8).concat([[0, 0.026]]), 0, 0, 0, { segs: k.seg(40, 12) });
    const cy = 0.02 + R;
    k.sphere('glass', p.glass, R, 0, cy, 0, { segs: k.seg(48, 14), rings: k.seg(32, 10) });
    k.cyl('fit', 'metal-steel', 0.02, 0.025, 0.08, 0, 0.026, 0, { segs: k.seg(14, 6) });
    k.sphere('bulb', 'light-warm', Math.min(0.05, R * 0.25), 0, cy - R * 0.2, 0, { segs: k.seg(18, 8), rings: k.seg(12, 5) });
    k.cyl('cord', 'plastic-black', 0.003, 0.003, 0.004, 0, 0, -br * 0.9, { segs: 5 });
    k.light(0, cy, 0, { intensity: 1, distance: 5 });
    recentre(k);
    return k.group();
  },
});

/** Korean hanji lamp face (lattice + paper) for the +z side, centred at x = 0. */
function hanjiFace(k, w, y0, h, wood, paper, pattern) {
  const z = w / 2;
  k.box('paper', paper, w - 0.03, h - 0.03, 0.002, 0, y0 + h / 2, z - 0.012, { r: 0 });
  // rails top/bottom
  for (const y of [y0 + 0.01, y0 + h - 0.01]) k.box('frame', wood, w - 0.02, 0.02, 0.016, 0, y, z - 0.008, { r: 0.002 });
  const s = 0.006, zf = z - 0.0095;
  const iw = w - 0.03, ih = h - 0.04, yb = y0 + 0.02;
  if (pattern === 'grid') {
    const nx = 3, ny = Math.max(3, Math.round(ih / (iw / nx)));
    for (let i = 1; i < nx; i++) k.box('frame', wood, s, ih, s, -iw / 2 + (iw * i) / nx, yb + ih / 2, zf, { r: 0 });
    for (let j = 1; j < ny; j++) k.box('frame', wood, iw, s, s, 0, yb + (ih * j) / ny, zf, { r: 0 });
  } else {
    // 'window': an inner frame with ties to the edges (a classic changsal motif)
    const fw = iw * 0.55, fh = ih * 0.6, cy = yb + ih / 2;
    for (const sy of [-1, 1]) k.box('frame', wood, fw, s, s, 0, cy + sy * fh / 2, zf, { r: 0 });
    for (const sx of [-1, 1]) k.box('frame', wood, s, fh, s, sx * fw / 2, cy, zf, { r: 0 });
    for (const sy of [-1, 1]) k.box('frame', wood, s, (ih - fh) / 2, s, 0, cy + sy * (fh / 2 + (ih - fh) / 4), zf, { r: 0 });
    for (const sx of [-1, 1]) k.box('frame', wood, (iw - fw) / 2, s, s, sx * (fw / 2 + (iw - fw) / 4), cy, zf, { r: 0 });
    k.box('frame', wood, fw, s, s, 0, cy, zf, { r: 0 });
  }
}

const hanjiLamp = lamp({
  id: 'hanji-lamp', ko: '한지 사방등', en: 'Korean hanji lantern lamp',
  params: [
    P.len('height', '높이', 'Height', 0.6, 0.35, 1.2),
    P.len('width', '폭', 'Width', 0.3, 0.2, 0.5),
    P.pick('pattern', '살 무늬', 'Lattice', 'grid', [['grid', '격자살', 'Grid'], ['window', '창살', 'Window frame']]),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('paper', '한지', 'Paper', 'paper', 'other'),
  ],
  tags: ['hanji lamp', 'korean lamp', 'paper lantern', '한지 조명', '한지 등', '사방등', '전통 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, w = p.width, wd = p.wood;
    // plinth on four small feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', wd, 0.03, 0.025, 0.03, sx * (w / 2 + 0.005), 0.0125, sz * (w / 2 + 0.005), { r: 0.003 });
    k.rbox('frame', wd, w + 0.04, 0.03, w + 0.04, 0.004, 0, 0.025 + 0.015, 0, { segs: k.seg(2, 1) });
    const y0 = 0.055, roof = 0.05, bh = H - y0 - roof;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', wd, 0.02, bh, 0.02, sx * (w / 2 - 0.01), y0 + bh / 2, sz * (w / 2 - 0.01), { r: 0.002 });
    for (let f = 0; f < 4; f++) transformAdded(k, () => hanjiFace(k, w, y0, bh, wd, p.paper, p.pattern), 0, 0, 0, (f * Math.PI) / 2);
    // top board and low pyramid roof with a knob
    k.rbox('frame', wd, w + 0.03, 0.02, w + 0.03, 0.004, 0, y0 + bh + 0.01, 0, { segs: k.seg(2, 1) });
    const rr = (w / 2 + 0.01) * Math.SQRT2;
    k.lathe('frame', wd, [[rr, 0], [rr * 0.35, roof * 0.55], [0, roof * 0.6]], 0, y0 + bh + 0.02, 0, { segs: 4, ry: Math.PI / 4 });
    k.sphere('frame', wd, 0.014, 0, y0 + bh + 0.02 + roof * 0.6 + 0.008, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const by = y0 + bh * 0.45;
    bulb(k, 0, by, 0, 0.03, { socket: 'plastic-white', up: true });
    k.cyl('fit', 'plastic-white', 0.01, 0.01, by - 0.03 - 0.035 - y0 + 0.001, 0, y0, 0, { segs: 6 });
    k.light(0, by, 0, { intensity: 0.8, distance: 4, color: '#ffd9a0' });
    recentre(k);
    return k.group();
  },
});

/* =========================================================== table lamps */

const mushroom = lamp({
  id: 'mushroom-table-lamp', placement: 'surface', ko: '머쉬룸 테이블 램프', en: 'Mushroom table lamp',
  params: [
    P.len('height', '높이', 'Height', 0.36, 0.25, 0.55),
    P.len('diameter', '갓 지름', 'Cap diameter', 0.32, 0.2, 0.5),
    P.mat('body', '재질', 'Finish', 'plastic-white', 'plastic'),
  ],
  tags: ['mushroom lamp', 'table lamp', 'retro', '머쉬룸 램프', '버섯 조명', '테이블 램프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, R = p.diameter / 2, capH = R * 0.62, stemTop = H - capH * 0.75;
    const br = R * 0.62;
    k.lathe('body', p.body, profileOf([[0, 0], [br, 0], [br + 0.002, 0.006], [br * 0.8, 0.02], [br * 0.35, 0.06], [0.02, stemTop * 0.6], [0.018, stemTop]], k.seg(18, 8)), 0, 0, 0, { segs: k.seg(40, 12) });
    const y = H - capH;
    const outer = profileOf([[R, 0], [R * 0.98, capH * 0.12], [R * 0.86, capH * 0.5], [R * 0.52, capH * 0.88], [0, capH]], k.seg(18, 6));
    k.lathe('body', p.body, outer, 0, y, 0, { segs: k.seg(48, 14) });
    k.lathe('inner', 'paint-white-matte', outer.map(([r, yy]) => [Math.max(0, r - 0.003), yy - 0.002]).reverse(), 0, y, 0, { segs: k.seg(48, 14) });
    k.add('body', p.body, new THREE.TorusGeometry(R - 0.0015, 0.0018, 4, k.seg(64, 16)).rotateX(Math.PI / 2).translate(0, y + 0.0004, 0));
    k.sphere('bulb', 'light-warm', 0.03, 0, stemTop + 0.03, 0, { segs: k.seg(16, 6), rings: k.seg(10, 4) });
    k.light(0, y, 0, { intensity: 0.6, distance: 4 });
    recentre(k);
    return k.group();
  },
});

const globeTable = lamp({
  id: 'globe-table-lamp', placement: 'surface', ko: '글로브 테이블 램프', en: 'Globe table lamp',
  params: [
    P.len('diameter', '유리 지름', 'Globe diameter', 0.25, 0.15, 0.4),
    P.mat('base', '받침', 'Base', 'marble-white', 'stone'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['globe lamp', 'table lamp', 'opal glass', '글로브 램프', '유리 구 조명', '테이블 램프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, br = Math.max(0.055, R * 0.55), bh = 0.06;
    k.lathe('base', p.base, [[0, 0], [br, 0], [br, bh - 0.004], [br - 0.004, bh], [0, bh]], 0, 0, 0, { segs: k.seg(40, 12) });
    k.lathe('metal', p.metal, profileOf([[R * 0.3, 0], [R * 0.34, 0.012], [R * 0.48, 0.03], [R * 0.52, 0.036]], 6).concat([[R * 0.5, 0.037], [0, 0.002]]), 0, bh - 0.001, 0, { segs: k.seg(32, 10) });
    const cy = bh + 0.036 + Math.sqrt(R * R - (R * 0.5) ** 2) - 0.002;
    k.sphere('glass', 'glass-frosted', R, 0, cy, 0, { segs: k.seg(40, 12), rings: k.seg(28, 8) });
    k.sphere('bulb', 'light-warm', Math.min(0.03, R * 0.3), 0, cy - R * 0.1, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    k.light(0, cy, 0, { intensity: 0.6, distance: 4 });
    recentre(k);
    return k.group();
  },
});

const bankers = lamp({
  id: 'bankers-lamp', placement: 'surface', ko: '뱅커스 램프', en: "Banker's lamp",
  params: [
    P.color('glass', '갓 색', 'Shade colour', '#1f6a45'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ["banker's lamp", 'library lamp', 'desk lamp', '뱅커스 램프', '은행원 스탠드', '클래식 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, R = 0.075, L = 0.27, ys = 0.32;
    k.rbox('metal', m, 0.25, 0.022, 0.16, 0.007, 0, 0.011, 0, { segs: k.seg(3, 1) });
    k.rbox('metal', m, 0.17, 0.014, 0.1, 0.005, 0, 0.022 + 0.007 - 0.001, -0.005, { segs: k.seg(3, 1) });
    k.cyl('metal', m, 0.009, 0.009, ys - 0.035, 0, 0.035, -0.02, { segs: k.seg(12, 6) });
    k.lathe('metal', m, [[0, 0], [0.018, 0], [0.02, 0.008], [0.012, 0.02], [0, 0.02]], 0, 0.034, -0.02, { segs: k.seg(16, 6) });
    k.tube('metal', m, [[0, ys - 0.03, -0.02], [0, ys - 0.005, -0.012], [0, ys, 0]], 0.009, { segs: 6, radial: k.seg(10, 5) });
    k.rod('metal', m, [-L / 2 + 0.012, ys + 0.004, 0], [L / 2 - 0.012, ys + 0.004, 0], 0.005, { segs: k.seg(10, 5) });
    halfHood(k, 'shade', 'ceramic-white', R, L, 0, ys, 0, { rx: -0.12, overrides: { color: p.glass } });
    k.cyl('bulb', 'light-warm', 0.013, 0.013, 0.17, -0.085, ys + 0.026, 0, { rz: -Math.PI / 2, segs: k.seg(12, 6) });
    // pull chain with a bead
    k.rod('metal', m, [0.05, ys + 0.01, 0.03], [0.05, ys - 0.09, 0.03], 0.0012, { segs: 4 });
    k.sphere('metal', m, 0.005, 0.05, ys - 0.094, 0.03, { segs: 8, rings: 5 });
    k.light(0, ys + 0.01, 0, { intensity: 0.6, distance: 3 });
    recentre(k);
    return k.group();
  },
});

const lava = lamp({
  id: 'lava-lamp-table', placement: 'surface', ko: '라바 램프', en: 'Lava lamp',
  params: [
    P.len('height', '높이', 'Height', 0.42, 0.3, 0.6),
    P.color('lava', '왁스 색', 'Wax colour', '#ff6a2b'),
    P.color('liquid', '액체 색', 'Liquid colour', '#d98bd6'),
    P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal'),
  ],
  tags: ['lava lamp', 'retro', 'mood light', '라바 램프', '무드등', '레트로 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 0.42, m = p.metal;
    k.lathe('metal', m, [[0, 0], [0.072 * s, 0], [0.074 * s, 0.006 * s], [0.042 * s, 0.13 * s], [0, 0.13 * s]], 0, 0, 0, { segs: k.seg(32, 10) });
    const bottle = profileOf([[0.04 * s, 0], [0.052 * s, 0.07 * s], [0.045 * s, 0.17 * s], [0.03 * s, 0.24 * s]], k.seg(16, 6));
    k.lathe('glass', 'glass-tinted', bottle.concat([[0, 0.24 * s]]), 0, 0.128 * s, 0, { segs: k.seg(36, 10), overrides: { color: p.liquid } });
    k.lathe('metal', m, [[0.031 * s, 0], [0.018 * s, 0.05 * s], [0, 0.052 * s]], 0, 0.366 * s, 0, { segs: k.seg(28, 8) });
    const wax = { overrides: { color: p.lava, emissive: p.lava, emissiveIntensity: 1.2 } };
    const blobs = [[0, 0.15, 0, 0.034, 0.5], [0.006, 0.2, 0.005, 0.016, 1.3], [-0.01, 0.26, -0.004, 0.02, 0.9], [0.004, 0.32, 0, 0.012, 1.2]];
    for (const [x, y, z, r, e] of blobs) k.sphere('wax', 'light-warm', r * s, x * s, y * s, z * s, { segs: k.seg(16, 6), rings: k.seg(10, 4), scale: [1, e, 1], ...wax });
    k.light(0, 0.22 * s, 0, { intensity: 0.3, distance: 2, color: p.lava });
    recentre(k);
    return k.group();
  },
});

const tiffany = lamp({
  id: 'tiffany-table-lamp', placement: 'surface', ko: '티파니 스테인드글라스 램프', en: 'Tiffany stained-glass lamp',
  params: [
    P.len('diameter', '갓 지름', 'Shade diameter', 0.4, 0.3, 0.55),
    P.len('height', '높이', 'Height', 0.6, 0.45, 0.75),
    P.mat('base', '받침', 'Base', 'metal-copper', 'metal'),
  ],
  tags: ['tiffany lamp', 'stained glass', 'table lamp', '티파니 램프', '스테인드글라스', '테이블 램프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = p.height, Hs = R * 0.72, sb = H - Hs;
    const bronze = { overrides: { color: '#6a4a2c' } };
    k.lathe('base', p.base, profileOf([[0, 0], [0.11, 0], [0.112, 0.01], [0.085, 0.03], [0.04, 0.06], [0.026, 0.12], [0.034, sb * 0.6], [0.02, sb * 0.8], [0.014, sb + 0.04]], k.seg(22, 8)), 0, 0, 0, { segs: k.seg(32, 10), ...bronze });
    const prof = profileOf([[R, 0], [R * 0.97, Hs * 0.1], [R * 0.85, Hs * 0.4], [R * 0.6, Hs * 0.72], [R * 0.28, Hs * 0.93], [0.03, Hs]], 18);
    const cols = ['#c98a2c', '#4f7d3a', '#a43b2a'];
    for (let b = 0; b < 3; b++) k.lathe('glass', 'glass-frosted', prof.slice(b * 6, b * 6 + 7), 0, sb, 0, { segs: k.seg(16, 8), overrides: { color: cols[b] } });
    // lead came: rings at the band edges + ribs at the facet edges
    const lead = 'metal-black';
    for (const i of [0, 6, 12, 18]) k.add('lead', lead, new THREE.TorusGeometry(prof[i][0] + 0.001, i === 0 ? 0.004 : 0.0025, 4, k.seg(16, 8)).rotateX(Math.PI / 2).rotateY(Math.PI / 16 * 0).translate(0, sb + prof[i][1], 0));
    const nf = k.hi ? 16 : 8;
    for (let j = 0; j < nf; j++) {
      const a = (j / nf) * TAU, c = Math.sin(a), s = Math.cos(a);
      k.tube('lead', lead, prof.map(([r, y]) => [c * (r + 0.0015), sb + y, s * (r + 0.0015)]), 0.0018, { segs: k.seg(20, 8), radial: 4 });
    }
    k.sphere('base', p.base, 0.014, 0, H + 0.004, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4), ...bronze });
    for (const sx of [-1, 1]) bulb(k, sx * 0.05, sb + Hs * 0.25, 0, 0.026, { socket: 'metal-brass', up: true });
    k.light(0, sb + Hs * 0.3, 0, { intensity: 0.6, distance: 4, color: '#ffcf8a' });
    recentre(k);
    return k.group();
  },
});

const ledDesk = lamp({
  id: 'led-desk-lamp', placement: 'surface', ko: 'LED 데스크 스탠드', en: 'LED desk lamp',
  params: [
    P.len('height', '높이', 'Height', 0.44, 0.32, 0.6),
    P.len('reach', '헤드 길이', 'Head length', 0.36, 0.25, 0.5),
    P.mat('finish', '색', 'Finish', 'metal-aluminium', 'metal'),
  ],
  tags: ['led desk lamp', 'task lamp', 'study lamp', 'LED 스탠드', '책상 스탠드', '학습 스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, L = p.reach, m = p.finish;
    const zb = -L / 2 + 0.07;
    k.lathe('base', m, [[0, 0], [0.076, 0], [0.08, 0.004], [0.08, 0.012], [0.075, 0.016], [0, 0.016]], 0, 0, zb, { segs: k.seg(40, 12) });
    k.cyl('button', 'plastic-black', 0.009, 0.009, 0.0025, 0.045, 0.0155, zb + 0.03, { segs: k.seg(14, 6) });
    k.rbox('base', m, 0.022, H - 0.03, 0.014, 0.006, 0, 0.016 + (H - 0.03) / 2, zb, { segs: k.seg(3, 1) });
    k.cyl('base', 'plastic-black', 0.011, 0.011, 0.034, -0.017, H - 0.012, zb, { rz: -Math.PI / 2, segs: k.seg(14, 6) });
    k.rbox('head', m, 0.05, 0.014, L, 0.006, 0, H, zb - 0.03 + L / 2, { segs: k.seg(3, 1) });
    k.box('bulb', 'light-cool', 0.036, 0.002, L - 0.07, 0, H - 0.0071, zb - 0.03 + L / 2 + 0.02, { r: 0 });
    k.light(0, H - 0.03, zb + L / 2, { intensity: 0.6, distance: 3, type: 'spot', angle: 1.0, color: '#f4f8ff' });
    recentre(k);
    return k.group();
  },
});

/* ============================================================= wall lights */

const swingArm = lamp({
  id: 'swing-arm-wall-lamp', placement: 'wall', elevation: 1.1, ko: '스윙암 벽 조명', en: 'Swing-arm wall lamp',
  params: [
    P.len('reach', '팔 길이', 'Arm reach', 0.5, 0.3, 0.8),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
  ],
  tags: ['swing arm lamp', 'wall lamp', 'bedside', '스윙암 조명', '침대 벽등', '벽 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const X = p.reach, m = p.metal, ya = 0.22;
    k.rbox('metal', m, 0.06, 0.15, 0.012, 0.005, 0, ya - 0.02, 0.006, { segs: k.seg(3, 1) });
    k.cyl('metal', m, 0.012, 0.012, 0.11, 0, ya - 0.075, 0.03, { segs: k.seg(14, 6) });
    for (const y of [ya - 0.07, ya + 0.02]) k.box('metal', m, 0.016, 0.012, 0.03, 0, y, 0.015, { r: 0.003 });
    k.tube('metal', m, [[0, ya, 0.03], [0, ya, X * 0.5], [0, ya, X - 0.05], [0, ya - 0.03, X - 0.005], [0, ya - 0.07, X]], 0.0065, { segs: k.seg(30, 10), radial: k.seg(10, 5) });
    k.cyl('metal', m, 0.012, 0.012, 0.03, 0, ya - 0.007, X * 0.55, { segs: k.seg(14, 6) });
    const sh = 0.15, rb = 0.11, rt = 0.08;
    k.cyl('shade', p.shade, rt, rb, sh, 0, 0, X, { open: true, segs: k.seg(48, 14) });
    k.add('metal', m, new THREE.TorusGeometry(rb, 0.002, 4, k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, 0.002, X));
    k.add('metal', m, new THREE.TorusGeometry(rt, 0.002, 4, k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, sh - 0.002, X));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; k.rod('metal', m, [0, sh - 0.01, X], [Math.cos(a) * (rt - 0.002), sh - 0.003, X + Math.sin(a) * (rt - 0.002)], 0.0016, { segs: 4 }); }
    k.cyl('metal', m, 0.016, 0.016, ya - 0.07 - (sh - 0.06), 0, sh - 0.06, X, { segs: k.seg(14, 6) });
    transformAdded(k, () => bulb(k, 0, sh - 0.1, 0, 0.027, { socket: m }), 0, 0, X);
    k.light(0, sh - 0.1, X, { intensity: 0.6, distance: 3 });
    recentre(k);
    return k.group();
  },
});

const pictureLight = lamp({
  id: 'picture-light', placement: 'wall', elevation: 1.9, ko: '액자 조명', en: 'Picture light',
  params: [
    P.len('width', '폭', 'Width', 0.45, 0.25, 0.9),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['picture light', 'art light', 'gallery', '액자등', '그림 조명', '갤러리 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, m = p.metal, R = 0.03, hy = 0.15, hz = 0.13;
    k.cyl('metal', m, 0.03, 0.032, 0.012, 0, 0.03, 0, { rx: Math.PI / 2, segs: k.seg(28, 8) });
    k.tube('metal', m, [[0, 0.03, 0.01], [0, 0.07, 0.025], [0, 0.125, 0.08], [0, hy - 0.006, hz - 0.012]], 0.006, { segs: k.seg(20, 8), radial: k.seg(8, 4) });
    halfHood(k, 'hood', m, R, W, 0, hy, hz, { rx: 0.55 });
    k.box('bulb', 'light-warm', W - 0.03, 0.004, 0.012, 0, hy - 0.003, hz - 0.003, { r: 0.0015, rx: 0.55 });
    k.light(0, hy - 0.03, hz - 0.03, { intensity: 0.5, distance: 2.5, type: 'spot', angle: 0.9 });
    recentre(k);
    return k.group();
  },
});

const mirrorBar = lamp({
  id: 'mirror-light-bar', placement: 'wall', elevation: 1.95, ko: '욕실 거울 조명 바', en: 'Bathroom mirror light bar',
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.3, 1.2),
    P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal'),
    P.mat('glow', '빛 색', 'Light colour', 'light-cool', 'other'),
  ],
  tags: ['mirror light', 'vanity light', 'bathroom light', '거울 조명', '욕실등', '파우더룸 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, m = p.metal;
    k.rbox('metal', m, 0.07, 0.05, 0.01, 0.004, 0, 0.03, 0.005, { segs: k.seg(3, 1) });
    k.rbox('metal', m, 0.022, 0.016, 0.05, 0.004, 0, 0.03, 0.035, { segs: k.seg(3, 1) });
    k.rbox('metal', m, W, 0.04, 0.05, 0.012, 0, 0.03, 0.08, { segs: k.seg(4, 1) });
    k.rbox('bulb', p.glow, W - 0.02, 0.022, 0.006, 0.003, 0, 0.03, 0.105 + 0.0025, { segs: k.seg(2, 1) });
    for (const s of [-1, 1]) k.light(s * W * 0.25, 0.03, 0.12, { intensity: 0.5, distance: 3, color: '#f4f8ff' });
    recentre(k);
    return k.group();
  },
});

const wallLantern = lamp({
  id: 'wall-lantern', placement: 'wall', elevation: 1.75, ko: '벽부 랜턴', en: 'Wall lantern',
  params: [
    P.len('height', '랜턴 높이', 'Lantern height', 0.28, 0.2, 0.45),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass'),
  ],
  tags: ['wall lantern', 'coach light', 'porch light', '벽부 랜턴', '현관등', '외벽등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, hl = p.height, w = 0.13, cz = 0.16;
    const yb = 0.03, yt = yb + hl;
    // back plate and a scrolled bracket
    k.rbox('metal', m, 0.08, hl * 0.75, 0.012, 0.006, 0, yb + hl * 0.45, 0.006, { segs: k.seg(3, 1) });
    k.tube('metal', m, [[0, yt - 0.01, 0.012], [0, yt + 0.025, 0.06], [0, yt + 0.035, cz - 0.03], [0, yt + 0.02, cz]], 0.007, { segs: k.seg(20, 8), radial: k.seg(8, 4) });
    k.tube('metal', m, [[0, yb + hl * 0.3, 0.012], [0, yb + hl * 0.3, cz - w / 2]], 0.006, { segs: 4, radial: k.seg(8, 4) });
    // base tray, corner posts, glass panes, roof, finial
    const half = (w / 2) * Math.SQRT2;
    k.lathe('metal', m, [[half * 0.55, 0], [half * 1.02, 0.02], [half * 1.02, 0.03], [0, 0.03]], 0, 0, cz, { segs: 4, ry: Math.PI / 4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('metal', m, 0.008, hl - 0.03, 0.008, sx * (w / 2 - 0.004), yb + (hl - 0.03) / 2, cz + sz * (w / 2 - 0.004), { r: 0.001 });
    const gh = hl - 0.03, gy = yb + gh / 2;
    for (const s of [-1, 1]) {
      k.box('glass', p.glass, w - 0.012, gh, 0.003, 0, gy, cz + s * (w / 2 - 0.004), { r: 0 });
      k.box('glass', p.glass, 0.003, gh, w - 0.012, s * (w / 2 - 0.004), gy, cz, { r: 0 });
    }
    const ry = yb + gh;
    k.lathe('metal', m, [[half * 1.12, 0], [half * 1.12, 0.008], [half * 0.4, 0.05], [0, 0.055]], 0, ry, cz, { segs: 4, ry: Math.PI / 4 });
    k.sphere('metal', m, 0.012, 0, ry + 0.062, cz, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    // candle-style bulb
    k.cyl('sleeve', 'paint-white-gloss', 0.011, 0.011, gh * 0.38, 0, yb, cz, { segs: k.seg(12, 6) });
    k.lathe('bulb', 'light-warm', [[0, 0], [0.012, 0.01], [0.016, 0.025], [0.01, 0.045], [0, 0.058]], 0, yb + gh * 0.38, cz, { segs: k.seg(14, 6) });
    k.light(0, yb + gh * 0.5, cz, { intensity: 0.6, distance: 4 });
    recentre(k);
    return k.group();
  },
});

const candleSconce = lamp({
  id: 'candle-wall-sconce', placement: 'wall', elevation: 1.6, ko: '촛대형 벽 조명', en: 'Candle wall sconce',
  params: [
    P.int('arms', '팔 수', 'Arms', 2, 1, 3),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['candle sconce', 'wall sconce', 'classic', '촛대 벽등', '클래식 벽등', '벽 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal, yc = 0.11, n = p.arms;
    k.lathe('metal', m, profileOf([[0, 0], [0.045, 0], [0.05, 0.005], [0.042, 0.012], [0.02, 0.018], [0, 0.02]], k.seg(10, 5)), 0, yc, 0, { segs: k.seg(32, 10), rx: Math.PI / 2, scale: [1, 1, 1.6] });
    k.lathe('metal', m, [[0, -0.03], [0.008, -0.025], [0.012, -0.01], [0.008, 0], [0, 0.002]], 0, yc - 0.075, 0.012, { segs: k.seg(12, 6) });
    const xs = n === 1 ? [0] : n === 2 ? [-0.12, 0.12] : [-0.12, 0, 0.12];
    for (const x of xs) {
      const z = x === 0 ? 0.11 : 0.09, top = yc + 0.04;
      k.tube('metal', m, [[x * 0.08, yc - 0.01, 0.016], [x * 0.4, yc - 0.06, 0.05], [x * 0.9, yc - 0.05, z * 0.9], [x, yc - 0.01, z], [x, top - 0.005, z]], 0.006, { segs: k.seg(26, 8), radial: k.seg(8, 4) });
      k.lathe('metal', m, [[0, 0], [0.012, 0], [0.032, 0.012], [0.034, 0.016], [0.016, 0.014], [0, 0.014]], x, top - 0.012, z, { segs: k.seg(20, 8) });
      k.cyl('sleeve', 'paint-white-gloss', 0.011, 0.011, 0.075, x, top, z, { segs: k.seg(14, 6) });
      k.lathe('bulb', 'light-warm', [[0, 0], [0.009, 0.006], [0.012, 0.016], [0.008, 0.03], [0, 0.04]], x, top + 0.075, z, { segs: k.seg(12, 6) });
      k.light(x, top + 0.09, z, { intensity: 0.4, distance: 3 });
    }
    recentre(k);
    return k.group();
  },
});

const stringLights = lamp({
  id: 'string-lights-globe', placement: 'wall', elevation: 1.9, ko: '전구 가랜드(줄 조명)', en: 'Globe string lights',
  params: [
    P.len('width', '폭', 'Span', 2.0, 0.8, 4.0),
    P.int('bulbs', '전구 수', 'Bulbs', 10, 4, 24),
    P.len('sag', '처짐', 'Sag', 0.18, 0.05, 0.4),
    P.mat('glow', '빛 색', 'Light colour', 'light-warm', 'other'),
  ],
  tags: ['string lights', 'festoon', 'garland', '줄 조명', '가랜드 조명', '전구 줄', '알전구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, sag = p.sag, top = sag + 0.07, z = 0.045;
    const yAt = (x) => top - sag * (1 - (2 * x / W) ** 2);
    const pts = [];
    for (let i = 0; i <= 24; i++) { const x = -W / 2 + (W * i) / 24; pts.push([x, yAt(x), z]); }
    k.tube('cable', 'plastic-black', pts, 0.002, { segs: k.seg(80, 24), radial: 4 });
    for (const s of [-1, 1]) {
      k.cyl('hook', 'metal-steel', 0.004, 0.004, z, s * W / 2, top, 0, { rx: Math.PI / 2, segs: 6 });
      k.add('hook', 'metal-steel', new THREE.TorusGeometry(0.008, 0.0025, 4, k.seg(12, 6), Math.PI * 1.4).rotateZ(-Math.PI * 0.2).translate(s * W / 2, top - 0.008, z));
    }
    const n = p.bulbs;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W * (i + 0.5)) / n, y = yAt(x);
      k.cyl('socket', 'plastic-black', 0.009, 0.009, 0.024, x, y - 0.024, z, { segs: k.seg(10, 5) });
      k.sphere('bulb', p.glow, 0.022, x, y - 0.024 - 0.019, z, { segs: k.seg(14, 6), rings: k.seg(10, 5) });
      if (i % 3 === 1) k.light(x, y - 0.045, z, { intensity: 0.25, distance: 2.5 });
    }
    recentre(k);
    return k.group();
  },
});

/** Neon outline points in a unit box (x, y in −0.5 … 0.5); closed = loop. */
const NEON = {
  heart: { closed: true, pts: () => Array.from({ length: 40 }, (_, i) => { const t = (i / 40) * TAU; return [16 * Math.sin(t) ** 3 / 34, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 34 + 0.05]; }) },
  wave: { closed: false, pts: () => Array.from({ length: 33 }, (_, i) => { const x = -0.46 + (0.92 * i) / 32; return [x, 0.16 * Math.sin((x + 0.46) * 3 * TAU / 0.92 * 0.5)]; }) },
  moon: { closed: true, pts: () => { const o = []; for (let i = 0; i <= 20; i++) { const a = Math.PI * 0.25 + (Math.PI * 1.5 * i) / 20; o.push([0.45 * Math.cos(a) * 0.9, 0.45 * Math.sin(a)]); } for (let i = 19; i > 0; i--) { const a = Math.PI * 0.32 + (Math.PI * 1.36 * i) / 20; o.push([0.16 + 0.34 * Math.cos(a) * 0.9, 0.34 * Math.sin(a)]); } return o; } },
  star: { closed: true, pts: () => { const o = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.2 : 0.48; const b = Math.PI / 2 + ((i + 1) * Math.PI) / 5, r2 = (i + 1) % 2 ? 0.2 : 0.48; for (let s = 0; s < 4; s++) { const f = s / 4; o.push([lerp(r * Math.cos(a), r2 * Math.cos(b), f), lerp(r * Math.sin(a), r2 * Math.sin(b), f) - 0.03]); } } return o; } },
};

const neon = lamp({
  id: 'neon-sign-light', placement: 'wall', elevation: 1.5, ko: '네온 사인', en: 'Neon sign',
  params: [
    P.pick('shape', '모양', 'Shape', 'heart', [['heart', '하트', 'Heart'], ['wave', '물결', 'Wave'], ['moon', '달', 'Moon'], ['star', '별', 'Star']]),
    P.len('size', '크기', 'Size', 0.5, 0.3, 1.0),
    P.color('colour', '네온 색', 'Neon colour', '#ff4f8b'),
  ],
  tags: ['neon sign', 'led neon', 'wall art', '네온 사인', '네온 조명', '인테리어 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = NEON[p.shape] ?? NEON.heart, sz = p.size;
    const pts2 = S.pts().map(([x, y]) => [x * sz, y * sz]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts2) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const pad = 0.035, bw = x1 - x0 + 2 * pad, bh = y1 - y0 + 2 * pad, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const zb = 0.03, bt = 0.006;
    k.rbox('board', 'glass-clear', bw, bh, bt, 0.01, 0, bh / 2, zb, { segs: k.seg(3, 1) });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      k.cyl('standoff', 'metal-chrome', 0.007, 0.007, zb + bt / 2 + 0.003, sx * (bw / 2 - 0.02), bh / 2 + sy * (bh / 2 - 0.02), 0, { rx: Math.PI / 2, segs: k.seg(12, 6) });
    }
    const zt = zb + bt / 2 + 0.0065;
    const path = pts2.map(([x, y]) => [x - cx, y - cy + bh / 2, zt]);
    const glow = { overrides: { color: p.colour, emissive: p.colour } };
    k.tube('neon', 'light-warm', path, 0.006, { closed: S.closed, caps: !S.closed, segs: k.seg(160, 48), radial: k.seg(8, 5), ...glow });
    k.light(0, bh / 2, zt + 0.05, { intensity: 0.4, distance: 2.5, color: p.colour });
    recentre(k);
    return k.group();
  },
});

const pucks = lamp({
  id: 'under-cabinet-pucks', placement: 'wall', elevation: 1.44, ko: '하부장 퍽 조명', en: 'Under-cabinet puck lights',
  params: [
    P.int('count', '개수', 'Count', 3, 1, 6),
    P.len('spacing', '간격', 'Spacing', 0.4, 0.25, 0.6),
    P.mat('finish', '색', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['puck lights', 'under cabinet', 'kitchen light', '퍽 조명', '주방 하부등', '싱크대 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.count, s = p.spacing, zc = 0.15;
    const W = (n - 1) * s;
    k.cyl('cable', 'plastic-white', 0.0025, 0.0025, W + 0.1, -W / 2 - 0.05, 0.01, 0.008, { rz: -Math.PI / 2, segs: 5 });
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + i * s;
      k.lathe('puck', p.finish, [[0, 0.002], [0.03, 0.002], [0.035, 0.005], [0.035, 0.016], [0, 0.016]], x, 0, zc, { segs: k.seg(32, 10) });
      k.cyl('bulb', 'light-warm', 0.026, 0.026, 0.002, x, 0.0005, zc, { segs: k.seg(24, 8) });
      k.rod('cable', 'plastic-white', [x, 0.01, 0.008], [x, 0.01, zc - 0.034], 0.0025, { segs: 5 });
      k.light(x, -0.02, zc, { intensity: 0.4, distance: 2, type: 'spot', angle: 1.0 });
    }
    recentre(k);
    return k.group();
  },
});

const nightLight = lamp({
  id: 'night-light-plug', placement: 'wall', elevation: 0.3, ko: '콘센트 수면등', en: 'Plug-in night light',
  params: [
    P.pick('shape', '모양', 'Shape', 'round', [['round', '원형', 'Round'], ['square', '사각', 'Square']]),
    P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'),
  ],
  tags: ['night light', 'plug-in', 'nursery', '수면등', '취침등', '콘센트 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('body', p.body, 0.06, 0.08, 0.026, 0.01, 0, 0.04, 0.013, { segs: k.seg(4, 1) });
    if (p.shape === 'square') k.rbox('bulb', 'light-warm', 0.044, 0.044, 0.016, 0.008, 0, 0.034, 0.03, { segs: k.seg(4, 1) });
    else k.sphere('bulb', 'light-warm', 0.023, 0, 0.034, 0.026, { segs: k.seg(24, 8), rings: k.seg(12, 6), scale: [1, 1, 0.75] });
    k.cyl('sensor', 'plastic-black', 0.004, 0.004, 0.002, 0, 0.068, 0.0255, { rx: Math.PI / 2, segs: 8 });
    k.light(0, 0.034, 0.05, { intensity: 0.08, distance: 1.5, color: '#ffd9a0' });
    recentre(k);
    return k.group();
  },
});

/* =========================================================== variants */

const byId = (id) => base.find((e) => e.id === id);
const pendantBase = byId('pendant-light'), chandelierBase = byId('chandelier'), tableBase = byId('table-lamp');
const arcBase = byId('floor-lamp-arc'), flushBase = byId('ceiling-flush'), sconceBase = byId('wall-sconce');

const VARIANTS = [
  variant(pendantBase, 'globe-opal', '오팔 글로브 펜던트', 'Opal globe pendant', { style: 'globe', diameter: 0.3, shade: 'metal-brass' }, { tags: ['globe pendant', 'opal glass', '글로브 펜던트', '유리 구 조명'] }),
  variant(pendantBase, 'cone-white', '화이트 원뿔 펜던트', 'White cone pendant', { style: 'cone', diameter: 0.28, shade: 'metal-white', drop: 0.9 }, { tags: ['cone pendant', 'white', '원뿔 펜던트', '화이트 조명'] }),
  variant(pendantBase, 'bell-copper', '구리 벨 펜던트', 'Copper bell pendant', { style: 'bell', diameter: 0.34, shade: 'metal-copper' }, { tags: ['bell pendant', 'copper', '벨 펜던트', '구리 조명'] }),
  variant(chandelierBase, 'grand', '대형 골드 샹들리에', 'Grand gold chandelier', { arms: 12, diameter: 1.1, rod: 0.5, metal: 'metal-gold' }, { tags: ['grand chandelier', 'gold', '대형 샹들리에', '골드 샹들리에'] }),
  variant(tableBase, 'brass-empire', '브라스 엠파이어 테이블 램프', 'Brass empire table lamp', { base: 'brass', shadeStyle: 'empire', height: 0.65 }, { tags: ['empire shade', 'brass', '엠파이어 갓', '브라스 램프'] }),
  variant(arcBase, 'black', '블랙 아크 스탠드', 'Black arc floor lamp', { shade: 'metal-black', base: 'marble-black' }, { tags: ['black', 'arc lamp', '블랙 스탠드', '블랙 아크'] }),
  variant(flushBase, 'large', '대형 거실 방등', 'Large living-room ceiling light', { diameter: 0.65 }, { tags: ['large ceiling light', 'living room', '거실등', '대형 방등'] }),
  variant(sconceBase, 'cone-black', '블랙 원뿔 벽등', 'Black cone wall sconce', { style: 'cone', metal: 'metal-black' }, { tags: ['black sconce', 'cone', '블랙 벽등', '원뿔 벽등'] }),
  variant(trackLight, 'long-white', '화이트 롱 레일 조명', 'Long white track light', { length: 2.0, heads: 5, finish: 'metal-white' }, { tags: ['long track', 'white', '긴 레일', '화이트 레일등'] }),
  variant(linearPendant, 'brass', '브라스 라인 펜던트', 'Brass linear pendant', { length: 1.6, finish: 'metal-brass' }, { tags: ['brass', 'long pendant', '브라스 펜던트', '긴 식탁등'] }),
  variant(sputnik, 'large-gold', '대형 골드 스푸트니크', 'Large gold Sputnik', { arms: 24, diameter: 1.2, metal: 'metal-gold' }, { tags: ['large sputnik', 'gold', '대형 스푸트니크', '골드 샹들리에'] }),
  variant(stringLights, 'long', '긴 전구 가랜드', 'Long globe string lights', { width: 3.6, bulbs: 18, sag: 0.25 }, { tags: ['long string lights', 'patio', '긴 줄 조명', '테라스 조명'] }),
];

export const ITEMS = [
  trackLight, surfaceSpot, squareDownlight, ledPanel, semiFlush, ceilingFan,
  linearPendant, rattanPendant, cagePendant, edisonCluster, drumPendant, paperPendant, moroccan,
  sputnik, crystal, ringChandelier,
  torchiere, readingLamp, studioSpot, paperFloor, sphereFloor, hanjiLamp,
  mushroom, globeTable, bankers, lava, tiffany, ledDesk,
  swingArm, pictureLight, mirrorBar, wallLantern, candleSconce, stringLights, neon, pucks, nightLight,
  ...VARIANTS,
];
