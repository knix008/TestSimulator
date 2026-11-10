// More study & office items: desks (standing, executive, writing, bureau, reception), meeting
// tables, chairs (executive, gaming, conference, guest, kneeling, drafting stool), storage
// (lateral filing, sliding cupboard, barrister & glass bookcases, safe), boards (pin, whiteboards),
// devices (printer, copier, shredder, phone, PC tower, all-in-one, dual monitor arm), desk
// accessories, phone booth, footrest. Plus preset variants of office.js entries.
// See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, item, P, OPT, variant, roundRect, ellipse, frameShape, addCabinet, addLegs, addHandle, pillowGeo, T, rng } from './helpers.js';
import { finish } from './kitchen.js';
import { ITEMS as BASE } from './office.js';
import { addBooks } from './living.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const byId = (id) => BASE.find((e) => e.id === id);
void item; void OPT;

/* --------------------------------------------------------------- helpers */

/** Prism across x (from x0 to x0 + width) from a side profile [[z, y], …] (any winding). */
function sideExtrude(k, role, mat, pts, width, x0, o = {}) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  const bevel = o.bevel ?? 0.003;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, width - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: k.hi ? 2 : 1, curveSegments: 6 });
  geo.translate(0, 0, bevel);
  geo.rotateY(PI / 2);
  geo.translate(x0, 0, 0);
  return k.add(role, mat, geo, o);
}

/** 5-star base with twin-wheel casters + gas lift up to `top`. */
function starBase(k, mat, { R = 0.31, top = 0.42, liftMat = 'plastic-black' } = {}) {
  k.cyl('base', mat, 0.04, 0.05, 0.06, 0, 0.075, 0, { segs: k.seg(20, 8) });
  for (let i = 0; i < 5; i++) {
    const a = PI / 2 + (i / 5) * PI * 2, c = Math.cos(a), s = Math.sin(a);
    k.rod('base', mat, [c * 0.03, 0.105, s * 0.03], [c * R, 0.085, s * R], 0.016, { r2: 0.022, segs: k.seg(10, 5) });
    k.sphere('base', mat, 0.016, c * R, 0.085, s * R, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    const tx = -s, tz = c;
    k.box('casters', 'plastic-black', 0.035, 0.03, 0.045, c * R, 0.06, s * R, { r: 0.008, segs: 2, ry: -a });
    for (const side of [-1, 1]) {
      const wx = c * (R + 0.01) + tx * side * 0.012, wz = s * (R + 0.01) + tz * side * 0.012;
      k.rod('casters', 'plastic-black', [wx - tx * 0.008, 0.025, wz - tz * 0.008], [wx + tx * 0.008, 0.025, wz + tz * 0.008], 0.025, { segs: k.seg(16, 6) });
    }
  }
  k.cyl('lift', 'metal-chrome', 0.014, 0.014, top - 0.12, 0, 0.1, 0, { segs: k.seg(14, 6) });
  k.cyl('lift', liftMat, 0.025, 0.028, Math.min(0.16, (top - 0.1) * 0.5), 0, 0.11, 0, { segs: k.seg(16, 6) });
}

/** Hollow carcass (sides, top, bottom, back) with its front open at z = d/2. */
function carcass(k, mat, w, h, d, { y0 = 0, t = 0.02, back = mat, role = 'frame' } = {}) {
  for (const s of [-1, 1]) k.box(role, mat, t, h, d, s * (w / 2 - t / 2), y0 + h / 2, 0, { r: 0.002 });
  k.box(role, mat, w - 2 * t, t, d, 0, y0 + h - t / 2, 0, { r: 0.0015 });
  k.box(role, mat, w - 2 * t, t, d, 0, y0 + t / 2, 0, { r: 0.0015 });
  k.box('back', back, w - 2 * t + 0.002, h - 2 * t + 0.002, 0.008, 0, y0 + h / 2, -d / 2 + 0.004, { r: 0 });
}

const TOPS = 'wood';

/* ----------------------------------------------------------------- desks */

const standingDesk = mk({
  id: 'desk-standing', category: 'office', ko: '모션 데스크(높이조절)', en: 'Standing desk (height adjustable)',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.0, 2.0),
    P.len('depth', '깊이', 'Depth', 0.7, 0.6, 0.8),
    P.len('height', '높이', 'Height', 0.74, 0.62, 1.25),
    P.mat('top', '상판', 'Top', 'wood-oak', TOPS),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.bool('tray', '케이블 트레이', 'Cable tray', true),
  ],
  tags: ['standing desk', 'height adjustable desk', 'sit stand desk', '모션데스크', '높이조절 책상', '스탠딩 데스크'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p, t = 0.025, fm = p.frame;
    k.slab('top', p.top, roundRect(w, d, 0.012), t, h - t, { bevel: 0.003 });
    const lx = w / 2 - 0.13, under = h - t;
    for (const s of [-1, 1]) {
      const x = s * lx;
      k.box('frame', fm, 0.07, 0.035, d - 0.05, x, 0.0175, 0, { r: 0.01, segs: 2 });
      for (const z of [-1, 1]) k.cyl('feet', 'rubber-black', 0.014, 0.014, 0.006, x, -0.004, z * (d / 2 - 0.05), { segs: 8 });
      const lowH = Math.min(0.5, (under - 0.035 - 0.04) * 0.62);
      k.box('frame', fm, 0.085, lowH, 0.065, x, 0.035 + lowH / 2, 0, { r: 0.006, segs: 2 });
      k.box('frame', fm, 0.07, under - 0.035 - 0.03, 0.05, x, 0.035 + (under - 0.065) / 2, 0, { r: 0.004, segs: 2 });
      k.box('frame', fm, 0.06, 0.03, d - 0.1, x, under - 0.015, 0, { r: 0.004, segs: 2 });
    }
    k.box('frame', fm, 2 * lx - 0.07, 0.05, 0.04, 0, under - 0.04, 0, { r: 0.004, segs: 2 });
    // hand control at the front right, cable tray at the back
    k.box('control', 'plastic-black', 0.13, 0.022, 0.05, w / 2 - 0.3, under - 0.011, d / 2 - 0.045, { r: 0.006 });
    k.box('display', 'light-cool', 0.03, 0.01, 0.002, w / 2 - 0.3, under - 0.011, d / 2 - 0.0195, { r: 0 });
    if (p.tray) k.box('control', 'metal-black', Math.min(1.0, w * 0.6), 0.08, 0.12, 0, under - 0.05, -d / 2 + 0.11, { r: 0.004 });
    return finish(k);
  },
});

const executiveDesk = mk({
  id: 'desk-executive', category: 'office', ko: '임원용 책상', en: 'Executive desk',
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.5, 2.4),
    P.len('depth', '깊이', 'Depth', 0.9, 0.75, 1.0),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.bool('inlay', '가죽 패드', 'Leather inlay', true),
    P.mat('leather', '가죽', 'Leather', 'leather-black', 'leather'),
  ],
  tags: ['executive desk', 'office desk', 'ceo desk', '임원 책상', '중역 책상', '사장 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.76, t = 0.045;
    k.slab('top', p.wood, roundRect(w, d, 0.01), t, h - t, { bevel: 0.008 });
    if (p.inlay) k.slab('inlay', p.leather, roundRect(Math.min(1.0, w * 0.55), d * 0.55, 0.01), 0.003, h - 0.0015, { z: 0.08, bevel: 0.001 });
    const pw = 0.46, pd = d - 0.1, ph = h - t;
    const rows = [[{ h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 1, type: 'drawer' }], [{ h: 0.62, n: 1, type: 'drawer' }, { h: 0.38, n: 1, type: 'drawer' }]];
    [-1, 1].forEach((s, i) => addCabinet(k, {
      w: pw, h: ph, d: pd, x: s * (w / 2 - pw / 2 - 0.03), z: -0.02, rows: rows[i], body: p.wood, front: p.wood, base: 'plinth', plinth: 0.06,
      handle: 'bar', handleMat: 'metal-brass', roles: { body: 'frame', front: 'fronts', handle: 'handles' },
    }));
    // modesty panel and a pencil drawer between the pedestals
    const mid = w - 2 * pw - 0.06;
    k.box('frame', p.wood, mid, 0.45, 0.025, 0, ph - 0.225, -d / 2 + 0.08, { r: 0.002 });
    k.box('fronts', p.wood, mid - 0.1, 0.07, 0.02, 0, ph - 0.04, d / 2 - 0.07, { r: 0.002 });
    k.box('frame', p.wood, mid, 0.075, d - 0.2, 0, ph - 0.04, -0.02, { r: 0.002 });
    addHandle(k, 'handles', 'metal-brass', 'bar', 0, ph - 0.04, d / 2 - 0.06, { len: 0.14 });
    return finish(k);
  },
});

