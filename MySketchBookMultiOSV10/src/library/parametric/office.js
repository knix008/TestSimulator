// Study & office: desks, office chair, bookcase, filing cabinet, monitor, laptop, keyboard.
import { THREE, Kit, item, P, OPT, boxUV, addCabinet, addLegs, roundRect, shellGeo } from './helpers.js';
import { addBooks } from './living.js';

/* ------------------------------------------------------- local helpers */

/** Applies matrix m to every geometry added while fn runs (sub-assemblies such as a laptop lid). */
export function withMatrix(k, fn, m) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  const lights = k.lights.length;
  fn(k);
  for (const [key, p] of k.parts) {
    for (let i = before.get(key) ?? 0; i < p.geos.length; i++) { p.geos[i].applyMatrix4(m); boxUV(p.geos[i]); }
  }
  for (let i = lights; i < k.lights.length; i++) {
    const v = new THREE.Vector3(k.lights[i].x, k.lights[i].y, k.lights[i].z).applyMatrix4(m);
    Object.assign(k.lights[i], { x: v.x, y: v.y, z: v.z });
  }
}

/** Bounding box of everything in the kit so far. */
export function kitBox(k) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  for (const p of k.parts.values()) for (const g of p.geos) { b.setFromBufferAttribute(g.attributes.position); box.union(b); }
  return box;
}

/**
 * Moves everything so the footprint is centred in x / z and the bottom sits on y = 0
 * (asymmetric items such as L-desks keep the CONTRACT origin = bottom centre of the bbox).
 */
export function centreKit(k, { x = true, y = true, z = true } = {}) {
  const box = kitBox(k);
  const t = new THREE.Vector3(x ? -(box.min.x + box.max.x) / 2 : 0, y ? -box.min.y : 0, z ? -(box.min.z + box.max.z) / 2 : 0);
  const m = new THREE.Matrix4().makeTranslation(t.x, t.y, t.z);
  for (const p of k.parts.values()) for (const g of p.geos) { g.applyMatrix4(m); boxUV(g); }
  for (const l of k.lights) { l.x += t.x; l.y += t.y; l.z += t.z; }
  return t;
}

/** Plan polygon (points [x, z]) as a THREE.Shape for Kit.slab (shape y = plan z). */
export const planShape = (pts) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));

/* ---------------------------------------------------------------- desks */

const FRAMES = [['metal', '금속 프레임', 'Metal frame'], ['wood', '원목 다리', 'Wood legs'], ['panel', '판재 옆판', 'Panel sides']];

/** Desk frame under a w × d top whose underside is at y = h. */
function deskFrame(k, style, w, d, h, wood, metal, { x = 0, z = 0, skipSide = 0 } = {}) {
  if (style === 'metal') {
    for (const s of [-1, 1]) {
      if (s === skipSide) continue;
      const lx = x + s * (w / 2 - 0.05);
      for (const zz of [-1, 1]) k.box('frame', metal, 0.04, h - 0.02, 0.04, lx, (h - 0.02) / 2 + 0.02, z + zz * (d / 2 - 0.07), { r: 0.004, segs: 2 });
      k.box('frame', metal, 0.04, 0.02, d - 0.06, lx, 0.01, z, { r: 0.004, segs: 2 }); // foot bar
      k.box('frame', metal, 0.04, 0.03, d - 0.1, lx, h - 0.015, z, { r: 0.004, segs: 2 }); // top bar
    }
    k.box('frame', metal, w - 0.14, 0.05, 0.02, x, h - 0.04, z - d / 2 + 0.08, { r: 0.004, segs: 2 }); // back rail
  } else if (style === 'wood') {
    addLegsLocal(k, wood, w, d, h, x, z, skipSide);
    k.box('frame', wood, w - 0.12, 0.07, 0.02, x, h - 0.035, z - d / 2 + 0.05, { r: 0.003 });
    for (const s of [-1, 1]) if (s !== skipSide) k.box('frame', wood, 0.02, 0.07, d - 0.12, x + s * (w / 2 - 0.06), h - 0.035, z, { r: 0.003 });
  } else {
    for (const s of [-1, 1]) if (s !== skipSide) k.box('frame', wood, 0.025, h, d, x + s * (w / 2 - 0.0125), h / 2, z, { r: 0.003 });
    k.box('frame', wood, w - 0.05, h * 0.45, 0.018, x, h - h * 0.225 - 0.01, z - d / 2 + 0.06, { r: 0.002 }); // modesty panel
  }
}

