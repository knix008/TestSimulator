// More company workplace furniture (category 'workplace'): sit-stand bench, hot desk, wave desk,
// curved and accessible reception counters, folding / U-shaped / square / huddle / standing tables,
// acoustic and folding screens, slat divider, glass partition with door, clamp-on desk screen,
// smart lockers, tote cubbies, storage tower, mobile archive shelving, key cabinet, glass
// whiteboard, flipchart, signage kiosk, room booking panel, cushion pedestal, fire cabinet and a
// stationery supply cabinet. Origin: bottom centre (finish() re-centres), front +Z. ARCHITECTURE.md §12.
import { THREE, Kit, P, roundRect, frameShape, addCabinet, addHandle, clamp } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const CAT = 'workplace';
const w$ = (def) => mk({ category: CAT, ...def });

/* --------------------------------------------------------------- helpers */

/** Twin-wheel caster with its top plate at y = h (wheel on the floor). */
function caster(k, x, z, h = 0.06, mat = 'plastic-black') {
  const r = Math.min(0.025, h * 0.42);
  k.box('casters', mat, 0.04, 0.012, 0.04, x, h - 0.006, z, { r: 0.002 });
  k.cyl('casters', mat, r, r, 0.03, x + 0.015, r, z, { rz: PI / 2, segs: k.seg(12, 6) });
  k.box('casters', mat, 0.012, h - 0.012 - r, 0.02, x, (h - 0.012 + r) / 2, z, { r: 0.002 });
}

/** Annular sector (plan): radii ri..ro, angles a0..a1 around the origin (shape y = plan z). */
function ringSector(ri, ro, a0, a1) {
  const s = new THREE.Shape();
  s.absarc(0, 0, ro, a0, a1, false);
  s.absarc(0, 0, ri, a1, a0, true);
  s.closePath();
  return s;
}

/** Fabric desk screen with an aluminium top edge, centred at (x, y0 + h/2, z), along x. */
function deskScreen(k, mat, w, h, x, y0, z, frame = 'metal-aluminium') {
  k.rbox('screen', mat, w, h, 0.026, 0.01, x, y0 + h / 2, z);
  k.box('frame', frame, w, 0.012, 0.032, x, y0 + h - 0.004, z, { r: 0.003 });
}

/** Socket module (two sockets + USB) on a face at zf. */
function sockets(k, x, y, zf, mat = 'plastic-black') {
  k.box('power', mat, 0.2, 0.06, 0.03, x, y, zf - 0.015, { r: 0.004 });
  for (const dx of [-0.055, 0.02]) k.cyl('power', 'plastic-white', 0.016, 0.016, 0.004, x + dx, y, zf, { rx: PI / 2, segs: k.seg(14, 6) });
  k.box('power', 'plastic-white', 0.03, 0.012, 0.004, x + 0.07, y, zf + 0.001, { r: 0.001 });
}

/** Open-fronted carcass (back, sides, top, bottom) so what stands inside shows through glass / niches. */
function shell(k, role, mat, w, h, d, x, y0, z, t = 0.018, o = {}) {
  k.box(role, mat, w, h, t, x, y0 + h / 2, z - d / 2 + t / 2, { r: 0.002, ...o });
  for (const s of [-1, 1]) k.box(role, mat, t, h, d, x + s * (w / 2 - t / 2), y0 + h / 2, z, { r: 0.002, ...o });
  for (const yy of [t / 2, h - t / 2]) k.box(role, mat, w - 2 * t, t, d, x, y0 + yy, z, { r: 0.002, ...o });
}

const WOOD = 'wood', METAL = 'metal', FABRIC = 'fabric', PAINT = 'paint';

/* ------------------------------------------------------------ 1. desks */

const benchSitStand = w$({
  id: 'wpx-bench-sit-stand', ko: '2인 높이조절 벤치 데스크', en: 'Sit-stand bench desk (2 seats)',
  params: [
    P.len('seatW', '1인 폭', 'Width per seat', 1.6, 1.2, 1.8),
    P.len('depth', '1인 깊이', 'Depth per seat', 0.75, 0.65, 0.8),
    P.len('height', '상판 높이', 'Desk height', 0.74, 0.65, 1.25),
    P.mat('top', '상판', 'Top', 'wood-white', WOOD),
    P.mat('frame', '프레임', 'Frame', 'metal-black', METAL),
    P.bool('screen', '가운데 칸막이', 'Centre screen', true),
    P.mat('screenMat', '칸막이 천', 'Screen fabric', 'fabric-linen-grey', FABRIC),
  ],
  tags: ['sit stand desk', 'height adjustable', 'bench desk', 'workstation', '모션 데스크', '높이조절 책상', '벤치 데스크', '2인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.seatW, d = p.depth, h = p.height, t = 0.025;
    for (const s of [-1, 1]) {
      const z = s * (d / 2 + 0.015);
      k.box('top', p.top, W, t, d, 0, h - t / 2, z, { r: 0.003 });
      // per-desk lifting frame: two telescopic columns + cross rails + motor handset
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - 0.12);
        k.box('frame', p.frame, 0.08, 0.5, 0.06, x, 0.03 + 0.25, z, { r: 0.004 });
        k.box('frame', p.frame, 0.068, h - t - 0.52, 0.05, x, 0.52 + (h - t - 0.52) / 2, z, { r: 0.004 });
        k.box('frame', p.frame, 0.06, 0.03, d - 0.08, x, h - t - 0.015, z, { r: 0.003 });
      }
      k.box('frame', p.frame, W - 0.3, 0.05, 0.03, 0, h - t - 0.05, z, { r: 0.003 });
      k.box('power', 'plastic-black', 0.12, 0.03, 0.06, s * (W / 2 - 0.3), h - t - 0.02, z + s * (d / 2 - 0.04), { r: 0.006 });
    }
    // shared feet at both ends (one long foot carries both desks)
    for (const sx of [-1, 1]) k.box('frame', p.frame, 0.08, 0.03, 2 * d - 0.04, sx * (W / 2 - 0.12), 0.015, 0, { r: 0.006, segs: 2 });
    // cable tray along the spine
    k.box('frame', p.frame, W - 0.4, 0.06, 0.2, 0, h - t - 0.12, 0, { r: 0.003 });
    if (p.screen) {
      deskScreen(k, p.screenMat, W - 0.06, 0.45, 0, h, 0);
      for (const s of [-1, 1]) k.box('power', 'plastic-black', 0.04, 0.02, 0.04, 0, h + 0.01, s * 0.03, { r: 0.004 });
    }
    return finish(k);
  },
});

const hotDesk = w$({
  id: 'wpx-hot-desk', ko: '공유 좌석 데스크(사물함 포함)', en: 'Hot desk with locker cubby',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.2, 1.8),
    P.len('depth', '깊이', 'Depth', 0.7, 0.6, 0.8),
    P.mat('top', '상판', 'Top', 'wood-oak', WOOD),
    P.mat('body', '사물함', 'Locker', 'paint-grey-matte', PAINT),
    P.mat('frame', '다리', 'Leg', 'metal-white', METAL),
  ],
  tags: ['hot desk', 'hot desking', 'shared desk', 'locker desk', '핫데스크', '공유 좌석', '자율 좌석', '사물함 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, d = p.depth, h = 0.74, t = 0.025, lw = 0.42;
    k.box('top', p.top, W, t, d, 0, h - t / 2, 0, { r: 0.003 });
    // locker cubby at the right end carries the top: two lockable doors + an open bag shelf
    const lx = W / 2 - lw / 2 - 0.01, lh = h - t;
    k.box('body', p.body, lw, lh, d - 0.04, lx, lh / 2, 0, { r: 0.003 });
    for (let i = 0; i < 2; i++) {
      const y = 0.06 + i * 0.3 + 0.14;
      k.box('doors', p.body, lw - 0.02, 0.28, 0.018, lx, y, d / 2 - 0.02 + 0.009, { r: 0.002 });
      k.cyl('locks', 'metal-chrome', 0.012, 0.012, 0.008, lx + lw / 2 - 0.06, y + 0.07, d / 2 - 0.002, { rx: PI / 2, segs: k.seg(14, 6) });
      k.box('locks', 'plastic-white', 0.08, 0.025, 0.003, lx - 0.08, y + 0.1, d / 2 - 0.001, { r: 0.001 });
    }
    k.box('body', 'paint-black-matte', lw - 0.04, 0.005, d - 0.1, lx, 0.65, 0.01, { r: 0.001 });
    // left: slim U-leg
    const x = -W / 2 + 0.05;
    for (const s of [-1, 1]) k.box('frame', p.frame, 0.04, h - t, 0.04, x, (h - t) / 2, s * (d / 2 - 0.06), { r: 0.004 });
    k.box('frame', p.frame, 0.04, 0.03, d - 0.08, x, h - t - 0.015, 0, { r: 0.003 });
    k.box('frame', p.frame, 0.05, 0.02, d - 0.08, x, 0.01, 0, { r: 0.003 });
    // power hub: pop-up module on the back of the top + a coat hook
    k.box('power', 'plastic-black', 0.24, 0.05, 0.08, -0.1, h + 0.025, -d / 2 + 0.07, { r: 0.008 });
    for (const dx of [-0.07, 0, 0.07]) k.cyl('power', 'plastic-white', 0.014, 0.014, 0.004, -0.1 + dx, h + 0.05, -d / 2 + 0.07, { segs: k.seg(12, 6) });
    k.tube('locks', 'metal-chrome', [[lx + lw / 2, 0.55, 0.05], [lx + lw / 2 + 0.03, 0.55, 0.05], [lx + lw / 2 + 0.045, 0.58, 0.05]], 0.005, { caps: true });
    return finish(k);
  },
});

