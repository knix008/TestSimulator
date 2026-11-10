// Outdoor: teak patio chair, sun lounger, parasol, planter box, outdoor table.
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { centreKit } from './office.js';
import { THREE, Kit, item, P, rng, clamp, shellGeo, gridGeo, leafGeo, placeLeaf, ellipse } from './helpers.js';

/* ------------------------------------------------------------ patio chair */

/** Slats along x laid on a sloped plane: from (y0, z0) to (y1, z1), n slats with gaps. */
export function slats(k, role, mat, w, n, y0, z0, y1, z1, t = 0.018) {
  const len = Math.hypot(y1 - y0, z1 - z0), ang = Math.atan2(y1 - y0, z1 - z0);
  const sw = (len - (n - 1) * 0.01) / n;
  for (let i = 0; i < n; i++) {
    const f = (sw / 2 + i * (sw + 0.01)) / len;
    k.box(role, mat, w, t, sw, 0, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f, { r: 0.003, rx: -ang });
  }
}

const patioChair = item({
  id: 'patio-chair', category: 'outdoor', ko: '야외 의자', en: 'Patio armchair', size: [0.62, 0.86, 0.68],
  params: [
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.bool('cushion', '방석', 'Cushion', true),
    P.mat('fabric', '방석 천', 'Cushion fabric', 'fabric-linen-white', 'fabric'),
  ],
  tags: ['patio chair', 'garden chair', 'outdoor chair', '야외 의자', '정원 의자', '티크 의자', '테라스'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.62, d = 0.68, lw = 0.045, seatY = 0.4;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - lw / 2);
      k.box('frame', p.wood, lw, 0.62, lw, x, 0.31, d / 2 - 0.06, { r: 0.004, segs: 2 }); // front leg up to the arm
      k.box('frame', p.wood, lw, 0.6, lw, x, 0.3, -d / 2 + 0.07, { r: 0.004, segs: 2 }); // back leg
      k.box('frame', p.wood, 0.075, 0.025, d - 0.02, x, 0.632, 0.0, { r: 0.006, segs: 2 }); // flat arm
      k.box('frame', p.wood, 0.03, 0.06, d - 0.12, x - s * 0.005, seatY - 0.05, 0, { r: 0.003 }); // seat rail
      k.box('frame', p.wood, 0.03, 0.05, d - 0.12, x - s * 0.005, 0.1, 0, { r: 0.003 }); // low stretcher
      // reclined back posts
      k.box('frame', p.wood, 0.04, 0.5, 0.04, x - s * 0.02, 0.62, -d / 2 + 0.02, { r: 0.004, segs: 2, rx: -0.22 });
    }
    k.box('frame', p.wood, w - 0.08, 0.06, 0.03, 0, seatY - 0.05, d / 2 - 0.06, { r: 0.003 });
    slats(k, 'slats', p.wood, w - 2 * lw - 0.01, 6, seatY - 0.02, d / 2 - 0.05, seatY - 0.04, -d / 2 + 0.12);
    // back slats (horizontal) following the post angle
    for (let i = 0; i < 5; i++) {
      const t = 0.13 + i * 0.075;
      k.box('slats', p.wood, w - 0.12, 0.06, 0.018, 0, 0.42 + t * Math.cos(0.22), -d / 2 + 0.07 - t * Math.sin(0.22) + 0.02, { r: 0.004, rx: -0.22 });
    }
    if (p.cushion) k.soft('cushion', p.fabric, w - 2 * lw - 0.02, 0.07, d - 0.2, 0.03, 0, seatY + 0.02, 0.04, { puff: 0.012 });
    centreKit(k, { y: false }); // the raked back reaches further than the front legs
    return k.group();
  },
});

