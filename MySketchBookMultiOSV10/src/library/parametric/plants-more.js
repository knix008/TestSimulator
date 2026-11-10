// More plants: palms, ficus, aroids, cacti and succulents, flowering plants, hanging and wall
// pieces, arrangements (trays, terrarium, ladder shelf) and preset variants of plants.js.
// Leaves are procedural surfaces merged per material (see plants.js); every plant is seeded.
// See ARCHITECTURE.md §12 → Library objects.
import { THREE, Kit, item, P, rng, clamp, lerp, gridGeo, placeLeaf, addPot, variant, frameShape } from './helpers.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { recentre } from './lighting.js';
import { ITEMS as BASE } from './plants.js';

/* ------------------------------------------------------------ helpers */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const toV = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const curveOf = (pts) => new THREE.CatmullRomCurve3(pts.map(toV));
const UP = new THREE.Vector3(0, 1, 0);
const C = (color) => ({ overrides: { color } });
const TAU = Math.PI * 2, GOLD = 2.39996;
const dirOf = (yaw, pitch) => V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
const seedP = () => P.int('seed', '모양', 'Variation', 1, 1, 30);
const potMat = (def = 'ceramic-matte') => P.mat('potMaterial', '화분 재질', 'Pot finish', def, 'ceramic');
const POT_STYLES = [['taper', '테이퍼', 'Tapered'], ['cylinder', '원통', 'Cylinder'], ['belly', '항아리', 'Belly'], ['bowl', '볼', 'Bowl']];
const STEM = C('#4e7436');

// leaf outlines: half width factor (0..1) along t (base → tip)
const OVAL = (t) => Math.sin(Math.PI * Math.min(1, t)) ** 0.6;
const OVAL_TIP = (t) => Math.sin(Math.PI * Math.min(1, t ** 0.85)) ** 0.75;
const LANCE = (t) => Math.sin(Math.PI * Math.min(1, t ** 0.7)) ** 0.9;
const STRAP = (t) => Math.min(1, 6 * t) * Math.min(1, (1 - t) * 2.5) ** 0.8;
const PADDLE = (t) => Math.sin(Math.PI * Math.min(1, t ** 0.8)) ** 0.3;
const ARROW = (t) => Math.min(1, 0.55 + 3 * t) * Math.max(0, 1 - t) ** 0.8;
const HEART = (t) => Math.sin(Math.PI * (0.2 + 0.8 * Math.min(1, t))) ** 0.65 * (1 - 0.1 * t);
const ROUND = (t) => Math.sin(Math.PI * Math.min(1, t)) ** 0.5;

/** Leaf surface fn(u ∈ −1..1 across, t ∈ 0..1 along) in the leafGeo frame (base at origin, tip +z, face +y). */
function leafSurf(len, width, { droop = 0.25, fold = 0.2, curl = 0, wave = 0, waves = 6, twist = 0, outline = OVAL } = {}) {
  return (u, t) => {
    const hw = (width / 2) * outline(t);
    let x = u * hw;
    const z = t * len;
    let y = -droop * len * t * t + fold * Math.abs(x) + curl * len * t * t * t + wave * width * u * u * Math.sin(t * waves * Math.PI);
    if (twist) { const a = twist * t, c = Math.cos(a), s = Math.sin(a); [x, y] = [x * c - y * s, x * s + y * c]; }
    return [x, y, z];
  };
}

/** A (part of a) leaf: u ∈ [u0, u1], t ∈ [t0, t1]; `lift` raises it off the blade (veins, stripes). */
function leafPart(len, width, o = {}) {
  const f = leafSurf(len, width, o);
  const { t0 = 0, t1 = 1, u0 = -1, u1 = 1, nu = 4, nv = 6, lift = 0 } = o;
  return gridGeo(nu, nv, (a, b) => { const p = f(u0 + (u1 - u0) * a, t0 + (t1 - t0) * b); p[1] += lift; return p; });
}

/** A thin vein strip on a leaf surface from (u0, t0) to (u1, t1). */
function veinGeo(len, width, o, u0, t0, u1, t1, w = 0.012, nv = 4) {
  const f = leafSurf(len, width, o);
  return gridGeo(1, nv, (a, b) => { const p = f(lerp(u0, u1, b), lerp(t0, t1, b) + (a - 0.5) * w); p[1] += 0.0015; return p; });
}

/** Leaf torn / lobed from the edge towards the midrib (banana, bird of paradise, split philodendron). */
function splitLeaf(len, width, { segs = 6, gap = 0.4, gaps = null, outline = PADDLE, droop = 0.2, fold = 0.2, edgeDrop = 0.05, na = 1, nb = 3 } = {}) {
  const geos = [];
  for (const side of [-1, 1]) {
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const g0 = s === segs - 1 ? 0 : gaps ? gaps[(side > 0 ? segs : 0) + s] : gap;
      geos.push(gridGeo(na, nb, (a, b) => {
        const shrink = g0 * Math.max(0, (b - 0.2) / 0.8) ** 1.3;
        const t = t0 + (t1 - t0) * (0.5 + (a - 0.5) * (1 - shrink));
        const x = side * b * (width / 2) * outline(t);
        return [x, -droop * len * t * t + fold * Math.abs(x) - edgeDrop * len * b * b * b, t * len];
      }));
    }
  }
  return mergeGeometries(geos, false);
}

/** Thick, fleshy leaf (aloe, agave): elliptic section w × th, tapering to a point along +z, top flatter. */
function fleshGeo(len, w, th, { nu = 8, nv = 8, bend = 0.15, taper = (t) => Math.max(0, 1 - t) ** 0.85, concave = 0.6 } = {}) {
  return gridGeo(nu, nv, (a, b) => {
    const an = a * TAU, f = taper(b);
    const x = Math.cos(an) * (w / 2) * f;
    let y = Math.sin(an) * (th / 2) * f;
    if (y > 0) y *= 1 - concave;
    return [x, y - bend * len * b * b, b * len];
  });
}

/** Surface around a curve: radius(b, angle) with b ∈ 0..1 along. `cap` closes the end with a dome (fraction of the length). */
function alongGeo(curve, radius, nu, nv, { cap = 0 } = {}) {
  const fr = curve.computeFrenetFrames(nv, false);
  const at = (b, an, r) => {
    const j = clamp(Math.round(b * nv), 0, nv);
    const p = curve.getPointAt(clamp(b, 0, 1));
    const N = fr.normals[j], B = fr.binormals[j];
    const dx = N.x * Math.cos(an) + B.x * Math.sin(an), dy = N.y * Math.cos(an) + B.y * Math.sin(an), dz = N.z * Math.cos(an) + B.z * Math.sin(an);
    return { p: [p.x + dx * r, p.y + dy * r, p.z + dz * r], d: V3(dx, dy, dz) };
  };
  const rad = (b, an) => {
    let r = radius(b, an);
    if (cap > 0 && b > 1 - cap) r *= Math.sqrt(Math.max(0, 1 - ((b - (1 - cap)) / cap) ** 2));
    return r;
  };
  const geo = gridGeo(nu, nv, (a, b) => at(b, a * TAU, rad(b, a * TAU)).p);
  return { geo, at, rad };
}

/** Tapered tube along a curve (trunks, branches, driftwood). */
function taper(k, role, mat, curve, r0, r1, { nu = 8, nv = 12, ov, cap = false } = {}) {
  const { geo } = alongGeo(curve, (b) => lerp(r0, r1, b), k.seg(nu, 4), k.seg(nv, 3), { cap: cap ? Math.min(0.3, r1 * 2 / Math.max(0.01, curve.getLength())) : 0 });
  return k.add(role, mat, geo, ov);
}

/** Noisy sphere (moss, foliage pads, flower heads); noise is a function of position so seams stay closed. */
function blobGeo(r, { segs = 12, rings = 8, amp = 0.15, freq = 18, scale = [1, 1, 1], seed = 1 } = {}) {
  const g = new THREE.SphereGeometry(r, segs, rings);
  const ph = [seed * 1.7, seed * 2.3, seed * 3.1];
  const pos = g.attributes.position;
  const f = freq / Math.max(r, 0.01) * 0.05;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * f + ph[0]) * Math.sin(y * f * 1.3 + ph[1]) * Math.sin(z * f * 0.9 + ph[2]) + 0.5 * Math.sin((x + z) * f * 2.1 + ph[1]) * Math.cos(y * f * 1.7 + ph[0]);
    const m = 1 + amp * n;
    pos.setXYZ(i, x * m * scale[0], y * m * scale[1], z * m * scale[2]);
  }
  g.computeVertexNormals();
  return g;
}

const _m4 = new THREE.Matrix4();
/** Places a leaf-frame geometry (grows +z, face +y) at pos, growing along `along` with its face towards `normal`. */
function frameOrient(geo, pos, along, normal = UP) {
  const z = toV(along).normalize();
  const x = toV(normal).cross(z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).cross(z).lengthSq() < 1e-8 ? x.set(0, 0, 1).cross(z) : x.set(1, 0, 0).cross(z);
  x.normalize();
  const y = z.clone().cross(x);
  _m4.makeBasis(x, y, z).setPosition(toV(pos));
  return geo.applyMatrix4(_m4);
}

/**
 * Pinnate frond (palms, ferns): a rachis that rises at `pitch` and sags by `arch`, with leaflets on
 * both sides. Returns the rachis curve.
 */
function frond(k, start, yaw, o) {
  const { len, pitch = 0.6, arch = 0.4, n = 20, leafLen = 0.2, leafW = 0.12, ang = 0.8, droop = 0.2, rachis = 0.003, role = 'fronds', mat = 'plant-leaf', ov, stemRole = 'stems', stemOv = ov, nu = 2, nv = 3, fold = 0.3, leafDroop = 0.25, outline = LANCE, from = 0.06 } = o;
  const S = toV(start), d = V3(Math.sin(yaw), 0, Math.cos(yaw));
  const pts = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(S.clone().addScaledVector(d, len * t * Math.cos(pitch)).add(V3(0, len * t * Math.sin(pitch) - arch * len * t * t, 0))); }
  const c = new THREE.CatmullRomCurve3(pts);
  if (rachis > 0) k.tube(stemRole, mat, null, rachis, { curve: c, segs: k.seg(12, 4), radial: k.seg(5, 3), ...stemOv });
  const side = V3();
  for (let i = 0; i < n; i++) {
    const t = from + (0.98 - from) * (i + 0.5) / n;
    const at = c.getPointAt(t), tan = c.getTangentAt(t);
    side.crossVectors(tan, UP);
    if (side.lengthSq() < 1e-6) side.set(Math.cos(yaw), 0, -Math.sin(yaw));
    side.normalize();
    const nrm = side.clone().cross(tan);
    const Ll = leafLen * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, (t - from) / (1 - from) * 0.95 + 0.05)) ** 0.7);
    for (const s of [-1, 1]) {
      const dir = tan.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, s * Math.sin(ang));
      dir.y -= droop;
      k.add(role, mat, frameOrient(leafPart(Ll, Ll * leafW, { nu, nv, droop: leafDroop, fold, outline }), at, dir, nrm), ov);
    }
  }
  return c;
}

/** Ceiling hook + rods from a ring down to the anchor points (hanging pots). */
function hanger(k, top, ringY, anchors, { mat = 'metal-black', r = 0.0016 } = {}) {
  k.cyl('hanger', mat, 0.028, 0.028, 0.008, 0, top - 0.008, 0, { segs: k.seg(16, 6) });
  k.rod('hanger', mat, [0, top - 0.008, 0], [0, ringY + 0.012, 0], r * 1.4, { segs: 5 });
  k.add('hanger', mat, new THREE.TorusGeometry(0.012, 0.0022, 4, k.seg(14, 6)).translate(0, ringY, 0));
  for (const a of anchors) k.rod('hanger', mat, [0, ringY - 0.01, 0], a, r, { segs: 4 });
}

/** Petiole curve from a base point rising at `pitch` (radians above horizontal) towards yaw, sagging a little. */
function petiole(base, yaw, pitch, len, sag = 0.1) {
  const d = dirOf(yaw, pitch), B = toV(base);
  const mid = B.clone().addScaledVector(d, len * 0.5).add(V3(0, len * sag * 0.3, 0));
  const tip = B.clone().addScaledVector(d, len).add(V3(0, -len * sag, 0));
  return new THREE.CatmullRomCurve3([B, mid, tip]);
}

/** Leaf direction at a curve end (yaw / pitch for placeLeaf). */
function endAngles(c) {
  const t = c.getTangentAt(1);
  return [Math.atan2(t.x, t.z), Math.asin(clamp(t.y, -1, 1))];
}

/** Echeveria-like rosette of fleshy pointed leaves (lathe leaves), centre at (x, y, z). */
function rosette(k, role, mat, ov, x, y, z, R, { rings = 4, perRing = 9, upright = 0, seedTurn = 0 } = {}) {
  const prof = [[0, 0], [0.006, 0.004], [0.011, 0.016], [0.0115, 0.03], [0.008, 0.042], [0.003, 0.049], [0, 0.052]].map(([r, py]) => new THREE.Vector2(r, py));
  for (let ri = 0; ri < rings; ri++) {
    const f = ri / Math.max(1, rings - 1);
    const n = Math.max(4, Math.round(perRing * (1 - 0.4 * f)));
    const L = R * (1 - 0.65 * f);
    const pitch = 0.18 + upright + f * 1.15;
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * TAU + ri * 0.35 + seedTurn;
      const g = new THREE.LatheGeometry(prof, k.seg(8, 4));
      g.scale((L / 0.052) * 1.1, L / 0.052, (L / 0.052) * 0.45);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) { const py = pos.getY(v); pos.setZ(v, pos.getZ(v) + 0.25 * (py * py) / Math.max(L, 0.01)); }
      g.rotateX(Math.PI / 2 - pitch);
      g.rotateY(yaw);
      g.translate(x, y + ri * R * 0.06, z);
      g.computeVertexNormals();
      k.add(role, mat, g, ov);
    }
  }
}

/* ======================================================== ficus & trees */