const desWave = w$({
  id: 'wpx-desk-wave', ko: '웨이브 워크스테이션', en: 'Wave workstation desk',
  params: [
    P.len('width', '폭', 'Width', 1.6, 1.2, 2.0),
    P.len('depth', '최대 깊이', 'Max depth', 0.9, 0.75, 1.0),
    P.num('wave', '물결 깊이', 'Wave depth', 0.14, 0.05, 0.22),
    P.pick('hand', '깊은 쪽', 'Deep side', 'left', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']]),
    P.mat('top', '상판', 'Top', 'wood-ash', WOOD),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium', METAL),
  ],
  tags: ['wave desk', 'curved desk', 'ergonomic desk', 'workstation', '웨이브 데스크', '곡선 책상', '사무용 책상', '워크스테이션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, A = p.wave, h = 0.74, t = 0.025;
    const flip = p.hand === 'right' ? -1 : 1;
    const zf = (u) => D / 2 - A + A * Math.sin(PI * 1.5 * u);
    const pts = [new THREE.Vector2(W / 2, -D / 2), new THREE.Vector2(-W / 2, -D / 2)];
    const n = k.seg(24, 8);
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push(new THREE.Vector2(flip * (-W / 2 + u * W), zf(u))); }
    if (flip < 0) pts.splice(2, pts.length - 2, ...pts.slice(2).reverse());
    k.slab('top', p.top, new THREE.Shape(flip < 0 ? [pts[0], pts[1], ...pts.slice(2)] : pts), t, h - t, { bevel: 0.003 });
    // C-legs (foot runs forward) + modesty panel
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.06);
      k.box('frame', p.frame, 0.06, h - t - 0.03, 0.04, x, (h - t - 0.03) / 2 + 0.02, -D / 2 + 0.08, { r: 0.004 });
      k.box('frame', p.frame, 0.06, 0.025, D - 0.3, x, 0.0125, -D / 2 + (D - 0.3) / 2 + 0.04, { r: 0.006, segs: 2 });
      k.box('frame', p.frame, 0.05, 0.03, D - 0.35, x, h - t - 0.015, -D / 2 + (D - 0.35) / 2 + 0.04, { r: 0.003 });
    }
    k.box('panel', 'paint-white-matte', W - 0.2, 0.35, 0.015, 0, h - t - 0.22, -D / 2 + 0.07, { r: 0.002 });
    k.box('frame', p.frame, W - 0.2, 0.05, 0.12, 0, h - t - 0.06, -D / 2 + 0.16, { r: 0.002 });
    return finish(k);
  },
});

/* ------------------------------------------------------- 2. reception */

const receptionCurved = w$({
  id: 'wpx-reception-curved', ko: '곡선형 안내 데스크', en: 'Curved reception counter',
  params: [
    P.len('radius', '반지름', 'Radius', 1.8, 1.2, 3.0),
    P.num('angle', '호 각도(°)', 'Arc angle (°)', 80, 50, 120, 1),
    P.len('height', '카운터 높이', 'Counter height', 1.1, 1.0, 1.2),
    P.mat('front', '전면', 'Front', 'wood-walnut', WOOD),
    P.mat('ledge', '상판', 'Ledge', 'quartz-white', 'stone'),
    P.mat('desk', '업무 상판', 'Work top', 'wood-white', WOOD),
  ],
  tags: ['reception', 'reception desk', 'front desk', 'curved counter', '안내 데스크', '리셉션', '로비 카운터', '곡선 카운터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.radius, a = (p.angle * PI) / 180, H = p.height;
    const a0 = PI / 2 - a / 2, a1 = PI / 2 + a / 2;
    // recessed plinth, curved front panel, accent strip, transaction ledge, inner work top + its panel
    k.slab('plinth', 'paint-black-matte', ringSector(R - 0.12, R - 0.05, a0, a1), 0.08, 0, { bevel: 0.002 });
    k.slab('front', p.front, ringSector(R - 0.06, R, a0, a1), H - 0.11, 0.08, { bevel: 0.002, curveSegs: 32, bevelSegs: 1 });
    k.slab('accent', 'metal-brass', ringSector(R - 0.004, R + 0.004, a0, a1), 0.02, H * 0.55, { bevel: 0.001, curveSegs: 32, bevelSegs: 1 });
    k.slab('ledge', p.ledge, ringSector(R - 0.3, R + 0.06, a0, a1), 0.03, H - 0.03, { bevel: 0.004, curveSegs: 32, bevelSegs: 1 });
    k.slab('desk', p.desk, ringSector(R - 0.75, R - 0.06, a0, a1), 0.025, 0.72, { bevel: 0.003, curveSegs: 32, bevelSegs: 1 });
    k.slab('front', p.front, ringSector(R - 0.33, R - 0.3, a0, a1), H - 0.75 - 0.03, 0.745, { bevel: 0.001, curveSegs: 32, bevelSegs: 1 });
    // end panels carrying the work top
    for (const ang of [a0, a1]) {
      const c = Math.cos(ang), s = Math.sin(ang), rm = R - 0.4;
      k.box('front', p.front, 0.03, 0.72, 0.68, c * rm, 0.36, s * rm, { r: 0.003, ry: -ang + PI / 2 });
    }
    return finish(k);
  },
});

const receptionAccessible = w$({
  id: 'wpx-reception-accessible', ko: '휠체어 겸용 2단 안내 데스크', en: 'Two-level accessible reception desk',
  params: [
    P.len('width', '폭', 'Width', 2.6, 2.0, 3.6),
    P.len('lowW', '낮은 구간 폭', 'Low section width', 0.9, 0.8, 1.2),
    P.pick('lowSide', '낮은 구간', 'Low section', 'right', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']]),
    P.mat('front', '전면', 'Front', 'paint-white-matte', PAINT),
    P.mat('top', '상판', 'Ledge', 'wood-walnut', WOOD),
    P.color('band', '띠 색', 'Band colour', '#2f6f8f'),
  ],
  tags: ['reception', 'accessible reception', 'wheelchair counter', 'front desk', '안내 데스크', '휠체어 카운터', '무장애', '리셉션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, lw = clamp(p.lowW, 0.6, W - 0.8), D = 0.8, H = 1.1, s = p.lowSide === 'right' ? 1 : -1;
    const hw = W - lw, hx = -s * lw / 2, lx = s * (W / 2 - lw / 2);
    const zf = D / 2 - 0.03;
    // high section: closed front with a colour band + ledge
    k.box('front', p.front, hw, H - 0.05, 0.04, hx, (H - 0.05) / 2 + 0.05, zf, { r: 0.004 });
    k.box('plinth', 'paint-black-matte', hw - 0.02, 0.05, 0.03, hx, 0.025, zf - 0.02, { r: 0.002 });
    k.box('band', 'paint-white-matte', hw + 0.002, 0.08, 0.042, hx, H * 0.6, zf, { r: 0.002, overrides: { color: p.band } });
    k.box('top', p.top, hw + 0.02, 0.03, 0.3, hx, H + 0.015, zf - 0.1, { r: 0.004 });
    // low section: counter at 0.76 m with knee space (apron + slim legs), the same band colour
    const lh = 0.76;
    k.box('top', p.top, lw, 0.03, D, lx, lh - 0.015, 0, { r: 0.004 });
    k.box('front', p.front, lw, 0.1, 0.03, lx, lh - 0.08, zf, { r: 0.003 });
    k.box('band', 'paint-white-matte', lw + 0.002, 0.03, 0.032, lx, lh - 0.08, zf, { r: 0.002, overrides: { color: p.band } });
    k.box('front', p.front, 0.04, lh - 0.03, D - 0.04, s * (W / 2 - 0.02), (lh - 0.03) / 2, 0, { r: 0.003 });
    // staff work top behind the high section + side panel at the far end
    k.box('desk', 'wood-white', hw - 0.05, 0.025, D - 0.1, hx, 0.735, -0.05, { r: 0.003 });
    k.box('front', p.front, 0.04, H - 0.02, D - 0.06, -s * (W / 2 - 0.02), (H - 0.02) / 2, -0.03, { r: 0.003 });
    k.box('front', p.front, 0.03, H - 0.02, D - 0.06, s * (W / 2 - lw), (H - 0.02) / 2, -0.03, { r: 0.003 });
    // wheelchair symbol plate
    k.box('sign', 'paint-blue-matte', 0.12, 0.12, 0.004, lx, lh - 0.08, zf + 0.017, { r: 0.004 });
    return finish(k);
  },
});

/* --------------------------------------------------------- 3. tables */

const foldingTable = w$({
  id: 'wpx-folding-table', ko: '접이식 이동 테이블', en: 'Folding nesting table on casters',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.0, 1.8),
    P.len('depth', '깊이', 'Depth', 0.6, 0.5, 0.8),
    P.bool('folded', '접음', 'Folded', false),
    P.mat('top', '상판', 'Top', 'wood-white', WOOD),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium', METAL),
  ],
  tags: ['folding table', 'nesting table', 'flip top', 'training table', '접이식 테이블', '플립 테이블', '이동식 테이블', '교육장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, d = p.depth, h = 0.74, t = 0.025;
    // T-legs on two casters each, joined by a crossbar
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.1);
      k.box('frame', p.frame, 0.06, 0.03, d - 0.06, x, 0.075, 0, { r: 0.006, segs: 2 });
      for (const sz of [-1, 1]) caster(k, x, sz * (d / 2 - 0.08), 0.06);
      k.box('frame', p.frame, 0.05, h - t - 0.13, 0.05, x, 0.09 + (h - t - 0.13) / 2, 0, { r: 0.004 });
      k.box('frame', 'plastic-black', 0.08, 0.05, 0.08, x, h - t - 0.05, 0, { r: 0.01, segs: 2 });
    }
    k.rod('frame', p.frame, [-W / 2 + 0.1, 0.3, 0], [W / 2 - 0.1, 0.3, 0], 0.014);
    if (p.folded) {
      // top flipped up to vertical over the hinge line
      k.box('top', p.top, W, d, t, 0, h - 0.04 + d / 2, -0.03, { r: 0.003 });
      k.box('frame', p.frame, W - 0.3, 0.03, 0.03, 0, h - 0.02, -0.03 - t, { r: 0.003 });
    } else {
      k.box('top', p.top, W, t, d, 0, h - t / 2, 0, { r: 0.003 });
      k.box('frame', p.frame, W - 0.3, 0.03, 0.03, 0, h - t - 0.03, -d / 2 + 0.1, { r: 0.003 });
      // release lever under the front edge
      k.box('frame', 'plastic-black', 0.1, 0.015, 0.04, W / 2 - 0.25, h - t - 0.012, d / 2 - 0.05, { r: 0.004 });
    }
    return finish(k);
  },
});

