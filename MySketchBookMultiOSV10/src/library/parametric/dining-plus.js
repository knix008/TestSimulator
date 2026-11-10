// Even more dining designs: square, double-pedestal, lazy-Susan, sawhorse, tripod and wall
// fold-down tables, a wall bar ledge, a table + two benches set, barrel / monobloc / slat-back /
// swivel / paper-cord / Ming horseshoe / leather sling chairs, a gas-lift bar stool, storage and
// pew benches, baker's rack, corner china cabinet, tea trolley, Korean soban, kotatsu, and
// table-top pieces (place setting, cake stand, tea set, wine and glasses).
// Sizes are measured from the default build. See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, P, roundRect, ellipse, frameShape, addHandle, transformAdded, shellGeo, drapeGeo, T } from './helpers.js';
import { finish } from './kitchen.js';
import { mk } from './appliances-more.js';
import { splayLegs, curvedPanel } from './dining.js';

const PI = Math.PI;
const WOOD = (def = 'wood-oak', ko = '나무', en = 'Wood', key = 'wood') => P.mat(key, ko, en, def, 'wood');
const C = (color, extra = {}) => ({ overrides: { color }, ...extra });
const torus = (R, r, rs, ts, arc = PI * 2) => new THREE.TorusGeometry(R, r, rs, ts, arc);

/** Regular polygon outline (n sides, circumradius R) for slabs. */
/** A back rail / shell bent round the sitter (sides come forward, +z), tilted back by `tilt`, at (x, y, z). */
function wrap(w, h, R, thick, nu, x, y, z, tilt = 0) {
  const g = curvedPanel(w, h, R, thick, nu);
  g.rotateY(PI);
  if (tilt) g.rotateX(-tilt);
  return g.translate(x, y, z);
}

function polygon(n, R, rot = PI / n) {
  return new THREE.Shape(Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * PI * 2; return new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R); }));
}

/* ---------------------------------------------------------------- tables */

const squareTable = mk({
  id: 'dining-table-square', category: 'dining', ko: '정사각 식탁(4인)', en: 'Square dining table',
  params: [P.len('size', '한 변', 'Side', 0.9, 0.75, 1.2), WOOD('wood-oak'), P.pick('legs', '다리', 'Legs', 'tapered', [['tapered', '테이퍼', 'Tapered'], ['square', '각진', 'Square']])],
  tags: ['square table', 'dining table', '4-seat', '정사각 식탁', '식탁', '4인 식탁', '2인 식탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, h = 0.75, t = 0.03;
    k.slab('top', p.wood, roundRect(s, s, 0.01), t, h - t, { bevel: 0.004 });
    for (const sg of [-1, 1]) {
      k.box('frame', p.wood, s - 0.14, 0.075, 0.02, 0, h - t - 0.0375, sg * (s / 2 - 0.06), { r: 0.002 });
      k.box('frame', p.wood, 0.02, 0.075, s - 0.14, sg * (s / 2 - 0.06), h - t - 0.0375, 0, { r: 0.002 });
    }
    if (p.legs === 'square') splayLegs(k, 'frame', p.wood, s, s, h - t, { inset: 0.05, r: 0.025, square: true });
    else splayLegs(k, 'frame', p.wood, s, s, h - t, { inset: 0.055, r: 0.024, rFoot: 0.014, splay: 0.025 });
    return finish(k);
  },
});

const doublePedestal = mk({
  id: 'dining-table-double-pedestal', category: 'dining', ko: '더블 페데스탈 타원 식탁', en: 'Double-pedestal oval table',
  params: [P.len('length', '길이', 'Length', 2.2, 1.8, 3.0), P.len('depth', '폭', 'Depth', 1.05, 0.9, 1.2), WOOD('wood-dark')],
  tags: ['double pedestal', 'oval table', 'traditional', 'dining table', '타원 식탁', '페데스탈 식탁', '클래식 식탁', '대형 식탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = p.depth, h = 0.76, t = 0.035;
    k.slab('top', p.wood, roundRect(L, D, D * 0.45), t, h - t, { bevel: 0.008 });
    k.box('frame', p.wood, L * 0.62, 0.08, 0.05, 0, h - t - 0.04, 0, { r: 0.004 });
    for (const sx of [-1, 1]) {
      const x = sx * L * 0.27;
      k.lathe('frame', p.wood, [[0, 0.14], [0.09, 0.14], [0.1, 0.17], [0.07, 0.22], [0.075, 0.32], [0.055, 0.45], [0.06, 0.55], [0.08, 0.6], [0.08, h - t - 0.08], [0, h - t - 0.08]], x, 0, 0, { segs: k.seg(20, 8) });
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + (i * PI) / 2, dx = Math.cos(a), dz = Math.sin(a);
        k.tube('frame', p.wood, [[x + dx * 0.06, 0.2, dz * 0.06], [x + dx * 0.2, 0.12, dz * 0.2], [x + dx * 0.33, 0.04, dz * 0.33], [x + dx * 0.38, 0.025, dz * 0.38]], 0.024, { radial: k.seg(8, 5), segs: k.seg(10, 4) });
        k.cyl('feet', 'metal-brass', 0.02, 0.018, 0.025, x + dx * 0.38, 0, dz * 0.38, { segs: k.seg(10, 6) });
      }
    }
    return finish(k);
  },
});

const lazySusan = mk({
  id: 'dining-table-lazy-susan', category: 'dining', ko: '회전판 원형 식탁(중식 테이블)', en: 'Round table with lazy Susan',
  params: [P.len('diameter', '지름', 'Diameter', 1.5, 1.2, 2.0), WOOD('wood-walnut'), P.mat('turntable', '회전판', 'Turntable', 'glass-tinted', 'glass')],
  tags: ['lazy susan', 'turntable', 'round table', 'chinese table', 'family table', '회전 식탁', '중식 테이블', '원형 식탁', '회전판'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = p.diameter / 2, h = 0.76, t = 0.035;
    k.cyl('top', p.wood, r, r - 0.005, t, 0, h - t, 0, { segs: k.seg(56, 16) });
    k.cyl('frame', p.wood, r * 0.78, r * 0.78, 0.07, 0, h - t - 0.07, 0, { segs: k.seg(40, 12), open: true });
    k.cyl('fittings', 'metal-steel', 0.08, 0.08, 0.02, 0, h, 0, { segs: k.seg(20, 8) });
    k.cyl('turntable', p.turntable, r * 0.45, r * 0.45, 0.012, 0, h + 0.02, 0, { segs: k.seg(48, 14) });
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2, R = r * 0.62;
      k.box('frame', p.wood, 0.06, h - t - 0.02, 0.06, Math.cos(a) * R, (h - t - 0.02) / 2, Math.sin(a) * R, { r: 0.005, ry: -a });
    }
    k.cyl('frame', p.wood, r * 0.64, r * 0.64, 0.03, 0, 0.1, 0, { segs: k.seg(36, 10), open: true });
    return finish(k);
  },
});

