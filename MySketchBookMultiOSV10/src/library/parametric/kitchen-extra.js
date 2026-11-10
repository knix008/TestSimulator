// Further kitchen designs: waterfall island with seating overhang, peninsula counter, appliance
// garage, coffee-station cabinet, open base shelving, compact studio kitchenette, oven tower,
// wall-mounted drop-leaf breakfast bar, lift-up flap wall cabinet, rice dispenser cabinet,
// glass-front pantry. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, OPT, addCabinet, addHandle, transformAdded, roundRect } from './helpers.js';
import { finish, baseModule, ovenFront, addFaucet, addBasin, TOP_MATS } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const kit = (def) => mk({ category: 'kitchen', ...def, build: (p, ctx) => { const k = new Kit(ctx); def.make(k, p); return finish(k); } });
const pFront = (def = 'paint-white-matte') => P.mat('front', '도어', 'Fronts', def, 'paint');
const pBody = (def = 'wood-white') => P.mat('body', '몸체', 'Body', def, 'wood');
const pTop = (def = TOP_MATS) => P.mat('top', '상판', 'Countertop', def, 'stone');
const pHandle = (def = 'bar') => P.pick('handle', '손잡이', 'Handles', def, OPT.handle);

/** Bottles / jars standing in a row from x0 to x1 at height y (small props). */
function jars(k, x0, x1, y, z, n = 4) {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n, h = 0.12 + (i % 2) * 0.05;
    k.cyl('props', 'glass-clear', 0.035, 0.035, h, x, y, z, { segs: k.seg(14, 6) });
    k.cyl('lids', 'wood-oak', 0.037, 0.037, 0.02, x, y + h, z, { segs: k.seg(14, 6) });
  }
}

const waterfall = kit({
  id: 'kitchen-island-waterfall', ko: '폭포형 아일랜드 (좌석 오버행)', en: 'Waterfall island with seating overhang',
  params: [P.len('width', '폭', 'Width', 2.4, 1.6, 3.2), P.len('depth', '깊이', 'Depth', 1.0, 0.85, 1.2), pFront('paint-grey-matte'), pBody(), pTop('marble-white'), pHandle('edge')],
  tags: ['island', 'waterfall island', 'kitchen island', '아일랜드', '폭포형 아일랜드', '대리석 아일랜드', '홈바'],
  make: (k, p) => {
    const w = p.width, d = p.depth, h = 0.9, t = 0.04, cd = 0.6, over = d - cd;
    const n = Math.max(2, Math.round((w - 2 * t) / 0.6)), mw = (w - 2 * t) / n;
    for (let i = 0; i < n; i++) baseModule(k, { w: mw, h: h - t, d: cd - 0.02, x: -w / 2 + t + mw * (i + 0.5), z: -d / 2 + cd / 2 - 0.01, kind: i % 2 ? 'doors' : 'drawers', body: p.body, front: p.front, handle: p.handle });
    k.box('top', p.top, w, t, d, 0, h - t / 2, 0, { r: 0.004 });
    for (const s of [-1, 1]) k.box('top', p.top, t, h - t, d, s * (w / 2 - t / 2), (h - t) / 2, 0, { r: 0.004 });
    // back panel of the seating side
    k.box('body', p.front, w - 2 * t, h - t - 0.1, 0.02, 0, 0.1 + (h - t - 0.1) / 2, -d / 2 + cd + 0.01, { r: 0.002 });
    void over;
  },
});

