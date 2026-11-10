// Kitchen: base / wall / tall cabinets, island, sink run, cooktop, range hood.
// Korean standard heights: counter 850 mm (base 720 + plinth 100 + top 30), wall cabinets from 1450 mm.
import { THREE, Kit, item, P, OPT, addCabinet, roundRect, transformAdded } from './helpers.js';

/**
 * Groups the kit and moves the geometry so the bbox is centred in x/z with min y = 0.
 * Handles and overhangs make the raw parts slightly asymmetric; the CONTRACT wants the origin
 * at the footprint centre, so the footprint (bbox) decides.
 */
export function finish(k, { y = true } = {}) {
  const g = k.group();
  const box = new THREE.Box3().setFromObject(g);
  const dx = -(box.min.x + box.max.x) / 2, dz = -(box.min.z + box.max.z) / 2, dy = y ? -box.min.y : 0;
  for (const c of g.children) {
    if (c.isMesh) { c.geometry.translate(dx, dy, dz); c.geometry.computeBoundingBox(); c.geometry.computeBoundingSphere(); }
    else c.position.add(new THREE.Vector3(dx, dy, dz));
  }
  return g;
}

const FRONT_MATS = 'paint-white-matte';
export const TOP_MATS = 'quartz-white';

/** Fronts layout for one base module. */
function baseRows(kind, w) {
  const n = w > 0.55 ? 2 : 1;
  if (kind === 'drawers') return [{ h: 0.4, n: 1, type: 'drawer' }, { h: 0.32, n: 1, type: 'drawer' }, { h: 0.28, n: 1, type: 'drawer' }];
  if (kind === 'drawerDoor') return [{ h: 0.77, n, type: 'door' }, { h: 0.23, n: 1, type: 'drawer' }];
  return [{ h: 1, n, type: 'door' }];
}

/** One base module (carcass + fronts, no top), body depth d, front at z + d/2. */
export function baseModule(k, { w, h, d, x = 0, z = 0, kind = 'doors', body, front, handle, handleMat = 'metal-steel', plinth = 0.1 }) {
  if (kind === 'sink') {
    // sink module: a fixed false front at the top (no handle) above two doors
    addCabinet(k, { w, h, d, x, z, rows: [{ h: 0.8, n: w > 0.55 ? 2 : 1, type: 'door' }], body, front, handle, handleMat, base: 'plinth', plinth });
    const bodyH = h - plinth;
    const fh = bodyH * 0.2 - 0.003;
    k.box('fronts', front, w - 0.003, fh, 0.019, x, plinth + bodyH * 0.9, z + d / 2 - 0.0095, { r: 0.0025 });
    return;
  }
  const rows = baseRows(kind, w);
  if (handle === 'edge') {
    // vertical edge pulls are 0.3 m long and centred on handleY: keep them inside the door's top edge
    let acc = 0;
    for (const r of rows) { acc += r.h; if (r.type === 'door') r.handleY = plinth + (h - plinth) * acc - Math.min(0.16, (h - plinth) * r.h * 0.3); }
  }
  addCabinet(k, { w, h, d, x, z, rows, body, front, handle, handleMat, base: 'plinth', plinth });
}

const frontsOpt = [['doors', '문', 'Doors'], ['drawers', '서랍 3단', '3 drawers'], ['drawerDoor', '서랍+문', 'Drawer + doors'], ['sink', '싱크(가짜 서랍)', 'Sink (false front)']];

const baseCabinet = item({
  id: 'kitchen-base-cabinet', category: 'kitchen', ko: '하부장', en: 'Base cabinet', size: [0.6, 0.85, 0.6],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.3, 1.2),
    P.len('height', '높이', 'Height', 0.85, 0.75, 0.95),
    P.len('depth', '깊이', 'Depth', 0.6, 0.45, 0.7),
    P.pick('fronts', '구성', 'Fronts', 'drawerDoor', frontsOpt),
    P.mat('front', '도어', 'Fronts', FRONT_MATS, 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.bool('countertop', '상판', 'Countertop', true),
    P.mat('top', '상판 재질', 'Countertop', TOP_MATS, 'stone'),
  ],
  tags: ['base cabinet', 'kitchen cabinet', '하부장', '싱크대', '주방 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const t = p.countertop ? 0.03 : 0;
    baseModule(k, { w: p.width, h: p.height - t, d: p.depth - 0.02, z: -0.01, kind: p.fronts, body: p.body, front: p.front, handle: p.handle });
    if (t) k.box('top', p.top, p.width, t, p.depth, 0, p.height - t / 2, 0, { r: 0.003 });
    return finish(k);
  },
});

