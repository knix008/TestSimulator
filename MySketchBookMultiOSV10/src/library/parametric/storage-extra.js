// Further storage designs: apothecary chest, stepped under-stairs pull-outs, shoe bench with
// cubbies, wall grid panel, tambour cabinet, chrome wire shelving, tilt-out laundry cabinet,
// louvred bin rack, two-sided room-divider shelf, campaign chest, step bookcase and an open
// walk-in wardrobe system. See ARCHITECTURE.md §12 → Library objects.
import { Kit, P, addCabinet, addHandle, addLegs, rng } from './helpers.js';
import { finish } from './kitchen.js';
import { addBooks } from './living.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;

/** Hollow carcass open at the front (z = d/2), centred at x. */
function shell(k, role, mat, w, h, d, { x = 0, y0 = 0, t = 0.018, back = true } = {}) {
  for (const s of [-1, 1]) k.box(role, mat, t, h, d, x + s * (w / 2 - t / 2), y0 + h / 2, 0, { r: 0.002 });
  k.box(role, mat, w - 2 * t, t, d, x, y0 + h - t / 2, 0, { r: 0.0015 });
  k.box(role, mat, w - 2 * t, t, d, x, y0 + t / 2, 0, { r: 0.0015 });
  if (back) k.box(role, mat, w - 2 * t + 0.002, h - 2 * t + 0.002, 0.006, x, y0 + h / 2, -d / 2 + 0.003, { r: 0 });
}

const apothecary = mk({
  id: 'storage-apothecary', category: 'storage', ko: '약장 서랍장(아포테카리)', en: 'Apothecary drawer chest',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.5, 1.4), P.len('height', '높이', 'Height', 1.15, 0.7, 1.6),
    P.int('rows', '서랍 단', 'Drawer rows', 6, 3, 9), P.int('cols', '서랍 열', 'Drawer columns', 4, 2, 6),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'), P.mat('handleMat', '손잡이', 'Knobs', 'metal-brass', 'metal'),
  ],
  tags: ['apothecary', 'apothecary chest', 'small drawers', 'card catalogue', '약장', '서랍장', '한약장', '작은 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rows = Math.round(p.rows), cols = Math.round(p.cols);
    const r = addCabinet(k, {
      w: p.width, h: p.height, d: 0.42, rows: Array.from({ length: rows }, () => ({ h: 1 / rows, n: cols, type: 'drawer' })),
      body: p.wood, front: p.wood, handle: 'knob', handleMat: p.handleMat, base: 'legs', legH: 0.1, legStyle: 'square', legMat: p.wood,
      top: p.wood, topThick: 0.03, topOverhang: 0.02,
    });
    // label holders above the knobs
    const fh = (r.bodyTop - r.yb) / rows, cw = p.width / cols;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) k.box('labels', p.handleMat, Math.min(0.06, cw * 0.4), 0.02, 0.003, -p.width / 2 + cw * (i + 0.5), r.yb + fh * (j + 0.5) + Math.min(0.035, fh * 0.28), 0.21 + 0.0015, { r: 0.001 });
    return finish(k);
  },
});

const underStairs = mk({
  id: 'storage-under-stairs', category: 'storage', ko: '계단 밑 슬라이드 수납장', en: 'Under-stairs pull-out storage',
  params: [
    P.len('width', '폭(계단 길이)', 'Width (stair run)', 2.4, 1.2, 3.6), P.len('height', '최고 높이', 'Tallest height', 2.0, 1.2, 2.6),
    P.int('units', '칸 수', 'Units', 4, 2, 6), P.len('depth', '깊이', 'Depth', 0.6, 0.4, 0.9),
    P.mat('front', '앞판', 'Fronts', 'paint-white-matte'), P.mat('body', '몸체', 'Carcass', 'wood-white'),
  ],
  tags: ['under stairs storage', 'pull out', 'stair cupboard', '계단 밑 수납', '계단 수납장', '슬라이드 수납', '붙박이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.units), cw = p.width / n;
    for (let i = 0; i < n; i++) {
      const h = p.height * (0.35 + 0.65 * ((n - i) / n));
      addCabinet(k, { w: cw, h, d: p.depth, x: -p.width / 2 + cw * (i + 0.5), rows: [{ h: 1, n: 1, type: 'door', handleY: h * 0.55 }], body: p.body, front: p.front, handle: 'edge', handleMat: 'metal-aluminium', plinth: 0.06 });
    }
    return finish(k);
  },
});