const rubberPlant = item({
  id: 'rubber-plant', category: 'plants', ko: '고무나무', en: 'Rubber plant', size: [0.6, 1.3, 0.6],
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('height', '높이', 'Height', 1.3, 0.6, 2.0),
    P.color('leafColor', '잎 색', 'Leaf colour', '#2c4b2c'),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['rubber plant', 'ficus elastica', 'ficus', '고무나무', '인도고무나무', '식물', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.3;
    const soil = addPot(k, { r: 0.16 * Math.sqrt(s), h: 0.3 * Math.sqrt(s), style: 'taper', mat: p.potMaterial });
    const rand = rng(p.seed * 31);
    const trunkC = C('#6b6a3e');
    [[0, H, 0.04], [2.2, soil + (H - soil) * 0.7, 0.16]].forEach(([a0, top, lean], si) => {
      const a = a0 + rand() * 0.6;
      const h = top - soil;
      const curve = curveOf([[Math.sin(a) * 0.015 * si, soil - 0.02, Math.cos(a) * 0.015 * si], [Math.sin(a) * lean * h * 0.3, soil + h * 0.4, Math.cos(a) * lean * h * 0.3], [Math.sin(a) * lean * h, top - 0.03, Math.cos(a) * lean * h]]);
      k.tube('trunk', 'plant-stem', null, si ? 0.009 : 0.012, { curve, segs: k.seg(18, 6), radial: k.seg(7, 4), ...trunkC });
      const tip = curve.getPointAt(1);
      // rolled red sheath protecting the new leaf at the tip
      k.cyl('sheath', 'plant-leaf', 0.0005, 0.006, 0.07, tip.x, tip.y - 0.005, tip.z, { segs: k.seg(8, 4), ...C('#93392f') });
      const nL = Math.round((k.hi ? 15 : 9) * (si ? 0.65 : 1));
      for (let i = 0; i < nL; i++) {
        const t = 0.32 + 0.66 * (i / Math.max(1, nL - 1)) ** 0.85;
        const at = curve.getPointAt(t);
        const yaw = i * GOLD + rand() * 0.5 + si;
        const end = at.clone().addScaledVector(dirOf(yaw, 0.6), 0.035);
        k.rod('trunk', 'plant-stem', at.toArray(), end.toArray(), 0.0028, { segs: 4, ...trunkC });
        const L = (0.17 + 0.08 * rand()) * Math.sqrt(s) * (t > 0.9 ? 0.75 : 1);
        const leaf = leafPart(L, L * 0.5, { nu: k.hi ? 4 : 2, nv: k.hi ? 6 : 3, droop: 0.12 + rand() * 0.1, fold: 0.1, outline: OVAL_TIP });
        k.add('leaves', 'plant-leaf', placeLeaf(leaf, end.toArray(), yaw, lerp(-0.1, 0.85, t) + (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3), C(p.leafColor));
      }
    });
    recentre(k);
    return k.group();
  },
});

const moneyTree = item({
  id: 'money-tree', category: 'plants', ko: '파키라(머니트리)', en: 'Money tree', size: [0.7, 1.2, 0.7],
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('height', '높이', 'Height', 1.2, 0.6, 1.9),
    P.int('trunks', '줄기 수', 'Trunks', 5, 3, 5),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['money tree', 'pachira', 'braided', '파키라', '머니트리', '식물', '나무'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.2;
    const soil = addPot(k, { r: 0.17, h: 0.3, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 41);
    const bark = C('#7c7650');
    const braidTop = soil + (H - soil) * 0.55;
    for (let i = 0; i < p.trunks; i++) {
      const ph = (i / p.trunks) * TAU;
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const f = j / 8, an = ph + f * TAU * 1.3, rr = 0.02 * (1 - 0.3 * f);
        pts.push([Math.cos(an) * rr, soil - 0.03 + (braidTop - soil + 0.03) * f, Math.sin(an) * rr]);
      }
      // above the braid each trunk leans out to its own crown
      const out = ph + 0.4;
      const end = [Math.cos(out) * 0.12 * s, braidTop + (H - braidTop) * (0.45 + 0.2 * rand()), Math.sin(out) * 0.12 * s];
      pts.push([Math.cos(out) * 0.05, braidTop + (end[1] - braidTop) * 0.5, Math.sin(out) * 0.05], end);
      const c = curveOf(pts);
      taper(k, 'trunk', 'plant-stem', c, 0.014, 0.007, { nu: 7, nv: 26, ov: bark });
      // palmate leaves: petioles fan out from the trunk tip, each with 5–7 leaflets like a hand
      const nP = k.hi ? 4 : 3;
      for (let q = 0; q < nP; q++) {
        const yaw = Math.atan2(end[0], end[2]) + (q - (nP - 1) / 2) * 1.1 + (rand() - 0.5) * 0.4;
        const pc = petiole(end, yaw, 0.5 + rand() * 0.5, (0.14 + rand() * 0.06) * s, 0.25);
        k.tube('petioles', 'plant-leaf', null, 0.0025, { curve: pc, segs: k.seg(8, 3), radial: 4, ...STEM });
        const tip = pc.getPointAt(1);
        const [py] = endAngles(pc);
        const nl = 5 + Math.floor(rand() * 3);
        for (let l = 0; l < nl; l++) {
          const L = (0.1 + 0.05 * Math.sin(Math.PI * (l + 0.5) / nl)) * Math.sqrt(s);
          const g = leafPart(L, L * 0.38, { nu: k.hi ? 3 : 2, nv: k.hi ? 4 : 2, droop: 0.25, fold: 0.15, outline: OVAL_TIP });
          k.add('leaves', 'plant-leaf', placeLeaf(g, tip.toArray(), py + (l - (nl - 1) / 2) * 0.5, -0.05 + rand() * 0.25, 0), C('#3f6e2f'));
        }
      }
    }
    recentre(k);
    return k.group();
  },
});

const dracaena = item({
  id: 'dracaena-marginata', category: 'plants', ko: '드라세나 마지나타', en: 'Dracaena marginata', size: [0.7, 1.35, 0.7],
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('height', '높이', 'Height', 1.35, 0.7, 2.1),
    P.bool('redEdge', '붉은 테두리', 'Red edge', true),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['dracaena', 'dragon tree', 'marginata', '드라세나', '드라코', '식물', '나무'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.35;
    const soil = addPot(k, { r: 0.15, h: 0.3, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 53);
    const canes = [[0.3, H - 0.25 * s, 0.1], [2.4, H - 0.45 * s, 0.22], [4.4, H - 0.6 * s, 0.3]];
    const bark = C('#857257');
    for (const [a, top, lean] of canes) {
      const h = top - soil;
      const end = [Math.sin(a) * lean * h, top, Math.cos(a) * lean * h];
      const c = curveOf([[Math.sin(a) * 0.02, soil - 0.02, Math.cos(a) * 0.02], [end[0] * 0.2 + (rand() - 0.5) * 0.05, soil + h * 0.35, end[2] * 0.2 + (rand() - 0.5) * 0.05], [end[0] * 0.7, soil + h * 0.72, end[2] * 0.7 + (rand() - 0.5) * 0.04], end]);
      taper(k, 'canes', 'plant-stem', c, 0.012, 0.008, { nu: 7, nv: 18, ov: bark });
      const n = k.hi ? 34 : 16;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const yaw = i * GOLD + rand() * 0.4;
        const pitch = lerp(1.35, -0.55, f ** 0.75) + (rand() - 0.5) * 0.2;
        const at = [end[0], top - 0.07 * f, end[2]];
        const L = (0.26 + 0.1 * rand()) * Math.sqrt(s) * (f < 0.12 ? 0.6 : 1);
        const o = { nv: k.hi ? 6 : 3, droop: 0.15 + 0.35 * f, fold: 0.4, outline: STRAP };
        const roll = (rand() - 0.5) * 0.4;
        const place = (g) => placeLeaf(g, at, yaw, pitch, roll);
        if (p.redEdge && k.hi) {
          k.add('leaves', 'plant-leaf', place(leafPart(L, 0.014, { ...o, nu: 2, u0: -0.6, u1: 0.6 })), C('#3d6a34'));
          k.add('leaf-edge', 'plant-leaf', place(leafPart(L, 0.014, { ...o, nu: 1, u0: -1, u1: -0.6 })), C('#7e2a35'));
          k.add('leaf-edge', 'plant-leaf', place(leafPart(L, 0.014, { ...o, nu: 1, u0: 0.6, u1: 1 })), C('#7e2a35'));
        } else {
          k.add('leaves', 'plant-leaf', place(leafPart(L, 0.014, { ...o, nu: 1 })), C('#3d6a34'));
        }
      }
    }
    recentre(k);
    return k.group();
  },
});

const yucca = item({
  id: 'yucca', category: 'plants', ko: '유카', en: 'Yucca cane', size: [0.8, 1.45, 0.8],
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('height', '높이', 'Height', 1.45, 0.8, 2.2),
    P.int('canes', '줄기 수', 'Canes', 3, 1, 3),
    P.mat('potMaterial', '화분 재질', 'Pot finish', 'concrete', null),
    seedP(),
  ],
  tags: ['yucca', 'spineless yucca', 'cane', '유카', '유카나무', '식물', '나무'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.45;
    const soil = addPot(k, { r: 0.2, h: 0.36, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 59);
    const all = [[0.5, H - 0.32 * s, 0.05], [2.6, H - 0.62 * s, 0.14], [4.6, H - 0.82 * s, 0.2]].slice(0, p.canes);
    for (const [a, top, lean] of all) {
      const h = top - soil;
      const end = [Math.sin(a) * lean * h, top, Math.cos(a) * lean * h];
      const c = curveOf([[Math.sin(a) * 0.03, soil - 0.02, Math.cos(a) * 0.03], [end[0] * 0.5, soil + h * 0.5, end[2] * 0.5], end]);
      // thick corky cane with a cut top
      taper(k, 'canes', 'plant-stem', c, 0.036, 0.03, { nu: 9, nv: 8, ov: C('#8b7759') });
      k.cyl('canes', 'plant-stem', 0.026, 0.031, 0.012, end[0], top - 0.01, end[2], { segs: k.seg(12, 6), ...C('#8b7759') });
      // the rosette sprouts from the side just below the cut
      const sp = [end[0] + Math.sin(a + 1) * 0.03, top - 0.05, end[2] + Math.cos(a + 1) * 0.03];
      k.rod('canes', 'plant-stem', [end[0], top - 0.08, end[2]], sp, 0.012, { segs: 6, ...C('#6f7a46') });
      const n = k.hi ? 30 : 14;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const yaw = i * GOLD + rand() * 0.3;
        const pitch = lerp(1.4, -0.2, f ** 0.8) + (rand() - 0.5) * 0.15;
        const L = (0.3 + 0.1 * rand()) * Math.sqrt(s) * (f < 0.1 ? 0.65 : 1);
        k.add('leaves', 'plant-leaf', placeLeaf(leafPart(L, 0.032, { nu: k.hi ? 2 : 1, nv: k.hi ? 5 : 2, droop: 0.06 + 0.1 * f, fold: 0.45, outline: STRAP }), [sp[0], sp[1] + 0.03 - 0.04 * f, sp[2]], yaw, pitch, 0), C('#4c6c38'));
      }
    }
    recentre(k);
    return k.group();
  },
});

const ponytailPalm = item({
  id: 'ponytail-palm', category: 'plants', ko: '덕구리난(포니테일 야자)', en: 'Ponytail palm', size: [0.813, 0.894, 0.745],
  bboxSlack: [0.15, 0.05, 0.15],
  params: [
    P.len('height', '줄기 높이', 'Trunk height', 0.35, 0.2, 0.8),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['ponytail palm', 'beaucarnea', 'elephant foot', '덕구리난', '포니테일', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.16, h: 0.15, style: 'bowl', mat: p.potMaterial });
    const rand = rng(p.seed * 61);
    const Ht = p.height;
    // swollen caudex narrowing into a slim trunk, with soft growth rings
    const prof = [];
    const n = k.hi ? 18 : 8;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const r = 0.022 + 0.1 * Math.exp(-(((f + 0.05) / 0.28) ** 2)) + 0.004 * Math.sin(f * 40);
      prof.push([r, f * Ht]);
    }
    prof.push([0.012, Ht + 0.01], [0, Ht + 0.012]);
    k.lathe('trunk', 'plant-stem', prof, 0, soil - 0.03, 0, { segs: k.seg(20, 8), ...C('#7d6b52') });
    const top = soil - 0.03 + Ht;
    const nL = k.hi ? 90 : 36;
    for (let i = 0; i < nL; i++) {
      const yaw = i * GOLD + rand() * 0.3;
      const L = 0.32 + 0.14 * rand();
      const g = leafPart(L, 0.011, { nu: 1, nv: k.hi ? 9 : 4, droop: 0.45 + 0.3 * rand(), fold: 0.3, twist: (rand() - 0.5) * 2, outline: STRAP });
      k.add('leaves', 'plant-leaf', placeLeaf(g, [0, top - rand() * 0.015, 0], yaw, 1.15 + rand() * 0.38, 0), C('#4d6e36'));
    }
    recentre(k);
    return k.group();
  },
});

/* =============================================================== palms */

/** Palm: clustered canes/petioles each ending in an arching pinnate frond. */
function palmBuild(k, soil, s, rand, sp) {
  const stems = k.hi ? sp.stems : Math.max(3, Math.round(sp.stems * 0.7));
  for (let i = 0; i < stems; i++) {
    const a = i * GOLD + rand() * 0.5;
    const f = i / stems;
    const r0 = 0.012 + sp.spread * rand();
    const lean = sp.lean * (0.5 + rand()) * (1 - 0.5 * f);
    const h = sp.stemH * s * (0.7 + 0.45 * rand()) * (1 - 0.3 * f);
    const base = [Math.sin(a) * r0, soil - 0.01, Math.cos(a) * r0];
    const top = [base[0] + Math.sin(a) * Math.sin(lean) * h, soil + Math.cos(lean) * h, base[2] + Math.cos(a) * Math.sin(lean) * h];
    k.tube('stems', 'plant-leaf', [base, [base[0] + (top[0] - base[0]) * 0.4, soil + (top[1] - soil) * 0.55, base[2] + (top[2] - base[2]) * 0.4], top], sp.stemR, { segs: k.seg(10, 4), radial: k.seg(6, 4), ...C(sp.stemColor) });
    const nf = sp.frondsPer;
    for (let j = 0; j < nf; j++) {
      const yaw = a + (j - (nf - 1) / 2) * 0.8 + (rand() - 0.5) * 0.3;
      frond(k, top, yaw, {
        len: sp.frondLen * s * (0.8 + 0.35 * rand()), pitch: sp.pitch + (rand() - 0.5) * 0.3 + (f > 0.8 ? 0.5 : 0), arch: sp.arch,
        n: k.hi ? sp.leaflets : Math.ceil(sp.leaflets / 2), leafLen: sp.leafLen * s * (k.hi ? 1 : 1.1), leafW: k.hi ? sp.leafW : sp.leafW * 1.6, ang: sp.ang, droop: sp.droop,
        rachis: sp.stemR * 0.7, ov: C(sp.color), stemOv: C(sp.stemColor), nu: k.hi ? 2 : 1, nv: k.hi ? 4 : 2, leafDroop: sp.leafDroop ?? 0.25,
      });
    }
  }
}

const palmItem = (id, ko, en, size, sp, { height, potR, potH, style, mat, placement = 'floor', tags }) => item({
  id, category: 'plants', placement, ko, en, size, bboxSlack: [0.15, 0.06, 0.15],
  params: [
    P.len('height', '높이', 'Height', height, height * 0.5, height * 1.6),
    P.pick('pot', '화분', 'Pot', style, POT_STYLES),
    potMat(mat),
    seedP(),
  ],
  tags,
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / height;
    const soil = addPot(k, { r: potR * Math.sqrt(s), h: potH * Math.sqrt(s), style: p.pot, mat: p.potMaterial });
    palmBuild(k, soil, s, rng(p.seed * 67 + id.length), sp);
    recentre(k);
    return k.group();
  },
});

const arecaPalm = palmItem('areca-palm', '아레카야자', 'Areca palm', [1.2, 1.6, 1.2],
  { stems: 9, spread: 0.05, lean: 0.25, stemH: 0.85, stemR: 0.007, stemColor: '#9a9c4a', frondsPer: 2, frondLen: 0.75, pitch: 1.1, arch: 0.45, leaflets: 24, leafLen: 0.22, leafW: 0.1, ang: 0.7, droop: 0.25, color: '#6f9a43' },
  { height: 1.6, potR: 0.21, potH: 0.36, style: 'belly', mat: 'ceramic-white', tags: ['areca palm', 'palm', 'butterfly palm', '아레카야자', '야자', '식물', '공기정화'] });

const kentiaPalm = palmItem('kentia-palm', '켄차야자', 'Kentia palm', [1.192, 1.541, 1.515],
  { stems: 7, spread: 0.03, lean: 0.18, stemH: 1.0, stemR: 0.008, stemColor: '#4c6a34', frondsPer: 1, frondLen: 0.85, pitch: 0.75, arch: 0.6, leaflets: 26, leafLen: 0.3, leafW: 0.07, ang: 0.55, droop: 0.55, leafDroop: 0.4, color: '#3e6431' },
  { height: 1.9, potR: 0.22, potH: 0.42, style: 'cylinder', mat: 'ceramic-matte', tags: ['kentia palm', 'howea', 'palm', '켄차야자', '야자', '식물', '큰 화분'] });

const parlourPalm = palmItem('parlour-palm', '테이블야자', 'Parlour palm', [0.45, 0.48, 0.45],
  { stems: 7, spread: 0.02, lean: 0.2, stemH: 0.16, stemR: 0.0035, stemColor: '#5f7d3c', frondsPer: 1, frondLen: 0.24, pitch: 1.05, arch: 0.3, leaflets: 11, leafLen: 0.09, leafW: 0.17, ang: 0.85, droop: 0.1, color: '#4f8237' },
  { height: 0.48, potR: 0.075, potH: 0.12, style: 'taper', mat: 'ceramic-terracotta', placement: 'surface', tags: ['parlour palm', 'chamaedorea', 'table palm', '테이블야자', '미니 야자', '식물', '탁상 화분'] });

/* ======================================================= aroids & foliage */

