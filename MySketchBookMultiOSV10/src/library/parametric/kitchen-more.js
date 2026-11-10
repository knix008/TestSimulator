// More kitchen items (designs + preset variants of kitchen.js entries). See ARCHITECTURE.md §12 → Library objects.
// Kitchen furniture (corner units, pantry, larder, dresser, shelves, racks, sinks, hood), countertop
// small appliances (kettle, toaster, espresso, rice cooker …), cookware and accessories.
// Big appliances (fridge, dishwasher, oven, microwave) live in the 'appliances' category.
import { THREE, Kit, item, P, OPT, variant, addCabinet, addHandle, roundRect, roundRectAt, superEllipse, frameShape, boxUV, rng } from './helpers.js';
import { ITEMS as KITCHEN, finish, baseModule, addFaucet, addBasin, TOP_MATS } from './kitchen.js';

const CAT = 'kitchen';
const CEILING = 2.4;
const FRONT = 'paint-white-matte';

/* ------------------------------------------------------------------ plumbing */

const SIZE_MAT = new THREE.MeshBasicMaterial();
const SIZE_CTX = { quality: 'high', wallThickness: 0.2, material: () => SIZE_MAT };

/** item() whose `size` is measured (lazily, once) from the default build when not given. */
function make(def) {
  const e = item({ category: CAT, ...def });
  if (def.size) return e;
  delete e.size;
  let cached = null;
  Object.defineProperty(e, 'size', {
    enumerable: true, configurable: true,
    get() {
      if (!cached) {
        const b = new THREE.Box3().setFromObject(e.build({}, SIZE_CTX));
        cached = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(Math.max(0.01, v) * 1000) / 1000);
      }
      return cached;
    },
    set(v) { cached = v; },
  });
  return e;
}

/** Groups and moves the geometry: min y = 0, centred in x (and z unless cz = false). */
function done(k, { cz = true } = {}) {
  if (cz) return finish(k);
  const g = k.group();
  const b = new THREE.Box3().setFromObject(g);
  const dx = -(b.min.x + b.max.x) / 2, dy = -b.min.y;
  for (const c of g.children) {
    if (c.isMesh) { c.geometry.translate(dx, dy, 0); c.geometry.computeBoundingBox(); c.geometry.computeBoundingSphere(); }
    else c.position.add(new THREE.Vector3(dx, dy, 0));
  }
  return g;
}

/** Runs fn(k) and applies a transform (rotation XYZ, then translation) to only the parts it added. */
function xform(k, fn, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  const nl = k.lights.length;
  fn(k);
  const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  for (const [key, p] of k.parts) {
    const from = before.get(key) ?? 0;
    for (let i = from; i < p.geos.length; i++) { p.geos[i].applyMatrix4(M); boxUV(p.geos[i]); }
  }
  for (let i = nl; i < k.lights.length; i++) {
    const v = new THREE.Vector3(k.lights[i].x, k.lights[i].y, k.lights[i].z).applyMatrix4(M);
    Object.assign(k.lights[i], { x: v.x, y: v.y, z: v.z });
  }
}

const Y = new THREE.Vector3(0, 1, 0);
/** Adds a geometry built along +y (base at the origin) so that +y points along `dir`, base at `at`. */
function along(k, role, mat, geo, at, dir, o) {
  const d = new THREE.Vector3(...dir).normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d));
  geo.translate(at[0], at[1], at[2]);
  return k.add(role, mat, geo, o);
}

const V2 = (pts) => pts.map(([a, b]) => new THREE.Vector2(Math.max(0, a), b));

/** Box whose x/z shrink linearly towards the bottom (factor f at the bottom), centred, bottom at y0. */
function taperBox(k, role, mat, w, h, d, f, x, y0, z, { r = 0.01, o } = {}) {
  const geo = k.hi ? new THREE.BoxGeometry(w, h, d, 1, 2, 1) : new THREE.BoxGeometry(w, h, d);
  void r;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + h / 2) / h;
    const s = f + (1 - f) * t;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i), pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
  geo.translate(x, y0 + h / 2, z);
  return k.add(role, mat, geo, o);
}

/** Frustum between a w0 × d0 bottom and a w1 × d1 top (hoods). */
function frustum(k, role, mat, w0, d0, w1, d1, h, x, y0, z, { z1 = 0 } = {}) {
  const geo = new THREE.BoxGeometry(1, h, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    pos.setXYZ(i, pos.getX(i) * (top ? w1 : w0), pos.getY(i), pos.getZ(i) * (top ? d1 : d0) + (top ? z1 : 0));
  }
  geo.computeVertexNormals();
  geo.translate(x, y0 + h / 2, z);
  return k.add(role, mat, geo);
}

/** Open box (two sides, top, bottom, back) open towards +z; bottom centre at (x, y0, z). */
function openCase(k, role, mat, w, h, d, x = 0, y0 = 0, z = 0, t = 0.018, { top = true, bottom = true, back = true } = {}) {
  for (const s of [-1, 1]) k.box(role, mat, t, h, d, x + s * (w / 2 - t / 2), y0 + h / 2, z, { r: 0.0015 });
  if (top) k.box(role, mat, w - 2 * t, t, d, x, y0 + h - t / 2, z, { r: 0.0015 });
  if (bottom) k.box(role, mat, w - 2 * t, t, d, x, y0 + t / 2, z, { r: 0.0015 });
  if (back) {
    const y1 = y0 + (bottom ? t : 0), y2 = y0 + h - (top ? t : 0);
    k.box(role, mat, w - 2 * t, y2 - y1, 0.008, x, (y1 + y2) / 2, z - d / 2 + 0.004, { r: 0 });
  }
}

/* --------------------------------------------------------- small tableware */

/** Flat plate (lathe), bottom centre at the origin. */
function plateGeo(k, r, h = 0.02) {
  return new THREE.LatheGeometry(V2([[0, 0], [r * 0.55, 0], [r * 0.6, h * 0.35], [r * 0.66, h * 0.45], [r, h], [r * 0.97, h], [r * 0.62, h * 0.7], [0, h * 0.7]]), k.seg(28, 8));
}
/** Bowl (lathe), bottom centre at the origin. */
function bowlGeo(k, r, h) {
  return new THREE.LatheGeometry(V2([[0, 0], [r * 0.42, 0], [r * 0.45, h * 0.08], [r * 0.8, h * 0.4], [r, h], [r * 0.95, h], [r * 0.75, h * 0.45], [r * 0.4, h * 0.16], [0, h * 0.16]]), k.seg(28, 8));
}
/** Mug: lathe body + half-torus handle on +x, bottom centre at the origin. */
function mug(k, role, mat, r = 0.04, h = 0.095, o) {
  k.lathe(role, mat, [[0, 0], [r * 0.85, 0], [r, 0.008], [r, h], [r - 0.005, h], [r - 0.005, 0.01], [0, 0.01]], 0, 0, 0, { segs: k.seg(20, 8), ...o });
  k.add(role, mat, new THREE.TorusGeometry(h * 0.27, 0.0065, k.seg(8, 4), k.seg(14, 6), Math.PI).rotateZ(-Math.PI / 2).translate(r - 0.003, h * 0.52, 0), o);
}
/** Storage jar: glass body, lid, contents; bottom centre at (x, y, z). */
function jar(k, r, h, x, y, z, { lid = 'wood-oak', food = 'wood-pine', fill = 0.7, foodColor } = {}) {
  const s = k.seg(18, 7);
  k.lathe('glass', 'glass-clear', [[0, 0], [r - 0.004, 0], [r, 0.004], [r, h - 0.014], [r * 0.92, h - 0.01], [r * 0.92, h - 0.004], [0, h - 0.004]], x, y, z, { segs: s });
  if (fill > 0) k.cyl('food', food, r - 0.003, r - 0.003, (h - 0.02) * fill, x, y + 0.003, z, { segs: s, overrides: foodColor ? { color: foodColor } : undefined });
  k.cyl('lids', lid, r * 0.95, r * 0.95, 0.016, x, y + h - 0.012, z, { segs: s });
}
/** Wine / oil bottle along +y, bottom at the origin. */
function bottleGeo(k, rb = 0.037, len = 0.3) {
  if (!k.hi) return new THREE.LatheGeometry(V2([[0, 0], [rb, 0], [rb, len * 0.66], [0.016, len * 0.8], [0.015, len], [0, len]]), 6);
  return new THREE.LatheGeometry(V2([[0, 0], [rb * 0.92, 0], [rb, 0.006], [rb, len * 0.64], [rb * 0.9, len * 0.71], [0.016, len * 0.8], [0.014, len * 0.96], [0.016, len * 0.97], [0.016, len], [0, len]]), k.seg(18, 7));
}

/**
 * Fills a shelf (x0 … x1, top at y, front-back centre zc, usable depth dep, height limit maxH)
 * with dishes, mugs, jars and bowls (deterministic pattern by seed).
 */
function shelfItems(k, x0, x1, y, zc, dep, maxH, seed = 1, kinds = ['plates', 'mugs', 'jar', 'bowls', 'jar2']) {
  const rand = rng(seed);
  let x = x0 + 0.02;
  let i = Math.floor(rand() * kinds.length);
  let guard = 0;
  while (guard++ < 20) {
    const kind = kinds[i++ % kinds.length];
    let fw = 0;
    if (kind === 'plates') {
      const r = Math.min(0.11, dep / 2 - 0.01);
      fw = 2 * r;
      if (x + fw > x1 || maxH < 0.08) break;
      for (let j = 0; j < 4; j++) k.add('dishes', 'ceramic-white', plateGeo(k, r, 0.02).translate(x + r, y + j * 0.016, zc));
    } else if (kind === 'bowls') {
      const r = Math.min(0.08, dep / 2 - 0.01);
      fw = 2 * r;
      if (x + fw > x1 || maxH < 0.12) break;
      for (let j = 0; j < 3; j++) k.add('dishes', 'ceramic-white', bowlGeo(k, r * (1 - j * 0.08), 0.06).translate(x + r, y + j * 0.025, zc));
    } else if (kind === 'mugs') {
      fw = 0.2;
      if (x + fw > x1 || maxH < 0.11) break;
      for (let j = 0; j < 2; j++) xform(k, () => mug(k, 'mugs', 'ceramic-matte', 0.038, 0.09), { x: x + 0.045 + j * 0.1, y, z: zc, ry: -0.6 - j * 0.9 });
    } else {
      const tall = kind === 'jar';
      const r = 0.045, h = tall ? 0.2 : 0.13;
      fw = 2 * r + 0.01;
      if (x + fw > x1 || maxH < h + 0.01) { if (maxH < h + 0.01 && x + fw <= x1) { x += 0.01; continue; } break; }
      jar(k, r, h, x + r, y, zc, { fill: tall ? 0.75 : 0.55, food: tall ? 'wood-pine' : 'paper' });
    }
    x += fw + 0.025 + rand() * 0.03;
  }
}

/* ===================================================================== CABINETS */

/**
 * L-shaped corner unit (bi-fold doors on the two inner faces). S = size of each leg along the
 * wall, D = depth; base units get a plinth and an L countertop, wall units hang (base 'none').
 */
function cornerUnit(k, p, wall) {
  const S = p.size, D = p.depth, ft = 0.019, g = 0.003;
  const plinth = wall ? 0 : 0.1, topT = wall ? 0 : 0.03;
  const bodyH = p.height - plinth - topT, y0 = plinth, yc = y0 + bodyH / 2;
  const cd = D - ft, inner = -S / 2 + D;
  const hm = 'metal-steel';
  // carcass: A along the back wall, B along the left wall
  k.box('body', p.body, S, bodyH, cd, 0, yc, -S / 2 + cd / 2, { r: 0.0025 });
  k.box('body', p.body, cd, bodyH, S - cd, -S / 2 + cd / 2, yc, -S / 2 + cd + (S - cd) / 2, { r: 0.0025 });
  if (!wall) {
    const pd = cd - 0.05;
    k.box('body', p.body, S - 0.01, plinth, pd, 0, plinth / 2, -S / 2 + pd / 2, { r: 0.001 });
    k.box('body', p.body, pd, plinth, S - pd - 0.01, -S / 2 + pd / 2, plinth / 2, -S / 2 + pd + (S - pd - 0.01) / 2, { r: 0.001 });
  }
  const wd = S - D - g, len = Math.min(0.16, bodyH * 0.35);
  const hy = wall ? y0 + 0.03 + len / 2 : y0 + bodyH - 0.05 - len / 2;
  // door A (faces +z)
  const ax = (inner + S / 2) / 2;
  k.box('fronts', p.front, wd, bodyH - g, ft, ax, yc, -S / 2 + cd + ft / 2, { r: 0.0025 });
  addHandle(k, 'handles', hm, p.handle, S / 2 - 0.045, hy, inner, { len, vertical: true });
  // door B (faces +x): built facing +z, turned a quarter
  xform(k, () => {
    k.box('fronts', p.front, wd, bodyH - g, ft, 0, yc, ft / 2, { r: 0.0025 });
    addHandle(k, 'handles', hm, p.handle, -(wd / 2 - 0.045), hy, ft, { len, vertical: true });
  }, { x: -S / 2 + cd, z: (inner + S / 2) / 2, ry: Math.PI / 2 });
  // corner filler post between the two doors
  k.box('fronts', p.front, ft, bodyH - g, ft, -S / 2 + cd + ft / 2, yc, -S / 2 + cd + ft / 2, { r: 0.002 });
  if (!wall) {
    const Dt = D + 0.015;
    const shape = new THREE.Shape([
      new THREE.Vector2(-S / 2, -S / 2), new THREE.Vector2(S / 2, -S / 2), new THREE.Vector2(S / 2, -S / 2 + Dt),
      new THREE.Vector2(-S / 2 + Dt, -S / 2 + Dt), new THREE.Vector2(-S / 2 + Dt, S / 2), new THREE.Vector2(-S / 2, S / 2),
    ]);
    k.slab('top', p.top, shape, topT, p.height - topT, { bevel: 0.003 });
  } else if (p.light) {
    k.box('light', 'light-warm', S - 0.1, 0.005, 0.02, 0.03, -0.0025 + 0.001, -S / 2 + D - 0.07, { r: 0 });
    k.light(0, -0.01, -S / 2 + D - 0.07, { intensity: 0.4, distance: 1.5, type: 'spot', angle: 1.2 });
  }
}

