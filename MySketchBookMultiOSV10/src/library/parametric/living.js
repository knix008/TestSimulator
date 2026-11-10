// Living room: sofas, chairs, tables, storage, textiles, wall decor.
import {
  THREE, Kit, item, P, OPT, T, clamp, rng, addLegs, addCabinet, pillowGeo, shellGeo, gridGeo,
  roundRect, ellipse, softBoxGeo, superEllipse, frameShape, transformAdded,
} from './helpers.js';

const LEG_MAT = { tapered: 'wood-oak', square: 'wood-oak', metal: 'metal-black', hairpin: 'metal-black', block: 'wood-dark', sled: 'metal-black', cone: 'wood-walnut' };

/* --------------------------------------------------------------- sofas */

/**
 * Upholstered sofa body (one straight run). Origin: bottom centre; back at −z.
 * arms: 'both' | 'left' | 'right' | 'none'. Returns { seatY }.
 */
function sofaRun(k, o) {
  const { w, d, h = 0.8, seats = 3, fabric, legs = 'metal', armW = 0.17, armH = 0.62, cushions = true, x = 0, z = 0, arms = 'both', backD = 0.2, pillows = 0, pillowMat, seatH = 0.45, armStyle = 'square' } = o;
  const legH = legs === 'block' ? 0.05 : 0.12;
  const baseTop = seatH - 0.13;
  const baseH = baseTop - legH;
  const leftArm = arms === 'both' || arms === 'left', rightArm = arms === 'both' || arms === 'right';
  const x0 = x - w / 2 + (leftArm ? armW : 0), x1 = x + w / 2 - (rightArm ? armW : 0);
  const iw = x1 - x0;
  // base (upholstered platform) + legs
  k.soft('upholstery', fabric, w - 0.004, baseH, d - 0.004, 0.025, x, legH + baseH / 2, z, { flat: 4 });
  const legSet = legs === 'block' ? 'block' : legs;
  transformAdded(k, () => addLegs(k, 'legs', LEG_MAT[legSet] ?? 'metal-black', legSet, w - 0.08, d - 0.1, legH, { inset: 0.04, r: 0.02, splay: 0.02 }), x, 0, z);
  // arms
  const armTop = armH;
  for (const [on, ax] of [[leftArm, x - w / 2 + armW / 2], [rightArm, x + w / 2 - armW / 2]]) {
    if (!on) continue;
    const ah = armTop - legH;
    const r = armStyle === 'round' ? Math.min(armW / 2.05, 0.08) : 0.045;
    k.soft('upholstery', fabric, armW, ah, d, r, ax, legH + ah / 2, z, { puff: 0.006 });
  }
  // back frame (between the arms, a little lower than the cushions' top)
  const backTop = h - 0.07;
  const bh = backTop - baseTop;
  k.soft('upholstery', fabric, iw + 0.002, bh, backD, 0.04, (x0 + x1) / 2, baseTop + bh / 2, z - d / 2 + backD / 2, { puff: 0.005 });
  // seat cushions with small gaps between them
  const gap = 0.008;
  const cw = iw / seats - gap;
  const sd = d - backD + 0.015;
  const sz = z - d / 2 + backD + sd / 2 - 0.005;
  for (let i = 0; i < seats; i++) {
    const cx = x0 + (iw / seats) * (i + 0.5);
    k.soft('cushions', fabric, cw, 0.14, sd, 0.05, cx, baseTop + 0.07 - 0.005, sz, { puff: 0.018, sag: 0.006 });
    if (cushions) {
      // back cushions lean back ~10°
      const bch = h - baseTop - 0.12;
      k.soft('cushions', fabric, cw, bch, 0.2, 0.06, cx, baseTop + 0.135 + bch / 2, z - d / 2 + backD + 0.06, { puff: 0.03, rx: -0.17 });
    }
  }
  // throw pillows against the arms
  for (let i = 0; i < pillows; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    if ((side < 0 && !leftArm) || (side > 0 && !rightArm)) continue;
    const g = pillowGeo(0.42, 0.42, 0.14, k.seg(14, 5));
    T(g, 0, 0, 0, -0.35, side * -0.55, side * 0.12);
    g.translate(side < 0 ? x0 + 0.23 : x1 - 0.23, seatH + 0.19, z - d / 2 + backD + 0.24);
    k.add('pillows', pillowMat ?? 'fabric-linen-white', g);
  }
  return { seatY: seatH };
}

const sofaParams = (w, seats, fabric = 'fabric-linen-grey') => [
  P.len('width', '폭', 'Width', w, 1.2, 4, 0.01),
  P.int('seats', '좌석 수', 'Seats', seats, 1, 5),
  P.len('depth', '깊이', 'Depth', 0.92, 0.75, 1.2),
  P.len('height', '높이', 'Height', 0.8, 0.65, 1.0),
  P.mat('fabric', '천', 'Fabric', fabric, 'fabric'),
  P.pick('legs', '다리', 'Legs', 'metal', OPT.legs.filter(([v]) => v !== 'hairpin' && v !== 'sled')),
  P.pick('arms', '팔걸이', 'Arms', 'square', [['square', '각진', 'Square'], ['round', '둥근', 'Rounded'], ['none', '없음', 'None']]),
  P.bool('cushions', '등쿠션', 'Back cushions', true),
  P.int('pillows', '쿠션 수', 'Throw pillows', 2, 0, 2),
  P.mat('pillowFabric', '쿠션 천', 'Pillow fabric', 'fabric-linen-white', 'fabric'),
];

const buildSofa = (p, ctx) => {
  const k = new Kit(ctx);
  sofaRun(k, { w: p.width, d: p.depth, h: p.height, seats: p.seats, fabric: p.fabric, legs: p.legs, cushions: p.cushions, pillows: p.pillows, pillowMat: p.pillowFabric, arms: p.arms === 'none' ? 'none' : 'both', armStyle: p.arms, armW: p.arms === 'round' ? 0.2 : 0.17 });
  return k.group();
};