const birdOfParadise = item({
  id: 'bird-of-paradise', category: 'plants', ko: '극락조화', en: 'Bird of paradise', size: [0.995, 1.396, 0.466],
  bboxSlack: [0.15, 0.05, 0.15],
  params: [
    P.len('height', '높이', 'Height', 1.5, 0.7, 2.2),
    P.bool('flower', '꽃', 'Flower', true),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['bird of paradise', 'strelitzia', '극락조화', '스트렐리치아', '식물', '큰 화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.5;
    const soil = addPot(k, { r: 0.2, h: 0.38, style: 'taper', mat: p.potMaterial });
    const rand = rng(p.seed * 71);
    const n = k.hi ? 9 : 7;
    for (let i = 0; i < n; i++) {
      // strelitzia leaves grow in a fan: alternate left / right in one plane
      const side = i % 2 ? 1 : -1;
      const yaw = side * Math.PI / 2 + (rand() - 0.5) * 0.9;
      const f = i / n;
      const lean = 0.08 + 0.38 * (1 - f) * (0.6 + rand() * 0.6);
      const pl = (H - soil) * (0.45 + 0.25 * rand()) * (1 - 0.2 * f);
      const base = [side * 0.01 * i * 0.3, soil - 0.02, (rand() - 0.5) * 0.02];
      const c = petiole(base, yaw, Math.PI / 2 - lean, pl, 0.02);
      k.tube('stems', 'plant-leaf', null, 0.0075, { curve: c, segs: k.seg(12, 4), radial: k.seg(6, 4), ...C('#5d7f45') });
      const [py, pp] = endAngles(c);
      const L = (0.38 + 0.12 * rand()) * s;
      const segs = k.hi ? 7 : 4;
      const gaps = Array.from({ length: segs * 2 }, () => (rand() < 0.35 ? 0.3 + rand() * 0.4 : 0));
      const leaf = splitLeaf(L, L * 0.42, { segs, gaps, outline: PADDLE, droop: 0.12 + rand() * 0.1, fold: 0.2, nb: k.hi ? 3 : 2 });
      k.add('leaves', 'plant-leaf', placeLeaf(leaf, c.getPointAt(1).toArray(), py, pp - 0.15, (rand() - 0.5) * 0.5), C('#3f6a3a'));
    }
    if (p.flower) {
      const top = [0.03, soil + (H - soil) * 0.6, 0.05];
      k.tube('stems', 'plant-leaf', [[0, soil - 0.02, 0], [0.02, soil + (top[1] - soil) * 0.5, 0.03], top], 0.006, { segs: k.seg(10, 4), radial: 5, ...C('#5d7f45') });
      // boat-shaped bract pointing forward, orange sepals and a blue "tongue" rising from it
      const beak = fleshGeo(0.15, 0.024, 0.022, { nu: k.hi ? 8 : 5, nv: k.hi ? 6 : 3, bend: -0.1, concave: 0.2 });
      k.add('bract', 'plant-leaf', placeLeaf(beak, top, 0.25, 0.15), C('#56604a'));
      for (let i = 0; i < 3; i++) {
        const g = leafPart(0.09, 0.018, { nu: 1, nv: k.hi ? 3 : 2, droop: -0.1, fold: 0.5, outline: LANCE });
        k.add('flower', 'plant-leaf', placeLeaf(g, [top[0] + 0.012, top[1] + 0.01, top[2] + 0.03], 0.25 + (i - 1) * 0.35, 1.0 + i * 0.12), C('#f08a24'));
      }
      k.add('flower-blue', 'plant-leaf', placeLeaf(leafPart(0.07, 0.014, { nu: 1, nv: 2, droop: 0.1, fold: 0.6, outline: LANCE }), [top[0] + 0.012, top[1] + 0.012, top[2] + 0.035], 0.3, 0.55), C('#3953b0'));
    }
    recentre(k);
    return k.group();
  },
});

const bananaPlant = item({
  id: 'banana-plant', category: 'plants', ko: '바나나 나무', en: 'Banana plant', size: [1.5, 1.6, 1.5],
  bboxSlack: [0.2, 0.08, 0.2],
  params: [
    P.len('height', '높이', 'Height', 1.6, 0.9, 2.4),
    P.mat('potMaterial', '화분 재질', 'Pot finish', 'concrete', null),
    seedP(),
  ],
  tags: ['banana plant', 'musa', 'tropical', '바나나 나무', '바나나', '열대 식물', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 1.6;
    const soil = addPot(k, { r: 0.22, h: 0.4, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 73);
    // pseudo-stem of overlapping leaf sheaths
    const stemTop = soil + 0.42 * s;
    const sc = curveOf([[0, soil - 0.03, 0], [0.005, soil + 0.2 * s, 0], [0, stemTop, 0.005]]);
    taper(k, 'stem', 'plant-leaf', sc, 0.048, 0.03, { nu: 10, nv: 8, ov: C('#7f8f4c') });
    const n = k.hi ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const yaw = i * GOLD + rand() * 0.4;
      const c = petiole([0, stemTop - 0.04, 0], yaw, 1.15 - 0.3 * f, (0.22 + 0.1 * (1 - f)) * s, 0.05);
      k.tube('stem', 'plant-leaf', null, 0.011, { curve: c, segs: k.seg(8, 3), radial: k.seg(6, 4), ...C('#7f8f4c') });
      const [py, pp] = endAngles(c);
      const L = (0.62 + 0.2 * rand()) * s * (i === n - 1 ? 0.7 : 1);
      const segs = k.hi ? 10 : 5;
      const gaps = Array.from({ length: segs * 2 }, () => (rand() < 0.4 ? 0.5 + rand() * 0.4 : 0));
      const leaf = splitLeaf(L, L * 0.36, { segs, gaps, outline: PADDLE, droop: 0.35 + 0.2 * f, fold: 0.12, edgeDrop: 0.04, nb: k.hi ? 3 : 2 });
      k.add('leaves', 'plant-leaf-light', placeLeaf(leaf, c.getPointAt(1).toArray(), py, pp - 0.1 - 0.3 * f, (rand() - 0.5) * 0.3), C('#5f9238'));
    }
    // the new leaf unfurls rolled up in the centre
    k.add('leaves', 'plant-leaf-light', placeLeaf(fleshGeo(0.35 * s, 0.03, 0.03, { nu: k.hi ? 8 : 5, nv: k.hi ? 6 : 3, bend: 0.05, concave: 0 }), [0, stemTop - 0.02, 0], 0.3, 1.45), C('#5f9238'));
    recentre(k);
    return k.group();
  },
});

const philodendron = item({
  id: 'philodendron-selloum', category: 'plants', ko: '셀렘(필로덴드론)', en: 'Split-leaf philodendron', size: [1.194, 0.819, 1.345],
  bboxSlack: [0.18, 0.06, 0.18],
  params: [
    P.len('height', '높이', 'Height', 1.0, 0.5, 1.5),
    P.pick('pot', '화분', 'Pot', 'belly', POT_STYLES),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['philodendron', 'selloum', 'split leaf', '셀렘', '셀로움', '필로덴드론', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 1.0;
    const soil = addPot(k, { r: 0.2 * Math.sqrt(s), h: 0.3 * Math.sqrt(s), style: p.pot, mat: p.potMaterial });
    const rand = rng(p.seed * 79);
    const n = k.hi ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const yaw = i * GOLD + rand() * 0.5;
      const c = petiole([Math.sin(yaw) * 0.02, soil - 0.01, Math.cos(yaw) * 0.02], yaw, 1.35 - 0.35 * (1 - f), (0.55 + 0.25 * rand()) * s * (1 - 0.2 * f), 0.1);
      k.tube('stems', 'plant-leaf', null, 0.007, { curve: c, segs: k.seg(12, 4), radial: k.seg(6, 4), ...STEM });
      const [py, pp] = endAngles(c);
      const L = (0.3 + 0.1 * rand()) * s;
      const leaf = splitLeaf(L, L * 0.85, { segs: k.hi ? 9 : 5, gap: 0.62, outline: HEART, droop: 0.28, fold: 0.15, edgeDrop: 0.08, na: 1, nb: k.hi ? 4 : 2 });
      k.add('leaves', 'plant-leaf', placeLeaf(leaf, c.getPointAt(1).toArray(), py, pp * 0.25 + 0.05, (rand() - 0.5) * 0.3), C('#365f2f'));
    }
    recentre(k);
    return k.group();
  },
});

const zzPlant = item({
  id: 'zz-plant', category: 'plants', ko: '금전수(ZZ 플랜트)', en: 'ZZ plant', size: [0.55, 0.7, 0.55],
  bboxSlack: [0.1, 0.05, 0.1],
  params: [
    P.len('height', '높이', 'Height', 0.7, 0.35, 1.1),
    P.int('stems', '줄기 수', 'Stems', 9, 4, 14),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['zz plant', 'zamioculcas', '금전수', '돈나무', '식물', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 0.7;
    const soil = addPot(k, { r: 0.13, h: 0.24, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 83 + p.stems);
    for (let i = 0; i < p.stems; i++) {
      const yaw = i * GOLD + rand() * 0.5;
      const len = (p.height - soil) * (0.65 + 0.4 * rand());
      const c = petiole([Math.sin(yaw) * 0.03, soil - 0.01, Math.cos(yaw) * 0.03], yaw, 1.35 - 0.35 * rand(), len, 0.06);
      // stems are thick and fleshy at the base and thin at the top
      taper(k, 'stems', 'plant-leaf', c, 0.009, 0.003, { nu: 6, nv: 8, ov: C('#4d6b33') });
      const pairs = k.hi ? 8 : 5;
      for (let j = 0; j < pairs; j++) {
        const t = 0.3 + 0.7 * (j / pairs);
        const at = c.getPointAt(t), tan = c.getTangentAt(t);
        const side = V3().crossVectors(tan, UP).normalize();
        const L = 0.065 * Math.sqrt(s) * (1 - 0.3 * (j / pairs));
        for (const sd of [-1, 1]) {
          const dir = tan.clone().multiplyScalar(0.55).addScaledVector(side, sd);
          const g = leafPart(L, L * 0.5, { nu: k.hi ? 2 : 1, nv: k.hi ? 3 : 2, droop: 0.1, fold: 0.15, outline: OVAL_TIP });
          k.add('leaves', 'plant-leaf', frameOrient(g, at, dir, side.clone().cross(tan)), C('#22421f'));
        }
      }
      const tip = c.getPointAt(1);
      k.add('leaves', 'plant-leaf', frameOrient(leafPart(0.05, 0.025, { nu: 1, nv: 2, outline: OVAL_TIP }), tip, c.getTangentAt(1), UP), C('#22421f'));
    }
    recentre(k);
    return k.group();
  },
});

const peaceLily = item({
  id: 'peace-lily', category: 'plants', ko: '스파티필름', en: 'Peace lily', size: [0.75, 0.75, 0.75],
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('height', '높이', 'Height', 0.75, 0.4, 1.2),
    P.int('flowers', '꽃 수', 'Flowers', 4, 0, 7),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['peace lily', 'spathiphyllum', '스파티필름', '평화 백합', '식물', '공기정화'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 0.75;
    const soil = addPot(k, { r: 0.13, h: 0.22, style: 'taper', mat: p.potMaterial });
    const rand = rng(p.seed * 89);
    const n = k.hi ? 18 : 11;
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.4;
      const f = (i % 6) / 6;
      const c = petiole([Math.sin(yaw) * 0.015, soil - 0.01, Math.cos(yaw) * 0.015], yaw, 1.4 - 0.5 * f - rand() * 0.15, (0.2 + 0.1 * rand()) * s, 0.12);
      k.tube('stems', 'plant-leaf', null, 0.0035, { curve: c, segs: k.seg(8, 3), radial: 4, ...STEM });
      const [py, pp] = endAngles(c);
      const L = (0.24 + 0.08 * rand()) * s;
      k.add('leaves', 'plant-leaf', placeLeaf(leafPart(L, L * 0.38, { nu: k.hi ? 4 : 2, nv: k.hi ? 6 : 3, droop: 0.35, fold: 0.2, outline: LANCE }), c.getPointAt(1).toArray(), py, pp * 0.6, (rand() - 0.5) * 0.4), C('#284d27'));
    }
    for (let i = 0; i < p.flowers; i++) {
      const yaw = i * GOLD * 1.3 + 0.5 + rand() * 0.4;
      const h = (p.height - soil) * (0.85 + 0.15 * rand());
      const lean = 0.12 + 0.12 * rand();
      const top = [Math.sin(yaw) * Math.sin(lean) * h, soil + Math.cos(lean) * h, Math.cos(yaw) * Math.sin(lean) * h];
      k.tube('stems', 'plant-leaf', [[0, soil - 0.01, 0], [top[0] * 0.5, soil + (top[1] - soil) * 0.5, top[2] * 0.5], top], 0.0028, { segs: k.seg(8, 3), radial: 4, ...STEM });
      // white spathe cupped around the cream spadix, facing outwards
      const sp = leafPart(0.13, 0.08, { nu: k.hi ? 4 : 2, nv: k.hi ? 5 : 3, droop: -0.12, fold: 0.85, outline: OVAL_TIP });
      k.add('spathes', 'plant-leaf', placeLeaf(sp, [top[0] - Math.sin(yaw) * 0.006, top[1], top[2] - Math.cos(yaw) * 0.006], yaw + Math.PI, 1.3), C('#f3f2e8'));
      k.cyl('spadix', 'plant-leaf', 0.004, 0.006, 0.045, top[0] + Math.sin(yaw) * 0.006, top[1] + 0.005, top[2] + Math.cos(yaw) * 0.006, { segs: k.seg(8, 4), rx: Math.cos(yaw) * 0.25, rz: -Math.sin(yaw) * 0.25, ...C('#e3d9a6') });
    }
    recentre(k);
    return k.group();
  },
});

const calathea = item({
  id: 'calathea', category: 'plants', ko: '칼라데아', en: 'Calathea', size: [0.6, 0.6, 0.6],
  bboxSlack: [0.1, 0.05, 0.1],
  params: [
    P.len('height', '높이', 'Height', 0.6, 0.3, 1.0),
    P.color('leafColor', '잎 색', 'Leaf colour', '#2f4f2c'),
    P.color('stripeColor', '무늬 색', 'Stripe colour', '#9dbb72'),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['calathea', 'prayer plant', 'maranta', '칼라데아', '마란타', '식물', '무늬 잎'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 0.6;
    const soil = addPot(k, { r: 0.12, h: 0.2, style: 'belly', mat: p.potMaterial });
    const rand = rng(p.seed * 97);
    const n = k.hi ? 12 : 8;
    // feather pattern: dark blade with pale bands running out from the midrib
    const bands = k.hi ? [[0, 0.12, 0], [0.12, 0.2, 1], [0.2, 0.32, 0], [0.32, 0.4, 1], [0.4, 0.52, 0], [0.52, 0.6, 1], [0.6, 0.72, 0], [0.72, 0.79, 1], [0.79, 1, 0]] : [[0, 1, 0]];
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.4;
      const c = petiole([Math.sin(yaw) * 0.015, soil - 0.01, Math.cos(yaw) * 0.015], yaw, 1.35 - 0.45 * (i / n) - rand() * 0.15, (0.17 + 0.12 * rand()) * s, 0.05);
      k.tube('stems', 'plant-leaf', null, 0.003, { curve: c, segs: k.seg(8, 3), radial: 4, ...C('#6a4a52') });
      const [py, pp] = endAngles(c);
      const L = (0.17 + 0.05 * rand()) * s;
      const o = { nu: k.hi ? 4 : 2, droop: 0.15, fold: 0.12, wave: 0.04, waves: 5, outline: OVAL_TIP };
      const pitch = pp * 0.5 + 0.1, roll = (rand() - 0.5) * 0.4, at = c.getPointAt(1).toArray();
      for (const [t0, t1, stripe] of bands) {
        const g = leafPart(L, L * 0.55, { ...o, t0, t1, nv: k.hi ? 1 : 4 });
        k.add(stripe ? 'stripes' : 'leaves', 'plant-leaf', placeLeaf(g, at, py, pitch, roll), C(stripe ? p.stripeColor : p.leafColor));
      }
    }
    recentre(k);
    return k.group();
  },
});

const alocasia = item({
  id: 'alocasia', category: 'plants', ko: '알로카시아', en: 'Alocasia', size: [0.783, 0.625, 1.008],
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('height', '높이', 'Height', 0.85, 0.45, 1.4),
    P.bool('veins', '흰 잎맥', 'White veins', true),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['alocasia', 'elephant ear', 'african mask', '알로카시아', '코끼리 귀', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 0.85;
    const soil = addPot(k, { r: 0.13, h: 0.24, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 101);
    const n = k.hi ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.4;
      const c = petiole([Math.sin(yaw) * 0.015, soil - 0.01, Math.cos(yaw) * 0.015], yaw, 1.3 - 0.35 * rand(), (0.3 + 0.18 * rand()) * s, 0.03);
      k.tube('stems', 'plant-leaf', null, 0.005, { curve: c, segs: k.seg(10, 4), radial: 5, ...C('#5e7a45') });
      const [py] = endAngles(c);
      const L = (0.26 + 0.08 * rand()) * s;
      // arrow-shaped blade held near vertical, tip pointing out and down
      const o = { droop: 0.18, fold: 0.15, wave: 0.03, waves: 7, outline: ARROW };
      const at = c.getPointAt(1).toArray(), pitch = -0.35 + rand() * 0.3, roll = (rand() - 0.5) * 0.3;
      k.add('leaves', 'plant-leaf', placeLeaf(leafPart(L, L * 0.6, { ...o, nu: k.hi ? 6 : 2, nv: k.hi ? 7 : 3 }), at, py, pitch, roll), C('#1f3a26'));
      if (p.veins && k.hi) {
        const veins = [veinGeo(L, L * 0.6, o, 0, 0, 0, 0.97, 0.012, 6)];
        for (const sd of [-1, 1]) for (let v = 0; v < 4; v++) { const t = 0.08 + v * 0.2; veins.push(veinGeo(L, L * 0.6, o, 0, t, sd * 0.9, t + 0.14 - v * 0.01, 0.008, 3)); }
        k.add('veins', 'plant-leaf', placeLeaf(mergeGeometries(veins, false), at, py, pitch, roll), C('#cfdcc0'));
      }
    }
    recentre(k);
    return k.group();
  },
});

const anthurium = item({
  id: 'anthurium', category: 'plants', placement: 'surface', ko: '안스리움', en: 'Anthurium', size: [0.45, 0.5, 0.45],
  bboxSlack: [0.1, 0.05, 0.1],
  params: [
    P.color('flowerColor', '꽃 색', 'Flower colour', '#c8162a'),
    P.int('flowers', '꽃 수', 'Flowers', 4, 1, 7),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['anthurium', 'flamingo flower', '안스리움', '안수리움', '꽃', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.075, h: 0.13, style: 'cylinder', mat: p.potMaterial });
    const rand = rng(p.seed * 103);
    const n = k.hi ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.4;
      const c = petiole([0, soil - 0.01, 0], yaw, 1.1 - 0.4 * rand(), 0.15 + 0.08 * rand(), 0.1);
      k.tube('stems', 'plant-leaf', null, 0.0025, { curve: c, segs: k.seg(8, 3), radial: 4, ...STEM });
      const [py] = endAngles(c);
      const L = 0.13 + 0.04 * rand();
      k.add('leaves', 'plant-leaf', placeLeaf(leafPart(L, L * 0.7, { nu: k.hi ? 4 : 2, nv: k.hi ? 5 : 3, droop: 0.3, fold: 0.12, outline: HEART }), c.getPointAt(1).toArray(), py, -0.3 - rand() * 0.3, 0), C('#244a26'));
    }
    for (let i = 0; i < p.flowers; i++) {
      const yaw = i * GOLD * 1.2 + 0.6 + rand() * 0.3;
      const h = 0.28 + 0.08 * rand();
      const top = V3(Math.sin(yaw) * 0.07, soil + h, Math.cos(yaw) * 0.07);
      k.tube('stems', 'plant-leaf', [[0, soil - 0.01, 0], [top.x * 0.4, soil + h * 0.6, top.z * 0.4], top.toArray()], 0.002, { segs: k.seg(8, 3), radial: 4, ...STEM });
      // glossy heart-shaped spathe tilted up, facing out; the spadix rises from its base
      const out = dirOf(yaw, 0);
      const sp = leafPart(0.085, 0.07, { nu: k.hi ? 4 : 2, nv: k.hi ? 4 : 2, droop: 0.15, fold: 0.1, outline: HEART });
      k.add('flowers', 'plant-leaf', frameOrient(sp, top, out.clone().multiplyScalar(0.6).add(V3(0, -0.4, 0)), out.clone().add(V3(0, 0.9, 0))), C(p.flowerColor));
      k.add('spadix', 'plant-leaf', frameOrient(fleshGeo(0.055, 0.008, 0.008, { nu: 6, nv: 3, bend: -0.2, concave: 0, taper: (t) => 1 - 0.6 * t }), top.clone().add(V3(0, 0.004, 0)), out.clone().multiplyScalar(0.4).add(V3(0, 0.9, 0)), UP), C('#e9d66a'));
    }
    recentre(k);
    return k.group();
  },
});

const birdsNestFern = item({
  id: 'birds-nest-fern', category: 'plants', ko: '아비스(파초일엽)', en: "Bird's nest fern", size: [0.75, 0.5, 0.75],
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('spread', '잎 길이', 'Frond length', 0.38, 0.2, 0.6),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ["bird's nest fern", 'asplenium', 'fern', '아비스', '파초일엽', '고사리', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.12, h: 0.18, style: 'bowl', mat: p.potMaterial });
    const rand = rng(p.seed * 107);
    const n = k.hi ? 16 : 10;
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.3;
      const f = i / n;
      const L = p.spread * (0.75 + 0.35 * rand()) * (f > 0.8 ? 0.6 : 1);
      const o = { droop: 0.3 + 0.15 * (1 - f), fold: 0.2, wave: 0.12, waves: 9, outline: STRAP };
      const at = [Math.sin(yaw) * 0.01, soil + 0.005, Math.cos(yaw) * 0.01];
      const pitch = lerp(1.2, 0.55, 1 - f) + (rand() - 0.5) * 0.2;
      k.add('leaves', 'plant-leaf-light', placeLeaf(leafPart(L, L * 0.2, { ...o, nu: k.hi ? 4 : 2, nv: k.hi ? 14 : 5 }), at, yaw, pitch, 0), C('#6f9c3c'));
      if (k.hi) k.add('midribs', 'plant-stem', placeLeaf(veinGeo(L, L * 0.2, o, 0, 0, 0, 0.95, 0.008, 10), at, yaw, pitch, 0), C('#3c3a22'));
    }
    recentre(k);
    return k.group();
  },
});

/* ============================================================ succulents */

const aloeVera = item({
  id: 'aloe-vera', category: 'plants', placement: 'surface', ko: '알로에 베라', en: 'Aloe vera', size: [0.486, 0.336, 0.478],
  bboxSlack: [0.08, 0.04, 0.08],
  params: [
    P.int('leaves', '잎 수', 'Leaves', 14, 7, 22),
    potMat('ceramic-terracotta'),
    seedP(),
  ],
  tags: ['aloe vera', 'aloe', 'succulent', '알로에', '알로에 베라', '다육식물', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.1, h: 0.14, style: 'taper', mat: p.potMaterial });
    const rand = rng(p.seed * 109 + p.leaves);
    for (let i = 0; i < p.leaves; i++) {
      const f = i / p.leaves;
      const yaw = i * GOLD + rand() * 0.3;
      const L = (0.24 + 0.1 * rand()) * (1 - 0.35 * f);
      const g = fleshGeo(L, 0.045 * (1 - 0.3 * f), 0.018, { nu: k.hi ? 10 : 6, nv: k.hi ? 8 : 4, bend: 0.12 + 0.1 * (1 - f), concave: 0.65 });
      k.add('leaves', 'plant-leaf', placeLeaf(g, [Math.sin(yaw) * 0.012, soil - 0.005, Math.cos(yaw) * 0.012], yaw, lerp(0.75, 1.35, f) + (rand() - 0.5) * 0.15, 0), C('#7d9a6b'));
      // soft teeth along both edges
      if (k.hi) for (const sd of [-1, 1]) for (let t = 0.2; t < 0.85; t += 0.13) {
        const w = 0.045 * (1 - 0.3 * f) / 2 * (1 - t) ** 0.85;
        const tooth = new THREE.ConeGeometry(0.0018, 0.006, 3).rotateZ(-sd * Math.PI / 2).translate(sd * (w + 0.002), -0.12 * L * t * t, t * L);
        k.add('leaves', 'plant-leaf', placeLeaf(tooth, [Math.sin(yaw) * 0.012, soil - 0.005, Math.cos(yaw) * 0.012], yaw, lerp(0.75, 1.35, f), 0), C('#7d9a6b'));
      }
    }
    recentre(k);
    return k.group();
  },
});

