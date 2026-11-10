// Still more appliances (category 'appliances'): kitchen (induction hob, chimney / island hoods,
// air fryer, rice cooker, stand mixer, espresso machine, toaster, blender, kettle, bread maker,
// slow juicer, countertop dishwasher, ice maker, warming drawer, drip coffee maker), laundry
// (garment steamer, twin washer, steam iron station), climate (desk fan, panel radiator, heat pump
// outdoor unit, electric fireplace, ceramic heater, bladeless fan, air circulator), audio-video
// (turntable, stereo amplifier, UST projector with ALR screen, frame TV, party speaker) and
// cleaning (canister vacuum, robot vacuum with auto-empty dock).
// Origin: bottom centre (finish() re-centres every build), front +Z. See ARCHITECTURE.md §12.
// Glowing parts (indicator displays, LED rings, fireplace flames) use the mesh role 'display'.
import { THREE, Kit, P, T, boxUV, frameShape, ellipse, roundRect } from './helpers.js';
import { finish } from './kitchen.js';
import { mk, driver } from './appliances-more.js';

const PI = Math.PI;
const CAT = 'appliances';
const a$ = (def) => mk({ category: CAT, ...def });

/* --------------------------------------------------------------- helpers */

/** Torus ring (radius R, tube r) facing +z at (x, y, z); rx = PI/2 lays it flat. */
function ring(k, role, mat, R, r, x, y, z, { rx = 0, ry = 0, seg = 32, scale = null } = {}) {
  const g = new THREE.TorusGeometry(R, r, k.seg(6, 3), k.seg(seg, 10));
  if (scale) g.scale(...scale);
  return k.add(role, mat, T(g, x, y, z, rx, ry, 0));
}

/** Round knob on a front face at zf (sticks out +z by d). */
const knob = (k, role, mat, r, d, x, y, zf) => k.cyl(role, mat, r, r * 0.9, d, x, y, zf, { rx: PI / 2, segs: k.seg(20, 8) });

/** Square-ish frustum: bottom wb × db, top wt × dt (top shifted by tz along z), height h, bottom centre (x, y, z). */
function frustum(k, role, mat, wb, db, wt, dt, h, x, y, z, { tz = 0 } = {}) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    pos.setXYZ(i, pos.getX(i) * (top ? wt : wb), pos.getY(i) * h + h / 2, pos.getZ(i) * (top ? dt : db) + (top ? tz : 0));
  }
  g.computeVertexNormals();
  return k.add(role, mat, g.translate(x, y, z));
}

/** Small feet (rubber pads) under a w × d footprint. */
function feet(k, w, d, { h = 0.01, r = 0.012, mat = 'rubber-black', role = 'feet' } = {}) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(role, mat, r, r, h, sx * (w / 2 - r * 2), 0, sz * (d / 2 - r * 2), { segs: k.seg(12, 6) });
}

/** Horizontal slats (vents / grilles) of width w spread from y0 to y1 on a face at z. */
function slats(k, role, mat, n, w, x, y0, y1, z, { t = 0.006, d = 0.006 } = {}) {
  for (let i = 0; i < n; i++) k.box(role, mat, w, t, d, x, y0 + ((y1 - y0) * (i + 0.5)) / n, z, { r: 0 });
}

/** Fan rotor: n pitched blades round a hub, facing +z at (x, y, z). */
function blades(k, role, mat, n, R, x, y, z, { pitch = 0.4, bw = 0.38 } = {}) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(R * bw, R * 0.78, 0.004).translate(0, R * 0.55, 0).rotateY(pitch).rotateZ((i / n) * PI * 2);
    k.add(role, mat, g.translate(x, y, z));
  }
  k.cyl(role, mat, R * 0.18, R * 0.2, 0.035, x, y, z - 0.02, { rx: PI / 2, segs: k.seg(16, 6) });
}

/** Fan guard: domed front rings + spokes, a rear ring and side wires (depth along −z). */
function guard(k, role, mat, R, x, y, z, depth = 0.06) {
  for (const f of [0.38, 0.68, 1]) ring(k, role, mat, R * f, 0.0024, x, y, z + depth * 0.35 * (1 - f));
  ring(k, role, mat, R, 0.003, x, y, z - depth);
  const n = k.hi ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2, c = Math.cos(a), s = Math.sin(a);
    k.rod(role, mat, [x + c * R * 0.14, y + s * R * 0.14, z + depth * 0.33], [x + c * R, y + s * R, z], 0.0018, { segs: 4 });
    k.rod(role, mat, [x + c * R, y + s * R, z], [x + c * R, y + s * R, z - depth], 0.0018, { segs: 4 });
  }
  k.cyl(role, mat, R * 0.15, R * 0.15, 0.006, x, y, z + depth * 0.33 - 0.004, { rx: PI / 2, segs: k.seg(20, 8) });
}

/** Runs fn() and applies matrix m to every geometry it added (tilting heads, lids). */
function withM(k, fn, m) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  fn();
  for (const [key, p] of k.parts) {
    for (let i = before.get(key) ?? 0; i < p.geos.length; i++) { p.geos[i].applyMatrix4(m); boxUV(p.geos[i]); }
  }
}

/** Rotation about a horizontal x axis through (0, y, z). */
const tiltX = (a, y, z) => new THREE.Matrix4().makeTranslation(0, y, z).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(0, -y, -z));

const KFIN = 'paint';
const SURF = { placement: 'surface' };

/* ================================================================ kitchen */

const inductionHob = a$({
  id: 'apx-induction-hob', ...SURF, ko: '인덕션 쿡탑', en: 'Induction hob',
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.3, 0.9),
    P.int('zones', '화구 수', 'Cooking zones', 4, 1, 5),
    P.mat('frame', '테두리', 'Frame', 'metal-steel', 'metal'),
  ],
  tags: ['induction hob', 'cooktop', 'electric hob', '인덕션', '쿡탑', '전기레인지', '하이라이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.52, t = 0.006, top = 0.012;
    k.box('body', 'plastic-black', W - 0.03, 0.006, D - 0.03, 0, 0.003, 0, { r: 0 });
    k.box('glass', 'screen-black', W, t, D, 0, top - t / 2, 0, { r: 0.002 });
    for (const s of [-1, 1]) {
      k.box('frame', p.frame, W + 0.006, 0.007, 0.004, 0, top - 0.0035, s * (D / 2 + 0.002), { r: 0.001 });
      k.box('frame', p.frame, 0.004, 0.007, D + 0.006, s * (W / 2 + 0.002), top - 0.0035, 0, { r: 0.001 });
    }
    // cooking zones: two per column, a big one alone when the count is odd
    const cols = Math.max(1, Math.round(W / 0.3));
    const n = Math.min(p.zones, cols * 2);
    const cw = W / cols;
    let left = n;
    for (let c = 0; c < cols && left > 0; c++) {
      const x = -W / 2 + cw * (c + 0.5);
      const pair = left >= 2 && (left - 2 >= cols - c - 1 || c < cols - 1) && !(left === 1);
      const zs = pair ? [[-0.1, 0.095], [0.1, 0.075]] : [[-0.02, 0.11]];
      for (const [z, r0] of zs) {
        const r = Math.min(r0, cw * 0.44);
        ring(k, 'marks', 'paint-grey-matte', r, 0.0012, x, top + 0.0002, z, { rx: PI / 2, seg: 40 });
        ring(k, 'marks', 'paint-grey-matte', r * 0.55, 0.001, x, top + 0.0002, z, { rx: PI / 2, seg: 28 });
      }
      left -= zs.length;
    }
    // touch slider strip at the front
    k.box('display', 'light-cool', Math.min(0.24, W * 0.6), 0.0006, 0.012, 0, top + 0.0003, D / 2 - 0.035, { r: 0 });
    for (let i = 0; i < 3; i++) k.cyl('marks', 'paint-grey-matte', 0.006, 0.006, 0.0006, W / 2 - 0.04 - i * 0.03, top, D / 2 - 0.035, { segs: k.seg(12, 6) });
    return finish(k);
  },
});

