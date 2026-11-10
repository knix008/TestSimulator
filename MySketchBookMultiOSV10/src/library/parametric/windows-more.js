// More windows (placement 'opening'): new designs + preset variants of openings.js / this file.
// Same conventions as openings.js: origin = bottom centre of the wall hole, z = 0 the wall's mid
// plane, +Z the room; every window has a `sill` param mirroring openings[].sill + `defaultSill`.
import { THREE, Kit, item, P, OPT, variant, clamp, frameShape } from './helpers.js';
import {
  ITEMS as BASE, DEG, wallT, withMatrix, pivot, ring, linings, windowTrim, sashHandle, WIN_SLACK,
} from './openings.js';
import { archCircle, arcPts, circleShape, specLeaf, field, autoSize } from './doors-more.js';

const M4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);
const baseOf = (id) => BASE.find((e) => e.id === id);
export const Y0 = 0.025; // the interior sill board; frames start above it

/* ------------------------------------------------------------ shared parts */

/** Outer frame ring + extra bars + reveal linings + interior sill / casing. */
export function winBase(k, w, h, t, p, { fd = 0.08, fb = 0.06, zf = 0, mullions = [], transoms = [], trimMat = 'wood-white', lining = 'paint-white-matte', sill = true, trim = p.trim ?? true, frame = true } = {}) {
  const fh = h - Y0;
  if (frame) ring(k, 'frame', p.frameMat, w, fh, fb, fd, 0, Y0 + fh / 2, zf);
  for (const mx of mullions) k.box('frame', p.frameMat, fb, fh - 2 * fb, fd, mx, Y0 + fh / 2, zf, { r: 0.003 });
  for (const ty of transoms) k.box('frame', p.frameMat, w - 2 * fb, fb, fd, 0, ty, zf, { r: 0.003 });
  linings(k, w, h, t, fd, lining, { zf });
  windowTrim(k, w, h, t, trimMat, { trim, sill });
}

/** A sash (frame ring + glass + gasket) with glass choice, muntin grid and triple glazing. */
export function sash2(k, x, y, w, h, z, d, mat, { b = 0.065, role = 'sash', grid = null, glass = 'glass-clear', triple = false, gasket = true } = {}) {
  ring(k, role, mat, w, h, b, d, x, y, z, { bevel: 0.004 });
  if (triple) {
    for (const dz of [-0.014, 0, 0.014]) k.box('glass', glass, w - 2 * b + 0.016, h - 2 * b + 0.016, 0.004, x, y, z + dz, { r: 0 });
    k.panel('spacer', 'plastic-black', frameShape(w - 2 * b + 0.014, h - 2 * b + 0.014, 0.012), 0.03, x, y, z, { bevel: 0 });
  } else k.box('glass', glass, w - 2 * b + 0.016, h - 2 * b + 0.016, 0.02, x, y, z, { r: 0 });
  if (gasket) k.panel('gasket', 'rubber-black', frameShape(w - 2 * b + 0.006, h - 2 * b + 0.006, 0.006), d * 0.8, x, y, z, { bevel: 0 });
  if (grid) {
    const [c, r] = grid, iw = w - 2 * b, ih = h - 2 * b;
    for (let i = 1; i < c; i++) k.box(role, mat, 0.02, ih, d * 0.6, x - iw / 2 + (iw / c) * i, y, z, { r: 0.003 });
    for (let j = 1; j < r; j++) k.box(role, mat, iw, 0.02, d * 0.6, x, y - ih / 2 + (ih / r) * j, z, { r: 0.003 });
  }
}

/** Window entry: adds the size params (custom ranges), frame material, sill param and defaults. */
export function win(def) {
  const { w, h, wr = [0.4, 3.6], hr = [0.4, 2.6], sill, frameMat = 'plastic-white', trim, extra = [], ...rest } = def;
  const params = [
    P.len('width', '폭', 'Width', w, wr[0], wr[1]), P.len('height', '높이', 'Height', h, hr[0], hr[1]),
    P.mat('frameMat', '창틀', 'Frame', frameMat),
    ...(trim == null ? [] : [P.bool('trim', '몰딩', 'Casing', trim)]),
    ...extra,
    P.len('sill', '창대 높이', 'Sill height', sill, 0, 2.2),
  ];
  return item({ category: 'windows', placement: 'opening', bboxSlack: WIN_SLACK, defaultSill: sill, params, ...rest });
}

export const glassParam = (def = 'glass-clear') => P.mat('glassMat', '유리', 'Glass', def, 'glass');

/* ----------------------------------------------------- shaped heads (arches) */

/** Points (right → left) of an arched head inset by `ins`: kind 'round' (segmental) or 'pointed'. */
function headPts(kind, w, ys, rise, ins, n) {
  if (kind === 'pointed') {
    const R = w * 0.8, cx = w / 2 - R;
    return [...arcPts(cx, ys, R - ins, w / 2 - ins, 0, Math.ceil(n / 2)), ...arcPts(-cx, ys, R - ins, 0, -(w / 2 - ins), Math.ceil(n / 2)).slice(1)];
  }
  const c = archCircle(w, ys, rise);
  return arcPts(0, c.cy, c.R - ins, w / 2 - ins, -(w / 2 - ins), n);
}
const headRise = (kind, w, rise) => (kind === 'pointed' ? Math.sqrt((w * 0.8) ** 2 - (w / 2 - w * 0.8) ** 2) : rise);
/** Closed outline: rectangle from y0 (inset) with an arched head. */
function headOutline(kind, w, y0, ys, rise, ins, n) {
  const pts = headPts(kind, w, ys, rise, ins, n);
  return [V2(-(w / 2 - ins), y0 + ins), V2(w / 2 - ins, y0 + ins), ...pts];
}

/** Arched (round / pointed) fixed window with glazing bars: frame panel fills the rectangular hole. */
function archedWindow(kind) {
  return (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08, n = k.seg(36, 12);
    const top = h, iw = w - 2 * fb;
    let rise = kind === 'pointed' ? headRise(kind, w, 0) : clamp(p.rise ?? w / 2, 0.05, Math.min(w / 2, (h - Y0) * 0.6));
    rise = Math.min(rise, (h - Y0) * 0.75);
    const kindUsed = kind === 'pointed' && headRise('pointed', w, 0) > (h - Y0) * 0.75 ? 'round' : kind;
    if (kindUsed !== kind) rise = Math.min(w / 2, (h - Y0) * 0.6);
    const ys = top - (kindUsed === 'pointed' ? headRise('pointed', w, 0) : rise) - 0.002;
    const outer = new THREE.Shape([V2(-w / 2, Y0), V2(w / 2, Y0), V2(w / 2, top), V2(-w / 2, top)]);
    outer.holes.push(new THREE.Path(headOutline(kindUsed, w, Y0, ys, rise, fb, n).reverse()));
    k.panel('frame', p.frameMat, outer, fd, 0, 0, 0, { bevel: 0.003 });
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    // glazing bead ring + glass, following the head
    const bead = new THREE.Shape(headOutline(kindUsed, w, Y0, ys, rise, fb - 0.001, n));
    bead.holes.push(new THREE.Path(headOutline(kindUsed, w, Y0, ys, rise, fb + 0.02, n).reverse()));
    for (const s of [-1, 1]) k.panel('sash', p.frameMat, bead, 0.02, 0, 0, s * (fd / 2 - 0.012), { bevel: 0.003 });
    k.panel('glass', p.glassMat, new THREE.Shape(headOutline(kindUsed, w, Y0, ys, rise, fb - 0.006, n)), 0.02, 0, 0, 0, { bevel: 0 });
    // bars: springing transom, centre mullion, a mid rail, and tracery in the head
    const bd = fd * 0.55, bar = 0.024;
    k.box('sash', p.frameMat, iw, bar, bd, 0, ys, 0, { r: 0.003 });
    const yTop = kindUsed === 'pointed' ? ys + headRise('pointed', w, 0) - fb : ys + rise - fb;
    k.box('sash', p.frameMat, bar, yTop - Y0 - fb, bd, 0, (Y0 + fb + yTop) / 2, 0, { r: 0.003 });
    if (ys - Y0 - fb > 0.6) k.box('sash', p.frameMat, iw, bar, bd, 0, (Y0 + fb + ys) / 2, 0, { r: 0.003 });
    if (kindUsed === 'round') {
      const c = archCircle(w, ys, rise), Ri = c.R - fb, dy = ys - c.cy;
      for (const a of [45, 135]) {
        const ang = a * DEG, b = dy * Math.sin(ang), u = -b + Math.sqrt(Math.max(0, b * b - (dy * dy - Ri * Ri)));
        if (u > 0.05) k.box('sash', p.frameMat, bar, u, bd, Math.cos(ang) * u / 2, ys + Math.sin(ang) * u / 2, 0, { r: 0.003, rz: ang - Math.PI / 2 });
      }
    } else {
      for (const s of [-1, 1]) {
        const x = s * iw / 4, R = w * 0.8, cx = -s * (w / 2 - R);
        const yy = ys + Math.sqrt(Math.max(0, (R - fb) ** 2 - (x - cx) ** 2));
        k.box('sash', p.frameMat, bar, yy - ys, bd, x, (ys + yy) / 2, 0, { r: 0.003 });
      }
    }
    return k.group();
  };
}