const sawhorse = mk({
  id: 'dining-table-sawhorse', category: 'dining', ko: '소호스(A자 다리) 식탁', en: 'Sawhorse dining table',
  params: [P.len('length', '길이', 'Length', 1.8, 1.4, 2.4), WOOD('wood-pine', '상판', 'Top'), P.mat('legs', '다리', 'Legs', 'metal-black', 'metal')],
  tags: ['sawhorse', 'trestle', 'industrial', 'dining table', '소호스 식탁', 'A자 다리', '인더스트리얼 식탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.9, h = 0.75, t = 0.04;
    k.box('top', p.wood, L, t, D, 0, h - t / 2, 0, { r: 0.004 });
    for (const sx of [-1, 1]) {
      const x = sx * (L / 2 - 0.22);
      k.box('legs', p.legs, 0.05, 0.04, D - 0.08, x, h - t - 0.02, 0, { r: 0.003 });
      for (const sz of [-1, 1]) for (const lean of [-1, 1]) k.rod('legs', p.legs, [x + lean * 0.02, h - t - 0.03, sz * (D / 2 - 0.08)], [x + lean * 0.2, 0, sz * (D / 2 - 0.08)], 0.016, { segs: k.seg(10, 5) });
      for (const sz of [-1, 1]) k.rod('legs', p.legs, [x - 0.12, 0.3, sz * (D / 2 - 0.08)], [x + 0.12, 0.3, sz * (D / 2 - 0.08)], 0.01, { segs: k.seg(8, 4) });
    }
    return finish(k);
  },
});

const tripod = mk({
  id: 'dining-table-tripod', category: 'dining', ko: '세 다리 원형 식탁', en: 'Tripod round dining table',
  params: [P.len('diameter', '지름', 'Diameter', 0.9, 0.7, 1.1), WOOD('wood-ash')],
  tags: ['tripod table', 'three legs', 'round table', 'small dining table', '세 다리 식탁', '원형 식탁', '2인 식탁', '소형 식탁'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const r = p.diameter / 2, h = 0.74, t = 0.028;
    k.cyl('top', p.wood, r, r - 0.006, t, 0, h - t, 0, { segs: k.seg(48, 14) });
    k.cyl('frame', p.wood, r * 0.5, r * 0.5, 0.06, 0, h - t - 0.06, 0, { segs: k.seg(28, 10), open: true });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.rod('frame', p.wood, [c * (r * 0.66), 0, s * (r * 0.66)], [c * r * 0.42, h - t, s * r * 0.42], 0.015, { r2: 0.024, segs: k.seg(12, 6) });
    }
    return finish(k);
  },
});

const wallFold = mk({
  id: 'dining-table-wall-fold', category: 'dining', ko: '벽부착 접이식 식탁', en: 'Wall-mounted fold-down table', placement: 'wall', elevation: 0.45,
  params: [P.len('width', '폭', 'Width', 0.8, 0.6, 1.2), P.len('depth', '깊이', 'Depth', 0.5, 0.35, 0.6), WOOD('wood-white')],
  tags: ['fold-down table', 'wall table', 'drop-leaf', 'small space', '접이식 식탁', '벽 식탁', '벽부착 테이블', '원룸'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth;
    // wall batten + hinged leaf (open) + two folding brackets under it; leaf top 0.3 above the mount height
    k.box('frame', p.wood, w, 0.1, 0.025, 0, 0.25, -d / 2 + 0.0125, { r: 0.003 });
    k.box('top', p.wood, w, 0.025, d - 0.025, 0, 0.2875, 0.0125, { r: 0.004 });
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.08);
      k.box('frame', p.wood, 0.025, 0.28, 0.02, x, 0.14, -d / 2 + 0.035, { r: 0.002 });
      k.rod('brackets', 'metal-steel', [x, 0.02, -d / 2 + 0.045], [x, 0.272, d * 0.25], 0.008, { segs: k.seg(8, 4) });
      k.box('brackets', 'metal-steel', 0.012, 0.01, d * 0.7, x, 0.27, -d / 2 + d * 0.35 + 0.03, { r: 0 });
    }
    for (const sx of [-1, 1]) k.cyl('fittings', 'metal-steel', 0.006, 0.006, w * 0.25, sx * w * 0.2, 0.27, -d / 2 + 0.03, { rz: PI / 2, segs: k.seg(8, 4) });
    return finish(k);
  },
});

const barLedge = mk({
  id: 'dining-wall-bar-ledge', category: 'dining', ko: '벽부착 바 테이블(선반형)', en: 'Wall-mounted bar ledge', placement: 'wall', elevation: 0.75,
  params: [P.len('width', '폭', 'Width', 1.4, 0.8, 2.4), P.len('depth', '깊이', 'Depth', 0.35, 0.25, 0.45), WOOD('wood-walnut', '상판', 'Top'), P.mat('brackets', '브래킷', 'Brackets', 'metal-black', 'metal')],
  tags: ['bar ledge', 'wall bar', 'breakfast bar', 'counter', '바 테이블', '벽 선반 테이블', '홈바', '카페 바'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = p.width, d = p.depth;
    k.box('top', p.wood, w, 0.04, d, 0, 0.3, 0, { r: 0.005 });
    const n = Math.max(2, Math.ceil(w / 0.8) + 1);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.1 + ((w - 0.2) * i) / (n - 1);
      k.box('brackets', p.brackets, 0.01, 0.28, 0.035, x, 0.14, -d / 2 + 0.0175, { r: 0 });
      k.box('brackets', p.brackets, 0.01, 0.025, d * 0.75, x, 0.268, -d / 2 + d * 0.375, { r: 0 });
      k.rod('brackets', p.brackets, [x, 0.03, -d / 2 + 0.02], [x, 0.26, -d / 2 + d * 0.7], 0.006, { segs: k.seg(8, 4) });
    }
    return finish(k);
  },
});

const benchSet = mk({
  id: 'dining-set-benches', category: 'dining', ko: '식탁 + 벤치 2개 세트', en: 'Dining table with two benches', seats: 6,
  params: [P.len('length', '길이', 'Length', 1.6, 1.2, 2.2), WOOD('wood-oak'), P.mat('legs', '다리', 'Legs', 'metal-black', 'metal'), P.bool('cushions', '벤치 쿠션', 'Bench cushions', false), P.mat('fabric', '쿠션 천', 'Cushion fabric', 'fabric-linen-grey', 'fabric')],
  tags: ['dining set', 'bench set', 'table and benches', '식탁 세트', '벤치 식탁', '벤치 세트', '6인'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, D = 0.8, h = 0.75, t = 0.035;
    k.box('top', p.wood, L, t, D, 0, h - t / 2, 0, { r: 0.005 });
    // U-shaped steel legs at each end
    const frameU = (x, w, hh) => k.bentTube('legs', p.legs, [[x, hh, -w / 2], [x, 0.012, -w / 2], [x, 0.012, w / 2], [x, hh, w / 2]], 0.012, 0.02, { radial: k.seg(8, 4) });
    for (const sx of [-1, 1]) { frameU(sx * (L / 2 - 0.12), D - 0.12, h - t); k.box('legs', p.legs, 0.03, 0.025, D - 0.1, sx * (L / 2 - 0.12), h - t - 0.0125, 0, { r: 0.002 }); }
    for (const sz of [-1, 1]) {
      const bl = L - 0.2, bh = 0.45;
      transformAdded(k, () => {
        k.box('top', p.wood, bl, 0.035, 0.32, 0, bh - 0.0175, 0, { r: 0.005 });
        for (const sx of [-1, 1]) { frameU(sx * (bl / 2 - 0.1), 0.26, bh - 0.035); k.box('legs', p.legs, 0.03, 0.02, 0.28, sx * (bl / 2 - 0.1), bh - 0.045, 0, { r: 0.002 }); }
        if (p.cushions) k.soft('cushions', p.fabric, bl - 0.1, 0.04, 0.3, 0.015, 0, bh + 0.02, 0, { puff: 0.005 });
      }, 0, 0, sz * (D / 2 + 0.22));
    }
    return finish(k);
  },
});

/* ---------------------------------------------------------------- chairs */

