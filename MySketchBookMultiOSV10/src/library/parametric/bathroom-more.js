// More bathroom items (designs + preset variants of bathroom.js entries). See ARCHITECTURE.md §12 → Library objects.
// Sanitary ware is lathed (round) or "squircle-lathed" (sqLathe: the same profile swept around a
// superellipse) so it reads as smooth glazed ceramic; basins sunk into tops use a holed slab + an
// inner bowl whose rim matches the hole exactly.
import { THREE, Kit, item, P, OPT, T, variant, addCabinet, addHandle, roundRect, ellipse, superEllipse, frameShape, gridGeo, shellGeo } from './helpers.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { finish, addFaucet } from './kitchen.js';
import { ITEMS as BASE, towel } from './bathroom.js';

const SAN = 'ceramic-white';
const FIN = [['metal-chrome', '크롬', 'Chrome'], ['metal-black', '블랙', 'Matte black'], ['metal-brass', '브라스', 'Brass'], ['metal-steel', '스테인리스', 'Brushed steel']];
const PI = Math.PI;

/* ----------------------------------------------------------------- helpers */

/** A shape's outline as a hole path (reversed), moved by (dx, dz) in plan. */
function holePath(shape, n = 48, dx = 0, dz = 0, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return new THREE.Path(shape.getPoints(n).reverse().map((v) => new THREE.Vector2(v.x * c + v.y * s + dx, -v.x * s + v.y * c + dz)));
}

const outline = (w, d, n = 2) => (n === 2 ? ellipse(w, d) : superEllipse(w, d, n, 64));

/**
 * Lathe swept around a superellipse instead of a circle: profile [[r, y], …] with r in units of
 * the half sizes sx (x) and sz (z); n = 2 is an ellipse, 3–5 a soft rectangle. Normals as LatheGeometry.
 */
function sqLathe(k, role, mat, profile, x, y, z, o = {}) {
  let pts = profile.map(([r, py]) => new THREE.Vector2(Math.max(0, r), py));
  if (o.smooth) pts = new THREE.SplineCurve(pts).getSpacedPoints(k.seg(o.smooth, 6));
  const ex = 2 / (o.n ?? 4), sx = o.sx ?? 1, sz = o.sz ?? 1;
  const g = gridGeo(o.segs ?? k.seg(56, 14), pts.length - 1, (u, v) => {
    const p = pts[Math.round(v * (pts.length - 1))];
    const t = u * PI * 2, c = Math.cos(t), s = Math.sin(t);
    return [p.x * sx * Math.sign(c) * Math.abs(c) ** ex, p.y, p.x * sz * Math.sign(s) * Math.abs(s) ** ex];
  });
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-5);
  m.computeVertexNormals();
  return k.add(role, mat, T(m, x, y, z, 0, o.ry ?? 0, 0), o);
}

/**
 * Basins sunk into a block or top: `shapeFn()` = plan outline (fresh Shape), the block runs
 * y0 … y0 + T with one hole per bowl; each bowl { x, z, w, d, n, depth, ry } is an inner surface
 * whose rim is the hole. `plate` closes the underside of a tall block.
 */
function sunkBasin(k, role, mat, shapeFn, { y0, T: th, bowls, plate = false, bevel = 0.006, drain = 'metal-chrome' }) {
  const s = shapeFn();
  const top = y0 + th;
  for (const b of bowls) s.holes.push(holePath(outline(b.w, b.d, b.n ?? 2), 64, b.x, b.z, b.ry ?? 0));
  k.slab(role, mat, s, th, y0, { bevel, curveSegs: 24 });
  if (plate) k.slab(role, mat, shapeFn(), 0.02, y0 + 0.001, { bevel: 0.004, curveSegs: 24 });
  for (const b of bowls) {
    const dp = b.depth;
    sqLathe(k, role, b.mat ?? mat, [[1, top - 0.0005], [0.985, top - 0.025], [0.93, top - dp * 0.45], [0.75, top - dp * 0.85], [0.4, top - dp * 0.99], [0, top - dp]], b.x, 0, b.z, { n: b.n ?? 2, sx: b.w / 2, sz: b.d / 2, ry: b.ry ?? 0, smooth: 18, segs: k.seg(48, 12) });
    if (drain) k.cyl('waste', drain, 0.02, 0.02, 0.003, b.x, top - dp - 0.001, b.z, { segs: k.seg(16, 6) });
  }
  return top;
}

/**
 * Open-topped sink section of a vanity (sides, back, fixed false fronts), y0 … y0 + h, front at
 * z + d/2: the carcass top of a full cabinet would cover a bowl that hangs below the top.
 */
function hollowTop(k, { w, h, d, x = 0, y0, z = 0, body, front, cols = 1, handle = 'none', handleMat = 'metal-steel', ft = 0.019, gap = 0.003 }) {
  const cd = d - ft, cz = z - ft / 2;
  for (const s of [-1, 1]) k.box('body', body, 0.018, h, cd, x + s * (w / 2 - 0.009), y0 + h / 2, cz, { r: 0.0015 });
  k.box('body', body, w - 0.036, h, 0.018, x, y0 + h / 2, cz - cd / 2 + 0.009, { r: 0.0015 });
  const cw = w / cols, zf = z + d / 2;
  for (let c = 0; c < cols; c++) {
    const cx = x - w / 2 + cw * (c + 0.5), fh = h - gap;
    k.box('fronts', front, cw - gap, fh, ft, cx, y0 + h / 2, zf - ft / 2, { r: 0.0025 });
    addHandle(k, 'handles', handleMat, handle, cx, handle === 'edge' ? y0 + h / 2 + fh / 2 - 0.008 : y0 + h / 2, zf, { len: Math.min(0.32, Math.max(0.1, (cw - gap) * 0.4)) });
  }
}

/** Toilet seat ring + closed lid (soft-close white plastic) and two hinges, n = outline exponent. */
function seatLid(k, { z, y, w, d, n = 2, mat = 'plastic-white', hinge = 'metal-chrome' }) {
  const ring = outline(w, d, n);
  ring.holes.push(holePath(outline(w - 0.125, d - 0.16, n), 48, 0, 0.012));
  k.slab('seat', mat, ring, 0.022, y, { bevel: 0.008, curveSegs: 40, z });
  k.slab('seat', mat, outline(w - 0.01, d - 0.01, n), 0.022, y + 0.022, { bevel: 0.01, curveSegs: 40, z: z + 0.004 });
  for (const s of [-1, 1]) k.cyl('hinge', hinge, 0.012, 0.012, 0.03, s * 0.08 - 0.015, y + 0.022, z - d / 2 + 0.025, { rz: -PI / 2, segs: k.seg(12, 6) });
}

/** Cross-head tap handle on a deck at (x, y, z). */
function crossHandle(k, mat, x, y, z) {
  k.cyl('faucet', mat, 0.022, 0.025, 0.018, x, y, z, { segs: k.seg(16, 6) });
  k.cyl('faucet', mat, 0.009, 0.013, 0.04, x, y + 0.018, z, { segs: k.seg(12, 5) });
  k.rod('faucet', mat, [x - 0.032, y + 0.058, z], [x + 0.032, y + 0.058, z], 0.0055, { segs: k.seg(10, 5) });
  k.rod('faucet', mat, [x, y + 0.058, z - 0.032], [x, y + 0.058, z + 0.032], 0.0055, { segs: k.seg(10, 5) });
  k.sphere('faucet', mat, 0.011, x, y + 0.06, z, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
}

/** Chrome bottle trap under a wall basin: tail from (x, yTop, z) down, trap, outlet back to the wall at zWall. */
function bottleTrap(k, mat, x, yTop, z, zWall) {
  k.rod('trap', mat, [x, yTop, z], [x, 0.13, z], 0.016, { segs: k.seg(14, 6) });
  k.lathe('trap', mat, [[0, 0], [0.03, 0], [0.034, 0.008], [0.034, 0.12], [0.026, 0.14], [0, 0.142]], x, 0, z, { segs: k.seg(20, 8) });
  k.rod('trap', mat, [x, 0.095, z], [x, 0.095, zWall + 0.012], 0.016, { segs: k.seg(14, 6) });
  k.cyl('trap', mat, 0.035, 0.035, 0.012, x, 0.095, zWall, { rx: PI / 2, segs: k.seg(20, 8) });
}

/** Wall spout from the wall plane zWall: arm forward, nose turned down; lever above it. */
function wallSpout(k, mat, x, y, zWall, reach = 0.16) {
  k.cyl('faucet', mat, 0.03, 0.03, 0.01, x, y, zWall, { rx: PI / 2, segs: k.seg(20, 8) });
  k.tube('faucet', mat, [[x, y, zWall + 0.005], [x, y, zWall + reach * 0.7], [x, y - 0.012, zWall + reach * 0.95], [x, y - 0.035, zWall + reach]], 0.012, { segs: k.seg(20, 6), radial: k.seg(14, 6), caps: true });
  k.cyl('faucet', mat, 0.022, 0.022, 0.012, x, y + 0.1, zWall, { rx: PI / 2, segs: k.seg(16, 6) });
  k.rod('faucet', mat, [x, y + 0.1, zWall + 0.01], [x, y + 0.1, zWall + 0.07], 0.006, { segs: k.seg(10, 5) });
}

/** Simple bottle (lathe): shampoo / dispenser; r radius, h height. */
function bottle(k, role, mat, x, y, z, r, h, { pump = null, cap = 'plastic-white' } = {}) {
  k.lathe(role, mat, [[0, 0], [r * 0.9, 0], [r, r * 0.25], [r, h * 0.78], [r * 0.85, h * 0.9], [r * 0.38, h * 0.95], [r * 0.38, h], [0, h]], x, y, z, { smooth: 14, segs: k.seg(20, 8) });
  if (pump) {
    k.cyl('pump', pump, r * 0.3, r * 0.3, 0.03, x, y + h, z, { segs: k.seg(12, 5) });
    k.box('pump', pump, 0.022, 0.012, 0.03, x, y + h + 0.036, z + 0.005, { r: 0.003 });
    k.rod('pump', pump, [x, y + h + 0.036, z + 0.02], [x, y + h + 0.032, z + 0.045], 0.004, { segs: k.seg(8, 4) });
  } else k.cyl('cap', cap, r * 0.45, r * 0.45, 0.025, x, y + h, z, { segs: k.seg(14, 6) });
}

/** Arched (round-top) outline w × h centred at the origin in x / y. */
function archShape(w, h) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, -h / 2); s.lineTo(r, -h / 2); s.lineTo(r, h / 2 - r);
  s.absarc(0, h / 2 - r, r, 0, PI, false);
  s.lineTo(-r, -h / 2);
  return s;
}

/** Hanging cloth (towel on a hook): gathered at the top (x, y, z), widening to w over length len. */
function hangingCloth(k, role, mat, x, y, z, w, len, seed = 1) {
  const fn = (u, v) => {
    const spread = 0.18 + 0.82 * Math.min(1, v * 2.2) ** 0.7;
    const X = x + (u - 0.5) * w * spread;
    const Y = y - v * len;
    const Z = z + 0.012 * Math.sin(u * PI * (5 + seed)) * Math.min(1, v * 3) + 0.01 * Math.sin(u * PI);
    return [X, Y, Z];
  };
  k.add(role, mat, shellGeo(k.seg(20, 6), k.seg(16, 6), fn, 0.008));
}

/* ----------------------------------------------------------------- toilets */

const PEDESTAL = (seatY) => [[0, 0], [0.115, 0], [0.12, 0.012], [0.118, 0.06], [0.122, 0.16], [0.145, 0.27], [0.168, 0.34], [0.178, seatY - 0.02], [0.175, seatY - 0.005], [0.158, seatY - 0.004], [0.14, seatY - 0.03], [0.09, seatY - 0.15], [0.05, seatY - 0.2], [0, seatY - 0.2]];

const closeCoupled = item({
  id: 'bath-toilet-close-coupled', category: 'bathroom', ko: '투피스 양변기', en: 'Close-coupled toilet', size: [0.41, 0.79, 0.74],
  params: [
    P.bool('bidetSeat', '비데 시트', 'Bidet seat', false),
    P.pick('finish', '버튼 마감', 'Button finish', 'metal-chrome', FIN),
  ],
  tags: ['toilet', 'close-coupled', 'two-piece toilet', 'wc', '변기', '투피스 변기', '양변기', '수조'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const seatY = 0.4, sz = 1.45, backZ = -0.3, cd = 0.17, cFront = backZ + cd;
    const house = p.bidetSeat ? 0.12 : 0;
    const sw = 0.36, sd = sw * sz + 0.02;
    const bowlZ = cFront + house + 0.012 + sd / 2;
    k.lathe('ceramic', SAN, PEDESTAL(seatY), 0, 0, bowlZ, { smooth: 30, segs: k.seg(40, 12), scale: [1, 1, sz] });
    // trapway / deck joining the bowl to the cistern (its front stays inside the rim)
    const deckTop = seatY - 0.012, deckFront = bowlZ - 0.215, deckBack = backZ + 0.015;
    k.soft('ceramic', SAN, 0.28, deckTop, deckFront - deckBack, 0.05, 0, deckTop / 2, (deckFront + deckBack) / 2, { flat: 3 });
    // cistern + lid + push button
    const cH = 0.37, cy = deckTop - 0.002;
    k.soft('ceramic', SAN, 0.4, cH, cd, 0.03, 0, cy + cH / 2, backZ + cd / 2, { flat: 3 });
    k.soft('ceramic', SAN, 0.414, 0.035, cd + 0.012, 0.012, 0, cy + cH + 0.0165, backZ + cd / 2, { flat: 2 });
    k.cyl('flush', p.finish, 0.024, 0.024, 0.006, 0, cy + cH + 0.032, backZ + cd / 2, { segs: k.seg(20, 8) });
    if (p.bidetSeat) {
      // Korean-style electronic bidet seat: rear housing + side control arm with buttons
      k.soft('bidet', 'plastic-white', 0.44, 0.1, house + 0.02, 0.03, 0, seatY + 0.05, cFront + house / 2, { flat: 2 });
      k.soft('bidet', 'plastic-white', 0.05, 0.05, 0.24, 0.016, 0.245, seatY + 0.048, cFront + house + 0.08, { flat: 2 });
      for (let i = 0; i < 4; i++) k.cyl('buttons', 'plastic-grey', 0.007, 0.007, 0.004, 0.245, seatY + 0.072, cFront + house + i * 0.04 + 0.01, { segs: k.seg(10, 5) });
    }
    seatLid(k, { z: bowlZ + 0.01, y: seatY, w: sw, d: sd });
    return finish(k);
  },
});

