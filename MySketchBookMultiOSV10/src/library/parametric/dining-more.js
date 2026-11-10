// More dining items (designs + preset variants of dining.js entries). See ARCHITECTURE.md §12 → Library objects.
// Tables, chairs, stools, storage, benches and table-top pieces. Every entry builds through a Kit;
// sizes are measured from the default build (sized()), so they always match the geometry.
import { THREE, Kit, item, P, variant, roundRect, ellipse, superEllipse, shellGeo, drapeGeo, transformAdded, frameShape, clamp, lerp, rng } from './helpers.js';
import { recentre, curvedPanel, splayLegs } from './dining.js';

/* ================================================================ helpers */

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion();
const UP = V3(0, 1, 0);
const SIZE_CTX = { quality: 'high', wallThickness: 0.2, material: () => SIZE_MAT };
const SIZE_MAT = new THREE.MeshBasicMaterial();

/** item() whose `size` is measured (lazily, once) from its default build. */
function sized(def) {
  const entry = item(def);
  delete entry.size;
  let cached = null;
  Object.defineProperty(entry, 'size', {
    enumerable: true, configurable: true,
    get() {
      if (!cached) {
        const b = new THREE.Box3().setFromObject(entry.build({}, SIZE_CTX));
        cached = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(Math.max(0.01, v) * 1000) / 1000);
      }
      return cached;
    },
    set(v) { cached = v; },
  });
  return entry;
}

/** Aligns a geometry built along +y from the origin onto the segment a → b. */
function along(geo, a, b) {
  const A = V3(...a), B = V3(...b);
  _q.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  geo.applyMatrix4(new THREE.Matrix4().compose(A, _q, V3(1, 1, 1)));
  return geo;
}

/** Turned (lathe) member from a to b; prof = [[radius, t]] with t ∈ [0, 1] along the length. */
function turned(k, role, mat, a, b, prof, o = {}) {
  const len = V3(...a).distanceTo(V3(...b));
  let pts = prof.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t * len));
  if (o.smooth) pts = new THREE.SplineCurve(pts).getSpacedPoints(k.seg(o.smooth, 8));
  const geo = new THREE.LatheGeometry(pts, o.segs ?? k.seg(16, 6));
  return k.add(role, mat, along(geo, a, b), o);
}

/** Square-section member from a to b, sTop / sBot = side at b / a (flat shaded faces). */
function bar(k, role, mat, a, b, sA, sB = sA, o = {}) {
  const len = V3(...a).distanceTo(V3(...b));
  const g = new THREE.BoxGeometry(1, len, 1);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  const dA = o.dA ?? sA, dB = o.dB ?? sB;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len;
    p.setX(i, p.getX(i) * lerp(sA, sB, t));
    p.setZ(i, p.getZ(i) * lerp(dA, dB, t));
  }
  g.computeVertexNormals();
  return k.add(role, mat, along(g, a, b), o);
}

/** Turned-leg profiles (bottom → top), radii relative to R. */
const PROF = {
  farm: [[0, 0], [0.62, 0], [0.66, 0.02], [0.56, 0.05], [0.6, 0.075], [0.5, 0.1], [0.55, 0.36], [0.72, 0.45], [0.6, 0.5], [0.86, 0.56], [0.86, 0.6], [0.66, 0.64], [0.92, 0.7], [0.75, 0.74], [1, 0.8], [1, 1], [0, 1]],
  spindle: [[0, 0], [0.62, 0], [0.7, 0.18], [0.85, 0.42], [1, 0.5], [0.8, 0.54], [0.95, 0.6], [0.88, 0.72], [0.78, 1], [0, 1]],
  post: [[0, 0], [0.75, 0], [0.8, 0.1], [0.92, 0.3], [0.8, 0.33], [1, 0.36], [0.8, 0.39], [0.9, 0.7], [0.85, 0.93], [1, 0.96], [0.6, 1], [0, 1]],
  fluted: [[0, 0], [0.5, 0], [0.55, 0.05], [0.48, 0.08], [0.62, 0.7], [0.82, 0.78], [0.7, 0.82], [1, 0.86], [1, 1], [0, 1]],
  dowel: [[0, 0], [0.6, 0], [0.7, 0.04], [1, 1], [0, 1]],
};

/** A seat weave: crossing cords on a seat top (paper cord / rush look). */
function weave(k, role, mat, w0, w1, d, y, z0 = 0, { pitch = 0.022, r = 0.0045 } = {}) {
  const n = Math.max(4, Math.round(d / pitch));
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = z0 + d / 2 - t * d, hw = lerp(w0, w1, t) / 2;
    k.rod(role, mat, [-hw, y, z], [hw, y, z], r, { segs: k.seg(6, 4) });
  }
  const m = Math.max(4, Math.round(Math.min(w0, w1) / pitch / 1.6));
  for (let i = 0; i <= m; i++) {
    const s = i / m - 0.5;
    k.rod(role, mat, [s * w0, y + 0.001, z0 + d / 2], [s * w1, y + 0.001, z0 - d / 2], r * 0.8, { segs: k.seg(6, 4) });
  }
}

/** Plan outline from points [[x, z], …] (slab shapes: shape y = plan z). */
function poly(pts) { return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))); }

/**
 * Table cloth over a w × d top at height `top` hanging `drop`: rolled edges, folds that grow
 * downwards and conical corner drops (rect) or a circular skirt (round). Returns a shell geometry.
 */
function clothGeo(w, d, top, drop, round, k, seed = 2) {
  const r = 0.02, quarter = (Math.PI / 2) * r, thick = 0.004;
  const bend = (s) => (s <= 0 ? [s, 0] : s < quarter ? [r * Math.sin(s / r), r * (1 - Math.cos(s / r))] : [r, r + (s - quarter)]);
  const S = quarter + Math.max(0.01, drop - r);
  const rand = rng(seed), ph = rand() * 6;
  const fold = (dn, phase, amp) => amp * clamp((dn - r) / Math.max(0.05, drop - r), 0, 1) ** 1.3 * Math.sin(phase);
  if (round) {
    const R = w / 2, n = Math.max(8, Math.round(R * 2 * Math.PI / 0.14));
    return shellGeo(k.seg(72, 28), k.seg(30, 12), (u, v) => {
      const a = u * Math.PI * 2, s = v * (R + S), o = s - R;
      let rad = s, y = 0;
      if (o > 0) {
        const [b, dn] = bend(o);
        rad = R + b + fold(dn, a * n + ph, 0.022) + 0.006 * clamp((dn - r) / 0.1, 0, 1);
        y = -dn;
      }
      return [rad * Math.cos(a), top + thick + y, -rad * Math.sin(a)];
    }, thick);
  }
  const nu = k.seg(Math.round((w + 2 * S) / 0.04), 16), nv = k.seg(Math.round((d + 2 * S) / 0.04), 14);
  return shellGeo(nu, nv, (u, v) => {
    const cx = (u - 0.5) * (w + 2 * S), cz = (v - 0.5) * (d + 2 * S);
    const sx = Math.sign(cx) || 1, sz = Math.sign(cz) || 1;
    const ox = Math.abs(cx) - w / 2, oz = Math.abs(cz) - d / 2;
    let X = cx, Z = cz, Y = top + thick;
    if (ox > 0 && oz > 0) {
      const rho = Math.hypot(ox, oz), th = Math.atan2(oz, ox);
      const [b, dn] = bend(rho);
      const bb = b + fold(dn, th * 6 + ph, 0.02) + 0.015 * clamp((dn - r) / 0.15, 0, 1);
      X = sx * (w / 2 + bb * Math.cos(th)); Z = sz * (d / 2 + bb * Math.sin(th)); Y -= dn;
    } else if (ox > 0) {
      const [b, dn] = bend(ox);
      X = sx * (w / 2 + b + fold(dn, cz / 0.13 * Math.PI + ph, 0.014)); Y -= dn;
    } else if (oz > 0) {
      const [b, dn] = bend(oz);
      Z = sz * (d / 2 + b + fold(dn, cx / 0.13 * Math.PI + ph * 1.7, 0.014)); Y -= dn;
    }
    return [X, Y, Z];
  }, thick);
}

/** Simple four-legged apron table frame (square tapered legs + rails) under a top at height h. */
function apronBase(k, mat, L, d, legH, { inset = 0.06, leg = 0.055, foot = 0.035, apron = 0.085, role = 'legs' } = {}) {
  const xs = L / 2 - inset, zs = d / 2 - inset;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(k, role, mat, [sx * xs, 0, sz * zs], [sx * xs, legH, sz * zs], foot, leg);
  k.box(role, mat, 2 * xs, apron, 0.022, 0, legH - apron / 2, zs + leg / 2 - 0.016, { r: 0.002 });
  k.box(role, mat, 2 * xs, apron, 0.022, 0, legH - apron / 2, -zs - leg / 2 + 0.016, { r: 0.002 });
  k.box(role, mat, 0.022, apron, 2 * zs, xs + leg / 2 - 0.016, legH - apron / 2, 0, { r: 0.002 });
  k.box(role, mat, 0.022, apron, 2 * zs, -xs - leg / 2 + 0.016, legH - apron / 2, 0, { r: 0.002 });
}

const WOOD = (def = 'wood-oak', key = 'wood', ko = '나무', en = 'Wood') => P.mat(key, ko, en, def, 'wood');
const H = (def = 0.75, min = 0.7, max = 0.78) => P.len('height', '높이', 'Height', def, min, max);

/* ================================================================ tables */