const writingDesk = mk({
  id: 'desk-writing', category: 'office', ko: '서랍 책상(원목)', en: 'Writing desk with drawers',
  params: [
    P.len('width', '폭', 'Width', 1.1, 0.8, 1.5),
    P.len('depth', '깊이', 'Depth', 0.55, 0.45, 0.7),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'),
    P.mat('front', '서랍', 'Drawers', 'wood-oak', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', [['knob', '노브', 'Knob'], ['bar', '바', 'Bar'], ['cup', '컵', 'Cup']]),
  ],
  tags: ['writing desk', 'wooden desk', 'study desk', '원목 책상', '서랍 책상', '공부 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.76, t = 0.025, ah = 0.12, inset = 0.045;
    k.slab('top', p.wood, roundRect(w, d, 0.006), t, h - t, { bevel: 0.004 });
    addLegs(k, 'legs', p.wood, 'tapered', w, d, h - t, { inset, r: 0.024, splay: 0.012 });
    const ay = h - t - ah / 2;
    for (const s of [-1, 1]) k.box('legs', p.wood, 0.02, ah, d - 2 * inset, s * (w / 2 - inset), ay, 0, { r: 0.002 });
    k.box('legs', p.wood, w - 2 * inset, ah, 0.02, 0, ay, -(d / 2 - inset), { r: 0.002 });
    const n = w > 1.0 ? 3 : 2, span = w - 2 * inset - 0.05, dw = span / n, zf = d / 2 - inset + 0.02;
    k.box('legs', p.wood, w - 2 * inset - 0.04, 0.012, d - 2 * inset, 0, h - t - ah, 0, { r: 0.001 });
    for (let i = 0; i < n; i++) {
      const cx = -span / 2 + dw * (i + 0.5);
      k.box('fronts', p.front, dw - 0.004, ah - 0.012, 0.02, cx, ay, zf - 0.01, { r: 0.002 });
      addHandle(k, 'handles', 'metal-brass', p.handle, cx, ay, zf, { len: 0.1 });
    }
    return finish(k);
  },
});

const bureau = mk({
  id: 'desk-secretary', category: 'office', ko: '사무용 뷰로(경사 덮개 책상)', en: 'Secretary desk (bureau)',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.7, 1.1),
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'knob', [['knob', '노브', 'Knob'], ['bar', '바', 'Bar']]),
  ],
  tags: ['secretary desk', 'bureau', 'writing bureau', 'slant front desk', '뷰로', '경사 책상', '앤틱 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.5, chest = 0.75, top = 1.05;
    addCabinet(k, {
      w, h: chest, d, rows: [{ h: 0.36, n: 1, type: 'drawer' }, { h: 0.32, n: 1, type: 'drawer' }, { h: 0.32, n: 1, type: 'drawer' }],
      body: p.wood, front: p.wood, base: 'legs', legH: 0.1, legStyle: 'square', legMat: p.wood, handle: p.handle, handleMat: 'metal-brass',
      roles: { body: 'frame', front: 'fronts', handle: 'handles' },
    });
    // slant-front upper case: wedge across the width, fall front on the slope
    const zb = -d / 2, zt = -d / 2 + 0.24, zf = d / 2 - 0.01, y0 = chest, lip = 0.05;
    sideExtrude(k, 'frame', p.wood, [[zb, y0], [zf, y0], [zf, y0 + lip], [zt, top], [zb, top]], w, -w / 2, { bevel: 0.003 });
    const dy = top - y0 - lip, dz = zt - zf, L = Math.hypot(dy, dz), th = Math.atan2(dz, dy);
    const ny = -dz / L, nz = dy / L, off = 0.011;
    const cy = y0 + lip + dy / 2 + ny * off, cz = zf + dz / 2 + nz * off;
    k.box('fronts', p.wood, w - 0.05, L - 0.01, 0.02, 0, cy, cz, { r: 0.003, rx: th });
    // lock escutcheon + two knobs on the fall front
    const kz = cz + nz * 0.011, ky = cy + ny * 0.011;
    k.box('handles', 'metal-brass', 0.03, 0.04, 0.004, 0, ky, kz, { r: 0.002, rx: th });
    for (const s of [-1, 1]) k.sphere('handles', 'metal-brass', 0.012, s * w * 0.3, ky - (dy / L) * 0.05, kz - (dz / L) * 0.05, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    return finish(k);
  },
});

const receptionDesk = mk({
  id: 'reception-desk', category: 'office', ko: '안내 데스크(리셉션)', en: 'Reception desk',
  params: [
    P.len('width', '폭', 'Width', 2.0, 1.4, 3.0),
    P.mat('front', '전면', 'Front', 'paint-white-gloss', 'paint'),
    P.mat('ledge', '상단 선반', 'Counter top', 'quartz-white', 'stone'),
    P.mat('desk', '작업대', 'Work top', 'wood-oak', 'wood'),
  ],
  tags: ['reception desk', 'front desk', 'counter', '리셉션 데스크', '안내 데스크', '카운터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.8, H = 1.1, h = 0.74, plinth = 0.08;
    // high front screen with a recessed plinth and a glowing strip under the ledge
    k.box('front', p.front, w, H - plinth - 0.03, 0.04, 0, plinth + (H - plinth - 0.03) / 2, d / 2 - 0.02, { r: 0.004, segs: 2 });
    k.box('plinth', 'paint-black-matte', w - 0.04, plinth, 0.03, 0, plinth / 2, d / 2 - 0.04, { r: 0.002 });
    // timber band across the front
    k.box('desk', p.desk, w - 0.08, 0.22, 0.012, 0, plinth + 0.42, d / 2 + 0.006, { r: 0.003 });
    for (const s of [-1, 1]) k.box('front', p.front, 0.04, H - 0.03, d, s * (w / 2 - 0.02), (H - 0.03) / 2, 0, { r: 0.004, segs: 2 });
    k.box('ledge', p.ledge, w + 0.04, 0.03, 0.34, 0, H - 0.015, d / 2 - 0.12, { r: 0.006, segs: 2 });
    k.box('light', 'light-warm', w - 0.1, 0.006, 0.012, 0, H - 0.034, d / 2 + 0.035, { r: 0 });
    k.light(0, H - 0.05, d / 2 + 0.05, { intensity: 0.4, distance: 2 });
    // work top behind at desk height with a drawer pedestal
    k.box('desk', p.desk, w - 0.08, 0.03, d - 0.08, 0, h - 0.015, -0.03, { r: 0.004 });
    addCabinet(k, { w: 0.42, h: h - 0.03, d: d - 0.2, x: w / 2 - 0.27, z: -0.06, rows: [{ h: 0.4, n: 1, type: 'drawer' }, { h: 0.3, n: 1, type: 'drawer' }, { h: 0.3, n: 1, type: 'drawer' }], body: p.front, front: p.front, base: 'plinth', plinth: 0.06, handle: 'edge', handleMat: 'metal-aluminium', roles: { body: 'front', front: 'fronts', handle: 'handles' } });
    return finish(k);
  },
});

/* -------------------------------------------------------- meeting tables */

const meetingTable = mk({
  id: 'meeting-table', category: 'office', ko: '회의 테이블', en: 'Meeting table',
  params: [
    P.len('width', '길이', 'Length', 2.4, 1.6, 3.6),
    P.len('depth', '폭', 'Width', 1.2, 0.9, 1.4),
    P.mat('top', '상판', 'Top', 'wood-oak', TOPS),
    P.pick('base', '다리', 'Base', 'panel', [['panel', '판재 다리', 'Panel legs'], ['legs', '금속 4다리', 'Four metal legs']]),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.bool('cable', '배선 박스', 'Cable box', true),
  ],
  tags: ['meeting table', 'conference table', 'boardroom table', '회의 테이블', '회의실 테이블', '미팅 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.74, t = 0.03;
    k.slab('top', p.top, roundRect(w, d, 0.03), t, h - t, { bevel: 0.004 });
    const lh = h - t;
    if (p.base === 'panel') {
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - Math.min(0.45, w * 0.18));
        k.box('base', p.top, 0.05, lh, d - 0.35, x, lh / 2, 0, { r: 0.004, segs: 2 });
        k.box('base', p.metal, 0.06, 0.012, d - 0.33, x, 0.006, 0, { r: 0.003 });
      }
      k.box('base', p.metal, w - 2 * Math.min(0.45, w * 0.18), 0.06, 0.03, 0, lh - 0.05, 0, { r: 0.004 });
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('base', p.metal, 0.05, lh, 0.05, sx * (w / 2 - 0.12), lh / 2, sz * (d / 2 - 0.12), { r: 0.005, segs: 2 });
      for (const sz of [-1, 1]) k.box('base', p.metal, w - 0.29, 0.05, 0.03, 0, lh - 0.03, sz * (d / 2 - 0.12), { r: 0.004 });
      for (const sx of [-1, 1]) k.box('base', p.metal, 0.03, 0.05, d - 0.29, sx * (w / 2 - 0.12), lh - 0.03, 0, { r: 0.004 });
    }
    if (p.cable) {
      // flip-lid cable box flush in the top + cable spine to the floor
      k.slab('cablebox', 'metal-aluminium', roundRect(0.34, 0.14, 0.01), 0.004, h - 0.0015, { bevel: 0.001 });
      k.box('cablebox', 'plastic-black', 0.3, 0.001, 0.004, 0, h + 0.0027, 0, { r: 0 });
      k.box('base', p.metal, 0.08, lh - 0.08, 0.08, 0, (lh - 0.08) / 2, 0, { r: 0.01, segs: 2 });
    }
    return finish(k);
  },
});

