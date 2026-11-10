// More decor items (designs + preset variants of decor.js entries). See ARCHITECTURE.md §12 → Library objects.
// Clocks, books, globe, candle holders, vases (incl. Korean moon jar / celadon), bowls, figurines,
// wall decor (gallery, canvas, shelf, plates, macramé, tapestry, mirrors), window textiles
// (blinds, drapes), rugs, folding screen and small table-top objects.
import { THREE, Kit, item, P, variant, rng, T, clamp, lerp, smooth, boxUV, frameShape, roundRect, roundRectAt, ellipse, superEllipse, leafGeo, placeLeaf, softBoxGeo, shellGeo, gridGeo, transformAdded } from './helpers.js';
import { addBooks } from './living.js';
import { recentre } from './lighting.js';
import { ITEMS as DECOR } from './decor.js';

const BASE = Object.fromEntries(DECOR.map((e) => [e.id, e]));
const TAU = Math.PI * 2;
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const shapeOf = (pts) => new THREE.Shape(V2(pts));
const spline = (pts, n) => new THREE.SplineCurve(V2(pts)).getSpacedPoints(n).map((v) => [Math.max(0, v.x), v.y]);
const scaleProf = (pts, sr, sy = sr) => pts.map(([r, y]) => [r * sr, y * sy]);

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

/** Flips a grid's winding when its normals point down (so plan grids face up). */
function faceUp(geo) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  let sum = 0;
  for (let i = 0; i < n.count; i++) sum += n.getY(i);
  if (sum < 0) {
    const a = geo.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    geo.computeVertexNormals();
  }
  return geo;
}

/**
 * A thrown vessel (vase, jar, bottle) as one closed lathe: outer profile (bottom → rim), a rolled
 * lip and the inside wall down to `depth`. `mod(phi, y)` scales the radius (flutes, lopsided jars).
 */
function vesselGeo(k, outer, { wall = 0.004, depth, smoothN = 18, segs = 40, mod } = {}) {
  const out = spline(outer, k.seg(smoothN, 8));
  const n = out.length - 1, H = out[n][1], top = out[n][0];
  const floorY = Math.max(wall * 1.5, H - (depth ?? H * 0.9));
  const inner = [];
  for (let i = n - 1; i >= 0; i--) { const [r, y] = out[i]; if (y > floorY + 0.002 && y < H - 0.002) inner.push([Math.max(0.0015, r - wall), y]); }
  const lastR = inner.length ? inner[inner.length - 1][0] : Math.max(0.0015, top - wall);
  const prof = [[0, 0], [out[0][0] * 0.9, 0], ...out, [top - wall * 0.5, H + wall * 0.3], [Math.max(0.0015, top - wall), H], ...inner, [lastR * 0.9, floorY], [0, floorY]];
  const geo = new THREE.LatheGeometry(V2(prof), segs);
  if (mod) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = mod(Math.atan2(z, x), y);
      p.setXYZ(i, x * f, y, z * f);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Radius of a (spline-resampled) profile at height y. */
function radiusAt(prof, y) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return y1 === y0 ? r1 : r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return prof[prof.length - 1][0];
}

/** Clock dial facing +z: face disc starts at z, marks + hands + cap in front of it. */
function dial(k, { cx = 0, cy, z, R, face = '#f4f1ea', marks = 'paint-black-matte', style = 'bars', hands = 'paint-black-matte', second = '#b8412f', time = [10, 9, 36] }) {
  k.cyl('face', 'paint-white-matte', R, R, 0.003, cx, cy, z, { rx: Math.PI / 2, segs: k.seg(48, 14), overrides: { color: face } });
  const fz = z + 0.003;
  const n = style === 'minutes' ? 60 : 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const hour = style !== 'minutes' || i % 5 === 0, big = style === 'minutes' ? i % 15 === 0 : i % 3 === 0;
    if (style === 'dots') {
      const rr = big ? R * 0.045 : R * 0.028, d = R * 0.84;
      k.cyl('marks', marks, rr, rr, 0.001, cx + Math.sin(a) * d, cy + Math.cos(a) * d, fz, { rx: Math.PI / 2, segs: k.seg(12, 5) });
      continue;
    }
    const len = style === 'minutes' ? (hour ? R * (big ? 0.2 : 0.15) : R * 0.05) : big ? R * 0.16 : R * 0.08;
    const wd = style === 'minutes' ? (hour ? R * 0.045 : R * 0.012) : big ? R * 0.045 : R * 0.02;
    const rr = R * 0.92 - len / 2;
    k.box('marks', marks, Math.max(0.0012, wd), len, 0.001, cx + Math.sin(a) * rr, cy + Math.cos(a) * rr, fz + 0.0006, { r: 0, rz: -a });
  }
  const hand = (a, len, w, zz, mat, ov) => k.box('hands', mat, w, len, 0.0012, cx + Math.sin(a) * (len / 2 - R * 0.1), cy + Math.cos(a) * (len / 2 - R * 0.1), zz, { r: 0, rz: -a, overrides: ov });
  const [hh, mm, ss] = time;
  hand((((hh % 12) + mm / 60) / 12) * TAU, R * 0.62, Math.max(0.003, R * 0.06), fz + 0.002, hands);
  hand((mm / 60) * TAU, R * 0.92, Math.max(0.002, R * 0.04), fz + 0.0035, hands);
  if (second) hand((ss / 60) * TAU, R * 0.95, Math.max(0.001, R * 0.012), fz + 0.005, 'paint-white-matte', { color: second });
  k.cyl('hands', hands, Math.max(0.004, R * 0.05), Math.max(0.004, R * 0.05), 0.0065, cx, cy, fz, { rx: Math.PI / 2, segs: k.seg(14, 6) });
}

/** A pillar candle (melted top) with wick and optional flame + light marker; bottom at y. */
function pillarCandle(k, x, y, z, r, h, { lit = true, wax = '#f1e9da', intensity = 0.12 } = {}) {
  k.lathe('wax', 'paint-white-matte', [[0, 0], [r, 0], [r, h - 0.005], [r * 0.96, h], [r * 0.86, h - 0.004], [r * 0.4, h - 0.008], [0, h - 0.009]], x, y, z, { segs: k.seg(28, 10), overrides: { color: wax } });
  k.cyl('wick', 'paint-black-matte', 0.0012, 0.0012, 0.014, x, y + h - 0.009, z, { segs: 4 });
  if (lit) flame(k, x, y + h + 0.003, z, intensity);
}

function flame(k, x, y, z, intensity = 0.12) {
  k.lathe('flame', 'light-warm', [[0, 0], [0.004, 0.004], [0.0055, 0.011], [0.003, 0.021], [0, 0.028]], x, y, z, { segs: k.seg(12, 6) });
  k.light(x, y + 0.012, z, { intensity, distance: 2, color: '#ffb46b' });
}

/** Thin raised inlay on a rug (pattern slab whose top is 1.5 mm + level above the rug top). */
function inlay(k, role, shape, top, color, level = 0) {
  k.slab(role, 'rug-wool-cream', shape, 0.0025 + level * 0.001, top - 0.001, { bevel: 0.0005, curveSegs: 24, overrides: { color } });
}

const diamond = (cx, cz, hw, hd) => shapeOf([[cx, cz - hd], [cx + hw, cz], [cx, cz + hd], [cx - hw, cz]]);
const rectAt = (cx, cz, w, d) => shapeOf([[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]);

/* ================================================================ books */

const bookStack = item({
  id: 'decor-book-stack', category: 'decor', placement: 'surface', ko: '쌓아 둔 책', en: 'Stack of books', size: [0.298, 0.246, 0.246],
  params: [
    P.int('count', '권 수', 'Books', 4, 2, 7),
    P.pick('topper', '위 장식', 'On top', 'orb', [['orb', '오브제 구', 'Orb'], ['candle', '캔들', 'Jar candle'], ['none', '없음', 'None']]),
    P.int('seed', '배열', 'Variation', 2, 1, 20),
  ],
  tags: ['books', 'book stack', 'coffee table books', '책', '책 더미', '커피테이블 북', '쌓인 책'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 3 + 1);
    const covers = ['book-red', 'book-blue', 'book-green', 'book-cream', 'paint-grey-matte', 'book-cream'];
    let y = 0, w = 0.3;
    for (let i = 0; i < p.count; i++) {
      w = Math.max(0.17, w - rand() * 0.035 - (i ? 0.01 : 0));
      const d = w * (0.68 + rand() * 0.12), t = 0.022 + rand() * 0.024;
      const mat = covers[Math.floor(rand() * covers.length)];
      const ry = (rand() - 0.5) * 0.22 + (i % 2 ? Math.PI : 0);
      transformAdded(k, () => {
        k.box('books', mat, w, 0.003, d, 0, 0.0015, 0, { r: 0.001 });
        k.box('books', mat, w, 0.003, d, 0, t - 0.0015, 0, { r: 0.001 });
        k.box('books', mat, 0.005, t, d, -w / 2 + 0.0025, t / 2, 0, { r: 0.0018 });
        k.box('pages', 'paper', w - 0.01, t - 0.005, d - 0.008, 0, t / 2, 0, { r: 0 });
      }, (rand() - 0.5) * 0.012, y, (rand() - 0.5) * 0.01, ry);
      y += t;
    }
    if (p.topper === 'orb') {
      k.cyl('topper', 'metal-black', 0.02, 0.024, 0.008, 0.02, y, 0.01, { segs: k.seg(20, 8) });
      k.sphere('topper2', 'metal-brass', 0.05, 0.02, y + 0.006 + 0.048, 0.01, { segs: k.seg(28, 10), rings: k.seg(18, 7) });
    } else if (p.topper === 'candle') {
      const r = 0.042, h = 0.085;
      k.lathe('topper', 'ceramic-matte', [[0, 0], [r - 0.003, 0], [r, 0.004], [r, h], [r - 0.004, h], [r - 0.004, h * 0.3], [0, h * 0.3]], 0.02, y, 0.01, { segs: k.seg(32, 10) });
      k.cyl('topper2', 'paint-white-matte', r - 0.0045, r - 0.0045, 0.002, 0.02, y + h - 0.02, 0.01, { segs: k.seg(28, 10), overrides: { color: '#efe4cf' } });
      k.cyl('wick', 'paint-black-matte', 0.0012, 0.0012, 0.01, 0.02, y + h - 0.018, 0.01, { segs: 4 });
    }
    recentre(k);
    return k.group();
  },
});

const bookends = item({
  id: 'decor-bookends-marble', category: 'decor', placement: 'surface', ko: '대리석 북엔드와 책', en: 'Marble bookends with books', size: [0.46, 0.235, 0.19],
  params: [
    P.len('width', '폭', 'Width', 0.46, 0.25, 0.9),
    P.pick('style', '북엔드 모양', 'Bookend shape', 'arch', [['arch', '아치', 'Arch'], ['block', '블록', 'Block'], ['step', '계단', 'Stepped']]),
    P.mat('material', '북엔드 재질', 'Bookend material', 'marble-white', 'stone'),
    P.int('seed', '배열', 'Variation', 3, 1, 20),
  ],
  tags: ['bookends', 'books', 'marble', '북엔드', '책', '대리석', '책꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, T2 = 0.05, R = 0.095, h = 0.18;
    let shape;
    if (p.style === 'arch') {
      shape = new THREE.Shape();
      shape.moveTo(-R, 0); shape.lineTo(R, 0); shape.lineTo(R, h - R); shape.absarc(0, h - R, R, 0, Math.PI, false); shape.lineTo(-R, 0);
    } else if (p.style === 'block') shape = roundRectAt(-R, 0, 2 * R, h, 0.012);
    else shape = shapeOf([[-R, 0], [R, 0], [R, h * 0.45], [R * 0.3, h * 0.45], [R * 0.3, h], [-R, h]]);
    for (const s of [-1, 1]) k.panel('bookends', p.material, shape, T2, s * (w / 2 - T2 / 2), 0, 0, { ry: Math.PI / 2, bevel: 0.004, bevelSegs: 2, curveSegs: 24 });
    k.box('felt', 'fabric-wool-charcoal', T2 - 0.006, 0.002, 2 * R - 0.01, -(w / 2 - T2 / 2), 0.001, 0, { r: 0 });
    k.box('felt', 'fabric-wool-charcoal', T2 - 0.006, 0.002, 2 * R - 0.01, w / 2 - T2 / 2, 0.001, 0, { r: 0 });
    addBooks(k, -w / 2 + T2 + 0.001, w / 2 - T2 - 0.001, 0, -0.085, 0.17, p.seed, { hMax: 0.235, fill: 1, lean: false });
    recentre(k);
    return k.group();
  },
});

/* ================================================================ globe */