const wallHungSquare = item({
  id: 'bath-toilet-wall-hung-square', category: 'bathroom', ko: '벽걸이 변기(스퀘어)', en: 'Square wall-hung toilet', placement: 'wall', elevation: 0.08, size: [0.36, 0.94, 0.57],
  params: [
    P.bool('plate', '플러시 버튼', 'Flush plate', true),
    P.pick('finish', '플러시 마감', 'Flush plate finish', 'metal-chrome', FIN),
  ],
  tags: ['toilet', 'wall-hung toilet', 'rimless', 'concealed cistern', '변기', '벽걸이 변기', '매립 수조', '스퀘어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sz = 1.4, R = 0.18, n = 3.6, top = 0.34;
    const bowlZ = 0.06 + R * sz;
    sqLathe(k, 'ceramic', SAN, [[0, 0.03], [0.55, 0], [0.78, 0.03], [0.92, 0.12], [0.99, 0.25], [1, top - 0.012], [0.985, top - 0.002], [0.9, top - 0.001], [0.82, top - 0.025], [0.55, top - 0.15], [0.3, top - 0.2], [0, top - 0.205]], 0, 0, bowlZ, { n, sx: R, sz: R * sz, smooth: 30 });
    // wall bracket body behind the bowl
    k.soft('ceramic', SAN, 0.3, 0.2, 0.08, 0.035, 0, top - 0.13, 0.04, { flat: 3 });
    seatLid(k, { z: bowlZ + 0.004, y: top + 0.002, w: 2 * R, d: 2 * R * sz, n });
    if (p.plate) {
      const py = top + 0.52;
      k.box('flush', p.finish, 0.25, 0.165, 0.01, 0, py, 0.005, { r: 0.004 });
      k.box('button', p.finish === 'metal-chrome' ? 'metal-steel' : 'metal-chrome', 0.07, 0.11, 0.004, -0.045, py, 0.011, { r: 0.002 });
      k.box('button', p.finish === 'metal-chrome' ? 'metal-steel' : 'metal-chrome', 0.11, 0.11, 0.004, 0.04, py, 0.011, { r: 0.002 });
    }
    return finish(k);
  },
});

const smartToilet = item({
  id: 'bath-toilet-smart', category: 'bathroom', ko: '스마트 일체형 비데 변기', en: 'Smart toilet (integrated bidet)', size: [0.43, 0.51, 0.71],
  params: [P.mat('cover', '커버', 'Cover', 'plastic-white', 'plastic')],
  tags: ['smart toilet', 'bidet toilet', 'tankless', 'wc', '스마트 변기', '비데 일체형', '비데', '변기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sz = 1.5, backZ = -0.33, hd = 0.2;
    const bowlZ = backZ + hd + 0.245;
    k.lathe('ceramic', SAN, [[0, 0], [0.165, 0], [0.178, 0.008], [0.186, 0.03], [0.19, 0.2], [0.192, 0.33], [0.186, 0.372], [0.176, 0.385], [0.16, 0.386], [0.145, 0.36], [0.095, 0.25], [0.05, 0.2], [0, 0.2]], 0, 0, bowlZ, { smooth: 30, segs: k.seg(44, 12), scale: [1, 1, sz] });
    // low rear housing (no tank) with the electronics cover on top
    k.soft('ceramic', SAN, 0.42, 0.46, hd + 0.04, 0.09, 0, 0.23, backZ + (hd + 0.04) / 2, { flat: 3 });
    k.soft('cover', p.cover, 0.38, 0.05, hd - 0.01, 0.022, 0, 0.465, backZ + hd / 2 + 0.01, { flat: 2 });
    seatLid(k, { z: bowlZ + 0.012, y: 0.388, w: 0.37, d: 0.37 * sz, mat: p.cover, hinge: p.cover });
    // side knob + status light strip
    k.cyl('knob', 'metal-chrome', 0.022, 0.022, 0.02, 0.205, 0.36, backZ + hd * 0.65, { rz: -PI / 2, segs: k.seg(20, 8) });
    k.box('knob', 'metal-chrome', 0.004, 0.01, 0.09, 0.212, 0.3, backZ + hd * 0.65, { r: 0.002 });
    return finish(k);
  },
});

const bidet = item({
  id: 'bath-bidet', category: 'bathroom', ko: '비데(좌욕기)', en: 'Bidet', size: [0.36, 0.56, 0.6],
  params: [P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN)],
  tags: ['bidet', 'sanitary', 'floor bidet', '비데', '좌욕기', '위생도기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sz = 1.4, backZ = -0.28;
    const bowlZ = backZ + 0.14 + 0.222;
    k.lathe('ceramic', SAN, [[0, 0], [0.12, 0], [0.125, 0.012], [0.12, 0.08], [0.13, 0.2], [0.16, 0.3], [0.175, 0.37], [0.178, 0.392], [0.172, 0.4], [0.158, 0.4], [0.148, 0.38], [0.12, 0.3], [0.07, 0.255], [0, 0.25]], 0, 0, bowlZ, { smooth: 30, segs: k.seg(40, 12), scale: [1, 1, sz] });
    const deckFront = bowlZ - 0.222;
    k.soft('ceramic', SAN, 0.3, 0.4, deckFront - backZ, 0.05, 0, 0.2, (deckFront + backZ) / 2, { flat: 3 });
    addFaucet(k, 0, 0.4, backZ + 0.07, { reach: 0.12, height: 0.14, mat: p.finish });
    k.cyl('waste', 'metal-chrome', 0.02, 0.02, 0.003, 0, 0.25, bowlZ, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const urinal = item({
  id: 'bath-urinal', category: 'bathroom', ko: '소변기', en: 'Urinal', placement: 'wall', elevation: 0.45, size: [0.36, 0.99, 0.24],
  params: [P.pick('finish', '플러시 밸브', 'Flush valve', 'metal-chrome', FIN)],
  tags: ['urinal', 'wall urinal', 'sanitary', '소변기', '벽걸이 소변기', '위생도기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 0.66, A = 0.18, B = 0.33;
    const bump = (t) => (t >= 1 ? 0 : (1 - t * t) ** 2);
    const half = (v) => { const s = Math.max(0, Math.sin(PI * v)); return [A * s ** 0.45, B * s ** 0.55 * (1.05 - 0.15 * v)]; };
    // half-egg body against the wall with a deep scoop in the front
    const g = gridGeo(k.seg(36, 12), k.seg(44, 14), (u, v) => {
      const phi = PI / 2 - u * PI;
      const [a, b] = half(v);
      const G = bump(Math.abs(phi) / 1.05) * bump(Math.abs(v - 0.47) / 0.34);
      return [a * Math.sin(phi), v * H, b * Math.cos(phi) * (1 - 0.72 * G)];
    });
    k.add('ceramic', SAN, g);
    const back = new THREE.Shape();
    const N = 24;
    for (let i = 0; i <= N; i++) { const v = i / N; const [a] = half(v); if (i === 0) back.moveTo(a, v * H); else back.lineTo(a, v * H); }
    for (let i = N; i >= 0; i--) { const v = i / N; const [a] = half(v); back.lineTo(-a, v * H); }
    k.panel('ceramic', SAN, back, 0.01, 0, 0, 0.005, { bevel: 0.001 });
    // exposed flush valve
    const f = p.finish;
    k.tube('valve', f, [[0, H * 0.97, 0.05], [0, H + 0.2, 0.05], [0, H + 0.27, 0.045], [0, H + 0.3, 0.02], [0, H + 0.3, 0.0]], 0.012, { segs: k.seg(24, 8), radial: k.seg(12, 6) });
    k.lathe('valve', f, [[0, 0], [0.03, 0], [0.03, 0.08], [0.02, 0.1], [0, 0.1]], 0, H + 0.12, 0.05, { segs: k.seg(20, 8) });
    k.cyl('valve', f, 0.016, 0.016, 0.03, 0, H + 0.19, 0.05, { rx: PI / 2, segs: k.seg(14, 6) });
    k.cyl('valve', f, 0.03, 0.03, 0.01, 0, H + 0.3, 0, { rx: PI / 2, segs: k.seg(16, 6) });
    return finish(k);
  },
});

/* ---------------------------------------------------------------- basins */

const pedestalBasin = item({
  id: 'bath-pedestal-basin', category: 'bathroom', ko: '긴다리 세면대(페데스탈)', en: 'Pedestal basin', size: [0.56, 1.06, 0.46],
  params: [
    P.len('width', '폭', 'Width', 0.56, 0.45, 0.7),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN),
  ],
  tags: ['pedestal basin', 'washbasin', 'sink', '세면대', '긴다리 세면대', '페데스탈', '세면기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = W * 0.82, n = 2.4, y0 = 0.81;
    const hw = W * 0.74, hd = D * 0.62, hz = 0.03;
    sunkBasin(k, 'basin', SAN, () => outline(W, D, n), { y0, T: 0.04, bowls: [{ x: 0, z: hz, w: hw, d: hd, n: 2, depth: 0.15 }], bevel: 0.012 });
    // rounded belly under the deck
    sqLathe(k, 'basin', SAN, [[0, 0.68], [0.45, 0.68], [0.7, 0.71], [0.88, 0.76], [0.97, 0.8], [1, 0.814]], 0, 0, 0, { n, sx: W / 2, sz: D / 2, smooth: 12 });
    k.lathe('basin', SAN, [[0, 0], [0.1, 0], [0.105, 0.012], [0.095, 0.05], [0.08, 0.25], [0.078, 0.45], [0.09, 0.6], [0.12, 0.69], [0, 0.7]], 0, 0, -0.03, { smooth: 20, segs: k.seg(36, 10), scale: [1, 1, 0.8] });
    addFaucet(k, 0, y0 + 0.04, hz - hd / 2 - 0.045, { reach: 0.11, height: 0.17, mat: p.finish });
    return finish(k);
  },
});

const wallBasin = item({
  id: 'bath-wall-basin', category: 'bathroom', ko: '벽걸이 세면대', en: 'Wall-hung basin', placement: 'wall', elevation: 0.4, size: [0.5, 0.64, 0.4],
  params: [
    P.len('width', '폭', 'Width', 0.5, 0.4, 0.8),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN),
  ],
  tags: ['wall-hung basin', 'washbasin', 'cloakroom basin', '세면대', '벽걸이 세면대', '세면기', '배수 트랩'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.4, n = 4.5, y0 = 0.42, cz = 0;
    const hw = W - 0.12, hd = 0.26, hz = 0.04;
    sunkBasin(k, 'basin', SAN, () => outline(W, D, n), { y0, T: 0.04, bowls: [{ x: 0, z: cz + hz, w: hw, d: hd, n: 3.5, depth: 0.13 }].map((b) => ({ ...b })), bevel: 0.01 });
    sqLathe(k, 'basin', SAN, [[0, 0.31], [0.5, 0.31], [0.75, 0.33], [0.92, 0.37], [0.99, 0.41], [1, 0.424]], 0, 0, cz, { n, sx: W / 2, sz: D / 2, smooth: 12 });
    bottleTrap(k, p.finish, 0, 0.32, 0.02, -D / 2);
    addFaucet(k, 0, y0 + 0.04, cz + hz - hd / 2 - 0.04, { reach: 0.1, height: 0.16, mat: p.finish });
    return finish(k);
  },
});

const floatingVanity = item({
  id: 'bath-floating-vanity', category: 'bathroom', ko: '벽걸이 욕실장 세면대', en: 'Floating vanity', placement: 'wall', elevation: 0.43, size: [0.81, 0.65, 0.48],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.6, 1.6),
    P.int('basins', '세면기 수', 'Basins', 1, 1, 2),
    P.int('drawers', '서랍 단', 'Drawer rows', 2, 2, 3),
    P.mat('front', '도어', 'Fronts', 'wood-oak', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN),
  ],
  tags: ['floating vanity', 'wall-hung vanity', 'washbasin', '세면대', '욕실장', '벽걸이 하부장', '서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, h = 0.42, hollow = 0.18;
    const cols = w > 1.0 ? 2 : 1, hm = p.finish === 'metal-chrome' ? 'metal-steel' : p.finish;
    const nLow = p.drawers - 1;
    addCabinet(k, { w, h: h - hollow, d, rows: Array.from({ length: nLow }, () => ({ h: 1 / nLow, n: cols, type: 'drawer' })), body: p.front, front: p.front, handle: p.handle, handleMat: hm, base: 'none' });
    hollowTop(k, { w, h: hollow, d, y0: h - hollow, body: p.front, front: p.front, cols, handle: p.handle, handleMat: hm });
    const nb = w < 1.1 ? 1 : p.basins;
    const xs = nb === 1 ? [0] : [-w / 4, w / 4];
    const bw = Math.min(0.46, w * 0.62 / nb);
    const top = sunkBasin(k, 'top', SAN, () => roundRect(w + 0.01, d + 0.02, 0.008), { y0: h, T: 0.035, bowls: xs.map((x) => ({ x, z: 0.035, w: bw, d: 0.3, n: 2.6, depth: 0.14 })) });
    for (const x of xs) addFaucet(k, x, top, -0.15, { reach: 0.12, height: 0.18, mat: p.finish });
    return finish(k);
  },
});

