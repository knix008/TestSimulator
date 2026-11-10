// More outdoor items: chairs, swings, hammock, grills, pizza oven, fire pits, benches, picnic
// table, planters, garden lights, parasols, rattan & hanging chairs, bistro set, daybed, bicycle,
// garden tools, water features, shed, pergola, gazebo, arbour, fences, gate, mailbox, shower,
// hot tub, swing set, paving and topiary, plus a few preset variants of outdoor.js entries.
// See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, item, P, variant, rng, shellGeo, pillowGeo, leafGeo, placeLeaf, roundRect, frameShape, transformAdded, addPot } from './helpers.js';
import { centreKit } from './office.js';
import { ITEMS as BASE, slats, grass, boxwood } from './outdoor.js';
import { archOutline, addFire, latheMod } from './structure-more.js';

const base = (id) => BASE.find((e) => e.id === id);

/* ---------------------------------------------------------------- helpers */

/** Box between two points in the y/z plane at x (length along the segment; sx across x, sy across the other axis). */
function boxYZ(k, role, mat, sx, sy, a, b, x = 0, o = {}) {
  const dy = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dy, dz);
  return k.box(role, mat, sx, sy, len, x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { r: 0.004, ...o, rx: Math.atan2(-dy, dz) });
}

/** Wheel in the x/y plane (axle along z): tyre torus, rim, hub and `spokes` spokes. */
function wheel(k, x, y, z, R, { tyre = 0.02, spokes = 16, rim = 'metal-steel', tyreMat = 'rubber-black', hubLen = 0.06 } = {}) {
  k.add('tyres', tyreMat, new THREE.TorusGeometry(R - tyre, tyre, k.seg(10, 5), k.seg(40, 14)).translate(x, y, z));
  k.add('rims', rim, new THREE.TorusGeometry(R - 2 * tyre - 0.004, 0.007, k.seg(6, 4), k.seg(40, 14)).translate(x, y, z));
  k.cyl('rims', rim, 0.02, 0.02, hubLen, x, y, z - hubLen / 2, { rx: Math.PI / 2, segs: k.seg(12, 6) });
  if (k.hi || spokes <= 8) for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2, rr = R - 2 * tyre - 0.008, s = i % 2 ? 1 : -1;
    k.rod('rims', rim, [x, y, z + s * hubLen * 0.4], [x + Math.cos(a) * rr, y + Math.sin(a) * rr, z], 0.0015, { segs: 3 });
  }
}

/** Lathe that keeps flat faces (square planters): `segs` sides, rotated by ry. */
function prism(k, role, mat, profile, segs, x, y, z, ry = Math.PI / 4, o = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, py]) => new THREE.Vector2(r, py)), segs).toNonIndexed();
  g.rotateY(ry);
  g.computeVertexNormals();
  g.translate(x, y, z);
  return k.add(role, mat, g, o);
}

const wood = (def = 'wood-teak') => P.mat('wood', '나무', 'Wood', def, 'wood');

/* ------------------------------------------------------------------ chairs */

const adirondack = item({
  id: 'out-adirondack-chair', category: 'outdoor', ko: '아디론닥 체어', en: 'Adirondack chair', size: [0.85, 1.031, 1.106],
  params: [wood('wood-white'), P.bool('cushion', '방석', 'Seat cushion', false), P.mat('fabric', '방석 천', 'Cushion fabric', 'fabric-navy', 'fabric')],
  tags: ['adirondack', 'garden chair', 'lawn chair', 'muskoka', '아디론닥', '정원 의자', '야외 의자', '캠핑 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.wood;
    for (const sx of [-1, 1]) {
      boxYZ(k, 'frame', m, 0.025, 0.1, [0.36, 0.42], [0.05, -0.42], sx * 0.31);
      k.box('frame', m, 0.025, 0.57, 0.09, sx * 0.335, 0.285, 0.33, { r: 0.004 });
      k.box('frame', m, 0.14, 0.022, 0.84, sx * 0.355, 0.581, -0.01, { r: 0.008, segs: 2 });
      k.box('frame', m, 0.025, 0.1, 0.06, sx * 0.335, 0.52, 0.39, { r: 0.004 }); // arm bracket
    }
    slats(k, 'slats', m, 0.6, 7, 0.4, 0.4, 0.27, -0.26, 0.02);
    // fan back: centre slats longest, rounded tops, leaning back
    const b = 0.38, by = 0.12, bz = -0.3, n = 7, sw = 0.072;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (sw + 0.012), L = 0.98 - 0.22 * (x / 0.28) ** 2;
      k.rbox('slats', m, sw, L, 0.02, 0.012, x, by + (L / 2) * Math.cos(b), bz - (L / 2) * Math.sin(b), { rx: -b, segs: 2 });
    }
    for (const t of [0.12, 0.47]) k.box('frame', m, 0.62 - (t > 0.3 ? 0.0 : 0.04), 0.07, 0.022, 0, by + t * Math.cos(b), bz - t * Math.sin(b) - 0.022, { r: 0.004, rx: -b });
    if (p.cushion) k.soft('cushion', p.fabric, 0.56, 0.06, 0.5, 0.025, 0, 0.43, 0.08, { puff: 0.012, rx: 0.15 });
    centreKit(k);
    return k.group();
  },
});