const arched = win({
  id: 'window-arched', ko: '아치형 창', en: 'Arched window', w: 1.0, h: 1.6, sill: 0.8, wr: [0.5, 2.4], hr: [0.8, 2.6], frameMat: 'wood-white', trim: true,
  extra: [P.len('rise', '아치 높이', 'Arch rise', 0.5, 0.1, 1.2), glassParam()],
  tags: ['window', 'arched window', 'round top window', '창문', '아치형 창', '아치 창'],
  build: archedWindow('round'),
});
const gothic = win({
  id: 'window-gothic', ko: '고딕 첨두아치 창', en: 'Gothic pointed-arch window', w: 0.8, h: 1.8, sill: 0.9, wr: [0.4, 1.6], hr: [1.0, 2.6], frameMat: 'wood-dark', trim: true,
  extra: [glassParam()],
  tags: ['window', 'gothic window', 'pointed arch', 'church window', '창문', '고딕 창', '첨두 아치'],
  build: archedWindow('pointed'),
});

/** Round / octagonal / porthole window in a square frame. */
function roundWindow(kind) {
  return (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = 0.08, fh = h - Y0, cy = Y0 + fh / 2;
    const r = Math.min(w, fh) / 2 - (kind === 'porthole' ? 0.05 : 0.04);
    const poly = (rr, sides) => Array.from({ length: sides }, (_, i) => { const a = Math.PI / sides + (i / sides) * Math.PI * 2; return V2(rr * Math.cos(a), cy + rr * Math.sin(a)); });
    const holeShape = (rr) => (kind === 'octagon' ? new THREE.Path(poly(rr / Math.cos(Math.PI / 8), 8).reverse()) : (() => { const hp = new THREE.Path(); hp.absarc(0, cy, rr, 0, Math.PI * 2, true); return hp; })());
    const solid = (rr) => (kind === 'octagon' ? new THREE.Shape(poly(rr / Math.cos(Math.PI / 8), 8)) : circleShape(rr, 0, cy));
    const outer = new THREE.Shape([V2(-w / 2, Y0), V2(w / 2, Y0), V2(w / 2, h), V2(-w / 2, h)]);
    outer.holes.push(holeShape(r));
    k.panel('frame', p.frameMat, outer, fd, 0, 0, 0, { bevel: 0.003, curveSegs: 40 });
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    k.panel('glass', p.glassMat, solid(r + 0.006), 0.02, 0, 0, 0, { bevel: 0, curveSegs: 40 });
    const ringS = solid(r + 0.001); ringS.holes.push(holeShape(r - 0.045));
    if (kind === 'porthole') {
      // heavy brass ring with bolts on both faces
      for (const s of [-1, 1]) {
        const rr = circleShape(r + 0.05, 0, cy, r - 0.03);
        k.panel('trim', 'metal-brass', rr, 0.025, 0, 0, s * (fd / 2 + 0.0125), { bevel: 0.006, curveSegs: 40 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; k.sphere('trim', 'metal-brass', 0.012, Math.cos(a) * (r + 0.01), cy + Math.sin(a) * (r + 0.01), s * (fd / 2 + 0.025), { segs: k.seg(10, 5), rings: k.seg(6, 3), scale: [1, 1, 0.6] }); }
      }
      k.rbox('trim', 'metal-brass', 0.05, 0.04, 0.05, 0.01, r + 0.03, cy, fd / 2 + 0.05, { segs: k.seg(2, 1) });
    } else {
      for (const s of [-1, 1]) k.panel('sash', p.frameMat, ringS, 0.02, 0, 0, s * (fd / 2 - 0.012), { bevel: 0.003, curveSegs: 40 });
      // cross bars
      k.box('sash', p.frameMat, 2 * r - 0.02, 0.022, fd * 0.5, 0, cy, 0, { r: 0.003 });
      k.box('sash', p.frameMat, 0.022, 2 * r - 0.02, fd * 0.5, 0, cy, 0, { r: 0.003 });
      if (kind === 'round') k.panel('sash', p.frameMat, circleShape(r * 0.32, 0, cy, r * 0.32 - 0.022), fd * 0.5, 0, 0, 0, { bevel: 0.002, curveSegs: 32 });
    }
    return k.group();
  };
}

const round = win({
  id: 'window-round', ko: '원형 창(오큘러스)', en: 'Round oculus window', w: 0.8, h: 0.8, sill: 1.4, wr: [0.4, 1.6], hr: [0.4, 1.6], frameMat: 'wood-white', trim: true,
  extra: [glassParam()], tags: ['window', 'round window', 'oculus', 'circle window', '창문', '원형 창', '둥근 창'],
  build: roundWindow('round'),
});
const octagon = win({
  id: 'window-octagon', ko: '팔각 창', en: 'Octagonal window', w: 0.7, h: 0.7, sill: 1.4, wr: [0.4, 1.4], hr: [0.4, 1.4], frameMat: 'wood-oak', trim: true,
  extra: [glassParam()], tags: ['window', 'octagon window', 'accent window', '창문', '팔각 창', '포인트 창'],
  build: roundWindow('octagon'),
});
const porthole = win({
  id: 'window-porthole', ko: '선박형 원형 창(포트홀)', en: 'Porthole window', w: 0.55, h: 0.55, sill: 1.3, wr: [0.35, 1.0], hr: [0.35, 1.0], frameMat: 'paint-white-gloss', trim: false,
  extra: [glassParam()], tags: ['window', 'porthole', 'nautical window', 'round window', '창문', '포트홀', '선박 창', '원형 창'],
  build: roundWindow('porthole'),
});

const halfRound = win({
  id: 'window-half-round', ko: '반원 채광창(팬라이트)', en: 'Half-round fanlight', w: 1.2, h: 0.62, sill: 2.1, wr: [0.5, 2.4], hr: [0.3, 1.3], frameMat: 'wood-white', trim: true,
  extra: [glassParam()], tags: ['window', 'fanlight', 'half round window', 'transom', '창문', '반원 창', '채광창', '팬라이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.08, n = k.seg(40, 12);
    const iw = w - 2 * fb, rise = clamp(h - Y0 - 2 * fb, 0.05, iw / 2), ysp = h - fb - rise;
    const c = archCircle(iw, ysp, rise);
    const outer = new THREE.Shape([V2(-w / 2, Y0), V2(w / 2, Y0), V2(w / 2, h), V2(-w / 2, h)]);
    outer.holes.push(new THREE.Path([V2(-iw / 2, Y0 + fb), V2(iw / 2, Y0 + fb), ...arcPts(0, c.cy, c.R, iw / 2, -iw / 2, n)].reverse()));
    k.panel('frame', p.frameMat, outer, fd, 0, 0, 0, { bevel: 0.003 });
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    k.panel('glass', p.glassMat, new THREE.Shape([V2(-iw / 2 - 0.006, Y0 + fb - 0.006), V2(iw / 2 + 0.006, Y0 + fb - 0.006), ...arcPts(0, c.cy, c.R + 0.006, iw / 2 + 0.006, -iw / 2 - 0.006, n)]), 0.02, 0, 0, 0, { bevel: 0 });
    // sunburst: hub on the bottom rail, five spokes and an inner arc rail
    const hy = Y0 + fb, dy = hy - c.cy;
    for (const a of [30, 60, 90, 120, 150]) {
      const ang = a * DEG, b = dy * Math.sin(ang), u = -b + Math.sqrt(Math.max(0, b * b - (dy * dy - c.R * c.R)));
      if (u > 0.1) k.box('sash', p.frameMat, 0.02, u - 0.08, fd * 0.5, Math.cos(ang) * (0.08 + (u - 0.08) / 2), hy + Math.sin(ang) * (0.08 + (u - 0.08) / 2), 0, { r: 0.003, rz: ang - Math.PI / 2 });
    }
    const hub = new THREE.Shape(); hub.absarc(0, hy, 0.085, 0, Math.PI, false); hub.lineTo(0.085, hy);
    k.panel('sash', p.frameMat, hub, fd * 0.6, 0, 0, 0, { bevel: 0.003 });
    return k.group();
  },
});

/* ------------------------------------------------------------ rectangular */

const tiltTurn = win({
  id: 'window-tilt-turn', ko: '틸트앤턴 창(시스템 창호)', en: 'Tilt-and-turn window', w: 0.8, h: 1.3, sill: 0.9, wr: [0.4, 1.4], hr: [0.5, 2.4], trim: true,
  anchor: { asymmetricZ: true },
  extra: [glassParam(), P.pick('hinge', '경첩 방향', 'Hinge side', 'left', OPT.hinge), P.num('tilt', '틸트(°)', 'Tilt (°)', 0, 0, 12, 1)],
  tags: ['window', 'tilt and turn', 'system window', 'upvc window', '창문', '틸트앤턴', '시스템 창호', '독일식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.065, fd = 0.09;
    winBase(k, w, h, t, p, { fd, fb });
    const sw = w - 2 * fb + 0.02, sh = h - Y0 - 2 * fb + 0.02, by = Y0 + fb - 0.01, zs = 0.012, d = fd * 0.75;
    const m = pivot(0, by, zs - d / 2, { rx: p.tilt * DEG });
    withMatrix(k, m, () => {
      sash2(k, 0, by + sh / 2, sw, sh, zs, d, p.frameMat, { b: 0.075, glass: p.glassMat, triple: true });
      const hs = p.hinge === 'right' ? -1 : 1;
      sashHandle(k, hs * (sw / 2 - 0.035), by + sh / 2, zs + d / 2);
      for (const y of [by + 0.06, by + sh - 0.06]) k.rbox('hardware', 'plastic-white', 0.02, 0.07, 0.016, 0.006, -hs * (sw / 2 + 0.005), y, zs + d / 2, { segs: k.seg(2, 1) });
    });
    return k.group();
  },
});

const hopper = win({
  id: 'window-hopper', ko: '안쪽 기울임 창(호퍼)', en: 'Hopper window', w: 0.9, h: 0.5, sill: 1.5, wr: [0.4, 1.6], hr: [0.3, 1.2], trim: true,
  anchor: { asymmetricZ: true },
  extra: [glassParam('glass-frosted'), P.num('open', '열림 각도(°)', 'Open angle (°)', 15, 0, 35, 1)],
  tags: ['window', 'hopper window', 'basement window', 'bathroom window', '창문', '호퍼 창', '환기창', '욕실 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const sw = w - 2 * fb + 0.02, sh = h - Y0 - 2 * fb + 0.02, by = Y0 + fb - 0.01, zs = 0.012, d = fd * 0.7;
    const a = p.open * DEG;
    withMatrix(k, pivot(0, by, zs + d / 2, { rx: a }), () => {
      sash2(k, 0, by + sh / 2, sw, sh, zs, d, p.frameMat, { glass: p.glassMat });
      sashHandle(k, 0, by + sh - 0.05, zs + d / 2);
    });
    // friction stays from the frame to the sash sides
    if (a > 0.01) for (const s of [-1, 1]) {
      const L = Math.min(sh * 0.7, 0.3);
      k.rod('hardware', 'metal-aluminium', [s * (sw / 2 - 0.01), by + 0.03, zs + d / 2], [s * (sw / 2 - 0.01), by + 0.03 + L * Math.cos(a), zs + d / 2 + L * Math.sin(a)], 0.005);
    }
    return k.group();
  },
});

const pivotWin = win({
  id: 'window-pivot', ko: '가로축 회전창(피벗 창)', en: 'Horizontal pivot window', w: 1.0, h: 1.0, sill: 1.0, wr: [0.5, 1.8], hr: [0.5, 1.8], frameMat: 'wood-pine', trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 25, 0, 80, 1)],
  tags: ['window', 'pivot window', 'centre pivot', 'rotating window', '창문', '회전창', '피벗 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.09;
    winBase(k, w, h, t, p, { fd, fb });
    const sw = w - 2 * fb - 0.006, sh = h - Y0 - 2 * fb - 0.006, cy = Y0 + (h - Y0) / 2;
    withMatrix(k, pivot(0, cy, 0, { rx: p.open * DEG }), () => {
      sash2(k, 0, cy, sw, sh, 0, fd * 0.8, p.frameMat, { b: 0.07 });
      k.rbox('hardware', 'metal-aluminium', sw - 0.2, 0.025, 0.02, 0.008, 0, cy + sh / 2 - 0.045, fd * 0.4 + 0.01, { segs: k.seg(2, 1) });
    });
    for (const s of [-1, 1]) k.cyl('hardware', 'metal-aluminium', 0.018, 0.018, 0.012, s * (w / 2 - fb + 0.006), cy, 0, { rz: Math.PI / 2, segs: k.seg(14, 6) });
    return k.group();
  },
});