const confU = w$({
  id: 'wpx-conf-u-shape', ko: 'ㄷ자 회의 테이블', en: 'U-shaped conference table',
  params: [
    P.len('width', '폭', 'Width', 3.6, 2.4, 6.0),
    P.len('length', '길이', 'Length', 3.6, 2.4, 6.0),
    P.len('depth', '테이블 깊이', 'Table depth', 0.7, 0.6, 0.8),
    P.mat('top', '상판', 'Top', 'wood-oak', WOOD),
    P.mat('frame', '다리', 'Legs', 'metal-black', METAL),
    P.mat('panel', '가림판', 'Modesty panel', 'paint-grey-matte', PAINT),
  ],
  tags: ['u-shape table', 'conference table', 'training room', 'boardroom', 'ㄷ자 테이블', 'U자 회의', '회의 테이블', '교육장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, L = p.length, d = p.depth, h = 0.74, t = 0.03;
    // segments: back (along x), two arms (along z); the opening faces +z
    const segs = [
      { x: 0, z: -L / 2 + d / 2, w: W, dd: d, outer: [0, -1] },
      { x: -W / 2 + d / 2, z: d / 2, w: d, dd: L - d, outer: [-1, 0] },
      { x: W / 2 - d / 2, z: d / 2, w: d, dd: L - d, outer: [1, 0] },
    ];
    for (const s of segs) {
      k.box('top', p.top, s.w, t, s.dd, s.x, h - t / 2, s.z, { r: 0.004 });
      const xs = s.w / 2 - 0.06, zs = s.dd / 2 - 0.06;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('frame', p.frame, 0.03, 0.03, h - t, s.x + sx * xs, 0, s.z + sz * zs, { segs: k.seg(14, 6) });
      // modesty panel on the outer edge
      if (s.outer[1]) k.box('panel', p.panel, s.w - 0.2, 0.35, 0.018, s.x, h - t - 0.2, s.z + s.outer[1] * (s.dd / 2 - 0.08), { r: 0.002 });
      else k.box('panel', p.panel, 0.018, 0.35, s.dd - 0.2, s.x + s.outer[0] * (s.w / 2 - 0.08), h - t - 0.2, s.z, { r: 0.002 });
    }
    // power boxes flush in the tops
    for (const x of [-W / 4, W / 4]) k.box('power', 'metal-aluminium', 0.25, 0.006, 0.1, x, h + 0.002, -L / 2 + d * 0.5, { r: 0.002 });
    return finish(k);
  },
});

const confSquare = w$({
  id: 'wpx-conf-square-8', ko: '8인 정사각 회의 테이블', en: 'Square meeting table (8 seat)',
  params: [
    P.len('size', '한 변', 'Side', 1.8, 1.5, 2.4),
    P.mat('top', '상판', 'Top', 'wood-walnut', WOOD),
    P.mat('base', '받침', 'Base', 'metal-black', METAL),
    P.bool('well', '중앙 배선구', 'Cable well', true),
  ],
  tags: ['square table', 'meeting table', 'conference table', '8 seat', '정사각 테이블', '회의 테이블', '8인', '회의실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, h = 0.74, t = 0.035;
    const shape = roundRect(S, S, 0.04);
    if (p.well) {
      const hole = new THREE.Path();
      const q = 0.18;
      hole.moveTo(-q, -q); hole.lineTo(-q, q); hole.lineTo(q, q); hole.lineTo(q, -q); hole.lineTo(-q, -q);
      shape.holes.push(hole);
      // cable well tray + hinged brushed lids
      k.box('well', 'metal-aluminium', 0.36, 0.006, 0.36, 0, h - t - 0.06, 0, { r: 0.001 });
      for (const s of [-1, 1]) k.box('well', 'metal-aluminium', 0.36, 0.008, 0.175, 0, h - 0.006, s * 0.0885, { r: 0.002 });
      k.box('power', 'plastic-black', 0.3, 0.05, 0.06, 0, h - t - 0.035, 0, { r: 0.004 });
    }
    k.slab('top', p.top, shape, t, h - t, { bevel: 0.004 });
    // cross-shaped double-panel base + a square foot plate
    for (const ry of [PI / 4, -PI / 4]) k.box('base', p.base, 0.04, h - t - 0.02, S * 0.9, 0, (h - t - 0.02) / 2 + 0.02, 0, { r: 0.004, ry });
    k.box('base', p.base, S * 0.5, 0.02, S * 0.5, 0, 0.01, 0, { r: 0.004, ry: PI / 4 });
    for (const ry of [PI / 4, -PI / 4]) k.box('base', p.base, 0.06, 0.03, S * 0.9, 0, h - t - 0.015, 0, { r: 0.003, ry });
    return finish(k);
  },
});

const huddleTable = w$({
  id: 'wpx-huddle-media-table', ko: '모니터 일체형 허들 테이블', en: 'Huddle media table with screen',
  params: [
    P.len('length', '길이', 'Length', 1.8, 1.4, 2.6),
    P.len('width', '폭', 'Width', 1.0, 0.9, 1.2),
    P.num('screenIn', '화면(인치)', 'Screen (in)', 55, 43, 75, 1),
    P.mat('top', '상판', 'Top', 'wood-oak', WOOD),
    P.mat('frame', '프레임', 'Frame', 'metal-black', METAL),
  ],
  tags: ['huddle table', 'media table', 'collaboration table', 'screen table', '허들 테이블', '미디어 테이블', '협업 테이블', '모니터 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, W = p.width, h = 0.74, t = 0.03;
    const diag = p.screenIn * 0.0254, sw = diag * 0.8716, sh = diag * 0.4903;
    // table: long along z, screen at the back end facing +z
    k.box('top', p.top, W, t, L, 0, h - t / 2, 0.15, { r: 0.004 });
    for (const sx of [-1, 1]) k.box('frame', p.frame, 0.06, h - t, 0.06, sx * (W / 2 - 0.08), (h - t) / 2, 0.15 + L / 2 - 0.08, { r: 0.004 });
    // back: screen column on a base plate also carrying the table end
    const zc = 0.15 - L / 2 - 0.05;
    k.box('frame', p.frame, W - 0.1, 0.02, 0.5, 0, 0.01, zc + 0.12, { r: 0.004 });
    k.box('frame', p.frame, 0.14, h + sh * 0.5 + 0.3, 0.08, 0, (h + sh * 0.5 + 0.3) / 2, zc, { r: 0.006 });
    k.box('frame', p.frame, W - 0.16, 0.05, 0.05, 0, h - t - 0.03, zc + 0.08, { r: 0.004 });
    const sy = h + 0.25 + sh / 2;
    k.box('tv', 'plastic-black', sw + 0.02, sh + 0.02, 0.045, 0, sy, zc + 0.065, { r: 0.004 });
    k.box('screen', 'screen-black', sw, sh, 0.003, 0, sy, zc + 0.089, { r: 0 });
    k.box('tv', 'plastic-black', 0.2, 0.03, 0.05, 0, sy + sh / 2 + 0.03, zc + 0.07, { r: 0.006 }); // camera bar
    // connectivity box in the middle of the top
    k.box('power', 'metal-aluminium', 0.26, 0.012, 0.12, 0, h + 0.006, 0.15 - L / 2 + 0.35, { r: 0.003 });
    for (const dx of [-0.08, 0, 0.08]) k.box('power', 'plastic-black', 0.04, 0.004, 0.02, dx, h + 0.013, 0.15 - L / 2 + 0.35, { r: 0.001 });
    return finish(k);
  },
});