function addLegsLocal(k, wood, w, d, h, x, z, skipSide) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  addLegs(k, 'frame', wood, 'tapered', w, d, h, { inset: 0.05, r: 0.022, splay: 0.015 });
  for (const [key, p] of k.parts) {
    const from = before.get(key) ?? 0;
    const added = p.geos.splice(from);
    for (const g of added) {
      g.computeBoundingBox();
      const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2;
      if (skipSide && Math.sign(cx) === skipSide) continue;
      g.translate(x, 0, z);
      boxUV(g);
      p.geos.push(g);
    }
  }
}

/** Hanging drawer pedestal under a desk top (top underside at y = h). */
function deskPedestal(k, px, d, h, body, front, handle, n = 2) {
  const ph = n === 3 ? 0.55 : 0.3;
  const rows = Array.from({ length: n }, () => ({ h: 1 / n, n: 1, type: 'drawer' }));
  const save = { body: 'frame', front: 'fronts', handle: 'handles' };
  addCabinet(k, { w: 0.4, h: ph, d: d - 0.1, x: px, z: -0.02, y0: h - ph, rows, body, front, base: 'none', handle, handleMat: 'metal-black', roles: save });
}

const desk = item({
  id: 'desk', category: 'office', ko: '책상', en: 'Desk', size: [1.4, 0.74, 0.7],
  params: [
    P.len('width', '폭', 'Width', 1.4, 0.8, 2.4),
    P.len('depth', '깊이', 'Depth', 0.7, 0.5, 0.9),
    P.len('height', '높이', 'Height', 0.74, 0.6, 0.8),
    P.mat('top', '상판', 'Top', 'wood-oak', 'wood'),
    P.pick('frame', '프레임', 'Frame', 'metal', FRAMES),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.pick('drawers', '서랍', 'Drawers', 'right', [['none', '없음', 'None'], ['right', '오른쪽', 'Right'], ['left', '왼쪽', 'Left']]),
    P.pick('handle', '손잡이', 'Handles', 'edge', OPT.handle),
  ],
  tags: ['desk', 'writing desk', 'computer desk', '책상', '컴퓨터 책상', '사무용 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p, t = 0.025;
    k.slab('top', p.top, roundRect(w, d, 0.006), t, h - t, { bevel: 0.003 });
    deskFrame(k, p.frame, w, d, h - t, p.top, p.metal);
    if (p.drawers !== 'none') {
      const s = p.drawers === 'right' ? 1 : -1;
      const inner = p.frame === 'panel' ? 0.025 : p.frame === 'metal' ? 0.075 : 0.08;
      deskPedestal(k, s * (w / 2 - inner - 0.205), d, h - t, p.top, p.top, p.handle);
    }
    return k.group();
  },
});

