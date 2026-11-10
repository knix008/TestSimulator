// Company workplace furniture (category 'workplace'): bench / cluster workstations with screens,
// manager desks, cubicle partitions, task / mesh / boardroom / visitor chairs, conference tables
// (6 / 10 / 16 seats, boat-shaped, round), reception, waiting seating, pedestals, filing, lockers,
// room dividers, phone booth and focus pod, high tables + stools, flip-top training tables,
// lectern, mobile whiteboard, printer station, water cooler, coffee point, server rack, planter
// divider, lounge chair, wall logo / acoustic panels and more. Plus a few preset variants.
// Origin: bottom centre (every build is re-centred by finish()), front +Z. See ARCHITECTURE.md §12.
import { THREE, Kit, P, variant, roundRect, ellipse, frameShape, addCabinet, addHandle, transformAdded, clamp } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';

const PI = Math.PI;
const CAT = 'workplace';
const w$ = (def) => mk({ category: CAT, ...def });

/* --------------------------------------------------------------- helpers */

/** 5-star base with twin-wheel casters + gas lift up to `top`. */
function starBase(k, mat, { R = 0.31, top = 0.42, casters = true } = {}) {
  k.cyl('base', mat, 0.04, 0.05, 0.06, 0, 0.075, 0, { segs: k.seg(20, 8) });
  for (let i = 0; i < 5; i++) {
    const a = PI / 2 + (i / 5) * PI * 2, c = Math.cos(a), s = Math.sin(a);
    k.rod('base', mat, [c * 0.03, 0.105, s * 0.03], [c * R, 0.075, s * R], 0.016, { r2: 0.022, segs: k.seg(10, 5) });
    if (casters) {
      k.box('casters', 'plastic-black', 0.035, 0.03, 0.045, c * R, 0.055, s * R, { r: 0.008, segs: 2, ry: -a });
      k.cyl('casters', 'plastic-black', 0.025, 0.025, 0.04, c * (R + 0.01) - 0.02 * s, 0.025, s * (R + 0.01) + 0.02 * c, { rz: PI / 2, ry: -a, segs: k.seg(14, 6) });
    } else k.cyl('casters', 'plastic-black', 0.02, 0.022, 0.06, c * R, 0, s * R, { segs: k.seg(10, 5) });
  }
  k.cyl('lift', 'metal-chrome', 0.014, 0.014, top - 0.12, 0, 0.1, 0, { segs: k.seg(14, 6) });
  k.cyl('lift', 'plastic-black', 0.025, 0.028, Math.min(0.16, (top - 0.1) * 0.5), 0, 0.11, 0, { segs: k.seg(16, 6) });
}

/** Swivel office chair: o = seatMat, backMat, frame, back ('pad'|'mesh'|'tall'), arms, head, seatY, backH, w. */
function officeChair(k, o) {
  const { seatMat, backMat = seatMat, frame = 'metal-aluminium', back = 'pad', arms = true, head = false, seatY = 0.47, backH = 0.55, w = 0.5, base = true } = o;
  if (base) starBase(k, frame, { R: 0.32, top: seatY - 0.07 });
  k.box('frame', 'plastic-black', 0.22, 0.05, 0.24, 0, seatY - 0.075, 0, { r: 0.01, segs: 2 });
  k.soft('seat', seatMat, w, 0.08, 0.48, 0.03, 0, seatY - 0.01, 0.03, { puff: 0.008 });
  k.box('frame', 'plastic-black', 0.06, 0.3, 0.03, 0, seatY + 0.04, -0.235, { r: 0.008, rx: -0.12, segs: 2 });
  const by = seatY + 0.08 + backH / 2, bz = -0.27 - backH * 0.06, bw = w - 0.02, rx = -0.13;
  if (back === 'mesh') {
    k.panel('frame', 'plastic-black', frameShape(bw, backH, 0.03, 0.03, 0.06), 0.03, 0, by, bz, { rx });
    k.box('mesh', backMat, bw - 0.04, backH - 0.04, 0.006, 0, by, bz, { r: 0, rx });
    k.box('frame', 'plastic-black', bw - 0.06, 0.05, 0.035, 0, seatY + 0.2, bz + 0.03, { r: 0.012, rx, segs: 2 });
  } else {
    k.soft('back', backMat, bw, backH, back === 'tall' ? 0.1 : 0.075, 0.03, 0, by, bz, { rx, puff: 0.012 });
  }
  if (head) {
    k.rod('frame', 'plastic-black', [0, by + backH / 2 - 0.05, bz - 0.06], [0, by + backH / 2 + 0.07, bz - 0.08], 0.012);
    k.soft(back === 'mesh' ? 'mesh' : 'back', backMat, 0.28, 0.12, 0.06, 0.025, 0, by + backH / 2 + 0.12, bz - 0.06, { rx });
  }
  if (arms) for (const s of [-1, 1]) {
    const x = s * (w / 2 + 0.015);
    k.box('arms', 'plastic-black', 0.03, 0.2, 0.05, x, seatY + 0.07, -0.02, { r: 0.008, segs: 2 });
    k.box('arms', 'plastic-black', 0.03, 0.04, 0.06, x - s * 0.04, seatY - 0.04, -0.02, { r: 0.008, segs: 2 });
    k.rbox('arms', 'plastic-black', 0.075, 0.03, 0.26, 0.012, x, seatY + 0.18, 0.0);
  }
}

/** Four straight legs / posts under a top: `style` 'post' (square), 'round', 'panel' (slab ends), 'trestle' (A frame). */
function deskLegs(k, style, mat, w, d, h, { inset = 0.04, x = 0, z = 0 } = {}) {
  const xs = w / 2 - inset, zs = d / 2 - inset;
  if (style === 'panel') {
    for (const s of [-1, 1]) k.box('frame', mat, 0.03, h, d - 0.04, x + s * (w / 2 - 0.03), h / 2, z, { r: 0.003 });
    return;
  }
  if (style === 'trestle') {
    for (const s of [-1, 1]) {
      const lx = x + s * (w / 2 - 0.12);
      k.box('frame', mat, 0.06, 0.03, d - 0.08, lx, 0.015, z, { r: 0.004 });
      k.box('frame', mat, 0.06, 0.04, d - 0.12, lx, h - 0.02, z, { r: 0.004 });
      k.box('frame', mat, 0.06, h - 0.07, 0.06, lx, h / 2, z, { r: 0.004 });
    }
    k.box('frame', mat, w - 0.3, 0.05, 0.03, x, h - 0.06, z, { r: 0.004 });
    return;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (style === 'round') k.cyl('frame', mat, 0.025, 0.025, h, x + sx * xs, 0, z + sz * zs, { segs: k.seg(14, 6) });
    else k.box('frame', mat, 0.05, h, 0.05, x + sx * xs, h / 2, z + sz * zs, { r: 0.004 });
  }
}

/** Fabric-covered desk screen (aluminium edge) centred at (x, y0 + h/2, z). */
function screen(k, mat, w, h, x, y0, z, { frame = 'metal-aluminium', ry = 0 } = {}) {
  k.rbox('screen', mat, w, h, 0.028, 0.012, x, y0 + h / 2, z, { ry });
  k.box('screenEdge', frame, ry ? 0.034 : w, 0.012, ry ? w : 0.034, x, y0 + h - 0.004, z, { r: 0.003 });
}

/** Mobile drawer pedestal (3 drawers or box + file), origin bottom centre at (x, z). */
function pedestal(k, { w = 0.42, h = 0.6, d = 0.55, x = 0, z = 0, mat = 'paint-white-matte', front = mat, handle = 'edge', casters = true }) {
  const y0 = casters ? 0.05 : 0;
  addCabinet(k, { w, h: h - y0, d, x, z, y0, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }], body: mat, front, base: 'none', handle, handleMat: 'metal-aluminium', roles: { body: 'pedBody', front: 'pedFront', handle: 'handles' } });
  if (casters) for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('casters', 'plastic-black', 0.022, 0.022, 0.03, x + sx * (w / 2 - 0.05), 0.022, z + sz * (d / 2 - 0.06), { rz: PI / 2, segs: k.seg(12, 6) });
  if (casters) k.box('casters', 'plastic-black', w - 0.06, 0.012, d - 0.08, x, 0.044, z, { r: 0.002 });
}

/** Seat around a point rotated by ry (for clusters). */
const rotXZ = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

const TOP = 'wood';
const FRAME_OPTS = 'metal';
const FABRIC = 'fabric';

/* ------------------------------------------------------- workstations */

function bench(id, ko, en, pairs, tags) {
  return w$({
    id, ko, en,
    params: [
      P.len('seatW', '1인 폭', 'Width per seat', 1.4, 1.0, 1.8),
      P.len('depth', '1인 깊이', 'Depth per seat', 0.7, 0.6, 0.8),
      P.mat('top', '상판', 'Top', 'wood-white', TOP),
      P.mat('frame', '프레임', 'Frame', 'metal-white', FRAME_OPTS),
      P.bool('screens', '칸막이', 'Screens', true),
      P.mat('screenMat', '칸막이 천', 'Screen fabric', 'fabric-wool-charcoal', FABRIC),
      P.len('screenH', '칸막이 높이', 'Screen height', 0.4, 0.25, 0.65),
      P.bool('sideScreens', '옆 칸막이', 'Side screens', pairs > 1),
    ],
    tags: ['workstation', 'bench desk', 'office desk', `${pairs * 2} seat`, '워크스테이션', '사무용 책상', '벤치 데스크', `${pairs * 2}인`],
    build: (p, ctx) => {
      const k = new Kit(ctx);
      const sw = p.seatW, d = p.depth, h = 0.74, t = 0.025, W = pairs * sw, D = 2 * d + 0.02;
      for (const s of [-1, 1]) for (let i = 0; i < pairs; i++) k.box('top', p.top, sw - 0.006, t, d, -W / 2 + sw * (i + 0.5), h - t / 2, s * (d / 2 + 0.01), { r: 0.003 });
      // shared T-leg frames at every seat boundary + spine beam
      for (let i = 0; i <= pairs; i++) {
        const x = clamp(-W / 2 + sw * i, -W / 2 + 0.04, W / 2 - 0.04);
        k.box('frame', p.frame, 0.06, h - t - 0.03, 0.06, x, (h - t - 0.03) / 2 + 0.03, 0, { r: 0.004 });
        k.box('frame', p.frame, 0.07, 0.03, D - 0.12, x, 0.015, 0, { r: 0.006, segs: 2 });
        k.box('frame', p.frame, 0.06, 0.04, D - 0.1, x, h - t - 0.02, 0, { r: 0.004 });
      }
      k.box('frame', p.frame, W - 0.1, 0.06, 0.06, 0, h - t - 0.05, 0, { r: 0.004 });
      k.box('frame', p.frame, W - 0.2, 0.08, 0.24, 0, h - t - 0.12, 0, { r: 0.004 });
      if (p.screens) {
        screen(k, p.screenMat, W - 0.04, p.screenH, 0, h, 0);
        for (let i = 0; i < pairs; i++) for (const s of [-1, 1]) k.box('power', 'plastic-black', 0.24, 0.06, 0.03, -W / 2 + sw * (i + 0.5), h + 0.03, s * 0.03, { r: 0.004 });
        if (p.sideScreens) for (let i = 1; i < pairs; i++) for (const s of [-1, 1]) screen(k, p.screenMat, d * 0.75, p.screenH * 0.8, -W / 2 + sw * i, h, s * (d * 0.375 + 0.02), { ry: PI / 2 });
      }
      return finish(k);
    },
  });
}
const bench2 = bench('wp-bench-2', '2인 벤치 워크스테이션', '2-seat bench workstation', 1, ['face to face', '마주보는']);
const bench4 = bench('wp-bench-4', '4인 벤치 워크스테이션', '4-seat bench workstation', 2, ['cluster', '클러스터']);
const bench6 = bench('wp-bench-6', '6인 벤치 워크스테이션', '6-seat bench workstation', 3, ['open plan', '오픈 오피스']);