const standingBar = w$({
  id: 'wpx-standing-bar-power', ko: '전원 레일 스탠딩 바 테이블', en: 'Standing bar table with power rail',
  params: [
    P.len('length', '길이', 'Length', 3.2, 1.8, 4.8),
    P.len('depth', '깊이', 'Depth', 0.8, 0.6, 1.0),
    P.len('height', '높이', 'Height', 1.05, 0.95, 1.1),
    P.mat('top', '상판', 'Top', 'plywood', WOOD),
    P.mat('frame', '프레임', 'Frame', 'metal-black', METAL),
  ],
  tags: ['standing table', 'bar table', 'high table', 'power rail', '스탠딩 테이블', '바 테이블', '하이 테이블', '전원 레일'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.03;
    k.box('top', p.top, L, t, d, 0, h - t / 2, 0, { r: 0.004 });
    // sled frames every ~1.6 m
    const n = Math.max(2, Math.ceil(L / 1.6) + 1);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.12 + (i / (n - 1)) * (L - 0.24);
      k.bentTube('frame', p.frame, [[x, h - t, -d / 2 + 0.08], [x, 0.012, -d / 2 + 0.08], [x, 0.012, d / 2 - 0.08], [x, h - t, d / 2 - 0.08]], 0.016, 0.04);
      k.box('frame', p.frame, 0.04, 0.03, d - 0.12, x, h - t - 0.015, 0, { r: 0.003 });
    }
    // foot rails on both long sides
    for (const s of [-1, 1]) k.rod('rail', 'metal-chrome', [-L / 2 + 0.12, 0.25, s * (d / 2 - 0.08)], [L / 2 - 0.12, 0.25, s * (d / 2 - 0.08)], 0.013);
    // power rail along the centre with socket modules
    k.box('rail', 'metal-aluminium', L - 0.3, 0.035, 0.07, 0, h + 0.0175, 0, { r: 0.004 });
    const m = Math.max(2, Math.round(L / 0.6));
    for (let i = 0; i < m; i++) {
      const x = -L / 2 + 0.15 + ((i + 0.5) / m) * (L - 0.3);
      for (const s of [-1, 1]) k.cyl('power', 'plastic-black', 0.012, 0.012, 0.004, x, h + 0.0175, s * 0.035, { rx: s * PI / 2, segs: k.seg(12, 6) });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------ 4. partitions */

const acousticScreen = w$({
  id: 'wpx-acoustic-screen-mobile', ko: '이동식 흡음 스크린', en: 'Mobile acoustic screen',
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.8, 1.8),
    P.len('height', '높이', 'Height', 1.6, 1.2, 1.8),
    P.mat('felt', '흡음재', 'Felt', 'fabric-wool-charcoal', FABRIC),
    P.bool('casters', '바퀴', 'Casters', true),
  ],
  tags: ['acoustic screen', 'mobile screen', 'room divider', 'privacy screen', '흡음 스크린', '이동식 칸막이', '파티션', '방음'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, y0 = p.casters ? 0.08 : 0.04;
    k.soft('felt', p.felt, W, H - y0, 0.06, 0.025, 0, y0 + (H - y0) / 2, 0, { flat: 3 });
    // stitched channel lines (vertical grooves)
    for (const f of [-1 / 3, 1 / 3]) k.box('felt', p.felt, 0.006, H - y0 - 0.1, 0.064, f * W, y0 + (H - y0) / 2, 0, { r: 0.002 });
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.15);
      k.box('feet', 'metal-aluminium', 0.04, 0.03, 0.4, x, y0 - 0.015, 0, { r: 0.006, segs: 2 });
      k.box('feet', 'metal-aluminium', 0.03, 0.08, 0.07, x, y0 + 0.02, 0, { r: 0.004 });
      if (p.casters) for (const sz of [-1, 1]) caster(k, x, sz * 0.17, y0 - 0.03);
      else for (const sz of [-1, 1]) k.cyl('casters', 'rubber-black', 0.02, 0.02, y0 - 0.03, x, 0, sz * 0.17, { segs: k.seg(10, 5) });
    }
    return finish(k);
  },
});

const foldingScreen = w$({
  id: 'wpx-folding-screen', ko: '3폭 접이식 파티션', en: 'Folding 3-panel partition',
  params: [
    P.len('panelW', '한 폭', 'Panel width', 0.6, 0.45, 0.8),
    P.len('height', '높이', 'Height', 1.7, 1.4, 1.9),
    P.num('fold', '접힘 각도(°)', 'Fold angle (°)', 30, 0, 60, 1),
    P.mat('fabric', '천', 'Fabric', 'fabric-linen-beige', FABRIC),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium', METAL),
  ],
  tags: ['folding screen', 'partition', 'room divider', 'mobile partition', '접이식 파티션', '칸막이', '병풍', '이동식 파티션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.panelW, H = p.height, a = (p.fold * PI) / 180, y0 = 0.07, ph = H - y0;
    let x = 0, z = 0;
    for (let i = 0; i < 3; i++) {
      const th = i % 2 ? -a : a;
      const dx = Math.cos(th), dz = Math.sin(th);
      const cx = x + dx * w / 2, cz = z + dz * w / 2, ry = -th;
      k.panel('frame', p.frame, frameShape(w, ph, 0.025, 0.025), 0.03, cx, y0 + ph / 2, cz, { ry });
      k.box('fabric', p.fabric, w - 0.04, ph - 0.04, 0.012, cx, y0 + ph / 2, cz, { r: 0, ry });
      for (const f of [0.15, 0.85]) caster(k, x + dx * w * f, z + dz * w * f, y0);
      // hinge knuckles at the joint
      if (i > 0) for (const hy of [0.3, ph / 2, ph - 0.3]) k.cyl('frame', p.frame, 0.012, 0.012, 0.06, x, y0 + hy - 0.03, z, { segs: k.seg(10, 5) });
      x += dx * w; z += dz * w;
    }
    return finish(k);
  },
});

const slatDivider = w$({
  id: 'wpx-slat-divider', ko: '원목 루버 공간 분리대', en: 'Timber slat room divider',
  params: [
    P.len('width', '폭', 'Width', 2.0, 1.0, 3.6),
    P.len('height', '높이', 'Height', 2.2, 1.6, 2.6),
    P.len('pitch', '간격', 'Slat pitch', 0.1, 0.06, 0.2),
    P.mat('wood', '목재', 'Wood', 'wood-oak', WOOD),
    P.mat('base', '받침', 'Base', 'metal-black', METAL),
  ],
  tags: ['slat divider', 'room divider', 'timber screen', 'louvre', '루버', '공간 분리대', '원목 칸막이', '파티션'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, n = Math.max(3, Math.floor((W - 0.04) / p.pitch) + 1);
    k.box('base', p.base, W, 0.06, 0.12, 0, 0.03, 0, { r: 0.004 });
    k.box('base', p.base, W, 0.04, 0.08, 0, H - 0.02, 0, { r: 0.004 });
    const span = W - 0.04;
    for (let i = 0; i < n; i++) k.box('slats', p.wood, 0.03, H - 0.1, 0.06, -span / 2 + (i / (n - 1)) * span, 0.06 + (H - 0.1) / 2, 0, { r: 0.003 });
    // levelling feet
    for (const s of [-1, 1]) k.box('base', p.base, 0.03, 0.01, 0.2, s * (W / 2 - 0.1), 0.005, 0, { r: 0.002 });
    return finish(k);
  },
});

