// More outdoor designs: garden furniture (bistro set, rope lounge chair, steamer chair, concrete
// bench, tree-surround bench, glider, bar set, rocking chair), planters (corten trough, tiered
// stand, urn on plinth, herb spiral), garden structures (louvred pergola, shade sail, greenhouse,
// cold frame, kennel, chicken coop, bird house, beehive), fences and walls (slat fence, iron
// fence, gabion wall, Korean stone wall with tile cap, bamboo screen), decks and paths (deck with
// steps, stepping stones, arched bridge), cooking and heat (offset smoker, chiminea, patio
// heater), play (swing set, slide, climbing frame, basketball hoop), lights (festoon poles, tiki
// torch), water (pond, ball fountain), utility (rotary washing line, potting bench) and Korean
// yard pieces (평상, 장독대, 솟대). Every entry is measured from its default build (mk) and
// re-centred by finish(): origin bottom centre, front +Z, metres. See ARCHITECTURE.md §12.
import { THREE, Kit, P, rng, transformAdded, addPot, shellGeo } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { withMatrix } from './openings.js';

const PI = Math.PI;
const DEG = PI / 180;
const V2 = (x, y) => new THREE.Vector2(x, y);
/** rx that turns a box's local +z onto the direction (dy, dz) in the y/z plane. */
const rxOf = (dy, dz) => Math.atan2(-dy, dz);

/** Slats across x (width w) spaced along a side-view segment a → b given as [y, z] pairs. */
function slatsAlong(k, role, mat, w, a, b, pitch, { t = 0.022, wd = 0.06, x = 0 } = {}) {
  const dy = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dy, dz);
  const n = Math.max(1, Math.floor(L / pitch));
  const rx = rxOf(dy, dz);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    k.box(role, mat, w, t, wd, x, a[0] + dy * f, a[1] + dz * f, { r: 0.003, rx });
  }
}
/** A straight member (tw × th section) between two side-view points [y, z] at x. */
function member(k, role, mat, x, a, b, tw, th, o = {}) {
  const dy = b[0] - a[0], dz = b[1] - a[1];
  k.box(role, mat, tw, th, Math.hypot(dy, dz), x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { r: 0.004, rx: rxOf(dy, dz), ...o });
}
/** A rough stone (rounded box) of about w × h × d, turned by ry. */
function stone(k, role, mat, x, y, z, w, h, d, ry = 0) {
  k.box(role, mat, w, h, d, x, y, z, { r: Math.min(w, h, d) * 0.3, segs: 1, ry });
}
/** A leafy ball (shrub, herb, foliage). */
function leafBall(k, x, y, z, r, mat = 'plant-leaf', scale = [1, 0.8, 1]) {
  k.sphere('plants', mat, r, x, y, z, { scale, segs: k.seg(10, 6), rings: k.seg(7, 4) });
}
/** Grass tuft: thin blades fanning out from (x, y, z). */
function tuft(k, x, y, z, h, rand, n = 7, mat = 'plant-leaf') {
  for (let i = 0; i < n; i++) {
    const a = rand() * PI * 2, lean = 0.15 + rand() * 0.35;
    k.cyl('plants', mat, 0, 0.006, h * (0.7 + rand() * 0.4), x, y, z, { segs: 3, rx: Math.cos(a) * lean, rz: Math.sin(a) * lean });
  }
}
const torusAt = (r, tube, rs, ts, x, y, z, rx = 0, ry = 0, arc = PI * 2) => {
  const g = new THREE.TorusGeometry(r, tube, rs, ts, arc);
  g.rotateX(rx); g.rotateY(ry); g.translate(x, y, z);
  return g;
};

/* ======================================================== garden furniture */

function bistroChair(k, m, wood) {
  const sh = 0.45;
  for (let i = 0; i < 5; i++) k.box('slats', wood, 0.42, 0.018, 0.068, 0, sh, -0.16 + i * 0.08, { r: 0.004 });
  for (const s of [-1, 1]) {
    k.rod('frame', m, [s * 0.2, 0, 0.22], [s * 0.2, 0.88, -0.2], 0.011, { segs: k.seg(10, 5) });
    k.rod('frame', m, [s * 0.2, 0, -0.24], [s * 0.2, sh - 0.012, 0.18], 0.011, { segs: k.seg(10, 5) });
  }
  for (const z of [-0.17, 0.17]) k.rod('frame', m, [-0.2, sh - 0.015, z], [0.2, sh - 0.015, z], 0.008, { segs: k.seg(8, 4) });
  k.rod('frame', m, [-0.2, 0.18, 0.12], [0.2, 0.18, 0.12], 0.007, { segs: k.seg(8, 4) });
  const tilt = rxOf(0.88, -0.42);
  for (const y of [0.68, 0.8]) {
    const z = 0.22 + (y / 0.88) * -0.42;
    k.box('slats', wood, 0.4, 0.07, 0.016, 0, y, z - 0.018, { r: 0.004, rx: tilt - PI / 2 });
  }
}

const bistro = mk({
  id: 'out-bistro-set', category: 'outdoor', ko: '접이식 비스트로 세트', en: 'Folding bistro set',
  params: [
    P.len('diameter', '테이블 지름', 'Table diameter', 0.6, 0.5, 0.8), P.mat('metal', '프레임', 'Frame', 'paint-green-matte'),
    P.mat('wood', '상판·좌판', 'Top / slats', 'wood-teak', 'wood'), P.bool('chairs', '의자 2개', 'Two chairs', true),
  ],
  tags: ['bistro set', 'patio set', 'folding chair', 'balcony set', '비스트로 세트', '발코니 테이블', '접이식 의자', '야외 테이블 세트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = p.diameter / 2, m = p.metal;
    k.cyl('top', p.wood, r, r, 0.022, 0, 0.72, 0, { segs: k.seg(36, 12) });
    k.cyl('frame', m, r - 0.02, r - 0.02, 0.03, 0, 0.69, 0, { segs: k.seg(36, 12), open: true });
    k.cyl('frame', m, 0.022, 0.022, 0.62, 0, 0.07, 0, { segs: k.seg(12, 6) });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + PI / 6;
      k.rod('frame', m, [0, 0.12, 0], [Math.sin(a) * r * 0.85, 0, Math.cos(a) * r * 0.85], 0.012, { segs: k.seg(10, 5) });
    }
    if (p.chairs) {
      transformAdded(k, () => bistroChair(k, m, p.wood), -(r + 0.32), 0, 0, PI / 2);
      transformAdded(k, () => bistroChair(k, m, p.wood), r + 0.32, 0, 0, -PI / 2);
    }
    return finish(k);
  },
});

const ropeLounge = mk({
  id: 'out-rope-lounge-chair', category: 'outdoor', ko: '로프 라운지 체어', en: 'Rope-woven lounge chair',
  params: [
    P.len('width', '폭', 'Width', 0.75, 0.6, 1.0), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal'),
    P.mat('rope', '로프', 'Rope', 'fabric-linen-beige', 'fabric'), P.bool('cushion', '방석', 'Seat cushion', true),
  ],
  tags: ['lounge chair', 'rope chair', 'woven chair', 'garden armchair', '라운지 체어', '로프 의자', '야외 안락의자', '정원 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, hw = W / 2, sh = 0.36, f = p.frame;
    for (const s of [-1, 1]) {
      const x = s * hw;
      k.box('frame', f, 0.035, 0.6, 0.035, x, 0.3, 0.34, { r: 0.004 });
      k.box('frame', f, 0.035, 0.6, 0.035, x, 0.3, -0.3, { r: 0.004 });
      k.box('frame', f, 0.035, 0.035, 0.7, x, sh, 0.02, { r: 0.004 });
      k.box('arms', 'wood-teak', 0.07, 0.025, 0.74, x, 0.612, 0.03, { r: 0.006 });
      member(k, 'frame', f, x * 0.94, [sh, -0.3], [0.86, -0.46], 0.032, 0.032);
    }
    k.rod('frame', f, [-hw, 0.86, -0.46], [hw, 0.86, -0.46], 0.016, { segs: k.seg(10, 5) });
    for (const z of [0.34, -0.3]) k.box('frame', f, W, 0.035, 0.035, 0, sh, z, { r: 0.004 });
    const n = Math.round(W / 0.05);
    const tub = { segs: k.seg(14, 5), radial: k.seg(6, 3) };
    for (let i = 0; i < n; i++) {
      const x = -hw + 0.03 + ((W - 0.06) * i) / (n - 1);
      k.tube('rope', p.rope, [[x, sh + 0.01, 0.33], [x, sh - 0.035, 0.02], [x, sh + 0.01, -0.29]], 0.007, tub);
      k.tube('rope', p.rope, [[x * 0.94, sh + 0.02, -0.3], [x * 0.94, 0.6, -0.36], [x * 0.94, 0.85, -0.45]], 0.007, tub);
    }
    if (p.cushion) k.soft('cushion', 'fabric-linen-white', W - 0.08, 0.08, 0.6, 0.03, 0, sh + 0.05, 0.03, { puff: 0.01 });
    return finish(k);
  },
});

const steamer = mk({
  id: 'out-steamer-chair', category: 'outdoor', ko: '티크 스티머 체어', en: 'Teak steamer chair',
  params: [
    P.len('width', '폭', 'Width', 0.62, 0.55, 0.75), P.mat('wood', '목재', 'Wood', 'wood-teak', 'wood'),
    P.bool('cushion', '매트', 'Pad', true), P.mat('fabric', '매트 천', 'Pad fabric', 'fabric-navy', 'fabric'),
  ],
  tags: ['steamer chair', 'deck lounger', 'teak lounger', 'reclining chair', '스티머 체어', '티크 라운저', '데크 체어', '리클라이너'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, w = p.wood;
    const path = [[0.95, -0.78], [0.4, -0.45], [0.4, 0.2], [0.3, 0.8]];
    for (let i = 0; i < path.length - 1; i++) {
      slatsAlong(k, 'slats', w, W - 0.08, path[i], path[i + 1], 0.07);
      for (const s of [-1, 1]) member(k, 'frame', w, s * (W / 2 - 0.03), [path[i][0] - 0.03, path[i][1]], [path[i + 1][0] - 0.03, path[i + 1][1]], 0.04, 0.06);
    }
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.02);
      k.box('frame', w, 0.045, 0.38, 0.045, x, 0.19, 0.12, { r: 0.004 });
      member(k, 'frame', w, x, [0, -0.62], [0.62, -0.38], 0.045, 0.045);
      member(k, 'frame', w, x, [0, 0.74], [0.3, 0.74], 0.045, 0.045);
      k.box('arms', w, 0.07, 0.03, 0.6, x, 0.6, -0.15, { r: 0.006 });
      k.box('frame', w, 0.04, 0.22, 0.04, x, 0.49, 0.12, { r: 0.004 });
    }
    if (p.cushion) {
      const segs = [[0.95, -0.78], [0.4, -0.45], [0.4, 0.2]];
      for (let i = 0; i < 2; i++) {
        const a = segs[i], b = segs[i + 1], dy = b[0] - a[0], dz = b[1] - a[1], rx = rxOf(dy, dz);
        // offset along the slats' normal (the box's local +y after the tilt)
        k.soft('cushion', p.fabric, W - 0.12, 0.05, Math.hypot(dy, dz) - 0.02, 0.02, 0, (a[0] + b[0]) / 2 + 0.036 * Math.cos(rx), (a[1] + b[1]) / 2 + 0.036 * Math.sin(rx), { rx, puff: 0.008 });
      }
    }
    return finish(k);
  },
});

const concreteBench = mk({
  id: 'out-concrete-bench', category: 'outdoor', ko: '콘크리트 벤치', en: 'Concrete bench',
  params: [
    P.len('length', '길이', 'Length', 1.8, 1.0, 3.0), P.mat('stone', '콘크리트', 'Concrete', 'concrete'),
    P.bool('wood', '목재 좌판', 'Timber seat', true), P.mat('woodMat', '좌판 목재', 'Seat wood', 'wood-teak', 'wood'),
  ],
  tags: ['concrete bench', 'park bench', 'garden bench', 'modern bench', '콘크리트 벤치', '공원 벤치', '야외 벤치', '정원 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = 0.42;
    for (const s of [-1, 1]) k.box('base', p.stone, 0.14, 0.36, d, s * (L / 2 - 0.25), 0.18, 0, { r: 0.01, segs: 2 });
    k.box('base', p.stone, L, 0.08, d, 0, 0.4, 0, { r: 0.012, segs: 2 });
    if (p.wood) {
      const n = 5;
      for (let i = 0; i < n; i++) k.box('seat', p.woodMat, L - 0.04, 0.035, d / n - 0.008, 0, 0.458, -d / 2 + (d / n) * (i + 0.5), { r: 0.004 });
    }
    return finish(k);
  },
});