const barrelChair = mk({
  id: 'dining-chair-barrel', category: 'dining', ko: '배럴백 패브릭 다이닝 의자', en: 'Barrel-back upholstered dining chair',
  params: [P.mat('fabric', '천', 'Fabric', 'fabric-boucle', 'fabric'), WOOD('wood-walnut', '다리', 'Legs')],
  tags: ['barrel chair', 'tub chair', 'upholstered chair', 'dining chair', '배럴 의자', '패브릭 의자', '식탁 의자', '부클'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.47, R = 0.26;
    splayLegs(k, 'legs', p.wood, 0.44, 0.44, sh - 0.1, { inset: 0.05, r: 0.02, rFoot: 0.013, splay: 0.03 });
    k.cyl('frame', p.fabric, R, R - 0.01, 0.08, 0, sh - 0.12, 0, { segs: k.seg(32, 10) });
    k.add('upholstery', p.fabric, T(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.07, k.seg(32, 10)), 0, sh - 0.005, 0.01));
    k.soft('upholstery', p.fabric, 0.4, 0.05, 0.38, 0.02, 0, sh + 0.025, 0.02, { puff: 0.01 });
    // the curved back: a thick shell around the rear ~220°
    const ang = PI * 1.2, H = 0.36, th = 0.07;
    const back = shellGeo(k.seg(24, 10), 3, (u, v) => { const a = PI / 2 - ang / 2 + u * ang; const rr = R + 0.01; return [Math.cos(a) * rr, sh + v * H, -Math.sin(a) * rr]; }, th);
    k.add('upholstery', p.fabric, back);
    k.add('upholstery', p.fabric, T(torus(R - th / 2 + 0.01, th / 2, k.seg(8, 4), k.seg(24, 10), ang), 0, sh + H, 0, PI / 2, 0, -PI / 2 + ang / 2 + PI));
    return finish(k);
  },
});