const ovalTable = mk({
  id: 'meeting-table-oval', category: 'office', ko: '타원형 회의 테이블', en: 'Racetrack meeting table',
  params: [
    P.len('width', '길이', 'Length', 3.0, 2.0, 4.2),
    P.len('depth', '폭', 'Width', 1.2, 1.0, 1.5),
    P.mat('top', '상판', 'Top', 'wood-walnut', TOPS),
    P.mat('metal', '받침', 'Pedestals', 'metal-chrome', 'metal'),
  ],
  tags: ['oval meeting table', 'racetrack table', 'boardroom', '타원형 테이블', '회의 테이블', '회의실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.74, t = 0.035;
    k.slab('top', p.top, roundRect(w, d, d / 2 - 0.001), t, h - t, { bevel: 0.006, curveSegs: 32 });
    const n = w > 3.2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = n === 2 ? (i ? 1 : -1) * (w / 2 - d * 0.6) : (i - 1) * (w / 2 - d * 0.55);
      k.lathe('base', p.metal, [[0, 0], [0.32, 0], [0.33, 0.008], [0.3, 0.025], [0.09, 0.04], [0, 0.04]], x, 0, 0, { segs: k.seg(40, 12), scale: [1, 1, 0.8] });
      k.cyl('base', p.metal, 0.065, 0.075, h - t - 0.04 - 0.02, x, 0.04, 0, { segs: k.seg(24, 8) });
      k.box('base', p.metal, 0.4, 0.02, 0.3, x, h - t - 0.01, 0, { r: 0.004 });
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- chairs */

const executiveChair = mk({
  id: 'office-chair-executive', category: 'office', ko: '중역 의자(가죽 하이백)', en: 'Executive leather chair',
  params: [
    P.mat('leather', '가죽', 'Leather', 'leather-black', 'leather'),
    P.mat('metal', '베이스·팔걸이', 'Base & arms', 'metal-chrome', 'metal'),
  ],
  tags: ['executive chair', 'leather office chair', 'high back chair', '중역 의자', '가죽 의자', '사장 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    starBase(k, p.metal, { R: 0.33, top: 0.42 });
    k.box('frame', 'plastic-black', 0.24, 0.05, 0.26, 0, 0.42, 0, { r: 0.01, segs: 2 });
    // seat: thick leather pad with a rolled front edge
    k.soft('seat', p.leather, 0.54, 0.1, 0.52, 0.04, 0, 0.495, 0.03, { puff: 0.018, sag: 0.006 });
    // back: frame shell + three stacked padded sections + headrest roll, reclined
    const lean = -0.14, bz = -0.24, by = 0.56;
    const at = (v) => [by + Math.cos(lean) * v, bz + Math.sin(lean) * v];
    k.bentTube('frame', p.metal, [[0, 0.42, -0.1], [0, 0.45, -0.26], [0, 0.66, -0.31]], 0.022, 0.06);
    const [sy, sz] = at(0.42);
    k.soft('back', p.leather, 0.52, 0.86, 0.08, 0.035, 0, sy, sz - 0.03, { rx: lean, flat: 3 });
    for (const [v, hh] of [[0.12, 0.2], [0.33, 0.2], [0.54, 0.2]]) {
      const [y, z] = at(v);
      k.soft('seat', p.leather, 0.46, hh, 0.06, 0.03, 0, y, z + 0.03, { rx: lean, puff: 0.012 });
    }
    const [hy, hz] = at(0.76);
    k.soft('seat', p.leather, 0.42, 0.14, 0.07, 0.035, 0, hy, hz + 0.025, { rx: lean, puff: 0.015 });
    // chrome loop arms with leather pads
    for (const s of [-1, 1]) {
      k.bentTube('arms', p.metal, [[s * 0.2, 0.46, 0.18], [s * 0.3, 0.46, 0.18], [s * 0.31, 0.65, 0.12], [s * 0.31, 0.65, -0.12], [s * 0.27, 0.48, -0.16]], 0.012, 0.05);
      k.soft('seat', p.leather, 0.075, 0.035, 0.28, 0.015, s * 0.31, 0.67, 0.0, { flat: 3 });
    }
    return finish(k);
  },
});

const gamingChair = mk({
  id: 'gaming-chair', category: 'office', ko: '게이밍 의자', en: 'Gaming chair',
  params: [
    P.mat('cover', '커버', 'Cover', 'leather-black', 'leather'),
    P.color('accent', '포인트 색', 'Accent colour', '#b8322a'),
  ],
  tags: ['gaming chair', 'racing chair', 'pc chair', '게이밍 의자', '레이싱 의자', '컴퓨터 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const acc = { overrides: { color: p.accent } };
    starBase(k, 'plastic-black', { R: 0.34, top: 0.42 });
    k.box('frame', 'metal-black', 0.26, 0.05, 0.28, 0, 0.42, 0, { r: 0.01, segs: 2 });
    // bucket seat: flat centre + raised side bolsters
    k.soft('seat', p.cover, 0.36, 0.08, 0.5, 0.03, 0, 0.49, 0.03, { puff: 0.012, sag: 0.004 });
    for (const s of [-1, 1]) k.soft('accent', p.cover, 0.1, 0.12, 0.52, 0.04, s * 0.22, 0.5, 0.03, { rz: -s * 0.18, ...acc });
    // tall back with shoulder wings and a narrow head section
    const lean = -0.12, bz = -0.25, by = 0.55;
    const at = (v, z = 0) => [by + Math.cos(lean) * v - Math.sin(lean) * z, bz + Math.sin(lean) * v + Math.cos(lean) * z];
    let [y, z] = at(0.4);
    k.soft('seat', p.cover, 0.36, 0.8, 0.1, 0.04, 0, y, z, { rx: lean, puff: 0.01 });
    for (const s of [-1, 1]) {
      [y, z] = at(0.32, 0.02);
      k.soft('accent', p.cover, 0.1, 0.62, 0.12, 0.04, s * 0.22, y, z, { rx: lean, rz: s * 0.05, ...acc });
    }
    [y, z] = at(0.88);
    k.soft('seat', p.cover, 0.26, 0.2, 0.09, 0.04, 0, y, z - 0.005, { rx: lean });
    // head and lumbar pillows
    [y, z] = at(0.8, 0.07);
    k.add('pillow', p.cover, T(pillowGeo(0.24, 0.12, 0.07, k.seg(12, 6)), 0, y, z, lean, 0, 0));
    [y, z] = at(0.2, 0.08);
    k.add('pillow', p.cover, T(pillowGeo(0.3, 0.16, 0.08, k.seg(12, 6)), 0, y, z, lean, 0, 0));
    // slot cut-outs suggested by dark inserts on the shoulders
    for (const s of [-1, 1]) { [y, z] = at(0.66, 0.06); k.box('frame', 'metal-black', 0.04, 0.08, 0.01, s * 0.11, y, z, { r: 0.01, rx: lean }); }
    // 4D arms
    for (const s of [-1, 1]) {
      k.box('frame', 'metal-black', 0.04, 0.22, 0.05, s * 0.29, 0.53, -0.02, { r: 0.008 });
      k.soft('arms', 'rubber-black', 0.09, 0.03, 0.26, 0.012, s * 0.29, 0.655, 0.0, { flat: 3 });
    }
    return finish(k);
  },
});

const conferenceChair = mk({
  id: 'conference-chair', category: 'office', ko: '회의실 의자(캔틸레버)', en: 'Cantilever conference chair',
  params: [
    P.mat('cover', '좌판·등판', 'Seat & back', 'fabric-wool-charcoal', 'fabric'),
    P.mat('metal', '프레임', 'Frame', 'metal-chrome', 'metal'),
    P.bool('arms', '팔걸이', 'Armrests', true),
  ],
  tags: ['conference chair', 'cantilever chair', 'meeting chair', '회의실 의자', '캔틸레버 의자', '미팅 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = 0.011, sh = 0.45, hw = 0.235;
    for (const s of [-1, 1]) {
      const x = s * hw;
      const pts = [[x, r, -0.26], [x, r, 0.22], [x, sh - 0.03, 0.24], [x, sh - 0.03, -0.2], [x, 0.9, -0.28]];
      k.bentTube('frame', p.metal, pts, r, 0.06);
      if (p.arms) k.bentTube('frame', p.metal, [[x, 0.66, -0.235], [x + s * 0.03, 0.67, 0.0], [x + s * 0.03, 0.67, 0.12], [x, sh - 0.03, 0.17]], r * 0.9, 0.05);
    }
    k.rod('frame', p.metal, [-hw, sh - 0.03, -0.18], [hw, sh - 0.03, -0.18], 0.009);
    k.rod('frame', p.metal, [-hw, r, -0.24], [hw, r, -0.24], 0.009);
    k.soft('seat', p.cover, 0.46, 0.06, 0.46, 0.025, 0, sh, 0.02, { puff: 0.01, sag: 0.003 });
    k.soft('seat', p.cover, 0.46, 0.36, 0.045, 0.02, 0, 0.73, -0.245, { rx: -0.16, puff: 0.008 });
    if (p.arms) for (const s of [-1, 1]) k.soft('arms', 'rubber-black', 0.04, 0.02, 0.2, 0.008, s * (hw + 0.03), 0.685, 0.04, { flat: 2 });
    return finish(k);
  },
});

const guestChair = mk({
  id: 'guest-chair', category: 'office', ko: '내방객 의자', en: 'Guest chair',
  params: [
    P.mat('cover', '패브릭', 'Upholstery', 'fabric-navy', 'fabric'),
    P.mat('legs', '다리', 'Legs', 'metal-black', 'metal'),
    P.mat('arms', '팔걸이', 'Arms', 'wood-oak', 'wood'),
  ],
  tags: ['guest chair', 'visitor chair', 'side chair', '내방객 의자', '손님 의자', '보조 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.56, d = 0.54, sh = 0.46, r = 0.011;
    // continuous bent-tube sides: front leg → arm → back leg down to the floor
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.02);
      k.bentTube('frame', p.legs, [[x, 0, d / 2 - 0.04], [x, 0.64, d / 2 - 0.06], [x, 0.64, -d / 2 + 0.06], [x - s * 0.0, 0, -d / 2 + 0.02]], r, 0.05);
      k.soft('arms', p.arms, 0.045, 0.025, d - 0.12, 0.008, x, 0.655, 0.0, { flat: 2 });
    }
    for (const z of [d / 2 - 0.08, -d / 2 + 0.08]) k.rod('frame', p.legs, [-(w / 2 - 0.02), sh - 0.05, z], [w / 2 - 0.02, sh - 0.05, z], 0.009);
    k.soft('seat', p.cover, w - 0.08, 0.08, d - 0.08, 0.03, 0, sh - 0.01, 0.0, { puff: 0.012, sag: 0.004 });
    k.soft('seat', p.cover, w - 0.1, 0.36, 0.07, 0.03, 0, 0.7, -d / 2 + 0.06, { rx: -0.12, puff: 0.012 });
    k.rod('frame', p.legs, [-(w / 2 - 0.02), 0.6, -d / 2 + 0.06], [w / 2 - 0.02, 0.6, -d / 2 + 0.06], 0.009);
    return finish(k);
  },
});

const kneelingChair = mk({
  id: 'kneeling-chair', category: 'office', ko: '무릎 의자(자세 교정)', en: 'Kneeling chair',
  params: [
    P.mat('wood', '프레임', 'Frame', 'plywood', 'wood'),
    P.mat('cover', '쿠션', 'Cushions', 'fabric-wool-charcoal', 'fabric'),
  ],
  tags: ['kneeling chair', 'ergonomic chair', 'posture chair', '무릎 의자', '자세교정 의자', '바른자세 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const hw = 0.2;
    // two curved rocker runners joined by cross rails, posts up to the seat and knee rest
    for (const s of [-1, 1]) {
      const x = s * hw;
      k.tube('frame', p.wood, [[x, 0.11, -0.36], [x, 0.03, -0.2], [x, 0.015, 0.0], [x, 0.03, 0.2], [x, 0.1, 0.34]], 0.02, { radial: k.seg(10, 5) });
      k.tube('frame', p.wood, [[x, 0.02, -0.05], [x, 0.25, -0.12], [x, 0.5, -0.14]], 0.018, { radial: k.seg(10, 5) });
      k.tube('frame', p.wood, [[x, 0.025, 0.15], [x, 0.2, 0.2], [x, 0.3, 0.22]], 0.016, { radial: k.seg(10, 5) });
    }
    for (const [y, z] of [[0.48, -0.14], [0.28, 0.22], [0.035, -0.15], [0.035, 0.15]]) k.rod('frame', p.wood, [-hw, y, z], [hw, y, z], 0.014);
    k.soft('seat', p.cover, 0.46, 0.07, 0.34, 0.03, 0, 0.53, -0.12, { rx: 0.3, puff: 0.012 });
    k.soft('seat', p.cover, 0.44, 0.06, 0.2, 0.025, 0, 0.32, 0.24, { rx: 0.55, puff: 0.01 });
    return finish(k);
  },
});

const draftingStool = mk({
  id: 'drafting-stool', category: 'office', ko: '제도 의자(하이 스툴)', en: 'Drafting stool',
  params: [
    P.len('height', '좌판 높이', 'Seat height', 0.75, 0.62, 0.86),
    P.mat('cover', '쿠션', 'Seat', 'fabric-wool-charcoal', 'fabric'),
    P.mat('base', '베이스', 'Base', 'metal-chrome', 'metal'),
    P.bool('back', '등받이', 'Backrest', true),
  ],
  tags: ['drafting stool', 'drafting chair', 'counter chair', '제도 의자', '하이 체어', '작업 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = p.height - 0.08;
    starBase(k, p.base, { R: 0.32, top: sh });
    // foot ring on three struts
    const ry = Math.min(0.45, sh - 0.2), rr = 0.22;
    k.add('ring', p.base, new THREE.TorusGeometry(rr, 0.011, k.seg(8, 4), k.seg(40, 12)).rotateX(PI / 2).translate(0, ry, 0));
    for (let i = 0; i < 3; i++) { const a = PI / 2 + (i * 2 * PI) / 3; k.rod('ring', p.base, [Math.cos(a) * 0.03, ry, Math.sin(a) * 0.03], [Math.cos(a) * rr, ry, Math.sin(a) * rr], 0.008); }
    k.cyl('ring', 'plastic-black', 0.04, 0.04, 0.03, 0, ry - 0.015, 0, { segs: k.seg(16, 6) });
    k.box('frame', 'plastic-black', 0.2, 0.04, 0.2, 0, sh + 0.02, 0, { r: 0.01, segs: 2 });
    k.lathe('seat', p.cover, [[0, 0], [0.19, 0], [0.205, 0.015], [0.21, 0.045], [0.195, 0.07], [0, 0.078]], 0, sh + 0.04, 0, { segs: k.seg(36, 12), smooth: 10 });
    if (p.back) {
      k.bentTube('frame', 'plastic-black', [[0, sh + 0.03, -0.08], [0, sh + 0.03, -0.22], [0, sh + 0.25, -0.24]], 0.018, 0.04);
      k.soft('seat', p.cover, 0.34, 0.14, 0.05, 0.02, 0, sh + 0.3, -0.23, { rx: -0.1, puff: 0.008 });
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- storage */

const lateralFiling = mk({
  id: 'filing-cabinet-lateral', category: 'office', ko: '가로형 서류 캐비닛', en: 'Lateral filing cabinet',
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.6, 1.2),
    P.int('drawers', '서랍 수', 'Drawers', 3, 2, 5),
    P.mat('body', '마감', 'Finish', 'metal-white', 'metal'),
  ],
  tags: ['lateral filing cabinet', 'filing cabinet', 'office storage', '가로형 캐비닛', '서류 캐비닛', '파일 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, n = p.drawers, h = 0.05 + n * 0.34, d = 0.46;
    const rows = Array.from({ length: n }, () => ({ h: 1 / n, n: 1, type: 'drawer' }));
    addCabinet(k, { w, h, d, rows, body: p.body, front: p.body, base: 'plinth', plinth: 0.05, handle: 'bar', handleMat: 'metal-aluminium', top: p.body, topThick: 0.012 });
    const fh = (h - 0.05 - 0.012) / n;
    for (let i = 0; i < n; i++) k.box('handles', 'metal-aluminium', 0.09, 0.03, 0.003, 0, 0.05 + fh * (i + 1) - 0.035, d / 2 + 0.0015, { r: 0.001 });
    k.cyl('handles', 'metal-chrome', 0.009, 0.009, 0.006, w / 2 - 0.05, h - 0.045, d / 2, { rx: PI / 2, segs: k.seg(12, 6) });
    return finish(k);
  },
});

const slidingCupboard = mk({
  id: 'office-cupboard-sliding', category: 'office', ko: '슬라이딩 도어 사무 수납장', en: 'Sliding-door office cupboard',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.8, 1.8),
    P.len('height', '높이', 'Height', 1.05, 0.74, 2.0),
    P.mat('body', '몸체', 'Body', 'metal-white', 'metal'),
    P.mat('doors', '도어', 'Doors', 'wood-ash', 'wood'),
  ],
  tags: ['sliding door cupboard', 'office cupboard', 'storage cabinet', '슬라이딩 수납장', '사무용 수납장', '캐비닛'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.45, plinth = 0.05, t = 0.018;
    k.box('body', p.body, w, h - plinth - t, d - 0.05, 0, plinth + (h - plinth - t) / 2, -0.025, { r: 0.003 });
    k.box('body', p.body, w, t, d, 0, h - t / 2, 0, { r: 0.003 });
    k.box('plinth', 'paint-black-matte', w - 0.02, plinth, d - 0.06, 0, plinth / 2, -0.02, { r: 0.002 });
    // two doors on parallel tracks (overlap in the middle), vertical recessed pulls
    const dw = w / 2 + 0.03, dh = h - plinth - t - 0.006;
    [[-1, d / 2 - 0.035], [1, d / 2 - 0.012]].forEach(([s, z]) => {
      const cx = s * (w / 2 - dw / 2);
      k.box('doors', p.doors, dw, dh, 0.018, cx, plinth + 0.003 + dh / 2, z, { r: 0.003 });
      k.box('handles', 'paint-black-matte', 0.02, Math.min(0.3, dh * 0.4), 0.004, cx + s * (dw / 2 - 0.05), plinth + dh * 0.55, z + 0.0095, { r: 0.002 });
    });
    k.box('body', p.body, w - 0.02, 0.012, 0.05, 0, plinth + 0.006, d / 2 - 0.025, { r: 0.001 }); // track
    k.cyl('handles', 'metal-chrome', 0.009, 0.009, 0.005, w / 2 - 0.05, h - t - 0.03, d / 2 - 0.003, { rx: PI / 2, segs: k.seg(12, 6) });
    return finish(k);
  },
});

const barrister = mk({
  id: 'bookcase-barrister', category: 'office', ko: '바리스터 책장(유리 덮개)', en: 'Barrister bookcase',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.int('sections', '단 수', 'Sections', 3, 2, 5),
    P.mat('wood', '나무', 'Wood', 'wood-dark', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['barrister bookcase', 'lawyer bookcase', 'stacking bookcase', 'glass door', '바리스터 책장', '유리문 책장', '앤틱 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.32, sh = 0.32, base = 0.1, n = p.sections;
    k.box('frame', p.wood, w + 0.03, base, d + 0.03, 0, base / 2, 0, { r: 0.004, segs: 2 });
    for (let i = 0; i < n; i++) {
      const y0 = base + i * sh;
      carcass(k, p.wood, w, sh - 0.004, d, { y0, t: 0.018 });
      // lift-up glass door in a wooden frame, two small knobs
      const fy = y0 + (sh - 0.004) / 2;
      k.panel('doors', p.wood, frameShape(w - 0.03, sh - 0.04, 0.035, 0.035), 0.02, 0, fy, d / 2 + 0.01, { bevel: 0.002 });
      k.box('glass', 'glass-clear', w - 0.09, sh - 0.1, 0.004, 0, fy, d / 2 + 0.008, { r: 0 });
      for (const s of [-1, 1]) k.sphere('handles', 'metal-brass', 0.01, s * (w * 0.3), fy - sh / 2 + 0.06, d / 2 + 0.026, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
      if (p.books) addBooks(k, -w / 2 + 0.02, w / 2 - 0.02, y0 + 0.018, -d / 2 + 0.02, d - 0.06, 5 + i * 7, { hMax: Math.min(0.27, sh - 0.05), fill: 0.6 + 0.12 * (i % 3) });
    }
    k.box('frame', p.wood, w + 0.04, 0.035, d + 0.04, 0, base + n * sh + 0.0175, 0, { r: 0.006, segs: 2 });
    return finish(k);
  },
});

const glassBookcase = mk({
  id: 'bookcase-glass-doors', category: 'office', ko: '유리문 책장', en: 'Glass-door bookcase',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.4),
    P.len('height', '높이', 'Height', 2.0, 1.6, 2.4),
    P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['glass door bookcase', 'display cabinet', 'bookshelf', '유리문 책장', '장식장', '서재 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.38, plinth = 0.07, t = 0.02, low = 0.72;
    k.box('frame', p.wood, w - 0.02, plinth, d - 0.04, 0, plinth / 2, -0.02, { r: 0.002 });
    carcass(k, p.wood, w, h - plinth, d - 0.02, { y0: plinth, t });
    const zf = (d - 0.02) / 2;
    const nd = w > 0.7 ? 2 : 1, dw = (w - 0.006) / nd;
    // lower solid doors
    for (let i = 0; i < nd; i++) {
      const cx = -w / 2 + 0.003 + dw * (i + 0.5);
      k.box('doors', p.wood, dw - 0.004, low - 0.006, 0.02, cx, plinth + low / 2, zf + 0.01, { r: 0.002 });
      const hinge = nd === 1 ? -1 : i === 0 ? -1 : 1;
      addHandle(k, 'handles', 'metal-brass', 'knob', cx - hinge * (dw / 2 - 0.04), plinth + low - 0.08, zf + 0.02);
    }
    k.box('frame', p.wood, w - 2 * t, t, d - 0.04, 0, plinth + low, -0.01, { r: 0.001 });
    // glazed upper part with shelves and books
    const y0 = plinth + low + t / 2, top = h - t, n = Math.max(2, Math.round((top - y0) / 0.32)), span = (top - y0) / n;
    for (let i = 0; i < n; i++) {
      const y = y0 + i * span;
      if (i > 0) k.box('frame', p.wood, w - 2 * t, 0.018, d - 0.05, 0, y, -0.015, { r: 0.001 });
      if (p.books) addBooks(k, -w / 2 + t, w / 2 - t, y + 0.009, -d / 2 + 0.03, d - 0.1, 3 + i * 4, { hMax: Math.min(0.28, span - 0.05), fill: 0.55 + 0.15 * (i % 3) });
    }
    const gh = top - y0 + t / 2 - 0.004;
    for (let i = 0; i < nd; i++) {
      const cx = -w / 2 + 0.003 + dw * (i + 0.5);
      k.panel('doors', p.wood, frameShape(dw - 0.004, gh, 0.04, 0.04), 0.02, cx, y0 + gh / 2, zf + 0.01, { bevel: 0.002 });
      k.box('glass', 'glass-clear', dw - 0.08, gh - 0.08, 0.004, cx, y0 + gh / 2, zf + 0.008, { r: 0 });
      const hinge = nd === 1 ? -1 : i === 0 ? -1 : 1;
      addHandle(k, 'handles', 'metal-brass', 'knob', cx - hinge * (dw / 2 - 0.02), y0 + 0.08, zf + 0.02);
    }
    return finish(k);
  },
});

const safe = mk({
  id: 'office-safe', category: 'office', ko: '금고', en: 'Safe',
  params: [
    P.len('height', '높이', 'Height', 0.5, 0.3, 1.2),
    P.mat('body', '마감', 'Finish', 'paint-black-matte', 'paint'),
  ],
  tags: ['safe', 'strongbox', 'security safe', '금고', '사무용 금고', '내화금고'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height, w = 0.42 + (h - 0.3) * 0.25, d = 0.42, foot = 0.015;
    k.box('body', p.body, w, h - foot, d - 0.04, 0, foot + (h - foot) / 2, -0.02, { r: 0.012, segs: 3 });
    k.box('door', p.body, w - 0.02, h - foot - 0.02, 0.05, 0, foot + (h - foot) / 2, d / 2 - 0.035, { r: 0.008, segs: 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('feet', 'rubber-black', 0.05, foot, 0.05, sx * (w / 2 - 0.05), foot / 2, sz * (d / 2 - 0.06), { r: 0.003 });
    // hinges, keypad, handle wheel
    for (const y of [foot + 0.08, foot + h - 0.1]) k.cyl('metal', 'metal-steel', 0.012, 0.012, 0.06, -w / 2 + 0.005, y - 0.03, d / 2 - 0.012, { segs: k.seg(12, 6) });
    const zf = d / 2 - 0.01, cy = foot + (h - foot) * 0.6;
    k.box('keypad', 'screen-black', 0.09, 0.12, 0.006, 0.0, cy, zf + 0.003, { r: 0.005 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.box('metal', 'metal-steel', 0.016, 0.012, 0.003, -0.022 + c * 0.022, cy - 0.04 + r * 0.02, zf + 0.007, { r: 0.002 });
    k.box('display', 'light-cool', 0.05, 0.012, 0.001, 0, cy + 0.045, zf + 0.0065, { r: 0, overrides: { color: '#b8ffb0' } });
    const hx = w * 0.27, hy = foot + (h - foot) * 0.42;
    k.cyl('metal', 'metal-chrome', 0.022, 0.022, 0.03, hx, hy, zf, { rx: PI / 2, segs: k.seg(16, 6) });
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * PI) / 3 + 0.3;
      k.rod('metal', 'metal-chrome', [hx, hy, zf + 0.025], [hx + Math.cos(a) * 0.07, hy + Math.sin(a) * 0.07, zf + 0.025], 0.006, { segs: 6 });
      k.sphere('metal', 'metal-chrome', 0.011, hx + Math.cos(a) * 0.07, hy + Math.sin(a) * 0.07, zf + 0.025, { segs: 10, rings: 6 });
    }
    return finish(k);
  },
});

/* ----------------------------------------------------------------- boards */

const NOTE_COLOURS = ['#f6e27a', '#f4a6b8', '#a8d4f0', '#b9e3a6'];

const pinboard = mk({
  id: 'pinboard-cork', category: 'office', ko: '코르크 게시판', en: 'Cork pinboard', placement: 'wall', elevation: 1.2,
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.4, 1.8),
    P.len('height', '높이', 'Height', 0.6, 0.3, 1.2),
    P.mat('frame', '틀', 'Frame', 'wood-oak', 'wood'),
    P.bool('notes', '메모', 'Notes', true),
  ],
  tags: ['pinboard', 'cork board', 'notice board', 'bulletin board', '코르크 보드', '게시판', '메모판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, fr = 0.025, t = 0.022;
    k.panel('frame', p.frame, frameShape(w, h, fr, fr), t, 0, h / 2, 0, { bevel: 0.003 });
    k.box('cork', 'wood-pine', w - 2 * fr + 0.004, h - 2 * fr + 0.004, 0.012, 0, h / 2, -0.002, { r: 0, overrides: { color: '#b58a5c' } });
    if (p.notes) {
      const rnd = rng(7);
      const n = Math.max(2, Math.round(w * h * 14));
      for (let i = 0; i < n; i++) {
        const sz = 0.07 + rnd() * 0.04, x = (rnd() - 0.5) * (w - 2 * fr - sz - 0.02), y = h / 2 + (rnd() - 0.5) * (h - 2 * fr - sz - 0.02);
        const col = i % 5 === 4 ? null : NOTE_COLOURS[i % 4];
        const big = col ? 1 : 1.5;
        k.box('notes', 'paper', sz * big, sz * (col ? 1 : 1.35), 0.001, x, y, 0.0045 + i * 0.0002, { r: 0, rz: (rnd() - 0.5) * 0.25, ...(col ? { overrides: { color: col } } : {}) });
        k.sphere('pins', 'book-red', 0.005, x, y + sz * 0.4, 0.008 + i * 0.0002, { segs: 8, rings: 5 });
      }
    }
    return finish(k);
  },
});

/** Whiteboard: white face in an aluminium frame with a pen tray, centred at (0, cy), facing +z. */
function whiteboard(k, w, h, cy, { tray = true, twoSided = false } = {}) {
  const t = 0.018;
  k.box('board', 'paint-white-gloss', w - 0.02, h - 0.02, t - 0.004, 0, cy, 0, { r: 0 });
  k.panel('trim', 'metal-aluminium', frameShape(w, h, 0.014, 0.014, 0.006), t, 0, cy, 0, { bevel: 0.002 });
  const sides = twoSided ? [1, -1] : [1];
  if (tray) for (const s of sides) {
    k.box('trim', 'metal-aluminium', w * 0.6, 0.012, 0.05, 0, cy - h / 2 - 0.006, s * 0.03, { r: 0.003 });
    k.box('trim', 'metal-aluminium', w * 0.6, 0.02, 0.003, 0, cy - h / 2 + 0.002, s * 0.054, { r: 0.001 });
    const cols = ['#1b1b1b', '#2f5fb3', '#c0392b'];
    cols.forEach((c, i) => k.cyl('markers', 'plastic-white', 0.009, 0.009, 0.13, -0.12 + i * 0.04, cy - h / 2 + 0.009, s * 0.03 - 0.065, { rx: PI / 2, segs: k.seg(10, 5), overrides: { color: c } }));
    k.box('eraser', 'plastic-black', 0.12, 0.03, 0.05, 0.15, cy - h / 2 + 0.015, s * 0.03, { r: 0.006 });
  }
}

const whiteboardWall = mk({
  id: 'whiteboard-wall', category: 'office', ko: '화이트보드(벽걸이)', en: 'Wall whiteboard', placement: 'wall', elevation: 0.85,
  params: [P.len('width', '폭', 'Width', 1.8, 0.6, 2.4), P.len('height', '높이', 'Height', 1.2, 0.45, 1.2)],
  tags: ['whiteboard', 'dry erase board', 'marker board', '화이트보드', '칠판', '회의실 보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    whiteboard(k, p.width, p.height, p.height / 2, { tray: true });
    return finish(k);
  },
});

const whiteboardMobile = mk({
  id: 'whiteboard-mobile', category: 'office', ko: '이동식 화이트보드', en: 'Mobile whiteboard',
  params: [P.len('width', '폭', 'Width', 1.5, 0.9, 1.8), P.mat('stand', '스탠드', 'Stand', 'metal-aluminium', 'metal')],
  tags: ['mobile whiteboard', 'whiteboard on wheels', 'flipboard', '이동식 화이트보드', '양면 화이트보드', '칠판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, bh = 0.9, cy = 1.3, ux = w / 2 + 0.035;
    whiteboard(k, w, bh, cy, { tray: true, twoSided: true });
    for (const s of [-1, 1]) {
      const x = s * ux;
      k.box('stand', p.stand, 0.035, 1.85, 0.035, x, 0.08 + 0.925, 0, { r: 0.004, segs: 2 });
      k.box('stand', p.stand, 0.045, 0.04, 0.6, x, 0.08, 0, { r: 0.006, segs: 2 });
      k.cyl('stand', 'metal-black', 0.02, 0.02, 0.025, x + s * 0.004, cy, 0, { rz: -s * PI / 2, segs: k.seg(12, 6) }); // pivot knob
      for (const z of [-0.27, 0.27]) {
        k.box('casters', 'plastic-black', 0.03, 0.03, 0.03, x, 0.05, z, { r: 0.006 });
        k.cyl('casters', 'plastic-black', 0.025, 0.025, 0.02, x - 0.01, 0.025, z, { rz: PI / 2, segs: k.seg(14, 6) });
      }
    }
    k.box('stand', p.stand, 2 * ux, 0.03, 0.03, 0, 0.35, 0, { r: 0.004 });
    return finish(k);
  },
});

/* ------------------------------------------------------- desk & devices */

const organiser = mk({
  id: 'desk-organiser', category: 'office', ko: '데스크 정리함(펜꽂이)', en: 'Desk organiser', placement: 'surface',
  params: [P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'), P.mat('cup', '펜꽂이', 'Pen cup', 'metal-black', 'metal')],
  tags: ['desk organiser', 'pen holder', 'desk tidy', '데스크 정리함', '펜꽂이', '문구 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.slab('tray', p.wood, roundRect(0.34, 0.15, 0.015), 0.014, 0, { bevel: 0.003 });
    // pen cup with pens and pencils
    k.lathe('cup', p.cup, [[0, 0], [0.038, 0], [0.04, 0.005], [0.04, 0.1], [0.037, 0.1], [0.037, 0.008], [0, 0.008]], -0.12, 0.014, 0, { segs: k.seg(28, 10) });
    const rnd = rng(3);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r = 0.02 * rnd(), x = -0.12 + Math.cos(a) * r, z = Math.sin(a) * r;
      const top = [x + Math.cos(a) * 0.025, 0.014 + 0.15 + rnd() * 0.03, z + Math.sin(a) * 0.025];
      k.rod('pens', i % 3 === 0 ? 'paint-blue-matte' : i % 3 === 1 ? 'plastic-black' : 'fabric-mustard', [x, 0.024, z], top, 0.004, { segs: 6 });
    }
    // letter sorter: three leaning dividers with sheets
    for (let i = 0; i < 3; i++) {
      const x = -0.02 + i * 0.045;
      k.box('tray', p.wood, 0.008, 0.13, 0.12, x, 0.014 + 0.065, 0, { r: 0.002, rz: -0.08 });
      if (i < 2) k.box('paper', 'paper', 0.003, 0.11, 0.1, x + 0.022, 0.014 + 0.055, 0, { r: 0, rz: -0.06 });
    }
    // sticky-note pad
    k.box('paper', 'paper', 0.075, 0.015, 0.075, 0.125, 0.014 + 0.0075, 0.02, { r: 0.0005, overrides: { color: '#f6e27a' } });
    return finish(k);
  },
});

const letterTray = mk({
  id: 'letter-tray-stack', category: 'office', ko: '서류 트레이(3단)', en: 'Letter tray stack', placement: 'surface',
  params: [P.int('tiers', '단 수', 'Tiers', 3, 1, 5), P.mat('mat', '재질', 'Material', 'metal-black', 'metal')],
  tags: ['letter tray', 'document tray', 'paper tray', 'in tray', '서류 트레이', '서류함', '문서 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.26, d = 0.34, pitch = 0.075, wall = 0.045;
    for (let i = 0; i < p.tiers; i++) {
      const y = i * pitch;
      k.box('tray', p.mat, w, 0.003, d, 0, y + 0.0015, 0, { r: 0.001 });
      for (const s of [-1, 1]) sideExtrude(k, 'tray', p.mat, [[-d / 2, y], [d / 2, y], [d / 2, y + 0.02], [d / 2 - 0.08, y + wall], [-d / 2, y + wall]], 0.003, s * w / 2 - (s > 0 ? 0.003 : 0), { bevel: 0 });
      k.box('tray', p.mat, w, wall, 0.003, 0, y + wall / 2, -d / 2 + 0.0015, { r: 0 });
      k.box('tray', p.mat, w, 0.02, 0.003, 0, y + 0.01, d / 2 - 0.0015, { r: 0 });
      k.box('paper', 'paper', 0.21, 0.004 + (i % 2) * 0.006, 0.297, 0, y + 0.006 + (i % 2) * 0.003, -0.01, { r: 0 });
      if (i < p.tiers - 1) for (const sx of [-1, 1]) k.cyl('tray', p.mat, 0.004, 0.004, pitch - wall, sx * (w / 2 - 0.012), y + wall, -d / 2 + 0.03, { segs: 6 });
    }
    return finish(k);
  },
});

const printer = mk({
  id: 'printer-laser', category: 'office', ko: '레이저 복합기', en: 'Laser printer (multifunction)', placement: 'surface',
  params: [P.mat('color', '본체', 'Body', 'plastic-white', 'plastic')],
  tags: ['printer', 'laser printer', 'multifunction', 'scanner', '프린터', '복합기', '스캐너'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.42, d = 0.4, h = 0.33;
    k.soft('body', p.color, w, h, d, 0.02, 0, h / 2, 0, { flat: 3 });
    // dark output bay, paper tray drawer at the bottom
    k.box('bay', 'plastic-black', w - 0.08, 0.05, 0.02, 0, h * 0.62, d / 2 - 0.006, { r: 0.006 });
    k.box('paper', 'paper', 0.21, 0.006, 0.16, 0, h * 0.62 - 0.018, d / 2 - 0.06, { r: 0, rx: -0.08 });
    k.box('tray', 'plastic-grey', w - 0.03, 0.09, 0.012, 0, 0.055, d / 2 + 0.002, { r: 0.005, overrides: { color: '#d4d6d9' } });
    k.box('bay', 'plastic-black', 0.12, 0.012, 0.006, 0, 0.085, d / 2 + 0.008, { r: 0.004 });
    // scanner lid + document feeder on top
    k.box('lid', p.color, w - 0.01, 0.04, d - 0.03, 0, h + 0.02, -0.01, { r: 0.008, segs: 2 });
    k.box('bay', 'plastic-black', w - 0.12, 0.008, d * 0.55, 0.0, h + 0.044, -0.04, { r: 0.004 });
    k.box('paper', 'paper', 0.2, 0.003, 0.15, 0.0, h + 0.05, -0.06, { r: 0 });
    // tilted touch panel at the front right
    k.box('lid', p.color, 0.15, 0.025, 0.07, w / 2 - 0.1, h - 0.005, d / 2 - 0.015, { r: 0.006, rx: 0.4 });
    k.box('display', 'screen-black', 0.11, 0.003, 0.05, w / 2 - 0.1, h + 0.008, d / 2 - 0.01, { r: 0.002, rx: 0.4 });
    return finish(k);
  },
});

const copier = mk({
  id: 'copier-office', category: 'office', ko: '사무용 복사기', en: 'Office copier',
  params: [P.int('drawers', '용지함', 'Paper drawers', 2, 1, 4), P.mat('color', '본체', 'Body', 'plastic-white', 'plastic')],
  tags: ['copier', 'photocopier', 'office printer', 'mfp', '복사기', '복합기', '사무기기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, d = 0.66, dh = 0.13, n = p.drawers, base = 0.06 + n * dh, unit = 0.5;
    // casters + paper cabinet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('casters', 'plastic-black', 0.025, 0.025, 0.02, sx * (w / 2 - 0.06), 0.025, sz * (d / 2 - 0.08), { rz: PI / 2, segs: k.seg(12, 6) });
    k.box('body', p.color, w, base - 0.04, d, 0, 0.04 + (base - 0.04) / 2, 0, { r: 0.006, segs: 2 });
    for (let i = 0; i < n; i++) {
      const y = 0.06 + i * dh + dh / 2;
      k.box('drawers', 'plastic-grey', w - 0.02, dh - 0.008, 0.012, 0, y, d / 2 + 0.004, { r: 0.004, overrides: { color: '#d0d2d5' } });
      k.box('grips', 'plastic-black', 0.18, 0.018, 0.012, 0, y + dh / 2 - 0.03, d / 2 + 0.01, { r: 0.005 });
    }
    // engine unit with an inner output bay
    k.soft('body', p.color, w, unit, d, 0.02, 0, base + unit / 2, 0, { flat: 3 });
    k.box('grips', 'plastic-black', w - 0.12, 0.14, 0.02, -0.03, base + unit * 0.58, d / 2 - 0.004, { r: 0.008 });
    k.box('paper', 'paper', 0.3, 0.012, 0.2, -0.03, base + unit * 0.58 - 0.06, d / 2 - 0.12, { r: 0 });
    // document feeder on top + touch panel on an arm
    k.box('feeder', 'plastic-grey', w - 0.02, 0.1, d - 0.08, 0, base + unit + 0.05, -0.03, { r: 0.01, segs: 2, overrides: { color: '#e2e3e5' } });
    k.box('grips', 'plastic-black', w - 0.2, 0.01, d * 0.45, -0.02, base + unit + 0.105, -0.06, { r: 0.004 });
    k.box('feeder', 'plastic-grey', 0.26, 0.03, 0.17, w / 2 - 0.15, base + unit + 0.02, d / 2 + 0.06, { r: 0.008, rx: 0.5, overrides: { color: '#e2e3e5' } });
    k.box('display', 'screen-black', 0.22, 0.004, 0.13, w / 2 - 0.15, base + unit + 0.036, d / 2 + 0.065, { r: 0.003, rx: 0.5 });
    return finish(k);
  },
});

const shredder = mk({
  id: 'paper-shredder', category: 'office', ko: '문서 세단기', en: 'Paper shredder',
  params: [P.len('height', '높이', 'Height', 0.62, 0.4, 0.8), P.mat('color', '본체', 'Body', 'plastic-black', 'plastic')],
  tags: ['shredder', 'paper shredder', 'document shredder', '세단기', '문서 세단기', '파쇄기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.38, d = 0.28, h = p.height, head = 0.13;
    k.soft('body', p.color, w, h - head, d, 0.025, 0, (h - head) / 2, 0, { flat: 3 });
    k.box('glass', 'glass-frosted', 0.05, (h - head) * 0.6, 0.004, w * 0.32, (h - head) * 0.5, d / 2 + 0.001, { r: 0.002 });
    k.box('grips', 'plastic-grey', 0.14, 0.03, 0.02, 0, h - head - 0.06, d / 2 + 0.005, { r: 0.008 });
    k.soft('head', 'plastic-grey', w + 0.01, head, d + 0.01, 0.02, 0, h - head / 2, 0, { flat: 2, overrides: { color: '#c9cbce' } });
    k.box('grips', 'plastic-black', w * 0.7, 0.002, 0.012, 0, h + 0.0005, 0.02, { r: 0 }); // feed slot
    k.box('paper', 'paper', 0.21, 0.08, 0.002, 0, h + 0.035, 0.02, { r: 0 });
    for (let i = 0; i < 3; i++) k.cyl('buttons', 'plastic-black', 0.01, 0.01, 0.004, -0.13 + i * 0.03, h, d / 2 - 0.035, { segs: 10 });
    k.box('display', 'light-cool', 0.012, 0.004, 0.006, 0.13, h + 0.001, d / 2 - 0.035, { r: 0, overrides: { color: '#a8ffb8' } });
    return finish(k);
  },
});

const deskPhone = mk({
  id: 'desk-phone', category: 'office', ko: '사무용 전화기', en: 'Desk phone', placement: 'surface',
  params: [P.mat('color', '본체', 'Body', 'plastic-black', 'plastic')],
  tags: ['desk phone', 'telephone', 'ip phone', 'office phone', '전화기', '사무용 전화', '유선 전화'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.22, d = 0.2;
    sideExtrude(k, 'body', p.color, [[-d / 2, 0], [d / 2, 0], [d / 2, 0.025], [-d / 2, 0.075]], w, -w / 2, { bevel: 0.004 });
    const slope = Math.atan2(0.05, d);
    const yAt = (z) => 0.025 + (d / 2 - z) * (0.05 / d);
    // handset on the left cradle
    k.soft('handset', p.color, 0.055, 0.035, 0.2, 0.017, -w / 2 + 0.035, yAt(0) + 0.022, 0.0, { rx: slope, flat: 3 });
    // display + keypad on the right
    k.box('display', 'screen-black', 0.1, 0.004, 0.05, 0.035, yAt(-0.05) + 0.002, -0.05, { r: 0.002, rx: slope });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const z = 0.0 + r * 0.022, x = 0.01 + c * 0.028;
      k.box('keys', 'plastic-grey', 0.02, 0.006, 0.014, x, yAt(z) + 0.003, z, { r: 0.002, rx: slope });
    }
    k.box('display', 'light-cool', 0.006, 0.003, 0.006, w / 2 - 0.02, yAt(-0.08) + 0.0015, -0.08, { r: 0, overrides: { color: '#ff6b5c' } });
    // coiled cord from the handset to the base side
    const pts = [], turns = k.hi ? 18 : 9, steps = turns * 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = t * turns * PI * 2;
      pts.push([-w / 2 - 0.012 + Math.cos(a) * 0.005, 0.015 + Math.sin(a) * 0.005, 0.07 - t * 0.12]);
    }
    k.tube('cord', p.color, pts, 0.0018, { radial: 3, segs: steps * 2 });
    return finish(k);
  },
});