const shoeBench = mk({
  id: 'storage-shoe-bench-cubby', category: 'storage', ko: '칸칸 신발 벤치', en: 'Shoe bench with cubbies',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.6), P.int('cols', '칸 수(가로)', 'Columns', 4, 2, 6),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-linen-grey', 'fabric'), P.bool('shoes', '신발', 'Shoes', true),
  ],
  tags: ['shoe bench', 'entryway bench', 'shoe storage', 'cubby bench', '신발 벤치', '현관 벤치', '신발장', '수납 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.46, d = 0.36, t = 0.018, n = Math.round(p.cols), wd = p.wood;
    shell(k, 'frame', wd, w, h - 0.05, d, { y0: 0.0 });
    k.box('frame', wd, w - 2 * t, t, d - 0.01, 0, (h - 0.05) / 2, 0.004, { r: 0.0015 });
    for (let i = 1; i < n; i++) k.box('frame', wd, t, h - 0.05 - 2 * t, d - 0.01, -w / 2 + (w * i) / n, (h - 0.05) / 2, 0.004, { r: 0.0015 });
    k.soft('cushion', p.fabric, w, 0.05, d, 0.02, 0, h - 0.025, 0, { puff: 0.008 });
    if (p.shoes) {
      const r = rng(3), cols = ['#2f2f33', '#8a5a3c', '#e8e4dc'];
      for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) {
        if (r() < 0.3) continue;
        const cx = -w / 2 + (w / n) * (i + 0.5), y0 = t + j * ((h - 0.05) / 2);
        const c = cols[Math.floor(r() * cols.length)];
        for (const s of [-1, 1]) k.rbox('shoes', 'leather-black', Math.min(0.08, w / n / 2 - 0.015), 0.08, 0.27, 0.025, cx + s * Math.min(0.045, w / n / 4), y0 + 0.04, 0.02, { segs: k.seg(3, 1), overrides: { color: c } });
      }
    }
    return finish(k);
  },
});

