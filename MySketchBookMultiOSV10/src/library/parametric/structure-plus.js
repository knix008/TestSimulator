// Structure & finishes, part 4: classical / Korean / steel columns, ceiling systems (glulam
// arch, open-web joist, waffle slab, joists, tray, barrel vault, suspended grid, baffles,
// backlit membrane, hanok rafters), wall finishes (frame mouldings, shiplap, beadboard, tile
// wainscot, shadow-gap skirting, egg-and-dart cornice, architrave set, 3D panels), wall
// elements and partitions, arches, floors and levels, stairs and railings, fireplaces,
// and building services. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, clamp, frameShape, gridGeo, rng } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { latheMod, archOutline } from './structure-more.js';
import { withMatrix, pivot } from './openings.js';

const PI = Math.PI;
const DEG = PI / 180;
const V2 = (x, y) => new THREE.Vector2(x, y);
const shapeOf = (pts) => new THREE.Shape(pts.map(([x, y]) => V2(x, y)));
const S = (def) => mk({ category: 'structure', ...def });

/* ---------------------------------------------------------------- helpers */

/** A closed profile [[z, y], …] extruded along x, length L centred on x (mouldings, stringers, corbels). */
function alongX(k, role, mat, pts, L, o = {}) {
  const geo = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: L, bevelEnabled: false, curveSegments: k.seg(12, 4) });
  geo.rotateY(-PI / 2); // shape x → +z, extrusion → −x
  geo.translate(L / 2 + (o.x ?? 0), o.y ?? 0, o.z ?? 0);
  return k.add(role, mat, geo, o);
}

/** Lathe shaft between ya and yb with radius rf(t); `mod(r, theta, t)` reshapes it (flutes, twist). */
function shaft(k, role, mat, ya, yb, rf, mod = null, o = {}) {
  const N = o.rows ?? k.seg(12, 5);
  const prof = [[0, ya]];
  for (let i = 0; i <= N; i++) { const t = i / N; prof.push([rf(t), ya + (yb - ya) * t]); }
  prof.push([0, yb]);
  const segs = o.segs ?? k.seg(32, 10);
  if (!mod) return k.lathe(role, mat, prof, o.x ?? 0, 0, o.z ?? 0, { segs });
  return latheMod(k, role, mat, prof, segs, (r, th, y) => [mod(r, th, (y - ya) / (yb - ya)), y], o.x ?? 0, 0, o.z ?? 0);
}

/** Attic column base (torus – scotia – torus) from y0; returns its top. */
function atticBase(k, role, mat, r, y0, x = 0, z = 0) {
  const h = Math.max(0.09, r * 0.8);
  const pr = [[0, y0], [r * 1.34, y0], [r * 1.36, y0 + h * 0.12], [r * 1.32, y0 + h * 0.3], [r * 1.2, y0 + h * 0.38], [r * 1.12, y0 + h * 0.55], [r * 1.18, y0 + h * 0.68], [r * 1.14, y0 + h * 0.82], [r * 1.04, y0 + h * 0.92], [r, y0 + h], [0, y0 + h]];
  k.lathe(role, mat, pr, x, 0, z, { segs: k.seg(32, 10) });
  return y0 + h;
}

/** Faceted prism (n sides) with flat shading, bottom at y. */
function prism(k, role, mat, rTop, rBot, h, n, x = 0, y = 0, z = 0, o = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, n, 1).toNonIndexed();
  g.computeVertexNormals();
  g.rotateY(o.ry ?? PI / n);
  g.translate(x, y + h / 2, z);
  return k.add(role, mat, g, o);
}

/** Box whose x/z size changes from bottom (w0, d0) to top (w1, d1); bottom at y. */
function taperBox(k, role, mat, w0, w1, d0, d1, h, x = 0, y = 0, z = 0, o = {}) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5;
    p.setXYZ(i, p.getX(i) * (w0 + (w1 - w0) * t), t * h, p.getZ(i) * (d0 + (d1 - d0) * t));
  }
  g.computeVertexNormals();
  g.translate(x, y, z);
  return k.add(role, mat, g, o);
}

/** A row of flame tongues + a glow light (no logs), centred at (cx, y0, z), `w` wide. */
function flameRow(k, cx, y0, z, w, maxH, depthScale = 0.4) {
  const n = Math.max(3, Math.round(w / 0.1));
  for (let i = 0; i < n; i++) {
    const fx = cx - w / 2 + 0.04 + (w - 0.08) * (i / (n - 1));
    const fh = Math.min(maxH, 0.08 + 0.08 * Math.abs(Math.sin(i * 2.1 + 0.4)));
    k.lathe('flame', 'light-warm', [[0, 0], [0.03, 0.012], [0.028, fh * 0.35], [0.012, fh * 0.75], [0, fh]], fx, y0, z, { smooth: 10, segs: k.seg(10, 5), scale: [1, 1, depthScale], overrides: { color: '#ffb060', emissive: '#ff7a1a', emissiveIntensity: 1.6 } });
  }
  k.light(cx, y0 + 0.15, z + 0.05, { color: '#ff9a4a', intensity: 1.2, distance: 5 });
}

/** A wall W × H × T with a doorway (outline from (half, 0) over the head to (−half, 0)) notched out. */
function openingWall(k, role, mat, W, H, T, opening, z = 0) {
  const pts = [[-W / 2, 0], ...opening.slice().reverse(), [W / 2, 0], [W / 2, H], [-W / 2, H]];
  k.panel(role, mat, shapeOf(pts), T, 0, 0, z, { bevel: 0.003 });
}

/** A band between two doorway outlines (outer and inner, both (half, 0) → over → (−half, 0)). */
function bandShape(outer, inner) {
  return shapeOf([...outer, ...inner.slice().reverse()]);
}

/** Rectangle with rectangular holes ([x, y, w, h] centred). */
function rectWithHoles(W, H, holes, x0 = 0) {
  const s = shapeOf([[x0 - W / 2, 0], [x0 + W / 2, 0], [x0 + W / 2, H], [x0 - W / 2, H]]);
  for (const [x, y, w, h] of holes) s.holes.push(new THREE.Path([V2(x - w / 2, y - h / 2), V2(x - w / 2, y + h / 2), V2(x + w / 2, y + h / 2), V2(x + w / 2, y - h / 2)]));
  return s;
}

/** Box lining of a rectangular recess: back + 4 sides, opening at z = zf, recess depth d (into −z). */
function recess(k, role, mat, x, y, w, h, zf, d, backRole = role, backMat = mat) {
  const t = 0.012, zc = zf - d / 2;
  k.box(backRole, backMat, w, h, t, x, y, zf - d + t / 2, { r: 0 });
  for (const s of [-1, 1]) {
    k.box(role, mat, t, h, d, x + s * (w / 2 - t / 2), y, zc, { r: 0 });
    k.box(role, mat, w, t, d, x, y + s * (h / 2 - t / 2), zc, { r: 0 });
  }
}

const H_PARAM = (def = 2.6, min = 2.0, max = 4.0) => P.len('height', '높이', 'Height', def, min, max);

/* ================================================================ columns */

function leafPanel(k, role, mat, rb, y0, ang, w, h, tilt, curl = 1.0) {
  const g = new THREE.BoxGeometry(w, h, 0.012);
  g.translate(0, h / 2, 0); g.rotateX(tilt);
  const tip = new THREE.BoxGeometry(w * 0.7, h * 0.32, 0.01);
  tip.translate(0, h * 0.16, 0); tip.rotateX(tilt + curl); tip.translate(0, h * Math.cos(tilt), h * Math.sin(tilt));
  for (const geo of [g, tip]) { geo.rotateY(ang); geo.translate(rb * Math.sin(ang), y0, rb * Math.cos(ang)); k.add(role, mat, geo); }
}

const corinthian = S({
  id: 'st-column-corinthian', ko: '코린트식 기둥', en: 'Corinthian column',
  params: [H_PARAM(2.6), P.len('radius', '반지름', 'Radius', 0.14, 0.09, 0.28), P.mat('stone', '재질', 'Material', 'marble-white', 'stone'), P.bool('fluted', '세로홈', 'Fluted', true)],
  tags: ['column', 'corinthian column', 'classical column', 'acanthus', '기둥', '코린트식 기둥', '고전 기둥', '아칸서스'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.radius, H = p.height, m = p.stone;
    const pl = 0.08;
    k.box('base', m, r * 2.9, pl, r * 2.9, 0, pl / 2, 0, { r: 0.004 });
    const yb = atticBase(k, 'base', m, r, pl);
    const ab = Math.max(0.045, r * 0.3), capH = r * 2.1, yc = H - ab - capH, rt = r * 0.86;
    shaft(k, 'shaft', m, yb, yc, (t) => r * (1 - 0.14 * t ** 1.5), p.fluted ? (rr, th) => rr - r * 0.07 * (1 - (0.5 + 0.5 * Math.cos(24 * th)) ** 4) : null, { rows: 8, segs: p.fluted ? k.seg(144, 48) : k.seg(32, 10) });
    k.add('base', m, new THREE.TorusGeometry(rt * 1.02, r * 0.06, k.seg(8, 4), k.seg(32, 10)).rotateX(PI / 2).translate(0, yc, 0));
    k.lathe('capital', m, [[0, yc], [rt, yc], [rt * 1.02, yc + capH * 0.3], [rt * 1.1, yc + capH * 0.7], [r * 1.25, yc + capH], [0, yc + capH]], 0, 0, 0, { segs: k.seg(32, 10) });
    const lw = ((2 * PI * rt) / 8) * 0.95;
    for (let i = 0; i < 8; i++) {
      leafPanel(k, 'leaves', m, rt * 0.98, yc + 0.01, (i * PI) / 4, lw, capH * 0.42, 0.14, 1.1);
      leafPanel(k, 'leaves', m, rt * 1.0, yc + capH * 0.14, ((i + 0.5) * PI) / 4, lw, capH * 0.55, 0.2, 1.0);
    }
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2;
      k.add('leaves', m, new THREE.TorusGeometry(capH * 0.12, r * 0.035, k.seg(6, 4), k.seg(16, 8)).rotateY(a).translate(r * 1.28 * Math.sin(a), yc + capH * 0.8, r * 1.28 * Math.cos(a)));
      const b = (i * PI) / 2;
      k.sphere('leaves', m, r * 0.09, r * 1.38 * Math.sin(b), H - ab / 2, r * 1.38 * Math.cos(b), { segs: k.seg(10, 6), rings: k.seg(6, 4) });
    }
    k.box('capital', m, r * 2.75, ab, r * 2.75, 0, H - ab / 2, 0, { r: 0.006 });
    return finish(k);
  },
});

/** Tuscan column at (x, z): square plinth, torus base, plain tapered shaft, echinus + abacus. */
function tuscan(k, m, r, H, x = 0, z = 0) {
  const pl = 0.1, bh = r * 0.55;
  k.box('base', m, r * 2.7, pl, r * 2.7, x, pl / 2, z, { r: 0.004 });
  k.lathe('base', m, [[0, pl], [r * 1.3, pl], [r * 1.34, pl + bh * 0.4], [r * 1.25, pl + bh * 0.85], [r * 1.05, pl + bh * 0.95], [r, pl + bh], [0, pl + bh]], x, 0, z, { segs: k.seg(32, 10) });
  const ab = Math.max(0.05, r * 0.4), ech = r * 0.45, yc = H - ab - ech, rt = r * 0.82;
  shaft(k, 'shaft', m, pl + bh, yc, (t) => r * (1 - 0.18 * t ** 1.6), null, { x, z });
  k.add('base', m, new THREE.TorusGeometry(rt * 1.04, r * 0.05, k.seg(8, 4), k.seg(32, 10)).rotateX(PI / 2).translate(x, yc - r * 0.35, z));
  k.lathe('capital', m, [[0, yc], [rt, yc], [rt * 1.06, yc + ech * 0.2], [r * 1.18, yc + ech * 0.75], [r * 1.25, yc + ech], [0, yc + ech]], x, 0, z, { segs: k.seg(32, 10) });
  k.box('capital', m, r * 2.7, ab, r * 2.7, x, H - ab / 2, z, { r: 0.005 });
}

const tuscanCol = S({
  id: 'st-column-tuscan', ko: '토스카나식 기둥', en: 'Tuscan column',
  params: [H_PARAM(2.6), P.len('radius', '반지름', 'Radius', 0.15, 0.09, 0.3), P.mat('mat', '마감', 'Finish', 'wall-plaster')],
  tags: ['column', 'tuscan column', 'classical column', 'plain column', '기둥', '토스카나 기둥', '고전 기둥', '원기둥'],
  build: (p, ctx) => { const k = new Kit(ctx); tuscan(k, p.mat, p.radius, p.height); return finish(k); },
});

const solomonic = S({
  id: 'st-column-solomonic', ko: '나선 꼬임 기둥(솔로몬 기둥)', en: 'Twisted Solomonic column',
  params: [H_PARAM(2.6, 2.0, 3.6), P.len('radius', '반지름', 'Radius', 0.12, 0.08, 0.22), P.int('turns', '꼬임 수', 'Turns', 5, 3, 8), P.mat('wood', '재질', 'Material', 'wood-dark'), P.mat('gilt', '장식 띠', 'Gilt bands', 'metal-gold', 'metal')],
  tags: ['column', 'twisted column', 'solomonic column', 'barley twist', 'baroque', '기둥', '꼬임 기둥', '나선 기둥', '바로크'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.radius, H = p.height, m = p.wood;
    const ped = 0.32;
    k.box('base', m, r * 3, ped - 0.04, r * 3, 0, (ped - 0.04) / 2, 0, { r: 0.005 });
    k.box('base', m, r * 3.3, 0.04, r * 3.3, 0, ped - 0.02, 0, { r: 0.006 });
    const yb = atticBase(k, 'base', m, r, ped);
    const capH = r * 1.6, ab = 0.05, yc = H - ab - capH, turns = clamp(Math.round(p.turns), 3, 8);
    shaft(k, 'shaft', m, yb, yc, () => r * 0.82, (rr, th, t) => rr * (1 + 0.24 * Math.cos(th - t * turns * 2 * PI)), { rows: k.seg(turns * 12, turns * 5), segs: k.seg(28, 12) });
    for (const y of [yb + 0.01, yc - 0.01]) k.add('gilt', p.gilt, new THREE.TorusGeometry(r * 1.02, r * 0.07, k.seg(8, 4), k.seg(28, 10)).rotateX(PI / 2).translate(0, y, 0));
    k.lathe('capital', m, [[0, yc], [r * 0.95, yc], [r * 1.0, yc + capH * 0.3], [r * 1.15, yc + capH * 0.75], [r * 1.35, yc + capH], [0, yc + capH]], 0, 0, 0, { segs: k.seg(28, 10) });
    k.add('gilt', p.gilt, new THREE.TorusGeometry(r * 1.12, r * 0.05, k.seg(8, 4), k.seg(28, 10)).rotateX(PI / 2).translate(0, yc + capH * 0.55, 0));
    k.box('capital', m, r * 2.9, ab, r * 2.9, 0, H - ab / 2, 0, { r: 0.006 });
    return finish(k);
  },
});