const monobloc = mk({
  id: 'dining-chair-monobloc', category: 'dining', ko: '플라스틱 적층 의자', en: 'Plastic stacking chair',
  params: [P.color('color', '색', 'Colour', '#f2f2ee'), P.bool('arms', '팔걸이', 'Arms', true)],
  tags: ['plastic chair', 'stacking chair', 'monobloc', 'garden chair', '플라스틱 의자', '적층 의자', '모노블럭', '간이 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.44, o = C(p.color);
    k.slab('shell', 'plastic-white', roundRect(0.46, 0.44, 0.06), 0.025, sh - 0.025, { ...o, bevel: 0.008 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod('shell', 'plastic-white', [sx * 0.25, 0, sz * 0.25], [sx * 0.2, sh - 0.01, sz * 0.19], 0.018, { r2: 0.022, segs: k.seg(10, 6), ...o });
    // back with horizontal slots
    const bw = 0.42, bh = 0.4;
    const s = roundRect(bw, bh, 0.05);
    for (let i = 0; i < 4; i++) { const hole = new THREE.Path(); const y = -bh / 2 + 0.1 + i * 0.065, hw = bw / 2 - 0.07; hole.moveTo(-hw, y); hole.lineTo(-hw, y + 0.025); hole.lineTo(hw, y + 0.025); hole.lineTo(hw, y); hole.lineTo(-hw, y); s.holes.push(hole); }
    k.panel('shell', 'plastic-white', s, 0.02, 0, sh + 0.22, -0.215, { ...o, rx: -0.2, bevel: 0.004 });
    if (p.arms) for (const sx of [-1, 1]) k.bentTube('shell', 'plastic-white', [[sx * 0.22, sh + 0.32, -0.25], [sx * 0.24, sh + 0.2, -0.02], [sx * 0.23, sh + 0.2, 0.15], [sx * 0.21, sh - 0.01, 0.2]], 0.016, 0.05, { radial: k.seg(8, 5), ...o });
    return finish(k);
  },
});

const slatBack = mk({
  id: 'dining-chair-slat-back', category: 'dining', ko: '가로 살 등받이 원목 의자', en: 'Horizontal slat-back chair',
  params: [WOOD('wood-oak'), P.int('slats', '등살 수', 'Back slats', 3, 2, 5), P.pick('seat', '좌판', 'Seat', 'wood', [['wood', '원목', 'Wood'], ['pad', '패드', 'Padded']]), P.mat('fabric', '패드 천', 'Pad fabric', 'fabric-linen-grey', 'fabric')],
  tags: ['slat back chair', 'wooden chair', 'dining chair', '살 의자', '원목 의자', '식탁 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.46, w = 0.43, d = 0.44, top = 0.86;
    for (const sx of [-1, 1]) {
      k.box('frame', p.wood, 0.034, sh - 0.03, 0.034, sx * (w / 2 - 0.02), (sh - 0.03) / 2, d / 2 - 0.02, { r: 0.004 });
      k.rod('frame', p.wood, [sx * (w / 2 - 0.02), 0, -d / 2 + 0.03], [sx * (w / 2 - 0.02), top, -d / 2 - 0.02], 0.017, { segs: k.seg(10, 5) });
      k.box('frame', p.wood, 0.02, 0.03, d - 0.08, sx * (w / 2 - 0.02), 0.18, 0, { r: 0.002 });
    }
    k.box('frame', p.wood, w - 0.05, 0.05, d - 0.05, 0, sh - 0.055, 0, { r: 0.003 });
    k.slab('seat', p.wood, roundRect(w, d, 0.03), 0.025, sh - 0.03, { bevel: 0.004 });
    if (p.seat === 'pad') k.soft('cushion', p.fabric, w - 0.04, 0.035, d - 0.05, 0.012, 0, sh + 0.012, 0.01, { puff: 0.006 });
    const n = p.slats, y0 = sh + 0.12, y1 = top - 0.04;
    for (let i = 0; i < n; i++) {
      const y = y1 - ((y1 - y0) * i) / Math.max(1, n - 1), f = (y - sh) / (top - sh);
      k.add('frame', p.wood, wrap(w - 0.05, 0.05, 0.6, 0.018, k.seg(10, 4), 0, y - 0.025, -d / 2 + 0.01 - 0.05 * f));
    }
    return finish(k);
  },
});

const swivel = mk({
  id: 'dining-chair-swivel', category: 'dining', ko: '회전 다이닝 의자(받침대형)', en: 'Swivel dining chair on pedestal',
  params: [P.mat('fabric', '천', 'Upholstery', 'leather-cognac', 'leather'), P.mat('base', '받침', 'Base', 'metal-chrome', 'metal')],
  tags: ['swivel chair', 'pedestal chair', 'dining chair', 'modern', '회전 의자', '식탁 의자', '스위블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.48;
    for (let i = 0; i < 4; i++) { const a = PI / 4 + (i * PI) / 2; k.box('base', p.base, 0.3, 0.025, 0.05, Math.cos(a) * 0.14, 0.03, Math.sin(a) * 0.14, { r: 0.006, ry: -a, rz: 0 }); }
    k.cyl('base', p.base, 0.05, 0.05, 0.03, 0, 0.02, 0, { segs: k.seg(16, 8) });
    k.cyl('base', p.base, 0.025, 0.025, sh - 0.15, 0, 0.04, 0, { segs: k.seg(14, 6) });
    k.cyl('base', p.base, 0.12, 0.08, 0.03, 0, sh - 0.12, 0, { segs: k.seg(20, 8) });
    k.soft('upholstery', p.fabric, 0.48, 0.09, 0.46, 0.035, 0, sh - 0.045, 0.02, { puff: 0.012 });
    k.add('upholstery', p.fabric, wrap(0.56, 0.34, 0.3, 0.05, k.seg(16, 6), 0, sh - 0.02, -0.2, 0.15));
    return finish(k);
  },
});

const paperCord = mk({
  id: 'dining-chair-paper-cord', category: 'dining', ko: '페이퍼 코드 좌판 덴마크 의자', en: 'Danish paper-cord seat chair',
  params: [WOOD('wood-oak'), P.mat('cord', '좌판 끈', 'Seat cord', 'rattan', 'wood')],
  tags: ['paper cord', 'danish chair', 'woven seat', 'scandinavian', 'dining chair', '페이퍼 코드', '덴마크 의자', '라탄 좌판', '북유럽 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.45, w = 0.46, d = 0.42;
    for (const sx of [-1, 1]) {
      k.rod('frame', p.wood, [sx * (w / 2 - 0.02), 0, d / 2 - 0.02], [sx * (w / 2 - 0.025), sh, d / 2 - 0.025], 0.016, { r2: 0.018, segs: k.seg(10, 5) });
      k.rod('frame', p.wood, [sx * (w / 2 - 0.02), 0, -d / 2 + 0.02], [sx * (w / 2 - 0.03), 0.76, -d / 2 - 0.03], 0.016, { r2: 0.018, segs: k.seg(10, 5) });
      k.rod('frame', p.wood, [sx * (w / 2 - 0.02), 0.16, d / 2 - 0.02], [sx * (w / 2 - 0.02), 0.16, -d / 2 + 0.02], 0.01, { segs: k.seg(8, 4) });
    }
    // seat rails + woven seat (a slightly sagging pad of cord)
    for (const sz of [-1, 1]) k.rod('frame', p.wood, [-w / 2 + 0.02, sh - 0.02, sz * (d / 2 - 0.022)], [w / 2 - 0.02, sh - 0.02, sz * (d / 2 - 0.022)], 0.014, { segs: k.seg(10, 5) });
    for (const sx of [-1, 1]) k.rod('frame', p.wood, [sx * (w / 2 - 0.022), sh - 0.02, -d / 2 + 0.02], [sx * (w / 2 - 0.022), sh - 0.02, d / 2 - 0.02], 0.014, { segs: k.seg(10, 5) });
    k.soft('seat', p.cord, w - 0.05, 0.02, d - 0.05, 0.008, 0, sh - 0.012, 0, { sag: 0.006 });
    // wide bent back rail
    k.add('frame', p.wood, wrap(w - 0.02, 0.1, 0.45, 0.02, k.seg(14, 6), 0, 0.64, -d / 2 - 0.025, 0.1));
    return finish(k);
  },
});

const ming = mk({
  id: 'dining-chair-horseshoe', category: 'dining', ko: '명식 말굽 팔걸이 의자', en: 'Ming horseshoe armchair',
  params: [WOOD('wood-dark'), P.bool('cushion', '방석', 'Seat cushion', true), P.mat('fabric', '방석 천', 'Cushion fabric', 'fabric-velvet-rose', 'fabric')],
  tags: ['horseshoe chair', 'ming chair', 'chinese chair', 'oriental', 'armchair', '말굽 의자', '명식 의자', '동양 의자', '팔걸이 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.48, w = 0.58, d = 0.46;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.036, sh, 0.036, sx * (w / 2 - 0.04), sh / 2, sz * (d / 2 - 0.03), { r: 0.004 });
    k.box('frame', p.wood, w, 0.04, d, 0, sh - 0.02, 0, { r: 0.004 });
    k.box('frame', p.wood, w - 0.08, 0.05, 0.015, 0, sh - 0.065, d / 2 - 0.03, { r: 0.002 });
    for (const sz of [-1, 1]) k.box('frame', p.wood, w - 0.08, 0.025, 0.025, 0, 0.12, sz * (d / 2 - 0.03), { r: 0.003 });
    k.box('frame', p.wood, w - 0.08, 0.03, 0.06, 0, 0.03, d / 2 - 0.03, { r: 0.003 });
    // horseshoe rail: a continuous arc from the front posts round the back
    const rail = [];
    for (let i = 0; i <= 12; i++) { const a = -0.15 + (i / 12) * (PI + 0.3); rail.push([Math.cos(a) * (w / 2 - 0.02), 0.76 + Math.sin(a) * 0.02, -Math.sin(a) * 0.3 + 0.1 * (1 - Math.sin(a)) + 0.0]); }
    k.tube('frame', p.wood, rail, 0.02, { caps: true, radial: k.seg(10, 5), segs: k.seg(36, 12) });
    for (const sx of [-1, 1]) {
      k.rod('frame', p.wood, [sx * (w / 2 - 0.04), sh, d / 2 - 0.05], [sx * (w / 2 - 0.03), 0.75, 0.12], 0.014, { segs: k.seg(8, 5) });
      k.rod('frame', p.wood, [sx * (w / 2 - 0.04), sh, -d / 2 + 0.03], [sx * 0.22, 0.76, -0.17], 0.017, { segs: k.seg(8, 5) });
    }
    // S-curved back splat
    const splat = shellGeo(4, k.seg(10, 5), (u, v) => [(u - 0.5) * (0.17 - 0.03 * v), sh + v * 0.28, -d / 2 + 0.01 - 0.08 * Math.sin(v * PI * 0.9) + 0.03 * v], 0.018);
    k.add('frame', p.wood, splat);
    if (p.cushion) k.soft('cushion', p.fabric, w - 0.1, 0.04, d - 0.06, 0.015, 0, sh + 0.02, 0, { puff: 0.006 });
    return finish(k);
  },
});

const sling = mk({
  id: 'dining-chair-leather-sling', category: 'dining', ko: '가죽 슬링 다이닝 의자', en: 'Leather sling dining chair',
  params: [P.mat('leather', '가죽', 'Leather', 'leather-cognac', 'leather'), P.mat('frame', '프레임', 'Frame', 'wood-oak', 'wood')],
  tags: ['sling chair', 'leather chair', 'strap chair', 'dining chair', '가죽 의자', '슬링 의자', '식탁 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = 0.46, w = 0.48, d = 0.48;
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.02);
      k.rod('frame', p.frame, [x, 0, d / 2 - 0.02], [x, sh + 0.02, d / 2 - 0.04], 0.016, { segs: k.seg(10, 5) });
      k.rod('frame', p.frame, [x, 0, -d / 2 + 0.03], [x, 0.8, -d / 2 - 0.02], 0.016, { segs: k.seg(10, 5) });
      k.rod('frame', p.frame, [x, sh + 0.02, d / 2 - 0.04], [x, sh + 0.01, -d / 2 + 0.01], 0.015, { segs: k.seg(10, 5) });
      k.rod('frame', p.frame, [x, 0.12, d / 2 - 0.02], [x, 0.12, -d / 2 + 0.03], 0.01, { segs: k.seg(8, 4) });
    }
    for (const [y, z] of [[sh + 0.02, d / 2 - 0.04], [sh + 0.01, -d / 2 + 0.01], [0.79, -d / 2 - 0.02]]) k.rod('frame', p.frame, [-w / 2 + 0.02, y, z], [w / 2 - 0.02, y, z], 0.014, { segs: k.seg(10, 5) });
    // sagging leather sling for seat and back
    const sw = w - 0.06;
    k.add('leather', p.leather, shellGeo(k.seg(8, 3), k.seg(10, 4), (u, v) => [(u - 0.5) * sw, sh + 0.025 - 0.03 * Math.sin(v * PI), d / 2 - 0.05 - v * (d - 0.06)], 0.006));
    k.add('leather', p.leather, shellGeo(k.seg(8, 3), k.seg(8, 4), (u, v) => [(u - 0.5) * sw, 0.55 + v * 0.22, -d / 2 - 0.0 - 0.02 * v - 0.025 * Math.sin(v * PI)], 0.006));
    return finish(k);
  },
});