const classicVanity = item({
  id: 'bath-double-vanity-classic', category: 'bathroom', ko: '클래식 이중 세면대', en: 'Classic double vanity', size: [1.53, 1.03, 0.6],
  params: [
    P.len('width', '폭', 'Width', 1.5, 1.2, 1.8),
    P.mat('front', '도장', 'Cabinet', 'paint-grey-matte', 'paint'),
    P.mat('top', '상판', 'Top', 'marble-white', 'stone'),
    P.pick('finish', '수전·손잡이', 'Taps & knobs', 'metal-brass', FIN),
  ],
  tags: ['double vanity', 'twin basin', 'classic vanity', 'washbasin', '이중 세면대', '세면대', '욕실장', '클래식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.54, legH = 0.12, ch = 0.7;
    const sideW = w * 0.32, midW = w - 2 * sideW;
    const common = { h: ch, d, y0: legH, body: p.front, front: p.front, handle: 'knob', handleMat: p.finish, base: 'none' };
    // side bays: doors below, a hollow sink section with a fixed false front above (room for the bowls)
    const hollow = 0.18;
    for (const s of [-1, 1]) {
      addCabinet(k, { ...common, h: ch - hollow, w: sideW, x: s * (w / 2 - sideW / 2), rows: [{ h: 1, n: 1, type: 'door', hinge: s < 0 ? 'left' : 'right' }] });
      hollowTop(k, { w: sideW, h: hollow, d, x: s * (w / 2 - sideW / 2), y0: legH + ch - hollow, body: p.front, front: p.front, handle: 'none' });
    }
    addCabinet(k, { ...common, w: midW, x: 0, rows: [{ h: 0.36, n: 1, type: 'drawer' }, { h: 0.33, n: 1, type: 'drawer' }, { h: 0.31, n: 1, type: 'drawer' }] });
    // turned feet + plinth rail
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.lathe('legs', p.front, [[0, 0], [0.022, 0], [0.027, 0.02], [0.018, 0.05], [0.03, 0.09], [0.033, 0.122], [0, 0.122]], sx * (w / 2 - 0.035), 0, sz * (d / 2 - 0.035) - 0.005, { smooth: 14, segs: k.seg(16, 6) });
    k.box('body', p.front, w - 0.08, 0.04, 0.02, 0, legH + 0.02 - 0.03, d / 2 - 0.03, { r: 0.004 });
    const yTop = legH + ch;
    const bx = w / 2 - sideW / 2;
    const top = sunkBasin(k, 'top', p.top, () => roundRect(w + 0.03, d + 0.04, 0.006), { y0: yTop, T: 0.03, bowls: [-bx, bx].map((x) => ({ x, z: 0.04, w: Math.min(0.42, sideW - 0.06), d: 0.32, n: 2, depth: 0.16, mat: SAN })) });
    k.box('top', p.top, w + 0.03, 0.1, 0.02, 0, top + 0.05, -d / 2 - 0.01, { r: 0.003 });
    for (const x of [-bx, bx]) {
      // widespread mixer: bridge spout + two cross handles
      k.cyl('faucet', p.finish, 0.024, 0.026, 0.02, x, top, -0.17, { segs: k.seg(16, 6) });
      k.tube('faucet', p.finish, [[x, top + 0.01, -0.17], [x, top + 0.17, -0.17], [x, top + 0.22, -0.12], [x, top + 0.18, -0.06]], 0.012, { segs: k.seg(24, 8), radial: k.seg(12, 6) });
      for (const s of [-1, 1]) crossHandle(k, p.finish, x + s * 0.1, top, -0.17);
    }
    return finish(k);
  },
});

const cornerBasin = item({
  id: 'bath-corner-basin', category: 'bathroom', ko: '코너 세면대', en: 'Corner basin', placement: 'wall', elevation: 0.52, size: [0.64, 0.5, 0.45],
  params: [P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN)],
  tags: ['corner basin', 'corner sink', 'washbasin', '코너 세면대', '세면대', '세면기', '모서리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.45, y0 = 0.2, th = 0.13;
    const shapeFn = () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(R * Math.cos(PI / 4), R * Math.sin(PI / 4));
      s.absarc(0, 0, R, PI / 4, (3 * PI) / 4, false);
      s.lineTo(0, 0);
      return s;
    };
    const hz = R * 0.6;
    const top = sunkBasin(k, 'basin', SAN, shapeFn, { y0, T: th, plate: true, bowls: [{ x: 0, z: hz, w: 0.3, d: 0.21, n: 2, depth: 0.12 }], bevel: 0.01 });
    bottleTrap(k, p.finish, 0, y0, hz, 0.02);
    addFaucet(k, 0, top, hz - 0.105 - 0.035, { reach: 0.09, height: 0.15, mat: p.finish });
    return finish(k);
  },
});

const consoleBasin = item({
  id: 'bath-console-basin', category: 'bathroom', ko: '콘솔 세면대(금속 다리)', en: 'Console basin', size: [0.8, 1.04, 0.52],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.6, 1.2),
    P.pick('finish', '다리·수전', 'Legs & tap', 'metal-chrome', FIN),
    P.bool('shelf', '유리 선반', 'Glass shelf', true),
  ],
  tags: ['console basin', 'washstand', 'washbasin', '콘솔 세면대', '세면대', '금속 다리', '수건걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.48, y0 = 0.72, f = p.finish;
    const top = sunkBasin(k, 'basin', SAN, () => roundRect(W, D, 0.035), { y0, T: 0.14, plate: true, bowls: [{ x: 0, z: 0.03, w: Math.min(0.56, W - 0.2), d: 0.3, n: 3, depth: 0.12 }], bevel: 0.012 });
    const lx = W / 2 - 0.05, lz = D / 2 - 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('legs', f, 0.014, 0.014, y0 + 0.005, sx * lx, 0, sz * lz, { segs: k.seg(14, 6) });
      k.cyl('legs', f, 0.02, 0.022, 0.012, sx * lx, 0, sz * lz, { segs: k.seg(14, 6) });
    }
    // towel bar across the front on two standoffs
    const ty = 0.6, tz = D / 2 + 0.03;
    k.rod('legs', f, [-lx, ty, tz], [lx, ty, tz], 0.01, { segs: k.seg(12, 6) });
    for (const sx of [-1, 1]) k.rod('legs', f, [sx * lx, ty, lz], [sx * lx, ty, tz], 0.008);
    if (p.shelf) k.box('glass', 'glass-frosted', 2 * lx + 0.02, 0.008, 2 * lz + 0.02, 0, 0.2, 0, { r: 0.002 });
    addFaucet(k, 0, top, -0.15, { reach: 0.12, height: 0.18, mat: f });
    return finish(k);
  },
});

const vesselBasin = item({
  id: 'bath-vessel-basin', category: 'bathroom', ko: '탑볼 세면기', en: 'Vessel basin', placement: 'surface', size: [0.42, 0.14, 0.42],
  params: [
    P.pick('shape', '형태', 'Shape', 'round', [['round', '원형', 'Round'], ['oval', '타원', 'Oval'], ['rect', '사각', 'Rectangle'], ['square', '정사각', 'Square']]),
    P.len('width', '폭', 'Width', 0.42, 0.32, 0.6),
    P.len('height', '높이', 'Height', 0.14, 0.1, 0.2),
    P.mat('mat', '재질', 'Material', SAN, 'ceramic'),
  ],
  tags: ['vessel basin', 'countertop basin', 'bowl sink', '탑볼', '세면기', '카운터 세면기', '세면볼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, h = p.height;
    const [n, dz] = { round: [2, 1], oval: [2, 0.74], rect: [5, 0.7], square: [5, 1] }[p.shape];
    sqLathe(k, 'basin', p.mat, [[0, 0], [0.4, 0], [0.43, 0.006], [0.75, 0.03], [0.95, h * 0.55], [1, h - 0.004], [0.985, h], [0.955, h - 0.004], [0.925, h * 0.6], [0.7, 0.04], [0.35, 0.022], [0, 0.02]], 0, 0, 0, { n, sx: W / 2, sz: (W * dz) / 2, smooth: 30 });
    k.cyl('waste', 'metal-chrome', 0.02, 0.02, 0.004, 0, 0.02, 0, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const troughBasin = item({
  id: 'bath-trough-basin', category: 'bathroom', ko: '트로프 세면대(콘크리트)', en: 'Trough basin', placement: 'wall', elevation: 0.7, size: [1, 0.41, 0.43],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.8),
    P.mat('mat', '재질', 'Material', 'concrete', 'stone'),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-black', FIN),
  ],
  tags: ['trough basin', 'trough sink', 'concrete basin', 'washbasin', '트로프 세면대', '콘크리트 세면대', '세면대', '벽수전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.42, h = 0.16, t = 0.035;
    const walls = roundRect(W, D, 0.02);
    walls.holes.push(holePath(roundRect(W - 2 * t, D - 2 * t, 0.015), 12));
    k.slab('basin', p.mat, walls, h, 0, { bevel: 0.005, curveSegs: 6 });
    k.slab('basin', p.mat, roundRect(W - 2 * t + 0.01, D - 2 * t + 0.01, 0.015), 0.045, 0.002, { bevel: 0.003, curveSegs: 6 });
    k.box('waste', 'metal-steel', Math.min(0.5, W * 0.5), 0.002, 0.04, 0, 0.048, 0.02, { r: 0 });
    const xs = W >= 0.9 ? [-W / 4, W / 4] : [0];
    for (const x of xs) wallSpout(k, p.finish, x, h + 0.13, -D / 2, 0.17);
    return finish(k);
  },
});

/* ---------------------------------------------------------------- bathtubs */

const clawfootTub = item({
  id: 'bath-clawfoot-tub', category: 'bathroom', ko: '클로풋 욕조', en: 'Clawfoot bathtub', size: [1.86, 0.98, 0.79],
  params: [
    P.len('length', '길이', 'Length', 1.7, 1.4, 1.9),
    P.mat('outside', '외부 도장', 'Outside', 'paint-white-gloss', 'paint'),
    P.pick('finish', '다리·수전', 'Feet & taps', 'metal-chrome', FIN),
    P.bool('water', '물', 'Water', false),
  ],
  tags: ['clawfoot tub', 'roll top bath', 'freestanding bath', 'vintage', '클로풋 욕조', '욕조', '독립 욕조', '빈티지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = 0.76, r = W / 2, sx = L / W, yb = 0.13, top = 0.76, f = p.finish;
    const sc = { scale: [sx, 1, 1], segs: k.seg(56, 16) };
    k.lathe('outside', p.outside, [[0, yb], [r * 0.66, yb], [r * 0.8, yb + 0.04], [r * 0.92, yb + 0.22], [r * 0.985, top - 0.15], [r, top - 0.035]], 0, 0, 0, { ...sc, smooth: 20 });
    k.lathe('tub', SAN, [[r * 0.998, top - 0.042], [r * 1.035, top - 0.018], [r * 1.03, top - 0.003], [r, top], [r * 0.965, top - 0.01], [r * 0.95, top - 0.05], [r * 0.9, yb + 0.25], [r * 0.75, yb + 0.07], [r * 0.5, yb + 0.045], [0, yb + 0.04]], 0, 0, 0, { ...sc, smooth: 30 });
    if (p.water) k.lathe('water', 'water', [[0, top - 0.2], [r * 0.93, top - 0.2], [r * 0.93, top - 0.199], [0, top - 0.199]], 0, 0, 0, { scale: [sx * 0.99, 1, 1], segs: k.seg(48, 12) });
    // ball-and-claw feet
    for (const fx of [-1, 1]) for (const fz of [-1, 1]) {
      const x = fx * L * 0.28, z = fz * W * 0.2;
      k.lathe('feet', f, [[0, 0.012], [0.026, 0.014], [0.03, 0.03], [0.022, 0.06], [0.02, 0.085], [0.03, 0.11], [0.045, yb + 0.005], [0, yb + 0.02]], x, 0, z, { smooth: 14, segs: k.seg(16, 6) });
      for (let i = 0; i < 3; i++) {
        const a = Math.atan2(fz, fx) + (i - 1) * 0.7;
        k.sphere('feet', f, 0.016, x + Math.cos(a) * 0.022, 0.014, z + Math.sin(a) * 0.022, { segs: k.seg(10, 5), rings: k.seg(8, 4) });
      }
    }
    // exposed supply pipes up the end, bridge mixer over the rim, telephone handset
    const xe = -L / 2 * 0.985, xp = -L / 2 * 1.035 - 0.03;
    for (const z of [-0.07, 0.07]) {
      k.tube('taps', f, [[xp, 0, z], [xp, top - 0.06, z], [xp + 0.01, top + 0.04, z], [xe, top + 0.07, z]], 0.011, { segs: k.seg(30, 10), radial: k.seg(10, 5) });
      k.cyl('taps', f, 0.028, 0.03, 0.012, xp, 0, z, { segs: k.seg(16, 6) });
      crossHandle(k, f, xe, top + 0.075, z);
    }
    k.rod('taps', f, [xe, top + 0.07, -0.07], [xe, top + 0.07, 0.07], 0.014, { segs: k.seg(14, 6) });
    k.tube('taps', f, [[xe, top + 0.07, 0], [xe + 0.02, top + 0.12, 0], [xe + 0.08, top + 0.13, 0], [xe + 0.12, top + 0.07, 0]], 0.011, { segs: k.seg(20, 6), radial: k.seg(10, 5) });
    k.rod('taps', f, [xe - 0.02, top + 0.07, 0], [xe - 0.02, top + 0.17, 0], 0.008);
    k.rod('taps', f, [xe - 0.02, top + 0.185, -0.09], [xe - 0.02, top + 0.185, 0.09], 0.012, { segs: k.seg(12, 6) });
    for (const s of [-1, 1]) k.sphere('taps', f, 0.022, xe - 0.02, top + 0.19, s * 0.09, { segs: k.seg(14, 6), rings: k.seg(10, 5) });
    return finish(k);
  },
});

const cornerTub = item({
  id: 'bath-corner-tub', category: 'bathroom', ko: '코너 욕조', en: 'Corner bathtub', size: [1.4, 0.71, 1.4],
  params: [
    P.len('size', '크기', 'Size', 1.4, 1.2, 1.6),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN),
    P.bool('water', '물', 'Water', false),
  ],
  tags: ['corner bath', 'corner tub', 'bathtub', '코너 욕조', '욕조', '모서리 욕조'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, H = 0.55, a = S * 0.32;
    const shapeFn = () => {
      const s = new THREE.Shape();
      s.moveTo(-S / 2, -S / 2); s.lineTo(S / 2, -S / 2); s.lineTo(S / 2, -S / 2 + a);
      s.quadraticCurveTo(S / 2, S / 2, -S / 2 + a, S / 2);
      s.lineTo(-S / 2, S / 2); s.lineTo(-S / 2, -S / 2);
      return s;
    };
    const c = 0.04 * S, ry = PI / 4;
    sunkBasin(k, 'tub', SAN, shapeFn, { y0: 0, T: H, plate: true, bevel: 0.012, bowls: [{ x: c, z: c, w: S * 0.78, d: S * 0.46, n: 2.4, depth: 0.42, ry }] });
    if (p.water) k.lathe('water', 'water', [[0, H - 0.15], [0.5, H - 0.15], [0.5, H - 0.149], [0, H - 0.149]], c, 0, c, { scale: [S * 0.36 / 0.5 * 0.92, 1, S * 0.2 / 0.5 * 0.88], ry, segs: k.seg(40, 12) });
    // deck mixer in the back corner, spout towards the bowl
    const tx = -S * 0.3, f = p.finish;
    k.cyl('faucet', f, 0.026, 0.028, 0.06, tx, H, tx, { segs: k.seg(16, 6) });
    k.tube('faucet', f, [[tx, H + 0.05, tx], [tx, H + 0.12, tx], [tx + 0.05, H + 0.15, tx + 0.05], [tx + 0.12, H + 0.1, tx + 0.12]], 0.012, { segs: k.seg(20, 6), radial: k.seg(12, 6) });
    for (const s of [-1, 1]) crossHandle(k, f, tx + s * 0.09, H, tx - s * 0.09);
    return finish(k);
  },
});

const alcoveTub = item({
  id: 'bath-alcove-tub-screen', category: 'bathroom', ko: '매립 욕조(타일 앞판+유리 가림막)', en: 'Alcove bath with tiled apron & screen', size: [1.7, 2.0, 0.75],
  params: [
    P.len('length', '길이', 'Length', 1.7, 1.4, 1.9),
    P.len('width', '폭', 'Width', 0.75, 0.7, 0.85),
    P.mat('apron', '앞판 타일', 'Apron tile', 'tile-subway-white', 'tile'),
    P.bool('screen', '유리 가림막', 'Bath screen', true),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-chrome', FIN),
  ],
  tags: ['alcove bath', 'built-in bathtub', 'bath screen', 'tiled bath', '매립 욕조', '욕조', '욕조 가림막', '타일'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = p.width, H = 0.56, f = p.finish;
    const iw = L - 0.18, id = W - 0.2, n = 2.8;
    const hole = (s) => { s.holes.push(holePath(outline(iw, id, n), 64, 0, 0.01)); return s; };
    k.slab('apron', p.apron, hole(roundRect(L, W, 0.004)), H - 0.04, 0, { bevel: 0.003, curveSegs: 4 });
    k.slab('apron', p.apron, roundRect(L, W, 0.004), 0.02, 0.001, { bevel: 0.002, curveSegs: 4 });
    k.slab('tub', SAN, hole(roundRect(L + 0.006, W + 0.006, 0.008)), 0.04, H - 0.04, { bevel: 0.008, curveSegs: 6 });
    sqLathe(k, 'tub', SAN, [[1, H - 0.0005], [0.985, H - 0.04], [0.95, H - 0.2], [0.82, 0.1], [0.5, 0.075], [0, 0.07]], 0, 0, 0.01, { n, sx: iw / 2, sz: id / 2, smooth: 20 });
    k.cyl('waste', 'metal-chrome', 0.025, 0.025, 0.003, -L / 2 + 0.25, 0.071, 0.01, { segs: k.seg(16, 6) });
    // deck mixer + spout at the tap end (+x)
    const tx = L / 2 - 0.3, tz = -W / 2 + 0.05;
    k.cyl('faucet', f, 0.025, 0.027, 0.05, tx, H, tz, { segs: k.seg(16, 6) });
    k.tube('faucet', f, [[tx, H + 0.04, tz], [tx, H + 0.12, tz], [tx, H + 0.15, tz + 0.05], [tx, H + 0.1, tz + 0.13]], 0.012, { segs: k.seg(20, 6), radial: k.seg(12, 6) });
    k.rod('faucet', f, [tx + 0.03, H + 0.04, tz], [tx + 0.09, H + 0.06, tz], 0.006);
    if (p.screen) {
      // hinged glass bath screen at the shower end
      const sw = Math.min(0.8, L * 0.48), sh = 1.42, gx = L / 2 - 0.02 - sw / 2, gz = W / 2 - 0.07;
      k.box('glass', 'glass-clear', sw, sh, 0.008, gx, H + sh / 2 + 0.005, gz, { r: 0 });
      k.box('frame', f, 0.02, sh, 0.03, L / 2 - 0.01, H + sh / 2 + 0.005, gz, { r: 0.003 });
      for (const y of [H + 0.25, H + sh - 0.25]) k.box('frame', f, 0.05, 0.05, 0.022, L / 2 - 0.035, y, gz, { r: 0.005 });
      k.rod('frame', f, [gx - sw / 2 + 0.02, H + 0.85, gz - 0.025], [gx - sw / 2 + 0.02, H + 0.85, gz + 0.025], 0.01);
    }
    return finish(k);
  },
});

const hinokiTub = item({
  id: 'bath-hinoki-tub', category: 'bathroom', ko: '히노키 편백 욕조', en: 'Hinoki soaking tub', size: [1.35, 0.65, 0.75],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.8, 1.5),
    P.len('depth', '깊이', 'Depth', 0.75, 0.65, 0.9),
    P.mat('wood', '목재', 'Wood', 'wood-ash', 'wood'),
    P.bool('set', '의자·바가지', 'Stool & bucket', true),
    P.bool('water', '물', 'Water', true),
  ],
  tags: ['hinoki tub', 'japanese soaking tub', 'ofuro', 'wooden bath', '히노키', '편백 욕조', '원목 욕조', '반신욕'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.62, t = 0.04, y0 = 0.04, n = 4, ph = (H - y0) / n, wd = p.wood;
    // skids
    for (const s of [-1, 1]) k.box('wood', wd, 0.07, y0, D - 0.06, s * (W / 2 - 0.12), y0 / 2, 0, { r: 0.004 });
    // plank walls (visible seams), long sides run full length
    for (let i = 0; i < n; i++) {
      const y = y0 + ph * (i + 0.5);
      for (const s of [-1, 1]) {
        k.box('wood', wd, W, ph - 0.002, t, 0, y, s * (D / 2 - t / 2), { r: 0.004 });
        k.box('wood', wd, t, ph - 0.002, D - 2 * t - 0.002, s * (W / 2 - t / 2), y, 0, { r: 0.004 });
      }
    }
    k.slab('wood', wd, frameShape(W + 0.02, D + 0.02, t + 0.02, t + 0.02, 0.008), 0.028, H - 0.002, { bevel: 0.004, curveSegs: 4 });
    k.box('wood', wd, W - 2 * t, 0.03, D - 2 * t, 0, y0 + 0.03, 0, { r: 0.003 });
    if (p.water) k.box('water', 'water', W - 2 * t - 0.004, 0.002, D - 2 * t - 0.004, 0, H - 0.12, 0, { r: 0 });
    if (p.set) {
      // low wash stool with a wooden bucket (oke) beside the tub
      const sx = W / 2 + 0.2, sz = D / 2 - 0.16;
      k.box('wood', wd, 0.32, 0.03, 0.2, sx, 0.205, sz, { r: 0.005 });
      for (const s of [-1, 1]) k.box('wood', wd, 0.03, 0.19, 0.18, sx + s * 0.13, 0.095, sz, { r: 0.004 });
      k.lathe('wood', wd, [[0, 0], [0.11, 0], [0.12, 0.13], [0.105, 0.13], [0.098, 0.015], [0, 0.015]], sx, 0.22, sz, { segs: k.seg(28, 10) });
      for (const y of [0.25, 0.32]) k.lathe('band', 'metal-copper', [[0.1145 + (y - 0.22) * 0.077, 0], [0.1175 + (y - 0.22) * 0.077, 0.004], [0.1175 + (y - 0.22) * 0.077, 0.012], [0.1145 + (y - 0.22) * 0.077, 0.016]], sx, y, sz, { segs: k.seg(28, 10) });
    }
    return finish(k);
  },
});

