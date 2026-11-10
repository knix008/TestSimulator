// Further study / home-office designs: corner desk, floating wall desk, leaning ladder desk,
// gaming desk with an RGB strip, desk with hutch, trestle desk, drafting table, monitor riser,
// library wall with rolling ladder, reading chair + ottoman, floor globe, hanging-file cart and
// a plan (map) chest. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, roundRect, addCabinet, addHandle, addLegs, rng } from './helpers.js';
import { finish } from './kitchen.js';
import { addBooks } from './living.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const V2 = (x, y) => new THREE.Vector2(x, y);

const cornerDesk = mk({
  id: 'study-desk-corner', category: 'office', ko: '코너 책상(사선 앞면)', en: 'Corner desk with angled front',
  params: [
    P.len('wing', '날개 길이', 'Wing length', 1.3, 1.0, 1.8), P.len('depth', '깊이', 'Depth', 0.6, 0.5, 0.75),
    P.mat('top', '상판', 'Top', 'wood-oak', 'wood'), P.mat('frame', '다리', 'Frame', 'paint-white-matte'), P.bool('drawers', '서랍', 'Drawer unit', true),
  ],
  tags: ['corner desk', 'angled desk', 'home office desk', 'study desk', '코너 책상', '모서리 책상', '사선 책상', '홈오피스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.wing, dd = p.depth, h = 0.74, t = 0.025, c = 0.28;
    const s = new THREE.Shape([V2(0, 0), V2(L, 0), V2(L, dd), V2(dd + c, dd), V2(dd, dd + c), V2(dd, L), V2(0, L)]);
    k.slab('top', p.top, s, t, h - t, { bevel: 0.003 });
    // panel legs at the wing ends, a square leg in the inner corner
    k.box('frame', p.frame, 0.025, h - t, dd - 0.04, L - 0.03, (h - t) / 2, dd / 2, { r: 0.003 });
    k.box('frame', p.frame, dd - 0.04, h - t, 0.025, dd / 2, (h - t) / 2, L - 0.03, { r: 0.003 });
    k.box('frame', p.frame, 0.05, h - t, 0.05, 0.05, (h - t) / 2, 0.05, { r: 0.004 });
    k.box('frame', p.frame, L - 0.1, 0.3, 0.018, L / 2, h - t - 0.15, 0.03, { r: 0.002 });
    k.box('frame', p.frame, 0.018, 0.3, L - 0.1, 0.03, h - t - 0.15, L / 2, { r: 0.002 });
    if (p.drawers) addCabinet(k, { w: 0.4, h: 0.58, d: dd - 0.08, x: L - 0.3, z: dd / 2 - 0.02, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }], body: p.frame, front: p.frame, handle: 'edge', handleMat: 'metal-aluminium', base: 'plinth', plinth: 0.04, roles: { body: 'frame', front: 'fronts', handle: 'handles' } });
    return finish(k);
  },
});

const floatingDesk = mk({
  id: 'study-desk-floating', category: 'office', placement: 'wall', elevation: 0.62, ko: '벽 부착 플로팅 책상', en: 'Floating wall desk',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.6), P.len('depth', '깊이', 'Depth', 0.45, 0.35, 0.6),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'), P.bool('shelf', '위 선반', 'Upper shelf', true),
  ],
  tags: ['floating desk', 'wall desk', 'wall mounted desk', 'compact desk', '플로팅 책상', '벽걸이 책상', '벽 부착 책상', '좁은 공간'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, wd = p.wood;
    // drawer box under the top, top, cable slot
    k.box('body', wd, w, 0.1, d, 0, 0.05, 0, { r: 0.003 });
    k.box('fronts', wd, w - 0.04, 0.07, 0.01, 0, 0.05, d / 2 + 0.005, { r: 0.002 });
    k.box('pull', 'metal-brass', 0.12, 0.012, 0.012, 0, 0.03, d / 2 + 0.016, { r: 0.004 });
    k.box('body', wd, w, 0.025, d, 0, 0.1125, 0, { r: 0.003 });
    k.box('slot', 'plastic-black', 0.08, 0.002, 0.03, w / 2 - 0.1, 0.126, -d / 2 + 0.04, { r: 0 });
    if (p.shelf) {
      k.box('body', wd, w, 0.022, 0.22, 0, 0.55, -d / 2 + 0.11, { r: 0.003 });
      addBooks(k, -w / 2 + 0.03, -w / 2 + Math.min(0.4, w * 0.4), 0.561, -d / 2 + 0.01, 0.2, 7, { hMax: 0.24, fill: 1, lean: false });
    }
    return finish(k);
  },
});