const treeBench = mk({
  id: 'out-tree-bench', category: 'outdoor', ko: '나무 둘레 원형 벤치', en: 'Tree-surround bench',
  params: [
    P.len('radius', '안쪽 반지름', 'Inner radius', 0.45, 0.3, 0.9), P.int('sides', '면 수', 'Sides', 8, 6, 10),
    P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'), P.bool('back', '등받이', 'Backrest', true), P.bool('tree', '나무', 'Tree', true),
  ],
  tags: ['tree bench', 'circular bench', 'tree seat', 'garden bench', '나무 벤치', '원형 벤치', '둘레 벤치', '정원 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.sides, R0 = p.radius, sd = 0.42, sh = 0.45, w = p.wood;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * PI * 2;
      for (let j = 0; j < 4; j++) {
        const r = R0 + 0.06 + (sd - 0.06) * (j + 0.5) / 4;
        const len = 2 * r * Math.tan(PI / n) - 0.012;
        k.box('seat', w, len, 0.03, 0.08, Math.sin(a) * r, sh, Math.cos(a) * r, { r: 0.004, ry: a });
      }
      if (p.back) for (const y of [0.62, 0.76, 0.9]) {
        const r = R0 + 0.02;
        k.box('seat', w, 2 * r * Math.tan(PI / n) - 0.01, 0.08, 0.025, Math.sin(a) * r, y, Math.cos(a) * r, { r: 0.004, ry: a });
      }
      const c = (i / n) * PI * 2;
      for (const r of [R0 + 0.05, R0 + sd - 0.04]) k.box('legs', w, 0.06, sh - 0.015, 0.06, Math.sin(c) * r, (sh - 0.015) / 2, Math.cos(c) * r, { r: 0.004, ry: c });
      if (p.back) k.box('legs', w, 0.05, 0.98 - sh, 0.05, Math.sin(c) * (R0 + 0.01), sh + (0.98 - sh) / 2, Math.cos(c) * (R0 + 0.01), { r: 0.004, ry: c });
    }
    if (p.tree) {
      const tr = Math.min(0.18, R0 * 0.45);
      k.cyl('trunk', 'wood-dark', tr * 0.7, tr, 2.2, 0, 0, 0, { segs: k.seg(14, 6) });
      const rand = rng(5);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        leafBall(k, Math.sin(a) * 0.55, 2.4 + rand() * 0.4, Math.cos(a) * 0.55, 0.55 + rand() * 0.15);
      }
      leafBall(k, 0, 2.9, 0, 0.7);
    }
    return finish(k);
  },
});

const glider = mk({
  id: 'out-glider-bench', category: 'outdoor', ko: '글라이더 벤치(흔들 벤치)', en: 'Porch glider bench',
  params: [
    P.len('width', '폭', 'Width', 1.3, 0.9, 1.8), P.mat('metal', '프레임', 'Frame', 'paint-white-gloss'),
    P.mat('wood', '좌판', 'Slats', 'wood-white', 'wood'), P.num('swing', '흔들림', 'Glide offset', 0, -0.08, 0.08, 0.01),
  ],
  tags: ['glider', 'porch glider', 'glider bench', 'rocking bench', '글라이더', '흔들 벤치', '포치 벤치', '정원 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, m = p.metal, s0 = p.swing, sh = 0.42;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.06);
      k.box('base', m, 0.04, 0.04, 0.7, x, 0.02, 0, { r: 0.004 });
      for (const z of [-0.3, 0.3]) k.box('base', m, 0.035, 0.6, 0.035, x, 0.3, z, { r: 0.004 });
      k.box('base', m, 0.035, 0.035, 0.64, x, 0.6, 0, { r: 0.004 });
      for (const z of [-0.25, 0.25]) k.rod('links', 'metal-steel', [x, 0.56, z], [x - s * 0.04, 0.3, z + s0], 0.008, { segs: k.seg(8, 4) });
    }
    k.box('base', m, W + 0.12, 0.035, 0.035, 0, 0.05, -0.3, { r: 0.004 });
    // the seat assembly glides by `swing` along z
    const z0 = s0;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.01);
      k.box('frame', m, 0.03, 0.03, 0.56, x, 0.3, z0, { r: 0.004 });
      member(k, 'frame', m, x, [0.3, -0.26 + z0], [0.95, -0.38 + z0], 0.03, 0.03);
      k.box('frame', m, 0.03, 0.3, 0.03, x, 0.45, 0.25 + z0, { r: 0.004 });
      k.box('arms', p.wood, 0.07, 0.025, 0.56, x, 0.62, z0 + 0.02, { r: 0.006 });
    }
    slatsAlong(k, 'slats', p.wood, W, [sh, 0.27 + z0], [sh, -0.24 + z0], 0.075);
    slatsAlong(k, 'slats', p.wood, W, [sh + 0.06, -0.27 + z0], [0.92, -0.37 + z0], 0.09, { t: 0.02 });
    k.box('frame', m, W, 0.03, 0.03, 0, sh - 0.03, 0.25 + z0, { r: 0.004 });
    k.box('frame', m, W, 0.03, 0.03, 0, sh - 0.03, -0.25 + z0, { r: 0.004 });
    return finish(k);
  },
});

const barSet = mk({
  id: 'out-bar-set', category: 'outdoor', ko: '야외 바 테이블 세트', en: 'Outdoor bar table with stools',
  params: [
    P.len('length', '테이블 길이', 'Table length', 1.4, 0.9, 2.2), P.int('stools', '스툴 수', 'Stools', 4, 0, 6),
    P.mat('wood', '상판', 'Top', 'wood-teak', 'wood'), P.mat('metal', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['bar table', 'high table', 'bar stool', 'patio bar', '바 테이블', '하이 테이블', '바 스툴', '야외 바'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = 0.6, h = 1.05, m = p.metal;
    k.box('top', p.wood, L, 0.035, d, 0, h - 0.018, 0, { r: 0.006 });
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - 0.15);
      k.box('frame', m, 0.05, h - 0.035, 0.05, x, (h - 0.035) / 2, 0, { r: 0.004 });
      k.box('frame', m, 0.05, 0.04, d - 0.06, x, 0.02, 0, { r: 0.004 });
      k.box('frame', m, 0.05, 0.04, d - 0.1, x, h - 0.055, 0, { r: 0.004 });
    }
    k.box('frame', m, L - 0.3, 0.04, 0.04, 0, 0.25, 0, { r: 0.004 });
    const n = p.stools, perSide = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const side = i < perSide ? 1 : -1, j = side > 0 ? i : i - perSide, cnt = side > 0 ? perSide : n - perSide;
      const x = cnt === 1 ? 0 : -L / 2 + 0.3 + ((L - 0.6) * j) / Math.max(1, cnt - 1);
      const z = side * (d / 2 + 0.28), sy = 0.76;
      k.cyl('stools', p.wood, 0.17, 0.17, 0.035, x, sy, z, { segs: k.seg(24, 8) });
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * PI * 2 + PI / 4;
        k.rod('frame', m, [x + Math.sin(a) * 0.1, sy, z + Math.cos(a) * 0.1], [x + Math.sin(a) * 0.19, 0, z + Math.cos(a) * 0.19], 0.012, { segs: k.seg(8, 4) });
      }
      k.add('frame', m, torusAt(0.16, 0.009, k.seg(6, 3), k.seg(20, 8), x, 0.3, z, PI / 2));
    }
    return finish(k);
  },
});

const rocking = mk({
  id: 'out-rocking-chair', category: 'outdoor', ko: '야외 흔들의자(포치 로커)', en: 'Porch rocking chair',
  params: [P.mat('wood', '목재', 'Wood', 'paint-white-gloss'), P.num('rock', '흔들림(°)', 'Rock (°)', 0, -10, 10, 1)],
  tags: ['rocking chair', 'porch rocker', 'rocker', 'outdoor chair', '흔들의자', '로킹체어', '포치 의자', '야외 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.wood, hw = 0.29, sh = 0.44;
    const m = new THREE.Matrix4().makeTranslation(0, 0.03, 0).multiply(new THREE.Matrix4().makeRotationX(p.rock * DEG)).multiply(new THREE.Matrix4().makeTranslation(0, -0.03, 0));
    withMatrix(k, m, () => {
      for (const s of [-1, 1]) {
        const x = s * hw;
        const pts = [];
        for (let i = 0; i <= 8; i++) { const z = -0.5 + i * 0.125; pts.push([x, 0.03 + 0.14 * (z / 0.5) ** 2, z]); }
        k.tube('frame', w, pts, 0.022, { segs: k.seg(20, 8), radial: k.seg(8, 4), caps: true });
        k.box('frame', w, 0.04, sh - 0.05, 0.04, x, (sh - 0.05) / 2 + 0.03, 0.2, { r: 0.004 });
        member(k, 'frame', w, x, [0.04, -0.22], [1.08, -0.42], 0.045, 0.04);
        k.box('frame', w, 0.035, 0.28, 0.035, x, sh + 0.14, 0.24, { r: 0.004 });
        k.box('arms', w, 0.09, 0.025, 0.56, x + s * 0.02, 0.665, -0.0, { r: 0.008 });
      }
      slatsAlong(k, 'slats', w, 2 * hw - 0.02, [sh, 0.26], [sh - 0.03, -0.2], 0.075);
      for (const z of [0.24, -0.18]) k.box('frame', w, 2 * hw, 0.04, 0.03, 0, sh - 0.04, z, { r: 0.004 });
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = -hw + 0.06 + ((2 * hw - 0.12) * i) / (n - 1);
        k.rod('slats', w, [x, sh, -0.24], [x, 1.02, -0.39], 0.011, { segs: k.seg(8, 4) });
      }
      k.box('frame', w, 2 * hw + 0.04, 0.08, 0.035, 0, 1.04, -0.4, { r: 0.008, rx: rxOf(0.58, -0.15) - PI / 2 });
      k.box('frame', w, 2 * hw, 0.05, 0.03, 0, sh + 0.04, -0.245, { r: 0.004 });
    });
    return finish(k);
  },
});

/* ================================================================ planters */

const cortenTrough = mk({
  id: 'out-corten-trough', category: 'outdoor', ko: '코르텐 강판 플랜터', en: 'Corten steel trough planter',
  params: [
    P.len('length', '길이', 'Length', 1.2, 0.6, 2.4), P.len('height', '높이', 'Height', 0.5, 0.3, 0.9),
    P.mat('steel', '강판', 'Steel', 'metal-copper', 'metal'), P.bool('plants', '그라스', 'Grasses', true),
  ],
  tags: ['planter', 'corten planter', 'steel planter', 'trough', '플랜터', '코르텐 화분', '철제 화분', '화단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, H = p.height, D = 0.4, t = 0.006;
    const ov = p.steel === 'metal-copper' ? { overrides: { color: '#7a3b1e' } } : {};
    for (const s of [-1, 1]) {
      k.box('steel', p.steel, L, H, t, 0, H / 2, s * (D / 2 - t / 2), { r: 0.001, ...ov });
      k.box('steel', p.steel, t, H, D - 2 * t, s * (L / 2 - t / 2), H / 2, 0, { r: 0.001, ...ov });
      k.box('steel', p.steel, L + 0.01, 0.006, 0.04, 0, H - 0.003, s * (D / 2 - 0.014), { r: 0.001, ...ov });
    }
    k.box('soil', 'soil', L - 2 * t, 0.02, D - 2 * t, 0, H - 0.05, 0, { r: 0 });
    if (p.plants) {
      const rand = rng(11);
      const n = Math.max(3, Math.round(L / 0.16));
      for (let i = 0; i < n; i++) tuft(k, -L / 2 + 0.08 + ((L - 0.16) * i) / (n - 1), H - 0.04, (rand() - 0.5) * 0.18, 0.45, rand, 7, i % 2 ? 'plant-leaf' : 'plant-leaf-light');
    }
    return finish(k);
  },
});

const tieredStand = mk({
  id: 'out-plant-stand-tiered', category: 'outdoor', ko: '계단식 화분대', en: 'Tiered plant stand',
  params: [
    P.len('width', '폭', 'Width', 0.9, 0.6, 1.4), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'),
    P.bool('pots', '화분', 'Pots', true), P.mat('pot', '화분', 'Pots', 'ceramic-terracotta'),
  ],
  tags: ['plant stand', 'tiered stand', 'flower stand', 'pot shelf', '화분대', '계단식 화분대', '플랜트 스탠드', '화분 선반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, w = p.wood;
    const tiers = [[0.3, 0.2], [0.6, 0], [0.9, -0.2]];
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.02);
      member(k, 'frame', w, x, [0, 0.38], [0.92, -0.22], 0.035, 0.05);
      k.box('frame', w, 0.035, 0.92, 0.05, x, 0.46, -0.3, { r: 0.004 });
      for (const [y, z] of tiers) k.box('frame', w, 0.035, 0.035, Math.abs(z - -0.3) + 0.12, x, y - 0.03, (z + -0.3) / 2 + 0.06, { r: 0.004 });
    }
    for (const [y, z] of tiers) for (let i = 0; i < 2; i++) k.box('shelves', w, W - 0.07, 0.022, 0.085, 0, y - 0.002, z - 0.045 + i * 0.09, { r: 0.003 });
    if (p.pots) {
      const rand = rng(3);
      for (const [y, z] of tiers) {
        const n = Math.max(2, Math.floor(W / 0.28));
        for (let i = 0; i < n; i++) {
          const x = -W / 2 + 0.1 + ((W - 0.2) * i) / Math.max(1, n - 1);
          const top = addPot(k, { r: 0.075, h: 0.14, mat: p.pot, x, z, y0: y + 0.009 });
          leafBall(k, x, top + 0.06, z, 0.08 + rand() * 0.03, i % 2 ? 'plant-leaf' : 'plant-leaf-light');
        }
      }
    }
    return finish(k);
  },
});