const peninsula = kit({
  id: 'kitchen-peninsula', ko: '반도형 카운터 (ㄱ자 연결)', en: 'Peninsula counter',
  params: [P.len('length', '길이', 'Length', 1.8, 1.2, 2.6), pFront(), pBody(), pTop('quartz-white'), pHandle('bar'), P.bool('bar', '바 상판', 'Raised bar top', true)],
  tags: ['peninsula', 'kitchen peninsula', 'breakfast bar', '반도형 주방', '반도 카운터', '아일랜드 대체'],
  make: (k, p) => {
    // runs along z from the wall (−z) into the room; cabinets face +x
    const L = p.length, d = 0.6, h = 0.9, t = 0.03;
    const n = Math.max(2, Math.round(L / 0.6)), mw = L / n;
    for (let i = 0; i < n; i++) transformAdded(k, () => baseModule(k, { w: mw - 0.002, h: h - t, d: d - 0.02, z: -0.01, kind: i === 0 ? 'drawers' : 'doors', body: p.body, front: p.front, handle: p.handle }), 0, 0, -L / 2 + mw * (i + 0.5), PI / 2);
    k.box('top', p.top, d + 0.3, t, L + 0.02, 0.15, h - t / 2, 0, { r: 0.003 });
    // finished back panel; the bar top overhangs on that side for stools
    k.box('body', p.front, 0.02, h - t, L, -d / 2 - 0.01, (h - t) / 2, 0, { r: 0.002 });
    if (p.bar) {
      k.box('top', p.top, 0.35, t, L + 0.02, -d / 2 - 0.15, 1.08 - t / 2, 0, { r: 0.003 });
      k.box('body', p.front, 0.04, 1.08 - h, L, -d / 2 - 0.02, h + (1.08 - h) / 2 - t / 2, 0, { r: 0.002 });
    }
  },
});

const garage = kit({
  id: 'kitchen-appliance-garage', placement: 'surface', ko: '가전 수납장 (롤업 도어)', en: 'Appliance garage with roll-up door',
  params: [P.len('width', '폭', 'Width', 0.8, 0.5, 1.2), P.len('height', '높이', 'Height', 0.5, 0.4, 0.7), pBody('wood-oak'), P.num('open', '열림 정도', 'Open ratio', 0.4, 0, 1, 0.05)],
  tags: ['appliance garage', 'tambour door', 'countertop cabinet', '가전 수납장', '롤업 도어', '셔터 수납장', '조리대 수납'],
  make: (k, p) => {
    const w = p.width, h = p.height, d = 0.36, t = 0.018;
    for (const s of [-1, 1]) k.box('body', p.body, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.002 });
    k.box('body', p.body, w, t, d, 0, h - t / 2, 0, { r: 0.002 });
    k.box('body', p.body, w - 2 * t, h - t, 0.01, 0, (h - t) / 2, -d / 2 + 0.005, { r: 0 });
    // tambour slats: open ratio rolls them up into the top
    const shown = (h - t) * (1 - p.open), n = Math.max(1, Math.round(shown / 0.025));
    for (let i = 0; i < n; i++) k.box('fronts', p.body, w - 2 * t - 0.004, 0.022, 0.012, 0, h - t - shown + 0.0125 + (shown / n) * i, d / 2 - 0.01, { r: 0.004 });
    if (shown > 0.03) k.box('handles', 'metal-black', w * 0.3, 0.012, 0.02, 0, h - t - shown + 0.02, d / 2 + 0.004, { r: 0.004 });
    // a toaster and a kettle inside
    k.box('props', 'metal-steel', 0.26, 0.18, 0.15, -w / 4, 0.09, 0, { r: 0.03 });
    k.cyl('props', 'plastic-white', 0.08, 0.09, 0.22, w / 4, 0, 0, { segs: k.seg(18, 8) });
  },
});

const coffee = kit({
  id: 'kitchen-coffee-station', ko: '커피 스테이션 키큰장', en: 'Coffee-station tall cabinet',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.2), pFront('wood-walnut'), pBody(), pTop('quartz-white'), pHandle('edge')],
  tags: ['coffee station', 'coffee bar', 'tall cabinet', '커피 스테이션', '커피 바', '홈카페', '키큰장'],
  make: (k, p) => {
    const w = p.width, d = 0.6, H = 2.2;
    addCabinet(k, { w, h: 0.88, d, rows: [{ h: 0.25, n: 1, type: 'drawer' }, { h: 0.75, n: 2, type: 'door' }].reverse(), body: p.body, front: p.front, handle: p.handle, base: 'plinth', plinth: 0.1 });
    k.box('top', p.top, w, 0.025, d, 0, 0.9 - 0.0125 + 0.0, 0, { r: 0.003 });
    // open niche with a back panel + shelf, upper doors
    const ny = 0.9, nh = 0.55;
    for (const s of [-1, 1]) k.box('body', p.body, 0.018, nh, d - 0.02, s * (w / 2 - 0.009), ny + nh / 2, -0.01, { r: 0.002 });
    k.box('body', p.front, w - 0.036, nh, 0.012, 0, ny + nh / 2, -d / 2 + 0.006, { r: 0 });
    k.box('body', p.body, w - 0.036, 0.02, 0.24, 0, ny + 0.36, -d / 2 + 0.12, { r: 0.002 });
    transformAdded(k, () => addCabinet(k, { w, h: H - ny - nh, d, rows: [{ h: 1, n: 2, type: 'door', handleY: 0.12 }], body: p.body, front: p.front, handle: p.handle, base: 'none' }), 0, ny + nh, 0);
    // espresso machine and mugs
    k.box('props', 'metal-steel', 0.3, 0.32, 0.32, -w * 0.15, ny + 0.16, -0.08, { r: 0.02 });
    k.box('props', 'plastic-black', 0.08, 0.02, 0.1, -w * 0.15, ny + 0.12, 0.1, { r: 0.004 });
    for (let i = 0; i < 3; i++) k.cyl('mugs', 'ceramic-white', 0.04, 0.035, 0.09, w * 0.1 + i * 0.1, ny + 0.37, -d / 2 + 0.12, { segs: k.seg(14, 6) });
  },
});