const deskL = item({
  id: 'desk-l', category: 'office', ko: 'ㄱ자 책상', en: 'L-shaped desk', size: [1.6, 0.74, 1.4],
  params: [
    P.len('width', '폭', 'Width', 1.6, 1.2, 2.4),
    P.len('length', '보조 길이', 'Return length', 1.4, 1.0, 2.0),
    P.len('depth', '깊이', 'Depth', 0.7, 0.55, 0.8),
    P.len('returnDepth', '보조 깊이', 'Return depth', 0.5, 0.4, 0.7),
    P.pick('side', '보조 방향', 'Return side', 'right', [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']]),
    P.mat('top', '상판', 'Top', 'wood-walnut', 'wood'),
    P.pick('frame', '프레임', 'Frame', 'metal', FRAMES),
    P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'),
    P.bool('drawers', '서랍', 'Drawers', true),
  ],
  tags: ['L desk', 'corner desk', 'ㄱ자 책상', '코너 책상', '사무용 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, L = Math.max(p.length, p.depth + 0.4), d = p.depth, rd = p.returnDepth, h = 0.74, t = 0.025, s = p.side === 'left' ? -1 : 1;
    // footprint W × L: main top along the back, return along one side coming forward (bbox-centred).
    const x0 = -W / 2, x1 = W / 2, z0 = -L / 2, z1 = L / 2;
    const rx0 = s > 0 ? x1 - rd : x0, rx1 = s > 0 ? x1 : x0 + rd;
    const pts = s > 0
      ? [[x0, z0], [x1, z0], [x1, z1], [rx0, z1], [rx0, z0 + d], [x0, z0 + d]]
      : [[x0, z0], [x1, z0], [x1, z0 + d], [rx1, z0 + d], [rx1, z1], [x0, z1]];
    // the slab extrudes the shape; plan z = shape y
    k.slab('top', p.top, planShape(pts), t, h - t, { bevel: 0.003 });
    const legH = h - t;
    // main run frame (leaves the corner side to the return frame)
    deskFrame(k, p.frame, W - rd, d, legH, p.top, p.metal, { x: -s * rd / 2, z: z0 + d / 2 });
    deskFrame(k, p.frame === 'panel' ? 'panel' : p.frame, rd, L, legH, p.top, p.metal, { x: (rx0 + rx1) / 2, z: 0, skipSide: 0 });
    if (p.drawers) addCabinet(k, { w: rd - 0.1, h: 0.55, d: 0.42, x: (rx0 + rx1) / 2, z: z1 - 0.32, y0: legH - 0.55, rows: [{ h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 1, type: 'drawer' }, { h: 1 / 3, n: 1, type: 'drawer' }], body: p.top, front: p.top, base: 'none', handle: 'edge', handleMat: 'metal-black', roles: { body: 'frame', front: 'fronts', handle: 'handles' } });
    return k.group();
  },
});

/* ---------------------------------------------------------- office chair */

const officeChair = item({
  id: 'office-chair', category: 'office', ko: '사무용 의자', en: 'Office chair', size: [0.66, 1.1, 0.66],
  params: [
    P.mat('mesh', '등판 메쉬', 'Back mesh', 'fabric-wool-charcoal', 'fabric'),
    P.mat('seat', '좌판', 'Seat', 'fabric-wool-charcoal', 'fabric'),
    P.mat('frame', '프레임', 'Frame', 'plastic-black', 'plastic'),
    P.pick('base', '베이스', 'Base', 'aluminium', [['aluminium', '알루미늄', 'Aluminium'], ['black', '블랙', 'Black']]),
    P.bool('arms', '팔걸이', 'Armrests', true),
    P.bool('headrest', '헤드레스트', 'Headrest', false),
  ],
  tags: ['office chair', 'task chair', 'desk chair', '사무용 의자', '컴퓨터 의자', '메쉬 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const baseMat = p.base === 'aluminium' ? 'metal-aluminium' : 'plastic-black';
    // 5-star base with casters (one arm points forward)
    k.cyl('base', baseMat, 0.04, 0.05, 0.06, 0, 0.075, 0, { segs: k.seg(20, 8) });
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i / 5) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a), R = 0.3;
      k.rod('base', baseMat, [c * 0.03, 0.105, s * 0.03], [c * R, 0.085, s * R], 0.016, { r2: 0.022, segs: k.seg(10, 5) });
      k.sphere('base', baseMat, 0.016, c * R, 0.085, s * R, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
      // twin-wheel caster
      const tx = -s, tz = c;
      k.box('casters', 'plastic-black', 0.035, 0.03, 0.045, c * R, 0.06, s * R, { r: 0.008, segs: 2, ry: -a });
      for (const side of [-1, 1]) {
        const wx = c * (R + 0.01) + tx * side * 0.012, wz = s * (R + 0.01) + tz * side * 0.012;
        k.rod('casters', 'plastic-black', [wx - tx * 0.008, 0.025, wz - tz * 0.008], [wx + tx * 0.008, 0.025, wz + tz * 0.008], 0.025, { segs: k.seg(16, 6) });
      }
    }
    // gas lift: chrome piston inside a black cover
    k.cyl('lift', 'metal-chrome', 0.014, 0.014, 0.33, 0, 0.1, 0, { segs: k.seg(14, 6) });
    k.cyl('frame', p.frame, 0.025, 0.028, 0.16, 0, 0.11, 0, { segs: k.seg(16, 6) });
    // mechanism, seat pan + cushion
    k.box('frame', p.frame, 0.22, 0.05, 0.24, 0, 0.42, 0.0, { r: 0.01, segs: 2 });
    k.box('frame', p.frame, 0.48, 0.025, 0.46, 0, 0.455, 0.02, { r: 0.01, segs: 2 });
    k.soft('seat', p.seat, 0.5, 0.075, 0.48, 0.03, 0, 0.505, 0.03, { puff: 0.012, sag: 0.004 });
    // spine to the back
    k.bentTube('frame', p.frame, [[0, 0.42, -0.08], [0, 0.42, -0.24], [0, 0.6, -0.28]], 0.02, 0.06);
    // mesh back: curved in plan, reclined ~8°, inside a frame loop
    const bw = 0.46, bh = p.headrest ? 0.62 : 0.52, by = 0.58, bz = -0.26, lean = 0.14;
    const curve = (x) => 0.12 * (x / (bw / 2)) ** 2 * (bw / 2);
    const back = (u, v) => {
      const x = (u - 0.5) * bw * (1 - 0.12 * v);
      const y = by + v * bh;
      const z = bz - curve(x) - lean * v * bh * 0.8 + 0.03 * Math.sin(v * Math.PI);
      return [x, y, z];
    };
    k.add('mesh', p.mesh, shellGeo(k.seg(14, 6), k.seg(12, 4), back, 0.006));
    const ring = [];
    const n = k.hi ? 10 : 5;
    for (let i = 0; i <= n; i++) ring.push(back(0, i / n));
    for (let i = 1; i <= n; i++) ring.push(back(i / n, 1));
    for (let i = n - 1; i >= 0; i--) ring.push(back(1, i / n));
    for (let i = n - 1; i >= 1; i--) ring.push(back(i / n, 0));
    k.tube('frame', p.frame, ring.map((q) => [q[0], q[1], q[2] - 0.006]), 0.012, { closed: true, radial: k.seg(8, 4) });
    // lumbar pad
    const lb = back(0.5, 0.25);
    k.soft('seat', p.seat, 0.3, 0.07, 0.03, 0.012, 0, lb[1], lb[2] + 0.018, { rx: -0.1 });
    if (p.arms) {
      for (const s of [-1, 1]) {
        k.bentTube('frame', p.frame, [[s * 0.12, 0.44, -0.02], [s * 0.26, 0.44, -0.02], [s * 0.26, 0.66, -0.02]], 0.016, 0.05);
        k.soft('arms', 'rubber-black', 0.075, 0.03, 0.25, 0.012, s * 0.26, 0.675, 0.0, { flat: 3 });
      }
    }
    // keep the bbox centred (the star base is not symmetric front/back)
    centreKit(k, { y: false });
    return k.group();
  },
});

