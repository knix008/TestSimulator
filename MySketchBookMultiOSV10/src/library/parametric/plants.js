// Plants: procedural leaves (bent, folded surfaces merged per material) in ceramic pots with soil.
// Every plant is seeded, so it looks the same on every rebuild; `seed` varies it.
import { THREE, Kit, item, P, rng, clamp, gridGeo, leafGeo, placeLeaf, addPot } from './helpers.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { recentre } from './lighting.js';

const POT_STYLES = [['taper', '테이퍼', 'Tapered'], ['cylinder', '원통', 'Cylinder'], ['belly', '항아리', 'Belly'], ['bowl', '볼', 'Bowl']];
const STEM_GREEN = { overrides: { color: '#4e7436' } };

const toV = (a) => new THREE.Vector3(...a);
const curveOf = (pts) => new THREE.CatmullRomCurve3(pts.map(toV));

/* ------------------------------------------------------------- monstera */

/**
 * Monstera leaf: heart-shaped blade made of lobes that run from the midrib to the edge;
 * the lobes narrow towards the edge, so splits open there and close near the midrib.
 * Local frame as leafGeo: base at the origin, tip along +z, face normal ≈ +y.
 */
function monsteraLeaf(L, { lobes = 7, split = 0.4, droop = 0.18, fold = 0.18, na = 2, nb = 4 } = {}) {
  const A = 0.43 * L, B = 0.56 * L, C = 0.44 * L;
  const edge = (s) => [A * Math.sin(Math.PI * s), C - B * Math.cos(Math.PI * s)];
  const midZ = (s) => clamp((s - 0.12) / 0.88, 0, 1) * 0.94 * L;
  const geos = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < lobes; k++) {
      const s0 = k / lobes, s1 = (k + 1) / lobes;
      // no gap at the tip lobe or for whole (young) leaves
      const gap = k === lobes - 1 ? 0 : split;
      const g = gridGeo(na, nb, (a, b) => {
        const shrink = gap * Math.max(0, (b - 0.3) / 0.7) ** 1.2;
        const s = s0 + (s1 - s0) * (0.5 + (a - 0.5) * (1 - shrink));
        const [ex, ez] = edge(s);
        const x = side * b * ex;
        const z = midZ(s) + (ez - midZ(s)) * b;
        const zn = Math.max(0, z) / L;
        const y = -droop * L * zn * zn + fold * Math.abs(x) - 0.06 * L * b * b * b;
        return [x, y, z];
      });
      if (side < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
      geos.push(g);
    }
  }
  return mergeGeometries(geos, false);
}

const monstera = item({
  id: 'monstera', category: 'plants', ko: '몬스테라', en: 'Monstera', size: [1.15, 1.0, 1.25],
  // organic spread: leaves differ between seeds and quality levels
  bboxSlack: [0.15, 0.05, 0.15],
  params: [
    P.len('height', '높이', 'Height', 1.0, 0.5, 1.6),
    P.int('leaves', '잎 수', 'Leaves', 9, 4, 14),
    P.pick('pot', '화분', 'Pot', 'taper', POT_STYLES),
    P.mat('potMaterial', '화분 재질', 'Pot finish', 'ceramic-matte', 'ceramic'),
    P.int('seed', '모양', 'Variation', 1, 1, 30),
  ],
  tags: ['monstera', 'plant', 'houseplant', '몬스테라', '식물', '화분', '반려식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 1.0;
    const soil = addPot(k, { r: 0.19 * Math.sqrt(s), h: 0.32 * Math.sqrt(s), style: p.pot, mat: p.potMaterial });
    const rand = rng(p.seed * 17 + p.leaves);
    for (let i = 0; i < p.leaves; i++) {
      const a = i * 2.39996 + rand() * 0.6;
      const t = i / Math.max(1, p.leaves - 1); // later leaves: younger, more upright, inner
      const lean = 0.42 - 0.3 * t + rand() * 0.15;
      const stem = (0.5 + 0.22 * (1 - t) + rand() * 0.12) * s;
      const dir = [Math.sin(a), 0, Math.cos(a)];
      const tip = [dir[0] * Math.sin(lean) * stem, soil + Math.cos(lean) * stem * 0.92, dir[2] * Math.sin(lean) * stem];
      const base = [dir[0] * 0.025, soil - 0.01, dir[2] * 0.025];
      const mid = [tip[0] * 0.35, soil + (tip[1] - soil) * 0.62, tip[2] * 0.35];
      k.tube('stems', 'plant-leaf', [base, mid, tip], 0.0075, { segs: k.seg(14, 5), radial: k.seg(6, 4), ...STEM_GREEN });
      const L = (0.25 + 0.12 * (1 - t) + rand() * 0.05) * s;
      const young = rand() < 0.2;
      const leaf = monsteraLeaf(L, { lobes: k.hi ? 7 : 4, split: young ? 0 : 0.42, na: k.hi ? 2 : 1, nb: k.hi ? 4 : 2, droop: 0.15 + rand() * 0.1 });
      // the blade hangs from the petiole tip, facing up and out
      placeLeaf(leaf, tip, a + (rand() - 0.5) * 0.4, -0.15 + 0.5 * t - rand() * 0.2, (rand() - 0.5) * 0.4);
      k.add('leaves', 'plant-leaf', leaf);
    }
    recentre(k);
    return k.group();
  },
});