const openBase = kit({
  id: 'kitchen-open-base-shelving', ko: '오픈 하부 선반장', en: 'Open base shelving unit',
  params: [P.len('width', '폭', 'Width', 0.9, 0.4, 1.2), pBody('wood-oak'), pTop('wood-oak'), P.int('shelves', '선반 수', 'Shelves', 1, 0, 2)],
  tags: ['open shelving', 'base shelf', 'kitchen shelf', '오픈 선반', '하부 선반', '주방 오픈장'],
  make: (k, p) => {
    const w = p.width, d = 0.58, h = 0.88, t = 0.02;
    for (const s of [-1, 1]) k.box('body', p.body, t, h - 0.03, d, s * (w / 2 - t / 2), (h - 0.03) / 2, 0, { r: 0.002 });
    k.box('body', p.body, w - 2 * t, 0.1, d - 0.05, 0, 0.05, -0.025, { r: 0.002 });
    k.box('body', p.body, w - 2 * t, t, d, 0, 0.1 + t / 2, 0, { r: 0.002 });
    const n = p.shelves, gap = (h - 0.03 - 0.12) / (n + 1);
    for (let i = 1; i <= n; i++) k.box('body', p.body, w - 2 * t, t, d - 0.02, 0, 0.12 + gap * i, -0.01, { r: 0.002 });
    k.box('top', p.top, w, 0.03, d + 0.02, 0, h - 0.015, 0.01, { r: 0.003 });
    // baskets on the bottom shelf
    for (const s of [-1, 1]) k.box('props', 'rattan', w / 2 - 0.06, 0.2, d - 0.12, s * w / 4, 0.22, -0.02, { r: 0.02 });
  },
});

const kitchenette = kit({
  id: 'kitchen-compact-kitchenette', ko: '원룸 미니 주방 (싱크+2구+냉장고)', en: 'Compact studio kitchenette',
  params: [P.len('width', '폭', 'Width', 1.2, 1.0, 1.6), pFront(), pBody(), pTop('metal-steel'), pHandle('bar')],
  tags: ['kitchenette', 'compact kitchen', 'mini kitchen', '미니 주방', '원룸 주방', '간이 주방', '오피스텔'],
  make: (k, p) => {
    const w = p.width, d = 0.6, h = 0.88, t = 0.03, fw = 0.55;
    // under-counter fridge on the left, sink cabinet on the right
    k.box('appliance', 'paint-white-gloss', fw - 0.01, h - t - 0.02, d - 0.04, -w / 2 + fw / 2, (h - t - 0.02) / 2 + 0.01, -0.01, { r: 0.006 });
    k.box('handles', 'metal-steel', 0.012, 0.3, 0.02, -w / 2 + fw - 0.06, h - t - 0.22, d / 2 - 0.02, { r: 0.004 });
    baseModule(k, { w: w - fw, h: h - t, d: d - 0.02, x: fw / 2, z: -0.01, kind: 'sink', body: p.body, front: p.front, handle: p.handle });
    const bw = Math.min(0.42, w - fw - 0.12), bx = w / 2 - (w - fw) / 2;
    const top = roundRect(w, d, 0.003), hole = new THREE.Path();
    hole.moveTo(bx - bw / 2, -0.18); hole.lineTo(bx - bw / 2, 0.18); hole.lineTo(bx + bw / 2, 0.18); hole.lineTo(bx + bw / 2, -0.18); hole.closePath();
    top.holes.push(hole);
    k.slab('top', p.top, top, t, h - t, { bevel: 0.002 });
    addBasin(k, bx, h - t, 0.0, bw, 0.36, 0.16);
    addFaucet(k, w / 2 - (w - fw) / 2, h, -d / 2 + 0.07, { reach: 0.18, height: 0.28 });
    // two induction zones on the fridge side
    k.box('appliance', 'screen-black', 0.3, 0.006, 0.5, -w / 2 + fw / 2, h + 0.003, 0, { r: 0.002 });
    for (const z of [-0.12, 0.12]) k.cyl('trim', 'metal-aluminium', 0.08, 0.08, 0.0015, -w / 2 + fw / 2, h + 0.006, z, { segs: k.seg(24, 10), open: true });
  },
});

