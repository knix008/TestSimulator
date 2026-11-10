// Still more windows (placement 'opening'): Korean system / high-sash / aluminium sliders, lift-and-
// slide, slim sliders, security bars and grilles, roll screens, trickle vents, single / triple-hung
// and Georgian sashes, Yorkshire sliders, stulp pairs, PSK and pivot sashes, coupled / passive-house /
// secondary glazing, shop hatches (serving, ticket, drive-through), interior glazing (borrowed
// light, steel grid, yukimi shoji), lattices (Chinese moon, hanok 완자 / 아자), Queen Anne, Prairie,
// Tudor, bifora, lancets, rose, quatrefoil, hexagon, triangle, oval, segmental arch, louvres and
// shading (operable louvres, brise-soleil, Bahama shutter, fabric awning, café shutters), curtain
// wall unit, basement window well, Juliet balcony, fire-rated wired glass.
// Same conventions as windows-more.js: origin bottom centre of the hole, z = 0 the wall's mid plane,
// +Z the room, `sill` param + defaultSill (win()). See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, OPT, clamp, frameShape } from './helpers.js';
import { DEG, wallT, withMatrix, pivot, ring, linings, windowTrim, sashHandle } from './openings.js';
import { win, winBase, sash2, glassParam, Y0 } from './windows-more.js';
import { archCircle, arcPts, circleShape, autoSize } from './doors-more.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const rectPts = (x0, y0, x1, y1) => [V2(x0, y0), V2(x1, y0), V2(x1, y1), V2(x0, y1)];
const PI = Math.PI;

/* ------------------------------------------------------------ shared parts */

/** Frame panel filling the hole (from y0 up to h) with polygon holes (each a CCW Vector2 list). */
function framePanel(k, mat, w, h, holes, fd, { role = 'frame', y0 = Y0, z = 0 } = {}) {
  const outer = new THREE.Shape(rectPts(-w / 2, y0, w / 2, h));
  for (const pts of holes) outer.holes.push(new THREE.Path([...pts].reverse()));
  k.panel(role, mat, outer, fd, 0, 0, z, { bevel: 0.003 });
}
/** Glass following a closed outline. */
function glassIn(k, pts, glass = 'glass-clear', z = 0, o = {}) {
  k.panel('glass', glass, new THREE.Shape(pts), 0.02, 0, 0, z, { bevel: 0, ...o });
}
/** Points of a radial outline r(θ) around (cx, cy), CCW. */
function radial(fn, cx, cy, n, grow = 0) {
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * PI * 2; const r = fn(a) + grow; return V2(cx + r * Math.cos(a), cy + r * Math.sin(a)); });
}
/** Glazing bead: a band between the outline grown by g and the outline itself. */
function radialBead(k, role, mat, fn, cx, cy, n, g, d, z) {
  const s = new THREE.Shape(radial(fn, cx, cy, n, g));
  s.holes.push(new THREE.Path(radial(fn, cx, cy, n).reverse()));
  k.panel(role, mat, s, d, 0, 0, z, { bevel: 0 });
}
/** Radius of a regular polygon (circumradius R, n sides, first vertex at angle a0) along θ. */
const polyR = (n, R, a0 = 0) => (a) => {
  const seg = (2 * PI) / n;
  const u = ((((a - a0) % seg) + seg) % seg) - seg / 2;
  return (R * Math.cos(PI / n)) / Math.cos(u);
};
/** A straight bar between two points in the x / y plane (glazing bars, lattices, came). */
function bar(k, role, mat, x0, y0, x1, y1, bw, d, z, r = 0) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 0.004) return;
  k.box(role, mat, L, bw, d, (x0 + x1) / 2, (y0 + y1) / 2, z, { r, rz: Math.atan2(y1 - y0, x1 - x0) });
}
/** Exterior concrete / stone sill just outside the frame (within the hole bottom). */
function extSill(k, w, t, mat = 'concrete', proj = 0.05) {
  k.box('extSill', mat, w + 0.06, 0.04, proj + 0.03, 0, 0.02, -t / 2 - proj / 2 + 0.015, { r: 0.004 });
}
/** Tiles a lattice motif (segments in a unit cell [-.5, .5]²) over a rectangle, de-duplicating shared edges. */
function motif(k, role, mat, segs, x0, y0, iw, ih, cell, bw, d, z) {
  cell = Math.max(cell, Math.sqrt((iw * ih) / 40));
  const nx = Math.max(1, Math.round(iw / cell)), ny = Math.max(1, Math.round(ih / cell));
  const cw = iw / nx, ch = ih / ny;
  const seen = new Set();
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const cx = x0 + cw * (i + 0.5), cy = y0 + ch * (j + 0.5);
    for (const [a, b, c, e] of segs) {
      const X0 = cx + a * cw, Y0_ = cy + b * ch, X1 = cx + c * cw, Y1 = cy + e * ch;
      const key = [Math.min(X0, X1), Math.min(Y0_, Y1), Math.max(X0, X1), Math.max(Y0_, Y1)].map((v) => v.toFixed(4)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      // edges on the sash border are covered by the sash ring
      if ((Math.abs(X0 - X1) < 1e-6 && (Math.abs(X0 - x0) < 1e-4 || Math.abs(X0 - x0 - iw) < 1e-4)) || (Math.abs(Y0_ - Y1) < 1e-6 && (Math.abs(Y0_ - y0) < 1e-4 || Math.abs(Y0_ - y0 - ih) < 1e-4))) continue;
      bar(k, role, mat, X0, Y0_, X1, Y1, bw, d, z);
    }
  }
}
/** Points (right → left) of a pointed arch over span w springing at ys; R = radius factor × w (≥ 0.5). */
function pointedPts(w, ys, f, n, x0 = 0) {
  const R = Math.max(0.5, f) * w, cxR = x0 + w / 2 - R, cxL = x0 - w / 2 + R;
  const aTop = Math.acos(clamp((x0 - cxR) / R, -1, 1));
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (aTop * i) / n; out.push(V2(cxR + R * Math.cos(a), ys + R * Math.sin(a))); }
  for (let i = 1; i <= n; i++) { const a = PI - aTop + (aTop * i) / n; out.push(V2(cxL + R * Math.cos(a), ys + R * Math.sin(a))); }
  return out;
}
const pointedRise = (w, f) => { const R = Math.max(0.5, f) * w; return Math.sqrt(Math.max(0, R * R - (R - w / 2) ** 2)); };
/** Closed outline: rectangle (x0 ± w/2, from y0) with a segmental / round head of the given rise over springing ys. */
function archOutline(w, y0, ys, rise, n, x0 = 0) {
  const c = archCircle(w, ys, rise);
  return [V2(x0 - w / 2, y0), V2(x0 + w / 2, y0), ...arcPts(x0, c.cy, c.R, x0 + w / 2, x0 - w / 2, n)];
}
/** Casing on both faces of an interior window: legs + head, and a little stool at the bottom. */
function casingBoth(k, w, h, t, mat) {
  const cw = 0.06, ct = 0.014;
  for (const side of [-1, 1]) {
    const z = side * (t / 2 + ct / 2);
    for (const s of [-1, 1]) k.box('casing', mat, cw, h + cw - 0.01, ct, s * (w / 2 - 0.01 + cw / 2), (h + cw - 0.01) / 2, z, { r: 0.004, segs: 2 });
    k.box('casing', mat, w + 2 * (cw - 0.01), cw, ct, 0, h - 0.01 + cw / 2, z, { r: 0.004, segs: 2 });
    k.box('sill', mat, w + 0.06, 0.022, 0.035, 0, 0.011, side * (t / 2 + 0.0175 - 0.004), { r: 0.004 });
  }
}
/** Louvred panel (frame ring + tilted slats) centred at (x, y, z) in the x / y plane. */
function louvrePanel(k, role, mat, w, h, d, x, y, z, { pitch = 0.05, tilt = 0.6 } = {}) {
  ring(k, role, mat, w, h, 0.045, d, x, y, z);
  const n = Math.max(2, Math.round((h - 0.09) / pitch)), ph = (h - 0.09) / n;
  for (let i = 0; i < n; i++) k.box(role, mat, w - 0.09 + 0.004, 0.008, d * 0.85, x, y - h / 2 + 0.045 + ph * (i + 0.5), z, { r: 0, rx: -tilt });
}
/** A point of a sash after a matrix (for struts and stays that join a moving sash). */
const at = (m, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).toArray();

const openDeg = (def, max = 90, ko = '열림 각도(°)', en = 'Open angle (°)') => P.num('open', ko, en, def, 0, max, 1);
const openRatio = (def = 0) => P.num('open', '열림 정도', 'Open ratio', def, 0, 0.9, 0.05);

/* ===================================================== Korean / modern systems */

const systemTiltFixed = win({
  id: 'window-system-tilt-fixed', ko: '시스템 창호(픽스 + 틸트앤턴)', en: 'System window (fixed + tilt-turn)', w: 1.8, h: 1.5, sill: 0.9, wr: [1.0, 3.6], hr: [0.8, 2.4], frameMat: 'plastic-white', trim: false,
  anchor: { asymmetricZ: true },
  extra: [P.num('tilt', '틸트 각도(°)', 'Tilt angle (°)', 0, 0, 12, 1), P.pick('sashSide', '열림 창 위치', 'Opening sash', 'right', OPT.hinge)],
  tags: ['window', 'system window', 'tilt and turn', 'fixed window', 'upvc', '창문', '시스템 창호', '시스템창', '틸트앤턴', '픽스창', '독일식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = Math.min(0.12, t - 0.02);
    const s = p.sashSide === 'left' ? -1 : 1;
    const sw = clamp(w * 0.45, 0.45, 1.0), mx = s * (w / 2 - fb - sw - fb / 2);
    winBase(k, w, h, t, p, { fd, fb, mullions: [mx] });
    const ih = h - Y0 - 2 * fb, cy = Y0 + fb + ih / 2;
    // fixed light: triple glazing straight in the frame + a room-side glazing bead
    const fw = w - 3 * fb - sw, fx = -s * (w / 2 - fb - fw / 2);
    for (const dz of [-0.016, 0, 0.016]) k.box('glass', 'glass-clear', fw + 0.012, ih + 0.012, 0.004, fx, cy, dz, { r: 0 });
    ring(k, 'frame', p.frameMat, fw, ih, 0.018, 0.02, fx, cy, fd / 2 - 0.01);
    // tilt-turn sash: bottom-hinged tilt into the room
    const sx = s * (w / 2 - fb - sw / 2), zs = 0.015, d = fd * 0.62;
    withMatrix(k, pivot(0, Y0 + fb, zs + d / 2, { rx: p.tilt * DEG }), () => {
      sash2(k, sx, cy, sw + 0.02, ih + 0.02, zs, d, p.frameMat, { b: 0.08, triple: true });
      sashHandle(k, sx - s * (sw / 2 - 0.035), cy, zs + d / 2);
    });
    return k.group();
  },
});