const jadePlant = item({
  id: 'jade-plant', category: 'plants', placement: 'surface', ko: '염좌(크라슐라)', en: 'Jade plant', size: [0.23, 0.276, 0.202],
  bboxSlack: [0.08, 0.04, 0.08],
  params: [
    P.int('branching', '가지 단계', 'Branching', 3, 2, 3),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['jade plant', 'crassula', 'money plant', '염좌', '크라슐라', '다육식물', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.1, h: 0.11, style: 'bowl', mat: p.potMaterial });
    const rand = rng(p.seed * 113);
    const bark = C('#7a6b48');
    const pad = (at, dir, size) => {
      const g = new THREE.SphereGeometry(1, k.seg(8, 5), k.seg(6, 4));
      g.scale(size * 0.65, size * 0.3, size);
      g.translate(0, 0, size * 0.92);
      k.add('leaves', 'plant-leaf', frameOrient(g, at, dir, UP), C('#4c7a3a'));
    };
    const grow = (start, dir, len, r, depth) => {
      const end = start.clone().addScaledVector(dir, len);
      const mid = start.clone().lerp(end, 0.5).add(V3((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.02));
      const c = new THREE.CatmullRomCurve3([start, mid, end]);
      taper(k, 'trunk', 'plant-stem', c, r, r * 0.72, { nu: 7, nv: 5, ov: bark });
      if (depth <= 1) {
        // decussate pairs of fleshy pads near the tip
        for (let j = 0; j < 3; j++) {
          const t = 0.55 + j * 0.2, at = c.getPointAt(t), tan = c.getTangentAt(t);
          const side = V3().crossVectors(tan, UP);
          if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
          side.normalize().applyAxisAngle(tan, j * Math.PI / 2);
          for (const sd of [-1, 1]) pad(at, side.clone().multiplyScalar(sd).addScaledVector(tan, 0.6), 0.024 - j * 0.002);
        }
        pad(end, dir, 0.016);
        return;
      }
      const nC = 2;
      for (let i = 0; i < nC; i++) {
        const a = rand() * TAU;
        const nd = dir.clone().add(V3(Math.cos(a) * 0.95, 0.05, Math.sin(a) * 0.95)).normalize();
        grow(end, nd, len * (0.7 + 0.2 * rand()), r * 0.68, depth - 1);
      }
    };
    grow(V3(0, soil - 0.02, 0), V3(0.05, 1, 0.02).normalize(), 0.08, 0.018, p.branching);
    recentre(k);
    return k.group();
  },
});

const echeveriaPlanter = item({
  id: 'echeveria-planter', category: 'plants', placement: 'surface', ko: '다육이 모둠 화분', en: 'Succulent planter', size: [0.4, 0.13, 0.15],
  bboxSlack: [0.02, 0.02, 0.02],
  params: [
    P.len('width', '폭', 'Width', 0.4, 0.3, 0.7),
    P.mat('planter', '화분 재질', 'Planter', 'concrete', null),
    seedP(),
  ],
  tags: ['succulent planter', 'echeveria', 'haworthia', '다육이', '모둠 화분', '에케베리아', '하월시아'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.14, Hh = 0.07;
    k.slab('planter', p.planter, frameShape(W, D, 0.012, 0.012, 0.02), Hh, 0, { bevel: 0.003 });
    k.box('planter', p.planter, W - 0.02, 0.012, D - 0.02, 0, 0.006, 0, { r: 0.001 });
    k.box('soil', 'soil', W - 0.024, 0.01, D - 0.024, 0, Hh - 0.016, 0, { r: 0 });
    const rand = rng(p.seed * 127);
    const y = Hh - 0.011;
    for (let i = 0; i < (k.hi ? 40 : 12); i++) k.sphere('gravel', 'travertine', 0.004 + rand() * 0.003, (rand() - 0.5) * (W - 0.04), y + 0.001, (rand() - 0.5) * (D - 0.04), { segs: 5, rings: 3, scale: [1, 0.6, 1] });
    const slots = Math.max(3, Math.round(W / 0.1));
    const colours = ['#8fb0a8', '#c99aa8', '#7fa05a', '#a6a6c4', '#93b283'];
    for (let i = 0; i < slots; i++) {
      const x = -W / 2 + 0.05 + (W - 0.1) * (i / (slots - 1));
      const z = (rand() - 0.5) * 0.02;
      if (i === 1) {
        // haworthia: upright, pointed, dark leaves
        for (let j = 0; j < (k.hi ? 14 : 8); j++) {
          const yaw = j * GOLD, f = j / 14;
          k.add('haworthia', 'plant-leaf', placeLeaf(fleshGeo(0.045 - 0.015 * f, 0.012, 0.006, { nu: k.hi ? 6 : 4, nv: k.hi ? 4 : 2, bend: 0.1, concave: 0.4 }), [x, y, z], yaw, 0.9 + 0.5 * f, 0), C('#2f5a33'));
        }
      } else {
        rosette(k, 'rosettes', 'plant-leaf-light', C(colours[(i + p.seed) % colours.length]), x, y, z, 0.052 + 0.012 * rand(), { rings: k.hi ? 4 : 3, perRing: k.hi ? 10 : 6, seedTurn: rand() });
      }
    }
    recentre(k);
    return k.group();
  },
});

/** Ribbed cactus column along a curve. */
function cactusColumn(k, curve, R, { ribs = 12, depth = 0.08, nu = 48, nv = 20, mat = 'plant-leaf', ov = C('#4f7a46'), taperTo = 0.85 } = {}) {
  const len = curve.getLength();
  const g = alongGeo(curve, (b, an) => R * lerp(1, taperTo, b) * (1 + depth * Math.cos(ribs * an)), k.seg(nu, 12), k.seg(nv, 6), { cap: Math.min(0.5, R * 1.1 / len) });
  k.add('cactus', mat, g.geo, ov);
  return g;
}

const saguaro = item({
  id: 'saguaro-cactus', category: 'plants', ko: '기둥 선인장', en: 'Column cactus', size: [0.45, 0.95, 0.3],
  bboxSlack: [0.08, 0.05, 0.08],
  params: [
    P.len('height', '높이', 'Height', 0.95, 0.5, 1.8),
    P.int('arms', '가지 수', 'Arms', 2, 0, 3),
    potMat('ceramic-terracotta'),
    seedP(),
  ],
  tags: ['cactus', 'saguaro', 'column cactus', '선인장', '기둥 선인장', '사와로', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const H = p.height, s = H / 0.95;
    const soil = addPot(k, { r: 0.13, h: 0.24, style: 'taper', mat: p.potMaterial });
    const rand = rng(p.seed * 131);
    const R = 0.055 * Math.sqrt(s);
    const trunk = curveOf([[0, soil - 0.02, 0], [0.004, soil + (H - soil) * 0.5, 0], [0, H, 0.003]]);
    cactusColumn(k, trunk, R, { ribs: 12, taperTo: 0.88 });
    for (let i = 0; i < p.arms; i++) {
      const a = [Math.PI / 2, -Math.PI / 2, 0.3][i] + (rand() - 0.5) * 0.4;
      const y0 = soil + (H - soil) * (0.3 + 0.15 * i + 0.1 * rand());
      const out = 0.1 + 0.03 * rand();
      const up = (H - y0) * (0.45 + 0.25 * rand());
      const d = [Math.sin(a), Math.cos(a)];
      const c = curveOf([[d[0] * R * 0.3, y0, d[1] * R * 0.3], [d[0] * (R + out * 0.5), y0 + 0.01, d[1] * (R + out * 0.5)], [d[0] * (R + out), y0 + 0.06, d[1] * (R + out)], [d[0] * (R + out), y0 + up, d[1] * (R + out)]]);
      cactusColumn(k, c, R * 0.62, { ribs: 10, nu: 40, nv: 18, taperTo: 0.9 });
    }
    for (let i = 0; i < (k.hi ? 18 : 6); i++) { const a = rand() * TAU, r = R + 0.01 + rand() * 0.05; k.sphere('gravel', 'travertine', 0.006 + rand() * 0.004, Math.cos(a) * r, soil + 0.002, Math.sin(a) * r, { segs: 5, rings: 3, scale: [1, 0.6, 1] }); }
    recentre(k);
    return k.group();
  },
});

const barrelCactus = item({
  id: 'barrel-cactus', category: 'plants', placement: 'surface', ko: '금호 선인장', en: 'Golden barrel cactus', size: [0.36, 0.3, 0.36],
  bboxSlack: [0.05, 0.03, 0.05],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.22, 0.1, 0.4),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['barrel cactus', 'golden barrel', 'echinocactus', '금호', '선인장', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const R = p.diameter / 2;
    const soil = addPot(k, { r: R * 1.45 + 0.02, h: 0.1 + R * 0.3, style: 'bowl', mat: p.potMaterial });
    const rand = rng(p.seed * 137);
    const barrel = (x, z, r, ribs) => {
      const h = r * 1.5;
      const c = curveOf([[x, soil - 0.015, z], [x, soil - 0.015 + h * 0.5, z], [x, soil - 0.015 + h, z]]);
      const prof = (b) => r * Math.sqrt(Math.max(0, 1 - ((b - 0.35) / 0.65) ** 2));
      const g = alongGeo(c, (b, an) => prof(b) * (1 + 0.1 * Math.cos(ribs * an)), k.seg(ribs * 4, ribs * 2), k.seg(16, 8));
      k.add('cactus', 'plant-leaf', g.geo, C('#3f6e3a'));
      // golden spines along the rib crests
      const rows = k.hi ? 6 : 3;
      for (let rI = 0; rI < ribs; rI++) {
        const an = (rI / ribs) * TAU;
        for (let j = 0; j < rows; j++) {
          const b = 0.12 + 0.78 * (j + (rI % 2) * 0.5) / rows;
          const rr = prof(b) * 1.1;
          if (rr < 0.005) continue;
          const { p: pt, d } = g.at(b, an, rr);
          const tip = d.clone().multiplyScalar(0.012 + 0.006 * rand()).add(V3(0, 0.006, 0)).add(toV(pt));
          k.rod('spines', 'plant-leaf-light', pt, tip.toArray(), 0.0009, { segs: 3, r2: 0.0002, ...C('#e3c35a') });
        }
      }
      // woolly crown
      k.sphere('crown', 'plant-leaf-light', r * 0.22, x, soil - 0.015 + h * 0.98, z, { segs: k.seg(10, 5), rings: k.seg(6, 3), scale: [1, 0.35, 1], ...C('#e8d79a') });
    };
    barrel(0, 0, R, k.hi ? 20 : 14);
    barrel(R * 1.05, R * 0.55, R * 0.38, k.hi ? 14 : 10);
    recentre(k);
    return k.group();
  },
});

/** Opuntia pads growing from each other's rims. */
function opuntia(k, base, yaw, size, depth, rand, { dots = true, fruit = true } = {}) {
  const pads = [];
  const grow = (M, w, d) => {
    const h = w * 1.35, th = w * 0.18;
    const g = new THREE.SphereGeometry(1, k.seg(12, 6), k.seg(9, 5));
    g.scale(w / 2, h / 2, th / 2);
    g.translate(0, h / 2 * 0.95, 0);
    g.applyMatrix4(M);
    k.add('cactus', 'plant-leaf', g, C('#5f8a46'));
    pads.push([M.clone(), w, h, th]);
    if (d <= 0) return;
    const nC = d === depth ? 2 : 1 + Math.floor(rand() * 2);
    for (let i = 0; i < nC; i++) {
      const phi = (i - (nC - 1) / 2) * 0.9 + (rand() - 0.5) * 0.4;
      const lp = V3(Math.sin(phi) * w / 2 * 0.75, h * 0.95 * (0.5 + 0.5 * Math.cos(phi) * 0.95), 0);
      const child = M.clone().multiply(new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z)).multiply(new THREE.Matrix4().makeRotationY((rand() - 0.5) * 0.9)).multiply(new THREE.Matrix4().makeRotationZ(-phi * 0.9));
      grow(child, w * (0.78 + 0.1 * rand()), d - 1);
    }
  };
  const M0 = new THREE.Matrix4().makeTranslation(base[0], base[1], base[2]).multiply(new THREE.Matrix4().makeRotationY(yaw));
  grow(M0, size, depth);
  for (const [M, w, h, th] of pads) {
    if (dots && k.hi) {
      for (let i = 0; i < 14; i++) {
        const u = (rand() - 0.5) * 1.6, v = 0.15 + rand() * 0.75;
        const x = u * w / 2 * Math.sin(Math.PI * v) ** 0.5, y = v * h * 0.95;
        const nx = x / (w / 2), ny = (y - h * 0.475) / (h / 2);
        const zz = th / 2 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) + 0.0005;
        const pt = V3(x, y, (i % 2 ? 1 : -1) * zz).applyMatrix4(M);
        k.sphere('areoles', 'plant-leaf-light', 0.0022, pt.x, pt.y, pt.z, { segs: 4, rings: 3, ...C('#e6dcb4') });
      }
    }
    if (fruit && rand() < 0.35) {
      const pt = V3(w * 0.25, h * 0.95, 0).applyMatrix4(M);
      k.sphere('fruit', 'plant-leaf', w * 0.13, pt.x, pt.y, pt.z, { segs: k.seg(8, 5), rings: k.seg(6, 4), scale: [0.8, 1.2, 0.8], ...C('#a5304a') });
    }
  }
}

const pricklyPear = item({
  id: 'prickly-pear', category: 'plants', ko: '부채 선인장', en: 'Prickly pear cactus', size: [0.5, 0.75, 0.3],
  bboxSlack: [0.12, 0.08, 0.12],
  params: [
    P.int('levels', '단 수', 'Levels', 3, 1, 4),
    potMat('ceramic-terracotta'),
    seedP(),
  ],
  tags: ['prickly pear', 'opuntia', 'cactus', '부채 선인장', '오푼티아', '선인장', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const soil = addPot(k, { r: 0.13, h: 0.22, style: 'taper', mat: p.potMaterial });
    const rand = rng(p.seed * 139);
    opuntia(k, [0, soil - 0.02, 0], 0.2, 0.13, p.levels, rand);
    recentre(k);
    return k.group();
  },
});

const cactusTrio = item({
  id: 'cactus-trio', category: 'plants', placement: 'surface', ko: '미니 선인장 3종 트레이', en: 'Mini cactus trio', size: [0.38, 0.22, 0.13],
  bboxSlack: [0.03, 0.04, 0.03],
  params: [
    P.mat('tray', '트레이', 'Tray', 'wood-oak', 'wood'),
    seedP(),
  ],
  tags: ['cactus', 'mini cactus', 'tray', '선인장', '미니 선인장', '트레이', '다육식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 149);
    k.rbox('tray', p.tray, 0.38, 0.018, 0.13, 0.004, 0, 0.009, 0);
    k.box('tray', p.tray, 0.38, 0.012, 0.012, 0, 0.024, -0.059, { r: 0.002 });
    k.box('tray', p.tray, 0.38, 0.012, 0.012, 0, 0.024, 0.059, { r: 0.002 });
    const y0 = 0.018;
    const pots = [[-0.12, 'ceramic-terracotta'], [0, 'ceramic-white'], [0.12, 'concrete']];
    const soils = pots.map(([x, mat]) => [x, addPot(k, { r: 0.042, h: 0.075, style: 'cylinder', mat, x, y0 })]);
    // 1: ribbed column with a pup
    const [x1, s1] = soils[0];
    cactusColumn(k, curveOf([[x1, s1 - 0.01, 0], [x1 + 0.002, s1 + 0.06, 0], [x1, s1 + 0.13, 0]]), 0.022, { ribs: 9, nu: 36, nv: 12 });
    cactusColumn(k, curveOf([[x1 + 0.015, s1 - 0.005, 0.01], [x1 + 0.028, s1 + 0.02, 0.014], [x1 + 0.03, s1 + 0.05, 0.015]]), 0.011, { ribs: 8, nu: 32, nv: 8 });
    // 2: mammillaria ball with white wool and a crown of pink flowers
    const [x2, s2] = soils[1];
    const bc = curveOf([[x2, s2 - 0.01, 0], [x2, s2 + 0.03, 0], [x2, s2 + 0.07, 0]]);
    const ball = alongGeo(bc, (b, an) => 0.036 * Math.sqrt(Math.max(0, 1 - ((b - 0.4) / 0.6) ** 2)) * (1 + 0.05 * Math.sin(13 * an + b * 20)), k.seg(32, 12), k.seg(12, 6));
    k.add('cactus', 'plant-leaf', ball.geo, C('#4f7a46'));
    if (k.hi) for (let i = 0; i < 40; i++) { const b = 0.1 + 0.8 * rand(), an = rand() * TAU; const { p: pt } = ball.at(b, an, ball.rad(b, an) * 1.02); k.sphere('wool', 'plant-leaf-light', 0.0028, pt[0], pt[1], pt[2], { segs: 4, rings: 3, ...C('#f2efe6') }); }
    for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; const { p: pt } = ball.at(0.82, an, ball.rad(0.82, an)); k.sphere('flowers', 'plant-leaf', 0.0055, pt[0], pt[1] + 0.003, pt[2], { segs: k.seg(6, 4), rings: 4, scale: [1, 0.6, 1], ...C('#e26a9a') }); }
    // 3: bunny-ear opuntia
    const [x3, s3] = soils[2];
    opuntia(k, [x3, s3 - 0.01, 0], 0.1, 0.045, 1, rand, { fruit: false });
    recentre(k);
    return k.group();
  },
});

/* ==================================================== bonsai & arrangements */