const ovenTower = kit({
  id: 'kitchen-oven-tower', ko: '빌트인 오븐 키큰장 (오븐+전자레인지)', en: 'Oven tower (oven + microwave)',
  params: [P.len('height', '높이', 'Height', 2.2, 2.0, 2.4), pFront('paint-white-matte'), pBody(), pHandle('bar')],
  tags: ['oven tower', 'built-in oven', 'tall housing', '오븐장', '빌트인 오븐', '키큰장', '전자레인지장'],
  make: (k, p) => {
    const w = 0.6, d = 0.6, H = p.height, plinth = 0.1;
    // drawers below, oven + microwave in the middle, door above
    addCabinet(k, { w, h: 0.72, d, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.5, n: 1, type: 'drawer' }], body: p.body, front: p.front, handle: p.handle, base: 'plinth', plinth });
    const zf = d / 2;
    k.box('body', p.body, w, 1.0, d - 0.02, 0, 0.72 + 0.5, -0.01, { r: 0.002 });
    ovenFront(k, w - 0.01, 0.6, 0.72, zf);
    ovenFront(k, w - 0.01, 0.38, 1.33, zf);
    transformAdded(k, () => addCabinet(k, { w, h: H - 1.72, d, rows: [{ h: 1, n: 1, type: 'door', handleY: 0.1 }], body: p.body, front: p.front, handle: p.handle, base: 'none' }), 0, 1.72, 0);
  },
});

const dropLeaf = kit({
  id: 'kitchen-wall-drop-leaf-bar', placement: 'wall', elevation: 0.55, ko: '벽 부착 접이식 바 테이블', en: 'Wall-mounted drop-leaf breakfast bar',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.4), P.mat('wood', '나무', 'Wood', 'wood-oak', 'wood'), P.bool('open', '펼침', 'Leaf up', true)],
  tags: ['drop leaf table', 'wall table', 'folding bar', '접이식 테이블', '벽 테이블', '원룸 식탁', '바 테이블'],
  make: (k, p) => {
    const w = p.width, leaf = 0.45, y = 0.5;
    k.box('frame', p.wood, w, 0.08, 0.03, 0, y - 0.04, -leaf / 2, { r: 0.003 });
    if (p.open) {
      k.box('top', p.wood, w, 0.025, leaf, 0, y - 0.0125, 0, { r: 0.003 });
      for (const s of [-1, 1]) k.box('frame', 'metal-black', 0.02, 0.3, 0.02, s * (w / 2 - 0.08), y - 0.2, -leaf / 2 + 0.12, { r: 0.002, rx: 0.7 });
      // a small shelf panel and cups
      k.cyl('props', 'ceramic-white', 0.04, 0.035, 0.09, -w / 4, y, 0.05, { segs: k.seg(14, 6) });
    } else {
      k.box('top', p.wood, w, leaf, 0.025, 0, y - 0.08 - leaf / 2, -leaf / 2 + 0.03, { r: 0.003 });
    }
  },
});

