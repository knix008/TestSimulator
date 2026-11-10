// Dining: tables, chairs, bench, bar stool, sideboard.
import { THREE, Kit, item, P, OPT, roundRect, ellipse, superEllipse, shellGeo, transformAdded } from './helpers.js';
import { addFronts } from './living.js';

/** Moves every mesh / marker so the bounding box is centred on x and z (raked backs etc.). */
export function recentre(g) {
  const box = new THREE.Box3().setFromObject(g);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  if (Math.abs(cx) < 1e-5 && Math.abs(cz) < 1e-5) return g;
  for (const o of g.children) {
    if (o.isMesh) { o.geometry.translate(-cx, 0, -cz); o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); } else o.position.x -= cx, o.position.z -= cz;
  }
  return g;
}

/** A thin curved shell (bent plywood back / seat): width w along x bent on radius R, height h along y. */
export function curvedPanel(w, h, R, thick, nu = 16) {
  const ang = w / R;
  return shellGeo(nu, 2, (u, v) => {
    const a = (u - 0.5) * ang;
    return [R * Math.sin(a), v * h, R * Math.cos(a) - R];
  }, thick);
}

/**
 * Four tapered round legs whose feet splay OUTWARDS by `splay` (helpers.addLegs tilts its
 * 'tapered' legs inwards). Tops at y = h on a w × d rectangle inset by `inset`.
 * Returns leg(xSign, zSign, y) → [x, z] of the leg axis at height y (for stretchers).
 */
export function splayLegs(k, role, mat, w, d, h, { inset = 0.05, r = 0.022, rFoot = r * 0.6, splay = 0.03, square = false } = {}) {
  const xs = w / 2 - inset, zs = d / 2 - inset;
  const at = (sx, sz, y) => [sx * (xs + splay * (1 - y / h)), sz * (zs + splay * (1 - y / h))];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [fx, fz] = at(sx, sz, 0);
    if (square) k.box(role, mat, r * 1.8, h, r * 1.8, sx * xs, h / 2, sz * zs, { r: 0.003 });
    else k.rod(role, mat, [fx, 0, fz], [sx * xs, h, sz * zs], rFoot, { r2: r, segs: k.seg(14, 6) });
  }
  return at;
}

/* ---------------------------------------------------------------- table */