/** One straight desk in local coords (user at +z, back edge z = −d/2) with a back screen. */
function simpleDesk(k, p, w, d, { screenOn = true } = {}) {
  const h = 0.74, t = 0.025;
  k.box('top', p.top, w, t, d, 0, h - t / 2, 0, { r: 0.003 });
  deskLegs(k, 'post', p.frame, w, d, h - t, { inset: 0.05 });
  k.box('frame', p.frame, w - 0.12, 0.3, 0.015, 0, h - t - 0.2, -d / 2 + 0.06, { r: 0.002 });
  if (screenOn && p.screens) screen(k, p.screenMat, w, p.screenH, 0, h - 0.02, -d / 2 + 0.015);
}

const cluster4 = w$({
  id: 'wp-cluster-4', ko: '4인 바람개비 클러스터 데스크', en: '4-seat pinwheel cluster desk',
  params: [
    P.len('deskW', '책상 폭', 'Desk width', 1.4, 1.1, 1.8), P.len('depth', '깊이', 'Depth', 0.7, 0.6, 0.8),
    P.mat('top', '상판', 'Top', 'wood-oak', TOP), P.mat('frame', '다리', 'Legs', 'metal-black', FRAME_OPTS),
    P.bool('screens', '칸막이', 'Screens', true), P.mat('screenMat', '칸막이 천', 'Screen fabric', 'fabric-linen-grey', FABRIC), P.len('screenH', '칸막이 높이', 'Screen height', 0.4, 0.25, 0.6),
  ],
  tags: ['cluster desk', 'pinwheel', 'workstation', '4 seat', '클러스터 데스크', '바람개비', '워크스테이션', '4인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.deskW, d = p.depth;
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2, [x, z] = rotXZ(-d / 2, w / 2, a);
      transformAdded(k, () => simpleDesk(k, p, w, d), x, 0, z, a);
    }
    k.box('power', p.frame, w - d - 0.04, 0.74, w - d - 0.04, 0, 0.37, 0, { r: 0.004 });
    return finish(k);
  },
});

const cluster3 = w$({
  id: 'wp-cluster-3', ko: '3인 120° Y 클러스터 데스크', en: '3-seat 120° cluster desk',
  params: [
    P.len('deskW', '책상 폭', 'Desk width', 1.3, 1.0, 1.6), P.len('depth', '깊이', 'Depth', 0.7, 0.6, 0.8),
    P.mat('top', '상판', 'Top', 'wood-white', TOP), P.mat('frame', '다리', 'Legs', 'metal-white', FRAME_OPTS),
    P.bool('screens', '칸막이', 'Screens', true), P.mat('screenMat', '칸막이 천', 'Screen fabric', 'fabric-velvet-green', FABRIC), P.len('screenH', '칸막이 높이', 'Screen height', 0.45, 0.25, 0.6),
  ],
  tags: ['120 degree', 'y cluster', 'workstation', '3 seat', '120도', 'Y형 데스크', '워크스테이션', '3인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.deskW, d = p.depth, R = d / 2 + w / (2 * Math.sqrt(3)) + 0.01;
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * PI) / 3;
      transformAdded(k, () => simpleDesk(k, p, w, d), Math.sin(a) * R, 0, Math.cos(a) * R, a);
    }
    k.cyl('power', p.frame, 0.08, 0.08, 0.74, 0, 0, 0, { segs: k.seg(16, 6) });
    return finish(k);
  },
});

const operatorDesk = w$({
  id: 'wp-desk-operator', ko: '사무용 일자 책상 (가림판)', en: 'Operator desk with modesty panel',
  params: [
    P.len('width', '폭', 'Width', 1.4, 1.0, 1.8), P.len('depth', '깊이', 'Depth', 0.7, 0.6, 0.8),
    P.mat('top', '상판', 'Top', 'wood-oak', TOP), P.mat('frame', '프레임', 'Frame', 'metal-white', FRAME_OPTS),
    P.bool('screens', '앞 가림판', 'Front screen', true), P.mat('screenMat', '가림판 천', 'Screen fabric', 'fabric-navy', FABRIC), P.len('screenH', '가림판 높이', 'Screen height', 0.35, 0.25, 0.6),
    P.bool('ped', '서랍장', 'Pedestal', true),
  ],
  tags: ['office desk', 'operator desk', 'workstation', '사무용 책상', '일자 책상', '직원 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    simpleDesk(k, p, p.width, p.depth);
    if (p.ped) pedestal(k, { x: p.width / 2 - 0.3, z: -0.02, d: p.depth - 0.12 });
    return finish(k);
  },
});

const managerL = w$({
  id: 'wp-manager-l', ko: '팀장용 ㄱ자 책상', en: 'L-shaped manager desk',
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.4, 2.2), P.len('depth', '깊이', 'Depth', 0.8, 0.7, 0.9),
    P.len('ret', '보조 책상 길이', 'Return length', 1.2, 0.8, 1.6),
    P.pick('side', '보조 책상 방향', 'Return side', 'right', [['right', '오른쪽', 'Right'], ['left', '왼쪽', 'Left']]),
    P.mat('top', '상판', 'Top', 'wood-walnut', TOP), P.mat('body', '패널', 'Panels', 'wood-walnut', TOP),
  ],
  tags: ['manager desk', 'l desk', 'executive', 'corner desk', '팀장 책상', 'ㄱ자 책상', '관리자 책상', '코너 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.75, t = 0.035, s = p.side === 'left' ? -1 : 1, rd = 0.5, rl = p.ret;
    k.slab('top', p.top, roundRect(w, d, 0.02), t, h - t);
    k.box('frame', p.body, 0.04, h - t, d - 0.04, -s * (w / 2 - 0.04), (h - t) / 2, 0, { r: 0.003 });
    k.box('frame', p.body, w - 0.6, 0.4, 0.02, -s * 0.2, h - t - 0.22, -d / 2 + 0.06, { r: 0.002 });
    // return: from the main desk's front edge towards +z, along the chosen side
    const rx = s * (w / 2 - rd / 2), rz = d / 2 + rl / 2 - 0.0;
    k.box('top', p.top, rd, t, rl, rx, h - t / 2, rz, { r: 0.004 });
    addCabinet(k, { w: rd - 0.02, h: h - t, d: 0.5, x: rx, z: d / 2 + rl - 0.27, rows: [{ h: 0.5, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }, { h: 0.25, n: 1, type: 'drawer' }], body: p.body, front: p.body, base: 'plinth', plinth: 0.05, handle: 'bar', handleMat: 'metal-black', roles: { body: 'frame', front: 'fronts', handle: 'handles' } });
    k.box('frame', p.body, 0.04, h - t, d - 0.06, s * (w / 2 - 0.04), (h - t) / 2, 0, { r: 0.003 });
    return finish(k);
  },
});

const credenza = w$({
  id: 'wp-credenza', ko: '임원실 크레덴자 수납장', en: 'Executive credenza',
  params: [
    P.len('width', '폭', 'Width', 1.8, 1.2, 2.4), P.mat('body', '몸체', 'Body', 'wood-walnut', TOP), P.mat('front', '문', 'Doors', 'wood-walnut', TOP),
    P.mat('top', '상판', 'Top', 'marble-black', 'stone'),
  ],
  tags: ['credenza', 'sideboard', 'executive', 'office storage', '크레덴자', '임원실 수납장', '사이드보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.max(2, Math.round(p.width / 0.45));
    addCabinet(k, { w: p.width, h: 0.66, d: 0.5, rows: [{ h: 0.65, n, type: 'door' }, { h: 0.35, n, type: 'drawer' }], body: p.body, front: p.front, base: 'legs', legH: 0.1, legStyle: 'metal', legMat: 'metal-black', top: p.top, topThick: 0.02, handle: 'edge', handleMat: 'metal-black' });
    return finish(k);
  },
});

/* ------------------------------------------------------- partitions */