const gridPanel = mk({
  id: 'storage-grid-panel', category: 'storage', placement: 'wall', elevation: 0.9, ko: '벽걸이 메쉬 그리드 수납', en: 'Wall grid panel organiser',
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.4, 1.2), P.len('height', '높이', 'Height', 1.0, 0.6, 1.4),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'), P.bool('accessories', '바구니·고리', 'Baskets & hooks', true),
  ],
  tags: ['wall grid', 'mesh panel', 'grid organiser', 'wire wall', '메쉬망', '그리드 수납', '벽 수납', '철망 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, m = p.metal, pitch = 0.05;
    const nx = Math.round(w / pitch), ny = Math.round(h / pitch);
    for (let i = 0; i <= nx; i++) k.box('grid', m, 0.004, h, 0.004, -w / 2 + (w * i) / nx, h / 2, 0.006, { r: 0 });
    for (let j = 0; j <= ny; j++) k.box('grid', m, w, 0.004, 0.004, 0, (h * j) / ny, 0.01, { r: 0 });
    for (const s of [-1, 1]) for (const f of [0.1, 0.9]) k.cyl('grid', m, 0.008, 0.008, 0.012, s * (w / 2 - 0.05), h * f, -0.006, { rx: PI / 2, segs: 8 });
    if (p.accessories) {
      const bw = Math.min(0.35, w * 0.45), by = h * 0.3;
      // wire basket: floor + front and side rails
      k.box('acc', m, bw, 0.004, 0.12, -w / 4, by, 0.075, { r: 0 });
      for (const y of [by + 0.03, by + 0.07]) k.box('acc', m, bw, 0.004, 0.004, -w / 4, y, 0.135, { r: 0 });
      for (const s of [-1, 1]) for (const y of [by + 0.03, by + 0.07]) k.box('acc', m, 0.004, 0.004, 0.12, -w / 4 + s * bw / 2, y, 0.075, { r: 0 });
      for (let i = 0; i < 6; i++) k.box('acc', m, 0.003, 0.08, 0.003, -w / 4 - bw / 2 + (bw * i) / 5, by + 0.04, 0.135, { r: 0 });
      // small shelf + three hooks
      k.box('shelf', 'wood-oak', Math.min(0.4, w * 0.5), 0.015, 0.12, w / 4, h * 0.7, 0.075, { r: 0.002 });
      for (let i = 0; i < 3; i++) k.tube('acc', m, [[w * 0.05 + i * 0.08, h * 0.45, 0.012], [w * 0.05 + i * 0.08, h * 0.45, 0.05], [w * 0.05 + i * 0.08, h * 0.47, 0.06]], 0.003, { segs: 8, radial: 5 });
      k.lathe('pot', 'ceramic-white', [[0, 0], [0.04, 0], [0.05, 0.09], [0, 0.09]], w / 4 - 0.08, h * 0.7 + 0.0075, 0.075, { segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

const tambour = mk({
  id: 'storage-tambour', category: 'storage', ko: '탐부르 슬랫 도어 수납장', en: 'Tambour-door cabinet',
  params: [
    P.len('width', '폭', 'Width', 1.2, 0.6, 1.8), P.len('height', '높이', 'Height', 0.78, 0.5, 1.2),
    P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'), P.mat('legs', '다리', 'Legs', 'metal-black'),
  ],
  tags: ['tambour', 'fluted cabinet', 'slatted door', 'sideboard', '탐부르', '슬랫 도어', '리브 수납장', '사이드보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.42, legH = 0.16, wd = p.wood;
    addLegs(k, 'legs', p.legs, 'metal', w - 0.06, d - 0.06, legH, { r: 0.03 });
    k.box('body', wd, w, h - legH, d - 0.02, 0, legH + (h - legH) / 2, -0.01, { r: 0.003 });
    // two tambour doors made of half-round slats
    const sw = 0.026, n = Math.floor((w - 0.04) / sw), zf = d / 2 - 0.01;
    for (let i = 0; i < n; i++) k.cyl('slats', wd, sw / 2, sw / 2, h - legH - 0.04, -((n * sw) / 2) + sw * (i + 0.5), legH + 0.02, zf - 0.004, { segs: k.seg(10, 5) });
    k.box('body', wd, 0.006, h - legH - 0.04, 0.03, 0, legH + (h - legH) / 2, zf + 0.004, { r: 0 });
    for (const s of [-1, 1]) k.box('pulls', 'metal-brass', 0.012, 0.12, 0.02, s * 0.03, legH + (h - legH) * 0.6, zf + 0.02, { r: 0.004 });
    return finish(k);
  },
});

const wireShelf = mk({
  id: 'storage-wire-shelving', category: 'storage', ko: '크롬 와이어 선반', en: 'Chrome wire shelving',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.5), P.len('height', '높이', 'Height', 1.8, 0.8, 2.1), P.len('depth', '깊이', 'Depth', 0.45, 0.35, 0.6),
    P.int('shelves', '선반 수', 'Shelves', 5, 3, 7), P.mat('metal', '금속', 'Metal', 'metal-chrome', 'metal'), P.bool('casters', '바퀴', 'Casters', false),
  ],
  tags: ['wire shelving', 'chrome rack', 'metro shelf', 'garage shelf', '와이어 선반', '크롬 선반', '철제 선반', '앵글 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, m = p.metal, y0 = p.casters ? 0.1 : 0.01, h = p.height - y0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl('posts', m, 0.0125, 0.0125, h, sx * (w / 2 - 0.015), y0, sz * (d / 2 - 0.015), { segs: k.seg(12, 6) });
      if (p.casters) { k.box('casters', 'plastic-black', 0.04, 0.05, 0.05, sx * (w / 2 - 0.015), 0.06, sz * (d / 2 - 0.015), { r: 0.006 }); k.cyl('casters', 'rubber-black', 0.035, 0.035, 0.025, sx * (w / 2 - 0.015) - 0.0125, 0.035, sz * (d / 2 - 0.015), { rz: PI / 2, segs: k.seg(12, 6) }); }
      else k.cyl('posts', 'plastic-black', 0.014, 0.014, 0.012, sx * (w / 2 - 0.015), 0, sz * (d / 2 - 0.015), { segs: 8 });
    }
    const n = Math.round(p.shelves), nw = Math.round(w / 0.03);
    for (let j = 0; j < n; j++) {
      const y = y0 + 0.05 + ((h - 0.08) * j) / (n - 1);
      for (const s of [-1, 1]) k.box('shelves', m, w - 0.02, 0.025, 0.004, 0, y, s * (d / 2 - 0.015), { r: 0 });
      for (const s of [-1, 1]) k.box('shelves', m, 0.004, 0.025, d - 0.03, s * (w / 2 - 0.015), y, 0, { r: 0 });
      for (let i = 1; i < nw; i++) k.box('shelves', m, 0.004, 0.004, d - 0.03, -w / 2 + (w * i) / nw, y + 0.012, 0, { r: 0 });
      for (const z of [-d / 6, d / 6]) k.box('shelves', m, w - 0.03, 0.004, 0.004, 0, y + 0.008, z, { r: 0 });
    }
    return finish(k);
  },
});

const laundry = mk({
  id: 'storage-laundry-tilt', category: 'storage', ko: '틸트형 빨래 바구니 수납장', en: 'Tilt-out laundry hamper cabinet',
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.45, 1.2), P.mat('front', '앞판', 'Fronts', 'paint-white-matte'), P.mat('top', '상판', 'Top', 'wood-oak', 'wood'),
    P.num('open', '열림', 'Open', 0.6, 0, 1, 0.05),
  ],
  tags: ['laundry hamper', 'tilt out', 'laundry cabinet', 'bathroom storage', '빨래 바구니', '빨래함', '세탁물 수납장', '틸트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.9, d = 0.4, t = 0.03, cw = w / 2;
    k.box('body', p.front, w, h - t - 0.06, d - 0.02, 0, 0.06 + (h - t - 0.06) / 2, -0.01, { r: 0.003 });
    k.box('body', p.front, w - 0.02, 0.06, d - 0.06, 0, 0.03, -0.03, { r: 0.002 });
    k.box('top', p.top, w + 0.02, t, d + 0.01, 0, h - t / 2, 0, { r: 0.004 });
    const fh = h - t - 0.06 - 0.006, zf = d / 2;
    for (const s of [-1, 1]) {
      const a = s < 0 ? p.open * 0.35 : 0, cx = s * cw / 2;
      const yc = 0.063 + Math.cos(a) * fh / 2, zc = zf + Math.sin(a) * fh / 2;
      k.box('fronts', p.front, cw - 0.006, fh, 0.019, cx, yc, zc, { r: 0.0025, rx: a });
      k.box('pulls', 'metal-black', 0.14, 0.02, 0.025, cx, 0.063 + Math.cos(a) * (fh - 0.06), zf + Math.sin(a) * (fh - 0.06) + 0.012, { r: 0.004, rx: a });
      if (a > 0.05) {
        // the bin behind the open front with laundry in it
        k.box('bin', 'plastic-grey', cw - 0.06, fh * 0.9, 0.006, cx, 0.063 + fh * 0.45, zf - 0.22, { r: 0, rx: a * 0.5 });
        k.soft('laundry', 'fabric-cotton-white', cw - 0.1, 0.12, 0.18, 0.05, cx, 0.063 + fh * 0.88, zf - 0.03, { puff: 0.03 });
      }
    }
    return finish(k);
  },
});