const extendable = sized({
  id: 'dining-table-extendable', category: 'dining', ko: '확장형 식탁', en: 'Extendable dining table',
  params: [
    P.len('length', '길이(접힘)', 'Length (closed)', 1.6, 1.2, 2.2), P.len('depth', '폭(깊이)', 'Depth', 0.9, 0.8, 1.1), H(),
    P.bool('extended', '확장판 펼침', 'Leaf inserted', true), P.len('leaf', '확장판 폭', 'Leaf width', 0.5, 0.3, 0.6), WOOD('wood-oak'),
  ],
  tags: ['extendable table', 'extension table', 'dining table', '확장형 식탁', '식탁', '확장 테이블', '6인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const leaf = p.extended ? p.leaf : 0, L = p.length + leaf, d = p.depth, t = 0.03, h = p.height;
    const half = p.length / 2;
    // two halves + the leaf, with 1.5 mm seams between them
    for (const s of [-1, 1]) k.slab('top', p.wood, roundRect(half - 0.0015, d, 0.012), t, h - t, { x: s * (leaf / 2 + half / 2 + 0.00075), bevel: 0.005 });
    if (leaf) k.slab('top', p.wood, roundRect(leaf - 0.003, d, 0.001), t, h - t, { bevel: 0.004 });
    const legH = h - t, xs = L / 2 - 0.06, zs = d / 2 - 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(k, 'legs', p.wood, [sx * xs, 0, sz * zs], [sx * xs, legH, sz * zs], 0.036, 0.06);
    // aprons: the long rails split in the middle (the frame slides apart for the leaf)
    const seg = xs - 0.03 - leaf / 2 - 0.004;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('frame', p.wood, seg, 0.085, 0.022, sx * (leaf / 2 + 0.004 + seg / 2), legH - 0.0425, sz * (zs + 0.012), { r: 0.002 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.022, 0.085, 2 * zs - 0.06, sx * (xs + 0.012), legH - 0.0425, 0, { r: 0.002 });
    if (leaf) for (const sz of [-1, 1]) {
      k.box('frame', p.wood, leaf - 0.006, 0.085, 0.022, 0, legH - 0.0425, sz * (zs + 0.012), { r: 0.002 });
      k.box('frame', 'metal-steel', leaf + 0.2, 0.03, 0.02, 0, legH - 0.05, sz * (zs - 0.05), { r: 0.002 });
    }
    return k.group();
  },
});

const tulip = sized({
  id: 'dining-table-tulip', category: 'dining', ko: '튤립 원형 식탁', en: 'Tulip pedestal table',
  params: [
    P.pick('shape', '모양', 'Shape', 'round', [['round', '원형', 'Round'], ['oval', '타원', 'Oval']]),
    P.len('length', '지름/길이', 'Diameter / length', 1.2, 0.9, 2.2), P.len('depth', '폭(타원)', 'Depth (oval)', 1.1, 0.9, 1.3), H(0.73, 0.7, 0.76),
    P.mat('top', '상판', 'Top', 'marble-white', 'stone'), P.mat('base', '받침', 'Base', 'paint-white-gloss', 'paint'),
  ],
  tags: ['tulip table', 'pedestal table', 'round table', '튤립 테이블', '원형 식탁', '대리석 식탁', '4인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const oval = p.shape === 'oval';
    const L = p.length, d = oval ? Math.min(p.depth, L) : L, h = p.height, t = 0.022;
    k.slab('top', p.top, oval ? superEllipse(L, d, 2.3, 96) : ellipse(L, d), t, h - t, { bevel: 0.008, curveSegs: 64 });
    const legH = h - t, R = 0.28 * Math.min(1.1, d / 1.2 + 0.1);
    const prof = [[0, 0], [R, 0], [R + 0.004, 0.006], [R, 0.014], [R * 0.82, 0.03], [R * 0.45, 0.07], [R * 0.24, 0.15], [0.055, 0.3], [0.05, 0.42], [0.065, 0.56], [0.11, legH - 0.07], [0.17, legH - 0.012], [0.17, legH], [0, legH]];
    k.lathe('base', p.base, prof, 0, 0, 0, { smooth: 40, segs: k.seg(48, 12), scale: oval ? [1 + (L / d - 1) * 0.9, 1, 1] : undefined });
    return k.group();
  },
});

const dropLeaf = sized({
  id: 'dining-table-drop-leaf', category: 'dining', ko: '드롭리프 식탁', en: 'Drop-leaf table',
  params: [
    P.len('length', '길이', 'Length', 1.0, 0.8, 1.3), P.len('centre', '가운데 판 폭', 'Centre board', 0.42, 0.3, 0.55), P.len('leaf', '날개 폭', 'Leaf width', 0.34, 0.25, 0.45), H(0.74),
    P.pick('leaves', '날개', 'Leaves', 'both', [['both', '양쪽 펼침', 'Both up'], ['one', '한쪽 펼침', 'One up'], ['none', '접힘', 'Both down']]), WOOD('wood-teak'),
  ],
  tags: ['drop leaf table', 'gateleg table', 'folding table', '드롭리프', '접이식 식탁', '소형 식탁', '2인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, c = p.centre, lw = p.leaf, h = p.height, t = 0.024, legH = h - t;
    k.slab('top', p.wood, roundRect(L, c - 0.002, 0.002), t, h - t, { bevel: 0.004 });
    const up = { 1: p.leaves !== 'none', [-1]: p.leaves === 'both' };
    const xs = L / 2 - 0.09, zs = c / 2 - 0.06;
    for (const s of [1, -1]) {
      if (up[s]) {
        // raised leaf with a rounded outer edge, carried by a swing (gate) leg
        k.slab('top', p.wood, roundRect(L, lw - 0.002, 0.05), t, h - t, { z: s * (c / 2 + lw / 2), bevel: 0.004 });
        const gx = s * L * 0.18, gz = s * (c / 2 + lw * 0.55);
        turned(k, 'legs', p.wood, [gx, 0, gz], [gx, legH, gz], PROF.dowel.map(([r, tt]) => [r * 0.02, tt]), { segs: k.seg(14, 6) });
        k.box('frame', p.wood, 0.03, 0.06, Math.abs(gz) - zs, gx, legH - 0.03, s * (zs + (Math.abs(gz) - zs) / 2), { r: 0.002 });
      } else {
        // hanging leaf, hinged at the edge of the centre board
        k.box('top', p.wood, L, lw, t, 0, h - 0.004 - lw / 2, s * (c / 2 + t / 2 + 0.001), { r: 0.004 });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) turned(k, 'legs', p.wood, [sx * xs, 0, sz * zs], [sx * xs, legH, sz * zs], PROF.dowel.map(([r, tt]) => [r * 0.022, tt]), { segs: k.seg(14, 6) });
    for (const sz of [-1, 1]) k.box('frame', p.wood, 2 * xs, 0.07, 0.02, 0, legH - 0.035, sz * (zs + 0.008), { r: 0.002 });
    for (const sx of [-1, 1]) k.box('frame', p.wood, 0.02, 0.07, 2 * zs, sx * xs, legH - 0.035, 0, { r: 0.002 });
    return recentre(k.group());
  },
});

const trestle = sized({
  id: 'dining-table-trestle', category: 'dining', ko: '트레슬 식탁', en: 'Trestle table',
  params: [P.len('length', '길이', 'Length', 2.0, 1.5, 3.0), P.len('depth', '폭(깊이)', 'Depth', 0.9, 0.8, 1.1), H(0.76), WOOD('wood-oak')],
  tags: ['trestle table', 'farm table', 'dining table', '트레슬 테이블', '원목 식탁', '8인용', 'rustic'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.045, legH = h - t;
    // plank top with breadboard ends
    k.slab('top', p.wood, roundRect(L - 0.16, d, 0.002), t, h - t, { bevel: 0.004 });
    for (const s of [-1, 1]) k.slab('top', p.wood, roundRect(0.078, d, 0.008), t, h - t, { x: s * (L / 2 - 0.039), bevel: 0.005 });
    const xe = L / 2 - Math.min(0.32, L * 0.16), F = d * 0.8;
    const foot = poly([[-F / 2, 0], [F / 2, 0], [F / 2, 0.035], [F / 2 - 0.07, 0.08], [-F / 2 + 0.07, 0.08], [-F / 2, 0.035]]);
    const cleat = poly([[-F / 2, 0.06], [F / 2, 0.06], [F / 2, 0.03], [F / 2 - 0.05, 0], [-F / 2 + 0.05, 0], [-F / 2, 0.03]]);
    for (const s of [-1, 1]) {
      const x = s * xe;
      k.panel('legs', p.wood, foot, 0.09, x, 0, 0, { ry: -Math.PI / 2, bevel: 0.004 });
      k.panel('legs', p.wood, cleat, 0.08, x, legH - 0.06, 0, { ry: -Math.PI / 2, bevel: 0.004 });
      k.box('legs', p.wood, 0.075, legH - 0.14 + 0.01, 0.17, x, 0.075 + (legH - 0.14) / 2 + 0.002, 0, { r: 0.004, segs: 2 });
      // wedge through the stretcher tenon
      k.box('frame', p.wood, 0.022, 0.12, 0.05, s * (xe + 0.075), legH * 0.42, 0, { r: 0.003 });
    }
    k.box('frame', p.wood, 2 * xe + 0.2, 0.085, 0.042, 0, legH * 0.42, 0, { r: 0.004, segs: 2 });
    return k.group();
  },
});

const farmhouse = sized({
  id: 'dining-table-farmhouse', category: 'dining', ko: '팜하우스 식탁', en: 'Farmhouse table',
  params: [
    P.len('length', '길이', 'Length', 1.8, 1.4, 2.6), P.len('depth', '폭(깊이)', 'Depth', 0.92, 0.8, 1.1), H(0.77, 0.74, 0.78),
    P.int('planks', '상판 판재 수', 'Top planks', 5, 3, 7), WOOD('wood-pine', 'top', '상판', 'Top'), P.mat('base', '다리·에이프런', 'Legs & apron', 'wood-white', 'wood'),
  ],
  tags: ['farmhouse table', 'turned legs', 'country table', '팜하우스', '시골풍 식탁', '원목 식탁', '6인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.042, legH = h - t, n = p.planks;
    const pw = d / n;
    for (let i = 0; i < n; i++) k.box('top', p.top, L, t, pw - 0.003, 0, h - t / 2, -d / 2 + pw * (i + 0.5), { r: 0.005, segs: 2 });
    const xs = L / 2 - 0.1, zs = d / 2 - 0.09, R = 0.042, block = 0.16;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * xs, z = sz * zs;
      k.box('legs', p.base, 0.075, block, 0.075, x, legH - block / 2, z, { r: 0.004, segs: 2 });
      turned(k, 'legs', p.base, [x, 0, z], [x, legH - block + 0.004, z], PROF.farm.map(([r, tt]) => [r * R, tt]), { segs: k.seg(20, 8) });
    }
    const ap = 0.12;
    for (const sz of [-1, 1]) k.box('legs', p.base, 2 * xs, ap, 0.024, 0, legH - ap / 2, sz * (zs + 0.022), { r: 0.003 });
    for (const sx of [-1, 1]) k.box('legs', p.base, 0.024, ap, 2 * zs, sx * (xs + 0.022), legH - ap / 2, 0, { r: 0.003 });
    // a small bead moulding under the apron
    for (const sz of [-1, 1]) k.rod('legs', p.base, [-xs + 0.04, legH - ap - 0.002, sz * (zs + 0.036)], [xs - 0.04, legH - ap - 0.002, sz * (zs + 0.036)], 0.006, { segs: k.seg(8, 4) });
    return k.group();
  },
});

const ovalPedestal = sized({
  id: 'dining-table-oval-pedestal', category: 'dining', ko: '타원 대리석 식탁', en: 'Oval marble pedestal table',
  params: [
    P.len('length', '길이', 'Length', 2.0, 1.6, 2.6), P.len('depth', '폭(깊이)', 'Depth', 1.0, 0.9, 1.2), H(0.74),
    P.mat('top', '상판', 'Top', 'marble-white', 'stone'), P.mat('base', '받침', 'Base', 'travertine', 'stone'),
  ],
  tags: ['oval table', 'marble table', 'pedestal', '타원 식탁', '대리석 식탁', '받침대 식탁', '6인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.03, legH = h - t;
    k.slab('top', p.top, superEllipse(L, d, 2.2, 96), t, h - t, { bevel: 0.01, curveSegs: 64 });
    // an elongated drum: wide plinth, waisted body, flared head
    const prof = [[0, 0], [0.3, 0], [0.3, 0.012], [0.28, 0.03], [0.22, 0.2], [0.19, 0.42], [0.2, 0.58], [0.25, legH - 0.04], [0.27, legH - 0.01], [0.26, legH], [0, legH]];
    k.lathe('base', p.base, prof, 0, 0, 0, { smooth: 30, segs: k.seg(56, 14), scale: [Math.max(1.2, (L * 0.5) / 0.6), 1, d / 1.15] });
    return k.group();
  },
});

const parsons = sized({
  id: 'dining-table-parsons', category: 'dining', ko: '파슨스 식탁', en: 'Parsons table',
  params: [P.len('length', '길이', 'Length', 0.9, 0.8, 2.4), P.len('depth', '폭(깊이)', 'Depth', 0.9, 0.7, 1.1), H(0.75), P.mat('finish', '마감', 'Finish', 'wood-walnut', 'wood')],
  tags: ['parsons table', 'square table', 'minimal', '파슨스 테이블', '정사각 식탁', '4인용', '미니멀'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.075, s = 0.075;
    // thick top with legs flush to its corners (the Parsons look)
    k.slab('top', p.finish, roundRect(L, d, 0.004), t, h - t, { bevel: 0.003 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', p.finish, s, h - t + 0.002, s, sx * (L / 2 - s / 2), (h - t) / 2 + 0.001, sz * (d / 2 - s / 2), { r: 0.003 });
    return k.group();
  },
});

const glassTable = sized({
  id: 'dining-table-glass', category: 'dining', ko: '유리 식탁', en: 'Glass dining table',
  params: [
    P.len('length', '길이', 'Length', 1.6, 1.2, 2.2), P.len('depth', '폭(깊이)', 'Depth', 0.9, 0.8, 1.0), H(),
    P.mat('glass', '유리', 'Glass', 'glass-clear', 'glass'), P.mat('frame', '프레임', 'Frame', 'metal-chrome', 'metal'),
  ],
  tags: ['glass table', 'chrome', 'modern table', '유리 식탁', '크롬', '모던 식탁', '4인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, gt = 0.012, r = 0.014;
    k.slab('glass', p.glass, roundRect(L, d, 0.03), gt, h - gt, { bevel: 0.002 });
    const yt = h - gt - r - 0.002, yb = r, xe = L / 2 - 0.26, zt = d / 2 - 0.17, zb = d / 2 - 0.08;
    for (const s of [-1, 1]) {
      const x = s * xe;
      k.bentTube('frame', p.frame, [[x, yt, 0], [x, yt, zt], [x, yb, zb], [x, yb, -zb], [x, yt, -zt], [x, yt, 0.001]], r, 0.05);
    }
    k.rod('frame', p.frame, [-xe, yt, 0], [xe, yt, 0], r * 0.9);
    // clear bumpers the glass rests on
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('frame', 'plastic-white', 0.012, 0.012, 0.003, sx * xe, h - gt - 0.003, sz * zt * 0.7, { segs: 10 });
    return k.group();
  },
});

/** Live-edge outline: wavy long sides, sawn ends. */
function liveEdge(L, d, seed, sideZ) {
  const rand = rng(seed);
  const a = [rand() * 6, rand() * 6, rand() * 6], amp = [0.022, 0.012, 0.006];
  return (x, s) => s * d / 2 + s * (amp[0] * Math.sin(x * 2.1 + a[0] + s) + amp[1] * Math.sin(x * 5.3 + a[1] * s) + amp[2] * Math.sin(x * 11 + a[2])) - s * 0.012 * (1 - Math.cos((x / L) * Math.PI * 2)) + (sideZ ?? 0);
}

const liveEdgeTable = sized({
  id: 'dining-table-live-edge', category: 'dining', ko: '우드슬랩 식탁', en: 'Live-edge slab table',
  params: [
    P.len('length', '길이', 'Length', 2.0, 1.6, 2.8), P.len('depth', '폭(깊이)', 'Depth', 0.95, 0.8, 1.1), H(0.76),
    WOOD('wood-walnut'), P.bool('river', '레진 리버', 'Resin river', false), P.mat('frame', '다리', 'Legs', 'metal-black', 'metal'),
  ],
  tags: ['live edge', 'slab table', 'wood slab', '우드슬랩', '원목 상판', '통원목 식탁', 'river table', '리버 테이블'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.055, legH = h - t;
    const edge = liveEdge(L, d, 7);
    const N = k.seg(60, 20), xsOf = (i) => -L / 2 + (i / N) * L;
    const side = (s) => Array.from({ length: N + 1 }, (_, i) => [xsOf(i), edge(xsOf(i), s)]);
    if (!p.river) {
      k.slab('top', p.wood, poly([...side(-1), ...side(1).reverse()]), t, h - t, { bevel: 0.008 });
    } else {
      const mid = (x, o) => 0.04 * Math.sin(x * 2.6 + 1) + o * (0.045 + 0.025 * Math.sin(x * 3.7 + 2));
      const line = (o) => Array.from({ length: N + 1 }, (_, i) => [xsOf(i), mid(xsOf(i), o)]);
      k.slab('top', p.wood, poly([...side(-1), ...line(-1).reverse()]), t, h - t, { bevel: 0.008 });
      k.slab('top', p.wood, poly([...line(1), ...side(1).reverse()]), t, h - t, { bevel: 0.008 });
      k.slab('resin', 'glass-tinted', poly([...line(-1.04), ...line(1.04).reverse()]), t - 0.002, h - t + 0.001, { bevel: 0.002, overrides: { color: '#2f6f9a' } });
    }
    // two trapezoid steel frames
    const xe = L / 2 - 0.28, zt = d / 2 - 0.16, zb = d / 2 - 0.1, s = 0.04;
    for (const sx of [-1, 1]) {
      const x = sx * xe;
      for (const sz of [-1, 1]) bar(k, 'legs', p.frame, [x, 0, sz * zb], [x, legH - s, sz * zt], s);
      k.box('legs', p.frame, s, s, 2 * zt + s, x, legH - s / 2, 0, { r: 0.002 });
      k.box('legs', p.frame, s, s * 0.6, 2 * zb + s, x, s * 0.3, 0, { r: 0.002 });
    }
    return k.group();
  },
});

const xBase = sized({
  id: 'dining-table-x-base', category: 'dining', ko: 'X자 다리 식탁', en: 'X-base dining table',
  params: [P.len('length', '길이', 'Length', 1.8, 1.4, 2.4), P.len('depth', '폭(깊이)', 'Depth', 0.9, 0.8, 1.0), H(), WOOD('wood-oak')],
  tags: ['x base table', 'cross leg', 'dining table', 'X자 다리', '원목 식탁', '6인용', 'rustic'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.04, legH = h - t - 0.045;
    k.slab('top', p.wood, roundRect(L, d, 0.006), t, h - t, { bevel: 0.005 });
    const xe = L / 2 - 0.2, zf = d / 2 - 0.09, bw = 0.085;
    const ang = Math.atan2(2 * zf, legH), hw = bw / 2 / Math.cos(ang);
    for (const sx of [-1, 1]) {
      const x = sx * xe;
      k.box('legs', p.wood, 0.07, 0.045, d - 0.1, x, h - t - 0.0225, 0, { r: 0.004 });
      for (const sz of [-1, 1]) {
        const z0 = -sz * zf, z1 = sz * zf;
        k.panel('legs', p.wood, poly([[z0 - hw, 0], [z0 + hw, 0], [z1 + hw, legH], [z1 - hw, legH]]), 0.048 - (sz > 0 ? 0 : 0.002), x, 0, 0, { ry: -Math.PI / 2, bevel: 0.003 });
      }
    }
    k.box('frame', p.wood, 2 * xe, 0.07, 0.045, 0, legH / 2, 0, { r: 0.004, segs: 2 });
    return k.group();
  },
});

const barTable = sized({
  id: 'dining-table-bar', category: 'dining', ko: '바 테이블', en: 'Bar-height table',
  params: [
    P.len('length', '길이', 'Length', 1.4, 1.0, 2.0), P.len('depth', '폭(깊이)', 'Depth', 0.6, 0.5, 0.8), H(1.05, 0.9, 1.1),
    WOOD('wood-oak', 'top', '상판', 'Top'), P.mat('frame', '프레임', 'Frame', 'metal-black', 'metal'),
  ],
  tags: ['bar table', 'high table', 'pub table', '바 테이블', '하이 테이블', '홈바', '2인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.04, legH = h - t, s = 0.045;
    k.slab('top', p.top, roundRect(L, d, 0.01), t, h - t, { bevel: 0.006 });
    const xs = L / 2 - 0.06, zs = d / 2 - 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('legs', p.frame, s, legH, s, sx * xs, legH / 2, sz * zs, { r: 0.003 });
    for (const sz of [-1, 1]) k.box('legs', p.frame, 2 * xs, 0.04, 0.03, 0, legH - 0.02, sz * zs, { r: 0.002 });
    for (const sx of [-1, 1]) k.box('legs', p.frame, 0.03, 0.04, 2 * zs, sx * xs, legH - 0.02, 0, { r: 0.002 });
    // foot rails: long sides at 0.3 m (round, brass-capped), ends lower
    for (const sz of [-1, 1]) k.rod('rail', 'metal-brass', [-xs, 0.3, sz * zs], [xs, 0.3, sz * zs], 0.013);
    for (const sx of [-1, 1]) k.box('legs', p.frame, 0.03, 0.03, 2 * zs, sx * xs, 0.16, 0, { r: 0.002 });
    return k.group();
  },
});

const bistro = sized({
  id: 'dining-table-bistro', category: 'dining', ko: '비스트로 테이블', en: 'Bistro table',
  params: [
    P.pick('shape', '모양', 'Shape', 'round', [['round', '원형', 'Round'], ['square', '사각', 'Square']]),
    P.len('size', '지름/폭', 'Diameter / width', 0.6, 0.5, 0.8), H(0.74, 0.72, 0.76),
    P.mat('top', '상판', 'Top', 'marble-white', 'stone'), P.mat('base', '받침', 'Base', 'metal-black', 'metal'),
  ],
  tags: ['bistro table', 'cafe table', 'small table', '비스트로', '카페 테이블', '소형 식탁', '2인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = p.size, h = p.height, t = 0.02, legH = h - t;
    k.slab('top', p.top, p.shape === 'round' ? ellipse(D, D) : roundRect(D, D, 0.015), t, h - t, { bevel: 0.006, curveSegs: 48 });
    // cast column with rings, a spreader plate on top
    const prof = [[0, 0], [0.055, 0], [0.055, 0.015], [0.04, 0.035], [0.034, 0.07], [0.026, 0.12], [0.022, 0.4], [0.032, 0.42], [0.032, 0.44], [0.022, 0.46], [0.024, legH - 0.07], [0.04, legH - 0.05], [0.11, legH - 0.022], [0.13, legH - 0.012], [0.13, legH], [0, legH]];
    k.lathe('base', p.base, prof, 0, 0, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      const pts = [[0.03, 0.09], [0.1, 0.055], [0.19, 0.022], [0.255, 0.012], [0.285, 0.025], [0.275, 0.045], [0.255, 0.035]];
      k.tube('base', p.base, pts.map(([r, y]) => [c * r, y, s * r]), 0.012, { caps: true, radial: k.seg(10, 5) });
    }
    return recentre(k.group());
  },
});

const foldingTable = sized({
  id: 'dining-table-folding', category: 'dining', ko: '접이식 식탁', en: 'Folding dining table',
  params: [
    P.len('length', '길이', 'Length', 1.2, 0.9, 1.8), P.len('depth', '폭(깊이)', 'Depth', 0.75, 0.6, 0.9), H(0.74),
    WOOD('wood-ash', 'top', '상판', 'Top'), P.mat('frame', '프레임', 'Frame', 'metal-white', 'metal'),
  ],
  tags: ['folding table', 'portable table', 'compact', '접이식 테이블', '접이식 식탁', '소형', '4인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const L = p.length, d = p.depth, h = p.height, t = 0.025, legH = h - t, r = 0.013;
    k.slab('top', p.top, roundRect(L, d, 0.03), t, h - t, { bevel: 0.006 });
    const xe = L / 2 - 0.1, zd = d / 2 - 0.06, yt = legH - r;
    // folding U legs, side rails, a cross bar and a folding brace each end
    for (const s of [-1, 1]) {
      const x = s * xe;
      k.bentTube('frame', p.frame, [[x, 0.012, -zd], [x, yt, -zd], [x, yt, zd], [x, 0.012, zd]], r, 0.05);
      k.rod('frame', p.frame, [x, 0.16, -zd], [x, 0.16, zd], r * 0.8);
      for (const sz of [-1, 1]) {
        k.sphere('frame', 'rubber-black', r * 1.1, x, 0.011, sz * zd, { scale: [1, 0.8, 1], segs: 8, rings: 5 });
        k.rod('frame', p.frame, [x, legH * 0.42, sz * zd], [s * (xe - 0.32), yt, sz * zd], r * 0.6);
        k.cyl('frame', p.frame, 0.012, 0.012, 0.016, x, legH * 0.42 - 0.008, sz * zd, { rx: Math.PI / 2, segs: 10 });
      }
    }
    for (const sz of [-1, 1]) k.box('frame', p.frame, L - 0.08, 0.035, 0.02, 0, legH - 0.0175, sz * (zd + 0.03), { r: 0.002 });
    return k.group();
  },
});

const clothed = sized({
  id: 'dining-table-clothed', category: 'dining', ko: '식탁보 덮은 식탁', en: 'Table with tablecloth',
  params: [
    P.pick('shape', '모양', 'Shape', 'rect', [['rect', '사각', 'Rectangle'], ['round', '원형', 'Round']]),
    P.len('length', '길이/지름', 'Length / diameter', 1.6, 0.8, 2.4), P.len('depth', '폭(깊이)', 'Depth', 0.9, 0.7, 1.2), H(0.75),
    P.len('drop', '늘어뜨림', 'Drop', 0.3, 0.12, 0.6), P.mat('cloth', '식탁보', 'Tablecloth', 'fabric-linen-white', 'fabric'),
    P.bool('runner', '테이블 러너', 'Table runner', true), P.mat('runnerMat', '러너', 'Runner', 'fabric-linen-grey', 'fabric'), WOOD('wood-walnut', 'wood', '다리', 'Legs'),
  ],
  tags: ['tablecloth', 'dressed table', 'table linen', '식탁보', '테이블보', '식탁', 'runner', '러너'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const round = p.shape === 'round', L = p.length, d = round ? L : Math.min(p.depth, L + 0.4), h = p.height, t = 0.025;
    // a square cloth's corners hang √2 × further than its sides: keep them off the floor
    const q = (Math.PI / 2) * 0.02;
    const drop = Math.min(p.drop, h - 0.12, round ? Infinity : (h - 0.03 + q) / Math.SQRT2 - q + 0.02);
    k.slab('top', p.wood, round ? ellipse(L - 0.02, d - 0.02) : roundRect(L - 0.02, d - 0.02, 0.01), t, h - t - 0.004, { bevel: 0.003 });
    const inset = round ? L * 0.22 : 0.09;
    splayLegs(k, 'legs', p.wood, L, d, h - t - 0.002, { inset, r: 0.024, rFoot: 0.015, splay: 0.012 });
    k.add('cloth', p.cloth, clothGeo(L, d, h - 0.003, drop, round, k));
    if (p.runner) {
      const rw = Math.min(0.36, d * 0.4);
      const g = drapeGeo({ w: L, l: rw, top: h + 0.003, drop: Math.min(0.22, drop * 0.8), r: 0.02, thick: 0.003, folds: 0.004, nu: k.seg(48, 16), nv: k.seg(6, 3), sides: { left: true, right: true, foot: false }, puffy: 0 });
      g.translate(0, 0, 0);
      k.add('runner', p.runnerMat, g);
    }
    return k.group();
  },
});

const spider = sized({
  id: 'dining-table-pedestal-wood', category: 'dining', ko: '원목 받침 원형 식탁', en: 'Wooden pedestal round table',
  params: [P.len('diameter', '지름', 'Diameter', 1.1, 0.9, 1.4), H(0.75), WOOD('wood-walnut')],
  tags: ['pedestal table', 'round table', 'wood', '원형 식탁', '원목 식탁', '받침대', '4인용'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const D = p.diameter, h = p.height, t = 0.032, legH = h - t;
    k.slab('top', p.wood, ellipse(D, D), t, h - t, { bevel: 0.006, curveSegs: 64 });
    k.box('frame', p.wood, D * 0.55, 0.035, 0.07, 0, legH - 0.0175, 0, { r: 0.003 });
    k.box('frame', p.wood, 0.07, 0.035, D * 0.55, 0, legH - 0.0175, 0, { r: 0.003 });
    // square column with four sweeping feet
    k.box('legs', p.wood, 0.11, legH - 0.035, 0.11, 0, (legH - 0.035) / 2, 0, { r: 0.006, segs: 2 });
    const F = Math.min(0.42, D * 0.36);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(F, 0); shape.lineTo(F, 0.025); shape.quadraticCurveTo(F * 0.45, 0.04, 0.03, 0.26); shape.lineTo(0, 0.26); shape.lineTo(0, 0);
    for (let i = 0; i < 4; i++) k.panel('legs', p.wood, shape, 0.05, 0, 0, 0, { ry: (i * Math.PI) / 2 + Math.PI / 4, bevel: 0.004 });
    return k.group();
  },
});

/* ================================================================ chair parts */

/**
 * A ribbon swept along a side-view profile (z, y) across x: moulded shells (S chair, shell chairs).
 * width(v) = full width at v, curl(v) = how far the side edges bend towards the sitter.
 */
function sweepShell(k, prof, width, curl, thick, { nu = 24, nv = 40, round = 0.07, lift = null, pow = 2.4 } = {}) {
  const curve = new THREE.CatmullRomCurve3(prof.map(([z, y]) => V3(0, y, z)), false, 'centripetal');
  const nU = k.seg(nu, 8), nV = k.seg(nv, 14), len = curve.getLength();
  return shellGeo(nU, nV, (u, v) => {
    let s = u * 2 - 1, ve = v;
    // rounded corners: the square grid corners are squeezed onto quarter discs (radius `round` metres)
    const rs = Math.min(0.45, round / (width(v) / 2)), rv = round / len;
    for (const end of [0, 1]) {
      const dv = end ? (ve - (1 - rv)) / rv : (rv - ve) / rv, ds = (Math.abs(s) - (1 - rs)) / rs;
      if (dv > 0 && ds > 0) {
        const m = Math.max(dv, ds) / Math.hypot(dv, ds);
        s = Math.sign(s) * (1 - rs + ds * m * rs);
        ve = end ? 1 - rv + dv * m * rv : rv - dv * m * rv;
      }
    }
    const a = Math.abs(s);
    const P = curve.getPointAt(ve), T = curve.getTangentAt(ve);
    const N = V3(0, -T.z, T.y).normalize();
    const c = curl(ve) * a ** pow;
    const y = P.y + N.y * c + (lift ? lift(ve, s) : 0), z = P.z + N.z * c;
    return [s * width(ve) / 2, y, z];
  }, thick);
}

/**
 * A padded band swept round an arc (tub backs, low stool backs): plan arc of radius R around (0, cz)
 * from angle −span to +span (0 = straight back), section = rounded box `thick` wide from y0 up to top(t).
 * The ends close into rounded noses.
 */
function bandGeo(k, { R, cz = 0, span, y0, top, thick, nu = 40, nv = 20, n = 5 }) {
  const nU = k.seg(nu, 12), nV = k.seg(nv, 10);
  const geo = new THREE.BufferGeometry();
  const pos = [], idx = [];
  for (let i = 0; i <= nU; i++) {
    const u = i / nU, t = u * 2 - 1, ang = t * span;
    const e = Math.min(1, (1 - Math.abs(t)) / 0.06);
    const end = Math.sqrt(Math.max(0, 1 - (1 - e) ** 2));
    const yt = top(t), hh = ((yt - y0) / 2) * (0.35 + 0.65 * end), hw = (thick / 2) * end;
    const cx = Math.sin(ang) * R, czz = cz - Math.cos(ang) * R, nx = Math.sin(ang), nz = -Math.cos(ang);
    for (let j = 0; j <= nV; j++) {
      const th = (j / nV) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const dx = hw * Math.sign(c) * Math.abs(c) ** (2 / n), dy = hh * Math.sign(s) * Math.abs(s) ** (2 / n);
      pos.push(cx + nx * dx, y0 + hh + dy, czz + nz * dx);
    }
  }
  for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
    const a = i * (nV + 1) + j, b = a + nV + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Four splayed turned legs; returns at(sx, sz, y) → [x, z] on the leg axis. */
function turnedLegs(k, role, mat, w, d, h, { inset = 0.05, splayX = 0.03, splayZ = splayX, R = 0.02, prof = PROF.dowel, zOff = 0, backH = h } = {}) {
  const xs = w / 2 - inset, zs = d / 2 - inset;
  const at = (sx, sz, y) => { const hh = sz < 0 ? backH : h; const f = 1 - y / hh; return [sx * (xs + splayX * f), zOff + sz * (zs + splayZ * f)]; };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hh = sz < 0 ? backH : h;
    const [fx, fz] = at(sx, sz, 0);
    turned(k, role, mat, [fx, 0, fz], [sx * xs, hh, zOff + sz * zs], prof.map(([r, t]) => [r * R, t]), { segs: k.seg(14, 6) });
  }
  return at;
}

/** Rod between two legs at heights y (stretchers). */
function stretch(k, role, mat, at, a, b, y, r = 0.009, yb = y) {
  const [x0, z0] = at(a[0], a[1], y), [x1, z1] = at(b[0], b[1], yb);
  k.rod(role, mat, [x0, y, z0], [x1, yb, z1], r, { segs: k.seg(10, 5) });
}

const CHAIR_SH = 0.46;

function chairWindsor(k, p) {
  const w = p.wood, sh = 0.45;
  k.slab('seat', w, superEllipse(0.47, 0.44, 3.2, 48), 0.042, sh - 0.042, { bevel: 0.014, bevelSegs: 4 });
  const at = turnedLegs(k, 'legs', w, 0.4, 0.37, sh - 0.04, { inset: 0.055, splayX: 0.04, splayZ: 0.045, R: 0.019, prof: PROF.spindle });
  for (const sx of [-1, 1]) stretch(k, 'legs', w, at, [sx, 1], [sx, -1], 0.19, 0.01);
  { const [x0, z0] = at(-1, 1, 0.19), [, z1] = at(-1, -1, 0.19); const zm = (z0 + z1) / 2; const [x1] = at(1, 1, 0.19);
    turned(k, 'legs', w, [x0, 0.19, zm], [x1, 0.19, zm], PROF.spindle.map(([r, t]) => [r * 0.012, t]), { segs: k.seg(10, 5) }); }
  // steam-bent bow and spindles
  const bow = (a) => [Math.cos(a) * 0.205, sh - 0.01 + 0.47 * Math.sin(a) ** 0.55, -0.165 - 0.07 * Math.sin(a)];
  const pts = [];
  for (let i = 0; i <= 18; i++) pts.push(bow((i / 18) * Math.PI));
  k.tube('frame', w, pts, 0.014, { radial: k.seg(10, 5) });
  for (let i = 0; i < 7; i++) {
    const x = -0.13 + (i / 6) * 0.26, a = Math.acos(x / 0.205), top = bow(a);
    k.rod('frame', w, [x * 0.92, sh - 0.01, -0.15], top, 0.0068, { r2: 0.0058, segs: k.seg(8, 5) });
  }
}

function chairWishbone(k, p) {
  const w = p.wood, sh = 0.44, cord = p.seat ?? 'rattan';
  for (const s of [-1, 1]) {
    turned(k, 'legs', w, [s * 0.218, 0, 0.205], [s * 0.212, sh, 0.2], [[0, 0], [0.013, 0], [0.018, 1], [0, 1]], { segs: k.seg(14, 6) });
    k.tube('legs', w, [[s * 0.2, 0, -0.215], [s * 0.205, 0.22, -0.19], [s * 0.21, sh, -0.165], [s * 0.222, 0.6, -0.14], [s * 0.226, 0.692, -0.118]], 0.016, { radial: k.seg(12, 6) });
  }
  // steam-bent top rail that becomes the arms
  const rail = [[-0.245, 0.684, -0.035], [-0.232, 0.692, -0.12], [-0.19, 0.7, -0.195], [-0.1, 0.705, -0.236], [0, 0.707, -0.245]];
  k.tube('frame', w, [...rail, ...rail.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])], 0.017, { caps: true, radial: k.seg(12, 6) });
  // Y splat
  const Y = poly([[-0.032, 0], [0.032, 0], [0.032, 0.1], [0.12, 0.245], [0.07, 0.255], [0, 0.15], [-0.07, 0.255], [-0.12, 0.245], [-0.032, 0.1]]);
  k.panel('frame', w, Y, 0.018, 0, sh - 0.025, -0.188, { rx: -0.19, bevel: 0.004 });
  // seat frame + paper-cord weave
  k.box('frame', w, 0.4, 0.035, 0.03, 0, sh - 0.02, -0.17, { r: 0.004 });
  k.box('frame', w, 0.44, 0.035, 0.03, 0, sh - 0.02, 0.2, { r: 0.004 });
  for (const s of [-1, 1]) k.rod('frame', w, [s * 0.212, sh - 0.02, 0.2], [s * 0.208, sh - 0.02, -0.165], 0.016);
  const seat = poly([[-0.22, 0.2], [0.22, 0.2], [0.2, -0.17], [-0.2, -0.17]]);
  k.slab('seat', cord, seat, 0.022, sh - 0.025, { bevel: 0.006, overrides: { color: '#cdb78a' } });
  weave(k, 'seat', cord, 0.43, 0.39, 0.36, sh - 0.002, 0.015, { pitch: 0.024, r: 0.004 });
}

/** Cup / tulip shell: open in front (low rim), high at the back. Angle 0 = front (+z). */
function cupGeo(k, { y0, yFront, yBack, rBot, rMid, flare, thick, sharp = 1.4, nu = 56, nv = 18 }) {
  return shellGeo(k.seg(nu, 18), k.seg(nv, 8), (u, v) => {
    const a = u * Math.PI * 2;
    const b = ((1 - Math.cos(a)) / 2) ** sharp;
    const top = yFront + (yBack - yFront) * b;
    const y = y0 + v * (top - y0);
    const q = clamp((y - y0) / 0.075, 0, 1);
    const r = rBot + (rMid - rBot) * Math.sqrt(q) + Math.max(0, y - y0 - 0.075) * flare;
    return [Math.sin(a) * r, y, Math.cos(a) * r];
  }, thick);
}

function chairTulip(k, p) {
  const shell = p.shell ?? 'paint-white-gloss';
  const prof = [[0, 0], [0.25, 0], [0.252, 0.006], [0.24, 0.014], [0.17, 0.03], [0.08, 0.07], [0.042, 0.14], [0.036, 0.25], [0.05, 0.33], [0.1, 0.375], [0.105, 0.38], [0, 0.38]];
  k.lathe('base', shell, prof, 0, 0, 0, { smooth: 30, segs: k.seg(40, 12) });
  k.add('shell', shell, cupGeo(k, { y0: 0.375, yFront: 0.47, yBack: 0.83, rBot: 0.1, rMid: 0.235, flare: 0.07, thick: 0.01 }));
  k.lathe('upholstery', p.fabric, [[0, 0], [0.17, 0], [0.188, 0.01], [0.196, 0.032], [0.186, 0.05], [0.15, 0.058], [0, 0.062]], 0, 0.41, 0.012, { smooth: 18, segs: k.seg(40, 12) });
}

function chairS(k, p) {
  const prof = [[-0.285, 0.84], [-0.262, 0.7], [-0.222, 0.55], [-0.15, 0.452], [0.0, 0.432], [0.17, 0.425], [0.235, 0.39], [0.225, 0.3], [0.165, 0.16], [0.06, 0.035], [-0.06, 0.006], [-0.2, 0.004], [-0.27, 0.012]];
  const width = (v) => (v < 0.3 ? lerp(0.43, 0.5, smooth01(v / 0.3)) : v < 0.5 ? 0.5 : v < 0.7 ? lerp(0.5, 0.36, smooth01((v - 0.5) / 0.2)) : lerp(0.36, 0.5, smooth01((v - 0.7) / 0.3)));
  const curl = (v) => (v < 0.25 ? 0.05 : v < 0.5 ? lerp(0.05, 0.025, (v - 0.25) / 0.25) : v < 0.8 ? lerp(0.025, -0.01, (v - 0.5) / 0.3) : -0.01);
  k.add('shell', p.shell ?? 'plastic-white', sweepShell(k, prof, width, curl, 0.012, { nu: 22, nv: 56, round: 0.08 }), { overrides: p.color ? { color: p.color } : undefined });
}
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function chairLadder(k, p) {
  const w = p.wood, sh = 0.45;
  for (const s of [-1, 1]) {
    turned(k, 'legs', w, [s * 0.205, 0, -0.19], [s * 0.205, 1.04, -0.225], PROF.post.map(([r, t]) => [r * 0.021, t]), { segs: k.seg(14, 6) });
    turned(k, 'legs', w, [s * 0.225, 0, 0.21], [s * 0.225, sh + 0.035, 0.21], PROF.post.map(([r, t]) => [r * 0.021, t]), { segs: k.seg(14, 6) });
  }
  const postZ = (y) => -0.19 - 0.035 * (y / 1.04);
  for (let i = 0; i < 4; i++) {
    const y = 0.6 + i * 0.12;
    const g = curvedPanel(0.39, 0.06 - i * 0.004, 0.55, 0.013, k.seg(12, 5));
    g.rotateY(Math.PI);
    g.translate(0, y, postZ(y) - 0.012);
    k.add('frame', w, g);
  }
  // rush seat over round rails
  const fz = 0.21, bz = postZ(sh);
  k.rod('frame', w, [-0.225, sh - 0.015, fz], [0.225, sh - 0.015, fz], 0.014);
  k.rod('frame', w, [-0.205, sh - 0.015, bz], [0.205, sh - 0.015, bz], 0.014);
  for (const s of [-1, 1]) k.rod('frame', w, [s * 0.225, sh - 0.015, fz], [s * 0.205, sh - 0.015, bz], 0.014);
  const rush = p.seat ?? 'rattan';
  k.slab('seat', rush, poly([[-0.215, fz], [0.215, fz], [0.195, bz], [-0.195, bz]]), 0.028, sh - 0.03, { bevel: 0.008, overrides: { color: '#b49a62' } });
  weave(k, 'seat', rush, 0.43, 0.39, fz - bz - 0.01, sh - 0.002, (fz + bz) / 2, { pitch: 0.018, r: 0.0042 });
  // stretchers: two at the front, two each side, one at the back
  for (const y of [0.16, 0.27]) k.rod('legs', w, [-0.225, y, fz], [0.225, y, fz], 0.0095);
  for (const y of [0.14, 0.25]) for (const s of [-1, 1]) k.rod('legs', w, [s * 0.225, y, fz], [s * 0.205, y, postZ(y)], 0.0095);
  k.rod('legs', w, [-0.205, 0.2, postZ(0.2)], [0.205, 0.2, postZ(0.2)], 0.0095);
}

function chairBentwood(k, p) {
  const w = p.wood, sh = 0.46, r = 0.015;
  k.add('frame', w, new THREE.TorusGeometry(0.205, 0.017, k.seg(10, 5), k.seg(48, 14)).rotateX(Math.PI / 2).translate(0, sh - 0.017, 0));
  k.cyl('seat', p.seat ?? 'rattan', 0.198, 0.198, 0.01, 0, sh - 0.022, 0, { segs: k.seg(48, 14), overrides: { color: '#d3b47c' } });
  const fl = (s, y) => [s * lerp(0.225, 0.16, y / (sh - 0.03)), lerp(0.215, 0.13, y / (sh - 0.03))];
  for (const s of [-1, 1]) { const [x0, z0] = fl(s, 0), [x1, z1] = fl(s, sh - 0.03); k.rod('legs', w, [x0, 0, z0], [x1, sh - 0.03, z1], 0.012, { r2: 0.016 }); }
  // back legs + outer loop in one bend, inner loop inside it
  const half = [[-0.205, 0, -0.29], [-0.18, 0.22, -0.22], [-0.17, sh - 0.02, -0.18], [-0.172, 0.6, -0.205], [-0.17, 0.76, -0.24], [-0.12, 0.86, -0.258], [0, 0.88, -0.262]];
  k.tube('legs', w, [...half, ...half.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])], r, { radial: k.seg(10, 5), segs: k.seg(90, 30) });
  const inner = [[-0.095, sh - 0.01, -0.195], [-0.105, 0.58, -0.215], [-0.09, 0.7, -0.235], [0, 0.745, -0.245]];
  k.tube('legs', w, [...inner, ...inner.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])], 0.011, { radial: k.seg(8, 5) });
  // leg ring
  const y = 0.21, ring = [];
  const bl = (s) => { const t = (y - 0) / (0.22); return [s * lerp(0.205, 0.18, t), y, lerp(-0.29, -0.22, t)]; };
  const [fx, fz] = fl(1, y);
  ring.push([fx, y, fz], bl(1), bl(-1), [-fx, y, fz]);
  k.tube('legs', w, ring, 0.011, { closed: true, radial: k.seg(8, 5), tension: 0.5 });
}