const clerestory = win({
  id: 'window-clerestory', ko: '고창(가로 띠창)', en: 'Clerestory strip window', w: 2.4, h: 0.45, sill: 1.9, wr: [0.8, 3.6], hr: [0.25, 0.9], frameMat: 'metal-black', trim: false,
  extra: [P.int('panes', '칸 수', 'Panes', 4, 1, 8)],
  tags: ['window', 'clerestory', 'strip window', 'high window', 'ribbon window', '창문', '고창', '띠창', '높은 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.04, fd = 0.07;
    const n = clamp(Math.round(p.panes), 1, 8), cw = (w - 2 * fb - (n - 1) * fb) / n;
    const mull = Array.from({ length: n - 1 }, (_, i) => -w / 2 + fb + cw * (i + 1) + fb * (i + 0.5));
    winBase(k, w, h, t, p, { fd, fb, mullions: mull });
    const ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + fb + cw * (i + 0.5) + fb * i;
      k.box('glass', 'glass-clear', cw + 0.012, ih + 0.012, 0.024, cx, cy, 0, { r: 0 });
      ring(k, 'frame', p.frameMat, cw, ih, 0.012, 0.018, cx, cy, fd / 2 - 0.009);
    }
    return k.group();
  },
});

const ribbon = win({
  id: 'window-ribbon', ko: '연창 들창(리본 창)', en: 'Ribbon of awning windows', w: 2.4, h: 0.6, sill: 1.6, wr: [1.0, 3.6], hr: [0.35, 1.0], trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 20, 0, 40, 1)],
  tags: ['window', 'ribbon window', 'awning windows', 'kitchen window', '창문', '연창', '들창', '주방 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.055, fd = 0.08;
    const n = Math.max(2, Math.round(w / 0.8)), cw = (w - 2 * fb - (n - 1) * fb) / n;
    const mull = Array.from({ length: n - 1 }, (_, i) => -w / 2 + fb + cw * (i + 1) + fb * (i + 0.5));
    winBase(k, w, h, t, p, { fd, fb, mullions: mull });
    const sh = h - Y0 - 2 * fb + 0.02, top = h - fb + 0.01;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + fb + cw * (i + 0.5) + fb * i;
      // every other sash open
      const a = i % 2 === 0 ? p.open * DEG : 0;
      withMatrix(k, pivot(0, top, 0.012, { rx: -a }), () => {
        sash2(k, cx, top - sh / 2, cw + 0.02, sh, 0.012, fd * 0.7, p.frameMat);
        sashHandle(k, cx, top - sh + 0.06, 0.012 + fd * 0.35);
      });
    }
    return k.group();
  },
});