const glassPartitionDoor = w$({
  id: 'wpx-glass-partition-door', ko: '도어 일체형 유리 파티션', en: 'Glass partition with door',
  params: [
    P.len('width', '전체 폭', 'Total width', 3.0, 2.0, 5.0),
    P.len('height', '높이', 'Height', 2.4, 2.1, 2.8),
    P.len('doorW', '문 폭', 'Door width', 0.9, 0.8, 1.1),
    P.pick('doorSide', '문 위치', 'Door', 'right', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']]),
    P.mat('frame', '프레임', 'Frame', 'metal-aluminium', METAL),
    P.bool('band', '시선 차단 띠', 'Manifestation band', true),
  ],
  tags: ['glass partition', 'glass wall', 'office front', 'glass door', '유리 파티션', '유리 칸막이', '사무실 칸막이', '유리문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, dw = clamp(p.doorW, 0.7, W - 0.6), f = p.frame, s = p.doorSide === 'right' ? 1 : -1;
    // head + floor track, wall jambs
    k.box('frame', f, W, 0.06, 0.1, 0, H - 0.03, 0, { r: 0.003 });
    k.box('frame', f, W, 0.04, 0.1, 0, 0.02, 0, { r: 0.003 });
    for (const e of [-1, 1]) k.box('frame', f, 0.05, H, 0.1, e * (W / 2 - 0.025), H / 2, 0, { r: 0.003 });
    // door frame posts
    const dx = s * (W / 2 - 0.05 - dw / 2), postX = dx - s * (dw / 2 + 0.025);
    k.box('frame', f, 0.05, H - 0.1, 0.1, postX, H / 2, 0, { r: 0.003 });
    // fixed glazing with mullions every ~1.2 m
    const gx0 = s > 0 ? -W / 2 + 0.05 : postX + 0.025, gx1 = s > 0 ? postX - 0.025 : W / 2 - 0.05;
    const gw = gx1 - gx0, m = Math.max(1, Math.round(gw / 1.2));
    for (let i = 0; i < m; i++) {
      const pw = gw / m, cx = gx0 + pw * (i + 0.5);
      k.box('glass', 'glass-clear', pw - 0.006, H - 0.1, 0.012, cx, H / 2, 0, { r: 0 });
      if (p.band) k.box('band', 'glass-frosted', pw - 0.006, 0.1, 0.013, cx, 1.2, 0, { r: 0 });
      if (i > 0) k.box('frame', f, 0.04, H - 0.1, 0.06, gx0 + pw * i, H / 2, 0, { r: 0.003 });
    }
    // framed glass door with a long vertical pull handle on both faces
    const doorH = H - 0.12;
    k.panel('door', f, frameShape(dw, doorH, 0.05, 0.08), 0.045, dx, 0.04 + doorH / 2, 0);
    k.box('glass', 'glass-clear', dw - 0.1, doorH - 0.16, 0.01, dx, 0.04 + doorH / 2, 0, { r: 0 });
    if (p.band) k.box('band', 'glass-frosted', dw - 0.1, 0.1, 0.011, dx, 1.2, 0, { r: 0 });
    const hx = dx - s * (dw / 2 - 0.1);
    for (const sz of [-1, 1]) {
      k.rod('handle', 'metal-chrome', [hx, 0.7, sz * 0.06], [hx, 1.5, sz * 0.06], 0.012);
      for (const hy of [0.75, 1.45]) k.rod('handle', 'metal-chrome', [hx, hy, sz * 0.022], [hx, hy, sz * 0.06], 0.008);
    }
    return finish(k);
  },
});

const deskScreenClamp = w$({
  id: 'wpx-desk-screen-clamp', placement: 'surface', ko: '책상 부착형 칸막이', en: 'Clamp-on desk screen',
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.8, 1.8),
    P.len('height', '높이', 'Height', 0.5, 0.3, 0.65),
    P.mat('fabric', '천', 'Fabric', 'fabric-velvet-green', FABRIC),
    P.mat('clamp', '클램프', 'Clamps', 'metal-aluminium', METAL),
  ],
  tags: ['desk screen', 'desk divider', 'privacy panel', 'clamp screen', '책상 칸막이', '데스크 스크린', '부착형 칸막이', '가림판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, y0 = 0.03;
    k.soft('fabric', p.fabric, W, H, 0.03, 0.012, 0, y0 + H / 2, 0, { flat: 3 });
    // two clamp brackets: top plate on the desk, upright gripping the screen, screw knob behind
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.2);
      k.box('clamp', p.clamp, 0.05, 0.008, 0.14, x, 0.004, -0.04, { r: 0.002 });
      k.box('clamp', p.clamp, 0.05, 0.1, 0.008, x, 0.05, 0.02, { r: 0.002 });
      k.box('clamp', p.clamp, 0.05, 0.1, 0.008, x, 0.05, -0.02, { r: 0.002 });
      k.cyl('knob', 'plastic-black', 0.016, 0.016, 0.02, x, 0.008, -0.1, { segs: k.seg(12, 6) });
    }
    return finish(k);
  },
});

/* -------------------------------------------------------- 5. storage */

const smartLockers = w$({
  id: 'wpx-smart-lockers', ko: '스마트 사물함(터치 단말)', en: 'Smart locker bank with touchscreen',
  params: [
    P.int('cols', '열', 'Columns', 4, 2, 8),
    P.int('rows', '단', 'Rows', 5, 3, 6),
    P.mat('body', '본체', 'Body', 'paint-white-matte', PAINT),
    P.mat('doors', '문', 'Doors', 'wood-oak', WOOD),
    P.mat('terminal', '단말기', 'Terminal', 'paint-black-matte', PAINT),
  ],
  tags: ['smart locker', 'locker', 'parcel locker', 'digital locker', '스마트 사물함', '사물함', '무인 보관함', '택배함'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const cw = 0.4, H = 1.9, D = 0.5, plinth = 0.08, tw = 0.45;
    const nl = Math.floor(p.cols / 2), nr = p.cols - nl;
    const W = p.cols * cw + tw;
    k.box('body', p.body, W, H - plinth, D - 0.02, 0, plinth + (H - plinth) / 2, -0.01, { r: 0.003 });
    k.box('plinth', 'paint-black-matte', W - 0.02, plinth, D - 0.06, 0, plinth / 2, -0.03, { r: 0.002 });
    const rh = (H - plinth) / p.rows, zf = D / 2 - 0.009;
    const colX = [];
    for (let i = 0; i < nl; i++) colX.push(-W / 2 + cw * (i + 0.5));
    for (let i = 0; i < nr; i++) colX.push(-W / 2 + nl * cw + tw + cw * (i + 0.5));
    for (const x of colX) for (let r = 0; r < p.rows; r++) {
      const y = plinth + rh * (r + 0.5);
      k.box('doors', p.doors, cw - 0.006, rh - 0.006, 0.018, x, y, zf, { r: 0.002 });
      k.box('locks', 'plastic-grey', 0.02, 0.05, 0.006, x + cw / 2 - 0.04, y, zf + 0.011, { r: 0.002 });
    }
    // terminal column: touchscreen, card reader, parcel slot
    const tx = -W / 2 + nl * cw + tw / 2;
    k.box('term', p.terminal, tw - 0.006, H - plinth - 0.006, 0.02, tx, plinth + (H - plinth) / 2, zf, { r: 0.003 });
    k.box('screen', 'screen-black', 0.27, 0.42, 0.006, tx, 1.35, zf + 0.012, { r: 0.004 });
    k.box('display', 'light-cool', 0.25, 0.4, 0.002, tx, 1.35, zf + 0.0155, { r: 0 });
    k.box('locks', 'plastic-grey', 0.1, 0.07, 0.012, tx, 1.05, zf + 0.014, { r: 0.004 });
    k.box('locks', 'metal-aluminium', 0.3, 0.04, 0.012, tx, 0.85, zf + 0.014, { r: 0.004 });
    return finish(k);
  },
});

const toteCubbies = w$({
  id: 'wpx-tote-cubbies', ko: '토트 트레이 수납장', en: 'Tote tray cubby unit',
  params: [
    P.int('cols', '열', 'Columns', 3, 2, 5),
    P.int('rows', '단', 'Rows', 4, 3, 6),
    P.mat('body', '본체', 'Body', 'plywood', WOOD),
    P.color('tray', '트레이 색', 'Tray colour', '#3d8fb8'),
    P.bool('casters', '바퀴', 'Casters', true),
  ],
  tags: ['tote tray', 'cubby', 'personal storage', 'tray storage', '트레이 수납장', '개인 수납', '사물함', '큐비'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const cw = 0.34, rh = 0.18, D = 0.45, t = 0.018, y0 = p.casters ? 0.07 : 0.03;
    const W = p.cols * cw + t, H = p.rows * rh + t;
    // carcass: sides + dividers + top/bottom + back
    for (let i = 0; i <= p.cols; i++) k.box('body', p.body, t, H, D, -W / 2 + t / 2 + i * cw, y0 + H / 2, 0, { r: 0.002 });
    for (const y of [t / 2, H - t / 2]) k.box('body', p.body, W, t, D, 0, y0 + y, 0, { r: 0.002 });
    k.box('body', p.body, W, H, 0.006, 0, y0 + H / 2, -D / 2 + 0.003, { r: 0 });
    for (let c = 0; c < p.cols; c++) for (let r = 0; r < p.rows; r++) {
      const x = -W / 2 + t + cw * (c + 0.5) - t / 2, y = y0 + t + r * rh;
      // runners + tray (open box with a front lip), every third pulled out a little
      const pull = (c + r) % 3 === 0 ? 0.08 : 0.0;
      const tw = cw - t - 0.016, th = rh - 0.05, td = D - 0.04;
      k.box('runners', 'plastic-grey', cw - t, 0.008, D - 0.02, x, y + 0.004, 0, { r: 0 });
      k.box('trays', 'plastic-white', tw, 0.006, td, x, y + 0.014, pull, { r: 0.002, overrides: { color: p.tray } });
      for (const s of [-1, 1]) k.box('trays', 'plastic-white', 0.006, th, td, x + s * (tw / 2 - 0.003), y + 0.011 + th / 2, pull, { r: 0.002, overrides: { color: p.tray } });
      for (const s of [-1, 1]) k.box('trays', 'plastic-white', tw, th, 0.006, x, y + 0.011 + th / 2, pull + s * (td / 2 - 0.003), { r: 0.002, overrides: { color: p.tray } });
    }
    if (p.casters) for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(k, sx * (W / 2 - 0.06), sz * (D / 2 - 0.06), y0);
    else k.box('plinth', 'paint-black-matte', W - 0.04, y0, D - 0.06, 0, y0 / 2, -0.01, { r: 0.002 });
    return finish(k);
  },
});