const hanokPillar = S({
  id: 'st-column-hanok', ko: '한옥 배흘림기둥(주춧돌)', en: 'Hanok entasis pillar on stone base',
  params: [H_PARAM(2.7, 2.2, 3.6), P.len('radius', '반지름', 'Radius', 0.14, 0.1, 0.22), P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'), P.mat('stone', '주춧돌', 'Base stone', 'granite-grey', 'stone')],
  tags: ['hanok', 'korean pillar', 'timber column', 'entasis', '한옥', '배흘림기둥', '주춧돌', '나무 기둥', '전통 기둥'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.radius, H = p.height, w = p.wood;
    const sh = 0.26;
    latheMod(k, 'stone', p.stone, [[0, 0], [r * 2.3, 0], [r * 2.4, 0.05], [r * 2.2, 0.16], [r * 1.7, 0.24], [r * 1.3, sh], [0, sh]], k.seg(24, 10), (rr, th, y) => [rr * (1 + 0.07 * Math.sin(3 * th + 1) + 0.05 * Math.sin(5 * th + y * 9)), y]);
    const yd = H - 0.3;
    shaft(k, 'pillar', w, sh, yd, (t) => r * (0.86 + 0.14 * Math.sin(PI / 2 + (t - 1 / 3) * PI * 0.7)), null, { rows: k.seg(14, 6) });
    // 주두 (bracket block): a tapered square bowl under a flat block, then the crossing beam heads
    const s = r * 2.6;
    k.cyl('block', w, s / Math.SQRT2, (s * 0.72) / Math.SQRT2, 0.08, 0, yd, 0, { segs: 4, ry: PI / 4 });
    k.box('block', w, s, 0.07, s, 0, yd + 0.115, 0, { r: 0.004 });
    k.box('beams', w, s * 2.6, 0.15, r * 1.6, 0, H - 0.075, 0, { r: 0.008 });
    k.box('beams', w, r * 1.4, 0.13, s * 2.2, 0, H - 0.085, 0, { r: 0.008 });
    return finish(k);
  },
});

const kneeBrace = S({
  id: 'st-post-knee-brace', ko: '가새 목조 기둥(보 받침)', en: 'Timber post with knee braces',
  params: [H_PARAM(2.6, 2.2, 3.6), P.len('post', '기둥 굵기', 'Post size', 0.15, 0.1, 0.25), P.len('span', '보 길이', 'Beam length', 1.4, 0.8, 2.4), P.bool('fourWay', '4방향 가새', 'Four-way braces', false), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood')],
  tags: ['post', 'knee brace', 'timber frame', 'beam', '기둥', '가새', '목구조', '보 받침', '중목구조'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.post, H = p.height, bd = s * 1.3, L = p.span, br = Math.min(0.45, L / 2 - s / 2 - 0.05), w = p.wood;
    k.box('timber', w, s, H - bd, s, 0, (H - bd) / 2, 0, { r: 0.004 });
    k.box('timber', w, L, bd, s, 0, H - bd / 2, 0, { r: 0.004 });
    if (p.fourWay) k.box('timber', w, s * 0.95, bd * 0.9, L, 0, H - bd * 0.45, 0, { r: 0.004 });
    const dirs = [[1, 0], [-1, 0], ...(p.fourWay ? [[0, 1], [0, -1]] : [])];
    const len = br * Math.SQRT2 + s * 0.3;
    for (const [dx, dz] of dirs) {
      const off = s / 2 + br / 2, y = H - bd - br / 2;
      k.box('timber', w, s * 0.7, len, s * 0.7, dx * off, y, dz * off, { r: 0.003, rz: -dx * PI / 4, rx: dz * PI / 4 });
    }
    k.box('shoe', 'metal-black', s + 0.03, 0.1, s + 0.03, 0, 0.05, 0, { r: 0.003 });
    k.box('shoe', 'metal-black', s + 0.14, 0.008, s + 0.14, 0, 0.004, 0, { r: 0.002 });
    return finish(k);
  },
});

const castIron = S({
  id: 'st-column-cast-iron', ko: '주철 기둥(브래킷 주두)', en: 'Cast-iron column with brackets',
  params: [H_PARAM(3.0, 2.4, 4.5), P.len('radius', '반지름', 'Radius', 0.07, 0.05, 0.12), P.mat('metal', '금속', 'Metal', 'metal-black', 'metal')],
  tags: ['cast iron column', 'industrial column', 'warehouse', 'loft', '주철 기둥', '철 기둥', '공장', '로프트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.radius, H = p.height, m = p.metal;
    k.lathe('base', m, [[0, 0], [r * 2.6, 0], [r * 2.6, 0.05], [r * 2.2, 0.08], [r * 2.3, 0.12], [r * 1.6, 0.2], [r * 1.3, 0.32], [r * 1.5, 0.36], [r * 1.1, 0.4], [0, 0.4]], 0, 0, 0, { segs: k.seg(24, 8) });
    shaft(k, 'shaft', m, 0.4, H - 0.35, (t) => r * (1 - 0.1 * t), (rr, th) => rr - r * 0.12 * (1 - (0.5 + 0.5 * Math.cos(8 * th)) ** 4), { rows: 6, segs: k.seg(48, 16) });
    k.lathe('base', m, [[0, H - 0.35], [r * 0.95, H - 0.35], [r * 1.4, H - 0.3], [r * 1.1, H - 0.25], [r * 1.6, H - 0.12], [r * 2.2, H - 0.05], [0, H - 0.05]], 0, 0, 0, { segs: k.seg(24, 8) });
    k.box('base', m, r * 4.4, 0.05, r * 4.4, 0, H - 0.025, 0, { r: 0.004 });
    for (const dx of [-1, 1]) {
      k.tube('base', m, [[dx * r * 1.1, H - 0.55, 0], [dx * 0.13, H - 0.42, 0], [dx * 0.23, H - 0.22, 0], [dx * 0.34, H - 0.08, 0], [dx * 0.37, H - 0.05, 0]], 0.012, { radial: k.seg(8, 4) });
      k.add('base', m, new THREE.TorusGeometry(0.035, 0.01, k.seg(6, 4), k.seg(14, 8)).translate(dx * (r * 1.1 + 0.03), H - 0.56, 0));
    }
    k.box('base', m, 0.8, 0.02, 0.1, 0, H - 0.04, 0, { r: 0.003 });
    return finish(k);
  },
});

const craftsman = S({
  id: 'st-column-craftsman', ko: '크래프츠맨 테이퍼 기둥(받침대)', en: 'Craftsman tapered column on pedestal',
  params: [H_PARAM(2.4, 2.0, 3.2), P.len('pedestal', '받침 높이', 'Pedestal height', 0.9, 0.4, 1.2), P.len('width', '폭', 'Width', 0.42, 0.3, 0.6), P.mat('pedMat', '받침', 'Pedestal', 'wall-brick-red'), P.mat('colMat', '기둥', 'Column', 'paint-white-matte')],
  tags: ['craftsman column', 'tapered column', 'porch column', 'pedestal', '기둥', '테이퍼 기둥', '크래프츠맨', '받침 기둥'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, ped = Math.min(p.pedestal, H - 0.8), c = p.colMat;
    k.box('pedestal', p.pedMat, W, ped - 0.05, W, 0, (ped - 0.05) / 2, 0, { r: 0.004 });
    k.box('trim', c, W + 0.06, 0.05, W + 0.06, 0, ped - 0.025, 0, { r: 0.006 });
    taperBox(k, 'shaft', c, W * 0.74, W * 0.56, W * 0.74, W * 0.56, H - 0.2 - ped, 0, ped, 0);
    k.box('trim', c, W * 0.64, 0.12, W * 0.64, 0, H - 0.14, 0, { r: 0.004 });
    k.box('trim', c, W * 0.74, 0.08, W * 0.74, 0, H - 0.04, 0, { r: 0.006 });
    return finish(k);
  },
});

const pipeCol = S({
  id: 'st-column-pipe', ko: '원형 강관 기둥(베이스 플레이트)', en: 'Round steel pipe column',
  params: [H_PARAM(2.6, 2.0, 4.0), P.len('diameter', '지름', 'Diameter', 0.168, 0.1, 0.3), P.mat('paint', '도장', 'Paint', 'paint-grey-matte'), P.mat('plates', '플레이트', 'Plates', 'metal-steel', 'metal')],
  tags: ['steel column', 'pipe column', 'lally column', 'base plate', '강관 기둥', '철골 기둥', '원형 기둥', '베이스 플레이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx), r = p.diameter / 2, H = p.height, side = p.diameter + 0.18, pm = p.plates;
    k.cyl('pipe', p.paint, r, r, H - 0.04, 0, 0.02, 0, { segs: k.seg(28, 10) });
    for (const y of [0.01, H - 0.01]) k.box('plates', pm, side, 0.02, side, 0, y, 0, { r: 0.002 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (side / 2 - 0.035), z = sz * (side / 2 - 0.035);
      k.cyl('plates', pm, 0.012, 0.012, 0.018, x, 0.02, z, { segs: 6 });
      k.cyl('plates', pm, 0.006, 0.006, 0.035, x, 0.02, z, { segs: k.seg(8, 5) });
    }
    const gb = shapeOf([[r, 0], [r + 0.07, 0], [r, 0.11]]), gt = shapeOf([[r, 0], [r, 0.11], [r + 0.07, 0.11]]);
    for (let i = 0; i < 4; i++) {
      k.panel('plates', pm, gb, 0.01, 0, 0.02, 0, { ry: (i * PI) / 2, bevel: 0 });
      k.panel('plates', pm, gt, 0.01, 0, H - 0.13, 0, { ry: (i * PI) / 2, bevel: 0 });
    }
    return finish(k);
  },
});

const octMosaic = S({
  id: 'st-column-octagon-mosaic', ko: '팔각 모자이크 타일 기둥', en: 'Octagonal mosaic-tiled column',
  params: [H_PARAM(2.6, 2.0, 3.6), P.len('width', '폭', 'Width', 0.4, 0.28, 0.7), P.mat('tiles', '타일', 'Tiles', 'tile-mosaic-blue'), P.mat('trim', '받침·머리', 'Base & cap', 'marble-white'), P.mat('bands', '띠', 'Bands', 'metal-brass', 'metal')],
  tags: ['octagonal column', 'mosaic column', 'tiled pillar', 'moroccan', '팔각 기둥', '모자이크 기둥', '타일 기둥', '기둥'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, R = p.width / 2 / Math.cos(PI / 8);
    prism(k, 'trim', p.trim, R * 1.2, R * 1.2, 0.18, 8, 0, 0, 0);
    prism(k, 'trim', p.trim, R * 1.06, R * 1.12, 0.06, 8, 0, 0.18, 0);
    prism(k, 'shaft', p.tiles, R, R, H - 0.24 - 0.2, 8, 0, 0.24, 0);
    prism(k, 'trim', p.trim, R * 1.18, R * 1.04, 0.1, 8, 0, H - 0.2, 0);
    prism(k, 'trim', p.trim, R * 1.22, R * 1.22, 0.1, 8, 0, H - 0.1, 0);
    for (const t of [0.33, 0.66]) prism(k, 'bands', p.bands, R * 1.012, R * 1.012, 0.02, 8, 0, 0.24 + (H - 0.44) * t, 0);
    return finish(k);
  },
});

/* =============================================================== ceilings */

const glulam = S({
  id: 'st-beam-glulam-arch', placement: 'ceiling', elevation: 1.9, ko: '곡선 집성목 아치 보', en: 'Curved glulam arch beam',
  params: [P.len('span', '스팬', 'Span', 4.0, 2.0, 8.0), P.len('rise', '라이즈', 'Rise', 0.6, 0.2, 1.5), P.len('depth', '춤', 'Beam depth', 0.3, 0.18, 0.6), P.len('width', '폭', 'Beam width', 0.14, 0.08, 0.24), P.bool('tie', '타이 로드', 'Tie rod', true), P.mat('wood', '집성목', 'Glulam', 'wood-ash', 'wood')],
  tags: ['glulam', 'curved beam', 'arch beam', 'timber arch', '집성목', '곡선 보', '아치 보', '목조 아치'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.span, rise = Math.min(p.rise, L / 2 - 0.05), d = p.depth;
    const R = (L * L / 4 + rise * rise) / (2 * rise), cy = rise - R, a0 = Math.atan2(-cy, L / 2), a1 = PI - a0, n = k.seg(40, 12);
    const arc = (rr, from, to) => Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [rr * Math.cos(a), cy + rr * Math.sin(a)]; });
    k.panel('beam', p.wood, shapeOf([...arc(R, a0, a1), ...arc(R + d, a1, a0)]), p.width, 0, 0, 0, { bevel: 0.004 });
    for (const a of [a0, a1]) {
      const rm = R + d / 2;
      k.box('steel', 'metal-black', 0.24, d + 0.04, p.width + 0.03, rm * Math.cos(a), cy + rm * Math.sin(a), 0, { r: 0.003, rz: a });
    }
    if (p.tie) {
      k.rod('steel', 'metal-black', [-L / 2 + 0.06, 0.1, 0], [L / 2 - 0.06, 0.1, 0], 0.012, { segs: k.seg(10, 5) });
      k.cyl('steel', 'metal-black', 0.022, 0.022, 0.16, -0.08, 0.1, 0, { rz: -PI / 2, segs: k.seg(10, 6) });
    }
    return finish(k);
  },
});

const openWeb = S({
  id: 'st-joist-open-web', placement: 'ceiling', elevation: 2.0, ko: '트러스 장선(오픈 웹)', en: 'Open-web steel joist',
  params: [P.len('length', '길이', 'Length', 4.0, 2.0, 10.0), P.len('depth', '춤', 'Depth', 0.45, 0.25, 0.9), P.mat('metal', '도장', 'Paint', 'paint-black-matte')],
  tags: ['open web joist', 'steel truss', 'bar joist', 'industrial ceiling', '트러스', '철골 장선', '오픈 웹 조이스트', '공장 천장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, D = p.depth, m = p.metal;
    for (const s of [-1, 1]) {
      k.box('chords', m, L, 0.05, 0.035, 0, D - 0.025, s * 0.025, { r: 0.002 });
      k.box('chords', m, L - 0.4, 0.05, 0.035, 0, 0.025, s * 0.025, { r: 0.002 });
    }
    const span = L - 0.4, n = Math.max(2, Math.round(span / 0.6) * 2), pitch = span / n;
    for (let i = 0; i < n; i++) {
      const x0 = -span / 2 + i * pitch, x1 = x0 + pitch;
      const a = i % 2 === 0 ? [x0, 0.05, 0] : [x0, D - 0.05, 0], b = i % 2 === 0 ? [x1, D - 0.05, 0] : [x1, 0.05, 0];
      k.rod('web', m, a, b, 0.012, { segs: k.seg(8, 5) });
    }
    for (const s of [-1, 1]) k.box('chords', m, 0.12, 0.08, 0.12, s * (L / 2 - 0.06), D - 0.09, 0, { r: 0.002 });
    return finish(k);
  },
});

const waffle = S({
  id: 'st-ceiling-waffle', placement: 'ceiling', elevation: 2.3, ko: '와플 슬래브 노출 천장', en: 'Exposed concrete waffle slab',
  params: [P.len('width', '폭', 'Width', 3.0, 1.8, 6.0), P.len('depth', '깊이', 'Depth', 3.0, 1.8, 6.0), P.len('module', '격자 간격', 'Module', 0.9, 0.6, 1.2), P.len('rib', '리브 춤', 'Rib depth', 0.3, 0.15, 0.5), P.mat('concrete', '콘크리트', 'Concrete', 'concrete')],
  tags: ['waffle slab', 'concrete ceiling', 'brutalist', 'exposed concrete', '와플 슬래브', '노출 콘크리트', '격자 천장', '콘크리트 천장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = p.depth, rb = p.rib, c = p.concrete;
    k.box('slab', c, W, 0.12, D, 0, rb + 0.06, 0, { r: 0.003 });
    const nx = Math.max(2, Math.round(W / p.module)), nz = Math.max(2, Math.round(D / p.module));
    for (let i = 0; i <= nz; i++) taperBox(k, 'ribs', c, W, W, 0.1, 0.16, rb, 0, 0, -D / 2 + 0.05 + ((D - 0.1) * i) / nz);
    for (let i = 0; i <= nx; i++) taperBox(k, 'ribs', c, 0.1, 0.16, D, D, rb, -W / 2 + 0.05 + ((W - 0.1) * i) / nx, 0, 0);
    return finish(k);
  },
});

const joists = S({
  id: 'st-ceiling-joists', placement: 'ceiling', elevation: 2.35, ko: '노출 목재 장선 천장', en: 'Exposed timber joist ceiling',
  params: [P.len('width', '폭', 'Width', 3.0, 1.2, 6.0), P.len('length', '길이', 'Length', 3.0, 1.2, 6.0), P.len('spacing', '간격', 'Spacing', 0.4, 0.3, 0.8), P.len('joist', '장선 춤', 'Joist depth', 0.22, 0.14, 0.3), P.mat('wood', '장선', 'Joists', 'wood-pine', 'wood'), P.mat('deck', '바닥판', 'Deck boards', 'plywood')],
  tags: ['joists', 'exposed joists', 'timber ceiling', 'loft ceiling', '장선', '노출 장선', '목조 천장', '다락 천장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, L = p.length, jd = p.joist, w = p.wood;
    const n = Math.max(2, Math.round(W / p.spacing));
    for (let i = 0; i <= n; i++) k.box('joists', w, 0.05, jd, L - 0.1, -W / 2 + 0.025 + ((W - 0.05) * i) / n, jd / 2, 0, { r: 0.003 });
    for (const s of [-1, 1]) k.box('joists', w, W, jd, 0.05, 0, jd / 2, s * (L / 2 - 0.025), { r: 0.003 });
    for (let i = 0; i < n; i++) k.box('joists', w, (W - 0.05) / n - 0.05, jd * 0.8, 0.05, -W / 2 + 0.025 + ((W - 0.05) * (i + 0.5)) / n, jd * 0.6, (i % 2 ? 0.06 : -0.06), { r: 0.003 });
    k.box('deck', p.deck, W, 0.022, L, 0, jd + 0.011, 0, { r: 0.002 });
    return finish(k);
  },
});

const tray = S({
  id: 'st-ceiling-tray', placement: 'ceiling', elevation: 2.25, ko: '우물형 트레이 천장(간접조명)', en: 'Tray ceiling with LED cove',
  params: [P.len('width', '폭', 'Width', 3.6, 2.0, 6.0), P.len('depth', '깊이', 'Depth', 3.0, 2.0, 6.0), P.len('band', '띠 폭', 'Band width', 0.5, 0.3, 0.9), P.len('drop', '내림', 'Drop', 0.2, 0.1, 0.4), P.bool('led', 'LED', 'LED cove', true), P.mat('ceiling', '마감', 'Finish', 'paint-white-matte')],
  tags: ['tray ceiling', 'recessed ceiling', 'cove lighting', 'drop ceiling', '우물천장', '트레이 천장', '간접조명', '천장 몰딩'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = p.depth, b = Math.min(p.band, W / 3, D / 3), dr = p.drop, c = p.ceiling;
    for (const s of [-1, 1]) {
      k.box('band', c, W, dr, b, 0, dr / 2, s * (D / 2 - b / 2), { r: 0.003 });
      k.box('band', c, b, dr, D - 2 * b, s * (W / 2 - b / 2), dr / 2, 0, { r: 0.003 });
    }
    const iw = W - 2 * b, id = D - 2 * b, up = 0.15;
    k.box('field', c, iw + 0.04, 0.02, id + 0.04, 0, dr + up + 0.01, 0, { r: 0.002 });
    for (const s of [-1, 1]) {
      k.box('field', c, iw, up, 0.02, 0, dr + up / 2, s * (id / 2 + 0.01), { r: 0 });
      k.box('field', c, 0.02, up, id, s * (iw / 2 + 0.01), dr + up / 2, 0, { r: 0 });
      // lip hiding the LED strip on the band top
      k.box('band', c, iw - 0.1, 0.05, 0.015, 0, dr + 0.025, s * (id / 2 - 0.09), { r: 0 });
      k.box('band', c, 0.015, 0.05, id - 0.1, s * (iw / 2 - 0.09), dr + 0.025, 0, { r: 0 });
    }
    if (p.led) {
      for (const s of [-1, 1]) {
        k.box('led', 'light-warm', iw - 0.12, 0.008, 0.012, 0, dr + 0.006, s * (id / 2 - 0.05), { r: 0 });
        k.box('led', 'light-warm', 0.012, 0.008, id - 0.12, s * (iw / 2 - 0.05), dr + 0.006, 0, { r: 0 });
      }
      k.light(0, dr + 0.05, 0, { color: '#ffd9a0', intensity: 0.8, distance: 6 });
    }
    return finish(k);
  },
});

const barrel = S({
  id: 'st-ceiling-barrel-vault', placement: 'ceiling', elevation: 2.4, ko: '배럴 볼트 천장(원통형)', en: 'Barrel-vault ceiling',
  params: [P.len('width', '폭', 'Span', 3.0, 2.0, 6.0), P.len('length', '길이', 'Length', 3.0, 1.0, 8.0), P.len('rise', '라이즈', 'Rise', 0.8, 0.3, 1.5), P.bool('ribs', '리브', 'Transverse ribs', true), P.mat('plaster', '마감', 'Finish', 'wall-plaster')],
  tags: ['barrel vault', 'vaulted ceiling', 'arched ceiling', 'curved ceiling', '볼트 천장', '아치 천장', '원통형 천장', '곡면 천장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, L = p.length, rise = Math.min(p.rise, w / 2), m = p.plaster;
    const R = (w * w / 4 + rise * rise) / (2 * rise), cy = rise - R, a0 = Math.atan2(-cy, w / 2), a1 = PI - a0, n = k.seg(36, 12);
    const arc = (rr, from, to) => Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [rr * Math.cos(a), cy + rr * Math.sin(a)]; });
    k.panel('vault', m, shapeOf([...arc(R, a0, a1), ...arc(R + 0.05, a1, a0)]), L, 0, 0, 0, { bevel: 0 });
    if (p.ribs) {
      const nr = Math.max(2, Math.round(L / 1.2) + 1);
      for (let i = 0; i < nr; i++) k.panel('ribs', m, shapeOf([...arc(R - 0.07, a0, a1), ...arc(R + 0.02, a1, a0)]), 0.16, 0, 0, -L / 2 + 0.08 + ((L - 0.16) * i) / (nr - 1), { bevel: 0.004 });
    }
    for (const s of [-1, 1]) k.box('ribs', m, 0.14, 0.1, L, s * (w / 2 - 0.02), 0.0, 0, { r: 0.006 });
    return finish(k);
  },
});