const deckChair = item({
  id: 'out-deck-chair', category: 'outdoor', ko: '접이식 캔버스 데크체어', en: 'Folding canvas deck chair', size: [0.62, 0.99, 1.0],
  params: [wood('wood-ash'), P.mat('fabric', '캔버스', 'Canvas', 'fabric-navy', 'fabric'), P.mat('fabric2', '줄무늬', 'Stripe', 'fabric-linen-white', 'fabric')],
  tags: ['deck chair', 'beach chair', 'folding chair', 'canvas', '데크체어', '비치 체어', '접이식 의자', '캠핑'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.wood;
    for (const sx of [-1, 1]) {
      boxYZ(k, 'frame', m, 0.022, 0.045, [0, 0.45], [0.98, -0.4], sx * 0.29); // back frame
      boxYZ(k, 'frame', m, 0.022, 0.045, [0, -0.52], [0.42, 0.4], sx * 0.255); // leg frame
    }
    k.rod('frame', m, [-0.3, 0.965, -0.39], [0.3, 0.965, -0.39], 0.016, { segs: k.seg(10, 5) });
    k.rod('frame', m, [-0.266, 0.405, 0.39], [0.266, 0.405, 0.39], 0.016, { segs: k.seg(10, 5) });
    k.rod('frame', m, [-0.266, 0.09, -0.43], [0.266, 0.09, -0.43], 0.013, { segs: k.seg(10, 5) });
    // striped sling sagging between the top bar and the front bar
    const T = [0.965, -0.39], F = [0.405, 0.39], strips = 7, W = 0.48;
    for (let s = 0; s < strips; s++) {
      const x0 = -W / 2 + (W * s) / strips, x1 = x0 + W / strips;
      const g = shellGeo(k.seg(3, 1), k.seg(18, 8), (u, v) => [x0 + (x1 - x0) * u, T[0] + (F[0] - T[0]) * v - 0.2 * Math.sin(Math.PI * v) + 0.017, T[1] + (F[1] - T[1]) * v + 0.04 * Math.sin(Math.PI * v)], 0.003);
      k.add('canvas', s % 2 ? p.fabric2 : p.fabric, g);
    }
    centreKit(k);
    return k.group();
  },
});

/* ----------------------------------------------------------- hammock, swing */

const hammock = item({
  id: 'out-hammock-stand', category: 'outdoor', ko: '스탠드 해먹', en: 'Hammock with stand', size: [2.83, 1.16, 1.06],
  params: [P.mat('fabric', '해먹 천', 'Fabric', 'fabric-terracotta', 'fabric'), P.mat('metal', '스탠드', 'Stand', 'metal-black', 'metal'), P.bool('pillow', '베개', 'Pillow', true)],
  tags: ['hammock', 'hammock stand', 'garden', 'relax', '해먹', '스탠드 해먹', '정원', '캠핑'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.metal;
    k.tube('stand', m, [[-1.38, 1.12, 0], [-1.3, 0.8, 0], [-1.1, 0.3, 0], [-0.75, 0.07, 0], [0, 0.05, 0], [0.75, 0.07, 0], [1.1, 0.3, 0], [1.3, 0.8, 0], [1.38, 1.12, 0]], 0.03, { radial: k.seg(12, 6), segs: k.seg(120, 30), caps: true });
    for (const sx of [-1, 1]) {
      k.rod('stand', m, [sx * 0.7, 0.03, -0.5], [sx * 0.7, 0.03, 0.5], 0.03, { segs: k.seg(12, 6) });
      for (const sz of [-1, 1]) k.cyl('feet', 'rubber-black', 0.035, 0.035, 0.02, sx * 0.7, 0, sz * 0.5, { segs: k.seg(10, 5) });
      k.rod('stand', m, [sx * 0.7, 0.03, 0], [sx * 0.72, 0.06, 0], 0.03, { segs: 6 });
      // spreader bar + ropes to the hook
      k.rod('spreader', 'wood-teak', [sx * 0.95, 0.94, -0.42], [sx * 0.95, 0.94, 0.42], 0.016, { segs: k.seg(10, 5) });
      for (const z of [-0.38, -0.13, 0.13, 0.38]) k.rod('ropes', 'fabric-linen-white', [sx * 0.95, 0.94, z], [sx * 1.37, 1.13, 0], 0.004, { segs: 4 });
    }
    const L = 1.8, W = 0.8;
    k.add('bed', p.fabric, shellGeo(k.seg(36, 12), k.seg(10, 5), (u, v) => {
      const a = 1 - (2 * u - 1) ** 2, c = 1 - (2 * v - 1) ** 2;
      return [-L / 2 + u * L, 0.95 - 0.42 * a - 0.06 * c * a, (v - 0.5) * W * (1 - 0.08 * a)];
    }, 0.006));
    if (p.pillow) {
      const g = pillowGeo(0.45, 0.28, 0.1, k.hi ? 12 : 6);
      g.rotateX(-Math.PI / 2 + 0.2); g.rotateY(Math.PI / 2);
      g.translate(-0.62, 0.7, 0);
      k.add('pillow', 'fabric-linen-white', g);
    }
    centreKit(k);
    return k.group();
  },
});

function benchSeat(k, m, W, { arms = true, back = true } = {}) {
  // seat at y ≈ 0.45 local, slats along x, back leaning; origin = seat centre floor
  for (const sx of [-1, 1]) {
    k.box('frame', m, 0.05, 0.06, 0.5, sx * (W / 2 - 0.025), 0.42, 0, { r: 0.005 });
    if (arms) {
      k.box('frame', m, 0.05, 0.28, 0.05, sx * (W / 2 - 0.025), 0.57, 0.2, { r: 0.005 });
      k.box('frame', m, 0.07, 0.03, 0.52, sx * (W / 2 - 0.025), 0.72, -0.02, { r: 0.006, segs: 2 });
    }
    if (back) boxYZ(k, 'frame', m, 0.05, 0.05, [0.42, -0.22], [0.98, -0.34], sx * (W / 2 - 0.025));
  }
  slats(k, 'slats', m, W - 0.1, 5, 0.46, 0.24, 0.45, -0.22, 0.022);
  if (back) for (let i = 0; i < 4; i++) {
    const t = 0.15 + i * 0.12, y = 0.42 + t, z = -0.22 - (t / 0.56) * 0.12;
    k.box('slats', m, W - 0.1, 0.08, 0.02, 0, y, z + 0.03, { r: 0.004, rx: -0.21 });
  }
}