const diningTable = item({
  id: 'dining-table', category: 'dining', ko: '식탁', en: 'Dining table', size: [1.6, 0.75, 0.9],
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round'], ['oval', '타원', 'Oval']]),
    P.len('length', '길이', 'Length', 1.6, 0.8, 3.0),
    P.len('depth', '폭(깊이)', 'Depth', 0.9, 0.7, 1.2),
    P.int('leaves', '확장판', 'Extension leaves', 0, 0, 2),
    P.len('height', '높이', 'Height', 0.75, 0.65, 0.8),
    P.pick('legs', '다리', 'Legs', 'tapered', [['tapered', '원목 테이퍼', 'Tapered wood'], ['square', '사각 원목', 'Square wood'], ['trestle', '판재 다리', 'Slab trestle'], ['metal', '금속 프레임', 'Metal frame'], ['pedestal', '받침대', 'Pedestal']]),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.pick('top', '상판', 'Top', 'wood', [['wood', '원목', 'Wood'], ['marble', '대리석', 'Marble'], ['ceramic', '세라믹', 'Ceramic']]),
  ],
  tags: ['dining table', 'table', '식탁', '다이닝 테이블', '6인용', '4인용', 'extendable'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const ext = p.leaves * 0.45;
    const round = p.shape === 'round';
    const d = round ? p.length : p.depth;
    const L = (round ? p.length : p.length) + ext;
    const h = p.height, t = p.top === 'wood' ? 0.035 : 0.025;
    const topMat = p.top === 'marble' ? 'marble-white' : p.top === 'ceramic' ? 'terrazzo' : p.wood;
    // round + leaves becomes a racetrack; oval is a soft superellipse
    const shape = round ? (ext > 0 ? roundRect(L, d, d / 2) : ellipse(L, d)) : p.shape === 'oval' ? superEllipse(L, d, 2.4, 72) : roundRect(L, d, 0.012);
    k.slab('top', topMat, shape, t, h - t, { bevel: 0.006, curveSegs: 48 });
    if (p.top !== 'wood') k.slab('frame', p.wood, round || p.shape === 'oval' ? (ext > 0 && round ? roundRect(L - 0.12, d - 0.12, (d - 0.12) / 2) : p.shape === 'oval' ? superEllipse(L - 0.12, d - 0.12, 2.4, 48) : ellipse(L - 0.12, d - 0.12)) : roundRect(L - 0.12, d - 0.12, 0.01), 0.012, h - t - 0.012, { bevel: 0.002 });
    const legH = h - t;
    const pedestal = p.legs === 'pedestal' || (round && ext === 0 && p.legs !== 'tapered' && p.legs !== 'metal');
    if (pedestal) {
      // tulip-like pedestal(s): flared foot, slim waist, flared top
      const r = Math.min(0.28, d * 0.32);
      const prof = [[0, 0], [r, 0], [r, 0.012], [r * 0.85, 0.03], [r * 0.25, legH * 0.2], [r * 0.16, legH * 0.55], [r * 0.3, legH * 0.92], [r * 0.45, legH - 0.004], [r * 0.45, legH], [0, legH]];
      const xs = L - d > 0.3 ? [-(L - d) / 2 * 0.75, (L - d) / 2 * 0.75] : [0];
      for (const x of xs) k.lathe('legs', p.wood, prof, x, 0, 0, { smooth: 24, segs: k.seg(36, 10) });
    } else if (p.legs === 'trestle') {
      for (const s of [-1, 1]) {
        const x = s * (L / 2 - (round || p.shape === 'oval' ? L * 0.24 : Math.min(0.25, L * 0.15)));
        k.box('legs', p.wood, 0.05, legH - 0.03, d * 0.72, x, (legH - 0.03) / 2, 0, { r: 0.004, segs: 2 });
        k.box('legs', p.wood, 0.08, 0.03, d * 0.78, x, legH - 0.015, 0, { r: 0.004 });
      }
      k.box('legs', p.wood, L - 2 * (round || p.shape === 'oval' ? L * 0.24 : Math.min(0.25, L * 0.15)), 0.06, 0.035, 0, legH - 0.12, 0, { r: 0.004 });
    } else if (p.legs === 'metal' && !round && p.shape !== 'oval') {
      // two closed rectangular steel frames, slightly in from the ends
      for (const s of [-1, 1]) {
        const x = s * (L / 2 - Math.min(0.18, L * 0.12)), zz = d / 2 - 0.08;
        const bar = (w, hh, dd, px, py, pz) => k.box('legs', 'metal-black', w, hh, dd, px, py, pz, { r: 0.003 });
        bar(0.04, legH, 0.04, x, legH / 2, -zz); bar(0.04, legH, 0.04, x, legH / 2, zz);
        bar(0.04, 0.04, 2 * zz + 0.04, x, 0.02, 0); bar(0.04, 0.03, 2 * zz + 0.04, x, legH - 0.015, 0);
      }
      k.box('legs', 'metal-black', L - 2 * Math.min(0.18, L * 0.12), 0.03, 0.03, 0, legH - 0.015, 0, { r: 0.003 });
    } else if (p.legs === 'metal') {
      // round / oval tops: four slim steel legs under a ring
      const inset = Math.min(L, d) * 0.2;
      const lw = L - (L - Math.min(L, d)) * 0.3;
      splayLegs(k, 'legs', 'metal-black', lw, d, legH, { inset, r: 0.014, rFoot: 0.012, splay: 0.02 });
      k.add('legs', 'metal-black', new THREE.TorusGeometry(Math.min(lw, d) / 2 - inset, 0.01, k.seg(8, 4), k.seg(48, 12)).rotateX(Math.PI / 2).scale(lw > d + 0.01 ? (lw / 2 - inset) / (d / 2 - inset) : 1, 1, 1).translate(0, legH - 0.012, 0));
    } else {
      const inset = round || p.shape === 'oval' ? Math.min(L, d) * 0.17 : 0.07;
      const lw = round || p.shape === 'oval' ? L - (L - Math.min(L, d)) * 0.3 : L;
      splayLegs(k, 'legs', p.wood, lw, d, legH, { inset, r: 0.027, rFoot: 0.016, splay: p.legs === 'square' ? 0 : 0.03, square: p.legs === 'square' });
      // apron rails between the legs (inset 15 mm behind the leg faces)
      const ax = lw / 2 - inset, az = d / 2 - inset;
      if (!round && p.shape !== 'oval') {
        k.box('frame', p.wood, 2 * ax, 0.08, 0.022, 0, legH - 0.04, az - 0.005, { r: 0.002 });
        k.box('frame', p.wood, 2 * ax, 0.08, 0.022, 0, legH - 0.04, -az + 0.005, { r: 0.002 });
        k.box('frame', p.wood, 0.022, 0.08, 2 * az, ax - 0.005, legH - 0.04, 0, { r: 0.002 });
        k.box('frame', p.wood, 0.022, 0.08, 2 * az, -ax + 0.005, legH - 0.04, 0, { r: 0.002 });
      } else {
        k.box('frame', p.wood, 2 * ax, 0.07, 0.022, 0, legH - 0.035, 0, { r: 0.002 });
        k.box('frame', p.wood, 0.022, 0.07, 2 * az, 0, legH - 0.035, 0, { r: 0.002 });
      }
    }
    return k.group();
  },
});