const gridTiles = S({
  id: 'st-ceiling-grid', placement: 'ceiling', elevation: 2.5, ko: '텍스 천장(T바 격자 + 조명)', en: 'Suspended tile ceiling with troffers',
  params: [P.len('width', '폭', 'Width', 2.4, 1.2, 4.8), P.len('depth', '깊이', 'Depth', 2.4, 1.2, 4.8), P.int('lights', '조명 수', 'Light panels', 2, 0, 4), P.mat('tile', '천장재', 'Tile', 'plastic-white'), P.mat('grid', 'T바', 'Grid', 'metal-white', 'metal')],
  tags: ['drop ceiling', 'suspended ceiling', 'acoustic tiles', 'troffer', 'office ceiling', '텍스 천장', '석고 텍스', 'T바', '사무실 천장', '평판 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx), nx = Math.max(2, Math.round(p.width / 0.6)), nz = Math.max(2, Math.round(p.depth / 0.6));
    const W = nx * 0.6, D = nz * 0.6;
    for (let i = 0; i <= nx; i++) k.box('grid', p.grid, 0.024, 0.03, D, -W / 2 + i * 0.6, 0.015, 0, { r: 0 });
    for (let j = 0; j <= nz; j++) k.box('grid', p.grid, W, 0.03, 0.024, 0, 0.015, -D / 2 + j * 0.6, { r: 0 });
    const spots = [[1, 1], [nx - 2, nz - 2], [nx - 2, 1], [1, nz - 2]].slice(0, clamp(Math.round(p.lights), 0, 4));
    const lit = new Set(spots.map(([i, j]) => `${clamp(i, 0, nx - 1)},${clamp(j, 0, nz - 1)}`));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = -W / 2 + 0.3 + i * 0.6, z = -D / 2 + 0.3 + j * 0.6;
      if (lit.has(`${i},${j}`)) {
        k.box('troffer', 'light-cool', 0.57, 0.01, 0.57, x, 0.01, z, { r: 0 });
        k.box('housing', p.grid, 0.58, 0.09, 0.58, x, 0.06, z, { r: 0.003 });
      } else k.box('tiles', p.tile, 0.576, 0.016, 0.576, x, 0.014, z, { r: 0 });
    }
    for (const [i, j] of spots) { if (!lit.size) break; k.light(-W / 2 + 0.3 + clamp(i, 0, nx - 1) * 0.6, -0.05, -D / 2 + 0.3 + clamp(j, 0, nz - 1) * 0.6, { color: '#eef4ff', intensity: 0.9, distance: 5 }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('grid', p.grid, [sx * W / 4, 0.03, sz * D / 4], [sx * W / 4, 0.35, sz * D / 4], 0.002, { segs: 4 });
    return finish(k);
  },
});

const baffles = S({
  id: 'st-ceiling-baffles', placement: 'ceiling', elevation: 2.4, ko: '우드 배플 천장(흡음)', en: 'Timber baffle ceiling',
  params: [P.len('width', '폭', 'Width', 2.4, 1.0, 5.0), P.len('length', '길이', 'Length', 3.0, 1.0, 6.0), P.len('pitch', '간격', 'Pitch', 0.15, 0.08, 0.3), P.len('baffle', '배플 춤', 'Baffle depth', 0.2, 0.1, 0.4), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'), P.mat('felt', '흡음 펠트', 'Felt backing', 'fabric-wool-charcoal')],
  tags: ['baffle ceiling', 'timber slats', 'acoustic ceiling', 'linear ceiling', '배플 천장', '루버 천장', '흡음 천장', '우드 슬랫'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, L = p.length, bd = p.baffle;
    const n = Math.max(2, Math.floor(W / p.pitch));
    for (let i = 0; i <= n; i++) k.box('baffles', p.wood, 0.03, bd, L, -W / 2 + 0.015 + ((W - 0.03) * i) / n, bd / 2, 0, { r: 0.003 });
    for (const s of [-1, 1]) k.box('rails', 'metal-black', W, 0.03, 0.03, 0, bd + 0.005, s * L / 3, { r: 0.002 });
    k.box('felt', p.felt, W + 0.04, 0.02, L + 0.04, 0, bd + 0.03, 0, { r: 0.003 });
    return finish(k);
  },
});

const backlit = S({
  id: 'st-ceiling-backlit', placement: 'ceiling', elevation: 2.45, ko: '바리솔 조명 천장(백라이트)', en: 'Backlit stretch ceiling panel',
  params: [P.len('width', '폭', 'Width', 2.0, 0.8, 4.0), P.len('depth', '깊이', 'Depth', 1.2, 0.6, 3.0), P.pick('tone', '빛 색', 'Light tone', 'cool', [['cool', '주광색', 'Cool'], ['warm', '전구색', 'Warm']]), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal')],
  tags: ['stretch ceiling', 'backlit ceiling', 'light panel', 'barrisol', '바리솔', '조명 천장', '백라이트', '라이트 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = p.depth;
    for (const s of [-1, 1]) {
      k.box('frame', p.frame, W, 0.08, 0.04, 0, 0.04, s * (D / 2 - 0.02), { r: 0.003 });
      k.box('frame', p.frame, 0.04, 0.08, D - 0.08, s * (W / 2 - 0.02), 0.04, 0, { r: 0.003 });
    }
    k.box('membrane', p.tone === 'warm' ? 'light-warm' : 'light-cool', W - 0.08, 0.004, D - 0.08, 0, 0.012, 0, { r: 0 });
    k.box('frame', 'paint-white-matte', W - 0.08, 0.01, D - 0.08, 0, 0.075, 0, { r: 0 });
    k.light(0, -0.05, 0, { color: p.tone === 'warm' ? '#ffe2b0' : '#eef4ff', intensity: 1.2, distance: 6 });
    return finish(k);
  },
});

const rafters = S({
  id: 'st-ceiling-hanok-rafters', placement: 'ceiling', elevation: 2.3, ko: '한옥 서까래 천장(대들보)', en: 'Hanok rafter ceiling with main beam',
  params: [P.len('width', '폭', 'Width', 3.0, 1.5, 6.0), P.len('length', '길이', 'Length', 3.6, 2.0, 6.0), P.len('pitch', '서까래 간격', 'Rafter pitch', 0.3, 0.2, 0.5), P.num('slope', '경사', 'Slope', 0.25, 0.05, 0.45, 0.01), P.mat('wood', '나무', 'Timber', 'wood-pine', 'wood'), P.mat('boards', '개판', 'Boards', 'wood-ash', 'wood')],
  tags: ['hanok', 'rafters', 'exposed beams', 'korean ceiling', '한옥', '서까래', '대들보', '연등천장', '목조 천장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, L = p.length, sl = p.slope, w = p.wood;
    const yT = 0.4 + 0.25 + sl * L / 2, yz = (z) => yT - sl * Math.abs(z) - 0.06;
    k.rod('beam', w, [0, 0.2, -L / 2], [0, 0.2, L / 2], 0.2, { segs: k.seg(20, 8) });
    for (const z of [0, -L / 3, L / 3, -L / 2 + 0.1, L / 2 - 0.1]) {
      k.rod('purlins', w, [-W / 2, yz(z) - 0.05, z], [W / 2, yz(z) - 0.05, z], z === 0 ? 0.12 : 0.1, { segs: k.seg(16, 6) });
      if (Math.abs(z) < L / 2 - 0.2) k.box('purlins', w, 0.14, yz(z) - 0.15 - 0.38, 0.14, 0, 0.38 + (yz(z) - 0.15 - 0.38) / 2, z, { r: 0.006 });
    }
    const n = Math.max(2, Math.round(W / p.pitch));
    for (let i = 0; i <= n; i++) {
      const x = -W / 2 + 0.05 + ((W - 0.1) * i) / n;
      for (const s of [-1, 1]) k.rod('rafters', w, [x, yT - 0.02, 0], [x, yT - 0.02 - sl * L / 2, s * L / 2], 0.05, { segs: k.seg(10, 5) });
    }
    const a = Math.atan(sl), half = L / 2 / Math.cos(a);
    for (const s of [-1, 1]) k.box('boards', p.boards, W, 0.025, half, 0, yT + 0.045 - sl * L / 4, s * L / 4, { r: 0.002, rx: s * a });
    return finish(k);
  },
});

/* ========================================================== wall finishes */

const frameMouldings = S({
  id: 'st-wall-mouldings', placement: 'wall', elevation: 0, ko: '액자형 몰딩 벽장식(체어레일)', en: 'Picture-frame wall mouldings',
  params: [P.len('width', '폭', 'Width', 2.0, 0.8, 5.0), H_PARAM(2.4, 2.0, 3.2), P.len('dado', '체어레일 높이', 'Dado height', 0.9, 0.6, 1.1), P.int('panels', '판넬 수', 'Panels', 2, 1, 6), P.mat('mat', '도장', 'Finish', 'paint-white-gloss')],
  tags: ['wall moulding', 'box moulding', 'picture frame moulding', 'chair rail', '몰딩', '액자 몰딩', '웨인스코팅', '벽 몰딩', '프렌치 몰딩'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, m = p.mat, n = clamp(Math.round(p.panels), 1, 6), dado = Math.min(p.dado, H - 0.8);
    k.box('trim', m, W, 0.12, 0.018, 0, 0.06, 0.009, { r: 0.003 });
    alongX(k, 'trim', m, [[0, 0], [0.022, 0], [0.026, 0.012], [0.02, 0.03], [0.024, 0.045], [0, 0.05]], W, { y: dado - 0.025 });
    const pw = (W - (n + 1) * 0.12) / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.12 + pw / 2 + i * (pw + 0.12);
      const lh = dado - 0.025 - 0.12 - 0.24, uh = H - 0.25 - (dado + 0.025 + 0.18);
      if (lh > 0.1) k.panel('mouldings', m, frameShape(pw, lh, 0.03), 0.016, x, 0.12 + 0.12 + lh / 2, 0.008, { bevel: 0.004 });
      if (uh > 0.1) k.panel('mouldings', m, frameShape(pw, uh, 0.035), 0.018, x, dado + 0.025 + 0.18 + uh / 2, 0.009, { bevel: 0.005 });
    }
    return finish(k);
  },
});

const shiplap = S({
  id: 'st-shiplap', placement: 'wall', elevation: 0, ko: '십랩 판재 벽(가로 판벽)', en: 'Shiplap wall panelling',
  params: [P.len('width', '폭', 'Width', 2.0, 0.6, 5.0), H_PARAM(2.4, 0.6, 3.2), P.len('board', '판 폭', 'Board width', 0.15, 0.1, 0.25), P.mat('mat', '마감', 'Finish', 'wood-white')],
  tags: ['shiplap', 'wall panelling', 'horizontal boards', 'farmhouse wall', '십랩', '판벽', '가로 판재', '우드 월'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, b = p.board;
    k.box('gap', 'paint-black-matte', W, H, 0.004, 0, H / 2, 0.002, { r: 0 });
    const n = Math.max(1, Math.round(H / b)), bh = H / n;
    for (let i = 0; i < n; i++) k.box('boards', p.mat, W, bh - 0.006, 0.014, 0, i * bh + bh / 2, 0.011, { r: 0.002 });
    return finish(k);
  },
});

const beadboard = S({
  id: 'st-beadboard-wainscot', placement: 'wall', elevation: 0, ko: '비드보드 징두리 판벽', en: 'Beadboard wainscot with cap rail',
  params: [P.len('width', '폭', 'Width', 1.6, 0.6, 5.0), H_PARAM(1.0, 0.7, 1.4), P.len('pitch', '비드 간격', 'Bead pitch', 0.1, 0.06, 0.16), P.mat('mat', '도장', 'Finish', 'paint-white-gloss')],
  tags: ['beadboard', 'wainscot', 'wainscoting', 'cottage', '비드보드', '징두리판벽', '웨인스코팅', '판벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, m = p.mat;
    const ph = H - 0.12 - 0.045;
    k.box('boards', m, W, ph, 0.01, 0, 0.12 + ph / 2, 0.005, { r: 0 });
    const n = Math.max(2, Math.round(W / p.pitch));
    for (let i = 1; i < n; i++) k.cyl('boards', m, 0.004, 0.004, ph, -W / 2 + (W * i) / n, 0.12, 0.01, { segs: k.seg(8, 4) });
    k.box('trim', m, W, 0.12, 0.018, 0, 0.06, 0.009, { r: 0.003 });
    k.cyl('trim', m, 0.007, 0.007, W, -W / 2, 0.115, 0.018, { rz: -PI / 2, segs: k.seg(8, 4) });
    alongX(k, 'trim', m, [[0, 0], [0.03, 0], [0.03, 0.012], [0.024, 0.02], [0.036, 0.03], [0.036, 0.045], [0, 0.045]], W, { y: H - 0.045 });
    return finish(k);
  },
});

const tileWainscot = S({
  id: 'st-tile-wainscot', placement: 'wall', elevation: 0, ko: '타일 징두리벽(보더 + 캡)', en: 'Tiled wainscot with border',
  params: [P.len('width', '폭', 'Width', 1.6, 0.6, 5.0), H_PARAM(1.2, 0.6, 1.6), P.bool('border', '보더', 'Border strip', true), P.mat('tile', '타일', 'Tiles', 'tile-subway-white'), P.mat('accent', '보더 타일', 'Border tiles', 'tile-mosaic-blue'), P.mat('trim', '캡·걸레받이', 'Cap & skirting', 'ceramic-white')],
  tags: ['tile wainscot', 'subway tile', 'bathroom wall', 'kitchen wall', '타일 벽', '징두리 타일', '서브웨이 타일', '보더 타일'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height;
    k.box('skirting', p.trim, W, 0.1, 0.016, 0, 0.05, 0.008, { r: 0.003 });
    k.box('tiles', p.tile, W, H - 0.124, 0.012, 0, 0.1 + (H - 0.124) / 2, 0.006, { r: 0 });
    if (p.border) k.box('border', p.accent, W, 0.06, 0.014, 0, H - 0.12, 0.007, { r: 0 });
    k.box('skirting', p.trim, W, 0.022, 0.016, 0, H - 0.013, 0.008, { r: 0 });
    k.cyl('skirting', p.trim, 0.012, 0.012, W, -W / 2, H - 0.012, 0.016, { rz: -PI / 2, segs: k.seg(10, 5) });
    return finish(k);
  },
});

const shadowGap = S({
  id: 'st-skirting-shadow-led', placement: 'wall', elevation: 0, ko: '히든 걸레받이(LED 섀도갭)', en: 'Shadow-gap skirting with LED',
  params: [P.len('length', '길이', 'Length', 2.0, 0.5, 5.0), H_PARAM(0.08, 0.05, 0.15), P.bool('led', 'LED', 'LED strip', true), P.mat('metal', '프로파일', 'Profile', 'metal-aluminium', 'metal')],
  tags: ['shadow gap skirting', 'recessed skirting', 'led skirting', 'baseboard light', '히든 걸레받이', '걸레받이', '간접조명', '섀도갭'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, h = p.height, m = p.metal;
    k.box('profile', m, L, h, 0.004, 0, h / 2, 0.002, { r: 0 });
    k.box('profile', m, L, h - 0.022, 0.006, 0, 0.022 + (h - 0.022) / 2, 0.013, { r: 0.001 });
    k.box('profile', m, L, 0.004, 0.016, 0, h - 0.002, 0.008, { r: 0 });
    k.box('profile', m, L, 0.004, 0.012, 0, 0.002, 0.006, { r: 0 });
    k.box('led', p.led ? 'light-warm' : 'plastic-white', L - 0.02, 0.006, 0.006, 0, 0.026, 0.008, { r: 0 });
    if (p.led) k.light(0, 0.01, 0.05, { color: '#ffd9a0', intensity: 0.4, distance: 2 });
    return finish(k);
  },
});

const eggDart = S({
  id: 'st-cornice-egg-dart', placement: 'wall', elevation: 2.24, ko: '난주형 코니스 몰딩(에그 앤 다트)', en: 'Egg-and-dart cornice',
  params: [P.len('length', '길이', 'Length', 1.2, 0.4, 4.0), H_PARAM(0.16, 0.1, 0.25), P.mat('mat', '마감', 'Finish', 'wall-plaster')],
  tags: ['cornice', 'egg and dart', 'crown moulding', 'classical moulding', '코니스', '천장 몰딩', '에그 앤 다트', '클래식 몰딩'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, s = p.height / 0.16, m = p.mat;
    const pts = [[0, 0], [0.015, 0], [0.015, 0.02], [0.06, 0.03], [0.065, 0.07], [0.06, 0.075], [0.1, 0.1], [0.11, 0.13], [0.13, 0.14], [0.13, 0.16], [0, 0.16]].map(([z, y]) => [z * s, y * s]);
    alongX(k, 'cornice', m, pts, L);
    const pitch = 0.055 * s, n = Math.max(2, Math.floor((L - 0.02) / pitch));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (L - n * pitch) / 2 + pitch * (i + 0.5);
      k.sphere('ornament', m, 0.018 * s, x, 0.05 * s, 0.062 * s, { scale: [0.75, 1, 0.55], segs: k.seg(10, 4), rings: k.seg(8, 3) });
      k.cyl('ornament', m, 0.006 * s, 0.0005, 0.035 * s, x + pitch / 2, 0.036 * s, 0.062 * s, { segs: k.seg(6, 3) });
    }
    const nb = Math.max(2, Math.floor((L - 0.02) / (0.02 * s)));
    for (let i = 0; i < nb; i++) k.sphere('ornament', m, 0.006 * s, -L / 2 + (L / nb) * (i + 0.5), 0.022 * s, 0.017 * s, { segs: k.seg(6, 4), rings: k.seg(4, 3) });
    return finish(k);
  },
});

const architrave = S({
  id: 'st-architrave-set', placement: 'wall', elevation: 0, ko: '문 케이싱 세트(플린스·로제트)', en: 'Door architrave with plinth blocks',
  params: [P.len('width', '개구부 폭', 'Opening width', 0.9, 0.6, 1.8), P.len('height', '개구부 높이', 'Opening height', 2.1, 1.8, 2.6), P.len('casing', '케이싱 폭', 'Casing width', 0.1, 0.07, 0.16), P.mat('mat', '도장', 'Finish', 'paint-white-gloss')],
  tags: ['architrave', 'door casing', 'plinth block', 'rosette', '케이싱', '문틀 몰딩', '플린스 블록', '로제트', '아키트레이브'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, h = p.height, cw = p.casing, m = p.mat, ph = 0.22;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + cw / 2);
      k.box('casing', m, cw + 0.02, ph, 0.03, x, ph / 2, 0.015, { r: 0.004 });
      k.box('casing', m, cw, h - ph, 0.022, x, ph + (h - ph) / 2, 0.011, { r: 0.003 });
      for (const f of [-1, 0, 1]) k.cyl('casing', m, 0.008, 0.008, h - ph - 0.02, x + f * cw * 0.28, ph + 0.01, 0.022, { segs: k.seg(8, 4) });
      k.box('casing', m, cw + 0.01, cw + 0.01, 0.026, x, h + cw / 2, 0.013, { r: 0.004 });
      k.lathe('casing', m, [[0, 0], [cw * 0.36, 0], [cw * 0.38, 0.004], [cw * 0.3, 0.008], [cw * 0.22, 0.006], [cw * 0.12, 0.012], [0, 0.014]], x, h + cw / 2, 0.026, { rx: PI / 2, segs: k.seg(20, 8) });
    }
    k.box('casing', m, w, cw, 0.022, 0, h + cw / 2, 0.011, { r: 0.003 });
    for (const f of [-1, 0, 1]) k.cyl('casing', m, 0.008, 0.008, w - 0.02, -w / 2 + 0.01, h + cw / 2 + f * cw * 0.28, 0.022, { rz: -PI / 2, segs: k.seg(8, 4) });
    return finish(k);
  },
});