/** An irregular patch lying on a sphere of radius R around (lat, lon), facing outwards. */
function blobOnSphere(R, lat, lon, size, seed, nu, nv) {
  const c = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
  const up = Math.abs(c.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(up, c).normalize(), e2 = new THREE.Vector3().crossVectors(c, e1);
  const rand = rng(seed);
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const rho = (a) => size * (1 + 0.28 * Math.sin(2 * a + ph[0]) + 0.16 * Math.sin(3 * a + ph[1]) + 0.08 * Math.sin(6 * a + ph[2]));
  const g = gridGeo(nu, nv, (u, v) => {
    const a = u * TAU, d = v * rho(a);
    const dir = c.clone().multiplyScalar(Math.cos(d)).addScaledVector(e1, Math.sin(d) * Math.cos(a)).addScaledVector(e2, Math.sin(d) * Math.sin(a));
    return dir.multiplyScalar(R).toArray();
  });
  const n = g.attributes.normal, p = g.attributes.position, i = Math.floor(p.count * 0.75);
  if (n.getX(i) * p.getX(i) + n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i) < 0) {
    const a = g.index.array;
    for (let j = 0; j < a.length; j += 3) { const t = a[j + 1]; a[j + 1] = a[j + 2]; a[j + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

const globe = item({
  id: 'decor-globe', category: 'decor', placement: 'surface', ko: '지구본', en: 'Desk globe', size: [0.317, 0.418, 0.3],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.3, 0.18, 0.45),
    P.pick('style', '스타일', 'Style', 'antique', [['antique', '앤틱', 'Antique'], ['blue', '블루', 'Blue ocean'], ['black', '블랙', 'Black']]),
    P.mat('stand', '받침', 'Stand', 'wood-walnut', null),
  ],
  tags: ['globe', 'world', 'desk globe', '지구본', '지구의', '세계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, tilt = 0.41, ringR = R + 0.014;
    const pal = { antique: ['#cdb98a', '#8a6a3e'], blue: ['#4f7fa6', '#d9c99a'], black: ['#1f2328', '#c9a24a'] }[p.style];
    const baseH = 0.04, post = 0.06;
    const bx = ringR * Math.sin(tilt);
    const cy = baseH + post + ringR * Math.cos(tilt);
    k.lathe('stand', p.stand, [[0, 0], [R * 0.62, 0], [R * 0.63, 0.008], [R * 0.55, 0.018], [R * 0.2, 0.032], [R * 0.12, baseH], [0, baseH]], bx, 0, 0, { segs: k.seg(36, 10) });
    k.lathe('stand', p.stand, [[0, 0], [0.014, 0], [0.01, post * 0.4], [0.013, post * 0.6], [0.008, post + 0.004], [0, post + 0.004]], bx, baseH - 0.002, 0, { segs: k.seg(16, 6) });
    const m = new THREE.Matrix4().makeRotationZ(tilt).setPosition(0, cy, 0);
    applyAdded(k, () => {
      k.sphere('globe', 'paint-white-matte', R, 0, 0, 0, { segs: k.seg(40, 14), rings: k.seg(26, 9), overrides: { color: pal[0] } });
      // continents: irregular blobs draped on the sphere (lat, lon, angular size)
      const lands = [[0.85, 1.3, 0.62], [0.45, 2.3, 0.4], [0.12, 0.35, 0.42], [-0.2, 0.5, 0.3], [0.78, -1.75, 0.5], [-0.32, -1.05, 0.36], [-0.45, 2.35, 0.22], [-1.42, 0, 0.32], [1.22, -0.7, 0.16]];
      lands.forEach(([lat, lon, size], i) => k.add('land', 'paint-white-matte', blobOnSphere(R * 1.0025, lat, lon, size, i + 1, k.seg(28, 12), k.seg(5, 2)), { overrides: { color: pal[1] } }));
      const ring = new THREE.TorusGeometry(ringR, 0.0035, k.seg(8, 4), k.seg(48, 14), Math.PI);
      ring.rotateZ(-Math.PI / 2);
      k.add('meridian', 'metal-brass', ring);
      k.cyl('meridian', 'metal-brass', 0.003, 0.003, ringR - R + 0.003, 0, R - 0.002, 0, { segs: 6 });
      k.cyl('meridian', 'metal-brass', 0.003, 0.003, ringR - R + 0.003, 0, -(R - 0.002), 0, { segs: 6, rx: Math.PI });
    }, m);
    recentre(k);
    return k.group();
  },
});

/* =============================================================== clocks */

const mantelClock = item({
  id: 'decor-mantel-clock', category: 'decor', placement: 'surface', ko: '탁상 벽난로 시계', en: 'Mantel clock', size: [0.364, 0.212, 0.11],
  params: [
    P.len('width', '폭', 'Width', 0.34, 0.25, 0.5),
    P.mat('wood', '케이스', 'Case', 'wood-walnut', 'wood'),
    P.color('face', '문자판', 'Face', '#f1ead9'),
  ],
  tags: ['clock', 'mantel clock', 'tambour', '시계', '탁상시계', '벽난로 시계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = w * 0.55, d = 0.09, foot = 0.012, pl = 0.018;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.sphere('trim', 'metal-brass', 0.011, sx * (w / 2 - 0.006), foot * 0.5, sz * (d / 2 - 0.004), { scale: [1, 0.75, 1], segs: k.seg(14, 6), rings: k.seg(8, 4) });
    k.box('case', p.wood, w + 0.024, pl, d + 0.02, 0, foot + pl / 2, 0, { r: 0.005, segs: 2 });
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h * 0.4);
    s.quadraticCurveTo(w * 0.32, h * 0.44, w * 0.24, h * 0.66);
    s.bezierCurveTo(w * 0.17, h * 1.06, -w * 0.17, h * 1.06, -w * 0.24, h * 0.66);
    s.quadraticCurveTo(-w * 0.32, h * 0.44, -w / 2, h * 0.4); s.lineTo(-w / 2, 0);
    const y0 = foot + pl;
    k.panel('case', p.wood, s, d, 0, y0, 0, { bevel: 0.004, bevelSegs: 3, curveSegs: 32 });
    const R = h * 0.29, cy = y0 + h * 0.56;
    k.add('trim', 'metal-brass', new THREE.TorusGeometry(R + 0.004, 0.005, k.seg(10, 4), k.seg(40, 12)).translate(0, cy, d / 2 + 0.003));
    dial(k, { cy, z: d / 2 - 0.0005, R, face: p.face, style: 'bars', second: null });
    recentre(k);
    return k.group();
  },
});

const alarmClock = item({
  id: 'decor-alarm-clock', category: 'decor', placement: 'surface', ko: '자명종 시계', en: 'Twin-bell alarm clock', size: [0.111, 0.162, 0.054],
  params: [
    P.color('color', '몸체 색', 'Body colour', '#c8463c'),
    P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal'),
  ],
  tags: ['clock', 'alarm clock', 'twin bell', '시계', '자명종', '알람시계', '탁상시계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.05, D = 0.042, cy = 0.022 + R;
    k.cyl('body', 'paint-white-gloss', R, R, D, 0, cy, -D / 2, { rx: Math.PI / 2, segs: k.seg(36, 12), overrides: { color: p.color } });
    k.add('metal', p.metal, new THREE.TorusGeometry(R - 0.002, 0.004, k.seg(8, 4), k.seg(36, 12)).translate(0, cy, D / 2));
    dial(k, { cy, z: D / 2 - 0.002, R: R - 0.006, face: '#f6f2e8', style: 'bars', second: '#c8463c', time: [7, 0, 20] });
    for (const s of [-1, 1]) {
      k.rod('metal', p.metal, [s * R * 0.5, cy - R * 0.8, 0], [s * R * 0.92, 0.006, 0.004], 0.0035, { segs: k.seg(8, 4) });
      k.sphere('metal', p.metal, 0.0065, s * R * 0.92, 0.0065, 0.004, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
      const a = s * 0.55;
      const bx = -Math.sin(a) * (R + 0.006), by = cy + Math.cos(a) * (R + 0.006);
      k.rod('metal', p.metal, [-Math.sin(a) * R * 0.9, cy + Math.cos(a) * R * 0.9, 0], [bx, by, 0], 0.002, { segs: 5 });
      k.sphere('metal', p.metal, 0.026, bx, by, 0, { thetaLength: Math.PI / 2, rz: a, segs: k.seg(20, 8), rings: k.seg(8, 4) });
    }
    k.rod('metal', p.metal, [0, cy + R - 0.004, -0.006], [0, cy + R + 0.03, -0.006], 0.0018, { segs: 5 });
    k.add('metal', p.metal, new THREE.TorusGeometry(R * 0.5, 0.0028, k.seg(6, 3), k.seg(20, 8), Math.PI).translate(0, cy + R + 0.012, -0.012));
    recentre(k);
    return k.group();
  },
});

const grandfather = item({
  id: 'decor-grandfather-clock', category: 'decor', ko: '괘종시계(그랜드파더)', en: 'Grandfather clock', size: [0.54, 2.004, 0.323],
  params: [
    P.len('height', '높이', 'Height', 2.0, 1.8, 2.3),
    P.mat('wood', '케이스', 'Case', 'wood-walnut', 'wood'),
    P.color('face', '문자판', 'Face', '#efe6d0'),
  ],
  tags: ['clock', 'grandfather clock', 'floor clock', 'pendulum', '시계', '괘종시계', '스탠드 시계', '추시계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, W = 0.5, D = 0.28, wd = p.wood;
    k.box('case', wd, W + 0.04, 0.06, D + 0.03, 0, 0.03, 0, { r: 0.006, segs: 2 });
    k.box('case', wd, W, 0.34, D, 0, 0.23, 0, { r: 0.004 });
    k.box('case', wd, W - 0.12, 0.2, 0.012, 0, 0.23, D / 2 + 0.005, { r: 0.004 });
    k.box('case', wd, W + 0.02, 0.03, D + 0.015, 0, 0.415, 0, { r: 0.006 });
    const y0w = 0.43, y1w = H - 0.6, ww = 0.4, wdp = 0.22, wz = -0.02;
    k.box('case', wd, ww, y1w - y0w, wdp, 0, (y0w + y1w) / 2, wz, { r: 0.004 });
    k.box('case', wd, W + 0.02, 0.03, D + 0.015, 0, y1w + 0.015, 0, { r: 0.006 });
    const front = wz + wdp / 2;
    const dw = 0.3, dh = y1w - y0w - 0.14, dy = (y0w + y1w) / 2;
    k.panel('case', wd, frameShape(dw, dh, 0.035), 0.05, 0, dy, front + 0.025, { bevel: 0.004 });
    k.box('glass', 'glass-clear', dw - 0.066, dh - 0.066, 0.003, 0, dy, front + 0.044, { r: 0 });
    const winTop = dy + dh / 2 - 0.035;
    k.box('pendulum', 'metal-brass', 0.008, dh * 0.62, 0.003, 0, winTop - dh * 0.31, front + 0.008, { r: 0 });
    k.cyl('pendulum', 'metal-brass', 0.065, 0.065, 0.006, 0, winTop - dh * 0.62, front + 0.005, { rx: Math.PI / 2, segs: k.seg(32, 10) });
    for (const s of [-1, 1]) {
      k.cyl('pendulum', 'metal-brass', 0.018, 0.018, 0.16, s * 0.08, winTop - 0.32, front + 0.024, { segs: k.seg(16, 6) });
      k.rod('pendulum', 'metal-steel', [s * 0.08, winTop - 0.16, front + 0.024], [s * 0.08, winTop, front + 0.024], 0.0015, { segs: 4 });
    }
    const hy0 = y1w + 0.03, hy1 = H - 0.17, hcy = (hy0 + hy1) / 2;
    k.box('case', wd, W, hy1 - hy0, D, 0, hcy, 0, { r: 0.004 });
    k.box('case', wd, W + 0.04, 0.03, D + 0.03, 0, hy1 + 0.015, 0, { r: 0.006 });
    const ped = new THREE.Shape();
    ped.moveTo(-W / 2, 0); ped.lineTo(W / 2, 0); ped.lineTo(W / 2, 0.04); ped.quadraticCurveTo(0, 0.16, -W / 2, 0.04); ped.lineTo(-W / 2, 0);
    k.panel('case', wd, ped, D - 0.02, 0, hy1 + 0.03, 0, { bevel: 0.004, curveSegs: 20 });
    k.panel('case', wd, frameShape(0.36, 0.36, 0.03), 0.02, 0, hcy, D / 2 + 0.01, { bevel: 0.003 });
    k.box('glass', 'glass-clear', 0.304, 0.304, 0.002, 0, hcy, D / 2 + 0.017, { r: 0 });
    dial(k, { cy: hcy, z: D / 2 - 0.0005, R: 0.14, face: p.face, style: 'minutes', second: null });
    for (const s of [-1, 1]) {
      k.cyl('trim', 'metal-brass', 0.012, 0.012, hy1 - hy0 - 0.04, s * (W / 2 - 0.022), hy0 + 0.02, D / 2 + 0.012, { segs: k.seg(14, 6) });
      k.cyl('trim', 'metal-brass', 0.016, 0.016, 0.02, s * (W / 2 - 0.022), hy0, D / 2 + 0.012, { segs: k.seg(14, 6) });
      k.cyl('trim', 'metal-brass', 0.016, 0.016, 0.02, s * (W / 2 - 0.022), hy1 - 0.02, D / 2 + 0.012, { segs: k.seg(14, 6) });
      k.sphere('trim', 'metal-brass', 0.016, s * (W / 2 - 0.03), hy1 + 0.03 + 0.04 + 0.014, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    }
    const pk = hy1 + 0.03 + 0.1;
    k.cyl('trim', 'metal-brass', 0.01, 0.012, 0.012, 0, pk - 0.004, 0, { segs: k.seg(12, 5) });
    k.sphere('trim', 'metal-brass', 0.018, 0, pk + 0.026, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    recentre(k);
    return k.group();
  },
});

const sunburstClock = item({
  id: 'decor-sunburst-clock', category: 'decor', placement: 'wall', elevation: 1.5, ko: '선버스트 벽시계', en: 'Sunburst wall clock', size: [0.619, 0.619, 0.039],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.6, 0.4, 0.9),
    P.int('rays', '살 개수', 'Rays', 24, 12, 40),
    P.mat('metal', '금속', 'Metal', 'metal-gold', 'metal'),
  ],
  tags: ['clock', 'sunburst', 'wall clock', 'mid-century', '시계', '벽시계', '선버스트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = p.diameter, R0 = D * 0.16, cy = D / 2 + 0.01;
    k.cyl('frame', p.metal, R0 + 0.012, R0 + 0.012, 0.03, 0, cy, -0.015, { rx: Math.PI / 2, segs: k.seg(40, 12) });
    dial(k, { cy, z: 0.0145, R: R0, face: '#f6f1e6', style: 'dots', marks: p.metal, hands: 'paint-black-matte', second: null });
    const n = p.rays;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, long = i % 2 === 0, L = (D / 2) * (long ? 1 : 0.74);
      const dx = Math.sin(a), dy = Math.cos(a);
      k.rod('frame', p.metal, [dx * (R0 + 0.006), cy + dy * (R0 + 0.006), 0], [dx * L, cy + dy * L, 0], 0.0032, { segs: k.seg(8, 4) });
      k.sphere('frame', p.metal, long ? 0.0095 : 0.006, dx * L, cy + dy * L, 0, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    recentre(k);
    return k.group();
  },
});

/* ======================================================== candle holders */

const candlesticks = item({
  id: 'decor-candlesticks', category: 'decor', placement: 'surface', ko: '촛대 세트', en: 'Candlesticks', size: [0.246, 0.48, 0.121],
  params: [
    P.int('count', '개수', 'Count', 3, 1, 3),
    P.mat('metal', '촛대', 'Holder', 'metal-brass', null),
    P.color('wax', '초 색', 'Candle colour', '#f3ede1'),
    P.bool('lit', '불 켜기', 'Lit', true),
  ],
  tags: ['candlestick', 'candle holder', 'taper candle', '촛대', '캔들 홀더', '초'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const set = [[0, -0.01, 0.26], [-0.08, 0.02, 0.2], [0.08, 0.025, 0.16]];
    for (let i = 0; i < p.count; i++) {
      const [x, z, h] = set[i];
      k.lathe('holder', p.metal, [[0, 0], [0.042, 0], [0.043, 0.005], [0.037, 0.011], [0.02, 0.028], [0.011, 0.042], [0.009, 0.055], [0.015, 0.064], [0.008, 0.074], [0.007, h - 0.045], [0.013, h - 0.035], [0.008, h - 0.026], [0.011, h - 0.014], [0.024, h - 0.007], [0.025, h], [0.0115, h], [0.0115, h - 0.012], [0, h - 0.012]], x, 0, z, { segs: k.seg(28, 10) });
      const ch = 0.2;
      k.lathe('wax', 'paint-white-matte', [[0, 0], [0.011, 0], [0.0105, ch * 0.6], [0.0092, ch - 0.004], [0.006, ch], [0, ch]], x, h - 0.012, z, { segs: k.seg(16, 6), overrides: { color: p.wax } });
      k.cyl('wick', 'paint-black-matte', 0.001, 0.001, 0.012, x, h - 0.012 + ch - 0.002, z, { segs: 4 });
      if (p.lit) flame(k, x, h - 0.012 + ch + 0.004, z, 0.1);
    }
    recentre(k);
    return k.group();
  },
});

const lantern = item({
  id: 'decor-lantern', category: 'decor', placement: 'surface', ko: '캔들 랜턴', en: 'Candle lantern', size: [0.206, 0.399, 0.206],
  params: [
    P.len('height', '높이', 'Height', 0.38, 0.25, 0.7),
    P.mat('metal', '프레임', 'Frame', 'metal-black', null),
    P.bool('lit', '불 켜기', 'Lit', true),
  ],
  tags: ['lantern', 'candle lantern', 'hurricane', '랜턴', '캔들 랜턴', '초롱'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, w = H * 0.5, hb = H * 0.72, pt = 0.012, m = p.metal;
    k.box('frame', m, w, 0.025, w, 0, 0.0125, 0, { r: 0.004 });
    k.box('frame', m, w, 0.018, w, 0, hb, 0, { r: 0.003 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box('frame', m, pt, hb - 0.034, pt, sx * (w / 2 - pt / 2), 0.025 + (hb - 0.034) / 2, sz * (w / 2 - pt / 2), { r: 0.002 });
    const roofH = H * 0.15, rr = (w / 2 + 0.008) / Math.SQRT1_2;
    k.cyl('frame', m, 0.012, rr, roofH, 0, hb + 0.009, 0, { segs: 4, ry: Math.PI / 4 });
    k.cyl('frame', m, 0.008, 0.012, 0.012, 0, hb + 0.009 + roofH, 0, { segs: k.seg(12, 5) });
    const ringR = H * 0.06;
    k.add('frame', m, new THREE.TorusGeometry(ringR, 0.004, k.seg(8, 4), k.seg(24, 8)).translate(0, hb + 0.009 + roofH + 0.01 + ringR, 0));
    const gh = hb - 0.034, gw = w - pt * 2 + 0.002, gy = 0.025 + gh / 2;
    for (const s of [-1, 1]) {
      k.box('glass', 'glass-clear', gw, gh, 0.002, 0, gy, s * (w / 2 - pt / 2), { r: 0 });
      k.box('glass', 'glass-clear', 0.002, gh, gw, s * (w / 2 - pt / 2), gy, 0, { r: 0 });
    }
    pillarCandle(k, 0, 0.025, 0, w * 0.18, H * 0.3, { lit: p.lit, intensity: 0.15 });
    recentre(k);
    return k.group();
  },
});

const hurricane = item({
  id: 'decor-hurricane', category: 'decor', placement: 'surface', ko: '허리케인 캔들 홀더', en: 'Hurricane candle holder', size: [0.19, 0.342, 0.19],
  params: [
    P.mat('base', '받침', 'Base', 'wood-teak', null),
    P.color('wax', '초 색', 'Candle colour', '#f1e9da'),
    P.bool('lit', '불 켜기', 'Lit', true),
  ],
  tags: ['hurricane', 'candle holder', 'glass', '허리케인', '캔들 홀더', '유리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const bh = 0.035;
    k.lathe('base', p.base, [[0, 0], [0.09, 0], [0.095, 0.006], [0.095, bh - 0.006], [0.09, bh], [0, bh]], 0, 0, 0, { segs: k.seg(40, 12) });
    const out = spline([[0.068, bh], [0.08, 0.1], [0.087, 0.19], [0.079, 0.28], [0.072, 0.34]], k.seg(16, 6));
    const top = out[out.length - 1];
    const inn = out.slice().reverse().map(([r, y]) => [r - 0.003, y]);
    const prof = [...out, [top[0] - 0.0015, top[1] + 0.0015], ...inn.slice(1), [out[0][0] - 0.0015, bh], out[0]];
    k.lathe('glass', 'glass-clear', prof, 0, 0, 0, { segs: k.seg(40, 12) });
    pillarCandle(k, 0, bh, 0, 0.035, 0.12, { lit: p.lit, wax: p.wax });
    recentre(k);
    return k.group();
  },
});

/* ================================================================ vases */

function stemCurve(pts) { return new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))); }

const budVases = item({
  id: 'decor-bud-vases', category: 'decor', placement: 'surface', ko: '미니 꽃병 세트', en: 'Bud vase trio', size: [0.206, 0.402, 0.114],
  params: [
    P.pick('set', '구성', 'Set', 'neutral', [['neutral', '뉴트럴 도자', 'Neutral ceramic'], ['glass', '유리', 'Glass'], ['dark', '다크', 'Dark']]),
    P.bool('stems', '꽃·가지', 'Stems', true),
  ],
  tags: ['bud vase', 'vase', 'flowers', '미니 꽃병', '꽃병', '화병', '꽃'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const mats = { neutral: ['ceramic-matte', 'ceramic-terracotta', 'ceramic-white'], glass: ['glass-tinted', 'glass-clear', 'glass-frosted'], dark: ['paint-black-matte', 'ceramic-matte', 'paint-grey-matte'] }[p.set];
    const vs = [
      { x: -0.065, z: 0.012, prof: [[0.025, 0], [0.034, 0.03], [0.036, 0.07], [0.02, 0.12], [0.011, 0.14], [0.013, 0.15]] },
      { x: 0.0, z: -0.018, prof: [[0.03, 0], [0.045, 0.03], [0.045, 0.06], [0.028, 0.092], [0.012, 0.103], [0.014, 0.11]] },
      { x: 0.062, z: 0.018, prof: [[0.022, 0], [0.024, 0.05], [0.024, 0.15], [0.016, 0.178], [0.012, 0.19]] },
    ];
    vs.forEach((v, i) => k.add(`vase${i}`, mats[i], T(vesselGeo(k, v.prof, { wall: 0.003, segs: k.seg(32, 10) }), v.x, 0, v.z)));
    if (p.stems) {
      // 1: a single flower
      const [a, b, c] = vs;
      const ha = a.prof[a.prof.length - 1][1];
      let cv = stemCurve([[a.x, ha - 0.04, a.z], [a.x - 0.005, ha + 0.08, a.z + 0.005], [a.x - 0.02, ha + 0.19, a.z + 0.012]]);
      k.tube('stems', 'plant-leaf', null, 0.0018, { curve: cv, segs: k.seg(12, 4), radial: 4 });
      const tip = cv.getPointAt(1);
      for (let j = 0; j < 6; j++) {
        const an = (j / 6) * TAU;
        k.sphere('petals', 'paint-white-matte', 0.012, tip.x + Math.cos(an) * 0.011, tip.y + 0.004, tip.z + Math.sin(an) * 0.011, { scale: [1, 0.35, 0.7], ry: -an, segs: k.seg(10, 5), rings: k.seg(6, 3), overrides: { color: '#e9a7a0' } });
      }
      k.sphere('petals', 'paint-white-matte', 0.006, tip.x, tip.y + 0.007, tip.z, { segs: k.seg(10, 5), rings: k.seg(6, 3), overrides: { color: '#d9b04a' } });
      // 2: a leafy sprig
      const hb = b.prof[b.prof.length - 1][1];
      cv = stemCurve([[b.x, hb - 0.04, b.z], [b.x + 0.01, hb + 0.06, b.z - 0.005], [b.x + 0.035, hb + 0.14, b.z - 0.01]]);
      k.tube('stems', 'plant-leaf', null, 0.0016, { curve: cv, segs: k.seg(12, 4), radial: 4 });
      for (let j = 1; j <= (k.hi ? 6 : 3); j++) {
        const t = 0.3 + 0.7 * (j / (k.hi ? 6 : 3)), at = cv.getPointAt(t), tan = cv.getTangentAt(t);
        const yaw = Math.atan2(tan.x, tan.z);
        const g = leafGeo(0.03, 0.014, { nu: 2, nv: k.hi ? 4 : 2, droop: 0.2, fold: 0.2 });
        k.add('leaves', 'plant-leaf-light', placeLeaf(g, [at.x, at.y, at.z], yaw + (j % 2 ? 1.6 : -1.6), 0.5));
      }
      // 3: a dried grass plume
      const hc = c.prof[c.prof.length - 1][1];
      cv = stemCurve([[c.x, hc - 0.05, c.z], [c.x + 0.005, hc + 0.08, c.z], [c.x + 0.02, hc + 0.16, c.z + 0.005]]);
      k.tube('dried', 'plant-stem', null, 0.0015, { curve: cv, segs: k.seg(10, 4), radial: 4, overrides: { color: '#b49a6a' } });
      const pl = new THREE.LatheGeometry(V2(spline([[0, 0], [0.008, 0.012], [0.012, 0.04], [0.008, 0.07], [0, 0.085]], 8)), k.seg(10, 5));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), cv.getTangentAt(0.9));
      pl.applyQuaternion(q);
      const e = cv.getPointAt(0.85);
      pl.translate(e.x, e.y, e.z);
      k.add('dried', 'fabric-linen-beige', pl);
    }
    recentre(k);
    return k.group();
  },
});

