// Lighting: pendants, chandelier, floor/table/desk lamps, ceiling, recessed, wall and strip lights.
// Every item marks its bulb(s) with the emissive 'light-warm' preset and adds a userData.light
// marker (Kit.light) where the scene builder should put the real light.
// Ceiling items follow the CONTRACT origin (bottom centre, min y = 0); `elevation` is the
// suggested height of that bottom above the floor for a 2.4 m ceiling.
import { THREE, Kit, item, P, clamp } from './helpers.js';

const CEILING = 2.4;

/**
 * Moves everything added to the kit so the bounding box is centred in x/z and sits on y = 0
 * (lamps whose reach makes them asymmetric are still centred on their footprint, per CONTRACT).
 */
export function recentre(k, { y = true } = {}) {
  const box = new THREE.Box3();
  for (const p of k.parts.values()) for (const g of p.geos) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const dx = -(box.min.x + box.max.x) / 2, dz = -(box.min.z + box.max.z) / 2, dy = y ? -box.min.y : 0;
  for (const p of k.parts.values()) for (const g of p.geos) g.translate(dx, dy, dz);
  for (const l of k.lights) { l.x += dx; l.y += dy; l.z += dz; }
  return { dx, dy, dz };
}

/** Ceiling canopy (rose) whose top is at y. */
export function canopy(k, y, r = 0.06, h = 0.025, mat = 'paint-white-matte') {
  k.lathe('canopy', mat, [[0, 0], [r * 0.82, 0], [r * 0.97, h * 0.25], [r, h * 0.7], [r, h], [0, h]], 0, y - h, 0, { segs: k.seg(32, 10) });
}

/** A bulb (globe shape + socket) hanging with its centre at (x, y, z). */
export function bulb(k, x, y, z, r = 0.03, { socket = 'metal-black', up = false } = {}) {
  k.sphere('bulb', 'light-warm', r, x, y, z, { segs: k.seg(18, 8), rings: k.seg(12, 5) });
  const s = up ? -1 : 1;
  k.cyl('socket', socket, 0.016, 0.016, 0.035, x, y + s * r * 0.75 - (up ? 0.035 : 0), z, { segs: k.seg(14, 6) });
}

/** Lathe profile helper: resamples [[r, y]] with a spline, then (optionally) reverses for an inner face. */
export const profileOf = (pts, n = 18) => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(n).map((v) => [Math.max(0, v.x), v.y]);

/* ------------------------------------------------------------- pendants */

const SHADES = {
  dome: (R, H) => [[R, 0], [R * 0.985, H * 0.12], [R * 0.86, H * 0.45], [R * 0.58, H * 0.8], [R * 0.22, H * 0.97], [0.03, H]],
  cone: (R, H) => [[R, 0], [R * 0.66, H * 0.34], [R * 0.33, H * 0.67], [0.03, H]],
  bell: (R, H) => [[R, 0], [R * 0.93, H * 0.06], [R * 0.62, H * 0.32], [R * 0.47, H * 0.7], [R * 0.32, H * 0.93], [0.03, H]],
};

/** Metal shade (outer) with a white inner face and a rolled rim; bottom at y. Returns its height. */
export function metalShade(k, style, R, y, mat) {
  const H = style === 'cone' ? R * 1.0 : style === 'bell' ? R * 1.05 : R * 0.62;
  const outer = profileOf(SHADES[style](R, H), k.seg(22, 8));
  k.lathe('shade', mat, outer, 0, y, 0, { segs: k.seg(48, 14) });
  // inner face: same curve 2 mm in, ordered top → bottom so it faces the axis
  const inner = outer.map(([r, yy]) => [Math.max(0, r - 0.002), yy - 0.001]).reverse();
  k.lathe('shade-inner', 'paint-white-matte', inner, 0, y, 0, { segs: k.seg(48, 14) });
  k.add('shade', mat, new THREE.TorusGeometry(R - 0.001, 0.0018, k.seg(6, 3), k.seg(64, 16)).rotateX(Math.PI / 2).translate(0, y + 0.0005, 0));
  // neck cap
  k.cyl('shade', mat, 0.022, 0.03, 0.04, 0, y + H - 0.005, 0, { segs: k.seg(20, 8) });
  return H + 0.035;
}