const slider3 = win({
  id: 'window-slider-3', ko: '3연동 미서기 창', en: 'Three-panel sliding window', w: 2.4, h: 1.3, sill: 0.9, wr: [1.4, 3.6], hr: [0.6, 2.2], trim: false,
  extra: [P.num('open', '열림 정도', 'Open ratio', 0.4, 0, 0.9, 0.05)],
  tags: ['window', 'sliding window', 'three panel', 'slider', '창문', '3연동 창', '미서기창', '샷시'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = Math.min(0.12, t - 0.04);
    winBase(k, w, h, t, p, { fd, fb });
    for (const s of [-1, 1]) k.box('frame', 'plastic-grey', w - 2 * fb, 0.01, 0.006, 0, Y0 + fb + 0.005, s * fd / 4, { r: 0.001 });
    const iw = w - 2 * fb, sw = iw / 3 + 0.03, sh = h - Y0 - 2 * fb - 0.01, sy = Y0 + fb + 0.006 + sh / 2, sd = fd / 2 - 0.012;
    const open = clamp(p.open, 0, 0.9) * (sw - 0.06);
    sash2(k, 0, sy, sw, sh, -fd / 4, sd, p.frameMat, { b: 0.065 });
    sash2(k, -iw / 2 + sw / 2 + open, sy, sw, sh, fd / 4, sd, p.frameMat, { b: 0.065 });
    sash2(k, iw / 2 - sw / 2, sy, sw, sh, fd / 4, sd, p.frameMat, { b: 0.065 });
    for (const s of [-1, 1]) k.rbox('hardware', 'plastic-grey', 0.02, 0.18, 0.01, 0.004, s * (iw / 2 - 0.035) + (s < 0 ? open : 0), sy, fd / 4 + sd / 2 + 0.005, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const pictureCasements = win({
  id: 'window-picture-casements', ko: '픽스창 + 양쪽 여닫이', en: 'Picture window with side casements', w: 2.4, h: 1.4, sill: 0.7, wr: [1.4, 3.6], hr: [0.6, 2.4], trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 0, 0, 90, 1)],
  tags: ['window', 'picture window', 'casement', 'living room window', '창문', '픽스창', '여닫이창', '거실 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    const side = clamp(w * 0.22, 0.35, 0.6), cwid = w - 2 * fb - 2 * side - 2 * fb;
    const mx = cwid / 2 + fb / 2;
    winBase(k, w, h, t, p, { fd, fb, mullions: [-mx, mx] });
    const ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    k.box('glass', 'glass-clear', cwid + 0.016, ih + 0.016, 0.024, 0, cy, 0, { r: 0 });
    ring(k, 'frame', p.frameMat, cwid, ih, 0.015, 0.02, 0, cy, fd / 2 - 0.01);
    for (const s of [-1, 1]) {
      const hx = s * (w / 2 - fb), sx = s * (w / 2 - fb - side / 2);
      withMatrix(k, pivot(hx, 0, 0.012 + fd * 0.35, { ry: s * p.open * DEG }), () => {
        sash2(k, sx, cy, side + 0.02, ih + 0.02, 0.012, fd * 0.7, p.frameMat);
        sashHandle(k, sx - s * (side / 2 - 0.03), cy, 0.012 + fd * 0.35);
      });
    }
    return k.group();
  },
});

const transomCasement = win({
  id: 'window-transom-casement', ko: '상부 고정창 + 여닫이 창', en: 'Casement window with transom light', w: 1.4, h: 1.6, sill: 0.8, wr: [0.8, 2.6], hr: [1.0, 2.6], frameMat: 'wood-white', trim: true,
  extra: [P.len('transomH', '상부창 높이', 'Transom height', 0.4, 0.2, 0.8), P.bool('grid', '격자', 'Grid bars', false)],
  tags: ['window', 'casement', 'transom', 'european window', '창문', '여닫이창', '상부 고정창', '유럽식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    const th = clamp(p.transomH, 0.15, (h - Y0) * 0.45), ty = h - fb - th - fb / 2;
    winBase(k, w, h, t, p, { fd, fb, transoms: [ty] });
    const lowH = ty - fb / 2 - (Y0 + fb), cw = (w - 3 * fb) / 2;
    k.box('frame', p.frameMat, fb, lowH, fd, 0, Y0 + fb + lowH / 2, 0, { r: 0.003 });
    const ly = Y0 + fb + lowH / 2;
    for (const s of [-1, 1]) {
      const cx = s * (fb / 2 + cw / 2);
      sash2(k, cx, ly, cw + 0.02, lowH + 0.02, 0.012, fd * 0.7, p.frameMat, { grid: p.grid ? [2, 3] : null });
      sashHandle(k, cx - s * (cw / 2 - 0.03), ly, 0.012 + fd * 0.35);
    }
    const uy = ty + fb / 2 + th / 2 + 0.0;
    sash2(k, 0, uy, w - 2 * fb + 0.02, th + 0.01, 0.012, fd * 0.7, p.frameMat, { grid: p.grid ? [4, 1] : null, gasket: false });
    return k.group();
  },
});

const french = win({
  id: 'window-french', ko: '프렌치 창(바닥까지 여닫이)', en: 'French window', w: 1.3, h: 2.2, sill: 0, wr: [0.8, 2.4], hr: [1.6, 2.8], frameMat: 'wood-white', trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 0, 0, 90, 1), P.bool('grid', '격자', 'Grid bars', true)],
  tags: ['window', 'french window', 'floor length window', 'balcony window', '창문', '프렌치 창', '바닥창', '발코니 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const cw = (w - 2 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = 0.012, d = fd * 0.7;
    for (const s of [-1, 1]) {
      const hx = s * (w / 2 - fb), sx = s * (w / 2 - fb - cw / 2);
      withMatrix(k, pivot(hx, 0, zs + d / 2, { ry: s * p.open * DEG }), () => {
        sash2(k, sx, cy, cw + 0.01, sh, zs, d, p.frameMat, { b: 0.07, grid: p.grid ? [2, 5] : null });
        // raised bottom panel (kick rail) and the espagnolette bar on the meeting stile
        k.box('sash', p.frameMat, cw - 0.12, 0.3, d * 0.5, sx, Y0 + fb + 0.2, zs, { r: 0.004 });
        if (s < 0) {
          k.rod('hardware', 'metal-brass', [sx + cw / 2 - 0.03, Y0 + fb + 0.1, zs + d / 2 + 0.012], [sx + cw / 2 - 0.03, Y0 + fb + sh - 0.12, zs + d / 2 + 0.012], 0.006);
          k.rbox('hardware', 'metal-brass', 0.03, 0.14, 0.03, 0.008, sx + cw / 2 - 0.03, 1.05, zs + d / 2 + 0.02, { segs: k.seg(2, 1) });
        }
      });
    }
    return k.group();
  },
});

const crittall = win({
  id: 'window-crittall', ko: '철제 격자 창(크리탈)', en: 'Steel grid window (Crittall style)', w: 1.2, h: 1.5, sill: 0.9, wr: [0.5, 3.0], hr: [0.6, 2.6], frameMat: 'metal-black', trim: false,
  extra: [P.bool('vent', '여닫이 환기창', 'Opening vent', true)],
  tags: ['window', 'steel window', 'crittall', 'industrial window', 'grid window', '창문', '철제 창', '인더스트리얼 창', '격자 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.035, fd = 0.05;
    winBase(k, w, h, t, p, { fd, fb, lining: 'paint-white-matte' });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    k.box('glass', 'glass-clear', iw + 0.01, ih + 0.01, 0.008, 0, cy, 0, { r: 0 });
    const c = Math.max(2, Math.round(iw / 0.32)), r = Math.max(2, Math.round(ih / 0.4));
    for (let i = 1; i < c; i++) k.box('sash', p.frameMat, 0.018, ih, 0.03, -iw / 2 + (iw * i) / c, cy, 0, { r: 0.002 });
    for (let j = 1; j < r; j++) k.box('sash', p.frameMat, iw, 0.018, 0.03, 0, cy - ih / 2 + (ih * j) / r, 0, { r: 0.002 });
    if (p.vent) {
      // the opening vent: one cell pair framed by a slightly heavier T-bar with a cockspur handle
      const vw = (iw / c) * Math.min(2, c - 1), vh = (ih / r) * Math.min(2, r - 1);
      const vx = -iw / 2 + vw / 2, vy = cy - ih / 2 + (ih / r) * Math.floor(r / 2) + vh / 2 - (ih / r) * Math.floor(r / 2) + ih / 2 - vh / 2 - 0.0;
      ring(k, 'sash', p.frameMat, vw + 0.012, vh + 0.012, 0.03, 0.04, vx, vy, 0.004);
      k.rbox('hardware', 'metal-black', 0.02, 0.1, 0.02, 0.006, vx + vw / 2 - 0.03, vy, 0.034, { segs: k.seg(2, 1) });
    }
    return k.group();
  },
});

const triple = win({
  id: 'window-triple-pane', ko: '삼중유리 모던 창', en: 'Modern triple-glazed window', w: 1.8, h: 1.6, sill: 0.5, wr: [0.8, 3.6], hr: [0.8, 2.6], frameMat: 'paint-grey-matte', trim: false,
  extra: [P.num('vent', '열림 창 폭 비율', 'Vent width ratio', 0.3, 0.2, 0.5, 0.05)],
  tags: ['window', 'triple glazed', 'modern window', 'passive house', '창문', '삼중유리', '모던 창', '패시브 창호'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = 0.12;
    const vw = clamp(p.vent, 0.2, 0.5) * (w - 3 * fb), mx = -w / 2 + fb + vw + fb / 2;
    winBase(k, w, h, t, p, { fd, fb, mullions: [mx] });
    const ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    sash2(k, -w / 2 + fb + vw / 2, cy, vw + 0.02, ih + 0.02, 0.012, fd * 0.6, p.frameMat, { b: 0.08, triple: true });
    sashHandle(k, -w / 2 + fb + vw - 0.035, cy, 0.012 + fd * 0.3, 'metal-steel');
    const fw = w / 2 - fb - (mx + fb / 2);
    for (const dz of [-0.022, 0, 0.022]) k.box('glass', 'glass-clear', fw + 0.016, ih + 0.016, 0.004, mx + fb / 2 + fw / 2, cy, dz, { r: 0 });
    k.panel('spacer', 'plastic-black', frameShape(fw + 0.012, ih + 0.012, 0.012), 0.046, mx + fb / 2 + fw / 2, cy, 0, { bevel: 0 });
    ring(k, 'frame', p.frameMat, fw, ih, 0.02, 0.03, mx + fb / 2 + fw / 2, cy, fd / 2 - 0.015);
    return k.group();
  },
});