const floorVase = item({
  id: 'decor-floor-vase', category: 'decor', ko: '대형 바닥 꽃병', en: 'Floor vase with dried grass', size: [0.524, 1.42, 0.674], bboxSlack: [0.03, 0.02, 0.03],
  params: [
    P.len('height', '꽃병 높이', 'Vase height', 0.6, 0.4, 0.9),
    P.mat('material', '재질', 'Finish', 'ceramic-matte', null),
    P.pick('stems', '가지', 'Stems', 'pampas', [['pampas', '팜파스', 'Pampas grass'], ['branches', '마른 가지', 'Bare branches'], ['none', '없음', 'None']]),
  ],
  tags: ['floor vase', 'vase', 'pampas', 'dried flowers', '바닥 꽃병', '대형 화병', '팜파스', '드라이플라워'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 0.6;
    const prof = scaleProf([[0.1, 0], [0.145, 0.07], [0.165, 0.2], [0.14, 0.4], [0.08, 0.52], [0.06, 0.565], [0.07, 0.6]], s);
    k.add('vase', p.material, vesselGeo(k, prof, { wall: 0.007, segs: k.seg(48, 14), depth: H * 0.95 }));
    const rand = rng(7 + Math.round(H * 10));
    const neck = 0.055 * s;
    if (p.stems === 'pampas') {
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4 + rand() * 0.4, lean = 0.1 + rand() * 0.42, len = 0.48 + rand() * 0.22;
        const st = new THREE.Vector3(Math.cos(a) * neck * 0.4, H - 0.1, Math.sin(a) * neck * 0.4);
        const end = new THREE.Vector3(Math.cos(a) * Math.sin(lean) * len, H + Math.cos(lean) * len, Math.sin(a) * Math.sin(lean) * len);
        const cv = new THREE.CatmullRomCurve3([st, new THREE.Vector3(end.x * 0.35, H + len * 0.45, end.z * 0.35), end]);
        k.tube('stems', 'plant-stem', null, 0.003, { curve: cv, segs: k.seg(14, 5), radial: 4, overrides: { color: '#b49a6a' } });
        const L = 0.26 + rand() * 0.1;
        const plume = new THREE.LatheGeometry(V2(spline([[0, 0], [0.016, 0.025], [0.035, 0.1], [0.037, 0.17], [0.024, 0.24], [0, L]], 10)), k.seg(14, 6));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), cv.getTangentAt(0.92));
        plume.applyQuaternion(q);
        const at = cv.getPointAt(0.8);
        plume.translate(at.x, at.y, at.z);
        k.add('plumes', 'fabric-linen-beige', plume);
      }
    } else if (p.stems === 'branches') {
      for (let i = 0; i < 5; i++) {
        const a = i * 2.5 + rand() * 0.5, lean = 0.12 + rand() * 0.35, len = 0.6 + rand() * 0.3;
        const dir = (t, l) => [Math.cos(a) * Math.sin(lean) * l * t, H - 0.1 + Math.cos(lean) * l * t + 0.1 * t, Math.sin(a) * Math.sin(lean) * l * t];
        const pts = [0, 0.3, 0.6, 1].map((t, j) => { const q = dir(t, len); return [q[0] + (j % 2 ? 0.02 : -0.01), q[1], q[2]]; });
        const cv = stemCurve(pts);
        k.tube('stems', 'wood-dark', null, 0.005, { curve: cv, segs: k.seg(16, 5), radial: 5 });
        for (const t of [0.45, 0.7]) {
          const at = cv.getPointAt(t), b = a + (rand() > 0.5 ? 0.8 : -0.8), l2 = 0.15 + rand() * 0.12;
          k.tube('stems', 'wood-dark', [[at.x, at.y, at.z], [at.x + Math.cos(b) * l2 * 0.5, at.y + l2 * 0.6, at.z + Math.sin(b) * l2 * 0.5], [at.x + Math.cos(b) * l2, at.y + l2, at.z + Math.sin(b) * l2]], 0.0028, { segs: k.seg(8, 3), radial: 4 });
        }
      }
    }
    recentre(k);
    return k.group();
  },
});

const moonJar = item({
  id: 'decor-moon-jar', category: 'decor', placement: 'surface', ko: '달항아리', en: 'Moon jar (dal hangari)', size: [0.411, 0.402, 0.4],
  params: [
    P.len('height', '높이', 'Height', 0.4, 0.2, 0.6),
    P.mat('material', '유약', 'Glaze', 'ceramic-white', 'ceramic'),
    P.bool('stand', '나무 받침', 'Wooden stand', false),
  ],
  tags: ['moon jar', 'korean', 'porcelain', 'joseon', '달항아리', '백자', '항아리', '한국'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height;
    let y0 = 0;
    if (p.stand) {
      const sh = 0.04;
      k.lathe('stand', 'wood-dark', [[0, 0], [H * 0.27, 0], [H * 0.28, 0.008], [H * 0.27, sh - 0.01], [H * 0.24, sh], [0, sh]], 0, 0, 0, { segs: k.seg(40, 12) });
      y0 = sh;
    }
    const prof = scaleProf([[0.16, 0], [0.18, 0.012], [0.19, 0.03], [0.36, 0.17], [0.5, 0.46], [0.47, 0.68], [0.33, 0.87], [0.25, 0.94], [0.255, 0.975], [0.28, 1.0]], H);
    // two thrown halves joined at the waist: slightly lopsided, like the real thing
    const mod = (phi, y) => 1 + Math.sin(Math.PI * clamp(y / H, 0, 1)) * (0.022 * Math.sin(2 * phi + 0.7) + 0.01 * Math.sin(3 * phi + 2));
    k.add('jar', p.material, T(vesselGeo(k, prof, { wall: 0.007, segs: k.seg(56, 16), smoothN: 24, mod }), 0, y0, 0));
    recentre(k);
    return k.group();
  },
});

const celadon = item({
  id: 'decor-celadon-vase', category: 'decor', placement: 'surface', ko: '청자 매병', en: 'Celadon maebyeong vase', size: [0.198, 0.352, 0.198],
  params: [
    P.len('height', '높이', 'Height', 0.32, 0.2, 0.5),
    P.color('glaze', '유약 색', 'Glaze colour', '#9db8a0'),
    P.bool('inlay', '상감 무늬', 'Inlaid cranes', true),
    P.bool('stand', '나무 받침', 'Wooden stand', true),
  ],
  tags: ['celadon', 'maebyeong', 'korean', 'goryeo', 'vase', '청자', '매병', '고려청자', '상감', '꽃병'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height;
    let y0 = 0;
    if (p.stand) {
      const sh = 0.03;
      k.lathe('stand', 'wood-dark', [[0, 0], [H * 0.24, 0], [H * 0.25, 0.006], [H * 0.24, sh - 0.008], [H * 0.2, sh], [0, sh]], 0, 0, 0, { segs: k.seg(36, 10) });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; k.box('stand', 'wood-dark', 0.02, 0.012, 0.02, Math.cos(a) * H * 0.2, 0.006, Math.sin(a) * H * 0.2, { r: 0.003 }); }
      y0 = sh;
    }
    const outer = scaleProf([[0.14, 0], [0.155, 0.015], [0.15, 0.04], [0.17, 0.25], [0.26, 0.58], [0.31, 0.76], [0.25, 0.87], [0.12, 0.925], [0.075, 0.935], [0.07, 0.97], [0.095, 0.99], [0.09, 1.0]], H);
    k.add('vase', 'ceramic-white', T(vesselGeo(k, outer, { wall: 0.005, segs: k.seg(48, 14), smoothN: 26, depth: H * 0.3 }), 0, y0, 0), { overrides: { color: p.glaze } });
    if (p.inlay) {
      const prof = spline(outer, 40);
      const yi = H * 0.6, ri = radiusAt(prof, yi);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.3;
        const ry = Math.PI / 2 - a;
        // crane: white body + wings, black head tip; flattened ellipsoids hugging the wall
        k.sphere('inlay', 'paint-white-matte', 1, Math.cos(a) * (ri - 0.0005), y0 + yi, Math.sin(a) * (ri - 0.0005), { scale: [H * 0.06, H * 0.016, 0.0025], ry, rz: 0.35, segs: k.seg(14, 6), rings: k.seg(8, 4), overrides: { color: '#efece2' } });
        const a2 = a + 0.42, y2 = H * 0.42, r2 = radiusAt(prof, y2);
        k.sphere('inlay2', 'paint-black-matte', 1, Math.cos(a2) * (r2 - 0.0004), y0 + y2, Math.sin(a2) * (r2 - 0.0004), { scale: [H * 0.03, H * 0.012, 0.002], ry: Math.PI / 2 - a2, segs: k.seg(10, 5), rings: k.seg(6, 3), overrides: { color: '#2d3a33' } });
      }
      for (const yy of [H * 0.82, H * 0.26]) {
        const rr = radiusAt(prof, yy);
        k.add('inlay', 'paint-white-matte', new THREE.TorusGeometry(rr, 0.0014, 4, k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, y0 + yy, 0), { overrides: { color: '#efece2' } });
      }
    }
    recentre(k);
    return k.group();
  },
});