function chairParsons(k, p) {
  const w = p.wood, f = p.fabric;
  for (const s of [-1, 1]) {
    bar(k, 'legs', w, [s * 0.2, 0, 0.2], [s * 0.2, 0.41, 0.2], 0.032, 0.042);
    bar(k, 'legs', w, [s * 0.2, 0, -0.26], [s * 0.2, 0.41, -0.215], 0.032, 0.042);
  }
  k.soft('upholstery', f, 0.47, 0.11, 0.48, 0.025, 0, 0.455, 0.01, { puff: 0.01, sag: 0.004 });
  k.soft('upholstery', f, 0.47, 0.6, 0.075, 0.025, 0, 0.69, -0.235, { puff: 0.008, rx: -0.09 });
}

function chairMedallion(k, p) {
  const w = p.wood, f = p.fabric;
  for (const s of [-1, 1]) {
    turned(k, 'legs', w, [s * 0.215, 0, 0.205], [s * 0.21, 0.37, 0.2], PROF.fluted.map(([r, t]) => [r * 0.024, t]), { segs: k.seg(16, 6) });
    k.tube('legs', w, [[s * 0.19, 0, -0.29], [s * 0.195, 0.2, -0.24], [s * 0.2, 0.37, -0.2]], 0.018, { radial: k.seg(10, 5) });
  }
  k.slab('frame', w, superEllipse(0.5, 0.47, 3.4, 48), 0.07, 0.31, { bevel: 0.008 });
  k.soft('upholstery', f, 0.48, 0.085, 0.45, 0.03, 0, 0.42, 0.005, { puff: 0.016, sag: 0.004 });
  // oval medallion back, tilted back
  const tilt = -0.13, cy = 0.75, cz = -0.215, rx = 0.19, ry = 0.225;
  const at = (x, y, z = 0) => [x, cy + (y) * Math.cos(tilt) - z * Math.sin(tilt), cz + (y) * Math.sin(tilt) + z * Math.cos(tilt)];
  const ring = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; ring.push(at(Math.cos(a) * rx, Math.sin(a) * ry)); }
  k.tube('frame', w, ring, 0.017, { closed: true, radial: k.seg(10, 5) });
  for (const s of [-1, 1]) { const a = -Math.PI / 2 + s * 0.85; k.tube('frame', w, [[s * 0.2, 0.37, -0.2], [s * 0.19, 0.46, -0.205], at(Math.cos(a) * rx, Math.sin(a) * ry)], 0.016, { radial: k.seg(10, 5) }); }
  k.sphere('upholstery', f, 1, ...at(0, 0), { scale: [rx - 0.008, ry - 0.008, 0.032], rx: tilt, segs: k.seg(32, 12), rings: k.seg(20, 8) });
  for (const [x, y] of [[0, 0.1], [-0.07, 0.03], [0.07, 0.03], [0, -0.04], [-0.07, -0.11], [0.07, -0.11], [0, 0.17 - 0.0], [-0.12, -0.04], [0.12, -0.04]]) {
    const zz = 0.032 * Math.sqrt(Math.max(0, 1 - (x / (rx - 0.008)) ** 2 - (y / (ry - 0.008)) ** 2));
    k.sphere('buttons', f, 0.007, ...at(x, y, zz - 0.002), { segs: 8, rings: 5 });
  }
}

