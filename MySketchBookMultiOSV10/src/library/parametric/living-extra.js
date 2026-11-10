// Further living-room pieces (not sofas): mobile TV floor stand, Korean low tea table, tufted
// ottoman coffee table, electric-fireplace media console, fluted sideboard, arched bookcase.
// See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, roundRect, addCabinet } from './helpers.js';
import { addBooks } from './living.js';
import { mk } from './appliances-more.js';
import { finish } from './kitchen.js';

const PI = Math.PI;
const liv = (def) => mk({ category: 'living', ...def, build: (p, ctx) => { const k = new Kit(ctx); def.make(k, p); return finish(k); } });

const tvStand = liv({
  id: 'living-tv-floor-stand', ko: '이동식 TV 스탠드', en: 'Mobile TV floor stand',
  params: [P.int('inches', 'TV 크기(인치)', 'TV size (inch)', 65, 43, 85), P.mat('metal', '프레임', 'Frame', 'metal-black', 'metal'), P.bool('wheels', '바퀴', 'Casters', true)],
  tags: ['tv stand', 'tv floor stand', 'rolling tv stand', 'TV 스탠드', '이동식 TV', 'TV 거치대'],
  make: (k, p) => {
    const diag = p.inches * 0.0254, tw = diag * 0.872, th = diag * 0.49, m = p.metal;
    const base = p.wheels ? 0.08 : 0.02, cy = 1.0 + th * 0.3;
    // H-base, twin columns, VESA bracket, TV, shelf
    for (const s of [-1, 1]) k.box('frame', m, 0.06, 0.035, 0.6, s * 0.3, base + 0.0175, 0, { r: 0.008 });
    k.box('frame', m, 0.66, 0.035, 0.06, 0, base + 0.0175, 0, { r: 0.008 });
    if (p.wheels) for (const s of [-1, 1]) for (const z of [-0.26, 0.26]) {
      k.cyl('wheels', 'rubber-black', 0.035, 0.035, 0.03, s * 0.3, 0.035, z, { rz: PI / 2, segs: k.seg(14, 6) });
      k.box('frame', m, 0.03, 0.05, 0.03, s * 0.3, 0.065, z, { r: 0.004 });
    }
    for (const s of [-1, 1]) k.box('frame', m, 0.05, cy - base, 0.05, s * 0.12, base + (cy - base) / 2, -0.03, { r: 0.006 });
    k.box('frame', m, 0.45, 0.05, 0.03, 0, cy, 0.0, { r: 0.004 });
    k.box('frame', m, 0.06, 0.4, 0.03, 0, cy, 0.01, { r: 0.004 });
    k.box('tv', 'plastic-black', tw, th, 0.045, 0, cy, 0.05, { r: 0.004 });
    k.box('screen', 'screen-black', tw - 0.012, th - 0.012, 0.002, 0, cy, 0.0735, { r: 0 });
    k.box('frame', 'glass-tinted', 0.5, 0.01, 0.35, 0, 0.75, 0.12, { r: 0.002 });
    k.box('frame', m, 0.5, 0.02, 0.04, 0, 0.74, -0.03, { r: 0.003 });
  },
});