const gasStool = mk({
  id: 'dining-stool-gaslift', category: 'dining', ko: '높이조절 회전 바 의자', en: 'Adjustable swivel bar stool',
  params: [P.len('seatHeight', '좌석 높이', 'Seat height', 0.72, 0.6, 0.82), P.mat('seat', '좌석', 'Seat', 'leather-black', 'leather'), P.mat('base', '받침', 'Base', 'metal-chrome', 'metal')],
  tags: ['bar stool', 'gas lift', 'swivel', 'adjustable', 'kitchen stool', '바 의자', '높이조절 의자', '회전 바스툴', '아일랜드 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const sh = p.seatHeight;
    k.cyl('base', p.base, 0.2, 0.21, 0.02, 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('base', p.base, 0.04, 0.05, 0.05, 0, 0.02, 0, { segs: k.seg(16, 6) });
    k.cyl('base', p.base, 0.025, 0.025, sh - 0.12, 0, 0.06, 0, { segs: k.seg(14, 6) });
    k.cyl('base', 'plastic-black', 0.035, 0.035, 0.1, 0, sh - 0.22, 0, { segs: k.seg(14, 6) });
    k.add('base', p.base, T(torus(0.17, 0.01, k.seg(8, 4), k.seg(28, 10)), 0, sh * 0.42, 0, PI / 2, 0, 0));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod('base', p.base, [0, sh * 0.42, 0], [Math.cos(a) * 0.17, sh * 0.42, Math.sin(a) * 0.17], 0.007, { segs: k.seg(8, 4) }); }
    k.cyl('base', p.base, 0.1, 0.06, 0.03, 0, sh - 0.1, 0, { segs: k.seg(18, 8) });
    k.add('seat', p.seat, wrap(0.5, 0.2, 0.22, 0.05, k.seg(16, 6), 0, sh - 0.02, -0.14, 0.08));
    k.soft('seat', p.seat, 0.42, 0.08, 0.38, 0.035, 0, sh - 0.04, 0.03, { puff: 0.01 });
    return finish(k);
  },
});

/* --------------------------------------------------------------- benches */

const storageBench = mk({
  id: 'dining-bench-storage', category: 'dining', ko: '수납 벤치(뚜껑 열림)', en: 'Storage dining bench with lift-up lid',
  params: [P.len('length', '길이', 'Length', 1.2, 0.8, 1.8), WOOD('wood-white'), P.bool('cushion', '쿠션', 'Cushion', true), P.mat('fabric', '쿠션 천', 'Cushion fabric', 'fabric-linen-beige', 'fabric')],
  tags: ['storage bench', 'bench', 'lift-up lid', 'banquette', '수납 벤치', '벤치', '식탁 벤치', '수납 의자'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = 0.4, h = 0.43;
    k.box('body', p.wood, L, 0.06, d - 0.03, 0, 0.03, -0.015, { r: 0.002 });
    k.box('body', p.wood, L, h - 0.1, d, 0, 0.06 + (h - 0.1) / 2, 0, { r: 0.003 });
    k.box('lid', p.wood, L + 0.01, 0.025, d + 0.01, 0, h - 0.0275, 0, { r: 0.004 });
    // panelled front
    const n = Math.max(2, Math.round(L / 0.45));
    for (let i = 0; i < n; i++) k.panel('body', p.wood, frameShape(L / n - 0.04, h - 0.16, 0.03), 0.012, -L / 2 + (L / n) * (i + 0.5), 0.06 + (h - 0.1) / 2, d / 2 + 0.006);
    for (const sx of [-1, 1]) k.box('handles', 'metal-black', 0.02, 0.02, 0.1, sx * (L / 2 + 0.005), h - 0.07, 0, { r: 0.004 });
    if (p.cushion) k.soft('cushion', p.fabric, L - 0.02, 0.06, d - 0.02, 0.02, 0, h + 0.03, 0, { puff: 0.008 });
    return finish(k);
  },
});

const pew = mk({
  id: 'dining-bench-pew', category: 'dining', ko: '교회 의자식 등받이 벤치', en: 'Church pew bench',
  params: [P.len('length', '길이', 'Length', 1.5, 1.0, 2.2), WOOD('wood-pine')],
  tags: ['pew', 'church bench', 'high-back bench', 'farmhouse', '교회 의자', '등받이 벤치', '빈티지 벤치', '식탁 벤치'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, sh = 0.45, d = 0.46, H = 0.95;
    // shaped end panels (side profile: seat, back rake, rounded top)
    const end = new THREE.Shape();
    end.moveTo(-d / 2, 0); end.lineTo(d / 2, 0); end.lineTo(d / 2, sh - 0.06); end.quadraticCurveTo(d / 2, sh + 0.12, d / 2 - 0.12, sh + 0.12);
    end.lineTo(-d / 2 + 0.12, sh + 0.12); end.lineTo(-d / 2 + 0.06, H - 0.06); end.quadraticCurveTo(-d / 2 + 0.03, H, -d / 2, H - 0.06); end.lineTo(-d / 2, 0);
    for (const sx of [-1, 1]) k.panel('frame', p.wood, end, 0.035, sx * (L / 2 - 0.0175), 0, 0, { ry: PI / 2 });
    k.box('frame', p.wood, L - 0.03, 0.035, d - 0.08, 0, sh - 0.0175, 0.03, { r: 0.004 });
    k.box('frame', p.wood, L - 0.03, 0.05, 0.02, 0, sh - 0.06, d / 2 - 0.03, { r: 0.002 });
    for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4, y = sh + 0.05 + t * (H - sh - 0.1); k.box('frame', p.wood, L - 0.03, (H - sh - 0.1) / 4 - 0.008, 0.02, 0, y, -d / 2 + 0.04 + 0.08 * (1 - t) - 0.02, { r: 0.002, rx: -0.12 }); }
    k.box('frame', p.wood, L - 0.03, 0.08, 0.02, 0, 0.12, -0.05, { r: 0.002 });
    return finish(k);
  },
});

/* --------------------------------------------------------------- storage */