const stoneTub = item({
  id: 'bath-stone-tub', category: 'bathroom', ko: '사각 스톤 욕조', en: 'Stone resin bathtub', size: [1.88, 0.95, 0.8],
  params: [
    P.len('length', '길이', 'Length', 1.7, 1.4, 1.9),
    P.len('width', '폭', 'Width', 0.8, 0.7, 0.9),
    P.pick('shape', '모서리', 'Corners', 'soft', [['soft', '부드러운 사각', 'Soft rectangle'], ['round', '둥근 사각', 'Rounded']]),
    P.mat('mat', '재질', 'Material', 'ceramic-matte', 'stone'),
    P.pick('finish', '수전 마감', 'Tap finish', 'metal-black', FIN),
  ],
  tags: ['stone bath', 'freestanding bath', 'solid surface', 'bathtub', '스톤 욕조', '욕조', '독립 욕조', '인조석'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = p.width, H = 0.56, n = p.shape === 'soft' ? 5 : 3, f = p.finish;
    sqLathe(k, 'tub', p.mat, [[0, 0], [0.92, 0], [0.955, 0.006], [0.975, 0.04], [0.99, 0.3], [1, H - 0.012], [0.995, H], [0.96, H], [0.948, H - 0.012], [0.935, H - 0.15], [0.88, 0.14], [0.7, 0.085], [0, 0.08]], 0, 0, 0, { n, sx: L / 2, sz: W / 2, smooth: 34, segs: k.seg(64, 16) });
    k.cyl('waste', 'metal-chrome', 0.025, 0.025, 0.003, L * 0.3, 0.081, 0, { segs: k.seg(16, 6) });
    // square floor-standing filler
    const fx = -L / 2 - 0.13;
    k.box('filler', f, 0.045, 0.92, 0.045, fx, 0.46, 0, { r: 0.004 });
    k.box('filler', f, 0.1, 0.01, 0.1, fx, 0.005, 0, { r: 0.003 });
    k.box('filler', f, 0.17, 0.028, 0.03, fx + 0.085, 0.94, 0, { r: 0.004 });
    k.box('filler', f, 0.02, 0.05, 0.02, fx + 0.03, 0.75, 0.035, { r: 0.004 });
    return finish(k);
  },
});

/* ---------------------------------------------------------------- showers */

const crittallScreen = item({
  id: 'bath-walk-in-grid-screen', category: 'bathroom', ko: '워크인 샤워 격자 유리', en: 'Walk-in grid shower screen', size: [1.2, 2.0, 0.9],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.6),
    P.len('height', '높이', 'Height', 2.0, 1.9, 2.2),
    P.len('depth', '벽까지 깊이', 'Depth to wall', 0.9, 0.7, 1.2),
    P.int('rows', '가로 칸', 'Rows', 4, 2, 6),
    P.int('cols', '세로 칸', 'Columns', 2, 1, 4),
    P.pick('frame', '프레임', 'Frame', 'metal-black', FIN),
    P.bool('tray', '샤워 트레이', 'Shower tray', false),
  ],
  tags: ['walk-in shower', 'crittall', 'grid glass', 'shower screen', '워크인 샤워', '격자 유리', '샤워 파티션', '샤워부스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = p.depth, f = p.frame, fz = d / 2 - 0.02;
    const ty = p.tray ? 0.035 : 0;
    if (p.tray) k.slab('tray', 'ceramic-matte', roundRect(w + 0.02, d, 0.01), 0.035, 0, { bevel: 0.006, curveSegs: 4 });
    const gh = h - ty;
    k.box('glass', 'glass-clear', w - 0.03, gh - 0.03, 0.008, 0, ty + gh / 2, fz, { r: 0 });
    k.panel('frame', f, frameShape(w, gh, 0.03), 0.03, 0, ty + gh / 2, fz, { bevel: 0.002 });
    for (let i = 1; i < p.cols; i++) k.box('frame', f, 0.02, gh - 0.05, 0.026, -w / 2 + (w * i) / p.cols, ty + gh / 2, fz, { r: 0.002 });
    for (let i = 1; i < p.rows; i++) k.box('frame', f, w - 0.05, 0.02, 0.026, 0, ty + (gh * i) / p.rows, fz, { r: 0.002 });
    // wall channel at the left, stabiliser bar back to the rear wall
    k.box('frame', f, 0.025, gh, 0.045, -w / 2 - 0.0125, ty + gh / 2, fz, { r: 0.002 });
    k.rod('frame', f, [w / 2 - 0.08, ty + gh - 0.06, fz], [w / 2 - 0.08, ty + gh - 0.06, -d / 2 + 0.01], 0.009, { segs: k.seg(12, 6) });
    k.cyl('frame', f, 0.025, 0.025, 0.012, w / 2 - 0.08, ty + gh - 0.06, -d / 2, { rx: PI / 2, segs: k.seg(16, 6) });
    return finish(k);
  },
});

const quadrant = item({
  id: 'bath-quadrant-enclosure', category: 'bathroom', ko: '라운드 코너 샤워부스', en: 'Quadrant shower enclosure', size: [0.9, 2.0, 0.9],
  params: [
    P.len('size', '크기', 'Size', 0.9, 0.8, 1.0),
    P.pick('frame', '프레임', 'Frame', 'metal-chrome', FIN),
  ],
  tags: ['quadrant shower', 'curved shower enclosure', 'corner shower', 'shower booth', '라운드 샤워부스', '샤워부스', '코너 샤워', '곡면 유리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, r = 0.55, c = S - r, ty = 0.04, gh = 1.9, f = p.frame;
    // tray: square with the front-right corner rounded (corner of the walls at x = 0, z = 0)
    const tray = new THREE.Shape();
    tray.moveTo(0, 0); tray.lineTo(S, 0); tray.lineTo(S, c); tray.absarc(c, c, r, 0, PI / 2, false); tray.lineTo(0, S); tray.lineTo(0, 0);
    k.slab('tray', SAN, tray, ty, 0, { bevel: 0.006, curveSegs: 24 });
    k.cyl('tray', 'metal-chrome', 0.045, 0.045, 0.002, S * 0.3, ty, S * 0.3, { segs: k.seg(20, 8) });
    const y0 = ty + 0.01, inset = 0.03, R = r - inset;
    // fixed straight panels from the walls
    k.box('glass', 'glass-clear', 0.008, gh, c, S - inset, y0 + gh / 2, c / 2, { r: 0 });
    k.box('glass', 'glass-clear', c, gh, 0.008, c / 2, y0 + gh / 2, S - inset, { r: 0 });
    // two curved sliding doors (thin glass shells), slightly different radii so they overlap
    const arc = (rad, a0, a1) => shellGeo(k.seg(20, 8), 1, (u, v) => { const a = a0 + (a1 - a0) * u; return [c + Math.cos(a) * rad, y0 + 0.02 + v * (gh - 0.04), c + Math.sin(a) * rad]; }, 0.007);
    k.add('glass', 'glass-clear', arc(R, 0, PI * 0.29));
    k.add('glass', 'glass-clear', arc(R + 0.014, PI * 0.21, PI / 2));
    // curved top + bottom rails, wall profiles, knobs
    for (const y of [y0 + 0.008, y0 + gh - 0.012]) {
      const tor = new THREE.TorusGeometry(R + 0.007, 0.012, k.seg(8, 4), k.seg(32, 10), PI / 2);
      tor.scale(1, 1, 1.4);
      k.add('frame', f, T(tor, c, y, c, PI / 2, 0, 0));
      k.box('frame', f, 0.025, 0.024, c, S - inset, y, c / 2, { r: 0.004 });
      k.box('frame', f, c, 0.024, 0.025, c / 2, y, S - inset, { r: 0.004 });
    }
    k.box('frame', f, 0.03, gh, 0.02, S - inset, y0 + gh / 2, 0.01, { r: 0.003 });
    k.box('frame', f, 0.02, gh, 0.03, 0.01, y0 + gh / 2, S - inset, { r: 0.003 });
    for (const a of [PI * 0.27, PI * 0.23]) {
      const rr = a > PI / 4 ? R + 0.03 : R - 0.016;
      k.rod('handles', f, [c + Math.cos(a) * rr, y0 + 0.85, c + Math.sin(a) * rr], [c + Math.cos(a) * rr, y0 + 1.15, c + Math.sin(a) * rr], 0.009);
    }
    return finish(k);
  },
});