const teaTable = liv({
  id: 'living-tea-table-korean', ko: '좌식 원목 차탁 (교자상)', en: 'Korean low tea table',
  params: [P.len('width', '폭', 'Width', 1.0, 0.6, 1.5), P.len('depth', '깊이', 'Depth', 0.6, 0.45, 0.9), P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'), P.bool('teaSet', '다기 세트', 'Tea set', true)],
  tags: ['tea table', 'low table', 'korean table', '차탁', '교자상', '좌식 테이블', '다탁', '찻상'],
  make: (k, p) => {
    const w = p.width, d = p.depth, h = 0.34, t = 0.035, wd = p.wood;
    k.slab('top', wd, roundRect(w, d, 0.02), t, h - t, { bevel: 0.006 });
    // raised lip at both ends + bracket legs with cloud-shaped cut-outs (simplified as slabs)
    for (const s of [-1, 1]) {
      k.box('top', wd, 0.03, 0.012, d - 0.04, s * (w / 2 - 0.03), h + 0.006, 0, { r: 0.004 });
      const sh = new THREE.Shape();
      const lw = d - 0.1;
      sh.moveTo(-lw / 2, 0); sh.lineTo(-lw / 2 + 0.06, 0); sh.quadraticCurveTo(0, 0.14, lw / 2 - 0.06, 0); sh.lineTo(lw / 2, 0); sh.lineTo(lw / 2, h - t); sh.lineTo(-lw / 2, h - t); sh.closePath();
      k.panel('legs', wd, sh, 0.035, s * (w / 2 - 0.1), 0, 0, { ry: PI / 2, bevel: 0.004 });
    }
    k.box('legs', wd, w - 0.24, 0.05, 0.025, 0, h - t - 0.03, 0, { r: 0.003 });
    if (p.teaSet) {
      k.box('tray', 'wood-dark', 0.4, 0.02, 0.26, 0, h + 0.01, 0, { r: 0.006 });
      k.lathe('tea', 'ceramic-white', [[0, 0], [0.04, 0], [0.06, 0.03], [0.065, 0.07], [0.045, 0.1], [0.02, 0.105], [0.022, 0.12], [0, 0.12]], -0.08, h + 0.02, 0, { segs: k.seg(20, 8) });
      for (const x of [0.06, 0.13]) for (const z of [-0.05, 0.05]) k.lathe('tea', 'ceramic-white', [[0, 0], [0.018, 0], [0.028, 0.035], [0.026, 0.04], [0, 0.005]], x, h + 0.02, z, { segs: k.seg(16, 6) });
    }
  },
});

const ottomanTable = liv({
  id: 'living-ottoman-coffee-table', ko: '대형 터프팅 오토만 테이블', en: 'Tufted ottoman coffee table',
  params: [P.len('width', '폭', 'Width', 1.1, 0.7, 1.5), P.len('depth', '깊이', 'Depth', 0.75, 0.5, 1.1), P.mat('fabric', '천/가죽', 'Upholstery', 'leather-cognac', 'leather'), P.mat('legMat', '다리', 'Legs', 'wood-dark', 'wood'), P.bool('tray', '트레이', 'Tray', true)],
  tags: ['ottoman', 'cocktail ottoman', 'coffee table', '오토만', '오토만 테이블', '터프팅', '커피 테이블'],
  make: (k, p) => {
    const w = p.width, d = p.depth, lh = 0.1, bh = 0.32, f = p.fabric;
    k.soft('body', f, w, bh, d, 0.05, 0, lh + bh / 2, 0, { puff: 0.02 });
    const nx = Math.max(2, Math.round(w / 0.25)), nz = Math.max(2, Math.round(d / 0.25));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (w / nx) * (i + 0.5), z = -d / 2 + (d / nz) * (j + 0.5);
      k.sphere('buttons', f, 0.012, x, lh + bh + 0.012, z, { scale: [1, 0.45, 1], segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.lathe('legs', p.legMat, [[0, 0], [0.018, 0], [0.026, 0.03], [0.03, 0.07], [0.024, lh], [0, lh]], sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07), { segs: k.seg(14, 6) });
    if (p.tray) {
      k.box('tray', 'wood-black', 0.5, 0.012, 0.34, w * 0.12, lh + bh + 0.02, 0, { r: 0.004 });
      for (const s of [-1, 1]) k.box('tray', 'wood-black', 0.5, 0.035, 0.012, w * 0.12, lh + bh + 0.043, s * 0.164, { r: 0.004 });
      addBooks(k, -w * 0.38, -w * 0.1, lh + bh + 0.025, 0, 0.22, 5, { hMax: 0.05, lean: false, fill: 0.9 });
    }
  },
});

const fireplaceConsole = liv({
  id: 'living-electric-fireplace-console', ko: '전기 벽난로 TV장', en: 'Electric fireplace media console',
  params: [P.len('width', '폭', 'Width', 1.8, 1.4, 2.4), P.mat('body', '몸체', 'Body', 'wood-white', 'wood'), P.mat('top', '상판', 'Top', 'wood-oak', 'wood'), P.bool('flame', '불꽃 켜짐', 'Flame on', true)],
  tags: ['electric fireplace', 'fireplace tv stand', 'media console', '전기 벽난로', '벽난로 TV장', '거실장'],
  make: (k, p) => {
    const w = p.width, d = 0.42, h = 0.68, fw = 0.8, side = (w - fw) / 2;
    for (const s of [-1, 1]) addCabinet(k, { w: side, h: h - 0.03, d, x: s * (w / 2 - side / 2), rows: [{ h: 1, n: 1, type: 'glass', hinge: s < 0 ? 'left' : 'right' }], body: p.body, front: p.body, handle: 'knob', handleMat: 'metal-black', base: 'plinth', plinth: 0.06 });
    // centre firebox frame
    k.box('body', p.body, fw, h - 0.03, d, 0, (h - 0.03) / 2, 0, { r: 0.002 });
    k.box('firebox', 'screen-black', fw - 0.12, 0.38, 0.02, 0, 0.3, d / 2 - 0.005, { r: 0.002 });
    k.box('glass', 'glass-tinted', fw - 0.1, 0.4, 0.006, 0, 0.3, d / 2 + 0.005, { r: 0 });
    for (let i = 0; i < 4; i++) k.cyl('logs', 'wood-dark', 0.025, 0.025, 0.24, -0.2 + i * 0.13, 0.15, d / 2 - 0.05, { rz: PI / 2 + (i % 2 ? 0.25 : -0.25), segs: k.seg(10, 5) });
    if (p.flame) {
      for (let i = 0; i < 5; i++) {
        const fl = new THREE.ConeGeometry(0.035, 0.14 + (i % 2) * 0.05, k.seg(8, 4));
        fl.translate(-0.24 + i * 0.12, 0.22 + 0.07, d / 2 - 0.04);
        k.add('flame', 'light-warm', fl);
      }
      k.light(0, 0.28, d / 2, { color: '#ff9b4a', intensity: 0.6, distance: 3 });
    }
    k.box('top', p.top, w + 0.02, 0.03, d + 0.02, 0, h - 0.015, 0, { r: 0.004 });
  },
});

const fluted = liv({
  id: 'living-fluted-sideboard', ko: '플루티드 수납장 (골 패턴)', en: 'Fluted sideboard',
  params: [P.len('width', '폭', 'Width', 1.6, 1.0, 2.2), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'), P.mat('legMat', '다리', 'Legs', 'metal-brass', 'metal')],
  tags: ['fluted sideboard', 'reeded cabinet', 'credenza', '플루티드', '골 패턴 수납장', '사이드보드', '거실 수납장'],
  make: (k, p) => {
    const w = p.width, d = 0.45, h = 0.75, legH = 0.14, wd = p.wood;
    k.box('body', wd, w, h - legH, d - 0.02, 0, legH + (h - legH) / 2, -0.01, { r: 0.004 });
    const n = Math.max(20, Math.round(w / 0.03)), r = (w - 0.02) / n / 2;
    for (let i = 0; i < n; i++) k.cyl('fronts', wd, r, r, h - legH - 0.04, -w / 2 + 0.01 + r * (2 * i + 1), legH + 0.02, d / 2 - 0.02, { segs: k.seg(8, 4), open: true });
    // door splits (thin dark gaps) + brass knobs
    const doors = Math.max(2, Math.round(w / 0.45));
    for (let i = 1; i < doors; i++) k.box('gaps', 'paint-black-matte', 0.004, h - legH - 0.04, 0.006, -w / 2 + (w * i) / doors, legH + (h - legH) / 2, d / 2 - 0.005, { r: 0 });
    for (let i = 0; i < doors; i++) k.sphere('knobs', p.legMat, 0.015, -w / 2 + (w * (i + 0.5)) / doors + (i % 2 ? -1 : 1) * (w / doors / 2 - 0.05), legH + (h - legH) / 2, d / 2 + 0.008, { segs: k.seg(12, 6), rings: k.seg(8, 4) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('legs', p.legMat, 0.015, 0.012, legH, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), { segs: k.seg(12, 6) });
  },
});

const archBook = liv({
  id: 'living-arched-bookcase', ko: '아치형 원목 책장', en: 'Arched-top bookcase',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.2), P.len('height', '높이', 'Height', 1.9, 1.5, 2.2), P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'), P.bool('books', '책', 'Books', true)],
  tags: ['arched bookcase', 'arch shelf', 'bookshelf', '아치 책장', '아치형 선반', '책장'],
  make: (k, p) => {
    const w = p.width, H = p.height, d = 0.32, t = 0.022, R = w / 2;
    // outer arched frame as a panel with an inner arched opening (front frame), plus sides / back
    const outer = new THREE.Shape(); outer.moveTo(-R, 0); outer.lineTo(R, 0); outer.lineTo(R, H - R); outer.absarc(0, H - R, R, 0, PI, false); outer.lineTo(-R, 0);
    const ri = R - t, hole = new THREE.Path(); hole.moveTo(-ri, t); hole.lineTo(-ri, H - R); hole.absarc(0, H - R, ri, PI, 0, true); hole.lineTo(ri, t); hole.lineTo(-ri, t);
    outer.holes.push(hole);
    k.panel('frame', p.wood, outer, t, 0, 0, d / 2 - t / 2, { bevel: 0.003, curveSegs: 24 });
    const back = new THREE.Shape(); back.moveTo(-R, 0); back.lineTo(R, 0); back.lineTo(R, H - R); back.absarc(0, H - R, R, 0, PI, false); back.lineTo(-R, 0);
    k.panel('frame', p.wood, back, 0.012, 0, 0, -d / 2 + 0.006, { bevel: 0.001, curveSegs: 24 });
    for (const s of [-1, 1]) k.box('frame', p.wood, t, H - R, d - 0.02, s * (R - t / 2), (H - R) / 2, 0, { r: 0.002 });
    // arched crown: a short extruded ring across the depth
    const ring = new THREE.Shape(); ring.absarc(0, 0, R, 0, PI, false); ring.lineTo(-ri, 0); ring.absarc(0, 0, ri, PI, 0, true); ring.lineTo(R, 0);
    k.panel('frame', p.wood, ring, d - 0.04, 0, H - R, 0, { bevel: 0.002, curveSegs: 24 });
    const n = Math.max(3, Math.floor((H - R) / 0.34));
    for (let i = 0; i <= n; i++) {
      const y = t / 2 + ((H - R - t) * i) / n;
      k.box('frame', p.wood, w - 2 * t, t, d - 0.03, 0, y, 0, { r: 0.002 });
      if (p.books && i < n) addBooks(k, -ri + 0.01, ri * (i % 2 ? 0.2 : 0.6), y + t / 2, 0, d - 0.08, i + 2, { hMax: Math.min(0.28, (H - R) / n - 0.04) });
    }
  },
});

export const ITEMS = [tvStand, teaTable, ottomanTable, fireplaceConsole, fluted, archBook];