const urnPlinth = mk({
  id: 'out-urn-plinth', category: 'outdoor', ko: '받침대 석조 항아리 화분', en: 'Stone urn on plinth',
  params: [P.len('height', '전체 높이', 'Overall height', 1.1, 0.8, 1.5), P.mat('stone', '석재', 'Stone', 'travertine'), P.bool('plant', '토피어리', 'Topiary', true)],
  tags: ['urn', 'garden urn', 'plinth', 'stone planter', '석조 화분', '항아리 화분', '받침대', '정원 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.stone, ph = Math.max(0.3, p.height - 0.55);
    k.box('plinth', s, 0.46, 0.06, 0.46, 0, 0.03, 0, { r: 0.008 });
    k.box('plinth', s, 0.38, ph - 0.12, 0.38, 0, 0.06 + (ph - 0.12) / 2, 0, { r: 0.006 });
    k.box('plinth', s, 0.46, 0.06, 0.46, 0, ph - 0.03, 0, { r: 0.008 });
    const prof = [[0, 0], [0.12, 0], [0.12, 0.03], [0.07, 0.07], [0.07, 0.12], [0.2, 0.2], [0.27, 0.36], [0.28, 0.44], [0.3, 0.47], [0.3, 0.5], [0.26, 0.5], [0.25, 0.46], [0, 0.46]];
    k.lathe('urn', s, prof, 0, ph, 0, { segs: k.seg(36, 12) });
    for (const sx of [-1, 1]) k.add('urn', s, torusAt(0.06, 0.014, k.seg(8, 4), k.seg(16, 6), sx * 0.29, ph + 0.33, 0, 0, 0, PI));
    k.cyl('soil', 'soil', 0.25, 0.25, 0.01, 0, ph + 0.45, 0, { segs: k.seg(24, 8) });
    if (p.plant) { k.cyl('plants', 'plant-stem', 0.012, 0.015, 0.15, 0, ph + 0.45, 0, { segs: 5 }); leafBall(k, 0, ph + 0.72, 0, 0.22, 'plant-leaf', [1, 1, 1]); }
    return finish(k);
  },
});

const herbSpiral = mk({
  id: 'out-herb-spiral', category: 'outdoor', ko: '허브 스파이럴 돌 화단', en: 'Herb spiral',
  params: [P.len('radius', '반지름', 'Radius', 0.9, 0.6, 1.4), P.mat('stone', '돌', 'Stone', 'granite-grey'), P.bool('herbs', '허브', 'Herbs', true)],
  tags: ['herb spiral', 'herb garden', 'stone bed', 'permaculture', '허브 스파이럴', '허브 화단', '돌 화단', '텃밭'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.radius, rand = rng(7);
    k.cyl('soil', 'soil', 0.18, R - 0.05, 0.62, 0, 0, 0, { segs: k.seg(20, 8) });
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), a = t * PI * 2.4, r = R - (R - 0.25) * t;
      const top = 0.1 + 0.55 * t, layers = Math.max(1, Math.round(top / 0.11));
      for (let l = 0; l < layers; l++) stone(k, 'stones', p.stone, Math.sin(a) * r, 0.055 + l * 0.11, Math.cos(a) * r, 0.18 + rand() * 0.05, 0.1, 0.13, a + rand() * 0.3);
      if (p.herbs && i % 3 === 1) leafBall(k, Math.sin(a) * (r - 0.18), top + 0.06 - 0.15 * (1 - t), Math.cos(a) * (r - 0.18), 0.09 + rand() * 0.04, i % 2 ? 'plant-leaf-light' : 'plant-leaf');
    }
    if (p.herbs) leafBall(k, 0, 0.72, 0, 0.12);
    return finish(k);
  },
});

/* ============================================================ structures */

const louvrePergola = mk({
  id: 'out-louvred-pergola', category: 'outdoor', ko: '알루미늄 루버 퍼골라', en: 'Louvred aluminium pergola',
  params: [
    P.len('width', '폭', 'Width', 3.6, 2.4, 5.0), P.len('depth', '깊이', 'Depth', 3.0, 2.0, 4.5), P.len('height', '높이', 'Height', 2.5, 2.2, 3.0),
    P.num('angle', '루버 각도(°)', 'Louvre angle (°)', 30, 0, 90, 1), P.mat('frame', '프레임', 'Frame', 'paint-grey-matte'),
  ],
  tags: ['pergola', 'louvred pergola', 'bioclimatic pergola', 'aluminium pergola', '퍼골라', '루버 퍼골라', '알루미늄 퍼골라', '어닝'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = p.height, f = p.frame, ps = 0.15;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box('posts', f, ps, H, ps, sx * (W / 2 - ps / 2), H / 2, sz * (D / 2 - ps / 2), { r: 0.004 });
      k.box('posts', f, ps + 0.06, 0.012, ps + 0.06, sx * (W / 2 - ps / 2), 0.006, sz * (D / 2 - ps / 2), { r: 0.002 });
    }
    for (const s of [-1, 1]) {
      k.box('beams', f, W, 0.22, ps, 0, H + 0.11, s * (D / 2 - ps / 2), { r: 0.004 });
      k.box('beams', f, ps, 0.22, D - 2 * ps, s * (W / 2 - ps / 2), H + 0.11, 0, { r: 0.004 });
    }
    const n = Math.round((D - 2 * ps) / 0.2);
    const pitch = (D - 2 * ps) / n;
    for (let i = 0; i < n; i++) k.box('louvres', f, W - 2 * ps - 0.01, 0.025, 0.19, 0, H + 0.13, -D / 2 + ps + pitch * (i + 0.5), { r: 0.006, rx: -p.angle * DEG });
    return finish(k);
  },
});

const shadeSail = mk({
  id: 'out-shade-sail', category: 'outdoor', ko: '삼각 차양 돛(그늘막)', en: 'Triangular shade sail',
  params: [P.len('span', '변 길이', 'Side length', 4.0, 2.5, 6.0), P.len('height', '기둥 높이', 'Post height', 2.8, 2.2, 3.5), P.mat('fabric', '천', 'Fabric', 'fabric-cotton-white', 'fabric'), P.mat('posts', '기둥', 'Posts', 'metal-steel', 'metal')],
  tags: ['shade sail', 'sun sail', 'canopy', 'shade', '차양', '그늘막', '타프', '어닝'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.span, H = p.height, rr = S / Math.sqrt(3);
    const corners = [0, 1, 2].map((i) => { const a = (i / 3) * PI * 2 + PI; return [Math.sin(a) * rr, Math.cos(a) * rr]; });
    const heights = [H, H - 0.6, H];
    corners.forEach(([x, z], i) => {
      k.cyl('posts', p.posts, 0.045, 0.045, heights[i] + 0.15, x, 0, z, { segs: k.seg(14, 6) });
      k.box('posts', p.posts, 0.22, 0.012, 0.22, x, 0.006, z, { r: 0.002 });
    });
    const ins = 0.35;
    const P3 = corners.map(([x, z], i) => { const l = Math.hypot(x, z); return new THREE.Vector3(x * (1 - ins / l), heights[i] - 0.05, z * (1 - ins / l)); });
    const [A, B, C] = P3;
    const sag = 0.18;
    const geo = shellGeo(k.seg(12, 4), k.seg(12, 4), (u, v) => {
      const edge = B.clone().lerp(C, v);
      const q = A.clone().lerp(edge, u);
      q.y -= sag * 4 * u * (1 - u) * Math.sin(PI * v) + sag * 0.5 * Math.sin(PI * u) * Math.sin(PI * v);
      return [q.x, q.y, q.z];
    }, 0.004);
    k.add('sail', p.fabric, geo);
    corners.forEach(([x, z], i) => k.rod('cables', 'metal-steel', [P3[i].x, P3[i].y, P3[i].z], [x, heights[i] + 0.05, z], 0.005, { segs: 5 }));
    return finish(k);
  },
});

const greenhouse = mk({
  id: 'out-greenhouse', category: 'outdoor', ko: '유리 온실', en: 'Glass greenhouse',
  params: [P.len('width', '폭', 'Width', 2.0, 1.5, 3.0), P.len('length', '길이', 'Length', 2.6, 1.8, 4.0), P.mat('frame', '프레임', 'Frame', 'metal-aluminium', 'metal'), P.bool('bench', '작업대·화분', 'Staging & pots', true)],
  tags: ['greenhouse', 'glasshouse', 'garden greenhouse', 'conservatory', '온실', '유리 온실', '비닐하우스', '정원 온실'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, L = p.length, f = p.frame, base = 0.3, eave = 1.75, rise = W * 0.3;
    for (const s of [-1, 1]) {
      k.box('base', 'wall-brick-red', W, base, 0.1, 0, base / 2, s * (L / 2 - 0.05), { r: 0.004 });
      k.box('base', 'wall-brick-red', 0.1, base, L - 0.2, s * (W / 2 - 0.05), base / 2, 0, { r: 0.004 });
    }
    const nl = Math.max(3, Math.round(L / 0.65));
    for (let i = 0; i <= nl; i++) {
      const z = -L / 2 + 0.03 + ((L - 0.06) * i) / nl;
      for (const s of [-1, 1]) k.box('frame', f, 0.035, eave - base, 0.035, s * (W / 2 - 0.03), (base + eave) / 2, z, { r: 0.003 });
      const sl = Math.hypot(W / 2, rise);
      for (const s of [-1, 1]) k.box('frame', f, sl, 0.035, 0.035, s * W / 4, eave + rise / 2, z, { r: 0.003, rz: -s * Math.atan2(rise, W / 2) });
    }
    for (const s of [-1, 1]) k.box('frame', f, 0.04, 0.04, L, s * (W / 2 - 0.03), eave, 0, { r: 0.003 });
    k.box('frame', f, 0.05, 0.05, L, 0, eave + rise, 0, { r: 0.003 });
    // glazing
    for (const s of [-1, 1]) {
      k.box('glass', 'glass-clear', 0.006, eave - base, L - 0.06, s * (W / 2 - 0.03), (base + eave) / 2, 0, { r: 0 });
      const sl = Math.hypot(W / 2, rise);
      k.box('glass', 'glass-clear', sl, 0.006, L, s * W / 4, eave + rise / 2 + 0.02, 0, { r: 0, rz: -s * Math.atan2(rise, W / 2) });
      const gable = new THREE.Shape([V2(-W / 2 + 0.03, 0), V2(W / 2 - 0.03, 0), V2(W / 2 - 0.03, eave - base), V2(0, eave - base + rise), V2(-W / 2 + 0.03, eave - base)]);
      k.panel('glass', 'glass-clear', gable, 0.006, 0, base, s * (L / 2 - 0.03), { bevel: 0 });
    }
    // door in the front (+z) gable
    const dw = 0.7, dh = 1.75, zf = L / 2 - 0.01;
    for (const s of [-1, 1]) k.box('frame', f, 0.04, dh, 0.04, s * dw / 2, dh / 2, zf, { r: 0.003 });
    k.box('frame', f, dw, 0.04, 0.04, 0, dh, zf, { r: 0.003 });
    k.box('frame', f, dw, 0.04, 0.04, 0, 0.9, zf + 0.02, { r: 0.003 });
    k.box('frame', f, 0.02, 0.14, 0.03, dw / 2 - 0.06, 1.0, zf + 0.04, { r: 0.003 });
    if (p.bench) {
      k.box('bench', 'wood-pine', 0.5, 0.03, L - 0.5, -W / 2 + 0.33, 0.8, -0.1, { r: 0.003 });
      for (const z of [-L / 2 + 0.3, L / 2 - 0.5]) k.box('bench', 'wood-pine', 0.04, 0.78, 0.04, -W / 2 + 0.33, 0.39, z, { r: 0.003 });
      const n = Math.max(2, Math.floor((L - 0.7) / 0.35));
      for (let i = 0; i < n; i++) {
        const z = -L / 2 + 0.4 + ((L - 1.0) * i) / Math.max(1, n - 1);
        const top = addPot(k, { r: 0.08, h: 0.14, mat: 'ceramic-terracotta', x: -W / 2 + 0.33, z, y0: 0.815 });
        leafBall(k, -W / 2 + 0.33, top + 0.08, z, 0.11);
      }
    }
    return finish(k);
  },
});

const coldFrame = mk({
  id: 'out-cold-frame', category: 'outdoor', ko: '콜드프레임(미니 온실 상자)', en: 'Cold frame',
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 1.8), P.num('open', '뚜껑 열림(°)', 'Lid open (°)', 25, 0, 70, 1), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood')],
  tags: ['cold frame', 'mini greenhouse', 'seedling box', 'propagator', '콜드프레임', '미니 온실', '모종 상자', '육묘 상자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, d = 0.6, hb = 0.45, hf = 0.25, t = 0.025, w = p.wood;
    k.box('box', w, W, hf, t, 0, hf / 2, d / 2 - t / 2, { r: 0.003 });
    k.box('box', w, W, hb, t, 0, hb / 2, -d / 2 + t / 2, { r: 0.003 });
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape([V2(-d / 2, 0), V2(d / 2, 0), V2(d / 2, hb), V2(-d / 2, hf)]);
      k.panel('box', w, sh, t, s * (W / 2 - t / 2), 0, 0, { ry: PI / 2, bevel: 0.002 });
    }
    k.box('soil', 'soil', W - 2 * t, 0.02, d - 2 * t, 0, 0.1, 0, { r: 0 });
    const rand = rng(9);
    for (let i = 0; i < 6; i++) leafBall(k, -W / 2 + 0.15 + ((W - 0.3) * i) / 5, 0.15, (rand() - 0.5) * 0.25, 0.05 + rand() * 0.02, 'plant-leaf-light');
    const s = Math.atan2(hb - hf, d), Ll = Math.hypot(d, hb - hf) + 0.03;
    const m = new THREE.Matrix4().makeTranslation(0, hb + 0.012, -d / 2).multiply(new THREE.Matrix4().makeRotationX(s - p.open * DEG));
    withMatrix(k, m, () => {
      for (const sx of [-1, 1]) k.box('lid', w, 0.045, 0.03, Ll, sx * (W / 2 - 0.0225), 0, Ll / 2, { r: 0.003 });
      for (const z of [0.0225, Ll - 0.0225]) k.box('lid', w, W, 0.03, 0.045, 0, 0, z, { r: 0.003 });
      k.box('glass', 'glass-clear', W - 0.08, 0.006, Ll - 0.08, 0, 0, Ll / 2, { r: 0 });
      k.box('lid', 'metal-black', 0.12, 0.02, 0.02, 0, 0.02, Ll - 0.02, { r: 0.004 });
    });
    return finish(k);
  },
});