const sofa = item({
  id: 'sofa-modern', category: 'living', ko: '모던 소파', en: 'Modern sofa', size: [2.2, 0.8, 0.92],
  params: sofaParams(2.2, 3),
  seats: 3,
  tags: ['sofa', 'couch', '소파', '3인용', 'three seater', 'living', '3인', '3-seat'],
  build: buildSofa,
});

const loveseat = item({
  id: 'sofa-loveseat', category: 'living', ko: '2인 소파', en: 'Loveseat', size: [1.55, 0.8, 0.9],
  params: sofaParams(1.55, 2, 'fabric-velvet-green').map((q) => (q.key === 'depth' ? { ...q, default: 0.9 } : q.key === 'arms' ? { ...q, default: 'round' } : q.key === 'legs' ? { ...q, default: 'tapered' } : q)),
  seats: 2,
  tags: ['loveseat', 'sofa', '2인용 소파', '러브시트', 'two seater', '2인', '2-seat'],
  build: buildSofa,
});

const sectional = item({
  id: 'sofa-sectional', category: 'living', ko: 'L자형 코너 소파', en: 'L-shaped sectional', size: [2.9, 0.8, 1.65],
  params: [
    P.len('width', '폭', 'Width', 2.9, 2.0, 4.5),
    P.len('chaise', '카우치 길이', 'Chaise length', 1.65, 1.3, 2.4),
    P.int('seats', '좌석 수', 'Seats', 3, 2, 5),
    P.len('depth', '깊이', 'Depth', 0.95, 0.8, 1.1),
    P.pick('side', '카우치 방향', 'Chaise side', 'right', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']]),
    P.mat('fabric', '천', 'Fabric', 'fabric-boucle', 'fabric'),
    P.pick('legs', '다리', 'Legs', 'block', [['block', '블록', 'Block'], ['metal', '금속', 'Metal'], ['tapered', '원목', 'Wood']]),
    P.int('pillows', '쿠션 수', 'Throw pillows', 2, 0, 2),
    P.mat('pillowFabric', '쿠션 천', 'Pillow fabric', 'fabric-terracotta', 'fabric'),
  ],
  tags: ['sectional', 'corner sofa', 'L sofa', '코너 소파', 'ㄱ자 소파', '카우치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.side === 'left' ? -1 : 1;
    const w = p.width, d = p.depth, L = Math.max(p.chaise, d + 0.3);
    // whole footprint is w × L; the main run sits at the back, the chaise comes forward on one side.
    const zBack = -L / 2 + d / 2;
    const chaiseW = Math.min(0.95, w * 0.38);
    const mainW = w - chaiseW;
    const mainX = -s * (w / 2 - mainW / 2);
    sofaRun(k, { w: mainW, d, seats: Math.max(1, p.seats - 1), fabric: p.fabric, legs: p.legs, x: mainX, z: zBack, arms: s > 0 ? 'left' : 'right', pillows: p.pillows ? 1 : 0, pillowMat: p.pillowFabric });
    // chaise: back + one arm along the outside, long seat cushion
    const cx = s * (w / 2 - chaiseW / 2);
    const legH = p.legs === 'block' ? 0.05 : 0.12, baseTop = 0.32, baseH = baseTop - legH, armW = 0.17;
    k.soft('upholstery', p.fabric, chaiseW, baseH, L - 0.004, 0.025, cx, legH + baseH / 2, 0, { flat: 4 });
    transformAdded(k, () => addLegs(k, 'legs', LEG_MAT[p.legs] ?? 'metal-black', p.legs, chaiseW - 0.08, L - 0.1, legH, { inset: 0.04, r: 0.02, splay: 0.02 }), cx, 0, 0);
    const ah = 0.62 - legH;
    k.soft('upholstery', p.fabric, armW, ah, L - d + 0.2, 0.045, s * (w / 2 - armW / 2), legH + ah / 2, (-L / 2 + d - 0.2 + L / 2) / 2, { puff: 0.006 });
    const bh = 0.73 - baseTop;
    k.soft('upholstery', p.fabric, chaiseW, bh, 0.2, 0.04, cx, baseTop + bh / 2, -L / 2 + 0.1, { puff: 0.005 });
    const seatW = chaiseW - armW - 0.008;
    const scx = cx - s * (armW / 2);
    k.soft('cushions', p.fabric, seatW, 0.14, L - 0.215, 0.05, scx, baseTop + 0.065, (-L / 2 + 0.2 + L / 2) / 2 + 0.0075, { puff: 0.018 });
    k.soft('cushions', p.fabric, seatW, 0.35, 0.2, 0.06, scx, baseTop + 0.135 + 0.175, -L / 2 + 0.26, { puff: 0.03, rx: -0.17 });
    if (p.pillows > 1) {
      const g = pillowGeo(0.42, 0.42, 0.14, k.seg(14, 5));
      T(g, 0, 0, 0, -0.35, -s * 0.4, 0);
      g.translate(scx - s * 0.1, 0.45 + 0.19, -L / 2 + 0.45);
      k.add('pillows', p.pillowFabric, g);
    }
    return k.group();
  },
});

const armchair = item({
  id: 'armchair', category: 'living', ko: '안락의자', en: 'Armchair', size: [0.86, 0.82, 0.88],
  params: [
    P.len('width', '폭', 'Width', 0.86, 0.65, 1.1),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-rose', 'fabric'),
    P.pick('legs', '다리', 'Legs', 'tapered', [['tapered', '원목', 'Wood'], ['metal', '금속', 'Metal']]),
    P.bool('pillow', '쿠션', 'Pillow', true),
  ],
  seats: 1,
  tags: ['armchair', 'chair', '안락의자', '1인 소파', 'accent chair', '1인', '1-seat'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    sofaRun(k, { w: p.width, d: 0.88, h: 0.82, seats: 1, fabric: p.fabric, legs: p.legs, armW: 0.16, armStyle: 'round', armH: 0.6, pillows: 0 });
    if (p.pillow) {
      const g = pillowGeo(0.4, 0.3, 0.12, k.seg(14, 5));
      T(g, 0, 0, 0, -0.25, 0, 0);
      g.translate(0, 0.62, -0.18);
      k.add('pillows', 'fabric-linen-white', g);
    }
    return k.group();
  },
});

/* -------------------------------------------------------- lounge chair */

const loungeChair = item({
  id: 'lounge-chair', category: 'living', ko: '라운지 체어', en: 'Lounge chair', size: [0.72, 0.78, 0.84],
  params: [
    P.mat('wood', '프레임', 'Frame', 'wood-oak', 'wood'),
    P.mat('fabric', '쿠션 천', 'Cushion fabric', 'fabric-linen-beige', 'fabric'),
  ],
  seats: 1,
  tags: ['lounge chair', 'easy chair', '라운지 체어', '원목 의자', 'cushion', '1인', '1-seat'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.72, d = 0.84;
    // two side frames: front leg, back leg (raked) and an arm, shaped from rounded bars
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.025);
      const bar = (a, b, t = 0.045) => {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
        const len = A.distanceTo(B);
        const mid = A.clone().add(B).multiplyScalar(0.5);
        const ang = Math.atan2(B.y - A.y, B.z - A.z);
        k.box('frame', p.wood, 0.04, t, len + t * 0.6, mid.x, mid.y, mid.z, { r: 0.012, segs: 2, rx: -ang });
      };
      bar([x, 0.022, 0.33], [x, 0.6, 0.36]); // front leg
      bar([x, 0.022, -0.38], [x, 0.5, -0.3]); // back leg
      bar([x, 0.58, 0.39], [x, 0.58, -0.27], 0.04); // arm
      bar([x, 0.24, 0.34], [x, 0.24, -0.36], 0.04); // seat rail
    }
    // back posts rising from the back legs (raked ~15°), top rail
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.035, 0.42, 0.035, sx * (w / 2 - 0.08), 0.58, -0.34, { r: 0.01, segs: 2, rx: -0.3 });
    k.box('frame', p.wood, w - 0.1, 0.05, 0.03, 0, 0.77, -0.405, { r: 0.012, segs: 2, rx: -0.3 });
    // webbing/slat seat under the cushion
    k.box('frame', p.wood, w - 0.05, 0.025, 0.64, 0, 0.255, -0.01, { r: 0.006 });
    // cushions
    k.soft('cushions', p.fabric, w - 0.1, 0.12, 0.64, 0.045, 0, 0.33, 0.0, { puff: 0.02, sag: 0.006, rx: 0.06 });
    k.soft('cushions', p.fabric, w - 0.12, 0.44, 0.13, 0.05, 0, 0.6, -0.31, { puff: 0.025, rx: -0.3 });
    return k.group();
  },
});