function chairCesca(k, p) {
  const m = p.frame ?? 'metal-chrome', w = p.wood, r = 0.0125, sh = 0.46;
  const side = (x) => [[x, 0.83, -0.24], [x, sh - 0.015, -0.205], [x, sh - 0.025, 0.18], [x, r, 0.215], [x, r, -0.215]];
  const L = side(-0.215), R = side(0.215).reverse();
  k.bentTube('frame', m, [...L, ...R], r, 0.06, { radial: k.seg(12, 6) });
  // bent-wood framed cane seat and back
  k.panel('seat', w, frameShape(0.46, 0.44, 0.04, 0.04, 0.03), 0.026, 0, sh + 0.005, 0.0, { rx: -Math.PI / 2, bevel: 0.006 });
  k.box('cane', p.seat ?? 'rattan', 0.39, 0.008, 0.37, 0, sh + 0.003, 0, { r: 0.002, overrides: { color: '#d9bd86' } });
  const bt = -0.12;
  const back = new THREE.ExtrudeGeometry(frameShape(0.45, 0.2, 0.035, 0.035, 0.025), { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: k.hi ? 2 : 1, curveSegments: 6 });
  back.translate(0, 0, -0.011).rotateX(bt).translate(0, 0.72, -0.232);
  k.add('seat', w, back);
  k.box('cane', p.seat ?? 'rattan', 0.385, 0.135, 0.008, 0, 0.72, -0.232, { r: 0.002, rx: bt, overrides: { color: '#d9bd86' } });
}