const kennelSizes = { s: [0.6, 0.5, 0.75], m: [0.8, 0.65, 0.95], l: [1.0, 0.8, 1.15] };
const kennel = mk({
  id: 'out-dog-kennel', category: 'outdoor', ko: '목조 개집', en: 'Wooden dog kennel',
  params: [P.pick('size', '크기', 'Size', 'm', [['s', '소형', 'Small'], ['m', '중형', 'Medium'], ['l', '대형', 'Large']]), P.mat('wood', '벽', 'Walls', 'wood-pine', 'wood'), P.mat('roof', '지붕', 'Roof', 'paint-grey-matte')],
  tags: ['dog house', 'kennel', 'pet house', '개집', '강아지 집', '반려견 집', '펫 하우스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const [w, h, d] = kennelSizes[p.size], rise = w * 0.35, t = 0.02, y0 = 0.06, w0 = p.wood;
    for (const z of [-d / 2 + 0.05, 0, d / 2 - 0.05]) k.box('base', w0, w, 0.04, 0.05, 0, 0.02, z, { r: 0.003 });
    k.box('base', w0, w, 0.02, d, 0, 0.05, 0, { r: 0.003 });
    const outline = [V2(-w / 2, 0), V2(w / 2, 0), V2(w / 2, h), V2(0, h + rise), V2(-w / 2, h)];
    const front = new THREE.Shape(outline);
    const dw = w * 0.5, dh = h * 0.78, hole = new THREE.Path();
    hole.moveTo(-dw / 2, 0.04); hole.lineTo(-dw / 2, dh - dw / 2); hole.absarc(0, dh - dw / 2, dw / 2, PI, 0, true); hole.lineTo(dw / 2, 0.04); hole.lineTo(-dw / 2, 0.04);
    front.holes.push(hole);
    k.panel('walls', w0, front, t, 0, y0, d / 2 - t / 2, { bevel: 0.002 });
    k.panel('walls', w0, new THREE.Shape(outline), t, 0, y0, -d / 2 + t / 2, { bevel: 0.002 });
    for (const s of [-1, 1]) k.box('walls', w0, t, h, d - 2 * t, s * (w / 2 - t / 2), y0 + h / 2, 0, { r: 0.002 });
    const a = Math.atan2(rise, w / 2), sl = Math.hypot(w / 2, rise) + 0.08;
    for (const s of [-1, 1]) k.box('roof', p.roof, sl, 0.025, d + 0.12, s * (w / 4 + 0.03), y0 + h + rise / 2 + 0.02, 0, { r: 0.003, rz: -s * a });
    k.box('trim', 'wood-white', 0.06, 0.03, d + 0.14, 0, y0 + h + rise + 0.03, 0, { r: 0.006 });
    k.box('trim', 'wood-white', 0.16, 0.05, 0.01, 0, y0 + h + rise * 0.45, d / 2 + 0.005, { r: 0.004 });
    return finish(k);
  },
});

const coop = mk({
  id: 'out-chicken-coop', category: 'outdoor', ko: '닭장(산란상자·운동장)', en: 'Chicken coop with run',
  params: [P.len('run', '운동장 길이', 'Run length', 1.4, 0.8, 2.4), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'), P.mat('paint', '외벽', 'Cladding', 'paint-green-matte'), P.mat('roof', '지붕', 'Roof', 'metal-black')],
  tags: ['chicken coop', 'hen house', 'poultry', 'run', '닭장', '양계장', '닭집', '가금'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 1.0, d = 0.8, lift = 0.5, hh = 0.7, rise = 0.3, R = p.run, w0 = p.wood;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', w0, 0.06, lift + hh, 0.06, sx * (w / 2 - 0.03), (lift + hh) / 2, sz * (d / 2 - 0.03), { r: 0.004 });
    k.box('frame', w0, w, 0.03, d, 0, lift, 0, { r: 0.003 });
    for (const s of [-1, 1]) {
      k.box('walls', p.paint, w, hh, 0.02, 0, lift + hh / 2, s * (d / 2 - 0.01), { r: 0.002 });
      const g = new THREE.Shape([V2(-d / 2, 0), V2(d / 2, 0), V2(d / 2, hh), V2(0, hh + rise), V2(-d / 2, hh)]);
      k.panel('walls', p.paint, g, 0.02, s * (w / 2 - 0.01), lift, 0, { ry: PI / 2, bevel: 0.002 });
    }
    const a = Math.atan2(rise, d / 2), sl = Math.hypot(d / 2, rise) + 0.1;
    for (const s of [-1, 1]) k.box('roof', p.roof, w + 0.14, 0.02, sl, 0, lift + hh + rise / 2 + 0.02, s * (d / 4 + 0.03), { r: 0.002, rx: s * a });
    // pop hole + ramp on the front
    k.box('trim', 'paint-black-matte', 0.22, 0.28, 0.01, -0.2, lift + 0.16, d / 2 + 0.002, { r: 0 });
    const rl = Math.hypot(lift, 0.7);
    k.box('frame', w0, 0.25, 0.02, rl, -0.2, lift / 2, d / 2 + 0.35, { r: 0.003, rx: rxOf(-lift, 0.7) });
    for (let i = 1; i < 6; i++) { const f = i / 6; k.box('frame', w0, 0.25, 0.015, 0.015, -0.2, lift * (1 - f) + 0.02, d / 2 + 0.7 * f, { r: 0.002 }); }
    // nesting box on the left with a sloped lid
    k.box('walls', p.paint, 0.35, 0.3, d * 0.7, -w / 2 - 0.175, lift + 0.2, 0, { r: 0.003 });
    k.box('roof', p.roof, 0.42, 0.02, d * 0.74, -w / 2 - 0.19, lift + 0.38, 0, { r: 0.002, rz: 0.25 });
    // wire run on the right
    const x0 = w / 2, rh = lift + hh;
    for (const sz of [-1, 1]) {
      k.box('frame', w0, 0.05, rh, 0.05, x0 + R, rh / 2, sz * (d / 2 - 0.025), { r: 0.004 });
      for (const y of [0.025, rh - 0.025]) k.box('frame', w0, R, 0.05, 0.05, x0 + R / 2, y, sz * (d / 2 - 0.025), { r: 0.004 });
    }
    for (const y of [0.025, rh - 0.025]) k.box('frame', w0, 0.05, 0.05, d, x0 + R, y, 0, { r: 0.004 });
    for (const y of [rh - 0.025]) k.box('frame', w0, 0.05, 0.05, d, x0 + R / 2, y, 0, { r: 0.004 });
    const sp = 0.1, wr = 0.0025, ws = { segs: 3 };
    const nx = Math.round(R / sp), ny = Math.round(rh / sp), nz = Math.round(d / sp);
    for (const sz of [-1, 1]) {
      const z = sz * (d / 2 - 0.025);
      for (let i = 1; i < nx; i++) k.rod('wire', 'metal-steel', [x0 + i * sp, 0.05, z], [x0 + i * sp, rh - 0.05, z], wr, ws);
      for (let j = 1; j < ny; j++) k.rod('wire', 'metal-steel', [x0, j * sp, z], [x0 + R, j * sp, z], wr, ws);
    }
    for (let i = 1; i < nz; i++) k.rod('wire', 'metal-steel', [x0 + R, 0.05, -d / 2 + i * sp], [x0 + R, rh - 0.05, -d / 2 + i * sp], wr, ws);
    for (let j = 1; j < ny; j++) k.rod('wire', 'metal-steel', [x0 + R, j * sp, -d / 2], [x0 + R, j * sp, d / 2], wr, ws);
    for (let i = 1; i < nx; i++) k.rod('wire', 'metal-steel', [x0 + i * sp, rh - 0.03, -d / 2], [x0 + i * sp, rh - 0.03, d / 2], wr, ws);
    return finish(k);
  },
});

const birdhouse = mk({
  id: 'out-birdhouse-pole', category: 'outdoor', ko: '기둥형 새집', en: 'Bird house on a pole',
  params: [P.len('height', '높이', 'Height', 1.8, 1.2, 2.4), P.mat('paint', '외벽', 'House', 'paint-blue-matte'), P.mat('roof', '지붕', 'Roof', 'wood-dark', 'wood')],
  tags: ['bird house', 'birdhouse', 'nest box', 'bird box', '새집', '새 둥지 상자', '버드하우스', '정원 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, y0 = H - 0.32;
    k.box('pole', 'wood-pine', 0.06, y0, 0.06, 0, y0 / 2, 0, { r: 0.004 });
    k.box('pole', 'wood-pine', 0.24, 0.02, 0.22, 0, y0 + 0.01, 0, { r: 0.003 });
    const w = 0.18, h = 0.2, rise = 0.08;
    const g = new THREE.Shape([V2(-w / 2, 0), V2(w / 2, 0), V2(w / 2, h), V2(0, h + rise), V2(-w / 2, h)]);
    for (const s of [-1, 1]) k.panel('house', p.paint, g, 0.015, 0, y0 + 0.02, s * 0.085, { bevel: 0.002 });
    for (const s of [-1, 1]) k.box('house', p.paint, 0.015, h, 0.155, s * (w / 2 - 0.0075), y0 + 0.02 + h / 2, 0, { r: 0.002 });
    const a = Math.atan2(rise, w / 2), sl = Math.hypot(w / 2, rise) + 0.04;
    for (const s of [-1, 1]) k.box('roof', p.roof, sl, 0.015, 0.24, s * (w / 4 + 0.012), y0 + 0.02 + h + rise / 2 + 0.01, 0, { r: 0.002, rz: -s * a });
    k.cyl('hole', 'paint-black-matte', 0.022, 0.022, 0.004, 0, y0 + 0.15, 0.093, { rx: PI / 2, segs: k.seg(16, 6) });
    k.rod('roof', p.roof, [0, y0 + 0.09, 0.092], [0, y0 + 0.09, 0.15], 0.005, { segs: 6 });
    return finish(k);
  },
});

const beehive = mk({
  id: 'out-beehive', category: 'outdoor', ko: '양봉 벌통(랑스트로스)', en: 'Langstroth beehive',
  params: [P.int('boxes', '벌통 단 수', 'Boxes', 3, 1, 4), P.mat('paint', '도장', 'Paint', 'paint-white-matte'), P.mat('roof', '지붕', 'Roof', 'metal-aluminium', 'metal')],
  tags: ['beehive', 'bee hive', 'apiary', 'langstroth', '벌통', '양봉', '꿀벌 상자', '양봉장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.42, d = 0.52;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('stand', 'wood-pine', 0.06, 0.35, 0.06, sx * 0.18, 0.175, sz * 0.24, { r: 0.004 });
    k.box('stand', 'wood-pine', w + 0.04, 0.04, d + 0.12, 0, 0.37, 0.04, { r: 0.004 });
    let y = 0.39;
    for (let i = 0; i < p.boxes; i++) {
      const bh = i === 0 ? 0.24 : 0.17;
      k.box('boxes', p.paint, w, bh - 0.004, d, 0, y + bh / 2, 0, { r: 0.003 });
      for (const s of [-1, 1]) k.box('grips', p.paint, 0.012, 0.03, 0.12, s * (w / 2 + 0.006), y + bh * 0.6, 0, { r: 0.004 });
      if (i === 0) k.box('grips', 'paint-black-matte', 0.24, 0.015, 0.006, 0, y + 0.01, d / 2 + 0.002, { r: 0 });
      y += bh;
    }
    k.box('boxes', p.paint, w + 0.01, 0.02, d + 0.01, 0, y + 0.01, 0, { r: 0.003 });
    k.box('roof', p.roof, w + 0.06, 0.08, d + 0.06, 0, y + 0.06, 0, { r: 0.004 });
    return finish(k);
  },
});

/* ======================================================= fences and walls */

const slatFence = mk({
  id: 'out-slat-fence', category: 'outdoor', ko: '가로 슬랫 울타리', en: 'Horizontal slat fence',
  params: [
    P.len('length', '길이', 'Length', 2.4, 1.2, 4.8), P.len('height', '높이', 'Height', 1.6, 0.8, 2.0), P.len('gap', '간격', 'Gap', 0.02, 0.005, 0.06, 0.005),
    P.mat('wood', '목재', 'Boards', 'wood-teak', 'wood'), P.mat('posts', '기둥', 'Posts', 'metal-black', 'metal'),
  ],
  tags: ['fence', 'slat fence', 'horizontal fence', 'privacy screen', '울타리', '가로 슬랫 펜스', '목재 담장', '가림막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, H = p.height, bh = 0.09, n = Math.max(3, Math.floor((H - 0.05) / (bh + p.gap)));
    const np = Math.max(2, Math.ceil(L / 1.8) + 1);
    for (let i = 0; i < np; i++) k.box('posts', p.posts, 0.07, H + 0.04, 0.07, -L / 2 + 0.035 + ((L - 0.07) * i) / (np - 1), (H + 0.04) / 2, 0, { r: 0.004 });
    for (let j = 0; j < n; j++) k.box('boards', p.wood, L, bh, 0.02, 0, 0.05 + bh / 2 + j * (bh + p.gap), 0.045, { r: 0.003 });
    return finish(k);
  },
});

const ironFence = mk({
  id: 'out-iron-fence', category: 'outdoor', ko: '단조 철제 울타리', en: 'Wrought iron fence panel',
  params: [P.len('length', '길이', 'Length', 2.0, 1.0, 3.6), P.len('height', '높이', 'Height', 1.2, 0.8, 1.8), P.mat('metal', '금속', 'Metal', 'metal-black', 'metal'), P.bool('rings', '링 장식', 'Ring scrolls', true)],
  tags: ['iron fence', 'wrought iron', 'railings', 'metal fence', '철제 울타리', '단조 펜스', '철 담장', '주물 울타리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, H = p.height, m = p.metal;
    for (const s of [-1, 1]) {
      k.box('posts', m, 0.08, H + 0.1, 0.08, s * (L / 2 - 0.04), (H + 0.1) / 2, 0, { r: 0.004 });
      k.sphere('posts', m, 0.05, s * (L / 2 - 0.04), H + 0.15, 0, { segs: k.seg(14, 6), rings: k.seg(10, 4) });
    }
    for (const y of [0.12, H - 0.25, H - 0.08]) k.box('rails', m, L - 0.16, 0.03, 0.025, 0, y, 0, { r: 0.003 });
    const n = Math.round((L - 0.16) / 0.12);
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + 0.08 + ((L - 0.16) * i) / n;
      k.box('pickets', m, 0.016, H - 0.06, 0.016, x, 0.03 + (H - 0.06) / 2, 0, { r: 0.002 });
      k.cyl('pickets', m, 0, 0.022, 0.08, x, H - 0.03, 0, { segs: 4 });
      if (p.rings && i < n) k.add('pickets', m, torusAt(0.04, 0.005, k.seg(6, 3), k.seg(16, 6), x + (L - 0.16) / n / 2, H - 0.165, 0));
    }
    return finish(k);
  },
});