const flap = kit({
  id: 'kitchen-wall-cabinet-flap', placement: 'wall', elevation: 1.5, ko: '플랩 도어 상부장 (위로 열림)', en: 'Lift-up flap wall cabinet',
  params: [P.len('width', '폭', 'Width', 0.9, 0.6, 1.2), P.len('height', '높이', 'Height', 0.4, 0.3, 0.6), pFront('paint-grey-matte'), pBody(), P.num('open', '열림(°)', 'Open (°)', 70, 0, 100, 5)],
  tags: ['flap cabinet', 'lift up door', 'wall cabinet', '플랩장', '위로 열리는 상부장', '상부장'],
  make: (k, p) => {
    const w = p.width, h = p.height, d = 0.35, a = (p.open * PI) / 180;
    addCabinet(k, { w, h, d: d - 0.02, z: -0.01, rows: [{ h: 1, n: 1, type: 'open' }], body: p.body, front: p.body, base: 'none' });
    // shelf + plates inside
    k.box('body', p.body, w - 0.04, 0.016, d - 0.06, 0, h * 0.5, -0.02, { r: 0.001 });
    for (let i = 0; i < 5; i++) k.cyl('props', 'ceramic-white', 0.11, 0.1, 0.012, -w / 4, 0.02 + i * 0.013, -0.02, { segs: k.seg(20, 8) });
    // flap hinged along the top front edge
    transformAdded(k, () => {
      const g = k.box('fronts', p.front, w - 0.004, h - 0.004, 0.019, 0, -(h - 0.004) / 2, 0.0095, { r: 0.002 });
      g.rotateX(-a);
      addHandle(k, 'handles', 'metal-black', 'edge', 0, -h * Math.cos(a) + 0.01, h * Math.sin(a) + 0.02, { len: w * 0.5 });
    }, 0, h, d / 2 - 0.01);
  },
});

const rice = kit({
  id: 'kitchen-rice-dispenser', ko: '계량 쌀통 수납장', en: 'Rice dispenser cabinet',
  params: [P.len('width', '폭', 'Width', 0.3, 0.25, 0.45), pFront('paint-white-matte'), pBody()],
  tags: ['rice dispenser', 'rice bin', 'pull out', '쌀통', '계량 쌀통', '쌀 수납'],
  make: (k, p) => {
    const w = p.width, d = 0.55, h = 0.82;
    addCabinet(k, { w, h, d, rows: [{ h: 0.86, n: 1, type: 'door' }, { h: 0.14, n: 1, type: 'drawer' }], body: p.body, front: p.front, handle: 'bar', handleMat: 'metal-steel', base: 'plinth', plinth: 0.08 });
    // dispenser button + window on the front
    k.box('glass', 'glass-tinted', w * 0.5, 0.18, 0.004, 0, 0.5, d / 2 + 0.002, { r: 0.002 });
    k.cyl('trim', 'plastic-grey', 0.025, 0.025, 0.02, 0, 0.27, d / 2, { rx: PI / 2, segs: k.seg(16, 6) });
    k.box('trim', 'plastic-grey', w * 0.4, 0.05, 0.06, 0, 0.13, d / 2 + 0.03, { r: 0.008 });
  },
});

const pantryGlass = kit({
  id: 'kitchen-pantry-glass', ko: '유리문 팬트리장', en: 'Glass-front pantry cabinet',
  params: [P.len('width', '폭', 'Width', 1.0, 0.6, 1.4), P.len('height', '높이', 'Height', 2.1, 1.8, 2.4), pFront('paint-green-matte'), pBody(), pHandle('knob')],
  tags: ['pantry', 'glass cabinet', 'larder', '팬트리', '유리 수납장', '식료품 수납'],
  make: (k, p) => {
    const w = p.width, H = p.height, d = 0.45;
    addCabinet(k, { w, h: H, d, rows: [{ h: 0.4, n: 2, type: 'door' }, { h: 0.6, n: 2, type: 'glass' }], body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-brass', base: 'plinth', plinth: 0.08 });
    const y0 = 0.08 + (H - 0.08) * 0.4;
    for (const f of [0.33, 0.66]) {
      const y = y0 + (H - y0) * f;
      k.box('body', p.body, w - 0.04, 0.016, d - 0.08, 0, y, -0.03, { r: 0.001 });
      jars(k, -w / 2 + 0.08, w / 2 - 0.08, y + 0.008, -0.04, 5);
    }
    jars(k, -w / 2 + 0.08, w / 2 - 0.08, y0 + 0.01, -0.04, 4);
  },
});

export const ITEMS = [waterfall, peninsula, garage, coffee, openBase, kitchenette, ovenTower, dropLeaf, flap, rice, pantryGlass];