const ladderDesk = mk({
  id: 'study-desk-ladder', category: 'office', ko: '사다리형 벽 기대는 책상', en: 'Leaning ladder desk',
  params: [P.len('width', '폭', 'Width', 0.85, 0.6, 1.2), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood')],
  tags: ['ladder desk', 'leaning desk', 'shelf desk', 'small desk', '사다리 책상', '기대는 책상', '선반 책상', '좁은 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = 1.85, z0 = 0.28, z1 = -0.25, wd = p.wood;
    const a = Math.atan2(z0 - z1, H), L = Math.hypot(H, z0 - z1);
    const zAt = (y) => z0 - (z0 - z1) * (y / H);
    for (const s of [-1, 1]) k.box('frame', wd, 0.035, L, 0.05, s * (w / 2 - 0.0175), H / 2, (z0 + z1) / 2, { r: 0.004, rx: -a });
    // desk top + modesty panel + shelves getting shallower towards the top
    const dy = 0.74;
    k.box('frame', wd, w - 0.07, 0.025, 0.5, 0, dy, zAt(dy) - 0.05, { r: 0.003 });
    k.box('frame', wd, w - 0.07, 0.18, 0.015, 0, dy - 0.1, zAt(dy) - 0.27, { r: 0.002 });
    for (const [y, sd] of [[1.12, 0.24], [1.45, 0.2], [1.75, 0.16]]) k.box('frame', wd, w - 0.07, 0.02, sd, 0, y, zAt(y) - sd / 2 + 0.03, { r: 0.002 });
    addBooks(k, -w / 2 + 0.05, w / 2 - 0.05, 1.13, zAt(1.13) - 0.21, 0.2, 3, { hMax: 0.25, fill: 0.55 });
    return finish(k);
  },
});

const gamingDesk = mk({
  id: 'study-desk-gaming', category: 'office', ko: '게이밍 데스크(RGB)', en: 'Gaming desk with RGB strip',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.0, 1.8), P.len('depth', '깊이', 'Depth', 0.7, 0.6, 0.8),
    P.color('rgb', 'RGB 색', 'RGB colour', '#7a5cff'), P.bool('shelf', '모니터 선반', 'Monitor shelf', true),
  ],
  tags: ['gaming desk', 'rgb desk', 'pc desk', 'esports', '게이밍 데스크', '게임 책상', 'RGB 책상', '컴퓨터 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.75, t = 0.025;
    k.slab('top', 'plastic-black', roundRect(w, d, 0.03), t, h - t, { bevel: 0.004 });
    k.slab('mat', 'fabric-wool-charcoal', roundRect(w - 0.1, d * 0.6, 0.02), 0.003, h, { z: 0.05, bevel: 0.001 });
    // Z-shaped legs
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.1);
      k.box('frame', 'metal-black', 0.06, 0.04, d - 0.04, x, 0.02, 0, { r: 0.006 });
      k.box('frame', 'metal-black', 0.06, Math.hypot(h - t - 0.04, d * 0.5), 0.06, x, (h - t) / 2, 0, { r: 0.006, rx: Math.atan2(d * 0.5, h - t - 0.04) });
      k.box('frame', 'metal-black', 0.06, 0.04, d - 0.08, x, h - t - 0.02, 0, { r: 0.006 });
    }
    k.box('frame', 'metal-black', w - 0.2, 0.05, 0.04, 0, h - t - 0.05, -d / 2 + 0.08, { r: 0.004 });
    k.box('rgb', 'light-cool', w - 0.08, 0.008, 0.006, 0, h - t - 0.004, d / 2 - 0.01, { r: 0, overrides: { color: p.rgb } });
    k.light(0, h - t - 0.02, d / 2, { color: p.rgb, intensity: 0.3, distance: 2 });
    if (p.shelf) {
      k.box('top', 'plastic-black', w * 0.7, 0.02, 0.25, 0, h + 0.12, -d / 2 + 0.14, { r: 0.004 });
      for (const s of [-1, 1]) k.box('frame', 'metal-black', 0.03, 0.12, 0.2, s * (w * 0.35 - 0.04), h + 0.06, -d / 2 + 0.14, { r: 0.004 });
    }
    // headphone hook + cup holder on the sides
    k.tube('frame', 'metal-black', [[w / 2 - 0.04, h - t - 0.03, 0.05], [w / 2 + 0.05, h - t - 0.03, 0.05], [w / 2 + 0.06, h - t + 0.0, 0.05]], 0.008, { segs: 8 });
    k.cyl('frame', 'metal-black', 0.045, 0.04, 0.08, -w / 2 - 0.05, h - t - 0.1, 0.1, { segs: k.seg(16, 6), open: true });
    return finish(k);
  },
});