function partitionPanel(k, p, w, h, x = 0, z = 0, ry = 0) {
  transformAdded(k, () => {
    const fb = 0.03, glassH = p.glassTop ? Math.min(0.45, h * 0.3) : 0, fh = h - 0.04;
    k.panel('frame', p.frame, frameShape(w, fh, fb), 0.06, 0, 0.04 + fh / 2, 0, { bevel: 0.003 });
    const ih = fh - 2 * fb, iw = w - 2 * fb;
    k.box('fabric', p.fabric, iw + 0.004, ih - glassH, 0.05, 0, 0.04 + fb + (ih - glassH) / 2, 0, { r: 0.004 });
    if (glassH) {
      k.box('frame', p.frame, iw, 0.02, 0.05, 0, 0.04 + fb + ih - glassH, 0, { r: 0.002 });
      k.box('glass', 'glass-frosted', iw + 0.004, glassH - 0.02, 0.008, 0, 0.04 + fb + ih - glassH / 2 + 0.01, 0, { r: 0 });
    }
    for (const s of [-1, 1]) {
      k.box('frame', p.frame, 0.05, 0.04, 0.36, s * (w / 2 - 0.08), 0.02, 0, { r: 0.006, segs: 2 });
    }
  }, x, 0, z, ry);
}
const PART_PARAMS = (w, h, fabric = 'fabric-linen-grey', glassTop = false) => [
  P.len('width', '폭', 'Width', w, 0.6, 1.8), P.len('height', '높이', 'Height', h, 1.0, 2.0),
  P.mat('fabric', '천', 'Fabric', fabric, FABRIC), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', FRAME_OPTS), P.bool('glassTop', '상부 유리', 'Glass top', glassTop),
];
const partitionStraight = w$({
  id: 'wp-partition', ko: '사무실 파티션 (일자)', en: 'Office partition panel (straight)', params: PART_PARAMS(1.2, 1.5),
  tags: ['partition', 'cubicle panel', 'divider', 'screen', '파티션', '칸막이', '사무실 파티션'],
  build: (p, ctx) => { const k = new Kit(ctx); partitionPanel(k, p, p.width, p.height); return finish(k); },
});
const partitionCorner = w$({
  id: 'wp-partition-corner', ko: '사무실 파티션 (ㄱ자 코너)', en: 'Office partition (corner)', params: PART_PARAMS(1.0, 1.5, 'fabric-wool-charcoal', true),
  tags: ['partition', 'corner partition', 'cubicle', 'divider', '파티션', '코너 파티션', 'ㄱ자 칸막이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width;
    partitionPanel(k, p, w, p.height, w / 2, -0.03);
    partitionPanel(k, p, w, p.height, -0.03, w / 2, PI / 2);
    k.cyl('frame', p.frame, 0.035, 0.035, p.height, -0.03, 0, -0.03, { segs: k.seg(14, 6) });
    return finish(k);
  },
});
const partitionGlass = w$({
  id: 'wp-partition-glass', ko: '유리 파티션 (알루미늄 프레임)', en: 'Glass partition with aluminium frame',
  params: [P.len('width', '폭', 'Width', 1.2, 0.6, 1.8), P.len('height', '높이', 'Height', 1.8, 1.0, 2.4), P.mat('frame', '프레임', 'Frame', 'metal-black', FRAME_OPTS), P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass'), P.int('bars', '가로 살', 'Rails', 1, 0, 4)],
  tags: ['glass partition', 'glazed screen', 'divider', '유리 파티션', '유리 칸막이', '사무실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, fb = 0.035;
    k.panel('frame', p.frame, frameShape(w, h - 0.03, fb), 0.05, 0, 0.03 + (h - 0.03) / 2, 0);
    k.box('glass', p.glass, w - 2 * fb + 0.004, h - 0.03 - 2 * fb + 0.004, 0.01, 0, 0.03 + (h - 0.03) / 2, 0, { r: 0 });
    const n = Math.round(p.bars);
    for (let i = 1; i <= n; i++) k.box('frame', p.frame, w - 2 * fb, 0.025, 0.04, 0, 0.03 + ((h - 0.03) * i) / (n + 1), 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('frame', p.frame, 0.05, 0.03, 0.4, s * (w / 2 - 0.08), 0.015, 0, { r: 0.006, segs: 2 });
    return finish(k);
  },
});

const cubicle = w$({
  id: 'wp-cubicle-l', ko: '큐비클 워크스테이션 (ㄱ자 책상)', en: 'Cubicle workstation with L desk',
  params: [
    P.len('size', '크기', 'Size', 1.6, 1.4, 2.0), P.len('height', '파티션 높이', 'Panel height', 1.4, 1.1, 1.8),
    P.mat('fabric', '파티션 천', 'Panel fabric', 'fabric-linen-grey', FABRIC), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', FRAME_OPTS),
    P.mat('top', '상판', 'Top', 'wood-white', TOP), P.bool('glassTop', '상부 유리', 'Glass top', false),
  ],
  tags: ['cubicle', 'workstation', 'booth desk', '큐비클', '파티션 책상', '워크스테이션', '칸막이 책상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.size, h = 0.73, t = 0.025, d = 0.65;
    partitionPanel(k, p, S, p.height, 0, -S / 2);
    for (const s of [-1, 1]) partitionPanel(k, p, S, p.height, s * S / 2, 0, PI / 2);
    // L-shaped top: along the back and the left panel
    k.box('top', p.top, S - 0.08, t, d, 0, h - t / 2, -S / 2 + 0.04 + d / 2, { r: 0.003 });
    k.box('top', p.top, d, t, S - d - 0.08, -S / 2 + 0.04 + d / 2, h - t / 2, (d + 0.04) / 2, { r: 0.003 });
    for (const s of [-1, 1]) k.box('topFrame', p.frame, 0.04, 0.04, d - 0.04, s * (S / 2 - 0.06), h - t - 0.02, -S / 2 + 0.04 + d / 2, { r: 0.003 });
    k.box('topFrame', p.frame, 0.05, h - t, 0.05, -S / 2 + 0.04 + d - 0.04, (h - t) / 2, S / 2 - 0.12, { r: 0.003 });
    pedestal(k, { x: S / 2 - 0.3, z: -S / 2 + 0.06 + 0.27, d: 0.54 });
    return finish(k);
  },
});

/* ---------------------------------------------------------------- chairs */

function chairEntry(def, opts) {
  return w$({
    ...def,
    build: (p, ctx) => {
      const k = new Kit(ctx);
      officeChair(k, { ...opts, seatMat: p.seat, backMat: p.back ?? p.seat, frame: p.frame, arms: p.arms ?? true, head: p.head ?? opts.head });
      return finish(k);
    },
  });
}
const taskChair = chairEntry({
  id: 'wp-task-chair', ko: '사무용 의자 (태스크)', en: 'Task chair',
  params: [P.mat('seat', '천', 'Fabric', 'fabric-wool-charcoal', FABRIC), P.mat('frame', '베이스', 'Base', 'plastic-black'), P.bool('arms', '팔걸이', 'Arms', true)],
  tags: ['task chair', 'office chair', 'swivel chair', '사무용 의자', '회전 의자', '업무용 의자'],
}, { back: 'pad', backH: 0.48 });
const meshChair = chairEntry({
  id: 'wp-mesh-chair', ko: '메쉬 의자 (헤드레스트)', en: 'Mesh chair with headrest',
  params: [P.mat('seat', '좌석', 'Seat', 'fabric-wool-charcoal', FABRIC), P.mat('back', '메쉬', 'Mesh', 'fabric-cotton-grey', FABRIC), P.mat('frame', '베이스', 'Base', 'metal-aluminium'), P.bool('arms', '팔걸이', 'Arms', true), P.bool('head', '헤드레스트', 'Headrest', true)],
  tags: ['mesh chair', 'ergonomic chair', 'office chair', '메쉬 의자', '인체공학 의자', '사무용 의자'],
}, { back: 'mesh', backH: 0.58 });
const boardChair = chairEntry({
  id: 'wp-boardroom-chair', ko: '중역 회의실 의자 (가죽 하이백)', en: 'Boardroom chair (leather high back)',
  params: [P.mat('seat', '가죽', 'Leather', 'leather-black', 'leather'), P.mat('frame', '베이스', 'Base', 'metal-chrome'), P.bool('arms', '팔걸이', 'Arms', true)],
  tags: ['boardroom chair', 'executive chair', 'conference chair', 'leather', '회의실 의자', '중역 의자', '가죽 의자'],
}, { back: 'tall', backH: 0.72, w: 0.54 });

const visitorChair = w$({
  id: 'wp-visitor-chair', ko: '방문객 의자 (캔틸레버)', en: 'Cantilever visitor chair',
  params: [P.mat('seat', '좌석', 'Seat', 'fabric-navy', FABRIC), P.mat('frame', '프레임', 'Frame', 'metal-chrome', FRAME_OPTS), P.bool('arms', '팔걸이', 'Arms', true)],
  tags: ['visitor chair', 'cantilever chair', 'guest chair', 'meeting chair', '방문객 의자', '캔틸레버 의자', '회의 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sy = 0.46, w = 0.5;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.02);
      k.bentTube('frame', p.frame, [[x, sy - 0.04, 0.22], [x, sy - 0.04, -0.22], [x, 0.012, 0.27], [x, 0.012, -0.24]], 0.012, 0.05);
      if (p.arms) k.bentTube('frame', p.frame, [[x, sy - 0.04, -0.2], [x, sy + 0.2, -0.22], [x, sy + 0.2, 0.15], [x, sy - 0.04, 0.18]], 0.01, 0.04);
    }
    k.soft('seat', p.seat, w, 0.07, 0.48, 0.025, 0, sy, 0.0, { puff: 0.008 });
    k.soft('seat', p.seat, w - 0.02, 0.42, 0.06, 0.025, 0, sy + 0.27, -0.25, { rx: -0.12, puff: 0.01 });
    k.box('frame', p.frame, w - 0.04, 0.025, 0.025, 0, sy + 0.1, -0.23, { r: 0.008 });
    return finish(k);
  },
});

const trainingChair = w$({
  id: 'wp-training-chair', ko: '교육용 의자 (태블릿 암)', en: 'Training chair with tablet arm',
  params: [P.mat('shell', '쉘', 'Shell', 'plastic-white'), P.mat('frame', '프레임', 'Frame', 'metal-black', FRAME_OPTS), P.mat('tablet', '태블릿', 'Tablet', 'wood-oak', TOP), P.bool('basket', '책 바구니', 'Book rack', true)],
  tags: ['training chair', 'tablet arm chair', 'stacking chair', 'seminar', '교육용 의자', '강의실 의자', '태블릿 의자', '세미나'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sy = 0.46;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', p.frame, [sx * 0.2, sy - 0.03, sz * 0.18], [sx * 0.23, 0, sz * 0.23], 0.011);
    k.box('frame', p.frame, 0.4, 0.025, 0.025, 0, sy - 0.04, 0.18, { r: 0.008 });
    k.box('frame', p.frame, 0.4, 0.025, 0.025, 0, sy - 0.04, -0.18, { r: 0.008 });
    k.rbox('shell', p.shell, 0.47, 0.025, 0.45, 0.02, 0, sy, 0.0);
    k.rbox('shell', p.shell, 0.45, 0.36, 0.025, 0.03, 0, sy + 0.25, -0.24, { rx: -0.14 });
    k.rod('frame', p.frame, [0.235, sy - 0.02, 0.15], [0.26, sy + 0.24, 0.12], 0.01);
    k.slab('tablet', p.tablet, ellipse(0.28, 0.36), 0.018, sy + 0.25, { x: 0.3, z: 0.18 });
    k.rod('frame', p.frame, [0.26, sy + 0.24, 0.12], [0.3, sy + 0.25, 0.14], 0.01);
    if (p.basket) for (const s of [-1, 1]) k.rod('frame', p.frame, [-0.18, 0.12, s * 0.15], [0.18, 0.12, s * 0.15], 0.006);
    return finish(k);
  },
});

const barStool = w$({
  id: 'wp-bar-stool', ko: '하이 스툴 (발받침)', en: 'High bar stool with foot ring',
  params: [P.len('height', '좌면 높이', 'Seat height', 0.75, 0.6, 0.82), P.mat('seat', '좌석', 'Seat', 'leather-cognac', 'leather'), P.mat('frame', '프레임', 'Frame', 'metal-black', FRAME_OPTS), P.bool('back', '등받이', 'Low back', false)],
  tags: ['bar stool', 'high stool', 'counter stool', '바 스툴', '하이 스툴', '카운터 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = p.height;
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('frame', p.frame, [c * 0.14, h - 0.04, s * 0.14], [c * 0.22, 0, s * 0.22], 0.012);
    }
    const ry = h * 0.36, rr = 0.14 + (0.08 * (h - 0.04 - ry)) / (h - 0.04);
    k.add('frame', p.frame, new THREE.TorusGeometry(rr + 0.004, 0.009, k.seg(8, 4), k.seg(32, 10)).rotateX(PI / 2).translate(0, ry, 0));
    k.cyl('frame', p.frame, 0.17, 0.17, 0.02, 0, h - 0.05, 0, { segs: k.seg(28, 10) });
    k.lathe('seat', p.seat, [[0, 0], [0.19, 0], [0.205, 0.015], [0.2, 0.045], [0.18, 0.055], [0, 0.055]], 0, h - 0.04, 0, { segs: k.seg(32, 10) });
    if (p.back) k.rbox('seat', p.seat, 0.34, 0.14, 0.04, 0.02, 0, h + 0.17, -0.17, { rx: -0.1 });
    if (p.back) for (const s of [-1, 1]) k.rod('frame', p.frame, [s * 0.12, h - 0.03, -0.14], [s * 0.12, h + 0.14, -0.17], 0.008);
    return finish(k);
  },
});

const lounge = w$({
  id: 'wp-lounge-chair', ko: '협업 라운지 의자 (태블릿)', en: 'Collaboration lounge chair with tablet',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-mustard', FABRIC), P.mat('frame', '베이스', 'Base', 'metal-aluminium', FRAME_OPTS), P.bool('tablet', '태블릿', 'Tablet arm', true), P.mat('tabletMat', '태블릿 재질', 'Tablet finish', 'wood-oak', TOP)],
  tags: ['lounge chair', 'collaboration', 'breakout', 'swivel lounge', '라운지 의자', '협업 공간', '휴게 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sy = 0.44;
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2;
      k.rod('base', p.frame, [0, 0.03, 0], [Math.cos(a) * 0.32, 0.015, Math.sin(a) * 0.32], 0.018);
    }
    k.cyl('base', p.frame, 0.03, 0.035, sy - 0.14, 0, 0.02, 0, { segs: k.seg(16, 6) });
    k.soft('shell', p.fabric, 0.78, 0.18, 0.74, 0.06, 0, sy - 0.04, 0, { puff: 0.01 });
    k.soft('shell', p.fabric, 0.78, 0.5, 0.16, 0.06, 0, sy + 0.25, -0.31, { rx: -0.12, puff: 0.012 });
    for (const s of [-1, 1]) k.soft('shell', p.fabric, 0.14, 0.24, 0.6, 0.05, s * 0.32, sy + 0.17, 0.02, { puff: 0.01 });
    k.soft('cushion', p.fabric, 0.5, 0.1, 0.56, 0.04, 0, sy + 0.09, 0.06, { puff: 0.018 });
    if (p.tablet) {
      k.rod('frame', 'metal-black', [0.38, sy + 0.2, 0.15], [0.42, sy + 0.32, 0.25], 0.012);
      k.slab('tablet', p.tabletMat, roundRect(0.34, 0.26, 0.08), 0.018, sy + 0.32, { x: 0.36, z: 0.3 });
    }
    return finish(k);
  },
});

const pouf = w$({
  id: 'wp-pouf', ko: '협업 공간 모듈 스툴 (푸프)', en: 'Breakout pouf stool',
  params: [P.len('size', '지름', 'Diameter', 0.5, 0.35, 0.8), P.len('height', '높이', 'Height', 0.45, 0.3, 0.5), P.mat('fabric', '천', 'Fabric', 'fabric-terracotta', FABRIC), P.pick('shape', '형태', 'Shape', 'round', [['round', '원형', 'Round'], ['cube', '정육면체', 'Cube']])],
  tags: ['pouf', 'stool', 'breakout', 'ottoman', '푸프', '스툴', '휴게실', '오토만'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, h = p.height;
    if (p.shape === 'cube') k.soft('fabric', p.fabric, s, h, s, 0.05, 0, h / 2, 0, { puff: 0.02 });
    else {
      k.lathe('fabric', p.fabric, [[0, 0], [s * 0.46, 0], [s * 0.5, 0.03], [s * 0.5, h - 0.04], [s * 0.47, h - 0.005], [0, h]], 0, 0, 0, { smooth: 10, segs: k.seg(32, 10) });
      k.cyl('trim', 'plastic-black', s * 0.47, s * 0.47, 0.012, 0, 0, 0, { segs: k.seg(28, 10) });
    }
    return finish(k);
  },
});