const swingA = item({
  id: 'out-swing-aframe', category: 'outdoor', ko: 'A형 그네 벤치', en: 'A-frame swing bench', size: [2.39, 2.06, 1.54],
  params: [wood('wood-teak'), P.bool('cushion', '방석', 'Cushion', true), P.mat('fabric', '방석 천', 'Cushion fabric', 'fabric-linen-beige', 'fabric')],
  tags: ['garden swing', 'swing bench', 'porch swing', 'a-frame', '그네 벤치', '정원 그네', '흔들 의자', '그네'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.wood, H = 2.0;
    for (const sx of [-1, 1]) {
      const x = sx * 1.08;
      for (const sz of [-1, 1]) boxYZ(k, 'frame', m, 0.08, 0.08, [0, sz * 0.72], [H - 0.04, sz * 0.03], x);
      k.box('frame', m, 0.06, 0.08, 0.9, x, 0.55, 0, { r: 0.005 });
      k.box('frame', m, 0.06, 0.06, 0.5, x, 1.45, 0, { r: 0.005 });
    }
    k.box('frame', m, 2.38, 0.12, 0.09, 0, H, 0, { r: 0.008, segs: 2 });
    const W = 1.3, y0 = 0.05;
    transformAdded(k, () => benchSeat(k, m, W), 0, y0, 0.06);
    for (const sx of [-1, 1]) for (const [y, z] of [[0.47, 0.3], [1.02, -0.29]]) k.rod('chains', 'metal-steel', [sx * (W / 2 - 0.02), H - 0.06, 0], [sx * (W / 2 - 0.02), y + y0, z + 0.06], 0.006, { segs: 5 });
    if (p.cushion) k.soft('cushion', p.fabric, W - 0.14, 0.06, 0.44, 0.025, 0, 0.53 + y0, 0.06, { puff: 0.012 });
    centreKit(k);
    return k.group();
  },
});

/* ------------------------------------------------------------------- grills */

const kettle = item({
  id: 'out-bbq-kettle', category: 'outdoor', ko: '케틀 바비큐 그릴', en: 'Kettle BBQ grill', size: [0.64, 1.08, 0.64],
  params: [P.mat('enamel', '본체', 'Body', 'paint-black-matte'), P.bool('lid', '뚜껑', 'Lid', true)],
  tags: ['bbq', 'barbecue', 'kettle grill', 'charcoal grill', '바비큐', '그릴', '케틀 그릴', '숯불'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.29, yc = 0.8, m = p.enamel;
    k.lathe('body', m, [[0, yc - 0.25], [0.12, yc - 0.245], [0.22, yc - 0.2], [0.27, yc - 0.12], [R, yc - 0.02], [R, yc]], 0, 0, 0, { smooth: 12, segs: k.seg(40, 12) });
    k.cyl('grate', 'metal-steel', R - 0.01, R - 0.01, 0.006, 0, yc - 0.03, 0, { segs: k.seg(40, 12) });
    if (p.lid) {
      k.lathe('body', m, [[R + 0.004, yc], [R + 0.004, yc + 0.02], [0.27, yc + 0.11], [0.2, yc + 0.2], [0.1, yc + 0.245], [0, yc + 0.25]], 0, 0, 0, { smooth: 12, segs: k.seg(40, 12) });
      k.cyl('metal', 'metal-steel', 0.045, 0.045, 0.012, 0, yc + 0.244, 0, { segs: k.seg(16, 6) });
      k.rod('handle', 'wood-dark', [-0.07, yc + 0.29, 0], [0.07, yc + 0.29, 0], 0.014, { segs: k.seg(10, 5) });
      for (const s of [-1, 1]) k.rod('metal', 'metal-steel', [s * 0.06, yc + 0.245, 0], [s * 0.06, yc + 0.29, 0], 0.005, { segs: 5 });
    }
    // three legs, two wheels, ash catcher and a triangular rack
    const legs = [0, 2.1, 4.2];
    for (const a of legs) {
      const x = Math.sin(a), z = Math.cos(a);
      k.rod('metal', 'metal-steel', [x * 0.18, yc - 0.21, z * 0.18], [x * 0.27, a === 0 ? 0.03 : 0.1, z * 0.27], 0.012, { segs: k.seg(10, 5) });
      if (a) k.add('wheels', 'rubber-black', new THREE.CylinderGeometry(0.1, 0.1, 0.03, k.seg(20, 8)).rotateZ(Math.PI / 2).rotateY(a).translate(x * 0.29, 0.1, z * 0.29));
    }
    k.lathe('body', m, [[0, 0.33], [0.12, 0.33], [0.13, 0.38], [0.125, 0.385], [0, 0.36]], 0, 0, 0, { segs: k.seg(24, 8) });
    k.cyl('metal', 'metal-steel', 0.22, 0.22, 0.006, 0, 0.3, 0, { segs: 3, ry: Math.PI });
    centreKit(k);
    return k.group();
  },
});