const hutchDesk = mk({
  id: 'study-desk-hutch', category: 'office', ko: '상부장 일체형 책상', en: 'Desk with hutch',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.9, 1.6), P.mat('body', '몸체', 'Body', 'wood-white', 'wood'), P.mat('top', '상판', 'Top', 'wood-oak', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['desk with hutch', 'hutch desk', 'student desk', 'study desk', '책상', '책장 책상', '상부장 책상', '학생 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.6, h = 0.75, t = 0.022, b = p.body;
    for (const s of [-1, 1]) k.box('body', b, t, h - 0.025, d, s * (w / 2 - t / 2), (h - 0.025) / 2, 0, { r: 0.002 });
    k.box('body', b, w - 2 * t, 0.35, t, 0, h - 0.2, -d / 2 + t / 2 + 0.02, { r: 0.002 });
    k.box('top', p.top, w, 0.025, d, 0, h - 0.0125, 0, { r: 0.003 });
    addCabinet(k, { w: 0.38, h: h - 0.025, d: d - 0.04, x: w / 2 - t - 0.19, z: -0.01, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }], body: b, front: b, handle: 'knob', handleMat: 'metal-brass', plinth: 0.05, roles: { body: 'body', front: 'fronts', handle: 'handles' } });
    // hutch: sides, top, two shelves, cubby dividers
    const hh = 0.9, hd = 0.28, hz = -d / 2 + hd / 2, y0 = h;
    for (const s of [-1, 1]) k.box('body', b, t, hh, hd, s * (w / 2 - t / 2), y0 + hh / 2, hz, { r: 0.002 });
    k.box('body', b, w, t, hd + 0.01, 0, y0 + hh - t / 2, hz, { r: 0.002 });
    k.box('body', b, w - 2 * t, hh - t, 0.008, 0, y0 + (hh - t) / 2, -d / 2 + 0.004, { r: 0 });
    k.box('body', b, w - 2 * t, t, hd, 0, y0 + 0.5, hz, { r: 0.002 });
    for (const x of [-w / 6, w / 6]) k.box('body', b, t, 0.5 - t, hd, x, y0 + 0.25, hz, { r: 0.002 });
    if (p.books) {
      addBooks(k, -w / 2 + t, w / 2 - t, y0 + 0.5 + t / 2, -d / 2 + 0.01, hd - 0.03, 21, { hMax: 0.3, fill: 0.7 });
      addBooks(k, -w / 2 + t, -w / 6 - t / 2, y0, -d / 2 + 0.01, hd - 0.03, 22, { hMax: 0.26, fill: 0.9, lean: false });
    }
    return finish(k);
  },
});