const panel3d = S({
  id: 'st-wall-3d-panel', placement: 'wall', elevation: 0.9, ko: '입체 3D 벽 패널', en: '3D geometric wall panel',
  params: [P.len('width', '폭', 'Width', 1.5, 0.5, 4.0), H_PARAM(1.0, 0.5, 2.6), P.len('module', '모듈', 'Module', 0.25, 0.15, 0.4), P.len('relief', '깊이', 'Relief', 0.05, 0.02, 0.1), P.pick('pattern', '패턴', 'Pattern', 'pyramid', [['pyramid', '피라미드', 'Pyramids'], ['diamond', '다이아몬드', 'Diamonds'], ['wave', '물결', 'Waves']]), P.mat('mat', '마감', 'Finish', 'paint-white-matte')],
  tags: ['3d wall panel', 'geometric panel', 'feature wall', 'textured wall', '3D 패널', '입체 벽', '포인트 벽', '아트월'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, m = p.module, dep = p.relief;
    k.box('backing', p.mat, W, H, 0.01, 0, H / 2, 0.005, { r: 0 });
    if (p.pattern === 'wave') {
      const nu = Math.min(80, Math.max(8, Math.round(k.seg(H / 0.04, 6)))), nv = Math.min(120, Math.max(8, Math.round(k.seg(W / 0.03, 8))));
      k.add('relief', p.mat, gridGeo(nu, nv, (u, v) => { const x = -W / 2 + W * v, y = H * u; return [x, y, 0.01 + dep / 2 * (1 + Math.sin((2 * PI * (x + 0.5 * y)) / (2 * m)))]; }));
    } else {
      const nx = Math.max(1, Math.round(W / m)), ny = Math.max(1, Math.round(H / m)), cw = W / nx, ch = H / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        if (p.pattern === 'diamond' && (i + j) % 2) continue;
        const r = p.pattern === 'diamond' ? Math.min(cw, ch) : Math.min(cw, ch) / Math.SQRT2;
        const g = new THREE.CylinderGeometry(0, r * 0.98, dep, 4, 1).toNonIndexed();
        if (p.pattern !== 'diamond') g.rotateY(PI / 4);
        g.computeVertexNormals();
        g.rotateX(PI / 2);
        g.translate(-W / 2 + cw * (i + 0.5), ch * (j + 0.5), 0.01 + dep / 2);
        k.add('relief', p.mat, g);
      }
    }
    return finish(k);
  },
});

/* ======================================================== wall elements */

const tvNiche = S({
  id: 'st-tv-niche-wall', placement: 'wall', elevation: 0, ko: '미디어 월(매립 TV 니치)', en: 'Media wall with recessed TV niche',
  params: [P.len('width', '폭', 'Width', 2.6, 1.6, 4.0), H_PARAM(2.4, 2.0, 3.0), P.len('depth', '깊이', 'Depth', 0.25, 0.15, 0.45), P.len('nicheW', '니치 폭', 'Niche width', 1.7, 0.8, 2.6), P.len('nicheH', '니치 높이', 'Niche height', 1.0, 0.5, 1.6), P.bool('led', 'LED', 'LED strip', true), P.mat('wall', '벽 마감', 'Wall finish', 'wall-paint-white'), P.mat('accent', '니치 안쪽', 'Niche lining', 'wall-wood-panel')],
  tags: ['media wall', 'tv niche', 'tv wall', 'feature wall', '미디어 월', 'TV 니치', '아트월', '매립 TV'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, d = p.depth;
    const nw = Math.min(p.nicheW, W - 0.3), nh = Math.min(p.nicheH, H - 1.05), ny = 0.8 + nh / 2;
    k.panel('wall', p.wall, rectWithHoles(W, H, [[0, ny, nw, nh]]), 0.02, 0, 0, d / 2 - 0.01, { bevel: 0.002 });
    for (const s of [-1, 1]) k.box('wall', p.wall, 0.02, H, d - 0.02, s * (W / 2 - 0.01), H / 2, -0.01, { r: 0 });
    k.box('wall', p.wall, W - 0.04, 0.02, d - 0.02, 0, H - 0.01, -0.01, { r: 0 });
    recess(k, 'lining', p.accent, 0, ny, nw, nh, d / 2 - 0.02, d - 0.06);
    k.box('shelf', p.accent, nw, 0.05, 0.3, 0, 0.45, d / 2 + 0.15, { r: 0.004 });
    if (p.led) {
      k.box('led', 'light-warm', nw - 0.06, 0.008, 0.012, 0, ny + nh / 2 - 0.02, d / 2 - 0.04, { r: 0 });
      k.light(0, ny + nh / 2 - 0.06, d / 2, { color: '#ffd9a0', intensity: 0.6, distance: 3 });
    }
    return finish(k);
  },
});

const showerNiche = S({
  id: 'st-shower-niche', placement: 'wall', elevation: 0.9, ko: '욕실 매립 니치(선반)', en: 'Tiled shower niche',
  params: [P.len('width', '폭', 'Width', 0.7, 0.5, 1.2), H_PARAM(0.9, 0.6, 1.4), P.len('nicheW', '니치 폭', 'Niche width', 0.35, 0.2, 0.9), P.len('nicheH', '니치 높이', 'Niche height', 0.6, 0.25, 1.1), P.bool('shelf', '중간 선반', 'Middle shelf', true), P.mat('tile', '타일', 'Wall tiles', 'tile-subway-white'), P.mat('inner', '니치 타일', 'Niche tiles', 'tile-mosaic-blue'), P.mat('stone', '선반석', 'Shelf stone', 'marble-white', 'stone')],
  tags: ['shower niche', 'bathroom niche', 'recessed shelf', 'tiled niche', '욕실 니치', '샤워 니치', '매립 선반', '타일 니치'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, nw = Math.min(p.nicheW, W - 0.12), nh = Math.min(p.nicheH, H - 0.16), ny = H / 2, zf = 0.012;
    k.panel('tiles', p.tile, rectWithHoles(W, H, [[0, ny, nw, nh]]), 0.012, 0, 0, zf / 2, { bevel: 0 });
    recess(k, 'niche', p.inner, 0, ny, nw, nh, 0, 0.1);
    k.box('stone', p.stone, nw + 0.03, 0.015, 0.125, 0, ny - nh / 2 + 0.0075, -0.0375, { r: 0.002 });
    if (p.shelf) k.box('stone', p.stone, nw - 0.004, 0.012, 0.098, 0, ny, -0.05, { r: 0.002 });
    return finish(k);
  },
});

const slatPartition = S({
  id: 'st-partition-slatted', ko: '우드 슬랫 칸막이(천장까지)', en: 'Floor-to-ceiling slatted screen',
  params: [P.len('width', '폭', 'Width', 2.4, 0.8, 5.0), H_PARAM(2.4, 2.0, 3.2), P.len('slat', '살 폭', 'Slat width', 0.04, 0.02, 0.08), P.len('pitch', '간격', 'Pitch', 0.09, 0.05, 0.2), P.len('depth', '살 깊이', 'Slat depth', 0.06, 0.03, 0.12), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood')],
  tags: ['slatted partition', 'slat screen', 'room divider', 'timber battens', '슬랫 칸막이', '루버 파티션', '가벽', '우드 슬랫'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, d = p.depth;
    for (const y of [0.015, H - 0.015]) k.box('channel', 'metal-black', W, 0.03, d + 0.01, 0, y, 0, { r: 0.002 });
    const n = Math.max(2, Math.floor((W - p.slat) / p.pitch));
    const pitch = (W - p.slat) / n;
    for (let i = 0; i <= n; i++) k.box('slats', p.wood, p.slat, H - 0.06, d, -W / 2 + p.slat / 2 + i * pitch, H / 2, 0, { r: 0.003 });
    return finish(k);
  },
});

const perforated = S({
  id: 'st-screen-perforated', ko: '타공 금속 스크린 칸막이', en: 'Perforated metal screen',
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 2.4), H_PARAM(2.2, 1.2, 2.8), P.mat('panel', '타공판', 'Panel', 'metal-copper', 'metal'), P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal')],
  tags: ['perforated screen', 'metal screen', 'partition', 'privacy screen', '타공판', '금속 스크린', '칸막이', '파티션'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, fh = H - 0.1, iw = W - 0.06, ih = fh - 0.06;
    k.panel('frame', p.frame, frameShape(W, fh, 0.04), 0.04, 0, 0.1 + fh / 2, 0, { bevel: 0.002 });
    for (const s of [-1, 1]) k.box('frame', p.frame, 0.06, 0.1, 0.4, s * (W / 2 - 0.1), 0.05, 0, { r: 0.004 });
    const maxHoles = k.hi ? 500 : 110;
    const pitch = Math.max(k.hi ? 0.07 : 0.14, Math.sqrt((iw * ih) / maxHoles));
    const hr = pitch * 0.36, rowH = pitch * 0.866;
    const s = shapeOf([[-iw / 2, 0], [iw / 2, 0], [iw / 2, ih], [-iw / 2, ih]]);
    const rows = Math.floor((ih - 2 * hr) / rowH);
    for (let j = 0; j <= rows; j++) {
      const y = hr + 0.01 + j * rowH, off = j % 2 ? pitch / 2 : 0;
      if (y > ih - hr - 0.01) break;
      for (let x = -iw / 2 + hr + 0.01 + off; x < iw / 2 - hr - 0.01; x += pitch) {
        s.holes.push(new THREE.Path(Array.from({ length: 6 }, (_, i) => { const a = -(i * PI) / 3 + PI / 6; return V2(x + hr * Math.cos(a), y + hr * Math.sin(a)); })));
      }
    }
    k.panel('panel', p.panel, s, 0.003, 0, 0.13, 0, { bevel: 0 });
    return finish(k);
  },
});

const officeGlass = S({
  id: 'st-partition-office-glass', ko: '사무실 유리 파티션(도어 포함)', en: 'Glazed office partition with door',
  params: [P.len('width', '폭', 'Width', 3.0, 1.5, 6.0), H_PARAM(2.6, 2.2, 3.2), P.bool('door', '문', 'Door', true), P.bool('band', '불투명 띠', 'Frosted band', true), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal')],
  tags: ['glass partition', 'office partition', 'glazed wall', 'meeting room', '유리 파티션', '사무실 칸막이', '회의실', '유리벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, f = p.frame;
    for (const y of [0.025, H - 0.025]) k.box('frame', f, W, 0.05, 0.08, 0, y, 0, { r: 0.002 });
    const n = Math.max(1, Math.ceil(W / 1.2)), pw = W / n;
    for (let i = 0; i <= n; i++) k.box('frame', f, 0.05, H - 0.1, 0.08, -W / 2 + 0.025 + ((W - 0.05) * i) / n, H / 2, 0, { r: 0.002 });
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + pw * (i + 0.5);
      const isDoor = p.door && i === n - 1;
      if (isDoor) {
        const dw = pw - 0.07, dh = H - 0.12;
        k.panel('frame', f, frameShape(dw, dh, 0.045), 0.045, x, 0.06 + dh / 2, 0, { bevel: 0.002 });
        k.box('glass', 'glass-clear', dw - 0.08, dh - 0.08, 0.008, x, 0.06 + dh / 2, 0, { r: 0 });
        for (const s of [-1, 1]) k.rod('handle', 'metal-steel', [x + dw / 2 - 0.08, 0.75, s * 0.06], [x + dw / 2 - 0.08, 1.35, s * 0.06], 0.012, { segs: k.seg(10, 5) });
        k.rod('handle', 'metal-steel', [x + dw / 2 - 0.08, 1.05, -0.06], [x + dw / 2 - 0.08, 1.05, 0.06], 0.008, { segs: k.seg(8, 4) });
      } else k.box('glass', 'glass-clear', pw - 0.05, H - 0.1, 0.012, x, H / 2, 0, { r: 0 });
      if (p.band) k.box('band', 'glass-frosted', pw - 0.1, 0.1, 0.002, x, 1.05, 0.024, { r: 0 });
    }
    return finish(k);
  },
});

