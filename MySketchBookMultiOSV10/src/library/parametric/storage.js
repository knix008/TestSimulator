// Storage: shelving, cube storage, Korean shoe cabinet (신발장), coat rack, built-in closet.
import { Kit, item, P, OPT, rng, addCabinet, addHandle, roundRect } from './helpers.js';
import { addBooks } from './living.js';

/* -------------------------------------------------------------- shelving */

const shelving = item({
  id: 'shelving-unit', category: 'storage', ko: '선반장', en: 'Shelving unit', size: [1.0, 1.8, 0.4],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.5, 2.0),
    P.len('height', '높이', 'Height', 1.8, 0.8, 2.4),
    P.len('depth', '깊이', 'Depth', 0.4, 0.25, 0.6),
    P.int('shelves', '선반 수', 'Shelves', 5, 2, 8),
    P.pick('style', '형태', 'Style', 'metal', [['metal', '철제 프레임', 'Steel frame'], ['wood', '원목', 'Solid wood']]),
    P.mat('board', '선반', 'Boards', 'wood-oak', 'wood'),
    P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
    P.bool('decor', '소품', 'Props', true),
  ],
  tags: ['shelving', 'shelf', 'rack', 'open shelf', '선반', '선반장', '오픈 선반', '철제 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p, n = p.shelves;
    const metal = p.style === 'metal';
    const post = metal ? 0.025 : 0.04;
    const frameMat = metal ? p.frame : p.board;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', frameMat, post, h, post, sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2), { r: metal ? 0.002 : 0.004, segs: 1 });
    const span = (h - 0.12) / (n - 1);
    const rand = rng(w * 7 + n);
    for (let i = 0; i < n; i++) {
      const y = 0.1 + span * i - (i === n - 1 ? 0.02 : 0);
      // shelf board sits on side rails (metal) or between the posts (wood)
      k.box('boards', p.board, w - (metal ? 0.004 : 2 * post), 0.025, d - (metal ? 0.004 : 0.004), 0, y, 0, { r: 0.003 });
      if (metal) for (const sz of [-1, 1]) k.box('frame', p.frame, w - 2 * post, 0.025, 0.012, 0, y - 0.0255, sz * (d / 2 - 0.006), { r: 0.0015 });
      if (!p.decor || i === n - 1) continue;
      const room = span - 0.04, top = y + 0.0125;
      if (room < 0.18) continue;
      const kind = (i + Math.floor(rand() * 3)) % 3;
      if (kind === 0) addBooks(k, -w / 2 + post + 0.02, w / 2 - post - 0.02, top, -d / 2 + 0.04, Math.min(d - 0.08, 0.24), 11 + i, { hMax: Math.min(0.3, room - 0.03), fill: 0.6 });
      else if (kind === 1) {
        // a woven basket + a small vase
        const bw = Math.min(0.36, w * 0.4), bh = Math.min(0.24, room - 0.04);
        k.soft('baskets', 'rattan', bw, bh, Math.min(0.3, d - 0.06), 0.015, -w / 2 + post + 0.03 + bw / 2, top + bh / 2, 0, { flat: 3 });
        k.lathe('vase', 'ceramic-matte', [[0, 0], [0.04, 0], [0.055, 0.05], [0.045, 0.12], [0.025, 0.16], [0.028, 0.18], [0, 0.18]], w / 2 - post - 0.1, top, 0, { smooth: 16, segs: k.seg(24, 8), overrides: { color: '#c9bba5' } });
      } else {
        // stacked boxes
        const bw = Math.min(0.32, w * 0.35);
        k.box('boxes', 'paint-white-matte', bw, 0.12, Math.min(0.28, d - 0.08), w / 2 - post - 0.03 - bw / 2, top + 0.06, 0, { r: 0.004, overrides: { color: '#d8cfc2' } });
        k.box('boxes', 'paint-white-matte', bw * 0.85, 0.1, Math.min(0.24, d - 0.1), w / 2 - post - 0.03 - bw / 2, top + 0.17, 0, { r: 0.004, overrides: { color: '#8c9a8b' } });
        addBooks(k, -w / 2 + post + 0.02, 0, top, -d / 2 + 0.04, Math.min(d - 0.08, 0.22), 21 + i, { hMax: Math.min(0.28, room - 0.03), fill: 0.7, lean: false });
      }
    }
    return k.group();
  },
});

/* ----------------------------------------------------------- cube storage */