/* ---------------------------------------------------------------- chairs */

/** Dining chair geometry (front +z, seat ≈ 0.46). Shared with the bench / stool family. */
export function buildChair(k, p) {
  const sh = 0.46;
  if (p.style === 'upholstered') {
    splayLegs(k, 'legs', p.wood, 0.42, 0.42, sh - 0.07, { inset: 0.035, r: 0.018, rFoot: 0.012, splay: 0.02 });
    k.box('legs', p.wood, 0.42, 0.04, 0.42, 0, sh - 0.09, 0, { r: 0.004 });
    k.soft('upholstery', p.fabric, 0.46, 0.085, 0.46, 0.03, 0, sh - 0.025, 0.01, { puff: 0.014, sag: 0.004 });
    // back: an upholstered pad raked ~10°, slightly wider at the top
    k.soft('upholstery', p.fabric, 0.44, 0.36, 0.065, 0.03, 0, sh + 0.21, -0.215, { puff: 0.012, rx: -0.16 });
    for (const s of [-1, 1]) k.rod('legs', p.wood, [s * 0.17, sh - 0.07, -0.18], [s * 0.17, sh + 0.06, -0.21], 0.011);
  } else if (p.style === 'spindle') {
    // saddle-like solid wood seat, splayed legs, H stretcher, bent top rail and spindles
    k.slab('seat', p.wood, roundRect(0.46, 0.43, 0.08), 0.035, sh - 0.035, { bevel: 0.01, bevelSegs: 3 });
    const leg = splayLegs(k, 'legs', p.wood, 0.42, 0.4, sh - 0.035, { inset: 0.06, r: 0.017, rFoot: 0.012, splay: 0.035 });
    for (const sx of [-1, 1]) { const [x0, z0] = leg(sx, 1, 0.18), [x1, z1] = leg(sx, -1, 0.18); k.rod('legs', p.wood, [x0, 0.18, z0], [x1, 0.18, z1], 0.009); }
    { const [x0] = leg(-1, 1, 0.18), [x1] = leg(1, 1, 0.18); k.rod('legs', p.wood, [x0, 0.18, 0], [x1, 0.18, 0], 0.009); }
    const rail = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8 - 0.5) * 1.6; rail.push([Math.sin(a) * 0.24, 0.84, -0.13 - Math.cos(a) * 0.12]); }
    k.tube('frame', p.wood, rail, 0.016, { caps: true, radial: k.seg(10, 5) });
    const spindles = 7;
    for (let i = 0; i < spindles; i++) {
      const a = (i / (spindles - 1) - 0.5) * 1.4;
      const top = [Math.sin(a) * 0.24, 0.84, -0.13 - Math.cos(a) * 0.12];
      const bot = [Math.sin(a) * 0.17, sh, -0.13 - Math.cos(a) * 0.055];
      k.rod('frame', p.wood, bot, top, i === 0 || i === spindles - 1 ? 0.011 : 0.007, { r2: i === 0 || i === spindles - 1 ? 0.012 : 0.006 });
    }
  } else {
    // metal: bent steel tube sides + moulded plywood seat and back
    const fm = 'metal-black';
    for (const s of [-1, 1]) {
      const x = s * 0.2;
      k.bentTube('legs', fm, [[x, 0.006, 0.2], [x, sh - 0.03, 0.2], [x, sh - 0.03, -0.19], [x, 0.006, -0.22]], 0.011, 0.04);
      k.bentTube('legs', fm, [[x, sh - 0.03, -0.17], [x, 0.84, -0.25]], 0.011, 0.03);
      k.sphere('legs', 'rubber-black', 0.012, x, 0.006, 0.2, { scale: [1, 0.5, 1], segs: 8, rings: 4 });
    }
    k.rod('legs', fm, [-0.2, sh - 0.03, 0.17], [0.2, sh - 0.03, 0.17], 0.009);
    k.rod('legs', fm, [-0.2, sh - 0.03, -0.16], [0.2, sh - 0.03, -0.16], 0.009);
    const seat = curvedPanel(0.43, 0.43, 2.2, 0.014, k.seg(10, 4));
    seat.rotateX(-Math.PI / 2);
    seat.translate(0, sh - 0.005, 0.215);
    k.add('seat', p.wood, seat);
    const back = curvedPanel(0.44, 0.22, 0.45, 0.012, k.seg(16, 5));
    back.rotateX(-0.2);
    back.translate(0, 0.6, -0.17);
    k.add('seat', p.wood, back);
  }
}