const binRack = mk({
  id: 'storage-bin-rack', category: 'storage', ko: '부품 박스 랙(경사 수납함)', en: 'Louvred bin rack',
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.6), P.len('height', '높이', 'Height', 1.4, 0.8, 2.0), P.int('rows', '단 수', 'Rows', 4, 2, 6),
    P.color('color', '수납함 색', 'Bin colour', '#2e6db4'), P.mat('frame', '프레임', 'Frame', 'metal-steel', 'metal'),
  ],
  tags: ['bin rack', 'parts bins', 'garage storage', 'workshop', 'picking bins', '부품함', '공구 수납', '차고 수납', '박스 랙'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.4, f = p.frame, n = Math.round(p.rows);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', f, 0.04, h, 0.04, sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02), { r: 0.003 });
    const rh = (h - 0.1) / n, cols = Math.max(2, Math.round(w / 0.3)), bw = (w - 0.08) / cols;
    for (let j = 0; j < n; j++) {
      const y = 0.08 + j * rh;
      k.box('frame', f, w, 0.025, d, 0, y, 0, { r: 0.002 });
      for (let i = 0; i < cols; i++) {
        const x = -w / 2 + 0.04 + bw * (i + 0.5), bh = Math.min(0.18, rh - 0.05);
        k.box('bins', 'plastic-white', bw - 0.01, bh * 0.55, d - 0.06, x, y + 0.0125 + bh * 0.275, -0.01, { r: 0.006, overrides: { color: p.color } });
        k.box('bins', 'plastic-white', bw - 0.01, bh, 0.01, x, y + 0.0125 + bh / 2, -d / 2 + 0.035, { r: 0.003, overrides: { color: p.color } });
        k.box('bins', 'plastic-white', bw - 0.01, bh * 0.55, 0.012, x, y + 0.0125 + bh * 0.275, d / 2 - 0.035, { r: 0.003, overrides: { color: p.color } });
        k.box('labels', 'paper', bw * 0.5, 0.03, 0.002, x, y + 0.0125 + bh * 0.3, d / 2 - 0.028, { r: 0 });
      }
    }
    k.box('frame', f, w, 0.025, d, 0, h - 0.0125, 0, { r: 0.002 });
    return finish(k);
  },
});