const gabion = mk({
  id: 'out-gabion-wall', category: 'outdoor', ko: '개비온 돌망태 담장', en: 'Gabion stone wall',
  params: [P.len('length', '길이', 'Length', 2.0, 1.0, 4.0), P.len('height', '높이', 'Height', 0.9, 0.5, 1.5), P.mat('stone', '돌', 'Stone', 'granite-grey'), P.bool('top', '목재 상판', 'Timber top', true)],
  tags: ['gabion', 'gabion wall', 'stone cage', 'retaining wall', '개비온', '돌망태', '석축', '돌 담장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, H = p.height, D = 0.3, rand = rng(13);
    k.box('fill', p.stone, L - 0.04, H - 0.04, D - 0.06, 0, H / 2, 0, { r: 0 });
    const sz = Math.max(0.12, L / 22), nx = Math.round(L / sz), ny = Math.max(2, Math.round(H / (sz * 0.75)));
    for (const s of [-1, 1]) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const w = (L - 0.02) / nx, h = (H - 0.02) / ny;
      stone(k, 'stones', p.stone, -L / 2 + 0.01 + w * (i + 0.5) + (rand() - 0.5) * 0.02, 0.01 + h * (j + 0.5), s * (D / 2 - 0.045), w * (0.85 + rand() * 0.2), h * (0.85 + rand() * 0.2), 0.07, (rand() - 0.5) * 0.4);
    }
    const ws = { segs: 3 }, mesh = 0.1, r = 0.003;
    for (const s of [-1, 1]) {
      const z = s * D / 2;
      for (let i = 0; i <= Math.round(L / mesh); i++) { const x = -L / 2 + (L * i) / Math.round(L / mesh); k.rod('cage', 'metal-steel', [x, 0, z], [x, H, z], r, ws); }
      for (let j = 0; j <= Math.round(H / mesh); j++) { const y = (H * j) / Math.round(H / mesh); k.rod('cage', 'metal-steel', [-L / 2, y, z], [L / 2, y, z], r, ws); }
    }
    for (const s of [-1, 1]) for (const y of [0, H]) k.rod('cage', 'metal-steel', [s * L / 2, y, -D / 2], [s * L / 2, y, D / 2], r, ws);
    if (p.top) k.box('top', 'wood-teak', L + 0.04, 0.045, D + 0.06, 0, H + 0.023, 0, { r: 0.005 });
    return finish(k);
  },
});

const giwaWall = mk({
  id: 'out-stone-wall-tiled', category: 'outdoor', ko: '기와 돌담(한옥 담장)', en: 'Korean stone wall with tile cap',
  params: [P.len('length', '길이', 'Length', 2.4, 1.2, 4.8), P.len('height', '높이', 'Height', 1.6, 1.0, 2.2), P.mat('stone', '돌', 'Stone', 'granite-grey'), P.mat('tile', '기와', 'Roof tiles', 'ceramic-matte')],
  tags: ['stone wall', 'korean wall', 'hanok wall', 'tile cap', '돌담', '기와 담장', '한옥 담장', '토담'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, H = p.height, D = 0.4, rand = rng(21);
    const wh = H - 0.35;
    k.box('core', 'wall-plaster', L, wh, D - 0.04, 0, wh / 2, 0, { r: 0.004 });
    const rows = Math.max(3, Math.round(wh / 0.2));
    for (let j = 0; j < rows; j++) {
      const rh = wh / rows;
      let x = -L / 2 + (j % 2 ? 0.08 : 0);
      while (x < L / 2 - 0.05) {
        const sw = Math.min(L / 2 - x, 0.22 + rand() * 0.18);
        for (const s of [-1, 1]) stone(k, 'stones', p.stone, x + sw / 2, rh * (j + 0.5), s * (D / 2 - 0.04), sw - 0.02, rh * (0.8 + rand() * 0.15), 0.09, (rand() - 0.5) * 0.1);
        x += sw;
      }
    }
    // tile cap: a ridge and two sloped sides of round tiles with end discs
    const ov = { overrides: { color: '#45494d' } }, y0 = wh, a = 0.5, half = D / 2 + 0.16, sl = half / Math.cos(a);
    k.box('cap', 'wall-plaster', L, 0.08, D + 0.04, 0, y0 + 0.04, 0, { r: 0.004 });
    for (const s of [-1, 1]) k.box('tiles', p.tile, L + 0.16, 0.03, sl, 0, y0 + 0.1 + half * Math.tan(a) / 2, s * half / 2, { r: 0.004, rx: s * a, ...ov });
    const ridgeY = y0 + 0.12 + half * Math.tan(a);
    k.rod('tiles', p.tile, [-L / 2 - 0.08, ridgeY, 0], [L / 2 + 0.08, ridgeY, 0], 0.06, { segs: k.seg(10, 6), ...ov });
    const n = Math.max(4, Math.round((L + 0.12) / 0.2));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 - 0.04 + ((L + 0.08) * i) / (n - 1);
      for (const s of [-1, 1]) {
        const zt = s * half, yt = ridgeY - half * Math.tan(a) - 0.01;
        k.rod('tiles', p.tile, [x, ridgeY - 0.02, s * 0.05], [x, yt + 0.02, zt], 0.03, { segs: k.seg(8, 4), ...ov });
        k.cyl('tiles', p.tile, 0.034, 0.034, 0.02, x, yt + 0.02, zt, { rx: s * (PI / 2 - a), segs: k.seg(12, 6), ...ov });
      }
    }
    return finish(k);
  },
});

const bamboo = mk({
  id: 'out-bamboo-screen', category: 'outdoor', ko: '대나무 가림막 울타리', en: 'Bamboo screen fence',
  params: [P.len('length', '길이', 'Length', 1.8, 0.9, 3.6), P.len('height', '높이', 'Height', 1.8, 0.9, 2.2), P.mat('bamboo', '대나무', 'Bamboo', 'wood-ash', 'wood'), P.mat('tie', '묶음 끈', 'Ties', 'paint-black-matte')],
  tags: ['bamboo fence', 'bamboo screen', 'japanese fence', 'privacy screen', '대나무 울타리', '대나무 가림막', '죽책', '가림막'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, H = p.height, rand = rng(4);
    for (const s of [-1, 1]) k.cyl('posts', 'wood-dark', 0.045, 0.05, H + 0.1, s * (L / 2 - 0.05), 0, 0, { segs: k.seg(14, 6) });
    const n = Math.round((L - 0.12) / 0.045);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.08 + ((L - 0.16) * i) / (n - 1), r = 0.018 + rand() * 0.005, h = H - 0.03 - rand() * 0.04;
      k.cyl('culms', p.bamboo, r, r, h, x, 0.02, 0.0, { segs: k.seg(10, 5) });
      for (let y = 0.25 + rand() * 0.1; y < h; y += 0.32) k.cyl('culms', p.bamboo, r + 0.003, r + 0.003, 0.012, x, y, 0, { segs: k.seg(10, 5) });
    }
    for (const y of [0.3, H * 0.55, H - 0.2]) for (const s of [-1, 1]) {
      k.rod('rails', p.bamboo, [-L / 2 + 0.05, y, s * 0.035], [L / 2 - 0.05, y, s * 0.035], 0.016, { segs: k.seg(10, 5) });
      for (let i = 0; i < 4; i++) k.box('ties', p.tie, 0.015, 0.04, 0.1, -L / 2 + 0.25 + ((L - 0.5) * i) / 3, y, 0, { r: 0.004 });
    }
    return finish(k);
  },
});

/* ====================================================== decks and paths */

const deck = mk({
  id: 'out-deck-steps', category: 'outdoor', ko: '원목 데크(계단 포함)', en: 'Timber deck with steps',
  params: [
    P.len('width', '폭', 'Width', 3.0, 1.8, 5.0), P.len('depth', '깊이', 'Depth', 2.4, 1.5, 4.0), P.len('height', '높이', 'Height', 0.45, 0.2, 0.9),
    P.mat('wood', '데크재', 'Decking', 'wood-teak', 'wood'), P.bool('rail', '난간', 'Railing', true),
  ],
  tags: ['deck', 'decking', 'terrace', 'patio deck', '데크', '원목 데크', '테라스', '마루 데크'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = p.height, w = p.wood, bw = 0.14;
    const n = Math.floor(D / (bw + 0.006));
    for (let i = 0; i < n; i++) k.box('boards', w, W, 0.025, bw, 0, H - 0.0125, -D / 2 + (bw + 0.006) * (i + 0.5), { r: 0.003 });
    for (const s of [-1, 1]) {
      k.box('fascia', w, W, H - 0.025, 0.025, 0, (H - 0.025) / 2, s * (D / 2 - 0.0125), { r: 0.003 });
      k.box('fascia', w, 0.025, H - 0.025, D - 0.05, s * (W / 2 - 0.0125), (H - 0.025) / 2, 0, { r: 0.003 });
    }
    const steps = Math.max(1, Math.ceil(H / 0.18)), rise = H / steps, sw = Math.min(1.2, W * 0.45);
    for (let i = 1; i < steps; i++) {
      const y = rise * i, z = D / 2 + 0.3 * (steps - i) - 0.15;
      k.box('steps', w, sw, 0.03, 0.3, 0, y - 0.015, z, { r: 0.003 });
      k.box('fascia', w, sw, y - 0.03, 0.025, 0, (y - 0.03) / 2, z + 0.14, { r: 0.003 });
    }
    if (steps > 1) for (const s of [-1, 1]) {
      const zl = D / 2 + 0.3 * (steps - 1);
      k.box('fascia', w, 0.04, H, zl - D / 2, s * (sw / 2 + 0.02), H / 2, (D / 2 + zl) / 2, { r: 0.003 });
    }
    if (p.rail) {
      // back and both sides (the front stays open for the steps); inset 4 cm from the edge
      const rh = 0.9, xi = W / 2 - 0.04, zi = D / 2 - 0.04;
      const runs = [[[-xi, -zi], [xi, -zi]], [[-xi, -zi], [-xi, zi]], [[xi, -zi], [xi, zi]]];
      for (const [a, b] of runs) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), along = a[1] === b[1];
        const at = (f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        const np = Math.max(2, Math.round(len / 1.2) + 1);
        for (let i = 0; i < np; i++) { const [x, z] = at(i / (np - 1)); k.box('rail', w, 0.08, rh, 0.08, x, H + rh / 2, z, { r: 0.004 }); }
        const [mx, mz] = at(0.5);
        k.box('rail', w, along ? len + 0.1 : 0.1, 0.04, along ? 0.1 : len + 0.1, mx, H + rh + 0.02, mz, { r: 0.004 });
        const nb = Math.round(len / 0.12);
        for (let i = 1; i < nb; i++) { const [x, z] = at(i / nb); k.box('rail', w, 0.035, rh - 0.1, 0.035, x, H + (rh - 0.1) / 2 + 0.05, z, { r: 0.003 }); }
      }
    }
    return finish(k);
  },
});