const pcTower = mk({
  id: 'pc-tower', category: 'office', ko: '데스크톱 PC 본체', en: 'Desktop PC tower',
  params: [P.mat('case', '케이스', 'Case', 'metal-black', 'metal'), P.bool('rgb', 'RGB 조명', 'RGB lighting', true)],
  tags: ['pc', 'desktop computer', 'gaming pc', 'tower', '컴퓨터 본체', '데스크톱', '게이밍 PC'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.22, h = 0.46, d = 0.45, foot = 0.02, t = 0.006;
    for (const sx of [-1, 1]) k.box('feet', 'rubber-black', 0.03, foot, d - 0.04, sx * (w / 2 - 0.03), foot / 2, 0, { r: 0.004 });
    const y0 = foot;
    // chassis open on the +x side (tempered-glass panel), mesh front
    k.box('case', p.case, t, h, d, -w / 2 + t / 2, y0 + h / 2, 0, { r: 0.002 });
    k.box('case', p.case, w, t, d, 0, y0 + h - t / 2, 0, { r: 0.002 });
    k.box('case', p.case, w, t, d, 0, y0 + t / 2, 0, { r: 0.002 });
    k.box('case', p.case, w, h, t, 0, y0 + h / 2, -d / 2 + t / 2, { r: 0.002 });
    k.box('front', 'plastic-black', w, h, 0.012, 0, y0 + h / 2, d / 2 - 0.006, { r: 0.004 });
    for (let i = 0; i < 18; i++) k.box('mesh', 'paint-grey-matte', w - 0.03, 0.003, 0.002, 0, y0 + 0.03 + i * 0.022, d / 2 + 0.0005, { r: 0 });
    k.box('glass', 'glass-tinted', 0.004, h - 0.01, d - 0.01, w / 2 - 0.002, y0 + h / 2, 0, { r: 0 });
    // inside: board, GPU, tower cooler, PSU shroud, front fans
    k.box('inner', 'plastic-black', 0.004, h - 0.08, d - 0.1, -w / 2 + 0.03, y0 + h / 2 + 0.02, -0.02, { r: 0 });
    k.box('inner', 'metal-steel', 0.04, 0.12, 0.13, -w / 2 + 0.07, y0 + h * 0.7, -0.04, { r: 0.004 });
    k.box('inner', 'plastic-black', 0.12, 0.05, 0.3, -w / 2 + 0.1, y0 + h * 0.42, 0.0, { r: 0.006 });
    k.box('inner', p.case, w - 0.02, 0.1, d - 0.02, 0, y0 + 0.055, 0, { r: 0.003 });
    for (const y of [y0 + h * 0.45, y0 + h * 0.75]) {
      k.add(p.rgb ? 'display' : 'inner', p.rgb ? 'light-cool' : 'plastic-grey', new THREE.TorusGeometry(0.055, 0.005, 4, k.seg(28, 10)).rotateY(PI / 2).translate(w / 2 - 0.04, y, d / 2 - 0.04), p.rgb ? { overrides: { color: '#9fb8ff' } } : {});
      k.cyl('inner', 'plastic-black', 0.05, 0.05, 0.025, 0, y, d / 2 - 0.04, { rx: PI / 2, segs: k.seg(20, 8) });
    }
    k.cyl('display', 'light-cool', 0.006, 0.006, 0.003, w / 2 - 0.04, y0 + h, d / 2 - 0.05, { segs: 10 });
    return finish(k);
  },
});