const liftSlide = win({
  id: 'window-lift-slide', ko: '발코니 확장 리프트 슬라이딩 창', en: 'Lift-and-slide balcony window', w: 3.0, h: 2.2, sill: 0.05, wr: [2.0, 4.0], hr: [1.8, 2.6], frameMat: 'plastic-grey',
  extra: [openRatio(0.25)],
  tags: ['window', 'lift and slide', 'balcony window', 'sliding window', 'floor to ceiling', '창문', '발코니 창', '리프트 슬라이딩', '발코니 확장', '통창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = Math.min(0.16, t - 0.02);
    winBase(k, w, h, t, p, { fd, fb, sill: false, trim: false });
    // deep threshold track flush with the floor (two rails + drainage cover)
    k.box('frame', p.frameMat, w, Y0 + 0.004, fd + 0.02, 0, (Y0 + 0.004) / 2, 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('track', 'metal-aluminium', w - 2 * fb, 0.014, 0.008, 0, Y0 + fb + 0.007, s * fd / 4, { r: 0.001 });
    const iw = w - 2 * fb, pw = iw / 2 + 0.05, ph = h - Y0 - 2 * fb - 0.02, py = Y0 + fb + 0.012 + ph / 2, pd = fd / 2 - 0.012;
    const open = clamp(p.open, 0, 0.9) * (pw - 0.1);
    sash2(k, -iw / 2 + pw / 2, py, pw, ph, -fd / 4, pd, p.frameMat, { b: 0.1 });
    const sx = iw / 2 - pw / 2 - open;
    sash2(k, sx, py, pw, ph, fd / 4, pd, p.frameMat, { b: 0.1 });
    // the long lift handle on the sliding panel (room face) and a flush pull outside
    const zf = fd / 4 + pd / 2;
    k.rbox('hardware', 'metal-aluminium', 0.04, 0.05, 0.03, 0.008, sx + pw / 2 - 0.06, 1.05, zf + 0.012, { segs: k.seg(2, 1) });
    k.rbox('hardware', 'metal-aluminium', 0.03, 0.36, 0.024, 0.01, sx + pw / 2 - 0.06, 0.88, zf + 0.04, { segs: k.seg(2, 1) });
    k.rbox('hardware', 'metal-aluminium', 0.024, 0.3, 0.012, 0.005, sx + pw / 2 - 0.06, 1.0, -fd / 4 - pd / 2 - 0.006, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const hiSash = win({
  id: 'window-hi-sash-triple', ko: '하이샤시 3중유리 미서기 창', en: 'High-sash triple-glazed sliding window', w: 2.0, h: 1.4, sill: 0.8, wr: [1.0, 3.6], hr: [0.6, 2.4], frameMat: 'plastic-white', trim: false,
  extra: [openRatio(0), P.bool('woodFilm', '우드 필름(실내)', 'Wood-film inside', true)],
  tags: ['window', 'hi-sash', 'pvc window', 'sliding window', 'triple glazing', '창문', '하이샤시', '미서기창', '3중유리', '샷시', 'pvc 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.065, fd = Math.min(0.14, t - 0.02);
    winBase(k, w, h, t, p, { fd, fb });
    if (p.woodFilm) ring(k, 'film', 'wood-walnut', w - 0.004, h - Y0 - 0.004, fb - 0.004, 0.004, 0, Y0 + (h - Y0) / 2, fd / 2 + 0.002);
    const iw = w - 2 * fb, sw = iw / 2 + 0.045, sh = h - Y0 - 2 * fb - 0.01, sy = Y0 + fb + 0.005 + sh / 2, sd = fd / 2 - 0.014;
    for (const s of [-1, 1]) k.box('track', 'plastic-grey', iw, 0.012, 0.008, 0, Y0 + fb + 0.006, s * fd / 4, { r: 0.001 });
    const open = clamp(p.open, 0, 0.9) * (sw - 0.1);
    sash2(k, -iw / 2 + sw / 2, sy, sw, sh, -fd / 4, sd, p.frameMat, { b: 0.085, triple: true });
    sash2(k, iw / 2 - sw / 2 - open, sy, sw, sh, fd / 4, sd, p.frameMat, { b: 0.085, triple: true });
    // interlock profiles on the meeting stiles + two crescent locks
    const mx = -iw / 2 + sw - 0.02;
    k.box('sash', p.frameMat, 0.03, sh, 0.02, mx, sy, 0, { r: 0.003 });
    for (const fy of [0.35, 0.65]) k.rbox('hardware', 'metal-white', 0.035, 0.09, 0.02, 0.006, mx, Y0 + fb + sh * fy, fd / 4 + sd / 2 + 0.01, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const aluSlider = win({
  id: 'window-alu-single-slider', ko: '알루미늄 단창 미서기', en: 'Aluminium single sliding window', w: 1.5, h: 1.1, sill: 1.0, wr: [0.8, 3.0], hr: [0.5, 2.0], frameMat: 'metal-aluminium', trim: false,
  extra: [openRatio(0.4)],
  tags: ['window', 'aluminium window', 'sliding window', 'single glazing', 'utility window', '창문', '알루미늄 창', '단창', '미서기창', '다용도실 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.035, fd = 0.07;
    winBase(k, w, h, t, p, { fd, fb, zf: -t / 2 + fd / 2 + 0.02 });
    const zf = -t / 2 + fd / 2 + 0.02;
    const iw = w - 2 * fb, sw = iw / 2 + 0.025, sh = h - Y0 - 2 * fb - 0.012, sy = Y0 + fb + 0.008 + sh / 2, sd = 0.022;
    for (const s of [-1, 1]) k.box('track', 'metal-aluminium', iw, 0.016, 0.004, 0, Y0 + fb + 0.008, zf + s * 0.016, { r: 0 });
    // drainage slots on the outer face of the bottom frame
    for (const s of [-1, 1]) k.box('track', 'plastic-black', 0.04, 0.006, 0.002, s * w * 0.3, Y0 + fb / 2, zf - fd / 2 - 0.001, { r: 0 });
    const open = clamp(p.open, 0, 0.9) * (sw - 0.06);
    sash2(k, -iw / 2 + sw / 2, sy, sw, sh, zf - 0.016, sd, p.frameMat, { b: 0.04, gasket: false });
    const sx = iw / 2 - sw / 2 - open;
    sash2(k, sx, sy, sw, sh, zf + 0.016, sd, p.frameMat, { b: 0.04, gasket: false });
    k.rbox('hardware', 'plastic-grey', 0.025, 0.06, 0.016, 0.005, -iw / 2 + sw - 0.02, sy, zf + 0.016 + sd / 2 + 0.008, { segs: k.seg(2, 1) });
    k.box('hardware', 'metal-aluminium', 0.016, 0.22, 0.012, sx + sw / 2 - 0.03, sy, zf + 0.016 + sd / 2 + 0.006, { r: 0.003 });
    return k.group();
  },
});

const endVent = win({
  id: 'window-end-vent-slider', ko: '가운데 픽스 양쪽 미서기 창', en: 'End-vent sliding window (fixed centre)', w: 2.6, h: 1.3, sill: 0.8, wr: [1.6, 3.6], hr: [0.6, 2.2], frameMat: 'plastic-white', trim: true,
  extra: [openRatio(0.3)],
  tags: ['window', 'end vent slider', 'sliding window', 'fixed centre', '창문', '3분할 미서기', '미서기창', '픽스창', '거실 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.055, fd = 0.1;
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ew = iw / 4 + 0.03, cw = iw / 2, sh = h - Y0 - 2 * fb - 0.01, sy = Y0 + fb + 0.005 + sh / 2;
    // centre light glazed into the outer track; the end sashes slide over it on the room track
    sash2(k, 0, sy, cw + 0.06, sh, -fd / 4, fd / 2 - 0.012, p.frameMat, { b: 0.06 });
    k.box('track', 'plastic-grey', iw, 0.01, 0.006, 0, Y0 + fb + 0.005, fd / 4, { r: 0.001 });
    const open = clamp(p.open, 0, 0.9) * (ew - 0.08);
    for (const s of [-1, 1]) {
      const x = s * (iw / 2 - ew / 2 - open);
      sash2(k, x, sy, ew, sh, fd / 4, fd / 2 - 0.012, p.frameMat, { b: 0.06 });
      k.rbox('hardware', 'plastic-grey', 0.02, 0.16, 0.01, 0.004, x + s * (ew / 2 - 0.03), sy, fd / 4 + fd / 4 - 0.006 + 0.006, { segs: k.seg(2, 1) });
    }
    return k.group();
  },
});

const slimSlider = win({
  id: 'window-slim-slider', ko: '슬림 프레임 미니멀 슬라이딩 창', en: 'Slim-frame minimal sliding window', w: 2.8, h: 2.0, sill: 0.3, wr: [1.6, 4.0], hr: [1.0, 2.6], frameMat: 'metal-black',
  extra: [openRatio(0.2)],
  tags: ['window', 'minimal window', 'slim frame', 'sliding window', 'frameless look', '창문', '슬림 창호', '미니멀 창', '슬라이딩 창', '통창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = Math.min(0.12, t - 0.04);
    // frames hidden in the reveal: only slim head and sill tracks show
    linings(k, w, h, t, fd, 'paint-white-matte', { bottom: true });
    k.box('frame', p.frameMat, w, 0.03, fd, 0, 0.015, 0, { r: 0.002 });
    k.box('frame', p.frameMat, w, 0.04, fd, 0, h - 0.02, 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.02, h - 0.07, fd, s * (w / 2 - 0.01), 0.03 + (h - 0.07) / 2, 0, { r: 0.002 });
    const iw = w - 0.04, sw = iw / 2 + 0.012, sh = h - 0.075, sy = 0.03 + sh / 2 + 0.002, sd = 0.03;
    const open = clamp(p.open, 0, 0.9) * (sw - 0.05);
    sash2(k, -iw / 2 + sw / 2, sy, sw, sh, -fd / 4, sd, p.frameMat, { b: 0.022, gasket: false });
    sash2(k, iw / 2 - sw / 2 - open, sy, sw, sh, fd / 4, sd, p.frameMat, { b: 0.022, gasket: false });
    // slim interlock (20 mm sightline) and a small flush pull
    k.box('hardware', p.frameMat, 0.012, 0.18, 0.012, iw / 2 - sw - open + 0.03, 1.0 - 0.3, fd / 4 + sd / 2 + 0.006, { r: 0.003 });
    return k.group();
  },
});

const securityBars = win({
  id: 'window-security-bars', ko: '방범창 달린 창(스테인리스)', en: 'Window with security bars', w: 1.2, h: 1.2, sill: 1.0, wr: [0.5, 2.4], hr: [0.5, 2.0], frameMat: 'plastic-white', trim: false,
  anchor: { asymmetricZ: true },
  extra: [P.len('spacing', '살 간격', 'Bar spacing', 0.11, 0.08, 0.2), P.mat('barMat', '방범창', 'Bars', 'metal-steel', 'metal')],
  tags: ['window', 'security bars', 'burglar bars', 'window guard', '창문', '방범창', '방범 창살', '스테인리스 방범창', '저층 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) sash2(k, s * (fb / 2 + cw / 2), cy, cw + 0.02, sh, 0.012, fd * 0.7, p.frameMat);
    // square-tube grille on the exterior face, fixed to the wall with lugs
    const z = -t / 2 - 0.035, gw = w + 0.08, gh = h + 0.04, gy = gh / 2;
    ring(k, 'bars', p.barMat, gw, gh, 0.025, 0.025, 0, gy, z);
    const n = Math.max(2, Math.round((gw - 0.05) / p.spacing));
    for (let i = 1; i < n; i++) k.box('bars', p.barMat, 0.016, gh - 0.05, 0.016, -gw / 2 + 0.025 + ((gw - 0.05) * i) / n, gy, z, { r: 0.002 });
    for (const fy of [0.33, 0.66]) k.box('bars', p.barMat, gw - 0.05, 0.03, 0.006, 0, gh * fy, z + 0.012, { r: 0.002 });
    for (const sx of [-1, 1]) for (const fy of [0.15, 0.85]) k.box('bars', p.barMat, 0.04, 0.03, 0.025, sx * (gw / 2 - 0.0125), gh * fy, -t / 2 - 0.0125, { r: 0.002 });
    return k.group();
  },
});

const rollScreen = win({
  id: 'window-roll-screen', ko: '롤 방충망 창', en: 'Window with roll-up insect screen', w: 1.4, h: 1.4, sill: 0.9, wr: [0.6, 2.4], hr: [0.6, 2.2], frameMat: 'plastic-white', trim: true,
  extra: [P.num('screen', '방충망 내림', 'Screen lowered', 0.6, 0, 1, 0.05)],
  tags: ['window', 'roll screen', 'retractable screen', 'insect screen', 'mosquito net', '창문', '롤 방충망', '방충망', '모기장', '여닫이창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08, box = 0.07;
    winBase(k, w, h, t, p, { fd, fb, zf: -0.02 });
    const cw = (w - 2 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) {
      sash2(k, s * cw / 2, cy, cw + 0.01, sh, -0.008, fd * 0.7, p.frameMat);
      sashHandle(k, s * 0.03, cy, -0.008 + fd * 0.35);
    }
    // cassette in the reveal head, guide rails, mesh and the pull bar (room side)
    const z = t / 2 - 0.03, iw = w - 0.03;
    k.rbox('cassette', 'plastic-white', iw, box, 0.05, 0.012, 0, h - box / 2 - 0.004, z, { segs: k.seg(2, 1) });
    for (const s of [-1, 1]) k.box('cassette', 'plastic-white', 0.022, h - Y0 - box, 0.03, s * (iw / 2 - 0.011), Y0 + (h - Y0 - box) / 2, z, { r: 0.002 });
    const drop = clamp(p.screen, 0, 1) * (h - Y0 - box - 0.03);
    if (drop > 0.01) k.box('mesh', 'glass-tinted', iw - 0.04, drop, 0.002, 0, h - box - drop / 2, z, { r: 0 });
    k.rbox('cassette', 'plastic-grey', iw - 0.03, 0.03, 0.03, 0.008, 0, h - box - drop - 0.015, z, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const trickleVent = win({
  id: 'window-trickle-vent', ko: '자연 환기구 달린 창', en: 'Casement window with trickle vent', w: 0.9, h: 1.3, sill: 0.9, wr: [0.5, 1.6], hr: [0.6, 2.2], frameMat: 'plastic-white', trim: true,
  anchor: { asymmetricZ: true },
  extra: [openDeg(0), P.bool('ventOpen', '환기구 열림', 'Vent open', true)],
  tags: ['window', 'trickle vent', 'ventilation', 'casement window', '창문', '자연 환기구', '환기창', '여닫이창', '24시간 환기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const sw = w - 2 * fb + 0.02, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = 0.012, d = fd * 0.7;
    withMatrix(k, pivot(-w / 2 + fb, 0, zs + d / 2, { ry: -p.open * DEG }), () => {
      sash2(k, 0, cy, sw, sh, zs, d, p.frameMat);
      // the vent sits in the sash head: slotted cover inside, canopy hood outside
      const vy = cy + sh / 2 - 0.032, vw = sw - 0.18;
      k.rbox('vent', 'plastic-white', vw, 0.03, 0.016, 0.005, 0, vy, zs + d / 2 + 0.008, { segs: k.seg(2, 1) });
      for (let i = 0; i < 10; i++) k.box('vent', 'plastic-grey', vw / 14, 0.008, 0.004, -vw / 2 + vw * (i + 0.7) / 10.5, vy - 0.002, zs + d / 2 + 0.017, { r: 0 });
      k.box('vent', 'plastic-grey', 0.03, 0.012, 0.006, -vw / 2 + 0.03 + (p.ventOpen ? 0.02 : 0), vy + 0.009, zs + d / 2 + 0.018, { r: 0.002 });
      k.rbox('vent', 'plastic-white', vw, 0.02, 0.022, 0.006, 0, vy, zs - d / 2 - 0.011, { segs: k.seg(2, 1) });
      sashHandle(k, sw / 2 - 0.035, cy, zs + d / 2);
    });
    return k.group();
  },
});

/* =========================================================== hung sashes */

const singleHung = win({
  id: 'window-single-hung', ko: '외오르내리창(싱글 행)', en: 'Single-hung window', w: 0.8, h: 1.4, sill: 0.9, wr: [0.5, 1.4], hr: [0.8, 2.2], frameMat: 'plastic-white', trim: true,
  extra: [P.num('open', '열림 정도', 'Open ratio', 0.2, 0, 0.9, 0.05), P.bool('grid', '격자', 'Grid bars', false), P.bool('screen', '반망 방충망', 'Half screen', true)],
  tags: ['window', 'single hung', 'sash window', 'vinyl window', '창문', '싱글 행', '오르내리창', '미국식 창', '외오르내리창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.1;
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, sh = ih / 2 + 0.02, y0 = Y0 + fb;
    // the top light is glazed into the frame (fixed); only the lower sash lifts
    const uy = y0 + ih - sh / 2;
    k.box('glass', 'glass-clear', iw + 0.012, sh - 0.03, 0.02, 0, uy + 0.015, -fd / 4, { r: 0 });
    k.box('frame', p.frameMat, iw, 0.045, fd / 2, 0, y0 + ih - sh + 0.0225, -fd / 4, { r: 0.003 });
    if (p.grid) { k.box('frame', p.frameMat, 0.02, sh - 0.05, 0.012, 0, uy + 0.02, -fd / 4 + 0.012, { r: 0.002 }); k.box('frame', p.frameMat, iw, 0.02, 0.012, 0, uy + 0.02, -fd / 4 + 0.012, { r: 0.002 }); }
    const lift = clamp(p.open, 0, 0.9) * (sh - 0.08);
    sash2(k, 0, y0 + sh / 2 + lift, iw, sh, fd / 4, fd / 2 - 0.012, p.frameMat, { b: 0.05, grid: p.grid ? [2, 2] : null });
    // tilt latches on the top rail + finger lift on the bottom rail
    for (const s of [-1, 1]) k.box('hardware', 'plastic-white', 0.04, 0.012, 0.012, s * (iw / 2 - 0.04), y0 + sh - 0.018 + lift, fd / 2 - 0.004, { r: 0.002 });
    k.rbox('hardware', 'plastic-white', 0.08, 0.016, 0.02, 0.005, 0, y0 + 0.03 + lift, fd / 2, { segs: k.seg(2, 1) });
    if (p.screen) {
      ring(k, 'screen', 'metal-aluminium', iw, sh, 0.02, 0.01, 0, y0 + sh / 2, -fd / 2 + 0.006);
      k.box('screen', 'glass-tinted', iw - 0.03, sh - 0.03, 0.0015, 0, y0 + sh / 2, -fd / 2 + 0.006, { r: 0 });
    }
    return k.group();
  },
});

const georgian = win({
  id: 'window-georgian-sash', ko: '조지안 6+6 오르내리창', en: 'Georgian 6-over-6 sash window', w: 1.0, h: 1.75, sill: 0.75, wr: [0.6, 1.6], hr: [1.0, 2.6], frameMat: 'paint-white-gloss', trim: true,
  extra: [P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05), P.mat('stoneMat', '석재 창대·인방', 'Stone sill & lintel', 'travertine', 'stone')],
  tags: ['window', 'georgian window', 'sash window', '6 over 6', 'box sash', '창문', '조지안 창', '오르내리창', '영국식 창', '클래식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = Math.min(0.14, t - 0.03);
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, sh = ih / 2 + 0.02, y0 = Y0 + fb;
    const lift = clamp(p.open, 0, 0.9) * (sh - 0.08);
    sash2(k, 0, y0 + sh / 2 + lift, iw, sh, fd / 4, fd / 2 - 0.014, p.frameMat, { b: 0.05, grid: [3, 2], gasket: false });
    sash2(k, 0, y0 + ih - sh / 2, iw, sh, -fd / 4, fd / 2 - 0.014, p.frameMat, { b: 0.05, grid: [3, 2], gasket: false });
    // horns below the upper sash's stiles (they stop the meeting rails splitting)
    for (const s of [-1, 1]) k.lathe('sash', p.frameMat, [[0.0001, 0], [0.012, 0.012], [0.02, 0.05], [0.0001, 0.05]], s * (iw / 2 - 0.025), y0 + ih - sh - 0.05, -fd / 4, { segs: k.seg(8, 4), scale: [1, 1, 0.7] });
    k.rbox('hardware', 'metal-brass', 0.07, 0.014, 0.03, 0.005, 0, y0 + sh + lift, fd / 2 + 0.005, { segs: k.seg(2, 1) });
    for (const s of [-1, 1]) k.cyl('hardware', 'metal-brass', 0.008, 0.01, 0.025, s * iw * 0.3, y0 + 0.04 + lift, fd / 2 - 0.01, { rx: PI / 2, segs: k.seg(10, 5) });
    // stone sill and flat-arch lintel on the facade
    extSill(k, w + 0.06, t, p.stoneMat, 0.06);
    k.box('lintel', p.stoneMat, w + 0.16, 0.06, 0.02, 0, h - 0.03, -t / 2 - 0.01, { r: 0.003 });
    k.box('lintel', p.stoneMat, 0.1, 0.075, 0.03, 0, h - 0.04, -t / 2 - 0.015, { r: 0.003 });
    return k.group();
  },
});

const tripleHung = win({
  id: 'window-triple-hung', ko: '3단 오르내리 장창', en: 'Triple-hung tall sash window', w: 1.0, h: 2.4, sill: 0.25, wr: [0.6, 1.6], hr: [1.8, 2.6], frameMat: 'wood-white', trim: true,
  extra: [P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05), P.bool('grid', '격자', 'Grid bars', true)],
  tags: ['window', 'triple hung', 'tall window', 'walk-through window', 'sash window', '창문', '3단 오르내리창', '장창', '바닥창', '클래식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = Math.min(0.15, t - 0.03);
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, sh = ih / 3 + 0.02, y0 = Y0 + fb;
    const zs = [fd / 3, 0, -fd / 3], sd = fd / 3 - 0.012;
    // bottom sash slides up behind the middle one, the middle behind the top (three tracks)
    const o = clamp(p.open, 0, 0.9);
    const lift = [o * (sh - 0.06) * 2, o * (sh - 0.06), 0];
    for (let i = 0; i < 3; i++) {
      const y = y0 + sh / 2 + i * (ih - sh) / 2 + Math.min(lift[i], (2 - i) * (ih - sh) / 2);
      sash2(k, 0, y, iw, sh, zs[i], sd, p.frameMat, { b: 0.05, grid: p.grid ? [2, 2] : null, gasket: false });
    }
    for (const s of [-1, 1]) k.rbox('hardware', 'metal-brass', 0.05, 0.012, 0.025, 0.005, s * iw * 0.28, y0 + 0.04 + Math.min(lift[0], (ih - sh)), fd / 3 + sd / 2 + 0.006, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const yorkshire = win({
  id: 'window-yorkshire-sash', ko: '요크셔 가로 미닫이 창', en: 'Yorkshire horizontal sliding sash', w: 1.4, h: 1.0, sill: 1.0, wr: [0.8, 2.6], hr: [0.5, 1.6], frameMat: 'paint-white-gloss', trim: true,
  extra: [openRatio(0.25)],
  tags: ['window', 'yorkshire sash', 'horizontal sliding sash', 'cottage window', 'timber window', '창문', '요크셔 창', '가로 미닫이 창', '코티지 창', '목재 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.065, fd = 0.11;
    winBase(k, w, h, t, p, { fd, fb });
    // hardwood runner in the bottom of the box frame
    k.box('runner', 'wood-oak', w - 2 * fb, 0.012, fd * 0.6, 0, Y0 + fb + 0.006, 0, { r: 0.002 });
    const iw = w - 2 * fb, sw = iw / 2 + 0.03, sh = h - Y0 - 2 * fb - 0.012, sy = Y0 + fb + 0.012 + sh / 2;
    const open = clamp(p.open, 0, 0.9) * (sw - 0.06);
    sash2(k, iw / 2 - sw / 2, sy, sw, sh, -fd / 4, fd / 2 - 0.014, p.frameMat, { b: 0.055, grid: [3, 2], gasket: false });
    sash2(k, -iw / 2 + sw / 2 + open, sy, sw, sh, fd / 4, fd / 2 - 0.014, p.frameMat, { b: 0.055, grid: [3, 2], gasket: false });
    k.cyl('hardware', 'metal-black', 0.012, 0.012, 0.02, -iw / 2 + sw + open - 0.03, sy, fd / 4 + fd / 4 - 0.007, { rx: PI / 2, segs: k.seg(12, 6) });
    return k.group();
  },
});

/* ====================================================== casements & sashes */

const stulp = win({
  id: 'window-stulp-tilt-turn', ko: '무문설주 양개 틸트앤턴 창(스툴프)', en: 'Mullion-free double tilt-turn (stulp)', w: 1.5, h: 1.5, sill: 0.8, wr: [1.0, 2.4], hr: [0.8, 2.4], frameMat: 'plastic-white', trim: false,
  anchor: { asymmetricZ: true },
  extra: [P.num('tilt', '틸트 각도(°)', 'Tilt angle (°)', 0, 0, 12, 1), openDeg(0, 90, '수동 창 열림(°)', 'Passive sash open (°)')],
  tags: ['window', 'stulp window', 'tilt and turn', 'double casement', 'mullion free', '창문', '스툴프 창', '양개 틸트앤턴', '무문설주 창', '시스템 창호'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.065, fd = Math.min(0.12, t - 0.02);
    winBase(k, w, h, t, p, { fd, fb });
    const cw = (w - 2 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = 0.014, d = fd * 0.62;
    // passive (left) sash with the stulp bar that covers the meeting joint
    withMatrix(k, pivot(-w / 2 + fb, 0, zs + d / 2, { ry: -p.open * DEG }), () => {
      sash2(k, -cw / 2, cy, cw + 0.01, sh, zs, d, p.frameMat, { b: 0.075, triple: true });
      k.box('sash', p.frameMat, 0.05, sh - 0.01, 0.014, -0.01, cy, zs + d / 2 + 0.007, { r: 0.003 });
      k.box('hardware', 'metal-white', 0.012, 0.09, 0.01, -0.01, cy + 0.2, zs + d / 2 + 0.018, { r: 0.002 });
    });
    // active (right) sash tilts into the room
    withMatrix(k, pivot(0, Y0 + fb, zs + d / 2, { rx: p.tilt * DEG }), () => {
      sash2(k, cw / 2, cy, cw + 0.01, sh, zs, d, p.frameMat, { b: 0.075, triple: true });
      sashHandle(k, 0.06, cy, zs + d / 2);
    });
    return k.group();
  },
});

const pushOut = win({
  id: 'window-push-out-french', ko: '바깥 열림 프렌치 여닫이 창', en: 'Push-out French casement window', w: 1.2, h: 1.3, sill: 0.9, wr: [0.7, 2.2], hr: [0.6, 2.2], frameMat: 'wood-white', trim: true,
  anchor: { asymmetricZ: true }, bboxSlack: [0.12, 0.08, 0.1],
  extra: [openDeg(25), P.bool('grid', '격자', 'Grid bars', true)],
  tags: ['window', 'push out casement', 'french casement', 'outswing window', '창문', '바깥 열림 창', '프렌치 창', '여닫이창', '밀창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const cw = (w - 2 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = -0.012, d = fd * 0.7;
    for (const s of [-1, 1]) {
      // hinged on the jambs' outer edge: the sashes swing out (−z); an astragal covers the meeting stiles
      withMatrix(k, pivot(s * (w / 2 - fb), 0, zs - d / 2, { ry: -s * p.open * DEG }), () => {
        sash2(k, s * (cw / 2), cy, cw + 0.006, sh, zs, d, p.frameMat, { grid: p.grid ? [2, 3] : null });
        if (s > 0) k.box('sash', p.frameMat, 0.03, sh - 0.01, 0.012, 0.004, cy, zs + d / 2 + 0.006, { r: 0.003 });
        // push-bar operator on the room face
        k.rbox('hardware', 'metal-brass', 0.02, 0.1, 0.03, 0.006, s * 0.06, cy, zs + d / 2 + 0.015, { segs: k.seg(2, 1) });
      });
    }
    return k.group();
  },
});

const juliet = win({
  id: 'window-juliet-balcony', ko: '줄리엣 발코니 프렌치 창', en: 'French window with Juliet balcony', w: 1.4, h: 2.2, sill: 0.05, wr: [0.9, 2.4], hr: [1.8, 2.6], frameMat: 'paint-grey-matte', trim: true,
  anchor: { asymmetricZ: true }, bboxSlack: [0.16, 0.08, 0.2],
  extra: [openDeg(0), P.pick('rail', '난간', 'Balustrade', 'glass', [['glass', '유리', 'Glass'], ['bars', '철제 살', 'Steel bars']])],
  tags: ['window', 'juliet balcony', 'french window', 'balconette', 'floor window', '창문', '줄리엣 발코니', '프렌치 창', '바닥창', '난간 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.09;
    winBase(k, w, h, t, p, { fd, fb, sill: false });
    k.box('threshold', 'metal-aluminium', w, Y0, fd + 0.04, 0, Y0 / 2, 0, { r: 0.002 });
    const cw = (w - 2 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = 0.012, d = fd * 0.7;
    for (const s of [-1, 1]) {
      withMatrix(k, pivot(s * (w / 2 - fb), 0, zs + d / 2, { ry: s * p.open * DEG }), () => {
        sash2(k, s * (w / 2 - fb - cw / 2), cy, cw + 0.006, sh, zs, d, p.frameMat, { b: 0.08 });
        sashHandle(k, s * 0.04, cy * 0.75, zs + d / 2, 'metal-black');
      });
    }
    // balustrade bolted to the facade across the opening
    const z = -t / 2 - 0.06, rw = w + 0.12, top = 1.0;
    k.rbox('rail', 'metal-black', rw, 0.04, 0.05, 0.01, 0, top, z, { segs: k.seg(2, 1) });
    for (const s of [-1, 1]) k.box('rail', 'metal-black', 0.04, top - 0.1, 0.04, s * (rw / 2 - 0.02), 0.1 + (top - 0.1) / 2, z, { r: 0.004 });
    for (const s of [-1, 1]) for (const fy of [0.25, 0.85]) k.box('rail', 'metal-black', 0.03, 0.03, 0.06, s * (rw / 2 - 0.02), top * fy, -t / 2 - 0.03, { r: 0.003 });
    if (p.rail === 'glass') k.box('glass', 'glass-clear', rw - 0.1, top - 0.16, 0.012, 0, 0.1 + (top - 0.14) / 2, z, { r: 0 });
    else { const n = Math.round((rw - 0.08) / 0.11); for (let i = 1; i < n; i++) k.box('rail', 'metal-black', 0.016, top - 0.1, 0.016, -rw / 2 + 0.04 + ((rw - 0.08) * i) / n, 0.1 + (top - 0.1) / 2, z, { r: 0.002 }); }
    k.box('rail', 'metal-black', rw, 0.03, 0.04, 0, 0.115, z, { r: 0.003 });
    return k.group();
  },
});

const cross = win({
  id: 'window-cross', ko: '십자 창(크루아제)', en: 'Cross window (croisée)', w: 1.3, h: 2.0, sill: 0.6, wr: [0.8, 2.2], hr: [1.2, 2.6], frameMat: 'wood-oak', trim: true,
  anchor: { asymmetricZ: true },
  extra: [openDeg(0), P.bool('grid', '격자', 'Grid bars', true)],
  tags: ['window', 'cross window', 'croisee', 'mullion and transom', 'french window', '창문', '십자 창', '크루아제', '고성 창', '클래식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.065, fd = 0.1;
    const ih = h - Y0 - 2 * fb, ty = Y0 + fb + ih * 0.66;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0], transoms: [ty] });
    // the transom bar is wider than the frame: a moulded cross
    k.box('frame', p.frameMat, w - 2 * fb, 0.03, fd + 0.03, 0, ty, 0, { r: 0.006 });
    const cw = (w - 3 * fb) / 2, lh = ty - fb / 2 - (Y0 + fb), uh = h - fb - (ty + fb / 2), zs = 0.012, d = fd * 0.7;
    for (const s of [-1, 1]) {
      const cx = s * (fb / 2 + cw / 2);
      withMatrix(k, pivot(s * (w / 2 - fb), 0, zs + d / 2, { ry: s * p.open * DEG }), () => {
        sash2(k, cx, Y0 + fb + lh / 2, cw + 0.02, lh + 0.02, zs, d, p.frameMat, { grid: p.grid ? [2, 3] : null });
        sashHandle(k, cx - s * (cw / 2 - 0.03), Y0 + fb + lh * 0.55, zs + d / 2, 'metal-brass');
      });
      sash2(k, cx, ty + fb / 2 + uh / 2, cw + 0.02, uh + 0.02, zs, d, p.frameMat, { grid: p.grid ? [2, 2] : null, gasket: false });
    }
    return k.group();
  },
});

const casementFan = win({
  id: 'window-casement-fanlight', ko: '양여닫이 + 반원 채광 창', en: 'Twin casement with sunburst fanlight', w: 1.2, h: 1.9, sill: 0.8, wr: [0.7, 2.2], hr: [1.2, 2.6], frameMat: 'wood-white', trim: true,
  anchor: { asymmetricZ: true },
  extra: [openDeg(0), P.int('rays', '햇살 살 수', 'Sunburst bars', 5, 3, 9)],
  tags: ['window', 'fanlight', 'sunburst', 'casement', 'transom', '창문', '반원 채광창', '선버스트', '여닫이창', '클래식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    const iw = w - 2 * fb, fanH = clamp(iw / 2, 0.2, (h - Y0) * 0.4), ty = h - fb - fanH - fb / 2;
    winBase(k, w, h, t, p, { fd, fb, transoms: [ty], frame: true });
    // upper field: frame infill with a half-ellipse light and radiating glazing bars
    const y0 = ty + fb / 2, cx0 = 0, ry = h - fb - y0 - 0.02, rx = iw / 2 - 0.02, n = k.seg(32, 12);
    const half = [V2(rx, y0)];
    for (let i = 1; i < n; i++) { const a = (i / n) * PI; half.push(V2(rx * Math.cos(a), y0 + ry * Math.sin(a))); }
    half.push(V2(-rx, y0));
    const field = new THREE.Shape(rectPts(-iw / 2, y0, iw / 2, h - fb));
    field.holes.push(new THREE.Path([...half].reverse()));
    k.panel('frame', p.frameMat, field, fd * 0.8, 0, 0, 0, { bevel: 0.002 });
    glassIn(k, half);
    const nr = clamp(Math.round(p.rays), 3, 9);
    for (let i = 1; i <= nr; i++) { const a = (i / (nr + 1)) * PI; bar(k, 'sash', p.frameMat, cx0 + 0.06 * Math.cos(a), y0 + 0.06 * Math.sin(a), rx * Math.cos(a), y0 + ry * Math.sin(a), 0.018, fd * 0.5, 0, 0.002); }
    k.cyl('sash', p.frameMat, 0.06, 0.06, fd * 0.5, 0, y0, -fd * 0.25, { rx: PI / 2, segs: k.seg(16, 8) });
    // lower: a pair of casements
    const cw = iw / 2, lh = ty - fb / 2 - (Y0 + fb), cy = Y0 + fb + lh / 2, zs = 0.012, d = fd * 0.7;
    for (const s of [-1, 1]) {
      withMatrix(k, pivot(s * (w / 2 - fb), 0, zs + d / 2, { ry: s * p.open * DEG }), () => {
        sash2(k, s * cw / 2, cy, cw + 0.006, lh + 0.02, zs, d, p.frameMat, { grid: [1, 3] });
        sashHandle(k, s * 0.035, cy, zs + d / 2, 'metal-brass');
      });
    }
    return k.group();
  },
});

const scandi = win({
  id: 'window-scandi-coupled', ko: '북유럽 커플드 여닫이 창(이중 창짝)', en: 'Scandinavian coupled casement', w: 1.2, h: 1.4, sill: 0.8, wr: [0.6, 2.2], hr: [0.6, 2.2], frameMat: 'paint-white-matte', trim: true,
  anchor: { asymmetricZ: true },
  extra: [openDeg(0)],
  tags: ['window', 'coupled casement', 'scandinavian window', 'double sash', 'inward opening', '창문', '북유럽 창', '이중 창짝', '커플드 창', '안여닫이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = Math.min(0.13, t - 0.03);
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    // two sashes in depth (outer single pane, inner sealed unit) screwed together, opening inwards
    const zo = -0.012, zi = 0.03, d = 0.04;
    for (const s of [-1, 1]) {
      const cx = s * (fb / 2 + cw / 2);
      withMatrix(k, pivot(s * (w / 2 - fb), 0, zi + d / 2, { ry: s * p.open * DEG }), () => {
        sash2(k, cx, cy, cw + 0.02, sh, zo, d, p.frameMat, { b: 0.05, gasket: false });
        sash2(k, cx, cy, cw + 0.02, sh, zi, d, p.frameMat, { b: 0.055 });
        for (const fy of [0.1, 0.9]) for (const e of [-1, 1]) k.cyl('hardware', 'metal-black', 0.006, 0.006, 0.004, cx + e * (cw / 2 - 0.02), Y0 + fb + (sh - 0.02) * fy, zi + d / 2, { rx: PI / 2, segs: k.seg(8, 5) });
        sashHandle(k, cx - s * (cw / 2 - 0.03), cy, zi + d / 2, 'metal-black');
      });
    }
    return k.group();
  },
});

const passive = win({
  id: 'window-passive-wood-alu', ko: '패시브하우스 목알루 3중 창', en: 'Passive-house wood-aluminium window', w: 1.2, h: 1.5, sill: 0.8, wr: [0.6, 2.4], hr: [0.6, 2.4], frameMat: 'wood-oak', trim: false,
  anchor: { asymmetricZ: true },
  extra: [P.num('tilt', '틸트 각도(°)', 'Tilt angle (°)', 0, 0, 12, 1), P.mat('cladMat', '외부 알루미늄', 'Outer cladding', 'metal-aluminium', 'metal')],
  tags: ['window', 'passive house', 'wood aluminium', 'triple glazing', 'energy efficient', '창문', '패시브하우스 창', '목알루 창', '3중유리', '고단열 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.11, fd = Math.min(0.13, t - 0.03);
    // wide insulated timber frame inside, aluminium shell outside, render returned over the frame edge
    winBase(k, w, h, t, p, { fd: fd * 0.75, fb, zf: fd * 0.125 });
    ring(k, 'clad', p.cladMat, w, h - Y0, fb - 0.02, fd * 0.25, 0, Y0 + (h - Y0) / 2, -fd * 0.375);
    ring(k, 'render', 'wall-plaster', w + 0.002, h - Y0 + 0.001, 0.035, 0.03, 0, Y0 + (h - Y0) / 2, -t / 2 + 0.015);
    // sloped aluminium outer sill with end caps
    k.box('clad', p.cladMat, w + 0.04, 0.012, 0.09, 0, 0.012, -t / 2 - 0.02, { r: 0.002, rx: 0.08 });
    const sw = w - 2 * fb + 0.03, sh = h - Y0 - 2 * fb + 0.03, cy = Y0 + (h - Y0) / 2, zs = fd * 0.2, d = fd * 0.5;
    withMatrix(k, pivot(0, Y0 + fb, zs + d / 2, { rx: p.tilt * DEG }), () => {
      sash2(k, 0, cy, sw, sh, zs, d, p.frameMat, { b: 0.1, triple: true });
      sashHandle(k, sw / 2 - 0.04, cy, zs + d / 2, 'metal-steel');
    });
    return k.group();
  },
});

const psk = win({
  id: 'window-psk-parallel', ko: '평행 슬라이딩 틸트 창(PSK)', en: 'Parallel sliding tilt window (PSK)', w: 2.0, h: 1.5, sill: 0.6, wr: [1.2, 3.6], hr: [0.8, 2.4], frameMat: 'plastic-white', trim: false,
  anchor: { asymmetricZ: true },
  extra: [openRatio(0.3)],
  tags: ['window', 'parallel sliding', 'tilt slide', 'psk', 'patio window', '창문', '평행 슬라이딩 창', 'psk 창', '틸트 슬라이딩', '시스템 창호'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = Math.min(0.12, t - 0.02);
    const iw = w - 3 * fb, fw = iw / 2, mx = -w / 2 + fb + fw + fb / 2;
    winBase(k, w, h, t, p, { fd, fb, mullions: [mx] });
    const ih = h - Y0 - 2 * fb, cy = Y0 + fb + ih / 2;
    // fixed light (left)
    sash2(k, -w / 2 + fb + fw / 2, cy, fw + 0.02, ih + 0.02, 0.0, fd * 0.6, p.frameMat, { b: 0.075 });
    // the sash steps out of the frame (parallel, into the room) and runs on rails over the fixed light
    const o = clamp(p.open, 0, 0.9), step = o > 0 ? 0.075 : 0, sx = w / 2 - fb - fw / 2 - o * (fw + fb);
    const zs = 0.008 + step;
    sash2(k, sx, cy, fw + 0.03, ih + 0.03, zs, fd * 0.6, p.frameMat, { b: 0.075 });
    sashHandle(k, sx + fw / 2 - 0.03, cy, zs + fd * 0.3);
    for (const y of [Y0 + fb - 0.012, h - fb + 0.012]) k.box('rail', 'metal-aluminium', w - 2 * fb, 0.014, 0.018, 0, y, fd / 2 + 0.01, { r: 0.002 });
    for (const e of [-1, 1]) k.box('rail', 'metal-aluminium', 0.04, 0.03, step + 0.03, sx + e * (fw / 2 - 0.05), Y0 + fb - 0.004, fd / 2 + (step + 0.03) / 2 - 0.01, { r: 0.003 });
    return k.group();
  },
});

const verticalPivot = win({
  id: 'window-vertical-pivot', ko: '세로축 회전창', en: 'Vertical pivot window', w: 1.0, h: 1.6, sill: 0.7, wr: [0.5, 1.8], hr: [0.6, 2.4], frameMat: 'metal-black', trim: false,
  anchor: { asymmetricZ: true },
  extra: [openDeg(0, 90, '회전 각도(°)', 'Turn angle (°)')],
  tags: ['window', 'pivot window', 'vertical pivot', 'centre pivot', 'revolving window', '창문', '세로축 회전창', '피벗 창', '회전창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = 0.07;
    winBase(k, w, h, t, p, { fd, fb });
    const sw = w - 2 * fb - 0.006, sh = h - Y0 - 2 * fb - 0.006, cy = Y0 + (h - Y0) / 2;
    withMatrix(k, pivot(0, 0, 0, { ry: p.open * DEG }), () => {
      sash2(k, 0, cy, sw, sh, 0, fd * 0.6, p.frameMat, { b: 0.05 });
      sashHandle(k, sw / 2 - 0.03, cy, fd * 0.3, 'metal-black');
    });
    // pivot bearings top and bottom
    for (const y of [Y0 + fb - 0.004, h - fb + 0.004]) k.cyl('hardware', 'metal-steel', 0.012, 0.012, 0.012, 0, y - 0.006, 0, { segs: k.seg(12, 6) });
    return k.group();
  },
});

const secondary = win({
  id: 'window-secondary-glazing', ko: '내창 덧유리(2차 글레이징) 창', en: 'Window with secondary glazing', w: 1.2, h: 1.4, sill: 0.9, wr: [0.6, 2.4], hr: [0.6, 2.2], frameMat: 'wood-white', trim: true,
  extra: [openRatio(0)],
  tags: ['window', 'secondary glazing', 'acoustic window', 'soundproof', 'heritage window', '창문', '덧유리', '2차 글레이징', '방음 창', '내창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.07, zf = -t / 2 + fd / 2 + 0.015;
    winBase(k, w, h, t, p, { fd, fb, zf, mullions: [zf * 0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) sash2(k, s * (fb / 2 + cw / 2), cy, cw + 0.02, sh, zf + 0.008, fd * 0.7, p.frameMat, { grid: [1, 2], gasket: false });
    // slim aluminium secondary frame near the room face with two horizontal sliders
    const z = t / 2 - 0.04, iw = w - 0.02, ih = h - Y0 - 0.01;
    ring(k, 'secondary', 'metal-white', iw, ih, 0.025, 0.04, 0, Y0 + ih / 2, z);
    const sw2 = (iw - 0.05) / 2 + 0.02, sh2 = ih - 0.05, sy = Y0 + ih / 2;
    const open = clamp(p.open, 0, 0.9) * (sw2 - 0.04);
    sash2(k, -iw / 2 + 0.025 + sw2 / 2, sy, sw2, sh2, z - 0.009, 0.014, 'metal-white', { b: 0.022, gasket: false, role: 'secondary' });
    sash2(k, iw / 2 - 0.025 - sw2 / 2 - open, sy, sw2, sh2, z + 0.009, 0.014, 'metal-white', { b: 0.022, gasket: false, role: 'secondary' });
    return k.group();
  },
});

/* =================================================== skylights / roof lights */

const roofElectric = win({
  id: 'window-roof-electric', ko: '전동 환기 천창(빗물 센서)', en: 'Electric venting roof window', w: 0.78, h: 1.4, sill: 1.1, wr: [0.5, 1.4], hr: [0.8, 1.8], frameMat: 'paint-white-matte',
  anchor: { asymmetricZ: true }, bboxSlack: [0.14, 0.1, 0.12],
  extra: [openDeg(0, 30, '열림 각도(°)', 'Vent angle (°)'), P.mat('cladding', '외부 커버', 'Cladding', 'metal-black', 'metal')],
  tags: ['window', 'roof window', 'skylight', 'electric skylight', 'rain sensor', '창문', '천창', '전동 천창', '빗물 센서', '다락 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = 0.1;
    ring(k, 'frame', p.frameMat, w, h, fb, fd, 0, h / 2, 0);
    linings(k, w, h, t, fd, 'paint-white-matte', { bottom: true });
    // top-hung sash venting out, chain actuator on the bottom frame, sensor on the flashing
    const sw = w - 2 * fb + 0.02, sh = h - 2 * fb + 0.02, top = h - fb + 0.01;
    const m = pivot(0, top, -fd / 2, { rx: -p.open * DEG });
    withMatrix(k, m, () => sash2(k, 0, top - sh / 2, sw, sh, 0, fd * 0.7, p.frameMat, { b: 0.06 }));
    k.rbox('motor', 'plastic-white', w * 0.55, 0.045, 0.05, 0.01, 0, fb + 0.0225, fd / 2 + 0.02, { segs: k.seg(2, 1) });
    const tip = at(m, 0, top - sh + 0.03, -fd * 0.35);
    k.rod('motor', 'metal-steel', [0, fb + 0.03, fd / 2 - 0.005], tip, 0.006, { segs: k.seg(8, 4) });
    ring(k, 'cladding', p.cladding, w + 0.08, h + 0.04, 0.06, 0.03, 0, (h + 0.04) / 2, -t / 2 - 0.015);
    k.rbox('cladding', 'plastic-black', 0.06, 0.03, 0.02, 0.005, w / 2 - 0.04, h + 0.0, -t / 2 - 0.04, { segs: k.seg(2, 1) });
    return k.group();
  },
});

/* ============================================== shop, kiosk & interior glazing */

const servingHatch = win({
  id: 'window-serving-hatch', ko: '서빙 해치 창(가스 스프링)', en: 'Serving hatch window with gas struts', w: 1.6, h: 1.0, sill: 0.95, wr: [0.8, 3.0], hr: [0.6, 1.6], frameMat: 'metal-aluminium',
  anchor: { asymmetricZ: true }, bboxSlack: [0.14, 0.1, 0.45],
  extra: [openDeg(70, 85), P.mat('counterMat', '카운터', 'Counter', 'wood-teak', 'wood')],
  tags: ['window', 'serving hatch', 'kiosk window', 'food truck', 'bar hatch', '창문', '서빙 창', '배식창', '키오스크 창', '가스 스프링'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, sill: false, trim: false });
    // counter boards inside and out at the bottom of the hole
    k.box('counter', p.counterMat, w + 0.06, 0.035, t + 0.5, 0, 0.0175, -0.05, { r: 0.004 });
    const sw = w - 2 * fb + 0.02, sh = h - Y0 - 2 * fb + 0.02, top = h - fb + 0.01;
    const m = pivot(0, top, -fd / 2, { rx: -p.open * DEG });
    withMatrix(k, m, () => {
      sash2(k, 0, top - sh / 2, sw, sh, -0.01, fd * 0.6, p.frameMat, { b: 0.05 });
      k.rbox('hardware', 'metal-black', 0.3, 0.025, 0.03, 0.008, 0, top - sh + 0.05, -0.01 + fd * 0.3 + 0.015, { segs: k.seg(2, 1) });
    });
    // gas struts from the jambs to the sash stiles
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - fb - 0.02);
      const a = [x, Y0 + fb + (h - Y0) * 0.25, -fd / 2 + 0.01], b = at(m, x, top - sh * 0.55, -0.01 - fd * 0.3);
      k.rod('strut', 'metal-black', a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], 0.011, { segs: k.seg(10, 5) });
      k.rod('strut', 'metal-steel', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b, 0.005, { segs: k.seg(8, 4) });
    }
    return k.group();
  },
});

const ticket = win({
  id: 'window-ticket', ko: '매표소 창(통화구·전달함)', en: 'Ticket window with speaking grille', w: 1.2, h: 1.0, sill: 0.95, wr: [0.6, 2.4], hr: [0.6, 1.6], frameMat: 'metal-aluminium',
  extra: [P.mat('counterMat', '카운터', 'Counter', 'granite-grey', 'stone')],
  tags: ['window', 'ticket window', 'speaking grille', 'deal tray', 'reception window', '창문', '매표소 창', '통화구', '접수 창구', '안내 창구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.04, fd = 0.06;
    winBase(k, w, h, t, p, { fd, fb, sill: false, trim: false });
    // counters both sides with a stainless deal tray dipping under the glass
    k.box('counter', p.counterMat, w + 0.08, 0.03, t + 0.36, 0, 0.015, 0, { r: 0.004 });
    const tw = clamp(w * 0.35, 0.25, 0.45);
    k.box('tray', 'metal-steel', tw, 0.012, t + 0.2, 0, 0.036, 0, { r: 0.002 });
    k.box('tray', 'metal-steel', tw, 0.04, 0.006, 0, 0.05, 0, { r: 0.001 });
    const ih = h - Y0 - 2 * fb, gy0 = Y0 + fb + 0.06, gh = ih - 0.06, cy = gy0 + gh / 2;
    k.box('glass', 'glass-clear', w - 2 * fb + 0.012, gh + 0.012, 0.012, 0, cy, 0, { r: 0 });
    ring(k, 'frame', p.frameMat, w - 2 * fb, gh, 0.012, 0.02, 0, cy, fd / 2 - 0.01);
    // round speaking grille through the glass at mouth height
    const gy = Math.min(h - fb - 0.12, gy0 + 0.35);
    k.panel('grille', 'metal-steel', circleShape(0.075, 0, gy, 0.06), 0.022, 0, 0, 0, { bevel: 0.002 });
    for (let i = -2; i <= 2; i++) k.box('grille', 'metal-steel', 0.11 * Math.cos(Math.asin(clamp(i / 3, -1, 1))), 0.006, 0.014, 0, gy + i * 0.022, 0, { r: 0 });
    return k.group();
  },
});

const driveThrough = win({
  id: 'window-drive-through', ko: '드라이브스루 양개 미닫이 창', en: 'Drive-through bi-parting window', w: 1.4, h: 1.1, sill: 1.0, wr: [1.0, 2.4], hr: [0.7, 1.6], frameMat: 'metal-aluminium',
  anchor: { asymmetricZ: true }, bboxSlack: [0.14, 0.08, 0.3],
  extra: [openRatio(0.5)],
  tags: ['window', 'drive through', 'bi-parting slider', 'pickup window', 'service window', '창문', '드라이브스루 창', '픽업 창', '서비스 창', '미닫이창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = 0.1;
    winBase(k, w, h, t, p, { fd, fb, sill: false, trim: false });
    k.box('counter', 'metal-steel', w + 0.04, Y0, t * 0.7, 0, Y0 / 2, 0.02, { r: 0.002 });
    // exterior tray shelf (no brackets below the hole: a folded stainless shelf)
    k.box('counter', 'metal-steel', w * 0.6, 0.03, 0.26, 0, 0.015, -t / 2 - 0.13, { r: 0.004 });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb - 0.01, cy = Y0 + fb + 0.005 + ih / 2;
    const fw = iw / 4 + 0.02, sw = iw / 4 + 0.02;
    // fixed side lights (outer track), sliders meet in the middle and part into the pockets
    for (const s of [-1, 1]) sash2(k, s * (iw / 2 - fw / 2), cy, fw, ih, -fd / 4, fd / 2 - 0.014, p.frameMat, { b: 0.04 });
    const o = clamp(p.open, 0, 0.9) * (sw - 0.04);
    for (const s of [-1, 1]) {
      const x = s * (sw / 2 + o);
      sash2(k, x, cy, sw + 0.02, ih, fd / 4, fd / 2 - 0.014, p.frameMat, { b: 0.04 });
      k.box('hardware', 'plastic-black', 0.02, 0.2, 0.02, x - s * (sw / 2 - 0.02), cy, fd / 4 + fd / 4, { r: 0.004 });
    }
    // speaker / call box beside the window, outside
    k.rbox('speaker', 'metal-steel', 0.12, 0.18, 0.04, 0.01, w / 2 - 0.1, h * 0.55, -t / 2 - 0.02, { segs: k.seg(2, 1) });
    k.cyl('speaker', 'plastic-black', 0.035, 0.035, 0.004, w / 2 - 0.1, h * 0.56, -t / 2 - 0.04, { rx: -PI / 2, segs: k.seg(16, 8) });
    return k.group();
  },
});

const borrowed = win({
  id: 'window-borrowed-light', ko: '실내 채광 고창(보로우드 라이트)', en: 'Interior borrowed-light transom', w: 1.2, h: 0.45, sill: 2.0, wr: [0.5, 3.6], hr: [0.2, 1.0], frameMat: 'wood-white',
  extra: [P.int('lights', '칸 수', 'Lights', 3, 1, 8), glassParam('glass-frosted')],
  tags: ['window', 'borrowed light', 'interior window', 'transom', 'clerestory', '창문', '실내 창', '고창', '채광창', '복도 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.03, fd = 0.05;
    linings(k, w, h, t, fd, p.frameMat, { bottom: true });
    ring(k, 'frame', p.frameMat, w - 0.024, h - 0.024, fb, fd, 0, h / 2, 0);
    casingBoth(k, w, h, t, p.frameMat);
    const n = clamp(Math.round(p.lights), 1, 8), iw = w - 0.024 - 2 * fb, ih = h - 0.024 - 2 * fb, lw = iw / n;
    for (let i = 1; i < n; i++) k.box('frame', p.frameMat, 0.03, ih, fd, -iw / 2 + lw * i, h / 2, 0, { r: 0.002 });
    k.box('glass', p.glassMat, iw + 0.01, ih + 0.01, 0.008, 0, h / 2, 0, { r: 0 });
    for (const s of [-1, 1]) ring(k, 'frame', p.frameMat, iw, ih, 0.012, 0.012, 0, h / 2, s * 0.012);
    return k.group();
  },
});

const interiorSteel = win({
  id: 'window-interior-steel', ko: '실내 철제 격자 유리창', en: 'Interior steel-framed glass window', w: 2.0, h: 1.2, sill: 0.9, wr: [0.6, 3.6], hr: [0.4, 2.4], frameMat: 'metal-black',
  extra: [P.int('cols', '세로 칸', 'Columns', 4, 1, 10), P.int('rows', '가로 칸', 'Rows', 2, 1, 6), glassParam()],
  tags: ['window', 'interior window', 'steel window', 'crittall', 'glass partition', 'industrial', '창문', '실내 창', '철제 유리창', '파티션 창', '인더스트리얼'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.035, fd = 0.045;
    linings(k, w, h, t, fd, 'paint-white-matte', { bottom: true });
    ring(k, 'frame', p.frameMat, w - 0.024, h - 0.024, fb, fd, 0, h / 2, 0);
    const iw = w - 0.024 - 2 * fb, ih = h - 0.024 - 2 * fb;
    k.box('glass', p.glassMat, iw + 0.01, ih + 0.01, 0.008, 0, h / 2, 0, { r: 0 });
    const c = clamp(Math.round(p.cols), 1, 10), r = clamp(Math.round(p.rows), 1, 6);
    for (let i = 1; i < c; i++) k.box('frame', p.frameMat, 0.025, ih, 0.03, -iw / 2 + (iw * i) / c, h / 2, 0, { r: 0.002 });
    for (let j = 1; j < r; j++) k.box('frame', p.frameMat, iw, 0.025, 0.03, 0, h / 2 - ih / 2 + (ih * j) / r, 0, { r: 0.002 });
    // glazing angles on both faces
    for (const s of [-1, 1]) ring(k, 'frame', p.frameMat, iw, ih, 0.01, 0.01, 0, h / 2, s * 0.012);
    return k.group();
  },
});

const yukimi = win({
  id: 'window-yukimi-shoji', ko: '유키미 쇼지 창(일본식)', en: 'Yukimi shoji window', w: 1.6, h: 1.2, sill: 0.6, wr: [0.8, 3.0], hr: [0.6, 2.0], frameMat: 'wood-pine',
  extra: [openRatio(0.25)],
  tags: ['window', 'shoji', 'yukimi shoji', 'japanese window', 'paper screen', '창문', '쇼지 창', '유키미 쇼지', '일본식 창', '창호지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = 0.06, zf = -t / 2 + fd / 2 + 0.01;
    // plain glazed outer window, shoji pair on a double track at the room face
    winBase(k, w, h, t, p, { fd, fb, zf, trim: false, trimMat: 'wood-pine' });
    k.box('glass', 'glass-clear', w - 2 * fb + 0.01, h - Y0 - 2 * fb + 0.01, 0.02, 0, Y0 + (h - Y0) / 2, zf, { r: 0 });
    const zt = t / 2 - 0.03, iw = w - 0.02, ph = h - Y0 - 0.03, py = Y0 + 0.012 + ph / 2;
    for (const y of [Y0 + 0.006, h - 0.012]) k.box('track', p.frameMat, iw, 0.012, 0.05, 0, y, zt, { r: 0.002 });
    const pw = iw / 2 + 0.015, o = clamp(p.open, 0, 0.9) * (pw - 0.05);
    [[-iw / 2 + pw / 2, zt - 0.012], [iw / 2 - pw / 2 - o, zt + 0.012]].forEach(([x, z]) => {
      ring(k, 'shoji', p.frameMat, pw, ph, 0.03, 0.022, x, py, z);
      const gh = ph * 0.32, y0 = py - ph / 2 + 0.03;
      k.box('glass', 'glass-clear', pw - 0.05, gh, 0.004, x, y0 + gh / 2, z, { r: 0 });
      k.box('shoji', p.frameMat, pw - 0.06, 0.02, 0.018, x, y0 + gh, z, { r: 0.001 });
      const top = py + ph / 2 - 0.03, ph2 = top - (y0 + gh + 0.01);
      k.box('paper', 'paper', pw - 0.055, ph2, 0.002, x, y0 + gh + 0.01 + ph2 / 2, z - 0.006, { r: 0 });
      // kumiko: narrow vertical bars, wider-spaced horizontals
      const nv = Math.max(2, Math.round((pw - 0.06) / 0.1));
      for (let i = 1; i < nv; i++) k.box('shoji', p.frameMat, 0.01, ph2, 0.012, x - (pw - 0.06) / 2 + ((pw - 0.06) * i) / nv, y0 + gh + 0.01 + ph2 / 2, z, { r: 0 });
      const nh = Math.max(2, Math.round(ph2 / 0.22));
      for (let j = 1; j < nh; j++) k.box('shoji', p.frameMat, pw - 0.06, 0.01, 0.012, x, y0 + gh + 0.01 + (ph2 * j) / nh, z, { r: 0 });
      k.box('shoji', 'wood-dark', 0.012, 0.06, 0.004, x + (z > zt ? -1 : 1) * (pw / 2 - 0.05), py, z + 0.013, { r: 0.001 });
    });
    return k.group();
  },
});

/* ======================================================== lattice patterns */

// 卍: a cross through the cell (joins the neighbours at the edge midpoints) with hooks turning the same way
const MOTIF_WANJA = [[0, -0.5, 0, 0.5], [-0.5, 0, 0.5, 0], [0, 0.3, 0.3, 0.3], [0.3, 0, 0.3, -0.3], [0, -0.3, -0.3, -0.3], [-0.3, 0, -0.3, 0.3]];
const AJA = [[-0.25, 0.5], [0.25, 0.5], [0.25, 0.25], [0.5, 0.25], [0.5, -0.25], [0.25, -0.25], [0.25, -0.5], [-0.25, -0.5], [-0.25, -0.25], [-0.5, -0.25], [-0.5, 0.25], [-0.25, 0.25]];
const MOTIF_AJA = AJA.map((a, i) => { const b = AJA[(i + 1) % AJA.length]; return [a[0], a[1], b[0], b[1]]; });

/** Hanok paper window pair with a lattice motif, opening outwards like 창호. */
function hanokLattice(id, ko, en, motifSegs, tags) {
  return win({
    id, ko, en, w: 1.2, h: 1.1, sill: 0.45, wr: [0.6, 2.4], hr: [0.5, 2.0], frameMat: 'wood-dark',
    anchor: { asymmetricZ: true },
    extra: [openDeg(0), P.len('cell', '살 간격', 'Pattern size', 0.13, 0.08, 0.22)],
    tags,
    build: (p, ctx) => {
      const k = new Kit(ctx);
      const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.09;
      winBase(k, w, h, t, p, { fd, fb, trimMat: 'wood-dark', lining: 'wall-plaster' });
      const cw = (w - 2 * fb) / 2, sh = h - Y0 - 2 * fb, cy = Y0 + fb + sh / 2, zs = -0.01, d = 0.045, b = 0.04;
      for (const s of [-1, 1]) {
        withMatrix(k, pivot(s * (w / 2 - fb), 0, zs - d / 2, { ry: -s * p.open * DEG }), () => {
          const cx = s * (w / 2 - fb - cw / 2);
          ring(k, 'sash', p.frameMat, cw, sh, b, d, cx, cy, zs);
          // paper on the outer face, lattice behind it
          k.box('paper', 'paper', cw - 2 * b + 0.006, sh - 2 * b + 0.006, 0.002, cx, cy, zs - d / 4 - 0.001, { r: 0 });
          motif(k, 'sash', p.frameMat, motifSegs, cx - cw / 2 + b, cy - sh / 2 + b, cw - 2 * b, sh - 2 * b, p.cell, 0.012, d / 2, zs + d / 8);
          // iron ring pull (문고리) on the room face near the meeting stile
          k.cyl('hardware', 'metal-black', 0.022, 0.022, 0.004, cx - s * (cw / 2 - 0.05), cy, zs + d / 2, { rx: PI / 2, segs: k.seg(14, 6) });
        });
      }
      return k.group();
    },
  });
}
const wanja = hanokLattice('window-hanok-wanja', '한옥 완자창(卍자 살)', 'Hanok wanja (swastika-fret) lattice window', MOTIF_WANJA,
  ['window', 'hanok window', 'korean lattice', 'fret lattice', 'wanja', '창문', '한옥 창', '완자창', '卍자 살', '전통 창호']);
const aja = hanokLattice('window-hanok-aja', '한옥 아자창(亞자 살)', 'Hanok aja (亞-pattern) lattice window', MOTIF_AJA,
  ['window', 'hanok window', 'korean lattice', 'aja pattern', '창문', '한옥 창', '아자창', '亞자 살', '전통 창호']);

const chineseMoon = win({
  id: 'window-chinese-moon', ko: '중국식 원형 격자 창(월창)', en: 'Chinese moon lattice window', w: 1.1, h: 1.1, sill: 0.8, wr: [0.6, 2.0], hr: [0.6, 2.0], frameMat: 'wood-dark', trim: false,
  extra: [P.len('step', '격자 간격', 'Lattice step', 0.09, 0.06, 0.16)],
  tags: ['window', 'moon window', 'chinese window', 'lattice window', 'round window', '창문', '월창', '중국식 창', '원형 격자 창', '동양풍 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = 0.1;
    const cy = Y0 + (h - Y0) / 2, R = Math.min(w, h - Y0) / 2 - 0.07, n = k.seg(64, 24);
    const circ = radial(() => R, 0, cy, n);
    framePanel(k, p.frameMat, w, h, [circ], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-dark', { trim: false });
    glassIn(k, circ, 'glass-frosted', -fd * 0.3);
    radialBead(k, 'lattice', p.frameMat, () => R, 0, cy, n, 0.025, fd * 0.6, fd * 0.2);
    // stepped fret grid clipped to the circle, with an inner square frame turned 45°
    const step = clamp(p.step, 0.06, 0.16), bw = 0.014, d = fd * 0.4, z = fd * 0.1;
    for (let v = -R + step; v < R - 0.01; v += step) {
      const c = Math.sqrt(Math.max(0, R * R - v * v));
      const gap = Math.abs(v) < R * 0.35 ? R * 0.35 : 0;
      for (const [a, b] of gap ? [[-c, -gap], [gap, c]] : [[-c, c]]) {
        if (b - a < 0.01) continue;
        bar(k, 'lattice', p.frameMat, a, cy + v, b, cy + v, bw, d, z);
        bar(k, 'lattice', p.frameMat, v, cy + a, v, cy + b, bw, d, z);
      }
    }
    const q = R * 0.35 * Math.SQRT2;
    const sq = [[0, q], [q, 0], [0, -q], [-q, 0]];
    for (let i = 0; i < 4; i++) bar(k, 'lattice', p.frameMat, sq[i][0], cy + sq[i][1], sq[(i + 1) % 4][0], cy + sq[(i + 1) % 4][1], 0.02, d, z);
    return k.group();
  },
});

/* ========================================================= period windows */

const queenAnne = win({
  id: 'window-queen-anne', ko: '퀸앤 색유리 테두리 오르내리창', en: 'Queen Anne window with coloured border lites', w: 0.95, h: 1.6, sill: 0.8, wr: [0.6, 1.6], hr: [1.0, 2.4], frameMat: 'paint-white-gloss', trim: true,
  extra: [P.color('color1', '색유리 1', 'Glass colour 1', '#b8483a'), P.color('color2', '색유리 2', 'Glass colour 2', '#d9b34a')],
  tags: ['window', 'queen anne', 'victorian window', 'coloured glass', 'sash window', '창문', '퀸앤 창', '빅토리안 창', '색유리', '오르내리창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.12;
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, sh = ih / 2 + 0.02, y0 = Y0 + fb;
    sash2(k, 0, y0 + sh / 2, iw, sh, fd / 4, fd / 2 - 0.012, p.frameMat, { b: 0.055, gasket: false });
    // upper sash: big centre pane ringed by small lites — coloured corners, amber edges
    const z = -fd / 4, uy = y0 + ih - sh / 2, b = 0.055, d = fd / 2 - 0.012;
    ring(k, 'sash', p.frameMat, iw, sh, b, d, 0, uy, z, {});
    const ow = iw - 2 * b, oh = sh - 2 * b, e = clamp(Math.min(ow, oh) * 0.18, 0.06, 0.11), mw = 0.016;
    k.box('glass', 'glass-clear', ow - 2 * e + 0.006, oh - 2 * e + 0.006, 0.014, 0, uy, z, { r: 0 });
    const nx = Math.max(1, Math.round((ow - 2 * e) / 0.12)), ny = Math.max(1, Math.round((oh - 2 * e) / 0.12));
    const tile = (x, y, ww, hh, col) => k.box('glass', 'glass-tinted', ww, hh, 0.014, x, y, z, { r: 0, overrides: { color: col } });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) tile(sx * (ow / 2 - e / 2), uy + sy * (oh / 2 - e / 2), e, e, p.color1);
    for (let i = 0; i < nx; i++) for (const sy of [-1, 1]) tile(-ow / 2 + e + (ow - 2 * e) * (i + 0.5) / nx, uy + sy * (oh / 2 - e / 2), (ow - 2 * e) / nx, e, p.color2);
    for (let j = 0; j < ny; j++) for (const sx of [-1, 1]) tile(sx * (ow / 2 - e / 2), uy - oh / 2 + e + (oh - 2 * e) * (j + 0.5) / ny, e, (oh - 2 * e) / ny, p.color2);
    for (const s of [-1, 1]) {
      k.box('sash', p.frameMat, mw, oh, d * 0.6, s * (ow / 2 - e), uy, z, { r: 0.002 });
      k.box('sash', p.frameMat, ow, mw, d * 0.6, 0, uy + s * (oh / 2 - e), z, { r: 0.002 });
      for (let i = 1; i < nx; i++) k.box('sash', p.frameMat, mw, e, d * 0.6, -ow / 2 + e + ((ow - 2 * e) * i) / nx, uy + s * (oh / 2 - e / 2), z, { r: 0.002 });
      for (let j = 1; j < ny; j++) k.box('sash', p.frameMat, e, mw, d * 0.6, s * (ow / 2 - e / 2), uy - oh / 2 + e + ((oh - 2 * e) * j) / ny, z, { r: 0.002 });
    }
    k.rbox('hardware', 'metal-brass', 0.07, 0.014, 0.03, 0.005, 0, y0 + sh, fd / 2 + 0.005, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const prairie = win({
  id: 'window-prairie', ko: '프레리 스타일 납선 여닫이 창', en: 'Prairie-style leaded casement', w: 1.2, h: 1.4, sill: 0.8, wr: [0.7, 2.4], hr: [0.6, 2.2], frameMat: 'wood-walnut', trim: true,
  anchor: { asymmetricZ: true },
  extra: [openDeg(0), P.color('accent', '포인트 유리', 'Accent glass', '#6f9a5a')],
  tags: ['window', 'prairie style', 'frank lloyd wright', 'leaded glass', 'art glass', 'casement', '창문', '프레리 창', '납선 유리', '아트 글라스', '여닫이창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = 0.012, d = fd * 0.7, b = 0.065;
    for (const s of [-1, 1]) {
      const cx = s * (fb / 2 + cw / 2);
      withMatrix(k, pivot(s * (w / 2 - fb), 0, zs + d / 2, { ry: s * p.open * DEG }), () => {
        sash2(k, cx, cy, cw + 0.02, sh, zs, d, p.frameMat, { b, gasket: false });
        // came lines: a border band, a double line across the top and small coloured squares
        const iw = cw + 0.02 - 2 * b, ih = sh - 2 * b, e = 0.06, cz = zs, cd = 0.024, cb = 0.006;
        for (const ex of [-1, 1]) bar(k, 'came', 'metal-black', cx + ex * (iw / 2 - e), cy - ih / 2, cx + ex * (iw / 2 - e), cy + ih / 2, cb, cd, cz);
        for (const ey of [-1, 1]) bar(k, 'came', 'metal-black', cx - iw / 2, cy + ey * (ih / 2 - e), cx + iw / 2, cy + ey * (ih / 2 - e), cb, cd, cz);
        bar(k, 'came', 'metal-black', cx - iw / 2, cy + ih / 2 - 2.3 * e, cx + iw / 2, cy + ih / 2 - 2.3 * e, cb, cd, cz);
        for (const ex of [-1, 1]) for (const ey of [-1, 1]) k.box('glass', 'glass-tinted', e * 0.55, e * 0.55, 0.022, cx + ex * (iw / 2 - e / 2), cy + ey * (ih / 2 - e / 2), cz, { r: 0, overrides: { color: p.accent } });
        for (const ex of [-0.5, 0, 0.5]) k.box('glass', 'glass-tinted', e * 0.5, e * 0.5, 0.022, cx + ex * iw * 0.4, cy + ih / 2 - 1.65 * e, cz, { r: 0, overrides: { color: p.accent } });
        sashHandle(k, cx - s * (cw / 2 - 0.03), cy, zs + d / 2, 'metal-brass');
      });
    }
    return k.group();
  },
});

/** Stone-surround window with shaped lights (each an outline), leaded or plain. */
function stoneLights(k, p, t, w, h, holes, { leaded = false, glass = 'glass-clear' } = {}) {
  framePanel(k, p.frameMat, w, h, holes, t, { y0: 0 });
  for (const pts of holes) {
    glassIn(k, pts, glass, -0.01);
    if (leaded) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const v of pts) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const topAt = (x) => { let best = y1; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a.x - x) * (b.x - x) <= 0 && Math.abs(a.x - b.x) > 1e-6 && a.y > y0 + 0.01 && b.y > y0 + 0.01) { const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); best = Math.min(best, Math.max(y, y0)); } } return best; };
      const nx = Math.max(1, Math.round((x1 - x0) / 0.11));
      for (let i = 1; i < nx; i++) { const x = x0 + ((x1 - x0) * i) / nx; bar(k, 'came', 'metal-black', x, y0, x, topAt(x), 0.005, 0.024, -0.01); }
      for (let y = y0 + 0.15; y < y1 - 0.02; y += 0.15) { const ok = topAt(x0 + 0.01) > y && topAt(x1 - 0.01) > y; if (ok) bar(k, 'came', 'metal-black', x0, y, x1, y, 0.005, 0.024, -0.01); }
    }
  }
  // interior stool so the window still has a sill board
  k.box('sill', 'wood-white', w + 0.04, 0.025, 0.06, 0, 0.0125, t / 2 + 0.02, { r: 0.004 });
}

const tudor = win({
  id: 'window-tudor-mullion', ko: '튜더 석조 멀리언 창', en: 'Tudor stone mullioned window', w: 1.8, h: 1.2, sill: 1.0, wr: [0.9, 3.6], hr: [0.7, 2.2], frameMat: 'travertine',
  bboxSlack: [0.2, 0.14, 0.08], anchor: { asymmetricZ: true },
  extra: [P.int('lights', '창 칸 수', 'Lights', 3, 2, 6)],
  tags: ['window', 'tudor window', 'mullioned window', 'stone window', 'leaded lights', '창문', '튜더 창', '석조 창', '멀리언 창', '납선 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, n = clamp(Math.round(p.lights), 2, 6), side = 0.1, mull = 0.09;
    const lw = (w - 2 * side - (n - 1) * mull) / n, y0 = 0.1, ys = h - 0.1 - lw * 0.22, seg = k.seg(16, 6);
    const holes = [];
    // flattened four-centred heads (low segmental arcs)
    for (let i = 0; i < n; i++) holes.push(archOutline(lw, y0, ys, lw * 0.2, seg, -w / 2 + side + lw / 2 + i * (lw + mull)));
    stoneLights(k, p, t, w, h, holes, { leaded: true });
    // hood mould (dripstone) with label stops on the facade
    const z = -t / 2 - 0.02;
    k.box('hood', p.frameMat, w + 0.16, 0.06, 0.04, 0, h + 0.03, z, { r: 0.008, segs: 2 });
    for (const s of [-1, 1]) k.box('hood', p.frameMat, 0.06, 0.16, 0.04, s * (w / 2 + 0.05), h - 0.05, z, { r: 0.008, segs: 2 });
    return k.group();
  },
});

const bifora = win({
  id: 'window-bifora', ko: '로마네스크 쌍아치 창(비포라)', en: 'Romanesque twin-arched window (bifora)', w: 1.2, h: 1.6, sill: 1.0, wr: [0.8, 2.2], hr: [1.0, 2.6], frameMat: 'granite-grey',
  anchor: { asymmetricZ: true },
  extra: [P.mat('columnMat', '기둥', 'Colonnette', 'marble-white', 'stone')],
  tags: ['window', 'bifora', 'romanesque window', 'twin arched', 'colonnette', '창문', '쌍아치 창', '로마네스크 창', '비포라', '석조 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, side = 0.1, pier = 0.12;
    const lw = (w - 2 * side - pier) / 2, top = h - 0.1, ys = Math.max(0.3, top - lw / 2), seg = k.seg(20, 8);
    const holes = [-1, 1].map((s) => archOutline(lw, 0.08, ys, lw / 2, seg, s * (pier / 2 + lw / 2)));
    stoneLights(k, p, t, w, h, holes);
    // colonnette in front of the pier (exterior side) with base and cushion capital
    const z = -t / 2 + 0.04, ch = ys - 0.08 - 0.1;
    k.box('column', p.columnMat, 0.12, 0.05, 0.1, 0, 0.105, z, { r: 0.006 });
    k.cyl('column', p.columnMat, 0.04, 0.045, ch, 0, 0.13, z, { segs: k.seg(16, 8) });
    k.lathe('column', p.columnMat, [[0.0001, 0], [0.045, 0], [0.07, 0.06], [0.075, 0.07], [0.0001, 0.07]], 0, 0.13 + ch, z, { segs: k.seg(16, 8) });
    return k.group();
  },
});

const lancets = win({
  id: 'window-lancet-triplet', ko: '3연 첨두 창(랜싯)', en: 'Lancet triplet window', w: 1.4, h: 2.2, sill: 0.9, wr: [0.9, 2.6], hr: [1.4, 2.6], frameMat: 'concrete',
  anchor: { asymmetricZ: true },
  extra: [glassParam('glass-tinted'), P.num('point', '첨두 뾰족함', 'Point sharpness', 1.4, 0.6, 2.5, 0.05)],
  tags: ['window', 'lancet', 'gothic window', 'pointed arch', 'church window', '창문', '랜싯 창', '첨두 아치 창', '고딕 창', '성당 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, side = 0.09, pier = 0.1, seg = k.seg(14, 6);
    const lw = (w - 2 * side - 2 * pier) / 3, f = clamp(p.point, 0.6, 2.5), rise = pointedRise(lw, f);
    const holes = [];
    for (let i = -1; i <= 1; i++) {
      const top = i === 0 ? h - 0.08 : h - 0.08 - (h - 0.2) * 0.14, ys = Math.max(0.3, top - rise), x0 = i * (lw + pier);
      holes.push([V2(x0 - lw / 2, 0.08), V2(x0 + lw / 2, 0.08), ...pointedPts(lw, ys, f, seg, x0)]);
    }
    stoneLights(k, p, t, w, h, holes, { leaded: true, glass: p.glassMat });
    return k.group();
  },
});

const rose = win({
  id: 'window-rose', ko: '장미창(원형 트레이서리)', en: 'Rose window (circular tracery)', w: 1.4, h: 1.4, sill: 1.4, wr: [0.8, 2.6], hr: [0.8, 2.6], frameMat: 'concrete',
  extra: [P.int('spokes', '살 수', 'Spokes', 12, 6, 16), P.color('glassColor', '유리 색', 'Glass colour', '#7f9fd8')],
  tags: ['window', 'rose window', 'tracery', 'round window', 'stained glass', 'church window', '창문', '장미창', '원형 창', '스테인드글라스', '성당 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = Math.min(0.14, t - 0.02);
    const cy = Y0 + (h - Y0) / 2, R = Math.min(w, h - Y0) / 2 - 0.06, n = k.seg(72, 24);
    const circ = radial(() => R, 0, cy, n);
    framePanel(k, p.frameMat, w, h, [circ], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: false });
    glassIn(k, circ, 'glass-tinted', 0, { overrides: { color: p.glassColor } });
    const ns = clamp(Math.round(p.spokes), 6, 16), d = fd * 0.6, rh = R * 0.2, rp = R * 0.2;
    // hub, radiating colonnettes and a ring of foiled roundels at the rim
    k.panel('tracery', p.frameMat, circleShape(rh, 0, cy, rh * 0.55), d, 0, 0, 0, { bevel: 0.002, curveSegs: 20 });
    k.panel('tracery', p.frameMat, circleShape(R + 0.001, 0, cy, R - 0.035), d, 0, 0, 0, { bevel: 0.002, curveSegs: 48 });
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * PI * 2, c = Math.cos(a), s = Math.sin(a);
      bar(k, 'tracery', p.frameMat, c * rh, cy + s * rh, c * (R - 2 * rp + 0.01), cy + s * (R - 2 * rp + 0.01), 0.026, d, 0, 0.003);
      const a2 = a + PI / ns, rc = R - rp - 0.02;
      k.panel('tracery', p.frameMat, circleShape(rp, Math.cos(a2) * rc, cy + Math.sin(a2) * rc, rp - 0.022), d * 0.9, 0, 0, 0, { bevel: 0.002, curveSegs: 14 });
    }
    return k.group();
  },
});

const quatrefoil = win({
  id: 'window-quatrefoil', ko: '네잎 창(쿼트러포일)', en: 'Quatrefoil window', w: 0.8, h: 0.8, sill: 1.5, wr: [0.4, 1.6], hr: [0.4, 1.6], frameMat: 'wood-white', trim: true,
  extra: [glassParam(), P.bool('turned', '45° 회전', 'Turned 45°', false)],
  tags: ['window', 'quatrefoil', 'gothic window', 'accent window', 'four leaf', '창문', '네잎 창', '쿼트러포일', '고딕 창', '포인트 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = 0.08;
    const cy = Y0 + (h - Y0) / 2, R = Math.min(w, h - Y0) / 2 - 0.06, a = R * 0.42, rl = R - a, rot = p.turned ? PI / 4 : 0;
    const fn = (th) => {
      let best = 0;
      for (let i = 0; i < 4; i++) {
        const ca = rot + (i * PI) / 2, cx = a * Math.cos(ca), cz = a * Math.sin(ca);
        const u = Math.cos(th) * cx + Math.sin(th) * cz;
        best = Math.max(best, u + Math.sqrt(Math.max(0, u * u - a * a + rl * rl)));
      }
      return best;
    };
    const n = k.seg(96, 40), pts = radial(fn, 0, cy, n);
    framePanel(k, p.frameMat, w, h, [pts], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    glassIn(k, pts, p.glassMat);
    radialBead(k, 'sash', p.frameMat, fn, 0, cy, n, 0.02, 0.014, fd / 2);
    return k.group();
  },
});

const hexagon = win({
  id: 'window-hexagon', ko: '육각 창', en: 'Hexagonal window', w: 0.75, h: 0.7, sill: 1.4, wr: [0.4, 1.6], hr: [0.4, 1.6], frameMat: 'wood-oak', trim: true,
  extra: [glassParam(), P.bool('bars', '방사 살', 'Radial bars', true), P.bool('pointUp', '꼭짓점 위', 'Point up', false)],
  tags: ['window', 'hexagon window', 'hexagonal', 'accent window', 'honeycomb', '창문', '육각 창', '육각형', '포인트 창', '장식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = 0.08;
    const cy = Y0 + (h - Y0) / 2, a0 = p.pointUp ? PI / 2 : 0;
    const R = Math.min(w / (p.pointUp ? Math.sqrt(3) : 2), (h - Y0) / (p.pointUp ? 2 : Math.sqrt(3))) - 0.05;
    const fn = polyR(6, R, a0), pts = Array.from({ length: 6 }, (_, i) => { const a = a0 + (i * PI) / 3; return V2(R * Math.cos(a), cy + R * Math.sin(a)); });
    framePanel(k, p.frameMat, w, h, [pts], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    glassIn(k, pts, p.glassMat);
    const band = new THREE.Shape(Array.from({ length: 6 }, (_, i) => { const a = a0 + (i * PI) / 3; return V2((R + 0.025) * Math.cos(a), cy + (R + 0.025) * Math.sin(a)); }));
    band.holes.push(new THREE.Path([...pts].reverse()));
    k.panel('sash', p.frameMat, band, 0.014, 0, 0, fd / 2, { bevel: 0.002 });
    if (p.bars) for (let i = 0; i < 3; i++) { const a = a0 + (i * PI) / 3; bar(k, 'sash', p.frameMat, -R * Math.cos(a), cy - R * Math.sin(a), R * Math.cos(a), cy + R * Math.sin(a), 0.02, fd * 0.5, 0, 0.003); }
    void fn;
    return k.group();
  },
});

const triangle = win({
  id: 'window-triangle-gable', ko: '삼각 박공 창', en: 'Triangular gable window', w: 1.6, h: 0.9, sill: 1.6, wr: [0.6, 3.6], hr: [0.4, 1.8], frameMat: 'metal-black',
  extra: [glassParam(), P.int('bars', '세로 살', 'Vertical bars', 1, 0, 5)],
  tags: ['window', 'triangle window', 'gable window', 'a-frame window', 'attic window', '창문', '삼각 창', '박공 창', '다락 창', 'a형 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = 0.08, fb = 0.05;
    const y0 = Y0 + fb, hw = w / 2 - fb * 2, apex = h - fb;
    const pts = [V2(-hw, y0), V2(hw, y0), V2(0, apex)];
    framePanel(k, p.frameMat, w, h, [pts], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: false });
    glassIn(k, pts, p.glassMat);
    const nb = clamp(Math.round(p.bars), 0, 5);
    for (let i = 1; i <= nb; i++) {
      const x = -hw + (2 * hw * i) / (nb + 1), yt = y0 + (apex - y0) * (1 - Math.abs(x) / hw);
      if (yt - y0 > 0.04) k.box('sash', p.frameMat, 0.02, yt - y0, fd * 0.5, x, (y0 + yt) / 2, 0, { r: 0.002 });
    }
    return k.group();
  },
});

const oval = win({
  id: 'window-oeil-de-boeuf', ko: '타원 창(외유드뵈프)', en: 'Oval œil-de-bœuf window', w: 1.0, h: 0.75, sill: 1.6, wr: [0.5, 2.0], hr: [0.4, 1.6], frameMat: 'wood-white', trim: true,
  extra: [glassParam(), P.mat('stoneMat', '석재 테두리', 'Stone surround', 'travertine', 'stone')],
  tags: ['window', 'oval window', 'oeil de boeuf', 'bullseye', 'baroque window', '창문', '타원 창', '황소눈 창', '바로크 창', '장식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = 0.08;
    const cy = Y0 + (h - Y0) / 2, rx = Math.max(0.1, w / 2 - 0.12), ry = Math.max(0.08, (h - Y0) / 2 - 0.12), n = k.seg(64, 24);
    const fn = (a) => (rx * ry) / Math.sqrt((ry * Math.cos(a)) ** 2 + (rx * Math.sin(a)) ** 2);
    const pts = radial(fn, 0, cy, n);
    framePanel(k, p.frameMat, w, h, [pts], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    glassIn(k, pts, p.glassMat);
    radialBead(k, 'sash', p.frameMat, fn, 0, cy, n, 0.02, 0.014, fd / 2);
    bar(k, 'sash', p.frameMat, -rx, cy, rx, cy, 0.02, fd * 0.5, 0, 0.003);
    bar(k, 'sash', p.frameMat, 0, cy - ry, 0, cy + ry, 0.02, fd * 0.5, 0, 0.003);
    // stone surround with four keystones on the facade
    const z = -t / 2 - 0.012;
    radialBead(k, 'stone', p.stoneMat, (a) => fn(a) + 0.03, 0, cy, n, 0.07, 0.024, z);
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2, r = fn(a) + 0.065;
      k.box('stone', p.stoneMat, 0.07, 0.11, 0.034, r * Math.cos(a), cy + r * Math.sin(a), z - 0.005, { r: 0.004, rz: a - PI / 2 });
    }
    return k.group();
  },
});

const segmental = win({
  id: 'window-segmental-arch', ko: '벽돌 세그멘탈 아치 창', en: 'Segmental-arch window with brick arch', w: 1.1, h: 1.6, sill: 0.9, wr: [0.6, 2.4], hr: [0.9, 2.4], frameMat: 'wood-white', trim: true,
  bboxSlack: [0.16, 0.16, 0.08],
  extra: [P.num('rise', '아치 높이', 'Arch rise', 0.15, 0.05, 0.35, 0.01), P.mat('brickMat', '아치 벽돌', 'Arch bricks', 'wall-brick-red', 'wall'), P.bool('grid', '격자', 'Grid bars', true)],
  tags: ['window', 'segmental arch', 'brick arch', 'victorian', 'industrial', '창문', '세그멘탈 아치 창', '벽돌 아치', '아치 창', '빅토리안 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fd = 0.08, fb = 0.06, seg = k.seg(24, 8);
    const iw = w - 2 * fb, rise = clamp(p.rise, 0.05, Math.min(0.35, iw / 2)), top = h - fb, ys = top - rise;
    const pts = archOutline(iw, Y0 + fb, ys, rise, seg);
    framePanel(k, p.frameMat, w, h, [pts], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    glassIn(k, pts);
    if (p.grid) {
      const c = archCircle(iw, ys, rise);
      for (const fx of [-1 / 3, 1 / 3]) { const x = fx * iw; const yt = c.cy + Math.sqrt(c.R * c.R - x * x); k.box('sash', p.frameMat, 0.02, yt - Y0 - fb, fd * 0.5, x, (yt + Y0 + fb) / 2, 0, { r: 0.002 }); }
      for (const fy of [0.33, 0.66]) k.box('sash', p.frameMat, iw, 0.02, fd * 0.5, 0, Y0 + fb + (ys - Y0 - fb) * fy, 0, { r: 0.002 });
    }
    // brick voussoirs following the arch on the facade
    const c2 = archCircle(w + 0.04, h - rise - 0.02, rise + 0.02), z = -t / 2 - 0.012;
    const a1 = Math.acos(clamp((w / 2 + 0.02) / c2.R, -1, 1)), nb = Math.max(7, Math.round((PI - 2 * a1) * c2.R / 0.075));
    for (let i = 0; i < nb; i++) {
      const a = a1 + ((PI - 2 * a1) * (i + 0.5)) / nb, r = c2.R + 0.055;
      k.box('arch', p.brickMat, 0.068, 0.11, 0.024, r * Math.cos(a), c2.cy + r * Math.sin(a), z, { r: 0.003, rz: a - PI / 2 });
    }
    extSill(k, w, t, 'concrete');
    return k.group();
  },
});

/* ==================================================== louvres and shading */

const louvreOperable = win({
  id: 'window-louvre-operable', ko: '알루미늄 가동 루버 창', en: 'Operable aluminium louvre window', w: 1.0, h: 1.2, sill: 1.0, wr: [0.4, 2.0], hr: [0.4, 2.2], frameMat: 'metal-aluminium',
  extra: [openDeg(45, 90, '루버 각도(°)', 'Blade angle (°)'), P.mat('bladeMat', '날개', 'Blades', 'metal-aluminium', 'metal'), P.bool('screen', '방충망', 'Insect screen', true)],
  tags: ['window', 'louvre window', 'operable louvre', 'ventilation', 'aluminium blades', '창문', '루버 창', '가동 루버', '환기창', '그릴 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = 0.1;
    winBase(k, w, h, t, p, { fd, fb, trim: false });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, n = Math.max(3, Math.round(ih / 0.1)), pitch = ih / n;
    // blades pivot at their centres: 0° = closed (vertical, overlapping), 90° = level open
    const a = clamp(p.open, 0, 90) * DEG;
    for (let i = 0; i < n; i++) k.box('blades', p.bladeMat, iw - 0.004, pitch + 0.012, 0.006, 0, Y0 + fb + pitch * (i + 0.5), -0.01, { r: 0.002, rx: -a });
    // side gear housings + operating lever
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.03, ih, fd * 0.7, s * (iw / 2 - 0.015), Y0 + fb + ih / 2, -0.01, { r: 0.003 });
    k.rbox('hardware', 'plastic-grey', 0.02, 0.2, 0.025, 0.006, iw / 2 - 0.05, Y0 + fb + ih * 0.4, fd / 2 + 0.01, { segs: k.seg(2, 1) });
    if (p.screen) k.box('screen', 'glass-tinted', iw - 0.06, ih - 0.01, 0.002, 0, Y0 + fb + ih / 2, fd / 2 - 0.006, { r: 0 });
    return k.group();
  },
});

const briseSoleil = win({
  id: 'window-brise-soleil', ko: '외부 수직 핀 차양 창(브리즈솔레이유)', en: 'Window with brise-soleil fins', w: 1.8, h: 1.8, sill: 0.6, wr: [0.8, 3.6], hr: [0.8, 2.6], frameMat: 'metal-black',
  anchor: { asymmetricZ: true }, bboxSlack: [0.14, 0.08, 0.5],
  extra: [P.len('finDepth', '핀 깊이', 'Fin depth', 0.3, 0.12, 0.5), P.num('angle', '핀 각도(°)', 'Fin angle (°)', 20, -60, 60, 1), P.mat('finMat', '핀', 'Fins', 'wood-teak')],
  tags: ['window', 'brise soleil', 'sun shading', 'vertical fins', 'facade fins', '창문', '브리즈솔레이유', '차양 핀', '루버 차양', '외부 차양'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, trim: false });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, cy = Y0 + fb + ih / 2;
    k.box('glass', 'glass-clear', iw + 0.012, ih + 0.012, 0.024, 0, cy, 0, { r: 0 });
    ring(k, 'frame', p.frameMat, iw, ih, 0.015, 0.02, 0, cy, fd / 2 - 0.01);
    // head and foot rails on the facade carry the rotating fins
    const D = p.finDepth, z = -t / 2 - 0.03 - D / 2;
    for (const y of [0.025, h - 0.025]) k.box('rail', p.frameMat, w + 0.1, 0.05, 0.05, 0, y, -t / 2 - 0.03, { r: 0.004 });
    const n = Math.max(3, Math.round((w + 0.1) / 0.25)), a = clamp(p.angle, -60, 60) * DEG;
    for (let i = 0; i < n; i++) {
      const x = -(w + 0.1) / 2 + ((w + 0.1) * (i + 0.5)) / n;
      k.box('fins', p.finMat, 0.03, h - 0.1, D, x, h / 2, z, { r: 0.004, ry: a });
      for (const y of [0.05, h - 0.05]) k.box('rail', p.frameMat, 0.02, 0.03, D * 0.6 + 0.04, x, y, -t / 2 - 0.03 - D * 0.3, { r: 0.002 });
    }
    return k.group();
  },
});

const bahama = win({
  id: 'window-bahama-shutter', ko: '바하마 셔터 창(상부 경첩 덧문)', en: 'Window with Bahama shutter', w: 1.1, h: 1.3, sill: 0.9, wr: [0.6, 2.0], hr: [0.6, 2.0], frameMat: 'plastic-white', trim: true,
  anchor: { asymmetricZ: true }, bboxSlack: [0.14, 0.12, 0.6],
  extra: [openDeg(35, 70, '셔터 열림(°)', 'Shutter angle (°)'), P.mat('shutterMat', '셔터', 'Shutter', 'paint-green-matte')],
  tags: ['window', 'bahama shutter', 'bermuda shutter', 'top hinged shutter', 'tropical', '창문', '바하마 셔터', '덧문', '루버 덧문', '휴양지 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) sash2(k, s * (fb / 2 + cw / 2), cy, cw + 0.02, sh, 0.012, fd * 0.7, p.frameMat);
    // one louvred panel hung from the head on the facade, propped out at the bottom
    const sw = w + 0.08, shh = h + 0.02, zt = -t / 2 - 0.025, top = h + 0.03;
    const m = pivot(0, top, zt, { rx: -p.open * DEG });
    withMatrix(k, m, () => louvrePanel(k, 'shutter', p.shutterMat, sw, shh, 0.035, 0, top - shh / 2, zt, { pitch: 0.06, tilt: 0.7 }));
    k.box('shutter', p.shutterMat, sw, 0.04, 0.04, 0, top + 0.0, -t / 2 - 0.02, { r: 0.004 });
    for (const s of [-1, 1]) {
      const end = at(m, s * (sw / 2 - 0.04), top - shh + 0.06, zt - 0.02);
      k.rod('hardware', 'metal-steel', [s * (sw / 2 - 0.04), Math.max(0.12, top - shh + 0.2), -t / 2], end, 0.008, { segs: k.seg(8, 4) });
    }
    return k.group();
  },
});

const fabricAwning = win({
  id: 'window-fabric-awning', ko: '천 차양(어닝) 달린 창', en: 'Window with fabric awning', w: 1.2, h: 1.3, sill: 0.9, wr: [0.6, 2.6], hr: [0.6, 2.0], frameMat: 'wood-white', trim: true,
  anchor: { asymmetricZ: true }, bboxSlack: [0.16, 0.2, 0.9],
  extra: [P.len('projection', '돌출', 'Projection', 0.6, 0.3, 1.0), P.mat('awningMat', '차양 천', 'Awning fabric', 'fabric-terracotta', 'fabric'), P.bool('stripes', '줄무늬', 'Stripes', true)],
  tags: ['window', 'awning', 'fabric awning', 'canopy', 'shop awning', '창문', '어닝', '천 차양', '캐노피', '차양 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) sash2(k, s * (fb / 2 + cw / 2), cy, cw + 0.02, sh, 0.012, fd * 0.7, p.frameMat, { grid: [1, 2] });
    // sloping canvas from a wall bar above the hole, valance at the front, folding arms below
    const D = p.projection, aw = w + 0.2, y1 = h + 0.12, drop = D * 0.55, y2 = y1 - drop, z0 = -t / 2 - 0.02, z2 = z0 - D;
    const L = Math.hypot(D, drop), slope = Math.atan2(drop, D);
    k.box('awningBar', 'metal-black', aw + 0.04, 0.04, 0.04, 0, y1, z0 + 0.0, { r: 0.006 });
    const ns = p.stripes ? Math.max(3, Math.round(aw / 0.15) | 1) : 1, swd = aw / ns;
    for (let i = 0; i < ns; i++) {
      const mat = p.stripes && i % 2 ? 'fabric-cotton-white' : p.awningMat;
      const x = -aw / 2 + swd * (i + 0.5);
      k.box('awning', mat, swd + 0.001, 0.006, L, x, (y1 + y2) / 2, (z0 + z2) / 2, { r: 0, rx: -slope });
      k.box('awning', mat, swd + 0.001, 0.16, 0.006, x, y2 - 0.08, z2, { r: 0 });
    }
    for (const s of [-1, 1]) k.rod('awningBar', 'metal-black', [s * (aw / 2 - 0.05), y1 - drop - 0.25, z0], [s * (aw / 2 - 0.05), y2 + 0.01, z2 + 0.02], 0.01, { segs: k.seg(8, 4) });
    return k.group();
  },
});

const cafeShutters = win({
  id: 'window-cafe-shutters', ko: '카페 셔터(하부 덧문) 창', en: 'Window with café shutters', w: 1.2, h: 1.4, sill: 0.8, wr: [0.7, 2.2], hr: [0.8, 2.2], frameMat: 'wood-white', trim: true,
  anchor: { asymmetricZ: true }, bboxSlack: [0.12, 0.08, 0.5],
  extra: [openDeg(30, 90, '덧문 열림(°)', 'Shutter open (°)'), P.mat('shutterMat', '덧문', 'Shutters', 'paint-white-matte')],
  tags: ['window', 'cafe shutters', 'tier on tier', 'louvred shutters', 'interior shutters', '창문', '카페 셔터', '하부 덧문', '루버 덧문', '실내 셔터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08, zf = -0.03;
    winBase(k, w, h, t, p, { fd, fb, zf, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) sash2(k, s * (fb / 2 + cw / 2), cy, cw + 0.02, sh, zf + 0.012, fd * 0.7, p.frameMat, { grid: [1, 2], gasket: false });
    // lower-half louvred shutters hinged on the reveal, swinging into the room
    const z = t / 2 - 0.035, iw = w - 0.03, lh = (h - Y0) * 0.5, lw = iw / 2;
    for (const s of [-1, 1]) {
      withMatrix(k, pivot(s * iw / 2, 0, z + 0.012, { ry: s * p.open * DEG }), () => {
        louvrePanel(k, 'shutter', p.shutterMat, lw - 0.004, lh, 0.024, s * (iw / 2 - lw / 2), Y0 + 0.004 + lh / 2, z, { pitch: 0.045 });
        k.cyl('hardware', 'metal-brass', 0.01, 0.01, 0.02, s * 0.03, Y0 + lh * 0.6, z + 0.012, { rx: PI / 2, segs: k.seg(10, 5) });
      });
    }
    return k.group();
  },
});

/* ============================================== combos, curtain wall, misc */

const transomSlider = win({
  id: 'window-slider-transom-vent', ko: '미서기 창 + 상부 환기 들창', en: 'Sliding window with awning transom', w: 1.8, h: 1.8, sill: 0.6, wr: [1.0, 3.6], hr: [1.2, 2.6], frameMat: 'plastic-white', trim: false,
  anchor: { asymmetricZ: true },
  extra: [openRatio(0), P.num('vent', '상부 들창 각도(°)', 'Transom vent (°)', 15, 0, 40, 1)],
  tags: ['window', 'sliding window', 'transom', 'awning vent', 'combination window', '창문', '미서기창', '상부 들창', '환기 창', '복합 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.055, fd = 0.1;
    const th = clamp((h - Y0) * 0.24, 0.25, 0.5), ty = h - fb - th - fb / 2;
    winBase(k, w, h, t, p, { fd, fb, transoms: [ty] });
    const iw = w - 2 * fb, sw = iw / 2 + 0.035, sh = ty - fb / 2 - (Y0 + fb) - 0.006, sy = Y0 + fb + 0.003 + sh / 2;
    for (const s of [-1, 1]) k.box('track', 'plastic-grey', iw, 0.01, 0.006, 0, Y0 + fb + 0.005, s * fd / 4, { r: 0.001 });
    const open = clamp(p.open, 0, 0.9) * (sw - 0.08);
    sash2(k, -iw / 2 + sw / 2, sy, sw, sh, -fd / 4, fd / 2 - 0.012, p.frameMat, { b: 0.065 });
    sash2(k, iw / 2 - sw / 2 - open, sy, sw, sh, fd / 4, fd / 2 - 0.012, p.frameMat, { b: 0.065 });
    const top = h - fb + 0.008, zs = 0.0;
    withMatrix(k, pivot(0, top, zs - fd * 0.3, { rx: -p.vent * DEG }), () => {
      sash2(k, 0, top - (th + 0.016) / 2, iw + 0.02, th + 0.016, zs, fd * 0.6, p.frameMat, { b: 0.06 });
      sashHandle(k, 0, top - th + 0.05, zs + fd * 0.3);
    });
    return k.group();
  },
});

const pictureAwning = win({
  id: 'window-picture-awning-vents', ko: '대형 픽스창 + 하부 환기 들창', en: 'Picture window with awning vents below', w: 2.0, h: 2.0, sill: 0.4, wr: [1.0, 3.6], hr: [1.2, 2.6], frameMat: 'metal-black', trim: false,
  anchor: { asymmetricZ: true },
  extra: [openDeg(0, 40), P.int('vents', '들창 수', 'Vents', 2, 1, 4)],
  tags: ['window', 'picture window', 'awning vents', 'hopper vents', 'view window', '창문', '픽스창', '하부 들창', '전망창', '통창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.08;
    const vh = clamp((h - Y0) * 0.22, 0.25, 0.45), ty = Y0 + fb + vh + fb / 2;
    const n = clamp(Math.round(p.vents), 1, 4), iw = w - 2 * fb, vw = (iw - (n - 1) * fb) / n;
    const mull = Array.from({ length: n - 1 }, (_, i) => -iw / 2 + vw * (i + 1) + fb * (i + 0.5));
    winBase(k, w, h, t, p, { fd, fb, transoms: [ty] });
    for (const mx of mull) k.box('frame', p.frameMat, fb, vh, fd, mx, Y0 + fb + vh / 2, 0, { r: 0.003 });
    const uh = h - fb - (ty + fb / 2), uy = ty + fb / 2 + uh / 2;
    k.box('glass', 'glass-clear', iw + 0.012, uh + 0.012, 0.024, 0, uy, 0, { r: 0 });
    ring(k, 'frame', p.frameMat, iw, uh, 0.015, 0.02, 0, uy, fd / 2 - 0.01);
    const zs = 0.008, d = fd * 0.65;
    for (let i = 0; i < n; i++) {
      const cx = -iw / 2 + vw / 2 + i * (vw + fb), top = Y0 + fb + vh + 0.006;
      withMatrix(k, pivot(cx, top, zs - d / 2, { rx: -p.open * DEG }), () => {
        sash2(k, cx, top - (vh + 0.012) / 2, vw + 0.012, vh + 0.012, zs, d, p.frameMat, { b: 0.05 });
        sashHandle(k, cx, top - vh + 0.05, zs + d / 2, 'metal-black');
      });
    }
    return k.group();
  },
});

const curtainWall = win({
  id: 'window-curtain-wall-unit', ko: '커튼월 유닛(스팬드럴 패널)', en: 'Curtain-wall unit with spandrel', w: 1.5, h: 2.8, sill: 0.0, wr: [0.9, 3.0], hr: [2.0, 3.2], frameMat: 'metal-aluminium',
  anchor: { asymmetricZ: true }, bboxSlack: [0.04, 0.02, 0.3],
  extra: [P.len('spandrel', '스팬드럴 높이', 'Spandrel height', 0.8, 0.3, 1.2), P.len('fin', '외부 핀', 'Exterior fin', 0.15, 0, 0.3), P.mat('spandrelMat', '스팬드럴', 'Spandrel', 'glass-tinted', 'glass')],
  tags: ['window', 'curtain wall', 'spandrel', 'office facade', 'unitised glazing', '창문', '커튼월', '스팬드럴', '오피스 외벽', '유리 외벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = Math.min(0.16, t - 0.02);
    // deep mullions and transoms (inside) from the floor
    ring(k, 'frame', p.frameMat, w, h, fb, fd, 0, h / 2, 0);
    const sp = clamp(p.spandrel, 0.3, h - 0.8);
    k.box('frame', p.frameMat, w - 2 * fb, fb, fd, 0, sp, 0, { r: 0.003 });
    linings(k, w, h, t, fd, 'paint-white-matte');
    const iw = w - 2 * fb;
    const vh = h - fb - sp - fb / 2, vy = sp + fb / 2 + vh / 2;
    k.box('glass', 'glass-clear', iw + 0.012, vh + 0.012, 0.028, 0, vy, -0.02, { r: 0 });
    const sh = sp - fb / 2 - fb, sy = fb + sh / 2;
    k.box('spandrel', p.spandrelMat, iw + 0.012, sh + 0.012, 0.012, 0, sy, -0.02, { r: 0 });
    k.box('backpan', 'paint-grey-matte', iw - 0.01, sh - 0.01, 0.06, 0, sy, 0.03, { r: 0.002 });
    // exterior pressure plates and snap caps, vertical fins on the mullions
    const ze = -fd / 2 - 0.015;
    for (const s of [-1, 1]) k.box('caps', p.frameMat, 0.06, h, 0.03, s * (w / 2 - 0.03), h / 2, ze, { r: 0.006 });
    for (const y of [0.03, sp, h - 0.03]) k.box('caps', p.frameMat, w - 0.12, 0.05, 0.025, 0, y, ze, { r: 0.006 });
    if (p.fin > 0.01) for (const s of [-1, 1]) k.box('caps', p.frameMat, 0.02, h - 0.02, p.fin, s * (w / 2 - 0.03), h / 2, ze - 0.015 - p.fin / 2, { r: 0.003 });
    return k.group();
  },
});

const basementWell = win({
  id: 'window-basement-well', ko: '지하 채광창(창호 + 채광정)', en: 'Basement window with window well', w: 1.0, h: 0.6, sill: 1.8, wr: [0.5, 1.8], hr: [0.4, 1.2], frameMat: 'plastic-white', trim: false,
  anchor: { asymmetricZ: true }, bboxSlack: [0.3, 0.12, 0.8],
  extra: [P.num('tilt', '안쪽 기울임(°)', 'Tilt in (°)', 10, 0, 30, 1), P.mat('wellMat', '채광정', 'Window well', 'metal-steel', 'metal')],
  tags: ['window', 'basement window', 'window well', 'egress', 'hopper', '창문', '지하 창', '채광정', '반지하 창', '드라이 에어리어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.055, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const sw = w - 2 * fb + 0.02, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = 0.012, d = fd * 0.7;
    // hopper: hinged at the bottom, tilts into the room
    withMatrix(k, pivot(0, Y0 + fb, zs + d / 2, { rx: p.tilt * DEG }), () => {
      sash2(k, 0, cy, sw, sh, zs, d, p.frameMat);
      sashHandle(k, 0, Y0 + fb + sh - 0.05, zs + d / 2);
    });
    // corrugated half-round well outside with gravel in the bottom
    const R = w / 2 + 0.2, wh = h + 0.1, z0 = -t / 2, segs = k.seg(24, 10);
    const g = new THREE.CylinderGeometry(R, R, wh, segs, 1, true, PI / 2, PI);
    g.translate(0, wh / 2, z0);
    k.add('well', p.wellMat, g);
    const gi = new THREE.CylinderGeometry(R - 0.004, R - 0.004, wh, segs, 1, true, PI / 2, PI);
    gi.translate(0, wh / 2, z0);
    gi.index.array.reverse();
    const gn = gi.attributes.normal;
    for (let i = 0; i < gn.count; i++) gn.setXYZ(i, -gn.getX(i), -gn.getY(i), -gn.getZ(i));
    k.add('well', p.wellMat, gi);
    for (let y = 0.08; y < wh; y += 0.1) {
      const pts = Array.from({ length: segs + 1 }, (_, i) => { const a = PI / 2 + (i / segs) * PI; return [R * Math.sin(a), y, z0 + R * Math.cos(a)]; });
      k.tube('well', p.wellMat, pts, 0.008, { radial: k.seg(6, 4), segs: k.seg(32, 12) });
    }
    const half = new THREE.Shape();
    half.absarc(0, 0, R - 0.006, 0, PI, false);
    k.slab('gravel', 'granite-grey', half, 0.04, 0, { z: z0 + 0.0, ry: PI });
    return k.group();
  },
});

const wired = win({
  id: 'window-fire-wired', ko: '망입 유리 방화창', en: 'Fire-rated wired-glass window', w: 1.0, h: 1.2, sill: 1.0, wr: [0.5, 2.0], hr: [0.5, 2.0], frameMat: 'paint-grey-matte',
  extra: [P.len('mesh', '철망 간격', 'Wire mesh', 0.025, 0.0125, 0.05, 0.0025)],
  tags: ['window', 'fire rated window', 'wired glass', 'georgian wired', 'steel window', '창문', '방화창', '망입 유리', '철망 유리', '비상 계단 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.07;
    winBase(k, w, h, t, p, { fd, fb, trim: false });
    const iw = w - 2 * fb, ih = h - Y0 - 2 * fb, cy = Y0 + fb + ih / 2;
    k.box('glass', 'glass-clear', iw + 0.012, ih + 0.012, 0.008, 0, cy, 0, { r: 0 });
    // square wire mesh inside the pane, intumescent seal and steel glazing beads both faces
    const m = clamp(p.mesh, 0.0125, 0.05);
    for (let x = -iw / 2 + m; x < iw / 2 - 0.002; x += m) k.box('wire', 'metal-steel', 0.0012, ih, 0.0012, x, cy, 0, { r: 0 });
    for (let y = Y0 + fb + m; y < h - fb - 0.002; y += m) k.box('wire', 'metal-steel', iw, 0.0012, 0.0012, 0, y, 0, { r: 0 });
    for (const s of [-1, 1]) {
      ring(k, 'frame', p.frameMat, iw, ih, 0.02, 0.016, 0, cy, s * 0.013);
      ring(k, 'seal', 'rubber-black', iw - 0.036, ih - 0.036, 0.004, 0.004, 0, cy, s * 0.006);
    }
    k.box('label', 'metal-steel', 0.05, 0.02, 0.0015, -iw / 2 + 0.06, Y0 + fb + 0.04, 0.0055, { r: 0 });
    return k.group();
  },
});

const ironGrille = win({
  id: 'window-iron-grille', ko: '단조 장식 방범 그릴 창', en: 'Window with wrought-iron scroll grille', w: 1.1, h: 1.4, sill: 0.8, wr: [0.6, 2.2], hr: [0.8, 2.2], frameMat: 'wood-white', trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.mat('ironMat', '단조', 'Wrought iron', 'metal-black', 'metal'), P.bool('basket', '배불뚝이(돌출형)', 'Bellied (basket)', false)],
  tags: ['window', 'wrought iron', 'window grille', 'scroll grille', 'mediterranean', '창문', '단조 그릴', '장식 방범창', '지중해풍 창', '철제 그릴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb, mullions: [0] });
    const cw = (w - 3 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2;
    for (const s of [-1, 1]) sash2(k, s * (fb / 2 + cw / 2), cy, cw + 0.02, sh, 0.012, fd * 0.7, p.frameMat, { grid: [1, 3] });
    // grille on the facade: frame, round bars (bellied outwards if 'basket'), C-scrolls in the top band
    const z = -t / 2 - 0.03, gw = w - 0.02, gh = h - 0.02, bulge = p.basket ? 0.12 : 0, mat = p.ironMat;
    for (const y of [0.04, gh * 0.78, gh]) k.box('grille', mat, gw, 0.02, 0.012, 0, y, z, { r: 0.002 });
    for (const s of [-1, 1]) k.box('grille', mat, 0.02, gh - 0.02, 0.012, s * (gw / 2 - 0.01), gh / 2 + 0.01, z, { r: 0.002 });
    const n = Math.max(3, Math.round(gw / 0.12));
    for (let i = 1; i < n; i++) {
      const x = -gw / 2 + (gw * i) / n;
      if (bulge) k.tube('grille', mat, [[x, 0.04, z], [x, gh * 0.2, z - bulge * 0.8], [x, gh * 0.5, z - bulge], [x, gh * 0.78, z]], 0.008, { radial: k.seg(6, 4), segs: k.seg(16, 6) });
      else k.rod('grille', mat, [x, 0.04, z], [x, gh * 0.78, z], 0.008, { segs: k.seg(8, 4) });
      // pair of C-scrolls between the bars in the top band
      const bw = gw / n, yb = gh * 0.78, bh = gh - yb, r = Math.min(bw, bh) * 0.24;
      if (i < n) for (const e of [-1, 1]) {
        const cx = x - bw / 2, ccy = yb + bh / 2 + e * r * 0.95;
        const pts = Array.from({ length: 9 }, (_, j) => { const a = e * (PI / 2) + (j / 8) * PI * 1.6 * -e; return [cx + r * Math.cos(a), ccy + r * Math.sin(a), z]; });
        k.tube('grille', mat, pts, 0.005, { radial: k.seg(6, 3), segs: k.seg(14, 6) });
      }
    }
    for (const s of [-1, 1]) for (const fy of [0.2, 0.7]) k.box('grille', mat, 0.03, 0.025, 0.03, s * (gw / 2 - 0.01), gh * fy, -t / 2 - 0.015, { r: 0.002 });
    return k.group();
  },
});

/* ------------------------------------------------------------------ list */

const DESIGNS = [
  systemTiltFixed, liftSlide, hiSash, aluSlider, endVent, slimSlider, securityBars, rollScreen, trickleVent,
  singleHung, georgian, tripleHung, yorkshire, stulp, pushOut, juliet, cross, casementFan, scandi, passive, psk, verticalPivot, secondary,
  roofElectric, servingHatch, ticket, driveThrough, borrowed, interiorSteel, yukimi, wanja, aja, chineseMoon,
  queenAnne, prairie, tudor, bifora, lancets, rose, quatrefoil, hexagon, triangle, oval, segmental,
  louvreOperable, briseSoleil, bahama, fabricAwning, cafeShutters, transomSlider, pictureAwning, curtainWall, basementWell, wired, ironGrille,
].map(autoSize);

export const ITEMS = DESIGNS;
void frameShape;