const trestle = mk({
  id: 'study-desk-trestle', category: 'office', ko: '트레슬 다리 책상', en: 'Trestle desk',
  params: [P.len('width', '폭', 'Width', 1.6, 1.2, 2.2), P.len('depth', '깊이', 'Depth', 0.75, 0.6, 0.9), P.mat('top', '상판', 'Top', 'plywood', 'wood'), P.mat('legs', '트레슬', 'Trestles', 'wood-pine', 'wood')],
  tags: ['trestle desk', 'trestle table', 'studio desk', 'a-frame desk', '트레슬 책상', '작업대', '스튜디오 책상', '원목 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.74, t = 0.03, lg = p.legs;
    k.box('top', p.top, w, t, d, 0, h - t / 2, 0, { r: 0.004 });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.25), sp = d / 2 - 0.08, lh = h - t;
      const a = Math.atan2(0.12, lh), L = Math.hypot(lh, 0.12);
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) k.box('legs', lg, 0.045, L, 0.045, x + sx * 0.06, lh / 2, sz * sp, { r: 0.004, rz: -sx * a });
      k.box('legs', lg, 0.06, 0.04, d - 0.1, x, lh - 0.02, 0, { r: 0.004 });
      k.box('legs', lg, 0.03, 0.04, d - 0.06, x, 0.3, 0, { r: 0.003 });
    }
    k.box('legs', lg, w - 0.5, 0.06, 0.03, 0, 0.3, 0, { r: 0.003 });
    return finish(k);
  },
});

const drafting = mk({
  id: 'study-drafting-table', category: 'office', ko: '제도 테이블(경사 상판)', en: 'Drafting table',
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 1.6), P.num('tilt', '기울기(°)', 'Tilt (°)', 20, 0, 60, 1), P.mat('frame', '프레임', 'Frame', 'metal-steel', 'metal')],
  tags: ['drafting table', 'drawing table', 'architect table', 'art desk', '제도대', '제도 테이블', '드로잉 테이블', '설계 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.8, a = (p.tilt * PI) / 180, f = p.frame, hp = 0.82;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.12);
      k.box('frame', f, 0.05, 0.03, 0.7, x, 0.015, 0, { r: 0.006 });
      k.cyl('frame', f, 0.025, 0.025, hp - 0.03, x, 0.03, 0, { segs: k.seg(14, 6) });
      k.box('frame', f, 0.06, 0.06, 0.06, x, hp, 0, { r: 0.008 });
      k.cyl('frame', 'plastic-black', 0.03, 0.03, 0.03, x + s * 0.03, hp, 0, { rz: PI / 2, segs: k.seg(14, 6) });
    }
    k.box('frame', f, w - 0.24, 0.03, 0.03, 0, 0.25, 0, { r: 0.003 });
    // tilted board: front edge low on the pivot line, back edge raised
    const cy = hp + 0.05 + (Math.sin(a) * d) / 2, at = (ly, lz) => [cy + ly * Math.cos(a) - lz * Math.sin(a), ly * Math.sin(a) + lz * Math.cos(a)];
    k.box('board', 'paint-white-matte', w, 0.025, d, 0, cy, 0, { r: 0.004, rx: a });
    k.box('board', 'wood-oak', w, 0.03, 0.03, 0, hp + 0.07, (Math.cos(a) * d) / 2 + 0.015, { r: 0.004 });
    const [ry, rz] = at(0.019, 0.12), [py, pz] = at(0.0135, -0.05);
    k.box('rule', 'plastic-white', w - 0.04, 0.012, 0.05, 0, ry, rz, { r: 0.002, rx: a, overrides: { color: '#dfe6ea' } });
    k.box('paper', 'paper', 0.594, 0.002, 0.42, 0, py, pz, { r: 0, rx: a });
    return finish(k);
  },
});

