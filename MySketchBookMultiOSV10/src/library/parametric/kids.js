// Kids' room: bunk bed, kids desk, toy box, crib.
import { THREE, Kit, item, P, pillowGeo, roundRect, T } from './helpers.js';
import { splayLegs, recentre } from './dining.js';

/* -------------------------------------------------------------- bunk bed */

const bunkBed = item({
  id: 'bunk-bed', category: 'kids', ko: '2층 침대', en: 'Bunk bed', size: [2.1, 1.62, 1.08],
  params: [
    P.pick('bedSize', '매트리스', 'Mattress', 'single', [['single', '싱글 1000×2000', 'Single 1000×2000'], ['small', '주니어 900×1900', 'Junior 900×1900']]),
    P.mat('wood', '나무', 'Wood', 'wood-pine', 'wood'),
    P.mat('bedding', '침구', 'Bedding', 'fabric-cotton-white', 'fabric'),
    P.mat('accent', '포인트 천', 'Accent fabric', 'fabric-mustard', 'fabric'),
    P.pick('ladder', '사다리 위치', 'Ladder side', 'right', [['right', '오른쪽', 'Right'], ['left', '왼쪽', 'Left']]),
  ],
  tags: ['bunk bed', 'kids bed', '2층 침대', '이층 침대', '벙커 침대', '아이 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [mw, ml] = p.bedSize === 'small' ? [0.9, 1.9] : [1.0, 2.0];
    // long side faces the room (+z); length along x
    const L = ml + 0.1, D = mw + 0.08, H = 1.62, post = 0.06;
    const lowY = 0.2, highY = 1.05, railH = 0.1, mattH = 0.16;
    const ls = p.ladder === 'left' ? -1 : 1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, post, H, post, sx * (L / 2 - post / 2), H / 2, sz * (D / 2 - post / 2), { r: 0.008, segs: 2 });
    for (const y of [lowY, highY]) {
      // side rails + end rails carrying the slats
      for (const sz of [-1, 1]) k.box('frame', p.wood, L - 2 * post, railH, 0.03, 0, y - railH / 2, sz * (D / 2 - 0.02), { r: 0.005 });
      for (const sx of [-1, 1]) k.box('frame', p.wood, 0.03, railH, D - 2 * post, sx * (L / 2 - 0.03), y - railH / 2, 0, { r: 0.005 });
      k.box('frame', 'plywood', L - 2 * post, 0.015, D - 0.08, 0, y - 0.03, 0, { r: 0.001 });
      k.soft('mattress', p.bedding, ml - 0.01, mattH, mw - 0.01, 0.04, 0, y - 0.02 + mattH / 2, 0, { puff: 0.008, flat: 4 });
      // pillow at the far end from the ladder and a folded blanket
      const g = pillowGeo(0.5, 0.36, 0.12, k.seg(14, 5));
      T(g, 0, 0, 0, -Math.PI / 2 + 0.25, Math.PI / 2, 0);
      g.translate(-ls * (ml / 2 - 0.25), y - 0.02 + mattH + 0.07, 0);
      k.add('pillows', p.bedding, g);
      k.soft('blanket', p.accent, 0.5, 0.05, mw - 0.12, 0.02, ls * (ml / 2 - 0.45), y - 0.02 + mattH + 0.025, 0, { puff: 0.006 });
    }
    // headboard / footboard panels at both ends (lower and upper level)
    for (const sx of [-1, 1]) {
      k.box('frame', p.wood, 0.025, 0.36, D - 2 * post, sx * (L / 2 - post / 2), lowY + 0.25, 0, { r: 0.005 });
      k.box('frame', p.wood, 0.025, H - highY - 0.08, D - 2 * post, sx * (L / 2 - post / 2), (H + highY) / 2 - 0.02, 0, { r: 0.005 });
    }
    // guard rails on the top bunk: full at the back, front leaves a gap for the ladder
    const gy = highY + 0.3;
    k.box('frame', p.wood, L - 2 * post, 0.08, 0.025, 0, gy, -(D / 2 - 0.0125), { r: 0.005 });
    k.box('frame', p.wood, L - 2 * post, 0.08, 0.025, 0, highY + 0.12, -(D / 2 - 0.0125), { r: 0.005 });
    const gap = 0.45;
    const fw = L - 2 * post - gap;
    const fx = -ls * gap / 2;
    k.box('frame', p.wood, fw, 0.08, 0.025, fx, gy, D / 2 - 0.0125, { r: 0.005 });
    k.box('frame', p.wood, fw, 0.08, 0.025, fx, highY + 0.12, D / 2 - 0.0125, { r: 0.005 });
    // ladder: two stiles + round rungs, in front of the frame next to the end post
    const lx = ls * (L / 2 - post - gap / 2);
    const lz = D / 2 + 0.02;
    for (const s of [-1, 1]) k.box('frame', p.wood, 0.04, gy + 0.04, 0.035, lx + s * 0.19, (gy + 0.04) / 2, lz, { r: 0.008, segs: 2 });
    const rungs = 5;
    for (let i = 1; i <= rungs; i++) {
      const y = (i / (rungs + 1)) * (highY + 0.1);
      k.rod('frame', p.wood, [lx - 0.17, y, lz], [lx + 0.17, y, lz], 0.016, { segs: k.seg(14, 6) });
    }
    return recentre(k.group());
  },
});

