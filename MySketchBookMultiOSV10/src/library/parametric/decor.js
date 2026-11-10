// Decor: vases with stems, books, bowls, candles, clock, frames, pillows, throws, trays, sculptures.
import { THREE, Kit, item, P, rng, boxUV, pillowGeo, frameShape, roundRect, ellipse, superEllipse, leafGeo, placeLeaf, softBoxGeo, T } from './helpers.js';
import { addBooks } from './living.js';
import { recentre } from './lighting.js';

/** Runs fn(k) and applies `matrix` to the geometry it added (tilted sub-assemblies). */
function applyAdded(k, fn, matrix) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  const lightsBefore = k.lights.length;
  fn(k);
  for (const [key, p] of k.parts) for (let i = before.get(key) ?? 0; i < p.geos.length; i++) { p.geos[i].applyMatrix4(matrix); boxUV(p.geos[i]); }
  for (let i = lightsBefore; i < k.lights.length; i++) {
    const l = k.lights[i];
    const v = new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(matrix);
    Object.assign(l, { x: v.x, y: v.y, z: v.z });
  }
}

const spline = (pts, n) => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(n).map((v) => [Math.max(0, v.x), v.y]);

/** Geometry built along +y, re-aimed along `dir` and moved to `at`. */
function aim(geo, at, dir) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  geo.applyQuaternion(q);
  geo.translate(at.x, at.y, at.z);
  return geo;
}

/* ---------------------------------------------------------------- vases */