const cornerBase = make({
  id: 'kitchen-corner-base-cabinet', ko: '코너 하부장(L형)', en: 'Corner base cabinet (L)',
  params: [
    P.len('size', '벽면 길이', 'Leg length', 0.95, 0.85, 1.2),
    P.len('depth', '깊이', 'Depth', 0.6, 0.55, 0.65),
    P.len('height', '높이', 'Height', 0.85, 0.75, 0.95),
    P.mat('front', '도어', 'Fronts', FRONT, 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.mat('top', '상판', 'Countertop', TOP_MATS, 'stone'),
  ],
  tags: ['corner cabinet', 'L cabinet', 'base cabinet', '코너장', '코너 하부장', 'ㄱ자 싱크대'],
  build: (p, ctx) => { const k = new Kit(ctx); cornerUnit(k, p, false); return done(k); },
});

const cornerWall = make({
  id: 'kitchen-corner-wall-cabinet', ko: '코너 상부장(L형)', en: 'Corner wall cabinet (L)', placement: 'wall', elevation: 1.45,
  params: [
    P.len('size', '벽면 길이', 'Leg length', 0.65, 0.6, 0.9),
    P.len('depth', '깊이', 'Depth', 0.35, 0.3, 0.4),
    P.len('height', '높이', 'Height', 0.7, 0.4, 1.0),
    P.mat('front', '도어', 'Fronts', FRONT, 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.bool('light', '하부 조명', 'Under-cabinet light', true),
  ],
  tags: ['corner wall cabinet', 'upper cabinet', '코너 상부장', '상부장', '주방 코너'],
  build: (p, ctx) => { const k = new Kit(ctx); cornerUnit(k, p, true); return done(k); },
});

/* -------------------------------------------------------- pull-out pantry */

const pullout = make({
  id: 'kitchen-pullout-pantry', ko: '슬라이딩 팬트리(빼낸 상태)', en: 'Pull-out pantry', anchor: { asymmetricZ: true },
  params: [
    P.len('width', '폭', 'Width', 0.3, 0.2, 0.45),
    P.len('height', '높이', 'Height', 2.1, 1.8, 2.4),
    P.len('depth', '깊이', 'Depth', 0.6, 0.5, 0.65),
    P.len('open', '빼낸 길이', 'Pulled out', 0.38, 0, 0.5),
    P.mat('front', '도어', 'Front', FRONT, 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handle', 'bar', OPT.handle),
  ],
  tags: ['pull-out pantry', 'larder', 'tall cabinet', '슬라이딩 팬트리', '팬트리', '키큰장', '양념장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d, open: o } = p;
    const plinth = 0.1, ft = 0.019, bodyH = h - plinth;
    k.box('body', p.body, w - 0.01, plinth, d - ft - 0.05, 0, plinth / 2, -d / 2 + (d - ft - 0.05) / 2, { r: 0.001 });
    k.box('body', p.body, w, bodyH, d - ft, 0, plinth + bodyH / 2, -d / 2 + (d - ft) / 2, { r: 0.0025 });
    const fz = d / 2 - ft / 2 + o;
    k.box('fronts', p.front, w - 0.003, bodyH - 0.003, ft, 0, plinth + bodyH / 2, fz, { r: 0.0025 });
    addHandle(k, 'handles', 'metal-steel', p.handle, 0, plinth + bodyH * 0.55, fz + ft / 2, { len: 0.3, vertical: true });
    if (o < 0.04) return done(k, { cz: false });
    // wire baskets hanging on the back of the front
    const bw = w - 0.05, L = d - 0.07, zb0 = fz - ft / 2 - 0.006, zc = zb0 - L / 2;
    const n = Math.max(3, Math.round(bodyH / 0.36));
    const step = (bodyH - 0.12) / n;
    const visible = d / 2 - ft + 0.01; // anything behind this is inside the carcass
    for (const s of [-1, 1]) k.rod('rack', 'metal-chrome', [s * (bw / 2 - 0.005), plinth + 0.05, zb0], [s * (bw / 2 - 0.005), plinth + bodyH - 0.05, zb0], 0.005, { segs: k.seg(8, 4) });
    for (let i = 0; i < n; i++) {
      const yb = plinth + 0.06 + i * step;
      k.box('rack', 'metal-aluminium', bw, 0.004, L, 0, yb, zc, { r: 0 });
      for (const s of [-1, 1]) k.rod('rack', 'metal-chrome', [s * bw / 2, yb + 0.07, zb0], [s * bw / 2, yb + 0.07, zb0 - L], 0.003, { segs: k.seg(6, 4) });
      k.rod('rack', 'metal-chrome', [-bw / 2, yb + 0.07, zb0 - L], [bw / 2, yb + 0.07, zb0 - L], 0.003, { segs: k.seg(6, 4) });
      // items in the part that is pulled out
      const hmax = step - 0.05;
      let j = 0;
      for (let z = zb0 - 0.05; z > Math.max(visible, zb0 - L + 0.04); z -= 0.09, j++) {
        for (const [ci, x] of [[0, -bw / 4], [1, bw / 4]]) {
          if (w < 0.26 && ci === 1) continue;
          const xx = w < 0.26 ? 0 : x;
          const kind = (i * 3 + j * 2 + ci) % 4;
          if (kind === 0 && hmax > 0.26) k.add('bottles', 'paint-white-gloss', bottleGeo(k, 0.032, 0.26).translate(xx, yb + 0.002, z), { overrides: { color: '#2d4a2a' } });
          else if (kind === 1) k.cyl('cans', 'metal-aluminium', 0.034, 0.034, Math.min(0.11, hmax), xx, yb + 0.002, z, { segs: k.seg(16, 6) });
          else jar(k, 0.035, Math.min(kind === 2 ? 0.16 : 0.12, hmax), xx, yb + 0.002, z, { fill: 0.7, food: kind === 2 ? 'wood-pine' : 'paper' });
        }
      }
    }
    return done(k, { cz: false });
  },
});

/* ------------------------------------------------------------- larder */

const larder = make({
  id: 'kitchen-larder-cupboard', ko: '유리문 찬장(라더)', en: 'Larder cupboard',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.4),
    P.len('height', '높이', 'Height', 2.0, 1.8, 2.3),
    P.len('depth', '깊이', 'Depth', 0.45, 0.38, 0.55),
    P.mat('paint', '도장', 'Paint', 'paint-green-matte', 'paint'),
    P.mat('handleMat', '손잡이', 'Knobs', 'metal-brass', 'metal'),
    P.bool('items', '수납품', 'Contents', true),
  ],
  tags: ['larder', 'pantry cupboard', 'glass cabinet', 'kitchen hutch', '찬장', '라더', '유리 찬장', '그릇장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p;
    const lowH = 0.95, ft = 0.019, t = 0.02;
    addCabinet(k, { w, h: lowH, d, rows: [{ h: 0.78, n: 2, type: 'door' }, { h: 0.22, n: 2, type: 'drawer' }], body: p.paint, front: p.paint, handle: 'knob', handleMat: p.handleMat, base: 'plinth', plinth: 0.08 });
    // upper glazed section: real open case so the shelves show through the glass
    const hu = h - lowH - 0.06, cd = d - ft, zc = -ft / 2;
    k.box('body', p.paint, w, 0.025, d + 0.01, 0, lowH + 0.0125, 0.005, { r: 0.003 });
    openCase(k, 'body', p.paint, w, hu, cd, 0, lowH + 0.025, zc, t);
    const ys = lowH + 0.025;
    const shelves = [ys + t, ys + hu * 0.36, ys + hu * 0.68];
    for (const y of shelves.slice(1)) k.box('body', p.paint, w - 2 * t, 0.018, cd - 0.012, 0, y - 0.009, zc + 0.004, { r: 0.001 });
    // cornice
    k.box('body', p.paint, w + 0.04, 0.035, d + 0.03, 0, h - 0.0175 - 0.025, 0.005, { r: 0.004 });
    k.box('body', p.paint, w + 0.06, 0.025, d + 0.04, 0, h - 0.0125, 0.008, { r: 0.004 });
    // glass doors with a glazing bar
    const fh = hu - 0.006, fw = w / 2 - 0.004, fr = 0.05, fy = ys + hu / 2, fz = d / 2 - ft / 2;
    for (const s of [-1, 1]) {
      const cx = s * w / 4;
      k.panel('fronts', p.paint, frameShape(fw, fh, fr), ft, cx, fy, fz, { bevel: 0.003 });
      k.box('glass', 'glass-clear', fw - 2 * fr + 0.006, fh - 2 * fr + 0.006, 0.004, cx, fy, fz - 0.003, { r: 0 });
      k.box('fronts', p.paint, fw - 2 * fr + 0.004, 0.025, ft * 0.7, cx, fy + fh * 0.12, fz, { r: 0.002 });
      addHandle(k, 'handles', p.handleMat, 'knob', cx - s * (fw / 2 - 0.035), fy - fh * 0.15, fz + ft / 2);
    }
    if (p.items) shelves.forEach((y, i) => shelfItems(k, -w / 2 + t, w / 2 - t, y, zc + 0.01, cd - 0.05, (i < 2 ? shelves[i + 1] - 0.018 : ys + hu - t) - y - 0.01, 3 + i, ['jar', 'plates', 'jar2', 'bowls', 'mugs']));
    return done(k);
  },
});

/* ------------------------------------------------------ quarter-round end unit */

function quarterShape(w, d, sx, grow = 0) {
  const s = new THREE.Shape();
  const cx = -sx * w / 2, cy = -d / 2, rw = w + grow, rd = d + grow;
  s.moveTo(cx, cy);
  if (sx > 0) { s.lineTo(cx + rw, cy); s.absellipse(cx, cy, rw, rd, 0, Math.PI / 2, false, 0); }
  else { s.lineTo(cx, cy + rd); s.absellipse(cx, cy, rw, rd, Math.PI / 2, Math.PI, false, 0); }
  s.lineTo(cx, cy);
  return s;
}

const endUnit = make({
  id: 'kitchen-end-shelf-unit', ko: '라운드 엔드 선반장', en: 'Quarter-round end shelf unit',
  params: [
    P.len('width', '폭', 'Width', 0.32, 0.25, 0.45),
    P.len('depth', '깊이', 'Depth', 0.6, 0.55, 0.65),
    P.len('height', '높이', 'Height', 0.85, 0.75, 0.95),
    P.pick('side', '붙는 쪽', 'Run side', 'left', [['left', '왼쪽에 붙음', 'Run on the left'], ['right', '오른쪽에 붙음', 'Run on the right']]),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('top', '상판', 'Countertop', TOP_MATS, 'stone'),
    P.bool('items', '소품', 'Contents', true),
  ],
  tags: ['end unit', 'open shelf', 'corner shelf', '엔드 선반', '오픈 선반', '라운드 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p;
    const sx = p.side === 'left' ? 1 : -1, t = 0.03, st = 0.022;
    k.slab('body', p.body, quarterShape(w - 0.05, d - 0.05, sx), 0.1, 0, { bevel: 0.002, x: -sx * 0.025, z: -0.025 });
    k.box('body', p.body, 0.018, h - t, d, -sx * (w / 2 - 0.009), (h - t) / 2, 0, { r: 0.0015 });
    k.box('body', p.body, w, h - t, 0.018, 0, (h - t) / 2, -d / 2 + 0.009, { r: 0.0015 });
    const ys = [0.1, 0.1 + (h - t - 0.1) * 0.5];
    for (const y of ys) k.slab('body', p.body, quarterShape(w, d, sx), st, y, { bevel: 0.003 });
    k.slab('top', p.top, quarterShape(w, d, sx, 0.012), t, h - t, { bevel: 0.003 });
    if (p.items) {
      const cx = -sx * w / 2, cz = -d / 2;
      for (let j = 0; j < 3; j++) k.add('dishes', 'ceramic-white', bowlGeo(k, 0.075 * (1 - j * 0.08), 0.055).translate(cx + sx * 0.12, ys[0] + st + j * 0.022, cz + d * 0.33));
      jar(k, 0.045, 0.17, cx + sx * Math.min(0.08, w * 0.25), ys[0] + st, cz + d * 0.68);
      xform(k, () => mug(k, 'mugs', 'ceramic-matte', 0.038, 0.09), { x: cx + sx * 0.1, y: ys[1] + st, z: cz + d * 0.3, ry: 0.8 });
      jar(k, 0.04, 0.12, cx + sx * Math.min(0.07, w * 0.22), ys[1] + st, cz + d * 0.62, { food: 'paper', fill: 0.5 });
    }
    return done(k);
  },
});

/* =================================================================== WALL SHELVES */

const openShelves = make({
  id: 'kitchen-open-wall-shelves', ko: '주방 오픈 벽선반', en: 'Open kitchen wall shelves', placement: 'wall', elevation: 1.35,
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.6),
    P.int('shelves', '단 수', 'Shelves', 2, 1, 3),
    P.len('gap', '단 간격', 'Spacing', 0.32, 0.25, 0.45),
    P.len('depth', '깊이', 'Depth', 0.24, 0.18, 0.3),
    P.mat('wood', '선반', 'Shelf', 'wood-oak', 'wood'),
    P.mat('bracket', '브래킷', 'Brackets', 'metal-black', 'metal'),
    P.bool('items', '그릇', 'Dishes', true),
  ],
  tags: ['wall shelf', 'open shelving', 'kitchen shelf', '벽선반', '주방 선반', '오픈 선반', '그릇 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d } = p;
    const n = p.shelves, bh = 0.14;
    for (let i = 0; i < n; i++) {
      const yb = bh + i * p.gap;
      k.rbox('shelf', p.wood, w, 0.03, d, 0.004, 0, yb + 0.015, 0);
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - Math.min(0.15, w * 0.15));
        k.box('brackets', p.bracket, 0.03, bh, 0.005, x, yb - bh / 2, -d / 2 + 0.0025, { r: 0.001 });
        k.box('brackets', p.bracket, 0.03, 0.005, d - 0.04, x, yb - 0.0025, -d / 2 + (d - 0.04) / 2, { r: 0.001 });
        k.rod('brackets', p.bracket, [x, yb - bh + 0.02, -d / 2 + 0.005], [x, yb - 0.004, -d / 2 + (d - 0.04) * 0.7], 0.005, { segs: k.seg(8, 4) });
      }
      if (p.items) shelfItems(k, -w / 2, w / 2, yb + 0.03, 0.005, d - 0.02, i < n - 1 ? p.gap - 0.05 : 0.3, 11 + i * 5);
    }
    return done(k);
  },
});

const floatShelf = make({
  id: 'kitchen-floating-shelf-mugs', ko: '머그 고리 플로팅 선반', en: 'Floating shelf with mug hooks', placement: 'wall', elevation: 1.3,
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.4),
    P.len('depth', '깊이', 'Depth', 0.22, 0.18, 0.28),
    P.int('mugs', '머그 수', 'Mugs', 4, 0, 8),
    P.mat('wood', '선반', 'Shelf', 'wood-walnut', 'wood'),
    P.mat('mugMat', '머그', 'Mugs', 'ceramic-matte', 'ceramic'),
    P.bool('items', '선반 위 소품', 'Jars on top', true),
  ],
  tags: ['floating shelf', 'mug hooks', 'cup hooks', '플로팅 선반', '머그 걸이', '컵 고리', '벽선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d } = p;
    const r = 0.04, mh = 0.095;
    const yS = 2 * r + mh * 0.27 + 0.03; // shelf underside: hook + handle + mug body
    k.rbox('shelf', p.wood, w, 0.05, d, 0.005, 0, yS + 0.025, 0);
    const n = Math.min(p.mugs, Math.floor((w - 0.06) / 0.1));
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * 0.1) / 2 + i * 0.1, z = d / 2 - 0.05;
      // cup hook screwed into the underside
      k.rod('hooks', 'metal-brass', [x, yS, z], [x, yS - 0.022, z], 0.0018, { segs: k.seg(6, 4) });
      k.add('hooks', 'metal-brass', new THREE.TorusGeometry(0.007, 0.0018, k.seg(6, 3), k.seg(10, 5), Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI).translate(x, yS - 0.022, z + 0.007));
      // mug hanging by its handle: handle up, body sideways
      xform(k, () => mug(k, 'mugs', p.mugMat, r, mh), { x: x + mh * 0.52, y: yS - 0.026 - r - mh * 0.27, z: z + 0.004, rz: Math.PI / 2 });
    }
    if (p.items) shelfItems(k, -w / 2, w / 2, yS + 0.05, 0, d - 0.02, 0.25, 7, ['jar', 'jar2', 'bowls', 'jar']);
    return done(k);
  },
});

const plateRack = make({
  id: 'kitchen-plate-rack', ko: '벽걸이 접시 거치대', en: 'Wall plate rack', placement: 'wall', elevation: 1.4,
  params: [
    P.len('width', '폭', 'Width', 0.7, 0.45, 1.0),
    P.int('plates', '접시 수', 'Plates', 7, 2, 12),
    P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'),
    P.mat('plateMat', '접시', 'Plates', 'ceramic-white', 'ceramic'),
    P.bool('cups', '위 선반 컵', 'Cups on top', true),
  ],
  tags: ['plate rack', 'dish rack', 'plate holder', '접시 거치대', '그릇 걸이', '플레이트 랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.56, d = 0.24, t = 0.018;
    for (const s of [-1, 1]) k.rbox('frame', p.wood, t, h, d, 0.004, s * (w / 2 - t / 2), h / 2, 0);
    k.box('frame', p.wood, w - 2 * t, t, d, 0, t / 2, 0, { r: 0.002 });
    k.box('frame', p.wood, w + 0.02, t, d + 0.01, 0, h - t / 2, 0.005, { r: 0.003 });
    k.box('frame', p.wood, w - 2 * t, 0.06, 0.012, 0, h - t - 0.03, -d / 2 + 0.006, { r: 0.002 });
    const n = Math.min(p.plates, Math.floor((w - 2 * t - 0.03) / 0.032));
    const pitch = (w - 2 * t - 0.03) / Math.max(1, n);
    const pr = 0.11;
    const spindle = (x) => {
      k.rod('frame', p.wood, [x, t, 0.075], [x, 0.17, 0.075], 0.006, { segs: k.seg(8, 5) });
      k.rod('frame', p.wood, [x, t, -0.075], [x, 0.26, -0.075], 0.006, { segs: k.seg(8, 5) });
    };
    for (let i = 0; i <= n; i++) spindle(-w / 2 + t + 0.015 + i * pitch);
    for (const z of [0.075, -0.075]) k.rod('frame', p.wood, [-w / 2 + t, z > 0 ? 0.17 : 0.26, z], [w / 2 - t, z > 0 ? 0.17 : 0.26, z], 0.008, { segs: k.seg(10, 5) });
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + t + 0.015 + (i + 0.5) * pitch;
      k.add('plates', p.plateMat, plateGeo(k, pr, 0.02).translate(0, -0.007, 0).rotateZ(Math.PI / 2 - 0.08).translate(x, t + pr + 0.001, 0));
    }
    if (p.cups) {
      const m = Math.max(1, Math.floor((w - 0.1) / 0.14));
      for (let i = 0; i < m; i++) xform(k, () => mug(k, 'mugs', 'ceramic-matte', 0.038, 0.09), { x: -((m - 1) * 0.14) / 2 + i * 0.14, y: h, z: 0.01, ry: -0.5 + i * 0.7 });
    }
    return done(k);
  },
});