/* -------------------------------------------------------- ottoman/pouf */

const ottoman = item({
  id: 'ottoman', category: 'living', ko: '오토만·푸프', en: 'Ottoman / pouf', size: [0.55, 0.42, 0.55],
  params: [
    P.pick('shape', '모양', 'Shape', 'round', [['round', '원형 푸프', 'Round pouf'], ['square', '사각 오토만', 'Square ottoman']]),
    P.len('width', '폭', 'Width', 0.55, 0.35, 1.2),
    P.len('height', '높이', 'Height', 0.42, 0.3, 0.5),
    P.mat('fabric', '천', 'Fabric', 'fabric-boucle', 'fabric'),
  ],
  tags: ['ottoman', 'pouf', 'footstool', '오토만', '푸프', '발받침'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height;
    if (p.shape === 'round') {
      const r = w / 2;
      // puffy drum: bulging sides, rounded top with a tufted dimple in the middle
      k.lathe('upholstery', p.fabric, [[0, 0], [r * 0.82, 0], [r * 0.95, h * 0.06], [r, h * 0.3], [r * 0.99, h * 0.7], [r * 0.93, h * 0.93], [r * 0.7, h * 1.0], [r * 0.25, h * 0.995], [r * 0.04, h * 0.97], [0, h * 0.965]], 0, 0, 0, { smooth: 28, segs: k.seg(40, 12) });
      // piping around top and bottom seams
      for (const [yy, rr] of [[h * 0.86, r * 0.965], [h * 0.06, r * 0.952]]) {
        k.add('piping', p.fabric, new THREE.TorusGeometry(rr, 0.006, k.seg(6, 3), k.seg(48, 12)).rotateX(Math.PI / 2).translate(0, yy, 0));
      }
    } else {
      k.soft('upholstery', p.fabric, w, h - 0.08, w, 0.04, 0, 0.08 + (h - 0.08) / 2, 0, { puff: 0.015 });
      addLegs(k, 'legs', 'wood-oak', 'tapered', w, w, 0.08, { inset: 0.05, r: 0.018, splay: 0.008 });
    }
    return k.group();
  },
});

/* -------------------------------------------------------------- tables */

const TOPS = [['wood', '원목', 'Wood'], ['marble', '대리석', 'Marble'], ['glass', '유리', 'Glass']];
const topMatOf = (t, wood) => (t === 'marble' ? 'marble-white' : t === 'glass' ? 'glass-tinted' : wood);
const topShape = (shape, w, d) => (shape === 'round' ? ellipse(w, w) : shape === 'oval' ? superEllipse(w, d, 2.6) : roundRect(w, d, 0.02));