const bakersRack = mk({
  id: 'dining-bakers-rack', category: 'dining', ko: '베이커스 랙(철제 선반)', en: "Baker's rack",
  params: [P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'), WOOD('wood-walnut', '선반', 'Shelves'), P.bool('items', '소품', 'Items', true)],
  tags: ["baker's rack", 'metal shelf', 'kitchen rack', 'wine storage', '베이커스 랙', '철제 선반', '주방 선반', '와인 수납'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.9, d = 0.4, H = 1.75;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.frame, 0.02, H - 0.1, 0.02, sx * (w / 2 - 0.01), (H - 0.1) / 2, sz * (d / 2 - 0.01), { r: 0.002 });
    // arched top with scrolls
    const arc = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; arc.push([(t - 0.5) * (w - 0.02), H - 0.1 + Math.sin(t * PI) * 0.1, -d / 2 + 0.01]); }
    k.tube('frame', p.frame, arc, 0.008, { radial: k.seg(6, 4), segs: k.seg(20, 8) });
    for (const sx of [-1, 1]) k.add('frame', p.frame, T(torus(0.035, 0.005, k.seg(6, 3), k.seg(14, 6), PI * 1.6), sx * 0.2, H - 0.1, -d / 2 + 0.01, 0, 0, sx > 0 ? 0 : PI));
    for (const y of [0.35, 0.8, 1.2]) k.box('shelf', p.wood, w - 0.03, 0.025, d - 0.02, 0, y, 0, { r: 0.003 });
    k.box('shelf', p.wood, w - 0.03, 0.025, d - 0.02, 0, 1.55, 0, { r: 0.003 });
    // wine grid at the bottom: two rails with bottle slots
    for (const z of [-0.1, 0.1]) k.box('frame', p.frame, w - 0.04, 0.02, 0.015, 0, 0.1, z, { r: 0 });
    if (p.items) {
      for (let i = 0; i < 5; i++) k.rod('bottles', 'glass-tinted', [-0.32 + i * 0.16, 0.14, -d / 2 + 0.03], [-0.32 + i * 0.16, 0.14, d / 2 - 0.06], 0.036, { r2: 0.013, segs: k.seg(12, 5) });
      for (let i = 0; i < 3; i++) k.lathe('items', 'ceramic-white', [[0, 0], [0.06, 0], [0.065, 0.14], [0.055, 0.15], [0, 0.15]], -0.28 + i * 0.14, 0.8125, -0.05, { segs: k.seg(16, 6) });
      k.lathe('items', 'rattan', [[0, 0], [0.13, 0], [0.18, 0.1], [0.17, 0.1], [0, 0.02]], 0.22, 1.2125, 0, { segs: k.seg(20, 8) });
    }
    return finish(k);
  },
});

const cornerCabinet = mk({
  id: 'dining-corner-cabinet', category: 'dining', ko: '코너 그릇장(유리문)', en: 'Corner china cabinet',
  params: [P.mat('body', '본체', 'Body', 'paint-white-matte', 'paint'), P.len('height', '높이', 'Height', 1.9, 1.6, 2.1), P.bool('plates', '접시', 'Plates', true)],
  tags: ['corner cabinet', 'china cabinet', 'corner hutch', 'display cabinet', '코너장', '코너 그릇장', '진열장', '그릇장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = 0.5, W = 2 * D, H = p.height, fw = 0.56, bh = 0.8;
    // plan: right angle at the back corner (−z), diagonal front along x; cut the two acute tips
    const plan = (inset = 0) => new THREE.Shape([new THREE.Vector2(-fw / 2 - inset, D / 2 - inset), new THREE.Vector2(fw / 2 + inset, D / 2 - inset), new THREE.Vector2(W / 2 - 0.2 + inset, D / 2 - 0.2 + 0), new THREE.Vector2(0, -D / 2), new THREE.Vector2(-W / 2 + 0.2 - inset, D / 2 - 0.2)]);
    k.slab('body', p.body, plan(), 0.08, 0, { bevel: 0.002 });
    k.slab('body', p.body, plan(), bh - 0.11, 0.08, { bevel: 0.002 });
    k.slab('body', p.body, plan(0.015), 0.03, bh - 0.03, { bevel: 0.004 });
    k.slab('body', p.body, plan(-0.01), H - bh - 0.08, bh, { bevel: 0.002 });
    k.slab('body', p.body, plan(0.02), 0.06, H - 0.08, { bevel: 0.006 });
    k.slab('body', p.body, plan(0.035), 0.02, H - 0.02, { bevel: 0.004 });
    // lower door and glazed upper door on the front face
    k.box('doors', p.body, fw - 0.06, bh - 0.16, 0.02, 0, 0.08 + (bh - 0.16) / 2 + 0.01, D / 2 + 0.01, { r: 0.003 });
    k.panel('doors', p.body, frameShape(fw - 0.06, H - bh - 0.14, 0.045), 0.02, 0, bh + 0.02 + (H - bh - 0.14) / 2, D / 2 + 0.0, { bevel: 0.002 });
    k.box('glass', 'glass-clear', fw - 0.14, H - bh - 0.22, 0.004, 0, bh + 0.02 + (H - bh - 0.14) / 2, D / 2 - 0.002, { r: 0 });
    addHandle(k, 'handles', 'metal-brass', 'knob', fw / 2 - 0.08, bh - 0.12, D / 2 + 0.02);
    addHandle(k, 'handles', 'metal-brass', 'knob', fw / 2 - 0.08, bh + 0.25, D / 2 + 0.01);
    const shelves = [bh + (H - bh - 0.1) / 3, bh + (2 * (H - bh - 0.1)) / 3];
    for (const y of shelves) k.slab('body', p.body, plan(-0.04), 0.018, y, { bevel: 0.002 });
    if (p.plates) for (const y of [bh, ...shelves]) for (const x of [-0.12, 0.12]) k.cyl('plates', 'ceramic-white', 0.1, 0.1, 0.012, x, y + 0.12, -0.02 + Math.abs(x) * -0.5 + 0.06, { rx: PI / 2 - 0.2, segs: k.seg(20, 8) });
    return finish(k);
  },
});