/* -------------------------------------------------------------- bookcase */

const bookcase = item({
  id: 'bookcase-cabinet', category: 'office', ko: '하부장 책장', en: 'Bookcase with doors', size: [0.8, 2.0, 0.38],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.5, 1.6),
    P.len('height', '높이', 'Height', 2.0, 1.2, 2.4),
    P.len('depth', '깊이', 'Depth', 0.38, 0.3, 0.45),
    P.int('shelves', '선반 수', 'Open shelves', 3, 1, 6),
    P.mat('wood', '나무', 'Wood', 'wood-walnut', 'wood'),
    P.mat('front', '문', 'Doors', 'wood-walnut', 'wood'),
    P.bool('books', '책', 'Books', true),
  ],
  tags: ['bookcase', 'bookshelf', 'cabinet', '책장', '서재 책장', '하부장 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, height: h, depth: d } = p, t = 0.022, plinth = 0.06, low = Math.min(0.75, h * 0.4);
    for (const s of [-1, 1]) k.box('frame', p.wood, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.002 });
    k.box('frame', p.wood, w - 2 * t, t, d, 0, h - t / 2, 0, { r: 0.002 });
    k.box('frame', p.wood, w - 2 * t, plinth, d - 0.03, 0, plinth / 2, -0.015, { r: 0.002 });
    k.box('back', p.wood, w - 2 * t + 0.004, h - t - plinth, 0.008, 0, plinth + (h - t - plinth) / 2, -d / 2 + 0.008, { r: 0 });
    // lower cupboard: 1–2 doors flush between the sides, deeper top shelf as a ledge
    const nd = w > 0.6 ? 2 : 1, dw = (w - 2 * t) / nd;
    for (let i = 0; i < nd; i++) {
      const cx = -w / 2 + t + dw * (i + 0.5);
      k.box('fronts', p.front, dw - 0.003, low - 0.004, 0.019, cx, plinth + low / 2, d / 2 - 0.0095, { r: 0.002 });
      const hinge = nd === 1 ? -1 : i === 0 ? -1 : 1;
      k.box('handles', 'metal-brass', 0.012, 0.12, 0.012, cx - hinge * (dw / 2 - 0.04), plinth + low - 0.1, d / 2 + 0.006, { r: 0.004, segs: 2 });
    }
    k.box('frame', p.wood, w - 2 * t, 0.025, d, 0, plinth + low + 0.0125, 0, { r: 0.002 });
    const y0 = plinth + low + 0.025, span = (h - t - y0) / p.shelves;
    for (let i = 0; i < p.shelves; i++) {
      const y = y0 + span * i;
      if (i > 0) k.box('frame', p.wood, w - 2 * t, 0.02, d - 0.03, 0, y, 0.0, { r: 0.002 });
      if (p.books && span > 0.2) addBooks(k, -w / 2 + t, w / 2 - t, y + (i > 0 ? 0.01 : 0), -d / 2 + 0.04, Math.min(d - 0.08, 0.24), 3 + i * 5, { hMax: Math.min(0.3, span - 0.05), fill: 0.5 + 0.15 * (i % 3) });
    }
    return k.group();
  },
});