const coffeeTable = item({
  id: 'coffee-table', category: 'living', ko: '커피 테이블', en: 'Coffee table', size: [1.2, 0.4, 0.6],
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round'], ['oval', '타원', 'Oval']]),
    P.len('width', '폭', 'Width', 1.2, 0.5, 1.8),
    P.len('depth', '깊이', 'Depth', 0.6, 0.4, 1.0),
    P.len('height', '높이', 'Height', 0.4, 0.3, 0.5),
    P.pick('top', '상판', 'Top', 'wood', TOPS),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.pick('legs', '다리', 'Legs', 'tapered', [['tapered', '원목', 'Wood'], ['metal', '금속', 'Metal'], ['hairpin', '헤어핀', 'Hairpin'], ['pedestal', '받침대', 'Pedestal']]),
    P.bool('shelf', '하단 선반', 'Lower shelf', false),
  ],
  tags: ['coffee table', 'table', '커피 테이블', '거실 테이블', '소파 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.shape === 'round' ? p.width : p.depth, h = p.height;
    const t = p.top === 'glass' ? 0.012 : p.top === 'marble' ? 0.025 : 0.03;
    const topMat = topMatOf(p.top, p.wood);
    k.slab('top', topMat, topShape(p.shape, w, d), t, h - t, { bevel: p.top === 'glass' ? 0.002 : 0.005 });
    const legH = h - t;
    if (p.top === 'glass') {
      // a slim apron frame carries a glass top
      k.slab('frame', p.legs === 'tapered' ? p.wood : 'metal-black', p.shape === 'rect' ? frameRing(w - 0.04, d - 0.04, 0.025) : ringShape(w - 0.04, d - 0.04, 0.025, p.shape), 0.02, legH - 0.02, { bevel: 0.002 });
    }
    if (p.legs === 'pedestal') {
      k.lathe('legs', p.top === 'marble' ? 'marble-white' : p.wood, [[0, 0], [Math.min(w, d) * 0.3, 0], [Math.min(w, d) * 0.3, 0.02], [Math.min(w, d) * 0.12, 0.06], [Math.min(w, d) * 0.1, legH * 0.5], [Math.min(w, d) * 0.15, legH - 0.01], [Math.min(w, d) * 0.15, legH], [0, legH]], 0, 0, 0, { smooth: 16, segs: k.seg(32, 10) });
    } else {
      const inset = p.shape === 'rect' ? 0.07 : Math.min(w, d) * 0.2;
      addLegs(k, 'legs', p.legs === 'tapered' ? p.wood : 'metal-black', p.legs, w, d, legH, { inset, r: 0.02, splay: 0.02 });
    }
    if (p.shelf) k.slab('top', p.wood, topShape(p.shape, w * 0.82, d * 0.78), 0.018, legH * 0.25, { bevel: 0.003 });
    return k.group();
  },
});

function frameRing(w, d, b) {
  const s = roundRect(w, d, 0.015);
  const hole = roundRect(w - 2 * b, d - 2 * b, 0.01);
  s.holes.push(new THREE.Path(hole.getPoints(8).reverse()));
  return s;
}
function ringShape(w, d, b, shape) {
  const s = shape === 'round' ? ellipse(w, w) : superEllipse(w, d, 2.6);
  const hole = shape === 'round' ? ellipse(w - 2 * b, w - 2 * b) : superEllipse(w - 2 * b, d - 2 * b, 2.6);
  s.holes.push(new THREE.Path(hole.getPoints(48).reverse()));
  return s;
}

const sideTable = item({
  id: 'side-table', category: 'living', ko: '사이드 테이블', en: 'Side table', size: [0.45, 0.55, 0.45],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.45, 0.3, 0.7),
    P.len('height', '높이', 'Height', 0.55, 0.4, 0.7),
    P.pick('top', '상판', 'Top', 'marble', TOPS),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.pick('base', '받침', 'Base', 'tripod', [['tripod', '삼각 다리', 'Tripod'], ['pedestal', '받침대', 'Pedestal'], ['wire', '금속 프레임', 'Wire frame']]),
  ],
  tags: ['side table', 'end table', '사이드 테이블', '협탁', 'accent table'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = p.diameter / 2, h = p.height, t = p.top === 'glass' ? 0.01 : 0.022;
    k.slab('top', topMatOf(p.top, p.wood), ellipse(p.diameter, p.diameter), t, h - t, { bevel: 0.004, curveSegs: 40 });
    const legH = h - t;
    if (p.base === 'tripod') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const top = [Math.cos(a) * r * 0.35, legH, Math.sin(a) * r * 0.35], foot = [Math.cos(a) * r * 0.82, 0.006, Math.sin(a) * r * 0.82];
        k.rod('legs', p.wood, foot, top, 0.012, { r2: 0.017, segs: k.seg(14, 6) });
        k.sphere('legs', p.wood, 0.012, foot[0], 0.012, foot[2], { segs: k.seg(10, 5), rings: k.seg(6, 3) });
      }
      k.cyl('legs', p.wood, r * 0.42, r * 0.42, 0.02, 0, legH - 0.02, 0, { segs: k.seg(28, 8) });
    } else if (p.base === 'pedestal') {
      k.lathe('legs', 'metal-black', [[0, 0], [r * 0.6, 0], [r * 0.6, 0.012], [r * 0.12, 0.03], [0.022, 0.06], [0.022, legH - 0.03], [r * 0.25, legH - 0.005], [r * 0.25, legH], [0, legH]], 0, 0, 0, { segs: k.seg(32, 10) });
    } else {
      // bent wire frame: two crossing U loops
      for (const a of [0, Math.PI / 2]) {
        const c = Math.cos(a), s = Math.sin(a), rr = r * 0.8;
        k.bentTube('legs', 'metal-black', [[-rr * c, legH, -rr * s], [-rr * c, 0.006, -rr * s], [rr * c, 0.006, rr * s], [rr * c, legH, rr * s]], 0.006, 0.04);
      }
      k.add('legs', 'metal-black', new THREE.TorusGeometry(r * 0.8, 0.006, k.seg(6, 3), k.seg(48, 12)).rotateX(Math.PI / 2).translate(0, legH - 0.006, 0));
    }
    return k.group();
  },
});

/* ----------------------------------------------------------- storage */