const blinds = win({
  id: 'window-blinds', ko: '블라인드 내장 복층유리 창', en: 'Window with integral blinds', w: 1.2, h: 1.4, sill: 0.9, wr: [0.5, 2.4], hr: [0.5, 2.4], trim: true,
  extra: [P.num('drop', '블라인드 내림', 'Blind drop', 0.6, 0, 1, 0.05), P.num('slat', '슬랫 각도(°)', 'Slat angle (°)', 30, 0, 80, 1), P.mat('blindMat', '블라인드', 'Blind', 'metal-white', 'metal')],
  tags: ['window', 'integral blinds', 'venetian blind', 'blinds between glass', '창문', '블라인드 내장 창', '블라인드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.09;
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    ring(k, 'sash', p.frameMat, iw + 0.02, ih + 0.02, 0.06, fd * 0.75, 0, cy, 0.006, { bevel: 0.004 });
    const gw = iw - 0.1, gh = ih - 0.1;
    for (const dz of [-0.02, 0.02]) k.box('glass', 'glass-clear', gw + 0.016, gh + 0.016, 0.006, 0, cy, 0.006 + dz, { r: 0 });
    // head rail, slats down to the drop, bottom bar and the magnetic slider on the room glass
    const top = cy + gh / 2, drop = clamp(p.drop, 0, 1) * (gh - 0.04);
    k.box('blind', p.blindMat, gw, 0.02, 0.026, 0, top - 0.01, 0.006, { r: 0.002 });
    const n = Math.floor(drop / 0.02);
    for (let i = 0; i < n; i++) k.box('blind', p.blindMat, gw - 0.01, 0.0012, 0.022, 0, top - 0.03 - i * 0.02, 0.006, { r: 0, rx: p.slat * DEG });
    k.box('blind', p.blindMat, gw - 0.006, 0.012, 0.024, 0, top - 0.035 - drop, 0.006, { r: 0.002 });
    k.rbox('hardware', 'plastic-white', 0.03, 0.06, 0.012, 0.005, gw / 2 - 0.03, top - 0.05 - drop * 0.5, 0.006 + 0.03, { segs: k.seg(2, 1) });
    sashHandle(k, iw / 2 - 0.03, cy, 0.006 + fd * 0.375);
    return k.group();
  },
});

const jalousie = win({
  id: 'window-jalousie', ko: '유리 루버 창(잘루지)', en: 'Glass louvre (jalousie) window', w: 0.6, h: 1.0, sill: 1.1, wr: [0.4, 1.2], hr: [0.4, 1.8], frameMat: 'metal-aluminium', trim: false,
  extra: [P.num('open', '루버 각도(°)', 'Louvre angle (°)', 20, 0, 80, 1), glassParam()],
  tags: ['window', 'jalousie', 'louvre window', 'glass louvres', '창문', '유리 루버 창', '잘루지', '환기창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, y0 = Y0 + fb;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.025, ih, 0.05, s * (iw / 2 - 0.0125), y0 + ih / 2, 0, { r: 0.002 });
    const n = Math.max(3, Math.floor(ih / 0.09)), pitch = ih / n;
    for (let i = 0; i < n; i++) {
      const y = y0 + pitch * (i + 0.5);
      k.box('glass', p.glassMat, iw - 0.04, pitch + 0.012, 0.006, 0, y, 0, { r: 0, rx: -p.open * DEG });
      for (const s of [-1, 1]) k.box('hardware', p.frameMat, 0.016, pitch * 0.7, 0.012, s * (iw / 2 - 0.028), y, 0, { r: 0.002, rx: -p.open * DEG });
    }
    // operator crank on the room side
    k.rbox('hardware', p.frameMat, 0.06, 0.07, 0.03, 0.008, iw / 2 - 0.06, y0 + 0.06, fd / 2 + 0.015, { segs: k.seg(2, 1) });
    k.rod('hardware', 'plastic-black', [iw / 2 - 0.06, y0 + 0.06, fd / 2 + 0.03], [iw / 2 - 0.12, y0 + 0.06, fd / 2 + 0.05], 0.006);
    return k.group();
  },
});

const glassBlock = win({
  id: 'window-glass-block', ko: '유리 블록 창', en: 'Glass block window', w: 1.0, h: 1.0, sill: 1.0, wr: [0.4, 2.4], hr: [0.4, 2.4], frameMat: 'concrete', trim: true,
  extra: [P.mat('blockMat', '유리 블록', 'Glass block', 'glass-frosted', 'glass')],
  tags: ['window', 'glass block', 'glass brick', 'bathroom window', '창문', '유리 블록', '유리 벽돌', '욕실 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height;
    linings(k, w, h, t, 0.08, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    const iw = w - 0.024, ih = h - Y0 - 0.012, cy = Y0 + ih / 2;
    k.box('mortar', p.frameMat, iw, ih, 0.06, 0, cy, 0, { r: 0 });
    const n = Math.max(1, Math.round(iw / 0.2)), m = Math.max(1, Math.round(ih / 0.2));
    const bw = iw / n - 0.01, bh = ih / m - 0.01;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      k.box('glass', p.blockMat, bw, bh, 0.08, -iw / 2 + (iw / n) * (i + 0.5), Y0 + (ih / m) * (j + 0.5), 0, { r: 0.008, segs: 1 });
    }
    return k.group();
  },
});

/** Leaded glass: grid of cames with coloured cells (stained) or diamond quarries (leaded). */
const STAIN = ['#9e2b25', '#24508f', '#c99a2e', '#3b7d4a', '#e9e0c4'];
function leadedPane(k, cx, cy, iw, ih, kind, z = 0) {
  if (kind === 'diamond') {
    k.box('glass', 'glass-clear', iw + 0.01, ih + 0.01, 0.008, cx, cy, z, { r: 0 });
    const ang = 62 * DEG, sp = 0.1, dx = Math.cos(ang), dy = Math.sin(ang);
    for (const sgn of [-1, 1]) {
      for (let off = -iw / 2 - ih; off <= iw / 2 + ih; off += sp) {
        // line through (off, -ih/2) with direction (sgn*dx, dy), clipped to the pane
        const ts = [];
        const ax = off, ay = -ih / 2, vx = sgn * dx, vy = dy;
        for (const [px, py, nx, ny] of [[-iw / 2, 0, 1, 0], [iw / 2, 0, -1, 0], [0, -ih / 2, 0, 1], [0, ih / 2, 0, -1]]) void px, void py, void nx, void ny;
        let t0 = 0, t1 = Infinity;
        const clip = (p0, d, lo, hi) => { if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi; let a = (lo - p0) / d, b = (hi - p0) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 < t1; };
        if (!clip(ax, vx, -iw / 2, iw / 2) || !clip(ay, vy, -ih / 2, ih / 2)) continue;
        const L = t1 - t0; if (L < 0.02) continue;
        const mx = ax + vx * (t0 + L / 2), my = ay + vy * (t0 + L / 2);
        ts.push(1);
        k.box('lead', 'metal-black', 0.006, L, 0.012, cx + mx, cy + my, z, { r: 0, rz: -Math.atan2(vx, vy) });
      }
    }
    return;
  }
  const c = Math.max(3, Math.round(iw / 0.11)), r = Math.max(3, Math.round(ih / 0.11));
  const cw = iw / c, ch = ih / r, ci = (c - 1) / 2, cj = (r - 1) / 2;
  for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) {
    const border = i === 0 || j === 0 || i === c - 1 || j === r - 1;
    const dd = Math.abs(i - ci) / (c / 2) + Math.abs(j - cj) / (r / 2);
    const col = border ? ((i + j) % 2 ? 1 : 2) : dd < 0.35 ? 0 : dd < 0.6 ? 3 : 4;
    k.box('glass', 'glass-tinted', cw + 0.002, ch + 0.002, 0.006, cx - iw / 2 + cw * (i + 0.5), cy - ih / 2 + ch * (j + 0.5), z, { r: 0, overrides: { color: STAIN[col] } });
  }
  for (let i = 1; i < c; i++) k.box('lead', 'metal-black', 0.007, ih, 0.012, cx - iw / 2 + cw * i, cy, z, { r: 0 });
  for (let j = 1; j < r; j++) k.box('lead', 'metal-black', iw, 0.007, 0.012, cx, cy - ih / 2 + ch * j, z, { r: 0 });
}

const stained = win({
  id: 'window-stained', ko: '스테인드글라스 창', en: 'Stained glass window', w: 0.8, h: 1.2, sill: 1.0, wr: [0.4, 2.0], hr: [0.4, 2.4], frameMat: 'wood-dark', trim: true,
  tags: ['window', 'stained glass', 'leaded glass', 'church window', '창문', '스테인드글라스', '색유리 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    leadedPane(k, 0, cy, iw, ih, 'stained');
    for (const s of [-1, 1]) ring(k, 'frame', p.frameMat, iw + 0.002, ih + 0.002, 0.014, 0.016, 0, cy, s * 0.014);
    return k.group();
  },
});