const bonsai = item({
  id: 'plant-bonsai-juniper', category: 'plants', placement: 'surface', ko: '분재(향나무)', en: 'Juniper bonsai', size: [0.313, 0.392, 0.242],
  bboxSlack: [0.08, 0.05, 0.08],
  params: [
    P.len('height', '높이', 'Height', 0.4, 0.25, 0.7),
    P.mat('potMaterial', '분 재질', 'Pot finish', 'ceramic-matte', 'ceramic'),
    P.color('glaze', '분 색', 'Pot colour', '#5a4a3e'),
    seedP(),
  ],
  tags: ['bonsai', 'juniper', '분재', '향나무', '소나무', '식물', '동양'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 151);
    const s = p.height / 0.4;
    // shallow rectangular pot on four feet
    const pw = 0.3, pd = 0.2, ph = 0.05;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box('pot', p.potMaterial, 0.03, 0.01, 0.02, x * (pw / 2 - 0.03), 0.005, z * (pd / 2 - 0.025), { r: 0.002, ...C(p.glaze) });
    k.slab('pot', p.potMaterial, frameShape(pw, pd, 0.012, 0.012, 0.012), ph, 0.01, { bevel: 0.003, ...C(p.glaze) });
    k.box('pot', p.potMaterial, pw - 0.02, 0.01, pd - 0.02, 0, 0.015, 0, { r: 0.001, ...C(p.glaze) });
    const soilY = 0.01 + ph - 0.006;
    k.box('soil', 'soil', pw - 0.024, 0.012, pd - 0.024, 0, soilY - 0.006, 0, { r: 0 });
    for (let i = 0; i < (k.hi ? 6 : 3); i++) {
      const g = blobGeo(0.02 + 0.012 * rand(), { segs: k.seg(10, 6), rings: k.seg(6, 4), amp: 0.3, scale: [1, 0.4, 1], seed: i + 1 });
      g.translate((rand() - 0.5) * (pw - 0.08), soilY + 0.002, (rand() - 0.5) * (pd - 0.07));
      k.add('moss', 'plant-leaf-light', g, C('#5d7a34'));
    }
    k.add('rock', 'granite-grey', blobGeo(0.025, { segs: k.seg(10, 6), rings: k.seg(7, 4), amp: 0.25, scale: [1.3, 0.7, 1], seed: 4 }).translate(0.09, soilY + 0.008, 0.04));
    // twisted, leaning trunk with horizontal branches ending in foliage pads
    const H = p.height - soilY;
    const trunk = curveOf([[-0.04, soilY - 0.01, 0], [-0.02, soilY + H * 0.2, 0.01], [-0.06, soilY + H * 0.45, -0.01], [0.0, soilY + H * 0.68, 0.0], [0.03, soilY + H * 0.82, 0.01]]);
    taper(k, 'trunk', 'plant-stem', trunk, 0.024 * s, 0.009 * s, { nu: 10, nv: 22, ov: C('#6b5440') });
    // root flare
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; k.add('trunk', 'plant-stem', alongGeo(curveOf([[-0.04, soilY + 0.025, 0], [-0.04 + Math.cos(a) * 0.03, soilY + 0.004, Math.sin(a) * 0.03], [-0.04 + Math.cos(a) * 0.055, soilY - 0.004, Math.sin(a) * 0.05]]), (b) => lerp(0.012, 0.003, b), k.seg(6, 4), k.seg(5, 3)).geo, C('#6b5440')); }
    const padAt = (pt, r, flat = 0.38) => {
      const g = blobGeo(r, { segs: k.seg(14, 8), rings: k.seg(9, 5), amp: 0.22, scale: [1, flat, 0.85], seed: Math.round(pt.x * 100 + pt.y * 50) });
      g.translate(pt.x, pt.y + r * flat * 0.4, pt.z);
      k.add('foliage', 'plant-leaf', g, C('#35532a'));
    };
    const branches = [[0.35, -0.9, 0.16, 0.06], [0.52, 2.0, 0.14, 0.05], [0.68, -0.3, 0.12, 0.045], [0.75, 2.8, 0.1, 0.04]];
    for (const [t, a, len, r] of branches) {
      const at = trunk.getPointAt(t);
      const end = at.clone().add(V3(Math.cos(a) * len * s, 0.03 * s, Math.sin(a) * len * s * 0.6));
      const c = new THREE.CatmullRomCurve3([at, at.clone().lerp(end, 0.5).add(V3(0, -0.015, 0)), end]);
      taper(k, 'trunk', 'plant-stem', c, 0.007 * s, 0.003 * s, { nu: 6, nv: 6, ov: C('#6b5440') });
      padAt(end, r * s);
      padAt(at.clone().lerp(end, 0.55).add(V3(0, 0.012, 0)), r * 0.7 * s);
    }
    padAt(trunk.getPointAt(1).add(V3(0, 0.01, 0)), 0.065 * s, 0.5);
    recentre(k);
    return k.group();
  },
});

const herbTrio = item({
  id: 'plant-herb-trio', category: 'plants', placement: 'surface', ko: '허브 화분 3종 트레이', en: 'Herb pots on tray', size: [0.44, 0.27, 0.15],
  bboxSlack: [0.04, 0.04, 0.04],
  params: [
    P.mat('tray', '트레이', 'Tray', 'wood-pine', 'wood'),
    potMat('ceramic-terracotta'),
    seedP(),
  ],
  tags: ['herbs', 'basil', 'rosemary', 'chives', '허브', '바질', '로즈마리', '부추', '주방 화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 157);
    k.rbox('tray', p.tray, 0.44, 0.016, 0.15, 0.004, 0, 0.008, 0);
    for (const sx of [-1, 1]) k.box('tray', p.tray, 0.012, 0.03, 0.15, sx * 0.214, 0.031, 0, { r: 0.002 });
    const soil = (x) => addPot(k, { r: 0.055, h: 0.1, style: 'taper', mat: p.potMaterial, x, y0: 0.016 });
    // basil: upright stems with pairs of cupped, glossy leaves
    const sb = soil(-0.135);
    for (let i = 0; i < (k.hi ? 6 : 4); i++) {
      const a = i * GOLD, h = 0.1 + 0.05 * rand();
      const base = [-0.135 + Math.cos(a) * 0.015, sb - 0.005, Math.sin(a) * 0.015];
      const top = [base[0] + Math.cos(a) * 0.025, sb + h, base[2] + Math.sin(a) * 0.025];
      k.rod('herb-stems', 'plant-leaf', base, top, 0.0022, { segs: 4, ...STEM });
      for (let j = 0; j < 4; j++) {
        const f = j / 3, pt = [lerp(base[0], top[0], 0.35 + 0.65 * f), lerp(base[1], top[1], 0.35 + 0.65 * f), lerp(base[2], top[2], 0.35 + 0.65 * f)];
        for (const sd of [0, Math.PI]) k.add('basil', 'plant-leaf-light', placeLeaf(leafPart(0.045 * (1 - 0.35 * f), 0.028 * (1 - 0.35 * f), { nu: k.hi ? 3 : 2, nv: k.hi ? 3 : 2, droop: 0.25, fold: 0.5, outline: OVAL_TIP }), pt, a + sd + j * Math.PI / 2, 0.35 + 0.4 * f, 0), C('#5c9a38'));
      }
    }
    // rosemary: woody sprigs with needles
    const sr = soil(0);
    for (let i = 0; i < (k.hi ? 9 : 6); i++) {
      const a = i * GOLD + rand() * 0.3, lean = 0.1 + 0.25 * rand(), h = 0.13 + 0.06 * rand();
      const c = petiole([Math.cos(a) * 0.012, sr - 0.005, Math.sin(a) * 0.012], a, Math.PI / 2 - lean, h, 0.05);
      k.tube('herb-stems', 'plant-stem', null, 0.0016, { curve: c, segs: k.seg(6, 3), radial: 3, ...C('#6e5e44') });
      const nN = k.hi ? 24 : 10;
      for (let j = 0; j < nN; j++) {
        const t = 0.15 + 0.85 * (j / nN), pt = c.getPointAt(t), tan = c.getTangentAt(t);
        const side = V3().crossVectors(tan, UP).normalize().applyAxisAngle(tan, j * 2.1);
        k.add('rosemary', 'plant-leaf', frameOrient(leafPart(0.02, 0.0035, { nu: 1, nv: 1, fold: 0, droop: 0, outline: STRAP }), pt, side.addScaledVector(tan, 1.2), tan), C('#4b6a4c'));
      }
    }
    // chives: thin hollow blades and a few purple pompoms
    const sc = soil(0.135);
    const nc = k.hi ? 34 : 16;
    for (let i = 0; i < nc; i++) {
      const a = i * GOLD, r = 0.03 * Math.sqrt(rand()), h = 0.12 + 0.07 * rand();
      const base = [0.135 + Math.cos(a) * r, sc - 0.004, Math.sin(a) * r];
      const top = [base[0] + Math.cos(a) * 0.03 * rand(), sc + h, base[2] + Math.sin(a) * 0.03 * rand()];
      k.rod('chives', 'plant-leaf', base, top, 0.0016, { segs: 3, r2: 0.0006, ...C('#4f8a35') });
      if (i % 11 === 3) k.add('pompoms', 'plant-leaf', blobGeo(0.009, { segs: k.seg(8, 5), rings: k.seg(6, 4), amp: 0.25, seed: i }).translate(top[0], top[1] + 0.006, top[2]), C('#b085c8'));
    }
    recentre(k);
    return k.group();
  },
});

const luckyBamboo = item({
  id: 'lucky-bamboo', category: 'plants', placement: 'surface', ko: '개운죽', en: 'Lucky bamboo', size: [0.286, 0.56, 0.3],
  bboxSlack: [0.05, 0.04, 0.05],
  params: [
    P.int('stalks', '줄기 수', 'Stalks', 5, 3, 7),
    seedP(),
  ],
  tags: ['lucky bamboo', 'dracaena sanderiana', 'bamboo', '개운죽', '행운목', '대나무', '수경재배'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 163 + p.stalks);
    const R = 0.06, Hv = 0.16;
    k.lathe('vase', 'glass-clear', [[0, 0], [R - 0.004, 0], [R, 0.004], [R, Hv], [R - 0.004, Hv], [R - 0.004, 0.012], [0, 0.012]], 0, 0, 0, { segs: k.seg(32, 10) });
    k.cyl('water', 'water', R - 0.0045, R - 0.0045, 0.09, 0, 0.0125, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < (k.hi ? 22 : 9); i++) { const a = rand() * TAU, r = (R - 0.014) * Math.sqrt(rand()); k.sphere('pebbles', 'marble-white', 0.008 + rand() * 0.004, Math.cos(a) * r, 0.02 + rand() * 0.012, Math.sin(a) * r, { segs: 6, rings: 4, scale: [1, 0.65, 1] }); }
    const green = C('#7ea33d');
    for (let i = 0; i < p.stalks; i++) {
      const a = (i / p.stalks) * TAU + 0.3, r = i === 0 ? 0 : 0.026;
      const x = Math.cos(a) * r * (i ? 1 : 0), z = Math.sin(a) * r * (i ? 1 : 0);
      const h = 0.44 - 0.05 * i + 0.02 * rand();
      k.cyl('stalks', 'plant-leaf-light', 0.0065, 0.007, h - 0.015, x, 0.015, z, { segs: k.seg(10, 6), ...green });
      for (let y = 0.015 + 0.07; y < h - 0.01; y += 0.07) k.cyl('nodes', 'plant-leaf-light', 0.0078, 0.0078, 0.005, x, y, z, { segs: k.seg(10, 6), ...C('#9fb35a') });
      k.cyl('nodes', 'plant-leaf-light', 0.006, 0.0068, 0.004, x, h, z, { segs: k.seg(10, 6), ...C('#9fb35a') });
      // leafy shoot near the top
      const sy = h - 0.03;
      const sa = a + 0.7 + rand();
      const tip = [x + Math.cos(sa) * 0.025, sy + 0.05, z + Math.sin(sa) * 0.025];
      k.rod('stalks', 'plant-leaf-light', [x, sy, z], tip, 0.0025, { segs: 4, ...green });
      for (let j = 0; j < (k.hi ? 6 : 4); j++) {
        const yaw = j * GOLD + sa;
        k.add('leaves', 'plant-leaf', placeLeaf(leafPart(0.1 + 0.03 * rand(), 0.022, { nu: k.hi ? 2 : 1, nv: k.hi ? 5 : 3, droop: 0.45, fold: 0.2, twist: 0.4, outline: LANCE }), tip, yaw, 0.6 + 0.6 * rand(), 0), C('#4d8a34'));
      }
    }
    recentre(k);
    return k.group();
  },
});

const bambooPlanter = item({
  id: 'bamboo-planter', category: 'plants', ko: '대나무 플랜터', en: 'Bamboo in planter', size: [0.95, 2.1, 0.5],
  bboxSlack: [0.15, 0.08, 0.15],
  params: [
    P.len('height', '높이', 'Height', 2.1, 1.2, 2.8),
    P.len('width', '플랜터 폭', 'Planter width', 0.8, 0.5, 1.4),
    P.mat('planter', '플랜터 재질', 'Planter', 'wood-dark', null),
    seedP(),
  ],
  tags: ['bamboo', 'planter', 'screen', '대나무', '플랜터', '가림막', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const W = p.width, D = 0.34, Hp = 0.38;
    k.rbox('planter', p.planter, W, Hp, D, 0.01, 0, Hp / 2, 0);
    k.box('planter', p.planter, W + 0.02, 0.025, D + 0.02, 0, Hp - 0.0125, 0, { r: 0.004 });
    k.box('soil', 'soil', W - 0.04, 0.012, D - 0.04, 0, Hp + 0.001, 0, { r: 0 });
    const soil = Hp + 0.007;
    const rand = rng(p.seed * 167);
    const n = Math.max(5, Math.round(W * (k.hi ? 11 : 7)));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.07 + (W - 0.14) * (i + rand() * 0.6) / n;
      const z = (rand() - 0.5) * (D - 0.1);
      const h = (p.height - soil) * (0.75 + 0.25 * rand());
      const lean = (rand() - 0.5) * 0.12, leanZ = (rand() - 0.5) * 0.08;
      const top = [x + lean * h, soil + h, z + leanZ * h];
      const r = 0.011 + 0.005 * rand();
      const c = curveOf([[x, soil - 0.02, z], [x + lean * h * 0.4, soil + h * 0.5, z + leanZ * h * 0.4], top]);
      k.tube('culms', 'plant-leaf-light', null, r, { curve: c, segs: k.seg(12, 4), radial: k.seg(8, 5), ...C('#8aa144') });
      const nodes = Math.floor(h / 0.24);
      for (let j = 1; j <= nodes; j++) {
        const t = j / (nodes + 0.5);
        const at = c.getPointAt(t);
        k.cyl('nodes', 'plant-leaf-light', r * 1.15, r * 1.15, 0.006, at.x, at.y - 0.003, at.z, { segs: k.seg(8, 5), ...C('#6f8536') });
        if (t < 0.45) continue;
        // a twig per upper node with a spray of narrow leaves
        const ya = rand() * TAU;
        const twig = at.clone().add(V3(Math.sin(ya) * 0.12, 0.05, Math.cos(ya) * 0.12));
        k.rod('twigs', 'plant-leaf-light', at.toArray(), twig.toArray(), 0.0018, { segs: 3, ...C('#7a8d3a') });
        for (let l = 0; l < (k.hi ? 6 : 3); l++) {
          k.add('leaves', 'plant-leaf', placeLeaf(leafPart(0.13 + 0.04 * rand(), 0.017, { nu: 1, nv: k.hi ? 4 : 2, droop: 0.35, fold: 0.15, outline: LANCE }), twig.toArray(), ya + (l - 2.5) * 0.45, -0.3 - rand() * 0.4, 0), C('#4f7d34'));
        }
      }
      for (let l = 0; l < (k.hi ? 4 : 2); l++) k.add('leaves', 'plant-leaf', placeLeaf(leafPart(0.12, 0.016, { nu: 1, nv: 3, droop: 0.3, outline: LANCE }), top, rand() * TAU, 0.3 + rand() * 0.6, 0), C('#4f7d34'));
    }
    recentre(k);
    return k.group();
  },
});

/* ======================================================= hanging & wall */

const bostonFern = item({
  id: 'boston-fern-hanging', category: 'plants', placement: 'ceiling', ko: '보스턴 고사리 행잉', en: 'Hanging Boston fern', size: [0.806, 0.795, 0.83], elevation: 2.4 - 1.05,
  bboxSlack: [0.12, 0.05, 0.12],
  params: [
    P.len('hanger', '줄 길이', 'Hanger length', 0.5, 0.2, 1.2),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['boston fern', 'fern', 'hanging', '보스턴 고사리', '고사리', '행잉 플랜트', '걸이 화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 173);
    const potR = 0.13, potH = 0.15, potY = 0.5;
    const soil = addPot(k, { r: potR, h: potH, style: 'bowl', mat: p.potMaterial, y0: potY });
    const top = potY + potH + p.hanger;
    hanger(k, top, potY + potH + p.hanger * 0.25, [0, 1, 2].map((i) => [Math.cos(i * TAU / 3) * potR * 0.98, potY + potH - 0.004, Math.sin(i * TAU / 3) * potR * 0.98]));
    const n = k.hi ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.3;
      const f = i / n;
      frond(k, [Math.sin(yaw) * 0.03, soil + 0.005, Math.cos(yaw) * 0.03], yaw, {
        len: 0.42 + 0.22 * rand(), pitch: 0.75 + 0.5 * f, arch: 1.15 - 0.4 * f, n: k.hi ? 22 : 10, leafLen: 0.05, leafW: 0.32, ang: 1.25, droop: 0.15,
        rachis: 0.0018, mat: 'plant-leaf-light', ov: C('#5f9a3a'), nu: 1, nv: 2, fold: 0.1, leafDroop: 0.2, outline: OVAL_TIP,
      });
    }
    recentre(k);
    return k.group();
  },
});

const stringOfPearls = item({
  id: 'string-of-pearls', category: 'plants', placement: 'ceiling', ko: '녹영(그린네클리스) 행잉', en: 'Hanging string of pearls', size: [0.32, 1.25, 0.32], elevation: 2.4 - 1.25,
  bboxSlack: [0.08, 0.05, 0.08],
  params: [
    P.len('hanger', '줄 길이', 'Hanger length', 0.45, 0.2, 1.0),
    P.len('trail', '늘어짐', 'Trailing length', 0.6, 0.2, 1.1),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['string of pearls', 'senecio', 'hanging', '녹영', '그린네클리스', '행잉 플랜트', '다육식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 179);
    const potR = 0.085, potH = 0.09, potY = p.trail + 0.02;
    const soil = addPot(k, { r: potR, h: potH, style: 'bowl', mat: p.potMaterial, y0: potY });
    const top = potY + potH + p.hanger;
    hanger(k, top, potY + potH + p.hanger * 0.3, [0, 1, 2].map((i) => [Math.cos(i * TAU / 3 + 0.5) * potR * 0.98, potY + potH - 0.003, Math.sin(i * TAU / 3 + 0.5) * potR * 0.98]), { mat: 'metal-brass', r: 0.0012 });
    const strands = k.hi ? 12 : 7;
    const step = k.hi ? 0.017 : 0.03;
    for (let i = 0; i < strands; i++) {
      const a = (i / strands) * TAU + rand() * 0.4, c = Math.cos(a), sn = Math.sin(a);
      const len = p.trail * (0.4 + 0.6 * rand());
      const pts = [[c * 0.03, soil + 0.012, sn * 0.03], [c * (potR + 0.004), soil + 0.022, sn * (potR + 0.004)], [c * (potR + 0.02), potY + potH * 0.7, sn * (potR + 0.02)]];
      for (let j = 1; j <= 4; j++) { const f = j / 4; pts.push([c * (potR + 0.025 + 0.015 * f) + 0.012 * Math.sin(f * 5 + i), potY + potH * 0.7 - (len + potH * 0.7) * f, sn * (potR + 0.025 + 0.015 * f) + 0.012 * Math.cos(f * 4 + i)]); }
      const cv = curveOf(pts);
      k.tube('threads', 'plant-leaf', null, 0.0008, { curve: cv, segs: k.seg(24, 8), radial: 3, ...STEM });
      const L = cv.getLength();
      for (let d = 0.02; d < L; d += step * (0.85 + 0.3 * rand())) {
        const at = cv.getPointAt(d / L);
        k.sphere('pearls', 'plant-leaf-light', 0.0046, at.x + (rand() - 0.5) * 0.004, at.y, at.z + (rand() - 0.5) * 0.004, { segs: k.hi ? 6 : 4, rings: k.hi ? 4 : 3, ...C('#7aa24a') });
      }
    }
    // a mound of pearls on the soil
    for (let i = 0; i < (k.hi ? 36 : 14); i++) { const a = rand() * TAU, r = potR * 0.85 * Math.sqrt(rand()); k.sphere('pearls', 'plant-leaf-light', 0.0046, Math.cos(a) * r, soil + 0.005 + rand() * 0.012, Math.sin(a) * r, { segs: k.hi ? 6 : 4, rings: k.hi ? 4 : 3, ...C('#7aa24a') }); }
    recentre(k);
    return k.group();
  },
});

const kokedama = item({
  id: 'plant-kokedama', category: 'plants', placement: 'ceiling', ko: '코케다마(이끼볼)', en: 'Kokedama moss ball', size: [0.24, 0.85, 0.24], elevation: 2.4 - 0.85,
  bboxSlack: [0.05, 0.04, 0.05],
  params: [
    P.len('hanger', '줄 길이', 'Hanger length', 0.5, 0.2, 1.2),
    P.len('ball', '이끼볼 지름', 'Ball diameter', 0.14, 0.08, 0.25),
    seedP(),
  ],
  tags: ['kokedama', 'moss ball', 'hanging', '코케다마', '이끼볼', '이끼', '행잉 플랜트'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 181);
    const R = p.ball / 2, cy = R;
    k.add('moss', 'plant-leaf', blobGeo(R, { segs: k.seg(20, 10), rings: k.seg(14, 7), amp: 0.06, freq: 30, seed: p.seed }).translate(0, cy, 0), C('#577a36'));
    // twine wrapped around the ball
    for (let i = 0; i < 4; i++) {
      const g = new THREE.TorusGeometry(R * 1.04, 0.0016, 3, k.seg(28, 12)).rotateX(Math.PI / 2 + (i - 1.5) * 0.5).rotateY(i * 0.8);
      k.add('twine', 'fabric-linen-beige', g.translate(0, cy, 0));
    }
    // peperomia on top: round, thick leaves on short stems
    const topY = cy + R * 0.92;
    for (let i = 0; i < (k.hi ? 14 : 8); i++) {
      const yaw = i * GOLD, f = i / 14;
      const c = petiole([Math.sin(yaw) * 0.01, topY, Math.cos(yaw) * 0.01], yaw, 1.3 - 0.8 * f, 0.05 + 0.04 * rand(), 0.1);
      k.tube('stems', 'plant-leaf', null, 0.002, { curve: c, segs: k.seg(6, 3), radial: 4, ...C('#7a5a5a') });
      const [py, pp] = endAngles(c);
      k.add('leaves', 'plant-leaf', placeLeaf(leafPart(0.05, 0.042, { nu: k.hi ? 3 : 2, nv: k.hi ? 4 : 2, droop: 0.15, fold: 0.15, outline: ROUND }), c.getPointAt(1).toArray(), py, pp * 0.3, 0), C('#2f5a2c'));
    }
    // three strings from the equator meet above the plant, then one line up to the hook
    const meet = cy + R + 0.16;
    const top = meet + p.hanger;
    k.cyl('hanger', 'metal-black', 0.022, 0.022, 0.006, 0, top - 0.006, 0, { segs: k.seg(14, 6) });
    k.rod('cords', 'fabric-linen-beige', [0, meet, 0], [0, top - 0.006, 0], 0.0018, { segs: 4 });
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.3; k.rod('cords', 'fabric-linen-beige', [Math.cos(a) * R * 1.03, cy, Math.sin(a) * R * 1.03], [0, meet, 0], 0.0016, { segs: 4 }); }
    recentre(k);
    return k.group();
  },
});