/* ------------------------------------------------------------- wine racks */

function wineBottle(k, x, y, z, red, len = 0.3) {
  const g = bottleGeo(k, 0.037, len).rotateX(Math.PI / 2).translate(x, y, z);
  k.add('bottles', 'paint-white-gloss', g, { overrides: { color: red ? '#3a1016' : '#1e3523' } });
  if (!k.hi) return;
  k.add('labels', 'paper', new THREE.CylinderGeometry(0.0378, 0.0378, 0.08, k.seg(18, 7), 1, true).rotateX(Math.PI / 2).translate(x, y, z + len * 0.33));
  k.add('foil', 'metal-copper', new THREE.CylinderGeometry(0.0165, 0.0165, len * 0.1, k.seg(12, 6)).rotateX(Math.PI / 2).translate(x, y, z + len * 0.955));
}

const wineRack = make({
  id: 'kitchen-wine-rack', ko: '와인 랙(스탠드)', en: 'Wine rack (floor)',
  params: [
    P.int('cols', '열', 'Columns', 4, 2, 8),
    P.int('rows', '단', 'Rows', 5, 2, 9),
    P.num('fill', '병 채움', 'Bottles', 0.75, 0, 1, 0.05),
    P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'),
  ],
  tags: ['wine rack', 'bottle rack', 'wine storage', '와인랙', '와인 거치대', '와인 보관'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const cols = p.cols, rows = p.rows, cw = 0.1, rh = 0.1, d = 0.24, hb = 0.034, rn = 0.036;
    const w = cols * cw + 0.04, h = rows * rh + 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.022, h, 0.022, sx * (w / 2 - 0.011), h / 2, sz * (d / 2 - 0.011), { r: 0.002 });
    k.box('frame', p.wood, w + 0.01, 0.018, d + 0.01, 0, h + 0.009, 0, { r: 0.002 });
    // notched cross boards (front and back) for every row
    const bw = w - 0.044;
    const board = () => {
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0); s.lineTo(bw / 2, hb);
      for (let c = cols - 1; c >= 0; c--) {
        const cx = -cols * cw / 2 + (c + 0.5) * cw;
        s.lineTo(cx + rn, hb);
        s.absarc(cx, hb, rn, 0, -Math.PI, true);
      }
      s.lineTo(-bw / 2, hb); s.lineTo(-bw / 2, 0);
      return s;
    };
    const rand = rng(p.cols * 7 + p.rows);
    for (let r = 0; r < rows; r++) {
      const yb = 0.03 + r * rh;
      for (const z of [d / 2 - 0.045, -d / 2 + 0.035]) k.panel('frame', p.wood, board(), 0.014, 0, yb, z, { bevel: 0.0015, curveSegs: 10 });
      for (let c = 0; c < cols; c++) {
        if (rand() > p.fill) continue;
        const cx = -cols * cw / 2 + (c + 0.5) * cw;
        wineBottle(k, cx, yb + hb + 0.003, -d / 2 + 0.006, (r + c) % 3 === 0);
      }
    }
    return done(k);
  },
});

const wallWine = make({
  id: 'kitchen-wall-wine-rack', ko: '벽걸이 와인 랙', en: 'Wall-mounted wine rack', placement: 'wall', elevation: 1.2,
  params: [
    P.int('bottles', '병 수(열당)', 'Bottles per column', 4, 2, 8),
    P.int('cols', '열', 'Columns', 1, 1, 3),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
  ],
  tags: ['wall wine rack', 'bottle holder', 'wine display', '벽걸이 와인랙', '와인 걸이', '와인 진열'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.bottles, pitch = 0.105, rb = 0.037, len = 0.3;
    const h = n * pitch + 0.04;
    for (let c = 0; c < p.cols; c++) {
      const x = (c - (p.cols - 1) / 2) * 0.13;
      k.box('rack', p.metal, 0.03, h, 0.006, x, h / 2, 0.003, { r: 0.001 });
      for (const y of [0.02, h - 0.02]) k.cyl('rack', 'metal-chrome', 0.005, 0.005, 0.004, x, y, 0.006, { rx: Math.PI / 2, segs: k.seg(10, 5) });
      for (let i = 0; i < n; i++) {
        const yc = 0.035 + rb + i * pitch;
        // two rails under the bottle and a ring around its shoulder
        for (const s of [-1, 1]) k.rod('rack', p.metal, [x + s * 0.012, yc - rb - 0.004, 0.006], [x + s * 0.02, yc - rb * 0.6, 0.2], 0.0035, { segs: k.seg(8, 4) });
        k.add('rack', p.metal, new THREE.TorusGeometry(rb + 0.004, 0.0035, k.seg(6, 3), k.seg(20, 8)).translate(x, yc, 0.2));
        wineBottle(k, x, yc, 0.008, (i + c) % 2 === 1, len);
      }
    }
    return done(k);
  },
});

const spiceRack = make({
  id: 'kitchen-spice-rack', ko: '벽걸이 양념 선반', en: 'Wall spice rack', placement: 'wall', elevation: 1.3,
  params: [
    P.len('width', '폭', 'Width', 0.42, 0.3, 0.7),
    P.int('tiers', '단 수', 'Tiers', 3, 1, 4),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('lid', '뚜껑', 'Lids', 'metal-black', 'metal'),
  ],
  tags: ['spice rack', 'spice jars', 'seasoning shelf', '양념 선반', '양념통', '향신료 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, pitch = 0.13, t = 0.012, d = 0.075;
    const h = p.tiers * pitch + 0.03;
    k.box('wood', p.wood, w, h, t, 0, h / 2, -d / 2 + t / 2, { r: 0.002 });
    for (const s of [-1, 1]) k.rbox('wood', p.wood, t, h, d, 0.003, s * (w / 2 - t / 2), h / 2, 0);
    const colours = ['#a8321c', '#d39b1a', '#5d6b2e', '#7a4a2a'];
    const n = Math.max(1, Math.floor((w - 2 * t - 0.01) / 0.055));
    for (let i = 0; i < p.tiers; i++) {
      const y = 0.012 + i * pitch;
      k.box('wood', p.wood, w - 2 * t, t, d - t, 0, y + t / 2, t / 2, { r: 0.0015 });
      k.rod('rail', 'metal-brass', [-w / 2 + t, y + 0.055, d / 2 - 0.008], [w / 2 - t, y + 0.055, d / 2 - 0.008], 0.003, { segs: k.seg(8, 4) });
      for (let j = 0; j < n; j++) {
        const x = -((n - 1) * 0.055) / 2 + j * 0.055, r = 0.022;
        const yb = y + t;
        k.cyl('glass', 'glass-clear', r, r, 0.08, x, yb, 0.004, { segs: k.seg(14, 6) });
        k.cyl('spice', 'ceramic-matte', r - 0.002, r - 0.002, 0.055, x, yb + 0.002, 0.004, { segs: k.seg(14, 6), overrides: { color: colours[(i * 2 + j) % 3] } });
        k.cyl('lids', p.lid, r + 0.001, r + 0.001, 0.016, x, yb + 0.08, 0.004, { segs: k.seg(14, 6) });
      }
    }
    return done(k);
  },
});

/* --------------------------------------------------- pot rail / knife strip */

/** Hanging utensils: local origin = hook point, hanging down (−y). */
const HANG = {
  ladle(k, m) {
    k.rod('tools', m, [0, -0.005, 0], [0, -0.25, 0.012], 0.0045, { segs: k.seg(8, 4) });
    k.add('tools', m, new THREE.TorusGeometry(0.008, 0.0025, k.seg(6, 3), k.seg(12, 5)).translate(0, -0.012, 0));
    k.lathe('tools', m, [[0, 0], [0.02, 0.002], [0.04, 0.016], [0.046, 0.032], [0.042, 0.032], [0.035, 0.018], [0.018, 0.006], [0, 0.005]], 0, -0.29, 0.012, { rx: -Math.PI / 2 + 0.3, segs: k.seg(16, 6) });
    return 0.33;
  },
  spatula(k, m) {
    k.rod('tools', 'plastic-black', [0, -0.005, 0], [0, -0.16, 0], 0.007, { segs: k.seg(8, 4) });
    k.rod('tools', m, [0, -0.16, 0], [0, -0.22, 0.004], 0.003, { segs: k.seg(6, 4) });
    k.box('tools', m, 0.07, 0.085, 0.003, 0, -0.26, 0.006, { r: 0.001, rx: -0.08 });
    return 0.31;
  },
  whisk(k, m) {
    k.rod('tools', m, [0, -0.005, 0], [0, -0.13, 0], 0.009, { segs: k.seg(10, 5) });
    for (let a = 0; a < 4; a++) k.add('tools', m, new THREE.TorusGeometry(0.03, 0.0012, k.seg(4, 3), k.seg(20, 8)).scale(1, 2.3, 1).rotateY((a * Math.PI) / 4).translate(0, -0.13 - 0.065, 0));
    return 0.27;
  },
  pan(k, m) {
    const R = 0.1;
    k.rod('tools', 'plastic-black', [0, -0.01, 0], [0, -0.13, 0], 0.011, { segs: k.seg(10, 5) });
    k.add('tools', m, new THREE.TorusGeometry(0.008, 0.003, k.seg(6, 3), k.seg(12, 5)).translate(0, -0.012, 0));
    k.lathe('pan', 'metal-black', [[0, 0], [R * 0.8, 0], [R * 0.85, 0.004], [R, 0.04], [R - 0.004, 0.041], [R * 0.82, 0.006], [0, 0.006]], 0, -0.13 - R, 0.002, { rx: Math.PI / 2, segs: k.seg(24, 8) });
    return 0.13 + 2 * R;
  },
  tongs(k, m) {
    k.add('tools', m, new THREE.TorusGeometry(0.01, 0.003, k.seg(6, 3), k.seg(12, 5), Math.PI).translate(0, -0.01, 0));
    for (const s of [-1, 1]) k.rod('tools', m, [s * 0.01, -0.01, 0], [s * 0.022, -0.24, 0.002], 0.004, { segs: k.seg(6, 4) });
    return 0.25;
  },
};

const potRail = make({
  id: 'kitchen-pot-rail', ko: '조리도구 걸이 레일', en: 'Utensil rail with tools', placement: 'wall', elevation: 1.15,
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.5, 1.5),
    P.int('tools', '도구 수', 'Tools', 5, 2, 9),
    P.mat('metal', '금속', 'Metal', 'metal-steel', 'metal'),
  ],
  tags: ['utensil rail', 'pot rail', 'hanging utensils', '조리도구 걸이', '주방 레일', '국자', '뒤집개'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, yr = 0.4, zr = 0.045;
    k.rod('rail', p.metal, [-w / 2, yr, zr], [w / 2, yr, zr], 0.008, { segs: k.seg(12, 6) });
    for (const s of [-1, 1]) {
      k.cyl('rail', p.metal, 0.022, 0.022, 0.008, s * (w / 2 - 0.04), yr, 0, { rx: Math.PI / 2, segs: k.seg(16, 6) });
      k.rod('rail', p.metal, [s * (w / 2 - 0.04), yr, 0.008], [s * (w / 2 - 0.04), yr, zr], 0.006, { segs: k.seg(10, 5) });
      k.sphere('rail', p.metal, 0.011, s * w / 2, yr, zr, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    }
    const order = ['ladle', 'spatula', 'whisk', 'pan', 'tongs', 'ladle', 'spatula', 'whisk', 'tongs'];
    const n = Math.min(p.tools, Math.floor((w - 0.12) / 0.09) + 1);
    const span = w - 0.16;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -span / 2 + (i * span) / (n - 1);
      // S hook
      k.tube('hooks', p.metal, [[x, yr + 0.004, zr - 0.012], [x, yr + 0.016, zr], [x, yr + 0.006, zr + 0.012], [x, yr - 0.02, zr + 0.01], [x, yr - 0.04, zr], [x, yr - 0.05, zr - 0.006]], 0.002, { radial: k.seg(6, 3), segs: k.seg(18, 6) });
      const kind = order[i % order.length];
      xform(k, () => HANG[kind](k, p.metal), { x, y: yr - 0.045, z: zr - 0.004 });
    }
    return done(k);
  },
});

function knifeBlade(L, bw, bread = false) {
  const s = new THREE.Shape();
  s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0);
  if (bread) { s.lineTo(bw / 2, -L + 0.012); s.quadraticCurveTo(bw / 2, -L, bw / 2 - 0.012, -L); s.lineTo(-bw / 2, -L + 0.005); }
  else { s.lineTo(bw / 2, -L * 0.5); s.quadraticCurveTo(bw / 2, -L * 0.92, -bw / 2, -L); }
  s.lineTo(-bw / 2, 0);
  return s;
}

const knifeStrip = make({
  id: 'kitchen-magnetic-knife-strip', ko: '자석 칼걸이', en: 'Magnetic knife strip', placement: 'wall', elevation: 1.25,
  params: [
    P.len('width', '폭', 'Width', 0.45, 0.3, 0.7),
    P.int('knives', '칼 수', 'Knives', 5, 1, 8),
    P.mat('strip', '바', 'Strip', 'wood-walnut', 'wood'),
    P.mat('handleMat', '칼 손잡이', 'Knife handles', 'plastic-black', 'plastic'),
  ],
  tags: ['knife strip', 'magnetic knife holder', 'knives', '칼걸이', '자석 칼꽂이', '식칼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, sh = 0.045, sd = 0.016, ys = 0.25;
    k.rbox('strip', p.strip, w, sh, sd, 0.004, 0, ys, sd / 2);
    const specs = [[0.21, 0.048, false], [0.16, 0.035, false], [0.23, 0.032, true], [0.12, 0.025, false], [0.18, 0.045, false], [0.1, 0.02, false], [0.2, 0.04, false], [0.14, 0.03, false]];
    const n = Math.min(p.knives, Math.floor((w - 0.04) / 0.05));
    const pitch = (w - 0.06) / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      const [L, bw, bread] = specs[i % specs.length];
      const x = -w / 2 + 0.03 + (i + 0.5) * pitch, top = ys + sh / 2 - 0.004;
      k.panel('blades', 'metal-steel', knifeBlade(L, Math.min(bw, pitch - 0.008), bread), 0.002, x, top, sd + 0.0012, { bevel: 0.0004, curveSegs: 8 });
      k.box('blades', 'metal-steel', Math.min(bw, pitch - 0.008) * 0.6, 0.012, 0.012, x, top + 0.006, sd + 0.006, { r: 0.002 });
      k.rbox('knifeHandles', p.handleMat, 0.022, 0.11, 0.016, 0.007, x, top + 0.012 + 0.055, sd + 0.006);
      for (const yy of [0.03, 0.07]) k.cyl('blades', 'metal-steel', 0.0035, 0.0035, 0.002, x, top + 0.012 + yy, sd + 0.0138, { rx: Math.PI / 2, segs: k.seg(8, 4) });
    }
    return done(k);
  },
});

/* ============================================================ FREESTANDING FURNITURE */