const allInOne = mk({
  id: 'pc-all-in-one', category: 'office', ko: '일체형 PC', en: 'All-in-one computer', placement: 'surface',
  params: [P.len('width', '화면 폭', 'Screen width', 0.55, 0.45, 0.7), P.mat('body', '본체', 'Body', 'metal-aluminium', 'metal')],
  tags: ['all in one pc', 'desktop computer', 'imac', '일체형 PC', '올인원 PC', '컴퓨터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, sh = w * 0.62, chin = w * 0.12, t = 0.012, y0 = 0.11, tilt = -0.08;
    const cy = y0 + (sh + chin) / 2;
    k.box('body', p.body, w, sh + chin, t, 0, cy, 0.0, { r: 0.008, segs: 2, rx: tilt });
    const fz = Math.cos(tilt) * t / 2;
    k.box('screen', 'screen-black', w - 0.008, sh, 0.002, 0, y0 + chin + sh / 2 + 0.002, fz + 0.001 + Math.sin(-tilt) * (sh / 2 - (sh + chin) / 2 + chin) * 0, { r: 0, rx: tilt });
    // stand: bent aluminium blade and foot
    k.box('body', p.body, 0.16, 0.012, 0.18, 0, 0.006, -0.05, { r: 0.004 });
    k.box('body', p.body, 0.15, 0.2, 0.012, 0, 0.1, -0.11, { r: 0.004, rx: -0.25 });
    // slim keyboard in front
    k.box('kbd', p.body, 0.28, 0.008, 0.11, 0, 0.004, 0.17, { r: 0.003 });
    for (let r = 0; r < 4; r++) k.box('keys', 'plastic-white', 0.25, 0.003, 0.016, 0, 0.0095, 0.13 + r * 0.022, { r: 0.001 });
    return finish(k);
  },
});