const tvConsole = item({
  id: 'tv-console', category: 'living', ko: 'TV 거실장', en: 'TV console', size: [1.8, 0.5, 0.42],
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.0, 2.8),
    P.len('height', '높이', 'Height', 0.5, 0.35, 0.7),
    P.len('depth', '깊이', 'Depth', 0.42, 0.3, 0.55),
    P.pick('fronts', '구성', 'Fronts', 'mixed', [['mixed', '서랍+문', 'Drawers + doors'], ['drawers', '서랍', 'Drawers'], ['doors', '문', 'Doors'], ['open', '오픈+서랍', 'Open + drawers']]),
    P.mat('body', '몸체', 'Body', 'wood-oak', 'wood'),
    P.mat('front', '전면', 'Fronts', 'wood-oak', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
    P.pick('base', '받침', 'Base', 'legs', [['legs', '다리', 'Legs'], ['plinth', '걸레받이', 'Plinth']]),
  ],
  tags: ['tv console', 'tv stand', 'media unit', 'TV장', '거실장', '티비 다이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.max(2, Math.round(p.width / 0.6));
    const sub = (cols, type) => ({ h: 1, n: cols, type });
    // fronts split into columns; 'mixed' = doors at the ends, drawers in the middle
    const cw = p.width / n;
    const types = Array.from({ length: n }, (_, i) => (p.fronts === 'drawers' ? 'drawer' : p.fronts === 'doors' ? 'door' : p.fronts === 'open' ? (i % 2 ? 'open' : 'drawer') : (i === 0 || i === n - 1 ? 'door' : 'drawer')));
    void sub;
    const legH = 0.14;
    const yb = p.base === 'legs' ? legH : 0;
    const res = addCabinet(k, { w: p.width, h: p.height, d: p.depth, rows: [{ h: 1, n: 1, type: 'open' }], body: p.body, front: p.front, base: p.base === 'legs' ? 'legs' : 'plinth', legH, legStyle: 'tapered', legMat: p.body, plinth: 0.06, handle: p.handle, top: null });
    void res;
    // replace the single open row with per-column fronts (columns have their own type)
    k.parts.forEach((part) => { if (part.role === 'body') part.geos.splice(part.geos.length - 1, 1); });
    const bodyH = p.height - (p.base === 'legs' ? legH : 0.06);
    const y0 = p.base === 'legs' ? yb : 0.06;
    for (let i = 0; i < n; i++) {
      const cx = -p.width / 2 + cw * (i + 0.5);
      transformAdded(k, () => {
        const type = types[i];
        if (type === 'open') {
          k.box('body', p.body, cw - 0.04, 0.016, p.depth - 0.06, 0, bodyH * 0.5, 0, { r: 0.001 });
          return;
        }
        const rows = type === 'drawer' ? [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.5, n: 1, type: 'drawer' }] : [{ h: 1, n: 1, type: 'door', hinge: i === 0 ? 'left' : 'right' }];
        addFronts(k, { w: cw, h: bodyH, d: p.depth, rows, front: p.front, handle: p.handle });
      }, cx, y0, 0);
    }
    return k.group();
  },
});

/** Only the fronts of a cabinet column (the carcass is shared). Origin: bottom centre of the column. */
function addFronts(k, { w, h, d, rows, front, handle, handleMat = 'metal-black', gap = 0.003, frontT = 0.019 }) {
  const fz = d / 2 - frontT / 2;
  let y = 0;
  for (const row of rows) {
    const rh = row.h * h;
    const fw = w - gap, fh = rh - gap, fy = y + rh / 2;
    k.box('fronts', front, fw, fh, frontT, 0, fy, fz, { r: 0.0025 });
    const zf = fz + frontT / 2;
    if (row.type === 'drawer') {
      if (handle === 'edge') k.box('handles', 'metal-aluminium', Math.min(0.25, fw * 0.5), 0.012, 0.024, 0, fy + fh / 2 - 0.006, zf + 0.004, { r: 0.002 });
      else if (handle !== 'none') addHandleLocal(k, handle, 0, fy, zf, Math.min(0.2, fw * 0.4), false, handleMat);
    } else {
      const hx = row.hinge === 'left' ? fw / 2 - 0.035 : -fw / 2 + 0.035;
      if (handle === 'edge') k.box('handles', 'metal-aluminium', 0.012, Math.min(0.22, fh * 0.5), 0.024, hx + (row.hinge === 'left' ? 0.03 : -0.03), fy, zf + 0.004, { r: 0.002 });
      else if (handle !== 'none') addHandleLocal(k, handle, hx, fy + fh / 2 - 0.12, zf, Math.min(0.16, fh * 0.35), true, handleMat);
    }
    y += rh;
  }
}

function addHandleLocal(k, style, x, y, zf, len, vertical, mat) {
  if (style === 'knob') {
    k.lathe('handles', mat, [[0, 0], [0.007, 0], [0.006, 0.012], [0.014, 0.022], [0.015, 0.028], [0.01, 0.033], [0, 0.034]], x, y, zf, { rx: Math.PI / 2, segs: k.seg(16, 6) });
    return;
  }
  const half = len / 2, off = 0.03, r = 0.006;
  const a = vertical ? [x, y - half, zf + off] : [x - half, y, zf + off];
  const b = vertical ? [x, y + half, zf + off] : [x + half, y, zf + off];
  k.rod('handles', mat, a, b, r, { segs: k.seg(12, 5) });
  for (const t of [0.12, 0.88]) {
    const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
    k.rod('handles', mat, [px, py, zf], [px, py, zf + off], r * 0.8, { segs: k.seg(10, 5) });
  }
}

