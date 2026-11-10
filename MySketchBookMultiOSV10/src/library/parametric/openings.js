// Doors and windows (placement 'opening').
// Origin: bottom centre of the wall hole (params width / height = hole size), z = 0 is the
// wall's mid plane, +Z is the room (interior) side. Jambs and linings fill the reveal
// (depth = ctx.wallThickness); casings overlap the wall faces, so the bounding box is a
// little larger than the hole — every entry states that overhang in `bboxSlack`.
import { THREE, Kit, item, P, OPT, clamp, boxUV, frameShape, roundRect } from './helpers.js';

export const DEG = Math.PI / 180;
export const wallT = (ctx) => ctx.wallThickness ?? 0.2;

/** Runs fn(k) and applies a matrix to just the parts it added (any rotation, unlike transformAdded). */
export function withMatrix(k, m, fn) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  fn(k);
  for (const [key, p] of k.parts) {
    for (let i = before.get(key) ?? 0; i < p.geos.length; i++) { p.geos[i].applyMatrix4(m); boxUV(p.geos[i]); }
  }
}
/** Matrix rotating by `ry` (then `rx`) about a pivot point. */
export function pivot(px, py, pz, { rx = 0, ry = 0 } = {}) {
  const r = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ'));
  return new THREE.Matrix4().makeTranslation(px, py, pz).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-px, -py, -pz));
}

/** Rectangular frame ring (sash / door frame) of outer w × h, bar width b, depth d, centred at (x, y, z). */
export function ring(k, role, mat, w, h, b, d, x, y, z, o = {}) {
  k.panel(role, mat, frameShape(w, h, b, o.bh ?? b), d, x, y, z, { bevel: o.bevel ?? Math.min(0.003, d / 4), bevelSegs: 2, overrides: o.overrides });
}

/* ------------------------------------------------------------ door frame */

export const CASING = 0.07, JAMB = 0.03, CASING_OVER = 0.012;
export const DOOR_SLACK = (t) => [2 * (CASING - CASING_OVER) + 0.03, CASING - CASING_OVER + 0.02, 0.06 + t * 0];

/** Jambs + head lining the reveal, moulded casings on both faces, optional threshold. */
export function doorFrame(k, w, h, t, mat, { casing = true, threshold = false, jamb = JAMB, inside = true, outside = true } = {}) {
  for (const s of [-1, 1]) k.box('frame', mat, jamb, h, t, s * (w / 2 - jamb / 2), h / 2, 0, { r: 0.002 });
  k.box('frame', mat, w - 2 * jamb, jamb, t, 0, h - jamb / 2, 0, { r: 0.002 });
  if (threshold) k.box('threshold', 'marble-white', w - 2 * jamb, 0.012, t, 0, 0.006, 0, { r: 0.002 });
  if (!casing) return;
  const ct = 0.016;
  for (const side of [inside ? 1 : 0, outside ? -1 : 0]) {
    if (!side) continue;
    const z = side * (t / 2 + ct / 2);
    const cx = w / 2 - CASING_OVER + CASING / 2;
    const ch = h - CASING_OVER + CASING;
    for (const s of [-1, 1]) {
      k.box('casing', mat, CASING, ch, ct, s * cx, ch / 2, z, { r: 0.005, segs: 2 });
      // back band: a thicker bead on the outer edge gives the casing a stepped profile
      k.box('casing', mat, 0.014, ch, ct + 0.008, s * (cx + CASING / 2 - 0.007), ch / 2, z + side * 0.004, { r: 0.004, segs: 2 });
    }
    k.box('casing', mat, w + 2 * (CASING - CASING_OVER), CASING, ct, 0, h - CASING_OVER + CASING / 2, z, { r: 0.005, segs: 2 });
    k.box('casing', mat, w + 2 * (CASING - CASING_OVER), 0.014, ct + 0.008, 0, h - CASING_OVER + CASING - 0.007, z + side * 0.004, { r: 0.004, segs: 2 });
  }
}

/** Door stops: thin strips on the jambs that the closed leaf rests against. */
export function doorStops(k, w, h, mat, z) {
  for (const s of [-1, 1]) k.box('frame', mat, 0.012, h - JAMB, 0.035, s * (w / 2 - JAMB - 0.006), (h - JAMB) / 2, z, { r: 0.002 });
  k.box('frame', mat, w - 2 * JAMB, 0.012, 0.035, 0, h - JAMB - 0.006, z, { r: 0.002 });
}

/* ------------------------------------------------------------- leaves */

/**
 * A door leaf in local coordinates: hinge edge at x = 0, extends dir·x by lw, y ∈ [0, lh],
 * thickness lt centred on z = zc. Styles: flat, panel (4 raised panels), glazed, french (divided lites), metal.
 */