const teaTrolley = mk({
  id: 'dining-tea-trolley', category: 'dining', ko: '원목 티 트롤리(2단)', en: 'Wooden tea trolley',
  params: [WOOD('wood-teak'), P.bool('tea', '찻잔', 'Tea things', true)],
  tags: ['tea trolley', 'serving cart', 'tea cart', 'wooden trolley', '티 트롤리', '서빙 카트', '원목 카트', '찻잔'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = 0.75, D = 0.42, H = 0.72, wr = 0.13;
    // two trays with raised rims
    for (const y of [0.22, 0.62]) {
      k.box('frame', p.wood, L, 0.018, D, 0, y, 0, { r: 0.003 });
      for (const sz of [-1, 1]) k.box('frame', p.wood, L, 0.04, 0.012, 0, y + 0.029, sz * (D / 2 - 0.006), { r: 0.003 });
      for (const sx of [-1, 1]) k.box('frame', p.wood, 0.012, 0.04, D, sx * (L / 2 - 0.006), y + 0.029, 0, { r: 0.003 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.03, H - 0.06, 0.03, sx * (L / 2 - 0.03), 0.06 + (H - 0.06) / 2 - (sx > 0 ? 0.0 : 0), sz * (D / 2 + 0.015), { r: 0.004 });
    // push handle on the left end
    k.rod('frame', p.wood, [-L / 2 - 0.03, H - 0.02, -D / 2 - 0.015], [-L / 2 - 0.03, H - 0.02, D / 2 + 0.015], 0.014, { segs: k.seg(10, 5) });
    // big spoked wheels on the right, small casters on the left
    for (const sz of [-1, 1]) {
      const z = sz * (D / 2 + 0.05);
      k.add('wheels', p.wood, T(torus(wr - 0.012, 0.012, k.seg(8, 4), k.seg(28, 10)), L / 2 - 0.03, wr, z));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI; k.rod('wheels', p.wood, [L / 2 - 0.03 - Math.cos(a) * (wr - 0.015), wr - Math.sin(a) * (wr - 0.015), z], [L / 2 - 0.03 + Math.cos(a) * (wr - 0.015), wr + Math.sin(a) * (wr - 0.015), z], 0.005, { segs: k.seg(6, 4) }); }
      k.cyl('wheels', 'metal-brass', 0.02, 0.02, 0.04, L / 2 - 0.03, wr, z - 0.02, { rx: PI / 2, segs: k.seg(12, 6) });
      k.cyl('wheels', 'rubber-black', 0.03, 0.03, 0.02, -L / 2 + 0.03, 0.03, z - 0.01 * sz, { rx: PI / 2, segs: k.seg(14, 6) });
    }
    k.box('frame', p.wood, 0.03, 0.03, D + 0.12, -L / 2 + 0.03, 0.06, 0, { r: 0.004 });
    if (p.tea) {
      k.lathe('china', 'ceramic-white', [[0, 0], [0.04, 0], [0.07, 0.04], [0.075, 0.09], [0.05, 0.13], [0.02, 0.135], [0.025, 0.15], [0, 0.155]], 0.12, 0.65, 0, { segs: k.seg(18, 8) });
      for (const [x, z] of [[-0.12, -0.08], [-0.2, 0.07]]) { k.cyl('china', 'ceramic-white', 0.07, 0.07, 0.008, x, 0.65, z, { segs: k.seg(16, 6) }); k.lathe('china', 'ceramic-white', [[0, 0], [0.025, 0], [0.04, 0.05], [0.042, 0.06], [0, 0.005]], x, 0.658, z, { segs: k.seg(14, 6) }); }
    }
    return finish(k);
  },
});

/* ----------------------------------------------------------- floor dining */

const soban = mk({
  id: 'dining-soban', category: 'dining', ko: '소반(1인 밥상)', en: 'Korean soban tray table',
  params: [P.pick('shape', '모양', 'Shape', 'dodecagon', [['dodecagon', '12각(12각반)', 'Twelve-sided'], ['round', '원반', 'Round'], ['octagon', '8각', 'Octagonal']]), WOOD('wood-dark'), P.len('width', '폭', 'Width', 0.48, 0.38, 0.6)],
  tags: ['soban', 'korean tray table', 'small table', 'floor table', '소반', '밥상', '개다리소반', '12각반', '전통 상'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.width / 2, h = 0.27;
    const shape = p.shape === 'round' ? ellipse(R * 2, R * 2) : polygon(p.shape === 'octagon' ? 8 : 12, R);
    k.slab('top', p.wood, shape, 0.022, h - 0.022, { bevel: 0.004 });
    // raised rim
    const rim = p.shape === 'round' ? ellipse(R * 2, R * 2) : polygon(p.shape === 'octagon' ? 8 : 12, R);
    const hole = p.shape === 'round' ? ellipse(R * 2 - 0.03, R * 2 - 0.03) : polygon(p.shape === 'octagon' ? 8 : 12, R - 0.015);
    rim.holes.push(new THREE.Path(hole.getPoints()));
    k.slab('top', p.wood, rim, 0.012, h, { bevel: 0.002 });
    k.slab('frame', p.wood, p.shape === 'round' ? ellipse(R * 1.5, R * 1.5) : polygon(p.shape === 'octagon' ? 8 : 12, R * 0.75), 0.05, h - 0.072, { bevel: 0.002 });
    // four cabriole ("dog-leg") legs with a stretcher frame near the floor
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2, c = Math.cos(a), s = Math.sin(a), r0 = R * 0.62;
      k.tube('legs', p.wood, [[c * r0, h - 0.07, s * r0], [c * (r0 + 0.03), h * 0.55, s * (r0 + 0.03)], [c * (r0 - 0.01), h * 0.25, s * (r0 - 0.01)], [c * (r0 + 0.035), 0.012, s * (r0 + 0.035)]], 0.012, { radial: k.seg(8, 4), segs: k.seg(10, 5) });
      k.cyl('legs', p.wood, 0.016, 0.014, 0.012, c * (r0 + 0.035), 0, s * (r0 + 0.035), { segs: k.seg(8, 5) });
    }
    k.add('legs', p.wood, T(torus(R * 0.62, 0.006, k.seg(6, 3), k.seg(24, 8)), 0, 0.07, 0, PI / 2, 0, 0));
    return finish(k);
  },
});

const kotatsu = mk({
  id: 'dining-kotatsu', category: 'dining', ko: '고타츠(난방 좌식 테이블)', en: 'Kotatsu heated table',
  params: [P.len('size', '크기', 'Size', 0.8, 0.7, 1.2), WOOD('wood-oak', '상판', 'Top'), P.mat('quilt', '이불', 'Quilt', 'fabric-mustard', 'fabric')],
  tags: ['kotatsu', 'heated table', 'low table', 'japanese', 'floor table', '고타츠', '난방 테이블', '좌식 테이블', '이불 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.size, h = 0.38;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.04, h - 0.05, 0.04, sx * (s / 2 - 0.04), (h - 0.05) / 2, sz * (s / 2 - 0.04), { r: 0.004 });
    k.box('frame', p.wood, s, 0.05, s, 0, h - 0.05 - 0.025, 0, { r: 0.004 });
    // the quilt is clamped between frame and top and spreads onto the floor
    const q = drapeGeo({ w: s, l: s, top: h - 0.05, drop: h - 0.05 - 0.03, r: 0.06, thick: 0.035, nu: k.seg(30, 10), nv: k.seg(30, 10), sides: { left: true, right: true, foot: true }, folds: 0.02, seed: 4 });
    q.translate(0, 0, -0.0);
    k.add('quilt', p.quilt, q);
    k.add('quilt', p.quilt, T(drapeGeo({ w: s, l: 0.3, top: h - 0.05, drop: h - 0.05 - 0.03, r: 0.06, thick: 0.035, nu: k.seg(24, 8), nv: k.seg(6, 3), sides: { left: true, right: true, foot: true }, folds: 0.02, seed: 6 }), 0, 0, 0, 0, PI, 0).translate(0, 0, -s / 2 + 0.15));
    k.box('top', p.wood, s + 0.06, 0.03, s + 0.06, 0, h + 0.03, 0, { r: 0.005 });
    return finish(k);
  },
});

/* ------------------------------------------------------------ table top */