/* ---------------------------------------------------- conference tables */

const CONF_PARAMS = (w, wr, d, dr, top = 'wood-oak', frame = 'metal-black') => [
  P.len('width', '길이', 'Length', w, wr[0], wr[1]), P.len('depth', '폭', 'Width', d, dr[0], dr[1]),
  P.mat('top', '상판', 'Top', top, TOP), P.mat('frame', '다리', 'Base', frame, FRAME_OPTS), P.bool('power', '전원 박스', 'Power boxes', true),
];
function powerBoxes(k, p, n, w, h) {
  if (!p.power) return;
  for (let i = 0; i < n; i++) k.box('power', 'metal-aluminium', 0.28, 0.006, 0.12, -w / 2 + (w * (i + 0.5)) / n, h + 0.003, 0, { r: 0.002 });
}
const conf6 = w$({
  id: 'wp-conf-6', ko: '6인 회의 테이블', en: '6-seat conference table', params: CONF_PARAMS(2.0, [1.6, 2.4], 1.0, [0.9, 1.2]),
  tags: ['conference table', 'meeting table', '6 seat', '회의 테이블', '회의실', '6인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = 0.74, t = 0.03;
    k.slab('top', p.top, roundRect(p.width, p.depth, 0.04), t, h - t);
    deskLegs(k, 'post', p.frame, p.width, p.depth, h - t, { inset: 0.12 });
    k.box('frame', p.frame, p.width - 0.3, 0.06, 0.04, 0, h - t - 0.04, 0, { r: 0.003 });
    powerBoxes(k, p, 1, p.width, h);
    return finish(k);
  },
});
const conf10 = w$({
  id: 'wp-conf-10', ko: '10인 회의 테이블 (패널 다리)', en: '10-seat conference table (panel legs)', params: CONF_PARAMS(3.6, [3.0, 4.2], 1.2, [1.0, 1.4], 'wood-walnut', 'wood-walnut'),
  tags: ['conference table', 'boardroom table', '10 seat', '회의 테이블', '대회의실', '10인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = 0.74, t = 0.04, w = p.width, d = p.depth;
    k.slab('top', p.top, roundRect(w, d, 0.02), t, h - t);
    for (const s of [-1, 1]) {
      k.box('frame', p.frame, 0.06, h - t, d - 0.4, s * (w / 2 - 0.45), (h - t) / 2, 0, { r: 0.004 });
      k.box('frame', p.frame, 0.12, 0.02, d - 0.36, s * (w / 2 - 0.45), 0.01, 0, { r: 0.004 });
    }
    k.box('frame', p.frame, w - 0.96, 0.3, 0.04, 0, h - t - 0.2, 0, { r: 0.003 });
    powerBoxes(k, p, 3, w, h);
    return finish(k);
  },
});
const conf16 = w$({
  id: 'wp-conf-16', ko: '16인 대형 회의 테이블 (모듈 3분할)', en: '16-seat boardroom table (3 modules)', params: CONF_PARAMS(5.6, [4.8, 6.4], 1.4, [1.2, 1.6], 'wood-oak', 'metal-aluminium'),
  tags: ['boardroom table', 'conference table', '16 seat', 'large meeting', '대형 회의 테이블', '이사회', '16인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = 0.74, t = 0.035, w = p.width, d = p.depth, mw = w / 3;
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + mw * (i + 0.5);
      k.box('top', p.top, mw - 0.004, t, d, x, h - t / 2, 0, { r: 0.004 });
    }
    for (let i = 0; i < 4; i++) {
      const x = clamp(-w / 2 + mw * i, -w / 2 + 0.3, w / 2 - 0.3);
      k.cyl('frame', p.frame, 0.07, 0.07, h - t, x, 0, 0, { segs: k.seg(20, 8) });
      k.box('frame', p.frame, 0.12, 0.02, d - 0.4, x, 0.01, 0, { r: 0.005 });
      k.box('frame', p.frame, 0.08, 0.04, d - 0.3, x, h - t - 0.02, 0, { r: 0.004 });
    }
    k.box('frame', p.frame, w - 0.6, 0.05, 0.08, 0, h - t - 0.05, 0, { r: 0.004 });
    powerBoxes(k, p, 4, w, h);
    return finish(k);
  },
});
function boatShape(W, D, De, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const x = -W / 2 + (W * i) / n, u = (2 * x) / W; pts.push(new THREE.Vector2(x, De / 2 + ((D - De) / 2) * (1 - u * u))); }
  for (let i = n; i >= 0; i--) { const x = -W / 2 + (W * i) / n, u = (2 * x) / W; pts.push(new THREE.Vector2(x, -(De / 2 + ((D - De) / 2) * (1 - u * u)))); }
  return new THREE.Shape(pts);
}
const confBoat = w$({
  id: 'wp-conf-boat', ko: '보트형 회의 테이블 (12인)', en: 'Boat-shaped conference table (12 seat)',
  params: [...CONF_PARAMS(4.2, [3.0, 5.0], 1.4, [1.1, 1.6], 'wood-walnut', 'metal-black'), P.len('endDepth', '끝 폭', 'End width', 0.9, 0.7, 1.1)],
  tags: ['boat shaped table', 'conference table', 'boardroom', '12 seat', '보트형 테이블', '회의 테이블', '12인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = 0.74, t = 0.04, w = p.width;
    k.slab('top', p.top, boatShape(w, p.depth, Math.min(p.endDepth, p.depth - 0.05)), t, h - t, { bevel: 0.006 });
    for (const x of [-w * 0.3, 0, w * 0.3]) {
      k.cyl('frame', p.frame, 0.09, 0.11, h - t, x, 0, 0, { segs: k.seg(20, 8) });
      k.cyl('frame', p.frame, 0.3, 0.3, 0.02, x, 0, 0, { segs: k.seg(28, 10) });
    }
    powerBoxes(k, p, 2, w * 0.6, h);
    return finish(k);
  },
});
const confRound = w$({
  id: 'wp-conf-round', ko: '원형 미팅 테이블 (4인)', en: 'Round meeting table (4 seat)',
  params: [P.len('diameter', '지름', 'Diameter', 1.2, 0.9, 1.5), P.mat('top', '상판', 'Top', 'wood-white', TOP), P.mat('frame', '받침', 'Base', 'metal-white', FRAME_OPTS)],
  tags: ['round table', 'meeting table', 'small meeting', '원형 테이블', '미팅 테이블', '4인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const h = 0.74, t = 0.025;
    k.slab('top', p.top, ellipse(p.diameter, p.diameter), t, h - t);
    k.cyl('frame', p.frame, 0.04, 0.05, h - t, 0, 0, 0, { segs: k.seg(16, 6) });
    for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; k.box('frame', p.frame, 0.6, 0.03, 0.06, Math.cos(a) * 0.3, 0.015, Math.sin(a) * 0.3, { r: 0.006, ry: -a }); }
    k.box('frame', p.frame, 0.5, 0.025, 0.05, 0, h - t - 0.012, 0, { r: 0.004 });
    return finish(k);
  },
});

const highTable = w$({
  id: 'wp-high-table', ko: '스탠딩 하이 테이블', en: 'High standing table',
  params: [P.len('width', '길이', 'Length', 2.0, 1.2, 3.2), P.len('depth', '폭', 'Width', 0.9, 0.7, 1.2), P.len('height', '높이', 'Height', 1.05, 0.9, 1.1), P.mat('top', '상판', 'Top', 'wood-oak', TOP), P.mat('frame', '다리', 'Legs', 'metal-black', FRAME_OPTS)],
  tags: ['high table', 'standing table', 'poseur table', 'bar table', '하이 테이블', '스탠딩 테이블', '바 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p, t = 0.03;
    k.slab('top', p.top, roundRect(w, d, 0.03), t, h - t);
    deskLegs(k, 'trestle', p.frame, w, d, h - t);
    for (const s of [-1, 1]) k.rod('frame', p.frame, [-w / 2 + 0.12, 0.28, s * (d / 2 - 0.1)], [w / 2 - 0.12, 0.28, s * (d / 2 - 0.1)], 0.012);
    for (const s of [-1, 1]) k.box('frame', p.frame, 0.03, 0.03, d - 0.2, s * (w / 2 - 0.12), 0.28, 0, { r: 0.004 });
    return finish(k);
  },
});

const trainingTable = w$({
  id: 'wp-training-table', ko: '접이식 교육 테이블 (플립탑)', en: 'Flip-top training table',
  params: [P.len('width', '폭', 'Width', 1.4, 1.0, 1.8), P.len('depth', '깊이', 'Depth', 0.6, 0.5, 0.75), P.num('flip', '상판 접힘(°)', 'Top flipped (°)', 0, 0, 90, 1), P.mat('top', '상판', 'Top', 'wood-white', TOP), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', FRAME_OPTS), P.bool('modesty', '가림판', 'Modesty panel', true)],
  tags: ['training table', 'flip top table', 'folding table', 'seminar table', '교육 테이블', '접이식 테이블', '세미나 테이블', '플립탑'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth, h = 0.74, t = 0.025, a = (p.flip * PI) / 180;
    k.box('top', p.top, w, t, d, 0, h - t / 2 + Math.sin(a) * 0.0, 0, { r: 0.003, rx: -a });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.1);
      k.box('frame', p.frame, 0.05, h - t - 0.1, 0.05, x, 0.07 + (h - t - 0.1) / 2, 0, { r: 0.004 });
      k.box('frame', p.frame, 0.06, 0.04, d - 0.06, x, 0.07, 0, { r: 0.006, segs: 2 });
      for (const z of [-1, 1]) k.cyl('casters', 'plastic-black', 0.03, 0.03, 0.03, x - 0.015, 0.03, z * (d / 2 - 0.07), { rz: PI / 2, segs: k.seg(14, 6) });
      for (const z of [-1, 1]) k.box('casters', 'plastic-black', 0.03, 0.03, 0.03, x, 0.06, z * (d / 2 - 0.07), { r: 0.005 });
      k.cyl('frame', p.frame, 0.02, 0.02, 0.05, x - s * 0.02, h - t - 0.05, 0, { rz: PI / 2, segs: k.seg(12, 6) });
    }
    k.box('frame', p.frame, w - 0.24, 0.04, 0.03, 0, h - t - 0.05, 0, { r: 0.004 });
    if (p.modesty) k.box('panel', 'plastic-grey', w - 0.26, 0.28, 0.01, 0, h - t - 0.24, -d / 2 + 0.06, { r: 0.002 });
    return finish(k);
  },
});

/* ------------------------------------------------------ reception / waiting */

const reception = w$({
  id: 'wp-reception', ko: '안내 데스크 (리셉션 카운터)', en: 'Reception counter',
  params: [
    P.len('width', '폭', 'Width', 2.4, 1.6, 3.6), P.mat('front', '전면', 'Front', 'wall-wood-panel', 'wall'),
    P.mat('top', '상판', 'Ledge', 'quartz-white', 'stone'), P.mat('desk', '안쪽 책상', 'Work top', 'wood-white', TOP), P.bool('led', 'LED 조명', 'LED strip', true),
  ],
  tags: ['reception desk', 'front desk', 'counter', 'lobby', '안내 데스크', '리셉션', '로비 카운터', '프런트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, H = 1.1, side = 0.8, t = 0.05;
    k.box('front', p.front, w, H - 0.08, t, 0, 0.08 + (H - 0.08) / 2, 0.36, { r: 0.004 });
    k.box('plinth', 'paint-black-matte', w - 0.04, 0.08, t, 0, 0.04, 0.34, { r: 0.002 });
    for (const s of [-1, 1]) k.box('front', p.front, t, H - 0.08, side, s * (w / 2 - t / 2), 0.08 + (H - 0.08) / 2, 0.36 - side / 2 + t / 2, { r: 0.004 });
    k.box('ledge', p.top, w + 0.04, 0.03, 0.34, 0, H + 0.015, 0.4, { r: 0.004 });
    k.box('desk', p.desk, w - 0.12, 0.03, 0.62, 0, 0.74, 0.0, { r: 0.003 });
    k.box('desk', p.desk, 0.03, 0.73, 0.6, 0, 0.365, 0.0, { r: 0.002 });
    if (p.led) {
      k.box('led', 'light-warm', w - 0.06, 0.012, 0.012, 0, 0.09, 0.39, { r: 0 });
      k.light(0, 0.1, 0.45, { color: '#ffe0b0', intensity: 0.4, distance: 2 });
    }
    // monitor on the work top
    k.box('device', 'screen-black', 0.55, 0.33, 0.02, -w * 0.2, 0.74 + 0.03 + 0.12 + 0.165, -0.05, { r: 0.004 });
    k.box('device', 'plastic-black', 0.04, 0.14, 0.04, -w * 0.2, 0.74 + 0.03 + 0.07, -0.07, { r: 0.004 });
    k.box('device', 'plastic-black', 0.2, 0.01, 0.16, -w * 0.2, 0.775, -0.06, { r: 0.002 });
    return finish(k);
  },
});