const riser = mk({
  id: 'study-monitor-riser', category: 'office', placement: 'surface', ko: '모니터 받침대(서랍)', en: 'Monitor riser with drawer',
  params: [P.len('width', '폭', 'Width', 0.6, 0.4, 1.0), P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood')],
  tags: ['monitor riser', 'monitor stand', 'desk shelf', '모니터 받침대', '모니터 선반', '책상 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.24, h = 0.11, wd = p.wood;
    k.box('wood', wd, w, 0.02, d, 0, h - 0.01, 0, { r: 0.004 });
    for (const s of [-1, 1]) k.box('wood', wd, 0.02, h - 0.02, d, s * (w / 2 - 0.01), (h - 0.02) / 2, 0, { r: 0.003 });
    k.box('wood', wd, w * 0.4, 0.05, d - 0.02, -w * 0.2, h - 0.045, -0.01, { r: 0.003 });
    k.box('fronts', wd, w * 0.4 - 0.004, 0.046, 0.012, -w * 0.2, h - 0.045, d / 2 - 0.006, { r: 0.002 });
    k.cyl('pull', 'metal-brass', 0.008, 0.008, 0.012, -w * 0.2, h - 0.045, d / 2, { rx: PI / 2, segs: 10 });
    return finish(k);
  },
});

const libraryWall = mk({
  id: 'study-library-ladder', category: 'office', ko: '서재 책장 벽 + 이동식 사다리', en: 'Library bookcase with rolling ladder',
  params: [
    P.len('width', '폭', 'Width', 2.4, 1.6, 3.6), P.len('height', '높이', 'Height', 2.4, 2.0, 2.8),
    P.mat('wood', '나무', 'Wood', 'wood-dark', 'wood'), P.mat('metal', '레일', 'Rail', 'metal-brass', 'metal'), P.num('ladder', '사다리 위치', 'Ladder position', 0.3, 0, 1, 0.05),
  ],
  tags: ['library', 'bookcase wall', 'library ladder', 'rolling ladder', '서재', '책장', '도서관 사다리', '이동식 사다리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.35, t = 0.025, wd = p.wood;
    const bays = Math.max(2, Math.round(w / 0.8)), bw = w / bays;
    for (let i = 0; i <= bays; i++) k.box('case', wd, t, h, d, -w / 2 + i * bw + (i === 0 ? t / 2 : i === bays ? -t / 2 : 0), h / 2, 0, { r: 0.002 });
    k.box('case', wd, w + 0.06, 0.08, d + 0.05, 0, h - 0.04, 0.02, { r: 0.006 });
    k.box('case', wd, w, 0.1, d, 0, 0.05, 0, { r: 0.003 });
    k.box('case', wd, w, h, 0.01, 0, h / 2, -d / 2 + 0.005, { r: 0 });
    const rows = Math.max(4, Math.round((h - 0.2) / 0.36)), rh = (h - 0.18) / rows;
    for (let j = 1; j < rows; j++) k.box('case', wd, w - 0.02, 0.022, d - 0.01, 0, 0.1 + j * rh, 0.005, { r: 0.002 });
    for (let j = 0; j < rows; j++) for (let i = 0; i < bays; i++) {
      if ((i + j) % 2) continue;
      addBooks(k, -w / 2 + i * bw + t, -w / 2 + (i + 1) * bw - t, 0.1 + j * rh + (j ? 0.011 : 0), -d / 2 + 0.02, d - 0.05, 31 + i * 5 + j, { hMax: Math.min(0.3, rh - 0.05), fill: 0.6, lean: j % 3 === 0 });
    }
    // rail + ladder
    const ry = h - 0.35, rz = d / 2 + 0.06;
    k.rod('rail', p.metal, [-w / 2 + 0.05, ry, rz], [w / 2 - 0.05, ry, rz], 0.012);
    for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) k.rod('rail', p.metal, [x, ry, d / 2], [x, ry, rz], 0.008);
    const lx = -w / 2 + 0.35 + (w - 0.7) * p.ladder, foot = rz + 0.6, a = Math.atan2(foot - rz, ry);
    for (const s of [-1, 1]) {
      k.rod('ladder', wd, [lx + s * 0.22, 0.05, foot], [lx + s * 0.22, ry + 0.05, rz + 0.02], 0.022, { segs: 6 });
      k.cyl('rail', p.metal, 0.03, 0.03, 0.02, lx + s * 0.22, 0.03, foot, { rz: PI / 2, segs: k.seg(14, 6) });
    }
    for (let y = 0.3; y < ry; y += 0.3) { const z = foot - (foot - rz - 0.02) * (y / ry); k.box('ladder', wd, 0.44, 0.022, 0.07, lx, y, z, { r: 0.003 }); }
    void a;
    return finish(k);
  },
});