const flutedVase = item({
  id: 'decor-fluted-vase', category: 'decor', placement: 'surface', ko: '골주름 꽃병', en: 'Fluted vase', size: [0.351, 0.641, 0.306], bboxSlack: [0.02, 0.01, 0.02],
  params: [
    P.len('height', '높이', 'Height', 0.32, 0.18, 0.5),
    P.int('flutes', '골 수', 'Flutes', 20, 12, 32),
    P.mat('material', '재질', 'Finish', 'ceramic-white', null),
    P.bool('olive', '올리브 가지', 'Olive branches', true),
  ],
  tags: ['fluted vase', 'ribbed', 'vase', 'olive', '골주름 꽃병', '꽃병', '화병', '올리브'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 0.32, n = p.flutes;
    const prof = scaleProf([[0.062, 0], [0.074, 0.02], [0.082, 0.12], [0.077, 0.22], [0.06, 0.29], [0.066, 0.32]], s);
    const mod = (phi) => 1 + 0.035 * Math.abs(Math.cos((n * phi) / 2));
    k.add('vase', p.material, vesselGeo(k, prof, { wall: 0.005, segs: k.hi ? n * 6 : Math.max(24, n * 2), mod }));
    if (p.olive) {
      const rand = rng(n + H * 10);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.2 + 0.4, lean = 0.3 + rand() * 0.3, len = 0.28 + rand() * 0.06;
        const cv = stemCurve([[0, H - 0.05, 0], [Math.cos(a) * 0.03, H + len * 0.4, Math.sin(a) * 0.03], [Math.cos(a) * Math.sin(lean) * len, H + Math.cos(lean) * len, Math.sin(a) * Math.sin(lean) * len]]);
        k.tube('stems', 'plant-stem', null, 0.002, { curve: cv, segs: k.seg(14, 5), radial: 4 });
        const nl = k.hi ? 14 : 6;
        for (let j = 1; j <= nl; j++) {
          const t = 0.2 + 0.8 * (j / nl), at = cv.getPointAt(t), tan = cv.getTangentAt(t);
          const yaw = Math.atan2(tan.x, tan.z);
          const g = leafGeo(0.055, 0.012, { nu: 2, nv: k.hi ? 4 : 2, droop: 0.15, fold: 0.3 });
          k.add('leaves', 'plant-leaf', placeLeaf(g, [at.x, at.y, at.z], yaw + (j % 2 ? 1 : -1) * (0.7 + rand() * 0.5), 0.6 + rand() * 0.3), { overrides: { color: '#7d8c5e' } });
        }
      }
    }
    recentre(k);
    return k.group();
  },
});

const glassBottles = item({
  id: 'decor-glass-bottles', category: 'decor', placement: 'surface', ko: '유리병 꽃병 세트', en: 'Glass bottle vases', size: [0.197, 0.606, 0.2], bboxSlack: [0.02, 0.01, 0.02],
  params: [
    P.pick('glass', '유리 색', 'Glass', 'mixed', [['mixed', '혼합(녹색·호박색)', 'Mixed green/amber'], ['clear', '투명', 'Clear']]),
    P.bool('stems', '가지', 'Stems', true),
  ],
  tags: ['bottle vase', 'glass vase', 'stems', '유리병', '유리 꽃병', '화병'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const bs = [
      { x: -0.06, z: 0.01, prof: [[0.034, 0], [0.036, 0.01], [0.036, 0.17], [0.029, 0.21], [0.012, 0.245], [0.011, 0.29], [0.013, 0.3]], col: '#7a9c74' },
      { x: 0.025, z: 0.025, prof: [[0.033, 0], [0.052, 0.03], [0.055, 0.07], [0.043, 0.11], [0.014, 0.14], [0.012, 0.17], [0.014, 0.18]], col: '#b07a3a' },
      { x: 0.07, z: -0.03, prof: [[0.021, 0], [0.025, 0.02], [0.025, 0.24], [0.012, 0.3], [0.009, 0.35], [0.011, 0.36]], col: null },
    ];
    const rand = rng(5);
    bs.forEach((b, i) => {
      const ov = p.glass === 'mixed' && b.col ? { overrides: { color: b.col } } : {};
      k.add(p.glass === 'mixed' && b.col ? 'glass' : 'glass-clear', p.glass === 'mixed' && b.col ? 'glass-tinted' : 'glass-clear', T(vesselGeo(k, b.prof, { wall: 0.0025, segs: k.seg(32, 10), depth: b.prof[b.prof.length - 1][1] - 0.004 }), b.x, 0, b.z), ov);
      const H = b.prof[b.prof.length - 1][1];
      const pr = spline(b.prof, 20), fill = H * 0.32;
      const wp = [[0, 0.004], ...pr.filter(([, y]) => y > 0.005 && y < fill).map(([r, y]) => [r - 0.0035, y]), [radiusAt(pr, fill) - 0.0035, fill], [0, fill]];
      k.lathe('water', 'water', wp, b.x, 0, b.z, { segs: k.seg(24, 8) });
      if (!p.stems) return;
      const lean = 0.2 + rand() * 0.25, a = i * 2.1 + 0.5, len = H * 0.45 + 0.08;
      const cv = stemCurve([[b.x, fill - 0.02, b.z], [b.x, H, b.z], [b.x + Math.cos(a) * Math.sin(lean) * len * 0.7, H + len * 0.6, b.z + Math.sin(a) * Math.sin(lean) * len * 0.7], [b.x + Math.cos(a) * Math.sin(lean) * len, H + len, b.z + Math.sin(a) * Math.sin(lean) * len]]);
      k.tube('stems', 'plant-leaf', null, 0.0015, { curve: cv, segs: k.seg(16, 5), radial: 4, overrides: { color: '#5d7a4c' } });
      const nl = k.hi ? 8 : 4;
      for (let j = 1; j <= nl; j++) {
        const t = 0.45 + 0.55 * (j / nl), at = cv.getPointAt(t), tan = cv.getTangentAt(t);
        const yaw = Math.atan2(tan.x, tan.z);
        const sz = i === 1 ? 0.014 : 0.036 * (1.1 - 0.4 * t);
        if (i === 1) k.sphere('flowers', 'paint-white-matte', sz * 0.6, at.x + Math.cos(j) * 0.012, at.y, at.z + Math.sin(j) * 0.012, { segs: k.seg(8, 4), rings: k.seg(6, 3), overrides: { color: '#f4efe6' } });
        else {
          const g = leafGeo(sz, i === 2 ? sz * 0.35 : sz * 0.85, { nu: 2, nv: k.hi ? 3 : 2, droop: 0.15, fold: 0.1, outline: (u) => Math.sin(Math.PI * Math.min(1, u)) ** 0.6 });
          k.add('leaves', 'plant-leaf', placeLeaf(g, [at.x, at.y, at.z], yaw + (j % 2 ? 1.7 : -1.7), 0.3), { overrides: { color: '#7f9c8f' } });
        }
      }
    });
    recentre(k);
    return k.group();
  },
});

/* ========================================================= bowls, objects */

const woodBowl = item({
  id: 'decor-wood-bowl', category: 'decor', placement: 'surface', ko: '원목 볼과 장식 구', en: 'Wooden bowl with orbs', size: [0.36, 0.139, 0.36],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.36, 0.24, 0.5),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.pick('filler', '채움', 'Filled with', 'orbs', [['orbs', '라탄 볼', 'Rattan orbs'], ['moss', '이끼 볼', 'Moss balls'], ['none', '없음', 'Empty']]),
  ],
  tags: ['bowl', 'wooden bowl', 'decorative balls', 'centerpiece', '원목 볼', '나무 그릇', '장식 볼', '센터피스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = R * 0.42;
    const outer = spline([[R * 0.36, 0], [R * 0.56, H * 0.12], [R * 0.86, H * 0.5], [R, H]], k.seg(12, 5));
    const inner = spline([[R - 0.009, H], [R * 0.84, H * 0.56], [R * 0.52, H * 0.24], [0, H * 0.19]], k.seg(12, 5));
    k.lathe('bowl', p.wood, [[0, 0.003], [R * 0.34, 0.003], ...outer, [R - 0.0045, H + 0.003], ...inner], 0, 0, 0, { segs: k.seg(48, 14) });
    if (p.filler !== 'none') {
      const fine = spline([[R - 0.009, H], [R * 0.84, H * 0.56], [R * 0.52, H * 0.24], [0, H * 0.19]], 40);
      const innerY = (rr) => radiusAt(fine.map(([a, b]) => [b, a]), Math.min(rr, R - 0.01));
      const r = R * (p.filler === 'orbs' ? 0.22 : 0.2), n = 4;
      const rho = r * 1.48;
      const ys = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.5;
        let yc = 0;
        for (let s = -10; s <= 10; s++) { const dx = (s / 10) * r * 0.98; yc = Math.max(yc, innerY(Math.abs(rho + dx)) + Math.sqrt(r * r - dx * dx)); }
        ys.push(yc);
        k.sphere('fill', p.filler === 'orbs' ? 'rattan' : 'plant-leaf-light', r, Math.cos(a) * rho, yc, Math.sin(a) * rho, { segs: k.seg(24, 10), rings: k.seg(16, 7), ry: i });
      }
      // one more resting in the hollow between the others
      k.sphere('fill', p.filler === 'orbs' ? 'rattan' : 'plant-leaf-light', r * 0.92, 0, Math.max(...ys) + Math.sqrt(Math.max(0, (r * 1.92) ** 2 - rho ** 2)) * 0.98, 0, { segs: k.seg(24, 10), rings: k.seg(16, 7) });
    }
    recentre(k);
    return k.group();
  },
});

function bird(k, mat, s) {
  k.sphere('bird', mat, 1, 0, 0.042 * s, 0, { scale: [0.031 * s, 0.03 * s, 0.05 * s], rx: -0.2, segs: k.seg(24, 10), rings: k.seg(16, 7) });
  k.sphere('bird', mat, 0.022 * s, 0, 0.078 * s, 0.038 * s, { segs: k.seg(18, 8), rings: k.seg(12, 5) });
  k.cyl('bird', mat, 0, 0.0065 * s, 0.018 * s, 0, 0.076 * s, 0.056 * s, { rx: Math.PI / 2, segs: k.seg(10, 5) });
  k.sphere('bird', mat, 1, 0, 0.055 * s, -0.058 * s, { scale: [0.02 * s, 0.005 * s, 0.035 * s], rx: 0.45, segs: k.seg(14, 6), rings: k.seg(8, 4) });
  for (const sx of [-1, 1]) {
    k.sphere('eyes', 'paint-black-matte', 0.0032 * s, sx * 0.0165 * s, 0.083 * s, 0.05 * s, { segs: 6, rings: 4 });
    k.rod('bird', mat, [sx * 0.01 * s, 0.016 * s, 0.002 * s], [sx * 0.011 * s, 0, 0.006 * s], 0.0028 * s, { segs: 5 });
  }
}

const birds = item({
  id: 'decor-bird-figurine', category: 'decor', placement: 'surface', ko: '새 오브제', en: 'Bird figurines', size: [0.189, 0.13, 0.148],
  params: [
    P.int('count', '마리 수', 'Birds', 2, 1, 2),
    P.mat('material', '재질', 'Material', 'ceramic-white', null),
    P.bool('block', '나무 받침', 'Wooden block', true),
  ],
  tags: ['bird', 'figurine', 'ornament', '새', '오브제', '피규어', '장식품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    let y0 = 0;
    if (p.block) { k.rbox('block', 'wood-oak', 0.18, 0.03, 0.09, 0.006, 0, 0.015, 0); y0 = 0.03; }
    transformAdded(k, () => bird(k, p.material, 1), p.count === 2 ? -0.04 : 0, y0, 0, 0.45);
    if (p.count === 2) transformAdded(k, () => bird(k, p.material, 0.78), 0.05, y0, 0.012, -0.7);
    recentre(k);
    return k.group();
  },
});

const hourglass = item({
  id: 'decor-hourglass', category: 'decor', placement: 'surface', ko: '모래시계', en: 'Hourglass', size: [0.12, 0.25, 0.12],
  params: [
    P.num('sand', '아래 모래 양', 'Sand fallen', 0.6, 0.05, 0.95, 0.05),
    P.mat('wood', '프레임', 'Frame', 'wood-walnut', null),
    P.color('color', '모래 색', 'Sand colour', '#d8b98a'),
  ],
  tags: ['hourglass', 'sand timer', '모래시계', '샌드 타이머'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 0.25, dt = 0.018, rr = 0.06;
    k.cyl('frame', p.wood, rr, rr, dt, 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('frame', p.wood, rr, rr, dt, 0, H - dt, 0, { segs: k.seg(32, 10) });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; k.cyl('frame', p.wood, 0.005, 0.005, H - 2 * dt, Math.cos(a) * 0.049, dt, Math.sin(a) * 0.049, { segs: k.seg(10, 5) }); }
    const g0 = dt, g1 = H - dt, mid = H / 2;
    const glass = spline([[0.03, g0], [0.04, g0 + 0.02], [0.039, g0 + 0.06], [0.016, mid - 0.012], [0.004, mid], [0.016, mid + 0.012], [0.039, g1 - 0.06], [0.04, g1 - 0.02], [0.03, g1]], k.seg(24, 10));
    k.lathe('glass', 'glass-clear', [[0, g0], ...glass, [0, g1]], 0, 0, 0, { segs: k.seg(32, 10) });
    const f = clamp(p.sand, 0.05, 0.95), ov = { overrides: { color: p.color } };
    const hb = 0.012 + 0.06 * f, ht = 0.07 * (1 - f);
    k.lathe('sand', 'paint-white-matte', [[0, g0 + 0.001], [0.029, g0 + 0.001], [0.036, g0 + 0.012], [0.03, g0 + hb * 0.7], [0.012, g0 + hb], [0, g0 + hb + 0.006]], 0, 0, 0, { segs: k.seg(24, 8), ...ov });
    if (ht > 0.006) {
      const top = mid + 0.014 + ht;
      k.lathe('sand', 'paint-white-matte', [[0, mid + 0.006], [0.012, mid + 0.012], [Math.min(0.036, 0.012 + ht * 0.6), top - 0.004], [0, top - 0.008]], 0, 0, 0, { segs: k.seg(24, 8), ...ov });
      k.cyl('sand', 'paint-white-matte', 0.0008, 0.0008, mid - g0 - hb, 0, g0 + hb, 0, { segs: 4, ...ov });
    }
    recentre(k);
    return k.group();
  },
});

const diffuser = item({
  id: 'decor-reed-diffuser', category: 'decor', placement: 'surface', ko: '리드 디퓨저', en: 'Reed diffuser', size: [0.13, 0.271, 0.137],
  params: [
    P.color('glass', '병 색', 'Bottle colour', '#9a6a3a'),
    P.int('reeds', '리드 수', 'Reeds', 8, 4, 14),
  ],
  tags: ['diffuser', 'reed diffuser', 'fragrance', '디퓨저', '리드 디퓨저', '방향제'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const prof = [[0.032, 0], [0.04, 0.01], [0.042, 0.06], [0.036, 0.09], [0.014, 0.105], [0.012, 0.115], [0.012, 0.12]];
    k.add('bottle', 'glass-tinted', vesselGeo(k, prof, { wall: 0.003, segs: k.seg(32, 10), depth: 0.115 }), { overrides: { color: p.glass } });
    const pr = spline(prof, 20), fill = 0.055;
    k.lathe('liquid', 'water', [[0, 0.005], ...pr.filter(([, y]) => y > 0.006 && y < fill).map(([r, y]) => [r - 0.0035, y]), [radiusAt(pr, fill) - 0.0035, fill], [0, fill]], 0, 0, 0, { segs: k.seg(24, 8), overrides: { color: '#d9b06a' } });
    k.cyl('collar', 'metal-black', 0.0135, 0.0135, 0.012, 0, 0.11, 0, { segs: k.seg(20, 8) });
    const rand = rng(p.reeds);
    for (let i = 0; i < p.reeds; i++) {
      const a = (i / p.reeds) * TAU + rand() * 0.3, lean = 0.12 + rand() * 0.22, L = 0.24 + rand() * 0.03;
      const b = [Math.cos(a) * 0.004, 0.02, Math.sin(a) * 0.004];
      k.rod('reeds', 'wood-dark', b, [b[0] + Math.cos(a) * Math.sin(lean) * L, b[1] + Math.cos(lean) * L, b[2] + Math.sin(a) * Math.sin(lean) * L], 0.0016, { segs: 4 });
    }
    recentre(k);
    return k.group();
  },
});