const leaded = win({
  id: 'window-leaded', ko: '다이아몬드 납유리 여닫이 창', en: 'Leaded diamond-pane casement', w: 1.0, h: 1.2, sill: 0.9, wr: [0.6, 2.0], hr: [0.6, 2.0], frameMat: 'wood-oak', trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 0, 0, 90, 1)],
  tags: ['window', 'leaded window', 'diamond pane', 'tudor window', 'cottage window', '창문', '납유리 창', '다이아몬드 격자', '튜더 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) {
      const hx = s * (w / 2 - fb), sx = s * (fb / 2 + cw / 2);
      withMatrix(k, pivot(hx, 0, 0.012, { ry: -s * p.open * DEG }), () => {
        ring(k, 'sash', p.frameMat, cw + 0.02, ih + 0.02, 0.05, fd * 0.7, sx, cy, 0.012, { bevel: 0.004 });
        leadedPane(k, sx, cy, cw - 0.08, ih - 0.08, 'diamond', 0.012);
        k.rbox('hardware', 'metal-black', 0.025, 0.12, 0.02, 0.006, sx - s * (cw / 2 - 0.03), cy, 0.012 + fd * 0.35 + 0.01, { segs: k.seg(2, 1) });
      });
    }
    return k.group();
  },
});

const hanok = win({
  id: 'window-hanok', ko: '한옥 창호지 창', en: 'Korean hanok lattice window', w: 1.2, h: 1.0, sill: 0.6, wr: [0.6, 2.4], hr: [0.5, 1.8], frameMat: 'wood-dark', trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 0, 0, 90, 1), P.pick('pattern', '살 모양', 'Lattice', 'grid', [['grid', '정자살', 'Grid'], ['ddisal', '띠살', 'Banded']])],
  tags: ['window', 'hanok window', 'korean window', 'paper window', 'lattice', '창문', '한옥 창', '창호지 창', '전통 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = 0.1;
    winBase(k, w, h, t, p, { fd, fb, trimMat: 'wood-dark', lining: 'wall-plaster' });
    const cw = (w - 2 * fb) / 2 - 0.002, sh = h - Y0 - 2 * fb - 0.004, lt = 0.04, zf = -fd / 2 + lt / 2;
    for (const s of [-1, 1]) {
      // sashes open outwards like hanok doors (hinged at the jambs)
      const hx = s * (w / 2 - fb - 0.001);
      withMatrix(k, pivot(hx, 0, zf - lt / 2, { ry: s * p.open * DEG }), () => {
        const X = (u) => hx - s * u;
        withMatrix(k, M4(0, Y0 + fb + 0.002, 0), () => specLeaf(k, { stile: 0.045, rows: [{ rail: 0.05 }, { type: 'lattice', pattern: p.pattern === 'ddisal' ? 'ddisal' : undefined, grid: [3, Math.max(3, Math.round(sh / 0.16))], w: 1 }, { rail: 0.05 }] }, { lw: cw, lh: sh, lt, X, zc: zf, mat: p.frameMat }));
        const pts = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [X(cw - 0.03) + 0.025 * Math.cos(a), Y0 + fb + sh / 2 - 0.03 + 0.025 * Math.sin(a), zf + lt / 2 + 0.006]; });
        k.tube('hardware', 'metal-black', pts, 0.003, { closed: true, radial: k.seg(8, 4), segs: k.seg(20, 8) });
      });
    }
    return k.group();
  },
});

const shuttered = win({
  id: 'window-shuttered', ko: '덧문 달린 여닫이 창', en: 'Casement window with shutters', w: 1.0, h: 1.3, sill: 0.9, wr: [0.6, 1.8], hr: [0.6, 2.2], frameMat: 'wood-white', trim: true,
  bboxSlack: [0.7, 0.08, 0.1], anchor: { asymmetricZ: true },
  extra: [P.num('shutters', '덧문 열림', 'Shutters open', 1, 0, 1, 0.05), P.mat('shutterMat', '덧문', 'Shutters', 'paint-green-matte')],
  tags: ['window', 'shutters', 'louvred shutters', 'provence window', '창문', '덧문', '루버 덧문', '프로방스 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) {
      const cx = s * (fb / 2 + cw / 2);
      sash2(k, cx, cy, cw + 0.02, sh, 0.012, fd * 0.7, p.frameMat, { grid: [2, 3] });
      sashHandle(k, cx - s * (cw / 2 - 0.03), cy, 0.012 + fd * 0.35);
    }
    // exterior louvred shutters hinged just outside the reveal, folded back flat to the wall
    const sw = w / 2 + 0.02, shh = h + 0.02, zh = -t / 2 - 0.016, a = clamp(p.shutters, 0, 1) * 176 * DEG;
    for (const s of [-1, 1]) {
      const hx = s * (w / 2 + 0.02);
      const m = M4(hx, -0.009, zh).multiply(new THREE.Matrix4().makeRotationY(-s * a));
      withMatrix(k, m, () => {
        specLeaf(k, { stile: 0.06, rows: [{ rail: 0.08 }, { type: 'louvre' }, { rail: 0.08 }, { type: 'louvre' }, { rail: 0.08 }] }, { lw: sw, lh: shh, lt: 0.028, X: (u) => -s * u, zc: 0, mat: p.shutterMat });
        for (const y of [0.2, shh - 0.2]) k.box('hardware', 'metal-black', 0.24, 0.025, 0.004, -s * 0.12, y, -0.016, { r: 0.001 });
      });
      for (const y of [0.2, shh - 0.2]) k.cyl('hardware', 'metal-black', 0.007, 0.007, 0.07, hx, y - 0.045, zh, { segs: k.seg(10, 5) });
    }
    return k.group();
  },
});

const plantation = win({
  id: 'window-plantation', ko: '플랜테이션 셔터 창', en: 'Window with plantation shutters', w: 1.2, h: 1.4, sill: 0.8, wr: [0.6, 2.4], hr: [0.6, 2.4], trim: true,
  extra: [P.num('louvre', '루버 각도(°)', 'Louvre angle (°)', 45, 0, 85, 1), P.mat('shutterMat', '셔터', 'Shutters', 'wood-white')],
  tags: ['window', 'plantation shutters', 'interior shutters', 'louvres', '창문', '플랜테이션 셔터', '실내 덧문', '루버'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const ih = h - Y0 - 2 * fb, cy = Y0 + (h - Y0) / 2;
    k.box('glass', 'glass-clear', w - 2 * fb + 0.016, ih + 0.016, 0.024, 0, cy, -0.01, { r: 0 });
    // shutter panels in a frame inside the room-side reveal
    const zs = t / 2 - 0.03, iw = w - 0.03, n = iw > 1.0 ? 4 : 2, pw = iw / n, ph = h - Y0 - 0.02, y0 = Y0 + 0.01;
    const a = p.louvre * DEG;
    for (let i = 0; i < n; i++) {
      const px = -iw / 2 + pw * (i + 0.5);
      ring(k, 'shutter', p.shutterMat, pw - 0.004, ph, 0.05, 0.03, px, y0 + ph / 2, zs, { bh: 0.07 });
      const mid = y0 + ph * 0.5;
      k.box('shutter', p.shutterMat, pw - 0.1, 0.07, 0.03, px, mid, zs, { r: 0.003 });
      for (const [b0, b1] of [[y0 + 0.07, mid - 0.035], [mid + 0.035, y0 + ph - 0.07]]) {
        const m = Math.max(2, Math.floor((b1 - b0) / 0.055)), pitch = (b1 - b0) / m;
        for (let j = 0; j < m; j++) k.box('shutter', p.shutterMat, pw - 0.1, 0.01, 0.058, px, b0 + pitch * (j + 0.5), zs, { r: 0.003, rx: -a });
        k.box('shutter', p.shutterMat, 0.012, b1 - b0 - 0.02, 0.008, px, (b0 + b1) / 2, zs + 0.03 * Math.cos(a) + 0.006, { r: 0.002 });
      }
      if (i % 2 === 1) k.cyl('hardware', 'metal-brass', 0.01, 0.01, 0.02, px - pw / 2 + 0.03, y0 + ph / 2 + 0.12, zs + 0.015, { rx: Math.PI / 2, segs: k.seg(12, 5) });
    }
    return k.group();
  },
});