/** Moulded shell (side / arm) for the shell chairs; returns the y of its underside mounts. */
function shellBody(k, p, arms) {
  const prof = arms
    ? [[0.22, 0.43], [0.19, 0.448], [0.08, 0.44], [-0.06, 0.444], [-0.16, 0.475], [-0.215, 0.55], [-0.24, 0.64], [-0.25, 0.72]]
    : [[0.225, 0.428], [0.19, 0.447], [0.08, 0.44], [-0.06, 0.437], [-0.165, 0.462], [-0.22, 0.535], [-0.248, 0.64], [-0.268, 0.75], [-0.276, 0.81]];
  const width = arms ? (v) => lerp(0.46, 0.62, smooth01((v - 0.2) / 0.7)) : (v) => (v < 0.55 ? lerp(0.45, 0.47, v / 0.55) : v < 0.7 ? lerp(0.47, 0.41, (v - 0.55) / 0.15) : lerp(0.41, 0.47, (v - 0.7) / 0.3));
  const curl = arms ? (v) => lerp(0.035, 0.16, smooth01((v - 0.15) / 0.75)) : (v) => lerp(0.035, 0.06, smooth01((v - 0.4) / 0.4));
  const lift = arms ? (v, s) => -0.05 * Math.abs(s) ** 3 * smooth01((v - 0.6) / 0.4) : null;
  const mat = p.shell ?? 'plastic-white';
  k.add('shell', mat, sweepShell(k, prof, width, curl, 0.009, { nu: arms ? 40 : 24, nv: arms ? 48 : 40, round: 0.07, lift, pow: arms ? 2 : 2.4 }), { overrides: p.color ? { color: p.color } : undefined });
  return 0.412;
}

