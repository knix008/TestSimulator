// Further doors (placement 'opening'): 4-panel, farmhouse cross-buck, reeded glass, arched panels,
// padded studio door, pet-flap door, ribbed (fluted) flush door, staggered-lite mid-century door,
// panelled and steel double doors, Japanese fusuma sliding doors. Built with doors-more.js's
// hinged-door factory (frame, stops, swing, levers). See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, item, P, variant, clamp, frameShape } from './helpers.js';
import { wallT, ring } from './openings.js';
import { hingedDoor, spec, specLeaf, doorCommon, autoSize } from './doors-more.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

/* ------------------------------------------------------- panelled doors */

const fourPanel = hingedDoor({
  id: 'door-four-panel', ko: '4판넬 문(2×2)', en: '4-panel door', leafMat: 'paint-white-gloss', frameMat: 'paint-white-gloss', handleMat: 'metal-chrome',
  tags: ['door', 'four panel door', 'panel door', '문', '4판넬 문', '판넬 도어', '방문'],
  leaf: spec({ stile: 0.12, rows: [{ rail: 0.22 }, { type: 'raised', w: 1, cols: 2 }, { rail: 0.16 }, { type: 'raised', w: 1.1, cols: 2 }, { rail: 0.12 }] }),
});

const crossBuck = hingedDoor({
  id: 'door-cross-buck', ko: '팜하우스 X자 판넬 문', en: 'Farmhouse cross-buck door', leafMat: 'paint-grey-matte', frameMat: 'paint-white-matte', handleMat: 'metal-black', handle: 'knob',
  tags: ['door', 'farmhouse door', 'cross buck', 'x brace door', '문', '팜하우스 문', 'X자 문', '시골풍 문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat, dir } = o;
    const st = 0.12, rb = 0.2, rm = 0.12, rt = 0.12;
    specLeaf(k, { stile: st, rows: [{ rail: rb }, { type: 'flat', w: 1 }, { rail: rm }, { type: 'glass', w: 1, grid: [2, 2] }, { rail: rt }] }, o);
    // X boards across the lower field (both faces)
    const fw = lw - 2 * st, fh = (lh - rb - rm - rt) / 2;
    const L = Math.hypot(fw, fh) - 0.04, a = Math.atan2(fh, fw);
    for (const s of [-1, 1]) k.box('leaf', mat, L, 0.09, lt * 0.62, X(lw / 2), rb + fh / 2, zc, { r: 0.003, rz: s * dir * a });
  },
});