const waitingSofa = w$({
  id: 'wp-waiting-sofa', ko: '로비 대기 소파 (3인)', en: 'Lobby waiting sofa (3 seat)',
  params: [P.int('seats', '좌석 수', 'Seats', 3, 2, 5), P.mat('fabric', '천', 'Upholstery', 'leather-black', 'leather'), P.mat('frame', '다리', 'Legs', 'metal-chrome', FRAME_OPTS)],
  tags: ['waiting sofa', 'lobby sofa', 'reception seating', '대기 소파', '로비 소파', '대기실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.seats), sw = 0.62, aw = 0.1, W = n * sw + 2 * aw, d = 0.72, ly = 0.14;
    k.soft('body', p.fabric, W, 0.2, d, 0.03, 0, ly + 0.1, 0, { puff: 0.004 });
    for (let i = 0; i < n; i++) k.soft('cushion', p.fabric, sw - 0.01, 0.1, d - 0.2, 0.03, -W / 2 + aw + sw * (i + 0.5), ly + 0.25, 0.08, { puff: 0.012 });
    k.soft('body', p.fabric, W, 0.42, 0.18, 0.03, 0, ly + 0.41, -d / 2 + 0.09, { puff: 0.006 });
    for (const s of [-1, 1]) k.soft('body', p.fabric, aw, 0.42, d, 0.03, s * (W / 2 - aw / 2), ly + 0.21, 0, { puff: 0.004 });
    for (const sx of [-1, 1]) k.bentTube('frame', p.frame, [[sx * (W / 2 - 0.06), ly, -d / 2 + 0.06], [sx * (W / 2 - 0.06), 0.01, -d / 2 + 0.06], [sx * (W / 2 - 0.06), 0.01, d / 2 - 0.06], [sx * (W / 2 - 0.06), ly, d / 2 - 0.06]], 0.012, 0.03);
    return finish(k);
  },
});

const beamBench = w$({
  id: 'wp-beam-seating', ko: '빔 체어 (로비 연결 의자)', en: 'Beam seating (linked lobby chairs)',
  params: [P.int('seats', '좌석 수', 'Seats', 3, 2, 5), P.mat('shell', '좌석', 'Seats', 'metal-aluminium', FRAME_OPTS), P.mat('frame', '빔', 'Beam', 'metal-black', FRAME_OPTS), P.bool('pads', '쿠션 패드', 'Seat pads', true), P.mat('pad', '패드', 'Pad', 'leather-black', 'leather')],
  tags: ['beam seating', 'airport seating', 'waiting chairs', 'lobby', '빔 체어', '대기 의자', '연결 의자', '로비'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.seats), sw = 0.6, W = n * sw, sy = 0.45;
    k.box('frame', p.frame, W, 0.06, 0.08, 0, sy - 0.1, 0, { r: 0.008 });
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.25);
      k.box('frame', p.frame, 0.07, sy - 0.13, 0.07, x, (sy - 0.13) / 2, 0, { r: 0.004 });
      k.box('frame', p.frame, 0.08, 0.03, 0.6, x, 0.015, 0, { r: 0.006, segs: 2 });
    }
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + sw * (i + 0.5);
      k.rbox('shell', p.shell, sw - 0.06, 0.02, 0.48, 0.008, x, sy, 0.04);
      k.rbox('shell', p.shell, sw - 0.06, 0.4, 0.02, 0.008, x, sy + 0.22, -0.22, { rx: -0.15 });
      k.box('frame', p.frame, 0.06, 0.05, 0.4, x, sy - 0.05, 0.0, { r: 0.004 });
      if (p.pads) k.soft('pad', p.pad, sw - 0.1, 0.035, 0.42, 0.015, x, sy + 0.025, 0.05, { puff: 0.006 });
    }
    for (let i = 0; i <= n; i++) {
      const x = -W / 2 + sw * i;
      k.box('frame', p.frame, 0.035, 0.03, 0.42, x, sy + 0.2, 0.02, { r: 0.008 });
      k.box('frame', p.frame, 0.03, 0.2, 0.03, x, sy + 0.1, -0.08, { r: 0.004 });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------- storage */

const mobilePed = w$({
  id: 'wp-pedestal', ko: '이동식 서랍장 (3단)', en: 'Mobile pedestal (3 drawers)',
  params: [P.mat('body', '몸체', 'Body', 'paint-white-matte'), P.mat('front', '서랍 전면', 'Fronts', 'wood-oak', TOP), P.pick('handle', '손잡이', 'Handle', 'edge', [['edge', '엣지', 'Edge pull'], ['bar', '바', 'Bar'], ['none', '없음(푸시)', 'None (push)']]), P.bool('cushion', '방석 상판', 'Seat cushion top', false), P.mat('cushionMat', '방석 천', 'Cushion fabric', 'fabric-mustard', FABRIC)],
  tags: ['pedestal', 'mobile drawer', 'under desk drawer', '이동식 서랍', '서랍장', '책상 서랍'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    pedestal(k, { mat: p.body, front: p.front, handle: p.handle, h: 0.6 });
    if (p.cushion) k.soft('cushion', p.cushionMat, 0.42, 0.06, 0.55, 0.02, 0, 0.63, 0, { puff: 0.01 });
    return finish(k);
  },
});

const filingTall = w$({
  id: 'wp-filing-tall', ko: '4단 파일 캐비닛 (철제)', en: '4-drawer steel filing cabinet',
  params: [P.int('drawers', '서랍 수', 'Drawers', 4, 2, 5), P.mat('body', '색', 'Finish', 'metal-white'), P.pick('handle', '손잡이', 'Handle', 'bar', [['bar', '바', 'Bar'], ['edge', '엣지', 'Edge pull']])],
  tags: ['filing cabinet', 'file drawer', 'steel cabinet', '파일 캐비닛', '서류함', '철제 캐비닛'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.drawers), h = 0.34 * n + 0.05;
    addCabinet(k, { w: 0.47, h, d: 0.62, rows: Array.from({ length: n }, () => ({ h: 1 / n, n: 1, type: 'drawer' })), body: p.body, front: p.body, base: 'plinth', plinth: 0.05, handle: p.handle, handleMat: 'metal-chrome' });
    k.cyl('lock', 'metal-chrome', 0.012, 0.012, 0.01, 0.17, h - 0.05, 0.31, { rx: PI / 2, segs: k.seg(12, 6) });
    for (let i = 0; i < n; i++) k.box('label', 'paper', 0.08, 0.03, 0.002, 0, 0.05 + ((h - 0.05) * (i + 0.5)) / n + 0.08, 0.311, { r: 0 });
    return finish(k);
  },
});

const lateral = w$({
  id: 'wp-lateral-filing', ko: '가로형 서류함 (낮은 수납장)', en: 'Lateral filing cabinet (low)',
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 1.6), P.int('drawers', '서랍 단', 'Drawer rows', 2, 2, 3), P.mat('body', '색', 'Finish', 'metal-white'), P.mat('top', '상판', 'Top', 'wood-oak', TOP)],
  tags: ['lateral file', 'filing cabinet', 'low storage', 'credenza', '가로형 서류함', '낮은 수납장', '파일 캐비닛'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.drawers);
    addCabinet(k, { w: p.width, h: 0.36 * n + 0.08, d: 0.5, rows: Array.from({ length: n }, () => ({ h: 1 / n, n: 1, type: 'drawer' })), body: p.body, front: p.body, base: 'plinth', plinth: 0.05, top: p.top, topThick: 0.025, handle: 'bar', handleMat: 'metal-aluminium' });
    return finish(k);
  },
});

const lockers = w$({
  id: 'wp-lockers', ko: '개인 사물함 (락커)', en: 'Personal lockers',
  params: [P.int('cols', '열', 'Columns', 4, 1, 6), P.int('rows', '단', 'Rows', 3, 1, 6), P.len('height', '높이', 'Height', 1.8, 0.9, 2.0), P.mat('body', '몸체', 'Body', 'metal-white'), P.mat('front', '문', 'Doors', 'paint-grey-matte')],
  tags: ['lockers', 'personal locker', 'staff locker', 'cabinet', '사물함', '락커', '개인 보관함', '직원 사물함'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = Math.round(p.cols), r = Math.round(p.rows), cw = 0.38, w = c * cw, h = p.height;
    addCabinet(k, { w, h, d: 0.5, rows: Array.from({ length: r }, () => ({ h: 1 / r, n: c, type: 'door' })), body: p.body, front: p.front, base: 'plinth', plinth: 0.08, handle: 'none' });
    const bh = (h - 0.08) / r;
    for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      const x = -w / 2 + cw * (i + 0.5), y = 0.08 + bh * (j + 0.5);
      k.cyl('locks', 'metal-chrome', 0.014, 0.014, 0.012, x + cw / 2 - 0.05, y, 0.25, { rx: PI / 2, segs: k.seg(10, 6) });
      for (let v = 0; v < 3; v++) k.box('vents', 'paint-black-matte', cw * 0.45, 0.006, 0.002, x, y + Math.min(bh * 0.4, 0.25) - v * 0.018, 0.251, { r: 0 });
    }
    return finish(k);
  },
});

const shelfDivider = w$({
  id: 'wp-shelf-divider', ko: '오픈 선반 공간 분리대', en: 'Open shelving room divider',
  params: [P.int('cols', '칸 (가로)', 'Columns', 4, 2, 6), P.int('rows', '칸 (세로)', 'Rows', 4, 2, 5), P.mat('wood', '선반', 'Shelves', 'plywood', TOP), P.mat('frame', '프레임', 'Frame', 'metal-black', FRAME_OPTS), P.bool('backs', '일부 뒷판', 'Some back panels', true), P.mat('backMat', '뒷판', 'Back panels', 'paint-green-matte')],
  tags: ['room divider', 'open shelving', 'bookcase', 'space divider', '공간 분리대', '오픈 선반', '파티션 책장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = Math.round(p.cols), r = Math.round(p.rows), cw = 0.4, rh = 0.38, d = 0.4, W = c * cw, H = r * rh + 0.06;
    for (let j = 0; j <= r; j++) k.box('shelf', p.wood, W, 0.022, d, 0, 0.06 + j * rh, 0, { r: 0.003 });
    for (let i = 0; i <= c; i++) k.box('frame', p.frame, 0.025, H + 0.02, 0.025, -W / 2 + i * cw, (H + 0.02) / 2, d / 2 - 0.015, { r: 0.003 });
    for (let i = 0; i <= c; i++) k.box('frame', p.frame, 0.025, H + 0.02, 0.025, -W / 2 + i * cw, (H + 0.02) / 2, -d / 2 + 0.015, { r: 0.003 });
    for (let i = 1; i < c; i++) for (let j = 0; j < r; j++) if ((i + j) % 2) k.box('shelf', p.wood, 0.018, rh - 0.022, d, -W / 2 + i * cw, 0.06 + j * rh + rh / 2, 0, { r: 0.002 });
    if (p.backs) for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) if ((i * 3 + j) % 4 === 0) k.box('back', p.backMat, cw - 0.03, rh - 0.03, 0.012, -W / 2 + cw * (i + 0.5), 0.06 + j * rh + rh / 2, 0, { r: 0.002 });
    return finish(k);
  },
});