const pendant = item({
  id: 'pendant-light', category: 'lighting', placement: 'ceiling', ko: '펜던트 조명', en: 'Pendant light', size: [0.4, 0.985, 0.4], elevation: CEILING - 0.985,
  params: [
    P.pick('style', '모양', 'Style', 'dome', [['dome', '돔', 'Dome'], ['globe', '글로브', 'Globe'], ['cone', '원뿔', 'Cone'], ['bell', '벨', 'Bell']]),
    P.len('diameter', '지름', 'Diameter', 0.4, 0.15, 0.8),
    P.len('drop', '줄 길이', 'Cord length', 0.8, 0.2, 2.0),
    P.mat('shade', '갓 재질', 'Shade', 'metal-black', 'metal'),
  ],
  tags: ['pendant', 'pendant light', 'hanging lamp', '펜던트', '펜던트 조명', '식탁 조명', 'dome'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2;
    let shadeH, bulbY;
    if (p.style === 'globe') {
      // opal glass globe with a metal gallery at the top
      k.sphere('globe', 'glass-frosted', R, 0, R, 0, { segs: k.seg(40, 12), rings: k.seg(28, 8) });
      const capR = Math.max(0.03, R * 0.32);
      k.lathe('shade', p.shade, [[0, 0], [capR, 0], [capR, 0.012], [capR * 0.7, 0.03], [0.012, 0.05], [0, 0.05]], 0, 2 * R - 0.012, 0, { segs: k.seg(28, 10) });
      shadeH = 2 * R + 0.035;
      bulbY = R;
    } else {
      shadeH = metalShade(k, p.style, R, 0, p.shade);
      bulbY = Math.min(shadeH * 0.5, 0.09);
    }
    bulb(k, 0, bulbY, 0, Math.min(0.035, R * 0.35));
    const top = shadeH + p.drop + 0.025;
    k.cyl('cord', 'plastic-black', 0.003, 0.003, top - 0.02 - shadeH + 0.01, 0, shadeH - 0.01, 0, { segs: 6 });
    canopy(k, top, 0.06, 0.025, p.shade);
    k.light(0, bulbY, 0, { intensity: 1.2, distance: 6 });
    return k.group();
  },
});

const pendantCluster = item({
  id: 'pendant-cluster', category: 'lighting', placement: 'ceiling', ko: '클러스터 펜던트', en: 'Cluster pendant', size: [0.43, 1.11, 0.44], elevation: CEILING - 1.11,
  params: [
    P.int('count', '전구 수', 'Globes', 5, 3, 9),
    P.len('drop', '최대 길이', 'Max drop', 1.0, 0.5, 2.0),
    P.mat('glass', '유리', 'Glass', 'glass-tinted', 'glass'),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['cluster pendant', 'globe pendant', 'chandelier', '클러스터 조명', '유리 구 펜던트', '샹들리에'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.count, drop = p.drop;
    // globes at varying heights on a spiral; the lowest one defines y = 0
    const globes = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996; // golden angle: an even, non-grid arrangement
      const rad = 0.06 + 0.13 * Math.sqrt((i + 0.5) / n);
      const r = 0.065 + 0.025 * ((i * 7) % 3) / 2;
      const len = drop * (0.5 + 0.5 * ((i * 0.618034 + 0.3) % 1));
      globes.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, r, len });
    }
    const top = drop + 0.03;
    for (const g of globes) {
      const cy = top - g.len - g.r; // globe centre
      k.sphere('globe', p.glass, g.r, g.x, cy, g.z, { segs: k.seg(28, 10), rings: k.seg(20, 7) });
      k.cyl('cap', p.metal, 0.018, 0.024, 0.03, g.x, cy + g.r - 0.008, g.z, { segs: k.seg(16, 6) });
      k.cyl('cord', 'plastic-black', 0.002, 0.002, top - (cy + g.r + 0.02) - 0.02, g.x, cy + g.r + 0.02, g.z, { segs: 5 });
      // filament bulb: small elongated glow
      k.sphere('bulb', 'light-warm', 0.022, g.x, cy, g.z, { segs: k.seg(14, 6), rings: k.seg(10, 4), scale: [1, 1.4, 1] });
    }
    // round canopy plate
    k.cyl('cap', p.metal, 0.17, 0.17, 0.018, 0, top - 0.018, 0, { segs: k.seg(40, 12) });
    k.cyl('cap', p.metal, 0.16, 0.172, 0.012, 0, top - 0.03, 0, { segs: k.seg(40, 12) });
    k.light(0, top - drop * 0.75, 0, { intensity: 1.6, distance: 7 });
    recentre(k);
    return k.group();
  },
});