const dualMonitor = mk({
  id: 'monitor-arm-dual', category: 'office', ko: '듀얼 모니터(모니터 암)', en: 'Dual monitors on arm', placement: 'surface',
  params: [
    P.pick('size', '크기', 'Size', '24', [['24', '24인치', '24"'], ['27', '27인치', '27"']]),
    P.mat('arm', '암', 'Arm', 'metal-black', 'metal'),
  ],
  tags: ['dual monitor', 'monitor arm', 'two screens', '듀얼 모니터', '모니터 암', '멀티 모니터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [sw, sh] = p.size === '27' ? [0.615, 0.36] : [0.54, 0.32];
    const py = 0.48, pz = -0.18, my = 0.14 + sh / 2;
    k.cyl('arm', p.arm, 0.07, 0.07, 0.012, 0, 0, pz, { segs: k.seg(24, 8) });
    k.cyl('arm', p.arm, 0.018, 0.018, py, 0, 0.012, pz, { segs: k.seg(14, 6) });
    for (const s of [-1, 1]) {
      const ang = s * 0.18;
      const mx = s * (sw / 2 + 0.01) * Math.cos(ang), mz = -0.02 + Math.abs(Math.sin(ang)) * sw * 0.25;
      // arm: from the pole down/out to the VESA head
      k.rod('arm', p.arm, [0, py - 0.04, pz], [mx * 0.55, my + 0.04, pz + 0.04], 0.014, { segs: k.seg(12, 6) });
      k.rod('arm', p.arm, [mx * 0.55, my + 0.04, pz + 0.04], [mx, my, mz - 0.045], 0.012, { segs: k.seg(12, 6) });
      k.box('arm', p.arm, 0.08, 0.08, 0.02, mx, my, mz - 0.035, { r: 0.004, ry: -ang });
      k.box('bezel', 'plastic-black', sw, sh, 0.014, mx, my, mz, { r: 0.004, segs: 2, ry: -ang });
      const fx = mx + Math.sin(-ang) * 0.0075, fz = mz + Math.cos(ang) * 0.0075;
      k.box('screen', 'screen-black', sw - 0.012, sh - 0.022, 0.002, fx, my + 0.004, fz, { r: 0, ry: -ang });
    }
    return finish(k);
  },
});