const readingChair = mk({
  id: 'study-reading-chair', category: 'office', ko: '독서 의자 + 발받침', en: 'Reading chair with ottoman',
  params: [P.mat('fabric', '천', 'Fabric', 'leather-cognac'), P.mat('legs', '다리', 'Legs', 'wood-walnut', 'wood'), P.bool('ottoman', '발받침', 'Ottoman', true)],
  tags: ['reading chair', 'armchair', 'ottoman', 'library chair', '독서 의자', '안락의자', '오토만', '서재 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const f = p.fabric, w = 0.82, d = 0.86, legH = 0.14;
    addLegs(k, 'legs', p.legs, 'tapered', w - 0.06, d - 0.1, legH, { r: 0.022, splay: 0.02, inset: 0.06 });
    k.soft('chair', f, w, 0.18, d, 0.05, 0, legH + 0.09, 0, { puff: 0.01 });
    k.soft('chair', f, w - 0.28, 0.12, d - 0.22, 0.05, 0, legH + 0.24, 0.08, { puff: 0.02 });
    k.soft('chair', f, w - 0.1, 0.72, 0.2, 0.08, 0, legH + 0.5, -d / 2 + 0.12, { rx: -0.14, puff: 0.02 });
    for (const s of [-1, 1]) {
      k.soft('chair', f, 0.14, 0.4, d - 0.08, 0.06, s * (w / 2 - 0.07), legH + 0.37, 0.02, { puff: 0.015 });
      k.soft('chair', f, 0.18, 0.32, 0.22, 0.08, s * (w / 2 - 0.09), legH + 0.88, -d / 2 + 0.16, { puff: 0.02 });
    }
    if (p.ottoman) {
      const oz = d / 2 + 0.45;
      for (const [x, z] of [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.16], [0.22, 0.16]]) k.cyl('legs', p.legs, 0.018, 0.012, 0.12, x, 0, oz + z, { segs: k.seg(10, 5) });
      k.soft('chair', f, 0.56, 0.3, 0.44, 0.06, 0, 0.27, oz, { puff: 0.02 });
    }
    return finish(k);
  },
});

const floorGlobe = mk({
  id: 'study-floor-globe', category: 'office', ko: '스탠드 지구본(대형)', en: 'Floor globe on wooden stand',
  params: [P.len('diameter', '지름', 'Diameter', 0.5, 0.35, 0.7), P.mat('wood', '스탠드', 'Stand', 'wood-walnut', 'wood'), P.color('ocean', '바다 색', 'Ocean colour', '#c9b98a')],
  tags: ['globe', 'floor globe', 'world globe', 'library', '지구본', '대형 지구본', '스탠드 지구본', '서재 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2, cy = 0.55 + R * 0.6, wd = p.wood;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('stand', wd, [c * (R + 0.14), 0, s * (R + 0.14)], [c * (R + 0.05), cy, s * (R + 0.05)], 0.022, { segs: 8 });
    }
    k.add('stand', wd, new THREE.TorusGeometry(R + 0.06, 0.018, k.seg(8, 4), k.seg(40, 12)).rotateX(PI / 2).translate(0, cy, 0));
    k.add('stand', wd, new THREE.TorusGeometry(R * 0.55, 0.012, k.seg(6, 3), k.seg(28, 10)).rotateX(PI / 2).translate(0, 0.22, 0));
    const tilt = 23.4 * PI / 180;
    k.sphere('globe', 'paper', R, 0, cy, 0, { overrides: { color: p.ocean }, segs: k.seg(32, 10), rings: k.seg(20, 8) });
    const mer = new THREE.TorusGeometry(R + 0.02, 0.008, k.seg(6, 3), k.seg(40, 12), PI * 1.2);
    mer.rotateZ(-PI * 0.1); mer.rotateY(PI / 2); mer.rotateX(tilt); mer.translate(0, cy, 0);
    k.add('meridian', 'metal-brass', mer);
    k.rod('meridian', 'metal-brass', [0, cy - R - 0.03, 0], [0, cy - R - 0.01, 0], 0.01, { segs: 8 });
    return finish(k);
  },
});