const cube = item({
  id: 'cube-storage', category: 'storage', ko: '큐브 수납장', en: 'Cube storage', size: [0.77, 1.47, 0.39],
  params: [
    P.int('cols', '가로 칸', 'Columns', 2, 1, 5),
    P.int('rows', '세로 칸', 'Rows', 4, 1, 5),
    P.mat('wood', '몸체', 'Body', 'wood-white', 'wood'),
    P.bool('bins', '수납 바구니', 'Fabric bins', true),
    P.mat('binFabric', '바구니 천', 'Bin fabric', 'fabric-linen-grey', 'fabric'),
  ],
  tags: ['cube storage', 'cubby', 'kallax', '큐브 수납장', '칸막이 선반', '수납 바구니'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = 0.335, t = 0.016, o = 0.039, d = 0.39;
    const w = 2 * o + p.cols * c + (p.cols - 1) * t, h = 2 * o + p.rows * c + (p.rows - 1) * t;
    for (const s of [-1, 1]) {
      k.box('frame', p.wood, o, h, d, s * (w / 2 - o / 2), h / 2, 0, { r: 0.003 });
      k.box('frame', p.wood, w - 2 * o, o, d, 0, s > 0 ? h - o / 2 : o / 2, 0, { r: 0.003 });
    }
    for (let i = 1; i < p.cols; i++) k.box('frame', p.wood, t, h - 2 * o, d - 0.002, -w / 2 + o + i * (c + t) - t / 2, h / 2, 0, { r: 0.0015 });
    for (let j = 1; j < p.rows; j++) k.box('frame', p.wood, w - 2 * o, t, d - 0.002, 0, o + j * (c + t) - t / 2, 0, { r: 0.0015 });
    if (p.bins) {
      const rand = rng(p.cols * 5 + p.rows);
      for (let j = 0; j < p.rows; j++) for (let i = 0; i < p.cols; i++) {
        if ((i + j) % 2 === 1 && rand() < 0.8) continue;
        const cx = -w / 2 + o + i * (c + t) + c / 2, cy = o + j * (c + t) + c / 2;
        // fabric bin slightly smaller than the cube, with a dark grip slot
        k.soft('bins', p.binFabric, c - 0.012, c - 0.012, d - 0.04, 0.012, cx, cy - 0.005, 0.008, { flat: 3, puff: 0.004 });
        k.box('slots', 'plastic-black', 0.09, 0.025, 0.004, cx, cy + c / 2 - 0.06, d / 2 - 0.01, { r: 0.008, segs: 2 });
      }
    }
    return k.group();
  },
});

/* ------------------------------------------------------------ shoe cabinet */

const shoeCabinet = item({
  id: 'shoe-cabinet', category: 'storage', ko: '신발장', en: 'Shoe cabinet', size: [1.0, 1.2, 0.36],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 2.4),
    P.len('height', '높이', 'Height', 1.2, 0.8, 2.4),
    P.len('depth', '깊이', 'Depth', 0.36, 0.3, 0.42),
    P.len('niche', '하부 오픈 높이', 'Bottom niche', 0.25, 0, 0.4),
    P.bool('middleNiche', '중간 오픈칸', 'Middle niche', false),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.mat('front', '문', 'Doors', 'wood-ash', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'none', OPT.handle),
    P.bool('slippers', '슬리퍼', 'Slippers', true),
  ],
  tags: ['shoe cabinet', 'shoe rack', 'entryway', '신발장', '현관 수납장', '신발 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p, t = 0.018;
    const niche = Math.min(p.niche, h - 0.4);
    // full-height sides; the carcass floats over the open niche for slippers
    for (const s of [-1, 1]) k.box('body', p.body, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.002 });
    if (niche > 0.01) k.box('body', p.body, w - 2 * t, 0.02, d - 0.02, 0, 0.01, -0.01, { r: 0.001 });
    const iw = w - 2 * t;
    const nd = Math.max(1, Math.round(iw / 0.45));
    const midH = p.middleNiche && h > 1.4 ? 0.3 : 0;
    const lower = midH ? (h - niche - midH) * 0.4 : h - niche;
    const blocks = midH ? [[niche, lower], [niche + lower + midH, h - niche - lower - midH]] : [[niche, lower]];
    for (const [y0, bh] of blocks) {
      addCabinet(k, { w: iw, h: bh, d, y0, base: 'none', rows: [{ h: 1, n: nd, type: 'door', handleY: y0 === niche && bh < 1.4 ? y0 + bh - 0.12 : y0 + Math.min(bh - 0.1, 1.05 - y0) }], body: p.body, front: p.front, handle: p.handle === 'none' ? 'none' : p.handle, handleMat: 'metal-black' });
      // push-to-open doors: a finger groove at the top edge reads as the 'handle'
      if (p.handle === 'none') for (let i = 0; i < nd; i++) k.box('grooves', 'paint-black-matte', iw / nd - 0.05, 0.004, 0.004, -iw / 2 + (iw / nd) * (i + 0.5), y0 + bh - 0.004, d / 2 + 0.0005, { r: 0 });
    }
    if (midH) {
      const y = niche + lower;
      k.box('body', p.body, iw, 0.02, d - 0.01, 0, y + 0.01, -0.005, { r: 0.001 });
      k.box('body', p.body, iw, 0.02, d - 0.01, 0, y + midH - 0.01, -0.005, { r: 0.001 });
      k.box('body', p.body, iw, midH, 0.012, 0, y + midH / 2, -d / 2 + 0.006, { r: 0 });
    }
    if (p.slippers && niche >= 0.12) {
      for (const s of [-1, 1]) {
        const x = -iw / 2 + 0.12 + s * 0.055;
        k.slab('slippers', 'fabric-linen-grey', roundRect(0.09, 0.26, 0.04), 0.022, 0.02, { x, z: 0.0, bevel: 0.008 });
        k.soft('slippers', 'fabric-linen-grey', 0.095, 0.045, 0.1, 0.03, x, 0.06, -0.06, { flat: 2, puff: 0.006 });
      }
    }
    return k.group();
  },
});