const showerTray = item({
  id: 'bath-shower-tray', category: 'bathroom', ko: '샤워 트레이(슬림)', en: 'Slim shower tray', size: [1.2, 0.03, 0.8],
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.len('depth', '깊이', 'Depth', 0.8, 0.7, 1.0),
    P.mat('mat', '재질', 'Material', 'ceramic-matte', 'stone'),
    P.pick('drain', '배수구', 'Drain', 'linear', [['linear', '일자형', 'Linear'], ['round', '원형', 'Round']]),
  ],
  tags: ['shower tray', 'shower base', 'stone tray', '샤워 트레이', '샤워 받침', '배수구', '욕실 바닥'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.03, lip = 0.04;
    const rim = roundRect(w, d, 0.01);
    rim.holes.push(holePath(roundRect(w - 2 * lip, d - 2 * lip, 0.02), 12));
    k.slab('tray', p.mat, rim, h, 0, { bevel: 0.004, curveSegs: 4 });
    k.slab('tray', p.mat, roundRect(w - 2 * lip + 0.004, d - 2 * lip + 0.004, 0.02), h - 0.006, 0.001, { bevel: 0.004, curveSegs: 4 });
    if (p.drain === 'linear') {
      k.box('drain', 'metal-steel', w - 2 * lip - 0.1, 0.003, 0.05, 0, h - 0.005, -d / 2 + lip + 0.06, { r: 0.001 });
      for (let i = 0; i < 12; i++) k.box('slots', 'metal-black', 0.006, 0.001, 0.03, -(w - 2 * lip - 0.16) / 2 + ((w - 2 * lip - 0.16) * i) / 11, h - 0.0035, -d / 2 + lip + 0.06, { r: 0 });
    } else {
      k.cyl('drain', 'metal-steel', 0.06, 0.06, 0.003, 0, h - 0.0065, 0, { segs: k.seg(28, 10) });
      k.cyl('slots', 'metal-black', 0.035, 0.035, 0.001, 0, h - 0.0036, 0, { segs: k.seg(20, 8) });
    }
    return finish(k);
  },
});

const ceilingShower = item({
  id: 'bath-ceiling-rain-shower', category: 'bathroom', ko: '천장형 레인 샤워헤드', en: 'Ceiling rain shower', placement: 'ceiling', size: [0.4, 0.3, 0.4],
  params: [
    P.pick('shape', '형태', 'Shape', 'square', [['square', '사각', 'Square'], ['round', '원형', 'Round']]),
    P.len('head', '헤드 크기', 'Head size', 0.4, 0.25, 0.6),
    P.len('drop', '내림 길이', 'Drop', 0.27, 0.05, 0.6),
    P.pick('finish', '마감', 'Finish', 'metal-chrome', FIN),
  ],
  tags: ['rain shower', 'ceiling shower', 'shower head', '레인 샤워', '천장 샤워', '샤워헤드', '해바라기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.head, f = p.finish, ht = 0.012;
    if (p.shape === 'square') {
      k.box('head', f, s, ht, s, 0, ht / 2 + 0.001, 0, { r: 0.004 });
      k.box('nozzles', 'plastic-grey', s - 0.024, 0.001, s - 0.024, 0, 0.0005, 0, { r: 0 });
    } else {
      k.lathe('head', f, [[0, 0.001], [s / 2 - 0.004, 0.001], [s / 2, 0.005], [s / 2, ht], [s * 0.2, ht + 0.004], [0, ht + 0.004]], 0, 0, 0, { segs: k.seg(48, 14) });
      k.cyl('nozzles', 'plastic-grey', s / 2 - 0.012, s / 2 - 0.012, 0.001, 0, 0, 0, { segs: k.seg(40, 12) });
    }
    k.cyl('head', f, 0.022, 0.026, 0.02, 0, ht, 0, { segs: k.seg(16, 6) });
    k.cyl('arm', f, 0.011, 0.011, p.drop, 0, ht + 0.015, 0, { segs: k.seg(14, 6) });
    k.cyl('arm', f, 0.04, 0.035, 0.015, 0, ht + 0.015 + p.drop - 0.012, 0, { segs: k.seg(20, 8) });
    return finish(k);
  },
});

const showerBaskets = item({
  id: 'bath-shower-basket-shelf', category: 'bathroom', ko: '샤워 바스켓 선반(욕실 용품)', en: 'Shower basket shelf', placement: 'wall', elevation: 1.0, size: [0.32, 0.5, 0.14],
  params: [
    P.pick('finish', '마감', 'Finish', 'metal-black', FIN),
    P.bool('bottles', '욕실 용품', 'Toiletries', true),
  ],
  tags: ['shower caddy', 'shower shelf', 'wire basket', '샤워 선반', '욕실 선반', '바스켓', '샴푸'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.3, d = 0.12, bh = 0.07, f = p.finish, zb = 0.01, zf = zb + d;
    for (const yb of [0.02, 0.29]) {
      const loop = (y) => k.bentTube('wire', f, [[-w / 2, y, zb], [w / 2, y, zb], [w / 2, y, zf], [-w / 2, y, zf], [-w / 2, y, zb + 0.01]], 0.004, 0.02, { radial: k.seg(8, 4) });
      loop(yb);
      loop(yb + bh);
      for (let i = 0; i < 6; i++) { const z = zb + 0.012 + (i * (d - 0.024)) / 5; k.rod('wire', f, [-w / 2 + 0.01, yb, z], [w / 2 - 0.01, yb, z], 0.0025, { segs: k.seg(6, 4) }); }
      for (const [x, z] of [[-w / 2, zf], [w / 2, zf], [0, zf]]) k.rod('wire', f, [x, yb, z], [x, yb + bh, z], 0.0028, { segs: k.seg(6, 4) });
    }
    // back hanger rails
    for (const s of [-1, 1]) k.rod('wire', f, [s * (w / 2 - 0.03), 0.02, zb], [s * (w / 2 - 0.03), 0.48, zb], 0.004, { segs: k.seg(8, 4) });
    k.rod('wire', f, [-w / 2 + 0.03, 0.48, zb], [w / 2 - 0.03, 0.48, zb], 0.004);
    k.cyl('wire', f, 0.012, 0.012, 0.01, 0, 0.48, 0, { rx: PI / 2, segs: k.seg(12, 6) });
    if (p.bottles) {
      bottle(k, 'bottle', 'plastic-white', -0.08, 0.023, zb + d / 2, 0.032, 0.2);
      bottle(k, 'bottle2', 'plastic-grey', 0.0, 0.023, zb + d / 2, 0.03, 0.17, { cap: 'plastic-black' });
      bottle(k, 'bottle2', 'plastic-grey', 0.08, 0.023, zb + d / 2, 0.028, 0.15, { cap: 'plastic-black' });
      bottle(k, 'bottle', 'plastic-white', -0.07, 0.293, zb + d / 2, 0.03, 0.11, { pump: 'metal-chrome' });
      k.rbox('soap', 'ceramic-matte', 0.08, 0.025, 0.05, 0.012, 0.06, 0.306, zb + d / 2, { overrides: { color: '#d9e8dc' } });
    }
    return finish(k);
  },
});

const showerBench = item({
  id: 'bath-teak-shower-bench', category: 'bathroom', ko: '티크 샤워 벤치', en: 'Teak shower bench', size: [0.9, 0.45, 0.36],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.5, 1.2),
    P.mat('wood', '목재', 'Wood', 'wood-teak', 'wood'),
  ],
  tags: ['shower bench', 'teak bench', 'bath bench', '샤워 벤치', '티크 벤치', '욕실 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.width, H = 0.45, D = 0.36, n = 6, wd = p.wood, sw = D / n - 0.008;
    for (let i = 0; i < n; i++) k.box('wood', wd, L, 0.022, sw, 0, H - 0.011, -D / 2 + (D / n) * (i + 0.5), { r: 0.004 });
    for (let i = 0; i < 4; i++) k.box('wood', wd, L - 0.12, 0.018, (D - 0.1) / 4 - 0.008, 0, 0.12, -(D - 0.1) / 2 + ((D - 0.1) / 4) * (i + 0.5), { r: 0.003 });
    const lx = L / 2 - 0.05, lz = D / 2 - 0.04;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.box('wood', wd, 0.045, H - 0.022, 0.045, sx * lx, (H - 0.022) / 2, sz * lz, { r: 0.004 });
      k.box('wood', wd, 0.03, 0.05, 2 * lz, sx * lx, H - 0.05, 0, { r: 0.003 });
      k.box('wood', wd, 0.03, 0.035, 2 * lz, sx * lx, 0.11, 0, { r: 0.003 });
    }
    for (const sz of [-1, 1]) k.box('wood', wd, 2 * lx, 0.05, 0.022, 0, H - 0.05, sz * lz, { r: 0.003 });
    return finish(k);
  },
});