const storefront = win({
  id: 'window-storefront', ko: '상점 전면 유리창', en: 'Storefront glazing', w: 3.0, h: 2.6, sill: 0, wr: [1.5, 3.6], hr: [1.8, 2.6], frameMat: 'metal-aluminium', trim: false,
  extra: [P.len('kick', '하부 패널 높이', 'Kick panel', 0.35, 0, 0.8), P.len('transomH', '상부창 높이', 'Transom height', 0.5, 0, 0.9)],
  tags: ['window', 'storefront', 'shop window', 'curtain wall', 'commercial', '창문', '상점 유리창', '쇼윈도', '커튼월'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.12;
    const n = Math.max(2, Math.round(w / 1.1)), cw = (w - 2 * fb - (n - 1) * fb) / n;
    const mull = Array.from({ length: n - 1 }, (_, i) => -w / 2 + fb + cw * (i + 1) + fb * (i + 0.5));
    const kick = clamp(p.kick, 0, (h - Y0) * 0.3), tr = clamp(p.transomH, 0, (h - Y0) * 0.35);
    const transoms = [];
    if (kick > 0.05) transoms.push(Y0 + fb + kick + fb / 2);
    if (tr > 0.1) transoms.push(h - fb - tr - fb / 2);
    winBase(k, w, h, t, p, { fd, fb, mullions: mull, transoms, sill: false });
    const ys = [Y0 + fb, ...transoms.flatMap((y) => [y - fb / 2, y + fb / 2]), h - fb];
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + fb + cw * (i + 0.5) + fb * i;
      for (let j = 0; j < ys.length; j += 2) {
        const y0 = ys[j], y1 = ys[j + 1], ch = y1 - y0;
        if (ch < 0.02) continue;
        const isKick = kick > 0.05 && j === 0;
        if (isKick) k.box('panel', 'metal-aluminium', cw + 0.01, ch + 0.01, 0.02, cx, y0 + ch / 2, 0, { r: 0.002 });
        else k.box('glass', 'glass-clear', cw + 0.016, ch + 0.016, 0.024, cx, y0 + ch / 2, 0, { r: 0 });
        for (const s of [-1, 1]) ring(k, 'frame', p.frameMat, cw, ch, 0.012, 0.02, cx, y0 + ch / 2, s * (fd / 2 - 0.01));
      }
    }
    return k.group();
  },
});

const passThrough = win({
  id: 'window-pass-through', ko: '주방 배식구(패스스루 창)', en: 'Kitchen pass-through window', w: 1.2, h: 0.8, sill: 1.0, wr: [0.6, 2.4], hr: [0.4, 1.4], trim: true,
  extra: [P.mat('counter', '선반', 'Ledge', 'wood-oak'), P.num('open', '열림 정도', 'Open ratio', 0.5, 0, 0.9, 0.05)],
  tags: ['window', 'pass through', 'serving hatch', 'kitchen window', '창문', '배식구', '패스스루', '주방 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = 0.06;
    winBase(k, w, h, t, p, { fd, fb, sill: false });
    // a deep ledge through the wall, with brackets on both faces
    const ld = t + 0.5;
    k.box('ledge', p.counter, w + 0.12, 0.035, ld, 0, 0.0175, 0, { r: 0.004, segs: 2 });
    for (const s of [-1, 1]) for (const e of [-1, 1]) {
      const x = e * (w / 2 - 0.08), z = s * (t / 2 + 0.12);
      k.box('hardware', 'metal-black', 0.012, 0.003, 0.22, x, -0.0015 + 0.0, s * (t / 2 + 0.11), { r: 0 });
      k.rod('hardware', 'metal-black', [x, 0.0, s * (t / 2 + 0.2)], [x, -0.0, s * (t / 2 + 0.005)], 0.004);
      void z;
    }
    const iw = w - 2 * fb, sw = iw / 2 + 0.02, sh = h - Y0 - 2 * fb + 0.01, sy = Y0 + fb + sh / 2 + 0.005;
    const open = clamp(p.open, 0, 0.9) * (sw - 0.05);
    sash2(k, -iw / 2 + sw / 2, sy, sw, sh, -0.012, 0.022, p.frameMat, { b: 0.04, gasket: false });
    sash2(k, iw / 2 - sw / 2 - open, sy, sw, sh, 0.012, 0.022, p.frameMat, { b: 0.04, gasket: false });
    k.rbox('hardware', 'metal-steel', 0.02, 0.1, 0.012, 0.005, iw / 2 - 0.04 - open, sy, 0.03, { segs: k.seg(2, 1) });
    return k.group();
  },
});

/* --------------------------------------------------------- projecting bays */

const boxBay = win({
  id: 'window-box-bay', ko: '사각 돌출 창(박스 베이)', en: 'Box bay window', w: 2.0, h: 1.4, sill: 0.5, wr: [1.2, 3.2], hr: [0.8, 2.2], trim: undefined,
  bboxSlack: [0.12, 0.12, 0.08], anchor: { asymmetricZ: true },
  extra: [P.len('projection', '돌출 깊이', 'Projection', 0.5, 0.3, 0.9), P.mat('seat', '창대(좌석)', 'Seat board', 'wood-oak', 'wood'), P.bool('cushion', '쿠션', 'Seat cushion', true)],
  tags: ['bay window', 'box bay', 'window seat', '베이 윈도', '돌출창', '창가 좌석', '사각 돌출창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, d = p.projection, zw = -t / 2, fb = 0.05, fd = 0.07, ph = h - 0.06;
    const rect = (x0, x1, z0, z1) => new THREE.Shape([V2(x0, z0), V2(x1, z0), V2(x1, z1), V2(x0, z1)]);
    k.slab('seat', p.seat, rect(-w / 2 - 0.02, w / 2 + 0.02, zw - d - 0.02, t / 2 + 0.03), 0.04, 0, { bevel: 0.006 });
    k.slab('roof', 'metal-black', rect(-w / 2 - 0.06, w / 2 + 0.06, zw - d - 0.06, zw), 0.06, h, { bevel: 0.006 });
    k.slab('ceiling', 'paint-white-matte', rect(-w / 2, w / 2, zw - d, t / 2), 0.02, h - 0.02, { bevel: 0.002 });
    const faces = [[0, zw - d + fd / 2, w - 0.12, 0], [-(w / 2 - fd / 2), zw - d / 2, d - 0.06, Math.PI / 2], [w / 2 - fd / 2, zw - d / 2, d - 0.06, -Math.PI / 2]];
    for (const [fx, fz, fw, ry] of faces) {
      withMatrix(k, M4(fx, 0.04, fz).multiply(new THREE.Matrix4().makeRotationY(ry)), () => {
        ring(k, 'frame', p.frameMat, fw, ph - 0.02, fb, fd, 0, (ph - 0.02) / 2, 0);
        k.box('glass', 'glass-clear', fw - 2 * fb + 0.01, ph - 2 * fb, 0.02, 0, (ph - 0.02) / 2, 0, { r: 0 });
        const nm = Math.max(0, Math.round(fw / 0.8) - 1);
        for (let i = 1; i <= nm; i++) k.box('frame', p.frameMat, fb, ph - 2 * fb, fd, -fw / 2 + (fw * i) / (nm + 1), (ph - 0.02) / 2, 0, { r: 0.003 });
      });
    }
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.07, ph, 0.07, s * (w / 2 - 0.035), 0.04 + ph / 2, zw - d + 0.035, { r: 0.004 });
    for (const s of [-1, 1]) k.box('lining', 'paint-white-matte', 0.012, h, t, s * (w / 2 - 0.006), h / 2, 0, { r: 0 });
    if (p.cushion) {
      const sd = d + t * 0.6;
      k.soft('cushion', 'fabric-linen-grey', w - 0.18, 0.08, sd - 0.1, 0.03, 0, 0.08, zw - d + 0.06 + (sd - 0.1) / 2, { puff: 0.012 });
      k.soft('cushion', 'fabric-linen-white', 0.45, 0.32, 0.12, 0.05, -w / 2 + 0.35, 0.3, zw - d + 0.16, { puff: 0.02, rx: -0.25 });
    }
    k.userData.protrudes = -(d + t / 2);
    return k.group();
  },
});