const wallCabinet = item({
  id: 'kitchen-wall-cabinet', category: 'kitchen', ko: '상부장', en: 'Wall cabinet', placement: 'wall', elevation: 1.45, size: [0.8, 0.7, 0.35],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.3, 1.2),
    P.len('height', '높이', 'Height', 0.7, 0.35, 1.0),
    P.len('depth', '깊이', 'Depth', 0.35, 0.28, 0.4),
    P.int('doors', '문 수', 'Doors', 2, 1, 2),
    P.bool('glass', '유리문', 'Glass doors', false),
    P.mat('front', '도어', 'Fronts', FRONT_MATS, 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.bool('light', '하부 조명', 'Under-cabinet light', true),
  ],
  tags: ['wall cabinet', 'upper cabinet', '상부장', '주방 상부장', '찬장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // doors open from the bottom edge: handles sit low (eye-level cabinets)
    addCabinet(k, { w: p.width, h: p.height, d: p.depth, rows: [{ h: 1, n: p.doors, type: p.glass ? 'glass' : 'door', handleY: 0.08 }], body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-steel', base: 'none' });
    if (p.glass) {
      // a shelf seen through the glass
      k.box('body', p.body, p.width - 0.04, 0.016, p.depth - 0.06, 0, p.height * 0.5, -0.02, { r: 0.001 });
    }
    if (p.light) {
      k.box('light', 'light-warm', p.width - 0.1, 0.006, 0.02, 0, -0.003, p.depth / 2 - 0.07, { r: 0 });
      k.light(0, -0.01, p.depth / 2 - 0.07, { intensity: 0.4, distance: 1.5, type: 'spot', angle: 1.2 });
    }
    return finish(k);
  },
});

/** Built-in oven front (glass door, handle, control strip) filling w × h, front plane at zf, bottom at y0. */
export function ovenFront(k, w, h, y0, zf) {
  k.box('appliance', 'metal-steel', w - 0.006, h - 0.006, 0.02, 0, y0 + h / 2, zf - 0.01, { r: 0.003 });
  const panelH = 0.085;
  k.box('glass', 'screen-black', w - 0.04, h - panelH - 0.03, 0.006, 0, y0 + (h - panelH) / 2, zf + 0.003, { r: 0.002 });
  k.box('display', 'light-warm', 0.06, 0.018, 0.003, 0, y0 + h - panelH / 2, zf + 0.0015, { r: 0, overrides: { color: '#ffd8a0' } });
  for (const sx of [-1, 1]) k.cyl('knobs', 'metal-chrome', 0.017, 0.019, 0.022, sx * (w * 0.32), y0 + h - panelH / 2, zf, { rx: Math.PI / 2, segs: k.seg(20, 8) });
  // door handle: long round bar on posts
  const hy = y0 + h - panelH - 0.035;
  k.rod('handles', 'metal-chrome', [-w * 0.4, hy, zf + 0.045], [w * 0.4, hy, zf + 0.045], 0.009, { segs: k.seg(14, 6) });
  for (const sx of [-1, 1]) k.rod('handles', 'metal-chrome', [sx * w * 0.36, hy, zf], [sx * w * 0.36, hy, zf + 0.045], 0.007, { segs: k.seg(10, 5) });
}

const tallCabinet = item({
  id: 'kitchen-tall-cabinet', category: 'kitchen', ko: '키큰장', en: 'Tall cabinet', size: [0.6, 2.2, 0.6],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.4, 1.0),
    P.len('height', '높이', 'Height', 2.2, 1.8, 2.5),
    P.len('depth', '깊이', 'Depth', 0.6, 0.45, 0.7),
    P.pick('style', '구성', 'Layout', 'oven', [['pantry', '팬트리', 'Pantry'], ['oven', '빌트인 오븐', 'Built-in oven'], ['fridge', '냉장고장', 'Fridge housing']]),
    P.mat('front', '도어', 'Fronts', FRONT_MATS, 'paint'),
    P.mat('body', '몸체', 'Body', 'wood-white', 'wood'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
  ],
  tags: ['tall cabinet', 'pantry', 'oven housing', 'fridge housing', '키큰장', '팬트리', '오븐장', '냉장고장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p;
    const plinth = 0.1, bodyH = h - plinth;
    const common = { w, h, d, body: p.body, front: p.front, handle: p.handle, handleMat: 'metal-steel', base: 'plinth', plinth };
    if (p.style === 'pantry') {
      addCabinet(k, { ...common, rows: [{ h: 0.6, n: 1, type: 'door', hinge: 'left', handleY: plinth + bodyH * 0.6 - 0.12 }, { h: 0.4, n: 1, type: 'door', hinge: 'left', handleY: plinth + bodyH * 0.6 + 0.12 }] });
    } else if (p.style === 'fridge') {
      addCabinet(k, { ...common, rows: [{ h: 0.42, n: 1, type: 'door', hinge: 'left', handleY: plinth + bodyH * 0.42 - 0.25 }, { h: 0.5, n: 1, type: 'door', hinge: 'left', handleY: plinth + bodyH * 0.42 + 0.25 }, { h: 0.08, n: 1, type: 'door', hinge: 'left', handleY: plinth + bodyH * 0.96 }] });
    } else {
      // drawers below, the oven at counter height, a door above (sizes in metres from the plinth)
      const dr = 0.62, ov = 0.6;
      addCabinet(k, { ...common, rows: [{ h: dr / 2 / bodyH, n: 1, type: 'drawer' }, { h: dr / 2 / bodyH, n: 1, type: 'drawer' }, { h: ov / bodyH, n: 1, type: 'open' }, { h: (bodyH - dr - ov) / bodyH, n: 1, type: 'door', hinge: 'left', handleY: plinth + dr + ov + 0.15 }] });
      ovenFront(k, w, ov, plinth + dr, d / 2 - 0.004);
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------------ island */

const island = item({
  id: 'kitchen-island', category: 'kitchen', ko: '아일랜드 식탁', en: 'Kitchen island', size: [1.8, 0.9, 0.95],
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.0, 3.2),
    P.len('height', '높이', 'Height', 0.9, 0.85, 1.05),
    P.len('overhang', '바 오버행', 'Seating overhang', 0.32, 0, 0.45),
    P.bool('waterfall', '워터폴 상판', 'Waterfall sides', true),
    P.mat('front', '도어', 'Fronts', 'wood-walnut', 'wood'),
    P.mat('top', '상판', 'Countertop', 'marble-white', 'stone'),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
  ],
  tags: ['kitchen island', 'island', 'breakfast bar', '아일랜드', '아일랜드 식탁', '홈바'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, t = 0.03, cabD = 0.6, D = cabD + p.overhang;
    const side = p.waterfall ? 0.03 : 0;
    const cw = w - 2 * side;
    // cabinets face +z (cook side); the overhang for stools is at the back (−z)
    const cz = D / 2 - cabD / 2;
    const n = Math.max(1, Math.round(cw / 0.6));
    const mw = cw / n;
    for (let i = 0; i < n; i++) {
      // edge pulls only suit drawers (a vertical edge pull on a door would overrun its top)
      const kind = p.handle === 'edge' || i % 2 === 0 ? 'drawers' : 'drawerDoor';
      baseModule(k, { w: mw, h: p.height - t, d: cabD, x: -cw / 2 + mw * (i + 0.5), z: cz, kind, body: 'wood-white', front: p.front, handle: p.handle });
    }
    // finished back panel on the seating side
    k.box('fronts', p.front, cw, p.height - t - 0.1, 0.018, 0, 0.1 + (p.height - t - 0.1) / 2, cz - cabD / 2 + 0.009, { r: 0.002 });
    k.box('top', p.top, w, t, D, 0, p.height - t / 2, 0, { r: 0.004 });
    if (p.waterfall) for (const s of [-1, 1]) k.box('top', p.top, side, p.height - t, D, s * (w / 2 - side / 2), (p.height - t) / 2, 0, { r: 0.003 });
    else if (p.overhang > 0.15) {
      // support legs at the overhang corners
      for (const s of [-1, 1]) k.box('legs', 'metal-black', 0.05, p.height - t, 0.05, s * (w / 2 - 0.05), (p.height - t) / 2, -D / 2 + 0.06, { r: 0.004 });
    }
    return finish(k);
  },
});

/* -------------------------------------------------------- sink / faucet */

/** Gooseneck faucet on the deck at (x, y, z): spout points to +z. */
export function addFaucet(k, x, y, z, { reach = 0.2, height = 0.32, mat = 'metal-chrome' } = {}) {
  k.lathe('faucet', mat, [[0, 0], [0.028, 0], [0.028, 0.006], [0.022, 0.012], [0.02, 0.06], [0, 0.06]], x, y, z, { segs: k.seg(24, 8) });
  k.tube('faucet', mat, [[x, y + 0.05, z], [x, y + height * 0.75, z], [x, y + height, z + reach * 0.35], [x, y + height * 0.92, z + reach * 0.85], [x, y + height * 0.7, z + reach]], 0.0115, { radial: k.seg(14, 6), segs: k.seg(40, 10) });
  k.cyl('faucet', mat, 0.014, 0.0125, 0.03, x, y + height * 0.7 - 0.025, z + reach, { segs: k.seg(16, 6) });
  // side lever
  k.rod('faucet', mat, [x + 0.02, y + 0.045, z], [x + 0.075, y + 0.06, z - 0.01], 0.006, { segs: k.seg(10, 5) });
}

/** Undermount stainless basin hanging below a hole (w × d) whose top is at y. */
export function addBasin(k, x, y, z, w, d, depth = 0.2) {
  const t = 0.0015, mat = 'metal-steel';
  k.box('sink', mat, w, t, d, x, y - depth, z, { r: 0 });
  for (const s of [-1, 1]) {
    k.box('sink', mat, t, depth, d, x + s * w / 2, y - depth / 2, z, { r: 0 });
    k.box('sink', mat, w, depth, t, x, y - depth / 2, z + s * d / 2, { r: 0 });
  }
  k.cyl('sink', 'metal-chrome', 0.045, 0.045, 0.004, x, y - depth + 0.001, z, { segs: k.seg(24, 8) });
}

const sinkRun = item({
  id: 'kitchen-sink-counter', category: 'kitchen', ko: '싱크대(개수대 포함)', en: 'Sink counter run', size: [1.8, 1.17, 0.6],
  params: [
    P.len('width', '폭', 'Width', 1.8, 0.9, 4.0),
    P.pick('sinkAt', '개수대 위치', 'Sink position', 'center', [['left', '왼쪽', 'Left'], ['center', '가운데', 'Centre'], ['right', '오른쪽', 'Right']]),
    P.len('sinkWidth', '개수대 폭', 'Sink width', 0.76, 0.45, 1.0),
    P.mat('front', '도어', 'Fronts', FRONT_MATS, 'paint'),
    P.mat('top', '상판', 'Countertop', TOP_MATS, 'stone'),
    P.pick('handle', '손잡이', 'Handles', 'bar', OPT.handle),
    P.bool('backsplash', '뒷턱', 'Upstand', true),
  ],
  tags: ['sink', 'kitchen sink', 'countertop', 'faucet', '싱크대', '개수대', '수전', '주방 상판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = 0.85, t = 0.03, d = 0.6;
    const n = Math.max(1, Math.round(w / 0.6));
    const mw = w / n;
    const si = p.sinkAt === 'left' ? 0 : p.sinkAt === 'right' ? n - 1 : Math.floor((n - 1) / 2);
    // the sink module may be wider than one module when the sink needs it
    const sinkX = -w / 2 + mw * (si + 0.5);
    for (let i = 0; i < n; i++) {
      const kind = i === si ? 'sink' : (i % 2 ? 'drawers' : 'doors');
      baseModule(k, { w: mw, h: h - t, d: d - 0.02, x: -w / 2 + mw * (i + 0.5), z: -0.01, kind, body: 'wood-white', front: p.front, handle: p.handle });
    }
    // countertop with a real cut-out
    const sw = Math.min(p.sinkWidth, w - 0.1), sd = 0.42, sz = 0.02;
    const shape = roundRect(w, d, 0.002);
    const hole = roundRect(sw, sd, 0.03);
    shape.holes.push(new THREE.Path(hole.getPoints(8).reverse().map((v) => new THREE.Vector2(v.x + clampX(sinkX, sw, w), v.y + sz))));
    k.slab('top', p.top, shape, t, h - t, { bevel: 0.003, curveSegs: 6 });
    const bx = clampX(sinkX, sw, w);
    addBasin(k, bx, h - t, sz, sw - 0.01, sd - 0.01);
    addFaucet(k, bx, h, -d / 2 + 0.07, { reach: 0.21 });
    if (p.backsplash) k.box('top', p.top, w, 0.05, 0.015, 0, h + 0.025, -d / 2 + 0.0075, { r: 0.002 });
    return finish(k);
  },
});
const clampX = (x, sw, w) => Math.max(-w / 2 + sw / 2 + 0.05, Math.min(w / 2 - sw / 2 - 0.05, x));

/* ---------------------------------------------------------------- cooktop */

const cooktop = item({
  id: 'cooktop', category: 'kitchen', ko: '쿡탑(인덕션·가스)', en: 'Cooktop', placement: 'surface', size: [0.6, 0.012, 0.52],
  params: [
    P.pick('type', '종류', 'Type', 'induction', [['induction', '인덕션', 'Induction'], ['gas', '가스레인지', 'Gas']]),
    P.len('width', '폭', 'Width', 0.6, 0.3, 0.9),
    P.int('zones', '화구 수', 'Zones', 3, 1, 5),
  ],
  tags: ['cooktop', 'hob', 'induction', 'gas stove', '쿡탑', '인덕션', '가스레인지', '하이라이트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.52;
    const n = Math.min(p.zones, w < 0.45 ? 2 : 5);
    // zone layout: 1 = centre, 2 = left/right, 3 = two left + big right, 4 = 2×2, 5 = 2×2 + centre
    const spots = [[[0, 0, 0.11]], [[-0.25, 0, 0.1], [0.25, 0, 0.1]], [[-0.27, -0.2, 0.08], [-0.27, 0.2, 0.08], [0.22, 0, 0.12]], [[-0.25, -0.2, 0.08], [-0.25, 0.2, 0.09], [0.25, -0.2, 0.09], [0.25, 0.2, 0.08]], [[-0.3, -0.2, 0.08], [-0.3, 0.2, 0.08], [0.3, -0.2, 0.08], [0.3, 0.2, 0.08], [0, 0, 0.1]]][n - 1];
    const ux = w / 2, uz = d / 2 * 0.95;
    if (p.type === 'induction') {
      k.slab('glass', 'screen-black', roundRect(w, d, 0.006), 0.008, 0, { bevel: 0.002, curveSegs: 4 });
      for (const [sx, sz, r] of spots) {
        k.add('marks', 'paint-grey-matte', new THREE.TorusGeometry(Math.min(r, ux * 0.45), 0.0012, 3, k.seg(48, 16)).rotateX(Math.PI / 2).translate(sx * ux * 1.6, 0.0085, sz * uz * 1.6));
      }
      k.box('marks', 'paint-grey-matte', w * 0.4, 0.0005, 0.02, 0, 0.0083, d / 2 - 0.035, { r: 0 });
    } else {
      k.slab('appliance', 'metal-steel', roundRect(w, d, 0.01), 0.012, 0, { bevel: 0.003, curveSegs: 4 });
      for (const [sx, sz, r] of spots) {
        const x = sx * ux * 1.6, z = sz * uz * 1.6, rr = Math.min(r * 0.6, 0.06);
        k.lathe('burners', 'metal-black', [[0, 0], [rr * 1.15, 0], [rr * 1.1, 0.012], [rr, 0.018], [rr * 0.95, 0.024], [0, 0.024]], x, 0.012, z, { segs: k.seg(24, 8) });
        k.cyl('burners', 'metal-black', rr * 0.55, rr * 0.6, 0.006, x, 0.036, z, { segs: k.seg(20, 8) });
        // cast-iron grate: a ring + four arms
        k.add('grates', 'metal-black', new THREE.TorusGeometry(rr * 1.8, 0.004, 4, k.seg(24, 8)).rotateX(Math.PI / 2).translate(x, 0.045, z));
        for (let a = 0; a < 4; a++) {
          const c = Math.cos(a * Math.PI / 2 + Math.PI / 4), s = Math.sin(a * Math.PI / 2 + Math.PI / 4);
          k.rod('grates', 'metal-black', [x + c * rr * 0.9, 0.045, z + s * rr * 0.9], [x + c * rr * 2.1, 0.045, z + s * rr * 2.1], 0.004, { segs: 5 });
          k.rod('grates', 'metal-black', [x + c * rr * 2.1, 0.012, z + s * rr * 2.1], [x + c * rr * 2.1, 0.045, z + s * rr * 2.1], 0.004, { segs: 5 });
        }
      }
      for (let i = 0; i < n; i++) k.cyl('knobs', 'plastic-black', 0.016, 0.018, 0.02, -w * 0.35 + (w * 0.7 / Math.max(1, n - 1)) * (n === 1 ? 0.5 : i), 0.012, d / 2 - 0.035, { segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

/* -------------------------------------------------------------- range hood */

const hood = item({
  id: 'range-hood', category: 'kitchen', ko: '레인지 후드', en: 'Range hood', placement: 'wall', elevation: 1.55, size: [0.9, 0.9, 0.5],
  params: [
    P.pick('style', '형태', 'Style', 'chimney', [['chimney', '침니형', 'Chimney'], ['slim', '슬림형', 'Slim (under cabinet)']]),
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.2),
    P.len('chimney', '덕트 높이', 'Chimney height', 0.62, 0.2, 1.2),
    P.mat('body', '재질', 'Finish', 'metal-steel', 'metal'),
  ],
  tags: ['range hood', 'cooker hood', 'extractor', '후드', '레인지후드', '환풍기'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width;
    if (p.style === 'slim') {
      const d = 0.5;
      k.box('body', p.body, w, 0.16, d - 0.03, 0, 0.08, -0.015, { r: 0.004 });
      k.box('body', 'glass-tinted', w - 0.004, 0.03, 0.06, 0, 0.02, d / 2 - 0.03, { r: 0.003 });
      k.box('filter', 'metal-aluminium', w - 0.06, 0.002, d - 0.12, 0, 0.0, -0.03, { r: 0 });
      k.light(0, -0.01, 0, { intensity: 0.4, distance: 1.5, type: 'spot', angle: 1 });
      return finish(k);
    }
    const d = 0.5, chimD = 0.25, chimW = 0.28, ch = 0.28;
    // canopy side profile (world z, y) extruded across the width
    const prof = [[-d / 2, 0], [d / 2, 0], [d / 2, 0.06], [-d / 2 + chimD + 0.01, ch], [-d / 2, ch]];
    const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelOffset: -0.002, bevelSegments: k.hi ? 2 : 1 });
    geo.translate(0, 0, -(w - 0.004) / 2 + 0.002);
    geo.rotateY(Math.PI / 2);
    k.add('body', p.body, geo);
    k.box('body', p.body, chimW, p.chimney, chimD, 0, ch + p.chimney / 2, -d / 2 + chimD / 2, { r: 0.002 });
    k.box('filter', 'metal-aluminium', w - 0.06, 0.002, d - 0.08, 0, -0.0005, 0, { r: 0 });
    k.box('controls', 'screen-black', 0.12, 0.012, 0.004, 0, 0.03, d / 2 + 0.002, { r: 0 });
    for (const s of [-1, 1]) k.cyl('light', 'light-warm', 0.025, 0.025, 0.003, s * w * 0.28, -0.003, d * 0.18, { segs: k.seg(16, 6) });
    k.light(0, -0.02, d * 0.18, { intensity: 0.5, distance: 1.5, type: 'spot', angle: 1 });
    return finish(k);
  },
});

void transformAdded;
export const ITEMS = [baseCabinet, wallCabinet, tallCabinet, island, sinkRun, cooktop, hood];