export function leaf(k, { lw, lh, lt, dir = 1, zc = 0, style = 'flat', mat, glass = 'glass-clear', handle = 'lever', handleMat = 'metal-steel', handleSide = 1, hinges = true, latch = true }) {
  const X = (x) => dir * x;
  const stile = Math.min(0.13, lw * 0.16);
  if (style === 'flat' || style === 'metal') {
    k.box('leaf', mat, lw, lh, lt, X(lw / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    if (style === 'metal') {
      // pressed steel: shallow grooves framing a field on both faces
      for (const s of [-1, 1]) {
        const z = zc + s * (lt / 2 + 0.0015);
        ring(k, 'leaf', mat, lw - 0.16, lh - 0.3, 0.012, 0.003, X(lw / 2), lh / 2 + 0.02, z);
        for (const fy of [0.32, 0.66]) k.box('leaf', mat, lw - 0.24, 0.012, 0.003, X(lw / 2), lh * fy, z, { r: 0.001 });
      }
    }
  } else {
    // stiles and rails (full thickness) with recessed fields between them
    const top = stile, bot = Math.min(0.24, lh * 0.12), mid = style === 'panel' ? 0.18 : 0;
    const midY = lh * 0.47;
    for (const s of [0, 1]) k.box('leaf', mat, stile, lh, lt, X(s ? lw - stile / 2 : stile / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    k.box('leaf', mat, lw - 2 * stile, top, lt, X(lw / 2), lh - top / 2, zc, { r: 0.002 });
    k.box('leaf', mat, lw - 2 * stile, bot, lt, X(lw / 2), bot / 2, zc, { r: 0.002 });
    if (mid) k.box('leaf', mat, lw - 2 * stile, mid, lt, X(lw / 2), midY, zc, { r: 0.002 });
    const fw = lw - 2 * stile;
    const fields = mid ? [[bot, midY - mid / 2], [midY + mid / 2, lh - top]] : [[bot, lh - top]];
    for (const [y0, y1] of fields) {
      const fh = y1 - y0, fy = (y0 + y1) / 2;
      if (style === 'panel') {
        // two raised (fielded) panels per row, divided by a muntin stile
        const mw = 0.1, pw = (fw - mw) / 2;
        k.box('leaf', mat, mw, fh, lt, X(lw / 2), fy, zc, { r: 0.002 });
        for (const s of [-1, 1]) {
          const px = lw / 2 + s * (mw / 2 + pw / 2);
          k.box('leaf', mat, pw + 0.004, fh + 0.004, lt * 0.4, X(px), fy, zc, { r: 0.001 });
          k.rbox('leaf', mat, pw - 0.03, fh - 0.03, lt * 0.72, 0.012, X(px), fy, zc, { segs: k.seg(3, 1) });
          // a small bead moulding around the field
          ring(k, 'leaf', mat, pw, fh, 0.01, lt * 0.82, X(px), fy, zc);
        }
      } else {
        k.box('glass', glass, fw + 0.01, fh + 0.01, 0.008, X(lw / 2), fy, zc, { r: 0 });
        ring(k, 'leaf', mat, fw, fh, 0.012, lt * 0.75, X(lw / 2), fy, zc, { bevel: 0.003 });
        if (style === 'french') {
          // divided lites: 2 columns × 5 rows of muntins
          const cols = fw > 0.45 ? 2 : 1, rows = 5;
          for (let c = 1; c < cols; c++) k.box('leaf', mat, 0.022, fh, lt * 0.6, X(lw / 2 - fw / 2 + (fw / cols) * c), fy, zc, { r: 0.003 });
          for (let r = 1; r < rows; r++) k.box('leaf', mat, fw, 0.022, lt * 0.6, X(lw / 2), y0 + (fh / rows) * r, zc, { r: 0.003 });
        }
      }
    }
  }
  if (hinges) {
    for (const hy of [0.22, lh / 2 + 0.1, lh - 0.25]) {
      if (hy > lh) continue;
      k.cyl('hardware', handleMat, 0.008, 0.008, 0.1, X(-0.004), hy - 0.05, zc + lt / 2 - 0.004, { segs: k.seg(12, 6) });
    }
  }
  if (handle !== 'none') {
    const hx = lw - 0.065, hy = 1.0;
    for (const s of [-1, 1]) if (handleSide === 0 || s === handleSide || handleSide === 2) addLever(k, X(hx), hy, zc + s * lt / 2, s, -dir, handle, handleMat, latch);
  }
}

/** Lever / pull on a face at z (facing s = ±1); the lever points towards `toward` (±x). */
export function addLever(k, x, y, z, s, toward, style, mat, keyhole = true) {
  const rx = Math.PI / 2 * s;
  if (style === 'pull') {
    // long vertical bar pull with two stand-offs
    const L = 0.45;
    k.rod('hardware', mat, [x, y - L / 2, z + s * 0.055], [x, y + L / 2, z + s * 0.055], 0.012, { segs: k.seg(14, 6) });
    for (const t of [-1, 1]) k.rod('hardware', mat, [x, y + t * (L / 2 - 0.05), z], [x, y + t * (L / 2 - 0.05), z + s * 0.055], 0.008, { segs: k.seg(10, 5) });
    return;
  }
  if (style === 'knob') {
    k.cyl('hardware', mat, 0.03, 0.03, 0.008, x, y, z, { rx, segs: k.seg(20, 8) });
    k.lathe('hardware', mat, [[0, 0], [0.011, 0], [0.011, 0.02], [0.026, 0.035], [0.028, 0.05], [0.02, 0.062], [0, 0.064]], x, y, z, { rx, segs: k.seg(20, 8) });
    return;
  }
  // round rose + lever arm
  k.cyl('hardware', mat, 0.026, 0.027, 0.009, x, y, z, { rx, segs: k.seg(24, 8) });
  k.cyl('hardware', mat, 0.009, 0.009, 0.05, x, y, z, { rx, segs: k.seg(12, 6) });
  k.rbox('hardware', mat, 0.13, 0.02, 0.016, 0.007, x + toward * 0.055, y, z + s * 0.055, { segs: k.seg(2, 1) });
  if (keyhole) {
    k.cyl('hardware', mat, 0.017, 0.017, 0.007, x, y - 0.09, z, { rx, segs: k.seg(18, 6) });
    k.box('hardware', 'plastic-black', 0.005, 0.014, 0.002, x, y - 0.09, z + s * 0.007, { r: 0 });
  }
}

/** A hinged leaf placed in a frame and rotated open by `angle` about its hinge. */
export function hingedLeaf(k, { hx, dir, side = 1, zFace, angle = 0, ...o }) {
  const zc = -side * o.lt / 2;
  const m = pivot(0, 0, 0, { ry: -dir * side * angle });
  m.premultiply(new THREE.Matrix4().makeTranslation(hx, 0.008, zFace));
  withMatrix(k, m, () => leaf(k, { ...o, dir, zc }));
}

/* --------------------------------------------------------------- params */

export const doorSize = (w, h) => [P.len('width', '폭', 'Width', w, 0.6, 1.4), P.len('height', '높이', 'Height', h, 1.8, 2.6)];
export const hingeParam = (def = 'left') => P.pick('hinge', '경첩 방향', 'Hinge side', def, OPT.hinge);
export const openParam = () => P.num('open', '열림 각도(°)', 'Open angle (°)', 0, 0, 90, 1);
const DOOR_STYLES = [['flat', '평판', 'Flat'], ['panel', '4판넬', '4-panel'], ['glazed', '유리', 'Glazed']];

const singleDoor = item({
  id: 'door-single', category: 'doors', placement: 'opening', ko: '여닫이문', en: 'Hinged door', size: [0.9, 2.1, 0.2],
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [
    ...doorSize(0.9, 2.1),
    P.pick('style', '스타일', 'Style', 'panel', DOOR_STYLES),
    hingeParam(), openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'wood-white', 'wood'),
    P.mat('frameMat', '문틀', 'Frame', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handle', 'lever', [['lever', '레버', 'Lever'], ['knob', '원형 손잡이', 'Knob']]),
    P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-steel', 'metal'),
  ],
  tags: ['door', 'hinged door', 'interior door', '문', '여닫이문', '방문', '실내문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, lt = 0.04, gap = 0.003;
    doorFrame(k, w, h, t, p.frameMat);
    const zFace = t / 2 - 0.004;
    doorStops(k, w, h, p.frameMat, zFace - lt - 0.0175);
    const lw = w - 2 * JAMB - 2 * gap, lh = h - JAMB - gap - 0.008;
    const dir = p.hinge === 'left' ? 1 : -1;
    hingedLeaf(k, { hx: dir * -(w / 2 - JAMB - gap), dir, zFace, angle: p.open * DEG, lw, lh, lt, style: p.style, mat: p.leafMat, handle: p.handle, handleMat: p.handleMat, handleSide: 2 });
    k.userData.swing = { hinge: p.hinge, radius: lw };
    return k.group();
  },
});

const doubleDoor = item({
  id: 'door-double', category: 'doors', placement: 'opening', ko: '양개문', en: 'Double door', size: [1.6, 2.1, 0.2],
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [
    P.len('width', '폭', 'Width', 1.6, 1.0, 2.4), P.len('height', '높이', 'Height', 2.1, 1.8, 2.8),
    P.pick('style', '스타일', 'Style', 'panel', DOOR_STYLES),
    openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'wood-white', 'wood'),
    P.mat('frameMat', '문틀', 'Frame', 'wood-white', 'wood'),
    P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-brass', 'metal'),
  ],
  tags: ['double door', 'door', '양개문', '양여닫이문', '문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, lt = 0.04, gap = 0.003;
    doorFrame(k, w, h, t, p.frameMat);
    const zFace = t / 2 - 0.004;
    doorStops(k, w, h, p.frameMat, zFace - lt - 0.0175);
    const lw = (w - 2 * JAMB - 3 * gap) / 2, lh = h - JAMB - gap - 0.008;
    for (const dir of [1, -1]) {
      hingedLeaf(k, { hx: dir * -(w / 2 - JAMB - gap), dir, zFace, angle: p.open * DEG, lw, lh, lt, style: p.style, mat: p.leafMat, handleMat: p.handleMat, handleSide: 2, latch: dir > 0 });
    }
    k.userData.swing = { hinge: 'both', radius: lw };
    return k.group();
  },
});

const frenchDoor = item({
  id: 'door-french', category: 'doors', placement: 'opening', ko: '프렌치 도어', en: 'French door', size: [1.5, 2.2, 0.2],
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricZ: true },
  params: [
    P.len('width', '폭', 'Width', 1.5, 1.0, 2.4), P.len('height', '높이', 'Height', 2.2, 1.9, 2.8),
    openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'wood-white', 'wood'),
    P.mat('handleMat', '손잡이 재질', 'Handle finish', 'metal-black', 'metal'),
  ],
  tags: ['french door', 'glass door', '프렌치 도어', '유리문', '양개 유리문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, lt = 0.045, gap = 0.003;
    doorFrame(k, w, h, t, p.leafMat, { threshold: true });
    const zFace = t / 2 - 0.004;
    doorStops(k, w, h, p.leafMat, zFace - lt - 0.0175);
    const lw = (w - 2 * JAMB - 3 * gap) / 2, lh = h - JAMB - gap - 0.02;
    for (const dir of [1, -1]) {
      const m = new THREE.Matrix4().makeTranslation(0, 0.012, 0);
      withMatrix(k, m, () => hingedLeaf(k, { hx: dir * -(w / 2 - JAMB - gap), dir, zFace, angle: p.open * DEG, lw, lh, lt, style: 'french', mat: p.leafMat, handleMat: p.handleMat, handleSide: 2, latch: dir > 0 }));
    }
    k.userData.swing = { hinge: 'both', radius: lw };
    return k.group();
  },
});

const entranceDoor = item({
  id: 'door-entrance', category: 'doors', placement: 'opening', ko: '현관문', en: 'Entrance door (steel)', size: [1.0, 2.1, 0.2],
  bboxSlack: [0.12, 0.06, 0.1], anchor: { asymmetricZ: true },
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.8, 1.3), P.len('height', '높이', 'Height', 2.1, 1.9, 2.5),
    hingeParam('right'), openParam(),
    P.mat('leafMat', '문짝', 'Leaf', 'paint-grey-matte', 'paint'),
    P.mat('frameMat', '문틀', 'Frame', 'paint-grey-matte', 'paint'),
  ],
  tags: ['entrance door', 'front door', 'steel door', '현관문', '방화문', '도어락', 'digital lock'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, lt = 0.06, gap = 0.003;
    // steel frame: deep C-profile jambs with a small face trim on both sides
    const fj = 0.05;
    for (const s of [-1, 1]) k.box('frame', p.frameMat, fj, h, t, s * (w / 2 - fj / 2), h / 2, 0, { r: 0.002 });
    k.box('frame', p.frameMat, w - 2 * fj, fj, t, 0, h - fj / 2, 0, { r: 0.002 });
    for (const side of [-1, 1]) {
      const z = side * (t / 2 + 0.005);
      for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.06, h + 0.05, 0.01, s * (w / 2 + 0.02), (h + 0.05) / 2, z, { r: 0.002 });
      k.box('frame', p.frameMat, w + 0.1, 0.06, 0.01, 0, h + 0.02, z, { r: 0.002 });
    }
    k.box('threshold', 'metal-steel', w - 2 * fj, 0.02, t, 0, 0.01, 0, { r: 0.003 });
    // the leaf opens outwards (-Z), as Korean apartment entrance doors do
    const dir = p.hinge === 'left' ? 1 : -1;
    const lw = w - 2 * fj - 2 * gap, lh = h - fj - gap - 0.02;
    const zFace = -(t / 2 - 0.01);
    const m = pivot(0, 0, 0, { ry: dir * p.open * DEG });
    m.premultiply(new THREE.Matrix4().makeTranslation(dir * -(w / 2 - fj - gap), 0.02, zFace));
    withMatrix(k, m, () => {
      const X = (x) => dir * x, zc = lt / 2;
      leaf(k, { lw, lh, lt, dir, zc, style: 'metal', mat: p.leafMat, handle: 'none', handleMat: 'metal-steel' });
      const hx = X(lw - 0.075);
      // digital door lock: outer keypad unit (exterior, -z) and inner body with a push-pull handle (interior, +z)
      const zo = zc - lt / 2, zi = zc + lt / 2;
      k.rbox('lock', 'plastic-black', 0.075, 0.3, 0.03, 0.008, hx, 1.15, zo - 0.015, { segs: k.seg(2, 1) });
      k.box('lock-pad', 'screen-black', 0.05, 0.12, 0.004, hx, 1.2, zo - 0.031, { r: 0.002 });
      k.rbox('lock', 'plastic-black', 0.085, 0.36, 0.05, 0.01, hx, 1.12, zi + 0.025, { segs: k.seg(2, 1) });
      k.rbox('hardware', 'metal-steel', 0.03, 0.16, 0.03, 0.01, hx, 1.06, zi + 0.065, { segs: k.seg(2, 1) });
      k.rbox('hardware', 'metal-steel', 0.03, 0.16, 0.03, 0.01, hx, 1.0, zo - 0.045, { segs: k.seg(2, 1) });
      // peephole viewer and door closer on the interior head
      k.cyl('hardware', 'metal-steel', 0.012, 0.012, lt + 0.01, X(lw / 2), 1.5, zc - lt / 2 - 0.005, { rx: Math.PI / 2, segs: k.seg(14, 6) });
      k.rbox('hardware', 'metal-aluminium', 0.28, 0.06, 0.06, 0.01, X(lw - 0.25), lh - 0.08, zi + 0.03, { segs: k.seg(2, 1) });
      for (const hy of [0.25, lh / 2, lh - 0.25]) k.cyl('hardware', 'metal-steel', 0.01, 0.01, 0.12, X(-0.005), hy - 0.06, zc - lt / 2, { segs: k.seg(12, 6) });
    });
    k.userData.swing = { hinge: p.hinge, radius: lw, side: 'exterior' };
    return k.group();
  },
});