/* -------------------------------------------------------------- misc */

const divider = mk({
  id: 'desk-divider', category: 'office', ko: '책상 칸막이(흡음 패널)', en: 'Desk divider screen', placement: 'surface',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.6, 1.8),
    P.len('height', '높이', 'Height', 0.45, 0.3, 0.65),
    P.mat('fabric', '패브릭', 'Fabric', 'fabric-linen-grey', 'fabric'),
  ],
  tags: ['desk divider', 'privacy screen', 'acoustic panel', 'partition', '책상 칸막이', '파티션', '흡음 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, t = 0.03;
    k.soft('panel', p.fabric, w, h, t, 0.012, 0, 0.012 + h / 2, 0, { flat: 4 });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.15);
      k.box('feet', 'metal-aluminium', 0.04, 0.012, 0.22, x, 0.006, 0, { r: 0.004 });
      k.box('feet', 'metal-aluminium', 0.04, 0.06, t + 0.012, x, 0.03, 0, { r: 0.004 });
    }
    return finish(k);
  },
});

const phoneBooth = mk({
  id: 'phone-booth-pod', category: 'office', ko: '사무실 폰부스(1인)', en: 'Office phone booth',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.9, 2.0),
    P.mat('shell', '외장', 'Shell', 'wood-oak', 'wood'),
    P.mat('felt', '내부 흡음재', 'Felt lining', 'fabric-wool-charcoal', 'fabric'),
  ],
  tags: ['phone booth', 'office pod', 'focus booth', 'meeting pod', '폰부스', '사무실 부스', '집중 부스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 1.0, h = 2.25, t = 0.05, base = 0.08, roof = 0.12;
    k.box('base', 'paint-black-matte', w, base, d, 0, base / 2, 0, { r: 0.004 });
    const wallH = h - base - roof;
    // shell walls (back + sides), felt lining inside, roof with vent
    k.box('shell', p.shell, w, wallH, t, 0, base + wallH / 2, -d / 2 + t / 2, { r: 0.004 });
    for (const s of [-1, 1]) k.box('shell', p.shell, t, wallH, d - t, s * (w / 2 - t / 2), base + wallH / 2, t / 2, { r: 0.004 });
    k.box('shell', p.shell, w, roof, d, 0, h - roof / 2, 0, { r: 0.006, segs: 2 });
    k.box('felt', p.felt, w - 2 * t - 0.002, wallH, 0.015, 0, base + wallH / 2, -d / 2 + t + 0.0075, { r: 0 });
    for (const s of [-1, 1]) k.box('felt', p.felt, 0.015, wallH, d - t - 0.06, s * (w / 2 - t - 0.0075), base + wallH / 2, t / 2 - 0.02, { r: 0 });
    k.box('felt', p.felt, w - 2 * t, 0.01, d - t - 0.04, 0, h - roof - 0.005, 0, { r: 0 });
    k.box('light', 'light-warm', w * 0.5, 0.008, 0.3, 0, h - roof - 0.014, 0, { r: 0.002 });
    k.light(0, h - roof - 0.05, 0, { intensity: 0.6, distance: 3 });
    // glass front: fixed pane + door in an aluminium frame with a bar handle
    const fz = d / 2 - 0.02, gw = w - 2 * t, gh = wallH;
    k.panel('frame', 'metal-black', frameShape(gw, gh, 0.03, 0.03), 0.04, 0, base + gh / 2, fz, { bevel: 0.002 });
    k.box('glass', 'glass-clear', gw - 0.05, gh - 0.05, 0.01, 0, base + gh / 2, fz, { r: 0 });
    k.box('frame', 'metal-black', 0.025, gh - 0.06, 0.04, -gw / 2 + Math.min(0.75, gw * 0.75), base + gh / 2, fz, { r: 0.002 });
    k.rod('frame', 'metal-aluminium', [-gw / 2 + 0.07, base + 0.8, fz + 0.06], [-gw / 2 + 0.07, base + 1.3, fz + 0.06], 0.012);
    for (const y of [0.85, 1.25]) k.rod('frame', 'metal-aluminium', [-gw / 2 + 0.07, base + y, fz + 0.02], [-gw / 2 + 0.07, base + y, fz + 0.06], 0.008);
    // inside: wall-mounted desk shelf and a stool
    k.box('shell', p.shell, gw - 0.04, 0.03, 0.4, 0, base + 0.95, -d / 2 + t + 0.215, { r: 0.004 });
    k.cyl('stool', 'metal-black', 0.02, 0.02, 0.62, 0, base, 0.0, { segs: k.seg(12, 6) });
    k.cyl('stool', 'metal-black', 0.18, 0.2, 0.02, 0, base, 0.0, { segs: k.seg(24, 8) });
    k.lathe('felt', p.felt, [[0, 0], [0.17, 0], [0.18, 0.02], [0.17, 0.05], [0, 0.055]], 0, base + 0.62, 0.0, { segs: k.seg(28, 10) });
    return finish(k);
  },
});