const lounger = item({
  id: 'sun-lounger', category: 'outdoor', ko: '선베드', en: 'Sun lounger', size: [0.7, 0.9, 1.95],
  params: [
    P.num('recline', '등받이 각도', 'Back angle', 45, 0, 75, 5),
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.bool('cushion', '쿠션', 'Cushion', true),
    P.mat('fabric', '쿠션 천', 'Cushion fabric', 'fabric-linen-beige', 'fabric'),
  ],
  tags: ['sun lounger', 'deck chair', 'chaise', '선베드', '썬베드', '라운저', '수영장'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const w = 0.7, L = 1.95, y = 0.32, backL = 0.72;
    const a = THREE.MathUtils.degToRad(clamp(p.recline, 0, 75));
    for (const s of [-1, 1]) {
      k.box('frame', p.wood, 0.04, 0.09, L, s * (w / 2 - 0.02), y - 0.045, 0, { r: 0.005, segs: 2 });
      k.box('frame', p.wood, 0.05, y - 0.09, 0.05, s * (w / 2 - 0.03), (y - 0.09) / 2, L / 2 - 0.1, { r: 0.004 });
      // wheels at the head end
      k.rod('frame', 'rubber-black', [s * (w / 2 + 0.005), 0.09, -L / 2 + 0.12], [s * (w / 2 - 0.035), 0.09, -L / 2 + 0.12], 0.09, { segs: k.seg(24, 8) });
    }
    // seat slats (flat part) + reclining back slats hinged at z = −L/2 + backL
    const zh = -L / 2 + backL;
    for (let i = 0; i < 11; i++) k.box('slats', p.wood, w - 0.1, 0.018, 0.08, 0, y - 0.01, zh + 0.05 + i * 0.1, { r: 0.003 });
    for (let i = 0; i < 7; i++) {
      const t = 0.05 + i * 0.1;
      k.box('slats', p.wood, w - 0.1, 0.018, 0.08, 0, y + Math.sin(a) * t, zh - Math.cos(a) * t, { r: 0.003, rx: a });
    }
    if (p.cushion) {
      k.soft('cushion', p.fabric, w - 0.12, 0.06, L - backL - 0.06, 0.025, 0, y + 0.03, zh + (L - backL) / 2, { puff: 0.01 });
      const c = (backL - 0.06) / 2;
      k.soft('cushion', p.fabric, w - 0.12, 0.06, backL - 0.06, 0.025, 0, y + 0.03 + Math.sin(a) * c, zh - Math.cos(a) * c, { puff: 0.01, rx: a });
    }
    return k.group();
  },
});

/* ---------------------------------------------------------------- parasol */

const parasol = item({
  id: 'parasol', category: 'outdoor', ko: '파라솔', en: 'Parasol', size: [2.7, 2.5, 2.7],
  params: [
    P.len('diameter', '지름', 'Diameter', 2.7, 1.8, 3.5),
    P.len('height', '높이', 'Height', 2.5, 2.2, 2.8),
    P.int('ribs', '살 수', 'Ribs', 8, 6, 12),
    P.mat('fabric', '천', 'Canopy', 'fabric-linen-beige', 'fabric'),
    P.mat('pole', '기둥', 'Pole', 'wood-teak', 'wood'),
    P.bool('valance', '가장자리 천', 'Valance', true),
  ],
  tags: ['parasol', 'umbrella', 'patio umbrella', '파라솔', '야외 파라솔', '양산'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    // an even rib count keeps the polygon (and the bbox) symmetric about the pole
    const R = p.diameter / 2, H = p.height, n = Math.max(6, 2 * Math.round(p.ribs / 2)), top = H - 0.05, drop = 0.42;
    const seg = Math.PI * 2 / n;
    // regular polygon outline with fabric sagging between the ribs
    const surf = (u, v) => {
      const th = u * Math.PI * 2;
      let ph = ((th % seg) + seg) % seg - seg / 2;
      const rr = v * R * Math.cos(seg / 2) / Math.cos(ph);
      const f = 1 - (ph / (seg / 2)) ** 2;
      const y = top - drop * v ** 1.35 - 0.04 * v * f;
      return [Math.cos(th) * rr, y, Math.sin(th) * rr];
    };
    const nu = k.seg(n * 8, n * 2), nv = k.seg(14, 5);
    k.add('canopy', p.fabric, shellGeo(nu, nv, (u, v) => surf(1 - u, v), 0.004));
    if (p.valance) {
      // short flaps hanging from the edge
      k.add('canopy', p.fabric, shellGeo(nu, 1, (u, v) => { const q = surf(1 - u, 1); return [q[0] * 1.002, q[1] - v * 0.13, q[2] * 1.002]; }, 0.003));
    }
    // pole, top finial, hub and ribs + struts under the fabric
    k.cyl('pole', p.pole, 0.022, 0.024, top + 0.02, 0, 0.0, 0, { segs: k.seg(16, 6) });
    k.lathe('pole', p.pole, [[0, 0], [0.04, 0], [0.03, 0.04], [0.012, 0.08], [0, 0.1]], 0, top + 0.005, 0, { smooth: 12, segs: k.seg(16, 6) });
    k.cyl('hub', 'metal-steel', 0.04, 0.04, 0.06, 0, top - 0.06, 0, { segs: k.seg(16, 6) });
    k.cyl('hub', 'metal-steel', 0.035, 0.035, 0.08, 0, top - 0.75, 0, { segs: k.seg(16, 6) }); // runner
    for (let i = 0; i < n; i++) {
      const th = i * seg;
      const tip = surf(th / (Math.PI * 2), 1), mid = surf(th / (Math.PI * 2), 0.5);
      const pts = [];
      for (let j = 0; j <= 6; j++) { const q = surf(th / (Math.PI * 2), j / 6); pts.push([q[0], q[1] - 0.012, q[2]]); }
      k.tube('ribs', p.pole, pts, 0.008, { radial: k.seg(6, 4), segs: k.seg(14, 5) });
      k.rod('ribs', p.pole, [0, top - 0.7, 0], [mid[0], mid[1] - 0.015, mid[2]], 0.007, { segs: k.seg(6, 4) });
      k.sphere('ribs', p.pole, 0.012, tip[0], tip[1] - 0.012, tip[2], { segs: k.seg(8, 4), rings: k.seg(5, 3) });
    }
    // crank handle + square granite base
    k.box('hub', 'metal-steel', 0.03, 0.05, 0.05, 0, 1.2, 0.03, { r: 0.006 });
    k.box('base', 'granite-grey', 0.5, 0.07, 0.5, 0, 0.035, 0, { r: 0.012, segs: 2 });
    k.cyl('base', 'metal-steel', 0.045, 0.05, 0.12, 0, 0.07, 0, { segs: k.seg(16, 6) });
    return k.group();
  },
});

