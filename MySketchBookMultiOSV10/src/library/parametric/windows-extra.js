// Further windows (placement 'opening'): casement trio with transoms, Palladian, eyebrow, diamond,
// raked (gable) window, roller-shutter window, stacked awnings, Korean double sliding window
// (이중창), flower-box window and a fixed window with a louvred vent. Same conventions as
// windows-more.js (origin bottom centre of the hole, z = 0 the wall's mid plane, +Z the room,
// `sill` param + defaultSill). See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, variant, clamp } from './helpers.js';
import { DEG, wallT, withMatrix, pivot, ring, linings, windowTrim, sashHandle } from './openings.js';
import { win, winBase, sash2, glassParam, Y0 } from './windows-more.js';
import { autoSize } from './doors-more.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const rectPts = (x0, y0, x1, y1) => [V2(x0, y0), V2(x1, y0), V2(x1, y1), V2(x0, y1)];

/** Frame panel filling the hole with polygon holes (each a list of Vector2, counter-clockwise). */
function framePanel(k, p, w, h, holes, fd) {
  const outer = new THREE.Shape(rectPts(-w / 2, Y0, w / 2, h));
  for (const pts of holes) outer.holes.push(new THREE.Path([...pts].reverse()));
  k.panel('frame', p.frameMat, outer, fd, 0, 0, 0, { bevel: 0.003 });
}
/** Glass + bead ring following a closed outline (Vector2 list). */
function shapedGlass(k, p, pts, fd, glass = 'glass-clear') {
  k.panel('glass', glass, new THREE.Shape(pts), 0.02, 0, 0, 0, { bevel: 0 });
}

/* ---------------------------------------------------------- casements */

const casementTrio = win({
  id: 'window-casement-trio', ko: '3연 여닫이 창 + 상부창', en: 'Triple casement with transom lights', w: 2.1, h: 1.6, sill: 0.8, wr: [1.4, 3.6], hr: [1.0, 2.4], frameMat: 'wood-white', trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 20, 0, 90, 1), P.bool('grid', '격자', 'Grid bars', true)],
  tags: ['window', 'triple casement', 'casement', 'transom', 'prairie', '창문', '3연창', '여닫이창', '상부창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.055, fd = 0.08;
    const cw = (w - 4 * fb) / 3, th = clamp((h - Y0) * 0.24, 0.18, 0.45), ty = h - fb - th - fb / 2;
    const mull = [-1, 1].map((s) => s * (cw / 2 + fb / 2));
    winBase(k, w, h, t, p, { fd, fb, mullions: mull, transoms: [ty] });
    const lowH = ty - fb / 2 - (Y0 + fb), ly = Y0 + fb + lowH / 2, zs = 0.012, d = fd * 0.7;
    for (let i = -1; i <= 1; i++) {
      const cx = i * (cw + fb);
      const hx = i < 0 ? cx - cw / 2 : cx + cw / 2, dirS = i < 0 ? -1 : 1;
      const angle = i === 0 ? 0 : dirS * p.open * DEG;
      withMatrix(k, pivot(hx, 0, zs + d / 2, { ry: angle }), () => {
        sash2(k, cx, ly, cw + 0.02, lowH + 0.02, zs, d, p.frameMat, { grid: p.grid ? [2, 3] : null });
        if (i !== 0) sashHandle(k, cx - dirS * (cw / 2 - 0.03), ly, zs + d / 2);
      });
      sash2(k, cx, ty + fb / 2 + th / 2, cw + 0.02, th + 0.01, zs, d, p.frameMat, { grid: p.grid ? [2, 1] : null, gasket: false });
    }
    return k.group();
  },
});