/** A row of books standing on y0 from x0 to x1; z = back limit, spines flush at z + depthMax (facing +z). */
export function addBooks(k, x0, x1, y0, z, depthMax = 0.24, seed = 1, { hMax = 0.3, fill = 0.85, lean = true } = {}) {
  const rand = rng(seed);
  const covers = ['book-red', 'book-blue', 'book-green', 'book-cream', 'book-cream', 'paint-grey-matte'];
  let x = x0 + 0.005;
  const end = x0 + (x1 - x0) * fill;
  while (x < end) {
    const t = 0.018 + rand() * 0.035, h = hMax * (0.68 + rand() * 0.32), dd = Math.min(depthMax, 0.15 + rand() * 0.09);
    if (x + t > x1 - 0.004) break;
    const mat = covers[Math.floor(rand() * covers.length)];
    const cx = x + t / 2;
    k.box('books', mat, t, h, dd, cx, y0 + h / 2, z + depthMax - dd / 2, { r: 0.002 });
    // page block shows as a cream band on the top edge (inset)
    k.box('pages', 'paper', t - 0.004, 0.004, dd - 0.006, cx, y0 + h - 0.001, z + depthMax - dd / 2 - 0.002, { r: 0 });
    x += t + 0.001;
    if (rand() < 0.12) x += 0.03 + rand() * 0.05;
  }
  // a leaning book at the end of the row
  if (lean && x < x1 - 0.12) {
    const h = hMax * 0.9, t = 0.025, a = 0.3;
    const cx = x + Math.sin(a) * h / 2 + t / 2;
    k.box('books', 'book-blue', t, h, Math.min(depthMax, 0.2), cx, y0 + Math.cos(a) * h / 2 + Math.sin(a) * t / 2, z + depthMax - Math.min(depthMax, 0.2) / 2, { r: 0.002, rz: -a });
  }
}

const bookshelf = item({
  id: 'bookshelf', category: 'living', ko: '책장', en: 'Bookshelf', size: [0.9, 1.9, 0.32],
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.4, 2.0),
    P.len('height', '높이', 'Height', 1.9, 0.7, 2.4),
    P.len('depth', '깊이', 'Depth', 0.32, 0.22, 0.45),
    P.int('shelves', '선반 수', 'Shelves', 5, 2, 8),
    P.mat('wood', '나무', 'Wood', 'wood-ash', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['bookshelf', 'bookcase', 'shelf', '책장', '선반', '책꽂이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    shelfCase(k, p.width, p.height, p.depth, p.shelves, p.wood, p.books, 1);
    return k.group();
  },
});

/** Open shelf case: sides, top, bottom plinth, back panel, shelves (+ books). Origin bottom centre. */
export function shelfCase(k, w, h, d, shelves, wood, books, seed = 1, { back = true, plinth = 0.06 } = {}) {
  const t = 0.022;
  for (const s of [-1, 1]) k.box('frame', wood, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.002 });
  k.box('frame', wood, w - 2 * t, t, d, 0, h - t / 2, 0, { r: 0.002 });
  k.box('frame', wood, w - 2 * t, plinth, d - 0.02, 0, plinth / 2, -0.01, { r: 0.002 });
  if (back) k.box('back', wood, w - 2 * t + 0.004, h - t - plinth, 0.008, 0, plinth + (h - t - plinth) / 2, -d / 2 + 0.008, { r: 0 });
  const span = (h - t - plinth) / shelves;
  const rand = rng(seed + w * 13);
  for (let i = 0; i <= shelves - 1; i++) {
    const y = plinth + span * i;
    if (i > 0) k.box('frame', wood, w - 2 * t, 0.02, d - 0.025, 0, y, 0.0025, { r: 0.002 });
    if (books && span > 0.2) {
      const top = y + (i > 0 ? 0.01 : 0);
      if (rand() < 0.25 && w > 0.5) {
        // a stack lying flat + a few standing books
        for (let j = 0; j < 4; j++) {
          const bw = 0.2 + rand() * 0.04;
          k.box('books', ['book-cream', 'book-red', 'book-blue', 'book-green'][j], bw, 0.028, Math.min(d - 0.06, 0.2), -w / 2 + t + 0.03 + bw / 2, top + 0.014 + j * 0.029, 0, { r: 0.002 });
        }
        addBooks(k, -w / 2 + t + 0.3, w / 2 - t, top, -d / 2 + 0.03, Math.min(d - 0.06, 0.24), seed + i, { hMax: Math.min(0.3, span - 0.05), fill: 0.7, lean: false });
      } else {
        addBooks(k, -w / 2 + t, w / 2 - t, top, -d / 2 + 0.03 + 0.0, Math.min(d - 0.06, 0.24), seed + i * 7, { hMax: Math.min(0.31, span - 0.04), fill: 0.55 + rand() * 0.35 });
      }
    }
  }
}

/* -------------------------------------------------------------- textiles */

const floorCushion = item({
  id: 'floor-cushion', category: 'living', ko: '방석·바닥 쿠션', en: 'Floor cushion', size: [0.6, 0.11, 0.6],
  params: [
    P.len('size', '크기', 'Size', 0.6, 0.4, 0.9),
    P.mat('fabric', '천', 'Fabric', 'fabric-mustard', 'fabric'),
    P.bool('tufted', '터프팅', 'Tufted', true),
  ],
  tags: ['floor cushion', 'zabuton', '방석', '바닥 쿠션', '좌식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size;
    // a filled square cushion: soft box whose top domes up, flat underside resting on the floor
    const g = softBoxGeo(s, 0.08, s, 0.035, { round: k.hi ? 3 : 1, flat: k.hi ? 6 : 2, puff: 0.03 });
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) if (pa.getY(i) < -0.04) pa.setY(i, -0.04);
    g.computeVertexNormals();
    g.translate(0, 0.04, 0);
    k.add('cushion', p.fabric, g);
    const top = 0.08 + 0.03;
    if (p.tufted) k.sphere('cushion', p.fabric, 0.018, 0, top - 0.012, 0, { scale: [1, 0.5, 1], segs: k.seg(12, 6), rings: k.seg(6, 3) });
    return k.group();
  },
});