const diningChair = item({
  id: 'dining-chair', category: 'dining', ko: '식탁 의자', en: 'Dining chair', size: [0.48, 0.84, 0.53],
  params: [
    P.pick('style', '스타일', 'Style', 'upholstered', [['upholstered', '패브릭', 'Upholstered'], ['spindle', '원목 스핀들', 'Wooden spindle'], ['metal', '금속+합판', 'Metal + plywood']]),
    P.mat('fabric', '천', 'Fabric', 'fabric-linen-beige', 'fabric'),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
  ],
  tags: ['dining chair', 'chair', '식탁 의자', '의자', '다이닝 체어', 'windsor'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    buildChair(k, p);
    return recentre(k.group());
  },
});

const bench = item({
  id: 'dining-bench', category: 'dining', ko: '식탁 벤치', en: 'Dining bench', size: [1.4, 0.45, 0.38],
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.8, 2.4),
    P.len('depth', '깊이', 'Depth', 0.38, 0.3, 0.5),
    P.pick('style', '스타일', 'Style', 'wood', [['wood', '원목', 'Wood'], ['upholstered', '쿠션', 'Upholstered']]),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('fabric', '천', 'Fabric', 'fabric-linen-grey', 'fabric'),
  ],
  tags: ['bench', 'dining bench', '벤치', '식탁 벤치', '의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.45;
    if (p.style === 'wood') {
      k.slab('top', p.wood, roundRect(w, d, 0.015), 0.04, h - 0.04, { bevel: 0.006 });
      const leg = splayLegs(k, 'legs', p.wood, w, d, h - 0.04, { inset: 0.07, r: 0.022, rFoot: 0.014, splay: 0.025 });
      for (const s of [-1, 1]) { const [x0, z0] = leg(s, -1, 0.15), [, z1] = leg(s, 1, 0.15); k.rod('legs', p.wood, [x0, 0.15, z0], [x0, 0.15, z1], 0.011); }
      { const [x0] = leg(-1, 1, 0.15), [x1] = leg(1, 1, 0.15); k.rod('legs', p.wood, [x0, 0.15, 0], [x1, 0.15, 0], 0.011); }
    } else {
      k.box('frame', p.wood, w, 0.04, d, 0, h - 0.1, 0, { r: 0.004 });
      k.soft('upholstery', p.fabric, w - 0.01, 0.08, d - 0.01, 0.03, 0, h - 0.04, 0, { puff: 0.012 });
      splayLegs(k, 'legs', p.wood, w, d, h - 0.12, { inset: 0.05, r: 0.02, rFoot: 0.013, splay: 0.02 });
    }
    return k.group();
  },
});