/* ----------------------------------------------------------- chandelier */

const chandelier = item({
  id: 'chandelier', category: 'lighting', placement: 'ceiling', ko: '샹들리에', en: 'Chandelier', size: [0.8, 0.69, 0.8], elevation: CEILING - 0.69,
  params: [
    P.int('arms', '팔 수', 'Arms', 8, 4, 12),
    P.len('diameter', '지름', 'Diameter', 0.8, 0.5, 1.4),
    P.len('rod', '봉 길이', 'Rod length', 0.35, 0.1, 1.2),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['chandelier', 'candle chandelier', '샹들리에', '촛대 조명', 'classic light'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2 - 0.035;
    const armY = 0.11; // height of the candle cups
    // central body: turned column with a bowl at the bottom
    const bodyH = 0.3;
    k.lathe('metal', p.metal, profileOf([[0, 0], [0.025, 0.002], [0.05, 0.03], [0.065, 0.07], [0.04, 0.1], [0.022, 0.14], [0.03, 0.19], [0.016, 0.24], [0.02, 0.29], [0.012, bodyH]], k.seg(30, 10)), 0, 0, 0, { segs: k.seg(32, 10) });
    // S-shaped arms from the bowl out to the cups
    for (let i = 0; i < p.arms; i++) {
      const a = (i / p.arms) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const pts = [[0.05, 0.075], [R * 0.35, 0.03], [R * 0.7, 0.025], [R * 0.95, 0.06], [R, armY - 0.005]].map(([r, y]) => [c * r, y, s * r]);
      k.tube('metal', p.metal, pts, 0.0065, { segs: k.seg(26, 8), radial: k.seg(8, 4) });
      const x = c * R, z = s * R;
      // drip cup, candle sleeve, flame bulb
      k.lathe('metal', p.metal, [[0, 0], [0.012, 0], [0.03, 0.012], [0.032, 0.016], [0.016, 0.014], [0, 0.014]], x, armY - 0.012, z, { segs: k.seg(20, 8) });
      k.cyl('sleeve', 'paint-white-gloss', 0.011, 0.011, 0.075, x, armY, z, { segs: k.seg(14, 6) });
      k.lathe('bulb', 'light-warm', [[0, 0], [0.009, 0.006], [0.012, 0.016], [0.008, 0.03], [0, 0.04]], x, armY + 0.075, z, { segs: k.seg(12, 6) });
    }
    // rod and canopy
    const top = bodyH + p.rod + 0.035;
    k.cyl('metal', p.metal, 0.008, 0.008, top - bodyH - 0.03, 0, bodyH - 0.005, 0, { segs: k.seg(12, 6) });
    canopy(k, top, 0.065, 0.035, p.metal);
    k.light(0, armY + 0.1, 0, { intensity: 2.2, distance: 8 });
    recentre(k);
    return k.group();
  },
});

/* ---------------------------------------------------------- floor lamps */

const arcLamp = item({
  id: 'floor-lamp-arc', category: 'lighting', ko: '아크 플로어 스탠드', en: 'Arc floor lamp', size: [1.78, 2.1, 0.4],
  params: [
    P.len('reach', '뻗는 길이', 'Reach', 1.4, 0.9, 2.0),
    P.len('height', '높이', 'Height', 2.1, 1.7, 2.4),
    P.mat('shade', '갓', 'Shade', 'metal-steel', 'metal'),
    P.mat('base', '받침', 'Base', 'marble-white', 'stone'),
  ],
  tags: ['arc lamp', 'floor lamp', '아크 스탠드', '플로어 스탠드', '장스탠드', 'reading lamp'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, X = p.reach, R = 0.19;
    // heavy stone block base with chamfered edges
    k.rbox('base', p.base, 0.36, 0.13, 0.24, 0.012, 0, 0.065, 0, { segs: k.seg(3, 1) });
    // the arc: rises from the base, sweeps over and ends above the shade
    const shadeTop = H - 0.29;
    const pts = [[0, 0.12, 0], [0, 0.6, 0], [0.04, H * 0.62, 0], [X * 0.2, H * 0.88, 0], [X * 0.55, H - 0.01, 0], [X * 0.85, H - 0.06, 0], [X, shadeTop + 0.1, 0], [X, shadeTop + 0.02, 0]];
    k.tube('arc', 'metal-steel', pts, 0.011, { segs: k.seg(90, 24), radial: k.seg(12, 6) });
    k.cyl('arc', 'metal-steel', 0.02, 0.02, 0.02, 0, 0.125, 0, { segs: k.seg(16, 6) });
    metalShade(k, 'dome', R, shadeTop - R * 0.62, p.shade);
    const by = shadeTop - R * 0.62 + 0.07;
    transformLast(k, X);
    bulb(k, X, by, 0, 0.032);
    k.light(X, by, 0, { intensity: 1.2, distance: 5, type: 'spot', angle: 1.0 });
    recentre(k);
    return k.group();
  },
});

/** metalShade builds at x = 0: shift the shade parts (the last geometries of their roles) to x. */
function transformLast(k, x) {
  for (const part of k.parts.values()) {
    if (part.role === 'shade') part.geos.forEach((g) => g.translate(x, 0, 0));
    if (part.role === 'shade-inner') part.geos.forEach((g) => g.translate(x, 0, 0));
  }
}

const tripodLamp = item({
  id: 'floor-lamp-tripod', category: 'lighting', ko: '삼각대 플로어 스탠드', en: 'Tripod floor lamp', size: [0.55, 1.58, 0.56],
  params: [
    P.len('height', '높이', 'Height', 1.58, 1.3, 1.8),
    P.mat('wood', '다리', 'Legs', 'wood-walnut', 'wood'),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
  ],
  tags: ['tripod lamp', 'floor lamp', '삼각대 스탠드', '플로어 스탠드', '장스탠드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, shadeH = 0.32, shadeR = 0.24;
    const hub = H - shadeH - 0.2;
    const footR = 0.3;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const foot = [Math.cos(a) * footR, 0, Math.sin(a) * footR];
      k.rod('legs', p.wood, foot, [Math.cos(a) * 0.025, hub, Math.sin(a) * 0.025], 0.013, { r2: 0.016, segs: k.seg(14, 6) });
      k.cyl('legs', 'metal-brass', 0.015, 0.014, 0.012, foot[0] * 0.995, 0, foot[2] * 0.995, { segs: k.seg(12, 6) });
    }
    k.lathe('hub', 'metal-brass', [[0, 0], [0.03, 0], [0.034, 0.02], [0.03, 0.05], [0.012, 0.06], [0, 0.06]], 0, hub - 0.04, 0, { segs: k.seg(20, 8) });
    const sy = H - shadeH;
    k.cyl('hub', 'metal-brass', 0.008, 0.008, sy + 0.08 - hub, 0, hub + 0.02, 0, { segs: k.seg(10, 5) });
    // drum shade (double-sided fabric) with thin rims
    k.cyl('shade', p.shade, shadeR, shadeR, shadeH, 0, sy, 0, { open: true, segs: k.seg(48, 14) });
    for (const y of [sy + 0.002, sy + shadeH - 0.002]) k.add('hub', 'metal-brass', new THREE.TorusGeometry(shadeR, 0.002, 4, k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, y, 0));
    bulb(k, 0, sy + 0.13, 0, 0.032, { socket: 'metal-brass' });
    k.light(0, sy + 0.13, 0, { intensity: 1, distance: 5 });
    recentre(k);
    return k.group();
  },
});