const tambour = w$({
  id: 'wp-tambour', ko: '셔터문 수납장 (탬버)', en: 'Tambour door storage cabinet',
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 1.6), P.len('height', '높이', 'Height', 1.2, 0.8, 2.0), P.mat('body', '몸체', 'Body', 'metal-white'), P.mat('slats', '셔터', 'Shutters', 'paint-grey-matte'), P.num('open', '열림 정도', 'Open ratio', 0.3, 0, 1, 0.05)],
  tags: ['tambour cabinet', 'roller shutter', 'office storage', '셔터 수납장', '탬버 도어', '사무실 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height, d = 0.45, t = 0.02;
    k.box('body', p.body, t, h, d, -w / 2 + t / 2, h / 2, 0, { r: 0.002 });
    k.box('body', p.body, t, h, d, w / 2 - t / 2, h / 2, 0, { r: 0.002 });
    k.box('body', p.body, w, t, d, 0, h - t / 2, 0, { r: 0.002 });
    k.box('body', p.body, w - 2 * t, 0.05, d, 0, 0.025, 0, { r: 0.002 });
    k.box('body', p.body, w - 2 * t, h - 0.05 - t, 0.01, 0, 0.05 + (h - 0.05 - t) / 2, -d / 2 + 0.005, { r: 0 });
    const n = Math.max(1, Math.round((h - 0.4) / 0.36));
    for (let i = 1; i <= n; i++) k.box('body', p.body, w - 2 * t, 0.018, d - 0.04, 0, 0.05 + ((h - 0.05 - t) * i) / (n + 1), -0.01, { r: 0.002 });
    // two sliding tambours meeting in the middle; `open` slides them to the sides
    const half = (w - 2 * t) / 2, slat = 0.03, open = clamp(p.open, 0, 1) * (half - 0.06);
    for (const s of [-1, 1]) {
      const cw = half - open, x0 = s * open + s * cw / 2 + 0;
      const m = Math.max(1, Math.round(cw / slat));
      for (let i = 0; i < m; i++) k.box('slats', p.slats, slat - 0.003, h - 0.07 - t, 0.012, s * (open + slat * (i + 0.5)) + (s < 0 ? 0 : 0), 0.05 + (h - 0.05 - t) / 2, d / 2 - 0.008, { r: 0.002 });
      void x0;
      k.box('handles', 'metal-aluminium', 0.02, 0.3, 0.02, s * (open + 0.012), h / 2, d / 2 + 0.006, { r: 0.004 });
    }
    return finish(k);
  },
});

const mailSorter = w$({
  id: 'wp-mail-sorter', ko: '우편함 분류대 (칸막이 선반)', en: 'Mail sorter pigeonhole unit',
  params: [P.int('cols', '열', 'Columns', 6, 3, 8), P.int('rows', '단', 'Rows', 4, 2, 6), P.mat('wood', '나무', 'Wood', 'wood-white', TOP)],
  tags: ['mail sorter', 'pigeonhole', 'mailbox', 'cubby', '우편함', '분류함', '칸막이 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = Math.round(p.cols), r = Math.round(p.rows), cw = 0.25, rh = 0.12, d = 0.33, W = c * cw, H = r * rh;
    addCabinet(k, { w: W + 0.02, h: 0.85, d: d + 0.05, rows: [{ h: 1, n: Math.max(2, Math.round(c / 2)), type: 'door' }], body: p.wood, front: p.wood, base: 'plinth', plinth: 0.06, top: 'wood-oak', topThick: 0.025, handle: 'knob', handleMat: 'metal-chrome' });
    const y0 = 0.875;
    k.box('frame', p.wood, W + 0.02, H + 0.02, 0.012, 0, y0 + H / 2, -d / 2 + 0.006, { r: 0 });
    for (let j = 0; j <= r; j++) k.box('frame', p.wood, W + 0.02, 0.012, d, 0, y0 + j * rh + 0.006, 0, { r: 0.001 });
    for (let i = 0; i <= c; i++) k.box('frame', p.wood, 0.012, H, d, -W / 2 + i * cw, y0 + H / 2, 0, { r: 0.001 });
    for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) if ((i + 2 * j) % 3 === 0) k.box('papers', 'paper', cw - 0.04, 0.02, d - 0.06, -W / 2 + cw * (i + 0.5), y0 + j * rh + 0.023, 0.01, { r: 0 });
    return finish(k);
  },
});

/* ----------------------------------------------------- booths / pods */

const phoneBooth = w$({
  id: 'wp-phone-booth', ko: '1인 폰부스 (방음 부스)', en: 'Office phone booth (1 person)',
  params: [P.mat('shell', '외장', 'Shell', 'wood-oak', TOP), P.mat('felt', '내부 흡음재', 'Acoustic felt', 'fabric-wool-charcoal', FABRIC), P.mat('frame', '문틀', 'Door frame', 'metal-black', FRAME_OPTS), P.num('open', '문 열림(°)', 'Door open (°)', 0, 0, 90, 1)],
  tags: ['phone booth', 'acoustic booth', 'call pod', 'soundproof', '폰부스', '방음 부스', '통화 부스', '포커스 룸'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 1.0, D = 1.0, H = 2.2, t = 0.06;
    k.box('shell', p.shell, W, H, t, 0, H / 2, -D / 2 + t / 2, { r: 0.006 });
    for (const s of [-1, 1]) k.box('shell', p.shell, t, H, D, s * (W / 2 - t / 2), H / 2, 0, { r: 0.006 });
    k.box('shell', p.shell, W, 0.08, D, 0, H - 0.04, 0, { r: 0.008 });
    k.box('shell', p.shell, W, 0.05, D, 0, 0.025, 0, { r: 0.004 });
    k.box('felt', p.felt, W - 2 * t, H - 0.25, 0.02, 0, 0.05 + (H - 0.25) / 2 + 0.05, -D / 2 + t + 0.01, { r: 0.004 });
    for (const s of [-1, 1]) k.box('felt', p.felt, 0.02, H - 0.25, D - t - 0.08, s * (W / 2 - t - 0.01), 0.1 + (H - 0.25) / 2, 0.0, { r: 0.004 });
    // desk shelf + ceiling light
    k.box('shelf', p.shell, W - 2 * t - 0.04, 0.03, 0.35, 0, 1.05, -D / 2 + t + 0.2, { r: 0.004 });
    k.box('led', 'light-warm', 0.5, 0.01, 0.5, 0, H - 0.085, 0, { r: 0 });
    k.light(0, H - 0.12, 0, { color: '#ffe8c8', intensity: 0.6, distance: 2.5 });
    // glass door hinged on the right
    const a = (p.open * PI) / 180, dw = W - 0.02, dh = H - 0.15, hx = W / 2 - 0.01, dz = D / 2 - 0.02;
    const cx = hx - Math.cos(a) * dw / 2, cz = dz + Math.sin(a) * dw / 2;
    k.panel('frame', p.frame, frameShape(dw, dh, 0.04), 0.04, cx, 0.05 + dh / 2, cz, { ry: a });
    k.box('glass', 'glass-clear', dw - 0.07, dh - 0.07, 0.01, cx, 0.05 + dh / 2, cz, { r: 0, ry: a });
    const hxp = hx - Math.cos(a) * (dw - 0.08), hzp = dz + Math.sin(a) * (dw - 0.08);
    k.box('frame', p.frame, 0.02, 0.4, 0.04, hxp, 1.05, hzp + 0.04, { r: 0.005, ry: a });
    return finish(k);
  },
});

const focusPod = w$({
  id: 'wp-focus-pod', ko: '2인 미팅 포드 (하이백 부스)', en: 'Focus pod (2-person high-back booth)',
  params: [P.mat('fabric', '천', 'Upholstery', 'fabric-velvet-blue', FABRIC), P.mat('shell', '외장', 'Shell', 'wood-white', TOP), P.mat('table', '테이블', 'Table', 'wood-oak', TOP), P.bool('roof', '지붕', 'Roof', true)],
  tags: ['focus pod', 'meeting pod', 'booth', 'high back sofa', '미팅 포드', '부스', '하이백 소파', '집중 공간'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = 1.4, D = 1.9, H = 1.45, t = 0.05;
    for (const s of [-1, 1]) {
      const z = s * (D / 2 - 0.3);
      k.box('shell', p.shell, W, H, t, 0, H / 2, s * (D / 2 - t / 2), { r: 0.008 });
      k.soft('seat', p.fabric, W - 0.1, 0.12, 0.5, 0.03, 0, 0.42, z + s * 0.03, { puff: 0.012 });
      k.box('shell', p.shell, W - 0.1, 0.36, 0.5, 0, 0.18, z + s * 0.03, { r: 0.004 });
      k.soft('seat', p.fabric, W - 0.1, 0.8, 0.1, 0.03, 0, 0.9, s * (D / 2 - t - 0.06), { puff: 0.012, rx: s * 0.06 });
    }
    k.box('shell', p.shell, t, H, D, -W / 2 + t / 2, H / 2, 0, { r: 0.008 });
    if (p.roof) k.box('shell', p.shell, W, 0.04, D, 0, H + 0.02, 0, { r: 0.006 });
    k.box('table', p.table, 0.8, 0.03, 0.6, -0.15, 0.73, 0, { r: 0.004 });
    k.box('table', 'metal-black', 0.04, 0.72, 0.04, 0.15, 0.36, 0, { r: 0.004 });
    k.box('table', 'metal-black', 0.3, 0.02, 0.04, 0.0, 0.71, 0, { r: 0.004 });
    return finish(k);
  },
});

/* ----------------------------------------------------- presentation */

const lectern = w$({
  id: 'wp-lectern', ko: '강연대 (마이크)', en: 'Lectern with microphone',
  params: [P.mat('body', '몸체', 'Body', 'wood-walnut', TOP), P.mat('panel', '전면 패널', 'Front panel', 'metal-aluminium'), P.bool('mic', '마이크', 'Microphone', true)],
  tags: ['lectern', 'podium', 'speaker stand', 'presentation', '강연대', '연설대', '단상', '발표대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, d = 0.5, h = 1.1;
    k.box('body', p.body, w, 0.04, d + 0.04, 0, 0.02, 0, { r: 0.006 });
    const body = new THREE.Shape([new THREE.Vector2(-w * 0.38, 0), new THREE.Vector2(w * 0.38, 0), new THREE.Vector2(w / 2, h - 0.12), new THREE.Vector2(-w / 2, h - 0.12)]);
    k.panel('body', p.body, body, d - 0.08, 0, 0.04, 0, { bevel: 0.006 });
    k.box('top', p.body, w + 0.04, 0.03, d - 0.02, 0, h - 0.05, 0.01, { r: 0.004, rx: 0.22 });
    k.box('panel', p.panel, w * 0.62, 0.5, 0.008, 0, 0.55, (d - 0.08) / 2 + 0.004, { r: 0.002 });
    if (p.mic) {
      k.tube('mic', 'metal-black', [[0.18, h - 0.02, -0.12], [0.18, h + 0.1, -0.05], [0.13, h + 0.18, 0.06]], 0.005);
      k.cyl('mic', 'metal-black', 0.012, 0.009, 0.06, 0.13, h + 0.18, 0.06, { rx: 1.2, segs: k.seg(12, 6) });
    }
    return finish(k);
  },
});

const whiteboard = w$({
  id: 'wp-whiteboard-mobile', ko: '이동식 화이트보드 (양면)', en: 'Mobile whiteboard (double sided)',
  params: [P.len('width', '폭', 'Width', 1.5, 0.9, 2.0), P.len('boardH', '보드 높이', 'Board height', 1.0, 0.7, 1.2), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', FRAME_OPTS), P.num('tilt', '기울기(°)', 'Tilt (°)', 0, -30, 30, 1)],
  tags: ['whiteboard', 'mobile whiteboard', 'marker board', 'flipboard', '화이트보드', '이동식 칠판', '보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, bh = p.boardH, cy = 0.95 + bh / 2 - 0.3, a = (p.tilt * PI) / 180;
    k.panel('frame', p.frame, frameShape(w, bh, 0.025), 0.035, 0, cy, 0, { rx: a });
    k.box('board', 'paint-white-gloss', w - 0.04, bh - 0.04, 0.025, 0, cy, 0, { r: 0, rx: a });
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.03);
      k.box('frame', p.frame, 0.035, cy + bh / 2 + 0.05 - 0.06, 0.035, x, 0.06 + (cy + bh / 2 - 0.01) / 2, 0, { r: 0.004 });
      k.box('frame', p.frame, 0.04, 0.035, 0.6, x, 0.07, 0, { r: 0.006 });
      for (const z of [-1, 1]) k.cyl('casters', 'plastic-black', 0.025, 0.025, 0.03, x - 0.015, 0.025, z * 0.27, { rz: PI / 2, segs: k.seg(12, 6) });
      k.cyl('frame', p.frame, 0.02, 0.02, 0.03, x - s * 0.025, cy, 0, { rz: PI / 2, segs: k.seg(12, 6) });
    }
    k.box('frame', p.frame, w - 0.2, 0.025, 0.07, 0, cy - bh / 2 * Math.cos(a) - 0.02, Math.sin(a) * bh / 2 + 0.04, { r: 0.004 });
    for (let i = 0; i < 3; i++) k.cyl('markers', ['plastic-black', 'plastic-grey', 'plastic-white'][i], 0.008, 0.008, 0.13, -0.15 + i * 0.05, cy - bh / 2 * Math.cos(a) - 0.0, Math.sin(a) * bh / 2 + 0.05, { rz: PI / 2, segs: 8 });
    return finish(k);
  },
});