/* ------------------------------------------------------- sliding doors */

/** Aluminium/glass sliding panel: frame ring + glass, a vertical pull on the meeting stile. */
export function slidePanel(k, x, w, h, z, d, mat, { pull = 0 } = {}) {
  const b = 0.06;
  ring(k, 'panels', mat, w, h, b, d, x, h / 2, z, { bh: 0.07 });
  k.box('glass', 'glass-clear', w - 2 * b + 0.012, h - 0.14 + 0.012, 0.008, x, h / 2, z, { r: 0 });
  k.panel('gasket', 'rubber-black', frameShape(w - 2 * b + 0.004, h - 0.14 + 0.004, 0.006), 0.014, x, h / 2, z, { bevel: 0 });
  if (pull) for (const s of [-1, 1]) k.rbox('hardware', 'metal-aluminium', 0.022, 0.35, 0.02, 0.006, x + pull * (w / 2 - 0.03), 1.0, z + s * (d / 2 + 0.01), { segs: k.seg(2, 1) });
}

const slidingGlass = item({
  id: 'door-sliding', category: 'doors', placement: 'opening', ko: '유리 미닫이문(테라스)', en: 'Sliding glass door', size: [2.4, 2.2, 0.2],
  bboxSlack: [0.04, 0.02, 0.04],
  params: [
    P.len('width', '폭', 'Width', 2.4, 1.4, 4.0), P.len('height', '높이', 'Height', 2.2, 1.9, 2.8),
    P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05),
    P.mat('frameMat', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['sliding door', 'patio door', 'glass door', '미닫이문', '슬라이딩 도어', '테라스 문', '발코니 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height;
    const fd = Math.min(0.14, t - 0.02), fb = 0.05;
    // outer frame with a double track at the bottom
    ring(k, 'frame', p.frameMat, w, h, fb, fd, 0, h / 2, 0);
    for (const s of [-1, 1]) k.box('frame', 'metal-aluminium', w - 2 * fb, 0.012, 0.006, 0, fb + 0.006, s * fd / 4, { r: 0.001 });
    // reveal linings
    linings(k, w, h, t, fd, 'paint-white-matte', { bottom: false });
    const pw = (w - 2 * fb) / 2 + 0.03, ph = h - 2 * fb - 0.004, pd = fd / 2 - 0.008;
    const open = clamp(p.open, 0, 0.9) * (pw - 0.06);
    slidePanel(k, -pw / 2 + 0.015, pw, ph, -fd / 4, pd, p.frameMat); // fixed, exterior track
    slidePanel(k, pw / 2 - 0.015 - open, pw, ph, fd / 4, pd, p.frameMat, { pull: -1 }); // sliding, interior track
    k.userData.swing = { hinge: 'none', radius: 0 };
    // lift the panels into the frame (y offset by the bottom bar)
    return shiftRole(k.group(), ['panels', 'glass', 'gasket', 'hardware'], fb + 0.002);
  },
});

/** Raises the meshes of some roles by dy (geometry baked; keeps the group origin). */
export function shiftRole(g, roles, dy) {
  for (const m of g.children) if (m.isMesh && roles.includes(m.name)) { m.geometry.translate(0, dy, 0); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); }
  return g;
}