/* -------------------------------------------------------------- coat rack */

const coatRack = item({
  id: 'coat-rack', category: 'storage', ko: '스탠드 옷걸이', en: 'Coat stand', size: [0.36, 1.8, 0.36],
  params: [
    P.len('height', '높이', 'Height', 1.78, 1.5, 1.95),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('hooks', '고리', 'Hooks', 'metal-brass', 'metal'),
  ],
  tags: ['coat rack', 'coat stand', 'hall tree', '옷걸이', '스탠드 옷걸이', '행거'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height;
    k.lathe('frame', p.wood, [[0, 0.1], [0.022, 0.1], [0.018, 0.4], [0.016, h - 0.06], [0.022, h - 0.03], [0.02, h - 0.01], [0, h]], 0, 0, 0, { segs: k.seg(20, 8) });
    k.sphere('frame', p.wood, 0.028, 0, h, 0, { segs: k.seg(16, 6), rings: k.seg(10, 4) });
    // four splayed feet (a tripod would not be bbox-centred)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.rod('frame', p.wood, [Math.cos(a) * 0.23, 0.012, Math.sin(a) * 0.23], [0, 0.42, 0], 0.014, { r2: 0.016, segs: k.seg(12, 5) });
      k.sphere('frame', p.wood, 0.014, Math.cos(a) * 0.23, 0.014, Math.sin(a) * 0.23, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    // six curved hooks with ball ends, two levels
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const y = h - 0.09 - (i % 2) * 0.12;
      k.tube('hooks', p.hooks, [[c * 0.015, y - 0.02, s * 0.015], [c * 0.07, y - 0.005, s * 0.07], [c * 0.11, y + 0.03, s * 0.11], [c * 0.115, y + 0.06, s * 0.115]], 0.006, { radial: k.seg(8, 4), segs: k.seg(16, 6) });
      k.sphere('hooks', p.hooks, 0.011, c * 0.115, y + 0.065, s * 0.115, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
    }
    return k.group();
  },
});

/* ---------------------------------------------------------- built-in closet */

const closet = item({
  id: 'built-in-closet', category: 'storage', ko: '붙박이장', en: 'Built-in closet', size: [2.4, 2.4, 0.6],
  params: [
    P.len('width', '폭', 'Width', 2.4, 0.9, 4.8),
    P.len('height', '높이', 'Height', 2.4, 2.0, 2.8),
    P.len('depth', '깊이', 'Depth', 0.6, 0.45, 0.7),
    P.int('doors', '문 수', 'Doors', 4, 1, 8),
    P.mat('front', '문', 'Doors', 'paint-white-matte', 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
  ],
  tags: ['built-in closet', 'wardrobe wall', 'fitted wardrobe', '붙박이장', '수납장', '드레스룸'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p;
    const doors = Math.max(1, Math.min(p.doors, Math.round(w / 0.35)));
    // ceiling filler strip, door wall, recessed plinth
    const filler = 0.06;
    addCabinet(k, { w, h: h - filler, d, base: 'plinth', plinth: 0.08, rows: [{ h: 1, n: doors, type: 'door', handleY: 1.05 }], body: p.body, front: p.front, handle: p.handle, handleMat: p.handle === 'edge' ? 'metal-aluminium' : 'metal-black' });
    k.box('body', p.body, w, filler - 0.004, d - 0.04, 0, h - filler / 2 + 0.002, -0.02, { r: 0.001 });
    void addHandle;
    return k.group();
  },
});

export const ITEMS = [shelving, cube, shoeCabinet, coatRack, closet];