const trolley = make({
  id: 'kitchen-trolley-cart', ko: '주방 트롤리(3단 카트)', en: 'Kitchen trolley cart',
  params: [
    P.len('width', '폭', 'Width', 0.46, 0.35, 0.7),
    P.len('depth', '깊이', 'Depth', 0.36, 0.3, 0.45),
    P.len('height', '높이', 'Height', 0.82, 0.6, 0.95),
    P.int('tiers', '단 수', 'Tiers', 3, 2, 4),
    P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'),
    P.bool('woodTop', '원목 상판', 'Wood top', true),
    P.bool('items', '소품', 'Contents', true),
  ],
  tags: ['kitchen trolley', 'utility cart', 'rolling cart', '주방 트롤리', '카트', '바퀴 선반', '이동식 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p;
    const wr = 0.025, post = 0.012, y0 = 0.075;
    const xs = w / 2 - 0.015, zs = d / 2 - 0.015;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('frame', p.frame, post, post, h - y0, sx * xs, y0, sz * zs, { segs: k.seg(12, 6) });
      k.box('castors', 'metal-chrome', 0.03, 0.022, 0.02, sx * xs, y0 - 0.011, sz * zs, { r: 0.003 });
      k.cyl('castors', 'metal-chrome', 0.011, 0.011, 0.012, sx * xs, y0 - 0.034, sz * zs - 0.006, { rx: 0, segs: k.seg(8, 5) });
      k.cyl('wheels', 'rubber-black', wr, wr, 0.018, sx * xs - 0.009, wr, sz * zs - 0.008, { rz: Math.PI / 2, segs: k.seg(16, 8) });
    }
    const n = p.tiers;
    const levels = [];
    for (let i = 0; i < n; i++) levels.push(0.14 + (i * (h - 0.03 - 0.14)) / (n - 1));
    levels.forEach((y, i) => {
      const top = i === n - 1;
      if (top && p.woodTop) {
        k.rbox('top', 'wood-oak', w + 0.01, 0.025, d + 0.01, 0.004, 0, h - 0.0125, 0);
        return;
      }
      const tw = w - 0.03, td = d - 0.03, rim = 0.055, tt = 0.002;
      k.box('trays', p.frame, tw, tt, td, 0, y, 0, { r: 0 });
      for (const s of [-1, 1]) {
        k.box('trays', p.frame, tw, rim, tt, 0, y + rim / 2, s * td / 2, { r: 0 });
        k.box('trays', p.frame, tt, rim, td, s * tw / 2, y + rim / 2, 0, { r: 0 });
      }
      k.rod('trays', p.frame, [-tw / 2, y + rim, td / 2], [tw / 2, y + rim, td / 2], 0.0035, { segs: k.seg(6, 4) });
      if (p.items) {
        const gap = levels[i + 1] - y - 0.03;
        if (i === 0 && gap > 0.26) for (let j = 0; j < 3; j++) k.add('bottles', 'paint-white-gloss', bottleGeo(k, 0.032, 0.24).translate(-tw / 2 + 0.06 + j * 0.075, y + tt / 2, 0.03 - j * 0.04), { overrides: { color: '#28452c' } });
        else if (gap > 0.14) for (let j = 0; j < Math.floor(tw / 0.11); j++) jar(k, 0.04, Math.min(0.16, gap - 0.01), -tw / 2 + 0.06 + j * 0.105, y + tt / 2, -0.02 + (j % 2) * 0.05, { food: j % 2 ? 'paper' : 'wood-pine' });
      }
    });
    // push handle on the +x end
    for (const sz of [-1, 1]) k.rod('frame', p.frame, [xs, h - 0.06, sz * (zs - 0.03)], [xs + 0.05, h - 0.06, sz * (zs - 0.03)], 0.007, { segs: k.seg(8, 4) });
    k.rod('frame', p.frame, [xs + 0.05, h - 0.06, -(zs - 0.03)], [xs + 0.05, h - 0.06, zs - 0.03], 0.01, { segs: k.seg(10, 5) });
    return done(k);
  },
});

const barCounter = make({
  id: 'kitchen-bar-counter', ko: '홈바 하이 카운터', en: 'High bar counter',
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.9, 2.4),
    P.len('depth', '깊이', 'Depth', 0.45, 0.35, 0.6),
    P.len('height', '높이', 'Height', 1.05, 0.95, 1.1),
    P.mat('top', '상판', 'Top', 'wood-oak', 'wood'),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['bar counter', 'bar table', 'high table', '홈바', '바 테이블', '하이 테이블', '카운터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p;
    const r = 0.02, ty = h - 0.04;
    k.rbox('top', p.top, w, 0.04, d, 0.006, 0, h - 0.02, 0);
    const fx = w / 2 - 0.12, fz = d / 2 - 0.06;
    for (const s of [-1, 1]) {
      const x = s * fx;
      k.bentTube('frame', p.frame, [[x, ty, -fz], [x, r, -fz], [x, r, fz], [x, ty, fz]], r, 0.05, { radial: k.seg(12, 6) });
      k.rod('frame', p.frame, [x, ty - r, -fz], [x, ty - r, fz], r * 0.8, { segs: k.seg(10, 5) });
    }
    // footrest + stretcher
    k.rod('frame', 'metal-chrome', [-fx, 0.3, fz], [fx, 0.3, fz], 0.016, { segs: k.seg(14, 6) });
    for (const s of [-1, 1]) k.rod('frame', 'metal-chrome', [s * fx, 0.3, fz - 0.02], [s * fx, 0.3, fz], 0.012, { segs: k.seg(10, 5) });
    k.rod('frame', p.frame, [-fx, ty - 0.08, -fz + 0.02], [fx, ty - 0.08, -fz + 0.02], r * 0.7, { segs: k.seg(10, 5) });
    return done(k);
  },
});

const butcher = make({
  id: 'kitchen-butcher-block-island', ko: '원목 도마 상판 아일랜드', en: 'Butcher-block island',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.len('depth', '깊이', 'Depth', 0.65, 0.5, 0.8),
    P.len('height', '높이', 'Height', 0.9, 0.85, 0.95),
    P.mat('wood', '상판', 'Block top', 'wood-oak', 'wood'),
    P.mat('wood2', '상판 줄무늬', 'Block stripes', 'wood-ash', 'wood'),
    P.mat('body', '다리·앞판', 'Base', 'paint-grey-matte', 'paint'),
    P.bool('towel', '타월 바', 'Towel bar', true),
  ],
  tags: ['butcher block', 'kitchen island', 'work table', '도마 아일랜드', '원목 아일랜드', '작업대', '아일랜드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p;
    const tt = 0.07, ov = 0.03, leg = 0.065;
    // laminated top: strips along x
    const n = Math.max(6, Math.round(d / 0.045));
    for (let i = 0; i < n; i++) k.box(i % 2 ? 'top2' : 'top', i % 2 ? p.wood2 : p.wood, w, tt, d / n, 0, h - tt / 2, -d / 2 + (i + 0.5) * (d / n), { r: 0.003 });
    const lx = w / 2 - ov - leg / 2, lz = d / 2 - ov - leg / 2, lh = h - tt;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('base', p.body, leg, lh, leg, sx * lx, lh / 2, sz * lz, { r: 0.004 });
    const ah = 0.12, ay = lh - ah / 2;
    for (const sz of [-1, 1]) k.box('base', p.body, 2 * lx - leg, ah, 0.02, 0, ay, sz * (lz + leg / 2 - 0.016), { r: 0.002 });
    for (const sx of [-1, 1]) k.box('base', p.body, 0.02, ah, 2 * lz - leg, sx * (lx + leg / 2 - 0.016), ay, 0, { r: 0.002 });
    // drawer on the front apron
    const dw = Math.min(0.5, (2 * lx - leg) * 0.6);
    k.box('base', p.body, dw, ah - 0.02, 0.018, 0, ay, lz + leg / 2 - 0.004, { r: 0.002 });
    addHandle(k, 'handles', 'metal-black', 'knob', 0, ay, lz + leg / 2 + 0.005);
    // slatted lower shelf
    const sy = 0.16, sw = 2 * lx - leg, slats = Math.max(4, Math.round((2 * lz) / 0.08));
    for (const sz of [-1, 1]) k.box('base', p.body, sw, 0.04, 0.025, 0, sy - 0.02, sz * (lz - 0.005), { r: 0.002 });
    for (let i = 0; i < slats; i++) k.box('top', p.wood, sw + 0.02, 0.018, (2 * lz - 0.02) / slats - 0.012, 0, sy + 0.009, -lz + 0.01 + (i + 0.5) * ((2 * lz - 0.02) / slats), { r: 0.002 });
    if (p.towel) {
      const x = lx + leg / 2 + 0.045;
      k.rod('handles', 'metal-chrome', [x, lh - 0.2, -lz + 0.04], [x, lh - 0.2, lz - 0.04], 0.008, { segs: k.seg(10, 5) });
      for (const s of [-1, 1]) k.rod('handles', 'metal-chrome', [lx + leg / 2, lh - 0.2, s * (lz - 0.04)], [x, lh - 0.2, s * (lz - 0.04)], 0.006, { segs: k.seg(8, 4) });
    }
    return done(k);
  },
});

const dresser = make({
  id: 'kitchen-dresser', ko: '키친 드레서(그릇장)', en: 'Kitchen dresser',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.9, 1.6),
    P.len('height', '높이', 'Height', 1.95, 1.7, 2.2),
    P.mat('paint', '도장', 'Paint', 'paint-blue-matte', 'paint'),
    P.mat('top', '상판', 'Worktop', 'wood-oak', 'wood'),
    P.bool('plates', '접시 진열', 'Plates on display', true),
  ],
  tags: ['dresser', 'kitchen hutch', 'welsh dresser', 'sideboard', '키친 드레서', '그릇장', '찬장', '수납장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p;
    const d = 0.5, lowH = 0.88, du = 0.28, t = 0.02;
    addCabinet(k, { w, h: lowH, d, rows: [{ h: 0.7, n: 2, type: 'door' }, { h: 0.3, n: 2, type: 'drawer' }], body: p.paint, front: p.paint, handle: 'knob', handleMat: 'metal-brass', base: 'plinth', plinth: 0.08, top: p.top, topThick: 0.03, topOverhang: 0.015 });
    const zc = -d / 2 + du / 2, hu = h - lowH - 0.06, hw = w - 0.04;
    openCase(k, 'body', p.paint, hw, hu, du, 0, lowH, zc, t, { bottom: false });
    const ys = [lowH + hu * 0.4, lowH + hu * 0.72];
    for (const y of ys) {
      k.box('body', p.paint, hw - 2 * t, 0.02, du - 0.008, 0, y - 0.01, zc + 0.004, { r: 0.0015 });
      k.rod('body', p.paint, [-hw / 2 + t, y + 0.05, zc + du / 2 - 0.025], [hw / 2 - t, y + 0.05, zc + du / 2 - 0.025], 0.007, { segs: k.seg(10, 5) });
    }
    k.box('body', p.paint, w + 0.02, 0.035, du + 0.04, 0, h - 0.06 + 0.0175, zc + 0.01, { r: 0.004 });
    k.box('body', p.paint, w + 0.05, 0.025, du + 0.055, 0, h - 0.0125, zc + 0.017, { r: 0.004 });
    if (p.plates) {
      const pr = 0.1, n = Math.floor((hw - 0.06) / (2 * pr + 0.02));
      for (const y of ys) {
        for (let i = 0; i < n; i++) {
          const x = -((n - 1) * (2 * pr + 0.02)) / 2 + i * (2 * pr + 0.02);
          // leaning back against the back board, foot against the rail
          k.add('dishes', 'ceramic-white', plateGeo(k, pr, 0.018).translate(0, -0.009, 0).rotateX(Math.PI / 2 - 0.2).translate(x, y + pr * Math.cos(0.2) + 0.004, zc - du / 2 + 0.03 + pr * Math.sin(0.2)));
        }
      }
      shelfItems(k, -hw / 2 + t, hw / 2 - t, lowH, zc + 0.03, du - 0.07, ys[0] - lowH - 0.04, 21, ['jar', 'mugs', 'bowls', 'jar2', 'mugs']);
    }
    return done(k);
  },
});

/* ------------------------------------------------------------------ sinks */

const farmSink = make({
  id: 'kitchen-farmhouse-sink-counter', ko: '앞치마형 싱크 카운터', en: 'Farmhouse (apron) sink counter',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.0, 2.4),
    P.len('sinkWidth', '싱크 폭', 'Sink width', 0.76, 0.6, 0.9),
    P.mat('front', '도어', 'Fronts', 'paint-green-matte', 'paint'),
    P.mat('top', '상판', 'Countertop', 'marble-white', 'stone'),
    P.mat('sink', '싱크', 'Sink', 'ceramic-white', 'ceramic'),
    P.mat('tap', '수전', 'Tap', 'metal-brass', 'metal'),
    P.pick('handle', '손잡이', 'Handles', 'knob', OPT.handle),
  ],
  tags: ['farmhouse sink', 'apron sink', 'belfast sink', 'sink counter', '팜하우스 싱크', '앞치마 싱크', '싱크대', '도기 싱크'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.85, t = 0.03, d = 0.6;
    const sw = Math.min(p.sinkWidth, w - 0.3), side = (w - sw) / 2;
    for (const s of [-1, 1]) {
      const n = Math.max(1, Math.round(side / 0.6)), mw = side / n;
      for (let i = 0; i < n; i++) {
        const x = s * (sw / 2 + mw * (i + 0.5));
        baseModule(k, { w: mw, h: h - t, d: d - 0.02, x, z: -0.01, kind: i % 2 === 0 ? 'drawers' : 'doors', body: 'wood-white', front: p.front, handle: p.handle, handleMat: 'metal-brass' });
      }
      k.box('top', p.top, side, t, d, s * (sw / 2 + side / 2), h - t / 2, 0, { r: 0.003 });
    }
    // under-sink cupboard, then the ceramic sink with its apron front
    const sh = 0.25, sb = h - sh;
    addCabinet(k, { w: sw, h: sb, d: d - 0.02, z: -0.01, rows: [{ h: 1, n: 2, type: 'door', handleY: sb - 0.06 }], body: 'wood-white', front: p.front, handle: p.handle, handleMat: 'metal-brass', base: 'plinth', plinth: 0.1 });
    const ow = sw - 0.004, zf = d / 2 + 0.012, sd = 0.5, zb = zf - sd, wt = 0.03;
    k.rbox('sink', p.sink, ow, sh, wt, 0.008, 0, sb + sh / 2, zf - wt / 2);
    k.rbox('sink', p.sink, ow, sh, wt, 0.008, 0, sb + sh / 2, zb + wt / 2);
    for (const s of [-1, 1]) k.rbox('sink', p.sink, wt, sh, sd - 2 * wt + 0.004, 0.008, s * (ow / 2 - wt / 2), sb + sh / 2, (zf + zb) / 2);
    k.rbox('sink', p.sink, ow - 2 * wt + 0.004, 0.035, sd - 2 * wt + 0.004, 0.006, 0, sb + 0.0175, (zf + zb) / 2);
    k.cyl('drain', 'metal-chrome', 0.045, 0.045, 0.003, 0, sb + 0.035, (zf + zb) / 2, { segs: k.seg(24, 8) });
    k.box('top', p.top, sw, t, zb + d / 2, 0, h - t / 2, (zb - d / 2) / 2, { r: 0.003 });
    addFaucet(k, 0, h, (zb - d / 2) / 2, { reach: 0.26, height: 0.36, mat: p.tap });
    return done(k);
  },
});