const pothosShelf = item({
  id: 'pothos-wall-shelf', category: 'plants', placement: 'wall', elevation: 1.0, ko: '스킨답서스 벽 선반', en: 'Pothos on wall shelf', size: [0.556, 0.746, 0.297],
  bboxSlack: [0.08, 0.08, 0.04],
  params: [
    P.len('trail', '늘어짐', 'Trailing length', 0.65, 0.2, 1.2),
    P.mat('shelf', '선반', 'Shelf', 'wood-oak', 'wood'),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['pothos', 'golden pothos', 'wall shelf', '스킨답서스', '포토스', '벽 선반', '덩굴 식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 191);
    const Y = p.trail + 0.05, D = 0.2, W = 0.42;
    const back = -D / 2;
    k.box('shelf', p.shelf, W, 0.024, D, 0, Y - 0.012, 0, { r: 0.003 });
    for (const sx of [-1, 1]) {
      k.box('brackets', 'metal-black', 0.018, 0.14, 0.004, sx * W * 0.35, Y - 0.024 - 0.07, back + 0.002, { r: 0.001 });
      k.box('brackets', 'metal-black', 0.018, 0.004, D * 0.8, sx * W * 0.35, Y - 0.026, back + D * 0.4, { r: 0.001 });
      k.rod('brackets', 'metal-black', [sx * W * 0.35, Y - 0.15, back + 0.004], [sx * W * 0.35, Y - 0.028, back + D * 0.7], 0.0035, { segs: 5 });
    }
    const px = 0.06, potR = 0.075, potH = 0.12;
    const soil = addPot(k, { r: potR, h: potH, style: 'cylinder', mat: p.potMaterial, x: px, y0: Y });
    const vines = k.hi ? 8 : 5;
    const leafAt = (pos, yaw, pitch, roll, L) => {
      const light = rand() < 0.35;
      k.add(light ? 'leaves-variegated' : 'leaves', 'plant-leaf', placeLeaf(leafPart(L, L * 0.75, { nu: k.hi ? 3 : 2, nv: k.hi ? 4 : 2, droop: 0.3, fold: 0.15, outline: HEART }), pos, yaw, pitch, roll), C(light ? '#b8bf5c' : '#3f7a32'));
    };
    for (let i = 0; i < vines; i++) {
      // vines spill over the front and sides of the shelf
      const a = -Math.PI / 2 + (i / (vines - 1)) * Math.PI + (rand() - 0.5) * 0.3;
      const c = Math.sin(a), sn = Math.cos(a);
      const len = p.trail * (0.45 + 0.55 * rand()) * (Math.abs(c) > 0.7 ? 0.7 : 1);
      const lip = [px + c * (potR + 0.02), Y + potH * 0.7, sn * (potR + 0.02)];
      const edge = [px + c * (potR + 0.06), Y + 0.015, Math.min(D / 2 + 0.015, sn * (potR + 0.1) + 0.02)];
      if (Math.abs(c) > 0.85) edge[0] = Math.sign(c) * (W / 2 + 0.01);
      else edge[2] = D / 2 + 0.012;
      const pts = [[px + c * 0.03, soil + 0.01, sn * 0.03], [px + c * (potR + 0.005), soil + 0.03, sn * (potR + 0.005)], lip, edge];
      for (let j = 1; j <= 3; j++) { const f = j / 3; pts.push([edge[0] + 0.03 * Math.sin(f * 4 + i) + c * 0.02 * f, Y - len * f, edge[2] + 0.02 * f + 0.01 * Math.cos(f * 3 + i)]); }
      const cv = curveOf(pts);
      k.tube('vines', 'plant-leaf', null, 0.002, { curve: cv, segs: k.seg(26, 8), radial: 3, ...STEM });
      const nL = Math.round((k.hi ? 15 : 7) * (0.5 + len / p.trail * 0.5));
      for (let j = 0; j < nL; j++) {
        const t = 0.08 + 0.9 * (j / nL), at = cv.getPointAt(t), side = j % 2 ? 1 : -1;
        const L = 0.06 * (1.1 - 0.35 * t) + rand() * 0.012;
        const hanging = at.y < Y;
        leafAt(at.toArray(), (hanging ? 0 : a) + side * 0.9 + (rand() - 0.5) * 0.4, hanging ? -0.6 - rand() * 0.4 : 0.2 + rand() * 0.3, side * 0.4, L);
      }
    }
    for (let i = 0; i < (k.hi ? 12 : 6); i++) { const a = i * GOLD, r = 0.02 + 0.05 * rand(); leafAt([px + Math.cos(a) * r, soil + 0.02 + rand() * 0.05, Math.sin(a) * r], Math.atan2(Math.cos(a), Math.sin(a)), 0.3 + rand() * 0.4, 0, 0.065); }
    recentre(k);
    return k.group();
  },
});

const staghornFern = item({
  id: 'staghorn-fern-board', category: 'plants', placement: 'wall', elevation: 1.2, ko: '박쥐란 벽걸이', en: 'Mounted staghorn fern', size: [0.52, 0.566, 0.203],
  bboxSlack: [0.12, 0.1, 0.1],
  params: [
    P.mat('board', '판', 'Board', 'wood-oak', 'wood'),
    seedP(),
  ],
  tags: ['staghorn fern', 'platycerium', 'mounted', '박쥐란', '플라티케리움', '벽걸이 식물', '고사리'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 193);
    const bw = 0.34, bh = 0.44, bt = 0.025;
    const by = 0.3;
    k.rbox('board', p.board, bw, bh, bt, 0.006, 0, by + bh / 2, 0);
    k.add('hook', 'metal-black', new THREE.TorusGeometry(0.012, 0.0015, 4, k.seg(12, 6)).translate(0, by + bh + 0.008, -0.002));
    const fz = bt / 2;
    const cy = by + bh * 0.45;
    // moss pad wired to the board
    k.add('moss', 'plant-leaf', blobGeo(0.085, { segs: k.seg(16, 8), rings: k.seg(10, 6), amp: 0.12, scale: [1, 0.8, 0.45], seed: 3 }).translate(0, cy, fz + 0.02), C('#5d7536'));
    // round shield fronds clasping the mount
    for (let i = 0; i < 4; i++) {
      const a = -0.6 + i * 0.45 + (rand() - 0.5) * 0.2;
      const g = leafPart(0.14, 0.15, { nu: k.hi ? 4 : 2, nv: k.hi ? 4 : 2, droop: -0.15, fold: -0.25, outline: ROUND });
      k.add('shields', 'plant-leaf', frameOrient(g, [Math.sin(a) * 0.05, cy - 0.06, fz + 0.03 + i * 0.004], V3(Math.sin(a), Math.cos(a), 0.25), V3(0, 0, 1)), C('#8c8a58'));
    }
    // antler fronds: a broad wedge splitting into two or three forks
    const antlers = [[0.5, 0.9], [-0.6, 0.75], [2.3, -0.2], [-2.4, -0.25], [3.1, -0.5], [1.4, 0.15]];
    for (const [ang, liftUp] of antlers) {
      const dir = V3(Math.sin(ang) * 0.8, Math.cos(ang) * 0.6 + liftUp * 0.3, 0.55).normalize();
      const nrm = V3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
      const base = V3(0, cy, fz + 0.04);
      const L0 = 0.13 + 0.04 * rand();
      k.add('antlers', 'plant-leaf-light', frameOrient(leafPart(L0, 0.075, { nu: k.hi ? 3 : 2, nv: k.hi ? 3 : 2, droop: 0.15, fold: 0.1, outline: (t) => 0.35 + 0.65 * t }), base, dir, nrm), C('#6f8f58'));
      const split = base.clone().addScaledVector(dir, L0 * 0.97).add(V3(0, -0.15 * L0 * 0.9, 0));
      const forks = 2 + (rand() < 0.5 ? 1 : 0);
      for (let f = 0; f < forks; f++) {
        const fd = dir.clone().applyAxisAngle(nrm, (f - (forks - 1) / 2) * 0.55);
        fd.y -= 0.25;
        const L = 0.12 + 0.08 * rand();
        k.add('antlers', 'plant-leaf-light', frameOrient(leafPart(L, 0.032, { nu: k.hi ? 2 : 1, nv: k.hi ? 4 : 2, droop: 0.3, fold: 0.1, outline: (t) => Math.min(1, (1 - t) * 2.2) ** 0.7 }), split, fd, nrm), C('#6f8f58'));
      }
    }
    recentre(k);
    return k.group();
  },
});

const mossWall = item({
  id: 'plant-moss-wall', category: 'plants', placement: 'wall', elevation: 1.1, ko: '이끼 액자(모스 월)', en: 'Moss wall panel', size: [0.8, 0.6, 0.08],
  bboxSlack: [0.02, 0.02, 0.03],
  params: [
    P.len('width', '폭', 'Width', 0.8, 0.3, 1.6),
    P.len('height', '높이', 'Height', 0.6, 0.3, 1.2),
    P.mat('frame', '액자', 'Frame', 'wood-oak', 'wood'),
    seedP(),
  ],
  tags: ['moss wall', 'preserved moss', 'green wall', '이끼 액자', '모스 월', '이끼', '벽 장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 197);
    const W = p.width, H = p.height, D = 0.05, fw = 0.03;
    k.box('frame', p.frame, W, fw, D, 0, fw / 2, 0, { r: 0.003 });
    k.box('frame', p.frame, W, fw, D, 0, H - fw / 2, 0, { r: 0.003 });
    for (const sx of [-1, 1]) k.box('frame', p.frame, fw, H - 2 * fw, D, sx * (W / 2 - fw / 2), H / 2, 0, { r: 0.003 });
    k.box('frame', p.frame, W - 2 * fw + 0.002, H - 2 * fw + 0.002, 0.008, 0, H / 2, -D / 2 + 0.004, { r: 0 });
    const greens = [['moss-cushion', '#4f7330'], ['moss-reindeer', '#93a64e'], ['moss-dark', '#33502a']];
    const iw = W - 2 * fw - 0.02, ih = H - 2 * fw - 0.02;
    const cell = k.hi ? 0.075 : 0.12;
    const nx = Math.max(2, Math.round(iw / cell)), ny = Math.max(2, Math.round(ih / cell));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = -iw / 2 + (i + 0.5 + (rand() - 0.5) * 0.6) * iw / nx;
      const y = fw + 0.01 + (j + 0.5 + (rand() - 0.5) * 0.6) * ih / ny;
      const r = Math.min(iw / nx, ih / ny) * (0.6 + 0.35 * rand());
      const [role, col] = greens[Math.floor(rand() * 3)];
      const g = blobGeo(r, { segs: k.seg(10, 6), rings: k.seg(7, 4), amp: role === 'moss-reindeer' ? 0.25 : 0.1, freq: 26, scale: [1, 1, 0.35], seed: i * 7 + j });
      g.translate(clamp(x, -iw / 2 + r * 0.6, iw / 2 - r * 0.6), clamp(y, fw + r * 0.6, H - fw - r * 0.6), -D / 2 + 0.012 + r * 0.12 + rand() * 0.008);
      k.add(role, 'plant-leaf', g, C(col));
    }
    recentre(k);
    return k.group();
  },
});

/* ============================================================ flowering */

const orchid = item({
  id: 'phalaenopsis-orchid', category: 'plants', placement: 'surface', ko: '호접란', en: 'Phalaenopsis orchid', size: [0.481, 0.531, 0.293],
  bboxSlack: [0.08, 0.05, 0.08],
  params: [
    P.color('flowerColor', '꽃 색', 'Flower colour', '#f6f1f3'),
    P.color('lipColor', '입술 꽃잎 색', 'Lip colour', '#d9a23d'),
    P.int('flowers', '꽃 수', 'Flowers', 7, 3, 10),
    potMat('ceramic-white'),
    seedP(),
  ],
  tags: ['orchid', 'phalaenopsis', 'moth orchid', '호접란', '난초', '서양란', '꽃'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 199);
    const soil = addPot(k, { r: 0.065, h: 0.12, style: 'cylinder', mat: p.potMaterial, soil: false });
    // bark mulch
    for (let i = 0; i < (k.hi ? 26 : 10); i++) { const a = rand() * TAU, r = 0.052 * Math.sqrt(rand()); k.box('bark', 'plant-stem', 0.014, 0.005, 0.01, Math.cos(a) * r, soil - 0.004 + rand() * 0.004, Math.sin(a) * r, { r: 0.001, ry: rand() * 3, rx: (rand() - 0.5) * 0.5, ...C('#6e4a2c') }); }
    k.cyl('bark', 'soil', 0.06, 0.06, 0.01, 0, soil - 0.012, 0, { segs: k.seg(20, 8) });
    // broad leaves in two opposite ranks
    for (let i = 0; i < 4; i++) {
      const yaw = (i % 2 ? Math.PI : 0) + 0.3 + (rand() - 0.5) * 0.5 + Math.PI / 2;
      const L = 0.15 + 0.03 * i;
      k.add('leaves', 'plant-leaf', placeLeaf(leafPart(L, L * 0.42, { nu: k.hi ? 4 : 2, nv: k.hi ? 5 : 3, droop: 0.4, fold: 0.14, outline: OVAL }), [0, soil + 0.01 + i * 0.004, 0], yaw, 0.35, 0), C('#2f5b2d'));
    }
    for (let i = 0; i < 3; i++) { const a = i * 2.1; k.tube('roots', 'plant-leaf', [[0, soil + 0.005, 0], [Math.cos(a) * 0.05, soil + 0.025, Math.sin(a) * 0.05], [Math.cos(a) * 0.075, soil - 0.01, Math.sin(a) * 0.075], [Math.cos(a) * 0.085, soil - 0.05, Math.sin(a) * 0.08]], 0.0028, { segs: k.seg(10, 4), radial: 4, ...C('#a9b597') }); }
    // stake and flower spike arching forward
    const stakeTop = soil + 0.36;
    k.rod('stake', 'wood-pine', [-0.012, soil - 0.03, -0.01], [-0.012, stakeTop, -0.01], 0.0022, { segs: 5 });
    const spike = curveOf([[0, soil, 0], [-0.008, soil + 0.15, -0.006], [-0.009, stakeTop - 0.02, -0.006], [0, stakeTop + 0.04, 0.04], [0.01, stakeTop + 0.02, 0.15], [0.012, stakeTop - 0.03, 0.22]]);
    k.tube('spike', 'plant-leaf', null, 0.0022, { curve: spike, segs: k.seg(26, 8), radial: 4, ...C('#5d6e3c') });
    const n = p.flowers;
    for (let i = 0; i < n; i++) {
      const t = 0.55 + 0.42 * (i / Math.max(1, n - 1));
      const at = spike.getPointAt(t);
      const size = 0.05 * (1 - 0.35 * (i / n));
      if (i >= n - 2) { k.sphere('buds', 'plant-leaf', size * 0.3, at.x, at.y - 0.012, at.z, { segs: k.seg(8, 5), rings: k.seg(6, 4), scale: [1, 1.2, 1], ...C(p.flowerColor) }); continue; }
      const facing = V3(Math.sin((i - n / 2) * 0.7) * 0.8, 0.1, 1).normalize();
      const c0 = at.clone().add(V3(0, -0.02, 0)).addScaledVector(facing, 0.004);
      const petals = [];
      // three sepals, two broad petals, the lip and the column
      for (const phi of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) petals.push([phi, size * 0.9, size * 0.55, OVAL_TIP]);
      for (const phi of [0.15, Math.PI - 0.15]) petals.push([phi, size, size * 1.05, ROUND]);
      for (const [phi, L, Wd, ol] of petals) {
        const g = leafPart(L, Wd, { nu: k.hi ? 3 : 2, nv: k.hi ? 3 : 2, droop: -0.12, fold: 0.15, outline: ol });
        const along = V3(Math.cos(phi), Math.sin(phi), 0);
        // the flower plane faces `facing`
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), facing);
        k.add('flowers', 'plant-leaf', frameOrient(g, c0, along.applyQuaternion(q), facing), C(p.flowerColor));
      }
      const lip = leafPart(size * 0.6, size * 0.4, { nu: 2, nv: 2, droop: -0.3, fold: 0.6, outline: OVAL_TIP });
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), facing);
      k.add('lips', 'plant-leaf', frameOrient(lip, c0.clone().addScaledVector(facing, 0.004), V3(0, -1, 0.3).applyQuaternion(q), facing), C(p.lipColor));
      k.rod('spike', 'plant-leaf', at.toArray(), c0.toArray(), 0.0015, { segs: 3, ...C('#5d6e3c') });
    }
    recentre(k);
    return k.group();
  },
});