const PIECES = {
  p: [[0, 0], [0.015, 0], [0.015, 0.004], [0.011, 0.007], [0.0065, 0.02], [0.0055, 0.025], [0.009, 0.027], [0.0055, 0.029], [0.008, 0.033], [0.0075, 0.038], [0.004, 0.0415], [0, 0.042]],
  r: [[0, 0], [0.016, 0], [0.016, 0.004], [0.012, 0.008], [0.009, 0.034], [0.0125, 0.037], [0.0125, 0.05], [0.009, 0.05], [0.009, 0.046], [0, 0.046]],
  b: [[0, 0], [0.016, 0], [0.016, 0.004], [0.012, 0.008], [0.0065, 0.036], [0.0105, 0.039], [0.006, 0.042], [0.0085, 0.05], [0.006, 0.058], [0.002, 0.06], [0.003, 0.062], [0, 0.063]],
  q: [[0, 0], [0.017, 0], [0.017, 0.004], [0.013, 0.008], [0.0075, 0.046], [0.0115, 0.049], [0.0075, 0.052], [0.0125, 0.064], [0.0105, 0.067], [0.005, 0.068], [0.004, 0.071], [0, 0.072]],
  k: [[0, 0], [0.017, 0], [0.017, 0.004], [0.013, 0.008], [0.0075, 0.048], [0.0115, 0.051], [0.0075, 0.054], [0.0115, 0.066], [0.006, 0.068], [0, 0.068]],
  n: [[0, 0], [0.016, 0], [0.016, 0.004], [0.012, 0.008], [0.0105, 0.015], [0, 0.015]],
};

const chess = item({
  id: 'decor-chess-set', category: 'decor', placement: 'surface', ko: '체스 세트', en: 'Chess set', size: [0.38, 0.106, 0.38],
  params: [
    P.mat('board', '보드', 'Board', 'wood-walnut', null),
    P.mat('light', '흰 말·칸', 'Light pieces', 'wood-ash', null),
    P.mat('dark', '검은 말', 'Dark pieces', 'wood-dark', null),
  ],
  tags: ['chess', 'board game', 'chessboard', '체스', '보드게임', '체스판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = 0.042, B = 8 * s + 0.044, bt = 0.022;
    k.box('board', p.board, B, bt, B, 0, bt / 2, 0, { r: 0.004, segs: 2 });
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) k.box('squares', p.light, s - 0.0004, 0.001, s - 0.0004, (i - 3.5) * s, bt + 0.0003, (j - 3.5) * s, { r: 0 });
    k.slab('squares', p.light, frameShape(8 * s + 0.012, 8 * s + 0.012, 0.003), 0.0012, bt - 0.0006, { bevel: 0 });
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const segs = k.seg(14, 5);
    const piece = (type, x, z, role, mat, face) => {
      k.lathe(role, mat, PIECES[type], x, bt + 0.0013, z, { segs });
      const y = bt + 0.0013;
      if (type === 'k') { k.box(role, mat, 0.004, 0.016, 0.004, x, y + 0.075, z, { r: 0.001 }); k.box(role, mat, 0.011, 0.004, 0.004, x, y + 0.077, z, { r: 0.001 }); }
      if (type === 'n') {
        k.rbox(role, mat, 0.013, 0.034, 0.02, 0.005, x, y + 0.031, z - face * 0.002, { rx: face * 0.22, segs: 2 });
        k.rbox(role, mat, 0.011, 0.012, 0.024, 0.004, x, y + 0.043, z + face * 0.009, { rx: -face * 0.35, segs: 2 });
        k.cyl(role, mat, 0, 0.003, 0.008, x, y + 0.047, z - face * 0.004, { segs: 4 });
      }
    };
    for (let i = 0; i < 8; i++) {
      const x = (i - 3.5) * s;
      piece(back[i], x, 3.5 * s, 'white', p.light, -1);
      piece('p', x, 2.5 * s, 'white', p.light, -1);
      piece(back[i], x, -3.5 * s, 'black', p.dark, 1);
      piece('p', x, -2.5 * s, 'black', p.dark, 1);
    }
    recentre(k);
    return k.group();
  },
});

const basket = item({
  id: 'decor-blanket-basket', category: 'decor', ko: '담요 바구니', en: 'Basket with throws', size: [0.476, 0.504, 0.506],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.42, 0.3, 0.6),
    P.mat('basket', '바구니', 'Basket', 'rattan', null),
    P.mat('fabric', '담요', 'Throw', 'fabric-wool-charcoal', 'fabric'),
  ],
  tags: ['basket', 'blanket basket', 'throw', 'storage', '바구니', '담요', '라탄 바구니', '블랭킷'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = R * 2.05;
    const rows = k.hi ? 15 : 8;
    const out = [];
    // woven bands: each band bulges out between two thin grooves
    for (let i = 0; i <= rows; i++) {
      const t = i / rows, rb = R * (0.86 + 0.14 * t);
      out.push([rb, t * H]);
      if (i < rows) for (const f of k.hi ? [0.2, 0.5, 0.8] : [0.5]) { const tt = (i + f) / rows; out.push([R * (0.86 + 0.14 * tt) + 0.009 * Math.sin(Math.PI * f), tt * H]); }
    }
    const inn = out.slice().reverse().map(([r, y]) => [R * (0.86 + 0.14 * (y / H)) - 0.008, y]);
    k.lathe('basket', p.basket, [[0, 0], [R * 0.84, 0], ...out, [R + 0.006, H + 0.008], [R - 0.012, H + 0.006], ...inn.slice(1, -1), [R * 0.85, 0.012], [0, 0.012]], 0, 0, 0, { segs: k.seg(48, 14) });
    k.add('basket', p.basket, new THREE.TorusGeometry(R + 0.004, 0.009, k.seg(8, 4), k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, H + 0.002, 0));
    for (const s of [-1, 1]) k.add('rope', 'fabric-linen-beige', new THREE.TorusGeometry(0.045, 0.008, k.seg(8, 4), k.seg(16, 6), Math.PI).rotateY(Math.PI / 2).translate(s * (R + 0.015), H - 0.05, 0));
    // two rolled throws standing in the basket
    const roll = (x, z, r, L, rx, rz, mat) => {
      const prof = [[0, 0], [r * 0.7, 0], [r * 0.95, r * 0.12], [r, r * 0.4], [r, L - r * 0.4], [r * 0.95, L - r * 0.12], [r * 0.7, L], [0, L]];
      const g = new THREE.LatheGeometry(V2(prof), k.seg(24, 8));
      T(g, x, H * 0.08, z, rx, 0, rz);
      k.add('throws', mat, g);
      const sp = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * TAU * 2.2, rr = r * (0.15 + 0.8 * t); sp.push([Math.cos(a) * rr, L + 0.001, Math.sin(a) * rr]); }
      const sg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp.map((q) => new THREE.Vector3(...q))), k.seg(36, 10), 0.0022, 4);
      T(sg, x, H * 0.08, z, rx, 0, rz);
      k.add('throws', mat, sg);
    };
    roll(-R * 0.35, -R * 0.15, R * 0.36, H * 1.08, 0.12, 0.22, p.fabric);
    roll(R * 0.38, R * 0.05, R * 0.32, H * 1.0, -0.08, -0.18, 'fabric-linen-beige');
    // a third throw draped over the front rim
    const drape = (u, v) => {
      const x = (u - 0.5) * R * 1.2;
      const zr = Math.sqrt(Math.max(0, (R + 0.01) ** 2 - x * x));
      let y, z;
      if (v < 0.3) { const t = v / 0.3; y = H - 0.12 + t * 0.13; z = zr - 0.05 + t * 0.04; } else if (v < 0.45) { const t = (v - 0.3) / 0.15, a = t * Math.PI; y = H + 0.012 + Math.sin(a) * 0.012; z = zr - 0.01 + (1 - Math.cos(a)) * 0.018; } else { const t = (v - 0.45) / 0.55; y = H + 0.01 - t * H * 0.42; z = zr + 0.026 + t * 0.03; }
      z += 0.008 * Math.sin(u * 14) * v;
      return [x, y, z];
    };
    k.add('throw', 'fabric-cotton-white', shellGeo(k.seg(24, 8), k.seg(24, 8), drape, 0.008), { overrides: { color: '#c9a77e' } });
    recentre(k);
    return k.group();
  },
});

/* ============================================================ wall decor */

const ART = ['#c46a45', '#2f4a5c', '#d9b77a', '#7d8f6a', '#ece4d6', '#b9cdd8'];

/** Framed print (wall), centred at (x, y), facing +z, frame depth 0.025. */
function framedPrint(k, x, y, w, h, frame, art, matOn = true) {
  const fw = 0.02, depth = 0.025;
  k.panel('frame', frame, frameShape(w, h, fw), depth, x, y, 0, { bevel: 0.002 });
  const iw = w - 2 * fw, ih = h - 2 * fw;
  k.box('mat', 'paper', iw + 0.002, ih + 0.002, 0.004, x, y, -0.004, { r: 0 });
  const mb = matOn ? Math.min(iw, ih) * 0.14 : 0;
  const aw = iw - 2 * mb, ah = ih - 2 * mb, z = -0.0015;
  const field = (ci, x0, y0, x1, y1, dz = 0) => k.box(`art${ci}`, 'paint-white-matte', (x1 - x0) * aw, (y1 - y0) * ah, 0.001, x + ((x0 + x1 - 1) / 2) * aw, y + ((y0 + y1 - 1) / 2) * ah, z + dz, { r: 0, overrides: { color: ART[ci] } });
  const disc = (ci, cx, cy, r, dz = 0.0012) => k.cyl(`art${ci}`, 'paint-white-matte', r * aw, r * aw, 0.001, x + (cx - 0.5) * aw, y + (cy - 0.5) * ah, z + dz - 0.0005, { rx: Math.PI / 2, segs: k.seg(32, 10), overrides: { color: ART[ci] } });
  if (art === 'landscape') { field(5, 0, 0.42, 1, 1); field(3, 0, 0.22, 1, 0.42); field(1, 0, 0, 1, 0.22); disc(4, 0.72, 0.75, 0.09); }
  else if (art === 'circle') { field(4, 0, 0, 1, 1); disc(0, 0.5, 0.58, 0.3); field(1, 0.1, 0.12, 0.9, 0.2, 0.0012); }
  else if (art === 'blocks') { field(4, 0, 0, 1, 1); field(2, 0.08, 0.1, 0.62, 0.55, 0.0012); field(1, 0.4, 0.45, 0.92, 0.9, 0.0024); }
  else if (art === 'arch') { field(2, 0, 0, 1, 1); disc(0, 0.5, 0.42, 0.34); field(0, 0.16, 0, 0.84, 0.42, 0.0012); }
  else { field(4, 0, 0, 1, 1); const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([x + (t - 0.5) * aw * 0.8, y + Math.sin(t * Math.PI * 2.3) * ah * 0.2, z + 0.0012]); } k.tube('lines', 'paint-black-matte', pts, 0.0012, { radial: 4, segs: k.seg(40, 12) }); }
  k.box('glass', 'glass-clear', iw + 0.002, ih + 0.002, 0.002, x, y, depth / 2 - 0.005, { r: 0 });
}

const gallery = item({
  id: 'decor-gallery-wall', category: 'decor', placement: 'wall', elevation: 1.0, ko: '갤러리 월 액자 세트', en: 'Gallery wall set', size: [1.4, 0.777, 0.025],
  params: [
    P.len('width', '전체 폭', 'Overall width', 1.4, 0.9, 2.4),
    P.mat('frame', '프레임', 'Frames', 'wood-black', null),
    P.bool('mixed', '오크 프레임 섞기', 'Mix in oak frames', true),
  ],
  tags: ['gallery wall', 'frames', 'prints', 'wall art', '갤러리 월', '액자', '그림', '포스터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.width / 1.37;
    const L = [[-0.5, 0.74, 0.34, 0.44, 'landscape'], [-0.5, 0.33, 0.34, 0.26, 'lines'], [-0.06, 0.6, 0.44, 0.58, 'arch'], [0.36, 0.78, 0.3, 0.3, 'circle'], [0.36, 0.38, 0.3, 0.36, 'blocks'], [0.62, 0.58, 0.16, 0.2, 'circle']];
    L.forEach(([x, y, w, h, art], i) => framedPrint(k, x * s, y * s, w * s, h * s, p.mixed && i % 3 === 1 ? 'wood-oak' : p.frame, art, i !== 5));
    recentre(k);
    return k.group();
  },
});

const canvas = item({
  id: 'decor-canvas', category: 'decor', placement: 'wall', elevation: 1.0, ko: '캔버스 그림', en: 'Large canvas painting', size: [1, 0.8, 0.043],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.4, 2.0),
    P.len('height', '높이', 'Height', 0.8, 0.4, 1.6),
    P.pick('style', '그림', 'Painting', 'arches', [['arches', '무지개 아치', 'Arches'], ['field', '컬러 필드', 'Colour field'], ['waves', '물결', 'Waves']]),
  ],
  tags: ['canvas', 'painting', 'abstract', 'wall art', '캔버스', '그림', '추상화', '벽 그림'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.04;
    k.box('canvas', 'fabric-cotton-white', w, h, d, 0, h / 2, 0, { r: 0.004, segs: 2 });
    const fz = d / 2 + 0.0002;
    // paint layers stack 1.5 mm apart (bg at the bottom) so no two layers share a plane
    const paint = (role, color, shape, layer = 1) => k.panel(role, 'paint-white-matte', shape, 0.0012, 0, 0, fz + 0.0006 + layer * 0.0015, { bevel: 0.0003, curveSegs: 32, overrides: { color } });
    const m = 0.002;
    const bgRect = shapeOf([[-w / 2 + m, m], [w / 2 - m, m], [w / 2 - m, h - m], [-w / 2 + m, h - m]]);
    if (p.style === 'arches') {
      paint('bg', '#efe3cf', bgRect, 0);
      const cols = ['#b5643f', '#e0b48a', '#8f4b32', '#d6a05c'];
      const Rm = Math.min(w * 0.4, h * 0.62), by = h * 0.18, band = Rm / 4;
      for (let i = 0; i < 4; i++) {
        const R1 = Rm - i * band, R0 = Math.max(0, R1 - band + 0.004), steps = k.seg(40, 12);
        const pts = [];
        for (let j = 0; j <= steps; j++) { const a = Math.PI - (j / steps) * Math.PI; pts.push([Math.cos(a) * R1, by + Math.sin(a) * R1]); }
        if (R0 > 0.005) { pts.push([R1, by - h * 0.12], [R0, by - h * 0.12]); for (let j = 0; j <= steps; j++) { const a = (j / steps) * Math.PI; pts.push([Math.cos(a) * R0, by + Math.sin(a) * R0]); } pts.push([-R0, by - h * 0.12], [-R1, by - h * 0.12]); }
        else pts.push([R1, by]);
        paint(`p${i}`, cols[i], shapeOf(pts));
      }
    } else if (p.style === 'field') {
      paint('bg', '#2f3e46', bgRect, 0);
      const cols = ['#c86b4a', '#e2c27d', '#8aa39a'];
      [[0.62, 0.92], [0.36, 0.56], [0.08, 0.3]].forEach(([y0, y1], i) => paint(`p${i}`, cols[i], roundRectAt(-w * 0.42, h * y0, w * 0.84, h * (y1 - y0), Math.min(w, h) * 0.03)));
    } else {
      paint('bg', '#e9eef0', bgRect, 0);
      const cols = ['#9fbcd0', '#5f84a2', '#2f4b6e'];
      for (let i = 0; i < 3; i++) {
        const top = h * (0.62 - i * 0.2), pts = [[-w / 2 + m, m]];
        for (let j = 0; j <= 32; j++) { const t = j / 32; pts.push([-w / 2 + m + t * (w - 2 * m), top + h * 0.05 * Math.sin(t * Math.PI * 3 + i * 1.3)]); }
        pts.push([w / 2 - m, m]);
        paint(`p${i}`, cols[i], shapeOf(pts), i + 1);
      }
    }
    return k.group();
  },
});