const chimneyHood = a$({
  id: 'apx-chimney-hood', placement: 'wall', elevation: 1.55, ko: '침니형 레인지후드', en: 'Chimney cooker hood',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.len('height', '전체 높이', 'Total height', 0.9, 0.6, 1.2),
    P.mat('finish', '마감', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['cooker hood', 'range hood', 'chimney hood', 'extractor', '레인지후드', '후드', '주방 후드', '침니 후드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.5, m = p.finish, rimH = 0.05, canH = 0.2;
    k.box('filters', 'metal-aluminium', W - 0.05, 0.004, D - 0.06, 0, 0.002, 0, { r: 0 });
    for (let i = 1; i < 3; i++) k.box('filters', 'metal-chrome', 0.006, 0.005, D - 0.06, -W / 2 + 0.025 + ((W - 0.05) * i) / 3, 0.0025, 0, { r: 0 });
    k.box('body', m, W, rimH, D, 0, 0.004 + rimH / 2, 0, { r: 0.003 });
    const fw = 0.3, fd = 0.26;
    frustum(k, 'body', m, W - 0.004, D - 0.004, fw, fd, canH, 0, 0.004 + rimH, 0, { tz: -(D - fd) / 2 });
    const fy = 0.004 + rimH + canH, flueH = Math.max(0.1, p.height - fy);
    k.box('body', m, fw, flueH, fd, 0, fy + flueH / 2, -(D - fd) / 2, { r: 0.002 });
    k.box('body', m, fw + 0.004, 0.004, fd + 0.004, 0, fy + flueH * 0.45, -(D - fd) / 2, { r: 0 }); // telescopic joint
    // controls + lamps on the rim
    for (let i = 0; i < 4; i++) k.cyl('controls', 'plastic-black', 0.008, 0.008, 0.004, W / 2 - 0.05 - i * 0.03, 0.004 + rimH / 2, D / 2, { rx: PI / 2, segs: k.seg(12, 6) });
    k.box('display', 'light-cool', 0.03, 0.01, 0.002, -W / 2 + 0.07, 0.004 + rimH / 2, D / 2 + 0.001, { r: 0 });
    for (const s of [-1, 1]) k.cyl('lamps', 'glass-frosted', 0.03, 0.03, 0.003, s * W * 0.28, 0.0, D * 0.15, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const islandHood = a$({
  id: 'apx-island-hood', placement: 'ceiling', elevation: 2.4 - 0.81, ko: '아일랜드 레인지후드', en: 'Island cooker hood',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.len('duct', '덕트 길이', 'Duct length', 0.56, 0.2, 1.4),
    P.mat('finish', '마감', 'Finish', 'metal-steel', 'metal'),
    P.bool('glass', '유리 캐노피', 'Glass canopy', true),
  ],
  tags: ['island hood', 'cooker hood', 'ceiling hood', 'extractor', '아일랜드 후드', '레인지후드', '천장형 후드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.6, m = p.finish;
    k.box('filters', 'metal-aluminium', W - 0.06, 0.004, D - 0.06, 0, 0.002, 0, { r: 0 });
    k.box('body', m, W, 0.055, D, 0, 0.004 + 0.0275, 0, { r: 0.003 });
    let y = 0.06;
    if (p.glass) {
      // flat glass canopy plate around a slim steel cone
      k.box('glass', 'glass-frosted', W + 0.04, 0.008, D + 0.04, 0, y + 0.004, 0, { r: 0.002 });
      y += 0.008;
    }
    const canH = 0.17;
    frustum(k, 'body', m, W * 0.6, D * 0.6, 0.3, 0.3, canH, 0, y, 0);
    y += canH;
    k.box('body', m, 0.3, p.duct, 0.3, 0, y + p.duct / 2, 0, { r: 0.002 });
    k.box('body', m, 0.304, 0.004, 0.304, 0, y + p.duct * 0.5, 0, { r: 0 });
    k.box('body', m, 0.36, 0.012, 0.36, 0, y + p.duct + 0.006, 0, { r: 0.002 }); // ceiling plate
    for (let i = 0; i < 4; i++) k.cyl('controls', 'plastic-black', 0.008, 0.008, 0.004, W / 2 - 0.05 - i * 0.03, 0.032, D / 2, { rx: PI / 2, segs: k.seg(12, 6) });
    k.box('display', 'light-cool', 0.03, 0.01, 0.002, -W / 2 + 0.07, 0.032, D / 2 + 0.001, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('lamps', 'glass-frosted', 0.025, 0.025, 0.003, sx * W * 0.3, 0.0, sz * D * 0.3, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const airFryer = a$({
  id: 'apx-air-fryer', ...SURF, ko: '에어프라이어', en: 'Air fryer',
  params: [
    P.len('height', '높이', 'Height', 0.33, 0.26, 0.4),
    P.mat('body', '본체', 'Body', 'plastic-black', 'plastic'),
  ],
  tags: ['air fryer', 'fryer', 'small appliance', '에어프라이어', '튀김기', '소형가전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, W = H * 0.88, D = H * 1.08, y0 = 0.01;
    feet(k, W * 0.8, D * 0.8);
    k.soft('body', p.body, W, H - y0, D, 0.05, 0, y0 + (H - y0) / 2, 0, { flat: 3 });
    // basket drawer with a tall grip
    const dh = H * 0.5, dy = y0 + 0.015 + dh / 2;
    k.rbox('drawer', p.body, W * 0.86, dh, 0.05, 0.02, 0, dy, D / 2 - 0.005);
    k.box('trim', 'metal-chrome', W * 0.86, 0.006, 0.052, 0, dy + dh / 2 - 0.003, D / 2 - 0.005, { r: 0.002 });
    k.rbox('grip', 'plastic-black', 0.045, dh * 0.7, 0.05, 0.015, 0, dy, D / 2 + 0.04);
    k.box('grip', 'plastic-black', 0.04, 0.03, 0.04, 0, dy + dh * 0.3, D / 2 + 0.02, { r: 0.008 });
    // control panel on the sloped top front
    k.box('display', 'light-cool', W * 0.4, 0.004, D * 0.18, 0, H + 0.001, D * 0.18, { r: 0.002 });
    knob(k, 'grip', 'metal-chrome', 0.018, 0.012, 0, y0 + H * 0.82, D / 2 - 0.02);
    slats(k, 'grip', 'plastic-black', 4, W * 0.5, 0, H * 0.55, H * 0.85, -D / 2 + 0.003);
    return finish(k);
  },
});

const riceCooker = a$({
  id: 'apx-rice-cooker', ...SURF, ko: '전기밥솥(압력)', en: 'Pressure rice cooker',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.28, 0.22, 0.34),
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.mat('lid', '뚜껑', 'Lid', 'metal-steel', 'metal'),
  ],
  tags: ['rice cooker', 'pressure cooker', 'cuckoo', '전기밥솥', '압력밥솥', '밥솥'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = R * 1.9;
    k.lathe('body', p.body, [[0, 0], [R * 0.85, 0], [R * 0.97, 0.02], [R, 0.06], [R, H * 0.62], [R * 0.97, H * 0.66], [0, H * 0.66]], 0, 0, 0, { segs: k.seg(40, 12) });
    k.lathe('lid', p.lid, [[0, H * 0.66], [R * 0.96, H * 0.66], [R * 0.93, H * 0.76], [R * 0.75, H * 0.92], [R * 0.4, H * 0.99], [0, H]], 0, 0, 0, { segs: k.seg(40, 12), smooth: 10 });
    // steam valve, lock handle over the lid, front panel
    k.cyl('trim', 'plastic-black', 0.018, 0.022, 0.03, 0, H * 0.94, -R * 0.15, { segs: k.seg(14, 6) });
    k.bentTube('trim', 'plastic-black', [[-R * 0.45, H * 0.82, R * 0.55], [-R * 0.3, H * 0.98, R * 0.25], [R * 0.3, H * 0.98, R * 0.25], [R * 0.45, H * 0.82, R * 0.55]], 0.012, 0.04);
    k.box('trim', 'plastic-black', R * 0.8, H * 0.2, 0.03, 0, H * 0.42, R - 0.01, { r: 0.01, rx: -0.08 });
    k.box('display', 'light-cool', R * 0.5, H * 0.07, 0.004, 0, H * 0.45, R + 0.006, { r: 0.001, rx: -0.08 });
    for (const s of [-1, 1]) k.cyl('trim', 'paint-grey-matte', 0.008, 0.008, 0.004, s * R * 0.22, H * 0.36, R + 0.004, { rx: PI / 2, segs: k.seg(10, 5) });
    k.box('trim', 'plastic-black', R * 0.4, 0.02, 0.02, 0, H * 0.7, R + 0.01, { r: 0.006 }); // lid release
    return finish(k);
  },
});

const standMixer = a$({
  id: 'apx-stand-mixer', ...SURF, ko: '스탠드 믹서', en: 'Stand mixer',
  params: [
    P.mat('body', '본체', 'Body', 'paint-blue-matte', KFIN),
    P.mat('bowl', '볼', 'Bowl', 'metal-steel', 'metal'),
    P.num('tilt', '헤드 들어올림', 'Head tilt', 0, 0, 1, 0.05),
  ],
  tags: ['stand mixer', 'kitchen mixer', 'baking', '스탠드 믹서', '반죽기', '제빵'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const m = p.body;
    k.rbox('body', m, 0.22, 0.05, 0.34, 0.022, 0, 0.025, 0.02, { segs: k.seg(3, 1) });
    k.rbox('body', m, 0.14, 0.27, 0.12, 0.045, 0, 0.18, -0.1, { segs: k.seg(3, 1) });
    k.cyl('trim', 'metal-chrome', 0.075, 0.075, 0.012, 0, 0.05, 0.05, { segs: k.seg(28, 10) });
    k.lathe('bowl', p.bowl, [[0, 0.012], [0.05, 0.0], [0.09, 0.04], [0.11, 0.12], [0.116, 0.155], [0.112, 0.158], [0.104, 0.124], [0.085, 0.046], [0.045, 0.01], [0, 0.02]], 0, 0.062, 0.05, { segs: k.seg(36, 12) });
    k.tube('bowl', p.bowl, [[0.11, 0.18, 0.05], [0.16, 0.17, 0.05], [0.16, 0.11, 0.05], [0.108, 0.1, 0.05]], 0.006, { radial: 5 });
    // head pivots at the column top
    const pivotY = 0.3, pivotZ = -0.1;
    withM(k, () => {
      k.rbox('body', m, 0.15, 0.13, 0.38, 0.06, 0, 0.36, 0.02, { segs: k.seg(4, 1) });
      k.cyl('trim', 'metal-chrome', 0.036, 0.04, 0.012, 0, 0.36, 0.205, { rx: PI / 2, segs: k.seg(20, 8) });
      k.box('trim', 'metal-chrome', 0.152, 0.012, 0.3, 0, 0.36, 0.02, { r: 0.004 });
      k.rod('beater', 'metal-aluminium', [0, 0.295, 0.05], [0, 0.17, 0.05], 0.006, { segs: 6 });
      k.tube('beater', 'metal-aluminium', [[-0.04, 0.17, 0.05], [-0.05, 0.11, 0.05], [0, 0.08, 0.05], [0.05, 0.11, 0.05], [0.04, 0.17, 0.05]], 0.005, { radial: 5, closed: false });
    }, tiltX(-0.6 * p.tilt, pivotY, pivotZ));
    k.box('trim', 'metal-chrome', 0.012, 0.03, 0.04, 0.075, 0.26, -0.1, { r: 0.004 }); // speed lever
    return finish(k);
  },
});

const espresso = a$({
  id: 'apx-espresso-machine', ...SURF, ko: '에스프레소 머신', en: 'Espresso machine',
  params: [
    P.len('width', '폭', 'Width', 0.36, 0.3, 0.5),
    P.mat('finish', '마감', 'Finish', 'metal-steel', 'metal'),
    P.bool('cups', '컵', 'Cups on top', true),
  ],
  tags: ['espresso machine', 'coffee machine', 'barista', '에스프레소 머신', '커피 머신', '커피메이커', '바리스타'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.42, H = 0.4, m = p.finish, zf = D / 2;
    k.box('body', m, W, 0.06, D, 0, 0.03, 0, { r: 0.006 });
    k.box('body', m, W, H - 0.24, D, 0, 0.24 + (H - 0.24) / 2, 0, { r: 0.006 });
    k.box('body', m, W, 0.2, 0.2, 0, 0.14, -D / 2 + 0.1, { r: 0.006 });
    // drip tray + grid, group head with portafilter, steam wand, gauge, knobs
    k.box('trim', 'metal-chrome', W * 0.7, 0.02, 0.16, 0, 0.07, zf - 0.08, { r: 0.003 });
    for (let i = 0; i < 6; i++) k.box('black', 'plastic-black', W * 0.66, 0.002, 0.006, 0, 0.081, zf - 0.15 + i * 0.026, { r: 0 });
    k.cyl('trim', 'metal-chrome', 0.04, 0.04, 0.035, 0, 0.205, zf - 0.09, { segs: k.seg(20, 8) });
    k.cyl('trim', 'metal-chrome', 0.034, 0.03, 0.025, 0, 0.18, zf - 0.09, { segs: k.seg(20, 8) });
    k.rod('black', 'plastic-black', [0, 0.19, zf - 0.06], [0, 0.175, zf + 0.09], 0.011, { segs: k.seg(10, 5) });
    k.rod('trim', 'metal-chrome', [W / 2 - 0.05, 0.235, zf - 0.04], [W / 2 - 0.04, 0.11, zf + 0.025], 0.0045, { segs: 6 });
    k.cyl('trim', 'metal-chrome', 0.032, 0.032, 0.012, 0, 0.32, zf, { rx: PI / 2, segs: k.seg(24, 8) });
    k.cyl('face', 'paint-white-gloss', 0.026, 0.026, 0.002, 0, 0.32, zf + 0.012, { rx: PI / 2, segs: k.seg(20, 8) });
    for (const s of [-1, 1]) knob(k, 'black', 'plastic-black', 0.016, 0.02, s * (W / 2 - 0.05), 0.32, zf);
    k.box('display', 'light-cool', 0.006, 0.006, 0.002, -W / 2 + 0.03, 0.37, zf + 0.001, { r: 0 });
    // cup warmer rail on the top
    k.bentTube('trim', 'metal-chrome', [[-W / 2 + 0.02, H, -D / 2 + 0.03], [-W / 2 + 0.02, H + 0.03, -D / 2 + 0.03], [W / 2 - 0.02, H + 0.03, -D / 2 + 0.03], [W / 2 - 0.02, H, -D / 2 + 0.03]], 0.004, 0.015);
    if (p.cups) for (const s of [-1, 1]) k.lathe('cups', 'ceramic-white', [[0, 0], [0.022, 0], [0.03, 0.01], [0.032, 0.06], [0.029, 0.06], [0.027, 0.012], [0, 0.012]], s * 0.06, H, 0, { segs: k.seg(20, 8) });
    return finish(k);
  },
});

const toaster = a$({
  id: 'apx-toaster', ...SURF, ko: '토스터', en: 'Pop-up toaster',
  params: [
    P.int('slots', '슬롯 수', 'Slots', 2, 1, 4),
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.mat('trim', '장식', 'Trim', 'metal-chrome', 'metal'),
  ],
  tags: ['toaster', 'pop-up toaster', 'bread toaster', '토스터', '토스트기', '빵 굽기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.29, D = 0.06 + 0.06 * p.slots, H = 0.19, y0 = 0.012;
    k.box('trim', p.trim, W - 0.02, y0, D - 0.02, 0, y0 / 2, 0, { r: 0.003 });
    k.rbox('body', p.body, W, H - y0, D, 0.03, 0, y0 + (H - y0) / 2, 0, { segs: k.seg(4, 1) });
    for (let i = 0; i < p.slots; i++) {
      const z = -D / 2 + 0.06 * (i + 1);
      k.box('slots', 'plastic-black', W * 0.7, 0.003, 0.032, 0, H + 0.0005, z, { r: 0.001 });
      k.box('trim', p.trim, W * 0.74, 0.003, 0.04, 0, H - 0.0005, z, { r: 0.001 });
    }
    // lever + browning knob + buttons on the front
    k.box('slots', 'plastic-black', 0.012, 0.09, 0.006, W / 2 - 0.05, y0 + H * 0.5, D / 2 + 0.001, { r: 0.002 });
    k.box('trim', p.trim, 0.035, 0.018, 0.03, W / 2 - 0.05, y0 + H * 0.68, D / 2 + 0.014, { r: 0.006 });
    knob(k, 'trim', p.trim, 0.016, 0.014, -W / 2 + 0.055, y0 + H * 0.45, D / 2);
    for (let i = 0; i < 3; i++) k.box('slots', 'plastic-black', 0.018, 0.008, 0.004, -W / 2 + 0.12 + i * 0.025, y0 + H * 0.3, D / 2 + 0.001, { r: 0.002 });
    k.box('display', 'light-warm', 0.005, 0.005, 0.002, -W / 2 + 0.12, y0 + H * 0.42, D / 2 + 0.001, { r: 0 });
    return finish(k);
  },
});

const blender = a$({
  id: 'apx-blender', ...SURF, ko: '블렌더(믹서기)', en: 'Countertop blender',
  params: [
    P.len('jug', '용기 높이', 'Jug height', 0.27, 0.2, 0.34),
    P.mat('base', '받침', 'Base', 'metal-steel', 'metal'),
    P.mat('jugMat', '용기', 'Jug', 'glass-clear', 'glass'),
  ],
  tags: ['blender', 'mixer', 'smoothie', '블렌더', '믹서기', '믹서', '스무디'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const J = p.jug;
    k.lathe('base', p.base, [[0, 0], [0.085, 0], [0.09, 0.01], [0.085, 0.11], [0.07, 0.13], [0, 0.13]], 0, 0, 0, { segs: 4, rx: 0, ry: PI / 4 });
    knob(k, 'black', 'plastic-black', 0.022, 0.018, 0, 0.065, 0.06);
    for (const s of [-1, 1]) k.box('black', 'plastic-black', 0.02, 0.012, 0.01, s * 0.04, 0.035, 0.064, { r: 0.003, rx: -0.12 });
    k.box('display', 'light-cool', 0.006, 0.006, 0.002, 0, 0.1, 0.055, { r: 0 });
    k.cyl('black', 'plastic-black', 0.06, 0.065, 0.03, 0, 0.13, 0, { segs: k.seg(24, 8) });
    // jug: tapered glass, blades, lid with filler cap, handle
    k.lathe('jug', p.jugMat, [[0.055, 0], [0.065, 0.02], [0.085, J * 0.85], [0.09, J]], 0, 0.16, 0, { segs: k.seg(32, 10) });
    k.cyl('jug', p.jugMat, 0.055, 0.055, 0.004, 0, 0.16, 0, { segs: k.seg(24, 8) });
    for (let i = 0; i < 4; i++) k.box('blade', 'metal-steel', 0.07, 0.002, 0.012, 0, 0.19 + (i % 2) * 0.006, 0, { r: 0, ry: (i * PI) / 4, rz: (i % 2 ? 0.2 : -0.2) });
    k.cyl('blade', 'metal-steel', 0.008, 0.008, 0.03, 0, 0.165, 0, { segs: 8 });
    k.cyl('black', 'plastic-black', 0.093, 0.093, 0.025, 0, 0.16 + J - 0.005, 0, { segs: k.seg(32, 10) });
    k.cyl('black', 'plastic-black', 0.025, 0.025, 0.02, 0, 0.16 + J + 0.02, 0, { segs: k.seg(16, 6) });
    k.bentTube('black', 'plastic-black', [[0.08, 0.16 + J * 0.85, 0], [0.14, 0.16 + J * 0.8, 0], [0.13, 0.2, 0], [0.065, 0.19, 0]], 0.013, 0.04);
    return finish(k);
  },
});

const kettle = a$({
  id: 'apx-electric-kettle', ...SURF, ko: '전기 주전자(무선)', en: 'Cordless electric kettle',
  params: [
    P.len('diameter', '지름', 'Diameter', 0.16, 0.12, 0.2),
    P.mat('body', '본체', 'Body', 'metal-steel', 'metal'),
    P.mat('handle', '손잡이', 'Handle', 'plastic-black', 'plastic'),
  ],
  tags: ['kettle', 'electric kettle', 'cordless kettle', '전기 주전자', '전기포트', '포트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, H = 0.24, y0 = 0.025, h = p.handle;
    k.lathe('base', h, [[0, 0], [R + 0.01, 0], [R + 0.012, 0.01], [R + 0.004, y0], [0, y0]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.lathe('body', p.body, [[0, y0], [R, y0], [R, y0 + 0.01], [R * 0.96, y0 + H * 0.6], [R * 0.8, y0 + H * 0.92], [R * 0.78, y0 + H], [0, y0 + H]], 0, 0, 0, { segs: k.seg(36, 12), smooth: 10 });
    k.lathe('base', h, [[0, y0 + H - 0.005], [R * 0.79, y0 + H - 0.005], [R * 0.76, y0 + H + 0.012], [0, y0 + H + 0.015]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.box('base', h, 0.04, 0.012, 0.02, 0, y0 + H + 0.018, -R * 0.4, { r: 0.004 });
    // handle at the back with a power switch, spout at the front, water window on the side
    k.bentTube('base', h, [[0, y0 + 0.04, -R * 0.95], [0, y0 + 0.05, -R - 0.06], [0, y0 + H - 0.01, -R * 0.78 - 0.06], [0, y0 + H, -R * 0.72]], 0.013, 0.04);
    k.box('display', 'light-cool', 0.012, 0.006, 0.012, 0, y0 + 0.055, -R - 0.065, { r: 0.002 });
    k.rod('body', p.body, [0, y0 + H * 0.78, R * 0.8], [0, y0 + H * 0.92, R + 0.035], 0.02, { r2: 0.01, segs: k.seg(14, 6) });
    k.box('window', 'glass-tinted', 0.012, H * 0.5, 0.025, R * 0.97, y0 + H * 0.4, 0, { r: 0.004 });
    return finish(k);
  },
});

const breadMaker = a$({
  id: 'apx-bread-maker', ...SURF, ko: '제빵기', en: 'Bread maker',
  params: [
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.mat('lid', '뚜껑', 'Lid', 'metal-steel', 'metal'),
    P.bool('window', '창', 'Viewing window', true),
  ],
  tags: ['bread maker', 'bread machine', 'baking', '제빵기', '홈베이커리', '빵 기계'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.26, D = 0.36, H = 0.3;
    feet(k, W * 0.8, D * 0.8);
    k.soft('body', p.body, W, H - 0.01, D, 0.04, 0, 0.01 + (H - 0.01) / 2, 0, { flat: 3 });
    // lid over the back two thirds with a window, sloped control panel at the front
    k.rbox('lid', p.lid, W - 0.02, 0.025, D * 0.62, 0.012, 0, H + 0.006, -D * 0.17);
    if (p.window) k.box('window', 'glass-tinted', W * 0.5, 0.004, D * 0.3, 0, H + 0.019, -D * 0.17, { r: 0.002 });
    k.box('lid', p.lid, W * 0.3, 0.012, 0.02, 0, H + 0.022, D * 0.12, { r: 0.004 });
    k.box('panel', 'plastic-black', W * 0.8, 0.012, D * 0.26, 0, H - 0.01, D * 0.34, { r: 0.004, rx: 0.25 });
    k.box('display', 'light-cool', W * 0.3, 0.003, 0.03, 0, H - 0.001, D * 0.33, { r: 0, rx: 0.25 });
    for (let i = 0; i < 4; i++) k.cyl('lid', p.lid, 0.007, 0.007, 0.004, -W * 0.27 + i * W * 0.18, H - 0.006, D * 0.39, { segs: k.seg(10, 5), rx: 0.25 });
    slats(k, 'panel', 'plastic-black', 6, 0.004, W / 2, H * 0.4, H * 0.75, 0, { t: 0.004, d: D * 0.4 });
    return finish(k);
  },
});

const juicer = a$({
  id: 'apx-slow-juicer', ...SURF, ko: '원액기(착즙기)', en: 'Slow juicer',
  params: [
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.mat('drum', '드럼', 'Drum', 'glass-tinted', 'glass'),
    P.bool('cups', '컵', 'Cups', true),
  ],
  tags: ['slow juicer', 'juicer', 'masticating juicer', '원액기', '착즙기', '주서기', '녹즙기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // motor base with a foot plate reaching forward under the spouts
    k.rbox('body', p.body, 0.18, 0.22, 0.2, 0.04, 0, 0.11, -0.04, { segs: k.seg(4, 1) });
    k.rbox('body', p.body, 0.24, 0.02, 0.36, 0.01, 0, 0.01, 0.04, { segs: k.seg(2, 1) });
    knob(k, 'black', 'plastic-black', 0.018, 0.012, 0, 0.12, 0.06);
    // juicing drum with auger, hopper and pusher
    k.cyl('drum', p.drum, 0.075, 0.07, 0.14, 0, 0.22, -0.04, { segs: k.seg(32, 10) });
    k.cyl('auger', 'plastic-white', 0.045, 0.05, 0.13, 0, 0.225, -0.04, { segs: k.seg(16, 6) });
    k.lathe('drum', p.drum, [[0.074, 0], [0.074, 0.02], [0.05, 0.05], [0.045, 0.12], [0.043, 0.12], [0.043, 0.05]], 0, 0.36, -0.04, { segs: k.seg(32, 10) });
    k.cyl('black', 'plastic-black', 0.04, 0.04, 0.1, 0, 0.44, -0.04, { segs: k.seg(16, 6) });
    // juice + pulp spouts and two cups below
    k.rod('black', 'plastic-black', [-0.03, 0.25, 0.02], [-0.03, 0.24, 0.1], 0.012, { segs: k.seg(10, 5) });
    k.rod('black', 'plastic-black', [0.04, 0.235, 0.02], [0.05, 0.22, 0.09], 0.016, { segs: k.seg(10, 5) });
    if (p.cups) for (const [x, z] of [[-0.06, 0.13], [0.06, 0.12]]) k.lathe('cups', 'glass-clear', [[0, 0], [0.04, 0], [0.045, 0.14], [0.042, 0.14], [0.037, 0.004], [0, 0.004]], x, 0.02, z, { segs: k.seg(24, 8) });
    return finish(k);
  },
});

const ctDishwasher = a$({
  id: 'apx-countertop-dishwasher', ...SURF, ko: '식기세척기(카운터탑)', en: 'Countertop dishwasher',
  params: [
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.bool('window', '창', 'Door window', true),
  ],
  tags: ['dishwasher', 'countertop dishwasher', 'compact dishwasher', '식기세척기', '식세기', '미니 식세기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.55, H = 0.44, D = 0.5, y0 = 0.02;
    feet(k, W * 0.85, D * 0.8, { h: y0 });
    k.box('body', p.body, W, H - y0, D - 0.03, 0, y0 + (H - y0) / 2, -0.015, { r: 0.008 });
    // door (with optional window), handle recess, control strip on the top
    const dh = H - y0 - 0.07;
    k.box('door', p.body, W - 0.01, dh, 0.03, 0, y0 + dh / 2 + 0.005, D / 2 - 0.015, { r: 0.006 });
    if (p.window) {
      k.box('window', 'glass-tinted', W * 0.6, dh * 0.45, 0.004, 0, y0 + dh * 0.55, D / 2 + 0.001, { r: 0.003 });
      for (let i = 0; i < 4; i++) k.box('rack', 'metal-chrome', W * 0.55, 0.003, 0.003, 0, y0 + dh * 0.4 + i * dh * 0.08, D / 2 - 0.03, { r: 0 });
    }
    k.box('rack', 'metal-chrome', W * 0.4, 0.016, 0.02, 0, y0 + dh - 0.02, D / 2 + 0.01, { r: 0.005 });
    k.box('panel', 'plastic-black', W - 0.02, 0.05, 0.01, 0, H - 0.03, D / 2 - 0.005, { r: 0.003 });
    k.box('display', 'light-cool', 0.06, 0.02, 0.002, -W / 4, H - 0.03, D / 2 + 0.001, { r: 0 });
    for (let i = 0; i < 5; i++) k.cyl('rack', 'metal-chrome', 0.006, 0.006, 0.003, 0.02 + i * 0.04, H - 0.03, D / 2, { rx: PI / 2, segs: k.seg(10, 5) });
    return finish(k);
  },
});

const iceMaker = a$({
  id: 'apx-ice-maker', ...SURF, ko: '제빙기(가정용)', en: 'Countertop ice maker',
  params: [
    P.mat('body', '본체', 'Body', 'metal-steel', 'metal'),
    P.num('lid', '뚜껑 열림', 'Lid open', 0, 0, 1, 0.05),
  ],
  tags: ['ice maker', 'ice machine', 'nugget ice', '제빙기', '얼음 제조기', '아이스메이커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.25, D = 0.36, H = 0.34;
    feet(k, W * 0.85, D * 0.85);
    k.box('body', p.body, W, H - 0.01, D, 0, 0.01 + (H - 0.01) / 2, 0, { r: 0.012 });
    k.box('trim', 'plastic-black', W - 0.02, 0.01, D * 0.55, 0, H + 0.005, D * 0.15, { r: 0.004 });
    // hinged lid with a window over the ice basket (hinge at its back edge)
    const hz = D * 0.15 - D * 0.275, hy = H + 0.01;
    withM(k, () => {
      k.box('trim', 'plastic-black', W - 0.02, 0.012, D * 0.55, 0, hy + 0.006, D * 0.15, { r: 0.004 });
      k.box('window', 'glass-tinted', W * 0.6, 0.003, D * 0.3, 0, hy + 0.013, D * 0.17, { r: 0.001 });
    }, tiltX(-1.2 * p.lid, hy, hz));
    k.box('trim', 'plastic-black', W - 0.02, 0.01, D * 0.4, 0, H + 0.005, -D * 0.27, { r: 0.004 });
    k.box('display', 'light-cool', 0.05, 0.003, 0.03, 0, H + 0.011, -D * 0.27, { r: 0 });
    slats(k, 'trim', 'plastic-black', 6, 0.004, -W / 2, H * 0.2, H * 0.6, 0, { t: 0.006, d: D * 0.5 });
    // a few ice cubes in the basket (seen through the window)
    for (let i = 0; i < 6; i++) k.box('ice', 'glass-frosted', 0.025, 0.02, 0.025, -0.06 + (i % 3) * 0.06, H - 0.03, D * 0.08 + Math.floor(i / 3) * 0.06, { r: 0.004, ry: i * 0.5 });
    return finish(k);
  },
});

const warmingDrawer = a$({
  id: 'apx-warming-drawer', ko: '워밍 드로어(빌트인)', en: 'Built-in warming drawer',
  params: [
    P.len('height', '높이', 'Height', 0.14, 0.14, 0.29),
    P.num('open', '열림', 'Open', 0, 0, 1, 0.05),
    P.mat('handle', '손잡이', 'Handle', 'metal-steel', 'metal'),
  ],
  tags: ['warming drawer', 'built-in', 'plate warmer', '워밍 드로어', '식기 워머', '빌트인 가전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.595, D = 0.55, H = p.height, o = p.open * 0.36;
    k.box('body', 'metal-steel', W - 0.04, H - 0.01, D - 0.02, 0, H / 2, -0.01, { r: 0.002 });
    // drawer box slides out with the front
    k.box('front', 'screen-black', W, H, 0.02, 0, H / 2, D / 2 - 0.01 + o, { r: 0.003 });
    k.box('trim', p.handle, W, 0.012, 0.022, 0, H - 0.006, D / 2 - 0.01 + o, { r: 0.002 });
    k.rod('trim', p.handle, [-W * 0.35, H * 0.62, D / 2 + 0.04 + o], [W * 0.35, H * 0.62, D / 2 + 0.04 + o], 0.008, { segs: k.seg(12, 5) });
    for (const s of [-1, 1]) k.rod('trim', p.handle, [s * W * 0.3, H * 0.62, D / 2 + o], [s * W * 0.3, H * 0.62, D / 2 + 0.04 + o], 0.006, { segs: 6 });
    if (o > 0.01) {
      k.box('tray', 'metal-aluminium', W - 0.08, H * 0.6, o, 0, H * 0.35, D / 2 - 0.02 + o / 2 - 0.01, { r: 0.002 });
      k.box('tray', 'rubber-black', W - 0.1, 0.004, o - 0.02, 0, H * 0.66, D / 2 - 0.02 + o / 2 - 0.01, { r: 0 });
    }
    k.box('display', 'light-warm', 0.008, 0.008, 0.002, W / 2 - 0.03, H * 0.25, D / 2 + 0.001 + o, { r: 0 });
    return finish(k);
  },
});

const dripCoffee = a$({
  id: 'apx-drip-coffee-maker', ...SURF, ko: '드립 커피메이커', en: 'Drip coffee maker',
  params: [
    P.mat('body', '본체', 'Body', 'plastic-black', 'plastic'),
    P.mat('trim', '장식', 'Trim', 'metal-steel', 'metal'),
    P.len('height', '높이', 'Height', 0.36, 0.3, 0.42),
  ],
  tags: ['coffee maker', 'drip coffee', 'filter coffee', '커피메이커', '드립 커피', '커피 머신'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.22, D = 0.26, H = p.height;
    // base with hot plate, water tower behind, head over the carafe
    k.rbox('body', p.body, W, 0.05, D, 0.012, 0, 0.025, 0);
    k.cyl('trim', p.trim, 0.065, 0.065, 0.004, 0, 0.05, 0.04, { segs: k.seg(28, 10) });
    k.box('display', 'light-cool', 0.05, 0.015, 0.002, 0, 0.025, D / 2 + 0.001, { r: 0 });
    k.rbox('body', p.body, W, H - 0.05, 0.1, 0.015, 0, 0.05 + (H - 0.05) / 2, -D / 2 + 0.05);
    k.box('window', 'glass-tinted', 0.012, (H - 0.05) * 0.6, 0.05, W / 2, 0.05 + (H - 0.05) * 0.5, -D / 2 + 0.05, { r: 0.004 });
    k.rbox('body', p.body, W, 0.08, D - 0.02, 0.015, 0, H - 0.04, -0.01);
    k.box('trim', p.trim, W + 0.002, 0.012, D - 0.02, 0, H - 0.01, -0.01, { r: 0.004 });
    // carafe: glass jug, steel band and lid, handle
    const cy = 0.055;
    k.lathe('carafe', 'glass-clear', [[0, 0], [0.06, 0], [0.068, 0.04], [0.06, 0.1], [0.05, 0.13], [0.05, 0.14]], 0, cy, 0.04, { segs: k.seg(28, 10) });
    k.cyl('trim', p.trim, 0.052, 0.052, 0.025, 0, cy + 0.13, 0.04, { segs: k.seg(24, 8) });
    k.bentTube('body', p.body, [[0, cy + 0.13, 0.09], [0, cy + 0.14, 0.13], [0, cy + 0.04, 0.13], [0, cy + 0.03, 0.105]], 0.009, 0.025);
    k.lathe('coffee', 'wood-dark', [[0, 0], [0.06, 0], [0.066, 0.035], [0, 0.035]], 0, cy + 0.003, 0.04, { segs: k.seg(28, 10) });
    return finish(k);
  },
});

/* ================================================================ laundry */

const garmentSteamer = a$({
  id: 'apx-garment-steamer', ko: '스탠드 스팀다리미(스티머)', en: 'Garment steamer',
  params: [
    P.len('height', '높이', 'Height', 1.6, 1.3, 1.8),
    P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'),
    P.mat('pole', '기둥', 'Pole', 'metal-chrome', 'metal'),
  ],
  tags: ['garment steamer', 'clothes steamer', 'standing steamer', '스티머', '스팀다리미', '의류 스티머'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height;
    // base with water tank and four castors
    k.rbox('body', p.body, 0.3, 0.2, 0.28, 0.05, 0, 0.13, 0, { segs: k.seg(4, 1) });
    k.box('tank', 'glass-tinted', 0.2, 0.12, 0.02, 0, 0.13, 0.135, { r: 0.008 });
    k.box('display', 'light-cool', 0.03, 0.012, 0.002, 0.1, 0.21, 0.141, { r: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('castors', 'plastic-black', 0.016, 0.016, 0.022, sx * 0.11, 0.016, sz * 0.1, { rz: PI / 2, segs: k.seg(12, 6) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('castors', 'plastic-black', 0.02, 0.02, 0.02, sx * 0.11, 0.035, sz * 0.1, { r: 0.004 });
    // telescopic pole with a clamp, hanger at the top
    k.cyl('pole', p.pole, 0.012, 0.012, H * 0.5, 0, 0.23, -0.06, { segs: k.seg(12, 6) });
    k.cyl('pole', p.pole, 0.009, 0.009, H - 0.23 - H * 0.5 + 0.02 - 0.02, 0, 0.23 + H * 0.5 - 0.02, -0.06, { segs: k.seg(12, 6) });
    k.cyl('body', p.body, 0.018, 0.018, 0.03, 0, 0.23 + H * 0.5 - 0.02, -0.06, { segs: k.seg(12, 6) });
    k.bentTube('body', p.body, [[-0.21, H - 0.1, -0.06], [0, H - 0.02, -0.06], [0.21, H - 0.1, -0.06], [-0.21, H - 0.1, -0.06]], 0.008, 0.03);
    // steam head parked in its holder; hose from the base
    const hy = H * 0.6;
    k.box('body', p.body, 0.05, 0.05, 0.04, 0, hy, -0.03, { r: 0.008 });
    k.rbox('head', p.body, 0.11, 0.17, 0.06, 0.025, 0, hy + 0.08, 0.0);
    k.box('head', 'metal-aluminium', 0.09, 0.12, 0.004, 0, hy + 0.09, 0.031, { r: 0.002 });
    k.tube('hose', 'plastic-grey', [[0.06, 0.22, 0.04], [0.14, 0.4, 0.1], [0.12, hy - 0.2, 0.08], [0.02, hy - 0.02, 0.0]], 0.012, { radial: k.seg(8, 4) });
    return finish(k);
  },
});

const twinWasher = a$({
  id: 'apx-twin-washer', ko: '트윈워시(드럼+미니 세탁기)', en: 'Twin washer (with pedestal mini washer)',
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.6, 0.7),
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.mat('door', '도어 링', 'Door ring', 'metal-chrome', 'metal'),
  ],
  tags: ['washing machine', 'twin wash', 'mini washer', 'pedestal washer', '세탁기', '트윈워시', '미니워시', '드럼세탁기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.68, pedH = 0.36, H = 0.86, zf = D / 2;
    // pedestal mini washer: pull-out drawer with a top control strip
    k.box('body', p.body, W, pedH, D - 0.02, 0, pedH / 2, -0.01, { r: 0.006 });
    k.box('front', p.body, W - 0.02, pedH - 0.05, 0.02, 0, (pedH - 0.05) / 2 + 0.015, zf - 0.01, { r: 0.006 });
    k.box('dark', 'plastic-black', W * 0.5, 0.02, 0.012, 0, pedH - 0.08, zf + 0.004, { r: 0.004 });
    k.box('display', 'light-cool', 0.06, 0.012, 0.002, W * 0.3, pedH - 0.022, zf - 0.01, { r: 0 });
    // main front-load washer above
    const y0 = pedH + 0.004;
    k.box('body', p.body, W, H, D - 0.02, 0, y0 + H / 2, -0.01, { r: 0.008 });
    k.box('dark', 'plastic-black', W - 0.02, 0.1, 0.01, 0, y0 + H - 0.07, zf - 0.015, { r: 0.004 });
    k.box('display', 'light-cool', 0.1, 0.035, 0.002, 0.04, y0 + H - 0.07, zf - 0.009, { r: 0 });
    knob(k, 'ring', p.door, 0.03, 0.02, W / 2 - 0.09, y0 + H - 0.07, zf - 0.01);
    k.box('front', p.body, 0.18, 0.06, 0.02, -W / 2 + 0.12, y0 + H - 0.07, zf - 0.012, { r: 0.004 }); // detergent drawer
    const dy = y0 + H * 0.45, R = W * 0.3;
    ring(k, 'ring', p.door, R, 0.025, 0, dy, zf + 0.02, { seg: 48 });
    k.cyl('glass', 'glass-tinted', R * 0.85, R * 0.9, 0.04, 0, dy, zf - 0.01, { rx: PI / 2, segs: k.seg(36, 12) });
    k.cyl('dark', 'plastic-grey', R * 1.12, R * 1.12, 0.006, 0, dy, zf - 0.012, { rx: PI / 2, segs: k.seg(40, 12) });
    k.box('ring', p.door, 0.03, 0.12, 0.03, R + 0.01, dy, zf + 0.025, { r: 0.008 });
    for (const sx of [-1, 1]) k.cyl('dark', 'rubber-black', 0.02, 0.02, 0.01, sx * (W / 2 - 0.05), -0.002 + 0.002, zf - 0.08, { segs: 8 });
    return finish(k);
  },
});

/** Iron soleplate outline (point at +z), w wide, l long. */
function ironShape(w, l) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -l / 2);
  s.lineTo(w / 2, -l / 2);
  s.bezierCurveTo(w / 2, 0, w * 0.35, l * 0.35, 0, l / 2);
  s.bezierCurveTo(-w * 0.35, l * 0.35, -w / 2, 0, -w / 2, -l / 2);
  return s;
}

const ironStation = a$({
  id: 'apx-steam-iron-station', ...SURF, ko: '스팀 다리미(스테이션형)', en: 'Steam generator iron',
  params: [
    P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'),
    P.mat('accent', '포인트', 'Accent', 'paint-blue-matte', KFIN),
  ],
  tags: ['steam iron', 'steam generator', 'iron', '스팀 다리미', '다리미', '스팀 제너레이터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // station: tank base with window and a heat-proof iron rest on top
    k.rbox('body', p.body, 0.24, 0.1, 0.4, 0.03, 0, 0.05, 0, { segs: k.seg(4, 1) });
    k.box('tank', 'glass-tinted', 0.012, 0.05, 0.22, 0.12, 0.05, 0.02, { r: 0.004 });
    k.box('display', 'light-cool', 0.03, 0.002, 0.02, 0, 0.101, -0.15, { r: 0 });
    k.slab('rest', 'rubber-black', ironShape(0.15, 0.3), 0.008, 0.1, { z: 0.03 });
    // iron: steel soleplate, shell, handle, cable hose to the back
    k.slab('sole', 'metal-steel', ironShape(0.12, 0.26), 0.012, 0.108, { z: 0.03 });
    k.slab('shell', p.accent, ironShape(0.11, 0.24), 0.045, 0.12, { z: 0.025 });
    k.rbox('shell', p.body, 0.035, 0.03, 0.17, 0.012, 0, 0.215, 0.0);
    k.box('shell', p.body, 0.03, 0.06, 0.03, 0, 0.18, -0.07, { r: 0.008 });
    k.box('shell', p.body, 0.03, 0.05, 0.03, 0, 0.185, 0.08, { r: 0.008, rx: 0.4 });
    k.tube('hose', 'plastic-grey', [[0, 0.2, -0.08], [0, 0.24, -0.16], [0.05, 0.16, -0.22], [0.08, 0.08, -0.19]], 0.008, { radial: k.seg(8, 4) });
    return finish(k);
  },
});

/* ================================================================ climate */

const deskFan = a$({
  id: 'apx-desk-fan', ...SURF, ko: '탁상 선풍기', en: 'Desk fan',
  params: [
    P.len('diameter', '날개 지름', 'Blade diameter', 0.3, 0.2, 0.4),
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.mat('guardMat', '안전망', 'Guard', 'metal-chrome', 'metal'),
  ],
  tags: ['desk fan', 'table fan', 'electric fan', '탁상 선풍기', '선풍기', '미니 선풍기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, cy = R + 0.12;
    k.lathe('body', p.body, [[0, 0], [0.1, 0], [0.105, 0.01], [0.09, 0.035], [0, 0.04]], 0, 0, -0.02, { segs: k.seg(32, 10) });
    for (let i = 0; i < 3; i++) k.box('keys', 'plastic-grey', 0.02, 0.008, 0.015, -0.025 + i * 0.025, 0.035, 0.05, { r: 0.003, rx: -0.4 });
    k.cyl('body', p.body, 0.016, 0.02, cy - 0.04, 0, 0.035, -0.04, { segs: k.seg(14, 6) });
    k.sphere('body', p.body, 0.06, 0, cy, -0.08, { segs: k.seg(20, 8), rings: k.seg(12, 6), scale: [1, 1, 1.15] });
    k.cyl('body', p.body, 0.008, 0.008, 0.04, 0, cy + 0.05, -0.1, { segs: 6 });
    blades(k, 'blades', 'plastic-white', 3, R * 0.9, 0, cy, 0.0);
    guard(k, 'guard', p.guardMat, R, 0, cy, 0.03, 0.07);
    return finish(k);
  },
});

const panelRadiator = a$({
  id: 'apx-panel-radiator', placement: 'wall', elevation: 0.15, ko: '패널 라디에이터', en: 'Panel radiator',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.4, 2.0),
    P.len('height', '높이', 'Height', 0.6, 0.3, 0.9),
    P.pick('type', '형식', 'Type', '22', [['11', '1열(11형)', 'Single (type 11)'], ['22', '2열(22형)', 'Double (type 22)'], ['33', '3열(33형)', 'Triple (type 33)']]),
    P.mat('finish', '색', 'Finish', 'paint-white-gloss', KFIN),
  ],
  tags: ['radiator', 'panel radiator', 'heating', '라디에이터', '방열기', '난방기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, n = Number(p.type[0]), pitch = 0.04, m = p.finish;
    const nr = Math.max(4, Math.round(W / 0.033));
    for (let j = 0; j < n; j++) {
      const z = (j - (n - 1) / 2) * pitch;
      k.box('panels', m, W, H, 0.01, 0, H / 2 + 0.02, z, { r: 0.003 });
      if (j === n - 1) for (let i = 0; i < nr; i++) k.box('panels', m, 0.016, H - 0.06, 0.006, -W / 2 + (W * (i + 0.5)) / nr, H / 2 + 0.02, z + 0.006, { r: 0.002 });
    }
    // top grille and side covers (types 22/33), valve + lockshield below, wall brackets
    const T0 = n * pitch;
    if (n > 1) {
      k.box('panels', m, W, 0.006, T0, 0, H + 0.023, 0, { r: 0.002 });
      for (let i = 0; i < nr * 2; i++) k.box('grille', 'paint-grey-matte', 0.003, 0.0015, T0 - 0.01, -W / 2 + (W * (i + 0.5)) / (nr * 2), H + 0.0265, 0, { r: 0 });
      for (const s of [-1, 1]) k.box('panels', m, 0.006, H, T0, s * (W / 2 + 0.003), H / 2 + 0.02, 0, { r: 0.002 });
    }
    k.cyl('valve', 'metal-chrome', 0.012, 0.012, 0.06, -W / 2 + 0.05, -0.04, 0, { segs: k.seg(12, 6) });
    k.cyl('valve', 'paint-white-gloss', 0.022, 0.022, 0.05, -W / 2 + 0.05, -0.09, 0, { segs: k.seg(16, 6) });
    k.cyl('valve', 'metal-chrome', 0.012, 0.012, 0.06, W / 2 - 0.05, -0.04, 0, { segs: k.seg(12, 6) });
    for (const s of [-1, 1]) k.box('brackets', 'metal-steel', 0.03, 0.05, 0.04, s * W * 0.3, H * 0.75, -T0 / 2 - 0.02, { r: 0.002 });
    return finish(k);
  },
});

const heatPump = a$({
  id: 'apx-heat-pump-outdoor', ko: '에어컨 실외기(히트펌프)', en: 'Heat pump outdoor unit',
  params: [
    P.len('width', '폭', 'Width', 0.85, 0.7, 1.0),
    P.mat('casing', '외함', 'Casing', 'paint-white-matte', KFIN),
  ],
  tags: ['outdoor unit', 'heat pump', 'condenser', 'air conditioner', '실외기', '에어컨 실외기', '히트펌프'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = 0.62, D = 0.3, y0 = 0.05, zf = D / 2;
    for (const s of [-1, 1]) k.box('feet', 'metal-steel', 0.06, y0, D + 0.06, s * W * 0.35, y0 / 2, 0, { r: 0.004 });
    k.box('casing', p.casing, W, H, D, 0, y0 + H / 2, 0, { r: 0.008 });
    // round fan opening with blades and a wire grille
    const R = Math.min(H * 0.4, W * 0.28), fx = -W * 0.14, fy = y0 + H / 2;
    k.cyl('dark', 'plastic-black', R + 0.01, R + 0.01, 0.004, fx, fy, zf - 0.002, { rx: PI / 2, segs: k.seg(40, 12) });
    blades(k, 'blades', 'plastic-grey', 3, R * 0.95, fx, fy, zf - 0.01, { pitch: 0.5, bw: 0.55 });
    for (const f of [0.3, 0.55, 0.8, 1]) ring(k, 'grille', 'plastic-black', R * f, 0.003, fx, fy, zf + 0.006, { seg: 40 });
    k.rod('grille', 'plastic-black', [fx - R, fy, zf + 0.006], [fx + R, fy, zf + 0.006], 0.003, { segs: 4 });
    k.rod('grille', 'plastic-black', [fx, fy - R, zf + 0.006], [fx, fy + R, zf + 0.006], 0.003, { segs: 4 });
    // service cover, pipe valves and the side coil grille
    k.box('casing', p.casing, 0.14, 0.3, 0.012, W / 2 - 0.1, y0 + H * 0.45, zf + 0.004, { r: 0.004 });
    for (let i = 0; i < 2; i++) k.cyl('pipes', 'metal-copper', 0.008 + i * 0.004, 0.008 + i * 0.004, 0.06, W / 2, y0 + 0.12 + i * 0.05, zf - 0.07, { rz: -PI / 2, segs: k.seg(10, 5) });
    for (let i = 0; i < 12; i++) k.box('grille', 'plastic-black', 0.004, H * 0.8, 0.004, -W / 2 - 0.002, y0 + H / 2, -D / 2 + 0.03 + i * (D - 0.06) / 11, { r: 0 });
    slats(k, 'grille', 'plastic-black', 10, W * 0.9, 0, y0 + H * 0.15, y0 + H * 0.85, -zf - 0.002, { t: 0.004, d: 0.004 });
    return finish(k);
  },
});

/** Flame outline (teardrop) h tall, w wide, base at y = 0. */
function flameShape(w, h, lean = 0) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 0.7, 0, w * 0.55, h * 0.45, w * 0.1 + lean, h);
  s.bezierCurveTo(-w * 0.1 + lean * 0.5, h * 0.55, -w * 0.7, h * 0.3, 0, 0);
  return s;
}

const fireplace = a$({
  id: 'apx-electric-fireplace', placement: 'wall', elevation: 0.5, ko: '벽걸이 전기 벽난로', en: 'Wall-mounted electric fireplace',
  params: [
    P.len('width', '폭', 'Width', 1.27, 0.9, 1.8),
    P.len('height', '높이', 'Height', 0.55, 0.45, 0.7),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.bool('logs', '장작', 'Log set', true),
  ],
  tags: ['electric fireplace', 'wall fireplace', 'fire', 'heater', '전기 벽난로', '벽난로', '벽걸이 히터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.14, zf = D / 2;
    // back casing + a bezel round the 5 cm deep firebox (open behind the glass)
    k.box('frame', p.frame, W, H, D - 0.05, 0, H / 2, -0.025, { r: 0.006 });
    k.panel('frame', p.frame, frameShape(W, H, 0.025, 0.045), 0.05, 0, H / 2, zf - 0.025, { bevel: 0.004 });
    k.box('inner', 'screen-black', W - 0.05, H - 0.09, 0.004, 0, H / 2, zf - 0.048, { r: 0 });
    k.box('glass', 'glass-clear', W - 0.04, H - 0.08, 0.005, 0, H / 2, zf - 0.004, { r: 0.002 });
    k.box('vent', 'plastic-black', W * 0.6, 0.01, 0.004, 0, 0.02, zf + 0.001, { r: 0.002 }); // heater outlet
    // ember bed, logs and flames inside (flames glow: mesh 'display')
    const by = 0.05, bz = zf - 0.028;
    k.box('display', 'light-warm', W - 0.12, 0.012, 0.03, 0, by, bz, { r: 0.004 });
    if (p.logs) for (let i = 0; i < 4; i++) k.cyl('logs', 'wood-dark', 0.018, 0.02, W * 0.18, -W * 0.2 + i * W * 0.2, by + 0.02, bz, { rz: PI / 2 + (i % 2 ? 0.15 : -0.12), segs: k.seg(10, 5) });
    const nf = Math.max(4, Math.round(W / 0.12));
    for (let i = 0; i < nf; i++) {
      const fh = (H - 0.2) * (0.5 + 0.5 * ((i * 0.618) % 1));
      k.panel('display', 'light-warm', flameShape(0.06 + 0.03 * ((i * 0.37) % 1), fh, (i % 2 ? 0.01 : -0.01)), 0.003, -W / 2 + 0.08 + ((W - 0.16) * (i + 0.5)) / nf, by + 0.01, bz - 0.012, { bevel: 0 });
    }
    k.box('display', 'light-cool', 0.006, 0.006, 0.002, W / 2 - 0.04, 0.02, zf + 0.001, { r: 0 });
    return finish(k);
  },
});

const ceramicHeater = a$({
  id: 'apx-ceramic-heater', ko: '세라믹 히터(타워형)', en: 'Ceramic tower heater',
  params: [
    P.len('height', '높이', 'Height', 0.5, 0.3, 0.75),
    P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'),
  ],
  tags: ['ceramic heater', 'space heater', 'fan heater', '세라믹 히터', '온풍기', '전기 히터', '난로'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, W = 0.2, D = 0.17;
    k.slab('base', 'plastic-grey', ellipse(0.28, 0.24), 0.025, 0);
    k.rbox('body', p.body, W, H - 0.03, D, 0.04, 0, 0.03 + (H - 0.03) / 2, 0, { segs: k.seg(4, 1) });
    // front grille, heating element glow behind it, top control panel + carry handle
    const gh = (H - 0.03) * 0.62;
    k.box('dark', 'plastic-black', W * 0.7, gh, 0.006, 0, 0.03 + gh / 2 + 0.03, D / 2 - 0.002, { r: 0.004 });
    slats(k, 'grille', 'plastic-grey', Math.round(gh / 0.018), W * 0.72, 0, 0.06, 0.06 + gh, D / 2 + 0.003, { t: 0.006, d: 0.006 });
    k.box('dark', 'plastic-black', W * 0.6, 0.006, D * 0.5, 0, H + 0.002, 0.02, { r: 0.002 });
    k.box('display', 'light-cool', 0.05, 0.002, 0.02, 0, H + 0.005, 0.03, { r: 0 });
    k.box('dark', 'plastic-black', W * 0.5, 0.02, 0.025, 0, H - 0.03, -D / 2 + 0.01, { r: 0.008 });
    return finish(k);
  },
});

const bladelessFan = a$({
  id: 'apx-bladeless-fan', ko: '날개 없는 선풍기(타워)', en: 'Bladeless tower fan',
  params: [
    P.len('height', '높이', 'Height', 1.0, 0.55, 1.1),
    P.mat('body', '본체', 'Body', 'paint-white-gloss', KFIN),
    P.mat('accent', '포인트', 'Accent', 'metal-aluminium', 'metal'),
  ],
  tags: ['bladeless fan', 'tower fan', 'air multiplier', '날개 없는 선풍기', '타워팬', '선풍기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, baseH = 0.32, R = 0.1;
    k.lathe('base', p.body, [[0, 0], [R, 0], [R, 0.01], [R * 0.95, baseH], [0, baseH]], 0, 0, 0, { segs: k.seg(32, 10) });
    // intake holes band
    for (let i = 0; i < (k.hi ? 24 : 12); i++) {
      const a = (i / (k.hi ? 24 : 12)) * PI * 2;
      for (let j = 0; j < 3; j++) k.cyl('holes', 'plastic-black', 0.004, 0.004, 0.003, Math.cos(a) * R * 0.975, 0.12 + j * 0.03, Math.sin(a) * R * 0.975, { rz: -PI / 2, ry: -a, segs: 6 });
    }
    k.box('display', 'light-cool', 0.02, 0.006, 0.002, 0, baseH - 0.03, R * 0.95, { r: 0 });
    // tall loop amplifier: elliptical ring with depth
    const lh = H - baseH - 0.01, lw = 0.2;
    const s = ellipse(lw, lh);
    const hole = new THREE.Path(); hole.absellipse(0, 0, lw / 2 - 0.03, lh / 2 - 0.03, 0, PI * 2, true, 0);
    s.holes.push(hole);
    k.panel('loop', p.body, s, 0.08, 0, baseH + 0.01 + lh / 2, 0, { bevel: 0.006, curveSegs: 48 });
    k.cyl('base', p.accent, 0.03, 0.035, 0.02, 0, baseH, 0, { segs: k.seg(20, 8) });
    k.panel('trim', p.accent, (() => { const a = ellipse(lw - 0.054, lh - 0.054); const b = new THREE.Path(); b.absellipse(0, 0, lw / 2 - 0.032, lh / 2 - 0.032, 0, PI * 2, true, 0); a.holes.push(b); return a; })(), 0.04, 0, baseH + 0.01 + lh / 2, 0.005, { bevel: 0.002, curveSegs: 48 });
    return finish(k);
  },
});

const airCirculator = a$({
  id: 'apx-air-circulator', ko: '에어 서큘레이터', en: 'Air circulator fan',
  params: [
    P.num('tilt', '헤드 각도', 'Head tilt', 0.3, 0, 1.2, 0.05),
    P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'),
    P.len('size', '헤드 지름', 'Head size', 0.3, 0.22, 0.4),
  ],
  tags: ['air circulator', 'circulator', 'floor fan', '서큘레이터', '에어 서큘레이터', '선풍기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, R = S / 2, py = R + 0.07;
    // square base with dial, U yoke holding the head on a horizontal axis
    k.rbox('body', p.body, S * 0.85, 0.05, S * 0.85, 0.02, 0, 0.025, 0, { segs: k.seg(3, 1) });
    knob(k, 'dark', 'plastic-black', 0.016, 0.01, 0, 0.025, S * 0.425);
    k.bentTube('body', p.body, [[-(R + 0.02), py, 0], [-(R + 0.02), 0.05, 0], [R + 0.02, 0.05, 0], [R + 0.02, py, 0]], 0.012, 0.05);
    withM(k, () => {
      k.lathe('body', p.body, [[R * 0.98, 0], [R, 0.04], [R * 0.85, 0.14], [R * 0.4, 0.18], [0, 0.185]], 0, py, 0, { rx: -PI / 2, segs: k.seg(36, 12) });
      k.cyl('dark', 'plastic-black', R * 0.95, R * 0.95, 0.004, 0, py, -0.005, { rx: PI / 2, segs: k.seg(32, 10) });
      blades(k, 'blades', 'plastic-grey', 5, R * 0.85, 0, py, 0.02, { pitch: 0.5, bw: 0.5 });
      // spiral-style front grille: rings + spokes
      for (const f of [0.25, 0.5, 0.75, 1]) ring(k, 'grille', p.body, R * f, 0.0025, 0, py, 0.05 - 0.02 * f, { seg: 36 });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; k.rod('grille', p.body, [Math.cos(a) * R * 0.2, py + Math.sin(a) * R * 0.2, 0.046], [Math.cos(a + 0.5) * R, py + Math.sin(a + 0.5) * R, 0.03], 0.002, { segs: 4 }); }
      k.cyl('body', p.body, 0.012, 0.012, 2 * R + 0.04, -(R + 0.02), py, -0.04, { rz: -PI / 2, segs: k.seg(10, 5) });
    }, tiltX(-p.tilt, py, -0.04));
    return finish(k);
  },
});

/* ============================================================ audio-video */

const turntable = a$({
  id: 'apx-turntable', ...SURF, ko: '턴테이블(LP 플레이어)', en: 'Turntable (record player)',
  params: [
    P.mat('plinth', '본체', 'Plinth', 'wood-walnut', 'wood'),
    P.bool('cover', '먼지 덮개', 'Dust cover', true),
  ],
  tags: ['turntable', 'record player', 'vinyl', 'lp', '턴테이블', '레코드 플레이어', 'LP 플레이어', '오디오'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.45, D = 0.36, H = 0.1, y0 = 0.015;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('metal', 'metal-aluminium', 0.025, 0.028, y0, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), { segs: k.seg(16, 6) });
    k.box('plinth', p.plinth, W, H - y0, D, 0, y0 + (H - y0) / 2, 0, { r: 0.004 });
    // platter + record + label, spindle
    const px = -0.05, pz = 0;
    k.cyl('metal', 'metal-aluminium', 0.15, 0.15, 0.015, px, H, pz, { segs: k.seg(48, 14) });
    k.cyl('record', 'plastic-black', 0.149, 0.149, 0.002, px, H + 0.015, pz, { segs: k.seg(48, 14) });
    k.cyl('label', 'book-red', 0.045, 0.045, 0.0005, px, H + 0.017, pz, { segs: k.seg(24, 8) });
    k.cyl('metal', 'metal-chrome', 0.003, 0.003, 0.018, px, H + 0.015, pz, { segs: 6 });
    // tonearm: pivot, arm, headshell resting at the edge of the record, counterweight, lift
    const ax = 0.16, az = -0.11;
    k.cyl('metal', 'metal-chrome', 0.022, 0.025, 0.03, ax, H, az, { segs: k.seg(16, 6) });
    k.rod('metal', 'metal-chrome', [ax, H + 0.04, az], [ax - 0.02, H + 0.035, az + 0.2], 0.004, { segs: 6 });
    k.rod('metal', 'metal-chrome', [ax, H + 0.04, az], [ax + 0.005, H + 0.04, az - 0.05], 0.005, { segs: 6 });
    k.cyl('metal', 'metal-chrome', 0.014, 0.014, 0.03, ax + 0.005, H + 0.04, az - 0.04, { rx: -PI / 2, segs: k.seg(14, 6) });
    k.box('record', 'plastic-black', 0.018, 0.012, 0.035, ax - 0.022, H + 0.028, az + 0.21, { r: 0.002, ry: 0.4 });
    k.cyl('metal', 'metal-chrome', 0.004, 0.004, 0.025, ax - 0.04, H, az + 0.02, { segs: 6 });
    // start / speed buttons, cover
    for (let i = 0; i < 2; i++) k.cyl('metal', 'metal-aluminium', 0.012, 0.012, 0.004, -W / 2 + 0.04 + i * 0.035, H, D / 2 - 0.035, { segs: k.seg(12, 6) });
    if (p.cover) k.box('cover', 'glass-clear', W - 0.004, 0.09, D - 0.004, 0, H + 0.045 + 0.002, 0, { r: 0.006 });
    return finish(k);
  },
});

const amplifier = a$({
  id: 'apx-stereo-amplifier', ...SURF, ko: '인티앰프(VU 미터)', en: 'Stereo amplifier with VU meters',
  params: [
    P.mat('chassis', '케이스', 'Chassis', 'metal-black', 'metal'),
    P.mat('face', '전면', 'Faceplate', 'metal-aluminium', 'metal'),
    P.bool('cheeks', '원목 측판', 'Wood side cheeks', true),
  ],
  tags: ['amplifier', 'stereo amp', 'hifi', 'vu meter', '앰프', '인티앰프', '오디오', '하이파이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.43, H = 0.15, D = 0.38, y0 = 0.018, zf = D / 2;
    feet(k, W * 0.85, D * 0.8, { h: y0, r: 0.016, mat: 'metal-aluminium', role: 'knobs' });
    k.box('chassis', p.chassis, W, H - y0, D, 0, y0 + (H - y0) / 2, 0, { r: 0.004 });
    for (let i = 0; i < 9; i++) k.box('dark', 'plastic-black', W * 0.6, 0.002, 0.008, 0, H + 0.0005, -D * 0.3 + i * 0.02, { r: 0 });
    if (p.cheeks) for (const s of [-1, 1]) k.box('cheeks', 'wood-walnut', 0.02, H - y0 + 0.004, D + 0.004, s * (W / 2 + 0.01), y0 + (H - y0) / 2, 0, { r: 0.003 });
    k.box('face', p.face, W, H - y0, 0.01, 0, y0 + (H - y0) / 2, zf + 0.005, { r: 0.002 });
    // twin VU meters (lit), needles, two big knobs, small knobs and switches
    const my = y0 + (H - y0) * 0.66;
    for (const s of [-1, 1]) {
      k.box('dark', 'plastic-black', 0.1, 0.055, 0.004, s * 0.07, my, zf + 0.011, { r: 0.002 });
      k.box('display', 'light-warm', 0.09, 0.045, 0.002, s * 0.07, my, zf + 0.0135, { r: 0 });
      k.box('dark', 'plastic-black', 0.0015, 0.035, 0.001, s * 0.07 - 0.008, my - 0.003, zf + 0.0148, { r: 0, rz: 0.5 });
    }
    const ky = y0 + (H - y0) * 0.33;
    for (const s of [-1, 1]) knob(k, 'knobs', 'metal-aluminium', 0.026, 0.022, s * (W / 2 - 0.06), my - 0.012, zf + 0.01);
    for (let i = 0; i < 4; i++) knob(k, 'knobs', 'metal-aluminium', 0.011, 0.014, -0.09 + i * 0.06, ky - 0.012, zf + 0.01);
    k.box('dark', 'plastic-black', 0.012, 0.02, 0.012, -W / 2 + 0.035, ky - 0.012, zf + 0.016, { r: 0.002 });
    return finish(k);
  },
});

const ustProjector = a$({
  id: 'apx-ust-projector', ko: '초단초점 레이저 TV(ALR 스크린)', en: 'Ultra-short-throw laser TV with ALR screen',
  params: [
    P.int('inch', '화면 크기(인치)', 'Screen size (inch)', 100, 80, 120),
    P.len('console', '거실장 폭', 'Console width', 1.6, 1.2, 2.2),
    P.mat('wood', '거실장', 'Console', 'wood-oak', 'wood'),
    P.mat('body', '프로젝터', 'Projector', 'plastic-white', 'plastic'),
  ],
  tags: ['ust projector', 'laser tv', 'projector', 'alr screen', 'home cinema', '초단초점', '레이저 TV', '프로젝터', '홈시네마', '스크린'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const d = p.inch * 0.0254, sw = d * 0.8716, sh = d * 0.4903, CW = p.console, CH = 0.45, CD = 0.42;
    // low media console on legs with two doors and an open middle shelf
    const lh = 0.12;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', 'metal-black', 0.012, 0.01, lh, sx * (CW / 2 - 0.06), 0, sz * (CD / 2 - 0.05), { segs: k.seg(10, 5) });
    k.box('console', p.wood, CW, CH - lh, CD, 0, lh + (CH - lh) / 2, 0, { r: 0.004 });
    for (const s of [-1, 1]) k.box('fronts', p.wood, CW / 3 - 0.006, CH - lh - 0.02, 0.018, s * CW / 3, lh + (CH - lh) / 2, CD / 2 + 0.009, { r: 0.002 });
    k.box('dark', 'screen-black', CW / 3 - 0.02, CH - lh - 0.04, 0.004, 0, lh + (CH - lh) / 2, CD / 2 - 0.004, { r: 0 });
    // projector at the front edge of the console: speaker fabric front, lens window on top
    const py = CH, pz = CD / 2 - 0.2;
    k.soft('projector', p.body, 0.55, 0.13, 0.35, 0.03, 0, py + 0.065, pz, { flat: 3 });
    k.box('fabric', 'fabric-wool-charcoal', 0.5, 0.09, 0.006, 0, py + 0.06, pz + 0.175, { r: 0.003 });
    k.box('dark', 'screen-black', 0.18, 0.004, 0.06, 0, py + 0.131, pz - 0.11, { r: 0.002 });
    k.box('display', 'light-cool', 0.02, 0.003, 0.002, 0.2, py + 0.02, pz + 0.179, { r: 0 });
    // ALR screen on a floor stand behind
    const sz = -CD / 2 - 0.1, sy = CH + 0.15, fr = 0.02;
    k.panel('frame', 'metal-black', frameShape(sw + 2 * fr, sh + 2 * fr, fr), 0.03, 0, sy + sh / 2 + fr, sz);
    k.box('screen', 'paint-grey-matte', sw, sh, 0.01, 0, sy + sh / 2 + fr, sz - 0.004, { r: 0 });
    for (const s of [-1, 1]) {
      const x = s * sw * 0.35;
      k.box('legs', 'metal-black', 0.035, sy + 0.1, 0.025, x, (sy + 0.1) / 2, sz - 0.03, { r: 0.003 });
      k.box('legs', 'metal-black', 0.05, 0.02, 0.4, x, 0.01, sz - 0.03, { r: 0.004 });
    }
    return finish(k);
  },
});

const frameTv = a$({
  id: 'apx-frame-tv', placement: 'wall', elevation: 1.0, ko: '액자형 TV(아트 모드)', en: 'Art-frame TV',
  params: [
    P.int('inch', '화면 크기(인치)', 'Screen size (inch)', 55, 32, 85),
    P.mat('frame', '베젤 프레임', 'Bezel frame', 'wood-oak', 'wood'),
    P.mat('art', '그림', 'Artwork', 'wall-paint-sage', 'wall'),
  ],
  tags: ['frame tv', 'art tv', 'lifestyle tv', 'tv', '액자형 TV', '아트 TV', '텔레비전', 'TV'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const d = p.inch * 0.0254, w = d * 0.8716, h = d * 0.4903, b = 0.035, D = 0.025;
    k.box('body', 'screen-black', w + 0.01, h + 0.01, D, 0, h / 2 + b, -0.008, { r: 0.003 });
    k.panel('frame', p.frame, frameShape(w + 2 * b, h + 2 * b, b), 0.035, 0, h / 2 + b, 0, { bevel: 0.003 });
    // art mode: passe-partout and the picture shown on the matte panel
    const mat = Math.min(0.08, w * 0.06);
    k.panel('mat', 'paint-white-matte', frameShape(w, h, mat), 0.004, 0, h / 2 + b, 0.008, { bevel: 0 });
    k.box('art', p.art, w - 2 * mat, h - 2 * mat, 0.003, 0, h / 2 + b, 0.007, { r: 0 });
    k.box('art2', 'wall-paint-terracotta', (w - 2 * mat) * 0.35, (h - 2 * mat) * 0.5, 0.002, -(w - 2 * mat) * 0.15, h / 2 + b - (h - 2 * mat) * 0.1, 0.0095, { r: 0 });
    k.sphere('art2', 'wall-paint-terracotta', (h - 2 * mat) * 0.14, (w - 2 * mat) * 0.22, h / 2 + b + (h - 2 * mat) * 0.18, 0.009, { scale: [1, 1, 0.02], segs: k.seg(24, 8), rings: k.seg(10, 4) });
    k.box('body', 'screen-black', 0.12, 0.012, 0.04, 0, 0.006, 0.0, { r: 0.003 }); // one-connect cable outlet
    return finish(k);
  },
});

const partySpeaker = a$({
  id: 'apx-party-speaker', ko: '파티 스피커(LED)', en: 'Party speaker with LED rings',
  params: [
    P.pick('glow', 'LED 색', 'LED colour', 'light-cool', [['light-cool', '쿨', 'Cool'], ['light-warm', '웜', 'Warm']]),
    P.mat('body', '본체', 'Body', 'plastic-black', 'plastic'),
    P.len('height', '높이', 'Height', 0.75, 0.55, 1.0),
  ],
  tags: ['party speaker', 'bluetooth speaker', 'karaoke', 'speaker', '파티 스피커', '블루투스 스피커', '노래방 스피커', '스피커'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, W = H * 0.5, D = H * 0.46, zf = D / 2, rr = W * 0.38;
    k.rbox('body', p.body, W, H - 0.02, D, 0.03, 0, 0.02 + (H - 0.02) / 2, 0, { segs: k.seg(4, 1) });
    k.box('body', p.body, W * 0.6, 0.02, D * 0.6, 0, 0.01, 0.0, { r: 0.004 });
    for (const y of [H * 0.27, H * 0.62]) {
      driver(k, 0, y, zf, rr, { trim: 'metal-chrome', cone: 'plastic-grey' });
      ring(k, 'display', p.glow, rr * 1.12, 0.006, 0, y, zf + 0.004, { seg: 40 });
    }
    k.cyl('cone', 'plastic-grey', W * 0.08, W * 0.08, 0.01, 0, H * 0.85, zf - 0.005, { rx: PI / 2, segs: k.seg(16, 6) });
    k.box('display', p.glow, W * 0.7, 0.006, 0.006, 0, H * 0.93, zf + 0.002, { r: 0 });
    // top panel with buttons + a moulded carry handle, trolley handle and wheels at the back
    k.box('panel', 'plastic-grey', W * 0.6, 0.006, D * 0.3, 0, H + 0.003, D * 0.2, { r: 0.002 });
    k.box('body', p.body, W * 0.4, 0.035, 0.04, 0, H + 0.015, -D * 0.15, { r: 0.012 });
    for (const s of [-1, 1]) {
      k.rod('trolley', 'metal-aluminium', [s * W * 0.32, 0.1, -zf - 0.015], [s * W * 0.32, H + 0.02, -zf - 0.015], 0.008, { segs: 6 });
      k.cyl('wheels', 'rubber-black', 0.04, 0.04, 0.03, s * (W / 2 - 0.02), 0, -zf + 0.02, { rz: PI / 2, segs: k.seg(16, 6) });
    }
    k.rod('trolley', 'metal-aluminium', [-W * 0.32, H + 0.02, -zf - 0.015], [W * 0.32, H + 0.02, -zf - 0.015], 0.01, { segs: 6 });
    return finish(k);
  },
});

/* ============================================================== cleaning */

const canisterVacuum = a$({
  id: 'apx-canister-vacuum', ko: '유선 진공청소기(캐니스터)', en: 'Canister vacuum cleaner',
  params: [
    P.len('wand', '봉 길이', 'Wand length', 0.8, 0.6, 1.0),
    P.mat('body', '본체', 'Body', 'paint-blue-matte', KFIN),
  ],
  tags: ['vacuum cleaner', 'canister vacuum', 'hoover', '진공청소기', '청소기', '유선 청소기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // body on two big wheels and a front castor
    const bz = -0.3;
    k.sphere('body', p.body, 0.16, 0, 0.13, bz, { scale: [1, 0.72, 1.35], segs: k.seg(28, 10), rings: k.seg(16, 6) });
    k.cyl('bin', 'glass-tinted', 0.07, 0.075, 0.08, 0, 0.17, bz + 0.07, { segs: k.seg(20, 8) });
    k.box('grey', 'plastic-grey', 0.03, 0.02, 0.06, 0, 0.245, bz - 0.06, { r: 0.008 });
    for (const s of [-1, 1]) {
      k.cyl('wheels', 'plastic-black', 0.085, 0.085, 0.03, s * 0.17, 0.085, bz - 0.06, { rz: PI / 2, segs: k.seg(24, 8) });
      k.cyl('grey', 'plastic-grey', 0.04, 0.04, 0.032, s * 0.17, 0.085, bz - 0.06, { rz: PI / 2, segs: k.seg(16, 6) });
    }
    k.sphere('wheels', 'plastic-black', 0.02, 0, 0.02, bz + 0.17, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    // hose up to the handle, wand down to the floor nozzle in front
    const L = p.wand, hz = 0.12, hy = 0.82, nz = hz + L * 0.62, wl = Math.hypot(hy - 0.06, nz - hz);
    void wl;
    k.tube('hose', 'plastic-grey', [[0, 0.17, bz + 0.2], [0, 0.35, bz + 0.33], [0, 0.6, hz - 0.12], [0, hy - 0.03, hz - 0.03]], 0.018, { radial: k.seg(10, 5) });
    k.rbox('grey', 'plastic-grey', 0.04, 0.12, 0.05, 0.015, 0, hy, hz, { rx: 0.5 });
    k.rod('wand', 'metal-aluminium', [0, hy - 0.04, hz + 0.02], [0, 0.07, nz], 0.016, { segs: k.seg(12, 6) });
    k.rbox('nozzle', 'plastic-black', 0.28, 0.04, 0.08, 0.012, 0, 0.02, nz + 0.02);
    k.cyl('nozzle', 'plastic-black', 0.022, 0.022, 0.06, 0, 0.03, nz, { rx: -0.5, segs: k.seg(12, 6) });
    return finish(k);
  },
});

const robotDock = a$({
  id: 'apx-robot-dock-station', ko: '로봇청소기(자동 먼지 비움 스테이션)', en: 'Robot vacuum with auto-empty dock',
  params: [
    P.mat('body', '본체', 'Body', 'plastic-white', 'plastic'),
    P.mat('robotMat', '로봇 상판', 'Robot top', 'plastic-black', 'plastic'),
    P.bool('docked', '도킹', 'Robot docked', true),
  ],
  tags: ['robot vacuum', 'auto-empty dock', 'clean station', '로봇청소기', '먼지 비움 스테이션', '청정 스테이션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.32, TH = 0.44, TD = 0.18;
    // tower with dust-bag window and lid, ramp base in front
    k.rbox('body', p.body, W, TH, TD, 0.04, 0, TH / 2, -0.15, { segs: k.seg(4, 1) });
    k.box('window', 'glass-tinted', W * 0.5, TH * 0.32, 0.006, 0, TH * 0.65, -0.15 + TD / 2, { r: 0.006 });
    k.rbox('top', p.robotMat, W - 0.02, 0.02, TD - 0.02, 0.008, 0, TH, -0.15);
    k.box('display', 'light-cool', 0.03, 0.004, 0.002, 0, TH * 0.4, -0.15 + TD / 2 + 0.001, { r: 0 });
    k.rbox('body', p.body, W, 0.015, 0.2, 0.006, 0, 0.0075, -0.15 + TD / 2 + 0.09);
    for (const s of [-1, 1]) k.box('contacts', 'metal-chrome', 0.03, 0.006, 0.004, s * 0.06, 0.04, -0.15 + TD / 2 + 0.002, { r: 0.001 });
    // the robot: round body, lidar turret, bumper, side brush
    const rz = p.docked ? -0.15 + TD / 2 + 0.17 : 0.45, ry = p.docked ? 0.012 : 0.0;
    k.cyl('robot', p.body, 0.17, 0.17, 0.08, 0, ry, rz, { segs: k.seg(40, 12) });
    k.cyl('top', p.robotMat, 0.165, 0.165, 0.004, 0, ry + 0.08, rz, { segs: k.seg(40, 12) });
    k.cyl('top', p.robotMat, 0.04, 0.042, 0.02, 0, ry + 0.084, rz - 0.04, { segs: k.seg(20, 8) });
    k.cyl('bumper', 'rubber-black', 0.172, 0.172, 0.03, 0, ry + 0.02, rz, { open: true, segs: k.seg(40, 12) });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('bumper', 'rubber-black', [0.11, ry + 0.004, rz + 0.11], [0.11 + Math.cos(a) * 0.06, ry + 0.002, rz + 0.11 + Math.sin(a) * 0.06], 0.0015, { segs: 4 }); }
    return finish(k);
  },
});

export const ITEMS = [
  inductionHob, chimneyHood, islandHood, airFryer, riceCooker, standMixer, espresso, toaster, blender, kettle,
  breadMaker, juicer, ctDishwasher, iceMaker, warmingDrawer, dripCoffee,
  garmentSteamer, twinWasher, ironStation,
  deskFan, panelRadiator, heatPump, fireplace, ceramicHeater, bladelessFan, airCirculator,
  turntable, amplifier, ustProjector, frameTv, partySpeaker,
  canisterVacuum, robotDock,
];