/* ------------------------------------------------------- filing cabinet */

const filing = item({
  id: 'filing-cabinet', category: 'office', ko: '서류함', en: 'Filing cabinet', size: [0.4, 0.6, 0.55],
  params: [
    P.pick('type', '형태', 'Type', 'pedestal', [['pedestal', '이동식 3단', 'Mobile pedestal'], ['vertical', '4단 캐비닛', '4-drawer vertical']]),
    P.mat('body', '몸체', 'Body', 'metal-white', 'metal'),
    P.mat('front', '전면', 'Fronts', 'metal-white', 'metal'),
  ],
  tags: ['filing cabinet', 'pedestal', 'drawer unit', '서류함', '파일 캐비닛', '이동 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const ped = p.type === 'pedestal';
    const w = ped ? 0.4 : 0.47, h = ped ? 0.6 : 1.32, d = ped ? 0.55 : 0.62;
    const rows = ped ? [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }] : [0, 1, 2, 3].map(() => ({ h: 0.25, n: 1, type: 'drawer' }));
    const y0 = ped ? 0.05 : 0;
    addCabinet(k, { w, h: h - y0, d, y0, rows, body: p.body, front: p.front, base: ped ? 'none' : 'plinth', plinth: 0.05, handle: 'bar', handleMat: 'metal-aluminium', top: null });
    // label holders on each drawer
    let yy = y0 + (ped ? 0 : 0.05);
    const bodyH = h - y0 - (ped ? 0 : 0.05);
    for (const r of rows) {
      const rh = r.h * bodyH;
      k.box('handles', 'metal-aluminium', 0.08, 0.025, 0.003, 0, yy + rh - 0.035, d / 2 + 0.0015, { r: 0.001 });
      yy += rh;
    }
    if (ped) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.05), z = sz * (d / 2 - 0.06);
        k.rod('casters', 'plastic-black', [x - 0.01, 0.022, z], [x + 0.01, 0.022, z], 0.022, { segs: k.seg(14, 6) });
        k.box('casters', 'plastic-black', 0.03, 0.02, 0.03, x, 0.04, z, { r: 0.005 });
      }
    }
    return k.group();
  },
});

/* ------------------------------------------------------------- devices */

const monitor = item({
  id: 'monitor', category: 'office', placement: 'surface', ko: '모니터', en: 'Monitor', size: [0.62, 0.48, 0.2],
  params: [
    P.pick('size', '크기', 'Size', '27', [['24', '24인치', '24"'], ['27', '27인치', '27"'], ['32', '32인치', '32"'], ['34', '34인치 와이드', '34" ultrawide']]),
    P.mat('stand', '스탠드', 'Stand', 'metal-aluminium', 'metal'),
  ],
  tags: ['monitor', 'display', 'screen', '모니터', '디스플레이', '컴퓨터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const dims = { 24: [0.54, 0.32], 27: [0.615, 0.36], 32: [0.72, 0.42], 34: [0.81, 0.36] }[p.size] ?? [0.615, 0.36];
    const [sw, sh] = dims, y0 = 0.11, sz = 0.02;
    k.box('bezel', 'plastic-black', sw, sh, 0.012, 0, y0 + sh / 2, sz, { r: 0.004, segs: 2 });
    k.box('screen', 'screen-black', sw - 0.012, sh - 0.024, 0.002, 0, y0 + sh / 2 + 0.004, sz + 0.0062, { r: 0 });
    k.box('bezel', 'plastic-black', sw * 0.55, sh * 0.5, 0.03, 0, y0 + sh * 0.45, sz - 0.02, { r: 0.012, segs: 2 }); // electronics hump
    // stand: neck leaning back slightly, thin rounded base plate
    k.box('stand', p.stand, 0.05, 0.3, 0.018, 0, 0.16, -0.035, { r: 0.006, segs: 2, rx: -0.12 });
    k.slab('stand', p.stand, roundRect(0.24, 0.18, 0.03), 0.008, 0, { bevel: 0.002, z: -0.0 });
    centreKit(k, { y: false });
    return k.group();
  },
});