const doubleSink = make({
  id: 'kitchen-double-sink-counter', ko: '양개수대 싱크대', en: 'Double-bowl sink counter',
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.2, 3.0),
    P.len('bowl', '개수대 폭', 'Bowl width', 0.4, 0.32, 0.5),
    P.mat('front', '도어', 'Fronts', 'paint-grey-matte', 'paint'),
    P.mat('top', '상판', 'Countertop', 'granite-grey', 'stone'),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
    P.bool('upstand', '뒷턱', 'Upstand', true),
  ],
  tags: ['double sink', 'double bowl sink', 'sink counter', '양개수대', '2구 싱크', '싱크대', '개수대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.85, t = 0.03, d = 0.6;
    const bw = Math.min(p.bowl, (w - 0.2) / 2 - 0.04), gap = 0.06, span = 2 * bw + gap;
    const n = Math.max(2, Math.round(w / 0.6)), mw = w / n;
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + mw * i, x1 = x0 + mw;
      const under = x1 > -span / 2 + 0.02 && x0 < span / 2 - 0.02;
      baseModule(k, { w: mw, h: h - t, d: d - 0.02, x: (x0 + x1) / 2, z: -0.01, kind: under ? 'sink' : i % 2 ? 'drawers' : 'doors', body: 'wood-white', front: p.front, handle: p.handle });
    }
    const sd = 0.42, sz = 0.02;
    const shape = roundRect(w, d, 0.002);
    const xs = [-(bw + gap) / 2, (bw + gap) / 2];
    for (const x of xs) {
      const hole = roundRect(bw, sd, 0.03);
      shape.holes.push(new THREE.Path(hole.getPoints(8).reverse().map((v) => new THREE.Vector2(v.x + x, v.y + sz))));
    }
    k.slab('top', p.top, shape, t, h - t, { bevel: 0.003, curveSegs: 6 });
    addBasin(k, xs[0], h - t, sz, bw - 0.01, sd - 0.01, 0.2);
    addBasin(k, xs[1], h - t, sz, bw - 0.01, sd - 0.01, 0.16);
    addFaucet(k, xs[0] * 0.5, h, -d / 2 + 0.07, { reach: 0.22 });
    k.cyl('faucet', 'metal-chrome', 0.016, 0.018, 0.012, xs[1] + 0.05, h, -d / 2 + 0.07, { segs: k.seg(14, 6) });
    k.rod('faucet', 'metal-chrome', [xs[1] + 0.05, h + 0.012, -d / 2 + 0.07], [xs[1] + 0.05, h + 0.075, -d / 2 + 0.07], 0.006, { segs: k.seg(8, 4) });
    k.rod('faucet', 'metal-chrome', [xs[1] + 0.05, h + 0.075, -d / 2 + 0.07], [xs[1] + 0.05, h + 0.07, -d / 2 + 0.12], 0.004, { segs: k.seg(8, 4) });
    if (p.upstand) k.box('top', p.top, w, 0.05, 0.015, 0, h + 0.025, -d / 2 + 0.0075, { r: 0.002 });
    return done(k);
  },
});

/* ------------------------------------------------------------------ hood, backsplash */

const islandHood = make({
  id: 'kitchen-island-hood', ko: '아일랜드 후드(천장형)', en: 'Island cooker hood', placement: 'ceiling', elevation: CEILING - 0.8,
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.len('depth', '깊이', 'Depth', 0.6, 0.5, 0.7),
    P.len('drop', '전체 높이', 'Total height', 0.8, 0.5, 1.2),
    P.mat('body', '재질', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['island hood', 'ceiling hood', 'range hood', 'extractor', '아일랜드 후드', '천장형 후드', '레인지후드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, drop: H } = p;
    const cw = 0.3, cdp = 0.28, can = 0.06, fr = 0.22;
    k.box('body', p.body, w, can, d, 0, 0.002 + can / 2, 0, { r: 0.004 });
    frustum(k, 'body', p.body, w - 0.004, d - 0.004, cw + 0.01, cdp + 0.01, fr, 0, can + 0.002, 0);
    k.box('body', p.body, cw, H - can - fr - 0.002, cdp, 0, can + fr + 0.002 + (H - can - fr - 0.002) / 2, 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('filter', 'metal-aluminium', w / 2 - 0.06, 0.003, d - 0.12, s * (w / 4 - 0.01), 0.0015, 0, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('light', 'light-warm', 0.022, 0.022, 0.002, sx * (w / 2 - 0.035), 0.0005, sz * (d / 2 - 0.035), { segs: k.seg(14, 6) });
    }
    k.light(0, -0.03, 0, { intensity: 0.6, distance: 1.8, type: 'spot', angle: 1.1 });
    k.box('controls', 'screen-black', 0.14, 0.02, 0.003, 0, 0.032, d / 2 + 0.001, { r: 0 });
    for (let i = 0; i < 4; i++) k.cyl('controls', 'metal-chrome', 0.005, 0.005, 0.003, -0.045 + i * 0.03, 0.032, d / 2 + 0.002, { rx: Math.PI / 2, segs: k.seg(10, 5) });
    return done(k);
  },
});

const backsplash = make({
  id: 'kitchen-backsplash-panel', ko: '주방 벽 타일 패널(백스플래시)', en: 'Kitchen backsplash panel', placement: 'wall', elevation: 0.85,
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.6, 3.0),
    P.len('height', '높이', 'Height', 0.6, 0.4, 0.9),
    P.mat('tile', '타일', 'Tile', 'tile-subway-white', 'tile'),
    P.int('sockets', '콘센트', 'Sockets', 1, 0, 3),
    P.bool('trim', '알루미늄 마감', 'Metal trim', true),
  ],
  tags: ['backsplash', 'splashback', 'kitchen tiles', '백스플래시', '주방 타일', '벽 타일', '콘센트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h } = p;
    const t = 0.012;
    k.box('tile', p.tile, w, h, t, 0, h / 2, t / 2, { r: 0.001 });
    if (p.trim) {
      k.box('trim', 'metal-aluminium', w + 0.008, 0.008, t + 0.004, 0, h + 0.004, (t + 0.004) / 2, { r: 0.001 });
      for (const s of [-1, 1]) k.box('trim', 'metal-aluminium', 0.008, h + 0.008, t + 0.004, s * (w / 2 + 0.004), (h + 0.008) / 2, (t + 0.004) / 2, { r: 0.001 });
    }
    const n = Math.min(p.sockets, Math.floor(w / 0.4));
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? w * 0.3 : -w / 2 + (w * (i + 0.5)) / n, y = h * 0.55;
      k.rbox('sockets', 'plastic-white', 0.15, 0.085, 0.01, 0.006, x, y, t + 0.005);
      for (const s of [-1, 1]) {
        k.cyl('sockets', 'plastic-white', 0.022, 0.022, 0.004, x + s * 0.037, y, t + 0.01, { rx: Math.PI / 2, segs: k.seg(16, 6) });
        for (const e of [-1, 1]) k.cyl('holes', 'plastic-black', 0.0035, 0.0035, 0.0012, x + s * 0.037 + e * 0.009, y, t + 0.0138, { rx: Math.PI / 2, segs: k.seg(8, 4) });
      }
    }
    return done(k);
  },
});

/* ------------------------------------------------------------- stool / bins */

const stepStool = make({
  id: 'kitchen-step-stool', ko: '주방 접이식 발판(2단)', en: 'Folding kitchen step stool',
  params: [
    P.len('height', '높이', 'Height', 0.5, 0.4, 0.65),
    P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'),
    P.mat('step', '발판', 'Steps', 'plastic-grey', 'plastic'),
  ],
  tags: ['step stool', 'step ladder', 'kitchen ladder', '발판', '접이식 사다리', '스텝 스툴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, hw = 0.2, r = 0.011;
    const fz0 = 0.22, fz1 = -0.02;
    const fzAt = (y) => fz0 + (fz1 - fz0) * (y / h);
    for (const s of [-1, 1]) {
      k.rod('frame', p.frame, [s * hw, 0.015, fz0], [s * hw, h - 0.02, fz1], r, { segs: k.seg(10, 5) });
      k.rod('frame', p.frame, [s * (hw - 0.03), 0.015, -0.2], [s * (hw - 0.03), h - 0.05, -0.04], r, { segs: k.seg(10, 5) });
      k.cyl('feet', 'rubber-black', 0.016, 0.016, 0.02, s * hw, 0, fz0, { segs: k.seg(10, 5) });
      k.cyl('feet', 'rubber-black', 0.016, 0.016, 0.02, s * (hw - 0.03), 0, -0.2, { segs: k.seg(10, 5) });
    }
    k.rod('frame', p.frame, [-(hw - 0.03), 0.12, -0.17], [hw - 0.03, 0.12, -0.17], r * 0.8, { segs: k.seg(8, 4) });
    const y1 = h * 0.5, z1 = fzAt(y1) - 0.055;
    k.rbox('step', p.step, 2 * hw - 0.03, 0.025, 0.13, 0.008, 0, y1, z1);
    k.rbox('step', p.step, 2 * hw + 0.03, 0.03, 0.26, 0.01, 0, h - 0.015, -0.05);
    for (const [yy, zz, dd] of [[y1 + 0.0125, z1, 0.11], [h, -0.05, 0.22]]) {
      for (let i = 0; i < 4; i++) k.box('tread', 'rubber-black', 2 * hw - 0.08, 0.003, 0.012, 0, yy + 0.001, zz - dd / 2 + 0.02 + i * (dd - 0.04) / 3, { r: 0.001 });
    }
    for (const s of [-1, 1]) k.rod('frame', p.frame, [s * hw, y1, z1 + 0.04], [s * (hw - 0.015), y1, z1 + 0.04], r * 0.7, { segs: k.seg(6, 4) });
    return done(k);
  },
});

const bins = make({
  id: 'kitchen-recycling-bins', ko: '분리수거함 세트', en: 'Recycling bin set',
  params: [
    P.int('bins', '개수', 'Bins', 3, 1, 4),
    P.len('height', '높이', 'Height', 0.5, 0.4, 0.7),
    P.mat('body', '몸체', 'Body', 'plastic-grey', 'plastic'),
  ],
  tags: ['recycling bins', 'trash can', 'waste bin', '분리수거함', '쓰레기통', '재활용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.bins, bw = 0.26, bd = 0.36, h = p.height, lidH = 0.04;
    const cols = ['#2f6fb5', '#3d8c4a', '#e0b52a', '#c0392b'];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (bw + 0.012);
      taperBox(k, 'body', p.body, bw, h - lidH, bd, 0.9, x, 0, 0);
      k.rbox('lids', 'plastic-white', bw + 0.008, lidH, bd + 0.008, 0.012, x, h - lidH / 2, 0, { overrides: { color: cols[i % cols.length] } });
      k.rbox('lids', 'plastic-white', 0.1, 0.012, 0.02, 0.005, x, h - lidH - 0.002, bd / 2 + 0.01, { overrides: { color: cols[i % cols.length] } });
      k.rbox('marks', 'plastic-white', 0.08, 0.08, 0.002, 0.01, x, h * 0.55, bd / 2 * (0.9 + 0.1 * 0.55) + 0.001);
    }
    return done(k);
  },
});

const pedalBin = make({
  id: 'kitchen-pedal-bin', ko: '페달 휴지통', en: 'Pedal bin',
  params: [
    P.len('height', '높이', 'Height', 0.62, 0.4, 0.8),
    P.len('radius', '반지름', 'Radius', 0.15, 0.11, 0.2),
    P.mat('body', '몸체', 'Body', 'metal-steel', 'metal'),
  ],
  tags: ['pedal bin', 'trash can', 'kitchen bin', '페달 휴지통', '쓰레기통', '휴지통'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, r = p.radius;
    const s = k.seg(36, 10);
    k.lathe('base', 'plastic-black', [[0, 0], [r * 0.97, 0], [r * 1.0, 0.01], [r, 0.03], [0, 0.03]], 0, 0, 0, { segs: s });
    k.lathe('body', p.body, [[0, 0.03], [r * 0.99, 0.03], [r, 0.04], [r, h - 0.06], [r * 0.99, h - 0.05], [0, h - 0.05]], 0, 0, 0, { segs: s });
    k.lathe('lid', p.body, [[0, h - 0.052], [r * 1.01, h - 0.052], [r * 1.01, h - 0.04], [r * 0.85, h - 0.012], [r * 0.4, h], [0, h]], 0, 0, 0, { segs: s, smooth: 10 });
    k.box('base', 'plastic-black', 0.08, 0.025, 0.07, 0, 0.022, r + 0.02, { r: 0.006 });
    k.box('base', 'plastic-black', 0.06, 0.03, 0.04, 0, h - 0.055, -r - 0.008, { r: 0.006 });
    return done(k);
  },
});

/* ==================================================================== COUNTERTOP */

const kettle = make({
  id: 'kitchen-electric-kettle', ko: '전기 주전자', en: 'Electric kettle', placement: 'surface',
  params: [
    P.mat('body', '몸체', 'Body', 'metal-steel', 'metal'),
    P.mat('accent', '손잡이·받침', 'Handle & base', 'plastic-black', 'plastic'),
  ],
  tags: ['electric kettle', 'kettle', '전기 주전자', '전기포트', '주전자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = k.seg(32, 10);
    k.lathe('accent', p.accent, [[0, 0], [0.084, 0], [0.088, 0.006], [0.086, 0.018], [0.082, 0.022], [0, 0.022]], 0, 0, 0, { segs: s });
    k.lathe('body', p.body, [[0, 0.022], [0.076, 0.022], [0.081, 0.03], [0.08, 0.1], [0.073, 0.18], [0.066, 0.208], [0.062, 0.212], [0, 0.212]], 0, 0, 0, { segs: s, smooth: 14 });
    k.lathe('accent', p.accent, [[0, 0.208], [0.064, 0.208], [0.062, 0.218], [0.045, 0.228], [0.02, 0.232], [0, 0.232]], 0, 0, 0, { segs: s });
    k.cyl('accent', p.accent, 0.01, 0.012, 0.014, 0, 0.23, -0.02, { segs: k.seg(12, 5) });
    k.cyl('body', p.body, 0.011, 0.026, 0.075, 0, 0.15, 0.052, { rx: 0.75, segs: k.seg(16, 6) });
    k.bentTube('accent', p.accent, [[0, 0.06, -0.072], [0, 0.07, -0.135], [0, 0.2, -0.125], [0, 0.205, -0.055]], 0.013, 0.035, { radial: k.seg(12, 6) });
    k.box('accent', p.accent, 0.016, 0.012, 0.03, 0, 0.08, -0.115, { r: 0.004, rx: 0.2 });
    k.box('window', 'glass-tinted', 0.012, 0.11, 0.02, 0.0795, 0.09, 0.0, { r: 0.004 });
    return done(k);
  },
});

const toaster = make({
  id: 'kitchen-toaster', ko: '토스터', en: 'Toaster', placement: 'surface',
  params: [
    P.pick('slots', '슬롯', 'Slices', '2', [['2', '2구', '2-slice'], ['4', '4구', '4-slice']]),
    P.color('color', '색', 'Colour', '#d9d3c4'),
  ],
  tags: ['toaster', 'bread toaster', '토스터', '토스트기', '빵 굽는 기계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const four = p.slots === '4';
    const w = four ? 0.4 : 0.28, h = 0.19, d = 0.17;
    k.box('base', 'metal-chrome', w - 0.02, 0.012, d - 0.02, 0, 0.006, 0, { r: 0.004 });
    k.rbox('body', 'paint-white-gloss', w, h - 0.012, d, 0.035, 0, 0.012 + (h - 0.012) / 2, 0, { overrides: { color: p.color }, segs: k.seg(5, 2) });
    const xs = four ? [-0.095, 0.095] : [0];
    for (const x of xs) for (const z of [-0.03, 0.03]) {
      k.box('slots', 'plastic-black', 0.13, 0.002, 0.026, x, h + 0.0002, z, { r: 0 });
      k.panel('trim', 'metal-chrome', frameShape(0.142, 0.038, 0.006, 0.006, 0.004), 0.002, x, z, h + 0.0005, { rx: -Math.PI / 2, bevel: 0.0005, curveSegs: 4 });
    }
    // lever + dial on the +x end
    k.box('trim', 'plastic-black', 0.004, 0.11, 0.012, w / 2 + 0.001, 0.11, 0.03, { r: 0.001 });
    k.rbox('trim', 'metal-chrome', 0.03, 0.016, 0.03, 0.006, w / 2 + 0.016, 0.14, 0.03);
    k.cyl('trim', 'metal-chrome', 0.014, 0.016, 0.012, w / 2, 0.08, -0.035, { rz: -Math.PI / 2, segs: k.seg(16, 6) });
    k.box('trim', 'metal-chrome', 0.004, 0.008, 0.07, -w / 2 - 0.001, 0.02, 0, { r: 0.001 });
    return done(k);
  },
});