/* ------------------------------------------------------ fiddle leaf fig */

const fiddleOutline = (t) => Math.min(1, Math.sin(Math.PI * Math.min(1, t ** 0.62)) ** 0.5 * (0.55 + 0.5 * t));

const fiddleFig = item({
  id: 'fiddle-leaf-fig', category: 'plants', ko: '떡갈고무나무', en: 'Fiddle leaf fig', size: [0.7, 1.77, 0.85],
  bboxSlack: [0.12, 0.05, 0.15],
  params: [
    P.len('height', '높이', 'Height', 1.65, 0.8, 2.4),
    P.mat('potMaterial', '화분 재질', 'Pot finish', 'ceramic-white', 'ceramic'),
    P.int('seed', '모양', 'Variation', 1, 1, 30),
  ],
  tags: ['fiddle leaf fig', 'ficus', 'tree', '떡갈고무나무', '피카스', '나무', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.65;
    const soil = addPot(k, { r: 0.19, h: 0.36, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 29);
    // slightly S-curved trunk, thinner above
    const trunk = curveOf([[0, soil - 0.02, 0], [0.02, soil + 0.3 * s, 0.01], [-0.02, soil + 0.7 * s, -0.01], [0.015, H - 0.15 * s, 0.02], [0, H - 0.04, 0.01]]);
    k.tube('trunk', 'plant-stem', null, 0.016 * Math.sqrt(s), { curve: trunk, segs: k.seg(30, 8), radial: k.seg(8, 5) });
    const branches = [trunk];
    for (let b = 0; b < 2; b++) {
      const at = trunk.getPointAt(0.55 + b * 0.12);
      const a = b * 2.6 + rand();
      const end = at.clone().add(new THREE.Vector3(Math.sin(a) * 0.22 * s, 0.28 * s, Math.cos(a) * 0.22 * s));
      const c = new THREE.CatmullRomCurve3([at, at.clone().lerp(end, 0.5).add(new THREE.Vector3(0, -0.02, 0)), end]);
      k.tube('trunk', 'plant-stem', null, 0.009, { curve: c, segs: k.seg(12, 4), radial: k.seg(6, 4) });
      branches.push(c);
    }
    const count = k.hi ? 54 : 24;
    for (let i = 0; i < count; i++) {
      const onTrunk = i % 3 !== 2;
      const c = onTrunk ? trunk : branches[1 + (i % 2)];
      const t = onTrunk ? 0.42 + 0.58 * ((i * 0.618) % 1) : 0.25 + 0.75 * ((i * 0.38) % 1);
      const at = c.getPointAt(t);
      const yaw = i * 2.39996 + rand() * 0.5;
      const L = (0.24 + 0.12 * rand()) * Math.sqrt(s);
      const g = leafGeo(L, L * 0.8, { nu: k.hi ? 6 : 3, nv: k.hi ? 8 : 4, droop: 0.2 + rand() * 0.2, fold: 0.22, curl: 0.05, outline: fiddleOutline });
      // a short petiole pushes the blade off the stem
      const base = [at.x + Math.sin(yaw) * 0.025, at.y + 0.01, at.z + Math.cos(yaw) * 0.025];
      k.add('leaves', 'plant-leaf', placeLeaf(g, base, yaw, 0.25 + rand() * 0.55 * (t > 0.85 ? 1.4 : 1), (rand() - 0.5) * 0.5));
      k.rod('trunk', 'plant-stem', [at.x, at.y, at.z], base, 0.003, { segs: 4 });
    }
    recentre(k);
    return k.group();
  },
});

/* ---------------------------------------------------------- snake plant */

/** Part of a sword leaf: u ∈ [u0, u1] across (−1..1), t ∈ [t0, t1] along. Local frame as leafGeo. */
function swordPart(len, width, u0, u1, t0, t1, nu, nv, { bend = 0.1, twist = 0.4, channel = 0.35 } = {}) {
  return gridGeo(nu, nv, (a, b) => {
    const u = u0 + (u1 - u0) * a, t = t0 + (t1 - t0) * b;
    const hw = (width / 2) * Math.min(1, 0.55 + t * 6) * Math.max(0, 1 - Math.max(0, (t - 0.72) / 0.28) ** 1.6);
    let x = u * hw;
    let y = channel * Math.abs(x) - bend * len * t * t;
    const z = t * len;
    const ang = twist * t;
    const c = Math.cos(ang), sn = Math.sin(ang);
    [x, y] = [x * c - y * sn, x * sn + y * c];
    return [x, y, z];
  });
}

const snakePlant = item({
  id: 'snake-plant', category: 'plants', ko: '산세베리아', en: 'Snake plant', size: [0.4, 0.85, 0.4],
  params: [
    P.len('height', '높이', 'Height', 0.85, 0.4, 1.3),
    P.int('leaves', '잎 수', 'Leaves', 10, 4, 16),
    P.bool('edge', '노란 테두리', 'Yellow edge', true),
    P.mat('potMaterial', '화분 재질', 'Pot finish', 'ceramic-white', 'ceramic'),
    P.int('seed', '모양', 'Variation', 1, 1, 30),
  ],
  tags: ['snake plant', 'sansevieria', '산세베리아', '스투키', '식물', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.13, h: 0.26, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 11 + p.leaves);
    const dark = { overrides: { color: '#2b4a2c' } }, light = { overrides: { color: '#486a3c' } }, edgeC = { overrides: { color: '#c9bd55' } };
    const bandLen = 0.045;
    for (let i = 0; i < p.leaves; i++) {
      const a = i * 2.39996 + rand() * 0.5;
      const r0 = 0.02 + 0.07 * Math.sqrt((i + 0.5) / p.leaves);
      const len = (p.height - soil) * (0.6 + 0.4 * rand()) + (i < 3 ? 0.08 : 0);
      const width = 0.055 + 0.03 * rand();
      const pitch = Math.PI / 2 - (0.06 + 0.18 * (r0 / 0.09)) - rand() * 0.05;
      const opts = { bend: 0.05 + rand() * 0.08, twist: (rand() - 0.5) * 1.2, channel: 0.3 };
      const base = [Math.sin(a) * r0, soil - 0.02, Math.cos(a) * r0];
      const roll = rand() * Math.PI;
      const place = (g) => placeLeaf(g, base, a, pitch, roll);
      const uE = p.edge ? 0.82 : 1;
      if (p.edge) {
        k.add('leaf-edge', 'plant-leaf-light', place(swordPart(len, width, -1, -uE, 0, 1, 1, k.seg(14, 5), opts)), edgeC);
        k.add('leaf-edge', 'plant-leaf-light', place(swordPart(len, width, uE, 1, 0, 1, 1, k.seg(14, 5), opts)), edgeC);
      }
      // horizontal tiger bands: alternate dark and light chunks along the blade (high quality only)
      const bands = k.hi ? Math.max(3, Math.round(len / bandLen)) : 1;
      for (let j = 0; j < bands; j++) {
        const t0 = j / bands, t1 = (j + 1) / bands;
        const nv = k.hi ? 1 : 5;
        k.add('leaves', 'plant-leaf', place(swordPart(len, width, -uE, uE, t0, t1, k.hi ? 3 : 2, j === bands - 1 && k.hi ? 2 : nv, opts)), j % 2 && k.hi ? light : dark);
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ------------------------------------------------------------ succulent */

const succulent = item({
  id: 'succulent', category: 'plants', placement: 'surface', ko: '다육식물', en: 'Succulent', size: [0.14, 0.1, 0.14],
  params: [
    P.mat('potMaterial', '화분 재질', 'Pot finish', 'ceramic-terracotta', 'ceramic'),
    P.color('tint', '잎 색', 'Leaf colour', '#8fb0a0'),
    P.int('seed', '모양', 'Variation', 1, 1, 30),
  ],
  tags: ['succulent', 'echeveria', 'cactus', '다육이', '다육식물', '에케베리아', '미니 화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.06, h: 0.065, style: 'bowl', mat: p.potMaterial });
    const rand = rng(p.seed * 5);
    // gravel top dressing
    for (let i = 0; i < (k.hi ? 22 : 8); i++) {
      const a = rand() * Math.PI * 2, r = 0.02 + rand() * 0.035;
      k.sphere('gravel', 'concrete', 0.005 + rand() * 0.003, Math.cos(a) * r, soil + 0.001, Math.sin(a) * r, { segs: 6, rings: 4, scale: [1, 0.6, 1] });
    }
    // rosette: rings of fleshy pointed leaves, flatter outside, upright in the centre
    const rings = [[11, 0.066, 0.18], [10, 0.056, 0.42], [8, 0.044, 0.72], [7, 0.031, 1.0], [5, 0.019, 1.3]];
    const prof = [[0, 0], [0.006, 0.004], [0.011, 0.016], [0.0115, 0.03], [0.008, 0.042], [0.003, 0.049], [0, 0.052]].map(([r, y]) => new THREE.Vector2(r, y));
    let idx = 0;
    rings.forEach(([n, L, pitch], ri) => {
      for (let i = 0; i < n; i++, idx++) {
        const yaw = (i / n) * Math.PI * 2 + ri * 0.35;
        const g = new THREE.LatheGeometry(prof, k.seg(10, 5));
        g.scale(L / 0.052 * 1.1, L / 0.052, (L / 0.052) * 0.45);
        // tip curls up a little: bend along the length
        const pos = g.attributes.position;
        for (let v = 0; v < pos.count; v++) { const y = pos.getY(v); pos.setZ(v, pos.getZ(v) + 0.25 * (y * y) / Math.max(L, 0.01)); }
        g.rotateX(Math.PI / 2 - pitch);
        g.rotateY(yaw);
        g.translate(0, soil + 0.008 + ri * 0.004, 0);
        g.computeVertexNormals();
        k.add('leaves', 'plant-leaf-light', g, { overrides: { color: p.tint } });
      }
    });
    recentre(k);
    return k.group();
  },
});

/* --------------------------------------------------------- hanging plant */

const heartOutline = (t) => Math.sin(Math.PI * Math.min(1, t ** 0.75)) ** 0.7;

const hangingPlant = item({
  id: 'hanging-plant', category: 'plants', placement: 'ceiling', ko: '행잉 플랜트', en: 'Hanging plant', size: [0.39, 1.25, 0.39], elevation: 2.4 - 1.25,
  bboxSlack: [0.05, 0, 0.05],
  params: [
    P.len('hanger', '줄 길이', 'Hanger length', 0.55, 0.2, 1.2),
    P.len('trail', '늘어짐', 'Trailing length', 0.6, 0.2, 1.2),
    P.mat('potMaterial', '화분 재질', 'Pot finish', 'ceramic-matte', 'ceramic'),
    P.int('seed', '모양', 'Variation', 1, 1, 30),
  ],
  tags: ['hanging plant', 'pothos', 'macrame', '행잉 플랜트', '스킨답서스', '아이비', '걸이 화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 13);
    const potR = 0.1, potH = 0.13;
    const potY = p.trail + 0.02; // pot bottom: vines hang below it
    const soil = addPot(k, { r: potR, h: potH, style: 'bowl', mat: p.potMaterial, y0: potY });
    const top = potY + potH + p.hanger;
    // ceiling hook and three jute cords meeting at a ring
    k.cyl('hook', 'metal-black', 0.025, 0.025, 0.008, 0, top - 0.008, 0, { segs: k.seg(16, 6) });
    k.add('hook', 'metal-black', new THREE.TorusGeometry(0.018, 0.0035, 6, k.seg(16, 8)).translate(0, top - 0.03, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const rim = [Math.cos(a) * (potR + 0.006), potY + potH * 0.55, Math.sin(a) * (potR + 0.006)];
      const under = [Math.cos(a) * potR * 0.55, potY - 0.004, Math.sin(a) * potR * 0.55];
      k.tube('cords', 'fabric-linen-beige', [[0, top - 0.045, 0], [Math.cos(a) * 0.04, top - p.hanger * 0.45, Math.sin(a) * 0.04], rim], 0.003, { segs: k.seg(16, 6), radial: 4 });
      k.tube('cords', 'fabric-linen-beige', [rim, [Math.cos(a) * (potR * 0.95), potY + 0.01, Math.sin(a) * (potR * 0.95)], under, [0, potY - 0.01, 0]], 0.003, { segs: k.seg(12, 5), radial: 4 });
    }
    k.sphere('cords', 'fabric-linen-beige', 0.012, 0, potY - 0.012, 0, { segs: 8, rings: 6 });
    // vines: from the soil over the rim, then hanging down with a slight sway
    const vines = k.hi ? 9 : 6;
    for (let i = 0; i < vines; i++) {
      const a = (i / vines) * Math.PI * 2 + rand() * 0.4;
      const c = Math.cos(a), sn = Math.sin(a);
      const len = p.trail * (0.45 + 0.55 * rand());
      const pts = [[c * 0.04, soil + 0.01, sn * 0.04], [c * (potR + 0.01), soil + 0.03, sn * (potR + 0.01)], [c * (potR + 0.035), potY + potH * 0.6, sn * (potR + 0.035)]];
      const steps = 4;
      for (let j = 1; j <= steps; j++) {
        const f = j / steps;
        pts.push([c * (potR + 0.04 + 0.03 * f) + 0.02 * Math.sin(f * 5 + i), potY + potH * 0.6 - (len + potH * 0.6 - 0.02) * f, sn * (potR + 0.04 + 0.03 * f) + 0.02 * Math.cos(f * 4 + i)]);
      }
      const curve = curveOf(pts);
      k.tube('vines', 'plant-leaf', null, 0.002, { curve, segs: k.seg(28, 8), radial: 4, ...STEM_GREEN });
      const nLeaves = Math.round((k.hi ? 14 : 6) * (0.5 + len / p.trail * 0.5));
      for (let j = 0; j < nLeaves; j++) {
        const t = 0.06 + 0.94 * (j / nLeaves);
        const at = curve.getPointAt(t);
        const side = j % 2 ? 1 : -1;
        const L = 0.055 * (1.1 - 0.4 * t) + rand() * 0.01;
        const g = leafGeo(L, L * 0.8, { nu: k.hi ? 3 : 2, nv: k.hi ? 4 : 2, droop: 0.35, fold: 0.15, outline: heartOutline });
        // leaves face outwards and hang down along the vine
        k.add('leaves', 'plant-leaf', placeLeaf(g, [at.x, at.y, at.z], a + side * 0.9 + (rand() - 0.5) * 0.4, -0.5 - rand() * 0.5 + (t < 0.15 ? 0.9 : 0), side * 0.4));
      }
    }
    // a mound of leaves on top of the pot
    for (let i = 0; i < (k.hi ? 14 : 6); i++) {
      const a = i * 2.39996, r = 0.02 + 0.06 * rand();
      const g = leafGeo(0.06, 0.05, { nu: k.hi ? 3 : 2, nv: k.hi ? 4 : 2, droop: 0.3, fold: 0.15, outline: heartOutline });
      k.add('leaves', 'plant-leaf', placeLeaf(g, [Math.cos(a) * r, soil + 0.02 + rand() * 0.04, Math.sin(a) * r], Math.atan2(Math.cos(a), Math.sin(a)), 0.3 + rand() * 0.4, 0));
    }
    recentre(k);
    return k.group();
  },
});

/* ------------------------------------------------------------ olive tree */

const oliveTree = item({
  id: 'olive-tree', category: 'plants', ko: '올리브 나무', en: 'Olive tree', size: [0.82, 1.65, 0.82],
  bboxSlack: [0.12, 0.05, 0.15],
  params: [
    P.len('height', '높이', 'Height', 1.75, 1.0, 2.6),
    P.mat('planter', '화분 재질', 'Planter', 'concrete', null),
    P.int('seed', '모양', 'Variation', 1, 1, 30),
  ],
  tags: ['olive tree', 'tree', 'olive', '올리브 나무', '올리브', '나무', '실내 나무'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.75;
    const soil = addPot(k, { r: 0.2, h: 0.42, style: 'cylinder', mat: p.planter });
    const rand = rng(p.seed * 23);
    // two intertwined trunks rising to the crown
    const crownY = soil + (H - soil) * 0.42;
    const trunks = [];
    for (let i = 0; i < 2; i++) {
      const ph = i * Math.PI;
      const pts = [];
      for (let j = 0; j <= 5; j++) {
        const f = j / 5;
        pts.push([Math.cos(ph + f * 3.2) * 0.025 * (1 - f * 0.3), soil - 0.02 + (crownY - soil + 0.05) * f, Math.sin(ph + f * 3.2) * 0.025 * (1 - f * 0.3)]);
      }
      const c = curveOf(pts);
      trunks.push(c);
      k.tube('trunk', 'plant-stem', null, 0.02 * Math.sqrt(s), { curve: c, segs: k.seg(24, 8), radial: k.seg(8, 5) });
    }
    // branches fan out from the crown, each with leafy twigs
    const nB = 6;
    const leafCount = k.hi ? 620 : 150;
    const perBranch = Math.ceil(leafCount / nB);
    const leafMat = { overrides: { color: '#66784f' } };
    for (let b = 0; b < nB; b++) {
      const a = (b / nB) * Math.PI * 2 + rand() * 0.5;
      const lean = 0.45 + rand() * 0.5;
      const len = (0.45 + rand() * 0.25) * s;
      const start = trunks[b % 2].getPointAt(0.8 + rand() * 0.2);
      const end = start.clone().add(new THREE.Vector3(Math.sin(a) * Math.sin(lean) * len, Math.cos(lean) * len, Math.cos(a) * Math.sin(lean) * len));
      const midP = start.clone().lerp(end, 0.5).add(new THREE.Vector3((rand() - 0.5) * 0.06, 0.03, (rand() - 0.5) * 0.06));
      const c = new THREE.CatmullRomCurve3([start, midP, end]);
      k.tube('trunk', 'plant-stem', null, 0.008, { curve: c, segs: k.seg(12, 4), radial: k.seg(6, 4) });
      // leaf clusters around twigs along the outer part of the branch
      const clusters = k.hi ? 7 : 4;
      for (let cI = 0; cI < clusters; cI++) {
        const t = 0.35 + 0.65 * (cI / (clusters - 1));
        const at = c.getPointAt(t);
        const twigDir = new THREE.Vector3(rand() - 0.5, 0.3 + rand() * 0.5, rand() - 0.5).normalize();
        const twigEnd = at.clone().addScaledVector(twigDir, 0.07 + rand() * 0.06);
        if (k.hi) k.rod('trunk', 'plant-stem', at.toArray(), twigEnd.toArray(), 0.0025, { segs: 4 });
        const n = Math.round(perBranch / clusters);
        for (let i = 0; i < n; i++) {
          const f = rand();
          const pt = at.clone().lerp(twigEnd, f).add(new THREE.Vector3((rand() - 0.5) * 0.05, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.05));
          const L = 0.05 + rand() * 0.025;
          const g = leafGeo(L, L * 0.2, { nu: k.hi ? 2 : 1, nv: k.hi ? 3 : 2, droop: 0.2, fold: 0.3, outline: (u) => Math.sin(Math.PI * Math.min(1, u * 1.02)) ** 0.7 });
          k.add('leaves', 'plant-leaf', placeLeaf(g, pt.toArray(), rand() * Math.PI * 2, (rand() - 0.3) * 1.2, rand() * Math.PI), leafMat);
        }
      }
    }
    recentre(k);
    return k.group();
  },
});

export const ITEMS = [monstera, fiddleFig, snakePlant, succulent, hangingPlant, oliveTree];