const showerCurtain = item({
  id: 'bath-shower-curtain', category: 'bathroom', ko: '샤워 커튼(봉 포함)', en: 'Shower curtain & rod', placement: 'wall', elevation: 0.3, size: [1.5, 1.88, 0.07],
  params: [
    P.len('width', '폭', 'Width', 1.5, 0.8, 2.0),
    P.len('drop', '기장', 'Drop', 1.8, 1.2, 2.0),
    P.num('drawn', '친 정도', 'Drawn', 1, 0.3, 1, 0.05),
    P.mat('fabric', '천', 'Fabric', 'fabric-linen-white', 'fabric'),
    P.pick('finish', '봉 마감', 'Rod finish', 'metal-chrome', FIN),
  ],
  tags: ['shower curtain', 'curtain rod', 'bath curtain', '샤워 커튼', '커튼봉', '욕조 커튼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, drop = p.drop, f = p.finish, ry = drop + 0.06;
    k.rod('rod', f, [-w / 2, ry, 0], [w / 2, ry, 0], 0.012, { segs: k.seg(14, 6) });
    for (const s of [-1, 1]) k.cyl('rod', f, 0.03, 0.03, 0.012, s * w / 2, ry, 0, { rz: s > 0 ? -PI / 2 : PI / 2, segs: k.seg(18, 8) });
    const cw = (w - 0.05) * p.drawn, x0 = -w / 2 + 0.02;
    const folds = Math.max(3, Math.round(cw / 0.13));
    const top = ry - 0.04;
    const fn = (u, v) => {
      const amp = 0.022 * (1 + 0.5 * v) * (1.4 - 0.4 * p.drawn);
      return [x0 + u * cw + 0.01 * Math.sin(v * 3 + u * 9) * v, top - v * drop, amp * Math.sin(u * folds * 2 * PI)];
    };
    k.add('curtain', p.fabric, shellGeo(k.seg(folds * 8, folds * 3), k.seg(12, 4), fn, 0.0025));
    for (let i = 0; i <= folds; i++) {
      const tor = new THREE.TorusGeometry(0.022, 0.0025, k.seg(6, 3), k.seg(16, 8));
      k.add('rings', f, T(tor, x0 + (i / folds) * cw, ry - 0.008, 0, 0, PI / 2, 0));
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------ accessories */

const towelRing = item({
  id: 'bath-towel-ring', category: 'bathroom', ko: '수건 링', en: 'Towel ring', placement: 'wall', elevation: 1.0, size: [0.18, 0.54, 0.08],
  params: [
    P.pick('finish', '마감', 'Finish', 'metal-chrome', FIN),
    P.bool('towel', '수건', 'Towel', true),
  ],
  tags: ['towel ring', 'hand towel holder', '수건 링', '수건걸이', '핸드타월'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const f = p.finish, R = 0.085, cy = 0.36, z = 0.05;
    k.cyl('metal', f, 0.03, 0.03, 0.012, 0, cy + R + 0.02, 0, { rx: PI / 2, segs: k.seg(20, 8) });
    k.rod('metal', f, [0, cy + R + 0.02, 0.01], [0, cy + R + 0.02, z], 0.008);
    k.rod('metal', f, [0, cy + R + 0.02, z], [0, cy + R - 0.002, z], 0.007);
    k.add('metal', f, T(new THREE.TorusGeometry(R, 0.006, k.seg(10, 5), k.seg(36, 12)), 0, cy, z));
    if (p.towel) towel(k, 0, cy - R + 0.004, z, 0.17, 0.32);
    return finish(k);
  },
});

const hookRail = item({
  id: 'bath-hook-rail', category: 'bathroom', ko: '수건 후크 레일', en: 'Towel hook rail', placement: 'wall', elevation: 1.2, size: [0.68, 0.58, 0.09],
  params: [
    P.int('hooks', '후크 수', 'Hooks', 4, 2, 6),
    P.mat('board', '판재', 'Board', 'wood-oak', 'wood'),
    P.pick('finish', '후크 마감', 'Hook finish', 'metal-black', FIN),
    P.bool('towels', '수건', 'Towels', true),
  ],
  tags: ['hooks', 'robe hook', 'towel hook', 'coat rail', '후크', '수건걸이', '가운걸이', '벽걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.hooks, w = 0.15 * n, top = 0.6, by = top - 0.045;
    k.box('board', p.board, w, 0.09, 0.02, 0, by, 0.01, { r: 0.004 });
    const xs = [];
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      xs.push(x);
      k.bentTube('hooks', p.finish, [[x, by, 0.02], [x, by, 0.055], [x, by - 0.035, 0.06], [x, by - 0.028, 0.075], [x, by - 0.01, 0.078]], 0.0045, 0.012, { radial: k.seg(8, 4), caps: true });
    }
    if (p.towels) {
      hangingCloth(k, 'towel', 'fabric-cotton-white', xs[0], by - 0.03, 0.065, 0.24, 0.5, 1);
      if (n > 2) hangingCloth(k, 'towel2', 'fabric-cotton-grey', xs[n - 1], by - 0.03, 0.065, 0.2, 0.42, 3);
    }
    return finish(k);
  },
});

const rollHolder = item({
  id: 'bath-toilet-roll-holder', category: 'bathroom', ko: '휴지걸이(커버형)', en: 'Toilet roll holder', placement: 'wall', elevation: 0.65, size: [0.14, 0.13, 0.13],
  params: [P.pick('finish', '마감', 'Finish', 'metal-chrome', FIN)],
  tags: ['toilet roll holder', 'toilet paper holder', '휴지걸이', '화장지 홀더', '휴지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const f = p.finish, cy = 0.075, z = 0.07, L = 0.1;
    k.box('metal', f, 0.02, 0.07, 0.012, -L / 2 - 0.018, cy, 0.006, { r: 0.003 });
    k.rod('metal', f, [-L / 2 - 0.018, cy, 0.01], [-L / 2 - 0.018, cy, z], 0.007);
    k.rod('metal', f, [-L / 2 - 0.018, cy, z], [L / 2 + 0.005, cy, z], 0.006);
    // roll: hollow paper cylinder along x + a short hanging sheet
    k.lathe('paper', 'paper', [[0.021, 0], [0.058, 0], [0.06, 0.003], [0.06, L - 0.003], [0.058, L], [0.021, L], [0.021, 0]], -L / 2, cy, z, { rz: -PI / 2, segs: k.seg(28, 10) });
    k.box('paper', 'paper', L - 0.004, 0.06, 0.001, 0, cy - 0.03, z + 0.06, { r: 0 });
    // cover flap over the top of the roll
    const flap = shellGeo(k.seg(16, 6), 1, (u, v) => { const a = PI * 0.15 + u * PI * 0.7; return [-L / 2 - 0.01 + v * (L + 0.02), cy + Math.sin(a) * 0.068, z - Math.cos(a) * 0.068]; }, 0.0015);
    k.add('metal', f, flap);
    return finish(k);
  },
});

const rollStand = item({
  id: 'bath-toilet-roll-stand', category: 'bathroom', ko: '스탠드 휴지걸이(예비 휴지)', en: 'Toilet roll stand', size: [0.23, 0.68, 0.2],
  params: [
    P.int('spares', '예비 휴지', 'Spare rolls', 3, 0, 4),
    P.pick('finish', '마감', 'Finish', 'metal-black', FIN),
  ],
  tags: ['toilet roll stand', 'paper holder', 'spare roll', '휴지 스탠드', '휴지걸이', '예비 휴지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const f = p.finish;
    k.lathe('metal', f, [[0, 0], [0.095, 0], [0.1, 0.004], [0.098, 0.012], [0.02, 0.016], [0, 0.016]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('metal', f, 0.009, 0.009, 0.64, 0, 0.012, 0, { segs: k.seg(12, 6) });
    k.sphere('metal', f, 0.016, 0, 0.66, 0, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    const roll = (x, y, z, axisX) => k.lathe('paper', 'paper', [[0.021, 0], [0.057, 0], [0.059, 0.003], [0.059, 0.097], [0.057, 0.1], [0.021, 0.1], [0.021, 0]], x, y, z, { rz: axisX ? -PI / 2 : 0, segs: k.seg(28, 10) });
    for (let i = 0; i < p.spares; i++) roll(0, 0.017 + i * 0.101, 0, false);
    // top arm with the roll in use
    const ay = 0.55;
    k.rod('metal', f, [0, ay, 0], [0.13, ay, 0], 0.006);
    roll(0.02, ay, 0, true);
    return finish(k);
  },
});

const toiletBrush = item({
  id: 'bath-toilet-brush', category: 'bathroom', ko: '변기 솔 + 홀더', en: 'Toilet brush & holder', size: [0.11, 0.4, 0.11],
  params: [P.mat('mat', '홀더', 'Holder', 'ceramic-matte', 'ceramic'), P.pick('finish', '손잡이', 'Handle', 'metal-steel', FIN)],
  tags: ['toilet brush', 'brush holder', '변기 솔', '변기솔', '욕실 청소'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('holder', p.mat, [[0, 0], [0.048, 0], [0.052, 0.006], [0.054, 0.12], [0.05, 0.145], [0.046, 0.145], [0.048, 0.12], [0.046, 0.02], [0, 0.02]], 0, 0, 0, { smooth: 16, segs: k.seg(32, 10) });
    k.lathe('handle', p.finish, [[0, 0.13], [0.035, 0.13], [0.037, 0.138], [0.012, 0.15], [0.008, 0.16], [0.008, 0.38], [0.012, 0.392], [0, 0.4]], 0, 0, 0, { segs: k.seg(20, 8) });
    return finish(k);
  },
});

const vanitySet = item({
  id: 'bath-vanity-accessory-set', category: 'bathroom', ko: '욕실 소품 세트(디스펜서·컵·비누)', en: 'Bathroom accessory set', placement: 'surface', size: [0.32, 0.23, 0.13],
  params: [
    P.mat('mat', '재질', 'Material', 'ceramic-matte', 'ceramic'),
    P.mat('tray', '트레이', 'Tray', 'marble-white', 'stone'),
  ],
  tags: ['soap dispenser', 'toothbrush holder', 'soap dish', 'vanity set', '디스펜서', '칫솔꽂이', '비누받침', '욕실 소품'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const ty = 0.012;
    k.rbox('tray', p.tray, 0.32, ty, 0.13, 0.005, 0, ty / 2, 0, { segs: 2 });
    bottle(k, 'dispenser', p.mat, -0.1, ty, 0, 0.034, 0.14, { pump: 'metal-chrome' });
    // tumbler with two toothbrushes
    k.lathe('dispenser', p.mat, [[0, 0], [0.03, 0], [0.033, 0.006], [0.036, 0.1], [0.033, 0.1], [0.031, 0.012], [0, 0.012]], 0.0, ty, 0, { segs: k.seg(28, 10) });
    for (const [a, c] of [[0.18, 'plastic-white'], [-0.22, 'plastic-grey']]) {
      const x0 = 0.0 + Math.sin(a) * 0.012, top = [Math.sin(a) * 0.075, ty + 0.19, 0.012 * Math.sign(a)];
      k.rod('brush', c, [x0, ty + 0.015, 0], top, 0.005, { segs: k.seg(8, 4) });
      k.box('brushhead', 'plastic-white', 0.012, 0.03, 0.012, top[0] + Math.sin(a) * 0.012, top[1] + 0.012, top[2] + 0.006, { rz: -a, r: 0.003 });
    }
    // oval soap dish with a bar of soap
    k.lathe('dispenser', p.mat, [[0, 0], [0.035, 0], [0.045, 0.008], [0.05, 0.018], [0.046, 0.018], [0.038, 0.01], [0, 0.009]], 0.1, ty, 0, { scale: [1, 1, 0.7], segs: k.seg(28, 10) });
    k.rbox('soap', 'ceramic-matte', 0.065, 0.02, 0.042, 0.009, 0.1, ty + 0.019, 0, { overrides: { color: '#f0e3cf' } });
    return finish(k);
  },
});

const glassShelf = item({
  id: 'bath-glass-shelf', category: 'bathroom', ko: '욕실 유리 선반', en: 'Glass bathroom shelf', placement: 'wall', elevation: 1.3, size: [0.6, 0.17, 0.14],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.4, 0.9),
    P.pick('finish', '브래킷', 'Brackets', 'metal-chrome', FIN),
    P.bool('items', '소품', 'Items', true),
  ],
  tags: ['glass shelf', 'bathroom shelf', '유리 선반', '욕실 선반', '선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.12, gy = 0.03, f = p.finish;
    k.box('glass', 'glass-frosted', w, 0.008, d, 0, gy, d / 2 + 0.008, { r: 0.002 });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.05);
      k.box('metal', f, 0.03, 0.05, 0.012, x, gy, 0.006, { r: 0.003 });
      k.box('metal', f, 0.026, 0.02, d - 0.02, x, gy, d / 2 + 0.008, { r: 0.003 });
      k.rod('metal', f, [s * (w / 2 - 0.02), gy + 0.004, d - 0.002], [s * (w / 2 - 0.02), gy + 0.05, d - 0.002], 0.004);
    }
    k.rod('metal', f, [-w / 2 + 0.02, gy + 0.05, d - 0.002], [w / 2 - 0.02, gy + 0.05, d - 0.002], 0.005, { segs: k.seg(10, 5) });
    if (p.items) {
      k.lathe('perfume', 'glass-tinted', [[0, 0], [0.026, 0], [0.028, 0.005], [0.028, 0.08], [0.012, 0.09], [0, 0.09]], -w * 0.25, gy + 0.004, 0.065, { segs: k.seg(20, 8) });
      k.cyl('cap', 'metal-gold', 0.01, 0.01, 0.025, -w * 0.25, gy + 0.094, 0.065, { segs: k.seg(12, 6) });
      bottle(k, 'bottle', 'plastic-white', w * 0.05, gy + 0.004, 0.065, 0.026, 0.12, { cap: 'metal-chrome' });
      k.lathe('jar', 'ceramic-matte', [[0, 0], [0.04, 0], [0.042, 0.05], [0, 0.052]], w * 0.25, gy + 0.004, 0.065, { segs: k.seg(24, 8) });
    }
    return finish(k);
  },
});

const cornerShelf = item({
  id: 'bath-corner-shelf', category: 'bathroom', ko: '코너 선반(3단)', en: 'Corner shower shelf', placement: 'wall', elevation: 1.0, size: [0.33, 0.59, 0.23],
  params: [
    P.int('tiers', '단 수', 'Tiers', 3, 2, 4),
    P.pick('finish', '마감', 'Finish', 'metal-steel', FIN),
  ],
  tags: ['corner shelf', 'shower shelf', 'corner caddy', '코너 선반', '샤워 선반', '욕실 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.23, f = p.finish, gap = 0.27;
    const shape = () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(R * Math.cos(PI / 4), R * Math.sin(PI / 4)); s.absarc(0, 0, R, PI / 4, (3 * PI) / 4, false); s.lineTo(0, 0); return s; };
    for (let i = 0; i < p.tiers; i++) {
      const y = 0.02 + i * gap;
      k.slab('metal', f, shape(), 0.006, y, { bevel: 0.0015, curveSegs: 20 });
      const pts = [];
      for (let j = 0; j <= 12; j++) { const a = PI / 4 + (j / 12) * (PI / 2); pts.push([Math.cos(a) * (R - 0.004), y + 0.03, Math.sin(a) * (R - 0.004)]); }
      k.tube('metal', f, pts, 0.004, { segs: k.seg(24, 8), radial: k.seg(8, 4) });
      for (const j of [0, 12]) k.rod('metal', f, [pts[j][0], y + 0.004, pts[j][2]], [pts[j][0], y + 0.03, pts[j][2]], 0.0035);
    }
    k.rod('metal', f, [0, 0, 0.012], [0, 0.04 + (p.tiers - 1) * gap, 0.012], 0.01, { segs: k.seg(12, 6) });
    return finish(k);
  },
});

const ledMirror = item({
  id: 'bath-led-mirror', category: 'bathroom', ko: 'LED 거울(원형)', en: 'LED mirror (round)', placement: 'wall', elevation: 1.1, size: [0.7, 0.7, 0.035],
  params: [
    P.pick('shape', '형태', 'Shape', 'round', [['round', '원형', 'Round'], ['rect', '사각', 'Rectangle'], ['pill', '캡슐형', 'Pill']]),
    P.len('width', '폭', 'Width', 0.7, 0.4, 1.4),
    P.len('height', '높이', 'Height', 0.9, 0.5, 1.2),
    P.pick('tone', '빛 색', 'Light colour', 'warm', [['warm', '전구색', 'Warm'], ['cool', '주광색', 'Cool']]),
  ],
  tags: ['led mirror', 'backlit mirror', 'bathroom mirror', 'LED 거울', '조명 거울', '욕실 거울', '거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.shape === 'round' ? w : p.height;
    const sh = (a, b) => (p.shape === 'round' ? ellipse(a, b) : p.shape === 'pill' ? roundRect(a, b, a / 2 - 0.001) : roundRect(a, b, 0.02));
    const cy = h / 2, lm = p.tone === 'warm' ? 'light-warm' : 'light-cool';
    // aluminium back tray (shadow gap), mirror glass, frosted LED band inside the edge
    k.panel('back', 'metal-aluminium', sh(w - 0.06, h - 0.06), 0.025, 0, cy, 0.0125, { bevel: 0.002, curveSegs: 40 });
    k.panel('mirror', 'mirror', sh(w, h), 0.006, 0, cy, 0.028, { bevel: 0.0015, curveSegs: 48 });
    const band = sh(w - 0.05, h - 0.05);
    band.holes.push(holePath(sh(w - 0.075, h - 0.075), 64));
    k.panel('led', lm, band, 0.002, 0, cy, 0.0315, { bevel: 0, curveSegs: 48 });
    k.light(0, cy, 0.08, { color: p.tone === 'warm' ? '#ffe2b0' : '#eef4ff', intensity: 0.5, distance: 2.5 });
    return finish(k);
  },
});

const archMirror = item({
  id: 'bath-arched-mirror', category: 'bathroom', ko: '아치형 프레임 거울', en: 'Arched framed mirror', placement: 'wall', elevation: 1.05, size: [0.55, 0.9, 0.025],
  params: [
    P.len('width', '폭', 'Width', 0.55, 0.4, 1.0),
    P.len('height', '높이', 'Height', 0.9, 0.6, 1.6),
    P.mat('frame', '프레임', 'Frame', 'metal-brass', 'metal'),
  ],
  tags: ['arched mirror', 'framed mirror', 'bathroom mirror', '아치 거울', '거울', '욕실 거울', '프레임 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = Math.max(p.height, w * 0.8), b = 0.022;
    const fr = archShape(w, h);
    fr.holes.push(holePath(archShape(w - 2 * b, h - 2 * b), 64));
    k.panel('frame', p.frame, fr, 0.022, 0, h / 2, 0.011, { bevel: 0.004, curveSegs: 40 });
    k.panel('mirror', 'mirror', archShape(w - 2 * b + 0.006, h - 2 * b + 0.006), 0.005, 0, h / 2, 0.009, { bevel: 0.001, curveSegs: 40 });
    k.panel('back', 'plywood', archShape(w - 0.01, h - 0.01), 0.006, 0, h / 2, 0.003, { bevel: 0, curveSegs: 20 });
    return finish(k);
  },
});

const medicineCabinet = item({
  id: 'bath-medicine-cabinet-vintage', category: 'bathroom', ko: '빈티지 약장(거울 도어)', en: 'Vintage medicine cabinet', placement: 'wall', elevation: 1.15, size: [0.5, 0.66, 0.16],
  params: [
    P.mat('body', '본체', 'Body', 'paint-white-gloss', 'paint'),
    P.pick('knob', '손잡이', 'Knob', 'metal-brass', FIN),
  ],
  tags: ['medicine cabinet', 'mirror cabinet', 'vintage', '약장', '거울장', '빈티지', '욕실 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.45, h = 0.56, d = 0.13, y0 = 0.05, b = p.body;
    k.box('body', b, w, h, d - 0.02, 0, y0 + h / 2, (d - 0.02) / 2, { r: 0.003 });
    // crown + bottom ledge
    k.box('body', b, w + 0.05, 0.03, d + 0.02, 0, y0 + h + 0.015, (d + 0.02) / 2, { r: 0.006 });
    k.box('body', b, w + 0.03, 0.02, d + 0.005, 0, y0 + h + 0.04, (d + 0.005) / 2, { r: 0.005 });
    k.box('body', b, w + 0.05, 0.02, d + 0.03, 0, y0 - 0.01, (d + 0.03) / 2, { r: 0.006 });
    k.box('body', b, w - 0.04, 0.04, 0.02, 0, y0 - 0.04, 0.01, { r: 0.005 });
    // framed mirror door
    const dw = w - 0.01, dh = h - 0.01, fz = d - 0.01;
    k.panel('door', b, frameShape(dw, dh, 0.045, 0.045, 0.004), 0.02, 0, y0 + h / 2, fz, { bevel: 0.003 });
    k.box('mirror', 'mirror', dw - 0.086, dh - 0.086, 0.005, 0, y0 + h / 2, fz - 0.004, { r: 0.0015 });
    addHandle(k, 'knob', p.knob, 'knob', dw / 2 - 0.025, y0 + h / 2, fz + 0.01);
    return finish(k);
  },
});

const bathMat = item({
  id: 'bath-mat', category: 'bathroom', ko: '욕실 매트(코듀로이)', en: 'Ribbed bath mat', size: [0.8, 0.025, 0.5],
  params: [
    P.pick('shape', '형태', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '타원', 'Oval']]),
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.2),
    P.len('depth', '깊이', 'Depth', 0.5, 0.4, 0.8),
    P.mat('fabric', '천', 'Fabric', 'fabric-cotton-white', 'fabric'),
  ],
  tags: ['bath mat', 'bath rug', 'shower mat', '욕실 매트', '발매트', '러그'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, base = 0.012;
    if (p.shape === 'rect') k.soft('mat', p.fabric, w, base, d, 0.005, 0, base / 2, 0, { puff: 0.002, flat: 4 });
    else k.lathe('mat', p.fabric, [[0, 0], [0.49, 0], [0.5, 0.004], [0.495, base], [0, base]], 0, 0, 0, { scale: [w, 1, d], segs: k.seg(48, 14) });
    // chunky chenille ribs across the mat, clipped to the outline
    const n = Math.round(d / 0.045);
    for (let i = 0; i < n; i++) {
      const z = -d / 2 + 0.03 + ((d - 0.06) * i) / Math.max(1, n - 1);
      const len = p.shape === 'rect' ? w - 0.05 : w * Math.sqrt(Math.max(0.05, 1 - (2 * z / d) ** 2)) - 0.06;
      k.soft('mat', p.fabric, len, 0.016, 0.034, 0.008, 0, base + 0.004, z, { flat: 2 });
    }
    return finish(k);
  },
});