const espresso = make({
  id: 'kitchen-espresso-machine', ko: '에스프레소 머신', en: 'Espresso machine', placement: 'surface',
  params: [
    P.mat('body', '몸체', 'Body', 'metal-steel', 'metal'),
    P.mat('accent', '포인트', 'Accents', 'plastic-black', 'plastic'),
    P.bool('cup', '컵', 'Cup', true),
  ],
  tags: ['espresso machine', 'coffee machine', 'barista', '에스프레소 머신', '커피 머신', '커피메이커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('body', p.body, 0.3, 0.38, 0.28, 0.012, 0, 0.19, -0.06, { segs: k.seg(3, 1) });
    k.rbox('body', p.body, 0.3, 0.1, 0.13, 0.012, 0, 0.33, 0.13, { segs: k.seg(3, 1) });
    k.box('accent', p.accent, 0.26, 0.2, 0.004, 0, 0.165, 0.081, { r: 0.002 });
    k.cyl('chrome', 'metal-chrome', 0.036, 0.04, 0.03, 0, 0.25, 0.13, { segs: k.seg(20, 8) });
    k.cyl('chrome', 'metal-chrome', 0.038, 0.034, 0.03, 0, 0.22, 0.13, { segs: k.seg(20, 8) });
    k.rod('accent', p.accent, [0, 0.235, 0.165], [0, 0.222, 0.3], 0.012, { segs: k.seg(12, 5) });
    k.cyl('chrome', 'metal-chrome', 0.006, 0.004, 0.012, 0, 0.208, 0.13, { segs: k.seg(8, 4) });
    // drip tray
    k.box('chrome', 'metal-chrome', 0.27, 0.035, 0.15, 0, 0.0175, 0.14, { r: 0.004 });
    for (let i = 0; i < 6; i++) k.box('accent', p.accent, 0.23, 0.0015, 0.008, 0, 0.0356, 0.085 + i * 0.022, { r: 0 });
    // gauge, buttons, steam wand
    k.cyl('chrome', 'metal-chrome', 0.026, 0.026, 0.008, -0.08, 0.335, 0.195, { rx: Math.PI / 2, segs: k.seg(20, 8) });
    k.cyl('dial', 'plastic-white', 0.021, 0.021, 0.002, -0.08, 0.335, 0.203, { rx: Math.PI / 2, segs: k.seg(20, 8) });
    for (let i = 0; i < 3; i++) k.cyl('accent', p.accent, 0.009, 0.009, 0.006, 0.03 + i * 0.03, 0.335, 0.195, { rx: Math.PI / 2, segs: k.seg(12, 5) });
    k.rod('chrome', 'metal-chrome', [0.12, 0.29, 0.13], [0.13, 0.12, 0.2], 0.005, { segs: k.seg(8, 4) });
    k.cyl('accent', p.accent, 0.014, 0.014, 0.03, 0.12, 0.28, 0.13, { segs: k.seg(12, 5) });
    // cup rail on top
    for (const s of [-1, 1]) k.rod('chrome', 'metal-chrome', [s * 0.13, 0.4, -0.18], [s * 0.13, 0.4, 0.17], 0.004, { segs: k.seg(6, 4) });
    for (const s of [-1, 1]) for (const z of [-0.18, 0.17]) k.rod('chrome', 'metal-chrome', [s * 0.13, 0.38, z], [s * 0.13, 0.4, z], 0.004, { segs: k.seg(6, 4) });
    if (p.cup) k.lathe('cup', 'ceramic-white', [[0, 0], [0.024, 0], [0.03, 0.01], [0.032, 0.06], [0.028, 0.06], [0.026, 0.012], [0, 0.012]], 0, 0.035, 0.13, { segs: k.seg(18, 7) });
    return done(k);
  },
});

const dripCoffee = make({
  id: 'kitchen-drip-coffee-maker', ko: '드립 커피메이커', en: 'Drip coffee maker', placement: 'surface',
  params: [
    P.mat('body', '몸체', 'Body', 'plastic-black', 'plastic'),
    P.mat('trim', '장식', 'Trim', 'metal-steel', 'metal'),
  ],
  tags: ['coffee maker', 'drip coffee', 'filter coffee', '커피메이커', '드립 커피', '커피 머신'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('body', p.body, 0.21, 0.045, 0.27, 0.01, 0, 0.0225, 0);
    k.rbox('body', p.body, 0.21, 0.36, 0.11, 0.012, 0, 0.18 + 0.02, -0.08);
    k.rbox('body', p.body, 0.21, 0.08, 0.22, 0.012, 0, 0.35, -0.025);
    k.box('trim', p.trim, 0.212, 0.012, 0.222, 0, 0.385, -0.025, { r: 0.004 });
    k.cyl('trim', p.trim, 0.072, 0.072, 0.005, 0, 0.045, 0.045, { segs: k.seg(24, 8) });
    k.lathe('body', p.body, [[0, 0], [0.05, 0], [0.068, 0.032], [0.07, 0.035], [0, 0.035]], 0, 0.276, 0.045, { segs: k.seg(20, 8) });
    k.box('display', 'light-cool', 0.04, 0.012, 0.002, -0.05, 0.026, 0.135, { r: 0 });
    k.cyl('trim', p.trim, 0.008, 0.008, 0.004, 0.06, 0.026, 0.135, { rx: Math.PI / 2, segs: k.seg(10, 5) });
    // glass carafe with coffee
    const s = k.seg(24, 8);
    k.lathe('glass', 'glass-clear', [[0, 0], [0.058, 0], [0.068, 0.02], [0.07, 0.06], [0.06, 0.12], [0.055, 0.15], [0, 0.15]], 0, 0.0505, 0.045, { segs: s, smooth: 12 });
    k.lathe('coffee', 'wood-dark', [[0, 0], [0.056, 0], [0.065, 0.02], [0.066, 0.06], [0, 0.065]], 0, 0.053, 0.045, { segs: s, overrides: { color: '#2a170c' } });
    k.lathe('body', p.body, [[0, 0], [0.058, 0], [0.058, 0.012], [0.03, 0.022], [0, 0.022]], 0, 0.198, 0.045, { segs: s });
    k.bentTube('body', p.body, [[0.064, 0.18, 0.045], [0.1, 0.18, 0.045], [0.1, 0.08, 0.045], [0.07, 0.08, 0.045]], 0.011, 0.025, { radial: k.seg(10, 5) });
    return done(k);
  },
});

const mixer = make({
  id: 'kitchen-stand-mixer', ko: '스탠드 믹서', en: 'Stand mixer', placement: 'surface',
  params: [
    P.color('color', '색', 'Colour', '#b3262e'),
    P.mat('bowl', '볼', 'Bowl', 'metal-steel', 'metal'),
  ],
  tags: ['stand mixer', 'kitchen mixer', 'baking', '스탠드 믹서', '반죽기', '베이킹'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const ov = { overrides: { color: p.color } };
    k.slab('body', 'paint-white-gloss', superEllipse(0.2, 0.34, 3, k.hi ? 48 : 20), 0.04, 0, { bevel: 0.01, ...ov });
    k.rbox('body', 'paint-white-gloss', 0.11, 0.25, 0.12, 0.045, 0, 0.165, -0.11, { ...ov, segs: k.seg(5, 2) });
    const cap = new THREE.CapsuleGeometry(0.075, 0.2, k.seg(8, 3), k.seg(20, 8)).rotateX(Math.PI / 2).translate(0, 0.305, -0.025);
    k.add('body', 'paint-white-gloss', cap, ov);
    k.cyl('chrome', 'metal-chrome', 0.032, 0.032, 0.014, 0, 0.3, 0.17, { rx: Math.PI / 2, segs: k.seg(18, 6) });
    k.add('chrome', 'metal-chrome', new THREE.TorusGeometry(0.0755, 0.004, k.seg(6, 3), k.seg(24, 8)).translate(0, 0.305, 0.03));
    k.cyl('chrome', 'metal-chrome', 0.07, 0.075, 0.008, 0, 0.04, 0.035, { segs: k.seg(20, 8) });
    k.lathe('bowl', p.bowl, [[0, 0], [0.05, 0], [0.085, 0.035], [0.1, 0.125], [0.104, 0.13], [0.096, 0.13], [0.081, 0.038], [0.048, 0.006], [0, 0.006]], 0, 0.048, 0.035, { segs: k.seg(28, 10) });
    k.tube('chrome', 'metal-chrome', [[0, 0.232, 0.035], [0, 0.17, 0.035], [0.018, 0.12, 0.045], [0, 0.085, 0.035], [-0.018, 0.12, 0.025], [0, 0.17, 0.035]], 0.0045, { radial: k.seg(8, 4), segs: k.seg(30, 10) });
    k.rod('chrome', 'metal-chrome', [0.055, 0.23, -0.08], [0.075, 0.24, -0.06], 0.005, { segs: k.seg(8, 4) });
    return done(k);
  },
});

const blender = make({
  id: 'kitchen-blender', ko: '블렌더(믹서기)', en: 'Blender', placement: 'surface',
  params: [
    P.mat('base', '본체', 'Base', 'metal-steel', 'metal'),
    P.color('smoothie', '내용물 색', 'Contents colour', '#d9506b'),
    P.bool('full', '내용물', 'Filled', true),
  ],
  tags: ['blender', 'smoothie maker', 'juicer', '블렌더', '믹서기', '스무디'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    taperBox(k, 'base', p.base, 0.17, 0.12, 0.17, 0.88, 0, 0, 0);
    k.cyl('knob', 'plastic-black', 0.022, 0.024, 0.016, 0, 0.055, 0.075, { rx: Math.PI / 2, segs: k.seg(16, 6) });
    k.cyl('knob', 'plastic-black', 0.06, 0.065, 0.03, 0, 0.12, 0, { segs: k.seg(20, 8) });
    taperBox(k, 'glass', 'glass-clear', 0.135, 0.22, 0.135, 0.7, 0, 0.15, 0);
    if (p.full) taperBox(k, 'food', 'plastic-white', 0.11, 0.1, 0.11, 0.86, 0, 0.155, 0, { o: { overrides: { color: p.smoothie } } });
    k.rbox('knob', 'plastic-black', 0.14, 0.022, 0.14, 0.008, 0, 0.381, 0);
    k.cyl('knob', 'plastic-black', 0.025, 0.025, 0.02, 0, 0.392, 0, { segs: k.seg(14, 6) });
    k.rbox('knob', 'plastic-black', 0.022, 0.16, 0.03, 0.009, 0.115, 0.26, 0);
    for (const y of [0.19, 0.33]) k.box('knob', 'plastic-black', 0.04, 0.022, 0.026, 0.09, y, 0, { r: 0.005 });
    return done(k);
  },
});

const riceCooker = make({
  id: 'kitchen-rice-cooker', ko: '전기밥솥', en: 'Rice cooker', placement: 'surface',
  params: [
    P.pick('cups', '용량', 'Capacity', '6', [['6', '6인용', '6 cups'], ['10', '10인용', '10 cups']]),
    P.color('color', '뚜껑 색', 'Lid colour', '#8f1d26'),
    P.mat('body', '몸체', 'Body', 'plastic-white', 'plastic'),
  ],
  tags: ['rice cooker', 'pressure cooker', 'korean kitchen', '전기밥솥', '밥솥', '압력밥솥'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.cups === '10' ? 1.13 : 1;
    const s = k.seg(36, 10);
    xform(k, () => {
      k.lathe('body', p.body, [[0, 0], [0.118, 0], [0.132, 0.012], [0.14, 0.05], [0.139, 0.15], [0.134, 0.168], [0, 0.168]], 0, 0, 0, { segs: s, smooth: 14 });
      k.add('chrome', 'metal-chrome', new THREE.TorusGeometry(0.135, 0.004, k.seg(6, 3), s).rotateX(Math.PI / 2).translate(0, 0.168, 0));
      k.lathe('lid', 'paint-white-gloss', [[0, 0.168], [0.132, 0.168], [0.13, 0.185], [0.105, 0.222], [0.06, 0.236], [0, 0.238]], 0, 0, 0, { segs: s, smooth: 12, overrides: { color: p.color } });
      k.cyl('chrome', 'metal-chrome', 0.018, 0.022, 0.02, -0.03, 0.228, -0.04, { segs: k.seg(14, 6) });
      k.rbox('body', p.body, 0.13, 0.03, 0.05, 0.012, 0, 0.245, -0.035);
      k.rbox('chrome', 'metal-chrome', 0.05, 0.022, 0.03, 0.008, 0, 0.19, 0.125);
      // control panel on the front
      k.rbox('panel', 'screen-black', 0.12, 0.07, 0.03, 0.01, 0, 0.1, 0.128);
      k.box('display', 'light-warm', 0.05, 0.016, 0.002, 0, 0.118, 0.1435, { r: 0, overrides: { color: '#9fd6ff' } });
      for (let i = 0; i < 4; i++) k.cyl('chrome', 'metal-chrome', 0.006, 0.006, 0.003, -0.036 + i * 0.024, 0.085, 0.142, { rx: Math.PI / 2, segs: k.seg(10, 5) });
    }, { s: S });
    return done(k);
  },
});

const airFryer = make({
  id: 'kitchen-air-fryer', ko: '에어프라이어', en: 'Air fryer', placement: 'surface',
  params: [
    P.mat('body', '몸체', 'Body', 'plastic-black', 'plastic'),
    P.mat('handleMat', '손잡이', 'Handle', 'metal-steel', 'metal'),
  ],
  tags: ['air fryer', 'fryer', '에어프라이어', '에어 프라이어', '튀김기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.soft('body', p.body, 0.27, 0.32, 0.33, 0.05, 0, 0.16 + 0.01, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.012, 0.012, 0.012, sx * 0.09, 0, sz * 0.11, { segs: k.seg(10, 5) });
    k.rbox('drawer', p.body, 0.24, 0.16, 0.03, 0.02, 0, 0.1, 0.165 + 0.002);
    k.box('drawer', 'screen-black', 0.2, 0.004, 0.02, 0, 0.183, 0.165, { r: 0.001 });
    addHandle(k, 'handle', p.handleMat, 'bar', 0, 0.12, 0.182, { len: 0.12 });
    k.rbox('panel', 'screen-black', 0.16, 0.006, 0.11, 0.02, 0, 0.332, 0.07);
    k.box('display', 'light-warm', 0.05, 0.002, 0.018, 0, 0.3355, 0.08, { r: 0, overrides: { color: '#ffb066' } });
    for (let i = 0; i < 6; i++) k.box('panel', 'screen-black', 0.16, 0.004, 0.004, 0, 0.32 - 0.004, -0.06 - i * 0.014, { r: 0 });
    return done(k);
  },
});

const scale = make({
  id: 'kitchen-scale', ko: '주방 저울', en: 'Kitchen scale', placement: 'surface',
  params: [
    P.mat('body', '몸체', 'Body', 'plastic-white', 'plastic'),
    P.bool('bowl', '계량 볼', 'Mixing bowl', true),
  ],
  tags: ['kitchen scale', 'digital scale', 'baking', '주방 저울', '전자 저울', '계량'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('body', p.body, 0.16, 0.016, 0.2, 0.008, 0, 0.008 + 0.002, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.006, 0.006, 0.003, sx * 0.06, 0, sz * 0.08, { segs: k.seg(8, 4) });
    k.rbox('glass', 'glass-tinted', 0.158, 0.004, 0.198, 0.002, 0, 0.0195, 0);
    k.box('screen', 'screen-black', 0.07, 0.001, 0.028, 0, 0.0218, 0.07, { r: 0 });
    for (const s of [-1, 1]) k.cyl('screen', 'metal-chrome', 0.006, 0.006, 0.001, s * 0.05, 0.0216, 0.07, { segs: k.seg(10, 5) });
    if (p.bowl) k.lathe('bowl', 'metal-steel', [[0, 0], [0.04, 0], [0.075, 0.03], [0.09, 0.075], [0.093, 0.08], [0.087, 0.08], [0.07, 0.034], [0.038, 0.004], [0, 0.004]], 0, 0.0217, -0.02, { segs: k.seg(28, 10) });
    return done(k);
  },
});