const vase = item({
  id: 'vase-stems', category: 'decor', placement: 'surface', ko: '꽃병과 가지', en: 'Vase with stems', size: [0.48, 0.62, 0.42],
  // stems are organic: low quality drops some leaves, so the spread varies a little
  bboxSlack: [0.04, 0.02, 0.04],
  params: [
    P.pick('stems', '가지', 'Stems', 'eucalyptus', [['eucalyptus', '유칼립투스', 'Eucalyptus'], ['tulips', '튤립', 'Tulips'], ['pampas', '팜파스', 'Pampas grass'], ['none', '없음', 'None']]),
    P.pick('shape', '꽃병 모양', 'Vase shape', 'bottle', [['bottle', '병', 'Bottle'], ['amphora', '항아리', 'Amphora'], ['cylinder', '원통', 'Cylinder']]),
    P.mat('ceramic', '꽃병 재질', 'Vase finish', 'ceramic-matte', 'ceramic'),
    P.len('height', '꽃병 높이', 'Vase height', 0.3, 0.15, 0.6),
  ],
  tags: ['vase', 'flowers', 'eucalyptus', 'tulip', 'pampas', '꽃병', '화병', '꽃', '유칼립투스', '튤립'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 0.3;
    const outer = p.shape === 'amphora'
      ? [[0.045, 0], [0.07, 0.03], [0.1, 0.1], [0.095, 0.17], [0.06, 0.24], [0.045, 0.285]]
      : p.shape === 'cylinder'
        ? [[0.06, 0], [0.062, 0.05], [0.062, 0.15], [0.062, 0.25], [0.062, 0.295]]
        : [[0.05, 0], [0.072, 0.04], [0.078, 0.11], [0.06, 0.19], [0.032, 0.245], [0.028, 0.285]];
    const out = spline(outer.map(([r, y]) => [r * s, y * s]), k.seg(22, 8));
    const neck = out[out.length - 1][0];
    // closed profile: foot, body, rolled lip, inside of the neck
    const prof = [[0, 0], [out[0][0] - 0.004, 0], ...out, [neck + 0.003, H - 0.003], [neck, H], [neck - 0.005, H - 0.002], [neck - 0.006, H - 0.05], [0, H - 0.05]];
    k.lathe('vase', p.ceramic, prof, 0, 0, 0, { segs: k.seg(40, 12) });
    const rand = rng(H * 31 + p.stems.length);
    const top = new THREE.Vector3(0, H - 0.01, 0);
    if (p.stems === 'eucalyptus') {
      const leafMat = { overrides: { color: '#7f9c8f' } };
      for (let i = 0; i < 6; i++) {
        const a = i * 2.4 + rand() * 0.5, lean = 0.25 + rand() * 0.45, len = 0.32 + rand() * 0.16;
        const pts = [];
        for (let j = 0; j <= 5; j++) {
          const t = j / 5, r = Math.sin(lean) * len * t * (0.6 + 0.4 * t), y = H - 0.06 + Math.cos(lean) * len * t - 0.06 * t * t * lean;
          pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
        }
        const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
        k.tube('stems', 'plant-stem', null, 0.0018, { curve, segs: k.seg(16, 5), radial: 4 });
        // pairs of round leaves along the stem, shrinking towards the tip
        const pairs = k.hi ? 9 : 5;
        for (let j = 1; j <= pairs; j++) {
          const t = 0.18 + 0.82 * (j / pairs);
          const at = curve.getPointAt(t), tan = curve.getTangentAt(t);
          const yaw = Math.atan2(tan.x, tan.z);
          const sz = 0.045 * (1.15 - 0.55 * t);
          for (const side of [-1, 1]) {
            const g = leafGeo(sz, sz * 0.9, { nu: k.hi ? 3 : 2, nv: k.hi ? 4 : 2, droop: 0.15, fold: 0.1, outline: (u) => Math.sin(Math.PI * Math.min(1, u)) ** 0.55 });
            k.add('leaves', 'plant-leaf', placeLeaf(g, [at.x, at.y, at.z], yaw + side * (Math.PI / 2 + 0.3 * rand()), 0.15 + 0.3 * rand(), side * 0.3), leafMat);
          }
        }
      }
    } else if (p.stems === 'tulips') {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4 + rand() * 0.4, lean = 0.08 + rand() * 0.35, len = 0.26 + rand() * 0.12;
        const pts = [[0, H - 0.05, 0], [Math.cos(a) * 0.02, H + len * 0.4, Math.sin(a) * 0.02], [Math.cos(a) * Math.sin(lean) * len * 0.8, H + len * 0.85, Math.sin(a) * Math.sin(lean) * len * 0.8], [Math.cos(a) * Math.sin(lean) * len * 1.15, H + len * 0.95 - lean * 0.08, Math.sin(a) * Math.sin(lean) * len * 1.15]];
        const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
        k.tube('stems', 'plant-leaf', null, 0.0028, { curve, segs: k.seg(14, 5), radial: 5, overrides: { color: '#5d8a46' } });
        const end = curve.getPointAt(1), dir = curve.getTangentAt(1);
        const head = new THREE.LatheGeometry(spline([[0, 0], [0.012, 0.004], [0.021, 0.02], [0.021, 0.036], [0.016, 0.05], [0.012, 0.054]], 8).map(([r, y]) => new THREE.Vector2(r, y)), k.seg(14, 6));
        k.add('flowers', 'plant-leaf', aim(head, end, dir), { overrides: { color: i % 3 === 2 ? '#f0e2d0' : '#d9526a' } });
        if (i % 2 === 0) {
          const g = leafGeo(0.16, 0.035, { nu: 2, nv: k.hi ? 6 : 3, droop: 0.4, fold: 0.5 });
          k.add('stems', 'plant-leaf', placeLeaf(g, [Math.cos(a) * 0.01, H - 0.02, Math.sin(a) * 0.01], a + Math.PI / 2, 1.0, 0), { overrides: { color: '#5d8a46' } });
        }
      }
    } else if (p.stems === 'pampas') {
      for (let i = 0; i < 6; i++) {
        const a = i * 2.4 + rand() * 0.5, lean = 0.12 + rand() * 0.4, len = 0.4 + rand() * 0.15;
        const end = new THREE.Vector3(Math.cos(a) * Math.sin(lean) * len, H - 0.04 + Math.cos(lean) * len, Math.sin(a) * Math.sin(lean) * len);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, H - 0.06, 0), new THREE.Vector3(end.x * 0.4, H + len * 0.45, end.z * 0.4), end]);
        k.tube('stems', 'plant-stem', null, 0.002, { curve, segs: k.seg(12, 4), radial: 4, overrides: { color: '#b49a6a' } });
        // fluffy plume: a long, soft spindle along the stem's end direction
        const L = 0.2 + rand() * 0.08;
        const plume = new THREE.LatheGeometry(spline([[0, 0], [0.012, 0.02], [0.026, 0.08], [0.028, 0.13], [0.018, 0.19], [0, L]], 10).map(([r, y]) => new THREE.Vector2(r, y)), k.seg(12, 6));
        k.add('plumes', 'fabric-linen-beige', aim(plume, curve.getPointAt(0.82), curve.getTangentAt(0.9)));
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ---------------------------------------------------------------- books */

const booksRow = item({
  id: 'books-row', category: 'decor', placement: 'surface', ko: '책 묶음', en: 'Row of books', size: [0.45, 0.25, 0.2],
  params: [
    P.len('width', '폭', 'Width', 0.45, 0.15, 1.2),
    P.len('height', '최대 높이', 'Max height', 0.25, 0.15, 0.35),
    P.bool('bookends', '북엔드', 'Bookends', true),
    P.int('seed', '배열', 'Variation', 1, 1, 20),
  ],
  tags: ['books', 'book row', 'bookends', '책', '책 묶음', '북엔드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.2, be = p.bookends ? 0.004 : 0;
    addBooks(k, -w / 2 + be, w / 2 - be, be ? 0.002 : 0, -d / 2, d, p.seed, { hMax: p.height - 0.01, fill: 1, lean: false });
    if (p.bookends) {
      for (const s of [-1, 1]) {
        k.box('bookends', 'metal-black', 0.004, 0.15, 0.12, s * (w / 2 - 0.002), 0.075, 0, { r: 0.0015 });
        k.box('bookends', 'metal-black', 0.09, 0.002, 0.12, s * (w / 2 - 0.047), 0.001, 0, { r: 0 });
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ---------------------------------------------------------------- bowls */

const FRUIT = { lemons: ['#e6c53a', [1, 0.78, 0.78], 0.032], oranges: ['#e17a26', [1, 0.94, 1], 0.037], apples: ['#8db23c', [1, 0.88, 1], 0.036] };

const bowl = item({
  id: 'decor-bowl', category: 'decor', placement: 'surface', ko: '장식 볼', en: 'Decorative bowl', size: [0.3, 0.12, 0.3],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.3, 0.12, 0.5),
    P.mat('material', '재질', 'Material', 'ceramic-matte', 'ceramic'),
    P.pick('fruit', '과일', 'Fruit', 'lemons', [['none', '없음', 'None'], ['lemons', '레몬', 'Lemons'], ['oranges', '오렌지', 'Oranges'], ['apples', '사과', 'Apples']]),
  ],
  tags: ['bowl', 'fruit bowl', '볼', '그릇', '과일 그릇', '센터피스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = R * 0.55;
    const outer = spline([[R * 0.35, 0], [R * 0.6, H * 0.08], [R * 0.88, H * 0.45], [R, H]], k.seg(12, 5));
    const inner = spline([[R - 0.006, H], [R * 0.86, H * 0.5], [R * 0.55, H * 0.2], [0, H * 0.14]], k.seg(12, 5));
    k.lathe('bowl', p.material, [[0, 0.004], [R * 0.33, 0.004], ...outer, [R - 0.003, H + 0.002], ...inner], 0, 0, 0, { segs: k.seg(48, 14) });
    if (p.fruit !== 'none') {
      const [color, sc, r] = FRUIT[p.fruit];
      const rand = rng(R * 100);
      const n = Math.max(3, Math.min(7, Math.round((R * 2 * Math.PI * 0.55) / (2.1 * r))));
      const ring = R * 0.52;
      const place = (x, y, z) => k.sphere('fruit', 'paint-white-matte', r, x, y, z, { scale: sc, segs: k.seg(20, 8), rings: k.seg(14, 6), ry: rand() * 3, rz: (rand() - 0.5) * 0.6, overrides: { color } });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.2;
        place(Math.cos(a) * ring, H * 0.14 + r * 0.95 + (ring / R) * H * 0.25, Math.sin(a) * ring);
      }
      place(0.01, H * 0.14 + r * 1.9 + 0.012, -0.005);
    }
    recentre(k);
    return k.group();
  },
});

/* -------------------------------------------------------------- candles */

const candles = item({
  id: 'candles', category: 'decor', placement: 'surface', ko: '캔들 세트', en: 'Candles', size: [0.23, 0.23, 0.12],
  params: [
    P.int('count', '개수', 'Count', 3, 1, 5),
    P.bool('lit', '불 켜기', 'Lit', true),
    P.color('wax', '초 색', 'Wax colour', '#f1e9da'),
  ],
  tags: ['candles', 'pillar candle', '캔들', '초', '양초', '향초'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const spots = [[0, 0, 0.2, 0.04], [0.085, 0.03, 0.15, 0.035], [-0.075, 0.035, 0.11, 0.036], [0.04, -0.05, 0.08, 0.03], [-0.03, -0.055, 0.13, 0.03]];
    for (let i = 0; i < p.count; i++) {
      const [x, z, h, r] = spots[i];
      // pillar with a slightly melted, concave top
      k.lathe('wax', 'paint-white-matte', [[0, 0], [r, 0], [r, h - 0.006], [r * 0.97, h], [r * 0.88, h - 0.004], [r * 0.4, h - 0.009], [0, h - 0.01]], x, 0, z, { segs: k.seg(32, 10), overrides: { color: p.wax } });
      k.cyl('wick', 'paint-black-matte', 0.0012, 0.0012, 0.016, x, h - 0.01, z, { segs: 4 });
      if (p.lit) {
        k.lathe('flame', 'light-warm', [[0, 0], [0.004, 0.004], [0.0055, 0.011], [0.003, 0.021], [0, 0.028]], x, h + 0.004, z, { segs: k.seg(12, 6) });
        k.light(x, h + 0.016, z, { intensity: 0.12, distance: 2, color: '#ffb46b' });
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ---------------------------------------------------------------- clock */

const clock = item({
  id: 'wall-clock', category: 'decor', placement: 'wall', elevation: 1.75, ko: '벽시계', en: 'Wall clock', size: [0.35, 0.35, 0.045],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.35, 0.2, 0.8),
    P.mat('rim', '테두리', 'Rim', 'wood-oak', 'wood'),
    P.color('face', '문자판', 'Face', '#f4f1ea'),
  ],
  tags: ['clock', 'wall clock', '시계', '벽시계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, D = 0.045;
    const ring = ellipse(2 * R, 2 * R);
    ring.holes.push(new THREE.Path(ellipse(2 * R - 0.032, 2 * R - 0.032).getPoints(64).reverse()));
    k.panel('rim', p.rim, ring, D, 0, R, 0, { bevel: 0.006, bevelSegs: 3, curveSegs: 64 });
    // recessed dial
    k.cyl('face', 'paint-white-matte', R - 0.012, R - 0.012, 0.03, 0, R, -D / 2 + 0.002, { rx: Math.PI / 2, segs: k.seg(48, 14), overrides: { color: p.face } });
    const fz = -D / 2 + 0.032;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, big = i % 3 === 0;
      const len = big ? R * 0.14 : R * 0.07, rr = R - 0.03 - len / 2;
      k.box('marks', 'paint-black-matte', big ? 0.006 : 0.003, len, 0.002, Math.sin(a) * rr, R + Math.cos(a) * rr, fz + 0.001, { r: 0, rz: -a });
    }
    // hands at 10:10, centre cap
    const hand = (a, len, w, z, mat, ov) => k.box('hands', mat, w, len, 0.0015, Math.sin(a) * (len / 2 - 0.012), R + Math.cos(a) * (len / 2 - 0.012), z, { r: 0, rz: -a, overrides: ov });
    hand((10 + 10 / 60) / 12 * Math.PI * 2, R * 0.55, 0.008, fz + 0.004, 'paint-black-matte');
    hand((10 / 60) * Math.PI * 2, R * 0.82, 0.005, fz + 0.006, 'paint-black-matte');
    hand((37 / 60) * Math.PI * 2, R * 0.85, 0.0018, fz + 0.008, 'paint-white-matte', { color: '#b8412f' });
    k.cyl('hands', 'paint-black-matte', 0.007, 0.007, 0.01, 0, R, fz, { rx: Math.PI / 2, segs: k.seg(14, 6) });
    return k.group();
  },
});

/* -------------------------------------------------------- picture frames */

/** One standing photo frame (bottom centre at the origin, tilted back on its easel). */
function standingFrame(k, w, h, mat, colors, seed) {
  const t = 0.015, b = 0.014, tilt = 0.2;
  const m = new THREE.Matrix4().makeRotationX(-tilt);
  applyAdded(k, () => {
    k.panel('frame', mat, frameShape(w, h, b), t, 0, h / 2, 0, { bevel: 0.002 });
    k.box('mat', 'paper', w - 2 * b + 0.002, h - 2 * b + 0.002, 0.002, 0, h / 2, -0.004, { r: 0 });
    const pw = (w - 2 * b) * 0.72, ph = (h - 2 * b) * 0.72;
    const rand = rng(seed);
    // a simple "photo": sky, ground, a figure
    k.box('photo', 'paint-white-matte', pw, ph * 0.55, 0.001, 0, h / 2 + ph * 0.225, -0.002, { r: 0, overrides: { color: colors[0] } });
    k.box('photo', 'paint-white-matte', pw, ph * 0.45, 0.001, 0, h / 2 - ph * 0.275, -0.002, { r: 0, overrides: { color: colors[1] } });
    k.cyl('photo', 'paint-white-matte', pw * 0.14, pw * 0.14, 0.001, (rand() - 0.5) * pw * 0.4, h / 2 + ph * 0.05, -0.0012, { rx: Math.PI / 2, segs: k.seg(20, 8), overrides: { color: colors[2] } });
    k.box('glass', 'glass-clear', w - 2 * b + 0.002, h - 2 * b + 0.002, 0.0015, 0, h / 2, 0.004, { r: 0 });
    k.box('frame', mat, w * 0.85, h * 0.85, 0.003, 0, h / 2, -t / 2 - 0.0015, { r: 0 });
  }, m);
  // easel strut from the back down to the table
  const strutLen = h * 0.62;
  k.box('frame', mat, 0.02, strutLen, 0.004, 0, strutLen / 2 * Math.cos(0.3), -Math.sin(tilt) * h * 0.55 - 0.03, { r: 0.001, rx: 0.3 });
}

const frames = item({
  id: 'picture-frames', category: 'decor', placement: 'surface', ko: '탁상 액자', en: 'Picture frames', size: [0.38, 0.2, 0.13],
  params: [
    P.int('count', '개수', 'Count', 2, 1, 3),
    P.mat('frame', '프레임', 'Frame', 'wood-oak', 'wood'),
  ],
  tags: ['picture frame', 'photo frame', '액자', '탁상 액자', '사진'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const set = [
      [0.15, 0.2, 0, 0, 0.1, ['#9fbcd0', '#c9b48e', '#c4664b']],
      [0.2, 0.15, 0.19, 0.03, -0.25, ['#d7c3a8', '#7d8f6a', '#3f4f63']],
      [0.13, 0.13, -0.16, 0.04, 0.35, ['#e7d9c4', '#b07a64', '#f3efe8']],
    ];
    for (let i = 0; i < p.count; i++) {
      const [w, h, x, z, ry, colors] = set[i];
      const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
      applyAdded(k, () => standingFrame(k, w, h, i === 2 ? 'metal-brass' : p.frame, colors, i + 3), m);
    }
    recentre(k);
    return k.group();
  },
});

/* -------------------------------------------------------------- textiles */

const throwPillow = item({
  id: 'throw-pillow', category: 'decor', placement: 'surface', ko: '쿠션', en: 'Throw pillow', size: [0.45, 0.44, 0.17],
  params: [
    P.pick('shape', '모양', 'Shape', 'square', [['square', '정사각', 'Square'], ['lumbar', '직사각(요추)', 'Lumbar'], ['large', '대형', 'Large']]),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-blue', 'fabric'),
    P.bool('piping', '파이핑', 'Piping', true),
  ],
  tags: ['pillow', 'cushion', 'throw pillow', '쿠션', '방석', '베개'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [w, h, d] = p.shape === 'lumbar' ? [0.55, 0.32, 0.15] : p.shape === 'large' ? [0.6, 0.6, 0.2] : [0.45, 0.45, 0.17];
    const g = pillowGeo(w, h, d, k.seg(20, 7));
    // its own weight flattens the bottom edge where it stands
    const pos = g.attributes.position, lim = -h / 2 + 0.035;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < lim) pos.setY(i, lim + (y - lim) * 0.35); }
    g.computeVertexNormals();
    k.add('pillow', p.fabric, g);
    if (p.piping) {
      // piping follows the seam: the outline of the pillow at z = 0
      const pts = [];
      const n = k.hi ? 64 : 24;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 4;
        const side = Math.floor(t), f = t - side;
        const u = [f * 2 - 1, 1, 1 - f * 2, -1][side], v = [-1, f * 2 - 1, 1, 1 - f * 2][side];
        let x = u * (w / 2) * (1 - 0.06 * v * v), y = v * (h / 2) * (1 - 0.06 * u * u);
        if (y < lim) y = lim + (y - lim) * 0.35;
        pts.push([x, y, 0]);
      }
      k.tube('piping', p.fabric, pts, 0.0045, { closed: true, segs: n * 2, radial: k.seg(6, 3) });
    }
    recentre(k);
    return k.group();
  },
});

const throwBlanket = item({
  id: 'throw-blanket', category: 'decor', placement: 'surface', ko: '접은 담요', en: 'Folded throw blanket', size: [0.48, 0.085, 0.32],
  params: [
    P.mat('fabric', '천', 'Fabric', 'fabric-wool-charcoal', 'fabric'),
    P.int('folds', '겹 수', 'Layers', 4, 2, 6),
    P.bool('fringe', '술 장식', 'Fringe', true),
  ],
  tags: ['throw', 'blanket', 'folded blanket', '담요', '블랭킷', '무릎담요'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.44, d = 0.32, t = 0.022;
    const rand = rng(p.folds * 7);
    for (let i = 0; i < p.folds; i++) {
      // each layer is a soft slab with a rolled fold (radius = half its thickness)
      const g = softBoxGeo(w - i * 0.004, t, d - i * 0.003, t / 2 - 0.0005, { round: k.hi ? 3 : 1, flat: k.hi ? 4 : 1, puff: 0.003, sag: i === p.folds - 1 ? 0.004 : 0 });
      T(g, (rand() - 0.5) * 0.008, t / 2 + i * (t - 0.002), (rand() - 0.5) * 0.006, 0, (rand() - 0.5) * 0.03, 0);
      k.add('blanket', p.fabric, g);
    }
    if (p.fringe) {
      const n = k.hi ? 26 : 10;
      for (let i = 0; i < n; i++) {
        const z = -d / 2 + 0.01 + (i + 0.5) * ((d - 0.02) / n);
        k.box('fringe', p.fabric, 0.04, 0.004, 0.005, w / 2 + 0.018, 0.004 + (i % 2) * 0.002, z, { r: 0, ry: (rand() - 0.5) * 0.3 });
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ----------------------------------------------------------------- tray */

const tray = item({
  id: 'tray', category: 'decor', placement: 'surface', ko: '트레이', en: 'Tray', size: [0.5, 0.04, 0.3],
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round'], ['oval', '타원', 'Oval']]),
    P.len('width', '폭', 'Width', 0.45, 0.2, 0.7),
    P.len('depth', '깊이', 'Depth', 0.3, 0.15, 0.5),
    P.mat('material', '재질', 'Material', 'wood-walnut', null),
    P.bool('handles', '손잡이', 'Handles', true),
  ],
  tags: ['tray', 'serving tray', '트레이', '쟁반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.shape === 'round' ? p.width : p.depth, b = 0.008, H = 0.04;
    const outline = (ww, dd) => (p.shape === 'round' ? ellipse(ww, ww) : p.shape === 'oval' ? superEllipse(ww, dd, 2.4, 72) : roundRect(ww, dd, 0.03));
    k.slab('tray', p.material, outline(w - 0.004, d - 0.004), 0.009, 0, { bevel: 0.002 });
    const ring = outline(w, d);
    ring.holes.push(new THREE.Path(outline(w - 2 * b, d - 2 * b).getPoints(48).reverse()));
    k.slab('tray', p.material, ring, H, 0, { bevel: 0.002, curveSegs: 32 });
    if (p.handles) {
      for (const s of [-1, 1]) {
        const x = s * (w / 2 + 0.002);
        k.bentTube('handles', 'metal-brass', [[x, H - 0.008, -0.045], [x + s * 0.022, H - 0.008, -0.045], [x + s * 0.022, H - 0.008, 0.045], [x, H - 0.008, 0.045]], 0.0035, 0.012);
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ------------------------------------------------------------- sculpture */

const sculpture = item({
  id: 'sculpture', category: 'decor', placement: 'surface', ko: '오브제 조각', en: 'Sculpture', size: [0.19, 0.16, 0.18],
  params: [
    P.pick('style', '형태', 'Style', 'knot', [['knot', '매듭', 'Knot'], ['stack', '돌탑', 'Pebble stack'], ['ring', '링', 'Ring']]),
    P.mat('material', '재질', 'Material', 'ceramic-matte', null),
    P.mat('plinth', '받침', 'Plinth', 'travertine', 'stone'),
  ],
  tags: ['sculpture', 'object', 'art', '오브제', '조각', '조형물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const pb = 0.04;
    k.box('plinth', p.plinth, 0.14, pb, 0.11, 0, pb / 2, 0, { r: 0.004, segs: 2 });
    if (p.style === 'knot') {
      const g = new THREE.TorusKnotGeometry(0.058, 0.018, k.seg(160, 48), k.seg(14, 6), 2, 3);
      g.rotateX(Math.PI / 2 - 0.2);
      g.computeBoundingBox();
      g.translate(0, pb - g.boundingBox.min.y - 0.004, 0);
      k.add('sculpture', p.material, g);
    } else if (p.style === 'stack') {
      let y = pb;
      const stones = [[0.055, 0.022], [0.045, 0.02], [0.036, 0.018], [0.027, 0.016], [0.018, 0.013]];
      stones.forEach(([r, hh], i) => {
        k.sphere('sculpture', p.material, 1, (i % 2 ? 0.006 : -0.004), y + hh - 0.002, (i % 2 ? -0.004 : 0.004), { scale: [r, hh, r * 0.85], segs: k.seg(24, 8), rings: k.seg(14, 6), ry: i * 0.7 });
        y += hh * 2 - 0.004;
      });
    } else {
      k.add('sculpture', p.material, new THREE.TorusGeometry(0.09, 0.022, k.seg(20, 8), k.seg(56, 16)).translate(0, pb + 0.09 + 0.022 + 0.004, 0));
      k.box('sculpture', p.material, 0.03, 0.012, 0.03, 0, pb + 0.006, 0, { r: 0.003 });
    }
    recentre(k);
    return k.group();
  },
});

export const ITEMS = [vase, booksRow, bowl, candles, clock, frames, throwPillow, throwBlanket, tray, sculpture];