const stackedAwning = win({
  id: 'window-stacked-awning', ko: '2단 들창(어닝 겹창)', en: 'Stacked awning windows', w: 1.0, h: 1.5, sill: 0.8, wr: [0.5, 1.8], hr: [0.8, 2.4], frameMat: 'metal-black', trim: false,
  anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 18, 0, 40, 1)],
  tags: ['window', 'awning', 'stacked awning', 'top hung', '창문', '들창', '어닝창', '2단 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.08;
    const sh = (h - Y0 - 3 * fb) / 2, ty = Y0 + fb + sh + fb / 2;
    winBase(k, w, h, t, p, { fd, fb, transoms: [ty] });
    const zs = 0.012, d = fd * 0.7;
    [[Y0 + fb + sh, p.open], [h - fb, p.open * 0.6]].forEach(([top, a]) => {
      withMatrix(k, pivot(0, top, zs - d / 2, { rx: -a * DEG }), () => {
        sash2(k, 0, top - sh / 2, w - 2 * fb + 0.02, sh + 0.02, zs, d, p.frameMat);
        sashHandle(k, 0, top - sh + 0.06, zs + d / 2, 'metal-black');
      });
    });
    return k.group();
  },
});

/* ------------------------------------------------------------- shaped */

const palladian = win({
  id: 'window-palladian', ko: '팔라디오 창(3분할 아치)', en: 'Palladian window', w: 2.2, h: 2.0, sill: 0.6, wr: [1.5, 3.6], hr: [1.2, 2.6], frameMat: 'wood-white', trim: true,
  extra: [glassParam()],
  tags: ['window', 'palladian', 'venetian window', 'serliana', 'arched', '창문', '팔라디오 창', '아치 창', '클래식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08, n = k.seg(28, 10);
    const cw = w * 0.42, sw = (w - cw) / 2 - 1.5 * fb, r = cw / 2 - fb / 2;
    const ys = Math.min(h - fb - r, Y0 + (h - Y0) * 0.72), sideTop = ys - 0.02;
    const centre = [V2(-r, Y0 + fb), V2(r, Y0 + fb), V2(r, ys)];
    for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; centre.push(V2(Math.cos(a) * r, ys + Math.sin(a) * r)); }
    centre.push(V2(-r, ys));
    const sx = cw / 2 + fb / 2 + sw / 2;
    const sides = [-1, 1].map((s) => rectPts(s * sx - sw / 2, Y0 + fb, s * sx + sw / 2, sideTop));
    framePanel(k, p, w, h, [centre, ...sides], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    shapedGlass(k, p, centre, fd, p.glassMat);
    for (const pts of sides) shapedGlass(k, p, pts, fd, p.glassMat);
    // glazing bars: impost line + radial bars in the fan + side muntins
    const bd = fd * 0.55, bar = 0.022;
    k.box('sash', p.frameMat, 2 * r, bar, bd, 0, ys, 0, { r: 0.003 });
    for (const a of [45, 90, 135]) {
      const ang = a * DEG;
      k.box('sash', p.frameMat, bar, r, bd, Math.cos(ang) * r / 2, ys + Math.sin(ang) * r / 2, 0, { r: 0.003, rz: ang - Math.PI / 2 });
    }
    for (const s of [-1, 1]) for (const f of [1 / 3, 2 / 3]) k.box('sash', p.frameMat, sw, bar, bd, s * sx, Y0 + fb + (sideTop - Y0 - fb) * f, 0, { r: 0.003 });
    k.box('sash', p.frameMat, bar, ys - Y0 - fb, bd, 0, (Y0 + fb + ys) / 2, 0, { r: 0.003 });
    return k.group();
  },
});