function chairShell(k, p, base = 'dowel', arms = false) {
  const my = shellBody(k, p, arms);
  const mounts = [[-0.11, 0.11], [0.11, 0.11], [-0.11, -0.1], [0.11, -0.1]];
  for (const [x, z] of mounts) k.cyl('mounts', 'rubber-black', 0.022, 0.022, 0.018, x, my, z, { segs: k.seg(14, 6) });
  if (base === 'dowel') {
    const m = 'metal-black';
    const feet = mounts.map(([x, z]) => [Math.sign(x) * 0.205, 0, z > 0 ? 0.215 : -0.215]);
    mounts.forEach(([x, z], i) => turned(k, 'legs', p.wood, feet[i], [x * 1.05, my - 0.012, z * 1.05], PROF.dowel.map(([r, t]) => [r * 0.017, t]), { segs: k.seg(14, 6) }));
    const lp = (i, t) => feet[i].map((f, j) => lerp(f, [mounts[i][0] * 1.05, my - 0.012, mounts[i][1] * 1.05][j], t));
    const t = 0.5;
    k.rod('wire', m, lp(0, t), lp(3, t), 0.005, { segs: 6 });
    k.rod('wire', m, lp(1, t), lp(2, t), 0.005, { segs: 6 });
    k.rod('wire', m, lp(0, t), lp(2, t), 0.005, { segs: 6 });
    k.rod('wire', m, lp(1, t), lp(3, t), 0.005, { segs: 6 });
    for (const sz of [0, 2]) k.rod('wire', m, [mounts[sz][0] * 1.05, my - 0.014, mounts[sz][1]], [mounts[sz + 1][0] * 1.05, my - 0.014, mounts[sz + 1][1]], 0.008, { segs: 6 });
  } else {
    const m = p.frame ?? 'metal-chrome', yr = 0.15;
    const top = mounts.map(([x, z]) => [x, my - 0.004, z]);
    const feet = mounts.map(([x, z]) => [Math.sign(x) * 0.2, 0.01, z > 0 ? 0.2 : -0.21]);
    const at = (i, y) => { const t = y / (my - 0.004); return [lerp(feet[i][0], top[i][0], t), y, lerp(feet[i][2], top[i][2], t)]; };
    for (let i = 0; i < 4; i++) { k.rod('wire', m, feet[i], top[i], 0.006, { segs: 6 }); k.sphere('mounts', 'plastic-black', 0.01, feet[i][0], 0.008, feet[i][2], { scale: [1, 0.8, 1], segs: 8, rings: 4 }); }
    const ring = [0, 1, 3, 2];
    for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; k.rod('wire', m, at(a, yr), at(b, yr), 0.0045, { segs: 5 }); k.rod('wire', m, at(a, yr), top[b], 0.004, { segs: 5 }); k.rod('wire', m, at(b, yr), top[a], 0.004, { segs: 5 }); }
  }
}