const bow = win({
  id: 'window-bow', ko: '곡선 돌출 창(보우 윈도)', en: 'Bow window', w: 2.4, h: 1.5, sill: 0.5, wr: [1.6, 3.6], hr: [0.8, 2.2],
  bboxSlack: [0.12, 0.12, 0.08], anchor: { asymmetricZ: true },
  extra: [P.len('projection', '돌출 깊이', 'Projection', 0.45, 0.2, 0.8), P.int('segments', '창 수', 'Segments', 5, 3, 7), P.mat('seat', '창대(좌석)', 'Seat board', 'wood-walnut', 'wood')],
  tags: ['bow window', 'bay window', 'curved window', '보우 윈도', '곡선 돌출창', '돌출창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, d = clamp(p.projection, 0.1, w / 2 - 0.05), zw = -t / 2, fb = 0.05, fd = 0.07, ph = h - 0.06;
    const R = (w * w / 4 + d * d) / (2 * d), zc = zw - d + R, Phi = Math.asin((w / 2) / R);
    const n = clamp(Math.round(p.segments), 3, 7);
    const at = (phi, rr = R) => V2(rr * Math.sin(phi), zc - rr * Math.cos(phi));
    const arc = (rr) => Array.from({ length: 25 }, (_, i) => at(Phi - (2 * Phi * i) / 24, rr));
    const plan = (rr, back) => new THREE.Shape([V2(-w / 2 - 0.02, back), V2(w / 2 + 0.02, back), V2(w / 2 + 0.02, zw), ...arc(rr), V2(-w / 2 - 0.02, zw)]);
    k.slab('seat', p.seat, plan(R + 0.02, t / 2 + 0.03), 0.04, 0, { bevel: 0.006 });
    k.slab('roof', 'metal-black', plan(R + 0.06, zw), 0.06, h, { bevel: 0.006 });
    k.slab('ceiling', 'paint-white-matte', plan(R, t / 2), 0.02, h - 0.02, { bevel: 0.002 });
    for (let i = 0; i < n; i++) {
      const A = at(-Phi + (2 * Phi * i) / n), B = at(-Phi + (2 * Phi * (i + 1)) / n);
      const L = A.distanceTo(B), mx = (A.x + B.x) / 2, mz = (A.y + B.y) / 2, ry = -Math.atan2(B.y - A.y, B.x - A.x);
      withMatrix(k, M4(mx, 0.04, mz).multiply(new THREE.Matrix4().makeRotationY(ry)), () => {
        ring(k, 'frame', p.frameMat, L - 0.02, ph - 0.02, fb, fd, 0, (ph - 0.02) / 2, 0);
        k.box('glass', 'glass-clear', L - 2 * fb + 0.01, ph - 2 * fb, 0.02, 0, (ph - 0.02) / 2, 0, { r: 0 });
        k.box('frame', p.frameMat, L - 2 * fb, 0.035, fd * 0.6, 0, (ph - 0.02) * 0.72, 0, { r: 0.003 });
      });
      if (i > 0) k.cyl('frame', p.frameMat, 0.03, 0.03, ph, A.x, 0.04, A.y, { segs: k.seg(12, 6) });
    }
    for (const s of [-1, 1]) k.box('lining', 'paint-white-matte', 0.012, h, t, s * (w / 2 - 0.006), h / 2, 0, { r: 0 });
    k.userData.protrudes = -(d + t / 2);
    return k.group();
  },
});

const garden = win({
  id: 'window-garden', ko: '가든 윈도(온실형 돌출 창)', en: 'Garden window', w: 1.0, h: 1.0, sill: 1.0, wr: [0.6, 1.8], hr: [0.6, 1.5], frameMat: 'plastic-white', trim: true,
  bboxSlack: [0.12, 0.08, 0.08], anchor: { asymmetricZ: true },
  extra: [P.len('projection', '돌출 깊이', 'Projection', 0.35, 0.2, 0.5), P.bool('shelf', '유리 선반', 'Glass shelf', true)],
  tags: ['window', 'garden window', 'greenhouse window', 'kitchen window', '창문', '가든 윈도', '온실 창', '주방 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, d = p.projection, zw = -t / 2, fb = 0.035;
    linings(k, w, h, t, 0, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    const zo = zw - d, hf = h - 0.14;
    const rect = (x0, x1, z0, z1) => new THREE.Shape([V2(x0, z0), V2(x1, z0), V2(x1, z1), V2(x0, z1)]);
    k.slab('frame', p.frameMat, rect(-w / 2, w / 2, zo, zw + 0.002), 0.04, 0.0, { bevel: 0.004 });
    // front frame + glass
    ring(k, 'frame', p.frameMat, w, hf - 0.04, fb, 0.04, 0, 0.04 + (hf - 0.04) / 2, zo + 0.02);
    k.box('glass', 'glass-clear', w - 2 * fb + 0.01, hf - 0.04 - 2 * fb + 0.01, 0.006, 0, 0.04 + (hf - 0.04) / 2, zo + 0.02, { r: 0 });
    // sloped glass roof
    const L = Math.hypot(d, h - hf), th = -Math.atan2(h - hf, d);
    k.box('glass', 'glass-clear', w - 0.04, 0.006, L, 0, (h + hf) / 2, zw - d / 2, { r: 0, rx: th });
    for (const s of [-1, 1]) k.box('frame', p.frameMat, fb, 0.035, L + 0.02, s * (w / 2 - fb / 2), (h + hf) / 2 + 0.01, zw - d / 2, { r: 0.003, rx: th });
    k.box('frame', p.frameMat, w, 0.04, 0.04, 0, h - 0.02, zw - 0.02, { r: 0.003 });
    // side glass (trapezoids) with an opening vent
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape([V2(0, 0.04), V2(d - 0.02, 0.04), V2(d - 0.02, hf), V2(0, h - 0.02)]);
      k.panel('glass', 'glass-clear', sh, 0.006, s * (w / 2 - 0.02), 0, zw, { bevel: 0, ry: Math.PI / 2 });
      k.box('frame', p.frameMat, 0.035, hf - 0.04, 0.035, s * (w / 2 - 0.0175), 0.04 + (hf - 0.04) / 2, zo + 0.02, { r: 0.003 });
      k.box('frame', p.frameMat, 0.035, h - 0.04, 0.035, s * (w / 2 - 0.0175), 0.04 + (h - 0.04) / 2 - 0.01, zw - 0.0175, { r: 0.003 });
    }
    if (p.shelf) k.box('glass', 'glass-clear', w - 0.06, 0.008, d - 0.05, 0, 0.04 + hf * 0.45, zw - d / 2, { r: 0 });
    // two terracotta pots on the base
    for (const x of [-w * 0.25, w * 0.22]) k.lathe('pot', 'ceramic-terracotta', [[0, 0], [0.04, 0], [0.055, 0.1], [0.06, 0.11], [0.05, 0.11], [0, 0.1]], x, 0.04, zw - d / 2, { segs: k.seg(20, 8) });
    k.userData.protrudes = -(d + t / 2);
    return k.group();
  },
});

/* ---------------------------------------------------------------- variants */

const V = [
  variant(baseOf('window-casement'), 'colonial', '격자 여닫이 창(콜로니얼)', 'Colonial grid casement window', { grid: true, panes: 2, frameMat: 'wood-white', trim: true }, { tags: ['colonial', '콜로니얼', 'grid', '격자'] }),
  variant(baseOf('window-casement'), 'single', '외짝 여닫이 창', 'Single casement window', { panes: 1, width: 0.6, height: 1.0 }, { tags: ['single', '외짝', 'small window', '작은 창'] }),
  variant(baseOf('window-fixed'), 'slot', '세로 슬롯 픽스 창', 'Tall slot window', { width: 0.4, height: 1.8, trim: false, sill: 0.5 }, { tags: ['slot window', '슬롯 창', 'narrow', '좁은 창'] }),
  variant(baseOf('window-sliding'), 'balcony', '발코니 이중창(대형)', 'Balcony sliding window (large)', { width: 2.6, height: 2.1, sill: 0.3 }, { tags: ['balcony', '발코니', 'large', '대형'] }),
  variant(baseOf('window-double-hung'), 'oak', '오크 오르내리창', 'Oak double-hung window', { frameMat: 'wood-oak', grid: false }, { tags: ['oak', '오크', '원목 창'] }),
  variant(baseOf('window-roof'), 'large', '대형 천창', 'Large roof window', { width: 1.14, height: 1.4 }, { tags: ['large', '대형', 'skylight', '큰 천창'] }),
  variant(tiltTurn, 'bath', '불투명 욕실 틸트 창', 'Frosted bathroom tilt window', { glassMat: 'glass-frosted', width: 0.6, height: 0.8, sill: 1.4, tilt: 8 }, { tags: ['bathroom', '욕실 창', 'frosted', '불투명'] }),
  variant(crittall, 'tall', '철제 격자 장창', 'Tall steel grid window', { width: 1.0, height: 2.2, sill: 0.4 }, { tags: ['tall', '장창', 'floor to ceiling', '높은 창'] }),
  variant(arched, 'twin', '아치형 대형 창', 'Wide arched window', { width: 1.8, height: 2.1, rise: 0.6, sill: 0.5 }, { tags: ['wide', '대형', 'palladian', '팔라디안'] }),
  variant(hanok, 'ddisal', '한옥 띠살 창', 'Hanok banded lattice window', { pattern: 'ddisal', width: 1.0, height: 1.2 }, { tags: ['ddisal', '띠살', 'banded', '띠살창'] }),
];

const DESIGNS = [
  tiltTurn, hopper, pivotWin, clerestory, ribbon, slider3, pictureCasements, transomCasement, french, crittall, triple, blinds,
  jalousie, glassBlock, stained, leaded, hanok, shuttered, plantation, storefront, passThrough,
  arched, gothic, round, octagon, porthole, halfRound, boxBay, bow, garden,
].map(autoSize);

export const ITEMS = [...DESIGNS, ...V];
void field;