const steppingStones = mk({
  id: 'out-stepping-stones', category: 'outdoor', ko: '정원 디딤돌 길', en: 'Stepping stone path',
  params: [P.int('count', '돌 개수', 'Stones', 7, 3, 14), P.len('spacing', '간격', 'Spacing', 0.55, 0.4, 0.8), P.mat('stone', '돌', 'Stone', 'granite-grey'), P.bool('moss', '잔디·이끼', 'Grass tufts', true)],
  tags: ['stepping stones', 'garden path', 'stone path', 'pavers', '디딤돌', '징검돌', '정원 길', '판석'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.count, rand = rng(17);
    for (let i = 0; i < n; i++) {
      const z = -((n - 1) * p.spacing) / 2 + i * p.spacing, x = Math.sin(i * 0.9) * 0.18, r = 0.2 + rand() * 0.06;
      k.lathe('stones', p.stone, [[0, 0], [r, 0], [r, 0.03], [r * 0.93, 0.05], [0, 0.05]], x, 0, z, { segs: k.seg(14, 7), scale: [1, 1, 0.7 + rand() * 0.25], ry: rand() * PI });
      if (p.moss && i % 2 === 0) tuft(k, x + (rand() > 0.5 ? 1 : -1) * (r + 0.05), 0, z + 0.1, 0.12, rand, 6);
    }
    return finish(k);
  },
});

const bridge = mk({
  id: 'out-garden-bridge', category: 'outdoor', ko: '아치형 정원 다리', en: 'Arched garden bridge',
  params: [P.len('span', '길이', 'Span', 2.4, 1.5, 4.0), P.len('width', '폭', 'Width', 0.9, 0.6, 1.4), P.len('rise', '아치 높이', 'Rise', 0.35, 0.15, 0.6), P.mat('wood', '목재', 'Wood', 'wood-teak', 'wood'), P.mat('rail', '난간', 'Railing', 'paint-white-matte')],
  tags: ['garden bridge', 'arched bridge', 'footbridge', 'wooden bridge', '정원 다리', '아치 다리', '목교', '연못 다리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const S = p.span, W = p.width, R = p.rise;
    const y = (x) => 0.06 + R * (1 - (2 * x / S) ** 2), slope = (x) => -8 * R * x / (S * S);
    const n = Math.round(S / 0.1);
    for (let i = 0; i < n; i++) {
      const x = -S / 2 + (S * (i + 0.5)) / n;
      k.box('deck', p.wood, 0.092, 0.03, W, x, y(x), 0, { r: 0.003, rz: Math.atan(slope(x)) });
    }
    const arc = (dy, z) => Array.from({ length: 13 }, (_, i) => { const x = -S / 2 + (S * i) / 12; return [x, y(x) + dy, z]; });
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - 0.03);
      k.tube('stringers', p.wood, arc(-0.06, z), 0.045, { segs: k.seg(24, 10), radial: k.seg(8, 4) });
      k.tube('rail', p.rail, arc(0.8, z + s * 0.01), 0.025, { segs: k.seg(24, 10), radial: k.seg(8, 4), caps: true });
      k.tube('rail', p.rail, arc(0.42, z + s * 0.01), 0.015, { segs: k.seg(24, 10), radial: k.seg(6, 4) });
      const np = Math.max(3, Math.round(S / 0.6) + 1);
      for (let i = 0; i < np; i++) {
        const x = -S / 2 + 0.05 + ((S - 0.1) * i) / (np - 1);
        k.box('rail', p.rail, 0.06, 0.8, 0.06, x, y(x) + 0.4, z + s * 0.01, { r: 0.004 });
        k.sphere('rail', p.rail, 0.04, x, y(x) + 0.83, z + s * 0.01, { segs: k.seg(10, 5), rings: k.seg(6, 3) });
      }
    }
    return finish(k);
  },
});

/* ==================================================== cooking and heat */

const smoker = mk({
  id: 'out-offset-smoker', category: 'outdoor', ko: '오프셋 바비큐 훈연기', en: 'Offset barrel smoker',
  params: [P.len('length', '드럼 길이', 'Barrel length', 0.9, 0.6, 1.3), P.mat('metal', '몸체', 'Body', 'paint-black-matte'), P.mat('shelf', '선반', 'Shelf', 'wood-teak', 'wood')],
  tags: ['smoker', 'offset smoker', 'bbq smoker', 'barrel grill', '훈연기', '스모커', '바비큐 그릴', '드럼통 그릴'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, m = p.metal, r = 0.24, cy = 0.82;
    k.cyl('body', m, r, r, L, -L / 2, cy, 0, { rz: -PI / 2, segs: k.seg(28, 10) });
    k.cyl('body', m, 0.17, 0.17, 0.42, L / 2, cy - 0.12, 0, { rz: -PI / 2, segs: k.seg(24, 8) });
    k.cyl('body', m, 0.06, 0.06, 0.55, -L / 2 + 0.1, cy + r - 0.03, 0, { segs: k.seg(14, 6) });
    k.cyl('body', m, 0.075, 0.075, 0.02, -L / 2 + 0.1, cy + r + 0.5, 0, { segs: k.seg(14, 6) });
    k.box('body', m, L - 0.04, 0.008, 0.01, 0, cy, r - 0.002, { r: 0 });
    k.rod('handles', 'metal-steel', [-L * 0.3, cy + 0.2, r + 0.08], [L * 0.3, cy + 0.2, r + 0.08], 0.012, { segs: k.seg(10, 5) });
    for (const x of [-L * 0.3, L * 0.3]) k.rod('handles', 'metal-steel', [x, cy + 0.17, r - 0.02], [x, cy + 0.2, r + 0.08], 0.007, { segs: 5 });
    k.cyl('handles', 'metal-chrome', 0.035, 0.035, 0.02, 0, cy + 0.12, r - 0.005, { rx: PI / 2 + 0.5, segs: k.seg(16, 6) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', m, [sx * (L / 2 - 0.06), cy - r + 0.04, sz * 0.18], [sx * (L / 2 - 0.02), 0, sz * 0.22], 0.016, { segs: k.seg(8, 4) });
    for (const sz of [-1, 1]) k.cyl('frame', 'rubber-black', 0.09, 0.09, 0.04, L / 2 - 0.02, 0.09, sz * 0.24, { rx: PI / 2, segs: k.seg(18, 8) });
    k.box('frame', m, L, 0.03, 0.03, 0, 0.25, -0.2, { r: 0.003 });
    for (let i = 0; i < 4; i++) k.box('shelf', p.shelf, L - 0.1, 0.02, 0.08, 0, 0.27, -0.15 + i * 0.1, { r: 0.003 });
    return finish(k);
  },
});

const chiminea = mk({
  id: 'out-chiminea', category: 'outdoor', ko: '치미니아 화로', en: 'Clay chiminea',
  params: [P.len('height', '높이', 'Height', 1.2, 0.9, 1.6), P.mat('clay', '점토', 'Clay', 'ceramic-terracotta'), P.bool('lit', '불 켜기', 'Lit', true)],
  tags: ['chiminea', 'clay fireplace', 'patio fire', 'fire pit', '치미니아', '화로', '야외 벽난로', '테라코타 화로'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, st = 0.18, s = (H - st) / 1.0;
    k.add('stand', 'metal-black', torusAt(0.24, 0.012, k.seg(6, 3), k.seg(24, 8), 0, st, 0, PI / 2));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('stand', 'metal-black', [Math.sin(a) * 0.24, st, Math.cos(a) * 0.24], [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], 0.012, { segs: 6 }); }
    const prof = [[0, 0], [0.18, 0], [0.28, 0.08], [0.31, 0.2], [0.29, 0.34], [0.2, 0.46], [0.11, 0.56], [0.09, 0.62], [0.085, 0.92], [0.1, 0.96], [0.1, 1.0], [0.07, 1.0], [0.07, 0.6], [0, 0.6]].map(([r, y]) => [r, y * s]);
    k.lathe('body', p.clay, prof, 0, st, 0, { smooth: 30, segs: k.seg(32, 10) });
    // the mouth on the front: a dark opening with a lip
    const mz = 0.29, my = st + 0.2 * s;
    k.cyl('mouth', 'paint-black-matte', 0.15, 0.15, 0.06, 0, my, mz - 0.04, { rx: PI / 2, segs: k.seg(24, 8) });
    k.add('body', p.clay, torusAt(0.15, 0.02, k.seg(8, 4), k.seg(24, 8), 0, my, mz + 0.02));
    if (p.lit) {
      k.lathe('fire', 'light-warm', [[0, 0], [0.08, 0], [0.05, 0.08], [0.02, 0.14], [0, 0.17]], 0, my - 0.13, mz + 0.0, { segs: k.seg(12, 6), scale: [1, 1, 0.4] });
      k.light(0, my, mz + 0.1, { color: '#ff9a4a', intensity: 0.8, distance: 4 });
    }
    return finish(k);
  },
});

const heater = mk({
  id: 'out-patio-heater', category: 'outdoor', ko: '파라솔형 가스 히터', en: 'Mushroom patio heater',
  params: [P.len('height', '높이', 'Height', 2.25, 1.9, 2.5), P.mat('metal', '몸체', 'Body', 'metal-steel', 'metal'), P.bool('on', '켜기', 'On', true)],
  tags: ['patio heater', 'gas heater', 'mushroom heater', 'outdoor heater', '파라솔 히터', '가스 히터', '야외 난로', '테라스 히터'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, m = p.metal;
    k.cyl('body', m, 0.24, 0.24, 0.02, 0, 0, 0, { segs: k.seg(28, 10) });
    k.cyl('body', m, 0.2, 0.22, 0.7, 0, 0.02, 0, { segs: k.seg(28, 10) });
    k.cyl('body', m, 0.03, 0.03, H - 1.08, 0, 0.72, 0, { segs: k.seg(14, 6) });
    k.box('body', 'plastic-black', 0.06, 0.08, 0.02, 0, 0.6, 0.215, { r: 0.004 });
    const ey = H - 0.38;
    k.cyl('emitter', p.on ? 'light-warm' : 'metal-black', 0.085, 0.085, 0.3, 0, ey, 0, { segs: k.seg(20, 8) });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; k.rod('grille', m, [Math.sin(a) * 0.1, ey, Math.cos(a) * 0.1], [Math.sin(a) * 0.1, ey + 0.3, Math.cos(a) * 0.1], 0.005, { segs: 4 }); }
    k.lathe('reflector', m, [[0, 0], [0.42, -0.06], [0.43, -0.05], [0.03, 0.06], [0, 0.07]], 0, H - 0.04, 0, { segs: k.seg(32, 10) });
    if (p.on) k.light(0, ey + 0.15, 0, { color: '#ff8a3a', intensity: 0.6, distance: 3.5 });
    return finish(k);
  },
});

/* ==================================================================== play */

const swingSet = mk({
  id: 'out-swing-set', category: 'outdoor', ko: '어린이 그네(A형 프레임)', en: 'Children\'s swing set',
  params: [P.int('seats', '그네 수', 'Swings', 2, 1, 3), P.len('height', '높이', 'Height', 2.1, 1.8, 2.5), P.mat('frame', '프레임', 'Frame', 'wood-pine', 'wood'), P.color('seatColor', '좌석 색', 'Seat colour', '#d8433a')],
  tags: ['swing set', 'kids swing', 'playground', 'garden swing', '그네', '어린이 그네', '놀이터', '놀이 기구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.seats, H = p.height, L = 0.75 * n + 0.6, spread = H * 0.38;
    for (const s of [-1, 1]) for (const sz of [-1, 1]) k.rod('frame', p.frame, [s * L / 2, H, 0], [s * (L / 2 + 0.25), 0, sz * spread], 0.045, { segs: k.seg(10, 6) });
    for (const s of [-1, 1]) k.rod('frame', p.frame, [s * (L / 2 + 0.1), H * 0.55, -spread * 0.45], [s * (L / 2 + 0.1), H * 0.55, spread * 0.45], 0.025, { segs: k.seg(8, 5) });
    k.rod('frame', p.frame, [-L / 2 - 0.08, H + 0.02, 0], [L / 2 + 0.08, H + 0.02, 0], 0.055, { segs: k.seg(12, 6) });
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.3 + 0.75 * (i + 0.5);
      k.box('seats', 'rubber-black', 0.45, 0.025, 0.17, x, 0.45, 0, { r: 0.008, overrides: { color: p.seatColor } });
      for (const s of [-1, 1]) {
        k.rod('chains', 'metal-steel', [x + s * 0.2, H - 0.03, 0], [x + s * 0.2, 0.46, 0], 0.006, { segs: 5 });
        k.cyl('chains', 'metal-steel', 0.02, 0.02, 0.05, x + s * 0.2, H - 0.06, 0, { segs: 8 });
      }
    }
    return finish(k);
  },
});