const koreanOrchid = item({
  id: 'korean-orchid', category: 'plants', placement: 'surface', ko: '동양란(청자 화분)', en: 'Korean orchid in celadon pot', size: [0.75, 0.5, 0.6],
  bboxSlack: [0.12, 0.06, 0.12],
  params: [
    P.color('glaze', '화분 색', 'Glaze colour', '#9dbfab'),
    P.int('leaves', '잎 수', 'Leaves', 14, 6, 22),
    P.bool('flowers', '꽃', 'Flowers', true),
    seedP(),
  ],
  tags: ['korean orchid', 'cymbidium', 'orchid', '동양란', '난초', '춘란', '청자', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 211 + p.leaves);
    // tall celadon pot with a foot ring and a flared lip
    const prof = [[0, 0], [0.05, 0], [0.052, 0.006], [0.047, 0.012], [0.058, 0.04], [0.072, 0.11], [0.076, 0.165], [0.082, 0.175], [0.08, 0.18], [0.072, 0.178], [0.068, 0.165], [0, 0.165]];
    k.lathe('pot', 'ceramic-white', prof, 0, 0, 0, { segs: k.seg(40, 12), ...C(p.glaze) });
    const soil = 0.168;
    k.add('moss', 'plant-leaf-light', blobGeo(0.066, { segs: k.seg(16, 8), rings: k.seg(8, 4), amp: 0.08, scale: [1, 0.12, 1], seed: 2 }).translate(0, soil, 0), C('#6f8a3a'));
    // long, narrow leaves that rise and then bow over in calligraphic arcs
    for (let i = 0; i < p.leaves; i++) {
      const yaw = i * GOLD + rand() * 0.3;
      const L = 0.26 + 0.16 * rand();
      const g = leafPart(L, 0.016, { nu: 1, nv: k.hi ? 12 : 5, droop: 0.3 + 0.4 * rand(), fold: 0.6, twist: (rand() - 0.5) * 1.6, outline: STRAP });
      k.add('leaves', 'plant-leaf', placeLeaf(g, [Math.sin(yaw) * 0.012, soil, Math.cos(yaw) * 0.012], yaw, 1.05 + 0.35 * rand(), 0), C('#2f5228'));
    }
    if (p.flowers) {
      for (let s = 0; s < 2; s++) {
        const a = s * 2.6 + 0.4;
        const top = [Math.sin(a) * 0.05, soil + 0.22 + 0.05 * s, Math.cos(a) * 0.05];
        k.tube('stalks', 'plant-leaf-light', [[0, soil, 0], [top[0] * 0.5, soil + 0.12, top[2] * 0.5], top], 0.0016, { segs: k.seg(8, 3), radial: 3, ...C('#9aa66a') });
        for (let f = 0; f < 3; f++) {
          const c0 = toV(top).add(V3(0, -f * 0.035, 0));
          const facing = V3(Math.sin(a + f * 1.2), -0.2, Math.cos(a + f * 1.2)).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), facing);
          for (let t = 0; t < 5; t++) {
            const phi = Math.PI / 2 + t * TAU / 5;
            const g = leafPart(0.026, 0.008, { nu: 1, nv: k.hi ? 3 : 2, droop: 0.15, fold: 0.3, outline: LANCE });
            k.add('flowers', 'plant-leaf-light', frameOrient(g, c0, V3(Math.cos(phi), Math.sin(phi), 0.4).applyQuaternion(q), facing), C('#d6dc9a'));
          }
          k.add('flowers-lip', 'plant-leaf', frameOrient(leafPart(0.012, 0.01, { nu: 1, nv: 2, droop: 0.3, fold: 0.3, outline: ROUND }), c0, V3(0, -1, 0.6).applyQuaternion(q), facing), C('#b0405a'));
        }
      }
    }
    recentre(k);
    return k.group();
  },
});

const lavender = item({
  id: 'lavender-pot', category: 'plants', placement: 'surface', ko: '라벤더 화분', en: 'Lavender pot', size: [0.32, 0.45, 0.32],
  bboxSlack: [0.06, 0.04, 0.06],
  params: [
    P.int('stems', '꽃대 수', 'Flower stems', 36, 12, 60),
    P.color('flowerColor', '꽃 색', 'Flower colour', '#7b5fae'),
    potMat('ceramic-terracotta'),
    seedP(),
  ],
  tags: ['lavender', 'herb', 'flower', '라벤더', '허브', '꽃', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 223 + p.stems);
    const soil = addPot(k, { r: 0.1, h: 0.15, style: 'taper', mat: p.potMaterial });
    // grey-green needle foliage mound
    for (let i = 0; i < (k.hi ? 60 : 24); i++) {
      const yaw = i * GOLD, r = 0.07 * Math.sqrt(rand());
      k.add('foliage', 'plant-leaf', placeLeaf(leafPart(0.06 + 0.03 * rand(), 0.006, { nu: 1, nv: 2, droop: 0.2, fold: 0.3, outline: STRAP }), [Math.sin(yaw) * r, soil, Math.cos(yaw) * r], yaw, 0.5 + 0.8 * rand(), 0), C('#8a9a7c'));
    }
    const n = k.hi ? p.stems : Math.ceil(p.stems / 2);
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.3, r = 0.04 * Math.sqrt(rand());
      const base = V3(Math.sin(yaw) * r, soil, Math.cos(yaw) * r);
      const dir = dirOf(yaw, Math.PI / 2 - (0.12 + 0.35 * (r / 0.04)) - rand() * 0.1);
      const len = 0.2 + 0.08 * rand();
      const tip = base.clone().addScaledVector(dir, len);
      k.rod('stems', 'plant-leaf', base.toArray(), tip.toArray(), 0.0013, { segs: 3, ...C('#7d8f62') });
      // spike of small whorls of florets
      const whorls = k.hi ? 6 : 3;
      for (let w = 0; w < whorls; w++) {
        const pt = tip.clone().addScaledVector(dir, -0.055 * (w / whorls));
        const rr = 0.0052 * (1 - 0.35 * (w === 0 ? 1 : 0)) * (k.hi ? 1 : 1.3);
        k.add('flowers', 'plant-leaf', new THREE.SphereGeometry(rr, k.hi ? 5 : 4, 3).scale(1, 1.5, 1).translate(pt.x, pt.y, pt.z), C(p.flowerColor));
      }
    }
    recentre(k);
    return k.group();
  },
});

const hydrangea = item({
  id: 'hydrangea', category: 'plants', ko: '수국', en: 'Hydrangea', size: [0.622, 0.795, 0.534],
  bboxSlack: [0.12, 0.06, 0.12],
  params: [
    P.len('height', '높이', 'Height', 0.8, 0.45, 1.3),
    P.color('flowerColor', '꽃 색', 'Flower colour', '#8ea6dd'),
    potMat('ceramic-matte'),
    seedP(),
  ],
  tags: ['hydrangea', 'flower', 'shrub', '수국', '꽃', '관목', '화분'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const s = p.height / 0.8;
    const soil = addPot(k, { r: 0.14, h: 0.22, style: 'belly', mat: p.potMaterial });
    const rand = rng(p.seed * 227);
    const n = k.hi ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const yaw = i * GOLD + rand() * 0.4;
      const lean = i === 0 ? 0.05 : 0.35 + 0.25 * rand();
      const h = (p.height - soil - 0.07) * (0.8 + 0.2 * rand());
      const tip = V3(Math.sin(yaw) * Math.sin(lean) * h, soil + Math.cos(lean) * h, Math.cos(yaw) * Math.sin(lean) * h);
      const c = curveOf([[Math.sin(yaw) * 0.02, soil - 0.01, Math.cos(yaw) * 0.02], [tip.x * 0.3, soil + (tip.y - soil) * 0.55, tip.z * 0.3], tip]);
      k.tube('stems', 'plant-leaf', null, 0.004, { curve: c, segs: k.seg(10, 4), radial: 4, ...C('#5a6a3a') });
      for (let j = 0; j < 4; j++) {
        const t = 0.3 + 0.17 * j, at = c.getPointAt(t);
        for (const sd of [0, Math.PI]) {
          const L = (0.14 - 0.015 * j) * Math.sqrt(s);
          k.add('leaves', 'plant-leaf', placeLeaf(leafPart(L, L * 0.6, { nu: k.hi ? 4 : 2, nv: k.hi ? 5 : 3, droop: 0.3, fold: 0.2, wave: 0.02, waves: 12, outline: OVAL_TIP }), at.toArray(), yaw + sd + j * 1.5 + 0.8, -0.1 + rand() * 0.3, 0), C('#3e6a32'));
        }
      }
      // mophead: a domed ball covered with four-petal florets
      const R = (0.075 + 0.02 * rand()) * Math.sqrt(s);
      const cHead = tip.clone().add(V3(0, R * 0.55, 0));
      k.add('flowers', 'plant-leaf', blobGeo(R * 0.92, { segs: k.seg(14, 8), rings: k.seg(10, 6), amp: 0.08, scale: [1, 0.85, 1], seed: i + 2 }).translate(cHead.x, cHead.y, cHead.z), C(p.flowerColor));
      if (k.hi) {
        for (let f = 0; f < 44; f++) {
          const u = rand() * 2 - 1, a = rand() * TAU;
          const nrm = V3(Math.sqrt(1 - u * u) * Math.cos(a), Math.abs(u) * 0.9 + 0.1 * u, Math.sqrt(1 - u * u) * Math.sin(a)).normalize();
          const at = cHead.clone().add(nrm.clone().multiply(V3(R, R * 0.85, R)));
          const tan = V3().crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? V3(1, 0, 0) : UP).normalize();
          for (let q = 0; q < 4; q++) {
            const d = tan.clone().applyAxisAngle(nrm, q * Math.PI / 2 + f);
            k.add('flowers', 'plant-leaf', frameOrient(leafPart(0.014, 0.013, { nu: 1, nv: 1, droop: 0, fold: 0, outline: ROUND }), at, d, nrm), C(p.flowerColor));
          }
        }
      }
    }
    recentre(k);
    return k.group();
  },
});

const tulipsVase = item({
  id: 'plant-tulips-vase', category: 'plants', placement: 'surface', ko: '튤립 꽃병', en: 'Tulips in vase', size: [0.3, 0.45, 0.3],
  bboxSlack: [0.08, 0.05, 0.08],
  params: [
    P.int('stems', '송이 수', 'Stems', 7, 3, 12),
    P.color('flowerColor', '꽃 색', 'Flower colour', '#d23440'),
    seedP(),
  ],
  tags: ['tulips', 'vase', 'flowers', '튤립', '꽃병', '꽃', '생화'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 229 + p.stems);
    // glass vase: round belly, narrow neck, small flared mouth
    const outer = [[0.04, 0], [0.07, 0.03], [0.075, 0.07], [0.055, 0.13], [0.035, 0.17], [0.04, 0.2]];
    const prof = [[0, 0], ...outer, [0.036, 0.2], [0.031, 0.17], [0.051, 0.13], [0.071, 0.07], [0.066, 0.034], [0.036, 0.008], [0, 0.008]];
    k.lathe('vase', 'glass-clear', prof, 0, 0, 0, { segs: k.seg(32, 10) });
    k.lathe('water', 'water', [[0, 0.009], [0.036, 0.009], [0.065, 0.034], [0.07, 0.07], [0.058, 0.11], [0, 0.11]], 0, 0, 0, { segs: k.seg(28, 10) });
    for (let i = 0; i < p.stems; i++) {
      const yaw = i * GOLD + rand() * 0.3;
      const lean = 0.25 + 0.3 * rand();
      const L = 0.2 + 0.08 * rand();
      const neck = [Math.sin(yaw) * 0.012, 0.19, Math.cos(yaw) * 0.012];
      const d = dirOf(yaw, Math.PI / 2 - lean);
      const tip = toV(neck).addScaledVector(d, L).add(V3(0, -0.03 * rand(), 0));
      const c = curveOf([[Math.sin(yaw) * 0.03, 0.012, Math.cos(yaw) * 0.03], [Math.sin(yaw) * 0.015, 0.1, Math.cos(yaw) * 0.015], neck, toV(neck).addScaledVector(d, L * 0.5).toArray(), tip.toArray()]);
      k.tube('stems', 'plant-leaf-light', null, 0.0032, { curve: c, segs: k.seg(16, 6), radial: 4, ...C('#6f9a4a') });
      // one long leaf hugging each stem
      k.add('leaves', 'plant-leaf-light', placeLeaf(leafPart(0.14, 0.026, { nu: k.hi ? 2 : 1, nv: k.hi ? 5 : 3, droop: 0.4, fold: 0.5, outline: LANCE }), neck, yaw + 0.4, 1.1 - lean, 0), C('#7a9e5a'));
      // cup of six tepals around the stem axis
      const ax = c.getTangentAt(1);
      const side = V3().crossVectors(ax, UP).normalize();
      for (let t = 0; t < 6; t++) {
        const r = side.clone().applyAxisAngle(ax, t * Math.PI / 3 + (t % 2) * 0.1);
        const along = ax.clone().multiplyScalar(Math.cos(0.32)).addScaledVector(r, Math.sin(0.32));
        const g = leafPart(0.052 - (t % 2) * 0.004, 0.034, { nu: k.hi ? 3 : 2, nv: k.hi ? 4 : 2, droop: -0.18, fold: 0.6, outline: OVAL });
        k.add('flowers', 'plant-leaf', frameOrient(g, tip.clone().addScaledVector(r, -0.004), along, r.clone().negate()), C(p.flowerColor));
      }
    }
    recentre(k);
    return k.group();
  },
});

const cherryBranches = item({
  id: 'plant-cherry-branches', category: 'plants', ko: '벚꽃 가지 화병', en: 'Cherry blossom branches', size: [0.613, 1.35, 0.518],
  bboxSlack: [0.15, 0.08, 0.15],
  params: [
    P.len('height', '높이', 'Height', 1.45, 0.9, 2.0),
    P.mat('vase', '화병', 'Vase', 'ceramic-white', 'ceramic'),
    P.color('blossom', '꽃 색', 'Blossom colour', '#f3c3d1'),
    seedP(),
  ],
  tags: ['cherry blossom', 'branches', 'vase', '벚꽃', '꽃가지', '화병', '봄'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 233);
    const H = p.height;
    const vh = 0.45;
    k.lathe('vase', p.vase, [[0, 0], [0.07, 0], [0.075, 0.01], [0.11, 0.12], [0.115, 0.22], [0.085, 0.36], [0.06, 0.42], [0.068, vh], [0.06, vh], [0.05, 0.42], [0, 0.42]], 0, 0, 0, { segs: k.seg(36, 10), smooth: 24 });
    const bark = C('#4a3a30');
    const blossomGeo = () => {
      const parts = [];
      for (let q = 0; q < 5; q++) parts.push(frameOrient(leafPart(0.016, 0.015, { nu: 1, nv: k.hi ? 2 : 1, droop: -0.2, fold: 0.1, outline: ROUND }), [0, 0, 0], V3(Math.cos(q * TAU / 5), Math.sin(q * TAU / 5), 0.35), V3(0, 0, 1)));
      return mergeGeometries(parts, false);
    };
    const bloomOn = (c, from, count) => {
      for (let i = 0; i < count; i++) {
        const t = from + (1 - from) * rand(), at = c.getPointAt(t);
        const nrm = V3(rand() - 0.5, rand() * 0.8 + 0.2, rand() - 0.5).normalize();
        const g = blossomGeo();
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), nrm);
        g.applyQuaternion(q).translate(at.x + nrm.x * 0.008, at.y + nrm.y * 0.008, at.z + nrm.z * 0.008);
        k.add('blossoms', 'plant-leaf', g, C(p.blossom));
      }
    };
    const nB = 4;
    for (let b = 0; b < nB; b++) {
      const a = b * GOLD + rand() * 0.5;
      const lean = 0.2 + 0.25 * rand();
      const top = V3(Math.sin(a) * Math.sin(lean) * (H - vh), H * (0.82 + 0.18 * rand()), Math.cos(a) * Math.sin(lean) * (H - vh) * 0.7);
      const c = curveOf([[Math.sin(a) * 0.01, 0.1, Math.cos(a) * 0.01], [Math.sin(a) * 0.02, vh, Math.cos(a) * 0.02], [top.x * 0.4 + (rand() - 0.5) * 0.06, lerp(vh, top.y, 0.45), top.z * 0.4], [top.x * 0.75 + (rand() - 0.5) * 0.06, lerp(vh, top.y, 0.75), top.z * 0.75], top]);
      taper(k, 'branches', 'plant-stem', c, 0.011, 0.003, { nu: 6, nv: 18, ov: bark });
      bloomOn(c, 0.45, k.hi ? 45 : 16);
      for (let tw = 0; tw < 3; tw++) {
        const t = 0.45 + 0.17 * tw + rand() * 0.1, at = c.getPointAt(t);
        const ya = a + (rand() - 0.5) * 2.5;
        const end = at.clone().add(V3(Math.sin(ya) * 0.15, 0.1 + 0.08 * rand(), Math.cos(ya) * 0.15));
        const tc = new THREE.CatmullRomCurve3([at, at.clone().lerp(end, 0.5).add(V3(0, 0.02, 0)), end]);
        taper(k, 'branches', 'plant-stem', tc, 0.004, 0.0015, { nu: 4, nv: 5, ov: bark });
        bloomOn(tc, 0.3, k.hi ? 14 : 5);
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ======================================================= arrangements */

const airPlants = item({
  id: 'air-plants-driftwood', category: 'plants', placement: 'surface', ko: '틸란드시아 유목 장식', en: 'Air plants on driftwood', size: [0.45, 0.14, 0.14],
  bboxSlack: [0.05, 0.04, 0.05],
  params: [
    P.int('plants', '포기 수', 'Plants', 4, 2, 6),
    seedP(),
  ],
  tags: ['air plant', 'tillandsia', 'driftwood', '틸란드시아', '에어플랜트', '유목', '장식'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 239 + p.plants);
    const wood = C('#a59c8c');
    const log = curveOf([[-0.22, 0.03, 0.02], [-0.1, 0.028, -0.01], [0.02, 0.034, 0.012], [0.12, 0.026, -0.008], [0.21, 0.035, 0.01]]);
    k.add('driftwood', 'wood-ash', alongGeo(log, (b, an) => lerp(0.03, 0.016, b) * (1 + 0.12 * Math.sin(an * 3 + b * 9)), k.seg(12, 6), k.seg(24, 8), { cap: 0.05 }).geo, wood);
    const stub = curveOf([[0.05, 0.035, 0.0], [0.09, 0.06, 0.04], [0.14, 0.07, 0.06]]);
    taper(k, 'driftwood', 'wood-ash', stub, 0.01, 0.004, { nu: 6, nv: 6, ov: wood, cap: true });
    for (let i = 0; i < p.plants; i++) {
      const t = 0.12 + 0.76 * (i / Math.max(1, p.plants - 1));
      const at = log.getPointAt(t);
      const r = lerp(0.03, 0.016, t);
      const base = [at.x, at.y + r * 0.9, at.z];
      const n = k.hi ? 18 : 9;
      const L = 0.06 + 0.03 * rand();
      for (let j = 0; j < n; j++) {
        const yaw = j * GOLD + rand() * 0.3;
        k.add('tillandsia', 'plant-leaf-light', placeLeaf(leafPart(L * (0.7 + 0.4 * rand()), 0.009, { nu: 1, nv: k.hi ? 4 : 2, droop: -0.1 + 0.4 * rand(), curl: 0.3 * rand(), fold: 0.5, twist: (rand() - 0.5) * 2, outline: STRAP }), base, yaw, 0.3 + 0.9 * rand(), 0), C('#a8bba2'));
      }
      if (i === 1) {
        for (let j = 0; j < 4; j++) k.add('bloom', 'plant-leaf', placeLeaf(leafPart(0.035, 0.008, { nu: 1, nv: 2, droop: 0, fold: 0.6, outline: LANCE }), base, j * 1.6, 1.25, 0), C('#e2507c'));
        k.add('bloom-petals', 'plant-leaf', blobGeo(0.005, { segs: 6, rings: 4, amp: 0.2, scale: [1, 1.6, 1] }).translate(base[0], base[1] + 0.04, base[2]), C('#6a3aa0'));
      }
    }
    recentre(k);
    return k.group();
  },
});

const terrarium = item({
  id: 'plant-terrarium', category: 'plants', placement: 'surface', ko: '유리 테라리움', en: 'Glass terrarium', size: [0.28, 0.25, 0.28],
  bboxSlack: [0.02, 0.02, 0.02],
  params: [
    P.len('diameter', '지름', 'Diameter', 0.28, 0.18, 0.4),
    seedP(),
  ],
  tags: ['terrarium', 'glass bowl', 'moss', '테라리움', '유리', '이끼', '미니 정원'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 241);
    const R = p.diameter / 2, wall = 0.003;
    // glass globe cut flat at the bottom and open at the top
    const cy = R * 0.82;
    const th0 = Math.acos(cy / R), th1 = Math.PI - 0.75;
    const prof = [];
    const steps = k.hi ? 20 : 8;
    prof.push([0, 0]);
    for (let i = 0; i <= steps; i++) { const th = th0 + (th1 - th0) * i / steps; prof.push([R * Math.sin(th), cy - R * Math.cos(th)]); }
    for (let i = steps; i >= 0; i--) { const th = th0 + (th1 - th0) * i / steps; prof.push([(R - wall) * Math.sin(th), Math.max(wall, cy - (R - wall) * Math.cos(th))]); }
    prof.push([0, wall]);
    k.lathe('glass', 'glass-clear', prof, 0, 0, 0, { segs: k.seg(36, 12) });
    const rin = (y) => Math.sqrt(Math.max(0, (R - wall - 0.002) ** 2 - (y - cy) ** 2));
    const layer = (role, mat, y0, y1, ov) => k.lathe(role, mat, [[0, y0], [rin(y0), y0], [rin((y0 + y1) / 2), (y0 + y1) / 2], [rin(y1), y1], [0, y1]], 0, 0, 0, { segs: k.seg(32, 10), ...ov });
    const yP = 0.03, yS = 0.07;
    layer('pebbles', 'travertine', wall + 0.001, yP);
    layer('soil', 'soil', yP, yS);
    // moss, a stone, a fittonia and a little fern
    for (let i = 0; i < (k.hi ? 7 : 4); i++) {
      const a = rand() * TAU, r = rin(yS) * 0.6 * Math.sqrt(rand());
      const g = blobGeo(0.025 + 0.015 * rand(), { segs: k.seg(12, 6), rings: k.seg(7, 4), amp: 0.15, scale: [1, 0.35, 1], seed: i });
      k.add('moss', 'plant-leaf-light', g.translate(Math.cos(a) * r, yS + 0.002, Math.sin(a) * r), C('#6f9a3a'));
    }
    k.add('stone', 'granite-grey', blobGeo(0.022, { segs: k.seg(10, 6), rings: k.seg(7, 4), amp: 0.2, scale: [1.3, 0.8, 1], seed: 9 }).translate(R * 0.3, yS + 0.012, R * 0.25));
    for (let i = 0; i < (k.hi ? 14 : 8); i++) {
      const yaw = i * GOLD;
      k.add('fittonia', 'plant-leaf', placeLeaf(leafPart(0.03, 0.022, { nu: k.hi ? 3 : 2, nv: k.hi ? 3 : 2, droop: 0.2, fold: 0.15, outline: OVAL }), [-R * 0.3, yS + 0.012 + rand() * 0.02, -R * 0.1], yaw, 0.2 + 0.5 * rand(), 0), C('#4f7a46'));
    }
    for (let i = 0; i < 4; i++) frond(k, [R * 0.15, yS, -R * 0.35], i * 1.6 + 0.5, { len: 0.09, pitch: 1.0, arch: 0.4, n: k.hi ? 9 : 5, leafLen: 0.015, leafW: 0.35, ang: 1.2, droop: 0.05, rachis: 0.001, ov: C('#4f8a35'), nu: 1, nv: 1, fold: 0.1 });
    rosette(k, 'rosette', 'plant-leaf-light', C('#9ab2a2'), R * 0.05, yS, R * 0.35, 0.025, { rings: 3, perRing: k.hi ? 8 : 5 });
    recentre(k);
    return k.group();
  },
});