/** Reveal linings from the frame's interior face to the room-side wall face (and outside). */
export function linings(k, w, h, t, fd, mat, { bottom = false, zf = 0 } = {}) {
  for (const side of [1, -1]) {
    const z0 = zf + side * fd / 2, z1 = side * t / 2;
    const d = Math.abs(z1 - z0);
    if (d < 0.004) continue;
    const zc = (z0 + z1) / 2;
    for (const s of [-1, 1]) k.box('lining', mat, 0.012, h, d, s * (w / 2 - 0.006), h / 2, zc, { r: 0 });
    k.box('lining', mat, w - 0.024, 0.012, d, 0, h - 0.006, zc, { r: 0 });
    if (bottom) k.box('lining', mat, w - 0.024, 0.012, d, 0, 0.006, zc, { r: 0 });
  }
}

const pocketDoor = item({
  id: 'door-pocket', category: 'doors', placement: 'opening', ko: '포켓 도어(벽 속 미닫이)', en: 'Pocket door', size: [0.9, 2.1, 0.2],
  // when open the leaf runs into the wall pocket beside the hole (hidden in the wall)
  bboxSlack: DOOR_SLACK(0.2), anchor: { asymmetricX: true },
  params: [
    ...doorSize(0.9, 2.1),
    P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05),
    P.pick('side', '들어가는 쪽', 'Slides into', 'left', OPT.hinge),
    P.mat('leafMat', '문짝', 'Leaf', 'wood-oak', 'wood'),
    P.mat('frameMat', '문틀', 'Frame', 'wood-white', 'wood'),
  ],
  tags: ['pocket door', 'sliding door', '포켓 도어', '미닫이문', '슬라이딩 도어', '벽 속 문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, lt = 0.035;
    doorFrame(k, w, h, t, p.frameMat);
    // split jamb on the pocket side: two thin stops leave the slot the leaf runs in
    const s = p.side === 'left' ? -1 : 1;
    const lw = w - 2 * JAMB + 0.02, lh = h - JAMB - 0.012;
    const x = -s * 0.0 + s * clamp(p.open, 0, 0.9) * (lw - 0.08);
    const lx = x - s * 0.0;
    k.box('leaf', p.leafMat, lw, lh, lt, lx, 0.008 + lh / 2, 0, { r: 0.003, segs: 2 });
    // recessed flush pulls on both faces, near the leading edge
    for (const f of [-1, 1]) {
      k.rbox('hardware', 'metal-steel', 0.04, 0.16, 0.006, 0.004, lx - s * (lw / 2 - 0.06), 1.0, f * (lt / 2 + 0.001), { segs: k.seg(2, 1) });
      k.box('hardware', 'plastic-black', 0.03, 0.14, 0.003, lx - s * (lw / 2 - 0.06), 1.0, f * (lt / 2 + 0.003), { r: 0 });
    }
    // the visible strip of the pocket slot on the jamb + the head track
    k.box('frame', 'metal-black', w - 2 * JAMB, 0.02, lt + 0.02, 0, h - JAMB - 0.01, 0, { r: 0.002 });
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

const barnDoor = item({
  id: 'door-barn', category: 'doors', placement: 'opening', ko: '슬라이딩 바니 도어', en: 'Barn door', size: [0.9, 2.1, 0.2],
  bboxSlack: [1.1, 0.25, 0.12], anchor: { asymmetricX: true, asymmetricZ: true },
  params: [
    ...doorSize(0.9, 2.1),
    P.num('open', '열림 정도', 'Open ratio', 0, 0, 1, 0.05),
    P.pick('side', '열리는 쪽', 'Slides to', 'right', OPT.hinge),
    P.mat('leafMat', '문짝', 'Leaf', 'wood-walnut', 'wood'),
    P.mat('trackMat', '레일', 'Track', 'metal-black', 'metal'),
  ],
  tags: ['barn door', 'sliding door', '바니 도어', '헛간문', '슬라이딩 도어', '행거 도어'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height;
    doorFrame(k, w, h, t, 'wood-white', { casing: false });
    const s = p.side === 'left' ? -1 : 1;
    const lw = w + 0.1, lh = h + 0.05, lt = 0.035;
    const zl = t / 2 + 0.03 + lt / 2;
    const ty = lh + 0.12;
    // track: flat bar on stand-off spacers across the opening and the travel distance
    const tl = 2 * lw + 0.1;
    const tx = s * (lw / 2);
    k.box('track', p.trackMat, tl, 0.04, 0.008, tx, ty, t / 2 + 0.03, { r: 0.002 });
    for (const i of [0, 1, 2, 3]) k.cyl('track', p.trackMat, 0.012, 0.012, 0.03, tx - tl / 2 + 0.05 + i * (tl - 0.1) / 3, ty, t / 2, { rx: Math.PI / 2, segs: k.seg(12, 6) });
    for (const e of [-1, 1]) k.box('track', p.trackMat, 0.012, 0.05, 0.03, tx + e * (tl / 2 - 0.006), ty + 0.02, t / 2 + 0.042, { r: 0.002 });
    const x = s * clamp(p.open, 0, 1) * lw;
    // leaf: vertical planks with a Z brace on the room face
    const planks = Math.max(3, Math.round(lw / 0.16));
    const pw = lw / planks;
    for (let i = 0; i < planks; i++) k.box('leaf', p.leafMat, pw - 0.003, lh, lt, x - lw / 2 + pw * (i + 0.5), 0.01 + lh / 2, zl, { r: 0.003 });
    const bz = zl + lt / 2 + 0.01;
    for (const by of [0.18, lh - 0.18]) k.box('leaf', p.leafMat, lw - 0.06, 0.12, 0.02, x, 0.01 + by, bz, { r: 0.003 });
    const diag = Math.hypot(lw - 0.2, lh - 0.48);
    k.box('leaf', p.leafMat, 0.11, diag, 0.02, x, 0.01 + lh / 2, bz, { r: 0.003, rz: Math.atan2(lw - 0.2, lh - 0.48) });
    // rollers: straps down the leaf, wheels on the track
    for (const e of [-1, 1]) {
      const rx = x + e * (lw / 2 - 0.15);
      k.box('track', p.trackMat, 0.04, 0.24, 0.006, rx, ty - 0.03, zl + lt / 2 + 0.004, { r: 0.002 });
      k.cyl('track', p.trackMat, 0.04, 0.04, 0.02, rx, ty + 0.02, t / 2 + 0.045, { rx: Math.PI / 2, segs: k.seg(20, 8) });
    }
    k.rbox('hardware', p.trackMat, 0.03, 0.3, 0.03, 0.012, x - s * (lw / 2 - 0.08), 1.0, zl + lt / 2 + 0.035, { segs: k.seg(2, 1) });
    k.userData.swing = { hinge: 'none', radius: 0, slide: p.side };
    return k.group();
  },
});

const foldingDoor = item({
  id: 'door-folding', category: 'doors', placement: 'opening', ko: '폴딩 도어', en: 'Folding door', size: [3.0, 2.2, 0.2],
  bboxSlack: [0.04, 0.02, 0.04], anchor: { asymmetricX: true, asymmetricZ: true },
  params: [
    P.len('width', '폭', 'Width', 3.0, 1.2, 6.0), P.len('height', '높이', 'Height', 2.2, 1.9, 2.8),
    P.int('panels', '문짝 수', 'Panels', 4, 2, 8),
    P.num('open', '접힘 정도', 'Fold ratio', 0, 0, 1, 0.05),
    P.mat('frameMat', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['folding door', 'bifold door', 'accordion door', '폴딩도어', '접이식 문', '중문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = Math.min(0.1, t - 0.02);
    ring(k, 'frame', p.frameMat, w, h, fb, fd, 0, h / 2, 0);
    linings(k, w, h, t, fd, 'paint-white-matte');
    const n = p.panels, inner = w - 2 * fb - 0.006;
    const pw = inner / n, ph = h - 2 * fb - 0.012, pd = 0.045;
    // panels fold in pairs (accordion) towards the left jamb; angle grows with the fold ratio
    const a = clamp(p.open, 0, 1) * 80 * DEG;
    let hx = -inner / 2, hz = 0;
    for (let i = 0; i < n; i++) {
      const ang = i % 2 === 0 ? a : -a;
      const m = new THREE.Matrix4().makeTranslation(hx, fb + 0.006, hz).multiply(new THREE.Matrix4().makeRotationY(ang));
      withMatrix(k, m, () => {
        ring(k, 'panels', p.frameMat, pw - 0.004, ph, 0.05, pd, pw / 2, ph / 2, 0);
        k.box('glass', 'glass-clear', pw - 0.09, ph - 0.09, 0.008, pw / 2, ph / 2, 0, { r: 0 });
        if (i === n - 1) k.rbox('hardware', 'metal-aluminium', 0.022, 0.3, 0.02, 0.006, pw - 0.04, 1.0 - fb, pd / 2 + 0.01, { segs: k.seg(2, 1) });
        if (i % 2 === 0) for (const hy of [0.2, ph / 2, ph - 0.2]) k.cyl('hardware', 'metal-aluminium', 0.007, 0.007, 0.08, pw, hy - 0.04, 0, { segs: k.seg(10, 5) });
      });
      hx += Math.cos(ang) * pw;
      hz -= Math.sin(ang) * pw;
    }
    k.userData.swing = { hinge: 'none', radius: 0, fold: 'left' };
    return k.group();
  },
});

/* ----------------------------------------------------------------- windows */

export const WIN_SLACK = [0.12, 0.08, 0.06];
export const frameMatParam = (def = 'plastic-white') => P.mat('frameMat', '창틀', 'Frame', def);

/** Interior sill board (with horns) + optional casing around the other three sides. */
export function windowTrim(k, w, h, t, mat, { trim = true, sill = true } = {}) {
  if (sill) k.box('sill', mat, w + 0.08, 0.025, t / 2 + 0.035, 0, 0.0125, t / 4 + 0.0175, { r: 0.004, segs: 2 });
  if (!trim) return;
  const cw = 0.06, ct = 0.014, z = t / 2 + ct / 2;
  for (const s of [-1, 1]) k.box('casing', mat, cw, h - 0.025 + cw - 0.01, ct, s * (w / 2 - 0.01 + cw / 2), 0.025 + (h - 0.025 + cw - 0.01) / 2, z, { r: 0.004, segs: 2 });
  k.box('casing', mat, w + 2 * (cw - 0.01), cw, ct, 0, h - 0.01 + cw / 2, z, { r: 0.004, segs: 2 });
}

/** A sash: frame ring, glass (double glazing reads as one 24 mm unit), rubber gasket. */
export function sash(k, x, y, w, h, z, d, mat, { b = 0.065, role = 'sash', grid = null } = {}) {
  ring(k, role, mat, w, h, b, d, x, y, z, { bevel: 0.004 });
  k.box('glass', 'glass-clear', w - 2 * b + 0.016, h - 2 * b + 0.016, 0.02, x, y, z, { r: 0 });
  k.panel('gasket', 'rubber-black', frameShape(w - 2 * b + 0.006, h - 2 * b + 0.006, 0.006), d * 0.8, x, y, z, { bevel: 0 });
  if (grid) {
    const [c, r] = grid, iw = w - 2 * b, ih = h - 2 * b;
    for (let i = 1; i < c; i++) k.box(role, mat, 0.02, ih, d * 0.6, x - iw / 2 + (iw / c) * i, y, z, { r: 0.003 });
    for (let j = 1; j < r; j++) k.box(role, mat, iw, 0.02, d * 0.6, x, y - ih / 2 + (ih / r) * j, z, { r: 0.003 });
  }
}

/** Casement lever handle on a sash's room face. */
export function sashHandle(k, x, y, z, mat = 'metal-white') {
  k.rbox('hardware', mat, 0.032, 0.075, 0.014, 0.006, x, y, z + 0.007, { segs: k.seg(2, 1) });
  k.rbox('hardware', mat, 0.022, 0.13, 0.018, 0.008, x, y - 0.06, z + 0.03, { segs: k.seg(2, 1) });
}

/** Outer frame + linings + trim common to every window; returns frame depth and z. */
export function windowBase(k, w, h, t, p, { fd = 0.08, zf = 0, fb = 0.06, mullions = [] } = {}) {
  ring(k, 'frame', p.frameMat, w, h - 0.025, fb, fd, 0, 0.025 + (h - 0.025) / 2, zf);
  for (const mx of mullions) k.box('frame', p.frameMat, fb, h - 0.025 - 2 * fb, fd, mx, 0.025 + (h - 0.025) / 2, zf, { r: 0.003 });
  linings(k, w, h, t, fd, 'paint-white-matte', { zf });
  windowTrim(k, w, h, t, 'wood-white', { trim: p.trim ?? true });
}

export const winSize = (w, h) => [P.len('width', '폭', 'Width', w, 0.4, 3.6), P.len('height', '높이', 'Height', h, 0.4, 2.6)];

const casement = item({
  id: 'window-casement', category: 'windows', placement: 'opening', ko: '여닫이 창', en: 'Casement window', size: [1.2, 1.2, 0.2], defaultSill: 0.9,
  bboxSlack: WIN_SLACK,
  params: [...winSize(1.2, 1.2), P.int('panes', '창 수', 'Panes', 2, 1, 3), frameMatParam(), P.bool('trim', '몰딩', 'Casing', true), P.bool('grid', '격자', 'Grid bars', false)],
  tags: ['window', 'casement window', '창문', '여닫이창', '시스템 창호'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    const n = p.panes, cw = (w - 2 * fb - (n - 1) * fb) / n;
    const mull = Array.from({ length: n - 1 }, (_, i) => -w / 2 + fb + cw * (i + 1) + fb * (i + 0.5));
    windowBase(k, w, h, t, p, { fd, fb, mullions: mull });
    const sh = h - 0.025 - 2 * fb + 0.02, sy = 0.025 + (h - 0.025) / 2;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + fb + cw * (i + 0.5) + fb * i;
      sash(k, cx, sy, cw + 0.02, sh, 0.012, fd * 0.7, p.frameMat, { grid: p.grid ? [2, 3] : null });
      const hs = n === 1 || i < n / 2 ? 1 : -1;
      sashHandle(k, cx + hs * (cw / 2 - 0.03), sy, 0.012 + fd * 0.35);
    }
    return k.group();
  },
});

const doubleHung = item({
  id: 'window-double-hung', category: 'windows', placement: 'opening', ko: '오르내리창', en: 'Double-hung window', size: [0.9, 1.4, 0.2], defaultSill: 0.9,
  bboxSlack: WIN_SLACK,
  params: [...winSize(0.9, 1.4), frameMatParam('wood-white'), P.bool('trim', '몰딩', 'Casing', true), P.bool('grid', '격자', 'Grid bars', true), P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05)],
  tags: ['double hung window', 'sash window', '오르내리창', '창문', '미국식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.12;
    windowBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - 0.025 - 2 * fb;
    const sh = ih / 2 + 0.02, y0 = 0.025 + fb;
    const lift = clamp(p.open, 0, 0.9) * (sh - 0.06);
    // lower sash on the room-side track, upper sash on the outer track; they overlap at the meeting rail
    sash(k, 0, y0 + sh / 2 + lift, iw, sh, fd / 4, fd / 2 - 0.01, p.frameMat, { b: 0.055, grid: p.grid ? [2, 2] : null });
    sash(k, 0, y0 + ih - sh / 2, iw, sh, -fd / 4, fd / 2 - 0.01, p.frameMat, { b: 0.055, grid: p.grid ? [2, 2] : null });
    // sash lock on the meeting rail + two lift handles on the bottom rail
    k.rbox('hardware', 'metal-brass', 0.07, 0.014, 0.03, 0.005, 0, y0 + sh + lift, fd / 2 + 0.005, { segs: k.seg(2, 1) });
    for (const s of [-1, 1]) k.rbox('hardware', 'metal-brass', 0.05, 0.012, 0.025, 0.005, s * iw * 0.28, y0 + 0.04 + lift, fd / 2 + 0.008, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const slidingWindow = item({
  id: 'window-sliding', category: 'windows', placement: 'opening', ko: '이중창(미서기 창)', en: 'Sliding window (double)', size: [1.8, 1.4, 0.2], defaultSill: 0.9,
  bboxSlack: WIN_SLACK,
  params: [...winSize(1.8, 1.4), frameMatParam(), P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05), P.bool('trim', '몰딩', 'Casing', false), P.bool('screen', '방충망', 'Insect screen', true)],
  tags: ['sliding window', 'double window', '이중창', '미서기창', '샷시', '발코니 창', 'pvc window'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05;
    // Korean 이중창: two complete sliding frames, the outer (exterior) and inner (room) one
    const fd = Math.min(0.1, (t - 0.02) / 2);
    const zs = [-fd / 2 - 0.004, fd / 2 + 0.004];
    for (const zf of zs) {
      ring(k, 'frame', p.frameMat, w, h - 0.025, fb, fd, 0, 0.025 + (h - 0.025) / 2, zf);
      // bottom double track rails
      for (const s of [-1, 1]) k.box('frame', 'plastic-grey', w - 2 * fb, 0.01, 0.006, 0, 0.025 + fb + 0.005, zf + s * fd / 4, { r: 0.001 });
    }
    linings(k, w, h, t, 2 * fd + 0.008, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    const iw = w - 2 * fb, sw = iw / 2 + 0.035, sh = h - 0.025 - 2 * fb - 0.01, sy = 0.025 + fb + 0.006 + sh / 2, sd = fd / 2 - 0.01;
    const open = clamp(p.open, 0, 0.9) * (sw - 0.08);
    zs.forEach((zf, wi) => {
      const inner = wi === 1;
      const lx = -iw / 2 + sw / 2, rx = iw / 2 - sw / 2;
      sash(k, lx, sy, sw, sh, zf - fd / 4, sd, p.frameMat, { b: 0.07 });
      sash(k, rx - (inner ? open : 0), sy, sw, sh, zf + fd / 4, sd, p.frameMat, { b: 0.07 });
      // crescent lock where the meeting stiles overlap + recessed pulls
      if (inner) {
        k.rbox('hardware', 'plastic-white', 0.03, 0.09, 0.02, 0.006, -iw / 2 + sw - 0.02, sy, zf + fd / 4 + sd / 2 + 0.01, { segs: k.seg(2, 1) });
        k.rbox('hardware', 'plastic-grey', 0.02, 0.18, 0.01, 0.004, rx - open + sw / 2 - 0.035, sy, zf + fd / 4 + sd / 2 + 0.005, { segs: k.seg(2, 1) });
        k.rbox('hardware', 'plastic-grey', 0.02, 0.18, 0.01, 0.004, lx - sw / 2 + 0.035, sy, zf - fd / 4 + sd / 2 + 0.005, { segs: k.seg(2, 1) });
      }
    });
    if (p.screen) {
      // insect screen panel between the two frames behind the right sash
      ring(k, 'screen', 'metal-aluminium', sw, sh, 0.03, 0.012, iw / 2 - sw / 2, sy, 0);
      k.box('screen-mesh', 'glass-tinted', sw - 0.05, sh - 0.05, 0.002, iw / 2 - sw / 2, sy, 0, { r: 0 });
    }
    return k.group();
  },
});

const fixedWindow = item({
  id: 'window-fixed', category: 'windows', placement: 'opening', ko: '픽스 창(통창)', en: 'Fixed picture window', size: [1.5, 1.5, 0.2], defaultSill: 0.9,
  bboxSlack: WIN_SLACK,
  params: [...winSize(1.5, 1.5), frameMatParam('metal-black'), P.bool('trim', '몰딩', 'Casing', false)],
  tags: ['fixed window', 'picture window', '픽스창', '통창', '전망창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = 0.07;
    windowBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, ih = h - 0.025 - 2 * fb, cy = 0.025 + (h - 0.025) / 2;
    k.box('glass', 'glass-clear', iw + 0.016, ih + 0.016, 0.024, 0, cy, 0, { r: 0 });
    // glazing beads (thin inner frame) on the room side
    ring(k, 'frame', p.frameMat, iw, ih, 0.015, 0.02, 0, cy, fd / 2 - 0.01);
    return k.group();
  },
});

const awning = item({
  id: 'window-awning', category: 'windows', placement: 'opening', ko: '들창(어닝 창)', en: 'Awning window', size: [0.9, 0.6, 0.2], defaultSill: 1.4,
  bboxSlack: WIN_SLACK, anchor: { asymmetricZ: true },
  params: [...winSize(0.9, 0.6), frameMatParam(), P.num('open', '열림 각도(°)', 'Open angle (°)', 0, 0, 45, 1), P.bool('trim', '몰딩', 'Casing', true)],
  tags: ['awning window', 'top hung window', '들창', '어닝창', '욕실 창', '환기창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    windowBase(k, w, h, t, p, { fd, fb });
    const sw = w - 2 * fb + 0.02, sh = h - 0.025 - 2 * fb + 0.02, top = h - fb + 0.01;
    // hinged at the top, the bottom swings out (-Z)
    const m = pivot(0, top, 0.012, { rx: -p.open * DEG });
    withMatrix(k, m, () => {
      sash(k, 0, top - sh / 2, sw, sh, 0.012, fd * 0.7, p.frameMat);
      sashHandle(k, 0, top - sh + 0.06, 0.012 + fd * 0.35);
    });
    return k.group();
  },
});

const bayWindow = item({
  id: 'window-bay', category: 'windows', placement: 'opening', ko: '돌출 창(베이 윈도)', en: 'Bay window', size: [2.0, 1.4, 0.75], defaultSill: 0.5,
  bboxSlack: [0.12, 0.12, 0.08], anchor: { asymmetricZ: true },
  params: [...winSize(2.0, 1.4), P.len('projection', '돌출 깊이', 'Projection', 0.5, 0.3, 0.9), frameMatParam(), P.mat('seat', '창대(좌석)', 'Seat board', 'wood-oak', 'wood'), P.bool('cushion', '쿠션', 'Seat cushion', true)],
  tags: ['bay window', 'window seat', '베이 윈도', '돌출창', '창가 좌석'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = Math.max(p.width, 2 * p.projection + 0.5), h = p.height, d = p.projection;
    const zw = -t / 2; // exterior wall face
    // plan: the bay is a trapezoid outside the wall; the 45° sides take `d` from each end
    const cw = w - 2 * d, fb = 0.05, fd = 0.07, ph = h - 0.06;
    const base = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.02, t / 2 + 0.03), new THREE.Vector2(w / 2 + 0.02, t / 2 + 0.03), new THREE.Vector2(w / 2 + 0.02, zw), new THREE.Vector2(cw / 2 + 0.02, zw - d - 0.02), new THREE.Vector2(-cw / 2 - 0.02, zw - d - 0.02), new THREE.Vector2(-w / 2 - 0.02, zw)]);
    k.slab('seat', p.seat, base, 0.04, 0, { bevel: 0.006 });
    const roof = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.06, zw + 0.0), new THREE.Vector2(w / 2 + 0.06, zw), new THREE.Vector2(cw / 2 + 0.06, zw - d - 0.06), new THREE.Vector2(-cw / 2 - 0.06, zw - d - 0.06)]);
    k.slab('roof', 'metal-black', roof, 0.06, h, { bevel: 0.006 });
    k.slab('ceiling', 'paint-white-matte', new THREE.Shape([new THREE.Vector2(-w / 2, t / 2), new THREE.Vector2(w / 2, t / 2), new THREE.Vector2(w / 2, zw), new THREE.Vector2(cw / 2, zw - d), new THREE.Vector2(-cw / 2, zw - d), new THREE.Vector2(-w / 2, zw)]), 0.02, h - 0.02, { bevel: 0.002 });
    // three window walls: centre (parallel) and two 45° sides
    const sideL = Math.hypot(d, d);
    const faces = [[0, zw - d + fd / 2, cw, 0], [-(w / 2 + cw / 2) / 2, zw - d / 2, sideL, Math.PI / 4], [(w / 2 + cw / 2) / 2, zw - d / 2, sideL, -Math.PI / 4]];
    for (const [fx, fz, fw, ry] of faces) {
      const m = new THREE.Matrix4().makeTranslation(fx, 0.04, fz).multiply(new THREE.Matrix4().makeRotationY(ry));
      withMatrix(k, m, () => {
        ring(k, 'frame', p.frameMat, fw - 0.02, ph - 0.02, fb, fd, 0, (ph - 0.02) / 2, 0);
        k.box('glass', 'glass-clear', fw - 2 * fb + 0.0, ph - 2 * fb, 0.02, 0, (ph - 0.02) / 2, 0, { r: 0 });
        if (fw > 1.0) k.box('frame', p.frameMat, fb, ph - 2 * fb, fd, 0, (ph - 0.02) / 2, 0, { r: 0.003 });
      });
    }
    // corner posts
    for (const s of [-1, 1]) k.box('frame', p.frameMat, 0.06, ph, 0.06, s * (cw / 2), 0.04 + ph / 2, zw - d + 0.03, { r: 0.004 });
    // side returns in the wall reveal
    for (const s of [-1, 1]) k.box('lining', 'paint-white-matte', 0.012, h, t, s * (w / 2 - 0.006), h / 2, 0, { r: 0 });
    if (p.cushion) {
      const sd = d + t * 0.6;
      k.soft('cushion', 'fabric-linen-beige', cw + 0.1, 0.08, sd - 0.05, 0.03, 0, 0.04 + 0.04, zw - d + sd / 2 + 0.02, { puff: 0.012 });
    }
    k.userData.protrudes = -(d + t / 2);
    return k.group();
  },
});