const slide = mk({
  id: 'out-play-slide', category: 'outdoor', ko: '어린이 미끄럼틀', en: 'Children\'s slide',
  params: [P.len('height', '발판 높이', 'Deck height', 1.2, 0.8, 1.6), P.mat('frame', '프레임', 'Frame', 'wood-pine', 'wood'), P.color('chute', '미끄럼판 색', 'Chute colour', '#2f8a4a')],
  tags: ['slide', 'kids slide', 'playground slide', 'play equipment', '미끄럼틀', '어린이 놀이터', '놀이 기구', '슬라이드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, f = p.frame, pw = 0.7, ov = { overrides: { color: p.chute } };
    for (const sx of [-1, 1]) for (const z of [-0.35, 0.35]) k.box('frame', f, 0.07, H + 0.7, 0.07, sx * pw / 2, (H + 0.7) / 2, z, { r: 0.004 });
    k.box('deck', f, pw, 0.04, 0.7, 0, H, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const y of [H + 0.35, H + 0.65]) k.box('frame', f, 0.04, 0.04, 0.7, sx * pw / 2, y, 0, { r: 0.004 });
    k.box('frame', f, pw, 0.04, 0.04, 0, H + 0.65, -0.35, { r: 0.004 });
    // ladder at the back
    const lz = -0.35 - H * 0.35;
    for (const sx of [-1, 1]) k.rod('frame', f, [sx * 0.22, 0, lz], [sx * 0.22, H + 0.02, -0.36], 0.03, { segs: k.seg(8, 5) });
    const rungs = Math.round(H / 0.25);
    for (let i = 1; i <= rungs; i++) { const t = i / (rungs + 0.3); k.rod('frame', f, [-0.22, H * t, lz + (lz * -1 - 0.36) * t], [0.22, H * t, lz + (lz * -1 - 0.36) * t], 0.018, { segs: 6 }); }
    // chute down to the front
    const run = H * 1.6, drop = H - 0.25, len = Math.hypot(run, drop), a = rxOf(-drop, run), zc = 0.35 + run / 2;
    k.box('chute', 'plastic-white', 0.48, 0.025, len, 0, (H + 0.25) / 2, zc, { r: 0.006, rx: a, ...ov });
    for (const sx of [-1, 1]) k.box('chute', 'plastic-white', 0.025, 0.14, len, sx * 0.25, (H + 0.25) / 2 + 0.06, zc, { r: 0.006, rx: a, ...ov });
    k.box('chute', 'plastic-white', 0.48, 0.025, 0.4, 0, 0.25, 0.35 + run + 0.18, { r: 0.006, ...ov });
    for (const sx of [-1, 1]) k.box('frame', f, 0.05, 0.25, 0.05, sx * 0.2, 0.125, 0.35 + run + 0.3, { r: 0.004 });
    return finish(k);
  },
});

const jungleGym = mk({
  id: 'out-climbing-frame', category: 'outdoor', ko: '정글짐', en: 'Climbing frame (jungle gym)',
  params: [P.int('cols', '가로 칸', 'Bays across', 3, 2, 5), P.int('rows', '층 수', 'Levels', 3, 2, 4), P.color('color', '색', 'Colour', '#2e6fbf'), P.bool('deck', '꼭대기 발판', 'Top deck', true)],
  tags: ['climbing frame', 'jungle gym', 'monkey bars', 'playground', '정글짐', '철봉', '놀이터', '놀이 기구'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const c = 0.5, nx = p.cols, ny = p.rows, nz = 2, ov = { overrides: { color: p.color } }, o = { segs: k.seg(8, 5), ...ov };
    const X = (i) => -nx * c / 2 + i * c, Z = (j) => -nz * c / 2 + j * c;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) k.rod('bars', 'metal-white', [X(i), 0, Z(j)], [X(i), ny * c, Z(j)], 0.018, o);
    for (let l = 1; l <= ny; l++) {
      for (let j = 0; j <= nz; j++) k.rod('bars', 'metal-white', [X(0), l * c, Z(j)], [X(nx), l * c, Z(j)], 0.015, o);
      for (let i = 0; i <= nx; i++) k.rod('bars', 'metal-white', [X(i), l * c, Z(0)], [X(i), l * c, Z(nz)], 0.015, o);
    }
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) k.cyl('feet', 'metal-white', 0.03, 0.03, 0.02, X(i), 0, Z(j), { segs: 8 });
    if (p.deck) k.box('deck', 'wood-pine', c - 0.04, 0.03, nz * c - 0.04, X(nx - 1) + c / 2, ny * c + 0.02, 0, { r: 0.004 });
    return finish(k);
  },
});

const hoop = mk({
  id: 'out-basketball-hoop', category: 'outdoor', ko: '이동식 농구 골대', en: 'Portable basketball hoop',
  params: [P.len('rim', '림 높이', 'Rim height', 3.05, 2.3, 3.05), P.mat('pole', '기둥', 'Pole', 'paint-black-matte')],
  tags: ['basketball hoop', 'basketball', 'hoop', 'sports', '농구 골대', '농구대', '운동', '놀이'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.rim, m = p.pole;
    k.box('base', 'plastic-black', 0.7, 0.3, 1.1, 0, 0.15, -0.55, { r: 0.04, segs: 2 });
    for (const s of [-1, 1]) k.cyl('base', 'rubber-black', 0.07, 0.07, 0.05, s * 0.36, 0.07, -1.0, { rz: PI / 2, segs: 12 });
    k.rod('pole', m, [0, 0.3, -0.8], [0, R + 0.3, -0.6], 0.045, { segs: k.seg(14, 6) });
    k.rod('pole', m, [0, 0.4, -0.2], [0, 1.5, -0.68], 0.025, { segs: k.seg(10, 5) });
    for (const y of [R - 0.05, R + 0.35]) k.rod('pole', m, [0, y, -0.62], [0, y, -0.18], 0.025, { segs: k.seg(10, 5) });
    k.box('board', 'glass-clear', 1.1, 0.72, 0.012, 0, R + 0.15, -0.15, { r: 0 });
    for (const [w, h, x, y] of [[1.12, 0.03, 0, R - 0.2], [1.12, 0.03, 0, R + 0.5], [0.03, 0.72, -0.55, R + 0.15], [0.03, 0.72, 0.55, R + 0.15], [0.59, 0.02, 0, R + 0.29], [0.02, 0.45, -0.29, R + 0.06], [0.02, 0.45, 0.29, R + 0.06]]) k.box('lines', 'paint-white-gloss', w, h, 0.02, x, y, -0.14, { r: 0.002 });
    k.add('rim', 'metal-copper', torusAt(0.23, 0.009, k.seg(6, 4), k.seg(28, 10), 0, R, 0.12, PI / 2), { overrides: { color: '#e25a1c' } });
    k.box('rim', 'metal-copper', 0.12, 0.012, 0.1, 0, R, -0.1, { r: 0.002, overrides: { color: '#e25a1c' } });
    const nn = 12;
    for (let i = 0; i < nn; i++) { const a = (i / nn) * PI * 2; k.rod('net', 'fabric-cotton-white', [Math.sin(a) * 0.23, R, 0.12 + Math.cos(a) * 0.23], [Math.sin(a + 0.4) * 0.15, R - 0.4, 0.12 + Math.cos(a + 0.4) * 0.15], 0.003, { segs: 3 }); }
    k.add('net', 'fabric-cotton-white', torusAt(0.15, 0.003, 3, k.seg(20, 8), 0, R - 0.4, 0.12, PI / 2));
    return finish(k);
  },
});

/* ================================================================== lights */

const festoon = mk({
  id: 'out-festoon-poles', category: 'outdoor', ko: '스트링 전구 조명 기둥', en: 'Festoon light poles',
  params: [P.int('poles', '기둥 수', 'Poles', 3, 2, 5), P.len('span', '기둥 간격', 'Span', 3.0, 2.0, 5.0), P.len('height', '높이', 'Height', 2.6, 2.0, 3.2), P.mat('pole', '기둥', 'Poles', 'wood-dark', 'wood')],
  tags: ['festoon lights', 'string lights', 'party lights', 'garden lights', '스트링 조명', '전구 줄 조명', '가랜드 조명', '야외 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.poles, S = p.span, H = p.height, x0 = -((n - 1) * S) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * S;
      k.box('poles', p.pole, 0.07, H, 0.07, x, H / 2, 0, { r: 0.004 });
      k.box('poles', 'concrete', 0.3, 0.1, 0.3, x, 0.05, 0, { r: 0.01 });
      k.rod('hooks', 'metal-black', [x, H - 0.05, 0.035], [x, H - 0.05, 0.12], 0.006, { segs: 5 });
    }
    for (let i = 0; i < n - 1; i++) {
      const xa = x0 + i * S, sag = Math.min(0.45, S * 0.1);
      const pts = Array.from({ length: 11 }, (_, j) => { const t = j / 10; return [xa + S * t, H - 0.05 - sag * 4 * t * (1 - t), 0.12]; });
      k.tube('wire', 'rubber-black', pts, 0.004, { segs: k.seg(20, 8), radial: 4 });
      const nb = Math.round(S / 0.5);
      for (let b = 1; b < nb; b++) {
        const t = b / nb, x = xa + S * t, y = H - 0.05 - sag * 4 * t * (1 - t);
        k.cyl('wire', 'rubber-black', 0.008, 0.008, 0.04, x, y - 0.04, 0.12, { segs: 5 });
        k.sphere('bulbs', 'light-warm', 0.028, x, y - 0.075, 0.12, { segs: k.seg(10, 5), rings: k.seg(8, 4), scale: [1, 1.3, 1] });
      }
      k.light(xa + S / 2, H - 0.3, 0.12, { intensity: 0.35, distance: 4 });
    }
    return finish(k);
  },
});

const tiki = mk({
  id: 'out-tiki-torch', category: 'outdoor', ko: '대나무 티키 횃불', en: 'Bamboo tiki torch',
  params: [P.len('height', '높이', 'Height', 1.5, 1.0, 1.9), P.bool('lit', '불 켜기', 'Lit', true)],
  tags: ['tiki torch', 'garden torch', 'bamboo torch', 'lantern', '티키 토치', '횃불', '정원 횃불', '대나무 조명'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, top = H - 0.32;
    k.cyl('pole', 'wood-ash', 0.018, 0.02, top, 0, 0, 0, { segs: k.seg(10, 5) });
    for (let y = 0.3; y < top; y += 0.3) k.cyl('pole', 'wood-ash', 0.022, 0.022, 0.012, 0, y, 0, { segs: k.seg(10, 5) });
    k.lathe('basket', 'rattan', [[0, 0], [0.03, 0], [0.06, 0.08], [0.065, 0.16], [0.055, 0.2], [0, 0.2]], 0, top, 0, { segs: k.seg(16, 6) });
    k.cyl('can', 'metal-black', 0.045, 0.045, 0.03, 0, top + 0.19, 0, { segs: k.seg(14, 6) });
    k.cyl('can', 'fabric-cotton-white', 0.008, 0.008, 0.04, 0, top + 0.22, 0, { segs: 6 });
    if (p.lit) {
      k.lathe('flame', 'light-warm', [[0, 0], [0.035, 0.02], [0.03, 0.06], [0.012, 0.1], [0, 0.12]], 0, top + 0.24, 0, { smooth: 10, segs: k.seg(12, 6) });
      k.light(0, top + 0.3, 0, { color: '#ffa54a', intensity: 0.4, distance: 3 });
    }
    return finish(k);
  },
});

/* ==================================================================== water */

const pond = mk({
  id: 'out-garden-pond', category: 'outdoor', ko: '정원 연못(수련·갈대)', en: 'Garden pond with lilies',
  params: [P.len('width', '폭', 'Width', 2.4, 1.4, 4.0), P.len('depth', '깊이', 'Depth', 1.6, 1.0, 3.0), P.mat('stone', '경계석', 'Edge stones', 'granite-grey'), P.bool('plants', '수련·갈대', 'Lilies & reeds', true)],
  tags: ['pond', 'garden pond', 'water feature', 'koi pond', '연못', '정원 연못', '수경 시설', '수련'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, rand = rng(23), N = 48;
    const rad = (t) => 1 + 0.1 * Math.sin(3 * t + 1) + 0.06 * Math.sin(5 * t + 2);
    const at = (t, s) => [Math.cos(t) * W / 2 * rad(t) * s, Math.sin(t) * D / 2 * rad(t) * s];
    const shape = (s) => new THREE.Shape(Array.from({ length: N }, (_, i) => V2(...at((i / N) * PI * 2, s))));
    k.slab('liner', 'paint-black-matte', shape(0.97), 0.03, 0, { bevel: 0.004 });
    k.slab('water', 'water', shape(0.95), 0.012, 0.035, { bevel: 0.002 });
    const ns = Math.round((PI * (W + D) / 2) / 0.24);
    for (let i = 0; i < ns; i++) {
      const t = (i / ns) * PI * 2, [x, z] = at(t, 1.0), sz = 0.18 + rand() * 0.1;
      stone(k, 'stones', p.stone, x, 0.05, z, sz, 0.11 + rand() * 0.05, sz * 0.8, -t + rand() * 0.5);
    }
    if (p.plants) {
      for (let i = 0; i < 5; i++) {
        const [x, z] = at(rand() * PI * 2, 0.2 + rand() * 0.5);
        k.cyl('pads', 'plant-leaf', 0.1 + rand() * 0.04, 0.1, 0.006, x, 0.048, z, { segs: k.seg(14, 6) });
        if (i % 2 === 0) k.sphere('flowers', 'fabric-velvet-rose', 0.035, x + 0.03, 0.065, z, { segs: 8, rings: 5, scale: [1, 0.7, 1] });
      }
      const [rx, rz] = at(2.4, 0.8);
      for (let i = 0; i < 18; i++) k.cyl('reeds', 'plant-stem', 0, 0.007, 0.7 + rand() * 0.5, rx + (rand() - 0.5) * 0.3, 0.03, rz + (rand() - 0.5) * 0.3, { segs: 3, rx: (rand() - 0.5) * 0.2, rz: (rand() - 0.5) * 0.2 });
    }
    return finish(k);
  },
});