const gasGrill = item({
  id: 'out-bbq-gas', category: 'outdoor', ko: '가스 바비큐 그릴(카트)', en: 'Gas BBQ grill cart', size: [1.25, 1.2, 0.56],
  params: [P.mat('body', '본체', 'Body', 'metal-steel', 'metal'), P.mat('cabinet', '하부장', 'Cabinet', 'metal-black', 'metal')],
  tags: ['gas grill', 'bbq', 'barbecue', 'grill cart', '가스 그릴', '바비큐', '그릴', '야외 주방'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.66, D = 0.5, y0 = 0.08, ch = 0.72;
    k.box('cabinet', p.cabinet, W, ch, D, 0, y0 + ch / 2, 0, { r: 0.006, segs: 2 });
    for (const s of [-1, 1]) {
      k.box('doors', p.body, W / 2 - 0.02, ch - 0.08, 0.012, s * W / 4, y0 + ch / 2 - 0.02, D / 2 + 0.006, { r: 0.003 });
      k.rod('knobs', 'metal-chrome', [s * 0.04, y0 + ch - 0.2, D / 2 + 0.04], [s * 0.04, y0 + 0.2, D / 2 + 0.04], 0.007, { segs: 6 });
      // side shelves on brackets
      k.box('shelves', p.body, 0.3, 0.025, D - 0.06, s * (W / 2 + 0.15), y0 + ch + 0.04, 0, { r: 0.004 });
      k.box('cabinet', p.cabinet, 0.02, 0.06, D - 0.1, s * (W / 2 + 0.28), y0 + ch, 0, { r: 0.002 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wheels', 'rubber-black', 0.04, 0.04, 0.03, sx * (W / 2 - 0.06), 0.04, sz * (D / 2 - 0.07), { rz: Math.PI / 2, segs: k.seg(16, 6) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('wheels', 'metal-black', 0.008, 0.008, 0.06, sx * (W / 2 - 0.06), 0.04, sz * (D / 2 - 0.07), { segs: 5 });
    // firebox, control panel with knobs, half-round hood with handle and thermometer
    const fy = y0 + ch;
    k.box('body', p.body, W, 0.2, D - 0.04, 0, fy + 0.1, -0.02, { r: 0.006, segs: 2 });
    boxYZ(k, 'body', p.body, W, 0.012, [fy, D / 2 - 0.0], [fy + 0.17, D / 2 - 0.05], 0, { r: 0.003 });
    for (let i = 0; i < 4; i++) k.cyl('knobs', 'metal-chrome', 0.022, 0.022, 0.03, -0.24 + i * 0.16, fy + 0.085, D / 2 - 0.02, { rx: Math.PI / 2 - 0.3, segs: k.seg(14, 6) });
    const hood = new THREE.CylinderGeometry(0.22, 0.22, W, k.seg(28, 10), 1, false, 0, Math.PI);
    hood.rotateZ(Math.PI / 2); hood.rotateX(Math.PI / 2 * 0);
    hood.scale(1, 0.9, 1.05);
    hood.translate(0, fy + 0.2, -0.02);
    k.add('hood', p.body, hood);
    k.rod('handles', 'metal-chrome', [-0.24, fy + 0.34, 0.24], [0.24, fy + 0.34, 0.24], 0.011, { segs: k.seg(10, 5) });
    for (const s of [-1, 1]) k.rod('handles', 'metal-chrome', [s * 0.22, fy + 0.31, 0.2], [s * 0.22, fy + 0.34, 0.24], 0.006, { segs: 5 });
    k.cyl('knobs', 'metal-chrome', 0.03, 0.03, 0.01, 0, fy + 0.36, 0.13, { rx: 1.1, segs: k.seg(16, 6) });
    centreKit(k);
    return k.group();
  },
});

const pizzaOven = item({
  id: 'out-pizza-oven', category: 'outdoor', ko: '화덕 피자 오븐', en: 'Wood-fired pizza oven', size: [1.3, 1.7, 1.37],
  params: [P.mat('dome', '돔', 'Dome', 'wall-plaster', 'wall'), P.mat('base', '받침대', 'Base', 'wall-brick-red'), P.bool('fire', '불', 'Fire', true)],
  tags: ['pizza oven', 'wood-fired', 'outdoor kitchen', 'brick oven', '화덕', '피자 오븐', '야외 주방', '벽돌 오븐'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const BW = 1.2, BD = 1.1, BH = 0.9, R = 0.52;
    // base with a log store opening at the front
    for (const sx of [-1, 1]) k.box('base', p.base, 0.2, BH, BD, sx * (BW / 2 - 0.1), BH / 2, 0, { r: 0.004 });
    k.box('base', p.base, BW - 0.4, BH, 0.2, 0, BH / 2, -BD / 2 + 0.1, { r: 0.004 });
    k.box('slab', 'concrete', BW + 0.1, 0.1, BD + 0.1, 0, BH + 0.05, 0, { r: 0.008, segs: 2 });
    k.box('slab', 'concrete', BW - 0.4, 0.05, BD - 0.2, 0, BH - 0.35, 0.05, { r: 0.004 });
    for (let i = 0; i < 6; i++) k.rod('logs', 'wood-dark', [-0.1 + (i % 3) * 0.1 - (Math.floor(i / 3)) * 0.05, BH - 0.3 + Math.floor(i / 3) * 0.1 + 0.04, -0.35], [-0.1 + (i % 3) * 0.1 - (Math.floor(i / 3)) * 0.05, BH - 0.3 + Math.floor(i / 3) * 0.1 + 0.04, 0.35], 0.045, { segs: k.seg(10, 5) });
    const y0 = BH + 0.1;
    k.lathe('dome', p.dome, [[0, 0], [R, 0], [R, 0.04], [R * 0.95, 0.18], [R * 0.78, 0.36], [R * 0.45, 0.48], [0, 0.52]], 0, y0, -0.05, { smooth: 14, segs: k.seg(36, 12) });
    // arched entry tunnel + dark mouth + chimney
    const half = 0.22, top = 0.3, cw = 0.07;
    const inner = archOutline(half, top, 'round', 16), outer = archOutline(half + cw, top + cw, 'round', 16);
    k.panel('dome', p.dome, new THREE.Shape([...outer, ...[...inner].reverse()].map(([x, y]) => new THREE.Vector2(x, y))), 0.24, 0, y0, R - 0.05 + 0.02, { bevel: 0.01 });
    k.panel('mouth', 'paint-black-matte', new THREE.Shape(inner.map(([x, y]) => new THREE.Vector2(x, y))), 0.02, 0, y0 + 0.001, R - 0.13, { bevel: 0.001 });
    k.cyl('chimney', 'metal-black', 0.06, 0.06, 0.42, 0, y0 + top + 0.02, R + 0.02, { segs: k.seg(16, 6) });
    k.cyl('chimney', 'metal-black', 0.1, 0.04, 0.05, 0, y0 + top + 0.44, R + 0.02, { segs: k.seg(16, 6) });
    if (p.fire) addFire(k, 0, y0, R - 0.08, 0.32, 0.18, { logs: 1, scaleZ: 0.4 });
    centreKit(k);
    return k.group();
  },
});

/* ---------------------------------------------------------------- fire pits */

const firePit = item({
  id: 'out-fire-pit-bowl', category: 'outdoor', ko: '화로대(보울형)', en: 'Fire pit bowl', size: [0.919, 0.351, 0.919],
  params: [P.len('diameter', '지름', 'Diameter', 0.92, 0.6, 1.4), P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'), P.bool('fire', '불', 'Fire', true)],
  tags: ['fire pit', 'fire bowl', 'brazier', 'campfire', '화로대', '불멍', '파이어 피트', '캠핑'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2;
    k.lathe('bowl', p.metal, [[0, 0.12], [R * 0.45, 0.12], [R * 0.78, 0.18], [R * 0.96, 0.3], [R, 0.36], [R * 0.97, 0.365], [R * 0.93, 0.31], [R * 0.75, 0.21], [R * 0.42, 0.165], [0, 0.165]], 0, 0, 0, { smooth: 18, segs: k.seg(40, 12) });
    k.lathe('bowl', p.metal, [[R * 0.32, 0], [R * 0.36, 0], [R * 0.3, 0.13], [R * 0.26, 0.13], [R * 0.3, 0.005]], 0, 0, 0, { segs: k.seg(32, 10) });
    if (p.fire) addFire(k, 0, 0.14, 0, R * 0.9, 0.22, { logs: 3, scaleZ: 0.6 });
    return k.group();
  },
});

const fireTable = item({
  id: 'out-fire-table', category: 'outdoor', ko: '가스 파이어 테이블', en: 'Gas fire table', size: [1.2, 0.62, 0.7],
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 2.0), P.mat('body', '몸체', 'Body', 'concrete', 'stone'), P.bool('fire', '불', 'Fire', true)],
  tags: ['fire table', 'gas fire pit', 'fire pit table', 'patio heater', '파이어 테이블', '가스 화로', '불멍 테이블', '야외 난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.7, H = 0.4, bw = 0.2;
    k.box('body', p.body, W - 0.04, H - 0.04, D - 0.04, 0, (H - 0.04) / 2, 0, { r: 0.006, segs: 2 });
    k.slab('body', p.body, frameShape(W, D, bw, bw, 0.02), 0.04, H - 0.04, { bevel: 0.004 });
    k.box('burner', 'paint-black-matte', W - 2 * bw + 0.004, 0.02, D - 2 * bw + 0.004, 0, H - 0.05, 0, { r: 0 });
    k.box('stones', 'glass-tinted', W - 2 * bw - 0.01, 0.015, D - 2 * bw - 0.01, 0, H - 0.035, 0, { r: 0.004 });
    const gw = W - 2 * bw + 0.06, gd = D - 2 * bw + 0.06, gh = 0.2;
    for (const s of [-1, 1]) {
      k.box('glass', 'glass-clear', gw, gh, 0.008, 0, H + gh / 2, s * gd / 2, { r: 0 });
      k.box('glass', 'glass-clear', 0.008, gh, gd - 0.01, s * gw / 2, H + gh / 2, 0, { r: 0 });
    }
    if (p.fire) {
      const n = Math.max(3, Math.round((W - 2 * bw) / 0.1));
      for (let i = 0; i < n; i++) {
        const x = -(W - 2 * bw) / 2 + 0.05 + (W - 2 * bw - 0.1) * (i / (n - 1)), fh = 0.1 + 0.06 * Math.abs(Math.sin(i * 1.9));
        k.lathe('flame', 'light-warm', [[0, 0], [0.035, 0.012], [0.03, fh * 0.35], [0.014, fh * 0.75], [0, fh]], x, H - 0.03, 0, { smooth: 8, segs: k.seg(10, 5), scale: [1, 1, 0.5], overrides: { color: '#ffb060', emissive: '#ff7a1a', emissiveIntensity: 1.6 } });
      }
      k.light(0, H + 0.15, 0, { color: '#ff9a4a', intensity: 1.0, distance: 4 });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------------ benches */

const benchSlatted = item({
  id: 'out-bench-slatted', category: 'outdoor', ko: '원목 정원 벤치', en: 'Slatted garden bench', size: [1.5, 1.0, 0.65],
  params: [P.len('width', '폭', 'Width', 1.5, 1.0, 2.2), wood('wood-teak')],
  tags: ['garden bench', 'park bench', 'teak bench', 'outdoor bench', '정원 벤치', '원목 벤치', '야외 벤치', '공원 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, m = p.wood;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.025);
      k.box('frame', m, 0.05, 0.72, 0.05, x, 0.36, 0.2, { r: 0.005 });
      boxYZ(k, 'frame', m, 0.05, 0.05, [0, -0.24], [0.98, -0.34], x);
      k.box('frame', m, 0.05, 0.05, 0.48, x, 0.12, -0.02, { r: 0.005 });
    }
    benchSeat(k, m, W, { arms: true, back: true });
    k.box('frame', m, W - 0.1, 0.07, 0.03, 0, 0.38, 0.22, { r: 0.004 });
    k.box('frame', m, W - 0.1, 0.05, 0.03, 0, 0.12, -0.02, { r: 0.004 });
    centreKit(k);
    return k.group();
  },
});

const benchIron = item({
  id: 'out-bench-cast-iron', category: 'outdoor', ko: '주물 다리 공원 벤치', en: 'Cast-iron park bench', size: [1.5, 0.92, 0.67],
  params: [P.len('width', '폭', 'Width', 1.5, 1.0, 2.4), wood('wood-teak'), P.mat('metal', '주물', 'Cast iron', 'metal-black', 'metal')],
  tags: ['park bench', 'cast iron bench', 'victorian bench', 'garden bench', '공원 벤치', '주물 벤치', '정원 벤치', '클래식 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, m = p.metal;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.03), at = (y, z) => [x, y, z];
      const opt = { radial: k.seg(8, 4), segs: k.seg(40, 12) };
      k.tube('ends', m, [at(0.01, 0.3), at(0.2, 0.25), at(0.4, 0.24), at(0.56, 0.26), at(0.64, 0.24), at(0.63, 0.18), at(0.58, 0.19)], 0.016, { ...opt, caps: true });
      k.tube('ends', m, [at(0.01, -0.32), at(0.2, -0.22), at(0.4, -0.19), at(0.65, -0.26), at(0.9, -0.33)], 0.018, { ...opt, caps: true });
      k.tube('ends', m, [at(0.62, 0.21), at(0.66, 0.1), at(0.66, -0.1), at(0.62, -0.23)], 0.014, opt);
      k.rod('ends', m, at(0.4, 0.25), at(0.4, -0.19), 0.014, { segs: k.seg(8, 4) });
      // scrolls in the leg corners
      for (const [cy, cz, s] of [[0.2, 0.15, 1], [0.2, -0.13, -1]]) {
        const pts = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * Math.PI * 1.6, r = 0.07 * (1 - 0.6 * t); pts.push(at(cy + Math.cos(a) * r, cz + s * Math.sin(a) * r)); }
        k.tube('ends', m, pts, 0.008, { radial: k.seg(6, 4), segs: k.seg(20, 8) });
      }
      for (const [y, z] of [[0.01, 0.3], [0.01, -0.32]]) k.box('ends', m, 0.06, 0.012, 0.06, x, 0.006, z, { r: 0.002 }) && void y;
    }
    slats(k, 'slats', p.wood, W, 6, 0.42, 0.27, 0.42, -0.19, 0.022);
    for (let i = 0; i < 4; i++) {
      const y = 0.52 + i * 0.1, z = -0.21 - (y - 0.4) * 0.27;
      k.box('slats', p.wood, W, 0.065, 0.022, 0, y, z + 0.025, { r: 0.004, rx: -0.27 });
    }
    centreKit(k);
    return k.group();
  },
});

const picnic = item({
  id: 'out-picnic-table', category: 'outdoor', ko: '피크닉 테이블(벤치 일체형)', en: 'Picnic table with benches', size: [1.8, 0.76, 1.56],
  params: [P.len('length', '길이', 'Length', 1.8, 1.2, 2.6), wood('wood-pine')],
  tags: ['picnic table', 'picnic bench', 'garden table', 'camping', '피크닉 테이블', '야외 테이블', '벤치 테이블', '캠핑'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, m = p.wood, H = 0.76;
    for (let i = 0; i < 5; i++) k.box('top', m, L, 0.035, 0.14, 0, H - 0.0175, -0.3 + i * 0.15, { r: 0.005, segs: 2 });
    for (const sz of [-1, 1]) for (let i = 0; i < 2; i++) k.box('top', m, L, 0.035, 0.12, 0, 0.45 - 0.0175, sz * (0.56 + i * 0.13 - 0.065), { r: 0.005, segs: 2 });
    for (const sx of [-1, 1]) {
      const x = sx * (L / 2 - 0.3);
      for (const sz of [-1, 1]) boxYZ(k, 'frame', m, 0.045, 0.09, [0, sz * 0.62], [H - 0.035, sz * 0.12], x);
      k.box('frame', m, 0.045, 0.09, 1.5, x, 0.45 - 0.035 - 0.045, 0, { r: 0.005 });
      k.box('frame', m, 0.045, 0.07, 0.72, x + sx * 0.0, H - 0.035 - 0.035, 0, { r: 0.005 });
    }
    k.box('frame', m, L - 0.65, 0.07, 0.045, 0, 0.3, 0, { r: 0.005 });
    centreKit(k);
    return k.group();
  },
});

/* ----------------------------------------------------------------- planters */

const planterTall = item({
  id: 'out-planter-tall', category: 'outdoor', ko: '사각 톨 화분(토피어리)', en: 'Tall square planter', size: [0.62, 1.3, 0.62],
  params: [P.len('height', '화분 높이', 'Pot height', 0.8, 0.4, 1.2), P.mat('pot', '화분', 'Planter', 'concrete', 'stone'), P.pick('plant', '식물', 'Planting', 'ball', [['ball', '회양목 볼', 'Boxwood ball'], ['grass', '관상용 풀', 'Ornamental grass']])],
  tags: ['tall planter', 'fibre stone planter', 'topiary', 'square pot', '톨 화분', '사각 화분', '토피어리', '대형 화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, b = 0.2 * Math.SQRT2, t = 0.25 * Math.SQRT2;
    prism(k, 'pot', p.pot, [[0, 0], [b, 0], [b + 0.003, 0.01], [t, h - 0.02], [t + 0.012, h - 0.015], [t + 0.012, h], [t - 0.03, h], [t - 0.03, h * 0.92], [0, h * 0.92]], 4, 0, 0, 0);
    k.box('soil', 'soil', 0.42, 0.012, 0.42, 0, h * 0.92 + 0.006, 0, { r: 0 });
    if (p.plant === 'ball') {
      k.cyl('trunk', 'plant-stem', 0.018, 0.022, 0.12, 0, h * 0.92, 0, { segs: 8 });
      boxwood(k, 0, h + 0.27, 0, 0.3, 4);
    } else grass(k, 0, h * 0.92, 0, 0.12, 0.6, k.hi ? 70 : 24, 3);
    centreKit(k, { y: false });
    return k.group();
  },
});

/** Lettuce-like head of curled leaves at (x, y, z). */
function veg(k, x, y, z, r, seed) {
  const rand = rng(seed);
  const n = k.hi ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const g = leafGeo(r * (0.9 + rand() * 0.3), r * 0.9, { nu: 2, nv: k.hi ? 5 : 3, droop: -0.1, fold: 0.5, curl: 0.25, outline: (t) => Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.6 });
    placeLeaf(g, [x, y, z], (i / n) * Math.PI * 2 + rand() * 0.4, 0.5 + rand() * 0.6 + (i % 2) * 0.3, 0);
    k.add('plants', i % 2 ? 'plant-leaf-light' : 'plant-leaf', g);
  }
}

const raisedBed = item({
  id: 'out-raised-bed', category: 'outdoor', ko: '텃밭 상자(다리형)', en: 'Raised vegetable bed', size: [1.2, 0.98, 0.6],
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 2.0), wood('wood-pine'), P.bool('plants', '채소', 'Vegetables', true)],
  tags: ['raised bed', 'vegetable garden', 'planter', 'herb garden', '텃밭', '텃밭 상자', '채소 화분', '베란다 텃밭'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.6, top = 0.82, depth = 0.26, m = p.wood;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', m, 0.06, top, 0.06, sx * (W / 2 - 0.03), top / 2, sz * (D / 2 - 0.03), { r: 0.005 });
    for (let i = 0; i < 2; i++) {
      const y = top - depth + 0.065 + i * 0.13;
      for (const s of [-1, 1]) {
        k.box('boards', m, W - 0.12, 0.12, 0.02, 0, y, s * (D / 2 - 0.01), { r: 0.003 });
        k.box('boards', m, 0.02, 0.12, D - 0.12, s * (W / 2 - 0.01), y, 0, { r: 0.003 });
      }
    }
    k.box('boards', m, W - 0.06, 0.02, D - 0.06, 0, top - depth, 0, { r: 0.002 });
    k.box('frame', m, W - 0.12, 0.02, D - 0.12, 0, 0.18, 0, { r: 0.002 });
    k.box('soil', 'soil', W - 0.06, 0.02, D - 0.06, 0, top - 0.05, 0, { r: 0 });
    if (p.plants) {
      const n = Math.max(2, Math.round(W / 0.3));
      for (let i = 0; i < n; i++) for (const sz of [-1, 1]) veg(k, -W / 2 + (W / n) * (i + 0.5), top - 0.04, sz * 0.13, 0.13, 3 + i * 2 + sz);
    }
    centreKit(k, { y: false });
    return k.group();
  },
});