/* ------------------------------------------------------------ planter box */

/** Ornamental grass tuft: thin blades arching out from (x, y, z). */
export function grass(k, x, y, z, r, h, count, seed) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, dist = rand() * r;
    const len = h * (0.6 + rand() * 0.4);
    const g = leafGeo(len, 0.012 + rand() * 0.006, { nu: 1, nv: k.hi ? 5 : 3, droop: 0.12 + rand() * 0.2, fold: 0.4, outline: (t) => 1 - t * 0.9 });
    placeLeaf(g, [x + Math.cos(a) * dist, y, z + Math.sin(a) * dist], a + Math.PI / 2, 1.15 + rand() * 0.35, rand() * 0.4);
    k.add('plants', rand() < 0.5 ? 'plant-leaf' : 'plant-leaf-light', g);
  }
}

/** Clipped boxwood ball: a lumpy sphere of leaf material. */
export function boxwood(k, x, y, z, r, seed) {
  const g = new THREE.IcosahedronGeometry(r, k.hi ? 4 : 2);
  const pos = g.attributes.position;
  const rand = rng(seed);
  const ph = [rand() * 9, rand() * 9, rand() * 9];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n = v.clone().normalize();
    const bump = 1 + 0.06 * Math.sin(n.x * 11 + ph[0]) * Math.sin(n.y * 13 + ph[1]) * Math.sin(n.z * 12 + ph[2]) + 0.03 * Math.sin(n.x * 31 + n.z * 27);
    pos.setXYZ(i, n.x * r * bump, n.y * r * bump * 0.9, n.z * r * bump);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeV(g);
  m.translate(x, y, z);
  k.add('plants', 'plant-leaf', m);
}
/** Welds the icosahedron's per-face vertices so the ball shades smoothly. */
function mergeV(g) { const out = mergeVertices(g, 1e-5); out.computeVertexNormals(); return out; }

const planter = item({
  id: 'planter-box', category: 'outdoor', ko: '플랜터 박스', en: 'Planter box', size: [1.0, 0.75, 0.4],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.4, 2.4),
    P.len('depth', '깊이', 'Depth', 0.4, 0.3, 0.8),
    P.len('height', '높이', 'Box height', 0.45, 0.25, 0.9),
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.pick('plant', '식물', 'Planting', 'grass', [['grass', '관상용 풀', 'Ornamental grass'], ['boxwood', '회양목 볼', 'Boxwood balls'], ['none', '없음', 'None']]),
  ],
  tags: ['planter', 'planter box', 'flower box', '플랜터', '화분 박스', '화단', 'garden'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const { width: w, depth: d, height: h } = p, foot = 0.04, t = 0.022;
    // vertical boards around a box, corner posts and a top cap rail
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, 0.045, h, 0.045, sx * (w / 2 - 0.0225), h / 2, sz * (d / 2 - 0.0225), { r: 0.004, segs: 2 });
    const boards = (len, along) => {
      const n = Math.max(2, Math.round((len - 0.09) / 0.095)), bw = (len - 0.09) / n;
      for (let i = 0; i < n; i++) {
        const c = -len / 2 + 0.045 + bw * (i + 0.5);
        for (const s of [-1, 1]) {
          if (along === 'x') k.box('boards', p.wood, bw - 0.006, h - foot - 0.03, t, c, foot + (h - foot - 0.03) / 2, s * (d / 2 - t / 2 - 0.005), { r: 0.003 });
          else k.box('boards', p.wood, t, h - foot - 0.03, bw - 0.006, s * (w / 2 - t / 2 - 0.005), foot + (h - foot - 0.03) / 2, c, { r: 0.003 });
        }
      }
    };
    boards(w, 'x');
    boards(d, 'z');
    for (const s of [-1, 1]) {
      k.box('frame', p.wood, w + 0.02, 0.025, 0.07, 0, h - 0.0125, s * (d / 2 - 0.025), { r: 0.004, segs: 2 });
      k.box('frame', p.wood, 0.07, 0.025, d - 0.1, s * (w / 2 - 0.025), h - 0.0125, 0, { r: 0.004, segs: 2 });
    }
    const sy = h - 0.05;
    k.box('soil', 'soil', w - 0.09, 0.02, d - 0.09, 0, sy - 0.01, 0, { r: 0 });
    if (p.plant === 'grass') {
      const tufts = Math.max(2, Math.round(w / 0.3));
      for (let i = 0; i < tufts; i++) grass(k, -w / 2 + (w / tufts) * (i + 0.5), sy, 0, Math.min(0.08, d * 0.2), 0.32, k.hi ? 40 : 14, 5 + i);
    } else if (p.plant === 'boxwood') {
      const n = Math.max(1, Math.round(w / 0.35)), r = Math.min(0.15, d * 0.38, w / n / 2.1);
      for (let i = 0; i < n; i++) boxwood(k, -w / 2 + (w / n) * (i + 0.5), sy + r * 0.8, 0, r, 9 + i);
    }
    centreKit(k, { y: false }); // random grass blades may lean past one side
    return k.group();
  },
});