const slidingPartition = S({
  id: 'st-partition-sliding', ko: '천장 레일 슬라이딩 가벽', en: 'Ceiling-track sliding partition',
  params: [P.len('width', '폭', 'Width', 3.0, 1.5, 6.0), H_PARAM(2.5, 2.1, 3.0), P.int('panels', '판 수', 'Panels', 3, 2, 6), P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05), P.mat('face', '판 마감', 'Panel finish', 'wood-oak'), P.mat('track', '레일', 'Track', 'metal-aluminium', 'metal')],
  tags: ['sliding partition', 'movable wall', 'room divider', 'track panels', '슬라이딩 가벽', '이동식 벽', '칸막이', '파티션 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, n = clamp(Math.round(p.panels), 2, 6), o = clamp(p.open, 0, 1);
    k.box('track', p.track, W, 0.06, 0.12, 0, H - 0.03, 0, { r: 0.003 });
    k.box('track', p.track, W, 0.01, 0.04, 0, 0.005, 0, { r: 0 });
    const pw = W / n + 0.04, ph = H - 0.08;
    for (let i = 0; i < n; i++) {
      const xc = -W / 2 + (W / n) * (i + 0.5), xo = -W / 2 + pw / 2 + i * 0.06, x = xc + (xo - xc) * o, z = i % 2 ? 0.028 : -0.028;
      k.box('panels', p.face, pw, ph, 0.045, x, 0.012 + ph / 2, z, { r: 0.004 });
      for (const s of [-1, 1]) k.box('pulls', 'metal-black', 0.02, 0.3, 0.004, x + pw / 2 - 0.06, 1.05, z + s * 0.024, { r: 0 });
      k.box('pulls', 'metal-black', 0.05, 0.06, 0.02, x - pw / 4, H - 0.08, z, { r: 0.002 });
      k.box('pulls', 'metal-black', 0.05, 0.06, 0.02, x + pw / 4, H - 0.08, z, { r: 0.002 });
    }
    return finish(k);
  },
});

const chimneyNiche = S({
  id: 'st-chimney-log-niche', placement: 'wall', elevation: 0, ko: '장작 수납 니치 굴뚝벽', en: 'Chimney breast with log niche',
  params: [P.len('width', '폭', 'Width', 1.6, 1.0, 2.4), H_PARAM(2.4, 2.0, 3.2), P.len('depth', '깊이', 'Depth', 0.45, 0.3, 0.7), P.len('nicheW', '니치 폭', 'Niche width', 0.9, 0.5, 1.6), P.len('nicheH', '니치 높이', 'Niche height', 0.7, 0.4, 1.0), P.mat('wall', '벽 마감', 'Wall finish', 'wall-plaster'), P.mat('inside', '니치 안쪽', 'Niche lining', 'wall-brick-white'), P.mat('mantel', '맨틀 보', 'Mantel beam', 'wood-oak', 'wood')],
  tags: ['chimney breast', 'log store', 'log niche', 'firewood', '굴뚝벽', '장작 니치', '장작 수납', '벽난로 벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, d = p.depth, nw = Math.min(p.nicheW, W - 0.3), nh = p.nicheH, y0 = 0.15, ny = y0 + nh / 2;
    k.panel('wall', p.wall, rectWithHoles(W, H, [[0, ny, nw, nh]]), 0.03, 0, 0, d / 2 - 0.015, { bevel: 0.003 });
    for (const s of [-1, 1]) k.box('wall', p.wall, 0.03, H, d - 0.03, s * (W / 2 - 0.015), H / 2, -0.015, { r: 0 });
    k.box('wall', p.wall, W - 0.06, 0.03, d - 0.03, 0, H - 0.015, -0.015, { r: 0 });
    recess(k, 'lining', p.inside, 0, ny, nw, nh, d / 2 - 0.03, d - 0.08);
    const ld = 0.1, rows = Math.max(1, Math.floor((nh - 0.03) / (ld * 0.92))), cols = Math.max(1, Math.floor((nw - 0.03) / (ld + 0.005)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols - (r % 2); c++) {
      const x = -nw / 2 + 0.015 + ld / 2 + c * (ld + 0.005) + (r % 2) * ld / 2, y = y0 + 0.012 + ld / 2 + r * ld * 0.92;
      k.cyl('logs', 'wood-dark', ld / 2 * (0.85 + 0.15 * Math.sin(r * 3 + c * 7)), ld / 2, d - 0.14, x, y, -d / 2 + 0.07, { rx: PI / 2, segs: k.seg(10, 6) });
    }
    k.box('mantel', p.mantel, nw + 0.5, 0.16, 0.22, 0, y0 + nh + 0.32, d / 2 + 0.1, { r: 0.006 });
    k.box('hearth', 'concrete', W + 0.1, 0.05, d + 0.25, 0, 0.025, 0.125, { r: 0.004 });
    return finish(k);
  },
});

/* ================================================================= arches */

const horseshoe = S({
  id: 'st-arch-horseshoe', ko: '무어식 말굽 아치 벽', en: 'Moorish horseshoe arch wall',
  params: [P.len('width', '벽 폭', 'Wall width', 2.0, 1.4, 3.6), H_PARAM(2.6, 2.2, 3.4), P.len('opening', '개구부 폭', 'Opening width', 0.9, 0.6, 1.6), P.len('thick', '벽 두께', 'Wall thickness', 0.2, 0.1, 0.4), P.mat('wall', '벽', 'Wall', 'wall-plaster'), P.mat('voussoirA', '홍예석 A', 'Voussoirs A', 'wall-brick-red'), P.mat('voussoirB', '홍예석 B', 'Voussoirs B', 'paint-white-matte'), P.mat('frame', '알피즈 띠', 'Alfiz band', 'tile-mosaic-blue')],
  tags: ['horseshoe arch', 'moorish arch', 'arch', 'archway', '말굽 아치', '무어 양식', '아치', '아치 벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, T = p.thick;
    const R = Math.min(p.opening, (W / 2 - 0.4) * 2) / 2, yc = H - 0.45 - R, a0 = -PI / 6, a1 = PI + PI / 6, n = k.seg(36, 14);
    const hw = R * Math.cos(a0), ys = yc + R * Math.sin(a0);
    const arc = (rr, from, to, m) => Array.from({ length: m + 1 }, (_, i) => { const a = from + ((to - from) * i) / m; return [rr * Math.cos(a), yc + rr * Math.sin(a)]; });
    openingWall(k, 'wall', p.wall, W, H, T, [[hw, 0], ...arc(R, a0, a1, n), [-hw, 0]]);
    const nv = k.hi ? 15 : 9;
    for (let i = 0; i < nv; i++) {
      const f = a0 + ((a1 - a0) * i) / nv, t = a0 + ((a1 - a0) * (i + 1)) / nv;
      k.panel(i % 2 ? 'voussoirsB' : 'voussoirsA', i % 2 ? p.voussoirB : p.voussoirA, shapeOf([...arc(R, f, t, 3), ...arc(R + 0.2, t, f, 3)]), T + 0.02, 0, 0, 0, { bevel: 0.002 });
    }
    const ax = R + 0.32, ab = ys - 0.05, at = Math.min(H - 0.08, yc + R + 0.3);
    k.panel('alfiz', p.frame, frameShape(2 * ax, at - ab, 0.06), T + 0.03, 0, (at + ab) / 2, 0, { bevel: 0.002 });
    return finish(k);
  },
});

function tudorPts(half, ys, rise, n) {
  const r1 = half * 0.4, cx = half - r1, am = PI / 3, right = [];
  for (let i = 0; i <= n; i++) { const a = (am * i) / n; right.push([cx + r1 * Math.cos(a), ys + r1 * Math.sin(a)]); }
  const left = right.map(([x, y]) => [-x, y]).reverse();
  return [[half, 0], ...right, [0, ys + rise], ...left, [-half, 0]];
}

const tudor = S({
  id: 'st-arch-tudor', ko: '튜더 아치 벽(석재 테두리)', en: 'Tudor arch wall with stone surround',
  params: [P.len('width', '벽 폭', 'Wall width', 2.0, 1.4, 3.6), H_PARAM(2.6, 2.2, 3.4), P.len('opening', '개구부 폭', 'Opening width', 1.0, 0.7, 1.6), P.len('spring', '아치 시작 높이', 'Spring height', 1.8, 1.2, 2.3), P.len('thick', '벽 두께', 'Wall thickness', 0.2, 0.1, 0.4), P.mat('wall', '벽', 'Wall', 'wall-plaster'), P.mat('stone', '석재', 'Stone', 'travertine')],
  tags: ['tudor arch', 'four-centred arch', 'gothic arch', 'archway', '튜더 아치', '아치', '석재 아치', '아치 벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, T = p.thick, half = Math.min(p.opening / 2, W / 2 - 0.3), rise = half * 0.6, b = 0.14, n = k.seg(10, 4);
    const ys = Math.min(p.spring, H - rise - b - 0.3);
    const inner = tudorPts(half, ys, rise, n), outer = tudorPts(half + b, ys, rise + b * 0.9, n);
    openingWall(k, 'wall', p.wall, W, H, T, inner);
    k.panel('stone', p.stone, bandShape(outer, inner), T + 0.04, 0, 0, 0, { bevel: 0.004 });
    const lw = 2 * (half + b) + 0.2, ly = ys + rise + b + 0.06;
    k.box('stone', p.stone, lw, 0.07, T + 0.1, 0, ly, 0, { r: 0.006 });
    for (const s of [-1, 1]) k.box('stone', p.stone, 0.07, 0.3, T + 0.1, s * (lw / 2 - 0.035), ly - 0.15, 0, { r: 0.006 });
    return finish(k);
  },
});

const keystone = S({
  id: 'st-arch-keystone', ko: '키스톤 아치 출입구', en: 'Segmental arch portal with keystone',
  params: [P.len('width', '벽 폭', 'Wall width', 2.0, 1.4, 3.6), H_PARAM(2.6, 2.2, 3.4), P.len('opening', '개구부 폭', 'Opening width', 1.0, 0.7, 1.6), P.len('apex', '정점 높이', 'Apex height', 2.2, 1.9, 2.8), P.len('thick', '벽 두께', 'Wall thickness', 0.2, 0.1, 0.4), P.mat('wall', '벽', 'Wall', 'wall-paint-warm'), P.mat('stone', '석재', 'Stone', 'travertine')],
  tags: ['keystone arch', 'segmental arch', 'portal', 'stone surround', '키스톤', '아치', '석재 아치', '출입구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, T = p.thick, half = Math.min(p.opening / 2, W / 2 - 0.35), b = 0.16, n = k.seg(24, 10);
    const top = Math.min(p.apex, H - 0.4);
    const inner = archOutline(half, top, 'segmental', n), outer = archOutline(half + b, top + b, 'segmental', n);
    openingWall(k, 'wall', p.wall, W, H, T, inner);
    k.panel('stone', p.stone, bandShape(outer, inner), T + 0.04, 0, 0, 0, { bevel: 0.004 });
    k.panel('stone', p.stone, shapeOf([[-0.07, top - 0.02], [0.07, top - 0.02], [0.1, top + 0.26], [-0.1, top + 0.26]]), T + 0.08, 0, 0, 0, { bevel: 0.004 });
    const spring = top - half * 0.45;
    for (const s of [-1, 1]) {
      k.box('stone', p.stone, b + 0.08, 0.1, T + 0.06, s * (half + b / 2), spring - 0.05, 0, { r: 0.005 });
      k.box('stone', p.stone, b + 0.04, 0.25, T + 0.05, s * (half + b / 2), 0.125, 0, { r: 0.005 });
    }
    return finish(k);
  },
});

const colonnade = S({
  id: 'st-colonnade', ko: '열주(두 기둥 + 엔타블러처)', en: 'Colonnade with entablature',
  params: [P.len('span', '기둥 간격', 'Span', 2.4, 1.2, 4.0), H_PARAM(2.7, 2.3, 3.4), P.len('radius', '기둥 반지름', 'Column radius', 0.12, 0.08, 0.2), P.mat('mat', '마감', 'Finish', 'paint-white-matte')],
  tags: ['colonnade', 'columns', 'entablature', 'portico', '열주', '기둥', '엔타블러처', '고전 건축'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.span, H = p.height, r = p.radius, m = p.mat, e = 0.36, ch = H - e;
    for (const s of [-1, 1]) tuscan(k, m, r, ch, s * L / 2, 0);
    const len = L + r * 2.7 + 0.1, dd = r * 2.6;
    k.box('entablature', m, len, 0.12, dd, 0, ch + 0.06, 0, { r: 0.004 });
    k.box('entablature', m, len - 0.04, 0.14, dd - 0.04, 0, ch + 0.19, 0, { r: 0.003 });
    k.box('entablature', m, len + 0.12, 0.1, dd + 0.12, 0, H - 0.05, 0, { r: 0.006 });
    return finish(k);
  },
});

/* ========================================================= floors & levels */

const accessFloor = S({
  id: 'st-access-floor', ko: '이중 바닥(액세스 플로어)', en: 'Raised access floor',
  params: [P.len('width', '폭', 'Width', 1.8, 1.2, 3.6), P.len('depth', '깊이', 'Depth', 1.2, 0.6, 3.0), H_PARAM(0.3, 0.15, 0.6), P.bool('lifted', '패널 하나 열기', 'One tile lifted', true), P.mat('tile', '바닥재', 'Tile finish', 'floor-vinyl'), P.mat('ped', '받침대', 'Pedestals', 'metal-steel', 'metal')],
  tags: ['access floor', 'raised floor', 'server room', 'pedestal floor', '이중 바닥', '액세스 플로어', '전산실', '이중마루'],
  build: (p, ctx) => {
    const k = new Kit(ctx), nx = Math.max(2, Math.round(p.width / 0.6)), nz = Math.max(1, Math.round(p.depth / 0.6)), h = p.height;
    const W = nx * 0.6, D = nz * 0.6;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = -W / 2 + i * 0.6, z = -D / 2 + j * 0.6;
      k.box('ped', p.ped, 0.1, 0.004, 0.1, x, 0.002, z, { r: 0 });
      k.cyl('ped', p.ped, 0.012, 0.014, h - 0.04, x, 0.004, z, { segs: k.seg(10, 5) });
      k.box('ped', p.ped, 0.09, 0.006, 0.09, x, h - 0.033, z, { r: 0 });
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (p.lifted && i === nx - 1 && j === 0) continue;
      const x = -W / 2 + 0.3 + i * 0.6, z = -D / 2 + 0.3 + j * 0.6;
      k.box('core', 'paint-grey-matte', 0.597, 0.026, 0.597, x, h - 0.03 + 0.013, z, { r: 0.001 });
      k.box('tiles', p.tile, 0.597, 0.004, 0.597, x, h - 0.002, z, { r: 0 });
    }
    return finish(k);
  },
});

const stage = S({
  id: 'st-stage-podium', ko: '무대 단상(계단 포함)', en: 'Stage podium with steps',
  params: [P.len('width', '폭', 'Width', 3.0, 1.5, 6.0), P.len('depth', '깊이', 'Depth', 2.0, 1.0, 4.0), H_PARAM(0.45, 0.2, 0.9), P.bool('steps', '계단', 'Steps', true), P.mat('deck', '상판', 'Deck', 'floor-oak'), P.mat('skirt', '스커트', 'Skirt', 'fabric-wool-charcoal')],
  tags: ['stage', 'podium', 'platform', 'riser', '무대', '단상', '강단', '포디움'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = p.depth, h = p.height;
    k.box('body', p.skirt, W - 0.03, h - 0.03, D - 0.03, 0, (h - 0.03) / 2, 0, { r: 0.004 });
    k.box('deck', p.deck, W, 0.03, D, 0, h - 0.015, 0, { r: 0.003 });
    k.box('nosing', 'metal-aluminium', W, 0.02, 0.025, 0, h - 0.01, D / 2 + 0.0125, { r: 0.002 });
    if (p.steps) {
      const ns = Math.max(1, Math.round(h / 0.18) - 1), rise = h / (ns + 1), run = 0.28;
      for (let i = 0; i < ns; i++) {
        const top = (i + 1) * rise, z = D / 2 + (ns - i - 0.5) * run;
        k.box('body', p.skirt, 1.0, top - 0.03, run, 0, (top - 0.03) / 2, z, { r: 0.003 });
        k.box('deck', p.deck, 1.0, 0.03, run, 0, top - 0.015, z, { r: 0.003 });
      }
    }
    return finish(k);
  },
});