function chairCrossback(k, p) {
  const w = p.wood, sh = 0.46;
  const bz = (y) => -0.215 - 0.035 * (y / 0.86);
  for (const s of [-1, 1]) {
    bar(k, 'legs', w, [s * 0.2, 0, 0.21], [s * 0.2, sh - 0.01, 0.2], 0.028, 0.036);
    bar(k, 'legs', w, [s * 0.195, 0, bz(0)], [s * 0.19, 0.87, bz(0.87)], 0.03, 0.036);
  }
  k.box('frame', w, 0.36, 0.075, 0.024, 0, 0.82, bz(0.82), { r: 0.005, rx: -0.04 });
  k.box('frame', w, 0.36, 0.04, 0.022, 0, sh + 0.055, bz(sh + 0.055), { r: 0.004 });
  for (const s of [-1, 1]) bar(k, 'frame', w, [-s * 0.17, sh + 0.07, bz(sh + 0.07)], [s * 0.17, 0.785, bz(0.785)], 0.042, 0.042, { dA: 0.016, dB: 0.016 });
  // apron + rush seat
  for (const z of [0.2, bz(sh)]) k.box('frame', w, 0.37, 0.05, 0.022, 0, sh - 0.045, z, { r: 0.003 });
  for (const s of [-1, 1]) k.box('frame', w, 0.022, 0.05, 0.4, s * 0.2, sh - 0.045, -0.01, { r: 0.003 });
  const rush = p.seat ?? 'rattan';
  k.slab('seat', rush, roundRect(0.43, 0.43, 0.02), 0.025, sh - 0.025, { z: -0.01, bevel: 0.008, overrides: { color: '#b49a62' } });
  weave(k, 'seat', rush, 0.42, 0.42, 0.41, sh - 0.001, -0.01, { pitch: 0.02, r: 0.004 });
  for (const s of [-1, 1]) k.box('legs', w, 0.02, 0.025, 0.4, s * 0.2, 0.17, -0.01, { r: 0.003 });
  k.box('legs', w, 0.38, 0.025, 0.02, 0, 0.2, 0.21, { r: 0.003 });
}

function chairGhost(k, p) {
  const g = p.glass ?? 'glass-clear', sh = 0.465;
  k.slab('shell', g, roundRect(0.46, 0.44, 0.07), 0.035, sh - 0.035, { bevel: 0.01 });
  for (const s of [-1, 1]) {
    bar(k, 'shell', g, [s * 0.215, 0, 0.215], [s * 0.19, sh - 0.03, 0.17], 0.026, 0.038);
    bar(k, 'shell', g, [s * 0.205, 0, -0.27], [s * 0.19, sh - 0.03, -0.17], 0.026, 0.038);
  }
  const sh2 = new THREE.Shape();
  const cy = 0.26, R = 0.2;
  sh2.moveTo(-0.2, 0); sh2.lineTo(0.2, 0); sh2.lineTo(0.19, 0.12);
  sh2.absellipse(0, cy, R, R * 0.95, -0.6, Math.PI + 0.6, false, 0);
  sh2.lineTo(-0.2, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, cy, 0.145, 0.13, 0, Math.PI * 2, true, 0);
  sh2.holes.push(hole);
  k.panel('shell', g, sh2, 0.028, 0, sh - 0.012, -0.195, { rx: -0.13, bevel: 0.008, curveSegs: 32 });
}

function chairRattan(k, p) {
  const w = p.wood, sh = 0.46, cane = p.seat ?? 'rattan';
  for (const s of [-1, 1]) {
    k.rod('legs', w, [s * 0.215, 0, 0.215], [s * 0.205, sh - 0.06, 0.2], 0.014, { r2: 0.016 });
    k.tube('legs', w, [[s * 0.205, 0, -0.26], [s * 0.2, sh - 0.06, -0.205], [s * 0.205, 0.66, -0.225], [s * 0.2, 0.8, -0.255]], 0.016, { radial: k.seg(10, 5) });
  }
  // rounded bent back frame + cane panel with a woven grid
  const cy = 0.71, bz = -0.24;
  const arc = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; arc.push([Math.cos(a) * 0.2, 0.8 + Math.sin(a) * 0.07, -0.255 - Math.sin(a) * 0.005]); }
  k.tube('legs', w, arc, 0.016, { radial: k.seg(10, 5) });
  k.rod('legs', w, [-0.2, 0.6, -0.222], [0.2, 0.6, -0.222], 0.013);
  const panel = new THREE.Shape();
  panel.moveTo(-0.19, 0.6); panel.lineTo(0.19, 0.6); panel.lineTo(0.19, 0.8);
  panel.absellipse(0, 0.8, 0.19, 0.062, 0, Math.PI, false, 0); panel.lineTo(-0.19, 0.6);
  const pan = new THREE.ExtrudeGeometry(panel, { depth: 0.006, bevelEnabled: false, curveSegments: 12 });
  pan.translate(0, -cy, -0.003).rotateX(-0.16).translate(0, cy, bz);
  k.add('cane', cane, pan, { overrides: { color: '#d9bd86' } });
  for (let i = -4; i <= 4; i++) { const x = i * 0.04; const top = 0.8 + 0.062 * Math.sqrt(Math.max(0, 1 - (x / 0.19) ** 2)); k.rod('cane', cane, [x, 0.6, bz - (0.6 - cy) * 0.16 + 0.005], [x, top, bz - (top - cy) * 0.16 + 0.005], 0.0025, { segs: 4, overrides: { color: '#b88d55' } }); }
  for (let j = 1; j <= 5; j++) { const y = 0.6 + j * 0.04; k.rod('cane', cane, [-0.19, y, bz - (y - cy) * 0.16 + 0.005], [0.19, y, bz - (y - cy) * 0.16 + 0.005], 0.0025, { segs: 4, overrides: { color: '#b88d55' } }); }
  // seat frame + cushion
  k.box('legs', w, 0.43, 0.04, 0.43, 0, sh - 0.075, -0.005, { r: 0.012, segs: 2 });
  k.soft('upholstery', p.fabric, 0.44, 0.075, 0.43, 0.025, 0, sh - 0.02, 0.0, { puff: 0.012, sag: 0.004 });
  for (const s of [-1, 1]) k.rod('legs', w, [s * 0.21, 0.18, 0.21], [s * 0.203, 0.18, -0.24], 0.009);
  k.rod('legs', w, [-0.212, 0.2, 0.212], [0.212, 0.2, 0.212], 0.009);
}