/* ---------------------------------------------------------- outdoor table */

const outdoorTable = item({
  id: 'outdoor-table', category: 'outdoor', ko: '야외 테이블', en: 'Outdoor table', size: [1.6, 0.74, 0.9],
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round']]),
    P.len('width', '폭', 'Width', 1.6, 0.7, 2.6),
    P.len('depth', '깊이', 'Depth', 0.9, 0.6, 1.2),
    P.mat('wood', '나무', 'Wood', 'wood-teak', 'wood'),
    P.bool('hole', '파라솔 구멍', 'Parasol hole', true),
  ],
  tags: ['outdoor table', 'garden table', 'patio table', '야외 테이블', '정원 테이블', '티크 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const round = p.shape === 'round';
    const w = p.width, d = round ? p.width : p.depth, h = 0.74, t = 0.03;
    // slatted top: boards along x with 6 mm gaps, clipped to the outline
    const slatW = 0.075, gap = 0.006, n = Math.floor((d - 0.08) / (slatW + gap));
    const z0 = -((n * (slatW + gap)) - gap) / 2;
    for (let i = 0; i < n; i++) {
      const zc = z0 + slatW / 2 + i * (slatW + gap);
      let len = w - 0.1;
      if (round) len = 2 * Math.sqrt(Math.max(0, (w / 2 - 0.05) ** 2 - (Math.abs(zc) + slatW / 2) ** 2));
      if (len < 0.05) continue;
      if (p.hole && Math.abs(zc) < 0.03) {
        // two halves leave the parasol hole in the middle
        const half = len / 2 - 0.03;
        for (const s of [-1, 1]) k.box('top', p.wood, half, 0.022, slatW, s * (0.03 + half / 2), h - 0.011, zc, { r: 0.003 });
      } else k.box('top', p.wood, len, 0.022, slatW, 0, h - 0.011, zc, { r: 0.003 });
    }
    // frame band around the slats
    if (round) {
      const ring = ellipse(w, w);
      ring.holes.push(new THREE.Path(ellipse(w - 0.1, w - 0.1).getPoints(48).reverse()));
      k.slab('top', p.wood, ring, t, h - t, { bevel: 0.004, curveSegs: 48 });
    } else {
      for (const s of [-1, 1]) {
        k.box('top', p.wood, w, t, 0.05, 0, h - t / 2, s * (d / 2 - 0.025), { r: 0.004, segs: 2 });
        k.box('top', p.wood, 0.05, t, d - 0.1, s * (w / 2 - 0.025), h - t / 2, 0, { r: 0.004, segs: 2 });
      }
    }
    // apron + square legs
    const lx = round ? w / 2 * 0.62 : w / 2 - 0.07, lz = round ? w / 2 * 0.62 : d / 2 - 0.07;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', p.wood, 0.055, h - t, 0.055, sx * lx, (h - t) / 2, sz * lz, { r: 0.005, segs: 2 });
    for (const s of [-1, 1]) {
      k.box('legs', p.wood, 2 * lx, 0.07, 0.025, 0, h - t - 0.035, s * lz, { r: 0.003 });
      k.box('legs', p.wood, 0.025, 0.07, 2 * lz, s * lx, h - t - 0.035, 0, { r: 0.003 });
    }
    void gridGeo;
    return k.group();
  },
});

export const ITEMS = [patioChair, lounger, parasol, planter, outdoorTable];