/* --------------------------------------------------------------- kids desk */

const kidsDesk = item({
  id: 'kids-desk', category: 'kids', ko: '어린이 책상', en: 'Kids desk', size: [1.0, 0.95, 0.55],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.7, 1.4),
    P.len('height', '책상 높이', 'Desk height', 0.6, 0.5, 0.75),
    P.mat('top', '상판', 'Top', 'wood-white', 'wood'),
    P.mat('wood', '나무', 'Wood', 'wood-ash', 'wood'),
    P.color('accent', '포인트 색', 'Accent colour', '#9cc3b2'),
    P.bool('hutch', '상부 선반', 'Upper shelf', true),
  ],
  tags: ['kids desk', 'children desk', 'study desk', '어린이 책상', '아이 책상', '학생 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.55, h = p.height, t = 0.025;
    k.slab('top', p.top, roundRect(w, d, 0.04), t, h - t, { bevel: 0.006 });
    const leg = splayLegs(k, 'legs', p.wood, w - 0.02, d - 0.02, h - t, { inset: 0.05, r: 0.024, rFoot: 0.018, splay: 0.02 });
    // drawer box under the right side with a coloured front
    const dw = 0.36, dh = 0.11;
    k.box('body', p.top, dw, dh, d - 0.08, w / 2 - 0.08 - dw / 2, h - t - dh / 2, -0.02, { r: 0.003 });
    k.box('fronts', 'paint-white-matte', dw - 0.006, dh - 0.008, 0.016, w / 2 - 0.08 - dw / 2, h - t - dh / 2, d / 2 - 0.05, { r: 0.004, overrides: { color: p.accent } });
    k.cyl('handles', p.wood, 0.017, 0.017, 0.02, w / 2 - 0.08 - dw / 2, h - t - dh / 2, d / 2 - 0.042, { rx: Math.PI / 2, segs: k.seg(16, 6) });
    // H stretcher; the cross bar doubles as a footrest
    for (const sx of [-1, 1]) { const [x, z0] = leg(sx, -1, 0.12), [, z1] = leg(sx, 1, 0.12); k.rod('legs', p.wood, [x, 0.12, z0], [x, 0.12, z1], 0.012); }
    { const [x0] = leg(-1, 1, 0.12), [x1] = leg(1, 1, 0.12); k.rod('legs', p.wood, [x0, 0.12, 0.03], [x1, 0.12, 0.03], 0.014); }
    if (p.hutch) {
      // shelf upstand at the back: two rounded sides, one shelf, a coloured back panel
      const hh = 0.35, hd = 0.2, hz = -d / 2 + hd / 2;
      for (const s of [-1, 1]) k.box('hutch', p.wood, 0.02, hh, hd, s * (w / 2 - 0.03), h + hh / 2, hz, { r: 0.008, segs: 2 });
      k.box('hutch', p.wood, w - 0.08, 0.02, hd, 0, h + hh - 0.01, hz, { r: 0.004 });
      k.box('hutch', p.wood, w - 0.08, 0.02, hd, 0, h + 0.17, hz, { r: 0.004 });
      k.box('fronts', 'paint-white-matte', w - 0.08, hh - 0.01, 0.01, 0, h + hh / 2, -d / 2 + 0.005, { r: 0.001, overrides: { color: p.accent } });
    }
    return k.group();
  },
});

/* ------------------------------------------------------------------ toy box */