const breadBin = make({
  id: 'kitchen-bread-bin', ko: '롤탑 빵통', en: 'Roll-top bread bin', placement: 'surface',
  params: [
    P.len('width', '폭', 'Width', 0.4, 0.3, 0.5),
    P.mat('shell', '몸체', 'Shell', 'paint-white-matte', 'paint'),
    P.mat('ends', '옆판', 'End caps', 'wood-oak', 'wood'),
  ],
  tags: ['bread bin', 'bread box', '빵통', '브레드 박스', '빵 보관함'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, r = 0.12, hb = 0.06, et = 0.014, iw = w - 2 * et;
    k.box('shell', p.shell, iw, hb, 2 * r, 0, hb / 2, 0, { r: 0.002 });
    k.add('shell', p.shell, new THREE.CylinderGeometry(r, r, iw, k.seg(32, 10), 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, hb, 0));
    const R = r + 0.006;
    const end = new THREE.Shape();
    end.moveTo(-R, 0); end.lineTo(R, 0); end.lineTo(R, hb); end.absarc(0, hb, R, 0, Math.PI, false); end.lineTo(-R, 0);
    for (const s of [-1, 1]) k.panel('ends', p.ends, end, et, s * (w / 2 - et / 2), 0, 0, { ry: Math.PI / 2, bevel: 0.003, curveSegs: k.seg(24, 8) });
    for (let i = 0; i < 6; i++) {
      const a = 0.35 + i * 0.16;
      k.rod('shell', p.shell, [-iw / 2, hb + R * Math.sin(a) - 0.005, (R - 0.005) * Math.cos(a)], [iw / 2, hb + R * Math.sin(a) - 0.005, (R - 0.005) * Math.cos(a)], 0.0018, { segs: k.seg(6, 4) });
    }
    k.cyl('ends', p.ends, 0.012, 0.014, 0.015, 0, hb + r * Math.sin(0.55), r * Math.cos(0.55) - 0.002, { rx: Math.PI / 2 - 0.55, segs: k.seg(14, 6) });
    return done(k);
  },
});

const fruitBowl = make({
  id: 'kitchen-fruit-bowl', ko: '과일 바구니(과일 담음)', en: 'Fruit bowl with fruit', placement: 'surface',
  params: [
    P.mat('bowl', '그릇', 'Bowl', 'wood-walnut', 'wood'),
    P.bool('bananas', '바나나', 'Bananas', true),
  ],
  tags: ['fruit bowl', 'fruit', 'apples', '과일 그릇', '과일', '사과', '바나나'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('bowl', p.bowl, [[0, 0], [0.05, 0], [0.055, 0.01], [0.05, 0.016], [0.1, 0.042], [0.15, 0.09], [0.146, 0.094], [0.095, 0.047], [0.045, 0.024], [0, 0.022]], 0, 0, 0, { segs: k.seg(36, 10) });
    const fs = k.seg(16, 7), fr = k.seg(12, 5);
    const kinds = [['apple', '#b3242a'], ['orange', '#e88a1a'], ['apple', '#b3242a'], ['apple', '#8db33a'], ['orange', '#e88a1a']];
    kinds.forEach(([kind, col], i) => {
      const a = (i / 5) * Math.PI * 2 + 0.3, x = Math.cos(a) * 0.07, z = Math.sin(a) * 0.07;
      const r = kind === 'apple' ? 0.04 : 0.041;
      k.sphere('fruit-' + col, 'plastic-white', r, x, 0.079, z, { segs: fs, rings: fr, scale: kind === 'apple' ? [1, 0.9, 1] : [1, 0.97, 1], overrides: { color: col } });
      if (kind === 'apple') k.rod('stems', 'wood-dark', [x, 0.079 + r * 0.85, z], [x + 0.004, 0.079 + r * 0.85 + 0.014, z], 0.0018, { segs: 4 });
    });
    k.sphere('fruit-#e88a1a', 'plastic-white', 0.042, 0, 0.122, 0, { segs: fs, rings: fr, overrides: { color: '#e88a1a' } });
    if (p.bananas) {
      for (const dz of [-0.026, 0, 0.026]) {
        k.tube('banana', 'plastic-white', [[-0.14, 0.12, dz * 1.2], [-0.07, 0.165 + Math.abs(dz) * 0.3, dz], [0, 0.183 - Math.abs(dz) * 0.5, dz], [0.07, 0.165, dz], [0.135, 0.125, dz * 1.2]], 0.016, { radial: k.seg(10, 5), segs: k.seg(20, 8), caps: true, overrides: { color: '#e5c341' } });
      }
      k.rod('stems', 'wood-dark', [0.135, 0.125, 0], [0.155, 0.135, 0], 0.008, { segs: 5 });
    }
    return done(k);
  },
});

const boards = make({
  id: 'kitchen-cutting-boards', ko: '도마 세트(거치대)', en: 'Cutting boards in stand', placement: 'surface',
  params: [
    P.mat('wood1', '도마 1', 'Board 1', 'wood-oak', 'wood'),
    P.mat('wood2', '도마 2', 'Board 2', 'wood-walnut', 'wood'),
    P.mat('wood3', '도마 3', 'Board 3', 'wood-ash', 'wood'),
  ],
  tags: ['cutting board', 'chopping board', 'board stand', '도마', '도마 거치대', '나무 도마'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('stand', 'wood-dark', 0.3, 0.03, 0.12, 0.006, 0, 0.015, 0);
    const specs = [[p.wood1, 0.28, 0.4, -0.035], [p.wood2, 0.24, 0.33, 0], [p.wood3, 0.2, 0.26, 0.035]];
    for (const [mat, bw, bh, z] of specs) {
      const s = roundRectAt(-bw / 2, 0, bw, bh, 0.03);
      const hole = new THREE.Path();
      hole.absarc(0, bh - 0.035, 0.014, 0, Math.PI * 2, true);
      s.holes.push(hole);
      k.panel('board-' + mat, mat, s, 0.018, 0, 0.012, z, { bevel: 0.003, curveSegs: 12 });
    }
    return done(k);
  },
});

const knifeBlock = make({
  id: 'kitchen-knife-block', ko: '칼꽂이 블록', en: 'Knife block', placement: 'surface',
  params: [
    P.mat('wood', '블록', 'Block', 'wood-oak', 'wood'),
    P.mat('handleMat', '손잡이', 'Handles', 'plastic-black', 'plastic'),
  ],
  tags: ['knife block', 'knife set', 'knives', '칼꽂이', '칼 블록', '식칼 세트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.13;
    // side profile (z, y): back vertical, top sloping up to the front, front leaning back
    const prof = [[-0.08, 0], [0.085, 0], [0.01, 0.255], [-0.08, 0.17]];
    const s = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
    k.panel('block', p.wood, s, w, 0, 0, 0, { ry: Math.PI / 2, bevel: 0.006 });
    const A = new THREE.Vector2(-0.08, 0.17), B = new THREE.Vector2(0.01, 0.255);
    const n = new THREE.Vector3(0, B.x - A.x, -(B.y - A.y)).normalize(); // (y, z) normal of the top face
    const slots = [[-0.035, 0.3, 0.11], [0.0, 0.3, 0.1], [0.035, 0.3, 0.11], [-0.025, 0.7, 0.09], [0.025, 0.7, 0.095], [0, 0.55, 0.08]];
    for (const [x, t, L] of slots) {
      const zy = A.clone().lerp(B, t);
      const at = [x, zy.y, zy.x];
      along(k, 'handles', p.handleMat, new THREE.CylinderGeometry(0.011, 0.012, L, k.seg(10, 5)).translate(0, L / 2, 0), at, [0, n.y, n.z]);
      along(k, 'metal', 'metal-steel', new THREE.CylinderGeometry(0.0125, 0.0125, 0.008, k.seg(10, 5)).translate(0, 0.004, 0), at, [0, n.y, n.z]);
    }
    return done(k);
  },
});

const utensilPot = make({
  id: 'kitchen-utensil-holder', ko: '조리도구 꽂이', en: 'Utensil crock', placement: 'surface',
  params: [
    P.mat('crock', '통', 'Crock', 'ceramic-matte', 'ceramic'),
    P.mat('tools', '도구', 'Tools', 'wood-oak', 'wood'),
  ],
  tags: ['utensil holder', 'utensil crock', 'spatula', '조리도구 꽂이', '주걱', '국자 통'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.06, h = 0.16;
    k.lathe('crock', p.crock, [[0, 0], [r * 0.92, 0], [r, 0.008], [r, h], [r - 0.006, h], [r - 0.006, 0.012], [0, 0.012]], 0, 0, 0, { segs: k.seg(28, 10) });
    const tools = [
      ['spoon', [-0.015, 0.015], [-0.07, 0.34, -0.02]],
      ['spatula', [0.015, -0.01], [0.06, 0.35, -0.03]],
      ['ladle', [0, 0.02], [0.01, 0.37, 0.08]],
      ['whisk', [-0.01, -0.02], [-0.04, 0.32, -0.08]],
      ['turner', [0.02, 0.015], [0.08, 0.3, 0.05]],
    ];
    for (const [kind, [bx, bz], top] of tools) {
      const a = new THREE.Vector3(bx, 0.014, bz), b = new THREE.Vector3(...top);
      const dir = b.clone().sub(a).normalize();
      const metal = kind === 'ladle' || kind === 'whisk';
      const role = metal ? 'steel' : 'tools', mat = metal ? 'metal-steel' : kind === 'spatula' ? 'plastic-black' : p.tools;
      k.rod(role, mat, a.toArray(), b.toArray(), kind === 'whisk' ? 0.009 : 0.0055, { segs: k.seg(8, 4) });
      let g;
      if (kind === 'spoon') g = new THREE.SphereGeometry(0.025, k.seg(12, 6), k.seg(8, 4)).scale(1, 1.5, 0.3).translate(0, 0.03, 0);
      else if (kind === 'spatula') g = new THREE.BoxGeometry(0.06, 0.075, 0.004).translate(0, 0.035, 0);
      else if (kind === 'turner') g = new THREE.BoxGeometry(0.07, 0.08, 0.004).translate(0, 0.038, 0);
      else if (kind === 'ladle') g = new THREE.LatheGeometry(V2([[0, 0], [0.02, 0.002], [0.04, 0.016], [0.045, 0.032], [0.041, 0.032], [0.035, 0.018], [0.018, 0.006], [0, 0.005]]), k.seg(16, 6)).rotateX(Math.PI / 2).translate(0, 0.04, -0.016);
      else {
        const parts = [];
        for (let i = 0; i < 4; i++) parts.push(new THREE.TorusGeometry(0.026, 0.0012, k.seg(4, 3), k.seg(18, 8)).scale(1, 2.2, 1).rotateY((i * Math.PI) / 4).translate(0, 0.05, 0));
        for (const q of parts) along(k, role, mat, q, b.toArray(), dir.toArray());
        continue;
      }
      along(k, role, mat, g, b.toArray(), dir.toArray());
    }
    return done(k);
  },
});