const laptop = item({
  id: 'laptop', category: 'office', placement: 'surface', ko: '노트북', en: 'Laptop', size: [0.31, 0.21, 0.29],
  params: [
    P.num('open', '열림 각도', 'Lid angle', 110, 0, 135, 5),
    P.mat('body', '본체', 'Body', 'metal-aluminium', 'metal'),
  ],
  tags: ['laptop', 'notebook computer', '노트북', '랩톱', '컴퓨터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.31, d = 0.215, bt = 0.014, lt = 0.006;
    k.slab('body', p.body, roundRect(w, d, 0.012), bt, 0, { bevel: 0.002 });
    // keyboard well with keys + touchpad
    k.box('keys', 'plastic-black', 0.27, 0.001, 0.1, 0, bt, -0.025, { r: 0 });
    const cols = 14, rows = 5, kw = 0.27 / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (r === rows - 1 && c > 3 && c < 10) continue;
      k.box('keys', 'plastic-black', kw - 0.003, 0.0015, 0.016, -0.135 + kw * (c + 0.5), bt + 0.0007, -0.07 + r * 0.019, { r: 0 });
    }
    k.box('keys', 'plastic-black', kw * 6 - 0.003, 0.0015, 0.016, -0.135 + kw * 7, bt + 0.0007, -0.07 + 4 * 0.019, { r: 0 });
    k.box('touchpad', 'plastic-grey', 0.11, 0.0008, 0.065, 0, bt, 0.06, { r: 0 });
    // lid: built closed over the base, then rotated about the hinge
    const a = -THREE.MathUtils.degToRad(p.open);
    const m = new THREE.Matrix4().makeTranslation(0, bt, -d / 2 + 0.004).multiply(new THREE.Matrix4().makeRotationX(a));
    withMatrix(k, () => {
      k.slab('body', p.body, roundRect(w, d - 0.004, 0.012), lt, 0, { bevel: 0.0015, z: (d - 0.004) / 2 });
      k.box('screen', 'screen-black', w - 0.016, 0.001, d - 0.03, 0, -0.0004, (d - 0.004) / 2 + 0.004, { r: 0 });
    }, m);
    // after the rotation the lid's inner face (screen) points at the viewer; keep the bbox centred
    centreKit(k, { y: false });
    return k.group();
  },
});

const keyboard = item({
  id: 'keyboard-mouse', category: 'office', placement: 'surface', ko: '키보드·마우스', en: 'Keyboard & mouse', size: [0.56, 0.035, 0.14],
  params: [P.mat('color', '색', 'Colour', 'plastic-white', 'plastic')],
  tags: ['keyboard', 'mouse', '키보드', '마우스', 'computer'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const kw = 0.44, kd = 0.13;
    k.box('body', p.color, kw, 0.012, kd, -0.06, 0.006, 0, { r: 0.004, segs: 2, rx: 0.04 });
    const cols = 18, rows = 5, kx = (kw - 0.02) / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (r === rows - 1 && c > 4 && c < 12) continue;
      k.box('keys', p.color, kx - 0.003, 0.006, 0.018, -0.06 - kw / 2 + 0.01 + kx * (c + 0.5), 0.014 + (rows - r) * 0.0008, -kd / 2 + 0.018 + r * 0.022, { r: 0.0015, segs: 1 });
    }
    k.box('keys', p.color, kx * 7 - 0.003, 0.006, 0.018, -0.06 - kw / 2 + 0.01 + kx * 8.5, 0.0148, -kd / 2 + 0.018 + 4 * 0.022, { r: 0.0015 });
    // mouse: a squashed egg
    k.sphere('body', p.color, 1, 0.22, 0, 0.005, { scale: [0.031, 0.035, 0.058], thetaLength: Math.PI / 2, segs: k.seg(24, 8), rings: k.seg(10, 4) });
    centreKit(k, { y: false });
    return k.group();
  },
});

export const ITEMS = [desk, deskL, officeChair, bookcase, filing, monitor, laptop, keyboard];