const divider = mk({
  id: 'storage-divider-shelf', category: 'storage', ko: '양면 공간 분리 책장', en: 'Two-sided room divider shelf',
  params: [
    P.len('width', '폭', 'Width', 1.6, 1.0, 2.4), P.len('height', '높이', 'Height', 1.8, 1.0, 2.2),
    P.mat('wood', '나무', 'Wood', 'wood-ash', 'wood'), P.bool('books', '책', 'Books', true),
  ],
  tags: ['room divider', 'open shelf', 'partition shelf', 'bookcase', '공간 분리', '파티션 책장', '양면 책장', '오픈 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.34, t = 0.022, wd = p.wood;
    shell(k, 'frame', wd, w, h - 0.05, d, { y0: 0.05, t, back: false });
    k.box('frame', 'metal-black', w - 0.1, 0.05, d - 0.06, 0, 0.025, 0, { r: 0.002 });
    const rows = Math.max(3, Math.round((h - 0.05) / 0.36)), rh = (h - 0.05 - t) / rows;
    for (let j = 0; j < rows; j++) {
      const y = 0.05 + t / 2 + j * rh;
      if (j) k.box('frame', wd, w - 2 * t, t, d, 0, y, 0, { r: 0.0015 });
      // staggered vertical dividers
      const xs = j % 2 ? [-w * 0.2, w * 0.25] : [-w * 0.32, w * 0.08];
      for (const x of xs) k.box('frame', wd, t, rh - t, d, x, y + rh / 2, 0, { r: 0.0015 });
      if (p.books && j < rows) {
        const x0 = j % 2 ? -w * 0.2 + t : -w / 2 + t, x1 = j % 2 ? w * 0.25 - t / 2 : -w * 0.32 - t / 2;
        if (x1 - x0 > 0.15) addBooks(k, x0, x1, y + t / 2, -d / 2 + 0.02, d - 0.04, 11 + j, { hMax: Math.min(0.3, rh - 0.05), fill: 0.7 });
        if (j % 3 === 1) k.box('boxes', 'fabric-linen-beige', 0.26, Math.min(0.2, rh - 0.06), 0.26, w * 0.375 - t / 2, y + t / 2 + Math.min(0.2, rh - 0.06) / 2, 0, { r: 0.01 });
      }
    }
    return finish(k);
  },
});