const eyebrow = win({
  id: 'window-eyebrow', ko: '눈썹형 창(아이브로)', en: 'Eyebrow window', w: 1.8, h: 0.7, sill: 1.6, wr: [0.9, 3.4], hr: [0.4, 1.2], frameMat: 'wood-white', trim: false,
  extra: [P.num('curve', '곡률', 'Curve', 0.55, 0.2, 0.9, 0.05)],
  tags: ['window', 'eyebrow window', 'curved top', 'attic window', '창문', '눈썹창', '곡선 창', '다락 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.055, fd = 0.08, n = k.seg(28, 10);
    const iw = w - 2 * fb, bottom = Y0 + fb, top = h - fb, side = bottom + (top - bottom) * (1 - clamp(p.curve, 0.2, 0.9));
    const pts = [V2(-iw / 2, bottom), V2(iw / 2, bottom)];
    for (let i = 0; i <= n; i++) { const x = iw / 2 - (iw * i) / n; pts.push(V2(x, side + (top - side) * Math.cos((Math.PI / 2) * (x / (iw / 2))))); }
    framePanel(k, p, w, h, [pts], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    shapedGlass(k, p, pts, fd);
    const bars = 3, bd = fd * 0.55;
    for (let i = 1; i <= bars; i++) {
      const x = -iw / 2 + (iw * i) / (bars + 1), yT = side + (top - side) * Math.cos((Math.PI / 2) * (x / (iw / 2)));
      k.box('sash', p.frameMat, 0.022, yT - bottom, bd, x, (bottom + yT) / 2, 0, { r: 0.003 });
    }
    return k.group();
  },
});

const diamond = win({
  id: 'window-diamond', ko: '마름모 창', en: 'Diamond window', w: 0.7, h: 0.7, sill: 1.3, wr: [0.4, 1.4], hr: [0.4, 1.4], frameMat: 'wood-dark', trim: true,
  extra: [glassParam(), P.bool('cross', '십자 살', 'Cross bars', true)],
  tags: ['window', 'diamond window', 'rhombus', 'accent window', '창문', '마름모 창', '포인트 창', '장식 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    const cy = Y0 + (h - Y0) / 2, rx = w / 2 - fb, ry = (h - Y0) / 2 - fb;
    const pts = [V2(0, cy - ry), V2(rx, cy), V2(0, cy + ry), V2(-rx, cy)];
    framePanel(k, p, w, h, [pts], fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    shapedGlass(k, p, pts, fd, p.glassMat);
    // bead ring around the diamond on the room side
    const outer = [V2(0, cy - ry - 0.02), V2(rx + 0.02, cy), V2(0, cy + ry + 0.02), V2(-rx - 0.02, cy)];
    const bead = new THREE.Shape(outer); bead.holes.push(new THREE.Path([...pts].reverse()));
    k.panel('sash', p.frameMat, bead, 0.014, 0, 0, fd / 2, { bevel: 0.002 });
    if (p.cross) {
      k.box('sash', p.frameMat, 2 * rx, 0.02, fd * 0.5, 0, cy, 0, { r: 0.003 });
      k.box('sash', p.frameMat, 0.02, 2 * ry, fd * 0.5, 0, cy, 0, { r: 0.003 });
    }
    return k.group();
  },
});

const raked = win({
  id: 'window-raked', ko: '경사 상부 박공 창', en: 'Raked (gable) window', w: 1.6, h: 1.6, sill: 0.9, wr: [0.6, 3.6], hr: [0.8, 2.6], frameMat: 'metal-black', trim: false,
  extra: [P.num('slope', '경사(°)', 'Slope (°)', 25, 5, 40, 1), P.int('panes', '칸 수', 'Panes', 3, 1, 6)],
  tags: ['window', 'raked window', 'gable window', 'trapezoid', 'sloped top', '창문', '박공 창', '사다리꼴 창', '경사 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.08;
    const iw = w - 2 * fb, bottom = Y0 + fb, hiY = h - fb;
    const loY = Math.max(bottom + 0.15, hiY - Math.tan(clamp(p.slope, 5, 40) * DEG) * iw);
    const topAt = (x) => loY + (hiY - loY) * ((x + iw / 2) / iw);
    const n = clamp(Math.round(p.panes), 1, 6), pw = (iw - (n - 1) * 0.04) / n;
    const holes = [];
    for (let i = 0; i < n; i++) {
      const x0 = -iw / 2 + i * (pw + 0.04), x1 = x0 + pw;
      holes.push([V2(x0, bottom), V2(x1, bottom), V2(x1, topAt(x1)), V2(x0, topAt(x0))]);
    }
    framePanel(k, p, w, h, holes, fd);
    linings(k, w, h, t, fd, 'paint-white-matte');
    windowTrim(k, w, h, t, 'wood-white', { trim: p.trim });
    for (const pts of holes) shapedGlass(k, p, pts, fd);
    return k.group();
  },
});

/* ---------------------------------------------------------- functional */

const rollerShutter = win({
  id: 'window-roller-shutter', ko: '외부 롤러 셔터 창', en: 'Window with roller shutter', w: 1.4, h: 1.5, sill: 0.9, wr: [0.6, 2.8], hr: [0.8, 2.4], trim: true,
  anchor: { asymmetricZ: true },
  extra: [P.num('closed', '셔터 내림', 'Shutter lowered', 0.35, 0, 1, 0.05), P.mat('shutterMat', '셔터', 'Shutter', 'metal-aluminium', 'metal')],
  tags: ['window', 'roller shutter', 'rolling shutter', 'security shutter', '창문', '롤러 셔터', '방범 셔터', '셔터 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08, boxH = 0.18;
    const top = h - boxH;
    winBase(k, w, h, t, p, { fd, fb, transoms: [top - fb / 2] });
    const zs = 0.012, cw = (w - 3 * fb) / 2, sh = top - fb - Y0 - fb, cy = Y0 + fb + sh / 2;
    k.box('frame', p.frameMat, fb, sh, fd, 0, cy, 0, { r: 0.003 });
    for (const s of [-1, 1]) {
      const cx = s * (fb / 2 + cw / 2);
      sash2(k, cx, cy, cw + 0.02, sh + 0.02, zs, fd * 0.7, p.frameMat);
      sashHandle(k, cx - s * (cw / 2 - 0.03), cy, zs + fd * 0.35);
    }
    // shutter box in the head of the hole, guide rails and the curtain on the exterior side
    const ze = -t / 2 + 0.035;
    k.box('shutterBox', 'plastic-white', w - 0.01, boxH - 0.01, t - 0.04, 0, h - boxH / 2, -0.01, { r: 0.006, segs: 2 });
    for (const s of [-1, 1]) k.box('shutter', p.shutterMat, 0.03, top - Y0, 0.04, s * (w / 2 - 0.02), Y0 + (top - Y0) / 2, ze, { r: 0.003 });
    const drop = clamp(p.closed, 0, 1) * (top - Y0 - 0.02), slat = 0.04;
    const ns = Math.max(1, Math.round(drop / slat));
    for (let i = 0; i < ns; i++) k.rbox('shutter', p.shutterMat, w - 0.05, slat - 0.004, 0.012, 0.005, 0, top - slat * (i + 0.5), ze, { segs: k.seg(2, 1) });
    k.box('shutter', 'rubber-black', w - 0.05, 0.012, 0.016, 0, top - ns * slat - 0.006, ze, { r: 0.003 });
    return k.group();
  },
});

const doubleSliding = win({
  id: 'window-double-sliding', ko: '이중 미서기 창(내·외창 + 방충망)', en: 'Double sliding window (inner + outer, screen)', w: 2.0, h: 1.4, sill: 0.8, wr: [1.2, 3.6], hr: [0.6, 2.4], trim: false,
  extra: [P.num('open', '내창 열림', 'Inner open ratio', 0.3, 0, 0.9, 0.05), P.bool('screen', '방충망', 'Insect screen', true)],
  tags: ['window', 'double window', 'sliding window', 'korean apartment', '창문', '이중창', '미서기창', '방충망', '아파트 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.045, fd = Math.min(0.16, t - 0.03);
    winBase(k, w, h, t, p, { fd, fb });
    const iw = w - 2 * fb, sw = iw / 2 + 0.03, sh = h - Y0 - 2 * fb - 0.01, sy = Y0 + fb + 0.005 + sh / 2, sd = fd / 5;
    const tracks = [-fd * 0.38, -fd * 0.18, fd * 0.1, fd * 0.3];
    for (const z of tracks) k.box('frame', 'plastic-grey', iw, 0.01, 0.006, 0, Y0 + fb + 0.005, z, { r: 0.001 });
    // outer pair (closed), inner pair (sliding), screen behind the outer pane
    sash2(k, -iw / 2 + sw / 2, sy, sw, sh, tracks[0], sd, p.frameMat, { b: 0.06 });
    sash2(k, iw / 2 - sw / 2, sy, sw, sh, tracks[1], sd, p.frameMat, { b: 0.06 });
    const open = clamp(p.open, 0, 0.9) * (sw - 0.06);
    sash2(k, -iw / 2 + sw / 2 + open, sy, sw, sh, tracks[3], sd, p.frameMat, { b: 0.06 });
    sash2(k, iw / 2 - sw / 2, sy, sw, sh, tracks[2], sd, p.frameMat, { b: 0.06 });
    if (p.screen) {
      const x = iw / 2 - sw / 2;
      ring(k, 'screen', 'metal-aluminium', sw, sh, 0.03, 0.012, x, sy, (tracks[1] + tracks[2]) / 2);
      k.box('screen', 'plastic-grey', sw - 0.05, sh - 0.05, 0.002, x, sy, (tracks[1] + tracks[2]) / 2, { r: 0 });
    }
    for (const x of [iw / 2 - 0.04, -iw / 2 + sw - 0.04 + open]) k.rbox('hardware', 'plastic-grey', 0.02, 0.16, 0.01, 0.004, x, sy, tracks[3] + sd / 2 + 0.005, { segs: k.seg(2, 1) });
    return k.group();
  },
});

const flowerBox = win({
  id: 'window-flower-box', ko: '꽃상자 달린 여닫이 창', en: 'Casement window with flower box', w: 1.2, h: 1.3, sill: 0.9, wr: [0.7, 2.4], hr: [0.7, 2.2], frameMat: 'wood-white', trim: true,
  bboxSlack: [0.14, 0.08, 0.3], anchor: { asymmetricZ: true },
  extra: [P.num('open', '열림 각도(°)', 'Open angle (°)', 0, 0, 90, 1), P.mat('boxMat', '꽃상자', 'Flower box', 'paint-green-matte')],
  tags: ['window', 'flower box', 'window box', 'cottage window', '창문', '꽃상자', '화단 창', '시골풍 창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.06, fd = 0.08;
    winBase(k, w, h, t, p, { fd, fb });
    const cw = (w - 2 * fb) / 2, sh = h - Y0 - 2 * fb + 0.02, cy = Y0 + (h - Y0) / 2, zs = 0.012, d = fd * 0.7;
    for (const s of [-1, 1]) {
      const hx = s * (w / 2 - fb), sx = s * (w / 2 - fb - cw / 2);
      withMatrix(k, pivot(hx, 0, zs + d / 2, { ry: s * p.open * DEG }), () => {
        sash2(k, sx, cy, cw + 0.01, sh, zs, d, p.frameMat, { grid: [1, 3] });
        sashHandle(k, sx + (s < 0 ? cw / 2 - 0.03 : -(cw / 2 - 0.03)), cy, zs + d / 2);
      });
    }
    // exterior stone sill + planter box with blooms (outside face at z = -t/2)
    const zo = -t / 2, bw = w + 0.06, bd = 0.2;
    k.box('extSill', 'concrete', w + 0.04, 0.035, 0.08, 0, 0.0175, zo - 0.03, { r: 0.004 });
    k.box('box', p.boxMat, bw, 0.18, bd, 0, 0.035 + 0.09, zo - 0.07 - bd / 2, { r: 0.008, segs: 2 });
    k.box('box', 'soil', bw - 0.04, 0.01, bd - 0.04, 0, 0.035 + 0.17, zo - 0.07 - bd / 2, { r: 0 });
    const n = Math.max(4, Math.round(bw / 0.12));
    for (let i = 0; i < n; i++) {
      const x = -bw / 2 + 0.06 + ((bw - 0.12) * i) / (n - 1), z = zo - 0.07 - bd / 2 + (i % 2 ? 0.04 : -0.04);
      k.sphere('foliage', 'plant-leaf', 0.07, x, 0.035 + 0.22, z, { segs: k.seg(10, 6), rings: k.seg(7, 4), scale: [1, 0.7, 1] });
      k.sphere('blooms', 'fabric-velvet-rose', 0.03, x + 0.02, 0.035 + 0.27, z + 0.01, { segs: k.seg(8, 5), rings: k.seg(6, 3) });
    }
    return k.group();
  },
});

const fixedVent = win({
  id: 'window-fixed-vent', ko: '픽스창 + 루버 환기구', en: 'Fixed window with louvred vent', w: 1.6, h: 1.5, sill: 0.8, wr: [0.8, 3.2], hr: [0.6, 2.4], frameMat: 'metal-aluminium', trim: false,
  extra: [P.num('louvre', '루버 각도(°)', 'Louvre angle (°)', 30, 0, 70, 1)],
  tags: ['window', 'fixed window', 'louvre vent', 'ventilation', 'jalousie', '창문', '환기창', '루버 창', '픽스창'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), w = p.width, h = p.height, fb = 0.05, fd = 0.09;
    const vw = clamp(w * 0.22, 0.2, 0.45), gw = w - 3 * fb - vw, mx = -w / 2 + fb + gw + fb / 2;
    winBase(k, w, h, t, p, { fd, fb, mullions: [mx] });
    const ih = h - Y0 - 2 * fb, cy = Y0 + fb + ih / 2;
    const gx = -w / 2 + fb + gw / 2;
    k.box('glass', 'glass-clear', gw + 0.012, ih + 0.012, 0.024, gx, cy, 0, { r: 0 });
    ring(k, 'frame', p.frameMat, gw, ih, 0.012, 0.018, gx, cy, fd / 2 - 0.009);
    const vx = w / 2 - fb - vw / 2, n = Math.max(4, Math.round(ih / 0.1)), a = clamp(p.louvre, 0, 70) * DEG;
    for (let i = 0; i < n; i++) k.box('louvres', 'glass-frosted', vw - 0.01, 0.006, 0.1, vx, Y0 + fb + (ih * (i + 0.5)) / n, 0, { r: 0, rx: -a });
    for (const s of [-1, 1]) k.box('frame', 'metal-aluminium', 0.012, ih, 0.04, vx + s * (vw / 2 - 0.006), cy, 0, { r: 0.002 });
    k.rbox('hardware', 'plastic-grey', 0.02, 0.12, 0.02, 0.006, vx + vw / 2 - 0.03, cy, fd / 2 + 0.01, { segs: k.seg(2, 1) });
    return k.group();
  },
});

/* ---------------------------------------------------------------- variants */

const V = [
  variant(palladian, 'oak', '오크 팔라디오 창', 'Oak Palladian window', { frameMat: 'wood-oak' }, { tags: ['oak', '오크'] }),
  variant(rollerShutter, 'closed', '셔터 내린 창', 'Window with roller shutter down', { closed: 1 }, { tags: ['closed', '닫힘'] }),
];

const DESIGNS = [casementTrio, stackedAwning, palladian, eyebrow, diamond, raked, rollerShutter, doubleSliding, flowerBox, fixedVent].map(autoSize);

export const ITEMS = [...DESIGNS, ...V];