const ladderShelf = item({
  id: 'plant-ladder-shelf', category: 'plants', ko: '사다리 화분 선반', en: 'Ladder plant stand', size: [0.65, 1.15, 0.55],
  bboxSlack: [0.08, 0.06, 0.06],
  params: [
    P.len('width', '폭', 'Width', 0.6, 0.4, 1.0),
    P.mat('wood', '목재', 'Wood', 'wood-pine', 'wood'),
    seedP(),
  ],
  tags: ['plant stand', 'ladder shelf', 'plants', '화분 선반', '사다리 선반', '플랜트 스탠드', '식물'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 251);
    const W = p.width, H = 1.05, D = 0.5;
    // A-frame sides: front leg leaning back, back leg leaning forward
    const zF0 = D / 2, zF1 = -0.02, zB0 = -D / 2, zB1 = -0.06;
    const leg = (x, z0, z1) => { const len = Math.hypot(H, z1 - z0); k.box('frame', p.wood, 0.03, len, 0.04, x, H / 2, (z0 + z1) / 2, { r: 0.004, rx: Math.atan2(z1 - z0, H) }); };
    for (const sx of [-1, 1]) { leg(sx * (W / 2 - 0.015), zF0, zF1); leg(sx * (W / 2 - 0.015), zB0, zB1); }
    const zAt = (z0, z1, y) => lerp(z0, z1, y / H);
    const shelves = [0.22, 0.52, 0.82];
    for (const y of shelves) {
      const zf = zAt(zF0, zF1, y) - 0.02, zb = zAt(zB0, zB1, y) + 0.02;
      k.box('shelves', p.wood, W - 0.06, 0.02, zf - zb, 0, y, (zf + zb) / 2, { r: 0.003 });
    }
    k.box('frame', p.wood, W - 0.06, 0.04, 0.02, 0, H - 0.04, -0.04, { r: 0.003 });
    const top = (y) => y + 0.01;
    const zc = (y) => (zAt(zF0, zF1, y) + zAt(zB0, zB1, y)) / 2;
    // bottom: snake plant + trailing pothos; middle: fern; top: small rosette + trailing ivy
    const s0 = addPot(k, { r: 0.07, h: 0.13, style: 'cylinder', mat: 'ceramic-white', x: -W * 0.22, z: zc(0.22), y0: top(0.22) });
    for (let i = 0; i < (k.hi ? 7 : 5); i++) {
      const yaw = i * GOLD;
      k.add('leaves', 'plant-leaf', placeLeaf(leafPart(0.22 + 0.08 * rand(), 0.04, { nu: 2, nv: k.hi ? 5 : 3, droop: 0.05, fold: 0.3, outline: STRAP }), [-W * 0.22 + Math.sin(yaw) * 0.025, s0 - 0.01, zc(0.22) + Math.cos(yaw) * 0.025], yaw, 1.3 + rand() * 0.15, 0), C('#2f4f2c'));
    }
    const trailing = (x, z, y0, soil, n, drop) => {
      for (let i = 0; i < n; i++) {
        const a = 0.4 + i * 0.6 + rand() * 0.3, c = Math.sin(a) * 0.6, sn = Math.abs(Math.cos(a)) * 0.3 + 0.7;
        const pts = [[x, soil + 0.01, z], [x + c * 0.07, soil + 0.02, z + sn * 0.07], [x + c * 0.09, y0 - 0.005, z + sn * 0.11], [x + c * 0.1, y0 - drop * 0.5, z + sn * 0.13], [x + c * 0.12, y0 - drop, z + sn * 0.14]];
        const cv = curveOf(pts);
        k.tube('stems', 'plant-leaf', null, 0.0016, { curve: cv, segs: k.seg(16, 6), radial: 3, ...STEM });
        for (let j = 0; j < (k.hi ? 9 : 5); j++) { const at = cv.getPointAt(0.1 + 0.88 * j / 9); k.add('leaves-light', 'plant-leaf-light', placeLeaf(leafPart(0.045, 0.035, { nu: 2, nv: 2, droop: 0.3, fold: 0.15, outline: HEART }), at.toArray(), (j % 2 ? 1 : -1) * 1.2, -0.5, 0), C('#5f9a3a')); }
      }
    };
    const s1 = addPot(k, { r: 0.065, h: 0.11, style: 'bowl', mat: 'ceramic-terracotta', x: W * 0.2, z: zc(0.22), y0: top(0.22) });
    trailing(W * 0.2, zc(0.22), top(0.22), s1, k.hi ? 4 : 3, 0.18);
    const s2 = addPot(k, { r: 0.075, h: 0.12, style: 'taper', mat: 'ceramic-terracotta', x: 0, z: zc(0.52), y0: top(0.52) });
    for (let i = 0; i < (k.hi ? 12 : 7); i++) frond(k, [Math.sin(i) * 0.015, s2, zc(0.52) + Math.cos(i) * 0.015], i * GOLD, { len: 0.25, pitch: 0.9, arch: 0.7, n: k.hi ? 14 : 7, leafLen: 0.03, leafW: 0.35, ang: 1.2, droop: 0.1, rachis: 0.0015, mat: 'plant-leaf-light', ov: C('#5f9a3a'), nu: 1, nv: 2, fold: 0.1, outline: OVAL_TIP, role: 'leaves-light' });
    const s3 = addPot(k, { r: 0.055, h: 0.09, style: 'cylinder', mat: 'ceramic-white', x: -W * 0.18, z: zc(0.82), y0: top(0.82) });
    rosette(k, 'leaves-light', 'plant-leaf-light', C('#5f9a3a'), -W * 0.18, s3, zc(0.82), 0.05, { rings: 3, perRing: k.hi ? 9 : 6 });
    const s4 = addPot(k, { r: 0.055, h: 0.09, style: 'bowl', mat: 'ceramic-terracotta', x: W * 0.2, z: zc(0.82), y0: top(0.82) });
    trailing(W * 0.2, zc(0.82), top(0.82), s4, 3, 0.22);
    recentre(k);
    return k.group();
  },
});

const grassTrough = item({
  id: 'plant-grass-trough', category: 'plants', ko: '그라스 화단 플랜터', en: 'Ornamental grass trough', size: [1.445, 1.052, 0.781],
  bboxSlack: [0.12, 0.08, 0.12],
  params: [
    P.len('width', '폭', 'Width', 1.0, 0.6, 1.8),
    P.mat('planter', '플랜터 재질', 'Planter', 'concrete', null),
    P.bool('plumes', '이삭', 'Plumes', true),
    seedP(),
  ],
  tags: ['ornamental grass', 'planter', 'trough', '그라스', '억새', '플랜터', '화단'],
  build: (p, ctx) => {
    const k = new Kit(ctx);
    const rand = rng(p.seed * 257);
    const W = p.width, D = 0.36, Hp = 0.4;
    k.slab('planter', p.planter, frameShape(W, D, 0.025, 0.025, 0.01), Hp, 0, { bevel: 0.004 });
    k.box('planter', p.planter, W - 0.04, 0.03, D - 0.04, 0, 0.015, 0, { r: 0.002 });
    k.box('soil', 'soil', W - 0.052, 0.012, D - 0.052, 0, Hp - 0.026, 0, { r: 0 });
    const soil = Hp - 0.02;
    const clumps = Math.max(2, Math.round(W / 0.27));
    for (let c = 0; c < clumps; c++) {
      const cx = -W / 2 + W * (c + 0.5) / clumps + (rand() - 0.5) * 0.04, cz = (rand() - 0.5) * 0.08;
      const n = k.hi ? 50 : 22;
      for (let i = 0; i < n; i++) {
        const yaw = rand() * TAU, r = 0.04 * Math.sqrt(rand());
        const L = 0.3 + 0.2 * rand();
        k.add('grass', 'plant-leaf-light', placeLeaf(leafPart(L, 0.009, { nu: 1, nv: k.hi ? 6 : 3, droop: 0.25 + 0.3 * rand(), fold: 0.4, twist: (rand() - 0.5), outline: STRAP }), [cx + Math.sin(yaw) * r, soil, cz + Math.cos(yaw) * r], yaw, 1.15 + 0.35 * rand(), 0), C(c % 2 ? '#7f9a4c' : '#93a35a'));
      }
      if (p.plumes) for (let i = 0; i < (k.hi ? 6 : 3); i++) {
        const yaw = rand() * TAU, lean = 0.1 + 0.2 * rand(), h = 0.5 + 0.12 * rand();
        const base = [cx, soil, cz], tip = [cx + Math.sin(yaw) * Math.sin(lean) * h, soil + Math.cos(lean) * h, cz + Math.cos(yaw) * Math.sin(lean) * h];
        k.rod('plume-stems', 'plant-leaf-light', base, tip, 0.0015, { segs: 3, ...C('#b5a878') });
        const g = blobGeo(0.02, { segs: k.seg(8, 5), rings: k.seg(8, 4), amp: 0.2, scale: [0.6, 3, 0.6], seed: i + c });
        k.add('plumes', 'plant-leaf-light', frameOrient(g.rotateX(Math.PI / 2), tip, V3(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]), UP), C('#dccca0'));
      }
    }
    recentre(k);
    return k.group();
  },
});

/* ============================================================ variants */

const byId = (id) => BASE.find((e) => e.id === id);
const [monstera, fiddle, snake, succulent, hanging, olive] = ['monstera', 'fiddle-leaf-fig', 'snake-plant', 'succulent', 'hanging-plant', 'olive-tree'].map(byId);

const VARIANTS = [
  variant(monstera, 'large', '대형 몬스테라', 'Large monstera', { height: 1.5, leaves: 13, pot: 'belly', potMaterial: 'ceramic-white', seed: 4 }, { tags: ['large', '대형'] }),
  variant(monstera, 'small', '미니 몬스테라', 'Small monstera', { height: 0.6, leaves: 6, pot: 'cylinder', potMaterial: 'ceramic-terracotta', seed: 7 }, { tags: ['small', '미니'] }),
  variant(fiddle, 'small', '떡갈고무나무(소형)', 'Small fiddle leaf fig', { height: 1.0, potMaterial: 'ceramic-terracotta', seed: 5 }, { tags: ['small', '소형'] }),
  variant(snake, 'tall', '산세베리아(대형, 초록)', 'Tall green snake plant', { height: 1.2, leaves: 14, edge: false, potMaterial: 'ceramic-matte', seed: 3 }, { tags: ['tall', '대형'] }),
  variant(olive, 'small', '올리브 나무(소형)', 'Small olive tree', { height: 1.2, planter: 'ceramic-terracotta', seed: 6 }, { tags: ['small', '소형', 'terracotta', '테라코타'] }),
  variant(succulent, 'pink', '다육식물(핑크)', 'Pink succulent', { tint: '#c99aa8', potMaterial: 'ceramic-white', seed: 3 }, { tags: ['pink', '핑크'] }),
  variant(hanging, 'long', '행잉 플랜트(긴 덩굴)', 'Long trailing hanging plant', { hanger: 0.35, trail: 1.0, potMaterial: 'ceramic-white', seed: 4 }, { tags: ['long', '긴 덩굴'] }),
  variant(rubberPlant, 'burgundy', '고무나무(버건디)', 'Burgundy rubber plant', { leafColor: '#3b1f24', potMaterial: 'ceramic-white', seed: 3 }, { tags: ['burgundy', '버건디', '흑고무나무'] }),
  variant(calathea, 'pink', '칼라데아 오르나타(핑크 줄무늬)', 'Pink-striped calathea', { leafColor: '#24392a', stripeColor: '#d9909f', seed: 2 }, { tags: ['ornata', 'pink', '오르나타', '핑크'] }),
  variant(hydrangea, 'pink', '수국(분홍)', 'Pink hydrangea', { flowerColor: '#e79ab9', potMaterial: 'ceramic-white', seed: 3 }, { tags: ['pink', '분홍'] }),
  variant(tulipsVase, 'yellow', '튤립 꽃병(노랑)', 'Yellow tulips in vase', { flowerColor: '#f2c537', stems: 9, seed: 2 }, { tags: ['yellow', '노랑'] }),
  variant(orchid, 'pink', '호접란(분홍)', 'Pink phalaenopsis orchid', { flowerColor: '#d97bb0', lipColor: '#9a2a6a', seed: 2 }, { tags: ['pink', '분홍'] }),
  variant(birdOfParadise, 'large', '극락조화(대형)', 'Large bird of paradise', { height: 2.0, flower: false, seed: 4 }, { tags: ['large', '대형'] }),
  variant(arecaPalm, 'small', '아레카야자(소형)', 'Small areca palm', { height: 1.0, pot: 'taper', potMaterial: 'ceramic-terracotta', seed: 3 }, { tags: ['small', '소형'] }),
  variant(peaceLily, 'large', '스파티필름(대형)', 'Large peace lily', { height: 1.1, flowers: 6, potMaterial: 'ceramic-matte', seed: 5 }, { tags: ['large', '대형'] }),
  variant(saguaro, 'tall', '기둥 선인장(대형)', 'Tall column cactus', { height: 1.6, arms: 3, potMaterial: 'ceramic-matte', seed: 2 }, { tags: ['tall', '대형'] }),
];

export const ITEMS = [
  rubberPlant, moneyTree, dracaena, yucca, ponytailPalm,
  arecaPalm, kentiaPalm, parlourPalm,
  birdOfParadise, bananaPlant, philodendron, zzPlant, peaceLily, calathea, alocasia, anthurium, birdsNestFern,
  aloeVera, jadePlant, echeveriaPlanter, saguaro, barrelCactus, pricklyPear, cactusTrio,
  bonsai, herbTrio, luckyBamboo, bambooPlanter,
  bostonFern, stringOfPearls, kokedama, pothosShelf, staghornFern, mossWall,
  orchid, koreanOrchid, lavender, hydrangea, tulipsVase, cherryBranches,
  airPlants, terrarium, ladderShelf, grassTrough,
  ...VARIANTS,
];