const hatch = S({
  id: 'st-floor-hatch', ko: '바닥 점검구(들어올림 뚜껑)', en: 'Floor hatch with lift-up lid',
  params: [P.len('width', '폭', 'Width', 0.7, 0.5, 1.2), P.len('length', '길이', 'Length', 0.9, 0.6, 1.5), P.num('open', '열림 각도(°)', 'Open angle (°)', 70, 0, 110, 1), P.mat('lid', '뚜껑 마감', 'Lid finish', 'floor-oak'), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal')],
  tags: ['floor hatch', 'trap door', 'access hatch', 'cellar door', '점검구', '바닥 뚜껑', '지하 출입구', '트랩도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, L = p.length, f = p.frame;
    for (const s of [-1, 1]) {
      k.box('frame', f, W + 0.06, 0.012, 0.03, 0, 0.006, s * (L / 2 + 0.015), { r: 0 });
      k.box('frame', f, 0.03, 0.012, L, s * (W / 2 + 0.015), 0.006, 0, { r: 0 });
    }
    k.box('void', 'paint-black-matte', W, 0.002, L, 0, 0.001, 0, { r: 0 });
    const m = pivot(0, 0.016, -L / 2, { rx: -p.open * DEG });
    withMatrix(k, m, () => {
      k.box('lid', p.lid, W - 0.006, 0.006, L - 0.006, 0, 0.026, 0, { r: 0 });
      k.box('lid', 'plywood', W - 0.006, 0.02, L - 0.006, 0, 0.013, 0, { r: 0.001 });
      k.add('lid', f, new THREE.TorusGeometry(0.03, 0.005, k.seg(6, 4), k.seg(16, 8)).rotateX(PI / 2).translate(0, 0.031, L / 2 - 0.08));
    });
    const tip = new THREE.Vector3(W / 2 - 0.05, 0.003, -L / 2 + 0.35).applyMatrix4(m);
    if (p.open > 5) for (const s of [-1, 1]) k.rod('strut', 'metal-black', [s * (W / 2 - 0.05), 0.012, -L / 2 + 0.12], [s * tip.x, tip.y, tip.z], 0.008, { segs: k.seg(8, 4) });
    return finish(k);
  },
});

const grille = S({
  id: 'st-floor-grille', ko: '바닥 매립 컨벡터 그릴', en: 'Linear floor trench grille',
  params: [P.len('length', '길이', 'Length', 1.2, 0.4, 3.0), P.len('width', '폭', 'Width', 0.25, 0.15, 0.4), P.mat('mat', '그릴', 'Grille', 'metal-aluminium', 'metal')],
  tags: ['floor grille', 'trench heater', 'floor vent', 'convector', '바닥 그릴', '바닥 컨벡터', '트렌치 히터', '환기구'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, w = p.width, m = p.mat;
    for (const s of [-1, 1]) {
      k.box('frame', m, L, 0.02, 0.012, 0, 0.01, s * (w / 2 - 0.006), { r: 0 });
      k.box('frame', m, 0.012, 0.02, w - 0.024, s * (L / 2 - 0.006), 0.01, 0, { r: 0 });
    }
    k.box('trench', 'paint-black-matte', L - 0.02, 0.002, w - 0.02, 0, 0.001, 0, { r: 0 });
    const n = Math.max(4, Math.floor((L - 0.03) / 0.02));
    for (let i = 0; i < n; i++) k.box('bars', m, 0.006, 0.018, w - 0.024, -L / 2 + 0.015 + ((L - 0.03) * (i + 0.5)) / n, 0.011, 0, { r: 0 });
    for (const s of [-1, 1]) k.box('bars', m, L - 0.024, 0.008, 0.006, 0, 0.005, s * w / 6, { r: 0 });
    return finish(k);
  },
});

const mezzanine = S({
  id: 'st-mezzanine', ko: '메자닌 복층 데크', en: 'Mezzanine deck with railing',
  params: [P.len('width', '폭', 'Width', 3.0, 2.0, 6.0), P.len('depth', '깊이', 'Depth', 2.0, 1.2, 3.5), H_PARAM(2.4, 2.1, 3.2), P.pick('rail', '난간', 'Railing', 'glass', [['glass', '유리', 'Glass'], ['bars', '세로살', 'Bars']]), P.mat('deck', '데크', 'Deck', 'floor-oak'), P.mat('steel', '철골', 'Steel', 'metal-black', 'metal')],
  tags: ['mezzanine', 'loft deck', 'raised floor', 'duplex', '메자닌', '복층', '다락 데크', '중층'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, D = p.depth, H = p.height, st = p.steel;
    k.box('deck', p.deck, W, 0.04, D, 0, H - 0.02, 0, { r: 0.003 });
    k.box('steel', st, W, 0.2, 0.1, 0, H - 0.14, D / 2 - 0.05, { r: 0.002 });
    for (const s of [-1, 1]) k.box('steel', st, 0.1, 0.2, D - 0.1, s * (W / 2 - 0.05), H - 0.14, -0.05, { r: 0.002 });
    const nj = Math.max(2, Math.round(W / 0.6));
    for (let i = 1; i < nj; i++) k.box('steel', st, 0.06, 0.16, D - 0.1, -W / 2 + (W * i) / nj, H - 0.12, -0.05, { r: 0.002 });
    for (const s of [-1, 1]) k.box('steel', st, 0.1, H - 0.24, 0.1, s * (W / 2 - 0.05), (H - 0.24) / 2, D / 2 - 0.05, { r: 0.003 });
    const rh = 1.0, y0 = H;
    const runs = [[[-W / 2, D / 2 - 0.03], [W / 2, D / 2 - 0.03]], [[W / 2 - 0.03, D / 2], [W / 2 - 0.03, -D / 2]]];
    for (const [[x0, z0], [x1, z1]] of runs) {
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, alongXDir = Math.abs(ux) > 0.5;
      k.box('rail', st, alongXDir ? len : 0.04, 0.04, alongXDir ? 0.04 : len, (x0 + x1) / 2, y0 + rh - 0.02, (z0 + z1) / 2, { r: 0.004 });
      const np = Math.max(1, Math.round(len / 1.2));
      for (let i = 0; i <= np; i++) k.box('rail', st, 0.04, rh - 0.04, 0.04, x0 + ux * len * i / np, y0 + (rh - 0.04) / 2, z0 + uz * len * i / np, { r: 0.003 });
      if (p.rail === 'glass') {
        k.box('glass', 'glass-clear', alongXDir ? len - 0.06 : 0.012, rh - 0.12, alongXDir ? 0.012 : len - 0.06, (x0 + x1) / 2, y0 + 0.04 + (rh - 0.12) / 2, (z0 + z1) / 2, { r: 0 });
      } else {
        const nb = Math.max(2, Math.floor(len / 0.11));
        for (let i = 1; i < nb; i++) k.box('rail', st, 0.016, rh - 0.06, 0.016, x0 + ux * len * i / nb, y0 + (rh - 0.06) / 2, z0 + uz * len * i / nb, { r: 0 });
      }
    }
    return finish(k);
  },
});

/* ======================================================= stairs & railings */

const runnerStairs = S({
  id: 'st-stairs-runner', ko: '카펫 러너 직선 계단(측판)', en: 'Closed-stringer stairs with carpet runner',
  params: [P.int('steps', '단 수', 'Steps', 13, 4, 18), P.len('width', '폭', 'Width', 0.95, 0.7, 1.4), P.len('rise', '단 높이', 'Rise', 0.18, 0.15, 0.21), P.len('run', '단 깊이', 'Run', 0.27, 0.22, 0.32), P.mat('wood', '디딤판', 'Treads', 'wood-oak', 'wood'), P.mat('paint', '측판·챌판', 'Stringers & risers', 'paint-white-gloss'), P.mat('runner', '러너', 'Runner', 'rug-wool-cream'), P.mat('rods', '고정봉', 'Stair rods', 'metal-brass', 'metal')],
  tags: ['stairs', 'staircase', 'stair runner', 'carpet runner', 'closed stringer', '계단', '직선 계단', '계단 러너', '카펫 계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx), n = clamp(Math.round(p.steps), 4, 18), w = p.width, rs = p.rise, rn = p.run, L = n * rn, rw = w * 0.68;
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * rs, zb = L / 2 - rn * i;
      k.box('treads', p.wood, w, 0.03, rn + 0.025, 0, top - 0.015, zb - rn / 2 + 0.0125, { r: 0.004 });
      k.box('risers', p.paint, w, rs - 0.03, 0.02, 0, i * rs + (rs - 0.03) / 2, zb - 0.01, { r: 0 });
      k.box('runner', p.runner, rw, 0.008, rn + 0.01, 0, top + 0.004, zb - rn / 2 + 0.005, { r: 0.002 });
      k.box('runner', p.runner, rw, rs - 0.03, 0.008, 0, i * rs + (rs - 0.03) / 2, zb + 0.004, { r: 0.002 });
      if (i < n - 1) k.cyl('rods', p.rods, 0.006, 0.006, rw + 0.06, -rw / 2 - 0.03, top + 0.012, zb - rn + 0.012, { rz: -PI / 2, segs: k.seg(8, 4) });
    }
    const sl = rs / rn, z0 = Math.min(L / 2, -L / 2 + (n * rs - 0.23) / sl);
    const pts = [[L / 2 + 0.02, 0], [L / 2 + 0.02, rs + 0.12], [-L / 2, n * rs + 0.12], [-L / 2, n * rs - 0.23], [z0, 0]];
    for (const s of [-1, 1]) alongX(k, 'stringers', p.paint, pts, 0.04, { x: s * (w / 2 + 0.02) });
    return finish(k);
  },
});