function armchairTub(k, p) {
  const w = p.wood, f = p.fabric, sh = 0.46;
  splayLegs(k, 'legs', w, 0.48, 0.46, 0.36, { inset: 0.06, r: 0.019, rFoot: 0.012, splay: 0.03 });
  k.box('legs', w, 0.46, 0.04, 0.44, 0, 0.34, -0.01, { r: 0.006 });
  k.soft('upholstery', f, 0.5, 0.1, 0.48, 0.035, 0, sh - 0.045, 0.02, { puff: 0.014, sag: 0.004 });
  const g = bandGeo(k, { R: 0.26, cz: 0.02, span: 1.95, y0: 0.37, top: (t) => 0.8 - 0.15 * Math.abs(t) ** 1.6, thick: 0.075, n: 4 });
  k.add('upholstery', f, g);
}

function chairFolding(k, p) {
  const w = p.wood, sh = 0.45;
  for (const s of [-1, 1]) {
    bar(k, 'frame', w, [s * 0.215, 0, -0.27], [s * 0.215, 0.86, -0.2], 0.026, 0.026, { dA: 0.04, dB: 0.04 });
    bar(k, 'frame', w, [s * 0.18, 0, 0.23], [s * 0.18, sh - 0.012, 0.19], 0.024, 0.024, { dA: 0.036, dB: 0.036 });
    bar(k, 'frame', w, [s * 0.18, 0.13, 0.2], [s * 0.199, 0.32, -0.245], 0.016, 0.016, { dA: 0.032, dB: 0.032 });
    k.box('frame', w, 0.022, 0.035, 0.46, s * 0.18 + s * 0.0, sh - 0.025, -0.02, { r: 0.004 });
    k.cyl('hardware', 'metal-steel', 0.008, 0.008, 0.06, s * 0.17, sh - 0.025, -0.228, { rz: Math.PI / 2, segs: 8 });
  }
  for (let i = 0; i < 6; i++) k.box('seat', w, 0.37, 0.016, 0.06, 0, sh - 0.002, 0.19 - i * 0.074, { r: 0.004 });
  const slat = roundRect(0.44, 0.12, 0.02);
  const hole = new THREE.Path(); hole.absarc(-0.04, 0.025, 0.0125, Math.PI / 2, -Math.PI / 2, false); hole.absarc(0.04, 0.025, 0.0125, -Math.PI / 2, Math.PI / 2, false);
  slat.holes.push(hole);
  k.panel('seat', w, slat, 0.018, 0, 0.775, -0.215, { rx: -0.08, bevel: 0.003 });
  k.box('seat', w, 0.44, 0.06, 0.018, 0, 0.62, -0.225, { r: 0.004, rx: -0.08 });
}

/* ------------------------------------------------------------ chair entries */

const CHAIR_TAGS = ['dining chair', 'chair', '식탁 의자', '의자'];
/** A chair catalog entry built by fn(k, params); always recentred on the footprint. */
function chairItem(id, ko, en, fn, params, tags) {
  return sized({
    id, category: 'dining', ko, en, params, tags: [...tags, ...CHAIR_TAGS],
    build: (p, ctx) => { const k = new Kit(ctx); fn(k, p); return recentre(k.group()); },
  });
}

const windsorChair = chairItem('dining-chair-windsor', '윈저 체어', 'Windsor chair', chairWindsor, [WOOD('wood-oak')], ['windsor', '윈저', 'bow back', '원목 의자']);
const wishbone = chairItem('dining-chair-wishbone', '위시본 체어', 'Wishbone chair', chairWishbone, [WOOD('wood-oak'), P.mat('seat', '좌면 끈', 'Seat cord', 'rattan', 'wood')], ['wishbone', 'y chair', '위시본', 'Y 체어', '페이퍼 코드']);
const tulipChair = chairItem('dining-chair-tulip', '튤립 체어', 'Tulip chair', chairTulip, [P.mat('shell', '셸', 'Shell', 'paint-white-gloss', 'paint'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-terracotta', 'fabric')], ['tulip chair', 'pedestal chair', '튤립 체어', '받침 의자']);
const sChair = chairItem('dining-chair-s', 'S 캔틸레버 체어', 'S cantilever chair', chairS, [P.mat('shell', '소재', 'Material', 'plastic-white', 'plastic'), P.color('color', '색', 'Colour', '#f0efeb')], ['s chair', 'panton', 'plastic chair', '팬톤', 'S 체어', '플라스틱 의자']);
const ladderChair = chairItem('dining-chair-ladder', '래더백 체어', 'Ladder-back chair', chairLadder, [WOOD('wood-dark'), P.mat('seat', '골풀 좌면', 'Rush seat', 'rattan', 'wood')], ['ladder back', 'rush seat', 'country chair', '래더백', '시골풍 의자', '골풀 좌석']);
const bentwood = chairItem('dining-chair-bentwood', '벤트우드 카페 체어', 'Bentwood café chair', chairBentwood, [WOOD('wood-dark'), P.mat('seat', '등나무 좌면', 'Cane seat', 'rattan', 'wood')], ['bentwood', 'thonet', 'cafe chair', '벤트우드', '토넷', '카페 의자', '비스트로']);
const parsonsChair = chairItem('dining-chair-parsons', '파슨스 패브릭 체어', 'Upholstered Parsons chair', chairParsons, [P.mat('fabric', '천', 'Fabric', 'fabric-linen-beige', 'fabric'), WOOD('wood-dark')], ['parsons chair', 'upholstered', '패브릭 의자', '파슨스 체어', '천 의자']);
const medallion = chairItem('dining-chair-medallion', '메달리온 체어', 'Medallion-back chair', chairMedallion, [P.mat('fabric', '천', 'Fabric', 'fabric-velvet-blue', 'fabric'), WOOD('wood-white')], ['medallion', 'french chair', 'louis', 'button tufted', '프렌치 의자', '메달리온', '버튼 터프팅', '클래식']);
const cesca = chairItem('dining-chair-cesca', '캔틸레버 체어(케인)', 'Cantilever cane chair', chairCesca, [WOOD('wood-black'), P.mat('frame', '프레임', 'Frame', 'metal-chrome', 'metal'), P.mat('seat', '케인', 'Cane', 'rattan', 'wood')], ['cesca', 'cantilever', 'cane', '세스카', '캔틸레버', '라탄 의자', '크롬']);
const shellDowel = chairItem('dining-chair-shell', '셸 체어(원목 다리)', 'Shell chair, dowel legs', (k, p) => chairShell(k, p, 'dowel'), [P.mat('shell', '셸', 'Shell', 'plastic-white', 'plastic'), P.color('color', '셸 색', 'Shell colour', '#efeee9'), WOOD('wood-ash', 'wood', '다리', 'Legs')], ['shell chair', 'eames', 'dsw', '셸 체어', '임스', '플라스틱 의자']);
const shellEiffel = chairItem('dining-chair-shell-eiffel', '셸 체어(에펠 다리)', 'Shell chair, Eiffel base', (k, p) => chairShell(k, p, 'eiffel'), [P.mat('shell', '셸', 'Shell', 'plastic-white', 'plastic'), P.color('color', '셸 색', 'Shell colour', '#c9c6bf'), P.mat('frame', '다리', 'Base', 'metal-chrome', 'metal')], ['shell chair', 'eiffel', 'dsr', 'wire base', '셸 체어', '에펠', '와이어 다리']);
const shellArm = chairItem('dining-armchair-shell', '셸 암체어', 'Shell armchair', (k, p) => chairShell(k, p, 'dowel', true), [P.mat('shell', '셸', 'Shell', 'plastic-white', 'plastic'), P.color('color', '셸 색', 'Shell colour', '#d9cdb4'), WOOD('wood-oak', 'wood', '다리', 'Legs')], ['shell armchair', 'dar', 'arm chair', '셸 암체어', '팔걸이 의자', '임스']);
const crossback = chairItem('dining-chair-crossback', '크로스백 체어', 'Cross-back bistro chair', chairCrossback, [WOOD('wood-oak'), P.mat('seat', '골풀 좌면', 'Rush seat', 'rattan', 'wood')], ['cross back', 'x back', 'bistro chair', '크로스백', 'X백 의자', '비스트로 의자']);
const ghost = chairItem('dining-chair-ghost', '고스트 체어', 'Ghost chair', chairGhost, [P.mat('glass', '소재', 'Material', 'glass-tinted', 'glass')], ['ghost chair', 'clear chair', 'acrylic', '고스트 체어', '투명 의자', '아크릴']);
const rattanChair = chairItem('dining-chair-rattan', '라탄 식탁 의자', 'Rattan dining chair', chairRattan, [WOOD('wood-teak'), P.mat('seat', '라탄', 'Rattan', 'rattan', 'wood'), P.mat('fabric', '쿠션', 'Cushion', 'fabric-linen-white', 'fabric')], ['rattan chair', 'cane back', 'wicker', '라탄 의자', '등나무', '케인']);
const tubArm = chairItem('dining-armchair-tub', '패브릭 다이닝 암체어', 'Upholstered dining armchair', armchairTub, [P.mat('fabric', '천', 'Fabric', 'fabric-boucle', 'fabric'), WOOD('wood-walnut', 'wood', '다리', 'Legs')], ['dining armchair', 'tub chair', 'boucle', '다이닝 암체어', '팔걸이 의자', '부클레']);
const foldingChair = chairItem('dining-chair-folding', '접이식 원목 의자', 'Wooden folding chair', chairFolding, [WOOD('wood-ash')], ['folding chair', 'slatted', '접이식 의자', '원목 의자', '보조 의자']);

// @@CHAIRS@@

export const ITEMS = [
  extendable, tulip, dropLeaf, trestle, farmhouse, ovalPedestal, parsons, glassTable, liveEdgeTable, xBase, barTable, bistro, foldingTable, clothed, spider,
  windsorChair, wishbone, tulipChair, sChair, ladderChair, bentwood, parsonsChair, medallion, cesca, shellDowel, shellEiffel, shellArm, crossback, ghost, rattanChair, tubArm, foldingChair,
  // @@ITEMS@@
];