const laundryBasket = item({
  id: 'bath-laundry-basket', category: 'bathroom', ko: '빨래 바구니(뚜껑)', en: 'Laundry hamper', size: [0.46, 0.6, 0.46],
  params: [
    P.mat('mat', '재질', 'Material', 'rattan', 'wood'),
    P.bool('lid', '뚜껑', 'Lid', true),
    P.bool('liner', '면 주머니', 'Cotton liner', true),
  ],
  tags: ['laundry basket', 'hamper', 'wicker basket', '빨래 바구니', '빨래통', '라탄 바구니'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = 0.55, r0 = 0.17, r1 = 0.21;
    k.lathe('basket', p.mat, [[0, 0.004], [r0 - 0.01, 0], [r0, 0.012], [(r0 + r1) / 2, H * 0.5], [r1, H - 0.01], [r1 - 0.004, H], [r1 - 0.018, H], [r1 - 0.02, H - 0.02], [r0 - 0.018, 0.03], [0, 0.03]], 0, 0, 0, { smooth: 18, segs: k.seg(40, 12) });
    // woven bands (slightly proud rings)
    for (const t of [0.12, 0.5, 0.88]) {
      const y = t * H, rr = r0 + (r1 - r0) * t + 0.004;
      k.add('basket', p.mat, T(new THREE.TorusGeometry(rr, 0.007, k.seg(8, 4), k.seg(40, 12)), 0, y, 0, PI / 2, 0, 0));
    }
    for (const s of [-1, 1]) k.add('basket', p.mat, T(new THREE.TorusGeometry(0.035, 0.008, k.seg(8, 4), k.seg(16, 8), PI), s * (r0 + (r1 - r0) * 0.82 + 0.01), H * 0.82, 0, 0, s > 0 ? -PI / 2 : PI / 2, 0, [1, 1, 1]));
    if (p.liner && !p.lid) k.lathe('liner', 'fabric-linen-white', [[r1 - 0.022, H - 0.06], [r1 - 0.015, H + 0.01], [r1 + 0.012, H + 0.015], [r1 + 0.018, H - 0.05], [r1 + 0.015, H - 0.07]], 0, 0, 0, { smooth: 10, segs: k.seg(40, 12) });
    if (p.lid) {
      k.lathe('basket', p.mat, [[0, H + 0.035], [r1 * 0.6, H + 0.033], [r1 + 0.006, H + 0.012], [r1 + 0.008, H], [r1 - 0.01, H - 0.002], [0, H + 0.015]], 0, 0, 0, { smooth: 12, segs: k.seg(40, 12) });
      k.add('basket', p.mat, T(new THREE.TorusGeometry(0.025, 0.007, k.seg(8, 4), k.seg(16, 8), PI), 0, H + 0.034, 0, 0, 0, 0));
    }
    return finish(k);
  },
});

const teakStool = item({
  id: 'bath-teak-stool', category: 'bathroom', ko: '티크 욕실 스툴', en: 'Teak bath stool', size: [0.4, 0.46, 0.32],
  params: [P.mat('wood', '목재', 'Wood', 'wood-teak', 'wood'), P.len('height', '높이', 'Height', 0.46, 0.3, 0.5)],
  tags: ['bath stool', 'teak stool', 'shower stool', '욕실 스툴', '티크 의자', '목욕 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.4, D = 0.32, H = p.height, wd = p.wood, n = 5, sw = D / n - 0.008;
    for (let i = 0; i < n; i++) k.box('wood', wd, W, 0.02, sw, 0, H - 0.01, -D / 2 + (D / n) * (i + 0.5), { r: 0.004 });
    const lx = W / 2 - 0.04, lz = D / 2 - 0.035;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('wood', wd, 0.04, H - 0.02, 0.04, sx * lx, (H - 0.02) / 2, sz * lz, { r: 0.004 });
    for (const sz of [-1, 1]) k.box('wood', wd, 2 * lx, 0.045, 0.02, 0, H - 0.045, sz * lz, { r: 0.003 });
    for (const sx of [-1, 1]) k.box('wood', wd, 0.02, 0.045, 2 * lz, sx * lx, H - 0.045, 0, { r: 0.003 });
    for (const sx of [-1, 1]) k.box('wood', wd, 0.022, 0.03, 2 * lz, sx * lx, H * 0.25, 0, { r: 0.003 });
    k.box('wood', wd, 2 * lx, 0.03, 0.022, 0, H * 0.25, 0, { r: 0.003 });
    return finish(k);
  },
});

const stepStool = item({
  id: 'bath-step-stool', category: 'bathroom', ko: '어린이 2단 발판', en: 'Two-step stool', size: [0.4, 0.29, 0.38],
  params: [P.color('color', '색', 'Colour', '#9cc7d9')],
  tags: ['step stool', 'kids step', 'toddler stool', '발판', '어린이 발판', '세면대 발판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.4, o = { overrides: { color: p.color }, flat: 3 };
    k.soft('body', 'plastic-white', W, 0.14, 0.38, 0.03, 0, 0.07, 0, o);
    k.soft('body', 'plastic-white', W, 0.15, 0.2, 0.03, 0, 0.14 + 0.065, -0.09, o);
    for (const [y, z, d] of [[0.141, 0.1, 0.15], [0.281, -0.09, 0.17]]) k.box('grip', 'rubber-black', W - 0.06, 0.004, d, 0, y, z, { r: 0.0015 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('grip', 'rubber-black', 0.05, 0.006, 0.05, sx * (W / 2 - 0.04), 0.002, sz * 0.15, { r: 0.002 });
    // carry hole hint on the riser
    k.box('grip', 'rubber-black', 0.1, 0.022, 0.004, 0, 0.23, 0.011, { r: 0.008 });
    return finish(k);
  },
});

const tallCabinet = item({
  id: 'bath-tall-cabinet', category: 'bathroom', ko: '욕실 키큰장', en: 'Bathroom tall cabinet', size: [0.4, 1.71, 0.36],
  params: [
    P.len('width', '폭', 'Width', 0.4, 0.3, 0.6),
    P.len('height', '높이', 'Height', 1.7, 1.2, 1.9),
    P.mat('front', '도어', 'Fronts', 'paint-white-matte', 'paint'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.pick('base', '받침', 'Base', 'legs', [['legs', '다리', 'Legs'], ['plinth', '걸레받이', 'Plinth']]),
  ],
  tags: ['tall cabinet', 'bathroom storage', 'linen cabinet', '키큰장', '욕실장', '수납장', '타올장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    addCabinet(k, {
      w: p.width, h: p.height, d: 0.32, rows: [{ h: 0.4, n: 1, type: 'door', hinge: 'right' }, { h: 0.17, n: 1, type: 'open' }, { h: 0.43, n: 1, type: 'door', hinge: 'right' }],
      body: p.front, front: p.front, handle: p.handle, handleMat: 'metal-steel', base: p.base, legH: 0.15, legStyle: 'metal', legMat: 'metal-black', plinth: 0.08,
    });
    // folded towels in the open niche
    const bodyH = p.height - (p.base === 'legs' ? 0.15 : 0.08), y = (p.base === 'legs' ? 0.15 : 0.08) + bodyH * 0.4 + 0.018;
    for (let i = 0; i < 2; i++) k.soft('towel', 'fabric-cotton-grey', p.width - 0.1, 0.045, 0.22, 0.02, 0, y + 0.0235 + i * 0.047, -0.02, { puff: 0.004, flat: 3 });
    return finish(k);
  },
});

const overToilet = item({
  id: 'bath-over-toilet-shelf', category: 'bathroom', ko: '변기 위 선반(스페이스 세이버)', en: 'Over-toilet shelf', size: [0.66, 1.72, 0.27],
  params: [
    P.pick('frame', '프레임', 'Frame', 'metal-black', FIN),
    P.mat('shelf', '선반', 'Shelves', 'wood-oak', 'wood'),
  ],
  tags: ['over the toilet', 'space saver', 'etagere', 'bathroom shelf', '변기 선반', '스페이스 세이버', '욕실 선반', '수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.64, D = 0.25, H = 1.7, f = p.frame, xs = W / 2 - 0.012, zs = D / 2 - 0.012;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('frame', f, 0.011, 0.011, H, sx * xs, 0, sz * zs, { segs: k.seg(12, 6) });
      k.cyl('frame', f, 0.016, 0.016, 0.012, sx * xs, 0, sz * zs, { segs: k.seg(12, 6) });
      k.sphere('frame', f, 0.014, sx * xs, H, sz * zs, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    }
    for (const y of [1.0, 1.33, 1.66]) {
      k.box('shelf', p.shelf, W - 0.01, 0.018, D - 0.01, 0, y, 0, { r: 0.003 });
      for (const sx of [-1, 1]) k.rod('frame', f, [sx * xs, y - 0.02, -zs], [sx * xs, y - 0.02, zs], 0.006);
      k.rod('frame', f, [-xs, y + 0.05, -zs], [xs, y + 0.05, -zs], 0.006);
    }
    // side braces low down (a toilet stands between the legs)
    for (const sx of [-1, 1]) k.rod('frame', f, [sx * xs, 0.3, -zs], [sx * xs, 0.3, zs], 0.006);
    k.rod('frame', f, [-xs, 0.75, -zs], [xs, 0.75, -zs], 0.006);
    // some bits on the shelves
    k.soft('towel', 'fabric-cotton-white', 0.26, 0.05, 0.2, 0.022, -0.14, 1.009 + 0.025, 0, { puff: 0.004, flat: 3 });
    k.soft('towel', 'fabric-cotton-white', 0.26, 0.05, 0.2, 0.022, -0.14, 1.009 + 0.075, 0, { puff: 0.004, flat: 3 });
    k.lathe('jar', 'glass-clear', [[0, 0], [0.045, 0], [0.047, 0.004], [0.047, 0.14], [0, 0.14]], 0.15, 1.009, 0, { segs: k.seg(24, 8) });
    k.cyl('cap', 'wood-ash', 0.048, 0.048, 0.02, 0.15, 1.149, 0, { segs: k.seg(24, 8) });
    k.lathe('vase', 'ceramic-matte', [[0, 0], [0.05, 0], [0.06, 0.06], [0.04, 0.14], [0.025, 0.17], [0.03, 0.18], [0, 0.18]], 0.1, 1.339, 0, { smooth: 12, segs: k.seg(24, 8) });
    return finish(k);
  },
});

const bathCaddy = item({
  id: 'bath-bathtub-caddy', category: 'bathroom', ko: '욕조 트레이(대나무)', en: 'Bathtub caddy tray', placement: 'surface', size: [0.75, 0.23, 0.22],
  params: [
    P.len('length', '길이', 'Length', 0.75, 0.65, 1.05),
    P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'),
    P.bool('items', '소품', 'Items', true),
  ],
  tags: ['bath caddy', 'bathtub tray', 'bamboo tray', '욕조 트레이', '욕조 선반', '대나무 트레이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.22, wd = p.wood;
    for (const s of [-1, 1]) k.box('wood', wd, L, 0.025, 0.025, 0, 0.0125, s * (D / 2 - 0.0125), { r: 0.004 });
    const n = Math.round(L / 0.055);
    for (let i = 0; i < n; i++) k.box('wood', wd, 0.035, 0.012, D - 0.05, -L / 2 + 0.03 + ((L - 0.06) * i) / (n - 1), 0.019, 0, { r: 0.003 });
    // stops under the tray that sit inside the tub rim
    for (const s of [-1, 1]) k.box('wood', wd, 0.02, 0.012, D - 0.06, s * (L / 2 - 0.16), -0.006, 0, { r: 0.002 });
    if (p.items) {
      k.lathe('candle', 'ceramic-matte', [[0, 0], [0.035, 0], [0.035, 0.07], [0, 0.07]], -L * 0.3, 0.025, 0.02, { segs: k.seg(20, 8), overrides: { color: '#f2ead8' } });
      k.rod('wick', 'metal-black', [-L * 0.3, 0.095, 0.02], [-L * 0.3, 0.105, 0.02], 0.0015, { segs: 4 });
      k.lathe('glass', 'glass-clear', [[0, 0], [0.032, 0], [0.032, 0.003], [0.004, 0.008], [0.004, 0.09], [0.028, 0.11], [0.04, 0.15], [0.038, 0.2], [0.036, 0.2], [0.038, 0.15], [0.026, 0.112], [0, 0.104]], L * 0.32, 0.025, 0, { smooth: 18, segs: k.seg(24, 8) });
      k.rbox('book', 'book-blue', 0.15, 0.022, 0.2, 0.004, 0, 0.036, 0, { ry: 0.12, segs: 2 });
      k.box('pages', 'paper', 0.142, 0.016, 0.19, 0.004, 0.036, 0, { ry: 0.12, r: 0.001 });
    }
    return finish(k);
  },
});

const hairDryer = item({
  id: 'bath-hair-dryer-holder', category: 'bathroom', ko: '헤어드라이어 + 거치대', en: 'Hair dryer on wall holder', placement: 'wall', elevation: 1.1, size: [0.11, 0.28, 0.28],
  params: [P.mat('body', '드라이어', 'Dryer', 'plastic-black', 'plastic'), P.pick('finish', '거치대', 'Holder', 'metal-chrome', FIN)],
  tags: ['hair dryer', 'dryer holder', '헤어드라이어', '드라이기', '드라이기 거치대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const zr = 0.08, f = p.finish;
    // nozzle-down barrel through the ring, handle out to the front
    k.lathe('dryer', p.body, [[0, 0.02], [0.022, 0.02], [0.026, 0.05], [0.04, 0.1], [0.045, 0.2], [0.043, 0.25], [0.03, 0.27], [0, 0.272]], 0, 0, zr, { smooth: 18, segs: k.seg(28, 10) });
    k.soft('dryer', p.body, 0.036, 0.04, 0.15, 0.016, 0, 0.215, zr + 0.11, { rx: 0.25, flat: 2 });
    k.box('switch', 'metal-chrome', 0.012, 0.004, 0.03, 0, 0.237, zr + 0.11, { rx: 0.25, r: 0.0015 });
    // holder: wall plate + arm + ring
    k.box('holder', f, 0.09, 0.07, 0.012, 0, 0.19, 0.006, { r: 0.004 });
    k.box('holder', f, 0.02, 0.012, zr - 0.04, 0, 0.19, (zr - 0.04) / 2 + 0.01, { r: 0.003 });
    k.add('holder', f, T(new THREE.TorusGeometry(0.048, 0.006, k.seg(8, 4), k.seg(32, 10)), 0, 0.19, zr, PI / 2, 0, 0));
    // coiled cord hanging from the handle
    const pts = [];
    const cx = 0.0, cz = zr + 0.19;
    for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * PI * 2 * 9; pts.push([cx + Math.cos(a) * 0.012, 0.17 - t * 0.17, cz + Math.sin(a) * 0.012 - t * 0.02]); }
    k.tube('cord', 'plastic-black', [[0, 0.2, zr + 0.18], [0, 0.18, zr + 0.19], ...pts.slice(4)], 0.0035, { segs: k.seg(200, 60), radial: k.seg(6, 3) });
    return finish(k);
  },
});