const reeded = hingedDoor({
  id: 'door-reeded-glass', ko: '플루트 유리 문(리디드)', en: 'Reeded glass door', leafMat: 'wood-walnut', frameMat: 'wood-walnut', handleMat: 'metal-brass', handle: 'pull', lt: 0.045,
  tags: ['door', 'reeded glass', 'fluted glass', 'glass door', '문', '플루트 유리', '리디드 유리', '유리문'],
  leaf: (k, o) => {
    const { lw, lh, lt, X, zc, mat } = o;
    const st = 0.1, rb = 0.22, rt = 0.1;
    for (const s of [0, 1]) k.box('leaf', mat, st, lh, lt, X(s ? lw - st / 2 : st / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    k.box('leaf', mat, lw - 2 * st, rb, lt, X(lw / 2), rb / 2, zc, { r: 0.002 });
    k.box('leaf', mat, lw - 2 * st, rt, lt, X(lw / 2), lh - rt / 2, zc, { r: 0.002 });
    const gw = lw - 2 * st, gh = lh - rb - rt, gy = rb + gh / 2;
    k.box('glass', 'glass-frosted', gw + 0.01, gh + 0.01, 0.006, X(lw / 2), gy, zc, { r: 0 });
    // vertical reeds on both faces of the pane
    const n = Math.max(6, Math.round(gw / (k.hi ? 0.022 : 0.05)));
    for (let i = 0; i < n; i++) {
      const x = X(st + (gw * (i + 0.5)) / n);
      for (const s of [-1, 1]) k.cyl('reeds', 'glass-frosted', 0.006, 0.006, gh, x, rb, zc + s * 0.003, { segs: k.seg(8, 4) });
    }
    return { handleY: 1.0 };
  },
});

/** Shape: rectangle with a round arched top, centred on x = 0, bottom at y0. */
function archTopShape(w, y0, h, n) {
  const r = w / 2, ys = y0 + h - r;
  const s = new THREE.Shape([V2(-r, y0), V2(r, y0), V2(r, ys)]);
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; s.lineTo(Math.cos(a) * r, ys + Math.sin(a) * r); }
  s.lineTo(-r, ys);
  s.closePath();
  return s;
}

const archedPanel = hingedDoor({
  id: 'door-arched-panel', ko: '아치 판넬 문', en: 'Arched-panel door', leafMat: 'wood-oak', frameMat: 'wood-oak', handleMat: 'metal-black',
  tags: ['door', 'arched panel', 'arch top panel', 'classic door', '문', '아치 판넬 문', '클래식 문', '원목 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat }) => {
    k.box('leaf', mat, lw, lh, lt * 0.8, X(lw / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    const pw = lw - 0.26, n = k.seg(20, 8);
    const upper = archTopShape(pw, 0, Math.min(1.05, lh * 0.52), n), lower = archTopShape(pw, 0, Math.min(0.55, lh * 0.27), n);
    for (const s of [-1, 1]) {
      const z = zc + s * (lt * 0.4 + 0.004);
      k.panel('panels', mat, upper, 0.008, X(lw / 2), lh * 0.4, z, { bevel: 0.003 });
      k.panel('panels', mat, lower, 0.008, X(lw / 2), 0.17, z, { bevel: 0.003 });
    }
  },
});

/* ---------------------------------------------------------- flush family */

const padded = hingedDoor({
  id: 'door-padded-studio', ko: '방음 패딩 문(스튜디오)', en: 'Padded studio door', leafMat: 'paint-black-matte', frameMat: 'paint-black-matte', handleMat: 'metal-steel', handle: 'pull', lt: 0.055,
  extra: [P.mat('padMat', '패딩', 'Padding', 'leather-black', 'leather')],
  tags: ['door', 'padded door', 'soundproof door', 'studio door', 'quilted', '문', '방음문', '패딩 문', '스튜디오 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat, p, side }) => {
    k.box('leaf', mat, lw, lh, lt * 0.7, X(lw / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    const cols = 3, rows = 6, m = 0.05, cw = (lw - 2 * m) / cols, ch = (lh - 2 * m) / rows;
    const z = zc + side * (lt * 0.35 + 0.012);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = X(m + cw * (i + 0.5)), y = m + ch * (j + 0.5);
      k.rbox('pad', p.padMat, cw - 0.006, ch - 0.006, 0.024, 0.01, x, y, z, { segs: k.seg(3, 1) });
    }
    for (let i = 1; i < cols; i++) for (let j = 1; j < rows; j++) k.sphere('studs', p.handleMat, 0.007, X(m + cw * i), m + ch * j, z + 0.012, { segs: k.seg(8, 4), rings: k.seg(5, 3) });
    // drop seal at the bottom
    k.box('leaf', 'rubber-black', lw - 0.02, 0.02, lt * 0.5, X(lw / 2), 0.01, zc, { r: 0.002 });
  },
});

const petFlap = hingedDoor({
  id: 'door-pet-flap', ko: '반려동물 출입문 달린 문', en: 'Door with pet flap', leafMat: 'paint-white-matte', frameMat: 'paint-white-matte', handleMat: 'metal-steel',
  extra: [P.pick('flap', '출입구 크기', 'Flap size', 'cat', [['cat', '고양이', 'Cat'], ['dog', '중형견', 'Dog']])],
  tags: ['door', 'pet door', 'cat flap', 'dog door', '문', '펫도어', '고양이 문', '반려동물 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat, p }) => {
    const fw = p.flap === 'dog' ? 0.32 : 0.2, fh = p.flap === 'dog' ? 0.38 : 0.22, fy = 0.12 + fh / 2, cx = lw / 2;
    // leaf with the flap hole
    const s = new THREE.Shape([V2(X(0), 0), V2(X(lw), 0), V2(X(lw), lh), V2(X(0), lh)]);
    const hx = X(cx);
    s.holes.push(new THREE.Path([V2(hx - fw / 2, fy - fh / 2), V2(hx - fw / 2, fy + fh / 2), V2(hx + fw / 2, fy + fh / 2), V2(hx + fw / 2, fy - fh / 2)]));
    k.panel('leaf', mat, s, lt, 0, 0, zc, { bevel: 0.003 });
    for (const sd of [-1, 1]) ring(k, 'flapFrame', 'plastic-white', fw + 0.06, fh + 0.06, 0.035, 0.012, hx, fy, zc + sd * (lt / 2 + 0.006));
    k.box('flap', 'glass-tinted', fw - 0.004, fh - 0.004, 0.005, hx, fy, zc, { r: 0.001 });
  },
});

const ribbed = hingedDoor({
  id: 'door-ribbed', ko: '루바 리브 평판 문', en: 'Ribbed (fluted) flush door', leafMat: 'wood-oak', frameMat: 'wood-oak', handleMat: 'metal-black', handle: 'pull',
  tags: ['door', 'ribbed door', 'fluted door', 'slatted door', 'modern door', '문', '리브 문', '루바 문', '모던 문'],
  leaf: (k, { lw, lh, lt, X, zc, mat }) => {
    k.box('leaf', mat, lw, lh, lt * 0.7, X(lw / 2), lh / 2, zc, { r: 0.003, segs: 2 });
    const n = Math.max(8, Math.round(lw / 0.03)), pw = lw / n;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      k.box('ribs', mat, pw * 0.72, lh - 0.004, lt * 0.15, X(pw * (i + 0.5)), lh / 2, zc + s * (lt * 0.35 + lt * 0.075), { r: 0.004 });
    }
  },
});

const staggered = hingedDoor({
  id: 'door-staggered-lites', ko: '미드센추리 3구 유리 문', en: 'Mid-century staggered-lite door', leafMat: 'wood-teak', frameMat: 'paint-white-matte', handleMat: 'metal-brass', handle: 'knob',
  tags: ['door', 'mid-century door', 'staggered lites', 'front door', 'retro', '문', '미드센추리 문', '레트로 문', '현관문'],
  leaf: (k, { lw, lh, lt, X, zc, mat }) => {
    const q = Math.min(0.16, lw * 0.2), lites = [[0.32, 1.25], [0.5, 1.5], [0.68, 1.75]];
    const s = new THREE.Shape([V2(X(0), 0), V2(X(lw), 0), V2(X(lw), lh), V2(X(0), lh)]);
    for (const [fx, y] of lites) {
      const cx = X(lw * fx), cy = Math.min(y, lh - 0.2);
      s.holes.push(new THREE.Path([V2(cx - q / 2, cy - q / 2), V2(cx - q / 2, cy + q / 2), V2(cx + q / 2, cy + q / 2), V2(cx + q / 2, cy - q / 2)]));
      k.box('glass', 'glass-clear', q + 0.01, q + 0.01, 0.006, cx, cy, zc, { r: 0 });
      for (const sd of [-1, 1]) k.panel('beads', 'metal-brass', frameShape(q + 0.03, q + 0.03, 0.017), 0.006, cx, cy, zc + sd * (lt / 2 + 0.003), { bevel: 0.001 });
    }
    k.panel('leaf', mat, s, lt, 0, 0, zc, { bevel: 0.003 });
  },
});

/* ------------------------------------------------------------ double doors */

const doublePanel = hingedDoor({
  id: 'door-double-panel', ko: '양개 판넬 문(클래식)', en: 'Classic panelled double door', pair: true, leafMat: 'paint-white-gloss', frameMat: 'paint-white-gloss', handleMat: 'metal-brass', handle: 'lever',
  tags: ['door', 'double door', 'panel door', 'classic', '문', '양개문', '판넬 양개문', '거실 문'],
  leaf: spec({ stile: 0.1, rows: [{ rail: 0.2 }, { type: 'raised', w: 0.8 }, { rail: 0.12 }, { type: 'raised', w: 0.35 }, { rail: 0.12 }, { type: 'raised', w: 1.2 }, { rail: 0.12 }] }),
});

const steelDouble = hingedDoor({
  id: 'door-steel-double', ko: '철제 격자 양개 유리문', en: 'Steel-framed glass double door', pair: true, w: 1.5, leafMat: 'metal-black', frameMat: 'metal-black', handleMat: 'metal-black', handle: 'pull', lt: 0.045, frame: 'plain',
  tags: ['door', 'steel door', 'double glass door', 'industrial', 'crittall', '문', '철제 양개문', '스틸 유리문', '인더스트리얼'],
  leaf: spec({ stile: 0.05, rows: [{ rail: 0.1 }, { type: 'glass', w: 0.3, grid: [1, 1] }, { rail: 0.05 }, { type: 'glass', w: 1, grid: [2, 4], mw: 0.018 }, { rail: 0.05 }] }),
});

/* ----------------------------------------------------------- sliding fusuma */

const fusuma = item({
  id: 'door-fusuma', category: 'doors', placement: 'opening', ko: '후스마 미닫이문(일본식 종이문)', en: 'Fusuma sliding doors',
  bboxSlack: [0.04, 0.03, 0.04],
  params: [
    ...doorCommon(1.7, 2.0, [1.0, 3.4], [1.7, 2.5]),
    P.num('open', '열림 정도', 'Open ratio', 0, 0, 0.9, 0.05),
    P.mat('paperMat', '도배지', 'Paper', 'wallpaper-linen'),
    P.mat('frameMat', '테두리', 'Edge frame', 'wood-black'),
    P.mat('pullMat', '손잡이', 'Pull', 'metal-brass', 'metal'),
  ],
  tags: ['fusuma', 'japanese door', 'sliding door', 'paper door', '후스마', '일본식 문', '미닫이문', '종이문'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = wallT(ctx), W = p.width, H = p.height, lt = 0.025, fb = 0.04;
    for (const s of [-1, 1]) k.box('frame', 'wood-ash', fb, H, t, s * (W / 2 - fb / 2), H / 2, 0, { r: 0.002 });
    k.box('frame', 'wood-ash', W - 2 * fb, 0.06, t, 0, H - 0.03, 0, { r: 0.002 });
    k.box('frame', 'wood-ash', W - 2 * fb, 0.02, t, 0, 0.01, 0, { r: 0.002 });
    const iw = W - 2 * fb, pw = iw / 2 + 0.02, ph = H - 0.06 - 0.02 - 0.006, y0 = 0.022;
    const open = clamp(p.open, 0, 0.9) * (pw - 0.04);
    [[-1, -0.02, 0], [1, 0.02, open]].forEach(([s, z, off]) => {
      const xc = s * (iw / 2 - pw / 2) - off;
      ring(k, 'edge', p.frameMat, pw, ph, 0.018, lt, xc, y0 + ph / 2, z, { bevel: 0.002 });
      k.box('paper', p.paperMat, pw - 0.034, ph - 0.034, lt * 0.8, xc, y0 + ph / 2, z, { r: 0.001 });
      // round recessed hikite pulls on both faces
      for (const sd of [-1, 1]) {
        k.cyl('pull', p.pullMat, 0.03, 0.03, 0.004, xc - s * (pw / 2 - 0.08), y0 + 0.95, z + sd * (lt * 0.4 + 0.002) - 0.002, { rx: Math.PI / 2, segs: k.seg(20, 8) });
      }
    });
    k.userData.swing = { hinge: 'none', radius: 0, slide: 'both' };
    return k.group();
  },
});

/* ---------------------------------------------------------------- variants */

const V = [
  variant(fourPanel, 'black', '블랙 4판넬 문', 'Black 4-panel door', { leafMat: 'paint-black-matte', frameMat: 'paint-black-matte', handleMat: 'metal-brass' }, { tags: ['black', '블랙'] }),
  variant(crossBuck, 'pine', '소나무 X자 판넬 문', 'Pine cross-buck door', { leafMat: 'wood-pine', frameMat: 'wood-pine' }, { tags: ['pine', '소나무', '원목'] }),
];

const DESIGNS = [fourPanel, crossBuck, reeded, archedPanel, padded, petFlap, ribbed, staggered, doublePanel, steelDouble, fusuma].map(autoSize);

export const ITEMS = [...DESIGNS, ...V];