const storageTower = w$({
  id: 'wpx-storage-tower', ko: '개인 수납 타워(코트 사물함)', en: 'Personal storage tower with coat locker',
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.6, 1.0),
    P.len('height', '높이', 'Height', 1.4, 1.1, 1.8),
    P.mat('body', '본체', 'Body', 'paint-white-matte', PAINT),
    P.mat('front', '문', 'Fronts', 'wood-oak', WOOD),
    P.mat('cushion', '상판 쿠션', 'Top cushion', 'fabric-wool-charcoal', FABRIC),
  ],
  tags: ['storage tower', 'coat locker', 'personal storage', 'wardrobe locker', '수납 타워', '코트 사물함', '개인 수납장', '옷장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.6, plinth = 0.06, t = 0.018, half = W / 2;
    // left: closed locker carcass; right: open carcass (drawers below, niche above)
    k.box('body', p.body, half, H - plinth, D - 0.02, -W / 4, plinth + (H - plinth) / 2, -0.01, { r: 0.003 });
    shell(k, 'body', p.body, half, H - plinth, D - 0.02, W / 4, plinth, -0.01, t);
    k.box('plinth', 'paint-black-matte', W - 0.02, plinth, D - 0.06, 0, plinth / 2, -0.03, { r: 0.002 });
    const zf = D / 2 - t / 2, ih = H - plinth;
    // left: full-height coat locker door with a lock + a vent slot
    const lx = -W / 4;
    k.box('fronts', p.front, half - 0.006, ih - 0.006, t, lx, plinth + ih / 2, zf, { r: 0.002 });
    k.cyl('locks', 'metal-chrome', 0.012, 0.012, 0.008, lx + half / 2 - 0.05, plinth + ih * 0.6, zf + t / 2, { rx: PI / 2, segs: k.seg(14, 6) });
    k.box('locks', 'metal-aluminium', 0.016, 0.16, 0.02, lx + half / 2 - 0.05, plinth + ih * 0.5, zf + t / 2 + 0.008, { r: 0.004 });
    for (let i = 0; i < 4; i++) k.box('locks', 'paint-black-matte', half * 0.5, 0.006, 0.003, lx, plinth + ih - 0.12 - i * 0.02, zf + t / 2, { r: 0 });
    // right: two drawers below, open shelves above (niche shows a shelf + books)
    const rx = W / 4, dh = Math.min(0.3, ih * 0.25);
    for (let i = 0; i < 2; i++) {
      const y = plinth + dh * (i + 0.5);
      k.box('fronts', p.front, half - 0.006, dh - 0.006, t, rx, y, zf, { r: 0.002 });
      addHandle(k, 'locks', 'metal-aluminium', 'edge', rx, y + dh / 2 - 0.012, zf + t / 2, { len: half * 0.5 });
    }
    const oy0 = plinth + 2 * dh, oh = ih - 2 * dh;
    k.box('body', 'paint-grey-matte', half - 0.04, oh - 0.02, 0.004, rx, oy0 + oh / 2, -D / 2 + 0.02, { r: 0 });
    for (const f of [0, 0.5]) k.box('body', p.body, half - 2 * t, t, D - 0.04, rx, oy0 + f * oh + t / 2, -0.01, { r: 0.002 });
    // drawer box behind the two fronts
    k.box('body', p.body, half - 2 * t, 2 * dh - 0.01, D - 0.06, rx, plinth + dh, -0.02, { r: 0.002 });
    for (let i = 0; i < 4; i++) k.box('books', ['book-red', 'book-blue', 'book-green', 'book-cream'][i], 0.03, 0.22, 0.17, rx - half / 2 + 0.06 + i * 0.035, oy0 + t + 0.11, -0.05, { r: 0.002 });
    // seat cushion on the top
    k.soft('cushion', p.cushion, W - 0.02, 0.06, D - 0.04, 0.02, 0, H + 0.03, 0, { puff: 0.006 });
    return finish(k);
  },
});

const mobileShelving = w$({
  id: 'wpx-mobile-shelving', ko: '이동식 문서 보관 서가(핸들식)', en: 'Mobile archive shelving (handwheel)',
  params: [
    P.int('units', '이동 서가 수', 'Carriages', 4, 2, 6),
    P.len('length', '서가 길이', 'Run length', 1.5, 0.9, 2.4),
    P.len('height', '높이', 'Height', 2.1, 1.6, 2.4),
    P.int('shelves', '단 수', 'Shelves', 6, 4, 7),
    P.mat('body', '본체', 'Body', 'paint-grey-matte', PAINT),
    P.mat('end', '측판', 'End panels', 'wood-white', WOOD),
  ],
  tags: ['mobile shelving', 'compact shelving', 'archive', 'rolling shelves', '이동식 서가', '모빌랙', '문서 보관', '아카이브'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.units, L = p.length, H = p.height, cw = 0.6, aisle = 0.8;
    const total = n * cw + aisle;
    // floor rails across the run
    for (const z of [-L / 2 + 0.15, 0, L / 2 - 0.15]) k.box('rails', 'metal-steel', total + 0.1, 0.015, 0.05, 0, 0.0075, z, { r: 0.002 });
    let x = -total / 2;
    for (let i = 0; i < n; i++) {
      if (i === Math.floor(n / 2)) x += aisle;
      const cx = x + cw / 2;
      k.box('body', p.body, cw - 0.02, 0.06, L - 0.02, cx, 0.045, 0, { r: 0.003 });
      // double-sided shelving: centre spine + uprights + shelves
      k.box('body', p.body, 0.01, H - 0.08, L - 0.06, cx, 0.08 + (H - 0.08) / 2, 0, { r: 0 });
      for (const zz of [-L / 2 + 0.03, L / 2 - 0.05]) k.box('body', p.body, cw - 0.04, H - 0.08, 0.02, cx, 0.08 + (H - 0.08) / 2, zz, { r: 0.002 });
      const gapY = (H - 0.14) / (p.shelves - 1), fh = Math.min(0.3, gapY - 0.05);
      const nb = Math.floor((L - 0.2) / (k.hi ? 0.075 : 0.2));
      for (let s = 0; s < p.shelves; s++) {
        const y = 0.1 + s * gapY;
        k.box('body', p.body, cw - 0.04, 0.02, L - 0.08, cx, y, 0, { r: 0.002 });
        // box files standing in a row on both faces, spines outwards (every few left out)
        if (s < p.shelves - 1) for (const sx of [-1, 1]) for (let b = 0; b < nb; b++) {
          if ((b * 7 + s * 3 + i) % 9 === 0) continue;
          const bz = -(L - 0.2) / 2 + ((b + 0.5) / nb) * (L - 0.2);
          k.box((b + s) % 3 ? 'files' : 'files2', (b + s) % 3 ? 'book-cream' : 'book-blue', 0.24, fh * (0.85 + 0.15 * ((b + s) % 2)), (L - 0.2) / nb - 0.008, cx + sx * 0.15, y + 0.01 + fh * (0.85 + 0.15 * ((b + s) % 2)) / 2, bz, { r: 0 });
        }
      }
      // front end panel (+z) with a three-spoke handwheel
      k.box('end', p.end, cw - 0.01, H, 0.025, cx, H / 2, L / 2 - 0.0125 + 0.01, { r: 0.004 });
      const wy = H * 0.5, wz = L / 2 + 0.06;
      k.add('wheel', 'metal-chrome', new THREE.TorusGeometry(0.11, 0.01, k.seg(8, 4), k.seg(28, 10)).translate(cx, wy, wz));
      k.cyl('wheel', 'metal-chrome', 0.022, 0.022, 0.04, cx, wy, L / 2 + 0.02, { rx: PI / 2, segs: k.seg(14, 6) });
      for (let j = 0; j < 3; j++) { const a = (j / 3) * PI * 2; k.rod('wheel', 'metal-chrome', [cx, wy, wz], [cx + Math.cos(a) * 0.11, wy + Math.sin(a) * 0.11, wz], 0.006); }
      k.cyl('wheel', 'plastic-black', 0.012, 0.012, 0.05, cx + 0.11, wy, wz, { rx: PI / 2, segs: k.seg(10, 5) });
      x += cw;
    }
    return finish(k);
  },
});

const keyCabinet = w$({
  id: 'wpx-key-cabinet', placement: 'wall', elevation: 1.3, ko: '벽걸이 열쇠 보관함', en: 'Wall key cabinet',
  params: [
    P.int('hooks', '열쇠 고리 수', 'Hooks', 30, 10, 60),
    P.mat('body', '본체', 'Body', 'paint-grey-matte', PAINT),
    P.bool('window', '창', 'Window', true),
  ],
  tags: ['key cabinet', 'key box', 'key safe', 'key storage', '열쇠 보관함', '키 박스', '키 캐비닛', '열쇠함'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const cols = Math.ceil(Math.sqrt(p.hooks * 1.2)), rows = Math.ceil(p.hooks / cols);
    const W = Math.max(0.3, cols * 0.045 + 0.06), H = Math.max(0.35, rows * 0.07 + 0.1), D = 0.08;
    shell(k, 'body', p.body, W, H, D - 0.015, 0, 0, -0.0075, 0.012);
    const zf = D / 2 - 0.0075;
    if (p.window) {
      k.panel('door', p.body, frameShape(W, H, 0.035, 0.035), 0.015, 0, H / 2, zf);
      k.box('glass', 'glass-clear', W - 0.06, H - 0.06, 0.004, 0, H / 2, zf, { r: 0 });
    } else k.box('door', p.body, W, H, 0.015, 0, H / 2, zf, { r: 0.003 });
    // inside: hooks with coloured key tags in a grid (visible through the window)
    for (let i = 0; i < p.hooks; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = -W / 2 + 0.03 + 0.045 * (c + 0.5), y = H - 0.07 - r * 0.07;
      k.rod('hooks', 'metal-chrome', [x, y, -D / 2 + 0.01], [x, y, 0.0], 0.0015, { segs: 4 });
      k.box(i % 3 ? 'tags' : 'tags2', i % 3 ? 'plastic-white' : 'paint-blue-matte', 0.016, 0.03, 0.003, x, y - 0.025, -0.002, { r: 0.001 });
    }
    k.cyl('lock', 'metal-chrome', 0.01, 0.01, 0.01, W / 2 - 0.018, H / 2, zf + 0.0075, { rx: PI / 2, segs: k.seg(12, 6) });
    return finish(k);
  },
});