const glassBalustrade = S({
  id: 'st-railing-glass-frameless', ko: '프레임리스 유리 난간(베이스 채널)', en: 'Frameless glass balustrade',
  params: [P.len('length', '길이', 'Length', 2.0, 0.6, 6.0), H_PARAM(1.0, 0.85, 1.2), P.bool('cap', '상부 캡', 'Top cap rail', true), P.mat('shoe', '베이스 채널', 'Base channel', 'metal-aluminium', 'metal'), P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass')],
  tags: ['glass balustrade', 'glass railing', 'frameless glass', 'balcony railing', '유리 난간', '강화유리 난간', '프레임리스', '발코니 난간'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, H = p.height;
    k.box('shoe', p.shoe, L, 0.1, 0.07, 0, 0.05, 0, { r: 0.004 });
    const n = Math.max(1, Math.ceil(L / 1.2)), pw = (L - (n + 1) * 0.01) / n, gh = H - 0.06 - (p.cap ? 0.03 : 0);
    for (let i = 0; i < n; i++) k.box('glass', p.glass, pw, gh, 0.017, -L / 2 + 0.01 + pw / 2 + i * (pw + 0.01), 0.06 + gh / 2, 0, { r: 0 });
    if (p.cap) k.box('shoe', p.shoe, L, 0.03, 0.032, 0, H - 0.015, 0, { r: 0.004 });
    return finish(k);
  },
});

const ropeRailing = S({
  id: 'st-railing-rope', ko: '로프 난간(원목 기둥)', en: 'Rope railing with timber posts',
  params: [P.len('length', '길이', 'Length', 2.4, 1.0, 6.0), H_PARAM(0.9, 0.6, 1.1), P.int('ropes', '로프 줄 수', 'Ropes', 2, 1, 3), P.mat('post', '기둥', 'Posts', 'wood-teak', 'wood'), P.mat('rope', '로프', 'Rope', 'fabric-linen-beige')],
  tags: ['rope railing', 'nautical railing', 'deck railing', 'rope barrier', '로프 난간', '밧줄 난간', '해양풍', '원목 기둥'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, H = p.height, n = Math.max(2, Math.round(L / 1.2) + 1), nr = clamp(Math.round(p.ropes), 1, 3);
    const xs = Array.from({ length: n }, (_, i) => -L / 2 + 0.05 + ((L - 0.1) * i) / (n - 1));
    for (const x of xs) {
      k.lathe('posts', p.post, [[0, 0], [0.06, 0], [0.06, 0.02], [0.05, 0.04], [0.05, H - 0.08], [0.056, H - 0.06], [0.05, H - 0.04], [0, H - 0.04]], x, 0, 0, { segs: k.seg(16, 8) });
      k.sphere('posts', p.post, 0.05, x, H - 0.04, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
      for (let r = 0; r < nr; r++) k.add('rings', 'metal-brass', new THREE.TorusGeometry(0.03, 0.007, k.seg(6, 4), k.seg(14, 8)).rotateY(PI / 2).translate(x, H - 0.12 - r * 0.25, 0));
    }
    for (let r = 0; r < nr; r++) for (let i = 0; i < n - 1; i++) {
      const y = H - 0.12 - r * 0.25, a = xs[i], b = xs[i + 1], sag = 0.06;
      const pts = Array.from({ length: 9 }, (_, j) => { const t = j / 8; return [a + (b - a) * t, y - sag * 4 * t * (1 - t), 0]; });
      k.tube('rope', p.rope, pts, 0.014, { radial: k.seg(8, 4), segs: k.seg(20, 8) });
    }
    return finish(k);
  },
});

const meshRailing = S({
  id: 'st-railing-mesh', ko: '철망 인필 난간', en: 'Steel railing with wire-mesh infill',
  params: [P.len('length', '길이', 'Length', 2.0, 0.6, 6.0), H_PARAM(1.0, 0.8, 1.2), P.len('pitch', '망 간격', 'Mesh pitch', 0.05, 0.03, 0.1), P.mat('metal', '금속', 'Metal', 'metal-black', 'metal')],
  tags: ['mesh railing', 'wire mesh', 'industrial railing', 'balustrade', '철망 난간', '메쉬 난간', '인더스트리얼', '난간'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, H = p.height, m = p.metal, n = Math.max(1, Math.ceil(L / 1.5));
    for (let i = 0; i <= n; i++) k.box('frame', m, 0.04, H - 0.04, 0.04, -L / 2 + 0.02 + ((L - 0.04) * i) / n, (H - 0.04) / 2, 0, { r: 0.003 });
    k.box('frame', m, L, 0.04, 0.05, 0, H - 0.02, 0, { r: 0.004 });
    k.box('frame', m, L, 0.03, 0.03, 0, 0.1, 0, { r: 0.002 });
    const pw = (L - 0.04) / n, mh = H - 0.04 - 0.115;
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + 0.04 + i * pw, iw = pw - 0.04;
      const nv = Math.max(2, Math.floor(iw / p.pitch)), nh = Math.max(2, Math.floor(mh / p.pitch));
      for (let a = 1; a < nv; a++) k.box('mesh', m, 0.003, mh, 0.003, x0 + (iw * a) / nv, 0.115 + mh / 2, 0, { r: 0 });
      for (let b = 1; b < nh; b++) k.box('mesh', m, iw, 0.003, 0.003, x0 + iw / 2, 0.115 + (mh * b) / nh, 0.003, { r: 0 });
    }
    return finish(k);
  },
});

const winder = S({
  id: 'st-stairs-winder', ko: 'ㄱ자 회전 계단(와인더)', en: 'Quarter-turn winder stairs',
  params: [P.len('width', '폭', 'Width', 0.9, 0.7, 1.2), P.len('rise', '단 높이', 'Rise', 0.19, 0.16, 0.21), P.len('run', '단 깊이', 'Run', 0.26, 0.22, 0.3), P.int('lower', '아래 단 수', 'Lower steps', 3, 1, 6), P.int('upper', '위 단 수', 'Upper steps', 6, 2, 10), P.bool('newel', '엄지기둥', 'Newel post', true), P.mat('body', '몸체', 'Body', 'paint-white-matte'), P.mat('treads', '디딤판', 'Treads', 'wood-oak', 'wood')],
  tags: ['winder stairs', 'quarter turn stairs', 'L-shaped stairs', 'staircase', '계단', '회전 계단', 'ㄱ자 계단', '와인더 계단'],
  build: (p, ctx) => {
    const k = new Kit(ctx), w = p.width, rs = p.rise, rn = p.run, n1 = clamp(Math.round(p.lower), 1, 6), n2 = clamp(Math.round(p.upper), 2, 10);
    const steps = [];
    for (let i = 0; i < n1; i++) { const z0 = w + (n1 - 1 - i) * rn; steps.push([[0, z0], [w, z0], [w, z0 + rn], [0, z0 + rn]]); }
    steps.push([[0, w], [w, w], [w, w * 0.42]]);
    steps.push([[0, w], [w, w * 0.42], [w, 0], [w * 0.42, 0]]);
    steps.push([[0, w], [w * 0.42, 0], [0, 0]]);
    for (let j = 0; j < n2; j++) { const x0 = -(j + 1) * rn; steps.push([[x0, 0], [x0 + rn, 0], [x0 + rn, w], [x0, w]]); }
    steps.forEach((pts, i) => {
      const top = (i + 1) * rs;
      k.slab('body', p.body, shapeOf(pts), top - 0.03, 0, { bevel: 0.002 });
      k.slab('treads', p.treads, shapeOf(pts), 0.03, top - 0.03, { bevel: 0.003 });
    });
    if (p.newel) {
      const nt = (n1 + 3) * rs + 0.9;
      k.box('newel', p.treads, 0.09, nt, 0.09, 0, nt / 2, w, { r: 0.006 });
      k.box('newel', p.treads, 0.12, 0.04, 0.12, 0, nt + 0.02, w, { r: 0.01 });
    }
    return finish(k);
  },
});

const atticLadder = S({
  id: 'st-attic-ladder', ko: '천장 접이식 다락 사다리', en: 'Pull-down attic ladder',
  params: [H_PARAM(2.6, 2.2, 3.2), P.len('width', '폭', 'Width', 0.6, 0.45, 0.8), P.len('hatch', '점검구 길이', 'Hatch length', 1.1, 0.9, 1.4), P.mat('wood', '사다리', 'Ladder', 'wood-pine', 'wood'), P.mat('frame', '점검구 틀', 'Hatch frame', 'paint-white-matte')],
  tags: ['attic ladder', 'loft ladder', 'folding ladder', 'ceiling hatch', '다락 사다리', '접이식 사다리', '천장 점검구', '다락'],
  build: (p, ctx) => {
    const k = new Kit(ctx), H = p.height, W = p.width, Lh = p.hatch, ang = 64 * DEG;
    for (const s of [-1, 1]) {
      k.box('frame', p.frame, W + 0.1, 0.12, 0.05, 0, H - 0.06, s * (Lh / 2 + 0.025), { r: 0.003 });
      k.box('frame', p.frame, 0.05, 0.12, Lh, s * (W / 2 + 0.025), H - 0.06, 0, { r: 0.003 });
    }
    const zt = -Lh / 2 + 0.05, dz = H / Math.tan(ang), Ld = H / Math.sin(ang), a = -Math.atan2(dz, H);
    const at = (t, off = 0) => [zt + dz * (1 - t) + off * Math.sin(ang), H * t + off * Math.cos(ang)];
    for (const s of [-1, 1]) {
      const [z, y] = at(0.5);
      k.box('ladder', p.wood, 0.03, Ld, 0.08, s * (W / 2 - 0.03), y, z, { r: 0.003, rx: a });
      for (const t of [1 / 3, 2 / 3]) { const [hz, hy] = at(t); k.box('hinges', 'metal-black', 0.034, 0.08, 0.07, s * (W / 2 - 0.03), hy, hz, { r: 0.002, rx: a }); }
    }
    const nt = Math.max(4, Math.floor(Ld / 0.27));
    for (let i = 1; i < nt; i++) { const [z, y] = at(i / nt); k.box('ladder', p.wood, W - 0.06, 0.025, 0.09, 0, y, z, { r: 0.003 }); }
    const [lz, ly] = at(1 - Lh / 2 / Ld, -0.06);
    k.box('lid', p.frame, W + 0.04, Lh, 0.02, 0, ly, lz, { r: 0.003, rx: a });
    return finish(k);
  },
});

/* ============================================================= fireplaces */

const bioWall = S({
  id: 'st-fireplace-bioethanol', placement: 'wall', elevation: 0.8, ko: '벽걸이 바이오에탄올 벽난로', en: 'Wall-mounted bioethanol fireplace',
  params: [P.len('width', '폭', 'Width', 0.9, 0.5, 1.6), H_PARAM(0.45, 0.3, 0.7), P.bool('fire', '불꽃', 'Fire', true), P.mat('body', '본체', 'Body', 'paint-black-matte')],
  tags: ['bioethanol fireplace', 'wall fireplace', 'ventless fireplace', 'modern fireplace', '바이오에탄올', '벽걸이 벽난로', '벽난로', '에탄올 난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, D = 0.16, b = p.body;
    k.box('body', b, W, H, 0.02, 0, H / 2, -D / 2 + 0.01, { r: 0.002 });
    for (const s of [-1, 1]) {
      k.box('body', b, W, 0.02, D, 0, s < 0 ? 0.01 : H - 0.01, 0, { r: 0.002 });
      k.box('body', b, 0.02, H, D, s * (W / 2 - 0.01), H / 2, 0, { r: 0.002 });
    }
    k.panel('body', b, frameShape(W + 0.03, H + 0.03, 0.05), 0.012, 0, H / 2, D / 2 + 0.006, { bevel: 0.002 });
    k.box('burner', 'metal-steel', W * 0.6, 0.04, 0.08, 0, 0.04, 0, { r: 0.003 });
    k.box('glass', 'glass-clear', W - 0.08, H - 0.08, 0.006, 0, H / 2, D / 2 - 0.01, { r: 0 });
    if (p.fire) flameRow(k, 0, 0.06, 0, W * 0.55, H - 0.14);
    return finish(k);
  },
});

const linearGas = S({
  id: 'st-fireplace-linear-gas', placement: 'wall', elevation: 0, ko: '리니어 가스 벽난로(미디어 월)', en: 'Linear gas fireplace media wall',
  params: [P.len('width', '폭', 'Width', 2.4, 1.6, 4.0), H_PARAM(2.4, 2.0, 3.0), P.len('depth', '깊이', 'Depth', 0.4, 0.3, 0.6), P.len('fireW', '화구 폭', 'Firebox width', 1.6, 0.8, 2.6), P.len('fireY', '화구 높이', 'Firebox height', 0.45, 0.2, 0.9), P.bool('fire', '불꽃', 'Fire', true), P.mat('wall', '벽 마감', 'Wall finish', 'wall-plaster'), P.mat('ledge', '선반', 'Ledge', 'concrete')],
  tags: ['linear fireplace', 'gas fireplace', 'media wall', 'modern fireplace', '가스 벽난로', '리니어 벽난로', '미디어 월', '벽난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, d = p.depth, fw = Math.min(p.fireW, W - 0.3), fh = 0.42, fy = Math.min(p.fireY, H - fh - 0.5), cy = fy + fh / 2;
    k.panel('wall', p.wall, rectWithHoles(W, H, [[0, cy, fw, fh]]), 0.03, 0, 0, d / 2 - 0.015, { bevel: 0.003 });
    for (const s of [-1, 1]) k.box('wall', p.wall, 0.03, H, d - 0.03, s * (W / 2 - 0.015), H / 2, -0.015, { r: 0 });
    k.box('wall', p.wall, W - 0.06, 0.03, d - 0.03, 0, H - 0.015, -0.015, { r: 0 });
    recess(k, 'firebox', 'paint-black-matte', 0, cy, fw, fh, d / 2 - 0.03, 0.28);
    k.box('glass', 'glass-clear', fw, fh, 0.006, 0, cy, d / 2 - 0.035, { r: 0 });
    const R = rng(7), np = Math.round(fw / 0.03) * 2;
    for (let i = 0; i < np; i++) k.sphere('pebbles', 'marble-black', 0.018 + R() * 0.008, -fw / 2 + 0.03 + R() * (fw - 0.06), fy + 0.02, d / 2 - 0.3 + 0.05 + R() * 0.17, { scale: [1, 0.6, 1], segs: k.seg(8, 4), rings: k.seg(6, 3) });
    if (p.fire) flameRow(k, 0, fy + 0.03, d / 2 - 0.18, fw - 0.1, fh - 0.12, 0.5);
    k.box('ledge', p.ledge, fw + 0.4, 0.05, 0.16, 0, fy - 0.1, d / 2 + 0.08, { r: 0.004 });
    return finish(k);
  },
});

const agungi = S({
  id: 'st-agungi-hearth', ko: '아궁이 부뚜막(가마솥)', en: 'Korean agungi hearth with cauldron',
  params: [P.len('width', '폭', 'Width', 1.4, 1.0, 2.4), H_PARAM(0.75, 0.6, 1.0), P.len('depth', '깊이', 'Depth', 0.8, 0.6, 1.1), P.int('pots', '가마솥 수', 'Cauldrons', 1, 1, 2), P.bool('fire', '불', 'Fire', true), P.mat('clay', '흙 마감', 'Clay', 'ceramic-terracotta'), P.mat('stone', '돌', 'Stone base', 'granite-grey', 'stone'), P.mat('iron', '솥', 'Cauldron', 'metal-black', 'metal'), P.mat('lid', '솥뚜껑', 'Lid', 'wood-pine', 'wood')],
  tags: ['agungi', 'korean hearth', 'cauldron', 'traditional kitchen', '아궁이', '부뚜막', '가마솥', '전통 부엌', '한옥'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, D = p.depth, n = clamp(Math.round(p.pots), 1, 2);
    const s = Math.min(1, (W / n) / 0.95, (D - 0.1) / 0.86), pl = 0.12;
    k.box('stone', p.stone, W + 0.04, pl, D + 0.04, 0, pl / 2, 0, { r: 0.01 });
    const xs = Array.from({ length: n }, (_, i) => -W / 2 + (W / n) * (i + 0.5));
    const fh = H - pl, mh = Math.min(0.4 * s + 0.08, fh - 0.12);
    const front = shapeOf([[-W / 2, 0], [W / 2, 0], [W / 2, fh], [-W / 2, fh]]);
    for (const x of xs) front.holes.push(new THREE.Path(archOutline(0.15 * s + 0.05, mh, 'round', k.seg(16, 8)).map(([hx, hy]) => V2(x + hx, hy + 0.04)).reverse()));
    k.panel('clay', p.clay, front, 0.08, 0, pl, D / 2 - 0.04, { bevel: 0.01 });
    for (const sx of [-1, 1]) k.box('clay', p.clay, 0.08, fh, D - 0.08, sx * (W / 2 - 0.04), pl + fh / 2, -0.04, { r: 0.008 });
    k.box('clay', p.clay, W - 0.16, fh, 0.08, 0, pl + fh / 2, -D / 2 + 0.04, { r: 0.008 });
    const top = new THREE.Shape([V2(-W / 2, -D / 2), V2(W / 2, -D / 2), V2(W / 2, D / 2), V2(-W / 2, D / 2)]);
    for (const x of xs) { const h = new THREE.Path(); h.absarc(x, 0, 0.3 * s, 0, PI * 2, true); top.holes.push(h); }
    k.slab('clay', p.clay, top, 0.06, H - 0.06, { bevel: 0.01 });
    k.box('soot', 'paint-black-matte', W - 0.16, fh - 0.06, D - 0.24, 0, pl + (fh - 0.06) / 2, -0.04, { r: 0 });
    for (const x of xs) {
      const pr = [[0, 0], [0.18, 0.02], [0.3, 0.15], [0.34, 0.22], [0.42, 0.24], [0.42, 0.26], [0.33, 0.27], [0.32, 0.3], [0, 0.3]].map(([r, y]) => [r * s, y * s]);
      const py = H - 0.25 * s;
      k.lathe('cauldron', p.iron, pr, x, py, 0, { segs: k.seg(28, 10) });
      k.lathe('lid', p.lid, [[0, 0], [0.31, 0], [0.3, 0.035], [0.2, 0.075], [0, 0.085]].map(([r, y]) => [r * s, y * s]), x, py + 0.3 * s, 0, { segs: k.seg(28, 10) });
      k.cyl('lid', p.lid, 0.03 * s, 0.035 * s, 0.05 * s, x, py + 0.38 * s, 0, { segs: k.seg(12, 6) });
      if (p.fire) {
        for (const dz of [-0.02, 0.02]) k.rod('logs', 'wood-dark', [x - 0.12 * s, pl + 0.06, D / 2 - 0.2 + dz], [x + 0.12 * s, pl + 0.05, D / 2 - 0.3 - dz], 0.03, { segs: k.seg(8, 5) });
        flameRow(k, x, pl + 0.06, D / 2 - 0.25, 0.24 * s, mh - 0.1, 0.6);
      }
    }
    return finish(k);
  },
});

const kachelofen = S({
  id: 'st-kachelofen', ko: '타일 축열 난로(카헬오펜)', en: 'Tiled masonry stove (Kachelofen)',
  params: [P.len('width', '폭', 'Width', 1.0, 0.7, 1.4), H_PARAM(1.7, 1.2, 2.2), P.len('depth', '깊이', 'Depth', 0.65, 0.5, 0.9), P.bool('bench', '난로 벤치', 'Stove bench', true), P.mat('tiles', '타일', 'Tiles', 'ceramic-matte'), P.color('tileColor', '타일 색', 'Tile colour', '#2f5d4e'), P.mat('seat', '벤치 상판', 'Bench seat', 'wood-oak', 'wood')],
  tags: ['kachelofen', 'masonry stove', 'tiled stove', 'tile stove', '타일 난로', '축열 난로', '벽난로', '유럽 난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, D = p.depth, ov = { overrides: { color: p.tileColor } };
    k.box('core', 'wall-plaster', W - 0.04, H - 0.2, D - 0.04, 0, 0.1 + (H - 0.2) / 2, 0, { r: 0 });
    k.box('plinth', p.tiles, W + 0.04, 0.1, D + 0.04, 0, 0.05, 0, { r: 0.006, ...ov });
    const bh = H - 0.2, rows = Math.max(3, Math.round(bh / 0.2)), th = bh / rows;
    const face = (cols, fw, place) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place(-fw / 2 + (fw / cols) * (c + 0.5), 0.1 + th * (r + 0.5), fw / cols - 0.008, th - 0.008); };
    face(Math.max(2, Math.round(W / 0.2)), W - 0.04, (x, y, tw, tH) => k.box('tiles', p.tiles, tw, tH, 0.03, x, y, D / 2 - 0.01, { r: 0.01, ...ov }));
    for (const s of [-1, 1]) face(Math.max(2, Math.round(D / 0.2)), D - 0.04, (z, y, tw, tH) => k.box('tiles', p.tiles, 0.03, tH, tw, s * (W / 2 - 0.01), y, z, { r: 0.01, ...ov }));
    k.box('plinth', p.tiles, W + 0.06, 0.06, D + 0.06, 0, H - 0.07, 0, { r: 0.01, ...ov });
    k.box('plinth', p.tiles, W + 0.1, 0.04, D + 0.1, 0, H - 0.02, 0, { r: 0.01, ...ov });
    k.box('door', 'metal-black', 0.32, 0.3, 0.025, 0, 0.5, D / 2 + 0.012, { r: 0.004 });
    k.panel('door', 'metal-black', frameShape(0.38, 0.36, 0.03), 0.012, 0, 0.5, D / 2 + 0.03, { bevel: 0.002 });
    k.cyl('door', 'metal-brass', 0.012, 0.012, 0.04, 0.12, 0.5, D / 2 + 0.025, { rx: PI / 2, segs: k.seg(10, 5) });
    if (p.bench) {
      const bl = 0.9, bw = 0.45;
      k.box('core', 'wall-plaster', bl, 0.42, bw, W / 2 + bl / 2, 0.21, -D / 2 + bw / 2, { r: 0 });
      for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) k.box('tiles', p.tiles, bl / 4 - 0.008, 0.2, 0.03, W / 2 + (bl / 4) * (c + 0.5), 0.01 + 0.105 + r * 0.205, -D / 2 + bw + 0.005, { r: 0.01, ...ov });
      k.box('seat', p.seat, bl + 0.02, 0.04, bw + 0.04, W / 2 + bl / 2 + 0.01, 0.44, -D / 2 + bw / 2 + 0.02, { r: 0.006 });
    }
    return finish(k);
  },
});

const suspended = S({
  id: 'st-fireplace-suspended', placement: 'ceiling', elevation: 0.55, ko: '천장 매달린 원형 벽난로', en: 'Suspended hanging fireplace',
  params: [P.len('diameter', '지름', 'Diameter', 0.8, 0.6, 1.2), P.len('flue', '연통 길이', 'Flue length', 1.1, 0.3, 2.5), P.bool('fire', '불꽃', 'Fire', true), P.mat('body', '본체', 'Body', 'paint-black-matte')],
  tags: ['suspended fireplace', 'hanging fireplace', 'central fireplace', 'designer fireplace', '매달린 벽난로', '행잉 난로', '원형 벽난로', '벽난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx), s = p.diameter / 0.8, b = p.body;
    const prof = [[0.001, 0], [0.2, 0.0], [0.36, 0.06], [0.4, 0.18], [0.38, 0.36], [0.28, 0.52], [0.12, 0.62], [0.09, 0.66]].map(([r, y]) => V2(r * s, y * s));
    const segs = k.seg(36, 12), gap = 0.9;
    k.add('body', b, new THREE.LatheGeometry(prof, segs, gap, 2 * PI - 2 * gap));
    k.add('body', b, new THREE.LatheGeometry(prof.slice().reverse().map((v) => V2(v.x * 0.97, v.y + 0.004)), segs, gap, 2 * PI - 2 * gap));
    k.cyl('hearth', 'metal-steel', 0.3 * s, 0.3 * s, 0.03, 0, 0.04 * s, 0, { segs: k.seg(24, 8) });
    k.cyl('body', b, 0.09 * s, 0.09 * s, p.flue, 0, 0.66 * s, 0, { segs: k.seg(20, 8) });
    k.cyl('body', b, 0.16 * s, 0.16 * s, 0.015, 0, 0.66 * s + p.flue - 0.015, 0, { segs: k.seg(20, 8) });
    if (p.fire) {
      for (const dz of [-0.03, 0.03]) k.rod('logs', 'wood-dark', [-0.15 * s, 0.09 * s, dz * s], [0.15 * s, 0.085 * s, -dz * s], 0.028 * s, { segs: k.seg(8, 5) });
      flameRow(k, 0, 0.08 * s, 0.05 * s, 0.3 * s, 0.2 * s, 0.6);
    }
    return finish(k);
  },
});