const roofWindow = item({
  id: 'window-roof', category: 'windows', placement: 'opening', ko: '천창(루프 윈도)', en: 'Roof window', size: [0.78, 1.18, 0.2], defaultSill: 1.2,
  bboxSlack: [0.12, 0.08, 0.1],
  params: [...winSize(0.78, 1.18), frameMatParam('wood-pine'), P.mat('cladding', '외부 커버', 'Cladding', 'metal-black', 'metal')],
  tags: ['roof window', 'skylight', '천창', '지붕창', '다락 창', 'velux'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.07, fd = 0.1;
    // pine frame + pivot sash with a top operating bar; aluminium flashing on the outside
    ring(k, 'frame', p.frameMat, w, h, fb, fd, 0, h / 2, 0);
    linings(k, w, h, t, fd, 'paint-white-matte', { bottom: true });
    sash(k, 0, h / 2, w - 2 * fb + 0.02, h - 2 * fb + 0.02, 0.0, fd * 0.7, p.frameMat, { b: 0.06 });
    k.rbox('hardware', 'metal-aluminium', w - 2 * fb - 0.06, 0.03, 0.025, 0.008, 0, h - fb - 0.05, fd / 2, { segs: k.seg(2, 1) });
    ring(k, 'cladding', p.cladding, w + 0.08, h + 0.04, 0.06, 0.03, 0, (h + 0.04) / 2, -t / 2 - 0.015);
    return k.group();
  },
});

// Windows: the app keeps the sill height on the opening (openings[].sill); the 'sill' param mirrors it
// so the Properties panel can edit it. The geometry starts at the hole's bottom (y = 0) either way.
for (const w of [casement, doubleHung, slidingWindow, fixedWindow, awning, bayWindow, roofWindow]) {
  w.params.push(P.len('sill', '창대 높이', 'Sill height', w.defaultSill, 0, 2.2));
}

export const ITEMS = [singleDoor, doubleDoor, slidingGlass, pocketDoor, barnDoor, frenchDoor, entranceDoor, foldingDoor, casement, doubleHung, slidingWindow, fixedWindow, awning, bayWindow, roofWindow];
void roundRect;