const floatingShelf = item({
  id: 'decor-floating-shelf', category: 'decor', placement: 'wall', elevation: 1.2, ko: '플로팅 선반과 소품', en: 'Floating shelf with decor', size: [0.8, 0.232, 0.22],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.4, 1.6),
    P.mat('wood', '선반', 'Shelf', 'wood-oak', null),
    P.bool('objects', '소품', 'Objects', true),
    P.int('seed', '배열', 'Variation', 4, 1, 20),
  ],
  tags: ['floating shelf', 'wall shelf', 'shelf decor', '플로팅 선반', '벽 선반', '선반 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, t = 0.035, d = 0.22;
    k.box('shelf', p.wood, w, t, d, 0, t / 2, 0, { r: 0.003, segs: 2 });
    if (p.objects) {
      const bw = Math.min(0.22, w * 0.3);
      addBooks(k, -w / 2 + 0.03, -w / 2 + 0.03 + bw, t, -0.09, 0.16, p.seed, { hMax: 0.21, fill: 1, lean: false });
      const vx = w > 0.55 ? w * 0.1 : w * 0.25;
      k.add('vase', 'ceramic-terracotta', T(vesselGeo(k, [[0.035, 0], [0.05, 0.04], [0.05, 0.09], [0.028, 0.15], [0.022, 0.18], [0.026, 0.19]], { wall: 0.004, segs: k.seg(32, 10) }), vx, t, 0.01));
      if (w > 0.55) {
        k.lathe('jar', 'ceramic-white', [[0, 0], [0.045, 0], [0.048, 0.01], [0.048, 0.07], [0.044, 0.075], [0, 0.075]], w / 2 - 0.09, t, -0.01, { segs: k.seg(32, 10) });
        k.lathe('jar', 'ceramic-white', [[0, 0], [0.049, 0], [0.049, 0.012], [0.02, 0.022], [0.012, 0.03], [0, 0.034]], w / 2 - 0.09, t + 0.075, -0.01, { segs: k.seg(32, 10) });
        k.sphere('orb', 'metal-brass', 0.03, w / 2 - 0.2, t + 0.03, 0.04, { segs: k.seg(20, 8), rings: k.seg(14, 6) });
      }
    }
    recentre(k);
    return k.group();
  },
});

const wallPlates = item({
  id: 'decor-wall-plates', category: 'decor', placement: 'wall', elevation: 1.2, ko: '벽 장식 접시', en: 'Decorative wall plates', size: [0.75, 0.62, 0.023],
  params: [
    P.len('scale', '크기', 'Scale', 1, 0.6, 1.6, 0.05),
    P.color('pattern', '무늬 색', 'Pattern colour', '#2f5d8a'),
    P.color('accent', '포인트 색', 'Accent colour', '#c46a45'),
  ],
  tags: ['wall plates', 'plates', 'ceramic', 'wall decor', '장식 접시', '벽 접시', '도자기', '벽 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.scale;
    const set = [[0, 0.3, 0.32], [-0.27, 0.42, 0.2], [0.27, 0.45, 0.22], [-0.25, 0.12, 0.18], [0.25, 0.13, 0.15], [0, 0.58, 0.14]];
    set.forEach(([x, y, dd], i) => {
      const R = (dd / 2) * S, X = x * S, Y = y * S;
      const prof = [[0, 0.003], [R * 0.42, 0.003], [R * 0.44, 0], [R * 0.5, 0], [R * 0.53, 0.004], [R * 0.9, 0.014], [R, 0.02], [R * 0.985, 0.023], [R * 0.9, 0.0195], [R * 0.55, 0.0095], [R * 0.5, 0.0075], [0, 0.0075]];
      k.lathe('plate', 'ceramic-white', prof, X, Y, -0.0115, { rx: Math.PI / 2, segs: k.seg(40, 12) });
      // painted band on the well (follows the slope of the front face)
      const zf = (r) => 0.0095 + ((r - R * 0.55) / (R * 0.35)) * 0.01 - 0.0115;
      const [main, second] = i % 2 ? ['accent', 'pattern'] : ['pattern', 'accent'];
      const col = { pattern: { color: p.pattern }, accent: { color: p.accent } };
      const r1 = R * 0.8, r2 = R * 0.87;
      const band = [[r1, zf(r1) + 0.0004], [r2, zf(r2) + 0.0004], [r2, zf(r2) + 0.0012], [r1, zf(r1) + 0.0012], [r1, zf(r1) + 0.0004]];
      const g = new THREE.LatheGeometry(V2(band), k.seg(40, 12));
      g.rotateX(Math.PI / 2);
      g.translate(X, Y, 0);
      k.add(main, 'paint-white-matte', g, { overrides: col[main] });
      // a ring of dots on the slope and a flower in the well
      const nd = 14 + Math.round(R * 60), rd = R * 0.68, slope = Math.atan(0.01 / (R * 0.35));
      for (let j = 0; j < nd; j++) {
        const a = (j / nd) * TAU;
        k.sphere(second, 'paint-white-matte', 1, X + Math.cos(a) * rd, Y + Math.sin(a) * rd, zf(rd) + 0.0002, { scale: [R * 0.035, R * 0.035, 0.001], rx: -Math.sin(a) * slope, ry: Math.cos(a) * slope, segs: k.seg(8, 4), rings: k.seg(5, 3), overrides: col[second] });
      }
      const zw = 0.0075 - 0.0115 + 0.0002;
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * TAU;
        k.sphere(main, 'paint-white-matte', 1, X + Math.cos(a) * R * 0.17, Y + Math.sin(a) * R * 0.17, zw, { scale: [R * 0.14, R * 0.055, 0.0012], rz: a, segs: k.seg(12, 6), rings: k.seg(6, 3), overrides: col[main] });
      }
      k.cyl(second, 'paint-white-matte', R * 0.06, R * 0.06, 0.0012, X, Y, zw, { rx: Math.PI / 2, segs: k.seg(16, 6), overrides: col[second] });
    });
    recentre(k);
    return k.group();
  },
});

const macrame = item({
  id: 'decor-macrame', category: 'decor', placement: 'wall', elevation: 1.0, ko: '마크라메 벽걸이', en: 'Macramé wall hanging', size: [0.6, 0.783, 0.026],
  params: [
    P.len('width', '폭', 'Width', 0.5, 0.3, 0.9),
    P.len('length', '길이', 'Length', 0.8, 0.45, 1.3),
    P.mat('cord', '끈', 'Cord', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['macrame', 'wall hanging', 'boho', 'cord', '마크라메', '벽걸이', '보헤미안', '태피스트리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, L = p.length, top = L - 0.012;
    k.rod('dowel', 'wood-oak', [-w / 2 - 0.05, top, 0], [w / 2 + 0.05, top, 0], 0.012, { segs: k.seg(14, 6) });
    const n = 2 * Math.max(4, Math.round((w - 0.06) / 0.05)), pitch = (w - 0.06) / (n - 1);
    const xs = Array.from({ length: n }, (_, i) => -w / 2 + 0.03 + i * pitch);
    const rows = Math.max(3, Math.round((L * 0.5) / 0.05));
    const rowY = (j) => top - 0.06 - j * 0.05;
    const knots = [];
    const rand = rng(n);
    for (let i = 0; i < n; i++) {
      const pts = [[xs[i], top, 0.004], [xs[i], top - 0.03, 0.006]];
      for (let j = 0; j < rows; j++) {
        const off = j % 2;
        const partner = (i - off) % 2 === 0 ? i + 1 : i - 1;
        if (partner < 0 || partner >= n || (off && (i === 0 || i === n - 1))) { pts.push([xs[i], rowY(j), 0.006]); continue; }
        const mid = (xs[i] + xs[partner]) / 2;
        pts.push([mid + (i < partner ? -0.004 : 0.004), rowY(j), 0.006]);
        if (i < partner) knots.push([mid, rowY(j)]);
      }
      const yEnd = rowY(rows - 1) - 0.06;
      const c = (n - 1) / 2, yb = 0.18 * (L / 0.8) * (Math.abs(i - c) / c) + rand() * 0.01;
      pts.push([xs[i], yEnd, 0.006], [xs[i] + (rand() - 0.5) * 0.01, Math.min(yEnd - 0.05, yb + (yEnd - yb) * 0.5), 0.007], [xs[i] + (rand() - 0.5) * 0.012, yb, 0.008]);
      k.tube('cord', p.cord, pts, 0.0032, { segs: k.seg(L * 90, 16), radial: k.seg(6, 3) });
    }
    for (const [x, y] of knots) k.sphere('cord', p.cord, 0.0085, x, y, 0.008, { scale: [1.2, 1, 0.7], segs: k.seg(10, 4), rings: k.seg(7, 3) });
    for (let i = 0; i < n; i += 2) k.cyl('cord', p.cord, 0.007, 0.007, 0.014, (xs[i] + xs[i + 1]) / 2, top - 0.035, 0.006, { segs: k.seg(10, 4) });
    recentre(k);
    return k.group();
  },
});

const tapestry = item({
  id: 'decor-tapestry', category: 'decor', placement: 'wall', elevation: 0.9, ko: '태피스트리', en: 'Woven tapestry', size: [1.05, 1.215, 0.029],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.5, 2.0),
    P.len('height', '높이', 'Height', 1.2, 0.6, 2.2),
    P.pick('pattern', '무늬', 'Pattern', 'sun', [['sun', '해', 'Sun'], ['stripes', '줄무늬', 'Stripes']]),
    P.mat('rod', '봉', 'Rod', 'wood-oak', null),
  ],
  tags: ['tapestry', 'wall hanging', 'woven', 'boho', '태피스트리', '벽걸이', '직조', '패브릭 포스터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, fy0 = 0.08, fy1 = h - 0.01;
    k.rod('rod', p.rod, [-w / 2 - 0.05, h, 0], [w / 2 + 0.05, h, 0], 0.009, { segs: k.seg(14, 6) });
    for (const s of [-1, 1]) k.sphere('rod', p.rod, 0.015, s * (w / 2 + 0.06), h, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    const zf = (x) => 0.004 * Math.sin(x * 14) + 0.002 * Math.sin(x * 31) - 0.004;
    const nu = k.seg(Math.round(w * 50), 10);
    const piece = (role, mat, x0, x1, y0, y1, color, off, nv = 2) => k.add(role, mat, shellGeo(Math.max(2, Math.round(nu * (x1 - x0) / w)), nv, (u, v) => { const x = x0 + u * (x1 - x0); return [x, y0 + v * (y1 - y0), zf(x) + off]; }, off ? 0.001 : 0.003), color ? { overrides: { color } } : {});
    piece('fabric', 'fabric-linen-white', -w / 2, w / 2, fy0, fy1, '#e8dcc7', 0);
    const H = fy1 - fy0, Y = (t) => fy0 + t * H;
    if (p.pattern === 'sun') {
      piece('band1', 'fabric-terracotta', -w / 2, w / 2, Y(0.12), Y(0.2), null, 0.0035);
      piece('band2', 'fabric-linen-beige', -w / 2, w / 2, Y(0.24), Y(0.27), '#6b4630', 0.0035);
      piece('band1', 'fabric-terracotta', -w / 2, w / 2, Y(0.86), Y(0.9), null, 0.0035);
      const R = Math.min(w * 0.3, H * 0.28), cy = Y(0.36);
      const sun = (u, v) => { const a = Math.PI * (1 - u), r = v * R; const x = Math.cos(a) * r; return [x, cy + Math.sin(a) * r, zf(x) + 0.0035]; };
      k.add('sun', 'fabric-mustard', shellGeo(k.seg(32, 10), 3, sun, 0.001));
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.06 + 0.88 * (i / 8)), r0 = R + 0.03, r1 = R + 0.03 + H * 0.12;
        const ray = (u, v) => { const r = r0 + u * (r1 - r0), aa = a + (v - 0.5) * 0.06; const x = Math.cos(aa) * r; return [x, cy + Math.sin(aa) * r, zf(x) + 0.0035]; };
        k.add('sun', 'fabric-mustard', shellGeo(4, 1, ray, 0.001));
      }
    } else {
      const cols = [['fabric-terracotta', null], ['fabric-mustard', null], ['fabric-linen-beige', '#6b4630'], ['fabric-terracotta', null], ['fabric-navy', null], ['fabric-mustard', null]];
      [[0.08, 0.16], [0.2, 0.23], [0.3, 0.42], [0.5, 0.53], [0.6, 0.72], [0.8, 0.86]].forEach(([a, b], i) => piece(`band${i % 3}`, cols[i][0], -w / 2, w / 2, Y(a), Y(b), cols[i][1], 0.0035));
    }
    const nf = Math.round(w / (k.hi ? 0.012 : 0.03));
    for (let i = 0; i < nf; i++) { const x = -w / 2 + (i + 0.5) * (w / nf); k.box('fringe', 'fabric-linen-white', 0.004, fy0 + 0.004, 0.002, x, (fy0 + 0.004) / 2, zf(x) + 0.0015, { r: 0, overrides: { color: '#e8dcc7' } }); }
    recentre(k);
    return k.group();
  },
});

const sunMirror = item({
  id: 'decor-sunburst-mirror', category: 'decor', placement: 'wall', elevation: 1.2, ko: '선버스트 거울', en: 'Sunburst mirror', size: [0.806, 0.794, 0.03],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.8, 0.5, 1.2),
    P.int('rays', '살 개수', 'Rays', 36, 16, 60),
    P.mat('metal', '프레임', 'Frame', 'metal-gold', null),
  ],
  tags: ['mirror', 'sunburst mirror', 'wall mirror', '거울', '선버스트 거울', '벽거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = p.diameter, R0 = D * 0.22, cy = D / 2;
    const ring = ellipse(2 * R0 + 0.05, 2 * R0 + 0.05);
    ring.holes.push(new THREE.Path(ellipse(2 * R0, 2 * R0).getPoints(64).reverse()));
    k.panel('frame', p.metal, ring, 0.03, 0, cy, 0, { bevel: 0.006, bevelSegs: 3, curveSegs: 64 });
    k.panel('mirror', 'mirror', ellipse(2 * R0 + 0.004, 2 * R0 + 0.004), 0.006, 0, cy, -0.004, { bevel: 0.001, curveSegs: 64 });
    const pat = [1, 0.72, 0.86, 0.72];
    for (let i = 0; i < p.rays; i++) {
      const a = (i / p.rays) * TAU, L = (D / 2) * pat[i % 4];
      const dx = Math.sin(a), dy = Math.cos(a), r0 = R0 + 0.02;
      k.rod('frame', p.metal, [dx * r0, cy + dy * r0, -0.004], [dx * L, cy + dy * L, -0.004], 0.006, { r2: 0.0018, segs: k.seg(8, 4) });
      if (i % 4 === 0) k.sphere('frame', p.metal, 0.009, dx * L, cy + dy * L, -0.004, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    recentre(k);
    return k.group();
  },
});