const footrest = mk({
  id: 'footrest', category: 'office', ko: '발받침(인체공학)', en: 'Ergonomic footrest',
  params: [P.mat('mat', '재질', 'Material', 'plastic-black', 'plastic')],
  tags: ['footrest', 'foot stool', 'ergonomic', '발받침', '발판', '인체공학'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.45, d = 0.35, tilt = 0.18;
    // tilting platform on a rocker base
    const y = 0.1;
    k.box('top', p.mat, w, 0.02, d, 0, y, 0, { r: 0.008, segs: 2, rx: tilt });
    for (let i = 0; i < 9; i++) {
      const z = -d / 2 + 0.03 + i * ((d - 0.06) / 8);
      k.box('ribs', 'rubber-black', w - 0.04, 0.006, 0.012, 0, y + 0.012 - Math.sin(tilt) * z, z * Math.cos(tilt), { r: 0.002, rx: tilt });
    }
    for (const s of [-1, 1]) {
      sideExtrude(k, 'base', p.mat, [[-d / 2 + 0.03, 0], [d / 2 - 0.03, 0], [0.04, y - 0.01], [-0.04, y - 0.01]], 0.03, s * (w / 2 - 0.06) - 0.015, { bevel: 0.003 });
    }
    k.rod('base', p.mat, [-(w / 2 - 0.06), 0.05, 0], [w / 2 - 0.06, 0.05, 0], 0.012);
    return finish(k);
  },
});

/* ----------------------------------------------------- preset variants */

const V = [
  variant(byId('office-chair'), 'headrest', '사무용 의자(헤드레스트)', 'Office chair with headrest', { headrest: true, base: 'black' }, { tags: ['headrest', '헤드레스트', 'ergonomic', '인체공학'] }),
  variant(byId('office-chair'), 'white', '사무용 의자(화이트)', 'Office chair (white frame)', { frame: 'plastic-white', mesh: 'fabric-linen-grey', seat: 'fabric-linen-grey' }, { tags: ['white', '화이트'] }),
  variant(byId('desk'), 'wood', '원목 다리 책상', 'Desk with wood legs', { frame: 'wood', top: 'wood-ash', drawers: 'none' }, { tags: ['wood legs', '원목 다리'] }),
  variant(byId('desk-l'), 'left-oak', 'ㄱ자 책상(왼쪽, 오크)', 'L-shaped desk (left, oak)', { side: 'left', top: 'wood-oak', frame: 'panel' }, { tags: ['left', '왼쪽', 'oak', '오크'] }),
  variant(byId('bookcase-cabinet'), 'oak', '하부장 책장(오크)', 'Bookcase with doors (oak)', { wood: 'wood-oak', front: 'wood-white', width: 1.2 }, { tags: ['oak', '오크'] }),
  variant(byId('filing-cabinet'), 'vertical', '4단 서류 캐비닛', '4-drawer filing cabinet', { type: 'vertical', body: 'metal-steel', front: 'metal-steel' }, { tags: ['vertical', '4단'] }),
  variant(byId('monitor'), 'ultrawide', '34인치 와이드 모니터', '34" ultrawide monitor', { size: '34', stand: 'metal-black' }, { tags: ['ultrawide', '와이드'] }),
  variant(standingDesk, 'white', '모션 데스크(화이트)', 'Standing desk (white)', { frame: 'metal-white', top: 'wood-white', width: 1.6 }, { tags: ['white', '화이트'] }),
  variant(executiveChair, 'cognac', '중역 의자(코냑 가죽)', 'Executive chair (cognac)', { leather: 'leather-cognac' }, { tags: ['cognac', '코냑', 'brown', '브라운'] }),
];

export const ITEMS = [
  standingDesk, executiveDesk, writingDesk, bureau, receptionDesk, meetingTable, ovalTable,
  executiveChair, gamingChair, conferenceChair, guestChair, kneelingChair, draftingStool,
  lateralFiling, slidingCupboard, barrister, glassBookcase, safe,
  pinboard, whiteboardWall, whiteboardMobile,
  organiser, letterTray, printer, copier, shredder, deskPhone, pcTower, allInOne, dualMonitor,
  divider, phoneBooth, footrest,
  ...V,
];