/* ------------------------------------------------- 6. boards and tech */

const glassWhiteboard = w$({
  id: 'wpx-glass-whiteboard', placement: 'wall', elevation: 0.9, ko: '벽 유리 화이트보드', en: 'Glass whiteboard (wall)',
  params: [
    P.len('width', '폭', 'Width', 1.8, 0.9, 2.4),
    P.len('height', '높이', 'Height', 1.0, 0.6, 1.2),
    P.color('back', '배면 색', 'Back colour', '#f4f4f2'),
    P.bool('tray', '마커 트레이', 'Marker tray', true),
  ],
  tags: ['glass whiteboard', 'glass board', 'whiteboard', 'dry erase', '유리 화이트보드', '유리 보드', '화이트보드', '칠판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height;
    // back-painted tempered glass on four chrome standoffs
    k.box('back', 'paint-white-gloss', W - 0.004, H - 0.004, 0.002, 0, H / 2 + 0.06, -0.006, { r: 0, overrides: { color: p.back } });
    k.box('glass', 'glass-clear', W, H, 0.006, 0, H / 2 + 0.06, -0.001, { r: 0.002 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = sx * (W / 2 - 0.05), y = H / 2 + 0.06 + sy * (H / 2 - 0.05);
      k.cyl('standoffs', 'metal-chrome', 0.012, 0.012, 0.03, x, y, -0.035, { rx: PI / 2, segs: k.seg(14, 6) });
      k.cyl('standoffs', 'metal-chrome', 0.013, 0.013, 0.008, x, y, 0.002, { rx: PI / 2, segs: k.seg(14, 6) });
    }
    if (p.tray) {
      // aluminium marker tray below with markers and an eraser
      k.box('tray', 'metal-aluminium', Math.min(0.6, W * 0.4), 0.012, 0.07, 0, 0.006, -0.0, { r: 0.002 });
      k.box('tray', 'metal-aluminium', Math.min(0.6, W * 0.4), 0.03, 0.006, 0, 0.015, 0.032, { r: 0.002 });
      k.box('tray', 'metal-aluminium', Math.min(0.6, W * 0.4), 0.05, 0.006, 0, 0.025, -0.036, { r: 0.002 });
      ['plastic-black', 'paint-blue-matte', 'paint-green-matte'].forEach((m, i) => k.cyl('markers', m, 0.008, 0.008, 0.13, -0.15 + i * 0.03, 0.02, 0.0, { rz: PI / 2, segs: k.seg(10, 5) }));
      k.box('markers', 'plastic-grey', 0.12, 0.03, 0.045, 0.14, 0.027, 0.0, { r: 0.006 });
    }
    return finish(k);
  },
});

const flipchart = w$({
  id: 'wpx-flipchart', ko: '플립차트 이젤', en: 'Flipchart easel',
  params: [
    P.len('height', '높이', 'Height', 1.9, 1.6, 2.0),
    P.mat('board', '보드', 'Board', 'paint-white-gloss', PAINT),
    P.mat('legs', '다리', 'Legs', 'metal-aluminium', METAL),
    P.int('pages', '넘긴 장', 'Pages flipped', 3, 0, 8),
  ],
  tags: ['flipchart', 'easel', 'flip chart', 'presentation', '플립차트', '이젤', '괘도', '발표'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, bw = 0.7, bh = 1.0, by = H - bh / 2 - 0.05, lean = 0.12;
    // A-frame: two front legs, one rear leg
    for (const s of [-1, 1]) k.rod('legs', p.legs, [s * 0.38, 0, 0.12], [s * 0.3, H - 0.05, 0.12 - lean], 0.014);
    k.rod('legs', p.legs, [0, 0, -0.5], [0, by + 0.1, 0.12 - lean * 0.6 - 0.04], 0.013);
    for (const s of [-1, 1]) k.cyl('legs', 'rubber-black', 0.017, 0.017, 0.02, s * 0.38, 0, 0.12, { segs: k.seg(10, 5) });
    // board tilted back slightly with a pad of paper clamped at the top
    const rx = -Math.atan2(lean, H);
    const bz = 0.12 - lean * (by / H) + 0.03;
    k.box('board', p.board, bw, bh, 0.015, 0, by, bz, { r: 0.004, rx });
    k.box('paper', 'paper', bw - 0.04, bh - 0.04, 0.008, 0, by - 0.01, bz + 0.012, { r: 0.001, rx });
    k.box('legs', p.legs, bw + 0.02, 0.04, 0.035, 0, by + bh / 2 - 0.02, bz + 0.015, { r: 0.006, rx });
    // flipped sheets folded over the top clamp and hanging down the back of the board
    for (let i = 0; i < p.pages; i++) k.box('paper', 'paper', bw - 0.04, 0.35 - i * 0.02, 0.002, 0, by + bh / 2 - 0.02 - (0.35 - i * 0.02) / 2, bz - 0.012 - i * 0.003, { r: 0, rx });
    // marker tray
    k.box('legs', p.legs, bw, 0.02, 0.07, 0, by - bh / 2 - 0.01, bz + 0.03, { r: 0.004 });
    k.cyl('markers', 'paint-blue-matte', 0.008, 0.008, 0.13, -0.1, by - bh / 2 + 0.008, bz + 0.03, { rz: PI / 2, segs: k.seg(10, 5) });
    return finish(k);
  },
});

const signageKiosk = w$({
  id: 'wpx-signage-kiosk', ko: '디지털 사이니지 키오스크', en: 'Digital signage kiosk',
  params: [
    P.num('screenIn', '화면(인치)', 'Screen (in)', 49, 32, 55, 1),
    P.mat('body', '본체', 'Body', 'paint-white-matte', PAINT),
    P.mat('base', '받침', 'Base', 'metal-steel', METAL),
  ],
  tags: ['digital signage', 'kiosk', 'totem', 'information display', '디지털 사이니지', '키오스크', '안내 단말', '광고판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const diag = p.screenIn * 0.0254, sw = diag * 0.4903, sh = diag * 0.8716; // portrait
    const W = sw + 0.1, H = sh + 0.55, D = 0.09;
    k.box('base', p.base, W + 0.1, 0.03, 0.42, 0, 0.015, 0, { r: 0.006, segs: 2 });
    k.rbox('body', p.body, W, H, D, 0.02, 0, 0.03 + H / 2, -0.02, { segs: k.seg(3, 1) });
    const sy = 0.03 + H - 0.08 - sh / 2, zf = -0.02 + D / 2;
    k.box('screen', 'screen-black', sw + 0.01, sh + 0.01, 0.004, 0, sy, zf + 0.001, { r: 0.002 });
    k.box('display', 'light-cool', sw - 0.004, sh - 0.004, 0.002, 0, sy, zf + 0.0035, { r: 0 });
    // speaker grille + camera dot + vent slots lower down
    k.box('grille', 'paint-black-matte', sw * 0.6, 0.03, 0.004, 0, 0.03 + 0.25, zf + 0.001, { r: 0.004 });
    k.cyl('grille', 'paint-black-matte', 0.006, 0.006, 0.004, 0, 0.03 + H - 0.035, zf, { rx: PI / 2, segs: 8 });
    return finish(k);
  },
});

const bookingPanel = w$({
  id: 'wpx-room-booking-panel', placement: 'wall', elevation: 1.35, ko: '회의실 예약 패널', en: 'Meeting-room booking panel',
  params: [
    P.pick('status', '상태 표시', 'Status light', 'free', [['free', '사용 가능(녹색)', 'Free (green)'], ['busy', '사용 중(빨강)', 'Busy (red)']]),
    P.mat('frame', '테두리', 'Frame', 'plastic-white', 'plastic'),
  ],
  tags: ['room booking', 'booking panel', 'meeting room display', 'room scheduler', '회의실 예약', '예약 패널', '도어 사이니지', '회의실 표시'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // wall plate, tablet with status LED bars on both sides
    k.box('plate', 'metal-aluminium', 0.2, 0.15, 0.008, 0, 0.09, -0.016, { r: 0.002 });
    k.rbox('frame', p.frame, 0.27, 0.18, 0.025, 0.008, 0, 0.09, 0.0, { segs: k.seg(3, 1) });
    k.box('screen', 'screen-black', 0.22, 0.14, 0.003, 0, 0.09, 0.0125, { r: 0.002 });
    k.box('display', 'light-cool', 0.21, 0.13, 0.002, 0, 0.09, 0.0145, { r: 0 });
    const color = p.status === 'busy' ? '#ff3b30' : '#2ecc71';
    for (const s of [-1, 1]) k.box('display', 'light-cool', 0.006, 0.15, 0.004, s * 0.135, 0.09, 0.006, { r: 0.002, overrides: { color } });
    return finish(k);
  },
});

/* ---------------------------------------------------- 7. small storage */

const pedestalCushion = w$({
  id: 'wpx-pedestal-cushion', ko: '쿠션 상판 이동 서랍', en: 'Mobile pedestal with seat cushion',
  params: [
    P.len('depth', '깊이', 'Depth', 0.55, 0.45, 0.6),
    P.mat('body', '본체', 'Body', 'paint-white-matte', PAINT),
    P.mat('front', '서랍 앞판', 'Drawer fronts', 'paint-white-matte', PAINT),
    P.mat('cushion', '쿠션', 'Cushion', 'fabric-mustard', FABRIC),
  ],
  tags: ['pedestal', 'seat pedestal', 'mobile drawer', 'cushion pedestal', '이동 서랍', '쿠션 서랍', '앉는 서랍장', '사무용 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.42, d = p.depth, y0 = 0.05, H = 0.56;
    addCabinet(k, { w: W, h: H - y0, d, y0, rows: [{ h: 0.6, n: 1, type: 'drawer' }, { h: 0.4, n: 1, type: 'drawer' }], body: p.body, front: p.front, base: 'none', handle: 'edge', handleMat: 'metal-aluminium', roles: { body: 'body', front: 'fronts', handle: 'handles' } });
    // grab handle recess on the side + cushion with piping
    k.box('handles', 'paint-black-matte', 0.004, 0.03, 0.18, W / 2 + 0.001, H - 0.05, 0, { r: 0.001 });
    k.soft('cushion', p.cushion, W, 0.07, d, 0.025, 0, H + 0.035, 0, { puff: 0.008 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(k, sx * (W / 2 - 0.05), sz * (d / 2 - 0.06), y0);
    return finish(k);
  },
});

const fireCabinet = w$({
  id: 'wpx-fire-cabinet', placement: 'wall', elevation: 0.6, ko: '소화기 보관함', en: 'Fire extinguisher cabinet',
  params: [
    P.color('color', '색', 'Colour', '#c62828'),
    P.bool('window', '유리창', 'Glass window', true),
    P.len('height', '높이', 'Height', 0.75, 0.6, 0.9),
  ],
  tags: ['fire extinguisher', 'fire cabinet', 'safety', 'emergency', '소화기', '소화기함', '소방', '안전'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 0.36, H = p.height, D = 0.2, red = { color: p.color };
    shell(k, 'body', 'paint-white-gloss', W, H, D - 0.02, 0, 0, -0.01, 0.015, { overrides: red });
    // inside: extinguisher (body, valve head, hose)
    const er = 0.075, eh = H * 0.62;
    k.cyl('ext', 'paint-white-gloss', er, er, eh, 0, 0.04, -0.01, { segs: k.seg(20, 8), overrides: { color: '#d32f2f' } });
    k.sphere('ext', 'paint-white-gloss', er, 0, 0.04 + eh, -0.01, { segs: k.seg(20, 8), rings: k.seg(8, 4), thetaLength: PI / 2, overrides: { color: '#d32f2f' } });
    k.cyl('head', 'plastic-black', 0.018, 0.022, 0.07, 0, 0.04 + eh + er * 0.8, -0.01, { segs: k.seg(12, 6) });
    k.box('head', 'plastic-black', 0.12, 0.012, 0.025, 0.03, 0.04 + eh + er * 0.8 + 0.06, -0.01, { r: 0.003 });
    k.tube('head', 'rubber-black', [[0.02, 0.04 + eh + er, 0.02], [0.08, 0.04 + eh * 0.8, 0.04], [0.09, 0.04 + eh * 0.4, 0.04]], 0.009);
    k.box('label', 'paper', 0.08, 0.1, 0.004, 0, 0.04 + eh * 0.55, er - 0.008, { r: 0.001 });
    // door: framed window or solid, with a printed sign + latch
    const zf = D / 2 - 0.01;
    if (p.window) {
      k.panel('door', 'paint-white-gloss', frameShape(W, H, 0.04, 0.05), 0.02, 0, H / 2, zf, { overrides: red });
      k.box('glass', 'glass-clear', W - 0.08, H - 0.1, 0.004, 0, H / 2, zf, { r: 0 });
    } else k.box('door', 'paint-white-gloss', W, H, 0.02, 0, H / 2, zf, { r: 0.003, overrides: red });
    k.box('sign', 'paper', W - 0.1, 0.06, 0.003, 0, H - 0.025, zf + 0.011, { r: 0.001 });
    k.box('latch', 'metal-chrome', 0.02, 0.06, 0.015, W / 2 - 0.03, H / 2, zf + 0.015, { r: 0.004 });
    return finish(k);
  },
});

const supplyCabinet = w$({
  id: 'wpx-supply-cabinet', ko: '사무용품 보관장', en: 'Stationery supply cabinet',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.7, 1.2),
    P.len('height', '높이', 'Height', 1.8, 1.2, 2.0),
    P.pick('doors', '문', 'Doors', 'glass', [['glass', '유리문', 'Glass'], ['solid', '철판문', 'Solid steel']]),
    P.mat('body', '본체', 'Body', 'paint-grey-matte', PAINT),
  ],
  tags: ['supply cabinet', 'stationery cabinet', 'steel cabinet', 'storage cabinet', '사무용품 보관장', '비품장', '철제 캐비닛', '문구 보관'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, H = p.height, D = 0.45;
    // open steel carcass on a recessed plinth, two framed (glass) or solid doors with bar pulls
    const pl = 0.05, ft = 0.02, cd = D - ft;
    k.box('plinth', 'paint-black-matte', W - 0.03, pl, cd - 0.05, 0, pl / 2, -ft / 2 - 0.02, { r: 0.002 });
    shell(k, 'body', p.body, W, H - pl, cd, 0, pl, -ft / 2, 0.02);
    const dw = W / 2 - 0.003, dh = H - pl - 0.004, dy = pl + (H - pl) / 2, zf = D / 2 - ft / 2;
    for (const s of [-1, 1]) {
      const dx = s * W / 4;
      if (p.doors === 'glass') {
        k.panel('doors', p.body, frameShape(dw, dh, 0.05, 0.06), ft, dx, dy, zf);
        k.box('glass', 'glass-clear', dw - 0.096, dh - 0.116, 0.004, dx, dy, zf - 0.002, { r: 0 });
      } else {
        k.box('doors', p.body, dw, dh, ft, dx, dy, zf, { r: 0.002 });
        for (let i = 0; i < 3; i++) k.box('handles', 'paint-black-matte', dw * 0.5, 0.006, 0.003, dx, H - 0.15 - i * 0.02, zf + ft / 2, { r: 0 });
      }
      addHandle(k, 'handles', 'metal-chrome', 'bar', dx - s * (dw / 2 - 0.05), H * 0.5, zf + ft / 2, { len: 0.18, vertical: true });
    }
    // shelves with supplies: paper reams, box files, a tray of pens (seen through the glass)
    const ns = Math.max(3, Math.round((H - 0.1) / 0.38));
    for (let i = 1; i < ns; i++) {
      const y = 0.05 + (i / ns) * (H - 0.1);
      k.box('body', p.body, W - 0.04, 0.012, D - 0.08, 0, y, -0.03, { r: 0.001 });
      const kind = i % 3;
      if (kind === 1) for (let j = 0; j < 3; j++) k.box('supplies', 'paper', 0.21, 0.05 * (1 + (j % 2)), 0.3, -W / 2 + 0.15 + j * 0.24, y + 0.006 + 0.025 * (1 + (j % 2)), -0.04, { r: 0.002 });
      else if (kind === 2) for (let j = 0; j < Math.floor((W - 0.1) / 0.09); j++) k.box('files', ['book-blue', 'book-red', 'book-cream'][j % 3], 0.08, 0.3, 0.3, -W / 2 + 0.08 + j * 0.09, y + 0.156, -0.05, { r: 0.003 });
      else k.box('supplies', 'plastic-white', W * 0.5, 0.08, 0.28, 0, y + 0.046, -0.04, { r: 0.006 });
    }
    // vent louvres on the sides
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.box('handles', 'paint-black-matte', 0.003, 0.008, 0.2, s * (W / 2 + 0.001), H - 0.2 - i * 0.03, -0.02, { r: 0 });
    return finish(k);
  },
});

export const ITEMS = [
  benchSitStand, hotDesk, desWave, receptionCurved, receptionAccessible, foldingTable, confU, confSquare, huddleTable, standingBar,
  acousticScreen, foldingScreen, slatDivider, glassPartitionDoor, deskScreenClamp, smartLockers, toteCubbies, storageTower,
  mobileShelving, keyCabinet, glassWhiteboard, flipchart, signageKiosk, bookingPanel, pedestalCushion, fireCabinet, supplyCabinet,
];