const barStool = item({
  id: 'bar-stool', category: 'dining', ko: '바 스툴', en: 'Bar stool', size: [0.4, 0.75, 0.4],
  params: [
    P.len('height', '좌면 높이', 'Seat height', 0.75, 0.6, 0.8),
    P.pick('legs', '다리', 'Legs', 'metal', [['metal', '금속', 'Metal'], ['wood', '원목', 'Wood']]),
    P.bool('back', '등받이', 'Back rest', false),
    P.mat('seat', '좌석', 'Seat', 'leather-cognac', 'leather'),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
  ],
  tags: ['bar stool', 'counter stool', 'stool', '바 스툴', '스툴', '아일랜드 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, r = 0.19;
    const legMat = p.legs === 'metal' ? 'metal-black' : p.wood;
    // padded round seat on a thin pan
    k.lathe('seat', p.seat, [[0, 0], [r - 0.01, 0], [r, 0.012], [r + 0.002, 0.035], [r - 0.012, 0.055], [r * 0.5, 0.062], [0, 0.063]], 0, h - 0.06, 0, { smooth: 18, segs: k.seg(36, 10) });
    k.cyl('frame', legMat, r * 0.82, r * 0.82, 0.018, 0, h - 0.075, 0, { segs: k.seg(32, 8) });
    const legTop = h - 0.075;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const top = [Math.cos(a) * r * 0.62, legTop, Math.sin(a) * r * 0.62];
      const foot = [Math.cos(a) * 0.205, 0, Math.sin(a) * 0.205];
      k.rod('legs', legMat, foot, top, p.legs === 'metal' ? 0.011 : 0.016, { r2: p.legs === 'metal' ? 0.011 : 0.019 });
    }
    // footrest ring at the right height for the leg splay
    const fy = Math.min(0.32, h * 0.4), fr = 0.205 - (0.205 - r * 0.62) * (fy / legTop);
    k.add('legs', p.legs === 'metal' ? 'metal-black' : 'metal-brass', new THREE.TorusGeometry(fr + 0.006, 0.008, k.seg(8, 4), k.seg(40, 12)).rotateX(Math.PI / 2).translate(0, fy, 0));
    if (p.back) {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.25 + (i / 10) * 0.5); pts.push([Math.cos(a) * r * 0.9, h + 0.22, -Math.sin(a) * r * 0.9]); }
      k.tube('frame', legMat, pts, 0.011, { caps: true });
      for (const s of [-1, 1]) k.rod('frame', legMat, [s * r * 0.64, h - 0.02, -r * 0.64], [s * r * 0.64, h + 0.22, -r * 0.64], 0.009);
    }
    return recentre(k.group());
  },
});

const sideboard = item({
  id: 'sideboard', category: 'dining', ko: '사이드보드', en: 'Sideboard', size: [1.6, 0.8, 0.45],
  params: [
    P.len('width', '폭', 'Width', 1.6, 0.9, 2.4),
    P.len('height', '높이', 'Height', 0.8, 0.6, 1.0),
    P.len('depth', '깊이', 'Depth', 0.45, 0.35, 0.55),
    P.pick('fronts', '구성', 'Fronts', 'mixed', [['mixed', '문+서랍', 'Doors + drawers'], ['doors', '문', 'Doors'], ['drawers', '서랍', 'Drawers']]),
    P.mat('body', '몸체', 'Body', 'wood-walnut', 'wood'),
    P.mat('front', '전면', 'Fronts', 'wood-walnut', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.mat('legWood', '다리', 'Legs', 'wood-walnut', 'wood'),
  ],
  tags: ['sideboard', 'buffet', 'credenza', '사이드보드', '수납장', '찬장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, legH = 0.16, frontT = 0.019;
    const bodyH = p.height - legH - 0.025;
    splayLegs(k, 'legs', p.legWood, w - 0.06, d - 0.06, legH, { inset: 0.04, r: 0.02, rFoot: 0.012, splay: 0.025 });
    k.box('body', p.body, w, bodyH, d - frontT, 0, legH + bodyH / 2, -frontT / 2, { r: 0.002 });
    // top overhangs the fronts a little and has a soft edge
    k.box('top', p.body, w + 0.01, 0.025, d + 0.008, 0, p.height - 0.0125, 0.004, { r: 0.004, segs: 2 });
    const n = Math.max(2, Math.round(w / 0.42));
    const cw = w / n;
    for (let i = 0; i < n; i++) {
      const type = p.fronts === 'drawers' ? 'drawer' : p.fronts === 'doors' ? 'door' : i === 0 || i === n - 1 ? 'door' : 'drawer';
      const rows = type === 'drawer' ? [{ h: 1 / 3, type: 'drawer' }, { h: 1 / 3, type: 'drawer' }, { h: 1 / 3, type: 'drawer' }] : [{ h: 1, type: 'door', hinge: i < n / 2 ? 'left' : 'right' }];
      transformAdded(k, () => addFronts(k, { w: cw, h: bodyH, d, rows, front: p.front, handle: p.handle, handleMat: 'metal-brass' }), -w / 2 + cw * (i + 0.5), legH, 0);
    }
    return k.group();
  },
});

export const ITEMS = [diningTable, diningChair, bench, barStool, sideboard];