const campaign = mk({
  id: 'storage-campaign-chest', category: 'storage', ko: '캠페인 서랍장(황동 모서리)', en: 'Campaign chest of drawers',
  params: [P.len('width', '폭', 'Width', 0.9, 0.7, 1.3), P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'), P.mat('brass', '금속 장식', 'Brass', 'metal-brass', 'metal')],
  tags: ['campaign chest', 'chest of drawers', 'military chest', 'brass corners', '캠페인 서랍장', '서랍장', '황동 장식', '빈티지'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 1.0, d = 0.46, legH = 0.08, br = p.brass;
    const r = addCabinet(k, {
      w, h, d, rows: [{ h: 0.3, n: 1, type: 'drawer' }, { h: 0.27, n: 1, type: 'drawer' }, { h: 0.23, n: 1, type: 'drawer' }, { h: 0.2, n: 2, type: 'drawer' }],
      body: p.wood, front: p.wood, handle: 'none', base: 'legs', legH, legStyle: 'square', legMat: p.wood, top: p.wood, topThick: 0.025,
    });
    const fronts = [0.3, 0.27, 0.23, 0.2], H = r.bodyTop - r.yb;
    let y = r.yb;
    for (let i = 0; i < 4; i++) {
      const fh = fronts[i] * H, cy = y + fh / 2, xs = i === 3 ? [-w / 4, w / 4] : [-w / 4, w / 4];
      for (const x of xs) { k.box('brass', br, 0.11, 0.05, 0.004, x, cy, d / 2 + 0.002, { r: 0.001 }); k.box('brass', br, 0.07, 0.008, 0.016, x, cy - 0.012, d / 2 + 0.01, { r: 0.002 }); }
      y += fh;
    }
    // corner brackets and straps
    for (const sx of [-1, 1]) for (const yy of [r.yb + 0.02, r.top - 0.03]) k.box('brass', br, 0.06, 0.06, 0.004, sx * (w / 2 - 0.03), yy, d / 2 + 0.002, { r: 0.001 });
    for (const sx of [-1, 1]) k.box('brass', br, 0.004, 0.05, d * 0.9, sx * (w / 2 + 0.002), (r.yb + r.top) / 2, 0, { r: 0.001 });
    for (const sx of [-1, 1]) k.box('brass', br, 0.05, 0.02, 0.06, sx * (w / 2 + 0.01), (r.yb + r.top) / 2, 0, { r: 0.004 });
    return finish(k);
  },
});

const stepCase = mk({
  id: 'storage-step-bookcase', category: 'storage', ko: '계단형 책장', en: 'Stepped bookcase',
  params: [P.int('steps', '단 수', 'Steps', 4, 2, 6), P.len('cube', '칸 크기', 'Cube size', 0.36, 0.28, 0.45), P.mat('wood', '나무', 'Wood', 'wood-white', 'wood'), P.bool('books', '책', 'Books', true)],
  tags: ['step bookcase', 'staircase shelf', 'tiered shelf', 'cube shelf', '계단형 책장', '계단 선반', '큐브 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.steps), c = p.cube, d = 0.3, t = 0.018;
    for (let i = 0; i < n; i++) {
      const cnt = n - i, x = -(n * c) / 2 + c * (i + 0.5);
      for (let j = 0; j < cnt; j++) {
        shell(k, 'frame', p.wood, c, c, d, { x, y0: j * c, t, back: (i + j) % 2 === 0 });
        if (p.books && (i + j) % 3 === 0) addBooks(k, x - c / 2 + t, x + c / 2 - t, j * c + t, -d / 2 + 0.01, d - 0.03, 5 + i * 7 + j, { hMax: c - 0.06, fill: 0.8, lean: false });
      }
    }
    return finish(k);
  },
});

const wardrobe = mk({
  id: 'storage-open-wardrobe', category: 'storage', ko: '오픈 드레스룸 시스템장', en: 'Open walk-in wardrobe system',
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.2, 3.0), P.len('height', '높이', 'Height', 2.2, 1.8, 2.6),
    P.mat('body', '몸체', 'Panels', 'wood-oak', 'wood'), P.bool('clothes', '옷', 'Clothes', true),
  ],
  tags: ['walk-in wardrobe', 'closet system', 'dressing room', 'open wardrobe', '드레스룸', '시스템 행거', '오픈 옷장', '붙박이장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.5, t = 0.022, b = p.body;
    // three bays: hanging (long), drawers + shelves (middle), double hanging
    const mid = 0.6, side = (w - mid) / 2;
    const xs = [-w / 2, -w / 2 + side, -w / 2 + side + mid, w / 2];
    for (const x of xs) k.box('panels', b, t, h, d, x + (x === xs[0] ? t / 2 : x === xs[3] ? -t / 2 : 0), h / 2, 0, { r: 0.002 });
    k.box('panels', b, w, t, d, 0, h - t / 2, 0, { r: 0.002 });
    k.box('panels', b, w, 0.06, d - 0.04, 0, 0.03, -0.02, { r: 0.002 });
    const lx = -w / 2 + side / 2, rx = w / 2 - side / 2, cx = 0;
    // shelves above the rails
    for (const x of [lx, rx]) k.box('panels', b, side - t, t, d, x, h - 0.32, 0, { r: 0.002 });
    k.rod('rails', 'metal-chrome', [-w / 2 + t, h - 0.4, 0], [-w / 2 + side - t / 2, h - 0.4, 0], 0.013);
    for (const y of [h - 0.4, h * 0.48]) k.rod('rails', 'metal-chrome', [w / 2 - side + t / 2, y, 0], [w / 2 - t, y, 0], 0.013);
    k.box('panels', b, side - t, t, d, rx, h * 0.48 + 0.06, 0, { r: 0.002 });
    // middle bay: 3 drawers then shelves
    addCabinet(k, { w: mid - t, h: 0.75, d, x: cx, y0: 0.06, base: 'none', rows: [{ h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 1, type: 'drawer' }], body: b, front: b, handle: 'edge', handleMat: 'metal-black', roles: { body: 'panels', front: 'fronts', handle: 'handles' } });
    for (let i = 1; i <= 4; i++) k.box('panels', b, mid - t, t, d, cx, 0.81 + i * ((h - 0.81) / 5), 0, { r: 0.002 });
    if (p.clothes) {
      const r = rng(4), cols = ['#2b3a55', '#d8d2c4', '#7b2e2e'];
      const hang = (x0, x1, y, len) => {
        for (let x = x0 + 0.04; x < x1 - 0.03; x += 0.05 + r() * 0.03) {
          const c = cols[Math.floor(r() * cols.length)], L = len * (0.75 + r() * 0.25);
          k.tube('hangers', 'wood-oak', [[x, y - 0.06, -0.2], [x, y - 0.02, 0], [x, y - 0.06, 0.2]], 0.006, { segs: 6, radial: 4 });
          k.box('clothes', 'fabric-cotton-white', 0.02, L, 0.42, x, y - 0.06 - L / 2, 0, { r: 0.008, overrides: { color: c } });
        }
      };
      hang(-w / 2 + t, -w / 2 + side - t / 2, h - 0.4, 1.2);
      hang(w / 2 - side + t / 2, w / 2 - t, h - 0.4, 0.75);
      hang(w / 2 - side + t / 2, w / 2 - t, h * 0.48, 0.7);
      for (let i = 0; i < 3; i++) k.rbox('folded', 'fabric-cotton-white', 0.3, 0.05 + i * 0.012, 0.3, 0.02, cx, 0.81 + (i + 1) * ((h - 0.81) / 5) + t / 2 + 0.03, 0, { segs: k.seg(3, 1), overrides: { color: cols[i] } });
    }
    return finish(k);
  },
});

void addHandle;

export const ITEMS = [apothecary, underStairs, shoeBench, gridPanel, tambour, wireShelf, laundry, binRack, divider, campaign, stepCase, wardrobe];