const ballFountain = mk({
  id: 'out-ball-fountain', category: 'outdoor', ko: '구형 석재 분수', en: 'Bubbling sphere fountain',
  params: [P.len('ball', '구 지름', 'Sphere diameter', 0.5, 0.3, 0.9), P.mat('stone', '석재', 'Stone', 'granite-grey'), P.mat('pebble', '자갈', 'Pebbles', 'travertine')],
  tags: ['fountain', 'sphere fountain', 'ball fountain', 'water feature', '분수', '구형 분수', '정원 분수', '수경 시설'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = p.ball / 2, B = Math.max(0.8, p.ball + 0.5), rand = rng(31);
    k.box('basin', 'concrete', B, 0.1, B, 0, 0.05, 0, { r: 0.01 });
    const n = Math.round(B / 0.09);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -B / 2 + 0.05 + ((B - 0.1) * i) / (n - 1), z = -B / 2 + 0.05 + ((B - 0.1) * j) / (n - 1);
      if (Math.hypot(x, z) < r * 0.8) continue;
      stone(k, 'pebbles', p.pebble, x + (rand() - 0.5) * 0.02, 0.115, z + (rand() - 0.5) * 0.02, 0.07 + rand() * 0.02, 0.035, 0.06, rand() * PI);
    }
    k.sphere('ball', p.stone, r, 0, 0.1 + r * 0.95, 0, { segs: k.seg(32, 12), rings: k.seg(20, 8) });
    k.sphere('water', 'water', r + 0.004, 0, 0.1 + r * 0.95, 0, { segs: k.seg(32, 12), rings: k.seg(12, 5), thetaLength: PI * 0.55 });
    k.sphere('water', 'water', 0.04, 0, 0.1 + r * 1.95, 0, { segs: k.seg(12, 6), rings: k.seg(6, 3), scale: [1, 0.6, 1] });
    return finish(k);
  },
});

/* ================================================================= utility */

const rotary = mk({
  id: 'out-rotary-line', category: 'outdoor', ko: '회전식 빨래 건조대', en: 'Rotary washing line',
  params: [P.len('radius', '반지름', 'Arm length', 1.2, 0.8, 1.6), P.len('height', '높이', 'Height', 1.8, 1.5, 2.1), P.int('lines', '줄 단 수', 'Line rings', 5, 3, 7)],
  tags: ['rotary washing line', 'clothes line', 'rotary airer', 'laundry', '빨래 건조대', '회전 건조대', '빨랫줄', '야외 건조대'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.radius, H = p.height, hub = H - 0.25;
    k.cyl('pole', 'metal-aluminium', 0.025, 0.025, H, 0, 0, 0, { segs: k.seg(12, 6) });
    k.cyl('pole', 'plastic-grey', 0.05, 0.05, 0.08, 0, hub - 0.04, 0, { segs: k.seg(12, 6) });
    k.cyl('pole', 'plastic-grey', 0.04, 0.04, 0.06, 0, H - 0.03, 0, { segs: k.seg(12, 6) });
    const tips = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4, tip = [Math.sin(a) * R, H + 0.05, Math.cos(a) * R];
      tips.push(a);
      k.rod('arms', 'metal-aluminium', [0, H - 0.02, 0], tip, 0.012, { segs: 6 });
      k.rod('arms', 'metal-aluminium', [0, hub, 0], [Math.sin(a) * R * 0.45, H + 0.0, Math.cos(a) * R * 0.45], 0.009, { segs: 6 });
    }
    for (let l = 1; l <= p.lines; l++) {
      const f = 0.25 + 0.75 * (l / p.lines), y = H - 0.02 + 0.07 * f;
      for (let i = 0; i < 4; i++) {
        const a = tips[i], b = tips[(i + 1) % 4];
        k.rod('lines', 'plastic-white', [Math.sin(a) * R * f, y, Math.cos(a) * R * f], [Math.sin(b) * R * f, y, Math.cos(b) * R * f], 0.0025, { segs: 3 });
      }
    }
    return finish(k);
  },
});

const pottingBench = mk({
  id: 'out-potting-bench', category: 'outdoor', ko: '원예 작업대(포팅 벤치)', en: 'Potting bench',
  params: [P.len('width', '폭', 'Width', 1.2, 0.8, 1.8), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'), P.bool('pots', '화분', 'Pots', true)],
  tags: ['potting bench', 'garden bench', 'work table', 'potting table', '원예 작업대', '분갈이 테이블', '정원 작업대', '포팅 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, d = 0.55, w = p.wood;
    for (const sx of [-1, 1]) {
      k.box('frame', w, 0.05, 0.9, 0.05, sx * (W / 2 - 0.025), 0.45, d / 2 - 0.025, { r: 0.004 });
      k.box('frame', w, 0.05, 1.5, 0.05, sx * (W / 2 - 0.025), 0.75, -d / 2 + 0.025, { r: 0.004 });
      for (const y of [0.18, 0.86]) k.box('frame', w, 0.04, 0.05, d, sx * (W / 2 - 0.025), y, 0, { r: 0.004 });
    }
    for (const [y, n] of [[0.9, 6], [0.22, 5]]) for (let i = 0; i < n; i++) k.box('slats', w, W, 0.022, d / n - 0.008, 0, y, -d / 2 + (d / n) * (i + 0.5), { r: 0.003 });
    k.box('slats', w, W, 0.35, 0.02, 0, 1.12, -d / 2 + 0.01, { r: 0.003 });
    k.box('slats', w, W, 0.022, 0.18, 0, 1.3, -d / 2 + 0.11, { r: 0.003 });
    k.box('slats', w, W, 0.022, 0.12, 0, 1.49, -d / 2 + 0.08, { r: 0.003 });
    if (p.pots) {
      for (let i = 0; i < 3; i++) {
        const x = -W / 2 + 0.2 + i * 0.16;
        const t = addPot(k, { r: 0.06, h: 0.11, mat: 'ceramic-terracotta', x, z: -d / 2 + 0.11, y0: 1.311 });
        leafBall(k, x, t + 0.05, -d / 2 + 0.11, 0.065, i % 2 ? 'plant-leaf-light' : 'plant-leaf');
      }
      const t = addPot(k, { r: 0.11, h: 0.2, mat: 'ceramic-terracotta', x: W * 0.2, z: 0.05, y0: 0.911 });
      leafBall(k, W * 0.2, t + 0.12, 0.05, 0.15);
      for (let i = 0; i < 3; i++) k.lathe('pot', 'ceramic-terracotta', [[0, 0], [0.07, 0], [0.09, 0.12], [0.08, 0.12], [0, 0.01]], -W * 0.25, 0.233 + i * 0.03, 0.02, { segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

/* ================================================================= Korean */

const pyeongsang = mk({
  id: 'out-pyeongsang', category: 'outdoor', ko: '평상(야외 마루 평상)', en: 'Korean pyeongsang platform',
  params: [P.len('width', '폭', 'Width', 1.8, 1.2, 2.4), P.len('depth', '깊이', 'Depth', 1.4, 1.0, 2.0), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'), P.bool('rail', '난간', 'Low rail', true), P.bool('mat', '돗자리', 'Straw mat', true)],
  tags: ['pyeongsang', 'korean platform', 'outdoor daybed', 'wooden platform', '평상', '들마루', '원두막 평상', '야외 마루'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = p.depth, H = 0.42, w = p.wood;
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) k.box('legs', w, 0.09, H - 0.05, 0.09, sx * (W / 2 - 0.06), (H - 0.05) / 2, sz * (D / 2 - 0.06), { r: 0.006 });
    for (const s of [-1, 1]) {
      k.box('frame', w, W, 0.08, 0.06, 0, H - 0.07, s * (D / 2 - 0.03), { r: 0.005 });
      k.box('frame', w, 0.06, 0.08, D - 0.12, s * (W / 2 - 0.03), H - 0.07, 0, { r: 0.005 });
    }
    const n = Math.round(D / 0.12);
    for (let i = 0; i < n; i++) k.box('boards', w, W - 0.02, 0.03, D / n - 0.008, 0, H - 0.015, -D / 2 + (D / n) * (i + 0.5), { r: 0.003 });
    if (p.mat) k.box('mat', 'rattan', W * 0.7, 0.008, D * 0.65, 0, H + 0.004, 0.05, { r: 0.002 });
    if (p.rail) {
      const rh = 0.28, yt = H + rh;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('rail', w, 0.06, rh, 0.06, sx * (W / 2 - 0.03), H + rh / 2, sz * (D / 2 - 0.03), { r: 0.005 });
      k.box('rail', w, W, 0.05, 0.06, 0, yt, -D / 2 + 0.03, { r: 0.005 });
      for (const s of [-1, 1]) k.box('rail', w, 0.06, 0.05, D, s * (W / 2 - 0.03), yt, 0, { r: 0.005 });
      const nb = Math.round(W / 0.15);
      for (let i = 1; i < nb; i++) k.box('rail', w, 0.025, rh, 0.025, -W / 2 + (W * i) / nb, H + rh / 2, -D / 2 + 0.03, { r: 0.003 });
      for (const s of [-1, 1]) for (let i = 1; i < Math.round(D / 0.15); i++) k.box('rail', w, 0.025, rh, 0.025, s * (W / 2 - 0.03), H + rh / 2, -D / 2 + (D * i) / Math.round(D / 0.15), { r: 0.003 });
    }
    return finish(k);
  },
});

const jangdokdae = mk({
  id: 'out-jangdokdae', category: 'outdoor', ko: '장독대(옹기 항아리)', en: 'Jangdokdae with onggi jars',
  params: [P.int('jars', '항아리 수', 'Jars', 6, 3, 9), P.mat('stone', '단', 'Platform', 'granite-grey'), P.color('glaze', '옹기 색', 'Onggi glaze', '#4a2d1e')],
  tags: ['jangdokdae', 'onggi', 'kimchi jar', 'sauce jars', '장독대', '옹기', '항아리', '장독'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.jars, back = Math.ceil(n / 2), front = n - back, W = Math.max(back, front) * 0.62 + 0.3, ov = { overrides: { color: p.glaze } };
    k.box('platform', p.stone, W, 0.18, 1.2, 0, 0.09, 0, { r: 0.02, segs: 2 });
    k.box('platform', p.stone, W, 0.16, 0.6, 0, 0.26, -0.3, { r: 0.02, segs: 2 });
    const jar = (x, y, z, s) => {
      const prof = [[0, 0], [0.14, 0], [0.17, 0.03], [0.25, 0.2], [0.27, 0.32], [0.22, 0.48], [0.15, 0.55], [0.15, 0.58], [0, 0.56]].map(([r, h]) => [r * s, h * s]);
      k.lathe('jars', 'ceramic-white', prof, x, y, z, { smooth: 20, segs: k.seg(28, 10), ...ov });
      k.lathe('jars', 'ceramic-white', [[0, 0], [0.19 * s, 0], [0.18 * s, 0.03 * s], [0.1 * s, 0.07 * s], [0.03 * s, 0.08 * s], [0.03 * s, 0.1 * s], [0, 0.1 * s]], x, y + 0.57 * s, z, { segs: k.seg(24, 8), ...ov });
    };
    for (let i = 0; i < back; i++) jar(-((back - 1) * 0.62) / 2 + i * 0.62, 0.34, -0.3, 1.0);
    for (let i = 0; i < front; i++) jar(-((front - 1) * 0.62) / 2 + i * 0.62, 0.18, 0.3, 0.75);
    return finish(k);
  },
});

const sotdae = mk({
  id: 'out-sotdae', category: 'outdoor', ko: '솟대(나무 새 장대)', en: 'Sotdae bird poles',
  params: [P.int('poles', '장대 수', 'Poles', 3, 1, 5), P.len('height', '높이', 'Height', 2.6, 1.5, 3.5), P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood')],
  tags: ['sotdae', 'bird pole', 'korean totem', 'folk art', '솟대', '새 장대', '전통 장식', '민속'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const n = p.poles, rand = rng(41);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.35, z = (i % 2) * 0.15, H = p.height * (1 - 0.12 * Math.abs(i - (n - 1) / 2)), lean = (rand() - 0.5) * 0.06;
      k.cyl('poles', p.wood, 0.02, 0.03, H, x, 0, z, { segs: k.seg(8, 5), rz: lean });
      const tx = x - Math.sin(lean) * H, ty = H, ry = rand() * PI * 2;
      transformAdded(k, () => {
        k.sphere('birds', p.wood, 0.05, 0, 0.04, 0, { scale: [0.6, 0.55, 1.7], segs: k.seg(12, 6), rings: k.seg(8, 4) });
        k.sphere('birds', p.wood, 0.03, 0, 0.1, 0.07, { segs: k.seg(10, 5), rings: k.seg(6, 4) });
        k.rod('birds', p.wood, [0, 0.07, 0.04], [0, 0.1, 0.07], 0.015, { segs: 6 });
        k.cyl('birds', 'wood-dark', 0, 0.01, 0.05, 0, 0.1, 0.095, { rx: PI / 2, segs: 5 });
        k.box('birds', p.wood, 0.012, 0.03, 0.07, 0, 0.05, -0.1, { r: 0.004, rx: 0.4 });
      }, tx, ty - 0.01, z, ry);
    }
    for (let i = 0; i < 9; i++) stone(k, 'stones', 'granite-grey', (rand() - 0.5) * (n * 0.35 + 0.2), 0.05, (rand() - 0.3) * 0.3, 0.15 + rand() * 0.08, 0.1, 0.13, rand() * PI);
    return finish(k);
  },
});

export const ITEMS = [
  bistro, ropeLounge, steamer, concreteBench, treeBench, glider, barSet, rocking,
  cortenTrough, tieredStand, urnPlinth, herbSpiral,
  louvrePergola, shadeSail, greenhouse, coldFrame, kennel, coop, birdhouse, beehive,
  slatFence, ironFence, gabion, giwaWall, bamboo,
  deck, steppingStones, bridge,
  smoker, chiminea, heater,
  swingSet, slide, jungleGym, hoop,
  festoon, tiki,
  pond, ballFountain,
  rotary, pottingBench,
  pyeongsang, jangdokdae, sotdae,
];