const videoCart = w$({
  id: 'wp-video-cart', ko: '화상회의 TV 스탠드 (이동식)', en: 'Video conference display cart',
  params: [P.int('inches', '화면 크기(인치)', 'Screen size (in)', 65, 43, 86), P.mat('frame', '스탠드', 'Stand', 'metal-black', FRAME_OPTS), P.bool('camera', '카메라', 'Camera bar', true)],
  tags: ['video conference', 'tv cart', 'display stand', 'meeting room', '화상회의', 'TV 스탠드', '이동식 모니터', '회의실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const diag = p.inches * 0.0254, sw = diag * 0.8716, sh = diag * 0.4903, cy = 1.25;
    for (const s of [-1, 1]) {
      k.box('frame', p.frame, 0.06, cy + sh / 2 - 0.1, 0.04, s * 0.25, 0.08 + (cy + sh / 2 - 0.1) / 2, -0.06, { r: 0.004 });
      k.box('frame', p.frame, 0.06, 0.04, 0.7, s * 0.25, 0.07, 0, { r: 0.006 });
      for (const z of [-1, 1]) k.cyl('casters', 'plastic-black', 0.03, 0.03, 0.035, s * 0.25 - 0.017, 0.03, z * 0.3, { rz: PI / 2, segs: k.seg(12, 6) });
    }
    k.box('frame', p.frame, 0.56, 0.03, 0.4, 0, 0.75, 0.0, { r: 0.004 });
    k.box('tv', 'plastic-black', sw, sh, 0.05, 0, cy, -0.01, { r: 0.006 });
    k.box('screen', 'screen-black', sw - 0.02, sh - 0.02, 0.002, 0, cy, 0.016, { r: 0 });
    if (p.camera) {
      k.box('tv', 'plastic-black', 0.5, 0.07, 0.07, 0, cy + sh / 2 + 0.05, 0.0, { r: 0.02 });
      k.cyl('lens', 'glass-tinted', 0.02, 0.02, 0.01, 0, cy + sh / 2 + 0.05, 0.035, { rx: PI / 2, segs: k.seg(14, 6) });
    }
    return finish(k);
  },
});

/* ----------------------------------------------------- services */

const printerStation = w$({
  id: 'wp-printer-station', ko: '복합기 + 프린터 수납장', en: 'Printer station with multifunction copier',
  params: [P.mat('body', '수납장', 'Cabinet', 'paint-white-matte'), P.mat('top', '상판', 'Top', 'wood-oak', TOP), P.bool('paper', '종이 더미', 'Paper stacks', true)],
  tags: ['printer', 'copier', 'mfp', 'print station', '복합기', '프린터', '복사기', '출력 코너'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = addCabinet(k, { w: 1.6, h: 0.75, d: 0.6, rows: [{ h: 1, n: 3, type: 'door' }], body: p.body, front: p.body, base: 'plinth', plinth: 0.06, top: p.top, topThick: 0.025, handle: 'edge', handleMat: 'metal-aluminium' });
    const y = r.top, x = -0.25;
    k.box('mfp', 'plastic-white', 0.58, 0.42, 0.55, x, y + 0.21, 0, { r: 0.01, segs: 2 });
    k.box('mfp', 'plastic-grey', 0.56, 0.06, 0.5, x, y + 0.45, -0.01, { r: 0.008 });
    k.box('mfp', 'plastic-grey', 0.4, 0.012, 0.22, x, y + 0.49, 0.0, { r: 0.004 });
    for (let i = 0; i < 2; i++) k.box('mfp', 'plastic-grey', 0.5, 0.008, 0.002, x, y + 0.08 + i * 0.1, 0.276, { r: 0 });
    k.box('panel', 'screen-black', 0.22, 0.012, 0.12, x + 0.12, y + 0.43, 0.27, { r: 0.004, rx: 0.4 });
    k.box('mfp', 'plastic-white', 0.4, 0.15, 0.34, 0.45, y + 0.075, -0.05, { r: 0.008, segs: 2 });
    if (p.paper) for (let i = 0; i < 3; i++) k.box('paper', 'paper', 0.21, 0.05, 0.3, 0.2 + i * 0.0, y + 0.025 + i * 0.05, 0.12, { r: 0, ry: i * 0.08 });
    return finish(k);
  },
});

const waterCooler = w$({
  id: 'wp-water-cooler', ko: '냉온수기 (생수통)', en: 'Water cooler with bottle',
  params: [P.mat('body', '몸체', 'Body', 'plastic-white'), P.bool('bottle', '생수통', 'Bottle', true), P.bool('cups', '컵 디스펜서', 'Cup dispenser', true)],
  tags: ['water cooler', 'water dispenser', 'bottle', 'pantry', '냉온수기', '정수기', '생수통', '탕비실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.32, d = 0.34, h = 1.0;
    k.box('body', p.body, w, h, d, 0, h / 2, 0, { r: 0.015, segs: 2 });
    k.box('trim', 'plastic-grey', w - 0.04, 0.24, 0.06, 0, 0.82, d / 2 - 0.02, { r: 0.01 });
    k.box('trim', 'plastic-grey', w - 0.06, 0.02, 0.12, 0, 0.6, d / 2, { r: 0.004 });
    k.box('taps', 'plastic-black', 0.03, 0.04, 0.03, -0.06, 0.73, d / 2 + 0.03, { r: 0.006 });
    k.box('taps', 'plastic-grey', 0.03, 0.04, 0.03, 0.06, 0.73, d / 2 + 0.03, { r: 0.006 });
    if (p.bottle) {
      k.lathe('bottle', 'glass-tinted', [[0, h], [0.03, h], [0.03, h + 0.05], [0.13, h + 0.1], [0.135, h + 0.18], [0.13, h + 0.2], [0.135, h + 0.28], [0.13, h + 0.4], [0.1, h + 0.44], [0, h + 0.45]], 0, 0, 0, { segs: k.seg(28, 10) });
    }
    if (p.cups) k.cyl('cups', 'plastic-white', 0.04, 0.04, 0.3, w / 2 + 0.045, 0.55, 0, { segs: k.seg(14, 6) });
    return finish(k);
  },
});

const coffeePoint = w$({
  id: 'wp-coffee-point', ko: '탕비실 커피 카운터', en: 'Office coffee point counter',
  params: [P.len('width', '폭', 'Width', 2.4, 1.6, 3.2), P.mat('front', '도어', 'Fronts', 'paint-green-matte'), P.mat('top', '상판', 'Worktop', 'quartz-white', 'stone'), P.bool('shelf', '오픈 선반', 'Open shelf', true), P.mat('shelfMat', '선반', 'Shelf', 'wood-oak', TOP)],
  tags: ['coffee point', 'pantry', 'tea point', 'kitchenette', 'break room', '탕비실', '커피 카운터', '미니 주방', '휴게실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, n = Math.max(3, Math.round(w / 0.6));
    const r = addCabinet(k, { w, h: 0.9, d: 0.6, rows: [{ h: 0.8, n, type: 'door' }, { h: 0.2, n, type: 'drawer' }], body: 'wood-white', front: p.front, base: 'plinth', plinth: 0.1, top: p.top, topThick: 0.03, handle: 'bar', handleMat: 'metal-black' });
    const y = r.top;
    // sink + tap
    k.box('sink', 'metal-steel', 0.45, 0.01, 0.38, w / 2 - 0.45, y + 0.002, 0.02, { r: 0.004 });
    k.tube('sink', 'metal-steel', [[w / 2 - 0.45, y, -0.22], [w / 2 - 0.45, y + 0.3, -0.22], [w / 2 - 0.45, y + 0.33, -0.14], [w / 2 - 0.45, y + 0.26, -0.08]], 0.01);
    // coffee machine
    k.box('machine', 'paint-black-matte', 0.36, 0.45, 0.42, -w / 2 + 0.35, y + 0.225, -0.05, { r: 0.015, segs: 2 });
    k.box('machine', 'metal-steel', 0.26, 0.04, 0.2, -w / 2 + 0.35, y + 0.15, 0.1, { r: 0.006 });
    k.box('panel', 'screen-black', 0.14, 0.08, 0.005, -w / 2 + 0.35, y + 0.37, 0.165, { r: 0.002 });
    // cups
    for (let i = 0; i < 4; i++) k.cyl('cups', 'ceramic-white', 0.04, 0.035, 0.09, -w / 2 + 0.75 + i * 0.1, y, 0.1, { segs: k.seg(14, 6) });
    if (p.shelf) {
      k.box('shelf', p.shelfMat, w, 0.03, 0.28, 0, y + 0.65, -0.16, { r: 0.004 });
      k.box('shelf', p.shelfMat, w, 0.03, 0.28, 0, y + 1.0, -0.16, { r: 0.004 });
      k.box('wall', 'tile-subway-white', w, 1.1, 0.01, 0, y + 0.55, -0.295, { r: 0 });
    }
    return finish(k);
  },
});

const serverRack = w$({
  id: 'wp-server-rack', ko: '서버 랙 (42U)', en: 'Server rack (42U)',
  params: [P.num('fill', '장비 채움', 'Equipment fill', 0.7, 0, 1, 0.05), P.mat('body', '몸체', 'Body', 'paint-black-matte'), P.pick('door', '전면 문', 'Front door', 'glass', [['glass', '유리', 'Glass'], ['mesh', '타공', 'Perforated'], ['open', '없음', 'Open']])],
  tags: ['server rack', 'network cabinet', '19 inch rack', 'it room', '서버 랙', '네트워크 랙', '서버실', '전산실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.6, d = 1.0, h = 2.0, t = 0.02;
    k.box('body', p.body, w, t, d, 0, h - t / 2, 0, { r: 0.002 });
    k.box('body', p.body, w, 0.06, d, 0, 0.03, 0, { r: 0.002 });
    for (const s of [-1, 1]) k.box('body', p.body, t, h, d, s * (w / 2 - t / 2), h / 2, 0, { r: 0.002 });
    k.box('body', p.body, w - 2 * t, h - 0.08, 0.01, 0, h / 2, -d / 2 + 0.005, { r: 0 });
    const U = 0.0445, n = Math.round(42 * clamp(p.fill, 0, 1)), x0 = 0, zf = d / 2 - 0.05;
    let y = 0.1, i = 0;
    while (i < n && y < h - 0.1) {
      const u = [1, 2, 1, 4, 2][i % 5];
      k.box('servers', 'metal-steel', 0.482, u * U - 0.004, d - 0.15, x0, y + (u * U) / 2, -0.02, { r: 0.002 });
      k.box('fronts', 'plastic-black', 0.44, u * U - 0.008, 0.008, x0, y + (u * U) / 2, zf - 0.02, { r: 0.001 });
      k.box('leds', 'light-cool', 0.01, 0.006, 0.003, 0.18, y + (u * U) / 2, zf - 0.014, { r: 0 });
      y += u * U; i += u;
    }
    if (n > 0) k.light(0, 1.0, d / 2, { color: '#a8d8ff', intensity: 0.05, distance: 1 });
    else k.box('leds', 'light-cool', 0.01, 0.006, 0.003, 0.18, h - 0.1, -d / 2 + 0.02, { r: 0 });
    if (n === 0) k.light(0, 1.0, d / 2, { color: '#a8d8ff', intensity: 0.05, distance: 1 });
    if (p.door !== 'open') {
      k.panel('door', p.body, frameShape(w, h - 0.02, 0.05), 0.02, 0, h / 2, d / 2 - 0.01);
      k.box(p.door === 'glass' ? 'glass' : 'mesh', p.door === 'glass' ? 'glass-tinted' : 'metal-black', w - 0.09, h - 0.11, 0.006, 0, h / 2, d / 2 - 0.01, { r: 0 });
      addHandle(k, 'handles', 'metal-chrome', 'bar', w / 2 - 0.06, 1.1, d / 2, { len: 0.18, vertical: true });
    }
    return finish(k);
  },
});