const rug = item({
  id: 'rug', category: 'living', ko: '러그', en: 'Rug', size: [2.0, 0.015, 1.4],
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round']]),
    P.len('width', '폭', 'Width', 2.0, 0.6, 4.0),
    P.len('depth', '깊이', 'Depth', 1.4, 0.4, 3.5),
    P.mat('material', '재질', 'Material', 'rug-pattern', 'carpet'),
    P.bool('fringe', '술 장식', 'Fringe', false),
  ],
  tags: ['rug', 'carpet', 'mat', '러그', '카펫', '깔개'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.shape === 'round' ? p.width : p.depth;
    const fringe = p.fringe ? 0.06 : 0;
    const shape = p.shape === 'round' ? ellipse(w - 2 * fringe, d - 2 * fringe) : roundRect(w - (p.shape === 'rect' ? 0 : 2 * fringe), d - 2 * fringe, 0.01);
    k.slab('rug', p.material, shape, 0.012, 0, { bevel: 0.004, curveSegs: 48 });
    if (p.fringe) {
      // tassels: thin strands along the short ends (rect) or all round (round)
      const strands = [];
      if (p.shape === 'round') {
        const n = k.hi ? 140 : 50, r = (w - 2 * fringe) / 2;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; strands.push([Math.cos(a) * r, Math.sin(a) * r, a]); }
        for (const [x, z, a] of strands) k.box('fringe', 'paper', 0.005, 0.003, fringe + 0.01, x + Math.cos(a) * fringe / 2, 0.0015, z + Math.sin(a) * fringe / 2, { r: 0, ry: -a + Math.PI / 2 });
      } else {
        const n = Math.round(w / (k.hi ? 0.012 : 0.03));
        for (const sz of [-1, 1]) for (let i = 0; i < n; i++) {
          const x = -w / 2 + 0.01 + (i + 0.5) * ((w - 0.02) / n);
          k.box('fringe', 'paper', 0.004, 0.003, fringe + 0.01, x, 0.0015, sz * (d / 2 - fringe / 2 + 0.005), { r: 0 });
        }
      }
    }
    return k.group();
  },
});

/* -------------------------------------------------------------- curtains */

const curtains = item({
  id: 'curtains', category: 'living', ko: '커튼', en: 'Curtains', placement: 'wall', elevation: 0, size: [2.4, 2.4, 0.16],
  params: [
    P.len('width', '폭', 'Width', 2.4, 0.8, 6),
    P.len('height', '높이', 'Height', 2.4, 1.0, 3.2),
    P.num('open', '열림 정도', 'Open ratio', 0.45, 0, 0.9, 0.05),
    P.mat('fabric', '천', 'Fabric', 'fabric-linen-beige', 'fabric'),
    P.bool('sheer', '속커튼', 'Sheer layer', true),
    P.mat('rod', '커튼봉', 'Rod', 'metal-black', 'metal'),
  ],
  tags: ['curtains', 'drapes', '커튼', '암막커튼', '속커튼', 'curtain rod'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height;
    const rodY = h - 0.03;
    // rod with finials and brackets (in front of the wall, z ≈ 0.1)
    const rz = 0.02;
    k.rod('rod', p.rod, [-w / 2 - 0.04, rodY, rz], [w / 2 + 0.04, rodY, rz], 0.012, { segs: k.seg(14, 6) });
    for (const s of [-1, 1]) {
      k.sphere('rod', p.rod, 0.025, s * (w / 2 + 0.06), rodY, rz, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
      k.rod('rod', p.rod, [s * (w / 2 - 0.1), rodY, -0.075], [s * (w / 2 - 0.1), rodY, rz], 0.006);
      k.cyl('rod', p.rod, 0.018, 0.018, 0.008, s * (w / 2 - 0.1), rodY, -0.075, { rx: Math.PI / 2, segs: k.seg(14, 6) });
    }
    // two pleated panels gathered towards the sides; amplitude grows towards the hem
    const open = clamp(p.open, 0, 0.9);
    const panelFull = w / 2;
    const span = Math.max(0.18, panelFull * (1 - open));
    const fabricLen = panelFull * 1.15;
    const waves = Math.max(3, Math.round(fabricLen / 0.16));
    const top = rodY - 0.02, hem = 0.01;
    for (const s of [-1, 1]) {
      const xOuter = s * (w / 2 + 0.02);
      const amp = 0.03 + 0.035 * (1 - span / panelFull);
      const fn = (u, v) => {
        const y = hem + (top - hem) * v;
        const sway = 1 + 0.25 * (1 - v);
        const x = xOuter - s * u * span * (1 + 0.05 * (1 - v));
        const z = 0.0 + amp * sway * Math.sin(u * waves * Math.PI * 2) + 0.012 * (1 - v) * Math.sin(u * 7 + s);
        return s > 0 ? [x, y, z] : [x, y, z];
      };
      k.add('curtain', p.fabric, shellGeo(k.seg(waves * 8, 24), k.seg(10, 3), s > 0 ? fn : (u, v) => fn(u, v), 0.003));
      // rings on the rod
      for (let i = 0; i <= waves; i++) {
        const x = xOuter - s * (i / waves) * span;
        k.add('rod', p.rod, new THREE.TorusGeometry(0.018, 0.0035, k.seg(5, 3), k.seg(12, 6)).translate(x, rodY, rz));
      }
    }
    if (p.sheer) {
      const waves = Math.round(w * 1.4 / 0.12);
      const fn = (u, v) => [-(w / 2) + u * w, hem + 0.01 + (top - 0.04 - hem) * v, -0.04 + 0.018 * Math.sin(u * waves * Math.PI * 2)];
      k.add('sheer', 'glass-frosted', gridGeo(k.seg(waves * 6, 24), 2, fn));
    }
    return k.group();
  },
});

/* ------------------------------------------------------------ wall decor */

const wallArt = item({
  id: 'wall-art', category: 'living', ko: '액자 그림', en: 'Framed wall art', placement: 'wall', elevation: 1.3, size: [0.7, 0.9, 0.03],
  params: [
    P.len('width', '폭', 'Width', 0.7, 0.2, 2.0),
    P.len('height', '높이', 'Height', 0.9, 0.2, 2.0),
    P.mat('frame', '프레임', 'Frame', 'wood-black', 'wood'),
    P.bool('mat', '매트(여백)', 'Passe-partout', true),
    P.pick('art', '그림', 'Artwork', 'abstract', [['abstract', '추상', 'Abstract'], ['landscape', '풍경', 'Landscape'], ['lines', '라인 드로잉', 'Line art']]),
  ],
  tags: ['wall art', 'painting', 'poster', 'frame', '액자', '그림', '포스터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, fw = 0.025, depth = 0.03;
    k.panel('frame', p.frame, frameShape(w, h, fw), depth, 0, h / 2, 0, { bevel: 0.003 });
    const matB = p.mat ? Math.min(w, h) * 0.12 : 0;
    const iw = w - 2 * fw, ih = h - 2 * fw;
    k.box('mat', 'paper', iw, ih, 0.004, 0, h / 2, -0.002, { r: 0 });
    // the artwork: a few flat colour fields (no textures: built from presets)
    const aw = iw - 2 * matB, ah = ih - 2 * matB, z = 0.002;
    const field = (mat, x0, y0, x1, y1, ov) => k.box('art', mat, (x1 - x0) * aw, (y1 - y0) * ah, 0.001, (x0 + x1 - 1) / 2 * aw, h / 2 + (y0 + y1 - 1) / 2 * ah, z, { r: 0, overrides: ov });
    if (p.art === 'abstract') {
      field('paint-white-matte', 0, 0, 1, 1, { color: '#e9e1d3' });
      k.cyl('art2', 'paint-white-matte', aw * 0.28, aw * 0.28, 0.001, -aw * 0.08, h / 2 + ah * 0.12, z + 0.0012, { rx: Math.PI / 2, segs: k.seg(40, 12), overrides: { color: '#c46a45' } });
      k.box('art3', 'paint-white-matte', 0.55 * aw, 0.38 * ah, 0.001, 0.225 * aw, h / 2 - 0.31 * ah, z + 0.0024, { r: 0, overrides: { color: '#2f4a5c' } });
      k.box('art4', 'paint-white-matte', 0.45 * aw, 0.2 * ah, 0.001, -0.275 * aw, h / 2 - 0.4 * ah, z + 0.0012, { r: 0, overrides: { color: '#d9b77a' } });
    } else if (p.art === 'landscape') {
      field('paint-white-matte', 0, 0.45, 1, 1, { color: '#b9cdd8' });
      field('paint-white-matte', 0, 0.25, 1, 0.45, { color: '#6f8a72' });
      field('paint-white-matte', 0, 0, 1, 0.25, { color: '#3f5a48' });
      k.cyl('art2', 'paint-white-matte', aw * 0.08, aw * 0.08, 0.001, aw * 0.25, h / 2 + ah * 0.3, z + 0.0012, { rx: Math.PI / 2, segs: k.seg(24, 8), overrides: { color: '#f1e3c2' } });
    } else {
      field('paint-white-matte', 0, 0, 1, 1, { color: '#f3efe7' });
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([(t - 0.5) * aw * 0.8, h / 2 + Math.sin(t * Math.PI * 2.5) * ah * 0.18, z + 0.001]); }
      k.tube('art2', 'paint-black-matte', pts, 0.0015, { radial: 4 });
    }
    k.box('glass', 'glass-clear', iw, ih, 0.002, 0, h / 2, depth / 2 - 0.006, { r: 0 });
    return k.group();
  },
});