/* ---------------------------------------------------------- table lamps */

const tableLamp = item({
  id: 'table-lamp', category: 'lighting', placement: 'surface', ko: '테이블 램프', en: 'Table lamp', size: [0.36, 0.6, 0.36],
  params: [
    P.pick('base', '받침', 'Base', 'jar', [['jar', '도자기 항아리', 'Ceramic jar'], ['cylinder', '원통', 'Cylinder'], ['brass', '금속 스템', 'Brass stem']]),
    P.pick('shadeStyle', '갓 모양', 'Shade style', 'drum', [['drum', '드럼', 'Drum'], ['empire', '엠파이어', 'Empire']]),
    P.mat('ceramic', '받침 재질', 'Base finish', 'ceramic-matte', 'ceramic'),
    P.mat('shade', '갓', 'Shade', 'lampshade', 'other'),
    P.len('height', '높이', 'Height', 0.6, 0.4, 0.8),
  ],
  tags: ['table lamp', 'bedside lamp', '테이블 램프', '탁상 조명', '수면등', 'lampshade'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 0.6;
    const baseH = 0.33 * s;
    if (p.base === 'jar') {
      k.lathe('base', p.ceramic, profileOf([[0, 0], [0.06 * s, 0], [0.065 * s, 0.01 * s], [0.1 * s, 0.07 * s], [0.115 * s, 0.15 * s], [0.1 * s, 0.24 * s], [0.055 * s, 0.3 * s], [0.04 * s, 0.31 * s], [0.04 * s, baseH], [0, baseH]], k.seg(28, 10)), 0, 0, 0, { segs: k.seg(40, 12) });
    } else if (p.base === 'cylinder') {
      k.lathe('base', p.ceramic, [[0, 0], [0.072 * s, 0], [0.075 * s, 0.006], [0.075 * s, baseH - 0.012], [0.07 * s, baseH], [0, baseH]], 0, 0, 0, { segs: k.seg(40, 12) });
    } else {
      k.lathe('base', 'metal-brass', [[0, 0], [0.09 * s, 0], [0.092 * s, 0.008], [0.085 * s, 0.018], [0.012, 0.03], [0.009, 0.04], [0.009, baseH], [0, baseH]], 0, 0, 0, { segs: k.seg(36, 12) });
    }
    // socket, harp and finial
    const shadeH = 0.24 * s, sb = H - shadeH - 0.01;
    k.cyl('fittings', 'metal-brass', 0.015, 0.018, sb + 0.09 * s - baseH, 0, baseH, 0, { segs: k.seg(14, 6) });
    const top = H - 0.004;
    for (const a of [0, Math.PI]) k.tube('fittings', 'metal-brass', [[Math.cos(a) * 0.03, sb + 0.06 * s, Math.sin(a) * 0.03], [Math.cos(a) * 0.045, sb + 0.15 * s, Math.sin(a) * 0.045], [Math.cos(a) * 0.01, top - 0.01, Math.sin(a) * 0.01]], 0.0022, { segs: k.seg(14, 6), radial: 5 });
    k.sphere('fittings', 'metal-brass', 0.009, 0, top - 0.004, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const rb = (p.shadeStyle === 'drum' ? 0.18 : 0.19) * s, rt = (p.shadeStyle === 'drum' ? 0.18 : 0.11) * s;
    k.cyl('shade', p.shade, rt, rb, shadeH, 0, sb, 0, { open: true, segs: k.seg(48, 14) });
    k.add('fittings', 'metal-brass', new THREE.TorusGeometry(rb, 0.002, 4, k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, sb + 0.002, 0));
    k.add('fittings', 'metal-brass', new THREE.TorusGeometry(rt, 0.002, 4, k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, sb + shadeH - 0.002, 0));
    bulb(k, 0, sb + 0.09 * s + 0.03, 0, 0.028, { socket: 'metal-brass', up: true });
    k.light(0, sb + 0.12 * s, 0, { intensity: 0.6, distance: 4 });
    recentre(k);
    return k.group();
  },
});

const deskLamp = item({
  id: 'desk-lamp', category: 'lighting', placement: 'surface', ko: '데스크 스탠드', en: 'Desk lamp', size: [0.17, 0.34, 0.45],
  params: [
    P.mat('metal', '색', 'Finish', 'metal-black', 'metal'),
    P.num('angle', '팔 각도', 'Arm angle', 0.5, 0, 1, 0.05),
  ],
  tags: ['desk lamp', 'task lamp', 'architect lamp', '데스크 스탠드', '스탠드', '책상 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal;
    // weighted round base with a pivot block (arm folds forward along +z)
    k.lathe('lamp', m, [[0, 0], [0.085, 0], [0.087, 0.006], [0.082, 0.018], [0.03, 0.024], [0, 0.024]], 0, 0, -0.16, { segs: k.seg(36, 10) });
    k.box('lamp', m, 0.04, 0.04, 0.03, 0, 0.044, -0.16, { r: 0.006, segs: 2 });
    const t = clamp(p.angle, 0, 1);
    const a1 = THREE.MathUtils.lerp(0.25, 0.6, t); // lower arm lean from vertical (towards −z then forward)
    const L1 = 0.3, L2 = 0.3;
    const j0 = new THREE.Vector3(0, 0.055, -0.16);
    const j1 = j0.clone().add(new THREE.Vector3(0, Math.cos(a1) * L1, -Math.sin(a1) * L1 * 0.4 + Math.sin(a1) * L1 * 0.2));
    const a2 = THREE.MathUtils.lerp(1.25, 0.95, t);
    const j2 = j1.clone().add(new THREE.Vector3(0, -Math.cos(a2) * L2 * 0.25, Math.sin(a2) * L2));
    // paired rods (parallelogram arms) and springs drawn as thin rods
    for (const sx of [-0.012, 0.012]) {
      k.rod('lamp', m, [sx, j0.y, j0.z], [sx, j1.y, j1.z], 0.004, { segs: k.seg(10, 5) });
      k.rod('lamp', m, [sx, j1.y, j1.z], [sx, j2.y, j2.z], 0.004, { segs: k.seg(10, 5) });
    }
    k.rod('spring', 'metal-chrome', [0.02, j0.y + 0.03, j0.z], [0.02, j1.y - 0.05, j1.z], 0.003, { segs: 6 });
    for (const j of [j0, j1]) k.cyl('lamp', m, 0.012, 0.012, 0.04, -0.02, j.y, j.z, { rz: -Math.PI / 2, segs: k.seg(14, 6) });
    // head: cone shade aimed down and forward
    const hx = 0, hy = j2.y, hz = j2.z;
    const tilt = -0.55; // negative X rotation swings the opening forward (+z)
    const R = 0.065, Hs = 0.12;
    const outer = profileOf([[R, 0], [R * 0.9, Hs * 0.15], [R * 0.55, Hs * 0.6], [0.025, Hs * 0.92], [0.02, Hs]], k.seg(14, 6));
    k.lathe('head', m, outer, hx, hy - Hs, hz, { segs: k.seg(36, 10) });
    k.lathe('head-inner', 'paint-white-matte', outer.map(([r, y]) => [Math.max(0, r - 0.0015), y - 0.001]).reverse(), hx, hy - Hs, hz, { segs: k.seg(36, 10) });
    // tilt the head geometry about the joint (last two geometries of the lamp roles)
    const pivot = new THREE.Vector3(hx, hy, hz);
    const rot = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationX(tilt)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    for (const part of k.parts.values()) if (part.role === 'head' || part.role === 'head-inner') part.geos[part.geos.length - 1].applyMatrix4(rot);
    const bulbPos = new THREE.Vector3(hx, hy - Hs * 0.55, hz).applyMatrix4(rot);
    k.sphere('bulb', 'light-warm', 0.025, bulbPos.x, bulbPos.y, bulbPos.z, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    k.light(bulbPos.x, bulbPos.y - 0.02, bulbPos.z, { intensity: 0.6, distance: 3, type: 'spot', angle: 0.8 });
    recentre(k);
    return k.group();
  },
});

/* ------------------------------------------------- ceiling and recessed */

const flushLight = item({
  id: 'ceiling-flush', category: 'lighting', placement: 'ceiling', ko: '천장등(직부등)', en: 'Ceiling flush light', size: [0.42, 0.1, 0.42], elevation: CEILING - 0.1,
  params: [
    P.len('diameter', '지름', 'Diameter', 0.42, 0.2, 0.8),
    P.mat('rim', '테두리', 'Rim', 'metal-white', 'metal'),
  ],
  tags: ['ceiling light', 'flush mount', '천장등', '직부등', '방등', 'LED 방등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = 0.1;
    // base pan at the ceiling
    k.lathe('rim', p.rim, [[0, H - 0.03], [R * 0.96, H - 0.03], [R, H - 0.022], [R, H], [0, H]], 0, 0, 0, { segs: k.seg(48, 14) });
    // opal dome diffuser
    const dome = profileOf([[0, 0], [R * 0.55, 0.006], [R * 0.85, 0.025], [R * 0.97, 0.055], [R * 0.975, H - 0.03]], k.seg(16, 6));
    k.lathe('diffuser', 'glass-frosted', dome, 0, 0, 0, { segs: k.seg(48, 14) });
    // glowing LED board behind the diffuser
    k.cyl('bulb', 'light-warm', R * 0.75, R * 0.75, 0.004, 0, H - 0.036, 0, { segs: k.seg(40, 12) });
    k.light(0, 0.03, 0, { intensity: 1.4, distance: 7 });
    return k.group();
  },
});

const downlight = item({
  id: 'downlight', category: 'lighting', placement: 'ceiling', ko: '매입 다운라이트', en: 'Recessed downlight', size: [0.12, 0.1, 0.12], elevation: CEILING - 0.006,
  params: [
    P.len('diameter', '지름', 'Diameter', 0.12, 0.06, 0.25),
    P.mat('trim', '테두리', 'Trim', 'metal-white', 'metal'),
  ],
  tags: ['downlight', 'recessed light', 'spot', '다운라이트', '매입등', '매입 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2;
    // trim ring sits 6 mm below the ceiling; the housing hides above it
    k.lathe('trim', p.trim, [[R * 0.78, 0.006], [R * 0.8, 0], [R * 0.99, 0], [R, 0.004], [R, 0.006]], 0, 0, 0, { segs: k.seg(40, 12) });
    k.lathe('reflector', 'metal-aluminium', [[R * 0.6, 0.045], [R * 0.79, 0.006]].map(([r, y]) => [r, y]), 0, 0, 0, { segs: k.seg(40, 12) });
    k.cyl('bulb', 'light-warm', R * 0.6, R * 0.6, 0.003, 0, 0.044, 0, { segs: k.seg(28, 10) });
    k.cyl('housing', 'metal-steel', R * 0.85, R * 0.85, 0.05, 0, 0.048, 0, { segs: k.seg(24, 8) });
    // heat-sink fins on top
    const fins = k.hi ? 8 : 4;
    for (let i = 0; i < fins; i++) k.box('housing', 'metal-steel', R * 1.4, 0.03, 0.003, 0, 0.098 - 0.015, 0, { r: 0, ry: (i / fins) * Math.PI });
    k.light(0, 0.03, 0, { intensity: 0.8, distance: 5, type: 'spot', angle: 0.7 });
    return k.group();
  },
});

/* ---------------------------------------------------------- wall lights */

const sconce = item({
  id: 'wall-sconce', category: 'lighting', placement: 'wall', elevation: 1.65, ko: '벽 조명', en: 'Wall sconce', size: [0.14, 0.17, 0.2],
  params: [
    P.pick('style', '모양', 'Style', 'globe', [['globe', '글로브', 'Globe'], ['updown', '업다운 원통', 'Up/down cylinder'], ['cone', '원뿔 갓', 'Cone shade']]),
    P.mat('metal', '금속', 'Metal', 'metal-brass', 'metal'),
  ],
  tags: ['wall sconce', 'wall light', '벽등', '벽 조명', '브라켓', 'bracket lamp'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const zb = -0.1; // wall side
    // round back plate
    k.cyl('metal', p.metal, 0.055, 0.058, 0.014, 0, 0.11, zb, { rx: Math.PI / 2, segs: k.seg(32, 10) });
    if (p.style === 'updown') {
      k.box('metal', p.metal, 0.02, 0.02, 0.05, 0, 0.11, zb + 0.039, { r: 0.004 });
      k.cyl('metal', p.metal, 0.05, 0.05, 0.22, 0, 0, zb + 0.11, { open: true, segs: k.seg(32, 10) });
      k.cyl('shade-inner', 'paint-white-matte', 0.0485, 0.0485, 0.22, 0, 0, zb + 0.11, { open: true, segs: k.seg(32, 10) });
      for (const y of [0.012, 0.205]) k.cyl('bulb', 'light-warm', 0.044, 0.044, 0.003, 0, y, zb + 0.11, { segs: k.seg(24, 8) });
      k.light(0, 0.11, zb + 0.11, { intensity: 0.5, distance: 3 });
    } else {
      // curved arm out of the wall
      k.tube('metal', p.metal, [[0, 0.11, zb + 0.007], [0, 0.11, zb + 0.06], [0, 0.07, zb + 0.12], [0, 0.04, zb + 0.13]], 0.007, { segs: k.seg(18, 6), radial: k.seg(8, 4) });
      if (p.style === 'globe') {
        // holder cup carries the opal globe from below
        k.cyl('metal', p.metal, 0.028, 0.02, 0.025, 0, 0.022, zb + 0.13, { segs: k.seg(18, 6) });
        k.sphere('globe', 'glass-frosted', 0.07, 0, 0.11, zb + 0.13, { segs: k.seg(32, 10), rings: k.seg(22, 8) });
        k.sphere('bulb', 'light-warm', 0.025, 0, 0.11, zb + 0.13, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
        k.light(0, 0.11, zb + 0.13, { intensity: 0.5, distance: 3 });
      } else {
        const R = 0.07;
        const outer = profileOf([[R, 0], [R * 0.6, 0.05], [0.02, 0.1]], 8);
        k.lathe('metal', p.metal, outer, 0, 0.13, zb + 0.13, { segs: k.seg(32, 10), rx: Math.PI });
        k.lathe('shade-inner', 'paint-white-matte', outer.map(([r, y]) => [r - 0.0015, y]).reverse(), 0, 0.13, zb + 0.13, { segs: k.seg(32, 10), rx: Math.PI });
        k.sphere('bulb', 'light-warm', 0.022, 0, 0.09, zb + 0.13, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
        k.light(0, 0.1, zb + 0.13, { intensity: 0.5, distance: 3 });
      }
    }
    recentre(k);
    return k.group();
  },
});

const ledStrip = item({
  id: 'led-strip', category: 'lighting', placement: 'wall', elevation: 2.3, ko: 'LED 라인 조명', en: 'LED strip light', size: [1.2, 0.016, 0.02],
  params: [
    P.len('length', '길이', 'Length', 1.2, 0.3, 6),
    P.mat('profile', '프로파일', 'Profile', 'metal-aluminium', 'metal'),
  ],
  tags: ['led strip', 'led bar', 'cove light', 'LED 바', '라인 조명', '간접 조명', '간접등'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length;
    // aluminium U channel with an opal diffuser and end caps
    k.box('profile', p.profile, L, 0.003, 0.02, 0, 0.0015, 0, { r: 0 });
    for (const s of [-1, 1]) k.box('profile', p.profile, L, 0.016, 0.0025, 0, 0.008, s * 0.00875, { r: 0 });
    k.box('bulb', 'light-warm', L - 0.01, 0.006, 0.0155, 0, 0.011, 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('profile', 'plastic-grey', 0.004, 0.016, 0.02, s * (L / 2 - 0.002), 0.008, 0, { r: 0.0008 });
    const n = Math.max(1, Math.round(L / 0.6));
    for (let i = 0; i < n; i++) k.light(-L / 2 + (L / n) * (i + 0.5), 0.02, 0, { intensity: 0.3, distance: 2.5 });
    return k.group();
  },
});

export const ITEMS = [pendant, pendantCluster, chandelier, arcLamp, tripodLamp, tableLamp, deskLamp, flushLight, downlight, sconce, ledStrip];