const floorMirror = item({
  id: 'decor-floor-mirror', category: 'decor', ko: '기대는 전신 거울', en: 'Leaning floor mirror', size: [0.6, 1.691, 0.242],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.4, 1.0),
    P.len('height', '높이', 'Height', 1.7, 1.2, 2.0),
    P.pick('shape', '모양', 'Shape', 'arch', [['arch', '아치', 'Arch'], ['rect', '사각', 'Rectangle']]),
    P.mat('frame', '프레임', 'Frame', 'wood-oak', null),
  ],
  tags: ['mirror', 'floor mirror', 'full length mirror', '거울', '전신 거울', '스탠드 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, b = 0.04, lean = 0.12;
    const outer = (ww, hh) => {
      if (p.shape === 'rect') return roundRectAt(-ww / 2, -hh / 2, ww, hh, 0.008);
      const s = new THREE.Shape(), r = ww / 2;
      s.moveTo(-r, -hh / 2); s.lineTo(r, -hh / 2); s.lineTo(r, hh / 2 - r); s.absarc(0, hh / 2 - r, r, 0, Math.PI, false); s.lineTo(-r, -hh / 2);
      return s;
    };
    const m = new THREE.Matrix4().makeRotationX(-lean);
    applyAdded(k, () => {
      const ring = outer(w, h);
      ring.holes.push(new THREE.Path(outer(w - 2 * b, h - 2 * b).getPoints(48).reverse()));
      k.panel('frame', p.frame, ring, 0.035, 0, h / 2, 0, { bevel: 0.005, bevelSegs: 2, curveSegs: 48 });
      k.panel('mirror', 'mirror', outer(w - 2 * b + 0.006, h - 2 * b + 0.006), 0.006, 0, h / 2, -0.005, { bevel: 0.001, curveSegs: 48 });
      k.panel('frame', 'plywood', outer(w - 0.01, h - 0.01), 0.004, 0, h / 2, -0.0155, { bevel: 0.001, curveSegs: 48 });
    }, m);
    k.box('frame', 'rubber-black', w * 0.6, 0.006, 0.02, 0, 0.003, 0.012, { r: 0.002 });
    recentre(k);
    return k.group();
  },
});

/* ======================================================= window textiles */

const rollerBlind = item({
  id: 'decor-roller-blind', category: 'decor', placement: 'wall', elevation: 0.9, ko: '롤 블라인드', en: 'Roller blind', size: [1.246, 1.6, 0.082],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.5, 3.0),
    P.len('height', '높이', 'Height', 1.6, 0.6, 2.6),
    P.num('open', '말아 올림', 'Rolled up', 0.25, 0, 0.95, 0.05),
    P.mat('fabric', '원단', 'Fabric', 'fabric-cotton-grey', 'fabric'),
    P.mat('cassette', '케이스', 'Cassette', 'metal-white', null),
  ],
  tags: ['roller blind', 'blind', 'window shade', '롤 블라인드', '블라인드', '롤스크린', '창문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, cas = 0.075, cd = 0.08;
    k.rbox('cassette', p.cassette, w + 0.03, cas, cd, 0.012, 0, h - cas / 2, 0, { segs: k.seg(3, 1) });
    for (const s of [-1, 1]) k.box('cassette', 'plastic-grey', 0.008, cas - 0.004, cd - 0.004, s * (w / 2 + 0.019), h - cas / 2, 0, { r: 0.002 });
    const full = h - cas - 0.06;
    const L = Math.max(0.03, full * (1 - clamp(p.open, 0, 0.95)));
    k.box('fabric', p.fabric, w, L + 0.01, 0.0015, 0, h - cas + 0.005 - (L + 0.01) / 2, 0.022, { r: 0 });
    k.rbox('bar', 'metal-aluminium', w - 0.004, 0.022, 0.012, 0.005, 0, h - cas - L, 0.022, { segs: k.seg(3, 1) });
    const cx = w / 2 - 0.02;
    for (const dx of [-0.004, 0.004]) k.rod('chain', 'plastic-white', [cx + dx, h - cas, 0.036], [cx + dx, 0.03, 0.036], 0.0016, { segs: 5 });
    k.cyl('chain', 'plastic-white', 0.006, 0.006, 0.03, cx, 0, 0.036, { segs: k.seg(12, 5) });
    return k.group();
  },
});

const venetian = item({
  id: 'decor-venetian-blind', category: 'decor', placement: 'wall', elevation: 0.9, ko: '베니션 블라인드', en: 'Venetian blind', size: [1.21, 1.5, 0.065],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.5, 2.6),
    P.len('height', '높이', 'Height', 1.5, 0.6, 2.4),
    P.num('tilt', '슬랫 각도', 'Slat tilt', 0.45, 0, 1.3, 0.05),
    P.mat('slat', '슬랫', 'Slats', 'metal-white', null),
  ],
  tags: ['venetian blind', 'blind', 'slats', '베니션 블라인드', '블라인드', '알루미늄 블라인드', '우드 블라인드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, head = 0.045, pitch = 0.024, sw = 0.025;
    k.box('rail', p.slat, w + 0.01, head, 0.055, 0, h - head / 2, 0, { r: 0.004 });
    const n = Math.max(3, Math.floor((h - head - 0.1) / pitch));
    let y = h - head - 0.016;
    for (let i = 0; i < n; i++, y -= pitch) k.box('slats', p.slat, w, 0.0012, sw, 0, y, 0, { r: 0, rx: p.tilt });
    const yb = y;
    k.box('rail', p.slat, w, 0.012, 0.03, 0, yb, 0, { r: 0.003 });
    const cxs = w > 1.4 ? [-w / 2 + 0.12, 0, w / 2 - 0.12] : [-w / 2 + 0.12, w / 2 - 0.12];
    const zc = (sw / 2) * Math.cos(p.tilt);
    for (const x of cxs) for (const s of [-1, 1]) k.rod('cords', 'fabric-cotton-white', [x, h - head, s * zc], [x, yb, s * zc], 0.0007, { segs: 4 });
    k.rod('wand', 'plastic-white', [w / 2 - 0.05, h - head, 0.03], [w / 2 - 0.05, h - head - Math.min(0.75, h * 0.5), 0.03], 0.004, { segs: k.seg(8, 4) });
    for (const dx of [-0.003, 0.003]) k.rod('cords', 'fabric-cotton-white', [-w / 2 + 0.05 + dx, h - head, 0.03], [-w / 2 + 0.05 + dx, 0.035, 0.03], 0.0008, { segs: 4 });
    k.lathe('cords', 'fabric-cotton-white', [[0, 0], [0.006, 0.004], [0.007, 0.025], [0.003, 0.038], [0, 0.04]], -w / 2 + 0.05, 0, 0.03, { segs: k.seg(10, 5) });
    recentre(k, { y: false });
    return k.group();
  },
});

const romanBlind = item({
  id: 'decor-roman-blind', category: 'decor', placement: 'wall', elevation: 0.9, ko: '로만 셰이드', en: 'Roman blind', size: [1.139, 1.504, 0.073],
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.5, 2.4),
    P.len('height', '높이', 'Height', 1.5, 0.6, 2.4),
    P.num('raised', '올림 정도', 'Raised', 0.35, 0, 0.8, 0.05),
    P.mat('fabric', '원단', 'Fabric', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['roman blind', 'roman shade', 'blind', '로만 셰이드', '로만 블라인드', '블라인드', '창문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, f = 0.085;
    k.soft('fabric', p.fabric, w + 0.02, 0.05, 0.05, 0.012, 0, h - 0.025, 0, { puff: 0.004 });
    const raised = clamp(p.raised, 0, 0.8);
    const nf = Math.round(raised * 7);
    const yt = h - 0.05, total = yt - 0.06;
    const flat = Math.max(0.05, total * (1 - raised) - (nf ? f * 0.25 : 0));
    const yb = yt - flat;
    const fn = (u, v) => { const y = yb + v * flat; return [-w / 2 + u * w, y, 0.012 + 0.003 * Math.sin(((yt - y) / 0.22) * TAU)]; };
    k.add('fabric', p.fabric, shellGeo(4, k.seg(Math.max(6, flat * 50), 4), fn, 0.003));
    for (let y = yt - 0.22; y > yb + 0.05; y -= 0.22) k.rod('seams', p.fabric, [-w / 2, y, 0.0145], [w / 2, y, 0.0145], 0.0015, { segs: 4 });
    for (let j = 0; j < nf; j++) {
      const y = yb - j * f * 0.55 - f / 2 + 0.01;
      k.soft('fabric', p.fabric, w, f, 0.036 + j * 0.004, 0.016, 0, y, 0.022 + j * 0.003, { puff: 0.006 });
    }
    k.rod('cord', 'fabric-cotton-white', [w / 2 + 0.02, h - 0.03, 0.0], [w / 2 + 0.02, 0.04, 0.0], 0.0015, { segs: 4 });
    k.lathe('cord', 'wood-oak', [[0, 0], [0.007, 0.005], [0.008, 0.022], [0.004, 0.036], [0, 0.04]], w / 2 + 0.02, 0, 0, { segs: k.seg(12, 5) });
    recentre(k, { y: false });
    return k.group();
  },
});

const drapes = item({
  id: 'decor-tieback-drapes', category: 'decor', placement: 'wall', elevation: 0, ko: '타이백 드레이프 커튼', en: 'Tie-back drapes', size: [2.5, 2.488, 0.244],
  params: [
    P.len('width', '폭', 'Width', 2.2, 1.2, 5),
    P.len('height', '높이', 'Height', 2.5, 1.8, 3.2),
    P.num('tie', '묶는 높이', 'Tie-back height', 0.4, 0.25, 0.6, 0.05),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-green', 'fabric'),
    P.mat('rod', '커튼봉', 'Rod', 'metal-brass', 'metal'),
  ],
  tags: ['curtains', 'drapes', 'tie-back', 'velvet', '커튼', '드레이프', '타이백', '벨벳 커튼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, rodY = h - 0.03, rz = 0.0;
    k.rod('rod', p.rod, [-w / 2 - 0.08, rodY, rz], [w / 2 + 0.08, rodY, rz], 0.014, { segs: k.seg(14, 6) });
    for (const s of [-1, 1]) {
      k.lathe('rod', p.rod, [[0, 0], [0.016, 0.004], [0.012, 0.02], [0.028, 0.045], [0.02, 0.07], [0, 0.075]], s * (w / 2 + 0.075), rodY, rz, { rz: -s * Math.PI / 2, segs: k.seg(16, 6) });
      k.rod('rod', p.rod, [s * (w / 2 - 0.05), rodY, -0.09], [s * (w / 2 - 0.05), rodY, rz], 0.007);
      k.cyl('rod', p.rod, 0.022, 0.022, 0.01, s * (w / 2 - 0.05), rodY, -0.1, { rx: Math.PI / 2, segs: k.seg(14, 6) });
    }
    const span = (w / 2) * 0.94, top = rodY - 0.03, hem = 0.01, vt = clamp(p.tie, 0.25, 0.6);
    const waves = Math.max(5, Math.round((span * 1.6) / 0.14));
    const wfOf = (v) => (v >= vt ? lerp(0.2, 1, Math.pow((v - vt) / (1 - vt), 0.75)) : lerp(0.2, 0.42, smooth((vt - v) / vt)));
    for (const s of [-1, 1]) {
      const xOuter = s * (w / 2 + 0.03);
      const fn = (u, v) => {
        const wf = wfOf(v), y = hem + (top - hem) * v;
        const amp = 0.022 + 0.05 * (1 - wf);
        const x = xOuter - s * u * span * wf;
        const z = amp * Math.sin(u * waves * TAU) + 0.045 * (1 - wf) * (1 - 0.4 * u);
        return [x, y, z];
      };
      k.add('curtain', p.fabric, shellGeo(k.seg(waves * 6, 20), k.seg(32, 12), fn, 0.004));
      for (let i = 0; i <= waves; i++) k.add('rings', p.rod, new THREE.TorusGeometry(0.022, 0.004, k.seg(6, 3), k.seg(14, 6)).translate(xOuter - s * (i / waves) * span, rodY, rz));
      const yt = hem + (top - hem) * vt, a = (span * 0.2) / 2 + 0.03, cxT = xOuter - s * span * 0.1, zc = 0.045 * 0.8 * 0.9;
      const loop = [];
      for (let i = 0; i < 24; i++) { const t = (i / 24) * TAU; loop.push([cxT + Math.cos(t) * a, yt, zc + Math.sin(t) * (0.08 + 0.02)]); }
      k.tube('tieback', p.fabric, loop, 0.012, { closed: true, segs: k.seg(36, 12), radial: k.seg(8, 4) });
      k.rod('rod', p.rod, [xOuter + s * 0.01, yt, -0.09], [xOuter - s * 0.01, yt, zc - 0.09], 0.006);
    }
    recentre(k, { y: false });
    return k.group();
  },
});

/* ================================================================== rugs */

const RUNNER = { terracotta: ['#b5643f', '#e6d6bd', '#2f3e55'], blue: ['#2f4b6e', '#e3d8c3', '#b8574a'], grey: ['#9a968f', '#3d3e41', '#e7e1d5'] };

function fringeEnds(k, L, W, len = 0.05) {
  const n = Math.round(W / (k.hi ? 0.014 : 0.035));
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) k.box('fringe', 'paper', len + 0.01, 0.003, 0.004, s * (L / 2 + len / 2 - 0.005), 0.0015, -W / 2 + 0.01 + (i + 0.5) * ((W - 0.02) / n), { r: 0 });
}

const runner = item({
  id: 'decor-runner-rug', category: 'decor', ko: '러너 러그', en: 'Runner rug', size: [2.5, 0.013, 0.75],
  params: [
    P.len('length', '길이', 'Length', 2.4, 1.5, 5),
    P.len('width', '폭', 'Width', 0.75, 0.55, 1.2),
    P.pick('palette', '색 조합', 'Colours', 'terracotta', [['terracotta', '테라코타', 'Terracotta'], ['blue', '블루', 'Blue'], ['grey', '그레이', 'Grey']]),
    P.bool('fringe', '술 장식', 'Fringe', true),
  ],
  tags: ['runner', 'rug', 'hallway rug', '러너', '러그', '복도 러그', '카펫'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = p.width, t = 0.01, [field, border, accent] = RUNNER[p.palette];
    k.slab('rug', 'rug-wool-cream', roundRect(L, W, 0.008), t, 0, { bevel: 0.003, overrides: { color: field } });
    inlay(k, 'border', frameShape(L - 0.06, W - 0.06, 0.06), t, border);
    inlay(k, 'accent', frameShape(L - 0.22, W - 0.22, 0.014), t, accent);
    const n = Math.max(2, Math.round((L - 0.4) / 0.42)), step = (L - 0.4) / n;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.2 + step * (i + 0.5);
      inlay(k, 'accent', diamond(x, 0, step * 0.36, (W - 0.34) / 2), t, accent);
      inlay(k, 'border', diamond(x, 0, step * 0.2, (W - 0.34) / 2 * 0.55), t, border, 1);
    }
    if (p.fringe) fringeEnds(k, L, W);
    return k.group();
  },
});