const placeSetting = mk({
  id: 'dining-place-setting', category: 'dining', ko: '1인 테이블 세팅(접시·커트러리)', en: 'Place setting', placement: 'surface',
  params: [P.mat('mat', '매트', 'Placemat', 'fabric-linen-grey', 'fabric'), P.mat('plates', '접시', 'Plates', 'ceramic-white', 'ceramic'), P.bool('glass', '물잔', 'Glass', true)],
  tags: ['place setting', 'table setting', 'plate', 'cutlery', 'placemat', '테이블 세팅', '접시', '커트러리', '식기', '매트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('mat', p.mat, 0.45, 0.004, 0.32, 0, 0.002, 0, { r: 0.001 });
    k.lathe('plates', p.plates, [[0, 0.004], [0.08, 0.004], [0.1, 0.008], [0.135, 0.02], [0.14, 0.022], [0.132, 0.022], [0.095, 0.012], [0, 0.012]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.lathe('plates', p.plates, [[0, 0.016], [0.04, 0.016], [0.08, 0.05], [0.085, 0.06], [0.08, 0.06], [0.04, 0.024], [0, 0.024]], 0, 0, 0, { segs: k.seg(28, 10) });
    // cutlery: fork left, knife + spoon right
    k.box('cutlery', 'metal-steel', 0.012, 0.004, 0.16, -0.17, 0.006, 0.02, { r: 0.001 });
    for (let i = 0; i < 4; i++) k.box('cutlery', 'metal-steel', 0.003, 0.003, 0.04, -0.1775 + i * 0.005, 0.006, -0.08, { r: 0 });
    k.box('cutlery', 'metal-steel', 0.014, 0.004, 0.21, 0.165, 0.006, 0.0, { r: 0.001 });
    k.box('cutlery', 'metal-steel', 0.01, 0.004, 0.13, 0.195, 0.006, 0.03, { r: 0.001 });
    k.sphere('cutlery', 'metal-steel', 0.02, 0.195, 0.006, -0.055, { scale: [0.8, 0.25, 1.1], segs: k.seg(12, 6), rings: k.seg(6, 3) });
    k.box('napkin', 'fabric-cotton-white', 0.08, 0.012, 0.18, -0.205, 0.01, 0.02, { r: 0.004 });
    if (p.glass) k.lathe('glass', 'glass-clear', [[0, 0], [0.032, 0], [0.034, 0.12], [0.031, 0.12], [0.029, 0.01], [0, 0.01]], 0.17, 0.004, -0.13, { segs: k.seg(20, 8) });
    return finish(k);
  },
});

const cakeStand = mk({
  id: 'dining-cake-stand', category: 'dining', ko: '유리 돔 케이크 스탠드', en: 'Cake stand with glass dome', placement: 'surface',
  params: [P.mat('stand', '스탠드', 'Stand', 'ceramic-white', 'ceramic'), P.bool('cake', '케이크', 'Cake', true)],
  tags: ['cake stand', 'glass dome', 'cloche', 'dessert', '케이크 스탠드', '유리 돔', '디저트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('stand', p.stand, [[0, 0], [0.065, 0], [0.06, 0.012], [0.022, 0.03], [0.018, 0.08], [0.03, 0.095], [0.15, 0.1], [0.155, 0.112], [0, 0.11]], 0, 0, 0, { segs: k.seg(32, 10) });
    if (p.cake) {
      k.cyl('cake', 'fabric-cotton-white', 0.1, 0.1, 0.09, 0, 0.112, 0, { segs: k.seg(28, 10) });
      k.cyl('cake', 'fabric-velvet-rose', 0.1, 0.101, 0.012, 0, 0.16, 0, { segs: k.seg(28, 10) });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; k.sphere('fruit', 'fabric-terracotta', 0.012, Math.cos(a) * 0.075, 0.21, Math.sin(a) * 0.075, { segs: k.seg(8, 5), rings: k.seg(6, 3) }); }
    }
    k.lathe('glass', 'glass-clear', [[0.14, 0.112], [0.142, 0.15], [0.135, 0.25], [0.1, 0.31], [0.04, 0.33], [0.025, 0.335], [0.02, 0.36], [0, 0.365]], 0, 0, 0, { segs: k.seg(32, 10), smooth: 12 });
    return finish(k);
  },
});

const teaSet = mk({
  id: 'dining-tea-set', category: 'dining', ko: '다기 세트(찻주전자·찻잔·쟁반)', en: 'Tea set on tray', placement: 'surface',
  params: [P.mat('china', '도자기', 'China', 'ceramic-white', 'ceramic'), WOOD('wood-walnut', '쟁반', 'Tray'), P.int('cups', '찻잔 수', 'Cups', 2, 1, 4)],
  tags: ['tea set', 'teapot', 'teacup', 'tray', '다기', '찻주전자', '찻잔', '다기 세트', '쟁반'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.box('tray', p.wood, 0.42, 0.015, 0.28, 0, 0.0075, 0, { r: 0.004 });
    for (const sz of [-1, 1]) k.box('tray', p.wood, 0.42, 0.025, 0.012, 0, 0.02, sz * 0.134, { r: 0.003 });
    for (const sx of [-1, 1]) k.box('tray', p.wood, 0.012, 0.025, 0.28, sx * 0.204, 0.02, 0, { r: 0.003 });
    const y0 = 0.015, px = -0.09;
    k.lathe('china', p.china, [[0, 0], [0.05, 0], [0.075, 0.04], [0.078, 0.07], [0.06, 0.11], [0.035, 0.12], [0.035, 0.125], [0.02, 0.13], [0.012, 0.145], [0, 0.148]], px, y0, 0, { segs: k.seg(24, 8), smooth: 14 });
    k.tube('china', p.china, [[px + 0.07, y0 + 0.04, 0], [px + 0.11, y0 + 0.08, 0], [px + 0.13, y0 + 0.12, 0]], 0.011, { radial: k.seg(8, 5), segs: k.seg(8, 4) });
    k.add('china', p.china, T(torus(0.04, 0.007, k.seg(6, 4), k.seg(14, 6), PI * 1.2), px - 0.07, y0 + 0.08, 0, 0, 0, PI / 2 - 0.6 * 0 + PI * 0.4));
    const n = p.cups;
    for (let i = 0; i < n; i++) {
      const x = 0.07 + (i % 2) * 0.09, z = (Math.floor(i / 2) - (n > 2 ? 0.5 : 0)) * 0.11 + (n <= 2 ? (i - (n - 1) / 2) * 0.03 : 0);
      k.cyl('china', p.china, 0.05, 0.05, 0.006, x, y0, z, { segs: k.seg(16, 6) });
      k.lathe('china', p.china, [[0, 0], [0.022, 0], [0.036, 0.04], [0.038, 0.048], [0.034, 0.048], [0, 0.006]], x, y0 + 0.006, z, { segs: k.seg(16, 6) });
    }
    return finish(k);
  },
});

const wineSet = mk({
  id: 'dining-wine-set', category: 'dining', ko: '와인병과 와인잔 2개', en: 'Wine bottle with two glasses', placement: 'surface',
  params: [P.mat('bottle', '병', 'Bottle', 'glass-tinted', 'glass'), P.bool('board', '치즈 보드', 'Cheese board', true)],
  tags: ['wine', 'wine glass', 'bottle', 'cheese board', '와인', '와인잔', '와인병', '치즈 보드'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    k.lathe('bottle', p.bottle, [[0, 0], [0.036, 0], [0.037, 0.2], [0.03, 0.235], [0.014, 0.26], [0.013, 0.3], [0.015, 0.305], [0, 0.305]], -0.12, 0, 0, { segs: k.seg(20, 8) });
    k.cyl('label', 'paper', 0.0375, 0.0375, 0.08, -0.12, 0.07, 0, { segs: k.seg(20, 8), open: true });
    k.cyl('label', 'metal-gold', 0.0145, 0.0145, 0.04, -0.12, 0.27, 0, { segs: k.seg(12, 5) });
    for (const [x, z] of [[0.02, -0.06], [0.1, 0.02]]) k.lathe('glasses', 'glass-clear', [[0, 0], [0.035, 0], [0.035, 0.004], [0.004, 0.01], [0.004, 0.1], [0.03, 0.12], [0.042, 0.16], [0.035, 0.21], [0.033, 0.21], [0.039, 0.16], [0.028, 0.125], [0, 0.11]], x, 0, z, { segs: k.seg(20, 8) });
    if (p.board) {
      k.box('board', 'wood-oak', 0.26, 0.018, 0.16, 0.06, 0.009, 0.12, { r: 0.004 });
      k.box('cheese', 'fabric-mustard', 0.07, 0.04, 0.05, 0.02, 0.038, 0.12, { r: 0.004 });
      for (let i = 0; i < 5; i++) k.sphere('grapes', 'fabric-velvet-rose', 0.011, 0.11 + (i % 3) * 0.018, 0.03 + Math.floor(i / 3) * 0.015, 0.11 + (i % 2) * 0.015, { segs: k.seg(8, 5), rings: k.seg(6, 3) });
    }
    return finish(k);
  },
});

export const ITEMS = [
  squareTable, doublePedestal, lazySusan, sawhorse, tripod, wallFold, barLedge, benchSet,
  barrelChair, monobloc, slatBack, swivel, paperCord, ming, sling, gasStool,
  storageBench, pew, bakersRack, cornerCabinet, teaTrolley, soban, kotatsu,
  placeSetting, cakeStand, teaSet, wineSet,
];