const toyBox = item({
  id: 'toy-box', category: 'kids', ko: '장난감 수납함', en: 'Toy box', size: [0.8, 0.48, 0.45],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.4, 1.2),
    P.color('color', '색', 'Colour', '#e7b9a6'),
    P.mat('wood', '나무', 'Wood', 'wood-ash', 'wood'),
    P.bool('open', '뚜껑 열림', 'Lid open', false),
  ],
  tags: ['toy box', 'toy chest', 'storage', '장난감 수납함', '장난감 상자', '토이박스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.45, h = 0.48, t = 0.018, base = 0.04;
    const paint = { overrides: { color: p.color } };
    // walls with a softly rounded rim; cut-out hand holds on the ends are suggested by dark ovals
    const bh = h - base - 0.03;
    k.box('box', 'paint-white-matte', w, t, d, 0, base + t / 2, 0, { r: 0.003, ...paint });
    for (const s of [-1, 1]) {
      k.box('box', 'paint-white-matte', w, bh, t, 0, base + bh / 2, s * (d / 2 - t / 2), { r: 0.006, segs: 2, ...paint });
      k.box('box', 'paint-white-matte', t, bh, d - 2 * t, s * (w / 2 - t / 2), base + bh / 2, 0, { r: 0.006, segs: 2, ...paint });
      const hold = new THREE.CapsuleGeometry(0.02, 0.07, k.seg(4, 2), k.seg(12, 6)).rotateZ(Math.PI / 2).scale(1, 1, 0.3);
      hold.rotateY(Math.PI / 2).translate(s * (w / 2 + 0.0005), base + bh - 0.07, 0);
      k.add('holds', 'paint-black-matte', hold);
    }
    // plinth on two wooden runners
    for (const s of [-1, 1]) k.box('base', p.wood, w - 0.06, base, 0.05, 0, base / 2, s * (d / 2 - 0.06), { r: 0.006, segs: 2 });
    // lid: wooden board, closed or propped open at the back hinge
    const lid = new THREE.Group();
    void lid;
    if (p.open) {
      k.box('lid', p.wood, w + 0.01, 0.025, d + 0.01, 0, base + bh + 0.0125 + (d + 0.01) / 2 * Math.sin(1.2) - 0.0125, -d / 2 + (d / 2) * Math.cos(1.2), { r: 0.006, segs: 2, rx: -1.2 });
    } else {
      k.box('lid', p.wood, w + 0.01, 0.025, d + 0.01, 0, base + bh + 0.0125, 0, { r: 0.008, segs: 2 });
      k.box('lid', p.wood, w - 0.04, 0.01, d - 0.04, 0, base + bh + 0.028, 0, { r: 0.004 });
    }
    return recentre(k.group());
  },
});

/* --------------------------------------------------------------------- crib */

const crib = item({
  id: 'crib', category: 'kids', ko: '아기 침대', en: 'Crib', size: [1.28, 0.92, 0.72],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'),
    P.mat('legWood', '다리', 'Legs', 'wood-ash', 'wood'),
    P.mat('bedding', '침구', 'Bedding', 'fabric-cotton-white', 'fabric'),
    P.mat('accent', '포인트 천', 'Accent fabric', 'fabric-velvet-rose', 'fabric'),
  ],
  tags: ['crib', 'cot', 'baby bed', '아기 침대', '유아 침대', '베이비 침대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 1.28, D = 0.72, H = 0.92, post = 0.045;
    const ml = 1.2, mw = 0.6, my = 0.32;
    // tapered legs carry the posts; the posts run to the top
    splayLegs(k, 'legs', p.legWood, L - 0.01, D - 0.01, 0.16, { inset: post / 2 + 0.005, r: 0.02, rFoot: 0.014, splay: 0.015 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, post, H - 0.16, post, sx * (L / 2 - post / 2), 0.16 + (H - 0.16) / 2, sz * (D / 2 - post / 2), { r: 0.012, segs: 2 });
    // rails (top rail rounded for little hands), bottom rails
    for (const sz of [-1, 1]) {
      k.box('frame', p.wood, L - 2 * post, 0.04, 0.035, 0, H - 0.03, sz * (D / 2 - post / 2), { r: 0.014, segs: 2 });
      k.box('frame', p.wood, L - 2 * post, 0.06, 0.03, 0, 0.2, sz * (D / 2 - post / 2), { r: 0.006 });
      // slats: round bars at ~7 cm spacing (safe gap)
      const n = Math.round((L - 2 * post) / 0.07);
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + post + ((L - 2 * post) / n) * (i + 0.5);
        k.cyl('slats', p.wood, 0.011, 0.011, H - 0.06 - 0.23, x, 0.23, sz * (D / 2 - post / 2), { segs: k.seg(10, 5) });
      }
    }
    // solid end panels with an arched top
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      const pw = D - 2 * post, ph = H - 0.2;
      sh.moveTo(-pw / 2, 0); sh.lineTo(pw / 2, 0); sh.lineTo(pw / 2, ph - 0.1);
      sh.quadraticCurveTo(0, ph + 0.04, -pw / 2, ph - 0.1); sh.lineTo(-pw / 2, 0);
      k.panel('frame', p.wood, sh, 0.02, sx * (L / 2 - post / 2), 0.17, 0, { ry: Math.PI / 2, bevel: 0.004 });
    }
    k.box('frame', 'plywood', L - 2 * post, 0.015, D - 2 * post, 0, my - 0.01, 0, { r: 0.001 });
    k.soft('mattress', p.bedding, ml, 0.1, mw, 0.03, 0, my + 0.05, 0, { puff: 0.006, flat: 4 });
    // a small quilt and a soft toy-like pillow
    k.soft('blanket', p.accent, 0.55, 0.035, mw - 0.06, 0.015, 0.25, my + 0.115, 0, { puff: 0.008 });
    const g = pillowGeo(0.36, 0.24, 0.08, k.seg(12, 5));
    T(g, 0, 0, 0, -Math.PI / 2 + 0.15, Math.PI / 2, 0);
    g.translate(-ml / 2 + 0.17, my + 0.14, 0);
    k.add('pillow', p.bedding, g);
    return k.group();
  },
});

export const ITEMS = [bunkBed, kidsDesk, toyBox, crib];