const shag = item({
  id: 'decor-shag-rug', category: 'decor', ko: '샤기 러그', en: 'Shag rug', size: [2, 0.045, 1.4],
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round']]),
    P.len('width', '폭', 'Width', 2.0, 0.8, 3.5),
    P.len('depth', '깊이', 'Depth', 1.4, 0.6, 3.0),
    P.mat('material', '재질', 'Pile', 'carpet-grey', 'carpet'),
  ],
  tags: ['shag rug', 'rug', 'fluffy', 'high pile', '샤기 러그', '러그', '털 러그', '카펫'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const round = p.shape === 'round';
    const w = p.width, d = round ? p.width : p.depth, base = 0.012;
    k.slab('rug', p.material, round ? ellipse(w, d) : superEllipse(w, d, 8, 72), base, 0, { bevel: 0.004, curveSegs: 48 });
    const rand = rng(w * 13 + d * 7);
    const pile = (e) => base - 0.001 + (0.022 + 0.012 * rand()) * smooth(clamp(e / 0.05, 0, 1));
    let g;
    if (round) {
      const R = w / 2 - 0.004;
      g = gridGeo(k.seg(Math.min(160, Math.round(R * 2 * Math.PI * 35)), 24), k.seg(Math.min(70, Math.round(R * 45)), 8), (u, v) => { const a = u * TAU, r = v * R; return [Math.cos(a) * r, pile(R - r), Math.sin(a) * r]; });
    } else {
      const nu = k.seg(Math.min(130, Math.round(w * 55)), 16), nv = k.seg(Math.min(130, Math.round(d * 55)), 12);
      const iw = w - 0.03, id = d - 0.03;
      g = gridGeo(nu, nv, (u, v) => { const x = (u - 0.5) * iw, z = (v - 0.5) * id; return [x, pile(Math.min(iw / 2 - Math.abs(x), id / 2 - Math.abs(z))), z]; });
    }
    k.add('pile', p.material, faceUp(g));
    return k.group();
  },
});

const kilim = item({
  id: 'decor-kilim-rug', category: 'decor', ko: '킬림 러그', en: 'Kilim flat-weave rug', size: [2, 0.012, 1.4],
  params: [
    P.len('width', '폭', 'Width', 2.0, 1.0, 4.0),
    P.len('depth', '깊이', 'Depth', 1.4, 0.7, 3.0),
    P.pick('palette', '색 조합', 'Colours', 'warm', [['warm', '웜(레드·머스터드)', 'Warm'], ['earth', '어스(브라운·세이지)', 'Earth'], ['indigo', '인디고', 'Indigo']]),
  ],
  tags: ['kilim', 'flat weave', 'rug', 'geometric', '킬림', '평직 러그', '러그', '기하학 무늬'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, t = 0.008;
    const [field, a, b, c] = { warm: ['#a8432f', '#e3cfa6', '#c9962e', '#2f3e55'], earth: ['#7a5a40', '#e6dccb', '#8a9a7a', '#3e2a1e'], indigo: ['#2f3e66', '#ece4d6', '#b5643f', '#8ea2b5'] }[p.palette];
    k.slab('rug', 'rug-wool-cream', roundRect(w, d, 0.004), t, 0, { bevel: 0.002, overrides: { color: field } });
    for (const s of [-1, 1]) {
      inlay(k, 'a', rectAt(s * (w / 2 - 0.08), 0, 0.05, d - 0.04), t, a);
      inlay(k, 'b', rectAt(s * (w / 2 - 0.13), 0, 0.025, d - 0.04), t, b);
      const n = Math.max(3, Math.round((d - 0.1) / 0.12));
      for (let i = 0; i < n; i++) inlay(k, 'c', diamond(s * (w / 2 - 0.2), -d / 2 + 0.05 + (i + 0.5) * ((d - 0.1) / n), 0.035, (d - 0.1) / n / 2 - 0.004), t, c);
    }
    inlay(k, 'a', frameShape(w - 0.5, d - 0.16, 0.025), t, a);
    const m = Math.max(1, Math.round((w - 0.6) / 0.42)), step = (w - 0.6) / m, hd = (d - 0.3) / 2;
    for (let i = 0; i < m; i++) {
      const x = -w / 2 + 0.3 + step * (i + 0.5);
      inlay(k, 'b', diamond(x, 0, step * 0.42, hd), t, b);
      inlay(k, 'a', diamond(x, 0, step * 0.28, hd * 0.66), t, a, 1);
      inlay(k, 'c', diamond(x, 0, step * 0.13, hd * 0.3), t, c, 2);
    }
    return k.group();
  },
});

const hide = item({
  id: 'decor-hide-rug', category: 'decor', ko: '카우하이드 스타일 러그', en: 'Cowhide-style rug', size: [1.787, 0.007, 1.286],
  params: [
    P.len('width', '폭', 'Width', 1.9, 1.2, 2.6),
    P.mat('material', '바탕', 'Base', 'leather-white', null),
    P.pick('spots', '얼룩', 'Patches', 'brown', [['brown', '브라운', 'Brown'], ['black', '블랙', 'Black'], ['none', '없음', 'None']]),
  ],
  tags: ['cowhide', 'hide rug', 'rug', '카우하이드', '소가죽 러그', '러그', '가죽 러그'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = W * 0.78, t = 0.006;
    const N = k.seg(120, 48), pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, c = Math.cos(a), s = Math.sin(a);
      const f = 1 - 0.13 * Math.cos(4 * a) + 0.025 * Math.sin(7 * a + 1) + 0.02 * Math.sin(11 * a + 2);
      const sx = Math.sign(c) * Math.abs(c) ** 0.7, sz = Math.sign(s) * Math.abs(s) ** 0.7;
      pts.push([(W / 2 / 1.13) * sx * f, (D / 2 / 1.13) * sz * f]);
    }
    k.slab('hide', p.material, shapeOf(pts), t, 0, { bevel: 0.002, curveSegs: 12 });
    if (p.spots !== 'none') {
      const rand = rng(W * 31);
      const blobs = [[-0.28, -0.12, 0.17], [0.12, 0.18, 0.14], [0.3, -0.16, 0.12], [-0.05, -0.28, 0.08], [-0.34, 0.24, 0.1], [0.36, 0.22, 0.07], [0.02, 0.02, 0.06]];
      for (const [bx, bz, br] of blobs) {
        const bp = [], M = k.seg(28, 12), ph = rand() * 6;
        for (let i = 0; i < M; i++) { const a = (i / M) * TAU, r = br * W * (1 + 0.25 * Math.sin(3 * a + ph) + 0.12 * Math.sin(5 * a + ph * 2)); bp.push([bx * W + Math.cos(a) * r, bz * D + Math.sin(a) * r * 0.85]); }
        k.slab('spots', p.spots === 'black' ? 'leather-black' : 'leather-brown', shapeOf(bp), 0.0025, t - 0.001, { bevel: 0.0005, curveSegs: 8 });
      }
    }
    recentre(k);
    return k.group();
  },
});

const jute = item({
  id: 'decor-jute-rug', category: 'decor', ko: '원형 황마 러그', en: 'Round braided jute rug', size: [1.161, 0.013, 1.161],
  params: [
    P.len('diameter', '지름', 'Diameter', 1.2, 0.6, 2.4),
    P.mat('material', '재질', 'Material', 'rattan', null),
  ],
  tags: ['jute rug', 'braided rug', 'round rug', 'natural', '황마 러그', '원형 러그', '라탄 러그', '러그'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, tube = 0.0135, pitch = 0.028;
    k.cyl('rug', p.material, pitch * 0.75, pitch * 0.75, 0.012, 0, 0, 0, { segs: k.seg(16, 6) });
    const n = Math.max(2, Math.floor((R - pitch * 0.75) / pitch));
    for (let i = 1; i <= n; i++) {
      const r = pitch * 0.75 + (i - 0.5) * pitch;
      const tub = k.seg(Math.min(96, Math.max(16, Math.round(r * TAU * 40))), 10);
      const g = new THREE.TorusGeometry(r, tube, k.seg(6, 3), tub);
      g.rotateX(Math.PI / 2);
      g.scale(1, 0.5, 1);
      g.translate(0, tube * 0.5, 0);
      k.add('rug', p.material, g);
    }
    return k.group();
  },
});

/* ========================================================= folding screen */

const screen = item({
  id: 'decor-folding-screen', category: 'decor', ko: '병풍', en: 'Folding screen (byeongpung)', size: [2.22, 1.6, 0.224],
  params: [
    P.int('panels', '폭 수', 'Panels', 6, 2, 10),
    P.len('height', '높이', 'Height', 1.6, 0.8, 2.0),
    P.len('panelWidth', '한 폭 너비', 'Panel width', 0.42, 0.25, 0.6),
    P.pick('art', '그림', 'Painting', 'mountains', [['mountains', '산수화', 'Mountains'], ['blossom', '매화', 'Plum blossom'], ['plain', '무지(한지)', 'Plain hanji']]),
    P.mat('frame', '틀', 'Frame', 'wood-dark', 'wood'),
  ],
  tags: ['folding screen', 'room divider', 'korean', 'byeongpung', '병풍', '파티션', '칸막이', '한국'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.panels, H = p.height, pw = p.panelWidth, ang = 0.5, fh = H - 0.04, fw = 0.032;
    const ridge = (g) => 0.42 + 0.12 * Math.sin(g * 2.1 + 0.5) + 0.07 * Math.sin(g * 5.3 + 1) + 0.04 * Math.sin(g * 11.7);
    const ridge2 = (g) => 0.28 + 0.08 * Math.sin(g * 3.1 + 2) + 0.05 * Math.sin(g * 7.9);
    let hx = 0, hz = 0;
    for (let i = 0; i < n; i++) {
      const ry = i % 2 ? -ang : ang;
      transformAdded(k, () => {
        const cx = pw / 2;
        k.panel('frame', p.frame, frameShape(pw, fh, fw), 0.022, cx, 0.04 + fh / 2, 0, { bevel: 0.002 });
        const iw = pw - 2 * fw + 0.004, ih = fh - 2 * fw + 0.004, y0 = 0.04 + fw - 0.002;
        k.box('paper', 'paper', iw, ih, 0.004, cx, y0 + ih / 2, 0, { r: 0 });
        for (const x of [0.03, pw - 0.03]) k.box('feet', p.frame, 0.04, 0.042, 0.04, x, 0.021, 0, { r: 0.004 });
        const zf = 0.0024;
        if (p.art === 'mountains') {
          const m = k.seg(16, 6);
          for (const [fn, role, col] of [[ridge, 'ink1', '#8f9894'], [ridge2, 'ink2', '#4f5a56']]) {
            const pts = [[cx - iw / 2 + 0.002, y0 + 0.002]];
            for (let j = 0; j <= m; j++) { const u = j / m, g = i + u; pts.push([cx - iw / 2 + 0.002 + u * (iw - 0.004), y0 + ih * fn(g)]); }
            pts.push([cx + iw / 2 - 0.002, y0 + 0.002]);
            k.panel(role, 'paint-white-matte', shapeOf(pts), 0.0008, 0, 0, zf + (role === 'ink2' ? 0.0006 : 0), { bevel: 0, overrides: { color: col } });
          }
          if (i === n - 2 || n < 3) k.cyl('ink3', 'paint-white-matte', pw * 0.12, pw * 0.12, 0.0008, cx, y0 + ih * 0.82, zf, { rx: Math.PI / 2, segs: k.seg(24, 8), overrides: { color: '#c0473a' } });
        } else if (p.art === 'blossom') {
          const rand = rng(i * 7 + 3);
          const pts = [];
          for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push([cx + (rand() - 0.5) * iw * 0.6 + (i % 2 ? 1 : -1) * iw * 0.15 * t, y0 + ih * (0.1 + 0.8 * t), zf + 0.001]); }
          k.tube('ink2', 'paint-black-matte', pts, 0.004, { segs: k.seg(24, 8), radial: 4 });
          for (let j = 0; j < (k.hi ? 9 : 5); j++) {
            const q = pts[1 + Math.floor(rand() * 5)];
            k.cyl('ink3', 'paint-white-matte', 0.012, 0.012, 0.0008, q[0] + (rand() - 0.5) * 0.06, q[1] + (rand() - 0.5) * 0.06, zf, { rx: Math.PI / 2, segs: k.seg(12, 6), overrides: { color: j % 3 ? '#e8b4b8' : '#c0473a' } });
          }
        }
      }, hx, 0, hz, ry);
      if (i > 0) for (const y of [0.25, H - 0.25]) k.cyl('hinges', 'metal-brass', 0.006, 0.006, 0.05, hx, y - 0.025, hz, { segs: k.seg(10, 5) });
      hx += Math.cos(ry) * pw;
      hz -= Math.sin(ry) * pw;
    }
    recentre(k);
    return k.group();
  },
});

/* ============================================================== variants */

const variants = [
  variant(BASE['vase-stems'], 'tulips', '튤립 꽃병', 'Vase with tulips', { stems: 'tulips', shape: 'cylinder', ceramic: 'ceramic-white', height: 0.26 }, { tags: ['tulip vase', '튤립 꽃병'] }),
  variant(BASE['vase-stems'], 'pampas-amphora', '팜파스 테라코타 항아리', 'Terracotta amphora with pampas', { stems: 'pampas', shape: 'amphora', ceramic: 'ceramic-terracotta', height: 0.36 }, { tags: ['terracotta', '테라코타'] }),
  variant(BASE['decor-bowl'], 'oranges', '오렌지 테라코타 볼', 'Terracotta bowl with oranges', { fruit: 'oranges', material: 'ceramic-terracotta', diameter: 0.34 }, { tags: ['oranges', '오렌지'] }),
  variant(BASE.candles, 'five-honey', '허니 캔들 5구', 'Honey candle cluster', { count: 5, wax: '#e3c27e' }, { tags: ['honey', '허니'] }),
  variant(BASE['throw-pillow'], 'lumbar-mustard', '머스터드 요추 쿠션', 'Mustard lumbar pillow', { shape: 'lumbar', fabric: 'fabric-mustard' }, { tags: ['lumbar', '요추 쿠션', 'mustard', '머스터드'] }),
  variant(BASE['throw-blanket'], 'boucle', '부클레 담요', 'Bouclé throw', { fabric: 'fabric-boucle', fringe: false, folds: 3 }, { tags: ['boucle', '부클레'] }),
  variant(BASE.tray, 'round-marble', '원형 대리석 트레이', 'Round marble tray', { shape: 'round', width: 0.4, material: 'marble-white', handles: false }, { tags: ['marble', '대리석'] }),
  variant(BASE.sculpture, 'pebbles', '돌탑 오브제', 'Pebble stack sculpture', { style: 'stack', material: 'granite-grey', plinth: 'wood-walnut' }, { tags: ['pebbles', '돌탑', 'zen', '젠'] }),
  variant(BASE['wall-clock'], 'walnut-large', '월넛 대형 벽시계', 'Large walnut wall clock', { diameter: 0.5, rim: 'wood-walnut', face: '#ece6da' }, { tags: ['walnut', '월넛', 'large', '대형'] }),
  variant(moonJar, 'large-stand', '받침 위 대형 달항아리', 'Large moon jar on stand', { height: 0.5, stand: true }, { tags: ['stand', '받침'] }),
  variant(runner, 'blue', '블루 러너 러그', 'Blue runner rug', { palette: 'blue', length: 3.0 }, { tags: ['blue', '블루'] }),
  variant(shag, 'round', '원형 샤기 러그', 'Round shag rug', { shape: 'round', width: 1.6 }, { tags: ['round rug', '원형 러그'] }),
  variant(rollerBlind, 'blackout', '암막 롤 블라인드', 'Blackout roller blind', { fabric: 'fabric-navy', cassette: 'metal-black', open: 0.1 }, { tags: ['blackout', '암막'] }),
  variant(venetian, 'wood', '우드 블라인드', 'Wooden venetian blind', { slat: 'wood-walnut', tilt: 0.25 }, { tags: ['wood blind', '우드 블라인드', '원목'] }),
  variant(candlesticks, 'black-pair', '블랙 촛대 한 쌍', 'Black candlestick pair', { count: 2, metal: 'metal-black', wax: '#f4f2ee', lit: false }, { tags: ['black', '블랙', 'pair', '한 쌍'] }),
];

export const ITEMS = [
  bookStack, bookends, globe, mantelClock, alarmClock, grandfather, sunburstClock, candlesticks, lantern, hurricane,
  budVases, floorVase, moonJar, celadon, flutedVase, glassBottles, woodBowl, birds, hourglass, diffuser, chess, basket,
  gallery, canvas, floatingShelf, wallPlates, macrame, tapestry, sunMirror, floorMirror,
  rollerBlind, venetian, romanBlind, drapes, runner, shag, kilim, hide, jute, screen,
  ...variants,
];