const victorian = S({
  id: 'st-fireplace-victorian', placement: 'wall', elevation: 0, ko: '빅토리안 주철 벽난로(타일)', en: 'Victorian cast-iron fireplace with tiles',
  params: [P.len('width', '폭', 'Width', 1.5, 1.2, 2.0), H_PARAM(1.25, 1.0, 1.5), P.bool('fire', '불꽃', 'Fire', true), P.mat('surround', '맨틀', 'Surround', 'paint-white-gloss'), P.mat('insert', '주철 인서트', 'Cast-iron insert', 'metal-black', 'metal'), P.mat('tiles', '측면 타일', 'Cheek tiles', 'tile-mosaic-blue'), P.mat('hearth', '바닥 타일', 'Hearth tiles', 'tile-checker')],
  tags: ['victorian fireplace', 'cast iron fireplace', 'tiled fireplace', 'mantelpiece', '빅토리안 벽난로', '주철 벽난로', '벽난로', '맨틀'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, sm = p.surround, iw = W - 0.4, ih = H - 0.4;
    for (const s of [-1, 1]) {
      k.box('surround', sm, 0.2, H - 0.15, 0.12, s * (W / 2 - 0.1), (H - 0.15) / 2, 0.06, { r: 0.004 });
      k.box('surround', sm, 0.24, 0.1, 0.16, s * (W / 2 - 0.1), H - 0.19, 0.08, { r: 0.006 });
      k.box('tiles', p.tiles, 0.15, ih, 0.02, s * (iw / 2 - 0.075), ih / 2 + 0.03, 0.01, { r: 0 });
    }
    k.box('surround', sm, W - 0.4, 0.25, 0.1, 0, H - 0.15 - 0.125, 0.05, { r: 0.004 });
    k.box('surround', sm, W + 0.1, 0.04, 0.24, 0, H - 0.02, 0.1, { r: 0.006 });
    const cw = iw - 0.3;
    openingWall(k, 'insert', p.insert, cw, ih, 0.03, archOutline(Math.min(cw / 2 - 0.12, ih - 0.3), ih - 0.12, 'round', k.seg(20, 8)), 0.015);
    k.box('insert', p.insert, cw, 0.03, 0.025, 0, ih + 0.045, 0.015, { r: 0.003 });
    k.box('fireback', 'paint-black-matte', cw - 0.2, ih - 0.1, 0.02, 0, (ih - 0.1) / 2 + 0.03, -0.18, { r: 0 });
    for (const s of [-1, 1]) k.box('fireback', 'paint-black-matte', 0.02, ih - 0.1, 0.18, s * (cw / 2 - 0.12), (ih - 0.1) / 2 + 0.03, -0.09, { r: 0 });
    for (let i = 0; i < 5; i++) k.rod('grate', p.insert, [-0.2, 0.06 + i * 0.03, 0.0], [0.2, 0.06 + i * 0.03, 0.0], 0.006, { segs: k.seg(6, 4) });
    if (p.fire) flameRow(k, 0, 0.08, -0.06, 0.34, 0.25, 0.5);
    k.box('hearth', p.hearth, W - 0.1, 0.03, 0.45, 0, 0.015, 0.225 + 0.12, { r: 0.003 });
    return finish(k);
  },
});

const mantelShelf = S({
  id: 'st-mantel-floating', placement: 'wall', elevation: 1.2, ko: '원목 맨틀 선반(까치발)', en: 'Floating timber mantel with corbels',
  params: [P.len('length', '길이', 'Length', 1.6, 0.8, 2.6), H_PARAM(0.18, 0.1, 0.3), P.len('depth', '깊이', 'Depth', 0.24, 0.15, 0.35), P.bool('corbels', '까치발', 'Corbels', true), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood')],
  tags: ['mantel', 'mantel shelf', 'floating shelf', 'corbel', '맨틀', '벽난로 선반', '까치발', '원목 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, h = p.height, d = p.depth, cy = p.corbels ? 0.2 : 0;
    k.box('beam', p.wood, L, h, d, 0, cy + h / 2, d / 2, { r: 0.006, segs: 2 });
    if (p.corbels) {
      const pts = [[0, 0], [0.05, 0], [0.045, 0.05], [0.09, 0.1], [0.15, 0.13], [d * 0.8, 0.17], [d * 0.8, 0.2], [0, 0.2]];
      for (const s of [-1, 1]) alongX(k, 'beam', p.wood, pts, 0.07, { x: s * (L / 2 - 0.25) });
    }
    return finish(k);
  },
});

/* ================================================================= Korean */

const jjokmaru = S({
  id: 'st-jjokmaru', ko: '쪽마루(툇마루 판재)', en: 'Korean jjokmaru veranda strip',
  params: [P.len('length', '길이', 'Length', 2.4, 1.0, 4.0), P.len('depth', '깊이', 'Depth', 0.45, 0.3, 0.7), H_PARAM(0.45, 0.3, 0.6), P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'), P.mat('stone', '초석', 'Footing stones', 'granite-grey', 'stone')],
  tags: ['jjokmaru', 'korean veranda', 'hanok', 'wooden porch', '쪽마루', '툇마루', '한옥', '마루'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, D = p.depth, H = p.height, w = p.wood;
    const np = Math.max(2, Math.round(L / 1.2) + 1);
    for (let i = 0; i < np; i++) {
      const x = -L / 2 + 0.08 + ((L - 0.16) * i) / (np - 1);
      latheMod(k, 'stone', p.stone, [[0, 0], [0.14, 0], [0.15, 0.04], [0.12, 0.11], [0, 0.12]], k.seg(14, 7), (r, th, y) => [r * (1 + 0.1 * Math.sin(3 * th + i * 2)), y], x, 0, D / 2 - 0.1);
      k.cyl('posts', w, 0.055, 0.06, H - 0.12 - 0.13, x, 0.12, D / 2 - 0.1, { segs: k.seg(14, 6) });
      k.box('posts', w, 0.08, 0.1, D, x, H - 0.035 - 0.05 - 0.04, 0, { r: 0.004 });
    }
    k.box('posts', w, L, 0.12, 0.1, 0, H - 0.035 - 0.06, D / 2 - 0.1, { r: 0.006 });
    const nb = Math.max(2, Math.round(D / 0.15));
    for (let j = 0; j < nb; j++) k.box('boards', w, L, 0.035, D / nb - 0.004, 0, H - 0.0175, -D / 2 + (D / nb) * (j + 0.5), { r: 0.003 });
    return finish(k);
  },
});

/* ================================================================ services */

const manifold = S({
  id: 'st-ufh-manifold', placement: 'wall', elevation: 0.3, ko: '난방 분배기함(바닥 난방)', en: 'Underfloor heating manifold cabinet',
  params: [P.len('width', '폭', 'Width', 0.8, 0.5, 1.2), H_PARAM(0.6, 0.45, 0.8), P.int('loops', '난방 회로 수', 'Loops', 6, 2, 12), P.mat('cabinet', '함', 'Cabinet', 'paint-white-matte')],
  tags: ['heating manifold', 'underfloor heating', 'boiler', 'manifold cabinet', '분배기', '난방 분배기', '바닥 난방', '보일러'],
  build: (p, ctx) => {
    const k = new Kit(ctx), W = p.width, H = p.height, D = 0.12, c = p.cabinet, n = clamp(Math.round(p.loops), 2, 12);
    k.box('cabinet', c, W, H, 0.01, 0, H / 2, -D / 2 + 0.005, { r: 0 });
    for (const s of [-1, 1]) {
      k.box('cabinet', c, W, 0.012, D, 0, s < 0 ? 0.006 : H - 0.006, 0, { r: 0 });
      k.box('cabinet', c, 0.012, H, D, s * (W / 2 - 0.006), H / 2, 0, { r: 0 });
    }
    k.panel('cabinet', c, frameShape(W, H, 0.03), 0.015, 0, H / 2, D / 2, { bevel: 0.002 });
    const bl = W - 0.16, x0 = -bl / 2 + 0.05, pitch = (bl - 0.08) / Math.max(1, n - 1);
    const rows = [[H * 0.68, '#c0392b'], [H * 0.38, '#2c6fbb']];
    for (const [y, col] of rows) {
      k.cyl('brass', 'metal-brass', 0.017, 0.017, bl, -bl / 2, y, 0, { rz: -PI / 2, segs: k.seg(14, 6) });
      k.cyl('caps', 'plastic-white', 0.02, 0.02, 0.05, -bl / 2 - 0.05, y - 0.02, 0, { segs: k.seg(12, 6), overrides: { color: col } });
      for (let i = 0; i < n; i++) {
        const x = x0 + i * pitch;
        k.cyl('caps', 'plastic-white', 0.012, 0.012, 0.035, x, y, 0.012, { rx: PI / 2, segs: k.seg(10, 5), overrides: { color: col } });
        k.cyl('brass', 'metal-brass', 0.009, 0.009, 0.05, x, y - 0.065, 0, { segs: k.seg(10, 5) });
      }
    }
    for (let i = 0; i < n; i++) {
      const x = x0 + i * pitch;
      k.rod('pipes', 'plastic-white', [x - 0.012, H * 0.68 - 0.06, 0.02], [x - 0.012, 0.0, 0.02], 0.008, { segs: k.seg(8, 4), overrides: { color: '#d8d2c4' } });
      k.rod('pipes', 'plastic-white', [x + 0.012, H * 0.38 - 0.06, -0.02], [x + 0.012, 0.0, -0.02], 0.008, { segs: k.seg(8, 4), overrides: { color: '#d8d2c4' } });
    }
    return finish(k);
  },
});

const diffuser = S({
  id: 'st-hvac-diffuser', placement: 'ceiling', elevation: 2.4, ko: '천장 사각 디퓨저(4방향)', en: 'Square 4-way ceiling diffuser',
  params: [P.len('size', '크기', 'Size', 0.6, 0.3, 0.75), P.bool('neck', '덕트 목', 'Duct neck', true), P.mat('metal', '마감', 'Finish', 'metal-white', 'metal')],
  tags: ['diffuser', 'air vent', 'hvac', 'ceiling vent', '디퓨저', '환기구', '에어컨 토출구', '천장 그릴'],
  build: (p, ctx) => {
    const k = new Kit(ctx), Sz = p.size, m = p.metal;
    for (const s of [-1, 1]) {
      k.box('face', m, Sz, 0.012, 0.04, 0, 0.006, s * (Sz / 2 - 0.02), { r: 0.002 });
      k.box('face', m, 0.04, 0.012, Sz - 0.08, s * (Sz / 2 - 0.02), 0.006, 0, { r: 0.002 });
    }
    const nr = Sz > 0.45 ? 4 : 3;
    for (let j = 0; j < nr; j++) {
      const half = Sz / 2 - 0.05 - j * ((Sz / 2 - 0.1) / nr), y = 0.012 + j * 0.012;
      for (const s of [-1, 1]) {
        k.box('louvres', m, 2 * half, 0.004, 0.045, 0, y, s * (half - 0.015), { r: 0, rx: s * 0.6 });
        k.box('louvres', m, 0.045, 0.004, 2 * half, s * (half - 0.015), y, 0, { r: 0, rz: -s * 0.6 });
      }
    }
    k.box('face', m, Sz * 0.22, 0.01, Sz * 0.22, 0, 0.006, 0, { r: 0.002 });
    if (p.neck) k.box('neck', 'metal-aluminium', Sz * 0.45, 0.16, Sz * 0.45, 0, 0.09, 0, { r: 0.003 });
    return finish(k);
  },
});

const duct = S({
  id: 'st-duct-spiral', placement: 'ceiling', elevation: 2.4, ko: '노출 스파이럴 덕트', en: 'Exposed spiral duct run',
  params: [P.len('length', '길이', 'Length', 3.0, 1.0, 6.0), P.len('diameter', '지름', 'Diameter', 0.32, 0.15, 0.6), P.len('drop', '행거 길이', 'Hanger drop', 0.3, 0.1, 1.0), P.bool('branch', '분기 디퓨저', 'Branch diffuser', true), P.mat('metal', '금속', 'Metal', 'metal-aluminium', 'metal')],
  tags: ['spiral duct', 'exposed duct', 'ductwork', 'industrial ceiling', '덕트', '스파이럴 덕트', '노출 천장', '공조'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, r = p.diameter / 2, m = p.metal, yc = 0.4 + r;
    k.cyl('duct', m, r, r, L, -L / 2, yc, 0, { rz: -PI / 2, segs: k.seg(28, 10) });
    const turns = Math.max(2, Math.round(L / 0.15)), per = k.seg(12, 6), pts = [];
    for (let i = 0; i <= turns * per; i++) { const t = i / (turns * per), a = t * turns * 2 * PI; pts.push([-L / 2 + L * t, yc + (r + 0.002) * Math.cos(a), (r + 0.002) * Math.sin(a)]); }
    k.tube('seam', m, pts, 0.003, { radial: 3, segs: Math.min(1600, turns * per) });
    const nh = Math.max(2, Math.round(L / 1.5) + 1);
    for (let i = 0; i < nh; i++) {
      const x = -L / 2 + 0.2 + ((L - 0.4) * i) / (nh - 1);
      k.add('hangers', 'metal-steel', new THREE.TorusGeometry(r + 0.006, 0.004, 4, k.seg(24, 10)).rotateY(PI / 2).translate(x, yc, 0));
      for (const s of [-1, 1]) k.rod('hangers', 'metal-steel', [x, yc, s * (r + 0.006)], [x, yc + r + p.drop, s * (r + 0.006)], 0.004, { segs: 4 });
    }
    if (p.branch) {
      const br = r * 0.6;
      k.cyl('duct', m, br, br, yc - 0.1, L / 4, 0.1, 0, { segs: k.seg(20, 8) });
      k.cyl('duct', m, br * 1.8, br, 0.1, L / 4, 0, 0, { segs: k.seg(20, 8) });
      k.cyl('vent', 'paint-black-matte', br * 1.7, br * 1.7, 0.004, L / 4, -0.002, 0, { segs: k.seg(20, 8) });
    }
    return finish(k);
  },
});

const cableTray = S({
  id: 'st-cable-tray', placement: 'ceiling', elevation: 2.5, ko: '케이블 트레이(사다리형)', en: 'Ladder cable tray',
  params: [P.len('length', '길이', 'Length', 3.0, 1.0, 6.0), P.len('width', '폭', 'Width', 0.3, 0.15, 0.6), P.len('drop', '행거 길이', 'Hanger drop', 0.3, 0.1, 1.0), P.bool('cables', '케이블', 'Cables', true), P.mat('metal', '금속', 'Metal', 'metal-steel', 'metal')],
  tags: ['cable tray', 'cable ladder', 'wiring', 'industrial ceiling', '케이블 트레이', '전선 트레이', '노출 배선', '공장 천장'],
  build: (p, ctx) => {
    const k = new Kit(ctx), L = p.length, W = p.width, m = p.metal;
    for (const s of [-1, 1]) k.box('rails', m, L, 0.08, 0.02, 0, 0.08, s * (W / 2 - 0.01), { r: 0.002 });
    const nr = Math.max(2, Math.floor(L / 0.25));
    for (let i = 0; i <= nr; i++) k.box('rails', m, 0.025, 0.015, W - 0.02, -L / 2 + 0.02 + ((L - 0.04) * i) / nr, 0.05, 0, { r: 0 });
    const nh = Math.max(2, Math.round(L / 1.5) + 1);
    for (let i = 0; i < nh; i++) {
      const x = -L / 2 + 0.15 + ((L - 0.3) * i) / (nh - 1);
      k.box('hangers', m, 0.04, 0.04, W + 0.12, x, 0.02, 0, { r: 0.002 });
      for (const s of [-1, 1]) k.rod('hangers', m, [x, 0, s * (W / 2 + 0.04)], [x, 0.12 + p.drop, s * (W / 2 + 0.04)], 0.005, { segs: 5 });
    }
    if (p.cables) {
      const cols = ['#202020', '#3a3a3a', '#5a5a5a', '#2b4a7a', '#7a2b2b', '#202020'];
      cols.forEach((col, i) => {
        const z = -W / 2 + 0.04 + ((W - 0.08) * (i % 3)) / 2, y = 0.07 + (i >= 3 ? 0.02 : 0);
        k.rod('cables', 'plastic-black', [-L / 2, y, z + (i >= 3 ? 0.01 : 0)], [L / 2, y, z + (i >= 3 ? 0.01 : 0)], 0.01, { segs: k.seg(8, 4), overrides: { color: col } });
      });
    }
    return finish(k);
  },
});

export const ITEMS = [
  corinthian, tuscanCol, solomonic, hanokPillar, kneeBrace, castIron, craftsman, pipeCol, octMosaic,
  glulam, openWeb, waffle, joists, tray, barrel, gridTiles, baffles, backlit, rafters,
  frameMouldings, shiplap, beadboard, tileWainscot, shadowGap, eggDart, architrave, panel3d,
  tvNiche, showerNiche, slatPartition, perforated, officeGlass, slidingPartition, chimneyNiche,
  horseshoe, tudor, keystone, colonnade,
  accessFloor, stage, hatch, grille, mezzanine,
  runnerStairs, glassBalustrade, ropeRailing, meshRailing, winder, atticLadder,
  bioWall, linearGas, agungi, kachelofen, suspended, victorian, mantelShelf,
  jjokmaru, manifold, diffuser, duct, cableTray,
];