const mirror = item({
  id: 'wall-mirror', category: 'living', ko: '벽 거울', en: 'Wall mirror', placement: 'wall', elevation: 1.0, size: [0.7, 0.7, 0.03],
  params: [
    P.pick('shape', '모양', 'Shape', 'round', [['round', '원형', 'Round'], ['rect', '사각', 'Rectangle'], ['arch', '아치', 'Arch']]),
    P.len('width', '폭', 'Width', 0.7, 0.3, 1.5),
    P.len('height', '높이', 'Height', 0.7, 0.3, 2.0),
    P.mat('frame', '프레임', 'Frame', 'metal-brass', 'metal'),
  ],
  tags: ['mirror', 'wall mirror', '거울', '벽거울', '원형 거울'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.shape === 'round' ? p.width : p.height, b = 0.018;
    const outer = (ww, hh) => {
      if (p.shape === 'round') return ellipse(ww, ww);
      if (p.shape === 'rect') return roundRect(ww, hh, 0.01);
      const s = new THREE.Shape();
      const r = ww / 2;
      s.moveTo(-r, -hh / 2); s.lineTo(r, -hh / 2); s.lineTo(r, hh / 2 - r); s.absarc(0, hh / 2 - r, r, 0, Math.PI, false); s.lineTo(-r, -hh / 2);
      return s;
    };
    const ring = outer(w, h);
    const hole = outer(w - 2 * b, h - 2 * b);
    ring.holes.push(new THREE.Path(hole.getPoints(48).reverse()));
    k.panel('frame', p.frame, ring, 0.03, 0, h / 2, 0, { bevel: 0.006, bevelSegs: 3, curveSegs: 48 });
    k.panel('mirror', 'mirror', outer(w - 2 * b + 0.004, h - 2 * b + 0.004), 0.006, 0, h / 2, -0.004, { bevel: 0.001, curveSegs: 48 });
    return k.group();
  },
});

export const ITEMS = [sofa, loveseat, sectional, armchair, loungeChair, ottoman, coffeeTable, sideTable, tvConsole, bookshelf, floorCushion, rug, curtains, wallArt, mirror];
export { sofaRun, addFronts, addHandleLocal, LEG_MAT };
void gridGeo;