const bathScale = item({
  id: 'bath-scale', category: 'bathroom', ko: '체중계(유리)', en: 'Glass bathroom scale', size: [0.3, 0.027, 0.3],
  params: [P.mat('base', '바닥판', 'Base', 'plastic-white', 'plastic')],
  tags: ['scale', 'bathroom scale', 'weighing scale', '체중계', '저울', '욕실 체중계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.012, 0.014, 0.005, sx * 0.11, 0, sz * 0.11, { segs: k.seg(12, 6) });
    k.rbox('base', p.base, 0.3, 0.014, 0.3, 0.012, 0, 0.012, 0, { segs: 3 });
    k.rbox('glass', 'glass-tinted', 0.3, 0.006, 0.3, 0.003, 0, 0.022, 0, { segs: 2 });
    k.box('display', 'screen-black', 0.08, 0.001, 0.035, 0, 0.0255, 0.1, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('pads', 'metal-steel', 0.06, 0.001, 0.07, sx * 0.075, 0.0255, sz * 0.05 - 0.01, { r: 0 });
    return finish(k);
  },
});

const towelStack = item({
  id: 'bath-towel-stack', category: 'bathroom', ko: '개어 놓은 수건', en: 'Stack of folded towels', placement: 'surface', size: [0.32, 0.19, 0.26],
  params: [
    P.int('count', '장 수', 'Count', 4, 1, 7),
    P.mat('fabric', '천', 'Fabric', 'fabric-cotton-white', 'fabric'),
    P.bool('rolled', '롤 수건 추가', 'Rolled towel on top', false),
  ],
  tags: ['towels', 'folded towels', 'towel stack', 'linen', '수건', '타월', '개어 놓은 수건'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = 0.045;
    for (let i = 0; i < p.count; i++) {
      const dx = ((i * 37) % 7 - 3) * 0.002, ry = ((i * 53) % 5 - 2) * 0.012;
      k.soft('towel', p.fabric, 0.32, h, 0.25, 0.021, dx, h / 2 + i * (h - 0.002), 0, { puff: 0.005, flat: 3, ry });
    }
    if (p.rolled) {
      const y = p.count * (h - 0.002);
      k.lathe('towel', p.fabric, [[0, 0], [0.035, 0], [0.04, 0.008], [0.04, 0.17], [0.035, 0.178], [0, 0.178]], -0.089, y + 0.04, 0, { rz: -PI / 2, segs: k.seg(24, 8) });
    }
    return finish(k);
  },
});

const towelLadder = item({
  id: 'bath-towel-ladder', category: 'bathroom', ko: '기대는 수건 사다리', en: 'Leaning towel ladder', size: [0.42, 1.6, 0.36],
  params: [
    P.len('height', '높이', 'Height', 1.6, 1.2, 1.9),
    P.mat('wood', '목재', 'Wood', 'wood-ash', 'wood'),
    P.bool('towels', '수건', 'Towels', true),
  ],
  tags: ['towel ladder', 'blanket ladder', 'leaning ladder', '수건 사다리', '사다리 선반', '수건걸이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, w = 0.42, z0 = 0.17, z1 = -0.17, len = Math.hypot(H, z0 - z1), ang = Math.atan2(z1 - z0, H);
    for (const s of [-1, 1]) k.box('wood', p.wood, 0.035, len, 0.024, s * (w / 2 - 0.0175), H / 2, 0, { rx: ang, r: 0.004 });
    const n = Math.max(3, Math.round(H / 0.32));
    const rungs = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.7) / (n + 0.2), y = t * H, z = z0 + (z1 - z0) * t;
      rungs.push([y, z]);
      k.rod('wood', p.wood, [-w / 2 + 0.03, y, z], [w / 2 - 0.03, y, z], 0.012, { segs: k.seg(12, 6) });
    }
    // feet rubbers
    for (const s of [-1, 1]) k.box('feet', 'rubber-black', 0.036, 0.008, 0.03, s * (w / 2 - 0.0175), 0.004, z0 - 0.002, { r: 0.002 });
    if (p.towels) {
      const [y2, zz2] = rungs[n - 2], [y1, zz1] = rungs[Math.max(0, n - 4)];
      towel(k, 0, y2 + 0.003, zz2, w * 0.72, 0.42);
      towel(k, 0, y1 + 0.003, zz1, w * 0.68, 0.3);
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- variants */

const toiletBase = BASE.find((e) => e.id === 'toilet');
const bathtubBase = BASE.find((e) => e.id === 'bathtub');

const VARIANTS = [
  variant(toiletBase, 'wall-hung', '벽걸이 양변기(매립 수조)', 'Wall-hung toilet', { type: 'wallHung' }, { tags: ['wall-hung', '벽걸이 변기', '매립 수조'] }),
  variant(bathtubBase, 'built-in', '매립형 욕조', 'Built-in bathtub', { type: 'builtin' }, { tags: ['built-in bath', '매립 욕조'] }),
  variant(closeCoupled, 'bidet', '비데 시트 투피스 변기', 'Close-coupled toilet with bidet seat', { bidetSeat: true }, { tags: ['bidet seat', '비데 시트', '전자 비데'] }),
  variant(ledMirror, 'rect', 'LED 거울(사각)', 'LED mirror (rectangle)', { shape: 'rect', width: 0.8, height: 0.7 }, { tags: ['rectangular mirror', '사각 거울'] }),
  variant(ledMirror, 'pill', 'LED 거울(캡슐형)', 'LED mirror (pill)', { shape: 'pill', width: 0.5, height: 0.9, tone: 'cool' }, { tags: ['pill mirror', '캡슐 거울'] }),
  variant(vesselBasin, 'rect-black', '사각 탑볼(블랙 마블)', 'Rectangular vessel basin (black marble)', { shape: 'rect', width: 0.5, height: 0.12, mat: 'marble-black' }, { tags: ['marble basin', '대리석 세면기'] }),
  variant(floatingVanity, 'double-walnut', '이중 벽걸이 세면대(월넛)', 'Double floating vanity (walnut)', { width: 1.2, basins: 2, front: 'wood-walnut', finish: 'metal-black' }, { tags: ['double vanity', '이중 세면대', '월넛'] }),
  variant(clawfootTub, 'black', '클로풋 욕조(블랙·브라스)', 'Clawfoot bathtub (black & brass)', { outside: 'paint-black-matte', finish: 'metal-brass' }, { tags: ['black bath', '블랙 욕조', '브라스'] }),
  variant(stoneTub, 'concrete', '콘크리트 욕조(라운드)', 'Concrete bathtub (rounded)', { mat: 'concrete', shape: 'round', length: 1.6 }, { tags: ['concrete bath', '콘크리트 욕조'] }),
  variant(showerTray, 'black', '샤워 트레이(블랙 스톤)', 'Shower tray (black stone)', { mat: 'marble-black', drain: 'round', width: 0.9, depth: 0.9 }, { tags: ['black tray', '블랙 트레이'] }),
  variant(quadrant, 'black', '라운드 샤워부스(블랙)', 'Quadrant shower enclosure (black)', { frame: 'metal-black', size: 1.0 }, { tags: ['black frame', '블랙 프레임'] }),
  variant(tallCabinet, 'oak', '욕실 키큰장(오크)', 'Bathroom tall cabinet (oak)', { front: 'wood-oak', handle: 'edge', base: 'plinth' }, { tags: ['oak', '오크'] }),
  variant(towelStack, 'grey', '개어 놓은 수건(그레이)', 'Folded towels (grey)', { fabric: 'fabric-cotton-grey', count: 3, rolled: true }, { tags: ['grey towels', '회색 수건'] }),
  variant(bathMat, 'oval', '욕실 매트(타원)', 'Oval bath mat', { shape: 'round', width: 0.75, depth: 0.5, fabric: 'fabric-linen-beige' }, { tags: ['oval mat', '타원 매트'] }),
  variant(laundryBasket, 'open', '빨래 바구니(오픈·면 주머니)', 'Laundry basket (open, liner)', { lid: false, liner: true, mat: 'fabric-linen-grey' }, { tags: ['fabric basket', '패브릭 바구니'] }),
  variant(archMirror, 'black', '아치형 거울(블랙)', 'Arched mirror (black)', { frame: 'metal-black', width: 0.6, height: 1.2 }, { tags: ['black frame', '블랙 프레임'] }),
];

export const ITEMS = [
  closeCoupled, wallHungSquare, smartToilet, bidet, urinal,
  pedestalBasin, wallBasin, floatingVanity, classicVanity, cornerBasin, consoleBasin, vesselBasin, troughBasin,
  clawfootTub, cornerTub, alcoveTub, hinokiTub, stoneTub,
  crittallScreen, quadrant, showerTray, ceilingShower, showerBaskets, showerBench, showerCurtain,
  towelRing, hookRail, rollHolder, rollStand, toiletBrush, vanitySet, glassShelf, cornerShelf,
  ledMirror, archMirror, medicineCabinet, bathMat, laundryBasket, teakStool, stepStool, tallCabinet,
  overToilet, bathCaddy, hairDryer, bathScale, towelStack, towelLadder,
  ...VARIANTS,
];