const drainer = make({
  id: 'kitchen-dish-drainer', ko: '식기 건조대', en: 'Dish drainer rack', placement: 'surface',
  params: [
    P.mat('wire', '선반', 'Wire', 'metal-chrome', 'metal'),
    P.mat('tray', '받침', 'Drip tray', 'plastic-white', 'plastic'),
    P.int('plates', '접시 수', 'Plates', 5, 0, 8),
  ],
  tags: ['dish drainer', 'dish rack', 'drying rack', '식기 건조대', '그릇 건조대', '설거지 건조대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.46, d = 0.34, r = 0.003, ws = { segs: k.seg(6, 4) };
    k.rbox('tray', p.tray, w, 0.022, d, 0.008, 0, 0.011, 0);
    k.box('tray', p.tray, w - 0.06, 0.004, 0.035, 0, 0.021, d / 2 - 0.0, { r: 0.002, rx: -0.3 });
    const y1 = 0.032, y2 = 0.12, xs = w / 2 - 0.015, zs = d / 2 - 0.02;
    for (const y of [y1, y2]) {
      for (const s of [-1, 1]) {
        k.rod('wire', p.wire, [-xs, y, s * zs], [xs, y, s * zs], r, ws);
        k.rod('wire', p.wire, [s * xs, y, -zs], [s * xs, y, zs], r, ws);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('wire', p.wire, [sx * xs, 0.022, sz * zs], [sx * xs, y2, sz * zs], r, ws);
    for (let i = 0; i < 6; i++) k.rod('wire', p.wire, [-xs + 0.02 + i * 0.06, y1, -zs], [-xs + 0.02 + i * 0.06, y1, zs], r, ws);
    // plate tines (left part)
    const n = Math.min(p.plates, 8), pitch = 0.032;
    for (let i = 0; i <= Math.max(n, 5); i++) for (const z of [-0.075, 0.075]) k.rod('wire', p.wire, [-xs + 0.02 + i * pitch, y1, z], [-xs + 0.02 + i * pitch, y1 + 0.085, z], r, ws);
    for (let i = 0; i < n; i++) k.add('plates', 'ceramic-white', plateGeo(k, 0.11, 0.02).translate(0, -0.007, 0).rotateZ(Math.PI / 2 - 0.12).translate(-xs + 0.02 + (i + 0.5) * pitch, y1 + 0.111, 0));
    // cutlery basket (right front) with handles sticking up, mug upside down behind it
    const bx = xs - 0.06, bz = 0.07;
    for (const s of [-1, 1]) {
      k.box('basket', p.tray, 0.09, 0.11, 0.003, bx, y1 + 0.055, bz + s * 0.045, { r: 0 });
      k.box('basket', p.tray, 0.003, 0.11, 0.09, bx + s * 0.045, y1 + 0.055, bz, { r: 0 });
    }
    k.box('basket', p.tray, 0.09, 0.003, 0.09, bx, y1 + 0.003, bz, { r: 0 });
    for (let i = 0; i < 6; i++) {
      const x = bx - 0.03 + (i % 3) * 0.03, z = bz - 0.02 + Math.floor(i / 3) * 0.04;
      k.rod('cutlery', 'metal-steel', [x, y1 + 0.01, z], [x + 0.006 * ((i % 2) * 2 - 1), y1 + 0.17, z + 0.004], 0.0035, ws);
    }
    xform(k, () => mug(k, 'mug', 'ceramic-matte', 0.038, 0.09), { x: bx, y: y1 + 0.09 + r, z: -0.08, rx: Math.PI });
    return done(k);
  },
});

/* ------------------------------------------------------------------ cookware */

const pan = make({
  id: 'kitchen-frying-pan', ko: '프라이팬', en: 'Frying pan', placement: 'surface',
  params: [
    P.len('size', '지름', 'Diameter', 0.28, 0.2, 0.32),
    P.mat('body', '팬', 'Pan', 'metal-black', 'metal'),
    P.mat('grip', '손잡이', 'Handle', 'wood-dark', 'wood'),
  ],
  tags: ['frying pan', 'skillet', 'pan', '프라이팬', '후라이팬', '팬'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.size / 2;
    k.lathe('pan', p.body, [[0, 0], [R * 0.8, 0], [R * 0.85, 0.004], [R, 0.045], [R - 0.004, 0.047], [R * 0.84 - 0.004, 0.007], [0, 0.007]], 0, 0, 0, { segs: k.seg(36, 10) });
    k.rod('steel', 'metal-steel', [R - 0.012, 0.035, 0], [R + 0.06, 0.05, 0], 0.008, { segs: k.seg(10, 5) });
    k.rod('grip', p.grip, [R + 0.05, 0.048, 0], [R + 0.2, 0.068, 0], 0.013, { r2: 0.011, segs: k.seg(12, 6) });
    k.sphere('grip', p.grip, 0.011, R + 0.2, 0.068, 0, { segs: k.seg(10, 5), rings: k.seg(6, 4) });
    return done(k);
  },
});

const wok = make({
  id: 'kitchen-wok', ko: '웍(중식 팬)', en: 'Wok', placement: 'surface',
  params: [
    P.len('size', '지름', 'Diameter', 0.34, 0.28, 0.4),
    P.mat('body', '팬', 'Wok', 'metal-black', 'metal'),
    P.mat('grip', '손잡이', 'Handle', 'wood-oak', 'wood'),
  ],
  tags: ['wok', 'stir fry', 'chinese pan', '웍', '중식 팬', '볶음 팬'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.size / 2, f = R / 0.17;
    const prof = [[0, 0], [0.05, 0], [0.1, 0.012], [0.14, 0.04], [0.17, 0.09], [0.166, 0.092], [0.136, 0.044], [0.097, 0.017], [0.05, 0.006], [0, 0.006]].map(([r, y]) => [r * f, y * f]);
    k.lathe('pan', p.body, prof, 0, 0, 0, { segs: k.seg(36, 10) });
    k.rod('steel', 'metal-steel', [R - 0.01, 0.085 * f, 0], [R + 0.07, 0.1 * f, 0], 0.009, { segs: k.seg(10, 5) });
    k.rod('grip', p.grip, [R + 0.06, 0.098 * f, 0], [R + 0.26, 0.14 * f, 0], 0.016, { r2: 0.014, segs: k.seg(12, 6) });
    k.bentTube('steel', 'metal-steel', [[-R + 0.004, 0.085 * f, -0.03], [-R - 0.045, 0.087 * f, -0.03], [-R - 0.045, 0.087 * f, 0.03], [-R + 0.004, 0.085 * f, 0.03]], 0.005, 0.015, { radial: k.seg(8, 4) });
    return done(k);
  },
});

const stockPot = make({
  id: 'kitchen-stock-pot', ko: '곰솥(스톡팟)', en: 'Stock pot', placement: 'surface',
  params: [
    P.len('size', '지름', 'Diameter', 0.26, 0.18, 0.34),
    P.mat('body', '재질', 'Material', 'metal-steel', 'metal'),
    P.bool('glassLid', '유리 뚜껑', 'Glass lid', false),
  ],
  tags: ['stock pot', 'soup pot', 'pot', '곰솥', '냄비', '들통', '스톡팟'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.size / 2, h = R * 1.55, s = k.seg(36, 10);
    k.lathe('pot', p.body, [[0, 0], [R - 0.006, 0], [R, 0.006], [R, h], [R - 0.004, h], [R - 0.004, 0.008], [0, 0.008]], 0, 0, 0, { segs: s });
    k.lathe('pot', p.body, [[0, -0.001], [R * 0.85, -0.001], [R * 0.85, 0.004], [0, 0.004]], 0, 0.001, 0, { segs: s });
    const lm = p.glassLid ? 'glass-clear' : p.body;
    k.lathe('lid', lm, [[0, h + 0.001], [R + 0.004, h + 0.001], [R + 0.004, h + 0.008], [R * 0.6, h + 0.025], [0, h + 0.03]], 0, 0, 0, { segs: s, smooth: 10 });
    if (p.glassLid) k.add('pot', p.body, new THREE.TorusGeometry(R + 0.003, 0.003, k.seg(6, 3), s).rotateX(Math.PI / 2).translate(0, h + 0.006, 0));
    k.lathe('knob', 'plastic-black', [[0, 0], [0.012, 0], [0.01, 0.012], [0.02, 0.022], [0.018, 0.03], [0, 0.03]], 0, h + 0.028, 0, { segs: k.seg(14, 6) });
    for (const sx of [-1, 1]) k.bentTube('pot', p.body, [[sx * (R - 0.002), h - 0.035, -0.035], [sx * (R + 0.04), h - 0.03, -0.035], [sx * (R + 0.04), h - 0.03, 0.035], [sx * (R - 0.002), h - 0.035, 0.035]], 0.006, 0.015, { radial: k.seg(8, 4) });
    return done(k);
  },
});

const stoveKettle = make({
  id: 'kitchen-stovetop-kettle', ko: '가스레인지용 주전자(휘슬)', en: 'Whistling stovetop kettle', placement: 'surface',
  params: [
    P.mat('body', '몸체', 'Body', 'metal-chrome', 'metal'),
    P.mat('grip', '손잡이', 'Handle', 'plastic-black', 'plastic'),
  ],
  tags: ['stovetop kettle', 'whistling kettle', 'tea kettle', '주전자', '휘슬 주전자', '스텐 주전자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = k.seg(32, 10);
    k.lathe('body', p.body, [[0, 0], [0.095, 0], [0.105, 0.012], [0.108, 0.05], [0.1, 0.1], [0.075, 0.14], [0.045, 0.155], [0.04, 0.16], [0, 0.16]], 0, 0, 0, { segs: s, smooth: 16 });
    k.lathe('body', p.body, [[0, 0], [0.042, 0], [0.04, 0.008], [0.025, 0.014], [0, 0.016]], 0, 0.158, 0, { segs: k.seg(20, 8) });
    k.sphere('grip', p.grip, 0.012, 0, 0.18, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    k.tube('body', p.body, [[0, 0.05, 0.07], [0, 0.08, 0.12], [0, 0.13, 0.155], [0, 0.155, 0.17]], 0.013, { radial: k.seg(12, 6), segs: k.seg(16, 6) });
    k.cyl('grip', p.grip, 0.012, 0.015, 0.025, 0, 0.152, 0.168, { rx: 0.9, segs: k.seg(12, 5) });
    for (const z of [-0.07, 0.065]) k.rod('body', p.body, [0, 0.13, z], [0, 0.235, z * 0.75], 0.005, { segs: k.seg(8, 4) });
    k.rod('grip', p.grip, [0, 0.235, -0.06], [0, 0.235, 0.055], 0.014, { segs: k.seg(12, 6) });
    for (const z of [-0.06, 0.055]) k.sphere('grip', p.grip, 0.014, 0, 0.235, z, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    return done(k);
  },
});

/* --------------------------------------------------------- jars, bottles, misc */

const canisters = make({
  id: 'kitchen-canister-set', ko: '보관 용기 세트(캐니스터)', en: 'Canister set', placement: 'surface',
  params: [
    P.int('count', '개수', 'Count', 3, 2, 4),
    P.mat('body', '용기', 'Canisters', 'ceramic-white', 'ceramic'),
    P.mat('lid', '뚜껑', 'Lids', 'wood-oak', 'wood'),
  ],
  tags: ['canister', 'storage jar', 'sugar coffee tea', '캐니스터', '보관 용기', '밀폐 용기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sizes = [[0.065, 0.22], [0.06, 0.18], [0.055, 0.14], [0.05, 0.11]];
    let x = 0;
    const s = k.seg(28, 10);
    for (let i = 0; i < p.count; i++) {
      const [r, h] = sizes[i];
      const cx = x + r;
      k.lathe('body', p.body, [[0, 0], [r - 0.004, 0], [r, 0.005], [r, h - 0.02], [0, h - 0.02]], cx, 0, 0, { segs: s });
      k.cyl('seal', 'rubber-black', r - 0.002, r - 0.002, 0.004, cx, h - 0.02, 0, { segs: s });
      k.lathe('lid', p.lid, [[0, 0], [r + 0.002, 0], [r + 0.002, 0.012], [r * 0.95, 0.018], [0, 0.018]], cx, h - 0.016, 0, { segs: s });
      k.cyl('lid', p.lid, r * 0.25, r * 0.28, 0.012, cx, h + 0.002, 0, { segs: k.seg(14, 6) });
      x += 2 * r + 0.012;
    }
    return done(k);
  },
});

const cruets = make({
  id: 'kitchen-oil-vinegar-set', ko: '오일·식초병과 후추 그라인더', en: 'Oil, vinegar & mills tray', placement: 'surface',
  params: [
    P.mat('tray', '쟁반', 'Tray', 'wood-oak', 'wood'),
    P.mat('mills', '그라인더', 'Mills', 'wood-walnut', 'wood'),
  ],
  tags: ['oil bottle', 'vinegar', 'salt and pepper', 'cruet', '오일병', '식초병', '후추 그라인더', '소금'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('tray', p.tray, 0.3, 0.015, 0.12, 0.005, 0, 0.0075, 0);
    const s = k.seg(20, 8);
    const bottles = [[-0.1, '#b8901c'], [-0.035, '#4a1414']];
    for (const [x, col] of bottles) {
      k.lathe('glass', 'glass-clear', [[0, 0], [0.028, 0], [0.032, 0.008], [0.032, 0.15], [0.012, 0.2], [0.01, 0.23], [0, 0.23]], x, 0.015, 0, { segs: s, smooth: 10 });
      k.lathe('oil-' + col, 'paint-white-gloss', [[0, 0], [0.029, 0], [0.029, 0.12], [0, 0.12]], x, 0.018, 0, { segs: s, overrides: { color: col } });
      k.cyl('spouts', 'metal-steel', 0.011, 0.011, 0.02, x, 0.24, 0, { segs: k.seg(12, 5) });
      k.cyl('spouts', 'metal-steel', 0.003, 0.004, 0.035, x, 0.255, 0.003, { rx: 0.7, segs: k.seg(8, 4) });
    }
    for (const x of [0.04, 0.1]) {
      k.lathe('mills', p.mills, [[0, 0], [0.024, 0], [0.026, 0.01], [0.02, 0.06], [0.018, 0.1], [0.024, 0.13], [0.022, 0.15], [0, 0.155]], x, 0.015, 0, { segs: s, smooth: 12 });
      k.cyl('spouts', 'metal-steel', 0.006, 0.008, 0.012, x, 0.17, 0, { segs: k.seg(10, 5) });
    }
    return done(k);
  },
});

const towelHolder = make({
  id: 'kitchen-paper-towel-holder', ko: '키친타월 걸이', en: 'Paper towel holder', placement: 'surface',
  params: [
    P.mat('metal', '금속', 'Metal', 'metal-steel', 'metal'),
    P.bool('roll', '타월', 'Towel roll', true),
  ],
  tags: ['paper towel holder', 'kitchen roll', '키친타월 걸이', '키친타월', '휴지 걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = k.seg(32, 10);
    k.lathe('base', p.metal, [[0, 0], [0.078, 0], [0.08, 0.006], [0.07, 0.014], [0, 0.014]], 0, 0, 0, { segs: s });
    k.cyl('base', p.metal, 0.007, 0.007, 0.3, 0, 0.014, 0, { segs: k.seg(10, 5) });
    k.sphere('base', p.metal, 0.014, 0, 0.318, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    if (p.roll) {
      k.lathe('roll', 'paper', [[0.02, 0], [0.058, 0], [0.06, 0.004], [0.06, 0.236], [0.058, 0.24], [0.02, 0.24], [0.02, 0]], 0, 0.016, 0, { segs: s });
      k.add('roll', 'paper', new THREE.BoxGeometry(0.11, 0.004, 0.0025).translate(0.0, 0.12, 0).rotateY(0).translate(0, 0, 0.0605).scale(1, 1, 1));
    }
    return done(k);
  },
});

const soap = make({
  id: 'kitchen-soap-dispenser-sponge', ko: '주방 세제 디스펜서와 수세미', en: 'Soap dispenser & sponge', placement: 'surface',
  params: [
    P.mat('bottle', '디스펜서', 'Dispenser', 'ceramic-matte', 'ceramic'),
    P.color('sponge', '수세미 색', 'Sponge colour', '#e6c13a'),
  ],
  tags: ['soap dispenser', 'sponge', 'dish soap', '세제 디스펜서', '수세미', '주방 세제'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.rbox('tray', 'metal-steel', 0.2, 0.01, 0.1, 0.004, 0, 0.005, 0);
    const x = -0.05, s = k.seg(24, 8);
    k.lathe('bottle', p.bottle, [[0, 0], [0.034, 0], [0.037, 0.01], [0.037, 0.13], [0.03, 0.148], [0.012, 0.152], [0, 0.152]], x, 0.01, 0, { segs: s, smooth: 10 });
    k.cyl('pump', 'metal-chrome', 0.014, 0.015, 0.012, x, 0.16, 0, { segs: k.seg(14, 6) });
    k.cyl('pump', 'metal-chrome', 0.005, 0.005, 0.03, x, 0.172, 0, { segs: k.seg(8, 4) });
    k.rbox('pump', 'metal-chrome', 0.022, 0.012, 0.03, 0.004, x, 0.205, 0.006);
    k.rod('pump', 'metal-chrome', [x, 0.205, 0.02], [x, 0.198, 0.045], 0.0035, { segs: k.seg(8, 4) });
    k.soft('sponge', 'fabric-cotton-white', 0.09, 0.025, 0.06, 0.006, 0.05, 0.0225, 0, { overrides: { color: p.sponge }, puff: 0.002 });
    k.rbox('scrub', 'fabric-wool-charcoal', 0.09, 0.008, 0.06, 0.002, 0.05, 0.039, 0, { overrides: { color: '#3f7d3a' } });
    return done(k);
  },
});

/* ==================================================================== VARIANTS */

const B = Object.fromEntries(KITCHEN.map((e) => [e.id, e]));
const VARIANTS = [
  variant(B['kitchen-base-cabinet'], 'drawers', '서랍 하부장(3단)', 'Drawer base cabinet (3 drawers)', { fronts: 'drawers', handle: 'edge', front: 'paint-grey-matte' }, { tags: ['drawer cabinet', '서랍장', '서랍 하부장'] }),
  variant(B['kitchen-base-cabinet'], 'sink', '개수대 하부장', 'Sink base cabinet', { fronts: 'sink', width: 0.8, countertop: false }, { tags: ['sink cabinet', 'under-sink', '개수대장', '싱크 하부장'] }),
  variant(B['kitchen-wall-cabinet'], 'glass', '유리문 상부장', 'Glass-front wall cabinet', { glass: true, front: 'wood-oak', handle: 'knob' }, { tags: ['glass cabinet', 'display cabinet', '유리 상부장', '진열장'] }),
  variant(B['kitchen-wall-cabinet'], 'single', '외문 상부장(좁은)', 'Narrow single-door wall cabinet', { width: 0.4, doors: 1 }, { tags: ['narrow cabinet', '좁은 상부장', '외문'] }),
  variant(B['kitchen-tall-cabinet'], 'pantry', '팬트리 키큰장', 'Pantry tall cabinet', { style: 'pantry', front: 'paint-grey-matte' }, { tags: ['pantry', 'larder', '팬트리', '식료품장'] }),
  variant(B['kitchen-tall-cabinet'], 'fridge', '냉장고 빌트인장', 'Fridge housing tall cabinet', { style: 'fridge', width: 0.7, height: 2.3 }, { tags: ['integrated fridge', 'fridge housing', '빌트인 냉장고장', '냉장고장'] }),
  variant(B['kitchen-island'], 'oak', '오크 아일랜드(다리형)', 'Oak island with legs', { waterfall: false, front: 'wood-oak', top: 'granite-grey', handle: 'knob', width: 2.0 }, { tags: ['oak island', '오크 아일랜드', '원목 아일랜드'] }),
  variant(B['cooktop'], 'gas', '가스레인지(4구)', 'Gas hob (4 burners)', { type: 'gas', zones: 4, width: 0.75 }, { tags: ['gas hob', 'gas stove', '가스 쿡탑', '가스레인지'] }),
  variant(B['range-hood'], 'slim', '슬림 후드(상부장 하부형)', 'Slim under-cabinet hood', { style: 'slim', width: 0.6 }, { tags: ['slim hood', 'under cabinet hood', '슬림 후드', '하부장형 후드'] }),
  variant(B['kitchen-sink-counter'], 'long', '긴 싱크대(3 m)', 'Long sink counter (3 m)', { width: 3.0, sinkAt: 'left', handle: 'edge', front: 'paint-grey-matte' }, { tags: ['long counter', '일자형 싱크대', '긴 싱크대'] }),
  variant(kettle, 'copper', '구리색 전기 주전자', 'Copper electric kettle', { body: 'metal-copper', accent: 'wood-dark' }, { tags: ['copper', '구리'] }),
  variant(mixer, 'cream', '크림색 스탠드 믹서', 'Cream stand mixer', { color: '#efe6d2' }, { tags: ['cream', '크림'] }),
  variant(toaster, 'four', '4구 토스터', '4-slice toaster', { slots: '4', color: '#2b2b2e' }, { tags: ['4-slice', '4구'] }),
  variant(riceCooker, 'large', '10인용 전기밥솥', '10-cup rice cooker', { cups: '10', color: '#3a3a3e', body: 'metal-steel' }, { tags: ['10 cups', '10인용', '대용량'] }),
  variant(wineRack, 'large', '대형 와인 랙(36병)', 'Large wine rack (36 bottles)', { cols: 6, rows: 6, fill: 0.9, wood: 'wood-dark' }, { tags: ['large', '대형'] }),
];

export const ITEMS = [
  cornerBase, cornerWall, pullout, larder, endUnit, openShelves, floatShelf, plateRack, wineRack, wallWine, spiceRack,
  potRail, knifeStrip, trolley, barCounter, butcher, dresser, farmSink, doubleSink, islandHood, backsplash, stepStool,
  bins, pedalBin, kettle, toaster, espresso, dripCoffee, mixer, blender, riceCooker, airFryer, scale, breadBin,
  fruitBowl, boards, knifeBlock, utensilPot, drainer, pan, wok, stockPot, stoveKettle, canisters, cruets, towelHolder,
  soap, ...VARIANTS,
];