const fileCart = mk({
  id: 'study-file-cart', category: 'office', ko: '이동식 행잉 파일 카트', en: 'Rolling hanging-file cart',
  params: [P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'), P.int('files', '파일 수', 'Files', 12, 0, 20)],
  tags: ['file cart', 'hanging files', 'rolling cart', 'filing', '파일 카트', '행잉 파일', '이동식 수납', '서류 정리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.4, d = 0.62, h = 0.65, f = p.frame;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box('frame', f, 0.02, h - 0.08, 0.02, sx * (w / 2 - 0.01), 0.08 + (h - 0.08) / 2, sz * (d / 2 - 0.01), { r: 0.002 });
      k.cyl('casters', 'rubber-black', 0.03, 0.03, 0.02, sx * (w / 2 - 0.02) - 0.01, 0.03, sz * (d / 2 - 0.03), { rz: PI / 2, segs: k.seg(12, 6) });
      k.box('casters', 'plastic-black', 0.03, 0.04, 0.03, sx * (w / 2 - 0.02), 0.07, sz * (d / 2 - 0.03), { r: 0.004 });
    }
    k.box('frame', f, w, 0.01, d, 0, 0.09, 0, { r: 0.002 });
    k.box('frame', f, w - 0.04, 0.01, d - 0.04, 0, 0.3, 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('frame', f, 0.012, 0.012, d, s * (w / 2 - 0.03), h - 0.006, 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('frame', f, w, 0.02, 0.02, 0, h - 0.01, s * (d / 2 - 0.01), { r: 0.002 });
    const n = Math.round(p.files), cols = ['#3d7a4a', '#2e6db4', '#c9a227'];
    for (let i = 0; i < n; i++) {
      const z = -d / 2 + 0.04 + ((d - 0.08) * (i + 0.5)) / Math.max(1, n);
      k.box('files', 'paper', w - 0.08, 0.26, 0.004, 0, h - 0.15, z, { r: 0, overrides: { color: cols[i % 3] } });
      k.box('tabs', 'plastic-white', 0.06, 0.02, 0.002, -w / 2 + 0.08 + (i % 4) * 0.07, h - 0.01, z, { r: 0 });
    }
    return finish(k);
  },
});

const planChest = mk({
  id: 'study-plan-chest', category: 'office', ko: '도면함(플랜 체스트)', en: 'Plan chest (map drawers)',
  params: [P.len('width', '폭', 'Width', 1.2, 0.9, 1.4), P.int('drawers', '서랍 수', 'Drawers', 8, 4, 12), P.mat('body', '몸체', 'Body', 'paint-grey-matte'), P.mat('handleMat', '손잡이', 'Handles', 'metal-steel', 'metal')],
  tags: ['plan chest', 'map cabinet', 'flat file', 'drawing storage', '도면함', '플랜 체스트', '지도 서랍', '설계 도면 보관'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.drawers);
    addCabinet(k, { w: p.width, h: 0.82, d: 0.9, rows: Array.from({ length: n }, () => ({ h: 1 / n, n: 1, type: 'drawer' })), body: p.body, front: p.body, handle: 'bar', handleMat: p.handleMat, top: 'wood-oak', topThick: 0.03, topOverhang: 0.01, plinth: 0.07 });
    return finish(k);
  },
});

void addHandle; void rng;

export const ITEMS = [cornerDesk, floatingDesk, ladderDesk, gamingDesk, hutchDesk, trestle, drafting, riser, libraryWall, readingChair, floorGlobe, fileCart, planChest];