const planterDivider = w$({
  id: 'wp-planter-divider', ko: '플랜터 파티션 (슬랫 스크린)', en: 'Planter divider with slatted screen',
  params: [P.len('width', '폭', 'Width', 1.6, 0.8, 2.4), P.len('height', '높이', 'Height', 1.6, 0.8, 2.0), P.mat('box', '화분 상자', 'Planter', 'wood-oak', TOP), P.mat('slats', '슬랫', 'Slats', 'wood-oak', TOP), P.bool('screen', '슬랫 스크린', 'Slat screen', true)],
  tags: ['planter divider', 'planter box', 'green partition', 'biophilic', '플랜터 파티션', '화분 칸막이', '그린 파티션', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = 0.4, bh = 0.6;
    k.box('box', p.box, w, bh - 0.05, d, 0, 0.05 + (bh - 0.05) / 2, 0, { r: 0.006 });
    k.box('box', 'paint-black-matte', w - 0.06, 0.05, d - 0.06, 0, 0.025, 0, { r: 0.002 });
    k.box('soil', 'soil', w - 0.04, 0.02, d - 0.04, 0, bh - 0.03, 0, { r: 0 });
    const n = Math.max(3, Math.round(w / 0.3));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n;
      k.sphere('leaves', i % 2 ? 'plant-leaf' : 'plant-leaf-light', 0.17, x, bh + 0.1, (i % 2 ? 0.05 : -0.05), { scale: [1.1, 0.9, 1.0], segs: k.seg(14, 6), rings: k.seg(10, 4) });
    }
    if (p.screen) {
      const sh = p.height - bh, m = Math.max(4, Math.round(w / 0.08));
      for (let i = 0; i < m; i++) k.box('slats', p.slats, 0.03, sh, 0.04, -w / 2 + 0.02 + ((w - 0.04) * i) / (m - 1), bh + sh / 2, -d / 2 + 0.04, { r: 0.004 });
      k.box('slats', p.slats, w, 0.03, 0.06, 0, p.height - 0.015, -d / 2 + 0.04, { r: 0.004 });
    }
    return finish(k);
  },
});

const queuePosts = w$({
  id: 'wp-queue-posts', ko: '안내 차단봉 (벨트 2개)', en: 'Queue barrier posts (pair with belt)',
  params: [P.len('gap', '간격', 'Spacing', 1.5, 0.8, 2.4), P.mat('post', '기둥', 'Posts', 'metal-chrome', FRAME_OPTS), P.color('belt', '벨트 색', 'Belt colour', '#1d3b78')],
  tags: ['queue barrier', 'stanchion', 'belt post', 'lobby', '차단봉', '줄서기 차단봉', '안내봉', '로비'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const g = p.gap;
    for (const s of [-1, 1]) {
      const x = s * g / 2;
      k.cyl('post', p.post, 0.17, 0.18, 0.03, x, 0, 0, { segs: k.seg(28, 10) });
      k.cyl('post', p.post, 0.03, 0.03, 0.95, x, 0.03, 0, { segs: k.seg(16, 6) });
      k.sphere('post', p.post, 0.035, x, 0.98, 0, { segs: k.seg(14, 6), rings: k.seg(8, 4) });
    }
    k.box('belt', 'fabric-cotton-grey', g - 0.06, 0.05, 0.004, 0, 0.88, 0, { r: 0, overrides: { color: p.belt } });
    return finish(k);
  },
});

const coatTree = w$({
  id: 'wp-coat-tree', ko: '사무실 코트 스탠드', en: 'Office coat tree',
  params: [P.mat('wood', '재질', 'Finish', 'metal-black'), P.int('hooks', '고리 수', 'Hooks', 6, 3, 8), P.bool('umbrella', '우산 꽂이', 'Umbrella ring', true)],
  tags: ['coat stand', 'coat tree', 'hat stand', 'entrance', '코트 스탠드', '옷걸이', '행거', '현관'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = Math.round(p.hooks), h = 1.78;
    k.cyl('frame', p.wood, 0.2, 0.2, 0.02, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('frame', p.wood, 0.016, 0.02, h, 0, 0.02, 0, { segs: k.seg(14, 6) });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, c = Math.cos(a), s = Math.sin(a), y = h - 0.05 - (i % 2) * 0.12;
      k.tube('frame', p.wood, [[0, y - 0.12, 0], [c * 0.1, y - 0.04, s * 0.1], [c * 0.16, y + 0.03, s * 0.16]], 0.007, { caps: true });
    }
    if (p.umbrella) k.add('frame', p.wood, new THREE.TorusGeometry(0.16, 0.007, k.seg(8, 4), k.seg(32, 10)).rotateX(PI / 2).translate(0, 0.45, 0));
    if (p.umbrella) for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('frame', p.wood, [0, 0.45, 0], [Math.cos(a) * 0.16, 0.45, Math.sin(a) * 0.16], 0.005); }
    return finish(k);
  },
});

/* ----------------------------------------------------------- wall items */

const logoWall = w$({
  id: 'wp-logo-wall', placement: 'wall', elevation: 1.2, ko: '회사 로고 사인 패널', en: 'Company logo sign panel',
  params: [P.len('width', '폭', 'Width', 2.0, 1.0, 3.6), P.len('height', '높이', 'Height', 0.9, 0.5, 1.4), P.mat('panel', '패널', 'Panel', 'wall-wood-panel', 'wall'), P.mat('letters', '로고', 'Logo', 'metal-brass', 'metal'), P.bool('halo', '후광 조명', 'Halo light', true)],
  tags: ['logo wall', 'signage', 'company sign', 'reception wall', '로고 사인', '회사 간판', '사인 패널', '로비 벽'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, h = p.height;
    k.box('panel', p.panel, w, h, 0.03, 0, h / 2, 0, { r: 0.004 });
    // abstract logo mark (ring + bar) + "letters" as slim blocks
    const L = h * 0.5, cx = -w * 0.3, cy = h / 2;
    k.panel('letters', p.letters, (() => { const s = new THREE.Shape(); s.absarc(0, 0, L / 2, 0, PI * 2, false); const hole = new THREE.Path(); hole.absarc(0, 0, L / 2 - 0.05, 0, PI * 2, true); s.holes.push(hole); return s; })(), 0.025, cx, cy, 0.03, { curveSegs: 32 });
    k.box('letters', p.letters, 0.05, L * 0.7, 0.025, cx, cy, 0.03, { r: 0.003, rz: -PI / 4 });
    const n = 6, lw = (w * 0.5) / n;
    for (let i = 0; i < n; i++) k.box('letters', p.letters, lw * 0.7, h * (i % 2 ? 0.22 : 0.3), 0.02, -w * 0.08 + lw * (i + 0.5), cy, 0.028, { r: 0.004 });
    k.box('letters', p.letters, w * 0.48, 0.012, 0.012, -w * 0.08 + w * 0.24, cy - h * 0.25, 0.024, { r: 0.002 });
    if (p.halo) {
      k.box('halo', 'light-warm', w * 0.48, 0.006, 0.004, -w * 0.08 + w * 0.24, cy - h * 0.18, 0.017, { r: 0 });
      k.light(0, cy, 0.15, { color: '#ffd9a0', intensity: 0.3, distance: 1.5 });
    }
    return finish(k);
  },
});

const acoustic = w$({
  id: 'wp-acoustic-panels', placement: 'wall', elevation: 1.0, ko: '흡음 벽 패널 세트', en: 'Acoustic wall panel set',
  params: [P.int('cols', '열', 'Columns', 4, 2, 8), P.int('rows', '단', 'Rows', 2, 1, 4), P.mat('a', '천 1', 'Felt 1', 'fabric-wool-charcoal', FABRIC), P.mat('b', '천 2', 'Felt 2', 'fabric-velvet-green', FABRIC), P.pick('shape', '모양', 'Shape', 'square', [['square', '사각', 'Square'], ['hex', '육각', 'Hexagon'], ['round', '원형', 'Round']])],
  tags: ['acoustic panel', 'sound absorbing', 'felt panel', 'wall panel', '흡음 패널', '방음 패널', '펠트 패널', '벽 패널'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = Math.round(p.cols), r = Math.round(p.rows), s = 0.5;
    const shapeOf = () => {
      if (p.shape === 'round') return ellipse(s - 0.02, s - 0.02);
      if (p.shape === 'hex') return new THREE.Shape(Array.from({ length: 6 }, (_, i) => new THREE.Vector2(Math.cos((i * PI) / 3) * (s / 2 - 0.01), Math.sin((i * PI) / 3) * (s / 2 - 0.01))));
      return roundRect(s - 0.02, s - 0.02, 0.02);
    };
    for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      const x = -((c - 1) * s) / 2 + i * s + (p.shape === 'hex' && j % 2 ? s / 2 : 0), y = s / 2 + j * s * (p.shape === 'hex' ? 0.87 : 1);
      k.panel('felt', (i + j) % 3 === 1 ? p.b : p.a, shapeOf(), 0.04, x, y, 0.02, { bevel: 0.008, curveSegs: 16 });
    }
    return finish(k);
  },
});

/* ------------------------------------------------------------- variants */

const DESIGNS = [
  bench2, bench4, bench6, cluster4, cluster3, operatorDesk, managerL, credenza,
  partitionStraight, partitionCorner, partitionGlass, cubicle,
  taskChair, meshChair, boardChair, visitorChair, trainingChair, barStool, lounge, pouf,
  conf6, conf10, conf16, confBoat, confRound, highTable, trainingTable,
  reception, waitingSofa, beamBench,
  mobilePed, filingTall, lateral, lockers, shelfDivider, tambour, mailSorter,
  phoneBooth, focusPod, lectern, whiteboard, videoCart,
  printerStation, waterCooler, coffeePoint, serverRack, planterDivider, queuePosts, coatTree,
  logoWall, acoustic,
];

const VARIANTS = [
  variant(bench6, 'walnut', '6인 벤치 워크스테이션 (월넛·블랙)', '6-seat bench workstation, walnut & black', { top: 'wood-walnut', frame: 'metal-black', screenMat: 'fabric-mustard' }, { tags: ['walnut', '월넛'] }),
  variant(partitionStraight, 'low', '낮은 파티션 (1.1 m)', 'Low partition panel (1.1 m)', { height: 1.1, fabric: 'fabric-navy' }, { tags: ['low', '낮은'] }),
  variant(partitionStraight, 'high', '높은 파티션 (1.8 m·유리)', 'High partition panel (1.8 m, glass top)', { height: 1.8, glassTop: true }, { tags: ['high', '높은', 'glass', '유리'] }),
  variant(meshChair, 'white', '화이트 메쉬 의자', 'White mesh chair', { back: 'fabric-cotton-white', seat: 'fabric-cotton-grey', frame: 'metal-white' }, { tags: ['white', '화이트'] }),
  variant(conf10, 'white', '10인 회의 테이블 (화이트)', '10-seat conference table, white', { top: 'wood-white', frame: 'metal-white' }, { tags: ['white', '화이트'] }),
  variant(lockers, 'tall', '1단 장 사물함 (탈의실)', 'Full-height lockers (changing room)', { rows: 1, cols: 5, front: 'paint-blue-matte' }, { tags: ['full height', '장 사물함', 'changing room', '탈의실'] }),
  variant(taskChair, 'red', '태스크 의자 (테라코타)', 'Task chair, terracotta', { seat: 'fabric-terracotta', arms: false }, { tags: ['armless', '팔걸이 없는'] }),
];

export const ITEMS = [...DESIGNS, ...VARIANTS];