/* ------------------------------------------------------------ garden lights */

const bollard = item({
  id: 'out-bollard-light', category: 'outdoor', ko: '정원 볼라드 조명', en: 'Garden bollard light', size: [0.16, 0.8, 0.16],
  params: [P.len('height', '높이', 'Height', 0.8, 0.3, 1.1), P.mat('body', '몸체', 'Body', 'paint-grey-matte')],
  tags: ['bollard', 'garden light', 'path light', 'outdoor lamp', '볼라드', '정원등', '잔디등', '야외 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, r = 0.07;
    k.cyl('body', p.body, r, r, H - 0.2, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('body', p.body, 0.08, 0.08, 0.012, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('lamp', 'light-warm', r * 0.85, r * 0.85, 0.16, 0, H - 0.2, 0, { segs: k.seg(24, 8) });
    for (let i = 0; i < 4; i++) k.cyl('body', p.body, r + 0.004, r + 0.004, 0.012, 0, H - 0.2 + 0.03 + i * 0.035, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.box('body', p.body, 0.012, 0.17, 0.02, Math.sin(a) * (r - 0.006), H - 0.12, Math.cos(a) * (r - 0.006), { r: 0.002, ry: a }); }
    k.cyl('body', p.body, r + 0.008, r, 0.04, 0, H - 0.04, 0, { segs: k.seg(28, 10) });
    k.light(0, H - 0.12, 0, { intensity: 0.4, distance: 3 });
    return k.group();
  },
});

const lanternPost = item({
  id: 'out-lantern-post', category: 'outdoor', ko: '클래식 가로등(랜턴)', en: 'Classic lantern post', size: [0.34, 2.4, 0.34],
  params: [P.len('height', '높이', 'Height', 2.4, 1.6, 3.2), P.mat('metal', '금속', 'Metal', 'metal-black', 'metal')],
  tags: ['lamp post', 'lantern', 'street light', 'garden light', '가로등', '정원등', '랜턴', '야외 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, m = p.metal, lh = 0.42, y0 = H - lh - 0.1;
    k.lathe('post', m, [[0, 0], [0.16, 0], [0.16, 0.03], [0.12, 0.08], [0.09, 0.2], [0.06, 0.3], [0.05, 0.32], [0, 0.32]], 0, 0, 0, { smooth: 10, segs: k.seg(24, 8) });
    k.cyl('post', m, 0.04, 0.045, y0 - 0.32, 0, 0.32, 0, { segs: k.seg(16, 6) });
    k.lathe('post', m, [[0, 0], [0.05, 0], [0.09, 0.05], [0.12, 0.06], [0, 0.06]], 0, y0 - 0.06, 0, { segs: k.seg(16, 6), ry: Math.PI / 4 });
    // lantern: 4 glass panes, corner posts, pyramid roof, finial
    const hw = 0.11, tw = 0.14;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.rod('post', m, [sx * hw, y0, sz * hw], [sx * tw, y0 + lh, sz * tw], 0.008, { segs: 6 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2, d = (hw + tw) / 2 - 0.002;
      const g = new THREE.BoxGeometry(2 * (hw + tw) / 2 - 0.01, lh - 0.02, 0.004);
      const tilt = Math.atan2(tw - hw, lh);
      g.rotateX(-tilt); g.rotateY(a); g.translate(Math.sin(a) * d, y0 + lh / 2, Math.cos(a) * d);
      k.add('glass', 'glass-frosted', g);
    }
    k.box('post', m, 2 * hw + 0.03, 0.02, 2 * hw + 0.03, 0, y0, 0, { r: 0.003 });
    k.box('post', m, 2 * tw + 0.04, 0.02, 2 * tw + 0.04, 0, y0 + lh, 0, { r: 0.003 });
    k.cyl('post', m, 0.01, (tw + 0.04) * Math.SQRT2, 0.13, 0, y0 + lh + 0.01, 0, { segs: 4, ry: Math.PI / 4 });
    k.lathe('post', m, [[0, 0], [0.02, 0], [0.025, 0.03], [0.01, 0.06], [0, 0.08]], 0, y0 + lh + 0.12, 0, { smooth: 8, segs: k.seg(12, 5) });
    k.sphere('lamp', 'light-warm', 0.04, 0, y0 + lh * 0.45, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    k.light(0, y0 + lh * 0.45, 0, { intensity: 0.8, distance: 6 });
    return k.group();
  },
});

/* -------------------------------------------------------------- shade & sofa */

const cantilever = item({
  id: 'out-cantilever-parasol', category: 'outdoor', ko: '사이드 파라솔(캔틸레버)', en: 'Cantilever offset parasol', size: [3.43, 2.73, 3.0],
  params: [P.len('size', '캐노피 크기', 'Canopy size', 3.0, 2.0, 4.0), P.mat('fabric', '천', 'Canopy', 'fabric-linen-grey', 'fabric'), P.mat('metal', '프레임', 'Frame', 'metal-black', 'metal')],
  tags: ['cantilever parasol', 'offset umbrella', 'side parasol', 'banana umbrella', '사이드 파라솔', '캔틸레버 파라솔', '파라솔', '그늘막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, m = p.metal, top = 2.65, mx = -S / 2 - 0.25;
    // cross base with weights, mast, arched arm, square canopy hanging from the arm tip
    k.box('base', m, 0.9, 0.05, 0.08, mx, 0.025, 0, { r: 0.005 });
    k.box('base', m, 0.08, 0.05, 0.9, mx, 0.025, 0, { r: 0.005 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box('weights', 'concrete', 0.3, 0.05, 0.3, mx + dx * 0.2, 0.075, dz * 0.2, { r: 0.006 });
    k.cyl('mast', m, 0.035, 0.04, top - 0.1, mx, 0.05, 0, { segs: k.seg(16, 6) });
    k.tube('mast', m, [[mx, top - 0.1, 0], [mx + 0.15, top + 0.02, 0], [mx * 0.5, top + 0.06, 0], [0, top, 0]], 0.03, { radial: k.seg(10, 5), segs: k.seg(40, 12) });
    k.rod('mast', m, [0, top, 0], [0, top - 0.3, 0], 0.02, { segs: k.seg(10, 5) });
    const surf = (u, v) => {
      const x = (u - 0.5) * S, z = (v - 0.5) * S, d = Math.max(Math.abs(x), Math.abs(z)) / (S / 2);
      const sag = 0.05 * Math.sin(Math.PI * Math.min(Math.abs(x), Math.abs(z)) / (S / 2));
      return [x, top - 0.3 - 0.35 * d ** 1.3 - sag + 0.02, z];
    };
    k.add('canopy', p.fabric, shellGeo(k.seg(24, 10), k.seg(24, 10), (u, v) => surf(u, 1 - v), 0.004));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const tip = surf(0.5 + sx * 0.5, 0.5 + sz * 0.5);
      k.rod('ribs', m, [0, top - 0.32, 0], [tip[0], tip[1] - 0.012, tip[2]], 0.008, { segs: 5 });
    }
    centreKit(k);
    return k.group();
  },
});

const rattanSofa = item({
  id: 'out-rattan-sofa', category: 'outdoor', ko: '라탄 야외 소파', en: 'Rattan outdoor sofa', size: [1.903, 0.889, 0.843],
  params: [P.len('width', '폭', 'Width', 1.9, 1.3, 2.6), P.mat('rattan', '라탄', 'Rattan', 'rattan', 'wood'), P.mat('fabric', '쿠션', 'Cushions', 'fabric-linen-white', 'fabric')],
  tags: ['rattan sofa', 'wicker sofa', 'outdoor sofa', 'patio sofa', '라탄 소파', '야외 소파', '테라스 소파', '위커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.84, r = p.rattan, aw = 0.14, bt = 0.14;
    k.soft('body', r, W - 2 * aw + 0.02, 0.32, D - bt, 0.03, 0, 0.08 + 0.16, bt / 2, { puff: 0.004 });
    for (const sx of [-1, 1]) k.soft('body', r, aw, 0.6, D, 0.04, sx * (W / 2 - aw / 2), 0.38, 0, { puff: 0.004 });
    k.soft('body', r, W - 2 * aw + 0.02, 0.7, bt, 0.04, 0, 0.43, -D / 2 + bt / 2, { puff: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('feet', 'metal-black', 0.04, 0.08, 0.04, sx * (W / 2 - 0.06), 0.04, sz * (D / 2 - 0.06), { r: 0.004 });
    const n = Math.max(2, Math.round((W - 2 * aw) / 0.58)), cw = (W - 2 * aw) / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + aw + cw * (i + 0.5);
      k.soft('cushions', p.fabric, cw - 0.01, 0.12, D - bt - 0.03, 0.04, x, 0.46, bt / 2 + 0.005, { puff: 0.015, sag: 0.01 });
      k.soft('cushions', p.fabric, cw - 0.03, 0.38, 0.14, 0.05, x, 0.68, -D / 2 + bt + 0.06, { puff: 0.02, rx: -0.15 });
    }
    centreKit(k);
    return k.group();
  },
});

const eggChair = item({
  id: 'out-egg-chair', category: 'outdoor', ko: '행잉 에그 체어', en: 'Hanging egg chair', size: [1.0, 2.0, 1.12],
  params: [P.mat('rattan', '라탄', 'Rattan', 'rattan', 'wood'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-linen-beige', 'fabric'), P.mat('metal', '스탠드', 'Stand', 'metal-black', 'metal')],
  tags: ['egg chair', 'hanging chair', 'swing chair', 'pod chair', '에그 체어', '행잉 체어', '그네 의자', '라탄 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = 0.47, cy = 1.0, sy = 1.3, open = 1.0;
    k.lathe('stand', p.metal, [[0, 0], [0.38, 0], [0.4, 0.015], [0.36, 0.035], [0.08, 0.05], [0, 0.05]], 0, 0, -0.1, { smooth: 10, segs: k.seg(32, 10) });
    k.tube('stand', p.metal, [[0, 0.04, -0.42], [0, 0.8, -0.62], [0, 1.6, -0.62], [0, 1.95, -0.35], [0, 1.98, -0.08], [0, 1.94, 0]], 0.03, { radial: k.seg(12, 6), segs: k.seg(60, 16) });
    k.rod('stand', p.metal, [0, 1.94, 0], [0, cy + R * sy - 0.02, 0], 0.008, { segs: 5 });
    // shell: a stretched sphere with the front cut away, given real thickness
    const phi0 = Math.PI / 2 + open / 2, phiL = Math.PI * 2 - open;
    k.add('shell', p.rattan, shellGeo(k.seg(40, 14), k.seg(24, 10), (u, v) => {
      const ph = phi0 + u * phiL, th = 0.05 + v * (Math.PI - 0.1);
      const cut = Math.max(0, Math.sin(th));
      return [-R * Math.cos(ph) * cut, cy + R * sy * Math.cos(th), R * Math.sin(ph) * cut];
    }, 0.025));
    k.soft('cushion', p.fabric, 0.52, 0.1, 0.46, 0.08, 0, cy - 0.31, 0.03, { puff: 0.02, sag: 0.015 });
    const g = pillowGeo(0.5, 0.45, 0.14, k.hi ? 12 : 6);
    g.rotateX(-0.15); g.translate(0, cy + 0.0, -0.24);
    k.add('cushion', p.fabric, g);
    centreKit(k);
    return k.group();
  },
});

export const PART_A = [adirondack, deckChair, hammock, swingA, kettle, gasGrill, pizzaOven, firePit, fireTable, benchSlatted, benchIron, picnic, planterTall, raisedBed, bollard, lanternPost, cantilever, rattanSofa, eggChair];
export const ITEMS = [...PART_A];
void base; void variant; void roundRect; void addPot; void latheMod;
